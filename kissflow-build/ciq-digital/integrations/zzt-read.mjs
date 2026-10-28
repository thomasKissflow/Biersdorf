// Read-only: the ZZT test pair (portal session's) and any ZZT open point of ours, with the fields the integrations use.
import { call, A, load } from "./integ-lib.mjs";
const s = load();
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o?.[k] ?? null]));
const c = (await call("GET", `/process/2/${A}/admin/CIQ_Case_A00/PkEP0tis9hWG?_application_id=CIQ_Digital_A00`)).body;
console.log("case", JSON.stringify(pick(c, ["_id", "Case_Code", "Cycle_No", "Supplier_Code", "_status", "_current_step", "Portal_Request_Item_Id", "Portal_Contact_Ids", "Release_Assignees_JSON", "Portal_Assignees_JSON"])));
const r = (await call("GET", `/process/2/${A}/admin/CIQP_Request_A00/PkEP13vfhEiE?_application_id=CIQ_Supplier_Portal_A00`)).body;
console.log("request", JSON.stringify(pick(r, ["_id", "Case_Code", "App_Case_Item_Id", "_status", "_current_step", "Release_Flag", "Request_Locked", "Case_Phase_Label"])), "Assigned", JSON.stringify((r?.Assigned_Contacts || []).map((u) => u._id)), "Release", JSON.stringify((r?.Release_Contacts || []).map((u) => u._id)));
if (s.zzt?.opItemId) {
  const o = (await call("GET", `/process/2/${A}/admin/CIQ_Open_Point_A00/${s.zzt.opItemId}?_application_id=CIQ_Digital_A00`)).body;
  console.log("op", JSON.stringify(pick(o, ["_id", "OP_Key", "_status", "_current_step", "Round_No", "Query_Key", "Portal_Contact_Ids", "Portal_Query_Item_Id", "OP_Outcome"])));
}
