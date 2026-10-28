# K-09 and integrations: prep (Kissflow-internal)

Status: **waiting for Thomas's OK.** Nothing here has been written to either container. The checklist is plan v3 §6 (K-09 a–i). This file holds the ids and the facts the legs need.

## The app, as generated (app session, 2026-10-08 18:39 UTC; 442/442 live read-back)

| What | Id |
|---|---|
| App | `CIQ_Digital_A00` |
| Processes | `CIQ_Case_A00`, `CIQ_Open_Point_A00`, `CIQ_Change_Request_A00` |
| Forms | `CIQ_Supplier_A00`, `CIQ_Config_Version_A00`, `CIQ_Section_A00`, `CIQ_Scope_Run_A00`, `CIQ_RMES_Safety_A00`, `CIQ_RMES_Regulatory_A00`, `CIQ_Internal_Note_A00`, `CIQ_Audit_Event_A00` |
| X1 trigger step | CIQ Case "Waiting for supplier: basic data" `Activity_1kltjdn` |
| X4 trigger step | CIQ Case "Waiting for supplier: completeness PS-05" `Activity_1a281c6` |
| X5 trigger step | CIQ Case "Waiting for supplier: final release PS-11" `Activity_gwgj5o` |
| X3 trigger step | CIQ Open Point "Waiting for supplier" `Activity_4k7uck`. Guard on the integration: `OP_To_Supplier = "Yes"` |
| Y6 target | CIQ Change Request Start "Receive change request" `Activity_oz37gb`; Triage `Activity_1o6v1xh` |
| Roles | CIQ Integration Service `RoEKl89I5nGx`; CIQ RMM `RoEKl83f9jPF` |
| Lists | ids carry `_A00` (e.g. `CIQ_Yes_No_A00`, `CIQ_OP_Outcome_A00`) |
| Child tables | model id = spec id (`Rounds`, `Contacts`, `Components`, …) |
| Connections (reuse) | Kissflow Dataform 1.5.4 `CnEKHrH5GzkY`; Kissflow Process 3.7.6 `CnEKHrHqXRKB` |
| Integration recipe | `../ciq-digital/spikes/integ-*.mjs` (skeleton → resolve fields → bind selector → map → PUT → publish). Switching on is builder-only (Thomas) |

**Contact source per integration** (format: Supplier-role portal user ids, comma-separated, no spaces):

| Integrations | Source field |
|---|---|
| X1 | `CIQ_Case_A00.Portal_Contact_Ids` |
| X2 | `CIQ_Section_A00.Portal_Contact_Ids` |
| X3 | `CIQ_Open_Point_A00.Portal_Contact_Ids` |
| X4, X5 | `CIQ_Case_A00.Confirm_Contact_Ids` |
| X6 | `CIQ_Change_Request_A00.Portal_Contact_Ids` |

Every X integration must fill every Required field of its portal flow: field-level Required at Start is enforced (smoke P1/P5/P6).

## Platform facts reported by the app session (8 Oct, verified there)

1. **Participated items are broken platform-wide.** `getParticipatedItems` fails in the app too ("some error occured"). No working alternative is documented (master.md, CAFM, Promotion Management).
2. **Child-row ids:**
   - A Form create (draft → submit) replaces the child-row `_id`s it was sent.
   - A modify with an unknown row `_id` adds a duplicate row instead of being refused.
   - So always re-read rows and write by the server ids. The portal UI writes no child rows today; uploads are pending.
3. **Writes from a signed-in page through plain `fetch`** get 403 "Invalid access". Only the SDK or the native front end can write as the user. The portal UI uses the SDK.
4. **A finished item keeps one empty `_current_context`.** Completed, Rejected and Withdrawn are terminal: the portal's `itemState` already reads `_status`.
5. **The API key acts as its user.** It can submit, reject and withdraw a later step when that user is the assignee. It can't update fields after Start (only the admin PUT route can). Send-back returns 500.

## Decision needed: what a supplier sees once an item is completed

Without Participated, a supplier contact lists only:
- items they started (none: the app creates them);
- their open tasks.

So once a request, section or query is completed, it disappears from every contact's view, including its material name, INCI and number. A case that is fully released shows nothing.

**Options (for Thomas, after a test with real supplier users):**
- **A.** Carry the material header (`Trade_Name`, `Main_INCI`, `BDF_Material_No`, `Supplier_Due_Date`) on every supplier-facing portal flow, as optional fields filled by X2–X5. Open work then always shows the header. Completed history is still invisible.
- **B.** A portal "case summary" Form that suppliers can read, filtered to their own supplier. It needs a Kissflow row-level filter that isolates suppliers, which is unverified and must be tested before relying on it.
- **C.** Accept that the portal shows open work only, and that history lives in the app.

**First step on resume:** with 2 invited supplier test users, check what a supplier can read after completion (getItem with the last activity id, views). Then choose.

## Waiting for Thomas

1. OK to resume portal work and run the K-09 legs, with writes in both containers. Thomas switches each integration on in the builder.
2. At least 2 supplier test users invited to the portal's Supplier role, with their `Us…` ids typed into CIQ Supplier Contacts.
3. The decision above, after the supplier test.
