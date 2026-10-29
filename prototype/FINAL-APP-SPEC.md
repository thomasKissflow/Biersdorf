# CIQ final-app spec for the clickable prototype (overnight build, 13 → 14 Oct 2026)

This spec settles every conflict between the inventory files in `overnight/p1/*.json` (one per analyst; item IDs such as NAV-01, SUP-xx and EC-xx point into them). When this spec and those files differ, this spec wins. The binding sources are `context/decisions/2026-10-09-client-call.md` and the answers in `OVERNIGHT-LOG.md`. Kissflow-internal.

## 0. Principles

- The prototype has exactly the screens of the final app: the Kissflow internal app and the supplier portal. It has no backend; the store and localStorage are the data.
- Demo start: no cases and no mails. The 11 internal role holders, one per role, plus ONE fictional supplier, Solvaro Oleochemicals S.A. (DUNS 471203958, Tarragona, Spain, manufacturer), with 2 active contacts: Elena Márquez (Regulatory Manager) and Ravi Menon (QA Specialist).
  - Both contacts may confirm.
  - Configuration is unchanged: template v1 published, v2 draft, rule set RS-2026.1, section ownership, reminders.
  - "Reset to empty start" returns exactly this state.
  - `SCHEMA` goes to 7, so old saved state is dropped.
- Tests keep a rich scenario fixture: the current SPECS replay moves to a test-only fixture module. The portal's demo preview (`src/portal/demo/DemoSupplierStore`) keeps the rich fixture.
- What never changes:
  - `src/workbench` is never edited.
  - The live portal (`src/portal`) follows the v5 model since 15 Oct (`docs/kissflow-data-model/plan-v5-final.md` §3): one CIQP Request per case with live scope, a CIQP Query per round, and the CIQP Final Release task. The portal harness stays green. Shared supplier screens keep their legacy branches behind `isLiveScope(c)` for older data only.
  - Nothing is called in Kissflow.
- Copy: plain English. No "prototype", "review version", "assumption" or "AS-xx" anywhere in the default UI.
  - DemoNotes only show behind a demo toggle, "Show prototype notes", which is OFF by default.
  - No internal file names.
- Every list, dashboard and tile has a designed empty state. Metrics with no data show "—", never 0 %, NaN or "0 d".

## 1. The process (binding)

1. **RMM starts the case.** New case: trade name, main INCI, material no., a supplier from the master, case contacts (1–2 active contacts of that supplier), owner, target markets SF-11 (set by RMM, read-only for the supplier), due date. A duplicate warning appears for the same material number and supplier with an open case.
   - Mail: an invitation to each case contact.
   - Review tasks are not created yet.
2. **The supplier fills in the CIQ, in one step** (phase `supplier-input`, `liveScope: true`).
   - It answers the basic data GEN and the metadata questions SF-01…SF-12 first. Sections open and close live with the answers. Answers in a section that closes are kept and come back when it reopens.
   - Two contacts can work in parallel, and every answer shows who entered it.
   - Completeness is blocked until the required metadata questions, mandatory fields and documents are answered or justified. The blockers are named.
   - A contact with `mayConfirm` confirms completeness, recorded with name, e-mail, role and time. This is the gate.
3. **The system activates the reviews:** the RMM track (assignee = case owner) plus only the departments concerned. When SAF or REG is involved, an RMES record is created (header only: the case and the time).
   - Customs and Legal are informed and read-only.
   - Mails: review-assigned to every track assignee, and informed to Customs and Legal.
   - An origin without rules (waste, CCU, chemical recycling) is flagged on RMM's review. The flag is informational.
4. **RMM reviews the whole CIQ,** in parallel with the departments.
   - It can raise queries on any section and write internal notes.
   - It never changes answers and never adds sections.
5. **The departments review their sections in parallel.**
   - They raise queries pinned to a field, table row or document.
   - A department may add a missing section with a justification (REQ-ADR-002). The supplier gets a task, and the department gets an additional-part open point.
   - Safety and Regulatory read the RMES and record their decision (Approved or Rejected; a rejection needs a reason) on the decision card of the Questionnaire tab. Since BDF's e-mail of 28 Oct the RMES is one read-only sheet of exactly 8 fields, filled automatically from the CIQ, each with its CIQ field id: Raw material / tradename (FLD-GEN-001), Supplier (FLD-GEN-002), Manufacturer (FLD-GEN-004); per K2.1 component INCI, %, CAS #, EC #, Source of origin and its K2.3 free text. It is derived from the case (domain/rmesSheet.ts), follows every Part 2 change and is frozen after the final release. No criteria, limit checks, suggestions or findings; the decision is outside the RMES.
6. **Open points (AS-08 changed).**
   - A query needs a reference, a responsible person and a due date.
   - The supplier answers, uploads at the question (not in the chat) or explains why it cannot provide. It can also correct the field itself.
   - **Only the raiser** can accept, return, edit (question, justification, due date, responsible) or close (withdraw) an open point.
     - Editing the question of an answered point starts a new round to the supplier.
     - Changing only the due date or the justification does not.
   - Every change is kept in the point's history and is visible to the supplier, as the portal API sync would make it.
   - Every open point blocks completion of the track that raised it.
