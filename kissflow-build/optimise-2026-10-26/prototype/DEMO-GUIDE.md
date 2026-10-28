# CIQ demo guide (clickable prototype, 14 Oct 2026)

Kissflow-internal. This is the one page to read before the call.

## Start

```
cd prototype && npm run dev
```

- Open http://localhost:5310. You start as **Katrin Vogel (RMM)** on an empty Dashboard ("Start your first CIQ case").
- **Data at the start:** 11 internal people, one per role, and **one supplier, Solvaro Oleochemicals S.A.**, with two contacts, **Elena Márquez** and **Ravi Menon**. There are no cases and no mails.
- **Switch person:** click the person chip at the top right. The **Demo** menu holds:
  - **View as:** grouped by role, with the supplier contacts second.
  - **Show prototype notes:** off. Leave it off for the call.
  - **Reset to empty start:** use it before the call and between runs.
- **Mail:** the envelope at the top shows the simulated inbox of whoever you are viewing as. Every mail has a link to the item.
- The client-facing process page stays at `http://localhost:5310/#/understanding/call` and in the shared artifact link.

## The demo flow (about 20 minutes, everything from scratch)

This follows `scripts/harness-prototype.mjs` S1, which passes. Values are suggestions; type anything plausible.

1. **RMM starts the case** (Katrin): Dashboard → **New case**.
   - Show that an empty submit lists every missing item.
   - Fill in the case:
     - trade name *Solvasoft 300*, main INCI *Ethylhexyl Palmitate*, material no. *RM-410001*;
     - supplier **Solvaro**, both contacts;
     - target markets, e.g. *UK*, and the due date.
   - Create the case: **CIQ-2026-0001**. Both contacts get an invitation mail. No review task exists yet.
   - Optional: **Suppliers** shows the supplier master read-only for RMM ("Maintained by the business administrator."). New case has no "Add a supplier": a missing supplier or contact is asked for from the administrator. There is no onboarding flow.
2. **The supplier fills in the CIQ in one step** (View as **Elena**).
   - Open the invitation from the inbox → the request.
   - **General information:** the trade name, supplier, DUNS and contact e-mails are set by Beiersdorf and locked. Fill in the manufacturer and the production site.
   - **Metadata questions SF-01…SF-12:**
     - Pick *Vegetable* and Annex 1, 2 and 9 open live.
     - Fill something in Annex 2, then switch to *Animal*: Annex 2 closes.
     - Switch back: the answer is still there.
   - Fill in K2.1 (components table) and K2.3.
   - **Check completeness:** the missing items are named, including the evidence slots the rules ask for (e.g. BSE/TSE for Animal, Statements). Confirm stays disabled.
3. **The second contact works in parallel** (View as **Ravi**): uploads K1 documents, K2.2 values and the K5.1 test.
   - Back as Elena, every answer shows who entered it.
   - Elena **confirms completeness**, a recorded declaration that is not an approval. Part 1 closes.
   - Review tasks go to **RMM plus only the departments concerned**. Sustainability gets nothing in this case. Customs and Legal get an "informed" mail.
4. **Customs or Legal** (View as **Felix Schulz** / **Dr. Anna Becker**): Cases → the case opens on K7 or K8 as a full card, read-only, with a note box.
5. **The query loop** (View as **Dr. Jonas Albrecht, Regulatory**):
   1. My reviews → the case → raise a question on a field, e.g. K2.1 natural origin index.
   2. **Edit** it: only the raiser can. The supplier gets a "changed" mail.
   3. As **Elena**, the task shows "Changed by Beiersdorf". **Answer** in the drawer.
   4. As **Regulatory**: **Return**. Elena answers again with a document (stored at the question).
   5. **Accept**.
   - Show **Close** (withdraw) on another point, e.g. as **Dr. Mira Hansen, Safety**. The supplier sees "Closed, no answer needed" without the internal reason.
