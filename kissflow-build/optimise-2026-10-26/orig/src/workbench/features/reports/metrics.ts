// Report metrics (pure): lead time by stage and supplier performance, from the LIVE view models. Modelled on the
// prototype's features/reports/reportData.ts. Stages are measured between times the app records today; where a time
// is not recorded yet (the supplier's own answer times, the end of the close check) the metric is reported as not
// available instead of being estimated.
import { DEPTS } from "../../schema";
import type { CaseVM, RunVM } from "../../data/viewModels";
import { avg, createdIndex, daysBetween, isOpenCase, isOpenPoint, caseSide, pointOverdueAtSupplier, pointWaitsOnSupplier, type OpsInput } from "../dashboard/metrics";

// ---------------------------------------------------------------- lead time by stage

export type StageId = "setup" | "supplier" | "review" | "release";
export interface StageRow {
  id: StageId;
  label: string;
  /** Who holds the ball. "both": open items, the overall approval and the supplier's final release share this stage. */
  side: "supplier" | "bdf" | "both";
  from: string;
  to: string;
  /** Cases that have both times. */
  n: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}
export interface LeadTimeView {
  stages: StageRow[];
  /** Creation to the supplier's final release. */
  total: { n: number; avg: number | null };
  takeaway: string;
}

const STAGES: Omit<StageRow, "n" | "avg" | "min" | "max">[] = [
  { id: "setup", label: "Setup and scope", side: "bdf", from: "Case created", to: "Scope released" },
  { id: "supplier", label: "Supplier questionnaire", side: "supplier", from: "Scope released", to: "Supplier confirmed completeness" },
  { id: "review", label: "Department review", side: "bdf", from: "Supplier confirmed completeness", to: "Last department review completed" },
  { id: "release", label: "Open items, approval and final release", side: "both", from: "Last department review completed", to: "Supplier final release" },
];

/** The first scope run of each case (Run_At). */
export function scopeReleasedIndex(runs: RunVM[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of runs) {
    if (!r.caseItemId || !r.runAt) continue;
    const prev = out.get(r.caseItemId);
    if (!prev || Date.parse(r.runAt) < Date.parse(prev)) out.set(r.caseItemId, r.runAt);
  }
  return out;
}

/** The last completion of the case's active review tracks; null while any active track is still open. */
export function reviewDoneAt(c: CaseVM): string | null {
  const active = DEPTS.filter((d) => c.lanes[d]?.active);
  if (!active.length || active.some((d) => !c.lanes[d].completedAt)) return null;
  return active.map((d) => c.lanes[d].completedAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

export function leadTimeView(i: OpsInput): LeadTimeView {
  const created = createdIndex(i.cases, i.events);
  const scope = scopeReleasedIndex(i.runs);
  const ends = (c: CaseVM): Record<StageId, [string | undefined | null, string | undefined | null]> => {
    const review = reviewDoneAt(c);
    return {
      setup: [created.get(c._id), scope.get(c._id)],
      supplier: [scope.get(c._id), c.completeness.at],
      review: [c.completeness.at, review],
      release: [review, c.finalRelease.at],
    };
  };
  const per = i.cases.map(ends);
  const stages = STAGES.map((s) => {
    const xs = per.map((e) => daysBetween(e[s.id][0], e[s.id][1])).filter((x): x is number => x !== null);
    return { ...s, n: xs.length, avg: avg(xs), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null };
  });
  const totals = i.cases.map((c) => daysBetween(created.get(c._id), c.finalRelease.at)).filter((x): x is number => x !== null);
  const measured = stages.filter((s) => s.avg !== null);
  const top = [...measured].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))[0];
  const takeaway = top ? `“${top.label}” takes longest: ${fmtNum(top.avg!)} days on average (${top.n} case${top.n === 1 ? "" : "s"}).` : "No case has finished a stage yet, so there is no lead time to break down.";
  return { stages, total: { n: totals.length, avg: avg(totals) }, takeaway };
}

export const fmtNum = (n: number): string => n.toLocaleString("en-GB", { maximumFractionDigits: 1 });

// ---------------------------------------------------------------- supplier performance

export interface SupplierRow {
  code: string;
  name: string;
  cases: number;
  openCases: number;
  /** Open cases at a supplier step. */
  atSupplier: number;
  /** Open points sent to this supplier. */
  openPoints: number;
  waitingPoints: number;
  overduePoints: number;
  /** Average query rounds per supplier point; null when none. */
  avgRounds: number | null;
  /** % of accepted supplier points accepted in the first round; null when none accepted yet. */
  firstRound: number | null;
}

export function supplierPerformance(i: OpsInput, now: Date): { rows: SupplierRow[]; takeaway: string } {
  const codes = new Map<string, string>();
  for (const c of i.cases) if (c.supplierCode) codes.set(c.supplierCode, codes.get(c.supplierCode) || c.supplierLegalName);
  for (const p of i.points) if (p.supplierCode && !codes.has(p.supplierCode)) codes.set(p.supplierCode, "");
  const rows: SupplierRow[] = [...codes].map(([code, name]) => {
    const cs = i.cases.filter((c) => c.supplierCode === code);
    const ps = i.points.filter((p) => p.supplierCode === code && p.toSupplier && p.status !== "draft");
    const open = ps.filter(isOpenPoint);
    const accepted = ps.filter((p) => p.outcome === "Accepted" && p.roundNo !== null);
    return {
      code,
      name: name || code,
      cases: cs.length,
      openCases: cs.filter(isOpenCase).length,
      atSupplier: cs.filter((c) => isOpenCase(c) && caseSide(c) === "supplier").length,
      openPoints: open.length,
      waitingPoints: open.filter(pointWaitsOnSupplier).length,
      overduePoints: ps.filter((p) => pointOverdueAtSupplier(p, now)).length,
      avgRounds: avg(ps.map((p) => p.roundNo).filter((x): x is number => x !== null && x > 0)),
      firstRound: accepted.length ? Math.round((accepted.filter((p) => (p.roundNo ?? 0) <= 1).length / accepted.length) * 100) : null,
    };
  });
  rows.sort((a, b) => b.overduePoints - a.overduePoints || b.waitingPoints - a.waitingPoints || a.name.localeCompare(b.name));
  const late = rows.filter((r) => r.overduePoints > 0);
  const takeaway = !rows.length
    ? "No supplier in the cases you can see yet."
    : late.length
      ? `Overdue answers: ${late
          .slice(0, 3)
          .map((r) => `${r.name} (${r.overduePoints})`)
          .join(", ")}${late.length > 3 ? ` and ${late.length - 3} more` : ""}.`
      : "No supplier is past a due date on an open point.";
  return { rows, takeaway };
}
