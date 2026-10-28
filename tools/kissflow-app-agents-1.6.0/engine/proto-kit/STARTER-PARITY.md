# proto-kit ← starter kit — structural parity spec (2026-08-09)

The goal, in the user's words: proto-kit and starter kit should have **the same components, the same
UI, the same themes** — same layout, same structure, same everything. The ONE permitted difference is
substance: starter kit ships **real React components**; proto-kit ships **HTML snippets**.

This doc records what starter kit actually is, structurally, so proto-kit can be rebuilt to match.
Companion to [COMPONENT-GAPS.md](./COMPONENT-GAPS.md) — **also superseded, see its banner.**

> **Language set changed twice more since this was written, 2026-08-12.** Everything below describes
> the three-language era (Beacon · Nimbus · Checkpoint). That morning Nimbus was retired and nine
> languages were added (eleven total); later the same day all ten non-Beacon languages were retired
> together, and none were archived — the contract now carries ONE, Beacon. The line-number table, the
> "three languages" section and the measured-results table are all snapshots of 2026-08-09, not the
> current file, and are now doubly out of date. `tokens.css` itself is the live answer (a single
> `:root` block, no `[data-theme=…]` blocks at all); `gallery.html` renders the one current language.

> ## ⚠️ PARTLY SUPERSEDED — the rebuild it plans has happened
>
> This was written to plan a rebuild that has since been carried out, so the forward-looking parts
> now describe a finished job. Read with that in mind:
>
> | Section | Status |
> |---|---|
> | **0. The blocking finding** (wrong Tailwind) | ✅ Already marked RESOLVED in place — the shell moved to the v4 browser CDN |
> | **1. The token contract**, **6. Decisions**, **7. The verified shell recipe** | ✅ **Still valid** — the token groups, `@utility` list, three languages, D1/D2 decisions and the measured shell recipe are all current. This is the reason to keep the file. |
> | **2. The catalog structure** | ⚠️ Largely built; the gallery now mirrors it |
> | **3. What proto-kit looks like today, by contrast** | ⛔ **Obsolete** — describes proto-kit *before* the rebuild |
> | **5. Order of work** | ⛔ **Done** |
> | **Navigation** (§2, the component group lists) | ⛔ **Stale inventory** — predates the ten components folded in from `src/components/ui/` on 2026-08-11 (`Accordion`, `Sheet`, `Popover`, `Tooltip`, `DropdownMenu`, `Command`, `Checkbox`, `Switch`, `Label`, `Separator`) |
>
> **Never use this file — or COMPONENT-GAPS.md — to answer "what does proto-kit / the kit / the
> gallery have?"** Both are 2026-08-09 snapshots and both now mislead on component coverage.
>
> 👉 **For current coverage use [THREE-WAY-MATRIX.md](./THREE-WAY-MATRIX.md)**, derived from live
> source (catalog ids × specimen `twin:` fields × `nav.json`) rather than hand-maintained.

---

## 0. The blocking finding — proto-kit is on the wrong Tailwind

**Verified empirically in a real browser (2026-08-09), not assumed.** Two probe pages, identical
except for the CDN, each declaring `@utility border-decor { border-width: var(--border-decor) }` and
`@utility card-pad-metric { padding: var(--card-pad-metric) }` with `--border-decor: 4px` and
`--card-pad-metric: 37px`:

| Runtime | `@utility` | `@theme inline` |
|---|---|---|
| `cdn.tailwindcss.com` — Tailwind v3 play CDN, **what `shadcn-shell.html` uses today** | **silently ignored** — computed `border-width: 0px`, `padding: 0px` | n/a |
| `cdn.jsdelivr.net/npm/@tailwindcss/browser@4` — Tailwind v4 browser CDN | **works** — computed `4px` / `37px` | **works** — resolved `--color-probe` to `rgb(1,2,3)` |

starter is on Tailwind **v4.3.3** and `tokens.css` uses v4 CSS-native syntax (`@theme inline`,
25 × `@utility`). proto-kit's shell is on the **v3** play CDN with a JS `tailwind.config` object.

**Consequence:** the token contract cannot be referenced as-is until the shell moves to the v4
browser CDN. Until then every `@utility` class renders as *nothing* — no error, no warning, just
unstyled output. This is step 0 of any parity work.

