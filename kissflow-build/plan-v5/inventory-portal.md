# CIQ Supplier Portal: live inventory (2026-10-14)

Kissflow-internal. Read-only inventory of the live supplier portal in the Development sandbox `dev-beiersdorf.kissflow.eu` (account `AcDOSunMEpSA`). Production was not touched.

**How it was read.** GET requests only, through `kissflow-build/lib/kf.mjs` `client({ readOnly: true })`, which refuses any other method. 134 GETs; 4 did not answer 200 (listed under "Not read"). Nothing was written.

Machine-readable version: `inventory-portal.json` (same folder). Local records cross-checked: `ciq-supplier-portal/BUILD-LOG.md`, `portal-spec.mjs`, `K09-PREP.md`, `PARITY.md`, `UI-LOG.md`, `verify-report.json`, `sharing-probe-2026-10-07.json`, `connectors-2026-10-07.json`.

## Findings

- **F1** (flows). 9 flows: 8 Processes (7 CIQP + the throwaway ZZ Spike Assignee) and 1 Form (CIQP Help Article); 5 Lists; no Boards (case) and no Datasets. All Live, all last published on 7 Oct 2026.
- **F2** (drift). No drift against kissflow-build/ciq-supplier-portal/portal-spec.mjs: every spec field exists with the spec type and Required flag, step names match, and every draft field is also in the published runtime allfields with the same type and Required flag.
- **F3** (roles). Role membership changed since BUILD-LOG (7 Oct): Admin now has 0 members (was Thomas); Supplier has 1 member, Thomas (internal Kissflow user), which the 7 Oct rule 'Supplier has no internal test member' would fail. No external supplier user is in the Supplier role yet. User has 0 members.
- **F4** (sharing). Sharing with the app is now readable: the container flow listing GET /flow/2/{acc}/portal/CIQ_Supplier_Portal_A00/flow returns AllowedFlows per flow. Shared with CIQ Digital (Permission Lookup, all fields): CIQP Request, Section, Query, Change Request, Help Article and ZZ Spike Assignee. NOT shared: CIQP Notice, Completeness Confirmation, Final Release. Likely cause (inference): these three were created at 04:25 on 7 Oct in the v3 rebuild, after Thomas shared the flows (BUILD-LOG: around 04:13). Lists show no sharing attribute.
- **F5** (sharing). The app does not use the sharing yet: no app flow draft, app navigation or app integration references any portal flow id.
- **F6** (integrations). The portal has 0 integrations. The app has 4 (CIQ Z1 and Z2, both inactive; two ZZ Spike logs, active); none touches a portal flow. Account-wide there are 2 connections (Kissflow Dataform 1.5.4 CnEKHrH5GzkY, Kissflow Process 3.7.6 CnEKHrHqXRKB). The K-09 / X1-X6 / Y4-Y6 portal integrations do not exist.
- **F7** (ui). Custom UI is enabled. One Application component CCEK4IlNaGsH, Live, source Zip, ciq-portal-ui-71810c31a7.zip (component last modified 7 Oct 10:54:29Z). Native navigation is only the default Home page (Kissflow template: 2 labels + 1 image, no flow reference).
- **F8** (ui). The portal container was published on 14 Oct 2026 06:52:39Z by Thomas (VersionNumber 1.0.1, BuildNumber 1); no flow was republished. LastDeployedAt is still 7 Oct 09:38:29Z, earlier than the component upload (10:54:29Z); UI-LOG records Thomas's live Diagnostics check showing the 10:53 build, so the component publish seems to take effect without a portal redeploy (inference, not tested here).
- **F9** (descriptions). Four flow records still carry the v2 description while the model (draft) carries the v3 one: CIQP Notice, Request, Query, Change Request. The ZZ spike has no model description. Which text Kissflow shows to users was not checked.
- **F10** (items). The key user has 0 items in My items on every CIQP process (the smoke tests deleted theirs). CIQP Help Article has 5 rows. ZZ Spike Assignee still holds 8 items from the spikes: 4 Draft at Start and 4 In progress at 'Spike step', a step that no longer exists in its workflow (Start -> End).
- **F11** (steps). Every supplier step is assigned from the MultiUser field Assigned_Contacts (Resource ValueType Field). No step is owned by a role, no step has a condition, every workflow is Sequence. The draft shows no SLA, send-back, reject or e-mail switches on the activities (only the platform SendBackToInitiator activity).
- **F12** (roles). Supplier role Preference is null (no default page or navigation); Admin and User have Default/Default.

## Container

| | |
|---|---|
| Portal | **CIQ Supplier Portal** `CIQ_Supplier_Portal_A00`, type Portal, status Live |
| Created | 2026-10-06T20:10:08Z by Thomas |
| Last published | 2026-10-14T06:52:39Z by Thomas (version 1.0.1, build 1) |
| Last deployed | 2026-10-07T09:38:29Z |
| Custom UI | enabled |
| Description | Supplier portal for Cosmetic Ingredient Questionnaires: answer configuration questions, complete only the relevant sections, upload evidence and respond to Beiersdorf queries. |

