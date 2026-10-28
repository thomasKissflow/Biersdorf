// Step and item actions (WORKBENCH-DESIGN.md §7.2–§7.9, §12.2). Screens call these; they never call the SDK directly.
// Every action needs the HELD task (ground rule 13) and runs through the write queue.
//
// Two ways to call them, same behaviour:
//   - module-level, exactly the §12.2 signatures: saveAtStep(task, patch), submitStep(task, o), … (they use the
//     runtime the WorkbenchData provider binds with bindRuntime);
//   - createActions(rt) → the same functions bound to an explicit runtime (tests, the harness).
import {
  deptOfLaneStep,
  deptOfOpReviewStep,
  deptSteps,
  fieldType,
  isProcess,
  laneFields as laneFieldsOf,
  LocalGuardError,
  stepDef,
  switchesAt,
  type Dept,
  type FlowId,
  type StepIr,
} from "../schema";
import { F } from "../schema/generated";
import { partialCountAction } from "../domain/flags";
import { queryKey } from "../domain/keys";
import { ASK_ADMIN, COUNTS_BLOCKED } from "../domain/labels";
import { errorText } from "../kf/sdk";
import { isMovedOut, isTimeout, type RawItem } from "./client";
import { crBelongsTo, laneOpenCount, openCrCount, openItemsCount, rmesGaps, type CountResult } from "./counts";
import { ActionError, createFormRow as createFormRowRt, createProcessItem as createProcessItemRt, type CreateFormOptions, type CreateProcessOptions } from "./creates";
import { stepProblems } from "./gates";
import { toCrVM, toPointVM, toRmesVM } from "./map";
import { CLEAR, kfDateTime, sameValue } from "./normalize";
import type { PendingSheet } from "./pendingSheet";
import { adminRungAllowed, boundRuntime, fillAdminRows, heldTaskIn, readList, type Runtime } from "./runtime";
import { markClosedAct } from "./session";
import { writeAudit as writeAuditRt, type AuditResult } from "./audit";
import { activityIdOf, progressActivities } from "./tasks";
import type { ActionResult, AuditInput, CaseVM, Check, CrVM, ListRead, Patch, PointVM, ReturnInput, SaveResult, SubmitResult, TaskRef, Unread } from "./viewModels";
import { UncertainItemError, WrongContainerError, itemKey } from "./writeQueue";
import { compareWithoutWrite, missingFrom, missingKeys, writeVerified, type Target } from "./writeVerified";

export { ActionError };

const taskTarget = (t: TaskRef & { step: StepIr }): Target => ({ kind: "task", flow: t.flow, instanceId: t.instanceId, activityInstanceId: t.activityInstanceId, step: t.step, evidence: t.evidence });

function queueErrorResult(e: unknown): SaveResult | null {
  if (e instanceof WrongContainerError) return { ok: false, kind: "refused", message: e.message, code: "wrong-container" };
  if (e instanceof UncertainItemError) return { ok: false, kind: "refused", message: e.message, code: "uncertain" };
  return null;
}

/** The held task, or a refusal (ground rule 13: actions need the task, not the role). */
type Refusal = Extract<SaveResult, { kind: "refused" }>;
function requireHeld(rt: Runtime, task: TaskRef): (TaskRef & { step: StepIr }) | Refusal {
  if (!task.step) return { ok: false, kind: "refused", message: "This task is at a step the Workbench could not identify: open it in Kissflow.", code: "no-task" };
  const held = heldTaskIn(rt, task.flow, task.instanceId, task.step);
  if (!held || held.activityInstanceId !== task.activityInstanceId) return { ok: false, kind: "refused", message: "You don't hold this task.", code: "no-task" };
  return { ...task, step: task.step, evidence: held.evidence };
}

// ---------------------------------------------------------------- saveAtStep

export async function saveAtStepRt(rt: Runtime, task: TaskRef, patch: Patch): Promise<SaveResult> {
  const held = requireHeld(rt, task);
  if ("ok" in held) return held;
  try {
    const res = await writeVerified(rt, taskTarget(held), patch);
    if (res.kind === "kwb-refused") savePending(rt, held, res.pending, stepDef(held.step).name);
    if (res.ok) rt.changed();
    return res;
  } catch (e) {
    const q = queueErrorResult(e);
    if (q) return q;
    throw e;
  }
}

function savePending(rt: Runtime, task: TaskRef, p: Patch, stepName: string, extra: Partial<PendingSheet> = {}) {
  rt.pending.save(task.key, { fields: p.fields, tables: p.tables, stepName, savedAt: kfDateTime(rt.now()), ...extra });
}

// ---------------------------------------------------------------- submitStep (§7.3)

export interface SubmitOptions {
  extraChecks?: Check[];
  laneFields?: string[];
  comment?: string;
}

const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));

