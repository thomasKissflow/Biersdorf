# CIQ Workbench (internal app): custom UI log

Kissflow-internal. Design (authoritative): `WORKBENCH-DESIGN.md` in this folder. Source: `prototype/src/workbench/`
(map and rebuild steps in its `README.md`; builder notes `NOTES-T0.md` … `NOTES-T5-integration.md`).

Built LOCALLY on the night of 2026-10-07/08 by six parallel builders (T0 foundation, T1 RMM, T2 reviewer and RMES,
T3 approver/admin/masters/reader, T4 harness, T5 integration and QA). **No Kissflow call of any kind was made** (not even a
read), nothing was deployed or uploaded, no `.env` was read. Every person and supplier in the fixtures is invented
(`@example.test`).

Every claim below is tagged:
- **[verified]**: checked by a unit test, a type check, the build guards or the harness, as stated. The harness is an
  emulated Kissflow host shaped by the design and the spikes: it proves the bundle, the SDK protocol and the Workbench's
  behaviour against that model, **not** how the real host answers.
- **[unverified]**: not yet observed in Kissflow; it needs the generated app and a real signed-in user.

## As built tonight (NOT deployed)

| What | Value |
|---|---|
| Bundle | `prototype/dist-workbench/ciq-workbench-ui-4bbda410d4.zip`: **573 KB** (587,171 bytes; limit 5 MB). Single-file `index.html` (1,553 KB, 586 KB gzip; JS, CSS and Latin fonts inlined) + `manifest.json` `{"Category":"Application","Framework":"React"}`. Build stamp shown on Diagnostics: `2026-10-08T01:57:13.234Z` **[verified]** |
| Target (intended) | The app `CIQ_Digital_A00` in the Development sandbox, its Application custom component. The real app is **not generated yet** (`RESUME.md`), so nothing was deployed |
| Deploy | **Not done** (see "Deploy steps not done tonight" below) |
| Credentials | None in the bundle: 0 hits for `X-Access-Key` (any case), `access_key`, `AccessKey`, `Bearer `, `client_secret`, `api_key`, `secret`, the account id, the sandbox host and the harness marker `__WB_HARNESS_ONLY__` **[verified]**. The build fails on an `X-Access-Key` string, the harness marker, a missing build stamp or a zip over 5 MB **[verified]** |
| Scripts | `gen-workbench-schema.mjs`, `zip-workbench.mjs`, `harness-workbench.mjs`, `harness-workbench-scenarios.mjs` and the Vite/Vitest configs were read: none reads `.env`, `.kf-env` or `process.env` **[verified by reading]** |
| Isolation from the portal | The portal's and the prototype's checks are unchanged and green; the only edit outside `src/workbench` is one `exclude` line in `prototype/tsconfig.json` plus new `*:workbench` scripts and configs **[verified]** |

## What the UI does, per role

Stack: React 19 + TypeScript, Vite 5 (single file), HashRouter, the prototype's UI kit and Tailwind tokens, the bundled
`@kissflow/lowcode-client-sdk` 1.0.49 handshake copied from the portal. Roles are read by name from `kf.user.AppRoles`;
every screen and action is gated by capabilities derived from the generated grants and steps, and **every step action
needs the task the user holds** (never the role alone). Supplier steps are recorded by hand ("manual record"); nothing
is sent to suppliers.

