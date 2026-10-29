# How to test CIQ end to end in production (Thomas, 22 Oct)

**Kissflow-internal.** This is your own walkthrough: a short check in dev, then the push and the prod test. For the client testers, use `CIQ-UAT-test-cases.xlsx` (44 cases, with Result and Comments columns). This guide follows the same journey and adds where to look when something doesn't arrive.

## Before the push, in dev (15–25 min)

**First, tell me and the app session that you're starting.** Both test runners may still be writing in dev: my night chains and the app session's R4. These checks switch your roles, and every switch matters:
- **Out of "Integration service":** your first app role switch, already the one to RMM, takes you out of it. Every case the runners move into review meanwhile then fails I-2, and that can't be re-posted.
- **Out of "Portal admin":** a portal role switch takes you out of it.

So we pause, you do the checks, put yourself back in both roles, and tell us to go on. Both runners wait while a pause file exists, so you can also pause them yourself, from the Beiersdorf folder:

```bash
touch kissflow-build/night-2026-10-21/HOLD kissflow-build/ciq-digital/tests-2026-10-21/HOLD
```

When you're back in "Integration service" and "Portal admin", delete both files:

```bash
rm kissflow-build/night-2026-10-21/HOLD kissflow-build/ciq-digital/tests-2026-10-21/HOLD
```

Tell us either way: a test that started before the file existed may need stopping by hand. Your RMM load also starts reviews on every case then in review, our test cases included. That's fine; we just need to know.

1. **The portal hand-off from the deployed portal screen (5 min; the most important check).**
   - **Why it matters:** the portal screen sends its four hand-offs to the Kissflow host around it. For a supplier that is the portal's own domain. Nothing has proven yet that Kissflow takes a webhook there. If it doesn't, the post fails silently (fire-and-forget) and none of the four portal hand-offs arrives, in dev or in prod.
   - **Why I didn't do it:** it needs a portal sign-in, and my one direct post on that domain was blocked as sending the token to another host.
   - **Where to open the portal:** at its own address, `https://ciq-supplier-portal-beiersdorf.kissflow.eu/portal/application/CIQ_Supplier_Portal_A00/ui` (the address you used on 8 Oct), signed in as yourself. Don't open it from inside `dev-beiersdorf.kissflow.eu`. There the screen posts to dev-beiersdorf, which is already proven, so the check says nothing.
   - **What you'll see:** you hold the portal Admin role, so it opens on the admin console. Pick "Supplier" in the top bar's "Role:" switch. That is a real switch: switch back to "Portal admin" afterwards. Your own user is the portal contact of ZZT-NT-G2-FILLED; the e-mail on its screens is fictional. My requests lists every night ZZT request, each with the warning "… the pinned rule set is incomplete …". That's expected: the test cases carry a fictional questionnaire.
   - **Do:** open ZZT-NT-G2-FILLED, change one answer and leave the field. It saves by itself ("Saving…", then "Updated …"); there is no Save button.
   - **Pass:** within a minute, the portal's Manage → Integrations → Run history shows a run of "CIQP Request changed to case". Passed or refused, either way the post reached Kissflow on that domain.
   - **If no run appears:** stop before the push and tell me. The fix is a portal rebuild that posts the hand-offs elsewhere, which then needs your deploy.
2. **The reviewer writes (10 min).** These were never proven on the user route: completing a review, and for Safety and Regulatory also their decision.
   1. **Start the reviews:** load the dev app once as RMM ("Role:" in the top bar). That load starts the missing reviews of every case in review. In dev that is every ZZT case in review, not only this one, and the clean-up list doesn't include them.
   2. **Pick a review:** open ZZT-NT2-STAGE3-IN-REVIEW. Its Overview → "Reviews" card lists the reviews the load started. Pick one department, preferably Product Safety, since it also tests the Safety decision and the RMES tab.
   3. **Complete it:** switch to that reviewer role and open the case from My reviews. For Safety or Regulatory, check the RMES tab (the 8 fields read from the CIQ, nothing to fill in since 29 Oct), then record the decision on the Questionnaire tab ("Safety decision" / "Regulatory decision", right column). Then click "Complete my review" and check that it reads Completed.
   4. **Restore your roles:** switch back to Business administrator, and add yourself to "Integration service" again. That role is not in the switch. Use the app's role settings in Kissflow, run `node kissflow-build/night-2026-10-20/integrations/role-integration-service-add.mjs` from the Beiersdorf folder (it adds you, keeps the other members and prints "verified: …"), or tell me to run it.
   5. **If it fails,** we fix it in dev before the push.

## 0. Before you start (once, about 1–1½ hours)

