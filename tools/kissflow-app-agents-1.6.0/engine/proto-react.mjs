// proto-react.mjs — build a run's REACT prototype (see PROTO-REACT-MIGRATION.md).
//
// The design agents (kf-prototype-builder, react contract) write the run's UNIQUE React pages to
// <runDir>/prototype/pages/*.jsx plus one <runDir>/prototype/proto.json ({nav, seed}). This module
// folds the run's app-spec → kf-schema (schema-from-ir) with that seed, stages the agent's pages +
// nav into the shared starter, and single-file-builds it (KF_PROTO_SINGLEFILE + VITE_KF_PREVIEW) into
// <runDir>/prototype/index.html — the offline mock drives the data, so it needs no live SDK to view.
// There is NO generic renderer: the agents design the pages, the same kit as the live app. One kit,
// one component source; "what you saw is what gets built" by construction.
//
// The pipeline reaches this via `assemblePrototype` in the three streaming loops (KF_PROTOTYPE=react);
// `assembleReactRun` builds once and caches by the pages+proto+spec digest, so per-part calls are cheap.
//   node engine/proto-react.mjs <runDir>   # build one run's prototype by hand (validation)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, copyFileSync, renameSync, statSync, cpSync, symlinkSync } from "node:fs";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleRun } from "./proto-assemble.mjs";
import { schemaFromIr } from "./schema-from-ir.mjs";

const pExecFile = promisify(execFile);
// <repo>/starter — the ONE buildable React app. A run dir is not buildable (no node_modules/src), so
// the react prototype is built here with the run's specs injected, then the single file is copied back.
const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const STARTER_DIR = join(ENGINE_DIR, "..", "..", "..", "starter");

// ── Per-run prototype medium (migration state) ─────────────────────────────────────────────────
// The medium is a PER-RUN decision, not a process global. An existing HTML app stays HTML until a turn
// actually EDITS its prototype; that turn migrates it to React (regenerated whole) and it stays React.
// Persisted on the run so every instance/executor reads the same decision:
//   runs/<slug>/prototype/migration.json = { prototypeMedium, prototypeSourceVersion, reactMigrationStatus }
const MIGRATION = "prototype/migration.json";
export function readMigration(runDir) {
  try { return JSON.parse(readFileSync(join(runDir, MIGRATION), "utf8")); } catch { return null; }
}
function writeMigration(runDir, state) {
  const p = join(runDir, MIGRATION);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2));
}
// Which medium THIS run builds in:
//   migration.json says react/html  → that (once migrated to react, always react)
//   no state + no prototype yet (NEW) → react — react IS the prototype medium now; the legacy HTML path is
//                                       suspended, reachable per-run only via KF_PROTOTYPE=html
//   no state + existing html         → html (an app already built as HTML is NOT force-migrated; it stays
//                                       html until a prototype-editing turn calls beginReactMigration)
export function resolvePrototypeMedium(runDir) {
  const m = readMigration(runDir);
  if (m?.prototypeMedium === "react" || m?.prototypeMedium === "html") return m.prototypeMedium;
  if (!existsSync(join(runDir, "prototype", "index.html"))) return process.env.KF_PROTOTYPE === "html" ? "html" : "react";
  return "html";
}
// Mark a legacy-HTML run as migrating and keep the OLD index.html serving until the React build promotes.
// Idempotent for new/react runs. Before the first migration replaces index.html, back the EXISTING html
// prototype up ONCE to prototype/index.pre-react.html — a rollback/reference copy. Atomic (write-temp +
// rename), NEVER overwritten on retries or later streaming builds, and SEPARATE from index.verified.html
// (which is the last runtime-verified REACT build). Its path + sha256 are recorded in migration.json, and it
// is bundled (a .html under the run dir) so it survives restarts.
export function beginReactMigration(runDir, { sourceVersion } = {}) {
  const prev = readMigration(runDir) || {};
  const backupFile = join(runDir, "prototype", "index.pre-react.html");
  const liveIndex = join(runDir, "prototype", "index.html");
  let preReactBackup = prev.preReactBackup ?? null, preReactSha = prev.preReactSha ?? null;
  if (existsSync(backupFile)) {
    // already taken (this or a prior migration) — record it, but NEVER re-copy or overwrite
    if (!preReactBackup) { preReactBackup = "prototype/index.pre-react.html"; try { preReactSha = createHash("sha256").update(readFileSync(backupFile)).digest("hex"); } catch { /* record path even if hash fails */ } }
  } else if (existsSync(liveIndex)) {
    // first migration on an existing HTML prototype — atomic one-time backup
    try {
      const bytes = readFileSync(liveIndex);
      const tmp = backupFile + ".tmp";
      writeFileSync(tmp, bytes);
      renameSync(tmp, backupFile);   // atomic on the same filesystem
      preReactBackup = "prototype/index.pre-react.html";
      preReactSha = createHash("sha256").update(bytes).digest("hex");
    } catch { /* a failed backup must never block the migration */ }
  }
  writeMigration(runDir, {
    prototypeMedium: "react", reactMigrationStatus: "building",
    prototypeSourceVersion: sourceVersion ?? prev.prototypeSourceVersion ?? null,
    ...(preReactBackup ? { preReactBackup, preReactSha } : {}),
  });
}

