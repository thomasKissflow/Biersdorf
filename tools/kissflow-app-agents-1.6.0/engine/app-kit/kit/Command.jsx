/**
 * Command — the ⌘K palette every page's search box opens.
 *
 * REDESIGNED 2026-08-13 from Command.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — see tokens.css's own banner for the wider
 * migration this belongs to. Still built on `cmdk` for the search/filter/keyboard-nav logic and
 * wrapped by kit's own `Modal` for `CommandDialog` (a restyle, not a rewrite — the architecture
 * doesn't change); the one new piece is `CommandFooter`.
 *
 * Token mapping (verbatim, "no new tokens" — Command.dc.html's own words):
 *   panel          --color-surface · --shadow-overlay, 560px (35rem) wide — "the one overlay
 *                  wider than a modal, a command list needs the room a form does not." No border
 *                  — Modal's own `border-decor border-edge` is overridden off, same rule as every
 *                  other page in this migration: "no border anywhere unless a page says
 *                  otherwise," and this one doesn't.
 *   position       near the TOP of the viewport, not centered. Modal centers by default
 *                  (`items-center`); CommandDialog opts its own panel out with `self-start` + a
 *                  top offset. "Results grow downward, and a vertically-centred list jumps as you
 *                  type."
 *   input          52px row, no box/ring, border-bottom --color-gray-2 — "the input is the
 *                  header." An "esc" keycap pill rides the right edge (--color-gray-1, font-mono
 *                  10px, muted).
 *   group heading  11px bold --color-text-muted, sans — "it labels rows, not data" (a deliberate
 *                  exception: every other label at this weight/size in the kit is mono).
 *   item selected  --color-primary-bg fill / --color-primary-ink ink — the same pair the selected
 *                  nav item uses. ONE selected state, not separate hover/keyboard-focus ones:
 *                  "the pointer moves the same cursor the arrow keys do, so the two can never
 *                  disagree about which row Enter will open." That's why only cmdk's own
 *                  `data-[selected=true]` is read below — no independent `data-[highlighted]`
 *                  hover the way DropdownMenuItem still carries. disabled = opacity-40.
 *   shortcut       font-mono 10px, tracking .04em, muted, pushed right, never boxed.
 *   footer         NEW — CommandFooter, the key-hint bar. --color-row-hover wash (Command.dc.html
 *                  gives it as "#FAFAFB-ish," which is --color-row-hover's own hex, so no literal
 *                  is needed), border-top --color-gray-2, white keycap pills (--shadow-contact)
 *                  on the left, a font-mono result count on the right. "Omit it in a palette with
 *                  one group" is the caller's call — this file doesn't count groups for you.
 *
 * CommandEmpty is a bigger change than a restyle: it used to take arbitrary children (the old
 * specimen passed "Nothing matches that."); now it takes NO props and echoes the live query
 * itself via cmdk's own `useCommandState`, so every palette in the app says "No matches for 'x'"
 * in the same words instead of each call site writing its own copy.
 */
import { Command as CommandPrimitive, useCommandState } from "cmdk";
import { Modal } from "./Overlay.jsx";

export function Command({ className = "", ...rest }) {
  return (
    <CommandPrimitive
      className={"flex h-full w-full flex-col overflow-hidden rounded-xl bg-surface text-secondary " + className}
      {...rest}
    />
  );
}

/** The palette inside kit's own Modal. `width` 560px (35rem, Command.dc.html's own number) —
 *  wider than Modal's 34rem default, because a command list wants the room a form does not.
 *  `self-start` + a top offset opts this one dialog out of Modal's default vertical centering;
 *  `!border-0`/`!bg-surface`/`!text-secondary` replace Modal's own (pre-migration) edge and
 *  `bg-card`/`text-card-foreground` pair. No title/footer — the input IS the header. */
export function CommandDialog({ open, onClose, children, width = "35rem" }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={width}
      className="self-start mt-[10vh] !border-0 !bg-surface !text-secondary !p-0 !overflow-hidden"
    >
      <Command>{children}</Command>
    </Modal>
  );
}

/** The search field — borderless, no box, no ring: "the input is the header," not a field sitting
 *  inside a card. Height lives on the ROW (52px), not the bare input, so the icon and the esc
 *  keycap share it. Border-bottom is the only edge anywhere in this anatomy above the footer. */
export function CommandInput({ className = "", ...rest }) {
  return (
    <div className="flex h-13 flex-none items-center gap-2.5 border-b border-gray-2 px-4" cmdk-input-wrapper="">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="flex-none text-text-muted">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <CommandPrimitive.Input
        className={
          "h-full w-full border-0 bg-transparent px-0 font-sans text-sm text-secondary outline-none " +
          "placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-60 " +
          className
        }
        {...rest}
      />
      <kbd className="flex-none rounded-full bg-gray-1 px-2 py-1 font-mono text-2xs text-text-muted">esc</kbd>
    </div>
  );
}

