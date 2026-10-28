// app.mjs — the AI Builder chat: a requirement goes in as chat, a working UI comes out in the preview
// pane beside it. NOT a server — the control plane mounts it (`initChat` + `handleChat`), so there is
// ONE process, one origin and one login for the whole product. It used to be its own service on
// another port, which is exactly why the two halves showed two different app lists.
//
// Zero dependencies (node:http + SSE, like the rest of the control plane). Each chat session owns:
//   • a run directory  runs/<slug>/            — the artifacts, exactly as the terminal pipeline writes them
//   • a Conductor      driver.mjs              — one long-lived `claude -p` streaming both ways
//   • a live preview   /preview/<id>/index.html — served from that run, hot-reloaded on every write
//
// Loopback-only by design: the conductor runs with permissions bypassed so it can drive node/engine
// scripts without prompts, so the socket must not leave this machine.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync, lstatSync, watch, unlinkSync, rmSync, createReadStream, realpathSync, utimesSync } from "node:fs";
import { join, dirname, resolve, relative, extname, basename, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { Conductor } from "./driver.mjs";
import {
  createSessionCore, slugify, titleFrom, snapshotOf, hydrate,
  appendUser, appendAssistant, appendAgent, closeAssistant, speakerName,
} from "./session-core.mjs";
// drainMemory used both of these with no import at all — a ReferenceError the drain's own catch
// turned into a one-line warning, so v1 never filed a lesson and never said why.
import { readInboxDetailed, clearInbox } from "../engine/memory.mjs";
import { freshenReview } from "../engine/refresh.mjs";
import { readLedger, personaOf, board as progressBoard, mark as progressMark } from "../engine/progress.mjs";
import { assembleRun } from "../engine/proto-assemble.mjs";
import { assemblePrototype, decideTurnMedium, revertUnfinishedMigration, readMigration } from "../engine/proto-react.mjs";
import { parseEnvText } from "../engine/connect.mjs";
import { verify as verifyProto } from "../engine/proto-verify.mjs";
import { preparePrototypeForPublication } from "../engine/proto-publish.mjs";
import { disposePrecompileCache } from "../engine/proto-precompile.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, "..");            // plugins/app-agents
const REPO = resolve(PLUGIN_DIR, "..", "..");      // repo root
// Where builds land. KF_RUNS_DIR moves it: tests use a temp directory rather than scattering sessions
// through the real runs/, and a session pod mounts its workspace instead of writing inside the repo.
const RUNS = process.env.KF_RUNS_DIR ? resolve(process.env.KF_RUNS_DIR) : join(REPO, "runs");
const STORE = join(RUNS, ".chat");

// The session semantics — path resolution, markers, turn bookkeeping — live in session-core so that a
// build running somewhere other than this process gets the SAME behaviour from the same code.
const core = createSessionCore({ repoRoot: REPO, runsDir: RUNS });
const { runDir, partsDir, rolesBuilt, resolveBlueprint, resolvePreview, readAppMeta, findRuntimeUrl,
  versionsDirFor, listVersions, synthesizeAdoptHistory } = core;
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
// Sonnet by default — express builds are meant to be fast, and without this the conductor just
// inherits whatever model the operator's own top-level session happened to be on (Opus, expensive and
// slower, purely by accident of what was ambient). --model / KF_CHAT_MODEL overrides for a session
// that genuinely needs Opus-tier reasoning (a large comprehensive build, a tricky migration).
const MODEL = flag("--model", process.env.KF_CHAT_MODEL || "sonnet");

mkdirSync(STORE, { recursive: true });

// The database, handed in by the control plane at boot. Apps live in Postgres; runs/ on disk is just
// where a build's artifacts land. One list, one source of truth.
let DB = null, mintConnectUrl = () => null, publishVersion = null, fetchApiKey = null, credsFor = null;
// Which dev environment a NEW chat app is built into. Resolved by the host because only it can read
// Secret Manager, and "has a dev environment" means the key pair is actually there — not that a row
// exists. Returns an env id or null.
let defaultDevEnvFor = async () => null;
// Read a published artifact back out of storage. See restoreRun.
let fetchArtifact = async () => null;
// The LIVE copy: overwritten in storage the moment a prototype/blueprint lands, so any instance can
// serve the current build mid-turn. Versions stay the immutable history; live/ is just "now".
let publishLive = async () => {};
let fetchLive = async () => null;
// "Add existing": every application in the user's dev Kissflow account.
let listKissflowApps = async () => ({ error: "not wired", apps: [] });
// Every environment this person could build into — same buildable test, whole list. The chat offers
// it when Generate is pressed with nothing linked.
let devEnvOptionsFor = async () => [];
let artifactUri = (a, cls) => (a || {})[cls] || null;   // replaced by the host's alias-aware resolver
// One object into the bucket, outside the version machinery — see saveTimeline.
let storeBlob = async () => null;
let fetchBlob = async () => null;
export function initChat({ db, connectUrlFor, publishVersion: pv, apiKey, artifactUri: au, credsFor: cf, defaultDevEnvFor: dd, devEnvOptionsFor: dl, fetchArtifact: fa, publishLive: plv, fetchLive: flv, listKissflowApps: lka, storeBlob: sb, fetchBlob: fb }) {
  DB = db;
  if (sb) storeBlob = sb;
  if (fb) fetchBlob = fb;
  if (cf) credsFor = cf;
  if (dd) defaultDevEnvFor = dd;
  if (fa) fetchArtifact = fa;
  if (plv) publishLive = plv;
  if (flv) fetchLive = flv;
  if (lka) listKissflowApps = lka;
  if (dl) devEnvOptionsFor = dl;
  if (au) artifactUri = au;
  if (connectUrlFor) mintConnectUrl = connectUrlFor;
  if (pv) publishVersion = pv;
  if (apiKey) fetchApiKey = apiKey;
  // Re-initialising means a different database: drop the old subscription or this process keeps
  // following a log nobody writes to any more, and never subscribes to the one that matters.
  if (following) { try { following(); } catch {} following = null; }
  return loadSessions().then(startFollowing).then(resumeInterrupted).then(() => {
    const t = setInterval(() => { reapJobs().catch(() => {}); }, REAP_MS);
    t.unref?.();
    return pump();          // pick up anything the previous fleet left behind
  });
}

/**
 * Follow sessions this instance is not driving, so several people on one app can watch one build from
 * different replicas. Two mechanisms, deliberately:
 *
 *   LISTEN/NOTIFY — the fast path, sub-second.
 *   a 2s poll     — the insurance. A dropped notification is INVISIBLE, and the failure it produces is
 *                   the worst one this product has: a chat that silently stops updating mid-build,
 *                   indistinguishable from a hang. One grouped query per tick regardless of how many
 *                   sessions exist, and it does nothing at all when nobody is watching.
 */
let following = null;
async function startFollowing() {
  if (following || !DB?.subscribeChatEvents) return;
  try { following = await DB.subscribeChatEvents((id, seq) => { onRemoteEvents(id, seq).catch(() => {}); }); }
  catch (e) { console.warn(`  chat: could not subscribe to the event log: ${e.message}`); }
  if (!DB.maxChatEventSeqs) return;
  const tick = setInterval(async () => {
    const watched = [...sessions.values()].filter((s) => s.clients.size);
    if (!watched.length) return;
    try {
      const maxes = await DB.maxChatEventSeqs();
      for (const s of watched) if (maxes[s.id] > (s.logSeq ?? 0)) await onRemoteEvents(s.id, maxes[s.id]);
    } catch { /* the next tick tries again */ }
  }, 2000);
  tick.unref?.();   // never hold the process open on this alone
}

/**
 * The builder's credential comes from Secret Manager, read when a build starts rather than from the
 * env var Cloud Run binds at instance start. That is the difference between "rotate the key and it
 * works" and "rotate the key and wait for the next deploy" — and it keeps ONE copy of the truth, so
 * the secret can never drift from what the running process is using.
 */
let keyAt = 0;
async function refreshApiKey() {
  if (!fetchApiKey || Date.now() - keyAt < 60_000) return;
  try {
    const k = await fetchApiKey();
    if (k) { CHILD_ENV.ANTHROPIC_API_KEY = k; keyAt = Date.now(); }
  } catch { /* keep whatever we already have */ }
}

/**
 * Push this turn's prototype and review to durable storage as a registered version. runs/ lives on the
 * container's local disk, so without this every app built in the hosted chat would vanish on the next
 * redeploy — the files would be gone and the app would list as though it had never been built.
 * Best-effort: a storage hiccup must never fail a build the user just watched succeed.
 */
/**
 * PUT THE RUN BACK ON DISK before a turn starts.
 *
 * runs/ is the Cloud Run instance's local disk and dies with the revision, so every deploy erases
 * every in-flight app's working files while the chat transcript — which lives in Postgres — survives
 * intact. The builder then opens a session full of history describing an app whose spec does not
 * exist, and its only recourse is to reconstruct from the conversation: a rebuild from a summary,
 * producing a different app than the one that was reviewed and approved.
 *
 * Storage had the pieces to prevent that and nothing ever read them back; publishBuild now uploads
 * the spec alongside the two rendered pages, and this restores whatever is there. Only ever writes
 * files that are MISSING — a run still on disk is the newer truth and is never overwritten.
 */
// ── the run is CACHE; storage is the copy that lasts ──────────────────────────────────────────────
// runs/<slug> lives on the Cloud Run instance's local disk and dies with the revision, so a deploy
// silently erases the working files of every app being built while the transcript, which is in
// Postgres, survives intact. Treat the directory as a cache: publish the whole run to storage after
// each turn, and refill it from storage whenever it is missing.
//
// A bundle of {relative path → text}, not an archive: a run is ~400KB of JSON, Markdown and HTML, so
// this needs no tar, no binary handling and no new content type, and one fetch restores everything.
// Binary odds and ends (screenshots, zips) are skipped rather than base64-inflated — they are
// regenerable, and the spec is what actually cannot be reconstructed.
const BUNDLE_SKIP_DIR = /^(node_modules|\.git|dist|versions|thumbs|\.proto-build)$/;
// ts/tsx/cjs were missing, which is the quiet way to lose a UI: the generated React app is JSX today,
// so everything looked fine, and the first app written in TypeScript would have had its source
// dropped from the bundle without a word. `dist` stays skipped on purpose — the built output is
// regenerable and minified, and the source is the thing nobody can reconstruct.
const BUNDLE_TEXT = /\.(json|md|html|css|js|jsx|mjs|cjs|ts|tsx|mts|cts|txt|jsonl|svg|ya?ml)$/i;
const BUNDLE_MAX = 2 * 1024 * 1024;   // one absurd file must not cost the whole bundle

function bundleRun(dir) {
  const out = {};
  const walk = (abs, rel) => {
    let entries = [];
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!BUNDLE_SKIP_DIR.test(e.name)) walk(join(abs, e.name), r); continue; }
      if (!BUNDLE_TEXT.test(e.name)) continue;
      try {
        const f = join(abs, e.name);
        if (statSync(f).size > BUNDLE_MAX) continue;
        out[r] = readFileSync(f, "utf8");
      } catch { /* skip what cannot be read */ }
    }
  };
  walk(dir, "");
  return out;
}

// ── the Claude transcript ────────────────────────────────────────────────────────────────────────
//
// `--resume <id>` reads a transcript that the CLI keeps on the LOCAL DISK of whatever machine ran it,
// under ~/.claude/projects/<cwd with / → ->/<id>.jsonl. Cloud Run instances are ephemeral and one
// session is served by many of them (12, measured, for a single 12-hour build), so the file goes
// missing constantly: 18 `resume transcript gone` events in three days. The driver's fallback then
// replays the turn on a FRESH session — re-running the fan-out that turn had already done.
//
// Verified experimentally (2026-08-16) before this was written: delete the file and --resume fails
// with the exact production error; restore that one file and it resumes, recalls the conversation,
// keeps the same session id, and reads its context from cache rather than rewriting it. The .jsonl is
// self-contained — no index, lock or sidecar — and the container's cwd is fixed at /repo, so the
// directory name is identical on every instance and nothing has to be rewritten.
const transcriptDir = () => join(process.env.HOME || "/home/node", ".claude", "projects", REPO.replace(/\//g, "-"));
const transcriptFile = (sid) => join(transcriptDir(), `${sid}.jsonl`);
const transcriptObject = (sid) => `transcripts/${sid}.jsonl.gz`;

/** Push this session's transcript to storage. Fire-and-forget: never let it cost a turn. */
async function saveTranscript(s) {
  const sid = s.claudeSessionId;
  if (!sid || !storeBlob) return;
  let raw;
  try { raw = readFileSync(transcriptFile(sid)); } catch { return; }   // nothing written yet
  if (!raw.length) return;
  try {
    // gzip because these are large and highly repetitive JSONL — measured 1MB to 99MB on a real
    // machine, and ~10x compression is the difference between a cheap upload and a silly one.
    const gz = gzipSync(raw);
    await storeBlob(transcriptObject(sid), gz, "application/gzip");
    if (raw.length > 8 * 1024 * 1024) console.log(`  [${s.slug}] transcript stored ${Math.round(raw.length / 1048576)}MB → ${Math.round(gz.length / 1048576)}MB gz`);
  } catch (e) { console.warn(`  [${s.slug}] transcript not stored: ${e.message}`); }
}

/** Put it back before a resume, if this instance never had it. Returns true when one was restored. */
async function restoreTranscript(s) {
  const sid = s.claudeSessionId;
  if (!sid || !fetchBlob) return false;
  const f = transcriptFile(sid);
  if (existsSync(f)) return false;                    // this instance already has it — never overwrite
  try {
    const gz = await fetchBlob(transcriptObject(sid));
    if (!gz || !gz.length) return false;
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, gunzipSync(Buffer.isBuffer(gz) ? gz : Buffer.from(gz)));
    console.log(`  [${s.slug}] transcript restored from storage — resuming instead of replaying`);
    return true;
  } catch (e) { console.warn(`  [${s.slug}] transcript not restored (${e.message}) — the turn will replay`); return false; }
}

export async function restoreRun(s) {
  if (!s.projectId) return;
  const dir = runDir(s);
  // Restored files come from a PREVIOUS turn, so they must not look freshly built. writeFileSync stamps
  // them with the current mtime, which would let a restored old prototype pass the current-turn freshness
  // check (PROTOTYPE_STALE) — a build that produced nothing could then publish the restored prototype and
  // report success (Codex round-3 #2). Stamp every restored file to a time clearly before this turn began;
  // a genuine current-turn regeneration overwrites it with a fresh mtime.
  const stalePast = new Date((s.turnStartedAt || Date.now()) - 3_600_000);
  const markStale = (f) => { try { utimesSync(f, stalePast, stalePast); } catch { /* mtime is a hint; never fail restore on it */ } };
  // The spec is the test for "is this run really here". A directory holding only uploads/ or a stray
  // log is a cache miss, not a run.
  if (existsSync(join(dir, "app-spec.json"))) return;
  let bundle = null;
  try { const raw = await fetchArtifact(s.projectId, "run"); if (raw) bundle = JSON.parse(raw); } catch { /* fall through */ }
  if (bundle && typeof bundle === "object") {
    let n = 0;
    for (const [rel, body] of Object.entries(bundle)) {
      if (typeof body !== "string" || rel.includes("..")) continue;   // never write outside the run
      try {
        const f = join(dir, rel);
        if (existsSync(f)) continue;                                   // this run's own work outranks storage
        mkdirSync(dirname(f), { recursive: true });
        writeFileSync(f, body);
        markStale(f);                                                  // #2: a restored artifact is not current-turn output
        n++;
      } catch { /* skip what cannot be written */ }
    }
    if (n) console.log(`  [${s.slug}] restored ${n} file(s) from storage`);
    return;
  }
  // Older versions predate the bundle and carry only the individual classes — better than nothing.
  for (const [cls, rel] of [["ir", "app-spec.json"], ["seed", "seed.json"], ["decisions", "decisions.md"], ["review", "review.html"]]) {
    try {
      if (existsSync(join(dir, rel))) continue;
      const body = await fetchArtifact(s.projectId, cls);
      if (body == null) continue;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, rel), body);
      markStale(join(dir, rel));                                       // #2: restored, not current-turn output
    } catch { /* whatever cannot be restored simply is not */ }
  }
}

// Drain the run's memory inbox into the hive. The agent cannot write the pool itself — it is a
// spawned process and must never hold DB credentials — so it leaves rows in the run directory and
// the host, which owns the connection, files them under the app's memory org.
//
// Rows are stored BEFORE the inbox is cleared: a crash in between costs nothing, because the same
// lesson simply drains again next turn and memUpsert dedups by content.
async function drainMemory(s) {
  if (!DB?.memUpsert || !s.projectId) return;
  const file = join(runDir(s), "memory-inbox.jsonl");
  try {
    const { rows, skipped } = readInboxDetailed(file);
    // A hand-written lesson is a LOST lesson, and it used to vanish without a word. Say it.
    if (skipped) console.warn(`  [${s.slug}] memory: ${skipped} inbox line(s) were not JSONL and were DROPPED — a lesson was written by hand instead of \`memory.mjs remember\``);
    if (existsSync(join(runDir(s), "MEMORY-LOCAL.md"))) console.warn(`  [${s.slug}] memory: this run has a MEMORY-LOCAL.md — nothing drains that file; its lessons are not in the hive`);
    if (!rows.length) return;
    const project = await DB.getProject(s.projectId).catch(() => null);
    const org = project?.mem_org;
    if (!org) return;                       // no org to file under — leave the inbox for later
    const { embedText } = await import("../../../control-plane/src/memory.mjs");
    const { curateWrite } = await import("../../../control-plane/src/memory.mjs").catch(() => ({}));
    let stored = 0, held = 0;
    for (const r of rows) {
      // the SAME suspicion check the HTTP path applies: an agent cannot self-promote an
      // impossibility claim, whichever door the lesson came through
      // scope=user needs an OWNER, and the agent cannot know who is asking — the host does. The
      // person attributed is whoever sent the message this turn is answering.
      const lastUser = [...s.messages].reverse().find((m) => m.role === "user" && m.author?.sub);
      let row = { org, scope: r.scope || "app", tier: r.tier || "observed-once", kind: r.kind || "interpretation",
        agent: r.agent || null, app: r.app || null, impossible: !!r.impossible, text: String(r.text),
        user_sub: r.scope === "user" ? (lastUser?.author?.sub || null) : null,
        embedding: embedText(r.text) };
      if (row.scope === "user" && !row.user_sub) continue;   // unattributable: better dropped than shared
      if (curateWrite) row = curateWrite(row, false);
      try { await DB.memUpsert(row); stored++; if (row.quarantined) held++; } catch { /* try again next turn */ }
    }
    clearInbox(file);
    console.log(`  [${s.slug}] memory: ${stored} lesson(s) filed to the hive${held ? ` (${held} held for confirmation)` : ""}`);
  } catch (e) { console.warn(`  [${s.slug}] memory drain: ${e.message}`); }
}


// TOKEN ACCOUNTING. The conductor emits `usage` on every turn-end and nothing has ever read it, so
// the most expensive question about a build — is the 14.4k-token system prompt being CACHED or paid
// for on every turn — has been unanswerable. It is one line of arithmetic once somebody looks.
//
// cache_read_input_tokens are billed at a fraction of fresh input, so the ratio is the whole story:
// high means --resume is keeping the transcript warm, near-zero means every turn re-reads
// CONDUCTOR.md from scratch and the build costs several times what it should.
function recordUsage(s, r, turnId = s.turnId) {
  // SPEND FIRST, and outside the `usage` guard. total_cost_usd and usage are separate fields on the
  // result and either can be absent; accumulating cost inside the token branch meant a turn that
  // reported dollars but no token breakdown contributed nothing at all.
  //
  // The same de-cumulation the platform-wide query uses (db.mjs chatSpendTotal): total_cost_usd is
  // CUMULATIVE for a CLI session, so the turn's own cost is the delta — and a value LOWER than its
  // predecessor marks a fresh child process, where the reading is already the delta.
  const prevSpend = Number(s.spendUsd) || 0;
  // The driver's turn-end result carries the cumulative dollars as `r.cost` (driver.mjs: `cost:
  // ev.total_cost_usd`) — NOT `r.total_cost_usd`. Reading the wrong field made `c` NaN, so spend never
  // accumulated and the ledger never booked. ONE contract: the turn result's cost field is `cost`.
  const c = Number(r && r.cost);
  if (Number.isFinite(c) && c >= 0) {
    const prev = Number(s.spendPrev) || 0;
    s.spendUsd = (Number(s.spendUsd) || 0) + (c >= prev ? c - prev : c);
    s.spendPrev = c;
  }
  const u = r && r.usage;
  const turnUsd = Number(s.spendUsd) - prevSpend;
  // COST IS ADMIN-ONLY. The per-turn dollars are NO LONGER written to the build board — a member
  // watching an app build must not see "$X this round". Cost still lands durably in the chat_spend
  // ledger below (the admin spend grid reads it) and rides the session snapshot's `usage` field, which
  // publicSession now includes ONLY for a platform admin (me.role === "admin"). So the number is not
  // lost — it is just no longer shown inside the app.
  // …and durably, into the cost ledger (chat_spend) — the de-cumulated per-turn dollars, so platform/
  // per-project spend is a plain SUM instead of re-scanning every event. Best-effort: accounting never costs
  // a turn. `.catch` because bookChatCost is async on pg — a sync try/catch can't catch a rejected Promise.
  // #2/#8: the src key is `turn:<turnId>` — the SAME key the backfill derives from the turn-end event's
  // turnId, so a live-booked turn and its backfilled event dedupe (ON CONFLICT) instead of double-counting.
  if (turnUsd > 0 && turnId) { try { Promise.resolve(DB?.bookChatCost?.(s.id, s.projectId, turnUsd, `turn:${turnId}`)).catch(() => {}); } catch { /* ledger is never a dependency */ } }
  if (!u) { try { persist(s); } catch { /* accounting must never cost a turn */ } return; }
  const fresh = u.input_tokens || 0;
  const cached = u.cache_read_input_tokens || 0;
  const written = u.cache_creation_input_tokens || 0;
  const out = u.output_tokens || 0;
  // THE DENOMINATOR IS ALL THREE. input_tokens, cache_read and cache_creation are DISJOINT parts of
  // one request's input, so a ratio over (fresh + cached) alone ignores the writes — and writes are
  // the expensive ones, billing at roughly 12x a read. A turn that re-cached a 2.6M-token context
  // reported "100% hit" under the old denominator while costing more than the ten turns before it.
  const inTot = fresh + cached + written;
  const ratio = inTot > 0 ? Math.round((cached / inTot) * 100) : 0;
  s.usage = { fresh, cached, written, out, ratio, at: Date.now() };
  // SURFACE the cache-read ratio into the timeline (→ GCS), so "is the 14.4k-token system prompt being
  // cached or re-paid every turn" is answerable after the fact, not just held on the session object. A
  // ratio near zero on a --resume session means the cache prefix broke (per-instance drift, a changed
  // prompt) and the build is costing several times what it should — the one number worth watching.
  try { traceRun(s, { step: "usage", ev: "note", ratio, fresh, cached, written, out }); } catch { /* the ledger is a window, never a dependency */ }
  s.usageTotals = {
    fresh: (s.usageTotals?.fresh || 0) + fresh,
    cached: (s.usageTotals?.cached || 0) + cached,
    written: (s.usageTotals?.written || 0) + written,
    out: (s.usageTotals?.out || 0) + out,
    turns: (s.usageTotals?.turns || 0) + 1,
  };
  const t = s.usageTotals;
  const lifeTot = t.fresh + t.cached + t.written;
  const life = lifeTot > 0 ? Math.round((t.cached / lifeTot) * 100) : 0;
  console.log(`  [${s.slug}] tokens: ${fresh} fresh · ${cached} cached · ${written} written (${ratio}% cheap) · ${out} out`
    + ` — session ${t.turns} turn(s), ${life}% cached`
    // Writes outrunning reads means the cache is being REBUILT, not reused — the 5-minute TTL expiring
    // between turns, or a conductor restart starting cold. It is the costliest shape a session takes
    // and the one that reads as healthy under a fresh/cached-only ratio.
    + (t.written > t.cached && t.turns > 1 ? "  ⚠ re-caching: more context WRITTEN than read — cache expiring between turns" : "")
    + (life < 40 && t.turns > 2 ? "  ⚠ low cache hit: the system prompt is being re-read" : ""));
  try { persist(s); } catch { /* accounting must never cost a turn */ }
}

