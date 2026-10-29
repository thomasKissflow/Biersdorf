// /reports (Business owner): Pipeline now · Lead time · Intake and workload · Clarifications and supplier performance.
// Measured data only, calculated live from the cases; every metric without data shows "—".
// Phones (< 768 px, Thomas 30 Oct): the cards stack; the review filter is a 44 px target; the wide tables are cards.
import { BarChart3, Download, Filter, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, EmptyState, PageHeader, Select, StatCard, cx } from "@/components/ui";
import { DEPT_LABEL, DEPT_SHORT, REVIEW_TRACK_DEPTS } from "@/domain/catalog";
import { fmtMetric, monthlyFlow } from "@/domain/metrics";
import { fmtDate } from "@/domain/selectors";
import type { ReviewDept } from "@/domain/types";
import { PHONE_FIELDS } from "@/features/rmm/phone";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";
import { FlowCard, OriginCard, WorkloadCard } from "./IntakeCards";
import { LeadTimeCard, WaitSplitCard } from "./LeadTimeCards";
import { AttentionCard, PipelineCard } from "./PipelineCards";
import { HotspotCard, SupplierPerfCard } from "./SupplierCards";
import { clarificationView, flowView, fmtPct, hotspotView, kpis, leadTimeView, originView, periodView, pipelineView, scopeToDept, supplierView, workloadView } from "./reportData";

