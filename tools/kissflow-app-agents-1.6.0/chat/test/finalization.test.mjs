// finalization.test.mjs — a turn is "ready" only when it ran ok, its prototype VERIFIED, and the
// durable version PUBLISHED (#2/#3/#4). Before this, publishBuild's failure was discarded and a missing
// prototype read as a pass, so the UI could announce a completed build with nothing durably stored.
import "./_env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { finalizeVerdict, __test } from "../app.mjs";
import { snapshotOf } from "../session-core.mjs";

const miss = [{ role: "(shell)", level: "error", kind: "PROTOTYPE_MISSING", msg: "no page" }];

test("#2/#3 clean only when turn ok + prototype verified + version published", () => {
  assert.deepEqual(finalizeVerdict({ turnOk: true, hard: [], pub: { ok: true } }),
    { ok: true, blocked: [], protoOk: true, publishFailed: false });
});

test("#2 a durable-publish FAILURE blocks the ready result", () => {
  const v = finalizeVerdict({ turnOk: true, hard: [], pub: { ok: false, reason: "GCS 500" } });
  assert.equal(v.ok, false, "the build is not clean if it wasn't stored");
  assert.deepEqual(v.blocked, ["publish"]);
});

test("#2 an intentional local/dev run with NO publisher is not a failure", () => {
  const v = finalizeVerdict({ turnOk: true, hard: [], pub: { ok: false, unavailable: true, reason: "no publisher (local/dev)" } });
  assert.equal(v.ok, true, "local mode publishes nothing and that is fine");
  assert.deepEqual(v.blocked, []);
});

test("#3 a missing/rejected prototype is a failure, not a pass", () => {
  const v = finalizeVerdict({ turnOk: true, hard: miss, pub: { ok: true } });
  assert.equal(v.ok, false);
  assert.ok(v.blocked.includes("PROTOTYPE_MISSING"));
});

test("a turn the conductor itself failed is never clean", () => {
  assert.equal(finalizeVerdict({ turnOk: false, hard: [], pub: { ok: true } }).ok, false);
});

test("#4 the ready card is suppressed after a failed/blocked turn", () => {
  const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
  const fn = UI.match(/function announceGenReady\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(lastTurnFailed\) return;/, "path existence alone must not announce readiness");
});

test("#9/#10.3 any non-success terminal RETIRES a stale ready card and re-arms announcement", () => {
  const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
  // in the turn-end handler, ANY non-success terminal (failure/block AND a stop mid-build) must retire
  // the existing card and reset genAnnounced so only a subsequent verified success raises a fresh one.
  assert.match(UI, /if \(!ev\.ok\) \{ retireGenReady\(\); genAnnounced = false; \}/,
    "a stale ready card from an earlier success is retired on any non-success terminal, including a stop");
});

test("#10.4 turn-start retires a stale ready card offering the previous artifact", () => {
  const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
  const start = UI.match(/case "turn-start":[\s\S]*?break;/)[0];
  assert.match(start, /retireGenReady\(\);\s*genAnnounced = false;/,
    "starting a new build must retire the previous ready card and re-arm announcement");
});

// ── round-3 lifecycle invariants (source-level, matching the style above) ──────────────────────────
const APP = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "app.mjs"), "utf8");

test("round-3 #2 restored artifacts are stamped stale so they can't pass the freshness check", () => {
  const fn = APP.match(/export async function restoreRun\(s\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /utimesSync/, "restored files get an explicit (old) mtime");
  assert.match(fn, /markStale\(f\)/, "the run-bundle path stamps each restored file");
  assert.match(fn, /markStale\(join\(dir, rel\)\)/, "the legacy per-class path stamps its restored file too");
  // and the stamp is derived from turnStartedAt, i.e. BEFORE this turn — not "now"
  assert.match(fn, /turnStartedAt[^\n]*-\s*3_?600_?000/, "stamped to well before the turn began");
});

test("round-3 #3 stop is a real terminal transition — it releases the lease and cleans up", () => {
  const stop = APP.match(/\/stop\$\/\)[\s\S]*?return json\(res, 200/)[0];
  assert.match(stop, /releaseTurn\(s\)/, "stop releases the DB lease and clears the heartbeat interval");
  assert.match(stop, /persist\(s\)/, "stop persists the terminal state (local disk sync + debounced DB)");
  assert.match(stop, /closeWatchers\(s\)/, "stop drops watchers when nobody is watching");
});

test("round-3 #4 publishBuild fails closed when a required artifact can't be read", () => {
  const fn = APP.match(/async function publishBuild\(s\)[\s\S]*?\n\}/)[0];
  // the prototype read no longer swallows errors into a silent drop
  assert.ok(!/files\.prototype = readFileSync\(proto\); \} catch \{\}/.test(fn),
    "the prototype read must not be an empty-catch silent drop");
  assert.match(fn, /prototype unreadable at publish/, "an unreadable prototype fails the publish");
  assert.match(fn, /prototype expected but unavailable at publish/, "prototypeExpected with no prototype fails the publish");
  assert.match(fn, /unreadable at publish \(\$\{e\.message\}\)/, "a required ir/seed/decisions read failure fails too");
});