## Roles

| Role | Id | Members | Preference | Description |
|---|---|---|---|---|
| **Admin** | `RoEK3_yhR4wx` | 0 | Default/Default | Administrator role with full privileges for this application. |
| **Supplier** | `RoEK4XPKXCvH` | 1: Thomas (User `UsEJUfjYLM8Y`) | none | Every external supplier user. Acts only on items assigned to it through Assigned_Contacts; raises change requests. |
| **User** | `RoEK3_ymADTV` | 0 | Default/Default | An end-user role with limited privileges. |

### Grants per flow (read back from `/flow/2/{acc}/{family}/{flow}/member`)

| Flow | Supplier | Admin | User |
|---|---|---|---|
| CIQP Request | Member [] | Member ["InitiateItems","View"] | none |
| CIQP Section | Member [] | Member ["InitiateItems","View"] | none |
| CIQP Query | Member [] | Member ["InitiateItems","View"] | none |
| CIQP Completeness Confirmation | Member [] | Member ["InitiateItems","View"] | none |
| CIQP Final Release | Member [] | Member ["InitiateItems","View"] | none |
| CIQP Notice | Member [] | Member ["InitiateItems","View"] | none |
| CIQP Change Request | Member ["InitiateItems"] | Member ["InitiateItems","View"] | none |
| CIQP Help Article | Viewer [] | Member ["Delete"] | none |
| ZZ Spike Assignee | none | Member ["InitiateItems"] | none |

Every process also has its system report `<Flow> All Items`, shared with the user Thomas as report Admin. The Help Article form has no reports and no form views.

## Lists

| List | Id | Status | Values | Used by |
|---|---|---|---|---|
| CIQP Change Kind | `CIQP_Change_Kind_A00` | Live | Metadata correction, Configuration answer change, Other correction, Change notice | CIQP Change Request.Change_Kind |
| CIQP Doc Kind | `CIQP_Doc_Kind_A00` | Live | SDS, CoA, Specification, Analysis, Certificate, Statement, Other | CIQP Section / Uploads.Upload_Doc_Kind |
| CIQP Response Kind | `CIQP_Response_Kind_A00` | Live | Answer, Document, Additional part completed, Cannot provide | CIQP Query.Response_Kind |
| CIQP Confirm | `CIQP_Confirm_A00` | Live | Confirmed | CIQP Section.Section_Release_Confirm; CIQP Completeness Confirmation.Supplier_Confirm; CIQP Final Release.Supplier_Confirm |
| CIQP Yes No | `CIQP_Yes_No_A00` | Live | Yes, No | CIQP Section.Section_Done |

Lists carry no sharing attribute, so whether the app can use them is **not readable**.

## Sharing with the app (CIQ Digital)

Read from `AllowedFlows` on `GET /flow/2/{acc}/portal/CIQ_Supplier_Portal_A00/flow`. This is the flow's own sharing setting, not an admin-key runtime probe.

| Flow | Shared with CIQ Digital | Permission | Fields |
|---|---|---|---|
| CIQP Request | yes | Lookup | all fields |
| CIQP Section | yes | Lookup | all fields |
| CIQP Query | yes | Lookup | all fields |
| CIQP Completeness Confirmation | **no** | — | — |
| CIQP Final Release | **no** | — | — |
| CIQP Notice | **no** | — | — |
| CIQP Change Request | yes | Lookup | all fields |
| CIQP Help Article | yes | Lookup | all fields |
| ZZ Spike Assignee | yes | Lookup | all fields |

**What the app can read:** the Lookup permission lets an app flow add a lookup to the six shared flows (all fields). No app flow, app integration or app navigation references a portal flow yet, so no read path is in use. Notice, Completeness Confirmation and Final Release are not shared at all. Whether a non-admin app user can read portal data through a lookup is **unverified** (no app lookup exists to test it).

## Flows

Order: P1–P7 as in `portal-spec.mjs`, then the throwaway spike.

