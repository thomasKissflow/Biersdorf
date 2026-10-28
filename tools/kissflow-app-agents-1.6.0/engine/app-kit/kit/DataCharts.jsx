/**
 * DataCharts — seven presentational primitives on ONE six-step data ramp.
 *
 * REDESIGNED 2026-08-13 from DataCharts.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229), replacing the eight-step, multi-language ramp
 * this file previously rendered (Charts.jsx-derived, `--chart-1..8` × 11 retired design
 * languages). tokens.css now names a single, Beacon-only ramp — `--chart-1` through `--chart-6`,
 * plain custom properties, not `--color-chart-*` — and DataCharts.dc.html's own rule replaces the
 * old "cycle the ramp by index" default nearly everywhere:
 *
 *   "Colour marks the subject, gray carries the rest." A 6-module chart is not 6 colours; it's
 *   the highlighted series/near-capacity mark in colour and everything else in gray. The ramp is
 *   for genuinely CATEGORICAL series (StackedBar's segments), not a rainbow applied by position.
 *
 * That is why BarChart, HBars and FunnelChart no longer cycle `--chart-1..6` per datum — each now
 * picks ONE thing to call out (the near-max bar, the top-ranked row, the deepest funnel stage)
 * with `--gradient-data`, and leaves the rest on a flat gray. StackedBar is the one primitive that
 * still cycles the ramp, because its segments genuinely are an unordered categorical set — and
 * even there, a caller-supplied semantic colour (pass/warn/fail) wins over the cycle.
 *
 * PRESENTATIONAL ONLY, same as before — you pass already-shaped data (`[{label, value}]` etc.);
 * nothing here talks to the SDK, and none of these wraps itself in a surface (a caller drops one
 * inside their own Panel/Card).
 *
 * NO BORDER anywhere in this file, except the two places DataCharts.dc.html itself draws one: a
 * LineChart data-point marker's 2px ring, and a StackedBar/HBars track's edge is still just its
 * background fill, no border at all. Every colour is `hsl()`-wrapped at its `--color-*` source in
 * tokens.css, so nothing here writes a hex — with ONE deliberate exception: Heatmap's three warm
 * buckets are literal hex (`#FFD9BF` / `#FF9E5E` / `#F25A00`), because DataCharts.dc.html is
 * explicit that four discrete buckets is the whole point — "a per-cell color-mix against the ramp
 * produces dozens of near-identical oranges no legend can explain; four buckets can be read off
 * the key" — and tokens.css deliberately does not name them, so there is no token to reach for.
 *
 * Any colour that has to enter an inline `style` or an SVG paint attribute (a class cannot reach
 * either) reads its token as a raw `var()` — `--chart-1`, `--gradient-data`, `--color-<tone>-ink`,
 * etc. This is expected here, not a JIT-invisibility risk: these were never meant to be Tailwind
 * utility classes (`bg-[var(--chart-1)]` would be — this isn't that).
 *
 * `color` (chart-wide) and a per-datum `d.color`/`k.color` remain the escape hatches they always
 * were: an explicit override always wins over whatever default rule (hot/cold, first/last, ramp
 * cycle) the primitive would otherwise apply.
 *
 * NOTE — Tailwind preflight is OFF in this project (src/shadcn.css), so the browser's default
 * agent styles are still live. Every heading/paragraph/list resets its own UA margin/padding.
 */

import { useId, useState } from "react";

const n = (v) => {
  const x = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(x) ? 0 : x;
};

/** StackedBar's fallback fill: per-segment override > the six-step ramp, cycled by key index.
 *  The one place in this file that still cycles the ramp — see the file banner for why. */
const rampAt = (i, override) => override || `var(--chart-${(i % 6) + 1})`;

const Note = ({ children }) => (
  <p className="m-0 py-6 text-center text-sm text-text-muted">{children}</p>
);

const MOVE = "duration-move";

/**
 * Vertical bar chart. data: [{label, value, color?}].
 *
 * "The outlier the subject" — DataCharts.dc.html. Bars at/near the series max (>=90% of it) take
 * `--gradient-data` plus a warm glow shadow and colour their value label `--color-primary-ink`;
 * every other bar stays flat `--color-gray-2` with a `--color-text-muted` value label. This
 * replaces the old ramp-cycled fill — a bar chart isn't a categorical set, it's one series, and
 * the thing worth marking is whichever bar is near capacity, not "which index is it."
 *
 * `color` / `d.color` are still the literal-override escape hatches: either bypasses the hot/cold
 * read entirely (fill = the override, ink = the default `text-secondary`).
 */
