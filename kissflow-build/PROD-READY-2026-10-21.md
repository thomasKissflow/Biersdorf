# Prod readiness, 21 Oct (status 16:45 IST; updated 22 Oct 05:30)

**Kissflow-internal.** All work below is in the dev sandbox. Nothing has touched prod.

**The overnight results are in `MORNING-2026-10-22.md`**: the A3 hardening is done, the final PDF works, and the overnight tests have run. This file stays the push and set-up checklist.

## Done and verified in dev

1. **Saves after "fill in" (the blocker): fixed, using the permission you set on CIQP Query.**
   - **What changed:** the Details section is Editable at every later step a screen writes:
     - CIQP Request "keep the CIQ up to date", "give the final release" and "view the released CIQ";
     - CIQP Query "Supplier: respond" (your change);
     - all 6 department steps of CIQ Open Point;
     - all 6 department steps of CIQ Review.
   - The Uploads table at "keep" now has its permission attached as well.
   - **Proven on the user route, as the screens write:** the supplier's save and upload at "keep", the 4 release fields at "give", a change report at "view", the supplier's answer at "respond", and the raiser's edit and close of an open point.
   - **Not proven:** the review steps, because the reviewer roles have no members (see "Before the push", item 2).
2. **Final release with e-mail and role (REQ-PROC-042).**
   - New fields Release_By_Email and Release_By_Role on CIQP Request. The portal screen writes them.
   - I-7 copies them to the case: rebuilt, 6/6 steps tested on live ZZT items, Live and ON.
3. **I-6 (review reopened) checks that the request belongs to the case:** rebuilt, 5/5 steps tested, Live and ON.
4. **Portal screen `ciq-portal-ui-8e21c189b9`, deployed to dev and read back Live.**
   - **Release-step moves:** the screen submits "keep" when Beiersdorf requested the release, and submits "give" when a review was reopened. Each move is done once, verified, and never for a cancelled or closed request.
   - **Runtime webhook URLs:** each URL is built from the parent Kissflow page's domain, the SDK's account id and the stored token. In prod, that gives the prod domain and prod account with the same tokens. If the domain can't be read, the post goes through the SDK's own route.
   - **Gates:** 595 unit tests, and the built-bundle harness at 33/33 scenarios.
5. **"Integration service" (dev):** you are back in it, so I-2 moves cases into review again (proven live). The dev app's role switch takes you out again; prod has no role switch.
6. **Prod data:** `CIQ-prod-seed-INTERNAL.xlsx`: 12 configuration rows and 9 FAQ articles, checked identical to dev. It contains the webhook tokens, so don't share it.
7. **Client test workbook:** `CIQ-UAT-test-cases.xlsx`: 44 cases with Result, Comments, Tested by and Date columns, plus a summary sheet.

## Integration run history (checked 17:00 IST, both containers)

The history (Manage → Integrations → Run history) holds 175 failed runs since 20 Oct 18:03 IST. Every failure was read with its step and error text.

- **14 × I-2 "This item has moved out of your queue."** The Approve failed because "Integration service" was empty. **Fixed:** you were re-added at about 15:40, and the move into review now works (proven twice since). In prod, the connection's user must be in that role.
- **18 × "has no final release" (I-7) and "has no answer" (I-4), last night.** The supplier's release and answer never got saved because of the save problem, so the hand-off rightly refused. **Fixed** by the permission change.
- **About 140 are the tests' own refusals, as designed:**
  - forged or unknown ids;
  - double posts (the request already exists, the completeness is already recorded, the case is already completed);
  - an old round replayed;
  - closed or not-yet-closed points;
  - cancelled requests;
  - invalid history text;
  - two racing posts.
- **No failure points to a broken integration.** Two gaps don't show as failures because those runs succeed when they shouldn't: release.requested on a cancelled case, and op.round or op.edited on a point completed without an outcome. The app session's A3 hardening closes both.
- **Prod:** when the testers start, failed runs should appear only for real refusals. Anything else, send me the run id.

## Since 16:45 (details in `MORNING-2026-10-22.md`)

- **The final dev retest:** the night chains on the user route only.
- **App session A2:** the runtime webhook URLs in the app, `ciq-app-ui-824016c9a5`, deployed by you and read back Live.
- **App session A3:** the six integration hardenings, done at 00:36.
- **The final PDF:** a Google Apps Script, proven live in dev. Set it up with `final-pdf/README.md`.

## Before the push (you, in dev, about 15–25 min)

1. **Done 22 Oct 00:36: the app session's six A3 hardenings**: opRound (you), then opEdited, opClosed, history, release and cancelled (me). Each finished exit 0 and read back Live and ON. 24 live guard checks passed, including release.requested refusing a cancelled case and the reverse-link checks. The test items are cleaned.
2. **The two dev checks before the push:** do them as `TEST-GUIDE-PROD.md` "Before the push" describes, and tell me and the app session first (your role switches would break our running tests):
   - **the portal hand-off from the deployed portal screen,** opened at the portal's own address: the most important check;
   - **the reviewer writes:** completing a review, and the Safety/Regulatory RMES decision, after one RMM load.
3. **The dev clean-up is not part of the push:** it runs after the night runner has finished and takes about 1–2 hours in the :30–:58 windows (`MORNING-2026-10-22.md` §6).

## The push and prod set-up (you)

`TEST-GUIDE-PROD.md` §0 is the step-by-step version of this list; follow it for the details.

