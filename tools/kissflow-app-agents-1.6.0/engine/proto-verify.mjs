// proto-verify.mjs — deterministic, dependency-free verification of an assembled prototype.
//
// Catches the failure classes that silently blank a role in a PARALLEL build, WITHOUT a browser:
//   1. SYNTAX  — every <script> in the assembled file must parse. A part corrupted at splice time
//                (e.g. the `$'` string-replacement bug) yields invalid JS; the browser then runs
//                NONE of that <script>, blanking the role. `vm.compileFunction` throws on such parts.
//   2. MARKERS — no leftover `<!-- @PART:role-… -->` (a missing/unspliced part) and one rv-<slug>
//                roleview section per role.
//   3. EMPTY   — static heuristic: a container declared with id="…" inside a role's data-page markup
//                that its own script never targets (getElementById('…')) will render empty.
//   4. UNDEFINED — a helper CALLED by a part script that nothing in the assembled file defines.
//                Syntax-checking cannot see this: a page function that calls `fmtINR(...)` parses
//                perfectly and only throws when the user opens the page. That is exactly how the
//                gold-management build shipped (2026-08-10) — the page registered fine, set its
//                first KPI, threw ReferenceError on the second, and every widget below it stayed
//                blank while this verifier reported ✅ PASS. Four of five pages were dead.
//                COMPONENTS.md § "Shell globals" lets parts assume fmtINR/fmtDate/initials/colorFor
//                exist; CONDUCTOR.md says the seed part must define them. When it forgets, only
//                this check stands between that and a shipped prototype.
//   5. LEAK    — `${…}` left in the MARKUP. The page parses, the scripts compile, the containers
//                fill — and the user reads `${fmtMoney(8850)}` on the stat card. Correct-looking
//                code, visibly wrong output: the one class a syntax check cannot see.
//   6. HANDLER  — an inline on*="…" handler that builds markup, cut in half by the first quote
//                inside that markup, so the rest of the source prints on the page. Same shape as 5:
//                everything compiles, and the screen is wrong.
//   7. TABLE   — rows written into something that is not a table (innerHTML on a <div> instead of a
//                <tbody>) — the parser silently discards every <tr>/<td> and runs the cells together.
//   8. CARDLESS — a chart-shaped widget (its injected content contains an <svg viewBox) mounted into
//                a static container with no bg-surface/bg-card card ancestor nearby — it renders on
//                the bare page canvas: no white surface, no shadow, no rounded corners, no padding.
//                Most chart cookbook specimens (LineChart, Donut, HBars, Heatmap, …) are deliberately
//                card-less on their own; the composing page must supply the wrapper. A sibling role
//                on the SAME app got this right for an equivalent chart while this one didn't (DamWatch,
//                2026-08-13) — proof the convention being known elsewhere doesn't stop one page from
//                dropping it, which is why this is a static check now and not just a written rule.
//   9. CSS_COMMENT_BREAK — a /* ... */ comment inside <style> whose own prose contains the two
//                characters "*/" closes early, mid-sentence; every word after that point becomes
//                unparseable CSS and the Tailwind v4 CDN compiler aborts the WHOLE stylesheet — no
//                nav, no cards, no styling anywhere on the page (shipped live, 2026-08-13: a comment
//                explaining a fix wrote "px-*/border-*" as shorthand). Deliberately NOT a headless-
//                Chrome check: capture-screens.mjs already documents that it no-ops with no Chrome
//                installed, which is exactly the environment client-facing generation can't assume —
//                a browser-dependent check would silently skip itself in production. This one is
//                static, catching a stray "*/" (or an unterminated "/*") left over once every real
//                comment pair is stripped the same first-close-wins way an actual CSS parser reads it.
//  10. POPUP_SCRIM / POPUP_NO_CHROME — content built for window.openPopup(html) is injected into
//                #kitpopup, already nested inside #kitoverlay (the shell's own real, full-viewport
//                scrim). Content must therefore be ONLY the role="dialog" panel. Two shapes of this
//                shipped wrong on the same day (DamWatch, 2026-08-13): four popups each carried their
//                own `<div class="...bg-scrim">` copied from the standalone Modal/Sheet catalog
//                specimen (correct for the gallery's own rendering context, wrong here — it ends up
//                scoped to #kitpopup's content box, painting a second, wrongly-sized dark rectangle
//                around the real dialog, easy to miss at a glance); a fifth had no role="dialog" panel
//                at all and rendered as bare, cardless content. Static: resolves each openPopup(...)
//                call to the template literal it actually passes and inspects only that.
//  11. TITLE_SIZE_DRIFT — <h3> is the one tag this codebase's card/panel titles converge on (the real
//                kit's CardTitle defaults to it too). PARALLEL BUILD PROTOCOL writes each role from a
//                separate agent invocation with no shared state beyond the class contract, so nothing
//                stops one role — or even one card within a role — from improvising its own title size
//                instead of reusing COMPONENTS.md's CardTitle recipe. Shipped as 26 titles split
//                across 3 different type shapes in one app (DamWatch, 2026-08-13), invisible until one
//                sat next to a chart's own bigger figure and read as an afterthought. Static: groups
//                every <h3> whose class carries a weight + size utility (named — text-sm — OR
//                arbitrary-value — text-[15px]; the first version of this check only recognized the
//                named list and missed 9 further titles that hand-copied a since-superseded cookbook
//                size verbatim as text-[15px], invisible right alongside the 26 it did catch) by its
//                TYPOGRAPHY shape only (margin/color/layout classes vary legitimately by where a title
//                sits); more than one shape in the same file is reported as a single, consolidated
//                warning, not spammed per-title. A warning, not an error — a genuinely two-tier heading
//                design is possible and this should not block a build, only flag it for a human/agent
//                to confirm.
//  12. DEAD_THEME_TOKEN — an inline style="...var(--x)..." reading a custom property whose ONLY
//                declaration in the file sits inside an @theme inline {} block, under a name that
//                doesn't match any Tailwind theme namespace (--color-*/--radius-*/--shadow-*/etc.).
//                The CDN JIT only emits an @theme inline custom property onto :root when an actual
//                utility CLASS using it is scanned in the page's markup; a namespaced name (--color-x)
//                usually gets there by accident because SOME bg-x/text-x class exists somewhere on
//                the page, but a bare, off-namespace name (--sidebar-dark, --muted, --tone-x) has no
//                such class ANY page could ever generate, so it is not flaky — it is always empty,
//                100% of the time, unconditionally. Shipped twice as the identical failure shape on
//                the same day (DamWatch + PetroDesk, 2026-08-13): a sidebar rendered fully transparent
//                (white text over the page's own canvas) and a toast icon rendered unstyled — both
//                because their only colour came from exactly this pattern. The fix already proven live
//                is always the same: either read the token through its generated utility class instead
//                (bg-sidebar-foreground), or move the bare declaration out of @theme inline into a
//                plain :root block with a literal value (the --tone-* fix). This check does not try to
//                model the flaky, namespaced case (whether some OTHER class on the page happens to
//                trigger emission is too page-dependent to verify statically without heavy false-
//                positive risk) — only the off-namespace case, which is unconditionally broken and
//                therefore safe to flag as a hard error every time.
//  13. PAGE_PADDING_DOUBLE — the shell's own <main> already pads every page once (p-6 lg:p-8, see
//                design-language.mjs's MAIN()). A page's data-page wrapper — or its direct child div —
//                adding p-*/px-*/py-* on top of that stacks a SECOND inset on every edge. This was
//                already a written rule (kf-prototype-builder.md, "Sub-page convention": "the shell's
//                own <main> already pads the page — never add page-level padding again") from an
//                earlier incident on a different app, but a rule in a doc doesn't stop an existing part
//                from having shipped before the rule existed, or from being copied forward — nothing
//                mechanically checked it. Shipped live (dress-management/"StitchHouse", 2026-08-13):
//                all 6 data-page sections across all 3 role parts wrapped their content in
//                `max-w-[1400px] mx-auto p-6 md:p-8 …`, stacking with <main>'s p-6 lg:p-8 to as much as
//                56-64px of edge inset instead of the intended 24-32px — every page in the one app that
//                had it, invisible until a screenshot next to a sibling app made the extra whitespace
//                obvious. Static: checks only the data-page wrapper's own class and its direct child
//                div's class (the two locations the convention names), not the whole subtree — a card
//                or control deeper in the page legitimately using p-* says nothing about this bug.
//
// Scripts are attributed to a role via the assembler's "<!-- part:<key> script (deferred…) -->"
// breadcrumb, so a syntax error is reported against the offending role, not just "somewhere".
//
// Usage:  node proto-verify.mjs <assembled-index.html>
// Exit 0 = PASS, 1 = FAIL. Programmatic: import { verify } and pass the html string.

