#!/usr/bin/env node
// gen-theme-variants.mjs — writes app-kit/theme-variants.css: one `:root[data-theme="<id>"]` block
// per sibling anchor (Compass/Dusk/Cove/Nova — everything in reference/ui-themes.json except
// Beacon, which IS tokens.css's own bare `:root`/`@theme inline` and needs no block).
//
// WHY A SEPARATE GENERATOR, NOT emit-live-themes.mjs. emit-live-themes.mjs's themes.css writes
// WHOLE colours (oklch()) for the plain @kissflow/create-app scaffold's bridge. A kit-installed
// app (kit-install.mjs) never imports that file at all — main.jsx's own comment says so
// ("themes.css replaced by the kit token graph ... would overwrite the triplet tokens with whole
// colours and break the hsl(var()) bridge") — its real contract is tokens.css's direct
// `--color-*: hsl(...)` declarations plus app-identity.css's triplet overrides. This file speaks
// THAT vocabulary instead: the same literal-valued `--color-*` names tokens.css declares for
// Beacon, so a `:root[data-theme="cove"]` block genuinely overrides what Beacon's bare `:root`
// set — attribute-selector (0,2,0) beats bare `:root` (0,1,0) regardless of load order, the same
// reasoning emit-live-themes.mjs documents for its own case.
//
// ONLY LITERAL-VALUED NAMES ARE LISTED BELOW. Everything else tokens.css declares in this family
// (chart-1..6, --color-accent, --color-muted, --color-control-*, --color-field-*, ...) is a
// `var()` REFERENCE to one of these — CSS custom properties resolve those lazily at compute time,
// so overriding the literal is enough; restating the references would be redundant, not wrong.
// (Checked: app-kit/tokens.css's own `@theme inline` block, 2026-08-13.)
//
// SOURCE. Every hex below is transcribed from that theme's own `#foundations` section — Claude
// Design project "Mobile app style guide sheet" (2b8a920b-a786-4430-bd63-b0bc0dbe6229),
// `Theme <Blue|Indigo|Teal|Violet>.dc.html` (this catalog names the anchors Compass/Dusk/Cove/Nova
// — see reference/ui-themes.json's own "source" field per entry for the id mapping). The four
// share one neutral ramp, one danger/success/warning triad and one secondary-hover — confirmed by
// extracting all four documents and diffing (2026-08-13) — only primary (+ its hover/pressed/bg/
// ink/ring derivatives), info (each borrows a hue its own primary doesn't already own), the two
// gradients, the primary-tinted button glow and the font pairing vary per anchor. UNIVERSAL below
// holds that shared set once instead of four times.
//
//   node gen-theme-variants.mjs           # writes app-kit/theme-variants.css

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "app-kit", "theme-variants.css");

// ── shared across all four siblings — NOT Beacon's own (Beacon's own neutral ramp/tones are
// independently tuned from a different source page; these are re-tuned, per each doc's own text,
// "shifted cool to match the product surface" relative to Beacon) ──────────────────────────────
const UNIVERSAL = {
  "gray-1": "#F6F6F8", "gray-2": "#EDEEF0", "gray-3": "#E4E5E8", canvas: "#F4F4F7",
  border: "#DDE0E4", track: "#F2F3F5", "row-hover": "#FAFAFB", "ink-soft": "#43464C",
  "text-subtle": "#9A9DA4", "text-muted": "#6E7076", "secondary-hover": "#26262A",
  danger: "#D93025", "danger-bg": "#FCEAE8", "danger-ink": "#A3231A",
  "success-bg": "#E7F5EE", "success-ink": "#0B7343", "success-dot": "#0F9D58",
  "warning-bg": "#FDF3DF", "warning-ink": "#8A5B00", "warning-dot": "#E0A106",
  // 2026-08-13, added with the Avatar fix below. White ink on each anchor's own primary — checked
  // WCAG contrast against white for all four (standard relative-luminance formula, same math
  // language-catalog.mjs's validateLanguage uses elsewhere in this repo): Compass 5.17:1, Dusk
  // 7.90:1, Nova 5.70:1 — comfortable. Cove 3.74:1 — clears this codebase's own established
  // UI-component floor (3.0, per validateLanguage's own contrast-check comment: "button/chip
  // labels are semibold 13px+, where WCAG's UI-component standard is 3:1") but not AA body-text
  // comfort (4.5). Noted once, not re-raised — a11y is a later pass, per standing note.
  "primary-foreground": "#FFFFFF",
};

