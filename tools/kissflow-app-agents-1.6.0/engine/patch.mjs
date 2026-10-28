// patch.mjs — the FAST-EDIT layer for LIVE apps. Named, tested graft primitives wrapping the proven
// surgical pattern (getDraft → mutate → putDraft → publish), so a change to an existing app is ONE
// command instead of a hand-written script. Every verb here was once a 10-minute bespoke graft in a
// real session; the derivation is encoded ONCE (per-step permissions for new fields, Expression AST
// re-scoping for conditions, 423 grant retries, …).
//
//   node engine/patch.mjs condition        <processId> "<step name>" "<formula>"
//   node engine/patch.mjs branch          <processId> --app <appId> --after "<step>" --on "<formula>"
//                                          --then "Step Name:Role" --else "Step Name:Role" [--else-on "<formula>"]
//                                          (missing roles are auto-created; --on is auto-negated for the else arm)
//   node engine/patch.mjs parallel        <processId> --app <appId> --after "<step>"
//                                          --branch "Warehouse Readiness:Warehouse Head" --branch "Branch Head Hiring:HR" […]
//                                          (N simultaneous arms, auto-join; missing roles auto-created)
//   node engine/patch.mjs add-step        <processId> "<name>" --actor "<Role>" [--after "<step>"] [--condition "<formula>"]
//   node engine/patch.mjs step-permission <processId> "<step>" "<field|section|table>" Editable|ReadOnly|Hidden|Mandatory
//   node engine/patch.mjs dedupe-permissions <processId>        (repair duplicate step-Permission entities + dangling Column back-refs)
//   node engine/patch.mjs add-field       <flowId> "<name>" <Type> [--required] [--formula "<f>"]
//                                          [--ref <targetFlowId> --ref-type Form|Process|Case] [--list <listId>] [--family form|process|case]
//   node engine/patch.mjs field-type      <flowId> "<field>" <Type> [--family …]
//   node engine/patch.mjs list-items      <listId> "Item A,Item B,…"
//   node engine/patch.mjs step-actor      <processId> "<step>" "<Role>" --app <appId>       (reassign approver)
//   node engine/patch.mjs formula         <flowId> "<field>" "<formula>"   ("" removes)     [--family …]
//   node engine/patch.mjs rename          <flowId> field|step "<old>" "<new>"               [--family …]
//   node engine/patch.mjs field-set       <flowId> "<field>" Required=true Currency=INR …   [--family …]
//   node engine/patch.mjs case-members    <caseId> <appId>          (grant app roles to a board — fixes "board view not found")
//   node engine/patch.mjs kanban-view     <caseId> "<view name>"    (make a case render as a BOARD)
//   node engine/patch.mjs add-role        <appId> "<Role name>"
//   node engine/patch.mjs grant           <flowId> <appId> "<Role>" [--family …] [--viewer] [--admin]
//   … list-items also takes --append (merge with the current set instead of replacing).
//   … all draft verbs accept --dry-run (mutate + report, no PUT/publish).
//
// LESSONS §13 caveat still applies: grafts are not in the IR — after patching, mirror the change into
// lib/app-spec.json (e.g. the step's `condition:` — now first-class in the IR) so a rebuild keeps it.
import { clientFromEnv } from "./client.mjs";
import { checkHygiene } from "./validators.mjs";
import { compileFormula, buildFieldInto } from "./builders.mjs";
import { slug, eid } from "./util.mjs";

