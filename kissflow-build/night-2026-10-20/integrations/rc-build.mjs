// request.changed (plan v6 §4.2), in the PORTAL: the supplier's screen POSTs {portalRequestItemId}; the integration reads
// that request and copies its 15 answer fields to the CIQ Case named by the request's own App_Case_Item_Id.
//   Trigger  Webhooks by Kissflow · Catch a webhook (POST)
//   a1       Kissflow Process · Search an item (CIQP Request, by _id)
//   a2       Kissflow Process · Update an item (CIQ Case: _id ← a1.App_Case_Item_Id, 15 fields ← a1)
// Stages: create | skeleton | fields | bind | map
import { call, A, load, save, backup, getDraft, putDraft, fieldsOf, CONNECTIONS, connectorRef, summary, mapAction, setSelector } from "./integ-lib.mjs";

const APP = "CIQ_Supplier_Portal_A00";
const NAME = "CIQP Request changed to case";
const DESC = "Plan v6 §4.2 request.changed: the supplier's screen posts {portalRequestItemId}; the request's 15 answer fields are copied to the CIQ Case named by its App_Case_Item_Id.";
export const SYNCED = ["Config_Answers_JSON", "Answers_JSON", "Answered_By_JSON", "Justifications_JSON", "Components_JSON", "Scope_JSON", "Requested_Docs_JSON", "Documents_JSON",
  "Answers_Rev", "Answers_Changed_At", "Answers_Changed_By_Email", "Change_Report_Text", "Change_Report_Rev", "Change_Report_By_Email", "Change_Report_At"];
const s = load();
const st = (s.integrations.RC ||= {});
const stage = process.argv[2];
const T = "Trigger_RC_webhook", A1 = "Action_RC_read_request", A2 = "Action_RC_update_case";

if (stage === "create") {
  if (st.id) { console.log("exists", st.id); process.exit(0); }
  const list = (await call("GET", `/flow/2/${A}/integration/?_application_id=${APP}&page_number=1&page_size=100`)).body;
  const dupe = (Array.isArray(list) ? list : []).find((x) => x.Name === NAME);
  if (dupe) { st.id = dupe._id; save(s); console.log("found existing", dupe._id); process.exit(0); }
  const r = await call("POST", `/flow/2/${A}/integration/?_application_id=${APP}`, { Name: NAME, Description: DESC });
  console.log("create", r.status, JSON.stringify(r.body).slice(0, 300));
  if (r.status < 300 && r.body?._id) { st.id = r.body._id; save(s); backup(st.id, await getDraft(st.id), "created"); }
}

