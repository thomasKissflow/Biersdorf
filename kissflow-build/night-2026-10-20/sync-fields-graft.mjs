// Plan v6 §4.2: the supplier data the app reads, copied field → field by integrations (I-2 at completeness, and the
// webhook request.changed after each supplier save). Same field names and JSON shapes on both sides, so the app parses
// them with the portal's own mapping.
//   portal CIQP Request: + Documents_JSON (Textarea; the supplier screen writes it from its Uploads rows), with the same
//                        per-step permission as Answers_JSON (Editable where the supplier writes answers)
//   app CIQ Case:        + the supplier-data fields, ReadOnly at every step (only the admin route writes them)
//   node sync-fields-graft.mjs            dry run (both flows)
//   node sync-fields-graft.mjs --apply    per flow: back up → PUT → publish → read back; a refusal restores the draft
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./graft-requests.jsonl"));
const APPLY = process.argv.includes("--apply");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (fn) => { await sleep(1300); return fn(); };
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}`;
const add = (o, k, v) => { o[k] = [...new Set([...(o[k] || []), v])]; };

const CASE_FIELDS = [
  ["Config_Answers_JSON", "Textarea", "The supplier's answers to the metadata questions (SF-01…SF-12), copied from the portal request."],
  ["Answers_JSON", "Textarea", "The supplier's answers by question, copied from the portal request."],
  ["Answered_By_JSON", "Textarea", "Who answered each question and when, copied from the portal request."],
  ["Justifications_JSON", "Textarea", "The supplier's reasons where something cannot be provided, copied from the portal request."],
  ["Components_JSON", "Textarea", "The K2.1 composition rows, copied from the portal request."],
  ["Scope_JSON", "Textarea", "Which sections apply to the material (supplier wording), copied from the portal request."],
  ["Requested_Docs_JSON", "Textarea", "The documents the supplier is asked for, copied from the portal request."],
  ["Documents_JSON", "Textarea", "The supplier's uploaded files (name, date, who, where in the questionnaire), copied from the portal request."],
  ["Answers_Rev", "Number", "The supplier's save counter, copied from the portal request: a higher number means newer answers."],
  ["Answers_Changed_At", "DateTime", "When the supplier last saved, copied from the portal request."],
  ["Answers_Changed_By_Email", "Text", "Who saved last, copied from the portal request."],
  ["Change_Report_Text", "Textarea", "The supplier's latest change report after the release, copied from the portal request."],
  ["Change_Report_Rev", "Number", "Counter of the supplier's change reports, copied from the portal request."],
  ["Change_Report_By_Email", "Text", "Who sent the latest change report."],
  ["Change_Report_At", "DateTime", "When the latest change report was sent."],
];

async function graft(type, id, section, fields, levelFor) {
  const gd = await call(() => w.getDraft(type, id));
  const b = gd.body;
  if (gd.status !== 200 || !b || typeof b !== "object" || !b[id]) { console.log(`${id}: ABORT, draft not readable (${gd.status})`); return false; }
  const original = JSON.parse(JSON.stringify(b));
  const M = b[id], acts = b[M.RootProcessDef]["ProcessDef::Activity"];
  const done = [];
  for (const [fid, ftype, hint] of fields) {
    if (b[fid]) { done.push(`${fid}: exists, skipped`); continue; }
    const row = rid("Row"), col = rid("Column");
    b[row] = { Id: row, Kind: "Row", Column: section, "Row::Column": [col] };
    add(b[section], "Column::Row", row);
    b[col] = { Id: col, Kind: "Column", Type: "Field", Start: 0, End: 6, Row: row, "Column::Field": [fid], Hint: hint };
    b[fid] = { Id: fid, Kind: "Field", Type: ftype, Name: fid.replace(/_/g, " "), Model: id, Column: col };
    add(M, "Model::Field", fid);
    for (const a of acts) {
      const p = rid("Permission");
      b[p] = { Id: p, Kind: "Permission", Column: col, Permission: levelFor(b, a), Activity: a };
      add(b[a], "Activity::Permission", p);
    }
    done.push(`${fid} (${ftype}): ${acts.map((a) => `${b[a].Name}=${levelFor(b, a)}`).join(", ")}`);
  }
  console.log(`== ${id}\n${done.join("\n")}`);
  if (!APPLY) return true;
  const backup = here(`./backup-${id}-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
  writeFileSync(backup, JSON.stringify(original));
  const put = await call(() => w.putDraft(type, id, b));
  const pub = put.status < 300 ? await call(() => w.publish(type, id)) : { status: "skipped" };
  console.log(`backup ${backup}\nPUT ${put.status}${put.status >= 300 ? " " + JSON.stringify(put.body).slice(0, 300) : ""} · publish ${pub.status}${pub.status >= 300 ? " " + JSON.stringify(pub.body).slice(0, 400) : ""}`);
  if (put.status >= 300 || pub.status >= 300) {
    const rs = await call(() => w.putDraft(type, id, original));
    console.log(`refused: draft restored (PUT ${rs.status}); the published flow is unchanged`);
    return false;
  }
  const bb = (await call(() => w.getDraft(type, id))).body || {};
  const missing = fields.filter(([fid]) => !bb[fid]).map(([fid]) => fid);
  console.log(`read back: ${fields.length - missing.length}/${fields.length} fields${missing.length ? `, MISSING ${missing.join(", ")}` : ""}`);
  return true;
}

// portal: Documents_JSON takes Answers_JSON's level at each step (Editable where the supplier writes answers)
await graft("process", "CIQP_Request_A00", "Column_14de7jz", [["Documents_JSON", "Textarea", "The supplier's uploaded files (name, date, who, where in the questionnaire), kept by the portal screen for Beiersdorf."]], (b, a) => {
  const col = b.Answers_JSON?.Column;
  const p = (b[a]["Activity::Permission"] || []).map((x) => b[x]).find((x) => x?.Column === col);
  return p?.Permission === "Mandatory" ? "Editable" : p?.Permission || "ReadOnly";
});
// app: ReadOnly at every step
await graft("process", "CIQ_Case_A00", "Column_1vy1fj6", CASE_FIELDS, () => "ReadOnly");
