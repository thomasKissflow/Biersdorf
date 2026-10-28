import { useMemo } from "react";
import { BarChart3 } from "lucide-react";

import { Card, CardTitle } from "./Cards.jsx";
import { EmptyState, NoAccess } from "./Feedback.jsx";
import { Callout } from "./Callout.jsx";
import { useFlow, cellText, pickKey } from "./useFlow.js";

/**
 * ModelChart — a ranked breakdown that fetches its own rows, groups them, and owns its panel.
 *
 * REDESIGNED 2026-08-13 from ModelChart.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229). Its own framing: "The only chart in the system
 * that brings its own surface — and the only one that has to be honest about what it is not
 * showing." Both halves of that sentence are load-bearing below: OWN PANEL, and the
 * rank → cap → declare contract that makes the cap honest.
 *
 * DATA-FETCHING MOVED TO useFlow.js. This file used to carry its own `fetchRows`/`pickGroupKey` —
 * a byte-for-byte duplicate of the logic FlowViews.jsx's SDK-bound components also needed, which
 * useFlow.js's own banner names as exactly why it was extracted ("duplicated in the first two
 * [ModelChart, DataTable], which is how the Process bug in the original Chart.jsx survived so
 * long — the fix lived in one copy"). This file is that consolidation happening: `useFlow` now
 * owns the fetch (blocked/loading/error/rows/columns/reload), `pickKey` owns the groupBy
 * auto-detect, `cellText` owns the {Name}/{value}/{_id} cell unwrap. Nothing about the Process
 * fallback chain (getAdminItems → getParticipatedItems → getMyItems → getItems, continuing past a
 * successful-but-EMPTY response rather than stopping at it) changed — it lives in useFlow.js now,
 * unmodified, and this file inherits any future fix to it for free.
 *
 * ONE SIDE EFFECT WORTH NAMING: grouping is now a separate `useMemo` over `state.rows` /
 * `state.columns`, decoupled from the fetch itself. The old file's own comment insisted "groupBy
 * IS in the deps" of its fetch effect, because fetching and grouping were the same function —
 * changing groupBy re-ran the network call just to recompute a local tally. That coupling is gone:
 * `useFlow` does not refetch on `groupBy`, and the memo below recomputes the tally from
 * already-fetched rows with no new SDK call. The GUARANTEE the old comment was protecting —
 * changing groupBy on a mounted chart never keeps a stale grouping — still holds, just for free
 * instead of by re-fetching.
 *
 * WHY NOT `<Gate/>` (FlowViews.jsx's exported shared state machine, which names ModelChart as its
 * own "next candidate"). Reused everywhere it actually fits — `useFlow`, `NoAccess`, `EmptyState`,
 * `Callout` are the same imports Gate itself uses — but not the Gate component wholesale, for four
 * reasons specific to this page's own spec:
 *   1. OWN PANEL. Gate is content-only — FlowTimeline/FlowBoard render inside whatever surface
 *      their caller supplies. ModelChart.dc.html's whole opening line is that this component
 *      brings its own (`--color-surface` · `--shadow-panel`), in every state, with its own title.
 *   2. The loading skeleton is a different shape. Gate's `GateSkeleton` is a title+meta ROW
 *      (avatar circle + two text bars) — right for a timeline entry or a board card, wrong for a
 *      ranked bar: this page's own loading rows have to show label·track·value at descending
 *      widths, "the real row's anatomy... a block of equal bars would be cheaper and would tell
 *      you nothing about what is arriving."
 *   3. The error detail differs. Gate's error line is `CODE · resourceId · elapsed` — a good
 *      generic diagnostic, but this page's spec asks for the thing actually useful when a Process
 *      chart fails: which listing APIs were tried, in order.
 *   4. The empty CONDITION differs. Gate checks `!state.rows.length`; this component's empty
 *      condition is `!ranked.length` — the grouped/counted result, not the raw row count (the two
 *      only diverge when every row's groupBy value is nullish, which is rare, but the honest check
 *      is on what the chart is about to draw, not on what the fetch returned).
 *
 * OWN PANEL, verbatim: `--color-surface` fill, `--shadow-panel` — unlike DataCharts.jsx's
 * primitives (BarChart, HBars, FunnelChart, …), which carry no surface of their own and expect a
 * caller-supplied Card. `Panel` below is Cards.jsx's own `Card`/`CardTitle`, role="list" (the
 * card-pad-list padding role), not a hand-rolled surface — Cards.jsx already draws exactly this
 * fill+shadow+radius combination, so re-declaring it here would be a second copy of a decision
 * Cards.jsx already made.
 *
 * THE THREE ORDERING RULES — the actual point of this component, verified against the file this
 * replaces and found ALREADY CORRECT, not a bug this pass fixed:
 *   1. RANK — `ranked` sorts every group descending by value before anything else touches it.
 *   2. CAP — `rows` slices the top `cap` (default 8) OF THE RANKED LIST. Capping before sorting
 *      would make "top 8" mean "the first 8 groups in insertion order," and the longest bar on
 *      screen would not be the largest value.
 *   3. DECLARE — `max` is computed from `rows` (the rows actually shown), never from `ranked` (the
 *      full set). Scoping it to the visible set is what keeps every bar honestly proportioned even
 *      if the cap or the ranking ever changes; today, with rank running first, `rows[0]` already
 *      IS the overall max whenever there is data, so this is defence-in-depth, not a fix for a
 *      live bug.
 * The footer now ALWAYS renders in the ready state — "Top {cap} of {total} groups · {hidden} more
 * not shown" when something is hidden, "All {total} groups shown" when the cap covers everything.
 * The old file only rendered a footer in the first case, so a five-value status field got no
 * chrome at all; this page's spec wants the situation stated either way, not just when it is bad
 * news.
 *
 * `cap` is NEW — the hard-coded `CAP = 8` became a prop, default unchanged. Whatever it is, the
 * hidden count is stated in the footer; there is no cap value that renders silently.
 *
 * THE BAR FILL, restyled per ModelChart.dc.html's own token mapping. The old file cycled
 * `var(--chart-N-grad, var(--chart-N))` across every row by index — every language's full ramp,
 * one series colour per row. The new spec narrows this: only the LEADING (rank-0) row carries
 * colour, via `--gradient-data` (falling back to the flat `--chart-1` if a language ever declares
 * no gradient) — "the row at the series max," the same rule DataCharts' own HBars specimen now
 * documents for itself. Every row after it walks a de-emphasis INK scale instead of the chart
 * ramp: `--color-secondary` → `-ink-soft` → `-text-muted` → `-text-subtle`, holding at the last
 * step for any further rows rather than continuing to `--color-border` — one step darker than
 * `--color-track`'s own fill, so it "stops before it disappears into the track" instead of
 * reaching a step that would.
 *
 * COLUMN WIDTHS. `min-w-label`/`max-w-label`/`min-w-value` are the SAME utilities HBars,
 * FunnelChart, StackedBar and ProgressBar already read — not re-declared as one-off arbitrary
 * values here even though ModelChart.dc.html's own prose gives literal pixel numbers (112px
 * label, ~34px value). `max-w-label`'s own fallback is `7rem` — exactly 112px — which is the tell
 * that the source page is DESCRIBING this shared utility's current number, not asking for a
 * different one just for this file. `min-w-value`'s fallback (18px) does not equal the prose's
 * "~34px" as closely, but the tilde there reads as an observed render width in the source mock
 * (three tabular-mono digits at whatever size lands once DataCharts.dc.html's own type token
 * exists), not a second number to fork into a one-file override — forking it would mean five
 * components sharing one bar row start disagreeing about how wide a value column is. Left as the
 * shared token; revisit if DataCharts.dc.html actually retunes `--value-col-min`.
 *
 * `rounded-bar`/`text-data` are used nowhere in this file, unlike every sibling bar row. Both are
 * currently INERT — tokens.css's Foundations pass named neither `--radius-bar` nor `--text-data`
 * (see that file's own banner: "a chart ramp... GONE here"), so `rounded-bar` compiles to no
 * radius at all today and would render this component's bars square-cornered while every other
 * page still using it waits on DataCharts.dc.html to land. `rounded-full` is used instead —
 * ModelChart.dc.html's own row anatomy says "track... rounded-full," not "rounded-bar," so this
 * is the source's own answer, not a workaround invented here. `h-bar`/`gap-bar`/`duration-move`
 * stay: their `@utility` fallbacks are real numbers today (10px / 10px / 220ms) and match the
 * source's own numbers, so nothing about them needed changing.
 *
 * Tailwind preflight is OFF in this project (src/shadcn.css), so headings/paragraphs/lists below
 * reset their own UA margin — drop an `m-0` and a stray UA gap reads as a spacing bug.
 */

