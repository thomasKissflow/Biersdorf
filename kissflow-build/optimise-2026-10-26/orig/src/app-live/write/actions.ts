// One writer per supported store method (DESIGN §6 table). Owner C.
// The store (api.ts) has already run liveGuard and the pure domain action; a writer gets `prev` and the accepted `next`
// and encodes the difference into Kissflow, always in this order:
//   item write → read-back (writeVerified) → the UI's Mandatory gate (assertMandatory: the SDK submit does not
//   enforce Mandatory, G-7) → submit → hand-offs → exactly one audit row (D-7). The final-release request is NOT sent
//   here: E-B, an integration on a review's completion, is its only sender (22 Oct; before, RMM's load). A hand-off
//   carries the app item ids only (shared/handoff.ts, 20 Oct); it goes out after the item write it names was read
//   back, so the integration reads the new values from Kissflow.
// A held process item is staleCheck-ed before its first update. A child row is only ever updated by an `_id` the
// read gave (an unknown `_id` would ADD a duplicate row); new rows go with `_is_created: true`.
// Results: ok with the job's hand-offs and warnings (a lost audit row is a warning; the store toasts the domain's own
// success text unless `message` is set), the read-backs of its writes (`saved`), its audit row (`auditRow`) and
// `moved`, so the store can show what Kissflow read back instead of reading everything again (APP-SAVING-GAPS gap 1).
// Not ok: `message` is the whole toast text: "Not saved: <why>" when nothing reached Kissflow, else what did reach it
// plus "Not finished: <why>"; a draft left behind or a stale item has its own text. Writers never throw.
// The texts (FE-CLEANUP, 22 Oct): in production <why> is the cause in plain words, with no Kissflow code, flow or field
// name (userText.ts; ctx.env), and the raw cause goes to `detail` (the Writes log); dev keeps the raw cause.
// A submit whose answer is lost (the 30 s bound) may still have moved the item: submitOrMoved checks before the
// writer gives up, so the hand-offs and the audit row still go out (gap 3).
// Every Kissflow call goes through AppClient (kf/client.ts, owner A), whose SDK shapes cite kfsdk.es.js 1.0.49.
import type { CompleteOptions, NewCaseInput, OpenPointPatch, RaiseInput } from "@/domain/actions";
import { DEPT_SHORT } from "@/domain/catalog";
import { pairLabel } from "@/domain/configActions";
import type { ContactInput, SupplierInput, SupplierPatch } from "@/domain/suppliers";
import type { AppState, CiqCase, Confirmation, OpenPoint, ReviewDept, RmesResult, User } from "@/domain/types";
import { caseContactsOf, parseMarkets } from "@/portal/data/map";
import { childRows, json, num, refUser, str, type RawItem } from "@/portal/data/raw";
import { errorText, type KfData } from "@/portal/kf/sdk";
import { LIST, STEPS, TABLES } from "../ids";
import { isDataRefusal, isRateLimited, kfCode } from "../kf/client";
import { DRAFT_KEY, ownDraftHas } from "../load";
import type { CaseHeader } from "../map/auditMap";
import { releaseForPair } from "../map/config";
import { Directory, kfIdOfContact } from "../map/people";
import { openPointsOf } from "../map/trackMap";
import { caseStartPayload, type CaseStartFields } from "../shared/caseStartPayload";
import type { HandoffCode } from "../shared/handoff";
import type { FormKey, LiveWriters, ProcessKey, WriteCtx, WriteResult, Writer } from "../types";
import { GATE_NOT_OK, PlainError, STILL_NEEDS, USE_UNSENT, causeFor, errorFor, startText, unfinishedText } from "../userText";
import { newEntries, newLog, recordAudit, work, writeAudit, type Work } from "./audit";
import {
  caseHeaderOf,
  caseStartFields,
  childRowId,
  compact,
  contactRow,
  countsOf,
  findingRow,
  isPortalUser,
  kfDate,
  kfDateTimeOf,
  nameIn,
  noteFields,
  opStartFields,
  reviewStartFields,
  rmesFlowOf,
  rmesTables,
  supplierFields,
  threadJson,
  userRef,
} from "./encode";
import { GUARD_TEXT, caseRefOf, contactRowOf, heldOp, heldReview, rmesRefOf, supplierRefOf } from "./guards";
import { handoff, historyHandoff } from "./handoff";
import { MAILS, sendMail } from "./mail";
import { CONTACT_KEY_HELD, StaleError, assertMandatory, firstThen, leftQueue, lostRows, missingOf, rowsMissing, settle, staleCheck, writeVerified } from "./verify";

/** A step that stopped with its own toast text (a draft left behind, a gate that is not OK). `detail`: the raw cause
 *  production's text put in plain words. */
class Stop extends Error {
  constructor(
    message: string,
    readonly tone: "warning" | "danger" = "warning",
    readonly detail?: string,
  ) {
    super(message);
  }
}

const isProd = (ctx: Pick<WriteCtx, "env">) => ctx.env === "prod";

type Extra = Partial<Pick<WriteResult, "message" | "tone">> | void;

/** Hand-offs whose integration writes the app item back (I-3 puts the portal query on the point): once one went out,
 *  the read-back is not the whole story, so the store reads again. */
const WRITES_BACK: ReadonlySet<HandoffCode> = new Set<HandoffCode>(["op.round", "op.edited"]);

/** The raw causes behind production's plain words, for the Writes log (WriteResult.detail). */
const detailOf = (raw: (string | undefined)[]): { detail?: string } => {
  const d = raw.filter(Boolean).join(" ");
  return d ? { detail: d } : {};
};

/** Runs a writer body: every failure becomes a not-ok result (DESIGN §6 partial-failure rule). In production the cause
 *  is said plainly and a partial save adds what to do, once (C12: unfinishedText). */
async function attempt(ctx: Pick<WriteCtx, "env">, body: (w: Work) => Promise<Extra>): Promise<WriteResult> {
  const w = work();
  try {
    const extra = (await body(w)) ?? {};
    const moved = w.moved || w.handoffs.some((h) => h.status === "sent" && WRITES_BACK.has(h.code));
    return { ok: true, handoffs: w.handoffs, warnings: w.warnings, saved: w.saved, ...(w.auditRow ? { auditRow: w.auditRow } : {}), moved, ...detailOf(w.details), ...extra };
  } catch (e) {
    const base = { ok: false, handoffs: w.handoffs, warnings: w.warnings };
    if (e instanceof StaleError) return { ...base, tone: "danger", message: e.message, ...detailOf(w.details) };
    if (e instanceof Stop) return { ...base, tone: e.tone, message: e.message, ...detailOf([e.detail, ...w.details]) };
    const why = errorFor(ctx.env, e);
    const raw = errorText(e);
    const detail = detailOf([why !== raw ? raw : undefined, ...w.details]);
    return w.done.length
      ? { ...base, tone: "warning", message: `${w.done.join(" ")} Not finished: ${isProd(ctx) ? unfinishedText(e) : why}`, ...detail }
      : { ...base, tone: "danger", message: `Not saved: ${why}`, ...detail };
  }
}

// ---------------------------------------------------------------------------------- look-ups