async function publishBuild(s) {
  // `unavailable` distinguishes an INTENTIONAL local/dev run (no version publisher wired, e.g. `node
  // app.mjs` or a test) from a real hosted publication FAILURE. The turn-end must not report the former
  // as a failed build (#2).
  if (!publishVersion || !s.projectId) return { ok: false, unavailable: true, reason: "no publisher (local/dev)" };
  const files = {};
  const proto = resolvePreview(s);
  // FAIL CLOSED on a required read (#4). A prototype path that resolves but cannot be read must fail the
  // publish, not be silently dropped — otherwise it never reaches `files`, and the completeness check
  // (which validates the returned version against the classes actually IN `files`) would pass a partial
  // version that is missing the very artifact this build was for.
  if (proto) {
    try { files.prototype = readFileSync(proto); }
    catch (e) { console.warn(`  [${s.slug}] NOT publishing — prototype unreadable at publish time: ${e.message}`); return { ok: false, reason: `prototype unreadable at publish (${e.message})` }; }
  }
  // A build that EXPECTED a prototype must actually have one to publish. If checkPrototype passed but the
  // file vanished between verification and here (a TOCTOU on the shared run dir), fail rather than mint a
  // prototype-less version.
  if (s.prototypeExpected && !files.prototype) {
    console.warn(`  [${s.slug}] NOT publishing — a prototype was expected but none is available at publish time`);
    return { ok: false, reason: "prototype expected but unavailable at publish" };
  }
  // GATE THE PROTOTYPE THROUGH THE ONE BOUNDARY before minting an immutable version (#2/#4). A raw
  // (uncompiled Tailwind) or verifier-failing prototype must NOT become a version — keep the last good
  // one. On success we publish the COMPILED bytes, not whatever happened to be on disk.
  if (files.prototype) {
    const prep = await preparePrototypeForPublication(files.prototype.toString("utf8"), { phase: "final", label: runDir(s) });
    if (!prep.ok) {
      console.warn(`  [${s.slug}] NOT publishing a version — prototype not publishable: ${prep.reason}`);
      emit(s, "agent", { name: "Verify", text: `No version published — the prototype isn't ready: ${prep.reason}` });
      return { ok: false, reason: prep.reason, findings: prep.findings };
    }
    files.prototype = Buffer.from(prep.html, "utf8");
  }
  const bp = resolveBlueprint(s);
  // A blueprint path that resolves but cannot be read is a required read that failed — fail closed (#4).
  if (bp) {
    try { files.review = readFileSync(core.relToAbs(bp)); }
    catch (e) { console.warn(`  [${s.slug}] NOT publishing — blueprint unreadable at publish time: ${e.message}`); return { ok: false, reason: `blueprint unreadable at publish (${e.message})` }; }
  }
  // THE SPEC, not just the two rendered pages. Only prototype.html and review.html were ever
  // published, so a redeploy — which wipes runs/ with the instance — left an app whose blueprint you
  // could still READ but which had nothing to author from. The builder's only recourse was to
  // reconstruct from the conversation, producing a different app than the one reviewed. That is
  // exactly the divergence the one-artifact pipeline exists to prevent (vendorflow, 2026-08-03:
  // "the entire runs/vendorflow directory doesn't exist on disk").
  for (const [cls, rel] of [["ir", "app-spec.json"], ["seed", "seed.json"], ["decisions", "decisions.md"]]) {
    const f = join(runDir(s), rel);
    // A class whose file EXISTS on disk is a required read: if it can't be read, fail rather than publish a
    // version silently missing it (#4). A class that simply isn't present this turn is not required.
    if (existsSync(f)) {
      try { files[cls] = readFileSync(f); }
      catch (e) { console.warn(`  [${s.slug}] NOT publishing — ${cls} exists but is unreadable: ${e.message}`); return { ok: false, reason: `${cls} unreadable at publish (${e.message})` }; }
    }
  }
  // …and the WHOLE run, so a wiped disk can be refilled rather than reasoned around.
  try {
    const bundle = bundleRun(runDir(s));
    if (Object.keys(bundle).length) files.run = Buffer.from(JSON.stringify(bundle));
  } catch (e) { console.warn(`  [${s.slug}] could not bundle the run: ${e.message}`); }
  if (!Object.keys(files).length) return { ok: false, reason: "no artifacts" };
  /* A VERSION ONLY WHEN THE APP ACTUALLY CHANGED.
   *
   * This ran on every successful turn, so answering a question, correcting a word, or a turn that
   * touched nothing at all each minted a complete version — prototype, blueprint, spec, seed and a
   * ~350KB run bundle. BriefingHub produced three in five minutes (2026-08-10). A version list that
   * long is not a history anybody reads, and it is not free: it is the whole artifact set every time.
   *
   * The digest covers what defines the APP — prototype, blueprint, spec, seed. Deliberately not the
   * run bundle or decisions.md: the bundle carries timeline.jsonl, which gains an entry every turn by
   * design, so including it would make every digest unique and dedupe nothing. They still ride along
   * with whatever version does get published, and each one is read fresh at that moment, so nothing is
   * lost — it is simply not given a version of its own.
   */
  const digest = createHash("sha256");
  for (const cls of ["prototype", "review", "ir", "seed"]) if (files[cls]) digest.update(cls).update(files[cls]);
  const fingerprint = digest.digest("hex");
  if (fingerprint === s.artifactDigest) {
    console.log(`  [${s.slug}] no artifact changed this turn — no new version`);
    return { ok: true, reason: "unchanged" };
  }
  try {
    const turns = s.messages.filter((m) => m.role === "user").length;
    // REQUIRE A COMPLETE VERSION (#5/#15). publishVersion returns null on a partial/failed upload; do NOT
    // record the digest (which would remember this turn as durably published and skip the retry) unless a
    // version came back carrying EVERY class we submitted — not just the prototype.
    const v = await publishVersion(s.projectId, { label: `${s.app || s.title || s.slug} — chat build ${turns}`, files });
    const missing = Object.keys(files).filter((cls) => !v?.artifacts?.[cls]);
    if (!v || missing.length) {
      console.warn(`  [${s.slug}] version not durably published — ${!v ? "no version returned" : `missing artifacts: ${missing.join(", ")}`}`);
      return { ok: false, reason: `durable publish incomplete (${!v ? "no version stored" : "missing " + missing.join(", ")})` };
    }
    s.artifactDigest = fingerprint;   // only after the write truly landed — a failed publish retries next turn
    persist(s);
    return { ok: true, version: v };
  } catch (e) { console.warn(`  [${s.slug}] could not publish version: ${e.message}`); return { ok: false, reason: e.message }; }
}

// ── conductor auth ────────────────────────────────────────────────────────────────────────────────
// Interactive use needs nothing: the child inherits the operator's own `claude` login. Unattended use
// (the hosted builder — no browser, no keychain) needs an API key; `--use-api-key` reads it from the
// gitignored `.kf-env`, the same file the engine scripts source. The key is never logged or echoed.
function readEnvFile(file) {
  // Decode with the SAME parser the writer's shq() inverts (#6). The old inline regex stripped only a
  // single surrounding quote pair, so it mis-read the POSIX `'\''` idiom the writer emits for values
  // containing a quote (e.g. an API secret) — parseEnvText walks it exactly as `source` would.
  if (!existsSync(file)) return {};
  return parseEnvText(readFileSync(file, "utf8"));
}
const CHILD_ENV = {};
if (argv.includes("--use-api-key") || process.env.KF_CHAT_USE_API_KEY === "1") {
  const k = readEnvFile(join(REPO, ".kf-env")).ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (k) CHILD_ENV.ANTHROPIC_API_KEY = k;
  else console.warn("  --use-api-key: no ANTHROPIC_API_KEY in .kf-env — falling back to the operator's login");
}

/** Rotating the key from the admin page takes effect on the next build, without a redeploy. */
export function setChatApiKey(key) { if (key) CHILD_ENV.ANTHROPIC_API_KEY = key; }

// ── who is calling ────────────────────────────────────────────────────────────────────────────────
// `me` arrives already resolved from the control plane's own session gate — same process now, so there
// is nothing to fetch, nothing to cache, and no way for the chat's view of a role to drift from the
// control plane's.
//
// Every role sees the whole workspace: Prototype, Blueprint and the live Kissflow Preview. What the
// role still decides is the CONNECT flow — being handed terminal commands for an app is a developer
// concern — and, on the control-plane side, who administers users.
const isBuilderRole = (me) => me?.role === "developer" || me?.role === "admin";

/**
 * Who may read and speak in an app's chat: its members, plus a platform admin.
 *
 * A session with no projectId yet is one being created right now (linkProject runs a beat later) — it
 * has no members to check against, so it stays open; it acquires an owner within the same request.
 * With no database at all (local `node app.mjs`, the test suite) there is one operator and nothing to
 * gate, so the check yields.
 */
async function isMember(s, me) {
  if (!DB?.getMember || !me?.sub) return true;   // local/no-auth: one operator, nothing to gate
  if (me.role === "admin") return true;
  if (s.projectId) { try { return Boolean(await DB.getMember(s.projectId, me.sub)); } catch { return false; } }
  // NO project yet (a session mid-creation, or a legacy/transient one). Do NOT return true for everyone
  // (#5) — allow ONLY the recorded creator; fail closed if we don't even know who created it.
  return s.ownerSub ? s.ownerSub === me.sub : false;
}

/**
 * May `me` bind a session to this projectId? A caller who knows a project id could otherwise pass it as
 * body.projectId to POST /api/sessions and — via linkProject — OVERWRITE that project's chat_slug and
 * start a build on its linked dev credentials, with no membership check (#2). With no DB / no signed-in
 * user there is one operator and nothing to gate.
 */
async function canUseProject(projectId, me) {
  if (!DB?.getMember || !me?.sub) return true;
  if (me.role === "admin") return true;
  try { return Boolean(await DB.getMember(projectId, me.sub)); }
  catch { return false; }
}

/**
 * May `me` see/adopt the run at `slug`? runs/ is SHARED disk on a hosted instance, so listing it raw
 * (or adopting any slug) handed every signed-in user every other user's app — its name/domain and, on
 * adopt, its whole hydrated conversation. Resolve the run to its project and check membership. (#2/#3)
 *
 * Returns true (allowed), false (denied), or null (the slug maps to NO project — an orphan/terminal
 * run with no owner to protect). Listing hides null (don't leak an unowned run); adopt allows null
 * (claiming an unowned local run is the terminal→chat handoff). With no DB / no signed-in user there
 * is one operator and nothing to gate, so it yields true.
 */
async function canAccessRun(slug, me, projectIdHint = null) {
  if (!DB?.getMember || !me?.sub) return true;
  if (me.role === "admin") return true;
  let pid = projectIdHint;
  if (!pid && DB.getProjectByChatSlug) {
    try { pid = (await DB.getProjectByChatSlug(String(slug)))?.id || null; }
    catch { return false; }   // a lookup failure must not read as "allowed"
  }
  if (!pid) return null;      // unmapped — caller decides
  try { return Boolean(await DB.getMember(pid, me.sub)); }
  catch { return false; }
}

// ── an app is ONE thing ───────────────────────────────────────────────────────────────────────────
// The app lives in Postgres (owner, members, versions); runs/<slug> on disk is only where that app's
// artifacts land. Binding them at session creation is what stopped the two halves of the product from
// showing two different app lists.
async function linkProject(s, me) {
  if (!DB || !me?.sub) return null;
  // The chat_slug we are about to persist becomes a filesystem path in later commands — never store a
  // slug that isn't a contained single segment (#17). Session-created slugs come from slugify and always
  // pass; this closes any other caller (e.g. a hand-set slug) at the one place the project is written.
  if (s.slug && !isContainedRunDir(s.slug)) { console.warn(`linkProject: refusing malformed slug ${JSON.stringify(s.slug)}`); return null; }
  if (s.projectId) {
    // INDEPENDENT authorization (#2): even if a caller set s.projectId by some other path, never bind a
    // session (or overwrite chat_slug) for a project the user isn't a member of.
    if (!(await canUseProject(s.projectId, me))) { console.warn(`linkProject: ${me.sub} not a member of ${s.projectId} — refusing to bind`); return null; }
    await DB.setProjectChatSlug(s.projectId, s.slug); return s.projectId;
  }
  const p = await DB.createProject(s.app || s.title || s.slug, me.sub);
  await DB.setProjectChatSlug(p.id, s.slug);
  // AUTO-LINK the first configured dev environment. An app created in chat used to arrive with none,
  // and the failure surfaced only much later, in the worst possible place: the builder runs the whole
  // design, then reports it cannot authenticate anywhere and stops — with no way to fix it from the
  // chat, because linking lives on the project record page (VaultOps, 2026-08-02). Choosing for them
  // is right here: nearly everyone has exactly one, a choice of one is not a choice, and the link is
  // reversible from App settings at any time. Best-effort — an app with no environment is still
  // perfectly designable, so this must never cost someone the app they just named.
  try {
    const envId = await defaultDevEnvFor(me.sub);
    if (envId && DB.setProjectDevEnv) await DB.setProjectDevEnv(p.id, envId);
  } catch { /* designable without one; App settings can link it later */ }
  s.projectId = p.id; persist(s);
  return p.id;
}

// ── session store ─────────────────────────────────────────────────────────────────────────────────
/** @type {Map<string, any>} */
const sessions = new Map();
const embedCheck = new Map();   // host → {at, out} — /api/embed-check results, 5-min TTL

// Minimal multipart/form-data parser: one binary file field plus text fields, parts split on the
// boundary as raw Buffers so file bytes are never round-tripped through a string.
function parseMultipart(buf, contentType) {
  const bm = /boundary=(?:"([^"]+)"|([^;]+))/.exec(String(contentType || ""));
  if (!bm) return null;
  const boundary = Buffer.from("--" + (bm[1] || bm[2]).trim());
  const fields = {}; let file = null;
  let at = buf.indexOf(boundary);
  while (at !== -1) {
    const next = buf.indexOf(boundary, at + boundary.length);
    if (next === -1) break;
    let part = buf.subarray(at + boundary.length, next);
    if (part[0] === 13 && part[1] === 10) part = part.subarray(2);
    if (part[part.length - 2] === 13 && part[part.length - 1] === 10) part = part.subarray(0, -2);
    const headEnd = part.indexOf("\r\n\r\n");
    if (headEnd !== -1) {
      const head = part.subarray(0, headEnd).toString("utf8");
      const data = part.subarray(headEnd + 4);
      const fileM = /filename="([^"]*)"/.exec(head);
      const nameM = /name="([^"]*)"/.exec(head);
      if (fileM) file = { filename: fileM[1], data };
      else if (nameM) fields[nameM[1]] = data.toString("utf8");
    }
    at = next;
  }
  return { fields, file };
}

function uniqueSlug(base) {
  let s = base, n = 2;
  const taken = (x) => existsSync(join(RUNS, x)) || [...sessions.values()].some((v) => v.slug === x);
  while (taken(s)) s = `${base}-${n++}`;
  return s;
}

// The file is the hot path — persist() is called from stream handlers and must stay cheap and sync.
// The database copy is what actually survives, since runs/ is the container's local disk: debounced so
// a chatty turn writes once, and best-effort so storage trouble never breaks a build in progress.
const dbPending = new Map();   // id → debounce timer
const dbSeen = new Set();      // ids already written at least once

function writeSession(s) {
  return DB.saveChatSession(s.id, s.projectId || null, s.slug, snapshotOf(s))
    .catch((e) => console.warn(`  [${s.slug}] session not persisted: ${e.message}`));
}

// ── THE TRANSCRIPT IS ROWS ─────────────────────────────────────────────────────────────────────────
//
// It used to live inside the session blob, which every instance overwrote whole: two instances
// touching one session, and one silently lost the other's messages. A blob cannot express a
// concurrent append. A table can, and each instance now writes only the rows it actually added.
//
// ONE integration point, not eleven. Eleven places push a message and three flip `consumedBy`, and a
// hook on each is eleven chances to forget. Instead the writer DIFFS: a message with no _id is new,
// and one whose signature moved has been edited (an assistant message grows while it streams, a
// user message gets consumed by a turn). Anything the rest of the code does to s.messages is picked
// up without that code knowing this exists.
// ── INSTRUMENTING EVERY BUILD, NOT JUST THE THOROUGH ONES ─────────────────────────────────────────
//
// Only the comprehensive pipeline wrote timeline.jsonl, because the agents in it write their own.
// Express writes nothing — so "why did that take nine minutes" was answerable only by reading file
// mtimes and guessing, which is how I spent an hour of today. The host already sees every phase
// marker and both ends of the turn; it can write the timeline itself for any build, and one written
// host-side cannot be skipped by a conductor that forgets its markers.
//
// Append-only JSONL in the run directory, so it travels with the run to storage and stays readable
// with tail. Failure here must never touch the build: instrumentation that can break a turn is worse
// than none.
function traceRun(s, ev) {
  try {
    const dir = runDir(s);
    // Create it rather than skip. Bailing out here dropped the FIRST turn's start event on every new
    // app — the conductor makes the run directory a moment later — which is the one build whose
    // duration anyone asks about, and it left a timeline that opened mid-way with no start to
    // measure from. traceRun is only reached during a build, so this never invents a directory for a
    // session that was not going to have one.
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "timeline.jsonl"),
      JSON.stringify({ ts: new Date().toISOString(), actor: "host", ...ev }) + "\n");
  } catch { /* a build must not fail because its timeline could not be written */ }
}

/* THE TIMELINE HAS TO OUTLIVE THE TURN THAT FAILED.
 *
 * timeline.jsonl already reached the bucket, but only as a passenger: bundleRun sweeps the whole run
 * directory into the `run` artifact, and that is published by publishBuild — which turn-end calls
 * only `if (r && r.ok)`, and which `fatal` and `exit` never call at all.
 *
 * So the timeline was stored for exactly the builds nobody needs to investigate. A turn that hung,
 * crashed, or was killed by a redeploy wrote its start, its phases and its last event to a disk that
 * goes away with the instance, and answering "where did those nine minutes go" meant reading Cloud
 * Run logs and inferring the rest.
 *
 * Its own object, not a version: a failed turn must not mint one. Overwritten each time, because the
 * file is append-only and a few KB — the newest copy contains every earlier one. Named by slug and
 * project so it can be found by a human who only knows what the app is called.
 *
 * Fire-and-forget by construction. This runs on the way out of a turn that may already be failing,
 * and a build must never end worse because its timeline could not be uploaded.
 */
function saveTimeline(s) {
  if (!s?.projectId || !storeBlob) return;
  let body;
  try {
    const f = join(runDir(s), "timeline.jsonl");
    if (!existsSync(f)) return;
    body = readFileSync(f);
  } catch { return; }
  if (!body?.length) return;
  Promise.resolve(storeBlob(`timelines/${s.slug}-${s.projectId}.jsonl`, body, "application/x-ndjson"))
    .catch((e) => console.warn(`  [${s.slug}] could not store the timeline: ${e.message}`));
}

const sigOf = (m) => `${m.role}|${(m.text || "").length}|${m.open ? 1 : 0}|${m.consumedBy || ""}|${m.items?.length || 0}`;
const syncing = new Set(), syncAgain = new Set();

async function syncMessages(s) {
  if (!DB?.appendMessage) return;
  if (syncing.has(s.id)) { syncAgain.add(s.id); return; }   // never two writers for one transcript
  syncing.add(s.id);
  try {
    for (const m of s.messages) {
      const sig = sigOf(m);
      if (m._id == null) {
        m._id = await DB.appendMessage(s.id, m);
        m._sig = sig;
      } else if (m._sig !== sig) {
        await DB.updateMessage(m._id, m);
        m._sig = sig;
      }
    }
  } catch (e) { console.warn(`  [${s.slug}] transcript not persisted: ${e.message}`); }
  finally {
    syncing.delete(s.id);
    if (syncAgain.delete(s.id)) setImmediate(() => syncMessages(s).catch(() => {}));
  }
}

/**
 * Read the transcript back. Rows are authoritative; a session that predates them is migrated on
 * first read, once, so nobody loses history to the change itself.
 */
async function loadMessages(s) {
  if (!DB?.listMessages) return;
  try {
    const rows = await DB.listMessages(s.id);
    if (rows.length) { s.messages = rows.map((m) => ({ ...m, _sig: sigOf(m) })); return; }
    if (s.messages?.length) {
      for (const m of s.messages) { m._id = await DB.appendMessage(s.id, m); m._sig = sigOf(m); }
      console.log(`  [${s.slug}] migrated ${s.messages.length} message(s) out of the session blob`);
    }
  } catch (e) { console.warn(`  [${s.slug}] transcript not read: ${e.message}`); }
}

function persist(s) {
  const snap = snapshotOf(s);
  writeFileSync(join(STORE, `${s.id}.json`), JSON.stringify(snap, null, 1));
  syncMessages(s).catch(() => {});   // the transcript goes to its own rows, undebounced
  if (!DB?.saveChatSession) return;
  // The FIRST write goes straight through: a session that only exists on local disk is one redeploy
  // from being gone, and debouncing its creation is a 1.5s window where that is exactly the state.
  if (!dbSeen.has(s.id)) { dbSeen.add(s.id); writeSession(s); return; }
  clearTimeout(dbPending.get(s.id));
  dbPending.set(s.id, setTimeout(() => { dbPending.delete(s.id); writeSession(s); }, 1500));
}

/**
 * A session's transcript, fetched the first time it is needed.
 *
 * Every instance used to hold every message of every conversation, forever: memory and boot time
 * scaling with total history rather than with what anyone is doing. Six instances meant six copies
 * of a transcript nobody had opened since July.
 *
 * Idempotent and safe to call on any path that is about to READ or BUILD — cheap after the first
 * time, and the one-time migration out of the session blob happens here too.
 */