1. **Push dev → prod:** both containers, the app `CIQ_Digital_A00` and the portal `CIQ_Supplier_Portal_A00`.
   - **Custom screens.** Both components must be Live with the latest bundles: app `ciq-app-ui-824016c9a5`, portal `ciq-portal-ui-8e21c189b9`.
   - If a component has to be uploaded by hand in prod: app `prototype/dist-applive/ciq-app-ui-824016c9a5.zip`; portal `prototype/dist-portal/ciq-portal-ui-7b4cdd7ec1.zip` (a later rebuild of the same portal code as the dev-Live `8e21c189b9`).
   - Both build their webhook URLs at runtime from the prod domain and the prod account, with the dev tokens. The portal's tokens are in its bundle; the app's come from SET:current, which step 5 imports. So nothing has to be edited for prod, as long as the tokens match (step 4 checks that).
   - Prod has no Diagnostics menu (it is in the dev top bar only; a link appears only in the "… could not be read in full" banner). Check the hand-offs through the main run and Manage → Integrations → Run history: main-run step 2 (I-1's run history) proves the app's URLs work.
2. **Users and roles.** Prod has no role switcher. A user with several CIQ roles always works in the first one, in the order RMM, Regulatory, Safety, QM, Microbiology, Sustainability, …, Business administrator. So give each tester exactly one CIQ role. Or hold one CIQ role at a time yourself and reload the app after each change: Business administrator to create the supplier (step 6), then RMM to start the case, then each department reviewer role in turn, then RMM again.
   - **Integration service (app):** not a screen role. Its member must be the user the prod connection acts as (you, if you created it in step 3). It stays with you, whatever CIQ role you hold. Without it, cases never move into review. A technical user only if that user created the connection and has admin rights on CIQ Case, CIQ Open Point, CIQP Request and CIQP Query; otherwise completeness.confirmed fails with "This item has moved out of your queue".
   - **Raw Material Manager (RMM):** starts cases and completes the RMM review. The release request then goes out by itself.
   - **The five reviewer roles:** Regulatory Affairs reviewer, Product Safety reviewer, Quality Management reviewer, Microbiology reviewer, Sustainability reviewer.
   - **Business administrator:** configuration and suppliers. An RMM who is also administrator works as RMM and sees no "Add supplier".
   - **Portal role Supplier:** the supplier test contacts. Use real external test accounts, not Beiersdorf users.
3. **Integrations.** Open Manage → Integrations in BOTH containers. There are 12 hand-offs:
   - app: I-1, op.round, op.edited, op.closed, release.requested, review.reopened, history.updated, case.cancelled;
   - portal: request.changed, completeness.confirmed, query.answered, final release.

   For each, check that its **connection** is valid and that it is **switched on**. If a Kissflow Process step has no valid connection, create one Kissflow Process connection in prod as yourself (an account admin, as in dev) and select it in every Kissflow Process step. If the builder then wants step tests before ON, run them after steps 5 and 6 (a case needs the seed and a linked supplier contact), on a ZZT test case and request: they really write. Switch them ON before the main run. The agents never touch prod, but I can give you each sample payload.
4. **The token check (1 min).** Open "CIQ I-1 Case to supplier request" (app) and "CIQP Request changed to case" (portal) in prod, Trigger → Output. Compare the last segment of each webhook URL with the same integration in dev, in your browser only. Never paste the URLs anywhere. If they differ, stop and tell me (without the URLs): the portal then needs a rebuild with the prod tokens, and the prod SET:current needs the 8 app URLs in Payload_JSON.webhooks (Content_Hash recomputed).
5. **Data.** Import the two single-sheet files, each ready to import:
   - `CIQ-prod-seed-config-version-INTERNAL.xlsx` (12 rows) into the app form CIQ Config Version;
   - `CIQ-prod-seed-help-article-INTERNAL.xlsx` (9 rows) into the portal form CIQP Help Article.

   Expect 12 and 9 new items; the config items include Config Key SET:current. Every text cell must arrive unchanged: the app checks the JSON and the hashes, and the biggest cell is about 25,200 characters. If the import refuses or cuts a cell, stop and tell me: I give you a small script that creates the rows over REST with a prod key you enter yourself. The FAQ rows are the portal's live FAQ text: two dev rows were corrected (a typo in row 1's title; row 9 now says the questionnaire locks when the release is requested).

   `CIQ-prod-seed-INTERNAL.xlsx` holds the same data. If you use it: sheet 1 is "Read me" and is not imported; sheet 2 "CIQ Config Version" goes into CIQ Config Version, sheet 3 "CIQP Help Article" into CIQP Help Article.
