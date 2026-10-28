# CIQ_Digital_A00: live inventory (read-only, 2026-10-14)

Kissflow-internal. Input for the plan v5 rebuild.

- **Read:** 2026-10-14T16:05:41.113Z UTC, dev-beiersdorf.kissflow.eu (account AcDOSunMEpSA), app `CIQ_Digital_A00`.
- **Method:** 167 GET requests through `kissflow-build/lib/kf.mjs` `client({ readOnly: true })`, which refuses any other method. Nothing was written.
- **As designed:** `runs/ciq-digital-v4/app-spec.json` (graph rev 31), its compiled dry run `preview-rev31`, and `postgen/role-alignment.json` (D38).
- **Machine-readable version:** `inventory-app.json` (same folder). It holds the full per-step field permissions, the report sharing and the integration mappings.

## 0. Surprises and things to know first

1. Roles changed outside every recorded script: the default User role (RoEK3_3NtdWL) and the spike roles A/B (RoEKHLFdFsUJ, RoEKHLGDsV2J) no longer exist, and the default Admin role is now "Admin / Developer". Window: after the generate read-back on 8 Oct (~19:00 UTC, 0 fails incl. "Admin/User exist") and before 9 Oct 06:56 UTC (first log line naming "Admin / Developer"). The 4 spike flows were touched by Flobot on 9 Oct 06:39:22 UTC, which fits a role deletion then [inference].
2. Test harness is orphaned but still wired: CIQ ZZ Spike Case: 10 step owner(s) point at deleted roles, 0 flow members; CIQ ZZ Spike Point: 2 step owner(s) point at deleted roles, 0 flow members. Both spike integrations are still ON and were re-published by Flobot today (2026-10-14T06:52:22Z, 2026-10-14T06:52:24Z).
3. The app was published today, 2026-10-14T06:52:29Z by Thomas; no request log in the project records any write since 9 Oct, so this was done outside the scripts (UI) [inference]. Nothing designed changed: every CIQ flow's LastPublishedAt is still 8 Oct (Open Point 18:59:51 = the send-back switch). The /explore listing shows the portal was published a few seconds later (06:52:39).
4. The 11 D38 role renames are NOT applied; live names are still the rev-31 "CIQ …" names. The 3 D38 roles exist with CIQ Reader's grants.
5. Delete on the audit trail: 10 roles hold Member ["Delete"] on CIQ Audit Event (CIQ RMM, CIQ Regulatory Reviewer, CIQ Safety Reviewer, CIQ QM Reviewer, CIQ Microbiology Reviewer, CIQ Sustainability Reviewer, CIQ Overall Approver, CIQ Business Admin, CIQ Case Admin, CIQ Integration Service). This is what the plan compiles (form write = Member [Delete]); the post-generate no-Delete reset (K-17) was never done. Internal Note: 13 roles with Delete, incl. CIQ Reader and the 3 D38 roles.
6. No SLA, reminder or step e-mail settings exist on any process (no such keys in the drafts); process fields carry no field-level Required (all requiredness is step Mandatory, which the API key does not enforce, D33).
7. Only one Reference field exists in the app: RMES Safety/Regulatory.Result_Case → CIQ_Case_A00 (lookup Case_Code). Every other cross-record link is a Text id (Case_Code, *_Item_Id).
8. The live process is still the pre-call v4 design (Scope check, Overall approval, the two open-items checks, Overall_Decision gate on PS-11); the 9 Oct client decisions are not in the app yet (see STATUS-2026-10-14.md §2).
9. Record inconsistencies: decisions.md D37 names the bundle ciq-workbench-ui-244b9bd7db.zip, but live (and deploy-report.json) is ciq-workbench-ui-235af550b4.zip. STATUS-2026-10-14.md counts CIQ Case at 123 fields and "16" live roles; live is 125 header fields (draft = published runtime list) and 15 roles. postgen/readback-result.json and postgen/live/ were overwritten today 15:53 UTC by the app session's read-back, so the 9 Oct draft baseline is gone; this inventory therefore compares against the plan (rev 31 + preview), not against 9 Oct drafts.

## 1. What exists

