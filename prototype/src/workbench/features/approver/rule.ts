// Overall approval at CASE_S6 (§8.12; BR-035, brd L788; WB-D1, WB-D8 [provisional]). Pure, unit-tested.
//
// - Effective decision per ACTIVE SAF/REG lane: the Late_Decision of the newest Accepted "Department review" point with
//   OP_Dept = D for this case (newest by Reviewed_At), else <D>_RMES_Decision (T0 counts.effectiveDecision).
// - That later-decision check needs EVERY point of the case. If the point list is partial (rung 3 / index / failed /
//   unreadable rows), the counts policy decides: fail-closed → "Approved" stays disabled; attest → the approver may
//   attest (F8 count.attested, Object_Key <Case_Code>:approval) and the decision then uses the points that ARE visible
//   (falling back to <D>_RMES_Decision when none is visible).
// - "Approved" only when every active SAF/REG lane's effective decision is "Approved".
// - "Rejected" needs Overall_Reason, writes a neutral Supplier_Closing_Text and Completion_Trigger "Overall rejection".
import { effectiveDecision, listUnread, pointBelongsTo } from "../../data/counts";
import { CLEAR, isBlank } from "../../data/normalize";
import type { CaseVM, Check, ListRead, Patch, PointVM, Problem, RawItem, Unread } from "../../data/viewModels";
import type { CountsPolicy } from "../../domain/flags";
import type { PinnedConfig, TextBundlePayload } from "../../domain/config";
import { parseTextBundle } from "../../domain/config";
import { DEPT_LABEL } from "../../domain/labels";

export type DecisionDept = "SAF" | "REG";
export const DECISION_DEPTS: DecisionDept[] = ["SAF", "REG"];
export const OVERALL_REJECTION = "Overall rejection";

export interface LaterRead {
  confidence: "complete" | "partial";
  unread: Unread[];
}

/**
 * Is the case's point list complete enough to know every later Department-review decision? Same rule as the counts
 * (WB-5): rung 1 or a proven viewer route, no index-only point, and every point of the case readable enough
 * (status, kind; a completed Department-review point for SAF/REG must show its outcome).
 */
export function laterDecisionRead(c: Pick<CaseVM, "_id">, list: Pick<ListRead<PointVM>, "rows" | "quality" | "viewerProven" | "indexOnly">): LaterRead {
  const ours = list.rows.filter((p) => pointBelongsTo(p, c));
  const unread: Unread[] = listUnread("CIQ_Open_Point_A00", list, ours.length);
  for (const p of ours) {
    const name = p.opKey || p._id;
    if (list.indexOnly.has(p._id) || p.readQuality === "index") unread.push({ flow: "CIQ_Open_Point_A00", rung: "index", reason: `${name}: known only from the index` });
    else if (p.status === "unknown") unread.push({ flow: "CIQ_Open_Point_A00", rung: "item", reason: `${name}: status not readable` });
    else if (!p.kind) unread.push({ flow: "CIQ_Open_Point_A00", rung: "item", reason: `${name}: kind not readable` });
    else if (p.kind === "Department review" && (p.dept === "SAF" || p.dept === "REG") && p.status === "completed" && !p.outcome)
      unread.push({ flow: "CIQ_Open_Point_A00", rung: "item", reason: `${name}: outcome not readable` });
  }
  return { confidence: unread.length ? "partial" : "complete", unread };
}

export interface LaneDecision {
  dept: DecisionDept;
  decision: "Approved" | "Rejected" | null;
  source: "late" | "rmes";
  /** The point whose Late_Decision won (source "late"). */
  latePoint?: Pick<PointVM, "_id" | "opKey" | "reviewedAt" | "lateDecisionReason">;
  rmesDecision: string;
  rmesReason: string;
}

