// READ-ONLY readback of CIQ_Digital_A00 (DEV) against plan v5 (docs/kissflow-data-model/plan-v5-final.md §4, §5, §6, §4.14,
// incl. the 15 Oct amendments) and the sync service's id contract (kissflow-build/sync/ids.mjs).
//   node kissflow-build/ciq-digital/postgen/readback-v5.mjs        GET only (client({ readOnly: true })), paced >= 1.2 s
// Output: postgen/readback-v5-result.json + a summary. Status per check:
//   PASS  = live matches plan v5;
//   FAIL  = a plan v5 build item is missing or different (incl. items blocked tonight, named in the detail);
//   WARN  = deliberately left to Thomas (grants §6, role renames, builder-only switches), or informational.
// Live drafts/allfields are saved under postgen/live-v5/ (no credentials). Exit code 1 on any FAIL.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { client } from "../../lib/kf.mjs";
import { F } from "../../sync/ids.mjs";
import { grantPlan, shapes, MANAGED, ROLES } from "../v5/grants-v5-plan.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
const A = kf.acc, APP = "CIQ_Digital_A00", Q = `_application_id=${APP}`;
mkdirSync(here("./live-v5"), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0, calls = 0;
async function get(path, saveAs) {
  const d = last + 1200 - Date.now(); if (d > 0) await sleep(d); last = Date.now(); calls++;
  const r = await kf.get(path);
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge on GET ${path}`);
  if (r.status === 429) throw new Error(`STOP: 429 on GET ${path}`);
  if (saveAs) writeFileSync(here(`./live-v5/${saveAs}.json`), JSON.stringify({ status: r.status, body: r.body }, null, 1));
  return r;
}
const checks = [];
const C = (area, id, ok, detail = "", warnOnly = false) => checks.push({ area, id, status: ok ? "PASS" : warnOnly ? "WARN" : "FAIL", detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
const W = (area, id, detail) => checks.push({ area, id, status: "WARN", detail });
const ents = (b) => Object.values(b || {}).filter((e) => e && typeof e === "object" && e.Kind);
const rows = (b) => (Array.isArray(b) ? b : b?.Data || []);
const eqSet = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
const diffSet = (got, want) => ({ missing: want.filter((x) => !got.includes(x)), extra: got.filter((x) => !want.includes(x)) });
const draftOf = async (type, id) => { const r = await get(`/metadata/2/${A}/${type}/${id}/draft`, `${id}.draft`); return r.status === 200 && r.body?.[id] ? r.body : null; };
const allOf = async (type, id) => { const r = await get(`/${type}/2/${A}/${id}/allfields?${Q}`, `${id}.allfields`); const root = r.status === 200 ? r.body?.[id] : null; return root ? { ids: (root.Fields || []).filter((f) => !f.IsSystemField).map((f) => f.Id), tables: (root.Tables || []).map((t) => (typeof t === "string" ? t : t.Id)), child: Object.fromEntries((root.Tables || []).map((t) => [t, (root[t]?.Fields || []).map((f) => f.Id)])) } : null; };
function levels(b, actId) {
  const colToField = Object.fromEntries(ents(b).filter((e) => e.Kind === "Field" && e.Model === b.Root && e.Column).map((e) => [e.Column, e.Id]));
  for (const e of ents(b)) if (e.Kind === "Column" && e.Type === "Model" && b[e.Row]?.Model === b.Root) colToField[e.Id] = `table:${(e["Column::Model"] || [])[0]}`;
  const m = {}; for (const p of (b[actId]?.["Activity::Permission"] || []).map((x) => b[x])) { const f = colToField[p?.Column]; if (f) (m[p.Permission] = m[p.Permission] || []).push(f); }
  return m;
}
function fieldCheck(area, b, id, type, extra = {}) {
  const f = b?.[id];
  const ok = f && f.Kind === "Field" && f.Type === type && (!extra.list || f.ReferredList === extra.list) && (extra.required === undefined || !!f.Required === extra.required) && (!extra.model || f.Model === extra.model);
  C(area, `field ${extra.model && extra.model !== b?.Root ? extra.model + "." : ""}${id}`, ok, f ? `${f.Type}${f.ReferredList ? "→" + f.ReferredList : ""}${f.Required ? " Required" : ""}${f.Model !== b.Root ? " in " + f.Model : ""}` : "missing");
}
const stepByName = (b, name) => ents(b).find((e) => e.Kind === "Activity" && e.Name === name);
const ownerOf = (b, a) => (a?.["Activity::Resource"] || []).map((r) => b[r]).map((r) => `${r?.ValueType}:${r?.Value}`).join(",");
const condOf = (b, a) => (a?.["Activity::Expression"] || []).map((x) => b[x]?.ExpressionStr).join(" | ");
const order = (b) => { const pd = ents(b).find((e) => e.Kind === "ProcessDef" && e.WorkflowType === "Sequence") || ents(b).find((e) => e.Kind === "ProcessDef" && !e.Activity); return (pd?.["ProcessDef::Activity"] || []).map((x) => b[x]?.Name); };

// ── 1. inventory ──
const procs = rows((await get(`/flow/2/${A}/process/?${Q}&page_number=1&page_size=300`, "inventory.process")).body).map((x) => x._id);
const forms = rows((await get(`/flow/2/${A}/form/?${Q}&page_number=1&page_size=300`, "inventory.form")).body).map((x) => x._id);
for (const [id, kind] of [["CIQ_Case_A00", procs], ["CIQ_Open_Point_A00", procs], ["CIQ_Review_A00", procs], ["CIQ_Case_Data_A00", forms], ["CIQ_Mail_Outbox_A00", forms], ["CIQ_Service_Request_A00", forms], ["CIQ_Supplier_A00", forms], ["CIQ_Config_Version_A00", forms], ["CIQ_Scope_Run_A00", forms], ["CIQ_RMES_Safety_A00", forms], ["CIQ_RMES_Regulatory_A00", forms], ["CIQ_Internal_Note_A00", forms], ["CIQ_Audit_Event_A00", forms]])
  C("inventory", `flow ${id}`, kind.includes(id), kind.includes(id) ? "exists" : id === "CIQ_Review_A00" ? "missing: B3 CIQ Review waits for B2 (Thomas's OK)" : "missing");

// ── 2. lists (§5) ──
const LISTS = {
  CIQ_Case_Phase_A00: { exact: ["Supplier filling in the CIQ", "Review", "Awaiting final release", "Completed", "Cancelled"] },
  CIQ_Track_Status_A00: { exact: ["In review", "Waiting for supplier", "Reopened", "Completed", "Ended"] },
  CIQ_Priority_A00: { exact: ["Normal", "High"] },
  CIQ_Rejection_Handling_A00: { exact: ["Continue to final release", "Cancel the case"] },
  CIQ_Request_Status_A00: { exact: ["Done", "Refused", "Failed"] },
  CIQ_OP_Kind_A00: { contains: ["Query", "Document request", "Additional part", "Internal review", "Department review", "Contact update", "Finding"] },
  CIQ_OP_Outcome_A00: { exact: ["Accepted", "Withdrawn", "Not accepted"] },
  CIQ_Event_Category_A00: { contains: ["Supplier master", "Review", "Internal note"], count: 20 },
};
for (const [id, want] of Object.entries(LISTS)) {
  const r = await get(`/flow/2/${A}/list/${id}/items?${Q}`, `list.${id}`);
  const items = Array.isArray(r.body) ? r.body : r.body?.ListItems || [];
  const ok = r.status === 200 && (want.exact ? JSON.stringify(items) === JSON.stringify(want.exact) : want.contains.every((x) => items.includes(x)) && (!want.count || items.length === want.count));
  C("lists", id, ok, JSON.stringify(items));
}

// ── 3. CIQ Case (§4.1) ──
{
  const b = await draftOf("process", "CIQ_Case_A00");
  const af = await allOf("process", "CIQ_Case_A00");
  const area = "CIQ Case";
  C(area, "steps", JSON.stringify(order(b)) === JSON.stringify(["Create case", "Waiting for supplier: CIQ", "Beiersdorf review and final release", "End"]), order(b));
  for (const id of ["Activity_1kltjdn", "Activity_gwgj5o"]) C(area, `owner ${b[id]?.Name}`, ownerOf(b, b[id]) === "AppRole:RoEKl89I5nGx" && !condOf(b, b[id]), `${ownerOf(b, b[id])}${condOf(b, b[id]) ? " if " + condOf(b, b[id]) : ""}`);
  const V5 = { Template_Version: ["Text"], Case_Phase: ["Select", "CIQ_Case_Phase_A00"], Priority: ["Select", "CIQ_Priority_A00"], Duplicate_Reason: ["Textarea"], Follow_Up_Of_Case: ["Text"], Follow_Up_Of_Report: ["Text"], Cancel_Reason: ["Textarea"], Cancelled_By_Name: ["Text"], Cancelled_At: ["DateTime"], Cancelled_From_Phase: ["Text"], Reactivate_Reason: ["Textarea"], Reactivated_At: ["DateTime"], Release_Requested_At: ["DateTime"], Portal_Release_Item_Id: ["Text"], Final_Document_Hash: ["Text"], Final_Document_At: ["DateTime"], Undefined_Origin: ["Select", "CIQ_Yes_No_A00"], Case_Data_Item_Id: ["Text"], Supplier_Files: ["Attachment"] };
  for (const [id, [t, list]] of Object.entries(V5)) fieldCheck(area, b, id, t, { list });
  const model = b[b.Root]["Model::Field"];
  C(area, "published fields = model fields", af && model.every((x) => af.ids.includes(x)), `${af?.ids.length} published / ${model.length} in the model`);
  const inUse = new Set([...F.caseProc.live, ...F.caseProc.v5]);
  const unused = model.filter((x) => !inUse.has(x));
  const START_M = ["Case_Code", "Cycle_No", "Trade_Name", "Main_INCI", "BDF_Material_No", "Supplier_Code", "Supplier_Legal_Name", "Owner_RMM", "BDF_Contact_Name", "BDF_Contact_Email", "Supplier_Due_Date", "Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Supplier_Contact_Emails", "Target_Markets_Text", "Release_Item_Id", "Release_Key", "Manifest_Hash", "Rule_Set_Version", "Template_Version"];
  const START_E = ["Case_Title", "Priority", "Duplicate_Reason", "Follow_Up_Of_Case", "Follow_Up_Of_Report", "SAP_Material_No", "IRMA_Ref", "Case_Test", "Markets_Label", "Template_Label", "Release_Manifest_JSON"];
  const s = levels(b, "Activity_p1i6xz");
  C(area, "Start Mandatory (21, §4.1)", eqSet(s.Mandatory || [], START_M), diffSet(s.Mandatory || [], START_M));
  C(area, "Start Editable (11, §4.1)", eqSet(s.Editable || [], START_E), diffSet(s.Editable || [], START_E));
  for (const a of ["Activity_p1i6xz", "Activity_1kltjdn", "Activity_gwgj5o", "Activity_ycf01a"]) {
    const l = levels(b, a);
    const hiddenOk = eqSet(l.Hidden || [], unused);
    C(area, `${b[a]?.Name}: the ${unused.length} unused fields Hidden (P12)`, hiddenOk, hiddenOk ? "Hidden" : `Hidden ${(l.Hidden || []).length}/${unused.length}${(l.Hidden || []).length ? "" : " — B4 blocked tonight (guard), dry run clean: v5/b4/b4-hidden.mjs case"}`);
    if (a !== "Activity_p1i6xz") C(area, `${b[a]?.Name}: in-use fields ReadOnly`, model.filter((x) => inUse.has(x)).every((x) => (l.ReadOnly || []).includes(x)), `ReadOnly ${(l.ReadOnly || []).filter((x) => inUse.has(x)).length}/${inUse.size}`);
  }
  C(area, "no native SLA on 'Waiting for supplier: CIQ' (plan amended 15 Oct: reminders from the service)", !Object.keys(b.Activity_1kltjdn || {}).some((k) => /sla|deadline|due/i.test(k)), Object.keys(b.Activity_1kltjdn || {}));
}

// ── 4. CIQ Open Point (§4.3 + 15 Oct amendments) ──
{
  const b = await draftOf("process", "CIQ_Open_Point_A00");
  const area = "CIQ Open Point";
  const blocked = " — B2 blocked tonight (guard); scripts ready in v5/b2/";
  C(area, "'Waiting for supplier' Activity_4k7uck removed", !b.Activity_4k7uck, b.Activity_4k7uck ? `still present${blocked}` : "removed");
  const STEPS = { Activity_uka3mx: ["Regulatory", "RoEKl84Hca4w", "REG"], Activity_1kdump3: ["Safety", "RoEKl84xAFRW", "SAF"], Activity_1go37bt: ["QM", "RoEKl85WB1yE", "QM"], Activity_hha7u2: ["Microbiology", "RoEKl8647K2u", "MIC"], Activity_y4af4g: ["Sustainability", "RoEKl86bQQrO", "SUS"], Activity_xc8fbb: ["RMM", "RoEKl83f9jPF", "RMM"] };
  const REVIEW_E = ["Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Responsible_User", "Responsible_Name", "Round_No", "Query_Key", "Kind_Label", "OP_Progress", "Outcome_Reason", "Return_Reason", "Thread_JSON", "Closed_At", "Closed_By"];
  for (const [a, [d, role, code]] of Object.entries(STEPS)) {
    const act = b[a];
    C(area, `${a} name "Open point – ${d}"`, act?.Name === `Open point – ${d}`, `${act?.Name}${act?.Name !== `Open point – ${d}` ? blocked : ""}`);
    C(area, `${a} owner + condition`, [`AppRole:${role}`, "Field:Raiser_Assignee"].includes(ownerOf(b, act)) /* V-19b: field-assigned to the raiser once b2-raiser.mjs is applied */ && condOf(b, act) === `OP_Dept = "${code}"`, `${ownerOf(b, act)} if ${condOf(b, act)}`);
    const l = levels(b, a);
    C(area, `${a} Mandatory = OP_Outcome; Editable = the 14 of §4.3`, eqSet(l.Mandatory || [], ["OP_Outcome"]) && eqSet(l.Editable || [], REVIEW_E), `M ${(l.Mandatory || []).length} E ${(l.Editable || []).length}${eqSet(l.Mandatory || [], ["OP_Outcome"]) ? "" : blocked}`);
  }
  for (const [id, t] of Object.entries({ Raised_By_User: "User", Raised_By_Name: "Text", Thread_JSON: "Textarea", Closed_At: "DateTime", Closed_By: "User" })) fieldCheck(area, b, id, t);
  const START_M = ["OP_Key", "Round_No", "Case_Code", "Cycle_No", "Supplier_Code", "Case_Item_Id", "OP_Kind", "OP_Dept", "Raised_By_Dept", "Raised_By_User", "Ref_Kind", "Ref_Label", "Question_Text", "Supplier_Justification", "Responsible_User", "Supplier_Due_Date"];
  const s = levels(b, "Activity_18t0lhi");
  C(area, "Start Mandatory (16, §4.3)", eqSet(s.Mandatory || [], START_M), diffSet(s.Mandatory || [], START_M));
  const on = b[b.Open_Num?.["Field::Expression"]?.[0]]?.ExpressionStr;
  C(area, "Open_Num = IF(ISBLANK(OP_Outcome),1,0) (amended 15 Oct)", on === "IF(ISBLANK(OP_Outcome),1,0)", `${on}${on === "IF(ISBLANK(OP_Outcome),1,0)" ? "" : blocked}`);
  C(area, "OP_Dept field-level Required (amended 15 Oct)", b.OP_Dept?.Required === true, `${!!b.OP_Dept?.Required}${b.OP_Dept?.Required ? "" : blocked}`);
  const HID = (b[b.Root]["Model::Field"] || []).filter((id) => /^(Internal_Justification|Internal_Due_Date|New_Section_Item_Key|Awaiting_Response|Accepted_Doc_.*|Reviewed_.*|Late_Decision.*|On_Behalf_Of|Thread_Text|Start_Gate)$/.test(id));
  for (const a of ["Activity_18t0lhi", ...Object.keys(STEPS), "Activity_i73i25"]) {
    const l = levels(b, a);
    const want = [...HID, "table:Rounds"];
    const ok = want.every((x) => (l.Hidden || []).includes(x));
    C(area, `${b[a]?.Name ?? a}: unused fields + Rounds Hidden`, ok, ok ? "Hidden" : `Hidden ${(l.Hidden || []).length}/${want.length} — B4 OP waits for B2`);
  }
}

// ── 5. CIQ Review (§4.2) ──
if (procs.includes("CIQ_Review_A00")) {
  const b = await draftOf("process", "CIQ_Review_A00");
  const area = "CIQ Review";
  for (const id of ["Review_Key", "Case_Code", "Case_Item_Id"]) fieldCheck(area, b, id, "Text", { required: true });
  fieldCheck(area, b, "Review_Dept", "Select", { list: "CIQ_Review_Dept_A00", required: true });
  C(area, "Review_Gate formula", b[b.Review_Gate?.["Field::Expression"]?.[0]]?.ExpressionStr === 'IF(OR(ISBLANK(Open_Count),ISBLANK(RMES_Gaps)),"",IF(Open_Count+RMES_Gaps=0,"OK",""))');
  for (const [d, role, code] of [["Regulatory", "RoEKl84Hca4w", "REG"], ["Safety", "RoEKl84xAFRW", "SAF"], ["QM", "RoEKl85WB1yE", "QM"], ["Microbiology", "RoEKl8647K2u", "MIC"], ["Sustainability", "RoEKl86bQQrO", "SUS"], ["RMM", "RoEKl83f9jPF", "RMM"]]) {
    const a = stepByName(b, `Review – ${d}`);
    C(area, `Review – ${d} owner + condition`, a && ownerOf(b, a) === `AppRole:${role}` && condOf(b, a) === `Review_Dept = "${code}"`, a ? `${ownerOf(b, a)} if ${condOf(b, a)}` : "missing");
  }
} else C("CIQ Review", "process exists", false, "not created: waits for B2 (the 'Review – <Dept>' names must not coexist with the un-renamed OP steps); built + dry-run clean in v5/b3 (b3-build.mjs review)");

// ── 6. forms (§4.4, §4.5, §4.7, §4.10, §4.11, §4.13) ──
{
  const b = await draftOf("form", "CIQ_Case_Data_A00"); const af = await allOf("form", "CIQ_Case_Data_A00");
  const area = "CIQ Case Data";
  if (b) {
    C(area, "header fields (sync/ids.mjs F.caseData.header)", F.caseData.header.every((x) => b[x]?.Kind === "Field") && af && F.caseData.header.every((x) => af.ids.includes(x)), diffSet(b[b.Root]["Model::Field"], F.caseData.header));
    fieldCheck(area, b, "Case_Code", "Text", { required: true });
    fieldCheck(area, b, "Sync_Note", "Textarea"); fieldCheck(area, b, "Final_Document_JSON", "Textarea"); fieldCheck(area, b, "Final_PDF", "Attachment");
    fieldCheck(area, b, "Case_Phase", "Select", { list: "CIQ_Case_Phase_A00" });
    for (const k of ["components", "documents", "requestedDocs", "changeReports"]) {
      const t = F.caseData[k];
      C(area, `child ${t.table}`, af?.tables.includes(t.table) && eqSet(af.child[t.table] || [], t.cols), af?.child[t.table] ? diffSet(af.child[t.table], t.cols) : "missing");
    }
    fieldCheck(area, b, "Doc_Attachment_Id", "Text", { model: "CIQ_Case_Data_A00_Documents" });
  } else C(area, "form", false, "missing");
}
for (const [flow, area, all, req, typed] of [
  ["CIQ_Mail_Outbox_A00", "CIQ Mail Outbox", F.outbox.all, "Mail_Key", { Attempt_No: "Number", To_Emails: "Textarea", Body_Text: "Textarea", Created_At: "DateTime" }],
  ["CIQ_Service_Request_A00", "CIQ Service Request", [...F.serviceRequest.all, "Attempt_No"], "Request_Key", { Attempt_No: "Number", Payload_JSON: "Textarea", Processed_At: "DateTime" }],
]) {
  const b = await draftOf("form", flow); const af = await allOf("form", flow);
  if (!b) { C(area, "form", false, "missing"); continue; }
  C(area, "fields", eqSet(b[b.Root]["Model::Field"], all) && af && all.every((x) => af.ids.includes(x)), diffSet(b[b.Root]["Model::Field"], all));
  fieldCheck(area, b, req, "Text", { required: true });
  for (const [id, t] of Object.entries(typed)) fieldCheck(area, b, id, t);
  if (flow === "CIQ_Service_Request_A00") fieldCheck(area, b, "Request_Status", "Select", { list: "CIQ_Request_Status_A00" });
}
{
  const b = await draftOf("form", "CIQ_Supplier_A00"); const af = await allOf("form", "CIQ_Supplier_A00");
  fieldCheck("CIQ Supplier", b, "Supplier_City", "Text");
  for (const [id, t] of [["Contacts_Key", "Text"], ["Contacts_Title", "Text"], ["Contacts_Deactivated_At", "DateTime"]]) fieldCheck("CIQ Supplier", b, id, t, { model: "Contacts" });
  C("CIQ Supplier", "published (allfields)", af?.ids.includes("Supplier_City") && ["Contacts_Key", "Contacts_Title", "Contacts_Deactivated_At"].every((x) => (af.child.Contacts || []).includes(x)), af ? { header: af.ids.includes("Supplier_City"), contacts: af.child.Contacts } : "unreadable");
}
for (const [flow, table] of [["CIQ_RMES_Safety_A00", "Safety_Findings"], ["CIQ_RMES_Regulatory_A00", "Regulatory_Findings"]]) {
  const b = await draftOf("form", flow); const af = await allOf("form", flow);
  fieldCheck(flow.replace(/_A00$/, "").replace(/_/g, " "), b, "Findings_Key", "Text", { model: table });
  C(flow.replace(/_A00$/, "").replace(/_/g, " "), `published ${table}.Findings_Key`, (af?.child[table] || []).includes("Findings_Key"), af?.child[table]);
}
{
  const b = await draftOf("form", "CIQ_Internal_Note_A00");
  fieldCheck("CIQ Internal Note", b, "Note_Mentions_Emails", "Text"); fieldCheck("CIQ Internal Note", b, "Note_Mentions_Names", "Text");
}
for (const [flow, list] of [["CIQ_Audit_Event_A00", F.audit.all], ["CIQ_Config_Version_A00", F.config.all], ["CIQ_Scope_Run_A00", F.scopeRun.all]]) {
  const af = await allOf("form", flow);
  C("kept forms", `${flow} fields (sync/ids.mjs)`, af && list.every((x) => af.ids.includes(x)), af ? diffSet(af.ids, list).missing : "unreadable");
}

// ── 7. integrations (§4.6, §4.14) ──
{
  const r = await get(`/flow/2/${A}/integration/?${Q}&page_number=1&page_size=50`, "integrations");
  const list = rows(r.body);
  const mail = list.find((x) => x._id === "CIQ_Mail_send_outbox_mail_A00");
  C("integrations", "CIQ Mail – send outbox mail exists, published, OFF", !!mail && mail.Status === "Live" && mail.IsActive === false, mail ? `${mail.Status} IsActive=${mail.IsActive}` : "missing");
  if (mail) {
    const d = (await get(`/metadata/2/${A}/integration/${mail._id}/draft`, "CIQ_Mail_send_outbox_mail_A00.draft")).body;
    const props = ents(d).filter((e) => e.Kind === "Property" && e.FieldMapping).map((p) => `${d[p.FieldMapping]?.Action || d[p.FieldMapping]?.Trigger}.${p.Name}=${p.Type === "Value" ? p.Value.join(",") : p.Field}`);
    const want = ["Trigger_CIQ_Mail_A00.form_id=CIQ_Mail_Outbox_A00", "Action_CIQ_Mail_Send_A00.To=context.Trigger_CIQ_Mail_A00.To_Emails", "Action_CIQ_Mail_Send_A00.Subject=context.Trigger_CIQ_Mail_A00.Subject", "Action_CIQ_Mail_Send_A00.Body=context.Trigger_CIQ_Mail_A00.Body_Text", "Action_CIQ_Mail_Sent_A00.form_id=CIQ_Mail_Outbox_A00", "Action_CIQ_Mail_Sent_A00.instance_id=context.Trigger_CIQ_Mail_A00._id", "Action_CIQ_Mail_Sent_A00.Sent_Status=Sent"];
    const trig = ents(d).find((e) => e.Kind === "Trigger"), acts = ents(d).filter((e) => e.Kind === "Action").map((a) => a.Connector?.ActionId);
    C("integrations", "mail: trigger ItemCreated + SendEmail + UpdateAnItem, 7 bindings", trig?.Connector?.TriggerId === "ItemCreated" && eqSet(acts, ["SendEmail", "UpdateAnItem"]) && want.every((x) => props.includes(x)), diffSet(props, want));
  }
  for (const id of ["CIQ_Z1_Case_completed_PDF_e_mails__A00", "CIQ_Z2_Case_cancelled_neutral_e_ma_A00"]) { const x = list.find((y) => y._id === id); C("integrations", `${id} OFF (§4.14)`, x && x.IsActive === false, x ? `IsActive=${x.IsActive}` : "missing"); }
  for (const id of ["CIQ_ZZ_Spike_log_point_completed_A00", "CIQ_ZZ_Spike_log_register_created_A00"]) { const x = list.find((y) => y._id === id); C("integrations", `${id} OFF (§4.14: Thomas, builder-only)`, x && x.IsActive === false, x ? `IsActive=${x.IsActive}` : "missing", true); }
}

// ── 8. roles + grants (§6): left to Thomas tonight → WARN, never FAIL ──
{
  const r = await get(`/app_role/2/${A}/list?${Q}&page_number=1&page_size=100`, "roles");
  const live = rows(r.body);
  const RENAMES = { RoEKl83f9jPF: "Raw Material Manager (RMM)", RoEKl84Hca4w: "Regulatory Affairs reviewer", RoEKl84xAFRW: "Product Safety reviewer", RoEKl85WB1yE: "Quality Management reviewer", RoEKl8647K2u: "Microbiology reviewer", RoEKl86bQQrO: "Sustainability reviewer", RoEKl87f38Xw: "Business administrator", RoEKl88CJiLP: "Auditor", RoEKl88jv4dv: "Case administrator (technical)", RoEKl89I5nGx: "Integration service (technical)" };
  for (const [id, name] of Object.entries(RENAMES)) { const x = live.find((y) => y._id === id); C("roles (Thomas)", `${id} → "${name}" (D38)`, x?.Name === name, x ? `live "${x.Name}"` : "missing", true); }
  const oa = live.find((y) => y._id === "RoEKl8790ycA");
  W("roles (Thomas)", "CIQ Overall Approver (V-27)", oa ? "still exists; the delete waits for Thomas's direct OK (its grants go with grants-v5)" : "deleted");
  const SH = shapes(false);
  for (const p of grantPlan()) {
    const m = await get(`/flow/2/${A}/${p.type}/${p.id}/member?${Q}`, `members.${p.id}`);
    if (m.status !== 200) { C("grants (Thomas)", `${p.id}`, false, `members GET ${m.status} (flow missing?)`, true); continue; }
    const mem = rows(m.body);
    const want = Object.entries(p.want).map(([r2, code]) => ({ id: ROLES[r2][0], name: ROLES[r2][1], ...SH[p.type][code] }));
    const bad = want.filter((w) => { const x = mem.find((y) => y._id === w.id); return !x || x.Role !== w.Role || JSON.stringify([...(x.Permission || [])].sort()) !== JSON.stringify([...w.Permission].sort()); }).length;
    const extra = mem.filter((x) => MANAGED.has(x._id) && !want.some((w) => w.id === x._id)).length;
    C("grants (Thomas)", `${p.id} §6`, !bad && !extra, `${bad} to change, ${extra} to remove (grants-v5.mjs, dry run)`, true);
    if (["CIQ_Case_Data_A00", "CIQ_Mail_Outbox_A00", "CIQ_Service_Request_A00"].includes(p.id)) C("inventory", `${p.id} has its §6 member grants (applied 15 Oct)`, mem.length > 0, `${mem.length} members`); // was "created without member grants" before grants-v5 --apply
  }
}

const counts = checks.reduce((m, c) => ((m[c.status] = (m[c.status] || 0) + 1), m), { PASS: 0, FAIL: 0, WARN: 0 });
const byArea = {};
for (const c of checks) { const a = (byArea[c.area] = byArea[c.area] || { PASS: 0, FAIL: 0, WARN: 0 }); a[c.status]++; }
writeFileSync(here("./readback-v5-result.json"), JSON.stringify({ at: new Date().toISOString(), app: APP, plan: "plan-v5-final.md (+15 Oct amendments)", calls, counts, byArea, checks }, null, 1));
console.log(`readback v5: ${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.WARN} WARN (${checks.length} checks, ${calls} GETs)`);
for (const [a, c] of Object.entries(byArea)) console.log(`  ${a.padEnd(24)} PASS ${c.PASS}  FAIL ${c.FAIL}  WARN ${c.WARN}`);
for (const c of checks.filter((x) => x.status === "FAIL")) console.log(`FAIL ${c.area} · ${c.id} · ${c.detail.slice(0, 160)}`);
process.exitCode = counts.FAIL ? 1 : 0;
