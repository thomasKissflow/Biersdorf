# App-container integrations built by the app session (20 Oct)

**Kissflow-internal.**

**Split** with the portal session, agreed 20 Oct:
- **Portal session:** I-1, I-3 and I-6, plus the portal-container ones (I-2, I-4, I-7, request.changed).
- **App session:** the list below.

**Sources:**
- `docs/kissflow-data-model/plan-v6-native.md` §4 and §4.1;
- the payload types in `prototype/src/app-live/shared/handoff.ts` (HandoffPayloads);
- the screens' `handoff()` in `prototype/src/app-live/write/handoff.ts`.

**Platform facts from the portal session's pilot** (proven live 20 Oct):
- **Connection:** Kissflow Process connector 3.7.6 (`ComaBsL8ZTSMM`), connection `CnEKHrHqXRKB`. Kissflow minted its system key; it acts as Thomas. For Dataform: `CnEKHrH5GzkY`. We never create a connection that holds a key.
- **"Create and submit a new item"** (`CreateAndSubmitItem`) works on a PORTAL process. It answers `{Id}`, which a later step maps as `context.<actionId>.Id`.
- **"Update an item"** (`UpdateAnItem`) is an admin update across containers, and it writes fields that are ReadOnly at the current step.
- **Webhook trigger:** "Webhooks by Kissflow", `WebhookTrigger`. Field paths are `context.<triggerId>.<payload key>`, with the sample body set as the trigger's Output (the pattern of Thomas's Mail Integration - Thomas).

## The integrations

Unless the table says otherwise, each one is: webhook (the screen POSTs the payload) → Kissflow Process "Update an item" on the portal item the payload names. In the table, "Update CIQP Request" means `UpdateAnItem` on CIQP Request `_id` = `portalRequestItemId`.

| # | Webhook code | Payload | Steps |
|---|---|---|---|
| A-1 | `op.round` | `{opItemId, roundNo, queryKey, caseCode, question, refLabel, refSectionKey, refFieldKey, refRowId, kindLabel, justification, dueDate, department, responsibleName, portalRequestItemId}` | (1) CreateAndSubmitItem CIQP Query, round N. Assigned_Contacts comes from the request's `Assigned_Contacts`, via "Fetch an item" on the request or a payload field [recipe]. (2) UpdateAnItem CIQ Open Point `opItemId`: `Portal_Query_Item_Id` = (1).Id |
| A-2 | `op.edited` | `{portalQueryItemId, question, justification, dueDate, editNote}` | Update CIQP Query: question, justification, due date, edit note and time [field names from the CIQP Query draft] |
| A-3 | `op.closed` | `{portalQueryItemId}` | End the open CIQP Query [recipe: withdraw, or skip-and-complete, or a closed flag] |
| A-4 | `release.requested` (I-5) | `{portalRequestItemId, releaseAssignees}` | Update CIQP Request: `Release_Flag` = "", `Request_Locked` = "Yes", `Case_Phase_Label`, `Release_Contacts` = releaseAssignees. Then move the request into "give the final release". **That move waits** until the pilot proves who can move a supplier-held step |
| A-5 | `change.received` | `{portalRequestItemId, changeReportsJson}` | Update CIQP Request: `Change_Reports_JSON` |
| A-6 | `case.cancelled` | `{portalRequestItemId, phaseLabel, locked}` | Update CIQP Request: `Case_Phase_Label`, `Request_Locked` |
| A-7 | `case.reactivated` | same as A-6 | same as A-6 |
| A-8 | `history.updated` | `{portalRequestItemId, questionsHistoryJson}` | Update CIQP Request: `Questions_History_JSON`. The whole field is replaced; the screen sends it only from a load where every unresolved point was read live |
| A-9 | `scope.extended` | `{portalRequestItemId, manualScopeJson}` | Update CIQP Request: `Manual_Scope_JSON` |
| A-10 | `case.contacts` | `{portalRequestItemId, caseContactsJson, bdfSetJson, assignees, releaseAssignees}` | Update CIQP Request: `Case_Contacts_JSON`, `BDF_Set_JSON`, `Assigned_Contacts`, `Release_Contacts` (multi-user mapping: [recipe]) |
| I-9 | scheduler | — | Daily: cases near their deadline → Email (I-8 / SendEmail). **Plan D-5 says Thomas builds the first scheduler by hand**: confirm with him before building |

## Rules

- **Backups:** back up the draft before every PUT, to `integrations/backups/`.
- **Read-back:** read back after every PUT and every publish.
- **Per-step Test:** run it for every step, using the route from the pilot; in Chrome only when the route isn't available over REST.
- **Switch-on:** switch each integration on where the platform lets us; otherwise list it for Thomas.
- **Webhook URLs:** once built, they go to `SET:current` → `Payload_JSON.webhooks` (`{code: url}`, https only). The app's `webhooksOf()` reads them. That config row is in the portal session's kit, so agree who writes it.
- **Pacing and data:** at least 1.2 s between calls; fictional ZZT test data only, deleted after each test.

## Built, tested and switched on (20 Oct, 17:50–17:57 IST)

