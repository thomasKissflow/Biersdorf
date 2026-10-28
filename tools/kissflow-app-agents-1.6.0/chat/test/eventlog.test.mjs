// eventlog.test.mjs — the durable event log: what a reconnecting browser, and a colleague who opens
// the chat an hour later, actually get served.
//
// The rules pinned here are the ones that fail silently. A mis-ordered event still renders fine live
// and is wrong forever on replay; a seq that restarts at 0 makes a reconnect look like a frozen chat;
// one row per token quietly turns a long build into 100k rows.
import "./_env.mjs";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, handleChat, __test } from "../app.mjs";

const settle = (ms = 260) => new Promise((r) => setTimeout(r, ms));

// A real emitter, not a noop `on()`: the SSE route registers req.on("close") to clear its 25s heartbeat
// and drop the client. With a stub that never fires, the interval keeps the loop alive and the run
// hangs instead of finishing — which is exactly what happened the first time.
const mkReq = (method, url) => Object.assign(new EventEmitter(), { method, url, headers: { host: "localhost" } });

// The stream route also attaches fs watchers to the run directory. Nothing in the product closes them
// (a session outlives any one viewer), so the test has to.
//
// Run this file with --test-force-exit. Even with the cleanup below, one FSEventWrap outlives the run —
// an orphaned watcher whose session was replaced; every session still IN the map is clean. It is a
// harness artefact, not product behaviour, and it is not worth more than this comment.
after(() => {
  for (const s of __test.sessions.values()) {
    try { s.watcher?.close(); s.runWatcher?.close(); } catch {}
    clearTimeout(s.deltaT); clearTimeout(s.logT); clearTimeout(s.reloadT); clearTimeout(s.bpT);
  }
});
function mkRes() {
  const r = { status: 0, body: "", chunks: [] };
  r.writeHead = (c) => { r.status = c; return r; };
  r.write = (c) => { r.chunks.push(String(c)); return true; };
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}
async function newSession(db, me) {
  const res = mkRes();
  await handleChat(mkReq("POST", "/api/sessions"), res, me, { slug: `log-${Math.random().toString(36).slice(2, 8)}` });
  return JSON.parse(res.body).session;
}

test("prose is coalesced into one event, not one per token", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = await db.upsertUser({ email: "a@acme.com", name: "A" });
  const s = __test.sessions.get((await newSession(db, { ...me, role: "admin" })).id);

  for (const ch of ["Design", "ing ", "the ", "shell"]) __test.emit(s, "text", { text: ch });
  await settle();
  await __test.flushLog(s);

  const rows = await db.readChatEvents(s.id, 0);
  const text = rows.filter((r) => r.payload.type === "text");
  assert.equal(text.length, 1, "four deltas become ONE logged event");
  assert.equal(text[0].payload.text, "Designing the shell");
});

test("a non-prose event never overtakes the paragraph it followed", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = await db.upsertUser({ email: "b@acme.com", name: "B" });
  const s = __test.sessions.get((await newSession(db, { ...me, role: "admin" })).id);

  __test.emit(s, "text", { text: "building the buyer page" });
  __test.emit(s, "phase", { name: "Prototype" });   // arrives INSIDE the 150ms coalesce window
  await settle();
  await __test.flushLog(s);

  const rows = await db.readChatEvents(s.id, 0);
  const kinds = rows.map((r) => r.payload.type);
  assert.deepEqual(kinds, ["text", "phase"], "the pending prose is flushed before the phase is numbered");
  assert.ok(rows[0].payload.seq < rows[1].payload.seq, "and it keeps the lower seq");
});

test("two speakers do not get merged into one bubble", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = await db.upsertUser({ email: "c@acme.com", name: "C" });
  const s = __test.sessions.get((await newSession(db, { ...me, role: "admin" })).id);

  __test.emit(s, "agent", { id: "t1", name: "Design Director", text: "palette: " });
  __test.emit(s, "agent", { id: "t1", name: "Design Director", text: "slate" });
  __test.emit(s, "agent", { id: "t2", name: "Prototype Builder", text: "assembling" });
  await settle();
  await __test.flushLog(s);

  const agents = (await db.readChatEvents(s.id, 0)).filter((r) => r.payload.type === "agent").map((r) => r.payload);
  assert.equal(agents.length, 2, "same speaker coalesces, a different speaker starts a new event");
  assert.equal(agents[0].text, "palette: slate");
  assert.equal(agents[1].name, "Prototype Builder");
});

test("a reconnecting client replays from the log, and only what it is missing", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { ...(await db.upsertUser({ email: "d@acme.com", name: "D" })), role: "admin" };
  const sess = await newSession(db, me);
  const s = __test.sessions.get(sess.id);

  __test.emit(s, "phase", { name: "one" });
  __test.emit(s, "phase", { name: "two" });
  __test.emit(s, "phase", { name: "three" });
  await settle();

  const res = mkRes();
  const req = mkReq("GET", `/api/sessions/${s.id}/stream?since=1`);
  await handleChat(req, res, me, {});
  const replayed = res.chunks.join("").split("\n\n").filter((c) => c.startsWith("data: ")).map((c) => JSON.parse(c.slice(6)));
  assert.deepEqual(replayed.map((e) => e.name), ["two", "three"], "everything after seq 1, nothing before it");
  req.emit("close");   // hang up, as a real browser would — releases the heartbeat
});