// 2026-08-13 — gradientPrimary/gradientData removed here: "except Beacon, all other themes should
// be flat instead of gradient," on request. block() below now derives both as a same-colour-twice
// linear-gradient() off each anchor's own `primary` — NOT a bare hex: Buttons.jsx reads
// --gradient-primary via `backgroundImage`, which only accepts an <image> (a gradient function,
// url(), etc.), never a plain colour — a bare hex there would silently drop the primary button's
// fill. Two identical stops is a valid <image> that renders perfectly flat, so every existing
// consumer (Buttons.jsx's backgroundImage, Board/Cards/DataCharts/ModelChart's `background`
// shorthand) keeps working unchanged. Beacon's own gradient is untouched — it lives in
// app-kit/tokens.css, this generator never writes Beacon.
const SIBLINGS = {
  compass: {
    font: "DM Sans",
    primary: "#2563EB", "primary-hover": "#225BD8", "primary-pressed": "#1E4FBC",
    "primary-bg": "#EFF6FF", "primary-ink": "#1E3A8A", "row-selected": "#F5F9FF",
    "info-bg": "#F3F0FF", "info-ink": "#5B21B6", "info-dot": "#7C3AED",
  },
  dusk: {
    font: "Manrope",
    primary: "#4338CA", "primary-hover": "#3E34BA", "primary-pressed": "#362DA2",
    "primary-bg": "#EEF2FF", "primary-ink": "#312E81", "row-selected": "#F7F8FF",
    "info-bg": "#E8F1FD", "info-ink": "#14549F", "info-dot": "#1A73E8",
  },
  cove: {
    font: "Space Grotesk",
    primary: "#0D9488", "primary-hover": "#0C887D", "primary-pressed": "#0A766D",
    "primary-bg": "#F0FDFA", "primary-ink": "#134E4A", "row-selected": "#F7FEFC",
    "info-bg": "#E8F1FD", "info-ink": "#14549F", "info-dot": "#1A73E8",
  },
  nova: {
    font: "Plus Jakarta Sans",
    primary: "#7C3AED", "primary-hover": "#7235DA", "primary-pressed": "#632EBE",
    "primary-bg": "#F5F3FF", "primary-ink": "#4C1D95", "row-selected": "#FBFAFF",
    "info-bg": "#E8F1FD", "info-ink": "#14549F", "info-dot": "#1A73E8",
  },
};

// ── hex -> "H S% L%" triplet, tokens.css's own hsl() argument shape ──────────────────────────────
function hexToHslTriplet(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}
const hexToRgb = (hex) => { const n = hex.replace("#", ""); return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)); };

