// emit-live-themes.mjs — generate the LIVE app's theme system from the same source of truth the
// prototype uses (reference/ui-themes.json — one anchor, Beacon, as of 2026-08-12, when the other
// ten design languages were retired; see reference/legacy/README.md for the 21 retired before that
// and language-catalog.mjs's loadLanguages() for how the language's palette is derived from
// tokens.css, not typed here twice).
//
// WITH ONE ANCHOR, "the in-app switcher" below has exactly one thing to switch to. Kept rather than
// removed: `anchors`/`loadLanguages()` genuinely still generalizes (this file needed zero logic
// changes for the count to go 21 → 3 → 11 → 1, only its FIT_KEYWORDS-dependent domain-scoring did —
// see emitJs), and re-adding a language later means editing tokens.css and ui-themes.json, not this
// file. What no longer functions as intended: pickTheme's curated-keyword scoring boost (nothing to
// out-rank with one entry) and the visible THEMES picker UI a generated app might render (a one-
// option picker). Neither throws or produces wrong output — this is a UX call about whether a
// generated app should still show a switcher at all, not a correctness bug; flagged, not decided
// here.
//
// WHY THIS EXISTS. Before this, three separate converters read the registry independently:
//   engine/language-catalog.mjs      → the prototype shell        (full dump, 70 tokens/mode)
//   p2p-ui/scripts/port-rapp-themes.mjs → one live app's presets (regex parser over the TS source)
//   p2p-ui/scripts/emit-proto-catalog.mjs → proto-kit/themes.json (a now-stale third artifact)
// and the scaffold every NEW app gets (@kissflow/create-app) shipped a fourth, much poorer system:
// 7 accent-only presets that override primary + chart-1..5 and nothing else — no per-theme fonts,
// radius, shadows, spacing or type scale. Every fidelity bug therefore had to be found and fixed N
// times (2026-07-30: the primary-foreground contrast bug existed only in language-catalog; the wrong
// radius rung only in the .md-mirror path). One generator, one source, one set of bugs.
//
// Emits TWO files that together upgrade a scaffolded app to the full anchor system (one anchor,
// Beacon, now — see the note above):
//   themes.css — one `:root[data-theme="<id>"]` block per anchor (+ a `.dark` variant), carrying the
//                COMPLETE token set, plus an `@theme inline` bridge so Tailwind's own scales
//                (shadow/spacing/text/font-weight/tracking/leading/radius) resolve to them.
//   themes.js  — the registry (id, label, swatch, description, fit) + applyTheme/getTheme and the
//                Google-Fonts loader, since each anchor brings its own pairing.
//
//   node emit-live-themes.mjs --out <dir>            # writes themes.css + themes.js into <dir>
//   node emit-live-themes.mjs --out <dir> --default <anchorId>
//
// SELECTOR SPECIFICITY IS DELIBERATE. Blocks are `:root[data-theme=…]` (0,2,0), not `[data-theme=…]`
// (0,1,0): the scaffold's index.css declares its base tokens on `:root` (0,1,0), and a bundler that
// appends the app stylesheet AFTER this file would let an equal-specificity block silently lose —
// which is exactly how a theme switcher can look wired up and change nothing.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// loadLanguages from language-catalog.mjs, not a second reader of the raw JSON: this file used to keep
// its own copy that read reference/ui-themes.json directly, which meant it never saw the derived
// palette merge language-catalog.mjs's loadLanguages() applies (2026-08-10) — it would have kept reading
// each language's now-stripped duplicate fields as `undefined` forever. One reader.
import { loadLanguages } from "./language-catalog.mjs";
import { LANGUAGES } from "./theme-from-design.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── oklch helpers ────────────────────────────────────────────────────────────────────────────────
const parseOklch = (s) => {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s || "");
  return m ? { l: +m[1], c: +m[2], h: +m[3] } : null;
};
const oklch = ({ l, c, h }) => `oklch(${+l.toFixed(4)} ${+c.toFixed(4)} ${+h.toFixed(2)})`;

