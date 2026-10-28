// Thin wrappers over recharts that apply the design tokens. Charts derive from the same data as
// the tables next to them (no separate "chart data").
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

const axis = { stroke: "var(--ink-3)", fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, color: "var(--ink)", boxShadow: "var(--shadow-lg)" },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink-2)" },
  cursor: { fill: "var(--surface-2)" },
};

// Legend text stays neutral (the colour lives in the dot) and keeps the series order instead of sorting by name.
const legendProps = (series: SeriesDef[]) => ({
  iconType: "circle" as const,
  iconSize: 8,
  wrapperStyle: { fontSize: 12, paddingTop: 6 },
  formatter: (v: unknown) => <span style={{ color: "var(--ink-2)" }}>{String(v)}</span>,
  itemSorter: (item: { dataKey?: unknown }) => series.findIndex((s) => s.key === item.dataKey),
});

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
}

export function ChartFrame({ height = 240, children }: { height?: number; children: ReactNode }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/** Grouped or stacked bars. `data` rows: { [xKey]: label, [series.key]: number }. */
export function BarsChart({ data, xKey, series, stacked, height, horizontal, unit, tickFormatter }: { data: Record<string, string | number>[]; xKey: string; series: SeriesDef[]; stacked?: boolean; height?: number; horizontal?: boolean; unit?: string; tickFormatter?: (v: string) => string }) {
  // Counts get whole-number ticks only, and no more of them than there are values (a max of 1 reads 0 · 1).
  const top = Math.max(0, ...data.map((d) => (stacked ? series.reduce((a, s) => a + (Number(d[s.key]) || 0), 0) : Math.max(0, ...series.map((s) => Number(d[s.key]) || 0)))));
  const ticks = unit ? undefined : Math.max(2, Math.min(5, Math.ceil(top) + 1));
  return (
    <ChartFrame height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 8 : -12 }} barCategoryGap={horizontal ? 8 : "22%"}>
        <CartesianGrid stroke="var(--line)" vertical={!!horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axis} unit={unit} allowDecimals={!!unit} tickCount={ticks} />
            <YAxis type="category" dataKey={xKey} {...axis} width={120} />
          </>
        ) : (
          <>
            {/* interval 0: every category keeps its label (recharts otherwise drops ones it thinks collide). */}
            <XAxis dataKey={xKey} {...axis} interval={0} tickFormatter={tickFormatter} />
            <YAxis {...axis} unit={unit} allowDecimals={!!unit} tickCount={ticks} />
          </>
        )}
        <Tooltip {...tooltipStyle} />
        {series.length > 1 && <Legend {...legendProps(series)} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? "a" : undefined} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} radius={stacked ? (i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0) : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 18 : 36} isAnimationActive={false} />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

export function LinesChart({ data, xKey, series, height, unit }: { data: Record<string, string | number>[]; xKey: string; series: SeriesDef[]; height?: number; unit?: string }) {
  return (
    <ChartFrame height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} unit={unit} allowDecimals={!!unit} />
        <Tooltip {...tooltipStyle} />
        {series.length > 1 && <Legend {...legendProps(series)} />}
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

/** Parts of a whole. Shows the total in the centre. */
export function DonutChart({ data, height = 220, centerLabel }: { data: { name: string; value: number; color?: string }[]; height?: number; centerLabel?: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={1.5} stroke="var(--surface)" isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-ink">{total}</span>
        {centerLabel && <span className="text-xs text-ink-3">{centerLabel}</span>}
      </div>
    </div>
  );
}

export function Legendary({ items }: { items: { label: string; value?: ReactNode; color: string }[] }) {
  return (
    <ul className="space-y-1.5 text-[13px]">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: it.color }} />
          <span className="flex-1 text-ink-2">{it.label}</span>
          {it.value !== undefined && <span className="font-medium text-ink">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}