if (stage === "skeleton") {
  const live = await getDraft(st.id);
  backup(st.id, live, "before-skeleton");
  const root = live.Root;
  if ((live[root]["Integration::Trigger"] || []).length) { console.log("already has a trigger:", JSON.stringify(summary(live))); process.exit(0); }
  const blob = { ...live };
  blob[root] = { ...live[root], "Integration::Trigger": [T], "Integration::Action": [A1, A2] };
  blob[T] = { Id: T, Kind: "Trigger", Type: "Create", Name: "Catch a webhook (POST)", IsInternalAuth: true, Connection: {}, Integration: root,
    Connector: await connectorRef("webhook", { TriggerId: "WebhookTrigger", TriggerName: "Catch a webhook (POST)" }) };
  blob[A1] = { Id: A1, Kind: "Action", Type: "Search", Name: "Search an item", IsInternalAuth: false, Connection: CONNECTIONS.process, Integration: root,
    Connector: await connectorRef("process", { ActionId: "Action_Kh4Jb2AoG", ActionName: "Search an item " }), "Action::FieldMapping": [] };
  blob[A2] = { Id: A2, Kind: "Action", Type: "Update", Name: "Update an item", IsInternalAuth: false, Connection: CONNECTIONS.process, Integration: root,
    Connector: await connectorRef("process", { ActionId: "UpdateAnItem", ActionName: "Update an item" }), "Action::FieldMapping": [] };
  const pd = await putDraft(st.id, blob);
  console.log("PUT skeleton", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  Object.assign(st, { tId: T, a1: A1, a2: A2 }); save(s);
  console.log("read-back", JSON.stringify(summary(await getDraft(st.id))));
}

if (stage === "fields") {
  for (const [seg, eid] of [["trigger", T], ["action", A1], ["action", A2]]) {
    const r = await fieldsOf(st.id, seg, eid);
    const strip = (f) => { const c = { ...f }; if (c.Dropdown) c.Dropdown = { Id: c.Dropdown.Id }; delete c["Field::Field"]; return JSON.stringify(c).slice(0, 300); };
    console.log("##", seg, eid, r.status, Array.isArray(r.body) ? `${r.body.length} fields` : JSON.stringify(r.body).slice(0, 400));
    if (Array.isArray(r.body)) for (const f of r.body.slice(0, 12)) console.log("  ", strip(f));
  }
}

const AS = "Action_RC_pick_request";
if (stage === "bind") {
  const { readFileSync } = await import("node:fs");
  const live = await getDraft(st.id);
  backup(st.id, live, "before-bind");
  const b = { ...live };
  const root = b.Root;
  const s1 = (await fieldsOf(st.id, "action", A1)).body;
  setSelector(b, A1, "Action", s1.find((f) => f.Name === "process_id"), "CIQP_Request_A00", "CIQP Request - CIQ Supplier Portal");
  const s2 = (await fieldsOf(st.id, "action", A2)).body;
  setSelector(b, A2, "Action", s2.find((f) => f.Name === "process_id"), "CIQ_Case_A00", "CIQ Case - CIQ Digital");
  mapAction(b, A1, s1, { lookupValue: { trigger: "portalRequestItemId" } }, T);
  if (!b[AS]) {
    b[AS] = { Id: AS, Kind: "Action", Type: "Create", Name: "Run JavaScript", IsInternalAuth: true, Connection: {}, Integration: root,
      Connector: await connectorRef("script", { ActionId: "RunJSCode", ActionName: "Run JavaScript" }), "Action::FieldMapping": [] };
    b[root] = { ...b[root], "Integration::Action": [A1, AS, A2] };
  }
  const { setScriptInputs, newId } = await import("./integ-lib.mjs");
  setScriptInputs(b, AS, { requestId: { trigger: "portalRequestItemId" }, rows: { step: A1, path: "Data" } }, T);
  let codeFm = (b[AS]["Action::FieldMapping"] || []).find((x) => b[x]?.Name === "js_code");
  if (!codeFm) {
    codeFm = newId("FieldMapping"); const pr = newId("Property");
    b[codeFm] = { Id: codeFm, Kind: "FieldMapping", Type: "Code", FieldId: "JSCode", Label: "JavaScript code", Name: "js_code", IsRequired: true, IsDropdown: false, IsPaginated: false, AutoRefresh: false, CodeLanguage: "javascript", Action: AS, "FieldMapping::Property": [pr] };
    b[pr] = { Id: pr, Kind: "Property", Type: "Code", Name: "js_code", Code: "", FieldMapping: codeFm };
    b[AS]["Action::FieldMapping"] = [...b[AS]["Action::FieldMapping"], codeFm];
  }
  const pid = b[codeFm]["FieldMapping::Property"][0];
  b[pid] = { ...b[pid], Code: readFileSync(new URL("./rc-pick.js", import.meta.url), "utf8") };
  const pd = await putDraft(st.id, b);
  console.log("PUT bind", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  st.aS = AS; save(s);
  console.log("read-back", JSON.stringify(summary(await getDraft(st.id)).ents.map((e) => `${e.id}:${e.entity}:${e.props.join(",")}`)).slice(0, 1200));
}

if (stage === "map") {
  const live = await getDraft(st.id);
  backup(st.id, live, "before-map");
  const b = { ...live };
  const s2 = (await fieldsOf(st.id, "action", A2)).body;
  const map = { _id: { step: AS, path: "caseId" } };
  for (const f of SYNCED) map[f] = { step: AS, path: f };
  const missing = mapAction(b, A2, s2, map, T);
  if (missing.length) console.log("NOT in the CIQ Case schema:", missing.join(", "));
  const pd = await putDraft(st.id, b);
  console.log("PUT map", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  console.log("read-back", JSON.stringify(summary(await getDraft(st.id)).ents.find((e) => e.id === A2)?.props));
}
