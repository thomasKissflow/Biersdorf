// Read-only: the account's integration connections, NAMES AND TYPES ONLY (no secret value is ever printed).
import { client } from "../lib/kf.mjs";
const kf = client({ readOnly: true });
const r = await kf.get(`/integration/2/${kf.acc}/connection`);
const rows = Array.isArray(r.body) ? r.body : r.body?.Data || [];
console.log(r.status, rows.length, "connections");
for (const c of rows) {
  const safe = { id: c._id, name: c.Name, connector: c.Connector?.Name || c.ConnectorName || c.connectorName, version: c.Connector?.Version || c.Version, authType: c.AuthType || c.Type || c.AuthenticationType, app: c._application_id, keys: Object.keys(c).filter((k) => !/secret|token|password|key|auth|header|credential/i.test(k)).join(",") };
  console.log(JSON.stringify(safe));
}
