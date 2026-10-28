// The app session's ZZT test open point for the integration tests (fictional data; on a ZZT case of the portal session:
// create takes <caseItemId> <caseCode>, default the first pair PkEP0tis9hWG / ZZT-I1E). Modes: create (create + submit Start → "Open point – QM", assigned to the key user as raiser)
// | outcome (admin PUT OP_Outcome "Withdrawn" + Closed_At, for the op.closed test) | cleanup (withdraw if open, then delete).
import { call, A, load, save } from "./integ-lib.mjs";
const s = load();
const Q = "_application_id=CIQ_Digital_A00", OP = "CIQ_Open_Point_A00", ME = "UsEJUfjYLM8Y";
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const mode = process.argv[2];
const ctx = (x) => (x?._current_context || []).find((c) => c._context_activity_instance_id);
const CASE_ID = process.argv[3] || "PkEP0tis9hWG", CASE_CODE = process.argv[4] || "ZZT-I1E";
if (mode === "create") {
  if (s.zzt?.opItemId) {
    const g = await call("GET", `/process/2/${A}/admin/${OP}/${s.zzt.opItemId}?${Q}`);
    if (g.status !== 404) { console.log("exists", s.zzt.opItemId); process.exit(0); }
    s.zzt.done = [...(s.zzt.done || []), s.zzt.opItemId]; delete s.zzt.opItemId; save(s); // the earlier one was deleted
  }
  const body = {
    OP_Key: `ZZT-INT-OP-${CASE_CODE}`, Round_No: 1, Query_Key: `ZZT-INT-OP-${CASE_CODE}-R1`, Case_Code: CASE_CODE, Cycle_No: 1, Supplier_Code: "ZZT-SUP-DEV", Case_Item_Id: CASE_ID,
    OP_Kind: "Query", OP_Dept: "QM", Raised_By_Dept: "QM", OP_To_Supplier: "Yes", Raised_By_User: { _id: ME }, Raised_By_Name: "ZZT Quentin Test",
    Ref_Kind: "Section", Ref_Label: "K4 · ZZT test section", Ref_Section_Key: "K4", Kind_Label: "Question",
    Question_Text: "ZZT test question for the op.round integration (fictional).", Supplier_Justification: "ZZT test justification (fictional).",
    Responsible_User: { _id: ME }, Responsible_Name: "ZZT Quentin Test", Responsible_Dept_Label: "Quality Management",
    Supplier_Due_Date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), OP_Progress: "Open", Portal_Contact_Ids: ME, Raiser_Assignee: [{ _id: ME }],
    Thread_JSON: JSON.stringify({ thread: [{ id: `ZZT-INT-OP-${CASE_CODE}-m1`, at: now(), by: ME, side: "internal", text: "ZZT test question for the op.round integration (fictional).", action: "raised" }], edits: [] }),
  };
  const c = await call("POST", `/process/2/${A}/${OP}?${Q}`, body);
  console.log("create", c.status, c.body?._id ?? JSON.stringify(c.body).slice(0, 300));
  if (!c.body?._id) process.exit(1);
  s.zzt = { ...(s.zzt || {}), opItemId: c.body._id }; save(s);
  const g = (await call("GET", `/process/2/${A}/admin/${OP}/${c.body._id}?${Q}`)).body;
  const sub = await call("POST", `/process/2/${A}/${OP}/${c.body._id}/${ctx(g)?._context_activity_instance_id || c.body._activity_instance_id}/submit?${Q}`, {});
  const g2 = (await call("GET", `/process/2/${A}/admin/${OP}/${c.body._id}?${Q}`)).body;
  console.log("submit", sub.status, "now at", g2?._current_step, "status", g2?._status);
}
if (mode === "outcome") {
  const r = await call("PUT", `/process/2/${A}/admin/${OP}/${s.zzt.opItemId}?${Q}`, { OP_Outcome: "Withdrawn", Outcome_Reason: "ZZT test close (fictional)", Closed_At: now(), Closed_By: { _id: ME } });
  const g = (await call("GET", `/process/2/${A}/admin/${OP}/${s.zzt.opItemId}?${Q}`)).body;
  console.log("outcome", r.status, "read-back", g?.OP_Outcome, g?.Closed_At);
}
if (mode === "cleanup") {
  for (const [proc, id, app] of [[OP, s.zzt?.opItemId, "CIQ_Digital_A00"], ...((s.zzt?.queries || []).map((q) => ["CIQP_Query_A00", q, "CIQ_Supplier_Portal_A00"]))]) {
    if (!id) continue;
    const g = await call("GET", `/process/2/${A}/admin/${proc}/${id}?_application_id=${app}`);
    if (g.status === 404) { console.log(proc, id, "already gone"); continue; }
    if (g.body?._status === "InProgress") { const wd = await call("POST", `/process/2/${A}/${proc}/${id}/withdraw?_application_id=${app}`, { Comment: "ZZT integration test clean-up" }); console.log(proc, id, "withdraw", wd.status); }
    const d = await call("DELETE", `/process/2/${A}/admin/${proc}/${id}?_application_id=${app}`);
    const g2 = await call("GET", `/process/2/${A}/admin/${proc}/${id}?_application_id=${app}`);
    console.log(proc, id, "delete", d.status, "get after", g2.status);
  }
}
