// app-card-design.test.mjs — the app card, from the "AI Builder All Apps" comp.
//
// Status moves to the top-right of the card, beside the name, because that is the first thing anyone
// scans a grid for. Owner moves out of the badge row into a footer with an avatar, under a hairline.
// The grid fills to the width instead of always being three columns.
//
// One constraint from the author, and it is the reason this is a test and not just a diff: THE GREEN
// FOR LIVE APPS STAYS AS IT IS. The comp draws its own green (#E9F7EF / #127A42); ours already has
// one, people recognise it, and a redesign is not a licence to move it. The status colours keep
// coming from the --st family the card already computes, so only placement and shape change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");

test("live keeps the green it already had — no colour from the comp was copied in", () => {
  const render = UI.match(/function renderHomeGrid\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(render, /it\.runtime \? \{ key: "live", label: "Live in Kissflow", \.\.\.fam\("green"\) \}/,
    "live must still resolve through the existing --green family");
  const card = UI.slice(UI.indexOf(".appcard{"), UI.indexOf(".newcard"));
  for (const hex of ["#E9F7EF", "#127A42", "#18A957", "#C6EAD5"]) {
    assert.ok(!card.includes(hex), `the comp's ${hex} must not replace the green this product already uses`);
  }
});

test("the status pill sits with the name, coloured from the card's own family", () => {
  assert.match(UI, /\.appcard \.stpill\{[^}]*color:var\(--st\)[^}]*background:var\(--st-s\)[^}]*border:1px solid var\(--st-b\)\}/,
    "the icon takes the state's own colour, on the state's own tint");
  assert.match(UI, /<span class="stpill\$\{st\.pulse \? " pulse" : ""\}" title="\$\{esc\(st\.label\)\}" role="img"/);
});

test("the owner has a footer of their own, below a hairline", () => {
  assert.match(UI, /\.appcard \.foot\{[^}]*border-top:1px solid var\(--line\)/);
  assert.match(UI, /class="oav" style="background:\$\{ownerHue\(it\.owner\)\}"/);
  assert.match(UI, /\.appcard \.foot \.oem\{[^}]*text-overflow:ellipsis/,
    "an address long enough to push the versions count off the card is the obvious failure here");
});

test("a person is the same colour every time", () => {
  const src = UI.match(/const OWNER_HUES = [^\n]*\nfunction ownerHue\(email\) \{[\s\S]*?\n\}/)[0];
  const ownerHue = new Function(`${src}; return ownerHue;`)();
  assert.equal(ownerHue("harini.v@kissflow.com"), ownerHue("harini.v@kissflow.com"));
  assert.match(ownerHue("harini.v@kissflow.com"), /^var\(--/, "from the palette, not an invented hex");
  assert.equal(ownerHue(""), ownerHue(undefined), "a missing owner must not throw");
});

test("the grid fills the width rather than always being three", () => {
  assert.match(UI, /\.homegrid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(320px,1fr\)\);gap:14px\}/);
});

// ── the corners were already taken ───────────────────────────────────────────────────────────────
// Moving the status into the header put it under the kebab (absolute, top:12 right:12, 32px), and
// moving the owner into a footer put the cost chip under the Open hint (absolute, right:16 bottom:16,
// visible on hover). Both read as "it works" until a card has a kebab, or until somebody points at it.
test("the header leaves room for the kebab", () => {
  assert.match(UI, /\.appcard \.head\{[^}]*padding-right:32px\}/,
    "without it the kebab sits on the status pill and eats the label");
  assert.match(UI, /\.appcard \.htxt\{min-width:0;flex:1\}/,
    "the reservation belongs on the row that now ends in the pill, not on the text");
});

test("the Open affordance is a chevron on the right edge, out of the footer's way", () => {
  // At the bottom-right it competed for the corner the footer needed, which is how it ended up on
  // top of the cost chip. Centred on the edge it collides with nothing.
  assert.match(UI, /\.appcard \.openhint\{[^}]*top:50%[^}]*transform:translate\(-4px,-50%\)/);
  assert.ok(!/\.appcard \.foot\{[^}]*padding-right:58px/.test(UI),
    "the footer gets its full width back once the hint is not sitting in it");
  assert.match(UI, /\.appcard \.dm\{padding-right:20px/, "the description keeps clear of the chevron");
  assert.match(UI, /<span class="openhint" aria-hidden="true">/,
    "an arrow with no words is decoration to a screen reader — the card itself is the button");
});

test("three states, as icons — Draft, Built, Live", () => {
  // Five labels asked somebody to read five cards to compare them, and "Not built yet" was eating
  // the app name. A shape and a colour are read at a glance and in any width.
  const render = UI.match(/function renderHomeGrid\(\) \{[\s\S]*?\n\}/)[0];
  for (const k of ["draft", "built", "live", "building"]) {
    assert.ok(new RegExp(`key: "${k}"|${k}:`).test(render), `${k} must be a state`);
  }
  assert.match(render, /\(it\.hasPreview \|\| it\.hasBlueprint \|\| it\.versions\)/,
    "a prototype, a blueprint and a published version all mean the same thing from a grid: Built");
  assert.match(render, /\$\{ICON\[st\.key\]\}/, "the pill carries an icon, not a label");
  assert.ok(!/esc\(st\.label\)\}<\/span>/.test(render), "no state renders its label as text on the card");
  assert.match(render, /role="img" aria-label="\$\{esc\(st\.label\)\}"/,
    "an icon with no accessible name is a state only sighted users can read");
  // building is the one state about to change — a still icon would lie about that
  assert.match(render, /key: "building", label: "Building…", pulse: true/);
});

test("the version count rides on the icon, and nothing repeats it", () => {
  // It was a third piece of mono text in a footer already carrying an address and a cost.
  assert.match(UI, /<span class="vbadge" title="\$\{it\.versions\} version/);
  assert.match(UI, /\.appcard \.vbadge\{position:absolute;top:-6px;right:-6px/);
  assert.match(UI, /\.appcard \.tile\{position:relative/, "the badge needs the tile to be its origin");
  const render = UI.match(/function renderHomeGrid\(\) \{[\s\S]*?\n\}/)[0];
  assert.ok(!/class="vs"/.test(render), "the footer's versions line is gone");
  assert.match(render, /key: "built", label: "Built"/,
    'the state that used to read "8 versions" says Built, so the count appears exactly once');
});
