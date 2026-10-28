// dev-env.test.mjs — an app created in the chat is BUILDABLE from the moment it exists.
//
// It wasn't. A chat app was created with no dev environment linked, and nothing said so: the design
// ran end to end, and only when the builder reached for credentials did it stop — "no dev Kissflow
// environment linked, I can't authenticate anywhere to author this app" — after the whole spec, the
// prototype and the blueprint were already built (VaultOps, 2026-08-02). Worse, the fix was not
// reachable from the chat: linking lives on the project record page.
//
// Two things are pinned here. The link happens at project creation, in linkProject, which is the one
// choke point every client path goes through — so no new caller can reintroduce the gap. And "first
// environment" means the first one that can actually authenticate: an account carries dev and prod
// credentials independently, so a prod-only row is a real row that would hand the builder keys that
// authenticate nothing, which fails later and reads worse than having none.
import "./_env.mjs"; // stubs the builder binary — must precede the src imports
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { firstBuildableDevEnv, buildableDevEnvs } from "../../../../control-plane/src/server.mjs";
import { secrets } from "../../../../control-plane/src/secrets.mjs";
import { initChat, handleChat } from "../app.mjs";

const mkReq = (method, url) => ({ method, url, headers: { host: "localhost" }, on() {} });
function mkRes() {
  const r = { status: 0, body: "" };
  r.writeHead = (code) => { r.status = code; return r; };
  r.write = () => true;
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}
async function newApp(me, body) {
  const res = mkRes();
  await handleChat(mkReq("POST", "/api/sessions"), res, me, body);
  return JSON.parse(res.body).session;
}
async function get(url, me) {
  const res = mkRes();
  await handleChat(mkReq("GET", url), res, me);
  return { status: res.status, json: (() => { try { return JSON.parse(res.body); } catch { return null; } })() };
}
async function post(url, me, body) {
  const res = mkRes();
  await handleChat(mkReq("POST", url), res, me, body);
  return { status: res.status, json: (() => { try { return JSON.parse(res.body); } catch { return null; } })() };
}

// A dev env row plus its stored key pair — the two halves the resolver insists on seeing together.
async function addEnv(db, sub, { name, subdomain, keys = true, prodOnly = false }) {
  const env = await db.createDevEnv({ name, ownerSub: sub, subdomain: prodOnly ? null : subdomain,
    accountId: "Acc1", prodSubdomain: prodOnly ? subdomain : null, prodAccountId: prodOnly ? "Acc1" : null });
  if (keys && !prodOnly) await secrets.put(env.secret_ref, { subdomain, accountId: "Acc1", apiKey: `AK_${name}`, apiSecret: `AS_${name}` });
  if (prodOnly) await secrets.put(env.prod_secret_ref, { subdomain, accountId: "Acc1", apiKey: `AK_${name}`, apiSecret: `AS_${name}` });
  return env;
}

test("a new chat app is linked to a dev environment at creation", async (t) => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db, defaultDevEnvFor: (sub) => firstBuildableDevEnv(db, sub) });
  const alice = await db.upsertUser({ email: "alice@acme.com", name: "Alice" });
  const asAlice = { ...alice, role: "sales" };

  await t.test("with no environments at all, the app is still created", async () => {
    const s = await newApp(asAlice, { slug: "no-env", name: "No Env" });
    assert.ok(s.projectId, "an app with nowhere to build is still perfectly designable");
    assert.ok(!(await db.getProject(s.projectId)).dev_env_id);
  });

  const first = await addEnv(db, alice.sub, { name: "dev-lcncdemo", subdomain: "dev-lcncdemo" });
  await addEnv(db, alice.sub, { name: "second", subdomain: "dev-other" });

  await t.test("the FIRST environment is chosen, without anyone being asked", async () => {
    const s = await newApp(asAlice, { slug: "vaultops", name: "VaultOps" });
    assert.equal((await db.getProject(s.projectId)).dev_env_id, first.id);
  });

  await t.test("an existing app keeps the environment it already has", async () => {
    const s = await newApp(asAlice, { slug: "relink", name: "Relink" });
    const other = await addEnv(db, alice.sub, { name: "picked", subdomain: "dev-picked" });
    await db.setProjectDevEnv(s.projectId, other.id);
    // a second session on the same project must not re-choose over a deliberate link
    const again = await newApp(asAlice, { slug: "relink", name: "Relink", projectId: s.projectId });
    assert.equal(again.projectId, s.projectId);
    assert.equal((await db.getProject(s.projectId)).dev_env_id, other.id);
  });
});

