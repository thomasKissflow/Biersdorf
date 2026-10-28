/**
 * Accordion — progressive disclosure, hand-rolled rather than built on
 * `@radix-ui/react-accordion`. [OURS] entirely — no language names an accordion.
 *
 * REDESIGNED 2026-08-13 from Accordion.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229). The state machine, keyboard/a11y model
 * (plain `<button>`s, native focus order, native `disabled`) and the grid-row expand trick are
 * UNCHANGED from the pre-migration file — this is a restyle plus three new props, not a rewrite.
 *
 *   Row divider          --color-gray-1 border-bottom          (was --color-border — see tokens.css
 *                                                                 banner: a divider that repeats down
 *                                                                 a list steps one rung lighter than a
 *                                                                 container edge, per the page's own
 *                                                                 token-mapping table)
 *   Trigger ink           --color-secondary text-sm font-medium (was text-foreground, no weight token)
 *   Trigger hover          --color-primary ink · --color-gray-1 bg   (was hover:text-primary alone,
 *                                                                      no hover fill)
 *   Trigger pressed        --color-gray-2 bg · --color-primary ink   (new — no :active state before)
 *   Focus ring              2px ring, 2px offset, 6px corner    (was ring/ring-offset-0 — no offset,
 *                                                                 no corner radius, from the kit's old
 *                                                                 shared field-focus recipe)
 *   Chevron                 currentColor, 200ms ease-standard   (was text-muted-foreground, duration-move)
 *   Panel copy               --color-text-muted, 1.65 leading, 52ch measure (was leading-relaxed with
 *                                                                             no measure cap)
 *   Panel height transition  240ms --ease-standard              (was --motion-duration-move, ~ease)
 *
 * `variant` is NEW: "list" (default) | "card" | "filled" — Accordion.dc.html's own three anatomies.
 * List is a single shared white panel (--shadow-panel) with hairline row dividers. Card makes EACH
 * item its own panel (--shadow-raised) with a divider only above the open content. Filled makes each
 * item a flat --color-gray-1 tile with a 7px primary dot ahead of the question. All three read
 * `variant` from Accordion via context, same wiring as `isOpen`/`toggle` already used.
 *
 * "Meta" in the spec (a trailing muted value before the chevron) is NOT a fourth variant — the
 * spec's own API section names variant as exactly list | card | filled, and Meta's own prose is
 * "white panel like List, but each trigger shows a trailing muted value": that is variant="list"
 * plus a new per-row prop. So `meta` lives on AccordionTrigger, not on Accordion — [OURS], the one
 * prop this file adds beyond the three the spec's API table names, because without it Meta's
 * defining feature has nowhere to attach. `type` stays exactly what it was — single/multiple is
 * still the caller's call, never implied by `variant`.
 *
 * `disabled` and `invalid` are NEW, both per-Item. `disabled` sets the real `disabled` attribute on
 * the trigger `<button>` — inert to click/keyboard/focus for free, no extra guard needed in `toggle`
 * — and recolours ink+chevron to --color-border with hover suppressed. `invalid` recolours
 * ink+chevron+panel-copy to --color-danger and swaps in an alert glyph ahead of the label; it does
 * NOT force the item open — the spec is explicit that "force it open on submit is a CALLER concern
 * not the component's" (open it via `value`/`defaultValue` like any other item). Invalid ink stays
 * danger through hover/press (an error shouldn't fade on rollover); the hover/press BACKGROUND wash
 * still runs, since that's a plain interaction affordance, not a claim about validity.
 *
 * Container inset: Card and Filled state their own container padding (0 22px / 0 18px). List/Meta's
 * spec paragraph gives no container number at all — only the trigger's own "16px 0". Rather than
 * invent a fresh figure, List/Meta reuse the SAME 22px Card already states on this page (also
 * tokens.css's own --control-pad-x default) — [OURS], but grounded in a number this page already
 * commits to, not a new one. Every container padding across all three variants is horizontal-only;
 * the vertical rhythm always comes from the trigger's own py (or the card/filled item's own py-0,
 * with the trigger doing all the vertical work). That's also why every container/item shell carries
 * `overflow-hidden` — with zero vertical inset, a first/last row's hover fill reaches the panel's own
 * top/bottom edge and needs the radius to clip it.
 *
 * Loading: Accordion.dc.html shows a skeleton-shimmer row as one of its static state specimens, but
 * the spec's own API table lists no `loading` prop — it's descriptive of the design page, not part
 * of this component's contract. The kit already has a `Skeleton` primitive (Feedback.jsx); a caller
 * wanting a loading row can drop one inside an AccordionContent (or in place of the whole list)
 * rather than this component growing a prop the spec never asked for.
 */
import { createContext, useContext, useId, useState } from "react";

const AccordionCtx = createContext(null);
const ItemCtx = createContext(null);

// Horizontal-only container inset, shared by every variant — see the file banner's "Container
// inset" note. Vertical is always zero here; the trigger/content own the vertical rhythm.
const SHELL = {
  list: "overflow-hidden rounded-xl bg-surface shadow-panel px-[22px]",
  card: "flex flex-col gap-3",
  filled: "flex flex-col gap-3",
};

// Each Item's own wrapper. List/Meta items are plain rows in the shared SHELL panel above (just a
// divider); Card and Filled items are each their own panel, so they carry the geometry the SHELL
// gave List directly.
function itemShellClass(variant) {
  if (variant === "card") return "overflow-hidden rounded-xl bg-surface shadow-raised px-[22px]";
  if (variant === "filled") return "overflow-hidden rounded-lg bg-gray-1 px-[18px]";
  return "border-b border-gray-1 last:border-b-0"; // list (Meta rides this too)
}

