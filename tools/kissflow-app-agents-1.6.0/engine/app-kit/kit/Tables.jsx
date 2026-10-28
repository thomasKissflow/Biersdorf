import { useEffect, useRef } from "react";
import { Checkbox } from "./Fields.jsx";

/**
 * Table — a row list, in Tailwind utilities on theme tokens.
 *
 * REDESIGNED 2026-08-13 from Tables.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — Cards.jsx/Buttons.jsx/Chips.jsx's playbook
 * (provenance comments, inline style only for what a Tailwind theme namespace can't reach, a
 * static lookup object wherever a class would otherwise need a runtime-built name).
 *
 * WHAT THE OLD FILE GOT WRONG, verified against Tables.dc.html and fixed here:
 *   Row rule       was `border-row-divider` — --row-divider no longer exists (tokens.css's own
 *                  Foundations rewrite). The page's own mapping is `--color-gray-1`; `last:border-0`
 *                  was already correct and is unchanged.
 *   Scroll region  the wrapper had `overflow-x-auto` but the `<table>` itself was only `w-full` —
 *                  with nothing forcing it past the container's width, a wide table never got wide
 *                  enough to scroll: `min-w-max` is added below so the table can outgrow `w-full`
 *                  and the wrapper's own overflow takes over, per the page's own callout.
 *   Row tone       did not exist at all — every row rendered identically regardless of state, so
 *                  there was nothing to get right or wrong; it is new below.
 *   Flexible columns  Tables.dc.html's own "minmax(), not a bare fraction" warning is about a
 *                  CSS-grid table (`grid-template-columns`) — the source docs' own construction,
 *                  which this file's ORIGINAL header comment already departs from on purpose ("The
 *                  source docs all render rows as flex containers... a departure, deliberate") in
 *                  favour of a real `<table>`. A real table has no `fr` tracks to under-constrain in
 *                  the first place — `table-layout` stays the browser default (`auto`), which sizes
 *                  every column from its own content and the available width together, so there is
 *                  no bare-fraction failure mode to port forward. Verified N/A, not fixed, because
 *                  there was nothing of that shape here to begin with.
 *   Stale tokens   `text-muted-foreground` / `text-foreground` / `text-meta-foreground` /
 *                  `border-border` are the same dead-token failure gallery-kit.jsx's own banner
 *                  describes (they resolve through shadcn.css's bridge to a bare `--foreground`
 *                  etc. that no longer exists anywhere) — replaced with the Foundations equivalents
 *                  gallery-kit.jsx already standardised: text-secondary / text-text-muted.
 *
 * THREE NEW PROPS, per Tables.dc.html's own API table:
 *   selected + onSelect   the checkbox column. `onSelect` takes the NEXT full array of keys (same
 *                          "controlled value, not an event" shape `Card`'s `tone` and `StatTile`'s
 *                          `delta` already use in this kit) — Table never owns selection state
 *                          itself, same "presentational" rule the file banner below already states
 *                          for rows/columns. The header box computes checked/indeterminate from
 *                          `selected` vs. the CURRENT `rows`, and toggling it selects/clears exactly
 *                          those rows — there is no separate "all known rows" concept for a
 *                          component that is never told about rows it isn't rendering.
 *   sort (+ onSort)       `sort` is `{ key, dir }`, exactly Tables.dc.html's own shape, and is
 *                          display-only — Table does not sort `rows` itself (nothing here talks to
 *                          data, per the file's own long-standing rule). `onSort(key)` is NOT one of
 *                          the doc's three named props, but a sort button that calls nothing is a
 *                          button that does nothing: it is added for the same reason `onRowClick`
 *                          already exists on this component (a controlled interaction needs a
 *                          notifier), named to match, and is optional — omit it and `sort` still
 *                          renders the right chevron on the right column, just inertly. A column
 *                          opts in with `sortable: true`, an additive field on the existing column
 *                          shape (not a new top-level prop).
 *   rowTone                `(row) => tone`, one of Foundations' four tones with a `-bg` (success /
 *                          warning / info / danger — "neutral" is deliberately excluded, the same
 *                          `tone && tone !== "neutral"` rule Card.jsx already uses, because tokens.css
 *                          mints no `--color-neutral-bg` to point at).
 *
 * INTERACTION PRIORITY (Tables.dc.html's own rule): a row's tone owns the base fill at full
 * strength, unconditionally — selecting or hovering a toned row does NOT switch it to the neutral
 * `--color-row-selected` / `--color-row-hover` wash ("a selected failed row still reads as failed").
 * A toned row's hover instead darkens within its own hue (`color-mix` toward black, ~6%) — see
 * TONE_HOVER below. Selection still WORKS on a toned row (the checkbox still checks), it just does
 * not repaint the row a second colour on top of its tone.
 *
 * CHECKBOX: reuses Fields.jsx's <Checkbox/> for every row rather than re-declaring its box — same
 * `size-4.5`/`--radius-sm`/`--color-primary` anatomy the field kit already draws correctly, so a
 * table's selection control and a form's checkbox are the same control, not two that happen to
 * agree today. The one thing that component doesn't expose is `indeterminate` (a checkbox's
 * indeterminate state is a DOM property with no HTML/React attribute, settable only via a ref) — the
 * HEADER box needs exactly that for a partial selection, so it is the one local, unexported
 * component below, mirroring <Checkbox/>'s own classes rather than inventing a different box.
 *
 * HEADER BAND: Tables.dc.html asks for "~#FAFAFB-ish near-white" — `--color-row-hover` already IS
 * #FAFAFB (tokens.css's own comment on that token), an exact match rather than a "close enough"
 * one, so the band reuses it instead of adding a second literal for the same value.
 *
 * CELL DENSITY: `compact` (not `dense`) — matches the boolean this exact kit already uses for the
 * same job on Callout.jsx (`compact = false`), so a caller doesn't have to remember two different
 * spellings of the same idea across two components.
 *
 * NOTE — Tailwind preflight is OFF (src/shadcn.css), so <table>/<th>/<button> keep the UA's own
 * font, weight, spacing and background. `border-collapse`, cell padding, `font-normal` on <th>
 * (browsers bold table headers by default — "never bold sans" in the spec is this failure mode
 * exactly) and every reset on the sort <button> are all explicit for that reason, not decoration.
 */

