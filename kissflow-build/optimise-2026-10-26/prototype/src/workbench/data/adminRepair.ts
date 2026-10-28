// Case Admin lane repair (WORKBENCH-DESIGN.md §7.10; WB-16, WB-D4 [provisional]): the ONLY admin-route write in the
// Workbench, and the only caller of the SDK's updateAdminItem (guards.spec.ts).
//
// Offered only when: the user is Case Admin (with RMM), rung 1 is available for CIQ_Case_A00, the case is past the
// join (S5, S6, S7 or S8), lane D is active and reads incomplete, and an F8 `lane.completed` row exists for this
// case, cycle and D. Writes, in order: (1) F8 `lane.repaired` (verified, else stop); (2) updateAdminItem with ONLY the
// snapshot's fields that are in ADMIN_WRITE_ALLOW["lane.repair"][D] (lane fields minus counts); (3) read back with
// getAdminItem and compare, up to 3 re-applies, on the item's queue. Never for any other field, flow or purpose.
import { ADMIN_REPAIR_FLOW, adminRepairFields, fieldType, LocalGuardError, type Dept, type FlowId } from "../schema";
import { errorText } from "../kf/sdk";
import { writeAudit } from "./audit";
import { isTimeout } from "./client";
import { sameValue, writeValue } from "./normalize";
import { adminRungAllowed, boundRuntime, type Runtime } from "./runtime";
import type { AuditVM, CaseVM, SaveResult } from "./viewModels";
import { itemKey } from "./writeQueue";
import { DEPT_LABEL } from "../domain/labels";

const PAST_JOIN = new Set(["CASE_S5", "CASE_S6", "CASE_S7", "CASE_S8"]);
const MAX_REAPPLY = 3;

/** Throws LocalGuardError (before anything is sent) for any key outside the lane.repair allow-list for D. */
export function assertRepairFields(d: Dept, keys: string[]): void {
  const allow = adminRepairFields(d);
  const bad = keys.filter((k) => !allow.includes(k));
  if (bad.length) throw new LocalGuardError(`admin lane repair may write only ${d} lane fields; refused: ${bad.join(", ")}`);
  if (!keys.length) throw new LocalGuardError("admin lane repair with no field");
}

/** Why the repair is not offered (null = offered). */
export function repairBlocker(rt: Runtime, c: CaseVM, d: Dept, snapshot: AuditVM | null): string | null {
  if (!rt.caps().isCaseAdmin) return "Only a Case administrator (who also holds the Raw Material Manager (RMM) role) can restore a department review's sign-off.";
  if (!adminRungAllowed(rt, ADMIN_REPAIR_FLOW)) return "Restoring a sign-off needs the full case list, which is not available in this view.";
  if (!c.currentSteps.some((s) => PAST_JOIN.has(s))) return "The case is not past the department review.";
  const lane = c.lanes[d];
  if (!lane.active) return `The ${DEPT_LABEL[d]} review is not active.`;
  if (lane.complete) return `The ${DEPT_LABEL[d]} review is complete.`;
  if (!snapshot) return `No completion of the ${DEPT_LABEL[d]} review is recorded.`;
  if (snapshot.actionCode !== "lane.completed" || snapshot.caseItemId !== c._id || snapshot.objectKey !== `${c.caseCode}:lane:${d}` || (c.cycleNo !== null && snapshot.cycleNo !== null && snapshot.cycleNo !== c.cycleNo))
    return `The recorded completion does not belong to the ${DEPT_LABEL[d]} review of this case.`;
  return null;
}

/** The allow-listed values of a snapshot for lane D (anything else in the snapshot is ignored). */
export function repairValues(d: Dept, snapshot: AuditVM): Record<string, unknown> {
  const snap = snapshot.snapshot && typeof snapshot.snapshot === "object" ? (snapshot.snapshot as Record<string, unknown>) : {};
  const allow = adminRepairFields(d);
  return Object.fromEntries(Object.entries(snap).filter(([k, v]) => allow.includes(k) && v !== null && v !== undefined && v !== ""));
}

