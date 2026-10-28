# Foundation change requests (T1–T4 → T0)

WORKBENCH-DESIGN.md §12 calls this channel `FOUNDATION-REQUESTS.md`; for tonight's build it is **this file**
(`FOUNDATION-REQUESTS.md` only points here).

**Rules**
- T1–T4: **append only**. One entry per request. Never edit another entry or T0's answer.
- Meanwhile, go on with a local workaround **inside your own folder**; never edit a T0-owned file
  (`src/workbench/{data,kf,schema,shell,ui,pages,domain}`, `guards.spec.ts`, configs, `package.json`, `tsconfig*.json`).
- A stub signature in `features/*` (§12.2) changes only through an accepted entry here.
- T0 answers each entry in place (**accepted** with the time and files changed, or **declined** with the reason) and
  keeps `npm run typecheck:workbench` green.

**Entry template** (copy below the line, fill in, append at the end)

```
### CR-<n> · <task T1|T2|T3|T4> · <short title>
- File: src/workbench/<path>
- Change: <exactly what should change: signature, field, behaviour>
- Why: <the screen/test that needs it; design section>
- Workaround in the meantime: <what you did locally>
- Status: open
- T0 answer: —
```

---

<!-- requests below this line -->

### CR-T3-admin-1 · T3 · useFormRows: a function filter shares one cache key
- File: src/workbench/data/hooks.tsx (`useFormRows`)
- Change: build the cache key of a function `where` from something per call site (e.g. an optional `key` argument: `useFormRows(flow, where, key?)`), or document that function filters must not be used.
- Why: `whereKey = typeof where === "function" ? "fn" : JSON.stringify(where)` gives every function filter on the same flow the key `form:<flow>:fn`, so two panels with different predicates (e.g. notes of two cases) would read each other's cached rows.
- Workaround in the meantime: T3 uses object filters only (`{ Case_Item_Id: c._id }`) and filters further in memory.
- Status: done
- T0 answer: T5 (integration), 2026-10-08: **accepted.** `useFormRows(flow, where?, key?)` in `data/hooks.tsx`: a function filter is cached under `fn:<key>` when `key` is given, else under a per-hook-instance id (`useId()`), so two call sites with different predicates never share rows. Object filters keep `JSON.stringify(where)`. No call site uses a function filter today, so nothing else changed.

### CR-T3-admin-2 · T3 · createFormRow does not signal a change
- File: src/workbench/data/creates.ts (`createFormRow`)
- Change: call `rt.changed()` after a verified create (as `createProcessItem` and `updateFormRow` do), so hooks reload.
- Why: after a note, supplier, config row or audit row is created, `useFormRows` lists stay stale until reloaded by hand.
- Workaround in the meantime: T3 calls `reload()` of its own list after every create.
- Status: done
- T0 answer: T5 (integration), 2026-10-08: **accepted, for every Form except F8.** `data/creates.ts createFormRow` calls `rt.changed()` after the row is created and verified (also when `reapply: false` returns `missing`). F8 rows do not signal: each belongs to a larger action (submit, reject, count write, repair, retire, publish) that calls `changed()` itself when it ends; a reload in the middle of it would only add reads. T3's own `reload()` calls stay harmless. Test: `data/integration.spec.ts`.

### CR-T3-admin-3 · T3 · WriteOutcome: pass onResolved to KwbFallback
- File: src/workbench/ui/WriteOutcome.tsx
- Change: accept an optional `onResolved(r)` prop and pass it to the `KwbFallback` it renders for `kwb-refused`.
- Why: after a K-WB refusal at CASE_S6, the approval screen must know when Re-read matched (then submit without re-saving) or answered "submitted in Kissflow".
- Workaround in the meantime: the approval screen renders `KwbFallback` / `StoredKwbFallback` itself with `onResolved`, and `WriteOutcome` only for the other results.
- Status: done
- T0 answer: T5 (integration), 2026-10-08: **accepted.** `ui/WriteOutcome.tsx` takes an optional `onResolved(r)` and passes it to the `KwbFallback` it renders for `kwb-refused`. T3's approval screen keeps its own `KwbFallback` rendering (no behaviour change needed).

