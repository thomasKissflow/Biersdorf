// stream-recovery.test.mjs — a dead stream is a SILENT chat, not a degraded one.
//
// Every bubble reaches the screen from an event, including the sender's own. So when the stream is
// gone the message still posts, the server still answers 202, the build still runs — and the window
// never changes. Reported 2026-08-10 with a network panel full of 202s and an empty transcript.
//
// It got there because giving up was permanent AND unannounced:
//
//     if (connectFails >= 4) { es.close(); if (busy) { …notice… } }
//
// Four failures closed the EventSource for good, and the only notice was behind `if (busy)`. A
// stream that dropped while IDLE — which is every stream after a turn ends — left a chat that looked
// perfectly healthy and heard nothing ever again. Cloud Run cuts idle streams and recycles
// instances, so this was reachable by doing nothing at all.
//
// Giving up still has to exist: a session whose process is gone 404s forever, and blind retries are
// what once left the composer stuck on "building…". So the rule being pinned is that the two cases
// are TOLD APART by asking, not by assuming the worse one.
//
// The handlers are executed against stubs, because what broke was control flow — which branch runs
// after four failures — and only running it takes a branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
// sliced between anchors rather than matched as one expression — a single regex over two functions
// separated by a comment block is its own small maintenance problem
// Anchored on a PREFIX, not the whole declaration: adding one more piece of state to that line
// silently broke the slice, and every test in this file then failed with "must exist" rather than
// with anything about behaviour.
const from = UI.indexOf("let connectFails = 0, esRetryT = null");
const to = UI.indexOf("\n// The two moments a person is most likely to notice");
assert.ok(from > 0 && to > from, "connect() and probeAndReconnect() must exist");
const src = [UI.slice(from, to)];
const ensure = UI.match(/function ensureStream\(\) \{[\s\S]*?\n\}/);
assert.ok(ensure, "ensureStream() must exist");

// A fake EventSource we can fail on command, plus the globals the two functions reach for.
// `probe` models what the SERVER did, which is the distinction the code has to make:
//   "alive"  → 200            "gone" → 404 (authoritative)
//   "throw"  → the fetch rejects (instance died mid-request, network blip) — NOT an answer
//   <number> → that status (502, 401, …) — also not an answer
// The old harness could only say `sessionAlive: true|false` and its fake fetch never threw, which
// is precisely why "could not ask" being treated as "gone" was invisible here for so long.
function harness({ sessionAlive = true, busy = false, probe = null } = {}) {
  const mode = probe ?? (sessionAlive ? "alive" : "gone");
  const fakeFetch = async () => {
    if (mode === "throw") throw new TypeError("Failed to fetch");
    if (mode === "alive") return { ok: true, status: 200 };
    if (mode === "gone") return { ok: false, status: 404 };
    return { ok: false, status: Number(mode) };
  };
  const notes = [], opened = [];
  let inst = null;
  const timers = [];
  class FakeES {
    constructor(url) { this.url = url; this.readyState = 0; opened.push(url); inst = this; }
    close() { this.readyState = 2; }
    fail() { this.onerror?.(); }
    open() { this.readyState = 1; this.onopen?.(); }
  }
  const ctx = {
    EventSource: FakeES,
    S: { id: "s1" }, seq: 7, busy, view: "chat", es: null,
    apply: () => {}, setBusy: (v) => { ctx.busy = v; },
    note: (t, c) => notes.push({ t, c }),
    document: { hidden: false },
    fetch: fakeFetch,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, id: timers.length + 1, live: true }); return timers.length; },
    clearTimeout: (id) => { const t = timers[id - 1]; if (t) t.live = false; },
    addEventListener: () => {},
  };
  // `es` is assigned by connect(), so it has to live on the shared object the code closes over
  const names = Object.keys(ctx);
  const body = `${src[0]}\n${ensure[0]}\nreturn { connect, probeAndReconnect, ensureStream };`;
  const fns = new Function(...names, body)(...names.map((n) => ctx[n]));
  // connect() writes to the free variable `es`; give it somewhere real to land
  return { ...fns, ctx, notes, opened, timers, cur: () => inst };
}

test("a stream that drops while IDLE is announced, not swallowed", async () => {
  const h = harness();
  h.connect();
  // SALVAGE FIRST: the opening failures are fixed quietly, because a red line about a problem that
  // cures itself two seconds later just asks the reader to work out what broke when nothing did.
  for (let i = 0; i < 4; i++) h.cur().fail();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.notes.length, 0, "a blip we are already fixing is not news");
  // …but silence must not be permanent — that was the original bug. Keep it broken and it speaks.
  for (let i = 0; i < 3; i++) { h.cur().fail(); await new Promise((r) => setImmediate(r)); }
  assert.ok(h.notes.length, "silence here is the whole bug — the chat looks healthy and hears nothing");
  assert.match(h.notes[0].t, /reconnect/i);
});

test("…and it keeps trying, because the session is still there", async () => {
  const h = harness({ sessionAlive: true });
  h.connect();
  for (let i = 0; i < 4; i++) h.cur().fail();
  await new Promise((r) => setImmediate(r));
  const retries = h.timers.filter((t) => t.live && t.ms < 60_000);
  assert.equal(retries.length, 1, "closing for good is what made the chat permanently deaf");
  assert.ok(retries[0].ms >= 1000, "…and it backs off rather than hammering");
});

