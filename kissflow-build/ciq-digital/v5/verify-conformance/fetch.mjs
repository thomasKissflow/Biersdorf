// Independent conformance verifier (plan-v5 §4, §5, §4.14). GET ONLY: client({readOnly:true}) refuses any other method.
// Pace 1.5 s between calls, no retries; a 429 or an HTML body stops the run. Snapshots → ./live/. No credentials logged.
import { client } from "../../../lib/kf.mjs";
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not DEV; refusing");
const A = kf.acc, APP = "CIQ_Digital_A00", Q = `_application_id=${APP}`;
let last = 0; const GAP = 1500; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path, save) {
  const w = last + GAP - Date.now(); if (w > 0) await sleep(w); last = Date.now();
  const r = await kf.call("GET", path, undefined, { retries: 0 });
  appendFileSync(here("./requests.jsonl"), JSON.stringify({ at: new Date().toISOString(), method: "GET", path: path.split(A).join("{acc}"), status: r.status }) + "\n");
  if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.error(`STOP: ${r.status} HTML/429 on ${path}`); process.exit(3); }
  if (save) { const p = here("./live/" + save); mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); writeFileSync(p, JSON.stringify({ status: r.status, body: r.body }, null, 1)); }
  return r;
}
const rows = (b) => (Array.isArray(b) ? b : b?.Data || b?.data || b?.items || []);
const step = process.argv[2] || "all";
const inv = {};
for (const t of ["process", "form", "case", "dataset"]) { const r = await get(`/flow/2/${A}/${t}/?${Q}&page_number=1&page_size=300`, `inventory.${t}.json`); inv[t] = rows(r.body); console.log(t, r.status, inv[t].length, inv[t].map((x) => `${x._id}|${x.Name}|${x.Status}`).join("; ")); }
const lr = await get(`/flow/2/${A}/list/?${Q}&page_number=1&page_size=300`, `lists.json`);
const lists = rows(lr.body); console.log("lists", lr.status, lists.length);
for (const l of lists) { const r = await get(`/flow/2/${A}/list/${l._id}/items?${Q}`, `list-items/${l._id}.json`); console.log(" ", l._id, l.Status, r.status, JSON.stringify(Array.isArray(r.body) ? r.body : r.body?.ListItems)); }
for (const [t, l] of Object.entries(inv)) for (const f of l) {
  if (/ZZ/.test(f.Name)) continue;
  const fam = t === "case" ? "case" : t;
  const d = await get(`/metadata/2/${A}/${fam}/${f._id}/draft`, `${fam}/${f._id}.draft.json`); console.log("draft", f._id, d.status, d.body?.PublishedAt || d.body?.[f._id]?.PublishedAt || "");
  const af = await get(`/${fam}/2/${A}/${f._id}/allfields?${Q}`, `${fam}/${f._id}.allfields.json`); console.log("allfields", f._id, af.status);
  const m = await get(`/flow/2/${A}/${fam}/${f._id}/member?${Q}`, `${fam}/${f._id}.members.json`); console.log("members", f._id, m.status, rows(m.body).length);
}
const rl = await get(`/app_role/2/${A}/list?${Q}&page_number=1&page_size=100`, `roles.json`); console.log("roles", rl.status, rows(rl.body).map((r) => `${r._id}|${r.Name}`).join("; "));
const ov = await get(`/app_role/2/${A}/RoEKl8790ycA?${Q}`, `role-RoEKl8790ycA.json`); console.log("overall approver role", ov.status);
const ir = await get(`/flow/2/${A}/integration/?${Q}&page_number=1&page_size=100`, `integrations.json`); console.log("integrations", ir.status, rows(ir.body).map((x) => `${x._id}|${x.Name}|IsActive=${x.IsActive}|${x.Status}`).join("; "));
console.log("done");