/** The admin write itself: allow-list asserted, then write → read back → re-apply (≤3), on the item's chain. */
export async function adminLaneWrite(rt: Runtime, caseId: string, d: Dept, values: Record<string, unknown>): Promise<SaveResult> {
  const keys = Object.keys(values);
  assertRepairFields(d, keys); // before anything is sent
  const flow = ADMIN_REPAIR_FLOW;
  const body: Record<string, unknown> = {};
  for (const k of keys) body[k] = writeValue(fieldType(flow, k), values[k]);
  const key = itemKey(flow, caseId);
  return rt.queue.enqueue(key, async (): Promise<SaveResult> => {
    const res = await adminWriteOnChain(rt, flow, caseId, key, body);
    rt.queue.recordSave(key, res.ok); // WL-03: the save outcome, not a thrown call
    return res;
  });
}

async function adminWriteOnChain(rt: Runtime, flow: FlowId, caseId: string, key: string, body: Record<string, unknown>): Promise<SaveResult> {
  let pending = { ...body };
  for (let attempt = 1; attempt <= 1 + MAX_REAPPLY; attempt++) {
    try {
      await rt.client.call(() => {
        const p = rt.client.process(flow);
        if (typeof p.updateAdminItem !== "function") throw new Error("updateAdminItem is not available");
        return p.updateAdminItem({ instanceId: caseId, data: pending });
      });
    } catch (e) {
      if (isTimeout(e)) {
        rt.queue.markUncertain(key, { kind: "write", patch: { fields: pending, tables: {} } });
        return { ok: false, kind: "timeout", message: `Kissflow did not answer within 30 s. This item is locked for saving until you press Re-read.` };
      }
      return { ok: false, kind: "refused", message: errorText(e) };
    }
    let back;
    try {
      back = await rt.client.getAdminItem(flow, caseId);
    } catch (e) {
      return { ok: false, kind: "not-kept", missing: Object.keys(pending), message: `The repair was sent, but the case could not be read back (${errorText(e)}).` };
    }
    pending = Object.fromEntries(Object.entries(pending).filter(([k, v]) => !sameValue(fieldType(flow, k), v, back[k])));
    if (!Object.keys(pending).length) return { ok: true, kind: "ok", attempts: attempt, item: back };
  }
  return { ok: false, kind: "not-kept", missing: Object.keys(pending), message: `Kissflow did not keep: ${Object.keys(pending).join(", ")} after ${MAX_REAPPLY} retries.` };
}

export async function repairLaneRt(rt: Runtime, c: CaseVM, d: Dept, snapshot: AuditVM, reason: string): Promise<SaveResult> {
  if (!reason.trim()) return { ok: false, kind: "refused", message: "A reason is required to restore a sign-off." };
  const blocker = repairBlocker(rt, c, d, snapshot);
  if (blocker) return { ok: false, kind: "refused", message: blocker };
  const values = repairValues(d, snapshot);
  assertRepairFields(d, Object.keys(values));
  const current = Object.fromEntries(Object.keys(values).map((k) => [k, c.v[k] ?? null]));
  try {
    await writeAudit(rt, {
      category: "Case",
      actionCode: "lane.repaired",
      caseCode: c.caseCode,
      cycleNo: c.cycleNo,
      caseItemId: c._id,
      objectKind: "Case",
      objectItemId: c._id,
      objectKey: snapshot.eventKey,
      oldValueText: JSON.stringify(current),
      newValueText: JSON.stringify(values),
      eventReason: reason,
    });
  } catch (e) {
    return { ok: false, kind: "refused", message: `The repair could not be recorded, so nothing was written (${errorText(e)}).` };
  }
  const res = await adminLaneWrite(rt, c._id, d, values);
  if (res.ok) rt.changed();
  return res;
}

/** §12.2 signature (bound runtime). */
export const repairLane = (c: CaseVM, d: Dept, snapshot: AuditVM, reason: string): Promise<SaveResult> => repairLaneRt(boundRuntime(), c, d, snapshot, reason);