export async function submitStepRt(rt: Runtime, task: TaskRef, o: SubmitOptions = {}): Promise<SubmitResult> {
  // 0. the held task, and not uncertain
  const held = requireHeld(rt, task);
  if ("ok" in held) return { ok: false, kind: "no-task", message: held.message };
  const key = itemKey(task.flow, task.instanceId);
  if (!rt.queue.containerOk) return { ok: false, kind: "wrong-container", message: new WrongContainerError(rt.client.appId).message };
  if (rt.queue.uncertain(key)) return { ok: false, kind: "uncertain", message: new UncertainItemError().message };
  // 1. a pending save finishes first; if it failed, refuse
  await rt.queue.idle(key);
  if (rt.queue.lastFailed(key)) return { ok: false, kind: "last-save-failed", message: "The last save failed, so this step was not sent. Save again (or Re-read) first." };
  // 2. server truth, formulas included
  let fresh: RawItem;
  try {
    fresh = await rt.client.getItem(task.flow, task.instanceId, task.activityInstanceId);
  } catch (e) {
    if (isMovedOut(e)) {
      markClosedAct(rt.session, task.flow, task.instanceId, task.activityInstanceId);
      rt.changed();
      return { ok: false, kind: "moved-out", message: "This task was closed (someone else acted, or it was submitted in Kissflow). The list was reloaded." };
    }
    return { ok: false, kind: isTimeout(e) ? "timeout" : "refused", message: errorText(e) };
  }
  // 3. Mandatory (writable only) + computed gates on the SERVER + extra checks
  const problems = stepProblems(held.step, fresh, o.extraChecks ?? []);
  if (problems.length) return { ok: false, kind: "problems", problems, message: "Not sent: fix these first." };
  // 4. the lane snapshot (lane steps only)
  const dept = deptOfLaneStep(held.step);
  const laneFields = o.laneFields ?? (dept ? laneFieldsOf(dept) : undefined);
  const snapshot = laneFields ? pick(fresh, laneFields) : undefined;
  // 5. submit (never with fields in the body: they are ignored, SPIKES L142)
  let sent = false;
  try {
    await rt.queue.enqueue(key, () => rt.client.submit(task.flow, task.instanceId, task.activityInstanceId, o.comment));
    sent = true;
    markClosedAct(rt.session, task.flow, task.instanceId, task.activityInstanceId);
  } catch (e) {
    const q = queueErrorResult(e);
    if (q && q.kind === "refused") return { ok: false, kind: q.code === "wrong-container" ? "wrong-container" : "uncertain", message: q.message };
    if (isMovedOut(e)) {
      markClosedAct(rt.session, task.flow, task.instanceId, task.activityInstanceId);
      rt.changed();
      return { ok: false, kind: "moved-out", message: "This task was closed before the submit (someone else acted, or it was submitted in Kissflow). The list was reloaded." };
    }
    if (isTimeout(e)) {
      rt.queue.markUncertain(key, { kind: "submit" });
      // settle: if the task is gone from my tasks, the submit went through
      try {
        const still = (await rt.client.listTasks(task.flow)).some((r) => r._id === task.instanceId && r._activity_instance_id === task.activityInstanceId);
        if (!still) {
          rt.queue.clearUncertain(key);
          sent = true;
          markClosedAct(rt.session, task.flow, task.instanceId, task.activityInstanceId);
        }
      } catch {
        /* stays uncertain */
      }
      if (!sent) return { ok: false, kind: "timeout", message: "Kissflow did not answer the submit within 30 s. This item is locked for saving until you press Re-read." };
    } else return { ok: false, kind: "refused", message: errorText(e) };
  }
  const notes: string[] = [];
  let auditWarning: string | undefined;
  rt.pending.remove(task.key);
  // 6. lane steps: the F8 lane.completed snapshot (the repair source, §7.10)
  if (dept && snapshot) {
    try {
      await writeAuditRt(rt, {
        category: "Case",
        actionCode: "lane.completed",
        caseCode: String(fresh[F.Case.Case_Code] ?? ""),
        cycleNo: fresh[F.Case.Cycle_No] === undefined ? undefined : Number(fresh[F.Case.Cycle_No]),
        caseItemId: task.instanceId,
        objectKind: "Case",
        objectItemId: task.instanceId,
        objectKey: `${String(fresh[F.Case.Case_Code] ?? "")}:lane:${dept}`,
        snapshot,
        actorDept: dept,
      });
    } catch (e) {
      auditWarning = `The completion of this department review was not recorded in the audit log (${errorText(e)}). The submit already happened.`;
    }
  }
  // 7. post-submit re-read (§6.2 order); for rung-3 users "not readable" is the expected outcome
  let postCheck: "compared" | "not-readable" | "skipped" = "skipped";
  let laneDiff: string[] | undefined;
  if (snapshot) {
    let after: RawItem | null = null;
    try {
      after = await rt.client.getItem(task.flow, task.instanceId, task.activityInstanceId);
    } catch {
      if (adminRungAllowed(rt, task.flow))
        try {
          after = await rt.client.getAdminItem(task.flow, task.instanceId);
        } catch {
          after = null;
        }
    }
    if (after) {
      postCheck = "compared";
      // per field type (WL-13): the two reads may come through different routes (assignee getItem vs admin SDK/REST),
      // so a User value with or without extra keys, or a DateTime with or without ms, is the same value
      laneDiff = Object.keys(snapshot).filter((k) => !sameValue(fieldType(task.flow, k), snapshot[k], after![k] ?? null));
    } else {
      postCheck = "not-readable";
      notes.push("Submitted; the post-submit check could not read the item with your access.");
    }
  }
  // 8. reload tasks and bundles
  rt.changed();
  return { ok: true, kind: "submitted", notes, laneSnapshot: snapshot, laneDiff, postCheck, auditWarning };
}

