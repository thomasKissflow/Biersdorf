// V-19(b) on CIQ Open Point (plan-v5-final §4.3 "Who gets the step" option b), now that S-11 is proven live
// (rehearsal R6 publish + walks-after-grant: "Spike review" field-assigned → User:Thomas, 15 Oct 08:33 IST).
//   node b2-raiser.mjs            DRY RUN: live GET of the draft, offline mutation, preflight (validators), printed diff,
//                                 in-flight items (one GET of /myitems) → raiser-dryrun.json. Nothing is written.
//   node b2-raiser.mjs --apply    original saved to v5/originals/CIQ_Open_Point_A00.before-B2-raiser.json → putDraft →
//                                 publish → read back the draft (diff vs sent + checks) and the published fields
//                                 → raiser-result.json. If putDraft/publish fails, the original is PUT back. Thomas runs it.
// The change (both shapes proven in R6, rehearsal/rehearse.mjs + R6-result.json):
//   1. add-field `Raiser_Assignee` (MultiUser) with explicit per-step levels: Editable at Start "Raise open point",
//      ReadOnly at the 6 "Open point – <Dept>" steps and End; the SendBackToInitiator permission the verb adds is stripped.
//   2. the Resource of the 6 steps (same Resource ids) AppRole → {ValueType:"Field", Value:"Raiser_Assignee",
//      Field:"Raiser_Assignee"}. The OP_Dept conditions, names and every other field level stay as they are (asserted).
// Consequences (see the report): items already at a review step keep their role assignee (R6: old items kept theirs);
// the sync service must fill Raiser_Assignee at op.raise, or the Start submit is refused ("There is no assignee for the
// next step", R6 control); readback-v5's "owner + condition" check expects AppRole and must move to Field:Raiser_Assignee.
// Guards (lib-b2.mjs): DEV only; one paced wrapper (>= 1.2 s, no retries); writes only to CIQ_Open_Point_A00;
// role/member routes refused; 429 or HTML → STOP.
import { mutAddField } from "../../../../tools/kissflow-app-agents-1.6.0/engine/patch.mjs";
import {
  OP, A, Q, call, getDraftStrict, putPublish, restore, publishedFields, save, load, exists, saveOriginal, clone, draftDiff, preflight, steps, ents,
  setPerm, stripNonTaskPerms, permMatrix, calls,
} from "./lib-b2.mjs";

const APPLY = process.argv.includes("--apply");
const ACT = { start: "Activity_18t0lhi", end: "Activity_i73i25" };
// activity → [dept label, current owner role id, OP_Dept code]
const STEPS = {
  Activity_uka3mx: ["Regulatory", "RoEKl84Hca4w", "REG"],
  Activity_1kdump3: ["Safety", "RoEKl84xAFRW", "SAF"],
  Activity_1go37bt: ["QM", "RoEKl85WB1yE", "QM"],
  Activity_hha7u2: ["Microbiology", "RoEKl8647K2u", "MIC"],
  Activity_y4af4g: ["Sustainability", "RoEKl86bQQrO", "SUS"],
  Activity_xc8fbb: ["RMM", "RoEKl83f9jPF", "RMM"],
};
const TASK_ACTS = [ACT.start, ...Object.keys(STEPS), ACT.end];
const FIELD = { name: "Raiser Assignee", type: "MultiUser" };
const FID = "Raiser_Assignee";
const resourceFor = (rid, actId) => ({ Id: rid, Kind: "Resource", ValueType: "Field", DisplayValue: FIELD.name, Value: FID, Field: FID, Activity: actId });
const levelOf = (b, actId, col) => (b[actId]?.["Activity::Permission"] || []).map((x) => b[x]).find((p) => p?.Column === col)?.Permission;
const resOf = (b, actId) => (b[actId]?.["Activity::Resource"] || []).map((r) => b[r]);
const condOf = (b, actId) => (b[actId]?.["Activity::Expression"] || []).map((x) => b[x]?.ExpressionStr);
/** permMatrix without the new field: { "Name [Activity]": { level: [sorted ids] } } */
const levelsWithout = (b) => Object.fromEntries(Object.entries(permMatrix(b)).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).map(([l, fs]) => [l, fs.filter((f) => f !== FID).sort()]).filter(([, fs]) => fs.length))]));

