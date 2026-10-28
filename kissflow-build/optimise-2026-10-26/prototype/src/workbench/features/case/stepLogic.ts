// Pure logic and small orchestrations of the case step panels (WORKBENCH-DESIGN.md §8.4–§8.5). The panels render
// over these; the unit tests (stepLogic.spec.ts) run them against T0's real actions on the fake host.
//
//   - stepper position (v4 order, S6 before S7);
//   - the S5 lane check: every active lane passes by (a) confirmation + completed-at (D35) OR (b) an Accepted
//     "Department review" point of that department whose OP_Key appears in Late_Completions_Text (brd L930);
//   - "Record late completion" text; the newest lane.completed snapshot per lane (repair source, §7.10);
//   - S3: "Supplier confirmed at" → Completeness_At AND RMES_Created_At (Y4 copies Confirmed_At into both);
//   - S7: refresh counts first (complete → written; partial → CLEARED so S8 runs), then save, then submit;
//   - S5/S8 override: the F8 hold.override row FIRST (verified), then the override reason.
import { DEPTS, fieldLabel, type Dept, type StepIr } from "../../schema";
import { CASE_STEPPER, DEPT_LABEL } from "../../domain/labels";
import { isBlank, kfDateTime } from "../../data/normalize";
import type { Actions, RefreshResult } from "../../data/actions";
import type { AuditInput, AuditVM, CaseVM, Check, Patch, PointVM, Problem, SaveResult, SubmitResult, TaskRef } from "../../data/viewModels";

// ---------------------------------------------------------------- stepper

export type StepperKey = StepIr | "END";

/** The stepper steps for a case: S6 only when Overall_Approval_Required = "Yes" (or the case sits there). */
export function stepperSteps(c: Pick<CaseVM, "overallApprovalRequired" | "currentSteps">): { key: string; label: string }[] {
  return CASE_STEPPER.filter((s) => s.key !== "CASE_S6" || c.overallApprovalRequired || c.currentSteps.includes("CASE_S6"));
}

/** Where the case stands on the stepper: "END" when Completed, CASE_PAR for any Part 2 branch, else the first known
 *  step in v4 order; null when the position is not readable. */
export function stepperKey(c: Pick<CaseVM, "status" | "currentSteps">): StepperKey | null {
  if (c.status === "completed") return "END";
  const s = c.currentSteps;
  if (s.some((x) => x === "CASE_PAR" || x.startsWith("CASE_B_"))) return "CASE_PAR";
  for (const st of CASE_STEPPER) if (st.key !== "END" && s.includes(st.key)) return st.key;
  return null;
}

/** A short text for a case's position (lists): "Part 2 – review (REG, SAF)", a step name, or "". */
export function positionText(c: Pick<CaseVM, "status" | "currentSteps" | "lanes">, stepName: (s: StepIr) => string): string {
  if (c.status === "completed") return "Completed";
  const branches = c.currentSteps.filter((x) => x.startsWith("CASE_B_")).map((x) => x.slice("CASE_B_".length));
  if (branches.length || c.currentSteps.includes("CASE_PAR")) return `Part 2 – review${branches.length ? ` (${branches.join(", ")})` : ""}`;
  const k = stepperKey(c);
  return k && k !== "END" ? stepName(k) : "";
}

// ---------------------------------------------------------------- lanes

export const laneSnapshotKey = (caseCode: string, d: Dept): string => `${caseCode}:lane:${d}`;

/** The newest F8 lane.completed snapshot for lane D of this case and cycle (the repair source, §7.10). */
export function newestLaneSnapshot(events: AuditVM[], c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo">, d: Dept): AuditVM | null {
  return (
    events
      .filter((e) => e.actionCode === "lane.completed" && e.caseItemId === c._id && e.objectKey === laneSnapshotKey(c.caseCode, d) && (c.cycleNo === null || e.cycleNo === null || e.cycleNo === c.cycleNo))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] ?? null
  );
}

/** Accepted "Department review" points of the case for lane D, newest first. */
export function acceptedDeptReviews(points: PointVM[], caseId: string, d: Dept): PointVM[] {
  return points
    .filter((p) => p.caseItemId === caseId && p.kind === "Department review" && p.dept === d && p.outcome === "Accepted")
    .sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)));
}
/** Open (not Accepted/Withdrawn) "Department review" points of the case for lane D. */
export function openDeptReviews(points: PointVM[], caseId: string, d: Dept): PointVM[] {
  return points.filter((p) => p.caseItemId === caseId && p.kind === "Department review" && p.dept === d && p.outcome !== "Accepted" && p.outcome !== "Withdrawn" && p.status !== "rejected" && p.status !== "withdrawn");
}

