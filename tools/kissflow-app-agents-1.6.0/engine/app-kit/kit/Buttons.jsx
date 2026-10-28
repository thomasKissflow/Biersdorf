/**
 * Button — the four ranks, in Tailwind utilities on theme tokens.
 *
 * REDESIGNED 2026-08-13 from Buttons.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — the page Foundations' own `--shadow-button`
 * comment named as pending. Cards.jsx got the same treatment first; this follows its playbook
 * (provenance comments, tone-as-modifier, inline style only for what a Tailwind theme namespace
 * can't reach) rather than reinventing one.
 *
 * FOUR ranks, still not "as many as you like" — that half of the old contract is untouched:
 *
 *   primary    the commit action, a gradient with its own glow. One per view.
 *   secondary  the quiet fill beside it — white on the canvas, separated by elevation.
 *   outline    the other quiet rank, and the ONLY one carrying a border — transparent until
 *              hovered, for a dismiss beside a commit.
 *   strong     the near-black create action, heavier than primary.
 *
 * WHAT CHANGED FROM v1, per Buttons.dc.html's own token-mapping table:
 *   Geometry   control-shape (one token-driven bundle, 42/22/999px/13.5/700) is GONE. The page
 *              gives four literal Tailwind sizes instead (`size` below) — "geometry unchanged
 *              from Tailwind's own scale, not new tokens." rounded-control-strong is gone with
 *              it: every rank is a pill now, no per-rank radius exception.
 *   Primary    was --control-fill; now --gradient-primary + --shadow-primary, its own glow.
 *   Secondary  was a gray fill (bg-secondary/hover:bg-muted-hover); now white + --shadow-contact
 *              — "replaces v1's gray fill... separated by elevation like every other object."
 *   Outline    was bg-card w/ token border-control edge; now literally transparent at rest.
 *   Strong     --shadow-button stops being an [OURS] placeholder (`0 0 #0000`) — this page is
 *              what tokens.css's own comment said it was waiting for. See tokens.css.
 *   New        `size` (sm/header/form/mobile + two icon sizes), `loading`, `tone="danger"`.
 *
 * SIZE NAMES trace back to the page's own prose ("small", "header/default", "form", "mobile")
 * rather than t-shirt letters, so a size in code is greppable straight back to the doc. `header`
 * is the default — it's what the page calls the button you reach for with no size context, and
 * it's what every existing call site now renders at (34px, down from control-shape's 42px; a
 * visible height drop across the app, not a per-call-site opt-in).
 *
 * ICON BUTTONS ARE NOT PILLS ("a round icon button reads as an avatar") — Buttons.dc.html gives
 * them their own two sizes rather than a `icon` boolean layered on the pill scale, because the
 * radius itself changes: `--radius-md` (36px, a top-bar control) vs `--radius-sm` (28px, inside
 * a row). No dedicated IconButton export — this file had no icon-only mode to begin with, so the
 * two sizes ARE the mode; pass one, an aria-label (no visible label to fall back on), and nothing
 * else changes.
 *
 * TONE, NOT A FIFTH RANK. Buttons.dc.html is explicit: destructive is "primary's fill swapped
 * for danger, in a confirm dialog only." Card.jsx already answers "how does this kit spell an
 * optional colour override" with a `tone` prop (§Cards.jsx), so `tone="danger"` reuses that
 * name instead of inventing `rank="destructive"` or a `danger` boolean. It always renders
 * primary's shape (pill, white ink, no border) regardless of `rank` — there's nothing to compose
 * it with, so the prop is exclusive rather than a modifier over whatever rank you also passed.
 *
 * LOADING is purely presentational, per the page's own text ("shown BEFORE the label, replacing
 * nothing — label stays visible beside the spinner"): it does not imply `disabled`. A caller that
 * wants a loading button to also reject clicks passes both props.
 *
 * `control-shape` / `rounded-control-strong` (the two @utility bundles this file used to
 * consume) are UNCHANGED in tokens.css and not deleted — nothing else in the kit reads them
 * (checked: only this file and a prose mention in specimens/button.jsx did) — but they stay in
 * case a future page reintroduces token-driven button geometry.
 *
 * WHY THIS COMPONENT EXISTS, beyond drawing buttons: it is the only thing in the app that
 * renders a FOCUS RING, and the ring is the contract's one deliberate bypass of the HSL-triplet
 * convention. Foundations' Ring token is `rgba(255,98,3,.35)` — the single colour in the palette
 * carrying alpha, wired through `--color-ring` for exactly that reason. Buttons.dc.html draws
 * every rank's focus as a 2px-OFFSET ring ("offset 2 on buttons... fields get offset 0"), which
 * is new — v1 held every focus ring flush against the control's own edge (`ring-offset-0`) with
 * a comment that an offset "reads as a second border." That reasoning doesn't hold once the
 * offset colour is transparent rather than Tailwind's opaque white default: a transparent offset
 * shows whatever is actually behind the button (canvas, a gray nested panel, a dark surface)
 * instead of painting a fake white halo over it — so `ring-offset-2 ring-offset-transparent`
 * gets the page's 2px gap with none of the "second border on non-white ground" artifact the old
 * comment was guarding against. Tab through the gallery to see it.
 *
 * NOTE — Tailwind preflight is OFF (src/shadcn.css), so a <button> keeps the UA's own font,
 * border and background. Every one of those is reset explicitly below; drop `border-0` and you
 * get a 2px grey bevel that looks like a token bug and is the browser showing through. The
 * outline rank's border is the one exception, and for the same reason it can't just be
 * `border border-[#DDE0E4]`: a bare `border` utility sets width only, and with no preflight
 * there's nothing to give it `border-style: solid` — see tokens.css's own `border-decor`
 * utility, which exists for exactly this failure and is what outline uses below instead of
 * reinventing the width+style pair inline.
 *
 * `forwardRef` + `...rest`, added when `Floating.jsx`'s Popover/Tooltip/DropdownMenu arrived:
 * `<PopoverTrigger asChild><Button>…</Button></PopoverTrigger>` clones Radix's own props
 * (`ref`, `aria-expanded`, `data-state`, `onPointerDown`…) onto whatever `asChild` wraps —
 * without a forwarded ref the trigger silently has no DOM node to anchor or position against,
 * and without `...rest` the injected ARIA/event props never reach the real `<button>`.
 */
