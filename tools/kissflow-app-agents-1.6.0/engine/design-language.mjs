// design-language.mjs — turn a per-app DESIGN LANGUAGE (derived from the use case by kf-design-director)
// into a COMPLETE prototype shell: fonts, palette, shape, surface treatment AND container/layout
// archetype. Today every app reuses proto-kit/shadcn-shell.html — same Inter, same violet, same
// sidebar+main layout; only accent colours vary. This module regenerates the whole shell per app so a
// bank, a clinic and a creative studio look like different products, not reskins of one template.
//
// A DesignLanguage (the `design` slice kf-design-director emits) has this shape — every field grounded
// in the domain, never a generic default:
//   {
//     id, name, rationale,                       // why these choices fit THIS domain
//     palette: { <token>: "H S% L%", …, chart:{1..8}, category:{1..8} },  // see TOKENS
//     type: { display:{family,weights}, body:{family,weights}, headWeight, tracking, mono,
//             scale:{xs..2xl,display,kpi}, weights:{normal..black}, trackingScale:{...}, leadingScale:{...} },
//     shape: { radius:"0.75rem", borderWidth:"1px", ringWidth:"2px", surface:"solid|flat|elevated|glass",
//              shadowScale:{2xs,xs,sm,md,lg,xl,2xl} },
//     spacingUnit: "0.25rem", motionTiming: { duration, easing, moveDuration },
//     density: "compact|comfortable|airy",
//     shell:  { archetype:"rail-left|rail-dark|top-bar|rail-right", framing:"full-bleed|rounded-canvas", sidebarTone:"light|dark|brand" },
//     icons:  "line|solid|duotone",
//   }
// Only `palette.primary` + `type` + `shape` + `shell.archetype` are strictly required; the rest fall
// back to sensible, still-domain-neutral defaults so a partial slice never crashes the build (this is
// what lets an OLD design slice — one written before 2026-07-30, missing shadowScale/spacingUnit/the
// type ladders/motionTiming — still render instead of breaking; see DEFAULT_EXT below).

// ── THE TOKEN CONTRACT IS THE THEME ──────────────────────────────────────────────────────────────
// This module used to build its own theme: a `tailwind.config` object handed to the Tailwind v3 play
// CDN, plus a `:root` block of ~75 anchor-derived tokens. That was right when the prototype was the
// only artifact. It is not any more.
//
// `starter/src/tokens.css` is a per-token-provenance contract — Beacon (`:root`), the app's one
// design language since the other ten blocks were retired 2026-08-12 — and 26 `@utility` classes,
// and it is what every component in the kit AND every recipe in proto-kit's catalog is written
// against. The v3 play CDN cannot compile a
// single one of those utilities — `@utility` and `@theme` are v4 syntax — so a catalog recipe pasted
// into a generated prototype lost all of its geometry and every `--tone-*` / `--elev-*` reference
// resolved to nothing. Measured before this change: of the 179 class tokens the five archetypes use,
// 168 resolve under v4 + the contract and 10 did not exist at all.
//
// So the shell now loads the SAME runtime and the SAME contract the gallery does, and the app's own
// identity is layered on top by the SAME function that writes it for the runtime app. That last part
// is the point: prototype/app drift is not checked here, it is structurally impossible.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { identityTokens, languageDecision, languageNotice, pickLanguage } from "./theme-from-design.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// The SYNCED copy, not starter/src/tokens.css directly. proto-kit/sync-tokens.mjs owns that copy and
// `sync-tokens --check` is the one gate that keeps it honest; reading the starter's file directly
// would create a second, ungated path to the same bytes.
const CONTRACT_PATH = join(HERE, "proto-kit", "tokens.css");

function contractCss() {
  let css;
  try {
    css = readFileSync(CONTRACT_PATH, "utf8");
  } catch {
    throw new Error(
      `design-language: cannot read the token contract at ${CONTRACT_PATH}. It is generated from ` +
      `starter/src/tokens.css — run \`node engine/proto-kit/sync-tokens.mjs\`. Without it the shell ` +
      `renders with no tokens and no @utility classes at all, which looks like a plain page rather ` +
      `than a failure.`);
  }
  // The contract is EMBEDDED in a <style> element, so a closing tag anywhere inside it would end the
  // element early and silently truncate everything after it. gen-catalog.mjs makes the same check for
  // the same reason; the failure is invisible because the page still renders, just unstyled.
  if (/<\/style/i.test(css)) {
    throw new Error("design-language: the token contract contains a closing </style> tag — it cannot be inlined.");
  }
  return css;
}

// ── the faces a prototype loads — ASKED OF THE CONTRACT, not listed here ─────────────────────────
// Each language names its three faces in --type-display / --type-sans / --type-mono. A prototype
// ships ONE language, so it loads only that language's faces — unlike starter/index.html, which is a
// bench page previewing every language and therefore loads every face at once.
//
// This WAS an eleven-row hand table, and it was wrong on five rows at once. The bug is specific and
// it is the reason the derivation matters: a language block declares only what DIFFERS, so a document
// that names no mono face inherits Beacon's `--type-mono: IBM Plex Mono` — and the hand row, written
// from the document, listed only the two faces the document mentioned. Cadence, Hearth, Lantern,
// Plush and Trailhead each rendered every mono token in whatever `ui-monospace` happens to be,
// because the face the contract asked for was never in the stylesheet link. Nothing could notice:
// the fallback is a real monospace and the page looks finished.
//
// So the FAMILIES come from the resolved contract (post-Beacon-inheritance, which is what the
// browser will actually ask for) and only the WEIGHT SPEC comes from a table — because a weight
// ladder is genuinely not in tokens.css and cannot be derived from it. A face with no entry falls
// back to a plain 400;500;600;700 request rather than being dropped: a slightly-wrong weight set is
// recoverable, a missing font is the failure this replaces.
const FONT_WEIGHTS = {
  "Poppins": "wght@400;500;600;700;800", "DM Sans": "wght@400;500;600;700",
  "IBM Plex Mono": "wght@400;500;600", "Manrope": "wght@400;500;600;700;800",
  "Urbanist": "wght@400;500;600;700", "JetBrains Mono": "wght@400;500",
  "Sora": "wght@300;400;500;600", "Work Sans": "wght@400;500;600;700",
  "Plus Jakarta Sans": "wght@400;500;600;700;800",
  "Newsreader": "opsz,wght@6..72,400;6..72,500;6..72,600", "Karla": "wght@400;500;600;700",
  "Figtree": "wght@300;400;500;600", "Baloo 2": "wght@500;600;700;800",
  "Quicksand": "wght@400;500;600;700", "Outfit": "wght@300;400;500;600;700;800",
  "Gabarito": "wght@500;600;700", "Hanken Grotesk": "wght@400;500;600;700",
  "Spline Sans Mono": "wght@400;500", "Nunito": "wght@400;500;600;700;800",
};

/** The three faces `<html data-theme=language>` actually resolves to, Beacon inheritance included. */
function resolvedFaces(language) {
  let css;
  try { css = contractCss(); } catch { return ["Poppins", "DM Sans", "IBM Plex Mono"]; }
  const read = (want) => {
    // ALL blocks that can declare tokens, concatenated. The #142 contract moved the faces into
    // `@theme inline` (the Tailwind bridge) — neither of its two :root blocks carries them — and
    // reading :root alone is how the fonts URL went out empty on a real build's benchmark.
    const sels = want === "beacon" ? [":root {", "@theme inline {"] : [`:root[data-theme="${want}"] {`];
    let body = "";
    for (const sel of sels) {
      let from = 0;
      for (let start = css.indexOf(sel, from); start >= 0; start = css.indexOf(sel, from)) {
        const end = css.indexOf("\n}", start + sel.length);
        body += css.slice(start + sel.length, end < 0 ? css.length : end) + "\n";
        from = start + sel.length;
      }
    }
    if (!body) return {};
    const face = (n) => {
      // the contract renamed --type-* → --font-* (#142); accept both, prefer the current name.
      // Only a QUOTED first segment is a real face (unquoted = CSS generic keyword — the 503 lesson
      // in designFaces applies here identically).
      const m = new RegExp(`--font-${n}\\s*:\\s*([^;\\n]+)`).exec(body) || new RegExp(`--type-${n}\\s*:\\s*([^;\\n]+)`).exec(body);
      if (!m) return null;
      const first = m[1].split(",")[0].trim();
      return /^["']/.test(first) ? first.replace(/^["']|["']$/g, "").trim() : null;
    };
    return { display: face("display"), sans: face("sans"), mono: face("mono") };
  };
  const base = read("beacon"), own = language === "beacon" ? base : read(language);
  return ["display", "sans", "mono"].map((r) => own[r] || base[r]).filter(Boolean);
}