6. **RMM reviews the whole CIQ** (Katrin): My reviews → the same workspace; RMM can ask on any section but never adds sections. Raise a question, have Elena answer it, accept it.
   - **Questionnaire tab** (case page): the summary bar counts complete sections and filters them (Missing items, With open points, Changed after completeness, Not applicable); the navigator on the left (a picker on phones) opens one section with Previous / Next, and every answer shows who entered it and when.
   - **@mentions:** in Internal notes, the review's notes panel or the K7/K8 note box, type @ and pick a colleague (Beiersdorf only); they get one mail whose link opens the note, shown with the mention as a chip.
7. **Completion:**
   - Safety and Regulatory record RMES and their internal decision.
   - QM and Microbiology complete.
   - RMM completes last. The release request is sent only now, exactly once, and the supplier's questionnaire locks.
   - Optional edge case: record **Rejected** in Safety. RMM must then choose *Continue to final release* (with a note) or *Cancel the case*.
8. **Final release** (Elena): the questionnaire is now read-only, under "Your questionnaire (locked)": "Your questionnaire is locked because Beiersdorf has requested your final release. If something must change, contact Beiersdorf; they can reopen the review." The release card (blocked with reasons if anything is missing or a question is open) → **Give final release**. The case completes automatically and is frozen; the supplier sees its two confirmations only.
9. **Final document** (Katrin): open the "final document" mail → the **Final document** tab.
   - It contains the answers by section (numbers with units), the metadata answers, the evidence list, every open-point thread as text round by round, all confirmations, the CIQ ID and the fingerprint.
   - It has no RMES content and no internal notes.
10. **Oversight:**
    - **Dr. Claudia Richter (Business owner):** Reports.
    - **Paul Neumann (Auditor):** Audit trail → a case ID opens its History.
    - **Nina Hoffmann (Admin):**
      - Rules (with Test rules) and Questionnaire: both are edited in versions, see "Change the configuration" below;
      - Section owners;
      - Suppliers: the only place where suppliers and contacts are added, edited, deactivated and reactivated.

## Thomas's two rules of 15 Oct (about 3 minutes, harness S17)

1. **A supplier change reopens the review of the section's owners.** As **Dr. Jonas Albrecht (Regulatory)**, complete the review (RMES and decision first). As **Elena**, change the natural origin index in K2.1.
   - Regulatory's review is reopened at once by the system, with the reason "The supplier changed K2.1 after your review". Regulatory gets one mail, and the workspace marks K2.1 as changed since the completion.
   - Change K2.1 again (add a component): no second mail while the review is open again.
   - It works for every section owner: an upload in K1 reopens QM (lead) and the co-reviewers that had completed (Regulatory, Safety, RMM), but not Microbiology. RMM's review reopens only for its own sections (General information, K1, K2.3).
   - Metadata answers keep their rule: they only add sections, and the added section's lead department gets its task.
2. **The questionnaire locks at the final-release step.** Once every review is completed, Elena's questionnaire is read-only with the lock note; every section says "Locked: Beiersdorf has requested your final release". She can still give the final release.
   - If something must change, a reviewer reopens its review (e.g. **Tobias Keller, Microbiology**). The release request is withdrawn, the case goes back to review and the questionnaire is editable again. When everyone has completed again, it locks again.

## Change the configuration (Admin, about 5 minutes)

The business changes the rules and the questionnaire itself, without IT, in versions. This follows harness S13, which passes. View as **Nina Hoffmann (Admin)**.

A version is always a pair: rule set **RS-2026.N** plus questionnaire **vM**. New cases use the newest published pair. A running case keeps the pair it started with, so a change never reaches it. **Only what changed gets a new number:** a rule change alone publishes RS-2026.3 with questionnaire v2 kept, a questionnaire change alone publishes v3 with the rule set kept (see "Rules or questionnaire on their own" below).

1. **Publish the prepared version.** Rules shows a yellow bar: "Draft · Rules RS-2026.2 (1 change) · questionnaire v2 (2 changes)". Click **Check & publish**: "What will be published" repeats it in plain words, "All 8 checks pass" (click it to see each check), the change note is filled in, click **Publish**. The bar now says "Published: RS-2026.2 + v2 · used for new cases".
   - Optional: as Katrin, start a case now. It stays on v2 for the rest of the demo.
