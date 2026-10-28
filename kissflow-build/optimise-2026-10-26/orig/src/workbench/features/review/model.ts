// Reviewer queue and lane workspace logic, pure (WORKBENCH-DESIGN.md §8.7, §8.8; brd L809-L817; WB-D1, WB-D5).
//
// Queue (§8.7): HELD tasks only (ground rule 13) — CASE_B_<D>, OPNT_R_<D>, CHRQ_B_<D> for D in reviewerDepts, plus
// EVERY held OPNT_S1 task whatever the roles (a supplier point the user raised, assigned from Responsible_User).
//
// Lane blockers (§8.8 middle column):
//   (1) open points for D (OP_Dept = D or Raised_By_Dept = D, except "Contact update");
//   (2) CR assessments for D still pending (none for RMM: there is no RMM CR assessment);
//   (3) SAF/REG: the RMES sheet exists; its header counts are saved; open criteria; blocking findings; a decision; a
//       reason if Rejected;
//   (4) section-review marks [provisional, WB-D5]: every section D LEADS (not N.A.) needs an F8 "Section review" row
//       (section.reviewed, Object_Key = Section_Item_Key) for this case and cycle. Staleness is not checked (K-14). If
//       the F8 list could not be read completely, the blocker says "could not check" and is handled like a partial
//       count: blocking under fail-closed; under "attest" it passes once the user attested the lane counts.
import { crDeptFields, deptSteps, type Dept, type StepIr } from "../../schema";
import type { CountsPolicy } from "../../domain/flags";
import { crBelongsTo, pointBelongsTo, pointOpenness, rmesGaps } from "../../data/counts";
import { SECTION_REVIEW_MARKS_BLOCK } from "../../data/gates";
import { CLEAR, isBlank } from "../../data/normalize";
import type { AuditVM, CaseVM, CrVM, LaneVM, ListQuality, PointVM, Problem, RmesVM, SectionVM, TaskVM } from "../../data/viewModels";
import { COUNTS_BLOCKED_SHORT, DEPT_LABEL, plural } from "../../domain/labels";

// ---------------------------------------------------------------- queue

export interface ReviewGroups {
  cases: TaskVM[];
  points: TaskVM[];
  /** OPNT_S1 tasks the user holds (any role): "Record supplier response (manual)". */
  supplier: TaskVM[];
  crs: TaskVM[];
  /** Tasks at an unidentified step: open in Kissflow. */
  unresolved: TaskVM[];
}

export function groupReviewTasks(tasks: TaskVM[], depts: readonly Dept[]): ReviewGroups {
  const lane = new Set<StepIr>(depts.map((d) => deptSteps(d).caseLaneStep));
  const op = new Set<StepIr>(depts.map((d) => deptSteps(d).opReviewStep));
  const cr = new Set<StepIr>(depts.map((d) => deptSteps(d).crAssessStep).filter((x): x is StepIr => !!x));
  const byDue = (a: TaskVM, b: TaskVM) => String(a.due ?? "9999").localeCompare(String(b.due ?? "9999"));
  return {
    cases: tasks.filter((t) => t.step && lane.has(t.step)).sort(byDue),
    points: tasks.filter((t) => t.step && op.has(t.step)).sort(byDue),
    supplier: tasks.filter((t) => t.step === "OPNT_S1").sort(byDue),
    crs: tasks.filter((t) => t.step && cr.has(t.step)).sort(byDue),
    unresolved: tasks.filter((t) => !t.step),
  };
}

/** "Waiting on supplier" (rung 1 only): points raised by my departments that sit at OPNT_S1 and that I don't hold. */
export function waitingOnSupplier(points: PointVM[], myDepts: readonly Dept[], held: TaskVM[]): PointVM[] {
  const mine = new Set(held.filter((t) => t.flow === "CIQ_Open_Point_A00").map((t) => t.instanceId));
  return points.filter((p) => p.step === "OPNT_S1" && (myDepts as readonly string[]).includes(p.raisedByDept) && !mine.has(p._id));
}

// ---------------------------------------------------------------- sections of a lane

export const isNA = (label: string): boolean => /^\s*n\.?\s*\/?\s*a\.?\s*$/i.test(label);

