// Report cards (props only, no reads): lead time by stage and supplier performance. Modelled on the prototype's
// reports/LeadTimeCards.tsx and SupplierCards.tsx, without the numbers the live app does not record yet.
import { Link } from "react-router-dom";
import { Badge, Card, CardHeader, cx } from "@/components/ui/primitives";
import { EmptyState, Table, Td, Tr } from "@/components/ui/data";
import { BarsChart } from "@/components/ui/charts";
import { ChartCard, PartialNote, SIDE_COLOR } from "../dashboard/cards";
import { fmtNum, type LeadTimeView, type StageRow, type SupplierRow } from "./metrics";

const num = "text-right tabular-nums";
const R = ({ children }: { children: React.ReactNode }) => <span className="block text-right">{children}</span>;
const d = (n: number | null) => (n === null ? "—" : `${fmtNum(n)} d`);
const SHORT: Record<StageRow["id"], string> = { setup: "Setup + scope", supplier: "Supplier input", review: "Review", release: "Final release" };
const SIDE: Record<StageRow["side"], { label: string; tone: "violet" | "info" | "neutral" }> = {
  supplier: { label: "Supplier", tone: "violet" },
  bdf: { label: "Beiersdorf", tone: "info" },
  both: { label: "Both", tone: "neutral" },
};

export function LeadTimeCard({ v, partial }: { v: LeadTimeView; partial?: string }) {
  const any = v.stages.some((s) => s.n > 0);
  return (
    <ChartCard
      testId="wb-rep-leadtime"
      title="Lead time by stage"
      subtitle="Average days per stage, over every case that has finished the stage"
      takeaway={v.takeaway}
      chart={
        any ? (
          <BarsChart
            data={v.stages.map((s) => ({ stage: SHORT[s.id], [s.side]: s.avg ?? 0 }))}
            xKey="stage"
            stacked
            unit=" d"
            height={240}
            series={[
              { key: "supplier", label: "With the supplier", color: SIDE_COLOR.supplier },
              { key: "bdf", label: "With Beiersdorf", color: SIDE_COLOR.bdf },
              { key: "both", label: "Shared", color: SIDE_COLOR.both },
            ]}
          />
        ) : undefined
      }
      table={
        any ? (
          <Table dense head={["Stage", "From → to", "With", <R key="n">Cases</R>, <R key="a">Average</R>, <R key="r">Range</R>]}>
            {v.stages.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium">{s.label}</Td>
                <Td className="text-ink-3">
                  {s.from} → {s.to}
                </Td>
                <Td>
                  <Badge tone={SIDE[s.side].tone}>{SIDE[s.side].label}</Badge>
                </Td>
                <Td className={num}>{s.n}</Td>
                <Td className={num}>{d(s.avg)}</Td>
                <Td className={num}>{s.min === null ? "—" : `${fmtNum(s.min)}–${fmtNum(s.max!)} d`}</Td>
              </Tr>
            ))}
            <Tr>
              <Td className="font-semibold">Creation to final release</Td>
              <Td />
              <Td />
              <Td className={num}>{v.total.n}</Td>
              <Td className={cx(num, "font-semibold")}>{d(v.total.avg)}</Td>
              <Td />
            </Tr>
          </Table>
        ) : (
          <EmptyState title="No case has finished a stage yet">Lead time appears here once a case has passed its scope release.</EmptyState>
        )
      }
      footer="“Shared” covers the open-items checks, the overall approval and the supplier's final release. The close check is not measured: the time a case is completed is not recorded yet."
      partial={partial}
    />
  );
}

export function SupplierCard({ rows, takeaway, partial }: { rows: SupplierRow[]; takeaway: string; partial?: string }) {
  return (
    <Card data-testid="wb-rep-suppliers">
      <CardHeader title="Supplier performance" subtitle="Cases and open points per supplier, most overdue first" />
      <p className="px-4 pt-3 text-[13px] text-ink-2">{takeaway}</p>
      <div className="pt-2">
        {rows.length ? (
          <Table dense head={["Supplier", <R key="c">Open cases</R>, <R key="s">At a supplier step</R>, <R key="w">Points waiting</R>, <R key="o">Overdue</R>, <R key="r">Avg rounds</R>, <R key="f">Accepted 1st round</R>, "Answer time"]}>
            {rows.map((r) => (
              <Tr key={r.code}>
                <Td>
                  <Link to={`/cases?supplier=${encodeURIComponent(r.code)}`} className="font-medium text-ink hover:text-brand hover:underline">
                    {r.name}
                  </Link>
                </Td>
                <Td className={num}>
                  {r.openCases}
                  <span className="text-ink-3"> / {r.cases}</span>
                </Td>
                <Td className={num}>{r.atSupplier}</Td>
                <Td className={num}>{r.waitingPoints}</Td>
                <Td className={cx(num, r.overduePoints > 0 && "font-medium text-bad")}>{r.overduePoints}</Td>
                <Td className={num}>{r.avgRounds === null ? "—" : fmtNum(r.avgRounds)}</Td>
                <Td className={num}>{r.firstRound === null ? "—" : `${r.firstRound} %`}</Td>
                <Td className="text-ink-3">not available yet</Td>
              </Tr>
            ))}
          </Table>
        ) : (
          <EmptyState title="No supplier yet">Suppliers appear here with their first case.</EmptyState>
        )}
      </div>
      <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3">
        Answer time and on-time rate are not available yet: supplier answers are recorded by hand, without the time the supplier answered.
      </p>
      {partial && <PartialNote what={partial} />}
    </Card>
  );
}