// ---------------------------------------------------------------- K-WB fallback (§7.4)

export async function openTaskFormRt(rt: Runtime, task: TaskRef): Promise<"opened" | "timeout" | "refused"> {
  rt.session.openForm.presses++;
  const r = await rt.client.openForm(task.flow, task.instanceId, task.activityInstanceId);
  if (r === "opened") rt.session.openForm.answered++;
  else if (r === "timeout") rt.session.openForm.timedOut++;
  else rt.session.openForm.refused++;
  return r;
}

/** Re-read: reads the item again and compares it with the pending sheet WITHOUT writing. "Moved out of your queue"
 *  means the user most likely submitted (or sent back) in Kissflow: the sheet is cleared. */
export async function reReadPendingRt(rt: Runtime, task: TaskRef): Promise<{ matches: boolean; missing: string[]; submittedElsewhere: boolean }> {
  const sheet = rt.pending.load(task.key);
  let back: RawItem;
  try {
    back = await rt.client.getItem(task.flow, task.instanceId, task.activityInstanceId);
  } catch (e) {
    if (isMovedOut(e)) {
      rt.pending.remove(task.key);
      rt.queue.recordSave(itemKey(task.flow, task.instanceId), true);
      markClosedAct(rt.session, task.flow, task.instanceId, task.activityInstanceId);
      rt.changed();
      return { matches: true, missing: [], submittedElsewhere: true };
    }
    throw e;
  }
  if (!sheet) return { matches: true, missing: [], submittedElsewhere: false };
  const cmp = compareWithoutWrite(task.flow, back, { fields: sheet.fields, tables: sheet.tables }, rt.rnd);
  if (sheet.mode === "values+sendback") return { matches: false, missing: [...cmp.missing, "Send back to Waiting for supplier"], submittedElsewhere: false };
  if (cmp.matches) {
    rt.pending.remove(task.key);
    // the values the Workbench could not save are now on the server: the refused save no longer blocks a submit
    rt.queue.recordSave(itemKey(task.flow, task.instanceId), true);
    // CR-T4-harness-3 (T5): the values were saved in the native form, i.e. server state changed outside the
    // Workbench: hooks reload (the lane screen would otherwise keep the pre-fallback case values).
    rt.changed();
  }
  return { ...cmp, submittedElsewhere: false };
}

export interface UncertainReread {
  landed: string[];
  notLanded: string[];
  cleared: boolean;
  /** False when the item could not be read with this user's access: the mark is cleared, nothing was compared. */
  checked: boolean;
  /** A plain sentence for the user (what was found, what to do). */
  note?: string;
}

/**
 * Re-read for an UNCERTAIN item (§7.1): shows what landed of the timed-out patch and clears the mark.
 * - A Process item is read through the held task (act), else through the admin route when rung 1 is allowed. It is
 *   never read with the Form API (WL-02). Without either route the mark is cleared with a "could not check" note
 *   (the same as a reload), so the item does not stay locked for the session.
 * - The compare is per field type, against the normalised patch (WL-10): a User written as {_id} that reads back as
 *   {_id, Name}, or a child add under a server row id, counts as landed.
 * - A reject that timed out (WL-06): the task still open on the re-read means the reject did not happen, so the F8
 *   case.cancel.failed row is written now (never before a settle).
 */
export async function reReadUncertainRt(rt: Runtime, flow: FlowId, id: string, act?: string): Promise<UncertainReread> {
  const key = itemKey(flow, id);
  const info = rt.queue.uncertain(key);
  let back: RawItem | null = null;
  let movedOut = false;
  let checked = true;
  let note: string | undefined;
  try {
    if (act) back = await rt.client.getItem(flow, id, act);
    else if (!isProcess(flow)) back = await rt.client.formGet(flow, id);
    else if (adminRungAllowed(rt, flow)) back = await rt.client.getAdminItem(flow, id);
    else checked = false;
  } catch (e) {
    if (act && isMovedOut(e)) movedOut = true;
    else if (!act && isProcess(flow)) checked = false;
    else throw e;
  }
  const landed: string[] = [];
  const notLanded: string[] = [];
  if (back && info?.patch) {
    const left = new Set(missingKeys(missingFrom(flow, back, info.patch)));
    for (const k of missingKeys(info.patch)) (left.has(k) ? notLanded : landed).push(k);
  }
  if (!checked) note = "The item could not be read with your access, so the Workbench could not check what was saved. Open it again and check the values before you save.";
  else if (movedOut) note = info?.kind === "reject" ? "The task has left your queue: the case was ended." : "The task has left your queue, so it was most likely completed. The list was reloaded.";
  if (info?.kind === "reject" && info.cancel && act && back && !movedOut && String(back._status ?? "") !== "Rejected") {
    // settled: the reject did not happen
    try {
      await writeAuditRt(rt, { category: "Case", actionCode: "case.cancel.failed", caseCode: info.cancel.caseCode, cycleNo: info.cancel.cycleNo, caseItemId: info.cancel.caseItemId, objectKind: "Case", objectItemId: info.cancel.caseItemId, objectKey: info.cancel.eventKey, eventReason: "Kissflow did not answer the reject; the task is still open." });
      note = "The case was not cancelled: the task is still open. The cancellation record is kept; try again, or end the case in Kissflow.";
    } catch (e) {
      note = `The case was not cancelled: the task is still open. The failed attempt could not be recorded (${errorText(e)}).`;
    }
  }
  if (movedOut && act) markClosedAct(rt.session, flow, id, act);
  rt.queue.clearUncertain(key);
  rt.changed();
  return { landed, notLanded, cleared: true, checked, note };
}

