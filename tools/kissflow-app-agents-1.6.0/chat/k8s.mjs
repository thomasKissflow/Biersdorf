// k8s.mjs — the ONE thing the control plane asks of Kubernetes: a gVisor pod per session, running the
// builder image with worker.mjs as its entrypoint. Raw REST against the GKE API server — no client
// library, because the control plane's dependency budget is `jose` and `pg` and this needs four calls.
//
// Auth: GKE accepts Google OAuth tokens directly, so the Cloud Run service account's metadata-server
// token is the credential (the SA needs roles/container.developer). The API server's endpoint and CA
// come from env — deploy.sh reads them off the cluster at deploy time — so nothing here calls the GCP
// control plane at runtime.
//
// KF_POD_FAKE=1 turns every call into a no-op that reports success: the worker protocol is then fully
// exercisable locally (run worker.mjs by hand against a dev server) and in tests, with zero cluster.

import https from "node:https";

const ENDPOINT = process.env.KF_GKE_ENDPOINT || "";          // e.g. 34.93.174.206
const CA = process.env.KF_GKE_CA_B64 ? Buffer.from(process.env.KF_GKE_CA_B64, "base64") : null;
const NS = process.env.KF_POD_NAMESPACE || "default";
const IMAGE = process.env.KF_POD_IMAGE || "asia-south1-docker.pkg.dev/kf-app-builder-p001/kf-images/ai-builder:latest";
const CP_URL = process.env.KF_WORKER_CP_URL || process.env.BASE_URL || "https://aibuilder.kissflow.com";
const FAKE = process.env.KF_POD_FAKE === "1";

async function gToken() {
  const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  return (await r.json()).access_token;
}

function kreq(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: ENDPOINT, path, method,
      ca: CA || undefined,
      // no CA configured → we still refuse to run rather than silently skip verification
      rejectUnauthorized: true,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    }, (res) => {
      let buf = "";
      res.on("data", (d) => (buf += d));
      res.on("end", () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// deterministic, DNS-safe, and reversible enough for a human reading `kubectl get pods`
export const podName = (sessionId) => `kf-s-${String(sessionId).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}`;
export const pvcName = (sessionId) => `kf-ws-${String(sessionId).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}`;

/**
 * THE SESSION'S MEMORY IS A DISK, NOT A POD. Users touch a build once or twice a DAY; no idle timeout
 * short of "always on" covers "come back tomorrow", so the pod is disposable by design and everything
 * that must survive it — runs/<slug> (the working tree) and ~/.claude (the CLI transcripts that make
 * --resume true) — lives on a per-session PersistentVolumeClaim that pods mount and unmount around.
 * 5Gi of pd-balanced is ~$0.22/month per session; the alternative was losing a day-old build's context
 * every morning (capital-expenditure, 2026-07-31 — five dead "continue"s before the fallback saved it).
 */
function pvcSpec(sessionId) {
  return {
    apiVersion: "v1", kind: "PersistentVolumeClaim",
    metadata: { name: pvcName(sessionId), labels: { app: "kf-session-ws", session: podName(sessionId) } },
    spec: {
      accessModes: ["ReadWriteOnce"],
      storageClassName: process.env.KF_POD_STORAGECLASS || "dynamic-rwo",
      resources: { requests: { storage: process.env.KF_POD_WORKSPACE_SIZE || "5Gi" } },
    },
  };
}

function podSpec({ id, slug, token }) {
  return {
    apiVersion: "v1", kind: "Pod",
    metadata: { name: podName(id), labels: { app: "kf-session", session: podName(id) } },
    spec: {
      runtimeClassName: "gvisor",             // the tenant boundary — the whole reason the cluster exists
      restartPolicy: "Never",                 // a crashed builder is a turn-end, not a silent respawn
      terminationGracePeriodSeconds: 10,
      // the PVC arrives root-owned; fsGroup hands it to the node user the Dockerfile runs as
      securityContext: { fsGroup: 1000 },
      volumes: [{ name: "ws", persistentVolumeClaim: { claimName: pvcName(id) } }],
      containers: [{
        name: "builder",
        image: IMAGE,
        workingDir: "/repo",
        command: ["node", "plugins/app-agents/chat/worker.mjs"],
        // ONE disk, two mount points: the working tree the engine writes, and the CLI's home — the
        // transcripts under it are exactly what makes --resume resume instead of apologising.
        volumeMounts: [
          { name: "ws", mountPath: "/repo/runs", subPath: "runs" },
          { name: "ws", mountPath: "/home/node/.claude", subPath: "claude" },
        ],
        env: [
          { name: "KF_SESSION_ID", value: String(id) },
          { name: "KF_SESSION_SLUG", value: String(slug) },
          { name: "KF_WORKER_TOKEN", value: String(token) },
          { name: "KF_CP_URL", value: CP_URL },
          { name: "KF_CHAT_PERMISSION_MODE", value: "bypassPermissions" },
        ],
        resources: {
          requests: { cpu: "2", memory: "4Gi" },
          limits: { cpu: "2", memory: "4Gi" },
        },
      }],
    },
  };
}

/** Make sure the session's pod exists and is not already finished. Idempotent. */
export async function ensureSessionPod({ id, slug, token }) {
  if (FAKE) return { faked: true };
  if (!ENDPOINT || !CA) throw new Error("pod executor: KF_GKE_ENDPOINT / KF_GKE_CA_B64 not configured");
  const t = await gToken();
  // the disk first — the pod is meaningless without it, and creating it is idempotent (409 = exists)
  const pv = await kreq("POST", `/api/v1/namespaces/${NS}/persistentvolumeclaims`, pvcSpec(id), t);
  if (pv.status >= 300 && pv.status !== 409) throw new Error(`workspace pvc ${pv.status}: ${JSON.stringify(pv.body?.message || pv.body).slice(0, 160)}`);
  const name = podName(id);
  const cur = await kreq("GET", `/api/v1/namespaces/${NS}/pods/${name}`, null, t);
  if (cur.status === 200) {
    const phase = cur.body?.status?.phase;
    if (phase === "Running" || phase === "Pending") return { existing: true, phase };
    await kreq("DELETE", `/api/v1/namespaces/${NS}/pods/${name}`, null, t);   // Succeeded/Failed → replace
  }
  const created = await kreq("POST", `/api/v1/namespaces/${NS}/pods`, podSpec({ id, slug, token }), t);
  if (created.status >= 300 && created.status !== 409) throw new Error(`pod create ${created.status}: ${JSON.stringify(created.body?.message || created.body).slice(0, 200)}`);
  return { created: true };
}

export async function deleteSessionPod(id) {
  if (FAKE) return { faked: true };
  if (!ENDPOINT || !CA) return;
  const t = await gToken();
  await kreq("DELETE", `/api/v1/namespaces/${NS}/pods/${podName(id)}`, null, t).catch(() => {});
}

/** Only when the APP is deleted — a stopped build keeps its disk; that is the entire point of it. */
export async function deleteSessionWorkspace(id) {
  if (FAKE) return { faked: true };
  if (!ENDPOINT || !CA) return;
  const t = await gToken();
  await kreq("DELETE", `/api/v1/namespaces/${NS}/pods/${podName(id)}`, null, t).catch(() => {});
  await kreq("DELETE", `/api/v1/namespaces/${NS}/persistentvolumeclaims/${pvcName(id)}`, null, t).catch(() => {});
}
