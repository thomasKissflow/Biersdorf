#!/usr/bin/env node
// slice-recipes.mjs — per-agent slices of COMPONENTS.md, the express path's slice-ir.
//
// WHY. COMPONENTS.md measures ~121k tokens and every fan-out role agent used to read ALL of it —
// on a 7-role build that is ~850k tokens of identical recipe reading, more per agent than the
// entire data-model stage of a comprehensive run (26k). An agent composing a queue page needs the
// queue/table/chip recipes, not kanban, calendars and gauges. Same shape as engine/slice-ir.mjs:
// one deterministic pass, a per-consumer slice, and an invariant that keeps the slice SAFE to
// depend on:
//
//   A SLICE ALWAYS CARRIES THE CONTRACT. The cookbook's preamble (assembly rules, § openPopup,
//   § Shell globals) and the CORE recipes every page composes (Button, Card, StatusChip, StatTile,
//   Table, form Fields, toast, Avatar, PageHeader, Grid) are in every slice, whatever was asked
//   for. A slice is a smaller cookbook, never a different one.
//
// An unknown widget/archetype name is a HARD ERROR listing what exists — the failure mode this
// guards is a silent drop that ships an agent without the recipe it needed, which reads to the
// agent as "the kit has no such widget" and invites invented markup.
//
//   node engine/proto-kit/slice-recipes.mjs --archetypes queue,command --out briefs/recipes-x.md
//   node engine/proto-kit/slice-recipes.mjs --widgets kanbanboard,heatmap --out …   (additive)
//   node engine/proto-kit/slice-recipes.mjs --list                                   (what exists)
//   [--gradients]   include the HERO-BAND ADDENDUM (only when design.gradients is present)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "COMPONENTS.md");

// Always included: the recipes every page composes regardless of archetype. Keyed by section-alias
// (see aliasesOf) so heading renames fail loudly here instead of silently shrinking the core.
// modal is CORE, not archetype-mapped: every part opens popups (create forms, detail views,
// complete-with-note), and the preamble's § openPopup refers to "the Modal recipe's inner panel" —
// the first sliced build shipped without it and the agent had to compose the dialog from the
// contract text alone (correct, but the reference the preamble makes must resolve in every slice).
const CORE = ["button", "card", "statuschip", "stattile", "table", "input", "toast", "avatar", "pageheader", "grid", "label", "modal"];

