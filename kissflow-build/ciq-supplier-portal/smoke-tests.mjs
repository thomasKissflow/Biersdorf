// Runtime smoke tests on the live portal (v3, supplier-only). Each test states its expectation BEFORE running; results are
// PASS/FAIL against it. "OBS" lines are admin-key baselines (the key's user is portal Admin, so they do not show what a
// real supplier can do; MORNING-TESTS covers that). Test items are deleted at the end and the deletion is verified.
//   node kissflow-build/ciq-supplier-portal/smoke-tests.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
import { PORTAL, TEST_USER } from "./portal-spec.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const state = JSON.parse(readFileSync(here("./build-state.json"), "utf8"));
const w = writer(here("./smoke-requests.jsonl"));
const A = w.acc, P = PORTAL;
const ID = (n) => state.flows[n].id;
const ME = { _id: TEST_USER._id };
const results = [], created = [];
const T = (id, expect, pass, evidence, observation = false) => { results.push({ id, expect, pass, evidence, observation }); console.log(`${observation ? (pass ? "OBS " : "OBS-CHANGED") : pass ? "PASS" : "FAIL"} ${id} — expect: ${expect}\n     evidence: ${JSON.stringify(evidence).slice(0, 300)}`); };
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const read = async (proc, item) => (await w.call("GET", `/process/2/${A}/admin/${proc}/${item}?_application_id=${P}`)).body || {};
async function createAndSubmit(proc, body) {
  const cr = await w.call("POST", `/process/2/${A}/${proc}?_application_id=${P}`, body);
  if (cr.body?._id) created.push({ proc, item: cr.body._id });
  const sub = cr.body?._id ? await w.call("POST", `/process/2/${A}/${proc}/${cr.body._id}/${cr.body._activity_instance_id}/submit?_application_id=${P}`, {}) : { status: -1, body: cr.body };
  const it = cr.body?._id ? await read(proc, cr.body._id) : {};
  return { cr, sub, it };
}
const assigned = (it) => (it._current_assigned_to || []).map((a) => a._id);
const routed = (r, step) => r.sub.status === 200 && r.it._current_step === step && JSON.stringify(assigned(r.it)) === JSON.stringify([TEST_USER._id]) && (r.it._current_assigned_to || []).every((a) => a.Kind === "User");
const ev = (r) => ({ submit: r.sub.status, err: r.sub.body?.en_message, step: r.it._current_step, status: r.it._status, assigned: r.it._current_assigned_to });
const HDR = { Case_Code: "ZZ-TEST-0001", Cycle_No: 1, Supplier_Code: "SUP-TEST" };
const without = (o, k) => { const c = { ...o }; delete c[k]; return c; };

// ── P1 CIQP Request ──
const req = { ...HDR, Request_Key: "ZZ-TEST-0001|1", App_Case_Item_Id: "TEST-NO-CASE", Trade_Name: "Test material (fictional)", Main_INCI: "Tocopherol", BDF_Material_No: "RM-TEST-0001", Supplier_Display_Name: "Test Supplier (fictional)", BDF_Contact_Name: "Test RMM", BDF_Contact_Email: "rmm.test@example.com", Markets_Label: "EU", Template_Label: "CIQ-2026 v1", Supplier_Due_Date: plus(14), Case_Contacts_JSON: "[]", Assigned_Contacts: [ME] };
{
  const r = await createAndSubmit(ID("CIQP Request"), req);
  T("P1-routing", "Start → 'Supplier: submit basic data', assigned to the USER in Assigned_Contacts (no role)", routed(r, "Supplier: submit basic data"), ev(r));
  T("P1-material", "Main_INCI and BDF_Material_No are stored and read back (added 2026-10-07)", r.it.Main_INCI === req.Main_INCI && r.it.BDF_Material_No === req.BDF_Material_No, { Main_INCI: r.it.Main_INCI, BDF_Material_No: r.it.BDF_Material_No });
}
for (const k of ["Assigned_Contacts", "App_Case_Item_Id", "Supplier_Code"]) {
  const r = await createAndSubmit(ID("CIQP Request"), { ...without(req, k), Request_Key: `ZZ-TEST-0001|no-${k}` });
  T(`P1-requires-${k}`, `Without ${k} the Start submit is refused`, r.sub.status >= 400 && r.it._current_step === "Issue request", ev(r));
}