import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
// Same as SCRIPT_RE but keeps the opening-tag ATTRIBUTES (m[1]) alongside the body (m[2]), so the
// syntax check can tell an ES-module bundle (`<script type="module">`) from a classic inline script.
const SCRIPT_TAG_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const PART_SCRIPT_RE = /<!--\s*part:role-([a-z0-9_-]+) script \(deferred by assembler\)\s*-->\s*<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const ROLE_MARKER_RE = /<!--\s*@PART:role-([a-z0-9_-]+)\s*-->/gi;
const ROLEVIEW_RE = /id="rv-([a-z0-9_-]+)"/gi;

// compile (not run) a script body; return an error string on SyntaxError, else null.
function syntaxError(code) {
  try { vm.compileFunction(code, [], { filename: "part.js" }); return null; }
  catch (e) { return `${e.name}: ${e.message.split("\n")[0]}`; }
}

// Every assignment to the global PAGES map in one script body, classified on its own merits.
//
// The map is shared: each role's part adds its renderers to it, so the only safe write is one that
// preserves whatever is already there. Judging the file as a whole let one correct line vouch for
// every incorrect one, so each assignment is looked at where it sits, together with the guard (if
// any) immediately before it. All the spellings count — `window.PAGES`, `window["PAGES"]`,
// `globalThis.PAGES`, `self.PAGES`, and `||=` — because a part that reaches the map by another name
// wipes it just as thoroughly.
const PAGES_WRITE_RE = /(?:window|globalThis|self)\s*(?:\.\s*PAGES|\[\s*["']PAGES["']\s*\])\s*(\|\|)?=\s*([^;\n]*)/g;
export function pagesAssignments(code) {
  const out = [];
  for (const m of String(code || "").matchAll(PAGES_WRITE_RE)) {
    const logicalOr = Boolean(m[1]);            // `||=`
    const rhs = (m[2] || "").trim();
    const text = `${m[0].trim().slice(0, 70)}${m[0].length > 70 ? "…" : ""}`;
    // `PAGES = PAGES || {…}` and `PAGES ||= {…}` are the same shape: the braces are a FALLBACK, used
    // only when nothing registered first — so a map inside them is silently discarded when something
    // did. Empty braces are the correct idiom; anything else is the sneaky variant.
    const fallback = logicalOr ? rhs : (/^(?:window|globalThis|self)\s*(?:\.\s*PAGES|\[\s*["']PAGES["']\s*\])\s*\|\|\s*([\s\S]*)$/.exec(rhs) || [])[1];
    if (fallback !== undefined) {
      out.push({ kind: /^\{\s*\}$/.test(String(fallback).trim()) ? "safe" : "dropped", text });
      continue;
    }
    // A bare `= {}` is safe ONLY behind a guard — `if (!window.PAGES) window.PAGES = {};` is the
    // idiom people reach for and it preserves an existing map exactly like the `||` form.
    const before = String(code).slice(Math.max(0, m.index - 80), m.index);
    const guarded = /if\s*\(\s*!\s*(?:window|globalThis|self)\s*(?:\.\s*PAGES|\[\s*["']PAGES["']\s*\])\s*\)\s*$/.test(before)
      || /typeof\s+(?:window|globalThis|self)\s*(?:\.\s*PAGES|\[\s*["']PAGES["']\s*\])\s*===?\s*["']undefined["']\s*\)\s*$/.test(before);
    if (/^\{\s*\}$/.test(rhs)) { out.push({ kind: guarded ? "safe" : "clobber", text }); continue; }
    if (/^\{/.test(rhs)) { out.push({ kind: "clobber", text }); continue; }
    out.push({ kind: "safe", text });   // assigning something that is not an object literal (rare)
  }
  return out;
}

// ── popup-chrome detection (POPUP_SCRIM / POPUP_NO_CHROME) ──────────────────────────────────────────
// See check #10 in the banner above for the why. This finds every backtick template literal in a
// script body — depth-aware over ${…} so a literal containing an object/expression doesn't close
// early — pairs each with the actual `openPopup(name)` / `openPopup(\`…\`)` call site that uses it,
// and inspects ONLY that resolved content. This is what correctly leaves a legitimate static overlay
// like #ref-sheet-overlay alone: it lives directly in markup and is never passed through openPopup at
// all, so it never enters this scan.
function templateLiterals(code) {
  const out = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] !== "`") continue;
    const start = i;
    let j = i + 1, depth = 0;
    for (; j < code.length; j++) {
      if (code[j] === "\\") { j++; continue; }
      if (code[j] === "$" && code[j + 1] === "{") { depth++; j++; continue; }
      if (depth > 0 && code[j] === "}") { depth--; continue; }
      if (depth === 0 && code[j] === "`") break;
    }
    out.push({ start, end: j, text: code.slice(start + 1, j), name: null });
    // Look behind for the `const/let/var <name> =` that this literal is the right-hand side of.
    const before = code.slice(Math.max(0, start - 60), start);
    const nameM = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(before);
    if (nameM) out[out.length - 1].name = nameM[1];
    i = j; // resume the scan after this literal, not inside it
  }
  return out;
}

const OPEN_POPUP_CALL_RE = /\bopenPopup\s*\(\s*([A-Za-z_$][\w$]*|`)/g;
function popupChromeFindings(role, code) {
  const out = [];
  const literals = templateLiterals(code);
  const byName = new Map();
  for (const lit of literals) if (lit.name) byName.set(lit.name, lit); // last assignment wins
  for (const m of code.matchAll(OPEN_POPUP_CALL_RE)) {
    let content = null;
    if (m[1] === "`") {
      const lit = literals.find((l) => l.start === m.index + m[0].length - 1);
      content = lit ? lit.text : null;
    } else {
      content = (byName.get(m[1]) || {}).text ?? null;
    }
    if (content == null) continue; // couldn't statically resolve the argument — don't guess
    if (/\bbg-scrim\b/.test(content)) {
      out.push({ role, level: "error", kind: "POPUP_SCRIM",
        msg: `openPopup(...) content carries its own "bg-scrim" div — #kitoverlay already supplies the full-viewport scrim, so this one is scoped to #kitpopup's content box instead and paints a second, wrongly-sized dark rectangle (a halo) around the real dialog. Drop the bg-scrim div; pass only the role="dialog" panel.` });
    }
    if (/<div|<section/.test(content) && !/role\s*=\s*["']dialog["']/.test(content)) {
      out.push({ role, level: "error", kind: "POPUP_NO_CHROME",
        msg: `openPopup(...) content has no role="dialog" panel — it renders as bare content with no visible card, border, or shadow. Wrap it in a role="dialog" element carrying rounded-lg shadow-overlay p-7 bg-surface (see COMPONENTS.md's "openPopup(html)" contract).` });
    }
  }
  return out;
}

// ── card-title consistency (TITLE_SIZE_DRIFT) ────────────────────────────────────────────────────
// See check #11 in the banner above for the why. Reduces one <h3> class attribute to its TYPOGRAPHY
// shape only — font-display present?, size, weight, leading, tracking — deliberately dropping margin/
// color/layout classes (m-0, mb-*, self-start, text-secondary, …), which vary legitimately by where a
// title sits and say nothing about its size. Returns null for an <h3> that isn't sized+weighted at all
// (a plain unstyled heading is a different question this check has no opinion on).
const H3_RE = /<h3\b[^>]*\bclass="([^"]*)"[^>]*>/g;
// Matches BOTH named Tailwind sizes (text-sm) AND arbitrary-value ones (text-[15px]) — a real,
// shipped instance used the arbitrary form to hand-copy a since-superseded cookbook size verbatim
// (text-[15px], the pre-2026-08-13 CardTitle recipe) and slipped past a first version of this check
// that only recognized the named list, invisible right alongside 28 other titles this same check DID
// catch. A trailing \b after a closing "]" would silently never match (`]` and the following `"`/space
// are both non-word characters, so no boundary exists there for \b to find) — the bracket alternative
// is deliberately left without one.
const TITLE_SIZE_RE = /\btext-\[[^\]]+\]|\btext-(?:xs|sm|base|lg|xl|2xl)\b/;
function titleShape(cls) {
  const size = (TITLE_SIZE_RE.exec(cls) || [])[0];
  const weight = (/\bfont-(?:semibold|medium|bold)\b/.exec(cls) || [])[0];
  if (!size || !weight) return null;
  const display = /\bfont-display\b/.test(cls) ? "font-display" : "(no font-display)";
  const leading = (/\bleading-[\w-]+\b/.exec(cls) || [])[0] || "(default leading)";
  const tracking = (/\btracking-\[[^\]]*\]|\btracking-\w+\b/.exec(cls) || [])[0] || "(default tracking)";
  return `${display} ${size} ${weight} ${leading} ${tracking}`;
}

// ── dead @theme inline token detection (DEAD_THEME_TOKEN) ───────────────────────────────────────────
// See check #12 in the banner above for the why. THEME_NAMESPACE_RE is Tailwind's own set of
// recognized @theme prefixes — a token under one of these usually reaches :root by accident (some
// bg-x/text-x/etc. class elsewhere on the page triggers its emission), so it's excluded here on
// purpose: modeling that flaky case statically would mean tracing whether ANY class anywhere in the
// document happens to use it, which is exactly the kind of page-dependent guesswork this file's other
// checks avoid. A BARE name outside every one of these prefixes has no such escape hatch — nothing
// Tailwind could ever generate would reference it, so it is unconditionally dead, not just flaky.
const THEME_NAMESPACE_RE = /^--(?:color|radius|shadow|text|font|spacing|breakpoint|container|ease|animate|tracking|leading)-/;
const THEME_INLINE_BLOCK_RE = /@theme\s+inline\s*\{([\s\S]*?)\}/g;
const ROOT_BLOCK_RE = /(?:^|\s|\})\s*:root\s*\{([\s\S]*?)\}/g;
const CUSTOM_PROP_DECL_RE = /(--[\w-]+)\s*:/g;
function deadThemeInlineTokens(html) {
  const styleBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const bareInThemeInline = new Set();
  for (const m of styleBlocks.matchAll(THEME_INLINE_BLOCK_RE)) {
    for (const p of m[1].matchAll(CUSTOM_PROP_DECL_RE)) {
      if (!THEME_NAMESPACE_RE.test(p[1])) bareInThemeInline.add(p[1]);
    }
  }
  if (!bareInThemeInline.size) return [];
  // A name ALSO declared in a plain :root block is fine regardless of its @theme inline copy — a
  // plain :root custom property is unconditional, exactly the fix this check's own message prescribes.
  const inPlainRoot = new Set();
  for (const m of styleBlocks.matchAll(ROOT_BLOCK_RE)) {
    for (const p of m[1].matchAll(CUSTOM_PROP_DECL_RE)) inPlainRoot.add(p[1]);
  }
  const dead = [...bareInThemeInline].filter((n) => !inPlainRoot.has(n));
  if (!dead.length) return [];
  const out = [];
  const styleAttrRe = /\bstyle="([^"]*)"/g;
  for (const m of html.matchAll(styleAttrRe)) {
    for (const name of dead) {
      if (m[1].includes(`var(${name}`)) {
        out.push({ role: "(shell)", level: "error", kind: "DEAD_THEME_TOKEN",
          msg: `style="${m[1].length > 90 ? m[1].slice(0, 90) + "…" : m[1]}" reads var(${name}), but ${name} is declared only inside an @theme inline {} block under a name outside every Tailwind theme namespace — the CDN JIT never emits it onto :root, so this always resolves to nothing. Read it through a generated utility class instead, or move its declaration into a plain :root block with a literal value.` });
      }
    }
  }
  return out;
}

// ── double page-padding detection (PAGE_PADDING_DOUBLE) ─────────────────────────────────────────────
// See check #13 in the banner above. Only two locations count, per the convention this check enforces:
// the data-page wrapper's own class, and its DIRECT child div's class (skipping past any leading HTML
// comments) — deliberately not the whole subtree, so a card recipe's own legitimate p-* deeper in the
// page never trips this.
//
// A direct child that IS a styled card (bg-surface/bg-card, the same signal check #8/CARDLESS already
// uses to recognize "this has a real surface") is exempt even if it carries p-*: a card owns its own
// internal padding by design — that isn't the bug. The bug shape is specifically a BARE layout wrapper
// (space-y-*/flex/gap-*/max-w-*, no surface of its own) that adds padding on top of <main>'s. Caught
// live testing this check: food-ordering's "my-orders" page opens straight into a `rounded-2xl
// border bg-card p-6 shadow-sm` intake card — correct, not a page-padding bug — while DamWatch's
// operator pages wrap in bare `space-y-6 p-6` divs with no surface at all, 14 times across one app,
// the same bug class as the StitchHouse incident this check exists for.
const DATA_PAGE_RE = /<div\s+data-page="([^"]+)"([^>]*)>/g;
// \b before "p"/"px"/"py" fires on a responsive prefix too ("md:p-8" — ":" is a non-word char, so the
// boundary lands right before "p"), which is the form this bug actually shipped in.
const PADDING_UTILITY_RE = /\bp[xy]?-(?:0|px|\d+(?:\.\d+)?|\[[^\]]+\])\b/;
const CARD_SURFACE_RE = /\b(?:bg-surface|bg-card)\b/;
function pagePaddingDouble(html) {
  const out = [];
  for (const m of html.matchAll(DATA_PAGE_RE)) {
    const navId = m[1];
    const ownClass = (/\bclass="([^"]*)"/.exec(m[2]) || [])[1] || "";
    const ownHit = !CARD_SURFACE_RE.test(ownClass) && (PADDING_UTILITY_RE.exec(ownClass) || [])[0];
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 400);
    const childM = /^(?:\s*<!--[\s\S]*?-->)*\s*<div\s+class="([^"]*)"/.exec(after);
    const childClass = childM ? childM[1] : "";
    const childHit = !ownHit && !CARD_SURFACE_RE.test(childClass) && (PADDING_UTILITY_RE.exec(childClass) || [])[0];
    const hit = ownHit || childHit;
    if (hit) {
      const where = ownHit ? `the data-page wrapper itself (class="${ownClass}")` : `its direct child div (class="${childClass}")`;
      out.push({ role: "(shell)", level: "error", kind: "PAGE_PADDING_DOUBLE",
        msg: `data-page="${navId}" adds its own "${hit}" in ${where} — the shell's <main> already pads every page once (p-6 lg:p-8). This stacks a second inset on top. Drop the p-*/px-*/py-* here; keep space-y-*/gap-* for vertical rhythm and max-w-*/mx-auto for width if needed (kf-prototype-builder.md, "Sub-page convention").` });
    }
  }
  return out;
}

