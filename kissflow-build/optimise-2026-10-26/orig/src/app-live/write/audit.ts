// The one CIQ Audit Event row per screen action (D-7; DESIGN §5.3, §6 "Audit row fields"). Owner C.
// The row is the universal case index and history (§4): Action_Code is the v6 code, Snapshot_JSON keeps the domain's
// own new entries (the prototype's phrases) and the object as it is after the action, with Kissflow user ids, in the
// shape map/auditMap.ts reads (AuditSnapshot). The hand-offs of the action are listed on the row (Notify_*), so a
// pending hand-off can be found later.
// A failed audit row never fails the action (the partial-failure rule): it becomes a warning ("… was saved, but it is
// missing from the case history (<cause>)."; the cause in plain words in production) that Diagnostics lists.
import type { AppState, AuditEvent, CiqCase, LogEvent } from "@/domain/types";
import type { RawItem } from "@/portal/data/raw";
import type { KfData } from "@/portal/kf/sdk";
import { FLOWS, LIST } from "../ids";
import type { AuditSnapshot } from "../map/auditMap";
import type { AuditCode, AuditInput, FlowKey, HandoffStatus, WriteCtx } from "../types";
import { causeFor } from "../userText";
import { compact, deptValue, kfDateTimeOf, rand, toKfIds } from "./encode";
import { missingOf, writeVerified } from "./verify";

/** Event_Category per code (live list CIQ_Event_Category_A00). */
export const EVENT_CATEGORY: Record<AuditCode, string> = {
  "case.created": "Case",
  "case.reactivated": "Case",
  "case.cancelled": "Cancellation",
  "op.raised": "Open point",
  "op.round": "Open point",
  "op.edited": "Open point",
  "op.accepted": "Open point",
  "op.returned": "Open point",
  "op.notaccepted": "Open point",
  "op.closed": "Open point",
  "review.started": "Review",
  "review.completed": "Review",
  "review.reopened": "Review",
  "review.reassigned": "Review",
  "release.requested": "Review",
  "rmes.saved": "RMES",
  "note.added": "Internal note",
  "supplier.changed": "Supplier master",
  "config.published": "Configuration",
};

/** EV-<case|LOG>-<yyyymmddHHMMss>-<rand4>. */
export const eventKey = (caseId: string | undefined, at: string): string => `EV-${caseId || "LOG"}-${at.replace(/[-:TZ]/g, "").slice(0, 14)}-${rand(4)}`;

/** The audit row's fields. Case_Item_Id: a Case object's own item id first (a case just created, or a second case with
 *  the same code, R-13: the index under that code may be the other one), else the index's. */
export function auditRowData(ctx: WriteCtx, x: AuditInput): KfData {
  const at = kfDateTimeOf(ctx.now()) || kfDateTimeOf(new Date().toISOString());
  const ref = x.caseId ? ctx.index.cases.get(x.caseId) : undefined;
  const caseItemId = (x.object.kind === "Case" ? x.object.itemId : undefined) ?? ref?.itemId;
  const snapshot: AuditSnapshot = toKfIds({ ...(x.snapshot ?? {}), v: 1, code: x.code, audit: x.entries, ...(x.log?.length ? { log: x.log } : {}), handoffs: x.handoffs } as AuditSnapshot, ctx);
  const text = [...x.entries, ...(x.log ?? [])].map((e) => e.detail).filter(Boolean).join("\n");
  return compact({
    Event_Key: eventKey(x.caseId, at),
    Case_Code: x.caseId,
    Cycle_No: x.caseId ? (ref?.cycleNo ?? 1) : undefined,
    Case_Item_Id: caseItemId,
    Event_At: at,
    Event_Category: EVENT_CATEGORY[x.code],
    Action_Code: x.code,
    Actor_Side: LIST.actorSide,
    Actor_Name: ctx.identity.name,
    Actor_Email: ctx.identity.email,
    Actor_Dept: deptValue(ctx.acting.dept),
    Actor_Role_Id: ctx.acting.roleId,
    Object_Kind: x.object.kind,
    Object_Key: x.object.key,
    Object_Item_Id: x.object.itemId,
    Object_State: x.object.state,
    New_Value_Text: text,
    Event_Reason: x.reason,
    Ref_Flow_Id: x.ref ? FLOWS[x.ref.flow].id : undefined,
    Ref_Item_Id: x.ref?.itemId,
    Ref_Activity_Instance_Id: x.ref?.act,
    Notify_Channel: x.handoffs.length ? "webhook" : undefined,
    Notify_Recipient: x.handoffs.length ? JSON.stringify(x.handoffs) : undefined,
    Snapshot_JSON: JSON.stringify(snapshot),
  });
}

/** Creates the row (formCreate: create + submit, the NEW id) and reads it back. Resolves with the row as read back
 *  (its `_id` is the new id), which the store shows without reading the audit form again. */
export async function writeAudit(ctx: WriteCtx, x: AuditInput): Promise<RawItem> {
  const data = auditRowData(ctx, x);
  const id = await ctx.client.formCreate("audit", data);
  return writeVerified(
    () => ctx.client.formGet("audit", id),
    (cur) => ctx.client.formUpdate("audit", id, Object.fromEntries(missingOf(data, cur).map((k) => [k, data[k]]))),
    (back) => missingOf(data, back),
  );
}

// ---------------------------------------------------------------------------------- one write job

/** What a writer collects: its hand-offs, warnings, and what already reached Kissflow (named when a later step fails);
 *  the read-backs of its writes and its audit row (the store shows them instead of reading everything again), and
 *  whether a step moved (then the store reads again). `details`: the raw causes production's warnings put in plain
 *  words (WriteResult.detail). */
export interface Work {
  handoffs: HandoffStatus[];
  warnings: string[];
  details: string[];
  done: string[];
  saved: { flow: FlowKey; item: RawItem }[];
  auditRow?: RawItem;
  moved: boolean;
}

export const work = (): Work => ({ handoffs: [], warnings: [], details: [], done: [], saved: [], moved: false });

/** Writes the action's audit row with the hand-offs given (default: all of the job's), kept as `w.auditRow`; resolves
 *  with its id. A failure is a warning. `what` names the saved thing ("Open point OP-3", "The change to open point
 *  OP-3"): the warning reads "<what> was saved, but it is missing from the case history (<cause>)." (C19). */
export async function recordAudit(ctx: WriteCtx, w: Work, x: Omit<AuditInput, "handoffs">, what: string, handoffs: HandoffStatus[] = w.handoffs): Promise<string | undefined> {
  try {
    w.auditRow = await writeAudit(ctx, { ...x, handoffs });
    return w.auditRow._id;
  } catch (e) {
    w.warnings.push(`${what} was saved, but it is missing from the case history (${causeFor(ctx.env, e, w.details)}).`);
    return undefined;
  }
}

/** The domain's new audit entries of an action on a case (by entry id). */
export function newEntries(before: CiqCase | undefined, after: CiqCase | undefined): AuditEvent[] {
  if (!after) return [];
  const old = new Set((before?.audit ?? []).map((e) => e.id));
  return after.audit.filter((e) => !old.has(e.id));
}

/** The domain's new log entries (supplier master, configuration). */
export function newLog(prev: AppState, next: AppState): LogEvent[] {
  const old = new Set(prev.log.map((e) => e.id));
  return next.log.filter((e) => !old.has(e.id));
}
