// generated-html-isolation.test.mjs — the prototype/blueprint HTML is agent-generated and served from
// the authenticated origin, so it must carry headers that stop it exfiltrating (#5). Full isolation is
// a separate origin (infra); on this origin the session cookie is HttpOnly and these headers bound the
// blast radius: no connect-src, no form-action — generated JS can render but cannot phone home.
import "./_env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, handleChat } from "../app.mjs";

const RUNS = process.env.KF_RUNS_DIR;
const mkReq = (method, url) => ({ method, url, headers: { host: "localhost" }, on() {} });
function mkRes() {
  const r = { status: 0, headers: {}, body: "" };
  r.writeHead = (c, h) => { r.status = c; if (h) for (const k of Object.keys(h)) r.headers[k.toLowerCase()] = h[k]; return r; };
  r.write = () => true;
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}
async function call(method, url, me, body) {
  const res = mkRes();
  await handleChat(mkReq(method, url), res, me, body || {});
  return res;
}

function assertIsolated(res, where) {
  const csp = res.headers["content-security-policy"] || "";
  assert.match(csp, /connect-src 'none'/, `${where}: connect-src 'none' blocks exfiltration`);
  assert.match(csp, /form-action 'none'/, `${where}: form-action 'none' blocks form-based exfil`);
  assert.match(csp, /frame-ancestors 'self'/, `${where}: only our app may frame it`);
  assert.equal(res.headers["x-content-type-options"], "nosniff", `${where}: nosniff`);
}

test("#5 the prototype preview is served with the isolation headers", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { sub: (await db.upsertUser({ email: "u@kissflow.com" })).sub, role: "sales" };

  const slug = "iso-app";
  mkdirSync(join(RUNS, slug, "prototype"), { recursive: true });
  writeFileSync(join(RUNS, slug, "prototype", "index.html"), "<html><body><script>1</script></body></html>");

  const adopt = await call("POST", "/api/adopt", me, { slug });
  const sid = JSON.parse(adopt.body).session.id;

  const res = await call("GET", `/preview/${sid}`, me);
  assert.equal(res.status, 200);
  assertIsolated(res, "preview");
});

test("#5 the blueprint page is served with the isolation headers", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { sub: (await db.upsertUser({ email: "u2@kissflow.com" })).sub, role: "sales" };

  const slug = "iso-bp";
  mkdirSync(join(RUNS, slug, "prototype"), { recursive: true });
  writeFileSync(join(RUNS, slug, "prototype", "index.html"), "<html></html>");
  writeFileSync(join(RUNS, slug, "review.html"), "<html><body>blueprint</body></html>");

  const adopt = await call("POST", "/api/adopt", me, { slug });
  const sid = JSON.parse(adopt.body).session.id;

  const res = await call("GET", `/blueprint/${sid}`, me);
  assert.equal(res.status, 200);
  assertIsolated(res, "blueprint");
});
