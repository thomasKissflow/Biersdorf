// Every flow id, field id, step name and list value the CIQ Sync Service uses (plan v5 §3, §4, §5).
//
// Sources and status (14 Oct 2026, night):
// - Portal ids: live. CIQP Request v5 step ids from spike S-5 (s5-result.json, 14/14 pass); Uploads child model id
//   CIQP_Request_A00_Uploads (engine naming `${flowId}_${slug(label)}`).
// - App ids of objects that exist today (CIQ Case, CIQ Open Point, Forms): live (inventory-app.md).
// - App objects created TONIGHT by the app session (CIQ Review, CIQ Case Data, CIQ Mail Outbox, CIQ Service Request)
//   and the new fields on CIQ Case / CIQ Open Point: EXPECTED ids only (Kissflow derives `slug(Name)_A00`; field id =
//   name with underscores). verifyIds() reads the live flow lists and reports every expected id that is missing.
//   Child-table model ids of the new forms are expected under the same engine naming and resolved from allfields.
//
// Nothing here is a secret. Account and host come from kf.mjs (.env), never from this file.

export const APP = "CIQ_Digital_A00";
export const PORTAL = "CIQ_Supplier_Portal_A00";

// ---------------------------------------------------------------------------------------------- flows

export const FLOW = {
  // portal (live)
  request: "CIQP_Request_A00",
  query: "CIQP_Query_A00",
  release: "CIQP_Final_Release_A00",
  help: "CIQP_Help_Article_A00",
  // app (live)
  caseProc: "CIQ_Case_A00",
  openPoint: "CIQ_Open_Point_A00",
  audit: "CIQ_Audit_Event_A00",
  note: "CIQ_Internal_Note_A00",
  rmesSaf: "CIQ_RMES_Safety_A00",
  rmesReg: "CIQ_RMES_Regulatory_A00",
  scopeRun: "CIQ_Scope_Run_A00",
  config: "CIQ_Config_Version_A00",
  supplier: "CIQ_Supplier_A00",
  // app (EXPECTED: created tonight by the app session)
  review: "CIQ_Review_A00",
  caseData: "CIQ_Case_Data_A00",
  outbox: "CIQ_Mail_Outbox_A00",
  serviceRequest: "CIQ_Service_Request_A00",
};

/** Which container and kind each flow lives in, and whether its id is live today or expected. */
export const FLOW_META = {
  [FLOW.request]: { container: PORTAL, kind: "process", status: "live" },
  [FLOW.query]: { container: PORTAL, kind: "process", status: "live" },
  [FLOW.release]: { container: PORTAL, kind: "process", status: "live" },
  [FLOW.help]: { container: PORTAL, kind: "form", status: "live" },
  [FLOW.caseProc]: { container: APP, kind: "process", status: "live" },
  [FLOW.openPoint]: { container: APP, kind: "process", status: "live" },
  [FLOW.audit]: { container: APP, kind: "form", status: "live" },
  [FLOW.note]: { container: APP, kind: "form", status: "live" },
  [FLOW.rmesSaf]: { container: APP, kind: "form", status: "live" },
  [FLOW.rmesReg]: { container: APP, kind: "form", status: "live" },
  [FLOW.scopeRun]: { container: APP, kind: "form", status: "live" },
  [FLOW.config]: { container: APP, kind: "form", status: "live" },
  [FLOW.supplier]: { container: APP, kind: "form", status: "live" },
  [FLOW.review]: { container: APP, kind: "process", status: "expected" },
  [FLOW.caseData]: { container: APP, kind: "form", status: "expected" },
  [FLOW.outbox]: { container: APP, kind: "form", status: "expected" },
  [FLOW.serviceRequest]: { container: APP, kind: "form", status: "expected" },
};

export const containerOf = (flowId) => FLOW_META[flowId]?.container ?? APP;

// ---------------------------------------------------------------------------------------------- steps

/** Step names (what `_current_context[]._context_current_step` reports) and known activity ids. Submits always take
 *  the activity INSTANCE id from the admin GET `_current_context` (S-5: /myitems ids are stale after step 1). */