| # | Type | Id | Name | Status | Fields | Child tables | Steps | Last published |
|---|---|---|---|---|---|---|---|---|
| 1 | Process | `CIQP_Request_A00` | CIQP Request | Live | 16 | — | Issue request → Supplier: submit basic data → End | 2026-10-07T09:55:39Z |
| 2 | Process | `CIQP_Section_A00` | CIQP Section | Live | 26 | Uploads (8) | Release section → Supplier: fill in section → End | 2026-10-07T04:25:22Z |
| 3 | Process | `CIQP_Query_A00` | CIQP Query | Live | 27 | — | Raise query → Supplier: respond → End | 2026-10-07T04:25:25Z |
| 4 | Process | `CIQP_Completeness_Confirmation_A00` | CIQP Completeness Confirmation | Live | 14 | — | Request completeness confirmation → Supplier: confirm completeness → End | 2026-10-07T04:25:28Z |
| 5 | Process | `CIQP_Final_Release_A00` | CIQP Final Release | Live | 14 | — | Request final release → Supplier: release → End | 2026-10-07T04:25:31Z |
| 6 | Process | `CIQP_Notice_A00` | CIQP Notice | Live | 10 | — | Send notice → Supplier: acknowledge → End | 2026-10-07T04:39:37Z |
| 7 | Process | `CIQP_Change_Request_A00` | CIQP Change Request | Live | 11 | — | Submit change request → End | 2026-10-07T04:25:36Z |
| 8 | Form | `CIQP_Help_Article_A00` | CIQP Help Article | Live | 3 | — | — (Form) | 2026-10-07T04:25:39Z |
| 9 | Process | `ZZ_Spike_Assignee_A00` | ZZ Spike Assignee | Live | 2 | — | Start → End | 2026-10-07T04:20:39Z |

### CIQP Request (Process, `CIQP_Request_A00`)

| | |
|---|---|
| Status | Live. Created 2026-10-06T21:10:42Z; flow record modified 2026-10-07T11:00:11Z; published 2026-10-07T09:55:39Z |
| Description (model) | One CIQ case cycle as the supplier sees it: case header and the basic-data task. Created from the app case. |
| Description (flow record, differs) | Supplier-facing lifecycle of one CIQ case cycle: basic data, scope check, questionnaire, review wait, final release. |
| Sharing with app | shared, Lookup, all fields |
| Grants | Supplier: Member []; Admin: Member ["InitiateItems","View"] |
| Spec drift | none |
| Published vs draft | every draft field is published with the same type and Required flag |
| Items (key user) | 0 in My items |

| Field id | Name | Type | Required | List / lookup |
|---|---|---|---|---|
| `Request_Key` | Request Key | Text | yes |  |
| `Case_Code` | Case Code | Text | yes |  |
| `Cycle_No` | Cycle No | Number | yes |  |
| `Supplier_Code` | Supplier Code | Text | yes |  |
| `App_Case_Item_Id` | App Case Item Id | Text | yes |  |
| `Trade_Name` | Trade Name | Text |  |  |
| `Main_INCI` | Main INCI | Text |  |  |
| `BDF_Material_No` | BDF Material No | Text |  |  |
| `Supplier_Display_Name` | Supplier Display Name | Text |  |  |
| `BDF_Contact_Name` | BDF Contact Name | Text | yes |  |
| `BDF_Contact_Email` | BDF Contact Email | Email | yes |  |
| `Markets_Label` | Markets Label | Text |  |  |
| `Template_Label` | Template Label | Text |  |  |
| `Supplier_Due_Date` | Supplier Due Date | Date | yes |  |
| `Case_Contacts_JSON` | Case Contacts JSON | Textarea |  |  |
| `Assigned_Contacts` | Assigned Contacts | MultiUser | yes | User lookup (no lookup/hidden fields) |

**Workflow** (Sequence). Every field not listed under a step is ReadOnly there.

| Step | Activity id | Node | Assignee | Condition | Editable | Mandatory |
|---|---|---|---|---|---|---|
| Issue request | `Activity_1fvwo2u` | StartEvent | — | — | all | — |
| Supplier: submit basic data | `Activity_1njnliq` | UserTask | Field `Assigned_Contacts` | — | — | — |
| End | `Activity_gafhuz` | EndEvent | — | — | — | — |

Runtime allfields exposes the user steps: Supplier: submit basic data `Activity_1njnliq`.

### CIQP Section (Process, `CIQP_Section_A00`)

| | |
|---|---|
| Status | Live. Created 2026-10-06T21:10:18Z; flow record modified 2026-10-07T05:30:07Z; published 2026-10-07T04:25:22Z |
| Description (model) | One released CIQ section of one case cycle: copied definition, the supplier's answers and uploads. Editable until the final release. |
| Sharing with app | shared, Lookup, all fields |
| Grants | Supplier: Member []; Admin: Member ["InitiateItems","View"] |
| Spec drift | none |
| Published vs draft | every draft field is published with the same type and Required flag |
| Items (key user) | 0 in My items |

