// Plan v6 §3.2 backend grafts for the app session's flows (20 Oct, Thomas's OK for tonight's app build).
//   node kissflow-build/ciq-digital/v6/backend-v6.mjs <review|op|audit>            dry run: GET the live draft, show the diff
//   node kissflow-build/ciq-digital/v6/backend-v6.mjs <review|op|audit> --apply    back up → PUT draft → publish → read back
// Every change is IN PLACE on an existing Permission entity (never appended), on top of the live draft, so manual changes
// elsewhere are kept. A permission whose live value is not the expected "from" value is NOT changed (reported as a conflict):
// that protects anything Thomas changed by hand since the app session's last write.
import { call, A, allowId, getDraftStrict, putPublish, setPerm, draftDiff, ents, clone, kinds } from "../v5/b3/lib-b3.mjs";
import { mutAddField } from "../../../tools/kissflow-app-agents-1.6.0/engine/patch.mjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const [TARGET] = process.argv.slice(2);
const APPLY = process.argv.includes("--apply");
const REVIEW = "CIQ_Review_A00", OP = "CIQ_Open_Point_A00", AUDIT = "CIQ_Audit_Event_A00";
const RV = { start: "Activity_47r3ow", depts: ["Activity_1wb6scg", "Activity_116f3su", "Activity_12d3ab4", "Activity_1wkxybl", "Activity_1um3oo7", "Activity_1mh3ji6"] };
const OPS = { start: "Activity_18t0lhi" };

// [activity, field, from, to, why]
const SPECS = {
  review: {
    type: "process", id: REVIEW,
    perms: [
      // D-8: the starter of a review (RMM's screen) must not pre-fill a completion or a decision
      ...["Review_Confirm", "Completed_By", "Completed_By_Name", "Completed_By_Email", "Completed_At", "RMES_Decision", "RMES_Decision_Reason", "Rejection_Handling", "Rejection_Note", "Rejected_Depts_Covered"]
        .map((f) => [RV.start, f, "Editable", "ReadOnly", "decision fields are set by the reviewer at its own step, not at Start"]),
      // v6 has no service: the reviewer's screen writes the live counts the mandatory Review_Gate formula reads
      ...RV.depts.flatMap((a) => ["Open_Count", "RMES_Gaps"].map((f) => [a, f, "ReadOnly", "Editable", "the reviewer's screen writes the open-point and RMES-gap counts before completing (no service in v6)"])),
    ],
  },
  op: {
    type: "process", id: OP,
    perms: [
      [OPS.start, "Raiser_Assignee", "Editable", "Mandatory", "the field-assigned department step needs the raiser; the screen sets it at Start"],
      // D-8: the raiser must not pre-fill an outcome, a close, or the supplier's answer (the integrations write those by admin PUT, proven P-RO)
      ...["OP_Outcome", "Outcome_Reason", "Return_Reason", "Closed_At", "Closed_By"].map((f) => [OPS.start, f, "Editable", "ReadOnly", "set by the raiser at its department step, not at Start"]),
      ...["Response_Kind", "Response_Text", "Response_Doc_Refs_JSON", "Supplier_Responsible_Email", "Portal_Query_Item_Id"].map((f) => [OPS.start, f, "Editable", "ReadOnly", "written only by the hand-off integrations (admin PUT writes ReadOnly fields, probe P-RO)"]),
    ],
  },
  audit: { type: "form", id: AUDIT, addFields: [["Ref Flow Id", "Text"], ["Ref Item Id", "Text"], ["Ref Activity Instance Id", "Text"]] },
};
const spec = SPECS[TARGET];
if (!spec) { console.error("usage: backend-v6.mjs <review|op|audit> [--apply]"); process.exit(1); }
allowId(spec.id);
const out = { target: TARGET, flow: spec.id, at: new Date().toISOString(), apply: APPLY, changes: [], conflicts: [], already: [] };
const live = await getDraftStrict(spec.type, spec.id);
const stamp = out.at.replace(/[:.]/g, "").slice(0, 15);
writeFileSync(here(`./backups/${spec.id}.before-v6.${stamp}.json`), JSON.stringify(live));
out.backup = `v6/backups/${spec.id}.before-v6.${stamp}.json`;
const next = clone(live);
const colOf = Object.fromEntries(ents(next).filter((e) => e.Kind === "Field" && e.Model === spec.id).map((f) => [f.Id, f.Column]));
for (const [act, field, from, to, why] of spec.perms || []) {
  const col = colOf[field]; if (!col) { out.conflicts.push(`${field}: no such field`); continue; }
  const p = (next[act]?.["Activity::Permission"] || []).map((id) => next[id]).find((x) => x && x.Column === col);
  const cur = p?.Permission;
  if (cur === to) { out.already.push(`${next[act].Name} · ${field}: already ${to}`); continue; }
  if (cur !== from) { out.conflicts.push(`${next[act]?.Name} · ${field}: live ${cur ?? "(none)"}, expected ${from}; NOT changed`); continue; }
  setPerm(next, act, col, to);
  out.changes.push(`${next[act].Name} · ${field}: ${from} → ${to} (${why})`);
}
for (const [name, type] of spec.addFields || []) {
  const id = name.replace(/ /g, "_");
  if (next[id]) { out.already.push(`${id}: field exists`); continue; }
  const r = mutAddField(next, { name, type });
  if (r.id !== id) throw new Error(`add-field gave ${r.id}, expected ${id}`);
  out.changes.push(`add field ${id} (${type})`);
}
const diff = draftDiff(live, next);
out.diffSummary = { added: diff.added, removed: diff.removed, changed: diff.changed.length, kindsBefore: kinds(live), kindsAfter: kinds(next) };
if (out.conflicts.length) out.note = "conflicts are left as they are live (manual changes kept); review them";
if (APPLY && out.changes.length) {
  const r = await putPublish(spec.type, spec.id, next);
  out.write = { ok: r.ok, stage: r.stage, putDraft: r.putDraft, publish: r.publish, publishedAt: r.publishedAt, errors: r.errors, body: r.body };
  if (r.ok) {
    const back = r.back;
    const bcol = Object.fromEntries(ents(back).filter((e) => e.Kind === "Field" && e.Model === spec.id).map((f) => [f.Id, f.Column]));
    out.readBack = [];
    for (const [act, field, , to] of spec.perms || []) {
      const p = (back[act]?.["Activity::Permission"] || []).map((id) => back[id]).find((x) => x && x.Column === bcol[field]);
      out.readBack.push(`${back[act]?.Name} · ${field}: ${p?.Permission}${p?.Permission === to ? " OK" : ` WANT ${to}`}`);
    }
    for (const [name, type] of spec.addFields || []) { const f = back[name.replace(/ /g, "_")]; out.readBack.push(`${name.replace(/ /g, "_")}: ${f ? f.Type + (f.Type === type ? " OK" : " WANT " + type) : "MISSING"}`); }
    out.readBackFails = out.readBack.filter((x) => !x.endsWith(" OK")).length;
    const after = draftDiff(next, back);
    out.serverSideDiff = { added: after.added.length, removed: after.removed.length, changed: after.changed.length };
  }
}
writeFileSync(here(`./backend-${TARGET}-${APPLY ? "result" : "dryrun"}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, diffSummary: { ...out.diffSummary, kindsBefore: undefined } }, null, 1));
