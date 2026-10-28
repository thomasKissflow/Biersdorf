// stream-prototype.test.mjs — the preview pane fills AS the prototype is built, not at the end.
//
// A prototype is a shell (chrome, nav, role switcher — seconds) plus one part per role (minutes,
// concurrent). Assembling only at the end leaves the pane empty for the whole build, which is most
// of what someone waiting actually experiences. The assembler has always supported `--partial` and
// CONDUCTOR.md has always told the builder to use it early — but an instruction is not a mechanism,
// and the watcher that would have noticed index.html appearing could not start until the conductor
// had already announced the file. So the host assembles too, whenever a part lands.
import "./_env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeDb } from "../../../../control-plane/src/db.mjs";
import { initChat, handleChat } from "../app.mjs";

// A REAL v4-contract shell (browser CDN + <style type=text/tailwindcss> + tailwindcss/* imports), so the
// streaming path actually exercises the server-side compile — the review's finding #7: the old shell had
// no Tailwind head, so the tests passed without ever compiling CSS or checking the published shape.
const V4_SHELL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "engine", "test", "fixtures", "v4-shell.html"), "utf8");
const NO_RAW_TAILWIND = (html) => !/tailwindcss\/browser@/.test(html) && !/type=["']text\/tailwindcss["']/.test(html) && !/@import\s+["']tailwindcss/.test(html);

const RUNS = process.env.KF_RUNS_DIR;
// The SSE route holds the connection open and only tears down its heartbeat on req 'close' — a
// no-op `on()` would leave the interval running and the test process would never exit.
const mkReq = (method, url) => {
  const handlers = {};
  return { method, url, headers: { host: "localhost" },
    on(ev, fn) { handlers[ev] = fn; },
    close() { handlers.close?.(); } };
};
function mkRes() {
  const r = { status: 0, body: "", chunks: [] };
  r.writeHead = (c) => { r.status = c; return r; };
  r.write = (c) => { r.chunks.push(c); return true; };
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}

// The shell IS the real v4 contract now — every streamed publication below must come out COMPILED.
const SHELL = V4_SHELL;

const waitFor = async (fn, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 60)); }
  return null;
};

test("the shell reaches the pane before any role part exists, then each part fills in", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const user = await db.upsertUser({ email: "stream@acme.com", name: "S" });
  const me = { ...user, role: "developer" };

  await handleChat(mkReq("POST", "/api/sessions"), mkRes(), me, { slug: "stream-app", name: "Stream App" }).catch(() => null);
  const listRes = mkRes();
  await handleChat(mkReq("GET", "/api/sessions"), listRes, me, {});
  const s = (JSON.parse(listRes.body).sessions || []).find((x) => x.slug === "stream-app");
  assert.ok(s, "session created");

  // a viewer opens the chat: the SSE stream is what starts the watchers, exactly as the UI does
  const streamReq = mkReq("GET", `/api/sessions/${s.id}/stream`);
  try {
  handleChat(streamReq, mkRes(), me, {});
  await new Promise((r) => setTimeout(r, 100));

  const pdir = join(RUNS, s.slug, "prototype", "parts");
  const idx = join(RUNS, s.slug, "prototype", "index.html");
  mkdirSync(pdir, { recursive: true });

  // 1. THE SHELL ALONE — this is the moment that used to show nothing
  writeFileSync(join(pdir, "shell.html"), SHELL);
  const appeared = await waitFor(() => existsSync(idx));
  assert.ok(appeared, "index.html exists as soon as the shell does — no role part needed");
  let html = readFileSync(idx, "utf8");
  assert.match(html, /Vendor Ops/, "the chrome is on screen");
  assert.match(html, /Generating buyer…/, "…and the roles still being written say so");
  assert.match(html, /Generating approver…/);
  // THE POSTCONDITION (#7): the STREAMED shell is already compiled — no raw Tailwind runtime reaches the
  // pane. This is what a preview host needs and what the old head-less shell never proved.
  assert.ok(NO_RAW_TAILWIND(html), "the streamed shell carries compiled CSS, not the raw Tailwind head");

  // 2. a role lands → it replaces its placeholder, the other one stays pending
  writeFileSync(join(pdir, "role-buyer.html"), `<section id="buyer">Buyer dashboard</section>`);
  const filled = await waitFor(() => {
    const h = existsSync(idx) ? readFileSync(idx, "utf8") : "";
    return h.includes("Buyer dashboard") ? h : null;
  });
  assert.ok(filled, "the buyer part reached the pane while approver was still being written");
  assert.match(filled, /Generating approver…/, "the unfinished role is still marked pending");

  // 3. the last role lands → no placeholders left
  writeFileSync(join(pdir, "role-approver.html"), `<section id="approver">Approver queue</section>`);
  const complete = await waitFor(() => {
    const h = existsSync(idx) ? readFileSync(idx, "utf8") : "";
    return h.includes("Approver queue") && !/kf-pending/.test(h) ? h : null;
  });
  assert.ok(complete, "every part landed and nothing is pending");
  assert.match(complete, /Buyer dashboard/);
  assert.ok(NO_RAW_TAILWIND(complete), "the fully-assembled streamed page is compiled too — every splice stays compiled");
  } finally { streamReq.close(); }   // #4: a failed assertion must not leave the SSE heartbeat/session open
});