/**
 * columns: [{ key, label, align?, mono?, width?, sortable? }]
 *   align     "right" for numerals — pairs with tabular-nums so columns line up
 *   mono      the data voice (IDs, references, dates) — reads --color-text-muted, the same role
 *             tokens.css's own comment gives that token ("body copy, labels, resting chevron")
 *   sortable  header renders as a button with a chevron; click calls `onSort(key)`
 * rows:    [{ …keyed by column.key }] — a cell value may be a node, so a caller drops a
 *          <StatusChip/> straight in.
 */

// Row tone's own hover, one step darker in the SAME hue rather than the neutral --color-row-hover
// wash — the priority rule the file banner explains. A static lookup, not a template-built class:
// `hover:bg-[color-mix(in_srgb,var(--color-${tone}-bg)_94%,black)]` never appears as one complete
// string in the source, so Tailwind's scanner would never see it — the exact trap Cards.jsx/
// Chips.jsx's own file banners already warn about, avoided here the same way Chips.jsx's TONES
// object is: every tone spelled out in full. Six percent black — enough to read as "one step
// darker" without fighting the tone's own ink for contrast.
const TONE_HOVER = {
  success: "hover:bg-[color-mix(in_srgb,var(--color-success-bg)_94%,black)]",
  warning: "hover:bg-[color-mix(in_srgb,var(--color-warning-bg)_94%,black)]",
  info: "hover:bg-[color-mix(in_srgb,var(--color-info-bg)_94%,black)]",
  danger: "hover:bg-[color-mix(in_srgb,var(--color-danger-bg)_94%,black)]",
};

const HEADER_TEXT = "font-mono text-[9px] font-normal uppercase tracking-[.13em]";

/** The sort indicator — a caret, not the open/close chevron Accordion.jsx already owns (that one
 *  rotates 180° between two STATES of one thing; this one rotates between two DIRECTIONS of a
 *  column that may not even be the active one, hence the separate `active` dim). Resting = points
 *  down / --color-text-muted ("resting chevron", tokens.css's own words on that token); active =
 *  --color-primary ("active chevron", same comment) and points up for `dir:"desc"`. */