| Field id | Name | Type | Required | List / lookup |
|---|---|---|---|---|
| `Section_Item_Key` | Section Item Key | Text | yes |  |
| `Case_Code` | Case Code | Text | yes |  |
| `Cycle_No` | Cycle No | Number | yes |  |
| `Supplier_Code` | Supplier Code | Text | yes |  |
| `App_Section_Item_Id` | App Section Item Id | Text | yes |  |
| `Section_Key` | Section Key | Text | yes |  |
| `Section_Code` | Section Code | Text | yes |  |
| `Section_Title` | Section Title | Text | yes |  |
| `Section_Sort` | Section Sort | Number |  |  |
| `Applicability_Label` | Applicability Label | Text |  |  |
| `Supplier_Reason` | Supplier Reason | Text |  |  |
| `Added_Later` | Added Later | Text |  |  |
| `Section_Origin` | Section Origin | Text | yes |  |
| `Definition_JSON` | Definition JSON | Textarea | yes |  |
| `Definition_Hash` | Definition Hash | Text | yes |  |
| `Answers_JSON` | Answers JSON | Textarea |  |  |
| `Answers_Rev` | Answers Rev | Number |  |  |
| `Answers_Changed_At` | Answers Changed At | DateTime |  |  |
| `Answers_Changed_By_Email` | Answers Changed By Email | Text |  |  |
| `Editing_By` | Editing By | Text |  |  |
| `Editing_Since` | Editing Since | DateTime |  |  |
| `Supplier_Responsible_Email` | Supplier Responsible Email | Text |  |  |
| `Supplier_Due_Date` | Supplier Due Date | Date |  |  |
| `Assigned_Contacts` | Assigned Contacts | MultiUser | yes | User lookup (no lookup/hidden fields) |
| `Section_Done` | Section Done | Select |  | list CIQP Yes No |
| `Section_Release_Confirm` | Section Release Confirm | Select |  | list CIQP Confirm |

**Child table Uploads** (`CIQP_Section_A00_Uploads`, model "CIQP Section Uploads"; published in allfields: yes)

| Column id | Name | Type | Required | List |
|---|---|---|---|---|
| `Upload_Id` | Upload Id | Text |  |  |
| `Upload_Field_Key` | Upload Field Key | Text |  |  |
| `Upload_Row_Id` | Upload Row Id | Text |  |  |
| `Upload_Doc_Kind` | Upload Doc Kind | Select |  | CIQP Doc Kind |
| `Upload_File` | Upload File | Attachment |  |  |
| `Upload_File_Name` | Upload File Name | Text |  |  |
| `Uploaded_By_Email` | Uploaded By Email | Text |  |  |
| `Uploaded_At` | Uploaded At | DateTime |  |  |

**Workflow** (Sequence). Every field not listed under a step is ReadOnly there.

| Step | Activity id | Node | Assignee | Condition | Editable | Mandatory |
|---|---|---|---|---|---|---|
| Release section | `Activity_9ue2xi` | StartEvent | — | — | Section_Item_Key, Case_Code, Cycle_No, Supplier_Code, App_Section_Item_Id, Section_Key, Section_Code, Section_Title, Section_Sort, Applicability_Label, Supplier_Reason, Added_Later, Section_Origin, Definition_JSON, Definition_Hash, Supplier_Due_Date, Assigned_Contacts | — |
| Supplier: fill in section | `Activity_ew11vl` | UserTask | Field `Assigned_Contacts` | — | Answers_JSON, Answers_Rev, Answers_Changed_At, Answers_Changed_By_Email, Editing_By, Editing_Since, Supplier_Responsible_Email, Section_Done, table Uploads | Section_Release_Confirm |
| End | `Activity_18g9iwn` | EndEvent | — | — | — | — |

Runtime allfields exposes the user steps: Supplier: fill in section `Activity_ew11vl`.

### CIQP Query (Process, `CIQP_Query_A00`)

| | |
|---|---|
| Status | Live. Created 2026-10-06T21:10:33Z; flow record modified 2026-10-07T05:30:07Z; published 2026-10-07T04:25:25Z |
| Description (model) | One round of a Beiersdorf question, document request or additional part. The supplier responds; the review happens in the app. |
| Description (flow record, differs) | Supplier side of one Beiersdorf open point: question, reference, supplier due date, response and thread. |
| Sharing with app | shared, Lookup, all fields |
| Grants | Supplier: Member []; Admin: Member ["InitiateItems","View"] |
| Spec drift | none |
| Published vs draft | every draft field is published with the same type and Required flag |
| Items (key user) | 0 in My items |