test("'first environment' means the first one that can actually authenticate", async (t) => {
  const db = makeDb({ db: { backend: "memory" } });
  const bob = await db.upsertUser({ email: "bob@acme.com", name: "Bob" });

  await t.test("a prod-only account is skipped for the dev one behind it", async () => {
    await addEnv(db, bob.sub, { name: "prod-acct", subdomain: "acme", prodOnly: true });
    const dev = await addEnv(db, bob.sub, { name: "dev-acct", subdomain: "acme-dev" });
    assert.equal(await firstBuildableDevEnv(db, bob.sub), dev.id,
      "prod keys authenticate nothing on the dev side — linking them fails at the first API call");
  });

  await t.test("a row whose key pair was never stored is not a candidate", async () => {
    const carol = await db.upsertUser({ email: "carol@acme.com", name: "Carol" });
    await addEnv(db, carol.sub, { name: "empty", subdomain: "acme-empty", keys: false });
    assert.equal(await firstBuildableDevEnv(db, carol.sub), null,
      "a configured-looking row with no secret is exactly the case that must NOT be auto-linked");
  });

  await t.test("someone else's environments are never borrowed", async () => {
    const dave = await db.upsertUser({ email: "dave@acme.com", name: "Dave" });
    assert.equal(await firstBuildableDevEnv(db, dave.sub), null);
  });
});

// Generate in Kissflow asks this before it starts a build. Getting `linked: null` back is what turns
// the button into a question instead of a twenty-minute authoring run that fails at its first
// authenticated call, having created nothing and explained nothing.
test("the chat can see where an app builds, and where it could", async (t) => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db, devEnvOptionsFor: (sub) => buildableDevEnvs(db, sub) });   // NO default linker
  const eve = await db.upsertUser({ email: "eve@acme.com", name: "Eve" });
  const mallory = await db.upsertUser({ email: "mallory@acme.com", name: "Mallory" });
  const asEve = { ...eve, role: "sales" };

  const dev = await addEnv(db, eve.sub, { name: "dev-lcncdemo", subdomain: "dev-lcncdemo" });
  await addEnv(db, eve.sub, { name: "prod-only", subdomain: "acme", prodOnly: true });
  const s = await newApp(asEve, { slug: "unlinked", name: "Unlinked" });

  await t.test("an unlinked app reports no environment, and offers the buildable ones", async () => {
    const r = await get(`/api/sessions/${s.id}/dev-env`, asEve);
    assert.equal(r.status, 200);
    assert.equal(r.json.linked, null, "nothing linked — Generate must ask before it builds");
    assert.deepEqual(r.json.options.map((e) => e.id), [dev.id], "only environments that can authenticate are offered");
    assert.ok(r.json.settingsUrl.includes(s.projectId), "and somewhere to go when there are none");
  });

  await t.test("once linked, it reports which account by name", async () => {
    await db.setProjectDevEnv(s.projectId, dev.id);
    const r = await get(`/api/sessions/${s.id}/dev-env`, asEve);
    assert.equal(r.json.linked.id, dev.id);
    assert.equal(r.json.linked.subdomain, "dev-lcncdemo", "the Generate hint names the real account, not a hardcoded one");
  });

  await t.test("a stranger cannot read where someone else's app builds", async () => {
    const r = await get(`/api/sessions/${s.id}/dev-env`, { ...mallory, role: "sales" });
    assert.equal(r.status, 403);
  });

  await t.test("an unknown session is a 404, not an empty answer", async () => {
    const r = await get("/api/sessions/nope/dev-env", asEve);
    assert.equal(r.status, 404);
  });
});

