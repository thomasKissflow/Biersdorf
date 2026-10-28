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

## Before the push (you)

1. **Done 22 Oct 00:36: the app session's six A3 hardenings**: opRound (you), then opEdited, opClosed, history, release and cancelled (me). Each finished exit 0 and read back Live and ON. 24 live guard checks passed, including release.requested refusing a cancelled case and the reverse-link checks. The test items are cleaned.
2. **Review completion:** in the dev app, switch to a reviewer role and complete one review. Then put yourself back in "Integration service", or tell me and I'll do it.
3. **Clean-up:**
   - **Done 20:44:** my 117 ZZT-NT test items in dev are deleted, each read back 404. Only ZZT-NT-G2's case (PkEPFTpqmiR5) and request (PkEPFU4Y3R_p) are kept, for the live portal hand-off check; I delete them after it.
   - **Still to run:** the app session's R1 items need its command.

## The push and prod set-up (you)

1. **Push** both containers to prod: the app `CIQ_Digital_A00` and the portal `CIQ_Supplier_Portal_A00`.
2. **Custom UIs:** check that both components are Live with the newest bundles (portal `8e21c189b9`; the app's from the app session).
3. **Integrations:** open each of the 12. Check that its connection (the Kissflow Process connector) is valid and that it is switched ON. If one is off and the builder wants its steps tested, tell me; we test on a prod test item.
4. **Roles:**
   - **Integration service:** the connection's user, ideally a technical user who never uses the screens.
   - **The Beiersdorf testers:** RMM, the 5 reviewer roles and Business administrator.
   - **Supplier (portal):** the client's test supplier contacts.
5. **Data:** import `CIQ-prod-seed-INTERNAL.xlsx`:
   - sheet 1 into CIQ Config Version (app);
   - sheet 2 into CIQP Help Article (portal).
6. **Test suppliers:** created in the app by the business administrator (Suppliers → Add supplier), as test case TC-01.
7. **10-minute smoke test:**
   - case start → the request in the portal → a supplier save reaches the case → completeness → the case is in review;
   - open point → the question in the portal → the answer reaches the reviewer → close;
   - release requested → the supplier releases → the case is completed with name, e-mail, role and time.

## Known limits to tell the testers

- **Final document (PDF):** the Google Apps Script in `final-pdf/` makes it about 5 minutes after the release (agreed 12 Oct). Set it up before the testers release a case. If it isn't live yet, mark TC-33's PDF check "not in scope".
- **E-mails:** the mail integration and the reminder scheduler are off, so the e-mail and reminder parts of TC-43 are not in scope. The only mail is the final PDF to the RMM owner, from the Apps Script.
- **Field protection:** fields shown as read-only are protected by the screens. Over the API, the section permission now allows writes, and the hand-offs refuse forged values.
- **Portal admin screen:** its "Roles & grants" links hard-code both domains. They're admin-only and harmless.