async function ensureLoaded(s) {
  if (!s || s._loaded) return s;
  s._loaded = true;               // set first: two concurrent readers must not both fetch
  await loadMessages(s).catch(() => { s._loaded = false; });
  return s;
}

/**
 * A session by id, fetched from the database if THIS instance has never heard of it.
 *
 * loadSessions() runs once, at boot. Nothing added to the map afterwards: onRemoteEvents returns
 * early on an id it does not already hold, and the follower poll only iterates sessions already
 * there. So a session created on another replica AFTER this one booted was invisible to it forever.
 *
 * That is fine until you notice the service is not single-instance. maxScale is 8, there is no
 * session affinity, and 11 distinct instances served traffic in one day — so a request lands on a
 * replica at random and roughly one in N had never heard of the session. The user saw "This build is
 * no longer on the server", which was untrue: the session was in Postgres the whole time, and the
 * message's own advice ("send a message to resume it") hit the same dead lookup. 106 of these in a
 * day and climbing (2026-08-11).
 *
 * Nothing is actually lost, so nothing needs recovering — the row just has to be read.
 */
const hydrating = new Map();   // id → in-flight promise: a burst of requests makes ONE query
async function getSession(id) {
  const have = sessions.get(id);
  if (have) return have;
  if (!id || !DB?.getChatSession) return null;
  if (hydrating.has(id)) return hydrating.get(id);

  const p = (async () => {
    try {
      const row = await DB.getChatSession(id);
      const d = row && (typeof row.data === "string" ? JSON.parse(row.data) : row.data);
      if (!d?.id) return null;
      // Somebody may have won the race while we were waiting on the database. Their object is the one
      // other code already holds references to, so it wins — never replace a live session.
      const raced = sessions.get(id);
      if (raced) return raced;

      // NOT fromBoot. That flag means "restored at startup, may need its turn resumed", and
      // resumeInterrupted() acts on it by spawning a conductor. This instance is a reader that
      // arrived late, not the driver — re-driving would put a second conductor on one run directory,
      // which is the exact bug resumeInterrupted's own guard exists to prevent.
      const s = hydrate(d);
      sessions.set(id, s);

      // Same two cursors, and for the same reason, as the boot path — see loadSessions(). `seq` is
      // the emit counter, jumped clear of numbers already streamed to connected clients; `logSeq` is
      // where the log stands now, because following has to read from there. Getting this wrong does
      // not fail loudly: the client silently drops events it thinks are duplicates.
      if (DB.maxChatEventSeqs) {
        try {
          const max = (await DB.maxChatEventSeqs(id))[id];
          if (max) { s.seq = max + 200; s.logSeq = max; }
        } catch { /* a session that streams from 0 still beats a 404 */ }
      }
      return s;
    } catch (e) {
      console.warn(`  could not hydrate session ${id}: ${e.message}`);
      return null;
    } finally { hydrating.delete(id); }
  })();

  hydrating.set(id, p);
  return p;
}

async function loadSessions() {
  if (existsSync(STORE)) {
    for (const f of readdirSync(STORE)) {
      if (!f.endsWith(".json")) continue;
      try { const d = JSON.parse(readFileSync(join(STORE, f), "utf8")); sessions.set(d.id, Object.assign(hydrate(d), { fromBoot: true })); }
      catch { /* a corrupt session file shouldn't stop the server */ }
    }
  }
  // A fresh instance has an empty disk — restore every conversation from the database, which is the
  // only copy that outlives a redeploy. Local files win only if they are somehow newer.
  if (!DB?.listChatSessions) return;
  try {
    for (const row of await DB.listChatSessions()) {
      const d = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      if (!d?.id || sessions.has(d.id)) continue;
      sessions.set(d.id, Object.assign(hydrate(d), { fromBoot: true }));
    }
  } catch (e) { console.warn(`  could not restore chat sessions: ${e.message}`); }

  // TRANSCRIPTS ARE NOT LOADED AT BOOT. Reading every session's messages here is the O(all history)
  // cost lazy loading exists to remove — and most of them will never be opened. A session's messages
  // arrive the first time somebody actually looks at it (see ensureLoaded), and until then the
  // session is a name, a slug and a project id, which is all the list needs.

  // Resume each session's event numbering where the log left off. hydrate() starts every session at
  // seq 0, so without this a restarted instance re-issues numbers the log already holds: a client that
  // reconnects with ?since=412 is told there is nothing after 412 while events 1..n stream past it, and
  // the chat looks frozen even though the build is running. Silent, and only visible after a restart.
  if (!DB?.maxChatEventSeqs) return;
  try {
    const maxes = await DB.maxChatEventSeqs();
    // +200 GAP on restore: events emitted inside the previous instance's debounce window died with
    // it, so the log's max can sit BELOW numbers already streamed to connected clients — restoring
    // to it re-issues those numbers and clients silently drop the "duplicates" (the invisible-
    // comment bug). Clients only ever compare seq monotonically, so holes are free.
    for (const s of sessions.values()) if (maxes[s.id]) {
      // Two cursors on purpose. `seq` is the EMIT counter, jumped +200 so events this instance mints
      // can never collide with numbers the previous instance already streamed. `logSeq` is where the
      // LOG was at boot — and following must read from THERE, because during a deploy the drained old
      // instance keeps writing rows in the gap. Comparing the follower against the +200 counter made
      // this instance believe it was ahead of a log still being written: an admin who signed in after
      // a promote watched a build frozen at its boot snapshot while sixteen agents ran on the old
      // instance (quayside-yard-control, 2026-08-04).
      s.seq = maxes[s.id] + 200;
      s.logSeq = maxes[s.id];
    }
  } catch (e) { console.warn(`  could not restore event sequence: ${e.message}`); }
}

function publicSession(s, me) {
  return {
    id: s.id, slug: s.slug, title: s.title, createdAt: s.createdAt, app: s.app || null, projectId: s.projectId || null,
    // `preview` only when the file actually resolves on THIS disk. The persisted path outlives the
    // instance that wrote it (Cloud Run disk dies with the revision), and reporting it anyway made
    // the client iframe a 404 — a pane of raw {"error":"nothing built yet"} — while ALSO suppressing
    // withRemoteArtifacts' GCS fallback, which only engages when preview is null.
    messages: s.messages, preview: resolvePreview(s) ? (s.preview || "prototype/index.html") : null, blueprint: resolveBlueprint(s),
    // Fall back to the run's own build record. The marker is the fast path, not the only evidence —
    // an app that live.md says was created should never present as "not built in Kissflow yet".
    runtime: s.runtime || findRuntimeUrl(runDir(s)) || null, phase: s.phase, status: s.status,
    busy: s.busy, generating: !!s.generating, roles: rolesBuilt(s), seq: s.seq, prompt: s.prompt || null,
    // The AUTHORITATIVE last-turn outcome (#2). On reload the client renders the ready card from THIS, not
    // from prototype/blueprint paths that outlive a failed or stopped turn on disk.
    lastTurnVerdict: s.lastTurnVerdict || null, readyVersionId: s.readyVersionId ?? null,
    // What this conversation has cost — ADMIN-ONLY. A regular member of an app must not see the spend;
    // only a platform admin (me.role === "admin") gets it here (and in the spend grid). Fails safe: an
    // absent/unknown `me` is not an admin, so cost stays hidden. This is the same number that answers
    // "why did this app cost $235" — kept for admins, not shown inside the app.
    usage: (me?.role === "admin" && s.usageTotals) ? {
      ...s.usageTotals,
      usd: Number(s.spendUsd) || 0,
      // one number that explains the bill: tokens re-read per turn. Cost here tracks CONTEXT SIZE,
      // not turn count — a long transcript re-read every turn is what makes a session expensive.
      // all three, because they are disjoint parts of one input — leaving `written` out understated
      // context per turn and overstated the hit rate, on the axis that dominates the bill
      perTurn: s.usageTotals.turns
        ? Math.round((s.usageTotals.fresh + s.usageTotals.cached + s.usageTotals.written) / s.usageTotals.turns) : 0,
      cacheHit: (s.usageTotals.fresh + s.usageTotals.cached + s.usageTotals.written) > 0
        ? Math.round((s.usageTotals.cached / (s.usageTotals.fresh + s.usageTotals.cached + s.usageTotals.written)) * 100) : 0,
      // writes > reads means the context is being rebuilt rather than reused — the shape that turned
      // 26 turns into $235, and the one a read-only ratio calls healthy
      recaching: s.usageTotals.written > s.usageTotals.cached && s.usageTotals.turns > 1,
    } : null,
  };
}

/**
 * For an app built elsewhere there is no prototype or review on this disk — they are version artifacts
 * the control plane serves from GCS. Same origin now, so the panes can point straight at them and the
 * tabs stop looking empty for an app that plainly has builds.
 */
/**
 * A session's projectId is set once, at creation. If that ever failed — a run adopted from disk, a
 * session older than project linking, a transient database blip — it stayed null FOREVER, and
 * everything keyed on it silently disappeared: the App settings link had nothing to point at, so the
 * icon simply never showed for that app and no amount of reloading brought it back.
 *
 * Repair it on read, by LOOKUP only. The project is found by the chat slug it already registered;
 * nothing is created here. A GET that creates a project would mint a duplicate for any app whose
 * project exists under a different linkage, which is a worse failure than the one being fixed.
 */
export async function repairProjectLink(s) {
  if (s.projectId || !DB?.getProjectByChatSlug || !s.slug) return;
  try {
    const p = await DB.getProjectByChatSlug(s.slug);
    if (p?.id) { s.projectId = p.id; persist(s); }
  } catch { /* the link stays missing; nothing else breaks */ }
}

async function withRemoteArtifacts(s, me) {
  await ensureLoaded(s);          // the transcript is fetched on first read, not at boot
  const pub = publicSession(s, me);
  if (!DB || !s.projectId) return pub;
  const project = await DB.getProject(s.projectId).catch(() => null);
  const pinned = project?.pinned || {};
  const versions = await DB.listVersions(s.projectId).catch(() => []);

  // A PINNED artifact beats the newest build AND the file on this disk. That is the whole point: the
  // prototype everyone agreed on stays on screen while later builds keep landing, and it is the one
  // case where "show what this run just wrote" is the wrong answer. Pins are per artifact, so the
  // blueprint carries on following the latest.
  for (const [cls, key, urlKey] of [["prototype", "preview", "previewUrl"], ["review", "blueprint", "blueprintUrl"]]) {
    const seq = Number(pinned[cls]);
    if (!seq) continue;
    const v = versions.find((x) => Number(x.seq) === seq);
    if (!v || !artifactUri(v.artifacts, cls)) continue;   // a pin at a version that has no such artifact is ignored, not obeyed into a blank pane
    pub[key] = null;                                       // stop the local file from winning
    pub[urlKey] = `/projects/${s.projectId}/versions/${v.seq}/${cls}`;
    pub.pinned = { ...(pub.pinned || {}), [cls]: v.seq };
  }

  // PER ARTIFACT, not all-or-nothing. This used to bail when EITHER resolved locally, so a restart
  // that left one file behind and not the other suppressed the fallback for both: the blueprint was
  // there, the prototype pane was empty, and its versions were sitting in GCS the whole time
  // (VendorFlow, 2026-08-03). They are separate artifacts with separate lifetimes.
  if (pub.preview && pub.blueprint) return pub;
  for (const v of versions) {
    if (!pub.preview && !pinned.prototype && artifactUri(v.artifacts, "prototype")) pub.previewUrl = `/projects/${s.projectId}/versions/${v.seq}/prototype`;
    if (!pub.blueprint && !pinned.review && artifactUri(v.artifacts, "review")) pub.blueprintUrl = `/projects/${s.projectId}/versions/${v.seq}/review`;
  }
  return pub;
}

// ── adopting an existing run ──────────────────────────────────────────────────────────────────────
// A run built in the terminal (or a prior chat) has no conversation behind it. Opening it cold — an
// empty chat next to a finished app — gives the user nothing to react to. Synthesize a short recap
// from what's actually on disk (the experience spec, whether it's live in Kissflow) plus a few
// concrete next moves, so the FIRST thing they see is "here's what this is" + "here's what you could
// do next", not a blank composer. (readAppMeta / findRuntimeUrl / synthesizeAdoptHistory: session-core.)
/**
 * Opening an app must never show a blank chat. The recap used to be generated only when a session was
 * first created, so any session that already existed with an empty transcript — adopted by an older
 * build, or created before it had artifacts — opened cold with nothing to react to. The rule is about
 * the TRANSCRIPT, not about how the session came to be: no history and something built → recap it.
 * A genuinely new app with nothing built keeps the clean composer and its example prompts.
 */
async function ensureRecap(s) {
  if (s.messages.length) return;
  if (resolvePreview(s) || resolveBlueprint(s)) { synthesizeAdoptHistory(s); persist(s); return; }
  // No run on this machine — built from the CLI, or before the chat existed. The version history is
  // what we know about it, so open with that rather than an empty composer for an app that clearly
  // exists. (Sending the user to the records page instead was worse: it looks like a different, older
  // product.)
  if (!DB || !s.projectId) return;
  let versions = [], proj = null;
  try { versions = await DB.listVersions(s.projectId); proj = await DB.getProject(s.projectId); } catch { return; }
  if (!versions.length) return;
  const last = versions[versions.length - 1];
  const n = versions.length;
  s.messages.push({ role: "assistant", ts: Date.now(), text:
    `**${proj?.name || s.title}** was built outside this chat — ${n} version${n > 1 ? "s" : ""} on record, most recently *${last.label || "v" + last.seq}*. ` +
    `Its review and prototype are kept with [that history](/p/${s.projectId}). Say what should change and I'll build the next version here.` });
  s.messages.push({ role: "suggestions", ts: Date.now(), items: [
    "Walk me through what this app does today",
    "Change the visual identity — palette, density, shell",
    "Add a role and its landing page",
    "Rebuild the prototype so I can click through it",
  ] });
  persist(s);
}

// ── event fan-out ─────────────────────────────────────────────────────────────────────────────────
// Two things happen to every event: it goes out to the browsers watching this app right now, and it is
// appended to the durable log so a reconnect — or a colleague opening the chat an hour later — replays
// exactly what the live viewers saw.
//
// Deltas are coalesced BEFORE the seq is assigned, not batched after it. Assistant prose arrives a
// token at a time and one event per token would be ~100k log rows for a long build; coalescing at the
// source keeps the live stream, the log and a replay carrying the SAME events under the SAME numbers.
// Batching after the fact would hand a replaying client different seqs than the live one saw, which is
// precisely the drift the log exists to remove.
const COALESCE_MS = 150;   // prose granularity: ~7 updates/sec still reads as typing
const LOG_FLUSH_MS = 200;

function fanout(s, ev) {
  s.events.push(ev);
  if (s.events.length > 4000) s.events.splice(0, s.events.length - 4000);
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of s.clients) { try { res.write(line); } catch { s.clients.delete(res); } }
}

function logAppend(s, ev) {
  if (!DB?.appendChatEvents) return;
  // remember what WE wrote — the follower re-reads the log and must not re-stream our own rows
  (s.pushed ||= new Set()).add(ev.seq);
  if (s.pushed.size > 8000) { const it = s.pushed.values(); for (let i = 0; i < 3000; i++) s.pushed.delete(it.next().value); }
  (s.logQ ||= []).push({ seq: ev.seq, payload: ev });
  // A human's message (and a turn boundary) is flushed NOW, not on the debounce: an instance dying
  // inside the debounce window loses the tail, and the next instance restores a lower high-water
  // mark — twice that meant a posted comment that only appeared after a reload.
  if (["user", "turn-end", "error"].includes(ev.type)) { flushLog(s); return; }
  if (!s.logT) s.logT = setTimeout(() => flushLog(s), LOG_FLUSH_MS);
}

/** Write the pending rows. Best-effort: losing the log must never take a live build down with it. */
async function flushLog(s) {
  clearTimeout(s.logT); s.logT = null;
  const rows = s.logQ; s.logQ = null;
  if (!rows?.length || !DB?.appendChatEvents) return;
  try {
    await DB.appendChatEvents(s.id, rows);
    // Tell the other replicas. Their copy of this session has no idea anything happened — they are not
    // running the build and nothing streams to them — so without this a member watching the same chat
    // from a different instance sees it freeze mid-build.
    await DB.notifyChatEvent?.(s.id, rows[rows.length - 1].seq);
  } catch (e) { console.warn(`  [${s.slug}] events not logged: ${e.message}`); }
}

/**
 * An event landed for a session THIS instance is not driving. Read what we are missing from the log
 * and push it to whoever is watching here.
 *
 * Only for sessions with a live viewer: a replica holding no clients for a chat has nothing to do with
 * it, and reading the log for every session on every notification would make each instance do every
 * other instance's work. `s.seq` is the high-water mark, so the instance that WROTE these events is
 * already past them and no-ops — the notification it receives from itself costs one comparison.
 */
async function onRemoteEvents(sessionId, seq) {
  const s = sessions.get(sessionId);
  if (!s || !s.clients.size || !DB?.readChatEvents) return;
  const cursor = s.logSeq ?? 0;
  if (cursor >= seq) return;
  try {
    const rows = await DB.readChatEvents(sessionId, cursor, 2000);
    for (const r of rows) {
      const ev = r.payload;
      if (!ev) continue;
      s.logSeq = Math.max(s.logSeq ?? 0, ev.seq);
      if (s.pushed?.has(ev.seq)) continue;          // our own row, already streamed live
      if (ev.seq > s.seq) s.seq = ev.seq;           // never regress the emit counter
      s.events.push(ev);
      const line = `data: ${JSON.stringify(ev)}\n\n`;
      for (const res of s.clients) { try { res.write(line); } catch { s.clients.delete(res); } }
    }
    if (s.events.length > 4000) s.events.splice(0, s.events.length - 4000);
  } catch (e) { console.warn(`  [${s.slug}] could not follow remote events: ${e.message}`); }
}

function rawEmit(s, type, data) {
  const ev = { seq: ++s.seq, t: Date.now(), type, ...data };
  fanout(s, ev);
  logAppend(s, ev);
  return ev;
}

function flushDeltas(s) {
  clearTimeout(s.deltaT); s.deltaT = null;
  const d = s.delta; s.delta = null;
  if (d) rawEmit(s, d.type, d.data);
}

function emit(s, type, data = {}) {
  if (type === "text" || type === "agent") {
    // One buffer, keyed by who is speaking: the design director's paragraph must not absorb the
    // prototype builder's, and neither may absorb the conductor's own.
    const key = type === "agent" ? `${data.id}|${data.name}` : "text";
    if (s.delta && (s.delta.type !== type || s.delta.key !== key)) flushDeltas(s);
    if (!s.delta) s.delta = { type, key, data: { ...data, text: "" } };
    s.delta.data.text += data.text || "";
    if (!s.deltaT) s.deltaT = setTimeout(() => flushDeltas(s), COALESCE_MS);
    return null;
  }
  // Everything else flushes the pending prose first. An event that overtook the paragraph it followed
  // would be mis-ordered in the log permanently — live viewers would never notice, every replay would.
  flushDeltas(s);
  // The moment a prototype or blueprint exists, its LIVE copy goes to storage (debounced — a build
  // touches these files in bursts). This is what makes "cache miss → fetch from storage" work for a
  // build still in flight: without it the durable copy only appeared at turn-end, so a viewer on any
  // other instance stared at nothing for the whole build (quayside-yard-control, 2026-08-04).
  if ((type === "preview" || type === "blueprint") && s.projectId) {
    clearTimeout(s.liveT);
    s.liveT = setTimeout(async () => {
      try {
        const files = {};
        const pr = resolvePreview(s);
        if (pr) {
          // The live streaming copy must also be compiled, never raw (#2) — partial phase, so
          // in-progress placeholders are fine but the CSS must be compiled. If it can't be prepared,
          // we simply don't push a new live copy this tick; the last good one stays.
          const prep = await preparePrototypeForPublication(readFileSync(pr, "utf8"), { phase: "partial", label: runDir(s) });
          if (prep.ok) files.prototype = Buffer.from(prep.html, "utf8");
        }
        const bp = resolveBlueprint(s);
        if (bp) files.review = readFileSync(core.relToAbs(bp));
        if (Object.keys(files).length) await publishLive(s.projectId, files);
        if (type === "preview") checkPrototype(s);
      } catch (e) { console.warn(`  [${s.slug}] live publish: ${e.message}`); }
    }, 3000);
  }
  return rawEmit(s, type, data);
}

// ── streaming the prototype ───────────────────────────────────────────────────────────────────────
//
// The prototype is built as a SHELL (chrome, nav, role switcher, theme — seconds) plus one part per
// role (minutes, concurrent). Assembling only at the end means the pane stays empty for the whole
// build, which is most of what a person waiting actually experiences.
//
// The assembler has always supported this: `--partial` splices whatever exists and leaves a
// placeholder for the rest, and CONDUCTOR.md tells the builder to use it early and re-emit as each
// role lands. But that is an INSTRUCTION, and the pane being empty is exactly what it looks like
// when a model skips one. Worse, the watcher that would notice `index.html` appearing (watchPreview)
// cannot start until the conductor has already announced the file — so nothing was watching during
// the only window that mattered.
//
// So the host assembles too. Whenever a part lands, it re-splices in-process and writes index.html;
// the existing preview event does the rest. No model cooperation, no subprocess.
// v1's side of it. The splice itself lives in the engine (assembleRun) because v2's worker needs
// byte-identical behaviour, and keeping two copies is exactly how the two tiers drifted apart.
// async since the splice now PRE-COMPILES the Tailwind head (engine/proto-precompile.mjs) — the
// preview pane is the host where the browser CDN 404s its own imports and takes every style rule
// down with it, so the streaming page has to arrive already compiled.
// Dispatches on the run's medium: react (default) → single-file build; html (legacy, KF_PROTOTYPE=html or
// an app already built as HTML) → assembleRun VERBATIM.
const autoAssemble = (s) => assemblePrototype(runDir(s));

// ── the host verifies the page, instead of trusting that someone did ──────────────────────────────
//
// proto-verify has always existed and CONDUCTOR.md has always said to run it at the Verify phase.
// But that is an INSTRUCTION, and a skipped instruction looks exactly like a passed check: the turn
// ends, the pane fills, the user is told it is done. A stat card reading `${fmtMoney(8850000)}`
// shipped that way (2026-08-08).
//
// So the host runs it. Not to block the pane — a build streams, and a half-spliced page is the
// NORMAL state for most of a turn — but to make the end of the turn honest. Only the findings that
// are bugs whatever else is missing count; MISSING_PART and an unfilled container are what an
// in-flight build looks like, and flagging those would cry wolf on every turn.
// These are what an UNFINISHED page looks like: parts not spliced yet, so nothing has registered a
// page and containers are still empty. Every one resolves itself as the build continues. They are
// tolerated while the build streams and reported at the END, where they mean something entirely
// different — a page that never got its parts is the chrome-only prototype that shipped three times.
const MID_BUILD_OK = new Set(["MISSING_PART", "NO_ROLEVIEW", "NO_SCRIPT", "EMPTY_CONTAINER", "NO_PAGES_DATA"]);
export const hardFindings = (findings, { final = false } = {}) =>
  (findings || []).filter((x) => x.level === "error" && (final || !MID_BUILD_OK.has(x.kind)));

