/**
 * TabStrip — a segmented control.
 *
 * Named TabStrip, not Tabs, because `kf/Tabs.jsx` is the legacy component and still exported
 * from the barrel. Same reason ModelChart sits beside Chart and DataCharts beside Charts: the
 * old one stays until /bench goes.
 *
 * REDESIGNED 2026-08-13 from TabStrip.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — the page after Buttons.dc.html in the same
 * migration. Follows its playbook (provenance comments, no border anywhere unless the page says
 * otherwise, hsl()-wrapped tokens) rather than reinventing one. [SOURCE], drawn directly: "a
 * segmented control... near-black active pill, plain inactive label, nothing else."
 *
 * THE ACTIVE FILL IS `--color-secondary` / `--color-secondary-hover` EXACTLY — the same pair
 * Buttons.jsx's `strong` rank reads (`bg-secondary` / `hover:bg-secondary-hover`, confirmed
 * against Buttons.jsx directly, not approximated). Not a coincidence to be tidied away: a black
 * tab and a `strong` button are the same black in this language, and giving tabs their own colour
 * token would let the two drift apart under a retune the source says they move together on. No
 * new tokens for any of this file — every value below already exists in tokens.css.
 *
 * GEOMETRY IS TWO LITERAL TAILWIND SIZES, not a token bundle — same move Buttons.jsx made
 * (`control-shape` retired for a `size` map of literals). `tab-shape` (tokens.css) is UNCHANGED
 * and unused by this file now, kept for the same reason `control-shape` was: nothing else in the
 * kit reads it except Fx.jsx's FilterBar, which still does (see its own file — FilterBar
 * explicitly delegates to "TabStrip's job... the same geometry", and is now stale against this
 * pass; out of scope here, flagged for its own visit). The two sizes are not arbitrary — they
 * land exactly on Buttons.jsx's own `form` (h-10, text-sm) and `header` (h-[34px], text-xs)
 * geometry, the same height pairing this page's own table gives (40 default / 34 inside a track),
 * so a tab and its nearest button size still agree on type scale, not just height:
 *   default   h-10   · px-5      · text-sm   (== Buttons `form`)
 *   in track  h-[34px] · px-[18px] · text-xs (== Buttons `header`)
 * rounded-full always — "tabs are pills, like buttons — never the field's box."
 *
 * INACTIVE HOVER goes to FULL ink (`text-secondary`), not a lighter shade of muted — "the same
 * pair a quiet button takes, so a tab and a secondary button behave identically under the
 * cursor." The count badge does NOT follow that hover step: it stays `--color-text-muted`
 * regardless, so it needs its own explicit colour class rather than inheriting the label's ink —
 * verified against Buttons/Cards' own badge treatment, same reasoning as their tone-as-modifier
 * pattern of "colour composes, it doesn't inherit implicitly here."
 *
 * BADGE RIDES INSIDE THE PILL, not beside it — "so a tab stays one target." That's just where the
 * `<span>` sits in the DOM; there's no separate "with counts" variant, `badge` is a per-item field.
 *
 * `track` and `fill` are booleans, not variants — composable with each other and with badges, per
 * the page's own "not separate components" framing. Both live on the ONE role="tablist" element
 * rather than an extra wrapper div:
 *   - display flips to `inline-flex` (hugs its content, a snug pill) ONLY when track is on and
 *     fill is off. Every other combination is `flex`, which is block-level and already spans its
 *     parent's width with zero extra classes — that's what lets `fill`'s children (`flex-1`)
 *     actually divide real space, in or out of a track, without a separate `w-full`.
 *   - `track` adds the --color-gray-1 pill fill and p-1 padding, and drops each tab from 40px to
 *     34px — "for a tab group that sits on a white card and needs its own edge."
 *   - `fill` puts `flex-1` on every tab uniformly, "for two or three tabs that own the full width
 *     of a card or sheet" — no item-count guard, it applies the same at any count.
 *
 * FOCUS ring is ring / ring-ring / ring-offset-2 / ring-offset-transparent — copied verbatim off
 * Buttons.jsx's own classes (not just "ring-2, offset-2" from the spec's prose), because that
 * transparent offset is what keeps the 2px gap from painting a fake white halo on a dark or gray
 * surface; see Buttons.jsx's file banner for why.
 *
 * STATELESS BY DESIGN — value/onChange only, no internal index. Both specimens below prove it:
 * each owns its own `useState` and hands value/onChange down, which is the only way a controlled
 * strip can be demoed at all.
 *
 * NOTE — preflight is OFF, so each <button> resets its own UA border and background.
 */

export function TabStrip({
  items = [],
  value,
  onChange,
  ariaLabel = "Tabs",
  track = false,
  fill = false,
  className = "",
}) {
  if (!items.length) return null;
  const opts = items.map((i) => (typeof i === "string" ? { value: i, label: i } : i));

  // inline-flex only for the snug, content-hugging pill (track, not filling). Every other
  // combination is `flex` — block-level, so it already spans its parent's width for `fill`'s
  // flex-1 children to divide, track or not. See file banner.
  const display = track && !fill ? "inline-flex" : "flex";
  const geometry = track ? "h-[34px] px-[18px] text-xs " : "h-10 px-5 text-sm ";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={
        display + " flex-wrap items-center gap-1.5 " +
        (track ? "rounded-full bg-gray-1 p-1 " : "") +
        className
      }
    >
      {opts.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(o.value)}
            className={
              "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0 " +
              "font-sans leading-none transition-colors outline-none " +
              "focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent " +
              geometry +
              (fill ? "flex-1 " : "") +
              (active
                ? "bg-secondary font-bold text-white hover:bg-secondary-hover"
                : "bg-transparent font-medium text-text-muted hover:bg-gray-1 hover:text-secondary")
            }
          >
            {o.label}
            {o.badge != null && (
              // The count rides inside the tab rather than beside it, so a tab stays one target.
              // Mono because every language gives a number the data voice. Stays --color-text-muted
              // on an inactive tab even on hover (the label's ink moves, the badge's doesn't), so
              // it needs its own colour class rather than the label's inherited one.
              <span className={"font-mono text-data tabular-nums " + (active ? "text-white opacity-80" : "text-text-muted")}>
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
