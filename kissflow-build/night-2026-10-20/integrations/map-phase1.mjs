// 22 Oct, load-time redesign phase 1: fills the field mappings and scripts of the steps Thomas created in the builder
// (INTEGRATIONS-SKELETON-SHEET.md §1, §3), found by their step names. His trigger, process selectors and connections are
// kept; only mappings and code are written. Backs up the live draft first, then PUTs and reads back.
//   node map-phase1.mjs EB|I6            dry run (prints what it would map)
//   node map-phase1.mjs EB|I6 --apply
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { call, A, backup, getDraft, putDraft, fieldsOf, mapAction, setScriptInputs, newId } from "./integ-lib.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const [KEY] = process.argv.slice(2), apply = process.argv.includes("--apply");
const APP = "CIQ_Digital_A00";
const R = (step, path) => ({ ref: step, path });           // an earlier step (by name) → path
// FIXTURE_CASE (22 Oct): an event trigger's builder test gives only placeholder data, so for the test pass the case id
// is fed as a value (the ZZT fixture case); the mapping is set back to the trigger field afterwards
const T = (field) => (process.env.FIXTURE_CASE && field === "Case_Item_Id" ? { value: process.env.FIXTURE_CASE } : { trigger: field });
const PLAN = {
  EB: {
    name: /^CIQ Review completed/i,
    steps: {
      "EB find reviews": { lookupValue: T("Case_Item_Id") },
      "EB find case": { lookupValue: T("Case_Item_Id") },
      "EB pick": { script: "scripts/eb-pick.js", inputs: { caseItemId: T("Case_Item_Id"), rows: R("EB find case", "Data") } },
      "EB find request": { lookupValue: R("EB pick", "requestId") },
      "EB release check": { script: "scripts/eb-release.js", inputs: {
        caseId: R("EB pick", "caseId"), requestId: R("EB pick", "requestId"), caseCode: R("EB pick", "caseCode"), cycleNo: R("EB pick", "cycleNo"),
        releaseAssigneesJson: R("EB pick", "releaseAssigneesJson"), reviews: R("EB find reviews", "Data"), requests: R("EB find request", "Data") } },
      "EB ask final release": { map: { _id: R("EB release check", "requestId"), ...Object.fromEntries(["Release_Flag", "Request_Locked", "Case_Phase_Label", "Release_At", "Release_By_Name", "Release_By_Email", "Release_By_Role"].map((f) => [f, R("EB release check", f)])) },
        list: { Release_Contacts: R("EB release check", "releaseContacts") } },
      "EB record on case": { map: { _id: R("EB release check", "caseId"), Release_Requested_At: R("EB release check", "releaseRequestedAt") } },
      "EB history row": { map: Object.fromEntries(["Event_Key", "Case_Code", "Cycle_No", "Case_Item_Id", "Event_At", "Event_Category", "Action_Code", "Actor_Side", "Actor_Name", "Object_Kind", "Object_Key", "Object_Item_Id", "Object_State", "New_Value_Text", "Snapshot_JSON"].map((f) => [f, R("EB release check", f)])) },
      "EB move request": { map: { instance_id: R("EB release check", "instanceId"), activity_id: R("EB release check", "activityInstanceId") } },
    },
  },
  I6: {
    name: /^CIQ Review reopened to supplier request$/,
    script: { "Action_I6_4_waiting": "scripts/i6-request.js" }, // its code now also returns activityInstanceId
    steps: { "I6 move request back": { map: { instance_id: R("Action_I6_4_waiting", "requestId"), activity_id: R("Action_I6_4_waiting", "activityInstanceId") } } },
  },
};
const plan = PLAN[KEY];
if (!plan) throw new Error("usage: map-phase1.mjs EB|I6 [--apply]");
const list = (await call("GET", `/flow/2/${A}/integration?_application_id=${APP}&page_number=1&page_size=100`)).body;
const integ = (Array.isArray(list) ? list : list?.Data || []).find((x) => plan.name.test(x.Name || ""));
if (!integ) throw new Error(`integration ${plan.name} not found in ${APP}`);
const b = await getDraft(integ._id);
const root = b.Root, trig = (b[root]["Integration::Trigger"] || [])[0];
const acts = b[root]["Integration::Action"] || [];
const byName = Object.fromEntries(acts.map((id) => [String(b[id]?.Name || "").trim(), id]));
console.log(integ._id, integ.Name, "| trigger", b[trig]?.Connector?.TriggerName, "| steps:", acts.map((id) => b[id]?.Name).join(" · "));
const idOf = (n) => byName[n] || (b[n] ? n : null);
const src = (s) => (s.trigger !== undefined || s.value !== undefined ? s : { step: idOf(s.ref) ?? (() => { throw new Error(`no step "${s.ref}"`); })(), path: s.path });
if (!apply) { for (const n of Object.keys(plan.steps)) console.log(idOf(n) ? "  found" : "  MISSING", n); process.exit(0); }
backup(integ._id, b, "before-map-phase1");
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
for (const [id, file] of Object.entries(plan.script || {})) setCode(b, id, file);
for (const [n, s] of Object.entries(plan.steps)) {
  const id = idOf(n);
  if (!id) throw new Error(`step "${n}" not found: name it exactly as in the sheet`);
  if (s.script) {
    setScriptInputs(b, id, Object.fromEntries(Object.entries(s.inputs).map(([k, v]) => [k, src(v)])), trig);
    setCode(b, id, s.script);
    continue;
  }
  const schema = (await fieldsOf(integ._id, "action", id)).body;
  const map = s.lookupValue ? { lookupValue: src(s.lookupValue) } : Object.fromEntries(Object.entries(s.map).map(([k, v]) => [k, src(v)]));
  const missing = mapAction(b, id, Array.isArray(schema) ? schema : [], map, trig);
  if (missing.length) console.log(`  ${n}: not in its schema:`, missing.join(", "));
  for (const [field, v] of Object.entries(s.list || {})) {
    const fm = (b[id]["Action::FieldMapping"] || []).find((y) => b[y]?.Name === field);
    if (!fm) { console.log(`  ${n}: no list field ${field}`); continue; }
    const from = src(v), pr = newId("Property"), ch = newId("FieldMapping"), cpr = newId("Property");
    b[fm] = { ...b[fm], Type: "Object", IsMultiValue: true, "FieldMapping::Property": [pr], "FieldMapping::FieldMapping": [ch] };
    b[pr] = { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Field", Field: `context.${from.step}.${from.path}`, Name: field };
    b[ch] = { Id: ch, Kind: "FieldMapping", Type: "String", IsVisible: true, FieldMapping: fm, Name: "_id", Label: "_id", "FieldMapping::Property": [cpr] };
    b[cpr] = { Id: cpr, Kind: "Property", FieldMapping: ch, Type: "Field", Field: `context.${from.step}.${from.path}._id`, Name: "_id" };
  }
}
const put = await putDraft(integ._id, b);
console.log("PUT", put.status, put.status >= 300 ? JSON.stringify(put.body).slice(0, 300) : "");
const back = await getDraft(integ._id);
for (const n of Object.keys(plan.steps)) {
  const id = idOf(n), fms = (back[id]?.["Action::FieldMapping"] || []).map((y) => back[y]).filter(Boolean);
  const bound = fms.filter((f) => (f["FieldMapping::Property"] || []).length || (f["FieldMapping::FieldMapping"] || []).length).map((f) => f.Name);
  console.log(`  ${n}: ${bound.length} mapped (${bound.join(", ").slice(0, 300)})`);
}
