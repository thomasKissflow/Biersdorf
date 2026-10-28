// add-existing.test.mjs — the "Add existing" picker: apps already living in the user's dev Kissflow
// account, listed through the host hook so one can be adopted into AI Builder.
//
// The hook shape is pinned here because the UI renders whatever comes back verbatim: {apps, env} on
// success, {error, apps: []} when the environment can't answer — never a throw surfacing as a blank
// modal. Auth is the other pin: the list is the user's own account, so an anonymous request gets 401,
// not an empty list that reads as "you have no apps".
import "./_env.mjs"; // stubs the builder binary — must precede the src imports
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, handleChat } from "../app.mjs";

const mkReq = (method, url) => ({ method, url, headers: { host: "localhost" }, on() {} });
function mkRes() {
  const r = { status: 0, body: "" };
  r.writeHead = (code) => { r.status = code; return r; };
  r.write = () => true;
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}
async function get(url, me) {
  const res = mkRes();
  await handleChat(mkReq("GET", url), res, me);
  return { status: res.status, json: (() => { try { return JSON.parse(res.body); } catch { return null; } })() };
}

test("GET /api/kissflow-apps returns the hook's list for a signed-in user", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  const calls = [];
  await initChat({ db, listKissflowApps: async (sub) => {
    calls.push(sub);
    return { env: "dev-lcncdemo", apps: [{ id: "App1", name: "Vendor Portal" }, { id: "App2", name: "CapEx" }] };
  } });
  const me = { sub: "u1", known: true, role: "sales" };
  const r = await get("/api/kissflow-apps", me);
  assert.equal(r.status, 200);
  assert.deepEqual(calls, ["u1"]); // the hook sees the CALLER, not a global default
  assert.equal(r.json.apps.length, 2);
  assert.equal(r.json.apps[0].name, "Vendor Portal");
  assert.equal(r.json.env, "dev-lcncdemo");
});

test("anonymous request is refused, not answered with an empty list", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db, listKissflowApps: async () => ({ apps: [{ id: "x", name: "y" }] }) });
  const r = await get("/api/kissflow-apps", null);
  assert.equal(r.status, 401);
});

test("a hook that throws surfaces as a 502 with a message, never a crash", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db, listKissflowApps: async () => { throw new Error("boom"); } });
  const r = await get("/api/kissflow-apps", { sub: "u1", known: true });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /boom/);
  assert.deepEqual(r.json.apps, []);
});
