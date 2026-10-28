// version-dedupe.test.mjs — a version when the app changed, not when a turn ended.
//
// publishBuild ran on every successful turn, so answering a question, correcting a word, or a turn
// that touched nothing at all each minted a complete version: prototype, blueprint, spec, seed and a
// ~350KB run bundle. BriefingHub produced three in five minutes (measured 2026-08-10, 11:01 / 11:02 /
// 11:06). A list that long is not a history anybody reads, and every entry costs the full artifact
// set.
//
// What the digest covers is the whole design, so it is asserted rather than described: the run bundle
// carries timeline.jsonl, which gains an entry every turn BY DESIGN, so including it would make every
// digest unique and dedupe precisely nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "..", "app.mjs"), "utf8");
const CORE = readFileSync(join(HERE, "..", "session-core.mjs"), "utf8");
const publish = APP.match(/async function publishBuild\(s\) \{[\s\S]*?\n\}/)[0];

test("the digest covers what defines the app, and nothing that changes every turn", () => {
  assert.match(publish, /for \(const cls of \["prototype", "review", "ir", "seed"\]\)/);
  const line = publish.match(/for \(const cls of \[[^\]]*\]\)/)[0];
  for (const noisy of ["run", "decisions"]) {
    assert.ok(!line.includes(`"${noisy}"`),
      `"${noisy}" changes on turns that changed nothing — including it dedupes nothing at all`);
  }
});

test("an unchanged turn publishes no version", () => {
  assert.match(publish, /if \(fingerprint === s\.artifactDigest\) \{[\s\S]*?return \{ ok: true/);
  assert.match(publish, /no artifact changed this turn/, "…and says so, so a missing version is not a mystery");
});

test("the digest is recorded only after the write lands", () => {
  const i = publish.indexOf("await publishVersion");
  const j = publish.indexOf("s.artifactDigest = fingerprint");
  assert.ok(i > 0 && j > i,
    "recording it first would remember a FAILED publish as done and skip the retry next turn");
});

test("#15 the version must carry EVERY submitted class, not just the prototype", () => {
  // A partial callback (prototype present, review/ir/seed dropped) must NOT be accepted as durably
  // published — publishBuild computes the missing set over ALL submitted classes and fails on any gap.
  assert.match(publish, /Object\.keys\(files\)\.filter\(\(cls\) => !v\?\.artifacts\?\.\[cls\]\)/,
    "the missing set is computed over every submitted class");
  assert.match(publish, /if \(!v \|\| missing\.length\)/, "no version OR any missing class fails the publish");
  // and the digest is only recorded on the all-present path
  const guard = publish.indexOf("missing.length");
  const digest = publish.indexOf("s.artifactDigest = fingerprint");
  assert.ok(guard > 0 && digest > guard, "the completeness guard precedes recording the digest");
});

test("it survives a restart, or the first turn after every deploy duplicates", () => {
  assert.match(CORE, /artifactDigest,[^}]*\} = s;/, "snapshotOf is a whitelist — an unlisted field is dropped");
  assert.match(CORE, /turnAttempts, artifactDigest,/, "artifactDigest stays in the persisted whitelist");
  assert.match(publish, /persist\(s\);/, "…and it has to be written when it changes");
});

test("the same artifacts really do produce the same fingerprint", () => {
  // the comparison itself, run rather than read: same bytes in, same hex out; one byte different, not
  const fp = (files) => {
    const d = createHash("sha256");
    for (const cls of ["prototype", "review", "ir", "seed"]) if (files[cls]) d.update(cls).update(files[cls]);
    return d.digest("hex");
  };
  const a = { prototype: Buffer.from("<html>x</html>"), ir: Buffer.from("{}") };
  assert.equal(fp(a), fp({ ...a }));
  assert.notEqual(fp(a), fp({ ...a, ir: Buffer.from("{ }") }));
  // and the class name is mixed in, so moving bytes between artifacts is not a collision
  assert.notEqual(fp({ prototype: Buffer.from("same") }), fp({ ir: Buffer.from("same") }));
});
