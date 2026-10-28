// orchestrator.test.mjs — the executable build contract (#8) and atomic gate/verdict wiring (#9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildRequest, plan, runGate, drive, clearFor, GATE_RUNNERS, AGENT_GATES, HUMAN_GATES } from "../orchestrator.mjs";
import { readState, recordVerdict } from "../pipeline.mjs";

// gate-clean: a computed field (satisfies NO_BUSINESS_LOGIC) + an automation (AUTOMATIONS_MISSING).
const GOOD_IR = { app: { name: "Orch Probe" }, roles: [{ id: "r1", name: "Approver" }],
  forms: [{ name: "Request", flowType: "Process",
    fields: [{ name: "Amount", type: "number" }, { name: "Tax", type: "number", formula: "Amount * 0.1" }],
    workflow: { steps: [{ name: "Submit", actor: "r1" }, { name: "End" }] } }],
  permissions: [{ role: "Approver", flow: "Request", level: "Editable" }],
  automations: [{ id: "a1", type: "notify", trigger: "Request submitted", target_flow: "Request" }] };
const mkRun = (ir) => { const d = mkdtempSync(join(tmpdir(), "orch-")); writeFileSync(join(d, "app-spec.json"), JSON.stringify(ir)); return d; };

test("buildRequest normalizes mode/renderer/review — express is one strategy, comprehensive another", () => {
  assert.equal(buildRequest({ mode: "express" }).mode, "quick");
  assert.equal(buildRequest({ mode: "comprehensive" }).review, "pause");   // comprehensive pauses for sign-off
  assert.equal(buildRequest({ mode: "express" }).review, "auto");          // express does not
  assert.equal(buildRequest({ renderer: "bogus" }).renderer, "native-ai"); // unknown renderer falls back, never crashes
});

test("plan — express gates are a SUBSET of comprehensive's (different strategies, shared floor) (#8)", () => {
  const q = plan({ mode: "quick" }).stages.filter((s) => s.gate).map((s) => s.id);
  const c = plan({ mode: "comprehensive" }).stages.filter((s) => s.gate).map((s) => s.id);
  for (const g of q) assert.ok(c.includes(g), `comprehensive must also gate ${g}`);   // express gates ⊆ comprehensive gates
  assert.ok(c.length > q.length, "comprehensive gates strictly MORE — the two are different strategies, not one plan at two speeds");
  assert.ok(q.includes("gate") && q.includes("prototype"), "both modes gate the shared floor: structure + prototype");
});

