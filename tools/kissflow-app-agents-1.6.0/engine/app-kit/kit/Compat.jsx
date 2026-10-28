/**
 * Compat — the generator-facing surface.
 *
 * `packages/app-ui/bin/kf-gen-page.js` emits a fixed vocabulary of component names with a fixed
 * prop shape. That vocabulary is the LEGACY stack's, so until now every generated page drew
 * through kf-ui.css and could not follow the design language. This file re-implements that exact
 * vocabulary on top of kit/, so the generator can keep emitting what it emits and the pages come
 * out themed.
 *
 * It is an ADAPTER LAYER, not a component library. Nothing here should be imported by hand —
 * write `../kit/Cards.jsx` and friends directly. Every export exists because the generator can
 * emit it, and the whole file is deletable the day the generator emits kit names natively.
 *
 * The full emitted set, from reading kf-gen-page.js rather than guessing:
 *   Bento · DataTable · EmptyState · GaugeRing · Grid · HBars · KpiRow · MetricCard · NewMenu
 *   PageHeader · Panel · RArea · RBar · RBreakdown · SegmentBar · Split · Tile · toneAt · TONES
 *
 * Four of those are prop-INCOMPATIBLE with the kit component of the same name, which is the
 * thing that would have failed silently rather than loudly:
 *   Split       generator passes `aside`, kit takes `rail`
 *   EmptyState  generator passes `hint`,  kit takes `message`
 *   Tile        generator passes `span={2}` (a number), kit's Bento.Item takes `span="2x1"`
 *   Grid        generator relies on the legacy default of 2 columns, kit defaults to 3
 * Each is absorbed below rather than fixed at the call site, because the call site is generated.
 */

import { useEffect, useState } from "react";
import { useKf, useKfDev } from "@kissflow/app-ui";

import { Card, CardTitle, StatTile } from "./Cards.jsx";
import { Table } from "./Tables.jsx";
import { BarChart, LineChart, HBars as KitHBars, GaugeRing as KitGaugeRing } from "./DataCharts.jsx";
import { Donut, Legend } from "./Donut.jsx";
import { SegmentBar as KitSegmentBar } from "./Progress.jsx";
import { EmptyState as KitEmptyState } from "./Feedback.jsx";
import { PageHeader as KitPageHeader, Grid as KitGrid, Split as KitSplit, Bento } from "./Layout.jsx";
import { Button } from "./Buttons.jsx";

/* ── Straight pass-throughs ────────────────────────────────────────────────────────────────── */
export { KitHBars as HBars, KitGaugeRing as GaugeRing, KitSegmentBar as SegmentBar, Bento };
export const PageHeader = KitPageHeader;

/* ── Tone helpers ──────────────────────────────────────────────────────────────────────────────
 * THE SINGLE BIGGEST THEMING WIN IN THIS FILE. The legacy tones.js is seven hard-coded hex
 * values — #6366f1, #10b981, … — and the generator threads `tone="indigo"` through MetricCard,
 * ProgressBar and BigStat. Every one of those was a colour no design language could move.
 * Here the same names resolve to the active language's own eight-step chart ramp, so a generated
 * page re-skins with the app. The names survive because the generator emits them; the values do
 * not, because they were never the design's. */
export const TONE_CYCLE = ["indigo", "emerald", "amber", "rose", "violet", "sky", "fuchsia"];
export const TONES = Object.fromEntries(TONE_CYCLE.map((n, i) => [n, `var(--chart-${i + 1})`]));
export const toneAt = (i) => `var(--chart-${(i % 8) + 1})`;

/* ── Layout ────────────────────────────────────────────────────────────────────────────────── */

/** Legacy default is 2 columns; kit's is 3. The generator relies on the legacy default. */
export function Grid({ cols = 2, children }) {
  return <KitGrid cols={cols}>{children}</KitGrid>;
}

