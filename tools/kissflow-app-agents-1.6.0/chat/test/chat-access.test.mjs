// chat-access.test.mjs — a developer must not pass through the chat on the way somewhere else.
//
// The chat is not a developer's surface: the home composer is hidden for them, "Open in chat" is
// hidden on the app record, and New app sends them to the connect steps. Their surface for an
// existing app is its record — versions, QA runs, dev environment.
//
// A redirect existed, but it ran too late and too narrowly:
//
//   · every caller said showChat() FIRST and asked afterwards, so a developer watched the chat open
//     and then be taken away from them — reported as "it takes them to chat for a moment and then
//     redirects to settings, that is wrong implementation"
//   · the ?open= deep link called openApp(slug, null) with no projectId, and the guard was written
//     `role === "developer" && projectId` — so on that route it could not fire at all and they simply
//     stayed in the chat
//
// The rule: the question is asked before any view changes, on every route in. Not "leave quickly" —
// never arrive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");

test("one predicate decides, and it does not depend on knowing the project", () => {
  assert.match(UI, /const chatDenied = \(\) => !!\(ME && ME\.role === "developer"\);/);
  const guard = UI.match(/const chatDenied[\s\S]*?\n\}/)[0];
  assert.ok(!/projectId/.test(guard.split("\n")[0]),
    "tying the guard to a projectId is what let the ?open= route through");
});

test("every way into the chat asks first", () => {
  // openApp — the app card and the ?open= deep link
  const openApp = UI.match(/async function openApp\([^)]*\) \{[\s\S]{0,200}/)[0];
  assert.match(openApp, /if \(chatDenied\(\)\) return insteadOfChat/,
    "the very first thing openApp does, before any await or any view change");
  // openSession — the drawer, a ?s= resume, an adoption
  const openSession = UI.match(/async function openSession\(id\) \{[\s\S]*?showChat\(\);/)[0];
  assert.match(openSession, /if \(chatDenied\(\)\) return insteadOfChat\(session\.projectId, session\.slug\);/);
  assert.ok(openSession.indexOf("chatDenied()") < openSession.indexOf("showChat()"),
    "asked BEFORE the view is raised, or the flash is still there");
});

test("no caller raises the chat before the question is answered", () => {
  for (const [what, re] of [
    ["the app card", /if \(card\) \{ showChat\(\);/],
    ["the sessions drawer", /showChat\(\); openSession\(/],
    ["the \\?open= deep link", /showChat\(\);\s*\n\s*await openApp\(slug, null\)/],
  ]) {
    assert.ok(!re.test(UI), `${what} still opens the chat before deciding whether it may stay`);
  }
});

test("they are sent to the app's record, not just bounced home", () => {
  const fn = UI.match(/function insteadOfChat\(projectId, slug\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /location\.href = `\/p\/\$\{pid\}`/, "the record IS their surface for the app");
  assert.match(fn, /homeItems\.find/, "…resolved from the list when the caller had no id — the ?open= case");
  assert.match(fn, /showHome\(\)/, "and a list rather than a dead end when there is no record at all");
});