// RR-1: the HOST-owned per-turn medium decision (call at turn start; inject the result as KF_PROTOTYPE
// into the conductor env so the agent writes the right medium). A NEW run is react by default now (react
// IS the prototype medium). The KF_REACT_MIGRATION / KF_PROTOTYPE=react gate below governs ONLY the
// remaining case — whether an app already built as HTML is migrated to react this turn (existing HTML apps
// are still not auto-migrated). A run that is already react stays react; a migration is begun DURABLY (so
// resolvePrototypeMedium reports react for the rest of the turn), and a Q&A turn that produces no react
// prototype is undone by revertUnfinishedMigration() at turn-end.
export function decideTurnMedium(runDir, { sourceVersion } = {}) {
  if (resolvePrototypeMedium(runDir) === "react") {
    // #6: PERSIST the medium if it isn't already on disk. A NEW run resolves react via KF_PROTOTYPE=react
    // with no migration.json yet — and the pod, which only receives transferred files (not KF_PROTOTYPE),
    // would then resolve HTML. Writing migration.json here makes podStartTurn ship the react decision.
    if (!readMigration(runDir)) beginReactMigration(runDir, { sourceVersion });
    return "react";
  }
  const enabled = process.env.KF_REACT_MIGRATION === "1" || process.env.KF_PROTOTYPE === "react";
  if (!enabled) return "html";
  beginReactMigration(runDir, { sourceVersion });   // durable; resolvePrototypeMedium now returns react this turn
  return "react";
}

// RR-1: at turn-end, if a migration was BEGUN but never completed (status still "building" — e.g. a Q&A
// turn that never ran the prototype phase, so no react prototype was built/promoted), undo it so the run
// is not left half-migrated. A promoted build is "done" and a failed one is "failed" — neither is touched.
export function revertUnfinishedMigration(runDir) {
  if (readMigration(runDir)?.reactMigrationStatus === "building") { try { rmSync(join(runDir, MIGRATION)); } catch { /* nothing to revert */ } }
}

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";

// ── Streaming dispatch seam ───────────────────────────────────────────────────────────────────
// The live streaming loops (chat/app.mjs inline, chat/worker.mjs pod) call this. `html`
// delegates to `assembleRun` VERBATIM — zero behavior change; `react` builds the agent's React pages.
// opts.final marks the TERMINAL assembly of a turn (the turn-end sites pass it). On the terminal react
// build the runtime smoke is enforced by default (#5) — the version that gets frozen/deployed is the one
// that must be proven to mount. Streaming builds do not smoke (latency); KF_REACT_SMOKE=1 forces it on all.
export async function assemblePrototype(runDir, opts = {}) {
  if (resolvePrototypeMedium(runDir) !== "react") return assembleRun(runDir); // html: unchanged
  return assembleReactRun(runDir, opts);
}

