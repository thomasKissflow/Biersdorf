// Cards shared by the dashboard and the reports (copied in spirit from the prototype's Dashboard.tsx and
// reports/charts.tsx; props only, no reads). Every chart can be switched to a table with the same numbers, and a card
// built on a partial read says so.
import { ArrowRight, CircleCheck, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Mono, cx } from "@/components/ui/primitives";
import { EmptyState, Table, Td, Tr } from "@/components/ui/data";
import { BarsChart } from "@/components/ui/charts";
import { Segmented } from "@/components/ui/form";
import { caseLabel } from "../case/shared";
import { ATTENTION_LABEL, type AttentionItem, type AttentionKind, type DeptRow, type StepRow } from "./metrics";

export const SIDE_COLOR = { supplier: "var(--chart-4)", bdf: "var(--chart-1)", both: "var(--chart-3)" } as const;
const num = "text-right tabular-nums";

export function PartialNote({ what }: { what: string }) {
  return (
    <p className="flex items-start gap-1.5 border-t border-line px-4 py-2.5 text-[12.5px] text-ink-2" data-testid="wb-dash-partial">
      <TriangleAlert size={14} className="mt-px shrink-0 text-warn" aria-hidden />
      Partial: counts only the {what} you can see with your access.
    </p>
  );
}

/** A card with a chart/table switch, a one-line takeaway and an optional footer. */
export function ChartCard({ title, subtitle, takeaway, chart, table, footer, partial, testId }: { title: string; subtitle?: string; takeaway?: string; chart?: ReactNode; table: ReactNode; footer?: ReactNode; partial?: string; testId: string }) {
  const [view, setView] = useState<"chart" | "table">(chart ? "chart" : "table");
  return (
    <Card data-testid={testId}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          chart ? (
            <Segmented<"chart" | "table">
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: "Chart" },
                { value: "table", label: "Table" },
              ]}
            />
          ) : undefined
        }
      />
      {takeaway && <p className="px-4 pt-3 text-[13px] text-ink-2">{takeaway}</p>}
      <div className={view === "chart" && chart ? "px-2 pt-3 pb-2" : "pt-2"}>{view === "chart" && chart ? chart : table}</div>
      {footer && <div className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3">{footer}</div>}
      {partial && <PartialNote what={partial} />}
    </Card>
  );
}

// ---------------------------------------------------------------- needs attention