export const STEP = {
  request: {
    start: { name: "Issue request", activity: "Activity_1fvwo2u" },
    fill: { name: "Supplier: fill in the CIQ", activity: "Activity_15rz7z2" },
    keep: { name: "Supplier: keep the CIQ up to date", activity: "Activity_1mhx3t7" },
    end: { name: "End", activity: "Activity_gafhuz" },
  },
  query: {
    start: { name: "Raise query", activity: "Activity_rngj1n" },
    respond: { name: "Supplier: respond", activity: "Activity_qohzey" },
    end: { name: "End", activity: "Activity_49tjko" },
  },
  release: {
    start: { name: "Request final release", activity: "Activity_sefw4p" },
    release: { name: "Supplier: release", activity: "Activity_1gx3sjo" },
    end: { name: "End", activity: "Activity_ofz8a4" },
  },
  caseProc: {
    start: { name: "Create case", activity: "Activity_p1i6xz" },
    waitingSupplier: { name: "Waiting for supplier: CIQ", activity: "Activity_1kltjdn" },
    review: { name: "Beiersdorf review and final release", activity: "Activity_gwgj5o" },
    end: { name: "End", activity: "Activity_ycf01a" },
  },
  // CIQ Review: as built and read back by the app session on 15 Oct (role-assigned, V-17a).
  review: {
    start: { name: "Activate review", activity: "Activity_47r3ow" },
    byDept: { REG: "Review – Regulatory", SAF: "Review – Safety", QM: "Review – QM", MIC: "Review – Microbiology", SUS: "Review – Sustainability", RMM: "Review – RMM" },
    activityByDept: { REG: "Activity_1wb6scg", SAF: "Activity_116f3su", QM: "Activity_12d3ab4", MIC: "Activity_1wkxybl", SUS: "Activity_1um3oo7", RMM: "Activity_1mh3ji6" },
    end: { name: "End", activity: "Activity_1xjk2tg" },
  },
  openPoint: {
    start: { name: "Raise open point", activity: "Activity_18t0lhi" },
    // v5 renames "Review – <Dept>" to "Open point – <Dept>", keeping the activity ids.
    byDept: { REG: "Open point – Regulatory", SAF: "Open point – Safety", QM: "Open point – QM", MIC: "Open point – Microbiology", SUS: "Open point – Sustainability", RMM: "Open point – RMM" },
    activityByDept: { REG: "Activity_uka3mx", SAF: "Activity_1kdump3", QM: "Activity_1go37bt", MIC: "Activity_hha7u2", SUS: "Activity_y4af4g", RMM: "Activity_xc8fbb" },
    end: { name: "End", activity: "Activity_i73i25" },
  },
};

// ---------------------------------------------------------------------------------------------- roles

export const ROLE = {
  RMM: "RoEKl83f9jPF",
  REG: "RoEKl84Hca4w",
  SAF: "RoEKl84xAFRW",
  QM: "RoEKl85WB1yE",
  MIC: "RoEKl8647K2u",
  SUS: "RoEKl86bQQrO",
  CUS: "RoEKwv6pxX3g",
  LEG: "RoEKwvH8qaxG",
  admin: "RoEKl87f38Xw", // Business administrator
  auditor: "RoEKl88CJiLP",
  owner: "RoEKwvR_cPvv", // Business owner (reports)
  caseAdmin: "RoEKl88jv4dv",
  service: "RoEKl89I5nGx", // Integration service
  supplier: "RoEK4XPKXCvH", // portal Supplier role
};

/** App role → prototype department (internal users) or prototype persona (roles without a department). */
export const ROLE_DEPT = { [ROLE.RMM]: "RMM", [ROLE.REG]: "REG", [ROLE.SAF]: "SAF", [ROLE.QM]: "QM", [ROLE.MIC]: "MIC", [ROLE.SUS]: "SUS", [ROLE.CUS]: "CUS", [ROLE.LEG]: "LEG" };
export const ROLE_PERSONA = { [ROLE.admin]: "admin", [ROLE.auditor]: "auditor", [ROLE.owner]: "owner" };

// ---------------------------------------------------------------------------------------------- fields

