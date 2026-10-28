// B1 CIQ Case graft (plan-v5-final §4.1), in two publishes, each with the shapes proven in the rehearsal (v5/REHEARSAL.md):
//   node b1-case.mjs steps  [--apply]   R2 rename ×2 (same ids) · R3 owner ×2 → CIQ Integration Service (by id) ·
//                                       S7 condition removed · R4/R5 (S-12) removal of Scope check, completeness PS-05, the
//                                       Part 2 parallel block (6 lanes), both open-items checks and Overall approval
//   node b1-case.mjs fields [--apply]   R1 add-field ×19 (§4.1 table, incl. Supplier_Files) with explicit per-step levels,
//                                       the Parallel/SendBack permissions stripped; Start Mandatory/Editable exactly as §4.1,
//                                       every other field ReadOnly at Start; all fields ReadOnly at the two service-held steps and End
// Default = dry run (GET the live draft, mutate in memory, entity diff + preflight → <phase>-dryrun.json). Nothing is written.
// --apply: original saved to v5/originals/CIQ_Case_A00.before-B1-<phase>.json → putDraft → publish → read back the draft
// (diff vs sent) and the published fields → <phase>-result.json. If putDraft/publish fails, the original is PUT back + republished.
import { mutAddField } from "../../../../tools/kissflow-app-agents-1.6.0/engine/patch.mjs";
import {
  CASE, getDraftStrict, putPublish, restore, publishedFields, save, load, exists, saveOriginal, clone, draftDiff, preflight, steps, ents,
  removeActivities, setPerm, stripNonTaskPerms, permMatrix,
} from "./lib-b1.mjs";

const PHASE = process.argv[2];
const APPLY = process.argv.includes("--apply");
const INTEG = { id: "RoEKl89I5nGx", name: "CIQ Integration Service" };
const ACT = { start: "Activity_p1i6xz", s1: "Activity_1kltjdn", s7: "Activity_gwgj5o", end: "Activity_ycf01a" };
const REMOVE = ["Activity_1feompb", "Activity_1a281c6", "Activity_on1xvu", "Activity_1lo09cp", "Activity_dullxt", "Activity_luckcl"];
const LANES = ["Activity_xnbq22", "Activity_1armoq0", "Activity_1kxceje", "Activity_1252uy3", "Activity_h505sh", "Activity_vrfxbc"];
const NAMES = { [ACT.s1]: { was: "Waiting for supplier: basic data", now: "Waiting for supplier: CIQ" }, [ACT.s7]: { was: "Waiting for supplier: final release PS-11", now: "Beiersdorf review and final release" } };

// §4.1 "Add fields" (names chosen so the engine's slug gives exactly the plan's ids)
const NEW_FIELDS = [
  { name: "Template Version", type: "Text" },
  { name: "Case Phase", type: "Select", referredList: "CIQ_Case_Phase_A00" },
  { name: "Priority", type: "Select", referredList: "CIQ_Priority_A00" },
  { name: "Duplicate Reason", type: "Textarea" },
  { name: "Follow Up Of Case", type: "Text" },
  { name: "Follow Up Of Report", type: "Text" },
  { name: "Cancel Reason", type: "Textarea" },
  { name: "Cancelled By Name", type: "Text" },
  { name: "Cancelled At", type: "DateTime" },
  { name: "Cancelled From Phase", type: "Text" },
  { name: "Reactivate Reason", type: "Textarea" },
  { name: "Reactivated At", type: "DateTime" },
  { name: "Release Requested At", type: "DateTime" },
  { name: "Portal Release Item Id", type: "Text" },
  { name: "Final Document Hash", type: "Text" },
  { name: "Final Document At", type: "DateTime" },
  { name: "Undefined Origin", type: "Select", referredList: "CIQ_Yes_No_A00" },
  { name: "Case Data Item Id", type: "Text" },
  { name: "Supplier Files", type: "Attachment" },
];
// §4.1 Start row
const START_MANDATORY = ["Case_Code", "Cycle_No", "Trade_Name", "Main_INCI", "BDF_Material_No", "Supplier_Code", "Supplier_Legal_Name", "Owner_RMM", "BDF_Contact_Name", "BDF_Contact_Email", "Supplier_Due_Date", "Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Supplier_Contact_Emails", "Target_Markets_Text", "Release_Item_Id", "Release_Key", "Manifest_Hash", "Rule_Set_Version", "Template_Version"];
const START_EDITABLE = ["Case_Title", "Priority", "Duplicate_Reason", "Follow_Up_Of_Case", "Follow_Up_Of_Report", "SAP_Material_No", "IRMA_Ref", "Case_Test", "Markets_Label", "Template_Label", "Release_Manifest_JSON"];