/**
 * The PURE finalization decision (#2/#3/#4). Given the raw turn result, the prototype verdict (hard
 * findings, empty = ok), and the durable-publish outcome, decide the ONE final `ok` and what blocked it.
 * A turn is clean only when it ran ok, its prototype verified, AND the version published — except that
 * an intentional local/dev run with no publisher (`pub.unavailable`) is not a publication failure.
 * Exported so the transaction is testable without driving a whole turn.
 */
export function finalizeVerdict({ turnOk, hard = [], pub = { ok: true } }) {
  const protoOk = hard.length === 0;
  const publishFailed = !!(pub && pub.ok === false && !pub.unavailable);
  const finalOk = !!turnOk && protoOk && !publishFailed;
  const blocked = [...new Set([...(protoOk ? [] : hard.map((f) => f.kind)), ...(publishFailed ? ["publish"] : [])])];
  return { ok: finalOk, blocked, protoOk, publishFailed };
}
function checkPrototype(s, { final = false } = {}) {
  try {
    const f = resolvePreview(s);
    if (!f) {
      // No assembled prototype. A build FAILURE, not a pass (#3/#6), when this turn was EXPECTED to
      // produce one — either it announced a prototype build (s.prototypeExpected, set by the building
      // marker, which catches a build that died after the spec/review but BEFORE it ever wrote a shell)
      // or a shell exists but no index.html resulted (assembly failed / CSS rejected). A pure Q&A turn
      // expects no prototype and is correctly not flagged.
      if (final && (s.prototypeExpected || existsSync(join(partsDir(s), "shell.html"))))
        return (s.protoIssues = [{ role: "(shell)", level: "error", kind: "PROTOTYPE_MISSING", msg: "a prototype build was expected but produced no assembled page — assembly failed, the CSS was rejected, or it stopped before writing the shell" }]);
      return null;
    }
    // STALE ARTIFACT (#6). If this turn announced a prototype build, the prototype must have been written
    // THIS turn — a leftover index.html from a PRIOR turn must not satisfy a new build that actually
    // failed. If the file predates the turn, treat it as not produced.
    if (final && s.prototypeExpected && s.turnStartedAt) {
      try { if (statSync(f).mtimeMs < s.turnStartedAt - 1000) return (s.protoIssues = [{ role: "(shell)", level: "error", kind: "PROTOTYPE_STALE", msg: "a prototype build was expected but the only prototype on disk predates this turn — the build did not produce a fresh one" }]); } catch { /* fall through to the read below */ }
    }
    const { findings } = verifyProto(readFileSync(f, "utf8"));
    const hard = hardFindings(findings, { final });
    s.protoIssues = hard;
    return hard;
  } catch {
    // A read/verifier EXCEPTION is not "no findings" (#6). When a prototype was expected, fail closed —
    // an unreadable/unverifiable page is a failed build, not a clean one.
    if (final && (s.prototypeExpected || existsSync(join(partsDir(s), "shell.html"))))
      return (s.protoIssues = [{ role: "(shell)", level: "error", kind: "PROTOTYPE_UNVERIFIABLE", msg: "the prototype could not be read or verified — treated as a failed build" }]);
    return null;
  }
}

// Said at turn end, in the chat, where the claim "it's done" was made. The conductor cannot suppress
// this — that is the point of the host saying it.
function reportPrototypeIssues(s) {
  const hard = s.protoIssues || [];
  if (!hard.length) return;
  const byKind = {};
  for (const f of hard) (byKind[f.kind] ||= []).push(f);
  const lines = Object.entries(byKind).map(([kind, fs]) => {
    const roles = [...new Set(fs.map((x) => x.role))].join(", ");
    const what = kind === "TEMPLATE_LEAK" ? "template placeholders are showing as text on the page"
      : kind === "SCRIPT_SYNTAX" ? "a script does not parse, so that role renders dead"
      : kind === "PAGES_CLOBBER" || kind === "PAGES_DROPPED" ? "one role's pages overwrite another's"
      : fs[0].msg;
    return `• ${what} — ${roles}`;
  });
  console.warn(`  [${s.slug}] prototype verify: ${hard.length} problem(s)\n${hard.map((f) => `      [${f.role}] ${f.kind}: ${f.msg}`).join("\n")}`);
  appendAgent(s, "Verify", `The prototype has ${hard.length === 1 ? "a problem" : `${hard.length} problems`} I can see in the assembled page:\n${lines.join("\n")}\nAsk me to fix it and I'll re-render that part.`);
  emit(s, "agent", { name: "Verify", text: `Prototype: ${hard.length} problem(s) found in the assembled page.` });
  s.protoIssues = [];
}

// ── preview watcher ───────────────────────────────────────────────────────────────────────────────
// ── PROGRESS FROM ARTIFACTS, NOT FROM NARRATION ───────────────────────────────────────────────────
//
// The pane's timeline is filled by `<<KF:building prototype|…>>` markers, which means progress is
// something the conductor has to remember to describe. When it doesn't — and most of the time it
// doesn't — the pane says "Building the interface" for nine minutes and a person cannot tell a
// working build from a hung one. Same failure as every other guarantee that lived in a prompt.
//
// The host does not need to be told. It is already watching the parts directory, and the experience
// spec already says how many roles the app has. Built-over-expected is a fact on disk, updates on
// its own, and cannot be forgotten.
// HOW LONG THIS USUALLY TAKES. Now that every build writes a timeline, the honest answer is in the
// data rather than in a guess: the median of recent turns. "4 of 9 pages · usually about 6 min" is a
// different experience from a spinner, because it tells you whether to wait or come back.
//
// Cached for ten minutes and capped at the most recent runs — a progress line must never become a
// directory scan on every file event.
let typicalCache = { at: 0, sec: 0 };
function typicalBuildSec() {
  if (Date.now() - typicalCache.at < 10 * 60_000) return typicalCache.sec;
  typicalCache.at = Date.now();
  const durations = [];
  try {
    const dirs = readdirSync(RUNS, { withFileTypes: true }).filter((d) => d.isDirectory())
      .map((d) => ({ n: d.name, t: (() => { try { return statSync(join(RUNS, d.name)).mtimeMs; } catch { return 0; } })() }))
      .sort((a, b) => b.t - a.t).slice(0, 40);
    for (const d of dirs) {
      const f = join(RUNS, d.n, "timeline.jsonl");
      if (!existsSync(f)) continue;
      let open = null;
      for (const line of readFileSync(f, "utf8").split("\n")) {
        if (!line.trim()) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (r.actor !== "host" || r.step !== "turn") continue;
        if (r.ev === "start") open = Date.parse(r.ts);
        else if (r.ev === "end" && open) { const sec = (Date.parse(r.ts) - open) / 1000; if (sec > 20 && sec < 3 * 3600) durations.push(sec); open = null; }
      }
    }
  } catch { /* no history yet — the pane simply omits the estimate */ }
  if (durations.length < 3) return (typicalCache.sec = 0);   // too few to be a number worth showing
  durations.sort((a, b) => a - b);
  return (typicalCache.sec = Math.round(durations[Math.floor(durations.length / 2)]));
}

