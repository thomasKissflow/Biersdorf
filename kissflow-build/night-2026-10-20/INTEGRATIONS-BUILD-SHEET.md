# Build sheet: the portal ↔ app integrations (plan v6 §4)

**Kissflow-internal.** One block per integration. Build each in the app's integrations (account `AcDOSunMEpSA`, dev sandbox `dev-beiersdorf.kissflow.eu`), switch it on, and run the morning test named on it. None is built yet: integrations can't be deleted, and switching one on is a builder action.

## Common to all

- **Action:** HTTP connector → "Make an HTTP call (Custom)", as in your integration **Test** (`Test_A00`).
- **Connection:** a custom-auth connection that sends the two Kissflow access-key headers (`X-Access-Key-Id`, `X-Access-Key-Secret`). Your "CustomAuth - Test" (`CnENYDu15_X6`) may already be that connection. The keys live only in the connection: never in a field, a body or a screen.
- **The connection's user must be the only member of the app role "Integration service".** Its steps on CIQ Case ("Waiting for supplier: CIQ", "Beiersdorf review and final release") can then be submitted by these calls (P2).
- **Base URL:** `https://dev-beiersdorf.kissflow.eu`. Header `Content-Type: application/json`. Body type raw JSON.
- **Placeholders** below: `{{trigger.Field_Id}}` is the trigger item's field, which you pick in the builder's field picker. `{{a1.…}}` is the response of the integration's first action [to test: whether a later action can use an earlier action's response].
- **DateTimes:** without milliseconds (Kissflow rejects `.123Z`).
- **The REST routes are all proven from our scripts:**
  - create at Start: `POST /process/2/{acc}/{process}?_application_id=…`, answering `_id` and `_activity_instance_id`;
  - submit: `POST /process/2/{acc}/{process}/{item}/{activityInstance}/submit?_application_id=…`;
  - admin update of an in-progress item, any field, ReadOnly ones included (S-5, P-RO): `PUT /process/2/{acc}/admin/{process}/{item}?_application_id=…`;
  - the current activity instance of an item: `GET /process/2/{acc}/admin/{process}/{item}` → `_current_context[0]._context_activity_instance_id`.

## I-8 · E-mail (exists: Mail Integration - Thomas)

Webhook `{To, Subject, Body}` → Email. **Morning test 1:** POST a sample body to the webhook URL from a custom UI with `kf.api` and with `fetch`. It answers whether a screen can call a webhook at all, which decides the transport of plan §4.1.

## I-1 · case → supplier request (app)