// ── undefined-helper detection ───────────────────────────────────────────────────────────────────
// STATIC, because there is nothing useful to run. A part script only REGISTERS its page function
// (`Object.assign(window.PAGES, {...})`); the body that calls the helpers does not execute until the
// user opens that page. Executing the part in a sandbox would prove exactly nothing, which is why
// this is not a jsdom problem and the file stays dependency-free.
//
// The rule is deliberately asymmetric: report only "called somewhere, bound NOWHERE", and count
// every binding form as a definition — declarations, destructuring, params, arrow params, object
// keys, catch bindings, `window.x =`. Over-approximating what counts as defined makes this
// under-report rather than cry wolf, which is the direction a gate has to fail in.
const JS_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof",
  "new", "do", "else", "delete", "void", "in", "of", "instanceof", "await", "yield", "throw", "case",
  "with", "super", "this", "try", "finally", "class", "extends", "const", "let", "var", "import", "export"]);

const HOST_GLOBALS = new Set(["console", "JSON", "Math", "Object", "Array", "String", "Number",
  "Boolean", "Date", "RegExp", "Error", "TypeError", "RangeError", "Map", "Set", "WeakMap", "WeakSet",
  "Promise", "Symbol", "BigInt", "Intl", "Proxy", "Reflect", "parseInt", "parseFloat", "isNaN",
  "isFinite", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "structuredClone",
  "queueMicrotask", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "fetch", "alert", "confirm", "prompt", "document", "window", "globalThis",
  "navigator", "location", "history", "localStorage", "sessionStorage", "getComputedStyle", "matchMedia",
  "CustomEvent", "Event", "URL", "URLSearchParams", "Blob", "File", "FileReader", "FormData",
  "AbortController", "TextEncoder", "TextDecoder", "DOMParser", "Image", "Node", "Element",
  "HTMLElement", "IntersectionObserver", "MutationObserver", "ResizeObserver"]);

