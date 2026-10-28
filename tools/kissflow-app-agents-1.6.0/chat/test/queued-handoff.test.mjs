// queued-handoff.test.mjs — "send another message while the app is building" must not strand the
// follow-up (Codex round-8). `chat_jobs_one_live` is a UNIQUE partial index on (session_id) WHERE status
// IN ('queued','running'), so a successor enqueued BEFORE the finished turn's completeTurn commits is
// dropped by ON CONFLICT DO NOTHING — and nothing re-schedules it. On the memory store completeTurn
// resolves synchronously so the race is invisible; this test injects a Postgres-style delayed completion
// (the exact condition Codex reproduced) and proves the successor is preserved and enqueued exactly once.
import "./_env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, __test } from "../app.mjs";
import { hydrate } from "../session-core.mjs";

const { sessions, finishJob, startTurn, postMessage } = __test;

test("first DB invariant: a successor cannot enqueue while the predecessor job is still running", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await db.migrate?.();
  assert.ok(await db.enqueueTurn("sessX", {}, null), "the first job enqueues");
  const job = await db.claimNextTurn("inst", { leaseSec: 60 });   // → running
  assert.equal(await db.enqueueTurn("sessX", {}, null), null, "a successor is REFUSED while the job runs (one-live-job)");
  await db.completeTurn(job.id);                                  // predecessor done
  assert.ok(await db.enqueueTurn("sessX", {}, null), "…and enqueues fine once the predecessor completes");
});

test("a follow-up queued during a build survives a SLOW job completion and starts exactly once", async () => {
  const base = makeDb({ db: { backend: "memory" } });
  await base.migrate?.();
  // Postgres-style: completeTurn is a real async round-trip that commits AFTER the drain would attempt the
  // successor enqueue. claimNextTurn is stubbed so nothing spawns an actual build — the presence of the
  // queued successor is the proof that the handoff was not stranded.
  let completed = 0;
  const db = {
    ...base,
    completeTurn: (id) => new Promise((r) => setTimeout(() => { completed++; base.completeTurn(id).then(r); }, 40)),
    claimNextTurn: async () => null,
  };
  await initChat({ db });
  const owner = await base.upsertUser({ email: "handoff@acme.com" });

  // a session with a RUNNING job and a pending, addressed follow-up message
  const s = { id: "handoff-1", slug: "handoff", ownerSub: owner.sub, busy: false, clients: new Set(),
    messages: [{ role: "user", content: "do more", addressed: true, consumedBy: null }] };
  sessions.set(s.id, s);
  await base.enqueueTurn(s.id, {}, owner.sub);                     // set up the RUNNING predecessor via base
  const job = await base.claimNextTurn("inst", { leaseSec: 60 }); // (db.claimNextTurn is stubbed to null)
  s.jobId = job.id;

  // the turn ends: finishJob captures the (slow) completion; startTurn is the drain path
  finishJob(s);
  assert.ok(s.jobDone, "the in-flight completion is remembered for the handoff to await");
  await startTurn(s);                       // must await s.jobDone, THEN enqueue the successor
  // give any trailing microtasks a beat
  await new Promise((r) => setTimeout(r, 60));

  assert.ok(completed >= 1, "the predecessor's completion actually committed");
  const depth = await base.queueDepth();
  assert.equal(depth.queued + depth.running, 1, "exactly ONE successor job exists for the follow-up — not zero (stranded), not two");
});

test("a message POSTED right after turn-end (before completion commits) is not stranded either", async () => {
  const base = makeDb({ db: { backend: "memory" } });
  await base.migrate?.();
  let completed = 0;
  const db = {
    ...base,
    completeTurn: (id) => new Promise((r) => setTimeout(() => { completed++; base.completeTurn(id).then(r); }, 40)),
    claimNextTurn: async () => null,   // don't spawn a real build
  };
  await initChat({ db });
  const owner = await base.upsertUser({ email: "post@acme.com" });

  // an idle session whose PREVIOUS turn's completion is still in flight (as right after turn-end)
  const s = hydrate({ id: "post-1", slug: "post", ownerSub: owner.sub, title: "New app", messages: [] });
  sessions.set(s.id, s);
  await base.enqueueTurn(s.id, {}, owner.sub);
  const job = await base.claimNextTurn("inst", { leaseSec: 60 });
  s.jobId = job.id;
  finishJob(s);                                   // turn-end fired the (slow) completion
  assert.ok(s.jobDone, "the completion is in flight");

  // the user immediately types the next change — this goes through postMessage's OWN enqueue path
  const me = { sub: owner.sub, email: owner.email, role: "developer" };
  const res = await postMessage(s, "now add a dashboard", me, true);
  await new Promise((r) => setTimeout(r, 60));

  assert.ok(completed >= 1, "the predecessor completed");
  assert.ok(res.invoked || res.queued, "the post was accepted");
  const depth = await base.queueDepth();
  assert.equal(depth.queued + depth.running, 1, "the posted message created exactly one successor job — not stranded despite the in-flight completion");
});