export interface ApprovalRule {
  lanes: LaneDecision[];
  read: LaterRead;
  policy: CountsPolicy;
  attested: boolean;
  canApprove: boolean;
  /** Why "Approved" is disabled: the read (fail-closed), a pending attestation, or a lane decision. */
  blockedBy: "read" | "attest" | "decisions" | null;
  why: string[];
}

const PARTIAL_NOTE = "Later department-review decisions could not be read with your access";

export function laneDecisions(c: CaseVM, points: PointVM[]): LaneDecision[] {
  return DECISION_DEPTS.filter((d) => c.lanes[d].active).map((d) => {
    const e = effectiveDecision(c, d, points);
    const late =
      e.source === "late"
        ? points
            .filter((p) => pointBelongsTo(p, c) && p.kind === "Department review" && p.dept === d && p.outcome === "Accepted" && !isBlank(p.lateDecision))
            .sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)))[0]
        : undefined;
    return {
      dept: d,
      decision: e.decision,
      source: e.source,
      latePoint: late ? { _id: late._id, opKey: late.opKey, reviewedAt: late.reviewedAt, lateDecisionReason: late.lateDecisionReason } : undefined,
      rmesDecision: c.lanes[d].rmesDecision ?? "",
      rmesReason: c.lanes[d].rmesDecisionReason ?? "",
    };
  });
}

export function approvalRule(o: { c: CaseVM; points: Pick<ListRead<PointVM>, "rows" | "quality" | "viewerProven" | "indexOnly">; policy: CountsPolicy; attested?: boolean }): ApprovalRule {
  const { c, points, policy } = o;
  const attested = !!o.attested && policy === "attest";
  const lanes = laneDecisions(c, points.rows);
  // Without an active SAF/REG lane there is no RMES decision to check, so the point list does not matter.
  const read: LaterRead = lanes.length ? laterDecisionRead(c, points) : { confidence: "complete", unread: [] };
  const why: string[] = [];
  let blockedBy: ApprovalRule["blockedBy"] = null;
  if (read.confidence === "partial" && !attested) {
    blockedBy = policy === "attest" ? "attest" : "read";
    why.push(policy === "attest" ? `${PARTIAL_NOTE}: attest to continue.` : `${PARTIAL_NOTE}.`);
  }
  for (const l of lanes)
    if (l.decision !== "Approved") {
      why.push(`${DEPT_LABEL[l.dept]} decision is ${l.decision ? `"${l.decision}"` : "not recorded"}${l.source === "late" ? " (later department review)" : ""}.`);
      blockedBy ??= "decisions";
    }
  return { lanes, read, policy, attested, canApprove: why.length === 0, blockedBy, why };
}

export interface DecisionInput {
  decision: "Approved" | "Rejected";
  reason: string;
  closingText: string;
}

/** The S6 write (Editable/Mandatory at CASE_S6 only: Overall_Decision, Overall_Reason, Overall_Decided_By,
 *  Supplier_Closing_Text, Completion_Trigger). A switch back to "Approved" clears a stale "Overall rejection". */
export function buildApprovalPatch(c: Pick<CaseVM, "completionTrigger">, i: DecisionInput, me: { _id: string }): Patch {
  const fields: Patch["fields"] = { Overall_Decision: i.decision, Overall_Decided_By: { _id: me._id } };
  if (i.decision === "Rejected") {
    fields.Overall_Reason = i.reason.trim();
    fields.Supplier_Closing_Text = i.closingText.trim();
    fields.Completion_Trigger = OVERALL_REJECTION;
  } else {
    if (i.reason.trim()) fields.Overall_Reason = i.reason.trim();
    if (c.completionTrigger === OVERALL_REJECTION) fields.Completion_Trigger = CLEAR;
  }
  return { fields };
}