| Field id | Name | Type | Required | List / lookup |
|---|---|---|---|---|
| `Query_Key` | Query Key | Text | yes |  |
| `Round_No` | Round No | Number | yes |  |
| `Case_Code` | Case Code | Text | yes |  |
| `Cycle_No` | Cycle No | Number | yes |  |
| `Supplier_Code` | Supplier Code | Text | yes |  |
| `App_Open_Point_Id` | App Open Point Id | Text | yes |  |
| `Kind_Label` | Kind Label | Text | yes |  |
| `Responsible_Department` | Responsible Department | Text | yes |  |
| `Responsible_Name` | Responsible Name | Text | yes |  |
| `Ref_Kind` | Ref Kind | Text | yes |  |
| `Ref_Section_Key` | Ref Section Key | Text | yes |  |
| `Ref_Field_Key` | Ref Field Key | Text |  |  |
| `Ref_Row_Id` | Ref Row Id | Text |  |  |
| `Ref_Doc_Id` | Ref Doc Id | Text |  |  |
| `Ref_Doc_File_Name` | Ref Doc File Name | Text |  |  |
| `Ref_Doc_Uploaded_At` | Ref Doc Uploaded At | DateTime |  |  |
| `Ref_Label` | Ref Label | Text | yes |  |
| `Question_Text` | Question Text | Textarea | yes |  |
| `Supplier_Justification` | Supplier Justification | Textarea | yes |  |
| `Supplier_Due_Date` | Supplier Due Date | Date | yes |  |
| `Previous_Rounds_JSON` | Previous Rounds JSON | Textarea |  |  |
| `New_Section_Item_Key` | New Section Item Key | Text |  |  |
| `Assigned_Contacts` | Assigned Contacts | MultiUser | yes | User lookup (no lookup/hidden fields) |
| `Response_Kind` | Response Kind | Select |  | list CIQP Response Kind |
| `Response_Text` | Response Text | Textarea |  |  |
| `Response_Doc_Refs_JSON` | Response Doc Refs JSON | Textarea |  |  |
| `Supplier_Responsible_Email` | Supplier Responsible Email | Text |  |  |

**Workflow** (Sequence). Every field not listed under a step is ReadOnly there.

| Step | Activity id | Node | Assignee | Condition | Editable | Mandatory |
|---|---|---|---|---|---|---|
| Raise query | `Activity_rngj1n` | StartEvent | — | — | Query_Key, Round_No, Case_Code, Cycle_No, Supplier_Code, App_Open_Point_Id, Kind_Label, Responsible_Department, Responsible_Name, Ref_Kind, Ref_Section_Key, Ref_Field_Key, Ref_Row_Id, Ref_Doc_Id, Ref_Doc_File_Name, Ref_Doc_Uploaded_At, Ref_Label, Question_Text, Supplier_Justification, Supplier_Due_Date, Previous_Rounds_JSON, New_Section_Item_Key, Assigned_Contacts | — |
| Supplier: respond | `Activity_qohzey` | UserTask | Field `Assigned_Contacts` | — | Response_Text, Response_Doc_Refs_JSON, Supplier_Responsible_Email | Response_Kind |
| End | `Activity_49tjko` | EndEvent | — | — | — | — |

Runtime allfields exposes the user steps: Supplier: respond `Activity_qohzey`.

### CIQP Completeness Confirmation (Process, `CIQP_Completeness_Confirmation_A00`)

| | |
|---|---|
| Status | Live. Created 2026-10-07T04:25:26Z; flow record modified 2026-10-07T05:30:07Z; published 2026-10-07T04:25:28Z |
| Description (model) | The supplier confirms that the questionnaire is complete (PS-05). This is not the final release: data stays editable. Created from the app case. |
| Sharing with app | not shared |
| Grants | Supplier: Member []; Admin: Member ["InitiateItems","View"] |
| Spec drift | none |
| Published vs draft | every draft field is published with the same type and Required flag |
| Items (key user) | 0 in My items |

| Field id | Name | Type | Required | List / lookup |
|---|---|---|---|---|
| `Confirmation_Key` | Confirmation Key | Text | yes |  |
| `Case_Code` | Case Code | Text | yes |  |
| `Cycle_No` | Cycle No | Number | yes |  |
| `Supplier_Code` | Supplier Code | Text | yes |  |
| `App_Case_Item_Id` | App Case Item Id | Text | yes |  |
| `Declaration_Text` | Declaration Text | Textarea | yes |  |
| `Declaration_Text_Key` | Declaration Text Key | Text | yes |  |
| `Supplier_Due_Date` | Supplier Due Date | Date |  |  |
| `Assigned_Contacts` | Assigned Contacts | MultiUser | yes | User lookup (no lookup/hidden fields) |
| `Supplier_Confirm` | Supplier Confirm | Select |  | list CIQP Confirm |
| `Confirmed_By_Name` | Confirmed By Name | Text |  |  |
| `Confirmed_By_Email` | Confirmed By Email | Email |  |  |
| `Confirmed_By_Role` | Confirmed By Role | Text |  |  |
| `Confirmed_At` | Confirmed At | DateTime |  |  |

**Workflow** (Sequence). Every field not listed under a step is ReadOnly there.

| Step | Activity id | Node | Assignee | Condition | Editable | Mandatory |
|---|---|---|---|---|---|---|
| Request completeness confirmation | `Activity_1324i3t` | StartEvent | — | — | Confirmation_Key, Case_Code, Cycle_No, Supplier_Code, App_Case_Item_Id, Declaration_Text, Declaration_Text_Key, Supplier_Due_Date, Assigned_Contacts | — |
| Supplier: confirm completeness | `Activity_1ag8hlf` | UserTask | Field `Assigned_Contacts` | — | — | Supplier_Confirm, Confirmed_By_Name, Confirmed_By_Email, Confirmed_By_Role, Confirmed_At |
| End | `Activity_16m5i9o` | EndEvent | — | — | — | — |

