// chat-survives-refresh.test.mjs — reloading the page must not lose the app you had open.
//
// Reloading is how people check whether a long build is still going, and the reload took them back to
// the app list. The build was still running and the chat was still there; nothing on screen said so,
// and the way back in was three clicks. Two causes, both in the address bar:
//
//   · boot resumed nothing without a query parameter — deliberate, and correct for a cold visit
//   · the deep link that got you there (`?open=<slug>`) was stripped by replaceState on arrival, so
//     by the time you reloaded there was nothing left to resume FROM
//
// The fix is not a silent resume: the address bar names the open chat, so reload, Back, a bookmark
// and a pasted link all mean the same thing. It carries the session id rather than the app slug —
// an id reopens exactly that conversation and adopts or creates nothing on the way back in.
//
// These are structural assertions over ui.html. What is being protected is a pairing — every place
// that opens a chat must record it, and every place that leaves must clear it — and a pairing is
// exactly what rots when the next writer adds a sixth entry point.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");

test("the open chat is written to the URL and to localStorage by ONE function", () => {
  const fn = UI.match(/function markOpenChat\(id\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "markOpenChat() must exist");
  assert.match(fn[0], /history\.replaceState/, "it owns the address bar");
  assert.match(fn[0], /localStorage\.kfChatLast = id/, "…and the stored last-chat, so the two cannot disagree");
  assert.match(fn[0], /localStorage\.removeItem\("kfChatLast"\)/, "…including clearing it");

  // No one else may write either of them. Two writers is how the URL and the store drift apart.
  const others = UI.split("function markOpenChat(id)")[0] + UI.split(/function markOpenChat\(id\) \{[\s\S]*?\n\}/)[1];
  assert.ok(!/localStorage\.kfChatLast\s*=/.test(others), "kfChatLast is written in exactly one place");
  assert.ok(!/localStorage\.removeItem\("kfChatLast"\)/.test(others), "…and cleared in exactly one place");
});

test("every route that opens a chat records it", () => {
  // openSession (a card, a link, a reload), newSession, adoptExisting, the home composer, openApp.
  const opens = UI.match(/markOpenChat\(S\.id\)/g) || [];
  assert.ok(opens.length >= 5,
    `only ${opens.length} of the entry points record the open chat — one that does not is a route ` +
    `whose reload still lands on the app list`);
});

test("a reload with ?s= reopens that session rather than the app list", () => {
  const boot = UI.slice(UI.lastIndexOf("const q = new URLSearchParams(location.search);"));
  assert.match(boot, /if \(q\.has\("s"\)\)/, "?s= must be handled BEFORE the fall-through to showHome()");
  assert.match(boot, /await openSession\(q\.get\("s"\)\)/,
    "by id — openApp() would adopt-or-create, which is not what reloading a page should do");
  // against the real fall-through, not any mention of showHome — a comment naming it used to be
  // enough to fail this
  assert.ok(boot.indexOf('q.has("s")') < boot.indexOf("} else {"),
    "the app list stays the answer only when nothing is open");
});

test("leaving the chat clears it, so a bookmarked list stays a list", () => {
  for (const view of ["showHome", "showMemory", "showUsers", "showSettings"]) {
    const fn = UI.match(new RegExp(`function ${view}\\(\\)[^\\n]*`));
    assert.ok(fn, `${view}() must exist`);
    assert.match(fn[0], /markOpenChat\(null\)/,
      `${view}() leaves the chat — reloading there must not drop you back into a conversation`);
  }
});

test("the session id is escaped into the URL", () => {
  const fn = UI.match(/function markOpenChat\(id\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /encodeURIComponent\(id\)/,
    "ids are ours today, but a raw value in a query string is one product decision away from a bug");
});
