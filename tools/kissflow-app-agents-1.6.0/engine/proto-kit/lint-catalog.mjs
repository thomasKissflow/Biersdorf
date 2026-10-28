// lint-catalog.mjs — check every catalog snippet against the token contract.
//
// WHY. A snippet that names a class the contract does not define renders as NOTHING — no error, no
// warning, just an unstyled element. That is the worst failure mode in this system and it has
// already bitten twice: a stray closing-style tag silently truncated the whole contract, and the
// browser's own bevelled button border showed through because no rule zeroed it. Both were found by
// eye, late. A snippet that says `bg-surface-2` when the contract says `bg-card` fails the same
// silent way, and no amount of reading catches it reliably.
//
// So the class names are checked mechanically, against the contract itself rather than a hand-kept
// list: --color-* and the other @theme entries give the valid suffixes, @utility gives the valid
// bare names, and anything left over must be in the stock-Tailwind allowlist below.
//
//   node lint-catalog.mjs          # report and exit 1 on any error
//   node lint-catalog.mjs --warn   # report but always exit 0
//
// gen-catalog.mjs imports lintEntries() and refuses to write when it fails.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── what the contract actually defines ───────────────────────────────────────────────────────────
export function contractVocabulary(tokensCss) {
  const utilities = new Set(
    [...tokensCss.matchAll(/^@utility\s+([\w-]+)\s*\{/gm)].map((m) => m[1])
  );
  // TRIPLET vs WHOLE-VALUE — the contract's most load-bearing convention, and its quietest trap.
  // Most colours are bare HSL triplets ("23.5 100% 95.5%") consumed as hsl(var(--x)); the few that
  // need alpha or a gradient are whole values consumed as var(--x) directly. Writing
  // `background: var(--accent)` where --accent is a triplet produces `background: 23.5 100% 95.5%`
  // — invalid, so the declaration is dropped and the element renders untinted with no error
  // anywhere. Caught in review on 8 occurrences in one file; this makes it mechanical.
  const triplets = new Set();
  for (const [, name, value] of tokensCss.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    if (/^-?[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(value.trim())) triplets.add(name);
  }
  // @theme inline entries: --color-foo → the `foo` suffix usable as bg-foo / text-foo / border-foo.
  const theme = { color: new Set(), radius: new Set(), shadow: new Set(), font: new Set(), text: new Set() };
  const themeBlock = tokensCss.match(/@theme[^{]*\{([\s\S]*?)\n\}/g) || [];
  for (const block of themeBlock) {
    for (const [, kind, name] of block.matchAll(/--(color|radius|shadow|font|text)-([\w-]+)\s*:/g)) {
      theme[kind].add(name);
    }
  }
  return { utilities, theme, triplets };
}

// Stock Tailwind names a snippet may legitimately use that are NOT contract tokens. Deliberately
// short: the point of the contract is that colour, radius, shadow and type come from IT. Anything
// here is either a structural value (auto, full, px) or a scale Tailwind owns outright.
const STOCK = {
  color: new Set([
    "white", "black", "transparent", "current", "inherit",
    // Chips.jsx's own TONES object (2026-08-13 redesign) reads these fifteen literally off
    // Tailwind's stock palette, not off any token this app owns — its own file banner: "Tones use
    // Tailwind's own palette rather than a token of ours... and no Foundations entry to keep in
    // sync." tokens.css's Foundations rewrite names no --tone-* custom properties at all any more,
    // so there is nothing left for a token-based chip to resolve — this is the deliberate
    // replacement, not a lint gap to close over. Scoped to exactly these fifteen values (the five
    // tones' bg/text/dot triplet), not the full Tailwind palette — a class outside this set is
    // still a real error.
    "emerald-50", "emerald-500", "emerald-700",
    "amber-50", "amber-500", "amber-700",
    "blue-50", "blue-500", "blue-700",
    "rose-50", "rose-500", "rose-700",
    "slate-100", "slate-400", "slate-700",

    // Board.jsx's own TONE object (2026-08-13 redesign, process.mjs's "kanban" entry) reads a
    // SECOND, separate stock-palette table — its own file banner: "a board's colour is Tailwind's,
    // not Foundations'... a stage's colour is picked per app by whoever configures the board." Not
    // the same five tones as Chips.jsx above and not reconciled with them (a `danger` StatusChip
    // and a `rose` board column are not the same design concept) — this is the OTHER deliberate
    // stock-palette exception, not an extension of the first. Full 11 tones × the well/avatarBg/
    // dot/ink quartet (-50/-100/-500/-700), transcribed complete rather than trimmed to whichever
    // subset one fixture happens to hit — KanbanBoard's owner-tone is a hash of the owner's name,
    // so a cherry-picked allowlist would start failing the moment a name changed. Overlaps the
    // block above on a few values (e.g. emerald-50); a Set dedupes those for free, left in place
    // rather than cross-referenced so this list stays a complete, standalone copy of Board.jsx's
    // own TONE table.
    "rose-50", "rose-100", "rose-500", "rose-700",
    "amber-50", "amber-100", "amber-500", "amber-700",
    "sky-50", "sky-100", "sky-500", "sky-700",
    "emerald-50", "emerald-100", "emerald-500", "emerald-700",
    "slate-50", "slate-100", "slate-500", "slate-700",
    "blue-50", "blue-100", "blue-500", "blue-700",
    "violet-50", "violet-100", "violet-500", "violet-700",
    "teal-50", "teal-100", "teal-500", "teal-700",
    "orange-50", "orange-100", "orange-500", "orange-700",
    "indigo-50", "indigo-100", "indigo-500", "indigo-700",
    "gray-50", "gray-100", "gray-500", "gray-700",
  ]),
  radius: new Set(["none", "full", "sm", "md", "lg", "xl", "2xl", "3xl", "nested", "bar"]),
  shadow: new Set(["none", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "inner"]),
  font: new Set(["sans", "serif", "mono", "display"]),
  text: new Set([
    "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "data",
    "left", "right", "center", "justify", "start", "end", "wrap", "nowrap", "balance", "pretty",
    "ellipsis", "clip", "transparent", "current", "inherit", "white", "black",
  ]),
};

// Prefixes we check the suffix of. Everything else (flex, grid, gap-*, p-*, m-*, w-*, items-*, …)
// is stock Tailwind layout and is not the failure mode this linter is for.
const CHECKED = [
  ["bg-", "color"], ["text-", "text|color"], ["border-", "radius|color"], ["ring-", "color"],
  ["fill-", "color"], ["stroke-", "color"], ["shadow-", "shadow"], ["rounded-", "radius"],
  ["font-", "font"], ["divide-", "color"], ["from-", "color"], ["to-", "color"], ["via-", "color"],
];

// STRUCTURAL forms that share a prefix with a themed one but are not colours/radii/families at all:
// `border-0` is a WIDTH, `font-semibold` a WEIGHT, `rounded-t-lg` a corner-scoped radius. Matching
// here short-circuits the token lookup. Without this the linter reports its own false positives —
// which is worse than no linter, because a noisy check gets ignored and then misses the real one.
const STRUCTURAL = {
  // `bg-` is the worst offender: it fronts background-repeat, -size, -position, -attachment,
  // -clip, -origin, -blend and the gradient direction, none of which are colours. Reported by a
  // catalog author whose valid `bg-no-repeat` was flagged as an unknown colour token.
  "bg-": /^(?:no-repeat|repeat(?:-x|-y|-round|-space)?|cover|contain|auto|fixed|local|scroll|center|top|bottom|left|right|(?:top|bottom)-(?:left|right)|clip-\w+|origin-\w+|blend-[\w-]+|gradient-to-[a-z]{1,2}|none)$/,
  "border-": /^(?:\d+|x|y|s|e|t|r|b|l)(?:-\d+)?$|^(?:solid|dashed|dotted|double|hidden|none|collapse|separate)$/,
  "rounded-": /^(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)(?:-.+)?$/,
  "font-": /^(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\d{3})$/,
  // offset-<width> (a number) and offset-<colour-keyword> are BOTH real Tailwind ring-offset
  // variants — `ring-offset-transparent` is what Buttons.jsx's own focus ring actually uses (an
  // offset that reads the page behind it rather than painting a fake halo), not a typo. Found by
  // this file's own false-positive on that exact class (2026-08-13).
  "ring-": /^(?:\d+|inset|offset-(?:\d+|transparent|current|white|black))$/,
  "divide-": /^(?:x|y)(?:-\d+|-reverse)?$/,
  "text-": /^(?:opacity-\d+)$/,
  "stroke-": /^\d+$/,
};

const stripVariants = (cls) => {
  // hover:, focus-visible:, lg:, dark:, group-hover:, data-[x]:, supports-[…]: …
  let out = cls;
  for (let i = 0; i < 8; i++) {
    const m = out.match(/^[a-z0-9-]+(?:\[[^\]]*\])?:(.*)$/);
    if (!m) break;
    out = m[1];
  }
  return out.replace(/^!/, "");
};

const suffixOK = (suffix, kinds, vocab) => {
  // Opacity modifier: bg-card/40, border-border/60
  const bare = suffix.split("/")[0];
  // Arbitrary value: bg-[#fff] — handled separately as a hex error, allow the shape here.
  if (/^\[.*\]$/.test(bare)) return true;
  for (const kind of kinds.split("|")) {
    if (vocab.theme[kind]?.has(bare)) return true;
    if (STOCK[kind]?.has(bare)) return true;
  }
  return false;
};

/** @returns {{errors: string[], warnings: string[], checked: number}} */
export function lintEntries(entries, tokensCss) {
  const vocab = contractVocabulary(tokensCss);
  const errors = [];
  const warnings = [];
  let checked = 0;

  for (const e of entries) {
    for (const s of e.specimens || []) {
      const where = `${e.id} › "${s.label.slice(0, 44)}"`;
      const html = s.html || "";

      // 1. Hard-coded colour. The contract exists so a language switch repaints everything; a hex
      //    or an rgb() literal is a value that will not move, in a system whose whole promise is
      //    that it does. The one legitimate exception is a pure-white/black overlay tint — plus
      //    Heatmap's own three warm buckets: DataCharts.jsx's file banner names these its ONE
      //    deliberate hex exception ("tokens.css deliberately does not name them, so there is no
      //    token to reach for"). Scoped to that exact entry and those exact three values — a hex
      //    anywhere else, or a different value here, is still a real error.
      for (const [, hex] of html.matchAll(/(#[0-9a-fA-F]{3,8})\b/g)) {
        const isHeatmapBucket = e.id === "heatmap" && /^#(FFD9BF|FF9E5E|F25A00)$/i.test(hex);
        if (!isHeatmapBucket) errors.push(`${where}: hard-coded colour ${hex} — use a contract token`);
      }
      for (const [, fn] of html.matchAll(/\b(rgba?\([^)]*\)|hsla?\((?!var)[^)]*\))/g)) {
        if (!/rgba\(\s*255,\s*255,\s*255|rgba\(\s*0,\s*0,\s*0/.test(fn)) {
          warnings.push(`${where}: literal colour ${fn} — prefer a contract token`);
        }
      }

      // 2. A closing-style tag inside a snippet truncates the page's style element the same way it
      //    truncated the contract. Never legitimate in a component snippet.
      if (/<\/style/i.test(html)) errors.push(`${where}: contains a closing-style tag`);

      // 3. rounded-full on an avatar. Under Beacon (the only language left) --control-radius — which
      //    avatar-shape's radius merged into 2026-08-12 — happens to be 999px, a circle, so this rule
      //    currently has no observable bug to catch: hard-coding rounded-full and reading the token
      //    render identically today. Kept anyway: it's still bypassing the token for a value that
      //    matches it by coincidence, which is exactly how Checkpoint's 9px rounded-square avatars
      //    (retired with the language) silently wore Beacon's circle back when there were two shapes
      //    to disagree.
      for (const [, tag] of html.matchAll(/<([a-z]+)[^>]*class="[^"]*avatar-shape[^"]*"/g)) {
        void tag;
      }
      for (const m of html.matchAll(/class="([^"]*avatar-shape[^"]*)"/g)) {
        if (/\brounded-full\b/.test(m[1])) {
          errors.push(`${where}: rounded-full alongside avatar-shape — overrides the language's avatar radius`);
        }
      }

      // 3b. A triplet token used raw. See contractVocabulary's note: `var(--accent)` where
      //     --accent is "23.5 100% 95.5%" yields an invalid declaration that the browser drops
      //     silently. It must be hsl(var(--accent)).
      for (const m of html.matchAll(/(hsl\(\s*)?var\(--([\w-]+)/g)) {
        if (m[1]) continue;                                     // already wrapped in hsl(
        if (vocab.triplets.has(m[2])) {
          errors.push(`${where}: var(--${m[2]}) used raw — that token is an HSL triplet, write hsl(var(--${m[2]}))`);
        }
      }

      // 4. Every class name, against the contract.
      for (const m of html.matchAll(/class="([^"]*)"/g)) {
        for (const raw of m[1].split(/\s+/).filter(Boolean)) {
          const cls = stripVariants(raw);
          if (!cls || cls.startsWith("[")) continue;
          checked++;
          if (vocab.utilities.has(cls)) continue;               // a contract @utility, bare
          const hit = CHECKED.find(([p]) => cls.startsWith(p));
          if (!hit) continue;                                    // stock layout utility, not our concern
          const [prefix, kinds] = hit;
          const suffix = cls.slice(prefix.length);
          if (!suffix) continue;                                 // bare `border`, `rounded`, `shadow`
          if (STRUCTURAL[prefix]?.test(suffix)) continue;        // a width/weight/corner, not a token
          if (!suffixOK(suffix, kinds, vocab)) {
            errors.push(`${where}: unknown class "${cls}" — no ${kinds.replace("|", " or ")} token named "${suffix.split("/")[0]}"`);
          }
        }
      }
    }
  }
  return { errors, warnings, checked };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const tokensCss = readFileSync(join(HERE, "tokens.css"), "utf8");
  const entries = [];
  for (const f of readdirSync(join(HERE, "catalog")).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).sort()) {
    const mod = await import(join(HERE, "catalog", f));
    entries.push(...(mod.default || []));
  }
  const { errors, warnings, checked } = lintEntries(entries, tokensCss);
  const vocab = contractVocabulary(tokensCss);
  console.log(
    `lint: ${entries.length} entries · ${checked} class names checked against ` +
    `${vocab.utilities.size} @utility + ${vocab.theme.color.size} colour tokens`
  );
  for (const w of warnings) console.log(`  warn  ${w}`);
  for (const e of errors) console.error(`  ERROR ${e}`);
  if (errors.length && !process.argv.includes("--warn")) {
    console.error(`\n${errors.length} error(s). A class the contract does not define renders as nothing.`);
    process.exit(1);
  }
  if (!errors.length) console.log("  clean");
}