// rapp's `warning` is authored as a FILL (L≈0.75–0.8). We also use it as TEXT on a card, where that
// lightness can't hold a legible label — so normalize L (and cap chroma) for the text role only.
// Ported verbatim from p2p-ui's port script; it was a deliberate, documented decision there.
function normWarn(value, dark) {
  const p = parseOklch(value);
  if (!p) return value;
  return oklch({ l: dark ? 0.75 : 0.63, c: Math.min(p.c, 0.15), h: p.h });
}

// The registry has NO border token — its model is "borders are ink at low alpha", so we derive one.
// Alpha tracks the theme's own authored border-width: a theme that says "explicitly bordered" with a
// 2–3px rule wants that rule VISIBLE, while a 0px floating-card theme wants the faintest hairline.
const BORDER_ALPHA = { "0px": "8%", "1px": "11%", "2px": "15%", "3px": "19%", "4px": "22%" };
const borderMix = (bw) => `color-mix(in oklab, var(--foreground) ${BORDER_ALPHA[bw] || "11%"}, transparent)`;

// ── one preset → its CSS token block ─────────────────────────────────────────────────────────────
// `mode` is the registry's own light/dark palette; `structure` (type scale, spacing, motion…) is
// mode-independent in the source but stored per-mode, so we read it off `light`.
function modeTokens(p, mode, dark) {
  const g = (k, fb) => (mode[k] !== undefined ? mode[k] : fb);
  const bw = g("border-width-medium", "1px");
  const t = {
    background: g("background"),
    foreground: g("foreground-ink", g("foreground")),
    card: g("surface", g("background")),
    "card-foreground": g("foreground-ink"),
    popover: g("surface", g("background")),
    "popover-foreground": g("foreground-ink"),
    primary: g("primary"),
    // NEVER threshold this on HSL lightness. Every anchor is coordinate-derived at oklch L≈0.56–0.623
    // precisely so its foreground-inverse (near-white) always works; HSL's L is hue-dependent and
    // reads the SAME oklch value anywhere from 28 to 68, which silently flipped 4 anchors to dark
    // text on a mid-tone primary (user-reported, 2026-07-30). Trust the source's own inverse.
    "primary-foreground": g("foreground-inverse", dark ? "oklch(0.205 0 0)" : "oklch(0.985 0 0)"),
    secondary: g("muted"),
    "secondary-foreground": g("foreground-ink"),
    muted: g("muted"),
    "muted-foreground": `color-mix(in oklab, var(--foreground) 62%, var(--card))`,
    // The scaffold's `accent` is a SOFT TINT SURFACE (hover rows, icon chips) with dark text on it —
    // not a brand colour. The registry's `accent` IS a brand colour (Voyage's sunset amber against
    // its cyan primary). Mapping one onto the other directly would put dark text on saturated amber,
    // so keep both: `--accent` stays the tint surface, `--brand-accent` carries the real second hue
    // for gradients/highlights that want it.
    accent: `color-mix(in oklab, ${g("accent", g("primary"))} 12%, ${g("surface", g("background"))})`,
    "accent-foreground": g("foreground-ink"),
    "brand-accent": g("accent", g("primary")),
    destructive: g("destructive"),
    "destructive-foreground": dark ? "oklch(0.205 0 0)" : "oklch(0.985 0 0)",
    success: g("success"),
    warning: normWarn(g("warning"), dark),
    info: g("info"),
    border: borderMix(bw),
    input: borderMix(bw),
    ring: g("ring", g("primary")),
    sidebar: g("surface", g("background")),
    "sidebar-foreground": g("foreground-ink"),
    "sidebar-primary": g("primary"),
    "sidebar-primary-foreground": g("foreground-inverse", dark ? "oklch(0.205 0 0)" : "oklch(0.985 0 0)"),
    "sidebar-accent": g("muted"),
    "sidebar-accent-foreground": g("foreground-ink"),
    "sidebar-border": borderMix(bw),
    "sidebar-ring": g("ring", g("primary")),
    // shadow scale — the theme's OWN 7 authored tiers, not one of N generic recipes. `kf-` prefixed
    // for the same reason as the type ladders (see structureTokens): --shadow-* is a Tailwind key.
    ...Object.fromEntries(["2xs", "xs", "sm", "md", "lg", "xl", "2xl"].map((k) => [`kf-shadow-${k}`, g(`shadow-${k}`)])),
  };
  // chart-1..8 (mono ramp) + category-1..8 (categorical spread). The scaffold's @theme inline only
  // bridges chart-1..5; we emit all 8 of each so a chart with 8 series has real, distinct hues.
  for (let i = 1; i <= 8; i++) {
    t[`chart-${i}`] = g(`chart-${i}`, g(`category-${i}`, g("primary")));
    t[`category-${i}`] = g(`category-${i}`, g(`chart-${i}`, g("primary")));
  }
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined));
}