### CR-T1-rmm-1 · T1 → T4 · kwbSave: a save at a step already marked kwb:refused sends no UPDATE_ITEM
- File: scripts/harness-workbench-scenarios.mjs (`kwbSave`)
- Change: in the `kwb-refuse` variant, when the K-WB panel shows but no new refused `PROCESS_UPDATE_ITEM` arrives (the step was marked `kwb:refused` on strong evidence, so `saveAtStep` skips the SDK write and returns `kwb-refused` with `skipped: true`, WB-9 / §7.2 "Before a task write"), take the values from the panel's sheet (or the frame's `sessionStorage` `wb:pending:<_id>|<act>`) and `nativeSave` those, then Re-read.
- Why: scenarios with two saves at one step fail only in the matrix variant: S24a-kwb-refuse (Refresh counts, then override + Hold note at CASE_S5), S26a/S26b-kwb-refuse (Refresh counts, then the S7 record). The UI behaves as designed (S16 even expects the skip).
- Workaround in the meantime: none in T1 (the skip is foundation behaviour and correct per WB-9).
- Status: done
- T0 answer: T5 (integration), 2026-10-08: **done by T4** (CR-T4-harness-2: `kwbAfter` native-saves the stored sheet when a refused step sends no `UPDATE_ITEM`). Re-checked in the full run: S24a, S26a, S26b pass in both variants.