/** Field ids per flow. `REQ` = field-level Required at Start (enforced by Kissflow, P7). */
export const F = {
  request: {
    keys: ["Request_Key", "Case_Code", "Cycle_No", "Supplier_Code", "App_Case_Item_Id"],
    header: ["Trade_Name", "Main_INCI", "BDF_Material_No", "Supplier_Display_Name", "BDF_Contact_Name", "BDF_Contact_Email", "Markets_Label", "Template_Label", "Supplier_Due_Date", "Case_Contacts_JSON", "Assigned_Contacts"],
    service: ["Rule_Set_Version", "Template_Version", "Config_Bundle_JSON", "Config_Bundle_Hash", "BDF_Set_JSON", "Manual_Scope_JSON", "Case_Phase_Label", "Request_Locked", "Questions_History_JSON", "Release_By_Name", "Release_At", "Change_Reports_JSON"],
    // S-2 design (14 Oct): every supplier file is in the header Attachment field Supplier_Files; the Uploads child rows
    // carry the metadata, with Upload_Attachment_Id = the "Attach-…" id in Supplier_Files (Upload_File is unused).
    files: "Supplier_Files",
    supplier: ["Supplier_Files", "Config_Answers_JSON", "Answers_JSON", "Answered_By_JSON", "Justifications_JSON", "Components_JSON", "Scope_JSON", "Requested_Docs_JSON", "Answers_Rev", "Answers_Changed_At", "Answers_Changed_By_Email", "Editing_By", "Editing_Since", "Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role", "Completeness_At", "Change_Report_Text", "Change_Report_Rev", "Change_Report_By_Email", "Change_Report_At"],
    formula: ["Keep_Open_Gate"],
    REQ: ["Request_Key", "Case_Code", "Cycle_No", "Supplier_Code", "App_Case_Item_Id", "BDF_Contact_Name", "BDF_Contact_Email", "Supplier_Due_Date", "Assigned_Contacts"],
    uploads: { table: "CIQP_Request_A00_Uploads", cols: ["Upload_Id", "Upload_Section_Key", "Upload_Field_Key", "Upload_Row_Id", "Upload_Doc_Kind", "Upload_File", "Upload_File_Name", "Uploaded_By_Email", "Uploaded_At", "Upload_Attachment_Id"] },
  },
  query: {
    all: ["Query_Key", "Round_No", "Case_Code", "Cycle_No", "Supplier_Code", "App_Open_Point_Id", "Kind_Label", "Responsible_Department", "Responsible_Name", "Ref_Kind", "Ref_Section_Key", "Ref_Field_Key", "Ref_Row_Id", "Ref_Doc_Id", "Ref_Doc_File_Name", "Ref_Doc_Uploaded_At", "Ref_Label", "Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Previous_Rounds_JSON", "New_Section_Item_Key", "Assigned_Contacts", "Response_Kind", "Response_Text", "Response_Doc_Refs_JSON", "Supplier_Responsible_Email", "Edited_At", "Edit_Note"],
    REQ: ["Query_Key", "Round_No", "Case_Code", "Cycle_No", "Supplier_Code", "App_Open_Point_Id", "Kind_Label", "Responsible_Department", "Responsible_Name", "Ref_Kind", "Ref_Section_Key", "Ref_Label", "Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Assigned_Contacts"],
  },
  release: {
    all: ["Confirmation_Key", "Case_Code", "Cycle_No", "Supplier_Code", "App_Case_Item_Id", "Declaration_Text", "Declaration_Text_Key", "Supplier_Due_Date", "Assigned_Contacts", "Supplier_Confirm", "Confirmed_By_Name", "Confirmed_By_Email", "Confirmed_By_Role", "Confirmed_At"],
    REQ: ["Confirmation_Key", "Case_Code", "Cycle_No", "Supplier_Code", "App_Case_Item_Id", "Declaration_Text", "Declaration_Text_Key", "Assigned_Contacts"],
  },
  caseProc: {
    live: ["Case_Code", "Cycle_No", "Case_Title", "Trade_Name", "Main_INCI", "BDF_Material_No", "SAP_Material_No", "IRMA_Ref", "Supplier_Code", "Supplier_Legal_Name", "Owner_RMM", "Target_Markets_Text", "Origin_Types", "Case_Test", "Request_Key", "BDF_Contact_Name", "BDF_Contact_Email", "Markets_Label", "Template_Label", "Supplier_Due_Date", "Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Supplier_Contact_Emails", "Release_Item_Id", "Release_Key", "Manifest_Hash", "Release_Manifest_JSON", "Rule_Set_Version", "Portal_Request_Item_Id", "Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role", "Completeness_At", "RMES_Key", "RMES_Created_At", "Final_Release_Confirm", "Final_Release_By_Name", "Final_Release_By_Email", "Final_Release_By_Role", "Final_Release_At", "Completion_Trigger", "Final_PDF"],
    // plan v5 §4.1 "Add fields" (EXPECTED tonight)
    // the service's copies of the supplier files (S-2) and the final PDF go into these Attachment fields
    files: "Supplier_Files",
    finalPdf: "Final_PDF",
    v5: ["Supplier_Files", "Template_Version", "Case_Phase", "Priority", "Duplicate_Reason", "Follow_Up_Of_Case", "Follow_Up_Of_Report", "Cancel_Reason", "Cancelled_By_Name", "Cancelled_At", "Cancelled_From_Phase", "Reactivate_Reason", "Reactivated_At", "Release_Requested_At", "Portal_Release_Item_Id", "Final_Document_Hash", "Final_Document_At", "Undefined_Origin", "Case_Data_Item_Id"],
  },
  review: {
    all: ["Review_Key", "Case_Code", "Cycle_No", "Case_Item_Id", "Supplier_Code", "Trade_Name", "Review_Dept", "Round_No", "Activation_Kind", "Activation_Reason", "Activated_By_Name", "Assignee_User", "Assignee_Name", "Assignee_Email", "Reassign_Reason", "Track_Status", "Open_Count", "RMES_Gaps", "Review_Gate", "Review_Confirm", "Completed_By", "Completed_By_Name", "Completed_By_Email", "Completed_At", "RMES_Decision", "RMES_Decision_Reason", "Rejection_Handling", "Rejection_Note", "Rejected_Depts_Covered", "On_Behalf_Of"],
    REQ: ["Review_Key", "Case_Code", "Case_Item_Id", "Review_Dept"],
  },
  openPoint: {
    live: ["OP_Key", "Round_No", "Query_Key", "Case_Code", "Cycle_No", "Supplier_Code", "Case_Item_Id", "OP_Kind", "OP_Dept", "Raised_By_Dept", "OP_To_Supplier", "Ref_Kind", "Ref_Section_Key", "Ref_Field_Key", "Ref_Row_Id", "Ref_Doc_Id", "Ref_Doc_File_Name", "Ref_Doc_Uploaded_At", "Ref_Label", "Ref_Internal_Key", "Kind_Label", "Question_Text", "Supplier_Justification", "Responsible_User", "Responsible_Name", "Responsible_Dept_Label", "Supplier_Due_Date", "Portal_Contact_Ids", "Response_Kind", "Response_Text", "Response_Doc_Refs_JSON", "Supplier_Responsible_Email", "Portal_Query_Item_Id", "OP_Progress", "OP_Outcome", "Outcome_Reason", "Return_Reason", "Open_Num"],
    v5: ["Raised_By_User", "Raised_By_Name", "Thread_JSON", "Closed_At", "Closed_By"],
    optional: ["Raiser_Assignee"], // only if S-11 passes (V-19 b)
  },
  caseData: {
    header: ["Case_Code", "Cycle_No", "Case_Item_Id", "Portal_Request_Item_Id", "Portal_Release_Item_Id", "Supplier_Code", "Supplier_Name", "Supplier_DUNS", "Trade_Name", "Main_INCI", "BDF_Material_No", "Owner_RMM_Name", "Owner_RMM_Email", "Case_Phase", "Phase_History_JSON", "Priority", "Due_Date", "Created_At", "Completed_At", "Cancelled_At", "Template_Version", "Rule_Set_Version", "Target_Markets_Text", "Origin_Types", "Undefined_Origin", "Config_Answers_JSON", "Answers_JSON", "Answered_By_JSON", "Justifications_JSON", "Scope_JSON", "Fixed_Scope_At", "Answers_Rev", "Answers_Changed_At", "Tracks_JSON", "Open_Points_JSON", "Confirmations_JSON", "Open_Points_Count", "Overdue_Points_Count", "Final_Document_JSON", "Final_Document_Hash", "Final_PDF", "Synced_At", "Sync_Note"],
    REQ: ["Case_Code"],
    // expected child model ids (engine naming `${flowId}_${slug}`), resolved from allfields when they differ
    components: { table: "CIQ_Case_Data_A00_Components", key: "Comp_Row_Id", cols: ["Comp_Row_Id", "Comp_INCI", "Comp_CAS_No", "Comp_EC_No", "Comp_Function", "Comp_Is_Additive", "Comp_Origin", "Comp_Conc_Min", "Comp_Conc_Max"] },
    // Doc_Key = the portal attachment id (Upload_Attachment_Id); Doc_Attachment_Id = the copy in CIQ_Case_A00.Supplier_Files
    documents: { table: "CIQ_Case_Data_A00_Documents", key: "Doc_Key", cols: ["Doc_Key", "Doc_Section_Key", "Doc_Field_Key", "Doc_Row_Id", "Doc_File_Name", "Doc_Kind", "Doc_Attachment_Id", "Doc_Uploaded_By", "Doc_Uploaded_At"] },
    requestedDocs: { table: "CIQ_Case_Data_A00_Requested_Documents", key: "Req_Key", cols: ["Req_Key", "Req_Doc_Name", "Req_Section_Key", "Req_Rule_Ids", "Req_Why_Text", "Req_Status", "Req_Justification", "Req_Added_Later", "Req_Kept"] },
    changeReports: { table: "CIQ_Case_Data_A00_Change_Reports", key: "CR_Key", cols: ["CR_Key", "CR_Text", "CR_By_Name", "CR_By_Email", "CR_At", "CR_Follow_Up_Case"] },
  },
  outbox: { all: ["Mail_Key", "Event_Code", "Audience", "To_Emails", "Subject", "Body_Text", "Link_Url", "Case_Code", "Related_Key", "Created_At", "Sent_Status", "Attempt_No"], REQ: ["Mail_Key"] },
  serviceRequest: { all: ["Request_Key", "Request_Code", "Case_Code", "Object_Key", "Payload_JSON", "Request_Status", "Result_Note", "Result_Item_Id", "Processed_At"], REQ: ["Request_Key"] },
  audit: { all: ["Event_Key", "Case_Code", "Cycle_No", "Case_Item_Id", "Event_At", "Event_Category", "Action_Code", "Actor_Side", "Actor_Name", "Actor_Email", "Actor_Dept", "Actor_Role_Id", "On_Behalf_Of", "Object_Kind", "Object_Key", "Object_Item_Id", "Object_State", "Old_Value_Text", "New_Value_Text", "Source_Doc_File_Name", "Source_Doc_Uploaded_At", "Source_Answers_Rev", "Config_Keys", "Event_Reason", "Notify_Recipient", "Notify_Channel", "Portal_Activity_Ref", "Snapshot_JSON", "Event_File"], REQ: ["Event_Category"] },
  note: { all: ["Note_Key", "Case_Code", "Cycle_No", "Case_Item_Id", "Linked_Kind", "Linked_Key", "Note_Text", "Note_Author", "Note_Dept", "Note_At"], v5: ["Note_Mentions_Emails", "Note_Mentions_Names"], REQ: ["Note_Text"] },
  scopeRun: { all: ["Run_Key", "Case_Code", "Cycle_No", "Case_Item_Id", "Run_No", "Scope_Trigger", "Related_Key", "Release_Item_Id", "Rule_Set_Version", "Evaluator_Version", "Input_JSON", "Input_Hash", "Result_JSON", "Added_Section_Keys", "Lead_Departments", "Override_Justification", "Run_By", "Run_At"], REQ: ["Run_Key"] },
  rmes: {
    header: ["RMES_Key", "Result_Case", "Case_Item_Id", "Case_Code", "Cycle_No", "Open_Criteria_Count", "Open_Blocking_Findings_Count", "Editing_By", "Editing_Since", "RMES_Voided"],
    REQ: ["RMES_Key"],
    criteria: { SAF: "Safety_Criteria", REG: "Regulatory_Criteria", key: "Criteria_Code", cols: ["Criteria_Code", "Criteria_Part", "Criteria_Title", "Criteria_Applicable", "Criteria_Applicability_Basis", "Criteria_Source_Section_Key", "Criteria_Source_Field_Key", "Criteria_Source_Value_Text", "Criteria_Result", "Criteria_Comment", "Criteria_Recorded_By", "Criteria_Recorded_At", "Criteria_Reported_Value", "Criteria_Reported_Unit", "Criteria_Limit_Value", "Criteria_Limit_Comparator", "Criteria_Limit_Set_Version", "Criteria_Limit_Pass", "Criteria_AI_Suggestion_Text", "Criteria_AI_State"] },
    // NOTE: Findings has no own row-key column (P9); rows are matched by criterion code + text.
    findings: { SAF: "Safety_Findings", REG: "Regulatory_Findings", cols: ["Findings_Text", "Findings_Criterion_Code", "Findings_Blocking", "Findings_State", "Findings_Linked_OP_Key"] },
  },
  config: { all: ["Config_Key", "Config_Kind", "Version_Label", "Config_State", "Section_Key", "Section_Rev", "Payload_JSON", "Internal_Annotations_JSON", "Content_Hash", "Evaluator_Version", "Change_Note", "Published_By", "Published_At", "Release_Key", "Release_Label", "Release_Stage", "Release_Manifest_JSON", "Release_Bundle_JSON", "Manifest_Hash", "Regression_Result_JSON", "Test_Case_Codes"], REQ: ["Config_Key", "Config_Kind"] },
  supplier: {
    header: ["Supplier_Code", "Supplier_Legal_Name", "DUNS_Number", "Supplier_Kind", "Supplier_Country_Code", "Supplier_Active", "Supplier_Test", "Contact_Portal_Ids_Text", "Pending_Invites"],
    v5: ["Supplier_City"],
    contacts: { table: "Contacts", key: "Contacts_Key", cols: ["Contacts_Key", "Contacts_Full_Name", "Contacts_Email", "Contacts_Title", "Contacts_Role", "Contacts_Can_Confirm", "Contacts_Portal_User_Id", "Contacts_Active", "Contacts_Deactivated_At", "Contacts_Invite_Requested_At", "Contacts_Invited_At"] },
  },
};

