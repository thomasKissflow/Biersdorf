/**
 * Stepper · Timeline · ActivityFeed — the three ways a process shows its shape.
 *
 * REDESIGNED 2026-08-13 from Feed.dc.html (Claude Design project "Mobile app style guide sheet",
 * 2b8a920b-a786-4430-bd63-b0bc0dbe6229). The old anatomy — a 7px `chip-dot` for every mark, a bare
 * `border-l` rail, colour off `--tone-*` / `hsl(var(--accent))` / `--border` / `--foreground` /
 * `--muted-foreground` — is a rewrite here, not a retint: tokens.css's Foundations pass names none
 * of those any more (see that file's own banner), so there was nothing left to retint against.
 *
 * Two things the port brief guessed about turned out to be backwards — worth recording since they
 * shape what actually changed below:
 *   - The rail already stopped at the last marker (`last:border-transparent`) and the note block
 *     already gated on `it.body`. Neither of the "likely bugs" this pass was told to look for
 *     existed; both are unchanged in spirit, just redrawn for a 30px marker instead of a 1px edge.
 *   - Stepper had NO click-to-jump at all — no onClick, no callback prop, nothing for a caller to
 *     pass. `onStep` below is new, not a confirmation of something already there.
 *
 * STEPPER — 30px mark, replacing the old 7px dot:
 *   done      --color-primary fill · a check (never the number that's been ticked off), drawn in
 *             --color-surface (white, but the token that IS white, not a literal)
 *   current   --color-primary-bg fill · --color-primary-ink number · +2px inset --color-primary
 *             ring — "the tint plus a ring, so it reads ahead of a done step"
 *   ahead     --color-gray-1 fill · --color-text-muted number, in mono — "nothing tinted"
 *   rail      1px, --color-primary behind/through completed+current steps, --color-gray-2 ahead of
 *             current; transparent past both ends so no line dangles off the sequence
 *   label     --color-secondary for done/current, --color-text-muted for ahead; 500 weight only on
 *             current, 400 everywhere else
 *   onStep    NEW. A step renders as a real `<button>` iff a caller passes it — Card's own
 *             `clickable`-is-opt-in rule, not a permanent affordance. Unsupplied, a step is exactly
 *             as inert as it always was.
 *   Still scrolls rather than crushing/wrapping below 640px — a five-step process with real step
 *   names is wider than a side sheet, and clipping the last step leaves the reader unable to tell
 *   whether there are four steps or nine. Unchanged from before this pass.
 *
 * TIMELINE — 30px tone-tinted circular marker (icon inside, --color-<tone>-bg/-ink — the pair
 *   Card/Avatar/Callout all read), replacing the 7px chip-dot riding a bare `border-l`. FLAGGED:
 *   StatusChip's own port moved chip tones onto Tailwind's stock palette (emerald/amber/blue/rose/
 *   slate) instead — this file follows the token pair because Feed.dc.html's own token-mapping
 *   table names it verbatim and Card/Avatar/Callout still agree with it 3-to-1, but a `danger`
 *   marker here and a `danger` StatusChip are no longer literally the same red. Title 13px/500 +
 *   right-aligned mono timestamp 11px on one line; body 12px/1.55 below. Rail stops at the last
 *   marker (behaviour unchanged) — now a centred 1px line behind a 30px column instead of a
 *   `border-l` down the `<li>`, because a marker this size needs a track to sit on, not an edge.
 *
 * ACTIVITYFEED — same rail mechanic as Timeline. NEW: the old version drew no rail at all, just a
 *   plain gapped list — a stream of people reads as a stream, not a scatter, so it gets the same
 *   connecting line. Marker is a 30px avatar (initials, tone-tinted, 10px bold) instead of an icon.
 *   Sentence is "**actor** action `object`" — actor --color-secondary/500, action plain
 *   --color-ink-soft/400, object (NEW, optional) font-mono, "an id/reference reads as data, not
 *   prose." `object` is additive: pass it and it renders after `action`; omit it and the sentence
 *   is exactly what it always was. Note (was: a bubble with a tail pointing at the avatar, tinted
 *   in the now-gone `--accent`) is now a plain --color-gray-1 block, no tail — Feed.dc.html draws
 *   none, and there's no `--accent` left to tint one with. Attachment keeps its OWN surface
 *   (--color-surface + --shadow-contact, no border — the old border's whole justification was
 *   surviving Checkpoint zeroing `--border-decor`, and Checkpoint is retired) rather than reusing
 *   gray-1, so a note sitting right above an attachment doesn't fuse into one shape.
 */