function partsProgress(s) {
  try {
    const dir = runDir(s);
    const partsDir = join(dir, "prototype", "parts");
    if (!existsSync(partsDir)) return null;
    const parts = readdirSync(partsDir).filter((f) => /^role-.*\.html$/.test(f));
    let expected = 0, latest = null;
    try {
      const spec = JSON.parse(readFileSync(join(dir, "prototype", "experience-spec.json"), "utf8"));
      const roles = spec.roles || spec.experience?.roles || [];
      expected = Array.isArray(roles) ? roles.length : 0;
    } catch { /* the spec may not exist yet — built-so-far is still worth saying */ }
    if (parts.length) {
      // newest by mtime: the one that just landed is the one worth naming
      const newest = parts.map((f) => ({ f, t: statSync(join(partsDir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
      latest = newest.f.replace(/^role-|\.html$/g, "");
    }
    const shell = existsSync(join(partsDir, "shell.html"));
    const spec = existsSync(join(dir, "app-spec.json"));
    // The first minutes are the ones with nothing to show and the most doubt about whether anything
    // is happening. The spec landing and the shell landing are real, dated events — use them.
    const stage = parts.length ? "pages" : shell ? "shell" : spec ? "spec" : "starting";
    return { built: parts.length, expected, latest, shell, spec, stage,
             elapsedSec: s.turnStartedAt ? Math.round((Date.now() - s.turnStartedAt) / 1000) : 0,
             typicalSec: typicalBuildSec() };
  } catch { return null; }
}

function emitProgress(s) {
  const p = partsProgress(s);
  if (!p || p.stage === "starting") return;
  emit(s, "artifact-progress", { cls: "prototype", ...p });
}

// HOST-OWNED STAGE BOARD. board() builds its rows from ARTIFACT TRUTH (did each stage's file land),
// enriched by the ledger when there is one — but the server only ever emitted it inside the
// progress.jsonl watch branch, so when the conductor skips writing progress.jsonl (routine in express)
// the board never appeared, even though the artifacts to render it were on disk. Emit it whenever a stage
// artifact lands too, so the board fills from what the watcher already sees — no model-written ledger
// required. Debounced; safe alongside the ledger branch (both call board(), which dedups by stage).
function emitHostBoard(s) {
  clearTimeout(s.hbT);
  s.hbT = setTimeout(() => {
    try { const bd = progressBoard(runDir(s)); if (bd && bd.rows?.length) emit(s, "agent-progress", { text: bd.text, rows: bd.rows }); }
    catch { /* the board is best-effort — never let it disturb a build */ }
  }, 250);
}

function watchRun(s) {
  if (s.runWatcher || s.streamPollT) return;
  // Degraded/test seam (Codex #4): force the polling fallback instead of fs.watch, so the EMFILE /
  // no-recursive-watch path can be exercised behaviorally (and turned on deliberately under known
  // descriptor pressure) rather than only when the OS happens to fail.
  if (process.env.KF_FORCE_STREAM_POLL === "1") return startStreamPoll(s);
  // Catch up before watching. Someone who opens the pane MID-BUILD has missed every write so far,
  // and the parts already on disk are exactly what they came to see.
  try {
    autoAssemble(s).then((did) => {
      if (!did) return;
      const f0 = resolvePreview(s);
      if (f0) emit(s, "preview", { path: s.preview || relative(REPO, f0), token: Date.now() });
    }).catch(() => { /* assembleRun never throws by contract; a rejection is still not fatal here */ });
    emitProgress(s);   // opening mid-build should say how far in it is, not just "building"
    emitHostBoard(s);  // …and show the stage board from whatever artifacts already landed
  } catch { /* nothing to catch up on */ }
  try {
    s.runWatcher = watch(runDir(s), { recursive: true }, (_e, name) => {
      const n = String(name || "").replace(/\\/g, "/");
      // Refresh the host-owned stage board whenever a STAGE artifact lands — board() reads artifact truth,
      // so the board shows progress even when the conductor never wrote progress.jsonl (express). Runs in
      // ADDITION to the branches below; both feed agent-progress and board() dedups by stage.
      if (/(^|\/)(app-spec\.json|automations\.json|decisions\.md|experience-spec\.json|review\.html|blueprint\.html|index\.html|proto\.json)$/.test(n) || /prototype\/(parts\/[^/]+\.html|pages\/.+\.jsx)$/.test(n)) emitHostBoard(s);
      // a prototype artifact landed → re-assemble (MEDIUM-AWARE: html parts, or react pages/proto.json)
      // and let the preview event carry it to the pane. assemblePrototype dispatches on the run's medium.
      if (/(^|\/)prototype\/(parts\/[^/]+\.html|pages\/.+\.jsx|proto\.json)$/.test(n)) {
        clearTimeout(s.asmT);
        s.asmT = setTimeout(async () => {
          emitProgress(s);                     // "4 of 9" — from the directory, not from a marker
          if (!(await autoAssemble(s))) return;
          const f = resolvePreview(s);
          if (f) emit(s, "preview", { path: s.preview || relative(REPO, f), token: Date.now() });
        }, 400);   // parts are written in bursts; one splice per burst
        return;
      }
      // THE TEAM, TALKING. progress.jsonl is the agent-wise ledger (engine/progress.mjs): every
      // stage start/finish and every hand-off note an agent writes. New lines become the chat's
      // existing agent bubbles — the reader literally watches the Business Analyst hand the map to
      // the Solution Architect — and the whole board rides along for any pane that wants to render
      // state rather than prose. Personas, not slugs: this line is read by the person paying for
      // the build, not by the pipeline's author.
      if (/(^|\/)progress\.jsonl$/.test(n)) {
        clearTimeout(s.pgT);
        s.pgT = setTimeout(() => {
          try {
            const rows = readLedger(runDir(s));
            for (const r of rows.slice(s.progressSeen || 0)) {
              const p = personaOf(r.agent);
              const text = r.ev === "start" ? `${(r.detail || p.doing)}…`
                : r.ev === "done" ? (r.detail || p.did)
                : r.ev === "fail" ? `hit a problem${r.detail ? `: ${r.detail}` : ""}`
                : (r.detail || "");
              if (text) { appendAgent(s, p.who, text); emit(s, "agent", { name: p.who, text }); }
            }
            s.progressSeen = rows.length; persist(s);
            // text is the SAME human rendering the CLI board shows — one writer, two screens. rows
            // ride along for any future pane that wants to draw its own tree.
            const bd = progressBoard(runDir(s));
            emit(s, "agent-progress", { text: bd.text, rows: bd.rows });
          } catch { /* a torn ledger line — the next write retries the render */ }
        }, 250);
        return;
      }
      // the spec and the shell are the first two things that exist; both are worth saying out loud
      if (/(^|\/)(app-spec\.json|prototype\/parts\/shell\.html)$/.test(n)) {
        clearTimeout(s.msT);
        s.msT = setTimeout(() => emitProgress(s), 300);
        return;
      }
      // the conductor's own assemble — the pane still has to hear about it before the marker
      if (/(^|\/)prototype\/index\.html$/.test(n)) {
        clearTimeout(s.pvT);
        s.pvT = setTimeout(() => {
          const f = resolvePreview(s);
          if (f) emit(s, "preview", { path: s.preview || relative(REPO, f), token: Date.now() });
        }, 250);
        return;
      }
      if (!/^(review|blueprint)\.html$/.test(n)) return;
      clearTimeout(s.bpT);
      s.bpT = setTimeout(() => {
        // no `!== seen` guard — a re-write to the SAME path is exactly the case that must re-notify
        // (a second review.html render), otherwise the client's version list goes stale after turn 1.
        // Versioning itself happens once per completed TURN (see turn-end), not on every rebuild this
        // watcher observes — a build's own partial/incremental re-renders aren't separate versions.
        const rel = resolveBlueprint(s);
        if (rel) emit(s, "blueprint", { path: rel, token: Date.now() });
      }, 300);
    });
    s.runWatcher.unref?.();   // watchers must never hold the process open — the server does that
    // An fs.watch error (a removed dir, an EMFILE) emits 'error'; UNHANDLED it becomes a fatal process
    // error (#10). Handle it by dropping the watcher AND starting the polling fallback so the express
    // shell-first stream keeps working under descriptor pressure (Codex continuation #4), instead of
    // silently degrading to "nothing until a model marker".
    s.runWatcher.on?.("error", () => { try { s.runWatcher?.close(); } catch {} s.runWatcher = null; startStreamPoll(s); });
  } catch { startStreamPoll(s); /* recursive watch unsupported / EMFILE — poll instead of going dark (#4) */ }
}

// Producer-events would be ideal; until then, when fs.watch is unavailable (EMFILE, or a filesystem with
// no recursive watch) this keeps the express guarantee alive by POLLING the run's prototype parts while
// the turn is busy — re-assembling through the same boundary and emitting the same preview/progress the
// watcher would (Codex continuation #4). Bounded: it only runs during a build and stops the moment the
// turn ends. A degraded-streaming warning is surfaced rather than silently disabling the stream.
function startStreamPoll(s) {
  if (s.streamPollT) return;                                    // already polling
  s.streamDegraded = true;
  console.warn(`  [${s.slug}] fs.watch unavailable — streaming the prototype via a bounded polling fallback (degraded)`);
  let lastParts = 0;
  s.streamPollT = setInterval(() => {
    // Alive while a VIEWER is attached, not merely while busy (Codex #4). Keying on s.busy meant that when
    // the fallback started at SSE-open (session idle), its first tick cleared itself before the build ever
    // began — so a build started >1s after opening the chat streamed nothing. A viewer is watching, so poll
    // for them; teardown (no viewers) stops it.
    if (!s.clients.size) { clearInterval(s.streamPollT); s.streamPollT = null; return; }
    try {
      // MEDIUM-AWARE: newest of the html parts (parts/*.html) OR the react inputs (pages/*.jsx + proto.json),
      // so a react build streams on the poll too, not only html parts. assemblePrototype dispatches on medium.
      const proto = join(runDir(s), "prototype");
      let count = 0, newest = 0;
      const scan = (dir, ext) => { try { for (const f of readdirSync(dir)) if (f.endsWith(ext)) { count++; const m = statSync(join(dir, f)).mtimeMs; if (m > newest) newest = m; } } catch {} };
      scan(join(proto, "parts"), ".html");
      scan(join(proto, "pages"), ".jsx");
      try { const m = statSync(join(proto, "proto.json")).mtimeMs; count++; if (m > newest) newest = m; } catch {}
      if (count && newest !== lastParts) {
        lastParts = newest;
        emitProgress(s);
        autoAssemble(s).then((did) => { if (!did) return; const f = resolvePreview(s); if (f) emit(s, "preview", { path: s.preview || relative(REPO, f), token: Date.now() }); }).catch(() => {});
      }
    } catch { /* keep polling — a transient read error is not fatal to the stream */ }
  }, 1000);
  s.streamPollT.unref?.();
}

// Close a session's fs watchers and forget them, so a later open re-creates them cleanly (#10). Called
// on delete and when the last viewer of an IDLE session disconnects — descriptors are not held for a
// session nobody is watching and no build needs.
function closeWatchers(s) {
  try { s.runWatcher?.close(); } catch {}
  try { s.watcher?.close(); } catch {}
  try { s.runWatcher?.removeAllListeners?.(); s.watcher?.removeAllListeners?.(); } catch {}
  s.runWatcher = null; s.watcher = null; s.watchDir = null;
  // Also clear every pending watcher DEBOUNCE timer (Codex round-4 #5). A timer that already fired its
  // clearTimeout/setTimeout dance can otherwise still be pending after the watchers are gone and
  // re-emit/re-assemble AFTER terminal state. Closing the watchers stops new events; this stops the
  // in-flight ones.
  for (const k of ["asmT", "pgT", "msT", "pvT", "bpT", "reloadT", "hbT"]) { try { clearTimeout(s[k]); } catch {} s[k] = null; }
  try { clearInterval(s.streamPollT); } catch {} s.streamPollT = null;   // #4: the polling fallback is a watcher too
}

function watchPreview(s) {
  const file = resolvePreview(s);
  if (!file) return;
  const dir = dirname(file);
  if (s.watcher && s.watchDir === dir) return;
  if (s.watcher) { try { s.watcher.close(); } catch {} }
  s.watchDir = dir;
  try {
    s.watcher = watch(dir, { recursive: true }, (_e, name) => {
      if (name && !/index\.html$/.test(String(name))) return; // parts churn constantly; only the assembled file matters
      clearTimeout(s.reloadT);
      s.reloadT = setTimeout(() => {
        emit(s, "preview", { path: s.preview || relative(REPO, file), token: Date.now() });
      }, 250);
    });
    s.watcher.unref?.();      // watchers must never hold the process open — the server does that
    s.watcher.on?.("error", () => { try { s.watcher?.close(); } catch {} s.watcher = null; s.watchDir = null; });   // #10: never let a watch error crash the process
  } catch { /* watch is a nicety — the explicit marker still reloads */ }
}

// ── conductor wiring ──────────────────────────────────────────────────────────────────────────────
// The three host verbs session-core needs: publish an event, write the snapshot, and (re)attach the
// preview watcher. In THIS host they are the in-process SSE fan-out and the local disk; a build
// running elsewhere supplies an event-log append instead, and gets identical marker semantics.
const hostCtx = { emit, persist, onPreview: watchPreview };

/**
 * EVERY consequence of a builder event, keyed by event name — one copy, two transports. The local
 * Conductor registers these as listeners; a session pod's worker POSTs the same events over HTTP and
 * the /worker route dispatches into the same map. If the two paths ever diverge, remote builds stop
 * matching local ones in exactly the ways nobody tests — so there is only one map.
 */
function turnSinks(s) {
  return {
    "claude-session": (sid) => { s.claudeSessionId = sid; persist(s); },
    // Process lifecycle (spawned/resumed, ready, model name, raw stderr) is implementation detail — it
    // never reaches the browser. Server console only, for whoever is operating this instance.
    spawn: (d) => console.log(`  [${s.slug}] ${d && d.resumed ? "resumed" : "started"}`),
    ready: (d) => console.log(`  [${s.slug}] ready · ${(d && d.model) || "?"}`),
    stderr: (line) => console.warn(`  [${s.slug}] ${String(line).slice(0, 400)}`),
    // A paragraph break where the builder stopped to do something. Live, the UI got that break for free
    // by starting a new bubble after each activity card; a RELOAD replays s.messages, which has no tool
    // events in it, so every separate thought ran together. Recording the break in the stored prose
    // makes the reloaded transcript match what was watched.
    text: (t) => {
      if (s.brokeForWork && String(t).trim()) { appendAssistant(s, "\n\n"); s.brokeForWork = false; }
      appendAssistant(s, t);
      emit(s, "text", { text: t });
    },
    agent: (a) => { appendAgent(s, a.name, a.text); emit(s, "agent", a);
      // ALWAYS-RECORDED instance layer: first words from a subagent = it is running. Deterministic —
      // written by the host from the stream, not by an instruction someone can skip. No stage: the
      // conductor's own marks carry stage attribution; these rows are the who-is-running-now truth.
      if (a.id && !(s.agentStarts ||= new Map()).has(a.id)) {
        s.agentStarts.set(a.id, Date.now());
        progressMark(runDir(s), { agent: a.name, ev: "start", id: String(a.id).slice(-6) });
      } },
    "agent-done": (a) => { emit(s, "agent-done", a);
      const t0 = s.agentStarts?.get(a.id);
      if (t0) { s.agentStarts.delete(a.id);
        progressMark(runDir(s), { agent: a.name, ev: a.error ? "fail" : "done", id: String(a.id).slice(-6), ms: Date.now() - t0 });
      } },
    thinking: () => { if (!s.thinkingShown) { s.thinkingShown = true; emit(s, "status", { text: "thinking…" }); } },
    tool: (t) => { s.brokeForWork = true; emit(s, "tool", t); },
    "tool-result": (r) => { if (r.error) emit(s, "tool-error", r); },
    marker: (m) => {
      // Phase boundaries are the only per-stage timing an express build has: one line each, and a
      // spec→shell→build→assemble breakdown falls out of the file afterwards.
      if (m?.kind === "phase") traceRun(s, { step: "phase", ev: "start", name: String(m.value || "").split("|")[0].trim() });
      return core.onMarker(s, m, hostCtx);
    },
    queued: (d) => emit(s, "status", { text: `queued (${(d && d.pending) || 1})` }),
    error: (msg) => emit(s, "error", { text: typeof msg === "string" ? msg : msg?.text || "error" }),
    fatal: (msg) => { s.busy = false; s.generating = false; releaseTurn(s); recordVerdict(s, false, "fatal"); traceRun(s, { step: "turn", ev: "end", ok: false, error: "fatal" }); saveTimeline(s); persist(s); emit(s, "error", { text: String(msg) }); emit(s, "turn-end", { ok: false, error: "fatal" }); if (!s.clients.size) closeWatchers(s); drainQueue(s); },
    // Version history is per completed TURN (see session-core's finishTurn); then drain — whatever was
    // addressed to the builder while it was busy stops waiting now.
    "turn-end": async (r) => {
      // Do NOT releaseTurn() here (Codex #1). The DB turn lease + job — the CROSS-REPLICA exclusion
      // boundary — must be HELD through verify → publish → verdict persistence → the terminal event, or a
      // stale replica could claim a second turn over this same run while the first version is still being
      // read/uploaded (the mixed-artifact race). The lease is released only in the final cleanup below,
      // just before drainQueue starts the next turn. (Local s.busy is not a cross-replica guarantee.)
      traceRun(s, { step: "turn", ev: "end", ok: !!(r && r.ok), cost: r?.cost ?? null }); saveTimeline(s);
      // FINAL ASSEMBLY before verify/snapshot: a page written right before turn-end — especially in react
      // mode, where the build is one-shot rather than a per-part splice — must be reflected in what
      // checkPrototype reads and publishBuild freezes. assemblePrototype dispatches on the run's medium;
      // build-once caching makes this a no-op when nothing changed, and a failed final build leaves the
      // last good prototype in place (proto-react stages then promotes, never clobbers on failure).
      // #3: CAPTURE the terminal result. assembleReactRun records migration status "failed" on a build OR
      // runtime-smoke failure (keeping the last good prototype). Either way, this turn's requested change did
      // NOT produce a publishable prototype, so it must not freeze a version or report green off a stale
      // streamed index.html. A thrown terminal build is the same signal.
      if (r && r.ok) { try { await assemblePrototype(runDir(s), { final: true }); } catch { /* build error → migration status reflects it */ } }   // #5: terminal build enforces the runtime smoke (Chrome-gated)
      const reactFailed = !!(r && r.ok) && (() => { try { return readMigration(runDir(s))?.reactMigrationStatus === "failed"; } catch { return false; } })();
      // RR-1: undo a migration that was begun but never produced a react prototype (a Q&A/blueprint-only
      // turn) — a successful build is "done" and a failed one is "failed"; only a stuck "building" reverts.
      try { revertUnfinishedMigration(runDir(s)); } catch { /* nothing to revert */ }
      // VERIFY BEFORE READY, SNAPSHOT AND VERSION (#4). checkPrototype(final) now also catches raw
      // (uncompiled) Tailwind (#2). A turn that ran fine but produced a prototype with hard errors must
      // NOT freeze a version, must NOT snapshot it, and must NOT report a clean turn-end: the failed
      // candidate stays visible as the in-progress preview and the chat is told what to fix.
      // TRANSACTIONAL FINALIZATION (#2/#3/#4): verify → snapshot → publish, then emit ONE final result
      // derived from all three. A turn is clean-ready only when it ran ok, its prototype verified, AND
      // the durable version was published (or there is no publisher at all — a local/dev run).
      const hard = (r && r.ok) ? (checkPrototype(s, { final: true }) || []) : [];
      // #3: a failed terminal React assembly (build or runtime smoke) is a HARD finding — pushed into the ONE
      // authoritative list that feeds BOTH the publish gate AND finalizeVerdict. (Previously reactFailed
      // blocked publish via a separate protoOk the verdict never saw, so the terminal event still said ok.)
      if (reactFailed) {
        hard.push({ role: "(react)", level: "error", kind: "REACT_ASSEMBLY_FAILED", msg: "the React build or its runtime check failed — kept the last working prototype; nothing was published this turn" });
        emit(s, "error", { text: "The React build (or its runtime check) failed — kept the last working prototype and did not publish this change. Tell me what to fix." });
      }
      const protoOk = hard.length === 0;
      // PUBLISH WHILE STILL BUSY (Codex round-5 finalization race). finishTurn() clears s.busy, so if it
      // ran BEFORE the awaited publish, a message arriving during the (seconds-long) durable upload would
      // pass the `if (s.busy) return` guard in drainQueue and spawn a SECOND conductor over this same run
      // directory mid-publish. Do the durable publish first, with the turn still marked busy; only then
      // does finishTurn clear busy and free the queue.
      let pub = { ok: true };
      if (r && r.ok && protoOk) {
        pub = (await publishBuild(s)) || { ok: true };  // AWAITED — the version write completes before busy clears
      } else if (r && r.ok && !protoOk) {
        reportPrototypeIssues(s);                        // say what's wrong; no version, no clean-ready
      }
      // finishTurn does its turn bookkeeping always (and clears busy); its version SNAPSHOT runs only on ok
      // — pass ok:false when the prototype failed so nothing broken is frozen as an immutable local version.
      // #1: capture the completed turn id BEFORE finishTurn clears s.turnId — recordUsage needs it as the
      // cost ledger's idempotency key, and it runs AFTER finishTurn.
      const completedTurnId = s.turnId;
      core.finishTurn(s, protoOk ? r : { ...(r || {}), ok: false }, hostCtx);
      drainMemory(s); recordUsage(s, r, completedTurnId); saveTranscript(s).catch(() => {});
      const verdict = finalizeVerdict({ turnOk: r && r.ok, hard, pub });
      // Record + PERSIST the authoritative outcome BEFORE emitting turn-end (round-5 race). A reload that
      // arrives between the event and the persist would otherwise read no verdict and could show readiness
      // for a failed/stopped turn. On a clean, published build, pin the ready card to the version that
      // landed; an "unchanged" clean turn keeps the prior readyVersionId.
      recordVerdict(s, verdict.ok, verdict.blocked[0]);
      if (verdict.ok && r && r.ok && protoOk) { const vid = pub?.version?.id ?? pub?.version?.seq; if (vid != null) s.readyVersionId = vid; }
      persist(s);   // writes local disk synchronously (durable for reload) + debounces the DB blob — deliberately NOT blocking the turn-end on a DB round-trip (see review_feedback: strict terminal persistence declined for a single-instance deployment)
      // A durable-publication failure (NOT the intentional local "no publisher") means the build finished
      // but nothing was stored — do not announce a completed build over it.
      if (verdict.publishFailed) emit(s, "agent", { name: "Verify", text: `The build finished but couldn't be saved as a version (${pub.reason || "publish failed"}). It's on screen as a live preview — send another message to try storing it again.` });
      // turnId rides in the persisted turn-end event (#2): the cost backfill keys on `turn:<turnId>`, the
      // SAME key the live booking used, so a turn already booked live is not re-counted from its event.
      emit(s, "turn-end", { ...(verdict.ok ? r : { ...(r || {}), ok: false, ...(verdict.blocked.length ? { blocked: verdict.blocked } : {}) }), turnId: completedTurnId });
      // Dispose this run's Tailwind compiler so the NEXT turn recompiles from scratch — no utilities
      // accumulated from an earlier turn, deterministic output (#6). Keyed by the run dir, the same label
      // assembleRun used.
      try { disposePrecompileCache(runDir(s)); } catch { /* cache disposal must never fail a turn */ }
      // #11: a viewer who disconnected DURING the build left its watchers open (the disconnect handler
      // only closes them for an already-idle session). The build is over now — if nobody is watching,
      // release them here too.
      if (!s.clients.size) closeWatchers(s);
      // FINAL cleanup: only now — after publish, verdict persistence, and the terminal event — is the turn
      // truly over, so release the distributed lease + complete the job (#1). drainQueue then starts the
      // next turn, which re-claims the freed lease.
      releaseTurn(s);
      drainQueue(s);
    },
    // A crash never emits "result" — without this the composer is stuck on "building…" forever.
    exit: (d) => {
      if (!s.busy) return;
      s.busy = false; s.generating = false; s.thinkingShown = false; closeAssistant(s); releaseTurn(s);
      recordVerdict(s, false, (d && d.signal) === "SIGTERM" ? "stopped" : "exited");   // a reload after a crash must not read as ready
      // A crash is the case the whole thing exists for — record how it ended, then store it.
      traceRun(s, { step: "turn", ev: "end", ok: false, error: (d && d.signal) === "SIGTERM" ? "stopped" : "exited" });
      saveTimeline(s);
      persist(s);
      emit(s, "turn-end", { ok: false, error: (d && d.signal) === "SIGTERM" ? "stopped" : "exited" });
      if (!s.clients.size) closeWatchers(s);   // #5: an unexpected exit after the last viewer left must free watchers/timers too
      drainQueue(s);
    },
  };
}

/**
 * The conductor process for a session, carrying the project's Kissflow credentials in its OWN
 * environment.
 *
 * The creds have to travel per session, not per instance: one inline server runs many sessions, so a
 * shared `.kf-env` at the repo root would hand every build whichever app linked last. The child's
 * environment is the isolated channel — every script the conductor runs inherits it, which is all the
 * pipeline needs (`.kf-env` is the pod's equivalent, and a pod has one session to itself).
 *
 * This is where the credentials were being lost. `credsFor` was wired into `podStartTurn` only, and
 * production runs the INLINE executor — so the project's linked dev environment reached a pod build
 * and never an inline one. Every hosted build reported "no KISSFLOW_SUBDOMAIN/ACCOUNT_ID/API_KEY/
 * API_SECRET in the environment, and no .kf-env on disk" no matter what Settings said was linked,
 * which is exactly what it looks like when the link is fine and nothing carries it (VaultOps,
 * 2026-08-02 — asked four times, and the answer was true every time).
 */
function conductorFor(s, kfCreds) {
  // A running child's environment cannot be changed, and killing it here would race: stop() only
  // nulls the handle on the async exit, so an immediate send would write to a dying stdin. Update the
  // env instead — the next spawn picks it up, and an instance restart (every deploy) forces one.
  if (s.conductor) { s.conductor.env = { ...CHILD_ENV, ...(kfCreds || {}) }; return s.conductor; }
  const c = new Conductor({
    id: s.id, repoRoot: REPO, systemPrompt: join(HERE, "CONDUCTOR.md"),
    pluginDir: PLUGIN_DIR, model: MODEL || undefined, claudeSessionId: s.claudeSessionId || undefined,
    // Per-RUN memory inbox. Without it engine/memory.mjs appends MEMORY-LOCAL.md relative to cwd,
    // and cwd is the repo root: one shared file for every app, on a disk a redeploy wipes.
    env: { ...CHILD_ENV, ...(kfCreds || {}), KF_MEMORY_INBOX: join(runDir(s), "memory-inbox.jsonl") },
  });
  for (const [ev, fn] of Object.entries(turnSinks(s))) c.on(ev, fn);
  s.conductor = c;
  return c;
}

// ── posting vs invoking ───────────────────────────────────────────────────────────────────────────
// Posting a message costs a row and a broadcast. Invoking the builder costs the build lock, a woken
// agent, money and twenty minutes. These used to be one indivisible step, which was fine while a
// session was one person's private build and is not fine in a room: two colleagues working out whether
// approvals should be a matrix or branch conditions must be able to think out loud without triggering
// a build, while every word of it still reaches the builder as context.
//
// See DESIGN-shared-chat.md. The ladder below is rungs 1–3; rung 4 (ask a classifier when genuinely
// unsure) is deliberately not here yet — it is the only rung that can be wrong, and silence is the
// cheaper mistake until the rest is proven.
const MENTION = /(^|[^\w@])@(builder|ai|kf)\b/i;
const SIDE_CONVERSATION_MS = 90_000;

/**
 * `explicit` is the composer's own signal — the client saying "this is for the builder" (or "this is a
 * comment") rather than the server inferring it from prose. It wins outright when present: a person who
 * chose is better evidence than any rule.
 */
function decideInvoke(s, text, me, explicit) {
  if (explicit === true) return { invoke: true, reason: "composer" };
  if (explicit === false) return { invoke: false, reason: "comment" };
  if (MENTION.test(text)) return { invoke: true, reason: "mention" };
  // Addressed to a PERSON: "@vivek can you check this" names someone who is not the builder.
  // That is a conversation between people even when nobody else has spoken recently — the
  // builder listens and stays out of it (rung 3's recency test can't catch the first such message).
  if (/(^|\s)@[\w.-]+/.test(text)) return { invoke: false, reason: "side-conversation" };

  // Rung 3 — somebody else has spoken recently and this message names nobody: an exchange between
  // people, not an instruction. Listen, keep it, stay out of it.
  const cutoff = Date.now() - SIDE_CONVERSATION_MS;
  const othersRecently = s.messages.some((m) =>
    m.role === "user" && m.ts >= cutoff && m.author?.sub && m.author.sub !== me?.sub);
  if (othersRecently) return { invoke: false, reason: "side-conversation" };

  // Rung 2 — nobody else is talking, so you are talking to it. This rung is what keeps a lone user
  // from having to @-mention anything to get a build, which is still the common case.
  return { invoke: true, reason: "sole-speaker" };
}

// email travels with the event so a browser can tell "me" from "someone else" — every member of an
// app already sees the others in its member list, so this exposes nothing new.
const authorTag = (a) => (a ? { sub: a.sub, name: a.name || a.email || null, email: a.email || null } : null);

/**
 * Everything a member says lands here. Always posted; invoked only if the ladder says so, and only if
 * the builder is free — an addressed message arriving mid-build is QUEUED VISIBLY rather than absorbed
 * into a hidden array, and picked up the moment the running turn ends.
 */
async function postMessage(s, text, me, explicit) {
  const d = decideInvoke(s, text, me, explicit);
  const first = !s.messages.some((m) => m.role === "user");
  appendUser(s, text, me, { addressed: d.invoke });
  if (first && (!s.title || s.title === "New app")) s.title = titleFrom(text);
  const by = authorTag(me);
  persist(s);
  emit(s, "user", { text, author: by, addressed: d.invoke });

  if (!d.invoke) {
    // Visible silence. A decision not to answer that leaves nothing on screen is worse than barging
    // in: the person who WAS waiting has no way to tell the difference from a hang.
    emit(s, "listening", { reason: d.reason, author: by });
    return { posted: true, invoked: false, queued: false, reason: d.reason };
  }
  if (s.busy) {
    emit(s, "queued", { author: by, text, reason: d.reason });
    return { posted: true, invoked: false, queued: true, reason: d.reason };
  }
  // Enqueue and return. The build starts when a worker has a slot — which may be this instance in a
  // millisecond, or another one. Without a queue the reply latency of a POST was the queueing policy.
  if (DB?.enqueueTurn) {
    reconcileJob(s);   // free THIS session's stale job before the userLoad count below reads it
    // Say no BEFORE the work is booked, and say it in the chat where the person is looking — a
    // request that silently never becomes a build is indistinguishable from a broken product.
    if (DB.userLoad && me?.sub) {
      const load = await DB.userLoad(me.sub, 60).catch(() => null);
      if (load && load.live >= MAX_CONCURRENT_BUILDS) {
        emit(s, "listening", { reason: "at-build-limit", author: by });
        appendAgent(s, "Builder", `You already have ${load.live} builds running. I'll pick this up as soon as one finishes — or stop one and I'll start straight away.`);
        return { posted: true, invoked: false, queued: true, reason: "at-build-limit" };
      }
      if (load && load.recent >= MAX_BUILDS_PER_MIN) {
        emit(s, "listening", { reason: "rate-limited", author: by });
        appendAgent(s, "Builder", "That's a lot of builds in a very short time, so I've paused. Try again in a minute.");
        return { posted: true, invoked: false, queued: false, reason: "rate-limited" };
      }
    }
    // Same barrier as the drain path (Codex round-9): a message posted right after turn-end must wait for
    // the previous turn's completion to commit before enqueueing, or the live-job index rejects it and the
    // "queued" we report below would be a lie — no job, nothing to run it. enqueueSuccessor also re-runs
    // reconcileJob (idempotent after the one above).
    const id = await enqueueSuccessor(s, d.reason, me?.sub);
    if (id === null) { emit(s, "queued", { author: by, text, reason: d.reason }); return { posted: true, invoked: false, queued: true, reason: d.reason }; }
    await pump();
    return { posted: true, invoked: true, queued: false, reason: d.reason };
  }
  await invoke(s);
  return { posted: true, invoked: true, queued: false, reason: d.reason };
}

/**
 * Build the turn out of everything unconsumed — not just the message that triggered it. Two members
 * who both address the builder within the same idle moment get ONE turn with two instructions, and a
 * side conversation that happened while it was quiet arrives as the context it always was.
 */
function turnPrompt(s, turnId) {
  const first = !s.messages.some((m) => m.role === "user" && m.consumedBy);
  const pending = s.messages.filter((m) => m.role === "user" && !m.consumedBy);
  const asks = pending.filter((m) => m.addressed);
  const overheard = pending.filter((m) => !m.addressed);
  const lines = [core.sessionBlock(s, first, asks[asks.length - 1]?.author)];

  if (overheard.length) {
    lines.push("SINCE YOUR LAST TURN (you were not addressed — context only)");
    for (const m of overheard) lines.push(`  ${speakerName(m.author)}: ${m.text}`);
  }
  if (asks.length > 1) {
    lines.push("NOW, these members are asking you — handle both:");
    for (const m of asks) lines.push(`  ${speakerName(m.author)}: ${m.text}`);
  } else if (asks.length === 1) {
    lines.push(`NOW, ${speakerName(asks[0].author)} asks you:`);
    lines.push(asks[0].text);
  }
  for (const m of pending) m.consumedBy = turnId;
  return lines.join("\n");
}

// Where a turn actually runs. `inline` (default) spawns the Conductor in this process — local dev,
// tests, and today's production. `pod` hands the turn to a per-session gVisor pod on kf-builders: the
// pod's worker long-polls /worker/:id/turn, runs the SAME driver.mjs against the prompt, and POSTs
// every event back into turnSinks — so a remote build is byte-identical to a local one in everything
// but where the process lives. Pull-based on purpose: the pod dials out (NAT), the control plane never
// needs a route INTO the cluster, and a pod that dies simply stops polling.
const EXECUTOR = process.env.KF_CHAT_EXECUTOR || "inline";

async function podStartTurn(s, prompt) {
  const { ensureSessionPod } = await import("./k8s.mjs");
  if (!s.workerToken) { s.workerToken = randomUUID(); persist(s); }
  // the project's linked dev environment rides with EVERY turn — freshly resolved, so re-linking or
  // rotating keys in Settings takes effect on the next message, not the next pod
  let kfCreds = null;
  if (credsFor && s.projectId) { try { kfCreds = await credsFor(s.projectId); } catch { /* build proceeds without */ } }
  // uploaded specs live on THIS host's disk; the pod pulls them onto its own before the turn runs
  const upDir = join(runDir(s), "uploads");
  const files = existsSync(upDir) ? readdirSync(upDir).map((f) => `runs/${s.slug}/uploads/${f}`) : [];
  // Codex #2: the per-run medium decision (decideTurnMedium, just above in invoke()) is written to
  // prototype/migration.json on THIS host — but the pod builds in a SEPARATE workspace and only receives
  // turn.files. Ship the migration state with the turn so the pod's assembler resolves the SAME medium the
  // conductor was told to build; without it the first legacy-HTML→React migration streams (and ships) HTML.
  const migRel = `runs/${s.slug}/prototype/migration.json`;
  if (existsSync(join(REPO, migRel))) files.push(migRel);
  (s.podTurns ||= []).push({ turnId: s.turnId, prompt, claudeSessionId: s.claudeSessionId || null, env: { ...CHILD_ENV, ...(kfCreds || {}) }, files });
  // wake a parked long-poll, if the worker is already waiting
  const w = s.podWaiter; s.podWaiter = null;
  if (w) { clearTimeout(w.t); w.resolve(); }
  try { await ensureSessionPod({ id: s.id, slug: s.slug, token: s.workerToken }); }
  catch (e) {
    console.warn(`  [${s.slug}] pod: ${e.message}`);
    emit(s, "error", { text: "could not start the build environment — falling back to the local builder" });
    s.podTurns.length = 0;
    conductorFor(s).send(prompt);
  }
}

// ── Stage 1 — the ONE Executor interface (V1-V2-CONTRACTS.md §Execution) ────────────────────────────
// Every turn runs through startTurn(); the implementations differ only in WHERE the Conductor runs, and
// cleanup() releases that session's workspace/pod. This is the single seam that replaces the scattered
// `EXECUTOR === "pod"` checks (invoke + the three cleanup sites below). The chat_jobs pool (pump /
// claimNextTurn) wraps ALL executors — a turn is enqueued, claimed, then handed to startTurn — so pooling
// is orthogonal to where the Conductor lives. Selection stays KF_CHAT_EXECUTOR (inline default forever).
const EXECUTORS = {
  // inline — Conductor in THIS process (local dev, tests, today's production). Nothing external to release.
  inline: {
    async startTurn(s, prompt) {
      // The project's linked dev env rides with the turn (resolved fresh); without it the inline builder —
      // what production runs — has no Kissflow credentials and cannot author.
      let kfCreds = null;
      if (credsFor && s.projectId) { try { kfCreds = await credsFor(s.projectId); } catch { /* build proceeds without */ } }
      // Restore the transcript BEFORE the Conductor is built (it decides then whether to pass --resume);
      // otherwise the CLI replays the turn on a cold session and the fan-out is paid for twice.
      if (s.claudeSessionId && !s.conductor) { try { await restoreTranscript(s); } catch { /* the replay path still covers it */ } }
      conductorFor(s, kfCreds).send(prompt);
    },
    async cleanup() { /* in-process — no external workspace to release */ },
  },
  // pod — Conductor on a per-session remote pod (full v1 lifecycle). The fastest scaling canary.
  pod: {
    async startTurn(s, prompt) { await podStartTurn(s, prompt); },
    async cleanup(s, reason) {
      const k8s = await import("./k8s.mjs");
      // stop = SIGTERM the running build (next turn recreates the pod; the disk stays); forget/shutdown =
      // the app is gone, so is its workspace disk.
      if (reason === "stop") { s.podTurns = []; await k8s.deleteSessionPod(s.id).catch(() => {}); }
      else await k8s.deleteSessionWorkspace(s.id).catch(() => {});
    },
  },
};
// worker — the pooled fleet. The pool (chat_jobs + pump, below) already runs the Conductor IN THIS process,
// so `worker` shares inline's lifecycle. A future out-of-process fleet (Cloud Run Jobs) would give it its
// own body, consuming chat_jobs and emitting the same event contract; the interface + selection are final
// now so only that body changes. Named so the seam exists before the fleet does.
EXECUTORS.worker = EXECUTORS.inline;
const executor = EXECUTORS[EXECUTOR] || EXECUTORS.inline;

async function invoke(s) {
  await ensureLoaded(s);          // a turn is built from the transcript; it must be the real one
  await refreshApiKey();
  const turnId = randomUUID();
  const prompt = turnPrompt(s, turnId);
  // Deliberately NOT resetting s.phase here: a follow-up ("fix this bug") is often ad-hoc and never
  // emits a new <<KF:phase>> marker, so clearing it on every turn left the strip blank indefinitely
  // after a real build finished — reads as "the status disappeared" on reload even though nothing broke.
  // The strip only moves when a genuine phase marker actually fires.
  // Claim FIRST. If another instance is already running this session's turn, this one must not
  // spawn a second conductor over the same run directory — it leaves the message unconsumed and the
  // owner picks it up when it drains. Losing the claim is normal, not an error.
  if (DB?.claimTurn) {
    let mine = false;
    try { mine = await DB.claimTurn(s.id, INSTANCE, turnId, LEASE_SEC); }
    catch (e) { mine = true; console.warn(`  [${s.slug}] turn lease unavailable (${e.message}) — proceeding`); }
    if (!mine) {
      for (const m of s.messages) if (m.consumedBy === turnId) m.consumedBy = null;
      console.log(`  [${s.slug}] another instance owns this turn — leaving it to them`);
      return;
    }
  }
  s.busy = true; s.turnId = turnId; s.turnStartedAt = Date.now(); s.turnAttempts = (s.turnAttempts || 0) + 1; s.status = null; s.prompt = null; s.prototypeExpected = false; // the message IS the answer; a fresh turn owes no prototype until a build marker says so (#6)
  persist(s);
  clearInterval(s.leaseT);
  s.leaseT = setInterval(() => { DB?.renewTurn?.(s.id, INSTANCE, LEASE_SEC).catch(() => {}); }, HEARTBEAT_MS);
  s.leaseT.unref?.();
  await restoreRun(s);   // a deploy may have wiped the disk since the last turn
  // RR-1: host-owned, durable medium decision for THIS turn (gated by KF_REACT_MIGRATION). For a legacy-
  // HTML run it begins the migration in prototype/migration.json so the conductor (which reads it) builds
  // react; a Q&A turn that never produces a react prototype is undone at turn-end (revertUnfinishedMigration).
  try { decideTurnMedium(runDir(s), { sourceVersion: s.readyVersionId }); } catch { /* leave the medium as-is */ }
  const lead = [...s.messages].reverse().find((m) => m.consumedBy === turnId && m.addressed);
  emit(s, "turn-start", { author: authorTag(lead?.author), turnId });
  traceRun(s, { step: "turn", ev: "start", turnId, attempt: s.turnAttempts || 1 });
  await executor.startTurn(s, prompt);   // Stage 1: inline runs the Conductor here; pod hands it to the cluster
}

/**
 * A turn just ended. Anything addressed to the builder while it was busy has been sitting in the
 * transcript marked unconsumed — pick it up now, or the person who sent it waits forever for a build
 * that was queued and never started.
 */
/**
 * A turn that was running when this service went down.
 *
 * v1 has always had the PIECES — the run tree is restored from storage, the conductor resumes the
 * CLI transcript by id — but nothing joined them up: hydrate() comes back not-busy and the user's
 * message is already stamped consumed, so neither the session nor drainQueue believed anything was
 * owed. The build just stopped, mid-sentence, and waited for a human to notice and send another
 * message. Every deploy did this silently; the one at 17:20 today did it to whoever was building.
 *
 * So the snapshot now carries the in-flight turnId, and at boot we hand its message back to the
 * queue that already knows how to start a turn. The conductor picks the transcript up with
 * --resume, so the work continues rather than restarting.
 *
 * Bounded, because a turn that crashes the instance would otherwise crash it again on every boot:
 * two attempts, then it is left for a person, and the chat is told why either way.
 */
const MAX_TURN_ATTEMPTS = 2;

// TURN OWNERSHIP ACROSS INSTANCES.
//
// Every instance loads every session, which was harmless while there was exactly one instance. Above
// that, two of them can decide to run a turn for the SAME session — two conductors writing the same
// run directory, two sets of parts, two publishes racing. Nothing in v1 prevented it; nothing had to.
//
// The lease settles it in the database, which is the only place the race exists. An instance claims
// before it spawns anything, renews while it works, and releases at turn end. A crashed holder stops
// renewing and the lease simply expires, which is also what makes the boot-time recovery safe: it
// only reclaims a turn nobody currently owns.
const INSTANCE = `i-${randomUUID().slice(0, 8)}`;

// ── THE WORKER POOL (v2's shape, in v1's process) ─────────────────────────────────────────────────
//
// A turn used to be a function call on the request that posted the message: the instance that
// received it ran the build, however many it was already running. Nothing bounded that, so one
// instance accepting 250 concurrent sessions would spawn 250 conductors on two cores and take
// itself down — and with a lease in place, hand them all to the next instance to do the same.
//
// Now a turn is a JOB. Posting enqueues and returns; a worker claims one only when it has a free
// slot; a worker that dies stops renewing and the job goes back on the queue rather than dying with
// the instance. Three properties, and the third is the one v1 never had at any scale.
//
// SLOTS is the real capacity of the box, not a guess about traffic: a build is a `claude` subprocess
// that wants a core for minutes. Two vCPU means two, and KF_BUILD_SLOTS raises it where the machine
// is bigger. queued+running is what a fleet should be sized on — the depth of actual work.
const SLOTS = Math.max(1, Number(process.env.KF_BUILD_SLOTS || 2));

// QUOTA AND RATE LIMIT. A build is the most expensive thing this product does — minutes of a core
// and a large model bill — and until now one person could start as many as they could type. Not a
// hypothetical: a loop in a script, or a demo where somebody holds Enter, is enough to fill every
// slot in the fleet and leave everyone else queued behind them.
//
// Two different limits because they stop two different things. CONCURRENT bounds how much of the
// shared fleet one person can hold at once; the RATE bounds a runaway client that is not really
// waiting for answers. Both are counted in the database — a limit six instances each enforce on
// their own is six times the limit.
//
// Deliberately generous. This is a floor against accidents and abuse, not a product decision about
// how much anyone may build, and a limit that bites during ordinary work would be turned off.
const MAX_CONCURRENT_BUILDS = Math.max(1, Number(process.env.KF_MAX_BUILDS_PER_USER || 3));
const MAX_BUILDS_PER_MIN = Math.max(1, Number(process.env.KF_MAX_BUILDS_PER_MIN || 12));
const REAP_MS = 60 * 1000;
const inFlight = () => [...sessions.values()].filter((x) => x.jobId != null).length;
const LEASE_SEC = 30 * 60;          // a build may legitimately run this long
const HEARTBEAT_MS = 5 * 60 * 1000; // renew well inside the lease

/**
 * The ONE way a turn starts. Everything that wants to build — a posted message, a turn ending with
 * work still owed, a session recovered after a restart — goes through here, so the slot cap and the
 * job row apply to all of them. drainQueue used to call invoke() directly, which meant the cap was
 * enforced on the first turn and bypassed on every follow-up: exactly backwards, since a busy system
 * is the one with queued messages.
 */
// The ONE place a successor turn is enqueued (Codex round-8/9). BOTH enqueue paths — the queued-drain
// (startTurn) and a message posted right after turn-end (postMessage) — must go through here, or one of
// them races the live-job unique index. `chat_jobs_one_live` rejects a successor enqueued while the
// predecessor row is still 'running', so this first awaits the just-finished turn's completeTurn commit,
// AND reconciles a stale local job, THEN enqueues. Returns the job id, or null when a live job genuinely
// already owns the session (a real concurrent request — the caller reports "queued", and that live job
// drains the pending message). Runs on the drain/post path AFTER the terminal event, so it never delays
// the user-visible "done"; it only orders the handoff. Best-effort on the completion await — a DB outage
// still attempts the enqueue with the reaper as the same backstop as before, never failing a terminal.
async function enqueueSuccessor(s, reason, userSub) {
  reconcileJob(s);
  if (s.jobDone) { try { await s.jobDone; } catch { /* completion failed; enqueue anyway, reaper covers it */ } s.jobDone = null; }
  return DB.enqueueTurn(s.id, { reason }, userSub || null).catch(() => null);
}

async function startTurn(s) {
  if (!DB?.enqueueTurn) return invoke(s);          // no database: the old direct path, single instance
  await enqueueSuccessor(s, "drain", s.ownerSub);
  return pump();
}

/**
 * Claim work while there are free slots. Called after enqueueing, when a turn finishes, and on a
 * timer — so a job left by a dead worker is picked up even if nothing new arrives.
 */
let pumping = false, pumpAgain = false;
async function pump() {
  if (!DB?.claimNextTurn) return;
  // NOT re-entrant. inFlight() is read, then a claim is awaited — two concurrent pumps (a posted
  // message and a turn ending in the same tick) both pass the check and both claim, and the pool
  // quietly runs over its slot count. Serialise, and remember that someone asked while we were busy.
  if (pumping) { pumpAgain = true; return; }
  pumping = true;
  try { await pumpOnce(); } finally { pumping = false; }
  if (pumpAgain) { pumpAgain = false; await pump(); }
}

async function pumpOnce() {
  for (const x of sessions.values()) reconcileJob(x);
  while (inFlight() < SLOTS) {
    let job = null;
    try { job = await DB.claimNextTurn(INSTANCE, { leaseSec: LEASE_SEC }); }
    catch (e) { console.warn(`  build queue unavailable: ${e.message}`); return; }
    if (!job) return;                                   // nothing waiting

    const s = sessions.get(job.sessionId);
    if (!s) { await DB.completeTurn(job.id).catch(() => {}); continue; }   // session gone; drop the job
    if (s.busy) { await DB.completeTurn(job.id).catch(() => {}); continue; } // already running here

    s.jobId = job.id;
    // Heartbeat the JOB, not just the session lease: the job row is what re-queues if we die.
    clearInterval(s.jobT);
    s.jobT = setInterval(() => { DB.heartbeatTurn?.(job.id, INSTANCE, { leaseSec: LEASE_SEC }).catch(() => {}); }, HEARTBEAT_MS);
    s.jobT.unref?.();
    console.log(`  [${s.slug}] build slot ${inFlight()}/${SLOTS} (job ${job.id}, attempt ${job.attempts})`);
    // Await the START, not the build: invoke() returns once the prompt is with the conductor. This
    // keeps the pre-queue behaviour — with a free slot, posting a message starts the build before
    // the POST returns — while a full pool simply leaves the job for whoever frees up first.
    try { await invoke(s); }
    catch (e) { console.warn(`  [${s.slug}] turn failed to start: ${e.message}`); finishJob(s); }
  }
}

/**
 * A session that is NOT building must not hold a build slot.
 *
 * Every ordinary exit — turn-end, fatal, the process dying — releases the job. But `busy` is cleared
 * in more places than that over the life of a long-lived process, and a session left idle while
 * still holding a job is a slot this worker can never reclaim and a turn the queue thinks is running.
 * One occupied slot per stuck session is how a pool silently stops accepting work. Reconcile instead
 * of trusting every path to remember.
 */
function reconcileJob(s) {
  if (!s.busy && s.jobId != null) {
    console.warn(`  [${s.slug}] job ${s.jobId} was left running by an idle session — releasing the slot`);
    finishJob(s);
  }
}

/** A job is done with this worker — free the slot, stop heartbeating, and look for more work. */
function finishJob(s) {
  if (s.jobId == null) return;
  const id = s.jobId;
  s.jobId = null;
  clearInterval(s.jobT); s.jobT = null;
  // Remember the in-flight completion (Codex round-8). `chat_jobs_one_live` is a UNIQUE partial index on
  // (session_id) WHERE status IN ('queued','running'), so a successor enqueued BEFORE this completeTurn
  // commits hits ON CONFLICT DO NOTHING and is silently dropped — a follow-up message sent during a build
  // then strands with no job. completeTurn is still fire-and-forget (terminal success must NOT depend on DB
  // health), but startTurn awaits this promise before enqueueing the successor so the predecessor row is
  // gone first. On Postgres this is a real round-trip; on the memory store it resolves synchronously.
  s.jobDone = (DB?.completeTurn?.(id) ?? Promise.resolve()).catch(() => {});
  setImmediate(() => pump().catch(() => {}));
}

/**
 * Jobs whose worker stopped heartbeating. Exhausted ones dead-letter and are said out loud in the
 * chat they belong to — a build that quietly disappeared twice is the worst of both worlds.
 */
async function reapJobs() {
  if (!DB?.reapTurns) return;
  try {
    const dead = await DB.reapTurns({ maxAttempts: MAX_TURN_ATTEMPTS });
    for (const d of dead) {
      const s = sessions.get(d.sessionId);
      console.warn(`  [${s?.slug || d.sessionId}] build gave up after ${d.attempts} attempts (job ${d.id})`);
      if (s) appendAgent(s, "Builder", "This build stopped twice before it finished, so I have left it rather than trying again. Say the word and I will start it fresh.");
    }
    await pump();
  } catch (e) { console.warn(`  could not reap the build queue: ${e.message}`); }
}

// Persist the AUTHORITATIVE terminal verdict of the last turn (Codex round-5 #2). On reload the client
// must render readiness from what actually happened — not from prototype/blueprint paths that survive on
// disk after a failed or stopped turn. Exposed in publicSession and whitelisted so it survives a restart.
function recordVerdict(s, ok, error) { s.lastTurnVerdict = { ok: !!ok, error: ok ? null : (error || "failed"), at: Date.now() }; }

/** Stop heartbeating and hand the session back, so the next turn can start anywhere. */
function releaseTurn(s) {
  clearInterval(s.leaseT); s.leaseT = null;
  finishJob(s);
  DB?.releaseTurn?.(s.id, INSTANCE).catch(() => {});   // an unreleased lease still expires on its own
}

/** The bookkeeping half: decide what is owed and hand it back. Returns true if a turn should start. */
function reclaimTurn(s) {
  if (!s.turnId || s.busy) return false;
  const dead = s.turnId;
  s.turnId = null;
  const owed = s.messages.filter((m) => m.role === "user" && m.consumedBy === dead && m.addressed);
  if (!owed.length) { s.turnAttempts = 0; persist(s); return false; }
  if ((s.turnAttempts || 0) >= MAX_TURN_ATTEMPTS) {
    s.turnAttempts = 0; persist(s);
    appendAgent(s, "Builder", "This build was interrupted twice by a restart, so I have stopped retrying it. Say the word and I will pick it up again.");
    console.warn(`  [${s.slug}] interrupted turn ${dead} exhausted ${MAX_TURN_ATTEMPTS} attempts — left for the user`);
    return false;
  }
  for (const m of owed) m.consumedBy = null;   // hand it back to the queue, unconsumed
  persist(s);
  console.log(`  [${s.slug}] resuming a build interrupted by a restart (attempt ${(s.turnAttempts || 0) + 1})`);
  appendAgent(s, "Builder", "Picking this back up — the service restarted mid-build.");
  return true;
}

async function resumeInterrupted() {
  for (const s of sessions.values()) {
    // ONLY sessions restored from storage. A session created inside this process has a turnId
    // because its turn is running right here — re-driving that spawns a SECOND conductor over the
    // same run directory, which is precisely the bug this whole change exists to prevent.
    if (!s.fromBoot || !s.turnId) continue;
    s.fromBoot = false;
    // Someone may be running this RIGHT NOW on another instance — an unexpired lease means the turn
    // was never interrupted at all, it just is not ours. Recovery is for turns nobody owns.
    if (DB?.turnOwner) {
      const held = await DB.turnOwner(s.id).catch(() => null);
      if (held && held.owner !== INSTANCE) { s.turnId = null; continue; }
    }
    await ensureLoaded(s);        // recovery decides from the messages; it must have them
    if (!reclaimTurn(s)) continue;
    try { drainQueue(s); } catch (e) { console.warn(`  [${s.slug}] could not resume: ${e.message}`); }
  }
}

function drainQueue(s) {
  if (s.busy) return;
  if (s.messages.some((m) => m.role === "user" && !m.consumedBy && m.addressed)) {
    startTurn(s).catch((e) => console.warn(`  [${s.slug}] could not start queued turn: ${e.message}`));
    return;
  }
  // Nothing owed according to THIS copy of the session — but a message posted to another instance
  // lives in the database and has never been seen here. onRemoteEvents only forwards events to
  // connected browsers; it does not merge messages. So look, then decide.
  refreshMessages(s).then((gained) => {
    if (gained && !s.busy) startTurn(s).catch((e) => console.warn(`  [${s.slug}] could not start queued turn: ${e.message}`));
  }).catch(() => {});
}

/**
 * Pick up messages another instance wrote. Now a real read rather than a guess: the previous version
 * compared LENGTHS and appended the tail, which is only correct if no two instances ever append at
 * once — the exact thing this whole change exists because they do. Rows have ids, so "what is here
 * that I do not have" is a set difference and not an inference.
 */
async function refreshMessages(s) {
  if (!DB?.listMessages) return false;
  const rows = await DB.listMessages(s.id).catch(() => null);
  if (!rows?.length) return false;
  const mine = new Set(s.messages.map((m) => m._id).filter((x) => x != null));
  const fresh = rows.filter((r) => !mine.has(r._id));
  if (!fresh.length) return false;
  // Keep our own in-flight objects (an assistant message still streaming), add what is new, and put
  // them back in id order so the transcript reads the way it was written.
  s.messages.push(...fresh.map((m) => ({ ...m, _sig: sigOf(m) })));
  s.messages.sort((a, b) => (a._id ?? Infinity) - (b._id ?? Infinity));
  console.log(`  [${s.slug}] picked up ${fresh.length} message(s) written by another instance`);
  return fresh.some((m) => m.role === "user" && !m.consumedBy && m.addressed);
}

// ── http ──────────────────────────────────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json",
};
const json = (res, code, body) => { const b = JSON.stringify(body); res.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(b) }); res.end(b); };
const notFound = (res, msg = "not found") => json(res, 404, { error: msg });

function serveFile(res, file, extraHeaders = {}) {
  if (!existsSync(file) || statSync(file).isDirectory()) return notFound(res, `no such file: ${basename(file)}`);
  const body = readFileSync(file);
  res.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
    "content-length": body.length,
    "cache-control": "no-store", // the preview is rebuilt constantly — never let the iframe cache it
    ...extraHeaders,
  });
  res.end(body);
}