7. **Changes during Part 2 (B-30).** The supplier can change any answer during the review, until Beiersdorf requests the final release (Thomas, 15 Oct; see §9).
   - The change is logged with name and time, and a "data-changed" mail goes to the reviewers who use that section.
   - **A change reopens the owners' completed reviews (Thomas, 15 Oct).** Once a department has completed its review, a supplier change in a section it leads or co-reviews (section owners, A-29) reopens that review automatically: an answer, a K2.1 row, a justification, an upload (also a file sent with an answer to a question) or a requested-document justification. It uses the reopen path of B-25/B-27: status "reopened", actor "system", the reason in plain words ("The supplier changed K2.1 after your review"), an audit entry, and one review-assigned mail to the track's assignee; while the track stays reopened, further changes add no mail (one per burst). RMM's review reopens only for a section RMM leads or co-reviews (GEN, K1, K2.3 today). The "changed since your review" markers keep counting from the completion the reopen undid.
   - A changed metadata answer only adds sections (grow-only, B-28). Each added section gets a task and an additional-part point and the lead track is activated or reopened. Metadata answers keep this rule; the owners' reopen above does not apply to them.
   - A reviewer who has already completed can reopen its review. In final-release the release request is then withdrawn (mail to the supplier), the questionnaire unlocks, and the request goes out again when everyone has completed.
8. **Completion.** RMM and each track complete explicitly. Completion is refused while the track has open points, or, for Safety and Regulatory, while its decision is missing. It is not an approval.
   - The Safety or Regulatory decision is internal, Approved or Rejected, and Rejected needs a reason.
   - **A Rejected decision flags the case for RMM** (AS-02 confirmed). RMM's completion requires an explicit choice: "Continue to final release" with a note, or "Cancel the case" with a justification.
   - If RMM had already completed, the rejection reopens RMM's review.
9. **Final release.** One request goes to the supplier when RMM and every track have completed (mail: release-requested).
   - **The questionnaire is locked from the request on (Thomas, 15 Oct; B-04).** The supplier can change nothing: answers, metadata, K2.1 rows, justifications, uploads and requested-document justifications are refused by the domain guard and logged ("Change attempt refused") with "Your questionnaire is locked because Beiersdorf has requested your final release. If something must change, contact Beiersdorf; they can reopen the review." Giving the final release stays possible. A reopened review (B-25/B-27) takes the case back to review and unlocks it; a case cancelled in final-release and reactivated is locked again.
   - The release is refused while the supplier's own questions are open or a mandatory item is missing; the reasons are listed. Because the questionnaire is locked, the supplier is told that such an item can only be completed after Beiersdorf reopens its review, and whom to contact.
   - The release is recorded with name, role, e-mail and time.
   - After the release the case is frozen: every change attempt is refused and logged.
10. **Completion and the final document** (AS-12 changed, R-2). With the release the case completes automatically, and the final document is generated once and is immutable (a fingerprint is shown).
    - The document holds:
      - the case header and CIQ ID;
      - the released answers by section;
      - the K2.1 components;
      - the evidence list with file names, upload dates and uploaders;
      - every open-point thread as text, round by round, with who and when (attachments by name only);
      - all confirmations: completeness, each track completion, final release.
    - The document does not hold RMES decisions or internal notes.
    - It is internal only; the supplier gets a release-receipt mail.
    - Mail: final-document to the RMM owner, with a link.
    - It is shown on screen only (no file download), as the case tab "Final document".
11. **Cancel and reactivate** (RMM, with a mandatory justification).
    - Cancelling is possible in any phase before completion. It withdraws the open points and tasks and sends a cancelled mail to the contacts.
    - Reactivation is possible within 12 months and returns the case to the phase it had.
12. **After the release:** the supplier can use "Report a change". This writes a change report plus audit entry and mails RMM. RMM may start a new case for it. The released case itself never changes.
13. **Reminders.** The admin Reminders page has a demo action, "Run reminders now". It sends due and overdue reminder and escalation mails according to the settings.

## 2. Mail (inbox per person, simulated)

- `AppState.mails: Mail[]`. Each mail has: id, at, to (user ids), event, channel, subject, body, caseId, opId, link, readBy.
- Events:
  - invitation; review-assigned; informed;
  - op-raised, op-answered, op-returned, op-accepted, op-edited, op-closed;
  - data-changed; release-requested; release-withdrawn; release-receipt; final-document;
  - cancelled; reactivated; change-reported; reminder; escalation.
- Channels:
  - `open-point-webhook`: R-1, for every op-* event;
  - `task-notification`: native Kissflow and portal task mails;
  - `final-document`: AS-12.
- Recipients:
  - Supplier events go to every case contact.
  - op-answered goes to the raiser plus the responsible person (deduplicated).
  - data-changed goes to the active tracks that use that section.
- Supplier mail bodies use only whitelisted, supplier-visible fields. Internal notes, the RMES and the decisions never appear in them.
- UI: an envelope in the top bar of every shell, with an unread count. It opens a drawer with a list and a reading pane, "Simulated e-mail". Each mail has a link that deep-links to the item. Mails can be marked read.

