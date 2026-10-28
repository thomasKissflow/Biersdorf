/**
 * Popover · Tooltip · DropdownMenu — the three anchored floating surfaces.
 *
 * REDESIGNED 2026-08-13 from Floating.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229). Its own opening line: "content that floats near
 * where you asked for it. The first two are one surface doing two jobs; the tooltip is
 * deliberately not." Token-mapping table, transcribed as [SOURCE] below:
 *
 *   Panel fill/edge     --color-surface · --color-gray-2      (identical for Popover and DropdownMenu)
 *   Panel radius/shadow --radius-lg · --shadow-overlay         (padding is the ONLY difference: p-4 vs p-1)
 *   Menu item           text-sm · --radius-sm, py-2.5 px-2.5, gap-2.5 to a size-4 icon (muted at rest)
 *   Item highlighted    --color-gray-1 (pointer hover AND keyboard focus are the SAME state — Radix's
 *                       own `data-[highlighted]` already fires for both, so no separate wiring needed)
 *   Destructive item    --color-danger-ink text · --color-danger-bg highlight (the TINT, not the
 *                       solid --color-danger fill)
 *   Group label         text-xs font-semibold, muted
 *   Shortcut             font-mono, ml-auto, never boxed
 *   Separator            --color-gray-2, full-bleed (-mx-1 cancels the p-1)
 *   Tooltip              --color-secondary fill · white ink · --radius-md, text-xs px-2.5 py-1.5 — NOT a panel
 *
 * Unlike `Modal`/`Sheet`, these stay on `@radix-ui/react-*` underneath rather than being
 * hand-rolled — portaling, viewport collision detection, and (for a menu) roving keyboard focus
 * through items are each a real, fiddly problem, not a styling one. What changed below is every
 * className: nothing reads the dead shadcn/pre-migration tokens (`bg-popover`, `text-popover-
 * foreground`, `border-edge`, `bg-accent`/`text-accent-foreground`, `text-foreground-subtle`) —
 * everything reads Foundations' live `--color-*` tokens the way `Card`/`Callout`/`Accordion` do.
 *
 * [OURS] throughout — Floating.dc.html names no dedicated "Popover" or "DropdownMenu" component,
 * only the shared surface recipe above. The surface treatment stays deliberately IDENTICAL across
 * Popover and DropdownMenu — same fill/edge/radius/shadow — because they are the same object
 * (content that floats over the page near where you asked for it) wearing two different jobs, not
 * two different surfaces. Only their padding (p-4 vs p-1) tells them apart.
 *
 * `destructive` on DropdownMenuItem is [OURS], a prop this file adds beyond what the spec's terse
 * API line names (`inset, disabled`) — same shape as Accordion.jsx's own `meta` addition, cited
 * there as "the one prop this file adds beyond the three the spec's API table names," for the
 * same reason: the spec's PROSE describes a distinct destructive-item treatment with nowhere else
 * to attach. It exists because a plain `className="text-danger-ink"` on an ordinary Item cannot
 * reliably win against the base item's own `data-[highlighted]:bg-gray-1` — same Tailwind utility
 * property, same specificity, so whichever one Tailwind happens to emit later in the generated
 * sheet wins, not whichever is written later in this file's className string. `destructive` sidesteps
 * that by composing exactly ONE `data-[highlighted]:bg-*` per item instance (never both at once),
 * the same ternary-composition shape Cards.jsx/Callout.jsx already use for their own per-instance
 * colour. Its icon also flips to `text-current` (inheriting --color-danger-ink) rather than staying
 * `text-text-muted` — a muted-gray icon beside red text would read as two different claims about
 * the same row.
 *
 * The checkbox/radio indicator column stays `pl-8` / a 14px (`size-3.5`) glyph box at `left-2.5`,
 * UNCHANGED from before this pass — the spec's "~16px column" describes the RESERVATION (`pl-8`,
 * 32px), not the glyph's own box. Bumping the glyph to a literal 16px would shrink the indicator→
 * label gap below the item's own `gap-2.5` (10px) and invite re-deriving the padding to match; the
 * existing numbers already satisfy "labels align whether or not anything is checked."
 *
 * TOOLTIP GETS NO SHADOW, on purpose. The mapping table above is exhaustive per surface: the panel
 * row names fill · edge · radius · shadow; the tooltip row names fill · ink · radius · text ·
 * padding and stops there. "Same pair the strong button rank uses" (Buttons.jsx's `bg-secondary
 * text-white`) is scoped to the COLOUR pair, not to `shadow-button` riding along with it. Adding
 * shadow-overlay back would also blur the doc's own point — "the one floating thing that is not a
 * panel" — by giving the tooltip the panel's own elevation treatment. Don't re-add it.
 */
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

