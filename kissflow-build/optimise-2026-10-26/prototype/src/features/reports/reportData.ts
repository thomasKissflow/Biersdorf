// Report view-models. Every number comes from @/domain/metrics on the live store state; this file only shapes those
// numbers for charts and tables and writes the one-sentence takeaway FROM the data. A metric without any basis is
// null and prints as "—" (never 0 %, 0 d, NaN or Infinity); every takeaway has a sentence for "no data yet".

import { DEPT_LABEL, DEPT_SHORT, ORIGIN_LABEL, SECTION_BY_ID, sectionLabel } from "@/domain/catalog";
import { casesByOrigin, deptWorkload, kpis, leadTimeByPhase, leadTimeDays, monthlyFlow, queryHotspots, round1, supplierPerformance, waitSplit, type DeptLoad, type SupplierPerf } from "@/domain/metrics";
import { ruleSet } from "@/domain/rules";
import { DAY, PHASE_LABEL, isClosed, isOverdue, nowIso, rejectedDepts, rmmFlags } from "@/domain/selectors";
import type { AppState, CiqCase, OriginType, Phase, ReviewDept } from "@/domain/types";

// ------------------------------------------------------------------ formatting

const NBSP = " ";
const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
/** Share in %, 0 when the whole is 0 (callers only show it when there is a whole). */
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
export const fmtNum = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
/** "80 %", or "—" without data. */
export const fmtPct = (n: number | null | undefined) => (known(n) ? `${n}${NBSP}%` : "—");
/** "12.5 d"; "< 1 d" for a same-day value (a real measurement, never "0 d"); "—" without data. */
export const fmtDays = (n: number | null | undefined) => (!known(n) ? "—" : n < 1 ? `<${NBSP}1${NBSP}d` : `${fmtNum(n)}${NBSP}d`);
/** A day count for a table cell: "12.5", "< 1" for a same-day value. */
export const fmtDayNum = (n: number) => (n < 1 ? `<${NBSP}1` : fmtNum(n));
/** A day count in a sentence: "under 1" or the whole number. */
const dayWord = (n: number) => (n < 1 ? "under 1" : fmtNum(Math.round(n)));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avgOrNull = (xs: number[]) => (xs.length ? round1(sum(xs) / xs.length) : null);
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Who holds the ball in each phase (the legacy live-portal phases count where they belonged). */
const SUPPLIER_PHASES: Phase[] = ["metadata", "supplier-input", "final-release"];
export const isSupplierPhase = (p: Phase) => SUPPLIER_PHASES.includes(p);

/** Chart colours with a fixed meaning across the whole report (colour follows the entity). */
export const SIDE_COLOR = { supplier: "var(--chart-4)", bdf: "var(--chart-1)" } as const;

// ------------------------------------------------------------------ review filter (RMM or a department)

/**
 * Restricts the open points and review tracks to one review (RMM or a department). Case-level facts (lead time,
 * intake, origin) stay untouched, so the same metric functions answer the department question.
 */
export function scopeToDept(state: AppState, dept: ReviewDept | ""): AppState {
  if (!dept) return state;
  return {
    ...state,
    cases: state.cases.map((c) => ({ ...c, openPoints: c.openPoints.filter((p) => p.dept === dept), reviews: c.reviews.filter((r) => r.dept === dept) })),
  };
}

// ------------------------------------------------------------------ the reporting period

/** "No case yet", or the first case's creation date (the report covers every case since then). */
export function periodView(state: AppState) {
  const first = [...state.cases].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  return { cases: state.cases.length, since: first?.createdAt };
}

// ------------------------------------------------------------------ 0: pipeline now

/** Thresholds shared with the RMM dashboard's "Needs your action". */
export const RELEASE_PENDING_DAYS = 5;
export const IDLE_DAYS = 10;

export type AttentionKey = "rejected" | "overdue-points" | "overdue-cases" | "release-pending" | "idle" | "origin";

