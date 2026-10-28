// 22 Oct: runs the builder's per-step Test for an integration's steps in order (from step n, or only the untested ones),
// storing each passed output as the builder does (Output + IsTested); stops at the first failure and prints it.
//   node test-steps.mjs <integrationId> <appId> [--from <n>] [--untested]
import { call, A, getDraft, putDraft } from "./integ-lib.mjs";
const [id, app] = process.argv.slice(2);
const from = Number(process.argv[process.argv.indexOf("--from") + 1]) || 1, untested = process.argv.includes("--untested");
const b0 = await getDraft(id);
const acts = b0[b0.Root]["Integration::Action"] || [];
for (let i = from - 1; i < acts.length; i++) {
  const eid = acts[i];
  if (untested && b0[eid]?.IsTested) continue;
  const t = await call("POST", `/integration/2/${A}/${id}/action/${eid}/test?_application_id=${app}`, {});
  const ok = t.status < 300 && t.body && typeof t.body === "object" && t.body.status !== "error";
  console.log(ok ? "PASS" : "FAIL", `${i + 1}.`, b0[eid]?.Name, t.status, JSON.stringify(t.body).replace(/[A-Za-z0-9_-]{40,}/g, "<x>").slice(0, ok ? 160 : 700));
  if (!ok) { process.exitCode = 1; break; }
  const b = await getDraft(id);
  b[eid] = { ...b[eid], Output: t.body, IsTested: true };
  const r = await putDraft(id, b);
  if (r.status >= 300) { console.log("store failed", r.status); process.exitCode = 1; break; }
}
