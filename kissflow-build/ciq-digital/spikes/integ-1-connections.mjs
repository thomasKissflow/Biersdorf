// Step 1 (Thomas approved finishing the two test integrations, 2026-10-07): ensure one system-api-key connection
// per connector (the platform mints its own key server-side; no credential is sent). Idempotent via integrations-state.json.
import { writer } from "../../lib/meta.mjs";
import { load, save } from "./integ-state.mjs";
const w = writer(fileURLToPath(new URL("./integration-requests.jsonl", import.meta.url)));
const s = load(); s.connections = s.connections || {};
const WANT = { dataform: { id: "Co4mIEiAdtSb", ver: "1.5.4", name: "Kissflow Dataform" }, process: { id: "ComaBsL8ZTSMM", ver: "3.7.6", name: "Kissflow Process" } };
for (const [k, c] of Object.entries(WANT)) {
  if (s.connections[k]?._id) { console.log(k, "exists", s.connections[k]._id); continue; }
  const r = await w.call("POST", `/integration/2/${w.acc}/connection/${c.id}/${c.ver}/SystemApiKey`, { Name: `CIQ ZZ Spike ${c.name} connection` });
  console.log(k, r.status, JSON.stringify(r.body).slice(0, 300));
  if (r.status < 300 && r.body?._id) { s.connections[k] = { _id: r.body._id, Name: r.body.Name, connectorId: c.id, version: c.ver, connectorName: c.name, connector: r.body.Connector || null }; save(s); }
}
const list = await w.call("GET", `/integration/2/${w.acc}/connection`);
console.log("connections now:", list.status, JSON.stringify(list.body).slice(0, 500));