// ---------------------------------------------------------------------------------------------- list values

export const LIST = {
  casePhase: { "supplier-input": "Supplier filling in the CIQ", review: "Review", "final-release": "Awaiting final release", completed: "Completed", cancelled: "Cancelled" },
  portalPhaseLabel: { "supplier-input": "Filling in", review: "With Beiersdorf", "final-release": "Awaiting your final release", completed: "Completed", cancelled: "Cancelled" },
  trackStatus: { "in-review": "In review", "waiting-supplier": "Waiting for supplier", reopened: "Reopened", completed: "Completed", ended: "Ended", "not-started": "In review" },
  opKind: { query: "Query", "document-request": "Document request", "additional-part": "Additional part", finding: "Finding" },
  opProgress: { open: "Open", "in-progress": "In progress" },
  opOutcome: { accepted: "Accepted", withdrawn: "Withdrawn", "not-accepted": "Not accepted" },
  rmesResult: { available: "Available", plausible: "Plausible", listed: "Listed", "not-listed": "Not listed", negative: "Negative", implausible: "Implausible", na: "Not applicable" },
  decision: { approved: "Approved", rejected: "Rejected" },
  rejectionHandling: { continue: "Continue to final release", cancel: "Cancel the case" },
  requestStatus: { done: "Done", refused: "Refused", failed: "Failed" },
  yesNo: { true: "Yes", false: "No" },
  priority: { normal: "Normal", high: "High" },
  responseKind: { answer: "Answer", document: "Document", cannot: "Cannot provide", additional: "Additional part completed" },
  configKind: ["Template", "Section definition", "Rule set", "Section ownership", "RMES criteria", "Limit set", "Text bundle", "Reminders", "Settings", "Regression set", "Release"],
  configState: ["Draft", "Published", "Retired"],
  eventCategory: ["Case", "Scope", "Section", "Section review", "Snapshot", "Open point", "RMES", "Change request", "Configuration", "Notification", "Delegation", "Assignment", "Change attempt", "Cancellation", "Access", "Item created", "Final PDF", "Supplier master", "Review", "Internal note"],
  actorSide: { internal: "BDF", supplier: "Supplier", system: "System" },
};