/** The value, or a refusal already in the user's words (a guard's text, "… is no longer loaded"). */
function need<T>(v: T | undefined | null | "", text: string): T {
  if (v === undefined || v === null || v === "") throw new PlainError(text);
  return v;
}
/** C20: the domain just added the thing, so the screen should hold it; practically unreachable. */
const lostTrack = (thing: string) => `The screen lost track of the new ${thing}. Reload and check whether it was saved.`;
const caseIn = (s: AppState, id: string): CiqCase => need(s.cases.find((c) => c.id === id), `Case ${id} is no longer loaded. Reload and try again.`);
const opIn = (c: CiqCase, id: string): OpenPoint => need(c.openPoints.find((p) => p.id === id), `Open point ${id} is no longer loaded. Reload and try again.`);
/** Items of `after` that `before` lacks (by id). */
const added = <T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] => after.filter((x) => !before.some((y) => y.id === x.id));
/** Confirmations the action added (the domain appends; earlier ones keep their identity). */
const newConfirmation = (c0: CiqCase, c: CiqCase, type: Confirmation["type"]): Confirmation | undefined => c.confirmations.find((k) => k.type === type && !c0.confirmations.includes(k));
const opObject = (op: OpenPoint, itemId?: string) => ({ kind: "Open point", key: op.id, ...(itemId ? { itemId } : {}), state: op.status });

// ---------------------------------------------------------------------------------- Kissflow steps

/** A held process item: staleCheck, then write until the read-back holds. Resolves with the item as read back (also
 *  kept in `w.saved`).
 *  `ref` is the load's index entry (guards.ts heldOp / heldReview): its stamp moves to our own write's, so a second
 *  action on the same item queued before the reload (the store reloads after the last write) is not refused as stale
 *  because of the first one; a change by anyone else after our read-back still is. */
async function updateHeld(ctx: WriteCtx, w: Work, flow: ProcessKey, ref: { itemId: string; act: string; modifiedAt?: string }, data: KfData): Promise<RawItem> {
  const cur = await staleCheck(ctx, flow, ref);
  const back = await writeVerified(
    firstThen(cur, () => ctx.client.getTask(flow, ref.itemId, ref.act)),
    () => ctx.client.update(flow, ref.itemId, ref.act, data),
    (b) => missingOf(data, b),
  );
  const stamp = str(back, "_modified_at");
  if (stamp && ref.modifiedAt !== undefined) ref.modifiedAt = stamp;
  w.saved.push({ flow, item: back });
  return back;
}

/** Whether the item left the step `act` all the same, after its submit failed: one read through that task. A 050201
 *  refusal (no longer in the user's queue) proves the move; so does, for a new item's Start step (`start`), a status
 *  other than Draft (only the status: a draft still at Start must never count as sent), and for a held step a
 *  Completed item or one that names another current activity instance.
 *  [unverified] Which answer getItem gives live for an item that has moved on (050201, or the item at its new step):
 *  morning check; until then each of them counts. */
async function movedOn(ctx: Pick<WriteCtx, "client">, flow: ProcessKey, id: string, act: string, start: boolean): Promise<boolean> {
  let it: RawItem;
  try {
    it = await ctx.client.getTask(flow, id, act);
  } catch (e) {
    return leftQueue(e);
  }
  const status = str(it, "_status");
  if (start) return status !== "" && status !== "Draft";
  if (status === "Completed") return true;
  const own = str(it, "_activity_instance_id");
  if (own && own !== act) return true;
  const current = (Array.isArray(it._current_context) ? (it._current_context as Record<string, unknown>[]) : []).map((x) => str(x, "_context_activity_instance_id")).filter(Boolean);
  return current.length > 0 && !current.includes(act);
}

/** Reads of a submit whose answer was lost (it may still be on its way after the 30 s bound), and the pause between. */
export const MOVE_PROBES = 3;
export const MOVE_PROBE_MS = 1000;

/**
 * Submits the step. A submit can go through although its answer is lost (the 30 s bound fired after Kissflow moved the
 * item): then the hand-offs and the audit row after it must still go out, or I-1 never creates the portal request and
 * the supplier never sees the question (the portal's submitAndHandOff, portal/data/liveActions.ts). So a submit that
 * got no answer re-reads up to MOVE_PROBES times, MOVE_PROBE_MS apart (movedOn); only a proven move counts as success,
 * otherwise the submit's own error stands. A refusal Kissflow gave (a KISSFLOW_ERROR code, a data refusal, 050201, a
 * rate limit) is an answer: it stands at once, unprobed (a 050201 re-read would "prove" a move that never happened).
 * `start`: the submit of a new item's Start step (its draft).
 */
export async function submitOrMoved(ctx: Pick<WriteCtx, "client">, flow: ProcessKey, id: string, act: string, start = false): Promise<void> {
  try {
    await ctx.client.submit(flow, id, act);
  } catch (e) {
    if (kfCode(e) || isDataRefusal(e) || leftQueue(e) || isRateLimited(e)) throw e;
    for (let i = 0; i < MOVE_PROBES; i++) {
      if (i) await new Promise((r) => setTimeout(r, MOVE_PROBE_MS));
      if (await movedOn(ctx, flow, id, act, start)) return;
    }
    throw e;
  }
}

/** The gate, then submit (the step moves on). */
async function submitGated(ctx: WriteCtx, w: Work, flow: ProcessKey, ref: { itemId: string; act: string; activityId: string }, back: RawItem, what: string): Promise<void> {
  const blank = assertMandatory(back, ref.activityId);
  // C15: the field ids are dev's
  if (blank.length) throw isProd(ctx) ? new Stop(STILL_NEEDS(what), "warning", `Kissflow still misses ${blank.join(", ")}.`) : new Stop(`${what} was saved, but Kissflow still misses ${blank.join(", ")}, so it did not move on. Reload and try again.`);
  await submitOrMoved(ctx, flow, ref.itemId, ref.act);
  w.moved = true;
}

/** A new process item: create at Start (held by its creator), read back, the Start gate, submit. A gate or submit
 *  failure leaves a draft (the shell's Unsent items banner → Diagnostics: Send / Discard, A1). The screen keeps its
 *  form after such a failure (gap 6), and the domain gives a retry the same key (drafts are not part of any case), so
 *  an item whose key names one of the user's own unsent drafts is not created again: the draft is sent or discarded
 *  first. Nor while an own draft of the flow could not be read (its key unknown: it may be this item's). */
async function createStarted(ctx: WriteCtx, w: Work, flow: ProcessKey, data: KfData, startStep: string, what: string): Promise<{ id: string; act: string }> {
  const key = typeof data[DRAFT_KEY[flow]] === "string" ? String(data[DRAFT_KEY[flow]]) : "";
  const draft0 = key ? ownDraftHas(ctx.index.ownDraftKeys, flow, key) : undefined;
  if (draft0) throw new Stop(draft0 === "same" ? draftWaits(what) : draftUnread(what));
  const created = await ctx.client.create(flow, data);
  // the cause without its own full stop (A15: "… access this item.. Open …"); production says it plainly (C15)
  const draft = (why: string, raw?: string) => new Stop(`${what} was saved as a draft in Kissflow but not sent: ${why}. ${USE_UNSENT}`, "warning", raw);
  const failed = (e: unknown) => {
    const raw: string[] = [];
    return draft(causeFor(ctx.env, e, raw), raw[0]);
  };
  let back: RawItem;
  try {
    back = await writeVerified(
      () => ctx.client.getTask(flow, created.id, created.act),
      () => ctx.client.update(flow, created.id, created.act, data),
      (b) => missingOf(data, b),
    );
  } catch (e) {
    throw failed(e);
  }
  const blank = assertMandatory(back, startStep);
  if (blank.length) throw isProd(ctx) ? draft("Kissflow still needs some required information", `Kissflow misses ${blank.join(", ")}.`) : draft(`Kissflow misses ${blank.join(", ")}`);
  try {
    await submitOrMoved(ctx, flow, created.id, created.act, true);
  } catch (e) {
    throw failed(e);
  }
  w.moved = true;
  return created;
}

