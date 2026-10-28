// Independent verification 15 Oct: OFFLINE analysis (no network). Reads the fresh snapshots of
//   postgen/live-v5/            (written by postgen/readback-v5.mjs, run 15 Oct 03:07Z)
//   v5/verify-1015/live/        (written by v5/verify-1015/fetch.mjs, GET only)
// and checks them against plan-v5-final.md §4, §5, §6, §4.14 transcribed HERE from the plan text (the §6 grid is parsed
// from the plan file itself), not from sync/ids.mjs or v5/grants-v5-plan.mjs, so it does not inherit their mistakes.
// Output: ./analyze-result.json  Run: node kissflow-build/ciq-digital/v5/verify-1015/analyze.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const ROOT = here("../../../../"); // project root
const LV5 = "kissflow-build/ciq-digital/postgen/live-v5/";
const LVF = "kissflow-build/ciq-digital/v5/verify-1015/live/";
const load = (rel) => JSON.parse(readFileSync(ROOT + rel, "utf8"));
const checks = [];
const C = (area, id, ok, evidence, detail = "", sev = "FAIL") => checks.push({ area, id, status: ok ? "PASS" : sev, evidence, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
const eqSet = (a, b) => a.length === new Set(a).size && JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
const diff = (got, want) => ({ missing: want.filter((x) => !got.includes(x)), extra: got.filter((x) => !want.includes(x)) });
const ents = (b) => Object.values(b).filter((e) => e && typeof e === "object" && e.Kind);
const rows = (b) => (Array.isArray(b) ? b : b?.Data || []);

function draft(rel) { const s = load(rel); return s.body; }
function levels(b, actId) {
  const colToField = Object.fromEntries(ents(b).filter((e) => e.Kind === "Field" && e.Model === b.Root && e.Column).map((e) => [e.Column, e.Id]));
  for (const e of ents(b)) if (e.Kind === "Column" && e.Type === "Model" && b[e.Row]?.Model === b.Root) colToField[e.Id] = `table:${(e["Column::Model"] || [])[0]}`;
  const m = {}; for (const p of (b[actId]?.["Activity::Permission"] || []).map((x) => b[x])) { const f = colToField[p?.Column]; if (f) (m[p.Permission] = m[p.Permission] || []).push(f); }
  return m;
}
const owner = (b, a) => (a?.["Activity::Resource"] || []).map((r) => b[r]).map((r) => `${r?.ValueType}:${r?.Value}`).join(",");
const cond = (b, a) => (a?.["Activity::Expression"] || []).map((x) => b[x]?.ExpressionStr).join(" | ");
const acts = (b) => ents(b).filter((e) => e.Kind === "Activity" && e.NodeType !== "SendBackToInitiator");
const seq = (b) => { const pd = ents(b).find((e) => e.Kind === "ProcessDef" && e.WorkflowType === "Sequence"); return (pd?.["ProcessDef::Activity"] || []).map((x) => b[x]?.Name); };
const typeOf = (b, id) => { const f = b[id]; return f ? `${f.Type}${f.ReferredList ? "→" + f.ReferredList : ""}${f.Required ? "!" : ""}` : "missing"; };
function fieldsTyped(area, b, ev, spec) { // spec: {id: "Type" | "Type→List" | with ! for Required}
  for (const [id, want] of Object.entries(spec)) {
    const got = typeOf(b, id);
    const w = want.replace("!", ""), req = want.endsWith("!");
    const ok = got.replace("!", "") === w && (!req || got.endsWith("!"));
    C(area, `field ${id} = ${want}`, ok, `${ev} → ["${id}"].Type/ReferredList/Required`, got);
  }
}
const slaKeys = (a) => Object.keys(a || {}).filter((k) => /sla|deadline|due|duration|escalat/i.test(k));

// ───────────────────────── §4.1 CIQ Case
{
  const ev = LV5 + "CIQ_Case_A00.draft.json", b = draft(ev), A = "§4.1 CIQ Case";
  C(A, "step order", JSON.stringify(seq(b)) === JSON.stringify(["Create case", "Waiting for supplier: CIQ", "Beiersdorf review and final release", "End"]), `${ev} → ProcessDef(Sequence)["ProcessDef::Activity"]`, seq(b));
  for (const id of ["Activity_1kltjdn", "Activity_gwgj5o"]) C(A, `${b[id]?.Name} owner = Integration service, no condition`, owner(b, b[id]) === "AppRole:RoEKl89I5nGx" && !cond(b, b[id]), `${ev} → ["${id}"]["Activity::Resource"]`, `${owner(b, b[id])} ${cond(b, b[id])}`);
  const removed = ["Activity_1feompb", "Activity_1a281c6", "Activity_on1xvu", "Activity_xnbq22", "Activity_1armoq0", "Activity_1kxceje", "Activity_1252uy3", "Activity_h505sh", "Activity_vrfxbc", "Activity_1lo09cp", "Activity_dullxt", "Activity_luckcl"];
  C(A, "12 removed activities absent (scope check, completeness, Part 2 block + 6 lanes, 2 open-item checks, overall approval)", removed.every((x) => !b[x]), `${ev} → keys`, removed.filter((x) => b[x]));
  C(A, "no SLA keys on the two service steps (amended 15 Oct)", !slaKeys(b.Activity_1kltjdn).length && !slaKeys(b.Activity_gwgj5o).length, `${ev} → ["Activity_1kltjdn"], ["Activity_gwgj5o"]`, "none");
  fieldsTyped(A, b, ev, { Template_Version: "Text", Case_Phase: "Select→CIQ_Case_Phase_A00", Priority: "Select→CIQ_Priority_A00", Duplicate_Reason: "Textarea", Follow_Up_Of_Case: "Text", Follow_Up_Of_Report: "Text", Cancel_Reason: "Textarea", Cancelled_By_Name: "Text", Cancelled_At: "DateTime", Cancelled_From_Phase: "Text", Reactivate_Reason: "Textarea", Reactivated_At: "DateTime", Release_Requested_At: "DateTime", Portal_Release_Item_Id: "Text", Final_Document_Hash: "Text", Final_Document_At: "DateTime", Undefined_Origin: "Select→CIQ_Yes_No_A00", Case_Data_Item_Id: "Text", Supplier_Files: "Attachment" });
  const model = b[b.Root]["Model::Field"];
  const START_M = ["Case_Code", "Cycle_No", "Trade_Name", "Main_INCI", "BDF_Material_No", "Supplier_Code", "Supplier_Legal_Name", "Owner_RMM", "BDF_Contact_Name", "BDF_Contact_Email", "Supplier_Due_Date", "Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Supplier_Contact_Emails", "Target_Markets_Text", "Release_Item_Id", "Release_Key", "Manifest_Hash", "Rule_Set_Version", "Template_Version"];
  const START_E = ["Case_Title", "Priority", "Duplicate_Reason", "Follow_Up_Of_Case", "Follow_Up_Of_Report", "SAP_Material_No", "IRMA_Ref", "Case_Test", "Markets_Label", "Template_Label", "Release_Manifest_JSON"];
  const NEW19 = ["Template_Version", "Case_Phase", "Priority", "Duplicate_Reason", "Follow_Up_Of_Case", "Follow_Up_Of_Report", "Cancel_Reason", "Cancelled_By_Name", "Cancelled_At", "Cancelled_From_Phase", "Reactivate_Reason", "Reactivated_At", "Release_Requested_At", "Portal_Release_Item_Id", "Final_Document_Hash", "Final_Document_At", "Undefined_Origin", "Case_Data_Item_Id", "Supplier_Files"];
  const STAY = ["Portal_Request_Item_Id", "Request_Key", ...["Confirm", "By_Name", "By_Email", "By_Role", "At"].flatMap((s) => [`Completeness_${s}`, `Final_Release_${s}`]), "RMES_Key", "RMES_Created_At", "Completion_Trigger", "Final_PDF", "Origin_Types"];
  const inUse = [...new Set([...START_M, ...START_E, ...NEW19, ...STAY])];
  const UNUSED_RE = /^(Basic_Data_Received|Dept_(REG|SAF|QM|MIC|SUS|RMM)_Active|Initial_Scope_Run_Key|(Completeness|Final_Release)_(Request_Key|Declaration_Text|Text_Key|Due_Date)|Released_Revs_JSON|Evidence_List_Text|(REG|SAF|QM|MIC|SUS|RMM)_(Review_Confirm|Completed_By|Completed_By_Email|Completed_At|On_Behalf_Of|RMES_Decision|RMES_Decision_Reason|Open_Count|RMES_Gaps|Gate)|Open_Items_Count|Open_CR_Count|Hold_.*|Open_Items_Gate_.*|Late_Completions_Text|Overall_.*|Reactivates_Case_Item|Supplier_Closing_Text)$/;
  const unused = model.filter((x) => UNUSED_RE.test(x));
  const unclassified = model.filter((x) => !inUse.includes(x) && !unused.includes(x));
  C(A, `every field classified by the plan text (in use ${inUse.length} / no longer used ${unused.length})`, !unclassified.length && inUse.every((x) => model.includes(x)) && !inUse.some((x) => unused.includes(x)), `${ev} → ["CIQ_Case_A00"]["Model::Field"]`, { unclassified, inUseMissing: inUse.filter((x) => !model.includes(x)) });
  const af = load(LV5 + "CIQ_Case_A00.allfields.json").body.CIQ_Case_A00.Fields.filter((f) => !f.IsSystemField).map((f) => f.Id);
  C(A, "every model field published", model.every((x) => af.includes(x)), `${LV5}CIQ_Case_A00.allfields.json → CIQ_Case_A00.Fields[].Id`, `${af.length} published / ${model.length} model`);
  const s = levels(b, "Activity_p1i6xz");
  C(A, "Start Mandatory = the 21 of §4.1", eqSet(s.Mandatory || [], START_M), `${ev} → ["Activity_p1i6xz"]["Activity::Permission"] (Mandatory)`, diff(s.Mandatory || [], START_M));
  C(A, "Start Editable = the 11 of §4.1", eqSet(s.Editable || [], START_E), `${ev} → ["Activity_p1i6xz"]["Activity::Permission"] (Editable)`, diff(s.Editable || [], START_E));
  C(A, "Request_Key, Overall_Approval_Required no longer Mandatory", !(s.Mandatory || []).includes("Request_Key") && !(s.Mandatory || []).includes("Overall_Approval_Required"), `${ev} → ["Activity_p1i6xz"] (Mandatory)`, "");
  for (const a of ["Activity_p1i6xz", "Activity_1kltjdn", "Activity_gwgj5o", "Activity_ycf01a"]) {
    const l = levels(b, a);
    C(A, `${b[a].Name}: Hidden = exactly the ${unused.length} no-longer-used fields (P12)`, eqSet(l.Hidden || [], unused), `${ev} → ["${a}"]["Activity::Permission"] (Hidden)`, diff(l.Hidden || [], unused));
    if (a !== "Activity_p1i6xz") C(A, `${b[a].Name}: all ${inUse.length} in-use fields ReadOnly`, eqSet(l.ReadOnly || [], inUse) && !(l.Editable || []).length && !(l.Mandatory || []).length, `${ev} → ["${a}"]["Activity::Permission"] (ReadOnly)`, diff(l.ReadOnly || [], inUse));
  }
  C(A, "Supplier_Files ReadOnly at every step incl. Start (night addition)", ["Activity_p1i6xz", "Activity_1kltjdn", "Activity_gwgj5o", "Activity_ycf01a"].every((a) => (levels(b, a).ReadOnly || []).includes("Supplier_Files")), `${ev} → [Activity_*]["Activity::Permission"]`, "");
  C(A, "service-only fields ReadOnly at Start (Case_Phase, Cancel_*, Release_*, Final_Document_*, Undefined_Origin, Case_Data_Item_Id)", ["Case_Phase", "Cancel_Reason", "Cancelled_By_Name", "Cancelled_At", "Cancelled_From_Phase", "Reactivate_Reason", "Reactivated_At", "Release_Requested_At", "Portal_Release_Item_Id", "Final_Document_Hash", "Final_Document_At", "Undefined_Origin", "Case_Data_Item_Id"].every((x) => (s.ReadOnly || []).includes(x)), `${ev} → ["Activity_p1i6xz"] (ReadOnly)`, "ReadOnly does not stop a create from storing them (verifier 14 Oct): the service clears them on first sight (fixer hand-off)");
}

// ───────────────────────── §4.2 CIQ Review
{
  const ev = LV5 + "CIQ_Review_A00.draft.json", b = draft(ev), A = "§4.2 CIQ Review";
  fieldsTyped(A, b, ev, { Review_Key: "Text!", Case_Code: "Text!", Cycle_No: "Number", Case_Item_Id: "Text!", Supplier_Code: "Text", Trade_Name: "Text", Review_Dept: "Select→CIQ_Review_Dept_A00!", Round_No: "Number", Activation_Kind: "Text", Activation_Reason: "Textarea", Activated_By_Name: "Text", Assignee_User: "User", Assignee_Name: "Text", Assignee_Email: "Email", Reassign_Reason: "Textarea", Track_Status: "Select→CIQ_Track_Status_A00", Open_Count: "Number", RMES_Gaps: "Number", Review_Gate: "Text", Review_Confirm: "Select→CIQ_Confirm_A00", Completed_By: "User", Completed_By_Name: "Text", Completed_By_Email: "Email", Completed_At: "DateTime", RMES_Decision: "Select→CIQ_Decision_A00", RMES_Decision_Reason: "Textarea", Rejection_Handling: "Select→CIQ_Rejection_Handling_A00", Rejection_Note: "Textarea", Rejected_Depts_Covered: "Text", On_Behalf_Of: "Text" });
  C(A, "exactly the 30 fields of §4.2", b[b.Root]["Model::Field"].length === 30, `${ev} → ["CIQ_Review_A00"]["Model::Field"]`, `${b[b.Root]["Model::Field"].length}`);
  const gx = b[b.Review_Gate?.["Field::Expression"]?.[0]]?.ExpressionStr;
  C(A, "Review_Gate formula (blank-safe)", gx === 'IF(OR(ISBLANK(Open_Count),ISBLANK(RMES_Gaps)),"",IF(Open_Count+RMES_Gaps=0,"OK",""))', `${ev} → ["Review_Gate"]["Field::Expression"] → ExpressionStr`, gx);
  const af = load(LVF + "CIQ_Review_A00.allfields.json").body.CIQ_Review_A00.Fields.filter((f) => !f.IsSystemField).map((f) => f.Id);
  C(A, "every model field published", b[b.Root]["Model::Field"].every((x) => af.includes(x)), `${LVF}CIQ_Review_A00.allfields.json → CIQ_Review_A00.Fields[].Id`, `${af.length} published`);
  C(A, "step order Activate review → 6 conditional reviews → End", JSON.stringify(seq(b)) === JSON.stringify(["Activate review", "Review – Regulatory", "Review – Safety", "Review – QM", "Review – Microbiology", "Review – Sustainability", "Review – RMM", "End"]), `${ev} → ProcessDef(Sequence)`, seq(b));
  const start = acts(b).find((a) => a.Name === "Activate review"); const sl = levels(b, start.Id);
  C(A, "Start: all fields Editable (formula ReadOnly), no owner (service starts it by its Init grant)", (sl.Editable || []).length === 29 && (sl.ReadOnly || []).join() === "Review_Gate" && !owner(b, start), `${ev} → ["${start.Id}"]`, `E ${(sl.Editable || []).length} RO ${(sl.ReadOnly || []).join()}`);
  const BASE_E = ["Assignee_User", "Assignee_Name", "Assignee_Email", "Reassign_Reason", "Review_Confirm", "Completed_By", "Completed_By_Name", "Completed_By_Email", "Completed_At", "On_Behalf_Of"];
  const BASE_M = ["Review_Confirm", "Completed_By", "Completed_At", "Review_Gate"];
  const SPEC = { REG: ["Regulatory", "RoEKl84Hca4w", [...BASE_E, "RMES_Decision", "RMES_Decision_Reason"], [...BASE_M, "RMES_Decision"]], SAF: ["Safety", "RoEKl84xAFRW", [...BASE_E, "RMES_Decision", "RMES_Decision_Reason"], [...BASE_M, "RMES_Decision"]], QM: ["QM", "RoEKl85WB1yE", BASE_E, BASE_M], MIC: ["Microbiology", "RoEKl8647K2u", BASE_E, BASE_M], SUS: ["Sustainability", "RoEKl86bQQrO", BASE_E, BASE_M], RMM: ["RMM", "RoEKl83f9jPF", [...BASE_E, "Rejection_Handling", "Rejection_Note", "Rejected_Depts_Covered"], BASE_M] };
  for (const [code, [d, role, E, M]] of Object.entries(SPEC)) {
    const a = acts(b).find((x) => x.Name === `Review – ${d}`); const l = levels(b, a?.Id);
    C(A, `Review – ${d}: owner role ${role}, condition Review_Dept = "${code}"`, owner(b, a) === `AppRole:${role}` && cond(b, a) === `Review_Dept = "${code}"`, `${ev} → ["${a?.Id}"]["Activity::Resource"/"Activity::Expression"]`, `${owner(b, a)} if ${cond(b, a)}`);
    const writable = [...(l.Editable || []), ...(l.Mandatory || [])].filter((x) => x !== "Review_Gate");
    C(A, `Review – ${d}: writable = §4.2 Editable (${E.length}), Mandatory = §4.2 (${M.length})`, eqSet(writable, E) && eqSet(l.Mandatory || [], M), `${ev} → ["${a?.Id}"]["Activity::Permission"]`, { writable: diff(writable, E), mandatory: diff(l.Mandatory || [], M) });
    const kinds = [...new Set(ents(b).map((e) => e.Kind))];
    C(A, `Review – ${d}: native SLA (plan §4.2 "review time (rem-3: 5 d)"; V-35/V-36: native SLA on human steps for reporting, review 5 d)`, slaKeys(a).length > 0 || kinds.some((k) => /sla|deadline|timer|escalat/i.test(k)), `${ev} → ["${a?.Id}"] keys; entity kinds`, `not built: no SLA key on the activity and no SLA-like entity (kinds ${kinds.join(", ")}). Same reason as the §4.1 amendment; review reminders come from the service (H-19, rem-3)`, "WARN");
  }
}

// ───────────────────────── §4.3 CIQ Open Point
{
  const ev = LV5 + "CIQ_Open_Point_A00.draft.json", b = draft(ev), A = "§4.3 CIQ Open Point";
  C(A, "'Waiting for supplier' Activity_4k7uck removed", !b.Activity_4k7uck, `${ev} → keys`, "");
  C(A, "step order Raise → 6 'Open point – <Dept>' → End", JSON.stringify(seq(b)) === JSON.stringify(["Raise open point", "Open point – Regulatory", "Open point – Safety", "Open point – QM", "Open point – Microbiology", "Open point – Sustainability", "Open point – RMM", "End"]), `${ev} → ProcessDef(Sequence)`, seq(b));
  const E14 = ["Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Responsible_User", "Responsible_Name", "Round_No", "Query_Key", "Kind_Label", "OP_Progress", "Outcome_Reason", "Return_Reason", "Thread_JSON", "Closed_At", "Closed_By"];
  const STEPS = { Activity_uka3mx: ["Regulatory", "RoEKl84Hca4w", "REG"], Activity_1kdump3: ["Safety", "RoEKl84xAFRW", "SAF"], Activity_1go37bt: ["QM", "RoEKl85WB1yE", "QM"], Activity_hha7u2: ["Microbiology", "RoEKl8647K2u", "MIC"], Activity_y4af4g: ["Sustainability", "RoEKl86bQQrO", "SUS"], Activity_xc8fbb: ["RMM", "RoEKl83f9jPF", "RMM"] };
  for (const [a, [d, role, code]] of Object.entries(STEPS)) {
    const act = b[a], l = levels(b, a);
    C(A, `${a} "Open point – ${d}": condition OP_Dept = "${code}"`, act?.Name === `Open point – ${d}` && cond(b, act) === `OP_Dept = "${code}"`, `${ev} → ["${a}"].Name / ["Activity::Expression"]`, `${act?.Name} if ${cond(b, act)}`);
    C(A, `${a}: owner = role ${role} (plan table) — V-19 (b) asks for field assignment now that S-11 passed`, owner(b, act) === `AppRole:${role}`, `${ev} → ["${a}"]["Activity::Resource"]`, owner(b, act));
    C(A, `${a}: Editable = the 14, Mandatory = OP_Outcome`, eqSet(l.Editable || [], E14) && eqSet(l.Mandatory || [], ["OP_Outcome"]), `${ev} → ["${a}"]["Activity::Permission"]`, { E: diff(l.Editable || [], E14), M: l.Mandatory });
  }
  fieldsTyped(A, b, ev, { Raised_By_User: "User", Raised_By_Name: "Text", Thread_JSON: "Textarea", Closed_At: "DateTime", Closed_By: "User", OP_Dept: "Select→CIQ_Review_Dept_A00!", OP_Outcome: "Select→CIQ_OP_Outcome_A00", OP_Progress: "Select→CIQ_OP_Progress_A00", OP_Kind: "Select→CIQ_OP_Kind_A00", OP_To_Supplier: "Select→CIQ_Yes_No_A00", Ref_Internal_Key: "Text" });
  const on = b[b.Open_Num?.["Field::Expression"]?.[0]]?.ExpressionStr;
  C(A, "Open_Num = IF(ISBLANK(OP_Outcome),1,0) (amended 15 Oct)", on === "IF(ISBLANK(OP_Outcome),1,0)", `${ev} → ["Open_Num"]["Field::Expression"] → ExpressionStr`, on);
  const model = b[b.Root]["Model::Field"];
  const HID = ["Internal_Justification", "Internal_Due_Date", "New_Section_Item_Key", "Awaiting_Response", "Accepted_Doc_File_Name", "Accepted_Doc_Uploaded_At", "Reviewed_By", "Reviewed_By_Email", "Reviewed_At", "Reviewed_Answers_Rev", "Late_Decision", "Late_Decision_Reason", "On_Behalf_Of", "Thread_Text", "Start_Gate"];
  C(A, "the plan's no-longer-used list matches 15 live fields", HID.every((x) => model.includes(x)) && model.filter((x) => /^(Internal_Justification|Internal_Due_Date|New_Section_Item_Key|Awaiting_Response|Accepted_Doc_.*|Reviewed_.*|Late_Decision.*|On_Behalf_Of|Thread_Text|Start_Gate)$/.test(x)).length === 15, `${ev} → ["CIQ_Open_Point_A00"]["Model::Field"]`, "");
  const START_M = ["OP_Key", "Round_No", "Case_Code", "Cycle_No", "Supplier_Code", "Case_Item_Id", "OP_Kind", "OP_Dept", "Raised_By_Dept", "Raised_By_User", "Ref_Kind", "Ref_Label", "Question_Text", "Supplier_Justification", "Responsible_User", "Supplier_Due_Date"];
  const sl = levels(b, "Activity_18t0lhi");
  const startAll = model.filter((x) => !HID.includes(x) && x !== "Open_Num");
  C(A, "Start: Mandatory = the 16; every other used field Editable (formula Open_Num ReadOnly)", eqSet(sl.Mandatory || [], START_M) && eqSet([...(sl.Mandatory || []), ...(sl.Editable || [])], startAll), `${ev} → ["Activity_18t0lhi"]["Activity::Permission"]`, { M: diff(sl.Mandatory || [], START_M), all: diff([...(sl.Mandatory || []), ...(sl.Editable || [])], startAll) });
  for (const a of ["Activity_18t0lhi", ...Object.keys(STEPS), "Activity_i73i25"]) {
    const l = levels(b, a);
    C(A, `${b[a].Name}: Hidden = the 15 + table Rounds`, eqSet(l.Hidden || [], [...HID, "table:Rounds"]), `${ev} → ["${a}"]["Activity::Permission"] (Hidden)`, diff(l.Hidden || [], [...HID, "table:Rounds"]));
  }
  const af = load(LVF + "CIQ_Open_Point_A00.allfields.json").body.CIQ_Open_Point_A00.Fields.filter((f) => !f.IsSystemField).map((f) => f.Id);
  C(A, "every model field published", model.every((x) => af.includes(x)), `${LVF}CIQ_Open_Point_A00.allfields.json → CIQ_Open_Point_A00.Fields[].Id`, `${af.length} published / ${model.length}`);
  { const kinds = [...new Set(ents(b).map((e) => e.Kind))]; const any = Object.keys(STEPS).some((a) => slaKeys(b[a]).length) || kinds.some((k) => /sla|deadline|timer|escalat/i.test(k));
    C(A, "native SLA on the 6 'Open point – <Dept>' steps (V-35: native SLA durations on human steps, for reporting)", any, `${ev} → ["Activity_uka3mx" …]; entity kinds`, `not built: no SLA key and no SLA-like entity (kinds ${kinds.join(", ")})`, "WARN"); }
  C(A, "Raiser_Assignee (MultiUser) for V-19 (b) field assignment", !!b.Raiser_Assignee, `${ev} → ["Raiser_Assignee"]`, b.Raiser_Assignee ? typeOf(b, "Raiser_Assignee") : "absent: S-11 passed live 15 Oct (v5/rehearsal/walks-result.json point.assignedToUser = true), so V-19 (b) now applies but is not built", "WARN");
}

// ───────────────────────── §4.4 CIQ Case Data
{
  const ev = LV5 + "CIQ_Case_Data_A00.draft.json", b = draft(ev), A = "§4.4 CIQ Case Data";
  const HEADER = ["Case_Code", "Cycle_No", "Case_Item_Id", "Portal_Request_Item_Id", "Portal_Release_Item_Id", "Supplier_Code", "Supplier_Name", "Supplier_DUNS", "Trade_Name", "Main_INCI", "BDF_Material_No", "Owner_RMM_Name", "Owner_RMM_Email", "Case_Phase", "Phase_History_JSON", "Priority", "Due_Date", "Created_At", "Completed_At", "Cancelled_At", "Template_Version", "Rule_Set_Version", "Target_Markets_Text", "Origin_Types", "Undefined_Origin", "Config_Answers_JSON", "Answers_JSON", "Answered_By_JSON", "Justifications_JSON", "Scope_JSON", "Fixed_Scope_At", "Answers_Rev", "Answers_Changed_At", "Tracks_JSON", "Open_Points_JSON", "Confirmations_JSON", "Open_Points_Count", "Overdue_Points_Count", "Final_Document_JSON", "Final_Document_Hash", "Final_PDF", "Synced_At", "Sync_Note"];
  C(A, `header = the ${HEADER.length} fields of §4.4`, eqSet(b[b.Root]["Model::Field"], HEADER), `${ev} → ["CIQ_Case_Data_A00"]["Model::Field"]`, diff(b[b.Root]["Model::Field"], HEADER));
  fieldsTyped(A, b, ev, { Case_Code: "Text!", Case_Phase: "Select→CIQ_Case_Phase_A00", Final_PDF: "Attachment", Sync_Note: "Textarea", Final_Document_JSON: "Textarea", Answers_JSON: "Textarea", Scope_JSON: "Textarea", Tracks_JSON: "Textarea", Open_Points_JSON: "Textarea", Confirmations_JSON: "Textarea", Undefined_Origin: "Select→CIQ_Yes_No_A00" });
  const T = { CIQ_Case_Data_A00_Components: ["Comp_Row_Id", "Comp_INCI", "Comp_CAS_No", "Comp_EC_No", "Comp_Function", "Comp_Is_Additive", "Comp_Origin", "Comp_Conc_Min", "Comp_Conc_Max"], CIQ_Case_Data_A00_Documents: ["Doc_Key", "Doc_Section_Key", "Doc_Field_Key", "Doc_Row_Id", "Doc_File_Name", "Doc_Kind", "Doc_Attachment_Id", "Doc_Uploaded_By", "Doc_Uploaded_At"], CIQ_Case_Data_A00_Requested_Documents: ["Req_Key", "Req_Doc_Name", "Req_Section_Key", "Req_Rule_Ids", "Req_Why_Text", "Req_Status", "Req_Justification", "Req_Added_Later", "Req_Kept"], CIQ_Case_Data_A00_Change_Reports: ["CR_Key", "CR_Text", "CR_By_Name", "CR_By_Email", "CR_At", "CR_Follow_Up_Case"] };
  const afr = load(LV5 + "CIQ_Case_Data_A00.allfields.json").body.CIQ_Case_Data_A00;
  for (const [t, cols] of Object.entries(T)) {
    const got = (b[t]?.["Model::Field"]) || [];
    const pub = (afr[t]?.Fields || []).map((f) => f.Id);
    C(A, `child ${t} = §4.4 columns, published`, eqSet(got, cols) && eqSet(pub, cols), `${ev} → ["${t}"]["Model::Field"]; ${LV5}CIQ_Case_Data_A00.allfields.json → ${t}.Fields`, diff(got, cols));
  }
  fieldsTyped(A, b, ev, { Doc_Attachment_Id: "Text", Comp_Is_Additive: "Select→CIQ_Yes_No_A00", Req_Added_Later: "Select→CIQ_Yes_No_A00", Req_Kept: "Select→CIQ_Yes_No_A00", CR_By_Email: "Email" });
  C(A, "no Doc_File attachment column (replaced by Doc_Attachment_Id, night addition)", !b.Doc_File, `${ev} → ["Doc_File"]`, b.Doc_File ? "present" : "absent");
  const hp = afr.Fields.filter((f) => !f.IsSystemField).map((f) => f.Id);
  C(A, "header published", HEADER.every((x) => hp.includes(x)), `${LV5}CIQ_Case_Data_A00.allfields.json → CIQ_Case_Data_A00.Fields`, `${hp.length}`);
}

// ───────────────────────── §4.5 Outbox, §4.13 Service Request
{
  const ev = LV5 + "CIQ_Mail_Outbox_A00.draft.json", b = draft(ev), A = "§4.5 CIQ Mail Outbox";
  const spec = { Mail_Key: "Text!", Event_Code: "Text", Audience: "Text", To_Emails: "Textarea", Subject: "Text", Body_Text: "Textarea", Link_Url: "Text", Case_Code: "Text", Related_Key: "Text", Created_At: "DateTime", Sent_Status: "Text", Attempt_No: "Number" };
  C(A, "exactly the 12 fields of §4.5", eqSet(b[b.Root]["Model::Field"], Object.keys(spec)), `${ev} → ["CIQ_Mail_Outbox_A00"]["Model::Field"]`, diff(b[b.Root]["Model::Field"], Object.keys(spec)));
  fieldsTyped(A, b, ev, spec);
}
{
  const ev = LV5 + "CIQ_Service_Request_A00.draft.json", b = draft(ev), A = "§4.13 CIQ Service Request";
  const spec = { Request_Key: "Text!", Request_Code: "Text", Case_Code: "Text", Object_Key: "Text", Payload_JSON: "Textarea", Request_Status: "Select→CIQ_Request_Status_A00", Result_Note: "Textarea", Result_Item_Id: "Text", Processed_At: "DateTime", Attempt_No: "Number" };
  C(A, "exactly the 10 fields of §4.13 (incl. Attempt_No, night addition)", eqSet(b[b.Root]["Model::Field"], Object.keys(spec)), `${ev} → ["CIQ_Service_Request_A00"]["Model::Field"]`, diff(b[b.Root]["Model::Field"], Object.keys(spec)));
  fieldsTyped(A, b, ev, spec);
}

// ───────────────────────── §4.6 integration
{
  const ev = LV5 + "CIQ_Mail_send_outbox_mail_A00.draft.json", d = draft(ev), A = "§4.6 CIQ Mail – send outbox mail";
  const list = rows(load(LV5 + "integrations.json").body);
  const m = list.find((x) => x._id === "CIQ_Mail_send_outbox_mail_A00");
  C(A, "exists, Status Live, IsActive false (Thomas switches on, S-3)", m?.Status === "Live" && m?.IsActive === false, `${LV5}integrations.json → [_id=CIQ_Mail_send_outbox_mail_A00].Status/IsActive`, `${m?.Status} ${m?.IsActive}`);
  const e = ents(d), trig = e.find((x) => x.Kind === "Trigger"), act = e.filter((x) => x.Kind === "Action");
  const props = e.filter((p) => p.Kind === "Property" && p.FieldMapping).map((p) => `${d[p.FieldMapping]?.Action || d[p.FieldMapping]?.Trigger}.${p.Name}=${p.Type === "Value" ? p.Value.join(",") : p.Field}`);
  const want = ["Trigger_CIQ_Mail_A00.form_id=CIQ_Mail_Outbox_A00", "Action_CIQ_Mail_Send_A00.To=context.Trigger_CIQ_Mail_A00.To_Emails", "Action_CIQ_Mail_Send_A00.Subject=context.Trigger_CIQ_Mail_A00.Subject", "Action_CIQ_Mail_Send_A00.Body=context.Trigger_CIQ_Mail_A00.Body_Text", "Action_CIQ_Mail_Sent_A00.form_id=CIQ_Mail_Outbox_A00", "Action_CIQ_Mail_Sent_A00.instance_id=context.Trigger_CIQ_Mail_A00._id", "Action_CIQ_Mail_Sent_A00.Sent_Status=Sent"];
  C(A, "Dataform ItemCreated → Email SendEmail (To/Subject/Body) → Dataform UpdateAnItem Sent_Status=Sent", trig?.Connector?.TriggerId === "ItemCreated" && eqSet(act.map((x) => x.Connector?.ActionId), ["SendEmail", "UpdateAnItem"]) && want.every((x) => props.includes(x)), `${ev} → Kind=Trigger/Action/Property(FieldMapping)`, diff(props, want));
  C(A, "Link_Url not mapped (Body only; the service must put the link into Body_Text; Body type RichText)", false, `${ev} → Property Body / BodyType`, "informational: the plan says Body ← Body_Text (plus the link)", "WARN");
  for (const id of ["CIQ_Z1_Case_completed_PDF_e_mails__A00", "CIQ_Z2_Case_cancelled_neutral_e_ma_A00"]) { const x = list.find((y) => y._id === id); C("§4.14 not used", `${id} OFF`, x?.IsActive === false, `${LV5}integrations.json → [_id=${id}].IsActive`, `${x?.IsActive}`); }
  for (const id of ["CIQ_ZZ_Spike_log_point_completed_A00", "CIQ_ZZ_Spike_log_register_created_A00"]) {
    const x = list.find((y) => y._id === id); const dd = draft(LVF + id + ".draft.json"); const t = ents(dd).find((y) => y.Kind === "Trigger");
    const src = ents(dd).filter((p) => p.Kind === "Property" && /process_id|form_id/.test(p.Name)).map((p) => p.Value?.[0]).join(" → ");
    C("§4.14 not used", `${id} OFF (Thomas, builder-only)`, x?.IsActive === false, `${LV5}integrations.json → [_id=${id}].IsActive; ${LVF}${id}.draft.json → Trigger`, `IsActive=${x?.IsActive}; trigger ${t?.Connector?.TriggerId} on ${src}; last run ${x?.ExecutedAt} (runs ${x?.ExecutedCount})`, "WARN");
  }
}

// ───────────────────────── §4.7–§4.12
{
  const ev = LV5 + "CIQ_Supplier_A00.draft.json", b = draft(ev), A = "§4.7 CIQ Supplier";
  fieldsTyped(A, b, ev, { Supplier_City: "Text", Contacts_Key: "Text", Contacts_Title: "Text", Contacts_Deactivated_At: "DateTime", Supplier_Code: "Text!", Supplier_Legal_Name: "Text!", DUNS_Number: "Text", Supplier_Kind: "Select→CIQ_Supplier_Kind_A00", Supplier_Country_Code: "Select→CIQ_Country_Code_A00", Supplier_Active: "Select→CIQ_Yes_No_A00", Supplier_Test: "Select→CIQ_Yes_No_A00", Contact_Portal_Ids_Text: "Textarea", Pending_Invites: "Number", Contacts_Full_Name: "Text", Contacts_Email: "Email", Contacts_Can_Confirm: "Select→CIQ_Yes_No_A00", Contacts_Portal_User_Id: "Text", Contacts_Active: "Select→CIQ_Yes_No_A00", Contacts_Invite_Requested_At: "DateTime", Contacts_Invited_At: "DateTime" });
  C(A, "new contact columns sit in the Contacts child table", ["Contacts_Key", "Contacts_Title", "Contacts_Deactivated_At"].every((x) => b[x]?.Model === "Contacts"), `${ev} → ["Contacts_Key"].Model …`, "");
  const af = load(LV5 + "CIQ_Supplier_A00.allfields.json").body.CIQ_Supplier_A00;
  C(A, "published", af.Fields.some((f) => f.Id === "Supplier_City") && ["Contacts_Key", "Contacts_Title", "Contacts_Deactivated_At"].every((x) => (af.Contacts?.Fields || []).some((f) => f.Id === x)), `${LV5}CIQ_Supplier_A00.allfields.json → Fields, Contacts.Fields`, "");
}
{
  const ev = LVF + "CIQ_Config_Version_A00.draft.json", b = draft(ev), A = "§4.8 / §11 CIQ Config Version";
  fieldsTyped(A, b, ev, { Config_Key: "Text!", Config_Kind: "Select→CIQ_Config_Kind_A00!", Version_Label: "Text", Config_State: "Select→CIQ_Config_State_A00", Payload_JSON: "Textarea", Change_Note: "Textarea", Published_By: "User", Published_At: "DateTime", Release_Manifest_JSON: "Textarea", Release_Bundle_JSON: "Textarea", Manifest_Hash: "Text", Regression_Result_JSON: "Textarea" });
  const kinds = load(LVF + "list-items/CIQ_Config_Kind_A00.json").body;
  const need = ["Rule set", "Template", "Release", "Section ownership", "Reminders", "Settings", "RMES criteria", "Limit set", "Regression set"];
  C(A, "CIQ Config Kind holds every §11.1 row kind", need.every((x) => kinds.includes(x)), `${LVF}list-items/CIQ_Config_Kind_A00.json → body[]`, JSON.stringify(kinds));
  C(A, "CIQ Config State = Draft · Published · Retired", JSON.stringify(load(LVF + "list-items/CIQ_Config_State_A00.json").body) === JSON.stringify(["Draft", "Published", "Retired"]), `${LVF}list-items/CIQ_Config_State_A00.json → body[]`, "");
  const af = load(LV5 + "CIQ_Config_Version_A00.allfields.json").body.CIQ_Config_Version_A00.Fields.filter((f) => !f.IsSystemField).map((f) => f.Id);
  C(A, "published", b[b.Root]["Model::Field"].every((x) => af.includes(x)), `${LV5}CIQ_Config_Version_A00.allfields.json`, `${af.length}`);
}
{
  const ev = LVF + "CIQ_Scope_Run_A00.draft.json", b = draft(ev), A = "§4.9 CIQ Scope Run";
  fieldsTyped(A, b, ev, { Run_Key: "Text!", Case_Code: "Text", Scope_Trigger: "Text", Rule_Set_Version: "Text", Result_JSON: "Textarea", Added_Section_Keys: "Textarea", Lead_Departments: "Text", Override_Justification: "Textarea" });
}
for (const [flow, t] of [["CIQ_RMES_Safety_A00", "Safety_Findings"], ["CIQ_RMES_Regulatory_A00", "Regulatory_Findings"]]) {
  const ev = LV5 + flow + ".draft.json", b = draft(ev), A = `§4.10 ${flow}`;
  C(A, `${t}.Findings_Key Text (night addition)`, b.Findings_Key?.Type === "Text" && b.Findings_Key?.Model === t, `${ev} → ["Findings_Key"].Type/Model`, `${b.Findings_Key?.Type} in ${b.Findings_Key?.Model}`);
  fieldsTyped(A, b, ev, { Findings_Blocking: "Select→CIQ_Yes_No_A00", Editing_By: "Text", Editing_Since: "DateTime", Result_Case: "Reference", RMES_Key: "Text!" });
  const af = load(LV5 + flow + ".allfields.json").body[flow];
  C(A, `${t}.Findings_Key published`, (af[t]?.Fields || []).some((f) => f.Id === "Findings_Key"), `${LV5}${flow}.allfields.json → ${t}.Fields`, "");
}
{
  const ev = LV5 + "CIQ_Internal_Note_A00.draft.json", b = draft(ev), A = "§4.11 CIQ Internal Note";
  fieldsTyped(A, b, ev, { Note_Mentions_Emails: "Text", Note_Mentions_Names: "Text", Linked_Kind: "Text", Linked_Key: "Text", Note_Text: "Textarea!", Note_Dept: "Select→CIQ_Department_A00" });
  const af = load(LVF + "CIQ_Internal_Note_A00.allfields.json").body.CIQ_Internal_Note_A00.Fields.map((f) => f.Id);
  C(A, "mentions fields published", ["Note_Mentions_Emails", "Note_Mentions_Names"].every((x) => af.includes(x)), `${LVF}CIQ_Internal_Note_A00.allfields.json → Fields`, "");
}
{
  const ev = LVF + "CIQ_Audit_Event_A00.draft.json", b = draft(ev), A = "§4.12 CIQ Audit Event";
  fieldsTyped(A, b, ev, { Event_Category: "Select→CIQ_Event_Category_A00!", Actor_Side: "Select→CIQ_Actor_Side_A00", Actor_Name: "Text", Actor_Email: "Email", Object_Key: "Text", Old_Value_Text: "Textarea", New_Value_Text: "Textarea", Event_Reason: "Textarea" });
}

// ───────────────────────── §5 lists
{
  const A = "§5 lists";
  const L = (id) => { const p = `${LVF}list-items/${id}.json`; return existsSync(ROOT + p) ? { items: load(p).body, ev: p } : { items: null, ev: p }; };
  const NEW = { CIQ_Case_Phase_A00: ["Supplier filling in the CIQ", "Review", "Awaiting final release", "Completed", "Cancelled"], CIQ_Track_Status_A00: ["In review", "Waiting for supplier", "Reopened", "Completed", "Ended"], CIQ_Priority_A00: ["Normal", "High"], CIQ_Rejection_Handling_A00: ["Continue to final release", "Cancel the case"], CIQ_Request_Status_A00: ["Done", "Refused", "Failed"] };
  for (const [id, want] of Object.entries(NEW)) { const { items, ev } = L(id); C(A, `${id} (new) exact`, JSON.stringify(items) === JSON.stringify(want), `${ev} → body[]`, JSON.stringify(items)); }
  for (const [id, add] of [["CIQ_OP_Kind_A00", "Finding"], ["CIQ_OP_Outcome_A00", "Not accepted"], ["CIQ_Event_Category_A00", null]]) {
    const old = load(`kissflow-build/ciq-digital/v5/originals/${id}.items.before-B1.json`); const before = Array.isArray(old.body ?? old) ? (old.body ?? old) : (old.body ?? old).ListItems;
    const { items, ev } = L(id);
    const adds = add ? [add] : ["Supplier master", "Review", "Internal note"];
    C(A, `${id} (changed): every old value kept + ${adds.join(", ")}`, before.every((x) => items.includes(x)) && adds.every((x) => items.includes(x)) && items.length === before.length + adds.length, `${ev} → body[]; v5/originals/${id}.items.before-B1.json`, `${before.length} → ${items.length}`);
  }
  const lists = rows(load(LVF + "lists.json").body);
  const UNCH = ["CIQ_Yes_No_A00", "CIQ_Confirm_A00", "CIQ_Decision_A00", "CIQ_Department_A00", "CIQ_Review_Dept_A00", "CIQ_OP_Progress_A00", "CIQ_Config_Kind_A00", "CIQ_Config_State_A00", "CIQ_Release_Stage_A00", "CIQ_RMES_Part_A00", "CIQ_RMES_Result_A00", "CIQ_AI_State_A00", "CIQ_Impact_Resolution_A00", "CIQ_Supplier_Kind_A00", "CIQ_Country_Code_A00", "CIQ_Actor_Side_A00"];
  C(A, "the 16 unchanged lists exist and are Live", UNCH.every((id) => lists.some((l) => l._id === id && l.Status === "Live")), `${LVF}lists.json → [_id].Status`, UNCH.filter((id) => !lists.some((l) => l._id === id)));
  C(A, "CIQ Review Dept items are the codes the step conditions test (REG, SAF, QM, MIC, SUS, RMM)", JSON.stringify(L("CIQ_Review_Dept_A00").items) === JSON.stringify(["REG", "SAF", "QM", "MIC", "SUS", "RMM"]), `${LVF}list-items/CIQ_Review_Dept_A00.json → body[]`, JSON.stringify(L("CIQ_Review_Dept_A00").items));
  C(A, "CIQ Decision = Approved · Rejected; CIQ Confirm = Confirmed", JSON.stringify(L("CIQ_Decision_A00").items) === '["Approved","Rejected"]' && JSON.stringify(L("CIQ_Confirm_A00").items) === '["Confirmed"]', `${LVF}list-items/CIQ_Decision_A00.json, CIQ_Confirm_A00.json`, "");
}

// ───────────────────────── §6 grants (grid parsed from the plan file) + §4.14
{
  const A = "§6 grants";
  const plan = readFileSync(ROOT + "docs/kissflow-data-model/plan-v5-final.md", "utf8").split("\n");
  const hi = plan.findIndex((l) => l.startsWith("| Role | Case | Review | Open Point |"));
  const cols = plan[hi].split("|").slice(2, -1).map((s) => s.trim());
  const FLOW = { "Case": ["CIQ_Case_A00", "process"], "Review": ["CIQ_Review_A00", "process"], "Open Point": ["CIQ_Open_Point_A00", "process"], "Case Data": ["CIQ_Case_Data_A00", "form"], "Outbox": ["CIQ_Mail_Outbox_A00", "form"], "Service Request": ["CIQ_Service_Request_A00", "form"], "Supplier": ["CIQ_Supplier_A00", "form"], "Config": ["CIQ_Config_Version_A00", "form"], "Scope Run": ["CIQ_Scope_Run_A00", "form"], "RMES Saf": ["CIQ_RMES_Safety_A00", "form"], "RMES Reg": ["CIQ_RMES_Regulatory_A00", "form"], "Note": ["CIQ_Internal_Note_A00", "form"], "Audit": ["CIQ_Audit_Event_A00", "form"] };
  const ROW = { "RMM": ["RoEKl83f9jPF"], "Regulatory Affairs reviewer": ["RoEKl84Hca4w"], "Product Safety reviewer": ["RoEKl84xAFRW"], "QM / Microbiology / Sustainability reviewer": ["RoEKl85WB1yE", "RoEKl8647K2u", "RoEKl86bQQrO"], "Customs, Legal": ["RoEKwv6pxX3g", "RoEKwvH8qaxG"], "Business administrator": ["RoEKl87f38Xw"], "Auditor": ["RoEKl88CJiLP"], "Business owner": ["RoEKwvR_cPvv"], "Case administrator": ["RoEKl88jv4dv"], "Integration service": ["RoEKl89I5nGx"] };
  const want = {}; // flow → roleId → shape
  for (let i = hi + 2; plan[i]?.startsWith("|"); i++) {
    const c = plan[i].split("|").slice(1, -1).map((s) => s.trim()); const ids = ROW[c[0]]; if (!ids) throw new Error("unknown grid row " + c[0]);
    cols.forEach((col, j) => { const code = c[j + 1].replace(/[*¹²]/g, "").replace(/ \+ step owner/, "").trim(); const [fid, t] = FLOW[col];
      const shape = code === "—" ? null : t === "process" ? { Init: "Member:InitiateItems", View: "Member:View", Adm: "Admin:" }[code] : { Read: "Viewer:", Edit: "Member:" }[code];
      if (shape === undefined) throw new Error(`unparsed ${code} in ${col}`); for (const id of ids) (want[fid] = want[fid] || {})[id] = shape; });
  }
  want.CIQ_Section_A00 = { RoEKl88jv4dv: "Viewer:" }; want.CIQ_Change_Request_A00 = { RoEKl88jv4dv: "Admin:" }; // §4.14
  let changes = 0;
  for (const [fid, w] of Object.entries(want)) {
    const ev = `${LV5}members.${fid}.json`; const mem = rows(load(ev).body);
    const got = Object.fromEntries(mem.map((m) => [m._id, `${m.Role}:${[...(m.Permission || [])].sort().join(",")}`]));
    const exp = Object.fromEntries(Object.entries(w).filter(([, s]) => s));
    const bad = [...new Set([...Object.keys(got), ...Object.keys(exp)])].filter((id) => got[id] !== exp[id]).map((id) => `${id}: live ${got[id] ?? "none"} / plan ${exp[id] ?? "none"}`);
    changes += bad.length;
    C(fid.match(/Section|Change_Request/) ? "§4.14 not used" : A, `${fid}: members = plan grid exactly (no extra, no Delete)`, !bad.length && !mem.some((m) => (m.Permission || []).includes("Delete")), `${ev} → body[]._id/Role/Permission`, bad.length ? bad : `${mem.length} members`);
  }
  const saf = rows(load(`${LV5}members.CIQ_RMES_Safety_A00.json`).body).map((m) => m._id), reg = rows(load(`${LV5}members.CIQ_RMES_Regulatory_A00.json`).body).map((m) => m._id);
  C(A, "V-53: RMES own department only; Auditor reads both; REG not on Safety, SAF not on Regulatory", saf.includes("RoEKl88CJiLP") && reg.includes("RoEKl88CJiLP") && !saf.includes("RoEKl84Hca4w") && !reg.includes("RoEKl84xAFRW") && !saf.includes("RoEKl83f9jPF") && !reg.includes("RoEKl83f9jPF"), `${LV5}members.CIQ_RMES_Safety_A00.json, members.CIQ_RMES_Regulatory_A00.json`, { saf, reg });
  const allMem = Object.keys(want).flatMap((fid) => rows(load(`${LV5}members.${fid}.json`).body).map((m) => m._id));
  C("§4.14 not used", "Overall approver RoEKl8790ycA: no grant on any flow, no step resource", !allMem.includes("RoEKl8790ycA"), `${LV5}members.*.json; grep RoEKl8790ycA in postgen/live-v5 = roles.json only`, "");
  for (const id of ["CIQ_ZZ_Spike_Case_A00", "CIQ_ZZ_Spike_Point_A00", "CIQ_ZZ_Spike_Log_A00", "CIQ_ZZ_Spike_Register_A00"]) {
    const mem = rows(load(`${LVF}members.${id}.json`).body);
    C("§4.14 not used", `${id}: no members (§4.14 "Leave")`, !mem.length, `${LVF}members.${id}.json → body[]`, mem.map((m) => `${m.Name}:${m.Role}:${(m.Permission || []).join(",")}`).join("; ") + (mem.length ? " — the 15 Oct ZZ test grant for the S-11/S-12 walks" : ""), "WARN");
  }
}

// ───────────────────────── D38 role names (+ V-27)
{
  const A = "§6 roles (D38)";
  const live = rows(load(LV5 + "roles.json").body);
  const ra = load("kissflow-build/ciq-digital/postgen/role-alignment.json").roles;
  const PLAN = { RoEKl83f9jPF: "Raw Material Manager (RMM)", RoEKl84Hca4w: "Regulatory Affairs reviewer", RoEKl84xAFRW: "Product Safety reviewer", RoEKl85WB1yE: "Quality Management reviewer", RoEKl8647K2u: "Microbiology reviewer", RoEKl86bQQrO: "Sustainability reviewer", RoEKwv6pxX3g: "Customs & Trade Compliance", RoEKwvH8qaxG: "Legal / IP", RoEKl87f38Xw: "Business administrator", RoEKl88CJiLP: "Auditor", RoEKwvR_cPvv: "Business owner (reports)", RoEKl88jv4dv: "Case administrator (technical)", RoEKl89I5nGx: "Integration service (technical)" };
  for (const [id, name] of Object.entries(PLAN)) {
    const x = live.find((y) => y._id === id), d38 = ra.find((r) => r.id === id)?.name;
    const ok = x?.Name === name;
    C(A, `${id} → "${name}" (plan §6 table)`, ok, `${LV5}roles.json → [_id=${id}].Name; postgen/role-alignment.json`, `live "${x?.Name}"${!ok && d38 === x?.Name ? ` = the prepared D38 name in role-alignment.json ("${d38}", technical: true)` : ""}`, !ok && d38 === x?.Name ? "WARN" : "FAIL");
  }
  const oa = live.find((y) => y._id === "RoEKl8790ycA");
  C(A, "V-27 Overall approver deleted", !oa, `${LV5}roles.json → [_id=RoEKl8790ycA]`, oa ? `still exists as "${oa.Name}", UserCount ${oa.UserCount}; no grants, no step (delete = Thomas's irreversible call)` : "deleted", "WARN");
  C(A, "15 roles listed; default User role gone", live.length === 15 && !live.some((y) => y._id === "RoEK3_3NtdWL"), `${LV5}roles.json → body[]`, `${live.length}`);
}

const counts = checks.reduce((m, c) => ((m[c.status] = (m[c.status] || 0) + 1), m), { PASS: 0, FAIL: 0, WARN: 0 });
writeFileSync(here("./analyze-result.json"), JSON.stringify({ at: new Date().toISOString(), counts, checks }, null, 1));
console.log(`verify-1015: ${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.WARN} WARN (${checks.length})`);
for (const c of checks.filter((x) => x.status !== "PASS")) console.log(`${c.status} ${c.area} · ${c.id} · ${c.detail.slice(0, 260)}`);
