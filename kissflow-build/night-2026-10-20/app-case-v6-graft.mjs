// Plan v6 §3.2 on CIQ Case (app): the Start fields the case → portal integration (I-1) copies into the CIQP Request,
// written by the RMM's screen at "Create case". Editable at Start, ReadOnly at every other step. Steps unchanged.
// Shapes copied from this draft (a full-width Textarea row like Case_Contacts_JSON; one permission per step, P12).
//   node app-case-v6-graft.mjs            dry run
//   node app-case-v6-graft.mjs --apply    back up → PUT → publish → read back; a refused PUT/publish restores the draft
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./graft-requests.jsonl"));
const APPLY = process.argv.includes("--apply");
const ID = "CIQ_Case_A00", SECTION = "Column_1vy1fj6";
const FIELDS = [
  ["Config_Bundle_JSON", "Textarea", "Config Bundle JSON", "The supplier-safe questionnaire and rules of the pinned release, copied to the supplier's request."],
  ["Config_Bundle_Hash", "Text", "Config Bundle Hash", "Fingerprint of that bundle, to detect any change."],
  ["BDF_Set_JSON", "Textarea", "BDF Set JSON", "Values Beiersdorf sets for the supplier (trade name, supplier, DUNS, contacts, markets), shown to the supplier read-only."],
  ["Portal_Assignees_JSON", "Textarea", "Portal Assignees JSON", "The supplier contacts (portal users) who get the questionnaire tasks."],
  ["Release_Assignees_JSON", "Textarea", "Release Assignees JSON", "The supplier contacts who get the final-release step (every case contact; only those who may confirm can give it)."],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (fn) => { await sleep(1300); return fn(); };
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}`;
const add = (o, k, v) => { o[k] = [...new Set([...(o[k] || []), v])]; };

const gd = await call(() => w.getDraft("process", ID));
const b = gd.body;
if (gd.status !== 200 || !b || typeof b !== "object" || !b[ID]) { console.log(`ABORT: draft not readable (${gd.status})`); process.exit(1); }
const original = JSON.parse(JSON.stringify(b));
const M = b[ID], PD = b[M.RootProcessDef];
const acts = PD["ProcessDef::Activity"];
const plan = [];
for (const [id, type, name, hint] of FIELDS) {
  if (b[id]) { plan.push(`${id}: exists, skipped`); continue; }
  const row = rid("Row"), col = rid("Column");
  b[row] = { Id: row, Kind: "Row", Column: SECTION, "Row::Column": [col] };
  add(b[SECTION], "Column::Row", row);
  b[col] = { Id: col, Kind: "Column", Type: "Field", Start: 0, End: 6, Row: row, "Column::Field": [id], Hint: hint };
  b[id] = { Id: id, Kind: "Field", Type: type, Name: name, Model: ID, Column: col };
  add(M, "Model::Field", id);
  for (const a of acts) {
    const p = rid("Permission");
    b[p] = { Id: p, Kind: "Permission", Column: col, Permission: b[a].NodeType === "StartEvent" ? "Editable" : "ReadOnly", Activity: a };
    add(b[a], "Activity::Permission", p);
  }
  plan.push(`${id} (${type}): Editable at Create case, ReadOnly at ${acts.length - 1} other steps`);
}
console.log(plan.join("\n"));
if (!APPLY) process.exit(0);
const backup = here(`./backup-${ID}-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
writeFileSync(backup, JSON.stringify(original));
const put = await call(() => w.putDraft("process", ID, b));
const pub = put.status < 300 ? await call(() => w.publish("process", ID)) : { status: "skipped" };
console.log(`backup ${backup}\nPUT ${put.status}${put.status >= 300 ? " " + JSON.stringify(put.body).slice(0, 300) : ""} · publish ${pub.status}${pub.status >= 300 ? " " + JSON.stringify(pub.body).slice(0, 400) : ""}`);
if (put.status >= 300 || pub.status >= 300) {
  const rs = await call(() => w.putDraft("process", ID, original));
  console.log(`refused: draft restored (PUT ${rs.status}); the published process is unchanged`);
  process.exit(1);
}
const bb = (await call(() => w.getDraft("process", ID))).body || {};
for (const [id] of FIELDS) {
  const f = bb[id];
  const perms = Object.values(bb).filter((o) => o && o.Kind === "Permission" && o.Column === f?.Column).map((p) => `${bb[p.Activity]?.Name}:${p.Permission}`);
  console.log(`read back ${id}: ${f ? f.Type : "MISSING"} · ${perms.join(", ")}`);
}