export interface PipelineView {
  open: number;
  phases: { phase: Phase; label: string; count: number; side: "supplier" | "bdf"; to: string }[];
  attention: { key: AttentionKey; label: string; hint: string; cases: CiqCase[] }[];
  needsAttention: number;
  takeaway: string;
}

const since = (c: CiqCase) => c.phaseHistory.at(-1)?.at ?? c.createdAt;
const lastActivity = (c: CiqCase) => c.audit.reduce((m, a) => (a.at > m ? a.at : m), c.createdAt);
const daysAgo = (iso: string, now: string) => (Date.parse(now) - Date.parse(iso)) / DAY;

/** Open cases by phase and the counts that need attention (read-only for the business owner). */
export function pipelineView(state: AppState, now = nowIso()): PipelineView {
  const open = state.cases.filter((c) => !isClosed(c));
  const inPhase = (p: Phase) => open.filter((c) => c.phase === p || (p === "supplier-input" && c.phase === "metadata") || (p === "review" && c.phase === "scope-check")).length;
  const phases: PipelineView["phases"] = [
    { phase: "supplier-input", label: "Supplier filling in", count: inPhase("supplier-input"), side: "supplier", to: "/cases?tab=part1" },
    { phase: "review", label: "In review (RMM and departments)", count: inPhase("review"), side: "bdf", to: "/cases?tab=part2" },
    { phase: "final-release", label: "Awaiting final release", count: inPhase("final-release"), side: "supplier", to: "/cases?tab=part2" },
  ];
  const attention: PipelineView["attention"] = [
    { key: "rejected", label: "Department rejected", hint: "Safety or Regulatory recorded Rejected; RMM decides to continue or cancel", cases: open.filter((c) => rejectedDepts(c).length > 0) },
    { key: "overdue-points", label: "Overdue at the supplier", hint: "An open point is past its due date", cases: open.filter((c) => c.openPoints.some((p) => p.status === "open" && isOverdue(p.dueDate, now))) },
    { key: "overdue-cases", label: "Case past its due date", hint: "The case due date has passed", cases: open.filter((c) => isOverdue(c.dueDate, now)) },
    {
      key: "release-pending",
      label: `Release pending over ${RELEASE_PENDING_DAYS} days`,
      hint: "Every review completed; the supplier has not released yet",
      cases: open.filter((c) => c.phase === "final-release" && daysAgo(since(c), now) > RELEASE_PENDING_DAYS),
    },
    { key: "idle", label: `No activity for ${IDLE_DAYS} days`, hint: "Nobody acted on the case", cases: open.filter((c) => daysAgo(lastActivity(c), now) > IDLE_DAYS) },
    { key: "origin", label: "Origin without rules", hint: "Waste, carbon capture or chemical recycling: flagged on RMM's review", cases: open.filter((c) => rmmFlags(c).length > 0) },
  ];
  const needsAttention = new Set(attention.flatMap((a) => a.cases.map((c) => c.id))).size;
  let takeaway: string;
  if (!state.cases.length) takeaway = "No case has been started yet.";
  else if (!open.length) takeaway = "No case is open right now: every case is completed or cancelled.";
  else {
    const top = [...phases].sort((a, b) => b.count - a.count)[0];
    // A label keeps its own case after the first letter ("in review (RMM and departments)").
    const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
    const where =
      open.length === 1
        ? `1 open case, ${lc(top.label)}.`
        : top.count === open.length
          ? `${open.length} open cases, all ${lc(top.label)}.`
          : `${open.length} open cases: ${phases.filter((p) => p.count > 0).map((p) => `${p.count} ${lc(p.label)}`).join(", ")}.`;
    takeaway = `${where} ${needsAttention ? `${plural(needsAttention, "case needs", "cases need")} attention.` : open.length === 1 ? "It needs no attention." : "None needs attention."}`;
  }
  return { open: open.length, phases, attention, needsAttention, takeaway };
}

