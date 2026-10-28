// Read-only state snapshot for the 20 Oct night build (GET, plus the form list POST, which only reads).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./read-requests.jsonl"));
const A = w.acc, APP = "CIQ_Digital_A00", P = "CIQ_Supplier_Portal_A00";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (path) => { await sleep(900); return w.call("GET", path); };
const rows = (b) => (Array.isArray(b) ? b : b?.Data || b?.data || b?.items || []);
const out = {};
for (const [name, app] of [["app", APP], ["portal", P]]) {
  out[name] = {};
  for (const t of ["process", "form", "integration", "list"]) {
    const r = await get(`/flow/2/${A}/${t}/?_application_id=${app}&page_number=1&page_size=300`);
    out[name][t] = r.status === 200 ? rows(r.body).map((x) => ({ id: x._id || x.Id, name: x.Name, status: x.Status || x._status, modified: x._modified_at || x.ModifiedAt })) : { status: r.status };
  }
}
const pf = await get(`/flow/2/${A}/portal/${P}/flow`);
out.portalSharing = pf.status === 200 ? rows(pf.body).map((x) => ({ id: x._id, name: x.Name, shared: x.AllowedFlows ?? x.allowedFlows ?? null })) : { status: pf.status };
const af = await get(`/flow/2/${A}/application/${APP}/flow`);
out.appSharing = af.status === 200 ? rows(af.body).map((x) => ({ id: x._id, name: x.Name, shared: x.AllowedFlows ?? x.allowedFlows ?? null })) : { status: af.status };
await sleep(900);
const cfg = await w.call("POST", `/form/2/${A}/CIQ_Config_Version_A00/list?page_number=1&page_size=100&_application_id=${APP}`, {});
out.config = cfg.status === 200 ? rows(cfg.body).map((x) => ({ id: x._id, key: x.Config_Key, kind: x.Config_Kind, label: x.Version_Label, state: x.Config_State, hash: x.Content_Hash, size: (x.Payload_JSON || "").length })) : { status: cfg.status };
writeFileSync(here("./state.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 0).slice(0, 200));
