// ZZT only (agreed with the portal session, 20 Oct): link the test case PkEP0tis9hWG to its test request PkEP13vfhEiE,
// as the case.started integration would, so the case-level integrations can be tested. Admin PUT, read back.
import { call, A } from "./integ-lib.mjs";
const Q = "_application_id=CIQ_Digital_A00";
const r = await call("PUT", `/process/2/${A}/admin/CIQ_Case_A00/PkEP0tis9hWG?${Q}`, { Portal_Request_Item_Id: "PkEP13vfhEiE" });
const g = (await call("GET", `/process/2/${A}/admin/CIQ_Case_A00/PkEP0tis9hWG?${Q}`)).body;
console.log("PUT", r.status, "read-back Portal_Request_Item_Id =", g?.Portal_Request_Item_Id, g?.Case_Code);
