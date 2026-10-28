# T5 notes: integration and QA (2026-10-08)

Built against `kissflow-build/ciq-digital/WORKBENCH-DESIGN.md` §12.1 T5 (with §10, §11, §13). Local only: no Kissflow
call of any kind, no deploy or upload, no `.env` / `.kf-env` read, no npm install. Fixtures stay fictional.
The run log for Thomas is `kissflow-build/ciq-digital/WORKBENCH-UI-LOG.md`.

## Integration edits (every file T5 changed)

| File | Change | Why |
|---|---|---|
| `data/hooks.tsx` | `changed()` reloads the task list first and bumps `version` only after the new list is in | CR-T2-review-1 (b) |
| `data/hooks.tsx` | `readItem` never calls `getItem` with an activity this session closed; it uses another held task of the item, else the next rung | CR-T2-review-1 (a) |
| `data/hooks.tsx` | `useFormRows(flow, where?, key?)`: a function filter is cached under `fn:<key>` or a per-instance `useId()` | CR-T3-admin-1 |
| `data/session.ts` | `closedActs` + `markClosedAct` / `isClosedAct` (`flow|_id|act`) | CR-T2-review-1 |
| `data/actions.ts` | `markClosedAct` after submit (incl. moved-out and timeout-settled), reject, admin reject, send-back, moved-out Re-read; `reReadPendingRt` calls `rt.changed()` when the compare matches | CR-T2-review-1, CR-T4-harness-3 |
| `data/creates.ts` | `createFormRow` calls `rt.changed()` after a verified create (not for F8); `createProcessItem` marks the Start activity closed | CR-T3-admin-2, CR-T2-review-1 |
| `domain/keys.ts` | `OPTIONAL_KEY_COLUMNS`: a blank `Findings_Criterion_Code` is "" in the natural key | CR-T4-harness-1 |
| `ui/WriteOutcome.tsx` | optional `onResolved` passed to `KwbFallback` | CR-T3-admin-3 |
| `data/integration.spec.ts` (new), `domain/keys.spec.ts` | 9 tests for the above | — |
| `scripts/harness-workbench.mjs` | `--screens [dir]` (one screenshot per fictional role, no checks); `movedOutReads` per run in the report | §12.1 T5 "screenshots per role"; evidence for CR-T2-review-1 |
| `CHANGE-REQUESTS.md` | every entry answered in place (done / info) | task step 1 |
| `README.md` | T5 section: results, rebuild, live-check list | §12.1 T5 |

No stub was left to remove (T1–T3 had replaced every `FeatureStub`), and no §12.2 signature changed (only the
backward-compatible `key?` on `useFormRows` and `onResolved?` on `WriteOutcome`).

## Choices where the design was open (simpler safe option)

1. **CR-T3-admin-2 excludes F8.** Every F8 row is part of a larger action that calls `changed()` when it ends; a reload
   in the middle (e.g. between the F8 Cancellation row and the reject) would only add reads while a write is in flight.
2. **CR-T2-review-1: both (a) and (b).** (b) alone does not help screens that pass an explicit `?task=` activity; (a)
   alone would still read with a stale task list. The §7.3 step-7 post-submit re-read stays (by design), so a lane submit
   still shows one moved-out `PROCESS_GET_ITEM`. Full run, report field `movedOutReads`: 1 each in S12a and S12b (both
   variants; the step-7 check) and S18a/S18b (the designed Re-read after a native send-back); 0 everywhere else.
3. **Lane repair UI: T1's dialog, not T3's `LaneRepairPanel`.** T1 built the Repair lane action into the case detail
   ("Departments & lanes" tab and the S5/S8 panel, `features/case/panels/LaneDialogs.tsx`) over the same T0
   `repairLane`/`repairBlocker`; S39 passes on it. Embedding T3's panel too would show two Repair buttons with the same
   test id `wb-lane-repair-<D>`. `LaneRepairPanel` stays exported and unused (no dead route).
4. **Screenshots** go to `kissflow-build/ciq-digital/workbench-screens/` (outside `dist-workbench/`, which every
   `vite build` empties).
5. `vite build` empties `dist-workbench/`, so T2's `harness-report-t2.json` and T4's earlier screenshots are gone; the full
   run supersedes both.

## Open (not fixable locally)

- T3's note: a publish re-apply under a harness race mode could update a Published F2 row. Not reached by any scenario;
  left as is (it needs a host that drops a key on the state patch).
- Every §13.2 item stays [unverified] until Diagnostics runs live after generate and deploy.

## Results (final run, 2026-10-08 07:27–07:32 IST)

| Check | Result |
|---|---|
| `npm run typecheck` / `npm test` | clean / 7 files, 81 passed |
| `npm run typecheck:workbench` / `npm run test:workbench` | clean / 46 files, 782 passed, 0 failed |
| `npm run build:workbench` | `ciq-workbench-ui-4bbda410d4.zip`, 573 KB (587,171 bytes), guards passed, build `2026-10-08T01:57:13.234Z` |
| `npm run harness:workbench` | 68 passed, 0 failed, 0 pending of 68 runs, 2079 checks (before T5: 65 / 3 / 0) |
| `--screens` | 21 role screenshots in `kissflow-build/ciq-digital/workbench-screens/` |
