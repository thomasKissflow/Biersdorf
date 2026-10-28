// CIQP Request: the final release becomes a step (Thomas, 16 Oct: "yes implement them").
//   Steps: Issue request → Supplier: fill in the CIQ → Supplier: keep the CIQ up to date
//          → Supplier: give the final release → Go to "keep up to date" if Release_Flag = "Reopened" → End
//   New fields: Release_Contacts (MultiUser; the release step's assignees = contacts who may confirm),
//               Release_Flag (Text; "Reopened" sends the item back to "keep up to date").
//   Release step: every field ReadOnly (the lock) except Release_By_Name and Release_At (Mandatory);
//                 deadline 3 days (prototype rem-5), reminders 1 day before and 1 day after.
// Shapes: copied from this draft (fields, columns, rows, permissions, field-assigned Resource, Notify) and from the live
// CIQ Review step condition. GotoTask and the fixed-duration SLA follow the metadata reference; publish validates them.
// node add-release-step.mjs            dry run (prints the plan, writes nothing)
// node add-release-step.mjs --apply    back up the draft → PUT → publish → read back; on a refused publish, restore it
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./release-step-requests.jsonl"));
const APPLY = process.argv.includes("--apply");
const ID = "CIQP_Request_A00", SECTION = "Column_14de7jz", KEEP = "Activity_1mhx3t7";
const RELEASE = "Supplier: give the final release", GOTO = "Back to keep the CIQ up to date, if reopened";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (fn) => { await sleep(1200); return fn(); };
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}`;
const add = (o, key, val) => { o[key] = [...new Set([...(o[key] || []), val])]; };

const gd = await call(() => w.getDraft("process", ID));
const b = gd.body;
if (gd.status !== 200 || !b || typeof b !== "object" || !b[ID]) { console.log(`ABORT: draft not readable (${gd.status}); nothing written`); process.exit(1); }
const original = JSON.parse(JSON.stringify(b));
const acts = () => Object.values(b).filter((o) => o && o.Kind === "Activity");
if (acts().some((a) => a.Name === RELEASE)) { console.log(`ABORT: "${RELEASE}" already exists; nothing written`); process.exit(1); }
for (const f of ["Release_Contacts", "Release_Flag"]) if (b[f]) { console.log(`ABORT: field ${f} already exists; nothing written`); process.exit(1); }
const M = b[ID], PD = b[M.RootProcessDef];
const order = PD["ProcessDef::Activity"];
const endId = order.find((a) => b[a].NodeType === "EndEvent");
if (!b[KEEP] || !endId) { console.log("ABORT: expected steps not found; nothing written"); process.exit(1); }

// 1. Fields, in one new row at the end of the Details section
const row = rid("Row"), cC = rid("Column"), cF = rid("Column");
b[row] = { Id: row, Kind: "Row", Column: SECTION, "Row::Column": [cC, cF] };
add(b[SECTION], "Column::Row", row);
b[cC] = { Id: cC, Kind: "Column", Type: "Field", Start: 0, End: 3, Row: row, "Column::Field": ["Release_Contacts"] };
b[cF] = { Id: cF, Kind: "Column", Type: "Field", Start: 3, End: 6, Row: row, "Column::Field": ["Release_Flag"] };
const qd = rid("QueryDefinition");
b.Release_Contacts = { Id: "Release_Contacts", Kind: "Field", Type: "MultiUser", Name: "Release Contacts", Model: ID, Column: cC, "Field::QueryDefinition": [qd] };
b[qd] = { Id: qd, Kind: "QueryDefinition", Field: "Release_Contacts", LHSModel: "User", FlowType: "User", LookupField: [], HiddenField: [] };
b.Release_Flag = { Id: "Release_Flag", Kind: "Field", Type: "Text", Name: "Release Flag", Model: ID, Column: cF };
add(M, "Model::Field", "Release_Contacts");
add(M, "Model::Field", "Release_Flag");

const perm = (actId, col, level) => { const p = rid("Permission"); b[p] = { Id: p, Kind: "Permission", Column: col, Permission: level, Activity: actId }; add(b[actId], "Activity::Permission", p); };
// existing steps: Issue request may set both; supplier steps and End only see them
for (const a of order) {
  const start = b[a].NodeType === "StartEvent";
  perm(a, cC, start ? "Editable" : "ReadOnly");
  perm(a, cF, start ? "Editable" : "ReadOnly");
}

// 2. The release step: a copy of "keep up to date"'s permissions, all ReadOnly, except who released and when
const rel = rid("Activity"), res = rid("Resource");
b[rel] = { Id: rel, Kind: "Activity", NodeType: "UserTask", Name: RELEASE, ProcessDef: PD.Id, "Activity::Resource": [res] };
b[res] = { Id: res, Kind: "Resource", ValueType: "Field", DisplayValue: "Release Contacts", Value: "Release_Contacts", Field: "Release_Contacts", Activity: rel };
const writable = new Set([b.Release_By_Name.Column, b.Release_At.Column]);
for (const pid of b[KEEP]["Activity::Permission"] || []) {
  const p = b[pid]; if (!p || p.Kind !== "Permission") continue;
  perm(rel, p.Column, writable.has(p.Column) ? "Mandatory" : p.Permission === "Hidden" ? "Hidden" : "ReadOnly");
}
for (const col of writable) if (!(b[rel]["Activity::Permission"] || []).some((x) => b[x].Column === col)) perm(rel, col, "Mandatory");
perm(rel, cC, "ReadOnly");
perm(rel, cF, "ReadOnly");

// 3. Deadline on the release step: 3 days, reminders 1 day before and 1 day after (to the first release contact)
const sla = rid("SLA");
b[sla] = { Id: sla, Kind: "SLA", ActivityDefaultSLA: rel, Value: 3, Unit: "Days", "SLA::Notify": [] };
b[rel]["ActivityDefaultSLA::SLA"] = [sla];
for (const [value, when] of [[1, "Before"], [1, "After"]]) {
  const n = rid("Notify"), e = rid("Expression"), fn = rid("Node"), fld = rid("Node"), st = rid("Node");
  b[n] = { Id: n, Kind: "Notify", SLA: sla, Type: "Notify", "Notify::Expression": [e], ValueType: "Expression", Value: String(value), Unit: "Days", When: when };
  b[e] = { Id: e, Kind: "Expression", ExpressionStr: "Release_Contacts.get(0)", Notify: n, "Expression::Node": [fn] };
  b[fn] = { Id: fn, Kind: "Node", Type: "Function", Value: "get", Syntax: "Chain", Expression: e, FieldRefCount: 1, "Node::Node": [fld, st], DataType: "User", Category: "UserList" };
  b[fld] = { Id: fld, Kind: "Node", Type: "Field", Field: "Release_Contacts", DataType: "UserList", Node: fn };
  b[st] = { Id: st, Kind: "Node", Type: "Static", Value: "0", DataType: "Number", Node: fn };
  add(b.Release_Contacts, "Field::Node", fld);
  add(b[sla], "SLA::Notify", n);
}

// 4. Go to "keep up to date" when Release_Flag = "Reopened" (same condition shape as the live CIQ Review steps)
const gt = rid("Activity"), ge = rid("Expression"), g0 = rid("Node"), g1 = rid("Node"), g2 = rid("Node");
b[gt] = { Id: gt, Kind: "Activity", NodeType: "GotoTask", Name: GOTO, ProcessDef: PD.Id, Goto: KEEP, "Activity::Expression": [ge] };
b[ge] = { Id: ge, Kind: "Expression", Activity: gt, ExpressionStr: 'Release_Flag = "Reopened"', "Expression::Node": [g0] };
b[g0] = { Id: g0, Kind: "Node", DataType: "Boolean", Type: "Function", Value: "=", Category: "String", Syntax: "Infix", "Node::Node": [g1, g2], FieldRefCount: 2, Expression: ge };
b[g1] = { Id: g1, Kind: "Node", DataType: "String", Type: "Field", Field: "Release_Flag", Node: g0 };
b[g2] = { Id: g2, Kind: "Node", DataType: "String", Type: "Static", Value: "Reopened", Node: g0 };
add(b.Release_Flag, "Field::Node", g1);

PD["ProcessDef::Activity"] = [...order.filter((a) => a !== endId), rel, gt, endId];

// plan
const stepList = (d) => d[d[ID].RootProcessDef]["ProcessDef::Activity"].map((a) => `${d[a].Name}${d[a].NodeType === "GotoTask" ? ` (go to "${d[d[a].Goto]?.Name}" if ${d[(d[a]["Activity::Expression"] || [])[0]]?.ExpressionStr})` : ""}`).join(" → ");
const relSummary = (d) => { const r = Object.values(d).find((o) => o && o.Kind === "Activity" && o.Name === RELEASE); if (!r) return "release step missing"; const c = {}; for (const p of r["Activity::Permission"] || []) c[d[p].Permission] = (c[d[p].Permission] || 0) + 1; const s = d[(r["ActivityDefaultSLA::SLA"] || [])[0]]; return `assignee field ${d[(r["Activity::Resource"] || [])[0]]?.Value}; permissions ${JSON.stringify(c)}; deadline ${s ? `${s.Value} ${s.Unit}` : "none"}, reminders ${(s?.["SLA::Notify"] || []).map((n) => `${d[n].When} ${d[n].Value} ${d[n].Unit}`).join(", ")}`; };
console.log(`before: ${stepList(original)}`);
console.log(`after:  ${stepList(b)}`);
console.log(`new fields: Release_Contacts (MultiUser), Release_Flag (Text)`);
console.log(`release step: ${relSummary(b)}`);
if (!APPLY) process.exit(0);

const backup = here(`./backup-CIQP_Request_A00-draft-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
writeFileSync(backup, JSON.stringify(original));
console.log(`backup: ${backup}`);
const put = await call(() => w.putDraft("process", ID, b));
const pub = put.status < 300 ? await call(() => w.publish("process", ID)) : { status: "skipped", body: "" };
console.log(`PUT ${put.status}${put.status >= 300 ? " " + JSON.stringify(put.body).slice(0, 400) : ""} · publish ${pub.status}${pub.status >= 300 ? " " + JSON.stringify(pub.body).slice(0, 600) : ""}`);
if (put.status >= 300 || pub.status >= 300) {
  const rs = await call(() => w.putDraft("process", ID, original));
  console.log(`refused: draft restored from the backup (PUT ${rs.status}); the published process is unchanged`);
  process.exit(1);
}
const back = await call(() => w.getDraft("process", ID));
const bb = back.body;
console.log(`read back: ${stepList(bb)}`);
console.log(`read back release step: ${relSummary(bb)}`);
console.log(`read back fields: ${["Release_Contacts", "Release_Flag"].map((f) => `${f}=${bb[f]?.Type ?? "MISSING"}`).join(", ")}`);
