// worker.mjs — the session pod's whole job: long-poll the control plane for a turn, run it through the
// SAME driver.mjs the local executor uses, and stream every event home. The build is byte-identical to
// a local one in everything but where the process lives.
//
// Pull-based on purpose. The pod dials OUT (via the cluster's NAT) to the public control-plane URL, so
// the control plane needs no route into the cluster, no VPC egress, no service mesh. A pod that dies
// simply stops polling; the server's exit handling and the next turn's ensureSessionPod cover the rest.
//
//   env: KF_SESSION_ID · KF_SESSION_SLUG · KF_WORKER_TOKEN · KF_CP_URL
//   locally testable: node worker.mjs with those env vars against `node control-plane/dev.mjs`

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync, unlinkSync, watch } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Conductor } from "./driver.mjs";
import { shq } from "../engine/connect.mjs";
import { assembleRun, indexOf } from "../engine/proto-assemble.mjs";
import { assemblePrototype, revertUnfinishedMigration } from "../engine/proto-react.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, "..");
const REPO = process.env.KF_WORKER_REPO ? resolve(process.env.KF_WORKER_REPO) : resolve(PLUGIN_DIR, "..", "..");

const CP = (process.env.KF_CP_URL || "").replace(/\/$/, "");
const SID = process.env.KF_SESSION_ID;
const SLUG = process.env.KF_SESSION_SLUG;
const TOKEN = process.env.KF_WORKER_TOKEN;
const IDLE_MS = +(process.env.KF_POD_IDLE_MS || 30 * 60 * 1000);  // pod-per-session: stay warm between turns
if (!CP || !SID || !TOKEN) { console.error("worker: KF_CP_URL, KF_SESSION_ID, KF_WORKER_TOKEN are required"); process.exit(2); }

const api = async (path, opts = {}) => {
  const r = await fetch(`${CP}${path}`, {
    ...opts,
    headers: { "content-type": "application/json", "x-worker-token": TOKEN, ...(opts.headers || {}) },
  });
  if (r.status === 403) { console.error("worker: token rejected — a newer pod owns this session; exiting"); process.exit(0); }
  return r;
};

// ── ordered event shipping, with a spool that makes dropping impossible ─────────────────────────
// Events MUST land in order or the transcript interleaves; one in-flight POST at a time, batched.
// The old policy dropped a batch after five attempts (~7.5s) — a control-plane restart slightly
// slower than that silently ate mid-build prose. Now a failing batch is spooled to the WORKSPACE
// DISK (the session PVC, so it survives even this pod dying mid-outage) and retried forever with
// capped backoff. The transcript is the product; losing pieces of it is not a policy.
const SPOOL = join(REPO, "runs", `.event-spool-${SID}.jsonl`);
let queue = [], shipping = Promise.resolve();
try {
  if (existsSync(SPOOL)) {
    queue = readFileSync(SPOOL, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    console.log(`worker: recovered ${queue.length} spooled event(s) from a previous life`);
  }
} catch (e) { console.warn(`worker: spool unreadable, starting empty: ${e.message}`); }
const spoolPending = () => queue.length > 0 || spoolOnDisk;
let spoolOnDisk = existsSync(SPOOL);
function ship(ev, data) {
  queue.push({ ev, data });
  shipping = shipping.then(flush).catch(() => {});
}
async function flush() {
  if (!queue.length) return;
  const batch = queue; queue = [];
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await api(`/worker/${SID}/events`, { method: "POST", body: JSON.stringify({ events: batch }) });
      if (r.ok) {
        if (spoolOnDisk) { try { unlinkSync(SPOOL); } catch {} spoolOnDisk = false; }
        return;
      }
    } catch { /* the server is unreachable — spool and keep trying */ }
    try {
      mkdirSync(join(REPO, "runs"), { recursive: true });
      writeFileSync(SPOOL, [...batch, ...queue].map((e) => JSON.stringify(e)).join("\n") + "\n");
      spoolOnDisk = true;
    } catch { /* no disk either — the in-memory copy is still the retry source */ }
    await new Promise((res) => setTimeout(res, Math.min(30_000, 500 * 2 ** Math.min(attempt, 6))));
  }
}

