import { Inbox, PieChart, Users } from "lucide-react";
import { DonutChart, EmptyState, Legendary, Table, Td, Tr } from "@/components/ui";
import { DEPT_LABEL } from "@/domain/catalog";
import type { DeptLoad } from "@/domain/metrics";
import { ChartCard, WrappedBars } from "./charts";
import { SIDE_COLOR, fmtDayNum, fmtDays, fmtPct, pct, type flowView, type originView, type workloadView } from "./reportData";

const R = ({ children }: { children: React.ReactNode }) => <span className="block text-right">{children}</span>;
const num = "text-right tabular-nums";

/** Card 3 — cases started vs completed per month. */
export function FlowCard({ v }: { v: ReturnType<typeof flowView> }) {
  return (
    <ChartCard
      data-testid="report-flow"
      title="Flow per month"
      takeaway={v.takeaway}
      table={
        v.empty ? undefined : (
          <Table dense head={["Month", <R key="c">Started</R>, <R key="d">Completed</R>, <R key="n">Pipeline change</R>]}>
            {v.rows.map((r) => (
              <Tr key={r.month}>
                <Td className="whitespace-nowrap">{r.month} 2026</Td>
                <Td className={num}>{r.created}</Td>
                <Td className={num}>{r.completed}</Td>
                <Td className={num}>{r.created - r.completed > 0 ? `+${r.created - r.completed}` : r.created - r.completed}</Td>
              </Tr>
            ))}
            <Tr>
              <Td className="font-semibold whitespace-nowrap">Year to date</Td>
              <Td className={`${num} font-semibold`}>{v.created}</Td>
              <Td className={`${num} font-semibold`}>{v.completed}</Td>
              <Td className={`${num} font-semibold`}>{v.created - v.completed > 0 ? `+${v.created - v.completed}` : v.created - v.completed}</Td>
            </Tr>
          </Table>
        )
      }
    >
      {v.empty ? (
        <EmptyState data-testid="empty-flow" icon={<Inbox size={22} />} title="No case started yet">
          Cases started and completed per month appear here from the first case on.
        </EmptyState>
      ) : (
        <WrappedBars
          data={v.rows}
          xKey="month"
          height={260}
          series={[
            { key: "created", label: "Started", color: "var(--chart-1)" },
            { key: "completed", label: "Completed", color: "var(--chart-2)" },
          ]}
        />
      )}
    </ChartCard>
  );
}

/** Card 5 — raw-material origin mix (SF-01). */
export function OriginCard({ v }: { v: ReturnType<typeof originView> }) {
  return (
    <ChartCard
      data-testid="report-origin"
      title="Raw-material origin mix"
      takeaway={v.takeaway}
      footer={
        v.casesTotal
          ? `A case with several origins counts once per origin. ${v.casesTotal - v.answered > 0 ? `${v.casesTotal - v.answered} of ${v.casesTotal} ${v.casesTotal === 1 ? "case has" : "cases have"} not answered SF-01 yet.` : v.casesTotal === 1 ? "The case has answered SF-01." : `All ${v.casesTotal} cases have answered SF-01.`}`
          : undefined
      }
    >
      {v.groups.length === 0 ? (
        <EmptyState data-testid="empty-origin" icon={<PieChart size={22} />} title="No origin answered yet">
          The origin mix (SF-01) appears as soon as suppliers answer the first metadata question.
        </EmptyState>
      ) : (
        <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
          <DonutChart data={v.groups.map((g) => ({ name: g.label, value: g.count, color: g.color }))} height={200} centerLabel={v.mentions === 1 ? "origin" : "origins"} />
          <div>
            <div className="mb-2 flex justify-between text-xs text-ink-3">
              <span>Origin (SF-01)</span>
              <span>Cases · share of all cases</span>
            </div>
            <Legendary items={v.groups.map((g) => ({ label: g.label, color: g.color, value: `${g.count} · ${fmtPct(pct(g.count, v.casesTotal))}` }))} />
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function WorkloadTable({ rows }: { rows: DeptLoad[] }) {
  return (
    <Table dense head={["Review", <R key="a">Active</R>, <R key="w">Waiting for supplier</R>, <R key="o">Open points</R>, <R key="v">Overdue</R>, <R key="c">Completed</R>, <R key="d">Avg review (d)</R>]}>
      {rows.map((d) => (
        <Tr key={d.dept}>
          <Td className="whitespace-nowrap">{DEPT_LABEL[d.dept]}</Td>
          <Td className={num}>{d.active}</Td>
          <Td className={num}>{d.waitingSupplier}</Td>
          <Td className={num}>{d.openPoints}</Td>
          <Td className={num}>{d.overdue > 0 ? <span className="font-semibold text-bad">{d.overdue}</span> : 0}</Td>
          <Td className={num}>{d.completed}</Td>
          <Td className={`${num} font-medium`}>{d.avgReviewDays === null ? "—" : fmtDayNum(d.avgReviewDays)}</Td>
        </Tr>
      ))}
    </Table>
  );
}

/** Card 4 — review workload of RMM and the departments (grouped bars) with a compact review-time table next to it. */
export function WorkloadCard({ v }: { v: ReturnType<typeof workloadView> }) {
  return (
    <ChartCard
      data-testid="report-workload"
      title="Review workload and review time (RMM and departments)"
      takeaway={v.takeaway}
      table={v.empty ? undefined : <WorkloadTable rows={v.rows} />}
      footer={v.empty ? undefined : "Active = review not yet completed on an open case. Average review = start of the review to its completion (RMM or department), over completed reviews."}
    >
      {v.empty ? (
        <EmptyState data-testid="empty-workload" icon={<Users size={22} />} title="No review yet">
          Reviews start when a supplier confirms completeness: one for RMM, which reviews the whole CIQ, and one per department concerned.
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {v.chart.every((x) => x.active + x.waiting + x.overdue === 0) ? (
            <EmptyState data-testid="workload-none-open" icon={<Users size={22} />} title="No review open right now">
              {(() => {
                const done = v.rows.reduce((n, d) => n + d.completed, 0);
                const lead = done === 0 ? "No review is in progress." : done === 1 ? "The only review is completed." : `All ${done} reviews are completed.`;
                return `${lead} Active reviews, reviews waiting for the supplier and overdue open points appear here while a case is in review.`;
              })()}
            </EmptyState>
          ) : (
            <WrappedBars
              data={v.chart}
              xKey="dept"
              height={250}
              series={[
                { key: "active", label: "Active reviews", color: "var(--chart-1)" },
                { key: "waiting", label: "Waiting for supplier", color: SIDE_COLOR.supplier },
                { key: "overdue", label: "Overdue open points", color: "var(--bad)" },
              ]}
            />
          )}
          <div className="min-w-0 self-start rounded-lg border border-line">
            <Table dense head={["Review", <R key="d">Avg review</R>, <R key="c">Completed</R>]}>
              {v.rows.map((d) => (
                <Tr key={d.dept}>
                  <Td className="sm:whitespace-nowrap">{DEPT_LABEL[d.dept]}</Td>
                  <Td className={`${num} font-medium whitespace-nowrap`}>{fmtDays(d.avgReviewDays)}</Td>
                  <Td className={num}>{d.completed}</Td>
                </Tr>
              ))}
            </Table>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