// Comments are stripped first so prose like `// call fmtINR(n)` cannot register as a call site.
// The `//` rule skips a `:` immediately before, so `https://…` inside a string survives intact.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * Blank out string contents, because markup and CSS are full of things that LOOK like calls:
 * `rotate(-90 70 70)` in an SVG transform, `hsl(var(--x))` in a style, and prose like
 * "22K Gold Ring Collection (6 pcs)". Without this the check reports five phantoms for every real
 * one, and a gate with that signal-to-noise gets muted — which is worse than not having it.
 *
 * Template literals are the exception that has to be handled rather than skipped: `${fmtDate(d)}`
 * inside a markup template is a REAL call site, and in this very build it was where two of the
 * three undefined helpers lived. So the literal text is dropped and each `${…}` expression is kept
 * and recursively stripped.
 *
 * Runs AFTER stripComments, not before: an apostrophe in a comment ("doesn't") would otherwise open
 * a string that never closes and swallow the rest of the file.
 */
function stripStrings(code) {
  let out = "", i = 0;
  // A `/` opens a REGEX rather than a division when the previous meaningful token cannot end an
  // expression. This is not pedantry: `const re = /['"]/;` used to open a string that never closed
  // and swallowed the rest of the file, silently disabling the whole check from that line on — a
  // synthetic test caught it reporting NOTHING for an undefined call two statements later.
  const regexCanStart = () => {
    const prev = out.replace(/\s+$/, "").slice(-1);
    return prev === "" || !/[\w$)\]]/.test(prev);
  };
  while (i < code.length) {
    const c = code[i];
    if (c === "/" && regexCanStart()) {
      i++;
      let inClass = false;
      while (i < code.length) {
        if (code[i] === "\\") { i += 2; continue; }
        if (code[i] === "[") inClass = true;
        else if (code[i] === "]") inClass = false;
        else if (code[i] === "/" && !inClass) break;
        else if (code[i] === "\n") break; // unterminated — bail rather than eat the file
        i++;
      }
      i++;
      while (i < code.length && /[gimsuyd]/.test(code[i])) i++; // flags
      out += " RE ";
    } else if (c === '"' || c === "'") {
      i++;
      while (i < code.length && code[i] !== c) { if (code[i] === "\\") i++; i++; }
      i++; out += '""';
    } else if (c === "`") {
      i++;
      while (i < code.length && code[i] !== "`") {
        if (code[i] === "\\") { i += 2; continue; }
        if (code[i] === "$" && code[i + 1] === "{") {
          i += 2;
          let depth = 1, expr = "";
          while (i < code.length && depth > 0) {
            if (code[i] === "{") depth++;
            else if (code[i] === "}" && --depth === 0) break;
            expr += code[i]; i++;
          }
          i++; out += " " + stripStrings(expr) + " ";
          continue;
        }
        i++;
      }
      i++; out += '""';
    } else { out += c; i++; }
  }
  return out;
}

/** Comments out, then string contents out — the form both binding and call scanning expect. */
const codeOnly = (src) => stripStrings(stripComments(src));

function boundNames(code) {
  const names = new Set();
  const addList = (s) => {
    for (const raw of String(s).split(",")) {
      const t = raw.trim().replace(/^\.\.\./, "").replace(/[=:].*$/s, "").trim();
      if (/^[A-Za-z_$][\w$]*$/.test(t)) names.add(t);
    }
  };
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // Multi-declarator statements bind EVERY name, not just the first: `var a = ADM.a, b = ADM.b;`
  // binds b too. Missing this flagged 10 alias helpers in a correct part as UNDEFINED_HELPER (the
  // whole admin role read as broken). `, name =` also matches default params — harmless here, this
  // set exists to suppress false errors, and a param name in it can only suppress, never create one.
  for (const m of code.matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g)) names.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) addList(m[1]);
  for (const m of code.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) names.add(m[1]);
  for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of code.matchAll(/\bfunction\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)) addList(m[1]);
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) addList(m[1]);
  for (const m of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) names.add(m[2]);
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) names.add(m[1]);
  return names;
}

/**
 * Identifiers used in CALL position, excluding method calls (`x.foo()`) and keywords (`if (`).
 *
 * `window.foo()` is included even though it is a property access, because a helper reached that way
 * is the same bug wearing a different spelling — this build called two helpers bare and the third as
 * `window.initials(...)`, and a check that caught only the first two would have declared the page
 * fixed while it still threw. Bare names throw ReferenceError, `window.` ones TypeError; both blank
 * everything below the call.
 */
function calledNames(code) {
  const bare = new Set(), viaWindow = new Set();
  for (const m of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!JS_KEYWORDS.has(m[2])) bare.add(m[2]);
  }
  for (const m of code.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*\(/g)) viaWindow.add(m[1]);
  return { bare, viaWindow };
}

/**
 * Only `window.x = …` assignments. Kept separate from boundNames on purpose: this build's inventory
 * page does `const initials = window.initials(item.soldTo)`, and checking a `window.` call against
 * the everything-bucket lets that local `const` vouch for a window property it does not define —
 * the call still throws TypeError at runtime. A property has to be assigned to be a property.
 */
function windowAssignedNames(code) {
  const names = new Set();
  for (const m of code.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) names.add(m[1]);
  return names;
}

// which id="…" containers a chunk of markup declares (targets of a render loop)
function declaredIds(html) {
  const ids = new Set();
  for (const m of html.matchAll(/\bid="([a-zA-Z0-9_-]+)"/g)) ids.add(m[1]);
  return ids;
}