function guard(b) {
  if (b.Root !== OP) throw new Error(`draft root is ${b.Root}`);
  if (b.Activity_4k7uck || !b.Thread_JSON || b.OP_Dept?.Required !== true) throw new Error("B2 steps/fields are not live (Activity_4k7uck present, Thread_JSON missing or OP_Dept not Required)");
  if (b[FID] || ents(b).some((e) => e.Kind === "Field" && e.Name === FIELD.name)) throw new Error(`${FID} already exists: already applied?`);
  const tasks = ents(b).filter((e) => e.Kind === "Activity" && ["StartEvent", "UserTask", "EndEvent"].includes(e.NodeType)).map((a) => a.Id).sort();
  if (JSON.stringify(tasks) !== JSON.stringify([...TASK_ACTS].sort())) throw new Error(`unexpected step set: ${tasks.join(", ")}`);
  for (const [id, [d, role, code]] of Object.entries(STEPS)) {
    const a = b[id];
    if (a?.Name !== `Open point – ${d}` || a.NodeType !== "UserTask") throw new Error(`${id} is "${a?.Name}" (${a?.NodeType}), expected "Open point – ${d}" UserTask`);
    const r = resOf(b, id);
    if (r.length !== 1 || r[0]?.ValueType !== "AppRole" || r[0]?.Value !== role) throw new Error(`${id} owner is ${r.map((x) => `${x?.ValueType}:${x?.Value}`).join(",")}, expected AppRole:${role}`);
    const c = condOf(b, id);
    if (c.length !== 1 || c[0] !== `OP_Dept = "${code}"`) throw new Error(`${id} condition is ${JSON.stringify(c)}, expected OP_Dept = "${code}"`);
  }
}

function mutate(b) {
  const before = levelsWithout(b);
  const f = mutAddField(b, FIELD);
  if (f.id !== FID) throw new Error(`the engine slugged "${FIELD.name}" to ${f.id}, expected ${FID}`);
  const strippedNonTaskPerms = stripNonTaskPerms(b, f.column);
  for (const a of TASK_ACTS) setPerm(b, a, f.column, a === ACT.start ? "Editable" : "ReadOnly");
  const resources = [];
  for (const id of Object.keys(STEPS)) {
    const rid = b[id]["Activity::Resource"][0];
    const was = { ...b[rid] };
    b[rid] = resourceFor(rid, id);
    resources.push({ activity: id, step: b[id].Name, resource: rid, was: `${was.ValueType}:${was.DisplayValue}:${was.Value}`, now: `${b[rid].ValueType}:${b[rid].DisplayValue}:${b[rid].Value} (Field ${b[rid].Field})` });
  }
  const after = levelsWithout(b);
  const levelChanges = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) levelChanges.push(k);
  if (levelChanges.length) throw new Error(`existing field levels changed at: ${levelChanges.join(", ")}`);
  return {
    field: { ...f, qd: (b[FID]["Field::QueryDefinition"] || []).map((q) => b[q]) },
    strippedNonTaskPerms,
    levels: Object.fromEntries(TASK_ACTS.map((a) => [`${b[a].Name} [${a}]`, levelOf(b, a, f.column)])),
    resources,
    levelChangesOnExistingFields: 0,
  };
}

/** Post-conditions; `ref` = the live draft the change started from (existing levels must equal it). */
function check(back, ref) {
  const f = back[FID];
  const col = f?.Column;
  const qd = (f?.["Field::QueryDefinition"] || []).map((q) => back[q]);
  const nonTask = ents(back).filter((e) => e.Kind === "Activity" && !["StartEvent", "UserTask", "EndEvent"].includes(e.NodeType));
  const out = {
    field: { present: !!f, type: f?.Type, inModel: (back[back.Root]["Model::Field"] || []).includes(FID), column: col, qd: qd.map((q) => `${q?.LHSModel}/${q?.FlowType}`) },
    fieldOk: f?.Type === "MultiUser" && f?.Model === OP && (back[back.Root]["Model::Field"] || []).includes(FID) && qd.length === 1 && qd[0]?.LHSModel === "User" && qd[0]?.FlowType === "User",
    levels: Object.fromEntries(TASK_ACTS.map((a) => [a, levelOf(back, a, col)])),
    levelsOk: TASK_ACTS.every((a) => levelOf(back, a, col) === (a === ACT.start ? "Editable" : "ReadOnly")),
    noPermsOnNonTask: nonTask.every((a) => !(a["Activity::Permission"] || []).some((p) => back[p]?.Column === col)),
    steps: Object.entries(STEPS).map(([id, [d, , code]]) => {
      const r = resOf(back, id);
      const c = condOf(back, id);
      return {
        id, name: back[id]?.Name,
        owner: r.map((x) => `${x?.ValueType}:${x?.Value}${x?.Field ? "/" + x.Field : ""}`).join(","),
        cond: c.join(" | "),
        ok: back[id]?.Name === `Open point – ${d}` && r.length === 1 && r[0]?.ValueType === "Field" && r[0]?.Value === FID && r[0]?.Field === FID && r[0]?.Activity === id && c.length === 1 && c[0] === `OP_Dept = "${code}"`,
      };
    }),
    existingLevelsUnchanged: JSON.stringify(levelsWithout(back)) === JSON.stringify(levelsWithout(ref)),
    order: steps(back).order.map((s) => `${s.name} [${s.id}] ${s.res}${s.cond ? " if " + s.cond : ""} perms=${s.perms}`),
  };
  out.pass = out.fieldOk && out.levelsOk && out.noPermsOnNonTask && out.steps.every((s) => s.ok) && out.existingLevelsUnchanged;
  return out;
}

