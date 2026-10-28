# P0 follow-up — second review round (10 findings)

| # | Finding | Status |
|---|---------|--------|
| 1 | CLI & AI Builder don't execute the same pipeline programmatically | **Partial — scoped** | Readiness is now HOST-enforced (prototype verify + publish gating at finalization, #2–#4), so the model can't skip producing a valid prototype and have it marked ready. The remaining half — the host programmatically DISPATCHING each agent stage (not instructing the model via CONDUCTOR.md) and enforcing clearFor() for stage execution — is a genuine rearchitecture of the model-driven conductor; recommended as a dedicated follow-up rather than a rushed change. Not faked with unused plumbing. |
| 2 | v1 reported success even when durable publication failed | **Fixed + tested** | Transactional `finalizeVerdict`; a real publish failure → turn-end ok:false, local "no publisher" distinguished. |
| 3 | Missing/rejected prototype counted as success | **Fixed + tested** | `checkPrototype` returns PROTOTYPE_MISSING when a build started but produced no page; v2 `done()` gates the same. |
| 4 | Ready card could show after a blocked turn | **Fixed + tested** | `announceGenReady` returns on `lastTurnFailed`. |
| 5 | New CSP blocked fonts + Mermaid | **Fixed + tested** | CSP allowlists the specific font/Mermaid hosts; exfiltration stays blocked. Self-hosting is the ideal follow-up. |
| 6 | Compiler cache leaked across apps/turns | **Fixed + tested** | Scoped per run-label, disposed at turn end; deterministic per turn. |
| 7 | Streaming writes not atomic | **Fixed + tested** | `atomicWrite` (temp+rename) on all three write sites. |
| 8 | Refresh/replay dropped buffered prose | **Fixed + tested** | Stream route flushDeltas before flushLog. |
| 9 | Literal NUL byte in cache key | **Fixed** | Key is two hex digests, printable. |
| 10 | Negative Tailwind smoke test didn't hide Tailwind | **Fixed + tested** | `KF_TW_PACKAGE` seam; the negative test now truly fails a compiler-less image. |

Dead code removed: `preparedBytesOrThrow` (no caller).

# P0 — Prototype publication defect (uncompiled Tailwind reaching storage)

A live review found prototypes published with an UNCOMPILED Tailwind runtime (browser CDN +
`<style type=text/tailwindcss>` + relative `tailwindcss/*` imports), which dies unstyled inside a preview
host while the UI says "ready". Root cause: the CSS compile lived inside one assembly path and failed
OPEN, and other publish paths never compiled. Fixed at the publication BOUNDARY, fail-closed.

| Area | Fix | Tests |
|------|-----|-------|
| Boundary | `engine/proto-publish.mjs` — `preparePrototypeForPublication` precompiles then FAILS CLOSED: a candidate still carrying a raw Tailwind runtime is rejected (belt-checked even when precompile claims success); final also requires a clean verifier; partial tolerates in-progress placeholders. | `proto-publish.test.mjs` |
| Verifier | `proto-verify.mjs` — raw Tailwind runtime is now an ERROR (RAW_TAILWIND_RUNTIME / UNCOMPILED_PROTOTYPE_CSS / UNRESOLVED_TAILWIND_IMPORT), for partial and final. | same |
| All publish paths | assembleRun + CLI + v1 (publishBuild/live) + v2 (publishLive/cutVersions) route through the boundary; none write raw. A failed compile keeps the last good preview. | `proto-publish-paths.test.mjs` |
| Verify-before-ready | v1 turn-end reordered + awaited: verify → snapshot → publishBuild → ready; a failing prototype blocks the version/snapshot and turn-end reports ok:false. v2 `done()` gates ok on cutVersions. | chat + v2 suites |
| Origin isolation | version/pane routes serve generated HTML with the isolation CSP; display iframes sandboxed without allow-same-origin (tour frame documented). Full isolation = separate origin (infra). | `generated-html-csp.test.mjs`, `iframe-sandbox.test.mjs` |
| Images | chat + v2-worker Dockerfiles install the workspace (tailwindcss) and run `engine/tw-smoke.mjs` at build time — fail the image if the compiler can't resolve/compile. | `tw-smoke.test.mjs` |
| Streaming tests / docs | stream tests use a real v4 head and assert compiled output on every streamed publication; STARTER-PARITY.md "cosmetic 404" corrected to a publication-time failure. | stream-prototype (v1+v2) |

**Env-gated tail:** regenerating SkyFlow as a corrected version needs the live build pipeline +
credentials (not run here, per the no-deploy constraint). The fix guarantees the NEXT build publishes
compiled CSS or fails closed; existing immutable versions are left as-is (no migration policy assumed).

---

# Remediation status — the 23-item hardening program

Branch `feat/build-cost-reduction`, starting from reviewed commit `02c987b`. Every item below that is
CODE was implemented with tests and committed on this branch; nothing was deployed, merged, pushed, or
changed in production infrastructure (the standing constraint for this work).

The **env-gated** items cannot be fully implemented or verified from a local checkout because they
require production infrastructure (a separate origin/domain, GKE pod policy, a live Kissflow account,
a real deploy). For those, the code-reachable hardening was done and the remaining infra step is named
so it can be picked up deliberately.

