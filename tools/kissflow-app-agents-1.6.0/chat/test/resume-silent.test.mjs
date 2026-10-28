// resume-silent.test.mjs — housekeeping the builder does to itself is not news for the room.
//
// `--resume` names a transcript on the machine the CLI ran on, and that machine is disposable: a
// redeployed instance or a recycled pod comes back without it. The driver already handles this
// perfectly — it drops the dead id, respawns, and REPLAYS the turn, so the person still gets the
// answer they asked for. It also used to announce it:
//
//     previous build context was lost with its machine — starting fresh from the app's current state
//
// Which lands in the chat styled as an error, about a machine nobody knew existed, inviting "did I
// lose my work?" — for something already fixed by the time it is read. Nothing to act on, so nothing
// to say. It is logged for whoever runs the service, where a lost transcript is real signal.
//
// The two paths are separately pinned because the message existed twice: the child exiting silently,
// and the CLI reporting it as an error `result`.
import "./_env.mjs"; // KF_CHAT_CLAUDE_BIN=/usr/bin/true — the replay must not spawn a real builder
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Conductor } from "../driver.mjs";

/** A conductor mid-turn on a resumed session whose transcript is gone. */
function resuming() {
  const c = new Conductor({ id: "t1", repoRoot: process.cwd(), claudeSessionId: "dead-transcript-id" });
  const seen = [];
  c.on("error", (m) => seen.push(String(m)));
  c.deadResume = true;
  c.lastSent = "build the requisition flow";
  c.busy = true;
  return { c, seen };
}

test("a lost transcript is recovered without a word in the chat", async (t) => {
  await t.test("when the CLI reports it as an error result", () => {
    const { c, seen } = resuming();
    let replayed = null;
    c.send = (text) => { replayed = text; return true; };   // don't spawn; just record the recovery
    c.onStdout(JSON.stringify({ type: "result", subtype: "error_during_execution" }) + "\n");
    assert.equal(replayed, "build the requisition flow", "the turn is replayed — this is why there is nothing to report");
    assert.deepEqual(seen, [], "and the room hears nothing about it");
  });

  await t.test("the session id is dropped so the next spawn cannot resume the same corpse", () => {
    const { c } = resuming();
    const ids = [];
    c.on("claude-session", (v) => ids.push(v));
    c.send = () => true;
    c.onStdout(JSON.stringify({ type: "result", subtype: "error_during_execution" }) + "\n");
    assert.deepEqual(ids, [null], "the host must persist the reset");
    assert.equal(c.claudeSessionId, null);
  });
});

test("a crash that does NOT self-recover still speaks up", () => {
  // the distinction being drawn: silence is for what fixes itself, not for everything
  const text = readFileSync(new URL("../driver.mjs", import.meta.url), "utf8");
  assert.ok(/builder exited \(code/.test(text),
    "an exit with nothing to replay leaves the person waiting — that one has to be said");
  assert.ok(!/previous build context was lost/.test(text),
    "the self-healing one does not");
});

// Silence is only safe if the thing being silenced actually stops. It didn't: every replay spawns a
// child that mints a NEW session id, so a failure that keeps tripping the same detection replays
// forever — six spawns in one minute, each emitting turn-start and none ever emitting turn-end, which
// locks the composer until the page is reloaded (vaultops, 2026-08-02). Removing the message made a
// pre-existing loop invisible; the answer is a bounded retry, not louder housekeeping.
test("a resume that keeps failing gives up instead of looping", async (t) => {
  const mk = () => {
    const c = new Conductor({ id: "loop", repoRoot: process.cwd(), claudeSessionId: "dead" });
    const ev = { error: [], turnEnd: [] };
    c.on("error", (m) => ev.error.push(String(m)));
    c.on("turn-end", (r) => ev.turnEnd.push(r));
    c.lastSent = "build it";
    c.send = () => true;   // record the replay without spawning
    return { c, ev };
  };
  const fail = (c) => { c.deadResume = true; c.busy = true; c.onStdout(JSON.stringify({ type: "result", subtype: "error_during_execution" }) + "\n"); };

  await t.test("the first failure is recovered silently", () => {
    const { c, ev } = mk();
    fail(c);
    assert.deepEqual(ev.error, [], "still nothing in the chat for a one-off");
  });

  await t.test("the second gives up, says why, and releases the composer", () => {
    const { c, ev } = mk();
    fail(c); fail(c);
    assert.equal(ev.error.length, 1, "said once, not once per attempt");
    assert.match(ev.error[0], /send your message again/, "and says what to do about it");
    assert.ok(ev.turnEnd.some((r) => r && r.ok === false),
      "turn-end is what unlocks the composer — a stuck composer is worse than the failure");
  });

  await t.test("a turn that completes clears the budget", () => {
    const { c } = mk();
    fail(c);
    c.busy = true;
    c.onStdout(JSON.stringify({ type: "result", subtype: "success" }) + "\n");
    assert.equal(c.replays, 0, "an unrelated failure much later gets its own silent retry");
  });
});
