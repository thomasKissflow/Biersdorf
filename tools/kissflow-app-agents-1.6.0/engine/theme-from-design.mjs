// theme-from-design.mjs — give the runtime app its identity by layering the app's own accent on top
// of Beacon, the one design language in the token contract.
//
//   node theme-from-design.mjs <experience-spec.json> --out src/app-identity.css [--html index.html]
//
// ── WHAT CHANGED, AND WHY ────────────────────────────────────────────────────────────────────────
// This file used to lift `emitHead()`'s token block out of design-language.mjs and drop it into the
// app as a `:root` override. That was right when the app had no token contract of its own. It no
// longer is. `starter/src/tokens.css` is a per-token-provenance contract, and it is what every
// component in the kit reads.
//
// RETIREMENT HISTORY. Between 2026-07-30 and 2026-08-12 this contract carried, in turn, one hand-
// authored language, then three (Beacon/Nimbus/Checkpoint), then eleven (Nimbus retired, nine
// generated languages added), and finally — later on 2026-08-12 — one again: Beacon alone, all ten
// non-Beacon blocks retired the same day, and with them the multi-language selection machinery this
// file used to own (`LANGUAGE_FIT` domain scoring, the `--language` CLI flag as a real choice,
// `LEGACY_SURFACE_LANGUAGE`'s three-way table). None of it was archived in-repo — recoverable from
// git history only. What's below is what survives: an app still has its own accent to layer, that
// was never a language-selection concern.
//
// Measured against the contract when it carried three languages, the old output was emitting 25 of
// its 154 tokens and 0 of its 17 tone values, while the non-default languages' ~145 each were
// unreachable because nothing in the pipeline ever set `data-theme`. So a generated app wore anchor-
// derived colours splashed over Beacon's grammar: Beacon's chip anatomy, Beacon's elevation, Beacon's
// control ranks, Beacon's tones — whatever its prototype had been designed as.
//
// ── THE DIVISION OF LABOUR ───────────────────────────────────────────────────────────────────────
// LANGUAGE owns the ground and the grammar: background, card, border, muted, the tone map, the
// elevation ladder, control/chip/field/row/tab geometry, the type pairing. All 154 tokens arrive
// by construction because the app already ships tokens.css — this file does not re-transcribe a
// single one of them. (Same principle as proto-kit's sync-tokens.mjs: consume the contract, never
// copy it.)
//
// APP owns its accent and its corner: primary and its hover/foreground, the brand accent, the
// accent pair, the focus ring, the 8-hue chart ramp, and the radius. That is enough for two apps
// on the same language to be told apart at a glance, and little enough that no language's
// separation grammar — Checkpoint's lift, Signal's hairline, Sorrel's ground step — can be broken
// by it.
//
// Notably NOT overridden: background / card / border / muted, and the fonts. Several languages
// express their ground or their plates in a form an HSL triplet cannot carry (a gradient through a
// whole-value twin, an rgba plate colour, a tinted shadow), so substituting one turns the treatment
// off rather than re-tinting it. The type pairing is the same argument in the other medium — a
// language's three faces ARE its voice, and index.html already preloads every face the languages
// call for, so keeping the language's own pairing also avoids a font request that can fail silently.
//
// ── WHAT IS NO LONGER EMITTED ────────────────────────────────────────────────────────────────────
// The four legacy `.kf-*` / `.nav-item` composition rules this file used to append are gone. Each
// was written for the pre-contract stack and is now either wrong or redundant:
//   · `.nav-item.active` read `hsl(var(--sidebar-accent))` — a token the contract does not define.
//     The background would drop as invalid and leave `--primary-foreground` (white) text on the
//     inactive ground. starter/src/index.css already owns nav selection.
//   · `.kf-pill` forced a solid fill with white text and hid the leading dot. kf-ui.css's own
//     `.kf-pill` is already tinted-with-a-dot, which is exactly StatusChip's anatomy in all three
//     languages — the override was the only thing making the two stacks disagree.
//   · `.kf-metric*` / `.kf-panel-sec` re-composed the legacy KPI and panel. The contract's
//     MetricCard and Card own that anatomy now, and emitting both gives one app two sources of
//     truth for the same component.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── ONE CONCEPT: THE DESIGN LANGUAGE ─────────────────────────────────────────────────────────────
// "Anchor" and "language" were two words for the same thing, and the code said so itself: the map
// that translated one into the other was `{beacon:"beacon", nimbus:"nimbus", checkpoint:"checkpoint"}`
// — an identity function — while a second hardcoded array here had to be kept in agreement with the
// catalog by hand, and the emitted slice carried the value twice (`anchorId` AND `language`). The 21
// personalities that once justified the distinction were retired on 2026-08-10; since then every
// catalog entry IS a language. So the identity map is gone, and the list is READ from the catalog
// rather than restated — adding a language is now an edit to tokens.css and the catalog, not to a
// third place that silently disagrees.
const CATALOG_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "reference", "ui-themes.json");
function catalogIds() {
  try {
    return JSON.parse(readFileSync(CATALOG_PATH, "utf8")).map((p) => p.id).filter(Boolean);
  } catch {
    // The catalog is the source of truth, but a language with no block in tokens.css renders as
    // Beacon anyway, so a missing/broken catalog must not take the whole emitter down.
    return ["beacon"];
  }
}
/** The design languages in the catalog. Read once — this file is loaded per build, not per request. */
export const LANGUAGES = catalogIds();