// ── P2 CIQP Section (+ K-16 size round-trip) ──
const big = JSON.stringify({ fields: Array.from({ length: 1400 }, (_, i) => ({ key: `FLD-K21-${String(i).padStart(4, "0")}`, label: `Component attribute ${i} — unicode äöü ß €`, kind: "Text" })) });
{
  const r = await createAndSubmit(ID("CIQP Section"), { ...HDR, Section_Item_Key: "ZZ-TEST-0001|1|K2.1", App_Section_Item_Id: "TEST-NO-SECTION", Section_Key: "K2.1", Section_Code: "K2.1", Section_Title: "Composition (smoke test)", Section_Sort: 21, Applicability_Label: "Mandatory", Section_Origin: "Initial", Definition_JSON: big, Definition_Hash: "sha256-test", Supplier_Due_Date: plus(14), Assigned_Contacts: [ME], Answers_JSON: "{\"sent\":\"at create\"}" });
  T("P2-routing", "Start → 'Supplier: fill in section', assigned to the user (field)", routed(r, "Supplier: fill in section"), ev(r));
  T("P2-K16-size", `A ${Math.round(big.length / 1024)} KB Definition_JSON round-trips byte-identical`, r.it.Definition_JSON === big, { sent: big.length, got: (r.it.Definition_JSON || "").length });
  T("P2-answers-readonly-at-start (admin key)", "Baseline: with the ADMIN key, Answers_JSON sent at create IS stored although ReadOnly at Start (non-admin: MORNING-TESTS)", r.it.Answers_JSON !== undefined, { Answers_JSON: r.it.Answers_JSON }, true);
}

// ── P3 CIQP Query ──
const q = { ...HDR, Query_Key: "ZZ-OP-01", Round_No: 1, App_Open_Point_Id: "TEST-NO-OP", Kind_Label: "Question from Beiersdorf", Responsible_Department: "Regulatory Affairs", Responsible_Name: "Test Reviewer", Ref_Kind: "Field", Ref_Section_Key: "K2.1", Ref_Field_Key: "FLD-K21-0001", Ref_Label: "K2.1 › component 1 › CAS number", Question_Text: "Please provide the CAS number for component 1.", Supplier_Justification: "Needed to check the substance against the EU lists.", Supplier_Due_Date: plus(7), Assigned_Contacts: [ME] };
{ const r = await createAndSubmit(ID("CIQP Query"), q); T("P3-routing", "Start → 'Supplier: respond', assigned to the user (field)", routed(r, "Supplier: respond"), ev(r)); }
{ const r = await createAndSubmit(ID("CIQP Query"), { ...without(q, "Supplier_Justification"), Query_Key: "ZZ-OP-02" }); T("P3-requires-justification", "Without Supplier_Justification the Start submit is refused (REQ-PROC-030)", r.sub.status >= 400 && r.it._current_step === "Raise query", ev(r)); }

// ── P4a / P4b confirmations ──
const conf = { ...HDR, App_Case_Item_Id: "TEST-NO-CASE", Declaration_Text: "We confirm that the questionnaire is complete.", Declaration_Text_Key: "TXT-PS05-v1", Supplier_Due_Date: plus(7), Assigned_Contacts: [ME], Supplier_Confirm: "Confirmed" };
{
  const r = await createAndSubmit(ID("CIQP Completeness Confirmation"), { ...conf, Confirmation_Key: "ZZ-PS05-1" });
  T("P4a-routing", "Start → 'Supplier: confirm completeness', assigned to the user (field)", routed(r, "Supplier: confirm completeness"), ev(r));
  T("P4a-confirm-readonly-at-start (admin key)", "Baseline: with the ADMIN key, Supplier_Confirm sent at create IS stored although ReadOnly at Start (non-admin: MORNING-TESTS)", r.it.Supplier_Confirm === "Confirmed", { Supplier_Confirm: r.it.Supplier_Confirm }, true);
}
{ const r = await createAndSubmit(ID("CIQP Final Release"), { ...without(conf, "Supplier_Confirm"), Confirmation_Key: "ZZ-PS11-1", Declaration_Text: "We release the questionnaire." }); T("P4b-routing", "Start → 'Supplier: release', assigned to the user (field)", routed(r, "Supplier: release"), ev(r)); }

// ── P5 CIQP Notice ──
const notice = { ...HDR, Notice_Key: "ZZ-NOTE-1", Notice_Kind: "Change request outcome", App_Notice_Item_Id: "TEST-NO-NOTICE", Notice_Title: "Your change request", Notice_Text: "Your change request was accepted.", Related_Key: "ZZ-CR-01", Assigned_Contacts: [ME] };
{ const r = await createAndSubmit(ID("CIQP Notice"), notice); T("P5-routing", "Start → 'Supplier: acknowledge', assigned to the user (field)", routed(r, "Supplier: acknowledge"), ev(r)); }
{ const r = await createAndSubmit(ID("CIQP Notice"), { ...without(notice, "App_Notice_Item_Id"), Notice_Key: "ZZ-NOTE-2" }); T("P5-requires-app-id", "Without App_Notice_Item_Id the Start submit is refused", r.sub.status >= 400 && r.it._current_step === "Send notice", ev(r)); }