## P0 — Security

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Pod isolation | **Env-gated** | Per-session pods already dial OUT (pull-based worker), so the control plane needs no route in. TRUE tenant isolation (network policy / per-tenant node pools / no shared writable volume) is a GKE change — not made here. Documented in `chat/worker.mjs`. |
| 2 | Scope run listing by membership | **Done + tested** | `canAccessRun`; `/api/runs` hides non-member + orphan runs. `chat/test/run-membership.test.mjs`. |
| 3 | Validate membership before linking/adopting | **Done + tested** | 403 on adopt across in-memory / DB-hydrated / disk paths. Same test. |
| 4 | Remove arbitrary local-file artifact reads | **Done + tested** | `readLocalArtifact` contains every read to the artifacts dir. `control-plane/test/artifact-containment.test.mjs`. |
| 5 | Isolate generated HTML from the auth origin | **Partial (code done) + env-gated tail** | Session cookie is HttpOnly; preview/blueprint now carry a CSP (`connect-src 'none'`, `form-action 'none'`, `frame-ancestors 'self'`) + nosniff. COMPLETE isolation = a separate preview ORIGIN (infra). `chat/test/generated-html-isolation.test.mjs`. |
| 6 | `.kf-env` reader parity | **Done + tested** | `parseEnvText`/`unquoteEnvValue` invert the writer's `shq`; worker quotes too. `engine/test/kf-env-roundtrip.test.mjs`. |

## P1 — Architecture

| # | Item | Status | Notes |
|---|------|--------|-------|
| 7 | Executable strategy runner | **Done + tested** | `drive()` now RUNS every deterministic gate it has (incl. the `design` verifier, previously skipped because design isn't `gate:true`), records verdicts atomically, and reports agent/human/artifact stages with an actionable next-step — the machine half of a build, not an advisory check. Engine can't spawn agents (conductor's job), so it hands back a plan the caller loops on. `engine/test/orchestrator.test.mjs`. |
| 8 | Correct express/comprehensive docs | **Done + tested** | Different strategies, shared invariants. `engine/test/streaming-guarantee.test.mjs`. |
| 9 | Express streaming as a formal guarantee | **Done + tested** | Documented as a driver property; enforced by `chat/test/stream-prototype.test.mjs`. |
| 10 | Express latency | **Addressed (code) ** | The streaming shell-first + host-side `proto-assemble --partial` is the express latency mechanism (the preview fills as the build runs, not at the end). Further latency work is measurement-driven and env-gated (needs live builds). |

## P1 — Pipeline / CLI

| # | Item | Status | Notes |
|---|------|--------|-------|
| 11 | `--mode` replacing `--quick` + target resolution | **Done + tested** | `cli-args.mjs` resolvers. `engine/test/cli-args.test.mjs`. |
| 12 | Reliable gate state recording | **Done + tested** | Atomic (temp+rename), corruption-loud, cross-process lock. `engine/test/gate-recording.test.mjs`. |
| 13 | Truthful AI-page results | **Done + tested** | `ok` tracks publish, not creation. `engine/test/ai-page-truthful.test.mjs`. |
| 14 | Crash-safe apply after createApp | **Done + tested** | id-map persisted the instant the app exists. `engine/test/apply-crash-safe.test.mjs`. |
| 15 | Reconciler correctness bugs | **Done + tested** | Live-deletion→drift, base-absent-diff→conflict, unknown provenance fail-closed. `engine/test/reconcile.test.mjs`. |

## P2

| # | Item | Status | Notes |
|---|------|--------|-------|
| 16 | Clean-checkout tests | **Done** | Full matrix green from the tree; `chat/test/run-all.mjs` runs each file in its own process (removed a same-process race). |
| 17 | Validate chatSlug before createProject | **Done + tested** | Adopt + linkProject reject non-contained slugs. `chat/test/run-membership.test.mjs`. |
| 18 | Canonical design-guidelines source | **Done** | Created `starter/agents/design-guidelines.md` (7 dangling refs resolved). |
| 19 | Consistent deploy behavior | **Verified + env-gated** | `deploy.sh` build/candidate/promote with a documented connection budget; the one inconsistency (feedback-fixer auto-deploy) was removed (#22). Running a deploy is env-gated and out of scope. |
| 20 | Custom-UI step ordering | **Verified correct** | `deploy-ui.mjs` enables Custom UI at step [1b] BEFORE component create ([2/6]); final [6/6] enable is idempotent. |
| 21 | Fix failing chat test | **Done** | kf-builder gained the hive `remember` contract; `memory-wiring.test.mjs` 4/4. |
| 22 | Safe feedback fixer | **Done + tested** | Stops at an open PR (no auto-merge, no auto-deploy); untrusted report fenced. `control-plane/test/feedback.test.mjs`. |
| 23 | Remove dead material | **Done** | Resolved dangling `design-guidelines.md` refs; confirmed `theming.md` is generated and `widget-guide.md` ships in starter/agents. |

## Test posture (clean tree)

- `engine/test/run.mjs` — 383/383
- `engine/test/*.test.mjs` — all green (reconcile, orchestrator, prod-first, kf-env round-trip, cli-args, gate-recording, ai-page-truthful, apply-crash-safe, streaming-guarantee)
- `chat/test/run-all.mjs` — 34/34 files (deterministic, one process each)
- `control-plane/test/run-all.mjs` — 16/16 files
- `v2/test/*.test.mjs` — 34/34
- `starter` — theme/tokens/nav/proto/shell/proto-classes checks green
