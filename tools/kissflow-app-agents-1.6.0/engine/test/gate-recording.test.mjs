// gate-recording.test.mjs — the pipeline ledger must be reliable: atomic, corruption-loud, and safe
// under concurrent recorders (#12). The apply guard trusts pipeline-state.json; a lost verdict either
// wrongly refuses a passed chain or waves through a gate that said BLOCK.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { recordVerdict, readState } from "../pipeline.mjs";

const PIPELINE_URL = new URL("../pipeline.mjs", import.meta.url).href;   // absolute — so a temp-dir writer can import it

test("#12 a verdict round-trips and only PASS/BLOCK are accepted", () => {
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    recordVerdict(dir, "spec", "PASS", "ok");
    recordVerdict(dir, "gate", "BLOCK", "two defects");
    const s = readState(dir);
    assert.equal(s.passed.spec.verdict, "PASS");
    assert.equal(s.passed.gate.verdict, "BLOCK");
    assert.throws(() => recordVerdict(dir, "x", "MAYBE"), /PASS or BLOCK/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("#12 a corrupt (half-written) state file is loud and fails safe, not silently 'all passed'", () => {
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    writeFileSync(join(dir, "pipeline-state.json"), '{"passed":{"spec":{"verdict":"PA');  // truncated
    const warnings = [];
    const orig = console.warn; console.warn = (m) => warnings.push(String(m));
    try {
      const s = readState(dir);
      assert.deepEqual(s, { passed: {} }, "unreadable → empty (guard refuses to advance), never a fabricated pass");
    } finally { console.warn = orig; }
    assert.ok(warnings.some((w) => /unreadable/.test(w)), "corruption is WARNED, not swallowed");
    // and a fresh record heals it atomically
    recordVerdict(dir, "spec", "PASS");
    assert.equal(readState(dir).passed.spec.verdict, "PASS");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("#12 no temp/lock debris is left behind after a normal record", () => {
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    recordVerdict(dir, "spec", "PASS");
    const leftovers = readdirSync(dir).filter((f) => f.includes(".tmp") || f.endsWith(".lock"));
    assert.deepEqual(leftovers, [], "temp + lock are cleaned up");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("#12 TRULY concurrent recorders (separate processes) do NOT lose each other's verdicts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    // 12 stages recorded from 12 processes running AT THE SAME TIME into the SAME ledger. The previous
    // version used spawnSync in a loop, which blocks until each child exits — the writers ran serially and
    // never actually contended (Codex continuation #5). Use async spawn + Promise.all so they overlap, and
    // put the writer script in the TEMP dir (importing pipeline by absolute URL), never in the source tree.
    const N = 12;
    const script = join(dir, "_gate-writer.mjs");
    writeFileSync(script, `import { recordVerdict } from ${JSON.stringify(PIPELINE_URL)};\nrecordVerdict(process.argv[2], process.argv[3], "PASS", "c");\n`);
    const run = (i) => new Promise((resolve) => {
      const k = spawn(process.execPath, [script, dir, `stage${i}`], { stdio: ["ignore", "ignore", "pipe"] });
      let err = ""; k.stderr.on("data", (d) => (err += d));
      k.on("close", (code) => resolve({ code, err }));
    });
    const results = await Promise.all(Array.from({ length: N }, (_, i) => run(i)));   // all launched before any awaited
    for (const r of results) assert.equal(r.code, 0, r.err);
    const recorded = Object.keys(readState(dir).passed || {}).sort();
    assert.equal(recorded.length, N, `all ${N} concurrent verdicts survived, got ${recorded.length}: ${recorded}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("continuation #5 a verdict write REFUSES to proceed without the lock (no unlocked last-writer-wins)", () => {
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    mkdirSync(join(dir, "pipeline-state.json.lock"));   // a held/stale lock nobody releases
    // recordVerdict must throw after its ~1s acquisition window rather than writing the ledger unlocked.
    assert.throws(() => recordVerdict(dir, "gate", "PASS"), /lock .* not acquired/i,
      "an unacquired lock is a hard error, not a silent unlocked write");
    // and it wrote NOTHING — the ledger stays absent, so the guard refuses to advance
    assert.ok(!existsSync(join(dir, "pipeline-state.json")), "no ledger was written while the lock was held");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("continuation #2 a gate PASS is INVALIDATED when the inputs it validated change", async () => {
  const { status } = await import("../pipeline.mjs");
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    writeFileSync(join(dir, "app-spec.json"), JSON.stringify({ app: { name: "v1" } }));
    recordVerdict(dir, "gate", "PASS", "structure ok");
    let gate = status(dir, "quick").find((s) => s.id === "gate");
    assert.equal(gate.done, true, "a fresh PASS against the current spec is done");
    // replace the spec the gate validated — the PASS is now stale and must not count
    writeFileSync(join(dir, "app-spec.json"), JSON.stringify({ app: { name: "changed after pass" } }));
    gate = status(dir, "quick").find((s) => s.id === "gate");
    assert.equal(gate.done, false, "the PASS no longer counts once its input changed");
    assert.equal(gate.stale, true, "…and it is reported stale");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("continuation #3 a prototype PASS is invalidated when index.html is replaced", async () => {
  const { status } = await import("../pipeline.mjs");
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    mkdirSync(join(dir, "prototype"), { recursive: true });
    writeFileSync(join(dir, "app-spec.json"), JSON.stringify({ app: { name: "p" } }));
    writeFileSync(join(dir, "prototype", "experience-spec.json"), JSON.stringify({ design: { palette: {}, rationale: "x" } }));
    writeFileSync(join(dir, "prototype", "index.html"), "<html><body>clean prototype</body></html>");
    recordVerdict(dir, "prototype", "PASS", "clean");
    let proto = status(dir, "quick").find((s) => s.id === "prototype");
    assert.equal(proto.done, true, "a fresh prototype PASS against the current page is done");
    // replace the verified page with broken HTML — the PASS must no longer count
    writeFileSync(join(dir, "prototype", "index.html"), "<html><body>broken replacement</body></html>");
    proto = status(dir, "quick").find((s) => s.id === "prototype");
    assert.equal(proto.done, false, "a replaced prototype invalidates the pass — no stale deploy");
    assert.equal(proto.stale, true, "…and it is reported stale");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("round-7 #3 a signoff PASS does NOT clear deploy when review.html is absent", async () => {
  const { status, missingFor } = await import("../pipeline.mjs");
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    mkdirSync(join(dir, "prototype"), { recursive: true });
    // everything the comprehensive deploy needs EXCEPT review.html, plus all the recorded verdicts
    writeFileSync(join(dir, "app-spec.json"), "{}");
    writeFileSync(join(dir, "prototype", "experience-spec.json"), "{}");
    writeFileSync(join(dir, "prototype", "index.html"), "<html></html>");
    for (const g of ["spec", "gate", "verify", "verifier", "design", "prototype", "signoff"]) recordVerdict(dir, g, "PASS", "x");
    const signoff = status(dir, "comprehensive").find((s) => s.id === "signoff");
    assert.equal(signoff.done, false, "sign-off with no review.html is NOT done — approval needs something to review");
    const missing = missingFor(dir, "deploy", "comprehensive").map((m) => m.id || m);
    assert.ok(missing.includes("signoff"), "and comprehensive deploy is refused while the sign-off input is missing");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("round-7 #7 a STALE lock (crashed writer) is reclaimed, not a permanent outage", () => {
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    const lock = join(dir, "pipeline-state.json.lock");
    mkdirSync(lock);                                   // a lock left behind by a killed writer
    utimesSync(lock, new Date(Date.now() - 120_000), new Date(Date.now() - 120_000));   // 2 min old → provably stale
    // recordVerdict must reclaim it and succeed, rather than throwing forever
    recordVerdict(dir, "gate", "PASS", "after crash");
    assert.equal(readState(dir).passed.gate.verdict, "PASS", "the verdict was written after reclaiming the stale lock");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("continuation #6 a human signoff PASS is invalidated when the reviewed app changes", async () => {
  const { status } = await import("../pipeline.mjs");
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    mkdirSync(join(dir, "prototype"), { recursive: true });
    for (const [f, c] of [["app-spec.json", "{}"], ["review.html", "<html></html>"],
      ["prototype/experience-spec.json", "{}"], ["prototype/index.html", "<html></html>"]]) writeFileSync(join(dir, f), c);
    recordVerdict(dir, "signoff", "PASS", "approved");
    let signoff = status(dir, "comprehensive").find((s) => s.id === "signoff");
    assert.equal(signoff.done, true, "sign-off is valid for the version it approved");
    writeFileSync(join(dir, "app-spec.json"), JSON.stringify({ app: { name: "changed after approval" } }));
    signoff = status(dir, "comprehensive").find((s) => s.id === "signoff");
    assert.equal(signoff.done, false, "approval does not survive a change to the reviewed app — re-sign required");
    assert.equal(signoff.stale, true, "…and it is reported stale");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("continuation #1 a recorded design BLOCK makes the design stage NOT done", async () => {
  const { status } = await import("../pipeline.mjs");
  const dir = mkdtempSync(join(tmpdir(), "kf-gate-"));
  try {
    mkdirSync(join(dir, "prototype"), { recursive: true });
    // a design artifact that would pass the content floor on its own (palette + rationale present)…
    writeFileSync(join(dir, "prototype", "experience-spec.json"), JSON.stringify({ design: { palette: { accent: "#123456" }, rationale: "chosen" } }));
    // …but the verifier recorded a BLOCK. Design is an ARTIFACT stage, not gate-flagged — the BLOCK must
    // still win, or a design the verifier rejected ships (Codex continuation #1).
    recordVerdict(dir, "design", "BLOCK", "no archetype");
    const design = status(dir, "quick").find((s) => s.id === "design");
    assert.equal(design.verdict, "BLOCK", "the BLOCK verdict is read for the artifact stage too");
    assert.equal(design.done, false, "a BLOCKed design is not done, despite a present, non-placeholder artifact");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
