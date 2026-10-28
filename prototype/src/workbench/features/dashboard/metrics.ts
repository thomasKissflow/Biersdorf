// Dashboard metrics (pure; the RMM dashboard, the Business owner's "Operations" and the Reports page share them).
// Modelled on the prototype's domain/metrics + features/rmm/attention.ts, but computed from the LIVE view models only.
// Nothing here reads or writes. A number built on a list the user cannot read completely is marked partial by the
// caller (coverageOf); a number that needs data the app does not record yet is null, never invented.
import type { Tone } from "@/components/ui/primitives";
import { DEPTS, type Dept, type StepIr } from "../../schema";
import { crBelongsTo, crOpenness, pointBelongsTo, pointOpenness } from "../../data/counts";
import type { AuditVM, CaseVM, CrVM, ListQuality, PointVM, RunVM } from "../../data/viewModels";
import { CASE_STEPPER, DEPT_LABEL, stepLabel } from "../../domain/labels";
import { stepperKey } from "../case/stepLogic";
import { fmtDate, isOverdue } from "../case/shared";

const DAY = 86_400_000;

export interface OpsInput {
  cases: CaseVM[];
  points: PointVM[];
  crs: CrVM[];
  events: AuditVM[];
  runs: RunVM[];
}

// ---------------------------------------------------------------- read coverage

export interface Coverage {
  cases: boolean;
  points: boolean;
  crs: boolean;
  events: boolean;
  runs: boolean;
}
/** Complete = every item of the list was readable: rung 1 for a Process, a full Form read. Anything else is partial. */
export const completeRead = (q: ListQuality | undefined): boolean => q === "admin" || q === "form";
export function coverageOf(q: Record<keyof Coverage, ListQuality | undefined>, indexOnlyCases = 0): Coverage {
  return { cases: completeRead(q.cases) && indexOnlyCases === 0, points: completeRead(q.points), crs: completeRead(q.crs), events: completeRead(q.events), runs: completeRead(q.runs) };
}

