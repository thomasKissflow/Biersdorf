# Supplier portal vs the clickable prototype (Kissflow-internal, 9 Oct)

Question from Thomas: does the live portal have everything the prototype's supplier view has?

**Method.** The audit ran in two steps:
1. Four read-only audits (data, actions, uploads, visuals) checked every supplier screen against what the portal can show and do.
2. Four skeptics re-checked them.

Result: 55 confirmed findings, which come down to about 20 distinct gaps.

**Short answer.** The portal already reuses the prototype's supplier screens, so it looks and navigates the same. Before today, three kinds of things were missing:
- data the portal items don't carry;
- document upload;
- prototype-only wording.

The UI-only gaps are fixed below. The rest need a decision or app data.

## Fixed in the UI (not yet deployed)

| Gap | Now |
|---|---|
| Document upload in 3 places (field documents, chapter documents, a document as an answer to Beiersdorf) did nothing | Real upload, through the SDK as used live in Ardee: `uploadFile` → `initForm(section, its task)` → `getTable(Uploads).addRow` → read back. Success shows only after the read-back. A section assigned to a colleague says so instead of offering a drop zone |
| An uploaded file didn't count as the field's answer, versions always "v1", "0 KB", uploader as an e-mail | The file answers its field, versions count per field, uploader by name. The size is hidden, because Kissflow's size unit isn't documented |
| Basic data (GEN) missing from the questionnaire after submission | GEN is the first section, editable until the final release, as in the prototype. Its mandatory fields count for completeness |
| K5.1 micro-test waiver (SF-12 = No) never asked | Shown as waived. The justification is stored in the basic data when K5.1 wasn't released |
| Target markets (SF-11) "Not set yet" | Read from the request's `Markets_Label` |
| Scope-check page empty | Shows the scope the rules expect, worded as expected |
| Pre-filled basic data | Trade name, supplier name and contact e-mails are pre-filled from the request ("Pre-filled by Beiersdorf") and saved when the basic data is submitted |
| Colleagues, who can confirm, own role | Taken from the assigned contacts and the case contacts. "Confirm completeness" and "Give final release" show only to the contact whose task it is; others are told who can |
| Due dates | Due date of the current step, with fallbacks. No "Closed —" or "NaN days" on open cases |
| Earlier question rounds lost | Rebuilt from `Previous_Rounds_JSON` |
| Questions never "closed" | Closed once the case reaches the final release (stopgap; see decision 3) |
| A case Beiersdorf withdrew still showed "Fill in the questionnaire" | Shown as withdrawn when every step has ended (stopgap; see decision 4) |
| Answer drawer said "sent" when the send failed | Shown as sent only when it really reached Kissflow |
| Help lost "How it works", the FAQs and the contacts | The prototype's Help page; the FAQs come from the help articles in Kissflow |
| "Prototype: …" notes and prototype wording shown to suppliers | Hidden or neutral in the live portal |
| Phone: Corrections and Help off-screen | Compact tabs; the current tab scrolls into view |
| An unknown section from the app could blank the case page | Left out, with a warning; a page-level error boundary |

**Checks:** 106 unit tests; the harness passes 15 of 15 scenarios with 118 checks. The harness emulates the Kissflow page answering the real SDK, including file upload, the item's form at a task, and adding a child row.

## Not proven until it runs inside Kissflow

- **Does the portal page accept file uploads?** Diagnostics now has a "Test upload" button that answers this, and shows what Kissflow returns.
- **Does a supplier's `addRow` save at their step?** The morning tests with real supplier users answer this.

## Decisions and app data needed (not built)

1. **Completed items disappear for suppliers.** Kissflow's "participated" list fails everywhere, so a completed request's name, INCI and number vanish for every contact. Choose A, B or C (`K09-PREP.md`) after a test with real supplier users.
2. **Phase for contacts who don't confirm.** Such a contact can't see the completeness item, so after PS-05 (without questions) they still see "Fill in the questionnaire". The fix is one new field on CIQP Section (a stage stamp) that the portal writes on confirm and release.
3. **Question outcome.** Accepted or withdrawn never reaches the portal. The app would need to write an outcome onto the CIQP Query, or onto the stage stamp.
4. **Case closed without a final release.** The app's close should stamp a reason on an item every contact can still see (K-09e).
5. **Final release and colleagues' sections.** Sections assigned only to a colleague stay open after the release. The app should close them after Y5, and keep confirmers a subset of every section's contacts.
6. **A document answer for a section assigned to a colleague.** That has nowhere to go today; the portal says so. Option: an attachment field on CIQP Query.
7. **The rest of the basic-data pre-fill (DUNS, manufacturer, site).** The app could seed the BASIC answers at release, or the request could carry `Supplier_DUNS`.
8. **Case contacts on the BASIC section.** This lets contacts who can't see the request see who can confirm, and their roles (X2).
9. **The K5.1 waiver is read from the basic data** (`FLD-5.1-002` in BASIC `Answers_JSON`) unless the app releases K5.1 as "Waived". The app session needs to know this.

## Overnight prototype finalisation, 13 → 14 Oct (affects the portal's shared supplier screens; nothing uploaded)