6. **The test supplier and its portal users.** As business administrator, create the test supplier and its contacts (Suppliers → Add supplier; test case TC-01).
   - The screen can't link a contact to its portal user. For each contact: (a) invite its e-mail to the prod portal in the Supplier role; (b) open the CIQ Supplier item in Kissflow's own form view and, in the Contacts table, enter that contact's "Portal User Id": the Kissflow user id of its prod Supplier-role portal user. Leave the other columns unchanged; (c) reload the app.
   - Without it, New case refuses: "None of the active supplier contacts has a portal user yet…".
   - **Link every contact before the first case starts.** A contact linked after a case has started never gets that case's request (only its later questions), because the hand-off that updates a request's contacts isn't built (backlog A-8).
7. **Final PDF.** Set up the Google Apps Script (`kissflow-build/final-pdf/README.md`): paste the files, fill in the Script Properties with the prod values, run `probe()`, then `installTrigger()`.
   - Run it once prod carries app `ciq-app-ui-cfd65e5766` (`PROD-MORNING-2026-10-26.md` A): `Bundle.gs` (build `c588c2189401d76c`) comes from the same tree. `probe()` must show that build.
   - Prod has had test cases since the 22 Oct push, so `probe()` shows real rows.
   - Run `installTrigger()` at least 20 min before the main run's final release: the trigger files only cases released after the install, measured by the supplier's screen clock. If you rehearsed in dev in the same project, also wait 30 min after that `runOnce`.

## 1. The main run: one case from start to finished PDF (about 30 min)

Keep one browser window or profile per user: the RMM, each reviewer, and the portal as the supplier contact (a private window, so the sign-ins stay separate). If you hold one CIQ role at a time, change the role and reload the app whenever the "Who" changes.