// ---------------------------------------------------------------- reject (§7.7)

/** Settle after a timed-out step action: true when the task has left the user's task list, false when it is still
 *  there (the action did not happen yet), null when the list could not be read. */
async function taskGone(rt: Runtime, task: Pick<TaskRef, "flow" | "instanceId" | "activityInstanceId">): Promise<boolean | null> {
  try {
    return !(await rt.client.listTasks(task.flow)).some((r) => r._id === task.instanceId && r._activity_instance_id === task.activityInstanceId);
  } catch {
    return null;
  }
}

export async function rejectCaseRt(rt: Runtime, task: TaskRef, reason: string, c: CaseVM): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, message: "A reason is required to cancel the case.", kind: "problems" };
  const held = requireHeld(rt, task);
  if ("ok" in held) return { ok: false, message: held.message, kind: "no-task" };
  if (task.flow !== "CIQ_Case_A00" || !switchesAt(held.step).reject) return { ok: false, message: "Cancelling is not possible at this step.", kind: "not-allowed" };
  // 1. the F8 Cancellation row FIRST (dec L476; COH-15). Not verified → stop: the reject is not sent.
  let ev: AuditResult;
  try {
    ev = await writeAuditRt(rt, {
      category: "Cancellation",
      actionCode: "case.cancel",
      eventReason: reason,
      caseCode: c.caseCode,
      cycleNo: c.cycleNo,
      caseItemId: c._id,
      objectKind: "Case",
      objectItemId: c._id,
      notifyRecipient: c.supplierContactEmails || undefined,
    });
  } catch (e) {
    return { ok: false, message: `The cancellation could not be recorded, so the case was NOT cancelled (${errorText(e)}).`, kind: "audit-failed" };
  }
  // 2. the reject
  const key = itemKey(task.flow, task.instanceId);
  try {
    await rt.queue.enqueue(key, () => rt.client.reject(task.flow, task.instanceId, task.activityInstanceId, reason));
    markClosedAct(rt.session, task.flow, task.instanceId, task.activityInstanceId);
  } catch (e) {
    if (isTimeout(e)) {
      // WL-06: the reject may still land. No case.cancel.failed row until a settle shows it did not happen.
      rt.queue.markUncertain(key, { kind: "reject", cancel: { eventKey: ev.eventKey, caseCode: c.caseCode, cycleNo: c.cycleNo, caseItemId: c._id } });
      const gone = await taskGone(rt, task);
      if (gone === true) {
        rt.queue.clearUncertain(key);
        markClosedAct(rt.session, task.flow, task.instanceId, task.activityInstanceId);
        rt.changed();
        return { ok: true, message: "Cancellation recorded and the case ended. The supplier is not notified automatically yet.", kind: "verified", eventKey: ev.eventKey };
      }
      return { ok: false, message: "The cancellation is recorded, but Kissflow did not answer the cancel within 30 s, so it is not known yet whether the case ended. Press Re-read.", kind: "timeout", eventKey: ev.eventKey };
    }
    try {
      await writeAuditRt(rt, { category: "Case", actionCode: "case.cancel.failed", caseCode: c.caseCode, cycleNo: c.cycleNo, caseItemId: c._id, objectKind: "Case", objectItemId: c._id, objectKey: ev.eventKey, eventReason: errorText(e) });
    } catch {
      /* the red banner below says the reject failed either way */
    }
    return { ok: false, message: `The cancellation was recorded, but Kissflow did not end the case (${errorText(e)}).`, kind: "reject-failed", eventKey: ev.eventKey };
  }
  rt.changed();
  return { ok: true, message: "Cancellation recorded. The supplier is not notified automatically yet.", kind: "verified", eventKey: ev.eventKey };
}

/** Case Admin during Part 2 and S6 (§7.7; K-13/K-PAR-3 [unverified]): the F8 row, then a reject with an activity
 *  instance from getAdminItem if the read carries one; otherwise the admin ends the case in Kissflow. */
