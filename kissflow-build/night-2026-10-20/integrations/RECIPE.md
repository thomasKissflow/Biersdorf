# Integration recipe (proven 20 Oct, portal session)

**Kissflow-internal.** How to build a v6 hand-off integration over REST without corrupting its metadata, test every step, and switch it on. Everything here was read back live; the scripts are in this folder (`integ-lib.mjs` has the helpers).

## Proven live

| What | Result |
|---|---|
| `CIQP Request changed to case` (portal, `CIQP_Request_changed_to_case_A00`) | **ON**. Webhook → Search an item → Run script → Update an item. Every step's Test passed on real ZZT data. A real webhook call updated the ZZT case in ≈5 s (Answers Rev 4, then 5). |
| `CIQ I-1 Case to supplier request` (app, `CIQ_I_1_Case_to_supplier_request_A00`) | Built, mapped and published; **OFF**. Its step Tests can't pass (see "Process triggers" below). |
| Connector routes (ZZT probes, deleted) | Kissflow Process "Create and submit" = `POST /process/2/{acc}/{process}/create/submit/async`, which works on a PORTAL process from an app integration without `_application_id`. "Update an item" = `POST …/{process}/admin/update/async`, an admin update that writes fields ReadOnly at the current step. Both resolve to the item: the step output carries `_id` (not the async `Id`). |
| Webhook transport | No CORS headers. A `Content-Type: text/plain` POST whose body is the JSON text is parsed like JSON (proven). A browser can send it with `fetch(url, {method:"POST", mode:"no-cors", headers:{"Content-Type":"text/plain"}, body: JSON.stringify(payload)})`, fire-and-forget. Whether the custom-UI iframe's CSP allows it is [to test] in the real portal. |
| Switch on | The builder's toggle calls `PUT /flow/2/{acc}/integration/{id}/activate?_application_id=<app>` after a draft save. It refuses (client side) while any step's Test is not passed: "Action step test skipped or not completed". |
| Switch off | The builder's toggle calls `PUT /flow/2/{acc}/integration/{id}/deactivate?_application_id=<app>`. A publish leaves an integration that was switched off still off. |
| Capturing a sample | It runs the integration for real when the integration is ON: the capture POST is also a live event. Switch it off first. |

## Steps

1. **Shell:** `POST /flow/2/{acc}/integration/?_application_id=<app>` with `{Name, Description}`, which answers `{_id}`. App names start `CIQ `, portal names start `CIQP `. Look for an existing one by Name first: integrations can't be deleted.
2. **Skeleton:** GET the draft, back it up, then PUT the draft with `Root.Integration::Trigger = [tId]` and `Root.Integration::Action = [a1, …]` (the list order is the run order). Each entity is `{Id, Kind, Type, Name, IsInternalAuth, Connection, Integration: root, Connector: {_id, Name, Version, Logo, Status:"Published", WebsiteURL, TriggerId/TriggerName or ActionId/ActionName}, "<Kind>::FieldMapping": []}`.
   - **Kissflow Process / Dataform:** `IsInternalAuth:false`, `Connection: {_id:"CnEKHrHqXRKB", Name:"CIQ ZZ Spike Kissflow Process connection"}` (Dataform: `CnEKHrH5GzkY`). These are system-key connections that Kissflow minted itself. Never create a connection that holds a key.
   - **Webhook trigger:** `Type:"Create"`, `IsInternalAuth:true`, `Connection:{}`, connector `Coowt2xE4WH9S` / `WebhookTrigger` / "Catch a webhook (POST)".
   - **Run script:** `Type:"Create"`, `IsInternalAuth:true`, `Connection:{}`, connector `Co4m9q4JUbkV` / `RunJSCode` / "Run JavaScript".
   - **Logo:** from `GET /connector/2/{acc}/subscription?page_number=1&page_size=200`.
