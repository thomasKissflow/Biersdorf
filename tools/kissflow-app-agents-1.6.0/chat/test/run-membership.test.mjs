// run-membership.test.mjs — runs/ is SHARED disk on a hosted instance, so both listing it and adopting
// a run off it must be scoped to the caller's apps (#2/#3). Before this, any signed-in user could list
// every other user's app (name/domain) and adopt any slug — pulling its whole hydrated conversation.
import "./_env.mjs"; // sets KF_RUNS_DIR to a throwaway dir — must precede the src import
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, handleChat } from "../app.mjs";

const RUNS = process.env.KF_RUNS_DIR;
const mkReq = (method, url, body) => ({ method, url, headers: { host: "localhost" }, on() {} });
function mkRes() { const r = { status: 0, body: "" }; r.writeHead = (c) => { r.status = c; return r; }; r.write = () => true; r.end = (b) => { if (b) r.body = String(b); return r; }; return r; }
async function call(method, url, me, body) {
  const res = mkRes();
  await handleChat(mkReq(method, url), res, me, body || {});
  return { status: res.status, json: (() => { try { return JSON.parse(res.body); } catch { return null; } })() };
}
function plantRun(slug) {
  const dir = join(RUNS, slug, "prototype");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), `<html><body>${slug}</body></html>`);
}

test("#2/#3 run listing and adoption are scoped to the caller's membership", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const owner = await db.upsertUser({ email: "owner@kissflow.com" });
  const other = await db.upsertUser({ email: "other@kissflow.com" });
  const admin = await db.upsertUser({ email: "admin@kissflow.com" });
  const meOwner = { sub: owner.sub, role: "sales" };
  const meOther = { sub: other.sub, role: "sales" };
  const meAdmin = { sub: admin.sub, role: "admin" };

  // owner's app, mapped to run "app-a"
  const pa = await db.createProject("Vendor Portal", owner.sub);
  await db.setProjectChatSlug(pa.id, "app-a");
  plantRun("app-a");
  // an orphan run on disk with no project behind it (terminal-built)
  plantRun("app-orphan");

  // ── listing (#2) ──
  const asOwner = await call("GET", "/api/runs", meOwner);
  assert.equal(asOwner.status, 200);
  const ownerSlugs = asOwner.json.runs.map((r) => r.slug);
  assert.ok(ownerSlugs.includes("app-a"), "owner sees their own app");
  assert.ok(!ownerSlugs.includes("app-orphan"), "an unmapped/orphan run is not leaked to a member");

  const asOther = await call("GET", "/api/runs", meOther);
  assert.deepEqual(asOther.json.runs.map((r) => r.slug), [], "a non-member sees no runs at all");

  const asAdmin = await call("GET", "/api/runs", meAdmin);
  const adminSlugs = asAdmin.json.runs.map((r) => r.slug).sort();
  assert.deepEqual(adminSlugs, ["app-a", "app-orphan"], "an admin sees everything");

  // ── adoption (#3) ──
  const otherAdopt = await call("POST", "/api/adopt", meOther, { slug: "app-a" });
  assert.equal(otherAdopt.status, 403, "a non-member cannot adopt someone else's app");

  const ownerAdopt = await call("POST", "/api/adopt", meOwner, { slug: "app-a" });
  assert.ok(ownerAdopt.status === 200 || ownerAdopt.status === 201, "the owner can adopt their own app");

  // an orphan (no owner to protect) is adoptable — the terminal→chat handoff — and adopting claims it
  const orphanAdopt = await call("POST", "/api/adopt", meOther, { slug: "app-orphan" });
  assert.ok(orphanAdopt.status === 200 || orphanAdopt.status === 201, "an unowned run can be claimed");
});

test("#5 a stranger cannot GET another user's session transcript", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const owner = { sub: (await db.upsertUser({ email: "o5@kissflow.com" })).sub, role: "developer" };
  const other = { sub: (await db.upsertUser({ email: "x5@kissflow.com" })).sub, role: "developer" };
  const created = await call("POST", "/api/sessions", owner, { name: "Private" });
  const sid = created.json.session.id;
  assert.equal((await call("GET", `/api/sessions/${sid}`, other)).status, 403, "a stranger is refused the transcript");
  assert.equal((await call("GET", `/api/sessions/${sid}`, owner)).status, 200, "the owner reads their own");
  // the stranger's session list does not include it
  const list = (await call("GET", "/api/sessions", other)).json.sessions.map((x) => x.id);
  assert.ok(!list.includes(sid), "and it is not in a stranger's session list");
});

test("#2 POST /api/sessions rejects a projectId the caller isn't a member of", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const owner = await db.upsertUser({ email: "owner@kissflow.com" });
  const other = await db.upsertUser({ email: "other@kissflow.com" });
  const proj = await db.createProject("Owner's App", owner.sub);   // owner is the only member

  // an attacker who knows the project id tries to bind a new session to it and start a build
  const bad = await call("POST", "/api/sessions", { sub: other.sub, role: "developer" }, { name: "hijack", projectId: proj.id });
  assert.equal(bad.status, 403, "a non-member cannot bind a session to someone else's project");

  // and the owner still can
  const ok = await call("POST", "/api/sessions", { sub: owner.sub, role: "developer" }, { name: "mine", projectId: proj.id });
  assert.equal(ok.status, 201);
});

test("#17 adopt rejects a traversal slug before it can become a project's chat_slug", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { sub: (await db.upsertUser({ email: "u@kissflow.com" })).sub, role: "sales" };
  for (const bad of ["../../etc/passwd", "../secret", "a/b", ".", "..", "with space"]) {
    const r = await call("POST", "/api/adopt", me, { slug: bad });
    assert.equal(r.status, 400, `slug ${JSON.stringify(bad)} must be rejected as invalid`);
  }
});

test("#2 with no DB (single-operator/local) the listing is unchanged", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  plantRun("solo-app");
  // no signed-in user → single operator, nothing to gate
  const r = await call("GET", "/api/runs", null);
  assert.equal(r.status, 200);
  assert.ok(r.json.runs.some((x) => x.slug === "solo-app"), "an anonymous/local operator still sees runs");
});
