// REQ-PROC-042 (Thomas approved 21 Oct): CIQP Request gets Release_By_Email (Email) and Release_By_Role (Text), in a new
// row of the Details section right below Release_By_Name / Release_At, with exactly Release_By_Name's step permissions
// (Editable at "Issue request", Mandatory at "Supplier: give the final release", ReadOnly elsewhere).
//   node release-fields.mjs            dry run on the live draft
//   node release-fields.mjs --apply    backs up, PUTs, publishes, reads back
import { writeFileSync, mkdirSync } from "node:fs";
import { call, w, A, PORTAL } from "./lib.mjs";

const apply = process.argv.includes("--apply");
const FLOW = "CIQP_Request_A00";
if (A !== "AcDOSunMEpSA") throw new Error("not the dev sandbox");
const path = `/metadata/2/${A}/process/${FLOW}/draft?_application_id=${PORTAL}`;
const d0 = await call("GET", path);
if (d0.status !== 200 || typeof d0.body !== "object" || !d0.body[FLOW]) throw new Error(`draft read ${d0.status}`);
const draft = d0.body, next = structuredClone(draft);
const NEW = [
  { id: "Release_By_Email", type: "Email", name: "Release By Email", hint: "E-mail of the person who gave the final release.", start: 0, end: 3 },
  { id: "Release_By_Role", type: "Text", name: "Release By Role", hint: "Role of the person who gave the final release.", start: 3, end: 6 },
];
if (NEW.some((f) => draft[f.id])) { console.log("already there:", NEW.filter((f) => draft[f.id]).map((f) => f.id).join(", ")); process.exit(0); }
const model = next[FLOW];
const tmplField = draft.Release_By_Name, tmplCol = draft[tmplField.Column], tmplRow = draft[tmplCol.Row];
const section = next[tmplRow.Column];
const tmplPerms = Object.values(draft).filter((p) => p?.Kind === "Permission" && p.Column === tmplCol.Id);
const tag = Date.now().toString(36);
const rowId = `Row_rf${tag}`;
next[rowId] = { Id: rowId, Kind: "Row", Column: section.Id, "Row::Column": [] };
const rows = section["Column::Row"];
rows.splice(rows.indexOf(tmplRow.Id) + 1, 0, rowId);
const log = [];
for (const f of NEW) {
  const colId = `Column_rf${tag}${f.id === "Release_By_Email" ? "e" : "r"}`;
  next[f.id] = { Id: f.id, Kind: "Field", Type: f.type, Name: f.name, Model: FLOW, Column: colId };
  next[colId] = { Id: colId, Kind: "Column", Type: "Field", Start: f.start, End: f.end, Row: rowId, "Column::Field": [f.id], Hint: f.hint };
  next[rowId]["Row::Column"].push(colId);
  model["Model::Field"] = [...model["Model::Field"], f.id];
  for (const [i, p] of tmplPerms.entries()) {
    const pid = `Permission_rf${tag}${f.id === "Release_By_Email" ? "e" : "r"}${i}`;
    next[pid] = { Id: pid, Kind: "Permission", Column: colId, Permission: p.Permission, Activity: p.Activity };
    next[p.Activity]["Activity::Permission"] = [...next[p.Activity]["Activity::Permission"], pid];
  }
  log.push(`${f.id} (${f.type}) in ${rowId}: ${tmplPerms.map((p) => `${draft[p.Activity].Name}=${p.Permission}`).join(", ")}`);
}
console.log(`${FLOW}:\n  ${log.join("\n  ")}`);
if (!apply) { console.log("dry run: nothing written"); process.exit(0); }
mkdirSync(new URL("./backups/", import.meta.url), { recursive: true });
writeFileSync(new URL(`./backups/${FLOW}-before-release-fields-${new Date().toISOString().replace(/[:.]/g, "")}.json`, import.meta.url), JSON.stringify(draft));
const put = await w.putDraft("process", FLOW, next).then((r) => r, (e) => ({ status: 0, body: String(e.message) }));
if (put.status >= 300 || put.status === 0) throw new Error(`PUT ${put.status} ${JSON.stringify(put.body).slice(0, 400)}`);
const pub = await call("POST", `/metadata/2/${A}/process/${FLOW}/publish?_application_id=${PORTAL}`, {});
if (pub.status >= 300) throw new Error(`publish ${pub.status} ${JSON.stringify(pub.body).slice(0, 400)}`);
const d1 = (await call("GET", path)).body;
console.log(`PUT ${put.status}, publish ${pub.status}; read back:`, NEW.map((f) => `${f.id}=${d1[f.id]?.Type ?? "MISSING"}`).join(", "));
