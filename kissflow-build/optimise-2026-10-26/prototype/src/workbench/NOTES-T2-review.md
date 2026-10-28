# T2 notes: reviewer, open points, CR assessment, RMES (2026-10-08)

Built against `kissflow-build/ciq-digital/WORKBENCH-DESIGN.md` §8.7–§8.11 (with §0.3, §3, §7, §12, §14). Local only:
no Kissflow call of any kind, no deploy, no `.env` read. Fixtures in tests are fictional (`@example.test`).
T2 wrote only `src/workbench/features/{review,points,assess,rmes}/**`, this file and one entry in `CHANGE-REQUESTS.md`.

## Checks (run from `prototype/`)

| Command | Result |
|---|---|
| `npm run typecheck` (existing) | clean |
| `npm test` (existing) | `Test Files 7 passed (7)` · `Tests 81 passed (81)` |
| `npm run typecheck:workbench` | clean (0 errors in the whole Workbench at the time of the last run) |
| `npx vitest run -c vitest.workbench.config.ts src/workbench/features/{points,review,assess,rmes}` | `Test Files 4 passed (4)` · `Tests 88 passed (88)` |
| `npm run test:workbench` (all builders) | `Test Files 45 passed (45)` · `Tests 770 passed (770)` |
| Harness, T2 scenarios, against a scratch build (`--html <scratchpad>/wb/workbench.html --report harness-report-t2.json`) | **5 passed, 0 failed, 25 pending of 30 runs (539 checks)**: PASS S11a, S11b, S11b-kwb-refuse, S35, S37. Every other T2 scenario passes its entry check and then reports PENDING because T4's scenario body stops there ("steps after … need the T2 screens"); T5 writes the remaining steps |

`npm run build:workbench` was not run (it writes the shared `dist-workbench/`); the scratch build used the same
`vite.workbench.config.ts` with `--outDir` in the scratchpad. The harness wrote only `dist-workbench/harness-report-t2.json`
and its screenshots.

## Done

