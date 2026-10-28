// Change requests (WORKBENCH-DESIGN.md §8.6): pure rules for the list, Triage at CHRQ_S1 and the manual CR (Y6).
//
//   - which case a CR belongs to: crBelongsTo (T0) — Case_Item_Id, or Case_Code + Cycle_No while it is blank;
//   - "released" (BR-052): Final_Release_At is set, OR the case is at CASE_S8 or Completed with Overall_Decision ≠
//     "Rejected" (it went through S7; an overall rejection skips S7 and may still reach S8). Then the outcome is
//     forced to "Refused – after final release", every impact is "No", and an F8 "Change attempt" row
//     (cr.refused.after-release) is written;
//   - ANY refused outcome sets every Impact_* to "No" (workflow CHRQ_S1 note; no Assess branch runs for a refused
//     request), and "Refused – after final release" is offered only on a released case;
//   - CR_Outcome options come from crOutcomeOptions(flags): "Accepted – scope extended" only with
//     scopeExtendedOutcome on (off for the MVP, WB-D3);
//   - the manual CR: the CHRQ_S0 fields; Portal_CR_Item_Id and Raised_By_Portal_User stay blank; the client requires
//     Case_Code, Change_Kind and Change_Reason (no field is Mandatory at S0).
import { crOutcomeOptions, type Flags } from "../../domain/flags";
import { crKey, noticeKey } from "../../domain/keys";
import { crBelongsTo } from "../../data/counts";
import type { AuditInput, CaseVM, CrDept, CrVM, Patch, Problem } from "../../data/viewModels";

export const CR_FLOW = "CIQ_Change_Request_A00" as const;
export const CR_DEPTS: CrDept[] = ["REG", "SAF", "QM", "MIC", "SUS"];
export const REFUSED_AFTER_RELEASE = "Refused – after final release";

/** BR-052: a case counts as released when any of these holds. */
export function isReleased(c: Pick<CaseVM, "finalRelease" | "currentSteps" | "status" | "overallDecision">): boolean {
  if (c.finalRelease.at) return true;
  // an overall rejection ends the case without PS-11 (S7 skipped), yet S8 may still run: not released (F5)
  if (c.overallDecision === "Rejected") return false;
  return c.currentSteps.includes("CASE_S8") || c.status === "completed";
}

/** Every refused outcome ("Refused – not valid", "Refused – after final release", …). */
export const isRefusal = (outcome: string | null | undefined): boolean => /^Refused/.test(String(outcome ?? ""));

/** The Triage outcome select: forced to the refusal after release; otherwise crOutcomeOptions(flags) without the
 *  after-release refusal (it needs a released case: F1). */
export function triageOutcomeOptions(flags: Pick<Flags, "scopeExtendedOutcome">, released: boolean): string[] {
  return released ? [REFUSED_AFTER_RELEASE] : crOutcomeOptions(flags).filter((o) => o !== REFUSED_AFTER_RELEASE);
}

/** The case a CR is linked to: by Case_Item_Id, else by Case_Code + Cycle_No (preselected at Triage). */
export function caseOfCr(cr: Pick<CrVM, "caseItemId" | "caseCode" | "cycleNo">, cases: CaseVM[]): CaseVM | null {
  return cases.find((c) => crBelongsTo(cr, c)) ?? null;
}

export interface TriageInput {
  caseItemId: string;
  caseCode: string;
  cycleNo: number | null;
  supplierCode: string;
  contactVerified: string;
  outcome: string;
  impacts: Record<CrDept, string>;
  noticeKind: string;
  noticeTitle: string;
  supplierOutcomeText: string;
  portalContactIds: string;
  triageNote: string;
  scopeRunKey: string;
}

/** X6 writes Notice_Kind as the literal "Change request outcome" (brd L1299); the triage uses the same default. */
export const NOTICE_KIND_DEFAULT = "Change request outcome";
/** A neutral supplier text for a change refused after the final release (editable). */
export const AFTER_RELEASE_TEXT = "Thank you for your change request. This questionnaire was already released, so the change cannot be applied to it. Please contact your Beiersdorf contact if the change matters.";

/**
 * The Triage form prefilled from the CR and its case (portal contact ids come from the case) [convention]:
 * Notice_Kind "Change request outcome"; Contact_Verified "Yes" for a MANUAL CR (no portal item: RMM recorded it from
 * the supplier), blank for a portal CR; after release a neutral supplier text.
 */
