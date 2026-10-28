/**
 * StatusChip — a status tone as a pill. "The smallest component in the kit and the biggest
 * token consumer" (Chips.dc.html) — except this pass is the one place that stops being true.
 *
 * REDESIGNED 2026-08-13 from Chips.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229). Before this pass every tone came off
 * `--tone-<name>-bg/-fg/-dot` custom properties this file itself pointed `var()` at. tokens.css's
 * Foundations rewrite (see its own banner) names NO `--tone-*` properties at all any more — there
 * is nothing left for `var()` to resolve, which is why this is a rewrite and not a find/replace.
 * Chips.dc.html turns out to want something different in that slot anyway: "Tones use Tailwind's
 * own palette rather than a token of ours... and no Foundations entry to keep in sync." So this
 * reads bg-emerald-50/text-emerald-700/bg-emerald-500 and friends straight off Tailwind, not off
 * any token this app owns.
 *
 * FIVE TONES, not seven. `pending` and `strong` are DROPPED — Chips.dc.html's own words: "orange
 * and near-black are actions here, not statuses." A caller still passing either is now stale, not
 * supported; TONES[tone] falls back to `neutral` for anything unrecognised rather than rendering
 * an unstyled chip, but that fallback is a safety net, not a design decision to lean on — the
 * report for this port lists every call site this pass found still passing one.
 *
 * ONE EXCEPTION IN THE FIVE. `neutral` is NOT bg-slate-50/text-slate-700/bg-slate-400 like the
 * other four's -50/-700/-500 triplet — it is slate-100/700/400, one step darker across all three
 * steps. Chips.dc.html calls this out by name: "neutral resolves to slate-100 / slate-700 /
 * slate-400." Slate-50 is close enough to white that an untinted chip would all but disappear on
 * the card surface; -100 is the source's fix, not a guess made here.
 *
 * WHY A LOOKUP OBJECT, NOT A TEMPLATE LITERAL. `tone` is a runtime string prop — `bg-${tone}-50`
 * would compile and run and render NOTHING, because Tailwind's JIT finds classes by scanning
 * source text for complete literals, and a template-interpolated string never appears in the
 * source as one. Cards.jsx hit the same wall and escaped through an inline `style` reading a
 * `--color-<tone>-*` CSS variable — no such escape hatch exists here, because Chips.dc.html's
 * whole point is that these five colours are Tailwind's own, not a token standing in for them.
 * So the fix is the other one: every tone × role combination spelled out as a complete static
 * class string below, five tones × three roles = fifteen literals, each one visible to the JIT
 * scanner precisely because none of them is assembled at runtime.
 *
 * DOT vs ICON, never both. `icon` wins if both are passed — Chips.dc.html: "Dot / none / icon
 * (mutually exclusive)." One signal glyph, one label; there is no slot for two.
 *
 * NO STATES AT ALL. Not focusable, not hoverable — Chips.dc.html is explicit this is what tells a
 * StatusChip apart from a Tab at the same visual size: "a chip is a label, never a control — if
 * it can be clicked it is a button or a tab." This renders a <span> and takes no onClick; a
 * caller that needs a clickable status is building something else and should reach for Button or
 * Tab instead of teaching this component to do both jobs.
 */

// The closed set — five tones. A tone that isn't here is a change to the design language, not a
// prop, "the same rule that closes the button ranks at four" (Chips.dc.html). Every value is a
// complete, static Tailwind class string — see the file banner for why it has to be. `neutral`
// is the one-step-darker exception the source calls out by name, also explained above.
const TONES = {
  success: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  info: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  danger: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  neutral: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
};

export const TONE_NAMES = Object.keys(TONES);

// Two sizes. [SOURCE] Chips.dc.html's own table: md 28px tall / 12px sides / 7px dot / text-sm,
// sm 24px tall / 10px sides / 6px dot / text-xs — both font-medium. `size-1.75` / `size-1.5` read
// Tailwind's own spacing scale as a square (1 unit = 4px, tokens.css's own `--spacing`), so 1.75
// → 7px and 1.5 → 6px without a hand-picked pixel value doing the same job less legibly.
const SIZES = {
  md: { pill: "h-7 gap-1.5 px-3", text: "text-sm", dot: "size-1.75" },
  sm: { pill: "h-6 gap-1.5 px-2.5", text: "text-xs", dot: "size-1.5" },
};

export function StatusChip({
  tone = "neutral",
  dot = true,
  size = "md",
  icon,
  className = "",
  children,
}) {
  const t = TONES[tone] ?? TONES.neutral;
  const s = SIZES[size] ?? SIZES.md;
  return (
    <span
      className={
        "inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none " +
        t.bg + " " + t.text + " " + s.pill + " " + s.text + " " +
        className
      }
    >
      {icon ? (
        // size-3.5 (14px) regardless of chip size — Chips.dc.html gives the icon one fixed size,
        // not a per-size one like the dot. No colour set here: currentColor is the default for a
        // Lucide icon's stroke, so it inherits `t.text` (tone-700) the same way the source's own
        // icon example does, with nothing extra to keep in sync.
        <span className="flex-none [&>svg]:size-3.5" aria-hidden="true">
          {icon}
        </span>
      ) : (
        dot && <span className={"flex-none rounded-full " + s.dot + " " + t.dot} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
