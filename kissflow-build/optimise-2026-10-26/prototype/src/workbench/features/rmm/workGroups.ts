// My work (WORKBENCH-DESIGN.md §8.1): pure grouping of the HELD tasks (ground rule 13: possession, not role, decides)
// and the rung-1 tiles. An OPNT_S1 task is here only because this user holds it (after K-FA: the point's
// Responsible_User).
import type { StepIr } from "../../schema";
import type { AuditVM, CaseVM, CrVM, PointVM, TaskVM } from "../../data/viewModels";

export const MANUAL_STEPS: StepIr[] = ["CASE_S1", "CASE_S3", "CASE_S7", "OPNT_S1"];
export const DECIDE_STEPS: StepIr[] = ["CASE_S2", "CASE_S5", "CASE_S8", "CASE_B_RMM", "OPNT_R_RMM", "CHRQ_S1"];

const byDue = (a: TaskVM, b: TaskVM) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title);

export interface MyWorkGroups {
  /** "Record supplier steps (manual)": S1, S3, S7, OPNT_S1. */
  manual: TaskVM[];
  /** "Decide and check": S2, S5, S8, B_RMM, OPNT_R_RMM, CHRQ_S1. */
  decide: TaskVM[];
  /** Every other task the user holds (other roles' steps, unidentified steps): listed so nothing held is lost. */
  other: TaskVM[];
}

export function groupMyWork(tasks: TaskVM[]): MyWorkGroups {
  const manual: TaskVM[] = [];
  const decide: TaskVM[] = [];
  const other: TaskVM[] = [];
  for (const t of tasks) {
    if (t.step && MANUAL_STEPS.includes(t.step)) manual.push(t);
    else if (t.step && DECIDE_STEPS.includes(t.step)) decide.push(t);
    else other.push(t);
  }
  return { manual: manual.sort(byDue), decide: decide.sort(byDue), other: other.sort(byDue) };
}

/** "Stray rejected points/CRs" (brd L937): native Reject is off on points and CRs, so any Rejected one is stray. */
export function strayRejected(points: PointVM[], crs: CrVM[]): (PointVM | CrVM)[] {
  return [...points.filter((p) => p.status === "rejected"), ...crs.filter((c) => c.status === "rejected")];
}

/** "Ended without cancellation event" (brd L845): Rejected/Withdrawn cases without an F8 Cancellation row. */
export function endedWithoutCancellation(cases: CaseVM[], events: AuditVM[]): CaseVM[] {
  const cancelled = new Set(events.filter((e) => e.category === "Cancellation" && e.caseItemId).map((e) => e.caseItemId));
  return cases.filter((c) => c.readQuality !== "index" && (c.status === "rejected" || c.status === "withdrawn") && !cancelled.has(c._id));
}

/** The case a task belongs to, for the row's Trade_Name / Supplier_Legal_Name (joined from the case list). */
export function caseOfTask(t: TaskVM, cases: CaseVM[] | undefined): CaseVM | undefined {
  const id = t.flow === "CIQ_Case_A00" ? t.instanceId : t.caseItemId;
  if (id) return cases?.find((c) => c._id === id);
  if (t.caseCode) return cases?.find((c) => c.caseCode === t.caseCode && (t.cycleNo === null || t.cycleNo === undefined || c.cycleNo === t.cycleNo));
  return undefined;
}
