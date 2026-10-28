// session-hydration.test.mjs — "This build is no longer on the server", about a session that was
// sitting in Postgres the whole time.
//
// loadSessions() runs once, at boot, and nothing ever added to the map afterwards: onRemoteEvents
// returns early on an id it does not already hold, and the follower poll only walks sessions already
// there. Harmless on one replica. The service runs maxScale=8 with NO session affinity — 11 distinct
// instances served traffic in a day — so a request landed on a replica at random and the ones that
// booted before the session was created had never heard of it.
//
// Proven on a live session before the fix: 200 from one instance, 404 from three others, same minute.
// 106 in a day and climbing (2026-08-11). The message even told people to send a message to resume
// it, which hit the identical dead lookup.
//
// The whole bug is one missing read, so the tests are about the read: it happens, it happens ONCE
// under a stampede, it does not clobber a live session, and it does not make the late-arriving
// replica think it should start driving the build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { __test } from "../app.mjs";
import { snapshotOf, hydrate } from "../session-core.mjs";

const { sessions, getSession } = __test;

/** Stand in for the database, and count reads so a stampede is visible. */
function fakeDb(rows = {}, { maxSeq = {} } = {}) {
  const db = {
    reads: 0, seqReads: [],
    async getChatSession(id) { db.reads++; await new Promise((r) => setImmediate(r)); return rows[id] || null; },
    async maxChatEventSeqs(id) { db.seqReads.push(id); return id ? (maxSeq[id] ? { [id]: maxSeq[id] } : {}) : { ...maxSeq }; },
  };
  return db;
}

const row = (id, over = {}) => ({
  id, project_id: null, slug: "demo",
  data: snapshotOf(hydrate({ id, slug: "demo", title: "Demo", createdAt: new Date().toISOString(), messages: [], ...over })),
});

/** initChat wires the module-level DB; that is the only way in from a test. */
async function withDb(db, fn) {
  const { initChat } = await import("../app.mjs");
  await initChat({ db });
  try { return await fn(); } finally { /* leave the map as the test found it */ }
}

test("a session this replica never booted with is READ, not declared gone", async () => {
  const id = "sess-from-another-replica";
  const db = fakeDb({ [id]: row(id) });
  await withDb(db, async () => {
    sessions.delete(id);                       // this instance has never heard of it
    const s = await getSession(id);
    assert.ok(s, "a 404 here is the reported bug — the row exists");
    assert.equal(s.id, id);
    assert.ok(sessions.has(id), "and it stays in the map, so the ~13 downstream lookups find it");
  });
});

test("a stampede makes ONE query, not one per request", async () => {
  const id = "sess-stampede";
  const db = fakeDb({ [id]: row(id) });
  await withDb(db, async () => {
    sessions.delete(id);
    // the browser probes, the iframe reloads and the poller ticks — all at once, all on a cold map
    const all = await Promise.all(Array.from({ length: 8 }, () => getSession(id)));
    assert.equal(db.reads, 1, `8 concurrent lookups made ${db.reads} queries`);
    assert.ok(all.every((s) => s && s === all[0]), "and every caller gets the SAME object");
  });
});

test("a session already in the map is never re-read or replaced", async () => {
  const id = "sess-live";
  const db = fakeDb({ [id]: row(id) });
  await withDb(db, async () => {
    const live = hydrate({ id, slug: "demo", title: "Demo", createdAt: new Date().toISOString(), messages: [] });
    live.marker = "the object other code holds references to";
    sessions.set(id, live);
    const s = await getSession(id);
    assert.equal(s, live, "replacing a live session swaps the object out from under its own clients");
    assert.equal(db.reads, 0, "and it must not touch the database at all");
    sessions.delete(id);
  });
});

test("a genuinely unknown session is still a 404 — the message is right when the row is gone", async () => {
  const db = fakeDb({});
  await withDb(db, async () => {
    assert.equal(await getSession("no-such-session"), null);
    assert.equal(sessions.has("no-such-session"), false, "and nothing is cached for it");
  });
});

test("the event cursors are restored, or the client silently drops what it is sent", async () => {
  const id = "sess-seq";
  const db = fakeDb({ [id]: row(id) }, { maxSeq: { [id]: 412 } });
  await withDb(db, async () => {
    sessions.delete(id);
    const s = await getSession(id);
    // Same two cursors as the boot path, for the same reason: `seq` clears numbers already streamed
    // to connected clients, `logSeq` is where following must read from.
    assert.equal(s.logSeq, 412, "following reads from where the log actually stands");
    assert.equal(s.seq, 612, "and this instance mints numbers no client has already seen");
    assert.deepEqual(db.seqReads, [id], "asked for ONE session, not a GROUP BY over the whole log");
    sessions.delete(id);
  });
});

test("a late-arriving replica does not decide it should drive the build", async () => {
  const id = "sess-mid-build";
  // a turn is in flight somewhere else
  const db = fakeDb({ [id]: row(id, { turnId: "turn-live", turnAttempts: 1 }) });
  await withDb(db, async () => {
    sessions.delete(id);
    const s = await getSession(id);
    // `fromBoot` is what resumeInterrupted() acts on, by spawning a conductor. This replica is a
    // reader that arrived late, not the driver — setting it would put a SECOND conductor on one run
    // directory, which is the exact bug resumeInterrupted's own guard exists to prevent.
    assert.ok(!s.fromBoot, "hydrating on demand must not look like a boot-time restore");
    sessions.delete(id);
  });
});