/** A create whose key names one of the user's own unsent drafts (createStarted). */
export const draftWaits = (what: string) => `${what} is already in Kissflow as your unsent draft, so it was not created again. Use Unsent items at the top of the page to send or discard that draft.`;
/** A create while one of the user's own unsent drafts of the flow could not be read (createStarted). */
export const draftUnread = (what: string) => `${what} was not created: one of your unsent drafts could not be read just now, and it may be this one. Reload, or use Unsent items at the top of the page to send or discard that draft.`;

const TABLE = "Table::";
const tableRows = (data: KfData, k: string): KfData[] => (Array.isArray(data[k]) ? (data[k] as KfData[]) : []);

/**
 * What a re-send of `data` still has to write on `cur` (read after the settle): the header fields it does not hold; per
 * child table the rows changed by their `_id` (harmless again), and the NEW rows (`_is_created`) whose key (`rowKeys`:
 * model → the field a row is found by) `cur` does not show, each with a fresh `_id` (lostRows). A new row of a model
 * without a key is never sent twice: a duplicate is worse than the VerifyError that follows.
 */
function resendOf(data: KfData, cur: RawItem, rowKeys: Record<string, string>): KfData {
  const out: KfData = Object.fromEntries(missingOf(data, cur).map((k) => [k, data[k]]));
  for (const k of Object.keys(data)) {
    if (!k.startsWith(TABLE)) continue;
    const model = k.slice(TABLE.length);
    const changed = tableRows(data, k).filter((r) => !r._is_created);
    const created = tableRows(data, k).filter((r) => r._is_created);
    const again = [...changed, ...(rowKeys[model] ? lostRows(cur, model, rowKeys[model], created) : [])];
    if (again.length) out[k] = again;
  }
  return out;
}

/** A form row update, read back until it holds (the read-back also kept in `w.saved`). When `data` adds child rows
 *  (`_is_created`), a re-send first waits ROW_SETTLE_MS and reads again, then sends only what is still missing
 *  (resendOf, `rowKeys`), as formCreated does: a new row can show late (proven 20 Oct for a new item's rows;
 *  [unverified] after an update), and whether Kissflow drops a row re-sent with the same `_id` is unverified.
 *  `first`: the item as the writer has just read it, used as the first read. */
async function formWrite(ctx: WriteCtx, w: Work, flow: FormKey, id: string, data: KfData, holds: (back: RawItem) => string[], rowKeys: Record<string, string> = {}, first?: RawItem): Promise<RawItem> {
  const adds = Object.keys(data).some((k) => k.startsWith(TABLE) && tableRows(data, k).some((r) => r._is_created));
  let sent = false;
  const read = () => ctx.client.formGet(flow, id);
  const back = await writeVerified(
    first ? firstThen(first, read) : read,
    async () => {
      if (!adds || !sent) {
        sent = true;
        return ctx.client.formUpdate(flow, id, data);
      }
      const again = resendOf(data, await ctx.client.formGet(flow, await settle(id)), rowKeys);
      if (Object.keys(again).length) await ctx.client.formUpdate(flow, id, again);
    },
    holds,
  );
  w.saved.push({ flow, item: back });
  return back;
}

/** A form row create (create + submit: the NEW id), read back (kept in `w.saved`); lost header fields are written
 *  again, and so are lost child rows (`rowKeys`: model → the field a row is found by; a lost row goes again as a NEW
 *  row, a present one is never re-sent), as ensureRmes does. */
async function formCreated(ctx: WriteCtx, w: Work, flow: FormKey, data: KfData, holds: (back: RawItem) => string[] = (b) => missingOf(data, b), rowKeys: Record<string, string> = {}): Promise<string> {
  const id = await ctx.client.formCreate(flow, data);
  const back = await writeVerified(
    () => ctx.client.formGet(flow, id),
    async (first) => {
      // Kissflow may not show a new item's child rows on the very first read (20 Oct: re-adding them at once duplicated
      // a new supplier's contact). Wait and read again; only rows still missing then are sent again.
      const hasRowsMissing = Object.entries(rowKeys).some(([model, keyField]) => ((data[`Table::${model}`] ?? []) as KfData[]).length > childRows(first, model, keyField).length);
      const cur = hasRowsMissing ? await ctx.client.formGet(flow, await settle(id)) : first;
      const lost: KfData = {};
      for (const [model, keyField] of Object.entries(rowKeys)) {
        const again = lostRows(cur, model, keyField, (data[`Table::${model}`] ?? []) as KfData[]);
        if (again.length) lost[`Table::${model}`] = again;
      }
      return ctx.client.formUpdate(flow, id, { ...Object.fromEntries(missingOf(data, cur).map((k) => [k, data[k]])), ...lost });
    },
    holds,
  );
  w.saved.push({ flow, item: back });
  return id;
}

// ---------------------------------------------------------------------------------- open points

/** Raises the point `next` added on the case: create at "Raise open point", gate, submit, then op.round (round 1: I-3
 *  takes it to the supplier) and history.updated. */
async function raise(ctx: WriteCtx, w: Work, prev: AppState, next: AppState, caseId: string, internalKey?: string) {
  const c0 = caseIn(prev, caseId);
  const c = caseIn(next, caseId);
  const op = need(added(c0.openPoints, c.openPoints)[0], lostTrack("open point"));
  const ref = need(caseRefOf(ctx, caseId), GUARD_TEXT.caseUnknown);
  const data = opStartFields(c, op, ref, ctx, next.users, internalKey);
  const { id, act } = await createStarted(ctx, w, "op", data, STEPS.op.start, `Open point ${op.id}`);
  w.done.push(`Open point ${op.id} was raised.`);
  w.handoffs.push(await handoff(ctx, "op.round", { opItemId: id }));
  w.handoffs.push(await historyHandoff(ctx, c, next.users, [op.id]));
  return { c0, c, op, itemId: id, act };
}

/** P2: a point closed as not accepted on Safety / Regulatory adds the domain's closed finding `<op>-F`. */
async function closedFinding(ctx: WriteCtx, w: Work, c0: CiqCase, c: CiqCase, op: OpenPoint): Promise<void> {
  const f = added(c0.rmes?.findings ?? [], c.rmes?.findings ?? []).find((x) => x.id === `${op.id}-F`);
  if (!f) return;
  const rr = rmesRefOf(ctx, c.id, f.dept);
  if (!rr) {
    w.warnings.push(`${op.id} was closed, but its finding was not added to the ${DEPT_SHORT[f.dept]} RMES record (your role can't read it).`);
    return;
  }
  const model = rmesTables(f.dept).findings;
  const row = findingRow(f);
  try {
    await formWrite(ctx, w, rmesFlowOf(f.dept), rr.itemId, { [`Table::${model}`]: [{ _is_created: true, _id: childRowId(model), ...row }] }, (b) => rowsMissing(b, model, "Findings_Key", [row]), { [model]: "Findings_Key" });
  } catch (e) {
    w.warnings.push(`${op.id} was closed, but its finding was not added to the RMES record (${causeFor(ctx.env, e, w.details)}).`);
  }
}

const raiseOpenPoint: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId] = args as [string, RaiseInput];
    const r = await raise(ctx, w, prev, next, caseId);
    await recordAudit(ctx, w, { code: "op.raised", caseId, object: opObject(r.op, r.itemId), ref: { flow: "op", itemId: r.itemId, act: r.act }, entries: newEntries(r.c0, r.c), snapshot: { op: r.op } }, `Open point ${r.op.id}`);
  });