export interface LaneCheckRow {
  dept: Dept;
  active: boolean;
  pass: boolean;
  via: "confirmed" | "late-completion" | null;
  /** The Accepted Department-review point that passes (b), or the newest one not yet recorded. */
  point?: PointVM;
  reason?: string;
}

const yes = (v: unknown) => String(v ?? "").trim() === "Yes";

/**
 * The S5 lane check (§8.5) on a FRESH server read. Every active lane D passes when either
 *   (a) <D>_Review_Confirm = "Confirmed" and <D>_Completed_At is set (D35), or
 *   (b) an Accepted "Department review" point with OP_Dept = D exists for the case AND its OP_Key appears in
 *       Late_Completions_Text (brd L930).
 * An Accepted point whose OP_Key is not in Late_Completions_Text does NOT pass.
 */
export function laneCheck(fresh: Record<string, unknown>, points: PointVM[], caseId: string): LaneCheckRow[] {
  const late = String(fresh.Late_Completions_Text ?? "");
  return DEPTS.map((d): LaneCheckRow => {
    const active = yes(fresh[`Dept_${d}_Active`]);
    if (!active) return { dept: d, active, pass: true, via: null };
    if (String(fresh[`${d}_Review_Confirm`] ?? "") === "Confirmed" && !isBlank(fresh[`${d}_Completed_At`])) return { dept: d, active, pass: true, via: "confirmed" };
    const accepted = acceptedDeptReviews(points, caseId, d);
    const recorded = accepted.find((p) => !!p.opKey && late.includes(p.opKey));
    if (recorded) return { dept: d, active, pass: true, via: "late-completion", point: recorded };
    if (accepted.length) return { dept: d, active, pass: false, via: null, point: accepted[0], reason: `${DEPT_LABEL[d]}: the accepted department review ${accepted[0].opKey || accepted[0]._id} is not recorded as a late completion yet` };
    return { dept: d, active, pass: false, via: null, reason: `${DEPT_LABEL[d]}: the review is not confirmed and no accepted department review point is recorded` };
  });
}

export function laneCheckProblems(rows: LaneCheckRow[]): Problem[] {
  return rows.filter((r) => r.active && !r.pass).map((r) => ({ label: `${DEPT_LABEL[r.dept]} review`, message: r.reason ?? `The ${DEPT_LABEL[r.dept]} review is not complete.` }));
}

/** The extraCheck for submitStep at CASE_S5. */
export const laneCheckExtra =
  (points: PointVM[], caseId: string): Check =>
  (fresh) =>
    laneCheckProblems(laneCheck(fresh, points, caseId));

/** `D · <Reviewed_By name> · <Reviewed_By_Email> · <Reviewed_At> · <OP_Key>` (brd L930). */
export function lateCompletionLine(d: Dept, p: Pick<PointVM, "reviewedBy" | "reviewedByEmail" | "reviewedAt" | "opKey">): string {
  return [d, p.reviewedBy?.name ?? "", p.reviewedByEmail, p.reviewedAt, p.opKey].join(" · ");
}
/** Appends a late-completion line once (an OP_Key already present is not added again). */
export function appendLateCompletion(text: string, line: string, opKey: string): string {
  if (opKey && text.includes(opKey)) return text;
  const t = text.trim();
  return t ? `${t}\n${line}` : line;
}

// ---------------------------------------------------------------- manual supplier timestamps (WB-10, WB-D12)

/** A local <input type="datetime-local"> value → Kissflow DateTime (no ms). Null when not a valid time. */
export function manualTime(localInput: string): string | null {
  if (!localInput || !localInput.trim()) return null;
  const d = new Date(localInput);
  return isNaN(d.getTime()) ? null : kfDateTime(d);
}

/** S3 (Y4 fallback): the typed "Supplier confirmed at" goes to BOTH Completeness_At and RMES_Created_At (brd L1302). */
export function s3Patch(confirmedAtLocal: string, others: Record<string, unknown> = {}): Patch {
  const v = manualTime(confirmedAtLocal);
  if (!v) throw new Error("Supplier confirmed at is required.");
  const rest = { ...others };
  delete rest.Completeness_At;
  delete rest.RMES_Created_At;
  return { fields: { ...rest, Completeness_At: v, RMES_Created_At: v } };
}