2. **Create a new version.** Click **Create new version** (the dialog says changed rules become RS-2026.3, a changed questionnaire v3, and the side you leave alone keeps its version), add a short note such as "Microplastics declaration", and confirm. The bar says "Nothing to publish yet: the draft is the same as RS-2026.2 + v2".
3. **Add a section.** Questionnaire → **Add section**: code *K6.18*, title *Microplastics declaration*, lead department *Product Safety* (review tasks go to the lead department), content *Questions*. The section opens with the hint "A new section needs a rule that switches it on".
   - **A code that is already used is caught while you type,** however it is written: try *a 4*, *A4* or *annex4*: "Annex 4 is already used by “Hydrocarbons (MOAH)” (in this draft). Choose another code." appears under the field and **Add section** stays disabled. *k6.1* is K6.1 (EU REACH). Retired sections and older versions count too.
   - A form you have started typing in stays open if you click beside it; **Cancel** or Escape closes it.
4. **Add its questions.** **Add question**:
   - "Does the material contain intentionally added microplastics?", type *Yes / No*, *Mandatory*;
   - "Microplastics test report", type *File upload*, *Optional*.
   - The preview on the right shows each question as the supplier will see it. Questions can be moved up or down, edited and removed.
5. **Add the rule.** Click **Create the rule** in the hint. K6.18 is already chosen, and *Safety* (its lead department) is already ticked under "Reviewed by": do not click it again, that would untick it. Pick the question *SF-03* (polymers); "is Yes" and "Mandatory" are already set. The preview reads: "If the supplier answers Yes to SF-03 (Polymer), K6.18 Microplastics declaration becomes mandatory. Reviewed by Safety." and "The review task goes to the section's lead department: K6.18 → Safety." Basis starts as "Agreed with Beiersdorf". Click **Add rule**.
   - On Rules, the new rule R-122 is marked "New in draft", and "Changes in draft" lists it with the section.
6. **Check & publish.** "What will be published: Rules RS-2026.3 (1 change) · questionnaire v3 (1 change)". "All 8 checks pass" (when one fails, the list opens and the red check has a link that opens what to fix). The page shows the change summary, **Run the test** (the example materials, before and after) and how many running cases keep the old version. Write the change note and **Publish**. The toast says "RS-2026.3 + v3 published. New cases use it; 1 running case keeps RS-2026.2 + v2."
7. **See it work.** As Katrin, start a new case: New case shows "CIQ-2026 v3". As Elena, answer SF-03 = Yes: K6.18 opens with its two questions, and Check completeness names the mandatory one. The older case never shows K6.18.
8. **Read-only.** As **Paul Neumann (Auditor)**, Rules shows the version history (who, when, change note, cases using it) without any button. Katrin has no access to Rules or Questionnaire.

**Rules or questionnaire on their own** (about 3 minutes, harness S16). Thomas's question: "can a new rule be published without a new questionnaire?" Yes.
- **Rules only.** Create a new version and add one rule only, e.g. *SF-06 is Yes → K6.8 Halal and kosher status, Mandatory, reviewed by Regulatory*. The bar says "Rules RS-2026.3 (1 change) · questionnaire stays v2"; Check & publish says "Only the rules get a new version. The questionnaire stays v2: no new questionnaire version is made". Publish: the toast says "Rules RS-2026.3 published with questionnaire v2 (unchanged)…", the history row is "RS-2026.3 + v2 · Rules only · questionnaire v2 kept", and Questionnaire says v2 is "Used for new cases with rules RS-2026.3". A new case starts on RS-2026.3 + v2.
- **Questionnaire only.** Create a new version (the dialog now says RS-2026.4 or v3: each side counts on its own) and add one question to Annex 1 only. The bar says "Questionnaire v3 (1 change) · rules stay RS-2026.3"; publishing gives RS-2026.3 + v3, "Questionnaire only".
- **Nothing changed.** An unchanged draft cannot be published: the first check, "The draft changes the rules or the questionnaire", is red with "Nothing to publish: the draft is the same as …".
- Every case keeps the pair it started with.

