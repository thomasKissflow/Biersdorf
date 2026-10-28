// GET only: ZZ harness members (§4.14) and the B1 walk item (status check). Pace 1.5 s, stop on 429/HTML.
import { client } from "../../../lib/kf.mjs";
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not DEV; refusing");
const A = kf.acc, Q = `_application_id=CIQ_Digital_A00`;
let last = 0; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path, save) {
  const w = last + 1500 - Date.now(); if (w > 0) await sleep(w); last = Date.now();
  const r = await kf.call("GET", path, undefined, { retries: 0 });
  appendFileSync(here("./requests.jsonl"), JSON.stringify({ at: new Date().toISOString(), method: "GET", path: path.split(A).join("{acc}"), status: r.status }) + "\n");
  if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.error(`STOP ${r.status}`); process.exit(3); }
  const p = here("./live/" + save); mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); writeFileSync(p, JSON.stringify({ status: r.status, body: r.body }, null, 1));
  return r;
}
const rows = (b) => (Array.isArray(b) ? b : b?.Data || []);
for (const [fam, id] of [["process", "CIQ_ZZ_Spike_Case_A00"], ["process", "CIQ_ZZ_Spike_Point_A00"], ["form", "CIQ_ZZ_Spike_Log_A00"], ["form", "CIQ_ZZ_Spike_Register_A00"]]) {
  const r = await get(`/flow/2/${A}/${fam}/${id}/member?${Q}`, `${fam}/${id}.members.json`); console.log(id, r.status, rows(r.body).map((m) => `${m.Name}:${m.Role}`).join(", ") || "(none)");
}
for (const item of ["PkEMwdn0mGMK", "PkEKlr8g60Nj"]) {
  const r = await get(`/process/2/${A}/admin/CIQ_Case_A00/${item}?${Q}`, `process/CIQ_Case_A00.item-${item}.json`);
  const b = r.body || {}; console.log(item, r.status, b._status, b._current_step, JSON.stringify(b._current_assigned_to)?.slice(0, 200), "Case_Phase=", b.Case_Phase, "Template_Version=", b.Template_Version, "Priority=", b.Priority, "Case_Test=", b.Case_Test);
}
