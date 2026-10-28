# T1 notes: RMM — My work, cases, case steps, change requests (2026-10-08)

Built against `kissflow-build/ciq-digital/WORKBENCH-DESIGN.md` §8.1–§8.6 (with §0.3, §3, §7, §12, §14). Local only:
no Kissflow call of any kind, no deploy, no `.env` read, no npm install. Fixtures are fictional (`@example.test`).
T1 wrote only `src/workbench/features/{rmm,case,cr}/**`, this file, and appended entries to `CHANGE-REQUESTS.md`.

## Checks (run from `prototype/`)

| Command | Result |
|---|---|
| `npx vitest run -c vitest.workbench.config.ts src/workbench/features/{rmm,case,cr}` | `Test Files 6 passed (6)` · `Tests 61 passed (61)` |
| `npm run test:workbench` (whole Workbench, other builders included) | `Test Files 45 passed (45)` · `Tests 773 passed (773)` |
| `npm run typecheck:workbench` | exit 0 (clean) |
| `npm run typecheck` (existing) | exit 0 (clean) |
| `npm test` (existing) | `Test Files 7 passed (7)` · `Tests 81 passed (81)` |
| Harness, T1 scenarios (T4's in-progress harness, `--ui` against a private dev server on :5341) | **18 PASS, 3 FAIL, 2 PENDING of 23 runs (622 checks)** — see below |

Harness detail (`node scripts/harness-workbench.mjs --ui http://127.0.0.1:5341/workbench.html S06 S07 S08 S09 S10 S23 S24a S24b S26a S26b S27 S39 S40 S44`):

- PASS: S06, S07, S08 (+kwb-refuse), S09 (+kwb-refuse), S10 (+kwb-refuse), S23, S24a, S24b (+kwb-refuse), S26a, S26b,
  S27 (+kwb-refuse), S39, S44.
- FAIL, kwb-refuse variant only: S24a, S26a, S26b. Each fails on the **second** save at the same step (Refresh counts,
  then the panel save). After the first 050313 the step is marked `kwb:refused` on strong evidence, so the next save
  sends no `UPDATE_ITEM` and opens the K-WB panel with the pending values directly (WB-9, §7.2 "Before a task write";
  S16 expects exactly that). The harness helper `kwbSave` waits for a refused `UPDATE_ITEM` and never native-saves.
  Reported to T4 as CR-T1-rmm-1 in `CHANGE-REQUESTS.md`. The UI part of those checks (panel, sheet, My Tasks line) passes.
- PENDING: S40 (+kwb-refuse): T1's half passes ("a Department review point raised for QM"); T4 marks the second half
  (tove accepts, alex records the late completion) pending on T2's point screens.

The dev server and harness `--serve` were started in the scratchpad session only; `dist-workbench/harness-report.json`
and its screenshots were rewritten by these runs (T5 reruns everything anyway).

## Done (§12.1 T1)

**§8.1 My work** (`features/rmm/MyWork.tsx`, `workGroups.ts`): held tasks grouped "Record supplier steps (manual)"
(S1, S3, S7, OPNT_S1), "Decide and check" (S2, S5, S8, B_RMM, OPNT_R_RMM, CHRQ_S1) and "Other tasks you hold"; rows
with case code·cycle, material, supplier, step and the step's due date (overdue marked); rows open `taskPath`
(or the TaskRouter). Case drafts (`getMyItems` draft) with Continue / Discard (confirmed, own draft only). Rung-1 tiles:
stray rejected points/CRs, cases ended without a cancellation event. Empty state "No CIQ tasks for you right now."

**§8.2 Cases list** (`case/CaseList.tsx`, `caseFilters.ts`): the ladder + F8 index, search over the 7 listed columns,
filters (status, step, supplier, owner, active department; test cases hidden by default), lane chips, overdue due date,
"+ New case" only with `canInitiate`, `ReadQualityBanner`, both empty states (the second links to Diagnostics).

**§8.3 New case + reactivate** (`rmm/NewCase.tsx`, `createCase.ts`): suppliers (active) + contacts with the
"not invited to the portal yet" warning, pinned Live/Test release, Settings defaults; client checks (contact rule, BASIC
definition, release) before anything is created; `createProcessItem` with the `_id`-derived `Case_Code` /
`Request_Key`; then the BASIC F3 row; then F8 "Item created" with the header snapshot; navigate to the case. Finish
setup (idempotent by key) on the case. Reactivation: same `Case_Code`, `Cycle_No + 1`, `Reactivates_Case_Item`,
allowed within `reactivationDays` of the Cancellation event. Draft continue (`?draft=&act=`) passes `o.draft`.

**§8.4 Case detail** (`case/CaseDetail.tsx`, `CaseTabs.tsx`): header (codes, material numbers, supplier, owner, release
pin, status), stepper in v4 order (S6 only when required), the hand-off note, tabs Overview / Departments & lanes /
Sections (incl. N.A. from `Result_JSON`, runs) / Open points (T2 `PointList` + `RaisePointDialog`) / Change requests /
Notes (T3) / Audit (T3). Actions: Cancel case (held task at a Reject-on step → `rejectCase`; Case Admin in Part 2/S6 →
`cancelCaseAsAdmin`, with the open items listed for manual ending), Reactivate, Finish setup, Repair lane
(UI over `repairLane`, offered only when `repairBlocker` is null). Read-only without a held task.

**§8.5 Step panels** (`case/panels/*`, logic in `case/stepLogic.ts`, `case/scope.ts`): every panel renders one
`StepForm` (`wb-step-<IRSTEP>`), writes only changed values, and shows every outcome through `WriteOutcome` /
`KwbFallback` (a stored sheet reopens after a reload; after a passing Re-read nothing is written again).
- S1 "Supplier sent the basic data (manual record)": `Basic_Data_Received` + contact edits; portal id left blank.
- S2 Scope check: pinned config (Template + definitions + ownership + Text bundle + Settings); content hashes checked
  against the case's manifest copy (mismatch blocks and writes one F8 `config.hash.mismatch` per session); extend-only
  applicability with justification; department flags from leads, RMM from Settings, add-with-reason; texts (bundle key
  or `MANUAL-<date>`) and due dates; Save scope = F4 run once → missing F3 rows one at a time → S2 Mandatory set;
  `Rule_Set_Version` on case and F4; the submit checks the rows exist. A rerun creates no duplicates.
- S3: typed "Supplier confirmed at" → `Completeness_At` **and** `RMES_Created_At` (no ms) + the S3 optional set.
- S5 / S8: Refresh counts (complete → written; partial → counts policy: fail-closed lists `unread`, attest writes F8
  first), override (F8 `hold.override.*` first, then the reason with the other values; not recorded twice on retry),
  `Hold_Note`, exactly `editableAt(step)`, the server gate. S5 lane check (a)/(b) as the submit's extra check, with
  "Raise department review for D" (T2 `createPoint`), "Record late completion", and Repair lane (Case Admin, rung 1).
- S7 "Supplier released (manual record)": counts refreshed first (partial → CLEARED so S8 runs), typed "Supplier
  released at" → `Final_Release_At`, `Completion_Trigger` "Manual by RMM: <reason>", the exact optional set; no "PDF"
  or "e-mailed" text.
- B_RMM / lane tasks → T2 lane workspace; S6 → T3 approval; unidentified step → "Open task form" only.

**§8.6 Change requests** (`cr/ChangeRequests.tsx`, `crLogic.ts`): list (held Triage tasks on top; case link by
`crBelongsTo`; status·step; outcome; impact chips), detail with Triage at CHRQ_S1 (case picker preselected by code +
cycle; released rule incl. S8 and Completed-after-S7 → outcome forced, impacts No, F8 "Change attempt" before the
submit; `crOutcomeOptions(flags)`), manual CR (Y6, "manual record", portal fields blank; client requires
`Case_Code`, `Change_Kind`, `Change_Reason`).

**Unit tests** (all §12.1 T1 items): `rmm/createCase.spec.ts` (call order with a fake actions layer; S07 no-create;
idempotent Finish setup; reactivation; the S06 command order on T0's real actions over the fake host),
`case/scope.spec.ts` (flags from leads; RMM from Settings; never reduce; `Rule_Set_Version`; Save scope once / no
duplicates / refuses on a partial read), `cr/crLogic.spec.ts` (released rule incl. S8 and Completed-after-S7; forcing;
`crOutcomeOptions` off/on; untriaged link; manual CR), `case/stepLogic.spec.ts` (S5 lane check (a), (b), failing (b);
S7 clear-on-partial and written-on-complete on the fake host; S3 both fields; override F8-first), `rmm/workGroups.spec.ts`
(grouping, tiles, list filters), `case/render.spec.tsx` (SSR of every panel and tab inside the real provider: test ids,
no computed inputs, no hand-off claims).

## Stubbed / depends on other tasks

- `createPoint`, `PointList`, `RaisePointDialog` (T2), `NotesPanel`, `AuditTimeline` (T3) are used through their §12.2
  contracts; whatever their current bodies do is what the case tabs show.
- "Accepted – scope extended" side effects (BR-053) are not built (flag off, as designed).
- The S2 BASIC-answers check is shown as "not checked" (K-14).

## Deviations and conventions (simpler safe option where the design is open)

1. **My work also lists "Other tasks you hold"** (other roles' steps, unidentified steps), so S10's "My work lists all 3
   Part 2 activities" holds for a multi-role user and no held task is invisible.
2. **Drafts "Continue"** opens the New case form with `?draft=<id>&act=<act>` (the S0 panel is the New case form; the
   TaskRouter only knows held tasks).
3. **"Never reduce" at S2** (brd L783): applicability never below the template default, an existing F3 row keeps its
   section in scope, required or already-active departments cannot be switched off; extra departments need a reason.
   Once the F4 run exists, the table is **locked** to the recorded run (`Result_JSON` v1) and Save scope only adds
   missing rows and rewrites the case fields (idempotent). The lead department is shown, not editable.
4. **New case refuses up front** when the pinned release has no BASIC Section definition (instead of creating a case
   that needs Finish setup at once).
5. **Contacts are not preselected**; the user ticks them (S07 semantics).
6. **Triage defaults** [convention]: `Notice_Kind` "Change request outcome" (the X6 literal, brd L1299);
   `Contact_Verified` "Yes" for a **manual** CR (no portal item), blank for a portal CR; after release a neutral
   supplier text. All editable. Triage is blocked when the case's release state is not readable (index-only case).
7. **S7 reason** is prefilled ("supplier release recorded by hand") and editable; the submit refreshes counts only if
   not refreshed in the panel yet, and saves only what is unsaved.
8. **Raise department review** creates the point directly with a prefilled question (no dialog), internal, due in 3 days.
9. **Cancel dialog** is T1's own (confirm enabled; an empty reason shows an error and sends nothing) because T0's
   `ConfirmDialog` disables its button, which a test runner cannot click; test ids `wb-confirm` / `wb-confirm-reason`.
   A failed cancel renders with `wb-write-refused`.
10. **Typed supplier times** are `datetime-local` inputs converted to a UTC instant without ms (`kfDateTime`, as T0's
    FieldInput does).
11. **Process lists via `useFormRows`** (CR list, rung-1 tiles): it reads any flow through the ladder and returns raw
    rows for Processes; object filters only (CR-T3-admin-1). Case drafts are read with `client.listMine(…, "draft")`
    from the provider context (no hook exists).
12. **Extra test ids** (beyond §8): `wb-panel-<IRSTEP>`, `wb-step-save`, `wb-field-<FieldId>` on New case inputs and the
    S1/Triage selects, `wb-s7-reason`, `wb-case-code`, `wb-case-overview`, `wb-case-readonly`, `wb-case-finish-setup`,
    `wb-cr-row-<id>`, `wb-crs-new`, `wb-counts-result`, `wb-s5-lane-<D>`, `wb-scope-*`.
13. Case tab names: `overview`, `lanes`, `sections`, `points`, `change-requests`, `notes`, `audit` (`?tab=`).
14. Logic files are named `caseFilters.ts` / `workGroups.ts` (not `caseList.ts` / `myWork.ts`): on the case-insensitive
    disk they would clash with `CaseList.tsx` / `MyWork.tsx`.
15. `features/case/t1.fixtures.ts` holds fictional test data for T1 specs only (never imported by the app).

## Open issues

- CR-T1-rmm-1 (T4): matrix variant of S24a/S26a/S26b (second save at a refused step).
- `createFormRow` does not call `rt.changed()` (CR-T3-admin-2): T1 reloads the case bundle itself after Save scope and
  Finish setup, and counts rows it created as existing until the reload.
- Foundation reloads re-read a just-closed task with `getItem` ("moved out of your queue") before falling back; the
  harness now tolerates it. Not changed by T1.
- Every [unverified] live item of §13.2 stays open (K-WB for real users, `openForm` in the Application component,
  SDK reject, Date/User/Reference write shapes, `getProgress` shape, `Table::` ids).