/** Sections shown in D's left column: D leads, co-reviews or owns the queries. */
export function sectionsForDept(sections: SectionVM[], d: Dept): SectionVM[] {
  return sections.filter((s) => s.leadDept === d || s.coReviewDepts.includes(d) || s.queryOwnerDept === d);
}
/** Sections D LEADS and that are not N.A.: each needs a review mark (WB-D5). */
export function ledSections(sections: SectionVM[], d: Dept): SectionVM[] {
  return sections.filter((s) => s.leadDept === d && !isNA(s.applicabilityLabel));
}
/** The F8 "Section review" marks for a section of this case and cycle. */
export function reviewMarksOf(events: AuditVM[], c: Pick<CaseVM, "_id" | "cycleNo">, sectionItemKey: string): AuditVM[] {
  return events.filter(
    (e) => e.actionCode === "section.reviewed" && e.objectKey === sectionItemKey && (!e.caseItemId || e.caseItemId === c._id) && (e.cycleNo === null || c.cycleNo === null || e.cycleNo === c.cycleNo),
  );
}

// ---------------------------------------------------------------- blockers

export type BlockerKind = "open-points" | "cr-assessments" | "rmes" | "section-marks";
export interface BlockerItem {
  id: string;
  text: string;
  /** In-app link (a point, a CR) when there is one. */
  href?: string;
}
export interface Blocker {
  kind: BlockerKind;
  label: string;
  items: BlockerItem[];
  /** False for informational entries (marks when WB-D5 is switched off; "could not check" covered by an attestation). */
  blocking: boolean;
  note?: string;
}

export interface LaneInput {
  c: CaseVM;
  d: Dept;
  points: PointVM[];
  crs: CrVM[];
  sections: SectionVM[];
  events: AuditVM[];
  eventsQuality: ListQuality;
  /** SAF/REG: the RMES rows of the case and how the Form list read. */
  rmes?: { rows: RmesVM[]; quality: ListQuality } | null;
  /** The sign-off values as they stand (server values, or the form being edited). */
  decision?: { decision: string; reason: string };
  policy: CountsPolicy;
  /** The lane counts were attested this session (policy "attest"). */
  attested?: boolean;
  /** WB-D5 switch (gates.ts). */
  marksBlock?: boolean;
}

export function laneBlockers(i: LaneInput): Blocker[] {
  const out: Blocker[] = [];
  const { c, d } = i;
  // (1) open points
  const pts = i.points.filter((p) => pointBelongsTo(p, c) && (p.dept === d || p.raisedByDept === d) && p.kind !== "Contact update" && pointOpenness(p).open);
  out.push({
    kind: "open-points",
    label: "Open points",
    items: pts.map((p) => ({ id: p._id, text: `${p.opKey || p._id} · ${p.kind}${p.refLabel ? ` · ${p.refLabel}` : ""}`, href: `/points/${p._id}` })),
    blocking: pts.length > 0,
  });
  // (2) CR assessments (none for RMM)
  if (crDeptFields(d)) {
    const dd = d as Exclude<Dept, "RMM">;
    const crs = i.crs.filter((cr) => crBelongsTo(cr, c) && cr.status !== "rejected" && cr.status !== "withdrawn" && cr.status !== "draft" && cr.impacts[dd]?.impact === "Yes" && isBlank(cr.impacts[dd].assessment));
    out.push({ kind: "cr-assessments", label: "Change request assessments", items: crs.map((cr) => ({ id: cr._id, text: `${cr.crKey || cr._id} · ${cr.changeKind}` })), blocking: crs.length > 0 });
  }
  // (3) RMES (SAF/REG)
  if (d === "SAF" || d === "REG") {
    const items: BlockerItem[] = [];
    if (!i.rmes || i.rmes.quality !== "form") items.push({ id: "rmes-unread", text: "The RMES sheet could not be read." });
    else {
      const g = rmesGaps(i.rmes.rows);
      if (!g.row) items.push({ id: "rmes-missing", text: "No RMES sheet exists for this case yet." });
      else if (g.value === null) items.push({ id: "rmes-header", text: "The RMES header counts are not saved yet: save the sheet." });
      else {
        if ((g.row.openCriteriaCount ?? 0) > 0) items.push({ id: "rmes-criteria", text: `${g.row.openCriteriaCount} open criteria` });
        if ((g.row.openBlockingFindingsCount ?? 0) > 0) items.push({ id: "rmes-findings", text: `${g.row.openBlockingFindingsCount} blocking finding(s)` });
      }
    }
    const dec = i.decision ?? { decision: c.lanes[d].rmesDecision ?? "", reason: c.lanes[d].rmesDecisionReason ?? "" };
    if (isBlank(dec.decision)) items.push({ id: "rmes-decision", text: "No RMES decision yet (Approved or Rejected)." });
    else if (dec.decision === "Rejected" && isBlank(dec.reason)) items.push({ id: "rmes-reason", text: "A reason is required when the RMES decision is Rejected." });
    out.push({ kind: "rmes", label: "RMES", items, blocking: items.length > 0 });
  }
  // (4) section-review marks (WB-D5)
  const marksBlock = i.marksBlock ?? SECTION_REVIEW_MARKS_BLOCK;
  const led = ledSections(i.sections, d);
  if (i.eventsQuality !== "form") {
    const covered = i.policy === "attest" && !!i.attested;
    out.push({
      kind: "section-marks",
      label: "Section review marks",
      items: led.length ? [{ id: "marks-unread", text: "Could not check: the audit events could not be read completely." }] : [],
      blocking: marksBlock && led.length > 0 && !covered,
      note: covered ? "Covered by your attestation of the counts." : "Treated like a count that could not be confirmed.",
    });
  } else {
    const unmarked = led.filter((s) => reviewMarksOf(i.events, c, s.sectionItemKey).length === 0);
    out.push({
      kind: "section-marks",
      label: "Section review marks",
      items: unmarked.map((s) => ({ id: s._id, text: `${s.sectionCode || s.sectionKey} · ${s.sectionTitle} is not marked reviewed` })),
      blocking: marksBlock && unmarked.length > 0,
      note: "Staleness against the supplier's answers is not checked (answers are not readable yet).",
    });
  }
  return out;
}