// ── artifact shipping ─────────────────────────────────────────────────────────────────────────────
// The preview pane, version snapshots and publish-to-GCS all read the CONTROL PLANE's disk; the build
// writes to THIS pod's. Ship each artifact when the builder declares it, and the known set at turn-end.
const shippedAt = new Map();
// Returns TRUE only when the bytes are confirmed stored (a 2xx), so callers can gate a preview
// announcement on a real upload (Codex #5). Before this it swallowed read/network/non-2xx failures and
// returned nothing, so the parts-stream announced a preview for bytes that never uploaded and then
// suppressed the retry.
async function shipFile(rel) {
  const abs = join(REPO, rel);
  try {
    const st = statSync(abs);
    if (st.size > 8 * 1024 * 1024) return false;               // an 8MB+ "artifact" is a mistake, not a page
    if (shippedAt.get(rel) === st.mtimeMs) return true;        // this exact version already stored — a success
    const content = readFileSync(abs);
    const r = await api(`/worker/${SID}/file`, { method: "POST", body: JSON.stringify({ path: rel, content_b64: content.toString("base64") }) });
    if (r.ok) { shippedAt.set(rel, st.mtimeMs); return true; }
    return false;                                              // non-2xx — NOT stored; do not announce it, let the next tick retry
  } catch { return false; /* absent/unreadable/network — not stored */ }
}
async function shipKnownArtifacts() {
  const base = `runs/${SLUG}`;
  // RR-4: proto.json + migration.json ride alongside the compiled index/specs so the control-plane run
  // bundle holds the CANONICAL react source produced in the pod (needed for regeneration + preview/deploy reuse).
  for (const f of ["prototype/index.html", "prototype/experience-spec.json", "prototype/proto.json", "prototype/migration.json", "review.html", "blueprint.html", "app-spec.json", "live.md", "id-map.json"])
    await shipFile(`${base}/${f}`);
  const parts = join(REPO, base, "prototype", "parts");
  if (existsSync(parts)) for (const f of readdirSync(parts)) if (f.endsWith(".html")) await shipFile(`${base}/prototype/parts/${f}`);
  // …and every react page the agent authored (the design-agent source of truth).
  const pages = join(REPO, base, "prototype", "pages");
  if (existsSync(pages)) for (const f of readdirSync(pages)) if (f.endsWith(".jsx")) await shipFile(`${base}/prototype/pages/${f}`);
}

// SHELL-FIRST STREAMING (Codex continuation #3). The inline executor watches prototype parts and the V2
// worker has startPartsStream(); the pod worker had NEITHER, so under KF_CHAT_EXECUTOR=pod the express
// promise — compile the shell immediately, splice each role part in as it lands — depended entirely on the
// model remembering to emit a `preview` marker, and otherwise showed nothing until turn-end. This is the
// SAME host-owned mechanism: watch the parts dir, re-assemble through the SAME assembleRun boundary on
// every write, ship the freshly compiled index.html, then ship a `preview` marker so the pane refreshes.
function startPartsStream(runDir) {
  // Watch the whole prototype dir (recursive), MEDIUM-AWARE: html writes parts/*.html, react writes
  // pages/*.jsx + proto.json. assemblePrototype dispatches on the run's medium, so one watch drives both.
  const watchDir = join(runDir, "prototype");
  const relevant = (n) => n.endsWith(".html") || n.endsWith(".jsx") || n.endsWith("proto.json");
  const rel = (abs) => abs.slice(REPO.length + 1);
  const previewPath = `runs/${SLUG}/prototype/index.html`;
  let watcher = null, t = null, pollT = null, assembling = false, lastShipped = 0;
  const splice = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (assembling) { splice(); return; }               // a write landed mid-assemble — re-run after it settles
      assembling = true;
      try {
        if (!(await assemblePrototype(runDir))) return;    // nothing assembled yet (no shell/ui-spec) — wait for more
        const idx = indexOf(runDir);
        const mt = (() => { try { return statSync(idx).mtimeMs; } catch { return 0; } })();
        if (mt && mt !== lastShipped) {                    // a genuinely new compile
          // Announce the preview ONLY after the bytes are CONFIRMED uploaded (#5), and advance lastShipped
          // only then — so a failed upload neither fakes a preview nor blocks the retry on the next tick.
          if (await shipFile(rel(idx))) { ship("marker", { kind: "preview", value: previewPath }); lastShipped = mt; }
        }
      } catch (e) { console.warn(`  [${SLUG}] parts-stream assemble: ${e.message}`); }
      finally { assembling = false; }
    }, 250);
  };
  // Fallback for when fs.watch is unavailable or errors (pod descriptor pressure) — poll the parts so the
  // stream keeps working instead of going silent until a marker/turn-end (#5, same principle as the inline
  // host). Bounded: torn down with the stream at turn end.
  const startPoll = () => { if (pollT) return; console.warn(`  [${SLUG}] parts-stream watch unavailable — polling fallback (degraded)`); pollT = setInterval(splice, 1500); pollT.unref?.(); };
  try {
    mkdirSync(watchDir, { recursive: true });              // watch needs it to exist before the first artifact lands
    watcher = watch(watchDir, { recursive: true }, (_e, name) => { if (name && relevant(String(name).replace(/\\/g, "/"))) splice(); });
    watcher.on("error", (e) => { console.warn(`  [${SLUG}] parts-stream watch error: ${e.message}`); try { watcher?.close(); } catch {} watcher = null; startPoll(); });
  } catch (e) { console.warn(`  [${SLUG}] parts-stream watch create failed (${e.message})`); startPoll(); }
  return {
    stop() { try { clearTimeout(t); } catch {} try { clearInterval(pollT); } catch {} try { watcher?.close(); } catch {} },
    // RR-2: drain the pending debounce + any in-flight assembly, run ONE final assembly, and ship the
    // result before the turn ends — a page written in the last 250ms is not lost, and the pod uploads the
    // freshly-built index.html, not the previous one. Awaited by the caller before shipKnownArtifacts.
    async flushAndStop() {
      try { clearTimeout(t); } catch {}
      try { clearInterval(pollT); } catch {}
      while (assembling) await new Promise((r) => setTimeout(r, 50));   // let an in-flight splice settle
      try {
        if (await assemblePrototype(runDir, { final: true })) {   // #5: terminal build enforces the runtime smoke
          const idx = indexOf(runDir);
          const mt = (() => { try { return statSync(idx).mtimeMs; } catch { return 0; } })();
          if (mt && mt !== lastShipped && await shipFile(rel(idx))) { ship("marker", { kind: "preview", value: previewPath }); lastShipped = mt; }
        }
      } catch (e) { console.warn(`  [${SLUG}] final assemble: ${e.message}`); }
      try { watcher?.close(); } catch {}
    },
  };
}

