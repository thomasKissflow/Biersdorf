// streaming-guarantee.test.mjs — machine-checks the corrected express/comprehensive contract (#8/#9):
// they are DIFFERENT strategies (different stages, gates and review depth) that SHARE a set of
// invariants neither may break. Before the correction the docs claimed "same gates, differ only in
// breadth" — this test would have failed that claim, and now pins the real one so it can't drift back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequest, plan } from "../orchestrator.mjs";
import { STAGES, GUARDS } from "../pipeline.mjs";

test("#8 express and comprehensive are genuinely DIFFERENT strategies", () => {
  // review depth differs: express does not pause; comprehensive gates on a human sign-off
  assert.equal(buildRequest({ mode: "express" }).review, "auto");
  assert.equal(buildRequest({ mode: "comprehensive" }).review, "pause");

  // the stage lists differ (express is genuinely shorter — not the same plan at two speeds)
  const qIds = STAGES.quick.map((s) => s.id);
  const cIds = STAGES.comprehensive.map((s) => s.id);
  assert.ok(qIds.length < cIds.length, "express runs fewer stages by design");

  // and the gate-sets differ: express does NOT run the adversarial verifier or human sign-off
  assert.ok(!GUARDS.apply.quick.includes("verifier"), "express apply guard omits the adversarial verifier");
  assert.ok(!GUARDS.apply.quick.includes("signoff"), "express apply guard omits human sign-off");
  assert.ok(GUARDS.apply.comprehensive.includes("verifier") && GUARDS.apply.comprehensive.includes("signoff"),
    "comprehensive apply guard requires both");
});

test("#8 both strategies SHARE the invariant floor — a shorter plan is not a thinner app", () => {
  // business-logic + accountability floor: every apply, in EITHER mode, requires the spec, the
  // deterministic gate, real automations, and recorded decisions.
  for (const mode of ["quick", "comprehensive"]) {
    for (const inv of ["spec", "gate", "automations", "decisions"]) {
      assert.ok(GUARDS.apply[mode].includes(inv), `${mode} apply must require '${inv}' (shared invariant)`);
    }
  }
  // the ONE design system is an invariant of both plans — kf-design-director runs on every build.
  assert.ok(STAGES.quick.some((s) => s.id === "design"), "express runs the design stage");
  assert.ok(STAGES.comprehensive.some((s) => s.id === "design"), "comprehensive runs the design stage");
});

test("#8 orchestrate clear evaluates the SELECTED mode's chain, not always comprehensive", () => {
  // express plan lists express stages; comprehensive plan lists comprehensive stages — the plan is
  // per-mode, so `clear`/`drive` gate against the mode the caller actually chose.
  const q = plan({ runDir: "/tmp/x", mode: "express" }).stages.map((s) => s.id);
  const c = plan({ runDir: "/tmp/x", mode: "comprehensive" }).stages.map((s) => s.id);
  assert.ok(c.includes("verifier") && !q.includes("verifier"), "the verifier is a comprehensive-only stage in the plan");
});