// #7: each run builds in its OWN workspace (runDir/.proto-build, node_modules symlinked from the starter),
// so builds no longer mutate — or serialize on — the one shared starter tree. Digest maps track built vs.
// requested (the latter powers the dirty-rebuild in #6); coalescing is per-run, and different runs build
// concurrently.
const reactBuiltDigest = new Map();    // runDir → digest of the last SUCCESSFUL build
const reactLatestDigest = new Map();   // runDir → digest most recently requested
const reactBuildInFlight = new Map();  // runDir → the in-flight build promise

// The run's react inputs + their digest, or null if the agent hasn't written them yet. Inputs are the
// run's OWN artifacts: app-spec.json (→ kf-schema), prototype/proto.json (nav + seed), prototype/pages/*.jsx.
function reactInputs(runDir) {
  const protoJson = join(runDir, "prototype", "proto.json");
  const pagesDir = join(runDir, "prototype", "pages");
  const specPath = join(runDir, "app-spec.json");
  if (!existsSync(protoJson) || !existsSync(pagesDir) || !existsSync(specPath)) return null;
  const pageFiles = readdirSync(pagesDir).filter((f) => f.endsWith(".jsx")).sort();
  if (!pageFiles.length) return null;
  const h = createHash("sha1").update(readFileSync(protoJson)).update(readFileSync(specPath));
  for (const f of pageFiles) h.update(f).update(readFileSync(join(pagesDir, f)));
  return { protoJson, pagesDir, specPath, pageFiles, digest: h.digest("hex") };
}

// Contract-compatible with assembleRun: false when there's nothing to build yet, truthy once the run's
// prototype/index.html is a fresh react single-file. Async; per-run (not serialized on a shared tree). A
// failed build returns false and KEEPS the last good prototype (never rejects into the stream loop).
export async function assembleReactRun(runDir, opts = {}) {
  const inp0 = reactInputs(runDir);
  if (!inp0) return false;   // agent hasn't produced pages yet — the floor
  reactLatestDigest.set(runDir, inp0.digest);
  const indexHtml = join(runDir, "prototype", "index.html");
  // #4: if a build is already in flight, wait for it. A NON-final call may return that promise. A FINAL call
  // must NOT — a non-final in-flight build never ran the terminal smoke, so after it settles we fall through
  // to a fresh pass here that will either cache-hit-smoke or rebuild the latest.
  if (reactBuildInFlight.has(runDir)) {
    const inflight = reactBuildInFlight.get(runDir);
    if (!opts.final) return inflight;
    try { await inflight; } catch { /* its own failure was recorded; re-check below */ }
  }
  // Cache hit — re-read inputs (a write may have landed while awaiting the in-flight build). Streaming builds
  // are NOT smoked (latency), so the TERMINAL assembly must smoke the promoted artifact here (#5); otherwise
  // the common "nothing changed at turn-end" path would freeze an unverified build. A smoke failure records
  // the run failed and returns false (the artifact stands, but the turn is not reported clean-ready).
  const cur = reactInputs(runDir);
  if (cur && reactBuiltDigest.get(runDir) === cur.digest && existsSync(indexHtml)) {
    if ((opts.final || process.env.KF_REACT_SMOKE === "1")) {
      const verifiedFile = join(runDir, "prototype", "index.verified.html");
      try { await smokeStagedReact(indexHtml, protoNav(runDir)); try { copyFileSync(indexHtml, verifiedFile); } catch {} }   // passed → this promoted build is now the last-verified
      catch (e) {
        console.warn(`proto-react: terminal runtime smoke failed (${e.message})`);
        // #4: the failing build was ALREADY promoted during streaming (streaming builds don't smoke). Restore
        // the last runtime-verified prototype so a broken/blank preview does not stay on screen.
        if (existsSync(verifiedFile)) { try { copyFileSync(verifiedFile, indexHtml); } catch {} }
        try { writeMigration(runDir, { ...(readMigration(runDir) || { prototypeMedium: "react" }), reactMigrationStatus: "failed", lastError: String(e.message || e) }); } catch {}
        return false;
      }
    }
    return true;
  }

  const p = buildReactUntilStable(runDir, opts)
    .catch((e) => {
      console.warn(`proto-react: react build failed (${e.message}) — keeping the last good prototype`);
      try { writeMigration(runDir, { ...(readMigration(runDir) || { prototypeMedium: "react" }), reactMigrationStatus: "failed", lastError: String(e.message || e) }); } catch { /* best effort */ }
      return false;   // the live index.html was never touched (build stages then promotes) → old prototype stands
    })
    .finally(() => reactBuildInFlight.delete(runDir));
  reactBuildInFlight.set(runDir, p);
  return p;
}