// ── the conductor, events forwarded verbatim ──────────────────────────────────────────────────────
let conductor = null, turnDone = null;
function conductorFor(env, claudeSessionId) {
  if (conductor) return conductor;
  const c = new Conductor({
    id: SID, repoRoot: REPO, systemPrompt: join(HERE, "CONDUCTOR.md"),
    pluginDir: PLUGIN_DIR, model: process.env.KF_CHAT_MODEL || "sonnet",
    claudeSessionId: claudeSessionId || undefined, env,
  });
  for (const ev of ["claude-session", "spawn", "ready", "text", "agent", "agent-done", "thinking", "tool", "tool-result", "queued", "error"])
    c.on(ev, (d) => ship(ev, d));
  c.on("stderr", (line) => console.warn(`  [${SLUG}] ${String(line).slice(0, 300)}`));
  // markers drive the UI *and* tell us an artifact just landed on this disk — ship it before the
  // marker event, so by the time the control plane emits "preview" its copy of the file exists
  c.on("marker", async (m) => {
    // An artifact marker tells the browser to LOAD a file. Emit it only after that file is confirmed
    // uploaded (Codex #5) — a failed/non-2xx upload must not announce stale or absent bytes. The parts-
    // stream re-emits preview on its next assemble, and shipKnownArtifacts re-ships at turn-end, so a
    // transient failure recovers rather than showing a broken pane. Non-artifact markers ship as-is.
    if (m.kind === "preview" || m.kind === "blueprint") {
      if (!(await shipFile(String(m.value || "").replace(/^\.?\//, "")))) return;
    }
    ship("marker", m);
  });
  c.on("fatal", (msg) => { ship("fatal", msg); turnDone?.({ kind: "fatal" }); });
  // Codex #1: do NOT ship turn-end here. The terminal event must land AFTER the final React assembly, or
  // the control plane can finalize/version the PREVIOUS prototype before the last JSX write is built and
  // uploaded. Signal the main loop with the result; it flushes, ships artifacts, THEN ships turn-end.
  c.on("turn-end", (r) => { turnDone?.({ kind: "turn-end", r }); });
  c.on("exit", (d) => { ship("exit", d); turnDone?.({ kind: "exit" }); });
  conductor = c;
  return c;
}

// ── main loop ─────────────────────────────────────────────────────────────────────────────────────
console.log(`worker: session ${SID} (${SLUG}) → ${CP}`);
let lastWork = Date.now();
for (;;) {
  // The idle check lives at the TOP of the loop so no branch below — error, empty poll, malformed
  // reply — can skip it. Its old home was inside the 204 branch, which a server bug (204 with a
  // content-length) prevented from ever being reached: pods lived forever.
  if (!conductor?.busy && Date.now() - lastWork > IDLE_MS && !spoolPending()) { console.log("worker: idle — shutting down"); process.exit(0); }
  let r;
  try { r = await api(`/worker/${SID}/turn`); }
  catch { await new Promise((res) => setTimeout(res, 3000)); continue; }
  if (r.status === 204) continue;                          // older servers; body-less by then, harmless
  if (!r.ok) { await new Promise((res) => setTimeout(res, 2000)); continue; }
  const { turn } = await r.json().catch(() => ({}));
  if (!turn) continue;
  lastWork = Date.now();
  // Engine scripts historically source .kf-env; the conductor also looks for it as proof a Kissflow
  // account is wired. Materialize it from the turn's credentials so both conventions hold in a pod —
  // and now it lands on the session PVC, so it survives the pod too.
  if (turn.env?.KISSFLOW_API_KEY) {
    try {
      // Every value goes through shq() — this file is SOURCED by the engine scripts, and a credential
      // (or a subdomain) carrying a shell metacharacter would otherwise execute (#6, same fix as the
      // connect.mjs writer). Readers decode it with parseEnvText, so the quoting round-trips.
      writeFileSync(join(REPO, ".kf-env"), [
        "# written by the session worker from the project's linked dev environment",
        `export KISSFLOW_SUBDOMAIN=${shq(turn.env.KISSFLOW_SUBDOMAIN)}`,
        `export KISSFLOW_ACCOUNT_ID=${shq(turn.env.KISSFLOW_ACCOUNT_ID)}`,
        `export ACCOUNT_ID=${shq(turn.env.KISSFLOW_ACCOUNT_ID)}`,
        `export KISSFLOW_API_KEY=${shq(turn.env.KISSFLOW_API_KEY)}`,
        `export API_KEY=${shq(turn.env.KISSFLOW_API_KEY)}`,
        `export KISSFLOW_API_SECRET=${shq(turn.env.KISSFLOW_API_SECRET)}`,
        `export API_SECRET=${shq(turn.env.KISSFLOW_API_SECRET)}`,
        `export KF_TARGET=${shq(turn.env.KF_TARGET || "dev")}`,
        "",
      ].join("\n"), { mode: 0o600 });
    } catch (e) { console.warn(`worker: could not write .kf-env: ${e.message}`); }
  }
  // uploaded specs (and anything else the server staged for this turn) land on OUR disk first, so
  // the build can Read them like any local file
  for (const rel of turn.files || []) {
    try {
      const r = await api(`/worker/${SID}/file?path=${encodeURIComponent(rel)}`);
      if (!r.ok) { console.warn(`worker: fetch ${rel} → ${r.status}`); continue; }
      const abs = join(REPO, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, Buffer.from(await r.arrayBuffer()));
    } catch (e) { console.warn(`worker: fetch ${rel} failed: ${e.message}`); }
  }
  const done = new Promise((res) => (turnDone = res));
  // Stream the prototype shell-first for THIS turn (continuation #3), then tear the watcher down so it
  // never outlives the turn that owns it.
  const stream = startPartsStream(join(REPO, "runs", SLUG));
  conductorFor({ ...process.env, ...(turn.env || {}), KF_CHAT: "1" }, turn.claudeSessionId).send(turn.prompt);
  const outcome = await done;
  // Codex #1 — strict terminal ordering: (1) conductor completion received above; (2) flush the stream so
  // the LAST JSX write is assembled + the fresh index uploaded; (3) re-ship every known artifact; (4) only
  // now ship turn-end so the control plane versions the just-built prototype, not the previous one;
  // (5) drain the shipping queue before polling again.
  await stream.flushAndStop();                                  // RR-2 + #1: final assembly + ship the fresh index
  if (outcome?.kind === "turn-end") {                           // fatal/exit already shipped their own terminal event
    // Mirror the host (app.mjs turn-end): a Q&A turn that BEGAN a migration but built no react prototype
    // must be undone on the pod's OWN persistent workspace too — otherwise a stale {react,building} on the
    // PVC would make the NEXT turn wrongly build react (the host revert never reaches the pod disk).
    try { revertUnfinishedMigration(join(REPO, "runs", SLUG)); } catch { /* nothing to revert */ }
    await shipKnownArtifacts();
    ship("turn-end", outcome.r);
  }
  turnDone = null;
  lastWork = Date.now();
  await shipping;                                               // everything shipped before we poll again
}