3. **Field schema:** `GET /integration/2/{acc}/{id}/trigger/{tId}/fields` and `…/action/{aId}/fields`. Read them again after binding a selector: the flow's fields appear once `process_id`/`form_id` is bound.
4. **Selectors** (`process_id`, `step_id`, `form_id`): FieldMapping `{Type, FieldId, Label, Name, IsRequired, IsDropdown:true, AutoRefresh:true, <Kind>: entityId, SelectedDropdown:[{FieldId: value, FieldName: label, IsSubArray:false}]}` plus Property `{Type:"Value", Value:[value]}`. A portal process's label in an app integration is `"CIQP Request - CIQ Supplier Portal"`. A trigger's process picker lists only its own container's processes.
5. **Mappings** (the shapes the builder itself writes, read back):
   - literal: Property `{Type:"Value", Value:["text"]}`;
   - a trigger field: Property `{Type:"Field", Field:"context.<triggerId>.<Field>"}`. For a Process trigger, also give the Property a Reference `{Kind:"Reference", Type:"Value", StepId:<consuming step>, SourceProperty:<the trigger's process_id Property id>, FieldId:<Field>, Property:<property id>}` and set `"Property::Reference":[ref]`;
   - an earlier step's output: `Field:"context.<stepId>.<path>"` (e.g. `context.Action_X._id`);
   - **a multi-value user field** (e.g. Assigned_Contacts): FieldMapping `{Type:"Object", IsMultiValue:true}`, Property `Field:"context.<step>.<list>"`, and one child FieldMapping `{Type:"String", IsVisible:true, FieldMapping:<parent>, Name:"_id", Label:"_id"}` with Property `Field:"context.<step>.<list>._id"`. The list must be an array of `{_id}`, so a JSON text field goes through Run script first;
   - give every schema field a FieldMapping (unmapped ones without a Property), as the builder does. `mapAction()` in `integ-lib.mjs` does all of this.
6. **Run script:** the Input data is an Object FieldMapping `input_fields` with one child per key (`{Type:"String", IsVisible:true, FieldMapping:<parent>, Name:key, Label:key}` plus Property). The code reads `inputData.<key>` (`input` and `input_fields` are undefined) and must `return` an object; a list input arrives as an array. A `throw` fails the run (shown in Run history). `js_code` is a FieldMapping `{Type:"Code", FieldId:"JSCode", Name:"js_code", CodeLanguage:"javascript"}` with Property `{Type:"Code", Code:"…"}`. `setScriptInputs()` builds the inputs.
7. **Step tests** (the builder's "Test"): `POST /integration/2/{acc}/{id}/<trigger|action>/{eid}/test?_application_id=<app>` with body `{}`. It answers with the step output and **really runs the step**: a create creates, an update updates. After a pass, store `{Output: <answer>, IsTested: true}` on the entity, as the builder does (`test-store.mjs`). A later step's test reads the earlier steps' outputs from the server-side test store, not from the draft.
   - **Webhook triggers:** open the integration in the builder, Trigger → Output → "Test trigger" (it listens for 60 s), POST a real ZZT payload to the URL, then Done. The builder stores `Output` + `IsTested` itself. **The URL is shown only in the builder** (its token is encrypted, with no REST route found). I'll read the URLs for you in Thomas's browser.
   - **Process triggers:** the trigger test always returns a generated placeholder (`_id` "SampleInstance001", "Text data", random numbers), even when real items exist. Steps that need real data fail their tests on it: e.g. a create into a process whose first step is assigned from a user field ("There is no assignee for the next step"), or an update of the triggering item. The builder then won't switch the integration on. **Prefer webhook or Dataform triggers where you can.** This is a question for Thomas for I-1 (see the morning list).
8. **Publish:** `POST /metadata/2/{acc}/integration/{id}/publish` with `{}`; read back with `GET /flow/2/{acc}/integration/?_application_id=<app>` (Status, IsActive, Connectors).
9. **Switch on:** only once every step has passed its Test, with the builder toggle (or `PUT …/activate` after a passed-test draft). Never set `IsTested` on a step that didn't pass.

## Security note for the webhooks

"Require authentication" is off on our webhooks: anyone who knows the URL can call them, so the URL is the only secret, and it ships in the screen's bundle. Design each hand-off so a forged call can do no harm: the integration reads the target from Kissflow (a request's own `App_Case_Item_Id`, an open point's own `Portal_Query_Item_Id`), never from the payload. A payload carries ids, and the integration checks them against what it reads.