### CR-T1-rmm-2 · T1 → T4 · S26a compares Final_Release_At with the typed local time as if it were UTC
- File: scripts/harness-workbench-scenarios.mjs (S26a), scripts/harness-workbench.mjs (browser context)
- Change: create the Playwright context with `timezoneId: "UTC"` (or compare `Date.parse(Final_Release_At)` with `new Date("2026-10-07T16:30")` evaluated in the page).
- Why: "Supplier released at" / "Supplier confirmed at" are `datetime-local` inputs; the UI writes them as a UTC instant without ms (`kfDateTime(new Date(local))`, the same as T0's FieldInput for DateTime). On a machine in CEST the typed 16:30 is stored as `…T14:30:00Z`, so the `startsWith("2026-10-07T16:30")` check fails although the value is right. (S10 only checks the date part and passes.)
- Workaround in the meantime: none (writing local wall time with a `Z` would store a wrong instant).
- Status: done
- T0 answer: T5 (integration), 2026-10-08: **done by T4** (browser context `timezoneId: "Europe/Berlin"`, exact instant compare; CR-T1-rmm-3 says it is no longer needed). S10 and S26a pass in both variants.

### CR-T2-review-1 · T2 → T0 (+ T4) · after a submit, hooks re-read with the just-closed activity ("moved out of your queue")
- File: src/workbench/data/hooks.tsx (`changed` in the provider; `readItem`)
- Change: either (a) in `readItem`, call `getItem(flow, id, act)` only when `act` is still among `rt.tasks()` (held), else go straight to the next rung; or (b) in `changed()`, reload the tasks first and bump `version` only after the new task list is in. T4: in the global check "no command refused unless the scenario expects it", accept a `moved-out` `PROCESS_GET_ITEM` right after a `SUBMIT_ITEM` / `SENDBACK_ITEM` on the same item (`submitStep` step 7 makes exactly this read for every lane step, by design §6.2).
- Why: `rt.changed()` bumps the version before the tasks reload, so `usePoint(id, act)` / `useCr(id, act)` / `useCaseBundle` re-read with the activity that was just submitted or sent back; the host refuses it. Seen in the scratch smoke of S17 (Return) and S28 (CR assessment): the writes are right, but the check lists one refused `PROCESS_GET_ITEM`.
- Workaround in the meantime: T2's point and CR pages pass the `?task=` activity only while it is still held, wait for the task list before the first read, and keep the last good read on screen; the version-bump race itself stays (one refused read per submit).
- Status: done
- T0 answer: T5 (integration), 2026-10-08: **accepted, both parts (a) and (b).** (b) `data/hooks.tsx changed()` now reloads the task list first and bumps `version` only once the new list is in. (a) `data/session.ts` keeps `closedActs` (`flow|_id|act`), marked by `submitStep` (incl. the moved-out and timeout-settled branches), `rejectCase`, `cancelCaseAsAdmin`, `sendBackPoint`, `createProcessItem`'s Start submit and a moved-out K-WB Re-read; `readItem` never calls `getItem` with a closed activity (it uses another held task of the item, else the next rung). T4's whitelist for the §7.3 step-7 re-read stays. Tests: `data/integration.spec.ts`.

### CR-T1-rmm-3 · T1 · status note on CR-T1-rmm-1/2 (append-only update)
- CR-T1-rmm-2: no longer needed — S26a now compares the stored instant (`want …T14:30:00Z`) and passes.
- CR-T1-rmm-1: still open. With the current harness, S24a/S26a/S26b pass as written and fail only in the `kwb-refuse` variant, on the second save at the same step (the UI shows the K-WB panel with the pending values; no UPDATE_ITEM is sent, as WB-9 requires).
- Status: info
- T0 answer: T5 (integration), 2026-10-08: noted; both entries closed above.

### CR-T4-harness-1 · T4 · a Findings row without a criterion code is re-added on every verify pass under server row ids
- File: src/workbench/domain/keys.ts (`naturalKeyOf`), used by data/writeVerified.ts `missingFrom`
- Change: give `Safety_Findings` / `Regulatory_Findings` rows a natural key even when `Findings_Criterion_Code` is blank (e.g. treat a blank criterion as "" and key on `Findings_Text`, which the sheet requires), or have T2's RMES sheet require a criterion per finding. Today `naturalKeyOf` returns null as soon as ANY key column is blank, so such a row can only be matched by its client `_id`.
- Why: with server-assigned child-row ids (`childIds=server`, §7.2 / §13.2 #12, unverified live) the read-back never matches the add, so `writeVerified` re-adds the finding on each of its 4 attempts and ends "not kept". Reproduced both at engine level and through the built UI: harness S42, check "(beyond §11.4, CR-T4-harness-1)", gives 4 identical finding rows after one save. Rows with a full natural key (criteria, findings with a criterion, Rounds) are not affected (S42's other checks pass).
- Workaround in the meantime: none in the harness (it reports the check as FAIL). Users can pick a criterion for every finding.
- Status: done
- T0 answer: T5 (integration), 2026-10-08: **accepted (T0 option).** `domain/keys.ts`: `OPTIONAL_KEY_COLUMNS` makes `Findings_Criterion_Code` optional in the natural key of `Safety_Findings` / `Regulatory_Findings` (blank = ""; the key is then the finding text). A blank text still gives null. S42's check "a finding without a criterion code is not duplicated under server row ids" passes. Tests: `domain/keys.spec.ts`, `data/integration.spec.ts`.

### CR-T4-harness-2 · T4 · status note on the requests addressed to T4 (append-only update)
- CR-T1-rmm-1: done. The K-WB helper (`kwbAfter` in scripts/harness-workbench-scenarios.mjs) now handles a save at a step already marked `kwb:refused`: it checks that NO `UPDATE_ITEM` was sent (WB-9) and native-saves the values from the frame's `sessionStorage` sheet `wb:pending:<_id>|<act>`. Re-read "passes" = that sheet is cleared.
- CR-T1-rmm-2: done. The runner's browser context uses `timezoneId: "Europe/Berlin"`; S10/S26a compare the stored instant with the typed local time converted in the page (exact, no ms).
- CR-T2-review-1 (T4 part): done. The global check "no command refused unless the scenario expects it" accepts a `moved-out` `PROCESS_GET_ITEM` of an `_id|act` that this session already submitted, rejected or sent back (also after `nativeSubmit`/`nativeSendBack`); a moved-out WRITE is still reported (unit test in harness/hostEngine.spec.ts).
- Also new for T1–T3: `__kfHost.switchUser(id, route)` / `t.switchUser()` signs in another fictional user on the same host state (S40 uses alex → tove → alex); host param `c4Rmes=complete` gives C4 a complete SAF RMES sheet (S12a/S12b).
- Status: info
- T0 answer: T5 (integration), 2026-10-08: noted; re-checked in the full run.

### CR-T4-harness-3 · T4 → T0 (+ T2) · a passing K-WB Re-read does not signal a change: the lane screen stays stale
- File: src/workbench/data/actions.ts (`reReadPendingRt`); features/review/LaneWorkspace.tsx (`KwbFallback onResolved`)
- Change (T0): when the compare matches (`cmp.matches`), call `rt.changed()` as the "moved out" branch already does: the values were saved in the native form, i.e. server state changed outside the Workbench. (T2 alternative: reload the case bundle in the lane's `onResolved`, as T1's panels do with `onChanged()`.)
- Why: matrix runs S12a-kwb-refuse and S12b-kwb-refuse. After sign-off and counts go through the K-WB fallback (native save → Re-read passes, sheet cleared), the host holds `SAF_Gate` "OK" and the sign-off, but the lane still shows the old case values ("SAF Gate is not OK: SAF Open Count is blank; SAF RMES Gaps is blank · the sign-off is not saved yet"), so "Complete review" stays disabled; §11.2 expects "Re-read passes → SUBMIT_ITEM". The `ok` variants pass; T1's panels pass in both variants because they reload in `onResolved`.
- Workaround in the meantime: none in the harness (reported as FAIL). A user can reload the page.
- Status: done
- T0 answer: T5 (integration), 2026-10-08: **accepted (T0 option).** `data/actions.ts reReadPendingRt` calls `rt.changed()` when the compare matches (the sheet is removed first). S12a-kwb-refuse and S12b-kwb-refuse pass. Test: `data/integration.spec.ts`.

### CR-T4-harness-4 · T4 → T5 (T0, T2) · status note: full harness run 2026-10-08 07:13 IST (01:43 UTC), the 3 open UI defects (append-only update)
- Run: `node scripts/harness-workbench.mjs --html <scratch build of the current sources>` (all 50 scenarios + the 18 `kwb=refuse` matrix variants, 2079 checks) → `dist-workbench/harness-report.json`: **65 PASS, 3 FAIL, 0 PENDING of 68 runs**. Per scenario and variant: `byScenario` in the report. `dist-workbench/zip/index.html` is still T0's stub build, so T5 must `npm run build:workbench` before `npm run harness:workbench`.
- The 3 FAILs are UI-side; the requests addressed to T4 (CR-T1-rmm-1/2, CR-T2-review-1) are done (CR-T4-harness-2):
  1. **S12a-kwb-refuse** — check "wb-lane-complete: enabled" (then "an F8 lane.completed row with the SAF lane", "the case at S5" follow from it). Screenshot `dist-workbench/harness-S12a-kwb-refuse-failure.png`: after the native save and a passing Re-read, the lane says "The values are saved. You can submit from here" but still shows the old server values (SAF open count blank, RMES gaps blank, SAF Gate blank) and lists "the sign-off is not saved yet", so Complete review stays disabled. Cause: `data/actions.ts reReadPendingRt` removes the sheet on `cmp.matches` without `rt.changed()`, and `features/review/LaneWorkspace.tsx` `onResolved` only sets `kwbReady`. Fix: CR-T4-harness-3 (T0: `rt.changed()` on a match; or T2: reload the case bundle in `onResolved`).
  2. **S12b-kwb-refuse** — same check and cause; screenshot `dist-workbench/harness-S12b-kwb-refuse-failure.png`. Also fails "the post-submit note (could not read with your access) shows", because the submit never happens.
  3. **S42 (ok)** — check "(beyond §11.4, CR-T4-harness-1) a finding without a criterion code is not duplicated under server row ids" → 4 identical rows after one save. Screenshot `dist-workbench/harness-S42-failure.png` (the RMES Findings list shows the repeated row). Fix: CR-T4-harness-1 (T0 `domain/keys.ts naturalKeyOf`, or T2 requires a criterion per finding). The §11.4 checks of S42 itself pass.
- No other open item for T4. Status: info
- T0 answer: T5 (integration), 2026-10-08: all three defects fixed (CR-T4-harness-1, CR-T4-harness-3); see the final run in `kissflow-build/ciq-digital/WORKBENCH-UI-LOG.md`.