// Archetype → the NON-core recipes its compose[] rows actually use. Curated against
// engine/page-layouts.mjs (compose[] is prose, so this mapping is data, reviewed with the layouts).
const ARCHETYPE_WIDGETS = {
  command:         ["linechart", "barchart", "donut", "hbars", "approvalrow", "progressbar"],
  queue:           ["approvalrow", "donut", "searchbar", "callout"],
  intake:          ["callout", "stepper", "modal"],
  analytics:       ["linechart", "barchart", "donut", "hbars", "stackedbar", "heatmap", "gaugering", "funnelchart"],
  operations:      ["tabstrip", "searchbar", "stepper", "linechart", "modal"],
  board:           ["kanbanboard", "wipstrip", "searchbar"],
  directory:       ["photocard", "searchbar", "emptystate"],
  "master-detail": ["searchbar", "stepper", "tabstrip", "photocard", "separator"],
  calendar:        ["calendar", "progressbar"],
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
// "## Stepper · Timeline · ActivityFeed · `kit/Feed.jsx`" → ["stepper","timeline","activityfeed"]
const aliasesOf = (heading) =>
  heading.split("·").map((part) => norm(part.replace(/`[^`]*`/g, ""))).filter(Boolean);

export function parseCookbook(text = readFileSync(SOURCE, "utf8")) {
  const lines = text.split("\n");
  const sections = []; // {aliases, heading, group, start, end}
  let preambleEnd = lines.length, group = "";
  for (let i = 0; i < lines.length; i++) {
    if (/^# /.test(lines[i])) group = lines[i];
    if (/^## /.test(lines[i])) {
      if (sections.length === 0) preambleEnd = i;
      if (sections.length) sections[sections.length - 1].end = i0(lines, i);
      sections.push({ aliases: aliasesOf(lines[i].slice(3)), heading: lines[i], group, start: i, end: lines.length });
    }
  }
  // a `# Group` header between two ## sections belongs to the NEXT section, not the previous one's body
  function i0(ls, i) { let j = i; while (j > 0 && /^# /.test(ls[j - 1])) j--; return j; }
  return { lines, preamble: lines.slice(0, Math.min(preambleEnd, ...sections.length ? [sections[0].start] : [])).join("\n"), sections };
}

function slice({ archetypes = [], widgets = [], gradients = false } = {}) {
  const { lines, preamble, sections } = parseCookbook();
  const index = new Map(); // alias -> section
  for (const s of sections) for (const a of s.aliases) index.set(a, s);

  const wanted = new Set(CORE);
  for (const a of archetypes) {
    const key = norm(a) === "masterdetail" ? "master-detail" : String(a).toLowerCase().trim();
    const w = ARCHETYPE_WIDGETS[key];
    if (!w) throw new Error(`unknown archetype "${a}" — known: ${Object.keys(ARCHETYPE_WIDGETS).join(", ")}`);
    for (const x of w) wanted.add(x);
  }
  for (const w of widgets) {
    if (!index.has(norm(w))) throw new Error(`unknown widget "${w}" — run --list for every recipe name`);
    wanted.add(norm(w));
  }

  const picked = [];
  for (const s of sections) {
    const isAddendum = /HERO-BAND ADDENDUM/.test(s.group);
    if (isAddendum) { if (gradients) picked.push(s); continue; }
    if (/Layout & composition rules/.test(s.group)) { picked.push(s); continue; } // rules ride every slice
    if (s.aliases.some((a) => wanted.has(a))) picked.push(s);
  }
  const missing = [...wanted].filter((w) => !index.has(w));
  if (missing.length) throw new Error(`slice-recipes internal: CORE/archetype names not found in cookbook headings: ${missing.join(", ")} — a heading was renamed; fix the alias here, do not ship a silently smaller core`);

  const body = picked.map((s) => lines.slice(s.start, s.end).join("\n")).join("\n\n");
  const banner = `<!-- RECIPE SLICE generated by slice-recipes.mjs — a smaller cookbook, never a different one.
     Included: contract preamble + core (${CORE.join(", ")})${archetypes.length ? ` + archetypes [${archetypes.join(", ")}]` : ""}${widgets.length ? ` + widgets [${widgets.join(", ")}]` : ""}.
     If a recipe you need is MISSING here, that is a bug in the slice invocation — say so in your
     return and read ONLY that recipe's section from the full COMPONENTS.md by its heading; never
     fall back to reading the whole cookbook. -->\n`;
  return banner + preamble + "\n\n" + body + "\n";
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes("--list")) {
    const { sections } = parseCookbook();
    for (const s of sections) console.log(s.aliases.join(" · "));
    process.exit(0);
  }
  try {
    const out = slice({
      archetypes: (flag("--archetypes") || "").split(",").map((x) => x.trim()).filter(Boolean),
      widgets: (flag("--widgets") || "").split(",").map((x) => x.trim()).filter(Boolean),
      gradients: argv.includes("--gradients"),
    });
    const dest = flag("--out");
    if (dest) { writeFileSync(dest, out); console.log(`recipe slice → ${dest} (${Math.round(out.length / 1000)}k chars, ~${Math.round(out.length / 4000)}k tokens; full cookbook ~${Math.round(readFileSync(SOURCE, "utf8").length / 4000)}k)`); }
    else process.stdout.write(out);
  } catch (e) { console.error(`slice-recipes: ${e.message}`); process.exit(1); }
}