/** Blockers as submit problems (the extraChecks of submitStep, §7.3 step 3). */
export function blockerProblems(blockers: Blocker[]): Problem[] {
  return blockers.filter((b) => b.blocking).flatMap((b) => (b.items.length ? b.items : [{ id: b.kind, text: b.label }]).map((x) => ({ label: b.label, message: `${b.label}: ${x.text}` })));
}

/** The client rule on the fresh read: a Rejected RMES decision needs a reason (§8.8). */
export function decisionReasonProblem(d: Dept, fresh: Record<string, unknown>): Problem[] {
  if (d !== "SAF" && d !== "REG") return [];
  if (fresh[`${d}_RMES_Decision`] === "Rejected" && isBlank(fresh[`${d}_RMES_Decision_Reason`])) return [{ field: `${d}_RMES_Decision_Reason`, label: "RMES decision reason", message: "A reason is required when the RMES decision is Rejected." }];
  return [];
}

// ---------------------------------------------------------------- sign-off

export interface SignOff {
  confirmed: boolean;
  onBehalfOf: string;
  decision: string;
  reason: string;
}
/** The lane values as read from the server (to clear what the user emptied). */
export interface SignOffBefore {
  confirm: string;
  onBehalfOf: string;
  reason: string;
}

/** Client rule on "Save sign-off": a Rejected RMES decision needs a reason (§8.8). Everything Mandatory (confirm,
 *  decision, completed by/at) is checked on the SERVER read by submitStep before "Complete review". */
export function signOffProblems(d: Dept, s: SignOff): Problem[] {
  if ((d === "SAF" || d === "REG") && s.decision === "Rejected" && !s.reason.trim())
    return [{ field: `${d}_RMES_Decision_Reason`, label: "RMES decision reason", message: "A reason is required when the RMES decision is Rejected." }];
  return [];
}

/** The sign-off patch at CASE_B_<D> (§8.8): <D>_Completed_By/_Email/_At = me, now on every save; the confirm box
 *  ("Confirmed", or an explicit clear when it was confirmed before); On_Behalf_Of; the SAF/REG decision and reason.
 *  Emptied values are cleared explicitly (CLEAR); untouched blanks are not sent. Never a count or a gate. */