## 3. Navigation per role (final)

| Role (holder) | Landing | Menu | Notes |
|---|---|---|---|
| RMM (Katrin Vogel) | Dashboard `/rmm` | Dashboard · My reviews · Cases · Suppliers | "New case" is a button on the Dashboard and on Cases. Suppliers is read-only for RMM (look-up) |
| Regulatory, Safety, QM, Microbiology, Sustainability | My reviews `/review` | My reviews · Cases | |
| Customs, Legal | Cases `/cases` | Cases | Read-only; the case opens on K7 or K8. `/informed` and InformedList are removed |
| Business administrator | Rules `/admin/rules` | Rules · Questionnaire · Section owners · Suppliers (Reminders hidden from the menu, Thomas 15 Oct; the admin can still open the page at `/admin/notifications`) | Only the Business administrator adds, edits, deactivates and reactivates suppliers and contacts (Thomas, 14 Oct) |
| Auditor | Audit trail `/audit` | Audit trail · Cases · Rules (read-only) | The audit trail is the event log only |
| Business owner | Reports `/reports` | Reports · Cases | "Operations" is removed. Reports gains "Pipeline now"; the "Business case" section is removed |
| Supplier contact (any active contact) | My requests `/portal` | My requests · Help | Tasks are merged into My requests; `/portal/tasks` redirects. The live portal uses the same nav (My requests · Help) since v5 |

**Removed:**
- "Our understanding": nav, the internal `/understanding` route and the top-bar drawer. `/understanding/call` and `src/call` stay.
- The "Ending:" box, the "Prototype" badges and footers, and the sidebar "Reset demo data".

**Demo menu** (in the person chip, with a muted "Demo" label):
- View as: people grouped by role and by supplier, with task and unread counts.
- Show prototype notes (toggle, off).
- Reset to empty start (confirm step in the page; no `confirm()`).

**Personas:** internal personas are static. Supplier personas are derived from the active master contacts as `sup:<userId>`. The legacy `supplier`/`supplier2` ids are mapped to them.

## 4. Screens (final)

**RMM Dashboard**
- Zero cases: a start card with [New case] and [Suppliers (1)].
- Live:
  - 4 tiles: My open cases · With supplier · With Beiersdorf · Overdue open points;
  - Needs your action: My review · Department rejected · Release pending · Overdue at supplier · Origin without rules · No activity;
  - My cases;
  - Bottlenecks (only while in review);
  - Recent activity.
- Lead time and first-time-right tiles are on Reports only.

**Cases** (all internal roles)
- Tabs: Open · Part 1 · Part 2 · Completed · Cancelled.
- Search (material, INCI, material no., supplier, DUNS) and filters.
- Read-only for everyone except RMM's actions.

**New case:** the form described in §1.1. Its supplier picker shows active suppliers and their active contacts. It has no way to add a supplier or a contact: where one is missing, it says "Ask the business administrator to add it in Suppliers." and links to the read-only Suppliers pages.

**Suppliers**
- **Who:** only the Business administrator (Nina Hoffmann) adds, edits, deactivates and reactivates suppliers and contacts (Thomas, 13 → 14 Oct; capability `supplier.manage`). RMM sees the list and the detail read-only to look suppliers and contacts up (capability `supplier.view`), with the note "Maintained by the business administrator." and no Add, Edit, Deactivate or Reactivate controls. Every other role gets NoAccess. The domain refuses every supplier-master change by anyone but the administrator.
- List: Supplier · DUNS · Country · Type · Contacts · Open cases · Status.
- Detail: company, a contacts table (name, title, e-mail, may confirm, active), their cases and a history.
- Add and edit, for suppliers and for contacts (administrator).
- Deactivate supplier: refused while the supplier has open cases. An inactive supplier cannot be chosen for a new case and its contacts can no longer open the portal; its history and closed cases are kept. Reactivate makes it selectable again.
- Deactivate contact: the contact keeps its history and its name on answers and confirmations, gets no more mails or tasks and can no longer open the portal. On every open case it is named on, a replacement takes over (required where it is the only case contact; the replacement gets the invitation). The supplier's last active contact cannot be deactivated. Reactivate gives no case access by itself.
- Validation:
  - name required;
  - DUNS exactly 9 digits and unique;
  - country;
  - at least one contact;
  - e-mail format, unique across all suppliers.
- Contacts are deactivated, never deleted. Deactivating a contact who is named on an open case asks for a replacement contact.
- No onboarding flow.

**Case page** `/cases/:id`
- Header: material, IDs, supplier, phase, waiting on, due.
- Tabs:
  - Overview (facts, tracks, confirmations, scope summary);
  - Questionnaire (answers plus "why in scope" per section and the N.A. list; the old Scope tab is merged in);
  - Open points;
  - Documents;
  - Internal notes;
  - History (the audit events plus the "who assessed what" summary; Reconstruct is merged in);
  - Final document (only once completed).