export function triageDefaults(cr: CrVM, c: CaseVM | null, o: { released?: boolean } = {}): TriageInput {
  const impacts = Object.fromEntries(CR_DEPTS.map((d) => [d, cr.impacts[d]?.impact ?? ""])) as Record<CrDept, string>;
  return {
    caseItemId: cr.caseItemId || c?._id || "",
    caseCode: cr.caseCode || c?.caseCode || "",
    cycleNo: cr.cycleNo ?? c?.cycleNo ?? null,
    supplierCode: cr.supplierCode || c?.supplierCode || "",
    contactVerified: cr.contactVerified || (cr.portalCrItemId ? "" : "Yes"),
    outcome: cr.outcome,
    impacts,
    noticeKind: cr.noticeKind || NOTICE_KIND_DEFAULT,
    noticeTitle: cr.noticeTitle || [cr.changeKind, cr.sectionKey].filter(Boolean).join(" · "),
    supplierOutcomeText: cr.supplierOutcomeText || (o.released ? AFTER_RELEASE_TEXT : ""),
    portalContactIds: cr.portalContactIds || c?.portalContactIds || "",
    triageNote: cr.triageNote,
    scopeRunKey: cr.scopeRunKey,
  };
}

/** Applies the case pick: all four link fields from the case, and its portal contact ids (COH-07, X6 inputs). */
export function withCase(i: TriageInput, c: CaseVM): TriageInput {
  return { ...i, caseItemId: c._id, caseCode: c.caseCode, cycleNo: c.cycleNo, supplierCode: c.supplierCode, portalContactIds: c.portalContactIds || i.portalContactIds };
}

const ALL_NO = (): Record<CrDept, string> => Object.fromEntries(CR_DEPTS.map((d) => [d, "No"])) as Record<CrDept, string>;

/** The forced values after release (BR-052): the outcome and every impact. */
export function forceAfterRelease(i: TriageInput): TriageInput {
  return { ...i, outcome: REFUSED_AFTER_RELEASE, impacts: ALL_NO() };
}

/** What the triage writes: after release the forced values; for any refusal every impact "No" (F1). */
export function effectiveTriage(i: TriageInput, released: boolean): TriageInput {
  if (released) return forceAfterRelease(i);
  return isRefusal(i.outcome) ? { ...i, impacts: ALL_NO() } : i;
}

/** The Triage write at CHRQ_S1 (every X6 input; Notice_Key generated). After release, or for any refusal, the forced
 *  values win (applied AFTER the user input). */
export function buildTriagePatch(cr: Pick<CrVM, "crKey">, input: TriageInput, released: boolean): Patch {
  const i = effectiveTriage(input, released);
  const fields: Record<string, unknown> = {
    Case_Item_Id: i.caseItemId,
    Case_Code: i.caseCode,
    Cycle_No: i.cycleNo,
    Supplier_Code: i.supplierCode,
    Contact_Verified: i.contactVerified || undefined,
    CR_Outcome: i.outcome || undefined,
    Notice_Key: noticeKey(cr.crKey),
    Notice_Kind: i.noticeKind,
    Notice_Title: i.noticeTitle,
    Supplier_Outcome_Text: i.supplierOutcomeText,
    Portal_Contact_Ids: i.portalContactIds,
    Triage_Note: i.triageNote || undefined,
    Scope_Run_Key: i.scopeRunKey || undefined,
  };
  for (const d of CR_DEPTS) fields[`Impact_${d}`] = i.impacts[d] || undefined;
  return { fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "")) };
}

/** Client problems before the Triage save (Mandatory at CHRQ_S1 is re-checked on the server read by submitStep). */
export function triageProblems(input: TriageInput, o: { released: boolean; caseReadable: boolean; flags: Pick<Flags, "scopeExtendedOutcome"> }): Problem[] {
  const out: Problem[] = [];
  const i = o.released ? forceAfterRelease(input) : input;
  if (!i.caseItemId || !i.caseCode || i.cycleNo === null) out.push({ field: "Case_Item_Id", label: "Case", message: "Link the change request to a case." });
  if (!o.caseReadable) out.push({ field: "Case_Item_Id", label: "Case", message: "Whether the case is already released could not be read with your access. Ask a Case Admin to triage it." });
  if (!i.contactVerified) out.push({ field: "Contact_Verified", label: "Contact verified", message: "Contact verified is required." });
  if (!i.outcome) out.push({ field: "CR_Outcome", label: "Outcome", message: "Choose an outcome." });
  else if (!triageOutcomeOptions(o.flags, o.released).includes(i.outcome))
    out.push({ field: "CR_Outcome", label: "Outcome", message: i.outcome === REFUSED_AFTER_RELEASE ? `"${i.outcome}" needs a released case: this case is not released yet.` : `"${i.outcome}" is not available here.` });
  for (const d of CR_DEPTS) if (!i.impacts[d]) out.push({ field: `Impact_${d}`, label: `Impact ${d}`, message: `Impact ${d} is required (Yes or No).` });
  // F1: a refused request runs no assessment, so no department may be impacted
  if (!o.released && isRefusal(i.outcome)) {
    const yes = CR_DEPTS.filter((d) => i.impacts[d] === "Yes");
    if (yes.length) out.push({ field: `Impact_${yes[0]}`, label: "Impact", message: `A refused change request impacts no department: set ${yes.join(", ")} to No.` });
  }
  if (!i.noticeKind.trim()) out.push({ field: "Notice_Kind", label: "Notice kind", message: "Notice kind is required." });
  if (!i.noticeTitle.trim()) out.push({ field: "Notice_Title", label: "Notice title", message: "Notice title is required." });
  if (!i.supplierOutcomeText.trim()) out.push({ field: "Supplier_Outcome_Text", label: "Supplier outcome text", message: "Supplier outcome text is required." });
  if (!i.portalContactIds.trim()) out.push({ field: "Portal_Contact_Ids", label: "Portal contact ids", message: "Portal contact ids are required (taken from the case)." });
  return out;
}

