#!/usr/bin/env node
/**
 * gen-token-reference.mjs — the token reference for ONE design language, as a standalone page.
 *
 *   node gen-token-reference.mjs [language] [--out <file>]      default: beacon → tokens-<lang>.html
 *
 * `[language]` is close to vestigial since 2026-08-12: Beacon is the only block tokens.css has, so
 * it's the only argument that won't fail with "no language X in tokens.css. Have: beacon". Kept as a
 * parameter rather than hardcoded — this script needed no other change across 3, 11, and 1 languages,
 * because it always read whichever block tokens.css actually declared instead of assuming a list.
 *
 * WHY GENERATED, LIKE EVERYTHING ELSE HERE. COMPONENTS.md and gallery.html are generated from
 * catalog/*.mjs for one reason: a reference maintained by hand drifts from the thing it documents,
 * and the drift is invisible because both halves still look right. A token reference is the worst
 * case of that — 223 values, every one a number nobody can eyeball.
 *
 * So nothing here is transcribed. The language's own `:root` block is lifted out of tokens.css and
 * INLINED VERBATIM into the page, and every specimen then renders through `var(--token)`. The
 * swatch you see is the browser resolving the same declaration the kit resolves; if this file's
 * idea of a value ever disagreed with the contract, there would be no way to see it, because there
 * is no second copy of the value to disagree with.
 *
 * The section headings, the provenance notes and the order are read from the file's own comments,
 * so the page is organised the way the contract is written rather than the way this script would
 * have chosen — including the [SOURCE] / [OURS] marks, which are the whole point of that file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = join(HERE, "tokens.css");

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const lang = (argv.find((a) => !a.startsWith("--") && argv[outIdx + 1] !== a) || "beacon").toLowerCase();
const OUT = outIdx >= 0 ? resolve(argv[outIdx + 1]) : join(HERE, `tokens-${lang}.html`);

const css = readFileSync(TOKENS, "utf8");

// ── find the language's block ────────────────────────────────────────────────────────────────────
const heads = [...css.matchAll(/^:root(?:\[data-theme="([a-z-]+)"\])?\s*\{/gm)];
const idx = heads.findIndex((h) => (h[1] || "beacon") === lang);
if (idx < 0) {
  console.error(`✗ no language "${lang}" in tokens.css. Have: ${heads.map((h) => h[1] || "beacon").join(", ")}`);
  process.exit(1);
}
const block = css.slice(heads[idx].index, idx + 1 < heads.length ? heads[idx + 1].index : css.length);

// The @theme bridge decides how a token must be spelled, which is also how a swatch has to read it.
const ti = css.indexOf("@theme inline");
const theme = css.slice(ti, css.indexOf("\n}", ti));
const wrapped = new Set();   // --color-X: hsl(var(--X))  → --X is a bare triplet
for (const m of theme.matchAll(/^\s*--color-[a-z0-9-]+\s*:\s*(.+?);/gm)) {
  const w = /^hsl\(\s*var\(\s*(--[a-z0-9-]+)/.exec(m[1]);
  if (w) wrapped.add(w[1]);
  const inner = /hsl\(\s*var\(\s*(--[a-z0-9-]+)/.exec(m[1]);
  if (inner) wrapped.add(inner[1]);
}

// ── read the block: sections, tokens, provenance ─────────────────────────────────────────────────
const TRIPLET = /^-?[\d.]+\s+[\d.]+%\s+[\d.]+%(\s*\/\s*[\d.]+%?)?$/;
const tokens = [];
let section = "Root";
for (const line of block.split("\n")) {
  // a section heading is a full-line comment in Title case, short enough to be a label
  const sec = /^\s*\/\*\s*[─=]*\s*([A-Z][^\n*]{2,60}?)\s*[─=]*\s*\*?\/?\s*$/.exec(line);
  if (sec && !/^\s*\*/.test(line) && sec[1].trim().length < 50) section = sec[1].trim();
  const d = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);(?:\s*\/\*\s*(.*?)\s*\*\/)?/.exec(line);
  if (!d) continue;
  const [, name, rawVal, rawNote] = d;
  const value = rawVal.trim();
  const note = (rawNote || "").trim();
  tokens.push({ section, name, value, note, kind: classify(name, value) });
}

