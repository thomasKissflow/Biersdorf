# CIQ Digital: backend overview for the Beiersdorf technical team

**Session:** 16 October 2026.
**Environment:** the Beiersdorf development sandbox on Kissflow (`dev-beiersdorf.kissflow.eu`). Production is not touched.
**Build status:** as read back from the sandbox on the morning of 15 October 2026, after the agreed changes were applied and checked independently.
**Data:** every example and test record is fictional and carries the prefix `ZZT-`.

**Evidence at a glance:**

| Check | Result |
|---|---|
| Automated read-back of the internal app against the agreed design | 172 checks: 167 pass, **0 fail**, 5 warnings (housekeeping, §7.3) |
| Independent check of the internal app, with every expectation taken from the design text | 311 checks: 295 pass, **0 fail**, 16 warnings: native step durations (7), raiser assignment (1), mail link mapping (1), housekeeping on test objects and role names (7). All are listed in §7 |
| Automated read-back of the supplier portal | 434 checks: 433 pass. The open check is a developer test account still in the Supplier role; it is removed before the user tests |
| Sync Service | 55 automated tests pass offline. First live runs against the sandbox on 15 October passed (§5.5) |

Every verification call was read-only and paced; none was answered with a rate limit.

**Status tags used in this document:**

| Tag | Meaning |
|---|---|
| **Built** | Exists in the sandbox. Every write was read back and compared with what was sent. |
| **Built, tested** | Built, and exercised end to end on a fictional test item. |
| **Built, off** | Built and published, but not switched on yet. |
| **Prepared** | Scripted and validated by a dry run against the live sandbox. Applied next. |
| **Next** | Agreed, not built yet. |
| **Pattern** | A recommended integration approach. It is not part of the MVP. |
| **To be verified** | Depends on a platform behaviour that has not been tested in this sandbox yet. A fallback is named. |

---

## 1. Architecture on one page

### 1.1 Components

| Component | What it is | Who uses it | Status |
|---|---|---|---|
| **CIQ Digital** (`CIQ_Digital_A00`) | The internal Kissflow app: 3 processes, 10 forms in use, 27 lists, 13 roles | Beiersdorf users only | **Built** to the agreed design, with grants applied. Open items in §7 |
| **CIQ Supplier Portal** (`CIQ_Supplier_Portal_A00`) | A separate Kissflow container with one role, **Supplier** | External supplier users only | **Built.** Read-back 433 of 434 (see above) |
| **CIQ Sync Service** | An external Node.js program (Node 20, no runtime dependencies). It is the only bridge between the two containers, and it also produces the final document and PDF | Runs unattended with one Kissflow access key, held server-side | **Built.** 55 automated tests offline, including an 8-stage end-to-end case. First live runs on 15 October (request check, refusal, write-back, audit row). The full live run on a fictional case and the hosting are **Next** (§7) |
| **Mail outbox** | The form CIQ Mail Outbox plus the Kissflow integration "CIQ Mail – send outbox mail" (Email connector) | Written by the service; sent by Kissflow | **Built, off** |
| **Workbench** (internal UI) and **portal UI** | Kissflow custom UIs. They act in the signed-in user's own session through the Kissflow client SDK and never hold an access key | Beiersdorf users; suppliers | Being reworked to the agreed prototype screens. Not the subject of this session |

### 1.2 Diagram

```
   Supplier users                                         Beiersdorf users
         |                                                        |
         | portal UI (user's own session)                         | Workbench (user's own session)
         v                                                        v
+------------------------------+                +-----------------------------------+
| Supplier portal              |                | CIQ Digital (internal app)        |
| role: Supplier (external)    |                | roles: Beiersdorf only            |
|                              |                |                                   |
|  CIQP Request  "the CIQ"     |                |  CIQ Case           (process)     |
|  CIQP Query    one per round |                |  CIQ Review         (process)     |
|  CIQP Final Release          |                |  CIQ Open Point     (process)     |
|  CIQP Help Article  (form)   |                |  CIQ Case Data      (form)        |
+--------------^---------------+                |  CIQ Service Request(form)        |
               |                                |  CIQ Audit Event    (form)        |
               | REST, access key               |  CIQ Supplier, Config Version,    |
               | (server-side only)             |  Scope Run, RMES x2, Note (forms) |
               |                                |  CIQ Mail Outbox    (form) --+    |
               |                                +---------------^--------------|----+
               |                                                |              |
               +---------------- CIQ Sync Service --------------+              | trigger:
                                 every 60 s:                                   | "item created"
                                 1. read new Service Requests,                 v
                                    notes, and the portal items   +-----------------------------+
                                    whose ids it stored           | Integration                 |
                                 2. check each request            | "CIQ Mail – send outbox     |
                                 3. write both containers         |  mail": Email connector,    |
                                 4. write audit rows and          |  then marks the row "Sent"  |
                                    mail rows                     +--------------+--------------+
                                 5. at the supplier's release:                   v
                                    final document, seal, PDF       e-mail to suppliers and
                                    attached to CIQ Case            Beiersdorf users
```

### 1.3 Design rules

1. **The containers are isolated.** There is no native cross-container integration and no lookup between them. The portal never reads app data, and the app never reads portal items directly. The service carries every hand-off.
2. **Every portal item has an app twin:**
   - CIQP Request ↔ CIQ Case;
   - each CIQP Query round ↔ a CIQ Open Point;
   - CIQP Final Release ↔ the release step of CIQ Case.
3. **People act only on the items they hold.** For anything else, the Workbench files a **CIQ Service Request** row. The service checks who asked and whether that person may do it, carries it out, and writes the result and the audit row.
4. **Single writers.** The service is the only writer of:
   - CIQ Case Data;
   - CIQ Audit Event;
   - CIQ Mail Outbox;
   - CIQ Scope Run;
   - and it is the only actor on the two system-held steps of CIQ Case.

   The grants enforce this (§4.2).
5. **Expected delay.**
   - An effect in the other container appears within one service run, about 1 minute.
   - In sandbox tests, a Kissflow form trigger fired its integration within about 6 seconds.
6. **One rules engine.** The rules, scope, requested documents and validation of the agreed prototype are packaged once and used by the portal UI (live scope), the Workbench and the service. A scope is therefore the same everywhere.
7. **Two layers of checks.** Kissflow's grants and step assignments are the first layer. The UIs' gates and the service's server-side checks are the second, because some platform checks do not apply to API calls (§4.3, principle 6).

---

## 2. Data model

**Conventions:**
- Flow ids end in `_A00`. App flows start with "CIQ ", portal flows with "CIQP ".
- In the REST API a child table is addressed as `Table::<child table id>`.
- Only one native Kissflow reference exists (RMES → Case). Every other link is a Text field that holds the other item's id or business key, written by the service. Kissflow has no unique constraint, so each record type has its own business key (§2.5).
- Fields from the earlier design stay published, because Kissflow can't delete a published field. They are **Hidden at every step**, so the native forms stay clean.

### 2.1 App processes

#### CIQ Case `CIQ_Case_A00`: Built, tested

**Purpose.** The backbone of one CIQ case cycle, from the Raw Material Manager's start to the sealed final document.
- People work on CIQ Review and CIQ Open Point.
- The case itself waits in two system-held steps.
- The phase is a field (`Case_Phase`), so a phase change is a plain field write.

**Fields.** 144 published fields: 63 in use, and 81 from the earlier design Hidden at every step. At Start, 21 fields are Mandatory and 11 Editable. At the two system-held steps and at End, every in-use field is read-only for people.

