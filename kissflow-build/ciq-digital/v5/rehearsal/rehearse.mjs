// v5 graft rehearsal on the ZZ TEST flows only (plan-v5-final §15, night step 1).
//   node rehearse.mjs <R0C|R0P|R1|R2|R3|R4|R5|R6> [--apply]
// Default = dry run: GET the live draft, apply the mutation in memory, print the entity diff + preflight. Nothing is written.
// --apply: save the original draft (originals/<flow>.before-<R>.json) → putDraft → publish → read back the draft and the
// published fields → run ONE new test item through the flow with the account key → <R>-result.json.
// If putDraft/publish fails, the original draft is PUT back (and republished) and the error is recorded.
import { mutAddField, mutRename, mutStepActor } from "../../../../tools/kissflow-app-agents-1.6.0/engine/patch.mjs";
import {
  w, CASE, POINT, L_YESNO, THOMAS, snapshot, clone, draftDiff, preflight, putPublish, publishedFields, save, steps, ents,
  setPerm, stripNonTaskPerms, removeActivities, walk, pathText, createItem, submit, adminGet, adminPut, assigneeUpdate, sleep, exists, load,
} from "./lib.mjs";

const R = process.argv[2];
const APPLY = process.argv.includes("--apply");
const DEAD_ROLES = ["RoEKHLFdFsUJ", "RoEKHLGDsV2J"];             // CIQ ZZ Spike Role A / B: deleted outside our scripts (inventory-app.md)
const ADMIN_DEV = { id: "RoEK3_3Jy9XU", name: "Admin / Developer" }; // Thomas is its only member (read back)
const INTEG = { id: "RoEKl89I5nGx", name: "CIQ Integration Service" }; // Thomas is its only member (read back)
const ACT = { start: "Activity_18dgdbl", prepare: "Activity_194d12o", lanes: "Activity_t7r746", hold: "Activity_90lk5i", gated: "Activity_1tuyhu", noteq: "Activity_1uarf0z", end: "Activity_1t24obg" };
const PACT = { start: "Activity_1wjqod", waiting: "Activity_1nm6syq", review: "Activity_2yluch", end: "Activity_fdurmy" };
const LANES = ["Activity_7a5wvb", "Activity_7a5wvc", "Activity_7a5wvd", "Activity_7a5wve", "Activity_7a5wvf", "Activity_7a5wvg"];
const FLAGS_NO = { Flag_A: "No", Flag_B: "No", Flag_C: "No", Flag_D: "No", Flag_E: "No", Flag_F: "No" };
const FLAGS_YES = { Flag_A: "Yes", Flag_B: "Yes", Flag_C: "Yes", Flag_D: "Yes", Flag_E: "Yes", Flag_F: "Yes" };
const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");

function repoint(b) {
  const changed = [];
  for (const r of ents(b).filter((e) => e.Kind === "Resource" && DEAD_ROLES.includes(e.Value))) {
    changed.push(`${b[r.Activity]?.Name}: ${r.DisplayValue} → ${ADMIN_DEV.name}`);
    Object.assign(r, { ValueType: "AppRole", DisplayValue: ADMIN_DEV.name, Value: ADMIN_DEV.id });
  }
  return { repointed: changed };
}

// One walk of a Case item; flags decide whether lanes would open.
async function runCase(label, extra = {}, opts = {}) {
  const c = await createItem(CASE, { ...FLAGS_NO, ...extra });
  const item = c.body?._id, startAct = c.body?._activity_instance_id;
  const out = { item, create: c.status, label };
  if (!item) return { ...out, createErr: JSON.stringify(c.body).slice(0, 300) };
  if (opts.atStart) Object.assign(out, await opts.atStart(item, startAct));
  const s = await submit(CASE, item, startAct); out.submitStart = s.status;
  if (s.status >= 300) out.submitStartErr = `${s.body?.error_code || ""} ${s.body?.en_message || JSON.stringify(s.body).slice(0, 200)}`.trim();
  else { out.path = await walk(CASE, item, { before: opts.before }); out.pathText = pathText("Create spike case", out.path); }
  if (opts.after) Object.assign(out, await opts.after(item));
  return out;
}

