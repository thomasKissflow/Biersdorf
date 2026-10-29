# CIQ v6: the Kissflow-native build (no external service)

**Kissflow-internal.** Written 20 Oct by the portal session, which leads tonight's build of both containers on Thomas's instruction. It replaces the service parts of `plan-v5-final.md`; everything else in v5 still holds unless a row here changes it.

**Evidence tags:** [proven] tested live here · [documented] in master.md or the vendor metadata · [to test] not proven yet, needed in the morning · [decision] Thomas's or an assumption, marked.

## 1. Decisions this plan follows

| # | Decision | Source |
|---|---|---|
| D-1 | **No external sync service.** Every portal↔app hand-off is a Kissflow integration; people act as themselves through the SDK | Thomas 15 Oct; review comments |
| D-2 | **The data model shown to Beiersdorf on 16 Oct:**<ul><li>portal: CIQP Request (with the final release as a step), CIQP Query, CIQP Help Article;</li><li>app: CIQ Case, CIQ Review, CIQ Open Point, CIQ Supplier, CIQ Config Version, CIQ Scope Run, CIQ RMES Safety and CIQ RMES Regulatory, CIQ Internal Note, CIQ Audit Event;</li><li>one e-mail integration.</li></ul>Every portal item has an app twin with the same case number | data model page; Thomas "it looks good" |
| D-3 | **The hand-off mechanism:**<ul><li>trigger: a Kissflow trigger (a process step event, a dataform item created, or a webhook);</li><li>action: an **HTTP connector "Make an HTTP call (Custom)"** that calls Kissflow's own REST routes (create at Start + submit, the admin PUT on an in-progress item, attach);</li><li>auth: a server-side **custom-auth connection** that holds the access key, so no key is ever in a browser.</li></ul>This is the pattern of Thomas's "Test" integration (Dataform ItemCreated → HTTP PUT, connection "CustomAuth - Test"). All the REST routes used are [proven]; running them from an integration is [to test] | integration Test_A00 (16 Oct) |
| D-4 | **E-mails:** the webhook pattern of "Mail Integration - Thomas": the webhook receives `{To, Subject, Body}` and the Email connector sends it. No mail data is stored (CIQ Mail Outbox is not used) | Mail_Integration_Thomas_A00; Thomas 16 Oct |
| D-5 | **Deadlines:**<ul><li>native SLAs on the supplier steps (live on fill-in and respond);</li><li>a **daily scheduler integration** reads the cases near their deadline and mails the supplier. Thomas builds the first one by hand; the others follow it.</li></ul> | comment J-06 |
| D-6 | **The final PDF:** an external Google Apps Script on completion renders the same document the page shows and mails it | comment J-07; AS-12 |
| D-7 | **The audit trail is written by the UIs:** one CIQ Audit Event row per action, with references to the flow id, the item (instance) id and the activity instance | comment T-13 |
| D-8 | **Field permissions are set on every step, for data security,** and Thomas's manual changes are never overwritten | Thomas 16 Oct |
| D-9 | **What the portal reads from the app:** a shared process report with chosen fields and child tables, filtered on `kf.user.Email` [to test: whether the filter is enforced by Kissflow or only by the screen] | comments J-01, J-02 |
| D-10 | **The final release is a step of CIQP Request** (built 16 Oct). A reopen sets `Release_Flag` = "Reopened" and moves the step on; a go-to step returns the request to "keep the CIQ up to date" | Thomas 16 Oct |
| D-11 | [decision, assumption] **After the release the supplier keeps the request at a held-open step, "Supplier: view the released CIQ"**, so the released case stays visible and "Report a change" works, as in the prototype | MORNING-2026-10-16 decision 1, recommended; built tonight |
| D-12 | [decision, assumption] **Removing an uploaded file is a soft delete:** the Uploads row gets `Upload_Removed_At` and `Upload_Removed_By_Email`, the file disappears from the questionnaire, and the record stays for the audit. This keeps REQ-PROC-029 (documents are never deleted) | Thomas 16 Oct ("ability to remove an uploaded file") |
| D-13 | **CIQ Case Data, CIQ Service Request and CIQ Mail Outbox are not used.** Grants go to the Case administrator only; the flows stay published (the API can't delete them) | D-1, D-4 |
| D-14 | **CIQ Case - Thomas is Thomas's sandbox and is left untouched.** The build uses `CIQ_Case_A00` | read 20 Oct |

## 2. Why the case steps stay held by the Integration service role

A hand-off integration submits or moves a step with the connection's user. Kissflow lets a key submit a step only when its user holds that step (P2 [proven]), so the steps that only integrations move stay assigned to the **Integration service** role, whose only member is the connection's user. These are "Waiting for supplier: CIQ" and "Beiersdorf review and final release". Their reminders to Beiersdorf come from the daily scheduler (D-5), not from a native SLA, because a native one would go to the connection's user. Supplier reminders are native (the supplier holds the portal step).

**Live walk, 20 Oct** (`kissflow-build/night-2026-10-20/portal-v6-walk.mjs`, 11/11, ZZT items deleted afterwards):
- "give the final release" with `Release_Flag` empty → "Supplier: view the released CIQ" [proven];
- with "Reopened", the go-to → "Supplier: keep the CIQ up to date" [proven];
- the key's user, **as an assignee**, submits "keep up to date" and the view step although `Keep_Open_Gate` is Mandatory there: Mandatory is not enforced on key submits [proven].

So an integration whose connection user is **co-assigned** on the supplier steps can move them. That means a technical portal user in the Supplier role, added to `Assigned_Contacts` and `Release_Contacts` by I-1. The cost: native task and SLA mails also go to that user [decision for Thomas]. The supplier's custom UI never submits "keep up to date" or the view step, and the native form enforces Mandatory for a real supplier [documented].

Without that co-assignment, the integration can't submit a supplier-held step. Two release moves are therefore [to test]:
- **Moving the request into "give the final release":** Kissflow Process "Approve an item" or "Skip and complete" may move a step it doesn't hold. Otherwise the supplier's screen submits "keep up to date" itself once the shared case says the release is requested. That fallback is option a of the review page, and it needs `Keep_Open_Gate` relaxed.
- **The reopen move out of the release step:** same choice.

## 3. Objects, per container

### 3.1 Portal (`CIQ_Supplier_Portal_A00`), built by the portal session

| Object | Type | v6 change tonight |
|---|---|---|
| CIQP Request | Process | **Add** the held-open step "Supplier: view the released CIQ" after the go-to (D-11), assigned from `Assigned_Contacts`; every answer ReadOnly there, the change-report fields editable, mandatory `Keep_Open_Gate`. **Add** the child columns `Upload_Removed_At` (DateTime) and `Upload_Removed_By_Email` (Text) (D-12) |
| CIQP Query | Process | none (deadline live) |
| CIQP Help Article | Form | none (help texts live) |
| CIQP Final Release + the 4 "ZZZ (Not in Use)" flows + ZZ Spike Assignee | Process | Remove the Supplier grant (unused) |

### 3.2 App (`CIQ_Digital_A00`)

| Object | Type | v6 change | Who |
|---|---|---|---|
| CIQ Case `CIQ_Case_A00` | Process | **Add Start fields the hand-off integration copies to the portal**, all written by the RMM's screen at Start: `Config_Bundle_JSON` (Textarea; the supplier-safe bundle of the pinned release), `Config_Bundle_Hash` (Text), `BDF_Set_JSON` (Textarea), `Portal_Assignees_JSON` (Textarea, `[{"_id":"Us…"}]` of the portal contacts), `Release_Assignees_JSON` (Textarea, the same list; every contact, see MORNING-16 decision 2). Steps unchanged (§2) | portal session |
| CIQ Review | Process | The case's screen starts the department reviews: the first Beiersdorf user who opens a case after completeness creates the missing reviews, keyed by `Review_Key`, so a repeat creates nothing [decision, option c]. Grant **Init** to RMM (completeness, late activation, reopen). Steps as built | app session |
| CIQ Open Point | Process | **The raiser starts it in the screen** (no service). Grant **Init** to RMM and the 5 reviewer roles; `Raiser_Assignee` = the raiser at Start | app session |
| CIQ Audit Event | Form | **Written by the screens** (D-7). Add `Ref_Flow_Id`, `Ref_Item_Id`, `Ref_Activity_Instance_Id` (Text) if they are missing. Every acting role gets create; Delete only if S-6 shows Member-without-Delete is impossible | app session |
| CIQ RMES Safety / Regulatory | Form | The Safety or Regulatory reviewer's screen creates the row on the first open of its review. Grants stay: own department only (V-53). **28 Oct (BDF's e-mail, Thomas: "do the changes in app and portal"): RMES = derived 8-field sheet; record header-only; decision on CIQ Review.** The sheet (trade name FLD-GEN-001, supplier FLD-GEN-002, manufacturer FLD-GEN-004; per K2.1 component INCI, %, CAS #, EC #, Source of origin and its K2.3 free text) is computed from CIQ Case by `prototype/src/domain/rmesSheet.ts` and stored nowhere. The row holds only RMES_Key, Case_Code, Case_Item_Id, Cycle_No and RMES_Voided (the REQ-PROC-021 record); its Criteria and Findings tables stay unused, and legacy rows never block. The Approved/Rejected decision stays on CIQ Review `RMES_Decision` (Mandatory at the SAF/REG steps); `RMES_Gaps` = decision missing ? 1 : 0, so `Review_Gate` is unchanged. No flow, field, permission or grant change | app session |
| CIQ Supplier, CIQ Config Version, CIQ Scope Run, CIQ Internal Note | Form | Grants as v5 §6. Scope Run rows are written by the screen at completeness | app session |
| CIQ Case Data, CIQ Service Request, CIQ Mail Outbox (+ its integration, off) | Form | Not used (D-13): grants go to the Case administrator only | app session |
| CIQ Case - Thomas | Process | untouched (D-14) | — |

### 3.3 Configuration (`CIQ Config Version` rows)

All 12 rows are live and **identical to the current prototype** (checked 20 Oct: every `Content_Hash` matches). The kit to regenerate and upload them is `kissflow-build/config-seed/` (README there). The stray 8 Oct test row `ZZT-1008-1843-G-CFG` (Draft) can be removed.

## 4. The hand-off integrations (specs; Thomas switches each one on)

All of them use the HTTP connector with the custom-auth connection (D-3), except where a native action is named. "Admin PUT" means `PUT /process/2/{acc}/admin/{process}/{item}?_application_id=<container>`; "create+submit" means `POST /process/2/{acc}/{process}` followed by `POST …/{item}/{activityInstance}/submit` [routes proven].

| # | Trigger | Action(s) | Moves |
|---|---|---|---|
| I-1 | App, CIQ Case: item enters "Waiting for supplier: CIQ" | HTTP: create+submit a CIQP Request in the portal with the header fields, `Config_Bundle_JSON` + hash, `BDF_Set_JSON`, `Case_Contacts_JSON`, `Assigned_Contacts` ← `Portal_Assignees_JSON` (raw JSON in the body), `Release_Contacts` ← `Release_Assignees_JSON`, `App_Case_Item_Id` ← the trigger `_id`; then HTTP: admin PUT on the case, `Portal_Request_Item_Id` ← the response `_id` [to test: two chained actions, raw JSON mapping] | the supplier's request exists |
| I-2 | Portal, CIQP Request: step "Supplier: fill in the CIQ" submitted | HTTP: admin PUT on the app case (`App_Case_Item_Id`): `Completeness_*`, the answer JSON fields, `Case_Phase` = Review; then submit the case's "Waiting for supplier: CIQ" (Integration service holds it) | the case goes to review |
| I-3 | App, CIQ Open Point: item created (Start submitted) | HTTP: create+submit a CIQP Query (round 1) | the question reaches the supplier |
| I-4 | Portal, CIQP Query: "Supplier: respond" submitted | HTTP: admin PUT on the app open point (`App_Open_Point_Id`): `Response_*`, `OP_Progress` = answered | the answer reaches the raiser |
| I-5 | App, CIQ Review: last review completed. Without a counter in an integration, the trigger is the case field `Release_Requested_At`, which the screen of the last completing reviewer writes; to make it fire, the screen also creates a CIQ Audit Event "release requested", and the integration triggers on that Dataform item created | HTTP: admin PUT on the portal request (`Release_Flag` = "", `Request_Locked` = Yes, `Case_Phase_Label`), then move it to "give the final release" [to test, §2] | the release step |
| I-6 | App: CIQ Audit Event "review reopened" created by the screen | HTTP: admin PUT on the portal request `Release_Flag` = "Reopened", then move the release step on [to test, §2]; the go-to returns it to editing | reopen |
| I-7 | Portal, CIQP Request: "give the final release" submitted | HTTP: admin PUT on the app case `Final_Release_*`; submit the case's last step (Integration service); then the webhook to the Apps Script PDF (D-6) | the case completes |
| I-8 | Webhook (the screens) | Email: `{To, Subject, Body}` (Mail Integration - Thomas) | every mail |
| I-9 | Scheduler, daily | read the cases near their deadline; Email | reminders and escalations (D-5) |

The order of the morning tests: I-8 (exists), then I-1, then I-2. They prove the HTTP-to-Kissflow pattern, cross-container creation and the raw-JSON mapping. The rest copy them.

### 4.0 As built (20 Oct, both sessions)

All 12 hand-offs are built, step-tested on real ZZT data, published and **switched on** in the Development sandbox. The details, evidence and open points are in `kissflow-build/night-2026-10-20/integrations/STATUS.md`. These changes to the table below apply:

- **No HTTP connector and no custom-auth connection.** Every action is a native Kissflow Process action ("Search an item", "Create and submit", "Update an item", "Approve an item", "Skip and complete") on the connection whose key Kissflow minted, plus a Run script step that checks the item.
- **Every hand-off is a webhook started by a screen, I-1 to I-7 included.** The reason: the builder switches an integration on only after every step's Test passes, and a Process trigger's test data is a generated placeholder, so its steps can never pass. The payload carries only the id of the item the screen acted on. The screen posts after its own action succeeded: the RMM's Start submit (I-1), the supplier's fill-in submit (I-2), respond submit (I-4) and release submit (I-7). The trade-off: an action taken in the native Kissflow form instead of the custom UI posts nothing.
- **I-3 is op.round** (round 1 included). **I-5** also writes the case's `Release_Requested_At` and clears the request's Release_At / Release_By_Name. **I-7** refuses unless the case's `Release_Requested_At` is set and older than the supplier's release.
- **The release-step moves of the supplier's request are done by the supplier's screen** (§2, option a). No integration moves a supplier-held step. They are not built yet: decision for Thomas in STATUS.md.

### 4.1 Hand-offs that a screen starts (amended 20 Oct with the app session)

An integration trigger fires for **every** new item of its flow. Filtering on a field value (an action code) needs integration conditions, and those are [to test] (K-09g). So a hand-off that a screen starts gets **its own webhook integration**:
- the target REST call is fixed in the integration;
- the screen POSTs only data (ids and values);
- the screen still writes its CIQ Audit Event row for the history (D-7), but that row triggers nothing.

The webhook URLs go into the Settings row (`SET:current` → `webhooks`) once Thomas has created the integrations. Until then the screen records the hand-off as pending in the audit row and shows "Beiersdorf's system will pass this on".

**Transport [to test]:** whether a custom UI can POST to a Kissflow webhook URL (`kf.api` with an absolute URL, or `fetch` and CORS). The fallback is one small "hand-off" Form per webhook below, with a Dataform ItemCreated trigger, so each integration still serves exactly one hand-off.

| Webhook (= `Action_Code` on the audit row) | Payload | The integration does |
|---|---|---|
| `op.round` | `{opItemId, roundNo, queryKey, caseCode, question, refLabel, refSectionKey, refFieldKey, refRowId, kindLabel, justification, dueDate, department, responsibleName, portalRequestItemId}` | create+submit CIQP Query round N; admin PUT `Portal_Query_Item_Id` on the open point |
| `op.edited` | `{portalQueryItemId, question, justification, dueDate, editNote}` | admin PUT on the open CIQP Query (+ `Edited_At`) |
| `op.closed` | `{portalQueryItemId}` | withdraw the open CIQP Query (the key started it: withdraw by initiator [proven]) |
| `release.requested` | `{portalRequestItemId, releaseAssignees}` | I-5 |
| `review.reopened` | `{portalRequestItemId}` | I-6: admin PUT `Release_Flag` = "Reopened", **`Request_Locked` = "No", `Case_Phase_Label` = "With Beiersdorf"**, then move the release step on; the go-to returns the request to editing. Review fix, 20 Oct: without the unlock, the supplier was stuck. The portal UI now also treats `Release_Flag` = "Reopened" as unlocked, so a stale lock can't trap the supplier |
| `change.received` | `{portalRequestItemId, changeReportsJson}` | admin PUT `Change_Reports_JSON` (the receipts: CR number, date, text) once the app screen has recorded the supplier's report. Review fix, 20 Oct: v6 had no writer for the receipts. Without one, the portal now counts a report as sent after 10 minutes, so the next can be written |
| `case.cancelled` / `case.reactivated` | `{portalRequestItemId, phaseLabel, locked}` | admin PUT `Case_Phase_Label`, `Request_Locked` |
| `history.updated` | `{portalRequestItemId, questionsHistoryJson}` | admin PUT `Questions_History_JSON`. The app screen builds the supplier-visible thread of every open point, in the shape of plan v5 §3.1, after each open-point change. Without it, a supplier no longer sees a question's history once its query has ended (P4). **Contract (20 Oct, app session review):** the field is replaced whole, and an integration can't merge JSON. So the screen sends it **only from a load where every unresolved point of the case was read live**; otherwise the hand-off stays pending. A partial view would erase another department's latest answer. **Recommended long-term [decision for Thomas]:** keep each round's history on its own CIQP Query item instead. A held-open step "Supplier: view the answer" after "respond", like the request's view step, keeps answered rounds visible, and the app's hand-offs write status per item (accepted, closed, returned). That removes `Questions_History_JSON` and the whole-field replace |
| `scope.extended` | `{portalRequestItemId, manualScopeJson}` | admin PUT `Manual_Scope_JSON` (a department added a section, B-29) |
| `case.contacts` | `{portalRequestItemId, caseContactsJson, bdfSetJson, assignees, releaseAssignees}` | admin PUT `Case_Contacts_JSON`, `BDF_Set_JSON`, `Assigned_Contacts`, `Release_Contacts` (a contact changed, B-26). Rerouting a step when its assignee field changes mid-step is [to test] (S-5) |

`op.raised` (round 1) stays I-3, a Process trigger on the open point's Start.

**Audit-row codes** (the history; written by the screens; no trigger): `case.created`, `case.cancelled`, `case.reactivated`, `op.raised`, `op.round`, `op.edited`, `op.accepted`, `op.returned`, `op.notaccepted`, `op.closed`, `review.started`, `review.completed`, `review.reopened`, `review.reassigned`, `release.requested`, `rmes.saved` (since 28 Oct: the RMES record created, or the Safety / Regulatory decision), `note.added`, `supplier.changed`, `config.published`.

### 4.2 The supplier's data in the app (added 20 Oct)

**Where the app reads the answers.** CIQ Case has 15 fields, built 20 Oct, read back 15/15, ReadOnly at every step, written only through the admin route. They carry the **same names and JSON shapes as the CIQP Request**, so the app parses them with the portal's own code (answers.ts, scope.ts):
- `Config_Answers_JSON`, `Answers_JSON`, `Answered_By_JSON`, `Justifications_JSON`, `Components_JSON`, `Scope_JSON`, `Requested_Docs_JSON`, `Documents_JSON`;
- `Answers_Rev`, `Answers_Changed_At`, `Answers_Changed_By_Email`;
- `Change_Report_Text`, `Change_Report_Rev`, `Change_Report_By_Email`, `Change_Report_At`.

`Documents_JSON` is new on the portal request too. The supplier's screen keeps it current on every upload and removal: `[{uploadId, attachmentId, fileName, docKind, sectionKey, fieldKey, rowId, uploadedByEmail, uploadedAt}]`, with removed files left out. An integration can't copy child rows, so the file list has to travel as a text field.

**How they get there:**
- **I-2,** at completeness, copies them.
- **The webhook `request.changed` `{portalRequestItemId}`,** after every supplier save, upload, removal or change report:
  1. the integration admin-GETs that request;
  2. it copies the 15 fields to the case named by the **request's own `App_Case_Item_Id`**, which is ReadOnly to suppliers.

  A payload from the supplier's browser never names the target case. A forged id can only re-sync the right data to the right case.
- **The portal UI** calls it when `WEBHOOKS.requestChanged` in `src/portal/kf/portal.ts` holds the URL. It's empty tonight, so nothing is sent.

**Files:** whether an app user can open a portal attachment is [to test]. Until then the app shows the file's name and date.

**Admin PUT on a field ReadOnly at the current step:** [proven] on portal items by spike S-5 (14/14, 14 Oct: `Case_Phase_Label`, `Questions_History_JSON`, `Request_Locked`). The app session probes it on an app open point on 20 Oct.

## 5. The screens

- **Portal UI** (portal session, tonight):
  - handle the held-open "view the released CIQ" step (the released case stays listed; "Report a change" works there);
  - soft-delete a file (D-12), with a Remove button on the supplier's own uploads while the questionnaire is editable;
  - write the questionnaire's audit lines? No: portal users can't write app forms, so the supplier's actions are audited from the integrations' trigger items [decision].
- **App UI** (app session, tonight): the internal screens of the finalised prototype (`prototype/FINAL-APP-SPEC.md`) on live app data, in the same pattern as the portal:
  - a live store adapter that renders the prototype's own screens;
  - writes through the SDK as the user;
  - one CIQ Audit Event per action (D-7);
  - no Service Request, no Case Data.

  Listing all cases for every internal role needs a read the role is allowed: the app session picks among `getAdminItems` for an admin-role lens, the shared report (D-9), or a screen-maintained index, and records why.

## 6. Who builds what tonight

| Part | Session |
|---|---|
| Portal backend (§3.1) and portal UI (§5) | portal session |
| CIQ Case Start fields (§3.2) | portal session |
| Integration specs (§4); the morning test plan | portal session |
| Config kit (§3.3) | portal session |
| CIQ Review, CIQ Open Point, CIQ Audit Event, RMES, the other forms' grants and per-step field permissions, the retired objects' grants (§3.2) | app session |
| App UI (§5) | app session |

**Rules for both sessions:**
- one writer per flow;
- re-read the live draft before every graft, and keep Thomas's manual changes;
- back up every draft before a PUT;
- read back every write;
- at least 1.2 s between calls on the shared key;
- on a 429 or an HTML answer, both stop for 20 minutes.
