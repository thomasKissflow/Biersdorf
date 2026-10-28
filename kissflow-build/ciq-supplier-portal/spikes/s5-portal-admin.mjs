// Spike S-5 (plan-v5-final.md §14): what the sync service needs on PORTAL items, tested on throwaway ZZT items.
//   (1) create CIQP Request at Start + submit → field-assigned "Supplier: fill in the CIQ"
//   (2) admin PUT of service fields (ReadOnly at the supplier step) → read back
//   (3) admin PUT of Assigned_Contacts mid-step (same user; rerouting to a NEW user needs a 2nd supplier user, S-7)
//   (4) submit "fill in the CIQ" as the assignee (the key's user is in Supplier today) → "keep the CIQ up to date"
//   (5) admin PUT at the second step; (6) withdraw by the initiator (the key) → Withdrawn; (7) admin DELETE → gone.
//   Same for CIQP Query and CIQP Final Release: create + submit Start, admin PUT, withdraw, delete.
// Every created item is deleted at the end. No credentials are printed or logged.
//   node kissflow-build/ciq-supplier-portal/spikes/s5-portal-admin.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
import { PORTAL, TEST_USER } from "../portal-spec.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./spike-requests.jsonl"));
const A = w.acc, P = PORTAL;
const ME = { _id: TEST_USER._id };
const out = [];
const T = (id, pass, evidence) => { out.push({ id, pass, evidence }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${JSON.stringify(evidence).slice(0, 260)}`); };
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const nowZ = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const read = async (proc, item) => (await w.call("GET", `/process/2/${A}/admin/${proc}/${item}?_application_id=${P}`)).body || {};
const adminPut = (proc, item, body) => w.call("PUT", `/process/2/${A}/admin/${proc}/${item}?_application_id=${P}`, body);
const created = [];
async function createAndSubmit(proc, body) {
  const cr = await w.call("POST", `/process/2/${A}/${proc}?_application_id=${P}`, body);
  if (cr.body?._id) created.push({ proc, item: cr.body._id });
  const sub = cr.body?._id ? await w.call("POST", `/process/2/${A}/${proc}/${cr.body._id}/${cr.body._activity_instance_id}/submit?_application_id=${P}`, {}) : { status: -1, body: cr.body };
  return { id: cr.body?._id, create: cr.status, submit: sub.status, err: sub.body?.en_message || cr.body?.en_message, it: cr.body?._id ? await read(proc, cr.body._id) : {} };
}
const actId = (it) => it._current_context?.[0]?._context_activity_instance_id || it._current_context?.[0]?._activity_instance_id;
// where does the step instance id live? (admin GET vs the initiator's /myitems full list)
async function stepInstance(proc, item) {
  const a = await read(proc, item);
  const ctx = a._current_context;
  const mi = await w.call("GET", `/process/2/${A}/${proc}/myitems?_response_type=full&_application_id=${P}`);
  const row = (Array.isArray(mi.body) ? mi.body : mi.body?.Data || []).find((x) => x._id === item);
  const fromAdmin = actId(a);
  console.log("INFO admin GET _current_context:", JSON.stringify(ctx)?.slice(0, 300), "| admin keys with 'activ':", Object.keys(a).filter((k) => /activ/i.test(k)).join(","), "| myitems _activity_instance_id:", row?._activity_instance_id ? "present" : "absent");
  return fromAdmin || row?._activity_instance_id;
}
const HDR = { Case_Code: "ZZT-S5-0001", Cycle_No: 1, Supplier_Code: "SUP-ZZT" };

// ── CIQP Request ──
const RQ = "CIQP_Request_A00";
const r = await createAndSubmit(RQ, {
  ...HDR, Request_Key: "ZZT-S5-0001|1", App_Case_Item_Id: "ZZT-NO-CASE", Trade_Name: "ZZT spike material (fictional)", Main_INCI: "Tocopherol",
  BDF_Material_No: "RM-ZZT-0001", Supplier_Display_Name: "ZZT Supplier (fictional)", BDF_Contact_Name: "ZZT RMM", BDF_Contact_Email: "rmm.zzt@example.com",
  Supplier_Due_Date: plus(14), Case_Contacts_JSON: "[]", Assigned_Contacts: [ME],
  Rule_Set_Version: "RS-2026.1", Template_Version: "v1", Config_Bundle_JSON: JSON.stringify({ spike: true, sections: [] }), Config_Bundle_Hash: "zzt", BDF_Set_JSON: "{}",
  Case_Phase_Label: "Filling in", Request_Locked: "No",
});
T("S5-req-create-submit-routes", r.submit === 200 && r.it._current_step === "Supplier: fill in the CIQ" && (r.it._current_assigned_to || []).some((a) => a._id === TEST_USER._id), { create: r.create, submit: r.submit, step: r.it._current_step, err: r.err });
if (r.id) {
  const p = await adminPut(RQ, r.id, { Case_Phase_Label: "With Beiersdorf", Questions_History_JSON: JSON.stringify([{ op: "OP-ZZT-01", text: "spike" }]), Manual_Scope_JSON: "[]" });
  const b = await read(RQ, r.id);
  T("S5-req-admin-put-service-fields-at-supplier-step", p.status === 200 && b.Case_Phase_Label === "With Beiersdorf" && (b.Questions_History_JSON || "").includes("OP-ZZT-01"), { put: p.status, phase: b.Case_Phase_Label, step: b._current_step, err: p.body?.en_message });
  const p2 = await adminPut(RQ, r.id, { Assigned_Contacts: [ME] });
  const b2 = await read(RQ, r.id);
  T("S5-req-admin-put-assigned-contacts-mid-step (same user; rerouting to a new user = S-7)", p2.status === 200 && (b2.Assigned_Contacts || []).some((u) => u._id === TEST_USER._id), { put: p2.status, assigned: b2._current_assigned_to?.map((a) => a._id), err: p2.body?.en_message });
  // supplier-side step submit by the assignee (the key's user is in Supplier today; Mandatory is not enforced for the key, D-5)
  const act2 = await stepInstance(RQ, r.id);
  const s2 = await w.call("POST", `/process/2/${A}/${RQ}/${r.id}/${act2}/submit?_application_id=${P}`, {});
  const b3 = await read(RQ, r.id);
  T("S5-req-submit-fill-in-moves-to-keep-up-to-date", s2.status === 200 && b3._current_step === "Supplier: keep the CIQ up to date", { submit: s2.status, step: b3._current_step, err: s2.body?.en_message });
  const p3 = await adminPut(RQ, r.id, { Request_Locked: "Yes", Case_Phase_Label: "Completed", Release_By_Name: "ZZT Contact", Release_At: nowZ() });
  const b4 = await read(RQ, r.id);
  T("S5-req-admin-put-at-second-step", p3.status === 200 && b4.Request_Locked === "Yes" && b4._current_step === "Supplier: keep the CIQ up to date", { put: p3.status, locked: b4.Request_Locked, step: b4._current_step, err: p3.body?.en_message });
  const wd = await w.call("POST", `/process/2/${A}/${RQ}/${r.id}/withdraw?_application_id=${P}`, { Comment: "ZZT spike S-5" });
  const b5 = await read(RQ, r.id);
  T("S5-req-withdraw-by-initiator", wd.status === 200 && b5._status === "Withdrawn", { withdraw: wd.status, status: b5._status, err: wd.body?.en_message });
}

// ── CIQP Query ──
const QY = "CIQP_Query_A00";
const q = await createAndSubmit(QY, {
  Query_Key: "ZZT-S5-OP-01|r1", Round_No: 1, ...HDR, App_Open_Point_Id: "ZZT-NO-OP", Kind_Label: "Question", Responsible_Department: "Product Safety", Responsible_Name: "ZZT Reviewer",
  Ref_Kind: "field", Ref_Section_Key: "K2.2", Ref_Label: "Heavy metals", Question_Text: "Spike question (ZZT).", Supplier_Justification: "Spike.", Supplier_Due_Date: plus(7), Assigned_Contacts: [ME],
});
T("S5-query-create-submit-routes", q.submit === 200 && q.it._current_step === "Supplier: respond", { submit: q.submit, step: q.it._current_step, err: q.err });
if (q.id) {
  const p = await adminPut(QY, q.id, { Question_Text: "Spike question, edited by Beiersdorf (ZZT).", Edited_At: nowZ(), Edit_Note: "Question changed" });
  const b = await read(QY, q.id);
  T("S5-query-admin-edit-open-question", p.status === 200 && b.Edit_Note === "Question changed" && /edited/.test(b.Question_Text || ""), { put: p.status, err: p.body?.en_message });
  const wd = await w.call("POST", `/process/2/${A}/${QY}/${q.id}/withdraw?_application_id=${P}`, { Comment: "ZZT spike S-5" });
  const b2 = await read(QY, q.id);
  T("S5-query-withdraw-by-initiator", wd.status === 200 && b2._status === "Withdrawn", { withdraw: wd.status, status: b2._status, err: wd.body?.en_message });
}

// ── CIQP Final Release ──
const FR = "CIQP_Final_Release_A00";
const f = await createAndSubmit(FR, {
  Confirmation_Key: "ZZT-S5-0001|1|release", ...HDR, App_Case_Item_Id: "ZZT-NO-CASE", Declaration_Text: "Spike release text (ZZT).", Declaration_Text_Key: "release.v1", Supplier_Due_Date: plus(3), Assigned_Contacts: [ME],
});
T("S5-release-create-submit-routes", f.submit === 200 && f.it._current_step === "Supplier: release", { submit: f.submit, step: f.it._current_step, err: f.err });
if (f.id) {
  const wd = await w.call("POST", `/process/2/${A}/${FR}/${f.id}/withdraw?_application_id=${P}`, { Comment: "ZZT spike S-5: release request withdrawn" });
  const b = await read(FR, f.id);
  T("S5-release-withdraw-by-initiator", wd.status === 200 && b._status === "Withdrawn", { withdraw: wd.status, status: b._status, err: wd.body?.en_message });
}

// ── cleanup: delete every created item (admin route), verify gone ──
for (const c of created) {
  const d = await w.call("DELETE", `/process/2/${A}/admin/${c.proc}/${c.item}?_application_id=${P}`);
  const g = await w.call("GET", `/process/2/${A}/admin/${c.proc}/${c.item}?_application_id=${P}`);
  T(`S5-cleanup-${c.proc}`, d.status < 300 && (g.status === 404 || g.body?._is_deleted === true || g.status >= 400), { del: d.status, after: g.status });
}
writeFileSync(here("./s5-result.json"), JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
console.log(`\n${out.filter((x) => x.pass).length}/${out.length} S-5 checks passed`);