// Same four tones Card/Avatar/Callout read — --color-<tone>-bg/-ink. A dynamic per-tone colour
// can't be a Tailwind class (a template-built `bg-[var(--color-${tone}-bg)]` is invisible to the
// JIT scanner and compiles to nothing — Cards.jsx's StatTile delta pill and Avatar.jsx's tinted
// tile hit the same wall), so both tone-bearing markers below go through inline style. Untoned
// (or an unrecognised tone) falls back to the same neutral gray-1/text-muted pair Avatar does.
const TONE_NAMES = ["success", "warning", "info", "danger"];
function toneStyle(tone) {
  return TONE_NAMES.includes(tone)
    ? { background: `var(--color-${tone}-bg)`, color: `var(--color-${tone}-ink)` }
    : { background: "var(--color-gray-1)", color: "var(--color-text-muted)" };
}

/**
 * Stepper — a fixed sequence with a current position.
 *
 * Horizontal on sm and up, vertical below. `steps` accepts a bare string as a label with no meta.
 */
export function Stepper({ steps = [], current = 0, onStep, className = "" }) {
  if (!steps.length) return null;
  const clickable = typeof onStep === "function";
  return (
    // A process with five steps and real step names ("Verify Documents & GSTIN") is wider than a
    // side sheet. With `flex-1` and no overflow rule the last step was simply CLIPPED at the panel
    // edge — the reader cannot tell whether the process has four steps or nine. Scrolling is the
    // honest failure: everything stays reachable, and the cut edge signals there is more.
    // `min-w-[7rem]` stops the columns crushing into unreadable slivers before that point.
    <ol className={"m-0 flex list-none flex-col gap-4 overflow-x-auto p-0 sm:flex-row sm:items-start " + className}>
      {steps.map((s, i) => {
        const label = typeof s === "string" ? s : s.label;
        const meta = typeof s === "object" ? s.meta : undefined;
        const done = i < current;
        const active = i === current;
        const Tag = clickable ? "button" : "div";
        const markStyle = {
          background: done ? "var(--color-primary)" : active ? "var(--color-primary-bg)" : "var(--color-gray-1)",
          color: done ? "var(--color-surface)" : active ? "var(--color-primary-ink)" : "var(--color-text-muted)",
          // Only the current step's mark rings — "the tint plus a ring, so it reads ahead of a
          // done step" — a bigger circle would shift every neighbour's baseline as the process
          // advances; a ring doesn't.
          boxShadow: active ? "inset 0 0 0 2px var(--color-primary)" : undefined,
        };
        return (
          <li key={i} className="flex-1 sm:min-w-[7rem]" aria-current={active ? "step" : undefined}>
            <Tag
              type={clickable ? "button" : undefined}
              onClick={clickable ? () => onStep(i, s) : undefined}
              className={
                "flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left font-sans sm:flex-col sm:items-stretch sm:gap-2 " +
                (clickable
                  ? "cursor-pointer outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-0"
                  : "")
              }
            >
              <span className="flex items-center sm:w-full">
                <span
                  className="hidden h-0 flex-1 border-t sm:block"
                  style={{
                    borderColor: i === 0 ? "transparent" : i <= current ? "var(--color-primary)" : "var(--color-gray-2)",
                  }}
                  aria-hidden="true"
                />
                <span
                  className="relative flex size-[30px] flex-none items-center justify-center rounded-full font-semibold leading-none"
                  style={markStyle}
                  aria-hidden="true"
                >
                  {done ? (
                    <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                      <path d="M1.5 5.5L5 9.5L12.5 1.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className={"text-[13px] tabular-nums " + (active ? "" : "font-mono")}>{i + 1}</span>
                  )}
                </span>
                <span
                  className="hidden h-0 flex-1 border-t sm:block"
                  style={{
                    borderColor:
                      i === steps.length - 1 ? "transparent" : i < current ? "var(--color-primary)" : "var(--color-gray-2)",
                  }}
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0 sm:text-center">
                <p
                  className={
                    "m-0 text-sm leading-tight " +
                    (active ? "font-medium" : "font-normal") +
                    " " +
                    (done || active ? "text-secondary" : "text-text-muted")
                  }
                >
                  {label}
                </p>
                {meta && <p className="m-0 mt-1 text-xs text-text-muted">{meta}</p>}
              </span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The rail mechanic Timeline and ActivityFeed share: a 1px --color-gray-2 line centred behind a
 * 30px marker, stopping dead at the last item — "a trailing line reads as an event that failed to
 * render." A column, not a `border-l` on the `<li>`: a 30px marker needs a 30px-wide track to sit
 * on, where the old 7px dot could ride a bare edge.
 */
function RailMark({ last, markStyle, children }) {
  return (
    <span className="relative flex w-[30px] flex-none flex-col items-center">
      {!last && <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-2" aria-hidden="true" />}
      <span
        className="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5"
        style={markStyle}
        aria-hidden="true"
      >
        {children}
      </span>
    </span>
  );
}

/**
 * Timeline — dated events down a rail, newest first.
 */
export function Timeline({ items = [], className = "" }) {
  if (!items.length) return <p className="m-0 py-6 text-center text-sm text-text-muted">No events.</p>;
  return (
    <ol className={"m-0 flex list-none flex-col p-0 " + className}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <li key={it.key ?? i} className={"flex gap-3.5 " + (last ? "" : "pb-6")}>
            <RailMark last={last} markStyle={toneStyle(it.tone)}>
              {it.icon ?? <span className="size-1.5 rounded-full" style={{ background: "currentColor" }} />}
            </RailMark>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="m-0 text-[13px] font-medium leading-tight text-secondary">{it.title}</p>
                {it.meta && <span className="flex-none font-mono text-[11px] tabular-nums text-text-muted">{it.meta}</span>}
              </div>
              {it.body && <p className="m-0 mt-1 text-xs leading-[1.55] text-text-muted">{it.body}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * ActivityFeed — who did what, when.
 */
export function ActivityFeed({ items = [], className = "", onAttachment }) {
  if (!items.length) return <p className="m-0 py-6 text-center text-sm text-text-muted">No activity.</p>;
  return (
    <ul className={"m-0 flex list-none flex-col p-0 " + className}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <li key={it.key ?? i} className={"flex gap-3.5 " + (last ? "" : "pb-6")}>
            <RailMark last={last} markStyle={toneStyle(it.tone)}>
              <span className="font-sans text-[10px] font-bold leading-none">{(it.actor ?? "—").slice(0, 2).toUpperCase()}</span>
            </RailMark>
            <div className="min-w-0 flex-1 pt-1">
              <p className="m-0 text-[13px] font-normal leading-relaxed text-ink-soft">
                <span className="font-medium text-secondary">{it.actor}</span> {it.action}
                {it.object && (
                  <>
                    {" "}
                    <span className="font-mono">{it.object}</span>
                  </>
                )}
              </p>
              {/* THE NOTE — a note gets a plain surface of its own; a bare action gets no block at
                  all. No tail: Feed.dc.html draws none, and --accent (the old tail's tint) is gone. */}
              {it.body && (
                <p className="m-0 mt-1.5 w-fit max-w-[19rem] rounded-md bg-gray-1 px-[13px] py-[11px] text-xs leading-[1.6] text-ink-soft">
                  {it.body}
                </p>
              )}
              {/* THE ATTACHMENT — its own surface (--color-surface + --shadow-contact), not
                  gray-1: a note directly above it would otherwise fuse into one indistinct block. */}
              {it.attachment && (
                <div className="mt-1.5 flex w-fit max-w-full items-center gap-2.5 rounded-lg bg-surface px-3 py-2 shadow-contact">
                  <span className="grid size-8 flex-none place-items-center rounded-md bg-gray-1 text-text-muted" aria-hidden="true">
                    <svg width="13" height="15" viewBox="0 0 13 15">
                      <path d="M8 .5H2a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 2 14.5h9a1.5 1.5 0 0 0 1.5-1.5V5z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                      <path d="M8 .5V5h4.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-secondary">{it.attachment.name}</span>
                    {it.attachment.size && <span className="block font-mono text-[11px] text-text-muted">{it.attachment.size}</span>}
                  </span>
                  {onAttachment && (
                    <button
                      type="button"
                      onClick={() => onAttachment(it.attachment, it)}
                      aria-label={`Download ${it.attachment.name}`}
                      className="ml-1 flex-none cursor-pointer rounded-sm border-0 bg-transparent p-1 leading-none text-text-muted transition-colors outline-none hover:text-secondary focus-visible:ring focus-visible:ring-ring"
                    >
                      <svg width="13" height="14" viewBox="0 0 13 14" aria-hidden="true">
                        <path d="M6.5 0v9M3 5.8l3.5 3.5L10 5.8M.5 13.5h12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
              {it.meta && <p className="m-0 mt-1.5 font-mono text-[10px] tabular-nums text-text-muted">{it.meta}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