export async function cancelCaseAsAdminRt(rt: Runtime, c: CaseVM, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, message: "A reason is required to cancel the case.", kind: "problems" };
  if (!rt.caps().isCaseAdmin) return { ok: false, message: "Only a Case administrator can cancel a case in review.", kind: "not-allowed" };
  let ev: AuditResult;
  try {
    ev = await writeAuditRt(rt, { category: "Cancellation", actionCode: "case.cancel", eventReason: reason, caseCode: c.caseCode, cycleNo: c.cycleNo, caseItemId: c._id, objectKind: "Case", objectItemId: c._id, notifyRecipient: c.supplierContactEmails || undefined });
  } catch (e) {
    return { ok: false, message: `The cancellation could not be recorded, so nothing else was done (${errorText(e)}).`, kind: "audit-failed" };
  }
  let act: string | undefined;
  try {
    const it = await rt.client.getAdminItem("CIQ_Case_A00", c._id);
    act = typeof it._activity_instance_id === "string" ? it._activity_instance_id : undefined;
  } catch {
    act = undefined;
  }
  if (act) {
    const key = itemKey("CIQ_Case_A00", c._id);
    try {
      await rt.queue.enqueue(key, () => rt.client.reject("CIQ_Case_A00", c._id, act!, reason));
      markClosedAct(rt.session, "CIQ_Case_A00", c._id, act);
      rt.changed();
      return { ok: true, message: "Cancellation recorded and the case ended. The supplier is not notified automatically yet.", kind: "verified", eventKey: ev.eventKey };
    } catch (e) {
      // WL-06: a timeout is not a refusal: the reject may still land, so the case is locked until Re-read
      if (isTimeout(e)) {
        rt.queue.markUncertain(key, { kind: "reject" });
        return { ok: false, message: "The cancellation is recorded, but Kissflow did not answer the cancel within 30 s, so it is not known yet whether the case ended. Press Re-read before doing anything else on this case.", kind: "timeout", eventKey: ev.eventKey };
      }
      /* refused: fall through to the manual instruction */
    }
  }
  return { ok: true, message: "The cancellation event is recorded. End the case as process admin in Kissflow (reject).", kind: "manual-end", eventKey: ev.eventKey };
}

// ---------------------------------------------------------------- send back a point (§7.5)

/** The Return write at OPNT_R_<D> (§7.5 step 2). OP_Outcome stays blank (BR-046). */
export function buildReturnPatch(p: PointVM, ret: ReturnInput & { portalContactIds?: string }, me: { _id: string; Name: string }, now: Date): Patch {
  const n = p.roundNo ?? 1;
  const stamp = kfDateTime(now);
  const block = `[${stamp}] Returned by ${me.Name} (round ${n}): ${ret.reason}\nNew question (round ${n + 1}): ${ret.questionText}`;
  const fields: Patch["fields"] = {
    Round_No: n + 1,
    Query_Key: queryKey(p.opKey, n + 1),
    Question_Text: ret.questionText,
    Supplier_Justification: ret.supplierJustification,
    Supplier_Due_Date: ret.supplierDueDate,
    Internal_Due_Date: ret.internalDueDate,
    Thread_Text: p.threadText ? `${p.threadText}\n\n${block}` : block,
    Response_Kind: CLEAR,
    Response_Text: CLEAR,
    Response_Doc_Refs_JSON: CLEAR,
    Awaiting_Response: "Yes",
    Return_Reason: ret.reason,
  };
  if (ret.portalContactIds) fields.Portal_Contact_Ids = ret.portalContactIds;
  return {
    fields,
    tables: {
      Rounds: [
        {
          kind: "add",
          row: {
            Rounds_Round_No: n,
            Rounds_Question_Text: p.questionText,
            Rounds_Response_Kind: p.responseKind || undefined,
            Rounds_Response_Text: p.responseText || undefined,
            Rounds_Outcome: "Returned",
            Rounds_Reason: ret.reason,
            Rounds_Reviewed_By: { _id: me._id },
            Rounds_Reviewed_At: stamp,
          },
        },
      ],
    },
  };
}

const RETURN_KWB_NOTE = "Kissflow did not let the Workbench save the new round. In the task form, enter these values, save, then use Send back to Waiting for supplier.";
const sendBackFallbackNote = (why: string) => `Kissflow refused the send-back from the Workbench (${why}). Open the task form and use Send back to Waiting for supplier. The new round is already saved.`;
const FURTHER = `If that does not work either, ${ASK_ADMIN}.`;