// ------------------------------------------------------------------ 1 + 2: lead time

export interface LeadTimeView {
  done: CiqCase[];
  phases: { phase: Phase; label: string; days: number; side: "supplier" | "bdf"; share: number }[];
  total: number;
  avgSupplier: number | null;
  avgBdf: number | null;
  supplierShare: number | null;
  perCase: { id: string; short: string; material: string; supplier: number; bdf: number; lead: number; supplierShare: number }[];
  phaseTakeaway: string;
  caseTakeaway: string;
}

export function leadTimeView(state: AppState): LeadTimeView {
  const done = state.cases.filter((c) => c.phase === "completed");
  const raw = leadTimeByPhase(state);
  const total = round1(sum(raw.map((p) => p.days ?? 0)));
  const phases = raw.map((p) => ({ phase: p.phase, label: PHASE_LABEL[p.phase], days: p.days ?? 0, side: isSupplierPhase(p.phase) ? ("supplier" as const) : ("bdf" as const), share: pct(p.days ?? 0, total) }));
  const now = nowIso();
  const perCase = [...done]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => {
      const w = waitSplit(c, now);
      return { id: c.id, short: c.id.slice(-4), material: c.materialName, supplier: round1(w.supplier), bdf: round1(w.bdf), lead: round1(leadTimeDays(c) ?? 0), supplierShare: pct(w.supplier, w.supplier + w.bdf) };
    });
  const supTotal = sum(perCase.map((x) => x.supplier));
  const bdfTotal = sum(perCase.map((x) => x.bdf));
  const supplierShare = done.length && supTotal + bdfTotal > 0 ? pct(supTotal, supTotal + bdfTotal) : null;

  const top2 = [...phases].sort((a, b) => b.days - a.days).slice(0, 2);
  const phaseTakeaway =
    done.length && total >= 1
      ? `${listJoin(top2.map((p) => `“${p.label}”`))} take ${fmtPct(pct(sum(top2.map((p) => p.days)), total))} of the lead time (${fmtNum(Math.round(sum(top2.map((p) => p.days))))} of ${fmtNum(Math.round(total))} days on average).`
      : done.length
        ? `${done.length === 1 ? "The completed case" : "The completed cases"} went through in less than a day, so there is no lead time to break down.`
        : "No case has been completed yet, so there is no lead time to break down.";

  let caseTakeaway = "No completed case yet.";
  if (perCase.length && perCase.every((x) => x.supplier + x.bdf < 1)) {
    caseTakeaway = perCase.length === 1 ? "The completed case went through in less than a day." : "Every completed case went through in less than a day.";
  } else if (perCase.length) {
    const sup = [...perCase].sort((a, b) => b.supplier - a.supplier);
    const bdf = [...perCase].sort((a, b) => b.bdf - a.bdf);
    const range = (lo: number, hi: number) => (Math.round(lo) === Math.round(hi) && lo >= 1 ? `${dayWord(hi)} days` : `${dayWord(lo)} to ${dayWord(hi)} days`);
    caseTakeaway = perCase.length === 1 ? `With the supplier: ${dayWord(sup[0].supplier)} days; with Beiersdorf: ${dayWord(bdf[0].bdf)} days.` : `With the supplier: ${range(sup.at(-1)!.supplier, sup[0].supplier)} per case (longest ${sup[0].id}); with Beiersdorf: ${range(bdf.at(-1)!.bdf, bdf[0].bdf)}.`;
  }
  return {
    done,
    phases,
    total,
    avgSupplier: done.length ? round1(supTotal / done.length) : null,
    avgBdf: done.length ? round1(bdfTotal / done.length) : null,
    supplierShare,
    perCase,
    phaseTakeaway,
    caseTakeaway,
  };
}

// ------------------------------------------------------------------ 3: monthly flow