// #5 — the prototype/blueprint HTML is AGENT-GENERATED and served from the SAME authenticated origin as
// the chat + control plane. Full isolation is a SEPARATE preview origin (infra — not changed here). On
// this origin we bound the blast radius with headers a self-contained prototype doesn't need relaxed:
//   · the session cookie is already HttpOnly, so generated JS cannot read the auth token; AND
//   · connect-src 'none' + form-action 'none' stop that JS from phoning home or POSTing the DOM
//     anywhere — it can render (inline scripts/styles/data: images all still work) but cannot exfiltrate
//     to a remote endpoint or call the authenticated API.
//   · frame-ancestors 'self' keeps it embeddable in the chat but blocks clickjacking elsewhere;
//     object-src/base-uri 'none' and nosniff are routine hardening.
// A prototype fetches nothing (it is SEED-DATA-driven and self-contained) and its live-reload is driven
// by the PARENT reloading the iframe, so 'none' connect-src does not break it.
const GENERATED_HTML_HEADERS = {
  "Content-Security-Policy": "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; img-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'",
  "X-Content-Type-Options": "nosniff",
};

/**
 * The chat's routes, mounted by the control plane. `me` is the caller, already authenticated and
 * role-resolved by the host. Returns true when it owned the request, false to let the host continue.
 * Callers that reach here have a live session — the host gates that — so the only checks left are the
 * per-role ones.
 */
export async function handleChat(req, res, me, body = {}) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = decodeURIComponent(url.pathname);
  if (!isChatPath(p)) return false;   // not ours — let the host keep routing
  await chatRoute(req, res, me, url, p, body);
  return true;
}

// paths the chat owns inside the shared origin
const isChatPath = (p) =>
  p === "/app" || p === "/app/" || p.startsWith("/worker/") ||
  p.startsWith("/api/sessions") || p === "/api/runs" || p === "/api/adopt" || p === "/api/apps" ||
  p === "/api/embed-check" || p === "/api/name-suggest" || p === "/api/kissflow-apps" ||
  p.startsWith("/preview/") || p.startsWith("/blueprint/");

async function chatRoute(req, res, me, url, p, body) {
  let m;
  try {
    if (p === "/app" || p === "/app/") { chatShell(req, res); return true; }

    // ── the worker protocol: a session pod dialing home ─────────────────────────────────────────
    // Pull-based: the pod long-polls for turns and POSTs events/files back, so the control plane never
    // needs a route into the cluster and a dead pod simply stops polling. Auth is the per-session
    // worker token minted when the pod was created — constant-time-ish compare, no user session.
    if ((m = p.match(/^\/worker\/([^/]+)\/(turn|events|file)$/))) {
      // Hydrating too: this route sits ahead of the membership gate, and a pod whose POST lands on a
      // replica that never heard of its session got a 404 — its events dropped on the floor with the
      // build still running. The worker token it authenticates with lives ON the session, so the row
      // has to be read before the token can even be compared.
      const s = await getSession(m[1]);
      if (!s) return notFound(res, "unknown session");
      const tok = req.headers["x-worker-token"];
      if (!tok || !s.workerToken || String(tok) !== String(s.workerToken)) return json(res, 403, { error: "bad worker token" });

      if (m[2] === "turn" && req.method === "GET") {
        const give = () => json(res, 200, { turn: s.podTurns.shift() });
        if (s.podTurns?.length) return give();
        // park up to 25s — under Cloud Run's timeout, long enough that polling is cheap
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 25_000);
          s.podWaiter = { resolve, t };
          req.on("close", () => { if (s.podWaiter?.resolve === resolve) s.podWaiter = null; clearTimeout(t); resolve(); });
        });
        if (res.writableEnded) return true;
        // 200 {turn:null}, NEVER 204-with-a-body: Node discards the body on 204 but still advertises
        // its content-length, so the worker's fetch hung waiting for bytes that never came — which is
        // why idle pods lived forever (the loop never came round to the idle check).
        return s.podTurns?.length ? give() : json(res, 200, { turn: null });
      }

      if (m[2] === "events" && req.method === "POST") {
        // The same sinks the local Conductor drives — the whole point. Order preserved: the worker
        // sends one batch at a time and each batch is applied in sequence.
        const sinks = turnSinks(s);
        for (const e of Array.isArray(body.events) ? body.events : []) {
          try { sinks[e.ev]?.(e.data); } catch (err) { console.warn(`  [${s.slug}] worker event ${e.ev}: ${err.message}`); }
        }
        return json(res, 200, { ok: true });
      }

      if (m[2] === "file" && req.method === "GET") {
        // The reverse of the POST below: a pod PULLS an uploaded spec onto its own disk before the
        // turn starts. Same confinement — this session's run directory and nothing else.
        const rel = String(url.searchParams.get("path") || "").replace(/\\/g, "/");
        if (!rel.startsWith(`runs/${s.slug}/`) || rel.includes("..")) return json(res, 403, { error: "outside the run directory" });
        const abs = join(RUNS, rel.slice("runs/".length));
        if (!existsSync(abs)) return notFound(res, "no such file");
        res.writeHead(200, { "content-type": "application/octet-stream", "content-length": statSync(abs).size });
        createReadStream(abs).pipe(res);
        return true;
      }

      if (m[2] === "file" && req.method === "POST") {
        // Artifacts live on the POD's disk; the preview pane, version snapshots and publishBuild all
        // read THIS host's. The worker ships each artifact as it lands. Path is confined to the
        // session's own run directory — a worker can write its app's files and nothing else.
        const rel = String(body.path || "");
        const safe = rel.replace(/\\/g, "/");
        if (!safe.startsWith(`runs/${s.slug}/`) || safe.includes("..")) return json(res, 403, { error: "outside the run directory" });
        // resolve under RUNS, not REPO/runs — identical in production, but KF_RUNS_DIR moves RUNS
        // (tests, and eventually the pod's own mounted workspace) and the preview resolvers read RUNS
        const abs = join(RUNS, safe.slice("runs/".length));
        try {
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, Buffer.from(String(body.content_b64 || ""), "base64"));
        } catch (err) { return json(res, 500, { error: err.message }); }
        return json(res, 200, { ok: true });
      }
    }

    // Role gating is enforced HERE, not just in the UI — hidden tabs are cosmetic, and /blueprint/<id>
    // is a plain URL anyone could type.
    if (me?.active === false) { json(res, 403, { error: "this account has been deactivated", deactivated: true }); return true; }

    // ── membership gate ───────────────────────────────────────────────────────────────────────────
    // An app's chat is SHARED: every member talks in it and reads the whole history. The other half of
    // that sentence is the one that has to be enforced — nobody else does. Gated ONCE here, keyed off
    // the session id in the path, because nine separate checks is nine chances to forget the tenth.
    const named = p.match(/^\/(?:preview|blueprint)\/([^/]+)/) || p.match(/^\/api\/sessions\/([^/]+)/);
    if (named) {
      // Hydrate HERE, for the same reason the membership check lives here: every session-scoped route
      // passes through this line, so resolving the session once covers all of them and the ~13
      // `sessions.get()` calls downstream find it in the map, unchanged. Putting it in each route
      // would be thirteen chances to forget the fourteenth.
      const s = await getSession(named[1]);
      if (!s) return notFound(res, "unknown session");
      if (!(await isMember(s, me))) return json(res, 403, { error: "not a member of this app" });
    }