- **Trigger:** Kissflow Process · CIQ Case · "item enters a step" = "Waiting for supplier: CIQ".
- **a1:** `POST /process/2/AcDOSunMEpSA/CIQP_Request_A00?_application_id=CIQ_Supplier_Portal_A00`
  ```json
  { "Request_Key": "{{trigger.Case_Code}}|{{trigger.Cycle_No}}", "Case_Code": "{{trigger.Case_Code}}", "Cycle_No": {{trigger.Cycle_No}},
    "Supplier_Code": "{{trigger.Supplier_Code}}", "App_Case_Item_Id": "{{trigger._id}}", "Trade_Name": "{{trigger.Trade_Name}}",
    "Main_INCI": "{{trigger.Main_INCI}}", "BDF_Material_No": "{{trigger.BDF_Material_No}}", "Supplier_Display_Name": "{{trigger.Supplier_Legal_Name}}",
    "BDF_Contact_Name": "{{trigger.BDF_Contact_Name}}", "BDF_Contact_Email": "{{trigger.BDF_Contact_Email}}", "Markets_Label": "{{trigger.Markets_Label}}",
    "Template_Label": "{{trigger.Template_Label}}", "Supplier_Due_Date": "{{trigger.Supplier_Due_Date}}", "Rule_Set_Version": "{{trigger.Rule_Set_Version}}",
    "Template_Version": "{{trigger.Template_Version}}", "Config_Bundle_JSON": {{trigger.Config_Bundle_JSON|json-string}}, "Config_Bundle_Hash": "{{trigger.Config_Bundle_Hash}}",
    "BDF_Set_JSON": {{trigger.BDF_Set_JSON|json-string}}, "Case_Contacts_JSON": {{trigger.Case_Contacts_JSON|json-string}},
    "Assigned_Contacts": {{trigger.Portal_Assignees_JSON}}, "Release_Contacts": {{trigger.Release_Assignees_JSON}},
    "Case_Phase_Label": "Filling in", "Request_Locked": "No", "Manual_Scope_JSON": "[]" }
  ```
  - `Portal_Assignees_JSON` and `Release_Assignees_JSON` hold JSON arrays (`[{"_id":"Us…"}]`), inserted raw.
  - The three `…_JSON` text fields must go in as JSON **strings**. `|json-string` marks where the builder must quote and escape the value [to test: how the HTTP body mapping handles a field that holds JSON text; if it can't escape, the screen also writes an escaped copy].
- **a2:** `POST /process/2/AcDOSunMEpSA/CIQP_Request_A00/{{a1._id}}/{{a1._activity_instance_id}}/submit?_application_id=CIQ_Supplier_Portal_A00`, body `{}`. The request then sits at "Supplier: fill in the CIQ", assigned to the contacts, with its deadline.
- **a3:** `PUT /process/2/AcDOSunMEpSA/admin/CIQ_Case_A00/{{trigger._id}}?_application_id=CIQ_Digital_A00`, body `{ "Portal_Request_Item_Id": "{{a1._id}}" }`.
- **Morning test 2:** create a ZZT case in the app, submit Start, and check that the portal request exists at "fill in the CIQ" for the dev supplier (you), with the bundle intact.

## I-2 · completeness → app case (portal)

- **Trigger:** Kissflow Process · CIQP Request · "step submitted" = "Supplier: fill in the CIQ" (or "item enters" "keep the CIQ up to date").
- **a1:** `PUT …/admin/CIQ_Case_A00/{{trigger.App_Case_Item_Id}}?_application_id=CIQ_Digital_A00`:
  ```json
  { "Completeness_Confirm": "{{trigger.Completeness_Confirm}}", "Completeness_By_Name": "{{trigger.Completeness_By_Name}}", "Completeness_By_Email": "{{trigger.Completeness_By_Email}}",
    "Completeness_By_Role": "{{trigger.Completeness_By_Role}}", "Completeness_At": "{{trigger.Completeness_At}}", "Case_Phase": "Review" }
  ```
- **a2:** read the case's current activity instance (`GET …/admin/CIQ_Case_A00/{{trigger.App_Case_Item_Id}}`), then **a3:** submit it. The Integration service holds "Waiting for supplier: CIQ".
- The **answers** don't need copying here: the app reads them from the shared CIQP Request (CIQP Request is shared with CIQ Digital, Lookup, all fields) [to test: whether the app screen can read it with the SDK]. If it can't, a1 also copies `Answers_JSON`, `Answered_By_JSON`, `Justifications_JSON`, `Components_JSON`, `Scope_JSON` and `Requested_Docs_JSON` into fields of the same names on the case (to be added).
- **Morning test 3:** confirm completeness on the ZZT request in the portal, and check the case reaches "Beiersdorf review and final release" with the confirmation copied.

## request.changed · supplier data → app case (webhook, called by the portal screen)

- **Trigger:** "Webhooks by Kissflow" · catch a webhook (POST). The body is `{ "portalRequestItemId": "Pk…" }` and nothing else.
- **a1:** `GET /process/2/AcDOSunMEpSA/admin/CIQP_Request_A00/{{webhook.portalRequestItemId}}?_application_id=CIQ_Supplier_Portal_A00`.
- **a2:** `PUT /process/2/AcDOSunMEpSA/admin/CIQ_Case_A00/{{a1.App_Case_Item_Id}}?_application_id=CIQ_Digital_A00`. The body copies the 15 fields of plan §4.2, same names (`Config_Answers_JSON` … `Change_Report_At`), from a1.
- **The target case comes from the request** (`App_Case_Item_Id`, ReadOnly to suppliers), never from the webhook body.
- **Then** put the webhook URL into `prototype/src/portal/kf/portal.ts` → `WEBHOOKS.requestChanged`, rebuild and deploy the portal UI.
- **Morning test:** save an answer on the ZZT request, then check the case's `Answers_JSON` and `Answers_Rev`.

## I-3 · open point raised → query round 1 (app)

- **Trigger:** Kissflow Process · CIQ Open Point · "item enters a step" (any "Open point – <Dept>").
- **a1:** create a CIQP Query: `Query_Key` = `{{trigger.OP_Key}}-R1`, `Round_No` 1, `App_Open_Point_Id` = `{{trigger._id}}`, case keys, `Kind_Label`, `Responsible_Department`, `Responsible_Name`, the `Ref_*` fields, `Question_Text`, `Supplier_Justification`, `Supplier_Due_Date`, `Assigned_Contacts` = the case's portal assignees. The open point needs `Portal_Assignees_JSON`, copied by the screen when it raises the point.
- **a2:** submit it. **a3:** admin PUT on the open point: `Portal_Query_Item_Id` = `{{a1._id}}`.

## I-4 · query answered → open point (portal)

- **Trigger:** Kissflow Process · CIQP Query · "step submitted" = "Supplier: respond".
- **a1:** admin PUT on `{{trigger.App_Open_Point_Id}}`: `Response_Kind`, `Response_Text`, `Response_Doc_Refs_JSON`, `Supplier_Responsible_Email`, and `OP_Progress` = "In progress". The raiser's screen appends the thread entry when it next opens the point.

## I-5 … I-7, and the webhooks of plan §4.1

The same pattern, one HTTP call per row of plan §4 and §4.1:
- **I-5 and I-6 depend on morning test 4:** can a Kissflow Process "Approve an item" or "Skip and complete" action, or the REST submit with the connection's user, move a portal step that the supplier holds? Our key can't (P2). If none can, the supplier's screen moves its own request: it submits "keep up to date" when the shared case says the release is requested. That also needs `Keep_Open_Gate` relaxed at that step.
- **I-6 (review.reopened)** must write `Release_Flag` = "Reopened", **`Request_Locked` = "No" and `Case_Phase_Label` = "With Beiersdorf"** in one admin PUT before it moves the step. The go-to then returns the request to editing.
- **I-5 (release.requested)** must clear `Release_Flag` (set it to `""`), so a leftover "Reopened" doesn't loop the next release back.
- **I-7:** trigger CIQP Request · "step submitted" = "give the final release" → admin PUT the case's `Final_Release_*`, then submit its last step (Integration service holds it) → the case completes. Then the Apps Script webhook for the PDF (D-6).
- **I-9 (scheduler):** daily. List the cases whose supplier step is due within N days, then I-8 for each. You build the first one by hand (comment J-06).

## Morning test order

1. Can a screen call a webhook (I-8)?
2. I-1.
3. I-2.
4. Who can move a supplier-held step (I-5 / I-6)?
5. I-3 and I-4.

Each passes when its read-back matches. Clean up with the existing `--cleanup` helpers (ZZT items only).