// Mirrors useFlow.js's own `attempts` constant inside `fetchRows` — DISPLAY ONLY. useFlow.js does
// not export which method names it actually tried (only the fetch, not the attempt list, is
// shared), so this is named again here purely to render the mono "Tried:" line below. If
// useFlow.js's own list ever changes, this is the line that goes stale.
const PROCESS_ATTEMPTS = ["getAdminItems", "getParticipatedItems", "getMyItems", "getItems"];

// The de-emphasis ink walk. Index 0 (the leading/rank-0 row) never reads this — see `fillAt`.
const INK_STEPS = [
  "var(--color-secondary)",
  "var(--color-ink-soft)",
  "var(--color-text-muted)",
  "var(--color-text-subtle)",
];

/** Row 0 gets the brand gradient; every row after it holds at the last ink step that still clears
 *  `--color-track`, rather than continuing on to `--color-border` and disappearing into it. */
function fillAt(i) {
  if (i === 0) return "var(--gradient-data, var(--chart-1))";
  return INK_STEPS[Math.min(i - 1, INK_STEPS.length - 1)];
}

/** ModelChart's own shell — see the file banner's "OWN PANEL". Every state below renders through
 *  this, including error, so the caller's `title` never disappears just because a fetch failed. */
function Panel({ title, children }) {
  return (
    <Card role="list">
      {title && <CardTitle>{title}</CardTitle>}
      {children}
    </Card>
  );
}