/** Remove a step's condition: its Expression(s) + Node tree, and the Activity::Expression link (S1's unconditional shape). */
function removeCondition(b, actId) {
  const a = b[actId]; const gone = new Set();
  const dropNode = (id) => { const n = b[id]; if (!n || gone.has(id)) return; gone.add(id); for (const c of n["Node::Node"] || []) dropNode(c); };
  const exprs = new Set([...(a["Activity::Expression"] || []), ...ents(b).filter((e) => e.Kind === "Expression" && e.Activity === actId).map((e) => e.Id)]);
  const was = [...exprs].map((x) => b[x]?.ExpressionStr);
  for (const x of exprs) { gone.add(x); for (const n of b[x]?.["Expression::Node"] || []) dropNode(n); }
  for (const e of ents(b)) if (e.Kind === "Node" && gone.has(e.Expression)) dropNode(e.Id);
  delete a["Activity::Expression"];
  const byKind = {}; for (const id of gone) { const k = b[id]?.Kind || "?"; byKind[k] = (byKind[k] || 0) + 1; delete b[id]; }
  const dangling = [];
  for (const [k, v] of Object.entries(b)) { if (!v || typeof v !== "object") continue; for (const [p, val] of Object.entries(v)) for (const x of Array.isArray(val) ? val : [val]) if (typeof x === "string" && gone.has(x)) dangling.push(`${k}.${p}→${x}`); }
  if (dangling.length) throw new Error(`dangling refs after condition removal: ${dangling.slice(0, 10).join(", ")}`);
  return { was, removed: byKind };
}

