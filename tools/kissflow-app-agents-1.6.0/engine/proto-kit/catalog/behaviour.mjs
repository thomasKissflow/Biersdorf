// behaviour.mjs — CountUp · toast/Toaster · CustomEmbed · StoresMap.
//
// starter/lib/nav.json's "Behaviour" group. These four ran the parity loop in the OPPOSITE
// direction to most of this catalog: they existed only in the starter kit, so the prototype had
// no way to show a figure settling, a confirmation after an action, an embed, or a location list
// without someone inventing markup on the spot. Every snippet below is transcribed from the real
// component in starter/src/components/kit/Fx.jsx.
//
// THE SHELL ALREADY HAS TWO OF THESE AS GLOBALS. `showToast(msg)` and `openPopup(html)` are
// documented shell functions, and nothing here replaces them — a part still CALLS showToast. What
// was missing is the ANATOMY: what the thing that appears actually looks like, so the shell's own
// toast and the built app's Toaster are the same object rather than two designs that happen to
// share a verb.
//
// None of the four is declared by any design language — they are product behaviour, not surface —
// so all are [OURS], composed from tokens each language already holds.

import { dedent } from "./_schema.mjs";

/** @type {import("./_schema.mjs").Entry[]} */
export default [
  {
    id: "count-up",
    name: "CountUp",
    category: "Behaviour",
    starterTwin: "kit/Fx.jsx",
    summary: "A figure that animates to its value.",
    blurb:
      "The figure is one span; the behaviour is the component. In a prototype write the final " +
      "figure straight into the span and animate it from your load script if you want the motion " +
      "— the class list is what has to match, and it is two classes long. The two buttons carry " +
      "the starter specimen's own outline and secondary ranks (Buttons.jsx's REDESIGNED pill " +
      "geometry, not the retired control-shape bundle) so the row reads the same on both sides, " +
      "but no snippet in this catalog ships a script tag: they are shape, not behaviour, and your " +
      "load script is what makes them do anything. (Written as prose, not markup — the literal " +
      "tag name here would trip the catalog's own no-scripts grep.)",
    footer:
      "It reads the language's OWN move duration rather than a fixed 750ms, so a number settles at " +
      "the same speed a bar grows — 220ms under Beacon, the language's own move duration. And it " +
      "respects prefers-reduced-motion by jumping straight to the value, because an animated " +
      "figure is decoration and decoration is the first thing that setting is asking you to drop. " +
      "`tabular-nums` is not optional here: without it every tick re-measures the text and the " +
      "number jitters sideways while it counts, which is the whole reason a proportional face is " +
      "wrong for a figure.",
    bindings: [
      { field: "value", type: "number", example: "42", note: "the target. In a prototype this is the SEED figure written out; the animation is optional chrome on top of it." },
      { field: "duration", type: "number", example: "220", note: "unset reads --motion-duration-move, so it matches every other moving thing in the language" },
    ],
    // The outline button below reads `border-gray-3`, not Buttons.jsx's own literal `#DDE0E4` —
    // see that file's banner: "close but not an exact match" to --color-gray-3, kept literal there
    // on purpose. This catalog's linter forbids a raw hex, so every outline specimen in this file
    // substitutes the nearest contract token instead (controls.mjs does the same) — a one-shade
    // difference the eye will not catch, not a fabricated design decision.
    specimens: [
      {
        label: "the figure and its controls — the buttons are markup here; wire them in your load script",
        html: dedent(`
          <p class="m-0 font-display text-kpi text-foreground">
            <span class="font-mono tabular-nums">42</span>
          </p>
          <div class="flex flex-wrap items-center gap-2.5 mt-4">
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-decor bg-transparent text-ink-soft border-gray-3
                           enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary
                           enabled:active:bg-gray-1">
              Randomise
            </button>
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 bg-surface text-ink-soft shadow-contact
                           enabled:hover:text-secondary enabled:hover:shadow-[0_2px_6px_rgba(10,10,11,.1)]
                           enabled:active:shadow-[inset_0_1px_2px_rgba(10,10,11,.12)]">
              Zero
            </button>
          </div>
        `),
      },
    ],
  },

  {
    id: "toaster",
    name: "toast · Toaster",
    category: "Behaviour",
    starterTwin: "kit/Fx.jsx",
    summary: "The confirmation that appears after an action, and the region it appears in.",
    blurb:
      "The shell already exposes `showToast(msg)` and a part should keep calling it — this entry " +
      "is the ANATOMY, so the prototype's toast and the built app's Toaster are the same object " +
      "rather than two designs that happen to share a verb. The region is bottom-centre, fixed, " +
      "and pointer-events-none so it never eats a click meant for the page behind it; only the " +
      "toast itself takes pointer events back.",
    footer:
      "The tone chip inside the toast is a real StatusChip, sharing the same five tones — so a " +
      "toast saying \"Approved\" and a status column saying \"Approved\" are the same colour in " +
      "every language. That is the point of reusing it rather than giving the toast its own " +
      "palette. The surface reads `shadow-overlay`, not `shadow-card`: a toast genuinely floats " +
      "over the page, which is the same rung Modal takes.",
    bindings: [
      { field: "message", type: "string", example: '"Claim approved"', note: "the sentence. Past tense — a toast reports what happened, it does not promise." },
      { field: "tone", type: "enum", example: '"success"', note: "success · warning · info · danger · neutral — the same five StatusChip reads. `pending`/`strong` were dropped as status tones in Chips.jsx's redesign (\"orange and near-black are actions here, not statuses\")." },
      { field: "ms", type: "number", example: "4000", note: "auto-dismiss. A toast carrying something the reader must act on is the wrong component — use Callout." },
    ],
    specimens: [
      {
        label: "the region with one toast in it — fixed bottom-centre, and the region itself never eats a click",
        bare: true,
        html: dedent(`
          <div class="pointer-events-none flex -translate-x-1/2 flex-col items-center gap-2" style="position: relative; left: 50%">
            <div class="border-decor border-edge shadow-overlay card-pad-metric pointer-events-auto flex items-center gap-2.5 rounded-lg bg-card text-sm text-card-foreground">
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-emerald-50 text-emerald-700 h-7 gap-1.5 px-3 text-sm">
                <span class="flex-none rounded-full size-1.75 bg-emerald-500" aria-hidden="true"></span>success
              </span>Claim approved
            </div>
          </div>
        `),
      },
      {
        label: "in a real shell the region is fixed to the viewport — this is the wrapper to copy verbatim",
        bare: true,
        html: dedent(`
          <div class="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
            <div class="border-decor border-edge shadow-overlay card-pad-metric pointer-events-auto flex items-center gap-2.5 rounded-lg bg-card text-sm text-card-foreground">
              <span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none bg-rose-50 text-rose-700 h-7 gap-1.5 px-3 text-sm">
                <span class="flex-none rounded-full size-1.75 bg-rose-500" aria-hidden="true"></span>danger
              </span>Could not reach the server
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "custom-embed",
    name: "CustomEmbed",
    category: "Behaviour",
    starterTwin: "kit/Fx.jsx",
    summary: "An external page in an iframe. The card is ours; what is inside it is not.",
    blurb:
      "The surrounding card follows the language exactly as every other card does. The CONTENT " +
      "does not and cannot: an embedded third-party page paints its own tiles, controls and " +
      "typography inside a document we do not style. Being honest about that boundary is the " +
      "whole design of this component.",
    footer:
      "The sandbox is narrow ON PURPOSE — scripts, same-origin and forms, nothing else. An embed " +
      "that can script its parent is a hole in the app, and the default when you omit `sandbox` " +
      "entirely is no sandbox at all. Rendered against `about:blank` in this catalog because a " +
      "catalog page should not reach the network; that is the same rule PhotoCard's specimens " +
      "follow.",
    bindings: [
      { field: "src", type: "string", example: '"about:blank"', note: "nothing renders without it" },
      { field: "title", type: "string", example: '"Embed placeholder"', note: "the iframe's accessible name — a frame with no title is an unlabelled document to a screen reader" },
      { field: "height", type: "number", example: "140", note: "pixels, written straight into style" },
      { field: "sandbox", type: "string", example: '"allow-scripts allow-same-origin allow-forms"', note: "narrow on purpose; widening it is a security decision, not a layout one" },
    ],
    specimens: [
      {
        label: "against about:blank — a catalog page should not reach the network",
        html: dedent(`
          <iframe src="about:blank" title="Embed placeholder" sandbox="allow-scripts allow-same-origin allow-forms"
                  class="border-decor border-edge w-full rounded-lg bg-card" style="height: 140px"></iframe>
        `),
      },
    ],
  },

  {
    id: "stores-map",
    name: "StoresMap",
    category: "Behaviour",
    starterTwin: "kit/Fx.jsx",
    summary: "Locations as a themed list rather than an embedded map.",
    blurb:
      "A deliberate departure, and the reasoning is the same one CustomEmbed makes from the other " +
      "side. The legacy component embedded a map provider. An embedded third-party map is the one " +
      "thing in either kit that CANNOT follow the design language at all — it paints its own " +
      "tiles, labels and controls inside an iframe nobody styles, a flat grey Mercator hole in an " +
      "otherwise on-brand page no matter what the surrounding language looks like.",
    footer:
      "A list that themes correctly is more honest than a map that never will. It reads the same " +
      "row geometry Table and ApprovalRow read (`row-shape`, `border-row-divider`), so a location " +
      "list beside a register lines up with it. `onSelect` is where a caller wires a real map if " +
      "the app genuinely needs one — the component's job is to be the themed half.",
    bindings: [
      { field: "locations", type: "array<{id,name,address}>", example: '{ id: 1, name: "Home Center", address: "12 Harbour Road, Marine District" }', note: "name in the ordinary ink, address in the meta ink; both truncate" },
      { field: "onSelect", type: "handler", example: "(location) => void", note: "renders the Open button and is where a caller wires a real map. No handler, no button." },
    ],
    // Same substitution as count-up's specimen above: Buttons.jsx's outline rank reads a literal
    // `#DDE0E4` border colour on purpose (its own banner: not --color-gray-3, "close but not an
    // exact match"); this catalog's linter forbids a raw hex, so `border-gray-3` stands in for it.
    specimens: [
      {
        label: "three locations — the same row geometry a register uses, so the two line up",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col p-0">
            <li class="row-shape flex items-center justify-between gap-4 border-b border-row-divider last:border-0">
              <span class="min-w-0">
                <span class="block truncate text-sm text-foreground">Home Center</span>
                <span class="block truncate text-xs text-meta-foreground">12 Harbour Road, Marine District</span>
              </span>
              <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">Open</button>
            </li>
            <li class="row-shape flex items-center justify-between gap-4 border-b border-row-divider last:border-0">
              <span class="min-w-0">
                <span class="block truncate text-sm text-foreground">Downtown</span>
                <span class="block truncate text-xs text-meta-foreground">88 Exchange Street</span>
              </span>
              <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">Open</button>
            </li>
            <li class="row-shape flex items-center justify-between gap-4 border-b border-row-divider last:border-0">
              <span class="min-w-0">
                <span class="block truncate text-sm text-foreground">Airport Mall</span>
                <span class="block truncate text-xs text-meta-foreground">Terminal 2, Level 3</span>
              </span>
              <button type="button" class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40 h-[34px] px-[17px] rounded-full text-xs font-bold border-decor bg-transparent text-ink-soft border-gray-3 enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary enabled:active:bg-gray-1">Open</button>
            </li>
          </ul>
        `),
      },
    ],
  },
];