const findingToQuery: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, findingId] = args as [string, string, string, string];
    const r = await raise(ctx, w, prev, next, caseId, findingId);
    const f = r.c.rmes?.findings.find((x) => x.id === findingId);
    const rr = f ? rmesRefOf(ctx, caseId, f.dept) : undefined;
    const rowId = rr?.findingRows[findingId];
    if (f && rr && rowId) {
      const model = rmesTables(f.dept).findings;
      const row = { _id: rowId, Findings_Linked_OP_Key: r.op.id };
      try {
        await formWrite(ctx, w, rmesFlowOf(f.dept), rr.itemId, { [`Table::${model}`]: [row] }, (b) => rowsMissing(b, model, "Findings_Key", [row]));
      } catch (e) {
        w.warnings.push(`Open point ${r.op.id} was raised, but finding ${findingId} was not linked to it (${causeFor(ctx.env, e, w.details)}).`);
      }
    } else w.warnings.push(`Open point ${r.op.id} was raised, but finding ${findingId} was not linked to it (${isProd(ctx) ? "its RMES entry is not loaded" : "its RMES row is not known"}).`);
    await recordAudit(
      ctx,
      w,
      { code: "op.raised", caseId, object: opObject(r.op, r.itemId), ref: { flow: "op", itemId: r.itemId, act: r.act }, entries: newEntries(r.c0, r.c), snapshot: { op: r.op, ...(f ? { rmes: { dept: f.dept, finding: f } } : {}) } },
      `Open point ${r.op.id}`,
    );
  });

const reviewResponse: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, opId, decision, text] = args as [string, string, "accept" | "return" | "not-accepted", string];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const op = opIn(c, opId);
    const ref = need(heldOp(ctx, prev, caseId, opId), GUARD_TEXT.opNotHeld);
    // Thread_JSON carries the supplier's answer the mapper synthesized from Response_* (G14): persisted now
    const data =
      decision === "return"
        ? compact({ Round_No: op.rounds, Query_Key: `${op.id}-R${op.rounds}`, OP_Progress: LIST.opProgress.open, Supplier_Due_Date: kfDate(op.dueDate), Return_Reason: text.trim(), Thread_JSON: threadJson(op, ctx) })
        : compact({
            OP_Outcome: LIST.opOutcome[decision === "accept" ? "accepted" : "not-accepted"],
            Outcome_Reason: decision === "not-accepted" ? text.trim() : undefined,
            Closed_At: kfDateTimeOf(op.closedAt ?? ctx.now()),
            Closed_By: userRef(op.closedBy ?? ctx.acting.me.id, ctx),
            Thread_JSON: threadJson(op, ctx),
          });
    const back = await updateHeld(ctx, w, "op", ref, data);
    w.done.push(`Your decision on ${opId} was saved.`);
    if (decision !== "return") await submitGated(ctx, w, "op", ref, back, `Open point ${opId}`);
    if (decision === "not-accepted") await closedFinding(ctx, w, c0, c, op);
    // the new round is on the point (written and read back): the integration reads it there
    if (decision === "return") w.handoffs.push(await handoff(ctx, "op.round", { opItemId: ref.itemId }));
    w.handoffs.push(await historyHandoff(ctx, c, next.users, [opId]));
    await recordAudit(
      ctx,
      w,
      { code: decision === "accept" ? "op.accepted" : decision === "return" ? "op.returned" : "op.notaccepted", caseId, object: opObject(op, ref.itemId), ref: { flow: "op", itemId: ref.itemId, act: ref.act }, ...(text.trim() ? { reason: text.trim() } : {}), entries: newEntries(c0, c), snapshot: { op } },
      `Your decision on ${opId}`,
    );
  });

const editOpenPoint: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, opId] = args as [string, string, OpenPointPatch];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const op0 = opIn(c0, opId);
    const op = opIn(c, opId);
    const ref = need(heldOp(ctx, prev, caseId, opId), GUARD_TEXT.opNotHeld);
    const newRound = op.rounds > op0.rounds;
    const data = compact({
      Question_Text: op.question,
      Supplier_Justification: op.justification.trim() || "—",
      Supplier_Due_Date: kfDate(op.dueDate),
      Responsible_User: userRef(op.responsibleId, ctx),
      Responsible_Name: nameIn(next.users, op.responsibleId),
      Thread_JSON: threadJson(op, ctx),
      ...(newRound ? { Round_No: op.rounds, Query_Key: `${op.id}-R${op.rounds}`, OP_Progress: LIST.opProgress.open } : {}),
    });
    await updateHeld(ctx, w, "op", ref, data);
    w.done.push(`Open point ${opId} was changed.`);
    // a new round goes to the supplier as a new query; an edit while the supplier's query waits for an answer goes onto
    // that query (the integration refuses a point without Portal_Query_Item_Id)
    if (newRound) w.handoffs.push(await handoff(ctx, "op.round", { opItemId: ref.itemId }));
    else if (op0.status === "open") {
      const edited = await handoff(ctx, "op.edited", { opItemId: ref.itemId });
      w.handoffs.push(edited);
      // D1 (a): the supplier contacts hear of the change to the question they are to answer
      if (edited.status === "sent") sendMail(ctx, w, caseId, `question ${opId} changed`, MAILS.edited(c, op));
    }
    w.handoffs.push(await historyHandoff(ctx, c, next.users, [opId]));
    await recordAudit(ctx, w, { code: "op.edited", caseId, object: opObject(op, ref.itemId), ref: { flow: "op", itemId: ref.itemId, act: ref.act }, entries: newEntries(c0, c), snapshot: { op } }, `The change to open point ${opId}`);
  });

const closeOpenPoint: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, opId, reason] = args as [string, string, string];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const op0 = opIn(c0, opId);
    const op = opIn(c, opId);
    const ref = need(heldOp(ctx, prev, caseId, opId), GUARD_TEXT.opNotHeld);
    const data = compact({
      OP_Outcome: LIST.opOutcome.withdrawn,
      Outcome_Reason: op.closeReason ?? reason.trim(),
      Closed_At: kfDateTimeOf(op.closedAt ?? ctx.now()),
      Closed_By: userRef(op.closedBy ?? ctx.acting.me.id, ctx),
      Thread_JSON: threadJson(op, ctx),
    });
    const back = await updateHeld(ctx, w, "op", ref, data);
    w.done.push(`Open point ${opId} was marked closed.`);
    await submitGated(ctx, w, "op", ref, back, `Open point ${opId}`);
    // the supplier's open query is withdrawn only while it waits for an answer (the integration refuses a point without
    // OP_Outcome or without a query)
    if (op0.status === "open") {
      const closed = await handoff(ctx, "op.closed", { opItemId: ref.itemId });
      w.handoffs.push(closed);
      // D1 (a): the supplier contacts hear that the question needs no answer any more
      if (closed.status === "sent") sendMail(ctx, w, caseId, `question ${opId} closed`, MAILS.closed(c, op));
    }
    w.handoffs.push(await historyHandoff(ctx, c, next.users, [opId]));
    await recordAudit(ctx, w, { code: "op.closed", caseId, object: opObject(op, ref.itemId), ref: { flow: "op", itemId: ref.itemId, act: ref.act }, reason: reason.trim(), entries: newEntries(c0, c), snapshot: { op } }, `The closing of open point ${opId}`);
  });

// ---------------------------------------------------------------------------------- RMES

