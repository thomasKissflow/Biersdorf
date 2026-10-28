// data-charts.mjs — BarChart · HBars · LineChart · GaugeRing · FunnelChart · Heatmap · StackedBar.
//
// starter/lib/nav.json's "Data" group (minus ModelChart, Donut, Table, StatTile, Progress and Flow
// views — separate catalog files), DataCharts.jsx's seven presentational chart primitives. Every
// snippet below is the HTML equivalent of the real component's rendered output, transcribed from
// its actual className strings and inline styles — not re-invented. React renders SVG for LineChart
// and GaugeRing; the snippets reproduce the same SVG structure with the same attributes.
//
// None of the seven wraps itself in a surface — DataCharts.jsx's own docstring is explicit about it
// ("unlike ModelChart these do not wrap themselves in a surface") — so every specimen here is
// `bare: false` (the default), and the generator's PrimitiveCard-equivalent wrapper supplies the
// card. `html` stays the component and only the component: where the starter page additionally
// titled its wrapping `<PrimitiveCard title="…">`, that title is page chrome, not something
// `<BarChart/>` etc. render themselves, so it lives in the specimen's `label` instead of being
// welded into `html` — an assembling agent copying a snippet gets exactly the component, nothing
// borrowed from the page around it.
//
// 2026-08-13 — this section rewritten. DataCharts.jsx was REDESIGNED the same day (its own file
// banner: "Colour marks the subject, gray carries the rest... BarChart, HBars and FunnelChart no
// longer cycle --chart-1..6 per datum"), replacing the `fillAt(i, color, override)` ramp-cycle this
// comment used to describe. Found by /parity catching a live mismatch: this catalog was transcribed
// BEFORE that redesign landed and never updated, so every BarChart/HBars/FunnelChart specimen here
// was still cycling a rainbow of `--chart-N` steps per datum against real components that no longer
// do that at all.
//
// The rule now, per-datum override still wins over everything: BarChart marks the bar(s) at/near the
// series max (>=90% of it) with `--gradient-data` plus a warm glow shadow and `--color-primary-ink`
// value-label ink; the rest are flat `--color-gray-2` fill with `--color-text-muted` labels. HBars
// marks the row(s) AT the series max the same way; the rest are `--chart-6` (the ramp's own
// "everything else" step). FunnelChart marks only the LAST stage that way; every earlier stage is
// flat `--color-gray-3`. Three different "which one(s)" rules, one shared "colour marks the subject"
// principle — see each entry's own blurb for its specific threshold.
//
// The three single-series primitives (LineChart, GaugeRing, Heatmap) are UNCHANGED by any of this:
// they never cycled and never took the gradient fallback — one series is one colour, and
// LineChart's own comment is explicit that the `-grad` tokens are documented as a BAR fill, not a
// line/ring/cell treatment, so extending them there would be inventing a use the source design docs
// never describe. StackedBar is the one primitive that legitimately still cycles the ramp — its
// segments are a genuine unordered categorical set, not a single series with an outlier to mark.

import { dedent } from "./_schema.mjs";

