import { ArrowDown, ArrowUp, ChevronsUpDown, MessageSquareText } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, CardHeader, EmptyState, Table, Td, Tr, cx } from "@/components/ui";
import { DEPT_SHORT } from "@/domain/catalog";
import type { SupplierPerf } from "@/domain/metrics";
import { ChartCard, RankedBars } from "./charts";
import { LATE_BELOW_PCT, SLOW_FACTOR, fmtDays, fmtPct, type hotspotView, type supplierView } from "./reportData";

const num = "text-right tabular-nums";

/** Card 6 — where clarifications cluster (open points per section). */
export function HotspotCard({ v }: { v: ReturnType<typeof hotspotView> }) {
  return (
    <ChartCard
      data-testid="report-hotspots"
      title="Where clarifications cluster"
      takeaway={v.takeaway}
      table={
        v.rows.length ? (
          <Table
            dense
            head={[
              "Section",
              "Lead department",
              <span key="n" className="block text-right">
                Open points
              </span>,
              <span key="s" className="block text-right">
                Share
              </span>,
            ]}
          >
            {v.rows.map((r) => (
              <Tr key={r.id}>
                <Td className="min-w-[13rem]">{r.label}</Td>
                <Td className="whitespace-nowrap text-ink-2">{r.lead ? DEPT_SHORT[r.lead] : "—"}</Td>
                <Td className={num}>{r.value}</Td>
                <Td className={num}>{fmtPct(r.share)}</Td>
              </Tr>
            ))}
          </Table>
        ) : undefined
      }
      footer={v.rows.length ? `${v.total} open points (queries, document requests, additional sections and findings) by the section they refer to.` : undefined}
    >
      {v.rows.length ? (
        <RankedBars rows={v.rows} labelWidth={260} highlight={v.highlight} />
      ) : (
        <EmptyState data-testid="empty-hotspots" icon={<MessageSquareText size={22} />} title="No open points in this selection">
          Queries and document requests appear here by the questionnaire section they refer to.
        </EmptyState>
      )}
    </ChartCard>
  );
}

type SortKey = "name" | "cases" | "open" | "queries" | "avgResponseDays" | "avgRounds" | "onTimePct";

const COLS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Supplier", numeric: false },
  { key: "cases", label: "Cases", numeric: true },
  { key: "open", label: "Open", numeric: true },
  { key: "queries", label: "Queries", numeric: true },
  { key: "avgResponseDays", label: "Avg response", numeric: true },
  { key: "avgRounds", label: "Avg rounds", numeric: true },
  { key: "onTimePct", label: "On time", numeric: true },
];

/** Card 7 — supplier performance, sortable by any column. */
export function SupplierPerfCard({ v, filtered }: { v: ReturnType<typeof supplierView>; filtered: string | null }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "cases", dir: "desc" });
  const rows = useMemo(() => {
    const val = (r: SupplierPerf) => {
      if (sort.key === "name") return r.name;
      // Rows shown as "—" (no query, or no answer yet) always sort last.
      const x = r[sort.key];
      if (x === null || (r.queries === 0 && (sort.key === "avgResponseDays" || sort.key === "onTimePct" || sort.key === "avgRounds"))) return sort.dir === "desc" ? -1 : Number.MAX_VALUE;
      return x;
    };
    return [...v.rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
      return sort.dir === "asc" ? c : -c;
    });
  }, [v.rows, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const head = COLS.map((c) => {
    const active = sort.key === c.key;
    const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        key={c.key}
        type="button"
        onClick={() => toggle(c.key)}
        aria-label={`Sort by ${c.label}`}
        className={cx("inline-flex w-full items-center gap-1 hover:text-ink", c.numeric && "justify-end", active && "text-ink")}
      >
        {c.label}
        <Icon size={13} className={active ? "text-brand" : "text-ink-3/70"} />
      </button>
    );
  });

  return (
    <Card data-testid="report-suppliers" className="min-w-0">
      <CardHeader title="Supplier performance" subtitle={<span className="text-ink-2">{v.takeaway}</span>} action={filtered ? <Badge tone="brand">Queries: {filtered}</Badge> : undefined} />
      {/* The sr-only label is absolutely positioned: anchor it inside the table's scroll box (relative
          wrapper), otherwise on phones it sits past the viewport and widens the whole page. */}
      <Table
        head={[
          ...head,
          <span key="flag" className="relative block">
            <span className="sr-only">Flag</span>
          </span>,
        ]}
      >
        {rows.map((r) => {
          const flag = v.flag(r);
          return (
            <Tr key={r.supplierId} data-testid={`supplier-perf-row-${r.supplierId}`} className={flag === "late" ? "bg-bad-soft/40" : flag === "slow" ? "bg-warn-soft/50" : undefined}>
              <Td className="font-medium whitespace-nowrap">{r.name}</Td>
              <Td className={num}>{r.cases}</Td>
              <Td className={num}>{r.open}</Td>
              <Td className={num}>{r.queries}</Td>
              <Td className={cx(num, flag === "slow" && "font-semibold")}>{r.queries && r.avgResponseDays !== null ? fmtDays(r.avgResponseDays) : <span className="text-ink-3">—</span>}</Td>
              <Td className={num}>{r.queries && r.avgRounds !== null ? r.avgRounds : <span className="text-ink-3">—</span>}</Td>
              <Td className={cx(num, flag === "late" && "font-semibold text-bad")}>
                {!r.queries ? <span className="text-ink-3">No queries</span> : r.onTimePct !== null ? fmtPct(r.onTimePct) : <span className="text-ink-3">—</span>}
              </Td>
              <Td className="w-[1%] whitespace-nowrap">
                {flag === "late" && <Badge tone="bad">Late answers</Badge>}
                {flag === "slow" && <Badge tone="warn">Slow responder</Badge>}
              </Td>
            </Tr>
          );
        })}
      </Table>
      <div className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
        Avg response = days from a query to the supplier's first answer. On time = answered by the due date.
        {v.anyQueries && ` Flags: below ${fmtPct(LATE_BELOW_PCT)} on time, or answering more than ${fmtPct(Math.round((SLOW_FACTOR - 1) * 100))} slower than the supplier average (${fmtDays(v.overall)}).`}
      </div>
    </Card>
  );
}
