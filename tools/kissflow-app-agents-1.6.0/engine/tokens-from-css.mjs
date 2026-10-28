// tokens-from-css.mjs — the anchor's palette, chart ramp, shadow scale, motion, spacing, radius and
// fonts, DERIVED from proto-kit/tokens.css instead of duplicated into reference/ui-themes.json.
//
// WHY. Checked field-by-field (2026-08-10): 28 of the 72 fields in each language's
// ui-themes.json entry were a hand-copied restatement of a value tokens.css already declares —
// background, primary, the 8-hue chart ramp, border/ring width, spacing, motion timing, the mono
// font, sidebar colors, plus radius and the heading/body font pair at the top level. Two files
// agreeing about one number is a coincidence, not a guarantee: edit tokens.css and ui-themes.json
// silently goes stale. This module makes tokens.css the only place those numbers are typed.
//
// What is NOT derived here, because tokens.css has no equivalent to derive it FROM: the generic
// Tailwind type scale (text-xs..2xl — tokens.css only has bespoke component sizes like --kpi-text),
// tracking/leading ladders, font-weight names, and the whole "dark" mode object (tokens.css is
// light-first only, no `.dark` block exists anywhere in it). Those stay hand-authored in
// ui-themes.json because they are genuinely unique data, not a duplicate of anything.
//
// Every catalog entry IS a language since the 2026-08-10 merge, so this applies to all of them. A
// restored retired anchor without a real tokens.css block has nothing to derive from and keeps its
// hand-authored palette, same as before this module existed.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// The SYNCED copy, same reason design-language.mjs reads it and not starter/src/tokens.css
// directly: the plugin ships standalone (marketplace.json's source is ./plugins/app-agents, no
// copy of starter/ travels with it), so this has to work from what sync-tokens.mjs already copied.
const TOKENS_PATH = join(HERE, "proto-kit", "tokens.css");

// ── OKLCH conversion — the standard Björn Ottosson matrices, ported verbatim from the Python
// converter used to author the first cut of these presets (2026-08-10), and cross-checked there:
// converting the same color via its HSL triplet and via its hex both landed on the same OKLCH
// values to 4 decimal places. Re-implemented here so this module has no python dependency at
// runtime — same math, same constants. ─────────────────────────────────────────────────────────
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const cbrt = (x) => Math.sign(x) * Math.abs(x) ** (1 / 3);

function hslToRgb01(h, s, l) {
  s = clamp01(s); l = clamp01(l);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}
const hexToRgb01 = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function rgb01ToOklch([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const [l_, m_, s_] = [l, m, s].map(cbrt);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, C < 0.0005 ? 0 : H];
}
const oklchStr = ([L, C, H]) => `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(1)})`;
const hslTripletToOklch = (triplet) => {
  const [h, s, l] = triplet.trim().split(/\s+/).map((x) => parseFloat(x));
  return oklchStr(rgb01ToOklch(hslToRgb01(h, s / 100, l / 100)));
};
const hexToOklch = (hex) => oklchStr(rgb01ToOklch(hexToRgb01(hex)));

// ── tokens.css parsing ──────────────────────────────────────────────────────────────────────────
// Pull ONE language's block out of the contract. Beacon is the bare `:root { … }` — the only block
// there is now (the ten `:root[data-theme="X"] { … }` blocks were retired 2026-08-12; this function
// still takes `language` as a parameter rather than hardcoding "beacon" so it needs no edit if one
// is ever added back). Matches up to the first top-level `}` — the block never nests braces except
// inside comments, which the value-line regex below never enters.
function extractOneBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`tokens-from-css: no ${selector} block in tokens.css`);
  const bodyStart = start + selector.length;
  const end = css.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`tokens-from-css: unterminated ${selector} block`);
  return css.slice(bodyStart, end);
}

