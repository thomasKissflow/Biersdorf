// 22 Oct, load-time redesign phase 2: fills the mappings and scripts of the steps Thomas added in the builder to I-2
// (E-A: the round-1 reviews + one case-level history row) and request.changed (the reviewers' "data changed" mail).
// Keeps his selectors and connections; backs up first; PUTs; reads back.   node map-phase2.mjs I2|RC [--apply]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { call, A, backup, getDraft, putDraft, fieldsOf, mapAction, setScriptInputs, newId } from "./integ-lib.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const [KEY] = process.argv.slice(2), apply = process.argv.includes("--apply");
const S = (step, path) => ({ step, path }), T = (f) => ({ trigger: f }), V = (value) => ({ value });
const SYNCED = ["Config_Answers_JSON", "Answers_JSON", "Answered_By_JSON", "Justifications_JSON", "Components_JSON", "Scope_JSON", "Requested_Docs_JSON", "Documents_JSON",
  "Answers_Rev", "Answers_Changed_At", "Answers_Changed_By_Email", "Change_Report_Text", "Change_Report_Rev", "Change_Report_By_Email", "Change_Report_At"];
const HIST = ["Event_Key", "Case_Code", "Cycle_No", "Case_Item_Id", "Event_At", "Event_Category", "Action_Code", "Actor_Side", "Actor_Name", "Object_Kind", "Object_Key", "Object_Item_Id", "Object_State", "New_Value_Text", "Snapshot_JSON"];
const REVIEW = ["Review_Key", "Case_Code", "Cycle_No", "Case_Item_Id", "Supplier_Code", "Trade_Name", "Review_Dept", "Round_No", "Activation_Kind", "Activation_Reason", "Activated_By_Name", "Track_Status", "Open_Count", "RMES_Gaps"];
const from = (step, fields) => Object.fromEntries(fields.map((f) => [f, S(step, f)]));
const PLAN = {
  I2: { id: "CIQP_Completeness_confirmed_to_cas_A00", code: { Action_I2_2_req: "scripts/i2-completeness.js" }, steps: {
    Action_I2_5_record: { map: { _id: S("Action_I2_4_check", "caseId"), ...from("Action_I2_2_req", ["Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role", "Completeness_At", "Review_Depts", ...SYNCED]), Case_Phase: V("Review") } },
    Action_eqeqav9dC7: { map: { lookupValue: S("Action_I2_4_check", "caseId") } },
    "Action_aRNf91MfF_": { script: "scripts/i2-plan-reviews.js", inputs: { caseId: S("Action_I2_4_check", "caseId"), cases: S("Action_I2_3_case", "Data"), reviews: S("Action_eqeqav9dC7", "Data"), reviewDepts: S("Action_I2_2_req", "Review_Depts") } },
    Action_DAgm0TLRIy: { bulk: { field: "process_bulk_update_fields", src: S("Action_aRNf91MfF_", "reviews"), fields: REVIEW } },
    Action_3bgm75dYZM: { script: "scripts/i2-plan-history.js", inputs: from("Action_aRNf91MfF_", HIST) },
    "Action_aVZDoc21o-": { map: from("Action_3bgm75dYZM", HIST) },
  } },
  RC: { id: "CIQP_Request_changed_to_case_A00", steps: {
    Action_P5PvYK7AaU: { script: "scripts/rc-mail-plan.js", inputs: { caseId: S("Action_RC_4_check", "caseId"), cases: S("Action_RC_3_case", "Data"), requests: S("Action_RC_1_request", "Data"), requestId: T("portalRequestItemId") } },
    "Action_FnORco6EV-": { map: { user_ids: S("Action_P5PvYK7AaU", "roleIds"), fields: V(["Name", "Email"]) } },
    Action_KHpGiW5Wym: { script: "scripts/rc-mail-text.js", inputs: { users: S("Action_FnORco6EV-", "Users"), ...from("Action_P5PvYK7AaU", ["caseCode", "tradeName", "supplier", "isReport", "reportText"]) } },
    Action_SZh4L9rG9N: { map: { To: S("Action_KHpGiW5Wym", "To"), Subject: S("Action_KHpGiW5Wym", "Subject"), BodyType: V("PlainText"), From: V("Beiersdorf | Kissflow") }, then: { Body: S("Action_KHpGiW5Wym", "Body") } },
  } },
};
const plan = PLAN[KEY];
if (!plan) throw new Error("usage: map-phase2.mjs I2|RC [--apply]");
let b = await getDraft(plan.id);
const root = b.Root, trig = (b[root]["Integration::Trigger"] || [])[0];
const acts = new Set(b[root]["Integration::Action"] || []);
for (const id of [...Object.keys(plan.steps), ...Object.keys(plan.code || {})]) console.log(acts.has(id) ? "  found" : "  MISSING", id, b[id]?.Name || "");
if (!apply) process.exit(0);
backup(plan.id, b, "before-map-phase2");
const setCode = (blob, id, file) => {
  let fm = (blob[id]["Action::FieldMapping"] || []).find((y) => blob[y]?.Name === "js_code");
  if (!fm) {
    fm = newId("FieldMapping"); const pr = newId("Property");
    blob[fm] = { Id: fm, Kind: "FieldMapping", Type: "Code", FieldId: "JSCode", Label: "JavaScript code", Name: "js_code", IsRequired: true, IsDropdown: false, IsPaginated: false, AutoRefresh: false, CodeLanguage: "javascript", Action: id, "FieldMapping::Property": [pr] };
    blob[pr] = { Id: pr, Kind: "Property", Type: "Code", Name: "js_code", Code: "", FieldMapping: fm };
    blob[id]["Action::FieldMapping"] = [...(blob[id]["Action::FieldMapping"] || []), fm];
  }
  const cp = blob[fm]["FieldMapping::Property"][0];
  blob[cp] = { ...blob[cp], Code: readFileSync(here(file), "utf8") };
};
const fieldProp = (fm, name, field) => { const pr = newId("Property"); b[pr] = { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Field", Field: field, Name: name }; return pr; };
for (const [id, file] of Object.entries(plan.code || {})) setCode(b, id, file);
const later = [];
for (const [id, s] of Object.entries(plan.steps)) {
  if (s.script) { setScriptInputs(b, id, s.inputs, trig); setCode(b, id, s.script); continue; }
  const schema = (await fieldsOf(plan.id, "action", id)).body;
  const sch = Array.isArray(schema) ? schema : [];
  if (s.bulk) {
    mapAction(b, id, sch, {}, trig);
    const fm = (b[id]["Action::FieldMapping"] || []).find((y) => b[y]?.Name === s.bulk.field);
    if (!fm) { console.log(`  ${id}: no ${s.bulk.field}`); continue; }
    const base = `context.${s.bulk.src.step}.${s.bulk.src.path}`;
    const kids = s.bulk.fields.map((f) => { const ch = newId("FieldMapping"); b[ch] = { Id: ch, Kind: "FieldMapping", Type: "String", IsVisible: true, FieldMapping: fm, Name: f, Label: f }; b[ch]["FieldMapping::Property"] = [fieldProp(ch, f, `${base}.${f}`)]; return ch; });
    if (s.bulk.user) {
      // the whole user object (no nested _id child: a department review has no assignee, which a nested _id made {_id: null})
      const u = newId("FieldMapping");
      b[u] = { Id: u, Kind: "FieldMapping", Type: "Object", IsVisible: true, FieldMapping: fm, Name: s.bulk.user, Label: s.bulk.user, "FieldMapping::Property": [fieldProp(u, s.bulk.user, `${base}.${s.bulk.user}`)] };
      kids.push(u);
    }
    b[fm] = { ...b[fm], Type: "Object", IsMultiValue: true, "FieldMapping::Property": [fieldProp(fm, s.bulk.field, base)], "FieldMapping::FieldMapping": kids };
    continue;
  }
  const missing = mapAction(b, id, sch, s.map, trig);
  if (missing.length) console.log(`  ${id}: not in its schema yet:`, missing.join(", "));
  if (s.then) later.push([id, s]);
}
let put = await putDraft(plan.id, b);
console.log("PUT", put.status, put.status >= 300 ? JSON.stringify(put.body).slice(0, 300) : "");
for (const [id, s] of later) { // fields that appear only after a selection (the e-mail Body after BodyType)
  b = await getDraft(plan.id);
  const sch = (await fieldsOf(plan.id, "action", id)).body;
  const keep = Object.keys(s.map);
  const missing = mapAction(b, id, Array.isArray(sch) ? sch : [], { ...s.map, ...s.then }, trig);
  if (missing.length) console.log(`  ${id}: still not in its schema:`, missing.join(", "));
  put = await putDraft(plan.id, b);
  console.log("PUT", id, put.status, keep.length);
}
const back = await getDraft(plan.id);
for (const id of Object.keys(plan.steps)) {
  const fms = (back[id]?.["Action::FieldMapping"] || []).map((y) => back[y]).filter(Boolean);
  console.log(`  ${back[id]?.Name}: ${fms.filter((f) => (f["FieldMapping::Property"] || []).length || (f["FieldMapping::FieldMapping"] || []).length).map((f) => f.Name).join(", ").slice(0, 400)}`);
}
