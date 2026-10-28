# CIQ prototype: manual check (14 Oct 2026)

**Start:** run `cd prototype && npm run dev` and open http://localhost:5310.
- **Person chip, top right → Demo menu:** View as · Show prototype notes (leave off) · Reset to empty start.
- **Envelope icon:** the inbox of whoever you are viewing as. Every mail has a link that opens the item.

## The flow

### 1. RMM starts the case (Katrin Vogel)
- [ ] The Dashboard shows the "Start your first CIQ case" card.
- [ ] New case: submitting it empty lists every missing item.
- [ ] Fill in: trade name, main INCI, BDF material no., supplier Solvaro, its contacts, target markets, due date.
- [ ] Create it: the case gets CIQ-2026-0001. Elena and Ravi each get an invitation mail. No review task exists yet.
- [ ] A second case with the same supplier and material no. shows a duplicate warning and asks for a reason.

### 2. The supplier fills in the CIQ (View as Elena Márquez)
- [ ] The invitation mail's link opens the request. It shows 3 steps: Questionnaire · Beiersdorf review · Final release.
- [ ] General information: trade name, supplier, DUNS and contact e-mails are locked (set by Beiersdorf). Fill in the manufacturer and production site.
- [ ] SF-01 Vegetable opens Annex 1, 2 and 9 live ("New").
- [ ] Switching to Animal closes Annex 2 ("Closed", answers kept).
- [ ] Switching back reopens it with the answer.
- [ ] Waste, CCU or chemical recycling show the "Beiersdorf may ask for more" note.
- [ ] K2.1 uses a component table.
- [ ] K1 has the evidence slots the rules require, each with "Cannot provide? Add a justification".
- [ ] Chapters without questions are "Documents only · optional".
- [ ] Check completeness names the blockers. Confirm completeness stays disabled until nothing is missing.

### 3. A second contact in parallel (View as Ravi Menon)
- [ ] Every answer and upload is attributed to the person who entered it.
- [ ] Back as Elena: Confirm completeness (declaration plus checkbox).
  - [ ] Part 1 closes; the questionnaire stays editable.
  - [ ] RMM and only the departments concerned get review tasks and mails.
  - [ ] Customs and Legal each get an "informed" mail.

### 4. Customs and Legal (Felix Schulz / Dr. Anna Becker)
- [ ] Their only menu item is Cases.
- [ ] The case opens on the K7 or K8 card: what it covers, documents, questions, note box. It is read-only.

### 5. The department review (Dr. Jonas Albrecht, Regulatory)
- [ ] My reviews opens the review workspace.
- [ ] Ask (on a field, row or document; with a justification, responsible person and due date) mails the supplier.
- [ ] Edit is for the raiser only. The supplier sees "Changed by Beiersdorf" and gets a mail.
- [ ] As Elena, answer in the drawer: text, a document stored at the question, or cannot provide. The raiser gets a mail.
- [ ] Return gives Elena "More information needed". She answers again, and the point is accepted.
- [ ] Close (withdraw) with an internal reason: the supplier sees "Closed, no answer needed" without the reason.
- [ ] Add a missing section with a justification: the supplier gets a task and the department an open point.
- [ ] RMES tab (Safety and Regulatory): criteria and findings (an open finding blocks), decision Approved or Rejected (Rejected needs a reason).
- [ ] Complete my review is refused while blockers remain; they are listed.
- [ ] Reassign works within the department.
- [ ] Sections changed since the review are marked.

### 6. RMM's own review (Katrin, My reviews)
- [ ] The workspace shows the whole CIQ; RMM can ask but has no "add section".
- [ ] An origin without rules is flagged.
- [ ] A Rejected decision makes RMM choose: Continue to final release (with a note) or Cancel the case.
- [ ] After the last completion, exactly one release-request mail is sent.

