// language-catalog.mjs — the DESIGN LANGUAGE catalog (reference/ui-themes.json) for
// kf-design-director. One entry — Beacon — a complete, vetted identity: light+dark oklch palettes,
// semantic colors, an 8-hue chart/category ramp, a heading/body font pairing, a 7-tier shadow scale,
// a spacing unit, a full type scale + weight/tracking/leading ladders, motion timing, a mono font,
// and border/ring widths. The director layers the app's own accent on top of it (accent hue,
// density, shell archetype) — the font pairing and radius character stay fixed, they ARE Beacon.
//
// RETIREMENT HISTORY, for reading old comments below that still name a language or say "21"/"11" —
// none of it is a live catalog size any more, all of it is provenance for how today's one entry was
// calibrated. 2026-08-10: collapsed from 21 personalities to one entry per design language. 2026-08-12,
// two steps the same day: Nimbus retired and nine languages added (Iris · Cadence · Harbour · Hearth
// · Lantern · Plush · Signal · Sorrel · Trailhead), bringing the catalog to 11 — and then, later that
// day, all ten non-Beacon entries retired together as the app settled on Beacon alone. Nothing from
// this second retirement was archived in-repo (an earlier retirement did archive to
// reference/legacy/ui-themes-retired.json — that file is unrelated history, not a place this
// retirement's ten entries went); they're recoverable from git history only. Originally re-sourced
// 2026-07-30 from rapp-ui-registry packages/themes/src/presets/*.ts.
//
// CLI (agent-friendly — prints JSON):
//   node language-catalog.mjs list                    → the one entry, id · fit one-liner
//   node language-catalog.mjs design <id> --rationale "<why>" [--hue-shift N]
//        [--density compact|comfortable|airy] [--archetype rail-left|rail-dark|top-bar|rail-right]
//        [--sidebar-tone light|brand|dark] [--app-id slug] [--app-name name]
//                                                     → a complete `design` slice for
//                                                               design-language.mjs#buildShell
//
// `--rationale` IS REQUIRED (2026-08-13) — the CLI refuses to print a slice without one. Added
// after an audit found roughly half the real runs in runs/ carrying no rationale at all and landing
// on unmodified defaults (rail-left, light sidebar, zero hue-shift) — exactly the "identical
// (hueShift, archetype) pair" kf-design-director.md's own hard rule says never to repeat, repeated
// silently because nothing enforced the rule at the one place a slice actually gets produced.
// "ADD your rationale afterward" was a step easy to skip; "the command will not run without it" is
// not. The rationale is written into the slice itself (not appended by the caller after the fact),
// and `--hue-shift`'s resolved value now travels with it too — it was computed and then discarded
// before, which made the never-repeat rule unauditable even if someone wanted to check it by hand.
// The CLI also warns (does not block — two apps sharing a look is a taste call, not a defect) if the
// same (hueShift, archetype) pair already exists in another run under runs/.
//
// WHAT'S GONE WITH THE SELECTION MACHINERY (retired 2026-08-12, same day as the blocks): the `pick`
// CLI command and `rankLanguages`/`FIT_KEYWORDS` it used (domain-word scoring across languages —
// moot with one); `--domain` and `--language` as CLI flags on `design` (there is nothing left to
// score or override — `<id>` is already the only id `list` will ever print). What's still here and
// is NOT selection machinery: palette derivation, sidebar-tone contrast formulas, gradient
// synthesis, and `validateLanguage` — all of that is per-app ACCENT computation layered on Beacon,
// unrelated to how many languages exist, and works exactly as before.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// One definition of the anchor→language lowering, imported rather than restated. theme-from-design
// imports nothing from here, so there is no cycle. Always resolves to "beacon" now — kept as an
// import rather than hardcoded so this file and theme-from-design.mjs cannot disagree if a language
// is ever added back.
import { pickLanguage } from "./theme-from-design.mjs";
import { derivePaletteFromLanguage } from "./tokens-from-css.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// 2026-08-10: the palette/chart-ramp/shadow-scale/motion/spacing/radius/fonts for an anchor that
// IS its own language (every catalog entry)
// are DERIVED from tokens.css here rather than typed into ui-themes.json a second time. Checked
// field-by-field before this landed: 28 of 72 fields per preset were a hand-copied restatement of
// a value tokens.css already declares, with nothing keeping the two in sync. ui-themes.json now
// carries only what tokens.css has no equivalent for — the generic type scale, tracking/leading,
// font-weight names, the dark-mode object (tokens.css is light-first, no `.dark` block exists) —
// and this merge fills the rest in from the one place those numbers are actually typed.
export function loadLanguages() {
  const presets = JSON.parse(readFileSync(join(HERE, "..", "reference", "ui-themes.json"), "utf8"));
  return presets.map((p) => {
    // Every catalog entry IS a design language now (the personalities that were not were retired on
    // 2026-08-10), and LANGUAGES is read from this very file — so the old "not a language, pass it
    // through unchanged" branch could not be reached by anything the catalog contains. A guard that
    // cannot fire reads as a supported case; this one had stopped being either.
    //
    // 2026-08-13 — restored the ONE case that guard's replacement (the unconditional call below)
    // never actually handled: an anchor with no tokens.css block to derive from at all. Compass,
    // Dusk, Cove and Nova (source files Theme Blue/Indigo/Teal/Violet.dc.html — this catalog names
    // its entries like Beacon, not after the source hue; see each entry's own ui-themes.json
    // "source" field for the mapping) are the first of these — sibling re-hues hand-authored
    // straight from their own Claude Design source, not transcribed into tokens.css (which stays
    // Beacon-only, see that file's own banner). tokens-from-css.mjs's file
    // banner already promised this exact fallback ("a restored retired anchor without a real
    // tokens.css block ... keeps its hand-authored palette, same as before this module existed")
    // but loadLanguages() never implemented it — derivePaletteFromLanguage's extractBlock throws on
    // a missing `:root[data-theme="…"]` selector, and nothing here caught it, so the promise was
    // dead code until an anchor actually needed it. p.light/p.radius/p.fonts are already complete
    // by construction for a hand-authored entry (validateLanguage would say so if they weren't), so
    // returning p unchanged is correct, not a partial result.
    let derived;
    try {
      derived = derivePaletteFromLanguage(p.id);
    } catch {
      return p;
    }
    return { ...p, radius: derived.radius, radiusNested: derived.radiusNested, fonts: derived.fonts, light: { ...p.light, ...derived.light } };
  });
}

