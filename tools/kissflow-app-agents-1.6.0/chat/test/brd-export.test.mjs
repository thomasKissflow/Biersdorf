// brd-export.test.mjs — the BRD you send is the BRD you approved.
//
// The export cloned the document and wrapped it in twelve hand-written rules: a different font, no
// chips, no cards, none of the colour that separates a requirement from a note. So the thing
// circulated for sign-off looked nothing like the thing on screen, and the report that followed was
// "give me the BRD as it is on the screen, with styles".
//
// Identical in kind to the ER diagram export, fixed the same way: appearance lives in the PAGE
// stylesheet, so anything cloned out of the page and sent elsewhere must carry the rules with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "engine", "review.mjs"), "utf8");
// the function closes on the same line as its return, so anchor on the document it emits
const brdHTML = SRC.match(/function brdHTML\(\)\{[\s\S]*?<\/body><\/html>'\}/);
assert.ok(brdHTML, "brdHTML() must exist");

test("the export carries the page's own styles, not a hand-written impression of them", () => {
  assert.match(SRC, /function brdCSS\(\)/, "there must be a harvester");
  const css = SRC.match(/function brdCSS\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(css, /document\.styleSheets/, "harvested from the document, so it cannot drift from the screen");
  assert.match(css, /try\{rules=sheet\.cssRules\}catch/, "a cross-origin sheet must not throw the whole export away");
  assert.match(brdHTML[0], /brdCSS\(\)/);
});

test("every rule is taken, not a chosen subset", () => {
  const css = SRC.match(/function brdCSS\(\)\{[\s\S]*?\n  \}/)[0];
  assert.ok(!/selectorText/.test(css),
    "filtering by selector is a second copy of the design — wrong the first time somebody adds a class");
});

test("the wrapper element survives, or half the rules stop matching", () => {
  assert.match(brdHTML[0], /clone\.outerHTML/,
    "innerHTML drops the .brd wrapper, and rules written as '.brd .story' go with it");
  assert.ok(!/clone\.innerHTML/.test(brdHTML[0]));
});

test("a hidden tab is not exported hidden", () => {
  assert.match(brdHTML[0], /clone\.style\.display=""/,
    "the clone can carry display:none from the tab it was hiding behind");
  assert.match(brdHTML[0], /\.brd,\.brdview\{display:block!important\}/);
});

test("it is a document, with a name and a date on it", () => {
  assert.match(brdHTML[0], /brdx-h/);
  assert.match(brdHTML[0], /toLocaleDateString/, "a sign-off document that does not say when is worth less");
});

test("it paginates like something meant to be signed", () => {
  assert.match(brdHTML[0], /@media print\{thead\{display:table-header-group\}/, "a table's header repeats on every page");
  assert.match(brdHTML[0], /tr,\.story,\.ac li\{break-inside:avoid\}/, "a row or a story is not split across a page break");
  assert.match(brdHTML[0], /h3,h4\{break-after:avoid\}/, "no heading stranded at the foot of a page");
});

test("the controls say what you get, not how it is produced", () => {
  assert.match(SRC, /id="brddl"[^>]*>⤓ HTML</, "the HTML download says HTML");
  assert.match(SRC, /id="brdprint"[^>]*>⎙ PDF</,
    "'Print' was already the PDF and nobody could tell — which is how this was reported as 'HTML only'");
});

test("the emitted page is still a valid template literal", () => {
  // review.mjs writes the whole page as one backticked string: a stray backtick in a COMMENT inside
  // the generated script terminates it, which is exactly how this change first failed to run.
  const fn = brdHTML[0] + SRC.match(/function brdCSS\(\)\{[\s\S]*?\n  \}/)[0];
  assert.ok(!fn.includes("`"), "no backticks inside the generated script");
  assert.ok(!/\$\{/.test(fn), "and no unescaped interpolation either");
});