// ── 2026-08-13 — why a SECOND rule shape exists below, not just the --color-* block above ────────
// Overriding the custom property alone (the block() output) is invisible to a big chunk of the
// kit: tokens.css declares its colours inside `@theme inline` as plain literals (no inner var()),
// and Tailwind's `inline` mode BAKES a literal theme value directly into every class it generates
// from it — confirmed empirically by reading the actual built CSS: `.bg-primary` compiled to
// `background-color:#ff6203`, not `background-color:var(--color-primary)`. (Contrast shadcn.css's
// own `--color-primary: hsl(var(--primary))` — THAT stays a `var()` in its utilities, because
// there's an inner var() for `inline` to preserve; a bare literal has none, so `inline` freezes it
// instead.) So a `:root[data-theme=…]` override only reaches consumers that read the custom
// property directly via `var()` in an inline style (DataCharts.jsx's bars/gauges, Buttons.jsx's
// gradient fill) — never a plain Tailwind class like `bg-primary` or `border-gray-2`. Header/
// sidebar/nav are styled entirely through those classes, which is exactly why switching themes
// visibly changed chart fills but not the wordmark badge, avatar, or active-nav highlight.
//
// FOUND, NOT GUESSED: built the app, then for every literal value tokens.css declares for Beacon,
// searched the compiled CSS for every selector holding that exact hex with no `var(` in its rule —
// 30 classes came back frozen this way (`bg-primary`, `border-primary`, `ring-ring`, `bg-gray-1/2/
// 3`, `bg-border`, `bg-track`, `text-danger`, …). CLASS_OVERRIDES below is that exact list, not an
// enumeration of every prefix×token combination that could theoretically exist — a token this app's
// kit never renders through a Tailwind class (success/warning/info triads, primary-hover/-pressed,
// secondary-hover, canvas: all 0 frozen classes found) gets no entry, because there's nothing to
// override; adding one would be dead CSS.
//
// SCOPED FIX, not the root cause. The real fix is tokens.css itself using the shadcn.css pattern
// (a var()-valued @theme inline declaration) instead of a bare literal — every app's OWN accent
// layer has this same latent bug, not just this generator's anchors. That's a bigger, shared-file
// change or a separate call; this file only reaches what IT declares.
const CLASS_OVERRIDES = {
  primary: [["bg-primary", "background-color"], ["border-primary", "border-color"], ["fill-primary", "fill"], ["text-primary", "color"], ["inset-ring-primary", "--tw-inset-ring-color"]],
  ring: [["ring-ring", "--tw-ring-color"], ["border-ring", "border-color"]],
  "gray-1": [["bg-gray-1", "background-color"], ["border-gray-1", "border-color"]],
  "gray-2": [["bg-gray-2", "background-color"], ["border-gray-2", "border-color"], ["stroke-gray-2", "stroke"]],
  "gray-3": [["bg-gray-3", "background-color"], ["border-gray-3", "border-color"]],
  track: [["bg-track", "background-color"], ["stroke-track", "stroke"]],
  "row-hover": [["bg-row-hover", "background-color"]],
  "row-selected": [["bg-row-selected", "background-color"]],
  "ink-soft": [["text-ink-soft", "color"]],
  "text-subtle": [["text-text-subtle", "color"]],
  "text-muted": [["fill-text-muted", "fill"], ["text-text-muted", "color"]],
  border: [["bg-border", "background-color"], ["border-border", "border-color"], ["text-border", "color"], ["recharts-tooltip-cursor", "stroke"]],
  "primary-bg": [["bg-primary-bg", "background-color"]],
  "primary-ink": [["text-primary-ink", "color"]],
  danger: [["text-danger", "color"]],
  "danger-ink": [["text-danger-ink", "color"]],
};

// 2026-08-13 — the header avatar (app-shell.jsx) reads `!bg-primary !text-primary-foreground`,
// Tailwind's important-MODIFIER classes, not plain bg-primary/text-primary-foreground. These
// compile to their OWN selector (`.\!bg-primary`, escaped, CSS class name literally "!bg-primary")
// carrying `!important` on the property — confirmed in the built CSS: `.\!bg-primary{background-
// color:#ff6203!important}`. CLASS_OVERRIDES above never reaches this: it's a different selector,
// and even if it matched, a non-!important rule can never beat an !important one regardless of
// specificity. Checked the whole kit + this app for every other `!`-prefixed use of an overridden
// token (Queue.jsx's are `!bg-[var(--color-danger-bg)]` arbitrary values — already reactive, no
// @theme literal to freeze) — this Avatar is the ONLY other site, so it gets its own small table
// rather than a general "important variant of everything" generator nothing else needs yet.
const IMPORTANT_OVERRIDES = {
  primary: [["\\!bg-primary", "background-color"]],
  "primary-foreground": [["\\!text-primary-foreground", "color"]],
};

function classBlock(id, s) {
  const t = { ...UNIVERSAL, ...s };
  const [pr, pg, pb] = hexToRgb(t.primary);
  const value = (name) => (name === "ring" ? `rgba(${pr}, ${pg}, ${pb}, 0.35)` : t[name]);
  const lines = [];
  for (const [name, rules] of Object.entries(IMPORTANT_OVERRIDES)) {
    for (const [cls, prop] of rules) lines.push(`[data-theme="${id}"] .${cls} { ${prop}: ${value(name)} !important; }`);
  }
  for (const [name, rules] of Object.entries(CLASS_OVERRIDES)) {
    for (const [cls, prop] of rules) lines.push(`[data-theme="${id}"] .${cls} { ${prop}: ${value(name)}; }`);
  }
  return lines.join("\n");
}

