---
description: "STAGE 6 (build) — apply the current run's plan to the target Kissflow account, creating the real apps, flows, forms, fields, workflows, permissions and pages. Gated on a VALID IR (not on review). Supports --dry-run and --yes. This is the only stage that mutates Kissflow."
argument-hint: "[--dry-run] [--yes] (operates on runs/current)"
---

**Stage 6: build.** Turn the plan into a real Kissflow app. This is the destructive/irreversible step
(published Processes/Cases can't be un-published over REST), so treat it with care.

**Narrate progress** (esp. Cowork): emit a warm, plain line as you start building
(*"🚀 kf-author is building it live in Kissflow — creating and publishing every flow, page and role…"*)
and when acceptance runs (*"✅ kf-acceptance is test-driving each journey…"*), then a plain result
(*"✓ Live — 1 process, 3 dashboards; every journey passed."*). No jargon. See `author-app.md` (USER PROGRESS).
**End with the time taken** — close on the total wall-clock (*"⏱ Built in 1m57s."*) from
`node engine/timeline.mjs report runs/current`; it's the demo headline.

Pre-req: a current run with a **verified** `runs/current/app-spec.json`. Gate is *valid IR*, not
"review was done" — so the express/demo path can reach here directly.

## Do
1. **Drive the build contract** — `node engine/cli.mjs orchestrate drive runs/current --mode <quick|comprehensive>`.
   This is the ONE executable contract (engine/orchestrator.mjs) shared with AI Builder chat: it runs
   every deterministic gate and RECORDS its verdict atomically — you never manually "pass" a stage.
   Then `node engine/cli.mjs orchestrate clear runs/current apply` — if it prints `❌ blocked`, the
   named stages are agent gates (adversarial verifier) or human sign-off that still need doing; do
   them (or the caller waives with `--force` on apply) before step 4. `cli verify` and `cli apply`
   both record their own verdicts too, so the guard stays consistent however you reach it.
2. **If review was skipped**, print exactly one line: *"⚠ No review taken — applying to dev directly."*
   (Check: no `runs/current/review.html` / no snapshots ⇒ skipped.) Don't block on it.
3. **Handle flags** in `$ARGUMENTS`:
   - `--dry-run` → `node engine/cli.mjs build runs/current/app-spec.json --out runs/current/preview`,
     show the manifest and STOP (build nothing).
   - No `--yes` and this is a full/non-express invocation → show the one-line build summary (N flows,
     forms, permissions) and ask for confirmation before applying.
   - `--yes` → apply without the extra prompt.
4. **Apply** — `node engine/cli.mjs apply runs/current/app-spec.json` (targets the account in your
   `KISSFLOW_*` env — keep this pointed at **dev**). If re-running a run that was already partly built,
   the engine's reuse mode maps to the existing gen→server ids (from the prior apply log in
   `generated/`) instead of duplicating — don't re-create from scratch.
5. **Record the build** — write `runs/current/generated/` with the apply log (gen→server id map,
   created flow/form/page ids, timestamps). Update `RUN.md`: stage=generated, generated=yes, target.
   `node engine/runs.mjs snapshot "generated → dev"`.
6. **Acceptance** — spawn `kf-acceptance` to smoke-check the built app against the journeys; report
   pass/fail per journey.
7. **Publish the version — ALWAYS run this** (it's how the app + prototype + review reach appbuilder):
   ```bash
   node engine/publish.mjs runs/current --label "<short build label>"
   ```
   It pushes this run's artifacts (IR, prototype, review page) to the project and registers a version in
   the app's **Versions** list. **If the project isn't linked yet, publish SELF-CONNECTS** — it opens a
   one-time browser approval; surface that link to the user, they approve once, and it pushes immediately
   (it won't ask again). No separate `/author-setup` step, no re-run. Only `--no-connect` (or a genuine
   local-only build) skips it. Mention the registered version + the appbuilder URL in the output.

## Output
What was created (with real Kissflow ids), the acceptance result, and where the log lives
(`runs/current/generated/`). Next: *"Open it in Kissflow, or hand the run to Pipeline B — its Experience
Spec (`runs/current/prototype/`) translates to the live custom UI."*