test("round-4 #2 explicit stop clears turnId so a restart cannot reclaim the stopped turn", () => {
  const stop = APP.match(/\/stop\$\/\)[\s\S]*?return json\(res, 200/)[0];
  assert.match(stop, /s\.turnId = null; s\.turnAttempts = 0;/,
    "stop clears the turn id and resets attempts — reclaimTurn()/resumeInterrupted() key off turnId");
  // and it must NOT un-consume the active message (that would let the next drain re-run the stopped build)
  assert.ok(!/consumedBy = null/.test(stop), "the stopped turn's active message stays consumed — stop means stop");
});

test("round-4 #2 (behavioral) reclaimTurn does NOT resume a session left in the stopped shape", () => {
  const { reclaimTurn } = __test;
  // exactly what the stop handler leaves behind: turnId cleared, the active message still consumed.
  const stopped = { slug: "stopped-1", busy: false, turnId: null, turnAttempts: 0,
    messages: [{ role: "user", consumedBy: "T-dead", addressed: true, content: "build it" }] };
  assert.equal(reclaimTurn(stopped), false, "a turnId-less (stopped) session is never reclaimed on restart");
  assert.equal(stopped.messages[0].consumedBy, "T-dead", "…and its message stays consumed, so no drain re-runs it");
  // contrast: a CRASHED turn (turnId still set) IS eligible for reclaim — proving the guard is turnId, not luck
  const crashed = { slug: "crashed-1", busy: false, turnId: "T1", turnAttempts: 0,
    messages: [{ role: "user", consumedBy: "T1", addressed: true, content: "build it" }] };
  assert.equal(reclaimTurn(crashed), true, "a crash (turnId present) is still recovered — only explicit stop is not");
});

test("round-4 #4 the ready card is suppressed after a STOP, not just a failure", () => {
  const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
  assert.match(UI, /lastTurnFailed = !ev\.ok;/,
    "lastTurnFailed includes stopped so a late announceGenReady() can't recreate the card after a stop");
});

test("round-4 #5 closeWatchers clears the watcher debounce timers, and exit closes watchers", () => {
  const fn = APP.match(/function closeWatchers\(s\)[\s\S]*?\n\}/)[0];
  for (const t of ["asmT", "pgT", "msT", "pvT", "bpT", "reloadT"])
    assert.ok(fn.includes(`"${t}"`), `closeWatchers clears the ${t} debounce timer`);
  const exit = APP.match(/exit: \(d\) => \{[\s\S]*?drainQueue\(s\);/)[0];
  assert.match(exit, /if \(!s\.clients\.size\) closeWatchers\(s\)/,
    "an unexpected exit with no viewers frees watchers/timers too");
});

test("round-5 #2 every terminal records a verdict, publicSession exposes it, and it is whitelisted", () => {
  assert.ok((APP.match(/recordVerdict\(s,/g) || []).length >= 4,
    "turn-end, fatal, exit, and stop each record an authoritative terminal verdict");
  const pub = APP.match(/function publicSession\(s, me\)[\s\S]*?\n\}/)[0];
  assert.match(pub, /lastTurnVerdict: s\.lastTurnVerdict/, "publicSession returns the verdict for reload");
  assert.match(pub, /readyVersionId: s\.readyVersionId/, "…and the ready version id");
});