/** Attachment fields (written only through the S-2 attachment route, never in a JSON body). */
export const ATTACHMENT_FIELDS = new Set(["Supplier_Files", "Final_PDF", "Upload_File", "Event_File"]);

export const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));

/** Every expected field per flow, for verifyIds. */
export function expectedFields() {
  return {
    [FLOW.request]: [...F.request.keys, ...F.request.header, ...F.request.service, ...F.request.supplier, ...F.request.formula],
    [FLOW.query]: F.query.all,
    [FLOW.release]: F.release.all,
    [FLOW.caseProc]: [...F.caseProc.live, ...F.caseProc.v5],
    [FLOW.review]: F.review.all,
    [FLOW.openPoint]: [...F.openPoint.live, ...F.openPoint.v5],
    [FLOW.caseData]: F.caseData.header,
    [FLOW.outbox]: F.outbox.all,
    [FLOW.serviceRequest]: F.serviceRequest.all,
    [FLOW.audit]: F.audit.all,
    [FLOW.note]: [...F.note.all, ...F.note.v5],
    [FLOW.scopeRun]: F.scopeRun.all,
    [FLOW.config]: F.config.all,
    [FLOW.supplier]: [...F.supplier.header, ...F.supplier.v5],
    [FLOW.rmesSaf]: F.rmes.header,
    [FLOW.rmesReg]: F.rmes.header,
  };
}

