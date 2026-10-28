// "Pipeline now": open cases by phase and the cases that need attention (read-only for the business owner). It
// replaces the owner's former copy of the RMM dashboard.
import { CircleCheck, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, CardHeader, EmptyState, Mono, cx } from "@/components/ui";
import { SIDE_COLOR, type PipelineView } from "./reportData";

const MAX_LINKS = 3;

/** Open cases per phase, as bars coloured by who holds the ball. */
export function PipelineCard({ v }: { v: PipelineView }) {
  const max = Math.max(1, ...v.phases.map((p) => p.count));
  return (
    <Card data-testid="report-pipeline" className="min-w-0">
      <CardHeader title="Open cases by phase" subtitle={<span className="text-ink-2">{v.takeaway}</span>} />
      {v.open === 0 ? (
        <EmptyState data-testid="empty-pipeline" icon={<Layers size={22} />} title="No open case right now">
          Cases appear here by phase from the moment Raw Material Management starts them.
        </EmptyState>
      ) : (
        <ul className="space-y-3 px-4 py-4">
          {v.phases.map((p) => (
            <li key={p.phase} data-testid={`pipeline-phase-${p.phase}`} data-count={p.count}>
              <Link to={p.to} className="group block">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink-2 group-hover:text-ink group-hover:underline">{p.label}</span>
                  <span className="font-semibold text-ink tabular-nums">{p.count}</span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full" style={{ width: `${(p.count / max) * 100}%`, background: p.side === "supplier" ? SIDE_COLOR.supplier : SIDE_COLOR.bdf }} />
                </div>
              </Link>
            </li>
          ))}
          <li className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: SIDE_COLOR.supplier }} />
              With the supplier
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: SIDE_COLOR.bdf }} />
              With Beiersdorf
            </span>
          </li>
        </ul>
      )}
    </Card>
  );
}

/** What needs attention now, with the cases concerned. */
export function AttentionCard({ v }: { v: PipelineView }) {
  const hit = v.attention.filter((a) => a.cases.length > 0);
  return (
    <Card data-testid="report-attention" className="min-w-0">
      <CardHeader
        title="Needs attention"
        subtitle={
          v.needsAttention ? `${v.needsAttention} open case${v.needsAttention > 1 ? "s" : ""} with at least one of these signals.` : "Rejections, overdue answers, pending releases, idle cases and origins without rules."
        }
        action={v.needsAttention ? <Badge tone="bad">{v.needsAttention}</Badge> : undefined}
      />
      {hit.length === 0 ? (
        <EmptyState data-testid="empty-attention" icon={<CircleCheck size={22} />} title={v.open ? "Nothing needs attention" : "No open case to watch"}>
          {v.attention.map((a) => a.label).join(" · ")}.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {v.attention.map((a) => (
            <li key={a.key} data-testid={`attention-${a.key}`} data-count={a.cases.length} className={cx("flex items-start gap-3 px-4 py-2.5", !a.cases.length && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{a.label}</div>
                <div className="text-xs text-ink-3">{a.hint}</div>
                {a.cases.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    {a.cases.slice(0, MAX_LINKS).map((c) => (
                      <Link key={c.id} to={`/cases/${c.id}`} title={c.materialName} className="text-brand hover:underline">
                        <Mono>{c.id}</Mono>
                      </Link>
                    ))}
                    {a.cases.length > MAX_LINKS && <span className="text-ink-3">and {a.cases.length - MAX_LINKS} more</span>}
                  </div>
                )}
              </div>
              <span className={cx("min-w-6 shrink-0 text-right text-[15px] font-semibold tabular-nums", a.cases.length ? "text-bad" : "text-ink-3")}>{a.cases.length}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