// The run's nav (for the smoke's label check), read straight from proto.json — cheap, no build needed.
function protoNav(runDir) {
  try {
    const proto = JSON.parse(readFileSync(join(runDir, "prototype", "proto.json"), "utf8"));
    return (proto.nav || []).map((m) => ({ name: m.name, items: (m.items || []).map((it) => ({ label: it.label || it.page })) }));
  } catch { return []; }
}

// #6: build, then if the inputs changed WHILE building (a page landed mid-stage), rebuild with the newer
// inputs — so the promoted prototype always reflects the final writes, never a stale mid-turn snapshot.
async function buildReactUntilStable(runDir, opts = {}) {
  for (let i = 0; i < 4; i++) {
    const inp = reactInputs(runDir);
    if (!inp) return false;
    // buildReactFromRun reports whether the promoted build reflects the LATEST inputs (checked AFTER the
    // build, so a mid-build write is caught). If stable, we're done — and it already smoked when `final`.
    const stableNow = await buildReactFromRun(runDir, inp, { final: Boolean(opts.final) });   // throws on failure → caller keeps the old prototype
    reactBuiltDigest.set(runDir, inp.digest);
    if (stableNow) return true;
  }
  return false;   // #4: never stabilized within the bound — do NOT claim success (a late write may be unbuilt)
}

// #5: the run's shell archetype must reach app-shell.jsx (it reads ui-spec.app.shell). Source it from
// proto.json (app.shell) or the run's experience-spec (design.shell.archetype). hero-band is NOT in the
// supported set until it has a real layout — an unknown archetype resolves to null (app-shell's rail-left
// default), explicit rather than a silent mis-render.
const SHELL_ARCHETYPES = new Set(["rail-left", "rail-dark", "top-bar", "rail-right"]);
function stageUiSpec(runDir, proto, kfSchema) {
  let shell = proto.app?.shell || null;
  if (!shell) { try { shell = JSON.parse(readFileSync(join(runDir, "prototype", "experience-spec.json"), "utf8"))?.design?.shell?.archetype || null; } catch { /* no experience-spec */ } }
  if (shell && !SHELL_ARCHETYPES.has(shell)) shell = null;
  return { app: { id: kfSchema.app?.id || null, name: kfSchema.app?.name || null, shell } };
}

// RR-3: verify a STAGED build before it is allowed to replace the last good prototype. Static, but
// meaningful: the file must be non-trivial, carry every nav label the agent declared (a page that
// silently dropped from the build fails here), and contain no unresolved build token. Throwing keeps the
// old prototype. (A full runtime smoke test — mount + switch each role headlessly — is the stronger
// follow-on; it reuses the same headless harness capture-screens.mjs already uses.)
function verifyStagedReact(stagedFile, nav) {
  if (statSync(stagedFile).size < 50_000) throw new Error("react verify: build produced a suspiciously small file");
  const html = readFileSync(stagedFile, "utf8");
  if (html.includes("__VITE_PRELOAD__")) throw new Error("react verify: unresolved __VITE_PRELOAD__ in the build");
  for (const m of nav || []) for (const it of m.items || []) {
    if (it.label && !html.includes(it.label)) throw new Error(`react verify: nav item "${it.label}" is missing from the build — role/route incomplete`);
  }
}

