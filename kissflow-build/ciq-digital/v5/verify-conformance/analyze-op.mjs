// Offline analysis of the live CIQ Open Point draft snapshot vs plan-v5 §4.3. No network.
import { readFileSync } from "node:fs";
const L = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const d = L("./live/process/CIQ_Open_Point_A00.draft.json").body;
const ents = Object.values(d).filter((e) => e && e.Kind);
const F = Object.fromEntries(ents.filter((e) => e.Kind === "Field").map((e) => [e.Id, e]));
const col2f = Object.fromEntries(ents.filter((e) => e.Kind === "Field").map((e) => [e.Column, e.Id]));
const acts = ents.filter((e) => e.Kind === "Activity");
const models = ents.filter((e) => e.Kind === "Model").map((m) => `${m.Id}(${m.FlowType || ""})`);
console.log("models", models, "PublishedAt", d.PublishedAt);
const pd = ents.filter((e) => e.Kind === "ProcessDef");
for (const p of pd) console.log("ProcessDef", p.Id, p.WorkflowType, (p["ProcessDef::Activity"] || []).map((a) => `${a}:${d[a]?.Name}`).join(" → "));
for (const a of acts) console.log("act", a.Id, a.NodeType, JSON.stringify(a.Name), "res", (a["Activity::Resource"] || []).map((r) => `${d[r].ValueType}:${d[r].DisplayValue}:${d[r].Value}`).join(","), "expr", (a["Activity::Expression"] || []).map((x) => d[x]?.ExpressionStr).join("|"), "perms", (a["Activity::Permission"] || []).length, "sendback", a.IsSendbackEnabled ?? "");
const add = { Raised_By_User: "User", Raised_By_Name: "Text", Thread_JSON: "Textarea", Closed_At: "DateTime", Closed_By: "User" };
for (const [k, t] of Object.entries(add)) console.log(F[k] ? (F[k].Type === t ? "OK " : "DEV") : "MISSING", k, F[k]?.Type, "plan", t);
const keep = ["OP_Key", "Round_No", "Query_Key", "Case_Code", "Cycle_No", "Supplier_Code", "Case_Item_Id", "OP_Kind", "OP_Dept", "Raised_By_Dept", "OP_To_Supplier", "Ref_Kind", "Ref_Label", "Kind_Label", "Question_Text", "Supplier_Justification", "Responsible_User", "Responsible_Name", "Responsible_Dept_Label", "Supplier_Due_Date", "Response_Kind", "Response_Text", "Response_Doc_Refs_JSON", "Supplier_Responsible_Email", "Portal_Query_Item_Id", "OP_Progress", "OP_Outcome", "Outcome_Reason", "Return_Reason", "Ref_Internal_Key", "Portal_Contact_Ids", "Open_Num"];
console.log("in-use missing:", keep.filter((k) => !F[k]));
console.log("types:", ["OP_Kind", "OP_Dept", "Raised_By_Dept", "OP_To_Supplier", "OP_Progress", "OP_Outcome", "Response_Kind", "Responsible_User"].map((k) => `${k}:${F[k]?.Type}${F[k]?.ReferredList ? "→" + F[k].ReferredList : ""}`).join(", "));
const lvl = {};
for (const a of acts) { const m = {}; for (const pid of a["Activity::Permission"] || []) { const p = d[pid]; const f = col2f[p?.Column]; if (f) m[f] = p.Permission; else if (p) m["#" + p.Column] = p.Permission; } lvl[a.Id] = m; }
const cnt = (m) => Object.values(m).reduce((o, v) => ((o[v] = (o[v] || 0) + 1), o), {});
for (const a of acts) console.log("levels", a.Id, a.Name, JSON.stringify(cnt(lvl[a.Id])));
const SM = ["OP_Key", "Round_No", "Case_Code", "Cycle_No", "Supplier_Code", "Case_Item_Id", "OP_Kind", "OP_Dept", "Raised_By_Dept", "Raised_By_User", "Ref_Kind", "Ref_Label", "Question_Text", "Supplier_Justification", "Responsible_User", "Supplier_Due_Date"];
const S = lvl["Activity_18t0lhi"] || {};
console.log("Start Mandatory live:", Object.keys(S).filter((k) => S[k] === "Mandatory"));
console.log("Start plan-M not Mandatory:", SM.filter((k) => S[k] !== "Mandatory").map((k) => `${k}=${S[k]}`));
console.log("Start Mandatory not in plan:", Object.keys(S).filter((k) => S[k] === "Mandatory" && !SM.includes(k)));
const RE = ["Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Responsible_User", "Responsible_Name", "Round_No", "Query_Key", "Kind_Label", "OP_Progress", "OP_Outcome", "Outcome_Reason", "Return_Reason", "Thread_JSON", "Closed_At", "Closed_By"];
for (const a of ["Activity_uka3mx", "Activity_1kdump3", "Activity_1go37bt", "Activity_hha7u2", "Activity_y4af4g", "Activity_xc8fbb"]) {
  const m = lvl[a] || {};
  const ed = Object.keys(m).filter((k) => m[k] === "Editable" || m[k] === "Mandatory");
  console.log(a, "Editable/Mandatory live not in plan:", ed.filter((k) => !RE.includes(k)), "| plan E not E/M:", RE.filter((k) => !ed.includes(k)).map((k) => `${k}=${m[k]}`), "| Mandatory:", Object.keys(m).filter((k) => m[k] === "Mandatory"));
}
console.log("Hidden anywhere:", Object.entries(lvl).flatMap(([a, m]) => Object.entries(m).filter(([, v]) => v === "Hidden").map(([f]) => `${a}:${f}`)).length);
const children = ents.filter((e) => e.Kind === "Model" && e.Id !== d.Root).map((m) => `${m.Id}: ${(m["Model::Field"] || []).join(",")}`);
console.log("child models:", children);
console.log("field-level Required:", Object.values(F).filter((f) => f.Required).map((f) => `${f.Id}@${f.Model}`));
console.log("formulas:", ents.filter((e) => e.Kind === "Expression" && e.Field).map((e) => `${e.Field}=${e.ExpressionStr}`));