// RETIRED 2026-08-12, with the ten non-Beacon language blocks: `LEGACY_SURFACE_LANGUAGE` (a
// surface-treatment → language fallback table for pre-2026-08-10 runs) and `LANGUAGE_FIT` /
// `pickLanguageForDomain` (domain-word scoring across languages). Both existed to pick AMONG
// languages; with one language there is nothing left to pick. `languageDecision` below no longer
// has a lowering chain to fall through — every design resolves to "beacon", full stop. Recoverable
// from git history if a language is ever added back.

/**
 * The language, AND how it was decided. Down to two sources now that there is one language to land
 * on regardless of the input:
 *
 *   explicit   `design.language` (or the pre-merge alias `design.anchorId`) NAMES "beacon" — an
 *              identity, not really a choice, but kept distinct from `default` so a spec that
 *              deliberately says "beacon" reads differently from one that says nothing at all.
 *   default    nothing named it, or it named something that isn't "beacon".
 *
 * `rejected` carries a named value that isn't a language (a typo, or a pre-2026-08-12 spec naming
 * a retired one like `checkpoint` or `nimbus`) instead of dropping it silently.
 *
 * NOTE for callers: this is a pure function with call sites in design-language.mjs (emitHead, the
 * html emitter, identityTokens). Never print from in here — a notice would fire two or three times
 * per shell build. Report from the CLI layer, once.
 */
export function languageDecision(design = {}) {
  const named = String(design.language || design.anchorId || "").toLowerCase();
  if (LANGUAGES.includes(named)) return { language: named, source: "explicit", rejected: null };
  return { language: "beacon", source: "default", rejected: named || null };
}

/** The language alone, for the emitters that only need to know which block wins — always "beacon". */
export function pickLanguage(design = {}) {
  return languageDecision(design).language;
}

/**
 * One line describing the decision, for a CLI to print. Empty when nothing needs saying — which is
 * now the common case: a design that names nothing, or correctly names "beacon", says nothing.
 * Only a spec asking for a language that no longer exists gets a notice.
 */
export function languageNotice(design = {}) {
  const { rejected } = languageDecision(design);
  return rejected
    ? `⚠ "${rejected}" is not a design language — there is only "beacon" now. Ignored, rendering as beacon.`
    : "";
}