// 2026-08-13 — Foundations mints no --type-* token at all (see tokens.css's own header), so
// resolvedFaces() above returns nothing for Beacon and has since the migration landed: there is
// nothing left in the contract to scrape. Every app's OWN chosen faces were sitting unused the
// whole time — design.type.display/body/mono is real per-app data (Poppins/DM Sans/IBM Plex Mono,
// say), computed once at Design time and saved in the spec; this just reads it instead of
// re-deriving something the contract can no longer answer. mono is often a full quoted stack
// string ("IBM Plex Mono", ui-monospace, …) — when it is, only the FIRST face is a real Google
// Fonts family, so it's unquoted and split the same way tokens-from-css.mjs already does on the
// other side of this pipeline.
//
// 2026-08-13, later same day — /debugger root-caused a live bug from this function: quotes were
// stripped IF PRESENT but the code never checked whether the first segment was quoted TO BEGIN
// WITH, so an all-generic mono stack (no distinct face chosen at all — legitimate; not every app
// picks one) got its bare CSS generic-family keyword (ui-monospace, monospace, system-ui, …) sent
// to Google Fonts as if it were a real family name. Google Fonts doesn't host generics; it 503'd
// the WHOLE combined css2 request — DM Sans included, even though DM Sans itself was completely
// valid. Confirmed live on a real build: its type.mono was "ui-monospace, SFMono-Regular,
// Menlo, monospace" (no real face ever chosen), and
// …&family=DM+Sans:...&family=ui-monospace:... came back 503 twice over the network — not a
// theory, read straight off the request. Fix: a real font name is always QUOTED in this codebase's
// own convention (every multi-word stack here does — see FONT_WEIGHTS' callers); an UNQUOTED first
// segment is therefore always a generic keyword, never a real face, and is dropped rather than
// forwarded. Apps with a real chosen mono face (e.g. "IBM Plex Mono", ui-monospace, …) are
// unaffected — their first segment is quoted and still passes through exactly as before.
function designFaces(dl) {
  const t = dl && dl.type;
  if (!t) return [];
  const monoRaw = typeof t.mono === "string" ? t.mono.split(",")[0].trim() : null;
  const mono = monoRaw && /^["']/.test(monoRaw) ? monoRaw.replace(/^["']|["']$/g, "").trim() : null;
  return [t.display && t.display.family, t.body && t.body.family, mono].filter(Boolean);
}

/** Google Fonts `family=` params for one app — its OWN chosen faces (designFaces) when the design
 * slice has them, else the resolved contract (resolvedFaces) for an older spec with no `.type`. */
function languageFontQueries(language, dl) {
  const faces = designFaces(dl);
  const resolved = faces.length ? faces : resolvedFaces(language);
  return [...new Set(resolved)]
    .map((f) => `${f.replace(/ /g, "+")}:${FONT_WEIGHTS[f] || "wght@400;500;600;700"}`);
}

/**
 * Does this language LIFT its cards off the ground?
 *
 * ASKED OF THE CONTRACT, NOT OF A LIST. The rail used to float under a hardcoded set of language ids,
 * which is a list that has to be edited every time the contract grows — and it grew: the day this was
 * written the catalog went from three languages to eleven and retired Nimbus, so a rule naming
 * `[data-theme="nimbus"]` styled nothing while nine new languages silently fell through to Beacon's
 * flush panel. None of that was a decision anyone made.
 *
 * --elev-card is the contract's own answer to the question the rail is asking. A language that lifts
 * its cards off the ground has already said its surfaces float; a rail welded to the viewport edge is
 * then the one surface contradicting it. Measured across all eleven: Beacon and Trailhead resolve to
 * `0 0 #0000` (flat), the other nine carry a real shadow. So a language added tomorrow gets the right
 * rail with no edit here — which is the only version of this that stays true.
 *
 * Resolved at GENERATE time rather than in CSS because a prototype ships exactly one language, so the
 * branch is known before a byte is written, and CSS cannot cleanly branch on a custom property's value
 * anyway. Falls back to the bare :root block (Beacon) the way the cascade itself would.
 */
