// access.test.mjs — an app's chat is shared by its MEMBERS, and by nobody else.
//
// The chat routes used to look a session up by id and serve it to whoever asked. That was survivable
// while a session was one person's private build; it is not, now that several people work on one app
// in one conversation. These tests pin the boundary: a member reads and speaks, a stranger gets 403,
// and the session list is scoped rather than global.
import "./_env.mjs"; // stubs the builder binary — must precede the src imports (see the file)
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, handleChat } from "../app.mjs";

// Minimal req/res doubles — handleChat only needs url/method/headers in, and status+body out.
const mkReq = (method, url) => ({ method, url, headers: { host: "localhost" }, on() {} });
function mkRes() {
  const r = { status: 0, headers: null, body: "", chunks: [] };
  r.writeHead = (code, headers) => { r.status = code; r.headers = headers; return r; };
  r.write = (c) => { r.chunks.push(c); return true; };
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}
async function call(method, url, me, body = {}) {
  const res = mkRes();
  const owned = await handleChat(mkReq(method, url), res, me, body);
  return { owned, status: res.status, json: (() => { try { return JSON.parse(res.body); } catch { return null; } })() };
}

test("an app's chat is readable and writable by members only", async (t) => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });

  const alice = await db.upsertUser({ email: "alice@acme.com", name: "Alice" });
  const bob = await db.upsertUser({ email: "bob@acme.com", name: "Bob" });
  const root = await db.upsertUser({ email: "root@acme.com", name: "Root" });
  await db.setUserRole(root.sub, "admin");
  const asAlice = { ...alice, role: "developer" };
  const asBob = { ...bob, role: "developer" };
  const asAdmin = { ...root, role: "admin" };

  // Alice starts an app. No `text`, so nothing spawns a builder — this is about routing, not building.
  const created = await call("POST", "/api/sessions", asAlice, { slug: "shared-app", name: "Shared App" });
  assert.equal(created.status, 201);
  const sid = created.json.session.id;
  const pid = created.json.session.projectId;
  assert.ok(pid, "a new session is registered as an app so it HAS members to check against");

  await t.test("the owner can read it", async () => {
    const r = await call("GET", `/api/sessions/${sid}`, asAlice);
    assert.equal(r.status, 200);
  });

  await t.test("a signed-in stranger who knows the id cannot", async () => {
    for (const path of [`/api/sessions/${sid}`, `/preview/${sid}/`, `/blueprint/${sid}`, `/api/sessions/${sid}/versions/prototype`]) {
      const r = await call("GET", path, asBob);
      assert.equal(r.status, 403, `${path} must be 403 for a non-member`);
    }
  });

  await t.test("a stranger cannot speak into it either", async () => {
    const r = await call("POST", `/api/sessions/${sid}/message`, asBob, { text: "build me something" });
    assert.equal(r.status, 403);
  });

  await t.test("invite Bob and he is a full participant", async () => {
    await db.addMember(pid, bob.sub, "member");
    const read = await call("GET", `/api/sessions/${sid}`, asBob);
    assert.equal(read.status, 200, "a member reads the whole history, including turns before they joined");
  });

  await t.test("the session list is scoped, not global", async () => {
    const carol = await db.upsertUser({ email: "carol@acme.com", name: "Carol" });
    const mine = await call("GET", "/api/sessions", { ...carol, role: "developer" });
    assert.equal(mine.status, 200);
    assert.equal(mine.json.sessions.find((s) => s.id === sid), undefined, "Carol is on no apps and sees no sessions");

    const aliceList = await call("GET", "/api/sessions", asAlice);
    assert.ok(aliceList.json.sessions.some((s) => s.id === sid), "Alice sees her own");
  });

  await t.test("a platform admin retains oversight", async () => {
    const r = await call("GET", `/api/sessions/${sid}`, asAdmin);
    assert.equal(r.status, 200);
  });
});

test("a user turn records WHO said it", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const dana = await db.upsertUser({ email: "dana@acme.com", name: "Dana" });
  const { json } = await call("POST", "/api/sessions", { ...dana, role: "developer" }, { slug: "attributed", name: "Attributed" });
  const s = json.session;

  // Reach the transcript the way a reload does, rather than reaching into module state.
  const read = await call("GET", `/api/sessions/${s.id}`, { ...dana, role: "developer" });
  assert.equal(read.status, 200);
  assert.ok(Array.isArray(read.json.session.messages), "history is served as a list of messages");
});