/** Expected child tables per flow (model id + key column), resolved against allfields `Tables`. */
export function expectedTables() {
  return {
    [FLOW.request]: [{ id: F.request.uploads.table, cols: F.request.uploads.cols }],
    [FLOW.caseData]: ["components", "documents", "requestedDocs", "changeReports"].map((k) => ({ id: F.caseData[k].table, cols: F.caseData[k].cols })),
    [FLOW.supplier]: [{ id: F.supplier.contacts.table, cols: F.supplier.contacts.cols }],
    [FLOW.rmesSaf]: [{ id: F.rmes.criteria.SAF, cols: F.rmes.criteria.cols }, { id: F.rmes.findings.SAF, cols: F.rmes.findings.cols }],
    [FLOW.rmesReg]: [{ id: F.rmes.criteria.REG, cols: F.rmes.criteria.cols }, { id: F.rmes.findings.REG, cols: F.rmes.findings.cols }],
  };
}

/** Pull field ids (and child tables) out of an allfields answer. Shape: {"<flowId>": {Tables:[…], …}} or a field list. */
export function fieldIdsOf(allfields, flowId) {
  const root = allfields?.[flowId] ?? allfields;
  const ids = new Set();
  const tables = new Map();
  const visit = (node, table) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, table));
    const id = node.Id ?? node._id ?? node.id;
    if (typeof id === "string" && (node.Type || node.type || node.Name)) {
      if (table) tables.get(table).add(id);
      else ids.add(id);
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "Tables" && Array.isArray(v)) {
        for (const t of v) {
          // live (verify-portal.mjs, 7 Oct): Tables is a list of child model ids; columns are not listed there
          if (typeof t === "string") {
            if (!tables.has(t)) tables.set(t, null);
            continue;
          }
          const tid = t.Id ?? t._id ?? t.id;
          if (tid) {
            if (!tables.has(tid)) tables.set(tid, new Set());
            visit(t.Fields ?? t.fields ?? t.Columns ?? [], tid);
          }
        }
      } else if (k === "Fields" || k === "fields") visit(v, table);
    }
  };
  visit(root, null);
  return { ids, tables };
}

