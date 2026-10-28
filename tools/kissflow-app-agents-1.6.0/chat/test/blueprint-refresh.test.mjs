// blueprint-refresh.test.mjs — a refreshed blueprint has to reach STORAGE, not just this container.
//
// review.html is a cache of a render: derived from the IR, stamped with the identity of the renderer
// that produced it, and re-rendered on read when that stamp goes stale. The re-render wrote to
// runs/<slug>/, which in production is the container's local disk and is wiped by every redeploy.
// So the refresh was never durable: each container re-derived the same page from the same IR
// forever, and everything that reads the bucket directly — a shared link, the version list — kept
// serving the old bytes beside a pane showing the new ones.
import "./_env.mjs"; // stubs the builder binary + points runs/ at a temp dir — must precede src imports
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, handleChat } from "../app.mjs";
import { rendererId, stampOf } from "../../engine/refresh.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = process.env.KF_RUNS_DIR;

const mkReq = (method, url) => ({ method, url, headers: { host: "localhost" }, on() {} });
function mkRes() {
  const r = { status: 0, headers: null, body: "", chunks: [] };
  r.writeHead = (code, headers) => { r.status = code; r.headers = headers; return r; };
  r.write = (c) => { r.chunks.push(c); return true; };
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}

// the smallest IR that renders a real review page
const IR = {
  app: { name: "Refresh Test", id: "Refresh_Test_A00" },
  roles: [{ id: "r", name: "Requester" }],
  forms: [{ id: "f1", name: "Request", flowType: "Form", fields: [{ id: "title", name: "Title", type: "Text", required: true }] }],
  permissions: [{ role: "Requester", model: "f1", level: "Editable", scope: "all" }],
};

test("a re-rendered blueprint is published back to live/, not just left on this container's disk", async () => {
  const published = [];
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db, publishLive: async (projectId, files) => { published.push({ projectId, files }); } });

  const user = await db.upsertUser({ email: "alice@acme.com", name: "Alice" });
  const me = { ...user, role: "developer" };
  const created = await handleChat(mkReq("POST", "/api/sessions"), mkRes(), me, { slug: "refresh-app", name: "Refresh App" })
    .then(() => null)
    .catch(() => null);
  // read the session back the way the other route tests do
  const listRes = mkRes();
  await handleChat(mkReq("GET", "/api/sessions"), listRes, me, {});
  const list = JSON.parse(listRes.body);
  const s = (list.sessions || []).find((x) => x.slug === "refresh-app") || (list.sessions || [])[0];
  assert.ok(s, "the session was created");

  // a run whose review page was rendered by an OLDER renderer, with the IR still beside it
  const dir = join(RUNS, s.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "app-spec.json"), JSON.stringify(IR));
  const rendered = spawnSync(process.execPath, [join(HERE, "..", "..", "engine", "review.mjs"), join(dir, "app-spec.json")],
    { encoding: "utf8", maxBuffer: 64e6 });
  assert.equal(rendered.status, 0, rendered.stderr);
  const stale = rendered.stdout.replace(stampOf(rendered.stdout), "0000deadbeef");
  writeFileSync(join(dir, "review.html"), stale);

  const res = mkRes();
  await handleChat(mkReq("GET", `/blueprint/${s.id}`), res, me, {});
  await new Promise((r) => setImmediate(r));   // the publish is fire-and-forget; let it settle

  const onDisk = readFileSync(join(dir, "review.html"), "utf8");
  assert.equal(stampOf(onDisk), rendererId(), "the local copy was re-rendered");
  assert.equal(published.length, 1, "…and the result was published to storage exactly once");
  assert.equal(stampOf(String(published[0].files.review)), rendererId(), "the PUBLISHED bytes are the fresh ones");
  assert.deepEqual(Object.keys(published[0].files), ["review"], "only live/review.html — never a registered version");

  // Serving it again must NOT re-publish: the page is current, so there is nothing to write.
  published.length = 0;
  await handleChat(mkReq("GET", `/blueprint/${s.id}`), mkRes(), me, {});
  await new Promise((r) => setImmediate(r));
  assert.equal(published.length, 0, "a page already on the current renderer is neither re-rendered nor re-published");
  void created;
});

test("a blueprint that cannot be re-rendered is served as-is and never published", async () => {
  const published = [];
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db, publishLive: async (projectId, files) => { published.push({ projectId, files }); } });

  const user = await db.upsertUser({ email: "bob@acme.com", name: "Bob" });
  const me = { ...user, role: "developer" };
  await handleChat(mkReq("POST", "/api/sessions"), mkRes(), me, { slug: "no-ir-app", name: "No IR App" }).catch(() => null);
  const listRes = mkRes();
  await handleChat(mkReq("GET", "/api/sessions"), listRes, me, {});
  const s = (JSON.parse(listRes.body).sessions || []).find((x) => x.slug === "no-ir-app");
  assert.ok(s);

  // a page from an older renderer with NO app-spec.json beside it — the pre-bundle case
  const dir = join(RUNS, s.slug);
  mkdirSync(dir, { recursive: true });
  const body = '<!doctype html><meta name="kf-renderer" content="0000deadbeef"><title>old</title><body>old page</body>';
  writeFileSync(join(dir, "review.html"), body);

  await handleChat(mkReq("GET", `/blueprint/${s.id}`), mkRes(), me, {});
  await new Promise((r) => setImmediate(r));

  assert.equal(readFileSync(join(dir, "review.html"), "utf8"), body, "the bytes it had are the bytes it keeps");
  assert.equal(published.length, 0, "nothing is published when nothing was re-rendered");
});