The prototype now has the final-app screens (`prototype/FINAL-APP-SPEC.md`, `prototype/DEMO-GUIDE.md`). Shared supplier screens changed for `liveScope` cases only. The live portal's old-flow cases still pass `scripts/harness-portal.mjs` (15/15, 118 checks).

Two changes are visible to portal users, so record them before the next portal zip upload:
- dates show as "2 Oct 2026, 13:52";
- documents-only chapters read "Documents only · optional upload".

The admin's demo preview shows the new flow. New prototype-only fields: the evidence slots FLD-K1-004…010; add them to the data-model plan first. `npm run build:portal` produced new local zips, none uploaded; the live portal still runs `ciq-portal-ui-71810c31a7`.

## Client decisions of 9 Oct, prototype updated (portal code affected, nothing deployed)

The prototype now follows `context/decisions/2026-10-09-client-call.md`:
- one supplier step with live scope;
- RMM reviews in Part 2;
- the matrix ending only.

**Effect on the portal:**
- **The portal reuses the supplier screens.** The new flow switches on per case (`liveScope`), so portal cases keep the old flow: metadata step, scope-check wait, 4-step stepper. Gate: typecheck, 146 tests, both builds, harness 15/15 with 118 checks.
- **Portal file edits:** `LiveSupplierStore.tsx` lost only four object members for removed store keys (`assumptions`, `setAssumption`, `releaseScope`, `overallDecision`). No behaviour changed.
- **Decision before the next portal upload:**
  - The admin's "Preview supplier view" and the demo outside Kissflow use the prototype seed, so they now show the new flow while live suppliers get the old one.
  - Options: (a) accept and relabel the demo banner (the harness checks that text); (b) build a separate old-flow demo seed; (c) don't upload until the portal backend is reworked.
  - `npm run build:portal` writes new zips to `dist-portal/`. None was uploaded, and the live portal still runs `ciq-portal-ui-71810c31a7`.
- **Still to do in Kissflow:** sections must follow the supplier's answers live, so the X2 scope release and plan v3 need a rework.

## Found during call prep (9 Oct, verified review of steps 8 and 10; not fixed, portal paused)

These come from a read-only review, re-checked by a skeptic.

**Portal, which the live UI shares with the prototype:**
1. In review and final-release, the case page heading says "Read-only. Shown as submitted to Beiersdorf." above a questionnaire that is editable (`SupplierCase.tsx` L99-100, L121-127). This contradicts v2 REQ-PROC-016 and the call page.
2. The release doesn't re-check mandatory fields (`liveActions.ts` L159-172). A supplier can blank an answer after the reviews and still release.
3. The D30 rule "no release while my own queries or correction requests are open" isn't implemented (`liveActions.ts` L159-172).
4. Configuration answers can't be edited after the basic data is submitted (`SupplierCase.tsx` L83). v2 REQ-CFG-008, AS-11 and the s5 rule all expect them to be.
5. The answer drawer offers "Upload a document". v2 REQ-PROC-033 says "the communication offers no upload function". The file lands in the section, so the data rule holds, but the UI wording doesn't.

**Prototype only (matters only if the full prototype is demoed):**
- The order of the overall approval and the release is reversed. The prototype runs release → overall approval (`actions.ts` L458-470, `selectors.ts` L40). The app and the call page run overall approval → release request.
- The overall approver can approve a case a department rejected, because `ApprovalQueue.tsx` openBlockers ignores Rejected.
- K2.1 composition and justification edits write no audit row (`actions.ts` L199-210).
- A document sent for a query on a non-file field overwrites that field's value (`actions.ts` L221, L332).

**Client questions raised (they are on the call page as AS-02, AS-03 and AS-12):**
- Edits while the release request is open, and re-review after a late change.
- What a department rejection does to the case and what the supplier is told.
- Whether the overall approval comes before the release.
- Whether the final PDF is one RMM click or fully automatic.

## PAUSED (Thomas, 9 Oct, before a call)

Safe halt. Nothing is half-written in Kissflow: today's work is local only.
- **Code:** the parity changes are in `prototype/src` and pass the gate: typecheck clean, 106 unit tests, harness 15/15 scenarios with 118 checks, both builds.
- **Deploy:** nothing deployed. The live portal still runs build `ciq-portal-ui-71810c31a7` (7 Oct).
- **Kissflow:** no portal or app writes today.
- **Stopped mid-run:** the adversarial review of today's changes, workflow `wf_91324d3f-27a`. Any findings it produced before the stop are in its journal.

**Resume order:**
1. Re-run that review: `Workflow({scriptPath: …/portal-parity-review-wf_91324d3f-27a.js, resumeFromRunId: "wf_91324d3f-27a"})`. Fix what it confirms.
2. Re-run the full gate:
   ```
   npm run typecheck && npm test && npm run build && npm run build:portal && node scripts/harness-portal.mjs
   ```
3. Ask Thomas for the deploy OK. Then deploy with `deploy-portal-ui.mjs`, and Thomas deploys the portal.
4. Thomas opens Diagnostics and presses "Test upload".
5. Take decisions 1–9 above to Thomas, and tell the app session about decisions 8 and 9.

The app session was asked to pause too (9 Oct); it resumes only on Thomas's word.