### ✅ RESOLVED — 2026-08-09

`engine/design-language.mjs` now emits the v4 browser CDN and inlines the synced contract, so the
generated prototype shell, `gallery.html` and the built app all compile the same 26 `@utility`
classes and read the same 154-token contract. The app's identity comes from one function
(`identityTokens()` in `theme-from-design.mjs`) for both artifacts — measured at 22/22 anchors
producing identical identity blocks — and `<html data-theme>` selects the design language on both
sides, so neither can silently fall back to Beacon.

Measured on the shell after the move: **175 class tokens, 168 resolve, 0 utilities dropped**; the 7
remaining are shell-local classes (`navitem`, `roleview`, `frost`, `active`) or documented markers.

Four names the shell used that the contract does not mint were retired rather than added:
`sidebar-accent` / `sidebar-foreground` / `sidebar-muted` (the rail now reads the ordinary ink
tokens the built app's rail resolves to) and `success-foreground` (tone colour comes from
`var(--tone-success-fg)`, as `StatusChip` does). Two classes moved INTO the contract instead:
`.eyebrow-mono` became the `eyebrow` utility, and `.frost`'s six values became Checkpoint's
`--canvas-chip-*` group, which `on-canvas` already read.

**Gate:** `node engine/lint-shell.mjs` — fails when the shell names a colour the contract does not
mint. Deterministic, no browser needed, mutation-tested against three injected regressions. It
states in its own header what it cannot decide: whether a class that exists in BOTH majors still
means the same thing. That needs a browser, and it is how the one regression this move did cause was
caught — every nav link came back UA-blue and underlined, because the v3 play CDN shipped preflight
and the contract runs without it.

---

## 1. The token contract — `starter/src/tokens.css` (1406 lines)

The single source of truth. Reached via one `@import "./tokens.css"` at the end of `src/shadcn.css`.