### 7. Final release (Elena)
- [ ] The questionnaire is read-only: "Your questionnaire (locked)" with the note "Your questionnaire is locked because Beiersdorf has requested your final release. If something must change, contact Beiersdorf; they can reopen the review." Every section says "Locked: Beiersdorf has requested your final release" (Thomas, 15 Oct).
- [ ] The release card is blocked, with reasons, while a question is open or a mandatory item is missing; it says the questionnaire is locked and whom to contact.
- [ ] Give final release: the case completes automatically and is frozen.
- [ ] The supplier sees its two confirmations and gets a receipt mail.
- [ ] Report a change is available.

### 8. Final document (Katrin, from the final-document mail)
- [ ] It contains:
  - [ ] the answers by section, with units;
  - [ ] the metadata answers;
  - [ ] the evidence list;
  - [ ] every open-point thread as text, round by round;
  - [ ] the confirmations, the CIQ ID and the fingerprint.
- [ ] It has no RMES content and no internal notes. The supplier never sees it.

### 9. Change the configuration (View as Nina Hoffmann, Admin)
- [ ] Rules and Questionnaire show the same bar: "Draft · Rules RS-2026.2 (1 change) · questionnaire v2 (2 changes)" with Check & publish and Discard draft, and the version history below it.
- [ ] Check & publish: "What will be published", 8 green checks, the change summary, Run the test, the change note (required). Publish: the bar says "Published: RS-2026.2 + v2 · used for new cases".
- [ ] Create new version: the dialog names the working numbers (RS-2026.3, v3); the bar says "Nothing to publish yet: the draft is the same as RS-2026.2 + v2". Check & publish shows the first check red and Publish disabled.
- [ ] Add section, code *a 4* / *A4* / *annex4*: "Annex 4 is already used by “Hydrocarbons (MOAH)” (in this draft). Choose another code." shows under the code while typing and Add section is disabled; *k6.1* names EU REACH; a free code (K6.18) enables it. Editing a section: its own code is fine, another section's is caught.
- [ ] Questionnaire → Add section K6.18 "Microplastics declaration", lead Product Safety, content Questions. The hint says it needs a rule.
- [ ] Add question: a Yes / No question (Mandatory) and a File upload (Optional). The preview shows each one as the supplier sees it. Move up / down, edit and remove work.
- [ ] Create the rule from the hint: K6.18 is already chosen. SF-03 is Yes → Mandatory, reviewed by Safety. The preview sentence reads the rule in plain words.
- [ ] The new rule and section are marked "New in draft" and listed under "Changes in draft". Edit and Delete work on any rule of the draft; Retire and Restore on any section.
- [ ] A check that fails is red, with a link that opens what to fix; Publish stays disabled until it is fixed.
- [ ] Publish with a change note: the toast names the new pair and how many running cases keep the old one.
- [ ] As Katrin, a new case starts on CIQ-2026 v3. As Elena, SF-03 = Yes opens K6.18 with both questions; the mandatory one blocks completeness until answered.
- [ ] A case started before the publish keeps its version and never shows K6.18.
- [ ] Requested documents: in a rule, "Not in the list?" → *Microplastics test report* → Add. A grey line (no warning) says the supplier gets an upload slot under "Requested documents" in K6.18 (K1 for a rule without sections); Check & publish lists it as "nothing to fix".
- [ ] As Elena (new case, SF-03 = Yes): K6.18 ends with "Requested documents": name, why it is asked (no rule id), upload, "Cannot provide? Add a justification". It blocks completeness as "(requested document)" until uploaded or justified.
- [ ] Reviewers (review workspace, case Questionnaire tab): the row shows Received / Not provided, justified / Missing and the rule; the evidence chip shows the same. The final document lists the file with uploader and date, or the justification.
- [ ] As Paul Neumann (Auditor): Rules shows the history read-only, with no buttons. Katrin has no access to Rules or Questionnaire.
- [ ] Rules only: a new draft with one rule added (e.g. SF-06 is Yes → K6.8 Mandatory). Bar: "Rules RS-2026.3 (1 change) · questionnaire stays v2". Publish: toast "Rules RS-2026.3 published with questionnaire v2 (unchanged)…"; history "RS-2026.3 + v2 · Rules only"; no v3 anywhere (Questionnaire shows v2 "Used for new cases with rules RS-2026.3"); a new case starts on RS-2026.3 + v2.
- [ ] Questionnaire only: the next draft (dialog: RS-2026.4 / v3) with one question added to Annex 1. Bar: "Questionnaire v3 (1 change) · rules stay RS-2026.3". Publish: RS-2026.3 + v3, "Questionnaire only"; no RS-2026.4; Rules says the release kept RS-2026.3. A new case starts on RS-2026.3 + v3; older cases keep their pairs.

