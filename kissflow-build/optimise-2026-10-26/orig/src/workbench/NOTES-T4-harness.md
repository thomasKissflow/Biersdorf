# T4 notes: harness (emulated Kissflow app host), 2026-10-08

Built against `kissflow-build/ciq-digital/WORKBENCH-DESIGN.md` §11 (§0.3, §3, §12, §14). Local only: no Kissflow call of
any kind, no deploy or upload, no `.env` / `.kf-env` read, no credentials. Every person and supplier in the fixtures is
invented; every e-mail is `@example.test` (a unit test scans the whole fixture state for other e-mail domains).

## Files (T4 only)

| File | What |
|---|---|
| `harness/params.ts` | Host params and every §11.2 mode; an unknown param or value throws (a typo never runs the kind default) |
| `harness/state.ts` | Items with activities, Form rows, per-user drafts, id sequence, fixture index, snapshot |
| `harness/formula.ts` | Tokenizer, parser and evaluator for the spec formulas; header and child-column recompute; `childFormula=off` |
| `harness/permissions.ts` | Payload analysis: step perms, computed fields, ms-by-type (header and `Table::` columns), unknown keys |
| `harness/workflow.ts` | Traversal from `STEPS`: conditions, parallel fork/join, all-false block skipped, send-back (new instance), reject, withdraw, K-FA assignment |
| `harness/users.ts` | The 12 fixture users (§11.3), fake `Ro…` role ids by NAME, `GET_ROLES` list (13 app roles) |
| `harness/fixtures.ts` | Suppliers, configuration (manifest hashes = sha256 of `Payload_JSON`), C1–C10 (+C10b), P1–P8, CR1–CR4, built by driving the engine |
| `harness/commands.ts` | Handlers for every SDK command of §11.1 (payload keys from `kfsdk.es.js`), errors as `{isError, errorMessage}`, refusal categories |
| `harness/checks.ts` | The global checks of §11.2 (pure) + the create-lane check |
| `harness/hostEngine.ts` | Recorder (`__kfCalls`), overlaps, write/read/handshake delays, unanswered inits, native-form ops, `switchUser`, checks |
| `harness/hostPage.ts` | Browser bridge (esbuild IIFE): frames the UI on another origin, accepts only the frame's `{_id, command}` messages, exposes `__kfCalls`, `__kfOverlaps`, `__kfState()`, `__kfFixtures`, `__kfChecks()`, `__kfHost.*`; carries `__WB_HARNESS_ONLY__` |
| `harness/sha256.ts`, `harness/time.ts` | Sync sha256 (fixture hashes); ISO-second formatting without `toISOString` (guard) |
| `harness/*.spec.ts` | 168 engine tests (formula, params, workflow, hostEngine, fixtures) |
| `scripts/harness-workbench.mjs` | Runner: two 127.0.0.1 origins, esbuild host bundle, Playwright from the portal harness's path, one context per scenario, global checks per host load, report + screenshots, `--serve` |
| `scripts/harness-workbench-scenarios.mjs` | All 50 scenarios of §11.4 (S01–S44 with the a/b splits), M matrix variants, PENDING on stubs |

Run (from `prototype/`): `npm run harness:workbench` (all, with the `kwb=refuse` matrix) · `node scripts/harness-workbench.mjs S04 S05` ·
`--no-matrix` · `--list` · `--serve` (prints host URLs with a fictional-user switcher bar, `&bar=1`) · `--ui <dev server url>` ·
`--html <built workbench.html>` (e.g. a scratch build: `npx vite build -c vite.workbench.config.ts --outDir <dir>`) ·
`--report <name>` (default `dist-workbench/harness-report.json`; screenshots `dist-workbench/harness-<scenario>-<tag>.png`, a named
report prefixes them) · `--variant ok|kwb-refuse` (one side of the matrix, for debugging). Exit code ≠ 0 on any FAIL; PENDING is
not a failure.

Report shape: `summary` {pass, fail, pending, p1NotPassing}, `byScenario` (one entry per scenario: `ok` and, for M scenarios,
`kwb-refuse` status, `failedChecks` and `failureScreenshots` per variant), `results` (every run with all its checks). A failing run
gets `harness-<run>-failure.png`, taken at its FIRST failing check of any kind (also global checks and failed assertions, not only
thrown errors). The console ends with the scenario × variant table.

## Done

- **§11.1 engine** in full, unit-tested: traversal (sequential, conditions, parallel fork/join, all-skipped block, send-back,
  reject, withdraw, K-FA), formula parity for every spec formula against `schema/formulaSamples.ts` (all 83 vectors) and
  `childFormula=off`, 050313 (non-writable and computed), ms refusal by type in header and child rows, `race` (flow:n, always,
  child:n), overlap detection, draft 409, `drafts=sticky`, `formSubmit=fail`, `formDrop`, `formSubmitId=new`, `childIds=server`,
  `adminStep=omit|row`, `stepkey=_current_step|none|block|first`, `multiAct`, envelopes live/items/Data, sparse rows, paging,
  `participated=error`, `adminList`, `flowAdmin`, `caseAdminFlowAdmin`, `progress=on|off`, `kwb`, `sendback`, `reject`,
  `openForm=ok|hang|refuse`, `writeDelay(+Once)`, `delayInit`, `ignoreInits`, wrong container (`appId`), the delete,
  F8-update, Published-F2-update (Retire exception) and admin-write global checks, and native-form ops.
