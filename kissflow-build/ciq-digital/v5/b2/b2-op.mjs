// B2 CIQ Open Point graft (plan-v5-final §4.3), in two publishes, each with the shapes proven in the rehearsal
// (v5/REHEARSAL.md) and used by B1 on CIQ Case:
//   node b2-op.mjs steps  [--apply]   R4 removal of "Waiting for supplier" Activity_4k7uck (Activity + its Permissions,
//                                     Resource, Expression + Node tree; unlinked from the ProcessDef) · R2 rename of the 6
//                                     review steps "Review – <Dept>" → "Open point – <Dept>" (same ids). Owners stay ROLE
//                                     (V-19 fallback: S-11 field routing is unproven live), conditions OP_Dept = "<D>" kept.
//   node b2-op.mjs fields [--apply]   R1 add-field ×5 (Raised_By_User User, Raised_By_Name Text, Thread_JSON Textarea,
//                                     Closed_At DateTime, Closed_By User) with explicit per-step levels; the SendBack
//                                     permission the verb adds is stripped. Levels per §4.3:
//                                       Start: the 16 Mandatory; every other non-formula field Editable; formulas ReadOnly
//                                       6 review steps: OP_Outcome Mandatory; the 14 listed Editable; all else ReadOnly
//                                       (the unused Rounds table column → ReadOnly too); End: all ReadOnly.
//                                     + (fixer, 15 Oct) Open_Num formula → IF(ISBLANK(OP_Outcome),1,0) and OP_Dept field Required.
// Default = dry run (GET the live draft, mutate in memory, entity diff + preflight → <phase>-dryrun.json). Nothing is written.
// --apply: original saved to v5/originals/CIQ_Open_Point_A00.before-B2-<phase>.json → putDraft → publish → read back the
// draft (diff vs sent) and the published fields → <phase>-result.json. If putDraft/publish fails, the original is PUT back.
import { mutAddField } from "../../../../tools/kissflow-app-agents-1.6.0/engine/patch.mjs";
import { eid } from "../../../../tools/kissflow-app-agents-1.6.0/engine/util.mjs";
import {
  OP, getDraftStrict, putPublish, restore, publishedFields, save, load, exists, saveOriginal, clone, draftDiff, preflight, steps, ents,
  removeActivities, setPerm, stripNonTaskPerms, permMatrix, calls,
} from "./lib-b2.mjs";

const PHASE = process.argv[2];
const APPLY = process.argv.includes("--apply");
const ACT = { start: "Activity_18t0lhi", end: "Activity_i73i25" };
const REMOVE = ["Activity_4k7uck"];
const REVIEW = { Activity_uka3mx: "Regulatory", Activity_1kdump3: "Safety", Activity_1go37bt: "QM", Activity_hha7u2: "Microbiology", Activity_y4af4g: "Sustainability", Activity_xc8fbb: "RMM" };
const ROLE_OF = { Activity_uka3mx: "RoEKl84Hca4w", Activity_1kdump3: "RoEKl84xAFRW", Activity_1go37bt: "RoEKl85WB1yE", Activity_hha7u2: "RoEKl8647K2u", Activity_y4af4g: "RoEKl86bQQrO", Activity_xc8fbb: "RoEKl83f9jPF" };
const COND_OF = { Activity_uka3mx: "REG", Activity_1kdump3: "SAF", Activity_1go37bt: "QM", Activity_hha7u2: "MIC", Activity_y4af4g: "SUS", Activity_xc8fbb: "RMM" };
const ROUNDS_COL = "Column_1je59z6"; // the Rounds child-table column (no longer used; Hidden in B4)
const OPEN_NUM = "IF(ISBLANK(OP_Outcome),1,0)";

