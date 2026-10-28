// K-09f (read-only): what can the "Kissflow Dataform" connector trigger on and do? Compared with "Kissflow Process". No writes.
import { writeFileSync } from "node:fs";
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
const out = { readAt: new Date().toISOString(), calls: [] };
async function get(path) { const r = await kf.get(path); out.calls.push({ path, status: r.status }); return r; }
const subs = await get(`/connector/2/${kf.acc}/subscription?page_number=1&page_size=200`);
const list = Array.isArray(subs.body) ? subs.body : [];
out.subscriptionCount = list.length;
const wanted = list.filter((c) => /^Kissflow (Dataform|Process)$/.test((c.Name || "").trim()));
out.connectors = wanted.map((c) => ({ _id: c._id, Name: c.Name, VersionName: c.VersionName, TriggerCount: c.TriggerCount, ActionCount: c.ActionCount }));
const brief = (x) => (x && typeof x === "object" ? { Id: x.Id ?? x._id, Name: x.Name ?? x.Label, Label: x.Label, Type: x.Type, Description: (x.Description || "").slice(0, 160) } : x);
for (const c of wanted) {
  const m = await get(`/connector/2/${kf.acc}/${c._id}/metadata/${c.VersionName}`);
  const b = m.body || {};
  const pickArr = (k) => { const v = b[k] ?? b[k.toLowerCase()]; return Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []; };
  out[c.Name.trim()] = { status: m.status, topKeys: Object.keys(b), triggers: pickArr("Triggers").map(brief), actions: pickArr("Actions").map(brief) };
}
writeFileSync(new URL("./k09f-dataform-connector-result.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
