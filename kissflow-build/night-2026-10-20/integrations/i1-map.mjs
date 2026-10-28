// I-1 mappings (plan v6 §4; build sheet I-1). Stages: sample | script | test <entityId> | a1 | a2
//   sample  the trigger's stored sample becomes a fictional ZZT case, so a builder or REST test creates only a ZZT request
//   script  the Run script step's inputs and code (i1-parse.js)
//   test    the builder's per-step Test over REST; the output is stored on the step (Output + IsTested), as the builder does
//   a1      Create and submit into CIQP Request: every field per the build sheet (the two user lists stay for the builder UI)
//   a2      Update an item on CIQ Case: _id ← trigger _id, Portal_Request_Item_Id ← a1 Id
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load, getDraft, putDraft, backup, fieldsOf, mapAction, setScriptInputs, testStep, call, A, summary } from "./integ-lib.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const s = load();
const st = s.integrations.I1;
const ID = st.id, T = st.tId, AS = "Action_I1_parse_assignees", APP = "CIQ_Digital_A00";
const [stage, arg] = process.argv.slice(2);
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

async function put(blob, tag) {
  const r = await putDraft(ID, blob);
  console.log(`PUT ${tag}`, r.status, r.status >= 300 ? JSON.stringify(r.body).slice(0, 400) : "");
  if (r.status >= 300) process.exit(1);
}

if (stage === "sample") {
  const b = await getDraft(ID);
  backup(ID, b, "before-sample");
  const o = b[T].Output;
  const out = typeof o === "string" ? JSON.parse(o) : { ...(o || {}) };
  const me = '[{"_id":"UsEJUfjYLM8Y"}]';
  Object.assign(out, {
    _id: "ZZT-I1-SAMPLE-CASE", Name: "ZZT-I1S", Case_Code: "ZZT-I1S", Cycle_No: 1, Request_Key: "", Supplier_Code: "ZZT-SUP-DEV",
    Trade_Name: "ZZT sample material (fictional)", Main_INCI: "Tocopherol", BDF_Material_No: "ZZT-RM-I1S", Supplier_Legal_Name: "ZZT Dev Supplier (fictional)",
    BDF_Contact_Name: "ZZT RMM (fictional)", BDF_Contact_Email: "rmm.zzt@example.com", Markets_Label: "EU", Template_Label: "ZZT template (fictional)",
    Supplier_Due_Date: plus(14), Rule_Set_Version: "ZZT-RS", Template_Version: "ZZT-TPL",
    Config_Bundle_JSON: '{"format":"ciq-bundle/1","zzt":true}', Config_Bundle_Hash: "zzt-sample", BDF_Set_JSON: "{}",
    Case_Contacts_JSON: '[{"id":"UsEJUfjYLM8Y","name":"ZZT Contact (fictional)","email":"zzt.contact@example.com","title":"","mayConfirm":true}]',
    Portal_Assignees_JSON: me, Release_Assignees_JSON: me, Portal_Request_Item_Id: "",
  });
  b[T] = { ...b[T], Output: typeof o === "string" ? JSON.stringify(out) : out };
  await put(b, "sample");
}

if (stage === "script") {
  const b = await getDraft(ID);
  backup(ID, b, "before-script-inputs");
  setScriptInputs(b, AS, {
    assignees: { trigger: "Portal_Assignees_JSON" }, releaseAssignees: { trigger: "Release_Assignees_JSON" },
    requestKey: { trigger: "Request_Key" }, caseCode: { trigger: "Case_Code" }, cycleNo: { trigger: "Cycle_No" },
  }, T);
  const fm = b[AS]["Action::FieldMapping"].find((x) => b[x]?.Name === "js_code");
  const pid = b[fm]["FieldMapping::Property"][0];
  b[pid] = { ...b[pid], Code: readFileSync(here("./i1-parse.js"), "utf8") };
  await put(b, "script");
}

if (stage === "test") {
  const eid = arg;
  const seg = eid === T ? "trigger" : "action";
  const t = await testStep(ID, seg, eid, APP);
  console.log("test", eid, t.status, JSON.stringify(t.body).slice(0, 1200));
  if (t.status < 300 && t.body && typeof t.body === "object") {
    const b = await getDraft(ID);
    b[eid] = { ...b[eid], Output: t.body, IsTested: true };
    await put(b, `output ${eid}`);
  }
}

if (stage === "a1") {
  const b = await getDraft(ID);
  backup(ID, b, "before-a1");
  const schema = (await fieldsOf(ID, "action", st.a1)).body;
  const tr = (f) => ({ trigger: f });
  const missing = mapAction(b, st.a1, schema, {
    Request_Key: { step: AS, path: "requestKey" }, Case_Code: tr("Case_Code"), Cycle_No: tr("Cycle_No"), Supplier_Code: tr("Supplier_Code"),
    App_Case_Item_Id: tr("_id"), Trade_Name: tr("Trade_Name"), Main_INCI: tr("Main_INCI"), BDF_Material_No: tr("BDF_Material_No"),
    Supplier_Display_Name: tr("Supplier_Legal_Name"), BDF_Contact_Name: tr("BDF_Contact_Name"), BDF_Contact_Email: tr("BDF_Contact_Email"),
    Markets_Label: tr("Markets_Label"), Template_Label: tr("Template_Label"), Supplier_Due_Date: tr("Supplier_Due_Date"),
    Rule_Set_Version: tr("Rule_Set_Version"), Template_Version: tr("Template_Version"), Config_Bundle_JSON: tr("Config_Bundle_JSON"),
    Config_Bundle_Hash: tr("Config_Bundle_Hash"), BDF_Set_JSON: tr("BDF_Set_JSON"), Case_Contacts_JSON: tr("Case_Contacts_JSON"),
    Case_Phase_Label: { value: "Filling in" }, Request_Locked: { value: "No" }, Manual_Scope_JSON: { value: "[]" },
  }, T, ["Assigned_Contacts", "Release_Contacts"]);
  if (missing.length) console.log("NOT in the CIQP Request schema:", missing.join(", "));
  await put(b, "a1");
  console.log("read-back", JSON.stringify(summary(await getDraft(ID)).ents.find((e) => e.id === st.a1)));
}

if (stage === "a2") {
  const b = await getDraft(ID);
  backup(ID, b, "before-a2");
  const schema = (await fieldsOf(ID, "action", st.a2)).body;
  const missing = mapAction(b, st.a2, schema, { _id: { trigger: "_id" }, Portal_Request_Item_Id: { step: st.a1, path: "Id" } }, T);
  if (missing.length) console.log("NOT in the CIQ Case schema:", missing.join(", "));
  await put(b, "a2");
  console.log("read-back", JSON.stringify(summary(await getDraft(ID)).ents.find((e) => e.id === st.a2)));
}
