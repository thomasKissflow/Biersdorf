// empty-invite.test.mjs — a chat with no messages must invite, and must invite about THIS app.
//
// A session that opens with an empty transcript rendered a blank half-screen next to a pane that at
// least said "No prototype yet". Nothing told anyone what to type, and blank reads as broken.
//
// The first fix put three worked examples there — a purchase-request app, an onboarding app, a
// complaints desk — and that was worse in the case that actually happens. Sessions almost never open
// empty AND anonymous: they are adopted from a Kissflow app, opened from the home grid, or created
// from the terminal, so the name is already known and shown in the header. Offering "a purchase
// request app" to someone who just opened Vendor Onboarding is not a hint, it is a different app, and
// clicking one would overwrite the name they already gave.
//
// So the rule this file pins: the invite is written from what the session knows, and from nothing
// else. Named → it is about that app, by name. Unnamed → an invitation and nothing more. Never a
// catalogue of app ideas in either case.
//
// renderInvite() is executed here, not pattern-matched: the failure being prevented is invented
// content reaching the screen, and only running it shows what reaches the screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
const src = UI.match(/function renderInvite\(\) \{[\s\S]*?\n\}/);
assert.ok(src, "renderInvite() must exist in ui.html — the empty transcript is written in one place");

// The smallest DOM renderInvite touches: one #logEmpty holding one .le-in.
function render(session) {
  const box = { innerHTML: "" };
  const $ = (id) => (id === "logEmpty" ? { querySelector: (sel) => (sel === ".le-in" ? box : null) } : null);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  new Function("$", "esc", "S", `${src[0]}; renderInvite();`)($, esc, session);
  return box.innerHTML;
}
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// Every domain the first version pitched. None of them may ever be pitched again — not because these
// three words are special, but because any of them appearing means the invite is naming an app the
// user did not.
const INVENTED = ["purchase request", "purchase order", "employee onboarding", "complaint", "expense",
  "leave request", "helpdesk", "procurement", "invoice", "travel"];

test("a named session is invited to describe ITS app, by name", () => {
  const html = render({ app: "Vendor Onboarding" });
  assert.match(text(html), /Vendor Onboarding/, "the one fact we have must be the one thing it says");
  assert.match(text(html), /Who raises it/i, "and it must ask for what a build cannot be inferred without");
});

test("an unnamed session gets an invitation and no more", () => {
  const html = render(null);
  assert.match(text(html), /What should we build\?/);
  assert.ok(!/\bStart describing\b/.test(text(html)),
    "with no name there is nothing to seed a sentence with — the button must not appear");
});

test("no example app is ever suggested, named or not", () => {
  for (const session of [{ app: "Vendor Onboarding" }, { app: "Grant Disbursement" }, null]) {
    const body = text(render(session)).toLowerCase();
    for (const domain of INVENTED) {
      assert.ok(!body.includes(domain),
        `the invite pitched "${domain}" — an app the user did not ask for. It may only talk about theirs.`);
    }
  }
});

test("the app name is escaped — it comes from a Kissflow tenant, not from us", () => {
  const html = render({ app: `<img src=x onerror="alert(1)">` });
  assert.ok(!html.includes("<img"), "an app named with markup must not become markup");
  assert.match(html, /&lt;img/);
});

test("emptying the transcript rewrites the invite, and the log is emptied in one place", () => {
  const reset = UI.match(/function reset\(\) \{[\s\S]*?\n\}/);
  assert.ok(reset, "reset() must exist");
  assert.match(reset[0], /renderInvite\(\)/,
    "reset() clears #log, which brings the invite back — stale copy would name the PREVIOUS app");
});

test("the brief typed on the home page is quoted back before the build mode is asked", () => {
  const fn = UI.match(/function renderModeChoice\([\s\S]*?\n\}/);
  assert.ok(fn, "renderModeChoice() must exist");
  assert.match(fn[0], /\bbrief\b/,
    "the mode card is the whole chat until a mode is picked, and the message is not posted until " +
    "then — without the brief the user's words look lost");
  // and the caller has to actually pass it, which is the half that silently rots
  assert.match(UI, /sendText\(body \+ descLine \+ ref \+ modeLine\);\s*\n\s*\}, text\);/,
    "the hero must hand its text to the card, not just to the message it posts later");
});