export function flowView(state: AppState) {
  const rows = monthlyFlow(state);
  const thisMonth = new Date(nowIso()).getUTCMonth();
  const upTo = rows.slice(0, Math.min(rows.length, thisMonth + 1));
  // The last three months, but never before the first case: "since Aug" would name a month without any case.
  const first = [...state.cases].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const firstMonth = first ? new Date(first.createdAt).getUTCMonth() : thisMonth;
  const window = upTo.slice(-3).filter((_, i, w) => upTo.length - w.length + i >= firstMonth);
  const created = sum(window.map((r) => r.created));
  const completed = sum(window.map((r) => r.completed));
  const when = window.length <= 1 ? "this month" : `since ${window[0]?.month ?? ""}`;
  const totalCreated = sum(upTo.map((r) => r.created));
  const totalCompleted = sum(upTo.map((r) => r.completed));
  let takeaway: string;
  if (!totalCreated && !totalCompleted) takeaway = "No case has been started yet.";
  else if (!created && !completed) takeaway = `No case was started or completed ${when}.`;
  else if (created > completed) takeaway = `Intake outpaces completions: ${plural(created, "case")} started and ${completed} completed ${when}, so the pipeline grew by ${created - completed}.`;
  else takeaway = `Completions keep pace with intake: ${plural(completed, "case")} completed and ${created} started ${when}.`;
  return { rows: upTo, takeaway, created: totalCreated, completed: totalCompleted, empty: !totalCreated && !totalCompleted };
}

// ------------------------------------------------------------------ 4: review workload (RMM and departments)

export function workloadView(state: AppState, dept: ReviewDept | "") {
  const all = deptWorkload(state);
  const rows = dept ? all.filter((d) => d.dept === dept) : all;
  const withDays = all.filter((d): d is DeptLoad & { avgReviewDays: number } => known(d.avgReviewDays));
  const allAvg = avgOrNull(withDays.map((d) => d.avgReviewDays));
  const empty = rows.every((d) => d.active + d.completed + d.openPoints === 0);
  let takeaway: string;
  const d = dept ? rows[0] : undefined;
  if (dept && (!d || d.active + d.completed + d.openPoints === 0)) {
    takeaway = `${DEPT_SHORT[dept]}: no review yet.`;
  } else if (d) {
    takeaway = `${DEPT_SHORT[d.dept]}: ${plural(d.active, "active review")}, ${d.waitingSupplier} waiting for the supplier, ${plural(d.overdue, "overdue open point")}${known(d.avgReviewDays) ? (d.avgReviewDays < 1 ? "; its reviews so far were completed within a day" : `; an average review takes ${fmtDays(d.avgReviewDays)}${known(allAvg) ? ` (all reviews: ${fmtDays(allAvg)})` : ""}`) : "; no review completed yet"}.`;
  } else if (empty) {
    takeaway = "No review has started yet.";
  } else {
    const slowest = [...withDays].sort((a, b) => b.avgReviewDays - a.avgReviewDays)[0];
    const mostOverdue = [...all].sort((a, b) => b.overdue - a.overdue)[0];
    const overduePart =
      !mostOverdue || mostOverdue.overdue === 0
        ? "no open point is overdue."
        : mostOverdue.dept === slowest?.dept
          ? `it also has the most overdue open points (${mostOverdue.overdue}).`
          : `${DEPT_SHORT[mostOverdue.dept]} has the most overdue open points (${mostOverdue.overdue}).`;
    const active = sum(all.map((x) => x.active));
    takeaway = !slowest
      ? `${plural(active, "review")} in progress and none completed yet; ${overduePart}`
      : slowest.avgReviewDays < 1
        ? `Every review so far was completed within a day; ${overduePart.replace(/^it also has/, `${DEPT_SHORT[slowest.dept]} has`)}`
        : `${DEPT_SHORT[slowest.dept]} reviews take longest (${fmtDays(slowest.avgReviewDays)} on average vs ${fmtDays(allAvg)} across RMM and the departments); ${overduePart}`;
  }
  return { rows, takeaway, empty, chart: rows.map((x) => ({ dept: DEPT_SHORT[x.dept], active: x.active, waiting: x.waitingSupplier, overdue: x.overdue })) };
}

