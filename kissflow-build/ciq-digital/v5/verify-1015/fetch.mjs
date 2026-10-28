// Independent verification 15 Oct (after Thomas's applies). GET ONLY: client({readOnly:true}) refuses other methods.
// Complements postgen/readback-v5.mjs (its snapshots are in postgen/live-v5/). Pace 1.5 s, no retries; 429 or HTML stops.
// Snapshots → ./live/ (no credentials). Run: node kissflow-build/ciq-digital/v5/verify-1015/fetch.mjs
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
for (const id of ["CIQ_Review_A00", "CIQ_Open_Point_A00"]) { const r = await get(`/process/2/${A}/${id}/allfields?${Q}`, `${id}.allfields.json`); console.log("allfields", id, r.status); }
for (const id of ["CIQ_Internal_Note_A00"]) { const r = await get(`/form/2/${A}/${id}/allfields?${Q}`, `${id}.allfields.json`); console.log("allfields", id, r.status); }
for (const id of ["CIQ_Config_Version_A00", "CIQ_Scope_Run_A00", "CIQ_Audit_Event_A00"]) { const r = await get(`/metadata/2/${A}/form/${id}/draft`, `${id}.draft.json`); console.log("draft", id, r.status); }
for (const [t, id] of [["process", "CIQ_ZZ_Spike_Case_A00"], ["process", "CIQ_ZZ_Spike_Point_A00"], ["form", "CIQ_ZZ_Spike_Log_A00"], ["form", "CIQ_ZZ_Spike_Register_A00"]]) { const r = await get(`/flow/2/${A}/${t}/${id}/member?${Q}`, `members.${id}.json`); console.log("members", id, r.status, rows(r.body).length); }
for (const id of ["CIQ_ZZ_Spike_log_point_completed_A00", "CIQ_ZZ_Spike_log_register_created_A00"]) { const r = await get(`/metadata/2/${A}/integration/${id}/draft`, `${id}.draft.json`); console.log("integration draft", id, r.status); }
const lr = await get(`/flow/2/${A}/list/?${Q}&page_number=1&page_size=300`, `lists.json`);
const lists = rows(lr.body); console.log("lists", lr.status, lists.length);
for (const l of lists) { const r = await get(`/flow/2/${A}/list/${l._id}/items?${Q}`, `list-items/${l._id}.json`); console.log(" ", l._id, l.Status, r.status, JSON.stringify(Array.isArray(r.body) ? r.body : r.body?.ListItems)); }
console.log("done");
