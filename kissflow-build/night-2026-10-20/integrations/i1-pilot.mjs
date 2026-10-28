// Pilot: I-1 (plan v6 §4), built with native Kissflow Process actions (no HTTP, no custom key).
//   Trigger  Kissflow Process · CIQ Case · "When an item enters this step" = "Waiting for supplier: CIQ"
//   a1       Kissflow Process · "Create and submit a new item" into the portal's CIQP Request
//   a2       Kissflow Process · "Update an item" on the case: Portal_Request_Item_Id ← a1._id
// Stages (each idempotent, state in state.json):  node i1-pilot.mjs create | skeleton | fields
import { call, A, load, save, backup, getDraft, putDraft, fieldsOf, CONNECTIONS, connectorRef, summary } from "./integ-lib.mjs";

const APP = "CIQ_Digital_A00";
const NAME = "CIQ I-1 Case to supplier request";
const DESC = "Plan v6 I-1: when a CIQ Case enters 'Waiting for supplier: CIQ', create the supplier's CIQP Request in the portal and store its id on the case.";
const stage = process.argv[2];
const s = load();
const st = (s.integrations.I1 ||= {});

if (stage === "create") {
  if (st.id) { console.log("exists", st.id); process.exit(0); }
  const list = (await call("GET", `/flow/2/${A}/integration/?_application_id=${APP}&page_number=1&page_size=100`)).body;
  const dupe = (Array.isArray(list) ? list : []).find((x) => x.Name === NAME);
  if (dupe) { st.id = dupe._id; save(s); console.log("found existing", dupe._id); process.exit(0); }
  const r = await call("POST", `/flow/2/${A}/integration/?_application_id=${APP}`, { Name: NAME, Description: DESC });
  console.log("create", r.status, JSON.stringify(r.body).slice(0, 400));
  if (r.status < 300 && r.body?._id) { st.id = r.body._id; save(s); }
  const d = await getDraft(st.id);
  backup(st.id, d, "created");
  console.log("draft", JSON.stringify(d).slice(0, 800));
}

