// process.mjs — Stepper · Timeline · ActivityFeed · ApprovalRow · WipStrip · KanbanBoard.
//
// starter/lib/nav.json's "Process" group, reproduced — its pages are "Process views", "KanbanBoard"
// and "Queue", and these are those entries. Every snippet below is the HTML equivalent of the real
// component in starter/src/components/kit/ — transcribed from its actual className string and
// inline style, not re-invented, so a prototype and the built app produce the same DOM shape and
// the same computed styles.
//
// ALL FOUR REDESIGNED 2026-08-13, off the same Claude Design project ("Mobile app style guide
// sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) that rewrote Buttons/Chips/Cards/Fields/TabStrip —
// Feed.dc.html, Queue.dc.html and Board.dc.html. Not one of them is a find/replace over the old
// `--tone-*` block: tokens.css's Foundations rewrite names no `--tone-*` custom property at all any
// more (its own banner), so there was nothing left to retint against, and each of the three source
// pages turns out to want a DIFFERENT real mechanism in that slot — not one shared tone system:
//   Feed       Timeline/ActivityFeed markers read var(--color-<tone>-bg/-ink) directly — the same
//              pair Card/Avatar/Callout read — and Feed.jsx's own banner FLAGS that this is no
//              longer the same red as a StatusChip: a `danger` marker and a `danger` chip agree in
//              spirit, not in hex, now that StatusChip moved to Tailwind's stock palette. Only four
//              tones carry a fill (success/warning/info/danger); neutral/unrecognised falls back to
//              gray-1/text-muted.
//   Queue      ApprovalRow's own status pill and outcome pill are built ON StatusChip, so they DO
//              carry StatusChip's literal Tailwind-stock-palette tones (bg-emerald-50/text-emerald-
//              700 and friends) — this is the one of the three that matches the chip system exactly,
//              because it composes the chip rather than drawing its own marker.
//   Board      a THIRD, unrelated stock-palette table (rose/amber/sky/emerald/slate/blue/violet/
//              teal/orange/indigo/gray), because a board's stage colour is picked per app and
//              Foundations' 5-member semantic map has no room for that — see KanbanBoard's own
//              footer below.
// Getting any one of the three mechanisms right and stopping there — the exact trap this file was
// in before this pass — leaves the other two silently wrong.
//
// ApprovalRow and WipStrip still arrived from the OTHER direction to everything else in this
// catalog: the old cookbook had both as recipes and the starter kit had neither, so they were built
// as real components first (kit/Queue.jsx) and transcribed back here, which is the same loop run in
// reverse. STEPPER remains the genuine gap the old cookbook never covered — "a fixed sequence with a
// current position" — and its `onStep` click-to-jump prop is new in this pass, not a rediscovery of
// something that was already there (Feed.jsx's own banner is explicit: Stepper had NO click-to-jump
// at all before this redesign).

import { dedent } from "./_schema.mjs";

