// feedback-shared.test.mjs — the report queue is shared, and navigation is remembered.
//
// FEEDBACK. Reports were private to whoever filed them; only a triager could see the list. So five
// people hit the same bug, filed it five times, and each believed they were the first. Nobody could
// tell that a thing was already known, already triaged, or already shipped.
//
// Reading is now open to anyone signed in. Writing is NOT, and did not change — which is the part
// that needs pinning, because widening a read is one line and accidentally widening a write is the
// same line. Every mutation stays where it was: the reporter may correct their own words, and
// classification, analysis, the fix prompt and the queue pages stay admin/maintainer only.
//
// The client half matters just as much. Once everyone can open every ticket, any control that posts
// to a gated endpoint is a button that looks like it worked: the board's drag-to-status swallowed its
// 403 after moving the card, and the body textarea offered Save on a report that was not yours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = readFileSync(join(HERE, "..", "ui.html"), "utf8");
const SERVER = readFileSync(join(HERE, "..", "..", "..", "..", "control-plane", "src", "server.mjs"), "utf8");
// the handler for one route, from its `if (path === …)` to the next one
const route = (marker) => {
  const i = SERVER.indexOf(marker);
  assert.ok(i > 0, `route not found: ${marker}`);
  return SERVER.slice(i, SERVER.indexOf("\n      if (", i + 10));
};

