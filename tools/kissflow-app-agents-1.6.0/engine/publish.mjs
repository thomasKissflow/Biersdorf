// publish.mjs — after a build, push a run's artifacts and REGISTER a version with the control plane,
// so it appears in the app's Versions list. Authenticated with the project-scoped KF_API_TOKEN that
// connect.mjs wrote into .kf-env. Called by author-generate (or manually).
//
//   node engine/publish.mjs <runDir> [--label "v3 — adds approvals"]
// env (from .kf-env): CONTROL_PLANE_URL, KF_API_TOKEN, KF_PROJECT_ID, KF_GCS_BUCKET, KF_GCS_PREFIX
//
// Upload modes (KF_PUBLISH_UPLOAD overrides; default "cp"):
//   cp    (default): upload bytes THROUGH the control plane (POST /projects/:id/artifacts) — needs only
//         the project token every connected session already has. The server writes to GCS via its SA.
//   gcs   : legacy direct upload via `gcloud storage cp` — needs gcloud + bucket IAM (admin machines).
//   local : register local file paths (single-machine dev).
//   none  : register-only — the version lists but every artifact link is DEAD. Must be EXPLICIT; this
//           used to be a silent fallback and produced "artifact not available yet" for whole teams.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { atomicWrite } from "./proto-assemble.mjs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// the engine's own version (ships in package.json beside this file) — stamped onto every
// registered version so appbuilder can flag projects still publishing from stale engines
let ENGINE_VERSION = null;
try { ENGINE_VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "package.json"), "utf8")).version || null; } catch { /* best effort */ }

const runDir = process.argv[2] || "runs/current";
const flag = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
let { CONTROL_PLANE_URL, KF_API_TOKEN, KF_PROJECT_ID, KF_GCS_BUCKET, KF_GCS_PREFIX = "" } = process.env;

// artifacts we know how to publish, mapped to a stable name in the version record. First existing path
// per stable name wins (so the parallel prototype at prototype-par/ is picked up too).
const ARTIFACT_CANDIDATES = [
  ["ir", ["app-spec.json"]],
  ["prototype", ["prototype/index.html", "prototype-par/index.html"]],
  ["review", ["review.html"]],
];
const ARTIFACTS = ARTIFACT_CANDIDATES.flatMap(([name, paths]) => { const hit = paths.find((p) => existsSync(join(runDir, p))); return hit ? [[hit, name]] : []; });

function hasGcloud() { try { execFileSync("gcloud", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } }

// every *.json under generated/ (apply logs, id maps) — small files worth keeping with the version
function generatedFiles() {
  const dir = join(runDir, "generated");
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d, rel) => { for (const f of readdirSync(d)) { const p = join(d, f), r = rel + "/" + f;
    if (statSync(p).isDirectory()) walk(p, r); else if (f.endsWith(".json") && statSync(p).size < 2 * 1024 * 1024) out.push(r); } };
  walk(dir, "generated");
  return out;
}