/**
 * Reads the live flow lists of both containers (GET only) and reports every expected flow, field and child table that
 * is missing. Never throws on a missing id; network errors are reported as such.
 * `kf` is a kf.mjs client (readOnly is enough).
 */
export async function verifyIds(kf, { fields = true } = {}) {
  const acc = kf.acc;
  const report = { at: new Date().toISOString(), containers: {}, flows: {}, missingFlows: [], missingFields: {}, missingTables: {}, errors: [], aborted: null };
  // A deferral (429, challenge page, back-off) stops verifyIds: nothing more is asked of Kissflow in this run.
  const get = async (path) => {
    if (report.aborted) return { status: 0 };
    try {
      return await kf.get(path);
    } catch (e) {
      if (e?.deferred) report.aborted = e.message;
      return { status: e?.status ?? 0, error: e?.message };
    }
  };
  const listed = new Map();
  for (const container of [APP, PORTAL]) {
    for (const kind of ["process", "form"]) {
      const r = await get(`/flow/2/${acc}/${kind}/?_application_id=${container}&page_number=1&page_size=300`);
      if (r.status !== 200) {
        report.errors.push(`${kind} list of ${container}: HTTP ${r.status}`);
        continue;
      }
      const rows = Array.isArray(r.body) ? r.body : (r.body?.Data ?? r.body?.data ?? []);
      for (const row of rows) listed.set(row._id ?? row.Id ?? row.id, { kind, container, name: row.Name ?? row.name, status: row.Status ?? row.status });
      report.containers[`${container}/${kind}`] = rows.length;
    }
  }
  const exp = expectedFields();
  const tabs = expectedTables();
  if (report.aborted) return report;
  for (const [flowId, meta] of Object.entries(FLOW_META)) {
    if (report.aborted) break;
    const live = listed.get(flowId);
    report.flows[flowId] = { expectedIn: meta.container, kind: meta.kind, idStatus: meta.status, found: !!live, name: live?.name ?? null };
    if (!live) {
      report.missingFlows.push(flowId);
      continue;
    }
    if (!fields || !exp[flowId]) continue;
    const r = await get(`/${meta.kind}/2/${acc}/${flowId}/allfields?_application_id=${meta.container}`);
    if (r.status !== 200) {
      report.errors.push(`allfields ${flowId}: HTTP ${r.status}`);
      continue;
    }
    const { ids, tables } = fieldIdsOf(r.body, flowId);
    const miss = exp[flowId].filter((f) => !ids.has(f));
    if (miss.length) report.missingFields[flowId] = miss;
    for (const t of tabs[flowId] ?? []) {
      const found = tables.get(t.id);
      if (found === undefined) report.missingTables[`${flowId}/${t.id}`] = { found: [...tables.keys()] };
      else if (found === null) (report.tablesFoundColumnsUnchecked ??= []).push(`${flowId}/${t.id}`);
      else {
        const missCols = t.cols.filter((c) => !found.has(c));
        if (missCols.length) report.missingTables[`${flowId}/${t.id}`] = { missingColumns: missCols };
      }
    }
  }
  return report;
}

