// controls.mjs — Button · Input/Select/Textarea · TabStrip.
//
// starter/lib/nav.json's "Controls" group, reproduced (minus Forms, which is a composition of
// these, not a component of its own — no prototype equivalent exists for it yet). Every snippet
// below is transcribed from the real component in starter/src/components/kit/ — its actual
// className string, not a re-invented one — so a prototype and the built app produce the same DOM
// shape and the same computed styles under all three languages.
//
// THE BEVEL BUG. Preflight is off (to match starter), so a bare <button> defaults to the UA's
// `border: 2px outset` and a bare <input>/<select>/<textarea> to `2px inset` — an embossed 3-D
// ring Chrome draws for free. The shell neutralises this with a base-layer reset, but every
// snippet here ALSO carries its own explicit border class, exactly as kit/Buttons.jsx and
// kit/Fields.jsx do: `border-0` on the three filled button ranks, `border-control` on the outline
// rank, `border-field-edge` (colour) riding on `field-shape` (width) for every field. A snippet
// copied into a shell that has not run the reset still renders correctly.
//
// Input, Select and Textarea share ONE Entry, "fields", because kit/Fields.jsx shares one `FIELD`
// class string across all three — their geometry, ink and focus contract are a single decision in
// the source, not three coincidentally similar ones. Splitting them into three Entries would
// invent a distinction the component itself does not make. Button and TabStrip stay separate:
// each is its own file, its own closed vocabulary, its own focus story.

import { dedent } from "./_schema.mjs";

