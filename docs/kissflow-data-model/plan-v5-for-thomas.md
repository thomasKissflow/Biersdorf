# CIQ v5 build plan: items for you to validate

**Kissflow-internal.**
- **The full plan,** with every field, step id and evidence tag, is in `plan-v5-final.md` (same folder). Section numbers below (§) point there.
- **Nothing has been written to Kissflow.** Both containers were read with GET only on 14 Oct.
- **The App Builder – CIQ Digital session reviewed the six structural proposals and then the full text.** It agreed with both, with conditions and 8 corrections. All of them are folded in.

**How to answer.** Reply with the numbers you want changed, e.g. "V-17 b, V-35 no". Everything you don't mention counts as OK. Items marked **Your call** need a choice; my recommendation is given first.

**Proof levels:**
- **proven:** tested live on our sandbox.
- **documented:** in the manual or proven in another Kissflow project, not tested here.
- **to test:** a spike settles it, and the full plan names the fallback.

---

## The picture in six lines

1. **One case item on the supplier side.** The supplier works on **one portal item per case** ("the CIQ"): every answer, the live sections, the uploads and the requested documents live there. They keep it from invitation to the end.
2. **Separate items for questions and the release.** Questions go to the supplier as **one portal item per round**. The **final release is its own task**.
3. **The case and the reviews.** Inside Beiersdorf, the **case** is a backbone that waits while people work. **Each department review is its own item**, so it can start late, reopen and be reassigned. **Each open point is its own item** that stays with the raiser's department through every round.
4. **One reading copy for the Workbench.** A new **"CIQ Case Data"** record per case is what the Workbench reads: the supplier's answers copied from the portal, documents, summaries and the final document.
5. **A service moves everything between portal and app.** A small **sync service** runs every minute. It moves everything between portal and app, writes the audit trail, prepares every e-mail and makes the final PDF. It only uses Kissflow features we have proven.
6. **One mail integration.** **Every e-mail** (all 21 kinds) goes out through **one outbox and one Kissflow integration**. This is your "one generic webhook e-mail".

---

## A. The overall approach

**V-01 · Change the live objects in place; never regenerate.**
- We keep every flow id and add, rename or remove steps and fields.
- Fields can't be deleted, so obsolete ones are hidden.
- We never re-run the old App Builder apply, because it would rename the roles back.
- Proof: proven (grafts on published processes).

**V-02 · One sync service does every portal↔app hand-off. No Kissflow integrations cross containers.**
- Why: the cross-container integration features are unproven or missing:
  - the Process connector only sees its own container;
  - integrations can't loop or copy child rows.
- The service uses only proven calls.
- You approved a sync service on 7 Oct.
- Proof: proven building blocks.

**V-03 · Where the service runs.** **Your call.**
- Tonight and in dev, I run it on your Mac.
- For UAT (from 26 Oct) I recommend **AWS Lambda** with a 1-minute schedule, if Kissflow has an AWS account we may use. Otherwise **Google Apps Script** with a 1-minute trigger.
- The API key goes only into that host's secret store.

**V-04 · The service's identity.** **Your call.**
- I recommend a **dedicated Kissflow user "CIQ Integration Service"** with its own API key, a member of the Integration service role only.
- In dev the key acts as you, so the service's waiting steps sit in your own queue. That is confusing in a demo.
- It needs one user seat.

**V-05 · One rules engine everywhere.**
- The portal UI, the Workbench and the service all use the prototype's own rules code.
- So the sections in scope, the requested documents and the mail texts come out the same everywhere.

---

## B. Supplier portal

**V-06 · "CIQP Request" becomes "the CIQ": one item per case** (§3.1).
- It holds the metadata answers, all section answers (with who and when), justifications, K2.1 components, the live scope, the requested documents and the uploads.
- About 25 new fields.
- Why: since 9 Oct the supplier fills in everything in one task, and sections open and close live. Per-section items would have to be created and withdrawn constantly.

**V-07 · Two supplier steps on that item.**
- **"Fill in the CIQ":** submitting it is the completeness confirmation.
- **"Keep the CIQ up to date":** held through the review, so answers stay editable until the final release.
  - After the release (or a cancellation) the same step stays with the supplier, read-only. It carries "Report a change".
- **Your call.** I recommend this. Without it the supplier loses sight of finished requests, because Kissflow's "items I took part in" is broken platform-wide.
  - The cost: in Kissflow's own lists the item shows "in progress" forever. Our screens show the real phase.