// mode-independent personality: radius, fonts, and the type/spacing/motion ladders.
//
// NAMING. These are declared under a `kf-` prefix DELIBERATELY. Tailwind v4's own theme keys include
// --text-*, --shadow-*, --spacing, --font-sans, --font-weight-*, --tracking-*, --leading-*; writing
// `@theme inline { --text-xs: var(--text-xs) }` would make the source and the bridge target the same
// name, whose resolution depends on whether Tailwind re-emits the variable under `inline`. Prefixing
// the raw declaration makes the direction unambiguous: `kf-*` is authored here, the unprefixed name
// is Tailwind's. (--radius and the colour tokens stay UNPREFIXED on purpose — the scaffold's own
// index.css already declares and bridges those, and overriding them is exactly how a theme takes.)
function structureTokens(p) {
  const s = p.light || {};
  const fonts = p.fonts || { heading: "Inter", body: "Inter" };
  const q = (f) => (/serif|Fraunces|Lora|Merriweather/i.test(f) ? "ui-serif, Georgia, serif" : "ui-sans-serif, system-ui, sans-serif");
  return {
    // preset.radius is the registry's single authored value — the rung its own ThemeProvider maps to
    // `--radius-lg`. Reading a smaller rung off the `rounded` ladder was the 2026-07-30 radius bug.
    radius: p.radius || "0.625rem",
    "kf-font-sans": `"${fonts.body}", ${q(fonts.body)}`,
    "kf-font-display": `"${fonts.heading}", ${q(fonts.heading)}`,
    "kf-font-mono": s["font-mono-var"] || `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`,
    "kf-spacing-unit": s.spacing || "0.25rem",
    ...Object.fromEntries(["xs", "sm", "base", "lg", "xl", "2xl", "display", "kpi"].map((k) => [`kf-text-${k}`, s[`text-${k}`]])),
    ...Object.fromEntries(["normal", "medium", "semibold", "bold", "black"].map((k) => [`kf-font-weight-${k}`, s[`font-weight-${k}`]])),
    ...Object.fromEntries(["tighter", "tight", "normal", "wide", "wider", "widest"].map((k) => [`kf-tracking-${k}`, s[`tracking-${k}`]])),
    ...Object.fromEntries(["tight", "snug", "normal", "relaxed", "loose"].map((k) => [`kf-leading-${k}`, s[`leading-${k}`]])),
    "kf-motion-duration": s["default-transition-duration"] || "150ms",
    "kf-motion-ease": s["default-transition-timing-function"] || "ease",
    "kf-border-width": s["border-width-medium"] || "1px",
    "kf-ring-width": s["ring-width"] || "2px",
  };
}

