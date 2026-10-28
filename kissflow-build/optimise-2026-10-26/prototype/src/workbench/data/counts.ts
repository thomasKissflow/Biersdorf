// Count functions and their confidence (WORKBENCH-DESIGN.md §6.2 "When is a read complete enough to count", §7.9;
// WB-5, WB-D1, WB-D11). All pure. A count is "complete" only when:
//   - every Process list it depends on was read on rung 1 ("admin"), or on a "viewer" rung Diagnostics proved live;
//   - every Form list it depends on has quality "form";
//   - no matched item is index-only;
//   - every matched item has readQuality full/row AND a readable _status AND its open formula (Open_Num/CR_Open_Num).
// "mine+tasks", "failed", or any index-only item ALWAYS gives "partial". A count that is too low passes a gate wrongly.
import { crDeptFields, type Dept, type FlowId } from "../schema";
import { isBlank } from "./normalize";
import type { CaseVM, CrVM, ListQuality, ListRead, PointVM, RmesVM, Unread } from "./viewModels";

export type Confidence = "complete" | "partial";
export interface CountResult {
  value: number;
  confidence: Confidence;
  /** Ids of the items counted as open. */
  items: string[];
  unread: Unread[];
  warnings: string[];
}

const PROCESS_REASON: Record<string, string> = {
  CIQ_Open_Point_A00: "Open points of this case: only the ones you raised or hold a task on are visible with your access",
  CIQ_Change_Request_A00: "Change requests of this case: only the ones you started or hold a task on are visible with your access",
  CIQ_Case_A00: "Cases: only the ones you started or hold a task on are visible with your access",
};

/** Unread entries for a list that is not complete enough to count. Empty when it is. */
export function listUnread(flow: FlowId, l: Pick<ListRead<unknown>, "quality" | "viewerProven">, visible: number, kind: "process" | "form" = "process"): Unread[] {
  const q: ListQuality = l.quality;
  if (kind === "form") return q === "form" ? [] : [{ flow, rung: q, reason: `${flow}: the list could not be read completely`, visible }];
  if (q === "admin") return [];
  if (q === "viewer" && l.viewerProven) return [];
  if (q === "failed") return [{ flow, rung: q, reason: `${flow}: the list could not be read`, visible }];
  return [{ flow, rung: q, reason: PROCESS_REASON[flow] ?? `${flow}: only part of the list is readable with your access`, visible }];
}

export type Openness = { open: boolean; certain: boolean; reason?: string };

/** Open point (§7.9): _status ∉ {Rejected, Withdrawn} AND Open_Num = 1. Unreadable formula: open while In progress
 *  (an upper bound), uncertain. Drafts (never submitted) are not open points. */
export function pointOpenness(p: PointVM): Openness {
  if (p.readQuality === "index") return { open: true, certain: false, reason: `${p.opKey || p._id}: known only from the index` };
  if (p.status === "rejected" || p.status === "withdrawn") return { open: false, certain: true };
  if (p.status === "draft") return { open: false, certain: true };
  const statusReadable = p.status !== "unknown";
  if (p.openNum === null) {
    const open = p.status === "in-progress" || p.status === "unknown";
    return { open, certain: false, reason: `${p.opKey || p._id}: Open_Num not readable` };
  }
  return { open: p.openNum === 1, certain: statusReadable, reason: statusReadable ? undefined : `${p.opKey || p._id}: status not readable` };
}
/** Open change request: _status ∉ {Rejected, Withdrawn} AND CR_Open_Num > 0 (unreadable: open while In progress). */
export function crOpenness(cr: CrVM): Openness {
  if (cr.readQuality === "index") return { open: true, certain: false, reason: `${cr.crKey || cr._id}: known only from the index` };
  if (cr.status === "rejected" || cr.status === "withdrawn") return { open: false, certain: true };
  if (cr.status === "draft") return { open: false, certain: true };
  const statusReadable = cr.status !== "unknown";
  if (cr.crOpenNum === null) {
    const open = cr.status === "in-progress" || cr.status === "unknown";
    return { open, certain: false, reason: `${cr.crKey || cr._id}: CR_Open_Num not readable` };
  }
  return { open: cr.crOpenNum > 0, certain: statusReadable, reason: statusReadable ? undefined : `${cr.crKey || cr._id}: status not readable` };
}

/**
 * A change request belongs to a case when Case_Item_Id = the case, OR Case_Item_Id is blank AND Case_Code and
 * Cycle_No match (Case_Item_Id is set only at Triage, TK10). So untriaged CRs COUNT (WB-D11, stricter than R19).
 */
export function crBelongsTo(cr: Pick<CrVM, "caseItemId" | "caseCode" | "cycleNo">, c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo">): boolean {
  if (cr.caseItemId) return cr.caseItemId === c._id;
  return !!cr.caseCode && cr.caseCode === c.caseCode && cr.cycleNo !== null && cr.cycleNo === c.cycleNo;
}
export const pointBelongsTo = (p: Pick<PointVM, "caseItemId">, c: Pick<CaseVM, "_id">): boolean => !!p.caseItemId && p.caseItemId === c._id;