// RAW / UNCOMPILED Tailwind runtime — the single most catastrophic published-prototype failure. A
// document that still carries the browser CDN, a `<style type="text/tailwindcss">` block, or an
// unresolved `@import "tailwindcss/…"` compiles in the VIEWER'S browser, which 404s the two relative
// imports inside a preview host and dies with CssSyntaxError — every rule on the page vanishes and an
// unstyled icon fills the screen. proto-precompile.mjs turns that into static CSS; this check is the
// gate that proves it happened, so an uncompiled page can never be published as "ready". Exported so
// the publication boundary can run it against partial AND final artifacts.
export function rawTailwindFindings(html) {
  const out = [];
  if (/<script\b[^>]*\btailwindcss\/browser@/i.test(html))
    out.push({ role: "(shell)", level: "error", kind: "RAW_TAILWIND_RUNTIME", msg: "browser Tailwind CDN (@tailwindcss/browser@…) present — the CSS was never pre-compiled; it will 404 tailwindcss/*.css inside a preview host and render unstyled" });
  if (/<style\s+type=["']text\/tailwindcss["']/i.test(html))
    out.push({ role: "(shell)", level: "error", kind: "UNCOMPILED_PROTOTYPE_CSS", msg: "<style type=\"text/tailwindcss\"> block present — raw Tailwind source, not compiled CSS; publish must precompile it first" });
  if (/@import\s+["']tailwindcss(?:\/[^"']*)?["']/i.test(html))
    out.push({ role: "(shell)", level: "error", kind: "UNRESOLVED_TAILWIND_IMPORT", msg: "unresolved @import \"tailwindcss/…\" — resolves to a relative URL in the browser and 404s; the compiler must inline it" });
  return out;
}

export function verify(html) {
  const roles = [...html.matchAll(ROLEVIEW_RE)].map((m) => m[1].toLowerCase());
  const findings = []; // { role, level:'error'|'warn', kind, msg }

  // FIRST, and for every artifact (partial or final): the page must carry compiled CSS, not a raw
  // Tailwind runtime. This is the failure that ships an unstyled page and still says "ready".
  for (const f of rawTailwindFindings(html)) findings.push(f);

  // 0. THE BLANK-PAGE CHECK. Every per-role check below can pass while the assembled page renders
  // nothing at all: the shell's boot reads window.ROLES in switchRole(), the role <select> and
  // boot() itself, and for months nothing ever WROTE it — three shipped prototypes were
  // chrome-only blanks with an empty role switcher and a green PASS (2026-08-02). A verifier that
  // cannot catch "the page is empty" is checking the wrong thing, so this is now the first check.
  if (/window\.ROLES\b/.test(html) && !/window\.ROLES\s*=/.test(html))
    findings.push({ role: "(shell)", level: "error", kind: "NO_ROLES_DATA",
      msg: "the shell reads window.ROLES but nothing defines it — every page stays hidden and the role switcher is empty (regenerate the shell: design-language.mjs shell <experience-spec.json>)" });
  if (roles.length && !/window\.PAGES\s*=/.test(html))
    findings.push({ role: "(shell)", level: "error", kind: "NO_PAGES_DATA",
      msg: "no window.PAGES registration anywhere — no role part registered a page renderer" });

  // 0c. KF_APP_METHOD_MISSING — the client SDK's `kf.app` object has a FIXED method set. A call to any
  // other name throws "is not a function" synchronously and blanks the whole app (t.app.getRoles crash,
  // 2026-08). getRoles/switchRole are the recurring hallucination — they do NOT exist on the SDK; the
  // current role is `kf.user?.Role?.Name` and roles are `kf.user.AppRoles`, neither a method call. Static
  // check (no browser), same as every other here — the offline mock never exercises the real SDK.
  const KF_APP_METHODS = new Set(["getDataform", "getBoard", "getProcess", "getComponent", "getVariable", "getParameter", "getAllParameters"]);
  for (const m of html.matchAll(/\bkf\.app\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!KF_APP_METHODS.has(m[1]))
      findings.push({ role: "(shell)", level: "error", kind: "KF_APP_METHOD_MISSING",
        msg: `kf.app.${m[1]}() is not a client-SDK method — kf.app has only ${[...KF_APP_METHODS].join(", ")}. It throws "is not a function" and blanks the app. The signed-in role is kf.user?.Role?.Name (kf.user.Role is {_id,Name}); there is no getRoles/switchRole.` });
  }

  // 0b. CSS_COMMENT_BREAK — a /* ... */ comment inside a <style> block whose own PROSE contains
  // the two characters "*/" closes early, mid-sentence; everything after that point (the rest of
  // the intended comment, in plain English) becomes real, unparseable CSS. The Tailwind v4 CDN
  // compiler throws a CssSyntaxError and aborts, and NOTHING downstream in the stylesheet compiles
  // — the whole page loses its styling (shipped live, 2026-08-13: one comment about box-sizing
  // wrote "px-*/border-*" as shorthand, and the entire prototype rendered as one giant unstyled
  // icon with no nav, no cards, nothing). No browser involved in this check on purpose — the
  // in-browser version of this bug (headless Chrome + console capture) was considered and
  // rejected: capture-screens.mjs is explicit that it no-ops with no Chrome installed, which is
  // exactly the environment client-facing generation cannot assume, so a Chrome-dependent check
  // would silently skip itself in production and report false-clean. This one is static and
  // dependency-free like every other check here, so it runs everywhere the others do.
  //
  // Mechanism: strip quoted string VALUES first — `content: "*/"` is rare but 100% legal CSS, and
  // a "*/" or "/*" inside quotes is inert, not comment syntax (caught as a false positive while
  // testing this check, on exactly that case). Only once strings are blanked out do we strip every
  // /* ... */ pair the same way a real CSS parser does — greedy toward the FIRST "*/", not the
  // last. Two shapes of stray token can be left over:
  //   - a bare "*/" outside any comment/string — never valid CSS on its own — proves an earlier
  //     comment closed prematurely and this is the leftover close of what was meant to be one.
  //   - a bare "/*" with nothing after it that closes — an unterminated comment ate the rest of
  //     the stylesheet silently (the complementary failure: forgetting the close entirely).
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = m[1];
    const noStrings = css.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (s) => "x".repeat(s.length));
    const stripped = noStrings.replace(/\/\*[\s\S]*?\*\//g, "");
    if (stripped.includes("*/")) {
      const idx = stripped.indexOf("*/");
      findings.push({ role: "(shell)", level: "error", kind: "CSS_COMMENT_BREAK",
        msg: `a /* comment */ in the <style> block closes early — some earlier comment's own prose contains the characters "*/", ending it mid-sentence. Everything after that point is unparseable CSS and the WHOLE stylesheet fails to compile (no nav, no cards, no styling at all). Orphaned close found near: "${stripped.slice(Math.max(0, idx - 40), idx).trim()}…*/". Search the <style> block for "*/" appearing inside comment prose and rephrase it (e.g. write "padding/border" instead of "px-*/border-*").` });
    } else if (stripped.includes("/*")) {
      const idx = stripped.indexOf("/*");
      findings.push({ role: "(shell)", level: "error", kind: "CSS_COMMENT_BREAK",
        msg: `an unterminated /* comment in the <style> block never closes — everything after it (the rest of the stylesheet) is silently swallowed as comment text and never compiles. Starts near: "/*${stripped.slice(idx + 2, idx + 42).trim()}…".` });
    }
  }

  // 1. leftover @PART markers = a part the shell wanted was never spliced
  for (const m of html.matchAll(ROLE_MARKER_RE))
    findings.push({ role: m[1].toLowerCase(), level: "error", kind: "MISSING_PART", msg: `unspliced marker @PART:role-${m[1]} (part missing or never generated)` });

  // 2. syntax-check every <script>, attributing part scripts to their role
  const partScripts = new Map(); // role -> [code,…]
  for (const m of html.matchAll(PART_SCRIPT_RE)) {
    const role = m[1].toLowerCase();
    if (!partScripts.has(role)) partScripts.set(role, []);
    partScripts.get(role).push(m[2]);
    const err = syntaxError(m[2]);
    if (err) findings.push({ role, level: "error", kind: "SCRIPT_SYNTAX", msg: `<script> fails to parse → whole part is dead: ${err}` });
    // PAGES_CLOBBER / PAGES_DROPPED — a part that PLAIN-ASSIGNS window.PAGES wipes (or is wiped by)
    // every other role's page renderers, so whole roles render dead with NO console error (live build
    // 2026-07-25). Only additive registration is safe: window.PAGES = window.PAGES || {}; Object.assign.
    //
    // Judged PER ASSIGNMENT — see pagesAssignments(). Testing the whole part body meant one safe idiom
    // anywhere in the file exempted every real clobber elsewhere in it: a part that opened with the
    // guarded line and then reassigned `window.PAGES = {…}` further down passed clean, which is the
    // exact shipping failure this rule exists to stop.
    for (const a of pagesAssignments(m[2])) {
      if (a.kind === "clobber")
        findings.push({ role, level: "error", kind: "PAGES_CLOBBER", msg: `part assigns \`${a.text}\` — clobbers other roles' page renderers; use window.PAGES = window.PAGES || {}; Object.assign(window.PAGES, {…})` });
      else if (a.kind === "dropped")
        findings.push({ role, level: "error", kind: "PAGES_DROPPED", msg: `\`${a.text}\` — the map is DISCARDED if another part registered first; use window.PAGES = window.PAGES || {}; Object.assign(window.PAGES, {…})` });
    }
    for (const f of popupChromeFindings(role, m[2])) findings.push(f);
  }
  // any non-part (shell) scripts too — a broken shell script kills every role
  const partBodies = new Set([...partScripts.values()].flat());
  for (const m of html.matchAll(SCRIPT_TAG_RE)) {
    const attrs = m[1] || "", body = m[2];
    if (partBodies.has(body)) continue;
    // A React/vite build is an ES module — `<script type="module">` — and legitimately uses import.meta
    // / import / export, which `syntaxError` (vm.compileFunction, classic-script goal) rejects with
    // "Cannot use 'import.meta' outside a module". This SYNTAX check exists for the HTML prototype's
    // classic inline scripts; a module bundle is compiled by vite and proven by the runtime smoke, so it
    // is not re-parsed here. Without this skip, every React build failed verify the moment react became
    // the default medium (SCRIPT_SYNTAX on the shell script), and nothing published.
    if (/\btype\s*=\s*["']?module\b/i.test(attrs)) continue;
    const err = syntaxError(body);
    if (err) findings.push({ role: "(shell)", level: "error", kind: "SCRIPT_SYNTAX", msg: `shell <script> fails to parse: ${err}` });
    for (const f of popupChromeFindings("(shell)", body)) findings.push(f);
  }

  // 2d. DESIGN-SYSTEM CONFORMANCE — three rules from one shipped failure (clinic-ops regen,
  // 2026-08-16, caught by the USER from screenshots after every check here passed green): three of
  // seven role pages were authored in the pre-2026-08-13 kit vocabulary and looked like a different
  // product; five parts carried colour literals no theme change can ever touch (including Beacon's
  // orange glow copied as rgba into a blue app); and two pages had cards overlapping because `h-full`
  // inside an auto-sized grid wrapper freezes the row at its pre-chart height (charts are injected by
  // JS after first layout; row 171px, content 211px, overflow visible). None of that is a rendering
  // failure — the page "works" — which is exactly why it needs its own gate: conformance and
  // geometry are invisible to does-it-render checks.
  {
    const KIT_MARKS = /\b(?:shadow-panel|card-pad-(?:metric|list|doc)|text-kpi|row-shape|chip-shape|avatar-shape|overlay-shape)\b/;
    const STOCK_PALETTE = /\b(?:bg|text|border|from|via|to|fill|stroke|ring|divide)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;
    const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
    // a literal digit right after the paren — skips runtime construction like `'hsl(' + h`
    const FUNC = /\b(?:rgb|hsl)a?\(\s*[\d.]/g;
    const NEUTRAL = /^#(?:fff(?:fff)?|000(?:000)?)$/i;
    const WHITE_BLACK_FUNC = /\b(?:rgb|hsl)a?\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\s*[,)]/;
    // the full rv-<role> span (section 3's lazy …*?</section> stops at the first NESTED section,
    // which is fine for its mount checks but would hide most of a part from a census)
    const spanOf = (role) => {
      const start = html.indexOf(`id="rv-${role}"`);
      if (start < 0) return "";
      const rest = html.slice(start);
      const next = rest.slice(8).search(/id="rv-|<\/main>/);
      return next < 0 ? rest : rest.slice(0, next + 8);
    };
    for (const role of roles) {
      const markup = spanOf(role);
      const scripts = (partScripts.get(role) || []).join("\n");
      const body = markup + "\n" + scripts;
      // a) a part written against a RETIRED design era: real cards, zero current-kit vocabulary
      const cards = (markup.match(/class="[^"]*\b(?:bg-card|bg-surface)\b/g) || []).length
                  + (scripts.match(/class=\\?"[^"\\]*\b(?:bg-card|bg-surface)\b/g) || []).length;
      if (cards >= 2 && !KIT_MARKS.test(body))
        findings.push({ role, level: "error", kind: "PART_PREDATES_KIT",
          msg: `this part uses NONE of the current kit's vocabulary (shadow-panel / card-pad-* / text-kpi / row-shape…) across ${cards} card surfaces — it was authored against a retired design era and renders as a visibly different product next to conforming roles. "It renders correctly" is not conformance: rebuild the part against engine/proto-kit/COMPONENTS.md (the recipes are the entire vocabulary), do not patch classes one by one.` });
      // b) colour literals — values no design slice, hue-shift or theme variant can ever reach
      const literals = [];
      for (const m of body.match(HEX) || []) if (!NEUTRAL.test(m)) literals.push(m);
      for (const m of body.match(FUNC) || []) { const at = body.indexOf(m); const whole = body.slice(at, at + 60).match(/^[a-z]*\([^)]*\)?/i)?.[0] || m; if (!WHITE_BLACK_FUNC.test(whole)) literals.push(whole.slice(0, 40)); }
      for (const m of body.match(STOCK_PALETTE) || []) literals.push(m);
      if (literals.length) {
        const sample = [...new Set(literals)].slice(0, 6).join(", ");
        findings.push({ role, level: "error", kind: "COLOR_LITERAL",
          msg: `${literals.length} hardcoded colour(s) — e.g. ${sample}. A literal is invisible to the theme: Beacon's orange glow shipped inside a blue app exactly this way (rgba(255,98,3,…) copied from a recipe), and stock-palette classes (bg-rose-50, text-amber-700…) bypass the token system entirely. Use the contract's tokens: state pairs (danger/warning/success -bg/-ink), --chart-N for categories, --color-scrim for scrims, and shadow tokens (--shadow-primary) rather than their expansions.` });
      }
      // c) the frozen-grid-row overlap: h-full card inside an auto-sized grid wrapper
      if (/class="[^"]*\bcol-span-[^"]*"[^>]*>\s*<(?:section|div)\b[^>]*class="[^"]*\bh-full\b/.test(body))
        findings.push({ role, level: "error", kind: "FROZEN_GRID_ROW",
          msg: `a card with h-full sits inside an auto-sized grid wrapper (col-span-*). Part content is JS-injected AFTER first layout, so height:100% locks the row at its pre-injection height and the injected content overflows onto the next row (measured live: row 171px, card content 211px, cards overlapping). Put the card classes on the grid child itself, or drop h-full — never both a col-span wrapper and an h-full card.` });
    }
  }

  // 2b2. TITLE_SIZE_DRIFT — whole-file, not per-role: a shared design system means every role's card
  // titles should read the same size, so this compares across roles on purpose, not just within one.
  {
    const shapes = new Map(); // shape string -> count
    for (const m of html.matchAll(H3_RE)) {
      const shape = titleShape(m[1]);
      if (shape) shapes.set(shape, (shapes.get(shape) || 0) + 1);
    }
    if (shapes.size > 1) {
      const list = [...shapes.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${n}× "${s}"`).join(", ");
      findings.push({ role: "(shell)", level: "warn", kind: "TITLE_SIZE_DRIFT",
        msg: `card/panel titles (<h3>) use ${shapes.size} different type shapes across this app: ${list}. Pick one — COMPONENTS.md's CardTitle recipe ("font-display text-lg font-medium leading-none tracking-[-.015em]") is canonical — and use it for every card/panel title; see kf-prototype-builder.md's Rules.` });
    }
  }

  // 2b3. DEAD_THEME_TOKEN — whole-file, same reasoning as TITLE_SIZE_DRIFT: the declaration and the
  // reading style="" may live in different parts (shell.html declares tokens; a part's inline style
  // reads them), so this has to see the whole assembled document, not one role's slice of it.
  for (const f of deadThemeInlineTokens(html)) findings.push(f);

  // 2b4. PAGE_PADDING_DOUBLE — whole-file: data-page sections come from every role's part, and the
  // <main> they all stack against lives in the shell, not any one part.
  for (const f of pagePaddingDouble(html)) findings.push(f);

  // 2c. UNDEFINED_HELPER — a name a part CALLS that nothing anywhere in the file BINDS. Bindings are
  // collected from every script in the assembled document (the shell's helpers, the seed part's
  // formatters, the part's own locals), so this only fires when the definition is genuinely absent.
  {
    const allCode = codeOnly([...html.matchAll(SCRIPT_RE)].map((m) => m[1]).join("\n"));
    const defined = boundNames(allCode);
    const onWindow = windowAssignedNames(allCode);
    for (const [role, bodies] of partScripts) {
      const called = calledNames(codeOnly(bodies.join("\n")));
      const missing = [
        ...[...called.bare].filter((n) => !defined.has(n) && !HOST_GLOBALS.has(n)),
        ...[...called.viaWindow].filter((n) => !onWindow.has(n) && !HOST_GLOBALS.has(n)).map((n) => `window.${n}`),
      ].sort();
      if (missing.length)
        findings.push({ role, level: "error", kind: "UNDEFINED_HELPER",
          msg: `calls ${missing.map((n) => `${n}()`).join(", ")} — defined nowhere in the assembled page. `
             + `The script parses, so this only throws when someone opens the page, and every widget after `
             + `the first call renders blank. Shell/seed helpers go in parts/seed.html (see COMPONENTS.md `
             + `§ "Shell globals available to part scripts").` });
    }
  }

  // 2b. `${…}` left in MARKUP. A part file is plain HTML: interpolation only works inside a JS
  // template literal, so a `${EMPTY_ICON}` in the body ships to the page as those literal characters.
  // It reads as a typo the user sees before anyone else does (live build 2026-07-30).
  const markupOnly = html.replace(SCRIPT_RE, "");
  for (const m of markupOnly.matchAll(/\$\{\s*[A-Za-z_$][\w$.]*\s*\}/g)) {
    const before = markupOnly.slice(0, m.index);
    const rv = [...before.matchAll(/id="rv-([a-z0-9_-]+)"/gi)].pop();
    findings.push({ role: rv ? rv[1].toLowerCase() : "(shell)", level: "error", kind: "LITERAL_PLACEHOLDER",
      msg: `${m[0]} sits in markup, not in a template literal — it renders as those exact characters` });
  }

  // 3. per role: roleview markup declares containers its script never fills → will render empty
  for (const role of roles) {
    const rv = html.match(new RegExp(`id="rv-${role}"[\\s\\S]*?</section>`, "i"));
    if (!rv) { findings.push({ role, level: "error", kind: "NO_ROLEVIEW", msg: `no <section id="rv-${role}">` }); continue; }
    const scripts = (partScripts.get(role) || []).join("\n");
    if (!scripts.trim()) { findings.push({ role, level: "warn", kind: "NO_SCRIPT", msg: "role has no <script> — every widget is static/empty" }); continue; }
    // ids declared in markup but never targeted by getElementById in this role's scripts
    const targeted = new Set([...scripts.matchAll(/getElementById\(\s*["'`]([a-zA-Z0-9_-]+)["'`]/g)].map((m) => m[1]));
    // only flag empty "mount point" ids: ones whose element is declared empty (no inner content follows immediately)
    const emptyMounts = [...rv[0].matchAll(/id="([a-zA-Z0-9_-]+)"\s*>\s*<\/[a-z]+>/gi)].map((m) => m[1]);
    const orphans = emptyMounts.filter((id) => id.startsWith(role + "-") && !targeted.has(id));
    if (orphans.length) findings.push({ role, level: "warn", kind: "EMPTY_CONTAINER", msg: `container(s) declared but never populated: ${orphans.join(", ")}` });

    // 3b. CARDLESS_WIDGET — a filled mount whose injected content is chart-shaped (contains an
    // <svg …viewBox), but whose STATIC declaration has no card ancestor nearby. Static heuristic like
    // EMPTY_CONTAINER above: look at the assignment's own script window for the <svg viewBox tell,
    // and at a window of markup immediately before the mount's id="…" for a card class. Both windows
    // are generous enough to span "const chartHTML = `…svg…`; …; document.getElementById(id)…" and
    // "<div class="bg-surface …"><h3>Title</h3><div id="…">" without reaching into a NEIGHBOURING
    // widget's card — tuned against this app's own fixed instance, not a guess.
    for (const id of emptyMounts.filter((i) => targeted.has(i))) {
      const call = new RegExp(`getElementById\\(\\s*["'\`]${id}["'\`]\\s*\\)[^\\n;]{0,80}?\\.innerHTML\\s*=`);
      const m = call.exec(scripts);
      if (!m) continue;
      const svgWindow = scripts.slice(Math.max(0, m.index - 1600), m.index + 300);
      // preserveAspectRatio="none" is the specific, deliberate tell for a real chart/spark SVG in
      // this codebase (the non-uniform stretch a 0–100 viewBox needs to fill a wide short card) —
      // a small fixed-aspect icon SVG (search glass, nav glyph, …) never sets it, so testing for it
      // instead of a bare <svg…viewBox> avoids flagging every icon-bearing container in the app.
      if (!/<svg\b[^>]*\bpreserveAspectRatio\s*=\s*["']none["']/.test(svgWindow)) continue;
      const idIdx = rv[0].indexOf(`id="${id}"`);
      if (idIdx < 0) continue;
      const markupBefore = rv[0].slice(Math.max(0, idIdx - 320), idIdx);
      if (/\b(?:bg-surface|bg-card)\b/.test(markupBefore)) continue; // has a card ancestor — fine
      findings.push({ role, level: "warn", kind: "CARDLESS_WIDGET",
        msg: `#${id} renders chart markup (<svg viewBox) with no bg-surface/bg-card card ancestor in its static wrapper — it will render on the bare page canvas with no surface, shadow, corners or padding. Wrap it (and its heading) in a bg-surface shadow-panel rounded-xl card-pad-metric container, matching every other widget on the page.` });
    }
  }

  // 4. TEMPLATE_LEAK — `${…}` that reached the MARKUP. Inside a backtick template literal that is a
  //    value; in static HTML it is TEXT, so the user reads `${fmtMoney(8850)}` where the number
  //    belongs and `${ICON('chart','')}` where the icon belongs. Nothing else catches this: the page
  //    parses, every script compiles, every container is populated — it is simply WRONG on screen,
  //    which is the one failure a syntax check can never see. (Live build 2026-08-08.)
  const noScript = html.replace(SCRIPT_RE, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const rvAt = [...noScript.matchAll(/id="rv-([a-z0-9_-]+)"/gi)].map((m) => ({ i: m.index, role: m[1].toLowerCase() }));
  const roleAt = (idx) => {
    let r = "(shell)";
    for (const s of rvAt) { if (s.i <= idx) r = s.role; else break; }
    return r;
  };
  const leaks = new Map(); // role → up to 3 samples, so the report names the widget, not just the file
  for (const m of noScript.matchAll(/\$\{[^{}]{1,120}\}/g)) {
    const role = roleAt(m.index);
    if (!leaks.has(role)) leaks.set(role, []);
    const seen = leaks.get(role);
    if (seen.length < 3) seen.push(m[0].replace(/\s+/g, " ").slice(0, 60));
  }
  for (const [role, samples] of leaks)
    findings.push({ role, level: "error", kind: "TEMPLATE_LEAK", msg: `template syntax rendered as literal TEXT: ${samples.join("  ")} — markup built with a quoted string instead of a backtick template literal (or written straight into static HTML, where \${} means nothing)` });

  // 5. HANDLER_LEAK — an inline handler that BUILDS MARKUP, cut in half by its own quoting.
  //
  //      <button onclick="const form = `<h3 class="t">New briefing</h3>`; window.openPopup(form); ">
  //
  //    Inside a double-quoted attribute the FIRST `"` ends the attribute — here the one in
  //    class="t". The browser keeps `const form = ` as the handler, then reads the remainder as
  //    markup and text, so the page shows the tail of the user's own source:
  //
  //      `; window.openPopup(form); ">
  //
  //    printed under the card, above a button that now does nothing. (Live build: BriefingHub,
  //    2026-08-09.)
  //
  //    Every other check passes: the file parses, the <script>s compile, no ${} survived, no
  //    container is empty. The break is in an ATTRIBUTE, which is not JavaScript to a syntax checker
  //    and not a container to the empty check — so it is looked for where it is visible, in the text
  //    the page renders. That also makes the check indifferent to how the quoting broke: anything
  //    that puts code on screen is caught, not just this spelling.
  //
  //    The real rule is one line, and it is enforced here because a prompt cannot enforce it: markup
  //    never goes inside an on*="" attribute. Name a function, define it in <script>, call it.
  const JS_TELLS = [
    [/window\.\w+\s*\(/, "a call to window.*() is being read as text"],
    [/document\.(?:getElementById|querySelector(?:All)?)\s*\(/, "a DOM lookup is being read as text"],
    [/\.innerHTML\s*=/, "an innerHTML assignment is being read as text"],
    [/\bclassList\.(?:add|remove|toggle)\s*\(/, "a classList call is being read as text"],
    [/`\s*;/, "the end of a template literal is being read as text"],
    [/"\s*>\s*$/, "the tail of an attribute the browser gave up on"],
  ];
  const broken = new Map();  // role → up to 3 samples
  // `>` is allowed INSIDE the run on purpose: the stray `">` the browser could not use is part of
  // what the reader is seeing, and excluding it would skip the very text this check exists for.
  //
  // But a `>` INSIDE A QUOTED ATTRIBUTE VALUE is not a tag boundary to a real browser, and this
  // codebase's own Tailwind arbitrary-variant idiom writes exactly that: `[&>svg]:size-3.5` (Feed.jsx,
  // Chips.jsx, Callout.jsx, Floating.jsx, Feedback.jsx all use it). Scanning the raw string as-is
  // makes the tag-boundary regex below treat that `>` as a real close, splitting one well-formed
  // element into a false "leak" spanning the rest of its own attributes. Mask `>`/`<` characters
  // found INSIDE `"…"`/`'…'` attribute-value spans before running the scan — real tag structure and
  // real inter-element text are untouched, only the false boundary inside a quoted value disappears.
  const attrSafe = noScript.replace(/=("|')[^"']*\1/g, (m) => m.replace(/[<>]/g, "·"));
  for (const seg of attrSafe.matchAll(/>([^<]{4,400})</g)) {
    const text = seg[1].trim();
    if (!text) continue;
    const hit = JS_TELLS.find(([re]) => re.test(text));
    if (!hit) continue;
    const role = roleAt(seg.index);
    if (!broken.has(role)) broken.set(role, []);
    const seen = broken.get(role);
    if (seen.length < 3) seen.push(`${text.replace(/\s+/g, " ").slice(0, 70)}  (${hit[1]})`);
  }
  for (const [role, samples] of broken)
    findings.push({ role, level: "error", kind: "HANDLER_LEAK", msg: `source code rendered as page text: ${samples.join("  ·  ")} — an inline on*="…" handler built markup inline, and the first quote inside that markup closed the attribute. Move the markup into a named function in <script> and call it by name from the handler` });

  // 6. TABLE_ORPHAN — table rows written into something that is not a table.
  //
  //    Assigning `<tr>…</tr>` to the innerHTML of a <div> does not fail and does not warn. The parser
  //    simply DISCARDS the tr and td tags, because they are not valid there, and keeps the text
  //    inside them. What lands on screen is every cell of every row run together in one paragraph,
  //    under a header that still looks like a table because the header was written in real markup.
  //    (Live build: POF Risk & HAZID Manager, 2026-08-10 — 16 assessments as one block of prose.)
  //
  //    Nothing else sees it: the file parses, the script compiles, the container is populated, so the
  //    empty check is satisfied by the very text that proves it went wrong.
  const bodies = new Map();  // container id → tag name it was declared as
  for (const m of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"/g)) if (!bodies.has(m[2])) bodies.set(m[2], m[1].toLowerCase());
  const orphans = new Map();
  for (const [, body] of html.matchAll(SCRIPT_RE)) {
    // `el.innerHTML = "…<tr…"` in any of the spellings the builder uses
    for (const a of body.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)[^\n;]{0,80}?\.innerHTML\s*=/g)) {
      const id = a[1];
      // Scoped to THIS assignment. A wide lookahead found a <tr> belonging to a later statement and
      // blamed an icon container for it — 51 false positives on one prototype, which is how a check
      // gets switched off. Stop at the next getElementById or the end of the statement.
      const rest = body.slice(a.index + a[0].length);
      const stops = [rest.indexOf("getElementById("), rest.indexOf(";\n")].filter((i) => i >= 0);
      const tail = rest.slice(0, Math.min(400, ...(stops.length ? stops : [400])));
      if (!/<tr\b/i.test(tail)) continue;
      const tag = bodies.get(id);
      if (tag && tag !== "tbody" && tag !== "table" && tag !== "thead" && tag !== "tfoot") {
        if (!orphans.has(id)) orphans.set(id, tag);
      }
    }
  }
  for (const [id, tag] of orphans) {
    findings.push({ role: roleAt(html.indexOf(`id="${id}"`)), level: "error", kind: "TABLE_ORPHAN",
      msg: `rows are written into <${tag} id="${id}">, which is not a table — the parser drops every <tr> and <td> and leaves their text run together in one block. Put the rows in a <tbody id="${id}"> inside the <table>` });
  }

  const errorRoles = [...new Set(findings.filter((f) => f.level === "error").map((f) => f.role))];
  const warnRoles = [...new Set(findings.filter((f) => f.level === "warn").map((f) => f.role))];
  return { roles, findings, errorRoles, warnRoles, pass: errorRoles.length === 0 };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const file = process.argv[2];
  if (!file) { console.error("usage: proto-verify.mjs <assembled-index.html>"); process.exit(2); }
  if (!existsSync(file)) { console.error(`proto-verify: no such file: ${file}`); process.exit(2); }
  const r = verify(readFileSync(file, "utf8"));
  for (const f of r.findings) console.log(`  ${f.level === "error" ? "✗" : "⚠"} [${f.role}] ${f.kind}: ${f.msg}`);
  console.log(`\n${r.pass ? "✅ PASS" : "❌ FAIL"} — ${r.roles.length} roles · ${r.errorRoles.length} with errors${r.warnRoles.length ? ` · ${r.warnRoles.length} with warnings` : ""}`);
  if (!r.pass) console.log(`   broken roles: ${r.errorRoles.join(", ")}`);
  process.exit(r.pass ? 0 : 1);
}
