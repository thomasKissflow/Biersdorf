// verify-gate.test.mjs — the host verifies the prototype instead of trusting that someone did.
//
// proto-verify has always existed and CONDUCTOR.md has always said to run it. But a skipped
// instruction looks exactly like a passed check — the turn ends, the pane fills, the user is told
// it's done — which is how a stat card reading `${fmtMoney(8850000)}` shipped.
//
// The gate has to hold two things at once: catch what is genuinely broken, and stay silent during
// the streaming middle of a build, where a half-spliced page is the NORMAL state. A gate that cried
// wolf on every turn would be turned off within a day, so both halves are pinned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verify } from "../../engine/proto-verify.mjs";
import { hardFindings } from "../app.mjs";

const SHELL = '<script>window.ROLES=[{"slug":"x","name":"X","nav":[{"id":"x-q","label":"Q"}]}];</script>';
const part = (body) => `<!-- part:role-x script (deferred by assembler) -->\n<script>window.PAGES=window.PAGES||{};Object.assign(window.PAGES,{"x-q":function(){document.getElementById("x-q").innerHTML="${body || "ok"}"}})</script>`;
const page = (markup, script) => `<html><head>${SHELL}</head><body><section id="rv-x"><div id="x-q"></div>${markup || ""}</section>${script === undefined ? part() : script}</body></html>`;

test("a finished, correct page raises nothing", () => {
  assert.equal(hardFindings(verify(page()).findings).length, 0);
});

test("a page mid-build raises nothing — that is what streaming looks like", () => {
  // parts still missing, containers not yet filled: every one of these resolves itself as the build
  // continues, and reporting them would fire on essentially every turn
  const midBuild = `<html><head>${SHELL}</head><body><section id="rv-x"><div id="x-q"></div></section><!-- @PART:role-y --></body></html>`;
  const raw = verify(midBuild).findings;
  assert.ok(raw.some((f) => f.level === "error"), "the verifier does see them");
  assert.equal(hardFindings(raw).length, 0, "…and the gate deliberately does not report them mid-build");
  // …but the SAME page at turn end is a build that never finished, and that must be said
  assert.ok(hardFindings(raw, { final: true }).length > 0, "at turn end the tolerance is gone");
});

test("template syntax on the page IS reported — the bug that shipped", () => {
  const leak = page(`<div class="stat"><b>\${fmtMoney(8850000)}</b><span>Q3 Budgeted</span></div>`);
  const hard = hardFindings(verify(leak).findings);
  assert.equal(hard.length, 1);
  assert.equal(hard[0].kind, "TEMPLATE_LEAK");
  assert.ok(hard[0].msg.includes("fmtMoney"), "and it names the expression");
});

// The sibling of TEMPLATE_LEAK, and it shipped the same way: everything compiles, and the screen is
// wrong. An inline handler that builds markup ends at the first `"` inside that markup, so the rest
// of the source — `; window.openPopup(form); "> — prints under the card, above a button that no
// longer does anything. (BriefingHub, 2026-08-09.)
test("source code rendered as page text IS reported — the handler that cut itself in half", () => {
  const leak = page(`<button onclick="const form = \`<h3 class="t">New briefing</h3>\`; window.openPopup(form); ">New briefing</button>`);
  const hard = hardFindings(verify(leak).findings);
  assert.ok(hard.some((f) => f.kind === "HANDLER_LEAK"), "the page shows its own source and nothing else catches it");
  assert.ok(hard.find((f) => f.kind === "HANDLER_LEAK").msg.includes("openPopup"),
    "and it quotes what the user is reading, so the fix is obvious from the report");
});

test("a handler that calls a named function raises nothing — that is the correct shape", () => {
  const ok = page(`<button onclick="newBriefing()">New briefing</button>`);
  assert.ok(!hardFindings(verify(ok).findings).some((f) => f.kind === "HANDLER_LEAK"),
    "the check must not fire on the pattern it is steering people towards");
});

test("ordinary prose is never mistaken for leaked source", () => {
  const prose = page(`<p>Draft for executive review. Save as draft and refine anytime — 22% over budget.</p>
    <div class="text-sm">Nimbus Corp cut enterprise tier pricing by 15% last week.</div>`);
  assert.ok(!hardFindings(verify(prose).findings).some((f) => f.kind === "HANDLER_LEAK"),
    "a check that fires on real copy gets switched off, and then catches nothing at all");
});

test("a part whose script cannot parse IS reported — that role renders dead", () => {
  const broken = page("", "<!-- part:role-x script (deferred by assembler) -->\n<script>if(</script>");
  const hard = hardFindings(verify(broken).findings);
  assert.ok(hard.some((f) => f.kind === "SCRIPT_SYNTAX"));
  assert.ok(hard.every((f) => f.role === "x"), "attributed to the role, not to the file");
});

test("one role clobbering another's pages IS reported", () => {
  const clobber = page("", '<!-- part:role-x script (deferred by assembler) -->\n<script>window.PAGES = { "x-q": function(){} };</script>');
  assert.ok(hardFindings(verify(clobber).findings).some((f) => f.kind === "PAGES_CLOBBER"));
});

// Rows written into a <div> are DISCARDED by the parser — tr and td are invalid there — and only
// their text survives, so a whole table lands as one run-on paragraph under a header that still looks
// like a table. Everything else passes: the file parses, the script compiles, and the container is
// "populated" by the very text that proves it went wrong. (POF Risk & HAZID Manager, 2026-08-10.)
test("table rows written into something that is not a table IS reported", () => {
  const bad = page('<div id="x-q"></div><div id="x-rows"></div>',
    '<!-- part:role-x script (deferred by assembler) -->\n<script>document.getElementById("x-rows").innerHTML = "<tr><td>RA-2026-041</td><td>Drilling</td></tr>";</script>');
  const hard = hardFindings(verify(bad).findings);
  assert.ok(hard.some((f) => f.kind === "TABLE_ORPHAN"), "nothing else can see this one");
  assert.match(hard.find((f) => f.kind === "TABLE_ORPHAN").msg, /tbody/, "…and it says where they belong");
});

test("rows written into a tbody raise nothing — that is the correct shape", () => {
  const ok = page('<div id="x-q"></div><table><tbody id="x-rows"></tbody></table>',
    '<!-- part:role-x script (deferred by assembler) -->\n<script>document.getElementById("x-rows").innerHTML = "<tr><td>RA-2026-041</td></tr>";</script>');
  assert.ok(!hardFindings(verify(ok).findings).some((f) => f.kind === "TABLE_ORPHAN"));
});