const decls = (obj, indent = "  ") =>
  Object.entries(obj).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${indent}--${k}: ${v};`).join("\n");

// ── the Tailwind v4 bridge ───────────────────────────────────────────────────────────────────────
// The scaffold's index.css already bridges COLOR tokens via `@theme inline`. It does NOT bridge the
// shadow/spacing/text/weight/tracking/leading scales — which is why per-theme shadows and spacing had
// no effect there even once the tokens existed. Bridging them here means every `shadow-sm`, `gap-4`,
// `text-xs`, `font-bold` class already written across every generated page re-themes with ZERO
// markup changes.
export const BRIDGE_START = "/* >>> kf-theme-bridge (generated by engine/emit-live-themes.mjs) */";
export const BRIDGE_END = "/* <<< kf-theme-bridge */";

// THIS MUST BE APPENDED TO index.css, NOT themes.css. Tailwind v4 only resolves `@theme` inside the
// stylesheet that does `@import "tailwindcss"` — a bundler-level `import "./themes.css"` from JS is a
// SEPARATE stylesheet, so a bridge placed there parses fine, ships to the browser, and is silently
// inert: `.shadow-sm` keeps Tailwind's default instead of the theme's authored value. That failure is
// invisible without diffing the built CSS (found exactly that way, 2026-07-30).
const THEME_BRIDGE = `${BRIDGE_START}
/* ── Tailwind v4 bridge — map the personality tokens onto Tailwind's own scales ───────────────────
   The scaffold's index.css bridges colours only; without this block a theme's authored shadows,
   spacing unit and type scale exist as CSS vars but no utility class ever reads them. */
@theme inline {
  --color-brand-accent: var(--brand-accent);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
${[6, 7, 8].map((i) => `  --color-chart-${i}: var(--chart-${i});`).join("\n")}
${Array.from({ length: 8 }, (_, i) => `  --color-category-${i + 1}: var(--category-${i + 1});`).join("\n")}

  --shadow-2xs: var(--kf-shadow-2xs);
  --shadow-xs: var(--kf-shadow-xs);
  --shadow-sm: var(--kf-shadow-sm);
  --shadow-md: var(--kf-shadow-md);
  --shadow-lg: var(--kf-shadow-lg);
  --shadow-xl: var(--kf-shadow-xl);
  --shadow-2xl: var(--kf-shadow-2xl);

  --spacing: var(--kf-spacing-unit);

  --text-xs: var(--kf-text-xs);
  --text-sm: var(--kf-text-sm);
  --text-base: var(--kf-text-base);
  --text-lg: var(--kf-text-lg);
  --text-xl: var(--kf-text-xl);
  --text-2xl: var(--kf-text-2xl);

  --font-sans: var(--kf-font-sans);
  --font-mono: var(--kf-font-mono);
  --font-display: var(--kf-font-display);

  --font-weight-normal: var(--kf-font-weight-normal);
  --font-weight-medium: var(--kf-font-weight-medium);
  --font-weight-semibold: var(--kf-font-weight-semibold);
  --font-weight-bold: var(--kf-font-weight-bold);

  --tracking-tighter: var(--kf-tracking-tighter);
  --tracking-tight: var(--kf-tracking-tight);
  --tracking-normal: var(--kf-tracking-normal);
  --tracking-wide: var(--kf-tracking-wide);
  --tracking-wider: var(--kf-tracking-wider);
  --tracking-widest: var(--kf-tracking-widest);

  --leading-tight: var(--kf-leading-tight);
  --leading-snug: var(--kf-leading-snug);
  --leading-normal: var(--kf-leading-normal);
  --leading-relaxed: var(--kf-leading-relaxed);
  --leading-loose: var(--kf-leading-loose);

  --default-transition-duration: var(--kf-motion-duration);
  --default-transition-timing-function: var(--kf-motion-ease);
}
${BRIDGE_END}
`;

export const emitBridge = () => THEME_BRIDGE;

export function emitCss(anchors) {
  const blocks = anchors.map((p) => {
    const light = modeTokens(p, p.light || {}, false);
    const dark = modeTokens(p, p.dark || {}, true);
    const struct = structureTokens(p);
    return `/* ── ${p.name} — ${p.description} */
:root[data-theme="${p.id}"] {
${decls({ ...struct, ...light })}
}
:root[data-theme="${p.id}"].dark {
${decls(dark)}
}`;
  });
  return `/* GENERATED by engine/emit-live-themes.mjs — do not edit by hand.
   Source: reference/ui-themes.json (full dump of rapp-ui-registry packages/themes presets).
   Regenerate: node engine/emit-live-themes.mjs --out src/

   ${anchors.length} anchors, each a COMPLETE identity: light+dark palettes, an 8-hue chart ramp and
   an 8-hue categorical ramp, its own font pairing, radius, 7-tier shadow scale, spacing unit, type
   scale, weight/tracking/leading ladders and motion timing.

   Apply: set <html data-theme="<id>">, add class="dark" for dark mode.

   NOTE: the Tailwind "@theme inline" bridge that makes these tokens drive utility classes lives in
   index.css, NOT here — Tailwind only resolves @theme in the stylesheet that imports tailwindcss.
   upgradeApp() writes it there; see BRIDGE_START in engine/emit-live-themes.mjs. */