function block(id, s) {
  const t = { ...UNIVERSAL, ...s };
  const c = (name) => `  --color-${name}: hsl(${hexToHslTriplet(t[name])});`;
  const [pr, pg, pb] = hexToRgb(t.primary);
  const lines = [
    `:root[data-theme="${id}"] {`,
    c("primary"), c("primary-hover"), c("primary-pressed"), c("primary-bg"), c("primary-ink"),
    `  --color-ring: rgba(${pr}, ${pg}, ${pb}, 0.35);`,
    c("gray-1"), c("gray-2"), c("gray-3"), c("canvas"), c("border"), c("track"),
    c("row-hover"), c("row-selected"), c("ink-soft"), c("text-subtle"), c("text-muted"),
    c("secondary-hover"),
    c("danger"), c("danger-bg"), c("danger-ink"),
    c("success-bg"), c("success-ink"), c("success-dot"),
    c("warning-bg"), c("warning-ink"), c("warning-dot"),
    c("info-bg"), c("info-ink"), c("info-dot"),
    // Flat, not a re-hue of Beacon's real 2-stop gradient — on request, 2026-08-13. Still a
    // linear-gradient() (same colour both stops), not a bare hex: Buttons.jsx reads this via
    // backgroundImage, which only accepts an <image> — see this file's own note above SIBLINGS.
    `  --gradient-primary: linear-gradient(180deg, ${t.primary}, ${t.primary});`,
    `  --gradient-data: linear-gradient(90deg, ${t.primary}, ${t.primary});`,
    `  --shadow-primary: 0 8px 20px -8px rgba(${pr}, ${pg}, ${pb}, .7), inset 0 1px 0 rgba(255, 255, 255, .28);`,
    `  --type-display: "${t.font}", sans-serif;`, `  --font-display: "${t.font}", sans-serif;`,
    `  --type-sans: "${t.font}", sans-serif;`, `  --font-sans: "${t.font}", sans-serif;`,
    `}`,
  ];
  return lines.join("\n");
}

const banner = `/* GENERATED by engine/gen-theme-variants.mjs — regenerate rather than hand-editing.
 *
 * Compass/Dusk/Cove/Nova's literal-valued overrides for the tokens.css contract Beacon declares
 * bare on :root. Installed by kit-install.mjs alongside tokens.css; imported in main.jsx right
 * after app-identity.css so an app's own accent (if it has one) still layers on Beacon by
 * default, and only flips when <html data-theme="…"> names one of these ids — see
 * ThemeSwitcher.jsx (app-kit/kit/), which is what sets that attribute.
 *
 * Beacon needs no --color-* block here — it IS the contract's bare :root. Every OTHER --color-*
 * token these anchors imply (chart-1..6, --color-accent, --color-muted, --color-control-*, ...) is
 * already a var() reference to one of the names below in tokens.css itself and resolves
 * automatically once the literal changes — restating them here would be redundant, not wrong, so
 * they're omitted.
 *
 * TWO RULE SHAPES PER ANCHOR, not one. The --color-* custom-property block only reaches consumers
 * that read it via var() directly (inline styles — chart bars, gradients). tokens.css declares
 * those colours as plain literals inside @theme inline, and Tailwind's "inline" mode BAKES a
 * literal straight into every class it generates from it — so a plain Tailwind class like
 * bg-primary compiles to a frozen background-color:#ff6203, never background-color:var(...), and
 * no runtime override of the custom property reaches it. The [data-theme=…] .cls { ... } block
 * below targets those compiled classes directly instead — see gen-theme-variants.mjs's own
 * CLASS_OVERRIDES comment for how that list was found (empirically, from the built CSS, not
 * guessed) and why it isn't the real fix (tokens.css itself should go through a var() indirection
 * like shadcn.css's own tokens already do — a separate, bigger change).
 */

`;

const css = Object.entries(SIBLINGS)
  .map(([id, s]) => block(id, s) + "\n\n" + classBlock(id, s))
  .join("\n\n");

writeFileSync(OUT, banner + css + "\n");
console.log(`theme-variants.css → ${OUT} · ${Object.keys(SIBLINGS).length} anchors`);