const PHASES = {
  steps: {
    what: "rename S1/S7 (ids kept), owners → CIQ Integration Service, S7 condition removed, remove 6 steps incl. the 6-lane Part 2 block",
    guard: (b) => { for (const id of [...REMOVE, ...LANES, ACT.s1, ACT.s7]) if (!b[id]) throw new Error(`expected activity ${id} missing: already applied?`); },
    mutate: (b) => {
      const out = {};
      out.removed = removeActivities(b, REMOVE);
      out.condition = removeCondition(b, ACT.s7);
      out.renamed = []; out.owners = [];
      for (const id of [ACT.s1, ACT.s7]) {
        if (b[id].Name !== NAMES[id].was) throw new Error(`${id} is named "${b[id].Name}", expected "${NAMES[id].was}"`);
        b[id].Name = NAMES[id].now; out.renamed.push(`${id}: ${NAMES[id].was} → ${NAMES[id].now}`);
        const rs = (b[id]["Activity::Resource"] || []).map((r) => b[r]).filter(Boolean);
        if (rs.length !== 1) throw new Error(`${id} has ${rs.length} resources`);
        const was = `${rs[0].ValueType}:${rs[0].DisplayValue}:${rs[0].Value}`;
        Object.assign(rs[0], { ValueType: "AppRole", DisplayValue: INTEG.name, Value: INTEG.id });
        out.owners.push(`${id} ${rs[0].Id}: ${was} → AppRole:${INTEG.name}:${INTEG.id}`);
      }
      return out;
    },
    check: (back) => ({
      order: steps(back).order.map((s) => `${s.name} [${s.id}] ${s.res}${s.cond ? " if " + s.cond : ""}`),
      removedGone: [...REMOVE, ...LANES].every((id) => !back[id]),
      ids: { s1: back[ACT.s1]?.Name, s7: back[ACT.s7]?.Name, s7Condition: back[ACT.s7]?.["Activity::Expression"] ?? null },
    }),
  },
  fields: {
    what: "add the 19 §4.1 fields with explicit per-step levels; Start Mandatory/Editable as §4.1; S1/S7/End all ReadOnly",
    guard: (b) => {
      if (b[ACT.s1]?.Name !== NAMES[ACT.s1].now || REMOVE.some((id) => b[id])) throw new Error("the steps phase is not live yet; run `steps --apply` first");
      const have = NEW_FIELDS.map((f) => f.name.replace(/[^A-Za-z0-9]+/g, "_")).filter((id) => b[id]);
      if (have.length) throw new Error(`fields already present: ${have.join(", ")}`);
    },
    mutate: (b) => {
      const out = { added: [], stripped: [] };
      for (const f of NEW_FIELDS) {
        const r = mutAddField(b, f);
        out.added.push({ id: r.id, type: r.type, column: r.column, list: f.referredList });
        out.stripped.push(...stripNonTaskPerms(b, r.column));
      }
      const fieldIds = (b[b.Root]["Model::Field"] || []);
      const missing = [...START_MANDATORY, ...START_EDITABLE].filter((id) => !b[id]);
      if (missing.length) throw new Error(`Start fields missing in the draft: ${missing.join(", ")}`);
      const colOf = (id) => { const c = b[id]?.Column; if (!c) throw new Error(`field ${id} has no column`); return c; };
      const before = permMatrix(b);
      for (const id of fieldIds) {
        setPerm(b, ACT.start, colOf(id), START_MANDATORY.includes(id) ? "Mandatory" : START_EDITABLE.includes(id) ? "Editable" : "ReadOnly");
        for (const a of [ACT.s1, ACT.s7, ACT.end]) setPerm(b, a, colOf(id), "ReadOnly");
      }
      const after = permMatrix(b);
      const levelChanges = [];
      for (const k of Object.keys(after)) {
        const lv = (m) => Object.fromEntries(Object.entries(m || {}).flatMap(([l, fs]) => fs.map((f) => [f, l])));
        const a0 = lv(before[k]), a1 = lv(after[k]);
        for (const f of Object.keys(a1)) if (a0[f] !== a1[f] && !out.added.some((x) => x.id === f)) levelChanges.push(`${k}: ${f} ${a0[f]} → ${a1[f]}`);
      }
      out.levelChangesOnExistingFields = levelChanges;
      out.matrixAfter = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([l, f]) => [l, f.length]))]));
      return out;
    },
    check: (back) => {
      const m = permMatrix(back);
      const start = Object.entries(m).find(([k]) => k.includes(ACT.start))?.[1] || {};
      const eq = (a, b2) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...b2].sort());
      return {
        fields: (back[back.Root]["Model::Field"] || []).length,
        newFieldsPresent: NEW_FIELDS.map((f) => f.name.replace(/[^A-Za-z0-9]+/g, "_")).map((id) => `${id}:${back[id]?.Type ?? "MISSING"}${back[id]?.ReferredList ? "→" + back[id].ReferredList : ""}`),
        startMandatoryExact: eq(start.Mandatory, START_MANDATORY),
        startEditableExact: eq(start.Editable, START_EDITABLE),
        counts: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([l, f]) => [l, f.length]))])),
        permsOnNonTaskActivities: ents(back).filter((e) => e.Kind === "Activity" && !["StartEvent", "UserTask", "EndEvent"].includes(e.NodeType)).map((a) => `${a.Id}:${(a["Activity::Permission"] || []).length}`),
      };
    },
  },
};