Runtime allfields exposes the user steps: Supplier: confirm completeness `Activity_1ag8hlf`.

### CIQP Final Release (Process, `CIQP_Final_Release_A00`)

| | |
|---|---|
| Status | Live. Created 2026-10-07T04:25:29Z; flow record modified 2026-10-07T05:30:07Z; published 2026-10-07T04:25:31Z |
| Description (model) | The supplier's single final release of the questionnaire (PS-11). After it, nothing can be changed. Created from the app case. |
| Sharing with app | not shared |
| Grants | Supplier: Member []; Admin: Member ["InitiateItems","View"] |
| Spec drift | none |
| Published vs draft | every draft field is published with the same type and Required flag |
| Items (key user) | 0 in My items |

| Field id | Name | Type | Required | List / lookup |
|---|---|---|---|---|
| `Confirmation_Key` | Confirmation Key | Text | yes |  |
| `Case_Code` | Case Code | Text | yes |  |
| `Cycle_No` | Cycle No | Number | yes |  |
| `Supplier_Code` | Supplier Code | Text | yes |  |
| `App_Case_Item_Id` | App Case Item Id | Text | yes |  |
| `Declaration_Text` | Declaration Text | Textarea | yes |  |
| `Declaration_Text_Key` | Declaration Text Key | Text | yes |  |
| `Supplier_Due_Date` | Supplier Due Date | Date |  |  |
| `Assigned_Contacts` | Assigned Contacts | MultiUser | yes | User lookup (no lookup/hidden fields) |
| `Supplier_Confirm` | Supplier Confirm | Select |  | list CIQP Confirm |
| `Confirmed_By_Name` | Confirmed By Name | Text |  |  |
| `Confirmed_By_Email` | Confirmed By Email | Email |  |  |
| `Confirmed_By_Role` | Confirmed By Role | Text |  |  |
| `Confirmed_At` | Confirmed At | DateTime |  |  |

**Workflow** (Sequence). Every field not listed under a step is ReadOnly there.

| Step | Activity id | Node | Assignee | Condition | Editable | Mandatory |
|---|---|---|---|---|---|---|
| Request final release | `Activity_sefw4p` | StartEvent | — | — | Confirmation_Key, Case_Code, Cycle_No, Supplier_Code, App_Case_Item_Id, Declaration_Text, Declaration_Text_Key, Supplier_Due_Date, Assigned_Contacts | — |
| Supplier: release | `Activity_1gx3sjo` | UserTask | Field `Assigned_Contacts` | — | — | Supplier_Confirm, Confirmed_By_Name, Confirmed_By_Email, Confirmed_By_Role, Confirmed_At |
| End | `Activity_ofz8a4` | EndEvent | — | — | — | — |

Runtime allfields exposes the user steps: Supplier: release `Activity_1gx3sjo`.

### CIQP Notice (Process, `CIQP_Notice_A00`)

| | |
|---|---|
| Status | Live. Created 2026-10-07T04:25:32Z; flow record modified 2026-10-07T05:30:07Z; published 2026-10-07T04:39:37Z |
| Description (model) | A message from Beiersdorf that the supplier acknowledges, e.g. a change-request outcome or a scope change. Not used for cancellation or closure (those go by e-mail, so no supplier task stays open). |
| Description (flow record, differs) | A message from Beiersdorf to the supplier, e.g. a change-request outcome, a scope change or a case closure. The supplier acknowledges it. |
| Sharing with app | not shared |
| Grants | Supplier: Member []; Admin: Member ["InitiateItems","View"] |
| Spec drift | none |
| Published vs draft | every draft field is published with the same type and Required flag |
| Items (key user) | 0 in My items |

| Field id | Name | Type | Required | List / lookup |
|---|---|---|---|---|
| `Notice_Key` | Notice Key | Text | yes |  |
| `Notice_Kind` | Notice Kind | Text | yes |  |
| `Case_Code` | Case Code | Text | yes |  |
| `Cycle_No` | Cycle No | Number | yes |  |
| `Supplier_Code` | Supplier Code | Text | yes |  |
| `App_Notice_Item_Id` | App Notice Item Id | Text | yes |  |
| `Notice_Title` | Notice Title | Text | yes |  |
| `Notice_Text` | Notice Text | Textarea | yes |  |
| `Related_Key` | Related Key | Text |  |  |
| `Assigned_Contacts` | Assigned Contacts | MultiUser | yes | User lookup (no lookup/hidden fields) |

**Workflow** (Sequence). Every field not listed under a step is ReadOnly there.