export async function sendBackPointRt(rt: Runtime, task: TaskRef, ret: ReturnInput & { portalContactIds?: string }, p: PointVM): Promise<ActionResult & { mode: "sdk" | "openForm" | "kwb" }> {
  const missing = (["questionText", "supplierJustification", "supplierDueDate", "internalDueDate", "reason"] as const).filter((k) => !String(ret[k] ?? "").trim());
  if (missing.length) return { ok: false, mode: "sdk", kind: "problems", message: `Fill in: ${missing.join(", ")}.` };
  const held = requireHeld(rt, task);
  if ("ok" in held) return { ok: false, mode: "sdk", kind: "no-task", message: held.message };
  if (!deptOfOpReviewStep(held.step) || !switchesAt(held.step).sendBack) return { ok: false, mode: "sdk", kind: "not-allowed", message: "A Return is possible only at an open point's review step." };
  if (!p.toSupplier) return { ok: false, mode: "sdk", kind: "not-allowed", message: "Only points that go to the supplier can be returned." };
  // WL-11: the new round is built from a FULL read of the point through the held task, never from a list row (a
  // sparse row would restart Round_No and overwrite the supplier-visible thread). No read → no Return.
  let point: PointVM;
  try {
    point = toPointVM(await rt.client.getItem(task.flow, task.instanceId, task.activityInstanceId), "full");
  } catch (e) {
    if (isMovedOut(e)) {
      markClosedAct(rt.session, task.flow, task.instanceId, task.activityInstanceId);
      rt.changed();
      return { ok: false, mode: "sdk", kind: "moved-out", message: "This task was closed (someone else acted, or it was completed in Kissflow). The list was reloaded." };
    }
    return { ok: false, mode: "sdk", kind: "refused", message: `The point could not be read, so nothing was returned (${errorText(e)}). Try again.` };
  }
  if (!point.toSupplier) return { ok: false, mode: "sdk", kind: "not-allowed", message: "Only points that go to the supplier can be returned." };
  const patch = buildReturnPatch(point, ret, rt.me, rt.now());
  let res: SaveResult;
  try {
    res = await writeVerified(rt, taskTarget(held), patch);
  } catch (e) {
    const q = queueErrorResult(e);
    if (q && !q.ok) return { ok: false, mode: "sdk", kind: "refused", message: q.message };
    throw e;
  }
  if (res.kind === "kwb-refused") {
    savePending(rt, held, res.pending, stepDef(held.step).name, { note: `${RETURN_KWB_NOTE} ${FURTHER}`, mode: "values+sendback" });
    return { ok: false, mode: "kwb", kind: "fallback", message: RETURN_KWB_NOTE };
  }
  if (!res.ok) return { ok: false, mode: "sdk", kind: res.kind, message: res.message };
  // 3. the target step id
  let stepId = activityIdOf(rt.session, "OPNT_S1");
  if (!stepId && !rt.session.progressDisabled) {
    try {
      const acts = progressActivities(await rt.client.getProgress(task.flow, task.instanceId));
      stepId = acts.find((a) => a.name === stepDef("OPNT_S1").name && a.activityId)?.activityId ?? null;
    } catch {
      stepId = null;
    }
  }
  const fallback = (why: string) => {
    savePending(rt, held, { fields: {} }, stepDef(held.step).name, { note: `${sendBackFallbackNote(why)} ${FURTHER}`, mode: "values+sendback" });
    rt.changed();
    return { ok: false, mode: "openForm" as const, kind: "fallback", message: sendBackFallbackNote(why) };
  };
  if (!stepId) {
    rt.session.sendBack = "no-step-id";
    return fallback("target step unknown");
  }
  // 4. send back
  const key = itemKey(task.flow, task.instanceId);
  try {
    await rt.queue.enqueue(key, () => rt.client.sendBack(task.flow, task.instanceId, task.activityInstanceId, stepId!, ret.reason));
  } catch (e) {
    if (isTimeout(e)) {
      // WL-06: not a refusal. The send-back may still land: lock the item until Re-read; settle by the task list.
      rt.queue.markUncertain(key, { kind: "submit" });
      const gone = await taskGone(rt, task);
      if (gone !== true) return { ok: false, mode: "sdk", kind: "timeout", message: "The new round is saved, but Kissflow did not answer the send-back within 30 s, so it is not known yet whether the point went back to the supplier. Press Re-read." };
      rt.queue.clearUncertain(key);
    } else {
      rt.session.sendBack = "refused";
      return fallback(errorText(e));
    }
  }
  rt.session.sendBack = "ok";
  markClosedAct(rt.session, task.flow, task.instanceId, task.activityInstanceId);
  rt.changed();
  return { ok: true, mode: "sdk", kind: "verified", message: "Returned to the supplier step. The supplier is not notified automatically yet." };
}

// ---------------------------------------------------------------- forms

export async function updateFormRowRt(rt: Runtime, flow: FlowId, itemId: string, patch: Patch): Promise<SaveResult> {
  if (flow === "CIQ_Audit_Event_A00") throw new LocalGuardError("F8 (CIQ Audit Event) is create-only: updateFormRow refuses it");
  try {
    const res = await writeVerified(rt, { kind: "form", flow, itemId }, patch);
    if (res.ok) rt.changed();
    return res;
  } catch (e) {
    const q = queueErrorResult(e);
    if (q) return q;
    throw e;
  }
}

// ---------------------------------------------------------------- counts (§7.9)

export type CountsScope = "case" | { lane: Dept };
export type RefreshResult = SaveResult & { confidence: "complete" | "partial"; unread: Unread[]; action: "written" | "blocked" | "attested" | "cleared"; counts?: Record<string, number | null>; gate?: string; warnings?: string[] };

async function readCaseLists(rt: Runtime, c: CaseVM): Promise<{ points: ListRead<PointVM>; crs: ListRead<CrVM> }> {
  const [pl, cl] = await Promise.all([readList(rt, "CIQ_Open_Point_A00"), readList(rt, "CIQ_Change_Request_A00")]);
  // rung 1: fill sparse rows of THIS case whose open formula is missing
  const fillIf = async (flow: FlowId, l: ListRead<RawItem>, need: (r: RawItem) => boolean) => (l.quality === "admin" ? (await fillAdminRows(rt, flow, l.rows, need)).rows : l.rows);
  const opRows = await fillIf("CIQ_Open_Point_A00", pl, (r) => r.Case_Item_Id === c._id && (r.Open_Num === undefined || r.Open_Num === null || r.Open_Num === ""));
  const crRows = await fillIf("CIQ_Change_Request_A00", cl, (r) => crBelongsTo(toCrVM(r), c) && (r.CR_Open_Num === undefined || r.CR_Open_Num === null || r.CR_Open_Num === ""));
  return {
    points: { ...pl, rows: opRows.map((r) => toPointVM(r)) },
    crs: { ...cl, rows: crRows.map((r) => toCrVM(r)) },
  };
}