// ---------------------------------------------------------------- S3: department flags only grow (F4)

/** The department flags of a case. At S3 they are never shown as a free Yes/No/blank input. */
export const DEPT_FLAG_FIELDS: string[] = DEPTS.map((d) => `Dept_${d}_Active`);

/** Departments that can still be ADDED at S3: every department not active on the server. */
export const s3AddableDepts = (c: Pick<CaseVM, "v">): Dept[] => DEPTS.filter((d) => c.v[`Dept_${d}_Active`] !== "Yes");

/**
 * S3 (Y4 fallback, F4): the scope may still grow while Part 1 runs, but never shrink (brd L783: "extend with a
 * justification, never reduce"). Only a department that is not active on the SERVER can be added (No/blank → Yes),
 * and only with a reason; a flag is never written as No or blank here.
 */
export function s3DeptAdditions(c: Pick<CaseVM, "v">, add: Dept[], reason: string): { fields: Record<string, "Yes">; added: Dept[]; problems: Problem[] } {
  const addable = s3AddableDepts(c);
  const added = DEPTS.filter((d) => add.includes(d) && addable.includes(d));
  const problems: Problem[] = added.length && !reason.trim() ? [{ field: "deptReason", label: "Reason for added departments", message: `A reason is required to add ${added.map((d) => DEPT_LABEL[d]).join(", ")} to the review.` }] : [];
  return { fields: Object.fromEntries(added.map((d) => [`Dept_${d}_Active`, "Yes" as const])), added, problems };
}

/** The F8 row recording why departments were added at S3 (written BEFORE the flags, like every reasoned change). */
export function deptAddedEvent(c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo">, added: Dept[], reason: string): AuditInput {
  return { category: "Scope", actionCode: "scope.dept.added", caseCode: c.caseCode, cycleNo: c.cycleNo, caseItemId: c._id, objectKind: "Case", objectItemId: c._id, objectKey: `${c.caseCode}:scope`, newValueText: added.join(", "), eventReason: reason.trim() };
}

export interface S7Input {
  /** datetime-local value of "Supplier released at". */
  releasedAt: string;
  /** The reason in "Manual by RMM: <reason>". */
  reason: string;
  /** Optional S7 fields the user changed (exactly editableAt(CASE_S7) minus the panel's own). */
  others?: Record<string, unknown>;
}
export function s7Problems(i: S7Input): Problem[] {
  const out: Problem[] = [];
  if (!manualTime(i.releasedAt)) out.push({ field: "Final_Release_At", label: "Supplier released at", message: "Supplier released at is required (manual record: when the supplier released, not when you type it)." });
  if (!i.reason.trim()) out.push({ field: "Completion_Trigger", label: "Reason", message: "A reason is required for a manual completion (Completion trigger)." });
  return out;
}
export function s7Patch(i: S7Input): Patch {
  const rest = { ...(i.others ?? {}) };
  for (const k of ["Final_Release_At", "Completion_Trigger", "Open_Items_Count", "Open_CR_Count"]) delete rest[k];
  return { fields: { ...rest, Final_Release_At: manualTime(i.releasedAt)!, Completion_Trigger: `Manual by RMM: ${i.reason.trim()}` } };
}
/** The client rule at S7: Final_Release_At must be set on the server before the submit. */
export const finalReleaseAtCheck: Check = (fresh) => (isBlank(fresh.Final_Release_At) ? [{ field: "Final_Release_At", label: fieldLabel("CIQ_Case_A00", "Final_Release_At"), message: "Supplier released at is not saved yet." }] : []);

export interface S7Run {
  stage: "problems" | "counts" | "save" | "submit";
  problems?: Problem[];
  refresh?: RefreshResult;
  save?: SaveResult;
  submit?: SubmitResult;
}
export const COUNTS_CLEARED_NOTE = "Counts could not be confirmed with your access; they were cleared, so the close check will run.";

/**
 * The S7 "Supplier released (manual record)" submit (§8.5, D27/D30): client checks first (nothing is sent on a
 * problem), then "Refresh counts" (complete → written; partial → both counts CLEARED so CASE_S8 runs, §7.9), then the
 * manual-record save, then submitStep (Mandatory S7 + Final_Release_At).
 */
