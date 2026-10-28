// Reports (#/reports) for the RMM, the Overall approver and the Business owner. Modelled on the prototype's
// src/features/reports/Reports.tsx, from live data (useOps), read-only. A focused set: KPIs, lead time by stage, where
// cases wait, departments, suppliers. Numbers the app does not record yet are named, not estimated.
import { useMemo } from "react";
import { PageHeader, cx } from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/data";
import { LoadingCard, Page } from "../case/shared";
import { BottleneckCard, DeptCard } from "../dashboard/cards";
import { OpsBanners } from "../dashboard/Dashboard";
import { bottleneckByStep, byDepartment, kpis, partialWhat } from "../dashboard/metrics";
import { useOps } from "../dashboard/useOps";
import { LeadTimeCard, SupplierCard } from "./cards";
import { fmtNum, leadTimeView, supplierPerformance } from "./metrics";

function Section({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("space-y-3", className)}>
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Reports() {
  const ops = useOps();
  const now = useMemo(() => new Date(), [ops.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = ops.data;
  const cov = ops.coverage;
  const k = useMemo(() => (d ? kpis(d, now, cov) : null), [d, now, cov]);
  const lead = useMemo(() => (d ? leadTimeView(d) : null), [d]);
  const steps = useMemo(() => (d ? bottleneckByStep(d.cases, now) : null), [d, now]);
  const depts = useMemo(() => (d ? byDepartment(d, now) : []), [d, now]);
  const sup = useMemo(() => (d ? supplierPerformance(d, now) : null), [d, now]);
  const pc = partialWhat(cov, ["cases"]);
  const pp = partialWhat(cov, ["points"]);
  const tag = (hint: string, partial?: string) => (partial ? `${hint} · partial` : hint);

  return (
    <Page testId="wb-reports">
      <PageHeader
        eyebrow="Reports"
        title="CIQ performance"
        subtitle={d ? `Calculated live from the ${d.cases.length} CIQ case${d.cases.length === 1 ? "" : "s"} you can read. Test cases are not counted. Every chart can be switched to a table with the same numbers.` : "Calculated live from the CIQ cases you can read."}
      />
      <OpsBanners ops={ops} />
      {!d || !k || !lead || !steps || !sup ? (
        ops.loading ? <LoadingCard label="Loading the reports…" rows={6} /> : null
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="wb-rep-kpis">
            <StatCard label="Average lead time" value={k.avgLeadDays === null ? "—" : fmtNum(k.avgLeadDays)} unit={k.avgLeadDays === null ? undefined : "days"} hint={k.leadN ? tag(`creation to final release, ${k.leadN} case${k.leadN === 1 ? "" : "s"}`, pc) : "no case has reached final release yet"} />
            <StatCard label="Completed" value={k.completed} hint={tag(`${k.cancelled} cancelled`, pc)} />
            <StatCard label="Open cases" value={k.open} hint={tag(`${k.withSupplier} with supplier · ${k.withBdf} with Beiersdorf`, pc)} />
            <StatCard label="First-time-right" value={k.firstTimeRight === null ? "—" : `${k.firstTimeRight} %`} hint={!cov.points ? "needs every open point: not available with your access" : k.ftrN ? tag(`${k.ftrN} at final release, no supplier open point`, pc) : "no case at final release yet"} />
            <StatCard label="Avg query rounds" value={k.avgRounds === null ? "—" : fmtNum(k.avgRounds)} hint={tag("per supplier open point", pp)} />
            <StatCard label="Overdue open points" value={k.overduePointsAtSupplier} tone={k.overduePointsAtSupplier ? "bad" : "ok"} hint={tag("supplier past due date", pp)} />
          </div>

          <Section title="Lead time" hint="From case creation to the supplier's final release, split into the stages the app records.">
            <LeadTimeCard v={lead} partial={partialWhat(cov, ["cases", "runs", "events"])} />
          </Section>

          <Section title="Where cases wait" hint="Open cases by step, and the open review work of each department.">
            <div className="grid gap-4 xl:grid-cols-2">
              <BottleneckCard v={steps} partial={pc} />
              <DeptCard rows={depts} partial={partialWhat(cov, ["cases", "points", "crs"])} />
            </div>
          </Section>

          <Section title="Suppliers" hint="Open points sent to suppliers and how far they are past their due dates.">
            <SupplierCard rows={sup.rows} takeaway={sup.takeaway} partial={partialWhat(cov, ["cases", "points"])} />
          </Section>
        </div>
      )}
    </Page>
  );
}