const STEPS = {
  // R0: prerequisite repair. The spike roles A/B no longer exist, so every user step of the ZZ flows has an owner
  // that resolves to nobody. Re-point those steps to "Admin / Developer" (step-actor shape, many steps at once).
  R0C: { flow: CASE, what: "re-point every step owned by the deleted Spike roles A/B to Admin / Developer", mutate: repoint,
    run: () => runCase("R0C: all flags No") },
  R0P: { flow: POINT, what: "re-point every step owned by the deleted Spike roles A/B to Admin / Developer", mutate: repoint,
    run: async () => {
      const c = await createItem(POINT, { To_Supplier: "No", Question_Text: `ZZT v5 R0P ${stamp}`, Round_No: 1 });
      const item = c.body?._id; const s = await submit(POINT, item, c.body?._activity_instance_id);
      const path = await walk(POINT, item); return { item, create: c.status, submitStart: s.status, path, pathText: pathText("Raise spike point", path) };
    } },

  // R1: add-field (verb mutator) ×2 on the published Case, with explicit per-step permissions.
  R1: { flow: CASE, what: "add-field Spike_V5_Note (Text) + Spike_V5_Phase (Select, Yes No list) with explicit per-step levels",
    mutate: (b) => {
      const note = mutAddField(b, { name: "Spike V5 Note", type: "Text" });
      const phase = mutAddField(b, { name: "Spike V5 Phase", type: "Select", referredList: L_YESNO });
      const stripped = [...stripNonTaskPerms(b, note.column), ...stripNonTaskPerms(b, phase.column)];
      // Note: Editable at Start only; Hidden in the 6 lanes; ReadOnly elsewhere.
      // Phase: Editable at Spike prepare only; ReadOnly at Start and the later steps; Hidden in the 6 lanes.
      for (const a of [ACT.start, ACT.prepare, ACT.hold, ACT.gated, ACT.noteq, ACT.end, ...LANES]) {
        setPerm(b, a, note.column, a === ACT.start ? "Editable" : LANES.includes(a) ? "Hidden" : "ReadOnly");
        setPerm(b, a, phase.column, a === ACT.prepare ? "Editable" : LANES.includes(a) ? "Hidden" : "ReadOnly");
      }
      return { note, phase, strippedNonTaskPerms: stripped };
    },
    run: () => runCase("R1: flags No; Note at create", { Spike_V5_Note: "R1 written at create" }, {
      atStart: async (item, act) => {
        const o = {};
        const u1 = await assigneeUpdate(CASE, item, act, { Spike_V5_Note: "R1 updated at Start (assignee route)" });
        o.startUpdateNote = { status: u1.status, err: u1.status >= 300 ? (u1.body?.en_message || JSON.stringify(u1.body).slice(0, 200)) : undefined };
        const u2 = await assigneeUpdate(CASE, item, act, { Spike_V5_Phase: "Yes" });
        o.startUpdatePhase_ReadOnlyAtStart = { status: u2.status, err: u2.status >= 300 ? (u2.body?.en_message || JSON.stringify(u2.body).slice(0, 200)) : undefined };
        await sleep(800);
        const s = await adminGet(CASE, item); o.atStartReadBack = { Spike_V5_Note: s.Spike_V5_Note ?? null, Spike_V5_Phase: s.Spike_V5_Phase ?? null };
        return o;
      },
      after: async (item) => {
        // admin route on (a) this item and (b) an in-progress item created on the OLD definition (k-race leftover at Spike prepare)
        const o = {};
        for (const id of [item, "PkEKO4Ijeqy3"]) {
          const p = await adminPut(CASE, id, { Spike_V5_Phase: "Yes", Spike_V5_Note: `R1 admin-route write ${stamp}` });
          await sleep(800); const back = await adminGet(CASE, id);
          o[`adminRoute_${id}`] = { put: p.status, err: p.status >= 300 ? (p.body?.en_message || JSON.stringify(p.body).slice(0, 160)) : undefined, itemStatus: back._status, step: back._current_step, readBack: { Spike_V5_Phase: back.Spike_V5_Phase ?? null, Spike_V5_Note: back.Spike_V5_Note ?? null } };
        }
        return o;
      },
      before: async (rec, s, c) => {
        if (rec.activity !== ACT.prepare) return {};
        const o = {};
        const u = await assigneeUpdate(CASE, s._id, c._context_activity_instance_id, { Spike_V5_Phase: "No" });
        o.prepareUpdatePhase_assigneeRoute = { status: u.status, err: u.status >= 300 ? (u.body?.en_message || JSON.stringify(u.body).slice(0, 160)) : undefined };
        const p = await adminPut(CASE, s._id, { Spike_V5_Phase: "Yes", Spike_V5_Note: "R1 written by the admin route at Spike prepare" });
        o.adminPut = p.status;
        await sleep(800);
        const back = await adminGet(CASE, s._id); o.adminReadBack = { Spike_V5_Phase: back.Spike_V5_Phase ?? null, Spike_V5_Note: back.Spike_V5_Note ?? null };
        return o;
      },
    }) },

  // R2: rename a step (verb mutator); the activity id must not change.
  R2: { flow: CASE, what: 'rename step "Spike gated step" → "Spike gate check"', mutate: (b) => mutRename(b, "step", "Spike gated step", "Spike gate check"),
    check: (back) => ({ activityKept: back[ACT.gated]?.Name === "Spike gate check", name: back[ACT.gated]?.Name }),
    run: () => runCase("R2: flags No") },

  // R3: change a step's owner role (verb mutator) — the plan's "owner → Integration service" shape.
  R3: { flow: CASE, what: 'step-actor "Spike hold check": Admin / Developer → CIQ Integration Service', mutate: (b) => mutStepActor(b, "Spike hold check", INTEG.id, INTEG.name),
    check: (back) => ({ resource: (back[ACT.hold]?.["Activity::Resource"] || []).map((r) => back[r]) }),
    run: () => runCase("R3: flags No") },

  // R4: remove ONE plain step by a hand-made graft.
  R4: { flow: CASE, what: 'remove step "Spike not-equal step" (Activity + Permissions + Resource + Expression/Nodes + ProcessDef ref)',
    mutate: (b) => ({ removed: removeActivities(b, [ACT.noteq]) }),
    check: (back) => ({ gone: !back[ACT.noteq], order: steps(back).order.map((s) => s.name) }),
    run: () => runCase("R4: flags No, Spike_Decision blank") },

  // R5 = S-12: remove the whole 6-branch parallel block.
  R5: { flow: CASE, what: 'remove the parallel block "Spike review lanes" (Parallel activity + 6 branch ProcessDefs + 6 branch activities + their Permissions/Resources/Expressions/Nodes)',
    mutate: (b) => ({ removed: removeActivities(b, [ACT.lanes]) }),
    check: (back) => ({ gone: !back[ACT.lanes] && LANES.every((l) => !back[l]), order: steps(back).order.map((s) => s.name) }),
    preApply: async () => {
      // an in-flight item created on the OLD definition, parked at "Spike prepare" with every lane flag Yes
      const c = await createItem(CASE, { ...FLAGS_YES });
      const s = await submit(CASE, c.body?._id, c.body?._activity_instance_id);
      await sleep(1200); const g = await adminGet(CASE, c.body?._id);
      return { inflight: { item: c.body?._id, create: c.status, submitStart: s.status, parkedAt: g._current_step, metaVersion: g._meta_version ?? c.body?._meta_version } };
    },
    run: async (pre) => {
      const fresh = await runCase("R5: ALL six lane flags Yes (lanes would open if the block were still there)", { ...FLAGS_YES });
      let inflight = null;
      if (pre?.inflight?.item && pre.inflight.submitStart < 300) {
        const path = await walk(CASE, pre.inflight.item);
        inflight = { item: pre.inflight.item, createdOnOldDefinition: true, path, pathText: pathText("(parked at Spike prepare before the graft)", path) };
      }
      return { fresh, inflight };
    } },

  // R6 = S-11: MultiUser field + field-assigned step in the APP.
  R6: { flow: POINT, what: 'add-field Spike_Assignee (MultiUser) with per-step levels; "Spike review" assigned FROM that field',
    mutate: (b) => {
      const f = mutAddField(b, { name: "Spike Assignee", type: "MultiUser" });
      const stripped = stripNonTaskPerms(b, f.column);
      for (const a of Object.values(PACT)) setPerm(b, a, f.column, a === PACT.start ? "Editable" : "ReadOnly");
      const act = b[PACT.review]; const rId = act["Activity::Resource"][0]; const was = { ...b[rId] };
      b[rId] = { Id: rId, Kind: "Resource", ValueType: "Field", DisplayValue: "Spike Assignee", Value: f.id, Field: f.id, Activity: act.Id };
      return { field: f, strippedNonTaskPerms: stripped, resourceWas: was, resourceNow: b[rId] };
    },
    check: (back) => ({ resource: (back[PACT.review]?.["Activity::Resource"] || []).map((r) => back[r]), field: back.Spike_Assignee, qd: (back.Spike_Assignee?.["Field::QueryDefinition"] || []).map((q) => back[q]) }),
    preApply: async () => {
      const old = {};
      for (const id of ["PkEKOEvnYp7X", "PkEKIVxRRM9x"]) { const s = await adminGet(POINT, id); old[id] = { step: s._current_step, assigned: s._current_assigned_to }; }
      return { oldItemsBefore: old };
    },
    run: async () => {
      const c = await createItem(POINT, { To_Supplier: "No", Question_Text: `ZZT v5 R6 ${stamp}`, Round_No: 1, Spike_Assignee: [{ _id: THOMAS }] });
      const item = c.body?._id; const out = { item, create: c.status };
      await sleep(800); const s0 = await adminGet(POINT, item); out.storedAtCreate = s0.Spike_Assignee ?? null;
      const s = await submit(POINT, item, c.body?._activity_instance_id); out.submitStart = s.status;
      if (s.status >= 300) { out.submitStartErr = s.body?.en_message; return out; }
      await sleep(1500); const g = await adminGet(POINT, item);
      out.atReview = { step: g._current_step, _current_assigned_to: g._current_assigned_to, context: (g._current_context || []).map((x) => ({ step: x._context_current_step, assigned: x._context_assigned_to })) };
      out.path = await walk(POINT, item); out.pathText = pathText("Raise spike point", out.path);
      // control: an empty assignee field must refuse the Start submit (portal k04f M3)
      const e = await createItem(POINT, { To_Supplier: "No", Question_Text: `ZZT v5 R6 empty-assignee control ${stamp}`, Round_No: 1 });
      const es = await submit(POINT, e.body?._id, e.body?._activity_instance_id);
      out.emptyAssigneeControl = { item: e.body?._id, submitStart: es.status, err: es.body?.en_message || null };
      const old = {};
      for (const id of ["PkEKOEvnYp7X", "PkEKIVxRRM9x"]) { const x = await adminGet(POINT, id); old[id] = { step: x._current_step, assigned: x._current_assigned_to }; }
      out.oldItemsAfter = old;
      return out;
    } },
};

