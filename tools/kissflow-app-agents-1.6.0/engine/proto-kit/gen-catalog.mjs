// gen-catalog.mjs — ONE source, TWO artifacts.
//
//   catalog/*.mjs  ──┬──▶  gallery.html    the visual catalog (what a person reviews)
//                    └──▶  COMPONENTS.md   the cookbook (what an assembling agent reads)
//
// WHY. These two were maintained by hand, separately, and had already drifted: the gallery was
// missing recipes the cookbook had, the cookbook was missing 17 components the starter kit ships,
// and neither could be trusted as the answer to "what can a prototype actually use". Generating
// both from one entry list makes drift impossible — a component cannot exist in one and not the
// other, and the markup a reviewer approves is byte-identical to the markup an agent copies.
//
//   node gen-catalog.mjs             # write both artifacts
//   node gen-catalog.mjs --check     # exit 1 if either is stale, write nothing
//
// The gallery mirrors starter's own catalog chrome (gallery-kit.jsx): GalleryPage › Entry ›
// Specimen, and a sidebar grouped exactly like starter/lib/nav.json.
//
// ONE LANGUAGE, NO SWITCHER (2026-08-12). This page used to carry a language-switcher rail — a
// button per `:root[data-theme="…"]` block in tokens.css, derived from the contract so the claim
// "this language exists" couldn't drift. All ten non-Beacon blocks were retired the same day, which
// makes a one-button switcher pointless: there is nothing left to switch TO. Retired with it:
// `buildLanguages()`, the `HAND_WRITTEN` label/blurb/swatch table, `languages.json` (deleted), and
// the sidebar panel + its `applyLang` script. This is now a plain component catalog — every
// component/specimen rendered once, under Beacon, full stop.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { CATEGORIES, esc } from "./catalog/_schema.mjs";
import { lintEntries } from "./lint-catalog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = join(HERE, "tokens.css");
const OUT_HTML = join(HERE, "gallery.html");

// Layout/composition guidance that has no kit/ twin and so can never arrive via a per-component
// port (hero-band's 5 slot templates, the dense-table variant, the page-layout-archetype note).
// Kept as a standalone file rather than hand-patching the generated .md so it survives every
// regeneration instead of being silently dropped the next time this script runs. See
// COMPONENT-GAPS.md "STATUS" and catalog/_addendum.md's own header for the full story.
const ADDENDUM = readFileSync(join(HERE, "catalog", "_addendum.md"), "utf8").trim();

// STAGED BY DEFAULT. COMPONENTS.md is the LIVE cookbook kf-prototype-builder reads; overwriting it
// from a half-ported catalog silently deletes recipes an agent still needs — which is exactly what
// happened on the first run of this script (24 recipes replaced by 6, caught only by the backup
// taken moments earlier). So the markdown lands in COMPONENTS.generated.md until `--promote` says
// otherwise, and --promote refuses while any category is still empty.
const OUT_MD_STAGED = join(HERE, "COMPONENTS.generated.md");
const OUT_MD_LIVE = join(HERE, "COMPONENTS.md");
const promote = process.argv.includes("--promote");

// ── load every category file ─────────────────────────────────────────────────────────────────────
const files = readdirSync(join(HERE, "catalog"))
  .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
  .sort();
const entries = [];
for (const f of files) {
  const mod = await import(join(HERE, "catalog", f));
  entries.push(...(mod.default || []));
}
// Order by the nav grouping, not by filename, so both artifacts read in the same sequence.
entries.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));

const byCategory = CATEGORIES.map((c) => ({ category: c, items: entries.filter((e) => e.category === c) }))
  .filter((g) => g.items.length);