- **§8.7 Review queue** (`review/ReviewQueue.tsx`): held tasks only, grouped by `groupReviewTasks` (CASE_B_/OPNT_R_/CHRQ_B_ of
  `reviewerDepts`, plus **every held OPNT_S1** whatever the roles); tabs Case reviews · Open points · Record supplier
  response (manual, only when non-empty) · Change requests · Waiting on supplier (rung 1 only: per-item admin reads of my
  departments' supplier points, `waitingOnSupplier`); unidentified-step tasks with "Open in Kissflow"; RMES link for editors.
- **§8.8 Lane workspace** (`review/LaneWorkspace.tsx`, B_RMM included): sections column (definition fields, Components,
  search keys, "Raise open point" with a prefilled reference, "Mark reviewed" = F8 `section.reviewed` row); blockers
  (`laneBlockers`: open points, pending CR assessments (none for RMM), RMES, section-review marks WB-D5 with "could not
  check"); server open count / RMES gaps / gate read-only with the mirror's explanation; **Refresh counts** through T0's
  `refreshCaseCounts` (complete → written; partial → the unread list, fail-closed message or **Attest and write**); sign-off
  (confirm, On_Behalf_Of + F8 Delegation `lane.on-behalf`, SAF/REG decision and reason, Completed_By/_Email/_At = me, now);
  **Complete review** = `submitStep` with `LANE_FIELDS[D]` and the blockers as `extraChecks` (the F8 `lane.completed`
  snapshot is T0's step 6); `NotesPanel` (T3).
- **§8.9 Open points**: `PointList` (props only), `RaisePointDialog` (kinds from `opKindOptions`, Responsible_User = me,
  live Start-gate preview, server Start_Gate → problems + draft kept → "Send again" / "Discard draft"), `createPoint`
  (contract kept) + `createPointWith`, point detail with Rounds and thread; actions by HELD task only (`pointPanel`):
  R_<D> Accept / Withdraw / Return (T0's `sendBackPoint` with both fallbacks) / progress / late decision; **Confirm
  withdrawal only** when OP_Outcome is "Withdrawn"; OPNT_S1 "Supplier responded (manual record)" and "Withdraw point".
  K-WB: the fallback panel with Re-read, then "Submit this step".
- **§8.10 CR assessment** (`assess/AssessCr.tsx`): CR facts, impacts, `<D>_Assessment` + note, by/at automatic, "Finding
  raised" → raise-point (needs the case to be readable), Save / Save and submit, K-WB fallback.
- **§8.11 RMES sheet** (`rmes/RmesSheet.tsx`): editor-only route guard before any read (`?dept=SAF|REG`); index of my
  sheets; create from the pinned release's RMES criteria after PS-05; duplicates (oldest kept, others voided); soft lock
  (written on open, Take over, released on leave); criteria grid by part with the mirror preview and the server value;
  findings add/modify, "Raise point from finding"; **two-phase save** (`rmes/save.ts`). `RmesSummary` (read-only, no lock,
  no link) for T3's approval screen.

## Unit tests (T2 acceptance)

`points/points.spec.ts` (29): Return patch (Rounds row, Round_No, Query_Key, clears, Awaiting_Response, OP_Outcome untouched,
writable at every R step); refused round write → fallback with Rounds + header values and no "already saved"; refused
send-back after a verified write → "already saved", send-back to the learned OPNT_S1 activity; Accept / Withdraw /
Confirm-withdrawal each set Reviewed_* and one Rounds row; Late_Decision only at R_REG/R_SAF; Confirm withdrawal is the
only action on a withdrawn point; the S1 panel enabled for a non-RMM holder and read-only for an RMM non-holder; S1
withdraw and manual-response builders (writable at S1); `opKindOptions` both flag states; raise data (keys, never
Start_Gate, writable at S0, mirror OK); createPoint with a host-computed Start_Gate (blocked → draft kept, no submit →
resumed → submitted). `review/review.spec.ts` (22): queue grouping, waiting-on-supplier, every blocker group incl. the
section-review blocker (led/not N.A., case + cycle match, unreadable F8 under fail-closed/attest, informational switch),
blockers → problems, sign-off patch writable at every CASE_B_ step. `rmes/rmes.spec.ts` (30): the `Criteria_Open_Num`
mirror against every vector of `schema/formulaSamples.ts`; header counts from read-back (blank applicable → 1 with a
warning); duplicate plan; lock rules; dirty-rows-only phase-1 patch with natural keys; create seed; two-phase save with
the fake host (phase 1 Table:: then phase 2 header; phase 2 refused → "Rows saved; header counts not updated"; no dirty
row → fresh read). `assess/assess.spec.ts` (7): assessment patch writable at every CHRQ_B_ step; options; PointList SSR.

## Browser smoke (scratch, T4's host page, fictional fixtures)

Against T4's emulated host (bundled into the scratchpad; nothing in the project touched): S11a (partial, unread named,
no write, Complete disabled), S11b (SAF_Open_Count 1 / RMES gaps 3 written, gate blank explained), S17 (one verified
UPDATE_ITEM then SENDBACK to the OPNT_S1 activity), S21's Confirm withdrawal (only action; Reviewed_* + one Rounds row,
then submit), S22 (server Start_Gate blocks, draft kept, "Send again"), S28 (assessment saved, verified, submitted),
S29 (lock written, phase 1 Table:: rows, phase 2 header from read-back, finding added), S36 (jo raises a SAF supplier
point; with `kfa=on` it appears under "Record supplier response (manual)" with the point's Supplier_Due_Date; S1 panel
enabled; response recorded; the point moves to R_SAF). T4's global checks passed in each run except the item in CR-T2-review-1.

## Deviations and choices (the simpler safe option where the design is open)

1. **Test ids added or interpreted**: `wb-lane-save` = "Save sign-off" (T4's scenarios use it; not in §8.8); `wb-point-return`
   = the Return option of the decision chooser (visible on arrival), its submit `wb-point-return-submit`; other options
   `wb-point-mode-accept` / `-withdraw`; `wb-point-raise` = the raise dialog body, submit `wb-point-raise-submit`;
   `wb-point-startgate` = the problems block after a create; `wb-review-tab-{cases,points,supplier,crs,waiting}`;
   `wb-rmes-denied` (T0's stub id kept), `wb-rmes-takeover`, `wb-rmes-void-duplicates`, `wb-rmes-save-result`,
   `wb-counts-attest-text`, `wb-lane-complete-why`, `wb-point-done`, `wb-point-continue`. Selects of the kit drop
   `data-testid`, so selects that need one are wrapped (`wb-point-kind`, `wb-assess-assessment`, …).
2. **Sign-off save** always writes Completed_By/_Email/_At = me, now (§8.8) plus confirm/decision/on-behalf; only "Rejected
   needs a reason" blocks the save. The Mandatory set is checked by `submitStep` on the server read at Complete review.
   Emptied values are cleared with `CLEAR`. The Delegation row is written only when On_Behalf_Of changed to a non-blank value.
3. **Complete review** is also disabled while the server gate is not OK or the sign-off is not saved, with the reasons listed.
4. **Section marks "could not check"** (F8 list not complete): blocking under fail-closed; under `attest` it passes once the
   lane counts were attested in this session (my reading of "handled like a partial count").
5. **Late decision** (R_REG/R_SAF only) is offered when the case lane is complete, the case is past the join, or the point is
   a "Department review" (the S5 alternative, where the lane is incomplete by definition); hidden when the case is unreadable.
6. **Raise**: Supplier_Due_Date is not client-checked (the server Start_Gate decides, S22); Supplier_Justification is
   required for supplier points; Internal_Due_Date prefilled +7 days; one OP_Key per raise (a resumed draft keeps it);
   closing with an unsent draft asks "discard or keep editing"; `Ref_Kind` offers conventions (it is a Text field)
   [convention]; points from a finding carry `Ref_Internal_Key = <RMES row key>#<finding row _id>`, from a CR its `CR_Key`.
7. **OPNT_S1**: withdraw writes exactly the three design fields; file names are stored as a JSON array of names; the
   response kinds (brd L465) live in `points/model.ts` because Response_Kind is a Text field.
8. **RMES**: create and duplicate voiding are **explicit buttons** (no write on page open except the designed lock);
   the lock release is delayed one tick (a dev StrictMode remount cancels it) and never clears a lock someone else holds;
   "Recount header counts" with no dirty row reads the row fresh through the provider's client (list rows may not carry
   child tables) before phase 2. Findings states "Open"/"Closed" and the limit comparator are provisional (Q9).
9. **Waiting on supplier** reads through `data/runtime` (`readList`, `fillAdminRows`; no hook exists for a point list);
   the tab shows while rung 1 may still be tried and stays once opened (a refused admin list then explains itself).
10. **After a submit** the task leaves the queue: screens keep the task they were opened with (`review/useKeptTask.ts`) to
    show the outcome (lane diff, "could not read with your access", "Sent back in Kissflow"); actions still need the held
    task. A point page offers "Continue" when the user now holds the point's next step. One toast per action.
11. Shared screen helpers live in `review/kit.tsx` (used by T2's folders only).

## Stubbed / not built

- "Additional part" raise (flag `additionalPartRaise` off; `raiseProblems` refuses it) and its F4/F3 path.
- Send-back fallbacks beyond `openForm` (T0 lists "ask Thomas"), AI fields (shown read-only), staleness of section marks.

## Open issues

- **CR-T2-review-1** (T0 + T4): after a submit or send-back the hooks re-read with the just-closed activity, so the host
  refuses one `PROCESS_GET_ITEM` ("moved out of your queue"); T4's "no command refused" check flags it. The writes are right.
- T5/T4: 25 T2 scenarios are PENDING after their entry check; the steps after it are to be written against the ids above.
- No jsdom: screens are covered by the pure-model tests, one SSR render and the browser smoke above.
