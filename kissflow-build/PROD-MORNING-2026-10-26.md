# Prod, Monday morning: what to do before and during your first test

**Kissflow-internal.** These are the steps on top of `TEST-GUIDE-PROD.md`, for everything that changed in dev after your 22 Oct push. Where the guide and this page differ, follow this page.

## A. Push dev → prod (both containers)

> **30 Oct, newest builds for prod: upload by hand, no push.**
> - App `ciq-app-ui-3505acb598` and portal `ciq-portal-ui-ffe2f7c93c` (Live in dev since 29 Oct, 22:32Z; commit d72fed9). On top of the 29 Oct prod builds (app `37086b7a6d`, portal `e81db49778`) they add documents Mandatory/Optional and the phone and PWA layout (desktop unchanged from 1024 px). Zips: `optimise-2026-10-26/rollback-zips/phone-2026-10-30/`.
> - **No Kissflow change in prod for either:** no field, form, step, permission, integration or configuration row. Upload the two zips into the existing Custom UI components: portal first, then app. A dev → prod push is not needed: it would point every integration step at dev's connections again (B1) and could disturb the final-PDF integrations you built in prod.
> - **In the same sitting, paste the rebuilt `Bundle.gs`** (item 9).
> - **Then:** every open tab does a full reload, above all a Business administrator's configuration editor, because an old editor tab drops the new document settings when it saves. Nobody publishes "Upload required? Mandatory" or an optional document before all three steps are done.
> - **Rollback:** `rollback-zips/final-pdf-2026-10-29/` (app `37086b7a6d`, portal `e81db49778`). Keep the new `Bundle.gs` even then: it reads the new settings only when they are present.

Push the app `CIQ_Digital_A00` and the portal `CIQ_Supplier_Portal_A00`. The push must carry:
- **The custom screens:**
  - app `ciq-app-ui-cfd65e5766` (Live in dev since 29 Oct, 05:47 IST): **the RMES as BDF's 8 fields** (read-only sheet for Safety and Regulatory, filled from the CIQ; no criteria or findings; the decision on the Questionnaire tab; the record's time from its history row, as Kissflow's list rows carry none), on top of the matrix v0.6 fixes (`MATRIX-v0.6-ASSUMPTIONS-2026-10-28.md`) and everything before (PDF design, Full screen, case cascade delete, Rules without Basis). Zip: `optimise-2026-10-26/rollback-zips/rmes-2026-10-29/ciq-app-ui-cfd65e5766.zip`. Rollback: `rollback-zips/rmes-2026-10-29/ciq-app-ui-c8447c06da.zip` (the RMES without the record-time fix) or `rollback-zips/before-rmes/ciq-app-ui-87002b74ba.zip` (the matrix fixes without the RMES change).
  - portal `ciq-portal-ui-233cc982e5` (Live in dev since 29 Oct, 02:48 IST): the same build. For the supplier nothing changes, except that the bundle no longer holds any RMES text. Zip: `optimise-2026-10-26/rollback-zips/rmes-2026-10-29/ciq-portal-ui-233cc982e5.zip`. Rollback: `rollback-zips/before-rmes/ciq-portal-ui-b88be34e73.zip`.
  - **The RMES change needs no Kissflow change in prod:** no field, form, step, permission or configuration row changed. The RMES forms keep their old criteria and findings tables, which are no longer used, and `RMES:current` stays as it is (obsolete).
  - The guide still names older bundles. Use these.
  - **Rollback:** app `rollback-zips/cascade-delete-2026-10-26/ciq-app-ui-46b3e1fb4a.zip` (before the call changes), `rollback-zips/supplier-fixes-2026-10-26/ciq-app-ui-50bcb6ac79.zip` (before the cascade delete), `rollback-zips/config-editor-2026-10-26/ciq-app-ui-780f6539bc.zip` (before the supplier fixes), `rollback-zips/console-2026-10-26/ciq-app-ui-071d9735d2.zip` (console only), `rollback-zips/live-2026-10-26/ciq-app-ui-e2189ee265.zip` (optimisation only), or `rollback-zips/ciq-app-ui-a3c14d721f.zip` (before the optimisation).
