---
description: Runtime QA with a 100% coverage gate — enumerate every testable obligation from the IR (steps×outcomes, permissions, implied denials, scopes, automations, field rules), have kf-runtime-qa write mapped test cases, execute them against the live dev app per role, and report pass/fail with evidence. Failures export as a change-list for /author-refine.
argument-hint: "[optional focus — a flow / role / journey | blank = the whole app]"
---

**Runtime QA.** Prove the built app behaves as designed — per role, at runtime, with countable
coverage. Requires a generated app (`runs/current/generated/` apply log) and a connected dev env.

## Do
1. `mkdir -p runs/current/qa` and enumerate the coverage universe:
   `node engine/qa-universe.mjs runs/current/app-spec.json > runs/current/qa/universe.json`
   Tell the user the item counts by class — this is what "100%" means for this app.
2. Spawn **kf-runtime-qa**. It reads every artifact, writes `qa/test-plan.json` with each test
   claiming universe ids, and iterates until the coverage gate passes:
   `node engine/qa-universe.mjs runs/current/app-spec.json --check runs/current/qa/test-plan.json`
   (exit 1 = not done; the gate lists uncovered ids).
3. The agent executes the plan against dev as each role (sandbox users; approve seeding them if
   missing), writing `qa/results.json`. Denial tests that PASS access are security findings.
4. Snapshot: `node engine/runs.mjs snapshot "runtime QA"`, then publish the run to appbuilder:
   `node engine/publish-qa.mjs runs/current --label "<short label>" [--version <seq>]` — it uploads
   universe/plan/results/report and registers the run in the project's Runtime QA history.
5. Report in chat: the plain-English use-case verdicts FIRST (one line per user journey: works /
   broken / not provable — a BA should understand the whole report from these), then coverage
   (must be 100%), pass/fail by class, security findings, weak-evidence items, and the `[QA-FAIL]`
   change-list block ready for `/author-refine`.

A focus argument scopes the UNIVERSE (that flow/role/journey only) — coverage is still gated at
100% of the scoped universe, and the report must say it was scoped.
