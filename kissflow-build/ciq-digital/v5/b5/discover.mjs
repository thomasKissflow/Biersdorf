// B5 discovery (READ-ONLY, GET only via client({ readOnly: true })): what the Email connector needs (auth/connection type,
// action ids and fields), the Dataform UpdateAnItem action, the existing connections, and the integration list.
import { writeFileSync } from "node:fs";
import { client } from "../../../lib/kf.mjs";
const kf = client({ readOnly: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { readAt: new Date().toISOString(), calls: [] };
async function get(path) { await sleep(1200); const r = await kf.get(path); out.calls.push({ path: path.replace(kf.acc, "{acc}"), status: r.status }); if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error("STOP: HTML challenge"); if (r.status === 429) throw new Error("STOP: 429"); return r; }
const ents = (b) => Object.values(b || {}).filter((e) => e && typeof e === "object" && e.Kind);
const em = await get(`/connector/2/${kf.acc}/CoOj46v9fVh37/metadata/1.0.6`);
const b = em.body || {};
out.email = { status: em.status, kinds: ents(b).reduce((m, e) => ((m[e.Kind] = (m[e.Kind] || 0) + 1), m), {}),
  root: b[b.Root] ? Object.fromEntries(Object.entries(b[b.Root]).filter(([k, v]) => typeof v !== "object" || Array.isArray(v)).map(([k, v]) => [k, Array.isArray(v) ? v : v])) : null,
  auth: ents(b).filter((e) => /Auth/i.test(e.Kind)).map((e) => ({ Id: e.Id, Kind: e.Kind, Type: e.Type, Name: e.Name })),
  actions: ents(b).filter((e) => e.Kind === "Action").map((e) => ({ Id: e.Id, Name: e.Name, Type: e.Type, Description: (e.Description || "").slice(0, 200), fields: (e["Action::Field"] || e["Action::ActionField"] || []).map((f) => ({ Id: b[f]?.Id, Name: b[f]?.Name, Label: b[f]?.Label, Type: b[f]?.Type, Req: b[f]?.IsRequired })) })),
};
const df = await get(`/connector/2/${kf.acc}/Co4mIEiAdtSb/metadata/1.5.4`);
const d = df.body || {};
const ua = d.UpdateAnItem;
out.dataformUpdate = ua ? { Id: ua.Id, Kind: ua.Kind, Name: ua.Name, Type: ua.Type, keys: Object.keys(ua), fields: Object.entries(ua).filter(([k]) => /::/.test(k)).map(([k, v]) => [k, (v || []).map((x) => ({ Id: d[x]?.Id, Kind: d[x]?.Kind, Name: d[x]?.Name, Label: d[x]?.Label, Type: d[x]?.Type, Req: d[x]?.IsRequired }))]) } : null;
const conns = await get(`/integration/2/${kf.acc}/connection`);
out.connections = (Array.isArray(conns.body) ? conns.body : conns.body?.Data || []).map((c) => ({ _id: c._id, Name: c.Name, Connector: c.Connector?.Name ?? c.Connector, Version: c.Connector?.Version, AuthType: c.AuthType ?? c.Type }));
const ints = await get(`/flow/2/${kf.acc}/integration/?_application_id=CIQ_Digital_A00&page_number=1&page_size=50`);
out.integrations = (Array.isArray(ints.body) ? ints.body : ints.body?.Data || []).map((x) => ({ _id: x._id, Name: x.Name, Status: x.Status, IsActive: x.IsActive }));
writeFileSync(new URL("./discover-result.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 6000));