export function buildSignOffPatch(d: Dept, s: SignOff, me: { _id: string; Email: string }, at: string, before: SignOffBefore): { fields: Record<string, unknown> } {
  const fields: Record<string, unknown> = {
    [`${d}_Completed_By`]: { _id: me._id },
    [`${d}_Completed_By_Email`]: me.Email,
    [`${d}_Completed_At`]: at,
  };
  if (s.confirmed) fields[`${d}_Review_Confirm`] = "Confirmed";
  else if (before.confirm === "Confirmed") fields[`${d}_Review_Confirm`] = CLEAR;
  if (s.onBehalfOf.trim()) fields[`${d}_On_Behalf_Of`] = s.onBehalfOf.trim();
  else if (before.onBehalfOf.trim()) fields[`${d}_On_Behalf_Of`] = CLEAR;
  if (d === "SAF" || d === "REG") {
    if (s.decision) fields[`${d}_RMES_Decision`] = s.decision;
    if (s.reason.trim()) fields[`${d}_RMES_Decision_Reason`] = s.reason.trim();
    else if (before.reason.trim()) fields[`${d}_RMES_Decision_Reason`] = CLEAR;
  }
  return { fields };
}

// ---------------------------------------------------------------- what to do next (UX-05)

/** The department review's readiness in words (the server's <D>_Gate, explained without field ids). */
export function laneReadiness(lane: Pick<LaneVM, "dept" | "gate" | "openCount" | "rmesGaps">): { ready: boolean; lines: string[] } {
  const d = lane.dept;
  const lines: string[] = [];
  lines.push(lane.openCount === null ? `${DEPT_LABEL[d]} open items: not counted yet` : `${DEPT_LABEL[d]} open items: ${lane.openCount}`);
  if (d === "SAF" || d === "REG") lines.push(lane.rmesGaps === null || lane.rmesGaps === undefined ? "RMES gaps: not counted yet" : `RMES gaps: ${lane.rmesGaps}`);
  return { ready: lane.gate === "OK", lines };
}

export interface ChecklistInput {
  d: Dept;
  blockers: Blocker[];
  lane: Pick<LaneVM, "dept" | "gate" | "openCount" | "rmesGaps" | "complete">;
  /** The last Refresh counts was refused because not every item could be checked (fail-closed). */
  countsBlocked: boolean;
  held: boolean;
}

/**
 * Why "Complete review" is still off, as an ordered list of things to DO (left → middle → right column), in plain
 * words: no field ids, no read-rung names. Empty when nothing is left.
 */
export function completeChecklist(i: ChecklistInput): string[] {
  const out: string[] = [];
  const by = (k: BlockerKind) => i.blockers.find((b) => b.kind === k && b.blocking);
  const marks = by("section-marks");
  if (marks) for (const it of marks.items) out.push(it.id === "marks-unread" ? "Section review marks could not be checked with your access" : `Mark reviewed (left): ${it.text.replace(/ is not marked reviewed$/, "")}`);
  const pts = by("open-points");
  if (pts) out.push(`Decide or close ${plural(pts.items.length, "open point")} (listed under Blockers)`);
  const crs = by("cr-assessments");
  if (crs) out.push(`Assess ${plural(crs.items.length, "change request")} (listed under Blockers)`);
  const rmes = by("rmes");
  let decisionAsked = false;
  if (rmes)
    for (const it of rmes.items) {
      if (it.id === "rmes-missing") out.push("Create the RMES sheet");
      else if (it.id === "rmes-unread") out.push("The RMES sheet could not be read: open it and try again");
      else if (it.id === "rmes-header") out.push("Save the RMES sheet");
      else if (it.id === "rmes-criteria" || it.id === "rmes-findings") out.push(`Complete the RMES sheet: ${it.text}`);
      else if (it.id === "rmes-decision") {
        out.push("Choose the RMES decision (right) and save the sign-off");
        decisionAsked = true;
      } else if (it.id === "rmes-reason") out.push("Give a reason for the Rejected RMES decision (right)");
    }
  if (!i.lane.complete && !decisionAsked) out.push("Confirm the review and save the sign-off (right)");
  if (i.countsBlocked) out.push(COUNTS_BLOCKED_SHORT);
  else if (i.lane.gate !== "OK") {
    const notCounted = i.lane.openCount === null || ((i.d === "SAF" || i.d === "REG") && (i.lane.rmesGaps === null || i.lane.rmesGaps === undefined));
    out.push(notCounted ? "Press Refresh counts (middle)" : "Clear the open items, then press Refresh counts (middle)");
  }
  if (!i.held) out.push("This task is no longer in your queue");
  return out;
}