| Role (fixture user) | Gets | Screenshot (`workbench-screens/`) |
|---|---|---|
| CIQ RMM (Alex Rivera) | **My work**: held tasks grouped "Record supplier steps (manual)" / "Decide and check" / other tasks, own case drafts, rung-1 tiles (stray points/CRs, cases ended without a cancellation event). **Cases** list (filters, read-quality banner). **New case** (supplier + confirm contacts, pinned release, `Case_Code`/`Request_Key` from the new `_id`, BASIC section row, F8 "Item created"), reactivation, Finish setup. **Case detail** with tabs (overview, lanes, sections, open points, CRs, notes, audit) and the step panels S1, S2 (scope: F4 run, F3 rows, `Rule_Set_Version`), S3, S5/S8 (counts, override, lane check with the department-review alternative), S7 (counts cleared on a partial read). Cancel case (F8 first). **Change requests**: list, Triage (released rule, forced outcome after release), manual CR. **Suppliers**: new supplier, contacts one row per save | `role-rmm-my-work.png`, `role-rmm-cases.png`, `role-rmm-new-case.png`, `role-rmm-case-c5-lanes.png` |
| Department reviewers: Regulatory (Sam Okafor), Safety (Jo Weber), QM (Tove Marsh), Microbiology (Lee Park), Sustainability (Ana Silva) | **Review queue** (case reviews, open points, "Record supplier response (manual)" for held OPNT_S1 tasks, change requests, waiting on supplier on rung 1). **Lane workspace**: sections led or co-reviewed (raise point, mark reviewed), blockers (open points, CR assessments, RMES, section marks), server gate read-only with the reason, Refresh counts under the counts policy (fail-closed / attest), sign-off, Complete review. **Open points**: raise, Accept, Withdraw, Return (send-back with two fallbacks), Confirm withdrawal, late decision. **CR assessment**. Cases read-only | `role-safety-review-queue.png`, `role-safety-lane-workspace.png`, `role-regulatory-review-queue.png`, `role-qm-review-queue.png`, `role-micro-review-queue.png`, `role-sustainability-review-queue.png` |
| Safety and Regulatory reviewers as RMES editors (Jo for SAF, Sam for REG) | **RMES sheet**: create from the pinned release's criteria, soft lock, criteria grid with the open-count mirror, findings, two-phase save (rows, then header counts from the read-back), duplicate voiding by button. Route guard before any read for non-editors | `role-safety-rmes-sheet.png` |
| CIQ Overall Approver (Wren Ashdown) | **Approvals** queue + decision: case facts, lanes, read-only RMES summary, effective SAF/REG decision with its source (a later department-review decision wins), Approve (blocked by an effective Rejected or an unreadable later decision under fail-closed) or Reject with a reason ("Overall rejection") | `role-approver-queue.png`, `role-approver-decision-c6.png` |
| CIQ Business Admin (Robin Hale) | **Configuration**: list, new draft with payload validation, publish (state patch, then F8), new version (copy-on-write), Retire (F8 first, then `{Config_State:"Retired"}` only), release builder (manifest + hash). **Section templates**. Suppliers read-only. No delete anywhere | `role-business-admin-config.png`, `role-business-admin-suppliers.png` |
| CIQ Case Admin (Casey Moreau, also RMM) | Everything of the RMM, plus **Repair lane** (rung 1 only: F8 `lane.repaired` first, then one admin update with allow-listed lane fields only) and cancel during Part 2/S6 | `role-case-admin-c5-lanes.png` |
| CIQ Reader (Max Reed) | Cases (through the F8 index when the admin list is refused, with a banner), read-only case, **Audit log** (filters, timeline). The only write is adding a note | `role-reader-cases.png`, `role-reader-audit-log.png` |
| Builder / Admin (Dev Builder, all roles) | The union of the above, **View as** lens (narrows only; never `switchRole`; rung 1 skipped while the lens is on), Diagnostics | `role-dev-builder-my-work.png`, `role-dev-diagnostics.png` |
| No CIQ role (No Role) | "No access", listing the user's roles; no item read | `role-no-role.png` |
| Builder only (getRoles answers; since the night review fixes) | **Diagnostics** (never writes): container, build stamp, roles, per-flow list shapes and rungs, field-save / send-back / openForm counters, redacted "Copy diagnostics JSON". Other users get no footer link, no build stamp, and `#/diagnostics` shows "This page is for Workbench administrators." with no probe | — |

Screenshots: `kissflow-build/ciq-digital/workbench-screens/role-*.png` (21 files), taken on the emulated host with the
fictional fixtures (`node scripts/harness-workbench.mjs --screens …`).

**How it copes with the platform limits found in the spikes** (design D32–D35, WB-1…WB-17):
- **Write-then-verify** for every field write: read back through the same route, re-apply what is missing up to 3 times,
  else a "not kept" banner naming the fields (lost updates under simultaneous writes).
- **K-WB fallback**: if Kissflow refuses a field write after Start (050313), the panel lists the values, "Open task form"
  (only on a click, bounded to 8 s) and Re-read (compare, never write). The sheet survives a reload.
- **Read ladder** (admin list → viewer route → my items/tasks) with a confidence rule; counts are written only when
  provably complete (WB-D1 fail-closed), otherwise the screen names what could not be read.
- **F8 audit rows are create-only**, with correction rows; one create lane (discard-first) because Kissflow keeps one
  draft per user.

## Checks run (final run, 2026-10-08 07:27–07:32 IST; build 01:57:13 UTC, harness report 02:02:30 UTC)

| Check (from `prototype/`) | Result |
|---|---|
| `npm run typecheck` (existing) | clean **[verified]** |
| `npm test` (existing) | 7 files, **81 passed** **[verified]** |
| `npm run typecheck:workbench` | clean **[verified]** |
| `npm run test:workbench` | 46 files, **782 passed, 0 failed** (incl. 168 harness-engine tests and `guards.spec.ts`: no forbidden imports, no `switchRole`, no `deleteItem`, no DELETE, `updateAdminItem` only in the facade and the lane repair, no F8 update, `toISOString` only in `normalize.ts`) **[verified]** |
| `npm run build:workbench` | `ciq-workbench-ui-4bbda410d4.zip`, 573 KB; generator `--check` up to date; all zip guards passed **[verified]** |
| `npm run harness:workbench` | **68 passed, 0 failed, 0 pending of 68 runs, 2079 checks** (50 scenarios + 18 `kwb=refuse` matrix variants). Every P1 scenario passes, and both variants of every M scenario. P2 (S19, S28 + matrix, S30, S31, S34) pass too. Report `prototype/dist-workbench/harness-report.json` **[verified]** |

Harness scenarios, all PASS (ok / `kwb=refuse` where M):