/** @type {import("./_schema.mjs").Entry[]} */
export default [
  {
    id: "bar-chart",
    name: "BarChart",
    category: "Data",
    starterTwin: "kit/DataCharts.jsx",
    summary: "Vertical bars, one per datum. The value floats above each bar's own growing top.",
    blurb:
      "The value label is an absolutely positioned span pinned to the SAME percentage that sizes " +
      "the fill beneath it — `bottom: {pct}%` on the label, `height: {pct}%` on the fill, one shared " +
      "variable. That is what lets it track the bar's current top through the grow transition " +
      "instead of sitting fixed at the height of the tallest possible bar.",
    footer:
      "Plain `gap-2`, not `gap-bar` — the data-bar anatomy utilities (`h-bar`, `gap-bar`, " +
      "`min-w-label`/`max-w-label`, `min-w-value`) are for the horizontal ROW primitives (HBars, " +
      "FunnelChart, StackedBar); a vertical bar has no label column and no fixed row height to size, " +
      "so none of them apply here.",
    bindings: [
      {
        field: "data",
        type: "array<{label,value,color?}>",
        example: '[{"label":"Submitted","value":24}, {"label":"Triage","value":18}, … {"label":"Closed","value":3}]',
        note: "one bar per item — value sets the fill height as a % of the tallest bar in the set",
      },
      { field: "color", type: "string", example: '"var(--chart-3)"', note: "literal CSS colour on every bar, no cycling; a per-datum `d.color` still wins over it" },
      { field: "height", type: "number", example: "160", note: "pixel height of the plotting area, written straight into `style`" },
      { field: "format", type: "(value) => node", example: '(v) => `${v} claims`', note: "formats the value label floating above each bar" },
    ],
    specimens: [
      {
        // 2026-08-13 — rewritten to match DataCharts.jsx's real BarChart exactly (see this file's
        // own banner): only the bar(s) >=90% of the series max are "hot" — here, just Submitted, the
        // max itself — taking the gradient fill, the warm glow shadow, and --color-primary-ink on
        // its value label. Every other bar is flat --color-gray-2 with a --color-text-muted label,
        // not its own rainbow step. "In Repair" was also silently 12 in the old version; the real
        // fixture (_fixtures.js's CLAIM_STAGES) says 11 — fixed, and its bar height/label position
        // recomputed off the correct value (11/24 = 45.83%, not 12/24 = 50%).
        label: "data — 5 claim stages, Submitted leading",
        html: dedent(`
          <div class="flex items-stretch gap-2" style="height: 160px">
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="relative min-h-0 flex-1">
                <span class="absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap pb-1.5 font-mono text-data tabular-nums text-primary-ink" style="bottom: 100%">24</span>
                <div class="absolute inset-x-0 bottom-0 rounded-t-md transition-[height] duration-move" style="height: 100%; background: var(--gradient-data, var(--color-primary)); box-shadow: 0 10px 22px -10px rgba(255,98,3,.6)"></div>
              </div>
              <span class="mt-1.5 max-w-full truncate text-center text-xs text-muted-foreground" title="Submitted">Submitted</span>
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="relative min-h-0 flex-1">
                <span class="absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap pb-1.5 font-mono text-data tabular-nums text-text-muted" style="bottom: 75%">18</span>
                <div class="absolute inset-x-0 bottom-0 rounded-t-md bg-gray-2 transition-[height] duration-move" style="height: 75%"></div>
              </div>
              <span class="mt-1.5 max-w-full truncate text-center text-xs text-muted-foreground" title="Triage">Triage</span>
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="relative min-h-0 flex-1">
                <span class="absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap pb-1.5 font-mono text-data tabular-nums text-text-muted" style="bottom: 45.83%">11</span>
                <div class="absolute inset-x-0 bottom-0 rounded-t-md bg-gray-2 transition-[height] duration-move" style="height: 45.83%"></div>
              </div>
              <span class="mt-1.5 max-w-full truncate text-center text-xs text-muted-foreground" title="In Repair">In Repair</span>
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="relative min-h-0 flex-1">
                <span class="absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap pb-1.5 font-mono text-data tabular-nums text-text-muted" style="bottom: 25%">6</span>
                <div class="absolute inset-x-0 bottom-0 rounded-t-md bg-gray-2 transition-[height] duration-move" style="height: 25%"></div>
              </div>
              <span class="mt-1.5 max-w-full truncate text-center text-xs text-muted-foreground" title="QA">QA</span>
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="relative min-h-0 flex-1">
                <span class="absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap pb-1.5 font-mono text-data tabular-nums text-text-muted" style="bottom: 12.5%">3</span>
                <div class="absolute inset-x-0 bottom-0 rounded-t-md bg-gray-2 transition-[height] duration-move" style="height: 12.5%"></div>
              </div>
              <span class="mt-1.5 max-w-full truncate text-center text-xs text-muted-foreground" title="Closed">Closed</span>
            </div>
          </div>
        `),
      },
      {
        label: "data={[]} — empty; every chart in this file shares the same <Note>",
        html: dedent(`
          <p class="m-0 py-6 text-center text-sm text-muted-foreground">No data.</p>
        `),
      },
    ],
  },

  {
    id: "hbars",
    name: "HBars",
    category: "Data",
    starterTwin: "kit/DataCharts.jsx",
    summary: "Ranked horizontal bars — ModelChart's own row, generalised to pre-aggregated data.",
    blurb:
      "The row is label · track · rounded fill · mono value, because that row is already the " +
      "token-native answer to \"one labelled bar\" and there is no reason to invent a second one. " +
      "`sort={false}` keeps the caller's order instead of ranking by value — right for a pipeline or " +
      "a priority ladder, where re-ordering by count would scramble a sequence that is supposed to " +
      "read top to bottom in a fixed way.",
    footer:
      "The groove is `bg-track`, not `bg-muted` — a dedicated token even though the two happen to " +
      "share a value under Beacon today (whose own doc defines muted as \"donut and bar tracks\" too); " +
      "keeping them separate is what lets the groove move independently if a future page gives it its " +
      "own value. " +
      "2026-08-13 — the row at the series max takes `--gradient-data`; every other row is flat " +
      "`--chart-6`, not its own step of the ramp. Both specimens below use the SAME CLAIM_STAGES data " +
      "as BarChart, and since that fixture is already in descending order, `sort` and `sort={false}` " +
      "render identically here — the prop still does something, this fixture just can't show it.",
    bindings: [
      {
        field: "data",
        type: "array<{label,value,color?}>",
        example: '[{"label":"Submitted","value":24}, {"label":"Triage","value":18}, … {"label":"Closed","value":3}]',
        note: "one row per item",
      },
      { field: "sort", type: "boolean", example: "false", note: "true (default) ranks by value; false keeps the caller's order" },
      { field: "max", type: "number", example: "8", note: "row cap — the array is sliced, not scrolled" },
      { field: "color", type: "string", example: '"var(--chart-6)"', note: "literal override, every row" },
      { field: "format", type: "(value) => node", example: '(v) => `${v} claims`', note: "formats the mono value at the row's end" },
    ],
    specimens: [
      {
        // 2026-08-13 — rewritten to match DataCharts.jsx's real HBars: the row AT the series max
        // (Submitted, 24 — an exact match, not BarChart's >=90% band) takes the gradient fill; every
        // other row is flat --chart-6, not five different rainbow steps. Data was also invented
        // (Triage:20/QA:15/Submitted:8/In Repair:5/Closed:2) — replaced with the real CLAIM_STAGES
        // fixture, the same one BarChart and FunnelChart use.
        label: "data={CLAIM_STAGES} sort (default) — ranked by count, Submitted leads",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col gap-bar p-0">
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Submitted">Submitted</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar transition-[width] group-hover:brightness-105 duration-move" style="width: 100%; background: var(--gradient-data, var(--color-primary))"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">24</span>
            </li>
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Triage">Triage</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar bg-chart6 transition-[width] group-hover:brightness-105 duration-move" style="width: 75%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">18</span>
            </li>
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="In Repair">In Repair</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar bg-chart6 transition-[width] group-hover:brightness-105 duration-move" style="width: 45.83%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">11</span>
            </li>
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="QA">QA</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar bg-chart6 transition-[width] group-hover:brightness-105 duration-move" style="width: 25%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">6</span>
            </li>
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Closed">Closed</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar bg-chart6 transition-[width] group-hover:brightness-105 duration-move" style="width: 12.5%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">3</span>
            </li>
          </ul>
        `),
      },
      {
        label: "data={CLAIM_STAGES} sort={false} — pipeline order preserved (identical here: the fixture is already descending)",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col gap-bar p-0">
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Submitted">Submitted</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar transition-[width] group-hover:brightness-105 duration-move" style="width: 100%; background: var(--gradient-data, var(--color-primary))"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">24</span>
            </li>
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Triage">Triage</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar bg-chart6 transition-[width] group-hover:brightness-105 duration-move" style="width: 75%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">18</span>
            </li>
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="In Repair">In Repair</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar bg-chart6 transition-[width] group-hover:brightness-105 duration-move" style="width: 45.83%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">11</span>
            </li>
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="QA">QA</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar bg-chart6 transition-[width] group-hover:brightness-105 duration-move" style="width: 25%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">6</span>
            </li>
            <li class="group flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Closed">Closed</span>
              <span class="relative h-bar flex-1 overflow-hidden rounded-bar bg-track">
                <span class="absolute inset-y-0 left-0 rounded-bar bg-chart6 transition-[width] group-hover:brightness-105 duration-move" style="width: 12.5%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">3</span>
            </li>
          </ul>
        `),
      },
    ],
  },

  {
    id: "line-chart",
    name: "LineChart",
    category: "Data",
    starterTwin: "kit/DataCharts.jsx",
    summary: "Line or area trend, one series or two, with dots that live outside the SVG on purpose.",
    blurb:
      "`preserveAspectRatio=\"none\"` deliberately stretches the 0–100 square viewBox to fill a wide, " +
      "short card — that non-uniform stretch is what lets the line reach every point correctly, and " +
      "a straight line survives it fine (an affine transform keeps a line straight). A round marker " +
      "does not: an SVG `<circle>` at this box's typical aspect comes out several times wider than " +
      "tall, because `vector-effect=\"non-scaling-stroke\"` only protects a shape's stroke WIDTH from " +
      "the scale, never its geometry.",
    footer:
      "So the dots are real HTML circles, positioned OUTSIDE the distorted SVG coordinate space with " +
      "plain CSS percentages instead — the same [x,y] numbers the path uses, reused as [left%,top%] " +
      "with no conversion, because the box is 100 units square in intent. This is an inherited defect " +
      "from Charts.jsx corrected here, never caught in the original because Charts.jsx had zero " +
      "callers and was never actually rendered. Neither series ever cycles and neither falls back to " +
      "a `-grad` token — the area fill's own vertical gradient (the stroke colour at 24% opacity " +
      "fading to 0% at the baseline) already gives the wash a gradient reads for, without borrowing a " +
      "token documented for bar fills. THE TOOLTIP IS THE ONE PLACE THIS CATALOG AND THE BUILT APP " +
      "LEGITIMATELY DIFFER: the component shows it on hover or focus of an invisible per-point " +
      "column; a snippet has no hover state, so the specimen below pins it at Thursday. Same markup, " +
      "same classes, same tokens — copy it, then drive `left`/`top` and the two figures from " +
      "whichever point your script decides is active. It is positioned in the undistorted overlay " +
      "space for exactly the reason the dots are. " +
      "2026-08-13 — five corrections found against DataCharts.jsx: the grid's three dashed rules read " +
      "`stroke-gray-2` (this doc always said so; the snippet's own class had drifted to `stroke-border`), " +
      "the compare series is `--color-border` at 80% opacity — not `--chart-2` at 55%, which is " +
      "`--color-secondary` and reads as a near-black peer rather than quiet context — drawn behind " +
      "the current series so it can never cover it; the area fill is a real two-stop " +
      "`<linearGradient>` (24%→0% opacity), not a flat 12%-opacity wash; point markers are 8px " +
      "(`h-2 w-2`) with a 2px (`border-2`) border, not 7px/1.5px, and every point but the active one " +
      "dims to .35 opacity when the tooltip is pinned (undimmed, at 1, when it isn't); and the " +
      "tooltip's own text read `text-background` — `--color-canvas`, the page ground, not `--color-" +
      "surface`'s white — invisible-by-coincidence on the dark `bg-secondary` card underneath it.",
    bindings: [
      {
        field: "data",
        type: "array<{label,value}>",
        example: '[{"label":"Mon","value":4}, {"label":"Tue","value":7}, … {"label":"Sun","value":1}]',
        note: "needs ≥2 points; each becomes one SVG coordinate, one HTML dot and one tooltip column",
      },
      {
        field: "compare",
        type: "array<{label,value}>",
        example: '[{"label":"Mon","value":6}, {"label":"Tue","value":5}, … {"label":"Sun","value":3}]',
        note: "the prior period, drawn BEHIND the current series at 80% on --color-border — \"context, not a peer.\" Sliced to data's length; scaled on the SAME extent as `data` — two lines on independent axes is a chart that lies",
      },
      { field: "area", type: "boolean", example: "true", note: "a real vertical gradient fill under the line — the stroke colour at 24% opacity fading to 0% at the baseline" },
      { field: "dots", type: "boolean", example: "true", note: "point markers — real HTML circles (8px, 2px border), not SVG, for the reason above. Dim to .35 opacity for every point but the hovered one when tooltip is pinned; undimmed otherwise" },
      { field: "grid", type: "boolean", example: "true", note: "three dashed rules at 25/50/75% reading `stroke-gray-2` — a divider on white, quiet enough to sit behind the line without competing with it" },
      { field: "tooltip", type: "boolean", example: "true", note: "in a prototype: keep the pinned markup and move it from your script; the invisible column buttons are the hit targets" },
      { field: "seriesLabel / compareLabel", type: "string", example: '"This period" / "Last period"', note: "the tooltip's two row names" },
      { field: "color / compareColor", type: "string", example: '"var(--chart-1)" / "var(--color-border)"', note: "flat overrides; neither cycles, neither takes a -grad fallback" },
      { field: "format", type: "(v) => node", example: "(v) => `${v} claims`", note: "formats each series' figure in the tooltip" },
      { field: "height", type: "number", example: "190", note: "pixel height of the whole chart, day labels included" },
    ],
    specimens: [
      {
        // 2026-08-13 — rewritten against DataCharts.jsx + specimens/line-chart.jsx: grid class
        // stroke-border→stroke-gray-2; compare stroke var(--chart-2)/opacity .55 → var(--color-
        // border)/.8; area fill flat 12%-opacity wash → real two-stop <linearGradient> (24%→0%);
        // dots 7px/1.5px→8px/2px (h-2 w-2 border-2), bg-card→bg-surface, added the missing per-dot
        // hover-dimming (.35 off-Thu, 1 on Thu — this specimen pins the tooltip at Thursday, same as
        // the real component's own hover state would); tooltip bg-foreground/text-background →
        // bg-secondary/text-surface (text-background read --color-canvas, the page ground, not
        // white — invisible-by-coincidence on the dark card underneath it) and its "Last period"
        // chip-dot to var(--color-border), matching the corrected compareColor.
        label: "compare + grid + tooltip — claims this week against last, tooltip pinned at Thursday",
        html: dedent(`
          <div class="relative" style="height: 190px">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="block h-[calc(100%-1.25rem)] w-full overflow-visible">
              <defs>
                <linearGradient id="lc-grad-1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="var(--chart-1)" stop-opacity="0.24"></stop>
                  <stop offset="1" stop-color="var(--chart-1)" stop-opacity="0"></stop>
                </linearGradient>
              </defs>
              <line x1="0" y1="25" x2="100" y2="25" class="stroke-gray-2" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"></line>
              <line x1="0" y1="50" x2="100" y2="50" class="stroke-gray-2" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"></line>
              <line x1="0" y1="75" x2="100" y2="75" class="stroke-gray-2" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"></line>
              <path d="M0.00 55.56 L16.67 22.22 L33.33 44.44 L50.00 0.00 L66.67 33.33 L83.33 77.78 L100.00 88.89 L 100 100 L 0 100 Z" fill="url(#lc-grad-1)"></path>
              <path d="M0.00 33.33 L16.67 44.44 L33.33 33.33 L50.00 55.56 L66.67 22.22 L83.33 66.67 L100.00 66.67" fill="none" stroke-width="2" opacity="0.8" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" style="stroke: var(--color-border)"></path>
              <path d="M0.00 55.56 L16.67 22.22 L33.33 44.44 L50.00 0.00 L66.67 33.33 L83.33 77.78 L100.00 88.89" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" style="stroke: var(--chart-1)"></path>
            </svg>
            <div class="pointer-events-none absolute inset-x-0 top-0 h-[calc(100%-1.25rem)]">
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 0%; top: 55.5556%; border-color: var(--chart-1); opacity: 0.35"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 16.6667%; top: 22.2222%; border-color: var(--chart-1); opacity: 0.35"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 33.3333%; top: 44.4444%; border-color: var(--chart-1); opacity: 0.35"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 50%; top: 0%; border-color: var(--chart-1); opacity: 1"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 66.6667%; top: 33.3333%; border-color: var(--chart-1); opacity: 0.35"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 83.3333%; top: 77.7778%; border-color: var(--chart-1); opacity: 0.35"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 100%; top: 88.8889%; border-color: var(--chart-1); opacity: 0.35"></span>
            </div>
            <div class="absolute inset-x-0 top-0 flex h-[calc(100%-1.25rem)]">
              <button type="button" tabindex="-1" aria-hidden="true" class="h-full flex-1 cursor-default border-0 bg-transparent p-0"></button>
              <button type="button" tabindex="-1" aria-hidden="true" class="h-full flex-1 cursor-default border-0 bg-transparent p-0"></button>
              <button type="button" tabindex="-1" aria-hidden="true" class="h-full flex-1 cursor-default border-0 bg-transparent p-0"></button>
              <button type="button" tabindex="-1" aria-hidden="true" class="h-full flex-1 cursor-default border-0 bg-transparent p-0"></button>
              <button type="button" tabindex="-1" aria-hidden="true" class="h-full flex-1 cursor-default border-0 bg-transparent p-0"></button>
              <button type="button" tabindex="-1" aria-hidden="true" class="h-full flex-1 cursor-default border-0 bg-transparent p-0"></button>
              <button type="button" tabindex="-1" aria-hidden="true" class="h-full flex-1 cursor-default border-0 bg-transparent p-0"></button>
            </div>
            <div class="pointer-events-none absolute z-10 min-w-max -translate-x-1/2 -translate-y-full rounded-md bg-secondary px-3 py-2 text-surface shadow-overlay" role="status" style="left: 50%; top: calc(0% - 10px)">
              <p class="m-0 mb-1 text-xs font-semibold">Thu</p>
              <p class="m-0 flex items-center gap-1.5 whitespace-nowrap text-xs">
                <span class="chip-dot flex-none" style="background: var(--chart-1)"></span>This period<span class="ml-1 font-mono text-data font-semibold tabular-nums">9 claims</span>
              </p>
              <p class="m-0 mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-xs opacity-70">
                <span class="chip-dot flex-none" style="background: var(--color-border)"></span>Last period<span class="ml-1 font-mono text-data font-semibold tabular-nums">4 claims</span>
              </p>
            </div>
            <div class="mt-2 flex justify-between gap-2">
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Mon</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Tue</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Wed</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Thu</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Fri</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Sat</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Sun</span>
            </div>
          </div>
        `),
      },
      {
        // 2026-08-13 — the old specimen invented a 6-point Mon–Sat dataset with its own numbers.
        // This is the real WEEKLY_TREND (7 points, Mon–Sun) — the same numbers specimen 1's "this
        // period" series plots, since an un-compared LineChart scales against its own data alone and
        // WEEKLY_TREND alone yields the identical [0,9] extent specimen 1's combined extent already
        // had. Same area-gradient and dot fixes as specimen 1, minus the grid/compare/tooltip that
        // real specimens/line-chart.jsx's second entry doesn't pass either.
        label: "data={WEEKLY_TREND} — single series, claims filed per day, Mon–Sun",
        html: dedent(`
          <div style="height: 140px" class="relative">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="block h-[calc(100%-1.25rem)] w-full overflow-visible">
              <defs>
                <linearGradient id="lc-grad-2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="var(--chart-1)" stop-opacity="0.24"></stop>
                  <stop offset="1" stop-color="var(--chart-1)" stop-opacity="0"></stop>
                </linearGradient>
              </defs>
              <path d="M0.00 55.56 L16.67 22.22 L33.33 44.44 L50.00 0.00 L66.67 33.33 L83.33 77.78 L100.00 88.89 L 100 100 L 0 100 Z" fill="url(#lc-grad-2)"></path>
              <path d="M0.00 55.56 L16.67 22.22 L33.33 44.44 L50.00 0.00 L66.67 33.33 L83.33 77.78 L100.00 88.89" fill="none" style="stroke: var(--chart-1)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"></path>
            </svg>
            <div class="pointer-events-none absolute inset-x-0 top-0 h-[calc(100%-1.25rem)]">
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 0%; top: 55.5556%; border-color: var(--chart-1)"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 16.6667%; top: 22.2222%; border-color: var(--chart-1)"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 33.3333%; top: 44.4444%; border-color: var(--chart-1)"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 50%; top: 0%; border-color: var(--chart-1)"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 66.6667%; top: 33.3333%; border-color: var(--chart-1)"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 83.3333%; top: 77.7778%; border-color: var(--chart-1)"></span>
              <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-opacity" style="left: 100%; top: 88.8889%; border-color: var(--chart-1)"></span>
            </div>
            <div class="mt-2 flex justify-between gap-2">
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Mon</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Tue</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Wed</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Thu</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Fri</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Sat</span>
              <span class="min-w-0 truncate text-[10px] text-muted-foreground">Sun</span>
            </div>
          </div>
        `),
      },
      {
        label: "data — a single point; needs at least two",
        html: dedent(`
          <p class="m-0 py-6 text-center text-sm text-muted-foreground">Not enough data to chart.</p>
        `),
      },
    ],
  },

  {
    id: "gauge-ring",
    name: "GaugeRing",
    category: "Data",
    starterTwin: "kit/DataCharts.jsx",
    summary: "Radial gauge for a single ratio.",
    blurb:
      "Two concentric circles, both fixed radius 54 on a 140×140 viewBox: a plain groove reading " +
      "`stroke-track`, and a progress circle whose `stroke-dasharray`/`stroke-dashoffset` pair draws " +
      "the ratio, rotated -90° so the arc starts at 12 o'clock instead of 3.",
    footer:
      "The groove token is the same one HBars' track reads — `stroke-track` resolves through the " +
      "identical `--color-track` role as `bg-track`, so a gauge's empty arc and a bar's empty groove " +
      "always agree under all three languages. Single-series like LineChart: `color` is a flat " +
      "override, never a ramp cycle. " +
      "2026-08-13 — `tone` added: it tints groove (-bg), ring (-dot, falling back to -ink) and figure " +
      "(-ink) together, the same three-part split Card/StatTile's own tone prop uses. Opt-in and " +
      "additive — no tone renders exactly as it always has, so \"the groove always reads stroke-track\" " +
      "above is now the untoned case specifically, not an unconditional rule.",
    bindings: [
      { field: "value", type: "number", example: "11", note: "the numerator" },
      { field: "max", type: "number", example: "16", note: "the denominator; the ratio is clamped to [0,1]" },
      { field: "label", type: "string", example: '"Compliant"', note: "caption below the ring" },
      { field: "sublabel", type: "string", example: '"of 16"', note: "second line inside the ring, under the percentage" },
      { field: "color", type: "string", example: '"var(--chart-1)"', note: "ring stroke only. Ignored when tone is set" },
      { field: "tone", type: '"success" · "warning" · "info" · "danger"', example: '"success"', note: "OPTIONAL. Tints groove (-bg), ring (-dot, falling back to -ink) and figure (-ink) together" },
      { field: "size", type: "number", example: "150", note: "pixel width of the outer wrapper" },
    ],
    specimens: [
      {
        // 2026-08-13 — stroke-width 14→9 (real DataCharts.jsx:376/384 is 9, not 14 — every ring in
        // both specimens was ~55% too thick), percentage text font-display→font-mono + tabular-nums
        // restored (font-display is this codebase's heading/KPI-figure face; a gauge's percentage is
        // a data value like every other number in this file, and font-mono is what they all use), y
        // 74→76 and 92→94 (real DataCharts.jsx:393/401 — both were 2px off).
        label: "value={11} max={16} — a compliance ratio",
        html: dedent(`
          <div style="width: 150px">
            <svg viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="54" fill="none" class="stroke-track" stroke-width="9"></circle>
              <circle cx="70" cy="70" r="54" fill="none" style="stroke: var(--chart-1)" stroke-width="9" stroke-linecap="round" stroke-dasharray="339.29" stroke-dashoffset="106.03" transform="rotate(-90 70 70)" class="transition-[stroke-dashoffset] duration-move"></circle>
              <text x="70" y="76" text-anchor="middle" class="fill-foreground font-mono text-[22px] font-semibold tabular-nums">69%</text>
              <text x="70" y="94" text-anchor="middle" class="fill-muted-foreground text-[11px]">of 16</text>
            </svg>
            <div class="mt-1 text-center text-xs text-muted-foreground">Compliant</div>
          </div>
        `),
      },
      {
        label: "value={0} — the empty ring",
        html: dedent(`
          <div style="width: 150px">
            <svg viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="54" fill="none" class="stroke-track" stroke-width="9"></circle>
              <circle cx="70" cy="70" r="54" fill="none" style="stroke: var(--chart-1)" stroke-width="9" stroke-linecap="round" stroke-dasharray="339.29" stroke-dashoffset="339.29" transform="rotate(-90 70 70)" class="transition-[stroke-dashoffset] duration-move"></circle>
              <text x="70" y="76" text-anchor="middle" class="fill-foreground font-mono text-[22px] font-semibold tabular-nums">0%</text>
              <text x="70" y="94" text-anchor="middle" class="fill-muted-foreground text-[11px]">of 16</text>
            </svg>
            <div class="mt-1 text-center text-xs text-muted-foreground">None yet</div>
          </div>
        `),
      },
      {
        // 2026-08-13 — new specimen: `tone` was entirely missing from this catalog entry (the real
        // component's own specimen file has always had it, gauge-ring.jsx:46-53). value=14/max=16 →
        // 87.5%, rounds to 88; dashoffset = 339.29 × (1 - 0.875) = 42.41. Groove/ring/figure colours
        // read through literal Tailwind utility classes (stroke-success-bg/-dot, fill-success-ink),
        // not raw var() in inline style — the -bg/-dot custom properties this app's CDN runtime only
        // emits when an actual class references them, the same fix StatTile's tone pills needed.
        label: 'tone="success" — groove, ring and figure tinted together',
        html: dedent(`
          <div style="width: 150px">
            <svg viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="54" fill="none" class="stroke-success-bg" stroke-width="9"></circle>
              <circle cx="70" cy="70" r="54" fill="none" class="stroke-success-dot" stroke-width="9" stroke-linecap="round" stroke-dasharray="339.29" stroke-dashoffset="42.41" transform="rotate(-90 70 70)" class="transition-[stroke-dashoffset] duration-move stroke-success-dot"></circle>
              <text x="70" y="76" text-anchor="middle" class="fill-success-ink font-mono text-[22px] font-semibold tabular-nums">88%</text>
              <text x="70" y="94" text-anchor="middle" class="fill-muted-foreground text-[11px]">of 16</text>
            </svg>
            <div class="mt-1 text-center text-xs text-muted-foreground">On track</div>
          </div>
        `),
      },
    ],
  },

  {
    id: "funnel-chart",
    name: "FunnelChart",
    category: "Data",
    starterTwin: "kit/DataCharts.jsx",
    summary: "Descending stages, tapering by value, caller order preserved.",
    blurb:
      "One deliberate deviation from Charts.jsx: the original printed the value INSIDE the coloured " +
      "bar. That only stays legible if every fill in the ramp has a known, safe contrast against one " +
      "ink — true of a single hand-picked palette, false of independent theme ramps (an amber step " +
      "cannot always hold white, and nothing here can promise chart-5 in a language not yet written " +
      "is any different). The value sits OFF the fill instead, the same precedent ModelChart already " +
      "set, so no per-render contrast problem is ever re-opened.",
    footer:
      "The row is a flex line, not a grid — it used to be `grid-cols-[minmax(0,6rem)_1fr_2.5rem]`, " +
      "which capped the label track at 6rem, BELOW `max-w-label`'s 7rem, so both label utilities were " +
      "inert and the value column was a hard-coded 2.5rem instead of the token's minimum. The label " +
      "and value are minimums that grow, and \"the track absorbs the difference\" is a flex-line rule " +
      "by definition. Bars are centred (`margin-inline: auto`) and clamped to a 10% floor so a stage " +
      "near zero still reads as a bar, not a sliver.",
    bindings: [
      {
        field: "data",
        type: "array<{label,value,color?}>",
        example: '[{"label":"Submitted","value":24}, {"label":"Triage","value":18}, … {"label":"Closed","value":3}]',
        note: "caller order preserved — a funnel is a sequence, never re-ranked",
      },
      { field: "color", type: "string", example: '"var(--chart-2)"', note: "literal override, every stage" },
      { field: "format", type: "(value) => node", example: '(v) => `${v} claims`', note: "formats the mono value beside each bar — never inside it" },
    ],
    specimens: [
      {
        // 2026-08-13 — rewritten to match DataCharts.jsx's real FunnelChart: only the LAST stage
        // (Closed, the deepest — the outcome the funnel measures toward) takes the gradient fill;
        // every earlier stage is flat --color-gray-3, not four different rainbow steps. "In Repair"
        // was also silently 12 — the real CLAIM_STAGES fixture says 11 (45.83%, not 50%), the same
        // fix BarChart and HBars needed.
        label: "data — the same 5-stage funnel, tapering by value",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col gap-bar p-0">
            <li class="flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Submitted">Submitted</span>
              <span class="block flex-1">
                <span class="block h-6 rounded-md bg-gray-3 transition-[width] duration-move" style="width: 100%; margin-inline: auto"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">24</span>
            </li>
            <li class="flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Triage">Triage</span>
              <span class="block flex-1">
                <span class="block h-6 rounded-md bg-gray-3 transition-[width] duration-move" style="width: 75%; margin-inline: auto"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">18</span>
            </li>
            <li class="flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="In Repair">In Repair</span>
              <span class="block flex-1">
                <span class="block h-6 rounded-md bg-gray-3 transition-[width] duration-move" style="width: 45.83%; margin-inline: auto"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">11</span>
            </li>
            <li class="flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="QA">QA</span>
              <span class="block flex-1">
                <span class="block h-6 rounded-md bg-gray-3 transition-[width] duration-move" style="width: 25%; margin-inline: auto"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">6</span>
            </li>
            <li class="flex items-center gap-bar">
              <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Closed">Closed</span>
              <span class="block flex-1">
                <span class="block h-6 rounded-md transition-[width] duration-move" style="width: 12.5%; margin-inline: auto; background: var(--gradient-data, var(--color-primary))"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-foreground">3</span>
            </li>
          </ul>
        `),
      },
    ],
  },

  {
    id: "heatmap",
    name: "Heatmap",
    category: "Data",
    starterTwin: "kit/DataCharts.jsx",
    summary: "Intensity grid — four discrete warm buckets by value, not a continuous mix.",
    blurb:
      "FOUR discrete buckets, not the old continuous `color-mix()` gradient — DataCharts.dc.html: " +
      "\"a per-cell color-mix against the ramp produces dozens of near-identical oranges no legend " +
      "can explain; four buckets can be read off the key.\" Each cell quantises into thirds of its " +
      "value's share of the series max — bucket 0 reserved for zero/near-zero, buckets 1-3 the three " +
      "warm steps below — and a small \"Less → More\" key repeats the same 4 swatches so the mapping " +
      "is legible without hovering every cell.",
    footer:
      "2026-08-13 — this entry previously described a retired mechanism (a per-cell `color-mix()` " +
      "toward `hsl(var(--muted))`, scaled continuously by value, with a `color` prop to pick the " +
      "mix's full-strength end). That is gone; four fixed buckets have nothing left for a caller to " +
      "retint, so `color` is gone with it. Bucket 1-3's three hex values (#FFD9BF/#FF9E5E/#F25A00) " +
      "are written literally, not through a token — DataCharts.jsx's file banner names this its one " +
      "deliberate exception to \"nothing here writes a hex\": a legend of four literal swatches can " +
      "always be pointed at, where a formula's output can't. Bucket 0 stays a real token, `--color-" +
      "track` — the same resting-groove role HBars' and GaugeRing's tracks read.",
    bindings: [
      {
        field: "data",
        type: "array<{label,value}>",
        example: '[{"label":"Day 1","value":4}, {"label":"Day 2","value":10}, … 28 days total]',
        note: "one cell per item; value's share of the series max picks one of four discrete buckets — never a continuous mix",
      },
      { field: "columns", type: "number", example: "7", note: "grid-template-columns count — 7 reads as a calendar week" },
    ],
    specimens: [
      {
        label: "data — 28 days of claim volume, columns={7}",
        html: dedent(`
          <div>
            <div class="grid gap-1" style="grid-template-columns: repeat(7, 1fr)">
              <div class="aspect-square rounded-sm" title="Day 1: 4" style="background: #FFD9BF"></div>
              <div class="aspect-square rounded-sm" title="Day 2: 10" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 3: 14" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 4: 13" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 5: 7" style="background: #FF9E5E"></div>
              <div class="aspect-square rounded-sm" title="Day 6: 8" style="background: #FF9E5E"></div>
              <div class="aspect-square rounded-sm" title="Day 7: 13" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 8: 14" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 9: 10" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 10: 4" style="background: #FFD9BF"></div>
              <div class="aspect-square rounded-sm" title="Day 11: 11" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 12: 14" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 13: 13" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 14: 7" style="background: #FF9E5E"></div>
              <div class="aspect-square rounded-sm" title="Day 15: 8" style="background: #FF9E5E"></div>
              <div class="aspect-square rounded-sm" title="Day 16: 13" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 17: 14" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 18: 10" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 19: 4" style="background: #FFD9BF"></div>
              <div class="aspect-square rounded-sm" title="Day 20: 11" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 21: 14" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 22: 12" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 23: 7" style="background: #FF9E5E"></div>
              <div class="aspect-square rounded-sm" title="Day 24: 8" style="background: #FF9E5E"></div>
              <div class="aspect-square rounded-sm" title="Day 25: 13" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 26: 14" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 27: 10" style="background: #F25A00"></div>
              <div class="aspect-square rounded-sm" title="Day 28: 5" style="background: #FF9E5E"></div>
            </div>
            <div class="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-text-muted">
              <span>Less</span>
              <span class="h-2.5 w-2.5 flex-none rounded-sm" style="background: var(--color-track)"></span>
              <span class="h-2.5 w-2.5 flex-none rounded-sm" style="background: #FFD9BF"></span>
              <span class="h-2.5 w-2.5 flex-none rounded-sm" style="background: #FF9E5E"></span>
              <span class="h-2.5 w-2.5 flex-none rounded-sm" style="background: #F25A00"></span>
              <span>More</span>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "stacked-bar",
    name: "StackedBar",
    category: "Data",
    starterTwin: "kit/DataCharts.jsx",
    summary: "Stacked horizontal bars — one row per record, one segment per key.",
    blurb:
      "Same label · track · fill row as HBars, except the track holds several segments instead of " +
      "one, each keyed by `keys[].key` and sized to its share of the row's total. A legend below the " +
      "rows repeats each key's swatch and label, same colour resolution as the segments.",
    footer:
      "No per-segment radius. The track owns the shape: `rounded-bar` + `overflow-hidden` on the " +
      "track clips the first and last segments to whatever the active language's bar radius is. The " +
      "old version hard-coded `first:rounded-l-full last:rounded-r-full` — Beacon's 999px pill, and " +
      "nobody else's. Same flex-line correction as FunnelChart's row, and this one had it worse: the " +
      "label used to carry no `min-w-label`/`max-w-label` at all, so its width was purely the grid's " +
      "hard-coded 7rem.",
    bindings: [
      {
        field: "data",
        type: "array<{label, ...keyed}>",
        example: '[{"label":"Home_Center","electronics":12,"appliances":8,"furniture":3}]',
        note: "one row per record; each key in `keys` becomes one segment",
      },
      {
        field: "keys",
        type: "array<{key,label,color?}>",
        example: '[{"key":"electronics","label":"Electronics"}, {"key":"appliances","label":"Appliances"}, {"key":"furniture","label":"Furniture"}]',
        note: "segment order and the legend below the rows; per-key color overrides the ramp",
      },
    ],
    specimens: [
      {
        label: "data — repairs by service centre, split by equipment category",
        html: dedent(`
          <div class="flex flex-col gap-2.5">
            <ul class="m-0 flex list-none flex-col gap-bar p-0">
              <li class="flex items-center gap-bar">
                <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Home_Center">Home_Center</span>
                <span class="flex h-bar flex-1 overflow-hidden rounded-bar bg-track">
                  <span title="Electronics: 12" class="h-full" style="width: 52.17%; background: var(--chart-1)"></span>
                  <span title="Appliances: 8" class="h-full" style="width: 34.78%; background: var(--chart-2)"></span>
                  <span title="Furniture: 3" class="h-full" style="width: 13.04%; background: var(--chart-3)"></span>
                </span>
              </li>
              <li class="flex items-center gap-bar">
                <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Downtown">Downtown</span>
                <span class="flex h-bar flex-1 overflow-hidden rounded-bar bg-track">
                  <span title="Electronics: 9" class="h-full" style="width: 45%; background: var(--chart-1)"></span>
                  <span title="Appliances: 5" class="h-full" style="width: 25%; background: var(--chart-2)"></span>
                  <span title="Furniture: 6" class="h-full" style="width: 30%; background: var(--chart-3)"></span>
                </span>
              </li>
              <li class="flex items-center gap-bar">
                <span class="min-w-label max-w-label truncate text-xs text-muted-foreground" title="Airport_Mall">Airport_Mall</span>
                <span class="flex h-bar flex-1 overflow-hidden rounded-bar bg-track">
                  <span title="Electronics: 15" class="h-full" style="width: 83.33%; background: var(--chart-1)"></span>
                  <span title="Appliances: 2" class="h-full" style="width: 11.11%; background: var(--chart-2)"></span>
                  <span title="Furniture: 1" class="h-full" style="width: 5.56%; background: var(--chart-3)"></span>
                </span>
              </li>
            </ul>
            <div class="flex flex-wrap gap-x-4 gap-y-1.5">
              <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span class="h-2 w-2 flex-none rounded-full" style="background: var(--chart-1)"></span>
                Electronics
              </span>
              <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span class="h-2 w-2 flex-none rounded-full" style="background: var(--chart-2)"></span>
                Appliances
              </span>
              <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span class="h-2 w-2 flex-none rounded-full" style="background: var(--chart-3)"></span>
                Furniture
              </span>
            </div>
          </div>
        `),
      },
    ],
  },
];