// Locate a headless Chrome, same discipline as capture-screens.mjs.
function chromeBin() {
  const cands = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean);
  for (const c of cands) {
    if (c.includes("/")) { if (existsSync(c)) return c; continue; }
    try { const w = spawnSync("which", [c], { encoding: "utf8" }); if (w.status === 0 && w.stdout.trim()) return w.stdout.trim(); } catch { /* keep looking */ }
  }
  return null;
}

// A classic (non-module) collector — parsed and run BEFORE the deferred app module, so its error handlers
// and console.error hook are installed before React mounts. After the virtual-time budget it serializes a
// verdict (collected errors + rendered #root length) onto <html data-smoke='…'> for --dump-dom to read.
const SMOKE_JS = "<script>(function(){var E=[];" +
  "addEventListener('error',function(e){E.push(String((e&&e.message)||(e&&e.error&&e.error.message)||'error'))});" +
  "addEventListener('unhandledrejection',function(e){E.push('unhandledrejection: '+String((e&&e.reason&&e.reason.message)||(e&&e.reason)))});" +
  "var ce=console.error;console.error=function(){try{E.push('console.error: '+Array.prototype.map.call(arguments,String).join(' '))}catch(_){}return ce.apply(console,arguments)};" +
  "function v(){try{var r=document.getElementById('root')||document.body;var t=((r&&r.textContent)||'').replace(/\\s+/g,' ').trim();" +
  "document.documentElement.setAttribute('data-smoke',JSON.stringify({errors:E.slice(0,20),rootLen:t.length}))}catch(_){}}" +
  "setTimeout(v,3000);})();</script>";