test("round-5 #2 (behavioral) the verdict + readyVersionId survive a persist snapshot", () => {
  const s = { id: "s", slug: "app", messages: [], lastTurnVerdict: { ok: false, error: "stopped", at: 1 }, readyVersionId: 7 };
  const snap = snapshotOf(s);
  assert.deepEqual(snap.lastTurnVerdict, { ok: false, error: "stopped", at: 1 }, "the verdict is in the persisted whitelist");
  assert.equal(snap.readyVersionId, 7, "the ready version id is persisted too — a restart still knows what's ready");
});

test("continuation #4 the inline host falls back to POLLING when fs.watch is unavailable", () => {
  // both failure paths — watch() throwing at creation and the watcher emitting 'error' — must start the
  // bounded polling fallback, not silently degrade express to marker-only.
  assert.match(APP, /catch \{ startStreamPoll\(s\); \/\* recursive watch unsupported/, "a watch-create failure polls instead of going dark");
  assert.match(APP, /s\.runWatcher = null; startStreamPoll\(s\); \}\);/, "a watcher 'error' also starts the fallback");
  const poll = APP.match(/function startStreamPoll\(s\)[\s\S]*?\n\}/)[0];
  assert.match(poll, /if \(!s\.clients\.size\) \{ clearInterval\(s\.streamPollT\)/, "the fallback is BOUNDED to a viewer being attached — it stops when nobody is watching");
  assert.match(poll, /autoAssemble\(s\)/, "the fallback re-assembles through the same boundary the watcher uses");
  assert.match(poll, /streamDegraded = true/, "a degraded-streaming state is surfaced, not hidden");
  // closeWatchers must also clear the poll interval
  const cw = APP.match(/function closeWatchers\(s\)[\s\S]*?\n\}/)[0];
  assert.match(cw, /clearInterval\(s\.streamPollT\)/, "teardown clears the polling fallback too");
});

test("host-owned stage board: emitted from artifacts, not only from the conductor's progress.jsonl", () => {
  // board() builds rows from artifact truth, but the board was only emitted inside the progress.jsonl
  // watch branch — so express builds (which often skip writing progress.jsonl) showed a blank board.
  assert.match(APP, /function emitHostBoard\(s\)/, "there is a host-owned board emitter");
  const fn = APP.match(/function emitHostBoard\(s\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /progressBoard\(runDir\(s\)\)/, "it reads the board from artifact truth");
  assert.match(fn, /emit\(s, "agent-progress"/, "…and emits it to the pane");
  // wired into catch-up AND the watcher (≥3 call sites incl. the definition), not just defined
  assert.ok((APP.match(/emitHostBoard\(s\)/g) || []).length >= 3, "emitHostBoard is wired into pane-open catch-up and the stage-artifact watcher");
  // and its debounce timer is cleaned up with the others
  assert.match(APP, /"reloadT", "hbT"/, "the board timer is cleared in closeWatchers");
});

test("round-5 finalization race — publish while busy, persist the verdict before emitting turn-end", () => {
  const handler = APP.match(/"turn-end": async \(r\) => \{[\s\S]*?\n    \},/)[0];
  const pubIdx = handler.indexOf("await publishBuild(s)");
  const finishIdx = handler.indexOf("core.finishTurn(");
  const persistIdx = handler.indexOf("persist(s);");
  const emitIdx = handler.indexOf('emit(s, "turn-end"');
  assert.ok(pubIdx !== -1 && finishIdx !== -1 && persistIdx !== -1 && emitIdx !== -1, "all four steps are present");
  assert.ok(pubIdx < finishIdx, "the durable publish runs BEFORE finishTurn clears busy — no second conductor mid-publish");
  assert.ok(persistIdx < emitIdx, "the verdict is recorded + persisted BEFORE turn-end is emitted — a reload in between sees it (local disk is synchronous)");
});

test("round-5 #2 reload applies the verdict BEFORE installing artifacts, so a bad turn can't show ready", () => {
  const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
  const open = UI.match(/async function openSession\(id\)[\s\S]*?\n  connect\(\);/)[0];
  assert.match(open, /if \(session\.lastTurnVerdict && session\.lastTurnVerdict\.ok === false\) lastTurnFailed = true;/,
    "a non-ok persisted verdict suppresses the ready card on reload");
  const guardIdx = open.indexOf("session.lastTurnVerdict");
  const artIdx = open.indexOf('setArtifact("prototype"');
  assert.ok(guardIdx !== -1 && artIdx !== -1 && guardIdx < artIdx,
    "the verdict + busy guard run BEFORE setArtifact()'s announceGenReady(), not after");
});