${blocks.join("\n\n")}
`;
}

export function emitJs(anchors, defaultId) {
  const rows = anchors.map((p) => {
    // FIT_KEYWORDS retired 2026-08-12 with language-catalog.mjs's domain-scoring (rankLanguages) —
    // pickTheme below now only ever has one THEMES entry to return, so its curated-keyword boost
    // (4 vs the description-tail's 1-3) has no second entry to out-rank. `fit` stays an array (not
    // deleted) so pickTheme's `.includes` calls don't need a null-check for a shape that never
    // changed, just emptied.
    const fit = [];
    return `  { id: ${JSON.stringify(p.id)}, label: ${JSON.stringify(p.name)}, swatch: ${JSON.stringify(p.light?.primary || "")}, ` +
      `category: ${JSON.stringify(p.category || "")}, fonts: ${JSON.stringify([p.fonts?.heading, p.fonts?.body].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i))}, ` +
      `fit: ${JSON.stringify(fit)},\n    description: ${JSON.stringify(p.description || "")} }`;
  });
  return `// GENERATED by engine/emit-live-themes.mjs — do not edit by hand.
// Source: reference/ui-themes.json. Regenerate: node engine/emit-live-themes.mjs --out src/
//
// Each entry maps to a \`:root[data-theme="<id>"]\` block in themes.css. \`fit\` is empty now — the
// curated domain vocabulary it used to carry (language-catalog.mjs's FIT_KEYWORDS) was retired
// 2026-08-12 with the rest of the multi-language selection machinery; kept as a field, not deleted,
// so pickTheme below still returns a shape callers expect.

export const THEMES = [
${rows.join(",\n")}
];

export const DEFAULT_THEME = ${JSON.stringify(defaultId)};

const KEY = "kf-theme";

/** Load a theme's Google Fonts on demand — each anchor brings its own pairing. */
const loaded = new Set();
export function loadThemeFonts(id) {
  const t = THEMES.find((x) => x.id === id);
  if (!t) return;
  for (const fam of t.fonts) {
    if (loaded.has(fam)) continue;
    loaded.add(fam);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=" +
      encodeURIComponent(fam).replace(/%20/g, "+") + ":wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }
}

/** The identity index.html was stamped with. DEFAULT_THEME is "" by design (see upgradeApp's note:
 *  this emitter never picks an app's anchor), so the attribute is the only place the app's own
 *  language is recorded before any user has chosen one. */
const stamped = () => document.documentElement.dataset.theme || "";

/** localStorage throws outright in a third-party iframe with storage blocked — and this runs during
 *  boot, so an uncaught throw here takes the whole app down rather than losing a preference. */
const remembered = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };

export function getTheme() {
  return remembered() || stamped() || DEFAULT_THEME;
}

/** Apply a preset by id (persists the choice, loads its fonts). */
export function applyTheme(id) {
  // NEVER blank the attribute. Every block in themes.css is a :root[data-theme="..."] rule — including
  // beacon's — so an empty value matches NOTHING and every token in the contract disappears at once:
  // the app keeps its geometry and loses every colour, surface, radius and font. That is what shipped
  // to Kissflow on 2026-08-11 (Monitor Ops): index.html carried data-theme="beacon", boot called
  // applyTheme(getTheme()), the iframe's localStorage was empty, DEFAULT_THEME was "", and the "" was
  // written straight over "beacon". It survives locally only because a previous session leaves a real
  // id in localStorage — a fresh third-party iframe is the honest repro.
  // An unknown id now falls back to what index.html stamped, which is exactly the "leave it alone"
  // contract upgradeApp documents.
  if (!THEMES.some((t) => t.id === id)) id = stamped() || DEFAULT_THEME;
  if (id) document.documentElement.dataset.theme = id;
  loadThemeFonts(id);
  try { if (id) localStorage.setItem(KEY, id); } catch { /* storage blocked — preference is not load-bearing */ }
  return id;
}

