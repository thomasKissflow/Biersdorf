// One-line help text on every field of CIQP Request (incl. its Uploads table) and CIQP Help Article (Thomas, 16 Oct).
// The texts are in field-help.json. Kissflow's metadata key for a field's help text is not documented anywhere we have,
// so it is copied from the builder: set a help text on ANY one field of either flow in the builder first; this script
// finds that key (on the Field or on its layout Column) and writes the same key on every field. Nothing else changes.
//   node add-field-help.mjs            dry run: shows the key it found and what it would write
//   node add-field-help.mjs --apply    PUT draft → publish → read back, per flow, paced 1.2 s
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./field-help-requests.jsonl"));
const APPLY = process.argv.includes("--apply");
const HELP = JSON.parse(readFileSync(here("./field-help.json"), "utf8"));
const FLOWS = [{ id: "CIQP_Request_A00", type: "process", tables: ["CIQP_Request_A00_Uploads"] }, { id: "CIQP_Help_Article_A00", type: "form", tables: [] }];
const CANDIDATES = ["HelpText", "Help_Text", "Help", "Hint", "Description", "Tooltip", "Info", "Placeholder"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (fn) => { await sleep(1200); return fn(); };

const drafts = {};
for (const f of FLOWS) {
  const gd = await call(() => w.getDraft(f.type, f.id));
  if (gd.status !== 200 || !gd.body || typeof gd.body !== "object" || !gd.body[f.id]) { console.log(`ABORT: ${f.id} draft not readable (${gd.status}); nothing written`); process.exit(1); }
  drafts[f.id] = gd.body;
}

// find the key the builder used: a non-empty string under a candidate name, on a Field or on a field's layout Column
const seen = new Map();
for (const b of Object.values(drafts))
  for (const o of Object.values(b)) {
    if (!o || (o.Kind !== "Field" && !(o.Kind === "Column" && o.Type === "Field"))) continue;
    for (const k of CANDIDATES) if (typeof o[k] === "string" && o[k].trim()) seen.set(`${o.Kind}.${k}`, `${o.Id}: "${o[k].slice(0, 60)}"`);
  }
if (seen.size !== 1) {
  console.log(seen.size ? `ABORT: more than one possible help-text key found: ${[...seen.entries()].map(([k, v]) => `${k} (${v})`).join("; ")}` : "ABORT: no help text found. Set a help text on any one field of CIQP Request or CIQP Help Article in the builder (save the draft), then run this again.");
  process.exit(1);
}
const [[where, example]] = [...seen.entries()];
const [onKind, key] = where.split(".");
console.log(`help-text key: ${onKind}.${key}  (found on ${example})`);

for (const f of FLOWS) {
  const b = drafts[f.id];
  const texts = { ...(HELP[f.id] || {}), ...Object.assign({}, ...f.tables.map((t) => HELP[t] || {})) };
  let n = 0;
  const missing = [];
  for (const [fieldId, text] of Object.entries(texts)) {
    const fld = b[fieldId];
    if (!fld || fld.Kind !== "Field") { missing.push(fieldId); continue; }
    const target = onKind === "Field" ? fld : b[fld.Column];
    if (!target) { missing.push(fieldId); continue; }
    target[key] = text;
    n++;
  }
  console.log(`${f.id}: ${n} fields get help text${missing.length ? `; not found: ${missing.join(", ")}` : ""}`);
  if (!APPLY) continue;
  const put = await call(() => w.putDraft(f.type, f.id, b));
  const pub = put.status < 300 ? await call(() => w.publish(f.type, f.id)) : { status: "skipped", body: "" };
  console.log(`  PUT ${put.status}${put.status >= 300 ? " " + JSON.stringify(put.body).slice(0, 300) : ""} · publish ${pub.status}${pub.status >= 300 ? " " + JSON.stringify(pub.body).slice(0, 300) : ""}`);
  const back = (await call(() => w.getDraft(f.type, f.id))).body || {};
  const ok = Object.entries(texts).filter(([fieldId, text]) => { const fld = back[fieldId]; const t = fld && (onKind === "Field" ? fld : back[fld.Column]); return t && t[key] === text; }).length;
  console.log(`  read back: ${ok}/${n} help texts in place`);
}