## Features by screen

- [ ] **Case page tabs:** Overview · Questionnaire (why in scope, the N.A. list) · Open points · Documents · Internal notes · History · Final document.
- [ ] **Case Questionnaire tab:** the summary bar ("n of m sections with questions complete") and its filters with counts; the navigator (from 1280 px wide, a section picker below) keeps the chosen section in view; one section opens with Previous / Next and the browser's Back returns; each answer shows who and when; Not applicable is folded with its reasons, and a K5.1 waiver stays visible.
- [ ] **@mentions in internal notes** (Internal notes tab, review notes panel, K7/K8 note box): @ lists active Beiersdorf colleagues only (↑/↓, Enter, Escape); each person mentioned gets one mail whose link opens the note; the note shows the mention as a chip, "Mentions you" and "E-mailed …"; suppliers never see any of it.
- [ ] **RMM actions on the case page:** Open my review · Cancel (justification) · Reactivate (justification, within 12 months).
- [ ] **Cases list:** Open · Part 1 · Part 2 · Completed · Cancelled, with search (material, INCI, material no., supplier, DUNS).
- [ ] **Suppliers (maintained by the Admin only; RMM read-only):**
  - [ ] RMM: list and detail read-only, with "Maintained by the business administrator." and no Add, Edit, Deactivate or Reactivate;
  - [ ] RMM: New case has no "Add a supplier" and says "Ask the business administrator to add it in Suppliers.";
  - [ ] Admin: Add supplier (DUNS 9 digits and unique, unique e-mails, at least one contact);
  - [ ] Admin: edit;
  - [ ] Admin: deactivating a contact named on an open case needs a replacement;
  - [ ] Admin: Deactivate supplier is refused while it has open cases;
  - [ ] the "may confirm" flag.
- [ ] **Inbox:** per person, with deep links and mark as read. View as shows each person's task and unread counts.
- [ ] **Reports (Business owner, Dr. Claudia Richter):** Pipeline now, Lead time, Intake and workload, Clarifications and supplier performance (the CSV export is hidden for now).
- [ ] **Auditor (Paul Neumann):** Audit trail, where a case ID opens its History. Cases and Rules are read-only.
- [ ] **Admin (Nina Hoffmann):**
  - [ ] Rules, with Test rules and the rule editor of the draft;
  - [ ] Questionnaire, with the section and question editor of the draft (see 9 above);
  - [ ] Section owners;
  - [ ] Suppliers.

## Edge cases

- [ ] **Late metadata change in review:** SF-08 palm = Yes adds a section. The department gets an extra point. Nothing is removed.
- [ ] **A supplier change after a department completed (Thomas, 15 Oct):** e.g. Regulatory completes, Elena changes K2.1 → Regulatory's review is reopened by the system ("The supplier changed K2.1 after your review"), one mail, K2.1 marked as changed; a second change sends no second mail. An upload in K1 reopens QM and the completed co-reviewers, not Microbiology. RMM only for General information, K1 and K2.3.
- [ ] **A reviewer reopens during the release request:** the release request is withdrawn and the questionnaire is editable again; it locks again at the next request.
- [ ] **Release blocked by a cleared mandatory field.**
- [ ] **Cancel in any phase, then Reactivate.**
- [ ] **A second supplier** (added by the Admin): its contacts appear in View as and see nothing of Solvaro.
- [ ] **A contact without "may confirm":** can fill in but not confirm.
- [ ] **Report a change after the release:** RMM gets a mail and can start a pre-filled new case.