test("the list is everyone's, and nobody is refused it", () => {
  const r = route('if (path === "/api/feedback" && req.method === "GET")');
  assert.ok(!/403/.test(r), "asking for the whole queue must no longer be refused");
  assert.match(r, /canSeeAll: true/, "…and the client is told the toggle applies to it");
  assert.match(r, /scope"\) !== "mine"/, "everyone's is the default; mine is the narrowing");
});

test("any signed-in user can open any report, and see its screenshots", () => {
  for (const marker of [
    'if ((mm = path.match(/^\\/api\\/feedback\\/([^/]+)$/)) && req.method === "GET")',
    'if ((mm = path.match(/^\\/api\\/feedback\\/([^/]+)\\/file\\/(\\d+)$/)) && req.method === "GET")',
  ]) {
    const r = route(marker);
    assert.ok(!/that report is not yours/.test(r),
      "a shared queue whose tickets cannot be opened is not shared — and one without its screenshot is not shown");
  }
});

test("writing did NOT widen — every mutation is still gated exactly as it was", () => {
  for (const [name, marker] of [
    ["update", 'if ((mm = path.match(/^\\/api\\/feedback\\/([^/]+)\\/update$/)) && req.method === "POST")'],
    ["analyse", 'if ((mm = path.match(/^\\/api\\/feedback\\/([^/]+)\\/analyse$/)) && req.method === "POST")'],
    ["prompt", 'if ((mm = path.match(/^\\/api\\/feedback\\/([^/]+)\\/prompt$/)) && req.method === "GET")'],
    ["classify", 'if ((mm = path.match(/^\\/api\\/feedback\\/([^/]+)\\/classify$/)) && req.method === "POST")'],
  ]) {
    assert.match(route(marker), /403/, `${name} must still refuse someone who may not do it`);
  }
});

test("the client offers no control that would 403", () => {
  assert.match(UI, /draggable="\$\{fbbAdmin \? "true" : "false"\}"/,
    "the board's drop posts to /classify and swallowed the failure — a card moved and silently snapped back");
  assert.match(UI, /r\.canEdit\s*\?\s*`<textarea id="fbdText"/,
    "someone else's report is readable, not editable");
  assert.match(UI, /if \(\$\("fbdSave"\)\)/, "…and the Save wiring must tolerate the button being absent");
  assert.match(SERVER, /canEdit: triager \|\| row\.reporter === me\.email/, "the server decides who may edit");
});

test("the reports popup opens on everyone's", () => {
  assert.match(UI, /fbbScope = "all"/, "landing on your own reports hides the duplicates this exists to prevent");
  assert.match(UI, /<button class="on" data-s="all">Everyone<\/button>/, "and the toggle agrees with what loaded");
});

// ── labels ───────────────────────────────────────────────────────────────────────────────────────
test("filters and classification read as sentences, but still match on stored values", () => {
  assert.match(UI, /<option value="">Any severity<\/option>/);
  assert.match(UI, /<option value="">Any status<\/option>/);
  assert.match(UI, /<option value="critical">Critical<\/option>/,
    "capitalising the VALUE too would compare \"Critical\" against a stored \"critical\" and match nothing");
  assert.match(UI, /<option value="wontfix">Won't fix<\/option>/);
  assert.match(UI, /fbLabel\(o\)/, "the classification selects capitalise on the way to the screen only");
  assert.match(UI, /const fbLabel =/, "…in one place");
});

// ── navigation ───────────────────────────────────────────────────────────────────────────────────
test("which list you are on survives a reload", () => {
  assert.match(UI, /function markHomeScope\(\)/);
  assert.match(UI, /\?apps=all/, "the scope belongs in the address bar, like the open chat");
  assert.match(UI, /if \(q\.get\("apps"\) === "all" && ME\.role === "admin"\) homeScope = "all";/,
    "read at boot, and only for someone the server will actually serve it to");
});

test("there is always a way back to All apps — the nav, not the logo", () => {
  const showChat = UI.match(/function showChat\(\)[^\n]*/)[0];
  assert.match(showChat, /\$\("topnav"\)\.hidden = false/,
    "hiding the nav in the chat removed the only labelled route back to the list an admin came from");
});

test("the logo always means the dashboard, for everybody", () => {
  // Preserving the scope here looked right while the logo was the only way out of a chat. It is not
  // any more — the nav is — so the wordmark goes back to meaning exactly one thing. An admin browsing
  // All apps is inspecting the platform, not at home in it.
  assert.match(UI, /\$\("brandBtn"\)\.onclick = \(\) => \{ homeScope = "mine"; showHome\(\); \};/);
});

// ── the board and table, ported from the "AI Builder Report" comp ────────────────────────────────
//
// The port is in TOKENS, not the comp's literals, and that is the thing worth pinning: this popup
// renders under [data-theme="dark"] too, so a hardcoded #fff card and #EDF0F5 tray would be two light
// rectangles on a dark ground. The mapping was near-free because the comp was drawn from this palette
// already — its column colours ARE the blue/orange/violet/green families.
test("the comp's colours arrive as tokens — nothing hardcoded into the board or table", () => {
  const css = UI.slice(UI.indexOf(".fbbbody.brd{"), UI.indexOf(".fbempty{"));
  const literals = css.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
  assert.deepEqual(literals, [],
    `hex literals in the board/table CSS would not follow the dark theme: ${literals.join(" ")}`);
  for (const fam of ["--blue", "--orange", "--violet", "--green"]) {
    assert.ok(css.includes(`var(${fam})`), `the ${fam} column colour must come from the palette`);
  }
});

test("the reporter is NOT called .who — that class is the chat avatar", () => {
  // .who is a 24px circle with its own background, three thousand lines up. Reusing the name turned
  // every reporter's email into a pill and clipped it to "dines…". The file has been bitten by a
  // same-named class before; this is the guard.
  assert.ok(!/class="who"/.test(UI.slice(UI.indexOf("const fbbCard"))),
    "the board/table must not reuse .who for the reporter");
  assert.match(UI, /\.fbitem \.meta \.rep\{/);
  assert.match(UI, /\.fbtable \.rep\{/);
});

test("a status carries its colour in both the control and the read-only twin", () => {
  for (const s of ["new", "triaged", "accepted", "shipped"]) {
    assert.match(UI, new RegExp(`\\.fbsel\\.${s}\\{`), `the triager's select must colour ${s}`);
    assert.match(UI, new RegExp(`\\.fbpill\\.${s}\\{`), `and so must the pill a viewer sees`);
  }
  assert.match(UI, /sel\.className = `fbsel \$\{sel\.value\}`/,
    "recolouring on change — leaving the old colour up says the change did not take");
});

test("an empty column says which column it is empty of", () => {
  const empt = UI.match(/const FB_EMPTY = \{[\s\S]*?\n\};/)[0];
  for (const c of ["new", "triaged", "accepted", "shipped"]) assert.ok(empt.includes(`${c}:`), `${c} needs its own line`);
  assert.ok(new Set(empt.match(/"[^"]{10,}"/g)).size >= 4, "four columns, four different reasons — or it is decoration");
  // and the board must not be replaced wholesale by one global empty when a column happens to be bare
  const render = UI.match(/function fbbRender\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(render, /if \(!fbbRows\.length\)/, "nothing at all…");
  assert.match(render, /if \(!rows\.length\)/, "…is different from nothing matching the filters");
});

test("dates read as the comp writes them", async () => {
  const src = UI.match(/const FB_MON = [^\n]*\nfunction fbWhen\(at\) \{[\s\S]*?\n\}/)[0];
  const fbWhen = new Function(`${src}; return fbWhen;`)();
  const d = new Date(2026, 7, 9, 6, 54);            // local time, as the browser renders it
  assert.equal(fbWhen(d.toISOString()), "Aug 9 · 06:54");
  assert.equal(fbWhen(""), "", "a report with no timestamp must not print 'NaN · NaN:NaN'");
  assert.equal(fbWhen("not a date"), "");
});

test("a title states its own colour instead of inheriting one", () => {
  // Inherited colour is a promise about an ancestor this block does not own. The card title and the
  // table's first cell are the two things that must never vanish, and both were relying on whatever
  // the surrounding surface happened to set.
  assert.match(UI, /\.fbitem b\{display:block;color:var\(--ink\)/);
  assert.match(UI, /\.fbtable td\{[^}]*color:var\(--ink\)/);
  assert.match(UI, /\.fbtable td:first-child\{[^}]*color:var\(--ink\)/);
});

// ── two regressions from the board/table port, both about a layout outliving its view ────────────
test("opening a ticket drops the list's layout class", () => {
  // .brd leaves #fbbBody display:flex + overflow:hidden. A ticket rendered into that becomes a
  // shrink-to-fit flex item: the right third of the popup empty, and no scroll when the report runs
  // long. The class is set per render, so it has to be cleared by the view that is not a list.
  const open = UI.match(/async function fbbOpen\(id\) \{[\s\S]*?fbbTitle"\)\.textContent = "Report";/);
  assert.ok(open, "fbbOpen() must exist");
  assert.match(open[0], /classList\.remove\("brd", "tbl"\)/);
});

test("the table's action column is fixed, and the card scrolls rather than clipping", () => {
  assert.match(UI, /\.fbtable th:nth-child\(6\),\.fbtable td:nth-child\(6\)\{width:210px/,
    "a percentage shrank with the popup until two buttons no longer fitted, and they were cut in half");
  assert.match(UI, /\.fbtwrap\{[^}]*overflow:auto/,
    "overflow:hidden rounds the corners AND slices off anything past the card edge");
  assert.match(UI, /\.fbtable\{width:100%;min-width:1080px/,
    "the floor belongs on the table — on the wrapper it just made the clipped box wider");
});

// ── nothing may fall off the board ───────────────────────────────────────────────────────────────
// Five statuses can be SET — new, triaged, accepted, wontfix, shipped — and the board had four
// columns. A report marked "Won't fix" rendered nowhere: not moved, not greyed, gone. Reported as
// "issues are not visible", and the worst part is how it reads — a swallowed ticket looks dealt with.
test("every status that can be set has somewhere to land", () => {
  const settable = [...UI.matchAll(/\["new", "triaged", "accepted", "wontfix", "shipped"\]/g)];
  assert.ok(settable.length >= 2, "the status pickers still offer five values");
  const cols = UI.match(/const FBB_COLS = \[[^\]]*\]/)[0];
  for (const s of ["new", "triaged", "accepted", "shipped", "wontfix"]) {
    assert.ok(cols.includes(`"${s}"`), `"${s}" can be set but has no column — a report set to it disappears`);
  }
});

test("a status the columns do not know about still shows up", () => {
  const render = UI.match(/function fbbRender\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(render, /!FBB_COLS\.includes\(s\)/,
    "the next status somebody adds must grow a column, not swallow the tickets in it");
  assert.match(render, /const cols = \[\.\.\.FBB_COLS, \.\.\.stray\]/);
});

test("the new column is furnished like the others", () => {
  assert.match(UI, /wontfix: \["Nothing declined"/, "an empty column has to say what it is empty of");
  assert.match(UI, /\.fbcol\[data-col="wontfix"\] \.dot\{/, "…and carry a dot, or it reads as unstyled");
});

test("a long app name is clipped by the card, not the other way round", () => {
  // "Compliance Checkpoint · 6 roles · 16 pages" is nowrap and had nothing letting it shrink, so it
  // decided the card was wider than the column and pushed straight through the side.
  const pill = UI.match(/\.fbitem \.apppill\{[^}]*\}/)[0];
  assert.match(pill, /min-width:0/, "a flex item with no floor cannot give way");
  assert.match(pill, /max-width:100%/);
  assert.match(pill, /text-overflow:ellipsis/, "…and it should say it was cut, not just stop");
  assert.match(pill, /white-space:nowrap/, "still one line — an app name split across two reads as two things");
});

test("the board gets the screen, not a dialog's worth of it", () => {
  const box = UI.match(/\.confirm \.box\.fbboardbox\{[^}]*\}/)[0];
  assert.match(box, /width:96vw/, "five columns at a 260px minimum do not fit in 1180px");
  assert.ok(!/min\(1180px/.test(box));
});
