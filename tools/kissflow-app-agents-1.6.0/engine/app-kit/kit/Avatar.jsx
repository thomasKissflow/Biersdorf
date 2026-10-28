/**
 * Avatar — a person's initials in a tinted tile.
 *
 * REDESIGNED 2026-08-13 from Avatar.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229). Settles the three-way disagreement this file
 * used to document (Beacon circle vs. Checkpoint rounded-square vs. Nimbus absent) — this app
 * renders Beacon alone now (see tokens.css's own banner), so there is one shape: a circle,
 * `--radius-avatar` (resolves to 9999px, full).
 *
 *   Size    NEW `size` prop, xs|sm|md|lg — 24/32/40/56px tiles, 10/12/14/18px initials, always
 *           bold. Tile size reads Tailwind's OWN size-6/8/10/14 scale directly, not a custom
 *           `--avatar-size` token the way the old Beacon/Checkpoint/Nimbus block did — Avatar.dc.html
 *           names Tailwind's own scale, and it lines up exactly: `size-*` multiplies `--spacing`
 *           (4px, tokens.css §Spacing), and 6/8/10/14 × 4px is 24/32/40/56. Initials sizes land on
 *           Tailwind's stock text-2xs/xs/sm/lg for the same reason — 10/12/14/18px is that scale
 *           exactly, no token needed. `md` is the default (40px), unchanged from before.
 *   Tone    Default (no `tone`, or `tone="neutral"`) is NOT "no fill" — it is an explicit neutral
 *           tile, --color-gray-1 fill / --color-secondary ink. Avatar.dc.html: "No tone gives
 *           neutral, the honest default for a person with nothing attached" — an empty/transparent
 *           circle was never on the table. Four tinted tones beyond that (success, warning, info,
 *           danger) read the SAME map Card/StatusChip do, --color-<tone>-bg / -ink (Cards.jsx),
 *           so an owner's tile can carry its row's status colour exactly. `pending` and `strong` —
 *           the old kit's other two TONES entries — are GONE: Foundations' tone map never named
 *           either, so both now fall through to neutral rather than resolving to a colour
 *           Avatar.dc.html doesn't define.
 *   Empty   Falls back to an em dash, never an empty circle — "an empty tile reads as a loading
 *           state that never resolves."
 *   States  None of its own. A clickable row owns the interaction; Avatar stays static either way.
 */

const TONE_NAMES = ["success", "warning", "info", "danger"];

// Tailwind's own scale, not a custom token — see the file banner above. The text sizes are
// Tailwind's stock text-2xs/xs/sm/lg, which happen to already be exactly 10/12/14/18px.
const SIZES = {
  xs: { tile: "size-6", text: "text-2xs" },
  sm: { tile: "size-8", text: "text-xs" },
  md: { tile: "size-10", text: "text-sm" },
  lg: { tile: "size-14", text: "text-lg" },
};

/** Two letters, from a name. "R. Iyer" -> RI, "Mary" -> MA. Falls back to an em dash rather
 *  than rendering an empty tile — Avatar.dc.html: "an empty tile reads as a loading state that
 *  never resolves." */
function initialsFrom(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, initials, tone, size = "md", title, className = "" }) {
  // Dynamic per-tone colour cannot be a Tailwind class — a class string built from a runtime
  // variable (`bg-[var(--color-${tone}-bg)]`) is invisible to Tailwind's static scanner and
  // compiles to nothing, exactly the reasoning Cards.jsx's StatTile delta pill documents. So the
  // tinted case goes through inline style; the neutral default stays plain Tailwind classes.
  const tinted = TONE_NAMES.includes(tone);
  const s = SIZES[size] ?? SIZES.md;
  const text = initials ?? initialsFrom(name);
  return (
    <span
      className={
        s.tile + " " + s.text + " " +
        "rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none " +
        (tinted ? "" : "bg-gray-1 text-secondary") +
        (className ? " " + className : "")
      }
      style={tinted ? { background: `var(--color-${tone}-bg)`, color: `var(--color-${tone}-ink)` } : undefined}
      title={title ?? name}
      aria-label={name ? `${name}` : undefined}
    >
      {text}
    </span>
  );
}

/**
 * AvatarStack — overlapping avatars, for a row that lists several owners.
 *
 * [SOURCE] Avatar.dc.html: the minimum stacked size is `sm` (32px) — "quarter-tile overlap
 * clears two-letter initials at that size." The API table lists no `size` prop for AvatarStack,
 * so this renders every tile at a fixed `sm` rather than exposing one — an xs stack would collide,
 * and md/lg stacked isn't what the doc's own overlap ratio was measured against. Overlap is a
 * quarter of the tile, scaled down from the doc's own -11px/40px(md) ratio to sm: 32 × (11/40) ≈
 * -9px. Each tile gets a 2px ring in --color-surface — "the notch is a 2px ring in the surface
 * color — on a tinted surface the ring has to change with it" — read through Tailwind's own
 * `ring-surface` utility (resolves via the --color-surface theme token, same namespace `bg-surface`
 * already reads in Cards.jsx) rather than a fixed colour, so a stack under a caller that overrides
 * --color-surface in scope still looks right with no extra prop of its own. `max` renders a "+N"
 * overflow tile in --color-gray-1 / --color-text-muted / font-mono — "a number takes the data
 * voice, as in the tab count" — the same mono-figure convention as StatTile's delta pill.
 */
const STACK_SIZE = SIZES.sm;
const STACK_OVERLAP = "-9px";

export function AvatarStack({ people = [], max = 4, tone, className = "" }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className={"inline-flex items-center " + className}>
      {shown.map((p, i) => (
        <span
          key={i}
          style={{ marginLeft: i === 0 ? 0 : STACK_OVERLAP }}
          className="inline-flex rounded-avatar ring-2 ring-surface"
        >
          <Avatar
            name={typeof p === "string" ? p : p.name}
            tone={typeof p === "string" ? tone : (p.tone ?? tone)}
            size="sm"
          />
        </span>
      ))}
      {rest > 0 && (
        <span
          style={{ marginLeft: STACK_OVERLAP }}
          className={
            STACK_SIZE.tile + " " + STACK_SIZE.text + " " +
            "rounded-avatar inline-flex flex-none items-center justify-center bg-gray-1 text-text-muted font-mono font-semibold leading-none ring-2 ring-surface"
          }
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
