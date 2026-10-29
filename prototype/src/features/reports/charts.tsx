// Local chart pieces the shared kit does not cover: bars with wrapped category labels, a ranked
// horizontal bar list with one emphasised bar, and a two-part split meter. Same tokens as
// @/components/ui/charts so they read as one system in light and dark.
import { BarChart3, Table2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, cx } from "@/components/ui";
import { useIsPhone } from "@/shell/useLayoutMode";

const axis = { stroke: "var(--ink-3)", fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, color: "var(--ink)", boxShadow: "var(--shadow-lg)" },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink-2)" },
  cursor: { fill: "var(--surface-2)" },
};

function wrap(text: string, max: number, maxLines = 3): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

/** Like `wrap`, but marks cut-off text with an ellipsis on the last line instead of dropping it. */
function wrapEllipsis(text: string, max: number, maxLines: number): string[] {
  const all = wrap(text, max, 99);
  if (all.length <= maxLines) return all.map((l) => (l.length > max ? `${l.slice(0, max - 1).trimEnd()}…` : l));
  const kept = all.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.length >= max ? last.slice(0, max - 1).trimEnd() : last}…`;
  return kept;
}

/** Shared legend: neutral text (the swatch carries the colour) and a little air above it. */
const legendProps = {
  iconType: "circle" as const,
  iconSize: 8,
  wrapperStyle: { fontSize: 12, paddingTop: 6 },
  formatter: (v: unknown) => <span style={{ color: "var(--ink-2)" }}>{String(v)}</span>,
};

/** Width of an element, kept current with a ResizeObserver (charts pick their layout from it). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string | number };
}

function XTick({ x = 0, y = 0, payload, max }: TickProps & { max: number }) {
  const lines = wrap(String(payload?.value ?? ""), max);
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="var(--ink-3)" fontSize={12}>
        {lines.map((l, i) => (
          <tspan key={i} x={0} dy={14}>
            {l}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function YTick({ x = 0, y = 0, payload, max }: TickProps & { max: number }) {
  const lines = wrap(String(payload?.value ?? ""), max, 2);
  return (
    <text x={Number(x) - 6} y={Number(y)} textAnchor="end" fill="var(--ink-3)" fontSize={12}>
      {lines.map((l, i) => (
        <tspan key={i} x={Number(x) - 6} dy={i === 0 ? 4 - (lines.length - 1) * 7 : 14}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

export interface Series {
  key: string;
  label: string;
  color: string;
}

const CHAR_PX = 6.6;
const Y_AXIS = 44;

/**
 * Bars that stay legible at any width: long category labels wrap onto up to three lines; short
 * labels that still collide are thinned out; when long words cannot fit (phones), the chart turns
 * horizontal so the labels get their own column.
 * `roundAll`: every series gets rounded ends (for stacks where each bar holds one series only).
 */
export function WrappedBars({ data, xKey, series, height = 260, unit, stacked, roundAll, wrapAt = 14 }: { data: Record<string, string | number>[]; xKey: string; series: Series[]; height?: number; unit?: string; stacked?: boolean; roundAll?: boolean; wrapAt?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const labels = data.map((d) => String(d[xKey] ?? ""));
  const longestWord = Math.max(1, ...labels.flatMap((l) => l.split(" ").map((w) => w.length)));
  const longest = Math.max(1, ...labels.map((l) => l.length));
  // Y-axis wide enough for the top tick incl. unit ("120 d"); recharts rounds the top tick up, hence * 1.25.
  const top = Math.max(0, ...data.map((d) => (stacked ? series.reduce((a, s) => a + (Number(d[s.key]) || 0), 0) : Math.max(0, ...series.map((s) => Number(d[s.key]) || 0)))));
  const yAxisW = Math.max(Y_AXIS, (String(Math.ceil(top * 1.25)).length + (unit?.length ?? 0)) * 7 + 16);
  // Counts get whole-number ticks only, and no more of them than there are values (a max of 1 reads 0 · 1, not 0…4).
  const ticks = unit ? undefined : Math.max(2, Math.min(5, Math.ceil(top) + 1));
  const band = (width - yAxisW - 16) / Math.max(1, data.length);
  const fits = Math.floor(band / CHAR_PX);
  const mode: "wrap" | "thin" | "horizontal" = width === 0 || fits >= longestWord ? "wrap" : longest <= 6 ? "thin" : "horizontal";
  const maxChars = Math.max(longestWord, Math.min(wrapAt, fits));
  const lines = mode === "wrap" ? Math.max(1, ...labels.map((l) => wrap(l, maxChars).length)) : 1;
  const interval = mode === "thin" ? Math.max(0, Math.ceil((longest * CHAR_PX + 6) / Math.max(1, band)) - 1) : 0;
  const horizontal = mode === "horizontal";
  const h = horizontal ? Math.max(height, data.length * (stacked ? 36 : 14 * series.length + 20) + 48) : height;
  const sorter = (item: { dataKey?: unknown }) => series.findIndex((s) => s.key === item.dataKey);
  const end: [number, number, number, number] = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];

  return (
    <div ref={ref} style={{ height: h }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 0 : -8 }} barCategoryGap={horizontal ? 8 : "24%"}>
          <CartesianGrid stroke="var(--line)" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axis} unit={unit} allowDecimals={!!unit} tickCount={ticks} />
              <YAxis type="category" dataKey={xKey} {...axis} width={112} interval={0} tick={(p: TickProps) => <YTick {...p} max={15} />} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axis} interval={interval} height={10 + lines * 14} tick={(p: TickProps) => <XTick {...p} max={mode === "wrap" ? maxChars : 99} />} />
              <YAxis {...axis} unit={unit} width={yAxisW} allowDecimals={!!unit} tickCount={ticks} />
            </>
          )}
          <Tooltip {...tooltipStyle} itemSorter={sorter} formatter={(v) => (unit ? `${v} ${unit.trim()}` : String(v))} />
          {series.length > 1 && <Legend {...legendProps} itemSorter={sorter} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "a" : undefined}
              fill={s.color}
              stroke={stacked ? "var(--surface)" : undefined}
              strokeWidth={stacked ? 1 : 0}
              radius={!stacked || roundAll || i === series.length - 1 ? end : 0}
              maxBarSize={stacked ? 36 : 28}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranked bars: the top bar(s) carry the accent, the rest are context (emphasis form). */
export function RankedBars({ rows, labelWidth = 220, unit, highlight = 1 }: { rows: { label: string; value: number }[]; labelWidth?: number; unit?: string; highlight?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const labelW = width ? Math.min(labelWidth, Math.round(width * 0.48)) : labelWidth;
  const maxChars = Math.floor(labelW / 6.9);
  const height = Math.max(120, rows.length * 30 + 16);
  return (
    <div ref={ref} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={7}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            {...axis}
            width={labelW}
            interval={0}
            tick={({ x = 0, y = 0, payload }: TickProps) => {
              const full = String(payload?.value ?? "");
              const lines = wrapEllipsis(full, maxChars, 2);
              return (
                <text x={Number(x) - 6} y={Number(y)} textAnchor="end" fill="var(--ink-2)" fontSize={12}>
                  <title>{full}</title>
                  {lines.map((l, i) => (
                    <tspan key={i} x={Number(x) - 6} dy={i === 0 ? 4 - (lines.length - 1) * 7 : 14}>
                      {l}
                    </tspan>
                  ))}
                </text>
              );
            }}
          />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}${unit ? ` ${unit}` : ""}`, "Open points"]} />
          <Bar dataKey="value" name="Open points" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
            {rows.map((r, i) => (
              <Cell key={r.label} fill={i < highlight ? "var(--chart-1)" : "var(--ink-3)"} fillOpacity={i < highlight ? 1 : 0.45} />
            ))}
            <LabelList dataKey="value" position="right" fill="var(--ink-2)" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-part share bar (supplier vs Beiersdorf). Text carries the values; colour only identifies. */
