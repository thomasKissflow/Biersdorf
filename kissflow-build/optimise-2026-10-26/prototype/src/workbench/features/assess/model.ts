// CR assessment at CHRQ_B_<D> (§8.10), pure. Field ids come from CR_DEPT_FIELDS (generated): <D>_Assessment
// (CIQ_Impact_Resolution), <D>_Assess_Note, and <D>_Assessed_By/_At, set automatically (me, now).
import { crDeptFields, deptOfCrAssessStep, listOf, type Dept, type StepIr } from "../../schema";
import { kfDateTime } from "../../data/normalize";
import type { Patch, Problem } from "../../data/viewModels";

export const CR_FLOW = "CIQ_Change_Request_A00" as const;
export const FINDING_RAISED = "Finding raised";

export function assessDeptOf(step: StepIr | null | undefined): Exclude<Dept, "RMM"> | null {
  const d = step ? deptOfCrAssessStep(step) : null;
  return d && d !== "RMM" && crDeptFields(d) ? d : null;
}

export const assessmentOptions = (d: Exclude<Dept, "RMM">): string[] => listOf(CR_FLOW, crDeptFields(d)!.assessment);

export function assessProblems(d: Exclude<Dept, "RMM">, assessment: string): Problem[] {
  const f = crDeptFields(d)!;
  if (!assessment) return [{ field: f.assessment, label: "Assessment", message: "Choose the assessment." }];
  if (!assessmentOptions(d).includes(assessment)) return [{ field: f.assessment, label: "Assessment", message: `"${assessment}" is not an assessment value.` }];
  return [];
}

export function buildAssessPatch(d: Exclude<Dept, "RMM">, assessment: string, note: string, me: { _id: string }, now: Date): Patch {
  const f = crDeptFields(d)!;
  const fields: Record<string, unknown> = { [f.assessment]: assessment, [f.by]: { _id: me._id }, [f.at]: kfDateTime(now) };
  if (note.trim()) fields[f.note] = note.trim();
  return { fields };
}

/** Proposed_Value_JSON pretty-printed when it is JSON, else as stored. */
export function prettyJson(s: string): string {
  if (!s.trim()) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