### Layout of the file
| Section | Lines |
|---|---|
| Banner comment (provenance legend, scope, what's deliberately absent) | 1–56 |
| `:root` — **Beacon**, 19 internal `── Name ──` dividers | 58–524 |
| `@theme inline { }` — the contract → Tailwind bridge | 533–645 |
| 25 × `@utility` blocks, in 4 commented groups | 647–846 |
| `:root[data-theme="nimbus"]` | 866–1131 |
| `:root[data-theme="checkpoint"]` | 1133–1405 |

No `@layer`, `@custom-variant`, `@property`, `@supports`, or `@import` anywhere in the file.

### The 19 token groups under `:root` (Beacon)
Colour (32 tokens, all HSL triplets) · chart ramp (`--chart-1..8`, whole hex) · whole-value twins
(`--canvas`, `--card-color`, `--border-decor-color`, `--track-color`) · on-canvas text plate
(`--canvas-chip-*`, 6) · border widths, two roles (`--border-decor` vs `--border-functional`, plus
`--ring-width`/`--ring-color`) · elevation (`--elev-card`, `--elev-card-hover`, 7-rung ladder
`--elev-2xs..2xl`) · shape (`--radius`, `--spacing-base`, `--radius-nested`, `--card-hover-rise`) ·
card padding by role (`--card-pad-metric|list|doc` = 20/24/28px) · data-bar geometry (`--bar-height`,
`--bar-radius`, `--data-text-size`, `--label-col-min|max`, `--value-col-min`, `--bar-gap`) · motion
(`--motion-duration`, `--motion-duration-move`, `--motion-ease`) · controls (`--control-height|pad-x|
radius|text|weight|borderw|radius-strong`, `--primary-hover`) · control fill/outline/strong ranks ·
status chips (`--chip-*` + 7 tone triples `--tone-<role>-bg|-fg|-dot`) · table rows (`--row-pad-y|-x`,
`--row-gap`, `--row-divider`, `--row-hover`) · fields (`--field-height|pad-x|radius|text|borderw|fill|
edge|focus-edge|multiline-min`) · tabs (`--tab-*`) · KPI (`--kpi-text|weight|tracking|label-text|gap`) ·
avatar (`--avatar-size|radius|text`) · overlay (`--scrim`, `--overlay-radius|pad`, `--elev-overlay`) ·
type (`--type-display|sans|mono`).

### Two conventions that are load-bearing and fail silently if broken
1. **Triplet vs whole-value.** Most colours are bare HSL triplets (`218 21% 10%`) consumed as
   `hsl(var(--x))`. Values needing alpha or a gradient can't live in that convention, so they declare
   a **whole-value twin** and the bridge reads `var(--x-color, hsl(var(--x)))`. Under Beacon each twin
   is a no-op; they exist so Nimbus/Checkpoint have somewhere to land. Swapping the two shapes
   produces invalid CSS that fails quietly.
2. **`@theme inline`, not `@theme`.** `inline` makes a token read at *use* time, so a `data-theme`
   block further down the cascade wins. Plain `@theme` would freeze Beacon's values and the language
   switcher would do nothing.

### The 25 `@utility` classes — components use these as classNames
`border-decor` · `hover-rise` · `h-bar` · `gap-bar` · `min-w-label` · `max-w-label` · `min-w-value` ·
`card-pad-metric` · `card-pad-list` · `card-pad-doc` · `duration-move` · `control-shape` ·
`rounded-control-strong` · `border-control` · `chip-shape` · `chip-dot` · `row-shape` · `field-shape` ·
`field-multiline` · `tab-shape` · `text-kpi` · `text-kpi-label` · `avatar-shape` · `overlay-shape` ·
`on-canvas`

These are why "just copy the colour values" is not enough: `Cards.jsx` writes
`className="border-decor border-edge shadow-card card-pad-list"`. Without the `@utility` layer those
are dead classes.

### The three languages
- **Beacon** — bare `:root`, the default. 1px card edge, no shadow. Poppins / DM Sans / IBM Plex Mono.
- **Nimbus** — `:root[data-theme="nimbus"]`. Glass plates on a gradient ground; translucent white edge,
  no elevation at any rung except `--elev-2xl`. Archivo / Be Vietnam Pro / Azeret Mono. Declares no
  scrim — a stated *refusal*, not an omission.
- **Checkpoint** — `:root[data-theme="checkpoint"]`. `--border-decor: 0` (no card edge at all) +
  two-layer lift + the only non-zero `--card-hover-rise` (-3px). Avatar is a 9px rounded square, not a
  circle. Manrope throughout.

Specificity does the switching: `:root` is (0,1,0), `:root[data-theme=…]` is (0,2,0). **Any token a
language block does not name inherits Beacon's.** One attribute on `<html>` flips everything; no
component knows a theme exists.

---

## 2. The catalog structure — what proto-kit's gallery must mirror

starter's catalog is ~28 pages in `src/pages/*.jsx`, one component (or family) per page, all built on
shared chrome in `src/components/gallery-kit.jsx`.

### The chrome — 5 components, this is the structure to copy
| Component | Props | Renders |
|---|---|---|
| `GalleryPage` | `title, blurb, footer, children` | `<h1>` + blurb, then `lg:grid-cols-[1fr_15rem]` — content column + sticky `LanguagePicker` rail (`lg:sticky lg:top-6`). Owns the language state itself. |
| `Section` | `id, title, note, children` | Anchor-linkable `<h2>` with a `#id` self-link revealed on hover; children in `flex flex-col gap-8`. Multi-topic pages only. |
| `Entry` | `name, summary, props, children` | Mono `<h3>` (the component name, e.g. `<Card/>`) + summary, then a **prop table** (`prop │ type │ default │ what it does`), then specimens. |
| `Specimen` | `label, children` | `font-mono text-xs` caption above one live example. |
| `PrimitiveCard` | `title, children` | `border-decor border-edge shadow-card card-pad-list rounded-lg bg-card` — the surface for primitives that don't wrap themselves. |

### The fixed page template
```
usePageTitle(name)
└─ <GalleryPage title blurb footer>
   └─ <Entry name summary props>          ← 1 per component; 2–3 for a family
      └─ <Specimen label>                 ← 1–4 per Entry
         └─ <PrimitiveCard> live component
```
Order never varies. There is **no** separate "when to use" / "do's and don'ts" / "accessibility"
section — that guidance is folded into `blurb`, `footer`, and prop `note` prose.

### Navigation
File-based routing via `vite-plugin-pages`. **No index page** — the sidebar *is* the catalog index,
driven by hand-maintained `starter/lib/nav.json`, in six groups:

| Group | Entries |
|---|---|
| **Data** | ModelChart, BarChart, HBars, LineChart, GaugeRing, FunnelChart, Heatmap, StackedBar, Donut, Table, StatTile, Progress |
| **Controls** | Button, Input, Select, Textarea, TabStrip |
| **Surfaces** | Card, Callout, Modal, Layout, Empty states |
| **Identity** | StatusChip, Avatar, Breadcrumb |
| **Process** | Process views, KanbanBoard |
| **Diagnostics** | Old vs new bench |

Shared fixtures live in `src/pages/_fixtures.js` (`CLAIMS`, `CLAIM_COLUMNS`, `RANKS`, `CLAIM_STAGES`) —
underscore-prefixed so the router ignores them. The same numbers recur across pages *on purpose*, so
switching language is an apples-to-apples comparison.

### Documentation voice
Opinionated and reasoning-first, not neutral reference. Provenance markers `[SOURCE]` / `[OURS]` are
used throughout to separate transcribed-from-the-design-language from invented-here. Real example
(empty-state.jsx): an empty state is *not* an error — tinting it turns "no rows yet" into "something is
wrong"; only `NoAccess` carries a tone, because a permission boundary is a fact about the viewer, not
a failure.

---

## 3. What proto-kit looks like today, by contrast

| | starter kit | proto-kit |
|---|---|---|
| Tailwind | v4.3.3, CSS-native | **v3 play CDN** ← blocker |
| Token source | `tokens.css` — 1 contract, ~200 tokens, 25 utilities | inline `:root` in `shadcn-shell.html`, ~30 tokens, 0 utilities |
| Themes | 3 deeply-modelled languages | 22 flat anchors (accent/radius/font swaps) |
| Components | 39 exports in 17 files, 5 typed categories | ~24 flat recipes, no categories |
| Catalog | 28 pages, shared chrome, prop tables, sticky language rail | 1 hand-rolled `component-gallery.html`, no prop tables |
| Docs | rationale + provenance per component | code block, no rationale |

---

## 4. The vocabulary gap — `@theme inline` is NOT a superset of proto-kit's bridge

**Verified 2026-08-09.** "Reference instead of recreate" is the right instinct but it is **not
lossless**. Porting the contract as-is silently drops tokens proto-kit actively uses:

| Token proto-kit uses | In `tokens.css` bridge? | Proto-kit usages |
|---|---|---|
| `sidebar-foreground`, `sidebar-muted`, `sidebar-accent` | **No** — only `--color-sidebar`, `--color-sidebar-border` | **38** (9 shell, 29 gallery) — incl. the `side-foot` hero-band template (`text-sidebar-muted`) and the checkpoint nav CSS (`.navitem.bg-sidebar-accent`) |
| `success-foreground` | **No** (`--color-success` exists, its foreground does not) | badges, buttons |
| `chart1`…`chart8` (undashed) | dashed only — `--color-chart-1`…`-8` | gallery config |
| `rounded-2xl`, `rounded-full` | **No** — bridge has sm/md/lg/xl/bar/nested | hero-band, chips, pills |

**The larger version of the same problem — the whole Tailwind scale.** proto-kit's anchors theme
`spacing`, `fontSize` (xs…2xl + display + kpi), `fontWeight`, `letterSpacing`, `lineHeight`,
`transitionDuration`, `boxShadow` 2xs…2xl. `tokens.css`'s bridge themes colours, shadows, radius,
three font families, `--text-data`, border/ring width — **and nothing else**. Under the ported
contract `text-2xl`, `font-bold`, `tracking-wider`, `leading-tight`, `p-5` stop being theme-scaled and
fall back to stock Tailwind, shifting every recipe typographically and dimensionally.

Note this is exactly how **starter itself** behaves — it uses stock Tailwind for those scales. So the
"shift" is only a regression if the 22 flat anchors survive; if proto-kit converges on the 3 real
languages, matching starter *is* the goal and the gap disappears.

### Also verify before porting
- **Preflight.** `tokens.css` sets `border-style` explicitly because "preflight is off, UA default is
  `none`". The v4 browser CDN enables preflight when the style block does `@import "tailwindcss"`.
  starter and proto-kit must match here or computed styles diverge for reasons nobody will find later.
- ~~Is `design-languages.css` live?~~ **Checked — it is not.** `main.jsx:21`: *"src/design-languages.css
  is NOT imported."* It is generated staging output. The 3-live-language premise holds.

---

## 5. Order of work

**Step 0 is a forced decision, not a deferred one.** Swapping to the v4 CDN **deletes** proto-kit's
existing bridge: `shadcn-shell.html` and `component-gallery.html` both configure Tailwind through the
JS global `tailwind.config = {theme:{extend:{…}}}`, a v3 play-CDN mechanism that `@tailwindcss/browser@4`
does not read. The moment the CDN swaps, every `bg-card` / `text-muted-foreground` / `border-border` in
all ~24 recipes goes dead until the bridge is re-expressed as `@theme`. So:

0. **Decide the fate of the 22 flat anchors** — retire in favour of the 3 real languages, or carry
   them forward by re-expressing their whole-scale theming as `@theme` blocks. This decision sets the
   entire shape of steps 1–2 and cannot be deferred.
1. **Move `shadcn-shell.html` to the Tailwind v4 browser CDN**, re-expressing the bridge as `@theme`
   per the step-0 decision. Verify one `@utility` class renders before continuing.
2. **Port the token contract** — `tokens.css`'s `@theme inline` + all 25 `@utility` blocks + the three
   language blocks, verbatim, **plus** whatever the §4 gap table says must be carried over. Replaces
   proto-kit's fake `checkpoint` anchor (a different, shallower thing wearing the same name).
3. **Restructure the gallery** to the `GalleryPage / Section / Entry / Specimen / PrimitiveCard`
   chrome, one page per component, nav grouped into the six categories.
4. **Fill the component gaps** — the 17 presentational components in COMPONENT-GAPS.md.
5. **Reconcile the reverse gaps** — 3 recipes where proto-kit is currently richer than kit/.

---

## 6. Decisions taken (user, 2026-08-09)

### D1 · The 22 flat anchors are RETIRED, not deleted
Beacon / Nimbus / Checkpoint become proto-kit's only *active* themes — identical to starter. The 22
anchors stay on disk (`reference/ui-themes.json`, `language-catalog.mjs`, `emit-live-themes.mjs` are
untouched) but stop being what the shell loads.

This mirrors the repo's own existing convention — `starter/src/components/legacy/` is "RETIRED, not
deleted… still on disk because /bench renders it against kit/ side by side." Same reasoning: the
anchors remain available for comparison and for `emit-live-themes.mjs`'s separate job, they simply
aren't the prototype's theme system any more.

Consequence: the §4 scale gap **dissolves**. Stock-Tailwind `spacing`/`fontSize`/`fontWeight`/
`letterSpacing`/`lineHeight` is exactly what starter does, so matching it is the goal, not a
regression. Only the genuinely-missing colour tokens need carrying over (sidebar trio,
`success-foreground`, chart aliases, `rounded-2xl`/`rounded-full`).

### D2 · The prop table becomes a SEED BINDINGS table
A snippet has no props, so `Entry`'s fourth column set is re-cut as the recipe's real contract — the
data it binds:

| field │ type │ example │ what it drives |
|---|

Chosen over documenting placeholder slots because the binding *is* the snippet's interface: a recipe
is only correct if the SEED fields it reads exist and mean what it assumes. Placeholder slots are
visible in the markup already; the data contract is not.

Everything else in `Entry` is unchanged from starter — mono `<h3>` component name, summary line, then
specimens.

---

## 7. The verified shell recipe (proven in-browser, 2026-08-09)

`starter/src/tokens.css` was embedded **verbatim, unmodified** in a static HTML page and every value
resolved correctly. This is the working head:

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
/* …contents of starter/src/tokens.css, verbatim… */
</style>
```

**Both `@import` lines are load-bearing.** Control test with them removed: utilities do not compile at
all — `padding: 0px`, `border-radius: 0px`, every `@utility` dead. They are also what keeps
**preflight OFF**, matching starter (`shadcn.css:4` — "CRITICAL: preflight is OFF"). Confirmed by UA
defaults surviving: `p` margin `16px`, `body` margin `8px`, and a bare `.border` computing to
`border-style: none` — exactly the condition `tokens.css` documents as its reason for setting
`border-style` explicitly inside `border-decor`.

NOT cosmetic — this is a PUBLICATION-TIME failure, corrected before a prototype is published. When the
raw `<style type="text/tailwindcss">` head reaches a browser, it resolves `@import "tailwindcss/theme.css"`
and `tailwindcss/utilities.css` as RELATIVE URLs; inside a preview host those 404, and the v4 CDN dies
with `CssSyntaxError` — the WHOLE stylesheet fails and the page renders unstyled. It is not "two harmless
404s". The fix is that nothing raw is ever published: `engine/proto-precompile.mjs` compiles this head to
static CSS and removes the CDN, and `engine/proto-publish.mjs` is the fail-closed gate every publish path
goes through — a prototype that still carries this raw runtime is rejected, never shipped. A served
prototype makes ZERO `tailwindcss/*.css` requests.

### Measured results — one card, `class="border-decor border-edge shadow-card card-pad-list rounded-lg bg-card"`

| | Beacon | Nimbus | Checkpoint |
|---|---|---|---|
| card border-width | `1px` `#e3e7ef` | `1px` translucent | **`0px`** |
| card radius | `14px` | `20px` | `16px` |
| card padding | `24px` | `24px` | `18px` |
| card fill | `#fff` | `rgba(255,255,255,.78)` glass | `#fff` |
| avatar (`avatar-shape`) | `30px` / `999px` circle | `28px` / `999px` | **`28px` / `9px` square** |
| KPI (`text-kpi`) | `32px` / `700` / `-0.02em` | — | — |

Each matches the language's documented model exactly — including Checkpoint's headline zero card edge
and its rounded-square avatar, the two traits the token contract exists to express.

**Conclusion: referencing beats recreating.** No transcription, no drift, one source of truth. When
starter's contract changes, proto-kit inherits it.

### The two resets preflight-off makes mandatory

Matching starter means preflight is OFF, which means **the UA stylesheet survives** — and Chrome's
defaults for form controls are bevelled:

| element | Chrome UA default | renders as |
|---|---|---|
| `button` | `2px outset` | an embossed Windows-95 ring |
| `input` / `select` / `textarea` | `2px inset` | a sunken ring |

`outset` is CSS's 3-D border style: it derives a lighter shade for the top and left edges and a
darker one for the bottom and right. On a flat modern pill it reads as embossed. Reported from a
screenshot of the orange "New request" button, 2026-08-09, and reproduced: computed
`border-style: outset; border-width: 2px`.

**starter never shows this** because it has a Button *component* and all four ranks set an explicit
border class (`border-0` on primary/strong, `border-control` on outline). The reset is per-instance,
enforced by the component. **proto-kit has no component to enforce anything** — a snippet is copied
by hand, so the bevel returns the first time anyone writes a new button. It belongs in the shell.

The fix, in the generated head:

```css
@layer theme, base, components, utilities;   /* starter/src/shadcn.css:8, same order */
@layer base { button, input, select, textarea { border: 0 solid; } }
```

Two details, both load-bearing, both learned by getting them wrong first:
- **`@layer base`, not unlayered.** Anything unlayered outranks every layer, so an unlayered reset
  beats `border-control` and `field-shape` — it zeroed the outline button's edge and the input's
  border. Layer order must be declared up front or `base` lands after `utilities`.
- **`0 solid`, not `none`.** Utilities that add a border set only a *width*, and a width against
  `border-style: none` computes to 0 — the same trap `tokens.css` documents for `border-decor`.

Verified after the fix: filled buttons `0px`; outline button `1.5px` under Beacon and `1px` under
Checkpoint (the token driving it per language); textarea `1px`; zero bevelled controls in any language.

⚠️ **This will bite `design-language.mjs#emitHead` too.** It is still on the v3 play CDN, where
preflight is ON and therefore masks the problem. The moment it moves to v4 + preflight-off, every
button in every generated prototype becomes bevelled unless this reset moves with it.
