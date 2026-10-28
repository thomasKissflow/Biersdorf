/**
 * Donut · Legend — a composition ring and its key.
 *
 * REDESIGNED 2026-08-13 from Donut.dc.html (Claude Design project "Mobile app style guide sheet",
 * 2b8a920b-a786-4430-bd63-b0bc0dbe6229). Same idea as before — "the same ramp a chart uses and
 * the same dot a chip uses, so a legend means one thing wherever it appears" — but restyled and,
 * in two places, actually behaving that way for the first time:
 *
 *   Segments      --chart-1..6 cycled by index (was 1..8 — the new ramp is six steps, not eight;
 *                 see tokens.css's own chart-ramp note). A per-datum `color` still wins, unchanged
 *                 — that is ALSO the de-emphasis-walk mechanism: the mock's own "one emphasis
 *                 slice + a receding walk" example (--color-secondary -> -ink-soft -> -text-muted
 *                 -> -text-subtle -> -border) needs no prop of its own, a caller just sets
 *                 `color` on each segment. No new API for it below.
 *   Caps/gaps     `strokeLinecap="butt"` now stated explicitly rather than left to the SVG
 *                 default — "round caps and gaps both misread the last slice's size." The
 *                 dasharray/rotate math is UNCHANGED; it was already correct.
 *   Sizes         `size` is now an enum — sm/md/lg = 84/120/172px at 9/12/15px stroke — not a
 *                 free-form pixel number. "Thickness scales with the ring, never independently,"
 *                 so there is no longer a separate `thickness` prop to decouple it with.
 *   Legend        dot grows from chip-dot (7px) to `size-2` (8px) — "the chip's dot one step up
 *                 since it labels a 15px arc" — and gains a value + right-aligned percent column,
 *                 fixed-width for alignment. Row hover is --color-row-hover with a negative-margin
 *                 bleed past the row's own padding.
 *   Hover-focus   NEW. Neither half did this before: hovering a legend row now thickens that
 *                 segment (stroke width steps up per size — see RING_SIZES) and fades the rest to
 *                 35% opacity, and the center figure swaps from the total to that segment's own
 *                 value + label — "the legend is the interactive surface, not the ring." This
 *                 needed the two components to share hover state, which they did not before;
 *                 lifted to the caller as a plain controlled pair (`activeIndex` / `onActiveChange`)
 *                 rather than merged into one component, so each half is still usable alone — see
 *                 the specimen for the wiring.
 *   Empty state   was groove-only with no center mark; now also draws an em dash in the center,
 *                 "never a full ring in placeholder gray, which reads as complete."
 *
 * Donut vs Gauge: this stays the "parts of a whole, several categories, square caps, mandatory
 * legend" component. A single ratio with round caps, a tinted groove and a figure but no legend is
 * GaugeRing's job (DataCharts.jsx), not this file's — out of scope here, not duplicated.
 *
 * Colour reaches the ring only where a class cannot: `stroke`/`fill` on a per-segment/per-datum
 * paint. Everything else is an ordinary Tailwind utility on the new `--color-*` names
 * (`stroke-track`, `text-secondary`, `text-text-muted`, `text-ink-soft`) — see Cards.jsx's own
 * banner for why those replace the old bare-name classes.
 */

// A per-datum `color` always wins (see the banner) — this is only the categorical fallback.
const seriesFill = (i) => `var(--chart-${(i % 6) + 1})`;

// Ring geometry by size. r=54 on a fixed 140x140 viewBox at every size — only the wrapper's box
// and the stroke width move ("scale via width/height on the wrapper"). `hoverStroke` is the
// legend-hover-thickened width: Donut.dc.html's own lg example goes 15 -> 19 (+27%); sm/md carry
// the same ratio since the page states no hover number for them — [SOURCE] for lg, [OURS] for
// sm/md. `figure` is the center mono figure's font-size, the page's own "THREE SIZES" table (13 /
// 15 / 19), distinct from the 22px figure drawn on the page's single full-size worked example.
const RING_SIZES = {
  sm: { box: 84, stroke: 9, hoverStroke: 11, figure: 13 },
  md: { box: 120, stroke: 12, hoverStroke: 15, figure: 15 },
  lg: { box: 172, stroke: 15, hoverStroke: 19, figure: 19 },
};

/**
 * The ring. `activeIndex` is a controlled prop, not internal state — the ring never reacts to its
 * own hover ("the legend is the interactive surface, not the ring"); a caller wires it to
 * `Legend`'s `onActiveChange` (see the specimen) or leaves it `null` to render inert, exactly as
 * before.
 */