- **§11.2 global checks** after every host load of every scenario, plus "creates never overlap" and "no page or console errors".
- **Matrix run (K-WB):** every M scenario also runs with `kwb=refuse`; the fallback is driven as §11.2 says (panel and My Tasks
  instruction before any click → Open task form → `PROCESS_OPEN_FORM` with the task's `_id`/act → `nativeSave` → Re-read passes,
  i.e. the stored `wb:pending:<_id>|<act>` sheet is cleared → submit). A save at a step already marked refused must send NO
  `UPDATE_ITEM` (WB-9); the values then come from the stored sheet.
- **Fixtures** of §11.3, every state reached by the engine as the users who hold the tasks (step perms enforced).
- **Acceptance (§12.1 T4):** typecheck clean, engine unit tests, S01–S05 PASS against the T0 build, `--serve` works, marker guard
  (the runner refuses a UI that contains `__WB_HARNESS_ONLY__` and a host bundle that lacks it; zip-workbench.mjs refuses it too).

## Deviations and choices (simpler safe option where the design is open)

1. **`getProgress` shape** [harness assumption]: `{Data:[{_activity_instance_id, _activity_id, Name, Status, …}]}` (the SDK hands
   the UI the bare array), every activity of the item, oldest first. Fake server activity ids `Activity_<irstep>`;
   `PROCESS_SENDBACK_ITEM` accepts only such an id as `stepId`. Task rows carry NO `_activity_id` (activity ids are learned only
   from getProgress), so `progress=off` really leaves the send-back target unknown (S19).
2. **Step keys:** task rows follow `stepkey`; a task `getItem` carries the activity's own step name even with `stepkey=none`
   (S34: "tasks still resolve through getItem"); My-items rows carry the item-level name (the block name in Part 2);
   `GET_ADMIN_ITEM` carries the current step (block name when several branches are open); admin LIST rows carry none.