/** What specimen does this token deserve? Decided from the VALUE, not from a list of names. */
function classify(name, v) {
  if (TRIPLET.test(v)) return "colour";
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^(hsl|rgb|oklch)a?\(/i.test(v)) return "colour";
  if (/^var\(--[a-z0-9-]+\)$/.test(v) && wrapped.has(v.slice(4, -1))) return "colour";
  if (/^(0 0 #0000|none)$/.test(v) || /\d+px .*(rgba|#|hsl)/.test(v)) return "shadow";
  if (/^linear-gradient|^radial-gradient/.test(v)) return "gradient";
  if (/^[\d.]+m?s$/.test(v)) return "duration";
  if (/^cubic-bezier|^ease|^linear$/.test(v)) return "easing";
  if (/^[\d.]+(px|rem|em)$/.test(v) || /^calc\(/.test(v)) return "length";
  if (/^\d{3}$/.test(v)) return "weight";
  if (/(ui-sans-serif|ui-monospace|sans-serif|monospace|serif)/.test(v)) return "family";
  return "raw";
}

/** A colour token renders through the SAME spelling the bridge uses — never a re-derived hex. */
const paint = (t) => (TRIPLET.test(t.value) ? `hsl(var(${t.name}))` : `var(${t.name})`);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ── group, preserving the contract's own order ───────────────────────────────────────────────────
const groups = [];
for (const t of tokens) {
  const g = groups.find((x) => x.name === t.section);
  (g || (groups[groups.push({ name: t.section, tokens: [] }) - 1])).tokens.push(t);
}

function specimen(t) {
  switch (t.kind) {
    case "colour":
      return `<span class="sw" style="background:${paint(t)}"></span>`;
    case "shadow":
      return `<span class="sw sw-card" style="box-shadow:var(${t.name})"></span>`;
    case "gradient":
      return `<span class="sw" style="background:var(${t.name})"></span>`;
    case "length":
      return `<span class="sw sw-radius" style="border-radius:var(${t.name})"></span>`;
    case "family":
      return `<span class="sw-type" style="font-family:var(${t.name})">Ag</span>`;
    case "weight":
      return `<span class="sw-type" style="font-weight:var(${t.name})">Ag</span>`;
    case "duration":
    case "easing":
      return `<span class="sw sw-motion"><i style="animation-duration:${t.kind === "duration" ? `var(${t.name})` : "1.4s"};animation-timing-function:${t.kind === "easing" ? `var(${t.name})` : "linear"}"></i></span>`;
    default:
      return `<span class="sw sw-none"></span>`;
  }
}

const rows = (g) => g.tokens.map((t) => `
      <tr>
        <td class="c-spec">${specimen(t)}</td>
        <td class="c-name"><code>${esc(t.name)}</code></td>
        <td class="c-val"><code>${esc(t.value)}</code></td>
        <td class="c-note">${t.note ? esc(t.note) : ""}</td>
      </tr>`).join("");

// A handful of tokens carry the language's character; show them before the tables.
const KEY = ["--background", "--card", "--foreground", "--muted-foreground", "--border", "--primary", "--brand-accent", "--accent"];
const keyCards = KEY.filter((n) => tokens.some((t) => t.name === n)).map((n) => {
  const t = tokens.find((x) => x.name === n);
  return `<figure class="key">
        <span class="key-chip" style="background:${paint(t)}"></span>
        <figcaption><code>${esc(n)}</code><span>${esc(t.value)}</span></figcaption>
      </figure>`;
}).join("\n      ");

const title = lang[0].toUpperCase() + lang.slice(1);
const counts = `${tokens.length} tokens · ${groups.length} groups`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} Tokens</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
/* ═══ ${title}'s own :root, LIFTED VERBATIM from tokens.css ═══════════════════════════════════════
   Not transcribed. Every specimen below renders through var(--token), so what you see is the
   browser resolving the same declaration the component kit resolves. There is no second copy of a
   value here that could quietly disagree with the contract. */
${block.replace(/^:root\[data-theme="[a-z-]+"\]/, ":root")}

/* ═══ the page itself — written in ${title}'s tokens, because a reference should wear what it documents ═══ */
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: var(--type-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
code { font-family: var(--type-mono, ui-monospace, monospace); font-size: 12.5px; }

.wrap { display: grid; grid-template-columns: 208px minmax(0, 1fr); gap: 40px; max-width: 1180px; margin: 0 auto; padding: 0 28px 96px; }
@media (max-width: 860px) { .wrap { grid-template-columns: 1fr; gap: 0; } .rail { position: static; height: auto; padding-bottom: 24px; } }

header.masthead { max-width: 1180px; margin: 0 auto; padding: 64px 28px 34px; }
.eyebrow { font-family: var(--type-mono, monospace); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: hsl(var(--meta-foreground)); margin: 0 0 14px; }
h1 { font-family: var(--type-display, sans-serif); font-size: 46px; font-weight: 700; letter-spacing: -.03em; line-height: 1.04; margin: 0 0 12px; text-wrap: balance; }
.lede { max-width: 62ch; font-size: 16.5px; color: hsl(var(--muted-foreground)); margin: 0 0 8px; text-wrap: pretty; }
.count { font-family: var(--type-mono, monospace); font-size: 12.5px; color: hsl(var(--meta-foreground)); font-variant-numeric: tabular-nums; }

.keys { display: flex; flex-wrap: wrap; gap: 10px; max-width: 1180px; margin: 0 auto; padding: 6px 28px 40px; }
.key { margin: 0; display: flex; align-items: center; gap: 10px; background: hsl(var(--card)); border: var(--border-decor, 1px) solid hsl(var(--border)); border-radius: var(--radius-md, 11px); padding: 9px 13px 9px 9px; }
.key-chip { width: 28px; height: 28px; border-radius: var(--radius-sm, 8px); flex: none; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .09); }
.key figcaption { display: flex; flex-direction: column; line-height: 1.35; }
.key figcaption code { font-weight: 500; }
.key figcaption span { font-family: var(--type-mono, monospace); font-size: 11px; color: hsl(var(--meta-foreground)); font-variant-numeric: tabular-nums; }

.rail { position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto; padding: 8px 0 40px; }
.rail h2 { font-family: var(--type-mono, monospace); font-size: 10.5px; letter-spacing: .15em; text-transform: uppercase; color: hsl(var(--meta-foreground)); margin: 12px 0 10px; font-weight: 600; }
.rail a { display: block; padding: 5px 10px; border-radius: var(--radius-sm, 8px); color: hsl(var(--muted-foreground)); text-decoration: none; font-size: 13px; }
.rail a:hover { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.rail a:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }
.rail a span { float: right; font-family: var(--type-mono, monospace); font-size: 11px; color: hsl(var(--foreground-disabled, var(--meta-foreground))); font-variant-numeric: tabular-nums; }

section.group { scroll-margin-top: 18px; margin-bottom: 34px; }
section.group > h2 { font-family: var(--type-display, sans-serif); font-size: 19px; font-weight: 600; letter-spacing: -.015em; margin: 0 0 12px; }
.table-scroll { overflow-x: auto; background: hsl(var(--card)); border: var(--border-decor, 1px) solid hsl(var(--border)); border-radius: var(--radius, 14px); }
table { width: 100%; border-collapse: collapse; min-width: 640px; }
td { padding: 9px 14px; border-top: 1px solid hsl(var(--row-divider, var(--border))); vertical-align: middle; }
tr:first-child td { border-top: 0; }
tr:hover td { background: var(--row-hover, hsl(var(--muted))); }
.c-spec { width: 54px; }
.c-name { width: 30%; white-space: nowrap; }
.c-name code { font-weight: 500; color: hsl(var(--foreground)); }
.c-val { width: 34%; }
.c-val code { color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
.c-note { font-size: 12.5px; color: hsl(var(--meta-foreground)); text-wrap: pretty; }

.sw { display: block; width: 30px; height: 30px; border-radius: var(--radius-sm, 8px); box-shadow: inset 0 0 0 1px rgb(0 0 0 / .09); }
.sw-card { background: hsl(var(--card)); box-shadow: none; }
.sw-radius { background: hsl(var(--muted)); box-shadow: inset 0 0 0 1px hsl(var(--border)); }
.sw-none { background: repeating-linear-gradient(45deg, transparent 0 4px, hsl(var(--muted)) 4px 8px); box-shadow: none; }
.sw-motion { background: hsl(var(--muted)); box-shadow: none; overflow: hidden; position: relative; }
.sw-motion i { position: absolute; inset: 0 auto 0 0; width: 8px; background: hsl(var(--primary)); animation-name: slide; animation-iteration-count: infinite; }
@keyframes slide { 0% { transform: translateX(0); } 50% { transform: translateX(22px); } 100% { transform: translateX(0); } }
.sw-type { display: grid; place-items: center; width: 30px; height: 30px; font-size: 15px; color: hsl(var(--foreground)); }
@media (prefers-reduced-motion: reduce) { .sw-motion i { animation: none; } }

footer { max-width: 1180px; margin: 0 auto; padding: 0 28px 72px; font-size: 13px; color: hsl(var(--meta-foreground)); max-width: 68ch; }
footer code { color: hsl(var(--muted-foreground)); }
</style>
</head>
<body>

<header class="masthead">
  <p class="eyebrow">Design language</p>
  <h1>${title}</h1>
  <p class="lede">The token contract every component in the kit is written against, and every prototype recipe resolves through. This page is generated from <code>tokens.css</code> and inlines ${title}'s own <code>:root</code> block, so each specimen below is the browser resolving the real declaration — not a copy of it.</p>
  <p class="count">${counts}</p>
</header>

<div class="keys">
      ${keyCards}
</div>

<div class="wrap">
  <nav class="rail" aria-label="Token groups">
    <h2>Groups</h2>
    ${groups.map((g) => `<a href="#${slug(g.name)}">${esc(g.name)}<span>${g.tokens.length}</span></a>`).join("\n    ")}
  </nav>

  <main>
    ${groups.map((g) => `<section class="group" id="${slug(g.name)}">
      <h2>${esc(g.name)}</h2>
      <div class="table-scroll">
        <table>
          <tbody>${rows(g)}
          </tbody>
        </table>
      </div>
    </section>`).join("\n    ")}
  </main>
</div>

<footer>
  <p>Generated by <code>engine/proto-kit/gen-token-reference.mjs</code> from <code>engine/proto-kit/tokens.css</code>. Regenerate rather than editing this file — a hand-edited reference drifts from the contract, and the drift is invisible because both halves still look right. Notes in the right-hand column are the contract's own, including its <code>[SOURCE]</code> / <code>[OURS]</code> provenance marks.</p>
</footer>

</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`${lang} token reference → ${OUT}`);
console.log(`  ${tokens.length} tokens · ${groups.length} groups`);
const kinds = tokens.reduce((a, t) => ((a[t.kind] = (a[t.kind] || 0) + 1), a), {});
console.log(`  specimens: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