1. **Push** both containers to prod: the app `CIQ_Digital_A00` and the portal `CIQ_Supplier_Portal_A00`.
2. **Custom UIs:** check that both components are Live with the newest bundles (app `824016c9a5`, portal `8e21c189b9`). If one ever has to be uploaded by hand: `prototype/dist-applive/ciq-app-ui-824016c9a5.zip`, and `prototype/dist-portal/ciq-portal-ui-7b4cdd7ec1.zip` (a later rebuild of the same portal code as the dev-Live `8e21c189b9`).
3. **Integrations:** open each of the 12.
   - **Connection.** In dev all 12 use one Kissflow Process connection that acts as you. Connections belong to the account, so prod probably has none. If a Kissflow Process step shows no valid connection, create one Kissflow Process connection in prod as yourself (an account admin, as in dev) and select it in every Kissflow Process step.
   - **ON.** Switch each one ON. If the builder first wants a step's Test passed, run those Tests after items 5 and 6 (a case needs the seed and a linked supplier contact), on a ZZT test case and request (a Test really writes), and switch them ON before the smoke test. The agents never touch prod, but I can give you each step's sample payload.
   - **The token check (1 minute).** The design assumes prod keeps dev's webhook tokens (only the domain and account change). Open "CIQ I-1 Case to supplier request" (app) and "CIQP Request changed to case" (portal), Trigger → Output, in prod and in dev, and compare the last segment of each webhook URL in your browser. Never paste the URLs anywhere. If they differ, tell me: the portal then needs a rebuild with the prod tokens, and the prod SET:current row needs the 8 app URLs. A wrong token shows no error on the screens (the posts are fire-and-forget), and no run appears in the run history.
4. **Roles.** Prod has no role switch: a user with several CIQ roles always works in the first one (RMM, the reviewers, Business administrator last). So each tester holds exactly one CIQ role. For your own run, hold one role at a time and reload the app after each change: Business administrator, then RMM, then each reviewer, then RMM again.
   - **Integration service:** the user the prod connection acts as (you, if you created it). It is not a screen role and can stay with you. Without it, or with the wrong user, I-2 fails with "This item has moved out of your queue".
   - **The Beiersdorf testers:** RMM, the 5 reviewer roles and Business administrator, one per user.
   - **Supplier (portal):** the client's test supplier contacts.
5. **Data:** import the configuration and the FAQs. The single-sheet files are the safest: `CIQ-prod-seed-config-version-INTERNAL.xlsx` (12 rows) into the app form CIQ Config Version, and `CIQ-prod-seed-help-article-INTERNAL.xlsx` (9 rows) into the portal form CIQP Help Article. They are the same rows as the 2nd and 3rd sheets of `CIQ-prod-seed-INTERNAL.xlsx`, whose 1st sheet, "Read me", is notes only. Every cell must stay unchanged.
6. **Test suppliers:** created in the app by the business administrator (Suppliers → Add supplier), as test case TC-01. **The app does not link portal users.** For each contact:
   1. invite its e-mail to the prod portal in the Supplier role;
   2. in the prod app, open the CIQ Supplier item in Kissflow's own form view and, in its Contacts table, set "Portal User Id" on that contact's row to the portal user's Kissflow user id (Us…), leaving the other columns unchanged;
   3. reload the app.

   New case then accepts the supplier. Without this step it refuses: "None of the active supplier contacts has a portal user yet".
7. **The final PDF:** set up the Google Apps Script with the prod values (`final-pdf/README.md`): `probe()`, then `installTrigger()`. This comes after the push, because `probe()` reads the prod case list.
8. **10-minute smoke test:**
   - case start → the request in the portal → a supplier save reaches the case → completeness → the case is in review;
   - open point → the question in the portal → the answer reaches the reviewer → close;
   - every review completed, the RMM's own included → on the RMM's next load the release request goes out by itself (there is no button) → the supplier releases → the case is completed with name, e-mail, role and time → about 10 minutes later the PDF is on the case (Kissflow's own item view, Final PDF) and in the RMM owner's mailbox.

## Known limits to tell the testers

- **Final document (PDF):** the Google Apps Script in `final-pdf/` makes it about 10 minutes after the release (up to 20, depending on its tick), and mails it to the RMM case owner (agreed 12 Oct). The custom screens don't show the PDF file; the "Final document" tab is the screen's own view. If the script isn't live yet, testers mark TC-33 step 6 "Blocked" with the comment "PDF not set up".
- **E-mails:** the mail integration and the reminder scheduler are off. The workbook's e-mail checks have been taken out of the cases, and its Read me says so. The only CIQ mail is the final PDF to the RMM owner, from the Apps Script. Kissflow's own task and due-date notifications still reach each step's assignees (supplier contacts, reviewers, the Integration service member). They are not CIQ e-mails: testers work only in the CIQ screens, never in the Kissflow task form such a notification links to, because a submit there bypasses the screens' hand-offs.
- **Not in this version** (the workbook marks these steps; the screens show "… is not available in this version yet" or simply don't do it): adding a section to the scope (TC-23), reactivating a cancelled case (TC-38), a completed department review reopening by itself when the supplier changes data (TC-17), the portal's "Your access has ended" for a deactivated contact (TC-40). Reminders are not built either; their step was taken out of TC-41. Only the RMM can reopen a review: its own RMM review.
- **Field protection:** fields shown as read-only are protected by the screens. Over the API, the section permission now allows writes, and the hand-offs refuse forged values.
- **Portal admin screen:** its "Roles & grants" links hard-code both domains. They're admin-only and harmless.