- RMM actions: Open my review · Cancel · Reactivate. (No "Edit case contacts" once the case exists, per Thomas on 14 Oct; a contact only changes through a replacement when the admin deactivates one.)
- Reviewers: Open review.

**My reviews:** To review · Waiting for supplier · Completed, with counts and one inline alert.

**Review workspace** `/review/:caseId` (RMM and the departments)
- Header: case, phase, my track, Reassign within the department.
- Section nav with "changed since your review" markers.
- Section content with Ask, on any section; RMM sees the whole CIQ.
- RMES tab (Safety and Regulatory only, once the case is past Part 1; named "RMES", no count): the read-only 8-field sheet with the source of each field (a source opens its section). A case the role can't read shows one notice instead.
- Decision card (Safety and Regulatory): top of the Questionnaire tab's right column, above the open points; the completion bar's decision line scrolls to it.
- Right rail: My open points (accept, return, edit, close by the raiser) and Internal notes.
- Completion bar with the blockers listed, the Safety/Regulatory decision, and RMM's rejection-handling choice.

**Admin**
- Rules: the rules list plus "Test rules" (the simulator and the regression check merged; they run on built-in reference materials, never on cases).
- Questionnaire: versions, publish v2.
- Section owners.
- Reminders: settings, static mail templates and "Run reminders now".
- Suppliers: the only role that maintains them.

**Reports** (Business owner)
- Sections: Pipeline now · Lead time · Intake and workload (RMM included) · Clarifications and supplier performance.
- Empty states throughout.

**Audit trail** (Auditor): the event log with filters. A case ID opens the case History tab.

**Supplier: My requests**
- Zero: "No requests yet", with a link to Help.
- Live: task rows (fill in the CIQ with % done, each question with an Answer drawer, give the final release), then requests grouped: needs action · with Beiersdorf · closed.

**Supplier: request page** (header and a 3-step stepper: Questionnaire · Beiersdorf review · Final release)
- supplier-input: completeness bar and modal; the navigator with GEN and the SF metadata questions first; live sections with "New" and "Closed" notes; the undefined-origin note.
- review: a banner, Questions for you, and the questionnaire, still editable until Beiersdorf requests the final release.
- final-release (E-26; Thomas, 15 Oct): the release card, disabled with reasons when blocked (and, when blocked, the note that the questionnaire is locked and whom to contact); questions; the questionnaire read-only under the heading "Your questionnaire (locked)" with the note "Your questionnaire is locked because Beiersdorf has requested your final release. If something must change, contact Beiersdorf; they can reopen the review." Every section says "Locked: Beiersdorf has requested your final release". This replaces the earlier note that edits go back to Beiersdorf.
- completed: a release banner, the supplier's own confirmations, the question history (read-only), the frozen questionnaire and "Report a change".
- cancelled: a neutral banner and the questionnaire read-only.
- Each phase has edge states. The heading must never say "Read-only" over an editable questionnaire.

**Supplier: answer drawer**
- Answer, document (stored at the question and only referenced from the reply) or cannot provide.
- Badges: "changed by Beiersdorf" and "closed, no answer needed".

**Supplier: Help:** how it works (the new flow), FAQs (including which e-mails come), the Beiersdorf contacts. No video.

**Permissions**
- A supplier contact sees only the cases it is named on, and never internal routes, notes, the RMES, decisions, other suppliers or the final document. The portal bundle carries no RMES text (scripts/leak-scan.mjs).
- Customs and Legal are read-only but may post internal notes.
- The Admin, Business owner and Auditor read only the cases. The Admin alone maintains the supplier master; RMM looks it up read-only.

## 5. Copy and data hygiene

- Remove "review version" and "vN" everywhere; documents are referenced by file name and upload date (BRM v2 REQ-PROC-016).
- The texts behind AS-02/03/06/07/08/09 are worded as agreed, not as assumptions.
- Case IDs start at CIQ-2026-0001.
- Dates are shown as `9 Oct 2026`.

## 6. Tests

- **Unit tests (vitest, domain):**
  - empty start;
  - supplier master validation;
  - personas;
  - the guard matrix (phase × action × actor);
  - open points (AS-08: edit, close, new round);
  - mail recipients, counts and leak scan;
  - the final document (content, exclusions, once-only, immutable);
  - lifecycle (cancel and reactivate per phase; Safety / Regulatory Rejected; grow-only; reopen and release withdrawal; release blockers);
  - zero-case metrics;
  - `checkInvariants(state)` after every scenario step.
- **End-to-end:** `scripts/harness-prototype.mjs` (playwright-core from the path in `scripts/harness-portal.mjs`) runs against the built `dist`, with a fresh context per scenario. Every page is checked for console errors and for "NaN", "undefined" or "Infinity" text. Scenarios:
  - S0: empty start, every persona × every route;
  - S1: the full demo flow from nothing;
  - S2–S12: the edge scenarios in `overnight/p1/edge-cases.json` §3;
  - S17: Thomas's rules of 15 Oct (a supplier change reopens the owners' completed reviews; the questionnaire locks at the release request).
  - Use `data-testid` hooks.
