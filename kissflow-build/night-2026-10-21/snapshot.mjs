// Read-only snapshot of both containers (21 Oct night tests): every flow (process, dataform, list, integration, board,
// dataset) with its draft metadata, the published status from the flow list, every role with its members, and the
// CIQ Config Version rows. Paced 1.3 s; stops on a 429 or an HTML answer. Writes snapshot/*.json.
//   node kissflow-build/night-2026-10-21/snapshot.mjs
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./snapshot-requests.jsonl"));
const A = w.acc;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (m, p, b) => { await sleep(1300); const r = await w.call(m, p, b); if (r.status === 429 || (typeof r.body === "string" && /<html/i.test(r.body))) throw new Error(`stopped on ${r.status}: wait 20 minutes`); return r; };
const APPS = ["CIQ_Digital_A00", "CIQ_Supplier_Portal_A00"];
const TYPES = ["process", "form", "list", "integration", "case", "dataset"];
const out = { at: new Date().toISOString(), apps: {} };
for (const app of APPS) {
  const a = (out.apps[app] = { flows: {}, roles: [] });
  for (const type of TYPES) {
    const r = await call("GET", `/flow/2/${A}/${type}/?_application_id=${app}&page_number=1&page_size=300`);
    const list = Array.isArray(r.body) ? r.body : r.body?.Data || [];
    if (r.status >= 300) { a.flows[`__${type}_error`] = { status: r.status, body: JSON.stringify(r.body).slice(0, 200) }; continue; }
    for (const f of list) {
      const file = here(`./snapshot/${app}.${type}.${f._id}.json`);
      if (existsSync(file)) { a.flows[f._id] = JSON.parse(readFileSync(file, "utf8")); continue; } // resumable after a pause
      const metaType = type;
      // a list has no draft metadata route (404): its values come from its items route
      const d = type === "list" ? await call("GET", `/flow/2/${A}/list/${f._id}/items`) : await call("GET", `/metadata/2/${A}/${metaType}/${f._id}/draft?_application_id=${app}`);
      a.flows[f._id] = { type, name: f.Name, status: f.Status, isActive: f.IsActive, list: f, draftStatus: d.status, draft: d.status < 300 ? d.body : String(JSON.stringify(d.body)).slice(0, 300) };
      writeFileSync(file, JSON.stringify(a.flows[f._id], null, 1));
    }
    console.log(app, type, list.length);
  }
  const roles = await call("GET", `/app_role/2/${A}/list?_application_id=${app}&page_number=1&page_size=100`);
  for (const r0 of roles.body?.Data || roles.body || []) {
    const g = await call("GET", `/app_role/2/${A}/${r0._id}?_application_id=${app}`);
    a.roles.push({ _id: r0._id, Name: r0.Name, UserCount: g.body?.UserCount, Members: (g.body?.Members || []).map((m) => ({ _id: m._id, Name: m.Name, Kind: m.Kind })) });
  }
  console.log(app, "roles", a.roles.length);
}
const cfg = await call("POST", `/form/2/${A}/CIQ_Config_Version_A00/list?page_number=1&page_size=200&_application_id=CIQ_Digital_A00`, {});
out.configRows = (cfg.body?.Data || cfg.body || []).map((r) => r._id);
const full = [];
for (const id of out.configRows) full.push((await call("GET", `/form/2/${A}/CIQ_Config_Version_A00/${id}?_application_id=CIQ_Digital_A00`)).body);
writeFileSync(here("./snapshot/config-rows.json"), JSON.stringify(full, null, 1));
writeFileSync(here("./snapshot/index.json"), JSON.stringify({ at: out.at, apps: Object.fromEntries(Object.entries(out.apps).map(([k, v]) => [k, { flows: Object.fromEntries(Object.entries(v.flows).map(([id, f]) => [id, { type: f.type, name: f.name, status: f.status, isActive: f.isActive, draftStatus: f.draftStatus }])), roles: v.roles }])), configRows: out.configRows.length }, null, 1));
console.log("done", out.configRows.length, "config rows");
