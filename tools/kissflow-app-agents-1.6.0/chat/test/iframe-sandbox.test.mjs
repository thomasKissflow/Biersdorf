// iframe-sandbox.test.mjs — the preview iframes that display AGENT-generated HTML must be sandboxed to a
// unique origin (no allow-same-origin), so the generated JS can't reach this page's DOM/cookies (#5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAT_UI = readFileSync(join(HERE, "..", "ui.html"), "utf8");

const sandboxOf = (html, id) => {
  const m = html.match(new RegExp(`<iframe[^>]*\\bid=["']${id}["'][^>]*>`, "i"));
  assert.ok(m, `iframe #${id} exists`);
  const sb = m[0].match(/sandbox=["']([^"']*)["']/);
  return sb ? sb[1] : null;
};

test("#5 the chat main preview iframe is sandboxed WITHOUT allow-same-origin", () => {
  const sb = sandboxOf(CHAT_UI, "frame");
  assert.ok(sb && /allow-scripts/.test(sb), "scripts allowed so the prototype runs");
  assert.ok(!/allow-same-origin/.test(sb), "NOT same-origin — that is the isolation");
});

test("#5 the tour frame's same-origin need is DOCUMENTED, not silent", () => {
  // the tour reads the prototype's ROLES + drives switchRole inside it — genuinely needs same-origin;
  // its residual isolation is the /preview CSP. The exception must be explained next to the element.
  const near = CHAT_UI.slice(Math.max(0, CHAT_UI.indexOf("tourFrame") - 400), CHAT_UI.indexOf("tourFrame"));
  assert.match(near, /same-origin|CSP/i, "the tour frame's same-origin exception is explained inline");
});