// §4.3 "Add fields" (names chosen so the engine's slug gives exactly the plan's ids)
const NEW_FIELDS = [
  { name: "Raised By User", type: "User" },
  { name: "Raised By Name", type: "Text" },
  { name: "Thread JSON", type: "Textarea" },
  { name: "Closed At", type: "DateTime" },
  { name: "Closed By", type: "User" },
];
const idOf = (f) => f.name.replace(/[^A-Za-z0-9]+/g, "_");
// §4.3 Start row
const START_MANDATORY = ["OP_Key", "Round_No", "Case_Code", "Cycle_No", "Supplier_Code", "Case_Item_Id", "OP_Kind", "OP_Dept", "Raised_By_Dept", "Raised_By_User", "Ref_Kind", "Ref_Label", "Question_Text", "Supplier_Justification", "Responsible_User", "Supplier_Due_Date"];
// §4.3 review-step row ("as REG" for all six)
const REVIEW_MANDATORY = ["OP_Outcome"];
const REVIEW_EDITABLE = ["Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Responsible_User", "Responsible_Name", "Round_No", "Query_Key", "Kind_Label", "OP_Progress", "Outcome_Reason", "Return_Reason", "Thread_JSON", "Closed_At", "Closed_By"];

const PHASES = {
  steps: {
    what: 'remove "Waiting for supplier" Activity_4k7uck; rename the 6 review steps to "Open point – <Dept>" (ids, role owners and conditions kept)',
    guard: (b) => {
      for (const id of [...REMOVE, ...Object.keys(REVIEW)]) if (!b[id]) throw new Error(`expected activity ${id} missing: already applied?`);
      for (const [id, d] of Object.entries(REVIEW)) if (b[id].Name !== `Review – ${d}`) throw new Error(`${id} is named "${b[id].Name}", expected "Review – ${d}"`);
    },
    mutate: (b) => {
      const out = {};
      out.removed = removeActivities(b, REMOVE);
      out.renamed = [];
      for (const [id, d] of Object.entries(REVIEW)) { const was = b[id].Name; b[id].Name = `Open point – ${d}`; out.renamed.push(`${id}: ${was} → ${b[id].Name}`); }
      return out;
    },
    check: (back) => ({
      order: steps(back).order.map((s) => `${s.name} [${s.id}] ${s.res}${s.cond ? " if " + s.cond : ""} perms=${s.perms}`),
      removedGone: REMOVE.every((id) => !back[id]),
      reviewSteps: Object.entries(REVIEW).map(([id, d]) => {
        const res = (back[id]?.["Activity::Resource"] || []).map((r) => back[r]);
        const cond = (back[id]?.["Activity::Expression"] || []).map((x) => back[x]?.ExpressionStr);
        return { id, name: back[id]?.Name, nameOk: back[id]?.Name === `Open point – ${d}`, roleOk: res.length === 1 && res[0].ValueType === "AppRole" && res[0].Value === ROLE_OF[id], role: res.map((r) => `${r?.ValueType}:${r?.DisplayValue}:${r?.Value}`), condOk: cond.length === 1 && cond[0] === `OP_Dept = "${COND_OF[id]}"`, cond };
      }),
    }),
  },
  fields: {
    what: "add the 5 §4.3 fields with explicit per-step levels; Start Mandatory/Editable and review-step Mandatory/Editable as §4.3; End all ReadOnly",
    guard: (b) => {
      if (b[REMOVE[0]] || b.Activity_uka3mx?.Name !== "Open point – Regulatory") throw new Error("the steps phase is not live yet; run `steps --apply` first");
      const have = NEW_FIELDS.map(idOf).filter((id) => b[id]);
      if (have.length) throw new Error(`fields already present: ${have.join(", ")}`);
      if (b[ROUNDS_COL]?.Type !== "Model") throw new Error(`${ROUNDS_COL} is not the Rounds table column`);
    },
    mutate: (b) => {
      const out = { added: [], stripped: [] };
      for (const f of NEW_FIELDS) {
        const r = mutAddField(b, f);
        out.added.push({ id: r.id, type: r.type, column: r.column, qd: (b[r.id]?.["Field::QueryDefinition"] || []).map((q) => b[q]) });
        out.stripped.push(...stripNonTaskPerms(b, r.column));
      }
      const fieldIds = b[b.Root]["Model::Field"] || [];
      const missing = [...START_MANDATORY, ...REVIEW_MANDATORY, ...REVIEW_EDITABLE].filter((id) => !b[id]);
      if (missing.length) throw new Error(`fields missing in the draft: ${missing.join(", ")}`);
      const colOf = (id) => { const c = b[id]?.Column; if (!c) throw new Error(`field ${id} has no column`); return c; };
      const isFormula = (id) => !!b[id]?.["Field::Expression"];
      out.formulaFields = fieldIds.filter(isFormula);
      const before = permMatrix(b);
      for (const id of fieldIds) {
        setPerm(b, ACT.start, colOf(id), START_MANDATORY.includes(id) ? "Mandatory" : isFormula(id) ? "ReadOnly" : "Editable");
        for (const a of Object.keys(REVIEW)) setPerm(b, a, colOf(id), REVIEW_MANDATORY.includes(id) ? "Mandatory" : REVIEW_EDITABLE.includes(id) ? "Editable" : "ReadOnly");
        setPerm(b, ACT.end, colOf(id), "ReadOnly");
      }
      out.roundsTable = {};
      for (const a of Object.keys(REVIEW)) { const p = (b[a]["Activity::Permission"] || []).map((x) => b[x]).find((x) => x?.Column === ROUNDS_COL); out.roundsTable[a] = p?.Permission; }
      for (const a of Object.keys(REVIEW)) setPerm(b, a, ROUNDS_COL, "ReadOnly");
      // Fixer 15 Oct (verified finding; plan §4.3 amended first): Open_Num = IF(ISBLANK(OP_Outcome),1,0), so every closed
      // outcome (Accepted, Withdrawn, Not accepted) counts 0. Same Expression id; its Node tree is rebuilt in the exact
      // shape of the live App Builder AST (IF Number/Logical; ISBLANK Boolean/String on a Select = the Start_Gate nodes).
      const ex = b.Open_Num?.["Field::Expression"]?.[0];
      if (!ex || !b[ex]) throw new Error("Open_Num has no Expression");
      out.openNumWas = b[ex].ExpressionStr;
      const dropNode = (id) => { const n = b[id]; if (!n || n.Kind !== "Node") return; for (const c of n["Node::Node"] || []) dropNode(c); delete b[id]; };
      for (const r of b[ex]["Expression::Node"] || []) dropNode(r);
      for (const e of ents(b)) if (e.Kind === "Node" && e.Expression === ex) dropNode(e.Id);
      const nid = (i) => eid("Node", `${ex}:v5:${i}`);
      const [n0, n1, n2, n3, n4] = [0, 1, 2, 3, 4].map(nid);
      b[n0] = { Id: n0, Kind: "Node", DataType: "Number", Type: "Function", Value: "IF", Category: "Logical", "Node::Node": [n1, n3, n4], FieldRefCount: 3, Expression: ex };
      b[n1] = { Id: n1, Kind: "Node", DataType: "Boolean", Type: "Function", Value: "ISBLANK", Category: "String", "Node::Node": [n2], FieldRefCount: 1, Node: n0 };
      b[n2] = { Id: n2, Kind: "Node", DataType: "String", Type: "Field", Field: "OP_Outcome", Node: n1 };
      b[n3] = { Id: n3, Kind: "Node", DataType: "Number", Type: "Static", Value: "1", Node: n0 };
      b[n4] = { Id: n4, Kind: "Node", DataType: "Number", Type: "Static", Value: "0", Node: n0 };
      b[ex].ExpressionStr = OPEN_NUM;
      b[ex]["Expression::Node"] = [n0];
      // Fixer 15 Oct (verified finding; plan §4.3 amended first): OP_Dept field-level Required, enforced at Start (P7), so a
      // point can never skip all six conditional steps and complete at once.
      b.OP_Dept.Required = true;
      const after = permMatrix(b);
      const levelChanges = [];
      const lv = (m) => Object.fromEntries(Object.entries(m || {}).flatMap(([l, fs]) => fs.map((f) => [f, l])));
      for (const k of Object.keys(after)) {
        const a0 = lv(before[k]), a1 = lv(after[k]);
        for (const f of Object.keys(a1)) if (a0[f] !== a1[f] && !out.added.some((x) => x.id === f)) levelChanges.push(`${k}: ${f} ${a0[f]} → ${a1[f]}`);
      }
      out.levelChangesOnExistingFields = levelChanges.length;
      out.levelChangesSample = levelChanges;
      out.matrixAfter = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([l, f]) => [l, f.length]))]));
      return out;
    },
    check: (back) => {
      const m = permMatrix(back);
      const at = (actId) => Object.entries(m).find(([k]) => k.includes(actId))?.[1] || {};
      const eq = (a, b2) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...b2].sort());
      const fieldIds = back[back.Root]["Model::Field"] || [];
      const startEditableExpected = fieldIds.filter((id) => !START_MANDATORY.includes(id) && !back[id]?.["Field::Expression"]);
      const roundsLv = (a) => (back[a]?.["Activity::Permission"] || []).map((x) => back[x]).find((x) => x?.Column === ROUNDS_COL)?.Permission;
      return {
        fields: fieldIds.length,
        newFieldsPresent: NEW_FIELDS.map(idOf).map((id) => `${id}:${back[id]?.Type ?? "MISSING"}${back[id]?.["Field::QueryDefinition"] ? " qd=" + back[back[id]["Field::QueryDefinition"][0]]?.LHSModel : ""}`),
        startMandatoryExact: eq(at(ACT.start).Mandatory, START_MANDATORY),
        startEditableExact: eq(at(ACT.start).Editable, startEditableExpected),
        reviewExact: Object.keys(REVIEW).map((a) => `${a}: M=${eq(at(a).Mandatory, REVIEW_MANDATORY)} E=${eq(at(a).Editable, REVIEW_EDITABLE)} Rounds=${roundsLv(a)}`),
        endAllReadOnly: (at(ACT.end).ReadOnly || []).length === fieldIds.length,
        openNum: (() => { const x = back[back.Open_Num?.["Field::Expression"]?.[0]]; const r = back[x?.["Expression::Node"]?.[0]]; return { str: x?.ExpressionStr, ok: x?.ExpressionStr === OPEN_NUM && r?.Value === "IF" && (r["Node::Node"] || []).every((c) => back[c]) }; })(),
        opDeptRequired: back.OP_Dept?.Required === true,
        counts: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([l, f]) => [l, f.length]))])),
        permsOnNonTaskActivities: ents(back).filter((e) => e.Kind === "Activity" && !["StartEvent", "UserTask", "EndEvent"].includes(e.NodeType)).map((a) => `${a.Id}:${(a["Activity::Permission"] || []).length}`),
      };
    },
  },
};