const NOUN: Record<keyof Coverage, string> = { cases: "cases", points: "open points", crs: "change requests", events: "audit events", runs: "scope runs" };
/** The lists behind a card that are partial, in plain words ("cases and open points"); undefined when all are complete. */
export function partialWhat(cov: Coverage, keys: (keyof Coverage)[]): string | undefined {
  const xs = keys.filter((k) => !cov[k]).map((k) => NOUN[k]);
  return xs.length ? (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`) : undefined;
}

// ---------------------------------------------------------------- basics

/** Cases the dashboards count: no test cases, no unsubmitted drafts. Their points and change requests likewise. */
export function scopeOps(i: OpsInput): OpsInput {
  const test = i.cases.filter((c) => c.isTest);
  const testIds = new Set(test.map((c) => c._id));
  return {
    ...i,
    cases: i.cases.filter((c) => !c.isTest && c.status !== "draft"),
    points: i.points.filter((p) => !(p.caseItemId && testIds.has(p.caseItemId))),
    crs: i.crs.filter((cr) => !test.some((c) => crBelongsTo(cr, c))),
  };
}

export const isOpenCase = (c: CaseVM): boolean => c.status === "in-progress";

/** The steps where the case waits on the supplier (recorded by hand by the RMM). */
export const SUPPLIER_STEPS: StepIr[] = ["CASE_S1", "CASE_S3", "CASE_S7"];
export type Side = "supplier" | "bdf" | "unknown";
export function caseSide(c: CaseVM): Side {
  const k = stepperKey(c);
  if (!k || k === "END") return "unknown";
  return SUPPLIER_STEPS.includes(k) ? "supplier" : "bdf";
}

/** An open point waits on the supplier at "Waiting for supplier" (OPNT_S1). Without a readable step: a supplier point
 *  with no response and no outcome recorded yet. Internal points never wait on the supplier. */
export function pointWaitsOnSupplier(p: PointVM): boolean {
  if (p.step) return p.step === "OPNT_S1";
  return p.toSupplier && !p.responseKind && !p.outcome;
}
export const isOpenPoint = (p: PointVM): boolean => pointOpenness(p).open;
/** Overdue: past the supplier due date while it waits on the supplier, else past the internal due date. */
export function pointOverdue(p: PointVM, now: Date): boolean {
  if (!isOpenPoint(p)) return false;
  return pointWaitsOnSupplier(p) ? isOverdue(p.supplierDueDate, now) : isOverdue(p.internalDueDate, now);
}
export const pointOverdueAtSupplier = (p: PointVM, now: Date): boolean => isOpenPoint(p) && pointWaitsOnSupplier(p) && isOverdue(p.supplierDueDate, now);

const ms = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const t = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime() : Date.parse(s);
  return Number.isFinite(t) ? t : null;
};
/** Days from a to b (one decimal); null when either is missing or b lies before a. */
export function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = ms(a);
  const y = ms(b);
  if (x === null || y === null || y < x) return null;
  return Math.round(((y - x) / DAY) * 10) / 10;
}
const wholeDaysSince = (s: string | null | undefined, now: Date): number | null => {
  const t = ms(s);
  return t === null ? null : Math.max(0, Math.floor((now.getTime() - t) / DAY));
};
export const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** When the case was created: the item's _created_at, else its F8 "Item created" row. */
export function createdIndex(cases: CaseVM[], events: AuditVM[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of events) if (e.category === "Item created" && e.objectKind === "Case" && e.caseItemId && e.at && !out.has(e.caseItemId)) out.set(e.caseItemId, e.at);
  for (const c of cases) if (c.createdAt) out.set(c._id, c.createdAt);
  return out;
}

/** Lead time to final release (the close step has no recorded time yet). */
export const leadDays = (c: CaseVM, created: Map<string, string>): number | null => daysBetween(created.get(c._id), c.finalRelease.at);

// ---------------------------------------------------------------- KPIs

export interface Kpis {
  open: number;
  /** Open cases past the supplier due date. */
  pastDue: number;
  withSupplier: number;
  withBdf: number;
  /** Open cases whose step is not readable with this access. */
  stepUnknown: number;
  /** Cases whose status is not readable (index-only rows, or no status on the row). */
  statusUnknown: number;
  completed: number;
  cancelled: number;
  openPoints: number;
  overduePointsAtSupplier: number;
  openCrs: number;
  /** Average days from creation to the supplier's final release; null when no case has both times. */
  avgLeadDays: number | null;
  leadN: number;
  /** % of cases at or past final release that never had a supplier open point; null when not computable. */
  firstTimeRight: number | null;
  ftrN: number;
  /** Average query rounds per supplier open point; null when none. */
  avgRounds: number | null;
}

export function kpis(i: OpsInput, now: Date, cov: Pick<Coverage, "points">): Kpis {
  const open = i.cases.filter(isOpenCase);
  const created = createdIndex(i.cases, i.events);
  const leads = i.cases.map((c) => leadDays(c, created)).filter((x): x is number => x !== null);
  // first-time-right needs EVERY open point of the case: a partial points list would overstate it
  const released = i.cases.filter((c) => !!c.finalRelease.at || c.status === "completed");
  const ftr = cov.points && released.length ? Math.round((released.filter((c) => !i.points.some((p) => p.toSupplier && pointBelongsTo(p, c))).length / released.length) * 100) : null;
  const rounds = i.points.filter((p) => p.toSupplier && p.status !== "draft").map((p) => p.roundNo).filter((x): x is number => x !== null && x > 0);
  return {
    open: open.length,
    pastDue: open.filter((c) => isOverdue(c.supplierDueDate, now)).length,
    withSupplier: open.filter((c) => caseSide(c) === "supplier").length,
    withBdf: open.filter((c) => caseSide(c) === "bdf").length,
    stepUnknown: open.filter((c) => caseSide(c) === "unknown").length,
    statusUnknown: i.cases.filter((c) => c.status === "unknown").length,
    completed: i.cases.filter((c) => c.status === "completed").length,
    cancelled: i.cases.filter((c) => c.cancelled).length,
    openPoints: i.points.filter(isOpenPoint).length,
    overduePointsAtSupplier: i.points.filter((p) => pointOverdueAtSupplier(p, now)).length,
    openCrs: i.crs.filter((cr) => crOpenness(cr).open).length,
    avgLeadDays: avg(leads),
    leadN: leads.length,
    firstTimeRight: ftr,
    ftrN: released.length,
    avgRounds: avg(rounds),
  };
}

// ---------------------------------------------------------------- needs attention

export type AttentionKind = "rejected" | "overdue-points" | "supplier-late" | "scope-check" | "open-items" | "idle";
export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  c: CaseVM;
  tone: Tone;
  title: string;
  detail: string;
  /** Days overdue or idle; null when the start of the wait is not recorded. */
  days: number | null;
  cta: string;
  to: string;
}

export const ATTENTION_LABEL: Record<AttentionKind, string> = {
  rejected: "Decision “Rejected”",
  "overdue-points": "Overdue at supplier",
  "supplier-late": "Supplier step past due",
  "scope-check": "Scope check",
  "open-items": "Open items check",
  idle: "No activity",
};
const RANK: Record<AttentionKind, number> = { rejected: 0, "overdue-points": 1, "supplier-late": 2, "scope-check": 3, "open-items": 4, idle: 5 };
export const IDLE_DAYS = 10;

/** The last recorded activity on a case: creation, supplier confirmations, lane completions, its F8 rows and point
 *  reviews. Null when none is readable. */
export function lastActivity(c: CaseVM, i: OpsInput, created: Map<string, string>): string | null {
  const times = [created.get(c._id), c.completeness.at, c.finalRelease.at, ...DEPTS.map((d) => c.lanes[d]?.completedAt)];
  for (const e of i.events) if (e.caseItemId === c._id) times.push(e.at);
  for (const p of i.points) if (pointBelongsTo(p, c)) times.push(p.reviewedAt);
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const t of times) {
    const m = ms(t);
    if (m !== null && m > bestMs) {
      bestMs = m;
      best = t!;
    }
  }
  return best;
}

/** Everything that waits on the case owner, most urgent first. `idle` only when the audit log was read completely. */
export function attentionItems(i: OpsInput, cases: CaseVM[], now: Date, cov: Pick<Coverage, "events">): AttentionItem[] {
  const out: AttentionItem[] = [];
  const created = createdIndex(i.cases, i.events);
  for (const c of cases.filter(isOpenCase)) {
    const flagged = out.length;
    const to = `/cases/${c._id}`;
    for (const d of ["REG", "SAF"] as const)
      if (c.lanes[d]?.rmesDecision === "Rejected")
        out.push({ key: `${c._id}-rej-${d}`, kind: "rejected", c, tone: "bad", title: `${DEPT_LABEL[d]} recorded “Rejected”`, detail: c.lanes[d].rmesDecisionReason ? `Reason: ${c.lanes[d].rmesDecisionReason}` : "No reason recorded.", days: null, cta: "Open case", to: `${to}?tab=lanes` });
    if (c.overallDecision === "Rejected")
      out.push({ key: `${c._id}-rej-overall`, kind: "rejected", c, tone: "bad", title: "Overall approval recorded “Rejected”", detail: c.overallReason ? `Reason: ${c.overallReason}` : "No reason recorded.", days: null, cta: "Open case", to });

    const late = i.points.filter((p) => pointBelongsTo(p, c) && pointOverdueAtSupplier(p, now));
    if (late.length) {
      const oldest = late.reduce((a, b) => (a.supplierDueDate < b.supplierDueDate ? a : b));
      out.push({
        key: `${c._id}-late`,
        kind: "overdue-points",
        c,
        tone: "bad",
        title: `${late.length} open point${late.length > 1 ? "s" : ""} overdue at the supplier`,
        detail: `Oldest: ${oldest.opKey || "open point"}${oldest.refLabel ? ` on ${oldest.refLabel}` : ""}, due ${fmtDate(oldest.supplierDueDate)}.`,
        days: wholeDaysSince(oldest.supplierDueDate, now),
        cta: "Review open points",
        to: `${to}?tab=points`,
      });
    }

    const k = stepperKey(c);
    const due = k === "CASE_S7" ? c.finalRelease.dueDate : k === "CASE_S1" || k === "CASE_S3" ? c.completeness.dueDate || c.supplierDueDate : "";
    if (due && isOverdue(due, now))
      out.push({ key: `${c._id}-supplier`, kind: "supplier-late", c, tone: "warn", title: `“${stepLabel(k as StepIr)}” is past its due date`, detail: `Due ${fmtDate(due)}. The supplier's answer is recorded by hand at this step.`, days: wholeDaysSince(due, now), cta: "Open case", to });
    if (k === "CASE_S2") out.push({ key: `${c._id}-scope`, kind: "scope-check", c, tone: "warn", title: "Scope check and release pending", detail: "The derived sections and departments wait for the RMM's check.", days: null, cta: "Open case", to });
    if (k === "CASE_S5" || k === "CASE_S8") out.push({ key: `${c._id}-items`, kind: "open-items", c, tone: "warn", title: `“${stepLabel(k)}” pending`, detail: "Open points and change requests are checked before the case moves on.", days: null, cta: "Open case", to });

    if (cov.events && out.length === flagged) {
      const idle = wholeDaysSince(lastActivity(c, i, created), now);
      if (idle !== null && idle > IDLE_DAYS) out.push({ key: `${c._id}-idle`, kind: "idle", c, tone: "neutral", title: `No activity for ${idle} days`, detail: isOverdue(c.supplierDueDate, now) ? "The supplier due date has passed." : "No recorded step, review or event since then.", days: idle, cta: "Open case", to: `${to}?tab=audit` });
    }
  }
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind] || (b.days ?? -1) - (a.days ?? -1));
}