/** Loading — the real row's anatomy (label bar · track bar · value bar) at descending widths, not
 *  a block of equal bars. Descending widths are the one signal available before any real value has
 *  arrived that this is going to be a RANKED list. */
function LoadingRows() {
  return (
    <ul className="m-0 flex list-none flex-col gap-bar p-0" aria-hidden="true">
      {[86, 72, 59, 46, 34].map((w, i) => (
        <li key={i} className="flex items-center gap-bar">
          <span className="min-w-label max-w-label h-3 animate-pulse rounded-sm bg-gray-1" style={{ animationDuration: "1.6s" }} />
          <span className="relative h-bar flex-1 overflow-hidden rounded-full bg-track">
            <span
              className="absolute inset-y-0 left-0 animate-pulse rounded-full bg-gray-1"
              style={{ width: `${w}%`, animationDuration: "1.6s" }}
            />
          </span>
          <span className="min-w-value h-3 animate-pulse rounded-sm bg-gray-1" style={{ animationDuration: "1.6s" }} />
        </li>
      ))}
    </ul>
  );
}

export function ModelChart({ title, flowType = "Form", flowId, groupBy, cap = 8 }) {
  const state = useFlow(flowType, flowId);

  // The grouped/ranked tally. A pure transform of already-fetched rows — see the file banner on
  // why groupBy no longer needs to be a fetch dependency. RANK happens here, before cap or max.
  const ranked = useMemo(() => {
    const key = pickKey(groupBy, state.columns, state.rows[0]);
    const counts = {};
    for (const r of state.rows) {
      const k = String(cellText(r[key]));
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [state.rows, state.columns, groupBy]);

  if (state.blocked) return <Panel title={title}><NoAccess /></Panel>;

  if (state.loading) return <Panel title={title}><LoadingRows /></Panel>;

  if (state.error) {
    const tried = flowType === "Process" ? PROCESS_ATTEMPTS : ["getItems"];
    return (
      <Panel title={title}>
        {/* Title stays generic and true for every flowType — FlowViews.jsx's Gate uses the same
            "Could not load" headline for the same reason: a hardcoded, flowType-specific title
            ("No listing API on this process") would be WRONG whenever the real cause is a genuine
            SDK/network error surfacing as `lastError` rather than the chain simply running dry
            (useFlow.js:59-60) — which is the common case, not the rare one. The real message is
            still shown in full below; the "Tried:" line adds what the message alone does not say:
            which APIs were attempted, in order. */}
        <Callout tone="danger" title="Could not load this chart">
          {state.error}
          <p className="m-0 mt-2 font-mono text-data tabular-nums opacity-75">
            Tried: {tried.join(", ")}
          </p>
        </Callout>
      </Panel>
    );
  }

  if (!ranked.length) {
    return (
      <Panel title={title}>
        <EmptyState
          icon={<BarChart3 />}
          title="No data for this chart yet"
          message="Every listing API answered, none had rows. That is an honest empty, not a failure."
        />
      </Panel>
    );
  }

  // CAP — top `cap` of the RANKED list, never cap-then-sort.
  const rows = ranked.slice(0, cap);
  // DECLARE — max comes from the rows actually shown, not the full ranked set.
  const max = Math.max(1, ...rows.map((d) => d.value));
  const hidden = ranked.length - rows.length;

  return (
    <Panel title={title}>
      <ul className="m-0 flex list-none flex-col gap-bar p-0">
        {rows.map((d, i) => (
          <li key={d.label} className="group flex items-center gap-bar">
            <span className="min-w-label max-w-label truncate text-xs text-text-muted" title={d.label}>
              {d.label}
            </span>
            <span className="relative h-bar flex-1 overflow-hidden rounded-full bg-track">
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-move ease-standard group-hover:brightness-105"
                style={{ width: `${(d.value / max) * 100}%`, background: fillAt(i) }}
              />
            </span>
            <span className="min-w-value text-right font-mono text-data tabular-nums text-secondary">
              {d.value}
            </span>
          </li>
        ))}
      </ul>
      {/* Always rendered in the ready state — said out loud either way, not only when something is
          hidden. See the file banner's "THE THREE ORDERING RULES" for why DECLARE is the point. */}
      <p className="m-0 mt-3.5 border-t border-gray-1 pt-3 text-xs text-text-muted">
        {hidden > 0 ? (
          <>
            Top <span className="font-mono tabular-nums text-secondary">{cap}</span> of{" "}
            <span className="font-mono tabular-nums text-secondary">{ranked.length}</span> groups ·{" "}
            <span className="font-mono tabular-nums text-secondary">{hidden}</span> more not shown
          </>
        ) : (
          <>
            All <span className="font-mono tabular-nums text-secondary">{ranked.length}</span> groups shown
          </>
        )}
      </p>
    </Panel>
  );
}
