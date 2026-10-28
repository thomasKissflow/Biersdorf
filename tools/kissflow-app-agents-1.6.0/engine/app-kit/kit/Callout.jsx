/**
 * Callout — a full-width tinted message, at a card's density.
 *
 * REDESIGNED 2026-08-13 from Callout.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — the first page to actually declare this
 * component. Its own opening line: "Same tone map as the chip, at a card's density — so a
 * danger callout and a danger chip read as one state." Composed entirely from EXISTING tokens
 * (the tone map StatusChip reads, the padding/radius Cards.jsx reads) — no new colour or radius
 * is invented for this page. Token-mapping table, transcribed as [SOURCE] below:
 *
 *   Surface fill/ink   --color-<tone>-bg / -ink                 (ink cascades — see below)
 *   Surface edge       --color-<tone>-dot @ 1px, ALWAYS          (new — see "THE BORDER" below)
 *   Padding/radius     p-6 · --radius-lg  (compact: p-4 · --radius-md)
 *   Dot                --color-<tone>-dot fill, size-1.75 (7px) — "the chip's dot at the
 *                       callout's scale"
 *   Title              text-sm font-bold
 *   Body               text-sm leading-relaxed
 *   Dismiss            currentColor, opacity-60 → opacity-100 on hover/focus, 16px X, own
 *                       small radius for the focus ring
 *   Actions            primary rank + an outline rank drawn in currentColor — see "ACTIONS", not
 *                       a prop here
 *
 * NO NEUTRAL TONE. Callout.dc.html is explicit: "a gray tinted box on a white card is just a
 * card, so use one" — a Callout that wants to be neutral should be a Card instead. `tone` is
 * success | warning | info | danger only; there is no escape hatch, same closed-set reasoning as
 * StatusChip's own tone map.
 *
 * THE BORDER. Every other surface in this language dropped its edge (see Cards.jsx's own file
 * banner: "none — was --color-gray-2 @ 1px — DROPPED"). Callout keeps one, on purpose, and this
 * is the one place in the kit that should: "unlike a chip, a Callout DOES take a 1px border in
 * the tone's own dot colour — the tint alone is too quiet on a white page." Don't "fix" this to
 * match the rest of the language; the doc calls the deviation out by name, and the doc's own
 * wording is "1px, always" — not the `border-decor` utility, deliberately: that utility reads
 * `var(--border-decor, 1px)`, the exact knob a language mints so it CAN zero a decorative edge
 * out (Checkpoint used to, before the multi-language machinery was retired — see tokens.css's own
 * banner). "Always" means never conditional on that token, so the width/style are set directly in
 * the inline style below, alongside the tone colour, instead — still explicit style+width so this
 * doesn't hit the same preflight-off bug border-decor exists to avoid (tokens.css's own note on
 * that utility: a width with no explicit style computes to 0).
 *
 * INK CASCADES. `color` is set once, on the outer element, to the tone's ink — title, body, the
 * icon slot and the dismiss button all inherit it via `currentColor` / ordinary CSS inheritance
 * rather than each re-declaring a text-colour utility. A form control is the one exception that
 * needs help: buttons don't inherit `color` from an ancestor by default (same reason Buttons.jsx
 * resets it), so the dismiss button below carries `text-inherit` itself.
 *
 * DOT vs ICON. Binary, never both — Callout.dc.html: icon "replaces the dot entirely when passed."
 * `title` does NOT gate the dot: the token-mapping row lists the dot's fill/size unconditionally,
 * and the page's own thesis — "so a danger callout and a danger chip read as one state" — is the
 * dot's whole job, which a titled callout needs exactly as much as a titleless one. (The dot
 * section's "when no title/icon given" parenthetical reads, on reflection, as describing what the
 * dot is FOR — the mark that stands in when no icon was supplied — not as a second gate on top of
 * `icon`; every real caller in this app passes a title, and a title-gated dot would mean the app's
 * most common Callout carries no tone mark at all, which contradicts the thesis line above.)
 *
 * GAP IN tokens.css — flagged rather than silently patched, per this port's own instructions.
 * `--color-<tone>-dot` does not exist for `danger`: tokens.css names `--color-success/warning/
 * info-dot` but stops at `--color-danger-bg` / `-ink` with a comment saying the dot "reuses
 * --color-danger" (the base token, not a `-dot` sibling). `TONES.danger.dot` below reuses
 * `--color-danger` for exactly that reason — it is transcribing tokens.css's own comment, not
 * inventing a substitute. If Foundations ever names a real `--color-danger-dot`, this is the one
 * line that should change.
 *
 * ACTIONS ARE NOT A PROP. Callout.dc.html shows an action row inside a danger callout, but its own
 * API table (verbatim in the port instructions this file was built from) lists exactly `tone`,
 * `title`, `onDismiss`, `icon`, `compact` — no `actions`. An action row is ordinary `children`:
 *
 *   <Callout tone="danger" title="Payment failed">
 *     The card on file was declined.
 *     <ButtonRow className="mt-3">
 *       <Button rank="primary">Retry</Button>
 *       <Button rank="outline" style={{ borderColor: "currentColor", color: "currentColor" }}>
 *         Dismiss
 *       </Button>
 *     </ButtonRow>
 *   </Callout>
 *
 * The outline button's edge/ink is overridden to `currentColor` at the call site (as above) rather
 * than Callout doing it for you — "so it stays inside the tinted surface's own contrast" is a
 * property of THAT button, not something Callout can reach into a child and impose.
 */