| # | Who / where | Do | You should see | If not, look at |
|---|---|---|---|---|
| 1 | RMM · app · New case | Create a case for the test supplier (2 contacts, markets, due date) | The case page, phase "Supplier filling in the CIQ" | Refused with "None of the active supplier contacts has a portal user yet…": §0 step 6 |
| 2 | Supplier · portal | Open My requests | The new request, pre-filled and assigned | Run history of **I-1** (app) |
| 3 | Supplier · portal | Answer a few questions, add a component, upload a document, let it save (no Save button), then reload | Answers and file kept after the reload | — |
| 4 | RMM · app · the case | Open the case | The supplier's answers and the document are visible | Run history of **request.changed** (portal) |
| 5 | Supplier · portal | Confirm completeness and submit | The request shows "Beiersdorf is reviewing"; answers stay editable until the final release is requested | — |
| 6 | RMM · app | Reload the case | Phase "Review"; the department reviews are started | **completeness.confirmed** (portal); "Integration service" holds the user the prod connection acts as (§0 step 2) |
| 7 | Reviewer · app · My reviews | Raise an open point (a question) to the supplier | The point under My open points | — |
| 8 | Supplier · portal | Open the question ("Your answer needed"), answer it, send | The question shows "With Beiersdorf" | **op.round** (app) |
| 9 | Reviewer · app | Open the point | The supplier's answer; progress "In progress" | **query.answered** (portal) |
| 10a | Reviewer · app | "Return to supplier" with a reason (round 2) | Round 2 in the portal: the question shows "More information needed" | **op.round** (app) |
| 10b | Supplier · portal | Answer round 2, send | The question shows "With Beiersdorf" | **query.answered** (portal) |
| 10c | Reviewer · app | "Accept" the answer | The point is closed; in the portal the question shows "Closed" | **history.updated** (app) |
| 11 | Each department reviewer, then the RMM (My reviews → the RMM review) · app | Complete the review ("Complete my review"; for Safety and Regulatory, also their decision, on the Questionnaire tab) | All reviews completed, the RMM's own included | — |
| 12 | RMM · app | Reload the app after the last review is completed. There is no button: the release request goes out by itself on the RMM's load | Phase "Awaiting final release"; case history "All reviews completed" ("… One request for the final release sent to the supplier.") | Every latest-round review reads Completed, the RMM's own included, and every department the case's scope activates has its review |
| 13 | Supplier · portal | Open the request | "Final release needed" and the action "Give the final release" (name, e-mail, role recorded) | **release.requested** (app) |
| 14 | Supplier · portal | Give the final release | The request shows "Completed"; the supplier can still view it and "Report a change" | — |
| 15 | RMM · app | Reload the case | Phase "Completed"; the confirmations show the releaser's name, e-mail, role and time | **final release (I-7)** (portal) |
| 16 | — · app (the case's History; the data console), portal, mailbox | 2–3 min after step 15 (event mode since 29 Oct: integration 1 on case completion → Apps Script → integration 2) | The case's History shows "Generated final document". The case's Final PDF (the internal PDF) is in the app's data console (Admin or Developer role: CIQ Case, the case's drawer), with Final Document Hash and Final Document At; Kissflow's own item view shows only the "navigate to the CIQ App" message. The supplier's released request shows a "Final document" card with "Download final PDF": the supplier-safe copy, no Beiersdorf names or e-mail addresses. The RMM role's members get the e-mail "<Case_Code>: final document ready" with the PDF attached | Apps Script Executions page (`doPost queued`, then `drain` … `case done`); the run history of both integrations (`final-pdf/README.md`, "Event mode: prod set-up" step 7) |
| 17 | Supplier · portal | "Report a change" on the released request | — | — |
| 18 | RMM · app | Reload the case | The change report on the case | request.changed |

## 2. Short side runs (10 min each)

- **Reopen:** after step 12 (the release request has gone out), the RMM reopens its own review: My reviews → the RMM review → "Reopen my review", give a reason, then "Reopen and withdraw the release request". The supplier's request goes back to "Beiersdorf is reviewing" and is editable again (**review.reopened**). The RMM completes its review again; the release request goes out again on the RMM's next load. Finish as in 13–15. A department reviewer can't reopen a review in this version ("Ask RMM: only RMM can restart a review in this version.").
- **Edit a question:** while a question is unanswered, the reviewer clicks "Edit" on it and changes the text. The supplier sees the new text, marked "Changed by Beiersdorf" (**op.edited**).
- **Withdraw a question:** while a question is still unanswered, the reviewer clicks "Close" on it, gives an internal reason and clicks "Close the point". The portal shows it as "Closed, no answer needed" and it leaves the supplier's open list (**op.closed**). On an answered question, "Close, no longer needed" closes it too, but sends only history.updated.
- **Cancel a case:** RMM cancels a case ("Cancel case") while the supplier is filling in. The portal request shows "Withdrawn by Beiersdorf" ("Beiersdorf has withdrawn this request") and is read-only (**case.cancelled**). Nothing the supplier does afterwards reaches the case; the run history shows refusals, as designed.

## 3. When something doesn't arrive

Prod has no Diagnostics menu. Check the hand-offs through the main run and Manage → Integrations → Run history. If an app message says "Diagnostics lists it", look in Run history instead.

1. Open **Manage → Integrations → Run history** in the container that SENDS the hand-off (see the table), filtered to today.
   - **No run at all, app hand-off:** the screen didn't send it, or sent it to a token prod doesn't have. Check that SET:current was imported (§0 step 5; without it, the message after each save ends "Beiersdorf's system will pass this on.": the hand-off stays pending, and only its CIQ Audit Event row records that), that the integration is ON, and that its token matches dev (§0 step 4).
   - **No run at all, portal hand-off:** when the post could not go out, the supplier's screen says it "has not reached Beiersdorf yet". A wrong token shows no message on either screen (the posts are fire-and-forget): check the token (§0 step 4) and that the integration is ON.
   - **A run marked Failed:** open it. The failed step's message says why, in plain words.
2. **Refusals you will see on purpose.** These are guards, not faults:
   - "already has …" (a double post);
   - "is not waiting for its final release";
   - "was cancelled";
   - "waits on …, not …" (an old answer);
   - "is still open: its query stays".
3. **"This item has moved out of your queue" on completeness.confirmed:** the "Integration service" role has no member, or not the user the prod connection acts as (§0 step 2).
4. **A screen says it can't save after the first step:** a step permission is missing. The Details section must be Editable at that step; we fixed this in dev on 21 Oct, and it comes with the push.
5. **Anything else:** send me the run id, or the screen's message and the time.

## 4. What is not in this test

- **The four optional hand-offs** (change.received, case.reactivated, scope.extended, case.contacts) aren't built. The app doesn't send them.
- **Not in this version.** The live build shows a warning "… is not available in this version yet", or simply doesn't do it:
  - adding a section to the scope;
  - reactivating a cancelled case;
  - a completed department review reopening by itself when the supplier changes data;
  - the portal's "Your access has ended" for a deactivated contact;
  - reminders and CIQ e-mails.

  Only the RMM can reopen a review: its own RMM review.
- **E-mails.** No CIQ e-mails or reminders are built. The only CIQ e-mail is the final document to the RMM case owner, sent by the final-document service (the Apps Script) about 10 minutes after the release, up to 20 depending on its set-up. The script also mails its alerts to ADMIN_EMAIL, if set. Where a screen text says someone "gets an e-mail", no mail goes out in this version. Kissflow itself still sends its standard task and due-date notifications to step assignees (supplier contacts, reviewers, the Integration service member). Work only in the CIQ screens, never in the Kissflow task form such a notification links to.
- **Field protection:** the screens protect read-only fields. Over the API, the section permission allows writes, and the hand-offs refuse forged values.
