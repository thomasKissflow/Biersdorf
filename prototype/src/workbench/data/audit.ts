// F8 (CIQ Audit Event) rows the Workbench writes (WORKBENCH-DESIGN.md §7.8; WB-15). CREATE-ONLY:
// writeAudit = createFormRow(F8, row, "Event_Key", { reapply: false }): create → submit → verify. If the read-back
// misses fields, ONE correcting row is created (Action_Code "<code>.correction", Object_Key = the first row's
// Event_Key, every field of the first row again) and verified. A verified correction counts as the event being
// recorded; if the correction also misses fields, writeAudit fails. This module never edits or deletes an F8 row
// (guards.spec.ts checks its source).
import { eventKey } from "../domain/keys";
import { kfDateTime } from "./normalize";
import { createFormRow, ActionError } from "./creates";
import type { Runtime } from "./runtime";
import type { AuditInput } from "./viewModels";

export const F8: "CIQ_Audit_Event_A00" = "CIQ_Audit_Event_A00";

export interface Actor {
  name: string;
  email: string;
  dept: string;
  roleId: string;
}

/** The F8 row for an event (Event_At without ms; actor fields; case keys). */
export function buildAuditRow(e: AuditInput, actor: Actor, key: string, at: Date): Record<string, unknown> {
  const row: Record<string, unknown> = {
    Event_Key: key,
    Event_At: kfDateTime(at),
    Event_Category: e.category,
    Action_Code: e.actionCode,
    Actor_Side: "BDF",
    Actor_Name: actor.name,
    Actor_Email: actor.email,
    Actor_Dept: e.actorDept ?? actor.dept,
    Actor_Role_Id: e.actorRoleId ?? actor.roleId,
    Case_Code: e.caseCode,
    Cycle_No: e.cycleNo ?? undefined,
    Case_Item_Id: e.caseItemId,
    Object_Kind: e.objectKind,
    Object_Key: e.objectKey,
    Object_Item_Id: e.objectItemId,
    Object_State: e.objectState,
    Old_Value_Text: e.oldValueText,
    New_Value_Text: e.newValueText,
    Event_Reason: e.eventReason,
    Notify_Recipient: e.notifyRecipient,
    On_Behalf_Of: e.onBehalfOf,
    Config_Keys: e.configKeys,
    Source_Answers_Rev: e.sourceAnswersRev,
    Snapshot_JSON: e.snapshot === undefined ? undefined : JSON.stringify(e.snapshot),
  };
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined && v !== "" && v !== null));
}

/** The acting user for F8 rows. Actor_Dept is a CIQ_Department value ("" for roles without one). */
export function actorOf(rt: Runtime): Actor {
  const roles = rt.caps().roles;
  const dept = roles.has("ciq_rmm") ? "RMM" : roles.has("ciq_regulatory_reviewer") ? "REG" : roles.has("ciq_safety_reviewer") ? "SAF" : roles.has("ciq_qm_reviewer") ? "QM" : roles.has("ciq_microbiology_reviewer") ? "MIC" : roles.has("ciq_sustainability_reviewer") ? "SUS" : "";
  const roleIds = (rt.client.kf.user.AppRoles ?? []).map((r) => r._id).filter(Boolean);
  return { name: rt.me.Name, email: rt.me.Email, dept, roleId: roleIds.join(",") };
}

export interface AuditResult {
  itemId: string;
  correctionItemId?: string;
  eventKey: string;
}

/** Records one event, create-only. Throws ActionError when the event could not be recorded. */
export async function writeAudit(rt: Runtime, e: AuditInput): Promise<AuditResult> {
  const actor = actorOf(rt);
  const key = eventKey(rt.now(), rt.rnd);
  const row = buildAuditRow(e, actor, key, rt.now());
  const first = await createFormRow(rt, F8, row, "Event_Key", { reapply: false });
  if (!first.missing?.length) return { itemId: first.itemId, eventKey: key };
  // One correcting row: the same category, every field of the first row again, pointing at the first row.
  const corrKey = eventKey(rt.now(), rt.rnd);
  const corr = { ...row, Event_Key: corrKey, Action_Code: `${e.actionCode}.correction`, Object_Key: key };
  const second = await createFormRow(rt, F8, corr, "Event_Key", { reapply: false });
  if (second.missing?.length) throw new ActionError(`The audit event was not recorded completely (missing ${second.missing.join(", ")}, also on the correcting row).`, "not-kept");
  return { itemId: first.itemId, correctionItemId: second.itemId, eventKey: key };
}
