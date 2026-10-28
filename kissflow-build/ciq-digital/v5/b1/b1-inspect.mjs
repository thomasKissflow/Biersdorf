// B1 step 0 (READ-ONLY): app lists, the 3 lists that change, the live CIQ Case draft (saved once to
// v5/originals/CIQ_Case_A00.before-B1.json), and every known CIQ Case item with the step it sits at.
// Item sources: postgen/acceptance-items.jsonl + PkEKlr8g60Nj + the key user's /myitems. Writes b1/inspect-result.json.
import { readFileSync } from "node:fs";
import { A, Q, CASE, NEW_LISTS, CHANGED_LISTS, listIdOf, appLists, listItemsStrict, getDraftStrict, adminGet, call, save, saveOriginal, here, steps, permMatrix, kinds, ents } from "./lib-b1.mjs";

const REMOVED = ["Activity_1feompb", "Activity_1a281c6", "Activity_on1xvu", "Activity_xnbq22", "Activity_1armoq0", "Activity_1kxceje", "Activity_1252uy3", "Activity_h505sh", "Activity_vrfxbc", "Activity_1lo09cp", "Activity_dullxt", "Activity_luckcl"];
const out = { at: new Date().toISOString() };

// 1. lists
const lists = await appLists();
out.appLists = lists.map((l) => `${l._id} | ${l.Name} | ${l.Status}`);
out.newListsExisting = NEW_LISTS.map((l) => ({ name: l.name, id: listIdOf(l.name), exists: lists.some((x) => x._id === listIdOf(l.name) || x.Name === l.name) }));
out.changedLists = {};
for (const l of CHANGED_LISTS) {
  const items = await listItemsStrict(l.id);
  out.changedLists[l.id] = items;
  saveOriginal(`${l.id}.items.before-B1.json`, items);
}

// 2. the Case draft
const d = await getDraftStrict(CASE);
saveOriginal(`${CASE}.before-B1.json`, d);
out.case = { metaVersion: d._meta_version, publishedAt: d.PublishedAt, kinds: kinds(d), steps: steps(d).order.map((s) => `${"  ".repeat(s.depth)}${s.name} [${s.id}] ${s.type} ${s.res}${s.cond ? " if " + s.cond : ""} perms=${s.perms}`) };
out.case.fields = (d[d.Root]["Model::Field"] || []).length;
out.case.nonTaskActivities = ents(d).filter((e) => e.Kind === "Activity" && !["StartEvent", "UserTask", "EndEvent"].includes(e.NodeType)).map((a) => `${a.Id} ${a.NodeType} ${a.Name} perms=${(a["Activity::Permission"] || []).length}`);
const pm = permMatrix(d);
out.case.permCounts = Object.fromEntries(Object.entries(pm).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([l, f]) => [l, f.length]))]));

// 3. items
const ids = new Set(["PkEKlr8g60Nj"]);
for (const line of readFileSync(here("../../postgen/acceptance-items.jsonl"), "utf8").split("\n").filter(Boolean)) {
  const e = JSON.parse(line); if (e.flowId === CASE && e.id) ids.add(e.id);
}
const my = await call("GET", `/process/2/${A}/${CASE}/myitems?page_number=1&page_size=200&${Q}`);
const rows = Array.isArray(my.body) ? my.body : my.body?.Data || [];
out.myitems = { status: my.status, count: rows.length, ids: rows.map((x) => x._id).filter(Boolean) };
for (const x of rows) if (x._id) ids.add(x._id);
out.items = [];
for (const id of ids) {
  const r = await adminGet(CASE, id);
  const s = r.body || {};
  const cx = (s._current_context || []).map((x) => ({ step: x._context_current_step, activity: x._context_activity_id, act: x._context_activity_instance_id }));
  out.items.push({ id, http: r.status, status: s._status ?? s.message ?? "?", name: s.Name, caseCode: s.Case_Code, caseTitle: s.Case_Title, test: s.Case_Test, created: s._created_at, steps: cx, onRemovedStep: cx.some((c) => REMOVED.includes(c.activity)) });
}
save("inspect-result.json", out);
const tally = {}; for (const x of out.items) tally[x.status] = (tally[x.status] || 0) + 1;
console.log(JSON.stringify({ newListsExisting: out.newListsExisting, changedLists: out.changedLists, case: { ...out.case }, myitems: { status: out.myitems.status, count: out.myitems.count }, itemTally: tally,
  inProgress: out.items.filter((x) => x.steps.length).map((x) => `${x.id} ${x.status} ${x.caseCode ?? ""} ${x.caseTitle ?? ""} → ${x.steps.map((c) => `${c.step} (${c.activity})`).join(" + ")}${x.onRemovedStep ? "  [ON A REMOVED STEP]" : ""}`) }, null, 1));