3. **Refusals the host adds as live would** (all [unverified] in wording): an unknown write key ("field … does not exist",
   as SPIKES' 404 for a bare table key); a non-Start field in a create (050313); a modify/delete of an unknown child-row id;
   a Form discard without a draft ("No draft found to discard"; `noDraft=ok` answers `{}`). Drafts are per user per Form.
4. **`writeDelay`** applies the write on receipt and delays the answer, so a Re-read after a timeout shows it landed (S41).
5. **Benign refusals** in the global check: Participated (expected error), progress off, `GET_ROLES` with dev=0, "no draft"
   on discard-first, the admin list for non-admins (rung 1 is tried by everyone, T0 note 6), and a moved-out `getItem` of an
   `_id|act` this session already submitted/rejected/sent back (the §6.2 post-submit re-read; CR-T2-review-1). Every other
   refusal must be declared by the scenario (`t.expectRefusals`).
6. **Harness additions:** P8 (internal REG point on C5: the "open item" S24a counts), C10b (C10's reactivated cycle 2),
   `c4Rmes=complete` (C4's SAF sheet complete, for S12a/S12b), `readDelay` (S33's in-flight count), `noDraft`, `bar=1`,
   `__kfHost.switchUser(id, route)` (another user on the same state: S40), `__kfHost.people` (S04's redaction check).
7. **Users:** `dev` holds the 11 CIQ roles + Admin; `GET_ROLES` lists the 13 app roles (S04 "13 role names").
8. **Browser context** uses `timezoneId: "Europe/Berlin"` (manual timestamps are compared as exact UTC instants of the typed
   local time) and `locale: "en-GB"`.
9. **One browser notice is not an app error:** Chromium logs "Permissions policy violation: The Clipboard API has been blocked"
   when Diagnostics copies inside the frame; the app falls back to showing the JSON, which S04 reads. Listed per run in the report.
10. **Scenario readings:** S35c runs with `progress=0` (with the default `progress=on` the task would resolve by activity, not
    `block-unique`); S16 checks "a second save skips UPDATE_ITEM" before the reload (T0 keeps the K-WB mark in memory per page
    session); S29's "sam on the SAF sheet" uses T2's route `/rmes/<case>?dept=SAF`; S42's RMES part forces the re-apply with
    `race=child:1` (a flow race would hit the soft-lock write on opening); S12a completes the REG and QM lanes natively as dev
    (a full REG UI run needs P2 accepted and a REG RMES sheet) and checks the join → S5; S16 does not submit (the REG lane is
    blocked by P2, no REG RMES sheet and section marks; the submit-after-K-WB path is covered by S12a's matrix variant).
11. **Test ids beyond §8** used by the scenarios and adopted by T1/T2: `wb-step-save`, `wb-lane-save`.
12. S41 waits real time (~31 s); Playwright's `page.clock` is not used.

## Resumed run (2026-10-08, 07:00–07:15 IST)

The interrupted run had already finished the engine, the runner, all 50 scenarios with real steps, and the T4 replies
(CR-T4-harness-2). Nothing in the feature sources had changed since its last integration run. This run:
- **Strengthened four scenarios** where §11.4 asked more than they checked: S08 (host `Basic_Data_Received` = "Yes"); S09
  ("flags as chosen": adds one department the leads do not require, with the reason, and compares every `Dept_<D>_Active` on the
  host with the panel's choices); S10 (the Review queue lists all 3 Part 2 activities of C3, each once, beside My work); S26a
  (the counts are numbers on the host before the submit; in the `ok` variant the count `UPDATE_ITEM` precedes `SUBMIT_ITEM`).
- **Runner:** a failure screenshot at the first failing check of any kind (before, only a thrown error took one, so the UI
  defects had no picture); `byScenario` and `summary.p1NotPassing` in the report; the scenario × variant table on the console.
- Moved the previous run's stale screenshots and debug reports out of `dist-workbench/` (to the session scratchpad), so the
  folder holds only this run's report and pictures. `harness-report-t2.json` (T2's) is untouched.
- Re-ran everything; appended CR-T4-harness-4 (the 3 open UI defects with scenario, check and screenshot) for T5.

## Stubbed / not done

- Nothing in the engine is stubbed. Commands outside §11.1's list answer `NOT_EMULATED` and fail the global check.
- No scenario is PENDING: every screen exists, and none of the 50 needs live Kissflow (all run against the emulated host).
  `requireScreen` still turns a T0 `FeatureStub` into PENDING, which is why a run against T0's old `dist-workbench/zip` build
  reports most scenarios PENDING.

## Open issues

- **CR-T4-harness-1 (real defect, open, T0/T2):** a finding saved without a criterion code has no natural key
  (`domain/keys.ts naturalKeyOf` → null), so with server-assigned child-row ids `writeVerified` re-adds it on each verify pass
  (4 rows after one save). S42's extra check "(beyond §11.4, CR-T4-harness-1)" FAILS until T0 or T2 fixes it
  (`dist-workbench/harness-S42-failure.png`).
- **CR-T4-harness-3 (real defect, open, T0/T2):** a passing K-WB Re-read does not call `rt.changed()` (`data/actions.ts
  reReadPendingRt`; only the "moved out" branch does), so the T2 lane screen keeps the pre-fallback case values and "Complete
  review" stays disabled although the host holds the values and `SAF_Gate` "OK". S12a-kwb-refuse and S12b-kwb-refuse FAIL until
  T0 signals the change (or T2 reloads in `onResolved`, as T1's panels do). The `ok` variants pass
  (`dist-workbench/harness-S12a-kwb-refuse-failure.png`, `…-S12b-kwb-refuse-failure.png`).
- T1's and T2's requests to T4 (CR-T1-rmm-1/2, CR-T2-review-1) are done; see CR-T4-harness-2.
- Everything the harness emulates is the DESIGN's model of Kissflow, not observed behaviour: §13.2's [unverified] items stay
  open until Diagnostics runs live. In particular the getProgress shape, discard-without-draft, error wording, and whether the
  host keeps client row ids are harness assumptions.
- Playwright is loaded from the absolute path of the portal harness (`…/Promotion Management/app/node_modules/playwright-core`),
  machine-specific, as §11.1 says.
- `dist-workbench/zip/index.html` is still T0's stub build (I did not run `build:workbench`; the final build is T5's). The
  report below was run against a scratch build of the current sources (`--html`, recorded in the report's `ui`). T5:
  `npm run build:workbench && npm run harness:workbench`.
- Timing-based checks (S01 < 4 s, S37 hang note 7–12 s, S41 ~31 s) assume an unloaded machine; run the harness on its own.

## Results (2026-10-08 07:13 IST)

| Check | Result |
|---|---|
| Engine unit tests (`npx vitest run -c vitest.workbench.config.ts src/workbench/harness`) | 5 files, **168 passed** |
| `npm run typecheck` / `npm test` (portal, unchanged) | clean / 7 files, **81 passed** |
| `npm run typecheck:workbench` / `npm run test:workbench` | clean / 45 files, **773 passed** |
| Full harness with the matrix → `dist-workbench/harness-report.json` | **65 PASS, 3 FAIL, 0 PENDING of 68 runs** (50 scenarios + 18 `kwb=refuse` variants, 2079 checks) |

FAIL: S12a-kwb-refuse, S12b-kwb-refuse (CR-T4-harness-3), S42 ok (CR-T4-harness-1); every other run, both variants of the other
16 M scenarios included, passes. P2 scenarios (S19, S28 + matrix, S30, S31, S34) pass too.