const recordCriterion: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, criterionId] = args as [string, string, RmesResult, string];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const cr = need(c.rmes?.criteria.find((x) => x.id === criterionId), "This RMES criterion is no longer loaded.");
    const rr = need(rmesRefOf(ctx, caseId, cr.dept), GUARD_TEXT.rmesUnknown);
    const rowId = need(rr.criteriaRows[criterionId], GUARD_TEXT.rowUnknown);
    const model = rmesTables(cr.dept).criteria;
    const flow = rmesFlowOf(cr.dept);
    const row = compact({ _id: rowId, Criteria_Result: cr.result ? LIST.rmesResult[cr.result] : undefined, Criteria_Comment: cr.comment, Criteria_Recorded_By: userRef(cr.by, ctx), Criteria_Recorded_At: kfDateTimeOf(cr.at) });
    const header = { Open_Criteria_Count: c.rmes!.criteria.filter((x) => x.dept === cr.dept && !x.result).length };
    await formWrite(ctx, w, flow, rr.itemId, { ...header, [`Table::${model}`]: [row] }, (b) => [...missingOf(header, b), ...rowsMissing(b, model, "Criteria_Code", [row])]);
    w.done.push(`${criterionId} was saved.`);
    await recordAudit(
      ctx,
      w,
      { code: "rmes.saved", caseId, object: { kind: "RMES criterion", key: criterionId, itemId: rr.itemId, ...(cr.result ? { state: LIST.rmesResult[cr.result] } : {}) }, ref: { flow, itemId: rr.itemId }, entries: newEntries(c0, c), snapshot: { rmes: { dept: cr.dept, criterion: cr } } },
      `RMES ${criterionId}`,
    );
  });

const addFinding: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId] = args as [string, string, string, boolean];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const f = need(added(c0.rmes?.findings ?? [], c.rmes?.findings ?? [])[0], lostTrack("finding"));
    const rr = need(rmesRefOf(ctx, caseId, f.dept), GUARD_TEXT.rmesUnknown);
    const model = rmesTables(f.dept).findings;
    const flow = rmesFlowOf(f.dept);
    const row = findingRow(f);
    const header = { Open_Blocking_Findings_Count: c.rmes!.findings.filter((x) => x.dept === f.dept && x.blocking && x.status === "open").length };
    await formWrite(ctx, w, flow, rr.itemId, { ...header, [`Table::${model}`]: [{ _is_created: true, _id: childRowId(model), ...row }] }, (b) => [...missingOf(header, b), ...rowsMissing(b, model, "Findings_Key", [row])], { [model]: "Findings_Key" });
    w.done.push(`Finding ${f.id} was saved.`);
    await recordAudit(ctx, w, { code: "rmes.saved", caseId, object: { kind: "RMES finding", key: f.id, itemId: rr.itemId, state: f.status }, ref: { flow, itemId: rr.itemId }, entries: newEntries(c0, c), snapshot: { rmes: { dept: f.dept, finding: f } } }, `Finding ${f.id}`);
  });

const closeFinding: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, findingId] = args as [string, string];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const f = need(c.rmes?.findings.find((x) => x.id === findingId), "This finding is no longer loaded.");
    const rr = need(rmesRefOf(ctx, caseId, f.dept), GUARD_TEXT.rmesUnknown);
    const rowId = need(rr.findingRows[findingId], GUARD_TEXT.rowUnknown);
    const model = rmesTables(f.dept).findings;
    const flow = rmesFlowOf(f.dept);
    const row = { _id: rowId, Findings_State: f.status };
    const header = { Open_Blocking_Findings_Count: c.rmes!.findings.filter((x) => x.dept === f.dept && x.blocking && x.status === "open").length };
    await formWrite(ctx, w, flow, rr.itemId, { ...header, [`Table::${model}`]: [row] }, (b) => [...missingOf(header, b), ...rowsMissing(b, model, "Findings_Key", [row])]);
    w.done.push(`Finding ${findingId} was closed.`);
    await recordAudit(ctx, w, { code: "rmes.saved", caseId, object: { kind: "RMES finding", key: findingId, itemId: rr.itemId, state: f.status }, ref: { flow, itemId: rr.itemId }, entries: newEntries(c0, c), snapshot: { rmes: { dept: f.dept, finding: f } } }, `Finding ${findingId}`);
  });

const rmesDecision: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, dept, decision, reason] = args as [string, "SAF" | "REG", "approved" | "rejected", string];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const ref = need(heldReview(ctx, caseId, dept), GUARD_TEXT.reviewNotHeld(dept));
    const data = compact({ RMES_Decision: LIST.decision[decision], RMES_Decision_Reason: reason.trim() });
    await updateHeld(ctx, w, "review", ref, data);
    w.done.push(`The ${DEPT_SHORT[dept]} decision was saved.`);
    const tr = c.reviews.find((r) => r.dept === dept);
    await recordAudit(
      ctx,
      w,
      {
        code: "rmes.saved",
        caseId,
        object: { kind: "RMES decision", key: `${caseId}-RMES-${dept}`, itemId: ref.itemId, state: LIST.decision[decision] },
        ref: { flow: "review", itemId: ref.itemId, act: ref.act },
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        entries: newEntries(c0, c),
        snapshot: { rmes: { dept, decision: { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) } }, ...(tr ? { track: { ...tr, roundNo: ref.roundNo } } : {}) },
      },
      `The ${DEPT_SHORT[dept]} decision`,
    );
  });

// ---------------------------------------------------------------------------------- reviews

const completeReview: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, dept] = args as [string, ReviewDept, CompleteOptions | undefined];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const ref = need(heldReview(ctx, caseId, dept), GUARD_TEXT.reviewNotHeld(dept));
    const tr = c.reviews.find((r) => r.dept === dept);
    const cont = dept === "RMM" ? tr?.continueAfterRejection : undefined;
    const data = compact({
      // 0 after the domain's guard; Kissflow's Review_Gate formula reads them (G-10)
      ...countsOf(c0, dept),
      Review_Confirm: LIST.confirm,
      Completed_By: userRef(ctx.acting.me.id, ctx),
      Completed_By_Name: ctx.identity.name,
      Completed_By_Email: ctx.identity.email,
      Completed_At: kfDateTimeOf(tr?.completedAt ?? ctx.now()),
      ...(cont ? { Rejection_Handling: LIST.continueRelease, Rejection_Note: cont.note, Rejected_Depts_Covered: cont.depts.join(", ") } : {}),
    });
    const back = await updateHeld(ctx, w, "review", ref, data);
    const blank = assertMandatory(back, ref.activityId);
    // C16, C15: production says what it means; the field names are dev's
    if (blank.includes("Review_Gate")) throw isProd(ctx) ? new Stop(GATE_NOT_OK, "warning", "Kissflow's review gate is not OK yet.") : new Stop("Kissflow's review gate is not OK yet; nothing was completed.");
    if (blank.length) throw isProd(ctx) ? new Stop(STILL_NEEDS(`The ${DEPT_SHORT[dept]} review`, "it was not completed"), "warning", `Kissflow still misses ${blank.join(", ")}.`) : new Stop(`Kissflow still misses ${blank.join(", ")}; nothing was completed.`);
    await submitOrMoved(ctx, "review", ref.itemId, ref.act);
    w.moved = true;
    w.done.push(`The ${DEPT_SHORT[dept]} review was completed.`);

    const entries = newEntries(c0, c);
    // M2: the release request is E-B's (an integration on this review's completion, from the reviews as read in
    // Kissflow): this screen's view may be partial or stale (two departments completing close together)
    const releaseEntries = entries.filter((e) => e.action === "All reviews completed");
    const released = c.phase === "final-release" && c0.phase !== "final-release";
    // the domain takes the e-mail from the state, where the user shows none while also a supplier contact (toAppState):
    // the history keeps the identity's
    const conf0 = newConfirmation(c0, c, "dept-completion");
    const conf = conf0 && !conf0.email && conf0.by === ctx.acting.me.id ? { ...conf0, email: ctx.identity.email } : conf0;
    await recordAudit(
      ctx,
      w,
      {
        code: "review.completed",
        caseId,
        object: { kind: "Review", key: ref.reviewKey, itemId: ref.itemId, state: "Completed" },
        ref: { flow: "review", itemId: ref.itemId, act: ref.act },
        entries: entries.filter((e) => !releaseEntries.includes(e)),
        snapshot: { ...(tr ? { track: { ...tr, roundNo: ref.roundNo } } : {}), ...(conf ? { confirmation: conf } : {}) },
      },
      `The ${DEPT_SHORT[dept]} review`,
      [],
    );
    // C18: the request goes from E-B, a few seconds after this completion
    if (released) return { message: `${DEPT_SHORT[dept]} review completed. Every review is complete; the final-release request goes to the supplier in a moment.` };
  });