/** @type {import("./_schema.mjs").Entry[]} */
export default [
  {
    id: "button",
    name: "Button",
    category: "Controls",
    starterTwin: "kit/Buttons.jsx",
    summary: "One action, at one of four ranks — primary, secondary, outline, strong.",
    blurb:
      "FOUR ranks, still not \"as many as you like\" — Buttons.jsx's own words, and rank stays a " +
      "CLOSED SET: these snippets are the whole vocabulary, not a sample of it. REDESIGNED " +
      "2026-08-13 off Buttons.dc.html (the page after Cards.dc.html in the same Claude Design " +
      "migration): primary now carries its own gradient glow (`--gradient-primary` / " +
      "`--shadow-primary`) instead of a flat fill, secondary is a white `--shadow-contact` fill " +
      "instead of a gray one, and outline is the only rank with a border — transparent until " +
      "hovered, for a dismiss beside a commit. Button is also the only control in this catalog " +
      "that renders a focus ring, and the ring is the contract's one deliberate bypass of the " +
      "HSL-triplet convention: `--color-ring` is `rgba(255, 98, 3, .35)`, a whole alpha value with " +
      "nowhere to put that alpha inside an HSL triplet. It sits 2px OFF the button's own edge on a " +
      "transparent offset (new in this pass) so it shows whatever is actually behind the button " +
      "instead of painting a fake white halo on a gray or dark surface. Tab through the first " +
      "specimen to see it.",
    footer:
      "Geometry is a `size`, not a token bundle any more — the old `control-shape`/" +
      "`rounded-control-strong` bundles are retired, replaced by four literal Tailwind sizes " +
      "(`sm` · `header` · `form` · `mobile`) plus two icon sizes that break the pill on purpose " +
      "(\"a round icon button reads as an avatar\" — 36px `--radius-md` in a top bar, 28px " +
      "`--radius-sm` inside a row). `header` is the default, at 34px — down from the old " +
      "control-shape's 42px, a visible height drop across every existing call site, not a " +
      "per-call-site opt-in. `strong` is still the only rank carrying `shadow-button` — " +
      "Foundations' own \"black buttons only\" role, so the create action reads as the nearest " +
      "object. `tone=\"danger\"` is NOT a fifth rank: it always renders primary's shape (pill, " +
      "white ink, no border) with `--color-danger`'s fill, exclusive with `rank` rather than " +
      "layered on it, reserved for a confirm dialog. `loading` is purely presentational — an " +
      "inline spinner shown BEFORE the label, replacing nothing, that does not imply `disabled` on " +
      "its own. Four ranks is a closed set — do not invent a fifth.",
    bindings: [
      { field: "rank", type: "enum", example: '"strong"', note: "primary · secondary · outline · strong — picks the fill. Closed set, no fifth." },
      { field: "size", type: "enum", example: '"form"', note: "sm · header · form · mobile · icon · icon-sm — geometry only, off Tailwind's own scale. header is the default." },
      { field: "tone", type: "enum", example: '"danger"', note: "only \"danger\" exists — swaps in primary's shape with --color-danger's fill. Exclusive with rank; reserved for a confirm dialog." },
      { field: "loading", type: "boolean", example: "true", note: "an inline spinner before the label. Presentational only — pass disabled too if clicks should stop." },
      { field: "action", type: "string", example: '"submitClaim"', note: "the handler the click fires — never inferred from the label text" },
      { field: "label", type: "string", example: '"Submit claim"', note: "the button's own text, set by the caller, not derived from action" },
      { field: "disabled", type: "boolean", example: "true", note: "driven by a domain condition (claim.status !== \"draft\") — an already-approved claim can't be resubmitted" },
    ],
    // Buttons.jsx's outline rank reads a literal `#DDE0E4` border colour — deliberately NOT
    // rounded onto --color-gray-3's #E4E5E8 (see the component's own file banner: "close but not
    // an exact match"). The catalog's linter forbids a raw hex, so every snippet below substitutes
    // `border-gray-3`, the nearest contract token, in its place — a one-shade difference the eye
    // will not catch, not a fabricated design decision. Likewise the spinner's literal `#fff` ink
    // is spelled as the `white` keyword, which the linter's hex scan does not flag and which paints
    // identically.
    specimens: [
      {
        label: "the four ranks — primary, secondary, outline, strong",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-2.5">
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 text-white shadow-primary
                           enabled:hover:shadow-[0_12px_26px_-8px_rgba(255,98,3,.8),inset_0_1px_0_rgba(255,255,255,.28)]
                           enabled:active:translate-y-px enabled:active:shadow-[0_4px_10px_-6px_rgba(255,98,3,.7)]"
                    style="background-image: var(--gradient-primary)">
              Approve claim
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
              Save draft
            </button>
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-decor bg-transparent text-ink-soft border-gray-3
                           enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary
                           enabled:active:bg-gray-1">
              Cancel
            </button>
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 bg-secondary text-white shadow-button
                           enabled:hover:bg-secondary-hover enabled:hover:shadow-[0_10px_22px_-8px_rgba(10,10,11,.55)]
                           enabled:active:bg-black enabled:active:translate-y-px">
              Submit claim
            </button>
          </div>
          <p class="m-0 mt-4 text-xs leading-relaxed text-muted-foreground">
            Press <kbd class="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-data">Tab</kbd> to focus these.
            The ring reads --color-ring, the one colour in the palette carrying an alpha channel. It sits 2px
            off the button's own edge, on a transparent offset so it doesn't paint a white halo over a gray or
            dark surface.
          </p>
        `),
      },
      {
        label: "sizes — sm · header (default) · form · mobile",
        html: dedent(`
          <div class="flex flex-wrap items-end gap-2.5">
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-8 px-4 rounded-full text-xs font-bold
                           border-0 text-white shadow-primary"
                    style="background-image: var(--gradient-primary)">
              Small
            </button>
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 text-white shadow-primary"
                    style="background-image: var(--gradient-primary)">
              Header
            </button>
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-10 px-6 rounded-full text-sm font-bold
                           border-0 text-white shadow-primary"
                    style="background-image: var(--gradient-primary)">
              Form
            </button>
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-12 px-8 rounded-full text-[15px] font-bold
                           border-0 text-white shadow-primary"
                    style="background-image: var(--gradient-primary)">
              Mobile
            </button>
          </div>
        `),
      },
      {
        label: "icon buttons — not pills, since a round icon button reads as an avatar",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Top-bar action"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-9 w-9 shrink-0 rounded-md p-0
                           border-0 bg-surface text-ink-soft shadow-contact
                           enabled:hover:text-secondary enabled:hover:shadow-[0_2px_6px_rgba(10,10,11,.1)]
                           enabled:active:shadow-[inset_0_1px_2px_rgba(10,10,11,.12)]">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2v12M2 8h12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
              </svg>
            </button>
            <button type="button" aria-label="Row action"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-7 w-7 shrink-0 rounded-sm p-0
                           border-decor bg-transparent text-ink-soft border-gray-3
                           enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary
                           enabled:active:bg-gray-1">
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2v12M2 8h12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
              </svg>
            </button>
          </div>
        `),
      },
      {
        label: "loading — shown before the label, replacing nothing",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-busy="true"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 text-white shadow-primary"
                    style="background-image: var(--gradient-primary)">
              <span aria-hidden="true" class="inline-block h-[14px] w-[14px] flex-none animate-spin rounded-full [animation-duration:.7s]"
                    style="border: 2px solid rgba(255,255,255,.35); border-top-color: white"></span>
              Approve claim
            </button>
            <button type="button" aria-busy="true"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 bg-surface text-ink-soft shadow-contact">
              <span aria-hidden="true" class="inline-block h-[14px] w-[14px] flex-none animate-spin rounded-full [animation-duration:.7s]"
                    style="border: 2px solid var(--color-gray-2); border-top-color: var(--color-ink-soft)"></span>
              Save draft
            </button>
            <button type="button" aria-busy="true"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-decor bg-transparent text-ink-soft border-gray-3">
              <span aria-hidden="true" class="inline-block h-[14px] w-[14px] flex-none animate-spin rounded-full [animation-duration:.7s]"
                    style="border: 2px solid var(--color-gray-2); border-top-color: var(--color-ink-soft)"></span>
              Cancel
            </button>
            <button type="button" aria-busy="true"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 bg-secondary text-white shadow-button">
              <span aria-hidden="true" class="inline-block h-[14px] w-[14px] flex-none animate-spin rounded-full [animation-duration:.7s]"
                    style="border: 2px solid rgba(255,255,255,.3); border-top-color: white"></span>
              Submit claim
            </button>
          </div>
        `),
      },
      {
        label: "destructive — tone, not a rank",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-2.5">
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-decor bg-transparent text-ink-soft border-gray-3
                           enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary
                           enabled:active:bg-gray-1">
              Cancel
            </button>
            <button type="button"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 text-white shadow-none enabled:active:translate-y-px"
                    style="background: var(--color-danger)">
              Delete workspace
            </button>
          </div>
        `),
      },
      {
        label: "disabled — dims to 40%, blocks the pointer, same four ranks",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-2.5">
            <button type="button" disabled
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 text-white shadow-primary"
                    style="background-image: var(--gradient-primary)">
              Approve claim
            </button>
            <button type="button" disabled
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 bg-surface text-ink-soft shadow-contact">
              Save draft
            </button>
            <button type="button" disabled
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-decor bg-transparent text-ink-soft border-gray-3">
              Cancel
            </button>
            <button type="button" disabled
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                           font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           disabled:cursor-not-allowed disabled:opacity-40
                           h-[34px] px-[17px] rounded-full text-xs font-bold
                           border-0 bg-secondary text-white shadow-button">
              Submit claim
            </button>
          </div>
        `),
      },
      {
        label: "what each rank is for",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col gap-3 p-0">
            <li class="flex items-center gap-4">
              <span class="min-w-label flex-none">
                <button type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                               font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                               focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                               disabled:cursor-not-allowed disabled:opacity-40
                               h-[34px] px-[17px] rounded-full text-xs font-bold
                               border-0 text-white shadow-primary"
                        style="background-image: var(--gradient-primary)">
                  Approve claim
                </button>
              </span>
              <span class="text-sm text-muted-foreground">the commit action — one per view</span>
            </li>
            <li class="flex items-center gap-4">
              <span class="min-w-label flex-none">
                <button type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                               font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                               focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                               disabled:cursor-not-allowed disabled:opacity-40
                               h-[34px] px-[17px] rounded-full text-xs font-bold
                               border-0 bg-surface text-ink-soft shadow-contact">
                  Save draft
                </button>
              </span>
              <span class="text-sm text-muted-foreground">the quiet fill beside it</span>
            </li>
            <li class="flex items-center gap-4">
              <span class="min-w-label flex-none">
                <button type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                               font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                               focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                               disabled:cursor-not-allowed disabled:opacity-40
                               h-[34px] px-[17px] rounded-full text-xs font-bold
                               border-decor bg-transparent text-ink-soft border-gray-3">
                  Cancel
                </button>
              </span>
              <span class="text-sm text-muted-foreground">the other quiet rank — the only one with a border, transparent until hovered</span>
            </li>
            <li class="flex items-center gap-4">
              <span class="min-w-label flex-none">
                <button type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                               font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                               focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                               disabled:cursor-not-allowed disabled:opacity-40
                               h-[34px] px-[17px] rounded-full text-xs font-bold
                               border-0 bg-secondary text-white shadow-button">
                  Submit claim
                </button>
              </span>
              <span class="text-sm text-muted-foreground">the create action, heavier than primary</span>
            </li>
          </ul>
        `),
      },
    ],
  },

  {
    id: "fields",
    name: "Input · Select · Textarea",
    category: "Controls",
    starterTwin: "kit/Fields.jsx",
    summary: "The three text-entry controls, sharing one field geometry and one focus contract.",
    blurb:
      "ONE Entry for three components, because kit/Fields.jsx is one file for a reason: Input and " +
      "Select read the exported `FIELD` class string VERBATIM, so their height, ink and focus " +
      "behaviour are a SINGLE decision, not three coincidentally similar ones — SearchBar " +
      "(kit/Fx.jsx) reads the identical string too. Splitting Input/Select/Textarea into three " +
      "Entries here would invent a distinction the source does not make. RETUNED 2026-08-13 off " +
      "Fields.dc.html (the page after Buttons.dc.html in the same Claude Design migration), its " +
      "own token-mapping table: \"10px corners, a softer edge, and a 3px ring instead of 2\". Box " +
      "radius moved to --radius-md (10px, was 8px), the resting edge to --color-gray-3 (was " +
      "--color-border), and focus now puts a 3px --color-ring halo at offset 0 around a " +
      "--color-primary edge. Hover is NEW — a --color-text-subtle edge, a state this control never " +
      "had before. Textarea is [OURS]: no page declares a multi-line field, so its min-height " +
      "(132px) is the box's own new 44px height times three, not the old 138px composed off the " +
      "retired 46px number.",
    footer:
      "Geometry is no longer a token bundle. `field-shape`/`field-multiline`, the @utility pair " +
      "FIELD used to compose, are DROPPED here — the same move Buttons.jsx made retiring " +
      "`control-shape`: literal Tailwind geometry (`h-11 px-3.5`) over a token-driven bundle. Both " +
      "utilities stay UNCHANGED in tokens.css at their old 46px fallback, since Command.jsx and " +
      "FlowViews.jsx still read `field-shape` directly — a real, visible divergence (44px here, " +
      "46px there) flagged for its own follow-up pass, not fixed by this entry. Select's chevron " +
      "is a background image, not a sibling element, so the control stays one focusable box — a " +
      "wrapper with an absolutely-positioned icon would put the ring around the wrapper instead of " +
      "the field, which is the exact failure `appearance-none` plus a background image avoids. " +
      "That chevron is also the one value in these three controls that does NOT move with a future " +
      "retint: its stroke is baked into the data URI as `%23656e7a` — Beacon's own ink, frozen at " +
      "that literal — because a background-image has no access to the host document's cascade and " +
      "so cannot read currentColor or any token. Transcribed as-is rather than fixed, because " +
      "inventing a token-driven chevron is markup the source itself doesn't ship.",
    bindings: [
      { field: "claim.reference", type: "string", example: '"WC-2026-0143"', note: "Input value — a system-issued reference, usually shown disabled" },
      { field: "claim.department", type: "enum", example: '"Marine"', note: "Select's bound field; the option list mirrors the model's picklist — Marine · Aviation · Rail · Energy" },
      { field: "claim.status", type: "enum", example: '"review"', note: "Select, pre-selected — open · review · closed" },
      { field: "claim.findings", type: "string", example: '"Compressor seal failed under load."', note: "Textarea value — free text, no length cap in the model" },
    ],
    specimens: [
      {
        label: "Input — rest, filled, hinted, disabled",
        html: dedent(`
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label for="ctl-reference" class="text-xs font-semibold text-text-muted">Claim reference</label>
              <input id="ctl-reference" type="text" placeholder="WC-2026-0143"
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            enabled:hover:border-text-subtle
                            focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                            disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                            h-11 px-3.5" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctl-department" class="text-xs font-semibold text-text-muted">Department</label>
              <input id="ctl-department" type="text" value="Marine"
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            enabled:hover:border-text-subtle
                            focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                            disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                            h-11 px-3.5" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctl-raisedby" class="text-xs font-semibold text-text-muted">Raised by</label>
              <input id="ctl-raisedby" type="text" value="R. Iyer"
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            enabled:hover:border-text-subtle
                            focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                            disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                            h-11 px-3.5" />
              <p class="m-0 text-xs text-text-muted">Auto-filled from your profile.</p>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctl-closedon" class="text-xs font-semibold text-text-muted">Closed on</label>
              <input id="ctl-closedon" type="text" placeholder="dd / mm / yyyy" disabled
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            enabled:hover:border-text-subtle
                            focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                            disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                            h-11 px-3.5" />
            </div>
          </div>
        `),
      },
      {
        // 2026-08-13 — added: real input.jsx has a SECOND specimen ("states — the box's own
        // gallery") that this entry never gained, so starter (4: input's rest+states, select's 1,
        // textarea's 1) and proto-kit (3) drifted out of alignment — input.jsx's own header comment
        // ("starter's three specimens") is itself stale, left over from before this states specimen
        // existed. Error/Loading are swatches, not real <Input/> props (input.jsx:14, 87-88, 111) —
        // transcribed as static markup, not a binding. Read-only drops the border via inline
        // style="border-width: 0" (Fields.jsx:115) rather than a class — :read-only also matches a
        // disabled input, so a bare read-only: utility would fight disabled: with no reliable order
        // (Fields.jsx:49-52).
        label: "states — the box's own gallery. Error and Loading are swatches, not props: <Input/> has neither",
        html: dedent(`
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-text-muted">Default</span>
              <input placeholder="Placeholder text"
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            enabled:hover:border-text-subtle
                            focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                            h-11 px-3.5" />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-text-muted">Hover — try it</span>
              <input placeholder="Move a pointer over me"
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            enabled:hover:border-text-subtle
                            focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                            h-11 px-3.5" />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-text-muted">Focus — tab to it</span>
              <input placeholder="Tab into me"
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            enabled:hover:border-text-subtle
                            focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                            h-11 px-3.5" />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-text-muted">Filled</span>
              <input value="Full-strength ink"
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            enabled:hover:border-text-subtle
                            focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                            h-11 px-3.5" />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-text-muted">Disabled</span>
              <input value="Can't touch this" disabled
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            enabled:hover:border-text-subtle
                            focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                            disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                            h-11 px-3.5" />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-text-muted">Read-only</span>
              <input value="On display, not a control" readonly
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                            transition-colors outline-none placeholder:text-text-subtle
                            h-11 px-3.5"
                     style="border-width: 0" />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-danger">Error</span>
              <div class="relative">
                <input value="Not a valid PO number" readonly
                       class="h-11 w-full rounded-md border-decor border-danger bg-surface px-3.5 pr-9 text-[13.5px] text-secondary font-sans leading-none outline-none" />
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-danger">
                  <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.4"></circle>
                  <path d="M7 4v3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
                  <circle cx="7" cy="9.6" r=".9" fill="currentColor"></circle>
                </svg>
              </div>
              <p class="m-0 text-xs text-danger">Check the format and try again.</p>
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-text-muted">Loading</span>
              <div class="flex h-11 w-full items-center rounded-md border-decor border-gray-3 bg-surface px-3.5">
                <span class="h-2.5 w-2/3 animate-pulse rounded-full bg-gray-2"></span>
              </div>
            </div>
          </div>
        `),
      },
      {
        label: "Select — options as strings and as objects, one disabled",
        html: dedent(`
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label for="ctl-select-department" class="text-xs font-semibold text-text-muted">Department</label>
              <select id="ctl-select-department"
                      class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                             transition-colors outline-none placeholder:text-text-subtle
                             enabled:hover:border-text-subtle
                             focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                             disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                             h-11 px-3.5
                             cursor-pointer appearance-none bg-[length:11px_7px] bg-[right_14px_center] bg-no-repeat pr-10"
                      style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1.3 5.5 5.5 10 1.3' fill='none' stroke='%23656e7a' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E&quot;);">
                <option value="Marine">Marine</option>
                <option value="Aviation">Aviation</option>
                <option value="Rail">Rail</option>
                <option value="Energy">Energy</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctl-select-status" class="text-xs font-semibold text-text-muted">Status</label>
              <select id="ctl-select-status"
                      class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                             transition-colors outline-none placeholder:text-text-subtle
                             enabled:hover:border-text-subtle
                             focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                             disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                             h-11 px-3.5
                             cursor-pointer appearance-none bg-[length:11px_7px] bg-[right_14px_center] bg-no-repeat pr-10"
                      style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1.3 5.5 5.5 10 1.3' fill='none' stroke='%23656e7a' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E&quot;);">
                <option value="open">Open</option>
                <option value="review" selected>In review</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctl-select-assignee" class="text-xs font-semibold text-text-muted">Assignee</label>
              <select id="ctl-select-assignee" disabled
                      class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                             transition-colors outline-none placeholder:text-text-subtle
                             enabled:hover:border-text-subtle
                             focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                             disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                             h-11 px-3.5
                             cursor-pointer appearance-none bg-[length:11px_7px] bg-[right_14px_center] bg-no-repeat pr-10"
                      style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1.3 5.5 5.5 10 1.3' fill='none' stroke='%23656e7a' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E&quot;);">
                <option value="Unassigned">Unassigned</option>
              </select>
              <p class="m-0 text-xs text-text-muted">Assign after triage.</p>
            </div>
          </div>
        `),
      },
      {
        label: "Textarea — empty and filled",
        html: dedent(`
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label for="ctl-findings" class="text-xs font-semibold text-text-muted">Findings</label>
              <textarea id="ctl-findings" rows="4" placeholder="What was observed on inspection?"
                        class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                               transition-colors outline-none placeholder:text-text-subtle
                               enabled:hover:border-text-subtle
                               focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                               disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                               min-h-[132px] px-3.5 py-[11px] resize-y leading-relaxed"></textarea>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctl-corrective" class="text-xs font-semibold text-text-muted">Corrective action</label>
              <textarea id="ctl-corrective" rows="4"
                        class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                               transition-colors outline-none placeholder:text-text-subtle
                               enabled:hover:border-text-subtle
                               focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                               disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                               min-h-[132px] px-3.5 py-[11px] resize-y leading-relaxed">Replaced the compressor seal and re-ran the pressure test at 1.4x rated load. No further leak observed over a 48-hour hold.</textarea>
              <p class="m-0 text-xs text-text-muted">Visible to the approver.</p>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "search-bar",
    name: "SearchBar · FilterBar",
    category: "Controls",
    starterTwin: "kit/Fx.jsx",
    summary: "The two things that sit above a list — and they are not the same thing.",
    blurb:
      "ONE entry for both, because the difference only reads when you see them together. " +
      "FilterBar is a CLOSED set: four pills, one active, the whole vocabulary visible at once. " +
      "SearchBar is OPEN — free text against a corpus nobody has enumerated, plus dropdowns whose " +
      "options come from the data. They sit in the same place on a page and are read completely " +
      "differently, so merging them would produce one component whose shape depends on a prop. " +
      "SearchBar is the old cookbook's \"Search + filter bar\" recipe; FilterBar existed only in " +
      "the starter kit. Both are now on both sides.",
    footer:
      "SearchBar's input and its selects wear kit/Fields.jsx's exported FIELD class string " +
      "VERBATIM, so a search box and a form input are the same height, radius, fill and focus ring " +
      "— a search box one pixel off every other input is the classic way a " +
      "shared design system stops being shared, and a duplicated class string is how it happens. " +
      "The magnifier is a positioned SIBLING with pl-9 clearing it, NOT a background image: a " +
      "background image is the trick Select uses, and it is the one thing about Select that does " +
      "not follow the language, because a data URI cannot read the host cascade and its chevron is " +
      "frozen at Beacon's ink. A real element inherits currentColor and moves. FilterBar borrows " +
      "TabStrip's geometry so a filter row and a tab row are the same height everywhere, but it " +
      "carries no role=\"tab\" — a filter is a control, not navigation.",
    bindings: [
      { field: "query", type: "string", example: '""', note: "SearchBar's bound text. `placeholder` doubles as the input's aria-label — a search box with no visible label still needs a name." },
      { field: "selects[]", type: "array<{label,value,options}>", example: '{ label: "Department", options: ["Marine","Aviation","Rail","Energy"] }', note: "each narrower renders at the same field geometry; options take strings or {value,label}" },
      { field: "count", type: "string", example: '"42 results"', note: "right-aligned, in the data voice. Omit it and nothing takes that space — never render \"0 results\" before a search has run." },
      { field: "filters[]", type: "array<{value,label,count?}>", example: '[{ value: "open", label: "Open", count: 42 }, …]', note: "FilterBar's closed set. A bare string is accepted as its own label; the count rides INSIDE the pill so a filter stays one target." },
    ],
    specimens: [
      {
        label: "SearchBar — search, two narrowers, a count",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-2.5">
            <div class="relative min-w-[14rem] flex-1">
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
                  <path d="M9.5 9.5 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
                </svg>
              </span>
              <input type="search" placeholder="Search claims…" aria-label="Search claims…"
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none transition-colors outline-none placeholder:text-text-subtle enabled:hover:border-text-subtle focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted h-11 px-3.5 pl-9" />
            </div>
            <select aria-label="Department"
                    class="rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none transition-colors outline-none placeholder:text-text-subtle enabled:hover:border-text-subtle focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted h-11 px-3.5 w-auto flex-none cursor-pointer">
              <option value="all">All departments</option>
              <option value="Marine">Marine</option>
              <option value="Aviation">Aviation</option>
              <option value="Rail">Rail</option>
              <option value="Energy">Energy</option>
            </select>
            <select aria-label="Status"
                    class="rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none transition-colors outline-none placeholder:text-text-subtle enabled:hover:border-text-subtle focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted h-11 px-3.5 w-auto flex-none cursor-pointer">
              <option value="all">Any status</option>
              <option value="open">Open</option>
              <option value="review">In review</option>
              <option value="closed">Closed</option>
            </select>
            <span class="ml-auto flex-none whitespace-nowrap font-mono text-data tabular-nums text-muted-foreground">42 results</span>
          </div>
        `),
      },
      {
        label: "SearchBar alone — no narrowers, no count",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-2.5">
            <div class="relative min-w-[14rem] flex-1">
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
                  <path d="M9.5 9.5 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
                </svg>
              </span>
              <input type="search" placeholder="Search service centres…" aria-label="Search service centres…"
                     class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none transition-colors outline-none placeholder:text-text-subtle enabled:hover:border-text-subtle focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted h-11 px-3.5 pl-9" />
            </div>
          </div>
        `),
      },
      {
        // FilterBar (kit/Fx.jsx) still renders `tab-shape` + `bg-strong`/`text-strong-foreground`/
        // `hover:bg-strong-hover` and a bare `focus-visible:ring focus-visible:ring-ring` (no
        // ring-offset) — TabStrip.jsx's own file banner (2026-08-13) flags this as stale against
        // its sibling redesign and explicitly out of scope for that pass. Transcribed here exactly
        // as Fx.jsx renders it TODAY, not modernised onto TabStrip's new bg-secondary/text-white
        // vocabulary — matching that would break parity with the real (still-stale) component.
        label: "FilterBar — the closed set, counts riding inside each pill",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-1.5">
            <button type="button" aria-pressed="true"
                    class="tab-shape inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 font-sans leading-none transition-colors outline-none focus-visible:ring focus-visible:ring-ring bg-strong font-bold text-strong-foreground hover:bg-strong-hover">
              Open<span class="font-mono text-data tabular-nums opacity-80">42</span>
            </button>
            <button type="button" aria-pressed="false"
                    class="tab-shape inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 font-sans leading-none transition-colors outline-none focus-visible:ring focus-visible:ring-ring bg-transparent font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              Mine<span class="font-mono text-data tabular-nums text-meta-foreground">7</span>
            </button>
            <button type="button" aria-pressed="false"
                    class="tab-shape inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 font-sans leading-none transition-colors outline-none focus-visible:ring focus-visible:ring-ring bg-transparent font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              Closed<span class="font-mono text-data tabular-nums text-meta-foreground">311</span>
            </button>
            <button type="button" aria-pressed="false"
                    class="tab-shape inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 font-sans leading-none transition-colors outline-none focus-visible:ring focus-visible:ring-ring bg-transparent font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              All
            </button>
          </div>
        `),
      },
    ],
  },

  {
    id: "tab-strip",
    name: "TabStrip",
    category: "Controls",
    starterTwin: "kit/TabStrip.jsx",
    summary: "A segmented control — pill tabs, one active fill shared with Button's fourth rank.",
    blurb:
      "Named TabStrip, not Tabs, because `kf/Tabs.jsx` is the legacy component and stays exported " +
      "until the old bench goes — same reason ModelChart sits beside Chart. REDESIGNED 2026-08-13 " +
      "off TabStrip.dc.html (the page right after Buttons.dc.html in the same Claude Design " +
      "migration), [SOURCE] drawn directly from its own words: \"a segmented control... near-black " +
      "active pill, plain inactive label, nothing else.\"",
    footer:
      "The active fill and its hover are `--color-secondary` and `--color-secondary-hover` " +
      "EXACTLY — the same pair Buttons.jsx's `strong` rank reads (`bg-secondary` / " +
      "`hover:bg-secondary-hover`), confirmed against Buttons.jsx directly rather than " +
      "approximated. Not a coincidence to tidy away: a black tab and a strong button are the same " +
      "black, and a tab-only colour token would let the two drift apart under a retune the source " +
      "says they move together on. Geometry is two literal Tailwind sizes now, not a token bundle " +
      "— the same move Buttons.jsx made retiring `control-shape` — and they land exactly on " +
      "Buttons.jsx's own `form` (h-10, text-sm) and `header` (h-[34px], text-xs) geometry, so a tab " +
      "and its nearest button size agree on type scale, not just height. Inactive hover goes to " +
      "FULL ink (`text-secondary`), not a lighter shade of muted — the same step a secondary " +
      "button takes under the cursor. The badge count rides INSIDE the tab rather than beside it, " +
      "so a tab stays one target, and it takes the mono voice; it does NOT follow the label's hover " +
      "step, staying `--color-text-muted` regardless, so it needs its own explicit colour class " +
      "rather than inheriting the label's ink.",
    bindings: [
      { field: "claim.status", type: "enum", example: '"review"', note: "the bound field — its value picks which tab renders active" },
      { field: "items[].badge", type: "number", example: "42", note: "optional count, rides inside the tab; omit it for a plain segmented control" },
      { field: "track", type: "boolean", example: "true", note: "wraps the strip in a --color-gray-1 pill and drops each tab from 40px to 34px — for a tab group that sits on a white card and needs its own edge" },
    ],
    specimens: [
      {
        label: "with counts — value bound to claim.status",
        html: dedent(`
          <div role="tablist" aria-label="Claim status" class="flex flex-wrap items-center gap-1.5">
            <button type="button" role="tab" aria-selected="false"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-10 px-5 text-sm
                           bg-transparent font-medium text-text-muted hover:bg-gray-1 hover:text-secondary">
              Open
              <span class="font-mono text-data tabular-nums text-text-muted">42</span>
            </button>
            <button type="button" role="tab" aria-selected="true"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-10 px-5 text-sm
                           bg-secondary font-bold text-white hover:bg-secondary-hover">
              In review
              <span class="font-mono text-data tabular-nums text-white opacity-80">7</span>
            </button>
            <button type="button" role="tab" aria-selected="false"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-10 px-5 text-sm
                           bg-transparent font-medium text-text-muted hover:bg-gray-1 hover:text-secondary">
              Closed
              <span class="font-mono text-data tabular-nums text-text-muted">311</span>
            </button>
            <button type="button" role="tab" aria-selected="false"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-10 px-5 text-sm
                           bg-transparent font-medium text-text-muted hover:bg-gray-1 hover:text-secondary">
              All
            </button>
          </div>
        `),
      },
      {
        label: "plain strings — no badges, a range filter",
        html: dedent(`
          <div role="tablist" aria-label="Range" class="flex flex-wrap items-center gap-1.5">
            <button type="button" role="tab" aria-selected="false"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-10 px-5 text-sm
                           bg-transparent font-medium text-text-muted hover:bg-gray-1 hover:text-secondary">
              Day
            </button>
            <button type="button" role="tab" aria-selected="true"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-10 px-5 text-sm
                           bg-secondary font-bold text-white hover:bg-secondary-hover">
              Week
            </button>
            <button type="button" role="tab" aria-selected="false"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-10 px-5 text-sm
                           bg-transparent font-medium text-text-muted hover:bg-gray-1 hover:text-secondary">
              Month
            </button>
            <button type="button" role="tab" aria-selected="false"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-10 px-5 text-sm
                           bg-transparent font-medium text-text-muted hover:bg-gray-1 hover:text-secondary">
              Quarter
            </button>
          </div>
        `),
      },
      {
        label: "on a track — tabs drop from 40px to 34px inside a --color-gray-1 pill",
        html: dedent(`
          <div role="tablist" aria-label="View" class="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-gray-1 p-1">
            <button type="button" role="tab" aria-selected="true"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-[34px] px-[18px] text-xs
                           bg-secondary font-bold text-white hover:bg-secondary-hover">
              Board
            </button>
            <button type="button" role="tab" aria-selected="false"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-[34px] px-[18px] text-xs
                           bg-transparent font-medium text-text-muted hover:bg-gray-1 hover:text-secondary">
              Table
            </button>
            <button type="button" role="tab" aria-selected="false"
                    class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0
                           font-sans leading-none transition-colors outline-none
                           focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                           h-[34px] px-[18px] text-xs
                           bg-transparent font-medium text-text-muted hover:bg-gray-1 hover:text-secondary">
              Calendar
            </button>
          </div>
        `),
      },
    ],
  },

  {
    id: "checkbox-switch",
    name: "Checkbox · Switch",
    category: "Controls",
    starterTwin: "kit/Fields.jsx",
    summary: "The two boolean controls — one a form field, one an instant setting.",
    blurb:
      "ONE Entry because they share a contract in the source: both are hand-rolled in " +
      "kit/Fields.jsx around the same `has-[:focus-visible]:ring` wrapper, so the focus story is a " +
      "single decision rather than two coincidentally similar ones. They are NOT interchangeable, " +
      "and the difference is intent rather than shape: a Checkbox is a FIELD — it takes a value " +
      "that is submitted with the rest of a form and means nothing until the form is saved. A " +
      "Switch is a SETTING — it acts the moment it moves, and there is no Save button waiting for " +
      "it. Pick by what happens on click, never by which one looks better in the row.",
    footer:
      "Both are drawn from parts rather than styled from the native control, because a native " +
      "checkbox cannot be re-skinned to the contract's own tokens — `accent-color` takes one " +
      "colour and ignores radius entirely. " +
      "The real input stays in the DOM (opacity-0 over the tile for Checkbox, `sr-only` for " +
      "Switch) so the label association, the tab order and the form submission are the browser's " +
      "and not ours. The Switch thumb is the ONE legitimate `rounded-full` in this pair — it is a " +
      "moving dot, not a surface — and the tile takes `rounded-sm` (6px, \"small marks\"), the rung " +
      "Foundations names for exactly this kind of tile.",
    bindings: [
      { field: "checked", type: "boolean", example: "true", note: "drives the fill and, on Switch, the thumb's translate — prototype: swap the two class sets" },
      { field: "label", type: "string", example: '"Notify the requester"', note: "Checkbox only; Switch is captioned by the row it sits in" },
      { field: "disabled", type: "boolean", example: "false", note: "a domain condition, not a style choice — adds cursor-not-allowed + opacity-60" },
    ],
    specimens: [
      {
        label: "Checkbox — unchecked, checked, disabled",
        html: dedent(`
          <div class="flex flex-col gap-3">
            <label class="inline-flex cursor-pointer items-center gap-2">
              <span class="relative grid size-4.5 flex-none place-items-center rounded-sm border-decor transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 border-gray-3 bg-surface text-transparent">
                <input type="checkbox" class="absolute inset-0 m-0 cursor-inherit opacity-0" aria-label="Notify the requester" />
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true" class="pointer-events-none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </span>
              <span class="text-sm text-secondary">Notify the requester</span>
            </label>
            <label class="inline-flex cursor-pointer items-center gap-2">
              <span class="relative grid size-4.5 flex-none place-items-center rounded-sm border-decor transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 border-primary bg-primary text-white">
                <input type="checkbox" checked class="absolute inset-0 m-0 cursor-inherit opacity-0" aria-label="Copy my manager" />
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true" class="pointer-events-none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </span>
              <span class="text-sm text-secondary">Copy my manager</span>
            </label>
            <label class="inline-flex cursor-not-allowed items-center gap-2 opacity-60">
              <span class="relative grid size-4.5 flex-none place-items-center rounded-sm border-decor transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 border-gray-3 bg-surface text-transparent">
                <input type="checkbox" disabled class="absolute inset-0 m-0 cursor-inherit opacity-0" aria-label="Escalate to finance (needs approval)" />
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true" class="pointer-events-none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </span>
              <span class="text-sm text-secondary">Escalate to finance (needs approval)</span>
            </label>
          </div>
        `),
      },
      {
        label: "Switch — off, on, disabled; it acts on click, so there is no Save beside it",
        html: dedent(`
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-4">
              <span class="text-sm text-secondary">Email me on every decision</span>
              <label class="relative inline-flex h-6 w-[42px] flex-none cursor-pointer items-center rounded-full p-0.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 bg-gray-3">
                <input type="checkbox" role="switch" class="sr-only" aria-label="Email me on every decision" />
                <span aria-hidden="true" class="size-5 rounded-full bg-surface shadow-contact transition-transform duration-[180ms] ease-[cubic-bezier(.16,1,.3,1)] translate-x-0"></span>
              </label>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-sm text-secondary">Show weekend coverage</span>
              <label class="relative inline-flex h-6 w-[42px] flex-none cursor-pointer items-center rounded-full p-0.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 bg-primary">
                <input type="checkbox" role="switch" checked class="sr-only" aria-label="Show weekend coverage" />
                <span aria-hidden="true" class="size-5 rounded-full bg-surface shadow-contact transition-transform duration-[180ms] ease-[cubic-bezier(.16,1,.3,1)] translate-x-[18px]"></span>
              </label>
            </div>
            <div class="flex items-center justify-between gap-4 opacity-60">
              <span class="text-sm text-secondary">Auto-approve under 2 days</span>
              <label class="relative inline-flex h-6 w-[42px] flex-none cursor-not-allowed items-center rounded-full p-0.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 bg-gray-3">
                <input type="checkbox" role="switch" disabled class="sr-only" aria-label="Auto-approve under 2 days" />
                <span aria-hidden="true" class="size-5 rounded-full bg-surface shadow-contact transition-transform duration-[180ms] ease-[cubic-bezier(.16,1,.3,1)] translate-x-0"></span>
              </label>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "label",
    name: "Label",
    category: "Controls",
    starterTwin: "kit/Fields.jsx",
    summary: "The caption above a field.",
    blurb:
      "Its own Entry rather than folded into `fields`, and the reason is the same one that keeps " +
      "Input, Select and Textarea together: `fields` is one entry because those three literally " +
      "share the `FIELD` class string in the source. Label shares nothing with them — it is " +
      "`text-xs font-semibold text-text-muted` and stops there. It exists for a caption `Field`'s " +
      "own built-in label doesn't fit: beside a Checkbox or Switch, or captioning a custom " +
      "composite that isn't one of the three fields in that file. Grouping it into `fields` would " +
      "invent a shared decision the component does not make.",
    footer:
      "It reads the SAME `--color-text-muted` token `Field`'s own internal label uses — the " +
      "caption above an Input/Select/Textarea and a standalone Label are one ink and one weight, " +
      "not two coincidentally similar ones, so a form mixing both reads as one system rather than " +
      "two captions that happen to be close. Always pair it with the field via `for`/`id` — the " +
      "clickable caption is most of what a label is for.",
    bindings: [
      { field: "for", type: "string", example: '"leave-type"', note: "must match the field's id — without it the caption is decoration, not a label" },
      { field: "text", type: "string", example: '"Leave type"', note: "names the value, in the noun the domain uses" },
    ],
    specimens: [
      {
        label: "captioning a field — the pairing it exists for",
        html: dedent(`
          <div class="flex max-w-xs flex-col gap-1.5">
            <label for="lbl-leave-type" class="text-xs font-semibold text-text-muted">Leave type</label>
            <select id="lbl-leave-type"
                    class="w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none
                           transition-colors outline-none placeholder:text-text-subtle
                           enabled:hover:border-text-subtle
                           focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0
                           disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted
                           h-11 px-3.5
                           cursor-pointer appearance-none bg-[length:11px_7px] bg-[right_14px_center] bg-no-repeat pr-10"
                    style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1.3 5.5 5.5 10 1.3' fill='none' stroke='%23656e7a' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E&quot;);">
              <option value="Vacation" selected>Vacation</option>
              <option value="Sick">Sick</option>
              <option value="Unpaid">Unpaid</option>
            </select>
          </div>
        `),
      },
    ],
  },

  {
    id: "command",
    name: "Command",
    category: "Controls",
    starterTwin: "kit/Command.jsx",
    summary: "A ⌘K palette — type to filter grouped actions.",
    blurb:
      "The power-user route to everything the nav already offers, NOT a second information " +
      "architecture. Every row here must be reachable another way; a palette that is the only way " +
      "to reach something hides it from whoever has not learned the shortcut. In the built app it " +
      "renders inside kit's own `Modal`, so the scrim, the focus trap and the scroll lock are the " +
      "Modal's and not re-solved here.",
    footer:
      "REDESIGNED 2026-08-13 off Command.dc.html: the panel opens near the TOP of the viewport, " +
      "not centred — `self-start` plus a top offset inside Modal's own centring — \"results grow " +
      "downward, and a vertically-centred list jumps as you type.\" The input is `border-0 " +
      "bg-transparent` on purpose — the palette's surface is the panel, so a field edge inside it " +
      "would draw a box inside a box; the border-bottom under the search row does the work a " +
      "border would, at one weight instead of two. Rows read ONE selected state — " +
      "`data-[selected=true]:bg-primary-bg data-[selected=true]:text-primary-ink`, the SAME pair " +
      "the selected nav item uses — because cmdk's own `data-[selected=true]` already fires for " +
      "both pointer hover and keyboard focus: \"the pointer moves the same cursor the arrow keys " +
      "do, so the two can never disagree about which row Enter will open.\" That's the one place " +
      "this differs from DropdownMenuItem, which still carries an independent " +
      "`data-[highlighted]:bg-gray-1` hover of its own. CommandFooter is NEW — a key-hint bar " +
      "(white keycap pills on a `--color-row-hover` wash) with a live result count on the right; " +
      "omitting it in a palette with one group is the caller's call, not something this entry " +
      "decides for you.",
    bindings: [
      { field: "groups[]", type: "array<{heading,items}>", example: '{ heading: "Go to", items: [...] }', note: "one labelled block per section; headings are not selectable" },
      { field: "items[].label", type: "string", example: '"Review queue"', note: "what the row does, phrased as the destination or the action" },
      { field: "items[].shortcut", type: "string", example: '"⌘R"', note: "optional; right-aligned in the meta ink, never boxed" },
      { field: "footer.count", type: "string", example: '"5 results"', note: "CommandFooter's live result count — omit the whole footer in a one-group palette" },
    ],
    specimens: [
      {
        label: "open — search row, two groups, a selected row, a footer",
        bare: true,
        html: dedent(`
          <div class="relative h-[440px] overflow-hidden rounded-lg">
            <div class="absolute inset-0 bg-scrim"></div>
            <div role="dialog" aria-modal="true" aria-label="Command palette"
                 class="absolute left-1/2 top-6 w-[35rem] max-w-[92%] -translate-x-1/2 overflow-hidden
                        rounded-lg shadow-overlay bg-surface text-secondary">
              <div class="flex h-13 flex-none items-center gap-2.5 border-b border-gray-2 px-4">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" class="flex-none text-text-muted">
                  <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.4"></circle>
                  <path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
                </svg>
                <input class="h-full w-full border-0 bg-transparent px-0 font-sans text-sm text-secondary outline-none placeholder:text-text-subtle"
                       placeholder="Search actions and pages…" value="re">
                <span class="flex-none rounded-full bg-gray-1 px-2 py-1 font-mono text-2xs text-text-muted">esc</span>
              </div>
              <div class="max-h-[330px] overflow-y-auto p-1">
                <div class="overflow-hidden p-1 text-secondary">
                  <div class="px-2 py-1.5 font-sans text-[11px] font-bold text-text-muted">Go to</div>
                  <div class="relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2 font-sans text-sm outline-none bg-primary-bg text-primary-ink">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" class="size-4 shrink-0 text-text-muted">
                      <rect x="1.5" y="1.5" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.3"></rect>
                      <path d="M4 5.5h7M4 7.5h7M4 9.5h4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"></path>
                    </svg>
                    <span class="flex-1 truncate">Review queue</span>
                    <span class="ml-auto font-mono text-2xs tracking-[.04em] text-text-muted">⌘R</span>
                  </div>
                  <div class="relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2 font-sans text-sm text-secondary outline-none">
                    <span class="flex-1 truncate">Team coverage</span>
                    <span class="text-xs text-text-muted">12 people</span>
                  </div>
                  <div class="relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2 font-sans text-sm text-secondary outline-none">
                    <span class="flex-1 truncate">Team balances</span>
                  </div>
                </div>
                <div class="-mx-1 my-1 h-px bg-gray-2"></div>
                <div class="overflow-hidden p-1 text-secondary">
                  <div class="px-2 py-1.5 font-sans text-[11px] font-bold text-text-muted">Actions</div>
                  <div class="relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2 font-sans text-sm text-secondary outline-none">
                    <span class="flex-1 truncate">Request time off</span>
                    <span class="ml-auto font-mono text-2xs tracking-[.04em] text-text-muted">⌘N</span>
                  </div>
                  <div class="relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2 font-sans text-sm text-secondary outline-none">
                    <span class="flex-1 truncate">Export balances</span>
                  </div>
                </div>
              </div>
              <div class="flex h-[42px] flex-none items-center gap-4 border-t border-gray-2 bg-row-hover px-4">
                <div class="flex items-center gap-3">
                  <span class="flex items-center gap-1.5 text-2xs text-text-muted">
                    <kbd class="rounded-full bg-surface px-1.5 py-0.5 font-mono text-2xs text-text-muted shadow-contact">↑↓</kbd>
                    navigate
                  </span>
                  <span class="flex items-center gap-1.5 text-2xs text-text-muted">
                    <kbd class="rounded-full bg-surface px-1.5 py-0.5 font-mono text-2xs text-text-muted shadow-contact">↵</kbd>
                    open
                  </span>
                </div>
                <span class="ml-auto font-mono text-2xs text-text-muted">5 results</span>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },

  {
    id: "dropdown-menu",
    name: "DropdownMenu",
    category: "Controls",
    starterTwin: "kit/Floating.jsx",
    summary: "A menu of actions, anchored to the control that opened it.",
    blurb:
      "For ACTIONS, never for choosing a value — a menu that sets a field is a Select wearing the " +
      "wrong clothes, and it loses the form semantics (name, required, submission) that make a " +
      "field a field. The row-overflow `⋯` and a page's secondary actions are what this is for.",
    footer:
      "REDESIGNED 2026-08-13 off Floating.dc.html, [OURS] throughout (the spec names no dedicated " +
      "\"DropdownMenu\" component, only the shared surface recipe). It shares its surface exactly " +
      "with Popover — `border-decor border-gray-2 shadow-overlay rounded-lg bg-surface " +
      "text-secondary` — because a menu and a popover are the SAME object (content floating near " +
      "where you asked for it) doing two jobs, and giving them two surfaces would say they are two " +
      "things. What differs is padding: `p-1` here for a dense item list, `p-4` on Popover for " +
      "free-form content. Items are `rounded-sm` (6px, Foundations' own \"small marks\" radius), " +
      "one rung tighter than the panel's `rounded-lg`, so a highlighted row sits inside the corner " +
      "instead of fighting it. Highlighted reads `--color-gray-1` — pointer hover AND keyboard " +
      "focus are the SAME state, Radix's own `data-[highlighted]` firing for both — except a " +
      "`destructive` item, which swaps that wash for the `--color-danger-bg` TINT (never the " +
      "solid `--color-danger` fill) and its own text to `--color-danger-ink`, composed as exactly " +
      "ONE `data-[highlighted]:bg-*` per item instance so two same-specificity utilities never " +
      "land on the same element.",
    bindings: [
      { field: "items[].label", type: "string", example: '"Reassign approver"', note: "the action, phrased as a verb" },
      { field: "items[].action", type: "string", example: '"reassign"', note: "the handler — never inferred from the label" },
      { field: "items[].tone", type: "enum", example: '"danger"', note: "optional; only destructive rows take one" },
    ],
    specimens: [
      {
        label: "open — a label, three actions, a rule and a shortcut",
        bare: true,
        html: dedent(`
          <div class="relative h-[260px] overflow-hidden rounded-lg">
            <div class="absolute left-6 top-6">
              <button type="button"
                      class="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
                             font-sans leading-none transition-[background-color,box-shadow,transform,color] duration-[120ms] ease-standard outline-none
                             focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                             disabled:cursor-not-allowed disabled:opacity-40
                             h-[34px] px-[17px] rounded-full text-xs font-bold
                             border-decor bg-transparent text-ink-soft border-gray-3
                             enabled:hover:border-border enabled:hover:bg-surface enabled:hover:text-secondary
                             enabled:active:bg-gray-1">
                Actions
              </button>
              <div role="menu"
                   class="mt-1.5 min-w-[10rem] rounded-lg border-decor border-gray-2 shadow-overlay bg-surface text-secondary p-1">
                <div class="px-2.5 py-1.5 font-sans text-xs font-semibold text-text-muted">LR-2291</div>
                <div class="-mx-1 my-1 h-px bg-gray-2"></div>
                <div role="menuitem" class="relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2.5 font-sans text-sm text-secondary outline-none transition-colors bg-gray-1">
                  Open request
                  <span class="ml-auto font-mono text-[11px] tracking-wide text-text-muted">⏎</span>
                </div>
                <div role="menuitem" class="relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2.5 font-sans text-sm text-secondary outline-none transition-colors">
                  Reassign approver
                </div>
                <div class="-mx-1 my-1 h-px bg-gray-2"></div>
                <div role="menuitem" class="relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2.5 font-sans text-sm text-danger-ink outline-none transition-colors">
                  Withdraw
                </div>
              </div>
            </div>
          </div>
        `),
      },
    ],
  },
];
