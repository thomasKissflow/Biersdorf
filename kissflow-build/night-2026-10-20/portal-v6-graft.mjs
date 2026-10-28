// Plan v6 §3.1 on CIQP Request (portal only):
//   1. Uploads child table: Upload_Removed_At (DateTime) + Upload_Removed_By_Email (Text), the soft delete of a file (D-12)
//   2. step "Supplier: view the released CIQ" after the go-to (D-11): assigned from Assigned_Contacts; every field
//      ReadOnly (Hidden stays Hidden) except the change-report fields (Editable) and Keep_Open_Gate (Mandatory, so the
//      step is never submitted and the released request stays the supplier's task)
// Shapes copied from this draft (child columns, the release step's permissions, the field-assigned Resource).
//   node portal-v6-graft.mjs            dry run
//   node portal-v6-graft.mjs --apply    back up → PUT → publish → read back; a refused PUT/publish restores the draft
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./graft-requests.jsonl"));
const APPLY = process.argv.includes("--apply");
const ID = "CIQP_Request_A00", CHILD = "CIQP_Request_A00_Uploads";
const RELEASE = "Supplier: give the final release", VIEW = "Supplier: view the released CIQ";
const CHANGE_FIELDS = ["Change_Report_Text", "Change_Report_Rev", "Change_Report_By_Email", "Change_Report_At"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (fn) => { await sleep(1300); return fn(); };
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}`;
const add = (o, k, v) => { o[k] = [...new Set([...(o[k] || []), v])]; };

const gd = await call(() => w.getDraft("process", ID));
const b = gd.body;
if (gd.status !== 200 || !b || typeof b !== "object" || !b[ID]) { console.log(`ABORT: draft not readable (${gd.status})`); process.exit(1); }
const original = JSON.parse(JSON.stringify(b));
const act = (name) => Object.values(b).find((o) => o && o.Kind === "Activity" && o.Name === name);
const rel = act(RELEASE);
if (!rel) { console.log("ABORT: release step missing"); process.exit(1); }
const PD = b[b[ID].RootProcessDef];
const order = PD["ProcessDef::Activity"];
const endId = order.find((a) => b[a].NodeType === "EndEvent");
const plan = [];

// 1. soft-delete columns in the Uploads child table
const childRow = (b[CHILD]["Model::Row"] || [])[0];
for (const [id, type, name, hint] of [
  ["Upload_Removed_At", "DateTime", "Upload Removed At", "When the supplier removed this file from the questionnaire (the record stays for the audit)."],
  ["Upload_Removed_By_Email", "Text", "Upload Removed By Email", "Who removed this file from the questionnaire."],
]) {
  if (b[id]) { plan.push(`${id}: exists, skipped`); continue; }
  const col = rid("Column");
  b[col] = { Id: col, Kind: "Column", Type: "Field", Start: 0, End: 0, Row: childRow, "Column::Field": [id], Hint: hint };
  add(b[childRow], "Row::Column", col);
  b[id] = { Id: id, Kind: "Field", Type: type, Name: name, Model: CHILD, Column: col };
  add(b[CHILD], "Model::Field", id);
  plan.push(`child column ${id} (${type})`);
}

// 2. the held-open step after the go-to
if (act(VIEW)) plan.push(`${VIEW}: exists, skipped`);
else {
  const v = rid("Activity"), res = rid("Resource");
  b[v] = { Id: v, Kind: "Activity", NodeType: "UserTask", Name: VIEW, ProcessDef: PD.Id, "Activity::Resource": [res] };
  b[res] = { Id: res, Kind: "Resource", ValueType: "Field", DisplayValue: "Assigned Contacts", Value: "Assigned_Contacts", Field: "Assigned_Contacts", Activity: v };
  const colOf = (f) => b[f]?.Column;
  const editable = new Set(CHANGE_FIELDS.map(colOf).filter(Boolean));
  const gate = colOf("Keep_Open_Gate");
  const count = {};
  for (const pid of rel["Activity::Permission"] || []) {
    const p = b[pid];
    if (!p || p.Kind !== "Permission") continue;
    const level = p.Column === gate ? "Mandatory" : editable.has(p.Column) ? "Editable" : p.Permission === "Hidden" ? "Hidden" : "ReadOnly";
    const np = rid("Permission");
    b[np] = { Id: np, Kind: "Permission", Column: p.Column, Permission: level, Activity: v };
    add(b[v], "Activity::Permission", np);
    count[level] = (count[level] || 0) + 1;
  }
  for (const col of [...editable, gate]) if (!(b[v]["Activity::Permission"] || []).some((x) => b[x].Column === col)) {
    const np = rid("Permission");
    b[np] = { Id: np, Kind: "Permission", Column: col, Permission: col === gate ? "Mandatory" : "Editable", Activity: v };
    add(b[v], "Activity::Permission", np);
    count[b[np].Permission] = (count[b[np].Permission] || 0) + 1;
  }
  // the new child columns need no step permission (the table has one per step); the table stays ReadOnly here
  PD["ProcessDef::Activity"] = [...order.filter((a) => a !== endId), v, endId];
  plan.push(`step "${VIEW}" before End, assigned from Assigned_Contacts; permissions ${JSON.stringify(count)}`);
}

const steps = (d) => d[d[ID].RootProcessDef]["ProcessDef::Activity"].map((a) => d[a].Name).join(" → ");
console.log(plan.join("\n"));
console.log(`steps after: ${steps(b)}`);
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
const vv = Object.values(bb).find((o) => o && o.Kind === "Activity" && o.Name === VIEW);
const lv = {};
for (const p of vv?.["Activity::Permission"] || []) lv[bb[p].Permission] = (lv[bb[p].Permission] || 0) + 1;
console.log(`read back: ${steps(bb)}\n  view step assignee ${bb[(vv?.["Activity::Resource"] || [])[0]]?.Value}, permissions ${JSON.stringify(lv)}\n  child columns: ${["Upload_Removed_At", "Upload_Removed_By_Email"].map((f) => `${f}=${bb[f]?.Type ?? "MISSING"}`).join(", ")}`);