export function SplitMeter({ parts }: { parts: { label: string; value: number; display: string; color: string }[] }) {
  const total = parts.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.display}`).join(", ")}>
        {parts.map((p) => (
          <div key={p.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label}
            <span className="font-semibold text-ink">{p.display}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Chart or table; on a phone (< 768 px) each option is a 44 px icon button. */
function ViewToggle({ value, onChange }: { value: "chart" | "table"; onChange: (v: "chart" | "table") => void }) {
  const phone = useIsPhone();
  const opts = [
    { v: "chart" as const, label: "Chart", icon: <BarChart3 size={14} /> },
    { v: "table" as const, label: "Table", icon: <Table2 size={14} /> },
  ];
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="group" aria-label="View as">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          title={`Show as ${o.label.toLowerCase()}`}
          onClick={() => onChange(o.v)}
          aria-label={phone ? `Show as ${o.label.toLowerCase()}` : undefined}
          className={cx("inline-flex", phone ? "h-11 w-11 justify-center" : "h-7", "items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors", value === o.v ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink")}
        >
          {o.icon}
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Report card: title, a computed one-sentence takeaway, and a chart with its table twin. */
export function ChartCard({ title, takeaway, children, table, footer, className, action, "data-testid": testId }: { title: ReactNode; takeaway: ReactNode; children: ReactNode; table?: ReactNode; footer?: ReactNode | ((view: "chart" | "table") => ReactNode); className?: string; action?: ReactNode; "data-testid"?: string }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const foot = typeof footer === "function" ? footer(table ? view : "chart") : footer;
  return (
    <Card data-testid={testId} className={cx("flex min-w-0 flex-col", className)}>
      <CardHeader
        title={title}
        subtitle={<span className="text-ink-2">{takeaway}</span>}
        action={
          action || table ? (
            <div className="flex items-center gap-2">
              {action}
              {table && <ViewToggle value={view} onChange={setView} />}
            </div>
          ) : undefined
        }
      />
      <div className="min-w-0 flex-1 p-4">{view === "table" && table ? table : children}</div>
      {foot && <div className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">{foot}</div>}
    </Card>
  );
}