/** Score the catalog against an app's domain words — same rule as the prototype's picker. */
export function pickTheme(words) {
  const w = String(words || "").toLowerCase().split(/[^a-z]+/).filter((x) => x.length > 2);
  let best = null;
  for (const t of THEMES) {
    const hay = (t.name + " " + t.description).toLowerCase();
    let score = 0;
    for (const word of w) {
      if (t.fit.includes(word)) score += 4;
      if (hay.includes(word)) score += hay.split("—").pop().includes(word) ? 3 : 1;
    }
    if (!best || score > best.score) best = { id: t.id, score };
  }
  return best && best.score > 0 ? best.id : DEFAULT_THEME;
}
`;
}

/**
 * Upgrade a SCAFFOLDED app (@kissflow/create-app) to the full anchor system.
 * The scaffold ships an accent-only themes.css/themes.js (7 presets overriding primary + chart-1..5
 * and nothing else) — same import surface, far less identity. Because the generated files keep that
 * exact surface (`applyTheme`/`getTheme`, `import "./themes.css"`), this is a drop-in replacement:
 * main.jsx needs no edit.
 *
 * THIS NO LONGER SETS THE APP'S IDENTITY (2026-08-04). It emits INFRASTRUCTURE only:
 *   · src/themes.css   — the anchor block(s) — one, Beacon, since 2026-08-12 — so the in-app
 *                        switcher has something to switch TO (see the file-header note on what a
 *                        one-entry switcher means)
 *   · src/index.css    — the `@theme inline` bridge, which is what makes ordinary Tailwind utility
 *                        classes (shadow-sm, p-4, text-xs) resolve to theme tokens at all
 *   · src/themes.js    — the registry + applyTheme/getTheme that app-shell.jsx imports
 *   · agents/theming.md — the token contract kf-ui-designer / kf-ui-builder read before designing
 *
 * `defaultId` is therefore forced to "" and index.html's `data-theme` is left alone. An app's
 * identity comes from ONE place — `src/app-identity.css`, generated by engine/theme-from-design.mjs
 * from the SAME design slice the prototype was rendered with — so the reviewed screen and the
 * deployed app cannot diverge. Stamping an anchor here on top of that is what let PromoTrack ship a
 * blue prototype beside a monochrome live app: the anchor won, and it was not the app's design.
 */
export function upgradeApp(appDir, _defaultIdIgnored, anchors = loadLanguages()) {
  const defaultId = "";   // identity is app-identity.css's job — see the note above
  const src = join(appDir, "src");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "themes.css"), emitCss(anchors));
  writeFileSync(join(src, "themes.js"), emitJs(anchors, defaultId));
  const changed = ["src/themes.css", "src/themes.js"];
  // The bridge goes in index.css — the stylesheet that imports tailwindcss — or it is inert.
  // Idempotent: a previous bridge (between the markers) is replaced, not stacked.
  const cssPath = join(src, "index.css");
  try {
    let css = readFileSync(cssPath, "utf8");
    const s = css.indexOf(BRIDGE_START), e = css.indexOf(BRIDGE_END);
    css = s >= 0 && e > s ? css.slice(0, s) + css.slice(e + BRIDGE_END.length) : css;
    writeFileSync(cssPath, css.trimEnd() + "\n\n" + emitBridge());
    changed.push("src/index.css");
  } catch { /* no index.css — caller isn't a standard scaffold; theme blocks still apply */ }
  // index.html's `data-theme` is deliberately CLEARED, not set. A leftover value from the scaffold
  // (create-app ships data-theme="violet") paints a `:root[data-theme=…]` block that outranks
  // nothing but still tints primary/chart-1..5 — a stray accent from a preset the app never chose.
  // Empty means no anchor block matches and the identity sheet is the only thing colouring the app.
  //
  // EXCEPT a DESIGN LANGUAGE. That attribute now has a second, load-bearing meaning: which of the
  // three languages in src/tokens.css the app adopts — set by theme-from-design.mjs, and the source
  // of ~130 of the app's tokens. Clearing it would drop the app back to Beacon whatever its
  // prototype was designed as, and would do it silently: the identity sheet still applies the
  // accent, so the app still looks themed. This function runs BEFORE theme-from-design in the
  // documented order, but it is idempotent and gets re-run — so the value has to survive.
  // Imported, not restated. This was the THIRD hardcoded copy of the language list (after the catalog
  // and theme-from-design's own array), and the one furthest from anything that would notice it going
  // stale: a language missing from here is silently stripped off <html data-theme>, dropping a built
  // app back to Beacon while its identity sheet still applies the accent — so it still looks themed,
  // just not like itself. It went wrong exactly that way when the catalog changed underneath it.
  const htmlPath = join(appDir, "index.html");
  try {
    const html = readFileSync(htmlPath, "utf8");
    const current = (/<html[^>]*\sdata-theme="([^"]*)"/i.exec(html) || [])[1];
    const next = LANGUAGES.includes(current)
      ? html
      : html.replace(/(<html[^>]*\sdata-theme=")[^"]*(")/i, `$1$2`);
    if (next !== html) { writeFileSync(htmlPath, next); changed.push("index.html"); }
  } catch { /* no index.html (non-Vite host) — the runtime applyTheme() still sets the attribute */ }
  // agents/theming.md is what the UI agents READ before designing a page (see commands/add-page.md
  // Step 0). Leaving the scaffold's copy in place would keep telling them the app has 7 accent-only
  // presets, so they'd never use the fonts/shadow/spacing/type the app now actually has.
  try {
    mkdirSync(join(appDir, "agents"), { recursive: true });
    writeFileSync(join(appDir, "agents", "theming.md"), themingDoc(anchors, defaultId));
    changed.push("agents/theming.md");
  } catch { /* non-fatal */ }

  // Install the build gate. This belongs HERE and not only in the starter, because the apps that
  // actually lose their identity are create-app scaffolds: they carry their own package.json and
  // never saw starter/'s `prebuild`. PromoTrack shipped unthemed with a gate sitting in a file it
  // did not have. Idempotent — re-running replaces the script and leaves an existing hook alone.
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    mkdirSync(join(appDir, "scripts"), { recursive: true });
    writeFileSync(join(appDir, "scripts", "theme-check.mjs"),
      readFileSync(join(here, "theme-check.mjs"), "utf8"));
    changed.push("scripts/theme-check.mjs");

    const pkgPath = join(appDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.scripts ||= {};
    pkg.scripts["check:theme"] = "node scripts/theme-check.mjs .";
    const pre = pkg.scripts.prebuild;
    if (!pre) pkg.scripts.prebuild = "npm run check:theme";
    else if (!pre.includes("check:theme")) pkg.scripts.prebuild = `${pre} && npm run check:theme`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    changed.push("package.json");
  } catch { /* non-fatal — the app still themes correctly, it just isn't guarded */ }
  return changed;
}

function themingDoc(anchors, defaultId) {
  const cur = anchors.find((a) => a.id === defaultId) || anchors[0];
  return `# Theming — ${anchors.length} design anchor${anchors.length === 1 ? "" : "s"} (generated)

