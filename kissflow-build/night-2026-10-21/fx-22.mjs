// 22 Oct: a ZZT fixture for the step tests of I-2 (E-A), request.changed (mail), E-B and I-6: a started case whose
// request has its completeness confirmed (Review_Depts SUS) and is submitted to "keep", while I-2 is OFF.
import { run, startCase, i1, stepPut, stepSubmit, RQ } from "./run.mjs";
import { PORTAL, isoNow } from "./lib.mjs";
const code = process.env.FX_CODE || "ZZT-FX22-A";
let k;
await run(`FX22.${code}.1`, `${code}: case + I-1`, async (t) => { const s = await startCase(t, code); k = await i1(t, code, s); return k; });
if (!k?.reqId) { console.log("no request"); process.exit(1); }
await run(`FX22.${code}.2`, `${code}: completeness on the request (I-2 OFF)`, async (t) => {
  const w = await stepPut(RQ, PORTAL, k.reqId, { Completeness_Confirm: "Confirmed", Completeness_By_Name: "ZZT Supplier (fictional)", Completeness_By_Email: "zzt.supplier.night@example.com",
    Completeness_By_Role: "Coordinator", Completeness_At: isoNow(), Review_Depts: "SUS" });
  t.check("completeness written", w.status === 200, w);
  const s = await stepSubmit(RQ, PORTAL, k.reqId);
  t.check("fill-in submitted", s.status === 200, s);
});
console.log(JSON.stringify({ caseId: k.caseId, reqId: k.reqId }));