// ---------------------------------------------------------------- bottleneck by step

export interface StepRow {
  step: StepIr;
  label: string;
  side: Exclude<Side, "unknown">;
  count: number;
  pastDue: number;
}
/** Open cases per case step, in workflow order (Part 2 counts once per case). Steps nobody can sit on are left out. */
export function bottleneckByStep(cases: CaseVM[], now: Date): { rows: StepRow[]; unknown: number; top: StepRow | null } {
  const open = cases.filter(isOpenCase);
  const rows: StepRow[] = [];
  for (const s of CASE_STEPPER) {
    if (s.key === "END") continue;
    const at = open.filter((c) => stepperKey(c) === s.key);
    if (s.key === "CASE_S0" && !at.length) continue;
    if (s.key === "CASE_S6" && !at.length && !open.some((c) => c.overallApprovalRequired)) continue;
    rows.push({ step: s.key, label: s.label, side: SUPPLIER_STEPS.includes(s.key) ? "supplier" : "bdf", count: at.length, pastDue: at.filter((c) => isOverdue(c.supplierDueDate, now)).length });
  }
  const top = [...rows].sort((a, b) => b.count - a.count)[0];
  return { rows, unknown: open.filter((c) => !stepperKey(c)).length, top: top && top.count > 0 ? top : null };
}