test("event numbering survives a restart", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { ...(await db.upsertUser({ email: "e@acme.com", name: "E" })), role: "admin" };
  const s = __test.sessions.get((await newSession(db, me)).id);
  __test.emit(s, "phase", { name: "one" });
  __test.emit(s, "phase", { name: "two" });
  await settle();
  await __test.flushLog(s);
  const before = s.seq;
  assert.ok(before >= 2);

  // A restart: the process forgets everything and rebuilds its sessions from the database.
  // Close first — clearing the map orphans every fs watcher and timer hanging off these sessions, and
  // an orphaned watcher keeps the event loop alive after the last assertion passes.
  for (const old of __test.sessions.values()) {
    try { old.watcher?.close(); old.runWatcher?.close(); } catch {}
    clearTimeout(old.deltaT); clearTimeout(old.logT); clearTimeout(old.reloadT); clearTimeout(old.bpT);
  }
  __test.sessions.clear();
  await __test.loadSessions();
  const revived = __test.sessions.get(s.id);
  assert.ok(revived, "the session comes back");
  // STRICTLY ahead of the log, never equal: events emitted inside the dead instance's debounce
  // window are lost from the log, so resuming AT the max can re-issue numbers connected clients
  // already saw — they drop the "duplicates" and posted messages vanish until a reload.
  assert.ok(revived.seq > before, `resumes numbering ahead of the log (${revived.seq} > ${before}), never at 0 or a reused number`);
});

test("a viewer on a replica that is NOT driving the build still sees it", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { ...(await db.upsertUser({ email: "f@acme.com", name: "F" })), role: "admin" };
  const sess = await newSession(db, me);
  const s = __test.sessions.get(sess.id);

  // A browser is watching HERE.
  const res = mkRes();
  const req = mkReq("GET", `/api/sessions/${s.id}/stream?since=0`);
  await handleChat(req, res, me, {});
  res.chunks.length = 0;

  // Another replica drives the build: events land in the shared log, this instance never emitted them.
  // Its own seq stays put — exactly the state a non-driving replica is in.
  await db.appendChatEvents(s.id, [
    { seq: s.seq + 1, payload: { seq: s.seq + 1, type: "phase", name: "Design" } },
    { seq: s.seq + 2, payload: { seq: s.seq + 2, type: "text", text: "building the shell" } },
  ]);
  await db.notifyChatEvent(s.id, s.seq + 2);
  await new Promise((r) => setTimeout(r, 30));

  const got = res.chunks.join("").split("\n\n").filter((c) => c.startsWith("data: ")).map((c) => JSON.parse(c.slice(6)));
  assert.deepEqual(got.map((e) => e.type), ["phase", "text"], "the other replica's events reach this viewer");
  req.emit("close");
});

test("following the log never re-numbers or duplicates", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { ...(await db.upsertUser({ email: "g@acme.com", name: "G" })), role: "admin" };
  const s = __test.sessions.get((await newSession(db, me)).id);
  const res = mkRes();
  const req = mkReq("GET", `/api/sessions/${s.id}/stream?since=0`);
  await handleChat(req, res, me, {});
  res.chunks.length = 0;

  await db.appendChatEvents(s.id, [{ seq: s.seq + 1, payload: { seq: s.seq + 1, type: "phase", name: "Build" } }]);
  const at = s.seq + 1;
  await __test.onRemoteEvents(s.id, at);
  await __test.onRemoteEvents(s.id, at);           // the poll and the notification both fire
  const got = res.chunks.join("").split("\n\n").filter((c) => c.startsWith("data: "));
  assert.equal(got.length, 1, "delivered once, not once per signal");
  assert.equal(s.seq, at, "and the local high-water mark follows the log");
  req.emit("close");
});

// The drain-window case the two tests above miss: after a deploy, the restored instance's emit
// counter is +200 AHEAD of the log (so its own numbers cannot collide), while the drained old
// instance keeps writing rows BELOW that counter. The follower used to compare against the emit
// counter, decided it was ahead of the log, and went blind — an admin who signed in after a promote
// watched a build frozen at its boot snapshot while sixteen page agents ran on the old instance
// (quayside-yard-control, 2026-08-04). Following reads the LOG cursor; the counter is only for minting.
test("rows written below the +200 restore gap still reach a viewer", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { ...(await db.upsertUser({ email: "h@acme.com", name: "H" })), role: "admin" };
  const s = __test.sessions.get((await newSession(db, me)).id);

  // the restored state, exactly: log at 3, emit counter jumped to 203
  await db.appendChatEvents(s.id, [1, 2, 3].map((n) => ({ seq: n, payload: { seq: n, type: "text", text: "t" + n } })));
  s.seq = 203; s.logSeq = 3;

  const res = mkRes();
  const req = mkReq("GET", `/api/sessions/${s.id}/stream?since=203`);
  await handleChat(req, res, me, {});
  res.chunks.length = 0;

  // the old instance, still draining, writes into the gap
  await db.appendChatEvents(s.id, [
    { seq: 4, payload: { seq: 4, type: "phase", name: "Assemble" } },
    { seq: 5, payload: { seq: 5, type: "text", text: "verifier running" } },
  ]);
  await db.notifyChatEvent(s.id, 5);
  await new Promise((r) => setTimeout(r, 30));

  const got = res.chunks.join("").split("\n\n").filter((c) => c.startsWith("data: ")).map((c) => JSON.parse(c.slice(6)));
  assert.deepEqual(got.map((e) => e.seq), [4, 5], "gap rows are forwarded, not silently skipped");
  assert.equal(s.logSeq, 5, "the log cursor follows the log");
  assert.equal(s.seq, 203, "the emit counter never regresses — minting stays collision-safe");

  // and this instance's OWN rows are never re-streamed when the follower re-reads the log
  __test.emit(s, "log", { text: "own row" });
  await __test.flushLog(s);
  res.chunks.length = 0;
  await __test.onRemoteEvents(s.id, s.seq);
  assert.equal(res.chunks.filter((c) => c.includes('"own row"')).length, 0, "own rows are skipped on re-read");
  req.emit("close");
});
