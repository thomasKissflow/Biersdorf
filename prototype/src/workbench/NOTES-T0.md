# T0 notes: foundation (2026-10-08)

Built against `kissflow-build/ciq-digital/WORKBENCH-DESIGN.md` (§0.3, §3–§7, §9, §10, §12). Local only: no Kissflow
call of any kind, no deploy, no `.env` read. Fixtures and samples are fictional (`@example.test`).

## Checks (run from `prototype/`)

| Command | Result |
|---|---|
| `npm run typecheck` (existing) | clean (`tsc -b`, no output) |
| `npm test` (existing) | `Test Files 7 passed (7)` · `Tests 81 passed (81)`: same scope as before (the Workbench uses `.spec`) |
| `npm run typecheck:workbench` | clean |
| `npm run test:workbench` | `Test Files 24 passed (24)` · `Tests 397 passed (397)` |
| `npm run build:workbench` | `workbench zip: dist-workbench/ciq-workbench-ui-<hash>.zip (382 KB …)`: under 5 MB; manifest `{"Category":"Application","Framework":"React"}`; guards passed (no `X-Access-Key`, no harness marker, build stamp present) |
| Credential scan of `dist-workbench/zip/index.html` | 0 hits for `X-Access-Key`, `access_key`, `AccessKey`, `Bearer `, `client_secret`, the account id, the sandbox host, the harness marker (`.env` hits are the SDK's `this.env`) |
| Browser smoke (scratch fake host, not the T4 harness) | opened directly → "Not running inside Kissflow"; framed → boot, shell, nav by capability, Home → `/my-work`, Diagnostics renders; View as "CIQ Safety Reviewer" → nav Review/RMES/Cases, lens banner, **no** `PROCESS_GET_ADMIN_ITEMS` while the lens is on; **no write command** in either run |

`npm run build:portal` was not run (it would overwrite `dist-portal/` artifacts); its inputs are unchanged and
`tsc -b` covers the portal type-check.

## Done (§12.1 T0)

- **Generator** `scripts/gen-workbench-schema.mjs` (`--check`, `--readback`, `--spec`) and committed
  `schema/generated.ts` (spec rev 31, sha256 `203cef6d…`): FLOWS, FIELDS (`computed`), F, CHILD_TABLES, LISTS, STEPS
  (perms without computed fields, `gates`, `fieldAssigned`, parallel), STEP_BY_NAME, SWITCHES, ROLES, GRANTS, DEPTS +
  DEPT_STEPS, CR_DEPT_FIELDS, LANE_FIELDS, POST_CREATE_KEYS, ADMIN_WRITE_ALLOW. Guards 1–12 each tested by mutating the
  spec; drift test = `--check`.
- **schema/index.ts** helpers; **formulaSamples.ts** vectors for all 14 spec formulas, checked against the formula
  text by a reference evaluator and against the client mirrors in `data/gates.ts`.
- **kf/**: copied `connectKf` (frame check, 12 s race, `looksLikeKf`), facade with reject/withdraw (no act)/sendback/
  openForm/getProgress/Dataform discard and **no delete**; roles by name, SEC-HR2, capabilities, landing; View as
  (getRoles probe 5 s, narrows only, skips rung 1, sessionStorage guarded).
- **data/**: client (bounded calls, TimeoutError, 429 retry, paging with `_id|act` dedupe, read-only admin REST
  fallback, read ladder), tasks + evidence resolver, map + view models, hooks/provider (+ toasts, busy, warnings,
  flagsFor fail-closed until Settings are read), write queue (container check, per-item chains, uncertain items, one
  create lane + `navigator.locks` in try/catch), writeVerified (guards, normalise, re-apply ≤3, child rows by `_id` or
  natural key, K-WB marking on strong evidence only), actions (saveAtStep, submitStep + `lane.completed`, K-WB
  openTaskForm/reReadPending, reReadUncertain, rejectCase F8-first, cancelCaseAsAdmin, sendBackPoint with both
  fallbacks, createProcessItem/createFormRow with discard-first and settle, updateFormRow, writeAudit, refreshCaseCounts
  with the counts policy and S7 clear), audit (create-only + one correction), counts/gates (pure), adminRepair
  (allow-list asserted before sending), pendingSheet.
- **domain/**: keys, flags (+ option functions), config (pinned release, manifest, payload parsers, sha256 content hash,
  Rule_Set_Version), labels.
- **ui/**: StepForm (`stepFormModel` tested for every step + SSR render), FieldInput, WriteOutcome, KwbFallback (all
  test ids of §7.4), ReadQualityBanner, ManualRecordNote, overlay (copied Modal/Drawer/Tabs), Toaster (provider-bound),
  badges, ConfirmDialog, FeatureStub.
- **shell/** (nav by capability, route registry, boot states), **pages/** (Diagnostics with redacted copy and read-back
  copy, Home, TaskRouter + `taskPath`).
- **Build**: `workbench.html`, `vite.workbench.config.ts` (single file, `__WORKBENCH_BUILD__`, writes
  `build-stamp.txt`), `scripts/zip-workbench.mjs`, `tsconfig.workbench.json`, `vitest.workbench.config.ts`, npm scripts,
  the one `tsconfig.json` exclude line.
- **Stubs with final signatures** in every `features/*` (§12.2): routes + navItems per folder; `CaseDetail`,
  `LaneWorkspace`, `PointList`, `RaisePointDialog`, `createPoint` + `RaiseInput`, `RmesSummary`, `NotesPanel`,
  `AuditTimeline`. The RMES route guard is already in place (no read for non-editors).
- `CHANGE-REQUESTS.md` (empty template), `FOUNDATION-REQUESTS.md` (points to it), `README.md`.

## Deviations and choices (simpler safe option where the design is open)

1. **Change channel** is `CHANGE-REQUESTS.md` (the task's name); the design's `FOUNDATION-REQUESTS.md` only points to it.
2. **Extra T0 files** not in the §3 tree: `data/runtime.ts` (the runtime the actions run on), `data/creates.ts`
   (createProcessItem/createFormRow; keeps `audit.ts` free of update code without an import cycle), `data/session.ts`,
   `pages/redact.ts`, `ui/FeatureStub.tsx`, `testkit/fakeClient.ts` (specs only), `scripts/gen-workbench-schema.d.mts`
   (types for the generator spec). `schema/readback.json` appears only after a `--readback` run.
3. **Action calling style**: the §12.2 signatures exist as module-level functions using the runtime the provider binds,
   plus `createActions(rt)` / `useActions()` with the same signatures.
4. **Contract additions (backward-compatible)**: `createProcessItem(…, { draft })` resumes a draft left at Start when the
   Start check fails (S22; `ActionError.draft` carries it); `createFormRow` returns `{ itemId, missing? }` (`missing` only
   with `reapply: false`); `ReturnInput` takes an optional `portalContactIds` (COH-12 refresh; `sendBackPoint` has no
   case argument); `SaveResult` "refused" has an optional `code` (`wrong-container`, `uncertain`, `no-task`, …);
   extra actions `cancelCaseAsAdmin`, `reReadUncertain`, `discardDraft`; `useWorkbench()` also returns `actions` and
   `containerOk`.
5. **Container check fails closed**: a handshake without an app id counts as the wrong container.
6. **Rung 1** is tried for every user (unless the lens skips it); a refused admin list is remembered per flow for the
   session, so later reads go straight to rung 3. Diagnostics skips the admin probe while the lens has no flow Admin.
7. **Drafts** (`_status` Draft) are not counted as open points or CRs (never submitted).
8. **Guard 9** also fails when a formula field is *Editable* at a step (so the guard is reachable; Mandatory → gate).
9. **Return fallback** sheets carry `mode: "values+sendback"`: Re-read passes only once the task left the queue.
10. **Child adds** send `_is_created: true` and a client `_id`; `_index` only when the caller sets it [unverified
    whether the host needs it].
11. **`Actor_Role_Id`** = the user's AppRoles ids joined (no per-action role is known); `Actor_Dept` from the lensed
    roles (RMM first), the lane department for `lane.completed`.
12. **guards.spec.ts** treats `testkit/` like specs for the updateAdminItem / toISOString bans, and checks that nothing in
    the app imports `testkit/`.
13. Hooks reload after every successful write (one version counter): simple, possibly chatty on big lists.
14. **Step resolution uses the user's REAL roles**, not the lensed ones (§6.3 says "lensed"): with a lens on, a single
    REG task could otherwise resolve to the lensed SAF branch (block-unique) and a 050313 would mark the wrong step.
    The lens filters the task list after resolution. Safer; same result for single-role users.
15. A remembered lens applies **before** the getRoles probe answers (it only narrows), so rung 1 is off from the first
    read; if the probe answers "no", the lens is dropped.
16. `StoredKwbFallback` (ui/KwbFallback.tsx) reopens a stored sheet on load; feature panels render it for their task.

## Known gaps (for T1–T5)

- No harness (T4) and no feature screens (T1–T3). `npm run harness:workbench` points at T4's future script.
- No jsdom: beyond `StepForm`, UI components are checked by type and by the browser smoke only.
- In the browser automation, picking an option of the kit `Select` inside the frame by mouse did not register
  (keyboard did). Likely an automation artifact; T4 should drive selects by keyboard or check it.
- `loadCaseList` on rung 1 reads every open case with `getAdminItem` (pool 4) on each load.
- Task rows' missing case fields (Case_Code, due dates) are filled from `getItem` only for rows that also need a step
  read; other rows show what the list row carries.
- Writing the F8 `config.hash.mismatch` event and blocking S2 is T1's S2 panel (`loadPinnedConfig` reports mismatches).
- RMES two-phase save, lane blockers, S5 lane check, approver rule: owning tasks (T0 provides counts, gates, mirrors,
  `effectiveDecision`, `crBelongsTo`).
- Every [unverified] item of §13.2 stays open; Diagnostics shows them on the first live run.
