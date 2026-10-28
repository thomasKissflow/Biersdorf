/**
 * ProgressBar · SegmentBar · ProgressList — one rail, three ways.
 *
 * REDESIGNED 2026-08-13 from Progress.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — its own "Token mapping" table, transcribed here
 * as [SOURCE] comments per change:
 *
 *   Track fill/height   --color-track · h-1.5 (6px)             (was h-bar, a token this file
 *                                                                  shared with chart bars — see
 *                                                                  the note below)
 *   Track radius         rounded-full + overflow-hidden           (was rounded-bar — a token
 *                                                                   retired in the Foundations
 *                                                                   pass, resolving to nothing)
 *   Fill                 --color-primary default, tone -> -dot    (the solid dot value — "exactly
 *                                                                   where a tone's full strength
 *                                                                   is allowed to appear"; was the
 *                                                                   chart ramp's first step)
 *   Fill transition       duration-160 · --ease-standard, width    (was duration-move / 220ms)
 *   Label                 text-xs · min-w-22 · truncate            (was the min-w-label/max-w-label
 *                                                                   pair — one bound is enough:
 *                                                                   overflow-hidden from `truncate`
 *                                                                   already zeroes the flex item's
 *                                                                   automatic minimum, so the
 *                                                                   explicit min-width alone is
 *                                                                   both the alignment floor AND
 *                                                                   the point truncation kicks in)
 *   Value                 font-mono tabular-nums, right-aligned    ("same treatment as a tab's
 *                                                                   count" — TabStrip.jsx's badge)
 *   Legend dot             size-1.75 (7px)                          (the chip's dot, reused — same
 *                                                                    literal class Callout.jsx and
 *                                                                    Chips.jsx already use, not the
 *                                                                    old chip-dot utility)
 *
 * "A progress rail and a chart bar are the same object, so they share geometry" is this page's own
 * line — but DataCharts.jsx (ported alongside this file) reads --color-track at h-2.5 (10px, via
 * its own h-bar utility), and this page at h-1.5 (6px). Same TOKEN filling both tracks, a different
 * HEIGHT utility for each — expected, not a discrepancy between the two files.
 *
 * NEW: `indeterminate` on ProgressBar — a fixed ~34%-wide fill in --color-border, not a tone and
 * not primary (there is no known value to colour toward), and no aria-valuenow: an indeterminate
 * bar has nothing to announce a percentage OF, so the attribute is omitted rather than sent as 0
 * or as the fixed 34.
 *
 * Every text colour below reads its Foundations name directly (--color-secondary, --color-text-
 * muted) rather than the retired `*-foreground` aliases (tokens.css's own banner: these resolve to
 * nothing now) — the same swap Cards.jsx, DataCharts.jsx and Accordion.jsx already made.
 *
 * Two claims this page makes about itself, both verified against the prior implementation and
 * both already true — nothing to fix, noted for the record:
 *   - ProgressList scales each row against its OWN `max` (`it.max ?? 100` flows straight into that
 *     row's own ProgressBar), never a max shared across the list. That is NOT what BarChart/HBars/
 *     ModelChart do (DataCharts.jsx: those scale every row against the VISIBLE-set's max) — a
 *     progress list would make three-quarters done look finished if it did.
 *   - SegmentBar's segments carry no radius of their own; only the track's rounded-full +
 *     overflow-hidden clips the first and last one. One shape, changed in one place.
 */

const clamp = (n) => Math.max(0, Math.min(100, Number.isFinite(+n) ? +n : 0));

/** SegmentBar's fallback fill for a segment with no explicit colour: the six-step chart ramp,
 *  cycled by index — the same fallback StackedBar (DataCharts.jsx) uses, and for the same reason:
 *  a segmented rail's parts are a genuinely categorical set, not a rainbow applied by position but
 *  not a single subject to call out either. A caller-supplied `color` always wins. */
const rampAt = (i, override) => override || `var(--chart-${(i % 6) + 1})`;

/** A single rail. `value` is a percentage unless `max` is given. */
export function ProgressBar({
  value = 0,
  max = 100,
  tone,
  label,
  showValue = false,
  indeterminate = false,
  className = "",
}) {
  const pct = clamp((value / (max || 1)) * 100);
  const fill = indeterminate
    ? "var(--color-border)"
    : tone
      ? `var(--color-${tone}-dot, var(--color-${tone}-ink))`
      : "var(--color-primary)";
  return (
    <div className={"flex items-center gap-bar " + className}>
      {label && (
        <span className="min-w-22 truncate text-xs text-text-muted" title={String(label)}>
          {label}
        </span>
      )}
      <span
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-track"
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ? String(label) : "Progress"}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-[160ms] ease-standard"
          style={{ width: indeterminate ? "34%" : `${pct}%`, background: fill }}
        />
      </span>
      {showValue && !indeterminate && (
        <span className="min-w-value text-right font-mono text-data tabular-nums text-secondary">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

/**
 * SegmentBar — one rail split proportionally between several keys.
 *
 * The segments carry NO radius of their own — the track's `rounded-full` + `overflow-hidden`
 * clips the first and last to whatever the track's own radius is, so there is exactly one shape
 * to change, in one place. Zero-value segments are skipped entirely rather than rendered as a
 * zero-width sliver.
 */
export function SegmentBar({ segments = [], legend = true, className = "" }) {
  const total = segments.reduce((s, x) => s + (+x.value || 0), 0) || 1;
  if (!segments.length) return null;
  return (
    <div className={"flex flex-col gap-2.5 " + className}>
      <span
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-track"
        role="progressbar"
        aria-valuenow={100}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Distribution"
      >
        {segments.map((s, i) => {
          const v = +s.value || 0;
          if (!v) return null;
          return (
            <span
              key={s.key ?? i}
              className="h-full"
              title={`${s.label ?? s.key}: ${v}`}
              style={{ width: `${(v / total) * 100}%`, background: rampAt(i, s.color) }}
            />
          );
        })}
      </span>
      {legend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((s, i) => (
            <span key={s.key ?? i} className="flex items-center gap-1.5 text-xs text-text-muted">
              <span className="size-1.75 flex-none rounded-full" style={{ background: rampAt(i, s.color) }} />
              {s.label ?? s.key}
              <span className="font-mono text-data tabular-nums text-secondary">{s.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ProgressList — labelled rails, each scaled against its own maximum.
 *
 * Not the same component as HBars/ModelChart, though it looks like one. Those scale every row
 * against the largest VALUE in the visible set, so the longest bar always reaches the end of its
 * track; a progress list scales each row against its own MAX, so a row at 55% looks like 55%
 * regardless of what the others do. Using the chart for completion figures is how three-quarters
 * done comes to look finished.
 */
export function ProgressList({ items = [], showValue = true, className = "" }) {
  if (!items.length) return <p className="m-0 py-6 text-center text-sm text-text-muted">No items.</p>;
  return (
    <ul className={"m-0 flex list-none flex-col gap-bar p-0 " + className}>
      {items.map((it, i) => (
        <li key={it.key ?? it.label ?? i}>
          <ProgressBar label={it.label} value={it.value} max={it.max ?? 100} tone={it.tone} showValue={showValue} />
        </li>
      ))}
    </ul>
  );
}
