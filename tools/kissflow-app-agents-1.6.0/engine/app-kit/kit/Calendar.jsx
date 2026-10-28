/**
 * Calendar · Agenda — a month grid with event markers, and the agenda that reads beside it.
 *
 * REDESIGNED 2026-08-13 from Calendar.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229). No new tokens — every value below already
 * exists in tokens.css. Token mapping (verbatim, Calendar.dc.html's own table):
 *
 *   Weekday rule     --color-gray-2 border-bottom                    (was --color-border)
 *   Cell rule        --color-gray-1, left+top only, shared seam      (was --color-row-divider)
 *   Cell hover       --color-row-hover, MARKED DAYS ONLY             (new — "an empty day is
 *                                                                       not a target")
 *   Selected         --color-primary-bg fill / --color-primary-ink ink, weight 500,
 *                    dots recolour to --color-primary-ink too        (was --color-accent /
 *                                                                       -accent-foreground)
 *   Today            NEW state — 1px INSET ring, --color-primary, not a fill, so it survives
 *                    stacking with Selected instead of competing with it
 *   Event dot        --color-<tone>-dot, 5px, max 3, never a count badge
 *   Outside month    --color-border ink, no dots, inert              (new — see note below)
 *   Agenda spine      2px rule, --color-<tone>-dot — "the dot's colour as a rule, so the two
 *                    views key together"
 *   Agenda kind pill --color-<tone>-bg / -ink, 20px tall
 *
 * TWO COMPONENTS, NOT ONE. They share a data shape and nothing else, so they are two exports
 * that happen to read the same array — a page that wants only "what is next" does not have to
 * render a month it does not need.
 *
 * DATES ARE STRINGS/NUMBERS, NOT Date OBJECTS. Unchanged discipline from the old file: a
 * Kissflow date field arrives as an ISO string and a prototype's fixture is JSON — parsing to a
 * Date and back is where timezone drift enters a component that has no business knowing about
 * timezones. `day` is the number printed; `lead` (blank cells before day 1) is a fact about one
 * specific month in one specific year, so the caller computes and passes it, never this file.
 * Agenda's per-row weekday abbreviation needs that same fact — see its own `lead` note below.
 */

// Canonical weekday order, Monday-first — the SAME array backs Calendar's header row (sliced to
// two letters) and Agenda's per-row abbreviation (uppercased via CSS). One array, so the two
// views can never disagree about which weekday a grid column or a row abbreviation means.
const WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Foundations' own tone map (tokens.css §Tones): success/warning/info declare bg/ink/dot
// together. Danger does NOT — "dot reuses --color-danger, per Foundations", there is no
// --color-danger-dot token, and inventing one is exactly what this pass was told not to do.
// Neutral isn't a tinted tone at all; it reuses gray-1/secondary/text-muted. Every branch also
// carries a CSS-level fallback: an inline `background` reading an undefined custom property
// drops the whole declaration silently, so an unrecognised tone would otherwise render an
// invisible dot with no error anywhere.
function toneVars(tone) {
  if (tone === "danger") {
    return { dot: "var(--color-danger)", bg: "var(--color-danger-bg)", ink: "var(--color-danger-ink)" };
  }
  if (tone === "neutral" || !tone) {
    return { dot: "var(--color-text-muted)", bg: "var(--color-gray-1)", ink: "var(--color-secondary)" };
  }
  return {
    dot: `var(--color-${tone}-dot, var(--color-text-muted))`,
    bg: `var(--color-${tone}-bg, var(--color-gray-1))`,
    ink: `var(--color-${tone}-ink, var(--color-secondary))`,
  };
}

/**
 * The grid rules for the cell at 0-based grid position `idx` (lead AND trailing blanks
 * included — a blank cell is still a grid position and its rules have to line up with the days
 * beside it). Inner-only: the first column takes no left rule, the first row takes no top rule.
 * Static utility strings, not a Tailwind arbitrary variant — the generated class has to survive
 * the proto-kit HTML twin too, and a plain `border-l`/`border-t` does that with no escaping
 * question.
 */
const cellRules = (idx) => (idx % 7 === 0 ? "" : "border-l ") + (idx < 7 ? "" : "border-t ") + "border-gray-1";