function tally<T extends { _id: string }>(rows: T[], open: (x: T) => Openness, flow: FlowId, list: Pick<ListRead<T>, "quality" | "viewerProven" | "indexOnly">) {
  const unread: Unread[] = listUnread(flow, list, rows.length);
  const items: string[] = [];
  const warnings: string[] = [];
  for (const x of rows) {
    const o = open(x);
    if (o.open) items.push(x._id);
    if (list.indexOnly.has(x._id)) unread.push({ flow, rung: "index", reason: o.reason ?? `${x._id}: known only from the index` });
    else if (!o.certain) unread.push({ flow, rung: "item", reason: o.reason ?? `${x._id}: not readable` });
  }
  return { items, unread, warnings };
}
const result = (parts: ReturnType<typeof tally>[]): CountResult => {
  const items = parts.flatMap((p) => p.items);
  const unread = parts.flatMap((p) => p.unread);
  return { value: items.length, confidence: unread.length ? "partial" : "complete", items, unread, warnings: parts.flatMap((p) => p.warnings) };
};

/** Open points of the case, ALL kinds (Contact update and Department review included). */
export function openItemsCount(c: CaseVM, points: ListRead<PointVM>): CountResult {
  return result([tally(points.rows.filter((p) => pointBelongsTo(p, c)), pointOpenness, "CIQ_Open_Point_A00", points)]);
}

/** Open change requests of the case (crBelongsTo: untriaged CRs count, WB-D11). */
export function openCrCount(c: CaseVM, crs: ListRead<CrVM>): CountResult {
  return result([tally(crs.rows.filter((cr) => crBelongsTo(cr, c)), crOpenness, "CIQ_Change_Request_A00", crs)]);
}

/**
 * Lane open count (brd L809-L817): open points of the case with OP_Dept = D or Raised_By_Dept = D, except
 * "Contact update"; PLUS, only when CR_DEPT_FIELDS[D] exists (not RMM), CRs of the case with Impact_D = "Yes" and
 * D_Assessment blank. Section-review marks are a separate client blocker (§8.8), not part of this number.
 */
export function laneOpenCount(c: CaseVM, d: Dept, points: ListRead<PointVM>, crs: ListRead<CrVM>): CountResult {
  const ps = points.rows.filter((p) => pointBelongsTo(p, c) && (p.dept === d || p.raisedByDept === d) && p.kind !== "Contact update");
  const parts = [tally(ps, pointOpenness, "CIQ_Open_Point_A00", points)];
  const f = crDeptFields(d);
  if (f) {
    const dd = d as Exclude<Dept, "RMM">;
    const pendingCr = (cr: CrVM): Openness => {
      if (cr.readQuality === "index") return { open: true, certain: false, reason: `${cr.crKey || cr._id}: known only from the index` };
      if (cr.status === "rejected" || cr.status === "withdrawn" || cr.status === "draft") return { open: false, certain: true };
      const imp = cr.impacts[dd];
      const open = imp.impact === "Yes" && isBlank(imp.assessment);
      return { open, certain: cr.status !== "unknown", reason: cr.status === "unknown" ? `${cr.crKey || cr._id}: status not readable` : undefined };
    };
    parts.push(tally(crs.rows.filter((cr) => crBelongsTo(cr, c)), pendingCr, "CIQ_Change_Request_A00", crs));
  }
  return result(parts);
}

/** RMES header counts from READ-BACK rows (§7.9): Σ Criteria_Open_Num, a blank on an applicable row counting 1
 *  (with a warning), plus blocking findings not Closed ("Open"/"Closed" are provisional, Q9). */
export function rmesHeaderCounts(rmes: Pick<RmesVM, "criteria" | "findings">): { openCriteria: number; openBlockingFindings: number; warnings: string[] } {
  const warnings: string[] = [];
  let openCriteria = 0;
  for (const c of rmes.criteria) {
    if (c.openNum === null) {
      if (c.applicable !== "No") {
        openCriteria += 1;
        warnings.push(`server formula blank on ${c.code || c._id}; counted as open`);
      }
    } else openCriteria += c.openNum;
  }
  const openBlockingFindings = rmes.findings.filter((f) => f.blocking === "Yes" && f.state !== "Closed").length;
  return { openCriteria, openBlockingFindings, warnings };
}

/** `<D>_RMES_Gaps` = Open_Criteria_Count + Open_Blocking_Findings_Count of the non-voided RMES row [convention];
 *  null (blank) without a row or while the header counts are blank. */
export function rmesGaps(rows: RmesVM[]): { value: number | null; row: RmesVM | null; warnings: string[] } {
  const live = rows.filter((r) => !r.voided).sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  const row = live[0] ?? null;
  if (!row) return { value: null, row: null, warnings: ["No RMES sheet exists for this case yet."] };
  const warnings = live.length > 1 ? [`${live.length} RMES rows are not voided; the oldest is used.`] : [];
  if (row.openCriteriaCount === null || row.openBlockingFindingsCount === null) return { value: null, row, warnings: [...warnings, "The RMES header counts are not saved yet."] };
  return { value: row.openCriteriaCount + row.openBlockingFindingsCount, row, warnings };
}

/**
 * Effective SAF/REG decision (WB-D8; brd L788): the Late_Decision of the newest Accepted "Department review" point
 * with OP_Dept = D for this case (newest by Reviewed_At, Late_Decision non-blank), else <D>_RMES_Decision.
 */
export function effectiveDecision(c: CaseVM, d: "SAF" | "REG", points: PointVM[]): { decision: "Approved" | "Rejected" | null; source: "late" | "rmes" } {
  const late = points
    .filter((p) => pointBelongsTo(p, c) && p.kind === "Department review" && p.dept === d && p.outcome === "Accepted" && !isBlank(p.lateDecision))
    .sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)))[0];
  const asDecision = (s: string | undefined) => (s === "Approved" || s === "Rejected" ? s : null);
  if (late) return { decision: asDecision(late.lateDecision), source: "late" };
  return { decision: asDecision(c.lanes[d].rmesDecision), source: "rmes" };
}
