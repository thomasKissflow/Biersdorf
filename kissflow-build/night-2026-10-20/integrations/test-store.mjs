// The builder's per-step Test over REST, storing a PASSED output on the step (Output + IsTested), as the builder does.
// A failed test stores nothing.   node test-store.mjs <integrationId> <entityId> <app>
import { call, A, getDraft, putDraft } from "./integ-lib.mjs";
const [id, eid, app] = process.argv.slice(2);
const b0 = await getDraft(id);
const seg = b0[eid]?.Kind === "Trigger" ? "trigger" : "action";
const t = await call("POST", `/integration/2/${A}/${id}/${seg}/${eid}/test?_application_id=${app}`, {});
const ok = t.status < 300 && t.body && typeof t.body === "object" && t.body.status !== "error";
console.log(ok ? "PASS" : "FAIL", eid, t.status, JSON.stringify(t.body).slice(0, 900));
if (ok) {
  const b = await getDraft(id);
  b[eid] = { ...b[eid], Output: t.body, IsTested: true };
  const r = await putDraft(id, b);
  console.log("stored output", r.status);
}
process.exitCode = ok ? 0 : 1;