function languageLifts(language) {
  let css;
  try { css = contractCss(); } catch { return false; }   // the caller reports a missing contract
  const heads = [...css.matchAll(/^:root(?:\[data-theme="([a-z-]+)"\])?\s*\{/gm)];
  const read = (want) => {
    for (let i = 0; i < heads.length; i++) {
      if ((heads[i][1] || "beacon") !== want) continue;
      const body = css.slice(heads[i].index, i + 1 < heads.length ? heads[i + 1].index : css.length);
      const m = /^\s*--elev-card\s*:\s*([^;]+);/m.exec(body);
      if (m) return m[1].trim();
    }
    return null;
  };
  const v = read(language) ?? read("beacon");
  if (!v) return false;
  // "no elevation" is spelled `0 0 #0000` in this contract (and `none` in CSS generally). Anything
  // else is a real shadow, however subtle.
  return !/^(none|0 0 #0000|0 0 0 #0000)$/i.test(v.replace(/\s+/g, " ").trim());
}

/** The rail's surface treatment, decided by languageLifts() above. Empty = the flush panel. */
function railRule(language) {
  if (!languageLifts(language)) {
    return `/* THE RAIL IS FLUSH. ${language} declares no card elevation (--elev-card resolves to none),\n` +
      `   so its surfaces sit ON the ground rather than above it and the rail keeps its 1px edge and its\n` +
      `   square corner. Decided from the contract, not from a list of language ids — see languageLifts(). */`;
  }
  return `/* THE RAIL FLOATS. ${language} lifts its cards off the ground (--elev-card carries a real shadow),\n` +
    `   and a rail welded to the viewport edge is then the one surface contradicting its own language.\n` +
    `   Costs no layout maths: the aside is a flex child stretching to a min-h-screen row, so margin\n` +
    `   takes height off it rather than adding a scrollbar. The shadow is the language's own. */\n` +
    `.rail { margin: 10px 0 10px 10px; border-right: 0; border-radius: var(--radius-xl);\n` +
    `  box-shadow: var(--elev-card); }`;
}

/**
 * The prototype's <head>: the v4 runtime, the contract, this app's identity, a base layer and the
 * handful of rules that belong to the shell itself rather than to any component.
 */
export function emitHead(dl = {}) {
  const language = pickLanguage(dl);
  const families = languageFontQueries(language, dl);
  const fontHref = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;

  // ONE function derives identity for both artifacts. See theme-from-design.mjs for the division of
  // labour: the language owns the ground and the grammar, the app owns its accent and its corner.
  const identity = identityTokens(dl, language);
  // 2026-08-13 — MUST be `@theme inline`, not `:root`. Verified in-browser: @tailwindcss/browser@4
  // (this prototype's runtime — the real deployed app uses the actual Tailwind Vite build instead,
  // which doesn't share this) FREEZES an auto-generated colour/radius utility (bg-primary,
  // rounded-lg, …) to whichever value its OWN `@theme inline` block declared, and ignores a plain
  // `:root` redeclaration appearing later in the same stylesheet — even though the custom property
  // itself resolves correctly via normal cascade (`getComputedStyle` on --color-primary showed the
  // app's own green; the compiled `.bg-primary` rule still read Beacon's orange as a literal). A
  // second `@theme inline` block for the SAME name is what the runtime actually re-reads when
  // generating utilities. Isolated and confirmed with a 3-line repro before changing this.
  const identityBlock = identity.length
    ? `\n/* ── this app's identity, from the same emitter the runtime app uses ──────────────────────────── */\n` +
      `@theme inline {\n` +
      identity.map((t) => `  ${t.name}: ${t.value};${t.note ? `   /* ${t.note} */` : ""}`).join("\n") +
      `\n}\n` +
      // The SAME tokens again as a plain :root. @theme inline only exists at compile time: Tailwind
      // reads recognised namespaces (--color-*, --radius-*) out of it and inlines them into utilities,
      // but the browser skips the at-rule entirely, so any identity token read at RUNTIME through a
      // bare var() — --gradient-primary behind every gradient button, --ring-color, the bare triplets
      // — kept resolving to the contract's own :root literal (seen on a real build: blue utilities,
      // stock-orange Approve buttons). A later plain :root wins the cascade for exactly those readers; for the
      // compiled utilities it is a no-op duplicate of the values @theme inline already inlined.\n
      `:root {\n` +
      identity.map((t) => `  ${t.name}: ${t.value};`).join("\n") +
      `\n}\n`
    // Empty is a RESULT here, not an omission: identityTokens returns nothing when the app's anchor is
    // its own language, because the language already declares every token it would write. Say so in
    // the sheet, using the same wording theme-check.mjs recognises on the runtime side, so a reader
    // opening a prototype with no identity block can tell "deliberate" from "the emitter broke".
    : `\n/* IDENTITY: language-default — this app's anchor IS its language, so it has no accent of its\n` +
      `   own to layer. Every token an identity block would write is already declared by the language\n` +
      `   above; re-emitting them could only repeat or drift from those values. Deliberately empty. */\n`;

  const grads = dl.gradients || {};
  const gradVars = Object.entries(grads).map(([k, v]) => `  --grad-${k}: ${v};`).join("\n");

  return `
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontHref}" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">
/* Layer order first, exactly as starter/src/shadcn.css and proto-kit/gallery.html declare it: a
 * later layer outranks an earlier one and anything unlayered outranks every layer, which is what
 * keeps the base resets below UNDER border-control / field-shape rather than zeroing them. */
@layer theme, base, components, utilities;

/* Both @import lines are load-bearing — verified in-browser: without them NOTHING compiles and
 * every @utility silently renders as a no-op. They also keep preflight OFF, which the contract
 * assumes (see the form-control reset in the base layer). */
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);

${contractCss()}
${identityBlock}${gradVars ? `\n/* Gradient tokens the anchor carries — looks the flat palette cannot express. */\n:root {\n${gradVars}\n}\n` : ""}
/* ── base layer ──────────────────────────────────────────────────────────────────────────────────
 * The contract declares the type families and the canvas but never applies them, by design: it is a
 * token contract, not a document stylesheet. These are the same rules proto-kit/gallery.html uses,
 * reading the contract tokens directly. Keep the two in step. */
@layer base {
body {
  /* 2026-08-13 — on request. The browser's UA stylesheet gives body an 8px margin by default;
     nothing here was overriding it, so the whole app sat inset 8px from the viewport edge on all
     sides — found live via DevTools' box-model panel. starter/src/index.css's own body rule already
     resets this (margin: 0); the prototype pipeline just never carried that reset over. */
  margin: 0;
  /* 2026-08-13 — was var(--canvas), a bare name tokens.css never defines (its only trace was a
     comment on app-theme.css's --kf-body describing Nimbus's retired gradient canvas — Nimbus is
     one of the 10 languages Foundations retired, so that mechanism is gone too). The property
     resolved to nothing, so the page fell through to plain white instead of Beacon's own canvas.
     --color-canvas (#F4F4F7 — "ground panels sit on, never a panel fill") is the real, already-
     documented token; this just wires the body to it. Found live: the content area next to the
     sidebar rendered white with no visible separation from its floating shadow-only cards. */
  background: var(--color-canvas);
  /* Load-bearing for any future language whose canvas is a multi-stop gradient: without it the
     ground re-tiles per element and scrolls with the content. Inert while --color-canvas is a flat
     colour, which today it is. */
  background-attachment: fixed;
  /* #142 renamed the contract's faces --type-* → --font-* and this rule kept reading the DEAD name:
     var(--type-sans) resolved to nothing and every prototype fell back to Times. Caught on a real
     build's benchmark (body computed "Times", fontsLoaded []). New name first, old name for
     pre-rename IRs, and a real stack last — a font rule must never resolve to nothing. */
  font-family: var(--font-sans, var(--type-sans, "DM Sans", -apple-system, "Segoe UI", sans-serif));
  /* Matches starter's own body rule. Literals rather than tokens because the contract declares no
     body-text size and starter's --kf-text-base lives in the legacy alias layer that gets deleted. */
  font-size: 14px;
  line-height: 1.55;
  color: hsl(var(--foreground));
}
h1, h2, h3, h4, .font-display { font-family: var(--font-display, var(--type-display, var(--font-sans, sans-serif))); }
code, pre, .font-mono { font-family: var(--font-mono, var(--type-mono, ui-monospace, monospace)); }
/* With preflight off the UA stylesheet survives, and Chrome's form-control defaults are BEVELLED
   ('2px outset' on button, '2px inset' on the rest). '0 solid' not 'none': a utility that adds a
   border sets only a width, and a width against 'border-style: none' computes to 0.
   box-sizing: border-box — the OTHER thing preflight normally sets ('*, ::before, ::after { box-
   sizing: border-box }') that this contract never carried over for form controls. The UA default
   is content-box, so 'w-full' (width:100%) sizes the CONTENT box alone — any padding/border on the
   same element then adds ON TOP of that 100%, overflowing the element's own container by exactly
   (padding + border). Invisible in a single full-width field; in any 2-up grid (a settings form's
   own General section, live: two 643px cells, each element rendering 673px) the overflow reads as
   the next field's label and input visibly overlapping. Scoped to the same 4 elements as the
   border reset above, for the same reason preflight itself scopes box-sizing to '*': any element
   using both a percentage width and its own padding/border needs this, and inputs are the element
   this app authors that way most. */
button, input, select, textarea { border: 0 solid; box-sizing: border-box; }
/* Links, for the same reason. The v3 play CDN shipped preflight, which reset these; the contract
   deliberately runs WITHOUT preflight, so every nav item came back underlined in UA link-blue the
   first time this shell rendered on v4 — caught on screen, not by the class-resolution gate, which
   is exactly the split those two checks are supposed to have. The gallery needs no such rule
   because a catalog page has no navigation. */
a { color: inherit; text-decoration: none; }
}

/* ── the shell's OWN chrome ──────────────────────────────────────────────────────────────────────
 * Everything below styles the shell itself — role views, the nav rail, the sparkline helpers. None
 * of it belongs to a component, so none of it belongs in the contract. */
.roleview { display: none; } .roleview.active { display: block; }
#roleswitch { scrollbar-width: none; } #roleswitch::-webkit-scrollbar { display: none; }
#roleswitch button { white-space: nowrap; flex: 0 0 auto; }
#personaname, #pagetitle { white-space: nowrap; }

/* Nav selection, expressed in the tokens the BUILT app's rail resolves to. starter/src/index.css
 * writes these through --kf-nav-* aliases, but those live in app-theme.css — the legacy layer
 * scheduled for deletion — so pointing at them would tie the prototype to a dying file. These are
 * that rule's own fallback values, which are contract tokens, so the two rails render alike without
 * the dependency. Do not "fix" this back to the aliases.
 *
 * NO border-radius here — the markup carries rounded-md, which resolves through the contract to
 * calc(--radius * 0.8) and so follows whatever corner the anchor and language set. This rule used to
 * declare border-radius: var(--kf-nav-item-radius, 9px), and since --kf-nav-item-radius is a legacy
 * app-theme.css alias that the prototype never defines, it ALWAYS fell to the literal 9px — an
 * equal-specificity rule beating the token-driven utility already on the element. Measured across all
 * three languages: every nav row stayed 9px while the app mark beside it moved with --radius, so a
 * 20px-corner app rendered a rail full of 9px chips. Deleting the declaration lets the utility win;
 * the radius is now the language's, not a number frozen here. */
/* THE ROW IS A PILL, AND THE PILL IS THE ACCENT. The selected row used to fill with --secondary and
 * carry an inset 1px ring, which reads as a slightly-different grey on a grey rail: at a glance the
 * rail looked like it had no selection at all. It also spent the app's accent nowhere, so every
 * language's nav rendered the same neutral chip whatever the anchor was. Filling with --brand-accent
 * and writing on --primary-foreground makes the current page the one saturated element in the rail,
 * and it costs no per-language rule because every language declares both. --brand-accent rather than
 * --primary because it is the BRIGHT mark colour wherever a language states both (Beacon 53.5%
 * lightness vs primary's 34.9%, Trailhead 44.3 vs 27.1, Plush 70.6 vs 27.1, Checkpoint equal), and a
 * rail selection is a mark, not a heavy fill —
 * --primary read as a dark brown bar rather than the app's colour. The ring is gone: an edge on
 * the selected row contradicts Checkpoint outright, whose whole language is surfaces without edges.
 * 999px rather than --radius: a pill is the shape in every reference, and it is the one geometry that
 * reads as "a control" rather than "a smaller card" against the cards in the canvas beside it. */
.navitem { font-weight: 500; border-radius: 999px; transition: background .14s, color .14s, box-shadow .14s; }
/* 2026-08-13 — reworked on request, to read as prominent the way Dashboard Explorations.dc.html's
   exploration "1b — Dimensional" does: a soft tinted pill (not a solid brand-colour fill) with a
   thin inset ring for definition, rather than weight alone carrying the selected state. --brand-
   accent/--primary-foreground were ALSO both bare names tokens.css never defines (the same gap as
   --primary/--card/--muted-foreground elsewhere in this file) — background and color were both
   silently invalid here, on every language-default app, the whole time; only font-weight ever
   actually rendered, which read as "a deliberately quiet selected state" rather than the missing
   fill it was. --color-primary-bg/-ink are Beacon's OWN tokens for exactly this ("[SOURCE, added]
   #FFF1E8 — selected nav, active tabs, tinted tiles" / "#C24A00" — literally 1b's own hex values,
   already in the contract, just never wired here) — reached via their public alias names,
   --color-accent/--color-accent-foreground. Ring alpha (.18) and weight (500) also match 1b exactly. */
.navitem.active { background: var(--color-accent); color: var(--color-accent-foreground); font-weight: 500;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 18%, transparent); }
.navitem:not(.active):hover { background: color-mix(in srgb, var(--color-foreground) 5%, transparent); color: var(--color-foreground); }

/* THE LEADING INDICATOR, TWO STATES. The icon used to render identically whether or not its row was
 * selected, so the only thing separating current from not-current was the row fill — one signal, and
 * a weak one. Dimming the unselected mark gives the rail a second, quieter cue and makes the selected
 * row legible even in a screenshot at half size. Icons are stroke="currentColor", so the active mark
 * turns --primary-foreground on its own; opacity is the only thing left to state. .navdot is the
 * fallback for a nav entry with no icon, which otherwise had no mark to change at all. */
.navitem svg, .navitem .navdot { opacity: 0.42; transition: opacity .14s; }
.navitem.active svg, .navitem.active .navdot { opacity: 1; }
${(dl.shell?.sidebarTone || "light") !== "light" ? `
/* NON-LIGHT RAIL (tone: ${dl.shell.sidebarTone} — the design slice's decision). The generic .navitem
 * rules above read the page's ink family (--color-accent, --color-foreground) — correct on a light
 * rail, invisible on a dark or brand one (dark ink and a pale tinted pill against a dark rail).
 * toDesignLanguage computes the sidebar family for exactly this tone with tuned contrast
 * (sidebar-muted ≥~2.8:1 vs the rail, sidebar-accent ≥5.3:1 vs its own text), so the rail's nav
 * reads the SIDEBAR tokens and nothing else — emitted only when the tone needs it, so light rails
 * stay pixel-identical. */
aside .navitem:not(.active) { color: var(--color-sidebar-muted); }
aside .navitem:not(.active):hover { background: color-mix(in srgb, var(--color-sidebar-foreground) 8%, transparent); color: var(--color-sidebar-foreground); }
aside .navitem.active { background: var(--color-sidebar-accent); color: var(--color-sidebar-foreground); box-shadow: none; }
aside .navitem.active .navbadge { background: color-mix(in srgb, var(--color-sidebar-foreground) 22%, transparent); color: var(--color-sidebar-foreground); }` : ""}
.navdot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; flex: none; margin: 0 4.5px; }

/* THE COUNT BADGE. Was bg-foreground/5 with a --radius-md corner — invisible on the rail, and on the
 * filled pill it became a dark smudge on the accent. It now sits on --card off the pill and on a
 * translucent step of the pill's own foreground when the row is selected, so it stays readable
 * against both grounds without either state needing its own colour.
 * 2026-08-13 — --card/--muted-foreground/--primary-foreground were three more bare names tokens.css
 * never defines (same gap as .navitem.active above); moved to --color-* and, since the active pill
 * is now a pale tint rather than a solid fill, the active badge takes a translucent step of
 * --color-accent-foreground (the pill's own ink) rather than --primary-foreground — same "step of
 * the pill's own foreground" intent this comment already describes, just the correct foreground now
 * that the pill itself changed colour. */
.navbadge { font-size: 10.5px; line-height: 1.65; padding: 1px 8px; border-radius: 999px; flex: none;
  background: var(--color-card); color: var(--color-muted-foreground); }
.navitem.active .navbadge { background: color-mix(in srgb, var(--color-accent-foreground) 22%, transparent); color: var(--color-accent-foreground); }

${railRule(language)}
/* 2026-08-13 — every bare var(--primary) in this file (kit-spark's own base rule below, kit-bar,
   the search-input focus underline, the hero-band mark's fallback, the hero-band role chip dot)
   changed to var(--color-primary). Found live: StatTile's untoned spark (the new deltaTone-only
   pattern proto-kit/data-display.mjs now uses, matching starter's own component) rendered solid
   BLACK on a language-default app (a real build whose anchor IS its language) instead of
   the language's own orange. Root cause is the same shape as every bare-name bug this session:
   tokens.css never defines bare --primary at all; identityTokens() is the only thing that ever
   did, and only for apps with their own accent — languageDefault apps skip that whole block (see
   its own note), so bare --primary was simply never defined for them. No spark/bar/focus-ring ever
   exercised the untoned path before now, so it went uncaught.
   FIRST ATTEMPT at this fix wrapped the replacement in hsl(), i.e. hsl(var(--color-primary)) —
   still wrong, and worth recording: unlike bare --primary (a raw H/S/L triplet, MEANT to be
   wrapped), --color-primary is already a COMPLETE colour (tokens.css: --color-primary: hsl(22.6
   100% 50.6%)). Wrapping it again produces hsl(hsl(...)) — invalid CSS — which the property
   silently drops, falling back to its OWN initial value (stroke: none; fill: black — exactly what
   rendered). Caught live: getComputedStyle confirmed --color-primary itself resolved fine, but the
   spark's computed stroke/fill did not move, which is the signature of an invalid value being
   dropped rather than a variable being unresolved. Fixed by using --color-primary directly, no
   hsl() wrapper, and color-mix() for the alpha cases (a whole colour has no bare triplet left for
   hsl()'s own /alpha slash syntax to apply to). */
.kit-spark path { fill: none; stroke: var(--color-primary); stroke-width: 2; }
.kit-spark .area { fill: color-mix(in srgb, var(--color-primary) 12%, transparent); stroke: none; }
/* TONE VARIANTS. A trend line's colour is a CLAIM about the number — a rising overdue count is not
   the same news as a rising completion rate — and with only the accent available every spark on a
   dashboard said the same thing. These read the tone map rather than a colour so they stay correct
   under all eleven languages. --tone-*-fg is the ink the chip beside them already uses, so the card
   agrees with itself. */
.kit-spark.success path { stroke: var(--tone-success-fg); }
.kit-spark.success .area { fill: var(--tone-success-fg); opacity: 0.12; }
.kit-spark.danger path { stroke: var(--tone-danger-fg); }
.kit-spark.danger .area { fill: var(--tone-danger-fg); opacity: 0.12; }
.kit-spark.warning path { stroke: var(--tone-warning-fg); }
.kit-spark.warning .area { fill: var(--tone-warning-fg); opacity: 0.12; }
.kit-bar { fill: var(--color-primary); rx: 3; } .kit-bar.alt { fill: color-mix(in srgb, var(--color-primary) 35%, transparent); }
.kit-donut-track { stroke: hsl(var(--muted)); }
::-webkit-scrollbar { height: 8px; width: 8px; } ::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 4px; }

/* NOTE: frost is a CONTRACT utility now (tokens.css), not a shell class. Its six values were
   transcribed here as a bespoke rule for gradient anchors only, which meant the built app could not
   draw the same chip and the catalog could not show it. They moved to --frost-*, declared by
   Checkpoint, so the markup below needs no local rule.
   They deliberately did NOT go into --canvas-chip-* / on-canvas: that utility is the language's
   rule for text sitting on the ground, and PageHeader wears it - pointing it at Checkpoint's frost
   turned every page title into a fit-content pill in the built app. A chip is a component; a canvas
   treatment is a language rule. */
${grads.hero ? `
/* ── gradient anchors only ───────────────────────────────────────────────────────────────────────
 * Most of what used to live here was v3 workarounds, and the contract now does each of them
 * properly — so they are GONE, not ported:
 *   · the card-hairline removal (\`.rounded-lg.border.border-border.bg-card { border-color: transparent }\`)
 *     — Checkpoint sets --border-decor: 0px, which reaches every card by design.
 *   · the pill-button override (\`button.rounded-md { border-radius: 999px }\`) — the contract sets
 *     --control-radius per language, and Checkpoint's is 9px. The override CONTRADICTED the source
 *     it claimed to implement.
 *   · the mono-eyebrow hack, which targeted a \`.text-[13px].text-muted-foreground\` utility PAIR —
 *     replaced by the contract's own \`eyebrow\` utility.
 * What remains is genuine composition the contract does not cover. */
header.sticky { background: var(--grad-hero); backdrop-filter: none; }
/* the source's third hero-meter variant — dashed outline + candy-stripe fill, deliberately
   unfinished-looking beside the solid pastel bars. For part hero templates. */
.bar-striped { border: 1.5px dashed hsl(var(--muted-foreground) / .45);
  background: repeating-linear-gradient(115deg, rgba(255,255,255,.75) 0 7px, rgba(255,255,255,.25) 7px 14px); }
/* the source's search anatomy: underline-only inside card headers, never a boxed input. Scoped to
   the pl-9 icon-padding stack so form and modal inputs keep their boxed affordance. */
input.pl-9 { border: 0; border-bottom: 1px solid hsl(var(--border)); border-radius: 0; background: transparent; box-shadow: none; }
input.pl-9:focus { outline: none; box-shadow: none; border-bottom-color: var(--color-primary); }` : ""}
</style>`;
}

// ── SHELL ARCHETYPES — the CONTAINER/LAYOUT, chosen per app so structure differs too. Each returns the
// <body>…</body> chrome with @ROLE_SECTIONS + the standard element ids the switcher script needs
// (#sidenav, #roleselect, #pagetitle, #personaavatar/name/role, #crumb). ───────────────────────────
const HDR = `
    <!-- 2026-08-13 — border-border/bg-card/80 → border-gray-3, bg-card/80 dropped. Verified live in
         DevTools first (a real build's command-center page) before landing here: now that the
         content column sits on bg-gray-1 (see CONTENT_COL), a white bg-card/80 band read as a second,
         competing surface floating above it — the opposite of the flush, one-canvas header this shell
         wants. Flush on the gray canvas, separated only by a border, one step darker than the gray-1
         it sits on so the line stays visible without a fill. backdrop-blur-sm stays: harmless with no
         fill today, load-bearing if a future role ever scrolls content under a sticky header.
         2026-08-13, later same day — border-gray-3 → border-gray-2, on request: gray-2 is the
         contract's own "dividers on white" role (gray-3 is "pressed on a gray surface" — a step
         meant for a divider that itself sits on gray, not one on the white header/rail). Matches the
         sidebar footer's own border-gray-2 (the "Clickable prototype" divider), now consistent
         across every white-surface divider in the shell, not just the header pair.
         2026-08-13, later same day — bg-surface added back, on request: found live on a real
         build's dashboard header, which was still rendering the pre-flush bg-white (an older
         deployed copy of this pipeline — current HEAD had already dropped the fill entirely, see
         above). Rather than restore to flush/no-fill, the call this time is a filled header again,
         but on the kit's own elevated-surface token — bg-surface is what Card/PageHeader already
         use for a raised panel, so a header that DOES carry a fill matches the rest of the shell's
         surfaces instead of a raw bg-white literal. This supersedes the flush reasoning above for
         the header's OWN fill; the border-gray-2 divider and backdrop-blur-sm stay for the same
         reasons already given.
         2026-08-13, later same day — border-l added, on request: matches the real app-shell.jsx
         header fix (kit-installed apps), which now draws the same divider at the sidebar/header
         seam. border-gray-2 covers both sides, same as the bottom rule. -->
    <header class="h-16 shrink-0 border-b border-l border-gray-2 bg-surface backdrop-blur-sm flex items-center gap-4 px-6 sticky top-0 z-30">
      <!-- NO APP NAME HERE. The eyebrow used to read @APP_TITLE, which put the app's name an inch to
           the right of the sidebar wordmark that already says it — the same string rendered twice on
           every screen, in the one band that has to answer "where am I". The page title answers that;
           the app name never changes, so it carries no information at this position.
           The element STAYS, hidden and empty, rather than being deleted: #crumb is part of the
           runtime contract every archetype honours (see the id list above), and the hero-band
           archetype's switcher writes "ROLE · PERSONA" into it. Deleting it here would make this the
           one archetype where that lookup returns null. This is the identical construct the
           chrome-less archetype below already uses. Restore = put @APP_TITLE back in a visible div.
           2026-08-13, later same day — text-[17px] font-bold → text-xl → text-2xl font-medium, on
           request: bigger and thinner, matching the same call made on the real app-shell.jsx
           (verified on two real builds) so the prototype's header reads the same as the
           built app's. -->
      <div class="min-w-0"><span id="crumb" class="hidden"></span><h1 class="text-2xl font-medium leading-tight font-display" id="pagetitle">Home</h1></div>
      <!-- 2026-08-13 — font-sans added, on request: <select> is the one common control that does NOT
           inherit font-family from its ancestors in the browser's own UA stylesheet (button/input/
           textarea do; select still doesn't, reliably, across engines). Nothing here was giving it a
           font rule at all, so it fell straight through to the browser default (measured live:
           "Arial", while body correctly read the app's own DM Sans) — invisible on the rest of the
           page because everything else DOES inherit or already carries font-sans. -->
      <div class="ml-auto flex items-center gap-2" id="roleswitch"><span class="text-xs font-semibold text-muted-foreground whitespace-nowrap">Viewing as</span><select id="roleselect" class="h-9 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground cursor-pointer max-w-[240px] font-sans"></select></div>
      <div class="flex items-center gap-2.5 pl-3 border-l border-border">
        <div id="personaavatar" class="h-9 w-9 rounded-full grid place-items-center text-xs font-bold text-white bg-primary"></div>
        <div class="leading-tight hidden md:block"><div class="text-sm font-semibold" id="personaname"></div><div class="text-xs text-muted-foreground" id="personarole"></div></div>
      </div>
    </header>`;
const BRAND = `
    <!-- 65px, matching HDR's h-16+border EXACTLY, so the rail's bottom rule and the header's read as
         one continuous line across the boundary. Reached by padding, not a height: box-sizing here is
         content-box, so the old min-h-16 set the CONTENT to 64px and the block measured 64+24+1=89 —
         24px taller than the header, with 28px of dead space under a 36px avatar. That space is also
         why the wordmark read as top-aligned: items-start pinned both children to the top of a box far
         taller than either needed. items-center + py-3.5 (14px) gives 36+28+1=65 and centres the name
         on the mark. Change the padding, not the height, if this ever needs to move again.
         2026-08-13 — border-sidebar-border → border-gray-3, on request, to match HDR's own border
         fix. This border is deliberately the SAME colour as HDR's: the comment above already says
         the two rules read as one continuous line across the sidebar/content boundary, so the two
         borders drifting to different colours the moment one of them changed would have broken
         exactly the thing this block was built to guarantee. rail-dark's .replace() below is kept in
         lockstep with whatever this literal currently is.
         2026-08-13, later same day — border-gray-3 → border-gray-2, on request; see HDR's own note
         for why (gray-2 is the "dividers on white" role). Still the same colour as HDR's — updated
         together again, rail-dark's .replace() updated again too. -->
    <div class="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-2">
      <div class="h-9 w-9 shrink-0 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-sm shadow-sm">@APP_MARK</div>
      <!-- NAME ONLY — no @APP_SUB. The tagline was a sentence of marketing copy pinned above the nav
           on every screen: read once, then permanent furniture, and the longest ones wrapped to three
           lines and pushed the whole rail down. A wordmark identifies; it does not pitch. The app's
           description still lives in app-spec.json for anything that needs it. -->
      <div class="min-w-0"><div class="font-semibold leading-snug font-display break-words" title="@APP_TITLE">@APP_TITLE</div></div>
    </div>`;
// space-y-1.5, not space-y-1: the rows are pills now, and pills need air between them or the rail
// reads as one segmented control rather than a list of destinations.
const SIDENAV = `<nav id="sidenav" class="flex-1 overflow-y-auto p-3 space-y-1.5 text-sm"></nav>`;
const MAIN = (extra = "") => `<main class="flex-1 min-w-0 p-6 lg:p-8 ${extra}"><!-- @ROLE_SECTIONS --></main>`;

// The content column shared by rail-left/rail-dark/rail-right: header + main, everything right of
// the sidebar. 2026-08-13 — bg-gray-1 added on request, verified live in DevTools first (a real
// build's command-center page) before landing here: the body-level --color-canvas fix (emitHead's
// base layer) is correct but indirect — on these three archetypes the sidebar+column flex row fills
// the entire viewport, so body's background never actually shows through anywhere on them; whatever
// paints the content area has to be on this div. bg-gray-1 (#F6F6F8) reads as the same "very light
// gray ground" as --color-canvas (#F4F4F7, one step darker) — either token was fair game here, this
// is the one confirmed against the live render. HDR keeps its own bg-surface, so the header still
// reads as a distinct band above it, same as before.
const CONTENT_COL = `<div class="flex-1 min-w-0 flex flex-col bg-gray-1">${HDR}${MAIN()}</div>`;

// 2026-08-13 — the rail's border-r → --shadow-sidebar, on request. Not a new decision: the real
// starter kit already made this exact call (starter/src/index.css's .sidebar, "2026-08-13,
// superseding the line this comment used to quote... the sidebar is no longer the shell's one
// exception — every panel, including this one, now separates by shadow") — this just brings the
// prototype pipeline in line with what the real component already does.
// FIRST ATTEMPT was `style="box-shadow: var(--shadow-sidebar)"` — wrong, and worth recording why:
// --shadow-* lives in @theme inline (see tokens.css's own note on that split), and this CDN runtime
// only emits an @theme inline custom property onto :root for names an actual utility CLASS in the
// scanned markup references. Nothing here ever wrote the class "shadow-sidebar", so the JIT never
// emitted the variable at all — getComputedStyle(...).getPropertyValue('--shadow-sidebar') came back
// completely empty, not just frozen-wrong like the @theme inline bug found earlier this session.
// Fixed the same way every other --shadow-* token in this codebase is consumed: as the utility class
// (shadow-card, shadow-panel, …), never via var(). shadow-sidebar below is that class, not a style.
export const SHELL_ARCHETYPES = {
  // classic left rail, light — the current look
  "rail-left": () => `<div class="flex min-h-screen">
  <!-- 2026-08-13 — footer divider border-sidebar-border → border-gray-2, on request: verified live
       in DevTools first (on a real build), consistent with the header/BRAND borders' own
       border-gray-3 fix landing on gray-* rather than the sidebar-border role. -->
  <aside class="rail w-60 shrink-0 bg-sidebar text-foreground flex flex-col shadow-sidebar">${BRAND}${SIDENAV}<div class="p-4 border-t border-gray-2 text-xs text-muted-foreground">Clickable prototype</div></aside>
  ${CONTENT_COL}
</div>`,
  // dark brand rail — premium / finance / enterprise
  // 2026-08-13 — style="background:hsl(var(--sidebar-dark, var(--sidebar-foreground)))" → the
  // bg-sidebar-foreground utility class, on request: --sidebar-dark was never defined anywhere in
  // the pipeline (a phantom fallback argument) and --sidebar-foreground, though textually declared
  // right in this app's own shell.html, sits inside an @theme inline block — the CDN JIT never
  // emits an @theme inline custom property onto :root unless an actual utility class using it is
  // scanned in the markup, and nothing here ever wrote such a class. Verified live: both names came
  // back empty from getComputedStyle, the whole `background:` declaration was invalid, and the rail
  // rendered fully transparent — white text over the page's own light canvas underneath it (a real
  // build, 2026-08-13). --color-sidebar-foreground (this same colour) already has a working, JIT-safe path:
  // it's read via the bg-/text-sidebar-foreground utility classes the LIGHT rail-left archetype
  // already proves out just below. Same fix already landed once this session for --shadow-sidebar,
  // right above this line — the underlying rule ("read an @theme inline token through its utility
  // class, never through a bare var() in an inline style") just hadn't been generalized yet.
  // TOKENS, not chrome of its own. This template used to paint the rail itself: bg-sidebar-foreground
  // (a TEXT token misused as the fill — that's where the un-themeable near-black came from) plus
  // text-white / border-white/10 literals, while the design slice's own sidebar set — the thing
  // kf-design-director actually decides — went entirely unread. The layout is the design agent's
  // decision, and so is the rail's colour: read the sidebar family and nothing else, so a tone or
  // hue change in the slice reaches the rail without touching this file (a real build, 2026-08-16).
  "rail-dark": () => `<div class="flex min-h-screen">
  <aside class="rail w-60 shrink-0 flex flex-col text-sidebar-foreground shadow-sidebar bg-sidebar">${BRAND.replace("border-gray-2", "border-sidebar-border").replace("text-muted-foreground", "text-sidebar-muted")}<nav id="sidenav" class="flex-1 overflow-y-auto p-3 space-y-1 text-sm"></nav><div class="p-4 border-t border-sidebar-border text-xs text-sidebar-muted">Clickable prototype</div></aside>
  ${CONTENT_COL}
</div>`,
  // top bar (no side rail) — consumer / marketing / lightweight tools
  "top-bar": () => `<div class="min-h-screen flex flex-col">
  <header class="h-16 shrink-0 border-b border-border bg-card flex items-center gap-4 px-6 sticky top-0 z-30">
    <div class="flex items-center gap-2.5"><div class="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-sm">@APP_MARK</div><div class="font-semibold font-display">@APP_TITLE</div></div>
    <nav id="sidenav" class="ml-6 hidden md:flex items-center gap-1 text-sm"></nav>
    <div class="ml-auto flex items-center gap-2" id="roleswitch"><span class="text-xs font-semibold text-muted-foreground">Viewing as</span><select id="roleselect" class="h-9 rounded-lg border border-border bg-card px-3 text-sm font-semibold font-sans"></select></div>
    <div class="flex items-center gap-2.5 pl-3 border-l border-border"><div id="personaavatar" class="h-9 w-9 rounded-full grid place-items-center text-xs font-bold text-white bg-primary"></div><div class="leading-tight hidden md:block"><div class="text-sm font-semibold" id="personaname"></div><div class="text-xs text-muted-foreground" id="personarole"></div></div></div>
    <span id="crumb" class="hidden"></span><h1 id="pagetitle" class="hidden"></h1>
  </header>
  ${MAIN("max-w-[1400px] w-full mx-auto")}
</div>`,
  // rail + right context panel — ops / clinical / review-heavy
  "rail-right": () => `<div class="flex min-h-screen">
  <aside class="rail w-60 shrink-0 bg-sidebar text-foreground flex flex-col shadow-sidebar">${BRAND}${SIDENAV}</aside>
  ${CONTENT_COL}
  <aside class="w-80 shrink-0 border-l border-border bg-card/60 hidden xl:flex flex-col p-5 gap-4"><div class="text-sm font-semibold text-muted-foreground">Activity</div><div class="text-xs text-muted-foreground">Context panel — recent items and quick actions render here per role.</div></aside>
</div>`,
  // hero band — a container learned from a real build's source design (2026-08-07): the whole app is a rounded canvas
  // floating on the page, topped by a tall gradient-wash band that carries the brand as a frosted
  // pill, a display-size page title under a mono eyebrow, and the persona/switcher chips. The
  // sidebar floats as its own card on the canvas rather than running edge-to-edge. Built for anchors
  // with gradient tokens (--grad-hero paints the band; a card fallback keeps it legible without).
  // Same runtime contract as every archetype: #sidenav #roleselect #pagetitle #crumb #persona*.
  // 2026-08-13 — style="background:hsl(var(--muted))" → the bg-muted utility class, defensively:
  // found alongside the --sidebar-dark bug in the same audit. --muted has no fallback argument at
  // all (unlike --grad-hero/--grad-brand just below, which are fine — see language-catalog.mjs,
  // deliberately gated to gradient-carrying anchors, with a real fallback for anchors that have
  // none), so on the same @theme inline JIT-emission gate this would resolve to hsl() with an empty
  // argument — invalid CSS, fully transparent, same failure shape as the sidebar bug. No live app
  // currently selects hero-band to prove this out on screen, but the fix costs nothing and matches
  // the one proven-working pattern (a real utility class, never a bare var() in an inline style).
  "hero-band": () => `<div class="min-h-screen p-4 md:p-6">
  <div class="mx-auto max-w-[1500px] rounded-[22px] overflow-hidden flex flex-col shadow-2xl bg-muted">
    <div style="background:var(--grad-hero, hsl(var(--card)))" class="px-6 pt-4 pb-7">
      <div class="flex items-center gap-3.5 flex-wrap">
        <div class="frost flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4">
          <div class="h-8 w-8 rounded-lg grid place-items-center font-black text-[12px] text-primary-foreground" style="background:var(--grad-brand, var(--color-primary))">@APP_MARK</div>
          <div class="leading-tight"><div class="text-[13.5px] font-bold">@APP_TITLE</div></div>
        </div>
        <!-- role switcher AS THE SOURCE DRAWS IT: a frosted chip group with a dot per role (active =
             white chip, colored dot). The <select> stays for the runtime contract but hidden; chips
             drive switchRole. Persona name/role live in the hero eyebrow per the source, so the text
             block here is contract-only; the avatar joins an overlapping team stack. -->
        <div class="ml-auto flex items-center gap-1 frost rounded-full p-1" id="rolechips"></div>
        <select id="roleselect" class="hidden"></select>
        <div class="flex items-center" id="personastack">
          <div id="personaavatar" class="h-[30px] w-[30px] rounded-full grid place-items-center text-[11px] font-bold text-white bg-primary ring-2 ring-white/90 relative z-10"></div>
        </div>
        <!-- per-role primary action (the source's black 'New change' pill) — from template.hero-cta -->
        <div id="heroctaslot"></div>
        <div class="hidden"><span id="personaname"></span><span id="personarole"></span></div>
      </div>
      <div class="flex items-end gap-5 pt-7 pb-1">
        <div class="frost hidden sm:grid h-[52px] w-[52px] rounded-full place-items-center text-lg text-muted-foreground">@APP_MARK</div>
        <div class="min-w-0">
          <!-- Empty, not @APP_TITLE. The switcher below writes "ROLE · PERSONA" in here the moment it
               runs, so the app name was only ever a pre-hydration flash — one frame of a name this
               band never keeps. Seeding it cost a visible flicker and said nothing the sidebar
               wordmark does not. Unlike the rail-left header this crumb IS shown; it just belongs to
               the role, not the app. -->
          <div class="eyebrow mb-1" id="crumb"></div>
          <div class="flex items-baseline gap-3.5 flex-wrap">
            <h1 class="font-display font-bold tracking-tight leading-none text-[clamp(28px,3.5vw,44px)]" id="pagetitle">Home</h1>
            <!-- the source's inline headline figure ("Register 16 requirements tracked") — template.hero-fig -->
            <div id="herofig" class="flex items-baseline gap-2.5"></div>
          </div>
        </div>
        <div class="flex-1"></div>
        <!-- the source's right-of-title stat clusters (REGISTER · COVERAGE · STATUS) — template.hero-side -->
        <div id="herosideslot" class="hidden lg:flex items-center gap-7 pb-1.5"></div>
      </div>
      <!-- per-role band content — filled from the active role part's <template class="hero"> (headline
           figures, SLA/status meters); empty and collapsed when a role carries none -->
      <div id="heroslot"></div>
    </div>
    <div class="flex-1 min-h-0 flex items-stretch">
      <!-- FLUSH rail, not a floating card (corrected against the source 2026-08-07: the design's
           sidebar is #f1efeb putty with a hairline border-right, edge-to-edge under the band —
           reviewer caught the invented gap + white card immediately) -->
      <aside class="rail w-[236px] shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar text-foreground p-3.5">${SIDENAV}
        <!-- the source's register-health footer (segmented mini-bar + counts) — template.side-foot -->
        <div id="sidefootslot" class="border-t border-sidebar-border mt-2 pt-3 px-2 empty:hidden"></div>
        <div class="mt-2 border-t border-sidebar-border pt-3 px-2 pb-1 flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-success"></span><span class="text-xs text-muted-foreground">Clickable prototype</span></div>
      </aside>
      <main class="flex-1 min-w-0 p-6"><!-- @ROLE_SECTIONS --></main>
    </div>
  </div>
</div>`,
};

// Full prototype shell for an app from its DesignLanguage. `meta` = {appTitle, appMark, appSub}.
// Keeps the SAME markers/ids the assembler + switcher expect, so parts + seed splice unchanged.
// opts.roles = ["fm","ops",…] → emits ONE `<section class="roleview" id="rv-<slug>"><!-- @PART:role-<slug> --></section>`
// per role (the proto-assemble.mjs contract), replacing the bare <!-- @ROLE_SECTIONS --> marker.
export function buildShell(dl = {}, meta = {}, opts = {}) {
  const arch = (dl.shell && dl.shell.archetype) || "rail-left";
  const bodyFn = SHELL_ARCHETYPES[arch] || SHELL_ARCHETYPES["rail-left"];
  // 2026-08-13 — #kitpopup's own visible chrome (rounded-lg/border/bg-card/shadow-2xl/p-6)
  // removed, on request. The real kit/Overlay.jsx Modal has exactly ONE element with visible
  // card styling — the role="dialog" panel itself ("rounded-lg shadow-overlay p-7 ... bg-surface",
  // Overlay.jsx:139) — its OUTER wrapper is bare positioning only ("fixed inset-0 z-50 flex
  // items-center justify-center p-6", Overlay.jsx:124), no border/shadow/bg of its own. Every
  // openXForm() in a generated app already builds that same real dialog-panel chrome correctly
  // (verified against source) — #kitpopup having its OWN separate card chrome on top of that was
  // never in the source at all, and stacks two visible "cards" on every single modal in the app:
  // an outer ~560px box (kitpopup's old bg-card/border/shadow) with the real dialog's OWN
  // rounded/shadowed/padded panel floating inside it, ~37-73px of the outer box's own edge
  // visible as a second frame around it (both happen to be white, so it read as a faint double-
  // border "halo" rather than two contrasting boxes, but the extra box was there regardless —
  // found live via getBoundingClientRect on #kitpopup vs its own [role="dialog"] child). #kitpopup
  // keeps ONLY what the real Modal's outer wrapper keeps: position, max size, scroll — no surface.
  const OVERLAYS = `
<div id="kitoverlay" class="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px] hidden" onclick="if(event.target===this)closePopup()"><div id="kitpopup" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,92vw)] max-h-[85vh] overflow-y-auto [&>*]:max-w-full [&>*]:box-border"></div></div>
<!-- [&>*]:max-w-full is LOAD-BEARING, not defensive styling: a dialog panel's width is otherwise
     free to exceed this 560px box whenever any inner row is unbreakable (whitespace-nowrap chips, a
     mono vitals timestamp) — min-content wins over the containing block and the panel's right edge
     clips out of view (measured live: panel 616px inside the 560px box, Close button half-gone,
     a real build's detail dialog, 2026-08-16). Bounding the panel here means unbreakable
     content scrolls INSIDE the panel's own overflow-auto instead of escaping the box — enforced for
     every part's dialog structurally, not by each agent remembering a class. -->

<div id="kittoast" class="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 shadow-lg text-sm font-medium opacity-0 translate-y-2 transition pointer-events-none"><span class="h-5 w-5 rounded-full grid place-items-center text-[10px]" style="background: var(--tone-success-bg); color: var(--tone-success-fg)">✓</span><span id="kittoastmsg">Saved</span></div>`;
  // RUNTIME: the role-switcher + popup/toast helpers every prototype needs. This must ship in EVERY
  // generated shell — omitting it renders chrome with no content (nav/role select empty, roleviews
  // never activated; caught converting a real build's page 2026-07-25).
  const RUNTIME = `
/* ICON(name, cls) — the shell's own icon set. The nav renderer and most kit recipes call it, but
   nothing defined it: when no part happened to, nav items rendered label-only and icon tiles came out
   empty. The container owns its chrome, so it ships here. Unknown names degrade to a neutral dot. */
window.ICON = (function () {
  const P = {
    gauge: '<path d="M12 14 8.5 9.5"/><circle cx="12" cy="14" r="1.5"/><path d="M20 18a9 9 0 1 0-16 0"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    inbox: '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M4 4h16l1 8v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    trend: '<path d="m3 16 5-5 4 3 7-7"/><path d="M17 7h3v3"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 8.5a3 3 0 0 1 0 6M18.5 20a6 6 0 0 0-3-5.2"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h3a1 1 0 0 1 1 1v11M8 7h4M8 11h4M8 15h4"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    truck: '<path d="M3 16V6h11v10"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    ship: '<path d="M3 15l2-5h14l2 5"/><path d="M12 4v6M6 15v5h12v-5"/>',
    wrench: '<path d="M15 4a4.5 4.5 0 0 0 5 7l-9 9-3-3 9-9a4.5 4.5 0 0 1-2-4z"/>',
    file: '<path d="M14 3v5h5"/><path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>',
    folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
    flag: '<path d="M5 21V4h9l-1 3h6l-1.5 5H12l1 3H5"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5h.01"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    money: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.5 9.5h5M9.5 14h5"/>',
    cart: '<circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/><path d="M3 4h2l2.5 10h10L20 7H6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    dot: '<circle cx="12" cy="12" r="3.5"/>'
  };
  const ALIAS = { dashboard: "gauge", overview: "gauge", queue: "inbox", approvals: "check", tasks: "check",
    reports: "chart", analytics: "chart", directory: "users", roster: "users", people: "users", team: "users",
    vessels: "ship", fleet: "ship", assets: "box", inventory: "box", orders: "file", requests: "inbox",
    invoices: "file", documents: "file", schedule: "calendar", maintenance: "wrench", work: "wrench",
    vendors: "building", suppliers: "building", sites: "pin", campus: "building", finance: "money",
    payments: "money", risk: "alert", compliance: "shield", audit: "shield", catalog: "cart", create: "plus" };
  return function (name, cls) {
    const k = String(name || "").toLowerCase().replace(/[^a-z]/g, "");
    const d = P[k] || P[ALIAS[k]] || P.dot;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="' + (cls || "h-4 w-4") + '" aria-hidden="true">' + d + '</svg>';
  };
})();
(function () {
  const nav = document.getElementById("sidenav");
  window.switchRole = function (slug) {
    slug = String(slug).toLowerCase();
    const R = window.ROLES.find((r) => r.slug === slug) || window.ROLES[0];
    window.__kfRole = R.slug;   // remembered so the deferred first paint below re-renders THIS role
    document.querySelectorAll(".roleview").forEach((v) => v.classList.toggle("active", v.id === "rv-" + R.slug));
    const rsel0 = document.getElementById("roleselect"); if (rsel0) rsel0.value = R.slug;
    const pn = document.getElementById("personaname"); if (pn) pn.textContent = R.persona.name;
    const pr = document.getElementById("personarole"); if (pr) pr.textContent = R.persona.role;
    const av = document.getElementById("personaavatar"); if (av) { av.textContent = R.persona.initials; av.style.background = R.persona.color; }
    document.getElementById("pagetitle").textContent = R.title;
    // HERO SLOT (hero-band archetype): a role part may carry <template class="hero"> — headline
    // figures / status meters that belong IN the gradient band, not in the page body (the source
    // design's band shows "In flight 10" + an SLA meter per role). Copied on role switch; roles
    // without the template leave the band clean. No-op for archetypes without #heroslot.
    const hs = document.getElementById("heroslot");
    if (hs) { const ht = document.querySelector("#rv-" + R.slug + " template.hero"); hs.innerHTML = ht ? ht.innerHTML : ""; }
    // Same slot mechanism for the band's other zones (source anatomy): the inline headline figure
    // beside the title, the right-of-title stat clusters, the top-bar primary-action pill, and the
    // sidebar health footer. A role without a given template leaves that zone empty/collapsed.
    for (const [slotId, tpl] of [["herofig", "hero-fig"], ["herosideslot", "hero-side"], ["heroctaslot", "hero-cta"], ["sidefootslot", "side-foot"]]) {
      const slot = document.getElementById(slotId);
      if (!slot) continue;
      const t = document.querySelector("#rv-" + R.slug + " template." + tpl);
      slot.innerHTML = t ? t.innerHTML : "";
    }
    // HERO-BAND CHROME, per the source: the eyebrow reads "ROLE · PERSONA" for the active role
    // (uppercase role name, then the persona's name), the switcher is a frosted chip group with a dot per role
    // (active = white chip, colored dot), and the persona avatar leads an overlapping team stack of
    // the other roles' personas. All gated on #rolechips so every other archetype is untouched.
    const chips = document.getElementById("rolechips");
    if (chips) {
      const crumbEl = document.getElementById("crumb");
      if (crumbEl) crumbEl.textContent = R.name + " · " + R.persona.name;
      chips.innerHTML = window.ROLES.map((r) => {
        const on = r.slug === R.slug;
        // --color-muted-foreground fixed alongside --color-primary above: same bare-name gap
        // (tokens.css never defines bare --muted-foreground either — only --color-muted-foreground),
        // and the same double-hsl() mistake would have followed it here otherwise.
        return \`<button data-chip="\${r.slug}" class="flex items-center gap-2 h-8 px-3.5 rounded-full text-[12.5px] transition \${on ? "bg-card font-bold text-foreground shadow-sm" : "font-semibold text-muted-foreground hover:text-foreground"}"><span class="h-1.5 w-1.5 rounded-full" style="background:\${on ? "var(--color-primary)" : "var(--color-muted-foreground)"}"></span>\${r.name}</button>\`;
      }).join("");
      chips.querySelectorAll("[data-chip]").forEach((b) => b.addEventListener("click", () => window.switchRole(b.dataset.chip)));
      const stack = document.getElementById("personastack");
      if (stack) {
        stack.querySelectorAll("[data-stackmate]").forEach((x) => x.remove());
        const mates = window.ROLES.filter((r) => r.slug !== R.slug).slice(0, 2);
        const extra = window.ROLES.length - 1 - mates.length;
        stack.insertAdjacentHTML("beforeend",
          mates.map((r) => \`<div data-stackmate class="h-[30px] w-[30px] rounded-full grid place-items-center text-[10px] font-bold -ml-2 ring-2 ring-white/90 bg-card text-muted-foreground">\${r.persona.initials}</div>\`).join("") +
          (extra > 0 ? \`<div data-stackmate class="h-[30px] w-[30px] rounded-full grid place-items-center text-[10px] font-bold -ml-2 ring-2 ring-white/90 bg-card/70 text-muted-foreground">+\${extra}</div>\` : ""));
      }
    }
    // STATE HOOKS, not utilities. These used to be class strings built from bg-sidebar-accent /
    // text-sidebar-muted — names the token contract does not mint, so under v4 they compiled to
    // nothing and the active row was indistinguishable from the rest. The look now lives in the
    // shell's own .navitem rules, written in the tokens that starter's .nav-item.active falls back
    // to, so the prototype rail and the built rail render alike.
    //
    // The old comment here argued for sidebar-accent over primary so a brand-tone rail would not
    // hide its own active item. That concern is preserved, not dropped: .navitem.active fills with
    // --secondary, which is a neutral step off whatever the rail is, never the brand colour.
    //
    // Toggled with classList, NOT className.replace(). The replace() version silently broke every nav
    // click: "active" is a SUBSTRING of "inactive", so replace("active","inactive") matched inside the
    // word it was meant to leave alone (in|active) and produced "ininactive" — then
    // replace("inactive","active") hit that inner copy and yielded "inactive" again, so the item the
    // user clicked landed on inactive and NOTHING was ever styled active. Measured live: one click
    // gave ininactive, two gave inininactive — the string grew on every navigation while the rail
    // showed no selection at all. classList is token-based, so it cannot repeat this class of defect.
    const NAV_ON = "active", NAV_OFF = "inactive";
    // 2026-08-13 — the "R.name workspace" eyebrow above the nav list removed, on request.
    // R.name is this app's own role field (e.g. "Operations Manager"), not a placeholder, so this
    // wasn't dead copy — it just wasn't wanted here. nav.innerHTML is now the nav item list alone.
    nav.innerHTML =
      R.nav.map((n, i) => \`<a href="#" data-nav="\${n.id}" class="navitem flex items-center gap-2.5 px-3.5 py-2.5 font-medium \${i === 0 ? NAV_ON : NAV_OFF}">\${window.ICON && n.icon ? ICON(n.icon, "h-4 w-4 shrink-0") : \`<i class="navdot"></i>\`}<span class="flex-1 min-w-0">\${n.label}</span>\${n.badge != null ? \`<span class="navbadge font-mono">\${n.badge}</span>\` : ""}</a>\`).join("");
    const showPage = (navId) => {
      document.getElementById("rv-" + R.slug).querySelectorAll("[data-page]").forEach((p) => p.classList.toggle("hidden", p.dataset.page !== navId));
      const n = R.nav.find((x) => x.id === navId);
      document.getElementById("pagetitle").textContent = (n && n.label) || R.title;
      if (window.PAGES && window.PAGES[navId]) window.PAGES[navId]();
    };
    nav.querySelectorAll("[data-nav]").forEach((a) => a.addEventListener("click", (ev) => { ev.preventDefault();
      nav.querySelectorAll(".navitem").forEach((x) => { x.classList.remove(NAV_ON); x.classList.add(NAV_OFF); });
      a.classList.remove(NAV_OFF); a.classList.add(NAV_ON);
      showPage(a.dataset.nav);
    }));
    showPage(R.nav[0].id);
    if (window.onRoleChange) window.onRoleChange(R.slug);
  };
  const rsel = document.getElementById("roleselect");
  rsel.innerHTML = window.ROLES.map((r) => \`<option value="\${r.slug}">\${r.name}</option>\`).join("");
  rsel.addEventListener("change", () => switchRole(rsel.value));
  // FIRST PAINT MUST WAIT FOR THE PARTS. The assembler defers every part <script> to the end of
  // <body>, so at the moment this shell script runs \`window.PAGES\` is still undefined — booting
  // here would toggle the landing page visible and then skip its render function, leaving a
  // correctly-themed page with an empty body. Parts are inline scripts, so DOMContentLoaded is
  // guaranteed to fire after all of them have registered.
  // Boot the role someone ALREADY chose, not always ROLES[0]: capture-screens.mjs drives a specific
  // role by injecting \`switchRole(slug)\` at the very end of the body, which still runs
  // pre-DOMContentLoaded — an unconditional ROLES[0] here would silently screenshot the wrong role
  // for every role but the first. (Keep the literal closing-body-tag sequence out of this comment:
  // the HTML parser ends the shell <script> at it and the verifier then sees a truncated program.)
  const boot = () => switchRole(window.__kfRole || window.ROLES[0].slug);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
window.openPopup = function (html) { document.getElementById("kitpopup").innerHTML = html; document.getElementById("kitoverlay").classList.remove("hidden"); };
window.closePopup = function () { document.getElementById("kitoverlay").classList.add("hidden"); };
window.showToast = function (msg) {
  const t = document.getElementById("kittoast"); document.getElementById("kittoastmsg").textContent = msg || "Saved";
  t.classList.remove("opacity-0", "translate-y-2"); clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => t.classList.add("opacity-0", "translate-y-2"), 2600);
};`;
  // `data-theme` no longer selects anything — Beacon is the contract's bare `:root`, so there is no
  // `[data-theme="…"]` block left to activate. Stamped anyway for parity with the built app's
  // index.html (theme-from-design.mjs's setLanguageAttribute does the same, for the same reason:
  // harmless, and cheaper to keep than to thread a "don't bother" flag through every caller).
  const language = pickLanguage(dl);
  const html = `<!DOCTYPE html>
<html lang="en" data-theme="${language}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>@APP_TITLE — Prototype</title>
${emitHead(dl)}
</head>
<body>
${bodyFn()}
${OVERLAYS}
<script>
/* ── SEED + helpers (injected per app) ── */
<!-- @PART:seed -->
${RUNTIME}
</script>
</body></html>`;
  let out = html;
  if (Array.isArray(opts.roles) && opts.roles.length) {
    const sections = opts.roles
      .map((r) => `<section class="roleview" id="rv-${r}"><!-- @PART:role-${r} --></section>`)
      .join("\n      ");
    out = out.replace("<!-- @ROLE_SECTIONS -->", () => sections);
  }
  // window.ROLES — the shell's own boot code reads it in three places (switchRole, the role
  // <select>, and boot()), but nothing ever WROTE it: every prototype rendered a chrome-only blank
  // page with an empty role switcher, and proto-verify passed them all because each role part was
  // individually well-formed. Found 2026-08-02 after three shipped builds were silently blank.
  // Emitted from the experience spec so nav labels/icons and personas survive into the runtime.
  if (Array.isArray(opts.roleData) && opts.roleData.length) {
    const roles = opts.roleData.map((r) => {
      const name = r.role || r.name || r.slug;
      // switchRole reads persona.name/.role/.initials/.color UNCONDITIONALLY — a null persona threw
      // mid-switch before the nav was populated, and EVERY role rendered as a blank sidebar with all
      // pages stacked (a real build, 2026-08-16: no spec role carries a persona; only hand-built shells
      // ever did). Synthesize a neutral one from the role's own name — no invented people.
      const persona = r.persona || {
        name, role: name,
        initials: (String(name).match(/[A-Za-z0-9]+/g) || ["?"]).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
        color: `hsl(${[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0)} 55% 42%)`,
      };
      return {
        slug: r.slug, name, title: r.title || name,
        landing: r.landing || (r.nav && r.nav[0] && r.nav[0].page) || null,
        persona,
        nav: (r.nav || []).map((n) => ({ id: n.page || n.id, label: n.label || n.page || n.id, icon: n.icon || "dot" })),
      };
    });
    out = out.replace("</head>", `<script>window.ROLES=${JSON.stringify(roles)};</script>\n</head>`);
  }
  return out
    .replace(/@APP_TITLE/g, meta.appTitle || dl.name || "App")
    .replace(/@APP_MARK/g, meta.appMark || (meta.appTitle || "A").slice(0, 2).toUpperCase())
    .replace(/@APP_SUB/g, meta.appSub || "");
}

// ── CLI: `node design-language.mjs shell <experience-spec.json> [--out <file>] [--roles a,b,c]` ──
// The pipeline's Shell stage calls this INSTEAD of instantiating proto-kit/shadcn-shell.html.
// Design slice: spec.design (written by kf-design-director). FALLBACK when absent — the pipeline
// must never break on an old spec: derive the design from the (now one-entry) catalog
// (language-catalog.mjs), the same source kf-design-director itself picks from. Used to rank the
// catalog by the app's domain words to choose an anchor; retired 2026-08-12 along with
// `rankLanguages` itself — there is only one entry to choose now, so the words are unused here (the
// per-app ACCENT — hue, density, archetype — is still driven by the spec, just not by this fallback,
// which only fires when the spec carries no design slice at all).
// Role slugs: --roles wins; else spec.roles[].slug; else the `<slug>-` prefix of each role's landing id.
async function cliShell(argv) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const specPath = argv[0];
  if (!specPath) { console.error("usage: design-language.mjs shell <experience-spec.json> [--out shell.html] [--roles a,b,c]"); process.exit(2); }
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const appName = typeof spec.app === "string" ? spec.app : (spec.app && spec.app.name) || spec.domain || "App";
  let design = spec.design;
  // How the language got decided, captured from the INPUTS. It cannot be read back off `design`:
  // toDesignLanguage bakes `language` into its output, so `languageDecision(design)` always answers
  // "explicit" and the fallback warning silently stops firing — which it did, the first time this
  // was written that way.
  let decideFrom = null;
  if (!design || !design.palette) {
    const { loadLanguages, toDesignLanguage } = await import("./language-catalog.mjs");
    const anchor = loadLanguages()[0];   // the one entry — "beacon"
    design = toDesignLanguage(anchor, { appId: appName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), appName });
    design.paletteId = anchor.id;
    design.rationale = `FALLBACK (no design slice in spec): using '${anchor.id}', the only design language.`;
    console.error(`no design slice — fallback derived: anchor=${anchor.id}`);
    decideFrom = { anchorId: anchor.id, shape: design.shape };   // no `language` key — the inputs
  } else {
    decideFrom = design;                                          // the spec named it; that IS explicit
  }
  // Print how the language was decided BEFORE the shell is written, so a spec naming a retired
  // language is visible at build time rather than discovered later by reading the emitted CSS. Once
  // per build: pickLanguage is called three more times downstream and must stay silent.
  const decision = languageDecision(decideFrom);
  const notice = languageNotice(decideFrom);
  if (notice) console.error(notice);
  const slugOf = (r) => r.slug || String(r.landing || r.role || "").split("-")[0].toLowerCase();
  const roles = flag("--roles") ? flag("--roles").split(",").map((x) => x.trim()).filter(Boolean)
    : [...new Set((spec.roles || []).map(slugOf).filter(Boolean))];
  const appTitle = appName || design.name || "App";
  const html = buildShell(design, {
    appTitle,
    // Initials from WORDS THAT ARE WORDS. Splitting on whitespace and taking the first character of
    // each let punctuation through, so a real build's title containing " & " produced a three-char
    // mark ending in "&" — an ampersand rendered as if it meant something. Two letters read better than three at 36px anyway.
    appMark: (appTitle.match(/[A-Za-z0-9]+/g) || ["A"]).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
    appSub: (spec.meta && spec.meta.tagline) || design.rationale?.split(";")[0]?.slice(0, 48) || "",
  }, { roles, roleData: roles.map((slug) => {
    // Match a requested slug back to its spec role by CONTAINMENT, not by slugOf equality: slugOf
    // keeps only the first hyphen segment, so "front-desk-home" → "front" and "site-administrator-
    // home" → "site" — neither equals the "front-desk"/"admin" the conductor passed, and every
    // multi-word role was silently dropped from window.ROLES while its <section> still rendered.
    // The switcher simply could not reach 3 of a real build's 7 roles, and nothing said so.
    const kebab = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const r = (spec.roles || []).find((r) =>
      slugOf(r) === slug || kebab(r.slug) === slug ||
      kebab(r.landing).startsWith(slug + "-") ||
      kebab(r.role || r.name).includes(slug));
    if (!r) console.error(`⚠ --roles '${slug}' matches no role in the spec — it will render a section but be UNREACHABLE from the role switcher`);
    return r ? { ...r, slug } : null;
  }).filter(Boolean) });
  const out = flag("--out") || specPath.replace(/[^/]+$/, "shell-base.html");
  writeFileSync(out, html);
  console.log(`shell → ${out} · palette=${design.paletteId || "custom"} language=${decision.language}(${decision.source}) archetype=${(design.shell || {}).archetype || "rail-left"} roles=[${roles.join(",")}]`);
}
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain && process.argv[2] === "shell") cliShell(process.argv.slice(3));