/** P2: hands the department's review to another member (the task stays with the role). */
const reassignReview: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, dept, toUserId, reason] = args as [string, ReviewDept, string, string];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const ref = need(heldReview(ctx, caseId, dept), GUARD_TEXT.reviewNotHeld(dept));
    const to = next.users.find((u) => u.id === toUserId);
    // the acting user's e-mail from the identity (the state shows none while the user is also a contact, toAppState)
    const data = compact({ Assignee_User: userRef(toUserId, ctx), Assignee_Name: to?.name, Assignee_Email: to && to.id === ctx.acting.me.id ? ctx.identity.email : to?.email, Reassign_Reason: reason.trim() });
    await updateHeld(ctx, w, "review", ref, data);
    w.done.push(`The ${DEPT_SHORT[dept]} review was handed over.`);
    const tr = c.reviews.find((r) => r.dept === dept);
    await recordAudit(
      ctx,
      w,
      { code: "review.reassigned", caseId, object: { kind: "Review", key: ref.reviewKey, itemId: ref.itemId, state: "Reassigned" }, ref: { flow: "review", itemId: ref.itemId, act: ref.act }, reason: reason.trim(), entries: newEntries(c0, c), snapshot: { ...(tr ? { track: { ...tr, roundNo: ref.roundNo } } : {}) } },
      `The handover of the ${DEPT_SHORT[dept]} review`,
    );
  });

/** P2, RMM only: its completed review restarts as round n+1 (a new CIQ Review item; only RMM has Init on CIQ Review). */
const reopenReview: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, dept, reason] = args as [string, ReviewDept, string];
    if (dept !== "RMM") throw new Stop(GUARD_TEXT.reopenNotRmm, "danger");
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const cref = need(caseRefOf(ctx, caseId), GUARD_TEXT.caseUnknown);
    const round = (ctx.index.reviews.get(`${caseId}|RMM`)?.roundNo ?? 1) + 1;
    const data = reviewStartFields(c, cref, "RMM", round, "Reopened", reason.trim(), ctx, next.users);
    const { id, act } = await createStarted(ctx, w, "review", data, STEPS.review.start, "The reopened RMM review");
    w.done.push("The RMM review was reopened.");
    if (c0.phase === "final-release") {
      const reopened = await handoff(ctx, "review.reopened", { caseItemId: cref.itemId });
      w.handoffs.push(reopened);
      // D1 (a): only a reopen from the final release concerns the supplier (its release request is withdrawn)
      if (reopened.status === "sent") sendMail(ctx, w, caseId, "review reopened", MAILS.reopened(c0));
    }
    const tr = c.reviews.find((r) => r.dept === "RMM");
    await recordAudit(
      ctx,
      w,
      { code: "review.reopened", caseId, object: { kind: "Review", key: String(data.Review_Key), itemId: id, state: "Reopened" }, ref: { flow: "review", itemId: id, act }, reason: reason.trim(), entries: newEntries(c0, c), snapshot: { ...(tr ? { track: { ...tr, roundNo: round } } : {}) } },
      "The reopened RMM review",
    );
  });

// ---------------------------------------------------------------------------------- the case

const createCase: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [input] = args as [NewCaseInput];
    const c = need(added(prev.cases, next.cases)[0], lostTrack("case"));
    const release = need(releaseForPair(ctx.index.releases, { ruleSetVersion: c.ruleSetVersion, templateVersion: c.templateVersion }), GUARD_TEXT.noRelease(pairLabel(c.ruleSetVersion, c.templateVersion)));
    const raw = release.raw;
    const contacts = c.supplierContactIds.map((id) => next.users.find((u) => u.id === id)).filter((u): u is User => !!u);
    let start: CaseStartFields;
    try {
      start = await caseStartPayload({
        release: { Release_Key: str(raw, "Release_Key") || release.key, Manifest_Hash: str(raw, "Manifest_Hash"), Release_Bundle_JSON: str(raw, "Release_Bundle_JSON"), ...(str(raw, "Release_Manifest_JSON") ? { Release_Manifest_JSON: str(raw, "Release_Manifest_JSON") } : {}) },
        undefinedOrigins: Array.isArray(ctx.index.settings.undefinedOrigins) ? (ctx.index.settings.undefinedOrigins as string[]) : [],
        contacts: contacts.map((u) => ({ ...(isPortalUser(u.id) ? { portalUserId: kfIdOfContact(u.id) } : {}), name: u.name, email: u.email, title: u.title, mayConfirm: u.mayConfirm !== false, active: u.active !== false })),
        bdfAnswers: c.answers,
        markets: c.config.SF11 ?? [],
      });
    } catch (e) {
      // its plain-language reason is the toast (FACTS-LIVE); production names no JSON or WebCrypto, and the
      // no-portal-user reason reads as the guard's (C21, C21+)
      const raw = errorText(e);
      const shown = startText(ctx.env, raw);
      throw new Stop(shown, "danger", shown !== raw ? raw : undefined);
    }
    const data = caseStartFields(c, input, release, start, ctx, next.users);
    const { id, act } = await createStarted(ctx, w, "case", data, STEPS.case.start, `Case ${c.id}`);
    w.done.push(`Case ${c.id} was created and sent to the supplier.`);
    // I-1: the integration creates the portal request from the case; its status is on the case.created row
    w.handoffs.push(await handoff(ctx, "case.started", { caseItemId: id }));
    await recordAudit(
      ctx,
      w,
      { code: "case.created", caseId: c.id, object: { kind: "Case", key: c.id, itemId: id, state: LIST.phase["supplier-input"] }, ref: { flow: "case", itemId: id, act }, entries: newEntries(undefined, c), snapshot: { case: caseHeaderOf(c, id, start, ctx, next.users) } },
      `Case ${c.id}`,
    );
  });

/** P2: the case can't be written after Start (RMM has no step on it), so the cancellation lives in its audit row (which
 *  must therefore succeed); the RMM's own open points are withdrawn, other raisers' points stay open in Kissflow and
 *  read as closed by the cancellation (closedOpIds). */