export async function runS7(actions: Pick<Actions, "refreshCaseCounts" | "saveAtStep" | "submitStep">, task: TaskRef, c: CaseVM, input: S7Input, o: { refreshed?: boolean; saved?: boolean } = {}): Promise<S7Run> {
  const problems = s7Problems(input);
  if (problems.length) return { stage: "problems", problems };
  // counts first, unless refreshed in this panel already (a partial refresh at S7 has cleared them)
  let refresh: RefreshResult | undefined;
  if (!o.refreshed) {
    refresh = await actions.refreshCaseCounts(task, c, "case");
    if (!refresh.ok) return { stage: "counts", refresh };
  }
  // the manual record, unless it is saved already (by the Workbench, or in the Kissflow form after a K-WB refusal)
  let save: SaveResult | undefined;
  if (!o.saved) {
    save = await actions.saveAtStep(task, s7Patch(input));
    if (!save.ok) return { stage: "save", refresh, save };
  }
  const submit = await actions.submitStep(task, { extraChecks: [finalReleaseAtCheck] });
  return { stage: "submit", refresh, save, submit };
}

// ---------------------------------------------------------------- holds (S5 / S8)

export const HOLD = {
  CASE_S5: { override: "Hold_Override_Reason_Release", gate: "Open_Items_Gate_Release", action: "hold.override.release", key: "hold:release" },
  CASE_S8: { override: "Hold_Override_Reason_Close", gate: "Open_Items_Gate_Close", action: "hold.override.close", key: "hold:close" },
} as const;
export type HoldStep = keyof typeof HOLD;
export const isHoldStep = (s: StepIr | null | undefined): s is HoldStep => s === "CASE_S5" || s === "CASE_S8";

export interface OverrideRun {
  ok: boolean;
  stage: "problems" | "audit" | "save";
  message: string;
  save?: SaveResult;
  gate?: string;
  /** The override text whose F8 row was written in this run (so a retry does not record it twice). */
  recorded?: string;
}
/**
 * The S5/S8 save (§7.8 j09): when the override reason changed (and is not blank), the F8 `hold.override.*` row is
 * written FIRST and must be verified; then the override reason and the other changed fields are saved in one write.
 * The gate is read from the server read-back.
 */
export async function runHoldSave(actions: Pick<Actions, "writeAudit" | "saveAtStep">, task: TaskRef & { step: HoldStep }, c: CaseVM, o: { override?: string; others?: Record<string, unknown>; alreadyRecorded?: string }): Promise<OverrideRun> {
  const h = HOLD[task.step];
  const reason = (o.override ?? "").trim();
  const overrideChanged = !!reason && reason !== String(c.v[h.override] ?? "").trim();
  const fields: Record<string, unknown> = { ...(o.others ?? {}) };
  delete fields[h.override];
  let recorded: string | undefined;
  if (overrideChanged) {
    if (o.alreadyRecorded !== reason) {
      try {
        await actions.writeAudit({ category: "Case", actionCode: h.action, caseCode: c.caseCode, cycleNo: c.cycleNo, caseItemId: c._id, objectKind: "Case", objectItemId: c._id, objectKey: `${c.caseCode}:${h.key}`, eventReason: reason });
      } catch (e) {
        return { ok: false, stage: "audit", message: `The override could not be recorded, so nothing was saved (${e instanceof Error ? e.message : String(e)}).` };
      }
      recorded = reason;
    } else recorded = reason;
    fields[h.override] = reason;
  }
  if (!Object.keys(fields).length) return { ok: false, stage: "problems", message: "Nothing changed since the last save." };
  const save = await actions.saveAtStep(task, { fields });
  if (!save.ok) return { ok: false, stage: "save", message: overrideChanged ? "The override event is recorded, but the values were not saved." : "The values were not saved.", save, recorded };
  const gate = String(save.item[h.gate] ?? "");
  const ready = gate === "OK" ? "Yes" : "No";
  const msg = overrideChanged ? `Reason recorded. Ready to continue: ${ready}.` : `Saved. Ready to continue: ${ready}.`;
  return { ok: true, stage: "save", message: msg, save, gate, recorded };
}

/** Override only (the F8 row first, then the reason). */
export const runHoldOverride = (actions: Pick<Actions, "writeAudit" | "saveAtStep">, task: TaskRef & { step: HoldStep }, c: CaseVM, text: string): Promise<OverrideRun> =>
  text.trim() ? runHoldSave(actions, task, c, { override: text }) : Promise.resolve({ ok: false, stage: "problems", message: "An override reason is required." });