/** `aside`, not `rail` — the generator's prop name. `ratio` is accepted and reduced to a rail
 *  width: the legacy default "1.6fr 1fr" is roughly a 38% rail, which is what 18rem approximates
 *  at the widths this app renders. Taking the ratio literally would need a grid the kit Split
 *  does not expose, and no design language declares one. */
export function Split({ aside, rail, ratio, children }) {
  void ratio;
  return <KitSplit rail={aside ?? rail}>{children}</KitSplit>;
}

/** `span={2}` is a NUMBER here; Bento.Item wants "2x1". `rows` adds the second axis. */
export function Tile({ span = 1, rows, children }) {
  const key = `${Math.min(2, Math.max(1, +span || 1))}x${Math.min(2, Math.max(1, +rows || 1))}`;
  return <Bento.Item span={key}>{children}</Bento.Item>;
}

/** Panel is a titled Card. The generator always passes `title`; `action` sits opposite it. */
export function Panel({ title, action, children }) {
  return (
    <Card role="list">
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          {title && <CardTitle className="mb-0">{title}</CardTitle>}
          {action && <div className="flex flex-none items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </Card>
  );
}

/* ── Figures ───────────────────────────────────────────────────────────────────────────────── */

/** MetricCard — StatTile's richer sibling: the same figure, plus an icon chip and a trend line.
 *
 *  THE ICON AND THE DELTA LIVE HERE, NOT ON StatTile, and that is deliberate. StatTile records
 *  the opposite decision in its own docstring ("`alarm` recolours the FIGURE, not a badge beside
 *  it … which is why there is no icon slot here"), grounded in Beacon's behaviour where an
 *  overdue count turns primary-strong. MetricCard has always taken `icon` and `delta` as props;
 *  it simply rendered the icon as inline text. So the anatomy goes where the props already are
 *  and StatTile's [SOURCE] decision stands. Two components, two answers, both on record.
 *
 *  The chip's SIZE is stock Tailwind and its RADIUS is the contract's: `rounded-nested` is the
 *  "a surface inside a surface steps down one rung" token Card's nested specimen reads, and a
 *  chip on a card is exactly that. No language declares a KPI icon tile, so the fill is --accent
 *  — the tint every language already uses for a quiet inset.
 *
 *  The trend arrow is DRAWN, not typed. A ▲ character inherits the font and shifts its weight
 *  and baseline across Poppins, Archivo and Manrope; an SVG triangle sits identically in all
 *  three. Same argument Breadcrumb makes for its separator, and the same reason it wins here.
 *
 *  `spark` is accepted and dropped: a sparkline drawn in an un-themed colour is worse than none,
 *  and drawing it properly is a component nobody has asked for. */
export function MetricCard({ icon, label, value, sub, delta, deltaLabel, spark, tone, featured }) {
  void spark;
  void featured;
  const d = Number(delta);
  const hasDelta = Number.isFinite(d) && d !== 0;
  return (
    <Card role="metric">
      <div className="flex items-start gap-4">
        {icon && (
          <span className="grid h-11 w-11 flex-none place-items-center rounded-nested bg-accent text-accent-foreground" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-kpi-label text-muted-foreground">{label}</p>
          <p className="m-0 flex items-baseline gap-2" style={{ marginTop: "var(--kpi-gap, 12px)" }}>
            <span className="font-display text-kpi" style={{ color: tone ? TONES[tone] ?? "hsl(var(--foreground))" : "hsl(var(--foreground))" }}>
              {value}
            </span>
            {sub && <span className="text-kpi-label text-meta-foreground">{sub}</span>}
          </p>
          {/* The delta line WRAPS, it does not truncate. Four of these across a KPI row leaves each
              about 200px, and "vs last mon…" is a comparison the reader cannot complete — an
              ellipsis on the thing the percentage is measured against destroys the only sentence
              here. Two short lines cost a row of height; a clipped baseline costs the meaning. */}
          {hasDelta && (
            <p className="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
              <span
                className="inline-flex items-center gap-1 font-mono text-data font-semibold tabular-nums"
                style={{ color: d > 0 ? "var(--tone-success-fg)" : "var(--tone-danger-fg)" }}
                aria-label={`${d > 0 ? "up" : "down"} ${Math.abs(d)} percent`}
              >
                <svg width="7" height="6" viewBox="0 0 7 6" aria-hidden="true" className={d < 0 ? "rotate-180" : undefined}>
                  <path d="M3.5 0 7 6H0z" fill="currentColor" />
                </svg>
                {Math.abs(d)}%
              </span>
              {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** KpiCard is MetricCard's older twin — same job, different prop names. */
export function KpiCard({ label, value = "—", tone, icon, change, compare, spark, trend }) {
  void spark;
  void trend;
  return <MetricCard icon={icon} label={label} value={value} tone={tone} sub={compare} delta={change} />;
}

/** A row of figures. The generator emits `<KpiRow>` wrapping 2–5 MetricCards. */
export function KpiRow({ children }) {
  return <KitGrid cols={4}>{children}</KitGrid>;
}

export function BigStat({ value, tone }) {
  return (
    <span className="font-display text-kpi" style={{ color: tone ? TONES[tone] ?? "hsl(var(--foreground))" : "hsl(var(--foreground))" }}>
      {value}
    </span>
  );
}

/* ── Charts ────────────────────────────────────────────────────────────────────────────────────
 * The R* names are recharts-era. All four take `data: [{label, value}]`, which is exactly the
 * shape the kit primitives take, so these are renames plus a height pass-through. RBreakdown
 * pairs the ring with its legend, which is what the legacy one drew. */
export function RBar({ data = [], height = 250, format }) {
  return <BarChart data={data} height={height} format={format} />;
}

export function RArea({ data = [], height = 250, format }) {
  void format;
  return <LineChart data={data} height={height} area />;
}

export function RPie({ data = [], height = 250 }) {
  return <Donut segments={data} size={Math.min(height, 200)} />;
}

export function RBreakdown({ data = [], format, height = 250 }) {
  void format;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <Donut segments={data} size={Math.min(height, 180)} />
      <Legend items={data} className="flex-col" />
    </div>
  );
}

/* ── Feedback ──────────────────────────────────────────────────────────────────────────────── */

/** `hint`, not `message` — the generator's prop name. */
export function EmptyState({ title, hint, message, icon }) {
  return <KitEmptyState title={title} message={hint ?? message} icon={icon} />;
}

/* ── SDK-bound ─────────────────────────────────────────────────────────────────────────────────
 * DataTable is the one entry here that is not presentational. The generator hands it a flow id
 * and a view and expects it to fetch — kit/Tables.jsx deliberately does not, because a catalog
 * component that calls the SDK cannot be rendered in a catalog. So the fetching lives here,
 * where it is the adapter's job, and the drawing stays in kit/Table. */
export function DataTable({ flowType = "Form", flowId, view = "myitems", max = 6, columns }) {
  const kf = useKf();
  const { active, canAccess } = useKfDev();
  const blocked = active && !canAccess(flowId);

  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (blocked) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const handle =
          flowType === "Case" ? kf.app.getBoard(flowId)
          : flowType === "Process" ? kf.app.getProcess(flowId)
          : kf.app.getDataform(flowId);
        // Same try-in-order as ModelChart: a Process has no getItems on every surface, and the
        // documented listing APIs disagree between mock, dev proxy and the real SDK.
        const names = flowType === "Process"
          ? ["getAdminItems", "getParticipatedItems", "getMyItems", "getItems"]
          : ["getItems"];
        let out = null, lastError;
        for (const n of names) {
          if (typeof handle?.[n] !== "function") continue;
          try {
            const r = await handle[n](n === "getMyItems" ? { status: "all" } : {});
            const data = r?.Data ?? r?.items ?? [];
            if (data.length) { out = data; break; }
            out = out ?? data;
          } catch (e) { lastError = e; }
        }
        if (!alive) return;
        if (out == null && lastError) throw lastError;
        setRows(out ?? []);
      } catch (e) {
        if (alive) setError(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kf, flowId, flowType, view, blocked]);

  const cols = (columns ?? []).map((c) =>
    typeof c === "string" ? { key: c, label: c } : { key: c.key ?? c.id, label: c.label ?? c.name ?? c.key },
  );

  if (blocked) return <p className="m-0 py-6 text-center text-sm text-muted-foreground">No access to this data.</p>;
  if (loading) return <p className="m-0 py-6 text-center text-sm text-muted-foreground">Loading…</p>;
  if (error) {
    return (
      <p className="m-0 rounded-md border border-destructive/20 bg-destructive/[0.08] px-3.5 py-2.5 text-sm text-destructive-ink">
        {error}
      </p>
    );
  }

  // Cell values arrive as objects on reference fields ({Name} / {value}), same as ModelChart's
  // grouping key — rendering the raw object would print [object Object].
  const flat = rows.slice(0, max).map((r) => {
    const o = {};
    for (const c of cols) {
      const v = r[c.key];
      o[c.key] = v && typeof v === "object" ? (v.Name ?? v.value ?? "—") : (v ?? "—");
    }
    return o;
  });

  return <Table columns={cols} rows={flat} empty="No records." />;
}

/* ── SDK-bound, re-exported from their own files ───────────────────────────────────────────────
 * These were the gap: every one of them calls the SDK in the legacy stack, and the first pass of
 * this rewrite either dropped them or kept the name and lost the wiring. NewMenu in particular
 * used to render buttons that created nothing.
 *
 * They live in Forms.jsx / FlowViews.jsx rather than here because they are real components with
 * real behaviour, not adapters — this file only forwards them so the generator's import surface
 * stays complete. */
export { FieldInput, FormCard, ItemForm, NewButton, NewMenu } from "./Forms.jsx";
export { FlowTimeline, FlowBoard } from "./FlowViews.jsx";

/* ── The rest of the legacy vocabulary ─────────────────────────────────────────────────────────
 * The legacy barrel exported 55 names. Anything importing through the shim must still find all
 * of them, so the whole surface is forwarded — not only the 17 the generator emits today. */
export { CountUp, Toaster, toast, FilterBar, CustomEmbed, StoresMap } from "./Fx.jsx";
export { Stepper, ActivityFeed } from "./Feed.jsx";

/* Timeline and KanbanBoard resolve to the SDK-BOUND versions, not the presentational ones.
   The legacy contract for both is a flow id — `<Timeline flowType flowId />`, `<KanbanBoard
   caseId groupField />` — so anything importing them by these names expects fetching. The
   presentational twins are still there under ./Feed.jsx and ./Board.jsx for catalog use and for
   a caller that already has the data; they just are not what these names mean.
   This is the one place where picking the wrong twin would compile, render, and show nothing. */
export { FlowTimeline as Timeline } from "./FlowViews.jsx";
export { FlowBoard as KanbanBoard } from "./FlowViews.jsx";
export { StatusChip, StatusChip as StatusPill } from "./Chips.jsx";
export { Callout } from "./Callout.jsx";
export { Card, CardTitle, StatTile } from "./Cards.jsx";
export { Table } from "./Tables.jsx";
export { NoAccess, Skeleton } from "./Feedback.jsx";
export { ProgressBar, ProgressList } from "./Progress.jsx";
export { Donut, Legend } from "./Donut.jsx";
export { Button as GhostButton } from "./Buttons.jsx";
export { BarChart, LineChart, FunnelChart, Heatmap, StackedBar } from "./DataCharts.jsx";
export { rankWidgets, bestWidget, signalForField } from "./widget-rank.js";

/* The two renamed twins, aliased back to their legacy names so the shim's surface is complete.
   ModelChart replaced Chart and TabStrip replaced Tabs — the new names are the ones to write in
   new code; these exist so nothing importing the old name through the shim breaks. */
export { ModelChart, ModelChart as Chart } from "./ModelChart.jsx";
export { TabStrip, TabStrip as Tabs } from "./TabStrip.jsx";