// The bug this whole file exists because of. `credsFor` was wired into podStartTurn ONLY, and
// production runs the INLINE executor — so the project's linked dev environment reached a pod build
// and never an inline one. Every hosted build reported "no KISSFLOW_SUBDOMAIN/ACCOUNT_ID/API_KEY/
// API_SECRET in the environment, and no .kf-env on disk" regardless of what Settings said was linked.
// The link was fine; nothing carried it. Asserted on the turn, because "which executor runs in
// production" is a deploy-time variable and the inline path is the one that had no coverage at all.
test("a turn carries the project's Kissflow credentials to the builder", async (t) => {
  const db = makeDb({ db: { backend: "memory" } });
  const asked = [];
  const CREDS = { KISSFLOW_SUBDOMAIN: "dev-lcncdemo", KISSFLOW_ACCOUNT_ID: "Ac1", KISSFLOW_API_KEY: "AK", KISSFLOW_API_SECRET: "AS", KF_TARGET: "dev" };
  await initChat({ db, credsFor: async (pid) => { asked.push(pid); return CREDS; } });
  const frank = await db.upsertUser({ email: "frank@acme.com", name: "Frank" });
  const asFrank = { ...frank, role: "sales" };

  const s = await newApp(asFrank, { slug: "carries", name: "Carries" });
  await post(`/api/sessions/${s.id}/message`, asFrank, { text: "build it for real in Kissflow now" });

  await t.test("the credentials are resolved for THIS project, on the turn", () => {
    assert.deepEqual(asked, [s.projectId],
      "resolved per turn, so linking or rotating keys takes effect on the next message");
  });

  await t.test("and they reach the builder process, not just the server", async () => {
    const { conductorEnvFor } = await import("../app.mjs");
    const env = conductorEnvFor(s.id);
    assert.equal(env?.KISSFLOW_API_KEY, "AK", "the child process env is the isolated channel — one inline server runs many sessions");
    assert.equal(env?.KISSFLOW_SUBDOMAIN, "dev-lcncdemo");
  });
});

// The App settings icon is gated on the session's projectId, which is set ONCE at creation. If that
// ever failed the field stayed null forever and the icon never appeared for that app, with no way to
// recover (2026-08-03). Repaired on read, by lookup — never by creating a second project.
test("a session that lost its project link gets it back on read", async (t) => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const gina = await db.upsertUser({ email: "gina@acme.com", name: "Gina" });
  const asGina = { ...gina, role: "developer" };

  const s = await newApp(asGina, { slug: "orphaned", name: "Orphaned" });
  const projectId = s.projectId;
  assert.ok(projectId);

  await t.test("a session whose projectId went missing recovers it", async () => {
    const { repairProjectLink } = await import("../app.mjs");
    const orphan = { id: "sess-x", slug: "orphaned", projectId: null };   // the real broken state
    await repairProjectLink(orphan);
    assert.equal(orphan.projectId, projectId, "found by the chat slug it already registered");
  });

  await t.test("a session with no matching project is left alone", async () => {
    const { repairProjectLink } = await import("../app.mjs");
    const stranger = { id: "sess-y", slug: "never-existed", projectId: null };
    await repairProjectLink(stranger);
    assert.equal(stranger.projectId, null, "nothing to find, so nothing invented");
  });

  await t.test("no duplicate project is created to do it", async () => {
    const all = await db.listProjectsForUser(gina.sub);
    assert.equal(all.filter((p) => p.chat_slug === "orphaned").length, 1,
      "repair is a lookup — minting a second project would be worse than the bug");
  });
});