function holdKey(step: StepIr): string {
  return step === "CASE_S5" ? "hold:release" : step === "CASE_S8" ? "hold:close" : "hold";
}

export async function refreshCaseCountsRt(rt: Runtime, task: TaskRef, c: CaseVM, scope: CountsScope, o: { attestation?: string } = {}): Promise<RefreshResult> {
  const step = task.step;
  if (!step) throw new LocalGuardError("refreshCaseCounts needs a resolved step");
  if (step === "CASE_S2" || step === "CASE_S3") throw new LocalGuardError("counts are read-only at Scope check and at Completeness: never written there");
  if (scope === "case" && !["CASE_S5", "CASE_S7", "CASE_S8"].includes(step)) throw new LocalGuardError(`case counts are written only at S5, S7 and S8, not ${step}`);
  if (scope !== "case" && deptSteps(scope.lane).caseLaneStep !== step) throw new LocalGuardError(`lane ${scope.lane} counts are written only at ${deptSteps(scope.lane).caseLaneStep}`);
  const flags = rt.flagsFor(c);
  const { points, crs } = await readCaseLists(rt, c);
  const fields: Record<string, number | null> = {};
  let results: CountResult[];
  const warnings: string[] = [];
  if (scope === "case") {
    const a = openItemsCount(c, points);
    const b = openCrCount(c, crs);
    results = [a, b];
    fields.Open_Items_Count = a.value;
    fields.Open_CR_Count = b.value;
  } else {
    const d = scope.lane;
    const lane = laneOpenCount(c, d, points, crs);
    results = [lane];
    fields[`${d}_Open_Count`] = lane.value;
    if (d === "SAF" || d === "REG") {
      const flow = d === "SAF" ? "CIQ_RMES_Safety_A00" : "CIQ_RMES_Regulatory_A00";
      const rl = await readList(rt, flow);
      const rows = rl.rows.filter((r) => r.Case_Item_Id === c._id).map((r) => toRmesVM(r, flow));
      const g = rmesGaps(rows);
      warnings.push(...g.warnings);
      if (rl.quality !== "form") results.push({ value: 0, confidence: "partial", items: [], unread: [{ flow, rung: rl.quality, reason: "The RMES sheet could not be read" }], warnings: [] });
      if (g.value !== null) fields[`${d}_RMES_Gaps`] = g.value;
    }
  }
  warnings.push(...results.flatMap((r) => r.warnings));
  const unread = results.flatMap((r) => r.unread);
  const confidence = unread.length ? "partial" : "complete";
  const write = async (patch: Patch, action: RefreshResult["action"]): Promise<RefreshResult> => {
    const res = await saveAtStepRt(rt, task, patch);
    const gateField = scope === "case" ? (step === "CASE_S5" ? "Open_Items_Gate_Release" : step === "CASE_S8" ? "Open_Items_Gate_Close" : undefined) : `${scope.lane}_Gate`;
    return { ...res, confidence, unread, action, counts: fields, gate: res.ok && gateField ? String(res.item[gateField] ?? "") : undefined, warnings } as RefreshResult;
  };
  if (confidence === "complete") return write({ fields }, "written");
  const act = partialCountAction(step, flags);
  if (act === "clear") return write({ fields: { Open_Items_Count: CLEAR, Open_CR_Count: CLEAR } }, "cleared");
  if (act === "block" || !o.attestation || o.attestation.trim().length < 20) {
    const msg =
      act === "block" ? COUNTS_BLOCKED : "Counts could not be confirmed with your access. Type an attestation (at least 20 characters) to write the visible counts.";
    return { ok: false, kind: "refused", message: msg, confidence, unread, action: "blocked", counts: fields, warnings };
  }
  // attest: the F8 count.attested row FIRST, verified; only then the visible counts
  const objectKey = scope === "case" ? `${c.caseCode}:${holdKey(step)}` : `${c.caseCode}:lane:${scope.lane}`;
  try {
    await writeAuditRt(rt, {
      category: "Case",
      actionCode: "count.attested",
      caseCode: c.caseCode,
      cycleNo: c.cycleNo,
      caseItemId: c._id,
      objectKind: "Case",
      objectItemId: c._id,
      objectKey,
      eventReason: o.attestation.trim(),
      snapshot: { value: fields, read: [{ flow: "CIQ_Open_Point_A00", quality: points.quality, rows: points.rows.length }, { flow: "CIQ_Change_Request_A00", quality: crs.quality, rows: crs.rows.length }], unread },
    });
  } catch (e) {
    return { ok: false, kind: "refused", message: `The attestation could not be recorded, so nothing was written (${errorText(e)}).`, confidence, unread, action: "blocked", counts: fields, warnings };
  }
  return write({ fields }, "attested");
}

