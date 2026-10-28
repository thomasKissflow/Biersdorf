// v6 (20 Oct) READ-ONLY state of the app session's flows: saves each live draft (also the pre-PUT backup), every flow's
// members, and the per-step permission diff of CIQ Review / CIQ Open Point against what the app session last wrote
// (v5/b3 after-B3, v5/b2 after-B2-raiser), so manual changes made since then (Thomas, 16 Oct) are known and kept.
//   node kissflow-build/ciq-digital/v6/state.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { client } from "../../lib/kf.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
const A = kf.acc, APP = "CIQ_Digital_A00", Q = `_application_id=${APP}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(path) {
  const w = last + 1250 - Date.now(); if (w > 0) await sleep(w); last = Date.now();
  const r = await kf.call("GET", path);
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`HTML challenge on ${path}: STOP 20 min`);
  if (r.status === 429) throw new Error(`429 on ${path}: STOP 20 min`);
  return r;
}
const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
const FLOWS = [
  ["process", "CIQ_Case_A00"], ["process", "CIQ_Review_A00"], ["process", "CIQ_Open_Point_A00"], ["process", "CIQ_Change_Request_A00"],
  ["form", "CIQ_Audit_Event_A00"], ["form", "CIQ_RMES_Safety_A00"], ["form", "CIQ_RMES_Regulatory_A00"], ["form", "CIQ_Scope_Run_A00"],
  ["form", "CIQ_Internal_Note_A00"], ["form", "CIQ_Supplier_A00"], ["form", "CIQ_Config_Version_A00"], ["form", "CIQ_Case_Data_A00"],
  ["form", "CIQ_Mail_Outbox_A00"], ["form", "CIQ_Service_Request_A00"], ["form", "CIQ_Section_A00"],
];
const MINE = new Set(["CIQ_Review_A00", "CIQ_Open_Point_A00", "CIQ_Audit_Event_A00", "CIQ_RMES_Safety_A00", "CIQ_RMES_Regulatory_A00", "CIQ_Scope_Run_A00", "CIQ_Internal_Note_A00", "CIQ_Supplier_A00", "CIQ_Config_Version_A00"]);
const out = { at: new Date().toISOString(), members: {}, drafts: {}, permDiff: {} };
const ents = (d, kind) => Object.values(d).filter((e) => e && e.Kind === kind);
const permMap = (d) => Object.fromEntries(ents(d, "Permission").map((p) => [`${p.Activity}|${p.Column}`, p.Permission]));
for (const [fam, id] of FLOWS) {
  const m = await get(`/flow/2/${A}/${fam}/${id}/member?${Q}`);
  out.members[id] = m.status === 200 && Array.isArray(m.body) ? m.body.map((x) => `${x.Name}:${x.Role}${(x.Permission || []).length ? "[" + x.Permission.join(",") + "]" : ""}`) : `ERR ${m.status}`;
  if (!MINE.has(id)) continue;
  const d = await get(`/metadata/2/${A}/${fam}/${id}/draft`);
  if (d.status !== 200 || typeof d.body !== "object" || !d.body[id]) { out.drafts[id] = `ERR ${d.status}`; continue; }
  writeFileSync(here(`./live/${id}.${stamp}.draft.json`), JSON.stringify(d.body));
  const fields = ents(d.body, "Field").filter((f) => f.Model === id);
  out.drafts[id] = { saved: `live/${id}.${stamp}.draft.json`, activities: ents(d.body, "Activity").map((a) => `${a.Id} ${a.NodeType} "${a.Name ?? ""}"`), fields: fields.map((f) => `${f.Id}:${f.Type}${f.Required ? "*" : ""}`), permissions: ents(d.body, "Permission").length };
}
for (const [id, file] of [["CIQ_Review_A00", "../v5/b3/CIQ_Review_A00.after-B3.draft.json"], ["CIQ_Open_Point_A00", "../v5/b2/CIQ_Open_Point_A00.after-B2-raiser.draft.json"]]) {
  const live = JSON.parse(readFileSync(here(`./live/${id}.${stamp}.draft.json`), "utf8"));
  const mine = JSON.parse(readFileSync(here(file), "utf8"));
  const colName = Object.fromEntries(ents(live, "Field").map((f) => [f.Column, f.Id]));
  const actName = Object.fromEntries(ents(live, "Activity").map((a) => [a.Id, a.Name]));
  const L = permMap(live), M = permMap(mine), diff = [];
  for (const k of new Set([...Object.keys(L), ...Object.keys(M)])) if (L[k] !== M[k]) { const [a, c] = k.split("|"); diff.push(`${actName[a] ?? a} · ${colName[c] ?? c}: ${M[k] ?? "(none)"} → ${L[k] ?? "(none)"}`); }
  const fl = new Set(ents(live, "Field").map((f) => f.Id)), fm = new Set(ents(mine, "Field").map((f) => f.Id));
  out.permDiff[id] = { changedPermissions: diff, fieldsAdded: [...fl].filter((x) => !fm.has(x)), fieldsRemoved: [...fm].filter((x) => !fl.has(x)), activitiesNow: ents(live, "Activity").length, activitiesThen: ents(mine, "Activity").length };
}
writeFileSync(here(`./state-${stamp}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
