import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Card, cx, toneDot, type Tone } from "./primitives";

/** No value (null, undefined, NaN, ±Infinity) shows "—" without its unit, never "0 d" or "NaN" (spec §0). */
const noValue = (v: ReactNode) => v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v));

export function StatCard({ label, value, unit, hint, tone = "neutral", trend, spark, onClick, icon, "data-testid": testId }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: Tone; trend?: { text: string; good: boolean }; spark?: number[]; onClick?: () => void; icon?: ReactNode; "data-testid"?: string }) {
  const Comp = onClick ? "button" : "div";
  const empty = noValue(value);
  return (
    <Card data-testid={testId} className={cx("relative overflow-hidden", onClick && "transition-shadow hover:shadow-pop")}>
      <Comp onClick={onClick} className="block w-full p-4 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-ink-2">{label}</span>
          {icon ? <span className="text-ink-3">{icon}</span> : tone !== "neutral" && <span className={cx("h-2 w-2 rounded-full", toneDot[tone])} />}
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-1">
            <span className={cx("text-[28px] leading-none font-semibold tracking-tight", empty ? "text-ink-3" : "text-ink")}>{empty ? "—" : value}</span>
            {unit && !empty && <span className="text-sm text-ink-3">{unit}</span>}
          </div>
          {/* In the flow beside the value, so it can never sit on top of the hint text. */}
          {spark && spark.length > 1 && (
            <div aria-hidden className="pointer-events-none h-8 w-20 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 1, bottom: 1, left: 1 }}>
                  <Area type="monotone" dataKey="v" stroke="var(--chart-1)" strokeWidth={1.5} fill="var(--brand-soft)" fillOpacity={1} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[12.5px]">
          {trend && <span className={trend.good ? "font-medium text-ok" : "font-medium text-bad"}>{trend.text}</span>}
          {hint && <span className="text-ink-3">{hint}</span>}
        </div>
      </Comp>
    </Card>
  );
}

export function EmptyState({ icon, title, children, action, "data-testid": testId }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; "data-testid"?: string }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-[13px] text-ink-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = "brand", className }: { value: number; max?: number; tone?: Tone; className?: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-300", toneDot[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Traffic light for open points (REQ-PROC-034): shape + colour + text. */
export function TrafficLight({ status, label }: { status: "open" | "in-progress" | "closed"; label?: string }) {
  const map = { open: { tone: "bad" as Tone, text: "Open" }, "in-progress": { tone: "warn" as Tone, text: "In progress" }, closed: { tone: "ok" as Tone, text: "Closed" } }[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
      <span className="inline-flex gap-0.5 rounded-full bg-surface-3 p-0.5">
        {(["bad", "warn", "ok"] as Tone[]).map((t) => (
          <span key={t} className={cx("h-2 w-2 rounded-full", t === map.tone ? toneDot[t] : "bg-line-strong/60")} />
        ))}
      </span>
      {label ?? map.text}
    </span>
  );
}

/** Labels keep their natural width (connectors absorb the slack) and only truncate when the row truly runs out
 *  of room. Phones get "Step 2 of 4 · label" with a segment bar instead of a row of cut-off labels. */
export function Stepper({ steps, current, done }: { steps: { key: string; label: string }[]; current: string; done?: boolean }) {
  const idx = steps.findIndex((s) => s.key === current);
  const at = Math.max(0, idx);
  return (
    <>
      <div className="sm:hidden">
        <p className="text-[13px] text-ink-2">
          {done ? (
            <span className="font-semibold text-ink">All {steps.length} steps done</span>
          ) : (
            <>
              <span className="font-semibold text-ink">
                Step {at + 1} of {steps.length}
              </span>{" "}
              · {steps[at]?.label}
              {at < steps.length - 1 && <span className="text-ink-3"> · next: {steps[at + 1].label}</span>}
            </>
          )}
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.key} className={cx("h-1.5 flex-1 rounded-full", done || i < at ? "bg-ok" : i === at ? "bg-brand" : "bg-surface-3")} />
          ))}
        </div>
      </div>
      <StepperRow steps={steps} idx={idx} done={done} />
    </>
  );
}

function StepperRow({ steps, idx, done }: { steps: { key: string; label: string }[]; idx: number; done?: boolean }) {
  return (
    <ol className="hidden w-full items-center gap-1 sm:flex">
      {steps.map((s, i) => {
        const state = done || i < idx ? "done" : i === idx ? "current" : "todo";
        const last = i === steps.length - 1;
        return (
          <li key={s.key} aria-current={state === "current" ? "step" : undefined} title={s.label} className={cx("flex min-w-0 items-center gap-2", last ? "flex-initial" : "flex-auto")}>
            <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", state === "done" && "bg-ok text-brand-ink", state === "current" && "bg-brand text-brand-ink ring-4 ring-brand-soft", state === "todo" && "bg-surface-3 text-ink-3")}>
              {state === "done" ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span className={cx("truncate text-[12.5px]", state === "current" ? "font-semibold text-ink" : "text-ink-3")}>{s.label}</span>
            {!last && <span className={cx("mx-1 h-px min-w-3 flex-1", i < idx || done ? "bg-ok" : "bg-line-strong")} />}
          </li>
        );
      })}
    </ol>
  );
}

export interface TimelineItem {
  id: string;
  at: string;
  title: ReactNode;
  body?: ReactNode;
  who?: ReactNode;
  tone?: Tone;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative ml-2 border-l border-line pl-5">
      {items.map((it) => (
        <li key={it.id} className="relative pb-4 last:pb-0">
          <span className={cx("absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ring-4 ring-surface", toneDot[it.tone ?? "neutral"])} />
          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="font-medium text-ink">{it.title}</span>
            {it.who && <span className="text-ink-3">· {it.who}</span>}
            <span className="ml-auto text-xs text-ink-3">{it.at}</span>
          </div>
          {it.body && <div className="mt-0.5 text-[13px] text-ink-2">{it.body}</div>}
        </li>
      ))}
    </ol>
  );
}

export function KeyValue({ items, cols = 2 }: { items: { k: ReactNode; v: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3", cols === 1 && "grid-cols-1", cols === 2 && "grid-cols-1 sm:grid-cols-2", cols === 3 && "grid-cols-1 sm:grid-cols-3")}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-ink-3">{it.k}</dt>
          <dd className="mt-0.5 text-[13.5px] break-words text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Lightweight table: consistent header, zebra-free, row hover. */
/** `tightHead`: narrower header padding after the first column (a wide matrix such as Section owners). */
export function Table({ head, children, dense, tightHead }: { head: ReactNode[]; children: ReactNode; dense?: boolean; tightHead?: boolean }) {
  return (
    // relative: keeps absolutely positioned (sr-only) cell text inside the scroll box, so it cannot widen the page.
    <div className="relative overflow-x-auto scrollbar-thin">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={i} className={cx("font-medium whitespace-nowrap text-ink-3", tightHead && i > 0 ? "px-2" : "px-4", dense ? "py-2" : "py-2.5")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx("px-4 py-2.5 align-middle text-ink", className)} {...rest}>
      {children}
    </td>
  );
}

/** Extra attributes (data-testid, aria-*, …) go onto the row. */
export function Tr({ children, onClick, className, ...rest }: Omit<React.HTMLAttributes<HTMLTableRowElement>, "onClick"> & { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr onClick={onClick} className={cx("transition-colors", onClick && "cursor-pointer hover:bg-surface-2", className)} {...rest}>
      {children}
    </tr>
  );
}