| Step | Activity id | Node | Assignee | Condition | Editable | Mandatory |
|---|---|---|---|---|---|---|
| Send notice | `Activity_nel5eh` | StartEvent | — | — | all | — |
| Supplier: acknowledge | `Activity_t6gsv3` | UserTask | Field `Assigned_Contacts` | — | — | — |
| End | `Activity_1jztbgk` | EndEvent | — | — | — | — |

Runtime allfields exposes the user steps: Supplier: acknowledge `Activity_t6gsv3`.

### CIQP Change Request (Process, `CIQP_Change_Request_A00`)

| | |
|---|---|
| Status | Live. Created 2026-10-06T21:10:38Z; flow record modified 2026-10-07T05:30:07Z; published 2026-10-07T04:25:36Z |
| Description (model) | A correction or change notice raised by the supplier. Triage and assessment happen in the app; the outcome comes back as a CIQP Notice. |
| Description (flow record, differs) | Supplier-initiated change request: triaged by RMM, assessed by the owning department. After the final release every request is refused and logged. |
| Sharing with app | shared, Lookup, all fields |
| Grants | Supplier: Member ["InitiateItems"]; Admin: Member ["InitiateItems","View"] |
| Spec drift | none |
| Published vs draft | every draft field is published with the same type and Required flag |
| Items (key user) | 0 in My items |

| Field id | Name | Type | Required | List / lookup |
|---|---|---|---|---|
| `CR_Key` | CR Key | Text | yes |  |
| `Case_Code` | Case Code | Text | yes |  |
| `Cycle_No` | Cycle No | Number | yes |  |
| `Supplier_Code` | Supplier Code | Text | yes |  |
| `Change_Kind` | Change Kind | Select | yes | list CIQP Change Kind |
| `Section_Key` | Section Key | Text |  |  |
| `Field_Key` | Field Key | Text |  |  |
| `Row_Id` | Row Id | Text |  |  |
| `Current_Value_Text` | Current Value Text | Textarea |  |  |
| `Proposed_Value_JSON` | Proposed Value JSON | Textarea | yes |  |
| `Change_Reason` | Change Reason | Textarea | yes |  |

**Workflow** (Sequence). Every field not listed under a step is ReadOnly there.

| Step | Activity id | Node | Assignee | Condition | Editable | Mandatory |
|---|---|---|---|---|---|---|
| Submit change request | `Activity_cktkvw` | StartEvent | — | — | all | — |
| End | `Activity_1l91vu8` | EndEvent | — | — | — | — |

Runtime allfields exposes the user steps: none.

### CIQP Help Article (Form, `CIQP_Help_Article_A00`)