// The one surface class every panel below shares — Popover AND DropdownMenu. `rounded-lg` (not
// `overlay-shape`, which is sized/padded for a full Modal) — these are compact, so padding is set
// per part instead (p-4 for a Popover's free-form content, p-1 for a menu's dense item list).
const SURFACE =
  "z-50 border-decor border-gray-2 shadow-overlay rounded-lg bg-surface text-secondary " +
  "outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 " +
  "data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

/* ── Popover ────────────────────────────────────────────────────────────────────────────────── */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({ className = "", align = "center", sideOffset = 8, ...rest }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={SURFACE + " w-72 p-4 text-sm " + className}
        {...rest}
      />
    </PopoverPrimitive.Portal>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────────────────────────── */

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/** The one floating surface that does NOT read the panel recipe above — a tooltip is a label, not
 *  a panel. `bg-secondary text-white` is the exact pair Buttons.jsx's `strong` rank fills with
 *  (near-black, white ink) — "the same pair" per the file banner — so a tooltip reads as the same
 *  kind of high-contrast ink as the rest of the language's emphasis vocabulary, not a fourth
 *  surface. See the file banner for why this carries no shadow. */
export function TooltipContent({ className = "", sideOffset = 6, ...rest }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={
          "z-50 rounded-md bg-secondary px-2.5 py-1.5 font-sans text-xs text-white " +
          "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 " +
          className
        }
        {...rest}
      />
    </TooltipPrimitive.Portal>
  );
}

/* ── DropdownMenu ───────────────────────────────────────────────────────────────────────────── */

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export function DropdownMenuContent({ className = "", sideOffset = 6, ...rest }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={SURFACE + " min-w-[10rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto p-1 " + className}
        {...rest}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

// Every property an item needs regardless of tone. The highlighted-state background is deliberately
// NOT here — it is composed once per instance below (gray-1 or the destructive tint, never both),
// so two same-specificity `data-[highlighted]:bg-*` utilities never land on the same element. Icon
// ink defaults to muted-at-rest, per the spec's own item row.
const ITEM_BASE =
  "relative flex cursor-default select-none items-center gap-2.5 rounded-sm py-2.5 px-2.5 font-sans text-sm outline-none transition-colors " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-text-muted";

export function DropdownMenuItem({ className = "", inset, destructive = false, ...rest }) {
  return (
    <DropdownMenuPrimitive.Item
      className={
        ITEM_BASE + " " +
        (destructive
          ? "text-danger-ink data-[highlighted]:bg-danger-bg [&>svg]:text-current "
          : "data-[highlighted]:bg-gray-1 ") +
        (inset ? "pl-8 " : "") +
        className
      }
      {...rest}
    />
  );
}

export function DropdownMenuCheckboxItem({ className = "", children, checked, ...rest }) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={ITEM_BASE + " data-[highlighted]:bg-gray-1 pl-8 " + className}
      checked={checked}
      {...rest}
    >
      <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className = "", children, ...rest }) {
  return (
    <DropdownMenuPrimitive.RadioItem className={ITEM_BASE + " data-[highlighted]:bg-gray-1 pl-8 " + className} {...rest}>
      <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className = "", inset, ...rest }) {
  return (
    <DropdownMenuPrimitive.Label
      className={"px-2.5 py-1.5 font-sans text-xs font-semibold text-text-muted " + (inset ? "pl-8 " : "") + className}
      {...rest}
    />
  );
}

// The full-bleed divider — -mx-1 cancels the panel's own p-1, per the spec's own mapping row.
export function DropdownMenuSeparator({ className = "" }) {
  return <DropdownMenuPrimitive.Separator className={"-mx-1 my-1 h-px bg-gray-2 " + className} />;
}

export function DropdownMenuShortcut({ className = "", ...rest }) {
  return <span className={"ml-auto font-mono text-[11px] tracking-wide text-text-muted " + className} {...rest} />;
}