const norm = (s) => String(s ?? "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
const ents = (blob) => Object.values(blob).filter((e) => e && typeof e === "object" && e.Kind);
const findModel = (blob) => ents(blob).find((e) => e.Kind === "Model" && !e.Field); // root model (child models hang off a Field-typed column)
const findActivity = (blob, name) => ents(blob).find((e) => e.Kind === "Activity" && norm(e.Name) === norm(name));
const findField = (blob, modelId, name) =>
  ents(blob).find((e) => e.Kind === "Field" && (!modelId || e.Model === modelId) && (norm(e.Name) === norm(name) || e.Id === name));

// ── pure mutators (exported for offline tests) ──────────────────────────────────────────────────

// step condition: Activity::Expression carrying the field-formula AST re-scoped to the Activity (§11)
export function mutCondition(blob, stepName, formula) {
  const act = findActivity(blob, stepName);
  if (!act) throw new Error(`no step named '${stepName}'`);
  if (act.NodeType !== "UserTask") throw new Error(`'${stepName}' is a ${act.NodeType} — conditions apply to middle (UserTask) steps only`);
  const model = findModel(blob);
  const exId = eid("Expression", (model?.Id || "m") + ":" + act.Id);
  const first = (String(formula).match(/[A-Za-z_][A-Za-z0-9_.]*/g) || [])
    .map((t) => ents(blob).find((e) => e.Kind === "Field" && slug(e.Name) === t)).find(Boolean);
  blob[exId] = { Id: exId, Kind: "Expression", Activity: act.Id, ExpressionStr: formula, "Expression::Node": [] };
  if (!compileFormula(blob, exId, formula, first?.Type || "Number", model?.Id)) { delete blob[exId]; throw new Error(`formula did not compile: ${formula} (check field names; equality is '=', not '==')`); }
  act["Activity::Expression"] = [exId];
  return { step: act.Name, expression: exId };
}

// resolve a step-permission target by name: a FIELD's layout column, a child-TABLE column
// (Type:"Model"), or a SECTION column (Type:"Section") — same addressing as builders' nameToCol
function findPermColumn(blob, name) {
  const field = findField(blob, null, name);
  if (field?.Column) return { col: field.Column, label: field.Name };
  const col = ents(blob).find((e) => e.Kind === "Column" && (e.Type === "Model" || e.Type === "Section")
    && (norm(e.Name || "") === norm(name) || norm(blob[(e["Column::Model"] || [])[0]]?.Name || "") === norm(name)));
  return col ? { col: col.Id, label: col.Name || blob[(col["Column::Model"] || [])[0]]?.Name } : null;
}

// remove duplicate Permission entities for one (activity, column) pair — keep the FIRST-listed,
// carry the LAST-listed (newest) value onto it, and clean Column::Permission back-refs. The
// metadata API accepts appended duplicates silently; they break later builder ops (table/field
// delete fails opaquely) and dangling back-refs make publish 500 (Store_Launch, 2026-07-17).
function dedupeActPermissions(blob, act, col) {
  const ids = (act["Activity::Permission"] || []).filter((id) => blob[id]?.Column === col);
  let removed = 0;
  if (ids.length > 1) {
    blob[ids[0]].Permission = blob[ids[ids.length - 1]].Permission; // newest intent wins
    for (const id of ids.slice(1)) { delete blob[id]; removed++; }
    act["Activity::Permission"] = act["Activity::Permission"].filter((id) => !ids.slice(1).includes(id));
  }
  const colEnt = blob[col];
  if (Array.isArray(colEnt?.["Column::Permission"])) {
    colEnt["Column::Permission"] = colEnt["Column::Permission"].filter((id) => blob[id]);
    if (!colEnt["Column::Permission"].length) delete colEnt["Column::Permission"];
  }
  return removed;
}

// per-step access override (the R11 mid-flow-edit pattern) — targets a field, section or child
// table; UPDATES in place (never appends a second Permission for the same column) and repairs any
// pre-existing duplicates on the way
export function mutStepPermission(blob, stepName, fieldName, level) {
  if (!["Editable", "ReadOnly", "Hidden", "Mandatory"].includes(level)) throw new Error(`level '${level}' must be Editable|ReadOnly|Hidden|Mandatory`);
  const act = findActivity(blob, stepName);
  if (!act) throw new Error(`no step named '${stepName}'`);
  const t = findPermColumn(blob, fieldName);
  if (!t) throw new Error(`no field, section or child table named '${fieldName}' (with a layout column)`);
  const deduped = dedupeActPermissions(blob, act, t.col);
  let perm = (act["Activity::Permission"] || []).map((id) => blob[id]).find((p) => p && p.Column === t.col);
  if (!perm) {
    const pId = eid("Permission", act.Id + ":" + t.col);
    perm = blob[pId] = { Id: pId, Kind: "Permission", Column: t.col, Activity: act.Id };
    (act["Activity::Permission"] = act["Activity::Permission"] || []).push(pId);
  }
  perm.Permission = level;
  return { step: act.Name, field: t.label, level, ...(deduped ? { dedupedDuplicates: deduped } : {}) };
}

// whole-draft repair: dedupe every (activity, column) Permission pair + drop dangling
// Column::Permission back-refs (the state that blocks table deletion and 500s publish)
export function mutDedupePermissions(blob) {
  let removed = 0, cleanedBackrefs = 0;
  for (const act of ents(blob).filter((e) => e.Kind === "Activity")) {
    const cols = [...new Set((act["Activity::Permission"] || []).map((id) => blob[id]?.Column).filter(Boolean))];
    for (const col of cols) removed += dedupeActPermissions(blob, act, col);
  }
  for (const e of ents(blob)) {
    if (!Array.isArray(e["Column::Permission"])) continue;
    const before = e["Column::Permission"].length;
    e["Column::Permission"] = e["Column::Permission"].filter((id) => blob[id]);
    cleanedBackrefs += before - e["Column::Permission"].length;
    if (!e["Column::Permission"].length) delete e["Column::Permission"];
  }
  return { removedDuplicates: removed, cleanedBackrefs };
}

// change a field's Type in place (the TextArea→Textarea repair, generalized)
export function mutFieldType(blob, fieldName, newType) {
  const field = findField(blob, null, fieldName);
  if (!field) throw new Error(`no field named '${fieldName}'`);
  const was = field.Type; field.Type = newType;
  return { field: field.Name, was, now: newType };
}

// add a field to a live flow: layout row+column appended to the last section, the FULL field build
// (references get their QueryDefinition, selects their ReferredList, formulas compile — via the same
// buildFieldInto the compiler uses), and per-activity Permissions on every workflow step (a column
// with NO permission is HIDDEN in the form — LESSONS §7).
// spec: { name, type, required?, formula?, ref?, refType?, referredList?, lookup?, currency? }
export function mutAddField(blob, spec) {
  const model = findModel(blob);
  if (!model) throw new Error("no root Model in draft");
  if (findField(blob, model.Id, spec.name)) throw new Error(`field '${spec.name}' already exists`);
  const fid = slug(spec.name);
  // last section column of the model's layout (every built form has ≥1 section)
  const secCol = (model["Model::Row"] || []).map((rid) => blob[rid]).filter(Boolean)
    .flatMap((r) => (r["Row::Column"] || []).map((cid) => blob[cid])).filter((c) => c && c.Type === "Section").pop();
  if (!secCol) throw new Error("no Section column in layout — unexpected form shape");
  const rowId = eid("Row", model.Id + ":patch:" + fid), colId = eid("Column", model.Id + ":patch:" + fid);
  blob[rowId] = { Id: rowId, Kind: "Row", Column: secCol.Id, "Row::Column": [colId] };
  blob[colId] = { Id: colId, Kind: "Column", Type: "Field", Start: 0, End: 6, Row: rowId, "Column::Field": [fid] };
  (secCol["Column::Row"] = secCol["Column::Row"] || []).push(rowId);
  // live drafts use SERVER ids verbatim — refType tells the QD the target's real flow type (R15)
  const flowTypes = spec.ref && spec.refType ? { [spec.ref]: spec.refType } : {};
  buildFieldInto(blob, model.Id, { ...spec, id: fid }, {}, colId, flowTypes);
  if (spec.formula && !blob[fid]["Field::Expression"]) throw new Error(`formula did not compile: ${spec.formula}`);
  (model["Model::Field"] = model["Model::Field"] || []).push(fid);
  // per-step permission on every activity (Editable at Start, ReadOnly after — same defaults as addWorkflow)
  let perms = 0;
  for (const act of ents(blob).filter((e) => e.Kind === "Activity")) {
    const pId = eid("Permission", act.Id + ":" + colId);
    blob[pId] = { Id: pId, Kind: "Permission", Column: colId, Permission: act.NodeType === "StartEvent" ? "Editable" : "ReadOnly", Activity: act.Id };
    (act["Activity::Permission"] = act["Activity::Permission"] || []).push(pId);
    perms++;
  }
  return { field: spec.name, id: fid, column: colId, type: spec.type, ref: spec.ref || null, stepPermissions: perms };
}

// reassign a step's approver (the most common change request of all): swap the Activity::Resource
export function mutStepActor(blob, stepName, roleId, roleName) {
  const act = findActivity(blob, stepName);
  if (!act) throw new Error(`no step named '${stepName}'`);
  if (act.NodeType !== "UserTask") throw new Error(`'${stepName}' is a ${act.NodeType} — only middle steps have assignees`);
  let res = (act["Activity::Resource"] || []).map((id) => blob[id]).find(Boolean);
  if (!res) {
    const rId = eid("Resource", act.Id);
    res = blob[rId] = { Id: rId, Kind: "Resource", Activity: act.Id };
    act["Activity::Resource"] = [rId];
  }
  const was = res.DisplayValue;
  Object.assign(res, { ValueType: "AppRole", DisplayValue: roleName || roleId, Value: roleId });
  return { step: act.Name, was: was || "(none)", now: roleName || roleId };
}

// set/replace a field's formula (recompiles the Expression AST; empty formula removes it)
export function mutFormula(blob, fieldName, formula) {
  const field = findField(blob, null, fieldName);
  if (!field) throw new Error(`no field named '${fieldName}'`);
  for (const old of field["Field::Expression"] || []) { // drop the old AST wholesale
    for (const nid of Object.keys(blob)) if (blob[nid]?.Kind === "Node" && blob[nid].Expression === old) delete blob[nid];
    const drop = (id) => { const n = blob[id]; if (!n) return; for (const c of n["Node::Node"] || []) drop(c); delete blob[id]; };
    for (const rid of blob[old]?.["Expression::Node"] || []) drop(rid);
    delete blob[old];
  }
  delete field["Field::Expression"];
  if (!formula) return { field: field.Name, formula: null };
  const exId = eid("Expression", (field.Model || "m") + ":" + field.Id + ":" + Date.now().toString(36));
  blob[exId] = { Id: exId, Kind: "Expression", Field: field.Id, ExpressionStr: formula, "Expression::Node": [] };
  if (!compileFormula(blob, exId, formula, field.Type, field.Model)) { delete blob[exId]; throw new Error(`formula did not compile: ${formula}`); }
  field["Field::Expression"] = [exId];
  return { field: field.Name, formula };
}

// rename a field or step's display label (ids stay stable — references keep working)
export function mutRename(blob, kind, oldName, newName) {
  const e = kind === "step" ? findActivity(blob, oldName) : findField(blob, null, oldName);
  if (!e) throw new Error(`no ${kind} named '${oldName}'`);
  const was = e.Name; e.Name = newName;
  return { [kind]: e.Id, was, now: newName };
}

// generic field property setter: Required=true|false, Currency=USD|INR|…, Type=<T>
export function mutFieldSet(blob, fieldName, props) {
  const field = findField(blob, null, fieldName);
  if (!field) throw new Error(`no field named '${fieldName}'`);
  const applied = {};
  for (const [k, v] of Object.entries(props)) {
    if (/^required$/i.test(k)) { field.Required = v === "true" || v === true; applied.Required = field.Required; }
    else if (/^currency$/i.test(k)) { field.CurrencyTypes = [String(v)]; applied.Currency = v; }
    else if (/^type$/i.test(k)) { applied.Type = { was: field.Type, now: v }; field.Type = v; }
    else if (/^name$/i.test(k)) { applied.Name = { was: field.Name, now: v }; field.Name = v; }
    else throw new Error(`unknown property '${k}' (Required|Currency|Type|Name)`);
  }
  return { field: fieldName, ...applied };
}

// negate a simple comparison ("Amount > 500000" → "Amount <= 500000") for the branch else-arm.
// Compound formulas (AND/OR) can't be auto-negated — caller must pass an explicit else condition.
export function negateCondition(cond) {
  const FLIP = { ">": "<=", "<": ">=", ">=": "<", "<=": ">", "=": "!=", "!=": "=" };
  const m = String(cond).match(/^(.*?)(>=|<=|!=|[<>=])(.*)$/s);
  if (!m || /\b(AND|OR|NOT)\b/i.test(cond)) return null;
  return `${m[1].trim()} ${FLIP[m[2]]} ${m[3].trim()}`;
}

// PARALLEL: fork into N simultaneous arms that auto-join (LESSONS §12, golden-verified vs
// Vashi_Setup_Operations). Shape: NodeType:"Parallel" activity (no permissions/resources) whose
// Activity::ProcessDef lists one MINIMAL branch ProcessDef per arm ({Id, Kind, Name, Activity});
// each arm holds ordinary UserTask activities; flow resumes at the parallel node's next sibling.
// { after, name?, branches: [{ name, roleId?, roleName?, condition? }, …] }  (≥2 arms)
export function mutParallel(blob, { after, name, branches }) {
  if (!Array.isArray(branches) || branches.length < 2) throw new Error("parallel needs at least 2 branches");
  const pd = ents(blob).find((e) => e.Kind === "ProcessDef" && e.WorkflowType === "Sequence");
  if (!pd) throw new Error("no Sequence ProcessDef in draft");
  const order = pd["ProcessDef::Activity"] || [];
  const parName = name || "Parallel: " + branches.map((b) => b.name).join(" + ");
  if (findActivity(blob, parName)) throw new Error(`activity '${parName}' already exists`);
  const parId = eid("Activity", (pd.Model || "m") + ":" + parName);
  const par = { Id: parId, Kind: "Activity", NodeType: "Parallel", Name: parName, ProcessDef: pd.Id, "Activity::ProcessDef": [] };
  const cols = new Set(ents(blob).filter((e) => e.Kind === "Permission" && e.Column).map((p) => p.Column));
  for (const br of branches) {
    if (findActivity(blob, br.name)) throw new Error(`step '${br.name}' already exists`);
    const bpdId = eid("ProcessDef", (pd.Model || "m") + ":" + parName + ":" + br.name);
    blob[bpdId] = { Id: bpdId, Kind: "ProcessDef", Name: br.name, Activity: parId, "ProcessDef::Activity": [] };
    par["Activity::ProcessDef"].push(bpdId);
    const aId = eid("Activity", (pd.Model || "m") + ":" + br.name);
    const act = { Id: aId, Kind: "Activity", NodeType: "UserTask", Name: br.name, ProcessDef: bpdId, "Activity::Permission": [] };
    for (const col of cols) {
      const pId = eid("Permission", aId + ":" + col);
      blob[pId] = { Id: pId, Kind: "Permission", Column: col, Permission: "ReadOnly", Activity: aId };
      act["Activity::Permission"].push(pId);
    }
    if (br.roleId) {
      const rId = eid("Resource", aId);
      act["Activity::Resource"] = [rId];
      blob[rId] = { Id: rId, Kind: "Resource", ValueType: "AppRole", DisplayValue: br.roleName || br.roleId, Value: br.roleId, Activity: aId };
    }
    blob[aId] = act;
    blob[bpdId]["ProcessDef::Activity"].push(aId);
    if (br.condition) mutCondition(blob, br.name, br.condition);
  }
  blob[parId] = par;
  let at = order.length - 1;
  if (after) {
    const ref = findActivity(blob, after);
    if (!ref) throw new Error(`--after step '${after}' not found`);
    at = order.indexOf(ref.Id) + 1;
  }
  order.splice(at, 0, parId);
  return { parallel: parName, arms: branches.map((b) => b.name), position: at, of: order.length };
}

// BRANCH: the CEO/Council pattern in one mutation — two mutually-exclusive conditional steps
// inserted after a named step. { after, on, then:{name, roleId?, roleName?}, otherwise:{...}, elseOn? }
export function mutBranch(blob, { after, on, then, otherwise, elseOn }) {
  const negated = elseOn || negateCondition(on);
  if (!negated) throw new Error(`cannot auto-negate '${on}' (compound condition) — pass --else-on "<formula>"`);
  const a = mutAddStep(blob, { name: then.name, roleId: then.roleId, roleName: then.roleName, after, condition: on });
  const b = mutAddStep(blob, { name: otherwise.name, roleId: otherwise.roleId, roleName: otherwise.roleName, after: then.name, condition: negated });
  return { branch: { [then.name]: on, [otherwise.name]: negated }, positions: [a.position, b.position] };
}

// insert a UserTask into the sequence (before End by default, or after a named step)
export function mutAddStep(blob, { name, roleId, roleName, after, condition }) {
  if (findActivity(blob, name)) throw new Error(`step '${name}' already exists`);
  const pd = ents(blob).find((e) => e.Kind === "ProcessDef" && e.WorkflowType === "Sequence");
  if (!pd) throw new Error("no Sequence ProcessDef in draft");
  const order = pd["ProcessDef::Activity"] || [];
  const aId = eid("Activity", (pd.Model || "m") + ":" + name);
  const act = { Id: aId, Kind: "Activity", NodeType: "UserTask", Name: name, ProcessDef: pd.Id, "Activity::Permission": [] };
  // same-permission columns as the neighbouring steps: every field column, ReadOnly
  const cols = new Set(ents(blob).filter((e) => e.Kind === "Permission" && e.Column).map((p) => p.Column));
  for (const col of cols) {
    const pId = eid("Permission", aId + ":" + col);
    blob[pId] = { Id: pId, Kind: "Permission", Column: col, Permission: "ReadOnly", Activity: aId };
    act["Activity::Permission"].push(pId);
  }
  if (roleId) {
    const rId = eid("Resource", aId);
    act["Activity::Resource"] = [rId];
    blob[rId] = { Id: rId, Kind: "Resource", ValueType: "AppRole", DisplayValue: roleName || roleId, Value: roleId, Activity: aId };
  }
  blob[aId] = act;
  let at = order.length - 1; // before the EndEvent
  if (after) {
    const ref = findActivity(blob, after);
    if (!ref) throw new Error(`--after step '${after}' not found`);
    at = order.indexOf(ref.Id) + 1;
  }
  order.splice(at, 0, aId);
  const out = { step: name, position: at, of: order.length, assignee: roleName || roleId || "(none)" };
  if (condition) Object.assign(out, mutCondition(blob, name, condition));
  return out;
}

// ── live plumbing ────────────────────────────────────────────────────────────────────────────────
async function resolveFamily(c, id, hint) {
  if (hint) return hint;
  for (const fam of ["process", "form", "case"]) {
    const r = await c.getDraft(fam, id);
    if (r.status < 300) return fam;
  }
  throw new Error(`flow '${id}' not found as process/form/case — check the id`);
}

async function withDraft(c, family, id, mutate, dry) {
  const g = await c.getDraft(family, id);
  if (g.status >= 300) throw new Error(`getDraft ${family}/${id} → ${g.status}`);
  const result = mutate(g.body);
  // hygiene gate — never WRITE a draft with duplicate step-permissions or stale back-refs
  // (the corruption that makes the builder UI unable to delete tables/fields; see checkHygiene)
  const bad = checkHygiene(g.body).filter((i) => i.level === "error");
  if (bad.length) throw new Error(`draft failed hygiene after mutation — refusing to write:\n  ${bad.map((i) => `${i.code}: ${i.msg}`).join("\n  ")}\n  (run: node engine/patch.mjs dedupe-permissions ${id})`);
  if (dry) return { ...result, dryRun: true };
  const p = await c.putDraft(family, id, g.body);
  if (p.status >= 300) throw new Error(`putDraft → ${p.status}: ${JSON.stringify(p.body).slice(0, 160)}`);
  const pub = await c.publish(family, id);
  if (pub.status >= 300) throw new Error(`publish → ${pub.status}: ${JSON.stringify(pub.body).slice(0, 160)}`);
  return { ...result, published: true };
}

// member + report-View grant with the standard 423 retry (LESSONS §16)
async function grantAccess(c, acc, family, flowId, appId, roleName, { viewer, admin } = {}) {
  const roles = await c.call("GET", `/app_role/2/${acc}/list?_application_id=${appId}`);
  const role = (Array.isArray(roles.body) ? roles.body : roles.body?.Data || []).find((r) => norm(r.Name) === norm(roleName));
  if (!role) throw new Error(`role '${roleName}' not found in app ${appId}`);
  const isCase = family === "case";
  const member = { _id: role._id, Name: role.Name, _application_id: appId, Kind: "AppRole",
    Role: admin ? "Admin" : viewer && family !== "process" ? "Viewer" : "Member",
    Permission: isCase || family === "process" ? [] : viewer ? [] : ["Delete"] };
  const post = (url, body) => c.call("POST", url, body);
  let m = await post(`/flow/2/${acc}/${family}/${flowId}/member/batch?_application_id=${appId}`, [member]);
  if (m.status === 423) { await new Promise((r) => setTimeout(r, 1500)); m = await post(`/flow/2/${acc}/${family}/${flowId}/member/batch?_application_id=${appId}`, [member]); }
  const out = { member: m.status };
  const reps = await c.call("GET", `/flow/2/${acc}/${family}/${flowId}/report?_application_id=${appId}`);
  for (const rep of (Array.isArray(reps.body) ? reps.body : reps.body?.Data || [])) {
    let rm = await post(`/flow/2/${acc}/${family}/${flowId}/report/${rep._id}/member/batch?_application_id=${appId}`,
      [{ _id: role._id, Name: role.Name, _application_id: appId, Role: "Member", Permission: ["View"], Kind: "AppRole" }]);
    if (rm.status === 423) { await new Promise((r) => setTimeout(r, 1500)); rm = await post(`/flow/2/${acc}/${family}/${flowId}/report/${rep._id}/member/batch?_application_id=${appId}`, [{ _id: role._id, Name: role.Name, _application_id: appId, Role: "Member", Permission: ["View"], Kind: "AppRole" }]); }
    out[`report:${rep._id}`] = rm.status;
  }
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const a = process.argv.slice(2);
  const verb = a[0];
  const flag = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const has = (n) => a.includes(n);
  const dry = has("--dry-run");
  const c = clientFromEnv();
  const acc = process.env.KISSFLOW_ACCOUNT_ID || process.env.KF_ACCOUNT_ID;
  const done = (r) => { console.log(`✔ ${verb}:`, JSON.stringify(r)); };
  try {
    if (verb === "condition") done(await withDraft(c, "process", a[1], (b) => mutCondition(b, a[2], a[3]), dry));
    else if (verb === "step-permission") done(await withDraft(c, "process", a[1], (b) => mutStepPermission(b, a[2], a[3], a[4]), dry));
    else if (verb === "dedupe-permissions") done(await withDraft(c, "process", a[1], (b) => mutDedupePermissions(b), dry));
    else if (verb === "field-type") done(await withDraft(c, await resolveFamily(c, a[1], flag("--family")), a[1], (b) => mutFieldType(b, a[2], a[3]), dry));
    else if (verb === "add-field") done(await withDraft(c, await resolveFamily(c, a[1], flag("--family")), a[1],
      (b) => mutAddField(b, { name: a[2], type: a[3], required: has("--required"), formula: flag("--formula"),
        ref: flag("--ref"), refType: flag("--ref-type"), referredList: flag("--list") }), dry));
    else if (verb === "branch") {
      const appId = flag("--app"); if (!appId) throw new Error("--app <appId> required (role resolution)");
      const parse = (v, lbl) => { const s = flag(v); if (!s || !s.includes(":")) throw new Error(`${v} "Step Name:Role" required`); const i = s.lastIndexOf(":"); return { name: s.slice(0, i).trim(), roleName: s.slice(i + 1).trim(), lbl }; };
      const arms = [parse("--then"), parse("--else")];
      const roles = await c.call("GET", `/app_role/2/${acc}/list?_application_id=${appId}`);
      const byName = {}; for (const r of (Array.isArray(roles.body) ? roles.body : roles.body?.Data || [])) byName[norm(r.Name)] = r._id;
      for (const arm of arms) {
        arm.roleId = byName[norm(arm.roleName)];
        if (!arm.roleId && !dry) { // auto-create missing roles (the capex CEO/Council case)
          const cr = await c.createRole(arm.roleName, appId);
          if (cr.status >= 300) throw new Error(`create role '${arm.roleName}' → ${cr.status}`);
          arm.roleId = cr.body?._id;
          console.log(`  + role '${arm.roleName}' created (${arm.roleId})`);
        }
      }
      done(await withDraft(c, "process", a[1], (b) => mutBranch(b, { after: flag("--after"), on: flag("--on"), elseOn: flag("--else-on"), then: arms[0], otherwise: arms[1] }), dry));
    }
    else if (verb === "parallel") {
      const appId = flag("--app"); if (!appId) throw new Error("--app <appId> required (role resolution)");
      const specs = a.flatMap((x, i) => (x === "--branch" && a[i + 1] ? [a[i + 1]] : []));
      if (specs.length < 2) throw new Error('need ≥2 --branch "Step Name:Role" arms');
      const roles = await c.call("GET", `/app_role/2/${acc}/list?_application_id=${appId}`);
      const byName = {}; for (const r of (Array.isArray(roles.body) ? roles.body : roles.body?.Data || [])) byName[norm(r.Name)] = r._id;
      const branches = [];
      for (const spec of specs) {
        const j = spec.lastIndexOf(":");
        const br = { name: (j > 0 ? spec.slice(0, j) : spec).trim(), roleName: j > 0 ? spec.slice(j + 1).trim() : null };
        if (br.roleName) {
          br.roleId = byName[norm(br.roleName)];
          if (!br.roleId && !dry) {
            const cr = await c.createRole(br.roleName, appId);
            if (cr.status >= 300) throw new Error(`create role '${br.roleName}' → ${cr.status}`);
            br.roleId = cr.body?._id;
            console.log(`  + role '${br.roleName}' created (${br.roleId})`);
          }
        }
        branches.push(br);
      }
      done(await withDraft(c, "process", a[1], (b) => mutParallel(b, { after: flag("--after"), name: flag("--name"), branches }), dry));
    }
    else if (verb === "add-step") {
      const appId = flag("--app"); const actor = flag("--actor");
      let roleId = null;
      if (actor && appId) {
        const roles = await c.call("GET", `/app_role/2/${acc}/list?_application_id=${appId}`);
        roleId = (Array.isArray(roles.body) ? roles.body : roles.body?.Data || []).find((r) => norm(r.Name) === norm(actor))?._id || null;
        if (!roleId) throw new Error(`role '${actor}' not found in app ${appId} — create it first: patch.mjs add-role ${appId} "${actor}"`);
      }
      done(await withDraft(c, "process", a[1], (b) => mutAddStep(b, { name: a[2], roleId, roleName: actor, after: flag("--after"), condition: flag("--condition") }), dry));
    }
    else if (verb === "list-items") {
      let items = String(a[2] || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!items.length) throw new Error("no items — pass a comma-separated list");
      if (has("--append")) { // merge with the live set (POST replaces wholesale)
        const cur = await c.call("GET", `/flow/2/${acc}/list/${a[1]}/items`);
        const existing = (Array.isArray(cur.body) ? cur.body : cur.body?.ListItems || cur.body?.Data || []).map((x) => (typeof x === "string" ? x : x?.Name)).filter(Boolean);
        items = [...new Set([...existing, ...items])];
      }
      const r = await c.putListItems(a[1], items);
      if (r.status >= 300) throw new Error(`putListItems → ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`);
      done({ list: a[1], items: items.length, append: has("--append") });
    }
    else if (verb === "step-actor") {
      const appId = flag("--app"); if (!appId) throw new Error("--app <appId> required");
      const roles = await c.call("GET", `/app_role/2/${acc}/list?_application_id=${appId}`);
      const role = (Array.isArray(roles.body) ? roles.body : roles.body?.Data || []).find((r) => norm(r.Name) === norm(a[3]));
      if (!role) throw new Error(`role '${a[3]}' not found in app ${appId}`);
      done(await withDraft(c, "process", a[1], (b) => mutStepActor(b, a[2], role._id, role.Name), dry));
    }
    else if (verb === "formula") done(await withDraft(c, await resolveFamily(c, a[1], flag("--family")), a[1], (b) => mutFormula(b, a[2], a[3] || ""), dry));
    else if (verb === "rename") done(await withDraft(c, a[2] === "step" ? "process" : await resolveFamily(c, a[1], flag("--family")), a[1], (b) => mutRename(b, a[2], a[3], a[4]), dry));
    else if (verb === "field-set") {
      const props = Object.fromEntries(a.slice(3).filter((x) => x.includes("=")).map((x) => x.split("=")));
      done(await withDraft(c, await resolveFamily(c, a[1], flag("--family")), a[1], (b) => mutFieldSet(b, a[2], props), dry));
    }
    else if (verb === "case-members") {
      const { grantCaseMembers } = await import("./board-live.mjs");
      done(await grantCaseMembers(c, acc, a[2], a[1]));
    }
    else if (verb === "kanban-view") {
      const r = await c.call("POST", `/flow/2/${acc}/case/${a[1]}/caseview/`, { Name: a[2] || "Board", ViewType: "Kanban" });
      if (r.status >= 300) throw new Error(`caseview → ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`);
      done({ case: a[1], view: a[2] || "Board", status: r.status });
    }
    else if (verb === "add-role") {
      const r = await c.createRole(a[2], a[1]);
      if (r.status >= 300) throw new Error(`createRole → ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`);
      done({ app: a[1], role: a[2], id: r.body?._id });
    }
    else if (verb === "grant") done(await grantAccess(c, acc, flag("--family") || "process", a[1], a[2], a[3], { viewer: has("--viewer"), admin: has("--admin") }));
    else {
      console.log("verbs: branch · condition · add-step · step-actor · step-permission · add-field · field-type · field-set · formula · rename · list-items · add-role · grant · case-members · kanban-view  (see file header for usage)");
      process.exit(verb ? 1 : 0);
    }
  } catch (e) { console.error(`✗ ${verb}: ${e.message}`); process.exit(1); }
}
