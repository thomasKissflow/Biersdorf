// executor-parity.test.mjs — the express shell-first streaming guarantee must hold on BOTH transports
// (Codex continuation #3). The inline executor (app.mjs) and the V2 worker both watch the prototype parts
// and re-assemble through the shared boundary; the session-pod worker (worker.mjs) used to do neither, so
// under KF_CHAT_EXECUTOR=pod express degraded to "nothing until a model marker or turn-end". These guard
// that all three transports own the same mechanism. (A full behavioural pod run needs the control-plane +
// pod harness; these pin the mechanism's presence so it can't silently regress.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, "..", p), "utf8");

test("#3 the session-pod worker watches parts and re-assembles through the shared boundary", () => {
  const w = read("worker.mjs");
  assert.match(w, /import \{ assembleRun, indexOf \} from "\.\.\/engine\/proto-assemble\.mjs"/,
    "the pod worker uses the SAME assembleRun boundary as the inline host and V2 worker");
  const fn = w.match(/function startPartsStream\(runDir\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /watch\(watchDir, \{ recursive: true \}/, "it watches the whole prototype dir recursively (medium-aware: parts/*.html OR pages/*.jsx + proto.json)");
  assert.match(fn, /await assemblePrototype\(runDir\)/, "it re-assembles on each part write, through the medium dispatcher (html → assembleRun verbatim)");
  assert.match(fn, /shipFile\(rel\(idx\)\)/, "it ships the freshly compiled index.html");
  assert.match(fn, /ship\("marker", \{ kind: "preview"/, "…and announces a preview so the pane refreshes — no model marker required");
  // and the stream is started per-turn and torn down when the turn ends
  assert.match(w, /const stream = startPartsStream\(join\(REPO, "runs", SLUG\)\);/, "a per-turn stream is started");
  assert.match(w, /const outcome = await done;/, "the main loop awaits the turn outcome");
  assert.match(w, /await stream\.flushAndStop\(\);/, "…and does a FINAL assembly + stop when the turn completes (RR-2), never outliving it");
});

test("#1 pod terminal ordering — turn-end ships only AFTER the final assembly + artifacts (never before)", () => {
  const w = read("worker.mjs");
  // The turn-end LISTENER must NOT ship the terminal event — it only signals the main loop with the result.
  // Shipping there (the old behavior) let the control plane finalize/version the PREVIOUS prototype before
  // the last JSX write was assembled and uploaded.
  const listener = w.match(/c\.on\("turn-end", \(r\) => \{[\s\S]*?\}\);/)[0];
  assert.doesNotMatch(listener, /ship\("turn-end"/, "the turn-end listener must NOT ship — it only resolves the outcome");
  assert.match(listener, /turnDone\?\.\(\{ kind: "turn-end", r \}\)/, "…it hands the result to the main loop");
  // Strict order in the loop: flushAndStop → shipKnownArtifacts → ship turn-end → await shipping.
  const tail = w.slice(w.indexOf("const outcome = await done;"));
  assert.match(tail, /await stream\.flushAndStop\(\)[\s\S]*await shipKnownArtifacts\(\)[\s\S]*ship\("turn-end", outcome\.r\)[\s\S]*await shipping;/,
    "flush → ship artifacts → THEN ship turn-end → drain the queue (Codex #1)");
});

test("#2 the migration decision reaches the pod — migration.json rides with the turn's files", () => {
  const app = read("app.mjs");
  // decideTurnMedium writes prototype/migration.json on the control-plane host; the pod builds elsewhere and
  // only gets turn.files, so the medium must be transferred or the first HTML→React migration streams HTML.
  assert.match(app, /const migRel = `runs\/\$\{s\.slug\}\/prototype\/migration\.json`;/, "podStartTurn names the migration file");
  assert.match(app, /if \(existsSync\(join\(REPO, migRel\)\)\) files\.push\(migRel\);/, "…and ships it with the turn (Codex #2)");
  // …and the pod MIRRORS the host revert on its own persistent workspace — otherwise a reverted Q&A
  // migration leaves stale {react,building} on the PVC and the NEXT turn wrongly builds react.
  const w = read("worker.mjs");
  assert.match(w, /import \{ assemblePrototype, revertUnfinishedMigration \}/, "the pod imports the revert primitive");
  assert.match(w, /revertUnfinishedMigration\(join\(REPO, "runs", SLUG\)\)/, "the pod reverts an unfinished migration on its own disk at turn-end");
});

test("Stage 1 — the ONE Executor interface replaces the scattered EXECUTOR === \"pod\" checks", () => {
  const app = read("app.mjs");
  // the interface exists with inline + pod impls and a named worker slot
  assert.match(app, /const EXECUTORS = \{/, "there is an Executor registry");
  assert.match(app, /inline:\s*\{[\s\S]*async startTurn\(s, prompt\)[\s\S]*async cleanup\(\)/, "inline implements startTurn + cleanup");
  assert.match(app, /pod:\s*\{[\s\S]*async startTurn\(s, prompt\) \{ await podStartTurn\(s, prompt\); \}[\s\S]*async cleanup\(s, reason\)/, "pod implements startTurn (podStartTurn) + cleanup(reason)");
  assert.match(app, /EXECUTORS\.worker = EXECUTORS\.inline;/, "worker is a named slot (pooled-in-process until the Stage 2 fleet cutover)");
  assert.match(app, /const executor = EXECUTORS\[EXECUTOR\] \|\| EXECUTORS\.inline;/, "selection is KF_CHAT_EXECUTOR, inline default");
  // every dispatch/cleanup goes through the interface — NO bare `EXECUTOR === "pod"` branches remain
  assert.match(app, /await executor\.startTurn\(s, prompt\);/, "invoke() dispatches through the interface");
  assert.match(app, /executor\.cleanup\(s, "forget"\)/, "the DELETE (forget) path releases via the interface");
  assert.match(app, /executor\.cleanup\(s, "stop"\)/, "the stop path releases via the interface");
  assert.match(app, /executor\.cleanup\(s, "shutdown"\)/, "the shutdown path releases via the interface");
  assert.doesNotMatch(app, /if \(EXECUTOR === "pod"\)/, "no scattered EXECUTOR === \"pod\" checks survive");
});

test("#5 the terminal assembly is marked final on ALL executors (runtime smoke enforced, not env-only)", () => {
  const app = read("app.mjs"), pod = read("worker.mjs");
  assert.match(app, /await assemblePrototype\(runDir\(s\), \{ final: true \}\)/, "the inline host marks its turn-end assembly final");
  assert.match(pod, /await assemblePrototype\(runDir, \{ final: true \}\)/, "the pod marks its flushAndStop assembly final");
});

test("#5 the pod stream announces a preview only after a CONFIRMED upload, and has a watch fallback", () => {
  const w = read("worker.mjs");
  const ship = w.match(/async function shipFile\(rel\)[\s\S]*?\n\}/)[0];
  assert.match(ship, /if \(r\.ok\) \{ shippedAt\.set\(rel, st\.mtimeMs\); return true; \}/, "a 2xx returns true");
  assert.match(ship, /return false;\s*\/\/ non-2xx/, "a non-2xx returns false — the caller must not announce it");
  const fn = w.match(/function startPartsStream\(runDir\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(await shipFile\(rel\(idx\)\)\) \{ ship\("marker", \{ kind: "preview"/, "the preview marker + lastShipped advance are GATED on a confirmed upload");
  assert.match(fn, /watcher\.on\("error"/, "there is a watch-error handler");
  assert.match(fn, /watch create failed/, "…and a distinct watch-create-failure path");
  assert.ok((fn.match(/startPoll\(\);/g) || []).length >= 2, "BOTH the watch-error handler and the create-catch fall back to polling, not silence");
});

test("#3 the inline host and the pod worker both drive the parts→assemble→publish mechanism (shared, not duplicated)", () => {
  const app = read("app.mjs");
  assert.match(app, /s\.runWatcher = watch\(runDir\(s\)/, "the inline host watches the run dir (parts included)");
  assert.match(app, /const autoAssemble = \(s\) => assemblePrototype\(runDir\(s\)\)/, "…and re-assembles through the boundary (medium dispatcher)");
  const w = read("worker.mjs");
  assert.match(w, /function startPartsStream/, "the pod worker has its own parts stream");
  assert.match(w, /await assemblePrototype\(runDir/, "…through the same boundary (medium dispatcher)");
});