export function NeedsAttention({ items, title, scope, setScope, partial }: { items: AttentionItem[]; title: string; scope?: "mine" | "all"; setScope?: (v: "mine" | "all") => void; partial?: string }) {
  const nav = useNavigate();
  const [kind, setKind] = useState<AttentionKind | "all">("all");
  const [expanded, setExpanded] = useState(false);
  const counts = items.reduce<Partial<Record<AttentionKind, number>>>((m, i) => ({ ...m, [i.kind]: (m[i.kind] ?? 0) + 1 }), {});
  const list = kind === "all" ? items : items.filter((i) => i.kind === kind);
  const shown = expanded ? list : list.slice(0, 6);
  return (
    <Card data-testid="wb-dash-attention">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {title}
            <span className="rounded-full bg-surface-3 px-2 text-xs font-medium text-ink-2">{items.length}</span>
          </span>
        }
        subtitle="Most urgent first: rejections, overdue supplier answers, supplier steps past due, scope and open-items checks, idle cases."
        action={
          setScope && scope ? (
            <Segmented<"mine" | "all">
              value={scope}
              onChange={(v) => {
                setScope(v);
                setKind("all");
              }}
              options={[
                { value: "mine", label: "My cases" },
                { value: "all", label: "All owners" },
              ]}
            />
          ) : undefined
        }
      />
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
          <Chip active={kind === "all"} onClick={() => setKind("all")}>
            All · {items.length}
          </Chip>
          {(Object.keys(ATTENTION_LABEL) as AttentionKind[])
            .filter((k) => counts[k])
            .map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {ATTENTION_LABEL[k]} · {counts[k]}
              </Chip>
            ))}
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState icon={<CircleCheck size={28} />} title="Nothing needs attention right now">
          No rejection, overdue supplier answer, pending check or idle case{scope === "mine" ? " in the cases you own" : ""}.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((i) => (
            <li key={i.key} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start" data-testid={`wb-dash-item-${i.kind}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={i.tone} dot>
                    {ATTENTION_LABEL[i.kind]}
                  </Badge>
                  {i.days !== null && <span className="text-[12.5px] text-ink-3">{i.kind === "idle" ? `idle ${i.days} d` : `${i.days} d overdue`}</span>}
                </div>
                <p className="mt-1.5 text-[13.5px] font-medium text-ink">{i.title}</p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  <Link to={`/cases/${i.c._id}`} className="font-medium text-ink hover:text-brand hover:underline">
                    {i.c.tradeName || i.c.title || "Case"}
                  </Link>{" "}
                  <Mono className="text-ink-3">{caseLabel(i.c.caseCode, i.c.cycleNo)}</Mono>
                  {i.c.supplierLegalName ? ` · ${i.c.supplierLegalName}` : ""}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">{i.detail}</p>
              </div>
              <Button size="sm" variant="secondary" iconRight={<ArrowRight size={14} />} onClick={() => nav(i.to)} className="self-start">
                {i.cta}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 6 && (
        <div className="border-t border-line px-4 py-2.5">
          <button onClick={() => setExpanded((e) => !e)} className="text-[13px] font-medium text-brand hover:underline">
            {expanded ? "Show fewer" : `Show all ${list.length}`}
          </button>
        </div>
      )}
      {partial && <PartialNote what={partial} />}
    </Card>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cx("rounded-full border px-2.5 py-0.5 text-[12.5px] transition-colors", active ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink")}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- bottleneck by step

export function BottleneckCard({ v, partial }: { v: { rows: StepRow[]; unknown: number; top: StepRow | null }; partial?: string }) {
  const total = v.rows.reduce((a, r) => a + r.count, 0);
  return (
    <ChartCard
      testId="wb-dash-bottleneck"
      title="Where open cases wait"
      subtitle={`${total} open case${total === 1 ? "" : "s"} by step`}
      takeaway={v.top ? `Most cases wait at “${v.top.label}” (${v.top.count}${v.top.side === "supplier" ? ", with the supplier" : ", with Beiersdorf"}).` : "No open case at a readable step."}
      chart={
        total ? (
          <BarsChart
            data={v.rows.map((r) => ({ step: r.label, supplier: r.side === "supplier" ? r.count : 0, bdf: r.side === "bdf" ? r.count : 0 }))}
            xKey="step"
            horizontal
            stacked
            height={Math.max(180, v.rows.length * 30)}
            series={[
              { key: "supplier", label: "With the supplier", color: SIDE_COLOR.supplier },
              { key: "bdf", label: "With Beiersdorf", color: SIDE_COLOR.bdf },
            ]}
          />
        ) : undefined
      }
      table={
        <Table dense head={["Step", "With", <span key="n" className="block text-right">Open cases</span>, <span key="p" className="block text-right">Past supplier due date</span>]}>
          {v.rows.map((r) => (
            <Tr key={r.step}>
              <Td>{r.label}</Td>
              <Td>
                <Badge tone={r.side === "supplier" ? "violet" : "info"}>{r.side === "supplier" ? "Supplier" : "Beiersdorf"}</Badge>
              </Td>
              <Td className={num}>{r.count}</Td>
              <Td className={num}>{r.pastDue}</Td>
            </Tr>
          ))}
        </Table>
      }
      footer={v.unknown ? `${v.unknown} open case${v.unknown === 1 ? "" : "s"} at a step not readable with your access.` : undefined}
      partial={partial}
    />
  );
}

// ---------------------------------------------------------------- departments

const TICK_SHORT: Record<string, string> = { Microbiology: "Micro", Sustainability: "Sust." };

export function DeptCard({ rows, partial }: { rows: DeptRow[]; partial?: string }) {
  const busiest = [...rows].sort((a, b) => b.inReview + b.pointsAtBdf - (a.inReview + a.pointsAtBdf))[0];
  const mostOverdue = [...rows].sort((a, b) => b.overduePoints - a.overduePoints)[0];
  const any = rows.some((r) => r.inReview + r.pointsAtSupplier + r.pointsAtBdf + r.crToAssess > 0);
  const parts: string[] = [];
  if (busiest && busiest.inReview + busiest.pointsAtBdf > 0) parts.push(`Longest internal queue: ${busiest.label} (${busiest.inReview} review track${busiest.inReview === 1 ? "" : "s"}, ${busiest.pointsAtBdf} open point${busiest.pointsAtBdf === 1 ? "" : "s"} in review).`);
  if (mostOverdue && mostOverdue.overduePoints > 0) parts.push(`Most overdue open points: ${mostOverdue.label} (${mostOverdue.overduePoints}).`);
  return (
    <ChartCard
      testId="wb-dash-depts"
      title="Open points and change requests by department"
      subtitle="Open review tracks, open points by who holds them, and change requests waiting for an assessment"
      takeaway={parts.join(" ") || "No open review track, open point or change request."}
      chart={
        any ? (
          <BarsChart
            data={rows.map((r) => ({ dept: r.label, inReview: r.inReview, atBdf: r.pointsAtBdf, atSupplier: r.pointsAtSupplier, crs: r.crToAssess }))}
            xKey="dept"
            stacked
            height={230}
            tickFormatter={(x) => TICK_SHORT[x] ?? x}
            series={[
              { key: "inReview", label: "Review tracks open", color: "var(--chart-1)" },
              { key: "atBdf", label: "Open points in review", color: "var(--chart-2)" },
              { key: "atSupplier", label: "Open points with supplier", color: "var(--chart-4)" },
              { key: "crs", label: "Change requests to assess", color: "var(--chart-3)" },
            ]}
          />
        ) : undefined
      }
      table={
        <Table dense head={["Department", ...["Review tracks", "Points in review", "Points with supplier", "Overdue points", "CRs to assess"].map((h) => <span key={h} className="block text-right">{h}</span>)]}>
          {rows.map((r) => (
            <Tr key={r.dept}>
              <Td>{r.label}</Td>
              <Td className={num}>{r.inReview}</Td>
              <Td className={num}>{r.pointsAtBdf}</Td>
              <Td className={num}>{r.pointsAtSupplier}</Td>
              <Td className={cx(num, r.overduePoints > 0 && "font-medium text-bad")}>{r.overduePoints}</Td>
              <Td className={num}>{r.crToAssess}</Td>
            </Tr>
          ))}
        </Table>
      }
      partial={partial}
    />
  );
}
