// lint-shell.mjs — fail when the prototype shell names a colour the token contract does not mint,
// or a local class nothing styles.
//
//   node engine/lint-shell.mjs            # all archetypes
//   node engine/lint-shell.mjs --verbose  # also print the per-archetype token counts
//
// WHY THIS EXISTS. The shell used to run on the Tailwind v3 play CDN with a hand-built
// `tailwind.config`, so it could name `bg-sidebar-accent` and `text-sidebar-muted` and have them
// work. The catalog and the built app run on the v4 contract in starter/src/tokens.css, which mints
// neither. When the shell moved onto that contract those classes did not error — **v4 emits nothing
// for a name it does not know**, so the active nav row simply stopped being distinguishable from
// the rest and the page still looked like a page. Measured at the time: 10 of the shell's 179 class
// tokens resolved to nothing.
//
// That is the failure this gate catches: a class that references a THEME NAME the contract does not
// define. It is the one that has actually happened, twice, and it is invisible on screen because the
// result is a plausible-looking page rather than a broken one.
//
// WHAT THIS GATE DOES NOT CATCH, and you should not believe it does: whether a core utility that
// EXISTS in both majors still means the same thing. `shadow-sm` compiles under v3 and v4 and is a
// different shadow in each unless the contract mints `--shadow-sm` (it does). A bare `backdrop-blur`
// is blur(8px) in v3 and nothing in v4. Those need a real browser, because Tailwind itself is the
// only honest oracle. The harness for that lives in the proposal and is run by hand — see
// VERIFYING BY BROWSER at the bottom of this file. No headless browser is available as a dependency
// here, and a gate that silently skipped when one was missing would be worse than none.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildShell, SHELL_ARCHETYPES } from "./design-language.mjs";
import { loadLanguages, toDesignLanguage } from "./language-catalog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = join(HERE, "proto-kit", "tokens.css");

// Utility prefixes that take a COLOUR. `text-` and `border-` also take sizes and widths, which is
// why the semantic-root test below is what decides, not the prefix alone.
const COLOUR_PREFIXES = [
  "bg", "text", "border", "ring", "fill", "stroke", "divide", "outline",
  "decoration", "accent", "caret", "placeholder", "from", "via", "to", "shadow",
];

// The contract's own vocabulary. A class whose suffix starts with one of these is making a claim
// about a design token, so it has to be minted. Anything else (`text-sm`, `border-0`, `ring-2`,
// `bg-white`) is core Tailwind and none of this module's business.
const SEMANTIC_ROOTS = [
  "foreground", "background", "card", "popover", "muted", "accent", "primary", "secondary",
  "border", "input", "ring", "sidebar", "success", "warning", "danger", "info", "destructive",
  "track", "meta", "strong", "brand", "tone", "chart", "category", "control", "field", "row",
  "chip", "tab", "kpi", "avatar", "overlay", "canvas", "elev", "scrim",
];

/** Classes that are MARKERS or STATE HOOKS — correct precisely because nothing styles them. */
const MARKERS = new Set([
  "hero",        // <template class="hero"> — a per-role slot source; templates never render
  "hero-fig", "hero-side", "hero-cta", "side-foot",   // the same, for the other band zones
  "inactive",    // the nav's resting state: `.navitem` alone already IS the inactive look, so a
                 // rule would be redundant. It exists only because className.replace() needs two
                 // non-empty strings to swap between.
]);

const stripVariants = (c) => c.replace(/^!/, "").split(":").pop().replace(/\/\d+$/, "");
const isArbitrary = (c) => c.includes("[");

function contractVocabulary() {
  const css = readFileSync(CONTRACT, "utf8");
  const utilities = new Set([...css.matchAll(/@utility\s+([a-z0-9-]+)/gi)].map((m) => m[1]));
  const theme = /@theme inline \{([\s\S]*?)\n\}/.exec(css);
  const minted = new Set(
    [...(theme ? theme[1] : "").matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));
  return { utilities, minted };
}