- **The gate:**
  ```
  npm run typecheck && npm test && npm run build && npm run build:portal && node scripts/harness-portal.mjs && node scripts/harness-prototype.mjs
  ```

## 7. Defaults chosen tonight (to show Thomas in the morning)

1. Only the Business administrator adds, edits, deactivates and reactivates suppliers and contacts; RMM looks them up read-only (Thomas, 14 Oct; replaces "RMM and Admin both edit suppliers").
2. Only the raiser handles its open point.
3. op-answered mails go to the raiser and the responsible person.
4. Every named contact may confirm (`mayConfirm`, default true).
5. A contact sees only the cases it is named on.
6. The final document is internal; the supplier gets a receipt.
7. Safety / Regulatory Rejected: RMM must choose continue or cancel.
8. In final-release the questionnaire is locked (Thomas, 15 Oct); a reviewer may reopen, which withdraws the release request and unlocks it. During the review a supplier change reopens the completed reviews of the section's owners automatically.
9. Release is blocked by open supplier questions and missing mandatory items.
10. Report a change after the release.
11. There is no manual completion.
12. Customs and Legal may post notes.
13. One person per role, with reviews assigned to that person.
14. Corrections and Notices are not in the final portal; the supplier edits directly.
15. My reviews stays in the RMM menu, for the same review experience as the departments.

## Thomas, 15 Oct (before the client call): reopen on a supplier change; locked at the final release

Two binding rules, built in the domain (`actions.ts` `reopenOwners`, `supplierWriteGuard`; `permissions.ts` `RELEASE_LOCKED_TEXT`), the supplier screens, the live portal adapter (`src/portal/data`) and the sync service (`kissflow-build/sync`):