function SortChevron({ dir, active }) {
  return (
    <svg
      width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"
      className={"flex-none transition duration-200 ease-standard " + (dir === "desc" ? "rotate-180 " : "") + (active ? "" : "opacity-40")}
    >
      <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The header's own checkbox — see file banner for why this is the one box not built on Fields.jsx's
 *  <Checkbox/>: indeterminate is a ref-set DOM property, not a prop that component takes. Mirrors
 *  its exact classes rather than a second visual. */
function HeaderCheckbox({ checked, indeterminate, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const filled = checked || indeterminate;
  return (
    <label className="inline-flex cursor-pointer items-center">
      <span
        className={
          "relative grid size-4.5 flex-none place-items-center rounded-sm border-decor transition-colors " +
          "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 " +
          (filled ? "border-primary bg-primary text-white" : "border-gray-3 bg-surface text-transparent")
        }
      >
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          aria-label="Select all rows"
          className="absolute inset-0 m-0 cursor-inherit opacity-0"
        />
        {indeterminate ? (
          <span className="block h-[1.5px] w-2 rounded-full bg-current" aria-hidden="true" />
        ) : (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true" className="pointer-events-none">
            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </label>
  );
}

export function Table({
  columns = [],
  rows = [],
  empty = "No rows.",
  rowKey,
  onRowClick,
  selected,
  onSelect,
  sort,
  onSort,
  rowTone,
  compact = false,
  className = "",
}) {
  if (!columns.length) return null;
  if (!rows.length) {
    return <p className="m-0 py-6 text-center text-sm text-text-muted">{empty}</p>;
  }

  const clickable = typeof onRowClick === "function";
  const selectable = typeof onSelect === "function";
  const selectedSet = new Set(selected ?? []);
  const keyFor = (r, i) => (rowKey ? rowKey(r, i) : i);

  const allChecked = selectable && rows.every((r, i) => selectedSet.has(keyFor(r, i)));
  const someChecked = selectable && rows.some((r, i) => selectedSet.has(keyFor(r, i)));
  const toggleAll = () => onSelect(allChecked ? [] : rows.map(keyFor));
  const toggleRow = (key) =>
    onSelect(selectedSet.has(key) ? [...selectedSet].filter((k) => k !== key) : [...selectedSet, key]);

  const cellPad = (compact ? "py-2.5" : "py-[13px]") + " px-5";

  return (
    // overflow-x-auto so a wide table scrolls inside the card instead of widening the page — only
    // the body/header scroll together here; a caller's toolbar or pagination sits outside this
    // wrapper entirely, since this component renders nothing else for them to end up inside.
    <div className={"w-full overflow-x-auto " + className}>
      {/* min-w-max: the table is allowed to grow past the wrapper's own width instead of being
          crushed to it, which is what makes the overflow-x-auto above ever actually engage — see
          file banner. */}
      <table className="w-full min-w-max border-collapse text-left">
        <thead>
          {/* The band: --color-gray-2 top AND bottom ("reads as one object"), fill reuses
              --color-row-hover — see file banner for why that is not a new literal. */}
          <tr className="border-y border-gray-2 bg-row-hover">
            {selectable && (
              <th scope="col" className={cellPad + " w-0"}>
                <HeaderCheckbox checked={allChecked} indeterminate={someChecked && !allChecked} onChange={toggleAll} />
              </th>
            )}
            {columns.map((c) => {
              const right = c.align === "right";
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={c.sortable ? (active ? (sort.dir === "desc" ? "descending" : "ascending") : "none") : undefined}
                  className={cellPad + " " + HEADER_TEXT + " text-text-muted " + (right ? "text-right" : "text-left")}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(c.key)}
                      className={
                        HEADER_TEXT + " inline-flex w-full cursor-pointer items-center gap-1 border-0 bg-transparent p-0 " +
                        "outline-none transition-colors duration-[120ms] ease-standard focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-1 " +
                        (right ? "justify-end " : "justify-start ") +
                        (active ? "text-primary" : "text-text-muted hover:text-secondary")
                      }
                    >
                      <span>{c.label ?? c.key}</span>
                      <SortChevron active={active} dir={active ? sort.dir : "asc"} />
                    </button>
                  ) : (
                    c.label ?? c.key
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const key = keyFor(r, i);
            const tone = rowTone?.(r);
            // Excludes "neutral" the same way Card.jsx's own `tinted` does — tokens.css mints no
            // --color-neutral-bg, so treating it as a real tone would suppress hover/selection for
            // a row that ends up painting nothing.
            const toned = tone && tone !== "neutral";
            const isSelected = selectable && selectedSet.has(key);
            // Priority: tone (full strength, own-hue hover) > selected > plain hover. See file
            // banner — a toned row never repaints to the neutral selected/hover wash.
            const bg = toned
              ? "bg-[var(--color-" + tone + "-bg)] " + (clickable ? (TONE_HOVER[tone] ?? "") : "")
              : isSelected
              ? "bg-row-selected "
              : clickable
              ? "hover:bg-row-hover "
              : "";
            return (
              <tr
                key={key}
                onClick={clickable ? () => onRowClick(r, i) : undefined}
                // last:border-0 — the panel's own padding already ends the list; a trailing rule
                // reads as a row that failed to render.
                className={"border-b border-gray-1 transition-colors last:border-0 " + bg + (clickable ? "cursor-pointer" : "")}
              >
                {selectable && (
                  // stopPropagation: without it, checking a box inside a clickable row also fires
                  // onRowClick — a select gesture would double as an open/navigate gesture.
                  <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      id={"row-select-" + key}
                      checked={isSelected}
                      onChange={() => toggleRow(key)}
                      aria-label={"Select row"}
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={
                      cellPad + " align-middle text-sm " +
                      (c.align === "right" ? "text-right " : "text-left ") +
                      (c.mono ? "font-mono tabular-nums text-text-muted " : "text-secondary ")
                    }
                  >
                    {r[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