/** Plain-text summary of a verifyIds report (no secrets, no personal data). */
export function verifySummary(r) {
  const lines = [];
  if (r.aborted && !Object.keys(r.flows).length) return `verifyIds: not readable (${r.aborted}). Nothing was concluded about missing ids.`;
  const found = Object.entries(r.flows).filter(([, v]) => v.found).map(([k]) => k);
  lines.push(`verifyIds: ${found.length}/${Object.keys(r.flows).length} expected flows found.`);
  if (r.missingFlows.length) lines.push(`  missing flows: ${r.missingFlows.map((f) => `${f} (${FLOW_META[f].status})`).join(", ")}`);
  for (const [flow, miss] of Object.entries(r.missingFields)) lines.push(`  ${flow}: ${miss.length} expected field(s) missing: ${miss.slice(0, 12).join(", ")}${miss.length > 12 ? ", …" : ""}`);
  for (const [t, v] of Object.entries(r.missingTables)) lines.push(`  child table ${t}: ${v.missingColumns ? `missing columns ${v.missingColumns.join(", ")}` : `not found (tables seen: ${v.found.join(", ") || "none"})`}`);
  if (r.tablesFoundColumnsUnchecked?.length) lines.push(`  child tables found (allfields lists ids only; columns not checked): ${r.tablesFoundColumnsUnchecked.join(", ")}`);
  for (const e of r.errors) lines.push(`  read error: ${e}`);
  if (r.aborted) lines.push(`  stopped early: ${r.aborted}`);
  return lines.join("\n");
}