| Group | Fields |
|---|---|
| Identity | `Case_Code` (CIQ-2026-NNNN), `Cycle_No`, `Case_Title`, `Priority`, `Trade_Name`, `Main_INCI`, `BDF_Material_No`, `SAP_Material_No`, `IRMA_Ref`, `Case_Test` |
| Supplier and contacts | `Supplier_Code`, `Supplier_Legal_Name`, `Case_Contacts_JSON`, `Portal_Contact_Ids`, `Confirm_Contact_Ids`, `Supplier_Contact_Emails`, `Supplier_Due_Date`, `Owner_RMM`, `BDF_Contact_Name`, `BDF_Contact_Email`, `Target_Markets_Text` |
| Configuration pinning (§6.2) | `Release_Item_Id`, `Release_Key`, `Manifest_Hash`, `Rule_Set_Version`, `Template_Version` |
| Phase and lifecycle (written by the service) | `Case_Phase`, `Cancel_Reason`, `Cancelled_By_Name`, `Cancelled_At`, `Cancelled_From_Phase`, `Reactivate_Reason`, `Reactivated_At`, `Release_Requested_At`, `Undefined_Origin` |
| Follow-up | `Duplicate_Reason`, `Follow_Up_Of_Case`, `Follow_Up_Of_Report` |
| Supplier confirmations (copies from the portal) | `Completeness_Confirm/By_Name/By_Email/By_Role/At`, `Final_Release_Confirm/By_Name/By_Email/By_Role/At` |
| Links | `Portal_Request_Item_Id`, `Portal_Release_Item_Id`, `Case_Data_Item_Id`, `Request_Key`, `RMES_Key` |
| Documents | `Supplier_Files` (Attachment: a copy of every supplier file), `Final_PDF` (Attachment), `Final_Document_Hash`, `Final_Document_At` |

**Child tables:** none.

#### CIQ Review `CIQ_Review_A00`: Built

**Purpose.** One item per department review activation:
- at completeness;
- added later;
- reopened;
- reactivated.

It replaces fixed parallel lanes, so a review can start late, reopen and be reassigned. A Kissflow parallel branch can't do this once it has been submitted.

**Fields (30):**

| Group | Fields |
|---|---|
| Keys | `Review_Key` (`<Case_Code>-<Dept>-<Round>`, required), `Case_Code` (required), `Case_Item_Id` (required), `Cycle_No`, `Supplier_Code`, `Trade_Name` |
| Routing | `Review_Dept` (REG, SAF, QM, MIC, SUS, RMM; required) |
| Activation | `Round_No`, `Activation_Kind`, `Activation_Reason`, `Activated_By_Name` |
| Assignee | `Assignee_User`, `Assignee_Name`, `Assignee_Email`, `Reassign_Reason` |
| Status | `Track_Status`, `Open_Count`, `RMES_Gaps`, `Review_Gate` (formula: "OK" only when no own open point and no RMES gap is left; blank-safe) |
| Completion | `Review_Confirm`, `Completed_By`, `Completed_By_Name`, `Completed_By_Email`, `Completed_At`, `On_Behalf_Of` |
| Safety and Regulatory only | `RMES_Decision`, `RMES_Decision_Reason` |
| RMM only | `Rejection_Handling`, `Rejection_Note`, `Rejected_Depts_Covered` |

#### CIQ Open Point `CIQ_Open_Point_A00`: Built, tested

**Purpose.** One item per open point: a question or document request to the supplier, a finding, or an additional part. The point stays at the raising department's step through every question round.

**Fields.** 58 published fields: 43 in use. The 15 fields of the earlier design and its `Rounds` child table are Hidden at every step (`Thread_JSON` replaces the table).

