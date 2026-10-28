// publish-qa.mjs — push a run's runtime-QA artifacts (universe, test plan, results, report) to the
// control plane and REGISTER the QA run so it appears in the project's "Runtime QA" history in
// appbuilder. Companion to publish.mjs; same project-token auth, same cp upload path.
//
//   node engine/publish-qa.mjs <runDir> [--label "post-generate QA"] [--version <seq>]
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let ENGINE_VERSION = null;
try { ENGINE_VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "package.json"), "utf8")).version || null; } catch { /* best effort */ }

const runDir = process.argv[2] || "runs/current";
const flag = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const { CONTROL_PLANE_URL, KF_API_TOKEN, KF_PROJECT_ID } = process.env;

async function main() {
  if (!CONTROL_PLANE_URL || !KF_API_TOKEN || !KF_PROJECT_ID) {
    console.error("publish-qa: NOT CONNECTED (missing CONTROL_PLANE_URL/KF_API_TOKEN/KF_PROJECT_ID) — the QA run will NOT appear in appbuilder.");
    process.exit(0);
  }
  const qa = join(runDir, "qa");
  const FILES = [["universe.json", "universe"], ["test-plan.json", "plan"], ["results.json", "results"], ["report.html", "report"]];
  const present = FILES.filter(([f]) => existsSync(join(qa, f)));
  if (!present.some(([, n]) => n === "results")) { console.error(`publish-qa: ${qa}/results.json missing — run the QA agent first`); process.exit(1); }

  // summarize results.json — expected: array or map of universe-id entries with pass|fail + evidence strength
  const results = JSON.parse(readFileSync(join(qa, "results.json"), "utf8"));
  const entries = Array.isArray(results) ? results : (results.items || Object.entries(results).map(([id, v]) => ({ id, ...v })));
  const passed = entries.filter((e) => (e.pass === true || e.status === "pass") ).length;
  const failed = entries.filter((e) => (e.fail === true || e.status === "fail")).length;
  const weak = entries.filter((e) => /weak/i.test(e.evidence_strength || e.strength || "")).length;
  const byClass = {};
  for (const e of entries) { const k = String(e.id || "").split(":")[0] || "?"; (byClass[k] = byClass[k] || { pass: 0, fail: 0 }); byClass[k][(e.pass === true || e.status === "pass") ? "pass" : "fail"]++; }
  const coverage = results.coverage ?? 100;

  // upload artifacts through the control plane
  const stamp = "qa" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const files = {};
  for (const [f] of present) files[`qa/${f}`] = readFileSync(join(qa, f)).toString("base64");
  const up = await fetch(`${CONTROL_PLANE_URL}/projects/${KF_PROJECT_ID}/artifacts`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KF_API_TOKEN}` },
    body: JSON.stringify({ stamp, files }),
  });
  const uj = await up.json().catch(() => ({}));
  if (!up.ok) { console.error(`publish-qa: ✗ artifact upload failed (${up.status}): ${uj.error || ""}`); process.exit(1); }
  const artifacts = {};
  for (const [f, name] of present) artifacts[name] = uj.artifacts[`qa/${f}`];

  const reg = await fetch(`${CONTROL_PLANE_URL}/projects/${KF_PROJECT_ID}/qa`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KF_API_TOKEN}` },
    body: JSON.stringify({ label: flag("--label") || "runtime QA", versionSeq: flag("--version") ? +flag("--version") : null,
      engine: ENGINE_VERSION, coverage, passed, failed, weak, byClass, artifacts }),
  });
  const rj = await reg.json().catch(() => ({}));
  if (reg.status === 404) { console.error("publish-qa: ✗ control plane has no /qa endpoint yet (older deployment) — redeploy it."); process.exit(1); }
  if (!reg.ok) { console.error(`publish-qa: ✗ QA-run registration failed (${reg.status}): ${rj.error || ""}`); process.exit(1); }
  console.log(`✔ QA run #${rj.run?.seq} registered — ${coverage}% coverage · ${passed} pass / ${failed} fail${weak ? ` / ${weak} weak` : ""} → project ${KF_PROJECT_ID}`);
}
main().catch((e) => { console.error("publish-qa: " + (e?.message || e)); process.exit(1); });