/** Every class token the shell can put on an element — static markup AND runtime-built markup. */
export function shellClasses(html) {
  const set = new Set();
  // Reject SCREAMING_CASE: the runtime builds nav items with `${i === 0 ? NAV_ON : NAV_OFF}`
  // inside a class attribute, so a naive scan picks the IDENTIFIERS up as if they were classes.
  const ok = (c) => /^[a-z]/i.test(c) && !c.includes("${") && !/^[A-Z][A-Z0-9_]*$/.test(c)
    && /^[a-z0-9:_./!\[\]#%()+-]+$/i.test(c);
  const take = (s) => { for (const c of String(s).split(/\s+/)) if (c && ok(c)) set.add(c); };
  const body = html.replace(/<head[\s\S]*?<\/head>/i, "");
  for (const m of body.matchAll(/class="([^"]*)"/g)) take(m[1]);
  // The switcher builds nav items, role chips and the persona stack at runtime. Those classes never
  // appear as a static attribute, and they are exactly where the sidebar-* names were hiding.
  for (const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    for (const m of s[1].matchAll(/class=\\?"([^"\\]*)/g)) take(m[1]);
    for (const m of s[1].matchAll(/\b(?:NAV_ON|NAV_OFF)\s*=\s*"([^"]*)"/g)) take(m[1]);
  }
  return set;
}

/** Selectors the shell's own <style> block defines, so local classes can be told from typos. */
function localSelectors(html) {
  const head = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html);
  const set = new Set();
  for (const m of (head ? head[1] : "").matchAll(/\.([a-z][a-z0-9_-]*)/gi)) set.add(m[1]);
  return set;
}

export function lintShell({ verbose = false } = {}) {
  const { utilities, minted } = contractVocabulary();
  const anchors = loadLanguages();
  const problems = [];
  const counts = {};

  for (const arch of Object.keys(SHELL_ARCHETYPES)) {
    // `anchors[0]` — the one entry (Beacon) since the other ten languages were retired 2026-08-12.
    // Used to be Checkpoint deliberately, for its authored gradients (the widest rule set of any
    // anchor); Beacon carries none, but `toDesignLanguage` synthesises one for `hero-band` regardless
    // (see synthGradients in language-catalog.mjs), so this archetype's gradient classes still lint.
    const dl = toDesignLanguage(anchors[0], { archetype: arch });
    const html = buildShell(dl, { appTitle: "Lint" }, { roles: ["a", "b"] });
    const classes = shellClasses(html);
    const local = localSelectors(html);
    counts[arch] = classes.size;

    for (const raw of classes) {
      const c = stripVariants(raw);
      if (isArbitrary(c) || MARKERS.has(c) || local.has(c) || utilities.has(c)) continue;

      // Bare words (`flex`, `hidden`, `uppercase`, `transition`) are core Tailwind and are NOT
      // checked. Deciding them would need the full v4 utility list, and a half-complete list would
      // report false problems on every run — which is how a gate gets muted.
      const dash = c.indexOf("-");
      if (dash < 0) continue;
      const prefix = c.slice(0, dash), suffix = c.slice(dash + 1);
      if (!COLOUR_PREFIXES.includes(prefix)) continue;
      const root = suffix.split("-")[0];
      if (!SEMANTIC_ROOTS.includes(root)) continue;          // core scale/keyword — not ours

      const wanted = prefix === "shadow" ? `--shadow-${suffix}` : `--color-${suffix}`;
      if (!minted.has(wanted)) {
        problems.push({ arch, cls: raw, why: `the contract does not mint ${wanted} — v4 emits NOTHING for this class` });
      }
    }
  }

  if (verbose) for (const [a, n] of Object.entries(counts)) console.log(`  ${a.padEnd(11)} ${n} class tokens`);

  if (!problems.length) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`lint-shell: clean — ${Object.keys(counts).length} archetypes · ${total} class tokens checked against ${utilities.size} @utility + ${minted.size} minted names`);
    return 0;
  }
  console.error(`lint-shell: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p.arch.padEnd(11)} ${p.cls.padEnd(28)} ${p.why}`);
  console.error(`\n  Either name a token the contract mints, or add it to starter/src/tokens.css`);
  console.error(`  (with provenance) and re-run \`node engine/proto-kit/sync-tokens.mjs\`.`);
  return 1;
}

// ── VERIFYING BY BROWSER ─────────────────────────────────────────────────────────────────────────
// This gate asks "does the contract mint the name". Tailwind itself is the only thing that can
// answer "did this class produce a rule", and it needs a browser. To check by hand:
//   1. render each archetype and collect `shellClasses(html)` (exported above);
//   2. write a page with the shell's own <head> plus one <div> per class token;
//   3. serve it, open it, and after the v4 build has run walk document.styleSheets collecting every
//      selectorText, then report any class whose escaped selector never appears.
// Run that way on 2026-08-09 against this shell: 175 tokens, 168 resolved, and the 7 that did not
// were all shell-local classes or documented markers — no utility dropped.

if (process.argv[1] && process.argv[1].endsWith("lint-shell.mjs")) {
  process.exit(lintShell({ verbose: process.argv.includes("--verbose") }));
}
