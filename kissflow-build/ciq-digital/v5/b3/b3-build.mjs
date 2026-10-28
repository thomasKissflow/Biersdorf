// B3 (plan-v5-final §15 app night step 4): the new app flows and the form field additions, one target per run.
//   node b3-build.mjs <target> [--offline | --apply]
//   targets (new flows):  outbox · service-request · case-data · review
//   targets (grafts):     supplier · rmes-saf · rmes-reg · note
// Default = dry run (GETs only: flow list + live draft for grafts; builds and mutates in memory, entity diff + preflight →
// <target>-dryrun.json). --offline = no network at all (grafts start from the verifier's 14 Oct snapshot).
// --apply:
//   new flow: create it in CIQ_Digital_A00 (WITHOUT member grants; §6 grants are in ../grants-v5.mjs, dry run) → GET its
//             starter draft → merge the built blob (meta.mjs mergeClean, the portal build's proven path) → putDraft →
//             publish → read back the draft (diff vs sent) and the published allfields (field ids, types, Required, the
//             REAL child-table ids) → <target>-result.json.
//   graft:    save the original to v5/originals/<flow>.before-B3.json → add the fields (header: the proven add-field shape;
//             child columns: the engine's addChildTable column shape) → putDraft → publish → read back → <target>-result.json.
// Shapes reused from live, published metadata (not re-derived):
//   - CIQ Review conditions `Review_Dept = "<D>"`: the AST of CIQ_Open_Point_A00 Expression_1qxv58b (`OP_Dept = "REG"`);
//   - Review_Gate: the AST of CIQ_Case_A00 REG_Gate (identical formula on REG_Open_Count / REG_RMES_Gaps).
// CIQ Review --apply refuses to run before B2 `steps` is live (the 'Review – <Dept>' names stay unique per meaning).
import { readFileSync } from "node:fs";
import { buildForm, addWorkflow, addChildTable, buildFieldInto } from "../../../../tools/kissflow-app-agents-1.6.0/engine/builders.mjs";
import { mutAddField } from "../../../../tools/kissflow-app-agents-1.6.0/engine/patch.mjs";
import { slug, eid } from "../../../../tools/kissflow-app-agents-1.6.0/engine/util.mjs";
import {
  APP, A, Q, call, calls, allowId, listFlows, getDraftStrict, putPublish, restore, allFields, save, load, exists, saveOriginal,
  clone, draftDiff, preflight, kinds, mergeClean, steps, ents,
} from "./lib-b3.mjs";
import { NEW_FLOWS, GRAFTS, ROLE, REVIEW_STEPS, REVIEW_GATE_FORMULA } from "./b3-spec.mjs";