if (stage === "skeleton") {
  const live = await getDraft(st.id);
  backup(st.id, live, "before-skeleton");
  const root = live.Root;
  if ((live[root]["Integration::Trigger"] || []).length) { console.log("already has a trigger:", JSON.stringify(summary(live))); process.exit(0); }
  const tId = "Trigger_I1_case_enters_wait", a1 = "Action_I1_create_request", a2 = "Action_I1_store_request_id";
  const blob = { ...live };
  blob[root] = { ...live[root], "Integration::Trigger": [tId], "Integration::Action": [a1, a2] };
  blob[tId] = { Id: tId, Kind: "Trigger", Type: "App", Name: "When an item enters this step", IsInternalAuth: false, Connection: CONNECTIONS.process, Integration: root,
    Connector: await connectorRef("process", { TriggerId: "ItemEntersToStep", TriggerName: "When an item enters this step" }), "Trigger::FieldMapping": [] };
  blob[a1] = { Id: a1, Kind: "Action", Type: "Create", Name: "Create and submit a new item", IsInternalAuth: false, Connection: CONNECTIONS.process, Integration: root,
    Connector: await connectorRef("process", { ActionId: "CreateAndSubmitItem", ActionName: "Create and submit a new item" }), "Action::FieldMapping": [] };
  blob[a2] = { Id: a2, Kind: "Action", Type: "Update", Name: "Update an item", IsInternalAuth: false, Connection: CONNECTIONS.process, Integration: root,
    Connector: await connectorRef("process", { ActionId: "UpdateAnItem", ActionName: "Update an item" }), "Action::FieldMapping": [] };
  const pd = await putDraft(st.id, blob);
  console.log("PUT skeleton", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  Object.assign(st, { tId, a1, a2, skeleton: pd.status }); save(s);
  console.log("read-back", JSON.stringify(summary(await getDraft(st.id))));
}

if (stage === "fields") {
  for (const [seg, eid] of [["trigger", st.tId], ["action", st.a1], ["action", st.a2]]) {
    const r = await fieldsOf(st.id, seg, eid);
    console.log("##", seg, eid, r.status, JSON.stringify(r.body).slice(0, 1500));
  }
}

// ---- bind: the trigger's process + step, each action's process; a fictional ZZT sample as the trigger Output ----
let n = 0;
const eid = (p, tag) => `${p}_I1${tag}_${(++n).toString(36)}${Date.now().toString(36).slice(-4)}`;
export function setSelector(blob, entityId, kind, schemaField, valueId, valueName) {
  for (const k of Object.keys(blob)) {
    const e = blob[k];
    if (e?.Kind === "FieldMapping" && e[kind] === entityId && e.Name === schemaField.Name) { for (const p of e["FieldMapping::Property"] || []) delete blob[p]; delete blob[k]; }
  }
  const fm = eid("FieldMapping", kind[0]), pr = eid("Property", kind[0]);
  blob[fm] = { Id: fm, Kind: "FieldMapping", Type: schemaField.Type || "String", FieldId: schemaField.Id, Label: schemaField.Label, Name: schemaField.Name, IsRequired: true, IsDropdown: true, AutoRefresh: true, [kind]: entityId,
    SelectedDropdown: [{ FieldId: valueId, FieldName: valueName, IsSubArray: false }], "FieldMapping::Property": [pr] };
  blob[pr] = { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Value", Value: [valueId], Name: schemaField.Name };
  const key = `${kind}::FieldMapping`;
  blob[entityId][key] = [...(blob[entityId][key] || []).filter((x) => blob[x]), fm];
}
if (stage === "bind") {
  const apps = (await call("POST", `/flow/2/${A}/permissible`, { Filter: { LHSField: "Type", RHSValue: "Application,Portal", Operator: "PART_OF" } })).body;
  const appName = (id) => (Array.isArray(apps) ? apps : []).find((x) => x._id === id)?.Name;
  console.log("app names:", appName("CIQ_Digital_A00"), "|", appName("CIQ_Supplier_Portal_A00"));
  const label = (name, app) => (appName(app) ? `${name} - ${appName(app)}` : name);
  const live = await getDraft(st.id);
  backup(st.id, live, "before-bind");
  const blob = { ...live };
  const tS = (await fieldsOf(st.id, "trigger", st.tId)).body;
  setSelector(blob, st.tId, "Trigger", tS.find((f) => f.Name === "process_id"), "CIQ_Case_A00", "CIQ Case");
  setSelector(blob, st.tId, "Trigger", tS.find((f) => f.Name === "step_id"), "Activity_1kltjdn", "Waiting for supplier: CIQ");
  const a1S = (await fieldsOf(st.id, "action", st.a1)).body;
  setSelector(blob, st.a1, "Action", a1S.find((f) => f.Name === "process_id"), "CIQP_Request_A00", label("CIQP Request", "CIQ_Supplier_Portal_A00"));
  const a2S = (await fieldsOf(st.id, "action", st.a2)).body;
  setSelector(blob, st.a2, "Action", a2S.find((f) => f.Name === "process_id"), "CIQ_Case_A00", label("CIQ Case", "CIQ_Digital_A00"));
  const pd = await putDraft(st.id, blob);
  console.log("PUT bind", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  st.bind = pd.status; save(s);
  console.log("read-back", JSON.stringify(summary(await getDraft(st.id))));
}

// ---- script: a Run script step before a1 that parses the case's assignee JSON into user lists ----
if (stage === "script") {
  const live = await getDraft(st.id);
  backup(st.id, live, "before-script");
  const root = live.Root, aS = "Action_I1_parse_assignees";
  if (live[aS]) { console.log("script step exists"); }
  else {
    const blob = { ...live };
    blob[aS] = { Id: aS, Kind: "Action", Type: "Create", Name: "Run JavaScript", IsInternalAuth: true, Connection: {}, Integration: root,
      Connector: await connectorRef("script", { ActionId: "RunJSCode", ActionName: "Run JavaScript" }), "Action::FieldMapping": [] };
    blob[root] = { ...live[root], "Integration::Action": [aS, ...live[root]["Integration::Action"].filter((x) => x !== aS)] };
    const pd = await putDraft(st.id, blob);
    console.log("PUT script step", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
    st.aS = aS; save(s);
  }
  const r = await fieldsOf(st.id, "action", aS);
  for (const f of Array.isArray(r.body) ? r.body : []) { const c = { ...f }; if (c.Dropdown) c.Dropdown = { Id: c.Dropdown.Id }; console.log(JSON.stringify(c).slice(0, 700)); }
  if (!Array.isArray(r.body)) console.log(r.status, JSON.stringify(r.body).slice(0, 500));
  console.log("read-back", JSON.stringify(summary(await getDraft(st.id))));
}