export function BarChart({ data = [], color, height = 190, format }) {
  if (!data.length) return <Note>No data.</Note>;
  const max = Math.max(1, ...data.map((d) => n(d.value)));
  return (
    <div className="flex items-stretch gap-2" style={{ height }}>
      {data.map((d, i) => {
        const pct = (n(d.value) / max) * 100;
        const override = d.color || color;
        const hot = !override && pct >= 90;
        const fill = override || (hot ? "var(--gradient-data, var(--color-primary))" : "var(--color-gray-2)");
        return (
          <div key={i} className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              {/* The value floats above the bar's own current top — an absolute span pinned
                  to the same percentage that sizes the fill below it, so it tracks growth
                  instead of sitting at a fixed height. */}
              <span
                className="absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap pb-1.5 font-mono text-data tabular-nums text-secondary"
                style={{ bottom: `${pct}%`, color: override ? undefined : hot ? "var(--color-primary-ink)" : "var(--color-text-muted)" }}
              >
                {format ? format(d.value) : d.value}
              </span>
              <div
                className={`absolute inset-x-0 bottom-0 rounded-t-md transition-[height] ${MOVE}`}
                style={{
                  height: `${pct}%`,
                  background: fill,
                  boxShadow: hot ? "0 10px 22px -10px rgba(255,98,3,.6)" : undefined,
                }}
              />
            </div>
            <span className="mt-1.5 max-w-full truncate text-center text-xs text-text-muted" title={String(d.label)}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Ranked horizontal bars. data: [{label, value, color?}].
 *
 * `sort={false}` keeps the caller's order — ranking is right for a "top N" breakdown, but many
 * breakdowns are SEQUENCES (pipeline stages, priority ladders, workflow steps) where re-ordering
 * by count is wrong. Carried over verbatim from Charts.jsx, where its absence sent three page
 * agents hand-rolling this exact row to preserve order (facilities run, 2026-08-02).
 *
 * Fill follows the same "colour marks the subject" rule as BarChart: the row(s) AT the series max
 * take `--gradient-data`; everything else is `--chart-6` (the ramp's own "everything else" step,
 * which is `--color-border`). Checked against the VALUE, not position — so a caller who passes
 * `sort={false}` still gets the actual highest row marked, not whichever happens to render first.
 * `color` / `d.color` are still literal overrides, unchanged.
 */
export function HBars({ data = [], color, format, max: maxRows = 8, sort = true }) {
  const ordered = sort ? [...data].sort((a, b) => n(b.value) - n(a.value)) : data;
  const rows = ordered.slice(0, maxRows);
  if (!rows.length) return <Note>No data.</Note>;
  const max = Math.max(1, ...rows.map((d) => n(d.value)));
  return (
    <ul className="m-0 flex list-none flex-col gap-bar p-0">
      {rows.map((d, i) => {
        const override = d.color || color;
        const emphasis = !override && n(d.value) === max;
        const fill = override || (emphasis ? "var(--gradient-data, var(--color-primary))" : "var(--chart-6)");
        return (
          <li key={i} className="group flex items-center gap-bar">
            <span className="min-w-label max-w-label truncate text-xs text-text-muted" title={String(d.label)}>
              {d.label}
            </span>
            <span className="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
              <span
                className={`absolute inset-y-0 left-0 rounded-bar transition-[width] group-hover:brightness-105 ${MOVE}`}
                style={{ width: `${(n(d.value) / max) * 100}%`, background: fill }}
              />
            </span>
            <span className="min-w-value text-right font-mono text-data tabular-nums text-secondary">
              {format ? format(d.value) : d.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Line / area trend. data: [{label, value}]. Optionally a second series via `compare`.
 *
 * ONE OR TWO SERIES, never a cycle. Both are scaled against ONE shared extent, because two lines
 * on independent scales is a chart that lies — the whole reason to put a comparison on the same
 * axes is that the heights are comparable.
 *
 * Current series = `--chart-1`, stroke width 2. The filled area beneath it is a real vertical
 * gradient now (was a flat 12%-opacity fill): `--chart-1` at 24% opacity fading to 0% at the
 * baseline, same two-stop `<linearGradient>` shape as StatTile's own spark (Cards.jsx), each
 * instance keyed by `useId()` so multiple charts on one page don't collide on a shared `<defs>` id.
 *
 * Comparison series defaults to `--color-border` at 80% opacity, drawn BEHIND the current series —
 * "context, not a peer," DataCharts.dc.html's own phrase. (Was `--chart-2` at 55% — the ramp's
 * `--chart-2` is `--color-secondary`, a near-black too heavy for a line that isn't the subject.)
 *
 * `grid` draws three dashed rules at 25/50/75%, `--color-gray-2`, `3 4` dasharray — never one at
 * every step. (Was `--color-border` — gray-2 is the doc's own choice for this specific rule.)
 *
 * `tooltip` is the one genuinely interactive thing here: a dark card (`--color-secondary` fill,
 * white text via `--color-surface`, `--radius-md`, `--shadow-overlay`) at the hovered column,
 * driven by one hit-target button per point rather than a mousemove listener — see the geometry
 * note below for why. Point markers are 8px circles with a 2px `--chart-1` border and a
 * `--color-surface` (white) fill; DataCharts.dc.html's hover rule is opacity .35 for every point
 * except the hovered one, which is 1 — and with nothing hovered (or `tooltip` off), every point
 * defaults to fully visible.
 */
export function LineChart({
  data = [],
  compare = [],
  color,
  compareColor,
  area = true,
  height = 190,
  dots = true,
  grid = false,
  tooltip = false,
  seriesLabel = "This period",
  compareLabel = "Last period",
  format,
}) {
  const [hover, setHover] = useState(null);
  const areaId = useId();
  if (data.length < 2) return <Note>Not enough data to chart.</Note>;
  const W = 100, H = 100;
  // ONE extent across both series — see the docstring.
  const cmp = Array.isArray(compare) ? compare.slice(0, data.length) : [];
  const vals = data.map((d) => n(d.value)).concat(cmp.map((d) => n(d.value)));
  const max = Math.max(...vals), min = Math.min(0, ...vals), span = max - min || 1;
  const at = (arr) => arr.map((d, i) => [(i / (data.length - 1)) * W, H - ((n(d.value) - min) / span) * H]);
  const path = (ps) => ps.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" ");
  const pts = at(data);
  const cmpPts = cmp.length >= 2 ? at(cmp) : null;
  const line = path(pts);
  const stroke = color || "var(--chart-1)";
  const cmpStroke = compareColor || "var(--color-border)";
  const fmt = (v) => (format ? format(v) : v);
  const active = hover != null && hover >= 0 && hover < pts.length ? hover : null;
  return (
    <div
      style={{ height }}
      className="relative"
      onMouseLeave={tooltip ? () => setHover(null) : undefined}
    >
      {/* preserveAspectRatio="none" deliberately stretches the 0-100 square viewBox to fill a
          wide, short box — that is what lets the line reach every point correctly. A STRAIGHT
          LINE survives that non-uniform stretch fine (an affine transform keeps it straight);
          a ROUND marker does not. `vector-effect="non-scaling-stroke"` only protects a shape's
          stroke WIDTH from the scale, never its geometry, so an SVG <circle r={2.4}> here comes
          out roughly 4x wider than tall on a typical wide/short card (measured 24x6px on this
          page, not 7x7) — an inherited defect from Charts.jsx, never caught there because
          Charts.jsx had zero callers and was never actually rendered. Dots are drawn OUTSIDE the
          distorted coordinate space instead: real HTML circles, positioned with the same 0-100
          numbers used as plain CSS percentages (this box IS 100 units square in intent, so a
          point's [x,y] doubles as its [left%,top%] with no conversion). */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[calc(100%-1.25rem)] w-full overflow-visible">
        {area && (
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={stroke} stopOpacity="0.24" />
              <stop offset="1" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {grid && [25, 50, 75].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2={W}
            y2={y}
            className="stroke-gray-2"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {area && <path d={`${line} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${areaId})`} />}
        {/* The comparison sits BEHIND the current series, at 80% opacity — context, not a peer.
            Drawn before the main path so it can never cover it. */}
        {cmpPts && (
          <path
            d={path(cmpPts)}
            fill="none"
            style={{ stroke: cmpStroke }}
            strokeWidth="2"
            opacity="0.8"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        <path
          d={line}
          fill="none"
          style={{ stroke }}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      {dots && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[calc(100%-1.25rem)]">
          {pts.map((p, i) => (
            <span
              key={i}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity"
              style={{
                left: `${p[0]}%`,
                top: `${p[1]}%`,
                borderColor: stroke,
                opacity: active == null ? 1 : active === i ? 1 : 0.35,
              }}
            />
          ))}
        </div>
      )}
      {/* HIT AREAS, not a mousemove listener: one equal-width column per point, so the nearest
          point is decided by layout rather than by arithmetic against a distorted viewBox. They
          live in the same undistorted overlay space the dots do. */}
      {tooltip && (
        <div className="absolute inset-x-0 top-0 flex h-[calc(100%-1.25rem)]">
          {pts.map((p, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="h-full flex-1 cursor-default border-0 bg-transparent p-0"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
            />
          ))}
        </div>
      )}
      {tooltip && active != null && (
        <div
          className="pointer-events-none absolute z-10 min-w-max -translate-x-1/2 -translate-y-full rounded-md bg-secondary px-3 py-2 text-surface shadow-overlay"
          style={{ left: `${Math.min(88, Math.max(12, pts[active][0]))}%`, top: `calc(${pts[active][1]}% - 10px)` }}
          role="status"
        >
          <p className="m-0 mb-1 text-xs font-semibold">{data[active].label}</p>
          <p className="m-0 flex items-center gap-1.5 whitespace-nowrap text-xs">
            <span className="chip-dot flex-none" style={{ background: stroke }} />
            {seriesLabel}
            <span className="ml-1 font-mono text-data font-semibold tabular-nums">{fmt(n(data[active].value))}</span>
          </p>
          {cmpPts && cmp[active] && (
            <p className="m-0 mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-xs opacity-70">
              <span className="chip-dot flex-none" style={{ background: cmpStroke }} />
              {compareLabel}
              <span className="ml-1 font-mono text-data font-semibold tabular-nums">{fmt(n(cmp[active].value))}</span>
            </p>
          )}
        </div>
      )}
      <div className="mt-2 flex justify-between gap-2">
        {data.map((d, i) => (
          <span key={i} className="min-w-0 truncate text-[10px] text-text-muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Radial gauge for a single ratio. 9px stroke, round linecap, the mono figure sits INSIDE the
 * ring — DataCharts.dc.html: never a label beside it — with `label` as the caption below.
 *
 * `tone` is new [SOURCE, DataCharts.dc.html's own worked example — "success gauge's track =
 * --color-success-bg, ink = --color-success-dot/ink"]: it tints the groove with the tone's `-bg`,
 * the ring with its `-dot` (falling back to `-ink` for `danger`, which names no `-dot` step), and
 * the figure with its `-ink` — the same three-part split Card/StatTile's own `tone` prop already
 * uses. Opt-in and additive: no `tone` renders exactly what this always has — `--chart-1` (or
 * `color`) on a `bg-track` groove, near-black figure.
 */
export function GaugeRing({ value = 0, max = 100, label, sublabel, color, tone, size = 150 }) {
  const pct = Math.max(0, Math.min(1, n(value) / (n(max) || 1)));
  const r = 54, circ = 2 * Math.PI * r;
  const stroke = tone ? `var(--color-${tone}-dot, var(--color-${tone}-ink))` : color || "var(--chart-1)";
  return (
    <div style={{ width: size }}>
      <svg viewBox="0 0 140 140">
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          className={tone ? undefined : "stroke-track"}
          style={tone ? { stroke: `var(--color-${tone}-bg)` } : undefined}
          strokeWidth="9"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          style={{ stroke }}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform="rotate(-90 70 70)"
          className={`transition-[stroke-dashoffset] ${MOVE}`}
        />
        <text
          x="70"
          y="76"
          textAnchor="middle"
          className={"font-mono text-[22px] font-semibold tabular-nums" + (tone ? "" : " fill-secondary")}
          style={tone ? { fill: `var(--color-${tone}-ink)` } : undefined}
        >
          {Math.round(pct * 100)}%
        </text>
        {sublabel && (
          <text x="70" y="94" textAnchor="middle" className="fill-text-muted text-[11px]">
            {sublabel}
          </text>
        )}
      </svg>
      {label && <div className="mt-1 text-center text-xs text-text-muted">{label}</div>}
    </div>
  );
}

/**
 * Funnel of descending stages. data: [{label, value, color?}], caller order preserved (a funnel
 * is a sequence, never re-ranked).
 *
 * Fill: the LAST stage — the deepest, the outcome the funnel is measuring toward — takes
 * `--gradient-data`; every earlier stage stays a flat `--color-gray-3` [DataCharts.dc.html: "or
 * similar — check what's closest"; gray-3 is the ramp's next step down from the gray-2 dividers,
 * the one Foundations calls out as "pressed on a gray surface" — a deliberately quieter neutral
 * than a divider line, closer to StackedBar/HBars' own track than to gray-2]. Replaces the old
 * per-stage ramp cycle for the same "colour marks the subject" reason BarChart and HBars dropped
 * theirs.
 *
 * The value stays OFF the fill (beside it, not overlaid) — DataCharts.dc.html: "no ramp step can
 * promise contrast against one ink." A single hand-picked palette can guarantee that; a six-step
 * ramp reused across every future tint cannot.
 */
export function FunnelChart({ data = [], color, format }) {
  if (!data.length) return <Note>No data.</Note>;
  const max = Math.max(1, ...data.map((d) => n(d.value)));
  const lastIdx = data.length - 1;
  return (
    <ul className="m-0 flex list-none flex-col gap-bar p-0">
      {data.map((d, i) => {
        const pct = Math.max(10, (n(d.value) / max) * 100);
        const fill = d.color || color || (i === lastIdx ? "var(--gradient-data, var(--color-primary))" : "var(--color-gray-3)");
        return (
          <li key={i} className="flex items-center gap-bar">
            <span className="min-w-label max-w-label truncate text-xs text-text-muted" title={String(d.label)}>
              {d.label}
            </span>
            {/* A flex line, not a grid — the label and value are minimums that grow, and the
                track absorbs the difference. */}
            <span className="block flex-1">
              <span
                className={`block h-6 rounded-md transition-[width] ${MOVE}`}
                style={{ width: `${pct}%`, marginInline: "auto", background: fill }}
              />
            </span>
            <span className="min-w-value text-right font-mono text-data tabular-nums text-secondary">
              {format ? format(d.value) : d.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The four-bucket key. Bucket 0 is the resting groove; 1-3 are DataCharts.dc.html's own three
 *  literal warm steps — see the file banner for why these stay hex rather than tokens. */
const HEAT_BUCKETS = ["var(--color-track)", "#FFD9BF", "#FF9E5E", "#F25A00"];

const bucketOf = (v, max) => {
  if (v <= 0) return 0;
  const pct = v / max;
  return pct <= 1 / 3 ? 1 : pct <= 2 / 3 ? 2 : 3;
};

/**
 * Intensity heatmap of a flat series. data: [{label, value}].
 *
 * FOUR discrete buckets, not the old continuous `color-mix()` gradient —
 * DataCharts.dc.html: "a per-cell color-mix against the ramp produces dozens of near-identical
 * oranges no legend can explain; four buckets can be read off the key." Each cell is quantised
 * into thirds of its value's share of the series max (bucket 0 reserved for zero/near-zero), and
 * a small "Less → More" key repeats the same 4 swatches so the mapping is legible without hovering
 * every cell. The old single-hue `color` override is gone with the gradient it recoloured — four
 * fixed buckets have nothing left for a caller to retint.
 */
export function Heatmap({ data = [], columns = 7 }) {
  if (!data.length) return <Note>No data.</Note>;
  const max = Math.max(1, ...data.map((d) => n(d.value)));
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="aspect-square rounded-sm"
            title={`${d.label}: ${d.value}`}
            style={{ background: HEAT_BUCKETS[bucketOf(n(d.value), max)] }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-text-muted">
        <span>Less</span>
        {HEAT_BUCKETS.map((bg, i) => (
          <span key={i} className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: bg }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

/**
 * Stacked horizontal bars. data: [{label, ...keyed}]. keys: [{key, label, color?}].
 *
 * The one primitive that still cycles the ramp by index (`rampAt`) — see the file banner. Each
 * part's fill comes from the caller-supplied legend/palette (`k.color`) first, because segments
 * here are usually semantic tones (pass/warn/fail) a caller already owns; the ramp is only the
 * fallback for a key nobody coloured.
 */
export function StackedBar({ data = [], keys = [] }) {
  if (!data.length || !keys.length) return <Note>No data.</Note>;
  return (
    <div className="flex flex-col gap-2.5">
      <ul className="m-0 flex list-none flex-col gap-bar p-0">
        {data.map((row, i) => {
          const total = keys.reduce((s, k) => s + n(row[k.key]), 0) || 1;
          return (
            <li key={i} className="flex items-center gap-bar">
              <span className="min-w-label max-w-label truncate text-xs text-text-muted" title={String(row.label)}>
                {row.label}
              </span>
              <span className="flex h-bar flex-1 overflow-hidden rounded-bar bg-track">
                {keys.map((k, j) => {
                  const v = n(row[k.key]);
                  if (!v) return null;
                  // No per-segment radius. The track owns the shape: `rounded-bar` +
                  // `overflow-hidden` clips the first and last segments to whatever the active
                  // language's bar radius is — exactly one shape to change, in one place.
                  return (
                    <span
                      key={j}
                      title={`${k.label || k.key}: ${v}`}
                      className="h-full"
                      style={{ width: `${(v / total) * 100}%`, background: rampAt(j, k.color) }}
                    />
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {keys.map((k, j) => (
          <span key={j} className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: rampAt(j, k.color) }} />
            {k.label || k.key}
          </span>
        ))}
      </div>
    </div>
  );
}