const TARGET = process.argv[2];
const APPLY = process.argv.includes("--apply");
const OFFLINE = process.argv.includes("--offline");
if (APPLY && OFFLINE) { console.error("--offline and --apply are exclusive"); process.exit(1); }
if (!NEW_FLOWS[TARGET] && !GRAFTS[TARGET]) { console.error(`usage: node b3-build.mjs <${[...Object.keys(NEW_FLOWS), ...Object.keys(GRAFTS)].join("|")}> [--offline|--apply]`); process.exit(1); }
if (APPLY && exists(`${TARGET}-result.json`) && load(`${TARGET}-result.json`).write?.ok) { console.error(`${TARGET} already applied (${TARGET}-result.json)`); process.exit(1); }
const jread = (rel) => { const j = JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")); return j.body && j.status ? j.body : j; };

// ── proven ASTs from live, published metadata ──
const CASE_SNAP = jread("../b1/CIQ_Case_A00.after-B1.draft.json");
const OP_SNAP = jread("../originals/CIQ_Open_Point_A00.before-B2.json");

/** Clone an Expression's Node tree (ids re-derived), remapping Field refs; returns the new Expression id. */
function cloneExpr(src, srcExprId, dst, newExprId, owner, fieldMap, exprStr, staticMap = {}) {
  const sx = src[srcExprId];
  if (!sx) throw new Error(`source expression ${srcExprId} missing`);
  let seq = 0;
  const copy = (nid, parentKey, parentId) => {
    const n = src[nid];
    const id = eid("Node", `${newExprId}:c${seq++}`);
    const out = { ...n, Id: id };
    delete out.Expression; delete out.Node;
    out[parentKey] = parentId;
    if (out.Type === "Field") { if (!fieldMap[n.Field]) throw new Error(`no field mapping for ${n.Field}`); out.Field = fieldMap[n.Field]; }
    if (out.Type === "Static" && n.Value in staticMap) out.Value = staticMap[n.Value];
    if (n["Node::Node"]) out["Node::Node"] = n["Node::Node"].map((c) => copy(c, "Node", id));
    dst[id] = out;
    return id;
  };
  const root = copy(sx["Expression::Node"][0], "Expression", newExprId);
  dst[newExprId] = { Id: newExprId, Kind: "Expression", ...owner, ExpressionStr: exprStr, "Expression::Node": [root] };
  return newExprId;
}

function buildNew(spec, serverId) {
  const built = buildForm({ id: serverId, name: spec.name, flowType: spec.flowType, description: spec.description, fields: spec.fields.map(({ gate, ...x }) => x) }, APP);
  const b = built.blob;
  for (const ch of spec.children || []) {
    const childId = `${serverId}_${slug(ch.label)}`;
    addChildTable(built, { id: childId, name: ch.name, fields: ch.fields }, ch.label, {});
  }
  if (spec.key === "review") {
    // Review_Gate: clone CIQ_Case_A00.REG_Gate's AST onto Open_Count / RMES_Gaps
    const exId = eid("Expression", `${serverId}:Review_Gate`);
    cloneExpr(CASE_SNAP, CASE_SNAP.REG_Gate["Field::Expression"][0], b, exId, { Field: "Review_Gate" }, { REG_Open_Count: "Open_Count", REG_RMES_Gaps: "RMES_Gaps" }, REVIEW_GATE_FORMULA);
    b.Review_Gate["Field::Expression"] = [exId];
    const roleIds = Object.fromEntries(Object.entries(ROLE).map(([k, r]) => [k, r.id]));
    const stepSpecs = [
      { name: spec.startName, field_permissions: { Review_Gate: "ReadOnly" } },
      ...REVIEW_STEPS.map((s) => ({ name: s.name, actor: s.dept, field_permissions: { ...Object.fromEntries(s.editable.map((x) => [x, "Editable"])), ...Object.fromEntries(s.mandatory.map((x) => [x, "Mandatory"])) } })),
      { name: "End" },
    ];
    addWorkflow(built, stepSpecs, roleIds);
    // owners: live role names as DisplayValue (the shape of the live OP resources); conditions: clone of the OP condition AST
    const opCond = OP_SNAP.Activity_uka3mx["Activity::Expression"][0];
    for (const s of REVIEW_STEPS) {
      const act = ents(b).find((e) => e.Kind === "Activity" && e.Name === s.name);
      const res = b[act["Activity::Resource"][0]];
      Object.assign(res, { ValueType: "AppRole", DisplayValue: ROLE[s.dept].name, Value: ROLE[s.dept].id });
      const cx = eid("Expression", `${serverId}:${act.Id}:cond`);
      cloneExpr(OP_SNAP, opCond, b, cx, { Activity: act.Id }, { OP_Dept: "Review_Dept" }, `Review_Dept = "${s.dept}"`, { REG: s.dept });
      act["Activity::Expression"] = [cx];
    }
  }
  return b;
}

/** Child-table column graft: the exact column shape addChildTable builds (and the live Contacts/Findings columns have). */
function addChildColumn(b, childId, f) {
  const child = b[childId];
  if (!child || child.Kind !== "Model" || !child.Column) throw new Error(`no child model ${childId}`);
  if (b[f.id]) throw new Error(`field id ${f.id} already exists`);
  const tRow = b[child["Model::Row"]?.[0]];
  if (!tRow || tRow.Kind !== "Row") throw new Error(`child ${childId} has no column row`);
  const fcol = eid("Column", childId + ":" + f.id);
  b[fcol] = { Id: fcol, Kind: "Column", Type: "Field", Start: 0, End: 0, Row: tRow.Id, "Column::Field": [f.id] };
  tRow["Row::Column"].push(fcol);
  buildFieldInto(b, childId, f, {}, fcol);
  child["Model::Field"].push(f.id);
  return { id: f.id, type: f.type, column: fcol, model: childId };
}
function graft(g, b) {
  const rootModel = ents(b).find((e) => e.Kind === "Model" && !e.Field);
  if (rootModel?.Id !== b.Root) throw new Error(`add-field would target ${rootModel?.Id}, not the root ${b.Root}`);
  const out = { header: [], child: [] };
  for (const f of g.header) {
    if (slug(f.name) !== f.id) throw new Error(`name ${f.name} does not slug to ${f.id}`);
    if (b[f.id]) throw new Error(`field ${f.id} already present: already applied?`);
    const r = mutAddField(b, { name: f.name, type: f.type });
    if (r.id !== f.id) throw new Error(`add-field gave ${r.id}, expected ${f.id}`);
    out.header.push({ id: r.id, type: r.type, column: r.column, stepPermissions: r.stepPermissions });
  }
  if (g.child) for (const f of g.child.fields) out.child.push(addChildColumn(b, g.child.table, f));
  return out;
}

// ── run ──
const out = { step: `B3-${TARGET}`, at: new Date().toISOString(), apply: APPLY, offline: OFFLINE };
const finish = (code = 0, file = APPLY ? `${TARGET}-result.json` : `${TARGET}-dryrun${OFFLINE ? "-offline" : ""}.json`) => { out.calls = calls; save(file, out); console.log(JSON.stringify({ ...out, diff: undefined }, null, 1)); process.exit(code); };

if (NEW_FLOWS[TARGET]) {
  const spec = NEW_FLOWS[TARGET];
  const type = spec.flowType === "Process" ? "process" : "form";
  out.flow = spec.name; out.type = type;
  if (APPLY && TARGET === "review" && !(exists("../b2/steps-result.json") && load("../b2/steps-result.json").write?.ok)) {
    out.refused = "B2 `steps` is not live: CIQ Review would share the 'Review – <Dept>' step names with CIQ Open Point (finding: B2 before B3 CIQ Review)";
    finish(1);
  }
  let id = spec.expectedId, starter = null, existed = false;
  if (!OFFLINE) {
    const listed = await listFlows(type);
    const hit = listed.find((x) => x.name === spec.name);
    out.nameTaken = hit || null;
    if (hit) { id = hit.id; existed = true; allowId(id); }
    const idTaken = listed.find((x) => x.id === spec.expectedId && x.name !== spec.name);
    if (idTaken) out.expectedIdTakenBy = idTaken;
  }
  if (APPLY && !existed) {
    const cr = await call("POST", `/flow/2/${A}/${type}/?${Q}`, { Name: spec.name, Description: spec.description });
    out.create = { status: cr.status, id: cr.body?._id, body: cr.status >= 300 ? JSON.stringify(cr.body).slice(0, 400) : undefined };
    if (cr.status >= 300 || !cr.body?._id) finish(1);
    id = cr.body._id; allowId(id);
  }
  out.id = id; out.idAsExpected = id === spec.expectedId;
  if (APPLY || existed) {
    const g = await call("GET", `/metadata/2/${A}/${type}/${id}/draft`);
    if (g.status !== 200 || !g.body || typeof g.body !== "object" || Array.isArray(g.body) || !g.body[id]) { out.abort = `starter draft not readable (${g.status})`; finish(1); }
    starter = g.body;
    if (existed) saveOriginal(`${id}.before-B3.json`, starter);
  } else {
    starter = { Root: id, [id]: { Id: id, Kind: "Model", Name: spec.name, FlowType: spec.flowType, Description: spec.description, _application_id: APP } };
  }
  const blob = buildNew(spec, id);
  const merged = mergeClean(starter, blob, id);
  const pf = preflight(id, merged);
  out.preflight = { errors: pf.errors, warnings: [...new Set(pf.warnings.map((x) => x.code))] };
  out.kinds = kinds(merged);
  const fieldIds = merged[id]["Model::Field"];
  out.built = {
    fields: fieldIds.length,
    required: fieldIds.filter((x) => merged[x]?.Required),
    children: (merged[id]["Model::Model"] || []).map((c) => ({ id: c, fields: merged[c]["Model::Field"] })),
    formulas: ents(merged).filter((e) => e.Kind === "Expression").map((e) => `${e.Field || e.Activity}: ${e.ExpressionStr}`),
  };
  if (type === "process") {
    out.built.steps = steps(merged).order.map((s) => `${s.name} [${s.id}] ${s.res}${s.cond ? " if " + s.cond : ""} perms=${s.perms}`);
    const colToField = Object.fromEntries(ents(merged).filter((e) => e.Kind === "Field" && e.Model === id && e.Column).map((e) => [e.Column, e.Id]));
    out.built.levels = Object.fromEntries(ents(merged).filter((e) => e.Kind === "Activity" && ["StartEvent", "UserTask", "EndEvent"].includes(e.NodeType)).map((a) => {
      const m = {}; for (const p of (a["Activity::Permission"] || []).map((x) => merged[x])) { const fid = colToField[p.Column]; if (fid) (m[p.Permission] = m[p.Permission] || []).push(fid); }
      return [a.Name, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, k === "ReadOnly" ? v.length : v]))];
    }));
  }
  if (!APPLY || pf.errors.length) { out.diff = existed ? draftDiff(starter, merged) : undefined; finish(pf.errors.length ? 1 : 0); }
  const res = await putPublish(type, id, merged);
  out.write = { ok: res.ok, stage: res.stage, putDraft: res.putDraft ?? res.status, publish: res.publish, body: res.body, errors: res.errors, publishedAt: res.publishedAt };
  if (!res.ok) finish(1);
  const rb = draftDiff(merged, res.back);
  out.readBack = { publishedAt: res.back.PublishedAt, diffVsSent: { added: rb.added, removed: rb.removed, changedCount: rb.changed.length, changed: rb.changed.slice(0, 8) } };
  save(`${id}.after-B3.draft.json`, res.back);
  const af = await allFields(type, id);
  const want = spec.fields.map((x) => x.id);
  out.published = {
    status: af.status, fields: af.ids.length, missing: want.filter((x) => !af.ids.includes(x)),
    requiredPublished: af.fields.filter((x) => x.required).map((x) => x.id),
    tables: af.tables, childColumns: Object.fromEntries(Object.entries(af.childFields).map(([t, fs]) => [t, fs.map((x) => x.id)])),
    workflow: af.workflow,
  };
  finish(0);
} else {
  const g = GRAFTS[TARGET];
  out.flow = g.flow;
  const live = OFFLINE ? jread(`../verify-conformance/live/form/${g.flow}.draft.json`) : await getDraftStrict("form", g.flow);
  out.livePublishedAt = live.PublishedAt; out.liveMetaVersion = live._meta_version;
  const next = clone(live);
  try { out.mutation = graft(g, next); } catch (e) { out.mutationError = e.message; finish(1); }
  const diff = draftDiff(live, next);
  out.diffSummary = { added: diff.added, changed: diff.changed.map((c) => ({ entity: c.entity, props: Object.keys(c.props) })), removed: diff.removed };
  const pf = preflight(g.flow, next);
  out.preflight = { errors: pf.errors, warnings: [...new Set(pf.warnings.map((x) => x.code))] };
  if (!APPLY || pf.errors.length) finish(pf.errors.length ? 1 : 0);
  saveOriginal(`${g.flow}.before-B3.json`, live);
  const res = await putPublish("form", g.flow, next);
  out.write = { ok: res.ok, stage: res.stage, putDraft: res.putDraft ?? res.status, publish: res.publish, body: res.body, errors: res.errors, publishedAt: res.publishedAt };
  if (!res.ok) { if (res.stage === "putDraft" || res.stage === "publish") out.restore = await restore("form", g.flow, live); finish(1); }
  const rb = draftDiff(next, res.back);
  out.readBack = { publishedAt: res.back.PublishedAt, diffVsSent: { added: rb.added, removed: rb.removed, changedCount: rb.changed.length, changed: rb.changed.slice(0, 8) } };
  const af = await allFields("form", g.flow);
  out.published = {
    status: af.status, headerPresent: g.header.map((x) => `${x.id}:${af.ids.includes(x.id)}`),
    tables: af.tables,
    childPresent: g.child ? g.child.fields.map((x) => `${g.child.table}.${x.id}:${(af.childFields[g.child.table] || []).some((y) => y.id === x.id)}`) : [],
  };
  finish(0);
}
