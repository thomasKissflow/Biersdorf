// surfaces.mjs — Card · Callout · Modal · Layout (PageHeader/Grid/Split/Bento) · Empty states.
//
// starter/lib/nav.json's "Surfaces" group, reproduced. Every snippet below is the HTML equivalent
// of the real component in starter/src/components/kit/ — transcribed from its actual className
// string, not re-invented, so a prototype and the built app produce the same DOM shape and the
// same computed styles under all three languages.
//
// FIVE OF THESE ARE NEW TO proto-kit (Modal, PageHeader, Grid, Split, Bento, NoAccess, Skeleton).
// See COMPONENT-GAPS.md — the cookbook documented `openPopup(html)` as a shell global but had no
// modal anatomy, and had no layout primitives at all: every recipe inlined its own grid classes.

import { dedent } from "./_schema.mjs";

/** @type {import("./_schema.mjs").Entry[]} */
export default [
  {
    id: "card",
    name: "Card",
    category: "Surfaces",
    starterTwin: "kit/Cards.jsx",
    summary: "The surface. role picks the padding for its content; tone tints the whole tile and drops the shadow.",
    blurb:
      "[SOURCE] Cards.dc.html, and the component its own padding ladder was transcribed for: " +
      "metric 20 / list 24 / doc 28, one role per kind of content — \"KPI and figure tiles\", " +
      "\"list and table cards\", \"long-form and documentation cards\". No border on any panel any " +
      "more, at any role: separation is `--shadow-panel` alone. " +
      "2026-08-13 — every specimen's own title reproduces CardTitle's markup, not a bare <h3>, so " +
      "this stays in lockstep with kit/Cards.jsx by construction: text-[15px] → text-lg, on " +
      "request (found live, DamWatch, reading as an afterthought beside a 22px gauge figure).",
    footer:
      "One surface, one way to separate it from `--color-canvas`: `--shadow-panel` — a 1px contact " +
      "layer plus a soft, wide lift — at `--radius-xl`. Nest a card inside another and it drops " +
      "that shadow for a flat `--color-gray-1` fill at the tighter `--radius-lg` instead, so two " +
      "panels never stack the same lift twice. Give it a tone and it drops the shadow for the same " +
      "reason — a tinted fill already separates itself from the canvas; `neutral` (or no tone) " +
      "keeps the plain white panel and its shadow, because gray-on-canvas has no fill to read. " +
      "Only `clickable` puts the shadow back to work, deepening it to `--shadow-raised` with a 2px " +
      "lift on hover — there is no border left to warm any more.",
    bindings: [
      { field: "role", type: "enum", example: '"doc"', note: '"metric" · "list" · "doc" — 20 / 24 / 28px, Cards.dc.html\'s own three. Defaults to "list".' },
      { field: "tone", type: "enum", example: '"primary"', note: "primary · success · warning · danger · info · neutral — tints the whole surface from that tone's -bg/-ink pair and drops --shadow-panel. neutral (or no tone) renders the plain white panel with its shadow instead." },
      { field: "clickable", type: "boolean", example: "true", note: "Opt-in. No edge left to warm any more, so the whole hover response is --shadow-panel deepening to --shadow-raised with a 2px lift." },
      { field: "nested", type: "boolean", example: "true", note: "A surface inside another surface: drops to a --color-gray-1 fill at --radius-lg instead of stacking a second shadow." },
    ],
    specimens: [
      {
        label: "the three padding roles",
        bare: true,
        html: dedent(`
          <div class="grid gap-4 lg:grid-cols-3">
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">metric — 20px</h3>
              <p class="m-0 text-sm text-text-muted">Dense. The number carries the card.</p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-list">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">list — 24px</h3>
              <p class="m-0 text-sm text-text-muted">Rows bring their own rhythm.</p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-doc">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">doc — 28px</h3>
              <p class="m-0 text-sm text-text-muted">Long-form text needs the air.</p>
            </section>
          </div>
        `),
      },
      {
        label: "nested — drops to a gray fill and the tighter radius, so it never stacks its own shadow on another card's",
        bare: true,
        html: dedent(`
          <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-doc">
            <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Outer</h3>
            <div class="grid gap-4 lg:grid-cols-2">
              <section class="bg-gray-1 shadow-flat text-secondary rounded-lg card-pad-metric">
                <p class="m-0 text-sm text-text-muted">nested — --color-gray-1 fill, --radius-lg, no shadow</p>
              </section>
              <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
                <p class="m-0 text-sm text-text-muted">not nested — still white + --shadow-panel + --radius-xl</p>
              </section>
            </div>
            <p class="m-0 mt-4 text-xs leading-relaxed text-text-muted">
              A shadow inside a shadow would just double the same lift, so a nested card trades it for a flat
              gray fill instead — visible on its own, and the only thing separating it from the white doc card
              holding it.
            </p>
          </section>
        `),
      },
      {
        label: "clickable — the only response left once there's no edge to warm",
        bare: true,
        html: dedent(`
          <div class="grid gap-4 lg:grid-cols-2">
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-list cursor-pointer transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:shadow-raised hover:-translate-y-0.5">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Clickable</h3>
              <p class="m-0 text-sm text-text-muted">
                Hover me. No border left to warm — the whole response is --shadow-panel deepening to
                --shadow-raised, with a 2px lift.
              </p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-list">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Static</h3>
              <p class="m-0 text-sm text-text-muted">Inert by default, deliberately.</p>
            </section>
          </div>
        `),
      },
      {
        label: "tone — a tinted tile drops the panel shadow; neutral is the one exception that keeps it",
        bare: true,
        html: dedent(`
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <section class="rounded-xl card-pad-metric bg-primary-bg text-primary-ink">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Primary</h3>
              <p class="m-0 text-sm">Active this cycle</p>
            </section>
            <section class="rounded-xl card-pad-metric bg-success-bg text-success-ink">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Success</h3>
              <p class="m-0 text-sm">Cleared review</p>
            </section>
            <section class="rounded-xl card-pad-metric bg-warning-bg text-warning-ink">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Warning</h3>
              <p class="m-0 text-sm">Ageing 3 days</p>
            </section>
            <section class="rounded-xl card-pad-metric bg-danger-bg text-danger-ink">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Danger</h3>
              <p class="m-0 text-sm">2 rejected</p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Neutral</h3>
              <p class="m-0 text-sm text-text-muted">Same as no tone — stays white, keeps the shadow</p>
            </section>
          </div>
        `),
      },
    ],
  },

  {
    id: "photo-card",
    name: "PhotoCard",
    category: "Surfaces",
    starterTwin: "kit/Cards.jsx",
    summary: "A directory tile for a thing you can photograph — and the honest alternative when you cannot.",
    blurb:
      "The old cookbook's \"Directory photo-card\", now a component on both sides. It is the ONE " +
      "place in either kit that renders an image, and that is why it is its own export rather " +
      "than a Card variant: a photograph is a surface no design language governs. Its colours are " +
      "the picture's, not the theme's, so it has to be fenced — a fixed-height, overflow-hidden " +
      "band at the top of the card, with everything below it back under the contract.",
    footer:
      "THE ICON VARIANT IS NOT A FALLBACK, it is the other half of the component, and the cookbook " +
      "said so first: photographs belong to photographable entities — a vessel, a building, a " +
      "person. A GL account, a policy, a config record has no photograph, and inventing stock " +
      "imagery for one is how a directory of abstractions ends up looking like a stock-photo " +
      "catalogue. NO SPECIMEN BELOW LOADS A PICTURE, on the same rule CustomEmbed states " +
      "outright: a catalog page should not reach the network. It is also why the empty band reads " +
      "`bg-track` and not `bg-gray-1` — a photo that hasn't loaded is a groove waiting to be filled, " +
      "the same role a chart's own track plays, not a generic quiet fill (that is Skeleton's role, " +
      "and Skeleton reads `bg-gray-1` for exactly that reason). The " +
      "card takes Card's `bare` role — no padding at all — because its first child bleeds to the " +
      "card's own corners; the body below supplies `card-pad-list` itself.",
    bindings: [
      { field: "image / alt", type: "string", example: '"…/vessel.jpg"', note: "the only <img> in the kit. Fenced into a fixed-height, overflow-hidden band: a photograph's colours are its own, not the theme's." },
      { field: "icon", type: "node", example: "<svg …>", note: "the other half of the component, NOT a fallback. Abstract entities — a GL account, a policy — have no photograph, and stock imagery for one turns a directory of abstractions into a stock-photo catalogue." },
      { field: "title / meta", type: "string", example: '"MV Northern Compass" / "Bulk carrier · Singapore"', note: "both truncate; a directory grid whose tiles are different heights is a directory nobody scans" },
      { field: "badge", type: "node", example: "<StatusChip tone=\"warning\">Survey due</StatusChip>", note: "sits over the band's top-right corner, usually a StatusChip" },
      { field: "stat", type: "{label,value,percent}", example: '{ label: "Utilisation", value: "86%", percent: 86 }', note: "a labelled figure, plus the bar if percent is given. Reads the same h-bar/rounded-bar/bg-track geometry every other bar in the kit does." },
      { field: "onClick", type: "() => void", example: "() => {}", note: "makes the whole card clickable through Card's own hover contract" },
    ],
    specimens: [
      {
        label: "icon variant + no-media variant — the catalog deliberately renders no photograph, see the note below",
        bare: true,
        html: dedent(`
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <section class="bg-surface shadow-panel text-secondary rounded-xl cursor-pointer transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:shadow-raised hover:-translate-y-0.5 overflow-hidden">
              <div class="relative h-36 bg-track">
                <span class="absolute inset-0 grid place-items-center text-text-muted" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
                    <rect x="0.75" y="0.75" width="24.5" height="24.5" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"></rect>
                    <path d="M6 17V9M13 17v-5M20 17v-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
                  </svg>
                </span>
                <span class="absolute right-3 top-3">
                  <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-emerald-50 text-emerald-700 h-7 gap-1.5 px-3 text-sm">
                    <span class="flex-none rounded-full size-1.75 bg-emerald-500" aria-hidden="true"></span>
                    Active
                  </span>
                </span>
              </div>
              <div class="card-pad-list">
                <p class="m-0 truncate font-display text-base font-semibold leading-tight tracking-tight text-secondary">4010 — Charter revenue</p>
                <p class="m-0 mt-0.5 truncate text-xs text-text-muted">GL account · Revenue</p>
                <p class="m-0 mt-3 flex items-center justify-between text-xs">
                  <span class="text-text-muted">Utilisation</span>
                  <span class="font-mono text-data font-semibold tabular-nums text-secondary">86%</span>
                </p>
                <span class="mt-1 block h-bar w-full overflow-hidden rounded-bar bg-track">
                  <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 86%; background: var(--gradient-data, var(--color-primary))"></span>
                </span>
              </div>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl cursor-pointer transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:shadow-raised hover:-translate-y-0.5 overflow-hidden">
              <div class="relative h-36 bg-track">
                <span class="absolute inset-0 grid place-items-center text-text-muted" aria-hidden="true">
                  <svg width="28" height="24" viewBox="0 0 28 24">
                    <rect x="0.75" y="0.75" width="26.5" height="22.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"></rect>
                    <path d="M1 17l7.5-7 6 5.5 4-3.5L27 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
                    <circle cx="9" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
                  </svg>
                </span>
                <span class="absolute right-3 top-3">
                  <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-amber-50 text-amber-700 h-7 gap-1.5 px-3 text-sm">
                    <span class="flex-none rounded-full size-1.75 bg-amber-500" aria-hidden="true"></span>
                    Survey due
                  </span>
                </span>
              </div>
              <div class="card-pad-list">
                <p class="m-0 truncate font-display text-base font-semibold leading-tight tracking-tight text-secondary">MV Northern Compass</p>
                <p class="m-0 mt-0.5 truncate text-xs text-text-muted">Bulk carrier · Singapore · IMO 9811000</p>
                <p class="m-0 mt-3 flex items-center justify-between text-xs">
                  <span class="text-text-muted">Utilisation</span>
                  <span class="font-mono text-data font-semibold tabular-nums text-secondary">62%</span>
                </p>
                <span class="mt-1 block h-bar w-full overflow-hidden rounded-bar bg-track">
                  <span class="block h-full rounded-bar transition-[width] duration-move" style="width: 62%; background: var(--gradient-data, var(--color-primary))"></span>
                </span>
              </div>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl overflow-hidden">
              <div class="relative h-36 bg-track">
                <span class="absolute inset-0 grid place-items-center text-text-muted" aria-hidden="true">
                  <svg width="28" height="24" viewBox="0 0 28 24">
                    <rect x="0.75" y="0.75" width="26.5" height="22.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"></rect>
                    <path d="M1 17l7.5-7 6 5.5 4-3.5L27 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
                    <circle cx="9" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
                  </svg>
                </span>
              </div>
              <div class="card-pad-list">
                <p class="m-0 truncate font-display text-base font-semibold leading-tight tracking-tight text-secondary">Policy WC-11</p>
                <p class="m-0 mt-0.5 truncate text-xs text-text-muted">Warranty terms · v4</p>
              </div>
            </section>
          </div>
        `),
      },
    ],
  },

  {
    id: "callout",
    name: "Callout",
    category: "Surfaces",
    starterTwin: "kit/Callout.jsx",
    summary: "A full-width tinted message. Same tone map as the chip, at a card's density.",
    blurb:
      "[SOURCE] Callout.dc.html — composed, not transcribed, and it says so itself: \"the style " +
      "guide declares no callout... but every value is a token something else already declares.\" " +
      "The tone map is StatusChip's, the padding/radius ladder is Cards'. If Foundations ever draws " +
      "a callout directly, expect the geometry to move and the palette not to. NO NEUTRAL TONE: " +
      "\"a gray tinted box on a white card is just a card, so use one\" — a Callout that wants to " +
      "be neutral should be a Card instead.",
    footer:
      "One deliberate exception to the rest of the language: every tone here keeps a 1px edge in " +
      "its own `--color-<tone>-dot`, always — \"the tint alone is too quiet on a white page.\" " +
      "Nowhere else in Beacon draws a border any more; this is the one surface that still needs " +
      "one. `color` is set once, on the outer element, to the tone's ink — title, body and the " +
      "dismiss button all inherit it via `currentColor` rather than each re-declaring a text " +
      "colour. `icon` REPLACES the dot entirely when passed, never both at once.",
    bindings: [
      { field: "tone", type: "enum", example: '"danger"', note: '"success" | "warning" | "info" | "danger" — four, not five. Default "info".' },
      { field: "title", type: "string", example: '"Rejected"', note: "bold first line. Optional — a one-line callout usually needs none." },
      { field: "onDismiss", type: "() => void", example: "() => {}", note: "supplying it renders the close control" },
      { field: "icon", type: "node", example: "<svg …>", note: "replaces the dot entirely at size-4, drawn in currentColor. Never both together." },
      { field: "compact", type: "boolean", example: "true", note: "p-4 · --radius-md instead of p-6 · --radius-lg — for inside a form or card" },
    ],
    specimens: [
      {
        label: "every tone — the dot is the chip's own dot, at the callout's scale",
        bare: true,
        html: dedent(`
          <div class="flex flex-col gap-3">
            <div role="status" class="rounded-lg p-6 bg-info-bg text-info-ink border border-solid border-info-dot">
              <div class="flex items-start gap-3">
                <span class="mt-1.5 size-1.75 flex-none rounded-full bg-info-dot" aria-hidden="true"></span>
                <div class="min-w-0 flex-1">
                  <p class="m-0 mb-1 text-sm font-bold leading-tight">Scheduled maintenance</p>
                  <div class="text-sm leading-relaxed">The claims API is read-only between 02:00 and 04:00 UTC on Sunday.</div>
                </div>
              </div>
            </div>
            <div role="status" class="rounded-lg p-6 bg-success-bg text-success-ink border border-solid border-success-dot">
              <div class="flex items-start gap-3">
                <span class="mt-1.5 size-1.75 flex-none rounded-full bg-success-dot" aria-hidden="true"></span>
                <div class="min-w-0 flex-1">
                  <p class="m-0 mb-1 text-sm font-bold leading-tight">Approved</p>
                  <div class="text-sm leading-relaxed">CLM-4419 cleared both reviewers and moved to settlement.</div>
                </div>
              </div>
            </div>
            <div role="status" class="rounded-lg p-6 bg-warning-bg text-warning-ink border border-solid border-warning-dot">
              <div class="flex items-start gap-3">
                <span class="mt-1.5 size-1.75 flex-none rounded-full bg-warning-dot" aria-hidden="true"></span>
                <div class="min-w-0 flex-1">
                  <p class="m-0 mb-1 text-sm font-bold leading-tight">Ageing</p>
                  <div class="text-sm leading-relaxed">Four claims have been open longer than the 10-day target.</div>
                </div>
              </div>
            </div>
            <div role="alert" class="rounded-lg p-6 bg-danger-bg text-danger-ink border border-solid border-danger">
              <div class="flex items-start gap-3">
                <span class="mt-1.5 size-1.75 flex-none rounded-full bg-danger" aria-hidden="true"></span>
                <div class="min-w-0 flex-1">
                  <p class="m-0 mb-1 text-sm font-bold leading-tight">Rejected</p>
                  <div class="text-sm leading-relaxed">CLM-4417 was returned by the assessor. A reason is required before it can be resubmitted.</div>
                </div>
                <button type="button" aria-label="Dismiss"
                        class="-mr-1 -mt-1 flex-none cursor-pointer rounded-sm border-0 bg-transparent p-1 leading-none text-inherit opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring focus-visible:ring-ring">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `),
      },
      {
        label: "icon instead of the dot, and compact — inside a form or card",
        bare: true,
        html: dedent(`
          <div class="flex flex-col gap-3">
            <div role="status" class="rounded-lg p-6 bg-info-bg text-info-ink border border-solid border-info-dot">
              <div class="flex items-start gap-3">
                <span class="mt-0.5 flex-none [&>svg]:size-4" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 16v-4M12 8h.01"></path>
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="text-sm leading-relaxed">Rollover data is spent before the new allowance.</div>
                </div>
              </div>
            </div>
            <div role="status" class="rounded-md p-4 bg-warning-bg text-warning-ink border border-solid border-warning-dot">
              <div class="flex items-start gap-3">
                <span class="mt-1.5 size-1.75 flex-none rounded-full bg-warning-dot" aria-hidden="true"></span>
                <div class="min-w-0 flex-1">
                  <div class="text-sm leading-relaxed">Two fields need attention before you can submit.</div>
                </div>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "modal",
    name: "Modal",
    category: "Surfaces",
    starterTwin: "kit/Overlay.jsx",
    summary: "A dialog over the page. Traps focus, locks scroll, and returns focus to its trigger on close.",
    blurb:
      "[SOURCE] Overlay.dc.html: a dialog centred over a `--color-scrim`, `--radius-lg` and " +
      "`--shadow-overlay`, no border. It traps focus, locks the page behind it from scrolling, and " +
      "hands focus back to whatever opened it on close.",
    footer:
      "No border: the source doc states it outright — \"no border on a modal; a sheet takes one on " +
      "its inner edge\" — so the panel is `shadow-overlay` alone. The destructive action in a " +
      "confirm dialog is the one place a tone appears at full strength on a button — `--color-danger`, " +
      "solid, not the tint — \"because the tint would read as a status rather than an action.\" " +
      "That's Buttons.jsx's `tone=\"danger\"`, reached for here in the footer with dismiss to its left.",
    bindings: [
      { field: "open", type: "boolean", example: "true", note: "prototype: toggle the wrapper's `hidden` class" },
      { field: "onClose", type: "() => void", example: "() => {}", note: "also bound to Escape and to clicking the scrim" },
      { field: "title", type: "string", example: '"Reject CLM-4417?"', note: "renders the header and the close control" },
      { field: "footer", type: "node", example: "<ButtonRow>…</ButtonRow>", note: "sits below a --color-gray-2 rule" },
      { field: "width", type: "string", example: '"34rem"', note: "capped at 100%" },
    ],
    specimens: [
      {
        label: "open it — Escape, the scrim, and the close button all dismiss",
        bare: true,
        html: dedent(`
          <div class="relative h-[360px] overflow-hidden rounded-lg">
            <div class="absolute left-6 top-6 max-w-xs">
              <button type="button"
                      class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-0 text-white shadow-primary enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)] enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]"
                      style="background-image: var(--gradient-primary)">
                Reject claim
              </button>
              <p class="m-0 mt-4 text-xs leading-relaxed text-text-muted">
                Escape, the scrim, or the close button all dismiss it. Tab wraps inside the panel rather
                than escaping to the page behind.
              </p>
            </div>
            <div class="absolute inset-0 flex items-center justify-center p-6">
              <div class="absolute inset-0 bg-scrim"></div>
              <div role="dialog" aria-modal="true" aria-label="Reject CLM-4417?" tabindex="-1"
                   style="width: 34rem; max-width: 100%"
                   class="relative max-h-full overflow-auto outline-none rounded-lg shadow-overlay p-7 bg-surface text-secondary">
                <div class="mb-4 flex items-start justify-between gap-4">
                  <h2 class="m-0 font-display text-lg font-semibold leading-tight tracking-tight">Reject CLM-4417?</h2>
                  <button type="button" aria-label="Close"
                          class="grid h-8 w-8 flex-none place-items-center rounded-sm border-0 bg-transparent leading-none text-text-muted transition-colors hover:bg-gray-1 hover:text-secondary focus-visible:outline-none focus-visible:ring focus-visible:ring-ring">
                    <svg width="12" height="12" viewBox="0 0 11 11" aria-hidden="true">
                      <path d="M1 1l9 9M10 1l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    </svg>
                  </button>
                </div>
                <div class="text-sm leading-relaxed">
                  This returns the claim to R. Iyer with your note attached. It cannot be undone from here — the
                  claim has to be resubmitted before it can be assessed again.
                </div>
                <div class="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-gray-2 pt-4">
                  <button type="button"
                          class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">
                    Cancel
                  </button>
                  <button type="button"
                          class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-0 text-white shadow-none enabled:active:translate-y-px"
                          style="background: var(--color-danger)">
                    Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "page-header",
    name: "PageHeader",
    category: "Surfaces",
    starterTwin: "kit/Layout.jsx",
    summary: "Breadcrumb, title, optional subtitle, optional actions, optional stat row.",
    blurb:
      "The least token-hungry components in the set, and that is the point of writing them down: a " +
      "layout primitive should consume spacing and nothing else. No language declares a page " +
      "header, and none should — a column count or a title size is not a design-language decision. " +
      "`breadcrumb` is a slot, not a rendered Breadcrumb, so PageHeader doesn't couple to that " +
      "file's own in-flight migration.",
    footer:
      "PageHeader is the one layout primitive that takes `on-canvas`, because a page title sits on " +
      "the ground rather than inside a card — under a translucent language that means a plate " +
      "crossing whatever sits behind it, same reasoning as the catalog chrome itself. `stats` sits " +
      "on a `--color-gray-3` rule, one step stronger than a row divider, the same weight Separator " +
      "and Table's own header rule read.",
    bindings: [
      { field: "breadcrumb", type: "node", example: "<Breadcrumb …/>", note: "a slot, not a rendered Breadcrumb" },
      { field: "title", type: "string", example: '"Warranty Claims"', note: "27px/500/-.028em — this page's own addition to the type scale" },
      { field: "subtitle", type: "string", example: '"Every claim raised in the last 90 days…"', note: "capped at 2xl so a long one wraps rather than spanning the page" },
      { field: "actions", type: "node", example: "<Button rank=\"strong\">New claim</Button>", note: "right-aligned, wraps below on narrow viewports. At most one primary." },
      { field: "stats", type: "[{label,value}]", example: '[{ label: "Open", value: "24" }]', note: "a section-level row on a --color-gray-3 rule" },
    ],
    specimens: [
      {
        label: "with actions",
        bare: true,
        html: dedent(`
          <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-doc">
            <header class="mb-6 flex flex-col gap-4">
              <div class="flex flex-wrap items-end justify-between gap-4">
                <div class="min-w-0">
                  <h1 class="on-canvas m-0 font-display text-[27px] font-medium leading-tight tracking-[-.028em] text-secondary">Warranty Claims</h1>
                  <p class="on-canvas m-0 mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">Every claim raised in the last 90 days, across all service centres.</p>
                </div>
                <div class="flex flex-none flex-wrap items-center gap-2.5">
                  <button type="button"
                          class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">
                    Export
                  </button>
                  <button type="button"
                          class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-0 bg-secondary text-white shadow-button enabled:hover:bg-secondary-hover enabled:hover:shadow-[0_10px_22px_-8px_rgba(10,10,11,.55)] enabled:active:bg-black enabled:active:translate-y-px">
                    New claim
                  </button>
                </div>
              </div>
            </header>
          </section>
        `),
      },
      {
        label: "with breadcrumb and a stat row",
        bare: true,
        html: dedent(`
          <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-doc">
            <header class="mb-6 flex flex-col gap-4">
              <div class="flex flex-wrap items-end justify-between gap-4">
                <div class="min-w-0">
                  <div class="on-canvas mb-1.5">
                    <span class="text-2xs text-text-subtle">Service centres <span class="text-secondary">/ Warranty Claims</span></span>
                  </div>
                  <h1 class="on-canvas m-0 font-display text-[27px] font-medium leading-tight tracking-[-.028em] text-secondary">Warranty Claims</h1>
                  <p class="on-canvas m-0 mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">Every claim raised in the last 90 days, across all service centres.</p>
                </div>
                <div class="flex flex-none flex-wrap items-center gap-2.5">
                  <button type="button"
                          class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-0 bg-secondary text-white shadow-button enabled:hover:bg-secondary-hover enabled:hover:shadow-[0_10px_22px_-8px_rgba(10,10,11,.55)] enabled:active:bg-black enabled:active:translate-y-px">
                    New claim
                  </button>
                </div>
              </div>
              <div class="flex flex-wrap items-baseline gap-6 border-t border-gray-3 pt-4">
                <div class="flex items-baseline gap-1.5">
                  <span class="font-display text-sm font-semibold text-secondary">24</span>
                  <span class="text-xs text-text-muted">Open</span>
                </div>
                <div class="flex items-baseline gap-1.5">
                  <span class="font-display text-sm font-semibold text-secondary">3</span>
                  <span class="text-xs text-text-muted">Overdue</span>
                </div>
                <div class="flex items-baseline gap-1.5">
                  <span class="font-display text-sm font-semibold text-secondary">58</span>
                  <span class="text-xs text-text-muted">Closed this month</span>
                </div>
              </div>
            </header>
          </section>
        `),
      },
    ],
  },

  {
    id: "layout-primitives",
    name: "Grid · Split · Bento",
    category: "Surfaces",
    starterTwin: "kit/Layout.jsx",
    summary: "The three composition primitives every page is assembled from.",
    blurb:
      "NEW TO proto-kit. The cookbook inlined grid classes into each individual recipe, so the " +
      "master-detail recipe was one fused composition rather than a reusable split. These are the " +
      "primitives the built app composes with.",
    footer:
      "`cols` is a MAXIMUM, not a fixed count — 1 below sm, 2 below lg, then `cols` — and the " +
      "responsive steps are hard-coded rather than accepted as a prop, so every grid in the app " +
      "breaks at the same two places, which is what makes a page read as one page. `Split`'s rail " +
      "is `lg:` only; below that it stacks BELOW the main content rather than above it, because a " +
      "rail is secondary by definition. `Bento` admits exactly three spans (`2x1` · `1x2` · " +
      "`2x2`) — a bento with arbitrary spans stops being a layout and becomes a canvas.",
    bindings: [
      { field: "cols", type: "enum", example: "4", note: "2 · 3 · 4 · 6 — Grid/Bento column count at the widest breakpoint. Grid defaults to 3, Bento to 4." },
      { field: "gap", type: "string", example: '"gap-3.5"', note: 'any spacing utility — defaults to "gap-3.5", the shell\'s own 14px panel-to-panel rhythm' },
      { field: "railWidth", type: "length", example: '"18rem"', note: "Split's fixed side column, the default" },
      { field: "side", type: "enum", example: '"right"', note: '"left" | "right" — which side Split\'s rail sits on. Default "right".' },
      { field: "span", type: "enum", example: '"2x2"', note: 'on Bento.Item — "1x1" | "2x1" | "1x2" | "2x2", default "1x1"' },
    ],
    specimens: [
      {
        label: "Grid cols={4} — equal columns, collapsing to one",
        bare: true,
        html: dedent(`
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <p class="m-0 text-sm text-muted-foreground">one</p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <p class="m-0 text-sm text-muted-foreground">two</p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <p class="m-0 text-sm text-muted-foreground">three</p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <p class="m-0 text-sm text-muted-foreground">four</p>
            </section>
          </div>
        `),
      },
      {
        label: "Split — rail on the right; below lg it stacks BELOW the main content, because a rail is secondary by definition",
        bare: true,
        html: dedent(`
          <div class="flex flex-col gap-3.5 lg:grid lg:items-start" style="grid-template-columns: 1fr 18rem">
            <div class="min-w-0 order-1 lg:order-1">
              <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-list">
                <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Main</h3>
                <p class="m-0 text-sm text-muted-foreground">
                  One copy of each child, reordered rather than re-rendered — the obvious two-block version
                  mounts everything twice.
                </p>
              </section>
            </div>
            <div class="order-2 lg:order-2">
              <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
                <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">Rail</h3>
                <p class="m-0 text-sm text-muted-foreground">Filters, meta, a picker.</p>
              </section>
            </div>
          </div>
        `),
      },
      {
        label: "Bento cols={4} — a 2x2 and a 2x1",
        bare: true,
        html: dedent(`
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 auto-rows-[minmax(0,1fr)]">
            <div class="sm:col-span-2 sm:row-span-2">
              <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-list h-full">
                <h3 class="m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em]">2x2</h3>
                <p class="m-0 text-sm text-muted-foreground">The anchor.</p>
              </section>
            </div>
            <div class="sm:col-span-2">
              <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
                <p class="m-0 text-sm text-muted-foreground">2x1</p>
              </section>
            </div>
            <div>
              <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
                <p class="m-0 text-sm text-muted-foreground">1x1</p>
              </section>
            </div>
            <div>
              <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
                <p class="m-0 text-sm text-muted-foreground">1x1</p>
              </section>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "empty-states",
    name: "EmptyState · NoAccess · Skeleton",
    category: "Surfaces",
    starterTwin: "kit/Feedback.jsx",
    summary: 'The three "there is nothing here yet" surfaces.',
    blurb:
      "NoAccess and Skeleton are NEW TO proto-kit — the cookbook had a generic empty state and " +
      "nothing else, so prototypes showed neither a permission boundary nor a loading state.",
    footer:
      "An empty state is NOT an error. It takes the muted ink and no tone, because tinting it turns " +
      "\"no rows yet\" into \"something is wrong\". Only NoAccess carries a tone, and a quiet one — a " +
      "permission boundary is a fact about the viewer, not a failure. NoAccess stays separate from " +
      "EmptyState rather than becoming a tone of it, because merging them produces an empty state " +
      "with a Create button the viewer cannot use. Skeleton reads `--color-gray-1`, Feedback.dc.html's " +
      "own mapping for the skeleton fill — not `bg-track`, which is a different role (the groove " +
      "under a rail, bar or gauge) that only happens to be a similar grey.",
    bindings: [
      { field: "title", type: "string", example: '"No claims yet"', note: 'EmptyState\'s heading, default "Nothing here yet"' },
      { field: "message", type: "string", example: '"Claims raised by your service centres will appear here."', note: "capped so it wraps rather than spanning the card" },
      { field: "icon", type: "node", example: "<svg …>", note: "EmptyState only — 24px (size-6) in --color-border, the one place icons go to 24px" },
      { field: "what", type: "string", example: '"the approvals queue"', note: 'NoAccess: completes "No access to …"' },
      { field: "lines", type: "number", example: "3", note: "Skeleton: paragraph lines; the last renders short (62% width)" },
      { field: "circle", type: "boolean", example: "true", note: "Skeleton: takes the avatar's shape (--radius-avatar), square by construction" },
    ],
    specimens: [
      {
        label: "EmptyState — with and without an action",
        bare: true,
        html: dedent(`
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="shadow-panel card-pad-list rounded-xl bg-surface">
              <div class="flex flex-col items-center gap-3 py-10 text-center">
                <p class="m-0 font-display text-base font-semibold leading-tight text-secondary">No claims yet</p>
                <p class="m-0 max-w-sm text-sm leading-relaxed text-text-muted">Claims raised by your service centres will appear here.</p>
                <div class="mt-1">
                  <button type="button"
                          class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-0 bg-secondary text-white shadow-button enabled:hover:bg-secondary-hover enabled:hover:shadow-[0_10px_22px_-8px_rgba(10,10,11,.55)] enabled:active:bg-black enabled:active:translate-y-px">
                    New claim
                  </button>
                </div>
              </div>
            </div>
            <div class="shadow-panel card-pad-list rounded-xl bg-surface">
              <div class="flex flex-col items-center gap-3 py-10 text-center">
                <p class="m-0 font-display text-base font-semibold leading-tight text-secondary">No results</p>
                <p class="m-0 max-w-sm text-sm leading-relaxed text-text-muted">No claim matches “compressor seal” in the last 90 days.</p>
              </div>
            </div>
          </div>
        `),
      },
      {
        label: "NoAccess — kept separate because the two answer different questions",
        html: dedent(`
          <div class="flex flex-col items-center gap-3 py-10 text-center">
            <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-slate-100 text-slate-700 h-7 gap-1.5 px-3 text-sm">
              <span class="flex-none rounded-full size-1.75 bg-slate-400" aria-hidden="true"></span>
              Restricted
            </span>
            <p class="m-0 font-display text-base font-semibold leading-tight text-secondary">No access to the approvals queue.</p>
            <p class="m-0 max-w-sm text-sm leading-relaxed text-text-muted">
              Your role does not include this. Ask an administrator if you think that is wrong.
            </p>
          </div>
        `),
      },
      {
        label: "Skeleton — a circle beside three lines, the last one short",
        html: dedent(`
          <div class="flex items-start gap-3">
            <span class="block animate-pulse bg-gray-1 rounded-avatar size-10" style="animation-duration: 1.6s" aria-hidden="true"></span>
            <div class="flex-1">
              <div class="flex flex-col gap-2" aria-hidden="true">
                <span class="h-3 animate-pulse rounded-sm bg-gray-1" style="width: 100%; animation-duration: 1.6s"></span>
                <span class="h-3 animate-pulse rounded-sm bg-gray-1" style="width: 100%; animation-duration: 1.6s"></span>
                <span class="h-3 animate-pulse rounded-sm bg-gray-1" style="width: 62%; animation-duration: 1.6s"></span>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "sheet",
    name: "Sheet",
    category: "Surfaces",
    starterTwin: "kit/Overlay.jsx",
    summary: "A panel that slides in from an edge — a Modal with more room.",
    blurb:
      "The same job as Modal at a different scale. The choice between them is about the TASK, not " +
      "the amount of text: a Modal interrupts — it centres itself and asks one question you answer " +
      "before continuing. A Sheet accompanies — it takes an edge and lets the page stay legible " +
      "beside it, which is what a multi-field create/edit form needs, because you want the record " +
      "you were looking at to still be there.",
    footer:
      "It shares Modal's focus-trap and scroll-lock logic verbatim rather than factoring it out — " +
      "the two differ only in placement, and a shared version would be an abstraction over a " +
      "two-line difference. Its corners don't all round the same way, per Overlay.dc.html's own " +
      "callout: \"a sheet keeps square corners against its edge\" — only the two corners on the " +
      "side facing the page take `--radius-lg` (`rounded-l-lg` for a right-hand sheet, " +
      "`rounded-r-lg` for a left one), the two against the viewport edge stay square, and that same " +
      "page-facing edge is the one that takes a `--color-gray-2` border Modal never draws.",
    bindings: [
      { field: "open / onClose", type: "boolean / () => void", example: "() => {}", note: "controlled, exactly like Modal" },
      { field: "side", type: "enum", example: '"right"', note: 'left · right — which edge it enters from. Right is the default for detail/edit; left reads as navigation.' },
      { field: "width", type: "string", example: '"26rem"', note: "capped at 100% so it becomes full-bleed on a phone rather than overflowing" },
      { field: "title / footer", type: "node", example: '"Edit request"', note: "same slots as Modal — the footer is where the actions go" },
    ],
    specimens: [
      {
        label: "open it — the page stays readable beside the panel",
        bare: true,
        html: dedent(`
          <div class="relative h-[380px] overflow-hidden rounded-lg">
            <div class="absolute left-6 top-6">
              <div class="flex flex-wrap items-center gap-2.5">
                <button type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-0 text-white shadow-primary enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)] enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]"
                        style="background-image: var(--gradient-primary)">
                  Edit request
                </button>
                <button type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">
                  Open from the left
                </button>
              </div>
            </div>
            <div class="absolute inset-0 bg-scrim"></div>
            <div role="dialog" aria-modal="true" aria-label="Edit request" tabindex="-1"
                 style="width: 26rem; max-width: 100%"
                 class="absolute inset-y-0 right-0 rounded-l-lg border-l border-gray-2 shadow-overlay flex flex-col overflow-auto outline-none bg-surface text-secondary p-7">
              <div class="mb-4 flex items-start justify-between gap-4">
                <h2 class="m-0 font-display text-lg font-semibold leading-tight tracking-tight">Edit request</h2>
                <button type="button" aria-label="Close"
                        class="grid h-8 w-8 flex-none place-items-center rounded-sm border-0 bg-transparent leading-none text-text-muted transition-colors hover:bg-gray-1 hover:text-secondary focus-visible:outline-none focus-visible:ring focus-visible:ring-ring">
                  <svg width="12" height="12" viewBox="0 0 11 11" aria-hidden="true">
                    <path d="M1 1l9 9M10 1l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                  </svg>
                </button>
              </div>
              <div class="flex-1 text-sm leading-relaxed">
                <div class="flex flex-col gap-3">
                  <div class="flex flex-col gap-1.5">
                    <label for="sh-type" class="text-xs font-semibold text-text-muted">Leave type</label>
                    <select id="sh-type"
                            class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none transition-colors outline-none placeholder:text-text-subtle enabled:hover:border-text-subtle focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted h-11 px-3.5 cursor-pointer appearance-none bg-[length:11px_7px] bg-[right_14px_center] bg-no-repeat pr-10"
                            style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1.3 5.5 5.5 10 1.3' fill='none' stroke='%23656e7a' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E&quot;);">
                      <option>Vacation</option>
                      <option>Sick</option>
                      <option>Unpaid</option>
                    </select>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label for="sh-note" class="text-xs font-semibold text-text-muted">Note to approver</label>
                    <textarea id="sh-note" placeholder="Anything they should know?"
                              class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none transition-colors outline-none placeholder:text-text-subtle enabled:hover:border-text-subtle focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted min-h-[132px] px-3.5 py-[11px] resize-y leading-relaxed"></textarea>
                  </div>
                </div>
              </div>
              <div class="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-gray-2 pt-4">
                <button type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">
                  Cancel
                </button>
                <button type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-0 text-white shadow-primary enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)] enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]"
                        style="background-image: var(--gradient-primary)">
                  Save
                </button>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "popover",
    name: "Popover",
    category: "Surfaces",
    starterTwin: "kit/Floating.jsx",
    summary: "Free-form content floating beside the control that opened it.",
    blurb:
      "The middle term between a Tooltip and a Modal, and it earns its place by being the only one " +
      "of the three that can hold CONTROLS. A Tooltip is a label and must never contain anything " +
      "clickable — it disappears when the pointer leaves, so a button inside it is unreachable. A " +
      "Modal blocks the page. A Popover does neither: it stays until dismissed, holds fields and " +
      "buttons, and leaves the page live behind it.",
    footer:
      "It takes `rounded-lg`, NOT `overlay-shape`, and that is a deliberate split from Modal. " +
      "`overlay-shape` bundles a radius with a Modal-sized padding; a popover is compact, so it " +
      "sets its own `p-4` and borrows only the radius rung. Everything else — `border-decor " +
      "border-gray-2 shadow-overlay bg-surface text-secondary` — is shared exactly with " +
      "DropdownMenu, because they are the same object (content floating over the page near where " +
      "you asked for it) doing two jobs, not two different surfaces. Only their padding (`p-4` vs " +
      "`p-1`) tells them apart. Nothing here reads the dead shadcn tokens (`bg-popover`, " +
      "`text-popover-foreground`, `border-edge`) — everything reads Foundations' live `--color-*` " +
      "tokens the way Card/Callout/Accordion do.",
    bindings: [
      { field: "align", type: "enum", example: '"start"', note: 'start · center · end against the trigger. Default "center".' },
      { field: "sideOffset", type: "number", example: "8", note: "gap from the trigger, in px — 8 for a popover, 6 for a tooltip: a popover is a panel, so it stands further off" },
    ],
    specimens: [
      {
        label: "open — a titled panel with a field and an action inside it",
        bare: true,
        html: dedent(`
          <div class="relative h-[300px] overflow-hidden rounded-lg">
            <div class="absolute left-6 top-6">
              <button type="button"
                      class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">
                Filter
              </button>
              <div class="mt-2 w-72 rounded-lg border-decor border-gray-2 shadow-overlay bg-surface text-secondary p-4 text-sm">
                <p class="m-0 mb-3 font-sans text-xs font-semibold text-text-muted">Filter the queue</p>
                <div class="flex flex-col gap-1.5">
                  <label for="pop-status" class="text-xs font-semibold text-text-muted">Status</label>
                  <select id="pop-status"
                          class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none transition-colors outline-none placeholder:text-text-subtle enabled:hover:border-text-subtle focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted h-11 px-3.5 cursor-pointer appearance-none bg-[length:11px_7px] bg-[right_14px_center] bg-no-repeat pr-10"
                          style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1.3 5.5 5.5 10 1.3' fill='none' stroke='%23656e7a' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E&quot;);">
                    <option>Awaiting review</option>
                    <option>Approved</option>
                    <option>Rejected</option>
                  </select>
                </div>
                <div class="flex flex-wrap items-center gap-2.5 mt-4 justify-end">
                  <button type="button"
                          class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">
                    Reset
                  </button>
                  <button type="button"
                          class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-0 text-white shadow-primary enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)] enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]"
                          style="background-image: var(--gradient-primary)">
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "tooltip",
    name: "Tooltip",
    category: "Surfaces",
    starterTwin: "kit/Floating.jsx",
    summary: "A short label on hover — never anything you need to click.",
    blurb:
      "The one floating surface that does NOT share the popover treatment, and the exception is " +
      "the point. Popover and DropdownMenu read `bg-surface`; a Tooltip reads `bg-secondary` with " +
      "`text-white` — the exact pair Buttons.jsx's `strong` rank fills with, so a tooltip reads as " +
      "the same kind of high-contrast ink as the rest of the language's emphasis vocabulary, not a " +
      "fourth surface. It is not a panel you are working in, it is a label pinned to the thing " +
      "under the cursor.",
    footer:
      "Rules that are not style preferences: it holds NO interactive content (it dismisses on " +
      "pointer-leave, so a link inside is unreachable), and it never carries information available " +
      "nowhere else — a tooltip is invisible to touch, to keyboard-only scanning and to anyone " +
      "reading quickly. Use it to name an icon button, expand an abbreviation, or give a figure " +
      "its units. `rounded-md` and a tight `px-2.5 py-1.5` keep it reading as a chip rather than a " +
      "small card — and it carries NO shadow, on purpose. The mapping table is exhaustive per " +
      "surface: the panel row names fill · edge · radius · shadow; the tooltip row names fill · " +
      "ink · radius · text · padding and stops there — \"the one floating thing that is not a " +
      "panel.\" Don't re-add `shadow-overlay` here.",
    bindings: [
      { field: "children", type: "string", example: '"Days remaining this year"', note: "one short line — if it needs two, it is a Popover" },
      { field: "side", type: "enum", example: '"top"', note: "top · right · bottom · left — flips automatically on collision" },
      { field: "sideOffset", type: "number", example: "6", note: "tighter than Popover's — a tooltip belongs to the thing it labels" },
    ],
    specimens: [
      {
        label: "visible above an icon button — the inverted plate, not the popover surface",
        bare: true,
        html: dedent(`
          <div class="relative h-[160px] overflow-hidden rounded-lg">
            <div class="absolute left-1/2 top-14 -translate-x-1/2">
              <div class="mb-1.5 flex justify-center">
                <span role="tooltip" class="rounded-md bg-secondary px-2.5 py-1.5 font-sans text-xs text-white">
                  Days remaining this year
                </span>
              </div>
              <div class="flex justify-center">
                <button type="button" aria-label="Balance help"
                        class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">
                  ?
                </button>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "accordion",
    name: "Accordion",
    category: "Surfaces",
    starterTwin: "kit/Accordion.jsx",
    summary: "Sections that open one at a time — progressive disclosure, not a nav.",
    blurb:
      "For content a reader can legitimately SKIP: an FAQ, advanced options, the older half of a " +
      "history. It is the wrong tool for anything a reader must COMPARE, because comparison needs " +
      "two panels open at once and single-mode closes one to open the next. It is also not " +
      "navigation — collapsing your primary sections hides the shape of the page from whoever has " +
      "not clicked yet. `variant` picks the anatomy: \"list\" (default) is a single shared white " +
      "panel with hairline row dividers; \"card\" makes EACH item its own raised panel with a " +
      "divider only above the open content; \"filled\" makes each item a flat gray tile with a 7px " +
      "primary dot ahead of the question.",
    footer:
      "The open/close animation is a `grid-template-rows: 0fr → 1fr` transition rather than a " +
      "max-height guess, and that is the one implementation detail worth copying: max-height forces " +
      "you to name a number larger than the content, so every panel animates at a different real " +
      "speed and a long one snaps at the end. The grid version measures itself. No part names a " +
      "hex — every colour comes from Foundations, this component only decides which token belongs " +
      "where. `meta` — a trailing muted value before the chevron — lives on `AccordionTrigger`, not " +
      "on `Accordion`: it's \"list\" plus one per-row prop, not a fourth variant.",
    bindings: [
      { field: "type", type: "enum", example: '"multiple"', note: '"single" | "multiple" — single closes the open row when another opens; multiple lets them stack. Independent of variant.' },
      { field: "defaultValue", type: "string", example: '"balance"', note: "which item starts open. Opening one by default is usually right — an all-closed accordion looks like an empty page." },
      { field: "collapsible", type: "boolean", example: "true", note: "whether the open row can be closed, leaving none open" },
      { field: "variant", type: "enum", example: '"card"', note: '"list" | "card" | "filled" — on Accordion, inherited by every Item. Default "list".' },
      { field: "items[].heading", type: "string", example: '"How is my balance calculated?"', note: "the question or section name, on AccordionTrigger — phrased so the closed state is still informative" },
      { field: "items[].meta", type: "string", example: '"750 MB"', note: "on AccordionTrigger — a trailing muted value before the chevron" },
      { field: "items[].body", type: "string", example: '"Accrual runs monthly…"', note: "the disclosed content, on AccordionContent" },
    ],
    specimens: [
      {
        label: "list — one shared panel, hairline row dividers",
        bare: true,
        html: dedent(`
          <div class="overflow-hidden rounded-xl bg-surface shadow-panel px-[22px]">
            <div class="border-b border-gray-1 last:border-b-0">
              <button type="button" aria-expanded="true"
                      class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                <span class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="min-w-0 truncate text-sm font-medium">How is my balance calculated?</span>
                </span>
                <span class="flex flex-none items-center gap-3">
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard rotate-180 text-text-muted group-hover:text-primary group-active:text-primary">
                    <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                  </svg>
                </span>
              </button>
              <div style="display: grid; grid-template-rows: 1fr; transition: grid-template-rows 240ms var(--ease-standard)">
                <div class="overflow-hidden">
                  <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4">
                    Accrual runs on the first of each month and is prorated for anyone who joined mid-year. Carry-over above five days expires on 31 March.
                  </div>
                </div>
              </div>
            </div>
            <div class="border-b border-gray-1 last:border-b-0">
              <button type="button" aria-expanded="false"
                      class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                <span class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="min-w-0 truncate text-sm font-medium">Can I cancel an approved request?</span>
                </span>
                <span class="flex flex-none items-center gap-3">
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard text-text-muted group-hover:text-primary group-active:text-primary">
                    <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                  </svg>
                </span>
              </button>
              <div style="display: grid; grid-template-rows: 0fr; transition: grid-template-rows 240ms var(--ease-standard)">
                <div class="overflow-hidden">
                  <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4">
                    Yes, up to the day before it starts. After that it needs your approver to reverse it, which puts the days back on the same balance they came from.
                  </div>
                </div>
              </div>
            </div>
            <div class="border-b border-gray-1 last:border-b-0">
              <button type="button" aria-expanded="false"
                      class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                <span class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="min-w-0 truncate text-sm font-medium">Who approves when my manager is away?</span>
                </span>
                <span class="flex flex-none items-center gap-3">
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard text-text-muted group-hover:text-primary group-active:text-primary">
                    <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                  </svg>
                </span>
              </button>
              <div style="display: grid; grid-template-rows: 0fr; transition: grid-template-rows 240ms var(--ease-standard)">
                <div class="overflow-hidden">
                  <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4">
                    Approval falls to their own manager for the duration of the absence. Nothing queues silently — the request re-routes the moment their leave begins.
                  </div>
                </div>
              </div>
            </div>
          </div>
        `),
      },
      {
        label: "card — raised, one card per item",
        bare: true,
        html: dedent(`
          <div class="flex flex-col gap-3">
            <div class="overflow-hidden rounded-xl bg-surface shadow-raised px-[22px]">
              <button type="button" aria-expanded="true"
                      class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-6 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                <span class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="min-w-0 truncate text-sm font-medium">
                    <span class="flex items-baseline gap-1.5">
                      <span class="font-display text-[22px] font-bold tracking-tight">750 MB</span>
                    </span>
                  </span>
                </span>
                <span class="flex flex-none items-center gap-3">
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard rotate-180 text-text-muted group-hover:text-primary group-active:text-primary">
                    <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                  </svg>
                </span>
              </button>
              <div style="display: grid; grid-template-rows: 1fr; transition: grid-template-rows 240ms var(--ease-standard)">
                <div class="overflow-hidden">
                  <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted border-t border-gray-1 pt-4 pb-6">
                    <div class="flex flex-col gap-3.5 pt-4">
                      <div class="flex gap-10"><span class="min-w-16 text-text-muted">Available</span><span>1 month</span></div>
                      <div class="flex gap-10"><span class="min-w-16 text-text-muted">Price</span><span class="font-bold">15 <span class="font-normal text-xs text-text-muted">LE</span></span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="overflow-hidden rounded-xl bg-surface shadow-raised px-[22px]">
              <button type="button" aria-expanded="false"
                      class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-6 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                <span class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="min-w-0 truncate text-sm font-medium">
                    <span class="flex items-baseline gap-1.5">
                      <span class="font-display text-[22px] font-bold tracking-tight">250 MB</span>
                    </span>
                  </span>
                </span>
                <span class="flex flex-none items-center gap-3">
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard text-text-muted group-hover:text-primary group-active:text-primary">
                    <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                  </svg>
                </span>
              </button>
              <div style="display: grid; grid-template-rows: 0fr; transition: grid-template-rows 240ms var(--ease-standard)">
                <div class="overflow-hidden">
                  <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted border-t border-gray-1 pt-4 pb-6">
                    <div class="flex flex-col gap-3.5 pt-4">
                      <div class="flex gap-10"><span class="min-w-16 text-text-muted">Available</span><span>1 month</span></div>
                      <div class="flex gap-10"><span class="min-w-16 text-text-muted">Price</span><span class="font-bold">7 <span class="font-normal text-xs text-text-muted">LE</span></span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `),
      },
      {
        label: "filled — separated tiles, no shared container, and meta — a trailing value before the chevron",
        bare: true,
        html: dedent(`
          <div class="grid gap-6 lg:grid-cols-2">
            <div class="flex flex-col gap-3">
              <div class="overflow-hidden rounded-lg bg-gray-1 px-[18px]">
                <button type="button" aria-expanded="false"
                        class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                  <span class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="chip-dot flex-none bg-primary" aria-hidden="true"></span>
                    <span class="min-w-0 truncate text-sm font-medium">Billing and invoices</span>
                  </span>
                  <span class="flex flex-none items-center gap-3">
                    <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard text-text-muted group-hover:text-primary group-active:text-primary">
                      <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    </svg>
                  </span>
                </button>
                <div style="display: grid; grid-template-rows: 0fr; transition: grid-template-rows 240ms var(--ease-standard)">
                  <div class="overflow-hidden">
                    <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4 pl-[19px]">
                      Invoices are issued on the first of each month and sent to the account email.
                    </div>
                  </div>
                </div>
              </div>
              <div class="overflow-hidden rounded-lg bg-gray-1 px-[18px]">
                <button type="button" aria-expanded="false"
                        class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                  <span class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="chip-dot flex-none bg-primary" aria-hidden="true"></span>
                    <span class="min-w-0 truncate text-sm font-medium">Devices on this line</span>
                  </span>
                  <span class="flex flex-none items-center gap-3">
                    <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard text-text-muted group-hover:text-primary group-active:text-primary">
                      <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    </svg>
                  </span>
                </button>
                <div style="display: grid; grid-template-rows: 0fr; transition: grid-template-rows 240ms var(--ease-standard)">
                  <div class="overflow-hidden">
                    <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4 pl-[19px]">
                      Up to five devices can share one bundle. Each device keeps its own usage history.
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="overflow-hidden rounded-xl bg-surface shadow-panel px-[22px]">
              <div class="border-b border-gray-1 last:border-b-0">
                <button type="button" aria-expanded="true"
                        class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                  <span class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="min-w-0 truncate text-sm font-medium">Monthly bundle</span>
                  </span>
                  <span class="flex flex-none items-center gap-3">
                    <span class="text-xs text-text-muted">750 MB</span>
                    <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard rotate-180 text-text-muted group-hover:text-primary group-active:text-primary">
                      <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    </svg>
                  </span>
                </button>
                <div style="display: grid; grid-template-rows: 1fr; transition: grid-template-rows 240ms var(--ease-standard)">
                  <div class="overflow-hidden">
                    <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4">
                      Renews on the 1st. Auto renew is on.
                    </div>
                  </div>
                </div>
              </div>
              <div class="border-b border-gray-1 last:border-b-0">
                <button type="button" aria-expanded="false"
                        class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                  <span class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="min-w-0 truncate text-sm font-medium">Add-ons</span>
                  </span>
                  <span class="flex flex-none items-center gap-3">
                    <span class="text-xs text-text-muted">2 active</span>
                    <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard text-text-muted group-hover:text-primary group-active:text-primary">
                      <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    </svg>
                  </span>
                </button>
                <div style="display: grid; grid-template-rows: 0fr; transition: grid-template-rows 240ms var(--ease-standard)">
                  <div class="overflow-hidden">
                    <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4">
                      Night pass and international minutes, both ending this cycle.
                    </div>
                  </div>
                </div>
              </div>
              <div class="border-b border-gray-1 last:border-b-0">
                <button type="button" aria-expanded="false"
                        class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                  <span class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="min-w-0 truncate text-sm font-medium">Total this month</span>
                  </span>
                  <span class="flex flex-none items-center gap-3">
                    <span class="text-xs text-text-muted">15 LE</span>
                    <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard text-text-muted group-hover:text-primary group-active:text-primary">
                      <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    </svg>
                  </span>
                </button>
                <div style="display: grid; grid-template-rows: 0fr; transition: grid-template-rows 240ms var(--ease-standard)">
                  <div class="overflow-hidden">
                    <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4">
                      Bundle 12 LE, add-ons 3 LE. Tax included.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    // 2026-08-13 — new entry. The real specimen file (specimens/accordion.jsx) has TWO entries with
    // two DIFFERENT `twin` values — "accordion" and "accordion-states" — not one twin shared by two
    // groups the way `calendar`'s Agenda specimens are (both literally `twin: "calendar"`). Because
    // starterSpecimens(twinId) matches the twin string exactly, a specimen filed under `accordion`
    // here would never pair against the real `accordion-states` entries at all — it needs its own
    // catalog id. Flagged by two sibling agents as a coverage gap (no `kit/` twin previously reached
    // it); this is that fix, not a merge into the sibling `accordion` entry above.
    id: "accordion-states",
    name: "AccordionItem · States",
    category: "Surfaces",
    starterTwin: "kit/Accordion.jsx",
    summary: "Two states past open/closed on a single row — inert, and needing attention.",
    blurb:
      "`disabled` and `invalid` are per-Item, not per-Accordion — a caller marks one row, not the " +
      "whole set. Neither is a variant: they compose with `list`/`card`/`filled` the same way any " +
      "other row does. `invalid` does NOT force the item open — that stays a caller decision via " +
      "`value`/`defaultValue`, same as any other row; the specimen below opens it only because its " +
      "own `defaultValue` says so, not because invalid rows auto-expand.",
    footer:
      "Disabled sets the real HTML `disabled` attribute (not just a visual dim) and drops ink/chevron " +
      "to `--color-border` with hover suppressed entirely — `bgInteractive` becomes bare " +
      "`cursor-not-allowed`, not the usual `hover:bg-gray-1 active:bg-gray-2` pair every other row " +
      "keeps. Invalid recolours ink, chevron AND the disclosed content to `--color-danger`, adds " +
      "`aria-invalid=\"true\"`, and prepends a small 14px stroke glyph (its own hand-drawn `<svg>`, no " +
      "icon dependency — the same convention the chevron and Command's search glyph already use) " +
      "ahead of the label. Unlike disabled, invalid keeps its hover wash — a plain affordance, not a " +
      "diminished one.",
    bindings: [
      { field: "disabled", type: "boolean", example: "true", note: "on AccordionItem. Trigger is inert (real disabled attribute) and drops to --color-border, no hover" },
      { field: "invalid", type: "boolean", example: "true", note: "on AccordionItem. Danger label, chevron and content ink, plus a small stroke error glyph before the label. Hover still applies — only disabled suppresses it" },
    ],
    specimens: [
      {
        // Accordion.jsx:121-210. List variant (no variant prop), type="multiple"
        // defaultValue={["error"]} — only the invalid row starts open, the other two start closed.
        label: "disabled and invalid, beside a default row",
        bare: true,
        html: dedent(`
          <div class="overflow-hidden rounded-xl bg-surface shadow-panel px-[22px]">
            <div class="border-b border-gray-1 last:border-b-0">
              <button type="button" aria-expanded="false"
                      class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-secondary group-hover:text-primary group-active:text-primary cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                <span class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="min-w-0 truncate text-sm font-medium">Data rollover</span>
                </span>
                <span class="flex flex-none items-center gap-3">
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard text-text-muted group-hover:text-primary group-active:text-primary">
                    <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                  </svg>
                </span>
              </button>
              <div style="display: grid; grid-template-rows: 0fr; transition: grid-template-rows 240ms var(--ease-standard)">
                <div class="overflow-hidden">
                  <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4">
                    Unused data carries into the following month, up to your bundle size.
                  </div>
                </div>
              </div>
            </div>
            <div class="border-b border-gray-1 last:border-b-0">
              <button type="button" disabled aria-expanded="false"
                      class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-border cursor-not-allowed">
                <span class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="min-w-0 truncate text-sm font-medium">Auto-pay (unavailable on this plan)</span>
                </span>
                <span class="flex flex-none items-center gap-3">
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard text-border">
                    <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                  </svg>
                </span>
              </button>
              <div style="display: grid; grid-template-rows: 0fr; transition: grid-template-rows 240ms var(--ease-standard)">
                <div class="overflow-hidden">
                  <div class="max-w-[52ch] text-sm leading-[1.65] text-text-muted pb-4">
                    Not shown — the row is inert.
                  </div>
                </div>
              </div>
            </div>
            <div class="border-b border-gray-1 last:border-b-0">
              <button type="button" aria-expanded="true" aria-invalid="true"
                      class="group flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left font-sans outline-none transition-colors duration-[120ms] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm text-danger cursor-pointer hover:bg-gray-1 active:bg-gray-2">
                <span class="flex min-w-0 flex-1 items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="flex-none text-danger">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"></circle>
                    <path d="M7 4.2v3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
                    <circle cx="7" cy="9.6" r="0.75" fill="currentColor" stroke="none"></circle>
                  </svg>
                  <span class="min-w-0 truncate text-sm font-medium">Payment method</span>
                </span>
                <span class="flex flex-none items-center gap-3">
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true" class="flex-none transition duration-200 ease-standard rotate-180 text-danger">
                    <path d="M1 1.3 5.5 5.5 10 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                  </svg>
                </span>
              </button>
              <div style="display: grid; grid-template-rows: 1fr; transition: grid-template-rows 240ms var(--ease-standard)">
                <div class="overflow-hidden">
                  <div class="max-w-[52ch] text-sm leading-[1.65] text-danger pb-4">
                    Two fields in this section need attention.
                  </div>
                </div>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "separator",
    name: "Separator",
    category: "Surfaces",
    starterTwin: "kit/Layout.jsx",
    summary: "One hairline rule, horizontal or vertical.",
    blurb:
      "The least token-hungry component in the kit, and worth a page for exactly that reason: a " +
      "rule should consume a border colour and nothing else. No language declares a separator, so " +
      "there is no shape, no shadow and no radius to get wrong — only the question of WHICH border " +
      "token it reads, and that one has a wrong answer.",
    footer:
      "It reads `--color-gray-3`, NOT `--color-border` and NOT the card's own `border-decor`/" +
      "`border-edge` pair. Layout.dc.html's own words: gray-3 is \"the functional rule weight, one " +
      "step stronger than a row divider\" — the same step PageHeader's stat row and Table's header " +
      "rule read. A separator is not an object's edge (that is the card contract, which cards " +
      "themselves no longer even draw — see Cards.jsx), it is a rule INSIDE the page, and it needs " +
      "the token that stays visibly a step stronger rather than the lighter one a container edge " +
      "would use.",
    bindings: [
      { field: "orientation", type: "enum", example: '"horizontal"', note: "horizontal · vertical — vertical needs a parent with a real height: it reads h-full, so in an auto-height row it collapses to nothing" },
    ],
    specimens: [
      {
        label: "horizontal — between two blocks of content",
        html: dedent(`
          <div class="w-full">
            <p class="m-0 text-sm text-secondary">Vacation · 14 days remaining</p>
            <div role="separator" aria-orientation="horizontal" class="w-full h-px border-t border-gray-3 flex-none my-4"></div>
            <p class="m-0 text-sm text-text-muted">Sick leave · 6 days remaining</p>
          </div>
        `),
      },
      {
        label: "vertical — between inline items, in a row with a height",
        html: dedent(`
          <div class="flex h-6 items-center gap-4">
            <span class="text-sm text-secondary">Submitted</span>
            <div role="separator" aria-orientation="vertical" class="h-full w-px border-l border-gray-3 flex-none"></div>
            <span class="text-sm text-secondary">In review</span>
            <div role="separator" aria-orientation="vertical" class="h-full w-px border-l border-gray-3 flex-none"></div>
            <span class="text-sm text-text-muted">Decided</span>
          </div>
        `),
      },
    ],
  },
];