// Dynamic per-tone colour cannot be a Tailwind class — a class string built from a runtime
// variable (`bg-[var(--color-${tone}-bg)]`) is invisible to Tailwind's static scanner and
// compiles to nothing (same reason Cards.jsx's tinted Card and StatTile's delta pill both use
// inline style for this). success/warning/info read tokens.css's own `-dot` triplet; danger
// does not have one — see "GAP IN tokens.css" above.
const TONES = {
  success: { bg: "var(--color-success-bg)", ink: "var(--color-success-ink)", dot: "var(--color-success-dot)" },
  warning: { bg: "var(--color-warning-bg)", ink: "var(--color-warning-ink)", dot: "var(--color-warning-dot)" },
  info: { bg: "var(--color-info-bg)", ink: "var(--color-info-ink)", dot: "var(--color-info-dot)" },
  danger: { bg: "var(--color-danger-bg)", ink: "var(--color-danger-ink)", dot: "var(--color-danger)" },
};

export function Callout({ tone = "info", title, icon, onDismiss, compact = false, className = "", children }) {
  const t = TONES[tone] ?? TONES.info;
  const showIcon = Boolean(icon);
  return (
    <div
      // danger is the one tone urgent enough to interrupt (role="alert"); the other three are
      // ambient status, not interruptions.
      role={tone === "danger" ? "alert" : "status"}
      className={(compact ? "rounded-md p-4 " : "rounded-lg p-6 ") + className}
      // borderWidth/-Style set directly (not the `border-decor` utility) so "1px, always" is
      // actually unconditional — see "THE BORDER" above.
      style={{ background: t.bg, color: t.ink, borderColor: t.dot, borderWidth: "1px", borderStyle: "solid" }}
    >
      <div className="flex items-start gap-3">
        {showIcon ? (
          <span className="mt-0.5 flex-none [&>svg]:size-4" aria-hidden="true">
            {icon}
          </span>
        ) : (
          <span
            className="mt-1.5 size-1.75 flex-none rounded-full"
            style={{ background: t.dot }}
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          {title && <p className="m-0 mb-1 text-sm font-bold leading-tight">{title}</p>}
          <div className="text-sm leading-relaxed">{children}</div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 flex-none cursor-pointer rounded-sm border-0 bg-transparent p-1 leading-none text-inherit opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring focus-visible:ring-ring"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