| | |
|---|---|
| Status | Live. Created 2026-10-06T21:10:03Z; flow record modified 2026-10-07T04:26:27Z; published 2026-10-07T04:25:39Z |
| Description (model) | Supplier-agnostic FAQ and quick-start guide (CIA #34). Every portal user may read every row by design. |
| Sharing with app | shared, Lookup, all fields |
| Grants | Supplier: Viewer []; Admin: Member ["Delete"] |
| Spec drift | none |
| Published vs draft | every draft field is published with the same type and Required flag |
| Items (key user) | 5 rows |

| Field id | Name | Type | Required | List / lookup |
|---|---|---|---|---|
| `Article_Title` | Article Title | Text | yes |  |
| `Article_Body` | Article Body | Textarea | yes |  |
| `Sort_Order` | Sort Order | Number |  |  |

### ZZ Spike Assignee (Process, `ZZ_Spike_Assignee_A00`)

| | |
|---|---|
| Status | Live. Created 2026-10-06T21:02:35Z; flow record modified 2026-10-07T05:25:06Z; published 2026-10-07T04:20:39Z |
| Description (model) | — |
| Description (flow record, differs) | Throwaway probe: field-driven step assignee. Safe to delete. |
| Sharing with app | shared, Lookup, all fields |
| Grants | Admin: Member ["InitiateItems"] |
| Spec drift | no spec entry (not part of portal-spec.mjs) |
| Published vs draft | every draft field is published with the same type and Required flag |
| Items (key user) | 8 in My items: Draft@Start, InProgress@Spike step, InProgress@Spike step, Draft@Start, InProgress@Spike step, Draft@Start, InProgress@Spike step, Draft@Start |

| Field id | Name | Type | Required | List / lookup |
|---|---|---|---|---|
| `Probe_Title` | Probe Title | Text | yes |  |
| `Probe_Note` | Probe Note | Textarea |  |  |

**Workflow** (Sequence). Every field not listed under a step is ReadOnly there.

| Step | Activity id | Node | Assignee | Condition | Editable | Mandatory |
|---|---|---|---|---|---|---|
| Start | `Activity_z5b98q` | StartEvent | — | — | all | — |
| End | `Activity_1po4umr` | EndEvent | — | — | — | — |

Runtime allfields exposes the user steps: none.

## Integrations and connections

- **Portal integrations:** 0 (`GET /flow/2/{acc}/integration?_application_id=CIQ_Supplier_Portal_A00`).
- **App integrations** (read to see whether any touches the portal): 4, none references a portal flow.
  - CIQ Z2 Case cancelled – neutral e-mail `CIQ_Z2_Case_cancelled_neutral_e_ma_A00`: Live, inactive
  - CIQ Z1 Case completed – PDF, e-mails, notification event `CIQ_Z1_Case_completed_PDF_e_mails__A00`: Live, inactive
  - CIQ ZZ Spike log – point completed `CIQ_ZZ_Spike_log_point_completed_A00`: Live, active
  - CIQ ZZ Spike log – register created `CIQ_ZZ_Spike_log_register_created_A00`: Live, active
- **Connections** (account-wide): CIQ ZZ Spike Kissflow Dataform connection `CnEKHrH5GzkY` (Kissflow Dataform 1.5.4); CIQ ZZ Spike Kissflow Process connection `CnEKHrHqXRKB` (Kissflow Process 3.7.6).
- **Connector subscriptions:** 62 (account-wide; includes Kissflow Process, Dataform, Notification, Webhooks, HTTP, Email).
- **Planned but absent:** X1–X6 (app → portal creates), Y4–Y6 (portal → app), the K-09 legs and the open-point webhook e-mail. See `ciq-supplier-portal/K09-PREP.md`.

## Pages, navigation and custom UI

| | |
|---|---|
| Navigation | Main Navigation `Navigation001` (default): Home → Page:Home_Page_A01 |
| Page `Home_Page_A01` | Home Page: Default home page generated by Kissflow. Components: Label (general/label), Label (general/label), Image (general/image). Portal flow references: none |
| Custom UI component | App custom UI bundle `CCEK4IlNaGsH`: category Application, Live, source Zip, layout Web, last modified 2026-10-07T10:54:29Z |
| Deployed build | `ciq-portal-ui-71810c31a7.zip` (manifest draft read: 200). Matches `deploy-report.json` and UI-LOG (build stamp 2026-10-07T10:53:39.182Z). The newer local zips in `prototype/dist-portal/` were not uploaded (PARITY.md) |
| Portal deploy | LastDeployedAt 2026-10-07T09:38:29Z; container last published 2026-10-14T06:52:39Z |
| Runtime URL | https://dev-beiersdorf.kissflow.eu/view/portal/CIQ_Supplier_Portal_A00 |

## Not read or not readable

| What | How | Result |
|---|---|---|
| Portal page list | GET /flow/2/{acc}/application/CIQ_Supplier_Portal_A00/page/ | 403. Pages were found through the container draft instead (DefaultPage + navigation): only Home_Page_A01. |
| Application-style flow list for the portal | GET /flow/2/{acc}/application/CIQ_Supplier_Portal_A00/flow?all_flows=true | 403; the portal route /flow/2/{acc}/portal/{id}/flow answered 200 and is used instead. |
| Portal record on the application route | GET /flow/2/{acc}/application/CIQ_Supplier_Portal_A00 | 404 (it is a Portal); /flow/2/{acc}/portal/{id} and /app/{id}/info answered. |
| App flows through the portal route | GET /flow/2/{acc}/portal/CIQ_Digital_A00/flow | 403 (429 first, retried). |
| List sharing with the app | list records and list listing | No AllowedFlows/SharedWith attribute on lists; not readable. |
| Runtime proof of sharing | admin key reads every portal flow under the app id with 200 | Admin-key reads can't prove what a non-admin app user can read; only the AllowedFlows metadata is evidence. |
| Per-step switches (send-back, reject, e-mail, SLA) | process drafts | Not present in the draft blob; their live setting is unknown (MT-12). |
| Portal user directory / invited supplier users | no documented GET endpoint | Only role membership was read. |
| All items of each process | processes list only through /myitems (key user) | Counts are 'items the key user started', not all items. No admin all-items list over REST. |
| The deployed bundle's contents | not downloaded | Only the component record and manifest were read (zip name, Live, source Zip). |
| Field-level visibility or form-view rules on the Help Article | formview list | 200 with no form views; no reports on the form. |

Requests that did not answer 200:

- 404 `/flow/2/{acc}/application/CIQ_Supplier_Portal_A00`
- 403 `/flow/2/{acc}/application/CIQ_Supplier_Portal_A00/flow?page_size=500&all_flows=true&_application_id=CIQ_Supplier_Portal_A00`
- 403 `/flow/2/{acc}/application/CIQ_Supplier_Portal_A00/page/?_application_id=CIQ_Supplier_Portal_A00`
- 403 `/flow/2/{acc}/portal/CIQ_Digital_A00/flow` (first attempt 429 (rate limit), retried: 403)