/** In-flight items (GET /myitems, one call): anything not Completed/Withdrawn keeps the definition it is on. */
async function inFlight() {
  const r = await call("GET", `/process/2/${A}/${OP}/myitems?page_number=1&page_size=200&${Q}`);
  const rows = Array.isArray(r.body) ? r.body : r.body?.Data || [];
  const tally = {};
  for (const x of rows) tally[x._status ?? "?"] = (tally[x._status ?? "?"] || 0) + 1;
  const open = rows.filter((x) => !["Completed", "Withdrawn", "Rejected"].includes(x._status)).map((x) => `${x._id} ${x._status} ${x._current_step ?? ""} [${(x._current_assigned_to || []).map((a) => `${a.Kind}:${a.Name}`).join("+")}]`);
  return { status: r.status, count: rows.length, tally, notEnded: open };
}

const out = { step: "B2-raiser (V-19 b)", flow: OP, at: new Date().toISOString(), apply: APPLY };
if (APPLY && exists("raiser-result.json") && load("raiser-result.json").write?.ok) { console.error("already applied (raiser-result.json); refusing to apply twice"); process.exit(1); }
const live = await getDraftStrict(OP);
out.liveMetaVersion = live._meta_version; out.livePublishedAt = live.PublishedAt;
try { guard(live); } catch (e) { out.guardError = e.message; console.log(JSON.stringify(out, null, 1)); process.exit(1); }
const next = clone(live);
try { out.mutation = mutate(next); } catch (e) { out.mutationError = e.message; console.log(JSON.stringify(out, null, 1)); process.exit(1); }
const diff = draftDiff(live, next);
const tally = (arr) => arr.reduce((m, s) => { const k = (typeof s === "string" ? s : s.entity).split(" ")[1]; m[k] = (m[k] || 0) + 1; return m; }, {});
out.diffSummary = { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, addedByKind: tally(diff.added), removedByKind: tally(diff.removed), changedByKind: tally(diff.changed) };
const short = (v) => (Array.isArray(v) ? `[${v.length}]` : v && typeof v === "object" ? JSON.stringify(v) : v);
out.diffPrinted = {
  added: diff.added,
  removed: diff.removed,
  changed: diff.changed.map((c) => `${c.entity}: ${Object.entries(c.props).map(([p, v]) => (Array.isArray(v.now) && Array.isArray(v.was) ? `${p} ${v.was.length}→${v.now.length} (+${v.now.filter((x) => !v.was.includes(x)).join(",")}${v.was.some((x) => !v.now.includes(x)) ? " −" + v.was.filter((x) => !v.now.includes(x)).join(",") : ""})` : `${p} ${short(v.was)} → ${short(v.now)}`)).join("; ")}`),
};
const pf = preflight(OP, next);
out.preflight = { errors: pf.errors, warnings: [...new Set(pf.warnings.map((x) => x.code))], warningsLive: [...new Set(preflight(OP, live).warnings.map((x) => x.code))] };
out.dryCheck = check(next, live);
out.inFlight = await inFlight();
if (!APPLY || pf.errors.length || !out.dryCheck.pass) {
  out.calls = calls;
  save("raiser-dryrun.json", { ...out, diff });
  console.log(JSON.stringify(out, null, 1));
  process.exit(pf.errors.length || !out.dryCheck.pass ? 1 : 0);
}
saveOriginal(`${OP}.before-B2-raiser.json`, live);
const res = await putPublish(OP, next);
out.write = { ok: res.ok, stage: res.stage, putDraft: res.putDraft ?? res.status, publish: res.publish ?? (res.stage === "publish" ? res.status : undefined), body: res.body, errors: res.errors, publishedAt: res.publishedAt };
save("raiser-result.json", out); // the write is recorded before any further call
if (!res.ok) {
  if (res.stage === "putDraft" || res.stage === "publish") out.restore = await restore(OP, live);
  out.calls = calls; save("raiser-result.json", out); console.log(JSON.stringify(out, null, 1)); process.exit(1);
}
const back = res.back;
const rb = draftDiff(next, back);
out.readBack = { metaVersion: back._meta_version, publishedAt: back.PublishedAt, diffVsSent: { added: rb.added, removed: rb.removed, changed: rb.changed.slice(0, 10), changedCount: rb.changed.length }, check: check(back, live) };
const pfl = await publishedFields(OP);
const ids = Array.isArray(pfl.body) ? pfl.body.map((f) => f.Id).filter((x) => x && !String(x).startsWith("_") && x !== "Name") : [];
out.publishedFields = { status: pfl.status, count: ids.length, raiserAssigneePublished: ids.includes(FID), missingFromPublished: (back[back.Root]["Model::Field"] || []).filter((id) => !ids.includes(id)) };
out.pass = out.readBack.check.pass && rb.added.length + rb.removed.length + rb.changed.length === 0 && out.publishedFields.raiserAssigneePublished;
save(`${OP}.after-B2-raiser.draft.json`, back);
out.calls = calls;
save("raiser-result.json", out);
console.log(JSON.stringify(out, null, 1));
process.exit(out.pass ? 0 : 1);