const cancelCase: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId, reason] = args as [string, string];
    // the case's phase changes on every screen: always read again afterwards
    w.moved = true;
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const cref = caseRefOf(ctx, caseId);
    const closing = c0.openPoints.filter((p) => p.status !== "closed");
    for (const p0 of closing) {
      if (p0.createdBy !== ctx.acting.me.id) continue;
      const ref = heldOp(ctx, prev, caseId, p0.id);
      if (!ref) {
        w.warnings.push(`${p0.id} stays open in Kissflow (it is not one of your open tasks); the case shows it closed by the cancellation.`);
        continue;
      }
      const p = opIn(c, p0.id);
      try {
        const data = compact({ OP_Outcome: LIST.opOutcome.withdrawn, Outcome_Reason: p.closeReason, Closed_At: kfDateTimeOf(p.closedAt ?? ctx.now()), Closed_By: userRef(p.closedBy ?? ctx.acting.me.id, ctx), Thread_JSON: threadJson(p, ctx) });
        const back = await updateHeld(ctx, w, "op", ref, data);
        await submitGated(ctx, w, "op", ref, back, `Open point ${p0.id}`);
        // named in the toast if the audit row then fails: the point is closed in Kissflow
        w.done.push(`${p0.id} was closed.`);
        if (p0.status === "open") w.handoffs.push(await handoff(ctx, "op.closed", { opItemId: ref.itemId }));
      } catch (e) {
        w.warnings.push(`${p0.id} could not be closed in Kissflow (${causeFor(ctx.env, e, w.details)}); the case shows it closed by the cancellation.`);
      }
    }
    const caseItemId = cref?.itemId;
    const told = await handoff(ctx, "case.cancelled", caseItemId ? { caseItemId, phaseLabel: "Cancelled", locked: "Yes" } : null);
    w.handoffs.push(told);
    // named in the toast if the audit row then fails: the hand-off went out (handoff.ts does not wait for its answer),
    // the app has no record yet
    if (told.status === "sent") {
      w.done.push("The cancellation was handed over to the supplier portal.");
      // D1 (a): one mail for the case (the points it closed are part of it)
      sendMail(ctx, w, caseId, "case cancelled", MAILS.cancelled(c0));
    }
    const conf = newConfirmation(c0, c, "cancellation");
    w.auditRow = await writeAudit(ctx, {
      code: "case.cancelled",
      caseId,
      object: { kind: "Case", key: caseId, ...(cref ? { itemId: cref.itemId } : {}), state: LIST.phase.cancelled },
      reason: reason.trim(),
      entries: newEntries(c0, c),
      snapshot: { ...(c.cancelled ? { cancelled: { ...c.cancelled, closedOpIds: closing.map((p) => p.id) } } : {}), ...(conf ? { confirmation: conf } : {}) },
      handoffs: w.handoffs,
    });
  });

const addInternalNote: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [caseId] = args as [string, string, string | undefined];
    const c0 = caseIn(prev, caseId);
    const c = caseIn(next, caseId);
    const note = need(added(c0.internalNotes, c.internalNotes)[0], lostTrack("note"));
    const ref = need(caseRefOf(ctx, caseId), GUARD_TEXT.caseUnknown);
    const data = noteFields(c, ref, note, ctx, next.users);
    const id = await formCreated(ctx, w, "note", data);
    w.done.push("The note was saved.");
    await recordAudit(ctx, w, { code: "note.added", caseId, object: { kind: "Internal note", key: note.id, itemId: id }, ref: { flow: "note", itemId: id }, entries: newEntries(c0, c), snapshot: { note } }, "The note");
    const mentioned = (note.mentions ?? []).some((m) => m !== ctx.acting.me.id);
    return { message: mentioned ? "Note added. E-mail notifications are not live yet." : "Note added." };
  });

// ---------------------------------------------------------------------------------- supplier master (P2, BA)

const CONTACTS = TABLES.contacts;
const SUPPLIER_FIELD: Record<keyof SupplierPatch, string> = { name: "Supplier_Legal_Name", duns: "DUNS_Number", country: "Supplier_Country_Code", city: "Supplier_City", type: "Supplier_Kind", active: "Supplier_Active" };
const noKeys = ({ _is_created: _c, _id: _i, ...r }: KfData): KfData => r;

/** The audit row of a supplier-master change: no case, category "Supplier master", the domain's log entries. */
const supplierAudit = (ctx: WriteCtx, w: Work, prev: AppState, next: AppState, key: string, itemId: string, what: string) =>
  recordAudit(ctx, w, { code: "supplier.changed", object: { kind: "Supplier", key, itemId }, ref: { flow: "supplier", itemId }, entries: [], log: newLog(prev, next) }, what);

const addSupplier: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    void (args as [SupplierInput]);
    const sup = need(added(prev.suppliers, next.suppliers)[0], lostTrack("supplier"));
    const contacts = sup.contactIds.map((id) => next.users.find((u) => u.id === id)).filter((u): u is User => !!u);
    const header = supplierFields(sup);
    const rows: KfData[] = contacts.map((u) => ({ _is_created: true, _id: childRowId(CONTACTS), ...contactRow(u) }));
    const id = await formCreated(ctx, w, "supplier", { ...header, [`Table::${CONTACTS}`]: rows }, (b) => [...missingOf(header, b), ...rowsMissing(b, CONTACTS, "Contacts_Key", rows.map(noKeys))], { [CONTACTS]: "Contacts_Key" });
    w.done.push(`Supplier ${sup.name} was saved.`);
    await supplierAudit(ctx, w, prev, next, sup.id, id, `Supplier ${sup.name}`);
  });

const updateSupplier: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [supplierId, patch] = args as [string, SupplierPatch];
    const sr = need(supplierRefOf(ctx, supplierId), GUARD_TEXT.supplierUnknown);
    const sup = need(next.suppliers.find((x) => x.id === supplierId), "This supplier is no longer loaded.");
    const all = supplierFields(sup);
    const data = Object.fromEntries((Object.keys(patch) as (keyof SupplierPatch)[]).map((k) => SUPPLIER_FIELD[k]).filter((f) => all[f] !== undefined).map((f) => [f, all[f]]));
    if (Object.keys(data).length) await formWrite(ctx, w, "supplier", sr.itemId, data, (b) => missingOf(data, b));
    w.done.push(`Supplier ${sup.name} was updated.`);
    await supplierAudit(ctx, w, prev, next, sup.id, sr.itemId, `Supplier ${sup.name}`);
  });

const addContact: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [supplierId] = args as [string, ContactInput];
    const sr = need(supplierRefOf(ctx, supplierId), GUARD_TEXT.supplierUnknown);
    const u = need(added(prev.users, next.users).find((x) => x.side === "supplier"), lostTrack("contact"));
    const row = contactRow(u);
    const holds = (b: RawItem) => rowsMissing(b, CONTACTS, "Contacts_Key", [row]);
    // the domain chose the key from the rows this load read: a row Kissflow holds under it now (another session added
    // it since, or this load could not read it) would get a twin the read-back can't tell apart (it finds rows by key).
    // The same row sent again (a repeat) is no clash: writeVerified then writes nothing.
    const cur = await ctx.client.formGet("supplier", sr.itemId);
    if (holds(cur).length && childRows(cur, CONTACTS, "Contacts_Key").some((r) => str(r, "Contacts_Key") === row.Contacts_Key)) throw new StaleError(CONTACT_KEY_HELD);
    await formWrite(ctx, w, "supplier", sr.itemId, { [`Table::${CONTACTS}`]: [{ _is_created: true, _id: childRowId(CONTACTS), ...row }] }, holds, { [CONTACTS]: "Contacts_Key" }, cur);
    w.done.push(`Contact ${u.name} was saved.`);
    await supplierAudit(ctx, w, prev, next, supplierId, sr.itemId, `Contact ${u.name}`);
  });

const updateContact: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [userId] = args as [string, Partial<ContactInput>];
    const { sup, rowId } = need(contactRowOf(ctx, prev, userId), GUARD_TEXT.contactUnknown);
    const u = need(next.users.find((x) => x.id === userId), "This contact is no longer loaded.");
    const row = compact({ _id: rowId, Contacts_Full_Name: u.name, Contacts_Email: u.email, Contacts_Title: u.title, Contacts_Can_Confirm: u.mayConfirm !== false ? LIST.yes : LIST.no });
    await formWrite(ctx, w, "supplier", sup.itemId, { [`Table::${CONTACTS}`]: [row] }, (b) => rowsMissing(b, CONTACTS, "Contacts_Key", [row]));
    w.done.push(`Contact ${u.name} was updated.`);
    await supplierAudit(ctx, w, prev, next, sup.supplierId, sup.itemId, `Contact ${u.name}`);
  });