- **The new fields:**
  - `Review_Depts` on CIQP Request and CIQ Case;
  - `Raised_By_Email` on CIQ Open Point and CIQP Query.
  - Without them, a raise fails its read-back, and the reviews never start.
- **The integrations, 13 in total plus the two mail integrations:**
  - **App:** I-1, op.round, op.edited, op.closed, release.requested, review.reopened (I-6), history.updated, case.cancelled, **E-B "CIQ Review completed – final release when all done"** (new), and **"Mail Integration - Thomas"**.
  - **Portal:** request.changed, completeness.confirmed (I-2), query.answered, final release (I-7), and **"Mail Integration - Thomas"**.

## B. Set-up in prod after the push (about 30 min)

1. **Connections: every Kissflow step of every integration must be reconnected in prod.** A connection belongs to one account. After the push, the steps still point to **dev's** connections, and a run fails with "Could not find the item … collection IntegrationConnection" (seen in prod on I-1, 26 Oct).
   - **Since 26 Oct, 15:40 IST, dev uses only your access-key connections,** no "CIQ ZZ Spike" connection. After the next push, every step to remap shows one of these:
     - app: "Kissflow Process - Thomas Access Keys - Trigger", "Kissflow Dataform - Thomas Access Keys";
     - portal: "Kissflow Process - Thomas Access Keys", "Kissflow Dataform - Thomas's Access Keys", "User Details - Thomas Access Keys".
   - **Since 27 Oct, dev splits connections by container:** in the app integrations, every step on a portal process (CIQP Request, CIQP Query) uses "Kissflow Process - For Portal Actions"; in the portal integrations, the steps on app processes are to use "Kissflow Process - For App Actions". Remap these to their prod counterparts.
   - **Create in prod, as the service account:** one "Kissflow Process" connection, one "Kissflow Dataform" connection and one "User Details" connection.
   - **Then in each integration below:** open every step that shows a connection, select the prod one, save, publish and switch ON. Counts are from dev, 26 Oct; prod has the same after the push.

   | Container | Integration | Steps to reconnect |
   |---|---|---|
   | App | CIQ I-1 Case to supplier request | 4 Process |
   | App | CIQ op.round Open point question to supplier | 4 Process |
   | App | CIQ op.edited Open point question edited | 3 Process |
   | App | CIQ op.closed Open point closed | 3 Process |
   | App | CIQ release.requested Final release requested | 4 Process |
   | App | CIQ Review reopened to supplier request (I-6) | 4 Process (one of them is the trigger) |
   | App | CIQ history.updated Questions history to supplier | 3 Process |
   | App | CIQ case.cancelled Case cancelled | 3 Process |
   | App | CIQ Review completed – final release when all done (E-B) | 7 Process (incl. the trigger), 1 Dataform |
   | Portal | CIQP Request changed to case | 3 Process, 1 User Details |
   | Portal | CIQP Completeness confirmed to case (I-2) | 6 Process, 1 Dataform |
   | Portal | CIQP Query answered to open point | 3 Process |
   | Portal | CIQP Final release to case (I-7) | 4 Process |

   The two "Mail Integration - Thomas" integrations have no connection step. Leave the legacy ones that are OFF in dev OFF: Test, Mail – send outbox mail, Z1, Z2, Communicate to App - Thomas Test.
2. **I-2's step order.** Open "CIQP Completeness confirmed to case". The last step must be **"I2 create reviews"**, after "Approve an item".
   - If the push kept the old order, drag it to the end and publish.
   - Why: in a real run the bulk create times out after 150 s, after it has created the reviews, and stops every step after it.
   - I-2's runs show "Failed" for that reason; the case still moves and the reviews are still created.