import { forwardRef } from "react";

/** `size` → geometry only. Every value is a literal off Tailwind's own scale per the page's own
 *  words ("geometry unchanged... not new tokens") — sm/header/form/mobile pulled straight from
 *  its size table, `icon`/`icon-sm` from its "icon buttons are not pills" callout. Colour is
 *  never in here, same rule `control-shape` always followed: geometry bundles, fills compose. */
const SIZES = {
  sm: "h-8 px-4 rounded-full text-xs font-bold",
  header: "h-[34px] px-[17px] rounded-full text-xs font-bold",
  form: "h-10 px-6 rounded-full text-sm font-bold",
  mobile: "h-12 px-8 rounded-full text-[15px] font-bold",
  // Square, not pill — --radius-md/--radius-sm are Foundations tokens, already wired as the
  // `rounded-md`/`rounded-sm` Tailwind utilities (same bridge Cards.jsx's rounded-lg/rounded-xl
  // use), so no new token or arbitrary value is needed for either radius.
  icon: "h-9 w-9 shrink-0 rounded-md p-0",
  "icon-sm": "h-7 w-7 shrink-0 rounded-sm p-0",
};

/** `rank` → fill, elevation and interaction. `enabled:` (not a bare `hover:`/`active:`) gates
 *  every one of these — without it a disabled button's hover/press classes still match, because
 *  CSS doesn't know a click handler is inert, and a disabled primary would visibly deepen its
 *  own glow under a pointer that can't do anything. `transition-[...]` is an explicit property
 *  list rather than `transition-colors`: three of the four ranks animate box-shadow or transform
 *  on interaction, neither of which `transition-colors` touches, so hover/press would otherwise
 *  snap instead of ease. Duration/curve are Foundations' own — "120ms hover/colour" + the one
 *  motion token, `--ease-standard` (wired as the `ease-standard` utility, same bridge as above). */
const TRANSITION = "transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard";

