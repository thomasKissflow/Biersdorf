// 22 Oct (Thomas: "Yes you can"): four Text fields for the load-time redesign and the mails, each in a new row right
// below its template field's row, with exactly the template column's step permissions:
//   CIQP Request  Review_Depts     (template Completeness_By_Role: written with the completeness confirmation)
//   CIQ Case      Review_Depts     (template Completeness_By_Role: I-2 copies it)
//   CIQ Open Point Raised_By_Email (template Raised_By_Dept: the app writes it at the raise)
//   CIQP Query    Raised_By_Email  (template Kind_Label: op.round copies it)
// Re-reads each live draft first (keeps Thomas's manual changes), backs it up, PUTs, publishes, reads back.
//   node new-fields.mjs            dry run
//   node new-fields.mjs --apply
import { writeFileSync, mkdirSync } from "node:fs";
import { call, w, A, APP, PORTAL } from "./lib.mjs";

const apply = process.argv.includes("--apply");
if (A !== "AcDOSunMEpSA") throw new Error("not the dev sandbox");
const SPECS = [
  { flow: "CIQP_Request_A00", app: PORTAL, id: "Review_Depts", name: "Review Depts", tmpl: "Completeness_By_Role", hint: "Departments whose review the confirmation starts (computed by the supplier's screen), e.g. REG,SAF,QM." },
  { flow: "CIQ_Case_A00", app: APP, id: "Review_Depts", name: "Review Depts", tmpl: "Completeness_By_Role", hint: "Departments whose review the completeness confirmation starts, copied from the request." },
  { flow: "CIQ_Open_Point_A00", app: APP, id: "Raised_By_Email", name: "Raised By Email", tmpl: "Raised_By_Dept", hint: "E-mail of the person who raised the open point (for the answer mail)." },
  { flow: "CIQP_Query_A00", app: PORTAL, id: "Raised_By_Email", name: "Raised By Email", tmpl: "Kind_Label", hint: "E-mail of the person who raised the question at Beiersdorf (for the answer mail)." },
];
mkdirSync(new URL("./backups/", import.meta.url), { recursive: true });
for (const s of SPECS) {
  const path = `/metadata/2/${A}/process/${s.flow}/draft?_application_id=${s.app}`;
  const d0 = await call("GET", path);
  if (d0.status !== 200 || typeof d0.body !== "object" || !d0.body[s.flow]) { console.log(s.flow, "draft read", d0.status); process.exitCode = 1; continue; }
  const draft = d0.body;
  if (draft[s.id]) { console.log(s.flow, s.id, "already there"); continue; }
  const t = draft[s.tmpl];
  if (!t?.Column || !draft[t.Column]?.Row) { console.log(s.flow, "template", s.tmpl, "not found"); process.exitCode = 1; continue; }
  const next = structuredClone(draft), model = next[s.flow];
  const tCol = draft[t.Column], tRow = draft[tCol.Row], section = next[tRow.Column];
  const perms = Object.values(draft).filter((p) => p?.Kind === "Permission" && p.Column === tCol.Id);
  const tag = Date.now().toString(36), rowId = `Row_nf${tag}`, colId = `Column_nf${tag}`;
  next[rowId] = { Id: rowId, Kind: "Row", Column: section.Id, "Row::Column": [colId] };
  section["Column::Row"].splice(section["Column::Row"].indexOf(tRow.Id) + 1, 0, rowId);
  next[s.id] = { Id: s.id, Kind: "Field", Type: "Text", Name: s.name, Model: s.flow, Column: colId };
  next[colId] = { Id: colId, Kind: "Column", Type: "Field", Start: 0, End: 6, Row: rowId, "Column::Field": [s.id], Hint: s.hint };
  model["Model::Field"] = [...model["Model::Field"], s.id];
  for (const [i, p] of perms.entries()) {
    const pid = `Permission_nf${tag}${i}`;
    next[pid] = { Id: pid, Kind: "Permission", Column: colId, Permission: p.Permission === "Mandatory" ? "Editable" : p.Permission, Activity: p.Activity };
    next[p.Activity]["Activity::Permission"] = [...next[p.Activity]["Activity::Permission"], pid];
  }
  console.log(s.flow, s.id, `after ${s.tmpl} (section ${section.Id}), ${perms.length} step permissions:`, perms.map((p) => `${draft[p.Activity]?.Name}=${p.Permission}`).join(", "));
  if (!apply) continue;
  writeFileSync(new URL(`./backups/${s.flow}-before-new-fields-${new Date().toISOString().replace(/[:.]/g, "")}.json`, import.meta.url), JSON.stringify(draft));
  const put = await call("PUT", path, next);
  if (put.status >= 300) { console.log("  PUT", put.status, JSON.stringify(put.body).slice(0, 300)); process.exitCode = 1; continue; }
  const pub = await call("POST", `/metadata/2/${A}/process/${s.flow}/publish?_application_id=${s.app}`, {});
  if (pub.status >= 300) { console.log("  publish", pub.status, JSON.stringify(pub.body).slice(0, 300)); process.exitCode = 1; continue; }
  const back = (await call("GET", path)).body;
  console.log("  PUT", put.status, "publish", pub.status, "read back:", back?.[s.id] ? "field ok" : "MISSING", back?.[colId] ? "column ok" : "column MISSING");
}
