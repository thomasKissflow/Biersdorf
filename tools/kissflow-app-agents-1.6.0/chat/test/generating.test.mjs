// generating.test.mjs — "is this app being authored in Kissflow right now?" is SERVER state.
//
// The client used to derive it from the phase strip and a client-local steps list, both of which a
// reload wipes (the stream opens at the current seq; old phase events never replay). The visible
// failure: "Not built in Kissflow yet" + a live Generate button DURING authoring — and a second click
// would queue a second authoring run against a half-built app.
import "./_env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionCore } from "../session-core.mjs";

const core = createSessionCore({ repoRoot: process.cwd(), runsDir: process.env.KF_RUNS_DIR });
const ctx = () => {
  const calls = { emitted: [], persisted: 0 };
  return { calls, emit: (s, type, d) => calls.emitted.push({ type, ...d }), persist: () => calls.persisted++, onPreview: () => {} };
};

test("the Author phase marks the session as generating, durably", () => {
  const s = { messages: [], seq: 0 };
  const c = ctx();
  core.onMarker(s, { kind: "phase", value: "Author" }, c);
  assert.equal(s.generating, true);
  assert.ok(c.calls.persisted >= 1, "persisted — a reload must see it");
});

test("a runtime building step is proof of authoring even without the phase marker", () => {
  const s = { messages: [], seq: 0 };
  const c = ctx();
  core.onMarker(s, { kind: "building", value: "runtime|creating flows" }, c);
  assert.equal(s.generating, true);
  // …and only the first one persists; a build emits dozens of steps
  const before = c.calls.persisted;
  core.onMarker(s, { kind: "building", value: "runtime|deploying the UI" }, c);
  assert.equal(c.calls.persisted, before, "subsequent steps do not re-persist");
});

test("a prototype step is NOT authoring", () => {
  const s = { messages: [], seq: 0 };
  core.onMarker(s, { kind: "building", value: "prototype|shell" }, ctx());
  assert.ok(!s.generating);
});

test("the turn ending clears it — however the turn ended", () => {
  const s = { messages: [], seq: 0, generating: true, busy: true, slug: "x" };
  core.finishTurn(s, { ok: false, error: "stopped" }, ctx());
  assert.equal(s.generating, false);
});
