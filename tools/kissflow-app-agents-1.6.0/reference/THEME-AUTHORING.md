# Theme (anchor) authoring guide

How to add a new design anchor to the catalog (`reference/ui-themes.json`) so the whole pipeline —
`language-catalog.mjs` (list/pick/design/validate) → kf-design-director → `design-language.mjs` shell →
prototype parts → `theme-from-design.mjs` runtime CSS — picks it up with **zero engine changes**.
Written after authoring `checkpoint` (2026-08-07) from a Claude Design export; checkpoint is the
worked example for everything below, including the optional gradient system.

**Verify every theme with `node engine/language-catalog.mjs validate <id>` before shipping it** — the
validator enforces this document mechanically (key set, oklch format, primary-lightness guard,
contrast floors, gradient shape). `validate --all` sweeps the whole catalog.

---

## 1. The preset entry (required)

One JSON object appended to `reference/ui-themes.json`:

```jsonc
{
  "id": "slug",                    // unique, lowercase — becomes the anchorId everywhere
  "name": "Display Name",
  "description": "Look words — personality words. Domain fit sentence.",
  "category": "SaaS | Risk & Compliance | …",
  "radius": "1rem",                // ONE value, rem — maps to --radius-lg (the ThemeProvider rung)
  "fonts": { "heading": "Manrope", "body": "Manrope" },   // Google Fonts names
  "light": { /* 72 tokens, below */ },
  "dark":  { /* same key set — REQUIRED even if the source design is light-only; derive it */ }
}
```

**The description carries the anchor's SEARCHABILITY.** `pick()` scores requirement words against
it, weighting the tail after the last "—" 3× — so end with a plain domain-fit sentence
("Compliance registers, audits, legal and regulatory change tracking, governance sign-offs.").
Look-adjectives alone make an anchor unfindable.

### 1a. Color tokens (all `oklch(L C H)` strings — the engine converts to HSL itself)

Required in BOTH `light` and `dark`:

`background` `foreground-ink` `foreground-inverse` `static-light` `static-dark` `surface`
`primary` `muted` `accent` `destructive` `success` `warning` `info` `ring`
`chart-1…chart-8` `category-1…category-8`

Optional (authored sidebar — see §4): `sidebar` `sidebar-border`

Rules the validator enforces or warns on:
- **`primary` oklch L must land in ~0.45–0.72, ideally 0.53–0.63.** The whole catalog is
  coordinate-derived there so white button text always clears ≥4.5:1. The engine's legibility guard
  flips to dark text above L 0.8 — an anchor near that line gets inconsistent foregrounds. Never
  trust HSL lightness for this judgment (it is hue-distorted); judge in oklch.
- **`warning` is the classic trap**: ambers read light. Keep it dark enough that white text (or the
  engine's dark warning-foreground) works — L ≤ ~0.8.
- **chart-1…8 / category-1…8 are a fixed, mutually-distinguishable hue spread** — they are passed
  through verbatim and deliberately NOT hue-shifted with the accent. Spread hues across the wheel;
  eight near-neighbors defeat the point. Building them from the theme's own status family (like
  checkpoint) is good; duplicating one hue five times is not.
- `foreground-inverse` ≈ near-white in light mode (`oklch(0.985 0 0)`), near-black in dark.

### 1b. Extended personality tokens (same 40 keys in both modes)