| Area | Scenarios |
|---|---|
| Boot, roles, lens, Diagnostics, lists | S01 outside Kissflow · S02 no handshake → Try again · S03 no role · S04 Diagnostics · S05 View as · S33 envelopes and paging · S34 (P2) stepkey=none · S35 Part 2 resolver · S38 wrong container |
| RMM case flow | S06 new case · S07 no confirm contact · S08 M · S09 M · S10 M · S23 cancel (+ refused reject, F8 correction) · S24a M · S24b M · S26a M · S26b M · S27 M CR after release · S39 lane repair · S40 M department-review alternative · S44 sticky drafts / failed Form submit |
| Reviewer, points, RMES | S11a · S11b M · S12a M · S12b M · S13 race once · S14 race always · S15 no overlap · S16 K-WB at REG · S17 Return · S18a send-back 500 · S18b Return refused · S19 (P2) progress off · S20 M · S21 M · S22 Start gate · S28 (P2) M CR assessment · S29 RMES · S36 M OPNT_S1 held by a reviewer · S37 openForm hang/refuse · S41 write timeout · S42 server row ids · S43 child formula off |
| Approver, admin, masters, reader | S25a M · S25b M · S30 (P2) config · S31 (P2) contacts · S32 reader |

Global checks after every host load of every run: no `SWITCH_ROLE`; no delete command or DELETE; no update of an F8 row;
no update of a Published F2 row except exactly the Retire patch; no admin update outside S39 (and there only allow-listed
lane fields); no write naming a computed field; no DateTime with milliseconds; `PROCESS_OPEN_FORM` only after the click;
no overlapping writes to one item; creates never overlap; no unexpected refusal; no page or console error **[verified]**.

**Fixed in integration (T5)**, all from `prototype/src/workbench/CHANGE-REQUESTS.md` (each answered in place):
- **Lane screen stale after a K-WB Re-read** (S12a/S12b `kwb=refuse` failed): a matching Re-read now signals a change, so
  the screen reloads and "Complete review" enables (CR-T4-harness-3).
- **A finding without a criterion code was added 4 times** under server-assigned row ids (S42): it is now matched by its
  text (CR-T4-harness-1).
- **Re-reads with a just-closed task** ("moved out of your queue" after every submit/send-back): the task list reloads
  before the screens, and a closed activity is never read again (CR-T2-review-1). Measured over the full run (report
  field `movedOutReads`): the only "moved out" reads left are the designed ones, i.e. the post-submit check of a lane
  submit (S12a, S12b, both variants: 1 each) and the Re-read after a native send-back (S18a, S18b: 1 each).
- Form creates now refresh the screens (CR-T3-admin-2, not for F8); `useFormRows` predicate cache key (CR-T3-admin-1);
  `WriteOutcome` passes `onResolved` (CR-T3-admin-3).