// ── nestedStep — DERIVED from the contract, not restated here ────────────────────────────────────
// How far a language steps a nested surface down from its own --radius, in px. An app that overrides
// --radius has to move the nested rung with it or the language's two rungs desynchronise.
//
// This used to be a hand-typed column in POLICY below, and it is exactly the duplication the
// anchor/language merge deleted everywhere else: the numbers are ALREADY in tokens.css (Beacon
// 14→14, Checkpoint 16→14, Iris 28→20, Hearth 24→12 …) and a second copy can only ever agree with
// them by luck. Adding a language is now an edit to tokens.css, full stop — there is no row to
// remember to add here, and no row to leave behind when one is retired.
//
// A step is only read off a plain `Npx` pair. A language that inherits Beacon's
// `--radius-nested: var(--radius, 14px)` has NO step by construction — its nested rung already
// tracks whatever --radius becomes, which is precisely what an override should do — so 0 is the
// right answer there and also the safe answer for anything unparseable.
const CONTRACT_PATH = join(dirname(fileURLToPath(import.meta.url)), "proto-kit", "tokens.css");
function nestedStepsFromContract() {
  const out = {};
  let css;
  try { css = readFileSync(CONTRACT_PATH, "utf8"); } catch { return out; }
  const px = (v) => { const m = /^([\d.]+)px$/.exec(String(v ?? "").trim()); return m ? +m[1] : null; };
  const blocks = [[":root {", "beacon"], ...[...css.matchAll(/:root\[data-theme=(["'])([a-z][a-z0-9-]*)\1\]\s*\{/g)].map((m) => [m[0], m[2]])];
  for (const [sel, id] of blocks) {
    const start = css.indexOf(sel);
    if (start < 0) continue;
    const body = css.slice(start + sel.length, css.indexOf("\n}", start + sel.length));
    const decl = (n) => (new RegExp(`--${n}\\s*:\\s*([^;]+);`).exec(body) || [])[1];
    const r = px(decl("radius")), n = px(decl("radius-nested"));
    out[id] = r !== null && n !== null && r > n ? Math.round((r - n) * 10) / 10 : 0;
  }
  return out;
}
/** Read once — this file is loaded per build, not per request. */
const NESTED_STEP = nestedStepsFromContract();

// FOCUS policy: which identity colour Beacon lets the app move its ring to.
//   ring       Beacon rings with its bright brand-accent.
//   ringAlpha  Beacon's own alpha for the `--ring-color` whole-value twin.
//
// One row now — kept as a table rather than inlined into identityTokens below because the retired
// languages each had their own row (Checkpoint rang with `primary` at a lower alpha; the nine
// generated ones each rang with their own near-black ink), and the shape is cheap to keep in case a
// language is ever added back. `POLICY[language] || POLICY.beacon` below always resolves to this
// row today, since `language` is always "beacon".
const POLICY = {
  beacon: { ring: "brand-accent", ringAlpha: 0.38 },
};

// ── HSL triplet helpers ──────────────────────────────────────────────────────────────────────────
// The contract consumes these as `hsl(var(--x))`, so a token that holds one must stay a bare
// triplet — wrapping it here would produce `hsl(hsl(...))`, an invalid value the browser drops
// silently. The whole-value twins (`--ring-color`) are the opposite and must carry their own
// function, which is why they are built as rgba() below rather than as a triplet plus an alpha.
const TRIPLET = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/;
const parseTriplet = (v) => {
  const m = TRIPLET.exec(String(v ?? ""));
  return m ? { h: +m[1], s: +m[2], l: +m[3] } : null;
};
const T = ({ h, s, l }) => `${round1(h)} ${round1(s)}% ${round1(l)}%`;
const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function hslToRgb({ h, s, l }) {
  const S = s / 100, L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = L - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}
const rgba = (hsl, a) => `rgba(${hslToRgb(hsl).join(", ")}, ${a})`;

/**
 * The app's identity, derived from the design slice in the contract's own vocabulary.
 *
 * Two values the design slice does not carry are derived rather than invented. Both rules were set
 * against the two hand-transcribed languages and RE-MEASURED across all eleven on 2026-08-12:
 *
 *   --primary-hover   primary darkened 8 lightness points. Of the seven languages that state a
 *                     press/deep colour, five sit in −6.8…−10.6 (Checkpoint −6.8, Beacon −7.1,
 *                     Signal −8.2, Cadence −9.8, Lantern −10.6) and two go further (Sorrel −12.0,
 *                     Iris −21.5, whose "deep" is a display ink rather than a hover). −8 stays the
 *                     rule: it is the middle of the cluster, and the outliers are documents naming
 *                     a different colour for a different job, not a wider hover convention.
 *   --brand-accent    the same hue at `max(L, 52)` — the bright mark colour, which in the contract
 *                     sits at or above the primary. Exact or near-exact wherever a language states
 *                     one (Checkpoint 59.2 vs 59.2, Beacon 52 vs 53.5, Trailhead/Hearth/Plush all
 *                     land above their primary as the rule predicts).
 */
/**
 * `wholeValueColors` picks the format for the COLOUR tokens, and it exists because the two artifacts
 * this function feeds bridge them differently:
 *
 *   prototype / starter   src/tokens.css   --color-primary: hsl(var(--primary))   → needs a TRIPLET
 *   generated custom UI   src/index.css    --color-primary: var(--primary)        → needs a COLOUR
 *
 * Emit the wrong one and the token resolves to nothing: `hsl(hsl(24 89% 35%))` is invalid, and so is
 * a bare `24 89% 35%` used as a colour. Default false keeps the prototype's contract, which is the
 * older caller (design-language.mjs); identityCss opts in for the custom UI it writes.
 *
 * This is the same reasoning the --chart-N loop below already applied — those are wrapped because the
 * contract consumes them whole. Everything the anchor sets is now consistent about which side it is
 * on, instead of chart being wrapped and primary/accent/ring silently not.
 *
 * Found live 2026-08-11 on a real build: the app deployed to Kissflow with bg-primary and bg-accent
 * computing to rgba(0,0,0,0) — every accent-coloured surface transparent — while bg-card, which only
 * themes.css sets, rendered correctly.
 */
export function identityTokens(design = {}, language = pickLanguage(design), { wholeValueColors = false } = {}) {
  const p = design.palette || {};
  // AN APP WHOSE ANCHOR IS ITS LANGUAGE HAS NO *COLOUR/RADIUS/CHART* IDENTITY TO LAYER. The language
  // already declares every token the block below writes — --primary, --brand-accent, the accent pair,
  // --ring, the chart ramp and --radius are all in its :root. Emitting them again can only do one of
  // two things: repeat the value, or differ from it. It differed. Measured on a real build whose slice
  // says anchorId "beacon" and language "beacon": 11 of its 12 comparable tokens were a ROUNDED COPY
  // of Beacon rather than Beacon — --primary 24 89% 35% against 23.9 88.8% 34.9%, --brand-accent at
  // 89% saturation against 95.8%, and --primary-foreground an off-white 180 0% 98% where the language
  // says pure white. Each is small; together they are an app that claims to be Beacon and measurably
  // is not, with no step in the pipeline able to notice because the identity block always wins by
  // specificity. Suppressing that block makes "anchor == language" mean what it says, by construction
  // rather than by copying numbers accurately.
  //
  // 2026-08-13 — this used to `return []` outright, which also discarded the sidebar-role loop and
  // the font block below. That was wrong: tokens.css never defines --color-sidebar* or --type-* for
  // ANY language (grep turns up nothing — confirmed while chasing a real language-default build
  // whose prototype rendered in the browser's fallback serif with an unstyled sidebar
  // rail). Unlike --primary/--chart-N/--radius, those two groups have no "the language already has
  // this" to be redundant with, so suppressing them wasn't preserving fidelity — it was just deleting
  // data every language-default app actually needs. `languageDefault` now gates only the block that
  // was actually measured to drift; the sidebar loop and the font block always run.
  // …but "anchor IS the language" only means "no identity" when the palette really is the
  // language's own. `--hue-shift` is the sanctioned way an app DIFFERS while staying anchored to
  // Beacon — a shifted slice carries a deliberately different primary, and suppressing the block
  // discards it: a real build chose hueShift 192 (a blue at hue 215) and every bg-primary rendered
  // Beacon's stock orange, silently, while the sidebar loop below (which always runs) showed the
  // blue — a two-tone app neither the director nor Beacon ever specified. The rounded-copy
  // drift above had hueShift 0; the gate now says exactly that.
  const languageDefault = Boolean(design.anchorId) && String(design.anchorId).toLowerCase() === String(language).toLowerCase()
    && !(Number(design.hueShift || 0) % 360);
  const policy = POLICY[language] || POLICY.beacon;
  const primary = parseTriplet(p.primary);
  const out = [];
  const put = (name, value, note) => value != null && out.push({ name, value, note });
  /** A colour token, in whichever of the two formats this caller's bridge consumes. */
  const C = (t) => (t == null ? null : wholeValueColors ? `hsl(${T(t)})` : T(t));
  // 2026-08-13 — Foundations' migration made `--color-*`/`--radius-*` DIRECT LITERALS in tokens.css
  // (no longer `var()` onto this bare layer — see its own "NO MORE BARE-NAME LAYER" note), so an
  // app's identity, written only to the bare names below, stopped reaching any Tailwind-generated
  // utility (bg-primary, text-primary-foreground, rounded-lg, ring-2, …) — every one of them kept
  // rendering Beacon's own defaults instead, silently (found live: an app's own accent chosen at
  // hueShift 126 rendered its logo mark, header rules and every rounded-lg/-xl corner in Beacon's
  // stock orange/radius regardless). CC always wraps in hsl(...) — a bare triplet is not a valid
  // standalone CSS colour — and is put ALONGSIDE the bare emission, never instead of it: some
  // consumers (proto-kit's own `--color-sidebar-accent: hsl(var(--primary))`) already read the bare
  // name directly through a `var()` and keep working either way.
  const CC = (t) => (t == null ? null : `hsl(${T(t)})`);

  // The block the rounded-copy drift was actually measured in — primary/accent/ring/chart/radius. Skipped
  // entirely when this app's anchor IS its language, per the note above.
  if (!languageDefault) {
    if (primary) {
      const hover = { ...primary, l: clamp(primary.l - 8, 6, 96) };
      const brand = { ...primary, l: clamp(Math.max(primary.l, 52), 6, 96) };
      const primaryFg = parseTriplet(p["primary-foreground"]);
      put("--primary", C(primary));
      put("--color-primary", CC(primary));
      put("--primary-hover", C(hover), "primary −8 lightness — the contract's own deltas are −7.1 / −9.4 / −6.8");
      put("--color-primary-hover", CC(hover));
      put("--primary-foreground", C(primaryFg));
      put("--color-primary-foreground", CC(primaryFg));
      put("--brand-accent", C(brand), "the bright mark colour: same hue at max(L, 52)");

      // Beacon's own soft pair (--color-primary-bg icon tiles, --color-primary-ink their glyphs)
      // rides the SAME hue as the primary, but nothing re-derived it on a hue-shift: a real build
      // shifted to a blue accent and every icon tile stayed stock peach while the buttons went blue.
      // The anchor builds this pair exactly like the accent pair (95%-lightness tint + legible ink),
      // so the shifted accent values ARE the shifted soft pair; fall back to deriving from the
      // primary's own hue when a slice carries no accent.
      const softBg = parseTriplet(p.accent) || { ...primary, s: 100, l: 95.5 };
      const softInk = parseTriplet(p["accent-foreground"]) || { ...primary, s: 80, l: 38 };
      put("--color-primary-bg", CC(softBg));
      put("--color-primary-ink", CC(softInk));

      // The contract's two gradient tokens are HEX literals of Beacon's orange
      // (--gradient-primary #FF7A22→#F25A00, --gradient-data #F25A00→#FF9A3C) and are what every
      // `style="background-image: var(--gradient-primary)"` button actually paints — after the
      // hue-shift fixes above, a real build's admin queue still showed stock-orange Approve buttons
      // over an otherwise blue app. Re-plot the contract's own stop lightnesses on this app's hue.
      const stop = (l) => `hsl(${primary.h} ${Math.max(primary.s, 90)}% ${l}%)`;
      put("--gradient-primary", `linear-gradient(180deg, ${stop(57)}, ${stop(47)})`, "Beacon's stops (57→47) on this app's hue");
      put("--gradient-data", `linear-gradient(90deg, ${stop(47)}, ${stop(62)})`);
      // …and the button's resting glow, the LAST anchor-owned colour that survived a hue-shift:
      // tokens.css declares --shadow-primary with Beacon's orange baked in as rgba, so every
      // shadow-primary button glowed stock orange under any identity. Same stops, this app's hue.
      // (COMPONENTS.md's hover/active glow recipes are color-mix(var(--color-primary)) since the
      // same fix — this token covers the resting state the utility class reads.)
      put("--shadow-primary", `0 8px 20px -8px hsl(${primary.h} ${Math.max(primary.s, 90)}% 51% / .7), inset 0 1px 0 rgba(255, 255, 255, .28)`, "the contract's own glow, re-plotted on this app's hue");

      // Focus. The whole-value twin carries the alpha, so it is built as rgba() — a triplet cannot.
      if (policy.ring) {
        const ringHsl = policy.ring === "primary" ? primary : brand;
        put("--ring", C(ringHsl));
        put("--ring-color", rgba(ringHsl, policy.ringAlpha), `${language} focuses at ${policy.ringAlpha} alpha`);
        // --color-ring is what Tailwind's ring-* utilities actually read for an unqualified `ring-2`.
        // Foundations' own shape for this role already carries alpha (its one deliberately-alpha
        // token besides scrim), so this mirrors --ring-color rather than the opaque --ring above.
        put("--color-ring", rgba(ringHsl, policy.ringAlpha));
      }
    }

    // The accent pair is authored by the anchor (a 95%-lightness tint of the primary plus a legible
    // ink for it), which is the same construction all three languages use, so it passes through.
    const accent = parseTriplet(p.accent), accentFg = parseTriplet(p["accent-foreground"]);
    put("--accent", C(accent));
    put("--color-accent", CC(accent));
    put("--accent-foreground", C(accentFg));
    put("--color-accent-foreground", CC(accentFg));

    // The 8-hue ramp. `--chart-N` is a WHOLE VALUE in the contract (`--color-chart-1: var(--chart-1)`
    // in @theme inline, and Beacon writes `#fa7317`), so the anchor's triplets are wrapped here.
    // Emitting them bare would leave every bar and series transparent. Bare-only stays correct here,
    // unlike primary/accent/ring above: tokens.css's own chart ramp is ALSO bare (`--chart-N`, never
    // `--color-chart-N`, "KEEP THESE DEDICATED") on purpose, so this one was never disconnected.
    const chart = p.chart || {};
    for (let i = 1; i <= 8; i++) if (chart[i]) put(`--chart-${i}`, `hsl(${chart[i]})`);

    // Corner. The nested rung has to move with it or the language's two rungs desynchronise.
    // --radius-lg / --radius-md are what Tailwind's rounded-lg/rounded-md utilities actually read —
    // Foundations replaced one derived base with four independent literal steps (see tokens.css's own
    // Radius note); THEME-AUTHORING.md already documents an anchor's single `radius` field as mapping
    // onto --radius-lg specifically, one step in for --radius-md — the same mapping tokens-from-css.mjs
    // uses on the other side of this pipeline.
    const radius = design.shape?.radius;
    if (radius) {
      const step = NESTED_STEP[language] ?? 0;
      const nested = step ? `calc(var(--radius) - ${step}px)` : "var(--radius)";
      put("--radius", radius);
      put("--radius-nested", nested);
      put("--radius-lg", radius);
      put("--radius-md", nested);
    }
  }

  // The rail. toDesignLanguage() already computes a full sidebar/-foreground/-muted/-border/-accent
  // set per sidebarTone (light/brand/dark) — real, already-tuned data — but nothing ever emitted it
  // as --color-sidebar*, so border-sidebar-border and bg-sidebar were never real Tailwind utilities
  // at all: no declaration anywhere in the stylesheet to generate them from. A CSS
  // unrecognised-utility failure looks different from the primary/accent bug above (that one had a
  // value, just the WRONG one, frozen by @theme inline) — this one has NO value, so the border fell
  // through to `currentColor` (preflight is off, no reset sets a default), i.e. the element's own
  // dark ink. ALWAYS runs, languageDefault or not: tokens.css defines no --color-sidebar* for any
  // language (see the languageDefault note above), so there is no "language already has this" to be
  // redundant with here — an app whose anchor is its language still needs its own sidebar rail wired.
  //
  // BUG FOUND 2026-08-13, FIXED HERE: emitting only --color-${role} was NOT enough. The kit's own
  // bridge (src/shadcn.css) declares `--color-sidebar: hsl(var(--sidebar, var(--card)))` and
  // `--color-sidebar-border: hsl(var(--sidebar-border, var(--border)))` — an INLINE @theme token, so
  // Tailwind compiles bg-sidebar / border-sidebar-border to read the BARE var(--sidebar) /
  // var(--sidebar-border) directly, never var(--color-sidebar). This loop wrote a value nothing
  // downstream consumed: the generated utility fell through to whatever the create-app scaffold's
  // own index.css happens to set bare --sidebar to (an off-white grey default, not this app's real
  // colour) — silently, since that's valid CSS, just the wrong value. Verified live on a real
  // build: the rail rendered scaffold grey with no visible edge instead of white + shadow-sidebar.
  // Same shape as the primary/accent bug this file's CC()/bare split already guards — just never
  // applied to this loop. The bare form uses C(), not CC(): shadcn.css wraps it in hsl() itself, so
  // writing an already-hsl()-wrapped value here would double-wrap into invalid CSS (the same failure
  // pattern found across --chart-N call sites this same day).
  for (const role of ["sidebar", "sidebar-foreground", "sidebar-muted", "sidebar-border", "sidebar-accent"]) {
    const v = parseTriplet(p[role]);
    if (!v) continue;
    put(`--color-${role}`, CC(v));
    put(`--${role}`, C(v));
  }

  // Fonts. ALWAYS runs, languageDefault or not — same reasoning as the sidebar loop above.
  // --type-display/-sans/-mono are this project's OWN convention, read by the shell's own
  // `font-family: var(--type-sans)` rules (body, h1-h4, code/pre) — nothing in the base contract
  // ever set these, so without this block they resolved to nothing/inherit no matter what this app
  // chose. design.type is real per-app data (e.g. Poppins/DM Sans/IBM Plex Mono) — it was just never
  // wired to the variable names the CSS actually reads. Quoted: an unquoted multi-word value here
  // would still be technically legal CSS, but every other font stack in this codebase quotes
  // multi-word names (see FONT_WEIGHTS' callers), so this matches rather than being the one exception.
  //
  // 2026-08-13, later same day — ALSO emitting --font-display/-sans/-mono, Tailwind's OWN native
  // namespace, not just the --type-* one above. tokens.css now hardcodes these to Beacon's language-
  // level default (DM Sans / IBM Plex Mono, restored the same day to fix an unrelated bug — see that
  // token's own comment), which every Tailwind-native `font-sans`/`font-mono` utility class reads —
  // and the catalog's own Button/Input/etc. recipes use exactly that class, not `font-family:
  // var(--type-sans)`. Found live on a real build: its buttons/inputs rendered DM Sans
  // correctly, but only by COINCIDENCE — its own chosen font happened to also be DM Sans. Nothing
  // was actually reading design.type for those controls; every one of them would have silently kept
  // rendering Beacon's hardcoded DM Sans even for an app that configured a different body font.
  // Overriding --font-* per-app, the same value as --type-*, makes the native utility track this
  // app's real choice instead of the language's fixed default — same fix, same data, one more
  // namespace. Scoped to the app's own identity block only: the catalog/gallery never calls
  // identityTokens() at all, so Beacon's own hardcoded --font-sans still governs it unchanged.
  const type = design.type || {};
  if (type.display?.family) { put("--type-display", `"${type.display.family}", sans-serif`); put("--font-display", `"${type.display.family}", sans-serif`); }
  if (type.body?.family) { put("--type-sans", `"${type.body.family}", sans-serif`); put("--font-sans", `"${type.body.family}", sans-serif`); }
  if (type.mono) { put("--type-mono", type.mono); put("--font-mono", type.mono); } // already a full quoted stack string, passed through

  return out;
}

/** The stylesheet. Tokens only — no component rules; see the header for what was removed. */
export function identityCss(design = {}) {
  const language = pickLanguage(design);
  // The generated app's bridge is `--color-primary: var(--primary)` — raw passthrough — so every
  // colour here must be a complete colour. See identityTokens' header for the other side of this.
  const tokens = identityTokens(design, language, { wholeValueColors: true });
  const name = design.name || design.id || "this app";
  const anchor = design.anchorName || design.anchorId;

  const lines = [
    "/* GENERATED by engine/theme-from-design.mjs — regenerate rather than hand-editing.",
    " *",
    ` * ${name}'s identity, layered on the ${language.toUpperCase()} design language.`,
    anchor ? ` * Anchor: ${anchor}${design.shape?.surface ? ` (surface "${design.shape.surface}")` : ""}.` : null,
    " *",
    " * Beacon supplies all 154 contract tokens from src/tokens.css — the ground, the tone map, the",
    " * elevation ladder and every component's geometry. Nothing here re-declares any of them. What",
    " * follows is only what belongs to this app rather than to its language: its accent, its focus,",
    " * its chart ramp and its corner.",
    " */",
    "",
    ":root {",
  ];
  for (const t of tokens) lines.push(`  ${t.name}: ${t.value};${t.note ? `   /* ${t.note} */` : ""}`);
  lines.push("}");
  if (!tokens.length) {
    // The marker is not decoration — theme-check.mjs fails any app that declares none of --primary /
    // --chart-1 / --radius UNLESS it says so on purpose, and this is exactly that case: an app whose
    // anchor IS its language (or which carried no palette at all) has nothing of its own to declare.
    // Without the marker the gate would read a deliberate choice as the silent-empty bug it exists to
    // catch, and the two are indistinguishable from the file alone. Emitted verbatim as the constant
    // theme-check greps for; do not reword it.
    lines.push(
      "",
      "/* IDENTITY: language-default",
      " *",
      anchor && String(anchor).toLowerCase() === language
        ? ` * ${name}'s anchor IS ${language.toUpperCase()}, so it has no accent of its own to layer — the language`
        : ` * The design slice carried no palette, so ${name} has nothing of its own to layer — the language`,
      " * declares --primary, --brand-accent, the accent pair, --ring, the chart ramp and --radius",
      " * already. Re-emitting them here could only repeat those values or drift from them, and it",
      " * drifted: a rounded copy is not the language it claims to be. Deliberately empty.",
      " */");
  }
  return lines.join("\n") + "\n";
}

/**
 * Refuse to overwrite a file that is not ours to overwrite.
 *
 * The old invocation wrote `src/app-theme.css`, which in the current scaffold is the legacy `--kf-*`
 * ALIAS LAYER — 44 declarations that kf-ui.css reads in 240 places. Running the shipped command
 * against the current starter destroys all 44 (measured, not inferred), and the legacy
 * .kf-kard/.kf-panel/.kf-kpi components silently revert to kf-ui.css's own translucent-glass look
 * beside a contract card. A full-file write with no guard is how that stays invisible.
 */
export function assertSafeTarget(out) {
  if (!existsSync(out)) return;
  const existing = readFileSync(out, "utf8");
  if (existing.includes("GENERATED by engine/theme-from-design.mjs")) return;   // ours; overwrite
  const aliases = new Set([...existing.matchAll(/^\s*(--kf-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
  if (!aliases.size) return;                                                    // nothing to lose
  throw new Error(
    `theme-from-design: refusing to overwrite ${out} — it declares ${aliases.size} \`--kf-*\` ` +
    `aliases this generator does not emit, and a full-file write would delete them. That file is ` +
    `the scaffold's legacy alias layer, which kf-ui.css reads. Emit to src/app-identity.css ` +
    `instead (the scaffold ships it as a placeholder and main.jsx already imports it).`);
}

/**
 * Stamp the language on <html>. With one language (Beacon, the contract's bare `:root`) this no
 * longer selects anything — there is no `:root[data-theme="…"]` block left for the attribute to
 * activate — but the function stays: callers still ask for it (kit-install.mjs), and a harmless
 * `data-theme="beacon"` is cheaper to keep emitting than to thread a "don't bother" flag through
 * every caller for a case with no downside. Written into index.html rather than set from JS so it
 * would be live on first paint if it ever mattered again.
 */
export function setLanguageAttribute(htmlPath, language) {
  if (!existsSync(htmlPath)) return { ok: false, reason: `no such file: ${htmlPath}` };
  const html = readFileSync(htmlPath, "utf8");
  const tag = /<html\b[^>]*>/i.exec(html);
  if (!tag) return { ok: false, reason: "no <html> tag" };
  const replaced = /\bdata-theme\s*=\s*"[^"]*"/i.test(tag[0])
    ? tag[0].replace(/\bdata-theme\s*=\s*"[^"]*"/i, `data-theme="${language}"`)
    : tag[0].replace(/>$/, ` data-theme="${language}">`);
  if (replaced === tag[0]) return { ok: true, changed: false };
  writeFileSync(htmlPath, html.slice(0, tag.index) + replaced + html.slice(tag.index + tag[0].length));
  return { ok: true, changed: true };
}

if (process.argv[1] && process.argv[1].endsWith("theme-from-design.mjs")) {
  const args = process.argv.slice(2);
  const specPath = args.find((a) => !a.startsWith("--"));
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  if (!specPath) {
    console.error("usage: theme-from-design.mjs <experience-spec.json> --out src/app-identity.css [--html index.html]");
    process.exit(2);
  }
  if (!existsSync(specPath)) { console.error(`no such file: ${specPath}`); process.exit(2); }

  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const design = { ...(spec.design || spec) };
  // --language used to let a caller override which of eleven blocks the app adopted. Retired
  // 2026-08-12 with the other ten — there is only "beacon" to adopt now, so overriding it would
  // only ever mean asking for a language that doesn't exist. languageNotice still warns if a spec
  // itself names one (a stale pre-retirement run), so that case isn't silent.
  if (!design.palette) {
    console.error("  ⚠ no design.palette in the spec — the app will wear its language unmodified");
  }

  const out = flag("--out") || "src/app-identity.css";
  try { assertSafeTarget(out); } catch (e) { console.error(`  ✗ ${e.message}`); process.exit(1); }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, identityCss(design));

  const language = pickLanguage(design);
  const notice = languageNotice(design);
  if (notice) console.error(notice);
  // index.html sits beside src/, so derive it from --out unless the caller says otherwise.
  const htmlPath = flag("--html") || join(dirname(dirname(out)), "index.html");
  const set = setLanguageAttribute(htmlPath, language);

  console.log(`✓ ${design.name || "app"} → ${language} (${design.palette?.primary || "no primary"}, r=${design.shape?.radius || "language default"}) → ${out}`);
  if (set.ok) console.log(`  ${set.changed ? "✓" : "·"} <html data-theme="${language}"> in ${htmlPath}`);
  else console.error(`  ⚠ could not set data-theme (${set.reason}) — the app will render as Beacon`);
}