1. **Reopen on a supplier change (B-30, A-29, B-25/B-27, C-02).** In review, a supplier change in a section reopens every completed review whose department leads or co-reviews that section. It covers answers, K2.1 rows, justifications, uploads (also with a question's answer) and requested-document justifications. The reopen is by "system" with the reason "The supplier changed <section> after your review", audited, with one review-assigned mail per reopen (a burst of changes gives one mail). RMM's whole-CIQ review only for its own sections. The markers count from the undone completion (`ReviewTrack.lastCompletedAt`). Metadata answers keep B-28. In Kissflow the reopen is a new CIQ Review item (H-09, `Activation_Kind` Reopened, the reason in `Activation_Reason`).
2. **Locked at the final-release step (B-04, E-26).** From the release request until a reopen, every supplier change is refused and logged; the supplier screens are read-only with the note above; the release can still be given. In Kissflow the service sets `CIQP_Request_A00.Request_Locked` = "Yes" with the label "Awaiting your final release" when it requests the release (H-08), back to "No" when the request is withdrawn (H-10) or the case is reactivated into review (H-13), and keeps "Yes" when completed or cancelled. The portal refuses writes on a locked request before writing; a save that still arrives is refused by the service and audited "Change attempt refused" (as after the release, B-35).
3. **Order of events in the live service (amended 15 Oct, review findings).** The service applies portal saves and Workbench actions on its next pass, so it keeps them in the order they happened:
   - a supplier save not mirrored yet goes before a review completion (request or poll), before a reopen of a locked case and before a reactivation. A save the portal took while the questionnaire was open is never refused by the lock the last completion sets;
   - a completion is dated by the reviewer's own `Completed_At` (`CompleteOptions.completedAt`): a supplier change after that moment in a section the department leads or co-reviews reopens the review at once (same reopen path, reason and mail as rule 1), and the release request is not sent;
   - a save refused on a locked request is set back on the portal: the request's supplier JSON is rewritten to the case's values and stamps, and its uploads are marked handled. The locked page never shows a refused value as saved, and a later save after a reopen never brings it back. An upload row stored without its save signal (the portal's lock refused the upload notice) is logged and marked when the request unlocks. Open: such a row stays in the portal's document list (the service cannot remove child rows today); it is never taken over.

Tests: `src/domain/lockAndReopen.test.ts`, the guard matrix, portal `answers`/`map`/`liveActions` tests, sync handler (same-pass order, completion by polling after the save, refusal set back and not replayed after a reopen, the unlock sweep), lifecycle and e2e tests; harness-prototype S2, S7 (reworked: the field is cleared during the review, the release is blocked and the questionnaire locked, RMM reopens) and S17 (both rules); harness-portal `final-release`, `release-lock-refusal`, `reopen-unlocks`.

## §8 Configuration editor (Business administrator): rules and questionnaire (Thomas, 14 Oct, before the demo)

**Goal:** the business maintains the questionnaire and the rules without IT, through versions. It must be **easy to use and understand**, for both the rules and the questionnaire.

### 8.1 Model (data, versioned)

**The pair.** A configuration release is a pair: rule set `RS-2026.N` plus questionnaire `CIQ-2026 vM`.
- At most **one draft pair** exists at a time.
- Published pairs never change.
- New cases use the newest published pair. Running cases keep the pair they started with: `case.ruleSetVersion` and `case.templateVersion`.
- **Only the side that changed gets a new number** (Thomas, 14 Oct). Rules changed, questionnaire unchanged: `RS-2026.(N+1)` with the existing questionnaire version (no new questionnaire version, none listed twice). Questionnaire changed, rules unchanged: `v(M+1)` with the existing rule set. Both changed: both new numbers. Nothing changed: nothing to publish. Numbers grow per side, so a questionnaire change after a rules-only release is v3, not v4. So the history can hold `RS-2026.3 + v2` and then `RS-2026.3 + v3`.
- Stored shape unchanged (SCHEMA stays 9): the draft holds working numbers per side; at publish the unchanged side is stored as an identical copy of the earlier release's, under the same version. A copy never defines a version: the first pair holding a version does (`templatePairOf`, `ruleSetPairOf`; v1 and RS-2026.1 are always the built-in ones), so the registry, `templateList`, `ruleSetsOf` and the catalogue list each version once.

**Rules are data.** Each rule is `{ id, question, condition, activates[], outcome, evidence[], departments[], basis, note }`.
- `condition` is declarative:
  - `{ kind: "always" }`
  - `{ kind: "includes-any", question, values[] }`, for the multi-choice SF-01, SF-05 and SF-11
  - `{ kind: "is", question, value: true | false }`, for yes/no
  - `{ kind: "yes-or-unanswered", question }`
  - `{ kind: "any-except", question, values[] }`, e.g. "any market outside the EU"
- One evaluator turns a condition into a check. One text builder turns it into a plain sentence, e.g. "Origin includes Vegetable" or "Any target market outside the EU".
- The built-in RS-2026.1 and RS-2026.2 rules are rewritten as data with identical behaviour. The existing tests must pass unchanged in outcome.

**The questionnaire is data.** A version holds its sections in order. Each section:
- `{ id, code, title, kind: chapter | annex | basic, meaning, lead, co[], documentsOnly, fields[] }`
- Each field: `{ id, label, type, required: mandatory | optional, options?, unit?, help?, owner }`
- The built-in v1 and v2 resolve from today's catalogue.
- Fields are **resolved per version**. Every screen that lists the fields of a case's section must use `fieldsOf(sectionId, case.templateVersion)`: supplier questionnaire, completeness blockers, review workspace, case Questionnaire tab and final document. A field added in v3 never appears on a v1 case.

**State.**
- `AppState.config` holds the admin-created versions: the draft pair and later published pairs.
- A registry makes `ruleSet(version)`, the section and field lookups, and the catalogue lists include them.
- SCHEMA goes up by one, so saved state is dropped and the empty start stays clean.

### 8.2 Actions (admin only, capability `config.manage`; every change is in the configuration log)

- `createDraft(note)`: copies the newest published pair into a draft with working numbers per side: RS-2026.(highest rule set number + 1) and v(highest questionnaire number + 1). Refused while a draft exists. The existing prepared RS-2026.2/v2 draft stays the current draft until it is published or discarded.
- `publishPlan(state)`: what publishing would give, live: kind (rules / questionnaire / both / none), the resulting pair, the changes per side, and the plain sentence for the draft bar and Check & publish ("Rules RS-2026.3 (3 changes) · questionnaire stays v2", "Questionnaire v3 (1 change) · rules stay RS-2026.2", "Nothing to publish yet: the draft is the same as RS-2026.2 + v2").
- `discardDraft()`
- Rules: `upsertRule(rule)`, `deleteRule(id)`. New ids continue the R-numbering. Editing a rule from the published set inside the draft is allowed (the draft is a copy).
- Questionnaire:
  - `upsertSection(section)`: new sections get their id from the code ("K6.18", "Annex 14" → "A14"), unique.
  - **No duplicate codes** (Thomas, 14 Oct). One comparison everywhere (`sectionCodeKey`): case, spaces, leading zeros and a trailing dot do not count, and "Annex" is "A", so "Annex 4" = "A4" = "annex4" = "A 4" and "K6.1" = "k6.1". The code, and for a new section the id it would get, must not match any section of any version: built-in, published, the draft, retired ones included; an edited section is not compared with itself. The section form checks while the administrator types and keeps Save disabled: "Annex 4 is already used by “Hydrocarbons (MOAH)” (in this draft). Choose another code." (or "retired in this draft", "in published version v3", "in the built-in catalogue"). `upsertSection` refuses with the same text (`sectionCodeDuplicate`), and "Section codes are unique" uses the same key. Codes are stored the usual way: "a 14" and "A14" → "Annex 14", "k 6.20" → "K6.20".
  - `retireSection(id)`: hides it for new cases on this version; never deletes. Rules that point at it are flagged.
  - `upsertField(sectionId, field)`, `moveField(sectionId, fieldId, up | down)`, `removeField(sectionId, fieldId)`. Field ids are generated, e.g. `FLD-K6.18-001`.
- `validateDraft()` returns a checklist:
  - the draft changes the rules or the questionnaire (else: "Nothing to publish: the draft is the same as RS-2026.2 + v2.");
  - every rule activates at least one existing, non-retired section (or is evidence-only);
  - every new or non-"Always" section is switched on by at least one rule;
  - no empty labels or titles;
  - choice fields have at least 2 options;
  - number fields have a unit or explicitly none;
  - section codes are unique;
  - a section that is not documents-only has at least one field.
  
  Publishing is blocked while a check fails. Evidence that no question collects is not a problem: the check lists it as information ("nothing to fix"), with the section where the supplier gets its upload slot (§8.5).
- `publishDraft(changeNote)`: needs a change, a change note and a passing validation. The draft becomes published with only the changed side's new number; the previous pair is marked "Superseded, running cases keep it". The toast and the log say which side: "Rules RS-2026.3 published with questionnaire v2 (unchanged). New cases use RS-2026.3 + v2; …", "Questionnaire v3 published with rules RS-2026.3 (unchanged). …", or "RS-2026.3 + v3 published. …"; the log detail starts with "Rules only", "Questionnaire only" or "Rules and questionnaire". The Test rules regression can run against the draft before publishing.

### 8.3 Screens (easy to use: plain words, one task per screen, a preview everywhere)

**Draft bar** on Rules and Questionnaire:
- with no draft: "Published: RS-2026.2 + v2 · used for new cases" and **[Create new version]**;
- with a draft: "Draft · Rules RS-2026.3 (3 changes) · questionnaire stays v2" (live, from `publishPlan`) with **[Check & publish]** and **[Discard draft]**;
- a version history list, one row per release: version (the pair) with "Rules only", "Questionnaire only", "Rules and questionnaire" or "First version", date, who, change note, number of cases using it (a case counts on the release with both its versions). Selecting a release shows its rule set on Rules and its questionnaire on Questionnaire; a release that kept a side says so ("changed only the questionnaire: it kept rule set RS-2026.3"). The Questionnaire page says which rules a version is used with ("Used for new cases with rules RS-2026.3.").

**Rules editor** (on the Rules page, when a draft exists):
- The same grouped list, plus **[Add rule]** and **Edit / Delete** per rule.
- The rule form reads as a sentence:
  - **When** [question ▾] [is Yes / is No / includes any of ☐☐☐ / any value except ☐] → **then** [sections ☐☐ (searchable)] **become** [Mandatory / Optional / Not applicable] · **ask for evidence** [chips + add] · **reviewed by** [department chips] · basis [Requirements document / Agreed with Beiersdorf / Not in the requirements] · note.
  - **Ask for evidence** offers the 15 known documents as chips (each collected by a question) and a "Not in the list?" field. A document no question collects gets a neutral information line, not a warning: "“Test” is not collected by a question yet: the supplier gets an upload slot for it under “Requested documents” in K6.18." (in K1 when the rule switches on no section; §8.5).
  - A live preview sentence: "If the origin includes Vegetable, Annex 1, 2 and 9 become mandatory. The supplier uploads Pesticide analysis. Reviewed by Sustainability."
  - A "What this changes" mini-simulation of example answers is a nice-to-have.
- Changed or new rules are marked "Changed in draft" or "New in draft". The "Changes in draft" summary lists them.

**Questionnaire editor** (on the Questionnaire page, when a draft exists):
- Catalogue with **[Add section]**, and **Edit / Retire** per section.
- Section form: code, title, kind, "What does this section cover?", lead department, co-reviewers, and content: "Documents only" or "Questions".
- Field list inside the section form: add, edit, reorder (up/down), remove.
- Field form: label, type, Mandatory/Optional, options (for choice types; add/remove), unit (number), help text, owner department.
- Preview: the field rendered as the supplier will see it.
- Hint for new sections: "A new section needs a rule that switches it on", with a button **[Create the rule]** that opens the rule form with the section preselected.

**Check & publish:**
- "What will be published", in plain words: the plan sentence and what it means ("Only the rules get a new version. The questionnaire stays v2: no new questionnaire version is made");
- the validation checklist (green or red, each with a link to fix); an unchanged draft fails "The draft changes the rules or the questionnaire" and Publish stays disabled;
- the change summary (rules added, changed or removed; sections added, changed or retired; fields added, changed or removed);
- "Test the draft", which runs the existing regression;
- a change note (required) and **[Publish]**.

After publishing, toast and history: "RS-2026.3 + v3 published. New cases use it; N running cases keep RS-2026.2 + v2." (one-sided releases: see `publishDraft`).

**Read-only roles:**
- The Auditor sees the versions and history read-only.
- Nobody but the Admin sees edit controls; the domain also refuses.

### 8.4 Tests

- **Unit tests:**
  - condition evaluator and text builder;
  - the built-in rules give identical scopes for a matrix of answers, before and after the data conversion;
  - draft lifecycle;
  - validation;
  - version-scoped fields (a v1 case does not see a v3 field);
  - publish pins new cases to the new pair;
  - guards (admin only).
- **Harness S13 "the business changes the configuration"**, from the empty start:
  1. As admin: publish the prepared RS-2026.2/v2.
  2. Create a new version.
  3. Add section "K6.18 Microplastics declaration" with 2 fields (yes/no mandatory; file optional).
  4. Add a rule "SF-03 is Yes → K6.18 Mandatory, reviewed by Safety".
  5. Check & publish with a change note.
  6. RMM starts a case; the supplier answers SF-03 = Yes and sees K6.18 with the 2 fields (mandatory blocks completeness).
  7. A case started before the publish keeps the old version and does not show K6.18.
  8. The Auditor sees the history read-only; RMM sees no edit controls.
- **Unit tests (14 Oct, `releases.test.ts`):** code normalisation and every duplicate form (draft, retired, published, built-in, derived id, editing itself); nothing changed, rules only, questionnaire only, both; numbers monotonic per side; pinning of running cases; one-sided releases on top of the built-in first pair.
- **Harness S16 "duplicate codes; one-sided releases"**, from the empty start: the admin publishes v2; a new draft with no change shows "Nothing to publish" as a failing check and the domain refuses it; Add section shows the duplicate inline while typing ("a 4", "A4", "annex4", "Annex 4", "k6.1") with Save disabled, a free code enables Save, editing K3 to "k 4.1" is caught too; a rule SF-06 is Yes → K6.8 Mandatory publishes RS-2026.3 + v2 (no v3 anywhere), a new case runs on RS-2026.3 + v2 and gets K6.8 mandatory while the RS-2026.2 case keeps it optional; then one more Annex 1 question publishes RS-2026.3 + v3 (no RS-2026.4), a new case runs on it, every older case keeps its pair, and the auditor reads "Rules only" / "Questionnaire only" in the history.
- **Harness S14 "requested documents"** (§8.5), from the empty start: the admin adds K6.18 with a rule "SF-03 is Yes → K6.18 Mandatory" that asks for *Microplastics test report*, and an evidence-only rule "Every case" that asks for *Supplier code of conduct*. Both show the information line, not a warning, and Check & publish lists them as information. The supplier sees both slots (K6.18 and K1), completeness is blocked until one is uploaded and the other justified, Safety and QM see received / justified, RMM's evidence chips count them, and the final document lists the file and the justification.

### 8.5 Requested documents (Thomas, 14 Oct)

A rule may ask for a document that no question collects (typed into "Not in the list?"). The supplier must never be told to provide something it has nowhere to upload, so every such document becomes an upload slot under **Requested documents** in a section of the case. In Kissflow this is a child table (see the note below).

**Which documents.** For a case, every evidence document of its fired rules (the case's pinned rule set) that is not collected by a question. A document counts as collected when one of its questions (the evidence-to-question map) is in the case's questionnaire version and its section is in scope. The built-in rule sets only ask for collected documents, so built-in cases have no slots.

**Where.** In the first live section the asking rule switches on for that case's questionnaire version; for an evidence-only rule (no section), in **K1 Mandatory documents**. Two rules asking for the same document share one slot.

**Key.** Each slot has a stable key, `EV:<slug of the document name>` (e.g. `EV:microplastics-test-report`). Uploads are stored on the case with that key as their question and the slot's section; a cannot-provide justification is stored under the same key. A slot upload is no answer to a question.

**Live scope.** Like sections: before the completeness confirmation the slots open and close with the answers (uploads and justifications are kept and come back). The confirmation fixes the list on the case; after it the list only grows. A slot the answers no longer call for is kept; a new one is added ("Added after your completeness confirmation"), noted in the audit and in the data-changed mail. Live-scope cases only (since v5 that includes every live-portal request).

**Mandatory.** Each slot is mandatory. Missing (no upload, no justification), it is a completeness blocker in its section, named "<document> (requested by rule R-xx)" internally and "<document> (requested document)" to the supplier (suppliers never see rule ids), and a release blocker like every mandatory item. It counts in the section's progress.

**Screens.**
- **Supplier** (live-scope requests): a "Requested documents" block at the end of the section, one row per document: the name, why it is asked in plain words ("Asked for because you answered Yes to SF-03 (Polymer)", "Asked for every raw material"), the same uploader as file questions, the uploaded files with who and when, and "Cannot provide? Add a justification".
- **Review workspace and case Questionnaire tab:** the same rows read-only, with the status (Received · Not provided, justified · Missing), the rule that asks for it, the files or the justification. Reviewers can ask the supplier about a requested document; the answer's file goes to the slot. RMM's evidence chips show the status of requested documents too.
- **Rule form and Check & publish:** an information line instead of the warning (§8.3, §8.2).
- **Final document:** each slot is listed in its section and in the evidence list: file name, upload date and uploader, or "Not provided" with the justification, who gave it and when.

**Kissflow note.** One child table **Requested documents** on the case item (the app's process, mirrored on the portal twin), one row per slot: *Document name* (text), *Key* (text, `EV:…`), *Section* (text), *Requested by rule* (text, internal), *Attachment* (attachment, several files), *Uploaded by* (user), *Uploaded at* (date-time), *Cannot provide* (yes/no), *Justification* (long text). The rows are written by the scope logic when the rules fire (the same place that sets the section scope), the supplier fills Attachment or Cannot provide + Justification in the portal, and the completeness and release checks count a row as done when it has an attachment or a justification. The portal never shows the rule column.
