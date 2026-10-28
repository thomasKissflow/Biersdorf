import { Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, EmptyState, Mono, Table, Td, Tr } from "@/components/ui";
import { ChartCard, SplitMeter, WrappedBars } from "./charts";
import { SIDE_COLOR, fmtDayNum, fmtDays, fmtPct, type LeadTimeView } from "./reportData";

const R = ({ children }: { children: React.ReactNode }) => <span className="block text-right">{children}</span>;
const num = "text-right tabular-nums";

/** Completed cases that took less than a day: a real result, not an empty chart with a 0 d axis. */
function SameDay({ testid, n }: { testid: string; n: number }) {
  return (
    <EmptyState data-testid={testid} icon={<Clock size={22} />} title={n === 1 ? "Completed within a day" : "Every case completed within a day"}>
      {n === 1 ? "The completed case" : `The ${n} completed cases`} went from creation to completion in less than a day, so there are no days to chart yet.
    </EmptyState>
  );
}

function NoCompleted({ testid }: { testid: string }) {
  return (
    <EmptyState data-testid={testid} icon={<Clock size={22} />} title="No completed case yet">
      Lead time is measured from case creation to completion. It appears here as soon as the first CIQ is completed.
    </EmptyState>
  );
}

/** Card 1 — average days per phase over completed cases, coloured by who holds the ball. */
export function LeadTimeCard({ v }: { v: LeadTimeView }) {
  const data = v.phases.map((p) => ({ phase: p.label, ...(p.side === "supplier" ? { supplier: p.days } : { bdf: p.days }) }));
  return (
    <ChartCard
      data-testid="report-lead-time"
      title="Where the lead time goes"
      takeaway={v.phaseTakeaway}
      table={
        v.done.length ? (
          <Table dense head={["Phase", "With", <R key="d">Avg days</R>, <R key="s">Share</R>]}>
            {v.phases.map((p) => (
              <Tr key={p.phase}>
                <Td>{p.label}</Td>
                <Td>
                  <Badge tone={p.side === "supplier" ? "violet" : "info"}>{p.side === "supplier" ? "Supplier" : "Beiersdorf"}</Badge>
                </Td>
                <Td className={num}>{fmtDayNum(p.days)}</Td>
                <Td className={num}>{fmtPct(p.share)}</Td>
              </Tr>
            ))}
            <Tr>
              <Td className="font-semibold">Total</Td>
              <Td />
              <Td className={`${num} font-semibold`}>{fmtDayNum(v.total)}</Td>
              <Td className={num}>{fmtPct(100)}</Td>
            </Tr>
          </Table>
        ) : undefined
      }
      footer={
        v.done.length && v.supplierShare !== null ? (
          <div className="space-y-2">
            <SplitMeter
              parts={[
                { label: "With the supplier", value: v.avgSupplier ?? 0, display: `${fmtPct(v.supplierShare)} · ${fmtDays(v.avgSupplier)}`, color: SIDE_COLOR.supplier },
                { label: "With Beiersdorf", value: v.avgBdf ?? 0, display: `${fmtPct(v.supplierShare === null ? null : 100 - v.supplierShare)} · ${fmtDays(v.avgBdf)}`, color: SIDE_COLOR.bdf },
              ]}
            />
            <p>Average per completed case ({v.done.length}). During the review, days an open point waits for the supplier's answer count as supplier time.</p>
          </div>
        ) : undefined
      }
    >
      {v.done.length && v.total < 1 ? (
        <SameDay testid="lead-time-same-day" n={v.done.length} />
      ) : v.done.length ? (
        <WrappedBars
          data={data}
          xKey="phase"
          unit=" d"
          stacked
          roundAll
          series={[
            { key: "supplier", label: "Supplier phase", color: SIDE_COLOR.supplier },
            { key: "bdf", label: "Beiersdorf phase", color: SIDE_COLOR.bdf },
          ]}
        />
      ) : (
        <NoCompleted testid="empty-lead-time" />
      )}
    </ChartCard>
  );
}

/** Card 2 — supplier vs Beiersdorf days for each completed case. */
export function WaitSplitCard({ v }: { v: LeadTimeView }) {
  return (
    <ChartCard
      data-testid="report-wait-split"
      title="Time with the supplier vs with Beiersdorf"
      takeaway={v.caseTakeaway}
      table={
        v.perCase.length ? (
          <Table dense head={["Case", <R key="s">With supplier</R>, <R key="b">With Beiersdorf</R>, <R key="l">Lead time</R>]}>
            {v.perCase.map((c) => (
              <Tr key={c.id}>
                <Td className="whitespace-nowrap">
                  <Link to={`/cases/${c.id}`} title={c.material} className="text-brand hover:underline">
                    <Mono>{c.id}</Mono>
                  </Link>
                </Td>
                <Td className={num}>{fmtDays(c.supplier)}</Td>
                <Td className={num}>{fmtDays(c.bdf)}</Td>
                <Td className={`${num} font-medium`}>{fmtDays(c.lead)}</Td>
              </Tr>
            ))}
          </Table>
        ) : undefined
      }
      footer={(view) =>
        v.perCase.length && !v.perCase.every((c) => c.supplier + c.bdf < 1)
          ? view === "table"
            ? "Days per completed case; the case number opens the case."
            : "Bars are labelled with the last four digits of the case number (CIQ-2026-…). Open the table view for case links."
          : undefined
      }
    >
      {v.perCase.length && v.perCase.every((c) => c.supplier + c.bdf < 1) ? (
        <SameDay testid="wait-split-same-day" n={v.perCase.length} />
      ) : v.perCase.length ? (
        <WrappedBars
          data={v.perCase.map((c) => ({ case: c.short, supplier: c.supplier, bdf: c.bdf }))}
          xKey="case"
          stacked
          unit=" d"
          height={290}
          series={[
            { key: "supplier", label: "With the supplier", color: SIDE_COLOR.supplier },
            { key: "bdf", label: "With Beiersdorf", color: SIDE_COLOR.bdf },
          ]}
        />
      ) : (
        <NoCompleted testid="empty-wait-split" />
      )}
    </ChartCard>
  );
}
