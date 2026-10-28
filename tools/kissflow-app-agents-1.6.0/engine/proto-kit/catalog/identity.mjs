// identity.mjs — StatusChip · Avatar/AvatarStack · Breadcrumb.
//
// starter/lib/nav.json's "Identity" group, reproduced. Every snippet below is the HTML equivalent
// of the real component in starter/src/components/kit/ — transcribed from its actual className
// string, not re-invented, so a prototype and the built app produce the same DOM shape and the
// same computed styles under all three languages.

import { dedent } from "./_schema.mjs";

/** @type {import("./_schema.mjs").Entry[]} */
export default [
  {
    id: "status-chip",
    name: "StatusChip",
    category: "Identity",
    starterTwin: "kit/Chips.jsx",
    summary: "A status tone as a pill, with an optional signal dot.",
    blurb:
      "FIVE tones, not seven — REDESIGNED 2026-08-13 off Chips.dc.html. tokens.css's Foundations " +
      "rewrite names no `--tone-*` custom property any more, so there is nothing left for a " +
      "token-based chip to resolve; every tone below is a literal Tailwind stock-palette class " +
      "transcribed straight off Chips.jsx's own `TONES` object instead — `bg-emerald-50` / " +
      "`text-emerald-700` / `bg-emerald-500` for success, and the same fill/ink/dot triplet in " +
      "amber (warning), blue (info), rose (danger) and slate (neutral). Chips.jsx's own words: " +
      "\"Tones use Tailwind's own palette rather than a token of ours... and no Foundations entry " +
      "to keep in sync.\" `pending` and `strong` are DROPPED, not renamed — \"orange and near-black " +
      "are actions here, not statuses\" — an unrecognised tone now falls back to neutral rather " +
      "than rendering unstyled.",
    footer:
      "neutral is the one exception to the -50/-700/-500 pattern the other four tones share: it " +
      "reads slate-100/text-slate-700/bg-slate-400, one step darker across all three roles, " +
      "because slate-50 is close enough to white to all but disappear on the card surface. " +
      "Geometry is hardcoded literal Tailwind too, not the old `chip-shape`/`chip-dot` token " +
      "bundle — `h-7 gap-1.5 px-3 text-sm` for the pill and a `size-1.75` dot at the (default) md " +
      "size; `sm` drops to `h-6 gap-1.5 px-2.5 text-xs` and a `size-1.5` dot, off Tailwind's own " +
      "spacing scale rather than a hand-picked pixel value. Dot and icon are mutually exclusive — " +
      "icon wins if both are passed — and this renders a <span>, never a <button>: no hover state, " +
      "no focus ring, nothing to click. A caller that needs a clickable status wants Button or Tab, " +
      "not this.",
    bindings: [
      { field: "claim.status", type: "enum", example: '"approved"', note: "success · warning · info · danger · neutral — picks the tone. Closed set; anything else falls back to neutral." },
      { field: "claim.statusLabel", type: "string", example: '"Approved"', note: "the chip's text, not the raw enum value" },
    ],
    specimens: [
      {
        label: "every tone",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-emerald-50 text-emerald-700 h-7 gap-1.5 px-3 text-sm">
              <span class="flex-none rounded-full size-1.75 bg-emerald-500" aria-hidden="true"></span>
              success
            </span>
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-amber-50 text-amber-700 h-7 gap-1.5 px-3 text-sm">
              <span class="flex-none rounded-full size-1.75 bg-amber-500" aria-hidden="true"></span>
              warning
            </span>
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-blue-50 text-blue-700 h-7 gap-1.5 px-3 text-sm">
              <span class="flex-none rounded-full size-1.75 bg-blue-500" aria-hidden="true"></span>
              info
            </span>
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-rose-50 text-rose-700 h-7 gap-1.5 px-3 text-sm">
              <span class="flex-none rounded-full size-1.75 bg-rose-500" aria-hidden="true"></span>
              danger
            </span>
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-slate-100 text-slate-700 h-7 gap-1.5 px-3 text-sm">
              <span class="flex-none rounded-full size-1.75 bg-slate-400" aria-hidden="true"></span>
              neutral
            </span>
          </div>
        `),
      },
      {
        label: "dot={false} — the dot-less chip, for a caller that reads status from the label alone",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-emerald-50 text-emerald-700 h-7 gap-1.5 px-3 text-sm">success</span>
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-amber-50 text-amber-700 h-7 gap-1.5 px-3 text-sm">warning</span>
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-blue-50 text-blue-700 h-7 gap-1.5 px-3 text-sm">info</span>
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-rose-50 text-rose-700 h-7 gap-1.5 px-3 text-sm">danger</span>
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-slate-100 text-slate-700 h-7 gap-1.5 px-3 text-sm">neutral</span>
          </div>
        `),
      },
      {
        label: "in a sentence — chips are inline, not block",
        html: dedent(`
          <p class="m-0 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Claim CLM-4419 moved to
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-emerald-50 text-emerald-700 h-7 gap-1.5 px-3 text-sm">
              <span class="flex-none rounded-full size-1.75 bg-emerald-500" aria-hidden="true"></span>
              Approved
            </span>
            after two reviewers signed off; CLM-4420 is still
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-amber-50 text-amber-700 h-7 gap-1.5 px-3 text-sm">
              <span class="flex-none rounded-full size-1.75 bg-amber-500" aria-hidden="true"></span>
              At risk
            </span>.
          </p>
        `),
      },
    ],
  },

  {
    id: "avatar",
    name: "Avatar · AvatarStack",
    category: "Identity",
    starterTwin: "kit/Avatar.jsx",
    summary: "A person's initials in a tinted tile, always a circle.",
    blurb:
      "REDESIGNED 2026-08-13 from Avatar.dc.html — settles the three-way disagreement the old " +
      "entry here used to document (Beacon circle vs. Checkpoint rounded-square vs. Nimbus " +
      "absent): this app renders Beacon alone now, so there is one shape, a circle, " +
      "`--radius-avatar` (9999px, full). `size` is NEW — xs|sm|md|lg — and reads Tailwind's OWN " +
      "`size-6/8/10/14` scale directly rather than a custom `--avatar-size` token: 6/8/10/14 × the " +
      "4px `--spacing` base is 24/32/40/56px, and initials land on Tailwind's stock " +
      "`text-2xs/xs/sm/lg` (10/12/14/18px) for the same reason, no token needed. `md` (40px) is " +
      "the default, unchanged from before.",
    footer:
      "No tone (or tone=\"neutral\") is NOT \"no fill\" — it is an explicit neutral tile, " +
      "`bg-gray-1` fill / `text-secondary` ink, the honest default for a person with nothing " +
      "attached; an empty/transparent circle was never on the table. Four tinted tones beyond " +
      "that (success/warning/info/danger) read the SAME map Card and StatusChip do — " +
      "`var(--color-<tone>-bg)` / `var(--color-<tone>-ink)` — so an owner's tile can carry its " +
      "row's status colour exactly. `pending` and `strong` are GONE, not renamed: Foundations' " +
      "tone map never named either, so both now fall through to neutral. A missing name falls " +
      "back to an em dash, never an empty circle — \"an empty tile reads as a loading state that " +
      "never resolves.\" AvatarStack renders every tile fixed at `sm` (32px) with a quarter-tile " +
      "overlap (-9px, scaled from the doc's own -11px/40px ratio) and a 2px ring read through " +
      "Tailwind's own `ring-surface` utility, so a stack under a caller that overrides " +
      "`--color-surface` still looks right with no extra prop; `max` renders a \"+N\" overflow " +
      "tile in `bg-gray-1` / `text-text-muted` / `font-mono`.",
    bindings: [
      { field: "assignee.name", type: "string", example: '"R. Iyer"', note: 'derives initials — "R. Iyer" → RI, single word "Mary" → MA. No name renders an em dash, never an empty tile.' },
      { field: "assignee.initials", type: "string", example: '"KF"', note: "override the derivation, e.g. for a team rather than a person" },
      { field: "assignee.tone", type: "enum", example: '"danger"', note: 'success · warning · info · danger — the same map Card and StatusChip read. No tone (or "neutral") is an explicit neutral tile, not an absence. `pending`/`strong` are gone.' },
      { field: "size", type: "enum", example: '"lg"', note: 'xs · sm · md · lg — 24/32/40/56px tiles, initials scale with the tile and stay bold. "md" is the default.' },
    ],
    specimens: [
      {
        label: "every tone, plus the no-name fallback",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-3">
            <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none"
                  style="background: var(--color-danger-bg); color: var(--color-danger-ink)" title="R. Iyer" aria-label="R. Iyer">RI</span>
            <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none"
                  style="background: var(--color-success-bg); color: var(--color-success-ink)" title="M. Osei" aria-label="M. Osei">MO</span>
            <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none"
                  style="background: var(--color-warning-bg); color: var(--color-warning-ink)" title="T. Nakamura" aria-label="T. Nakamura">TN</span>
            <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none"
                  style="background: var(--color-info-bg); color: var(--color-info-ink)" title="A. Bianchi" aria-label="A. Bianchi">AB</span>
            <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                  title="D. Fischer" aria-label="D. Fischer">DF</span>
            <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary">—</span>
          </div>
        `),
      },
      {
        label: "four sizes — 24 in a table row, 32 in a list, 40 beside a name, 56 on a profile header",
        html: dedent(`
          <div class="flex items-end gap-4">
            <span class="size-6 text-2xs rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                  title="R. Iyer" aria-label="R. Iyer">RI</span>
            <span class="size-8 text-xs rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                  title="R. Iyer" aria-label="R. Iyer">RI</span>
            <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                  title="R. Iyer" aria-label="R. Iyer">RI</span>
            <span class="size-14 text-lg rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                  title="R. Iyer" aria-label="R. Iyer">RI</span>
          </div>
        `),
      },
      {
        label: "<AvatarStack/> — fixed at sm, a quarter-tile overlap and a max with a +N tile",
        html: dedent(`
          <span class="inline-flex items-center">
            <span style="margin-left: 0" class="inline-flex rounded-avatar ring-2 ring-surface">
              <span class="size-8 text-xs rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                    title="R. Iyer" aria-label="R. Iyer">RI</span>
            </span>
            <span style="margin-left: -9px" class="inline-flex rounded-avatar ring-2 ring-surface">
              <span class="size-8 text-xs rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                    title="S. Kaur" aria-label="S. Kaur">SK</span>
            </span>
            <span style="margin-left: -9px" class="inline-flex rounded-avatar ring-2 ring-surface">
              <span class="size-8 text-xs rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                    title="M. Osei" aria-label="M. Osei">MO</span>
            </span>
            <span style="margin-left: -9px" class="inline-flex rounded-avatar ring-2 ring-surface">
              <span class="size-8 text-xs rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                    title="T. Nakamura" aria-label="T. Nakamura">TN</span>
            </span>
            <span style="margin-left: -9px"
                  class="size-8 text-xs rounded-avatar inline-flex flex-none items-center justify-center bg-gray-1 text-text-muted font-mono font-semibold leading-none ring-2 ring-surface">+2</span>
          </span>
        `),
      },
      {
        label: "in a row, beside a name",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col gap-3 p-0">
            <li class="flex items-center gap-3">
              <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none"
                    style="background: var(--color-danger-bg); color: var(--color-danger-ink)" title="R. Iyer" aria-label="R. Iyer">RI</span>
              <span class="text-sm text-secondary">R. Iyer</span>
              <span class="text-xs text-text-muted">Assessor</span>
            </li>
            <li class="flex items-center gap-3">
              <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none bg-gray-1 text-secondary"
                    title="S. Kaur" aria-label="S. Kaur">SK</span>
              <span class="text-sm text-secondary">S. Kaur</span>
              <span class="text-xs text-text-muted">Approver</span>
            </li>
            <li class="flex items-center gap-3">
              <span class="size-10 text-sm rounded-avatar inline-flex flex-none items-center justify-center font-sans font-bold leading-none"
                    style="background: var(--color-success-bg); color: var(--color-success-ink)" title="M. Osei" aria-label="M. Osei">MO</span>
              <span class="text-sm text-secondary">M. Osei</span>
              <span class="text-xs text-text-muted">Engineer</span>
            </li>
          </ul>
        `),
      },
    ],
  },

  {
    id: "breadcrumb",
    name: "Breadcrumb",
    category: "Identity",
    starterTwin: "kit/Breadcrumb.jsx",
    summary: "An ancestor trail. Draws no navigation of any kind.",
    blurb:
      "[SOURCE] Breadcrumb.dc.html — REDESIGNED 2026-08-13. The old entry here explained that none " +
      "of the three retired languages named a breadcrumb at all, so every decision was [OURS]; " +
      "that is no longer true, Breadcrumb.dc.html is its own page now with an explicit " +
      "token-mapping table: an ancestor link is `--color-text-muted` / `text-xs` / no underline, " +
      "hovering to `--color-secondary`; the current page is `--color-secondary` / `font-semibold` " +
      "/ `aria-current=\"page\"` and never a link; the chevron-right separator and the NEW " +
      "ellipsis both read `--color-border` — \"the same weight as the separator, since it is one\"; " +
      "the trail gap is `gap-1.5`; a link's focus ring is `--color-ring` / `ring-2` / " +
      "`--radius-sm` — \"since the target is text.\"",
    footer:
      "`maxItems` and `homeIcon` are both NEW. `maxItems` collapses the MIDDLE, not a truncation " +
      "from one end — first item + ellipsis + last two, \"those are the ones people actually " +
      "click\" — and only fires once there's an actual middle to hide (more than 3 items); with " +
      "`maxItems={4}` and exactly 4 items there's nothing to collapse, so all four still render. " +
      "`homeIcon` draws a real Lucide house icon beside the FIRST item's label specifically, which " +
      "after a collapse is still index 0. The separator is a real Lucide `chevron-right` icon now, " +
      "not a hand-drawn SVG wedge — \"a text character shifts its weight and baseline with the " +
      "font, where an icon sits identically at any size.\" The leaf is still deliberately inert " +
      "regardless of href — the style guide's own page identity is a plain heading, so an " +
      "unclickable current-page item matches it, and it is the accessible behaviour regardless.",
    bindings: [
      { field: "claim.category", type: "string", example: '"Marine"', note: "an ancestor crumb, linked" },
      { field: "claim.id", type: "string", example: '"CLM-4417"', note: "the current page's leaf crumb — inert, aria-current=\"page\"" },
      { field: "maxItems", type: "number", example: "4", note: 'Past this many items, collapses the middle to a single "…" and keeps the first item plus the last two.' },
      { field: "homeIcon", type: "boolean", example: "true", note: "Draws a Lucide house icon beside the first item's label." },
    ],
    specimens: [
      {
        label: "with links, without links, and a single crumb",
        html: dedent(`
          <div class="flex flex-col gap-4">
            <nav aria-label="Breadcrumb">
              <ol class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
                <li class="flex items-center gap-1.5">
                  <a href="#" class="rounded-sm text-xs text-text-muted no-underline transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Warranty Claims</a>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <a href="#" class="rounded-sm text-xs text-text-muted no-underline transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Marine</a>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <span aria-current="page" class="text-xs font-semibold text-secondary">CLM-4417</span>
                </li>
              </ol>
            </nav>
            <nav aria-label="Breadcrumb">
              <ol class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
                <li class="flex items-center gap-1.5">
                  <span class="text-xs text-text-muted">Settings</span>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <span class="text-xs text-text-muted">Roles</span>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <span aria-current="page" class="text-xs font-semibold text-secondary">Approver</span>
                </li>
              </ol>
            </nav>
            <nav aria-label="Breadcrumb">
              <ol class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
                <li class="flex items-center gap-1.5">
                  <span aria-current="page" class="text-xs font-semibold text-secondary">Dashboard</span>
                </li>
              </ol>
            </nav>
          </div>
        `),
      },
      {
        label: "maxItems collapses the middle; homeIcon marks the first crumb",
        html: dedent(`
          <div class="flex flex-col gap-4">
            <nav aria-label="Breadcrumb">
              <ol class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
                <li class="flex items-center gap-1.5">
                  <a href="#" class="rounded-sm text-xs text-text-muted no-underline transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span class="inline-flex items-center gap-1">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none" aria-hidden="true">
                        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
                        <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      </svg>
                      Fleet
                    </span>
                  </a>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <span class="text-xs text-border">…</span>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <a href="#" class="rounded-sm text-xs text-text-muted no-underline transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Inspections</a>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <span aria-current="page" class="text-xs font-semibold text-secondary">INS-2291</span>
                </li>
              </ol>
            </nav>
            <nav aria-label="Breadcrumb">
              <ol class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
                <li class="flex items-center gap-1.5">
                  <span class="text-xs text-text-muted">Fleet</span>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <span class="text-xs text-text-muted">Marine</span>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <span class="text-xs text-text-muted">Vessels</span>
                </li>
                <li class="flex items-center gap-1.5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 flex-none text-border" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <span aria-current="page" class="text-xs font-semibold text-secondary">MV Trident</span>
                </li>
              </ol>
            </nav>
          </div>
        `),
      },
    ],
  },
];
