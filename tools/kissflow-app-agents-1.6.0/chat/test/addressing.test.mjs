// addressing.test.mjs — several people in one chat: when the builder acts, and when it only listens.
//
// See DESIGN-shared-chat.md. The rules being pinned:
//   • a lone user never has to @-mention anything (the single-user path must not gain ceremony)
//   • two people talking to each other do not trigger a build, and every word still reaches the builder
//   • an addressed message during a build is QUEUED VISIBLY and served the moment the turn ends
//   • two people who both address the builder while it is busy get ONE turn with both instructions
import "./_env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, handleChat, __test } from "../app.mjs";

const mkReq = (method, url) => ({ method, url, headers: { host: "localhost" }, on() {} });
function mkRes() {
  const r = { status: 0, body: "", chunks: [] };
  r.writeHead = (c) => { r.status = c; return r; };
  r.write = (c) => { r.chunks.push(String(c)); return true; };
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}

/**
 * A stand-in for the builder. conductorFor() returns s.conductor when one is already set, so planting
 * this means a turn is fully exercised — prompt construction, consumption, busy — without spawning a
 * process or writing to the stdin of one that has already exited.
 */
function plant(s) {
  const sent = [];
  s.conductor = { send: (p) => sent.push(p), stop() {}, on() {} };
  return sent;
}

async function room() {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const mk = async (email, name) => ({ ...(await db.upsertUser({ email, name })), role: "developer" });
  const alice = await mk("alice@acme.com", "Alice");
  const res = mkRes();
  await handleChat(mkReq("POST", "/api/sessions"), res, alice, { slug: `room-${Math.random().toString(36).slice(2, 8)}` });
  const s = __test.sessions.get(JSON.parse(res.body).session.id);
  const bob = await mk("bob@acme.com", "Bob");
  await db.addMember(s.projectId, bob.sub, "member");
  return { db, s, alice, bob, post: async (me, text, extra = {}) => {
    const r = mkRes();
    await handleChat(mkReq("POST", `/api/sessions/${s.id}/message`), r, me, { text, ...extra });
    return JSON.parse(r.body);
  } };
}

test("a lone user never has to mention anything", async () => {
  const { s, alice, post } = await room();
  plant(s);
  const r = await post(alice, "add a vendor page");
  assert.equal(r.invoked, true);
  assert.equal(r.reason, "sole-speaker");
});

test("two people thinking out loud do not trigger a build", async () => {
  const { s, alice, bob, post } = await room();
  plant(s);
  await post(alice, "approvals as a matrix, or branch conditions?");
  s.busy = false;                                    // the first message did invoke; reset to test rung 3
  const r = await post(bob, "matrix — finance wants to edit thresholds without a dev");
  assert.equal(r.invoked, false);
  assert.equal(r.reason, "side-conversation");
  const r2 = await post(alice, "agreed, matrix then");
  assert.equal(r2.invoked, false, "and it stays out of it while they go back and forth");
});

test("a mention cuts through a side conversation", async () => {
  const { s, alice, bob, post } = await room();
  plant(s);
  await post(alice, "matrix or branch conditions?");
  s.busy = false;
  await post(bob, "matrix, definitely");
  s.busy = false;
  const r = await post(alice, "@builder add the approval matrix");
  assert.equal(r.invoked, true);
  assert.equal(r.reason, "mention");
});

test("what it overheard travels with the next turn, attributed", async () => {
  const { s, alice, bob, post } = await room();
  const sent = plant(s);
  await post(alice, "kick off");            // consumes the opener
  s.busy = false;
  await post(bob, "should approvals be a matrix?");         // side conversation…
  await post(alice, "matrix, finance asked for it");        // …still listening
  s.busy = false;
  await post(bob, "@builder add the approval matrix");

  const prompt = sent[sent.length - 1];
  assert.match(prompt, /SINCE YOUR LAST TURN/);
  assert.match(prompt, /Bob: should approvals be a matrix\?/);
  assert.match(prompt, /Alice: matrix, finance asked for it/);
  assert.match(prompt, /NOW, Bob asks you:/);
  assert.equal(s.messages.filter((m) => m.role === "user" && !m.consumedBy).length, 0, "and nothing is left behind");
});

test("an addressed message during a build is queued, visibly", async () => {
  const { s, alice, bob, post } = await room();
  plant(s);
  await post(alice, "@builder build the buyer page");
  assert.equal(s.busy, true);

  const r = await post(bob, "@builder also add a supplier scorecard");
  assert.equal(r.invoked, false);
  assert.equal(r.queued, true, "queued, not swallowed");
  assert.ok(s.messages.some((m) => m.text.includes("scorecard") && !m.consumedBy), "and still pending");
});

test("two people who both address it while busy get ONE turn with both asks", async () => {
  const { s, alice, bob, post } = await room();
  const sent = plant(s);
  await post(alice, "@builder start the buyer page");   // this one invokes
  await post(bob, "@builder also a supplier scorecard");  // queued
  await post(alice, "@builder and a receiving desk");     // queued

  s.busy = false;             // the running turn finishes…
  __test.drainQueue(s);       // …and the queue is picked up (fire-and-forget, as turn-end does)
  // The drain now goes through the build queue — enqueue, claim, start — so it lands a few ticks
  // later than a direct call did. Wait for the OUTCOME rather than guessing at a number of ticks.
  for (let i = 0; i < 200 && sent.length < 2; i++) await new Promise((r) => setTimeout(r, 5));

  const prompt = sent[sent.length - 1];
  assert.match(prompt, /handle both/);
  assert.match(prompt, /Bob: @builder also a supplier scorecard/);
  assert.match(prompt, /Alice: @builder and a receiving desk/);
  assert.equal(sent.length, 2, "two turns total, not three — the queue drained into one");
});

test("the composer's own mode beats every rule", async () => {
  const { s, alice, post } = await room();
  plant(s);
  const quiet = await post(alice, "@builder ignore this for now", { addressed: false });
  assert.equal(quiet.invoked, false, "comment mode wins even over an explicit mention");
  assert.equal(quiet.reason, "comment");

  s.busy = false;
  const loud = await post(alice, "just thinking aloud", { addressed: true });
  assert.equal(loud.invoked, true);
  assert.equal(loud.reason, "composer");
});

test("a mention needs to be a mention", () => {
  const s = { messages: [] };
  const me = { sub: "u1" };
  assert.equal(__test.decideInvoke(s, "@builder go", me).reason, "mention");
  assert.equal(__test.decideInvoke(s, "ask @ai to do it", me).reason, "mention");
  assert.equal(__test.decideInvoke(s, "email bob@builder.com", me).reason, "sole-speaker", "an address is not a mention");
});