Built with `build.mjs` (stages: create, skeleton, bind, fields, map) following the portal session's proven RECIPE.

**Shape:** every integration is webhook → Search the app item → Run script (`scripts/*.js`) → the target action(s). The script:
- picks the exact `_id`;
- reads the target from Kissflow;
- refuses anything that doesn't fit.

**Tests:** the portal session captured each webhook trigger in Thomas's Chrome with a fictional payload. `test-chain.mjs` then ran each action's Test in order on ZZT data and stored the outputs. Every step passed, then each integration was published and switched on (Live, IsActive true).

| Integration | Steps passed | What the test proved on ZZT data |
|---|---|---|
| `CIQ_op_round_Open_point_question_t_A00` | 4/4 | It created CIQP Query PkEP2zdp4KRO at "Supplier: respond", assigned to the dev contact, every field taken from the open point, and stored the query id on the point |
| `CIQ_op_edited_Open_point_question__A00` | 3/3 | After the point's question was edited, the query showed the new question and `Edited_At` |
| `CIQ_op_closed_Open_point_closed_A00` | 3/3 | After the point's outcome was set, "Skip and complete" completed the query (no assignee left) |
| `CIQ_release_requested_Final_releas_A00` | 3/3 | The request got Release_Flag "Requested", Request_Locked "Yes" and the label. Release_Contacts had the same value before and after, so the multi-user write is not proven |
| `CIQ_history_updated_Questions_hist_A00` | 3/3 | The request's Questions_History_JSON was written |
| `CIQ_case_cancelled_Case_cancelled_A00` | 3/3 | The request got the label "Cancelled" and the lock |

**Clean-up:** after each case-level test the test request was restored to its saved values (`zzt-request.mjs`). The ZZT open point and query were deleted (read back 404). The ZZT case and request pair is the portal session's to delete.

**Not built:** change.received, case.reactivated, scope.extended, case.contacts and the I-9 scheduler. The app UI doesn't send the first four yet; plan D-5 has Thomas build the first scheduler by hand.

**Webhook URLs:** the portal session writes them into `SET:current`. They are never recorded in docs or chat summaries.

## Changes after the 20 Oct review (portal session, HIGH finding on I-7)

### release.requested
**Change:** the integration now:
- stamps the case's `Release_Requested_At` in a new step before the request update. I-7 requires a release that is later than this stamp.
- clears `Release_At` and `Release_By_Name` on the request.

**Re-test** on the fresh case PkEP3NegdbiE ("ZZT-C2"): 4/4 steps passed, it was republished and re-activated, and it read back Live / IsActive true.

**Proven later (portal session, 12:55 IST):** the null mapping clears a field that already holds a value. The portal session set `Release_At` and `Release_By_Name` on the request, then posted a live release.requested. Both read back null, and the case's `Release_Requested_At` was stamped. I-7 then completed the case, and a forged release.given for a case never asked to release was refused.

### Live end-to-end run of op.round
**How:** a real webhook call, exactly as the deployed app sends it. The URL came from `SET:current`, and the payload `{opItemId}` went out as a text/plain POST.

**Answer and result:** the webhook answered 200 `{"status":"success"}`. About 10 s later, test point PkEP3OPuXhMB carried query PkEP3OpUhR9G, at "Supplier: respond" and assigned to the dev contact.

### Lesson
Capturing a webhook trigger in the builder runs a switched-ON integration for real, so switch it off before a re-capture.

### New build stages
- `addstep`: adds a step and keeps the captured trigger.
- `untest`: clears every action's `IsTested` after a change, so a stale "tested" flag can't hide an untested change.

### Clean-up (20 Oct)
- The app session's ZZT open points and queries are all deleted (each read back 404).
- The portal session deleted its ZZT cases and requests.

## Hardening prepared 21 Oct (not applied)

From the portal session's night tests. Prepared as files only; nothing was written to Kissflow. **Until it is applied, the six integrations above run unchanged.**

**The change:** each integration gets a second search before its script, for the portal target, by the payload's app id. Its script is hardened as follows:
- **op.round and op.edited:** refuse a point that isn't InProgress.
- **op.round:** refuses a round whose query already exists.
- **release.requested:** refuses a request labelled "Cancelled" (by case.cancelled). It checks the case's own `Case_Phase` too, but nothing writes "Cancelled" there today.
- **release.requested (added 21 Oct afternoon):** also clears the two new CIQP Request fields `Release_By_Email` and `Release_By_Role` with null, like `Release_At` and `Release_By_Name`. The portal session added and published them on 21 Oct (REQ-PROC-042). The hardening adds their two mappings on the request update. Until it is applied, the live integration clears only `Release_At` and `Release_By_Name`.
- **release.requested, history.updated, case.cancelled, op.edited and op.closed:** check the reverse link. The request's `App_Case_Item_Id` must be the case, and the query's `App_Open_Point_Id` must be the point.

**Details:** `HARDENING.md` covers the changes, the offline checks (`test-harden.mjs`, and the dry run `build.mjs <key> harden`) and the apply procedure (`build.mjs <key> harden-apply`, then the steps for capture, Test, activate and live proof).