// 2026-08-13 — the Foundations migration split what used to be ONE `:root { … }` block (everything,
// colours included) into TWO: a short `:root { … }` (gradients, the chart ramp, --sidebar-width —
// values with no Tailwind `@theme` namespace to live in) and `@theme inline { … }` (--color-*,
// --radius-*, --shadow-*, --text-*, --spacing, --ease-* — everything Tailwind needs to generate a
// utility from). Beacon's declarations now span BOTH; reading only `:root` (the old behaviour)
// silently found the gradients and chart ramp but missed every colour, radius and shadow token —
// which is why this crashed on `--foreground` instead of the field the caller actually asked for.
// Retired-language blocks (`:root[data-theme="X"]`) never had this split and still don't exist at
// all today, so that branch is unaffected by the fix — kept for the same forward-compat reason
// extractOneBlock's `language` parameter was kept in the first place.
function extractBlock(css, language) {
  if (language === "beacon") return extractOneBlock(css, ":root {") + "\n" + extractOneBlock(css, "@theme inline {");
  return extractOneBlock(css, `:root[data-theme="${language}"] {`);
}

/** name -> raw declared value (first declaration wins, matching CSS itself). */
function declarations(block) {
  const out = new Map();
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2].trim());
  }
  return out;
}

const isHslTriplet = (v) => /^-?[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(v);
const isHex = (v) => /^#[0-9a-fA-F]{3,8}$/.test(v);
// 2026-08-13 — the OLD bare-name layer this was written against declared a color as a bare triplet
// (`--foreground: 218.2 21.6% 10%;`); Foundations wraps every colour in `hsl(...)` directly
// (`--color-primary: hsl(22.6 100% 50.6%);` — no separate `@theme inline` wrapper needed anymore,
// see tokens.css's own "NO MORE BARE-NAME LAYER" note). Unwrap it to the same bare triplet form so
// the rest of the pipeline (hslTripletToOklch) doesn't need to know which era a value came from.
const HSL_WRAPPED = /^hsl\(\s*(-?[\d.]+\s+[\d.]+%\s+[\d.]+%)\s*\)$/;
// Foundations' own two alpha colours (--color-ring, --color-scrim) are `rgba(R, G, B, A)` — the
// only form in the whole contract that carries transparency. Converted through the same sRGB
// pipeline as hex (0-255 -> 0-1 per channel) and the alpha carried through as an oklch `/ A`
// suffix, matching the shape shadowToOklchTint already produces below.
const RGBA_WRAPPED = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/;
function rgbaToOklch(v) {
  const m = RGBA_WRAPPED.exec(v);
  const [L, C, H] = rgb01ToOklch([m[1], m[2], m[3]].map((n) => +n / 255));
  const triplet = `${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(1)}`;
  return m[4] !== undefined ? `oklch(${triplet} / ${parseFloat(m[4])})` : `oklch(${triplet})`;
}
/** A declared color value -> oklch(...), whichever form tokens.css wrote it in. */
function colorToOklch(v) {
  const wrapped = HSL_WRAPPED.exec(v);
  if (wrapped) return hslTripletToOklch(wrapped[1]);
  if (isHslTriplet(v)) return hslTripletToOklch(v);
  if (isHex(v)) return hexToOklch(v);
  if (RGBA_WRAPPED.test(v)) return rgbaToOklch(v);
  throw new Error(`tokens-from-css: don't know how to convert color value "${v}"`);
}

// rgba(R,G,B,A) shadow strings -> the language's own ink at that alpha, in the oklch-shadow-string
// shape ui-themes.json's anchors already use. "0 0 #0000" (Tailwind's mechanical "no shadow", not
// the CSS keyword `none` — see tokens.css's own note on why) passes through unchanged rather than
// being colorized into a fake shadow. A value can carry MORE THAN ONE rgba()/oklch() call —
// Checkpoint's --elev-sm/md/lg are two-layer shadows, comma-separated — so every occurrence is
// recolored independently rather than assuming there's exactly one (an earlier version of this
// function anchored on a single trailing call and would have silently dropped Checkpoint's first,
// subtler layer).
function shadowToOklchTint(elevValue, inkOklchTriplet) {
  if (/^0 0 #0000$/.test(elevValue.trim())) return "0 0 #0000";
  // ONE pass, one pattern that matches either color form and pulls the alpha out of whichever
  // one it saw — never two sequential replaces, which would re-visit the strings the first pass
  // just wrote (harmless here since re-tinting the same ink at the same alpha is a no-op, but
  // fragile to rely on that rather than just not doing a second pass at all).
  return elevValue.replace(
    /rgba?\(\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\s*\)|oklch\([^)]+\/\s*([\d.]+)\s*\)/g,
    (_, rgbaAlpha, oklchAlpha) => `oklch(${inkOklchTriplet} / ${rgbaAlpha ?? oklchAlpha})`,
  );
}

// 2026-08-13 — Foundations migration reconciliation. tokens.css's own header calls this out under
// "NO MORE BARE-NAME LAYER": every OLD field this module reads (`--foreground`, `--card`,
// `--accent`, `--radius`, `--type-sans`, the whole `--elev-2xs..2xl` ladder, …) was a bare custom
// property; Foundations replaced that layer with direct `--color-*`/`--radius-*`/`--shadow-*`
// declarations and, for several concepts, retired the CONCEPT too — it names no single flat
// "accent"/"destructive"/"success" swatch, no font families, no elevation SIZE ladder (six shadow
// ROLES instead). A hard `need()` that throws on the first miss made EVERY field unreachable,
// including the ones Foundations answers perfectly well now (primary, ring, the 6-step chart
// ramp, …) — this is why `language-catalog.mjs validate`/`design` stopped working entirely, not
// just for the fields genuinely gone.
// RENAME carries the OLD field name to whatever NEW name answers the same question, where a plain
// name change (or a "collapse the family to one representative value") is the honest fix:
//   destructive -> danger swatch; success/warning/info -> their -dot (Foundations gives no flat
//   swatch for a tone, only a -bg/-ink/-dot triad — -dot is that tone's most-saturated value, the
//   natural stand-in for "the tone's one colour"); radius/radius-nested -> the two rungs
//   THEME-AUTHORING.md already documents an anchor's `radius` as mapping onto (radius-lg is the
//   rung the ThemeProvider reads; radius-md is one step in, per Foundations' own stated hierarchy
//   panel(xl) > tile/row(lg) > control(md) > mark(sm)); spacing-base -> spacing (same token,
//   renamed to Tailwind's own namespace); motion-ease -> ease-standard (Foundations' one motion
//   token, verbatim).
const RENAME = {
  destructive: "danger", success: "success-dot", warning: "warning-dot", info: "info-dot",
  radius: "radius-lg", "radius-nested": "radius-md", "spacing-base": "spacing",
  "motion-ease": "ease-standard",
};

// Foundations doesn't mint a font token at all (prose only: "Production sets DM Sans; Roboto ships
// on Android"), but Foundations.dc.html's OWN markup states the stacks verbatim — its body div's
// inline style and every mono token-label span. [SOURCE, derived] from that markup, not invented,
// used only where tokens.css has nothing (fonts.heading/body are a REQUIRED field downstream).
const FOUNDATIONS_SANS_STACK = "DM Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const FOUNDATIONS_MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Everything an anchor preset can derive from tokens.css for ONE language, in the same field
 * names/shapes ui-themes.json's `light` object and top-level `radius`/`fonts` already use — so
 * merging is a plain object spread, not a translation layer.
 */
export function derivePaletteFromLanguage(language, tokensCss = readFileSync(TOKENS_PATH, "utf8")) {
  const d = declarations(extractBlock(tokensCss, language));
  // INHERIT BEACON, exactly as the cascade does. A language block declares what DIFFERS; the contract
  // states plainly that "every token not named in a block inherits Beacon's", and `:root` is what the
  // browser falls back to at runtime. This used to throw instead, which was invisible while all three
  // languages happened to declare everything — and became wrong the moment a language legitimately has
  // no opinion (Iris names no warning colour; it has a violet, a teal and a coral, and that is all).
  // Throwing there would have forced a made-up amber into a system that never asked for one.
  const base = language === "beacon" ? null : declarations(extractBlock(tokensCss, "beacon"));
  // ONE raw lookup: RENAME first, then the CURRENT Tailwind-namespaced form (--color-X, what
  // tokens.css actually declares post-migration), then the pre-2026-08-13 bare form (--X, for a
  // language block that still carries it). Returns undefined rather than throwing — the caller
  // decides whether a miss is fatal (requireField/requireColor) or gracefully omitted (tryField/
  // tryColor), which is the actual fix: one missing field no longer takes every other field with it.
  // A declared value that is itself `var(--other-name)` — Foundations' whole point for the chart
  // ramp and this module's own restored semantic bridge ("the ramp introduces no colour", every
  // bridge entry aliases a real token instead of restating a literal) is that MOST values are now
  // references, not literals. The old code here assumed every declaration was already a literal
  // hsl()/hex string; that held while it happened to be true and broke the instant it wasn't.
  // One level of `var(--x[, fallback])` is resolved by recursing through raw() itself — with the
  // var()'s own fallback honoured if the referenced name isn't declared — which also transparently
  // walks a two-level chain (a var() resolving to another var()) without extra code.
  const VAR_REF = /^var\(--([\w-]+)\s*(?:,\s*([\s\S]*))?\)$/;
  const raw = (name) => {
    const n = RENAME[name] || name;
    for (const key of [`color-${n}`, n]) {
      const v = d.has(key) ? d.get(key) : (base && base.has(key) ? base.get(key) : undefined);
      if (v === undefined) continue;
      const m = VAR_REF.exec(v.trim());
      if (!m) return v;
      const resolved = raw(m[1]);
      if (resolved !== undefined) return resolved;
      if (m[2] !== undefined) return m[2].trim();
      return undefined;
    }
    return undefined;
  };
  const requireField = (name) => {
    const v = raw(name);
    if (v === undefined)
      throw new Error(`tokens-from-css: neither tokens.css's ${language} block nor :root declares --color-${RENAME[name] || name} (or --${RENAME[name] || name})`);
    return v;
  };
  const tryColor = (name) => { const v = raw(name); return v === undefined ? undefined : colorToOklch(v); };
  const requireColor = (name) => colorToOklch(requireField(name));

  const ink = requireColor("foreground");
  const inkTriplet = ink.match(/oklch\(([^)]+)\)/)[1];
  const primary = requireColor("primary");

  const light = {
    background: requireColor("background"), "foreground-ink": ink, surface: requireColor("card"),
    primary, muted: requireColor("muted"), accent: requireColor("accent"),
    destructive: requireColor("destructive"), success: requireColor("success"),
    warning: requireColor("warning"), info: requireColor("info"),
    // The schema wants an OPAQUE colour here (validated as plain "oklch(L C H)", no alpha) —
    // theme-from-design.mjs applies the alpha itself, separately, via its own per-anchor
    // `policy.ringAlpha` (Beacon: 0.38) when it builds `--ring-color`; `light.ring` only supplies
    // the HUE the ring focuses at. Foundations' own --color-ring IS "primary / 35% alpha" (its
    // one deliberately-alpha token) — same hue this reads, alpha simply lives elsewhere in this
    // pipeline, so it's dropped here rather than rejected by the validator.
    ring: primary,
    // Foundations names neither — both are the same "always-white / always-near-black, regardless
    // of the language's mood" anchors THEME-AUTHORING.md's own §1a documents (oklch(0.985 0 0) /
    // near-black). Foundations' surface (#FFFFFF) and secondary (#0A0A0B) already sit there, so
    // these alias rather than mint new literals. foreground-inverse is the ink for a DARK fill —
    // exactly what --color-secondary-foreground already answers in the restored bridge.
    "foreground-inverse": requireColor("secondary-foreground"),
    "static-light": requireColor("card"), "static-dark": requireColor("foreground"),
    // Every field below is OPTIONAL downstream (language-catalog.mjs's `g()` falls through to
    // EXT_FALLBACK, or the base preset's own hand-authored value survives the `{...p.light,
    // ...derived.light}` merge) — so a genuine Foundations gap is omitted here, never guessed.
    ...(raw("border-decor") !== undefined ? { "border-width-medium": raw("border-decor") } : {}),
    // Foundations §Controls: "ring-2 ring-offset-2" — a Tailwind utility in its own prose, not a
    // token, but this schema needs a real number. [SOURCE, derived] straight off that line.
    "ring-width": raw("ring-width") ?? "2px",
    spacing: requireField("spacing-base"), // -> --spacing, Foundations' own token, always present
    // Foundations names no single default duration (only per-interaction rows: 240/200/120ms) —
    // "Hover / color" (120ms) is the most general-purpose of the three. [SOURCE, derived].
    "default-transition-duration": raw("motion-duration") ?? "120ms",
    "default-transition-timing-function": requireField("motion-ease"), // -> --ease-standard, [SOURCE]
    // No Foundations statement at all (a chart-bar grow duration, DataCharts territory not yet
    // transcribed) — restored at the @utility's own existing fallback, so behaviour is unchanged
    // either way. [LEGACY, restored].
    "transition-duration-move": raw("motion-duration-move") ?? "220ms",
    "font-mono-var": raw("type-mono") ?? FOUNDATIONS_MONO_STACK,
  };
  // Sidebar colour — THEME-AUTHORING.md §4 documents the exact fallback for an anchor that
  // doesn't author one: "the rail derives from surface/border". Foundations hasn't transcribed
  // Layout.dc.html (the sidebar's own page) yet, so that documented default is what applies.
  light.sidebar = tryColor("sidebar") ?? requireColor("card");
  light["sidebar-border"] = tryColor("sidebar-border") ?? requireColor("edge");

  for (let i = 1; i <= 8; i++) {
    // Beacon declares chart-N as a plain hex whole-value (`--chart-N: #……;` — never a triplet,
    // never a var() reference), and every language that does not restate the ramp inherits it.
    // Foundations' own ramp is SIX steps now, not eight ("the ramp introduces no colour") — 7/8
    // are simply omitted rather than fabricated; nothing downstream requires exactly eight.
    const v = raw(`chart-${i}`);
    if (v === undefined) continue;
    const c = colorToOklch(v);
    light[`chart-${i}`] = c;
    light[`category-${i}`] = c; // no separate concept in tokens.css — same ramp, same name space
  }
  for (const rung of ["2xs", "xs", "sm", "md", "lg", "xl", "2xl"]) {
    // Foundations gives shadow ROLES (flat/raised/panel/button/overlay/contact/primary), not a
    // 2xs..2xl SIZE ladder — no honest one-to-one mapping exists between "how deep" and "what
    // it's for" yet, so this whole rung is omitted rather than force-mapped. Optional downstream
    // (EXT_FALLBACK covers it) — see the file banner above.
    const v = raw(`elev-${rung}`);
    if (v === undefined) continue;
    light[`shadow-${rung}`] = shadowToOklchTint(v, inkTriplet);
  }

  return {
    // Required downstream ("must be a single length"); RENAME -> --radius-lg, always present.
    radius: requireField("radius"),
    // The nested rung, so the validator can assert it never exceeds the base. RENAME -> --radius-md
    // (Foundations' own hierarchy: panel(xl) > tile/row(lg) > control(md) > mark(sm) — the control
    // rung is genuinely "one step inside" the tile/row rung `radius` above resolves to).
    // Why this is worth carrying: the generator's first pass read Signal's `radius.min: 16` (the
    // only radius its document states) as the NESTED rung, leaving --radius inherited at Beacon's
    // 14px — a nested corner rounder than the card containing it, in a file where nothing else
    // would have noticed.
    radiusNested: raw("radius-nested"),
    // Required downstream ("fonts: heading and body required"). Foundations mints no token for
    // either; both fall back to its own markup's stated stack (FOUNDATIONS_SANS_STACK above).
    fonts: { heading: (raw("type-display") ?? FOUNDATIONS_SANS_STACK).split(",")[0].replace(/["']/g, "").trim(),
             body: (raw("type-sans") ?? FOUNDATIONS_SANS_STACK).split(",")[0].replace(/["']/g, "").trim() },
    light,
  };
}