/**
 * What an artifact pane shows when the file is not servable YET. These routes are only ever loaded
 * by the artifact iframes, and an iframe renders whatever it is given — which is how a build in
 * progress displayed raw {"error":"nothing built yet"} as the whole Prototype pane while sixteen
 * page agents were visibly working beside it (quayside-yard-control, 2026-08-04).
 *
 * Still a 404 — nothing exists — but a 404 a human is meant to see: it names the state, and it
 * retries itself every 8s so the pane heals the moment assembly lands the file, with no reload.
 */
function pendingPane(res, what) {
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  return res.end(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="8"><title>Still building</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:'Instrument Sans',system-ui,sans-serif;background:#F4F6F9;color:#5B6474">
<div style="text-align:center;max-width:36ch"><div style="width:10px;height:10px;border-radius:50%;background:#F79B1E;margin:0 auto 14px;animation:p 1.4s ease-in-out infinite"></div>
<div style="font-weight:600;color:#111827;font-size:15px;margin-bottom:6px">No ${what} to show yet</div>
<div style="font-size:13px;line-height:1.55">If a build is running, its files land here when the current step finishes — this pane checks again every few seconds on its own.</div></div>
<style>@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}</style></body>`);
}
    // ── preview: /preview/<sessionId>/<path inside the prototype dir>
    if ((m = p.match(/^\/preview\/([^/]+)(?:\/(.*))?$/))) {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      let entry = resolvePreview(s);
      if (!entry) {
        // CACHE MISS. The local disk is only a cache — the durable copy lives in storage. Fall back
        // to the LIVE object (a build in flight), then the newest registered version, WRITE the hit
        // back into the cache so the next request is local, and serve it. Only when storage has
        // nothing either is there genuinely nothing to show.
        const body = s.projectId
          ? (await fetchLive(s.projectId, "prototype").catch(() => null)) ?? (await fetchArtifact(s.projectId, "prototype").catch(() => null))
          : null;
        if (body != null) {
          try {
            const f = join(runDir(s), "prototype", "index.html");
            mkdirSync(dirname(f), { recursive: true });
            writeFileSync(f, body);
            s.preview = relative(REPO, f); persist(s);
            entry = f;
          } catch { /* serve from memory even if the cache write failed */ }
          if (!entry) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...GENERATED_HTML_HEADERS }); return res.end(body); }
        } else return pendingPane(res, "prototype");
      }
      const base = dirname(entry);
      const rel = m[2] || basename(entry);
      const file = resolve(base, rel);
      if (!file.startsWith(base + "/") && file !== base && file !== entry) return json(res, 403, { error: "outside the preview root" });
      // Defense-in-depth (#4): the resolved path is lexically inside base, but a SYMLINK inside the
      // prototype dir could still point out. Reject if the real target escapes the preview root — no
      // following a link to .kf-env or a repo file.
      try { const rp = realpathSync(file), rb = realpathSync(base); if (rp !== rb && !rp.startsWith(rb + sep)) return json(res, 403, { error: "outside the preview root" }); } catch { return notFound(res, "no such file"); }
      return serveFile(res, file, GENERATED_HTML_HEADERS);   // #5: isolate agent-generated HTML from the auth origin
    }

    // The review page is a cache of a render, not a record. Before serving one, bring it up to the
    // current renderer if its stamp is stale — otherwise a theme change or a new section reaches only
    // apps built after it, and every blueprint already on disk stays frozen at whatever produced it.
    // Synchronous on purpose: it is ~60ms, and serving the stale page first would mean the reader
    // sees the old one exactly when they came to look at the new thing.
    const freshen = (dir, s) => {
      try {
        const r = freshenReview(dir);
        if (!r.changed) {
          if (!r.ok && r.reason !== "no review page") console.log(`  [${s.slug}] blueprint left as-is — ${r.reason}`);
          return;
        }
        console.log(`  [${s.slug}] blueprint re-rendered for renderer ${r.stamp} (was ${r.was || "unstamped"})`);
        // Write the result back to storage, or it is not a refresh — it is a re-derivation this
        // container happens to be holding. runs/ is local disk that a redeploy wipes, so without this
        // every container re-renders the same page from the same IR forever, and everything that
        // reads the bucket directly — a shared link, the version list — keeps serving the old bytes
        // beside a pane showing the new ones.
        //
        // `live/` ONLY. A registered version is the record of what was reviewed and signed off at
        // that moment; silently rewriting it would destroy the thing it exists to preserve. A stale
        // version page is re-rendered on demand instead, from the IR stored next to it.
        //
        // Fire-and-forget: the reader already has their page, and a failed upload costs nothing
        // because the next freshen is idempotent and will try again.
        if (s.projectId && r.file) {
          const bytes = readFileSync(r.file);
          Promise.resolve(publishLive(s.projectId, { review: bytes }))
            .then(() => console.log(`  [${s.slug}] refreshed blueprint published to live/`))
            .catch((e) => console.warn(`  [${s.slug}] refreshed blueprint not published: ${e.message}`));
        }
      } catch { /* a stale page still serves; a failed refresh must never cost the reader the page */ }
    };

    // ── blueprint: the review page for this run, or /blueprint/<id>/versions/<file>.html for history
    if ((m = p.match(/^\/blueprint\/([^/]+)(?:\/(.*))?$/))) {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      if (m[2] && m[2].startsWith("versions/")) {
        const file = join(versionsDirFor("blueprint", s), basename(m[2]));
        if (!existsSync(file)) return notFound(res, "version not found");
        return serveFile(res, file, GENERATED_HTML_HEADERS);   // #5
      }
      const rel = resolveBlueprint(s);
      if (!rel) {
        const body = s.projectId
          ? (await fetchLive(s.projectId, "review").catch(() => null)) ?? (await fetchArtifact(s.projectId, "review").catch(() => null))
          : null;
        if (body != null) {
          try {
            const f = join(runDir(s), "review.html");
            mkdirSync(dirname(f), { recursive: true });
            writeFileSync(f, body);
            s.blueprint = relative(REPO, f); persist(s);
            freshen(runDir(s), s);   // a page restored from storage is usually the oldest one there is
            return serveFile(res, f, GENERATED_HTML_HEADERS);   // #5
          } catch { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...GENERATED_HTML_HEADERS }); return res.end(body); }
        }
        return pendingPane(res, "blueprint");
      }
      const abs = core.relToAbs(rel);
      freshen(dirname(abs), s);
      // realpath containment at serving (#4), matching the preview route — never follow a link out of the run.
      try { const rp = realpathSync(abs), rb = realpathSync(runDir(s)); if (rp !== rb && !rp.startsWith(rb + sep)) return notFound(res, "no such blueprint"); } catch { return notFound(res, "no such blueprint"); }
      return serveFile(res, abs, GENERATED_HTML_HEADERS);   // #5
    }

    // ── version history: /api/sessions/<id>/versions/<prototype|blueprint>
    if ((m = p.match(/^\/api\/sessions\/([^/]+)\/versions\/(prototype|blueprint)$/))) {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      const kind = m[2];
      // local snapshots (this instance's rebuilds) …
      const out = listVersions(kind, s).map((v) => ({ id: v.file, label: null, mtime: v.mtime, url: `/${kind === "prototype" ? "preview" : "blueprint"}/${s.id}/versions/${v.file}` }));
      // … plus every version registered for the app, which is what an app built elsewhere (or before
      // this instance existed) actually has. Same origin, so the pane can point straight at them.
      if (DB && s.projectId) {
        const want = kind === "prototype" ? "prototype" : "review";
        try {
          for (const v of await DB.listVersions(s.projectId)) {
            if (!artifactUri(v.artifacts, want)) continue;
            out.push({ id: `v${v.seq}`, seq: v.seq, label: v.label || `v${v.seq}`, mtime: Date.parse(v.created_at) || 0,
              url: `/projects/${s.projectId}/versions/${v.seq}/${want}` });
          }
        } catch { /* local snapshots still list */ }
      }
      out.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      return json(res, 200, { versions: out });
    }

    // ── who's in this chat: the @-mention roster (builder + project members) ────────────────────
    if ((m = p.match(/^\/api\/sessions\/([^/]+)\/members$/)) && req.method === "GET") {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      let members = [];
      if (DB?.listMembers && s.projectId) { try { members = await DB.listMembers(s.projectId); } catch { /* roster is a nicety */ } }
      return json(res, 200, { members: members.filter((x) => x.email).map((x) => ({ email: x.email, name: x.email.split("@")[0] })) });
    }

    // ── AI naming: brief (+ spec excerpt) → app name + one-line description ─────────────────────
    // The hero flow calls this the moment Start Building is clicked, so the name step arrives
    // pre-filled instead of demanding the user invent a title for something they just described.
    if (p === "/api/name-suggest" && req.method === "POST") {
      await refreshApiKey();
      const key = CHILD_ENV.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
      if (!key) return json(res, 503, { error: "no model credential available" });
      const brief = String(body.text || "").slice(0, 4000);
      const spec = String(body.spec || "").slice(0, 8000);
      const fname = String(body.filename || "").slice(0, 120);
      if (!brief && !spec && !fname) return json(res, 400, { error: "nothing to name" });
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001", max_tokens: 200,
            messages: [{ role: "user", content:
              `Name a business app from what its builder knows so far. Reply with ONLY JSON: {"name":"…","description":"…"}.\n` +
              `Rules: name is 2–4 words, Title Case, product-style (no generic "App"/"System" suffix unless it truly fits); ` +
              `description is one plain sentence under 120 characters describing what the app does for whom.\n` +
              (brief ? `\nBrief: ${brief}\n` : "") + (fname ? `\nAttached document: ${fname}\n` : "") + (spec ? `\nSpec excerpt:\n${spec}` : "") }],
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const out = (await r.json())?.content?.[0]?.text || "";
        const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] || "{}");
        return json(res, 200, { name: typeof parsed.name === "string" ? parsed.name.slice(0, 60) : null,
                                description: typeof parsed.description === "string" ? parsed.description.slice(0, 160) : null });
      } catch (err) { return json(res, 502, { error: err.message }); }
    }

    // ── spec upload: multipart/form-data, one request per ≤8MB part ──────────────────────────────
    // 50MB files can't ride one request (Cloud Run caps HTTP/1 bodies at 32MiB), so the client
    // slices the file and posts each slice as its own multipart part — S3-style. seq 0 truncates,
    // later parts append; the running total is capped at 50MB. Membership was already gated above.
    if ((m = p.match(/^\/api\/sessions\/([^/]+)\/upload$/)) && req.method === "POST") {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      const chunks = []; let size = 0, over = false;
      await new Promise((done) => {
        req.on("data", (c) => { size += c.length; if (size > 12 * 1024 * 1024) { over = true; req.destroy(); done(); } else chunks.push(c); });
        req.on("end", done); req.on("error", done); req.on("close", done);
      });
      if (over) return json(res, 413, { error: "part too large — send parts of 8MB or less" });
      const mp = parseMultipart(Buffer.concat(chunks), req.headers["content-type"]);
      if (!mp?.file) return json(res, 400, { error: "a multipart file field is required" });
      const name = String(mp.fields.name || mp.file.filename || "spec").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "_").slice(0, 120) || "spec";
      const seq = Math.max(0, +(mp.fields.seq || 0) || 0);
      const dir = join(runDir(s), "uploads");
      mkdirSync(dir, { recursive: true });
      const abs = join(dir, name);
      const already = seq > 0 && existsSync(abs) ? statSync(abs).size : 0;
      if (already + mp.file.data.length > 50 * 1024 * 1024) return json(res, 413, { error: "the file exceeds the 50MB limit" });
      try { seq === 0 ? writeFileSync(abs, mp.file.data) : appendFileSync(abs, mp.file.data); }
      catch (err) { return json(res, 500, { error: err.message }); }
      return json(res, 200, { ok: true, path: `runs/${s.slug}/uploads/${name}`, size: already + mp.file.data.length });
    }

    // Can this Kissflow app URL legally live in OUR iframe? The browser decides purely by response
    // headers — X-Frame-Options: SAMEORIGIN blocks any cross-origin embed, but a CSP frame-ancestors
    // directive OVERRIDES XFO when present. Those headers are invisible to a cross-origin page, so
    // the check runs here. Restricted to *.kissflow.com (this is not an open URL prober) and cached
    // per host. Today the platform answers SAMEORIGIN and the Preview tab stays a link; the day it
    // ships `frame-ancestors 'self' https://aibuilder.kissflow.com`, embedding turns on by itself.
    if (p === "/api/embed-check" && req.method === "GET") {
      const u = String(url.searchParams.get("u") || "");
      let host = null;
      try { const t = new URL(u); if (t.protocol === "https:") host = t.hostname; } catch { /* not a url */ }
      if (!host || !/\.kissflow\.com$/.test(host)) return json(res, 400, { error: "not a kissflow url" });
      const hit = embedCheck.get(host);
      if (hit && Date.now() - hit.at < 5 * 60_000) return json(res, 200, hit.out);
      const self = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
      let out = { embeddable: false, reason: "unreachable" };
      try {
        const r = await fetch(u, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
        const fa = (r.headers.get("content-security-policy") || "").match(/frame-ancestors([^;]*)/i)?.[1];
        if (fa) {
          const ok = fa.split(/\s+/).filter(Boolean).some((src) => {
            if (src === "*" || src === "https:") return true;
            const h = src.replace(/^https?:\/\//, "").replace(/[/:].*$/, "");
            return h === self || (h.startsWith("*.") && self.endsWith(h.slice(1)));
          });
          out = { embeddable: ok, reason: ok ? "frame-ancestors allows this host" : "frame-ancestors excludes this host" };
        } else {
          const xfo = (r.headers.get("x-frame-options") || "").toUpperCase();
          out = xfo ? { embeddable: false, reason: `x-frame-options ${xfo}` } : { embeddable: true, reason: "no framing headers" };
        }
      } catch { /* unreachable stays the reason */ }
      embedCheck.set(host, { at: Date.now(), out });
      return json(res, 200, out);
    }

    if (p === "/api/sessions" && req.method === "GET") {
      // Scoped to the caller's apps. This used to hand EVERY session in the process to any signed-in
      // user. One membership query, not one per session — the set is small and the list is not.
      let mine = null;   // null = unscoped (no db / admin): show everything
      if (DB?.listProjectsForUser && me?.sub && me.role !== "admin") {
        try { mine = new Set((await DB.listProjectsForUser(me.sub)).map((x) => x.id)); }
        catch { mine = new Set(); }   // a failed lookup shows nothing, never everything
      }
      const visible = [...sessions.values()]
        // scoped: a projected session the caller is a member of, OR a projectless session they CREATED —
        // never every projectless session for everyone (#5).
        .filter((s) => !mine || (s.projectId ? mine.has(s.projectId) : s.ownerSub === me.sub))
        .sort((a, b) => b.createdAt - a.createdAt);
      return json(res, 200, { sessions: visible.map((s) => ({
        id: s.id, slug: s.slug, title: s.title, createdAt: s.createdAt, app: s.app || null,
        hasPreview: !!resolvePreview(s), hasBlueprint: !!resolveBlueprint(s), runtime: s.runtime || null,
        busy: s.busy, phase: s.phase || null, generating: !!s.generating, projectId: s.projectId || null,
      })) });
    }

    if (p === "/api/sessions" && req.method === "POST") {
      const id = randomUUID();
      const slug = uniqueSlug(slugify(body.slug || body.text || "app"));
      const s = { id, slug, title: titleFrom(body.text) || "New app", createdAt: Date.now(), messages: [], clients: new Set(), events: [], seq: 0, phase: null, status: null, busy: false, conductor: null, preview: null };
      if (body.name) s.title = String(body.name);
      if (me?.sub) s.ownerSub = me.sub;   // record the creator so a projectless session is owner-gated, not world-readable (#5)
      if (body.projectId) {
        // AUTHORIZE the supplied project BEFORE binding or starting a turn (#2). Without this, knowing a
        // project id was enough to hijack its chat_slug and build on its linked credentials.
        if (!(await canUseProject(String(body.projectId), me))) return json(res, 403, { error: "you are not a member of that app" });
        s.projectId = String(body.projectId);  // opening an app that has no run yet
      }
      sessions.set(id, s);
      mkdirSync(join(runDir(s), "prototype", "parts"), { recursive: true });
      persist(s);
      await linkProject(s, me);
      // Starting an app IS addressing the builder — there is nobody else in the room yet.
      if (body.text) await postMessage(s, String(body.text), me, true);
      return json(res, 201, { session: await withRemoteArtifacts(s, me) });
    }

    if ((m = p.match(/^\/api\/sessions\/([^/]+)$/))) {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      // AUTHORIZE before reading the transcript or repairing/loading its project (#5) — the GET used to
      // run repairProjectLink + artifact hydration for any signed-in user who guessed a session id.
      if (req.method === "GET") { if (!(await isMember(s, me))) return json(res, 403, { error: "not a member of this app" }); await ensureRecap(s); await repairProjectLink(s); return json(res, 200, { session: await withRemoteArtifacts(s, me) }); }
      if (req.method === "DELETE") { // forgets the chat; the run directory stays on disk
        try { s.conductor?.stop(); } catch {}
        closeWatchers(s);   // #10: close BOTH the run and preview watchers, not just s.watcher
        executor.cleanup(s, "forget").catch(() => {});   // Stage 1: pod releases the workspace disk; inline is a no-op
        sessions.delete(s.id);
        try { unlinkSync(join(STORE, `${s.id}.json`)); } catch {}
        DB?.deleteChatSession?.(s.id).catch(() => {});
        return json(res, 200, { ok: true });
      }
    }

    if ((m = p.match(/^\/api\/sessions\/([^/]+)\/message$/)) && req.method === "POST") {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      const { text } = body;
      if (!String(text || "").trim()) return json(res, 400, { error: "empty message" });
      // `addressed` is the composer's mode, when the client has one: true = "ask the builder",
      // false = "comment to the team". Omitted (any other client, and today's UI) → the ladder decides.
      const explicit = typeof body.addressed === "boolean" ? body.addressed : undefined;
      const r = await postMessage(s, String(text).trim(), me, explicit);
      return json(res, 202, { ok: true, busy: s.busy, ...r });
    }

    if ((m = p.match(/^\/api\/sessions\/([^/]+)\/stop$/)) && req.method === "POST") {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      s.conductor?.stop();
      // pod mode: the process to kill lives in the cluster. Deleting the pod is the SIGTERM; the next
      // turn recreates it. Queued-but-unsent pod turns die with the stop, same as Conductor.queue.
      executor.cleanup(s, "stop").catch(() => {});   // Stage 1: pod clears queued turns + SIGTERMs the pod; inline is a no-op
      // Stop is a TERMINAL transition (Codex round-3 #3). Setting busy=false alone left the lease
      // heartbeat firing and the DB lease held — the conductor's later SIGTERM `exit` then early-returns
      // on `!s.busy`, so releaseTurn never ran and a stopped build kept renewing its lease and holding a
      // build slot. Do the terminal cleanup here: release the lease/job + heartbeat, persist the terminal
      // state, and drop watchers when nobody is watching.
      s.busy = false; s.generating = false; s.thinkingShown = false;
      closeAssistant(s);
      releaseTurn(s);                      // clears the heartbeat interval AND releases the DB lease/job
      // Stop must NOT survive as a resumable turn (Codex round-4 #2). Keeping turnId meant that after a
      // restart, resumeInterrupted()→reclaimTurn() saw an owned turn, un-consumed its message, and
      // restarted the very build the user stopped. Clear the turn id (so recovery cannot reclaim it) and
      // reset the interrupted-attempt count. The stopped turn's active message stays CONSUMED — so it is
      // neither reclaimed on restart nor re-run by the next drain — which is what "stop means stop" means.
      // Genuinely queued, never-started messages keep consumedBy === null and remain pending as before.
      s.turnId = null; s.turnAttempts = 0;
      recordVerdict(s, false, "stopped");   // a reload after a stop must not read as ready
      saveTimeline(s); persist(s);
      emit(s, "turn-end", { ok: false, error: "stopped" });
      if (!s.clients.size) closeWatchers(s);
      // Deliberately NOT draining the queue here. Stop means stop; auto-starting somebody else's
      // queued request a second later is exactly the surprise the button exists to prevent. Genuinely
      // queued (unconsumed) messages ride along with the next turn anyone starts.
      return json(res, 200, { ok: true, pending: s.messages.filter((x) => x.role === "user" && !x.consumedBy && x.addressed).length });
    }

    if ((m = p.match(/^\/api\/sessions\/([^/]+)\/stream$/))) {
      // HYDRATE, don't just read memory. The in-memory map is empty after a redeploy or a scale-to-zero
      // cycle, and holds nothing for a build another replica ran. `sessions.get()` here 404'd the stream
      // on exactly those refreshes — so the event backlog (every progress card + agent/tool row) was
      // never replayed and the conversation looked wiped, even though it sat in Postgres the whole time.
      // getSession() reads the row back like every other route already does (see the note above it).
      const s = await getSession(m[1]);
      if (!s) return notFound(res, "unknown session");
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      res.write(": open\n\n");
      const since = +(url.searchParams.get("since") || 0);
      // Replay from the LOG, not from this process's memory. The in-memory ring only holds what this
      // instance happened to see: it is empty after a restart, and it holds nothing at all for a build
      // another replica is running — which is the normal case once several members share one chat.
      // Flush first, or the last 200ms of a live build is missing from the very replay that needs it —
      // and flush the DELTA buffer too, or the agent/text prose still coalescing (up to COALESCE_MS)
      // is not in the log yet and the reconnect replays the activity rows but drops the paragraph.
      flushDeltas(s);
      await flushLog(s);
      let backlog = null;
      if (DB?.readChatEvents) {
        try { backlog = (await DB.readChatEvents(s.id, since, 5000)).map((r) => r.payload); }
        catch (e) { console.warn(`  [${s.slug}] replay fell back to memory: ${e.message}`); }
      }
      for (const ev of backlog ?? s.events.filter((e) => e.seq > since)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      s.clients.add(res);
      watchRun(s);
      const hb = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25000);
      req.on("close", () => {
        clearInterval(hb); s.clients.delete(res);
        // Last viewer of an IDLE session gone → release its fs watchers (#10). A live build keeps them
        // (s.busy); the next stream open re-creates them via watchRun/watchPreview.
        if (!s.clients.size && !s.busy) closeWatchers(s);
      });
      watchPreview(s);
      return;
    }

    if (p === "/api/apps" && req.method === "GET") {
      // "Your apps" means yours — the ones you own or were invited to — for EVERY role. An admin's
      // oversight of the whole platform is a different question and has to be asked for explicitly,
      // otherwise the list silently relabels 70 other people's apps as theirs.
      const wantsAll = url.searchParams.get("scope") === "all" && me?.role === "admin";
      const rows = wantsAll ? await DB.listAllProjects() : await DB.listProjectsForUser(me.sub);
      // An app built before the merge — or from the CLI — has registered VERSIONS but no run on this
      // machine's disk. Judging "has it been built?" by local files alone would show every one of them
      // as "not built yet" and offer a blank chat, which reads as though the work was lost.
      const vcounts = await DB.versionCounts();
      // Claude spend rides the card ONLY for an admin — it is a platform-oversight number, and this
      // list is the surface admins actually look at (the /manage dashboard is where it was first put,
      // which is why nobody ever saw it). One grouped query for the whole list, not one per card.
      const spend = me?.role === "admin" && DB.chatSpendByProject ? await DB.chatSpendByProject().catch(() => ({})) : null;
      const live = [...sessions.values()];
      const apps = rows.map((row) => {
        // chat_slug records which run backed this app, but runs/ is the container's local disk and a
        // redeploy wipes it. A slug whose directory is gone is worse than no slug: the card offers a
        // chat that 404s on adopt. Treat it as "no local run" — the app still opens, from its history.
        const slug = row.chat_slug && existsSync(join(RUNS, row.chat_slug)) ? row.chat_slug : null;
        // The session is found by PROJECT, never by whether this disk still has the run — the
        // snapshot in Postgres outlives the disk, and in pod mode the artifacts were never here at
        // all. Keying it on the local directory meant every redeploy orphaned the real conversation
        // behind a fresh empty adopt-shell. Prefer a session someone actually TALKED in (an adopt
        // recap has no user-authored messages), newest first.
        const spoke = (v) => ((v.messages || []).some((x) => x.role === "user") ? 1 : 0);
        const sess = live.filter((v) => v.projectId === row.id).sort((a, b) => spoke(b) - spoke(a) || b.createdAt - a.createdAt)[0]
          || (slug ? live.find((v) => v.slug === slug) : null);
        const dir = slug ? join(RUNS, slug) : null;
        const meta = dir && existsSync(dir) ? readAppMeta(dir) : null;
        const proto = dir && ["prototype/index.html", "prototype-dl/index.html", "prototype-par/index.html"]
          .map((x) => join(dir, x)).find(existsSync);
        return {
          projectId: row.id, name: row.name, slug, sessionId: sess?.id || null,
          canDelete: me?.role === "admin" || row.role === "owner" || row.owner_sub === me?.sub,
          owner: row.owner_email || null, role: row.role || null,
          domain: (meta && meta.domain) || null,
          hasPreview: Boolean(proto), busy: Boolean(sess?.busy), versions: vcounts[row.id] || 0,
          hasBlueprint: Boolean(dir && ["review.html", "blueprint.html"].some((f) => existsSync(join(dir, f)))),
          // the session's persisted runtime link outlives the disk copy of live.md
          runtime: sess?.runtime || (dir && existsSync(dir) ? findRuntimeUrl(dir) : null),
          mtime: proto ? statSync(proto).mtimeMs : Date.parse(row.last_accessed_at || row.created_at || 0) || 0,
          // Sorting needs the two dates separately. mtime already conflates "the prototype file
          // changed" with "the row was touched", which is right for "recently worked on" and wrong
          // for "when was this made" — a list sorted by a mixed signal cannot be reasoned about.
          createdAt: Date.parse(row.created_at || 0) || 0,
          touchedAt: Date.parse(row.last_accessed_at || row.created_at || 0) || 0,
          spend: spend ? spend[row.id] || null : null,
          // versions exist but not one billed turn ⇒ built OUTSIDE the hosted chat — a CLI/Cowork run
          // on someone's own claude login, which is subscription-billed and reports no API cost. Said
          // explicitly, so a card with no $ chip reads as "billed elsewhere", not "free".
          subBuilt: Boolean(spend && (vcounts[row.id] || 0) > 0 && !spend[row.id]),
        };
      });
      apps.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      return json(res, 200, { apps, scope: wantsAll ? "all" : "mine", canSeeAll: me?.role === "admin" });
    }

    // ── existing runs on disk, so a prototype built in the terminal (or a previous chat) shows up
    // on the home screen too — this is the app list, not just a fallback drawer.
    if (p === "/api/runs" && req.method === "GET") {
      const runs = [];
      for (const d of existsSync(RUNS) ? readdirSync(RUNS) : []) {
        // `runs/current` is a symlink the OLDER terminal pipeline points at whichever run is "active" —
        // following it lists the SAME app a second time under a different name. Skip symlinks outright;
        // the real directory they point at is already in this listing on its own.
        if (d.startsWith(".") || lstatSync(join(RUNS, d)).isSymbolicLink() || !statSync(join(RUNS, d)).isDirectory()) continue;
        // MEMBERSHIP GATE (#2). runs/ is shared disk; a signed-in user may only see runs of apps they
        // belong to. An unmapped/orphan run (canAccessRun → null) is hidden rather than leaked. In
        // single-operator/no-DB mode canAccessRun yields true and the listing is unchanged.
        if ((await canAccessRun(d, me)) !== true) continue;
        const dir = join(RUNS, d);
        const proto = ["prototype/index.html", "prototype-dl/index.html", "prototype-par/index.html"].map((x) => join(dir, x)).find(existsSync);
        if (!proto) continue;
        const meta = readAppMeta(dir);
        runs.push({
          slug: d, path: relative(REPO, proto), mtime: statSync(proto).mtimeMs, kb: Math.round(statSync(proto).size / 1024),
          app: (meta && meta.app) || null, domain: (meta && meta.domain) || null,
          roles: meta ? meta.roles.length : 0, pages: meta ? meta.pages.length : 0,
          hasBlueprint: ["review.html", "blueprint.html"].some((f) => existsSync(join(dir, f))),
          runtime: findRuntimeUrl(dir),
        });
      }
      runs.sort((a, b) => b.mtime - a.mtime);
      return json(res, 200, { runs });
    }

    // adopt an existing run as a chat session (continue an app built in the terminal). Idempotent —
    // opening the same app from the home screen twice must return the SAME session, not fork a
    // second one with its own (re-synthesized) history.
    if (p === "/api/adopt" && req.method === "POST") {
      const { slug } = body;
      if (!slug) return notFound(res, "unknown run");
      // VALIDATE THE SLUG BEFORE IT BECOMES A PROJECT (#17). adopt takes body.slug verbatim (unlike the
      // create path, which runs it through slugify), builds a run path from it, and — via linkProject —
      // persists it as the project's chat_slug, which later commands turn back into a filesystem path
      // (rmSync(join(RUNS, slug)) on delete). A traversal slug (`../../x`) must be rejected at the door,
      // not stored and dealt with later. isContainedRunDir enforces one plain segment strictly under RUNS.
      if (!isContainedRunDir(String(slug))) return json(res, 400, { error: "invalid run id" });
      const dir = join(RUNS, String(slug));
      const already = [...sessions.values()].find((v) => v.slug === slug);
      if (already) {
        // MEMBERSHIP GATE (#3), in-memory path — an already-loaded session is still someone's app.
        if (!(await isMember(already, me))) return json(res, 403, { error: "this app belongs to someone else" });
        await ensureRecap(already); return json(res, 200, { session: publicSession(already, me) });
      }

      // THE RUN DIRECTORY IS NOT THE SESSION. `runs/` is local disk: a redeploy wipes it and a second
      // instance never had it, so requiring it here made "Open in chat" fail ROUTINELY — and the
      // client's fallback for a failed adopt is to POST a new session, with the slug/name/projectId it
      // was never given, so the user landed in a blank UNTITLED app instead of their own. Reported
      // 2026-08-14; the conversation was in Postgres the whole time.
      //
      // So ask the database before giving up. Hydrated exactly like getSession() does — NOT fromBoot,
      // because this instance is a reader arriving late, not the driver resuming a turn.
      if (DB?.getChatSessionBySlug) {
        try {
          const row = await DB.getChatSessionBySlug(String(slug));
          const d = row && (typeof row.data === "string" ? JSON.parse(row.data) : row.data);
          if (d?.id) {
            // MEMBERSHIP GATE (#3). Adoption hydrates the FULL conversation of an existing app; a
            // signed-in user must belong to it. Check against the persisted session's own projectId
            // (the authoritative owner link), not just the slug→project mapping which can lag.
            if ((await canAccessRun(slug, me, d.projectId)) === false)
              return json(res, 403, { error: "this app belongs to someone else" });
            const live = sessions.get(d.id);
            if (live) { await ensureRecap(live); return json(res, 200, { session: publicSession(live, me) }); }
            const rs = hydrate(d);
            sessions.set(rs.id, rs);
            const max = (await DB.maxChatEventSeqs(rs.id).catch(() => ({})))[rs.id];
            if (max) { rs.seq = max + 200; rs.logSeq = max; }
            await ensureRecap(rs);
            return json(res, 200, { session: publicSession(rs, me) });
          }
        } catch { /* fall through to the disk path — a lookup failure must not block adoption */ }
      }
      if (!existsSync(dir)) return notFound(res, "unknown run");
      // MEMBERSHIP GATE (#3), disk path. A slug that maps to a project the user isn't in must not be
      // adoptable off disk either. null (orphan/terminal run, no owner) is allowed — adopting it is
      // the terminal→chat handoff, and linkProject below makes this user its owner.
      if ((await canAccessRun(slug, me)) === false) return json(res, 403, { error: "this app belongs to someone else" });
      const id = randomUUID();
      const s = { id, slug: String(slug), title: String(slug), createdAt: Date.now(), messages: [], clients: new Set(), events: [], seq: 0, phase: null, status: null, busy: false, conductor: null, preview: null };
      const f = resolvePreview(s);
      if (f) s.preview = relative(REPO, f);
      const runtimeUrl = findRuntimeUrl(dir);
      if (runtimeUrl) s.runtime = runtimeUrl;
      synthesizeAdoptHistory(s);
      sessions.set(id, s);
      persist(s);
      await linkProject(s, me);
      return json(res, 201, { session: publicSession(s, me) });
    }

    // ── developer connect: everything the Claude Code steps need for ONE app ────────────────────
    if ((m = p.match(/^\/api\/sessions\/([^/]+)\/connect$/)) && req.method === "POST") {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      if (!isBuilderRole(me)) return json(res, 403, { error: "the Claude Code connect flow is for developer accounts" });
      const projectId = await linkProject(s, me);
      if (!projectId) return json(res, 200, { slug: s.slug, projectId: null, reason: "app not registered" });
      // A connect URL needs the app's dev environment. Not having one yet is NOT an error to hide:
      // /author-setup's browser handshake still works and collects the credentials there.
      const project = await DB.getProject(projectId);
      const hasDevEnv = Boolean(project?.dev_env_id || project?.dev_env_ref);
      return json(res, 200, {
        slug: s.slug, projectId,
        url: hasDevEnv ? mintConnectUrl(projectId, me) : null,
        needsDevEnv: !hasDevEnv,
        devEnvUrl: `/p/${projectId}#settings`,
      });
    }

    // ── GET /api/kissflow-apps — the "Add existing" picker: apps already living in the user's dev
    // account, so one can be adopted into AI Builder (understand → blueprint → chat).
    if (p === "/api/kissflow-apps" && req.method === "GET") {
      if (!me?.sub) return json(res, 401, { error: "sign in first" });
      // ?env= names WHICH account to look in. Optional: without it the host picks the first, which is
      // the behaviour every existing caller relies on. The response carries the full option list back
      // so the picker can offer the rest rather than pretending there is only one.
      const envId = new URL(req.url, "http://x").searchParams.get("env") || null;
      try { return json(res, 200, await listKissflowApps(me.sub, envId)); }
      catch (e) { return json(res, 502, { error: `could not reach Kissflow: ${e.message}`, apps: [] }); }
    }

    // ── GET /api/sessions/{id}/dev-env — where this app builds, and where it COULD build ─────────
    // Generate in Kissflow needs both halves. It must not start a build with nowhere to build: that
    // failure surfaces only at the first authenticated call, after the conductor has already been
    // told to author the app, and reads as the build breaking rather than as a missing setting. And
    // it must be able to offer the choice on the spot — sending someone to the project record page
    // mid-build is where the previous version of this lost people entirely.
    if ((m = p.match(/^\/api\/sessions\/([^/]+)\/dev-env$/)) && req.method === "GET") {
      const s = sessions.get(m[1]);
      if (!s) return notFound(res, "unknown session");
      if (!(await isMember(s, me))) return json(res, 403, { error: "not a member of this app" });
      const out = { linked: null, options: [], settingsUrl: s.projectId ? `/p/${s.projectId}#settings` : null };
      try { out.options = await devEnvOptionsFor(me?.sub); } catch { /* the linked state still matters */ }
      if (DB && s.projectId) {
        const project = await DB.getProject(s.projectId).catch(() => null);
        if (project?.dev_env_id && DB.getDevEnv) {
          const e = await DB.getDevEnv(project.dev_env_id).catch(() => null);
          if (e) out.linked = { id: e.id, name: e.name, subdomain: e.subdomain };
        } else if (project?.dev_env_ref) {
          // pre-migration app carrying its own credentials rather than a reusable environment
          out.linked = { id: null, name: "this app's own credentials", subdomain: null };
        }
      }
      // Local-dev fallback: no linked env and no accounts to offer, but a repo-root .kf-env exists —
      // which is exactly what the engine authenticates with in that case (dev.mjs runs without
      // Secret Manager BY DESIGN, so account rows are ephemeral there). Without this the Generate
      // button dead-ended on an empty picker above a build that would in fact work: the picker asked
      // a question with no answers while the real answer sat on disk.
      if (!out.linked && !out.options.length) {
        try {
          const sub = parseEnvText(readFileSync(join(REPO, ".kf-env"), "utf8")).KISSFLOW_SUBDOMAIN;
          if (sub) out.linked = { id: null, name: "local .kf-env", subdomain: sub };
        } catch { /* no .kf-env — the empty picker is then the honest state */ }
      }
      return json(res, 200, out);
    }

    return notFound(res);
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

/**
 * Register any run that predates the merge as an app, owned by `ownerSub`. Without this, moving the
 * list to the database would make every app built before today silently vanish from the UI even though
 * its files are right there on disk. Idempotent: runs already claimed by an app are skipped.
 */
export async function backfillRuns(ownerSub) {
  if (!DB || !ownerSub) return 0;
  const known = new Set((await DB.listAllProjects()).map((p) => p.chat_slug).filter(Boolean));
  let n = 0;
  for (const d of existsSync(RUNS) ? readdirSync(RUNS) : []) {
    if (d.startsWith(".") || known.has(d)) continue;
    if (lstatSync(join(RUNS, d)).isSymbolicLink() || !statSync(join(RUNS, d)).isDirectory()) continue;
    const dir = join(RUNS, d);
    if (!["prototype/index.html", "prototype-dl/index.html", "prototype-par/index.html"].some((x) => existsSync(join(dir, x)))) continue;
    const meta = readAppMeta(dir);
    const proj = await DB.createProject((meta && meta.app) || d, ownerSub);
    await DB.setProjectChatSlug(proj.id, d);
    n++;
  }
  return n;
}

/**
 * Deleting an app has to take its chat session and its run directory with it. Leaving the directory
 * behind would be worse than useless: the next boot's backfill treats an unclaimed run as an app to
 * register, so the deleted app would quietly come back.
 */
// A slug reaches disk through rmSync(join(RUNS, slug)). It originates from a client-supplied
// chatSlug (setProjectChatSlug), member-gated but never format-checked — so `../../etc` would
// delete OUTSIDE RUNS. This is the last line before the filesystem, so the containment check lives
// HERE and protects every caller: resolve the target and require it to be a STRICT child of RUNS
// (not RUNS itself, not a parent, not reached via `..`). Belt: a slug must also be a single plain
// path segment. (2026-08-17, #2)
export function isContainedRunDir(slug) {
  if (!slug || typeof slug !== "string") return null;
  if (!/^[A-Za-z0-9._-]+$/.test(slug) || slug === "." || slug === "..") return null;  // one plain segment
  const target = resolve(RUNS, slug);
  const rel = relative(resolve(RUNS), target);
  if (rel === "" || rel.startsWith("..") || rel.includes(sep) || isAbsolute(rel)) return null;  // strict child only
  return target;
}

export function forgetChatApp(slug) {
  if (!slug) return;
  for (const [id, s] of [...sessions]) {
    if (s.slug !== slug) continue;
    try { s.conductor?.stop(); s.watcher?.close(); s.runWatcher?.close(); } catch {}
    // the app is gone — so is its workspace disk. A STOPPED build keeps its disk; a DELETED app doesn't.
    executor.cleanup(s, "shutdown").catch(() => {});   // Stage 1: pod releases the workspace disk; inline is a no-op
    sessions.delete(id);
    try { unlinkSync(join(STORE, `${id}.json`)); } catch {}
    DB?.deleteChatSession?.(id).catch(() => {});
  }
  const dir = isContainedRunDir(slug);
  if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
  else console.warn(`forgetChatApp: refusing to delete non-contained slug ${JSON.stringify(slug)} — not a child of RUNS`);
}

/** The single-page product shell — the app list and the chat live in here. */
export function chatShell(_req, res) { serveFile(res, join(HERE, "ui.html")); }

/**
 * Test-only seam. The coalescer and the log writer are internal on purpose — nothing in the product
 * reaches them — but they carry rules that are invisible when broken (event ordering, seq numbering,
 * one row per batch) and the only other way to drive them is to spawn a real builder. Referenced from
 * test/ and nowhere else.
 */
export const __test = { emit, flushLog, flushDeltas, sessions, loadSessions, getSession, decideInvoke, drainQueue, onRemoteEvents, resumeInterrupted, reclaimTurn, pump, finishJob, startTurn, postMessage, reapJobs, partsProgress };

/** One-line summary for the host's boot banner. */
/**
 * The environment a session's builder process was given. A test seam, deliberately: whether the
 * project's Kissflow credentials actually REACH the child is the thing that broke, and it is not
 * observable from any response body — the symptom only appears inside a build, twenty minutes later,
 * as "no KISSFLOW_* in the environment".
 */
export const conductorEnvFor = (sessionId) => sessions.get(sessionId)?.conductor?.env || null;

export const buildQueueDepth = async () => {
  const d = (await DB?.queueDepth?.().catch(() => null)) || { queued: 0, running: 0, dead: 0 };
  return { ...d, slots: SLOTS, localRunning: inFlight(), instance: INSTANCE };
};

// WHAT AN OPERATOR NEEDS AT 3AM, in one call. Not a dashboard — the four or five numbers that say
// whether work is moving: is the queue draining, are this box's slots busy, has anything given up,
// and how much of the connection budget is spent. Without these, running a fleet is guesswork; the
// depth has existed since the queue landed and nothing could read it.
export const chatMetrics = async () => {
  const q = await buildQueueDepth();
  const busy = [...sessions.values()].filter((s) => s.busy).length;
  return {
    instance: INSTANCE,
    uptimeSec: Math.round(process.uptime()),
    sessions: { inMemory: sessions.size, building: busy, withViewers: [...sessions.values()].filter((s) => s.clients.size).length },
    builds: { slots: q.slots, inFlightHere: q.localRunning, queued: q.queued, runningFleetWide: q.running, deadLettered: q.dead },
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
  };
};

export const chatStatus = () => `${sessions.size} session(s) · model ${MODEL} · ${SLOTS} build slot(s) · ${CHILD_ENV.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : "operator login"}`;

/** Stop every conductor on the way down, so an operator restart is never mistaken for a failed build. */
export async function stopChat() {
  const busy = [...sessions.values()].filter((s) => s.busy).map((s) => s.slug);
  if (busy.length) console.warn(`  ⚠ interrupting ${busy.length} build(s) in flight: ${busy.join(", ")} — their next message resumes where they stopped.`);
  for (const s of sessions.values()) { try { s.conductor?.stop(); } catch {} }
  // Hand the sessions back now. Without this a rolling deploy leaves every in-flight session leased
  // to a dead instance for the full 30 minutes, and the replacement declines to resume its own work.
  await Promise.allSettled([...sessions.values()].map((s) => { clearInterval(s.leaseT); return DB?.releaseTurn?.(s.id, INSTANCE) ?? null; }));
  // Flush anything still debounced. Cloud Run allows ~10s after SIGTERM, and dropping these timers is
  // precisely how a conversation disappears on redeploy — the last thing said is the thing lost.
  //
  // The event log goes first, and the pending PROSE before that: the last paragraph is sitting in a
  // 150ms coalesce buffer that no timer will ever fire now, and it is the most recent thing anyone
  // said — exactly what a reader replaying after the restart would notice missing.
  const logs = [];
  for (const s of sessions.values()) { flushDeltas(s); logs.push(flushLog(s)); }
  await Promise.allSettled(logs);

  if (!DB?.saveChatSession) return;
  const flushing = [];
  for (const [id, t] of dbPending) {
    clearTimeout(t);
    const s = sessions.get(id);
    if (s) flushing.push(writeSession(s));
  }
  dbPending.clear();
  if (flushing.length) console.log(`  flushing ${flushing.length} session(s) before shutdown`);
  await Promise.allSettled(flushing);
}