const RANKS = {
  // Reads --gradient-primary, not a Tailwind bg-* class — gradients aren't a Tailwind theme
  // namespace (tokens.css's own comment on why), so this is inline style, the same shape as
  // Cards.jsx's sparkline gradient and PhotoCard's progress fill. box-shadow, by contrast, MUST
  // stay a class and never inline style: tokens.css spells out why (§Elevation) — Tailwind
  // composes shadow + the focus ring's box-shadow into one property, and an inline `boxShadow`
  // wins the cascade over that composed class, silently deleting the ring this file exists to
  // render. Hover/press are one-off literals, not tokens — the page draws them once, on this
  // rank alone, and gives them no name of their own.
  primary: {
    classes:
      "border-0 text-white shadow-primary " +
      "enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)] " +
      "enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]",
    style: { backgroundImage: "var(--gradient-primary)" },
    spinnerTrack: "rgba(255,255,255,.35)",
    spinnerInk: "#fff",
  },
  // --shadow-contact, not --shadow-flat — Foundations' own read of a quiet button is the same
  // 1px contact layer a board card or a top-bar control gets, no lift. Hover/press deepen it
  // with two literals the page draws only here (a contact shadow one step darker, then an inset
  // press) — neither is a named token, same as primary's hover/press pair above.
  secondary: {
    classes:
      "border-0 bg-surface text-ink-soft shadow-contact " +
      "enabled:hover:text-secondary enabled:hover:shadow-[0_2px_6px_rgba(10,10,11,.1)] " +
      "enabled:active:shadow-[inset_0_1px_2px_rgba(10,10,11,.12)]",
    spinnerTrack: "var(--color-gray-2)",
    spinnerInk: "var(--color-ink-soft)",
  },
  // The only rank with a border, drawn with border-decor (see file banner). #DDE0E4 is a
  // component-local literal, not --color-gray-3 (#E4E5E8) — close but not an exact match, and
  // the page gives it as its own hex rather than pointing at that token, so it's kept literal
  // rather than silently rounded onto a token that would read one shade darker.
  outline: {
    classes:
      "border-decor bg-transparent text-ink-soft border-[#DDE0E4] " +
      "enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary " +
      "enabled:active:bg-gray-1",
    spinnerTrack: "var(--color-gray-2)",
    spinnerInk: "var(--color-ink-soft)",
  },
  // --shadow-button (see tokens.css — this page is what its placeholder was waiting for) and
  // --color-secondary-hover are both real tokens; the press state is not — Foundations'
  // documented rule is that secondary-pressed has no token, "it's the floor" (pure black, #000).
  strong: {
    classes:
      "border-0 bg-secondary text-white shadow-button " +
      "enabled:hover:bg-secondary-hover enabled:hover:shadow-[0_10px_22px_-8px_rgba(10,10,11,.55)] " +
      "enabled:active:bg-black enabled:active:translate-y-px",
    spinnerTrack: "rgba(255,255,255,.3)",
    spinnerInk: "#fff",
  },
};

/** `tone="danger"` — see file banner: primary's shape, --color-danger's fill, no shadow token
 *  ("keep it simple" is the page's own phrase). Exclusive with `rank`, not layered on it. */
const DANGER = {
  classes: "border-0 text-white shadow-none enabled:active:translate-y-px",
  style: { background: "var(--color-danger)" },
  spinnerTrack: "rgba(255,255,255,.35)",
  spinnerInk: "#fff",
};

/** The loading spinner — Button's own anatomy, not exported, same call as Cards.jsx's Spark.
 *  14px/2px-border/.7s per the page; colour is two per-rank literals (track, ink) rather than
 *  tokens, since half of them (the two whites-at-alpha) aren't tokens to begin with. */
function Spinner({ track, ink }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[14px] w-[14px] flex-none animate-spin rounded-full [animation-duration:.7s]"
      style={{ border: `2px solid ${track}`, borderTopColor: ink }}
    />
  );
}

export const Button = forwardRef(function Button(
  {
    rank = "secondary",
    size = "header",
    tone,
    type = "button",
    disabled = false,
    loading = false,
    onClick,
    className = "",
    style,
    children,
    ...rest
  },
  ref
) {
  const R = tone === "danger" ? DANGER : RANKS[rank] ?? RANKS.secondary;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={onClick}
      className={
        "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap " +
        "font-sans leading-none " +
        TRANSITION + " " +
        // The ring. `focus-visible` rather than `focus` so a mouse click does not leave one
        // behind — the ring is a keyboard affordance. See the file banner for why the offset is
        // new in this pass, and why it needs an explicitly transparent offset colour to avoid
        // painting a white halo on non-white ground.
        "outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent " +
        "disabled:cursor-not-allowed disabled:opacity-40 " +
        (SIZES[size] ?? SIZES.header) + " " +
        R.classes +
        (className ? " " + className : "")
      }
      style={{ ...R.style, ...style }}
      {...rest}
    >
      {loading && <Spinner track={R.spinnerTrack} ink={R.spinnerInk} />}
      {children}
    </button>
  );
});

/** Buttons in a row, at the language's own control gap. Beacon's §08 row is `gap:10px` — the
 *  ordinary spacing scale expresses it and this needs no token of its own. Wraps, because an
 *  action bar that overflows a card is worse than one that takes two lines. */
export function ButtonRow({ className = "", children }) {
  return <div className={"flex flex-wrap items-center gap-2.5 " + className}>{children}</div>;
}