GENERATED by engine/emit-live-themes.mjs — regenerate rather than editing.

This app's theme is **${cur.name}** (\`${cur.id}\`) — ${cur.description}

## The model

Every theme is a COMPLETE identity, not an accent swap. Each \`:root[data-theme="<id>"]\` block in
\`src/themes.css\` carries its own palette (light + dark), font pairing, radius, 7-tier shadow scale,
spacing unit, type scale, weight/tracking/leading ladders and motion timing. \`src/index.css\` bridges
those onto Tailwind's own scales, so **ordinary utility classes are already theme-aware**:

| You write | It resolves to |
|---|---|
| \`shadow-sm\` \`shadow-md\` \`shadow-lg\` | the theme's authored shadow tier |
| \`p-4\` \`gap-6\` \`m-2\` (any spacing) | \`calc(n × the theme's spacing unit)\` |
| \`text-xs\` … \`text-2xl\` | the theme's type scale |
| \`font-medium\` \`font-semibold\` \`font-bold\` | the theme's weight ladder |
| \`tracking-*\` / \`leading-*\` | the theme's tracking + leading ladders |
| \`rounded-*\` | derived from the theme's radius |
| \`bg-primary\` \`text-muted-foreground\` \`border-border\` … | the theme's palette |

**So: never hardcode a colour, size, shadow, radius or spacing value.** Use the utility classes and
the app re-themes for free. Arbitrary values (\`text-[15px]\`, \`shadow-[0_2px_8px]\`, \`p-[13px]\`) opt
OUT of the theme and are the main way a page drifts from the design system.

Extra tokens beyond stock shadcn: \`--brand-accent\` (the theme's real second brand hue — Voyage's
sunset amber against its cyan primary; use for gradients/highlights, NOT as a text-on-fill colour),
\`--success\` / \`--warning\` / \`--info\`, \`chart-1..8\` (a mono ramp for one series) and
\`category-1..8\` (a categorical spread for distinct series), \`--kf-font-mono\` for numerals.

## Switching theme

\`\`\`js
import { applyTheme, pickTheme, THEMES } from "./themes.js";
applyTheme("${cur.id}");          // persists + loads that theme's Google Fonts
applyTheme(pickTheme("<the app's domain words>"));   // same scoring the prototype pipeline uses
\`\`\`

The default lives in two places, both already set: \`DEFAULT_THEME\` in \`src/themes.js\` and
\`data-theme\` on \`<html>\` in \`index.html\` (the latter prevents a first-paint flash).

## The catalog (${anchors.length})

${anchors.map((a) => `- **${a.name}** \`${a.id}\` — ${a.description}`).join("\n")}
`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const out = flag("--out"), app = flag("--app");
  if (!out && !app) {
    console.error("usage: emit-live-themes.mjs (--app <scaffolded-app-dir> | --out <dir>)\n" +
      "  Emits the anchor catalog, the Tailwind @theme bridge, themes.js and agents/theming.md.\n" +
      "  It does NOT set the app's identity — that is engine/theme-from-design.mjs.");
    process.exit(2);
  }
  const anchors = loadLanguages();
  // --default / --for used to choose the app's identity. They no longer can: identity comes from the
  // prototype's design slice via theme-from-design.mjs, and a second thing that could also set it is
  // precisely how a reviewed prototype and a deployed app came to disagree. Rejected loudly rather
  // than ignored — a flag that silently stops working is worse than one that is gone.
  const legacy = ["--default", "--for"].filter((f) => argv.includes(f));
  if (legacy.length) {
    console.error(
      `${legacy.join(" and ")} no longer set the app's theme.\n\n` +
      `  An app's identity comes from ONE place — the design slice its prototype was rendered with:\n` +
      `    node engine/theme-from-design.mjs <runDir>/prototype/experience-spec.json --out <app>/src/app-identity.css\n\n` +
      `  This command now emits infrastructure only (anchor catalog for the switcher, the Tailwind\n` +
      `  @theme bridge, themes.js, agents/theming.md). Re-run it without ${legacy.join("/")}.`);
    process.exit(2);
  }
  if (app) {
    const changed = upgradeApp(app, "", anchors);
    console.log(`upgraded ${app} → ${anchors.length} anchors (switcher + bridge) · no default set · wrote ${changed.join(", ")}`);
    console.log(`  next: theme-from-design.mjs <runDir>/prototype/experience-spec.json --out ${join(app, "src", "app-identity.css")}`);
  } else {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "themes.css"), emitCss(anchors));
    writeFileSync(join(out, "themes.js"), emitJs(anchors, ""));
    console.log(`themes.css + themes.js → ${out} · ${anchors.length} anchors · no default set`);
  }
}
