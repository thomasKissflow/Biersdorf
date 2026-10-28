// proto-extract.mjs — pull ONE page out of the approved prototype so the runtime build can PORT it
// instead of re-designing it.
//
//   node proto-extract.mjs <parts-dir|index.html> <pageId> [--json]
//
// Why this exists: in quick mode the prototype is already a finished, reviewed UI — every layout
// decision, widget choice, column set and label is settled. Regenerating the runtime UI from the
// spec throws all of that away: agents re-read the catalog, re-pick widgets, re-word headings, and
// the live app drifts from the thing the user approved (observed hire-onboard 2026-08-02 — the
// runtime and the prototype were recognisably different apps). Porting is also far cheaper: the
// agent gets the answer and changes only the data source.
//
// Output = everything an agent needs to port one page and nothing else:
//   markup   the page's <div data-page="…"> inner HTML (the structure to reproduce)
//   render   the source of its window.PAGES["<pageId>"] function (the aggregations to reproduce)
//   seedKeys which SEED collections it reads — each maps to a Kissflow flow at port time

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** the inner HTML of <div data-page="id" …> … </div>, brace-free and depth-aware */
export function extractMarkup(html, pageId) {
  const open = new RegExp(`<div[^>]*data-page=["']${pageId}["'][^>]*>`, "i").exec(html);
  if (!open) return null;
  let i = open.index + open[0].length, depth = 1;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = i;
  for (let m; (m = re.exec(html)); ) {
    depth += m[0].startsWith("</") ? -1 : (m[0].endsWith("/>") ? 0 : 1);
    if (depth === 0) return html.slice(i, m.index).trim();
  }
  return html.slice(i).trim();
}

// Walk from `from` to the end of the first brace-balanced block, ignoring braces inside strings,
// template literals (with nested ${…}) and comments. A naive counter is not good enough here: a
// renderer that builds rows with `${x ? "{" : ""}`-style content would terminate early and hand the
// agent a truncated function, which is worse than handing it none.
function blockEnd(src, from) {
  let depth = 0, started = false;
  // stack entries: "`" = inside a template literal; a number = the depth of a `${` we must close
  const stack = [];
  const top = () => stack[stack.length - 1];
  for (let i = from; i < src.length; i++) {
    const ch = src[i], next = src[i + 1];
    const inTpl = top() === "`";
    if (!inTpl) {
      if (ch === "/" && next === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
      if (ch === "/" && next === "*") { i = src.indexOf("*/", i); if (i < 0) break; i++; continue; }
      if (ch === '"' || ch === "'") { for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === "\\") i++; continue; }
    }
    if (ch === "\\") { i++; continue; }
    if (ch === "`") { inTpl ? stack.pop() : stack.push("`"); continue; }
    if (inTpl) { if (ch === "$" && next === "{") { stack.push(++depth); i++; } continue; }
    if (ch === "{") { depth++; started = true; continue; }
    if (ch === "}") {
      if (top() === depth) { stack.pop(); depth--; continue; } // closes a ${…}, back into the literal
      depth--;
      if (started && depth === 0) return i + 1;
    }
  }
  return -1;
}

/** the source of the page's renderer: inline function/arrow, or a named reference we resolve */
export function extractRender(html, pageId) {
  const m = new RegExp(`["']${pageId}["']\\s*:\\s*`, "g").exec(html);
  if (!m) return null;
  const from = m.index + m[0].length;
  const rest = html.slice(from);

  // "page": renderThing  → follow the reference to its declaration
  const ref = /^([A-Za-z_$][\w$]*)\s*[,}\n]/.exec(rest);
  if (ref && !/^(function|async)$/.test(ref[1])) return extractNamed(html, ref[1]);

  // "page": function () {…} | () => {…} | async () => {…}
  const end = blockEnd(html, from);
  return end < 0 ? null : html.slice(from, end).trim();
}

/** the source of `function name(…){…}`, `const name = (…) => {…}` or `name = function(){…}` */
export function extractNamed(html, name) {
  const decl = new RegExp(`(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=\\s*|\\b${name}\\s*=\\s*function\\b)`).exec(html);
  if (!decl) return null;
  const end = blockEnd(html, decl.index);
  return end < 0 ? null : html.slice(decl.index, end).trim();
}

const SEED_RE = /SEED\.([A-Za-z_$][\w$]*)/g;

export function extractPage(source, pageId) {
  const html = statSync(source).isDirectory()
    ? readdirSync(source).filter((f) => f.endsWith(".html")).map((f) => readFileSync(join(source, f), "utf8")).join("\n")
    : readFileSync(source, "utf8");
  const markup = extractMarkup(html, pageId);
  const render = extractRender(html, pageId);
  if (!markup && !render) return null;
  const seedKeys = [...new Set([...(render || "").matchAll(SEED_RE)].map((m) => m[1]))];
  return { pageId, markup, render, seedKeys };
}

if (process.argv[1] && process.argv[1].endsWith("proto-extract.mjs")) {
  const [src, pageId] = process.argv.slice(2);
  if (!src || !pageId) { console.error("usage: proto-extract.mjs <parts-dir|index.html> <pageId> [--json]"); process.exit(2); }
  if (!existsSync(src)) { console.error(`no such path: ${src}`); process.exit(2); }
  const out = extractPage(src, pageId);
  if (!out) { console.error(`page "${pageId}" not found in ${src}`); process.exit(1); }
  if (process.argv.includes("--json")) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  console.log(`## PROTOTYPE PAGE: ${out.pageId}`);
  console.log(`\n### Reads these seed collections (map each to its Kissflow flow)\n${out.seedKeys.join(", ") || "(none)"}`);
  console.log(`\n### Markup to reproduce\n\`\`\`html\n${out.markup || "(none)"}\n\`\`\``);
  console.log(`\n### Renderer to reproduce (aggregations, columns, labels, ordering)\n\`\`\`js\n${out.render || "(none)"}\n\`\`\``);
}