export function Donut({
  segments = [],
  size = "md",
  activeIndex = null,
  caption = "total",
  label,
  sublabel,
  className = "",
}) {
  const { box, stroke, hoverStroke, figure } = RING_SIZES[size] ?? RING_SIZES.md;
  const total = segments.reduce((s, x) => s + (+x.value || 0), 0);
  const r = 54;
  const circ = 2 * Math.PI * r;

  if (!segments.length || !total) {
    return (
      <div style={{ width: box, height: box }} className={className}>
        <svg viewBox="0 0 140 140" role="img" aria-label={label ?? "No data"} className="block h-full w-full">
          <circle cx="70" cy="70" r={r} fill="none" className="stroke-track" strokeWidth={stroke} />
          <text
            x="70"
            y="76"
            textAnchor="middle"
            fill="currentColor"
            className="text-text-muted font-mono"
            style={{ fontSize: figure }}
          >
            —
          </text>
        </svg>
        {label && <div className="mt-1 text-center text-xs text-text-muted">{label}</div>}
      </div>
    );
  }

  // Resting state shows the total; hovering a legend row swaps both lines to that segment's own
  // value + label instead — the behaviour the mock's own script drives, now shared via props
  // rather than owned by one element. `sublabel` still lets a caller override the resting figure
  // (a formatted string, a unit) exactly as before; it just now defaults to the computed total
  // rather than rendering nothing.
  const activeSeg = activeIndex != null ? segments[activeIndex] : null;
  const figureText = activeSeg ? activeSeg.value : (sublabel ?? total);
  const captionText = activeSeg ? (activeSeg.label ?? activeSeg.key) : caption;

  // Each segment is a full circle whose dash pattern shows only its own arc, rotated to start
  // where the previous one ended — unchanged arc math, still correct, still cheaper and rounder
  // than building arc paths, and it keeps every segment one element so a hover title lands on the
  // whole slice.
  let offset = 0;
  return (
    <div style={{ width: box, height: box }} className={className}>
      <svg viewBox="0 0 140 140" role="img" aria-label={label ?? "Composition"} className="block h-full w-full">
        <circle cx="70" cy="70" r={r} fill="none" className="stroke-track" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const frac = (+s.value || 0) / total;
          const dash = circ * frac;
          const rot = offset * 360 - 90;
          offset += frac;
          if (!dash) return null;
          const isActive = activeIndex === i;
          const dimmed = activeIndex != null && !isActive;
          return (
            <circle
              key={s.key ?? i}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={s.color ?? seriesFill(i)}
              strokeWidth={isActive ? hoverStroke : stroke}
              strokeLinecap="butt"
              strokeDasharray={`${dash} ${circ - dash}`}
              transform={`rotate(${rot} 70 70)`}
              opacity={dimmed ? 0.35 : 1}
              className="transition-[stroke-width,opacity] duration-move"
            >
              <title>{`${s.label ?? s.key}: ${s.value}`}</title>
            </circle>
          );
        })}
        {figureText != null && figureText !== "" && (
          <text
            x="70"
            y="66"
            textAnchor="middle"
            fill="currentColor"
            className="text-secondary font-mono font-medium tracking-[-.02em]"
            style={{ fontSize: figure }}
          >
            {figureText}
          </text>
        )}
        {figureText != null && figureText !== "" && (
          <text x="70" y="84" textAnchor="middle" fill="currentColor" className="text-text-muted text-[11px]">
            {captionText}
          </text>
        )}
      </svg>
      {label && <div className="mt-1 text-center text-xs text-text-muted">{label}</div>}
    </div>
  );
}

/**
 * The key. Dot is `size-2` (8px), one step up from `chip-dot` (7px) since it labels a thicker arc
 * than a status chip labels a status. `activeIndex`/`onActiveChange` are the other half of the
 * controlled pair described on `Donut` — both optional, so `Legend` alone (no ring in sight, see
 * its own specimen) behaves exactly as before.
 */
export function Legend({ items = [], showValue = true, showPercent = true, activeIndex, onActiveChange, className = "" }) {
  if (!items.length) return null;
  const total = items.reduce((s, it) => s + (+it.value || 0), 0);
  return (
    <ul className={"m-0 flex list-none flex-col gap-y-0.5 p-0 " + className}>
      {items.map((it, i) => {
        const pct = showPercent && total ? Math.round(((+it.value || 0) / total) * 100) : null;
        return (
          <li
            key={it.key ?? i}
            // Negative-margin bleed: the hover plate reaches past the row's own padding, per
            // Donut.dc.html's own legend note.
            className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover"
            onMouseEnter={() => onActiveChange?.(i)}
            onMouseLeave={() => onActiveChange?.(null)}
          >
            <span className="size-2 flex-none rounded-full" style={{ background: it.color ?? seriesFill(i) }} />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{it.label ?? it.key}</span>
            {showValue && it.value != null && (
              <span className="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">{it.value}</span>
            )}
            {pct != null && (
              <span className="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">{pct}%</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