// ------------------------------------------------------------------ 5: origin mix

/** Fixed colour per origin group (colour follows the entity, never its rank). */
export type OriginGroup = "vegetable" | "animal" | "mineral" | "petrochemical" | "polymer" | "recovered";
const ORIGIN_GROUPS: { id: OriginGroup; label: string; color: string; members: OriginType[] }[] = [
  { id: "vegetable", label: ORIGIN_LABEL.vegetable.split(" (")[0], color: "var(--chart-1)", members: ["vegetable"] },
  { id: "animal", label: ORIGIN_LABEL.animal, color: "var(--chart-2)", members: ["animal"] },
  { id: "mineral", label: ORIGIN_LABEL.mineral, color: "var(--chart-3)", members: ["mineral"] },
  { id: "petrochemical", label: ORIGIN_LABEL.petrochemical, color: "var(--chart-4)", members: ["petrochemical"] },
  { id: "polymer", label: ORIGIN_LABEL.polymer, color: "var(--chart-5)", members: ["polymer"] },
  { id: "recovered", label: "Waste, CCU or chemical recycling", color: "var(--chart-6)", members: ["waste", "ccu", "chemrec"] },
];

export function originView(state: AppState) {
  const counts = casesByOrigin(state);
  const casesTotal = state.cases.length;
  const answered = state.cases.filter((c) => (c.config.SF01 ?? []).length > 0).length;
  const groups = ORIGIN_GROUPS.map((g) => ({ ...g, count: sum(counts.filter((x) => g.members.includes(x.origin)).map((x) => x.count)) })).filter((g) => g.count > 0);
  const top = [...groups].sort((a, b) => b.count - a.count)[0];
  let takeaway = casesTotal ? "No case has answered the origin question (SF-01) yet." : "No case has been started yet.";
  if (top) {
    const rules = ruleSet(state.activeRuleSet).rules.filter((r) => r.question === "SF01" && top.members.some((m) => r.when({ SF01: [m] })));
    const sections = [...new Set(rules.flatMap((r) => r.activates))].map((id) => SECTION_BY_ID[id]?.code ?? id);
    const rulePart = sections.length ? ` and switches on ${listJoin(sections)} (${rules.map((r) => r.id).join(", ")})` : "";
    takeaway = `${top.label} origin appears in ${top.count} of ${plural(casesTotal, "case")} (${fmtPct(pct(top.count, casesTotal))})${rulePart}.`;
  }
  return { groups, casesTotal, answered, mentions: sum(groups.map((g) => g.count)), takeaway };
}

// ------------------------------------------------------------------ 6: query hotspots

const tiedNames = (codes: string[]) => (codes.length > 2 ? `${codes.slice(0, 2).join(", ")} and ${codes.length - 2} more` : listJoin(codes));