/**
 * Calendar — a month-lite grid. Cells are square, marked days carry up to three dots.
 *
 * `lead` is how many blank cells precede day 1 — a fact about one specific month in one
 * specific year, which this component will not work out for itself. Leading AND trailing
 * blanks now render (the old file only drew the lead), so the grid always completes to full
 * rows and the last row's border-top rule has a real cell to land on.
 *
 * `today` is NEW and controlled: the caller passes the day number that is "today" (no
 * `new Date()` inside this file, ever). Omit it and no ring is drawn.
 *
 * A day is a real target only when it is BOTH marked (has events) AND `onSelect` is supplied —
 * Calendar.dc.html's own rule, "an empty day is not a target": no hover response, no button
 * semantics, cursor default. That is also why there is no click-to-clear on the grid itself;
 * Agenda's own "Whole month" pill is the clear-selection affordance.
 */
export function Calendar({ days = 30, lead = 0, events = [], selected, onSelect, today, className = "" }) {
  const byDay = new Map();
  for (const e of events) {
    const k = Number(e.day);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const cells = Array.from({ length: days }, (_, i) => i + 1);
  const trailing = (7 - ((lead + days) % 7)) % 7;

  return (
    <div className={className}>
      {/* The rule under the weekday strip is a header rule — same call a table's thead makes —
          so it reads --color-gray-2, one step darker than the --color-gray-1 seams below it. */}
      <div className="mb-2 grid grid-cols-7 border-b border-gray-2 pb-2 text-center">
        {WEEKDAY_ABBR.map((w) => (
          <span key={w} className="text-[11px] font-bold text-text-muted">{w.slice(0, 2)}</span>
        ))}
      </div>
      {/* gap-0: adjacent cells SHARE one rule rather than each drawing its own, so a seam is 1px
          and not 2. Inner-only is why the rules are left+top rather than right+bottom — first
          column and first row are fixed positions (idx % 7 === 0, idx < 7); right+bottom would
          need the LAST row, whose size depends on lead + days and cannot be a static class. */}
      <div className="grid grid-cols-7" role="grid">
        {Array.from({ length: lead }, (_, i) => (
          // Outside-month cells carry --color-border ink per the spec's token map, even though
          // the API gives this component no adjacent-month day number to paint with it — there
          // is nothing to colour today, but the class costs nothing and is already correct for
          // a caller that starts passing one.
          <div key={`lead-${i}`} aria-hidden="true" className={"aspect-square cursor-default p-0.5 text-border " + cellRules(i)} />
        ))}
        {cells.map((d) => {
          const marks = byDay.get(d) ?? [];
          const marked = marks.length > 0;
          const on = Number(selected) === d;
          const isToday = today != null && Number(today) === d;
          const interactive = Boolean(onSelect) && marked;
          const Tag = interactive ? "button" : "div";
          return (
            /* The rules live on this wrapper, not the cell, because the cell keeps its own
               radius — a rounded border would curve away from its neighbour and the seams
               would not meet. Square wrapper draws the grid; the rounded tint sits inside it,
               inset by the padding. */
            <div key={d} className={"aspect-square p-0.5 " + cellRules(lead + d - 1)}>
              <Tag
                type={interactive ? "button" : undefined}
                onClick={interactive ? () => onSelect(d) : undefined}
                aria-pressed={interactive ? on : undefined}
                aria-label={marked ? `${d} — ${marks.length} event${marks.length > 1 ? "s" : ""}` : String(d)}
                className={
                  "flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border-0 p-1 text-center transition-colors " +
                  (interactive ? "cursor-pointer outline-none focus-visible:ring focus-visible:ring-ring " : "cursor-default ") +
                  (on
                    ? "bg-primary-bg text-primary-ink font-medium "
                    : "bg-transparent text-secondary font-normal " + (interactive ? "hover:bg-row-hover " : "")) +
                  // Today is a ring, not a fill, so it survives sitting on a Selected cell too —
                  // the two states stack on different visual channels instead of competing.
                  (isToday ? "inset-ring inset-ring-primary " : "")
                }
              >
                <span className="font-mono text-[13px] leading-none tabular-nums">{d}</span>
                {marked && (
                  <span className="flex justify-center gap-[3px]" aria-hidden="true">
                    {marks.slice(0, 3).map((m, i) => (
                      <span
                        key={i}
                        className="h-[5px] w-[5px] flex-none rounded-full"
                        style={{ background: on ? "var(--color-primary-ink)" : toneVars(m.tone).dot }}
                      />
                    ))}
                  </span>
                )}
              </Tag>
            </div>
          );
        })}
        {Array.from({ length: trailing }, (_, i) => (
          <div key={`tail-${i}`} aria-hidden="true" className={"aspect-square cursor-default p-0.5 text-border " + cellRules(lead + days + i)} />
        ))}
      </div>
    </div>
  );
}

/**
 * Agenda — dated rows, filtered to one day or the whole month.
 *
 * `day` (optional) filters `events` to that day; omit it and every event lists, day-ascending.
 * `title` is NEW and optional — this component has no calendar context of its own (no month,
 * no year, just day numbers), so it cannot honestly caption itself "August" or "Day 18"; that
 * copy is the caller's fact, same as `lead` below. Leaving it out renders no heading at all, not
 * a placeholder — a page that already wraps Agenda in its own titled panel (as this kit's own
 * demo does) would otherwise get two stacked headings saying the same thing.
 *
 * `lead` is NEW and optional, for exactly the reason Calendar takes one: a row's 3-letter
 * weekday abbreviation is a fact about which weekday a specific day-of-month fell on, and that
 * fact does not exist without knowing where day 1 sat. Rather than default it to 0 — which
 * would silently print "day 1 is Monday" for every caller that forgot it — the abbreviation
 * line is simply omitted when `lead` is not supplied. A page rendering Calendar and Agenda
 * side by side passes the same `lead` to both, and the two views' dates key together for it,
 * same as their tone colours already do.
 *
 * `onClear`, also NEW and optional, backs the "Whole month" pill at the panel's foot — shown
 * only once there is a `day` to clear. Agenda does not own the selection itself (Calendar's
 * `selected`/`onSelect` do), so clearing it is a callback out, same shape as `onSelect` below.
 */
export function Agenda({ events = [], day, title, lead, onSelect, onClear, className = "" }) {
  const filtered =
    day != null
      ? events.filter((e) => Number(e.day) === Number(day))
      : [...events].sort((a, b) => Number(a.day) - Number(b.day));

  return (
    <div className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        {title && (
          <h3 className="m-0 font-display text-[15px] font-medium leading-none tracking-[-.015em] text-secondary">
            {title}
          </h3>
        )}
        <span className="ml-auto flex-none font-mono text-[11px] text-text-muted">
          {filtered.length} event{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <svg width="28" height="26" viewBox="0 0 28 26" aria-hidden="true" className="text-text-muted">
            <rect x="0.75" y="4.75" width="26.5" height="20.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M0.75 10.25h26.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 0.75v6.5M21 0.75v6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10.5 17.5h7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="m-0 text-sm font-medium text-secondary">Nothing scheduled</p>
          <p className="m-0 max-w-[220px] text-xs text-text-muted">
            Pick a marked day, or clear the selection to see the whole month.
          </p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {filtered.map((e, i) => {
            const tv = toneVars(e.tone);
            const clickable = Boolean(onSelect);
            const weekday = lead != null ? WEEKDAY_ABBR[(((lead + Number(e.day) - 1) % 7) + 7) % 7] : null;
            return (
              <li key={e.id ?? i} className="list-none">
                <div
                  className={
                    "flex items-stretch gap-3 border-b border-gray-1 py-2.5 transition-colors last:border-0 " +
                    (clickable ? "cursor-pointer hover:bg-row-hover" : "")
                  }
                  onClick={clickable ? () => onSelect(e) : undefined}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                >
                  <div className="flex w-[34px] flex-none flex-col items-center justify-center gap-0.5 text-center">
                    <span className="font-mono text-[13px] font-medium leading-none text-secondary">{e.day}</span>
                    {weekday && (
                      <span className="font-mono text-[9px] font-medium uppercase leading-none text-text-muted">
                        {weekday}
                      </span>
                    )}
                  </div>
                  {/* The spine reads the SAME token as the day's dot on the grid — "the dot's
                      colour as a rule, so the two views key together." */}
                  <span className="w-[2px] flex-none self-stretch rounded-full" style={{ background: tv.dot }} aria-hidden="true" />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.4] text-secondary">
                      {e.title}
                    </span>
                    {e.time && <span className="flex-none font-mono text-[11px] text-text-muted">{e.time}</span>}
                    {e.kind && (
                      <span
                        className="flex h-5 flex-none items-center rounded-full px-2 text-[10px] font-medium"
                        style={{ background: tv.bg, color: tv.ink }}
                      >
                        {e.kind}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {day != null && onClear && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gray-1 px-3 text-xs font-medium text-secondary outline-none transition-colors hover:bg-gray-2 focus-visible:ring focus-visible:ring-ring"
          >
            <svg width="9" height="9" viewBox="0 0 11 11" aria-hidden="true">
              <path d="M1 1l9 9M10 1l-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Whole month
          </button>
        </div>
      )}
    </div>
  );
}