3. **Switch every integration ON** in both containers, and check that each one is Live.
4. **Integration service (app role).** Its member must be the user the prod connections act as (the service account). Without it, cases never move into review.
5. **Reviewer role ids.** request.changed's first new Run JavaScript step (the mail plan, code from `rc-mail-plan.js`) holds the dev ids of the five reviewer roles:
   - REG RoEKl84Hca4w, SAF RoEKl84xAFRW, QM RoEKl85WB1yE, MIC RoEKl8647K2u, SUS RoEKl86bQQrO.
   - If the prod role ids differ, replace them in that script and publish. Otherwise the "data changed" mail reaches no reviewer.
6. **Data.**
   - **Configuration (rebuilt 28 Oct for the matrix fixes):** delete the 12 old CIQ Config Version rows in prod, then run `prod-seed-postman/CIQ-prod-seed-config-version.postman_collection.json` (its README). The same rows are in `CIQ-prod-seed-config-version-INTERNAL.xlsx`. Only `SET:current` is unchanged. Start new test cases after the import; older cases keep their old configuration.
   - `CIQ-prod-seed-help-article-INTERNAL.xlsx` (9 rows), if not imported yet. The guide, §0 step 5, has the details.
   - **Client testers:** give them the updated `CIQ-UAT-test-cases.xlsx` (31 tests since 29 Oct; TC-05 and TC-31 updated on 30 Oct for the new builds).
7. **Users and roles.**
   - One CIQ role per tester.
   - Supplier test contacts in the portal Supplier role, each linked by Portal User Id on the CIQ Supplier contacts table before the first case (guide §0 step 6).
8. **Notifications:** your native Kissflow notifications, if they didn't travel with the push.
9. **Final PDF:** event mode, set up by you in prod on 29 Oct (`final-pdf/README.md` "Event mode: prod set-up"). The app's own "Download PDF" button on the Final document tab works without it.
   - **30 Oct:** with the upload of app `3505acb598`, paste the rebuilt `Bundle.gs` (build `eff9ac4776345e16`, SHA-256 `a19dee82…4b5d`; it has the 29 Oct documents Mandatory/Optional change) as in the README's "Update the bundle (prod already set up)": the existing project and the existing `Bundle` file, then a new version of the existing deployment. Never a new project or a new deployment: either gives a new `/exec` URL and integration 1 stops reaching the script. There is no `installTrigger()` any more.
   - **Check:** `probe()` shows `bundle` `eff9ac4776345e16`; after one release, Executions shows `case done`.
   - **Where to check the PDF:** the app's data console (CIQ Case drawer), not Kissflow's own item view.
10. **Documents:** run `python3 night-2026-10-21/docs-for-app-fe-cleanup.py --apply` from `kissflow-build/` (the client workbook and the guide's FE texts).

## C. Your first test: one case, start to finish (about 30 min)

This is the guide's §1 main run, with three rows that now work differently:
- **Row 6 (reviews):** the reviews are created by I-2 within about 15–30 s of the supplier's confirmation. The RMM doesn't need to open anything. Reload the case: phase "Review", with RMM plus the departments the supplier's answers named. If nothing appears, look at I-2's run history (portal). "Failed" on the step "I2 create reviews" alone is expected.
- **Row 12 (release request):** there's no RMM load step any more. When the **last** review completes, E-B sends the release request by itself within about 15–30 s. If nothing happens, look at E-B's run history (app). A run that ends "NO RELEASE (by design): still open: …" is correct while a review is still open.
- **Row 16 (PDF):** the Apps Script, or the "Download PDF" button on the Final document tab.

The four-step check that proves the chain:
1. RMM creates the case, and the request appears in the portal (I-1).
2. The supplier confirms completeness, and the case is in Review with its reviews (I-2).
3. All reviews are completed, and the request shows "Final release needed" (E-B).
4. The supplier gives the release, and the case is Completed (I-7).

The same chain passed 26/26 in dev on 25 Oct (ZZT-E2E-25B).

## D. Dev, when you have a minute

- Remove yourself from "Raw Material Manager (RMM)" and "Sustainability reviewer" in dev. My API removal didn't take.
- The ZZT clean-up list is in `HANDOVER-2026-10-26.md` (25 Oct section).
- The load-time optimisation is **deployed to dev** (26 Oct, 11:30 IST, on your request): see `OPTIMISATION-2026-10-26.md`.