test("runGate RUNS the check AND records the verdict — atomically, matching the result (#9)", async () => {
  const d = mkRun(GOOD_IR);
  try {
    assert.deepEqual(readState(d).passed || {}, {}, "no verdict before — nothing runs it but runGate");
    const r = await runGate(d, "gate");
    assert.ok(r.recorded, "the verdict is written as part of running — one act, no separate `pass` step");
    // the ON-DISK verdict must EQUAL the returned result, whichever it is. This is the #9 guarantee:
    // a gate you can run without recording the truthful verdict does not exist.
    assert.equal(readState(d).passed.gate.verdict, r.pass ? "PASS" : "BLOCK", "recorded verdict matches the gate's actual result");
    assert.ok(readState(d).passed.gate.at, "and it is timestamped");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("a BLOCK is recorded as BLOCK, never as done", async () => {
  const d = mkRun({ app: { name: "Broken" } });  // no roles/forms → structural blockers
  try {
    const r = await runGate(d, "gate");
    assert.equal(r.pass, false);
    assert.equal(readState(d).passed.gate.verdict, "BLOCK", "a failed gate records BLOCK, so the guard can't be satisfied by it");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("runGate refuses agent/human gates — the orchestrator can't fabricate their verdict", async () => {
  const d = mkRun(GOOD_IR);
  try {
    await assert.rejects(() => runGate(d, "verifier"), /not a deterministic gate/);
    assert.ok(AGENT_GATES.verifier && HUMAN_GATES.signoff, "verifier is an agent gate, signoff a human gate");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("drive runs every ready deterministic gate, marks agent/human ones pending", async () => {
  const d = mkRun(GOOD_IR);
  try {
    const res = await drive({ runDir: d, mode: "comprehensive" });
    const byId = Object.fromEntries(res.ran.map((r) => [r.id, r]));
    assert.equal(typeof byId.gate.pass, "boolean", "gate ran and produced a boolean verdict");
    assert.equal(readState(d).passed.gate.verdict, byId.gate.pass ? "PASS" : "BLOCK", "and drive recorded it");
    assert.equal(byId.verifier.pending, "needs agent", "adversarial verifier is not auto-passed");
    assert.equal(byId.signoff.pending, "needs human", "sign-off is not auto-passed");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#7 drive RUNS the design verifier (an artifact stage with a runner) — not only gate:true stages", async () => {
  const d = mkRun(GOOD_IR);
  try {
    const res = await drive({ runDir: d, mode: "comprehensive" });
    const byId = Object.fromEntries(res.ran.map((r) => [r.id, r]));
    // design carries GATE_RUNNERS.design but is NOT gate:true; the old drive skipped it entirely.
    assert.ok("design" in byId, "design is now RUN in the drive path, not skipped");
    assert.equal(typeof byId.design.pass, "boolean", "and produces a real verdict (here BLOCK — no experience-spec yet)");
    assert.equal(readState(d).passed.design.verdict, byId.design.pass ? "PASS" : "BLOCK", "recorded atomically like every gate");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#7 drive reports ARTIFACT stages too, so the whole strategy is visible and actionable", async () => {
  const d = mkRun(GOOD_IR);
  try {
    const byId = Object.fromEntries((await drive({ runDir: d, mode: "comprehensive" })).ran.map((r) => [r.id, r]));
    // spec exists (we wrote app-spec.json); seed-data does not — both are reported, not silently dropped.
    assert.equal(byId.spec.present, true, "an artifact stage that is present is reported present");
    assert.equal(byId["seed-data"].pending, "needs artifact", "a missing artifact stage says what's needed");
    // agent/human stages carry the actor that must produce them — actionable, not just 'pending'.
    assert.equal(byId.verifier.next, AGENT_GATES.verifier);
    assert.equal(byId.signoff.next, HUMAN_GATES.signoff);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("clearFor gates the irreversible action behind the recorded verdicts", async () => {
  const d = mkRun(GOOD_IR);
  try {
    assert.equal(clearFor({ runDir: d, mode: "quick" }, "apply").clear, false, "apply blocked before gates pass");
    await runGate(d, "gate");
    const c = clearFor({ runDir: d, mode: "quick" }, "apply");
    assert.ok(Array.isArray(c.missing), "still reports what's missing after one gate");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("continuation #2 drive() does NOT reuse a PASS once the spec it validated changes", async () => {
  const d = mkRun(GOOD_IR);
  const verify = (r) => r.ran.find((x) => x.id === "verify");
  try {
    // seed a PASS bound to the CURRENT app-spec.json (exactly as runGate would record it)
    recordVerdict(d, "verify", "PASS", "seeded");
    // unchanged spec → drive reuses the recorded pass
    assert.equal(verify(await drive({ runDir: d, mode: "comprehensive" })).skipped, "already PASS",
      "an unchanged spec legitimately reuses the recorded pass");
    // change the spec → the recorded PASS is no longer bound to it → drive must RE-RUN, not skip
    writeFileSync(join(d, "app-spec.json"), JSON.stringify({ app: { name: "Changed after pass" } }));
    assert.notEqual(verify(await drive({ runDir: d, mode: "comprehensive" })).skipped, "already PASS",
      "a changed spec is re-run, never waved through as already-passed");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("continuation #1 a design BLOCK refuses deploy, despite a present non-placeholder artifact", async () => {
  const d = mkRun(GOOD_IR);
  try {
    mkdirSync(join(d, "prototype"), { recursive: true });
    // a design artifact that would clear the content floor on its own (palette + rationale present)…
    writeFileSync(join(d, "prototype", "experience-spec.json"),
      JSON.stringify({ design: { palette: { accent: "#123456" }, rationale: "chosen" } }));
    // …but the verifier recorded a BLOCK. design is an ARTIFACT stage (not gate-flagged), so before the
    // fix the BLOCK was discarded and deploy saw design as done.
    recordVerdict(d, "design", "BLOCK", "no archetype");
    const c = clearFor({ runDir: d, mode: "quick" }, "deploy");
    assert.equal(c.clear, false, "deploy is refused while a required stage BLOCKed");
    assert.ok(c.missing.some((m) => (m.id || m) === "design"),
      "a BLOCKed design keeps deploy refused — not silently 'done' from artifact presence alone");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