/** Client problems before writing anything (shown by field label). */
export function decisionProblems(i: Partial<DecisionInput>, rule: Pick<ApprovalRule, "canApprove" | "why">): Problem[] {
  const out: Problem[] = [];
  if (!i.decision) out.push({ field: "Overall_Decision", label: "Overall decision", message: "Choose Approved or Rejected." });
  if (i.decision === "Approved" && !rule.canApprove) out.push({ field: "Overall_Decision", label: "Overall decision", message: `"Approved" is not possible: ${rule.why.join(" ")}` });
  if (i.decision === "Rejected" && !i.reason?.trim()) out.push({ field: "Overall_Reason", label: "Overall reason", message: "A reason is required to reject." });
  if (i.decision === "Rejected" && !i.closingText?.trim()) out.push({ field: "Supplier_Closing_Text", label: "Supplier closing text", message: "A neutral closing text is required on a rejection." });
  return out;
}

/** The extra pre-submit check on the FRESH server read (submitStep, §7.3 step 3). */
export function approvalCheck(rule: Pick<ApprovalRule, "canApprove" | "why">): Check {
  return (fresh: RawItem): Problem[] => {
    const out: Problem[] = [];
    const d = fresh.Overall_Decision;
    if (d === "Approved" && !rule.canApprove) out.push({ field: "Overall_Decision", label: "Overall decision", message: `"Approved" is not possible: ${rule.why.join(" ")}` });
    if (d === "Rejected") {
      if (isBlank(fresh.Overall_Reason)) out.push({ field: "Overall_Reason", label: "Overall reason", message: "A reason is required to reject." });
      if (fresh.Completion_Trigger !== OVERALL_REJECTION) out.push({ field: "Completion_Trigger", label: "Completion trigger", message: `Completion trigger must read "${OVERALL_REJECTION}" on a rejection.` });
      if (isBlank(fresh.Supplier_Closing_Text)) out.push({ field: "Supplier_Closing_Text", label: "Supplier closing text", message: "A neutral closing text is required on a rejection." });
    }
    return out;
  };
}

/** [convention] Text-bundle key of the neutral closing text on an overall rejection. */
export const OVERALL_REJECTION_TEXT_KEY = "closing.overallRejection";
export const DEFAULT_CLOSING_TEXT =
  "Thank you for the information you provided for this raw material. After review, Beiersdorf will not continue this qualification at this time. No further action is needed from you on this request.";

/** The prefill: the pinned release's Text bundle entry, else the built-in neutral text. */
export function closingTextFrom(pinned: Pick<PinnedConfig, "manifest" | "rows"> | null): { text: string; source: "bundle" | "default" } {
  const e = pinned?.manifest.find((m) => m.kind === "Text bundle");
  const row = e ? pinned!.rows.get(e.configKey) : undefined;
  if (row) {
    const p = parseTextBundle(row.payloadJson);
    const t = p.ok ? (p.value as TextBundlePayload).texts[OVERALL_REJECTION_TEXT_KEY] : undefined;
    if (t && t.trim()) return { text: t, source: "bundle" };
  }
  return { text: DEFAULT_CLOSING_TEXT, source: "default" };
}

/** "Upcoming" (§8.12): cases in Part 2 that need overall approval, when their position is readable. */
export function isUpcoming(c: Pick<CaseVM, "overallApprovalRequired" | "currentSteps" | "cancelled">): boolean {
  return c.overallApprovalRequired && !c.cancelled && c.currentSteps.some((s) => s === "CASE_PAR" || s.startsWith("CASE_B_"));
}

/** An attestation by this user for this case's approval already exists (an F8 count.attested row). */
export function attestedBefore(events: readonly { actionCode: string; objectKey: string; caseItemId: string; actorEmail: string; cycleNo: number | null }[], c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo">, me: { Email: string }): boolean {
  return events.some(
    (e) =>
      e.actionCode === "count.attested" &&
      e.objectKey === `${c.caseCode}:approval` &&
      e.caseItemId === c._id &&
      !!me.Email &&
      e.actorEmail.toLowerCase() === me.Email.toLowerCase() &&
      (c.cycleNo === null || e.cycleNo === null || e.cycleNo === c.cycleNo),
  );
}