// ── oklch → HSL (design-language.mjs consumes "H S% L%" triplets) ────────────────────────────────
function oklchToRgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ ** 3, m3 = m_ ** 3, s3 = s_ ** 3;
  let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const clamp = (c) => Math.min(1, Math.max(0, c));
  return [clamp(gamma(r)), clamp(gamma(g)), clamp(gamma(bl))];
}

export function oklchToHslParts(str) {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(str || "");
  if (!m) return null;
  const [r, g, b] = oklchToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}
const T = (p) => `${p.h} ${p.s}% ${p.l}%`;
const shiftHue = (p, deg) => ({ ...p, h: ((p.h + deg) % 360 + 360) % 360 });
// per-anchor sidebar-tone defaults — the anchor's OWN opinion of its rail, applied only when the
// caller doesn't pass an explicit sidebarTone (an explicit choice always wins). Empty since the
// 2026-08-10 collapse to 3 anchors (enterprise's "brand" rail default retired with it — see
// reference/legacy/README.md); every anchor keeps the "light" default until it earns its own entry.
const DEFAULT_SIDEBAR_TONE = {};
// Per-anchor shell archetype defaults — same override rule as sidebar tone (an explicit --archetype
// always wins). Empty since Checkpoint's entry (the only one that ever populated this — its identity
// WAS its container, the floating rounded canvas + gradient hero band) was retired 2026-08-12 along
// with the other nine non-Beacon languages. `--archetype hero-band` still works if asked for
// explicitly; synthGradients below still synthesises a wash for whichever language requests it.
const DEFAULT_ARCHETYPE = {};

