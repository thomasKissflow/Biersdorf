// timeline-storage.test.mjs — the build timeline has to outlive the turn that failed.
//
// timeline.jsonl already reached the bucket, but only as a passenger. bundleRun() sweeps the whole
// run directory into the `run` artifact, and publishBuild() writes that — from turn-end, under
// `if (r && r.ok)`. `fatal` and `exit` never called it at all.
//
// So the timeline was durable for exactly the builds nobody needs to investigate. A turn that hung,
// crashed, or was killed by a redeploy wrote its start, its phases and its last event to a Cloud Run
// instance's local disk and then died with it — and answering "where did those nine minutes go" meant
// reading logs and inferring the rest. (Asked and answered that way on 2026-08-09.)
//
// What is pinned here is the pairing that was wrong: every way a turn can end stores the timeline,
// and storing it is not tied to success or to minting a version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "..", "app.mjs"), "utf8");
const SERVER = readFileSync(join(HERE, "..", "..", "..", "..", "control-plane", "src", "server.mjs"), "utf8");

test("every way a turn can end stores the timeline — success was never the interesting case", () => {
  for (const [name, re] of [
    ["turn-end", /"turn-end":\s*async\s*\(r\)\s*=>\s*\{[\s\S]{0,1200}?saveTimeline\(s\)/],
    ["fatal", /fatal:\s*(?:async\s*)?\(msg\)\s*=>\s*\{[^\n]*saveTimeline\(s\)/],
    ["exit", /exit:\s*(?:async\s*)?\(d\)\s*=>\s*\{[\s\S]{0,600}?saveTimeline\(s\)/],
  ]) {
    assert.match(APP, re, `${name} must store the timeline — it is the exit a failed build takes`);
  }
});

test("a failed turn stores it WITHOUT publishing a version", () => {
  const fn = APP.match(/function saveTimeline\(s\)[\s\S]*?\n\}/);
  assert.ok(fn, "saveTimeline() must exist");
  assert.ok(!/publishVersion|publishBuild/.test(fn[0]),
    "a version is the record of a build that worked — a crashed turn must not mint one");
  assert.match(fn[0], /storeBlob\(/, "it writes its own object instead");
});

test("the object is named so a human can find it by app", () => {
  const fn = APP.match(/function saveTimeline\(s\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /timelines\/\$\{s\.slug\}-\$\{s\.projectId\}\.jsonl/,
    "a project id alone is unfindable by someone who only knows what the app is called");
});

test("storing it can never be what ends a build", () => {
  const fn = APP.match(/function saveTimeline\(s\)[\s\S]*?\n\}/)[0];
  assert.ok(/\.catch\(/.test(fn), "the upload is fire-and-forget — this runs on the way out of a failing turn");
  assert.ok(!/\bawait\s+storeBlob/.test(fn), "and awaiting it would put an upload in the turn's critical path");
  assert.match(fn, /catch \{ return; \}/, "an unreadable timeline is not a reason to throw either");
});

test("the host actually hands storeBlob down — the half that silently rots", () => {
  assert.match(SERVER, /storeBlob:\s*\(objectPath, body, contentType\)\s*=>\s*artifactWrite\(/,
    "server.mjs must wire it, or saveTimeline is a no-op in production and passes every test above");
  assert.match(APP, /initChat\(\{[^}]*storeBlob: sb/, "…and initChat must accept it");
  assert.match(APP, /if \(sb\) storeBlob = sb;/);
});

test("a turn's START is recorded even on a brand new app", () => {
  const fn = APP.match(/function traceRun\(s, ev\)[\s\S]*?\n\}/);
  assert.ok(fn, "traceRun() must exist");
  assert.match(fn[0], /mkdirSync\(dir, \{ recursive: true \}\)/,
    "returning early when the run directory does not exist yet dropped the first turn's start event " +
    "on every new app — the one build whose duration anyone asks about");
  assert.ok(!/if \(!existsSync\(dir\)\) return;/.test(fn[0]));
});