test("#4 the shell streams via the POLLING fallback when fs.watch is unavailable (EMFILE)", async () => {
  // Force the watch-unavailable path: no fs.watch, only the bounded polling fallback. It must still put
  // the shell on the pane even though the build starts AFTER the viewer opened the chat (the case that
  // used to fail because the fallback keyed on s.busy and self-cleared while idle).
  const prev = process.env.KF_FORCE_STREAM_POLL;
  process.env.KF_FORCE_STREAM_POLL = "1";
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const me = { ...(await db.upsertUser({ email: "poll@acme.com", name: "P" })), role: "developer" };
  await handleChat(mkReq("POST", "/api/sessions"), mkRes(), me, { slug: "poll-app", name: "Poll App" }).catch(() => null);
  const listRes = mkRes();
  await handleChat(mkReq("GET", "/api/sessions"), listRes, me, {});
  const s = (JSON.parse(listRes.body).sessions || []).find((x) => x.slug === "poll-app");
  const streamReq = mkReq("GET", `/api/sessions/${s.id}/stream`);
  try {
    handleChat(streamReq, mkRes(), me, {});         // opens the SSE → starts the POLL fallback (forced)
    await new Promise((r) => setTimeout(r, 100));
    const pdir = join(RUNS, s.slug, "prototype", "parts");
    const idx = join(RUNS, s.slug, "prototype", "index.html");
    mkdirSync(pdir, { recursive: true });
    // the build begins AFTER the chat was opened — the poll (alive while a viewer is attached) must catch it
    await new Promise((r) => setTimeout(r, 1200));
    writeFileSync(join(pdir, "shell.html"), SHELL);
    const appeared = await waitFor(() => existsSync(idx), 6000);
    assert.ok(appeared, "the polling fallback assembled the shell even though it landed a build after chat-open");
    assert.ok(NO_RAW_TAILWIND(readFileSync(idx, "utf8")), "the polled shell is compiled too");
  } finally { streamReq.close(); if (prev === undefined) delete process.env.KF_FORCE_STREAM_POLL; else process.env.KF_FORCE_STREAM_POLL = prev; }
});

test("a finished prototype is never downgraded back to placeholders", async () => {
  const db = makeDb({ db: { backend: "memory" } });
  await initChat({ db });
  const user = await db.upsertUser({ email: "stream2@acme.com", name: "S2" });
  const me = { ...user, role: "developer" };
  await handleChat(mkReq("POST", "/api/sessions"), mkRes(), me, { slug: "final-app", name: "Final App" }).catch(() => null);
  const listRes = mkRes();
  await handleChat(mkReq("GET", "/api/sessions"), listRes, me, {});
  const s = (JSON.parse(listRes.body).sessions || []).find((x) => x.slug === "final-app");
  const streamReq = mkReq("GET", `/api/sessions/${s.id}/stream`);
  try {
  handleChat(streamReq, mkRes(), me, {});
  await new Promise((r) => setTimeout(r, 100));

  const pdir = join(RUNS, s.slug, "prototype", "parts");
  const idx = join(RUNS, s.slug, "prototype", "index.html");
  mkdirSync(pdir, { recursive: true });

  // the conductor's FINAL assemble: complete, no placeholders, and richer than a re-splice
  const FINAL = `<!doctype html><html><body><nav id="rail">Vendor Ops</nav>
<section id="buyer">Buyer dashboard</section><section id="approver">Approver queue</section>
<script>var SEED={};</script></body></html>`;
  writeFileSync(idx, FINAL);
  // …and then a stale part write lands afterwards, with one role's file still absent
  writeFileSync(join(pdir, "shell.html"), SHELL);
  writeFileSync(join(pdir, "role-buyer.html"), `<section id="buyer">Buyer dashboard</section>`);
  await new Promise((r) => setTimeout(r, 900));

  const after = readFileSync(idx, "utf8");
  assert.equal(after, FINAL, "the completed page was left exactly as it was");
  assert.doesNotMatch(after, /Generating approver…/, "no placeholder was reintroduced");
  } finally { streamReq.close(); }   // #4: cleanup in finally so a failed assertion can't hang the runner
});