function Section({ id, title, hint, children, className }: { id: string; title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section data-testid={`report-section-${id}`} aria-labelledby={`rs-${id}`} className={cx("space-y-3", className)}>
      <div>
        <h2 id={`rs-${id}`} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The numbers on the page as CSV rows: the pipeline tiles and phases, lead time, and the workload per review. */
function reportCsv({ all, pipe, work, dept }: { all: ReturnType<typeof kpis>; pipe: ReturnType<typeof pipelineView>; work: ReturnType<typeof workloadView>["rows"]; dept: ReviewDept | "" }): string[][] {
  const n = (v: number | null) => (v === null ? "" : String(v));
  const rows: string[][] = [["Section", "Measure", "Value"]];
  rows.push(["Pipeline now", "Open cases", n(all.open)], ["Pipeline now", "With the supplier", n(all.withSupplier)], ["Pipeline now", "With Beiersdorf", n(all.withBdf)], ["Pipeline now", "Overdue open points", n(all.overduePoints)]);
  for (const p of pipe.phases) rows.push(["Pipeline now", p.label, n(p.count)]);
  rows.push(["Lead time", "Completed cases", n(all.completed)], ["Lead time", "Average lead time (days)", n(all.avgLeadTime)]);
  rows.push([], ["Review", "Active", "Waiting for supplier", "Open points", "Overdue", "Completed", "Average review (days)"]);
  for (const d of work) rows.push([DEPT_LABEL[d.dept], n(d.active), n(d.waitingSupplier), n(d.openPoints), n(d.overdue), n(d.completed), n(d.avgReviewDays)]);
  if (dept) rows.push([], ["Filter on screen", DEPT_LABEL[dept], "the file holds every review"]);
  return rows;
}

/** Saves the rows as a CSV file (UTF-8 with BOM, so Excel shows the umlauts) and returns its name. */
function downloadCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const name = `ciq-report-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/** "Download CSV" is hidden for now (Thomas, 15 Oct); the export code stays for later. */
const SHOW_CSV_EXPORT = false;

export function Reports() {
  const { state, notify } = useStore();
  const [dept, setDept] = useState<ReviewDept | "">("");
  const phone = useIsPhone();

  const scoped = useMemo(() => scopeToDept(state, dept), [state, dept]);
  const all = useMemo(() => kpis(state), [state]);
  const dk = useMemo(() => kpis(scoped), [scoped]);
  const period = useMemo(() => periodView(state), [state]);
  const pipe = useMemo(() => pipelineView(state), [state]);
  const lead = useMemo(() => leadTimeView(state), [state]);
  const flow = useMemo(() => flowView(state), [state]);
  const origin = useMemo(() => originView(state), [state]);
  const work = useMemo(() => workloadView(state, dept), [state, dept]);
  const spots = useMemo(() => hotspotView(scoped, dept), [scoped, dept]);
  const clar = useMemo(() => clarificationView(scoped), [scoped]);
  const sup = useMemo(() => supplierView(scoped), [scoped]);
  const completedSpark = useMemo(() => monthlyFlow(state).map((m) => m.completed), [state]);
  const deptOnly = dept ? `${DEPT_SHORT[dept]} only` : undefined;
  const empty = state.cases.length === 0;

  // the review filter and Download CSV: the header's actions on a big screen, under the title on a phone
  const tools = (
    <div className="flex w-full max-w-[calc(100vw-2rem)] flex-wrap items-start gap-2 sm:w-auto">
      <label className={cx("flex min-w-0 basis-full items-center gap-2 text-[13px] text-ink-2 sm:basis-auto", phone && PHONE_FIELDS)}>
        <Filter size={15} className="text-ink-3" />
        <span className="sr-only sm:not-sr-only">Review</span>
        <Select data-testid="reports-dept-filter" value={dept} onChange={(e) => setDept(e.target.value as ReviewDept | "")} className="w-full sm:w-52" aria-label="Filter by review (RMM or department)">
          <option value="">RMM and all departments</option>
          {REVIEW_TRACK_DEPTS.map((d) => (
            <option key={d} value={d}>
              {DEPT_LABEL[d]}
            </option>
          ))}
        </Select>
      </label>
      {SHOW_CSV_EXPORT && (
        <Button
          data-testid="reports-export"
          icon={<Download size={15} />}
          onClick={() => {
            const name = downloadCsv(reportCsv({ all, pipe, work: workloadView(state, "").rows, dept }));
            notify("success", `${name} downloaded: the report numbers as a CSV file (opens in Excel).`);
          }}
        >
          Download CSV
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-8" data-testid="reports">
      <div>
        <PageHeader
          eyebrow="Reports"
          title="CIQ performance"
          subtitle={
            empty
              ? "Pipeline, lead time, workload and supplier performance, calculated live from the CIQ cases."
              : `${plural(period.cases, "CIQ case")} since ${fmtDate(period.since)}, calculated live. Every chart can be switched to a table with the same numbers.`
          }
          actions={phone ? undefined : tools}
        >
          {/* a phone: the filter under the title, the whole width (the header's actions column is only as wide as its content) */}
          {phone && <div className="mt-3">{tools}</div>}
        </PageHeader>
        {/* Below the header row, so the filter stays beside the title instead of being pushed under the banner. */}
        {dept && (
          <div role="status" data-testid="reports-filter-banner" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink-2">
            <span className="min-w-0 flex-1 basis-80">
              Filtered to <span className="font-semibold text-ink">{DEPT_LABEL[dept]}</span>: overdue open points, review workload, clarifications and supplier performance. The pipeline, lead time, flow and origin mix
              are case-level and stay unfiltered.
            </span>
            <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setDept("")}>
              Clear filter
            </Button>
          </div>
        )}
      </div>

      {empty && (
        <Card>
          <EmptyState data-testid="empty-reports" icon={<BarChart3 size={22} />} title="No CIQ case yet">
            The reports fill in as soon as Raw Material Management starts cases. Each section below shows what it will measure.
          </EmptyState>
        </Card>
      )}

      <Section id="pipeline" title="Pipeline now" hint="Open cases, who holds the ball and what needs attention today.">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard data-testid="kpi-open" label="Open cases" value={all.open} hint={all.open ? "not completed or cancelled" : "none open"} />
          <StatCard data-testid="kpi-with-supplier" label="With the supplier" value={all.withSupplier} hint="filling in, answering or releasing" />
          <StatCard data-testid="kpi-with-bdf" label="With Beiersdorf" value={all.withBdf} hint="in review by RMM or a department" />
          <StatCard
            data-testid="kpi-overdue-points"
            label="Overdue open points"
            value={dk.overduePoints}
            tone={dk.overduePoints > 0 ? "bad" : "neutral"}
            hint={deptOnly ?? (dk.overduePoints > 0 ? "past their due date" : "none past due")}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <PipelineCard v={pipe} />
          <AttentionCard v={pipe} />
        </div>
      </Section>

      <Section id="lead-time" title="Lead time" hint={lead.done.length ? `Completed cases (${lead.done.length}), from case creation to completion.` : "From case creation to completion, over completed cases."}>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <StatCard
            data-testid="kpi-lead-time"
            label="Average lead time"
            value={all.avgLeadTime !== null && all.avgLeadTime < 1 ? "< 1" : fmtMetric(all.avgLeadTime)}
            unit={all.avgLeadTime === null ? undefined : all.avgLeadTime < 1 ? "day" : "days"}
            hint={all.avgLeadTime === null ? "after the first completed case" : `creation to completion, ${plural(all.completed, "case")}`}
          />
          <StatCard data-testid="kpi-completed" label="Completed" value={all.completed} hint={empty ? "no case yet" : `since ${fmtDate(period.since)}`} spark={all.completed > 0 ? completedSpark : undefined} />
          <StatCard
            data-testid="kpi-first-time-right"
            label="First time right"
            value={fmtPct(all.firstTimeRight)}
            hint={all.firstTimeRight === null ? "after the first case reaches the review" : "reached the review, no open point"}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <LeadTimeCard v={lead} />
          <WaitSplitCard v={lead} />
        </div>
      </Section>

      <Section id="intake" title="Intake and workload" hint="Every case, open ones included. Workload covers RMM's review of the whole CIQ and each department's review.">
        <div className="grid gap-4 lg:grid-cols-2">
          <FlowCard v={flow} />
          <OriginCard v={origin} />
        </div>
        <WorkloadCard v={work} />
      </Section>

      <Section id="clarifications" title="Clarifications and supplier performance" hint="Open points raised by RMM and the departments, and how suppliers answer them.">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <StatCard data-testid="kpi-points-raised" label="Open points raised" value={clar.raised} hint={deptOnly ?? "questions, document requests and added sections"} />
          <StatCard data-testid="kpi-rounds" label="Average query rounds" value={fmtMetric(clar.avgRounds)} hint={clar.avgRounds === null ? "after the first open point" : (deptOnly ?? "per open point")} />
          <StatCard data-testid="kpi-on-time" label="Answered on time" value={fmtPct(clar.onTimePct)} hint={clar.onTimePct === null ? "after the first answer" : `${plural(clar.answered, "answer")}, by the due date`} />
        </div>
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <HotspotCard v={spots} />
          <SupplierPerfCard v={sup} filtered={dept ? DEPT_SHORT[dept] : null} />
        </div>
      </Section>
    </div>
  );
}