| Kind (Kissflow type) | Count | Of which test harness (`CIQ ZZ Spike …`) |
|---|---|---|
| Process | 5 | 2 |
| Form | 10 | 2 |
| Case (board) | 0 | 0 |
| Dataset | 0 | 0 (see §9: datasets aren't visible to the admin key) |
| List | 24 | 2 |
| Integration | 4 | 2 |
| App role | 15 | 0 |
| Page | 1 | 0 |
| Custom UI component | 1 | 0 |

Every flow, list and integration has the status **Live** (published). No flow has unpublished draft fields: each draft's field set equals its published runtime field list.

## 2. App, navigation, pages and custom UI

- **App:** CIQ Digital (`CIQ_Digital_A00`), Application, Live. Last published 2026-10-14T06:52:29Z by Thomas.
- **Default page:** `Home_Page_A00`. **Custom UI switched on:** true.
- **Navigation** "Main Navigation" (default true): menu "Home" → Page:Home_Page_A00.
- **Page** "Home Page" (`Home_Page_A00`), Live, created 2026-10-06T20:09:13Z: Kissflow's default welcome page (components Label, Label, Image; text "Welcome to Kissflow Apps" / "Add more components to your page to make it visually appealing"). It references no CIQ flow.
- **Custom UI component** "App custom UI bundle" (`CCEK4Jhdt04g`): category Application, layout Web, Live, source Zip, bundle `ciq-workbench-ui-235af550b4.zip` (last modified 2026-10-08T19:25:26Z). It runs at `/view/application/CIQ_Digital_A00/ui`.
- **No native pages, dashboards or reports pages** were generated (`--no-pages`, D19). Users work in the Workbench custom UI.

## 3. Roles

| Role id | Live name | Kind | Members | As designed (rev 31) | D38 rename (prepared, not applied) |
|---|---|---|---|---|---|
| `RoEK3_3Jy9XU` | Admin / Developer | default (Admin) | 1 (Thomas (User)) | Admin (`admin`) |  |
| `RoEKwvR_cPvv` | Business owner (reports) | custom | 1 (Thomas (User)) | — (not in rev 31; added 9 Oct (D38), grants like CIQ Reader) |  |
| `RoEKl87f38Xw` | CIQ Business Admin | custom | 1 (Thomas (User)) | CIQ Business Admin (`ciq_business_admin`) | Business administrator |
| `RoEKl88jv4dv` | CIQ Case Admin | custom | 1 (Thomas (User)) | CIQ Case Admin (`ciq_case_admin`) | Case administrator |
| `RoEKl89I5nGx` | CIQ Integration Service | custom | 1 (Thomas (User)) | CIQ Integration Service (`ciq_integration_service`) | Integration service |
| `RoEKl8647K2u` | CIQ Microbiology Reviewer | custom | 1 (Thomas (User)) | CIQ Microbiology Reviewer (`ciq_microbiology_reviewer`) | Microbiology reviewer |
| `RoEKl8790ycA` | CIQ Overall Approver | custom | 1 (Thomas (User)) | CIQ Overall Approver (`ciq_overall_approver`) | Overall approver |
| `RoEKl85WB1yE` | CIQ QM Reviewer | custom | 1 (Thomas (User)) | CIQ QM Reviewer (`ciq_qm_reviewer`) | Quality Management reviewer |
| `RoEKl83f9jPF` | CIQ RMM | custom | 1 (Thomas (User)) | CIQ RMM (`ciq_rmm`) | Raw Material Manager (RMM) |
| `RoEKl88CJiLP` | CIQ Reader | custom | 1 (Thomas (User)) | CIQ Reader (`ciq_reader`) | Auditor |
| `RoEKl84Hca4w` | CIQ Regulatory Reviewer | custom | 1 (Thomas (User)) | CIQ Regulatory Reviewer (`ciq_regulatory_reviewer`) | Regulatory Affairs reviewer |
| `RoEKl84xAFRW` | CIQ Safety Reviewer | custom | 1 (Thomas (User)) | CIQ Safety Reviewer (`ciq_safety_reviewer`) | Product Safety reviewer |
| `RoEKl86bQQrO` | CIQ Sustainability Reviewer | custom | 1 (Thomas (User)) | CIQ Sustainability Reviewer (`ciq_sustainability_reviewer`) | Sustainability reviewer |
| `RoEKwv6pxX3g` | Customs & Trade Compliance | custom | 1 (Thomas (User)) | — (not in rev 31; added 9 Oct (D38), grants like CIQ Reader) |  |
| `RoEKwvH8qaxG` | Legal / IP | custom | 1 (Thomas (User)) | — (not in rev 31; added 9 Oct (D38), grants like CIQ Reader) |  |

**Gone since generate:** the default **User** role (`RoEK3_3NtdWL`) and the spike roles **CIQ ZZ Spike Role A / B** (`RoEKHLFdFsUJ` / `RoEKHLGDsV2J`). A GET on each id returns `RoleDoesNotExistsError`. The default **Admin** role (`RoEK3_3Jy9XU`) is now named **"Admin / Developer"**.

## 4. Per-flow permissions (role × flow)

Access class from the live member entry: **admin** = `Admin []`; process **write** = `Member [InitiateItems]`, **read** = `Member [View]`; form **write** = `Member [Delete]`, **read** = `Viewer []`; **—** = not a member. The admin role has no flow entries (it is app admin). Test-harness flows have **no members at all**.

| Role | Change Request | Open Point | Case | Audit Event | Internal Note | RMES Regulatory | RMES Safety | Scope Run | Section | Config Version | Supplier |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Admin / Developer | — | — | — | — | — | — | — | — | — | — | — |
| Business owner (reports) | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| CIQ Business Admin | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> |
| CIQ Case Admin | admin <sub>Admin []</sub> | admin <sub>Admin []</sub> | admin <sub>Admin []</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| CIQ Integration Service | write <sub>Member ["InitiateItems"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | write <sub>Member ["Delete"]</sub> | — | — | — | — | write <sub>Member ["Delete"]</sub> | — | — |
| CIQ Microbiology Reviewer | read <sub>Member ["View"]</sub> | write <sub>Member ["InitiateItems"]</sub> | read <sub>Member ["View"]</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| CIQ Overall Approver | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| CIQ QM Reviewer | read <sub>Member ["View"]</sub> | write <sub>Member ["InitiateItems"]</sub> | read <sub>Member ["View"]</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| CIQ RMM | write <sub>Member ["InitiateItems"]</sub> | write <sub>Member ["InitiateItems"]</sub> | write <sub>Member ["InitiateItems"]</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> |
| CIQ Reader | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| CIQ Regulatory Reviewer | read <sub>Member ["View"]</sub> | write <sub>Member ["InitiateItems"]</sub> | read <sub>Member ["View"]</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| CIQ Safety Reviewer | read <sub>Member ["View"]</sub> | write <sub>Member ["InitiateItems"]</sub> | read <sub>Member ["View"]</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| CIQ Sustainability Reviewer | read <sub>Member ["View"]</sub> | write <sub>Member ["InitiateItems"]</sub> | read <sub>Member ["View"]</sub> | write <sub>Member ["Delete"]</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| Customs & Trade Compliance | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |
| Legal / IP | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Member ["View"]</sub> | read <sub>Viewer []</sub> | write <sub>Member ["Delete"]</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> | read <sub>Viewer []</sub> |

**Reports:** each process has only its system report "<flow> All Items" (TabularReport), shared with Thomas as Admin and with the flow's roles as `Member [View]` (detail in the JSON). The forms have no reports and no form views.

## 5. Flows

### CIQ Change Request · Process · `CIQ_Change_Request_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:20Z; last modified 2026-10-09T06:57:37Z.
- **Fields:** 49 header fields (types: Text 15, Number 2, Textarea 10, Select 12, User 5, DateTime 5); 0 Required at field level; 0 child table(s).
- **vs as-designed:** no drift (49 fields, 9 steps, 392 step-permission cells compared).

**Steps**

- **Receive change request** · StartEvent · owner: the initiator (any role with InitiateItems) · `Activity_oz37gb`. Fields: 0 Mandatory; 13 Editable (CR_Key, Case_Code, Cycle_No, Supplier_Code, Change_Kind, Section_Key, Field_Key, Row_Id, Current_Value_Text, Proposed_Value_JSON, Change_Reason, Portal_CR_Item_Id, Raised_By_Portal_User); 0 Hidden; 36 ReadOnly.
- **Triage** · UserTask · owner CIQ RMM (role) · `Activity_1o6v1xh`. Fields: 16 Mandatory (Case_Code, Cycle_No, Supplier_Code, Case_Item_Id, Contact_Verified, CR_Outcome, Impact_REG, Impact_SAF, Impact_QM, Impact_MIC, Impact_SUS, Notice_Key, Notice_Kind, Notice_Title, Supplier_Outcome_Text, Portal_Contact_Ids); 2 Editable (Triage_Note, Scope_Run_Key); 0 Hidden; 31 ReadOnly.
- **Assess impact** · Parallel · **parallel, 5 branches** · `Activity_1r9kcjd`.
  - branch 1:
    - **Assess – Regulatory** · UserTask · owner CIQ Regulatory Reviewer (role) · condition `Impact_REG = "Yes"` · `Activity_l2hx24`. Fields: 3 Mandatory (REG_Assessment, REG_Assessed_By, REG_Assessed_At); 1 Editable (REG_Assess_Note); 0 Hidden; 45 ReadOnly.
  - branch 2:
    - **Assess – Safety** · UserTask · owner CIQ Safety Reviewer (role) · condition `Impact_SAF = "Yes"` · `Activity_rvv4pm`. Fields: 3 Mandatory (SAF_Assessment, SAF_Assessed_By, SAF_Assessed_At); 1 Editable (SAF_Assess_Note); 0 Hidden; 45 ReadOnly.
  - branch 3:
    - **Assess – QM** · UserTask · owner CIQ QM Reviewer (role) · condition `Impact_QM = "Yes"` · `Activity_1v5xu30`. Fields: 3 Mandatory (QM_Assessment, QM_Assessed_By, QM_Assessed_At); 1 Editable (QM_Assess_Note); 0 Hidden; 45 ReadOnly.
  - branch 4:
    - **Assess – Microbiology** · UserTask · owner CIQ Microbiology Reviewer (role) · condition `Impact_MIC = "Yes"` · `Activity_1d278v1`. Fields: 3 Mandatory (MIC_Assessment, MIC_Assessed_By, MIC_Assessed_At); 1 Editable (MIC_Assess_Note); 0 Hidden; 45 ReadOnly.
  - branch 5:
    - **Assess – Sustainability** · UserTask · owner CIQ Sustainability Reviewer (role) · condition `Impact_SUS = "Yes"` · `Activity_1awvxhf`. Fields: 3 Mandatory (SUS_Assessment, SUS_Assessed_By, SUS_Assessed_At); 1 Editable (SUS_Assess_Note); 0 Hidden; 45 ReadOnly.
- **End** · EndEvent · `Activity_2m19c`. Fields: 0 Mandatory; 0 Editable; 0 Hidden; 49 ReadOnly.
- (platform-made: SendBackToInitiator)

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `CR_Key` | CR Key | Text |  |  |
| `Case_Code` | Case Code | Text |  |  |
| `Cycle_No` | Cycle No | Number |  |  |
| `Supplier_Code` | Supplier Code | Text |  |  |
| `Change_Kind` | Change Kind | Text |  |  |
| `Section_Key` | Section Key | Text |  |  |
| `Field_Key` | Field Key | Text |  |  |
| `Row_Id` | Row Id | Text |  |  |
| `Current_Value_Text` | Current Value Text | Textarea |  |  |
| `Proposed_Value_JSON` | Proposed Value JSON | Textarea |  |  |
| `Change_Reason` | Change Reason | Textarea |  |  |
| `Portal_CR_Item_Id` | Portal CR Item Id | Text |  |  |
| `Raised_By_Portal_User` | Raised By Portal User | Text |  |  |
| `Case_Item_Id` | Case Item Id | Text |  |  |
| `Contact_Verified` | Contact Verified | Select |  | list: CIQ Yes No |
| `CR_Outcome` | CR Outcome | Select |  | list: CIQ CR Outcome |
| `Triage_Note` | Triage Note | Textarea |  |  |
| `Scope_Run_Key` | Scope Run Key | Text |  |  |
| `Impact_REG` | Impact REG | Select |  | list: CIQ Yes No |
| `Impact_SAF` | Impact SAF | Select |  | list: CIQ Yes No |
| `Impact_QM` | Impact QM | Select |  | list: CIQ Yes No |
| `Impact_MIC` | Impact MIC | Select |  | list: CIQ Yes No |
| `Impact_SUS` | Impact SUS | Select |  | list: CIQ Yes No |
| `Notice_Key` | Notice Key | Text |  |  |
| `Notice_Kind` | Notice Kind | Text |  |  |
| `Notice_Title` | Notice Title | Text |  |  |
| `Supplier_Outcome_Text` | Supplier Outcome Text | Textarea |  |  |
| `Portal_Contact_Ids` | Portal Contact Ids | Text |  |  |
| `REG_Assessment` | REG Assessment | Select |  | list: CIQ Impact Resolution |
| `REG_Assess_Note` | REG Assess Note | Textarea |  |  |
| `REG_Assessed_By` | REG Assessed By | User |  |  |
| `REG_Assessed_At` | REG Assessed At | DateTime |  |  |
| `SAF_Assessment` | SAF Assessment | Select |  | list: CIQ Impact Resolution |
| `SAF_Assess_Note` | SAF Assess Note | Textarea |  |  |
| `SAF_Assessed_By` | SAF Assessed By | User |  |  |
| `SAF_Assessed_At` | SAF Assessed At | DateTime |  |  |
| `QM_Assessment` | QM Assessment | Select |  | list: CIQ Impact Resolution |
| `QM_Assess_Note` | QM Assess Note | Textarea |  |  |
| `QM_Assessed_By` | QM Assessed By | User |  |  |
| `QM_Assessed_At` | QM Assessed At | DateTime |  |  |
| `MIC_Assessment` | MIC Assessment | Select |  | list: CIQ Impact Resolution |
| `MIC_Assess_Note` | MIC Assess Note | Textarea |  |  |
| `MIC_Assessed_By` | MIC Assessed By | User |  |  |
| `MIC_Assessed_At` | MIC Assessed At | DateTime |  |  |
| `SUS_Assessment` | SUS Assessment | Select |  | list: CIQ Impact Resolution |
| `SUS_Assess_Note` | SUS Assess Note | Textarea |  |  |
| `SUS_Assessed_By` | SUS Assessed By | User |  |  |
| `SUS_Assessed_At` | SUS Assessed At | DateTime |  |  |
| `CR_Open_Num` | CR Open Num | Number |  | formula: `IF(ISBLANK(CR_Outcome),1,0)+IF(Impact_REG="Yes",IF(ISBLANK(REG_Assessment),1,0),0)+IF(Impact_SAF="Yes",IF(ISBLANK(SAF_Assessment),1,0),0)+IF(Impact_QM="Yes",IF(…` |

</details>

### CIQ Open Point · Process · `CIQ_Open_Point_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:59:51Z; last modified 2026-10-09T06:57:36Z.
- **Fields:** 53 header fields (types: Text 25, Number 4, Select 7, DateTime 3, Textarea 9, User 2, Date 2, Email 1); 0 Required at field level; 1 child table(s).
- **vs as-designed:** no drift (63 fields, 9 steps, 486 step-permission cells compared). Post-generate switch present: Review – Regulatory: Rounds={"IsSendbackEnabled":true}; Review – Safety: Rounds={"IsSendbackEnabled":true}; Review – QM: Rounds={"IsSendbackEnabled":true}; Review – Microbiology: Rounds={"IsSendbackEnabled":true}; Review – Sustainability: Rounds={"IsSendbackEnabled":true}; Review – RMM: Rounds={"IsSendbackEnabled":true}.

**Steps**

- **Raise open point** · StartEvent · owner: the initiator (any role with InitiateItems) · `Activity_18t0lhi`. Fields: 17 Mandatory (OP_Key, Round_No, Case_Code, Cycle_No, Supplier_Code, Case_Item_Id, OP_Kind, OP_Dept, Raised_By_Dept, OP_To_Supplier, Ref_Kind, Ref_Label, Question_Text, Internal_Justification, Responsible_User, Internal_Due_Date, Start_Gate); 17 Editable (Query_Key, Ref_Section_Key, Ref_Field_Key, Ref_Row_Id, Ref_Doc_Id, Ref_Doc_File_Name, Ref_Doc_Uploaded_At, Ref_Internal_Key, Kind_Label, Supplier_Justification, Responsible_Name, Responsible_Dept_Label, Supplier_Due_Date, New_Section_Item_Key, Portal_Contact_Ids, Thread_Text, Awaiting_Response); 0 Hidden; 20 ReadOnly.
- **Waiting for supplier** · UserTask · owner CIQ RMM (role) · condition `OP_To_Supplier = "Yes"` · `Activity_4k7uck`. Fields: 1 Mandatory (Response_Kind); 7 Editable (Awaiting_Response, Response_Text, Response_Doc_Refs_JSON, Supplier_Responsible_Email, Portal_Query_Item_Id, OP_Outcome, Outcome_Reason); 0 Hidden; 46 ReadOnly.
- **Review – Regulatory** · UserTask · owner CIQ Regulatory Reviewer (role) · condition `OP_Dept = "REG"` · `Activity_uka3mx`. Fields: 4 Mandatory (OP_Outcome, Reviewed_By, Reviewed_By_Email, Reviewed_At); 22 Editable (Round_No, Query_Key, Question_Text, Supplier_Justification, Internal_Due_Date, Supplier_Due_Date, Portal_Contact_Ids, Thread_Text, Awaiting_Response, Response_Kind, Response_Text, Response_Doc_Refs_JSON, OP_Progress, Outcome_Reason, Return_Reason, Accepted_Doc_File_Name, Accepted_Doc_Uploaded_At, Reviewed_Answers_Rev, Late_Decision, Late_Decision_Reason, On_Behalf_Of, Rounds); 0 Hidden; 28 ReadOnly. Switches: Rounds {"IsSendbackEnabled":true}.
- **Review – Safety** · UserTask · owner CIQ Safety Reviewer (role) · condition `OP_Dept = "SAF"` · `Activity_1kdump3`. Fields: 4 Mandatory (OP_Outcome, Reviewed_By, Reviewed_By_Email, Reviewed_At); 22 Editable (Round_No, Query_Key, Question_Text, Supplier_Justification, Internal_Due_Date, Supplier_Due_Date, Portal_Contact_Ids, Thread_Text, Awaiting_Response, Response_Kind, Response_Text, Response_Doc_Refs_JSON, OP_Progress, Outcome_Reason, Return_Reason, Accepted_Doc_File_Name, Accepted_Doc_Uploaded_At, Reviewed_Answers_Rev, Late_Decision, Late_Decision_Reason, On_Behalf_Of, Rounds); 0 Hidden; 28 ReadOnly. Switches: Rounds {"IsSendbackEnabled":true}.
- **Review – QM** · UserTask · owner CIQ QM Reviewer (role) · condition `OP_Dept = "QM"` · `Activity_1go37bt`. Fields: 4 Mandatory (OP_Outcome, Reviewed_By, Reviewed_By_Email, Reviewed_At); 20 Editable (Round_No, Query_Key, Question_Text, Supplier_Justification, Internal_Due_Date, Supplier_Due_Date, Portal_Contact_Ids, Thread_Text, Awaiting_Response, Response_Kind, Response_Text, Response_Doc_Refs_JSON, OP_Progress, Outcome_Reason, Return_Reason, Accepted_Doc_File_Name, Accepted_Doc_Uploaded_At, Reviewed_Answers_Rev, On_Behalf_Of, Rounds); 0 Hidden; 30 ReadOnly. Switches: Rounds {"IsSendbackEnabled":true}.
- **Review – Microbiology** · UserTask · owner CIQ Microbiology Reviewer (role) · condition `OP_Dept = "MIC"` · `Activity_hha7u2`. Fields: 4 Mandatory (OP_Outcome, Reviewed_By, Reviewed_By_Email, Reviewed_At); 20 Editable (Round_No, Query_Key, Question_Text, Supplier_Justification, Internal_Due_Date, Supplier_Due_Date, Portal_Contact_Ids, Thread_Text, Awaiting_Response, Response_Kind, Response_Text, Response_Doc_Refs_JSON, OP_Progress, Outcome_Reason, Return_Reason, Accepted_Doc_File_Name, Accepted_Doc_Uploaded_At, Reviewed_Answers_Rev, On_Behalf_Of, Rounds); 0 Hidden; 30 ReadOnly. Switches: Rounds {"IsSendbackEnabled":true}.
- **Review – Sustainability** · UserTask · owner CIQ Sustainability Reviewer (role) · condition `OP_Dept = "SUS"` · `Activity_y4af4g`. Fields: 4 Mandatory (OP_Outcome, Reviewed_By, Reviewed_By_Email, Reviewed_At); 20 Editable (Round_No, Query_Key, Question_Text, Supplier_Justification, Internal_Due_Date, Supplier_Due_Date, Portal_Contact_Ids, Thread_Text, Awaiting_Response, Response_Kind, Response_Text, Response_Doc_Refs_JSON, OP_Progress, Outcome_Reason, Return_Reason, Accepted_Doc_File_Name, Accepted_Doc_Uploaded_At, Reviewed_Answers_Rev, On_Behalf_Of, Rounds); 0 Hidden; 30 ReadOnly. Switches: Rounds {"IsSendbackEnabled":true}.
- **Review – RMM** · UserTask · owner CIQ RMM (role) · condition `OP_Dept = "RMM"` · `Activity_xc8fbb`. Fields: 4 Mandatory (OP_Outcome, Reviewed_By, Reviewed_By_Email, Reviewed_At); 20 Editable (Round_No, Query_Key, Question_Text, Supplier_Justification, Internal_Due_Date, Supplier_Due_Date, Portal_Contact_Ids, Thread_Text, Awaiting_Response, Response_Kind, Response_Text, Response_Doc_Refs_JSON, OP_Progress, Outcome_Reason, Return_Reason, Accepted_Doc_File_Name, Accepted_Doc_Uploaded_At, Reviewed_Answers_Rev, On_Behalf_Of, Rounds); 0 Hidden; 30 ReadOnly. Switches: Rounds {"IsSendbackEnabled":true}.
- **End** · EndEvent · `Activity_i73i25`. Fields: 0 Mandatory; 0 Editable; 0 Hidden; 54 ReadOnly.
- (platform-made: SendBackToInitiator)

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `OP_Key` | OP Key | Text |  |  |
| `Round_No` | Round No | Number |  |  |
| `Query_Key` | Query Key | Text |  |  |
| `Case_Code` | Case Code | Text |  |  |
| `Cycle_No` | Cycle No | Number |  |  |
| `Supplier_Code` | Supplier Code | Text |  |  |
| `Case_Item_Id` | Case Item Id | Text |  |  |
| `OP_Kind` | OP Kind | Select |  | list: CIQ OP Kind |
| `OP_Dept` | OP Dept | Select |  | list: CIQ Review Dept |
| `Raised_By_Dept` | Raised By Dept | Select |  | list: CIQ Review Dept |
| `OP_To_Supplier` | OP To Supplier | Select |  | list: CIQ Yes No |
| `Ref_Kind` | Ref Kind | Text |  |  |
| `Ref_Section_Key` | Ref Section Key | Text |  |  |
| `Ref_Field_Key` | Ref Field Key | Text |  |  |
| `Ref_Row_Id` | Ref Row Id | Text |  |  |
| `Ref_Doc_Id` | Ref Doc Id | Text |  |  |
| `Ref_Doc_File_Name` | Ref Doc File Name | Text |  |  |
| `Ref_Doc_Uploaded_At` | Ref Doc Uploaded At | DateTime |  |  |
| `Ref_Label` | Ref Label | Text |  |  |
| `Ref_Internal_Key` | Ref Internal Key | Text |  |  |
| `Kind_Label` | Kind Label | Text |  |  |
| `Question_Text` | Question Text | Textarea |  |  |
| `Supplier_Justification` | Supplier Justification | Textarea |  |  |
| `Internal_Justification` | Internal Justification | Textarea |  |  |
| `Responsible_User` | Responsible User | User |  |  |
| `Responsible_Name` | Responsible Name | Text |  |  |
| `Responsible_Dept_Label` | Responsible Dept Label | Text |  |  |
| `Internal_Due_Date` | Internal Due Date | Date |  |  |
| `Supplier_Due_Date` | Supplier Due Date | Date |  |  |
| `New_Section_Item_Key` | New Section Item Key | Text |  |  |
| `Portal_Contact_Ids` | Portal Contact Ids | Text |  |  |
| `Thread_Text` | Thread Text | Textarea |  |  |
| `Awaiting_Response` | Awaiting Response | Text |  |  |
| `Response_Kind` | Response Kind | Text |  |  |
| `Response_Text` | Response Text | Textarea |  |  |
| `Response_Doc_Refs_JSON` | Response Doc Refs JSON | Textarea |  |  |
| `Supplier_Responsible_Email` | Supplier Responsible Email | Text |  |  |
| `Portal_Query_Item_Id` | Portal Query Item Id | Text |  |  |
| `OP_Progress` | OP Progress | Select |  | list: CIQ OP Progress |
| `OP_Outcome` | OP Outcome | Select |  | list: CIQ OP Outcome |
| `Outcome_Reason` | Outcome Reason | Textarea |  |  |
| `Return_Reason` | Return Reason | Textarea |  |  |
| `Accepted_Doc_File_Name` | Accepted Doc File Name | Text |  |  |
| `Accepted_Doc_Uploaded_At` | Accepted Doc Uploaded At | DateTime |  |  |
| `Reviewed_By` | Reviewed By | User |  |  |
| `Reviewed_By_Email` | Reviewed By Email | Email |  |  |
| `Reviewed_At` | Reviewed At | DateTime |  |  |
| `Reviewed_Answers_Rev` | Reviewed Answers Rev | Number |  |  |
| `Late_Decision` | Late Decision | Select |  | list: CIQ Decision |
| `Late_Decision_Reason` | Late Decision Reason | Textarea |  |  |
| `On_Behalf_Of` | On Behalf Of | Text |  |  |
| `Open_Num` | Open Num | Number |  | formula: `IF(OP_Outcome="Accepted",0,IF(OP_Outcome="Withdrawn",0,1))` |
| `Start_Gate` | Start Gate | Text |  | formula: `IF(OP_To_Supplier="No","OK",IF(OR(ISBLANK(Ref_Kind),ISBLANK(Ref_Section_Key),ISBLANK(Ref_Label),ISBLANK(Kind_Label),ISBLANK(Question_Text),ISBLANK(Supplier_Just…` |

**Child table Rounds** (`Rounds`, 10 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Rounds_Round_No` | Round No | Number |  |  |
| `Rounds_Question_Text` | Question Text | Textarea |  |  |
| `Rounds_Response_Kind` | Response Kind | Text |  |  |
| `Rounds_Response_Text` | Response Text | Textarea |  |  |
| `Rounds_Outcome` | Outcome | Select |  | list: CIQ Round Outcome |
| `Rounds_Reason` | Reason | Textarea |  |  |
| `Rounds_Doc_File_Name` | Doc File Name | Text |  |  |
| `Rounds_Doc_Uploaded_At` | Doc Uploaded At | DateTime |  |  |
| `Rounds_Reviewed_By` | Reviewed By | User |  |  |
| `Rounds_Reviewed_At` | Reviewed At | DateTime |  |  |

</details>

### CIQ Case · Process · `CIQ_Case_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:17Z; last modified 2026-10-09T06:57:36Z.
- **Fields:** 125 header fields (types: Text 53, Number 11, User 8, Select 16, Email 9, Date 3, Textarea 15, DateTime 9, Attachment 1); 0 Required at field level; 0 child table(s).
- **vs as-designed:** no drift (125 fields, 16 steps, 1875 step-permission cells compared).

**Steps**

- **Create case** · StartEvent · owner: the initiator (any role with InitiateItems) · `Activity_p1i6xz`. Fields: 20 Mandatory (Case_Code, Cycle_No, Trade_Name, Main_INCI, BDF_Material_No, Supplier_Code, Supplier_Legal_Name, Owner_RMM, Request_Key, BDF_Contact_Name, BDF_Contact_Email, Supplier_Due_Date, Case_Contacts_JSON, Portal_Contact_Ids, Confirm_Contact_Ids, Supplier_Contact_Emails, Release_Item_Id, Manifest_Hash, Release_Manifest_JSON, Overall_Approval_Required); 9 Editable (Case_Title, Reactivates_Case_Item, SAP_Material_No, IRMA_Ref, Target_Markets_Text, Case_Test, Markets_Label, Template_Label, Release_Key); 0 Hidden; 96 ReadOnly.
- **Waiting for supplier: basic data** · UserTask · owner CIQ RMM (role) · `Activity_1kltjdn`. Fields: 1 Mandatory (Basic_Data_Received); 5 Editable (Case_Contacts_JSON, Portal_Contact_Ids, Confirm_Contact_Ids, Supplier_Contact_Emails, Portal_Request_Item_Id); 0 Hidden; 119 ReadOnly.
- **Scope check** · UserTask · owner CIQ RMM (role) · `Activity_1feompb`. Fields: 19 Mandatory (Confirm_Contact_Ids, Supplier_Contact_Emails, Rule_Set_Version, Dept_REG_Active, Dept_SAF_Active, Dept_QM_Active, Dept_MIC_Active, Dept_SUS_Active, Dept_RMM_Active, Initial_Scope_Run_Key, Completeness_Request_Key, Completeness_Declaration_Text, Completeness_Text_Key, Completeness_Due_Date, RMES_Key, Final_Release_Request_Key, Final_Release_Declaration_Text, Final_Release_Text_Key, Supplier_Closing_Text); 5 Editable (Target_Markets_Text, Origin_Types, Case_Contacts_JSON, Portal_Contact_Ids, Final_Release_Due_Date); 0 Hidden; 101 ReadOnly.
- **Waiting for supplier: completeness PS-05** · UserTask · owner CIQ RMM (role) · `Activity_1a281c6`. Fields: 2 Mandatory (Completeness_At, RMES_Created_At); 19 Editable (Origin_Types, Case_Contacts_JSON, Portal_Contact_Ids, Confirm_Contact_Ids, Supplier_Contact_Emails, Dept_REG_Active, Dept_SAF_Active, Dept_QM_Active, Dept_MIC_Active, Dept_SUS_Active, Dept_RMM_Active, Completeness_Confirm, Completeness_By_Name, Completeness_By_Email, Completeness_By_Role, Final_Release_Request_Key, Final_Release_Declaration_Text, Final_Release_Text_Key, Final_Release_Due_Date); 0 Hidden; 104 ReadOnly.
- **Part 2 – Beiersdorf review** · Parallel · **parallel, 6 branches** · `Activity_on1xvu`.
  - branch 1:
    - **Review – Regulatory** · UserTask · owner CIQ Regulatory Reviewer (role) · condition `Dept_REG_Active = "Yes"` · `Activity_xnbq22`. Fields: 6 Mandatory (REG_Review_Confirm, REG_Completed_By, REG_Completed_By_Email, REG_Completed_At, REG_RMES_Decision, REG_Gate); 4 Editable (REG_On_Behalf_Of, REG_RMES_Decision_Reason, REG_Open_Count, REG_RMES_Gaps); 0 Hidden; 115 ReadOnly.
  - branch 2:
    - **Review – Safety** · UserTask · owner CIQ Safety Reviewer (role) · condition `Dept_SAF_Active = "Yes"` · `Activity_1armoq0`. Fields: 6 Mandatory (SAF_Review_Confirm, SAF_Completed_By, SAF_Completed_By_Email, SAF_Completed_At, SAF_RMES_Decision, SAF_Gate); 4 Editable (SAF_On_Behalf_Of, SAF_RMES_Decision_Reason, SAF_Open_Count, SAF_RMES_Gaps); 0 Hidden; 115 ReadOnly.
  - branch 3:
    - **Review – QM** · UserTask · owner CIQ QM Reviewer (role) · condition `Dept_QM_Active = "Yes"` · `Activity_1kxceje`. Fields: 5 Mandatory (QM_Review_Confirm, QM_Completed_By, QM_Completed_By_Email, QM_Completed_At, QM_Gate); 2 Editable (QM_On_Behalf_Of, QM_Open_Count); 0 Hidden; 118 ReadOnly.
  - branch 4:
    - **Review – Microbiology** · UserTask · owner CIQ Microbiology Reviewer (role) · condition `Dept_MIC_Active = "Yes"` · `Activity_1252uy3`. Fields: 5 Mandatory (MIC_Review_Confirm, MIC_Completed_By, MIC_Completed_By_Email, MIC_Completed_At, MIC_Gate); 2 Editable (MIC_On_Behalf_Of, MIC_Open_Count); 0 Hidden; 118 ReadOnly.
  - branch 5:
    - **Review – Sustainability** · UserTask · owner CIQ Sustainability Reviewer (role) · condition `Dept_SUS_Active = "Yes"` · `Activity_h505sh`. Fields: 5 Mandatory (SUS_Review_Confirm, SUS_Completed_By, SUS_Completed_By_Email, SUS_Completed_At, SUS_Gate); 2 Editable (SUS_On_Behalf_Of, SUS_Open_Count); 0 Hidden; 118 ReadOnly.
  - branch 6:
    - **Review – RMM** · UserTask · owner CIQ RMM (role) · condition `Dept_RMM_Active = "Yes"` · `Activity_vrfxbc`. Fields: 5 Mandatory (RMM_Review_Confirm, RMM_Completed_By, RMM_Completed_By_Email, RMM_Completed_At, RMM_Gate); 2 Editable (RMM_On_Behalf_Of, RMM_Open_Count); 0 Hidden; 118 ReadOnly.
- **Open items check – before release request** · UserTask · owner CIQ RMM (role) · condition `Hold_For_Open_Items = "Yes"` · `Activity_1lo09cp`. Fields: 2 Mandatory (Open_Items_Gate_Release, Hold_Note); 13 Editable (Target_Markets_Text, Origin_Types, Markets_Label, Case_Contacts_JSON, Portal_Contact_Ids, Confirm_Contact_Ids, Supplier_Contact_Emails, Final_Release_Due_Date, Open_Items_Count, Open_CR_Count, Hold_Override_Reason_Release, Late_Completions_Text, Supplier_Closing_Text); 0 Hidden; 110 ReadOnly.
- **Overall approval** · UserTask · owner CIQ Overall Approver (role) · condition `Overall_Approval_Required = "Yes"` · `Activity_dullxt`. Fields: 2 Mandatory (Overall_Decision, Overall_Decided_By); 3 Editable (Completion_Trigger, Overall_Reason, Supplier_Closing_Text); 0 Hidden; 120 ReadOnly.
- **Waiting for supplier: final release PS-11** · UserTask · owner CIQ RMM (role) · condition `Overall_Decision != "Rejected"` · `Activity_gwgj5o`. Fields: 1 Mandatory (Completion_Trigger); 13 Editable (Case_Contacts_JSON, Portal_Contact_Ids, Confirm_Contact_Ids, Supplier_Contact_Emails, Final_Release_Confirm, Final_Release_By_Name, Final_Release_By_Email, Final_Release_By_Role, Final_Release_At, Released_Revs_JSON, Evidence_List_Text, Open_Items_Count, Open_CR_Count); 0 Hidden; 111 ReadOnly.
- **Open items check – before close** · UserTask · owner CIQ RMM (role) · condition `Hold_For_Open_Items = "Yes"` · `Activity_luckcl`. Fields: 2 Mandatory (Open_Items_Gate_Close, Hold_Note); 11 Editable (Target_Markets_Text, Markets_Label, Case_Contacts_JSON, Portal_Contact_Ids, Confirm_Contact_Ids, Supplier_Contact_Emails, Open_Items_Count, Open_CR_Count, Hold_Override_Reason_Close, Late_Completions_Text, Supplier_Closing_Text); 0 Hidden; 112 ReadOnly.
- **End** · EndEvent · `Activity_ycf01a`. Fields: 0 Mandatory; 0 Editable; 0 Hidden; 125 ReadOnly.
- (platform-made: SendBackToInitiator)

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Case_Code` | Case Code | Text |  |  |
| `Cycle_No` | Cycle No | Number |  |  |
| `Case_Title` | Case Title | Text |  |  |
| `Reactivates_Case_Item` | Reactivates Case Item | Text |  |  |
| `Trade_Name` | Trade Name | Text |  |  |
| `Main_INCI` | Main INCI | Text |  |  |
| `BDF_Material_No` | BDF Material No | Text |  |  |
| `SAP_Material_No` | SAP Material No | Text |  |  |
| `IRMA_Ref` | IRMA Ref | Text |  |  |
| `Supplier_Code` | Supplier Code | Text |  |  |
| `Supplier_Legal_Name` | Supplier Legal Name | Text |  |  |
| `Owner_RMM` | Owner RMM | User |  |  |
| `Target_Markets_Text` | Target Markets Text | Text |  |  |
| `Origin_Types` | Origin Types | Text |  |  |
| `Case_Test` | Case Test | Select |  | list: CIQ Yes No |
| `Request_Key` | Request Key | Text |  |  |
| `BDF_Contact_Name` | BDF Contact Name | Text |  |  |
| `BDF_Contact_Email` | BDF Contact Email | Email |  |  |
| `Markets_Label` | Markets Label | Text |  |  |
| `Template_Label` | Template Label | Text |  |  |
| `Supplier_Due_Date` | Supplier Due Date | Date |  |  |
| `Case_Contacts_JSON` | Case Contacts JSON | Textarea |  |  |
| `Portal_Contact_Ids` | Portal Contact Ids | Text |  |  |
| `Confirm_Contact_Ids` | Confirm Contact Ids | Text |  |  |
| `Supplier_Contact_Emails` | Supplier Contact Emails | Textarea |  |  |
| `Release_Item_Id` | Release Item Id | Text |  |  |
| `Release_Key` | Release Key | Text |  |  |
| `Manifest_Hash` | Manifest Hash | Text |  |  |
| `Release_Manifest_JSON` | Release Manifest JSON | Textarea |  |  |
| `Rule_Set_Version` | Rule Set Version | Text |  |  |
| `Overall_Approval_Required` | Overall Approval Required | Text |  |  |
| `Basic_Data_Received` | Basic Data Received | Text |  |  |
| `Portal_Request_Item_Id` | Portal Request Item Id | Text |  |  |
| `Dept_REG_Active` | Dept REG Active | Select |  | list: CIQ Yes No |
| `Dept_SAF_Active` | Dept SAF Active | Select |  | list: CIQ Yes No |
| `Dept_QM_Active` | Dept QM Active | Select |  | list: CIQ Yes No |
| `Dept_MIC_Active` | Dept MIC Active | Select |  | list: CIQ Yes No |
| `Dept_SUS_Active` | Dept SUS Active | Select |  | list: CIQ Yes No |
| `Dept_RMM_Active` | Dept RMM Active | Select |  | list: CIQ Yes No |
| `Initial_Scope_Run_Key` | Initial Scope Run Key | Text |  |  |
| `Completeness_Request_Key` | Completeness Request Key | Text |  |  |
| `Completeness_Declaration_Text` | Completeness Declaration Text | Textarea |  |  |
| `Completeness_Text_Key` | Completeness Text Key | Text |  |  |
| `Completeness_Due_Date` | Completeness Due Date | Date |  |  |
| `Completeness_Confirm` | Completeness Confirm | Text |  |  |
| `Completeness_By_Name` | Completeness By Name | Text |  |  |
| `Completeness_By_Email` | Completeness By Email | Email |  |  |
| `Completeness_By_Role` | Completeness By Role | Text |  |  |
| `Completeness_At` | Completeness At | DateTime |  |  |
| `RMES_Key` | RMES Key | Text |  |  |
| `RMES_Created_At` | RMES Created At | DateTime |  |  |
| `Final_Release_Request_Key` | Final Release Request Key | Text |  |  |
| `Final_Release_Declaration_Text` | Final Release Declaration Text | Textarea |  |  |
| `Final_Release_Text_Key` | Final Release Text Key | Text |  |  |
| `Final_Release_Due_Date` | Final Release Due Date | Date |  |  |
| `Final_Release_Confirm` | Final Release Confirm | Text |  |  |
| `Final_Release_By_Name` | Final Release By Name | Text |  |  |
| `Final_Release_By_Email` | Final Release By Email | Email |  |  |
| `Final_Release_By_Role` | Final Release By Role | Text |  |  |
| `Final_Release_At` | Final Release At | DateTime |  |  |
| `Released_Revs_JSON` | Released Revs JSON | Textarea |  |  |
| `Evidence_List_Text` | Evidence List Text | Textarea |  |  |
| `Completion_Trigger` | Completion Trigger | Text |  |  |
| `REG_Review_Confirm` | REG Review Confirm | Select |  | list: CIQ Confirm |
| `REG_Completed_By` | REG Completed By | User |  |  |
| `REG_Completed_By_Email` | REG Completed By Email | Email |  |  |
| `REG_Completed_At` | REG Completed At | DateTime |  |  |
| `REG_On_Behalf_Of` | REG On Behalf Of | Text |  |  |
| `REG_RMES_Decision` | REG Internal RMES decision | Select |  | list: CIQ Decision |
| `REG_RMES_Decision_Reason` | REG RMES Decision Reason | Textarea |  |  |
| `SAF_Review_Confirm` | SAF Review Confirm | Select |  | list: CIQ Confirm |
| `SAF_Completed_By` | SAF Completed By | User |  |  |
| `SAF_Completed_By_Email` | SAF Completed By Email | Email |  |  |
| `SAF_Completed_At` | SAF Completed At | DateTime |  |  |
| `SAF_On_Behalf_Of` | SAF On Behalf Of | Text |  |  |
| `SAF_RMES_Decision` | SAF Internal RMES decision | Select |  | list: CIQ Decision |
| `SAF_RMES_Decision_Reason` | SAF RMES Decision Reason | Textarea |  |  |
| `QM_Review_Confirm` | QM Review Confirm | Select |  | list: CIQ Confirm |
| `QM_Completed_By` | QM Completed By | User |  |  |
| `QM_Completed_By_Email` | QM Completed By Email | Email |  |  |
| `QM_Completed_At` | QM Completed At | DateTime |  |  |
| `QM_On_Behalf_Of` | QM On Behalf Of | Text |  |  |
| `MIC_Review_Confirm` | MIC Review Confirm | Select |  | list: CIQ Confirm |
| `MIC_Completed_By` | MIC Completed By | User |  |  |
| `MIC_Completed_By_Email` | MIC Completed By Email | Email |  |  |
| `MIC_Completed_At` | MIC Completed At | DateTime |  |  |
| `MIC_On_Behalf_Of` | MIC On Behalf Of | Text |  |  |
| `SUS_Review_Confirm` | SUS Review Confirm | Select |  | list: CIQ Confirm |
| `SUS_Completed_By` | SUS Completed By | User |  |  |
| `SUS_Completed_By_Email` | SUS Completed By Email | Email |  |  |
| `SUS_Completed_At` | SUS Completed At | DateTime |  |  |
| `SUS_On_Behalf_Of` | SUS On Behalf Of | Text |  |  |
| `RMM_Review_Confirm` | RMM Review Confirm | Select |  | list: CIQ Confirm |
| `RMM_Completed_By` | RMM Completed By | User |  |  |
| `RMM_Completed_By_Email` | RMM Completed By Email | Email |  |  |
| `RMM_Completed_At` | RMM Completed At | DateTime |  |  |
| `RMM_On_Behalf_Of` | RMM On Behalf Of | Text |  |  |
| `Open_Items_Count` | Open Items Count | Number |  |  |
| `Open_CR_Count` | Open CR Count | Number |  |  |
| `REG_Open_Count` | REG Open Count | Number |  |  |
| `REG_RMES_Gaps` | REG RMES Gaps | Number |  |  |
| `SAF_Open_Count` | SAF Open Count | Number |  |  |
| `SAF_RMES_Gaps` | SAF RMES Gaps | Number |  |  |
| `QM_Open_Count` | QM Open Count | Number |  |  |
| `MIC_Open_Count` | MIC Open Count | Number |  |  |
| `SUS_Open_Count` | SUS Open Count | Number |  |  |
| `RMM_Open_Count` | RMM Open Count | Number |  |  |
| `Hold_For_Open_Items` | Hold For Open Items | Text |  | formula: `IF(OR(ISBLANK(Open_Items_Count),ISBLANK(Open_CR_Count)),"Yes",IF(Open_Items_Count+Open_CR_Count=0,"No","Yes"))` |
| `Open_Items_Gate_Release` | Open Items Gate Release | Text |  | formula: `IF(NOT(ISBLANK(Hold_Override_Reason_Release)),"OK",IF(OR(ISBLANK(Open_Items_Count),ISBLANK(Open_CR_Count)),"",IF(Open_Items_Count+Open_CR_Count=0,"OK","")))` |
| `Open_Items_Gate_Close` | Open Items Gate Close | Text |  | formula: `IF(NOT(ISBLANK(Hold_Override_Reason_Close)),"OK",IF(OR(ISBLANK(Open_Items_Count),ISBLANK(Open_CR_Count)),"",IF(Open_Items_Count+Open_CR_Count=0,"OK","")))` |
| `Hold_Note` | Hold Note | Textarea |  |  |
| `Hold_Override_Reason_Release` | Hold Override Reason Release | Textarea |  |  |
| `Hold_Override_Reason_Close` | Hold Override Reason Close | Textarea |  |  |
| `REG_Gate` | REG Gate | Text |  | formula: `IF(OR(ISBLANK(REG_Open_Count),ISBLANK(REG_RMES_Gaps)),"",IF(REG_Open_Count+REG_RMES_Gaps=0,"OK",""))` |
| `SAF_Gate` | SAF Gate | Text |  | formula: `IF(OR(ISBLANK(SAF_Open_Count),ISBLANK(SAF_RMES_Gaps)),"",IF(SAF_Open_Count+SAF_RMES_Gaps=0,"OK",""))` |
| `QM_Gate` | QM Gate | Text |  | formula: `IF(ISBLANK(QM_Open_Count),"",IF(QM_Open_Count=0,"OK",""))` |
| `MIC_Gate` | MIC Gate | Text |  | formula: `IF(ISBLANK(MIC_Open_Count),"",IF(MIC_Open_Count=0,"OK",""))` |
| `SUS_Gate` | SUS Gate | Text |  | formula: `IF(ISBLANK(SUS_Open_Count),"",IF(SUS_Open_Count=0,"OK",""))` |
| `RMM_Gate` | RMM Gate | Text |  | formula: `IF(ISBLANK(RMM_Open_Count),"",IF(RMM_Open_Count=0,"OK",""))` |
| `Late_Completions_Text` | Late Completions Text | Textarea |  |  |
| `Overall_Decision` | Overall Decision | Select |  | list: CIQ Decision |
| `Overall_Reason` | Overall Reason | Textarea |  |  |
| `Overall_Decided_By` | Overall Decided By | User |  |  |
| `Supplier_Closing_Text` | Supplier Closing Text | Textarea |  |  |
| `Final_PDF` | Final PDF | Attachment |  |  |

</details>

### CIQ Audit Event · Form · `CIQ_Audit_Event_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:21Z; last modified 2026-10-09T06:57:41Z.
- **Fields:** 31 header fields (types: Text 15, Number 2, DateTime 2, Select 3, Email 1, Textarea 5, Date 2, Attachment 1); 1 Required at field level; 0 child table(s).
- **vs as-designed:** no drift (31 fields compared).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Event_Key` | Event Key | Text |  |  |
| `Case_Code` | Case Code | Text |  |  |
| `Cycle_No` | Cycle No | Number |  |  |
| `Case_Item_Id` | Case Item Id | Text |  |  |
| `Event_At` | Event At | DateTime |  |  |
| `Event_Category` | Event Category | Select | yes | list: CIQ Event Category |
| `Action_Code` | Action Code | Text |  |  |
| `Actor_Side` | Actor Side | Select |  | list: CIQ Actor Side |
| `Actor_Name` | Actor Name | Text |  |  |
| `Actor_Email` | Actor Email | Email |  |  |
| `Actor_Dept` | Actor Dept | Select |  | list: CIQ Department |
| `Actor_Role_Id` | Actor Role Id | Text |  |  |
| `On_Behalf_Of` | On Behalf Of | Text |  |  |
| `Object_Kind` | Object Kind | Text |  |  |
| `Object_Key` | Object Key | Text |  |  |
| `Object_Item_Id` | Object Item Id | Text |  |  |
| `Object_State` | Object State | Text |  |  |
| `Old_Value_Text` | Old Value Text | Textarea |  |  |
| `New_Value_Text` | New Value Text | Textarea |  |  |
| `Source_Doc_File_Name` | Source Doc File Name | Text |  |  |
| `Source_Doc_Uploaded_At` | Source Doc Uploaded At | DateTime |  |  |
| `Source_Answers_Rev` | Source Answers Rev | Number |  |  |
| `Config_Keys` | Config Keys | Text |  |  |
| `Event_Reason` | Event Reason | Textarea |  |  |
| `Notify_Recipient` | Notify Recipient | Textarea |  |  |
| `Notify_Channel` | Notify Channel | Text |  |  |
| `Delegation_Valid_From` | Delegation Valid From | Date |  |  |
| `Delegation_Valid_To` | Delegation Valid To | Date |  |  |
| `Portal_Activity_Ref` | Portal Activity Ref | Text |  |  |
| `Snapshot_JSON` | Snapshot JSON | Textarea |  |  |
| `Event_File` | Event File | Attachment |  |  |

</details>

### CIQ Internal Note · Form · `CIQ_Internal_Note_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:20Z; last modified 2026-10-09T06:57:41Z.
- **Fields:** 10 header fields (types: Text 5, Number 1, Textarea 1, User 1, Select 1, DateTime 1); 1 Required at field level; 0 child table(s).
- **vs as-designed:** no drift (10 fields compared).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Note_Key` | Note Key | Text |  |  |
| `Case_Code` | Case Code | Text |  |  |
| `Cycle_No` | Cycle No | Number |  |  |
| `Case_Item_Id` | Case Item Id | Text |  |  |
| `Linked_Kind` | Linked Kind | Text |  |  |
| `Linked_Key` | Linked Key | Text |  |  |
| `Note_Text` | Note Text | Textarea | yes |  |
| `Note_Author` | Note Author | User |  |  |
| `Note_Dept` | Note Dept | Select |  | list: CIQ Department |
| `Note_At` | Note At | DateTime |  |  |

</details>

### CIQ RMES Regulatory · Form · `CIQ_RMES_Regulatory_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:19Z; last modified 2026-10-09T06:57:40Z.
- **Fields:** 10 header fields (types: Text 4, Reference 1, Number 3, DateTime 1, Select 1); 1 Required at field level; 2 child table(s).
- **vs as-designed:** no drift (48 fields compared).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `RMES_Key` | RMES Key | Text | yes |  |
| `Result_Case` | Result Case | Reference |  | ref → `CIQ_Case_A00` (Process), lookups Case_Code |
| `Case_Item_Id` | Case Item Id | Text |  |  |
| `Case_Code` | Case Code | Text |  |  |
| `Cycle_No` | Cycle No | Number |  |  |
| `Open_Criteria_Count` | Open Criteria Count | Number |  |  |
| `Open_Blocking_Findings_Count` | Open Blocking Findings Count | Number |  |  |
| `Editing_By` | Editing By | Text |  |  |
| `Editing_Since` | Editing Since | DateTime |  |  |
| `RMES_Voided` | RMES Voided | Select |  | list: CIQ Yes No |

**Child table Criteria** (`Regulatory_Criteria`, 33 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Criteria_Code` | Criterion Code | Text |  |  |
| `Criteria_Part` | RMES Part | Select |  | list: CIQ RMES Part |
| `Criteria_Title` | Criterion Title | Text |  |  |
| `Criteria_Applicable` | Applicable | Select |  | list: CIQ Yes No |
| `Criteria_Applicability_Basis` | Applicability Basis | Text |  |  |
| `Criteria_Override_Reason` | Override Reason | Textarea |  |  |
| `Criteria_Prefill_Value` | Prefill Value | Text |  |  |
| `Criteria_Source_Section_Key` | Source Section Key | Text |  |  |
| `Criteria_Source_Field_Key` | Source Field Key | Text |  |  |
| `Criteria_Source_Row_Id` | Source Row Id | Text |  |  |
| `Criteria_Source_Value_Text` | Source Value Text | Textarea |  |  |
| `Criteria_Source_Answers_Rev` | Source Answers Rev | Number |  |  |
| `Criteria_Source_Doc_File_Name` | Source Doc File Name | Text |  |  |
| `Criteria_Source_Doc_Uploaded_At` | Source Doc Uploaded At | DateTime |  |  |
| `Criteria_Result` | Result | Select |  | list: CIQ RMES Result |
| `Criteria_Comment` | Comment | Textarea |  |  |
| `Criteria_Recorded_By` | Recorded By | User |  |  |
| `Criteria_Recorded_At` | Recorded At | DateTime |  |  |
| `Criteria_Reported_Value` | Reported Value | Number |  |  |
| `Criteria_Reported_Unit` | Reported Unit | Text |  |  |
| `Criteria_Limit_Value` | Limit Value | Number |  |  |
| `Criteria_Limit_Comparator` | Limit Comparator | Text |  |  |
| `Criteria_Limit_Set_Version` | Limit Set Version | Text |  |  |
| `Criteria_Limit_Pass` | Limit Pass | Select |  | list: CIQ Yes No |
| `Criteria_Impact_Resolution` | Impact Resolution | Select |  | list: CIQ Impact Resolution |
| `Criteria_AI_Suggestion_Text` | AI Suggestion Text | Textarea |  |  |
| `Criteria_AI_Source_Quote` | AI Source Quote | Textarea |  |  |
| `Criteria_AI_Source_Doc_File_Name` | AI Source Doc File Name | Text |  |  |
| `Criteria_AI_Source_Doc_Uploaded_At` | AI Source Doc Uploaded At | DateTime |  |  |
| `Criteria_AI_State` | AI State | Select |  | list: CIQ AI State |
| `Criteria_AI_Decided_By` | AI Confirmed By | User |  |  |
| `Criteria_AI_Decided_At` | AI Confirmed At | DateTime |  |  |
| `Criteria_Open_Num` | Open Num | Number |  | formula: `IF(Criteria_Applicable="No",0,IF(ISBLANK(Criteria_Result),1,IF(OR(Criteria_Result="Available",Criteria_Result="Plausible",Criteria_Result="Listed"),0,IF(ISBLANK…` |

**Child table Findings** (`Regulatory_Findings`, 5 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Findings_Text` | Finding Text | Textarea |  |  |
| `Findings_Criterion_Code` | Criterion Code | Text |  |  |
| `Findings_Blocking` | Blocking | Select |  | list: CIQ Yes No |
| `Findings_State` | Finding State | Text |  |  |
| `Findings_Linked_OP_Key` | Linked OP Key | Text |  |  |

</details>

### CIQ RMES Safety · Form · `CIQ_RMES_Safety_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:19Z; last modified 2026-10-09T06:57:40Z.
- **Fields:** 10 header fields (types: Text 4, Reference 1, Number 3, DateTime 1, Select 1); 1 Required at field level; 2 child table(s).
- **vs as-designed:** no drift (48 fields compared).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `RMES_Key` | RMES Key | Text | yes |  |
| `Result_Case` | Result Case | Reference |  | ref → `CIQ_Case_A00` (Process), lookups Case_Code |
| `Case_Item_Id` | Case Item Id | Text |  |  |
| `Case_Code` | Case Code | Text |  |  |
| `Cycle_No` | Cycle No | Number |  |  |
| `Open_Criteria_Count` | Open Criteria Count | Number |  |  |
| `Open_Blocking_Findings_Count` | Open Blocking Findings Count | Number |  |  |
| `Editing_By` | Editing By | Text |  |  |
| `Editing_Since` | Editing Since | DateTime |  |  |
| `RMES_Voided` | RMES Voided | Select |  | list: CIQ Yes No |

**Child table Criteria** (`Safety_Criteria`, 33 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Criteria_Code` | Criterion Code | Text |  |  |
| `Criteria_Part` | RMES Part | Select |  | list: CIQ RMES Part |
| `Criteria_Title` | Criterion Title | Text |  |  |
| `Criteria_Applicable` | Applicable | Select |  | list: CIQ Yes No |
| `Criteria_Applicability_Basis` | Applicability Basis | Text |  |  |
| `Criteria_Override_Reason` | Override Reason | Textarea |  |  |
| `Criteria_Prefill_Value` | Prefill Value | Text |  |  |
| `Criteria_Source_Section_Key` | Source Section Key | Text |  |  |
| `Criteria_Source_Field_Key` | Source Field Key | Text |  |  |
| `Criteria_Source_Row_Id` | Source Row Id | Text |  |  |
| `Criteria_Source_Value_Text` | Source Value Text | Textarea |  |  |
| `Criteria_Source_Answers_Rev` | Source Answers Rev | Number |  |  |
| `Criteria_Source_Doc_File_Name` | Source Doc File Name | Text |  |  |
| `Criteria_Source_Doc_Uploaded_At` | Source Doc Uploaded At | DateTime |  |  |
| `Criteria_Result` | Result | Select |  | list: CIQ RMES Result |
| `Criteria_Comment` | Comment | Textarea |  |  |
| `Criteria_Recorded_By` | Recorded By | User |  |  |
| `Criteria_Recorded_At` | Recorded At | DateTime |  |  |
| `Criteria_Reported_Value` | Reported Value | Number |  |  |
| `Criteria_Reported_Unit` | Reported Unit | Text |  |  |
| `Criteria_Limit_Value` | Limit Value | Number |  |  |
| `Criteria_Limit_Comparator` | Limit Comparator | Text |  |  |
| `Criteria_Limit_Set_Version` | Limit Set Version | Text |  |  |
| `Criteria_Limit_Pass` | Limit Pass | Select |  | list: CIQ Yes No |
| `Criteria_Impact_Resolution` | Impact Resolution | Select |  | list: CIQ Impact Resolution |
| `Criteria_AI_Suggestion_Text` | AI Suggestion Text | Textarea |  |  |
| `Criteria_AI_Source_Quote` | AI Source Quote | Textarea |  |  |
| `Criteria_AI_Source_Doc_File_Name` | AI Source Doc File Name | Text |  |  |
| `Criteria_AI_Source_Doc_Uploaded_At` | AI Source Doc Uploaded At | DateTime |  |  |
| `Criteria_AI_State` | AI State | Select |  | list: CIQ AI State |
| `Criteria_AI_Decided_By` | AI Confirmed By | User |  |  |
| `Criteria_AI_Decided_At` | AI Confirmed At | DateTime |  |  |
| `Criteria_Open_Num` | Open Num | Number |  | formula: `IF(Criteria_Applicable="No",0,IF(ISBLANK(Criteria_Result),1,IF(OR(Criteria_Result="Available",Criteria_Result="Plausible",Criteria_Result="Listed"),0,IF(ISBLANK…` |

**Child table Findings** (`Safety_Findings`, 5 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Findings_Text` | Finding Text | Textarea |  |  |
| `Findings_Criterion_Code` | Criterion Code | Text |  |  |
| `Findings_Blocking` | Blocking | Select |  | list: CIQ Yes No |
| `Findings_State` | Finding State | Text |  |  |
| `Findings_Linked_OP_Key` | Linked OP Key | Text |  |  |

</details>

### CIQ Scope Run · Form · `CIQ_Scope_Run_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:17Z; last modified 2026-10-09T06:57:39Z.
- **Fields:** 18 header fields (types: Text 10, Number 2, Textarea 4, User 1, DateTime 1); 1 Required at field level; 0 child table(s).
- **vs as-designed:** no drift (18 fields compared).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Run_Key` | Run Key | Text | yes |  |
| `Case_Code` | Case Code | Text |  |  |
| `Cycle_No` | Cycle No | Number |  |  |
| `Case_Item_Id` | Case Item Id | Text |  |  |
| `Run_No` | Run No | Number |  |  |
| `Scope_Trigger` | Scope Trigger | Text |  |  |
| `Related_Key` | Related Key | Text |  |  |
| `Release_Item_Id` | Release Item Id | Text |  |  |
| `Rule_Set_Version` | Rule Set Version | Text |  |  |
| `Evaluator_Version` | Evaluator Version | Text |  |  |
| `Input_JSON` | Input JSON | Textarea |  |  |
| `Input_Hash` | Input Hash | Text |  |  |
| `Result_JSON` | Result JSON | Textarea |  |  |
| `Added_Section_Keys` | Added Section Keys | Textarea |  |  |
| `Lead_Departments` | Lead Departments | Text |  |  |
| `Override_Justification` | Override Justification | Textarea |  |  |
| `Run_By` | Run By | User |  |  |
| `Run_At` | Run At | DateTime |  |  |

</details>

### CIQ Section · Form · `CIQ_Section_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:17Z; last modified 2026-10-09T06:57:39Z.
- **Fields:** 32 header fields (types: Text 21, Number 3, Textarea 4, Date 1, Select 2, DateTime 1); 11 Required at field level; 1 child table(s).
- **vs as-designed:** no drift (41 fields compared).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Section_Item_Key` | Section Item Key | Text | yes |  |
| `Case_Code` | Case Code | Text | yes |  |
| `Cycle_No` | Cycle No | Number | yes |  |
| `Supplier_Code` | Supplier Code | Text | yes |  |
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
| `Supplier_Due_Date` | Supplier Due Date | Date |  |  |
| `Portal_Contact_Ids` | Portal Contact Ids | Text | yes |  |
| `Case_Item_Id` | Case Item Id | Text |  |  |
| `Lead_Dept` | Lead Dept | Select |  | list: CIQ Department |
| `Query_Owner_Dept` | Query Owner Dept | Select |  | list: CIQ Review Dept |
| `Co_Review_Depts` | Co Review Depts | Text |  |  |
| `Scope_Run_Key` | Scope Run Key | Text |  |  |
| `Derivation_Kind` | Derivation Kind | Text |  |  |
| `Override_Justification` | Override Justification | Textarea |  |  |
| `Section_Def_Key` | Section Def Key | Text |  |  |
| `Source_Content_Hash` | Source Content Hash | Text |  |  |
| `Created_By_Key` | Created By Key | Text |  |  |
| `Search_INCI` | Search INCI | Textarea |  |  |
| `Search_CAS` | Search CAS | Textarea |  |  |
| `Search_Origin_Types` | Search Origin Types | Text |  |  |
| `Search_DUNS` | Search DUNS | Text |  |  |
| `Source_Answers_Rev` | Source Answers Rev | Number |  |  |
| `Rebuilt_At` | Rebuilt At | DateTime |  |  |

**Child table Components** (`Components`, 9 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Components_Row_Id` | Row Id | Text |  |  |
| `Components_INCI` | INCI | Text |  |  |
| `Components_CAS_No` | CAS No | Text |  |  |
| `Components_EC_No` | EC No | Text |  |  |
| `Components_Function` | Component Function | Text |  |  |
| `Components_Is_Additive` | Is Additive | Select |  | list: CIQ Yes No |
| `Components_Origin` | Component Origin | Text |  |  |
| `Components_Conc_Min` | Conc Min | Number |  |  |
| `Components_Conc_Max` | Conc Max | Number |  |  |

</details>

### CIQ Config Version · Form · `CIQ_Config_Version_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:15Z; last modified 2026-10-09T06:57:38Z.
- **Fields:** 21 header fields (types: Text 9, Select 3, Number 1, Textarea 6, User 1, DateTime 1); 2 Required at field level; 0 child table(s).
- **vs as-designed:** no drift (21 fields compared).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Config_Key` | Config Key | Text | yes |  |
| `Config_Kind` | Config Kind | Select | yes | list: CIQ Config Kind |
| `Version_Label` | Version Label | Text |  |  |
| `Config_State` | Config State | Select |  | list: CIQ Config State |
| `Section_Key` | Section Key | Text |  |  |
| `Section_Rev` | Section Rev | Number |  |  |
| `Payload_JSON` | Payload JSON | Textarea |  |  |
| `Internal_Annotations_JSON` | Internal Annotations JSON | Textarea |  |  |
| `Content_Hash` | Content Hash | Text |  |  |
| `Evaluator_Version` | Evaluator Version | Text |  |  |
| `Change_Note` | Change Note | Textarea |  |  |
| `Published_By` | Published By | User |  |  |
| `Published_At` | Published At | DateTime |  |  |
| `Release_Key` | Release Key | Text |  |  |
| `Release_Label` | Release Label | Text |  |  |
| `Release_Stage` | Release Stage | Select |  | list: CIQ Release Stage |
| `Release_Manifest_JSON` | Release Manifest JSON | Textarea |  |  |
| `Release_Bundle_JSON` | Release Bundle JSON | Textarea |  |  |
| `Manifest_Hash` | Manifest Hash | Text |  |  |
| `Regression_Result_JSON` | Regression Result JSON | Textarea |  |  |
| `Test_Case_Codes` | Test Case Codes | Text |  |  |

</details>

### CIQ Supplier · Form · `CIQ_Supplier_A00`

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-08T18:39:15Z; last modified 2026-10-09T06:57:37Z.
- **Fields:** 11 header fields (types: Text 5, Select 4, Textarea 1, Number 1); 2 Required at field level; 1 child table(s).
- **vs as-designed:** no drift (19 fields compared).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Supplier_Code` | Supplier Code | Text | yes |  |
| `Supplier_Legal_Name` | Supplier Legal Name | Text | yes |  |
| `DUNS_Number` | DUNS Number | Text |  |  |
| `Supplier_Kind` | Supplier Kind | Select |  | list: CIQ Supplier Kind |
| `Supplier_Country_Code` | Supplier Country Code | Select |  | list: CIQ Country Code |
| `SAP_Vendor_Id` | SAP Vendor Id | Text |  |  |
| `Teamcenter_Supplier_Id` | Teamcenter Supplier Id | Text |  |  |
| `Supplier_Active` | Supplier Active | Select |  | list: CIQ Yes No |
| `Supplier_Test` | Supplier Test | Select |  | list: CIQ Yes No |
| `Contact_Portal_Ids_Text` | Contact Portal Ids Text | Textarea |  |  |
| `Pending_Invites` | Pending Invites | Number |  |  |

**Child table Contacts** (`Contacts`, 8 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Contacts_Full_Name` | Full Name | Text |  |  |
| `Contacts_Email` | Email | Email |  |  |
| `Contacts_Role` | Contact Role | Select |  | list: CIQ Contact Role |
| `Contacts_Can_Confirm` | Can Confirm | Select |  | list: CIQ Yes No |
| `Contacts_Portal_User_Id` | Portal User Id | Text |  |  |
| `Contacts_Active` | Contact Active | Select |  | list: CIQ Yes No |
| `Contacts_Invite_Requested_At` | Invite Requested At | DateTime |  |  |
| `Contacts_Invited_At` | Invited At | DateTime |  |  |

</details>

### CIQ ZZ Spike Case · Process · `CIQ_ZZ_Spike_Case_A00` · TEST HARNESS

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-07T11:03:23Z; last modified 2026-10-09T06:39:22Z.
- **Fields:** 34 header fields (types: Select 13, Text 14, DateTime 6, Number 1); 0 Required at field level; 1 child table(s).
- **Members:** none (no role can open it).

**Steps**

- **Create spike case** · StartEvent · owner: the initiator (any role with InitiateItems) · `Activity_18dgdbl`. Fields: 0 Mandatory; 0 Editable; 0 Hidden; 35 ReadOnly.
- **Spike prepare** · UserTask · owner **role RoEKHLFdFsUJ ("CIQ ZZ Spike Role A") no longer exists** · `Activity_194d12o`. Fields: 0 Mandatory; 8 Editable (Flag_A, Flag_B, Flag_C, Flag_D, Flag_E, Flag_F, Spike_Decision, Spike_Case_Notes); 0 Hidden; 27 ReadOnly.
- **Spike review lanes** · Parallel · **parallel, 6 branches** · `Activity_t7r746`.
  - branch 1:
    - **Spike review – A** · UserTask · owner **role RoEKHLFdFsUJ ("CIQ ZZ Spike Role A") no longer exists** · condition `Flag_A = "Yes"` · `Activity_7a5wvb`. Fields: 1 Mandatory (Lane_A_Confirm); 3 Editable (Lane_A_By, Lane_A_At, Lane_A_Note); 0 Hidden; 31 ReadOnly.
  - branch 2:
    - **Spike review – B** · UserTask · owner **role RoEKHLGDsV2J ("CIQ ZZ Spike Role B") no longer exists** · condition `Flag_B = "Yes"` · `Activity_7a5wvc`. Fields: 1 Mandatory (Lane_B_Confirm); 3 Editable (Lane_B_By, Lane_B_At, Lane_B_Note); 0 Hidden; 31 ReadOnly.
  - branch 3:
    - **Spike review – C** · UserTask · owner **role RoEKHLFdFsUJ ("CIQ ZZ Spike Role A") no longer exists** · condition `Flag_C = "Yes"` · `Activity_7a5wvd`. Fields: 1 Mandatory (Lane_C_Confirm); 3 Editable (Lane_C_By, Lane_C_At, Lane_C_Note); 0 Hidden; 31 ReadOnly.
  - branch 4:
    - **Spike review – D** · UserTask · owner **role RoEKHLGDsV2J ("CIQ ZZ Spike Role B") no longer exists** · condition `Flag_D = "Yes"` · `Activity_7a5wve`. Fields: 1 Mandatory (Lane_D_Confirm); 3 Editable (Lane_D_By, Lane_D_At, Lane_D_Note); 0 Hidden; 31 ReadOnly.
  - branch 5:
    - **Spike review – E** · UserTask · owner **role RoEKHLFdFsUJ ("CIQ ZZ Spike Role A") no longer exists** · condition `Flag_E = "Yes"` · `Activity_7a5wvf`. Fields: 1 Mandatory (Lane_E_Confirm); 3 Editable (Lane_E_By, Lane_E_At, Lane_E_Note); 0 Hidden; 31 ReadOnly.
  - branch 6:
    - **Spike review – F** · UserTask · owner **role RoEKHLGDsV2J ("CIQ ZZ Spike Role B") no longer exists** · condition `Flag_F = "Yes"` · `Activity_7a5wvg`. Fields: 1 Mandatory (Lane_F_Confirm); 3 Editable (Lane_F_By, Lane_F_At, Lane_F_Note); 0 Hidden; 31 ReadOnly.
- **Spike hold check** · UserTask · owner **role RoEKHLFdFsUJ ("CIQ ZZ Spike Role A") no longer exists** · condition `Hold_Flag = "Yes"` · `Activity_90lk5i`. Fields: 0 Mandatory; 0 Editable; 0 Hidden; 35 ReadOnly.
- **Spike gated step** · UserTask · owner **role RoEKHLFdFsUJ ("CIQ ZZ Spike Role A") no longer exists** · `Activity_1tuyhu`. Fields: 1 Mandatory (Gate); 0 Editable; 0 Hidden; 34 ReadOnly.
- **Spike not-equal step** · UserTask · owner **role RoEKHLGDsV2J ("CIQ ZZ Spike Role B") no longer exists** · condition `Spike_Decision != "Rejected"` · `Activity_1uarf0z`. Fields: 0 Mandatory; 0 Editable; 0 Hidden; 35 ReadOnly.
- **End** · EndEvent · `Activity_1t24obg`. Fields: 0 Mandatory; 0 Editable; 0 Hidden; 35 ReadOnly.
- (platform-made: SendBackToInitiator)

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Flag_A` | Flag_A | Select |  | list: CIQ ZZ Spike Yes No |
| `Flag_B` | Flag_B | Select |  | list: CIQ ZZ Spike Yes No |
| `Flag_C` | Flag_C | Select |  | list: CIQ ZZ Spike Yes No |
| `Flag_D` | Flag_D | Select |  | list: CIQ ZZ Spike Yes No |
| `Flag_E` | Flag_E | Select |  | list: CIQ ZZ Spike Yes No |
| `Flag_F` | Flag_F | Select |  | list: CIQ ZZ Spike Yes No |
| `Lane_A_Confirm` | Lane_A_Confirm | Select |  | list: CIQ ZZ Spike Yes No |
| `Lane_A_By` | Lane_A_By | Text |  |  |
| `Lane_A_At` | Lane_A_At | DateTime |  |  |
| `Lane_A_Note` | Lane_A_Note | Text |  |  |
| `Lane_B_Confirm` | Lane_B_Confirm | Select |  | list: CIQ ZZ Spike Yes No |
| `Lane_B_By` | Lane_B_By | Text |  |  |
| `Lane_B_At` | Lane_B_At | DateTime |  |  |
| `Lane_B_Note` | Lane_B_Note | Text |  |  |
| `Lane_C_Confirm` | Lane_C_Confirm | Select |  | list: CIQ ZZ Spike Yes No |
| `Lane_C_By` | Lane_C_By | Text |  |  |
| `Lane_C_At` | Lane_C_At | DateTime |  |  |
| `Lane_C_Note` | Lane_C_Note | Text |  |  |
| `Lane_D_Confirm` | Lane_D_Confirm | Select |  | list: CIQ ZZ Spike Yes No |
| `Lane_D_By` | Lane_D_By | Text |  |  |
| `Lane_D_At` | Lane_D_At | DateTime |  |  |
| `Lane_D_Note` | Lane_D_Note | Text |  |  |
| `Lane_E_Confirm` | Lane_E_Confirm | Select |  | list: CIQ ZZ Spike Yes No |
| `Lane_E_By` | Lane_E_By | Text |  |  |
| `Lane_E_At` | Lane_E_At | DateTime |  |  |
| `Lane_E_Note` | Lane_E_Note | Text |  |  |
| `Lane_F_Confirm` | Lane_F_Confirm | Select |  | list: CIQ ZZ Spike Yes No |
| `Lane_F_By` | Lane_F_By | Text |  |  |
| `Lane_F_At` | Lane_F_At | DateTime |  |  |
| `Lane_F_Note` | Lane_F_Note | Text |  |  |
| `Spike_Decision` | Spike_Decision | Select |  | list: CIQ ZZ Spike Decision |
| `Open_Count` | Open_Count | Number |  | ref → `CIQ_ZZ_Spike_Register_A00` (Form) |
| `Hold_Flag` | Hold_Flag | Text |  | formula: `IF(ISBLANK(Open_Count),"Yes",IF(Open_Count=0,"No","Yes"))` |
| `Gate` | Gate | Text |  | formula: `IF(IF(ISBLANK(Open_Count),0,Open_Count)=0,"OK","")` |

**Child table Spike Case Notes** (`Spike_Case_Notes`, 2 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Note_Text` | Note_Text | Text |  |  |
| `Note_By` | Note_By | Text |  |  |

</details>

### CIQ ZZ Spike Point · Process · `CIQ_ZZ_Spike_Point_A00` · TEST HARNESS

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-07T17:42:59Z; last modified 2026-10-09T06:39:22Z.
- **Fields:** 6 header fields (types: Number 1, Textarea 2, Text 1, Date 1, Select 1); 0 Required at field level; 1 child table(s).
- **Members:** none (no role can open it).

**Steps**

- **Raise spike point** · StartEvent · owner: the initiator (any role with InitiateItems) · `Activity_1wjqod`. Fields: 0 Mandatory; 5 Editable (Round_No, Question_Text, Awaiting_Response, Due_Date, To_Supplier); 0 Hidden; 2 ReadOnly.
- **Spike waiting** · UserTask · owner **role RoEKHLFdFsUJ ("CIQ ZZ Spike Role A") no longer exists** · condition `To_Supplier = "Yes"` · `Activity_1nm6syq`. Fields: 0 Mandatory; 1 Editable (Response_Text); 0 Hidden; 6 ReadOnly.
- **Spike review** · UserTask · owner **role RoEKHLGDsV2J ("CIQ ZZ Spike Role B") no longer exists** · `Activity_2yluch`. Fields: 0 Mandatory; 1 Editable (Spike_Rounds); 0 Hidden; 6 ReadOnly. Switches: Spike_Rounds {"IsSendbackEnabled":true}.
- **End** · EndEvent · `Activity_fdurmy`. Fields: 0 Mandatory; 0 Editable; 0 Hidden; 7 ReadOnly.
- (platform-made: SendBackToInitiator)

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Round_No` | Round_No | Number |  |  |
| `Question_Text` | Question_Text | Textarea |  |  |
| `Awaiting_Response` | Awaiting_Response | Text |  |  |
| `Response_Text` | Response_Text | Textarea |  |  |
| `Due_Date` | Due_Date | Date |  |  |
| `To_Supplier` | To_Supplier | Select |  | list: CIQ ZZ Spike Yes No |

**Child table Spike Rounds** (`Spike_Rounds`, 4 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Spike_Rounds_Round_No` | Round_No | Number |  |  |
| `Question` | Question | Text |  |  |
| `Response` | Response | Text |  |  |
| `Outcome` | Outcome | Text |  |  |

</details>

### CIQ ZZ Spike Log · Form · `CIQ_ZZ_Spike_Log_A00` · TEST HARNESS

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-07T10:31:11Z; last modified 2026-10-09T06:39:22Z.
- **Fields:** 6 header fields (types: Text 4, DateTime 1, Textarea 1); 0 Required at field level; 0 child table(s).
- **Members:** none (no role can open it).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Log_Key` | Log_Key | Text |  |  |
| `Log_Source` | Log_Source | Text |  |  |
| `Log_Event` | Log_Event | Text |  |  |
| `Log_Item_Id` | Log_Item_Id | Text |  |  |
| `Log_At` | Log_At | DateTime |  |  |
| `Log_Payload` | Log_Payload | Textarea |  |  |

</details>

### CIQ ZZ Spike Register · Form · `CIQ_ZZ_Spike_Register_A00` · TEST HARNESS

- **Status:** Live; published (draft field set = published field set). Last published 2026-10-07T12:00:13Z; last modified 2026-10-09T06:39:22Z.
- **Fields:** 3 header fields (types: Text 1, Reference 1, Number 1); 1 Required at field level; 1 child table(s).
- **Members:** none (no role can open it).

<details><summary>Fields</summary>

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Register_Key` | Register_Key | Text | yes |  |
| `Register_Case` | Register_Case | Reference |  | ref → `CIQ_ZZ_Spike_Case_A00` (Process), lookups Flag_A |
| `Open_Lines` | Open_Lines | Number |  | ref → `CIQ_ZZ_Spike_Register_A00` (Form) |

**Child table Spike Lines** (`Spike_Lines`, 2 columns, published)

| Id | Name | Type | Req | List / reference / formula |
|---|---|---|---|---|
| `Line_Text` | Line_Text | Text |  |  |
| `Line_Open` | Line_Open | Number |  |  |

</details>

## 6. Lists

| List | Id | Items | Used by |
|---|---|---|---|
| CIQ Actor Side | `CIQ_Actor_Side_A00` | BDF, Supplier, System | 1 field(s): CIQ Audit Event.Actor_Side |
| CIQ Event Category | `CIQ_Event_Category_A00` | Case, Scope, Section, Section review, Snapshot, Open point, RMES, Change request, Configuration, Notification, Delegation, Assignment, Change attempt, Cancellation, Access, Item created, Final PDF | 1 field(s): CIQ Audit Event.Event_Category |
| CIQ Contact Role | `CIQ_Contact_Role_A00` | Coordinator, Quality, Regulatory, Key account, Other | 1 field(s): CIQ Supplier.Contacts_Role |
| CIQ Country Code | `CIQ_Country_Code_A00` | AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE, GB, TR, CN, US, CA | 1 field(s): CIQ Supplier.Supplier_Country_Code |
| CIQ Supplier Kind | `CIQ_Supplier_Kind_A00` | Manufacturer, Distributor, Trader | 1 field(s): CIQ Supplier.Supplier_Kind |
| CIQ AI State | `CIQ_AI_State_A00` | Proposed, Confirmed, Discarded | 2 field(s): CIQ RMES Regulatory.Criteria_AI_State, CIQ RMES Safety.Criteria_AI_State |
| CIQ RMES Result | `CIQ_RMES_Result_A00` | Available, Not available, Plausible, Implausible, Listed, Not listed, Negative, Not applicable | 2 field(s): CIQ RMES Regulatory.Criteria_Result, CIQ RMES Safety.Criteria_Result |
| CIQ RMES Part | `CIQ_RMES_Part_A00` | A, B, C, D | 2 field(s): CIQ RMES Regulatory.Criteria_Part, CIQ RMES Safety.Criteria_Part |
| CIQ Release Stage | `CIQ_Release_Stage_A00` | Test, Live | 1 field(s): CIQ Config Version.Release_Stage |
| CIQ Review Dept | `CIQ_Review_Dept_A00` | REG, SAF, QM, MIC, SUS, RMM | 3 field(s): CIQ Open Point.OP_Dept, CIQ Open Point.Raised_By_Dept, CIQ Section.Query_Owner_Dept |
| CIQ Config State | `CIQ_Config_State_A00` | Draft, Published, Retired | 1 field(s): CIQ Config Version.Config_State |
| CIQ Config Kind | `CIQ_Config_Kind_A00` | Template, Section definition, Rule set, Section ownership, RMES criteria, Limit set, Text bundle, Reminders, Settings, Regression set, Release | 1 field(s): CIQ Config Version.Config_Kind |
| CIQ Impact Resolution | `CIQ_Impact_Resolution_A00` | No impact confirmed, Re-assessed, Finding raised | 7 field(s): CIQ Change Request.REG_Assessment, CIQ Change Request.SAF_Assessment, CIQ Change Request.QM_Assessment, CIQ Change Request.MIC_Assessment, CIQ Change Request.SUS_Assessment, CIQ RMES Regulatory.Criteria_Impact_Resolution, … |
| CIQ CR Outcome | `CIQ_CR_Outcome_A00` | Accepted, Accepted – scope extended, Refused – after final release, Refused – not valid | 1 field(s): CIQ Change Request.CR_Outcome |
| CIQ Round Outcome | `CIQ_Round_Outcome_A00` | Accepted, Returned, Withdrawn | 1 field(s): CIQ Open Point.Rounds_Outcome |
| CIQ OP Outcome | `CIQ_OP_Outcome_A00` | Accepted, Withdrawn | 1 field(s): CIQ Open Point.OP_Outcome |
| CIQ OP Progress | `CIQ_OP_Progress_A00` | Open, In progress | 1 field(s): CIQ Open Point.OP_Progress |
| CIQ OP Kind | `CIQ_OP_Kind_A00` | Query, Document request, Additional part, Internal review, Department review, Contact update | 1 field(s): CIQ Open Point.OP_Kind |
| CIQ Department | `CIQ_Department_A00` | RMM, REG, SAF, QM, MIC, SUS, CUS, LEG | 3 field(s): CIQ Audit Event.Actor_Dept, CIQ Internal Note.Note_Dept, CIQ Section.Lead_Dept |
| CIQ Decision | `CIQ_Decision_A00` | Approved, Rejected | 4 field(s): CIQ Open Point.Late_Decision, CIQ Case.REG_RMES_Decision, CIQ Case.SAF_RMES_Decision, CIQ Case.Overall_Decision |
| CIQ Confirm | `CIQ_Confirm_A00` | Confirmed | 6 field(s): CIQ Case.REG_Review_Confirm, CIQ Case.SAF_Review_Confirm, CIQ Case.QM_Review_Confirm, CIQ Case.MIC_Review_Confirm, CIQ Case.SUS_Review_Confirm, CIQ Case.RMM_Review_Confirm |
| CIQ Yes No | `CIQ_Yes_No_A00` | Yes, No | 27 field(s): CIQ Change Request.Contact_Verified, CIQ Change Request.Impact_REG, CIQ Change Request.Impact_SAF, CIQ Change Request.Impact_QM, CIQ Change Request.Impact_MIC, CIQ Change Request.Impact_SUS, … |
| CIQ ZZ Spike Yes No (test) | `CIQ_ZZ_Spike_Yes_No_A00` | Yes, No | 13 field(s): CIQ ZZ Spike Case.Flag_A, CIQ ZZ Spike Case.Flag_B, CIQ ZZ Spike Case.Flag_C, CIQ ZZ Spike Case.Flag_D, CIQ ZZ Spike Case.Flag_E, CIQ ZZ Spike Case.Flag_F, … |
| CIQ ZZ Spike Decision (test) | `CIQ_ZZ_Spike_Decision_A00` | Approved, Rejected | 1 field(s): CIQ ZZ Spike Case.Spike_Decision |

## 7. Integrations

| Integration | Id | On/off | Trigger | Action | Published |
|---|---|---|---|---|---|
| CIQ Z2 Case cancelled – neutral e-mail | `CIQ_Z2_Case_cancelled_neutral_e_ma_A00` | off | none (empty shell) | none (empty shell) | 2026-10-08T18:39:52Z by Thomas |
| CIQ Z1 Case completed – PDF, e-mails, notification event | `CIQ_Z1_Case_completed_PDF_e_mails__A00` | off | none (empty shell) | none (empty shell) | 2026-10-08T18:39:50Z by Thomas |
| CIQ ZZ Spike log – point completed (test) | `CIQ_ZZ_Spike_log_point_completed_A00` | **ON** | Kissflow Process 3.7.6 · ItemCompleted "When an item completes its workflow"; process_id=CIQ_ZZ_Spike_Point_A00; connection CIQ ZZ Spike Kissflow Process connection (CnEKHrHqXRKB) | Kissflow Dataform 1.5.4 · CreateAndSubmitItem "Create and submit an item"; form_id=CIQ_ZZ_Spike_Log_A00; connection CIQ ZZ Spike Kissflow Dataform connection (CnEKHrH5GzkY); maps Log_Key ← ["point"], Log_Source ← ["Point"], Log_Event ← ["completed"], Log_Item_Id ← context.Trigger_ompleted_A00._id, Log_At ← (unmapped), Log_Payload ← context.Trigger_ompleted_A00.Question_Text | 2026-10-14T06:52:22Z by Flobot |
| CIQ ZZ Spike log – register created (test) | `CIQ_ZZ_Spike_log_register_created_A00` | **ON** | Kissflow Dataform 1.5.4 · ItemCreated "When an item is added to a dataform"; form_id=CIQ_ZZ_Spike_Register_A00; connection CIQ ZZ Spike Kissflow Dataform connection (CnEKHrH5GzkY) | Kissflow Dataform 1.5.4 · CreateAndSubmitItem "Create and submit an item"; form_id=CIQ_ZZ_Spike_Log_A00; connection CIQ ZZ Spike Kissflow Dataform connection (CnEKHrH5GzkY); maps Log_Key ← context.Trigger__created_A00.Register_Key, Log_Source ← ["Register"], Log_Event ← ["created"], Log_Item_Id ← context.Trigger__created_A00._id, Log_At ← (unmapped), Log_Payload ← (unmapped) | 2026-10-14T06:52:24Z by Flobot |

No portal↔app integration (X/Y, I-1/I-3/I-6) exists in this container.

## 8. Drift from the as-designed spec (rev 31)

- **Flows:** 11 of 11 designed flows live, none missing, none unplanned. Extra: the 4 approved test-harness flows (Process CIQ_ZZ_Spike_Case_A00, Process CIQ_ZZ_Spike_Point_A00, Form CIQ_ZZ_Spike_Log_A00, Form CIQ_ZZ_Spike_Register_A00).
- **Fields, child tables, steps, conditions, owners, step permissions:** no drift in any of the 11 flows. The one post-generate change is `IsSendbackEnabled` on the 6 Open Point review steps (D37).
- **Lists:** all 22 designed lists live with exactly the designed items, in order; every list is used by a live field.
- **Grants:** every live role × flow access class matches the compiled plan plus the recorded post-generate targets (Case Admin = flow Admin on the 3 processes; reviewers View); the 3 D38 roles match CIQ Reader.
- **Roles:**
  - Admin (RoEK3_3Jy9XU): live name "Admin / Developer"
  - User (user, RoEK3_3NtdWL): NOT LIVE (role id no longer exists)
  - Customs & Trade Compliance (RoEKwv6pxX3g): added 9 Oct (D38), not in plan rev 31 — live
  - Legal / IP (RoEKwvH8qaxG): added 9 Oct (D38), not in plan rev 31 — live
  - Business owner (reports) (RoEKwvR_cPvv): added 9 Oct (D38), not in plan rev 31 — live
  - D38 renames NOT applied (11): CIQ Business Admin → Business administrator; CIQ Case Admin → Case administrator; CIQ Integration Service → Integration service; CIQ Microbiology Reviewer → Microbiology reviewer; CIQ Overall Approver → Overall approver; CIQ QM Reviewer → Quality Management reviewer; CIQ RMM → Raw Material Manager (RMM); CIQ Reader → Auditor; CIQ Regulatory Reviewer → Regulatory Affairs reviewer; CIQ Safety Reviewer → Product Safety reviewer; CIQ Sustainability Reviewer → Sustainability reviewer
- **Integrations:**
  - CIQ Z1 Case completed – PDF, e-mails, notification event: live OFF, trigger none (empty shell), action none (empty shell) (designed: Kissflow Process · ItemCompleted → create CIQ_Audit_Event_A00; D31 says generate leaves an incomplete, switched-off shell)
  - CIQ Z2 Case cancelled – neutral e-mail: live OFF, trigger none (empty shell), action none (empty shell) (designed: Kissflow Dataform · ItemCreated (verified live, K-09f) → notify CIQ_Audit_Event_A00; D31 says generate leaves an incomplete, switched-off shell)
- **Pages and UI:**
  - plan pages: 0 (generated with --no-pages, D19); live pages: Home Page (Home_Page_A00, Kissflow default, created 2026-10-06T20:09:13Z); navigation: Home → Page:Home_Page_A00
  - custom UI (not in plan rev 31; deployed after generate, D37): App custom UI bundle CCEK4Jhdt04g Live zip ciq-workbench-ui-235af550b4.zip; _is_custom_ui_enabled=true
- **App:**
  - app LastPublishedAt 2026-10-14T06:52:29Z (by Thomas); no recorded write after 9 Oct — the 2 spike integrations were re-published by Flobot at the same minute; CIQ flows' LastPublishedAt unchanged since 8 Oct

## 9. Not read, or read only indirectly

- 404 GET /metadata/2/{acc}/application/CIQ_Digital_A00 (no such route; the application draft was read instead)
- 403 GET /flow/2/{acc}/portal/CIQ_Digital_A00/flow (all-flows route refused for this key; the per-type listings were used instead and cross-checked with /flow/2/{acc}/explore: same 43 items)
- rate-limited (429) on the first pass and re-read successfully: /flow/2/{acc}/application/CIQ_Digital_A00/page/, /application/2/{acc}/CIQ_Digital_A00/component/custom/list?page_number=1&page_size=300&Category=Application
- published (live) metadata blobs: no GET route found (404 on /metadata/2/{acc}/{type}/{id}, …/published, …/live, …/publish); 'published' state is taken from the flow list (Status, LastPublishedAt), the draft's PublishedAt, and the published runtime field list (/{type}/2/{acc}/{id}/allfields)
- connections (CnEKHrH5GzkY, CnEKHrHqXRKB): not read on purpose (Integration-Admin route, may expose minted keys); names/ids taken from the integration drafts
- SLA durations / reminders / per-step e-mail notifications: no such keys in any process draft (none set, or stored outside the draft blob) [unverified which]
- child-table grants: no flow of their own, nothing to read per role
- datasets: dataset list returned 0 rows; the admin key has no dataset scope (master §11.4), so a dataset that exists but is not listed cannot be ruled out