9. **Ask for a document no question collects** (optional, harness S14). In the rule form, under "Ask for evidence", type a name into "Not in the list?" (e.g. *Microplastics test report*) and click **Add**. Instead of a warning, a grey line says where it goes: "… the supplier gets an upload slot for it under “Requested documents” in K6.18" (in K1 when the rule switches on no section). Check & publish lists it under "Requested documents (nothing to fix)". As Elena, the section ends with **Requested documents**: the document, why it is asked ("Asked for because you answered Yes to SF-03 (Polymer)"), an upload and "Cannot provide? Add a justification". Until one of the two is done it blocks completeness as "(requested document)". Reviewers see it as Received, Not provided (justified) or Missing, with the rule; the final document lists the file or the justification. In Kissflow this is a "Requested documents" child table on the case.

Other things to show: **Edit** or **Delete** a rule in the draft, **Retire** and **Restore** a section, and **Discard draft**. If you delete a rule that switches on a section (for example R-00, which switches on General information and K1), Check & publish shows a red check "Every section is switched on by a rule" with a link to fix it: publishing waits until each section is switched on again or retired.

**Other edge cases you can show,** all tested in the harness:
- **Late metadata change in review:** e.g. SF-08 palm = Yes. Annex 1 is added and the department gets an extra point; nothing is ever removed after completeness.
- **A department adds a missing section.**
- **Cancel and reactivate** in any phase. Reactivation needs a justification and is possible within 12 months.
- **Release blocked** by a mandatory field the supplier cleared during the review (harness S7): after the last completion the release card names it, says the questionnaire is locked and whom to contact; RMM reopens, the supplier fills it in again, RMM completes and the release goes out again.
- **A reviewer reopens during the release request,** which withdraws it and unlocks the questionnaire.
- **Add a second supplier** (as **Nina Hoffmann, Admin**): DUNS, duplicate and e-mail validation; its contacts appear in View as and see nothing of Solvaro.
- **Deactivate a contact** (Admin) who is the only contact on an open case: a replacement must take over and gets the invitation. **Deactivate supplier** is refused while the supplier has open cases.
- **"Report a change" after the release.**

## Menus per role (final app)

| Person (role) | Menu |
|---|---|
| Katrin Vogel (RMM) | Dashboard · My reviews · Cases · Suppliers (read-only) |
| Dr. Jonas Albrecht, Dr. Mira Hansen, Lena Krause, Tobias Keller, Sophie Wagner (departments) | My reviews · Cases |
| Felix Schulz (Customs), Dr. Anna Becker (Legal) | Cases, read-only |
| Nina Hoffmann (Admin) | Rules · Questionnaire · Section owners · Suppliers |
| Paul Neumann (Auditor) | Audit trail · Cases · Rules, read-only |
| Dr. Claudia Richter (Business owner) | Reports · Cases |
| Elena Márquez, Ravi Menon (supplier) | My requests · Help |

## Decisions I took overnight (please confirm or change)

1. **Suppliers:** only the Business administrator adds, edits, deactivates and reactivates suppliers and contacts (your rule, 14 Oct). RMM sees them read-only and asks the administrator for a missing one. Contacts are deactivated, never deleted. DUNS has 9 digits and must be unique. A contact's e-mail must be unique.
2. **Open points:** only the person who raised one can accept, return, edit or close it. Editing the question of an answered point starts a new round; changing the due date does not.
3. **Answer mails** go to the raiser and the responsible person. Supplier mails go to every contact named on the case.
4. **Confirming:** every named contact may confirm (there is a "may confirm" flag per contact). A contact sees only the cases it is named on.
5. **The final document** is internal only. The supplier gets a release-receipt mail.
6. **Safety or Regulatory Rejected:** RMM must explicitly choose to continue (with a note) or cancel.
7. **Release** is blocked while the supplier's own questions are open or a mandatory item is missing.
8. **Changes after completeness:** a change to a metadata answer only adds sections. Any other supplier change reopens the completed reviews of the section's owners automatically (your rule, 15 Oct). From the release request on the questionnaire is locked (your rule, 15 Oct); a reviewer who has completed can reopen, which withdraws the release request and unlocks it.
9. **Every open finding** blocks its department's completion. There is no blocking/non-blocking toggle.
10. **The evidence the rules name** is now a required upload slot with a "cannot provide + justification" option: Statements on every case, BSE/TSE and Annex II 419 for Animal, sustainability certificates for Vegetable, PAH for Petrochemical, residual monomer and SPM statement for Polymer. These are new fields `FLD-K1-004…010`; check the labels.
11. **Removed:** Corrections, Notices, the old Scope tab (merged into Questionnaire), Reconstruct (merged into the case History tab), "Informed cases" (Customs and Legal use Cases), "Operations" for the owner, and "Reports" for RMM. Also removed: "Our understanding" in the app menu (the call page stays), and every "review version" wording.
12. **No manual completion:** a case without the supplier's release can only be cancelled.
13. **Reminders:** "Certificate expiring" (rem-6) is still on the Reminders page, unchanged from the configuration.