const S = STEPS[R];
if (!S) { console.error(`usage: node rehearse.mjs <${Object.keys(STEPS).join("|")}> [--apply]`); process.exit(1); }
const out = { rehearsal: R, flow: S.flow, what: S.what, at: new Date().toISOString(), apply: APPLY };
const live = await snapshot("process", S.flow, APPLY ? `before-${R}` : null);
out.liveMetaVersion = live._meta_version; out.livePublishedAt = live.PublishedAt;
const next = clone(live);
try { out.mutation = S.mutate(next); } catch (e) { out.mutationError = e.message; console.log(JSON.stringify(out, null, 1)); process.exit(1); }
out.diff = draftDiff(live, next);
out.diffSummary = { added: out.diff.added.length, removed: out.diff.removed.length, changed: out.diff.changed.length };
const pf = preflight(S.flow, next);
out.preflight = { errors: pf.errors, warnings: pf.warnings.map((x) => x.code) };
if (!APPLY || pf.errors.length) {
  save(`${R}-dryrun.json`, out);
  console.log(JSON.stringify({ ...out, diff: { added: out.diff.added.slice(0, 12), removed: out.diff.removed.slice(0, 12), changed: out.diff.changed.slice(0, 8) } }, null, 1));
  process.exit(pf.errors.length ? 1 : 0);
}
if (exists(`${R}-result.json`) && load(`${R}-result.json`).write?.ok) { console.error(`${R} was already applied (see ${R}-result.json); refusing to apply twice`); process.exit(1); }
if (S.preApply && !process.argv.includes("--no-run")) out.pre = await S.preApply();
const res = await putPublish("process", S.flow, next);
out.write = { ok: res.ok, stage: res.stage, putDraft: res.putDraft ?? res.status, publish: res.publish ?? (res.stage === "publish" ? res.status : undefined), body: res.body, publishedAt: res.publishedAt };
if (!res.ok) {
  // restore the original draft and republish it, then read back
  const rp = await w.putDraft("process", S.flow, live); const rb = await w.publish("process", S.flow);
  const back = (await w.getDraft("process", S.flow)).body;
  out.restore = { putDraft: rp.status, publish: rb.status, diffVsOriginal: draftDiff(live, back) };
  save(`${R}-result.json`, out); console.log(JSON.stringify(out, null, 1)); process.exit(1);
}
save(`${R}-result.json`, out); // the write is recorded before any further call
const back = res.back;
if (!back) { out.readBackError = "draft GET failed after publish (rate limit)"; save(`${R}-result.json`, out); process.exit(1); }
const rbDiff = draftDiff(next, back);
out.readBack = { metaVersion: back._meta_version, publishedAt: back.PublishedAt, diffVsSent: { added: rbDiff.added, removed: rbDiff.removed, changed: rbDiff.changed.slice(0, 10) }, steps: steps(back).order.map((s) => `${s.depth ? "  ".repeat(s.depth) : ""}${s.name} [${s.id}] ${s.res}${s.cond ? " if " + s.cond : ""} perms=${s.perms}`) };
if (S.check) out.readBack.check = S.check(back);
const pfl = await publishedFields(S.flow);
out.publishedFields = { status: pfl.status, ids: Array.isArray(pfl.body) ? pfl.body.map((f) => f.Id).filter((x) => !String(x).startsWith("_") && x !== "Name") : pfl.body };
out.run = process.argv.includes("--no-run") ? { skipped: "no runtime: the ZZ processes have no initiator grant (key Start submit = 403 050302; the grant was refused by Claude's permission guard)" } : await S.run(out.pre);
save(`${R}-result.json`, out);
console.log(JSON.stringify({ ...out, diff: undefined, readBack: { ...out.readBack, steps: out.readBack.steps } }, null, 1));