// runs/ dies with the Cloud Run revision, so every deploy erases every in-flight app's working files
// while the transcript survives in Postgres. The builder then opens a session full of history about
// an app whose spec does not exist and reconstructs from the conversation — a rebuild from a summary,
// producing a different app than the one reviewed (vendorflow, 2026-08-03: "the entire
// runs/vendorflow directory doesn't exist on disk"). Storage had the pieces; nothing read them back.
test("a run wiped by a deploy is restored from storage", async (t) => {
  const { existsSync, writeFileSync, mkdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const db = makeDb({ db: { backend: "memory" } });
  // what publishBuild now uploads: the whole run as {relative path → text}
  const bundle = JSON.stringify({
    "app-spec.json": '{"app":{"name":"VendorFlow"}}',
    "decisions.md": "## D1 · something",
    "prototype/index.html": "<html>proto</html>",
  });
  await initChat({ db, fetchArtifact: async (_p, cls) => (cls === "run" ? bundle : null) });
  const hal = await db.upsertUser({ email: "hal@acme.com", name: "Hal" });
  const s = await newApp({ ...hal, role: "developer" }, { slug: "wiped", name: "Wiped" });
  const dir = join(process.env.KF_RUNS_DIR, "wiped");

  await t.test("the whole run comes back, nested paths and all", async () => {
    const { restoreRun } = await import("../app.mjs");
    await restoreRun({ projectId: s.projectId, slug: "wiped" });
    assert.equal(readFileSync(join(dir, "app-spec.json"), "utf8"), '{"app":{"name":"VendorFlow"}}',
      "there is something to author from again");
    assert.ok(existsSync(join(dir, "decisions.md")));
    assert.ok(existsSync(join(dir, "prototype", "index.html")), "directories are recreated, not flattened");
  });

  await t.test("a run already on disk is left completely alone", async () => {
    const { restoreRun } = await import("../app.mjs");
    writeFileSync(join(dir, "app-spec.json"), '{"app":{"name":"newer work"}}');
    await restoreRun({ projectId: s.projectId, slug: "wiped" });
    assert.match(readFileSync(join(dir, "app-spec.json"), "utf8"), /newer work/,
      "the local run is the newer truth — refilling over it would undo the turn that wrote it");
  });

  await t.test("a bundle cannot write outside the run directory", async () => {
    const { restoreRun } = await import("../app.mjs");
    const evil = JSON.stringify({ "../escaped.json": "nope" });
    await initChat({ db, fetchArtifact: async () => evil });
    mkdirSync(join(process.env.KF_RUNS_DIR, "escape"), { recursive: true });
    await restoreRun({ projectId: s.projectId, slug: "escape" });
    assert.ok(!existsSync(join(process.env.KF_RUNS_DIR, "escaped.json")),
      "a stored bundle is data, and data does not get to choose paths");
  });
});

// The artifact panes follow the same rule as the run directory: local disk is a CACHE, storage is
// the copy that lasts. A cache miss falls back to the LIVE object (a build in flight on another
// instance), then the newest registered version — and the hit is WRITTEN BACK so the next request is
// local. An admin who signed in mid-build used to get raw {"error":"nothing built yet"} as the whole
// pane (quayside-yard-control, 2026-08-04).
test("a preview cache miss falls back to storage and repopulates the cache", async (t) => {
  const { existsSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db, fetchLive: async (_p, cls) => (cls === "prototype" ? "<html>LIVE COPY</html>" : null) });
  const ivy = await db.upsertUser({ email: "ivy@acme.com", name: "Ivy" });
  const s = await newApp({ ...ivy, role: "developer" }, { slug: "midbuild", name: "Midbuild" });

  await t.test("the live copy is served and lands back in the cache", async () => {
    await get(`/preview/${s.id}/`, { ...ivy, role: "developer" });
    const f = join(process.env.KF_RUNS_DIR, "midbuild", "prototype", "index.html");
    assert.ok(existsSync(f), "the cache is repopulated, not just read through");
    assert.equal(readFileSync(f, "utf8"), "<html>LIVE COPY</html>");
  });

  await t.test("with nothing in storage either, the pane is a human page, not raw JSON", async () => {
    // initChat keeps a hook when a test omits it (module singletons, by design) — pin BOTH storage
    // hooks to empty, or an earlier test's fetchLive/fetchArtifact answers this request.
    await initChat({ db, fetchLive: async () => null, fetchArtifact: async () => null });
    const jay = await db.upsertUser({ email: "jay@acme.com", name: "Jay" });
    const s2 = await newApp({ ...jay, role: "developer" }, { slug: "blankpane", name: "Blank" });
    const r = await get(`/preview/${s2.id}/`, { ...jay, role: "developer" });
    assert.equal(r.status, 404);
    assert.equal(r.json, null, "an iframe body must be HTML, never a JSON error");
  });
});