// Build a hero/brand gradient pair out of an anchor's OWN palette, for anchors that carry none.
//
// WHY THIS EXISTS. The `hero-band` archetype paints its band with `--grad-hero` and its app mark
// with `--grad-brand`. Only the `checkpoint` anchor ships authored gradients, so any other anchor
// asking for that archetype got the CSS fallbacks — a flat `hsl(var(--card))` band — and the
// archetype's whole point is the wash. That forced an either/or: Checkpoint's container OR your own
// accent. A real build had to choose between wearing the source design's look and wearing its own.
//
// Only `hero` and `brand` are synthesised because only those two are consumed (the status gradients
// belong to components the generic shell does not render). Values are `hsl()` rather than hex so
// they stay readable in the emitted CSS and need no colour conversion.
function synthGradients(primary, bg) {
  // Local rounding: `round1` lives in theme-from-design.mjs and is not imported here. The parts
  // coming out of oklchToHslParts are already integers, so this only guards arithmetic below.
  const r = (n) => Math.round(n * 10) / 10;
  const P = (a) => `hsl(${r(primary.h)} ${r(primary.s)}% ${r(primary.l)}% / ${a})`;
  // A pale tint of the accent, and the app's own ground lifted a few points — the band reads as the
  // page's light source rather than as a coloured slab pasted on top.
  const tint = `hsl(${r(primary.h)} ${r(Math.min(primary.s, 60))}% ${r(Math.min(96, primary.l + 46))}%)`;
  const ground = `hsl(${r(bg.h)} ${r(bg.s)}% ${r(Math.min(98, bg.l + 4))}%)`;
  return {
    hero: `radial-gradient(680px 340px at 10% -10%, hsl(0 0% 100% / .85), hsl(0 0% 100% / 0) 70%), `
        + `radial-gradient(520px 300px at 85% -20%, ${P(".28")}, ${P("0")} 70%), `
        + `linear-gradient(160deg, ${tint}, ${ground})`,
    brand: `linear-gradient(160deg, ${P(".8")}, ${P("1")})`,
  };
}
// raw oklch L (0–1), read straight off the source string — NOT the HSL-converted lightness. HSL's L
// is hue-dependent (the Helmholtz–Kohlrausch-adjacent distortion of max/min-channel averaging), so the
// SAME perceptual lightness lands anywhere from ~28 to ~68 on the 0–100 HSL scale depending on hue —
// oklch's L is the whole point of that color space: perceptually uniform across hues.
function oklchL(str) {
  const m = /oklch\(\s*([\d.]+)/.exec(str || "");
  return m ? parseFloat(m[1]) : null;
}

// ── preset → DesignLanguage slice ────────────────────────────────────────────────────────────────
// derive surface/density HINTS from the preset's own description — used only as a fallback for the
// two qualities the source doesn't encode as a literal token (surface treatment, density band).
// Shadow, motion and border/ring width now come from the preset's OWN authored values (below), not
// a guess — the previous version guessed all four from prose and silently ignored the real numbers.
function hints(desc = "") {
  const d = desc.toLowerCase();
  return {
    surface: d.includes("glass") ? "glass" : d.includes("floating") ? "elevated" : d.includes("flat") ? "flat" : "solid",
    density: /breathable|airy|spacious/.test(d) ? "airy" : /dense|compact|tight/.test(d) ? "compact" : "comfortable",
  };
}

// `default` is the one preset without the extended token set (spot-checked 2026-07-30 — it predates
// the shadow/spacing/type-scale/motion/mono fields other presets carry). Fall back to values that
// match this module's PRE-fix behaviour so it doesn't regress relative to before this change.
const EXT_FALLBACK = {
  "shadow-2xs": "0 1px 2px 0px rgb(0 0 0 / 0.05)", "shadow-xs": "0 1px 2px 0px rgb(0 0 0 / 0.05)",
  "shadow-sm": "0 1px 2px 0px rgb(0 0 0 / 0.04), 0 10px 26px -18px rgb(0 0 0 / 0.14)",
  "shadow-md": "0 2px 5px 0px rgb(0 0 0 / 0.06), 0 16px 32px -16px rgb(0 0 0 / 0.16)",
  "shadow-lg": "0 8px 24px -12px rgb(0 0 0 / 0.18)", "shadow-xl": "0 16px 40px -16px rgb(0 0 0 / 0.2)",
  "shadow-2xl": "0 24px 56px -20px rgb(0 0 0 / 0.24)",
  "border-width-medium": "1px", "ring-width": "2px", spacing: "0.25rem",
  "text-xs": "0.75rem", "text-sm": "0.875rem", "text-base": "1rem", "text-lg": "1.125rem",
  "text-xl": "1.25rem", "text-2xl": "1.5rem", "text-display": "2.5rem", "text-kpi": "1.75rem",
  "font-weight-normal": "400", "font-weight-medium": "500", "font-weight-semibold": "600",
  "font-weight-bold": "700", "font-weight-black": "800",
  "tracking-tighter": "-0.03em", "tracking-tight": "-0.015em", "tracking-normal": "0em",
  "tracking-wide": "0.02em", "tracking-wider": "0.04em", "tracking-widest": "0.08em",
  "leading-tight": "1.25", "leading-snug": "1.375", "leading-normal": "1.5",
  "leading-relaxed": "1.625", "leading-loose": "2",
  "default-transition-duration": "150ms", "default-transition-timing-function": "ease", "transition-duration-move": "200ms",
  "font-mono-var": '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
};

export function toDesignLanguage(preset, { hueShift = 0, density, archetype, sidebarTone, appId, appName, language, domain } = {}) {
  // NEW schema (2026-07-30): preset.light / preset.dark are full self-contained palettes (colors +
  // shadow-* + spacing + text-* + font-weight-* + tracking-* + leading-* + transition-* + font-mono-var).
  // OLD schema (preset.colors, flat with "dark-" prefixed keys) is no longer produced by loadLanguages(),
  // but tolerate it here in case a caller passes a hand-built preset object.
  const L = preset.light || preset.colors || {};
  const D = preset.dark || {};
  const g = (k, fb) => (L[k] !== undefined ? L[k] : fb !== undefined ? fb : EXT_FALLBACK[k]);
  const o = (k) => oklchToHslParts(L[k]);
  const bg = o("background"), ink = o("foreground-ink"), surface = o("surface"), muted = o("muted");
  let primary = o("primary");
  if (hueShift) primary = shiftHue(primary, hueShift);
  // legibility guard, gated on the SOURCE's oklch L (not the HSL-converted `primary.l` — see oklchL
  // above). Every anchor in this catalog is coordinate-derived at oklch L≈0.56–0.623 specifically so
  // white text always works, by design — a THRESHOLD ON HSL LIGHTNESS broke that invariant for exactly
  // the hues where HSL's hue-dependent lightness reads highest (civic/console/enterprise/sentinel all
  // measured HSL L 59–68 off the identical oklch L=0.623 every other anchor also uses — user-reported,
  // 2026-07-30). 0.8 sits comfortably above the whole catalog's ceiling; this is a safety net for a
  // hypothetical future pale anchor, not a rule this catalog is expected to ever trip.
  const srcL = oklchL(L.primary);
  const darkFg = `${primary.h} 30% 12%`, whiteFg = T(o("foreground-inverse") || { h: 0, s: 0, l: 100 });
  // paleAnchor is the ORIGINAL proxy ("is primary pale enough that white text structurally fails")
  // — kept separate from primaryFg below on purpose. It still selects which FORMULA FAMILY the
  // sidebar-muted/-border/-accent deltas further down use (each tuned as a matched set for "normal
  // anchor, light-leaning UI" vs "pale anchor, dark-leaning UI"); primaryFg is the actual ink this
  // one pairing (primary vs its own text) ends up rendered with. The two used to be the same
  // boolean — fine as long as nothing ever needed dark text for a reason OTHER than being pale, per
  // the incident below.
  const paleAnchor = srcL !== null && srcL > 0.8;
  let primaryFg = paleAnchor ? darkFg : whiteFg;
  // 2026-08-13: the proxy above is sound while every anchor is coordinate-derived at L≈0.56–0.623
  // specifically so white always wins, per the comment above. Beacon's primary is Foundations' own
  // sourced orange, not derived that way — it clears the proxy (L≈0.69 < 0.8) but still measures
  // 2.95:1 with white, under the 3:1 UI floor this file holds every anchor to. Decide the ACTUAL
  // ink from measured contrast when the two disagree, same as the proxy itself exists to fix one
  // level up (HSL-lightness reading wrong for hues where it diverges from oklch).
  // NOT tied to `paleAnchor` (see above): the first version of this fix flipped `fgIsLight` off of
  // this corrected value, which re-derived sidebar-accent through the "pale anchor" formula family
  // for a normal-vividness orange and measured 1.85:1 chip-text contrast — worse than doing nothing.
  // A pairing needing the other ink for contrast reasons doesn't mean the whole anchor is pale.
  if (contrast(T(primary), primaryFg) < 3.0) {
    const alt = primaryFg === darkFg ? whiteFg : darkFg;
    if (contrast(T(primary), alt) >= 3.0) primaryFg = alt;
  }
  const mutedFg = { h: ink.h, s: Math.round(ink.s * 0.7), l: Math.round(ink.l + 0.3 * (surface.l - ink.l)) };
  const border = { h: bg.h, s: Math.min(bg.s, 15), l: Math.max(78, Math.min(92, bg.l - 7)) };
  // Resolved once: both the gradient decision and the shell block need it, and computing it
  // twice is how the two silently disagree.
  const shellArchetype = archetype || DEFAULT_ARCHETYPE[preset.id] || "rail-left";
  const darkBg = D.background ? oklchToHslParts(D.background) : null;
  const h = hints(preset.description);

  // 8-hue chart/category ramp — pass through verbatim (as HSL) rather than deriving from primary;
  // NOT hue-shifted — the ramp's whole point is a fixed, mutually-distinguishable spread across the
  // wheel, so rotating it with the accent would undo that spread.
  const chart = {}, category = {};
  for (let i = 1; i <= 8; i++) {
    const c = o(`chart-${i}`), cat = o(`category-${i}`);
    if (c) chart[i] = T(c);
    if (cat) category[i] = T(cat);
  }

  // real weight numbers → the Google-Fonts query + Tailwind fontWeight scale (replaces the old
  // hardcoded [500,600,700]/[400,500,600,700] guess with the theme's OWN authored weights).
  const weightNums = {
    normal: parseInt(g("font-weight-normal"), 10) || 400, medium: parseInt(g("font-weight-medium"), 10) || 500,
    semibold: parseInt(g("font-weight-semibold"), 10) || 600, bold: parseInt(g("font-weight-bold"), 10) || 700,
    black: parseInt(g("font-weight-black"), 10) || 800,
  };
  const weightList = [...new Set(Object.values(weightNums))].sort((a, b) => a - b);

  // sidebar tone — ORTHOGONAL to shell.archetype (container shape); any archetype's aside reads these
  // same tokens. "light" (default, unchanged): white/surface rail, dark ink text — zero regression for
  // every existing caller. "brand": the rail itself is primary-colored (e.g. Enterprise's blue) with
  // primaryFg text, which is what "blue bg, white foreground" means for an anchor whose primary already
  // reads as blue. "dark": a neutral-dark rail with white text — the look `rail-dark`'s shell markup used
  // to hardcode via a raw --sidebar-dark inline style; now derivable for ANY archetype, not just that one.
  // An explicit sidebarTone always wins; otherwise fall back to the anchor's own default (DEFAULT_SIDEBAR_TONE),
  // then "light". fgIsLight tracks the ORIGINAL pale/normal proxy (`!paleAnchor`, not primaryFg's
  // possibly-contrast-corrected value — see the note above), so the muted/border/accent sub-tokens
  // stay tuned as the matched family they were built as, regardless of which specific ink one
  // pairing elsewhere ended up needing.
  // rail-dark COUPLES to a dark tone by default: the archetype's whole point is a dark rail, and an
  // uncoupled default left the slice self-contradictory — {archetype:"rail-dark", sidebarTone:"light"}
  // shipped (a real build, 2026-08-16): the palette carried a WHITE sidebar set nothing used while the
  // shell template hardcoded its own black. An explicit --sidebar-tone still wins, as everywhere.
  const requestedTone = sidebarTone || DEFAULT_SIDEBAR_TONE[preset.id] || (shellArchetype === "rail-dark" ? "dark" : "light");
  const tone = requestedTone === "brand" || requestedTone === "dark" ? requestedTone : "light";
  const fgIsLight = !paleAnchor;
  // Deltas below are tuned (not guessed) against a WCAG relative-luminance contrast check run across
  // all 21 anchors' actual primary hues — HSL's hue-dependent luminance means a fixed lightness offset
  // that reads fine on one hue can be muddy or invisible on another, so these were picked as the
  // smallest deltas that clear real targets catalog-wide, not just for Enterprise's blue:
  //   sidebar-muted (secondary nav text) vs sidebar bg  → ≥ ~2.8:1 for all 21 (was 1.8–2.8 uncorrected)
  //   sidebar-accent (active-item chip) vs white text   → ≥ 5.3:1 for all 21 (was 1.9–3.3 uncorrected)
  // The accent chip goes DARKER than the rail (not lighter, as an earlier version had it) — for a white-
  // text chip that's the direction that improves BOTH the chip-vs-rail distinctness AND the label's own
  // legibility at once; lightening it does the opposite to the label. See fgIsLight:false below — the
  // dark-text (pale-anchor safety-net) branch mirrors the OLD, unverified direction: nothing in this
  // 21-anchor catalog trips it today (every anchor lands on white sidebar-foreground), so it's left
  // as-is rather than "fixed" without a real case to check it against.
  const sb = tone === "brand" ? {
    sidebar: T(primary), "sidebar-foreground": primaryFg,
    // 2026-08-13: the fgIsLight branch's lightness cap was 91 — tuned to clear ~2.8:1 across the
    // 21-anchor catalog, all of them mid-saturation primaries. Beacon's is Foundations' own primary
    // at full saturation (100%) — a vivid rail the cap wasn't tuned against — and measured 2.41:1,
    // under this file's own 2.5 floor: at L=91 the formula is already saturating the min() (primary
    // is 51% + 58 = 109, clamped to 91), so raising the delta does nothing; only raising the CAP
    // moves it. 96 clears the floor with the same ~0.2:1 margin the original tuning aimed for
    // elsewhere (measured 2.70:1 against Beacon's own orange) without washing the tint out to
    // nearly pure white the way the "comfort" line (98+) would.
    "sidebar-muted": fgIsLight
      ? T({ h: primary.h, s: Math.max(primary.s - 58, 10), l: Math.min(primary.l + 58, 96) })
      : T({ h: primary.h, s: Math.max(primary.s - 25, 10), l: Math.max(primary.l - 25, 8) }),
    "sidebar-border": T({ h: primary.h, s: primary.s, l: fgIsLight ? Math.min(primary.l + 10, 92) : Math.max(primary.l - 10, 6) }),
    // The dark-text branch needs a BIGGER step, not a smaller one. A −12 step was tuned when every
    // catalog primary was mid-tone and carried white; on a pale accent that carries dark ink (Lantern's
    // amber) it left the active chip 1.14:1 against its own rail — present in the DOM and invisible on
    // screen. A pale ground has more room beneath it, so take it.
    "sidebar-accent": T({ h: primary.h, s: Math.min(primary.s + 5, 100), l: fgIsLight ? Math.max(primary.l - 14, 8) : Math.max(primary.l - 26, 18) }),
  } : tone === "dark" ? {
    sidebar: darkBg ? T(darkBg) : T({ h: ink.h, s: Math.min(ink.s, 20), l: 14 }),
    "sidebar-foreground": "0 0% 100%",
    "sidebar-muted": `${ink.h} 10% 68%`, "sidebar-border": `${ink.h} 15% 26%`,
    "sidebar-accent": T(primary),
  } : {
    // A preset may AUTHOR its sidebar colors (checkpoint: putty #f1efeb + #e6e4de hairline, straight
    // from its source design) — honored here; the derived surface/border pair stays the default for
    // the 21 anchors that don't.
    sidebar: L.sidebar ? T(o("sidebar")) : T(surface), "sidebar-foreground": T(ink),
    "sidebar-muted": T(mutedFg),
    "sidebar-border": L["sidebar-border"] ? T(o("sidebar-border")) : T(border),
    "sidebar-accent": T(primary),
  };

  return {
    id: appId || preset.id, name: appName || preset.name,
    // `language` (below) is the canonical field and carries this same value. `anchorId`/`anchorName`
    // are the pre-merge names, kept ONLY so the runs written before the merge keep resolving — every
    // reader should prefer `language`. New readers must not add a dependency on these two.
    languageName: preset.name,
    anchorId: preset.id, anchorName: preset.name,
    palette: {
      background: T(bg), foreground: T(ink),
      card: T(surface), "card-foreground": T(ink),
      muted: T(muted), "muted-foreground": T(mutedFg),
      secondary: T(muted), "secondary-foreground": T(ink),
      accent: `${primary.h} ${Math.max(primary.s, 60)}% 95%`,
      "accent-foreground": `${primary.h} ${Math.min(Math.max(primary.s, 50), 80)}% ${Math.min(primary.l, 38)}%`,
      primary: T(primary), "primary-foreground": primaryFg,
      destructive: T(o("destructive")), "destructive-foreground": "0 0% 100%",
      success: T(o("success")), "success-foreground": "0 0% 100%",
      warning: T(o("warning")), "warning-foreground": `${o("warning").h} 40% 14%`,
      border: T(border), input: T(border), ring: T(primary),
      ...sb,
      sidebarDark: darkBg ? T(darkBg) : undefined,
      neutralHue: bg.h,
      chart, category,
    },
    type: {
      display: { family: preset.fonts?.heading || preset.typography?.heading?.fontFamily || "Inter", weights: weightList },
      body: { family: preset.fonts?.body || preset.typography?.body?.fontFamily || "Inter", weights: weightList },
      headWeight: weightNums.semibold,
      tracking: g("tracking-normal"),
      weights: weightNums,
      scale: {
        xs: g("text-xs"), sm: g("text-sm"), base: g("text-base"), lg: g("text-lg"),
        xl: g("text-xl"), "2xl": g("text-2xl"), display: g("text-display"), kpi: g("text-kpi"),
      },
      trackingScale: {
        tighter: g("tracking-tighter"), tight: g("tracking-tight"), normal: g("tracking-normal"),
        wide: g("tracking-wide"), wider: g("tracking-wider"), widest: g("tracking-widest"),
      },
      leadingScale: {
        tight: g("leading-tight"), snug: g("leading-snug"), normal: g("leading-normal"),
        relaxed: g("leading-relaxed"), loose: g("leading-loose"),
      },
      mono: g("font-mono-var"),
    },
    shape: {
      // preset.radius is the registry's single authored value (rem already) — the rung the
      // ThemeProvider maps to `--radius-lg`. The previous version read `rounded.md` (a smaller,
      // WRONG rung) off the old .md mirror; that field no longer exists on this schema.
      radius: preset.radius || "0.75rem",
      surface: h.surface,
      borderWidth: g("border-width-medium"),
      ringWidth: g("ring-width"),
      shadowScale: {
        "2xs": g("shadow-2xs"), xs: g("shadow-xs"), sm: g("shadow-sm"), md: g("shadow-md"),
        lg: g("shadow-lg"), xl: g("shadow-xl"), "2xl": g("shadow-2xl"),
      },
    },
    // GRADIENT tokens — new with the `checkpoint` anchor (2026-08-07). A preset may carry a
    // `gradients` map ({light:{hero,brand,success,review,danger,warning}, dark:{…}}) for looks the
    // flat token schema cannot express: a pastel hero wash, gradient status tints, a brand-mark
    // gradient. Passed through verbatim (light mode — the design slice is light-first, like the
    // palette above); design-language.mjs emits them as --grad-* CSS vars and paints the shell
    // header with --grad-hero when present. Anchors without the key are completely unaffected.
    // …and when the anchor has none but the caller asked for `hero-band`, they are SYNTHESISED from
    // this anchor's own primary and ground (see synthGradients). Gated on the archetype so no
    // existing rail-left app changes: `header.sticky` paints with --grad-hero unconditionally, so
    // minting the token for everyone would re-skin every sticky header in the fleet.
    ...(preset.gradients?.light
      ? { gradients: preset.gradients.light }
      : shellArchetype === "hero-band"
        ? { gradients: synthGradients(primary, bg) }
        : {}),
    spacingUnit: g("spacing"),
    motionTiming: {
      duration: g("default-transition-duration"), easing: g("default-transition-timing-function"),
      moveDuration: g("transition-duration-move"),
    },
    density: density || h.density,
    shell: { archetype: shellArchetype, sidebarTone: tone },
    // The value actually applied to `primary` above, not just the CLI input — persisted so a later
    // reader (design-verify.mjs, or a human) can check the never-repeat-this-pair rule against what
    // really happened, not what was asked for. Previously computed then thrown away, which is why
    // that rule was unauditable even when someone wanted to honor it.
    hueShift,
    icons: "line",
    // Which design language this app ADOPTS — always "beacon" now (see the retirement note at the
    // top of the file). The anchor supplies the identity (accent, chart ramp, corner); the language
    // supplies the ground and the grammar, which is where the other ~130 contract tokens live.
    // Still routed through theme-from-design.mjs's `pickLanguage` rather than hardcoded here, so
    // this file and that one cannot disagree if a language is ever added back. `language`/`domain`
    // above are accepted params from before this retirement — harmless to keep taking, since they
    // no longer change the answer.
    language: pickLanguage({ language, anchorId: preset.id, shape: { surface: h.surface }, domain }),
  };
}

// ── validate — the mechanical form of reference/THEME-AUTHORING.md ───────────────────────────────
// Generated themes get a pass/fail instead of trusting the generator: key-set completeness, oklch
// format, the primary-lightness guard, the brand-tone contrast floors (the same audit that caught
// the first sidebarTone formulas failing on 19 of 21 anchors), and gradient shape.
const COLOR_KEYS = [
  "background", "foreground-ink", "foreground-inverse", "static-light", "static-dark", "surface",
  "primary", "muted", "accent", "destructive", "success", "warning", "info", "ring",
];
// 2026-08-13: chart/category used to be REQUIRED at exactly 8 here. Foundations' own ramp is
// deliberately 6 ("the ramp introduces no colour" — every step reuses a value the palette already
// names, see tokens.css's own DataCharts note), and design-language.mjs already reads chart-N
// per-index as optional (`if (c) chart[i] = …`) — forcing exactly 8 in THIS check was stricter
// than every actual consumer, and would fail Beacon for a width Foundations chose on purpose.
// CHART_MIN is the real floor: below it there aren't enough mutually-distinguishable hues to be a
// usable ramp at all, which IS a gap worth failing on.
const CHART_KEYS = Array.from({ length: 8 }, (_, i) => [`chart-${i + 1}`, `category-${i + 1}`]).flat();
const CHART_MIN = 6;
const EXT_KEYS = Object.keys(EXT_FALLBACK);
const GRAD_KEYS = ["hero", "brand", "success", "review", "danger", "warning"];

// WCAG relative-luminance contrast on "H S% L%" triplets (the audit's math, in-process).
function tripletLum(t) {
  let [h, s, l] = String(t).split(/\s+/).map((x) => parseFloat(x));
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const seg = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const lin = (v) => { v += m; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(seg[0]) + 0.7152 * lin(seg[1]) + 0.0722 * lin(seg[2]);
}
const contrast = (a, b) => { const [x, y] = [tripletLum(a), tripletLum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export function validateLanguage(preset) {
  const errs = [], warns = [];
  if (!preset.id || !/^[a-z][a-z0-9-]*$/.test(preset.id)) errs.push("id: missing or not a lowercase slug");
  if (!preset.name) errs.push("name: missing");
  if (!preset.description || preset.description.length < 60) errs.push("description: missing/too short — pick() scores against it");
  else if (!/[.!]\s*$/.test(preset.description.trim()) || preset.description.split(".").length < 2)
    warns.push("description: should END with a domain-fit sentence (drives pick() 3× tail weighting)");
  if (!preset.category) warns.push("category: missing");
  // px OR rem. This demanded rem back when `radius` was authored by hand in ui-themes.json; since
  // 2026-08-10 it is DERIVED from tokens.css, which is px-native ("--radius: 14px"), so the rule was
  // failing all three shipped languages for using the source of truth's own unit. It is consumed as
  // `calc(var(--radius) - Npx)` (theme-from-design.mjs), which is unit-agnostic. What still matters is
  // that it is ONE length, not a four-corner shorthand — a shorthand silently breaks that calc.
  if (!/^[\d.]+(rem|px|em)$/.test(preset.radius || "")) errs.push(`radius: "${preset.radius}" — must be a single length (px/rem/em), not a shorthand`);
  // THE NESTED RUNG NEVER EXCEEDS THE BASE. A nested surface sits INSIDE a card, so a nested corner
  // rounder than the card containing it is a defect, not a style. Only comparable when both rungs
  // resolve to a plain px length: a language that states no second rung inherits Beacon's
  // `var(--radius, 14px)`, which tracks whatever --radius becomes and cannot invert.
  //
  // This exists because the class of mistake already happened and nothing caught it: the generator
  // read Signal's `radius.min: 16` — the ONLY radius its document names — as the nested rung, so the
  // block emitted `--radius-nested: 16px` over an inherited `--radius: 14px`. Every check in the
  // pipeline passed. The rule is cheap and it is permanent; the specific bug was one line.
  {
    const px = (v) => { const m = /^([\d.]+)px$/.exec(String(v ?? "").trim()); return m ? +m[1] : null; };
    const base = px(preset.radius), nested = px(preset.radiusNested);
    if (base !== null && nested !== null && nested > base)
      errs.push(`radius-nested: ${nested}px is ROUNDER than radius ${base}px — a nested surface sits inside a card, so its corner cannot exceed the card's`);
  }
  if (!preset.fonts?.heading || !preset.fonts?.body) errs.push("fonts: heading and body required");

  for (const mode of ["light", "dark"]) {
    const M = preset[mode];
    if (!M || typeof M !== "object") { errs.push(`${mode}: block missing`); continue; }
    for (const k of COLOR_KEYS) {
      if (M[k] === undefined) { errs.push(`${mode}.${k}: missing`); continue; }
      if (!/^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\)$/.test(M[k])) errs.push(`${mode}.${k}: not "oklch(L C H)" — got "${String(M[k]).slice(0, 40)}"`);
    }
    // Chart/category — format-check whichever steps are declared; only WARN below CHART_MIN
    // rather than hard-requiring all 8, so a deliberately narrower ramp isn't a validation failure.
    {
      const present = new Set();
      for (const k of CHART_KEYS) {
        if (M[k] === undefined) continue;
        if (!/^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\)$/.test(M[k])) { errs.push(`${mode}.${k}: not "oklch(L C H)" — got "${String(M[k]).slice(0, 40)}"`); continue; }
        const m = /^chart-(\d)$/.exec(k);
        if (m) present.add(+m[1]);
      }
      if (present.size < CHART_MIN) errs.push(`${mode}: only ${present.size} chart/category step(s) declared — need at least ${CHART_MIN}`);
      else if (present.size < 8) warns.push(`${mode}: ${present.size}/8 chart/category steps declared — narrower than the old default ramp, on purpose per Foundations, not a gap`);
    }
    for (const k of ["sidebar", "sidebar-border"]) // optional authored pair — both or neither
      if ((M.sidebar === undefined) !== (M["sidebar-border"] === undefined)) { warns.push(`${mode}: authored sidebar needs BOTH sidebar and sidebar-border`); break; }
    const missingExt = EXT_KEYS.filter((k) => M[k] === undefined);
    if (missingExt.length) warns.push(`${mode}: ${missingExt.length} extended token(s) missing (EXT_FALLBACK covers, but the theme loses its own personality): ${missingExt.slice(0, 5).join(", ")}${missingExt.length > 5 ? "…" : ""}`);
    const pL = oklchL(M.primary);
    if (pL !== null) {
      // The CEILING is a real defect: at L ≥ 0.8 the converter flips primary-foreground to dark ink,
      // so a pale primary silently changes what every button label is made of.
      // A WARNING, not an error — because the "guard" it names is a correct behaviour, not a failure.
      // At L ≥ 0.8 the converter flips primary-foreground to dark ink, and for a language built on a
      // pale accent that is exactly right: Lantern's amber measures 1.9:1 against white and 11.6:1
      // against its near-black, and its own document says so in as many words. Erroring here would
      // have banned a language for the thing that makes it work. The measured primary/foreground
      // contrast below is the real gate; this line only says the flip happened.
      if (pL >= 0.8) warns.push(`${mode}.primary: oklch L ${pL} ≥ 0.8 — primary-foreground flips to dark ink (intended for a pale accent; verify the pair reads)`);
      // The FLOOR is only a proxy, and it was contradicting the measurement made 30 lines below it:
      // Nimbus sits at L 0.4346 and its primary/foreground pair measures 8.18:1, nearly triple the
      // error floor — because a DARKER primary carries white text better, not worse. Warning there
      // taught authors that a passing language "fails". Too-pale is the only direction the floor was
      // ever really guarding, and the ceiling above already owns that. Keep the band as guidance for
      // an unusually pale primary that still clears the guard, and stay quiet about dark ones.
      else if (mode === "light" && pL > 0.72) warns.push(`${mode}.primary: oklch L ${pL} above the catalog band (ideal 0.53–0.63) — pale primaries weaken every label on a filled control`);
    }
    const wL = oklchL(M.warning);
    if (wL !== null && wL > 0.85) warns.push(`${mode}.warning: oklch L ${wL} — pale ambers defeat both light and dark foregrounds`);
    // chart ramp spread: eight hues should not collapse onto one
    const hues = Array.from({ length: 8 }, (_, i) => { const m = /oklch\([\d.]+\s+[\d.]+\s+([\d.]+)\)/.exec(M[`chart-${i + 1}`] || ""); return m ? parseFloat(m[1]) : null; }).filter((h) => h !== null);
    if (hues.length === 8 && new Set(hues.map((h) => Math.round(h / 30))).size < 4)
      warns.push(`${mode}: chart-1…8 span < 4 distinct 30° hue bands — the ramp exists to be mutually distinguishable`);
  }

  if (preset.gradients) {
    for (const mode of ["light", "dark"]) {
      const G = preset.gradients[mode];
      if (!G) { errs.push(`gradients.${mode}: missing — both modes required when gradients is present`); continue; }
      for (const k of Object.keys(G)) {
        if (!GRAD_KEYS.includes(k)) errs.push(`gradients.${mode}.${k}: unknown key (allowed: ${GRAD_KEYS.join(", ")})`);
        else if (!/gradient\(/.test(G[k])) errs.push(`gradients.${mode}.${k}: not a CSS gradient`);
      }
      if (!G.hero) warns.push(`gradients.${mode}.hero: missing — the header wash is the point of the system`);
    }
  }

  // derived-palette contrast floors — the failures that shipped once and were caught by screenshot
  try {
    for (const tone of ["light", "brand", "dark"]) {
      const dl = toDesignLanguage(preset, { sidebarTone: tone, appId: "t", appName: "T" });
      const p = dl.palette;
      // Floors calibrated against the 21 vetted upstream presets: button/chip labels are semibold
      // 13px+, where WCAG's UI-component standard is 3:1 — the catalog sits at 3.3–3.9 by design,
      // so 3.0 is the ERROR floor and 4.5 (AAA-ish body-text comfort) only warns. A 4.5 error floor
      // was tried first and failed 20 of 22 known-good anchors — a validator that flunks the vetted
      // catalog teaches authors to ignore it.
      const checks = [
        [`primary text (tone=${tone})`, contrast(p.primary, p["primary-foreground"]), 3.0, 4.5],
        [`sidebar-muted on rail (tone=${tone})`, contrast(p.sidebar, p["sidebar-muted"]), 2.5, 2.8],
      ];
      if (tone === "brand") checks.push(
        ["brand chip text", contrast(p["sidebar-accent"], p["primary-foreground"]), 3.0, 4.5],
        ["brand chip vs rail", contrast(p.sidebar, p["sidebar-accent"]), 1.3, 1.3]);
      for (const [what, got, floor, comfort] of checks) {
        if (got < floor) errs.push(`contrast: ${what} = ${got.toFixed(2)} (floor ${floor})`);
        else if (got < comfort && tone === "light") warns.push(`contrast: ${what} = ${got.toFixed(2)} (below comfort ${comfort})`);
      }
    }
  } catch (e) { errs.push(`derive: toDesignLanguage threw — ${e.message}`); }

  return { errs, warns };
}

// ── never-repeat-this-pair check (kf-design-director.md's own hard rule, made checkable) ─────────
// Best-effort and NON-BLOCKING: two apps genuinely can deserve the same archetype+hueShift, so this
// warns rather than fails. Scans runs/*/prototype/experience-spec.json for another app already
// wearing the same (hueShift, shell.archetype) pair; skipped silently if runs/ or a spec can't be
// read (dangling `runs/current` symlink, a run mid-write, etc.) — a best-effort nudge is not worth a
// crash for the CLI's main job of printing a slice.
function warnIfRepeatedLook(slice, appId) {
  const runsDir = join(process.cwd(), "runs");
  if (!existsSync(runsDir)) return;
  let entries;
  try { entries = readdirSync(runsDir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    if (appId && e.name === appId) continue; // don't compare a run against itself when re-run in place
    const specPath = join(runsDir, e.name, "prototype", "experience-spec.json");
    if (!existsSync(specPath)) continue;
    let other;
    try { other = JSON.parse(readFileSync(specPath, "utf8")); } catch { continue; }
    const d = other && other.design;
    if (!d || !d.shell) continue;
    if (d.shell.archetype === slice.shell.archetype && (d.hueShift || 0) === (slice.hueShift || 0)) {
      console.error(
        `⚠ language-catalog.mjs design: this (archetype="${slice.shell.archetype}", hueShift=${slice.hueShift}) ` +
        `pair matches "${d.name || e.name}" (${e.name}) — kf-design-director.md says vary at least one. ` +
        `Not blocking; override --archetype or --hue-shift if that overlap wasn't intended.`
      );
      return; // one example is enough to act on
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const [cmd, arg, ...rest] = process.argv.slice(2);
  const flag = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
  if (cmd === "list") {
    for (const p of loadLanguages()) console.log(`${p.id.padEnd(11)} ${p.description}`);
  } else if (cmd === "design") {
    const p = loadLanguages().find((x) => x.id === arg);
    if (!p) { console.error(`unknown language "${arg}" — run \`language-catalog.mjs list\``); process.exit(1); }
    const rationale = (flag("--rationale", "") || "").trim();
    if (!rationale) {
      console.error(
        `language-catalog.mjs design: --rationale is required.\n\n` +
        `  Ground the accent in the app's domain and say why in one line, e.g.:\n` +
        `    --rationale "Compliance-heavy register; a restrained blue reads as trustworthy, not playful."\n\n` +
        `  This was made mandatory 2026-08-13 — about half of real runs were shipping with no rationale\n` +
        `  and unmodified defaults (rail-left, light sidebar, zero hue-shift), which kf-design-director.md's\n` +
        `  own rule says never to repeat across apps. See the note at the top of this file.`
      );
      process.exit(1);
    }
    const hueShift = parseFloat(flag("--hue-shift", "0")) || 0;
    const archetype = flag("--archetype");
    const slice = toDesignLanguage(p, {
      hueShift,
      density: flag("--density"), archetype, sidebarTone: flag("--sidebar-tone"),
      appId: flag("--app-id"), appName: flag("--app-name"),
    });
    slice.rationale = rationale;
    warnIfRepeatedLook(slice, flag("--app-id"));
    // --record <runDir>: the layout and identity are DECISIONS, and a decision that is not in
    // decisions.md is indistinguishable from an oversight at sign-off. A full real build shipped
    // with eleven recorded decisions and not one about the nav position or palette — the archetype
    // was an orchestrator's CLI flag, flipped twice in one session, invisible to the customer both
    // times (2026-08-16). Appends the choice as the next D<n> so it rides the same review page as
    // every other decision.
    const recordDir = flag("--record");
    if (recordDir) {
      const { readFileSync: rf, writeFileSync: wf, existsSync: ex } = await import("node:fs");
      const dPath = `${recordDir.replace(/\/$/, "")}/decisions.md`;
      const cur = ex(dPath) ? rf(dPath, "utf8") : "# Decisions\n";
      const next = Math.max(0, ...[...cur.matchAll(/^#{2,3}\s*D(\d+)/gim)].map((m) => parseInt(m[1], 10))) + 1;
      const sh = slice.shell || {};
      const others = ["rail-left", "rail-dark", "top-bar", "rail-right"].filter((a) => a !== sh.archetype).join(" / ");
      const entry = `\n## D${next} · Design language & layout — ${sh.archetype}, ${sh.sidebarTone} rail, hue-shift ${hueShift} (kf-design-director)\n\n` +
        `**Why** ${rationale}\n\n` +
        `**Alternatives** ${others} — not chosen for this domain, per the rationale above. ` +
        `Beacon is the only design language (the ten others were retired 2026-08-12); the app's own layer is the accent, ramp, corner and this layout choice.\n\n` +
        `**Status:** decided\n`;
      wf(dPath, cur + entry);
      console.error(`recorded as D${next} in ${dPath}`);
    }
    // stdout stays pure JSON — callers pipe it into the spec.
    console.log(JSON.stringify(slice, null, 2));
  } else if (cmd === "validate") {
    const targets = arg === "--all" || !arg ? loadLanguages() : loadLanguages().filter((x) => x.id === arg);
    if (!targets.length) { console.error(`unknown anchor "${arg}"`); process.exit(1); }
    let failed = 0;
    for (const p of targets) {
      const { errs, warns } = validateLanguage(p);
      const verdict = errs.length ? "FAIL" : warns.length ? "PASS (warnings)" : "PASS";
      console.log(`${p.id.padEnd(12)} ${verdict}`);
      for (const e of errs) console.log(`  ✗ ${e}`);
      for (const w of warns) console.log(`  ⚠ ${w}`);
      if (errs.length) failed++;
    }
    if (targets.length > 1) console.log(`\n${targets.length - failed}/${targets.length} pass`);
    process.exit(failed ? 1 : 0);
  } else {
    console.error("usage: language-catalog.mjs list | design <id> --rationale \"<why>\" [--hue-shift N] [--density d] [--archetype a] [--sidebar-tone light|brand|dark] [--app-id s] [--app-name n] | validate <id>|--all");
    process.exit(2);
  }
}