Shadows: `shadow-2xs…shadow-2xl` (real CSS shadow strings — the layered soft stack IS personality;
checkpoint's `shadow-2xl` is its floating-canvas shadow).
Shape/density: `border-width-medium` (`0px` = borderless-card language) · `ring-width` · `spacing`
(the Tailwind spacing unit — every gap/p/m remaps through it).
Type scale: `text-xs…text-2xl`, `text-display` (the hero headline size), `text-kpi`,
`text-sm--line-height`, `text-base--line-height`.
Weights: `font-weight-normal/medium/semibold/bold/black` — the REAL numbers for the font
(checkpoint: 400/500/600/700/800 because Manrope ships them; sentinel uses 400/475/550/625/700).
These drive the Google Fonts query — wrong numbers = fake weights.
Tracking: `tracking-tighter…tracking-widest` (widest ≈ .16em if the theme uses mono eyebrows).
Leading: `leading-tight…leading-loose`.
Motion: `default-transition-duration`, `default-transition-timing-function`,
`transition-duration-move` (`0ms` = a deliberately still theme).
`font-mono-var`: full CSS font stack string for the mono voice.

### 1c. Dark mode when the source has none

Derive, don't skip: warm/cool near-black canvas in the same hue family, surface one step up,
primary brightened (+0.07–0.10 L), semantic colors lightened similarly, shadows switched to
black-alpha, extended tokens usually carried over unchanged. Checkpoint's dark block is the
reference derivation.

---

## 2. Gradient support (optional — this is what makes a theme "support gradient")

Add a top-level `gradients` key to the preset:

```jsonc
"gradients": {
  "light": {
    "hero":    "radial-gradient(…), linear-gradient(112deg, #cfe9da 0%, #dbe6ef 46%, #ddd5f6 100%)",
    "brand":   "linear-gradient(160deg, #6b46e8cc, #6b46e8)",
    "success": "linear-gradient(100deg, #a9e8c4, #8fe0b1)",
    "review":  "linear-gradient(100deg, #d7cdf9, #c8bcf5)",
    "danger":  "linear-gradient(100deg, #f2b7b2, #eda49e)",
    "warning": "linear-gradient(100deg, #f7e6bd, #eece86)"
  },
  "dark": { /* same six keys, darkened equivalents */ }
}
```

Only these six keys; full CSS gradient strings (raw hex inside gradients is fine — they are
authored art, not derived tokens). What the key's PRESENCE triggers automatically:

- `toDesignLanguage` passes the light set into the design slice (`design.gradients`)
- `design-language.mjs` emits them as `--grad-hero/-brand/-success/-review/-danger/-warning` CSS
  vars and paints the shell header with `--grad-hero`. The **composition CSS** that used to sit
  beside them is mostly retired: borderless cards, the mono eyebrow and the button radius are all
  token decisions the contract makes per language now (`--border-decor`, the `eyebrow` utility,
  `--control-radius`), and the frosted chip's values live in the contract as `--canvas-chip-*`.
  What is still gated on gradients: the hero wash itself, `.bar-striped` needs-action meters and
  underline-only search fields
- `theme-from-design.mjs` no longer lifts these vars into the runtime app. It writes
  `src/app-identity.css` — the app's accent, focus, chart ramp and corner only. It also stamps
  `<html data-theme="beacon">`, which is vestigial: Beacon is the only design LANGUAGE in
  `src/tokens.css` now (the other ten were retired 2026-08-12), and its bare `:root` block applies
  regardless of the attribute. Beacon supplies the ground and the grammar out of `src/tokens.css`,
  which is where the gradient/composition treatment now lives for the runtime app. See that file's
  header for the division of labour and for what stopped being emitted
- part builders follow the **HERO-BAND ADDENDUM** in `engine/proto-kit/COMPONENTS.md`: five extra
  per-role template slots (meter strip, inline headline figure, right-of-title stat clusters, black
  real-action CTA, sidebar health strip) — figures from SEED, CTAs wired to real nav ids, no dead
  chrome

Anchors WITHOUT the key are byte-identical to before — every gradient behavior is gated on it.

## 3. Per-anchor defaults in `engine/language-catalog.mjs` (optional, one line each)

- `FIT_KEYWORDS` / `rankLanguages()` (curated pick() keywords that outweighed description prose,
  score 4 vs 3) were retired 2026-08-12 with the domain-scored selection machinery — there's one
  entry now, nothing to rank. Skip this one if you're following pre-2026-08-12 notes elsewhere.
- `DEFAULT_ARCHETYPE.slug = "hero-band"` — the shell container this anchor defaults to
  (`rail-left` otherwise; explicit `--archetype` always wins). A gradient theme wanting the full
  floating-canvas + band composition needs this line — gradients alone only wash the header.
- `DEFAULT_SIDEBAR_TONE.slug = "brand" | "dark"` — rail tone default (`light` otherwise; explicit
  `--sidebar-tone` wins). Brand/dark palettes are contrast-tuned generically; see enterprise.

## 4. Authored sidebar (optional)

If the source design gives the rail its own color (checkpoint: putty `#f1efeb` + `#e6e4de`
hairline), author `sidebar` and `sidebar-border` in the preset's color tokens — the light tone
honors them. Without them the rail derives from `surface`/`border`, which is right for most themes.

## 5. Extracting from a source (the checkpoint method)

From a Claude Design export (`.dc.html`): the palette lives in inline styles and the logic script's
style templates — harvest distinct hex values (`grep -o '#[0-9a-f]\{6\}'` + frequency sort), read
the `<style>` block and font `<link>` for type, find accent/status colors in the script's computed
styles. Convert hex → oklch with a script (see the session's `hexToOklch` — standard sRGB → OKLab).
Two-position layout signatures (frosted chips, band anatomy) go into the description and, if the
theme earns it, `DEFAULT_ARCHETYPE` — tokens repaint, composition recomposes; know which layer each
observation belongs to.

## 6. Verification checklist (in order)

1. `node engine/language-catalog.mjs validate <id>` → must PASS (errors = ship-blockers).
2. `node engine/language-catalog.mjs list` → the description reads well. (`pick` was retired
   2026-08-12 along with the other ten languages — there is nothing left to rank.)
3. `node engine/language-catalog.mjs design <id> --app-id t --app-name T --rationale "test"` →
   eyeball the slice. `--rationale` is required (2026-08-13) for any real app build; a throwaway
   value is fine here since this step is just checking the slice renders.
4. buildShell smoke + browser screenshot (serve over http — file:// won't drive the tooling):
   fonts load, band/header paints, nav states legible, dark text never lands on dark pastel.
5. If gradients: confirm `--grad-*` vars in the emitted head and in `themeCss()` output.

## Known catalog (do not reuse an id): default, enterprise, school, editorial, ledger, counsel,
clinic, bloom, depot, harvest, civic, console, atelier, studio, forge, grid, assure, sentinel,
realty, voyage, court, checkpoint.
