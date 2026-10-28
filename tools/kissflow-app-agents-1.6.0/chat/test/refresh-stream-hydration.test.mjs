// refresh-stream-hydration.test.mjs — a refresh must NOT wipe the conversation. The build's progress
// (every agent/tool/phase row) lives in the event log and is replayed when the SSE stream reconnects —
// but the stream route read only the IN-MEMORY session map, so after a redeploy or scale-to-zero cycle
// (the map is empty then) it 404'd the reconnect and nothing replayed: the chat looked wiped even though
// it sat in Postgres the whole time. The fix is one read: the stream hydrates the session like every
// other route. Same class of bug as session-hydration.test.mjs, one route it missed.
import "./_env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, handleChat, __test } from "../app.mjs";

const { sessions, emit, flushLog, flushDeltas } = __test;

const mkReq = (method, url) => { const h = {}; return { method, url, headers: { host: "localhost" }, on(e, fn) { h[e] = fn; }, close() { h.close?.(); } }; };
function mkRes() { const r = { status: 0, chunks: [], body: "" }; r.writeHead = (c) => { r.status = c; return r; }; r.write = (c) => { r.chunks.push(String(c)); return true; }; r.end = (b) => { if (b) r.body = String(b); return r; }; return r; }
// close a session's fs watchers so the test doesn't leak descriptors (EMFILE) after the stream route
// opened them via watchRun/watchPreview.
function cleanup(s) { try { s?.watcher?.close(); s?.runWatcher?.close(); s?.previewWatcher?.close(); } catch { /* already gone */ } }

test("#refresh the stream reconnect hydrates an evicted session and replays its event backlog", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { sub: (await db.upsertUser({ email: "r@kissflow.com" })).sub, role: "developer" };

  // create a session and put some build progress in the LOG (what a live build streams)
  await handleChat(mkReq("POST", "/api/sessions"), mkRes(), me, { slug: "refresh-app", name: "Refresh App" });
  const listed = mkRes(); await handleChat(mkReq("GET", "/api/sessions"), listed, me, {});
  const s0 = JSON.parse(listed.body).sessions.find((x) => x.slug === "refresh-app");
  const live = sessions.get(s0.id);
  emit(live, "phase", { name: "Whole-app coherence critic" });
  emit(live, "agent", { id: "a1", name: "Reviewer", text: "checking the whole app hangs together" });
  flushDeltas(live);   // agent/text stream through a coalescing buffer; a real build flushes it to the log too
  await flushLog(live);

  // SIMULATE THE REDEPLOY: the in-memory session is gone, but its row + events are in the DB.
  sessions.delete(s0.id);
  assert.equal(sessions.has(s0.id), false, "evicted from memory, like a fresh instance");

  // the browser reconnects the stream after the refresh
  const streamReq = mkReq("GET", `/api/sessions/${s0.id}/stream?since=0`);
  const streamRes = mkRes();
  await handleChat(streamReq, streamRes, me, {});
  streamReq.close();

  assert.equal(streamRes.status, 200, "the stream hydrates the session instead of 404ing the refresh");
  const replayed = streamRes.chunks.join("");
  assert.match(replayed, /Whole-app coherence critic/, "the build's progress events are replayed, not lost");
  assert.match(replayed, /Reviewer/, "…including the agent activity — the conversation survives the refresh");
  cleanup(sessions.get(s0.id));
});

test("#8 a same-instance reconnect flushes the pending delta — the buffered paragraph is not dropped", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { sub: (await db.upsertUser({ email: "r2@kissflow.com" })).sub, role: "developer" };
  await handleChat(mkReq("POST", "/api/sessions"), mkRes(), me, { slug: "same-inst", name: "Same Instance" });
  const listed = mkRes(); await handleChat(mkReq("GET", "/api/sessions"), listed, me, {});
  const s0 = JSON.parse(listed.body).sessions.find((x) => x.slug === "same-inst");
  const live = sessions.get(s0.id);

  // A live build streams prose as an agent DELTA that is still coalescing — NOT flushed to the log. The
  // session stays in memory (same instance), and the user refreshes. The route itself must flush the
  // delta before replaying, or the paragraph is missing.
  emit(live, "agent", { id: "a1", name: "Designer", text: "picking the palette and the layout" });
  // deliberately do NOT flushDeltas here — the route is what must do it.

  const streamReq = mkReq("GET", `/api/sessions/${s0.id}/stream?since=0`);
  const streamRes = mkRes();
  await handleChat(streamReq, streamRes, me, {});
  streamReq.close();

  assert.equal(streamRes.status, 200);
  assert.match(streamRes.chunks.join(""), /picking the palette/, "the route flushed the pending delta into the replay");
  cleanup(sessions.get(s0.id));
});