const P = PHASES[PHASE];
if (!P) { console.error("usage: node b1-case.mjs <steps|fields> [--apply]"); process.exit(1); }
const out = { step: `B1-case-${PHASE}`, flow: CASE, what: P.what, at: new Date().toISOString(), apply: APPLY };
if (APPLY && exists(`${PHASE}-result.json`) && load(`${PHASE}-result.json`).write?.ok) { console.error(`${PHASE} was already applied (${PHASE}-result.json); refusing to apply twice`); process.exit(1); }
const live = await getDraftStrict(CASE);
out.liveMetaVersion = live._meta_version; out.livePublishedAt = live.PublishedAt;
try { P.guard(live); } catch (e) { out.guardError = e.message; console.log(JSON.stringify(out, null, 1)); process.exit(1); }
const next = clone(live);
try { out.mutation = P.mutate(next); } catch (e) { out.mutationError = e.message; console.log(JSON.stringify(out, null, 1)); process.exit(1); }
const diff = draftDiff(live, next);
const tally = (arr) => arr.reduce((m, s) => { const k = (typeof s === "string" ? s : s.entity).split(" ")[1]; m[k] = (m[k] || 0) + 1; return m; }, {});
out.diffSummary = { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, addedByKind: tally(diff.added), removedByKind: tally(diff.removed), changedByKind: tally(diff.changed) };
out.changedNonPermission = diff.changed.filter((c) => !c.entity.includes(" Permission")).map((c) => ({ entity: c.entity, props: Object.fromEntries(Object.entries(c.props).map(([p, v]) => [p, { was: Array.isArray(v.was) ? `[${v.was.length}]` : v.was, now: Array.isArray(v.now) ? `[${v.now.length}]` : v.now }])) }));
const pf = preflight(CASE, next);
out.preflight = { errors: pf.errors, warnings: [...new Set(pf.warnings.map((x) => x.code))] };
out.dryCheck = P.check(next);
if (!APPLY || pf.errors.length) {
  save(`${PHASE}-dryrun.json`, { ...out, diff });
  console.log(JSON.stringify(out, null, 1));
  process.exit(pf.errors.length ? 1 : 0);
}
saveOriginal(`${CASE}.before-B1-${PHASE}.json`, live);
const res = await putPublish(CASE, next);
out.write = { ok: res.ok, stage: res.stage, putDraft: res.putDraft ?? res.status, publish: res.publish ?? (res.stage === "publish" ? res.status : undefined), body: res.body, errors: res.errors, publishedAt: res.publishedAt };
save(`${PHASE}-result.json`, out);
if (!res.ok) {
  if (res.stage === "putDraft" || res.stage === "publish") out.restore = await restore(CASE, live);
  save(`${PHASE}-result.json`, out); console.log(JSON.stringify(out, null, 1)); process.exit(1);
}
const back = res.back;
const rb = draftDiff(next, back);
out.readBack = { metaVersion: back._meta_version, publishedAt: back.PublishedAt, diffVsSent: { added: rb.added, removed: rb.removed, changed: rb.changed.slice(0, 10), changedCount: rb.changed.length }, check: P.check(back) };
const pfl = await publishedFields(CASE);
const ids = Array.isArray(pfl.body) ? pfl.body.map((f) => f.Id).filter((x) => x && !String(x).startsWith("_") && x !== "Name") : [];
out.publishedFields = { status: pfl.status, count: ids.length, newIdsPublished: NEW_FIELDS.map((f) => f.name.replace(/[^A-Za-z0-9]+/g, "_")).filter((id) => ids.includes(id)).length, missingFromPublished: (back[back.Root]["Model::Field"] || []).filter((id) => !ids.includes(id)) };
save(`${PHASE}-result.json`, out);
console.log(JSON.stringify(out, null, 1));
