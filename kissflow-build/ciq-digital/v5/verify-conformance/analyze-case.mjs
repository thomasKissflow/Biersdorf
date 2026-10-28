// Offline analysis of the live CIQ Case draft snapshot vs plan-v5 §4.1. No network.
import { readFileSync } from "node:fs";
const L = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const d = L("./live/process/CIQ_Case_A00.draft.json").body;
const af = L("./live/process/CIQ_Case_A00.allfields.json").body;
const ents = Object.values(d).filter((e) => e && e.Kind);
const F = Object.fromEntries(ents.filter((e) => e.Kind === "Field").map((e) => [e.Id, e]));
const col2f = Object.fromEntries(ents.filter((e) => e.Kind === "Field").map((e) => [e.Column, e.Id]));
const acts = ents.filter((e) => e.Kind === "Activity");
const pd = ents.find((e) => e.Kind === "ProcessDef");
console.log("ProcessDef", pd.Id, pd.WorkflowType, "order", pd["ProcessDef::Activity"].map((a) => `${a}:${d[a]?.Name}`).join(" → "));
for (const a of acts) console.log("act", a.Id, a.NodeType, JSON.stringify(a.Name), "res", (a["Activity::Resource"] || []).map((r) => `${d[r].ValueType}:${d[r].DisplayValue}:${d[r].Value}`).join(","), "expr", (a["Activity::Expression"] || []).map((x) => d[x]?.ExpressionStr).join("|"), "perms", (a["Activity::Permission"] || []).length);
const plan = {
  Template_Version: ["Text"], Case_Phase: ["Select", "CIQ_Case_Phase_A00"], Priority: ["Select", "CIQ_Priority_A00"], Duplicate_Reason: ["Textarea"],
  Follow_Up_Of_Case: ["Text"], Follow_Up_Of_Report: ["Text"], Cancel_Reason: ["Textarea"], Cancelled_By_Name: ["Text"], Cancelled_At: ["DateTime"],
  Cancelled_From_Phase: ["Text"], Reactivate_Reason: ["Textarea"], Reactivated_At: ["DateTime"], Release_Requested_At: ["DateTime"],
  Portal_Release_Item_Id: ["Text"], Final_Document_Hash: ["Text"], Final_Document_At: ["DateTime"], Undefined_Origin: ["Select", "CIQ_Yes_No_A00"],
  Case_Data_Item_Id: ["Text"], Supplier_Files: ["Attachment"],
};
for (const [id, [t, l]] of Object.entries(plan)) {
  const f = F[id]; const ok = f && f.Type === t && (l ? f.ReferredList === l : true) && f.Model === "CIQ_Case_A00";
  console.log(ok ? "OK " : "DEV", id, f ? `${f.Type}${f.ReferredList ? "→" + f.ReferredList : ""} model=${f.Model} req=${!!f.Required}` : "MISSING", "plan", t, l || "");
}
const inUse = ["Portal_Request_Item_Id", "Request_Key", "Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role", "Completeness_At", "Final_Release_Confirm", "Final_Release_By_Name", "Final_Release_By_Email", "Final_Release_By_Role", "Final_Release_At", "RMES_Key", "RMES_Created_At", "Completion_Trigger", "Final_PDF", "Origin_Types"];
console.log("in-use missing:", inUse.filter((x) => !F[x]));
console.log("in-use types:", inUse.map((x) => `${x}:${F[x]?.Type}${F[x]?.ReferredList ? "→" + F[x].ReferredList : ""}`).join(", "));
const M = ["Case_Code", "Cycle_No", "Trade_Name", "Main_INCI", "BDF_Material_No", "Supplier_Code", "Supplier_Legal_Name", "Owner_RMM", "BDF_Contact_Name", "BDF_Contact_Email", "Supplier_Due_Date", "Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Supplier_Contact_Emails", "Target_Markets_Text", "Release_Item_Id", "Release_Key", "Manifest_Hash", "Rule_Set_Version", "Template_Version"];
const E = ["Case_Title", "Priority", "Duplicate_Reason", "Follow_Up_Of_Case", "Follow_Up_Of_Report", "SAP_Material_No", "IRMA_Ref", "Case_Test", "Markets_Label", "Template_Label", "Release_Manifest_JSON"];
console.log("plan M/E missing fields:", [...M, ...E].filter((x) => !F[x]));
const lvl = {};
for (const a of acts) { const m = {}; for (const pid of a["Activity::Permission"] || []) { const p = d[pid]; const f = col2f[p?.Column]; if (f) m[f] = p.Permission; } lvl[a.Id] = m; }
const cnt = (m) => Object.values(m).reduce((o, v) => ((o[v] = (o[v] || 0) + 1), o), {});
for (const a of acts) console.log("levels", a.Id, a.Name, JSON.stringify(cnt(lvl[a.Id])), "fields w/o perm:", Object.keys(F).filter((f) => F[f].Model === "CIQ_Case_A00" && !(f in lvl[a.Id])).length);
const S = lvl["Activity_p1i6xz"];
const mand = Object.keys(S).filter((f) => S[f] === "Mandatory"), edit = Object.keys(S).filter((f) => S[f] === "Editable");
console.log("Start Mandatory not in plan:", mand.filter((x) => !M.includes(x)), "plan M not Mandatory:", M.filter((x) => S[x] !== "Mandatory").map((x) => `${x}=${S[x]}`));
console.log("Start Editable not in plan:", edit.filter((x) => !E.includes(x)), "plan E not Editable:", E.filter((x) => S[x] !== "Editable").map((x) => `${x}=${S[x]}`));
console.log("Start Request_Key / Overall_Approval_Required:", S.Request_Key, S.Overall_Approval_Required);
for (const a of ["Activity_1kltjdn", "Activity_gwgj5o", "Activity_ycf01a"]) console.log(a, "non-ReadOnly:", Object.entries(lvl[a]).filter(([, v]) => v !== "ReadOnly").map(([k, v]) => `${k}=${v}`));
const hidden = Object.entries(lvl).flatMap(([a, m]) => Object.entries(m).filter(([, v]) => v === "Hidden").map(([f]) => `${a}:${f}`));
console.log("Hidden anywhere:", hidden.length);
console.log("Supplier_Files per step:", acts.map((a) => `${a.Id}=${lvl[a.Id].Supplier_Files}`).join(", "));
// field-level Required / formulas
console.log("field-level Required:", Object.values(F).filter((f) => f.Required).map((f) => f.Id));
console.log("formula fields:", ents.filter((e) => e.Kind === "Expression").map((e) => e.Field));
// published fields
const rt = af[d.Root] || af; const pub = new Map((rt.Fields || []).map((x) => [x.Id, x]));
console.log("published fields:", pub.size, "draft fields:", Object.keys(F).length, "tables:", JSON.stringify((rt.Tables || []).map((t) => t.Id || t)));
console.log("published new fields:", Object.keys(plan).map((k) => `${k}:${pub.get(k)?.Type ?? "MISSING"}`).join(", "));
console.log("draft not published:", Object.keys(F).filter((k) => !pub.has(k)));
// unused field set (plan "no longer used") and their current levels
const unused = Object.keys(F).filter((k) => /^Basic_Data_Received$|^Dept_.*_Active$|^Initial_Scope_Run_Key$|^Completeness_(Request_Key|Declaration_Text|Text_Key|Due_Date)$|^Final_Release_(Request_Key|Declaration_Text|Text_Key|Due_Date)$|^Released_Revs_JSON$|^Evidence_List_Text$|^(REG|SAF|QM|MIC|SUS|RMM)_|^Overall_|^Late_Completions_Text$|^Reactivates_Case_Item$|^Supplier_Closing_Text$|Open_Items|Open_CR|Hold_|_Gate/.test(k));
console.log("unused-by-plan fields:", unused.length, "of which Hidden at every step:", unused.filter((k) => acts.filter((a) => a.NodeType !== "SendBackToInitiator").every((a) => lvl[a.Id][k] === "Hidden")).length);
const allPlanned = new Set([...M, ...E, ...Object.keys(plan), ...inUse, "Request_Key"]);
console.log("fields neither planned-in-use nor matched as unused:", Object.keys(F).filter((k) => !allPlanned.has(k) && !unused.includes(k)));