| Group | Fields |
|---|---|
| Keys | `OP_Key`, `Round_No`, `Query_Key`, `Case_Code`, `Case_Item_Id`, `Cycle_No`, `Supplier_Code` |
| Classification | `OP_Kind`, `OP_Dept` (field-level Required; one of the six department codes), `Raised_By_Dept`, `OP_To_Supplier` |
| Raiser | `Raised_By_User`, `Raised_By_Name` |
| Reference (what the point is about: section, field, component row, document, RMES finding) | `Ref_*`, `Ref_Internal_Key` |
| Content | `Kind_Label`, `Question_Text`, `Supplier_Justification`, `Responsible_User`, `Responsible_Name`, `Supplier_Due_Date` |
| Supplier response | `Response_Kind`, `Response_Text`, `Response_Doc_Refs_JSON`, `Supplier_Responsible_Email`, `Portal_Query_Item_Id` |
| Status | `OP_Progress` (Open / In progress), `OP_Outcome` (Accepted / Withdrawn / Not accepted), `Return_Reason`, `Outcome_Reason` (internal only), `Open_Num` (formula `IF(ISBLANK(OP_Outcome),1,0)`) |
| Thread and close | `Thread_JSON` (every round, answer, return, edit, acceptance and close, in order; the source for the supplier's history and the final document), `Closed_At`, `Closed_By` |
| **Prepared** | `Raiser_Assignee` (multi-user): the raiser, so the department step is assigned to that person only (§3.4) |

### 2.2 App forms

| Form | Id | Purpose | Key fields | Child tables | Status |
|---|---|---|---|---|---|
| **CIQ Case Data** | `CIQ_Case_Data_A00` | The Workbench's read model and the mirror of the supplier's data. One row per case; the service is its only writer | 43 header fields: keys (`Case_Code` required, `Case_Item_Id`, `Portal_Request_Item_Id`), case summary for lists (supplier name, DUNS, material, owner, `Case_Phase`, dates, versions), supplier data (`Answers_JSON`, `Answered_By_JSON`, `Justifications_JSON`, `Scope_JSON`, `Answers_Rev`), work summaries (`Tracks_JSON`, `Open_Points_JSON`, `Confirmations_JSON`, counts), final document (`Final_Document_JSON`, `Final_Document_Hash`, `Final_PDF`), sync (`Synced_At`, `Sync_Note`) | `CIQ_Case_Data_A00_Components` (INCI, CAS, EC, function, additive, origin, concentration range), `…_Documents` (file metadata; `Doc_Attachment_Id` points at the file in `CIQ_Case_A00.Supplier_Files`), `…_Requested_Documents` (key `EV:…`, document, section, reason in supplier wording, status, justification), `…_Change_Reports` | Built |
| **CIQ Service Request** | `CIQ_Service_Request_A00` | The Workbench's command channel to the service (§5.5) | `Request_Key` (required, idempotency), `Request_Code`, `Case_Code`, `Object_Key`, `Payload_JSON`, `Request_Status` (Done · Refused · Failed; blank = waiting), `Result_Note`, `Result_Item_Id`, `Processed_At`, `Attempt_No` | — | Built; used live (§5.5) |
| **CIQ Mail Outbox** | `CIQ_Mail_Outbox_A00` | One row = one e-mail (§5.6) | `Mail_Key` (required, idempotency), `Event_Code`, `Audience`, `To_Emails`, `Subject`, `Body_Text`, `Link_Url`, `Case_Code`, `Related_Key`, `Created_At`, `Sent_Status`, `Attempt_No` | — | Built |
| **CIQ Supplier** | `CIQ_Supplier_A00` | Supplier master. Only the Business administrator (and the service) edits it | `Supplier_Code` (required), `Supplier_Legal_Name` (required), `DUNS_Number`, `SAP_Vendor_Id`, `Teamcenter_Supplier_Id`, `Supplier_Kind`, `Supplier_Country_Code`, `Supplier_City`, `Supplier_Active`, `Supplier_Test` | `Contacts`: `Contacts_Key`, `Contacts_Full_Name`, `Contacts_Email`, `Contacts_Title`, `Contacts_Can_Confirm`, `Contacts_Active`, `Contacts_Deactivated_At`, `Contacts_Portal_User_Id`, `Contacts_Invite_Requested_At`, `Contacts_Invited_At` | Built |
| **CIQ Config Version** | `CIQ_Config_Version_A00` | Versioned configuration as data (§6.1) | `Config_Key` (required), `Config_Kind` (required), `Version_Label`, `Config_State`, `Payload_JSON`, `Change_Note`, `Release_Manifest_JSON`, `Release_Bundle_JSON`, `Manifest_Hash`, `Regression_Result_JSON`, `Published_By`, `Published_At` | — | Built and seeded: 12 rows (§6.1) |
| **CIQ Scope Run** | `CIQ_Scope_Run_A00` | One row per scope milestone: completeness, growth during review, a section added by a department, reactivation | `Run_Key` (required), `Case_Code`, `Scope_Trigger`, `Rule_Set_Version`, `Evaluator_Version`, `Input_JSON`, `Input_Hash`, `Result_JSON`, `Added_Section_Keys`, `Lead_Departments`, `Override_Justification` | — | Built |
| **CIQ RMES Safety** / **CIQ RMES Regulatory** | `CIQ_RMES_Safety_A00` / `CIQ_RMES_Regulatory_A00` | Raw Material Evaluation Sheet, one per department and case. Internal only, own department only | `RMES_Key` (required), `Result_Case` (native reference → CIQ Case), `Case_Code`, open counts, `Editing_By`/`Editing_Since` (edit lock hint) | `Safety_Criteria` / `Regulatory_Criteria` (33 columns: criterion, applicability, source, result, limit check, AI suggestion state), `Safety_Findings` / `Regulatory_Findings` (`Findings_Key`, text, criterion, blocking, state, linked open point) | Built |
| **CIQ Internal Note** | `CIQ_Internal_Note_A00` | Internal notes on a case or a section, with @mentions | `Note_Key`, `Case_Code`, `Linked_Kind`, `Linked_Key`, `Note_Text` (required), `Note_Author`, `Note_Dept`, `Note_At`, `Note_Mentions_Emails`, `Note_Mentions_Names` | — | Built |
| **CIQ Audit Event** | `CIQ_Audit_Event_A00` | Case history and global audit trail (§6.3) | 31 fields: `Event_Key`, `Case_Code`, `Event_At`, `Event_Category` (required), `Action_Code`, actor (side, name, e-mail, department, role), `On_Behalf_Of`, object (kind, key, item id, state), `Old_Value_Text`, `New_Value_Text`, `Event_Reason`, `Snapshot_JSON` | — | Built |

**Not used any more:** CIQ Section (form) and CIQ Change Request (process). They stay published, because the API can't delete them. Only the Case administrator has access to them (**Built**).

### 2.3 Portal flows (summary)

| Flow | Type | Purpose |
|---|---|---|
| **CIQP Request** `CIQP_Request_A00` | Process | "The CIQ": one item per case, from the invitation to the end. It holds:<ul><li>the supplier's answers (JSON), live scope and requested documents;</li><li>the uploads: child table `CIQP_Request_A00_Uploads`, with the files themselves in the header Attachment field `Supplier_Files`;</li><li>the completeness confirmation and the change reports;</li><li>the pinned, supplier-safe configuration bundle with its SHA-256 hash.</li></ul> |
| **CIQP Query** `CIQP_Query_A00` | Process | One item per question round of an open point |
| **CIQP Final Release** `CIQP_Final_Release_A00` | Process | The supplier's final release task |
| **CIQP Help Article** `CIQP_Help_Article_A00` | Form | The portal's help page content (9 articles) |

### 2.4 Lists (app)

There are 27 lists. Each one's items are replaced as a whole set, so a changed list keeps every old value and old records stay valid.

| List | Values | Status |
|---|---|---|
| CIQ Case Phase | Supplier filling in the CIQ · Review · Awaiting final release · Completed · Cancelled | Built (new) |
| CIQ Track Status | In review · Waiting for supplier · Reopened · Completed · Ended | Built (new) |
| CIQ Priority | Normal · High | Built (new) |
| CIQ Rejection Handling | Continue to final release · Cancel the case | Built (new) |
| CIQ Request Status | Done · Refused · Failed | Built (new) |
| CIQ OP Kind | Query · Document request · Additional part · Internal review · Department review · Contact update · **Finding** | Built (value added) |
| CIQ OP Outcome | Accepted · Withdrawn · **Not accepted** | Built (value added) |
| CIQ Event Category | 17 earlier values + **Supplier master · Review · Internal note** | Built (values added) |
| CIQ Config Kind | Template · Section definition · Rule set · Section ownership · RMES criteria · Limit set · Text bundle · Reminders · Settings · Regression set · Release | Built |
| CIQ Config State | Draft · Published · Retired | Built |
| CIQ Review Dept | REG · SAF · QM · MIC · SUS · RMM (exactly the codes the step conditions test) | Built |
| CIQ Decision | Approved · Rejected | Built |
| Others | Yes No, Confirm, Department, OP Progress, RMES Part, RMES Result, AI State, Impact Resolution, Release Stage, Supplier Kind, Country Code, Actor Side, and three lists from the earlier design (no longer offered) | Built |

### 2.5 How the flows link

| From | To | Link | Written by |
|---|---|---|---|
| CIQ Supplier | CIQ Case | `Supplier_Code`. The contacts are copied at Start into `Case_Contacts_JSON`, `Portal_Contact_Ids`, `Confirm_Contact_Ids` and `Supplier_Contact_Emails` | Workbench at Start |
| CIQ Config Version (Release row) | CIQ Case | `Release_Item_Id`, `Release_Key`, `Manifest_Hash`, `Rule_Set_Version`, `Template_Version` | Workbench at Start |
| CIQ Case | CIQ Case Data | `Case_Data_Item_Id` ↔ `Case_Item_Id`, `Case_Code` | Service |
| CIQ Case | CIQP Request | `Portal_Request_Item_Id` ↔ `App_Case_Item_Id` | Service |
| CIQ Case | CIQ Review | `Case_Item_Id`, `Case_Code`; key `Review_Key` | Service |
| CIQ Case | CIQ RMES Safety / Regulatory | `Result_Case` (native reference), `RMES_Key` | Service |
| CIQ Review | CIQ Open Point | `Case_Code` + department. The service keeps `Open_Count` and `Track_Status` on the review | Service |
| CIQ Open Point | CIQP Query | `Portal_Query_Item_Id` ↔ `App_Open_Point_Id` + `Round_No`; key `Query_Key` | Service |
| CIQ RMES finding | CIQ Open Point | `Ref_Internal_Key` = the finding's `Findings_Key` | Service |
| CIQ Case | CIQP Final Release | `Portal_Release_Item_Id`; key `Confirmation_Key` | Service |
| CIQ Case Data `Documents` row | file on CIQ Case | `Doc_Attachment_Id` = the file's id in `CIQ_Case_A00.Supplier_Files` | Service |
| Any action | CIQ Audit Event | `Case_Code`, `Object_Kind`, `Object_Key`, `Object_Item_Id` | Service |

**Requested documents, as built:**
- The requested-documents list is a child table on the case's data record, `CIQ_Case_Data_A00_Requested_Documents`.
- The files themselves are stored on the case, in `CIQ_Case_A00.Supplier_Files`.
- A file answers a requested document when its `Documents` row has `Doc_Field_Key` = the request's `Req_Key`.

---

## 3. The process

### 3.1 Phases

The phase lives in the field `Case_Phase` (on CIQ Case and on CIQ Case Data). Kissflow's own item status is not used for this: a cancelled case is still "in progress" for Kissflow, so every list, report and dashboard filters on `Case_Phase`.

```
 Supplier filling in the CIQ ──► Review ◄──────► Awaiting final release ──► Completed
            │                       │                      │
            └───────────────────────┴──────────────────────┴──► Cancelled
                                                                   │
                       reactivation within 365 days: back to ◄─────┘
                       the phase it was cancelled from
```

- **Review ⇄ Awaiting final release.** When the last review completes, the service creates the supplier's release task. If a review reopens, or the scope grows after that, the service withdraws the release task and the case returns to Review.
- **Cancel and reactivate** are field writes by the service. They are not native reject or withdraw, which would end the item for good.

### 3.2 CIQ Case steps: Built, tested

| Step | Who acts | What happens |
|---|---|---|
| Create case (Start) | Raw Material Manager (RMM), in the Workbench | Enters the material, the supplier and its contacts, the markets and the due date; the configuration version is pinned (21 Mandatory fields) |
| Waiting for supplier: CIQ | Integration service role (the Sync Service) | The supplier fills in the CIQ in the portal. The service submits this step after the supplier's completeness confirmation |
| Beiersdorf review and final release | Integration service role | The department reviews and open points run as their own items. The service submits this step after the supplier's final release and the sealed final document |
| End | — | `Case_Phase` = Completed |

**Tested** on fictional test cases:
- A case walked Create case → Waiting for supplier: CIQ → Beiersdorf review and final release → Completed. Every submit returned 200.
- The service's field writes at both system steps (phase, links, release time, seal) were read back.
- Files attached to `Supplier_Files` (two side by side) and to `Final_PDF` at these steps, although the fields are read-only for people there. Each file read back and downloaded intact.
- The test items were deleted afterwards.

### 3.3 CIQ Review steps: Built

| Step | Who acts | Condition | Writable at the step | Mandatory at the step |
|---|---|---|---|---|
| Activate review (Start) | Service | — | all fields | the field-level Required keys |
| Review – Regulatory | Regulatory Affairs reviewer | `Review_Dept` = REG | `Assignee_*`, `Reassign_Reason`, `Review_Confirm`, `Completed_*`, `On_Behalf_Of`, `RMES_Decision`, `RMES_Decision_Reason` | `Review_Confirm`, `Completed_By`, `Completed_At`, `Review_Gate`, `RMES_Decision` |
| Review – Safety | Product Safety reviewer | `Review_Dept` = SAF | as Regulatory | as Regulatory |
| Review – QM | Quality Management reviewer | `Review_Dept` = QM | as Regulatory, without `RMES_*` | as Regulatory, without `RMES_Decision` |
| Review – Microbiology | Microbiology reviewer | `Review_Dept` = MIC | as QM | as QM |
| Review – Sustainability | Sustainability reviewer | `Review_Dept` = SUS | as QM | as QM |
| Review – RMM | Raw Material Manager (RMM) | `Review_Dept` = RMM | as QM, plus `Rejection_Handling`, `Rejection_Note`, `Rejected_Depts_Covered` | as QM |
| End | — | — | — | — |

- **Single-branch routing.** Exactly one review step runs per item, chosen by a condition on a list value. The same routing is tested end to end on CIQ Open Point (§3.4). A test walk on CIQ Review itself is **Next**.
- **Who gets the task.** Each step is assigned to the department's role, so every member of that role gets the task (and Kissflow's own task notifications). The Workbench shows "My reviews" by `Assignee_User`, and reassignment changes that field.
- **The Workbench enforces the gate before it submits**, because Kissflow does not enforce Mandatory on API submits (§5.7).
- **Native step durations** (for Kissflow's own reporting): **Next**, set in the Kissflow builder. Reminders and escalations come from the service in any case (§5.6).

### 3.4 CIQ Open Point steps: Built, tested

| Step | Who acts | Condition |
|---|---|---|
| Raise open point (Start) | Service, on the Workbench's request (16 Mandatory fields, including `Raised_By_User`) | — |
| Open point – Regulatory | Regulatory Affairs reviewer | `OP_Dept` = REG |
| Open point – Safety | Product Safety reviewer | `OP_Dept` = SAF |
| Open point – QM | Quality Management reviewer | `OP_Dept` = QM |
| Open point – Microbiology | Microbiology reviewer | `OP_Dept` = MIC |
| Open point – Sustainability | Sustainability reviewer | `OP_Dept` = SUS |
| Open point – RMM | Raw Material Manager (RMM) | `OP_Dept` = RMM |
| End | — | — |

- **At a department step** the question, justification, due date, responsible person, round, progress, outcome, reasons, thread and close fields are writable. `OP_Outcome` is Mandatory.
- **No "waiting for supplier" step and no send-back.** A return, or a question edit after an answer, is a field change on the point plus a new portal query (a new round).
- **`OP_Dept` is field-level Required**, which Kissflow enforces at Start. A point therefore can't skip all six department steps. The service also checks the code before it submits.
- **Tested** on two fictional points (Regulatory and RMM): Raise open point → Open point – Regulatory / – RMM → Completed. Every submit returned 200, and the close fields written by the service (`OP_Outcome`, `Closed_At`, `Closed_By`, `Thread_JSON`) were read back.
- **Only the raiser** accepts, returns, edits or closes a point.
  - **Today:** the step is assigned to the raising department's role. The Workbench enforces "raiser only", and the service re-checks it on every request.
  - **Prepared, applied next:** the six steps are assigned from `Raiser_Assignee`, so Kissflow itself gives the task to the raiser only.
    - Assigning an app step from a user field was **tested in this app on 15 October**: the step went to the named user only, with no role.
    - A submit with the field empty was refused ("There is no assignee for the next step"), so the service always fills it. For a point the system raises, it holds the responsible person (the review's assignee).
    - Items already in flight keep their current assignee (§6.2).
    - Moving a point to another person mid-step (reassignment) is **to be verified**. Fallback: withdraw the point and raise it again with the same key and thread.

### 3.5 Portal steps (Built)

| Process | Steps | Who acts |
|---|---|---|
| CIQP Request | Issue request (Start) → **Supplier: fill in the CIQ** → **Supplier: keep the CIQ up to date** → End | Start: the service. Both supplier steps are assigned from the field `Assigned_Contacts`, so only the case's contacts get the task. Submitting "fill in the CIQ" is the completeness confirmation. The second step is held until the end and never submitted, so the supplier keeps the request in view (read-only once the case is locked) and can report a change |
| CIQP Query | Raise query (Start) → **Supplier: respond** → End | The supplier answers (Answer · Document · Cannot provide). The service withdraws the query if Beiersdorf closes the point first |
| CIQP Final Release | Request final release (Start) → **Supplier: release** → End | Assigned to the contacts who may confirm |

### 3.6 One case, end to end

1. **Create.** RMM creates `CIQ-2026-0001` in the Workbench. Within a minute the service:
   - creates the CIQ Case Data row and the portal request;
   - mails the invitation.
2. **Fill in.** The supplier's contacts answer in the portal. Sections open and close live as answers change. Each save increments `Answers_Rev`, and the service mirrors the data into CIQ Case Data. RMM sees the progress read-only.
3. **Completeness.** A contact who may confirm submits "fill in the CIQ". The service then:
   - fixes the scope (a CIQ Scope Run row);
   - creates one CIQ Review per department in scope, plus RMM's;
   - creates the RMES rows for Safety and Regulatory;
   - sets the phase to Review and submits the case's first system step;
   - mails the reviewers.
4. **Review.** Reviewers raise open points through Service Requests:
   - the service creates the CIQ Open Point and the CIQP Query, and mails the supplier;
   - the supplier's answer flows back to the point;
   - the raiser accepts it, or returns it, which starts a new round with a new query.

   Safety and Regulatory record RMES results and their decision. Each department completes its review.
5. **Release requested.** When the last review completes, the service creates CIQP Final Release for the contacts who may confirm, and sets the phase to Awaiting final release.
6. **Release.** The supplier releases. The external script (the Sync Service) picks this up within a minute; no Beiersdorf click is needed. It then:
   - builds the final document and its seal;
   - renders the PDF and attaches it to the case;
   - writes the hash;
   - locks the request;
   - submits the case to End;
   - mails the receipt and notifies RMM.
7. **After.** "Report a change" on the completed request becomes a `Change_Reports` row on CIQ Case Data. RMM can start a follow-up case.
8. **Cancel** (any time before completion). The service withdraws the open queries, the release task, the open reviews and the open points, and locks the request. Reactivation within 365 days continues the same items.

### 3.7 Who writes what

| Actor | Writes directly (own session) | Asks the service for (CIQ Service Request) |
|---|---|---|
| RMM | CIQ Case at Start (create and submit) | `case.created`, `case.cancel`, `case.reactivate`, `followup.started`, actions on own points and reviews |
| Department reviewer | Own CIQ Review step (completion, decision) and submit; own department's RMES row; own open point at its step | `op.raise`, `op.accepted`, `op.returned`, `op.notaccepted`, `op.edited`, `op.closed`, `review.completed`, `review.reopen`, `review.reassign`, `section.add`, `rmes.saved` |
| RMM, the department reviewers, Customs & Trade Compliance, Legal / IP | CIQ Internal Note rows | — (the service reads new notes for @mentions) |
| Business administrator | CIQ Config Version rows; CIQ Supplier rows and contacts | `config.published`, `supplier.changed`, `reminders.run` |
| Supplier (portal) | Own CIQP Request, Query and Final Release items at their steps | — (the service polls the portal items whose ids it stored) |

**To be verified:** a real user's write through the SDK after Start (field updates at their own step, child rows, Form create). It has worked in other Kissflow projects but has not been tested in this sandbox yet. If it fails:
- the Workbench opens the native Kissflow task form; or
- it files a Service Request, which the service applies through the admin route.

---

## 4. Roles, access and security

### 4.1 Roles

**App roles** (Beiersdorf only). **Built:** renamed to the agreed names on 15 October; the role ids did not change, so nothing that refers to them changed.

| Role | Kind | Purpose |
|---|---|---|
| Raw Material Manager (RMM) | Business | Starts cases, owns them, reviews in parallel with the departments |
| Regulatory Affairs reviewer | Business | Department review; Regulatory RMES |
| Product Safety reviewer | Business | Department review; Safety RMES |
| Quality Management reviewer | Business | Department review |
| Microbiology reviewer | Business | Department review |
| Sustainability reviewer | Business | Department review |
| Customs & Trade Compliance | Business | Informed; reads; posts notes |
| Legal / IP | Business | Informed; reads; posts notes |
| Business administrator | Business | Supplier master, configuration, reminders |
| Auditor | Business | Reads everything, including both RMES sheets |
| Business owner (reports) | Business | Reports |
| Case administrator | Technical | Flow administration |
| Integration service | Technical | The Sync Service's user only |

- **Retired role.** "Overall approver" from the earlier design has no grants and no step. Deleting a role is irreversible, so it is removed in a separate, explicit step before UAT (§7.3).
- **Platform role.** "Admin / Developer" is Kissflow's default app administrator role.

**Portal roles:** one role, **Supplier**, for external users only. No Beiersdorf user is a member in production use.

### 4.2 Grants per role (app): Built

The grants were applied on 15 October and read back. The live membership of all 13 flows below equals this grid exactly: no extra member, and **no Delete permission anywhere**.

Legend:
- **Start** = may start items;
- **View** = acts at their own role's steps, does not start items;
- **Admin** = flow administrator;
- **Edit** = form member who creates and updates, without delete;
- **Read** = form viewer;
- **—** = no access.

| Role | Case | Review | Open Point | Case Data | Outbox | Service Request | Supplier | Config | Scope Run | RMES Safety | RMES Regulatory | Note | Audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RMM | Start | View | View | Read | — | Edit | Read | Read | Read | — | — | Edit | Read |
| Regulatory Affairs reviewer | View | View | View | Read | — | Edit | — | Read | Read | — | **Edit** | Edit | Read |
| Product Safety reviewer | View | View | View | Read | — | Edit | — | Read | Read | **Edit** | — | Edit | Read |
| QM / Microbiology / Sustainability reviewer | View | View | View | Read | — | Edit | — | Read | Read | — | — | Edit | Read |
| Customs & Trade Compliance, Legal / IP | View | View | View | Read | — | Edit | — | Read | Read | — | — | Edit | Read |
| Business administrator | View | View | View | Read | — | Edit | **Edit** | **Edit** | Read | — | — | Read | Read |
| Auditor | View | View | View | Read | Read | Read | — | Read | Read | Read | Read | Read | Read |
| Business owner (reports) | View | View | View | Read | — | — | — | Read | Read | — | — | Read | Read |
| Case administrator | Admin | Admin | Admin | Read | Read | Read | Read | Read | Read | Read | Read | Read | Read |
| Integration service | Start + owner of the 2 system steps | Start | Start | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Read | Edit |

**What the grants enforce:**
- Only the service writes the read model, the outbox, the scope runs and the audit trail.
- Each RMES sheet is open only to its own department, the Auditor, the Case administrator and the service.
- Only the Business administrator (and the service) edits the supplier master and the configuration; RMM reads the supplier master.
- People start only cases (RMM). Reviews and open points are started by the service; people act at their own role's step.
- No role has a Delete permission on any form. On the three processes, only the Case administrator has administration rights.

**Still to be verified with separate fictional test users** (in this sandbox one person holds every role today):
- that a View member gets the step task without being an administrator;
- that a Viewer can list CIQ Case Data rows;
- that a form member without Delete can still create rows. Fallback: members keep Delete, and the audit trail is described as tamper-evident (hashes plus audit) rather than tamper-proof.

**Portal grants (Built, read back):**
- Supplier is a member with no extra permissions on CIQP Request, CIQP Query and CIQP Final Release: no "view all", no administration.
- Supplier is a Viewer on CIQP Help Article.
- Supplier has no access to the portal flows that are no longer used.

### 4.3 Security principles

**1. Suppliers see only their own cases.**
- Portal items reach a supplier only through steps assigned from `Assigned_Contacts`. The service fills that field from the contacts of that case's supplier.
- The Supplier role can't view all items or start items. Whether a member with no extra permissions is really unable to start items is **to be verified** with a supplier test user.
- The portal holds only supplier-safe data:
  - the configuration bundle has no internal rule bases or notes;
  - the question history carries only supplier-visible text;
  - internal close reasons are never copied.
- Supplier e-mails use a whitelist of facts: case, material, reference, question, due date, return text.
- Per-user isolation between two different supplier users is **to be verified** with two fictional supplier test users before the user tests.

**2. RMES isolation (Built).**
- Each RMES sheet is readable only by its own department. The Auditor reads both. The Integration service and the Case administrator also have access.
- Everyone else sees only the decision value, through the CIQ Review item and the case data.
- CIQ Case Data, which every internal role can read, carries no RMES criteria, findings, internal notes or decision reasons.
- RMES never appears in the final document.

**3. The audit trail is written only by the service (Built).**
- Every person is a Viewer on CIQ Audit Event; only the Integration service is a member.
- Each event records the actor from the platform's own `_created_by` on the Service Request, never from the request's payload. Refused attempts are logged too ("Change attempt").

**4. Requests are checked server-side.** For every CIQ Service Request the service checks, in order:
   1. who asked, from the platform field `_created_by`;
   2. that nobody else modified a waiting request (`_modified_by` must equal `_created_by`);
   3. role membership;
   4. the same business guards as the prototype: raiser only, own department only, the phase, the required texts.

   A refused request gets status Refused with the reason. Kissflow system fields such as `_created_by` can't be set by a client (documented by Kissflow). This path ran live on 15 October (§5.5).

   The guards also refuse to treat one person as both a Beiersdorf user and a supplier contact. That is why the full live run needs separate internal and supplier test users.

**5. No keys in front ends.** The Workbench and the portal UI act only in the signed-in user's own Kissflow session. Access keys exist only on the server that runs the Sync Service (§5.1).

**6. Kissflow step permissions are not the only guard.**
- In sandbox tests an API create stored a value in a field that is read-only at Start.
- Mandatory fields are not enforced on API submits.
- So the UIs enforce gates before submitting. When the service first sees a case, it clears any service-owned case field a create may have set and writes a "Change attempt" audit row (built in the service; covered by its automated tests).

---

## 5. Integration and API

All patterns below use the Kissflow REST API.
- The base URL is the account host, for example `https://dev-beiersdorf.kissflow.eu`.
- `{acc}` is the Kissflow account id.
- Every call carries `?_application_id=CIQ_Digital_A00`, or the portal's id for portal flows.

### 5.1 Authentication and where keys live

```
X-Access-Key-Id:     <key id>
X-Access-Key-Secret: <key secret>
Content-Type:        application/json
```

- **Keys are held server-side only:** in the scheduler's secret store (a local environment file in development), never in code, logs, UI bundles or documents. The service builds the headers in-process and never prints them.
- **A key acts as its Kissflow user** (tested): it can do exactly what that user's roles allow.
  - For UAT, a dedicated technical user "CIQ Integration Service" is **Next**, with its own key and membership of the Integration service role only.
  - A vendor-master integration should get its own technical user and key, with only the grants it needs (for example Edit on CIQ Supplier).
- **A browser session can't call the REST API directly** (anti-forgery). User-facing code uses the Kissflow client SDK.
- **File downloads** return a signed URL. The service follows it with the key only when it points at the Kissflow host.

### 5.2 Read routes the technical team can use to check the build (GET only)

| Purpose | Route |
|---|---|
| Published fields and child tables of a form | `GET /form/2/{acc}/{form}/allfields?_application_id=…` |
| Published fields of a process | `GET /process/2/{acc}/{process}/allfields?_application_id=…` |
| One form row, including its child rows (`Table::<child id>`) and the system fields `_created_by`, `_modified_by` | `GET /form/2/{acc}/{form}/{rowId}?_application_id=…` |
| A process item as administrator: fields, current step, and the step's activity-instance id in `_current_context[0]._context_activity_instance_id` | `GET /process/2/{acc}/admin/{process}/{itemId}?_application_id=…` |
| List values | `GET /flow/2/{acc}/list/{listId}/items?_application_id=…` |
| Who has access to a flow (`{type}` = `process` or `form`) | `GET /flow/2/{acc}/{type}/{flow}/member?_application_id=…` |
| Form rows, paged (a POST, read-only in effect) | `POST /form/2/{acc}/{form}/list?page_number=1&page_size=500&_application_id=…`. Used live by the service. A list row carries `_id` and the business fields only; read the row itself for the system fields |

### 5.3 Vendor master: bulk create, update and deactivate suppliers and contacts (Pattern)

**Goal.** Beiersdorf's vendor master (for example SAP) keeps CIQ Supplier and its contacts current, in bulk, without manual entry.

**Records:**
- Header: CIQ Supplier `CIQ_Supplier_A00`.
- Contacts: child table `Contacts`.
- The form already carries `SAP_Vendor_Id` and `Teamcenter_Supplier_Id` for cross-reference.

**Idempotent keys.** `Supplier_Code` (or `SAP_Vendor_Id`) identifies a supplier, and `Contacts_Key` identifies a contact. Every call is an upsert by these keys, so a replayed batch changes nothing.

**Create:** a look-up, two calls, then a read-back.

```
POST /form/2/{acc}/CIQ_Supplier_A00/list?…        look up by Supplier_Code; create only if absent

POST /form/2/{acc}/CIQ_Supplier_A00?_application_id=CIQ_Digital_A00
{
  "Supplier_Code": "ZZT-SUP-0001",
  "Supplier_Legal_Name": "ZZT Example Chemicals GmbH",
  "DUNS_Number": "000000001",
  "SAP_Vendor_Id": "ZZT-0000100001",
  "Supplier_Country_Code": "DE",
  "Supplier_City": "Example City",
  "Supplier_Active": "Yes",
  "Table::Contacts": [
    { "_id": "Contacts_<10 random chars>", "_index": 0, "_is_created": true,
      "Contacts_Key": "ZZT-CON-0001",
      "Contacts_Full_Name": "ZZT Contact One",
      "Contacts_Email": "zzt.contact.one@example.com",
      "Contacts_Title": "Regulatory manager",
      "Contacts_Can_Confirm": "Yes",
      "Contacts_Active": "Yes" }
  ]
}
→ returns the draft's _id

POST /form/2/{acc}/CIQ_Supplier_A00/{draftId}/submit?_application_id=CIQ_Digital_A00
→ returns the row's real _id; then GET the row and compare
```

**Update:** read the row, one call, then a read-back.

```
GET  /form/2/{acc}/CIQ_Supplier_A00/{rowId}?…     current values and the contacts' server row ids

POST /form/2/{acc}/CIQ_Supplier_A00/{rowId}?_application_id=CIQ_Digital_A00
{
  "Supplier_City": "New Example City",
  "Table::Contacts": [
    { "_id": "<server row id of ZZT-CON-0001>", "Contacts_Email": "zzt.contact.one.new@example.com" },
    { "_id": "Contacts_<10 random chars>", "_index": 1, "_is_created": true,
      "Contacts_Key": "ZZT-CON-0002", "Contacts_Full_Name": "ZZT Contact Two",
      "Contacts_Email": "zzt.contact.two@example.com", "Contacts_Active": "Yes" }
  ]
}
```

**Deactivate, never delete.**
- A supplier: `Supplier_Active` = "No".
- A contact: `Contacts_Active` = "No" and `Contacts_Deactivated_At` = now (for example `2026-10-16T09:00:00Z`).
- Rows are never deleted, so historic cases keep their references and the audit stays complete.

**Rules the integration must follow.** Each one comes from a behaviour tested in this sandbox:

| Rule | Why |
|---|---|
| **Upsert by business key.** Find the row by `Supplier_Code` (or `SAP_Vendor_Id`) before creating. Match contacts by `Contacts_Key`, never by position | Kissflow has no unique constraint, so a blind create makes a duplicate |
| **Re-read server row ids before modifying a contact** | A create replaces the client's child-row ids. A modify with an unknown row id silently adds a duplicate row |
| **Creates one at a time per user, never in parallel** | Each user has a single form draft, so parallel creates by the same key collide |
| **Read back after every write and re-apply what did not stick (up to 3 times)** | Kissflow has no write locking. Two writes to one row within about 0.1 s can lose one, although both answer 200 |
| **Validate before writing:**<ul><li>`Supplier_Code` and `Supplier_Legal_Name` present (also enforced by Kissflow: field-level Required);</li><li>DUNS exactly 9 digits and unique;</li><li>a contact's e-mail unique;</li><li>no deactivation of a supplier with open cases, or of its last active contact</li></ul> | Uniqueness and the deactivation rules are not native, so the integration checks them. The Workbench checks the same rules for manual edits. A server-side re-check by the service for every master change is **Next** (§7.2) |
| **Send list values exactly as the list holds them** (for example `Supplier_Country_Code` "DE", `Supplier_Active` "Yes"/"No") | A value that is not in the field's list is silently stored as empty, with a 200 answer |
| **Send date-times without milliseconds** (`YYYY-MM-DDThh:mm:ssZ`) | The REST API refuses milliseconds with a 400 |
| **Then file a `supplier.changed` Service Request** | The service carries contact changes into open cases. Today it handles a contact's e-mail change, deactivation and reactivation (with a replacement contact on open portal tasks). Audit rows for every other master change are **Next** (§7.2) |

**Bulk.**
- No bulk form endpoint is used.
- A bulk load is a sequential, paced loop (§5.9): about 3–4 calls per new supplier (look-up, create, submit, read-back).
- At 1 call per second, 1,000 new suppliers take roughly 50–70 minutes. Unchanged suppliers are skipped after the look-up.

**Where the endpoint lives.** Three options:
- **A. Direct.** Beiersdorf's integration platform calls the routes above.
- **B. A thin "vendor-master endpoint"** hosted next to the Sync Service. It would expose, for example:
  - `PUT /vendors/{supplierCode}` (upsert with contacts);
  - `POST /vendors:batch`;
  - `POST /vendors/{supplierCode}/deactivate`.

  It would implement the upsert, the validation, the pacing, the read-back and the audit row in one place. Not built.
- **C. Low-code.** The account offers the "Webhooks by Kissflow" trigger and Dataform create/update actions, so an inbound webhook can create or update one supplier header per call. Integrations can't write child rows, so contacts would still need option A or B. Not built; **to be verified**.

### 5.4 Automatic portal-user creation for supplier contacts (Pattern, not in the MVP)

**In the MVP**, adding a contact sets `Contacts_Invite_Requested_At`. An administrator then invites the person as a portal user in the Supplier role and records `Contacts_Portal_User_Id`.

**The automated pattern: a webhook-triggered integration.**
1. **Event.** A contact is added or reactivated on CIQ Supplier, by the vendor-master load or by the Business administrator. Its row gets `Contacts_Invite_Requested_At`.
2. **Webhook.** The writer (the vendor-master endpoint, or the Sync Service when it processes `supplier.changed`) posts `{supplierCode, contactKey, email, fullName, action}` to a provisioning webhook. Alternatively, a Kissflow integration with the "Webhooks by Kissflow" trigger receives the call and forwards it through its HTTP action, so the hand-off is visible and can be switched off in Kissflow.
3. **Provision.** A provisioning function, with its own server-side key for a user-administration technical user, invites the e-mail as an external portal user and adds the user to the portal's Supplier role.
4. **Write back.** It writes `Contacts_Portal_User_Id` and `Contacts_Invited_At` on the contact row (matched by `Contacts_Key`), and an audit row.
5. **Use.** The service puts the new user into `Assigned_Contacts` of the supplier's open and new portal items.
6. **Deactivation** reverses it: the user is removed from the Supplier role and replaced on open portal items.

**Guardrails:** idempotent by `Contacts_Key` (an already invited contact is skipped); never invite an inactive contact; e-mail uniqueness checked first; the provisioning key can manage users and nothing else.

**Status: Pattern, to be verified.**
- The invite call for external portal users has not been tested in this sandbox.
- Role-membership changes over the API work in other Kissflow projects, but they are deliberately not exercised in this build: role changes stay with an administrator.
- Moving an open portal task to a replacement contact mid-step needs a second supplier test user (**to be verified**). Fallback: withdraw the portal item and create it again with the same data.

### 5.5 Service Requests: the Workbench command channel (Built; first live runs done)

- **Create.** The Workbench creates one row per action, strictly one at a time per user. `Request_Key` is unique per action and makes retries safe.
- **Process.** The service picks up rows whose `Request_Status` is blank. A list row carries no system fields, so the service reads each waiting row in full to get `_created_by` and `_modified_by`. It checks the request (§4.3), carries it out, and writes back:
  - `Request_Status` (Done · Refused · Failed);
  - `Result_Note`, `Result_Item_Id` and `Processed_At`.
- **Retry.** A Failed request is retried up to 3 times (`Attempt_No`).
- **Live on 15 October.** A fictional request with an unknown code was picked up, attributed to the requester from the platform's `_created_by`, refused with the reason, its status written back, and an audit row written by the service. The test rows were removed afterwards.
- **Request codes:**
  - case: `case.created`, `case.cancel`, `case.reactivate`, `followup.started`;
  - open points: `op.raise`, `op.accepted`, `op.returned`, `op.notaccepted`, `op.edited`, `op.closed`;
  - reviews: `review.completed`, `review.reopen`, `review.reassign`;
  - scope and RMES: `section.add`, `rmes.saved`;
  - administration: `supplier.changed`, `config.published`, `reminders.run`.

### 5.6 Outbox mail integration (Built, off)

**How it works:**
- **Source.** The service writes one CIQ Mail Outbox row per e-mail. It computes the recipients, applies the supplier whitelist, merges bursts and sets an idempotency key (`Mail_Key`, e.g. `op-raised:<point>:r1`). Reminders and escalations use the same path.
- **Integration "CIQ Mail – send outbox mail"** (read back with all its bindings):
  - trigger: Kissflow Dataform "item created" on CIQ Mail Outbox;
  - action 1: Email "Send an email" (`To` ← `To_Emails`, `Subject` ← `Subject`, `Body` ← `Body_Text`, rich text);
  - action 2: Dataform "Update an item" on the same row (`instance_id` ← the trigger's `_id`), `Sent_Status` = "Sent".
- **The link.** `Link_Url` is kept on the row for the log, but the Email action takes only the body. The service therefore writes the link into `Body_Text`, with HTML line breaks.
- **Retry and dead letters.** A row still without `Sent_Status` after 10 minutes is retried as a new row (`Mail_Key#2`). After attempt 3 it is a dead letter, shown in the Workbench diagnostics. If the mail went out but action 2 failed, a retry can send it twice; a rare duplicate is preferred to a lost mail.
- **Status.**
  - Built over REST and published.
  - **Off.** Kissflow lets integrations be switched on only in its builder.
  - When an integration is switched on, Kissflow runs it once with sample data. The first real row is then a harmless internal test mail. That is the moment to verify field-mapped recipients and action 2 (**to be verified**).
- **Fallbacks** if the Email action doesn't fit:
  - the HTTP connector to a mail relay; or
  - the service sends the mail itself, and the outbox stays the log.

### 5.7 Process items: the service's pattern (tested routes)

| Action | Route | Notes |
|---|---|---|
| Create at Start | `POST /process/2/{acc}/{process}?_application_id=…` with the fields | Field-level Required is enforced here |
| Submit a step | `POST /process/2/{acc}/{process}/{itemId}/{activityInstanceId}/submit` | For Start, use the id from the create response. For later steps, use the id from the **admin GET** (ids from "my items" lists go stale). The key's user must hold the step. Mandatory is **not** enforced on API submits. A step assigned from a user field is refused when the field is empty |
| Write fields of an in-progress item | `PUT /process/2/{acc}/admin/{process}/{itemId}` | The only route that writes after Start for a key. The assignee route refuses with error 050313 |
| Withdraw (initiator only) | `POST /process/2/{acc}/{process}/{itemId}/withdraw` `{ "Comment": "…" }` | Used for cancellations. Withdraw and reject do not fire "item completed" |
| Attach a file | `POST /process/2/{acc}/admin/{process}/{itemId}/{fieldId}/attachment` (multipart, form field `file`) | Tested on the case and on portal items. Each upload adds to the field's file list. Works on fields that are read-only at the step. Stored value: `[{key, id: "Attach-…", name, size}]` |
| Download a file | `GET /process/2/{acc}/admin/{process}/{itemId}/{fieldId}/attachment/{attachmentId}` | 302 to a signed URL on the same host; the bytes match the upload |

**For every write:** date-times are sent without milliseconds, and the item is read back afterwards (§5.9).

**Not used, by design:** send-back over the API (it returns 500 in this sandbox). Returns are new rounds instead.

### 5.8 Final document: release → external PDF script → attach to the case

**Flow at the supplier's release** (as built in the service):
1. **Release.** The supplier submits "Supplier: release" on CIQP Final Release in the portal.
2. **Trigger.** The external script (the Sync Service) detects the completed release item within a minute. It polls the release item whose id it stored, so it needs no inbound endpoint. No Beiersdorf click is needed.
3. **Build.** It assembles the final document (§6.4) and computes its seal.
4. **Write and attach,** in this order, while the case is still at its last system step:
   1. `Final_Document_JSON` and the seal on CIQ Case Data;
   2. render the PDF (a small built-in PDF writer, no third-party library);
   3. attach it to `CIQ_Case_A00.Final_PDF` with the attach route (§5.7);
   4. write `Final_Document_Hash` and `Final_Document_At` on the case, and a "Final PDF" audit row with the PDF's own SHA-256;
   5. only then submit the case to End.

   Nothing is written to a completed item.

**Push variant (Pattern):** instead of polling, a Kissflow integration on the portal's CIQP Final Release ("item completed" trigger, HTTP action) calls a webhook endpoint of the script, for example a cloud function, which then runs steps 3 and 4. It saves up to a minute of delay. The "item completed" trigger fired within about 6 seconds in this sandbox. The HTTP action is available on the account but not built (**to be verified**).

**Downstream systems (Pattern).** For a system such as a DMS or Teamcenter to receive the document:
1. A Kissflow trigger "item completed" on CIQ Case runs an HTTP action that posts `{caseItemId, Case_Code}` to Beiersdorf's endpoint. Everything is in place when the case completes.
2. The receiver reads the case with the admin GET and downloads `Final_PDF` by attachment id.
3. It checks the seal (§6.4).

Alternative: the Sync Service pushes the document itself right after the release.

**Status.**
- Attaching to `Final_PDF` at the release step and downloading it again: tested on a fictional case.
- Document build, seal and PDF: built in the service and covered by its automated tests.
- The full release run on the live sandbox: **to be verified** in the live end-to-end run (§7.2).

### 5.9 Pacing, rate limits and read-after-write

- **Pacing.** At least 1 second between calls per key (1.2–1.5 s in our verification runs), one write in flight per item, and form creates serialized.
- **Observed.** A burst from several parallel scripts on one key was answered with **HTTP 429 and an HTML challenge page**, not JSON. Calls recovered after a pause of about half an hour. After that, several hundred calls at ≥ 1 s pacing ran without a single 429.
- **Rule for every client:**
  - treat any 429, or any response that is not JSON, as "back off", never as data;
  - stop the current pass at once and write nothing more;
  - wait (the service waits 1 minute after a JSON 429, 10 minutes after an HTML challenge), then probe with one GET before resuming;
  - never retry fast. A waiting request stays waiting; a 429 never marks it Failed.
- **Read-after-write.** Every writer (the service, the Workbench, the portal UI, a vendor-master integration) reads each write back and re-applies what did not stick, up to 3 times. Reason: Kissflow has no write locking, and two writes to one item within about 0.1 s can lose one although both answer 200. The service also skips an item whose holder wrote it in the last 2 seconds and retries on its next run.
- **Idempotency.** Every created item or row has a business key (`Review_Key`, `OP_Key`, `Query_Key`, `Confirmation_Key`, `Mail_Key`, `Event_Key`, `Run_Key`, `CR_Key`; a copied file is keyed by its portal attachment id). Before creating, the writer checks the key, so a replay creates nothing twice.

---

## 6. Audit, versioning and the document seal

### 6.1 Configuration versions (rules and questionnaire)

- **Storage.** CIQ Config Version holds every configuration as data: one row per kind and version.
- **Kinds:** Rule set, Template (questionnaire), Release, Section ownership, Reminders, Settings, RMES criteria, Limit set, Regression set, Section definition and Text bundle.
- **States:** Draft → Published → Retired. Retired is shown as "superseded, running cases keep it".
- **A Release row** pairs one rule set version with one questionnaire version:
  - `Release_Manifest_JSON` holds the versions, ids and hashes;
  - `Release_Bundle_JSON` holds the full bundle;
  - `Manifest_Hash` seals the pair.
- **Publishing is copy-on-write:**
  - new rows are written, and the previous Release row is set to Retired;
  - only the side that changed gets a new number;
  - a published row is never edited.

  This is tamper-evident through the hashes and the audit trail. It is not technically locked.
- **Status: Built and seeded.** 12 rows were loaded on 15 October, each read back with an identical payload and hash:
  - rule set RS-2026.1, questionnaire v1 and their Release row, Published;
  - the prepared RS-2026.2, v2 and their Release row, as Draft;
  - six singleton rows: section ownership, reminders, settings, RMES criteria, limit set and regression set.
- **Audit.** Publishing a release writes an audit row (`config.published`). An audit row for every draft edit (a rule, section or question added, changed or removed; a draft discarded) is **Next** (§7.2).

### 6.2 Pinning

| Where | What is pinned | Status |
|---|---|---|
| CIQ Case | `Release_Item_Id`, `Release_Key`, `Manifest_Hash`, `Rule_Set_Version`, `Template_Version`: all Mandatory at Start | Built, tested |
| CIQP Request | `Config_Bundle_JSON` (the supplier-safe subset: questions, help texts, options, rule conditions and outcomes, requested-document wording) and `Config_Bundle_Hash` (SHA-256) | Built (portal). The measured bundle is about 22–25 KB; a 122 KB text field round-trips intact in this sandbox |
| CIQ Scope Run | `Rule_Set_Version`, `Evaluator_Version`, `Input_Hash` for each scope milestone | Built |

**Running cases keep their pinned version** after a new release is published.

**The same holds for the workflow definition** (observed): an item already in flight keeps the step names and assignees of the definition it started on, and new items use the new definition.

### 6.3 Audit trail

- **Where.** CIQ Audit Event holds one row per event. It is both the case's History tab and the global audit log.
- **What it records:**
  - every Service Request carried out or refused;
  - every supplier action the service sees in the portal (save, upload, completeness, answer, release, change report);
  - the service's own actions (actor "System");
  - refused change attempts on closed cases.
- **Fields:**
  - actor side (Beiersdorf · Supplier · System), name, e-mail, department, role and `On_Behalf_Of`;
  - the object (kind, key, item id, state);
  - the old and new values;
  - the reason;
  - optionally a snapshot JSON.
- **Idempotency.** `Event_Key` keeps a replay from writing an event twice.
- **Writer.** The service only. Every person is a Viewer (Built, §4.2). The first audit row from a live service run was written on 15 October.
- **Coverage still to add (Next, §7.2):** an audit row for every supplier-master change and for every configuration draft edit.

### 6.4 The document seal

- **Content.** The final document is exactly what the prototype shows:
  - header and released metadata;
  - in-scope sections with answers, who answered and when, and justifications;
  - components;
  - evidence (attachments by name);
  - every open point's thread, round by round;
  - the confirmations.

  **It never includes** RMES, findings, decisions, internal notes or internal reasons.
- **Storage.**
  - `Final_Document_JSON` on CIQ Case Data, written once at the release;
  - `Final_Document_Hash` and `Final_Document_At` on CIQ Case and CIQ Case Data;
  - the PDF in `CIQ_Case_A00.Final_PDF`.
- **Seal.** SHA-256 over the canonical JSON of `Final_Document_JSON`: keys sorted at every level, no whitespace, undefined values dropped.
  - The Workbench recomputes it in the browser (WebCrypto) and shows "Document seal: unchanged" when it matches (part of the Workbench rework, §7).
  - The PDF's own SHA-256 goes into the "Final PDF" audit row.
  - Anyone with read access can recompute the seal from the stored JSON, so a later change to the document is detectable.
- **Order at the release:** JSON → PDF → attach → hash → submit to End (§5.8). Nothing is written to a completed item.
- **Status.**
  - Fields Built.
  - Attaching the PDF to `Final_PDF` at the release step: tested on a fictional case.
  - Seal computation: covered by the service's automated tests.
  - The full release run on the live sandbox: **to be verified** in the live end-to-end run.

---

## 7. What is built and what comes next

### 7.1 Built

| Area | Item | Status |
|---|---|---|
| App | 5 new lists, 3 extended lists (old values kept) | Built |
| App | CIQ Case: 3-step backbone with 2 system-held steps, 19 new fields, Start permissions, 81 earlier fields Hidden at every step | Built, tested (end-to-end walk; attach and download) |
| App | CIQ Open Point: one department step per point (6 conditional steps), no "waiting" step, 5 new fields, `OP_Dept` Required, `Open_Num` counts every outcome as closed, earlier fields and table Hidden | Built, tested (two fictional points to Completed) |
| App | CIQ Review (new process): 30 fields, gate formula, 6 conditional department steps | Built (read back) |
| App | CIQ Case Data, CIQ Service Request, CIQ Mail Outbox (new forms) | Built |
| App | CIQ Supplier, RMES Safety / Regulatory, Internal Note: new fields and child columns | Built |
| App | Mail integration | Built, off |
| App | Role names aligned (11 renames, ids kept); grants on 13 flows exactly as in §4.2, no Delete anywhere; unused flows restricted to the Case administrator | Built (read back) |
| App | Configuration seed: 12 rows | Built (read back) |
| App | Assigning an app step from a user field | Tested in this app on a test flow |
| Portal | CIQP Request (one item per case, uploads table, file field, completeness and keep-open steps), CIQP Query (+2 fields), CIQP Final Release, Help Article content, supplier access removed from unused flows | Built (433/434) |
| Service | CIQ Sync Service: all handlers, server-side request checks, write-then-verify, idempotent keys, pacing and back-off, attach and download, final document, PDF, seal | Built. 55 automated tests. First live runs on 15 Oct |

### 7.2 Next

| Area | Item | Status |
|---|---|---|
| App | Open point steps assigned to the raiser personally (`Raiser_Assignee`) | Prepared (dry run clean); applied next, then one test point. The service fills the field at every raise |
| App | One test walk per department on CIQ Review | Next |
| App | Native step durations on the 6 review and 6 open point steps (for Kissflow's own reporting) | Next, set in the builder. Reminders and escalations come from the service |
| App | Switch on the mail integration; first test mail checks recipients and the "Sent" update | Next, in the builder. To be verified |
| Service | Audit rows and server-side re-checks (DUNS uniqueness, no deactivation with open cases) for every supplier-master change, not only contact e-mail changes and deactivations | Next |
| Service | Audit rows for configuration draft edits (today: publishing only) | Next |
| Service | Full live run on one fictional case, from start to sealed PDF | Next. Needs separate fictional internal and supplier test users |
| Service | Hosting | Next. Development: a scheduled job. UAT: a managed 1-minute scheduler (for example AWS Lambda with EventBridge, or Google Apps Script) with the key in that platform's secret store and a dedicated technical user. Includes a heartbeat, "service late" in the Workbench diagnostics, and a runbook (start/stop, run now, replay a case, list failed requests and dead letters, dry-run mode) |
| Tests | Two internal and two supplier test users (fictional): per-user isolation, task routing to non-admin members, list access as a viewer, members without delete, reassignment mid-step | To be verified |
| Tests | Real-user writes through the SDK (Workbench and portal UI) | To be verified (fallbacks in §3.7) |
| Frontends | Workbench rework to the agreed prototype screens on the read model and Service Requests | Next (largest item) |
| Frontends | Portal UI rework to the one-item CIQ | Built locally; deployment next |
| Patterns | Vendor-master endpoint (§5.3), automatic portal-user creation (§5.4), release push webhook and downstream document webhook (§5.8) | Pattern; not in the MVP |

### 7.3 Housekeeping before UAT

- Switch off two test-harness integrations (builder-only). They touch only test flows, never a CIQ flow.
- Remove the test grant on two test-harness flows.
- Remove the retired "Overall approver" role (irreversible, so done as an explicit step).

### 7.4 Known platform limits the design works around

| Limit | Workaround |
|---|---|
| No write locking | Read-back and re-apply |
| No unique constraint | Business keys checked by the writer and the service |
| Mandatory not enforced on API submits; read-only not enforced on an API create | UI gates; the service clears service-owned fields on first sight |
| No API send-back | Rounds instead |
| Published fields can't be deleted | Hidden at every step |
| Integrations are switched on only in the builder | Manual switch-on |
| No proven API route for native step durations | Set in the builder; reminders from the service |
| A process item can be listed only by its initiator or the holder of an open task | A Form read model (CIQ Case Data) |
| Form list rows carry no system fields | Read each row in full before checking who wrote it |
| Date-times with milliseconds are refused | Send `…:ssZ` |
| A step assigned from an empty user field can't be submitted | The service always fills the field |
