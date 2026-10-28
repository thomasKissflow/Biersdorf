// Report and dashboard metrics, all derived from the same case data the tables show. Averages and percentages without
// any basis are null (never 0, NaN or Infinity): screens show them with fmtMetric, which prints "—".
import { ORIGIN_LABEL, REVIEW_TRACK_DEPTS } from "./catalog";
import { DAY, daysBetween, isClosed, isOverdue, nowIso, waitingOn } from "./selectors";
import type { AppState, CiqCase, OriginType, Phase, ReviewDept } from "./types";

// The legacy live-portal phases (metadata, scope-check) are counted where they belonged; the prototype never produces them.
const SUPPLIER_PHASES: Phase[] = ["supplier-input", "final-release", "metadata"];
const BDF_PHASES: Phase[] = ["review", "scope-check"];

export const round1 = (n: number) => Math.round(n * 10) / 10;
/** Average rounded to one decimal, or null when there is nothing to average. */
const avg1 = (xs: number[]): number | null => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** A metric for display: "—" when there is no data, else the value with its unit ("12.5 d", "80 %"). */
export function fmtMetric(v: number | null | undefined, unit = ""): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return unit ? `${v} ${unit}` : String(v);
}

/** Time spent in each phase (days). The current phase runs until now. */
export function phaseDurations(c: CiqCase, now = nowIso()): { phase: Phase; days: number }[] {
  return c.phaseHistory.map((p, i) => ({ phase: p.phase, days: daysBetween(p.at, c.phaseHistory[i + 1]?.at ?? (isClosed(c) ? p.at : now)) }));
}

export function leadTimeDays(c: CiqCase): number | null {
  const end = c.phaseHistory.find((p) => p.phase === "completed");
  return end ? daysBetween(c.createdAt, end.at) : null;
}

/** Days with the supplier vs with Beiersdorf. Inside the review, time an open point waits for the supplier counts as supplier time. */
export function waitSplit(c: CiqCase, now = nowIso()): { supplier: number; bdf: number } {
  let supplier = 0;
  let bdf = 0;
  for (const d of phaseDurations(c, now)) {
    if (SUPPLIER_PHASES.includes(d.phase)) supplier += d.days;
    else if (BDF_PHASES.includes(d.phase)) bdf += d.days;
  }
  const qWait = c.openPoints.reduce((sum, p) => {
    const ans = p.thread.find((m) => m.side === "supplier");
    return sum + daysBetween(p.createdAt, ans?.at ?? (p.status === "open" ? now : p.createdAt));
  }, 0);
  const shift = Math.min(qWait * 0.5, bdf); // overlapping parallel queries: count half to avoid double counting
  return { supplier: supplier + shift, bdf: bdf - shift };
}

export interface Kpis {
  open: number;
  withSupplier: number;
  withBdf: number;
  overdueCases: number;
  overduePoints: number;
  /** Days; null without a completed case. */
  avgLeadTime: number | null;
  completed: number;
  /** %; null until a case has reached the review. */
  firstTimeRight: number | null;
  /** Null without any open point. */
  avgRounds: number | null;
}

export function kpis(state: AppState, now = nowIso()): Kpis {
  const open = state.cases.filter((c) => !isClosed(c));
  const done = state.cases.filter((c) => c.phase === "completed");
  const reached = state.cases.filter((c) => c.reviewVersion > 0);
  const ops = state.cases.flatMap((c) => c.openPoints);
  return {
    open: open.length,
    withSupplier: open.filter((c) => waitingOn(c) === "supplier").length,
    withBdf: open.filter((c) => waitingOn(c) === "bdf").length,
    overdueCases: open.filter((c) => isOverdue(c.dueDate, now)).length,
    overduePoints: ops.filter((p) => p.status === "open" && isOverdue(p.dueDate, now)).length,
    avgLeadTime: avg1(done.map((c) => leadTimeDays(c)!)),
    completed: done.length,
    firstTimeRight: reached.length ? Math.round((reached.filter((c) => c.openPoints.length === 0).length / reached.length) * 100) : null,
    avgRounds: avg1(ops.map((p) => p.rounds)),
  };
}

/** Cases per phase for the pipeline chart. */
export function pipeline(state: AppState): { phase: Phase; count: number }[] {
  const phases: Phase[] = ["supplier-input", "review", "final-release"];
  return phases.map((p) => ({ phase: p, count: state.cases.filter((c) => c.phase === p).length }));
}

export interface DeptLoad {
  dept: ReviewDept;
  active: number;
  waitingSupplier: number;
  openPoints: number;
  overdue: number;
  completed: number;
  /** Null without a completed track. */
  avgReviewDays: number | null;
}

