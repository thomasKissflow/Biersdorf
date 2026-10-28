// READ-ONLY readback of the generated CIQ Digital app (CIQ_Digital_A00) against the plan (runs/current/app-spec.json,
// graph rev 31) and the dry-run build (runs/current/preview-rev31). Every id is read back from Kissflow; the apply log
// is only cross-checked, never trusted.
//
//   node kissflow-build/ciq-digital/postgen/readback.mjs             live: GET requests only, client({ readOnly: true })
//   node kissflow-build/ciq-digital/postgen/readback.mjs --offline   no network at all: plan vs preview, then a
//                                                                    self-test of the comparison code on a simulator
//   options: --no-save   (live) don't keep the read metadata under postgen/live/
//
// Output: postgen/readback-result.json (live) or postgen/readback-result.offline.json (offline), plus a summary table.
// Exit code 1 on any FAIL. WARN = known/expected deviations (pending post-generate grants, unverified shapes).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP, Results, THOMAS, buildExpectations, disableNetwork, loadPlan } from "./lib/expect.mjs";
import { liveReadback, offlinePlanChecks, printResults } from "./lib/readback-core.mjs";

const argv = process.argv.slice(2);
const OFFLINE = argv.includes("--offline");
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
if (OFFLINE) disableNetwork("readback --offline"); // structural guard: no fetch exists in this process from here on

const plan = loadPlan();
const exp = buildExpectations(plan);

if (OFFLINE) {
  // 1. plan vs preview
  const P = new Results();
  offlinePlanChecks(plan, exp, P);
  printResults(P, { title: `OFFLINE 1/3 · plan (app-spec.json rev ${plan.rev}) vs dry-run build (preview-rev31)` });

  // 2. the live comparison code, run against a simulated apply of the preview (must give 0 FAIL)
  const { createSim, SIM_FAULTS } = await import("./lib/sim.mjs");
  const S = new Results();
  const simOut = await liveReadback({ kf: createSim({ plan, exp }), exp, R: S });
  printResults(S, { title: "OFFLINE 2/3 · readback code against a SIMULATED clean apply (self-test, not evidence about Kissflow)", maxLines: 60 });

  // 3. fault injection: each deliberate defect must be caught in its area
  const faults = [];
  for (const [fault, area] of Object.entries(SIM_FAULTS)) {
    const F = new Results();
    await liveReadback({ kf: createSim({ plan, exp, faults: [fault] }), exp, R: F });
    const hits = F.checks.filter((c) => c.status === "FAIL" && c.area === area);
    faults.push({ fault, area, detected: hits.length > 0, fails: F.counts.FAIL, first: hits[0] ? `${hits[0].id} · ${hits[0].detail}`.slice(0, 160) : null });
  }
  console.log("\n== OFFLINE 3/3 · fault injection (each simulated defect must FAIL in its area)");
  for (const f of faults) console.log(`${f.detected ? "CAUGHT " : "MISSED "} ${f.fault.padEnd(17)} → ${f.area.padEnd(16)} ${f.first ?? ""}`);

  const selfTestOk = S.counts.FAIL === 0 && faults.every((f) => f.detected);
  const ok = P.counts.FAIL === 0 && selfTestOk;
  writeFileSync(here("./readback-result.offline.json"), JSON.stringify({
    at: new Date().toISOString(), mode: "offline (no network)", app: APP, graphRevision: plan.rev, ok,
    plan: { counts: P.counts, summary: P.byArea(), checks: P.checks },
    simulatedReadback: { note: "comparison code run against a simulated apply of the preview; proves the script, not Kissflow", counts: S.counts, summary: S.byArea(), warnings: S.checks.filter((c) => c.status === "WARN"), getRoutes: [...new Set(simOut.calls.map((c) => c.path.replace(/(?<==)CIQ_Digital_A00/g, "APP").replace(/[A-Za-z0-9_]+_A00/g, "<flow>").replace(/APP/g, APP).replace(/Ro[A-Za-z0-9_]+/g, "<role>").replace(/Report_[^/]+/g, "<report>")))] },
    faultInjection: faults,
  }, null, 2));
  console.log(`\nOFFLINE RESULT: plan ${P.counts.FAIL ? "FAIL" : "OK"} (${P.counts.PASS} pass, ${P.counts.FAIL} fail, ${P.counts.WARN} warn) · simulated readback ${S.counts.FAIL ? "FAIL" : "OK"} (${S.counts.PASS} pass, ${S.counts.FAIL} fail, ${S.counts.WARN} warn) · faults caught ${faults.filter((f) => f.detected).length}/${faults.length} · GET calls per live run ≈ ${simOut.calls.length}`);
  console.log("→ postgen/readback-result.offline.json");
  process.exitCode = ok ? 0 : 1;
} else {
  const { client } = await import("../../lib/kf.mjs"); // loaded only in live mode
  const kf = client({ readOnly: true }); // GET only: the client refuses any other method
  const R = new Results();
  const t0 = Date.now();
  let out = { ids: {}, membership: {}, liveSteps: {}, calls: [] };
  try { out = await liveReadback({ kf, exp, R, saveDir: argv.includes("--no-save") ? null : here("./live") }); }
  catch (e) { R.fail("readback", "readback completed", `aborted: ${String(e?.message || e).slice(0, 300)}`); }
  printResults(R, { title: `LIVE readback of ${APP} vs plan rev ${plan.rev} + preview-rev31 (GET only)` });
  const missingThomas = Object.entries(out.membership).filter(([, m]) => !m.members.includes(THOMAS._id)).map(([n]) => n);
  if (missingThomas.length) console.log(`\nThomas (${THOMAS._id}) is NOT a member of: ${missingThomas.join(", ")}`);
  writeFileSync(here("./readback-result.json"), JSON.stringify({
    at: new Date().toISOString(), mode: "live (GET only)", app: APP, graphRevision: plan.rev, seconds: Math.round((Date.now() - t0) / 1000),
    ok: R.counts.FAIL === 0, counts: R.counts, summary: R.byArea(), missingThomas,
    ids: out.ids, membership: out.membership, liveSteps: out.liveSteps, calls: out.calls, checks: R.checks,
  }, null, 2));
  console.log(`\n${R.counts.FAIL ? "READBACK FAILED" : "READBACK OK"} · ${R.counts.PASS} pass · ${R.counts.FAIL} fail · ${R.counts.WARN} warn · ${out.calls.length} GET calls · ${Math.round((Date.now() - t0) / 1000)} s → postgen/readback-result.json`);
  process.exitCode = R.counts.FAIL ? 1 : 0;
}
