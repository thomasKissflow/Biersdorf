// resume-interrupted.test.mjs — a build that was running when the service went down.
//
// This is the one thing v2 genuinely had and v1 did not. Not because v1 lacked the parts — the run
// tree restores from storage, the conductor resumes the CLI transcript by id — but because nothing
// joined them up. hydrate() returns not-busy and the user's message is already stamped consumed, so
// neither the session nor drainQueue believed anything was owed. Every deploy silently abandoned
// whatever was mid-build and waited for a human to notice.
//
// What must hold: an interrupted turn is picked up, a FINISHED one is not, and a turn that keeps
// dying stops being retried rather than crashing the instance on every boot forever.
import "./_env.mjs";   // MUST precede the app.mjs import: points KF_RUNS_DIR at a throwaway dir so
                       // reclaimTurn()→persist() writes there, not into the real repo's runs/ (Codex test hygiene)
import { test } from "node:test";
import assert from "node:assert/strict";
import { __test } from "../app.mjs";
import { snapshotOf, hydrate } from "../session-core.mjs";

const { sessions, reclaimTurn } = __test;

const seed = (over = {}) => {
  const s = hydrate({
    id: `s-${Math.random().toString(36).slice(2, 8)}`, slug: "demo", title: "Demo", createdAt: new Date().toISOString(),
    messages: [{ role: "user", text: "build me a fleet app", addressed: true, consumedBy: "turn-dead" }],
    turnId: "turn-dead", turnAttempts: 1, ...over,
  });
  sessions.set(s.id, s);
  return s;
};

test("the in-flight turn SURVIVES a restart — without it there is nothing to recover from", () => {
  const snap = snapshotOf({ id: "x", slug: "s", messages: [], turnId: "turn-7", turnAttempts: 1 });
  assert.equal(snap.turnId, "turn-7", "the interrupted turn is in the persisted snapshot");
  assert.equal(snap.turnAttempts, 1);
  assert.equal(hydrate(snap).busy, false, "…and the session still comes back idle, never wedged busy");
});

test("an interrupted turn hands its message back to the queue", () => {
  const s = seed();
  reclaimTurn(s);
  assert.equal(s.messages[0].consumedBy, null, "unconsumed, so drainQueue starts a turn for it");
  assert.equal(s.turnId, null, "and the dead turn id is cleared");
  sessions.delete(s.id);
});

test("a turn that already finished is left alone", () => {
  const s = seed({ turnId: null, messages: [{ role: "user", text: "hi", addressed: true, consumedBy: "turn-ok" }] });
  reclaimTurn(s);
  assert.equal(s.messages[0].consumedBy, "turn-ok", "a completed turn's message is not re-run");
  sessions.delete(s.id);
});

test("a turn that keeps dying is not retried forever", () => {
  const s = seed({ turnAttempts: 2 });   // already spent both attempts
  reclaimTurn(s);
  assert.equal(s.messages[0].consumedBy, "turn-dead", "the message stays consumed — no third attempt");
  assert.equal(s.turnAttempts, 0, "the counter resets so a NEW message is not penalised");
  assert.ok(s.messages.some((m) => /interrupted twice/i.test(m.text || "")), "and the chat is told why");
  sessions.delete(s.id);
});

test("a turn with nothing addressed to it is dropped quietly", () => {
  const s = seed({ messages: [{ role: "user", text: "note to self", addressed: false, consumedBy: "turn-dead" }] });
  reclaimTurn(s);
  assert.equal(s.turnId, null);
  assert.equal(s.turnAttempts, 0);
  sessions.delete(s.id);
});
