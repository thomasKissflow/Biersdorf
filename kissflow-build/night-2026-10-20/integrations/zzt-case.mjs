// A fictional ZZT CIQ Case for the I-1 step tests (create at Start + submit), and its cleanup.
//   node zzt-case.mjs make | show | cleanup
import { call, A, load, save } from "./integ-lib.mjs";
const CASE = "CIQ_Case_A00", QA = "_application_id=CIQ_Digital_A00", RQ = "CIQP_Request_A00", QP = "_application_id=CIQ_Supplier_Portal_A00";
const s = load(); s.zzt ||= {};
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const me = '[{"_id":"UsEJUfjYLM8Y"}]';
const read = async (id) => (await call("GET", `/process/2/${A}/admin/${CASE}/${id}?${QA}`)).body || {};
const stage = process.argv[2];
const SLOT = process.argv[3] || "pair";        // "pair" = the case/request pair shared with the app session; "chain" = I-1→I-7 test
const Z = SLOT === "pair" ? s.zzt : (s.zzt[SLOT] ||= {});
const CODE = SLOT === "pair" ? "ZZT-I1E" : SLOT === "chain" ? "ZZT-I1W" : `ZZT-${SLOT.toUpperCase()}`;
if (stage === "make") {
  if (Z.caseId) { console.log("exists", Z.caseId); process.exit(0); }
  const body = {
    Case_Code: CODE, Cycle_No: 1, Case_Title: `${CODE} test case (fictional)`, Supplier_Code: "ZZT-SUP-DEV", Supplier_Legal_Name: "ZZT Dev Supplier (fictional)",
    Trade_Name: "ZZT test material (fictional)", Main_INCI: "Tocopherol", BDF_Material_No: `${CODE}-RM`, BDF_Contact_Name: "ZZT RMM (fictional)", BDF_Contact_Email: "rmm.zzt@example.com",
    Markets_Label: "EU", Template_Label: "ZZT template (fictional)", Supplier_Due_Date: plus(14), Rule_Set_Version: "ZZT-RS", Template_Version: "ZZT-TPL",
    Config_Bundle_JSON: '{"format":"ciq-bundle/1","zzt":true}', Config_Bundle_Hash: "zzt-test", BDF_Set_JSON: "{}",
    Case_Contacts_JSON: '[{"id":"UsEJUfjYLM8Y","name":"ZZT Contact (fictional)","email":"zzt.contact@example.com","title":"","mayConfirm":true}]',
    Portal_Assignees_JSON: me, Release_Assignees_JSON: me, Case_Test: "Yes",
  };
  const cr = await call("POST", `/process/2/${A}/${CASE}?${QA}`, body);
  console.log("create", cr.status, JSON.stringify(cr.body).slice(0, 300));
  if (!cr.body?._id) process.exit(1);
  Z.caseId = cr.body._id; save(s);
  const sub = await call("POST", `/process/2/${A}/${CASE}/${cr.body._id}/${cr.body._activity_instance_id}/submit?${QA}`, {});
  console.log("submit Start", sub.status, JSON.stringify(sub.body).slice(0, 400));
  const it = await read(cr.body._id);
  console.log("now", JSON.stringify({ step: it._current_step, status: it._status, assigned: it._current_assigned_to }).slice(0, 400));
}
if (stage === "show") {
  const it = await read(Z.caseId);
  console.log(JSON.stringify({ _id: it._id, step: it._current_step, status: it._status, Portal_Request_Item_Id: it.Portal_Request_Item_Id }));
}
if (stage === "cleanup") {
  for (const [flow, q, id] of [...(Z.requestIds || []).map((r) => [RQ, QP, r]), [RQ, QP, Z.requestId], [CASE, QA, Z.caseId]]) {
    if (!id) continue;
    const d = await call("DELETE", `/process/2/${A}/admin/${flow}/${id}?${q}`);
    const g = await call("GET", `/process/2/${A}/admin/${flow}/${id}?${q}`);
    console.log("cleanup", flow, id, d.status, "after", g.status);
  }
}
