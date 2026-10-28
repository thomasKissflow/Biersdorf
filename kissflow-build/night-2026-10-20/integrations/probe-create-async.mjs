// Probe (ZZT, deleted at the end): the route the Kissflow Process connector's "Create and submit" uses,
// POST /process/2/{acc}/{process}/create/submit/async?integration=true, on the PORTAL's CIQP Request, without _application_id.
import { writeFileSync } from "node:fs";
import { call, A } from "./integ-lib.mjs";
const RQ = "CIQP_Request_A00", Q = "_application_id=CIQ_Supplier_Portal_A00";
const ME = [{ _id: "UsEJUfjYLM8Y" }];
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const body = { Request_Key: "ZZT-I1P|1", Case_Code: "ZZT-I1P", Cycle_No: 1, Supplier_Code: "ZZT-SUP-DEV", App_Case_Item_Id: "ZZT-NO-CASE", Trade_Name: "ZZT probe material (fictional)", BDF_Contact_Name: "ZZT RMM (fictional)", BDF_Contact_Email: "rmm.zzt@example.com", Supplier_Due_Date: plus(14), Assigned_Contacts: ME, Release_Contacts: ME, Case_Phase_Label: "Filling in", Request_Locked: "No" };
const out = {};
const r = await call("POST", `/process/2/${A}/${RQ}/create/submit/async?integration=true`, body);
out.create = { status: r.status, body: r.body };
console.log("create/submit/async", r.status, JSON.stringify(r.body).slice(0, 600));
await new Promise((res) => setTimeout(res, 6000));
const l = await call("GET", `/process/2/${A}/admin/${RQ}?${Q}&page_number=1&page_size=20&q=ZZT-I1P`);
const rows = (l.body?.Data || l.body || []).filter?.((x) => x.Case_Code === "ZZT-I1P") || [];
out.found = rows.map((x) => ({ _id: x._id, step: x._current_step, status: x._status }));
console.log("found", JSON.stringify(out.found));
for (const x of rows) {
  const d = await call("DELETE", `/process/2/${A}/admin/${RQ}/${x._id}?${Q}`);
  const g = await call("GET", `/process/2/${A}/admin/${RQ}/${x._id}?${Q}`);
  console.log("cleanup", x._id, d.status, "after", g.status);
}
writeFileSync(new URL("./probe-create-async-result.json", import.meta.url), JSON.stringify(out, null, 1));
