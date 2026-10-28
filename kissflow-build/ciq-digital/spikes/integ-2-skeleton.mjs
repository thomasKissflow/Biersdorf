// Step 2: pass-1 skeleton for both test integrations (trigger + action with connector, connection, ids; no mappings),
// then read the server-resolved field schema for each trigger and action. Saves entity ids in integrations-state.json.
import { writer } from "../../lib/meta.mjs";
import { load, save } from "./integ-state.mjs";
const w = writer(fileURLToPath(new URL("./integration-requests.jsonl", import.meta.url)));
const s = load(); s.integrations = s.integrations || {};
const subs = (await w.call("GET", `/connector/2/${w.acc}/subscription?page_number=1&page_size=200`)).body;
const logo = (id) => subs.find((c) => c._id === id)?.Logo;
const conn = (k) => ({ _id: s.connections[k]._id, Name: s.connections[k].Name });
const connector = (k, extra) => ({ _id: s.connections[k].connectorId, Name: s.connections[k].connectorName, Version: s.connections[k].version, Logo: logo(s.connections[k].connectorId), Status: "Published", WebsiteURL: "https://kissflow.com", ...extra });
const DEFS = [
  { id: "CIQ_ZZ_Spike_log_register_created_A00", trig: ["dataform", "ItemCreated", "When an item is added to a dataform"], act: ["dataform", "CreateAndSubmitItem", "Create and submit an item"] },
  { id: "CIQ_ZZ_Spike_log_point_completed_A00", trig: ["process", "ItemCompleted", "When an item completes its workflow"], act: ["dataform", "CreateAndSubmitItem", "Create and submit an item"] },
];
for (const d of DEFS) {
  const live = (await w.getDraft("integration", d.id)).body;
  const root = live.Root, tId = `Trigger_${d.id.slice(-12)}`, aId = `Action_${d.id.slice(-12)}`;
  const blob = { ...live };
  blob[root] = { ...live[root], "Integration::Trigger": [tId], "Integration::Action": [aId] };
  blob[tId] = { Id: tId, Kind: "Trigger", Type: "App", Name: d.trig[2], IsInternalAuth: false, Connection: conn(d.trig[0]), Integration: root,
    Connector: connector(d.trig[0], { TriggerId: d.trig[1], TriggerName: d.trig[2] }), "Trigger::FieldMapping": [] };
  blob[aId] = { Id: aId, Kind: "Action", Type: "Create", Name: d.act[2], IsInternalAuth: false, Connection: conn(d.act[0]), Integration: root,
    Connector: connector(d.act[0], { ActionId: d.act[1], ActionName: d.act[2] }), "Action::FieldMapping": [] };
  const pd = await w.putDraft("integration", d.id, blob);
  console.log("##", d.id, "PUT skeleton", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 300) : "");
  s.integrations[d.id] = { tId, aId, trig: d.trig, act: d.act, skeleton: pd.status }; save(s);
  for (const [seg, eid] of [["trigger", tId], ["action", aId]]) {
    const r = await w.call("GET", `/integration/2/${w.acc}/${d.id}/${seg}/${eid}/fields`);
    console.log("  ", seg, r.status, JSON.stringify(r.body).slice(0, 700));
  }
}