export function Accordion({
  type = "single",
  value,
  defaultValue,
  onValueChange,
  collapsible = true,
  variant = "list",
  className = "",
  children,
}) {
  const [internal, setInternal] = useState(defaultValue ?? (type === "multiple" ? [] : null));
  const current = value !== undefined ? value : internal;

  const isOpen = (id) => (type === "multiple" ? (current || []).includes(id) : current === id);
  const toggle = (id) => {
    let next;
    if (type === "multiple") {
      const set = new Set(current || []);
      set.has(id) ? set.delete(id) : set.add(id);
      next = [...set];
    } else {
      next = current === id ? (collapsible ? null : current) : id;
    }
    onValueChange ? onValueChange(next) : setInternal(next);
  };

  return (
    <AccordionCtx.Provider value={{ isOpen, toggle, variant }}>
      <div className={(SHELL[variant] ?? SHELL.list) + " " + className}>{children}</div>
    </AccordionCtx.Provider>
  );
}

export function AccordionItem({ value, disabled = false, invalid = false, className = "", children }) {
  const autoId = useId();
  const id = value ?? autoId;
  const { variant } = useContext(AccordionCtx);
  return (
    <ItemCtx.Provider value={{ id, disabled, invalid }}>
      <div className={itemShellClass(variant) + " " + className}>{children}</div>
    </ItemCtx.Provider>
  );
}

/** A small stroke glyph for the invalid/error marker — no icon dependency in this kit file, same
 *  hand-drawn convention the chevron and Command's search glyph already use. */
function DangerGlyph({ className = "" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4.2v3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7" cy="9.6" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** `meta` — [OURS], see file banner: the trailing muted value Accordion.dc.html's Meta variant
 *  shows before the chevron. Pass it on any trigger regardless of `variant`; Meta is just
 *  `variant="list"` plus this. */
export function AccordionTrigger({ meta, className = "", children }) {
  const { isOpen, toggle, variant } = useContext(AccordionCtx);
  const { id, disabled, invalid } = useContext(ItemCtx);
  const open = isOpen(id);

  const padY = variant === "card" ? "py-6" : "py-4"; // [SOURCE] card trigger-y = p-6, else p-4
  const ink = disabled
    ? "text-border"
    : invalid
    ? "text-danger"
    : "text-secondary group-hover:text-primary group-active:text-primary";
  const chevronInk = disabled
    ? "text-border"
    : invalid
    ? "text-danger"
    : "text-text-muted group-hover:text-primary group-active:text-primary";
  // Background wash is independent of ink colour: it still runs on an invalid row (a plain hover
  // affordance), but never on a disabled one ("no hover" is explicit in the spec).
  const bgInteractive = disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-gray-1 active:bg-gray-2";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-expanded={open}
      aria-invalid={invalid || undefined}
      onClick={() => toggle(id)}
      className={
        `group flex w-full items-center justify-between gap-4 border-0 bg-transparent ${padY} text-left font-sans outline-none ` +
        // [SOURCE, Foundations §Motion] "120ms hover/colour" — the row's bg+ink wash, distinct
        // from the chevron's own 200ms rotation below.
        `transition-colors duration-[120ms] ease-standard ` +
        `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm ` +
        `${ink} ${bgInteractive} ` +
        className
      }
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {invalid ? (
          <DangerGlyph className="flex-none text-danger" />
        ) : variant === "filled" ? (
          <span className="chip-dot flex-none bg-primary" aria-hidden="true" />
        ) : null}
        <span className="min-w-0 truncate text-sm font-medium">{children}</span>
      </span>
      <span className="flex flex-none items-center gap-3">
        {meta && <span className="text-xs text-text-muted">{meta}</span>}
        <svg
          width="11"
          height="7"
          viewBox="0 0 11 7"
          fill="none"
          aria-hidden="true"
          // A single `transition` (not `transition-transform`) — Tailwind's transition-property
          // utilities each overwrite the whole property, so rotate AND colour both need to ride
          // the one class that lists both. [SOURCE] "chevron rotates 200ms ease-standard".
          className={"flex-none transition duration-200 ease-standard " + (open ? "rotate-180 " : "") + chevronInk}
        >
          <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    </button>
  );
}

export function AccordionContent({ className = "", children }) {
  const { isOpen, variant } = useContext(AccordionCtx);
  const { id, invalid } = useContext(ItemCtx);
  const open = isOpen(id);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        // [SOURCE] "panel height animates ... over 240ms cubic-bezier(.4,0,.2,1)".
        transition: "grid-template-rows 240ms var(--ease-standard)",
      }}
    >
      <div className="overflow-hidden">
        <div
          className={
            // [SOURCE] "#7F8082 text-sm leading-relaxed" (--color-text-muted) · mapping table's
            // precise "1.65 leading" and "48-52ch measure" — leading-[1.65] over leading-relaxed
            // (1.625) since the mapping table is the more exact of the two spec statements.
            "max-w-[52ch] text-sm leading-[1.65] " +
            (invalid ? "text-danger " : "text-text-muted ") +
            (variant === "card"
              ? "border-t border-gray-1 pt-4 pb-6 " // [SOURCE] divider before content, card scale
              : variant === "filled"
              ? "pb-4 pl-[19px] " // [SOURCE] "indented under the dot+gap"
              : "pb-4 ") +
            className
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
