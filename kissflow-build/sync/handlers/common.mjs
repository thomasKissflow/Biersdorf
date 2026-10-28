// Shared by every handler: load one case from Kissflow into the prototype's shape, apply a prototype action to it,
// and reconcile the result back into Kissflow. Loading decodes the case's supplier positions into the in-memory contact
// ids, and every ledger write is unminted (identity.mjs): Kissflow only ever sees Kissflow user ids. The department
// projection of an action (`project`) also reaches its audit rows (Actor_Dept).

import { FLOW } from "../ids.mjs";
import { D, buildWorld, runAction, runSequence, caseIn, readLedger, toCiqCase, rmesFromRows, emptyLedger } from "../engine.mjs";
import { reconcile } from "../reconcile.mjs";
import { auditRow } from "../audit.mjs";
import { decodeCase, unmint } from "../identity.mjs";

/** The case store of one case: its Case Data row, ledger, canonical case and RMES rows. */
export async function loadCase(ctx, caseCode) {
  const listed = ctx.caseRows.find((r) => r.Case_Code === caseCode);
  if (!listed) return null;
  const row = (await ctx.port.getFormRow(FLOW.caseData, listed._id)) ?? listed;
  const ledger = readLedger(row);
  const rmesRows = {
    SAF: ledger.items["rmes:SAF"] ? await ctx.port.getFormRow(FLOW.rmesSaf, ledger.items["rmes:SAF"]) : null,
    REG: ledger.items["rmes:REG"] ? await ctx.port.getFormRow(FLOW.rmesReg, ledger.items["rmes:REG"]) : null,
  };
  const c = decodeCase(toCiqCase(row, { rmes: rmesFromRows(rmesRows, { createdAt: undefined }) }), ctx.directory);
  return { row, ledger, before: c, caseItemId: row.Case_Item_Id, rmesRows };
}

export function newCaseStore(caseItemId) {
  return { row: null, ledger: emptyLedger(), before: null, caseItemId, rmesRows: {} };
}

/** Every change report of every case (the prototype numbers them globally: CR-NNNN). */
export function allChangeReports(ctx) {
  return ctx.caseRows.flatMap((r) => readLedger(r).changeReports ?? []);
}

/** Light stubs of the other cases (duplicate warning B-02 needs open cases of the same supplier). */
export function otherCaseStubs(ctx, exceptCode) {
  return ctx.caseRows
    .filter((r) => r.Case_Code !== exceptCode)
    .map((r) => {
      const L = readLedger(r);
      return { id: r.Case_Code, supplierId: r.Supplier_Code, materialNo: r.BDF_Material_No ?? "", phase: L.core.phase ?? "supplier-input", openPoints: [], reviews: [], supplierContactIds: (L.core.contactIds ?? []).map((id) => ctx.directory.supplierIdFor(id, r.Supplier_Code)), confirmations: [], audit: [], documents: [], answers: {}, config: {}, scope: [], liveScope: true, stub: true };
    });
}

export function worldFor(ctx, cases, { project = {}, mailKeys = [], config } = {}) {
  return buildWorld({ users: ctx.directory.users(project), suppliers: ctx.directory.suppliers, config: config ?? ctx.config, cases, mailKeys, changeReports: allChangeReports(ctx) });
}

/**
 * Apply one prototype action (or a sequence) to a loaded case and reconcile Kissflow.
 * @returns {{ already?: true, refused?: true, text?: string, after?: object, report?: object }}
 */
export async function applyToCase(ctx, cs, { triggerKey, actorId, at, project, fn, steps, opts = {}, onRefusal }) {
  if (triggerKey && cs.ledger.applied?.includes(triggerKey)) return { already: true, after: cs.before };
  const world = worldFor(ctx, [cs.before], { project });
  let r;
  if (steps) r = runSequence(world, cs.before.id, steps);
  else r = runAction(world, cs.before.id, fn);
  if (r.refused) {
    if (onRefusal) await onRefusal(r);
    return { refused: true, text: r.refusal, newAudit: r.newAudit };
  }
  const after = caseIn(r.state, cs.before.id);
  const res = await reconcile(ctx, cs, after, r, { triggerKey, actorId, at, project, ...opts });
  return { ok: true, after: res.after, report: res.report, refusals: r.refusals ?? [], state: r.state };
}

/** Writes audit rows that are not part of a reconcile pass (refusals of requests, configuration, alerts). */
export async function writeAudit(ctx, entries, { key, caseCode, caseItemId, category, reason, objectKind, objectKey, project }) {
  const keys = await ctx.index(FLOW.audit, "Event_Key");
  let i = 0;
  for (const e of entries) {
    const k = `${key}#${++i}`;
    if (keys.has(k)) continue;
    const row = auditRow({ key: k, entry: e, directory: ctx.directory, caseCode, caseItemId, reason, objectKind, objectKey, project });
    if (category) row.Event_Category = category;
    await ctx.port.createFormRow(FLOW.audit, row);
    keys.add(k);
  }
}

/** Commit only the ledger (bookkeeping without a state change: revs seen, refused triggers, alerts). */
export async function commitLedger(ctx, cs) {
  const { LEDGER_FIELD } = await import("../engine.mjs");
  await ctx.port.updateFormRow(FLOW.caseData, cs.row._id, { [LEDGER_FIELD]: JSON.stringify(unmint(cs.ledger, ctx.directory.mintedIds)) });
}

/** The supplier contact with this e-mail (portal fields), preferring the case's supplier `code`. */
export const contactByEmail = (ctx, email, code) => ctx.directory.contactByEmail(email, code);

export { D, caseIn };