// ── P6 CIQP Change Request: no portal step ──
const cr = { ...HDR, CR_Key: "ZZ-CR-01", Change_Kind: "Metadata correction", Section_Key: "BASIC", Field_Key: "SF-01", Current_Value_Text: "Vegetable", Proposed_Value_JSON: "{\"value\":\"Animal\"}", Change_Reason: "Smoke test" };
{
  const r = await createAndSubmit(ID("CIQP Change Request"), cr);
  T("P6-completes", "Start submit completes the item at once (no portal step; triage happens in the app)", r.sub.status === 200 && r.it._status === "Completed" && r.it.Proposed_Value_JSON === cr.Proposed_Value_JSON, ev(r));
  const mi = await w.call("GET", `/process/2/${A}/${ID("CIQP Change Request")}/myitems?_response_type=full&_application_id=${P}`);
  const mine = (Array.isArray(mi.body) ? mi.body : mi.body?.Data || []).filter((x) => x._id === r.cr.body?._id);
  T("P6-creator-sees-it (admin key)", "Baseline: the creator still lists the completed item in My Items (non-admin supplier: MORNING-TESTS)", mine.length === 1 && mine[0]._status === "Completed", { inMyItems: mine.length, status: mine[0]?._status }, true);
}
{ const r = await createAndSubmit(ID("CIQP Change Request"), { ...without(cr, "Change_Reason"), CR_Key: "ZZ-CR-02" }); T("P6-requires-reason", "Without Change_Reason the submit is refused", r.sub.status >= 400 && r.it._status !== "Completed", ev(r)); }

// ── P7 CIQP Help Article (Form) ──
{
  const c = await w.call("POST", `/form/2/${A}/${ID("CIQP Help Article")}?_application_id=${P}`, { Article_Title: "ZZ smoke test article", Article_Body: "Temporary test row.", Sort_Order: 999 });
  const sub = c.body?._id ? await w.call("POST", `/form/2/${A}/${ID("CIQP Help Article")}/${c.body._id}/submit?_application_id=${P}`, {}) : { status: -1 };
  if (sub.body?._id) created.push({ form: ID("CIQP Help Article"), item: sub.body._id });
  const list = await w.call("POST", `/form/2/${A}/${ID("CIQP Help Article")}/list?page_number=1&page_size=50&_application_id=${P}`, {});
  const rowsL = Array.isArray(list.body) ? list.body : list.body?.Data || [];
  T("P7-create-and-list", "A help article can be created (draft → submit) and is listed", sub.status === 200 && rowsL.some((x) => x.Article_Title === "ZZ smoke test article"), { draft: c.status, submit: sub.status, listed: rowsL.length });
}

// ── cleanup: delete every test item and verify ──
for (const c of created) {
  if (c.proc) {
    let del = await w.call("DELETE", `/process/2/${A}/admin/${c.proc}/${c.item}?_application_id=${P}`);
    if (del.status >= 300) del = await w.call("DELETE", `/process/2/${A}/${c.proc}/${c.item}?_application_id=${P}`);
    const after = await w.call("GET", `/process/2/${A}/admin/${c.proc}/${c.item}?_application_id=${P}`);
    c.deleted = del.status; c.after = after.status;
  } else {
    const del = await w.call("DELETE", `/form/2/${A}/${c.form}/${c.item}?_application_id=${P}`);
    const lst = await w.call("POST", `/form/2/${A}/${c.form}/list?page_number=1&page_size=100&_application_id=${P}`, {});
    c.deleted = del.status; c.stillListed = (Array.isArray(lst.body) ? lst.body : lst.body?.Data || []).some((x) => x._id === c.item);
  }
}
const procs = created.filter((c) => c.proc), forms = created.filter((c) => c.form);
console.log(`cleanup: ${procs.filter((c) => c.after === 404).length}/${procs.length} process items gone (404), ${forms.filter((c) => c.stillListed === false).length}/${forms.length} form rows gone`);
const tests = results.filter((r) => !r.observation), obs = results.filter((r) => r.observation);
const pass = tests.filter((r) => r.pass).length;
console.log(`\n${pass}/${tests.length} smoke tests passed · ${obs.filter((r) => r.pass).length}/${obs.length} admin-key baselines as recorded`);
writeFileSync(here("./smoke-report.json"), JSON.stringify({ at: new Date().toISOString(), version: "v3", pass, total: tests.length, observations: obs, results, cleanup: created }, null, 2));