test("a session that is genuinely GONE still stops, and still says so", async () => {
  const h = harness({ sessionAlive: false, busy: true });
  h.connect();
  for (let i = 0; i < 4; i++) h.cur().fail();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.timers.filter((t) => t.live && t.ms < 60_000).length, 0,
    "retrying a 404 forever is what left the composer stuck on 'building…'");
  assert.equal(h.timers.filter((t) => t.live && t.ms > 60_000).length, 0,
    "and the hourly renewal must not resurrect a session we just declared gone");
  assert.equal(h.ctx.busy, false, "and the composer has to be let go");
  assert.match(h.notes.at(-1).t, /no longer on the server/i);
});

// The bug this file was written for came back wearing the other face: not "gave up silently", but
// "gave up loudly over nothing". Reported 2026-08-12 — the notice appeared and a REFRESH cleared it,
// which is only possible if the session and the login were both fine the whole time.
test("an unreachable server is not a dead session — it retries, and says nothing about the build", async () => {
  const h = harness({ probe: "throw", busy: true });
  h.connect();
  for (let i = 0; i < 4; i++) h.cur().fail();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.timers.filter((t) => t.live && t.ms < 60_000).length, 1,
    "a fetch that threw is 'I could not ask', not 'the answer was no' — it has to keep trying");
  assert.equal(h.notes.filter((n) => /no longer on the server/i.test(n.t)).length, 0,
    "announcing a dead build over a network blip is the bug; a refresh proved the session was fine");
  assert.equal(h.ctx.busy, true, "and a build that is still running must not have its composer released");
});

test("a 5xx is also not an answer — the session is only gone when the server SAYS 404", async () => {
  const h = harness({ probe: 502 });
  h.connect();
  for (let i = 0; i < 4; i++) h.cur().fail();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.timers.filter((t) => t.live && t.ms < 60_000).length, 1, "502 means ask again, not give up");
  assert.equal(h.notes.filter((n) => /no longer on the server/i.test(n.t)).length, 0);
});

test("reconnecting replays from where we stopped hearing", () => {
  const h = harness();
  h.connect();
  assert.match(h.opened[0], /\/api\/sessions\/s1\/stream\?since=7$/,
    "without since=, everything that happened while the stream was down is lost for good");
});

test("coming back says so — a red line with no green one reads as still broken", async () => {
  const h = harness();
  h.connect();
  // far enough to have actually SAID something: a recovery notice only makes sense as the answer to
  // a problem notice, and an outage we fixed in silence should stay silent at both ends.
  for (let i = 0; i < 7; i++) { h.cur().fail(); await new Promise((r) => setImmediate(r)); }
  assert.ok(h.notes.some((n) => /reconnect/i.test(n.t)), "precondition: the outage was announced");
  h.connect();
  h.cur().open();
  assert.match(h.notes.at(-1).t, /Reconnected/);
  assert.equal(h.notes.at(-1).c, "ok");
});

test("a healthy stream is left alone", () => {
  const h = harness();
  h.connect();
  h.cur().open();
  const n = h.opened.length;
  h.ensureStream();
  assert.equal(h.opened.length, n, "reconnecting an open stream would drop events mid-build");
});

test("sending reopens a closed stream first", () => {
  assert.match(UI, /ensureStream\(\);\s*\n\s*\/\/ Omitting `addressed`/,
    "sending is when a dead stream costs most — the post succeeds and the sender watches nothing");
});

test("returning to the tab or the network reconnects", () => {
  assert.match(UI, /addEventListener\("visibilitychange", \(\) => \{ if \(!document\.hidden\) ensureStream\(\); \}\)/);
  assert.match(UI, /addEventListener\("online", ensureStream\)/);
});

// ── the hourly certainty ──────────────────────────────────────────────────────────────────────────
// Cloud Run ends every request at 60 minutes, streams included. Production logs: 200 stream requests
// over two days, 182 of them (91%) terminated at exactly the ceiling, median latency 3601s. So this
// is not a drop that "sometimes happens" — it is guaranteed, hourly, for anyone who leaves a chat
// open. Recovery covers it, but recovery is an error path: a red line every hour for something
// routine. Renewing early turns it into a handover nobody sees.
test("the stream renews itself before the 60-minute ceiling can cut it", () => {
  const h = harness();
  h.connect();
  const cycle = h.timers.find((t) => t.live && t.ms > 60_000);
  assert.ok(cycle, "nothing schedules a renewal — every session eats the hourly cut as an error");
  assert.ok(cycle.ms < 60 * 60 * 1000,
    `renewal at ${cycle.ms}ms is not inside the ceiling — it would fire after the cut it exists to avoid`);
  assert.ok(cycle.ms >= 30 * 60 * 1000, "…and not so eager that it churns the connection");
});

test("a planned renewal is silent — close() raises no error, so nothing is announced", () => {
  const h = harness();
  h.connect();
  h.cur().open();
  const before = h.notes.length;
  const cycle = h.timers.find((t) => t.live && t.ms > 60_000);
  cycle.fn();                       // the renewal fires
  assert.equal(h.opened.length, 2, "it should have opened a fresh stream");
  assert.equal(h.notes.length, before, "and said nothing — this is routine, not a failure");
  assert.match(h.opened[1], /since=7$/, "…replaying from where the old one stopped, so nothing is lost");
});