/** @type {import("./_schema.mjs").Entry[]} */
export default [
  {
    id: "feed",
    name: "Stepper · Timeline · ActivityFeed",
    category: "Process",
    starterTwin: "kit/Feed.jsx",
    summary: "The three ways a process shows its shape.",
    blurb:
      "ONE entry rather than three, because they answer the same question at three scales and only " +
      "make sense compared. They are separate COMPONENTS for a reason that is easy to lose: a " +
      "Stepper is a CLOSED sequence with a current position — the steps are known in advance and " +
      "identical for every record, so it runs horizontally and the eye reads progress left to " +
      "right. A Timeline is an OPEN history — nobody knows how many events there will be, so it " +
      "runs vertically down a rail that simply keeps going. Fusing them, which the old cookbook " +
      "recipe did, forces the open case to pretend it has an end and the closed case to hide the " +
      "one thing it knows. ActivityFeed is the Timeline with an actor: same rail mechanic, a 30px " +
      "avatar instead of an icon marker, because \"who\" is the column the eye scans first. " +
      "REDESIGNED 2026-08-13 off Feed.dc.html: every marker grew from a 7px chip-dot riding a bare " +
      "`border-l` to a 30px tone-tinted circle sitting on its own rail column, and Stepper picked " +
      "up `onStep` — a step renders as a real `<button>` iff a caller passes one, exactly Card's " +
      "own opt-in `clickable` rule, and is otherwise exactly as inert as it always was.",
    footer:
      "Timeline and ActivityFeed's marker reads `var(--color-<tone>-bg)` / `var(--color-<tone>-ink)` " +
      "directly (Feed.jsx:65-69) — the SAME pair Card/Avatar/Callout read — and DELIBERATELY NOT the " +
      "tone map StatusChip reads: StatusChip's own 2026-08-13 port moved to literal Tailwind stock-" +
      "palette classes (bg-emerald-50/text-emerald-700 and friends), so a `danger` marker here and a " +
      "`danger` StatusChip are close but no longer the exact same red — Feed.jsx's own file banner " +
      "(lines 35-40) names this split on purpose, because Card/Avatar/Callout still agree with the " +
      "token pair 3-to-1. Only success/warning/info/danger carry a fill; neutral is not a member of " +
      "that set — an untoned or unrecognised tone falls back to `--color-gray-1`/`--color-text-" +
      "muted`, the same \"nothing to say\" pair Avatar's own untinted default reads. The rail itself " +
      "is a single 1px `--color-gray-2` line, centred behind a 30px marker column and stopping dead " +
      "at the last item — \"a trailing line reads as an event that failed to render\" (Feed.jsx:164-" +
      "168) — which replaces the old chip-dot-on-a-`border-l` anatomy entirely rather than retinting " +
      "it: a marker this size needs a track to sit on, not an edge to ride.",
    bindings: [
      {
        field: "steps",
        type: "array<{label,meta?}> | string[]",
        example: '{ label: "In repair", meta: "in progress" }',
        note: "Stepper: the closed sequence, in order. A bare string is accepted as a label with no meta.",
      },
      {
        field: "current",
        type: "number",
        example: "2",
        note: "Stepper: index of the step in progress. Done steps read --color-primary fill with a check (never the ticked-off number); ahead steps read --color-gray-1, muted, in mono; only the current step takes the +2px inset ring.",
      },
      {
        field: "onStep",
        type: "(index, step) => void",
        example: "(i, step) => setCurrent(i)",
        note: "NEW. Supplying it renders every step as a real <button> — click-to-jump. Omit it and a step is exactly as inert as it always was, same as Card's own opt-in clickable rule.",
      },
      {
        field: "items",
        type: "array<{title,meta,body?,tone?,icon?}>",
        example: '{ title: "Claim rejected by assessor", meta: "16 Jul · 14:22", tone: "danger" }',
        note: "Timeline: newest first. The 30px marker reads var(--color-<tone>-bg/-ink) — success · warning · info · danger only; neutral/unset/unrecognised falls back to gray-1/text-muted. Empty renders \"No events.\", never a blank list.",
      },
      {
        field: "items[].icon",
        type: "ReactNode",
        example: "<AlertTriangleIcon />",
        note: "Timeline only. Omit it and the marker falls back to a small currentColor dot — dot vs icon, never both, the same rule Callout uses.",
      },
      {
        field: "items[].body",
        type: "string",
        example: '"Seal replacement not covered under the extended warranty terms."',
        note: "Timeline only, optional — renders only when present.",
      },
      {
        field: "activity",
        type: "array<{actor,action,object?,tone?,meta,body?,attachment?}>",
        example: '{ actor: "R. Iyer", action: "rejected", object: "CLM-4417", meta: "16 Jul · 14:22", tone: "danger" }',
        note: "ActivityFeed: bold actor, then the sentence. The marker takes actor.slice(0,2), uppercased — \"R. Iyer\" reads \"R.\", punctuation included. Feed.jsx's own initials rule, not Avatar's first+last-letter one.",
      },
      {
        field: "activity[].object",
        type: "string",
        example: '"CLM-4417"',
        note: "An id/reference, set in mono — \"data, not prose.\" Additive: omit it and the sentence is exactly the plain action it always was.",
      },
      {
        field: "activity[].body",
        type: "string",
        example: '"Docking invoice attached — needs sign-off before Friday."',
        note: "The person's own words, in a plain --color-gray-1 block — no tail, no border. Renders only when present; a bare action gets no block at all.",
      },
      {
        field: "activity[].attachment",
        type: "{name,size?}",
        example: '{ name: "drydock-invoice.pdf", size: "1.2 MB" }',
        note: "A file row under the note, on its OWN surface (--color-surface + --shadow-contact) so it doesn't fuse into the identical gray note block above it.",
      },
      {
        field: "onAttachment",
        type: "(attachment, item) => void",
        example: "(file, item) => download(file)",
        note: "Supplying it adds the download control beside the file row. Omit it and the row is a label, not a promise the prototype can't keep.",
      },
    ],
    specimens: [
      {
        label: "Stepper, current={2} — a CLOSED sequence: horizontal above sm, stacked below, and only the current step takes the ring.",
        html: dedent(`
          <ol class="m-0 flex list-none flex-col gap-4 overflow-x-auto p-0 sm:flex-row sm:items-start">
            <li class="flex-1 sm:min-w-[7rem]">
              <div class="flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left font-sans sm:flex-col sm:items-stretch sm:gap-2">
                <span class="flex items-center sm:w-full">
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: transparent" aria-hidden="true"></span>
                  <span class="relative flex size-[30px] flex-none items-center justify-center rounded-full font-semibold leading-none" style="background: var(--color-primary); color: var(--color-surface)" aria-hidden="true">
                    <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                      <path d="M1.5 5.5L5 9.5L12.5 1.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                  </span>
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-primary)" aria-hidden="true"></span>
                </span>
                <span class="min-w-0 sm:text-center">
                  <p class="m-0 text-sm leading-tight font-normal text-secondary">Submitted</p>
                  <p class="m-0 mt-1 text-xs text-text-muted">12 Jul</p>
                </span>
              </div>
            </li>
            <li class="flex-1 sm:min-w-[7rem]">
              <div class="flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left font-sans sm:flex-col sm:items-stretch sm:gap-2">
                <span class="flex items-center sm:w-full">
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-primary)" aria-hidden="true"></span>
                  <span class="relative flex size-[30px] flex-none items-center justify-center rounded-full font-semibold leading-none" style="background: var(--color-primary); color: var(--color-surface)" aria-hidden="true">
                    <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                      <path d="M1.5 5.5L5 9.5L12.5 1.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                  </span>
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-primary)" aria-hidden="true"></span>
                </span>
                <span class="min-w-0 sm:text-center">
                  <p class="m-0 text-sm leading-tight font-normal text-secondary">Triage</p>
                  <p class="m-0 mt-1 text-xs text-text-muted">13 Jul</p>
                </span>
              </div>
            </li>
            <li class="flex-1 sm:min-w-[7rem]" aria-current="step">
              <div class="flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left font-sans sm:flex-col sm:items-stretch sm:gap-2">
                <span class="flex items-center sm:w-full">
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-primary)" aria-hidden="true"></span>
                  <span class="relative flex size-[30px] flex-none items-center justify-center rounded-full font-semibold leading-none" style="background: var(--color-primary-bg); color: var(--color-primary-ink); box-shadow: inset 0 0 0 2px var(--color-primary)" aria-hidden="true">
                    <span class="text-[13px] tabular-nums">3</span>
                  </span>
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-gray-2)" aria-hidden="true"></span>
                </span>
                <span class="min-w-0 sm:text-center">
                  <p class="m-0 text-sm leading-tight font-medium text-secondary">In repair</p>
                  <p class="m-0 mt-1 text-xs text-text-muted">in progress</p>
                </span>
              </div>
            </li>
            <li class="flex-1 sm:min-w-[7rem]">
              <div class="flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left font-sans sm:flex-col sm:items-stretch sm:gap-2">
                <span class="flex items-center sm:w-full">
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-gray-2)" aria-hidden="true"></span>
                  <span class="relative flex size-[30px] flex-none items-center justify-center rounded-full font-semibold leading-none" style="background: var(--color-gray-1); color: var(--color-text-muted)" aria-hidden="true">
                    <span class="text-[13px] tabular-nums font-mono">4</span>
                  </span>
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-gray-2)" aria-hidden="true"></span>
                </span>
                <span class="min-w-0 sm:text-center">
                  <p class="m-0 text-sm leading-tight font-normal text-text-muted">QA</p>
                </span>
              </div>
            </li>
            <li class="flex-1 sm:min-w-[7rem]">
              <div class="flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left font-sans sm:flex-col sm:items-stretch sm:gap-2">
                <span class="flex items-center sm:w-full">
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-gray-2)" aria-hidden="true"></span>
                  <span class="relative flex size-[30px] flex-none items-center justify-center rounded-full font-semibold leading-none" style="background: var(--color-gray-1); color: var(--color-text-muted)" aria-hidden="true">
                    <span class="text-[13px] tabular-nums font-mono">5</span>
                  </span>
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: transparent" aria-hidden="true"></span>
                </span>
                <span class="min-w-0 sm:text-center">
                  <p class="m-0 text-sm leading-tight font-normal text-text-muted">Closed</p>
                </span>
              </div>
            </li>
          </ol>
        `),
      },
      {
        label: "onStep — NEW: every step becomes a real click-to-jump button, the same opt-in rule Card's own `clickable` uses.",
        html: dedent(`
          <ol class="m-0 flex list-none flex-col gap-4 overflow-x-auto p-0 sm:flex-row sm:items-start">
            <li class="flex-1 sm:min-w-[7rem]">
              <button type="button" class="flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left font-sans sm:flex-col sm:items-stretch sm:gap-2 cursor-pointer outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-0">
                <span class="flex items-center sm:w-full">
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: transparent" aria-hidden="true"></span>
                  <span class="relative flex size-[30px] flex-none items-center justify-center rounded-full font-semibold leading-none" style="background: var(--color-primary); color: var(--color-surface)" aria-hidden="true">
                    <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                      <path d="M1.5 5.5L5 9.5L12.5 1.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                  </span>
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-primary)" aria-hidden="true"></span>
                </span>
                <span class="min-w-0 sm:text-center">
                  <p class="m-0 text-sm leading-tight font-normal text-secondary">Submitted</p>
                  <p class="m-0 mt-1 text-xs text-text-muted">12 Jul</p>
                </span>
              </button>
            </li>
            <li class="flex-1 sm:min-w-[7rem]" aria-current="step">
              <button type="button" class="flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left font-sans sm:flex-col sm:items-stretch sm:gap-2 cursor-pointer outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-0">
                <span class="flex items-center sm:w-full">
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-primary)" aria-hidden="true"></span>
                  <span class="relative flex size-[30px] flex-none items-center justify-center rounded-full font-semibold leading-none" style="background: var(--color-primary-bg); color: var(--color-primary-ink); box-shadow: inset 0 0 0 2px var(--color-primary)" aria-hidden="true">
                    <span class="text-[13px] tabular-nums">2</span>
                  </span>
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-gray-2)" aria-hidden="true"></span>
                </span>
                <span class="min-w-0 sm:text-center">
                  <p class="m-0 text-sm leading-tight font-medium text-secondary">Triage</p>
                  <p class="m-0 mt-1 text-xs text-text-muted">13 Jul</p>
                </span>
              </button>
            </li>
            <li class="flex-1 sm:min-w-[7rem]">
              <button type="button" class="flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left font-sans sm:flex-col sm:items-stretch sm:gap-2 cursor-pointer outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-0">
                <span class="flex items-center sm:w-full">
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-gray-2)" aria-hidden="true"></span>
                  <span class="relative flex size-[30px] flex-none items-center justify-center rounded-full font-semibold leading-none" style="background: var(--color-gray-1); color: var(--color-text-muted)" aria-hidden="true">
                    <span class="text-[13px] tabular-nums font-mono">3</span>
                  </span>
                  <span class="hidden h-0 flex-1 border-t sm:block" style="border-color: var(--color-gray-2)" aria-hidden="true"></span>
                </span>
                <span class="min-w-0 sm:text-center">
                  <p class="m-0 text-sm leading-tight font-normal text-text-muted">In repair</p>
                  <p class="m-0 mt-1 text-xs text-text-muted">in progress</p>
                </span>
              </button>
            </li>
          </ol>
        `),
      },
      {
        label: "Timeline — an OPEN history: a 30px tone-tinted marker on a rail that stops dead at the last event.",
        html: dedent(`
          <ol class="m-0 flex list-none flex-col p-0">
            <li class="flex gap-3.5 pb-6">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-2" aria-hidden="true"></span>
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-danger-bg); color: var(--color-danger-ink)" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M9 9l6 6M15 9l-6 6"></path>
                  </svg>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="m-0 text-[13px] font-medium leading-tight text-secondary">Claim rejected by assessor</p>
                  <span class="flex-none font-mono text-[11px] tabular-nums text-text-muted">16 Jul · 14:22</span>
                </div>
                <p class="m-0 mt-1 text-xs leading-[1.55] text-text-muted">Seal replacement not covered under the extended warranty terms.</p>
              </div>
            </li>
            <li class="flex gap-3.5 pb-6">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-2" aria-hidden="true"></span>
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-warning-bg); color: var(--color-warning-ink)" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3 2 20h20L12 3z"></path>
                    <path d="M12 10v5M12 17h.01"></path>
                  </svg>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="m-0 text-[13px] font-medium leading-tight text-secondary">Escalated to regional lead</p>
                  <span class="flex-none font-mono text-[11px] tabular-nums text-text-muted">15 Jul · 09:10</span>
                </div>
              </div>
            </li>
            <li class="flex gap-3.5 pb-6">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-2" aria-hidden="true"></span>
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-info-bg); color: var(--color-info-ink)" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 7 12 3 3 7l9 4 9-4z"></path>
                    <path d="M3 7v10l9 4 9-4V7"></path>
                    <path d="M12 11v10"></path>
                  </svg>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="m-0 text-[13px] font-medium leading-tight text-secondary">Parts ordered</p>
                  <span class="flex-none font-mono text-[11px] tabular-nums text-text-muted">13 Jul · 16:48</span>
                </div>
              </div>
            </li>
            <li class="flex gap-3.5">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-success-bg); color: var(--color-success-ink)" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 21V4"></path>
                    <path d="M5 4h13l-3 5 3 5H5"></path>
                  </svg>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="m-0 text-[13px] font-medium leading-tight text-secondary">Claim raised</p>
                  <span class="flex-none font-mono text-[11px] tabular-nums text-text-muted">12 Jul · 08:03</span>
                </div>
              </div>
            </li>
          </ol>
        `),
      },
      {
        label: "ActivityFeed — the marker takes the event's tone, same var(--color-<tone>-bg/-ink) pair Card/Avatar/Callout read.",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col p-0">
            <li class="flex gap-3.5 pb-6">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-2" aria-hidden="true"></span>
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-danger-bg); color: var(--color-danger-ink)" aria-hidden="true">
                  <span class="font-sans text-[10px] font-bold leading-none">R.</span>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <p class="m-0 text-[13px] font-normal leading-relaxed text-ink-soft">
                  <span class="font-medium text-secondary">R. Iyer</span> rejected <span class="font-mono">CLM-4417</span>
                </p>
                <p class="m-0 mt-1.5 font-mono text-[10px] tabular-nums text-text-muted">16 Jul · 14:22</p>
              </div>
            </li>
            <li class="flex gap-3.5 pb-6">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-2" aria-hidden="true"></span>
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-warning-bg); color: var(--color-warning-ink)" aria-hidden="true">
                  <span class="font-sans text-[10px] font-bold leading-none">S.</span>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <p class="m-0 text-[13px] font-normal leading-relaxed text-ink-soft">
                  <span class="font-medium text-secondary">S. Kaur</span> requested a second opinion
                </p>
                <p class="m-0 mt-1.5 font-mono text-[10px] tabular-nums text-text-muted">15 Jul · 09:10</p>
              </div>
            </li>
            <li class="flex gap-3.5 pb-6">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-2" aria-hidden="true"></span>
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-info-bg); color: var(--color-info-ink)" aria-hidden="true">
                  <span class="font-sans text-[10px] font-bold leading-none">M.</span>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <p class="m-0 text-[13px] font-normal leading-relaxed text-ink-soft">
                  <span class="font-medium text-secondary">M. Osei</span> attached the pressure-test report
                </p>
                <p class="m-0 mt-1.5 font-mono text-[10px] tabular-nums text-text-muted">13 Jul · 16:48</p>
              </div>
            </li>
            <li class="flex gap-3.5">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-success-bg); color: var(--color-success-ink)" aria-hidden="true">
                  <span class="font-sans text-[10px] font-bold leading-none">T.</span>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <p class="m-0 text-[13px] font-normal leading-relaxed text-ink-soft">
                  <span class="font-medium text-secondary">T. Nakamura</span> created <span class="font-mono">CLM-4417</span>
                </p>
                <p class="m-0 mt-1.5 font-mono text-[10px] tabular-nums text-text-muted">12 Jul · 08:03</p>
              </div>
            </li>
          </ul>
        `),
      },
      {
        label: "ActivityFeed with body + attachment — a conversation, not just an audit trail. The note is a plain gray-1 block, no tail; the attachment keeps its own surface.",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col p-0">
            <li class="flex gap-3.5 pb-6">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-2" aria-hidden="true"></span>
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-warning-bg); color: var(--color-warning-ink)" aria-hidden="true">
                  <span class="font-sans text-[10px] font-bold leading-none">S.</span>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <p class="m-0 text-[13px] font-normal leading-relaxed text-ink-soft">
                  <span class="font-medium text-secondary">S. Kaur</span> raised <span class="font-mono">CLM-4417</span>
                </p>
                <p class="m-0 mt-1.5 w-fit max-w-[19rem] rounded-md bg-gray-1 px-[13px] py-[11px] text-xs leading-[1.6] text-ink-soft">Docking invoice attached — needs sign-off before Friday.</p>
                <div class="mt-1.5 flex w-fit max-w-full items-center gap-2.5 rounded-lg bg-surface px-3 py-2 shadow-contact">
                  <span class="grid size-8 flex-none place-items-center rounded-md bg-gray-1 text-text-muted" aria-hidden="true">
                    <svg width="13" height="15" viewBox="0 0 13 15">
                      <path d="M8 .5H2a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 2 14.5h9a1.5 1.5 0 0 0 1.5-1.5V5z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path>
                      <path d="M8 .5V5h4.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path>
                    </svg>
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-xs font-semibold text-secondary">drydock-invoice.pdf</span>
                    <span class="block font-mono text-[11px] text-text-muted">1.2 MB</span>
                  </span>
                  <button type="button" aria-label="Download drydock-invoice.pdf" class="ml-1 flex-none cursor-pointer rounded-sm border-0 bg-transparent p-1 leading-none text-text-muted transition-colors outline-none hover:text-secondary focus-visible:ring focus-visible:ring-ring">
                    <svg width="13" height="14" viewBox="0 0 13 14" aria-hidden="true">
                      <path d="M6.5 0v9M3 5.8l3.5 3.5L10 5.8M.5 13.5h12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                  </button>
                </div>
                <p class="m-0 mt-1.5 font-mono text-[10px] tabular-nums text-text-muted">16 Jul · 10:15</p>
              </div>
            </li>
            <li class="flex gap-3.5 pb-6">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-2" aria-hidden="true"></span>
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-info-bg); color: var(--color-info-ink)" aria-hidden="true">
                  <span class="font-sans text-[10px] font-bold leading-none">M.</span>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <p class="m-0 text-[13px] font-normal leading-relaxed text-ink-soft">
                  <span class="font-medium text-secondary">M. Osei</span> replied
                </p>
                <p class="m-0 mt-1.5 w-fit max-w-[19rem] rounded-md bg-gray-1 px-[13px] py-[11px] text-xs leading-[1.6] text-ink-soft">Pressure test passed at 1.4× rated load. No further leak over a 48-hour hold.</p>
                <p class="m-0 mt-1.5 font-mono text-[10px] tabular-nums text-text-muted">16 Jul · 11:02</p>
              </div>
            </li>
            <li class="flex gap-3.5">
              <span class="relative flex w-[30px] flex-none flex-col items-center">
                <span class="relative z-[1] flex size-[30px] flex-none items-center justify-center rounded-full [&>svg]:size-3.5" style="background: var(--color-gray-1); color: var(--color-text-muted)" aria-hidden="true">
                  <span class="font-sans text-[10px] font-bold leading-none">R.</span>
                </span>
              </span>
              <div class="min-w-0 flex-1 pt-1">
                <p class="m-0 text-[13px] font-normal leading-relaxed text-ink-soft">
                  <span class="font-medium text-secondary">R. Iyer</span> assigned the claim to M. Osei
                </p>
                <p class="m-0 mt-1.5 font-mono text-[10px] tabular-nums text-text-muted">15 Jul · 09:10</p>
              </div>
            </li>
          </ul>
        `),
      },
    ],
  },

  {
    id: "approval-row",
    name: "ApprovalRow · ApprovalQueue",
    category: "Process",
    starterTwin: "kit/Queue.jsx",
    summary: "One item awaiting a decision — who, what, how long, and the two answers.",
    blurb:
      "This is the recipe the old cookbook called \"Approval queue row\", now a real component on " +
      "both sides. REDESIGNED 2026-08-13 off Queue.dc.html: the status chip and the new `decided` " +
      "outcome pill are both built ON StatusChip (Chips.jsx) rather than a hand-rolled badge, so a " +
      "row's colour and a register's status column agree by construction. `decided` is new — " +
      "\"approved\" | \"rejected\" | undefined — and does NOT remove or reorder the row: it drops to " +
      "opacity-60 and swaps the two buttons for a tone-tinted outcome chip (Check/success or X/" +
      "danger), \"so the person can see what they just did and the list does not jump under the " +
      "cursor mid-review.\"",
    footer:
      "WHOLE-ROW CLICK WAS THE BUG THIS PASS FIXED, not a feature it protects. The pre-migration row " +
      "made the ENTIRE row clickable whenever `onOpen` was supplied and then had to stopPropagation " +
      "out of the Approve/Reject group to survive its own click target sitting inside a bigger one — " +
      "exactly the anti-pattern this component's own \"not a table row\" argument warns against. " +
      "Queue.dc.html settles it the other way: `onOpen` now lives ONLY on the title, rendered as its " +
      "own reset <button>, never a wrapper around the row — a click anywhere else on the row does " +
      "nothing at all, and no stopPropagation exists anywhere in Queue.jsx any more (Queue.jsx:31-" +
      "40, 110-124). The row rule is `border-t border-gray-1 first:border-0` — a border-TOP, not the " +
      "old border-bottom — reusing the same --color-gray-1 divider Card/WipStrip already read " +
      "(Queue.jsx:103). A decided row keeps BOTH its own status chip (item.status) and the new " +
      "outcome chip at once — the outcome doesn't replace the status, it reports the decision made " +
      "about it.",
    bindings: [
      { field: "item.title", type: "string", example: '"Compressor seal failure"', note: "the row's subject line — truncates rather than wrapping, so a row is always one row" },
      { field: "item.meta", type: "string", example: '"CLM-4417 · Marine · ₹4,20,000"', note: "the reference line, in the data voice — id, category, value. Not prose." },
      { field: "item.owner", type: "string", example: '"R. Iyer"', note: "draws an Avatar in the row's tone; initials are first + last. Omit it and the row starts at the title." },
      { field: "item.tone", type: "enum", example: '"warning"', note: 'success · warning · info · danger · neutral (default). ONE tone drives the avatar, the status chip, and — when tone==="danger" — the age figure, together.' },
      { field: "item.status", type: "string", example: '"At risk"', note: "the chip's label" },
      { field: "item.age", type: "string", example: '"12d"', note: "how long it has waited, in the data voice — --color-danger-ink only when tone==\"danger\", --color-secondary otherwise. Hidden below sm — on a phone it is the first thing worth losing." },
      { field: "onApprove / onReject", type: "handler", example: "(item) => void", note: "each renders its button ONLY when supplied — no handler, no button, never a dead one" },
      { field: "onOpen", type: "handler", example: "(item) => void", note: "makes ONLY the title a real <button> — never the row. Approve/Reject sit beside it as separate targets, so a decision can never also navigate." },
      { field: "decided", type: '"approved" | "rejected"', example: '"approved"', note: "NEW. Swaps the two buttons for a tone-tinted outcome StatusChip and drops the row to opacity-60. Does NOT remove or reorder the row, and does not replace the item's own status chip — both render." },
      { field: "actionLabels", type: "{approve,reject}", example: '{ approve: "Grant", reject: "Decline" }', note: "the verbs belong to the domain: a claim is settled, a leave request is granted" },
      { field: "items / empty", type: "array / string", example: '[] / "Nothing waiting on you."', note: "ApprovalQueue only. It owns the length check so every caller does not write it slightly differently." },
    ],
    specimens: [
      {
        label: "a queue with both decisions wired — one tone per row drives the avatar and the status chip together",
        html: dedent(`
          <div class="flex flex-col">
            <div class="row-shape flex items-center gap-4 border-t border-gray-1 first:border-0 transition-colors hover:bg-row-hover">
              <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none" style="background: var(--color-warning-bg); color: var(--color-warning-ink)" title="R. Iyer" aria-label="R. Iyer">RI</span>
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-medium leading-snug text-foreground">Compressor seal failure</p>
                <p class="m-0 mt-0.5 truncate font-mono text-data tabular-nums text-meta-foreground">CLM-4417 · Marine · ₹4,20,000</p>
              </div>
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-amber-50 text-amber-700 h-7 gap-1.5 px-3 text-sm">
                <span class="flex-none rounded-full size-1.75 bg-amber-500" aria-hidden="true"></span>
                At risk
              </span>
              <span class="hidden flex-none font-mono text-[13px] tabular-nums text-secondary sm:inline">12d</span>
              <div class="flex flex-none items-center gap-2">
                <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-8 px-4 rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1 enabled:hover:!border-[var(--color-danger)] enabled:hover:!bg-[var(--color-danger-bg)] enabled:hover:!text-[var(--color-danger)]">Reject</button>
                <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-8 px-4 rounded-full text-xs font-bold border-0 text-white shadow-primary enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)] enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]" style="background-image: var(--gradient-primary)">Approve</button>
              </div>
            </div>
            <div class="row-shape flex items-center gap-4 border-t border-gray-1 first:border-0 transition-colors hover:bg-row-hover">
              <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary" title="S. Kaur" aria-label="S. Kaur">SK</span>
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-medium leading-snug text-foreground">Panel delamination</p>
                <p class="m-0 mt-0.5 truncate font-mono text-data tabular-nums text-meta-foreground">CLM-4418 · Aviation · ₹1,85,000</p>
              </div>
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-slate-100 text-slate-700 h-7 gap-1.5 px-3 text-sm">
                <span class="flex-none rounded-full size-1.75 bg-slate-400" aria-hidden="true"></span>
                Awaiting you
              </span>
              <span class="hidden flex-none font-mono text-[13px] tabular-nums text-secondary sm:inline">4d</span>
              <div class="flex flex-none items-center gap-2">
                <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-8 px-4 rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1 enabled:hover:!border-[var(--color-danger)] enabled:hover:!bg-[var(--color-danger-bg)] enabled:hover:!text-[var(--color-danger)]">Reject</button>
                <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-8 px-4 rounded-full text-xs font-bold border-0 text-white shadow-primary enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)] enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]" style="background-image: var(--gradient-primary)">Approve</button>
              </div>
            </div>
            <div class="row-shape flex items-center gap-4 border-t border-gray-1 first:border-0 transition-colors hover:bg-row-hover">
              <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none" style="background: var(--color-info-bg); color: var(--color-info-ink)" title="M. Osei" aria-label="M. Osei">MO</span>
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-medium leading-snug text-foreground">Coolant line leak</p>
                <p class="m-0 mt-0.5 truncate font-mono text-data tabular-nums text-meta-foreground">CLM-4419 · Energy · ₹62,000</p>
              </div>
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-blue-50 text-blue-700 h-7 gap-1.5 px-3 text-sm">
                <span class="flex-none rounded-full size-1.75 bg-blue-500" aria-hidden="true"></span>
                Under review
              </span>
              <span class="hidden flex-none font-mono text-[13px] tabular-nums text-secondary sm:inline">1d</span>
              <div class="flex flex-none items-center gap-2">
                <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-8 px-4 rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1 enabled:hover:!border-[var(--color-danger)] enabled:hover:!bg-[var(--color-danger-bg)] enabled:hover:!text-[var(--color-danger)]">Reject</button>
                <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-8 px-4 rounded-full text-xs font-bold border-0 text-white shadow-primary enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)] enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]" style="background-image: var(--gradient-primary)">Approve</button>
              </div>
            </div>
          </div>
        `),
      },
      {
        label: "decided — the row stays in place, dims, and swaps its buttons for a tone-tinted outcome chip (the item's own status chip still renders too)",
        html: dedent(`
          <div class="flex flex-col">
            <div class="row-shape flex items-center gap-4 border-t border-gray-1 first:border-0 transition-colors opacity-60">
              <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none" style="background: var(--color-warning-bg); color: var(--color-warning-ink)" title="R. Iyer" aria-label="R. Iyer">RI</span>
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-medium leading-snug text-foreground">Compressor seal failure</p>
                <p class="m-0 mt-0.5 truncate font-mono text-data tabular-nums text-meta-foreground">CLM-4417 · Marine · ₹4,20,000</p>
              </div>
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-amber-50 text-amber-700 h-7 gap-1.5 px-3 text-sm">
                <span class="flex-none rounded-full size-1.75 bg-amber-500" aria-hidden="true"></span>
                At risk
              </span>
              <span class="hidden flex-none font-mono text-[13px] tabular-nums text-secondary sm:inline">12d</span>
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-emerald-50 text-emerald-700 h-7 gap-1.5 px-3 text-sm flex-none">
                <span class="flex-none [&>svg]:size-3.5" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>
                Approved
              </span>
            </div>
            <div class="row-shape flex items-center gap-4 border-t border-gray-1 first:border-0 transition-colors opacity-60">
              <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary" title="S. Kaur" aria-label="S. Kaur">SK</span>
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-medium leading-snug text-foreground">Panel delamination</p>
                <p class="m-0 mt-0.5 truncate font-mono text-data tabular-nums text-meta-foreground">CLM-4418 · Aviation · ₹1,85,000</p>
              </div>
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-slate-100 text-slate-700 h-7 gap-1.5 px-3 text-sm">
                <span class="flex-none rounded-full size-1.75 bg-slate-400" aria-hidden="true"></span>
                Awaiting you
              </span>
              <span class="hidden flex-none font-mono text-[13px] tabular-nums text-secondary sm:inline">4d</span>
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-rose-50 text-rose-700 h-7 gap-1.5 px-3 text-sm flex-none">
                <span class="flex-none [&>svg]:size-3.5" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path>
                  </svg>
                </span>
                Rejected
              </span>
            </div>
          </div>
        `),
      },
      {
        label: "items={[]} — the empty queue is a sentence, not a blank card",
        html: dedent(`
          <p class="m-0 py-6 text-center text-sm text-muted-foreground">Nothing waiting on you.</p>
        `),
      },
      {
        label: "a single row, with the domain's own verbs",
        html: dedent(`
          <div class="flex flex-col">
            <div class="row-shape flex items-center gap-4 border-t border-gray-1 first:border-0 transition-colors hover:bg-row-hover">
              <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary" title="A. Bianchi" aria-label="A. Bianchi">AB</span>
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-medium leading-snug text-foreground">Annual leave — 14–21 Aug</p>
                <p class="m-0 mt-0.5 truncate font-mono text-data tabular-nums text-meta-foreground">LV-0219 · 6 working days</p>
              </div>
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-slate-100 text-slate-700 h-7 gap-1.5 px-3 text-sm">
                <span class="flex-none rounded-full size-1.75 bg-slate-400" aria-hidden="true"></span>
                Awaiting you
              </span>
              <span class="hidden flex-none font-mono text-[13px] tabular-nums text-secondary sm:inline">2d</span>
              <div class="flex flex-none items-center gap-2">
                <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-8 px-4 rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1 enabled:hover:!border-[var(--color-danger)] enabled:hover:!bg-[var(--color-danger-bg)] enabled:hover:!text-[var(--color-danger)]">Decline</button>
                <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-8 px-4 rounded-full text-xs font-bold border-0 text-white shadow-primary enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)] enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]" style="background-image: var(--gradient-primary)">Grant</button>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "wip-strip",
    name: "WipStrip",
    category: "Process",
    starterTwin: "kit/Queue.jsx",
    summary: "Per-stage counts against a cap — the band that leads a board page.",
    blurb:
      "The old cookbook's \"WIP strip\", now a component on both sides. REDESIGNED 2026-08-13 off " +
      "Queue.dc.html: the old freeform `alert` string (\"2 > 7d\") is GONE, replaced by a real " +
      "numeric `cap` — a stage over its own cap turns the count's ink AND its bar --color-danger and " +
      "shows the fraction, \"14/10\"; under or at cap it's just the raw count. ONE STRIP, NOT A GRID " +
      "OF CARDS: cells are joined with an inner --color-gray-1 left-border, none on the first — the " +
      "same seam Calendar.jsx's own grid cells use — so it wraps itself in `Card role=\"bare\"` " +
      "rather than each stage being its own shadow-panel Card in a gapped grid.",
    footer:
      "The aging note used to take the warning tone and never danger — that whole `alert` string is " +
      "retired. Over cap now drives BOTH the count's ink and the bar fill to --color-danger " +
      "together (Queue.jsx:225-227, 240-244); `tone` is a SEPARATE, independent axis that colours " +
      "only the small dot beside the label (Queue.jsx:200-204, 233-235) — a calm-toned stage can " +
      "still run over cap, and does in the first specimen below (In repair: tone=\"warning\", but " +
      "the count and bar go danger because 14 > 10, not because of the tone). `flex`, not the old " +
      "auto-fit grid: a strip that wraps to a second line breaks the shared-rule seam between " +
      "cells, so cells stay in one row and the strip scrolls instead, the same trade-off Table.jsx " +
      "makes for a wide table.",
    bindings: [
      { field: "stages", type: "array<{key,label,count,cap?,tone?}>", example: '{ key: "raise", label: "Raise", count: 4, cap: 6, tone: "info" }', note: "one cell per stage, in board order, joined in a single strip — inner --color-gray-1 rules between cells, none on the first" },
      { field: "stages[].cap", type: "number", example: "10", note: 'over cap: the count\'s ink AND the bar beneath it both switch to --color-danger, and the cap rides beside the count — "14/10". Under or at cap, just the raw count, no fraction shown.' },
      { field: "stages[].tone", type: "enum", example: '"warning"', note: "colours only the small dot beside the label. Independent of cap — the count/bar colour comes from cap alone, never from tone." },
    ],
    specimens: [
      {
        label: 'four stages, one of them over cap ("In repair", 14/10 — tone="warning" colours only the dot, not the overage)',
        bare: true,
        html: dedent(`
          <div class="bg-surface shadow-panel text-secondary rounded-xl flex overflow-x-auto">
            <div class="min-w-[9rem] flex-1 card-pad-metric">
              <p class="m-0 flex items-center gap-1.5 truncate text-kpi-label text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--color-info-dot, var(--color-text-muted))" aria-hidden="true"></span>
                Raise
              </p>
              <p class="m-0 font-mono text-[20px] font-semibold leading-none tabular-nums" style="margin-top: var(--kpi-gap, 12px)">4</p>
              <span class="mt-2.5 block h-bar w-full overflow-hidden rounded-bar bg-track">
                <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 66.66666666666666%; background: var(--color-text-subtle)"></span>
              </span>
            </div>
            <div class="min-w-[9rem] flex-1 card-pad-metric border-l border-gray-1">
              <p class="m-0 flex items-center gap-1.5 truncate text-kpi-label text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--color-info-dot, var(--color-text-muted))" aria-hidden="true"></span>
                Triage
              </p>
              <p class="m-0 font-mono text-[20px] font-semibold leading-none tabular-nums" style="margin-top: var(--kpi-gap, 12px)">9</p>
              <span class="mt-2.5 block h-bar w-full overflow-hidden rounded-bar bg-track">
                <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 90%; background: var(--color-text-subtle)"></span>
              </span>
            </div>
            <div class="min-w-[9rem] flex-1 card-pad-metric border-l border-gray-1">
              <p class="m-0 flex items-center gap-1.5 truncate text-kpi-label text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--color-warning-dot, var(--color-text-muted))" aria-hidden="true"></span>
                In repair
              </p>
              <p class="m-0 font-mono text-[20px] font-semibold leading-none tabular-nums" style="margin-top: var(--kpi-gap, 12px); color: var(--color-danger-ink)">14/10</p>
              <span class="mt-2.5 block h-bar w-full overflow-hidden rounded-bar bg-track">
                <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 100%; background: var(--color-danger)"></span>
              </span>
            </div>
            <div class="min-w-[9rem] flex-1 card-pad-metric border-l border-gray-1">
              <p class="m-0 flex items-center gap-1.5 truncate text-kpi-label text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--color-success-dot, var(--color-text-muted))" aria-hidden="true"></span>
                QA
              </p>
              <p class="m-0 font-mono text-[20px] font-semibold leading-none tabular-nums" style="margin-top: var(--kpi-gap, 12px)">2</p>
              <span class="mt-2.5 block h-bar w-full overflow-hidden rounded-bar bg-track">
                <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 25%; background: var(--color-text-subtle)"></span>
              </span>
            </div>
          </div>
        `),
      },
      {
        label: "same stages, caps raised well above every count — the strip is just counts, and reads as calm",
        bare: true,
        html: dedent(`
          <div class="bg-surface shadow-panel text-secondary rounded-xl flex overflow-x-auto">
            <div class="min-w-[9rem] flex-1 card-pad-metric">
              <p class="m-0 flex items-center gap-1.5 truncate text-kpi-label text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--color-info-dot, var(--color-text-muted))" aria-hidden="true"></span>
                Raise
              </p>
              <p class="m-0 font-mono text-[20px] font-semibold leading-none tabular-nums" style="margin-top: var(--kpi-gap, 12px)">4</p>
              <span class="mt-2.5 block h-bar w-full overflow-hidden rounded-bar bg-track">
                <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 20%; background: var(--color-text-subtle)"></span>
              </span>
            </div>
            <div class="min-w-[9rem] flex-1 card-pad-metric border-l border-gray-1">
              <p class="m-0 flex items-center gap-1.5 truncate text-kpi-label text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--color-info-dot, var(--color-text-muted))" aria-hidden="true"></span>
                Triage
              </p>
              <p class="m-0 font-mono text-[20px] font-semibold leading-none tabular-nums" style="margin-top: var(--kpi-gap, 12px)">9</p>
              <span class="mt-2.5 block h-bar w-full overflow-hidden rounded-bar bg-track">
                <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 45%; background: var(--color-text-subtle)"></span>
              </span>
            </div>
            <div class="min-w-[9rem] flex-1 card-pad-metric border-l border-gray-1">
              <p class="m-0 flex items-center gap-1.5 truncate text-kpi-label text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--color-warning-dot, var(--color-text-muted))" aria-hidden="true"></span>
                In repair
              </p>
              <p class="m-0 font-mono text-[20px] font-semibold leading-none tabular-nums" style="margin-top: var(--kpi-gap, 12px)">14</p>
              <span class="mt-2.5 block h-bar w-full overflow-hidden rounded-bar bg-track">
                <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 70%; background: var(--color-text-subtle)"></span>
              </span>
            </div>
            <div class="min-w-[9rem] flex-1 card-pad-metric border-l border-gray-1">
              <p class="m-0 flex items-center gap-1.5 truncate text-kpi-label text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--color-success-dot, var(--color-text-muted))" aria-hidden="true"></span>
                QA
              </p>
              <p class="m-0 font-mono text-[20px] font-semibold leading-none tabular-nums" style="margin-top: var(--kpi-gap, 12px)">2</p>
              <span class="mt-2.5 block h-bar w-full overflow-hidden rounded-bar bg-track">
                <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 10%; background: var(--color-text-subtle)"></span>
              </span>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "kanban",
    name: "KanbanBoard",
    category: "Process",
    starterTwin: "kit/Board.jsx",
    summary: "Columns of cards — each stage a tinted well, and only the cards inside it lift.",
    blurb:
      "[OURS] in all three languages the app has held. No design language declares a board; every " +
      "doc renders a dashboard or a register. REDESIGNED 2026-08-13 off Board.dc.html: \"each stage " +
      "is a tinted well in its own tone, so the board reads as stages at a glance — and the cards " +
      "inside it are the only objects that lift.\" The card is drawn INLINE rather than composed " +
      "from this kit's own Card — a geometry mismatch (14px padding / --shadow-contact, a role Cards." +
      "jsx doesn't name) as much as a tone mismatch — and the owner avatar uses a LOCAL `initials()` " +
      "and a stable name-hash tone, not Avatar.jsx's, because Avatar's Foundations tone vocabulary " +
      "(success/warning/info/danger) doesn't compose with a board's Tailwind-native one. " +
      "Presentational only: no drag, no drop, no reordering, and deliberately no grab cursor — \"a " +
      "board that looks draggable and is not is worse than one that plainly is not.\"",
    footer:
      "TONE VOCABULARY IS TAILWIND'S OWN, NOT FOUNDATIONS'. Every other tinted surface in this kit " +
      "(StatusChip, Card's own `tone`, StatTile's delta pill) reads Foundations' 5-member semantic " +
      "map (success/warning/info/danger/neutral). A board column can't: a stage's colour is picked " +
      "per app by whoever configures the board — could be 5 stages, could be 8 — and 5 semantic " +
      "tones doesn't have room for that, so column tone, priority-badge tone and owner-avatar tone " +
      "all resolve through an 11-name Tailwind palette lookup instead (Board.jsx:68-90), completely " +
      "unrelated to StatusChip's five. THE COLUMN IS NOT A CARD — still true, but satisfied " +
      "differently now: the old cookbook column was fill-less entirely (`rounded-lg bg-muted/60`); " +
      "this one IS tinted (`bg-<tone>-50`), and the separation from its white cards comes from tint-" +
      "vs-shadow rather than no-fill-at-all — \"white on a tint is the strongest card treatment " +
      "available and it costs nothing\" (Board.jsx:32-44). onCardClick's hover is a REAL lift now " +
      "(`hover:-translate-y-0.5 hover:shadow-raised`), not the old `hover:shadow-card-hover hover:" +
      "hover-rise` pair, both of which resolve to inert placeholders in tokens.css and were a no-op " +
      "hover the whole time.",
    bindings: [
      {
        field: "columns",
        type: "array<{key,label,tone?,items}>",
        example: '{ key: "repair", label: "In repair", tone: "amber" }',
        note: "tone: a Tailwind palette name (rose/amber/sky/emerald/slate/blue/violet/teal/orange/indigo/gray) — omitted or unrecognised tones cycle the palette by column index rather than flattening to one colour.",
      },
      {
        field: "columns[].items",
        type: "array<{id,title,note?,owner?,priority?,progress?,files?,comments?}>",
        example: '{ id: "CLM-4417", title: "Compressor seal failure", note: "12 days open", priority: "High" }',
        note: "The cards. An empty array is a real state — the column keeps its heading and shows \"Nothing here\".",
      },
      {
        field: "item.priority",
        type: "enum",
        example: '"High"',
        note: "High/Medium/Low, case-insensitive — drives the badge's OWN tone (rose/amber/blue), independent of the column's tone. Anything else falls back to slate.",
      },
      {
        field: "item.owner",
        type: "string",
        example: '"M. Osei"',
        note: "Drives both the avatar's initials (first + last letter, Board's own local rule) and its tone — a stable hash of the name, so one person reads as one colour across every card, independent of the row's status.",
      },
      {
        field: "item.progress",
        type: "number 0–100",
        example: "55",
        note: "A labelled bar. Value ink is --color-text-muted at 0%, --color-secondary in flight, and the Tailwind literal text-emerald-700 (not a token) at 100%.",
      },
      {
        field: "item.files / item.comments",
        type: "number",
        example: "2",
        note: "Footer pills, rendered only when > 0.",
      },
      {
        field: "onCardClick",
        type: "(item, column) => void",
        example: "(item, col) => open(item)",
        note: "Supplying it is the ONLY thing that makes a card respond — hover lift (-translate-y-0.5) + shadow-raised + pointer cursor. Without it every card stays fully inert, per Board.dc.html's own \"a panel that is not a target does not respond at all.\"",
      },
    ],
    specimens: [
      {
        label: "the five stages of a warranty claim — the column is a tinted well, only the items are cards, and the empty column keeps its heading",
        bare: true,
        // 2026-08-13 — outer <Card role="list"> wrapper restored. Board.jsx:130 wraps the whole
        // board in one — `bg-surface shadow-panel text-secondary rounded-xl card-pad-list` (role
        // "list" → 24px pad, no tone, no tint) — this specimen had only ever transcribed the
        // columns row inside it, missing entirely (found live: a generated prototype's kanban
        // board floated its columns directly on the page canvas, no white surface behind them at
        // all). "THE COLUMN IS NOT A CARD" in this file's own footer refers to each COLUMN not
        // being its own nested card, never to the board as a whole having no outer one.
        //
        // min-h-[600px] on the outer card — [OURS], on request, 2026-08-13. Also added to
        // Board.jsx (starter + engine/app-kit copies) directly, so the real component and this
        // specimen agree: a board with one short column no longer collapses to a cramped strip.
        html: dedent(`
          <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-list min-h-[600px]">
          <div class="flex gap-4 overflow-x-auto pb-2">
            <section class="flex w-[258px] flex-none flex-col gap-3 rounded-xl p-3.5 bg-sky-50">
              <header class="flex items-center justify-between gap-1 px-0.5">
                <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-sky-700">
                  <span class="h-[7px] w-[7px] flex-none rounded-full bg-sky-500" aria-hidden="true"></span>
                  <span class="truncate">Triage</span>
                </span>
                <span class="flex flex-none items-center gap-1.5 font-mono text-[11px] tabular-nums text-sky-700">
                  2
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </span>
              </header>
              <div class="flex flex-col gap-3">
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-rose-50 text-rose-700">High</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Intermittent power loss, unit 7</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">Marine · reported by ops</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-secondary">10%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full" style="width: 10%; background: var(--gradient-data)"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-violet-100 text-violet-700" title="R. Iyer" aria-label="R. Iyer">RI</span>
                    <div class="flex flex-none items-center gap-1.5">
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"></path>
                        </svg>
                        2
                      </span>
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>
                        </svg>
                        3
                      </span>
                    </div>
                  </div>
                </article>
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-blue-50 text-blue-700">Low</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Display backlight failure</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">Rail</p>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-emerald-100 text-emerald-700" title="S. Kaur" aria-label="S. Kaur">SK</span>
                    <div class="flex flex-none items-center gap-1.5"></div>
                  </div>
                </article>
              </div>
              <div class="flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium text-sky-700">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14"></path>
                  <path d="M12 5v14"></path>
                </svg>
                Add task
              </div>
            </section>

            <section class="flex w-[258px] flex-none flex-col gap-3 rounded-xl p-3.5 bg-amber-50">
              <header class="flex items-center justify-between gap-1 px-0.5">
                <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-amber-700">
                  <span class="h-[7px] w-[7px] flex-none rounded-full bg-amber-500" aria-hidden="true"></span>
                  <span class="truncate">In repair</span>
                </span>
                <span class="flex flex-none items-center gap-1.5 font-mono text-[11px] tabular-nums text-amber-700">
                  3
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </span>
              </header>
              <div class="flex flex-col gap-3">
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-rose-50 text-rose-700">High</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Compressor seal failure</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">12 days open</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-secondary">55%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full" style="width: 55%; background: var(--gradient-data)"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-blue-100 text-blue-700" title="M. Osei" aria-label="M. Osei">MO</span>
                    <div class="flex flex-none items-center gap-1.5">
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"></path>
                        </svg>
                        4
                      </span>
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>
                        </svg>
                        6
                      </span>
                    </div>
                  </div>
                </article>
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-amber-50 text-amber-700">Medium</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Firmware rollback</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">Awaiting parts, 9 days open</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-secondary">30%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full" style="width: 30%; background: var(--gradient-data)"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-amber-100 text-amber-700" title="T. Nakamura" aria-label="T. Nakamura">TN</span>
                    <div class="flex flex-none items-center gap-1.5">
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>
                        </svg>
                        1
                      </span>
                    </div>
                  </div>
                </article>
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-blue-50 text-blue-700">Low</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Bearing wear, unit 12</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">Scheduled, 6 days open</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-secondary">5%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full" style="width: 5%; background: var(--gradient-data)"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-sky-100 text-sky-700" title="A. Bianchi" aria-label="A. Bianchi">AB</span>
                    <div class="flex flex-none items-center gap-1.5"></div>
                  </div>
                </article>
              </div>
              <div class="flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium text-amber-700">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14"></path>
                  <path d="M12 5v14"></path>
                </svg>
                Add task
              </div>
            </section>

            <section class="flex w-[258px] flex-none flex-col gap-3 rounded-xl p-3.5 bg-rose-50">
              <header class="flex items-center justify-between gap-1 px-0.5">
                <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-rose-700">
                  <span class="h-[7px] w-[7px] flex-none rounded-full bg-rose-500" aria-hidden="true"></span>
                  <span class="truncate">QA</span>
                </span>
                <span class="flex flex-none items-center gap-1.5 font-mono text-[11px] tabular-nums text-rose-700">
                  1
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </span>
              </header>
              <div class="flex flex-col gap-3">
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-amber-50 text-amber-700">Medium</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Panel delamination</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">Re-test</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-secondary">80%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full" style="width: 80%; background: var(--gradient-data)"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-violet-100 text-violet-700" title="D. Fischer" aria-label="D. Fischer">DF</span>
                    <div class="flex flex-none items-center gap-1.5">
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"></path>
                        </svg>
                        1
                      </span>
                    </div>
                  </div>
                </article>
              </div>
              <div class="flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium text-rose-700">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14"></path>
                  <path d="M12 5v14"></path>
                </svg>
                Add task
              </div>
            </section>

            <section class="flex w-[258px] flex-none flex-col gap-3 rounded-xl p-3.5 bg-emerald-50">
              <header class="flex items-center justify-between gap-1 px-0.5">
                <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-emerald-700">
                  <span class="h-[7px] w-[7px] flex-none rounded-full bg-emerald-500" aria-hidden="true"></span>
                  <span class="truncate">Closed</span>
                </span>
                <span class="flex flex-none items-center gap-1.5 font-mono text-[11px] tabular-nums text-emerald-700">
                  1
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </span>
              </header>
              <div class="flex flex-col gap-3">
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact">
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Sensor calibration drift</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-emerald-700">100%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full bg-emerald-500" style="width: 100%"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-violet-100 text-violet-700" title="R. Iyer" aria-label="R. Iyer">RI</span>
                    <div class="flex flex-none items-center gap-1.5">
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"></path>
                        </svg>
                        3
                      </span>
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>
                        </svg>
                        5
                      </span>
                    </div>
                  </div>
                </article>
              </div>
              <div class="flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium text-emerald-700">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14"></path>
                  <path d="M12 5v14"></path>
                </svg>
                Add task
              </div>
            </section>

            <section class="flex w-[258px] flex-none flex-col gap-3 rounded-xl p-3.5 bg-slate-50">
              <header class="flex items-center justify-between gap-1 px-0.5">
                <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-slate-700">
                  <span class="h-[7px] w-[7px] flex-none rounded-full bg-slate-500" aria-hidden="true"></span>
                  <span class="truncate">Backlog</span>
                </span>
                <span class="flex flex-none items-center gap-1.5 font-mono text-[11px] tabular-nums text-slate-700">
                  0
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </span>
              </header>
              <p class="m-0 rounded-lg bg-white/60 px-4 py-8 text-center text-[13px] text-slate-700">Nothing here</p>
              <div class="flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium text-slate-700">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14"></path>
                  <path d="M12 5v14"></path>
                </svg>
                Add task
              </div>
            </section>
          </div>
          </section>
        `),
      },
      {
        label: "onCardClick — the same two columns with a real hover lift added to each card. The column itself gains nothing; a region is not a target.",
        bare: true,
        html: dedent(`
          <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-list min-h-[600px]">
          <div class="flex gap-4 overflow-x-auto pb-2">
            <section class="flex w-[258px] flex-none flex-col gap-3 rounded-xl p-3.5 bg-amber-50">
              <header class="flex items-center justify-between gap-1 px-0.5">
                <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-amber-700">
                  <span class="h-[7px] w-[7px] flex-none rounded-full bg-amber-500" aria-hidden="true"></span>
                  <span class="truncate">In repair</span>
                </span>
                <span class="flex flex-none items-center gap-1.5 font-mono text-[11px] tabular-nums text-amber-700">
                  3
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </span>
              </header>
              <div class="flex flex-col gap-3">
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact cursor-pointer transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-0.5 hover:shadow-raised">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-rose-50 text-rose-700">High</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Compressor seal failure</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">12 days open</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-secondary">55%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full" style="width: 55%; background: var(--gradient-data)"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-blue-100 text-blue-700" title="M. Osei" aria-label="M. Osei">MO</span>
                    <div class="flex flex-none items-center gap-1.5">
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"></path>
                        </svg>
                        4
                      </span>
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>
                        </svg>
                        6
                      </span>
                    </div>
                  </div>
                </article>
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact cursor-pointer transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-0.5 hover:shadow-raised">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-amber-50 text-amber-700">Medium</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Firmware rollback</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">Awaiting parts, 9 days open</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-secondary">30%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full" style="width: 30%; background: var(--gradient-data)"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-amber-100 text-amber-700" title="T. Nakamura" aria-label="T. Nakamura">TN</span>
                    <div class="flex flex-none items-center gap-1.5">
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>
                        </svg>
                        1
                      </span>
                    </div>
                  </div>
                </article>
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact cursor-pointer transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-0.5 hover:shadow-raised">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-blue-50 text-blue-700">Low</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Bearing wear, unit 12</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">Scheduled, 6 days open</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-secondary">5%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full" style="width: 5%; background: var(--gradient-data)"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-sky-100 text-sky-700" title="A. Bianchi" aria-label="A. Bianchi">AB</span>
                    <div class="flex flex-none items-center gap-1.5"></div>
                  </div>
                </article>
              </div>
              <div class="flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium text-amber-700">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14"></path>
                  <path d="M12 5v14"></path>
                </svg>
                Add task
              </div>
            </section>

            <section class="flex w-[258px] flex-none flex-col gap-3 rounded-xl p-3.5 bg-rose-50">
              <header class="flex items-center justify-between gap-1 px-0.5">
                <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-rose-700">
                  <span class="h-[7px] w-[7px] flex-none rounded-full bg-rose-500" aria-hidden="true"></span>
                  <span class="truncate">QA</span>
                </span>
                <span class="flex flex-none items-center gap-1.5 font-mono text-[11px] tabular-nums text-rose-700">
                  1
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </span>
              </header>
              <div class="flex flex-col gap-3">
                <article class="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact cursor-pointer transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-0.5 hover:shadow-raised">
                  <span class="inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium bg-amber-50 text-amber-700">Medium</span>
                  <p class="m-0 text-[13px] font-medium leading-[1.4] text-secondary">Panel delamination</p>
                  <p class="m-0 text-[11px] leading-[1.55] text-text-muted">Re-test</p>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] text-text-muted">Progress</span>
                      <span class="font-mono text-[11px] font-medium tabular-nums text-secondary">80%</span>
                    </div>
                    <div class="h-[5px] w-full overflow-hidden rounded-full bg-track">
                      <div class="h-full rounded-full" style="width: 80%; background: var(--gradient-data)"></div>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
                    <span class="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none bg-violet-100 text-violet-700" title="D. Fischer" aria-label="D. Fischer">DF</span>
                    <div class="flex flex-none items-center gap-1.5">
                      <span class="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"></path>
                        </svg>
                        1
                      </span>
                    </div>
                  </div>
                </article>
              </div>
              <div class="flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium text-rose-700">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14"></path>
                  <path d="M12 5v14"></path>
                </svg>
                Add task
              </div>
            </section>
          </div>
          </section>
        `),
      },
    ],
  },
];