// ---------------------------------------------------------------- departments

export interface DeptRow {
  dept: Dept;
  label: string;
  /** Open cases in Part 2 whose review track of this department is active and not completed. */
  inReview: number;
  pointsAtSupplier: number;
  pointsAtBdf: number;
  overduePoints: number;
  /** Open change requests with impact "Yes" for this department and no assessment yet. */
  crToAssess: number;
}
export function byDepartment(i: OpsInput, now: Date): DeptRow[] {
  const part2 = i.cases.filter((c) => isOpenCase(c) && stepperKey(c) === "CASE_PAR");
  const openPoints = i.points.filter(isOpenPoint);
  const openCrs = i.crs.filter((cr) => crOpenness(cr).open);
  return DEPTS.map((d) => {
    const pts = openPoints.filter((p) => p.dept === d);
    const imp = d === "RMM" ? undefined : d;
    return {
      dept: d,
      label: DEPT_LABEL[d],
      inReview: part2.filter((c) => c.lanes[d]?.active && !c.lanes[d].complete).length,
      pointsAtSupplier: pts.filter(pointWaitsOnSupplier).length,
      pointsAtBdf: pts.filter((p) => !pointWaitsOnSupplier(p)).length,
      overduePoints: pts.filter((p) => pointOverdue(p, now)).length,
      crToAssess: imp ? openCrs.filter((cr) => cr.impacts[imp]?.impact === "Yes" && !cr.impacts[imp]?.assessment).length : 0,
    };
  }).filter((r) => r.dept !== "RMM" || r.inReview + r.pointsAtSupplier + r.pointsAtBdf + r.crToAssess > 0);
}