**V-08 · One "Uploads" child table on the request for every file.** It covers answers, requested documents and files sent with a question answer.
- Each row is the field name plus the attachment, with who and when. This is your "child table with the field name and the attachments".
- Proof: **proven tonight.** The files themselves sit in one file field on the request, which keeps every upload side by side; each table row points at its file. The service can download each file and attach it to the case by API, so reviewers get a copy. Only the supplier's own upload through the custom screen is still to test (S-1).

**V-09 · "CIQP Query" stays: one item per question round** (§3.2).
- We add two fields so the supplier sees "Changed by Beiersdorf" when the raiser edits an open question.

**V-10 · "CIQP Final Release" stays as the release task** (§3.3).
- The service creates it when the last review completes, and only contacts who may confirm get it (Kissflow enforces that).
- It is withdrawn if a review reopens and created again later.

**V-11 · Stop using 5 portal flows:** CIQP Section, Completeness Confirmation, Notice, Change Request and the ZZ probe.
- Supplier access is removed; the flows stay published (the API can't delete them).
- The 8 leftover probe items are deleted.
- Archiving the flows later in the builder is your choice.

**V-12 · Rewrite the 5 Help articles for the new flow:** one task, live sections, which e-mails come.

**V-13 · The Supplier role is for external users only.**
- You leave the Supplier role before the user tests.
- **Your call:** 2 test supplier users (fictional names on your plus-addresses, e.g. thomas+elena@…), one per test supplier, so we can prove that suppliers can't see each other.

---

## C. Internal app

**V-14 · "CIQ Case" becomes a backbone with two waiting steps:** "Waiting for supplier: CIQ" and "Beiersdorf review and final release" (§4.1).
- **The phase becomes a field.**
- **Removed steps:** scope check, the completeness wait, the 6 fixed review lanes, both open-items checks, overall approval.
- **The case number** (CIQ-2026-NNNN) is proposed by the Workbench and checked for duplicates by the service. Kissflow has no unique keys.
- **Risk:** removing the 6-lane parallel block has never been tried. The app session rehearses it on a test flow first (S-12). If that fails, the block stays but is always skipped (proven).

**V-15 · Cancel and reactivate are fields plus a lock, not Kissflow's own reject or withdraw.**
- Why: Kissflow's endings are final, and a cancelled case must continue within 12 months.
- Every list and report filters on the phase field.

**V-16 · New process "CIQ Review": one item per department review, RMM included** (§4.2).
- It replaces the 6 fixed lanes, because a lane can't be reopened or join late once submitted (proven limit).
- This adds records, against your "child tables, not extra records" rule. It is the only native way to support reopen and late activation.

**V-17 · Who gets a review task.** **Your call.**
- **(a) Recommended to start:** every member of that department (a role). The Workbench shows "My reviews" by the named assignee, and any department member may act. This is how the prototype works.
  - The catch: Kissflow's own task notices and reminders go to the whole department. For the RMM review that means every RMM, not just the case owner.
- **(b) The app session's preference:** only the named assignee gets the task. This needs test S-11 first.

**V-18 · "CIQ Open Point" stays with the raiser's department from start to close** (§4.3).
- No "waiting for supplier" step and no send-back (send-back is broken over the API).
- Return or edit = a new round and a new portal question. Accept or close = the raiser submits.
- The full thread (every round and edit) is stored on the point. It feeds the open-points tab, the supplier's history and the final PDF.
- The service creates the point when a reviewer asks, so it can withdraw it on cancellation. A raised question therefore reaches the supplier about one minute later than in the prototype.

**V-19 · Who may act on an open point.** **Your call.**
- **(b) Recommended if test S-11 passes:** the step is assigned to the raiser personally, so Kissflow itself enforces "only the raiser" (AS-08).
- **(a) Otherwise:** the department role, with "only the raiser" enforced by the Workbench and re-checked by the service.

**V-20 · New form "CIQ Case Data": one row per case** (§4.4).
- **What it holds:**
  - the case summary for every list, dashboard and report;
  - the supplier's answers copied from the portal;
  - child tables Components (K2.1, searchable), Documents, **Requested documents** (your table) and Change reports;
  - summaries of reviews, open points and confirmations;
  - the final document with its seal.
- **Who writes:** only the service; everyone else reads.
- **What stays out:** RMES details, note texts and decision reasons, because every reader of the row sees every field.

**V-21 · New form "CIQ Service Request": the Workbench's command channel** (§4.13).
- A user's action creates a row ("raise this point", "cancel this case", "I completed my review").
- The service checks who asked (Kissflow's own "created by", which can't be faked) and whether that person may do it. It then acts and writes "Done" or "Refused" with the reason.

**V-22 · The audit trail ("CIQ Audit Event") is written only by the service.**
- Every person can read it; nobody can edit or delete it.
- It records each request, each supplier action seen in the portal, and each system action.

**V-23 · Supplier master ("CIQ Supplier") is edited only by the Business administrator.**
- RMM can look suppliers up but not change them.
- We add city, contact title, a row key and a deactivation date.
- Inviting a new contact as a portal user stays a manual step for you (no invite API is known).

**V-24 · Rules and questionnaire versions are rows in "CIQ Config Version"** (§11).
- **One row per rule set, one per questionnaire version, and one "release" row per pair.** A case pins its pair, and the portal item carries a copy of the pair (supplier-safe part only).
- **Single settings rows:** section owners, reminders, other settings, the RMES criteria and the test materials.
- **Seed:** RS-2026.1 + v1 as published, and RS-2026.2 + v2 as the draft (as in the prototype).

**V-25 · RMES Safety and Regulatory forms stay.**
- The service creates the row when Safety or Regulatory gets a review, and the department fills in its own.
- Every open finding blocks. The Approved/Rejected decision sits on that department's review.

**V-26 · Internal notes get two fields for @mentions;** the service sends the mention e-mails.

**V-27 · Stop using "CIQ Section", "CIQ Change Request" and the "Overall approver" role.**
- A change report becomes a row on the case data, as in the prototype: no triage steps.
- **Your call:** delete the Overall approver role, or keep it empty. I recommend deleting it; nothing uses it.

**V-28 · Lists: 5 new and 3 extended.**
- **New:** Case Phase, Track Status, Priority, Rejection Handling, Request Status.
- **Extended:** OP Kind + "Finding"; OP Outcome + "Not accepted"; Event Category + 3 values.
- Old values stay valid on old items.

---

## D. Roles and permissions

**V-29 · Apply the 11 prepared role renames** to the prototype names, e.g. "CIQ RMM" → "Raw Material Manager (RMM)" and "CIQ Reader" → "Auditor". Role ids stay.

**V-30 · The permission matrix** (§6). In short:
- nobody can delete anything;
- the audit trail is read-only for everyone;
- only the Business administrator edits suppliers and configuration;
- Safety and Regulatory edit only their own RMES form;
- reviewers act on their own steps without creating items;
- Safety's and Regulatory's internal evaluation (RMES) is visible only to that department. Everyone else sees only Approved / Rejected (this is a change: today every role can read both);
- Customs and Legal read and post notes;
- the Auditor and the Business owner read.

Whether each rule holds for a real (non-admin) user is to test with the test users (S-7).

**V-31 · Please confirm** that you renamed the default "Admin" role to "Admin / Developer" and deleted the default "User" role on purpose (between 8 and 9 Oct; not done by our scripts). Nothing in v5 needs "User".

**V-32 · Your call: 2 internal test users** (fictional names, your plus-addresses), e.g. one Safety reviewer and one RMM.
- Today you are every user, which hides permission mistakes.

---

## E. E-mails, reminders and the final document

**V-33 · One outbox form plus one integration in the app sends all 21 e-mail kinds, for both supplier and internal events.**
- **Why not a second one in the portal:** the same service writes both kinds of rows, so a second outbox adds nothing.
- **The test (S-3):** whether Kissflow's e-mail action accepts recipients from a field. If not, the integration calls an external mail webhook, or the service sends directly.
- **Your call:** OK with one, in the app?

**V-34 · Mail safety.**
- Supplier mails use only supplier-safe facts.
- Each mail has a unique key, so it is never sent twice.
- A mail not confirmed as sent within 10 minutes is retried up to 3 times, then flagged in Diagnostics.
- In a rare case (sent, but the confirmation failed) a retry can send a duplicate. We accept that rather than risk a lost mail, unless test S-3 shows we can check Kissflow's run history first.

**V-35 · Reminders and escalations come from the service, using the Reminder settings, not from Kissflow's native SLA e-mails.**
- Why: on the case's waiting steps a native SLA mail would go to the service user, not to the supplier or RMM.
- Native SLA durations are still set on the human steps (reviews, open points, supplier steps) for reporting.
- **Your call:** this departs from your rule "a Process because its steps' SLAs notify". OK?

**V-36 · SLA values:** until Beiersdorf gives its own, use the prototype's reminder defaults:
- supplier task: 7 days, escalate at 14;
- question: 5, escalate at 10;
- review: 5, escalate at 10;
- final release: 3, escalate at 7.

**V-37 · The final document at the release, with no RMM click** (§10).
- **Within a minute of the supplier's release,** the service:
  - builds the document (every answer, every question thread round by round, the confirmations; never RMES or notes);
  - computes the seal;
  - makes the PDF and attaches it to the case;
  - only then closes the case.
- **Attaching by API is proven tonight (S-2),** so the PDF goes straight onto the case. The on-screen document stays the main view.

**V-38 · Kissflow's own task e-mails to suppliers:** if they duplicate ours (test S-10), we switch them off per step in the builder.

---

## F. Things the live read found

**V-39 · Please switch off the 2 "CIQ ZZ Spike log" integrations.**
- They are ON and were re-published on 14 Oct 06:52. They only fire on test flows, but they are noise.
- Switching is builder-only.

**V-40 · Please confirm:** both containers were published on 14 Oct at 06:52 outside our scripts. Was that you? No design change was found.

**V-41 · Please check the dev account licence before tonight.** The account showed "trial ends in 5 days" on 8–9 Oct.

**V-42 · Three portal flows are not shared with the app** (Notice, Completeness Confirmation, Final Release). **No action needed:** the service doesn't rely on sharing.

**V-43 · Remove Delete rights.** 10 roles can delete audit rows today and 13 can delete notes. v5 removes all of them.

**V-44 · The production move (27 Oct on the timeline) is a separate plan** that needs your explicit approval. We never touch `beiersdorf.kissflow.eu` from these sessions.

---

## G. Spikes, build order, effort

**V-45 · About 15 minutes of your clicks tomorrow morning:**
1. **S-1:** Diagnostics buttons in the Workbench and the portal. Can a real user save, submit and upload through the custom UI?
   - This is the biggest single risk.
   - If the **supplier** can't save, it is a blocker to raise with Kissflow product the same day.
2. **S-3:** switch on the mail integration. One sample mail will arrive.
3. **S-9:** open one deep link.
4. Invite the test users (V-13, V-32).

**V-46 · Tonight's split** (after your OK):
- **Portal session (me):**
  - the portal spikes;
  - the CIQP Request and Query changes;
  - removing supplier access from the unused flows;
  - the sync service with tests (dry-run against dev);
  - the Help articles.
- **App session:**
  - its two rehearsals (S-11, S-12);
  - the lists, the CIQ Case / Open Point changes, the 3 new forms, CIQ Review, the grants, the renames and the mail integration (built off);
  - the read-back.
- **Before either of us builds:** the agreed plan goes into the shared contract `kissflow-data-model-plan.md`.

**V-47 · Effort after the backend:**
- the portal UI rework to the one-item model: about 2 days;
- the Workbench rework to the prototype's internal screens: about 4–5 days, the largest item.

Both reuse the prototype's screens and code. This fits "backend by 16 Oct, app complete by 26 Oct".

**V-48 · Every write is read back,** every spike has a fallback, and nothing is written to production.

---

## H. Open points carried over from the prototype

**V-49 · Section owners are not versioned:** a changed lead department applies to running cases from then on (G-04). OK?

**V-50 · Rule basis labels:** "Requirements document" / "Agreed with Beiersdorf" / "Not in the requirements" / "Open question". A new rule defaults to "Agreed with Beiersdorf" (G-05). OK?

**V-51 · Origins without rules** (waste, CCU, chemical recycling) move from code into a settings row, so the Business administrator could change them later (G-06). OK?

**V-52 · Default reviewer per department:** who gets a new review by name.
- **Your call:** I recommend a "default reviewer" per department on the Section owners page. If none is set, the first member of the role gets it.

**V-53 · Who reads the RMES evaluations.** **Your call.**
- Today's plan: Safety reads only Safety's and Regulatory only Regulatory's; nobody else reads either.
- Should Safety and Regulatory read each other's? The requirement's example "Regulatory can read Safety assessments" is ambiguous.
- Should the Auditor read both?
- I recommend: each department reads only its own, and the Auditor reads both, for audits.