// ── HTML ─────────────────────────────────────────────────────────────────────────────────────────
const bindingsTable = (bindings) => {
  if (!bindings || !bindings.length) return "";
  return `
      <div class="mb-4 overflow-x-auto rounded-md border border-border bg-muted/40">
        <table class="w-full border-collapse text-left text-xs">
          <thead><tr class="border-b border-border">
            ${["field", "type", "example", "what it drives"]
              .map((h) => `<th class="px-3 py-2 font-semibold uppercase tracking-wider text-muted-foreground">${h}</th>`)
              .join("")}
          </tr></thead>
          <tbody>
            ${bindings
              .map(
                (b) => `<tr class="border-b border-border last:border-0">
              <td class="px-3 py-2 font-mono text-foreground">${esc(b.field)}</td>
              <td class="px-3 py-2 font-mono text-muted-foreground">${esc(b.type)}</td>
              <td class="px-3 py-2 font-mono text-muted-foreground">${esc(b.example)}</td>
              <td class="px-3 py-2 text-muted-foreground">${esc(b.note)}</td>
            </tr>`
              )
              .join("\n            ")}
          </tbody>
        </table>
      </div>`;
};

const specimenHTML = (s) => `
      <div>
        <p class="on-canvas m-0 mb-2 font-mono text-xs text-muted-foreground">${esc(s.label)}</p>
        ${s.bare
          ? s.html
          : `<div class="shadow-card card-pad-list rounded-xl bg-card">${s.html}</div>`}
        <details class="mt-2">
          <summary class="cursor-pointer font-mono text-xs text-muted-foreground hover:text-foreground">markup</summary>
          <pre class="mt-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed"><code>${esc(s.html)}</code></pre>
        </details>
      </div>`;

const entryHTML = (e) => `
  <article id="${e.id}" class="scroll-mt-6">
    <div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 class="on-canvas m-0 font-mono text-base font-semibold tracking-tight text-foreground">&lt;${esc(e.name)}/&gt;</h3>
      <p class="on-canvas m-0 text-sm text-muted-foreground">${esc(e.summary)}</p>
      ${e.starterTwin
        ? `<span class="on-canvas ml-auto font-mono text-xs text-meta-foreground">${esc(e.starterTwin)}</span>`
        : ""}
    </div>
    ${e.blurb ? `<p class="on-canvas m-0 mb-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">${esc(e.blurb)}</p>` : ""}
    ${bindingsTable(e.bindings)}
    <div class="flex flex-col gap-6">${e.specimens.map(specimenHTML).join("\n")}</div>
    ${e.footer
      ? `<p class="on-canvas mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">${esc(e.footer)}</p>`
      : ""}
  </article>`;

const sectionHTML = (g) => `
<section id="cat-${g.category.toLowerCase()}" class="scroll-mt-6">
  <div class="mb-4 border-b border-border pb-3">
    <h2 class="on-canvas group m-0 font-display text-xl font-semibold leading-tight tracking-tight text-foreground">
      <a href="#cat-${g.category.toLowerCase()}" class="text-foreground no-underline">${g.category}
        <span class="ml-2 align-middle text-sm font-normal text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">#cat-${g.category.toLowerCase()}</span>
      </a>
    </h2>
  </div>
  <div class="flex flex-col gap-10">${g.items.map(entryHTML).join("\n")}</div>
</section>`;

const navHTML = byCategory
  .map(
    (g) => `
      <div class="mb-4">
        <p class="m-0 mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-meta-foreground">${g.category}</p>
        ${g.items
          .map(
            (e) =>
              `<a href="#${e.id}" class="block rounded-md px-2 py-1 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground">${esc(e.name)}</a>`
          )
          .join("\n        ")}
      </div>`
  )
  .join("");