/** Load per review track, RMM's whole-CIQ review included (RMM first). */
export function deptWorkload(state: AppState, now = nowIso()): DeptLoad[] {
  return REVIEW_TRACK_DEPTS.map((d) => {
    const tracks = state.cases.flatMap((c) => c.reviews.filter((r) => r.dept === d).map((r) => ({ c, r })));
    const ops = state.cases.flatMap((c) => c.openPoints.filter((p) => p.dept === d));
    return {
      dept: d,
      active: tracks.filter((t) => t.r.status !== "completed" && !isClosed(t.c)).length,
      waitingSupplier: tracks.filter((t) => t.r.status === "waiting-supplier" && !isClosed(t.c)).length,
      openPoints: ops.filter((p) => p.status !== "closed").length,
      overdue: ops.filter((p) => p.status === "open" && isOverdue(p.dueDate, now)).length,
      completed: tracks.filter((t) => t.r.status === "completed").length,
      avgReviewDays: avg1(tracks.filter((t) => t.r.completedAt && t.r.startedAt).map((t) => daysBetween(t.r.startedAt!, t.r.completedAt!))),
    };
  });
}

/** Average days per phase over completed cases (lead-time breakdown); days are null without a completed case. */
export function leadTimeByPhase(state: AppState): { phase: Phase; days: number | null }[] {
  const done = state.cases.filter((c) => c.phase === "completed");
  const phases: Phase[] = ["supplier-input", "review", "final-release"];
  return phases.map((p) => ({ phase: p, days: avg1(done.map((c) => phaseDurations(c).filter((d) => d.phase === p).reduce((a, b) => a + b.days, 0))) }));
}

export function casesByOrigin(state: AppState): { origin: OriginType; label: string; count: number }[] {
  const m = new Map<OriginType, number>();
  for (const c of state.cases) for (const o of c.config.SF01 ?? []) m.set(o, (m.get(o) ?? 0) + 1);
  return [...m.entries()].map(([origin, count]) => ({ origin, label: ORIGIN_LABEL[origin].split(" (")[0].split(" /")[0], count })).sort((a, b) => b.count - a.count);
}

/** Created and completed per month (2026). */
export function monthlyFlow(state: AppState): { month: string; created: number; completed: number }[] {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  return months.map((m, i) => ({
    month: m,
    created: state.cases.filter((c) => new Date(c.createdAt).getUTCMonth() === i).length,
    completed: state.cases.filter((c) => c.phaseHistory.some((p) => p.phase === "completed" && new Date(p.at).getUTCMonth() === i)).length,
  }));
}

export interface SupplierPerf {
  supplierId: string;
  name: string;
  cases: number;
  open: number;
  queries: number;
  /** Null without an answered point. */
  avgResponseDays: number | null;
  /** Null without any point. */
  avgRounds: number | null;
  /** Null without an answered or overdue point. */
  onTimePct: number | null;
}

export function supplierPerformance(state: AppState, now = nowIso()): SupplierPerf[] {
  return state.suppliers
    .map((s) => {
      const cs = state.cases.filter((c) => c.supplierId === s.id);
      const ops = cs.flatMap((c) => c.openPoints);
      const answered = ops.map((p) => ({ p, a: p.thread.find((m) => m.side === "supplier") })).filter((x) => x.a);
      const onTime = answered.filter((x) => Date.parse(x.a!.at) <= Date.parse(x.p.dueDate)).length;
      return {
        supplierId: s.id,
        name: s.name,
        cases: cs.length,
        open: cs.filter((c) => !isClosed(c)).length,
        queries: ops.length,
        avgResponseDays: avg1(answered.map((x) => daysBetween(x.p.createdAt, x.a!.at))),
        avgRounds: avg1(ops.map((p) => p.rounds)),
        onTimePct: answered.length ? Math.round((onTime / answered.length) * 100) : ops.some((p) => p.status === "open" && isOverdue(p.dueDate, now)) ? 0 : null,
      };
    })
    .sort((a, b) => b.cases - a.cases);
}

/** Queries per section (where do clarifications cluster?). */
export function queryHotspots(state: AppState): { sectionId: string; count: number }[] {
  const m = new Map<string, number>();
  for (const p of state.cases.flatMap((c) => c.openPoints)) m.set(p.ref.sectionId, (m.get(p.ref.sectionId) ?? 0) + 1);
  return [...m.entries()].map(([sectionId, count]) => ({ sectionId, count })).sort((a, b) => b.count - a.count);
}

export const ageDays = (c: CiqCase, now = nowIso()) => Math.round((Date.parse(now) - Date.parse(c.createdAt)) / DAY);