// #5 (Codex): the static verify above cannot catch VALID JavaScript that throws while React mounts, routes,
// or switches roles — it would atomically replace a working prototype with a blank one. This mounts the
// staged single-file in headless Chrome, collects window.onerror / unhandledrejection / console.error during
// mount, and requires a non-empty #root; it THROWS (→ keep the last good prototype, exactly like the static
// verify) on any runtime error or an empty mount. Gated by KF_REACT_SMOKE=1 because it costs a Chrome launch
// per build — enable it for the migration rollout / on the terminal candidate. When no Chrome is available it
// skips (does not block), so the static verify remains the always-on floor.
export async function smokeStagedReact(stagedFile, nav) {
  const CHROME = chromeBin();
  if (!CHROME) {
    // #5: in production the image MUST ship a headless Chrome, or the runtime verifier silently degrades to a
    // no-op (it did on the git+ca-certs-only image). KF_REACT_SMOKE_REQUIRED=1 (set in the deploy) turns a
    // missing Chrome into a HARD failure for terminal builds; dev/tests without it still skip gracefully.
    if (process.env.KF_REACT_SMOKE_REQUIRED === "1") throw new Error("runtime smoke required (KF_REACT_SMOKE_REQUIRED=1) but no headless Chrome is available in this image");
    console.warn("proto-react smoke: no headless Chrome — skipping runtime verify (static verify still applied)");
    return;
  }
  const injected = readFileSync(stagedFile, "utf8").replace(/<\/body>/i, SMOKE_JS + "</body>");
  const tmp = join(dirname(stagedFile), ".smoke.html");
  writeFileSync(tmp, injected);
  try {
    const { stdout } = await pExecFile(CHROME, ["--headless", "--disable-gpu", "--no-sandbox", "--ignore-certificate-errors",
      "--dump-dom", "--virtual-time-budget=6000", "--run-all-compositor-stages-before-draw", "file://" + tmp],
      { maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
    const dom = stdout || "";
    const m = dom.match(/data-smoke='([^']*)'|data-smoke="([^"]*)"/);
    if (!m) throw new Error("runtime smoke: the app never reported readiness — mount likely threw before first paint");
    let verdict; try { verdict = JSON.parse((m[1] || m[2]).replace(/&quot;/g, '"')); } catch { throw new Error("runtime smoke: unreadable verdict"); }
    if (verdict.errors?.length) throw new Error(`runtime smoke: ${verdict.errors.length} console/runtime error(s) during mount — ${verdict.errors.slice(0, 3).join(" | ")}`);
    if (!(verdict.rootLen > 20)) throw new Error("runtime smoke: #root mounted empty — the app rendered nothing");
    for (const mm of nav || []) for (const it of mm.items || []) {
      if (it.label && !dom.includes(it.label)) throw new Error(`runtime smoke: nav item "${it.label}" absent after mount`);
    }
  } finally { try { rmSync(tmp); } catch { /* best effort */ } }
}

// #7: a per-run build workspace (runDir/.proto-build) — a faithful copy of the starter tree (src, scripts,
// config, lib) with node_modules SYMLINKED from the starter (no copy). Created once per run and reused
// across its rebuilds. Because each run owns its workspace, builds neither mutate nor serialize on the one
// shared starter tree. The copy is faithful (scripts/ + the whole src/) so `npm run build`'s prebuild
// guardrails run exactly as they did in the shared-starter build — same output, now isolated. Exported so
// deploy (#3) reuses it. Skips node_modules (symlinked) and dist/.proto-build (build outputs).
const WS_SKIP = new Set(["node_modules", "dist", ".proto-build"]);
export function ensureWorkspace(runDir) {
  const ws = join(runDir, ".proto-build");
  const nm = join(ws, "node_modules");
  if (existsSync(join(ws, "src")) && existsSync(nm)) return ws;   // reuse
  rmSync(ws, { recursive: true, force: true });
  mkdirSync(ws, { recursive: true });
  for (const entry of readdirSync(STARTER_DIR)) {
    if (WS_SKIP.has(entry)) continue;
    cpSync(join(STARTER_DIR, entry), join(ws, entry), { recursive: true });
  }
  mkdirSync(join(ws, "lib"), { recursive: true });
  mkdirSync(join(ws, "src", "pages", "proto"), { recursive: true });
  try { symlinkSync(join(STARTER_DIR, "node_modules"), nm, "dir"); } catch { /* already linked */ }
  return ws;
}

// One react build → a STAGED single-file, verified, then ATOMICALLY promoted over the live prototype.
// The live prototype/index.html is untouched until a good build exists, so a failure keeps the last good
// one. Folds the agent's seed via schema-from-ir, stages the agent's OWN pages (no generic renderer) into
// the run's OWN workspace — nothing in the shared starter is touched, so nothing needs restoring.
async function buildReactFromRun(runDir, { protoJson, pagesDir, pageFiles, specPath, digest }, opts = {}) {
  const outFile = join(runDir, "prototype", "index.html");
  const appSpec = JSON.parse(readFileSync(specPath, "utf8"));
  const proto = JSON.parse(readFileSync(protoJson, "utf8"));   // { nav:[{name,items:[{page,label,roles}]}], seed:{"Flow Name":[rows]} }
  const { schema: kfSchema } = schemaFromIr(appSpec, { seed: proto.seed || null, domain: appSpec.domain });
  const nav = (proto.nav || []).map((m) => ({
    name: m.name,
    items: (m.items || []).map((it) => ({ to: "/proto/" + slug(it.page), label: it.label || it.page, roles: it.roles || [] })),
  }));

  const ws = ensureWorkspace(runDir);
  const lib = join(ws, "lib");
  const wsPages = join(ws, "src", "pages", "proto");
  const stageDir = join(runDir, "prototype", "react-next");
  writeFileSync(join(lib, "kf-schema.json"), JSON.stringify(kfSchema, null, 2));
  writeFileSync(join(lib, "nav.json"), JSON.stringify(nav, null, 2));
  writeFileSync(join(lib, "ui-spec.json"), JSON.stringify(stageUiSpec(runDir, proto, kfSchema), null, 2));   // #5: carry the run's shell archetype
  rmSync(wsPages, { recursive: true, force: true });
  mkdirSync(wsPages, { recursive: true });
  for (const f of pageFiles) copyFileSync(join(pagesDir, f), join(wsPages, f));   // the agent's React pages → routes /proto/<slug>
  try {
    // KF_PROTO_SINGLEFILE → one self-contained index.html (the single-file publish contract).
    // VITE_KF_PREVIEW → boots the offline mock in the preview pane without a ?preview=1 URL.
    // KF_ENGINE_DIR pins the prebuild guardrails' engine lookup — the workspace lives outside the starter,
    // so the walk-up-from-cwd fallback (which worked from starter/) can't find ui-lint.mjs on its own.
    await pExecFile("npm", ["run", "build"], { cwd: ws, env: { ...process.env, KF_PROTO_SINGLEFILE: "1", VITE_KF_PREVIEW: "1", KF_ENGINE_DIR: ENGINE_DIR }, maxBuffer: 64 * 1024 * 1024 });
    // Stage → verify → atomically promote. The live prototype is only ever replaced by a whole, verified file.
    mkdirSync(stageDir, { recursive: true });
    const stagedFile = join(stageDir, "index.html");
    copyFileSync(join(ws, "dist", "index.html"), stagedFile);
    verifyStagedReact(stagedFile, nav);   // RR-3: throws (→ keep old prototype) if the build is incomplete
    // #4: stability is knowable ONLY now — did a write land WHILE this build ran? If the latest requested
    // digest still equals what we just built, this is the terminal candidate; otherwise the caller will
    // rebuild the newer inputs, so this non-terminal round does not pay the runtime-smoke cost.
    const stableNow = reactLatestDigest.get(runDir) === digest;
    if (stableNow && (opts.final || process.env.KF_REACT_SMOKE === "1")) await smokeStagedReact(stagedFile, nav);   // #5: runtime mount check before promote (Chrome-gated)
    mkdirSync(dirname(outFile), { recursive: true });
    renameSync(stagedFile, outFile);   // atomic on the same filesystem — a reader sees old-or-new, never partial
    writeMigration(runDir, { ...(readMigration(runDir) || {}), prototypeMedium: "react", reactMigrationStatus: "done" });   // spread preserves preReactBackup/sha + sourceVersion across promotion
    // #4: snapshot the LAST RUNTIME-VERIFIED prototype — a terminal build that passed the smoke. On a later
    // cache-hit terminal smoke FAILURE (a broken build promoted during streaming), this is restored so the
    // user never keeps looking at a runtime-broken/blank preview.
    if (stableNow && (opts.final || process.env.KF_REACT_SMOKE === "1")) { try { copyFileSync(outFile, join(runDir, "prototype", "index.verified.html")); } catch { /* best effort */ } }
    return stableNow;   // #4: tell the caller whether the promoted build reflects the LATEST inputs
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

// CLI — build one run's react prototype by hand. The pipeline itself never calls this; it goes
// through `assemblePrototype` in the streaming loop. Handy for validating a run's agent output.
if (import.meta.url === `file://${process.argv[1]}`) {
  const runDir = process.argv[2];
  if (!runDir) { console.error("usage: node engine/proto-react.mjs <runDir>   # builds <runDir>/prototype/index.html from prototype/pages/*.jsx + proto.json + app-spec.json"); process.exit(2); }
  const ok = await assembleReactRun(runDir);
  console.log(ok ? `proto-react: built ${join(runDir, "prototype", "index.html")}` : "proto-react: nothing to build (need prototype/pages/*.jsx + prototype/proto.json + app-spec.json)");
  if (!ok) process.exit(1);
}