const P = PHASES[PHASE];
if (!P) { console.error("usage: node b2-op.mjs <steps|fields> [--apply]"); process.exit(1); }
const out = { step: `B2-op-${PHASE}`, flow: OP, what: P.what, at: new Date().toISOString(), apply: APPLY };
if (APPLY && exists(`${PHASE}-result.json`) && load(`${PHASE}-result.json`).write?.ok) { console.error(`${PHASE} was already applied (${PHASE}-result.json); refusing to apply twice`); process.exit(1); }
// --offline: NO network. Start from the saved original (v5/originals/…before-B2.json); for `fields`, the steps mutation is
// applied in memory first. Validates the whole graft end to end before anyone applies it. Never writes to Kissflow.
const OFFLINE = process.argv.includes("--offline");
if (OFFLINE && APPLY) { console.error("--offline and --apply are exclusive"); process.exit(1); }
let live;
if (OFFLINE) {
  const { readFileSync } = await import("node:fs");
  live = JSON.parse(readFileSync(new URL("../originals/CIQ_Open_Point_A00.before-B2.json", import.meta.url), "utf8"));
  if (PHASE === "fields") { PHASES.steps.guard(live); PHASES.steps.mutate(live); }
  out.offline = true;
} else live = await getDraftStrict(OP);
out.liveMetaVersion = live._meta_version; out.livePublishedAt = live.PublishedAt;
try { P.guard(live); } catch (e) { out.guardError = e.message; console.log(JSON.stringify(out, null, 1)); process.exit(1); }
const next = clone(live);
try { out.mutation = P.mutate(next); } catch (e) { out.mutationError = e.message; console.log(JSON.stringify(out, null, 1)); process.exit(1); }
const diff = draftDiff(live, next);
const tally = (arr) => arr.reduce((m, s) => { const k = (typeof s === "string" ? s : s.entity).split(" ")[1]; m[k] = (m[k] || 0) + 1; return m; }, {});
out.diffSummary = { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, addedByKind: tally(diff.added), removedByKind: tally(diff.removed), changedByKind: tally(diff.changed) };
out.changedNonPermission = diff.changed.filter((c) => !c.entity.includes(" Permission")).map((c) => ({ entity: c.entity, props: Object.fromEntries(Object.entries(c.props).map(([p, v]) => [p, { was: Array.isArray(v.was) ? `[${v.was.length}]` : v.was, now: Array.isArray(v.now) ? `[${v.now.length}]` : v.now }])) }));
const pf = preflight(OP, next);
out.preflight = { errors: pf.errors, warnings: [...new Set(pf.warnings.map((x) => x.code))] };
out.dryCheck = P.check(next);
if (!APPLY || pf.errors.length) {
  out.calls = calls;
  save(`${PHASE}-dryrun${OFFLINE ? "-offline" : ""}.json`, { ...out, diff });
  console.log(JSON.stringify({ ...out, mutation: { ...out.mutation, levelChangesSample: undefined } }, null, 1));
  process.exit(pf.errors.length ? 1 : 0);
}
saveOriginal(`${OP}.before-B2-${PHASE}.json`, live);
const res = await putPublish(OP, next);
out.write = { ok: res.ok, stage: res.stage, putDraft: res.putDraft ?? res.status, publish: res.publish ?? (res.stage === "publish" ? res.status : undefined), body: res.body, errors: res.errors, publishedAt: res.publishedAt };
save(`${PHASE}-result.json`, out);
if (!res.ok) {
  if (res.stage === "putDraft" || res.stage === "publish") out.restore = await restore(OP, live);
  out.calls = calls; save(`${PHASE}-result.json`, out); console.log(JSON.stringify(out, null, 1)); process.exit(1);
}
const back = res.back;
const rb = draftDiff(next, back);
out.readBack = { metaVersion: back._meta_version, publishedAt: back.PublishedAt, diffVsSent: { added: rb.added, removed: rb.removed, changed: rb.changed.slice(0, 10), changedCount: rb.changed.length }, check: P.check(back) };
const pfl = await publishedFields(OP);
const ids = Array.isArray(pfl.body) ? pfl.body.map((f) => f.Id).filter((x) => x && !String(x).startsWith("_") && x !== "Name") : [];
out.publishedFields = { status: pfl.status, count: ids.length, newIdsPublished: NEW_FIELDS.map(idOf).filter((id) => ids.includes(id)), missingFromPublished: (back[back.Root]["Model::Field"] || []).filter((id) => !ids.includes(id)) };
if (PHASE === "fields") save(`CIQ_Open_Point_A00.after-B2.draft.json`, back);
out.calls = calls;
save(`${PHASE}-result.json`, out);
console.log(JSON.stringify({ ...out, mutation: { ...out.mutation, levelChangesSample: undefined } }, null, 1));