/** [SOURCE] 330px — the one number Command.dc.html gives its own list. Empty groups collapse to
 *  nothing on their own; that's cmdk's built-in behaviour (a <CommandGroup> with zero visible
 *  items renders no heading), not something this file has to implement. */
export function CommandList({ className = "", ...rest }) {
  return <CommandPrimitive.List className={"max-h-[330px] overflow-y-auto overflow-x-hidden p-1 " + className} {...rest} />;
}

/** No props, by design: the query and the "no results" copy are this component's job, not every
 *  call site's. `useCommandState` reads cmdk's own search string straight from context — the
 *  same value CommandInput is bound to — so the echoed query can never drift from the field. */
export function CommandEmpty() {
  const query = useCommandState((state) => state.search);
  return (
    <CommandPrimitive.Empty className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="flex-none text-border">
        <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 8.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M13 13l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="m-0 text-sm font-medium text-secondary">No matches for “{query}”</p>
      <p className="m-0 text-xs text-text-muted">Try a shorter or different search term.</p>
    </CommandPrimitive.Empty>
  );
}

/** A group of items under a heading. The heading is cmdk's own generated element
 *  (`[cmdk-group-heading]`), styled by descendant selector rather than a component of its own —
 *  11px bold --color-text-muted, sans, "it labels rows, not data" (every other label at this
 *  weight in the kit is mono; this one deliberately isn't). */
export function CommandGroup({ className = "", ...rest }) {
  return (
    <CommandPrimitive.Group
      className={
        "overflow-hidden p-1 text-secondary " +
        "[&_[cmdk-group-heading]]:block [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 " +
        "[&_[cmdk-group-heading]]:font-sans [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold " +
        "[&_[cmdk-group-heading]]:text-text-muted " +
        className
      }
      {...rest}
    />
  );
}

/** The rule between two groups' items. Reads --color-gray-2, tokens.css's own "dividers on
 *  white" role — not --color-border, which is for container edges, a different job. */
export function CommandSeparator({ className = "" }) {
  return <CommandPrimitive.Separator className={"-mx-1 my-1 h-px bg-gray-2 " + className} />;
}

/**
 * A row. ONE selected state (--color-primary-bg / --color-primary-ink, the same pair the selected
 * nav item uses) rather than separate hover/keyboard-focus ones — "the pointer moves the same
 * cursor the arrow keys do, so the two can never disagree about which row Enter will open." That
 * is the one place this differs from DropdownMenuItem, which still carries an independent
 * `data-[highlighted]` hover.
 *
 * Composition, not slot props — an icon svg, then a label (wrap it `flex-1 truncate` yourself if
 * it can run long), then optional meta, then an optional <CommandShortcut/> last. CommandItem
 * only lays the row out (`items-center gap-2.5`); it doesn't know which child is which.
 */
export function CommandItem({ className = "", ...rest }) {
  return (
    <CommandPrimitive.Item
      className={
        "relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2 font-sans text-sm text-secondary outline-none " +
        "data-[selected=true]:bg-primary-bg data-[selected=true]:text-primary-ink data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40 " +
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-muted " +
        className
      }
      {...rest}
    />
  );
}

/** Never boxed — font-mono, tracked out, muted, pushed to the row's right edge. */
export function CommandShortcut({ className = "", ...rest }) {
  return <span className={"ml-auto font-mono text-2xs tracking-[.04em] text-text-muted " + className} {...rest} />;
}

// Every palette supports arrow-navigation and Enter by construction (that's cmdk, not a choice a
// caller makes), so that pair is the default; override or extend `hints` for a palette with more
// bound keys.
const DEFAULT_HINTS = [
  { keys: "↑↓", label: "navigate" },
  { keys: "↵", label: "open" },
];

/**
 * CommandFooter — NEW. The key-hint bar Command.dc.html adds: ↑↓ / ↵ on the left as white keycap
 * pills on the wash, a result count on the right. "Omit it in a palette with one group" is the
 * caller's decision — this file doesn't guess at group count, it only renders what it's given.
 *
 * `count` is left undefined by default — nothing renders on the right until a caller has a
 * number (or pre-formatted string, e.g. "12 results") to put there.
 *
 * Wash colour: Command.dc.html gives it as "#FAFAFB-ish, distinct from --color-gray-1" — that hex
 * is --color-row-hover's own value verbatim, so this reads the token rather than a literal.
 */
export function CommandFooter({ hints = DEFAULT_HINTS, count }) {
  return (
    <div className="flex h-[42px] flex-none items-center gap-4 border-t border-gray-2 bg-row-hover px-4">
      <div className="flex items-center gap-3">
        {hints.map(({ keys, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-2xs text-text-muted">
            <kbd className="rounded-full bg-surface px-1.5 py-0.5 font-mono text-2xs text-text-muted shadow-contact">
              {keys}
            </kbd>
            {label}
          </span>
        ))}
      </div>
      {count != null && <span className="ml-auto font-mono text-2xs text-text-muted">{count}</span>}
    </div>
  );
}
