// Probe (ZZT, deleted at the end): the route of the connector's "Update an item",
// POST /process/2/{acc}/{process}/admin/update/async?integration=true  body [{_id, …}], on a portal request at
// "Supplier: fill in the CIQ", writing Case_Phase_Label + Request_Locked (ReadOnly to the supplier there) and Release_Flag.
import { writeFileSync } from "node:fs";
import { call, A } from "./integ-lib.mjs";
const RQ = "CIQP_Request_A00", Q = "_application_id=CIQ_Supplier_Portal_A00";
const ME = [{ _id: "UsEJUfjYLM8Y" }];
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const out = {};
const cr = await call("POST", `/process/2/${A}/${RQ}/create/submit/async?integration=true`, { Request_Key: "ZZT-I1U|1", Case_Code: "ZZT-I1U", Cycle_No: 1, Supplier_Code: "ZZT-SUP-DEV", App_Case_Item_Id: "ZZT-NO-CASE", BDF_Contact_Name: "ZZT RMM (fictional)", BDF_Contact_Email: "rmm.zzt@example.com", Supplier_Due_Date: plus(14), Assigned_Contacts: ME, Release_Contacts: ME, Case_Phase_Label: "Filling in", Request_Locked: "No" });
const id = cr.body?.Id; out.create = cr.status;
try {
  await new Promise((r) => setTimeout(r, 4000));
  const u = await call("POST", `/process/2/${A}/${RQ}/admin/update/async?integration=true`, [{ _id: id, Case_Phase_Label: "ZZT probe label", Request_Locked: "Yes", Release_Flag: "ZZT" }]);
  out.update = { status: u.status, body: u.body };
  console.log("admin/update/async", u.status, JSON.stringify(u.body).slice(0, 400));
  await new Promise((r) => setTimeout(r, 5000));
  const g = (await call("GET", `/process/2/${A}/admin/${RQ}/${id}?${Q}`)).body || {};
  out.readback = { step: g._current_step, Case_Phase_Label: g.Case_Phase_Label, Request_Locked: g.Request_Locked, Release_Flag: g.Release_Flag };
  console.log("read-back", JSON.stringify(out.readback));
} finally {
  if (id) { const d = await call("DELETE", `/process/2/${A}/admin/${RQ}/${id}?${Q}`); const g2 = await call("GET", `/process/2/${A}/admin/${RQ}/${id}?${Q}`); out.cleanup = [d.status, g2.status]; console.log("cleanup", d.status, "after", g2.status); }
  writeFileSync(new URL("./probe-update-async-result.json", import.meta.url), JSON.stringify(out, null, 1));
}