export function hotspotView(scoped: AppState, dept: ReviewDept | "", max = 9) {
  const spots = queryHotspots(scoped);
  const total = sum(spots.map((s) => s.count));
  const head = spots.slice(0, max).map((s) => ({ id: s.sectionId, label: sectionLabel(s.sectionId), value: s.count, share: pct(s.count, total), lead: SECTION_BY_ID[s.sectionId]?.lead }));
  const tail = spots.slice(max);
  const rows = tail.length ? [...head, { id: "other", label: `Other sections (${tail.length})`, value: sum(tail.map((t) => t.count)), share: pct(sum(tail.map((t) => t.count)), total), lead: undefined }] : head;
  const who = dept ? `For ${DEPT_SHORT[dept]}, ` : "";
  const top = spots[0]?.count ?? 0;
  const tied = spots.filter((s) => s.count === top);
  let takeaway: string;
  if (!spots.length) takeaway = dept ? `${DEPT_LABEL[dept]} has not raised any open point yet.` : "No open point has been raised yet.";
  else if (tied.length === 1) takeaway = `${who}${sectionLabel(spots[0].sectionId)} draws the most open points (${top} of ${total}, ${fmtPct(pct(top, total))}): clearer help texts there would save query rounds.`;
  else
    takeaway = `${dept ? `For ${DEPT_SHORT[dept]}, open` : "Open"} points are spread out: ${tied.length} sections have ${top} each (${tiedNames(tied.map((t) => SECTION_BY_ID[t.sectionId]?.code ?? t.sectionId))}), so there is no single hotspot yet.`;
  return { rows, total, takeaway, highlight: Math.min(tied.length, head.length) };
}

// ------------------------------------------------------------------ 7: clarifications and supplier performance

export const LATE_BELOW_PCT = 80;
export const SLOW_FACTOR = 1.3;

/** Open points in the selection: raised, average rounds, share answered by the due date. */
export function clarificationView(scoped: AppState) {
  const ops = scoped.cases.flatMap((c) => c.openPoints);
  const answered = ops.map((p) => ({ p, a: p.thread.find((m) => m.side === "supplier") })).filter((x) => x.a);
  const onTime = answered.filter((x) => Date.parse(x.a!.at) <= Date.parse(x.p.dueDate)).length;
  return {
    raised: ops.length,
    answered: answered.length,
    avgRounds: kpis(scoped).avgRounds,
    onTimePct: answered.length ? Math.round((onTime / answered.length) * 100) : null,
  };
}

export type SupplierFlag = "late" | "slow" | null;

export function supplierView(scoped: AppState) {
  const rows = supplierPerformance(scoped);
  const answeredAvgs = rows.map((r) => r.avgResponseDays).filter(known);
  const overall = avgOrNull(answeredAvgs);
  const flag = (r: SupplierPerf): SupplierFlag =>
    r.queries === 0 ? null : known(r.onTimePct) && r.onTimePct < LATE_BELOW_PCT ? "late" : known(overall) && overall > 0 && known(r.avgResponseDays) && r.avgResponseDays > overall * SLOW_FACTOR ? "slow" : null;
  // Suppliers with an answered point; a same-day average (under one day) is a real answer, not "no data".
  const answered = rows.filter((r): r is SupplierPerf & { avgResponseDays: number } => r.queries > 0 && known(r.avgResponseDays));
  const slowest = [...answered].sort((a, b) => b.avgResponseDays - a.avgResponseDays)[0];
  const late = rows.filter((r) => flag(r) === "late");
  const parts: string[] = [];
  if (slowest && slowest.avgResponseDays < 1) parts.push(answered.length > 1 ? "Every supplier answers within a day on average." : `${slowest.name} answers within a day on average.`);
  else if (slowest && answered.length > 1) parts.push(`Slowest answers: ${slowest.name} (${fmtDays(slowest.avgResponseDays)} vs a supplier average of ${fmtDays(overall)}).`);
  else if (slowest) parts.push(`${slowest.name} answers in ${fmtDays(slowest.avgResponseDays)} on average.`);
  // Names like "Co., Ltd." already end in a full stop; don't add a second one.
  if (late.length) parts.push(`Below ${fmtPct(LATE_BELOW_PCT)} on time: ${listJoin(late.map((l) => l.name))}`.replace(/\.?$/, "."));
  const anyQueries = rows.some((r) => r.queries > 0);
  const takeaway = parts.length ? parts.join(" ") : anyQueries ? "No supplier has answered a query yet." : "No supplier has received a query in this selection.";
  return { rows, overall, flag, takeaway, anyQueries };
}

export { kpis };