// The contract is embedded inside a <style> element. An HTML parser closes that element at the first
// closing-style tag in the text — inside a CSS comment or not — so one such tag anywhere in
// tokens.css truncates the whole contract and every component renders unstyled, with only a
// downstream CssSyntaxError to show for it. That happened once (a banner comment documenting the
// required head spelled the tag out); this makes it loud instead of silent.
const tokensCss = readFileSync(TOKENS, "utf8");
if (/<\/style/i.test(tokensCss)) {
  console.error(
    "gen-catalog: tokens.css contains a closing-style tag. Embedded in the gallery's style element " +
    "it truncates the contract and every component renders unstyled. Remove it (see sync-tokens.mjs)."
  );
  process.exit(1);
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>proto-kit — Component Gallery</title>
<!-- GENERATED by engine/proto-kit/gen-catalog.mjs from catalog/*.mjs — do not edit by hand. -->
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Archivo:wght@400;500;600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&family=Azeret+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">
/* Layer order declared up front, exactly as starter/src/shadcn.css does it. This is what lets the
 * base resets below sit UNDER the utilities: a later layer outranks an earlier one, and anything
 * unlayered outranks every layer. Without this line the reset would be unlayered and would beat
 * border-control / field-shape, zeroing the outline button's edge and the input's border — which is
 * exactly what happened on the first attempt at the fix. */
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
${tokensCss}

/* ── base layer ───────────────────────────────────────────────────────────────────────────────────
 * The contract declares the type families and the canvas but never applies them — nothing in
 * tokens.css writes a font-family or a background, by design: it is a token contract, not a
 * stylesheet. starter applies them in app-theme.css through its --kf-* alias layer. This is the
 * same rule set, reading the contract tokens DIRECTLY (--type-*, --canvas) rather than through
 * aliases that belong to starter's app shell.
 *
 * background-attachment: fixed is load-bearing for any language whose --canvas is a gradient
 * rather than a flat colour; without it the ground re-tiles per element and the bands scroll with
 * the content instead of staying put. Every language currently in the contract resolves --color-canvas
 * to a flat colour, so the property is inert today and kept for the next one that does not. */
@layer base {
body {
  /* 2026-08-13 — margin reset, on request; see design-language.mjs's emitHead() for the full story
     (browser UA default 8px margin, never overridden here, same as it wasn't there). */
  margin: 0;
  /* 2026-08-13 — was var(--canvas), a bare name tokens.css never defines; see design-language.mjs's
     emitHead() for the full story. Fixed to the real token so the gallery's ground matches the
     prototype's. */
  background: var(--color-canvas);
  background-attachment: fixed;
  font-family: var(--type-sans);
  /* MATCHES starter's own body rule. Measured 2026-08-09: the same MetricCard markup computed
   * 16px here and 14px in the app, because the browser default applied on this side and
   * app-theme.css sets 14px on that one. Every text utility is rem-based so nothing sized by a
   * class moved — but anything INHERITING its size did, which is precisely the kind of drift a
   * shared contract is supposed to make impossible.
   *
   * Literal values, not tokens, and that is not laziness: the contract deliberately declares no
   * body-text size (it is a token contract for components, not a document stylesheet), and
   * starter's --kf-text-base/--kf-leading-normal live in app-theme.css, the LEGACY ALIAS LAYER
   * that gets deleted with the old .kf-* stack. Pointing at those would couple this page to a
   * file whose whole purpose is to go away. If starter's body rule changes, change it here too. */
  font-size: 14px;
  line-height: 1.55;
  color: hsl(var(--foreground));
}
h1, h2, h3, h4, .font-display { font-family: var(--type-display); }
code, pre, .font-mono { font-family: var(--type-mono); }

/* FORM CONTROLS — the one reset preflight-off makes mandatory.
 *
 * With preflight off (which is what starter does, and what this contract assumes), the UA
 * stylesheet survives — and Chrome's defaults for form controls are BEVELLED: '2px outset' on
 * button, '2px inset' on input/select/textarea. 'outset' is CSS's 3-D border style: it derives a
 * lighter shade for the top and left edges and a darker one for the bottom and right, which renders
 * as an embossed Windows-95 ring around an otherwise flat, modern button. Reported from a
 * screenshot, 2026-08-09, on the orange "New request" pill.
 *
 * starter never shows this because it has a Button COMPONENT and every one of its four ranks sets
 * an explicit border class ('border-0' on primary/strong, 'border-control' on outline) — the reset
 * is per-instance, enforced by the component. proto-kit has no component to enforce anything: a
 * snippet is copied by hand, so relying on each one remembering 'border-0' guarantees the bevel
 * comes back the first time somebody writes a new button. It belongs in the base layer.
 *
 * '0 solid', not 'none': utilities that ADD a border ('border-control', 'field-shape', bare
 * 'border') set only a width, and a width against 'border-style: none' computes to 0 — the same
 * trap tokens.css documents for 'border-decor'.
 *
 * box-sizing: border-box — the OTHER thing preflight normally sets that this reset never carried
 * over. UA default is content-box, so a specimen's 'w-full' input sizes its CONTENT box alone;
 * any padding/border on the same element then adds ON TOP of 100%, overflowing whatever column
 * it sits in — invisible in a single full-width field, visible as two fields overlapping in any
 * multi-column snippet (Fields.jsx's own two-up examples included). Found live on a generated
 * app's Settings page, same root cause here since the gallery ships the identical markup. */
button, input, select, textarea { border: 0 solid; box-sizing: border-box; }
}
</style>
</head>
<body class="bg-background text-foreground">
  <div class="mx-auto flex max-w-[1400px] items-start gap-8 px-6">

    <aside class="sticky top-0 hidden max-h-screen w-52 shrink-0 self-start overflow-y-auto py-8 md:block">
      <p class="m-0 mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-meta-foreground">app-ai-plugin</p>
      <p class="m-0 mb-5 font-display text-base font-semibold leading-tight tracking-tight text-foreground">proto-kit</p>
      <nav>${navHTML}</nav>
    </aside>

    <main class="min-w-0 flex-1 py-8">
      <header class="mb-6">
        <h1 class="on-canvas m-0 font-display text-2xl font-semibold leading-tight tracking-tight text-foreground">Component Gallery</h1>
        <p class="on-canvas m-0 mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every snippet the prototype builder can assemble, rendered live under the same token contract
          the built app uses (<span class="font-mono text-xs">starter/src/tokens.css</span>).
        </p>
      </header>

      <div class="flex min-w-0 flex-col gap-12">
        ${byCategory.map(sectionHTML).join("\n")}
        <p class="on-canvas mt-2 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
          Generated from <span class="font-mono text-xs">catalog/*.mjs</span> by
          <span class="font-mono text-xs">gen-catalog.mjs</span>, which emits this page and
          <span class="font-mono text-xs">COMPONENTS.md</span> from the same entries — so the markup
          reviewed here is byte-identical to the markup an assembling agent copies.
        </p>
      </div>
    </main>
  </div>
</body>
</html>
`;

// ── Markdown ─────────────────────────────────────────────────────────────────────────────────────
const mdEntry = (e) => {
  const head = `## ${e.name}${e.starterTwin ? `  ·  \`${e.starterTwin}\`` : ""}\n${e.summary}\n`;
  const blurb = e.blurb ? `\n${e.blurb}\n` : "";
  const bind =
    e.bindings && e.bindings.length
      ? `\n| field | type | example | what it drives |\n|---|---|---|---|\n` +
        e.bindings.map((b) => `| \`${b.field}\` | ${b.type} | \`${b.example}\` | ${b.note} |`).join("\n") +
        "\n"
      : "";
  const specs = e.specimens
    .map((s) => `\n**${s.label}**\n\n\`\`\`html\n${s.html}\n\`\`\`\n`)
    .join("");
  const foot = e.footer ? `\n> ${e.footer.replace(/\n/g, "\n> ")}\n` : "";
  return head + blurb + bind + specs + foot;
};

const md = `# proto-kit component cookbook

<!-- GENERATED by engine/proto-kit/gen-catalog.mjs from catalog/*.mjs — DO NOT EDIT BY HAND. -->

Every snippet here renders under **the same token contract the built app uses** —
\`starter/src/tokens.css\`, synced into this directory as \`tokens.css\` by \`sync-tokens.mjs\`. A
prototype therefore cannot show something the custom UI can't produce.

**Rules for an assembling agent.** Compose these; never invent CSS and never add a class convention.
Every recipe styles itself through the contract's tokens and \`@utility\` classes (\`border-decor\`,
\`card-pad-list\`, \`shadow-card\`, \`text-kpi\`, \`chip-shape\`, \`control-shape\`, \`field-shape\`,
\`avatar-shape\`, \`row-shape\`, \`overlay-shape\`…), so every design language re-skins them
automatically. A part is your markup plus one \`<script>\` that fills dynamic regions from \`SEED\`.

**The design language.** Beacon (\`:root\`) — the only one. Ten others (Checkpoint, Iris, Cadence,
Harbour, Hearth, Lantern, Plush, Signal, Sorrel, Trailhead) existed briefly and were retired
2026-08-12; no snippet should reference a language by name regardless, since the contract is what
decides how a class renders, not the recipe.

**Reading the older notes.** Nimbus was one of the first three languages and was retired on
2026-08-12, before the other ten. Its block is gone, but recipe notes below still cite it — "inert
under Beacon and Nimbus", "Nimbus draws a 44px glass field". Those comparisons are the EVIDENCE for
why a token or a class exists and what range of values it had to span, so they are kept as history.
They are not a claim that Nimbus, or any of the ten retired alongside it, is still selectable; none
of them are.

**Shell globals available to part scripts** (deferred after SEED by the assembler):
\`SEED\`, \`ICON(name, cls)\`, \`fmtINR(n)\`, \`fmtDate(iso)\`, \`initials(name)\`, \`colorFor(str)\`,
\`find*(id)\` lookups, \`openPopup(html)\` / \`closePopup()\` / \`showToast(msg)\`,
\`window.onNavigate(roleSlug, navId)\`.

**\`openPopup(html)\` — what \`html\` must contain.** The shell already provides \`#kitoverlay\`
(a real, full-viewport \`fixed inset-0\` scrim with its own click-to-close) and \`#kitpopup\`
(a centered, sized, scrolling box nested inside it). \`openPopup(html)\` just injects \`html\`
into \`#kitpopup\` and un-hides \`#kitoverlay\`. So \`html\` must be **only the dialog panel
itself** — the \`role="dialog"\` element with its own \`rounded-lg shadow-overlay p-7
bg-surface\` chrome (same shape as the Modal recipe's inner panel below) — and nothing
else:
- **No outer \`fixed inset-0\` wrapper.** \`#kitoverlay\`/\`#kitpopup\` are already that
  wrapper; adding another one either does nothing or (if it isn't itself positioned)
  breaks out of \`#kitpopup\`'s bounds.
- **No \`<div class="...bg-scrim">\` of your own.** \`#kitoverlay\` already is the scrim. A
  second one placed inside \`#kitpopup\` is \`absolute inset-0\` relative to \`#kitpopup\`'s
  content box, not the viewport — it paints a second, wrongly-sized dark rectangle
  visible as a halo/frame around the real dialog panel, not a bug you'll notice by eye at
  a glance.

The Modal/Sheet/Command specimens further down this file are standalone demos — correct
for the *gallery's* rendering context, which has no shared overlay shell of its own, so
each specimen bundles its own outer wrapper + scrim + panel together. Adapting one of them
for \`openPopup()\` means keeping the panel only and discarding the specimen's own outer
wrapper and scrim div.

See the rendered version — \`gallery.html\` — to view every specimen live.

---

${byCategory
  .map((g) => `# ${g.category}\n\n${g.items.map(mdEntry).join("\n---\n\n")}`)
  .join("\n\n")}

---

${ADDENDUM}
`;

// ── write / check ────────────────────────────────────────────────────────────────────────────────
const mdTarget = promote ? OUT_MD_LIVE : OUT_MD_STAGED;
const prevHtml = existsSync(OUT_HTML) ? readFileSync(OUT_HTML, "utf8") : null;
const prevMd = existsSync(mdTarget) ? readFileSync(mdTarget, "utf8") : null;

const missing = CATEGORIES.filter((c) => !byCategory.some((g) => g.category === c));

if (process.argv.includes("--check")) {
  const stale = [prevHtml !== html && "gallery.html", prevMd !== md && basename(mdTarget)].filter(Boolean);
  if (!stale.length) { console.log("gen-catalog: up to date"); process.exit(0); }
  console.error(`gen-catalog: STALE — ${stale.join(", ")} · run \`node engine/proto-kit/gen-catalog.mjs\``);
  process.exit(1);
}

// CONTENT-LOSS GUARD. The empty-category check below is necessary but not sufficient: all five
// categories can be full while the live cookbook still holds recipes the catalog has no entry for.
// Concretely, on 2026-08-09 the catalog reached 5/5 with 25 entries while COMPONENTS.md still
// carried eight things nothing had ported — the whole hero-band addendum (its five slot templates,
// the eyebrow/frost anatomy) plus Approval queue row, Search + filter bar, Directory photo-card,
// WIP strip, the dense-table variant and the page-layout archetype rules. Every one has no kit/
// twin, so no per-component port would ever have produced them, and --promote would have deleted
// the lot without a word. Loss has to be visible and deliberate, so it needs its own flag.
if (promote && existsSync(OUT_MD_LIVE)) {
  const live = readFileSync(OUT_MD_LIVE, "utf8");
  // Distinctive markers rather than headings: the two files name the same component differently
  // ("Card (generic container…)" vs "Card"), so a heading diff is all false positives.
  const MARKERS = [
    "Approval queue", "Search + filter", "photo-card", "WIP strip", "Dense table",
    "hero-cta", "side-foot", "eyebrow-mono", "page-layouts", "Calendar / agenda",
  ];
  const losing = MARKERS.filter((m) => live.includes(m) && !md.includes(m));
  if (losing.length && !process.argv.includes("--accept-loss")) {
    console.error(
      `gen-catalog: REFUSING to promote — ${losing.length} thing(s) in the live cookbook have no\n` +
      `catalog entry and would be deleted:\n` +
      losing.map((m) => `    · ${m}`).join("\n") +
      `\n\n  These have no kit/ twin, so porting per-component never reaches them. Either add catalog\n` +
      `  entries for them, or re-run with --accept-loss if they are genuinely retired.`
    );
    process.exit(1);
  }
}

if (promote && missing.length) {
  console.error(
    `gen-catalog: REFUSING to promote — ${missing.length} categor${missing.length === 1 ? "y is" : "ies are"} still empty: ${missing.join(", ")}.\n` +
    `  Promoting now would delete every recipe in ${missing.join(" / ")} from the live cookbook.\n` +
    `  Finish the catalog, or run without --promote to stage into ${basename(OUT_MD_STAGED)}.`
  );
  process.exit(1);
}

// Lint LAST, but gate the write on it: a snippet naming a class the contract does not define
// renders as nothing, silently, in both artifacts at once. Better to refuse than to publish a
// cookbook whose recipes quietly do not work.
const lint = lintEntries(entries, tokensCss);
for (const w of lint.warnings) console.warn(`  warn  ${w}`);
if (lint.errors.length) {
  for (const e of lint.errors) console.error(`  ERROR ${e}`);
  console.error(
    `\ngen-catalog: REFUSING to write — ${lint.errors.length} lint error(s) across ${entries.length} entries.\n` +
    `  These render as nothing rather than failing loudly. Fix the snippets, or run\n` +
    `  \`node lint-catalog.mjs\` to see them on their own.`
  );
  process.exit(1);
}

writeFileSync(OUT_HTML, html);
writeFileSync(mdTarget, md);
const specimens = entries.reduce((n, e) => n + e.specimens.length, 0);
console.log(
  `catalog → gallery.html + ${basename(mdTarget)}\n` +
  `  ${entries.length} entries · ${specimens} specimens · ${byCategory.length}/${CATEGORIES.length} categories\n` +
  byCategory.map((g) => `    ${g.category.padEnd(9)} ${g.items.map((e) => e.name).join(", ")}`).join("\n") +
  (missing.length
    ? `\n  still empty: ${missing.join(", ")} — COMPONENTS.md left untouched (run --promote when complete)`
    : `\n  all categories present — run --promote to replace the live COMPONENTS.md`)
);
