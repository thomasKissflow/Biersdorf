// B2 step 0 (READ-ONLY): the live CIQ Open Point draft (saved once to v5/originals/CIQ_Open_Point_A00.before-B2.json),
// its steps / resources / conditions / permission counts / field types, and every known Open Point item with the step it
// sits at (which ones are on "Waiting for supplier" Activity_4k7uck, the step being removed).
// Item sources: postgen/acceptance-items.jsonl + the key user's /myitems. Writes b2/inspect-result.json.
import { readFileSync } from "node:fs";
import { A, Q, OP, getDraftStrict, adminGet, call, save, saveOriginal, here, steps, permMatrix, kinds, ents, calls } from "./lib-b2.mjs";

const REMOVED = ["Activity_4k7uck"];
const out = { at: new Date().toISOString() };

// 1. the draft
const d = await getDraftStrict(OP);
saveOriginal(`${OP}.before-B2.json`, d);
out.op = { metaVersion: d._meta_version, publishedAt: d.PublishedAt, kinds: kinds(d) };
out.op.steps = steps(d).order.map((s) => `${"  ".repeat(s.depth)}${s.name} [${s.id}] ${s.type} ${s.res}${s.cond ? " if " + s.cond : ""} perms=${s.perms}`);
out.op.fields = (d[d.Root]["Model::Field"] || []).length;
out.op.fieldTypes = Object.fromEntries((d[d.Root]["Model::Field"] || []).map((id) => [id, `${d[id]?.Type}${d[id]?.ReferredList ? "→" + d[id].ReferredList : ""}${d[id]?.["Field::Expression"] ? " (formula)" : ""}${d[id]?.Required ? " (Required)" : ""}`]));
out.op.nonTaskActivities = ents(d).filter((e) => e.Kind === "Activity" && !["StartEvent", "UserTask", "EndEvent"].includes(e.NodeType)).map((a) => `${a.Id} ${a.NodeType} ${a.Name} perms=${(a["Activity::Permission"] || []).length}`);
const pm = permMatrix(d);
out.op.permCounts = Object.fromEntries(Object.entries(pm).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([l, f]) => [l, f.length]))]));
out.op.permMatrix = pm;
out.op.activities = ents(d).filter((e) => e.Kind === "Activity").map((a) => ({ id: a.Id, name: a.Name, type: a.NodeType, sendback: a.IsSendbackEnabled ?? null, resources: (a["Activity::Resource"] || []).map((r) => d[r]), expressions: (a["Activity::Expression"] || []).map((x) => d[x]?.ExpressionStr) }));
// child models and the layout columns that are not plain root fields (tables)
out.op.childModels = ents(d).filter((e) => e.Kind === "Model" && e.Id !== d.Root).map((m) => ({ id: m.Id, name: m.Name, fields: (m["Model::Field"] || []).length }));
out.op.nonFieldColumns = ents(d).filter((e) => e.Kind === "Column" && e.Type !== "Field" && e.Type !== "Section").map((c) => `${c.Id} ${c.Type}`);
// existing User-type fields: the shape a grafted User field must match
out.op.userFieldShapes = ents(d).filter((e) => e.Kind === "Field" && /User/.test(e.Type || "")).map((f) => ({ field: f, qd: (f["Field::QueryDefinition"] || []).map((q) => d[q]) }));

// 2. items
const ids = new Set();
for (const line of readFileSync(here("../../postgen/acceptance-items.jsonl"), "utf8").split("\n").filter(Boolean)) {
  const e = JSON.parse(line); if (e.flowId === OP && e.id) ids.add(e.id);
}
const my = await call("GET", `/process/2/${A}/${OP}/myitems?page_number=1&page_size=200&${Q}`);
const rows = Array.isArray(my.body) ? my.body : my.body?.Data || [];
out.myitems = { status: my.status, count: rows.length, ids: rows.map((x) => x._id).filter(Boolean) };
for (const x of rows) if (x._id) ids.add(x._id);
out.items = [];
for (const id of ids) {
  const r = await adminGet(OP, id);
  const s = r.body || {};
  const cx = (s._current_context || []).map((x) => ({ step: x._context_current_step, activity: x._context_activity_id, act: x._context_activity_instance_id, assigned: (x._context_assigned_to || []).map((a) => `${a.Kind}:${a.Name}`) }));
  out.items.push({ id, http: r.status, status: s._status ?? s.message ?? "?", name: s.Name, opKey: s.OP_Key, dept: s.OP_Dept, toSupplier: s.OP_To_Supplier, question: typeof s.Question_Text === "string" ? s.Question_Text.slice(0, 60) : null, created: s._created_at, steps: cx, onRemovedStep: cx.some((c) => REMOVED.includes(c.activity)) });
}
out.calls = calls;
save("inspect-result.json", out);
const tally = {}; for (const x of out.items) tally[x.status] = (tally[x.status] || 0) + 1;
console.log(JSON.stringify({ op: { ...out.op, permMatrix: undefined, fieldTypes: undefined, userFieldShapes: out.op.userFieldShapes.length }, myitems: { status: out.myitems.status, count: out.myitems.count }, itemTally: tally,
  items: out.items.map((x) => `${x.id} ${x.status} ${x.opKey ?? ""} ${x.dept ?? ""} toSup=${x.toSupplier ?? ""} → ${x.steps.map((c) => `${c.step} (${c.activity}) [${c.assigned.join("+")}]`).join(" + ")}${x.onRemovedStep ? "  [ON THE REMOVED STEP]" : ""}`), calls }, null, 1));