/** The F8 "Change attempt" row for a CR refused after final release (j13; BR-052). */
export function changeAttemptEvent(cr: Pick<CrVM, "_id" | "crKey" | "changeKind" | "sectionKey" | "fieldKey">, c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo">): AuditInput {
  return {
    category: "Change attempt",
    actionCode: "cr.refused.after-release",
    caseCode: c.caseCode,
    cycleNo: c.cycleNo,
    caseItemId: c._id,
    objectKind: "Change request",
    objectKey: cr.crKey,
    objectItemId: cr._id,
    newValueText: [cr.changeKind, cr.sectionKey, cr.fieldKey].filter(Boolean).join(" · ") || undefined,
    eventReason: REFUSED_AFTER_RELEASE,
  };
}

// ---------------------------------------------------------------- manual CR (Y6 fallback)

export interface ManualCrInput {
  caseCode: string;
  cycleNo: number | null;
  supplierCode: string;
  changeKind: string;
  sectionKey: string;
  fieldKey: string;
  rowId: string;
  currentValueText: string;
  proposedValueJson: string;
  changeReason: string;
}
export const emptyManualCr = (c: CaseVM | null): ManualCrInput => ({
  caseCode: c?.caseCode ?? "",
  cycleNo: c?.cycleNo ?? null,
  supplierCode: c?.supplierCode ?? "",
  changeKind: "",
  sectionKey: "",
  fieldKey: "",
  rowId: "",
  currentValueText: "",
  proposedValueJson: "",
  changeReason: "",
});

export function manualCrProblems(i: ManualCrInput): Problem[] {
  const out: Problem[] = [];
  if (!i.caseCode.trim()) out.push({ field: "Case_Code", label: "Case code", message: "Case code is required." });
  if (i.cycleNo === null || !Number.isFinite(i.cycleNo) || i.cycleNo < 1) out.push({ field: "Cycle_No", label: "Cycle", message: "The case cycle is required." });
  if (!i.changeKind.trim()) out.push({ field: "Change_Kind", label: "Change kind", message: "Change kind is required." });
  if (!i.changeReason.trim()) out.push({ field: "Change_Reason", label: "Change reason", message: "Change reason is required." });
  if (i.proposedValueJson.trim()) {
    try {
      JSON.parse(i.proposedValueJson);
    } catch {
      out.push({ field: "Proposed_Value_JSON", label: "Proposed value (JSON)", message: "Proposed value must be valid JSON (or left blank)." });
    }
  }
  return out;
}

/** The CHRQ_S0 data of a manual CR. Portal_CR_Item_Id and Raised_By_Portal_User are never set. */
export function buildManualCr(i: ManualCrInput, now: Date, rnd: () => number = Math.random): Record<string, unknown> {
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  const d: Record<string, unknown> = {
    CR_Key: crKey(i.caseCode.trim(), i.cycleNo ?? 1, now, rnd),
    Case_Code: i.caseCode.trim(),
    Cycle_No: i.cycleNo,
    Supplier_Code: opt(i.supplierCode),
    Change_Kind: i.changeKind.trim(),
    Section_Key: opt(i.sectionKey),
    Field_Key: opt(i.fieldKey),
    Row_Id: opt(i.rowId),
    Current_Value_Text: opt(i.currentValueText),
    Proposed_Value_JSON: opt(i.proposedValueJson),
    Change_Reason: i.changeReason.trim(),
  };
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== null));
}

/** The impact chips of a CR: departments with Impact "Yes", and whether their assessment is done. */
export function impactChips(cr: CrVM): { dept: CrDept; assessed: boolean; assessment: string }[] {
  return CR_DEPTS.filter((d) => cr.impacts[d]?.impact === "Yes").map((d) => ({ dept: d, assessed: !!cr.impacts[d].assessment, assessment: cr.impacts[d].assessment }));
}