// ---------------------------------------------------------------- bundles

export interface Actions {
  saveAtStep(task: TaskRef, patch: Patch): Promise<SaveResult>;
  submitStep(task: TaskRef, o?: SubmitOptions): Promise<SubmitResult>;
  rejectCase(task: TaskRef, reason: string, c: CaseVM): Promise<ActionResult>;
  cancelCaseAsAdmin(c: CaseVM, reason: string): Promise<ActionResult>;
  sendBackPoint(task: TaskRef, ret: ReturnInput & { portalContactIds?: string }, p: PointVM): Promise<ActionResult & { mode: "sdk" | "openForm" | "kwb" }>;
  createProcessItem(flow: FlowId, data: Record<string, unknown>, o?: CreateProcessOptions): Promise<{ instanceId: string }>;
  createFormRow(flow: FlowId, data: Record<string, unknown>, keyField: string, o?: CreateFormOptions): Promise<{ itemId: string; missing?: string[] }>;
  updateFormRow(flow: FlowId, itemId: string, patch: Patch): Promise<SaveResult>;
  writeAudit(e: AuditInput): Promise<{ itemId: string; correctionItemId?: string; eventKey: string }>;
  openTaskForm(task: TaskRef): Promise<"opened" | "timeout" | "refused">;
  reReadPending(task: TaskRef): Promise<{ matches: boolean; missing: string[]; submittedElsewhere: boolean }>;
  reReadUncertain(flow: FlowId, id: string, act?: string): Promise<UncertainReread>;
  refreshCaseCounts(task: TaskRef, c: CaseVM, scope: CountsScope, o?: { attestation?: string }): Promise<RefreshResult>;
  /** Discards the user's own process draft (ground rule 9 allows it; never someone else's item). */
  discardDraft(flow: FlowId, instanceId: string): Promise<void>;
}

export function createActions(rt: Runtime): Actions {
  return {
    saveAtStep: (t, p) => saveAtStepRt(rt, t, p),
    submitStep: (t, o) => submitStepRt(rt, t, o),
    rejectCase: (t, r, c) => rejectCaseRt(rt, t, r, c),
    cancelCaseAsAdmin: (c, r) => cancelCaseAsAdminRt(rt, c, r),
    sendBackPoint: (t, r, p) => sendBackPointRt(rt, t, r, p),
    createProcessItem: (f, d, o) => createProcessItemRt(rt, f, d, o),
    createFormRow: (f, d, k, o) => createFormRowRt(rt, f, d, k, o),
    updateFormRow: (f, id, p) => updateFormRowRt(rt, f, id, p),
    writeAudit: (e) => writeAuditRt(rt, e),
    openTaskForm: (t) => openTaskFormRt(rt, t),
    reReadPending: (t) => reReadPendingRt(rt, t),
    reReadUncertain: (f, id, act) => reReadUncertainRt(rt, f, id, act),
    refreshCaseCounts: (t, c, s, o) => refreshCaseCountsRt(rt, t, c, s, o),
    discardDraft: async (f, id) => {
      rt.queue.assertContainer();
      await rt.client.discard(f, id);
      rt.changed();
    },
  };
}

// ---------------------------------------------------------------- §12.2 module-level signatures (bound runtime)

export const saveAtStep = (task: TaskRef, patch: Patch): Promise<SaveResult> => saveAtStepRt(boundRuntime(), task, patch);
export const submitStep = (task: TaskRef, o?: SubmitOptions): Promise<SubmitResult> => submitStepRt(boundRuntime(), task, o);
export const rejectCase = (task: TaskRef, reason: string, c: CaseVM): Promise<ActionResult> => rejectCaseRt(boundRuntime(), task, reason, c);
export const cancelCaseAsAdmin = (c: CaseVM, reason: string): Promise<ActionResult> => cancelCaseAsAdminRt(boundRuntime(), c, reason);
export const sendBackPoint = (task: TaskRef, ret: ReturnInput & { portalContactIds?: string }, p: PointVM) => sendBackPointRt(boundRuntime(), task, ret, p);
export const createProcessItem = (flow: FlowId, data: Record<string, unknown>, o?: CreateProcessOptions) => createProcessItemRt(boundRuntime(), flow, data, o);
export const createFormRow = (flow: FlowId, data: Record<string, unknown>, keyField: string, o?: CreateFormOptions) => createFormRowRt(boundRuntime(), flow, data, keyField, o);
export const updateFormRow = (flow: FlowId, itemId: string, patch: Patch): Promise<SaveResult> => updateFormRowRt(boundRuntime(), flow, itemId, patch);
export const writeAudit = (e: AuditInput) => writeAuditRt(boundRuntime(), e);
export const openTaskForm = (task: TaskRef) => openTaskFormRt(boundRuntime(), task);
export const reReadPending = (task: TaskRef) => reReadPendingRt(boundRuntime(), task);
export const reReadUncertain = (flow: FlowId, id: string, act?: string) => reReadUncertainRt(boundRuntime(), flow, id, act);
export const refreshCaseCounts = (task: TaskRef, c: CaseVM, scope: CountsScope, o?: { attestation?: string }) => refreshCaseCountsRt(boundRuntime(), task, c, scope, o);