Before T5: 65 PASS, 3 FAIL of 68 runs (T4's run, 07:13 IST). After: 68 PASS.

## Provisional decisions for Thomas (WB-D…)

Built exactly as the design's provisional defaults; each can be changed in one place.

| # | Built as | Change it in |
|---|---|---|
| WB-D1 | Counts policy **fail-closed**: an incomplete count is not written; the lane/hold/approval check stays blocked and names what was unreadable. `countsPolicy: "attest"` in the pinned release's Settings lets a user attest (F8 `count.attested`). At S7 a partial refresh clears the counts so S8 runs. Consequence: without a viewer route (K-14) only rung-1 users (Case Admin, Thomas) can sign off lanes and approve | `domain/flags.ts`, release Settings |
| WB-D2 | A raised point's `Responsible_User` is the raiser; the raiser records the supplier's answer by hand | `features/points/` |
| WB-D3 | "Additional part" and "Accepted – scope extended" hidden (flags off) | `domain/flags.ts` |
| WB-D4 | Case Admin lane repair from the F8 `lane.completed` snapshot (admin route, allow-listed lane fields, F8 `lane.repaired`) | `data/adminRepair.ts` |
| WB-D5 | Section-review marks block "Complete review" (presence only) | `data/gates.ts` |
| WB-D6 | Retire = state-only patch on a Published config row + F8 `config.retire` | `features/admin/` |
| WB-D7 | F8 Cancellation row before the reject | `data/actions.ts` |
| WB-D8 | Effective SAF/REG decision = newest Accepted "Department review" late decision, else the RMES decision | `data/counts.ts` |
| WB-D9 | The approver sees a read-only RMES summary | `features/rmes/RmesSummary.tsx` |
| WB-D10 | `Rule_Set_Version` = the release's rule set `<key>@<label>`, else `none (manual-wb-1)` | `domain/keys.ts` |
| WB-D11 | Untriaged CRs count toward `Open_CR_Count` | `data/counts.ts` |
| WB-D12 | Manual supplier timestamps required, prefilled with now, editable | `features/case/panels/` |

Choices the builders made where the design was open, worth a yes/no:

| # | Built as | Where |
|---|---|---|
| WB-D13 | After an attestation the approver's decision uses the later department-review decisions that are visible (a visible later "Rejected" still blocks Approve), not only the RMES decision | `features/approver/rule.ts` |
| WB-D14 | CR Triage defaults: `Notice_Kind` "Change request outcome"; `Contact_Verified` "Yes" for a manual CR; a neutral supplier text after release. All editable | `features/cr/crLogic.ts` |
| WB-D15 | S2 "never reduce": applicability never below the template default; once the scope run is saved the table is locked to it and only additions are possible | `features/case/scope.ts` |
| WB-D16 | New case refuses up front when the pinned release has no BASIC section definition | `features/rmm/createCase.ts` |
| WB-D17 | Config conventions: key `<kind>-<section or name>-v<n>`; `Release_Bundle_JSON` shape; `Manifest_Hash` = sha256 of the stored manifest; Retire needs a reason | `features/admin/config.ts` |
| WB-D18 | Contacts: `Contact_Portal_Ids_Text` = active contacts' portal ids, comma-separated, no spaces; "pending invite" = active, invite requested, no portal id; the portal user id is typed by hand. **Touches the X1 contract: agree with the portal session** | `features/masters/contacts.ts` |
| WB-D19 | "Save sign-off" always records the reviewer (by, e-mail, now); "Complete review" stays disabled while the server gate is not OK or the sign-off is unsaved | `features/review/` |
| WB-D20 | RMES sheet creation and duplicate voiding need a button click; the only write on opening is the soft lock | `features/rmes/` |

## Review fixes (night)

Four reviewers (write-layer, spec-fidelity, security-content, UX) reported on the build above; every upheld finding was
fixed in `prototype/src/workbench/**` and the workbench scripts only (`zip-workbench.mjs`, `gen-workbench-schema.mjs`,
`harness-workbench-scenarios.mjs`, new `workbench-deny.mjs` + `.d.mts`). LOCAL only: no Kissflow call, no deploy, no
`.env`. Thomas's provisional defaults are unchanged (WB-D1 stays **fail-closed**; only its explanation changed).

**Checks after the fixes** (2026-10-08 08:33–08:39 IST; build `2026-10-08T03:03:57.152Z`, harness report
`2026-10-08T03:09:18Z`) **[verified]**:

| Check (from `prototype/`) | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 7 files, 81 passed |
| `npm run typecheck:workbench` | clean |
| `npm run test:workbench` | 48 files, **837 passed**, 0 failed (was 46 / 782) |
| `npm run build:workbench` | `ciq-workbench-ui-e18e8ad3a3.zip`, 577 KB; generator `--check` up to date; every zip guard incl. the new deny-list passed |
| `npm run harness:workbench` | **68 passed, 0 failed, 0 pending of 68 runs** (50 scenarios + 18 `kwb=refuse` variants), **2092 checks** (was 2079) |

### Write layer

| Finding | Fix | Test |
|---|---|---|
| WL-01 "ask Thomas" / SEC-HR2 in user text | One shared wording in `domain/labels.ts` (`COUNTS_BLOCKED`, `_LANE`, `_SHORT`, `APPROVE_BLOCKED_PARTIAL`): says what was not written, why, and to ask a CIQ Case Admin; no policy switch, no name. `FURTHER` = "contact your CIQ business admin". Case-Admin-without-RMM banner in plain words (`kf/app.ts`), SEC-HR2 kept as a code comment and on Diagnostics | `guards.spec.ts` text scan; `labels.spec.ts`; `app.spec.ts`; harness S11a, S25b |
| WL-02 Re-read of a Process item without a task used the Form API | `reReadUncertainRt`: a Process item is read through the task, else `getAdminItem` when rung 1 is allowed, else (or on a failed read) the mark is cleared with a "could not check" note; never `formGet`. `ReReadUncertain` (`ui/WriteOutcome.tsx`) catches and shows errors | `actions.spec.ts` "WL-02 / WL-10" (3 tests) |
| WL-03 `lastFailed` tracked thrown calls, not failed saves | `writeQueue.enqueue` no longer sets it; `recordSave(key, ok)` is called by write-then-verify from the SaveResult (not for an empty patch), by the admin lane write, and by a passing K-WB Re-read | `writeQueue.spec.ts`; `writeVerified.spec.ts` WL-03; `actions.spec.ts` WL-03 (not-kept blocks the submit; a thrown submit / refused send-back does not; K-WB → Re-read → submit) |
| WL-06 timeouts of reject / send-back / admin cancel treated as failures | Timeout → item uncertain (`kind:"reject"` carries the F8 event), result `timeout` with Re-read; settle by the task list. `case.cancel.failed` is written only when the Re-read finds the task still open. Send-back timeout no longer sets `sendBack="refused"` or a fallback sheet. CaseDetail and PointDetail show Re-read for these results | `actions.spec.ts` WL-06 (5 tests) |
| WL-09 K-WB Re-read compared hand-typed DateTimes to the second | `compareWithoutWrite` compares DateTimes (header and child columns) at minute precision; write-then-verify stays exact. The sheet shows DateTimes in local time without seconds (`typedValue`) | `writeVerified.spec.ts` "K-WB Re-read compare (WL-09)" (4 tests) |
| WL-10 uncertain Re-read compared wire JSON | `UncertainInfo.patch` is the `NormPatch`; Re-read uses `missingFrom` (per field type, child adds by id or natural key) | `actions.spec.ts` (timed-out Return with User + server row id reads as landed) |
| WL-11 Return built from a sparse list row | `sendBackPointRt` reads the point through the held task first and builds the round from that read; no read → refused, nothing written | `actions.spec.ts` WL-11 (2 tests) |
| WL-13 post-submit lane compare by raw JSON | `sameValue(fieldType(...))` per field | `actions.spec.ts` WL-13 (2 tests) |
| WL-15 child adds without `_index` | `normalisePatch(..., base)` adds `_index` = rows already in the table + position; write-then-verify reads the item first when adds are present (a failed read sends without `_index`, as before); creates index from 0. **[unverified]** live: matches the verified add shape (SPIKES L89); not observed whether Kissflow needs it | `writeVerified.spec.ts` WL-15 (2 tests) |

### Spec fidelity

| Finding | Fix | Test |
|---|---|---|
| F1 refused CR kept impacts | Any `Refused…` outcome writes every `Impact_*` = No (`effectiveTriage`, applied after the input); the toggles are disabled and show No; `triageProblems` refuses Yes with a refusal; "Refused – after final release" is offered only on a released case, so the Change attempt row stays tied to the real after-release case | `crLogic.spec.ts` F1 (4 tests) + updated options test |
| F2 Thomas / WB-D3 in user text | See WL-01, F-01; "Additional part" message in plain words | `guards.spec.ts` |
| F3 late decision on non-Department-review points | `lateDecisionVisible` and `buildAcceptPatch` only for "Department review" (what S6 reads, brd L903); hint reworded | `points.spec.ts` (F3, 2 tests + adapted) |
| F4 S3 could switch a department off | S3 form never shows `Dept_*_Active`; a separate "Add a department" block adds only departments not active on the server (No/blank → Yes), with a required reason recorded first in F8 (`Scope` / `scope.dept.added`) | `stepLogic.spec.ts` F4 (4 tests); `render.spec.tsx` S3 |
| F5 CASE_S8 after an overall rejection counted as released | `isReleased` returns false whenever `Overall_Decision` = Rejected (unless `Final_Release_At` is set) | `crLogic.spec.ts` F5 |
| F7 list values not checked at create | `parseOwnership` / `parseRmesCriteria` refuse values outside CIQ_Department / CIQ_Review_Dept / CIQ_RMES_Part; `buildBasicSection` and `seedRmesData` drop them too | `config.spec.ts`, `createCase.spec.ts`, `rmes.spec.ts` |

### Security and content

| Finding | Fix | Test |
|---|---|---|
| F-01 "Thomas" ×4 | Reworded (lane, approver, Return fallback, portal user id hint) | `guards.spec.ts`; zip deny-list |
| F-02 / UX-02 Diagnostics for everyone | Footer link and build stamp only with the builder signal (`BuilderFooter`); `#/diagnostics` shows "This page is for Workbench administrators." without mounting the probes. The page itself carries no doc/test refs (K-14, WB-D1, K-WB, SEC-HR2, UI-LOG, [unverified], "never paste…"). CaseList and AuditLog no longer point to Diagnostics | `shellText.spec.tsx`; harness S04 (no refs, builder sees link + stamp), S05 (dev=0: no link, no stamp, restricted card, no probe); S35 jo now with `dev:1` |
| F-03 SEC-HR2 in the banner | See WL-01 | `app.spec.ts` |
| F-05 "(stub, T1)" | Span dropped (owner only in `data-stub`); Home reworded | `guards.spec.ts` |
| F-06 S5/S7/S8, X1, Q9, manual-wb-1, "not built in the MVP" | Reworded as proposed; rule set version shows "Not set (manual scope)" (stored value unchanged) | `guards.spec.ts`; `labels.spec.ts` |
| F-08 raw rung codes | `RUNG_LABEL` (exported from CountsBlock) in the lane workspace | harness S11a (no "mine+tasks", no "(read:") |
| F-09 zip guard too weak | `scripts/workbench-deny.mjs` (hosts, Authorization/Bearer, Thomas, K-14/K-WB/K-19P, WB-D, SPIKES, UI-LOG, SEC-HR, brd:/dec:, " (Dnn)", " (Qn)", "(stub,") used by the zip guard and `guards.spec.ts`. "(Dnn)"/"(Qn)" count only after a space (minified `catch(Q4)` is not a reference). The generator strips "(SEC-HR2)" from the copied role landing text; `client.ts` viewer detail reworded. No account id, no `.env` | `guards.spec.ts` (planted offenders, library-call negatives); build passes the guard |

### UX

| Finding | Fix | Test |
|---|---|---|
| UX-01 fail-closed dead end | Lane: "Complete review" note + `wb-counts-blocked-next` say save sign-off/RMES now and ask a CIQ Case Admin; approver: "You can still Reject. Approve is unavailable because…"; "Approve" used consistently | `labels.spec.ts`; harness S11a, S25b |
| UX-03 internal names/ids | See F-01, F-06; Suppliers hint keeps "Manual entry" | `guards.spec.ts` |
| UX-04 raw user ids, per-row "status not readable" | `personLabel` (name → e-mail/contact → —) at every former `_id` fallback; CaseList shows a muted "Hidden" chip and one banner sentence ("You see every CIQ case from the audit log…") | `labels.spec.ts`; `shellText.spec.tsx` |
| UX-05 lane reasons were field names | `completeChecklist` (ordered actions: mark sections, RMES, decision, sign-off, Refresh counts) and `laneReadiness` ("Ready to complete: Yes/No", "not counted yet"); field labels for counts; sign-off column first below xl, 2 columns at lg, sticky | `review.spec.ts` UX-05 (4 tests) |
| UX-06 S5/S8 showed every field | Only Hold note up front; other optional values in a collapsed "Edit other case details"; raw contacts and Late completions never as inputs; override = "Reason to continue with open items"; S1 contact lists collapsed | `render.spec.tsx` S5 (UX-06) |
| UX-07 rows mouse-only | OP key, CR key and My-work case code are `<Link>`s (row click kept) | `assess.spec.ts` (PointList link), `render.spec.tsx` (CrRows link) |
| UX-09 tablet layout | Sidebar collapses into the menu button below lg and is sticky at lg+; compact "Step n of m · … · next: …" line below lg; nowrap on code cells | **[unverified]** visually at 768 px (no screenshot run tonight); harness at 1360 px passes |
| UX-10 yellow "partial" on list pages | `ReadQualityBanner`: info tone, "You see the <items> you created or have a task on."; counts sentence only where counts are computed (S5 lane check); approver Upcoming says "Cases appear here when they reach overall approval." | `shellText.spec.tsx` |
| UX-11 jargon | lane → department review, gate → "Ready to complete/continue: Yes/No", blank → "not counted yet"; department names in approver rule, audit actor, CR impacts, section lead/co, lane dialogs; audit labels ("Department review completed"); audit Object column removed; "Start gate" → "before the point can be sent"; My-work tiles retitled and clickable | `approver.spec.ts`, `audit.spec.tsx`, `stepLogic.spec.ts` (adapted) |
| UX-12 three date formats | `case/shared` re-exports the en-GB helpers; RMES, lane, review-queue and point dates use them; a `YYYY-MM-DD` is read as a local calendar day | `audit.spec.tsx` |
| UX-13 raw flow ids in the warning strip | "3 case tasks can't be opened here: open them from Kissflow's My Tasks." (`flowNoun`); list-read failures name the list; the `_activity_instance_id` detail stays on Diagnostics | `tasks.spec.ts` |

Tests changed because the required behaviour changed (not weakened): the CR options test (after-release refusal no
longer offered before release), the late-decision tests (Department review only), the `lastFailed` queue test, the
uncertain-patch shape, and text assertions that now expect the plain wording.

**Not done / still open:** UX-09 not checked visually at 768 px; WL-15 `_index` not observed live (it matches the
verified add shape). The case-detail tabs still scroll horizontally on very narrow screens (the sidebar change frees
the width at 768 px).

## [unverified]: needs the generated app and a real signed-in user

Diagnostics answers most of these on the first live run (design §13.2):
1. `AppRoles` carry the CIQ role names.
2. Which task-row key carries the step; item- or activity-level in Part 2; `_activity_instance_id` present.
3. List rows carry all fields; admin rows carry `_status`.
4. A list route for View members (K-14); live Dataform `getItems`.
5. **K-WB**: a real user's `updateItem` after Start, and whether 050313 lists the refused fields. The fallback is built.
6. A real user's `sendbackItem`, and `openForm` inside an Application component (answer, hang, or unload).
7. SDK `rejectItem` and `withdrawItem` (REST verified in the spikes).
8. Write shapes for User, Reference, Date and clears; the Form submit id.
9. The `getProgress` shape; `Table::<server child model id>`.
10. Blank vs 0 on a new case (`Open_Items_Count` blank, `Hold_For_Open_Items` "Yes").
11. `getRoles` for non-builder users in the Development account.
12. SDK child-row writes with client row `_id`s.
13. Dataform `discardItem()` without a draft, and whether it drops a draft started in the native form.
14. Child-column formulas (`Criteria_Open_Num`) on a Form row.
15. A write naming a formula field (the Workbench never sends one).

Also harness assumptions, not observed live: the `getProgress` payload, "no draft" on discard, the error wording, and
that the host keeps client row ids by default. And K-19P (two lanes saved from two tabs at the same moment).

## Not built tonight (design §13.1)

Questionnaire answers and documents (portal data, K-14); the rule evaluator (scope is manual); staleness of section
marks; "Additional part" raise and "Accepted – scope extended"; reports and dashboard charts; reactivation prefill;
assignment events; AI suggestions; `Final_PDF`; the X/Y/Z integrations; the cancel cascade; send-back fallbacks beyond
`openForm`; F8 rows for manual supplier-side records; deploy; a cross-tab lock beyond `navigator.locks`.

## How to rebuild

From `prototype/`:
```bash
npm run typecheck && npm test && npm run typecheck:workbench && npm run test:workbench \
  && npm run build:workbench && npm run harness:workbench
node scripts/harness-workbench.mjs --screens ../kissflow-build/ciq-digital/workbench-screens   # optional
```
- `vite build` empties `prototype/dist-workbench/`; run the harness after the build.
- After the app is generated: `node scripts/gen-workbench-schema.mjs --readback <read-back file>` merges the server's
  role, activity and child-model ids into `schema/generated.ts` (copied to `schema/readback.json`), then rebuild.
- The harness uses Playwright from the portal harness's absolute path (machine-specific). Its timing checks (S01, S37,
  S41) assume an idle machine. `--serve` prints host URLs for a manual demo with a fictional-user switcher (`&bar=1`).