async function main() {
  if (!CONTROL_PLANE_URL || !KF_API_TOKEN || !KF_PROJECT_ID) {
    // NOT connected. Instead of the old warn-and-skip (which is exactly why users never pushed —
    // it meant "go run /author-setup, then come back and re-run"), SELF-CONNECT right here: one browser
    // approval, then continue to push. --no-connect (or KF_PUBLISH_NO_CONNECT) preserves the CI skip.
    if (process.argv.includes("--no-connect") || process.env.KF_PUBLISH_NO_CONNECT) {
      console.error("publish: not connected + --no-connect → skipping (build stays local-only).");
      process.exit(0);
    }
    try {
      const { connect, connectAuto, writeEnv } = await import("./connect.mjs");
      // HEADLESS path first: if KF_CONNECT_TOKEN is set (a connect token/URL from the appbuilder), redeem
      // it with NO browser. Otherwise fall back to the one-time browser approval.
      let config;
      if (process.env.KF_CONNECT_TOKEN) {
        console.error("publish: not linked — redeeming KF_CONNECT_TOKEN (headless, no browser)…");
        config = await connect({ token: process.env.KF_CONNECT_TOKEN, base: process.env.CONTROL_PLANE_URL });
      } else {
        console.error("publish: not linked to appbuilder yet — opening a ONE-TIME browser approval (or set KF_CONNECT_TOKEN to connect headlessly)…");
        // connectAuto() returns the {mode, config} ENVELOPE; connect() (headless, above) returns the flat
        // config. Unwrap so both paths hand writeEnv/the reads below the SAME flat config — otherwise the
        // browser-approval path reads config.gcs/apiToken/etc. off the envelope (all undefined) and
        // publishes with an empty .kf-env (the guard stops the crash but not the silent no-op).
        const approved = await connectAuto({ base: process.env.CONTROL_PLANE_URL, onVerify: (url) => console.error(`\n➜ Approve here (sign in, pick your project):\n  ${url}\n`) });
        config = approved?.config || approved;
      }
      writeEnv(config); // persist so it never asks again
      CONTROL_PLANE_URL = config.controlPlaneUrl; KF_API_TOKEN = config.apiToken; KF_PROJECT_ID = config.projectId;
      KF_GCS_BUCKET = config.gcs?.bucket; KF_GCS_PREFIX = config.gcs?.prefix || "";
      console.error(`publish: connected to “${config.projectName || KF_PROJECT_ID}” ✓ — pushing now (won't ask again).`);
    } catch (e) {
      console.error(`publish: connect failed (${e.message}) — build stays local-only. Re-run to retry, or --no-connect to skip.`);
      process.exit(0);
    }
  }
  const label = flag("--label") || `build ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const stamp = "v" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const mode = process.env.KF_PUBLISH_UPLOAD || "cp";

  // find which artifacts exist in this run
  const present = ARTIFACTS.filter(([rel]) => existsSync(join(runDir, rel)));
  if (!present.length) { console.error(`publish: nothing to publish in ${runDir} (no app-spec.json / review.html / prototype)`); process.exit(1); }

  // PROTOTYPE PUBLICATION GATE (#2/#4). The prototype we register as a version must be COMPILED and
  // verify-clean — never a raw Tailwind page that dies unstyled in a preview host. Prepare it through
  // the one boundary and write the compiled bytes back, so every mode below (cp/gcs/local) uploads the
  // publishable artifact. FAIL CLOSED: an unpublishable prototype aborts the whole publish — no version
  // is created, and the last good one stands.
  const protoEntry = present.find(([, name]) => name === "prototype");
  if (protoEntry) {
    const abs = join(runDir, protoEntry[0]);
    const { preparePrototypeForPublication } = await import("./proto-publish.mjs");
    const raw = readFileSync(abs, "utf8");
    const prep = await preparePrototypeForPublication(raw, { phase: "final", label: protoEntry[0] });
    if (!prep.ok) { console.error(`publish: ✗ prototype not publishable — ${prep.reason}. Fix the compile/verify error and re-run (no version was created).`); process.exit(1); }
    if (prep.html !== raw) { atomicWrite(abs, prep.html); console.log(`  prototype compiled + verified before publish (${prep.reason})`); }
  }

  const artifacts = {};

  if (mode === "cp") {
    // upload through the control plane — the ONLY leg that works from any connected session
    const files = {};
    for (const [rel] of present) files[rel] = readFileSync(join(runDir, rel)).toString("base64");
    for (const rel of generatedFiles()) files[rel] = readFileSync(join(runDir, rel)).toString("base64");
    const r = await fetch(`${CONTROL_PLANE_URL}/projects/${KF_PROJECT_ID}/artifacts`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KF_API_TOKEN}` },
      body: JSON.stringify({ stamp, files }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { console.error("publish: ✗ control-plane token expired/invalid — re-run /author-setup to reconnect, then re-run publish."); process.exit(1); }
    if (r.status === 404) { console.error("publish: ✗ control plane has no /artifacts endpoint (older deployment) — ask the owner to redeploy it, or use KF_PUBLISH_UPLOAD=gcs from a machine with gcloud + bucket IAM."); process.exit(1); }
    if (!r.ok) { console.error(`publish: ✗ artifact upload failed (${r.status}): ${j.error || ""}`); process.exit(1); }
    if (!j.artifacts || typeof j.artifacts !== "object") { console.error(`publish: ✗ control plane returned ${r.status} but no artifacts map in the body — cannot resolve hosted URLs.`); process.exit(1); }
    for (const [rel, name] of present) artifacts[name] = j.artifacts[rel];
    const gen = Object.keys(j.artifacts).filter((k) => k.startsWith("generated/"));
    if (gen.length) artifacts.generated = j.artifacts[gen[0]].replace(/\/generated\/.*$/, "/generated");
    console.log(`  uploaded ${Object.keys(j.artifacts).length} file(s) via control plane`);
  } else if (mode === "gcs") {
    if (!KF_GCS_BUCKET || !hasGcloud()) { console.error("publish: ✗ gcs mode needs KF_GCS_BUCKET + the gcloud CLI (with bucket IAM). Use the default cp mode instead."); process.exit(1); }
    for (const [rel, name] of present) {
      const uri = `gs://${KF_GCS_BUCKET}/${KF_GCS_PREFIX}versions/${stamp}/${rel}`;
      execFileSync("gcloud", ["storage", "cp", join(runDir, rel), uri], { stdio: "inherit" });
      artifacts[name] = uri;
    }
    if (existsSync(join(runDir, "generated"))) {
      execFileSync("gcloud", ["storage", "cp", "-r", join(runDir, "generated"), `gs://${KF_GCS_BUCKET}/${KF_GCS_PREFIX}versions/${stamp}/`], { stdio: "inherit" });
      artifacts.generated = `gs://${KF_GCS_BUCKET}/${KF_GCS_PREFIX}versions/${stamp}/generated`;
    }
  } else if (mode === "local") {
    for (const [rel, name] of present) artifacts[name] = join(runDir, rel); // reference the local file
  } else if (mode === "none") {
    // register-only: EXPLICIT opt-in — links will be dead until someone uploads to these exact URIs
    console.error("publish: ⚠ KF_PUBLISH_UPLOAD=none — registering URIs WITHOUT uploading. Artifact links in appbuilder will be DEAD.");
    for (const [rel, name] of present) artifacts[name] = `gs://${KF_GCS_BUCKET}/${KF_GCS_PREFIX}versions/${stamp}/${rel}`;
  } else {
    console.error(`publish: ✗ unknown KF_PUBLISH_UPLOAD mode "${mode}" (cp | gcs | local | none)`); process.exit(1);
  }

  // register the version with the control plane (project-scoped token)
  const r = await fetch(`${CONTROL_PLANE_URL}/projects/${KF_PROJECT_ID}/versions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KF_API_TOKEN}` },
    body: JSON.stringify({ label, artifacts, engine: ENGINE_VERSION }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { console.error("publish: ✗ version registration rejected — token expired/invalid. Re-run /author-setup, then re-run publish."); process.exit(1); }
  if (!r.ok) { console.error(`publish: version registration failed (${r.status}): ${j.error || ""}`); process.exit(1); }
  console.log(`✔ registered version "${label}" (upload: ${mode}) — ${Object.keys(artifacts).length} artifact(s) → project ${KF_PROJECT_ID}`);
}

main().catch((e) => { console.error("publish: " + (e?.message || e)); process.exit(1); });