## Before the Kissflow build (after the call)

- **New fields:** add the evidence slots `FLD-K1-004…010` and the decisions above to `docs/kissflow-data-model/kissflow-data-model-plan.md` first, then tell the app session (CLAUDE.md rule).
- **Requested documents child table** (spec §8.5): Document name, Key, Section, Requested by rule (internal), Attachment, Uploaded by, Uploaded at, Cannot provide, Justification, on the case item and its portal twin. Add it to the plan first as well.
- **The live portal** shares the supplier screens. Its old-flow cases still pass the portal harness, but the shared screens now show dates as "2 Oct 2026, 13:52" and the documents-only chapter wording. The admin's demo preview shows the new flow.
- Nothing has been uploaded. The live portal still runs build `ciq-portal-ui-71810c31a7`.

## Checks (last run 15 Oct, after Thomas's two rules: reopen on a supplier change, lock at the final release)

```
npm run typecheck && npm test && npm run build && npm run build:portal && node scripts/harness-portal.mjs && node scripts/harness-prototype.mjs
```

- **Unit tests:** 606 passed (41 files; `lockAndReopen.test.ts` covers both rules of 15 Oct, including a completion the live service applies after a later supplier change).
- **Portal harness:** 24/24 (196 checks; `final-release`, `release-lock-refusal` and `reopen-unlocks` cover the lock).
- **Sync service:** `node --test kissflow-build/sync/test/` 105/105 (the golden walk re-captured on purpose for the two rules; the order of saves and completions in one pass, a completion picked up after the save, a refused save set back and never replayed after a reopen or a reactivation).
- **Prototype harness:** 18/18 scenarios (1933 checks):
  - S0: empty start, every person on every route;
  - S1: the demo flow;
  - S2–S12: edge cases (S8: the supplier master is the administrator's; RMM sees it read-only and the domain refuses RMM's changes);
  - S13: the business changes the configuration (publish v2, new version, section K6.18 with 2 questions, the rule, Check & publish, a new case gets K6.18, an older case does not, auditor read-only);
  - S14: requested documents (a rule asks for a custom document in K6.18, an every-case rule for one in K1; the supplier uploads one and justifies the other, completeness waits for both, reviewers see the status, the final document lists them);
  - S15: @mentions (RMM, a reviewer and Customs on K7 mention colleagues; each gets one mail whose link opens the note; suppliers see nothing);
  - S16: duplicate section codes refused while typing (Save disabled), an unchanged draft cannot be published, a rules-only release (RS-2026.3 + v2, no v3) and then a questionnaire-only release (RS-2026.3 + v3, no RS-2026.4), new cases on each, older cases keep theirs;
  - S17: Thomas's rules of 15 Oct (a K2.1 change reopens Regulatory, a K1 upload reopens QM but not Microbiology, one mail per burst, the change marker; locked at the release request; a reopen unlocks).
- **Replay:** `node scripts/harness-prototype.mjs S1 --headed --slow 300` replays the demo in a visible browser (`S13` replays the configuration change, `S14` the requested documents, `S16` the duplicate codes and the one-sided releases).
- **Background:** the spec is in `FINAL-APP-SPEC.md`, the night's log in `OVERNIGHT-LOG.md`, the inventory in `overnight/p1/`.