## Deploy steps NOT done tonight

Each needs Thomas's explicit OK at the time (Claude's auto-mode guard treats generate, deploys and role changes as
protected). Development sandbox only; never `beiersdorf.kissflow.eu`.
1. **Generate the app** `CIQ_Digital_A00` (see `RESUME.md`), then read back every id, role member and grant
   (`postgen/readback.mjs`).
2. **Merge the server ids** into the Workbench schema (`gen-workbench-schema.mjs --readback …`), rebuild, re-run the
   harness. Check that `generated.ts` still matches the generated flows (`--check`).
3. **Custom UI on the app:** enable it in the app settings and identify the app's Application component by a read
   (the portal UI-LOG names an app component `CCEK4Jhdt04g`, not checked tonight).
4. **Upload the zip** `prototype/dist-workbench/$(cat prototype/dist-workbench/latest.txt)` to that component. No app
   deploy script exists yet: it would be a copy of `ciq-supplier-portal/deploy-portal-ui.mjs` pointed at the app
   container (never the portal's component). Read back: component Live, source Zip, the file name.
5. **Deploy the app** in Kissflow so its URL serves the bundle (a builder click, as for the portal).
6. **First live run as Thomas:** Diagnostics (container `CIQ_Digital_A00`, the build stamp, 13 role names, list shapes and
   rungs per flow) answers the [unverified] list above. Then the two real-user tests from `RESUME.md`: a lane save at a
   review step (K-WB) and two lanes saved from two tabs at once (K-19P), and one send-back.
7. **Role members** for real test users (Thomas handles user management), then the role-by-role walkthrough.

## Tablet check (768 px), 2026-10-08 09:13 IST

This check replaces the UX-09 "[unverified] at 768 px" mark above. Build `2026-10-08T03:33:31.247Z`
(`ciq-workbench-ui-15d7ffe06e.zip`). Local only: emulated host, fictional fixtures, no Kissflow call.

**What was checked.**
- The 21 role screens, captured with `node scripts/harness-workbench.mjs --screens <dir> --viewport 768x1024`.
  This option is new. The default is still 1360x900, and without a dir a non-default width goes to
  `dist-workbench/screens-<W>`.
  - 768 set: `workbench-screens-768/`.
  - 1360 set: `workbench-screens/`, re-captured from the same build.
- 33 more 768-px views: full-page captures of the case tabs, step panels S1/S3/S5/S7, the lane workspace, RMES, CR triage
  and assessment, the point, approval, config, templates, supplier, audit, diagnostics, and the open menu.
- Each view was measured for:
  - sideways page scroll;
  - content cut off outside a scroll box;
  - codes broken across lines;
  - columns, tabs and buttons hidden in a sideways-scrolling box.

**Result.**
- No page scrolls sideways at 768 px.
- The sidebar collapses into the menu button.
- The compact stepper reads "Step n of 9 · … · next: …".
- Primary actions (New case, Cancel case, Save/Submit step, Complete review, Decide, Create case, Triage) stay
  visible and are never hidden in a table scroll.

**Fixed** (all `src/workbench/**`; the 1360 look is unchanged, checked against fresh 1360 captures):
- **Shell.**
  - The drawer and the sticky sidebar now start below the measured header height (53 px, or 57 px with View as). The
    fixed 49 px let the drawer cover the header's bottom edge.
  - The open drawer has a dimmed backdrop and a shadow, and a click outside or Escape closes it. It also carries
    `aria-expanded`.
  - At lg+, short pages no longer scroll by 4 px.
- **Case tabs.** Below lg the tabs are tighter, so all seven tabs (Audit included) fit at 768 px. Before, Audit scrolled
  out of view with no hint.
- **Lane workspace checklist.** It said "(left)/(middle)/(right)", which is only true in the 3-column xl layout. Below
  xl it now names the panel: "(Sections)", "(Blockers and counts)", "(Sign-off)". At xl+ the text is unchanged.
- **Codes no longer break inside.**
  - Config list: version, section and release (`v1-draft`, `REL-20261001-1`).
  - Scope runs "Sections added": breaks only after a comma.
  - Approver supplier: `(SUP-NWB)`.
  - RMES index: case code and "Open sheet".
  - Diagnostics: step names and held tasks.
  - Helpers: `ui/codes.tsx` (`CodeList`, `CodeText`).
- **CR triage.** The five Yes/No impact controls now sit 3 per row below xl. At 768 px each control had broken into
  stacked Yes over No.
- **Approver department reviews.** The Reason column has a minimum width of 12 rem, so it is no longer one word per
  line.

**Checks after the fixes:**
- `typecheck:workbench`: clean.
- `test:workbench`: 48 files, 837 tests passed.
- `build:workbench`: OK.
- `harness:workbench`: 68 of 68 runs passed, 2092 checks, 0 failed, 0 pending, no P1 open.

**Remaining limits.**
- Wide tables still scroll inside their own box at 768 px, and right-hand columns need a sideways swipe:
  - Cases: Status.
  - Department reviews: RMES / Ready / Task.
  - Open points: about 570 px hidden.
  - CR list: Status, Outcome, Impacts.
  - Config: Release, Published.
  - Diagnostics.
  - Review queue: the "Ready to complete" header is cut by about 20 px.
- On iPad, overlay scrollbars give no visible hint beyond the cut-off column.
- The case tabs fit with only 16 px to spare (704 of 720 px). They scroll again below a 750 px viewport, or at 768 px when
  three or more tab counts reach two digits.
- Not checked: portrait phones, real Safari or touch, and dark mode at 768 px.
- Seen in passing, not layout: the point detail shows ISO dates (`2026-10-22`, and a raw timestamp in Thread), and the
  RMES index "Completeness confirmed" also shows an ISO date.

## Read-back merge (2026-10-08 night)

The live server ids are merged into the Workbench, and every check is green again. All work was local: no Kissflow
calls, no deploy, no upload.

- **Merge.** `node scripts/gen-workbench-schema.mjs --readback ../kissflow-build/ciq-digital/postgen/workbench-readback.json`
  copied the file to `src/workbench/schema/readback.json`. Everything matched by name: 13 of 13 roles (`serverId`), 34 of
  34 steps (`serverActivityId`) and 7 of 7 child tables (`serverModelId`, each equal to the spec table id, so the
  `Table::` keys don't change).
- **Type errors.** Once the ids are non-null literals, `serverModelId ?? id` typed as `never` (TS2339) in three places:
  - `harness/permissions.ts:30`
  - `harness/commands.ts:233`
  - `harness/formula.ts:213`

  Each now widens to `string | null` first.
- **Unit tests don't depend on the schema any more.** The new `testkit/serverIds.ts` has `pinServerActivityIds(ids)`.
  Only the listed steps keep an id, and the call returns a restore function. Tests that cover the "unknown id" path pin
  `{}`:
  - `actions.spec`: sendBackPoint openForm fallback, and the session-learned id.
  - `tasks.spec`: Part 2 unresolved without progress.
  - `points.spec`: refused send-back after a verified write.

  New tests cover the "known id" path:
  - A read-back OPNT_S1 id wins over a session-learned one.
  - `loadTasks` lists once per owned step with the activity filter and resolves Part 2 rows by activity, with no
    getProgress call.
  - Host: the read-back id is used for the task filter, getProgress and send-back, and the fake id is refused. Without
    read-back the host falls back to `Activity_<irstep>`.

  The suite was also run with the read-back removed: 841 of 841 passed there too. No assertions were weakened.
- **Harness host.** `harness/workflow.ts activityIdOf` returns `STEPS[ir].serverActivityId` when present and
  `Activity_<irstep>` otherwise. That one function feeds the My Tasks activity filter, getProgress `_activity_id` and the
  send-back `stepId` lookup. As live, My Tasks rows carry `_activity_instance_id` and admin list rows don't.
  `hostEngine.spec` now uses `activityIdOf(...)` instead of hard-coded fake ids.
- **Harness scenarios** (`scripts/harness-workbench-scenarios.mjs`). The scenarios compute the ids with the generator's
  own merge, so they follow whichever schema was built:
  - S17 and S19 expect the effective OPNT_S1 id.
  - S33 counts the "≤ 4 pages per load" limit per task list. With read-back ids there is one filtered list per owned
    step.
  - With read-back ids the UI lists My Tasks with the activity filter (§6.3 rung 1). Task rows then never reach the
    getProgress, getItem or block-unique rungs. So S19, S34 and S35 check rung 1 instead:
    - S19: the send-back goes out with the read-back id even with progress off.
    - S34 and S35: tasks resolve with "activity" evidence, and none of C4's tasks is unidentified.

    The original checks still run when no read-back is merged. With ids merged, the harness no longer exercises those
    fallback rungs; the pinned unit tests cover them.
- **Checks** (run from `prototype/`):
  - `typecheck`: clean.
  - `test`: 7 files, 81 tests passed.
  - `typecheck:workbench`: clean.
  - `test:workbench`: 48 files, 841 tests passed.
  - `build:workbench`: OK, giving `dist-workbench/ciq-workbench-ui-235af550b4.zip` (578 KB).
  - `harness:workbench`: 68 of 68 runs passed, 2095 checks, 0 failed, 0 pending.
- **[unverified]** The live My Tasks activity filter (`listTasks(flow, activityId)`), which the UI now uses for every
  task load. This work tested it only against the emulated host, and nothing in this folder records a live check.
  Check it on Diagnostics with a real signed-in user before relying on it.

## Live deploy and checks (2026-10-08 night, after generate)
- **Deployed:** Custom UI enabled on CIQ_Digital_A00 (`PUT /flow/2/{acc}/application/{app} {_is_custom_ui_enabled:true}`, read back true). First `ciq-workbench-ui-244b9bd7db.zip` (no read-back ids), then **`ciq-workbench-ui-235af550b4.zip` (read-back ids merged)**. Component CCEK4Jhdt04g Live, source Zip. Opens at `/view/application/CIQ_Digital_A00/ui` [verified].
- **Diagnostics live** [verified]: container CIQ_Digital_A00 ✓, spec rev 31, SDK 1.0.49; AppRoles carry the CIQ role names with ids; My items `{Columns,Data}` (sparse rows, step + `_activity_instance_id` on every row); My tasks `{_id,Columns,Sort,Filter,Data}`; admin list 30/125 fields, no `_activity_instance_id`; Participated errors.
- **My Tasks activity filter verified live:** a ZZT case put at "Waiting for supplier: basic data" (PkEKlr8g60Nj) is listed in My work under "Record supplier steps (manual)" by BOTH builds, so the merged build's per-step task loading works on the real host.
- **The "Cases ended without a cancellation record" tile** correctly lists the two acceptance cases (H1 rejected, H2 withdrawn) that ended without an F8 Cancellation row.
- **Not testable by Claude:** the Claude in Chrome extension's clicks and keys don't reach the cross-origin Workbench frame (scroll and hash navigation do). K-WB, real-user send-back and K-19P need Thomas's clicks (RESUME.md).