const setContactActive: Writer = (ctx, prev, next, args) =>
  attempt(ctx, async (w) => {
    const [userId] = args as [string, boolean, string | undefined];
    const { sup, rowId } = need(contactRowOf(ctx, prev, userId), GUARD_TEXT.contactUnknown);
    const u = need(next.users.find((x) => x.id === userId), "This contact is no longer loaded.");
    const row = compact({ _id: rowId, Contacts_Active: u.active !== false ? LIST.yes : LIST.no, Contacts_Deactivated_At: u.active === false ? kfDateTimeOf(u.deactivatedAt ?? ctx.now()) : undefined });
    await formWrite(ctx, w, "supplier", sup.itemId, { [`Table::${CONTACTS}`]: [row] }, (b) => rowsMissing(b, CONTACTS, "Contacts_Key", [row]));
    w.done.push(`Contact ${u.name} was ${u.active === false ? "deactivated" : "reactivated"}.`);
    await supplierAudit(ctx, w, prev, next, sup.supplierId, sup.itemId, `Contact ${u.name}`);
  });

/** Every supported method (a missing one is the store's "not available" toast, DESIGN §1.2). */
// ---------------------------------------------------------------------------------- drafts sent from Diagnostics

/** The header a `case.created` row keeps, from a CIQ Case item's Start fields (a draft, read through its Start task). */
export function caseHeaderOfItem(it: RawItem): CaseHeader {
  const set = json<unknown>(it, "BDF_Set_JSON", {});
  const bdfSet = set && typeof set === "object" && !Array.isArray(set) ? (set as Record<string, unknown>) : {};
  const sf11 = Array.isArray(bdfSet.SF11) ? (bdfSet.SF11 as CaseHeader["markets"]) : parseMarkets(str(it, "Markets_Label") || str(it, "Target_Markets_Text"));
  const owner = refUser(it, "Owner_RMM");
  const duns = bdfSet["FLD-GEN-003"];
  return {
    caseId: str(it, "Case_Code"),
    itemId: it._id,
    cycleNo: num(it, "Cycle_No") ?? 1,
    materialName: str(it, "Trade_Name"),
    inci: str(it, "Main_INCI"),
    materialNo: str(it, "BDF_Material_No"),
    supplierId: str(it, "Supplier_Code"),
    manufacturer: str(it, "Supplier_Legal_Name"),
    duns: typeof duns === "string" ? duns : "",
    ownerId: owner?.id ?? "",
    ownerName: owner && owner.name !== owner.id ? owner.name : str(it, "BDF_Contact_Name"),
    createdAt: str(it, "_created_at"),
    dueDate: str(it, "Supplier_Due_Date"),
    priority: str(it, "Priority") === LIST.priority.high ? "high" : "normal",
    templateVersion: str(it, "Template_Version"),
    ruleSetVersion: str(it, "Rule_Set_Version"),
    markets: sf11,
    contacts: caseContactsOf(it).map((k) => ({ id: k.id ?? "", name: k.name, email: k.email ?? "", title: k.role ?? "", mayConfirm: k.mayConfirm !== false })),
    bdfSet,
  };
}

/**
 * The history line of a draft the user sent from Diagnostics (a writer had left it unsent: the Start gate or the submit
 * failed). The writer writes its audit row only after the submit, so the draft has none yet, and the audit form is
 * every other role's case index (DESIGN §4): case.created with the header, review.started with the track, op.raised
 * with the point, each from the item as read through its Start task just before the submit. The hand-offs the writer
 * would have sent after its submit go too: a case its case.started (I-1), an open point its op.round (round 1) and
 * history.updated (with `state`, the screens' state of the last load; subject to historyHandoff's live rule). Never
 * throws: a failure is a warning (the item itself was sent).
 */
export async function draftSentAudit(ctx: WriteCtx, flow: ProcessKey, item: RawItem, state?: AppState): Promise<WriteResult> {
  const w = work();
  const at = ctx.now();
  const caseId = str(item, "Case_Code");
  const sent = { id: "", at, by: ctx.acting.me.id };
  try {
    if (flow === "case") {
      w.handoffs.push(await handoff(ctx, "case.started", { caseItemId: item._id }));
      await recordAudit(
        ctx,
        w,
        { code: "case.created", caseId, object: { kind: "Case", key: caseId, itemId: item._id, state: LIST.phase["supplier-input"] }, ref: { flow: "case", itemId: item._id }, entries: [{ ...sent, action: "Created case", detail: `${caseId} sent to the supplier (after a retry).` }], snapshot: { case: caseHeaderOfItem(item) } },
        `Case ${caseId}`,
      );
    } else if (flow === "review") {
      const dept = str(item, "Review_Dept") as ReviewDept;
      const key = str(item, "Review_Key") || `${caseId}-${dept}-${num(item, "Round_No") ?? 1}`;
      const assignee = refUser(item, "Assignee_User")?.id;
      const reopened = str(item, "Activation_Kind") === "Reopened";
      await recordAudit(
        ctx,
        w,
        {
          code: reopened ? "review.reopened" : "review.started",
          caseId,
          object: { kind: "Review", key, itemId: item._id, state: reopened ? LIST.track.reopened : LIST.track["in-review"] },
          ref: { flow: "review", itemId: item._id },
          ...(str(item, "Activation_Reason") ? { reason: str(item, "Activation_Reason") } : {}),
          entries: [{ ...sent, by: "system", action: reopened ? "Reopened review" : "Activated review", detail: `${DEPT_SHORT[dept] ?? dept} review ${reopened ? "reopened" : "activated"} (after a retry).` }],
          snapshot: { track: { dept, status: reopened ? "reopened" : "in-review", assigneeId: assignee ?? (dept === "RMM" ? ctx.acting.me.id : `role:${dept}`), startedAt: str(item, "_created_at") || at, roundNo: num(item, "Round_No") ?? 1 } },
        },
        `Review ${key}`,
        [],
      );
    } else {
      // the point as the mapper reads it (map/trackMap.ts), in this user's directory
      const dir = new Directory(ctx.acting.me, ctx.identity.kfUserId);
      const op = openPointsOf([item], new Map(), { caseId, caseItemId: str(item, "Case_Item_Id"), ownerId: "", supplierId: str(item, "Supplier_Code"), dir, tasks: new Map(), warnings: [], notes: [] }, new Set()).points[0];
      if (!op) throw new Error("the open point could not be read from the draft");
      w.handoffs.push(await handoff(ctx, "op.round", { opItemId: item._id }));
      const c = state?.cases.find((x) => x.id === caseId);
      if (c && state) w.handoffs.push(await historyHandoff(ctx, { ...c, openPoints: [...c.openPoints.filter((p) => p.id !== op.id), op] }, state.users, [op.id]));
      await recordAudit(
        ctx,
        w,
        { code: "op.raised", caseId, object: opObject(op, item._id), ref: { flow: "op", itemId: item._id }, entries: [{ ...sent, action: op.kind === "document-request" ? "Requested document" : "Raised query", detail: `${op.id}: ${op.question}`, sectionId: op.ref.sectionId }], snapshot: { op } },
        `Open point ${op.id}`,
      );
    }
  } catch (e) {
    w.warnings.push(`The draft was sent, but it is missing from the case history (${causeFor(ctx.env, e, w.details)}).`);
  }
  return { ok: true, handoffs: w.handoffs, warnings: w.warnings, ...detailOf(w.details) };
}

export const liveWriters: LiveWriters = {
  createCase,
  raiseOpenPoint,
  reviewResponse,
  editOpenPoint,
  closeOpenPoint,
  recordCriterion,
  addFinding,
  closeFinding,
  findingToQuery,
  rmesDecision,
  completeReview,
  addInternalNote,
  reassignReview,
  reopenReview,
  cancelCase,
  addSupplier,
  updateSupplier,
  addContact,
  updateContact,
  setContactActive,
};
