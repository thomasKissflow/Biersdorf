// B3 spec: the plan-v5-final objects, field by field (ids exactly as the plan and kissflow-build/sync/ids.mjs).
// Every field carries an explicit `id`, so the engine never derives one. `required` = field-level Required (P7).
const f = (id, type, o = {}) => ({ id, name: o.name || id.replace(/_/g, " "), type, ...o });
const T = (id, o) => f(id, "Text", o);
const TA = (id, o) => f(id, "Textarea", o);
const N = (id, o) => f(id, "Number", o);
const D = (id, o) => f(id, "Date", o);
const DT = (id, o) => f(id, "DateTime", o);
const EM = (id, o) => f(id, "Email", o);
const U = (id, o) => f(id, "User", o);
const SEL = (id, list, o = {}) => f(id, "Select", { referredList: list, ...o });
const ATT = (id, o) => f(id, "Attachment", o);

// live list ids (B1 created the 5 new ones; all read back, v5/b1/lists-result.json)
export const L = {
  yesNo: "CIQ_Yes_No_A00", confirm: "CIQ_Confirm_A00", decision: "CIQ_Decision_A00", reviewDept: "CIQ_Review_Dept_A00",
  casePhase: "CIQ_Case_Phase_A00", trackStatus: "CIQ_Track_Status_A00", priority: "CIQ_Priority_A00",
  rejection: "CIQ_Rejection_Handling_A00", requestStatus: "CIQ_Request_Status_A00",
};

// ── §4.5 CIQ Mail Outbox (Form) ──
export const OUTBOX = {
  key: "outbox", name: "CIQ Mail Outbox", flowType: "Form", expectedId: "CIQ_Mail_Outbox_A00",
  description: "One row = one e-mail (R-1). Written only by the CIQ Sync Service; the integration 'CIQ Mail – send outbox mail' sends it and sets Sent_Status.",
  fields: [
    T("Mail_Key", { required: true }), T("Event_Code"), T("Audience"), TA("To_Emails"), T("Subject"), TA("Body_Text"), T("Link_Url"),
    T("Case_Code"), T("Related_Key"), DT("Created_At"), T("Sent_Status"), N("Attempt_No"),
  ],
};

// ── §4.13 CIQ Service Request (Form) ──
export const SERVICE_REQUEST = {
  key: "service-request", name: "CIQ Service Request", flowType: "Form", expectedId: "CIQ_Service_Request_A00",
  description: "The Workbench's command channel: a user states a request in a row; the CIQ Sync Service checks it and acts (Done / Refused / Failed).",
  fields: [
    T("Request_Key", { required: true }), T("Request_Code"), T("Case_Code"), T("Object_Key"), TA("Payload_JSON"),
    SEL("Request_Status", L.requestStatus), TA("Result_Note"), T("Result_Item_Id"), DT("Processed_At"), N("Attempt_No"),
  ],
};

// ── §4.4 CIQ Case Data (Form) with 4 child tables ──
export const CASE_DATA = {
  key: "case-data", name: "CIQ Case Data", flowType: "Form", expectedId: "CIQ_Case_Data_A00",
  description: "The Workbench's read model and the supplier-data mirror: one row per case, written only by the CIQ Sync Service.",
  fields: [
    // keys
    T("Case_Code", { required: true }), N("Cycle_No"), T("Case_Item_Id"), T("Portal_Request_Item_Id"), T("Portal_Release_Item_Id"), T("Supplier_Code"),
    // case summary
    T("Supplier_Name"), T("Supplier_DUNS"), T("Trade_Name"), T("Main_INCI"), T("BDF_Material_No"), T("Owner_RMM_Name"), EM("Owner_RMM_Email"),
    SEL("Case_Phase", L.casePhase), TA("Phase_History_JSON"), SEL("Priority", L.priority), D("Due_Date"), DT("Created_At"), DT("Completed_At"),
    DT("Cancelled_At"), T("Template_Version"), T("Rule_Set_Version"), T("Target_Markets_Text"), T("Origin_Types"), SEL("Undefined_Origin", L.yesNo),
    // supplier data (mirrored from CIQP Request)
    TA("Config_Answers_JSON"), TA("Answers_JSON"), TA("Answered_By_JSON"), TA("Justifications_JSON"), TA("Scope_JSON"), DT("Fixed_Scope_At"),
    N("Answers_Rev"), DT("Answers_Changed_At"),
    // work summaries
    TA("Tracks_JSON"), TA("Open_Points_JSON"), TA("Confirmations_JSON"), N("Open_Points_Count"), N("Overdue_Points_Count"),
    // final document
    TA("Final_Document_JSON"), T("Final_Document_Hash"), ATT("Final_PDF"),
    // sync (14 Oct contract: Sync_Note is a Textarea)
    DT("Synced_At"), TA("Sync_Note"),
  ],
  children: [
    { id: "CIQ_Case_Data_A00_Components", name: "Components", label: "Components", fields: [
      T("Comp_Row_Id", { name: "Row Id" }), T("Comp_INCI", { name: "INCI" }), T("Comp_CAS_No", { name: "CAS No" }), T("Comp_EC_No", { name: "EC No" }),
      T("Comp_Function", { name: "Function" }), SEL("Comp_Is_Additive", L.yesNo, { name: "Is Additive" }), T("Comp_Origin", { name: "Origin" }),
      N("Comp_Conc_Min", { name: "Conc Min" }), N("Comp_Conc_Max", { name: "Conc Max" }),
    ] },
    { id: "CIQ_Case_Data_A00_Documents", name: "Documents", label: "Documents", fields: [
      T("Doc_Key", { name: "Doc Key" }), T("Doc_Section_Key", { name: "Section Key" }), T("Doc_Field_Key", { name: "Field Key" }), T("Doc_Row_Id", { name: "Row Id" }),
      T("Doc_File_Name", { name: "File Name" }), T("Doc_Kind", { name: "Doc Kind" }),
      // 14 Oct contract: the file lives in CIQ_Case_A00.Supplier_Files; this is its attachment id there (no Doc_File attachment)
      T("Doc_Attachment_Id", { name: "Attachment Id" }), T("Doc_Uploaded_By", { name: "Uploaded By" }), DT("Doc_Uploaded_At", { name: "Uploaded At" }),
    ] },
    { id: "CIQ_Case_Data_A00_Requested_Documents", name: "Requested Documents", label: "Requested Documents", fields: [
      T("Req_Key", { name: "Req Key" }), T("Req_Doc_Name", { name: "Document Name" }), T("Req_Section_Key", { name: "Section Key" }), T("Req_Rule_Ids", { name: "Rule Ids" }),
      TA("Req_Why_Text", { name: "Why Text" }), T("Req_Status", { name: "Status" }), TA("Req_Justification", { name: "Justification" }),
      SEL("Req_Added_Later", L.yesNo, { name: "Added Later" }), SEL("Req_Kept", L.yesNo, { name: "Kept" }),
    ] },
    { id: "CIQ_Case_Data_A00_Change_Reports", name: "Change Reports", label: "Change Reports", fields: [
      T("CR_Key", { name: "CR Key" }), TA("CR_Text", { name: "Text" }), T("CR_By_Name", { name: "By Name" }), EM("CR_By_Email", { name: "By Email" }),
      DT("CR_At", { name: "At" }), T("CR_Follow_Up_Case", { name: "Follow Up Case" }),
    ] },
  ],
};

// ── §4.2 CIQ Review (Process) ──
export const ROLE = {
  RMM: { id: "RoEKl83f9jPF", name: "CIQ RMM" }, REG: { id: "RoEKl84Hca4w", name: "CIQ Regulatory Reviewer" }, SAF: { id: "RoEKl84xAFRW", name: "CIQ Safety Reviewer" },
  QM: { id: "RoEKl85WB1yE", name: "CIQ QM Reviewer" }, MIC: { id: "RoEKl8647K2u", name: "CIQ Microbiology Reviewer" }, SUS: { id: "RoEKl86bQQrO", name: "CIQ Sustainability Reviewer" },
};
const REVIEW_FIELDS = [
  T("Review_Key", { required: true }), T("Case_Code", { required: true }), N("Cycle_No"), T("Case_Item_Id", { required: true }), T("Supplier_Code"), T("Trade_Name"),
  SEL("Review_Dept", L.reviewDept, { required: true }), N("Round_No"), T("Activation_Kind"), TA("Activation_Reason"), T("Activated_By_Name"),
  U("Assignee_User"), T("Assignee_Name"), EM("Assignee_Email"), TA("Reassign_Reason"), SEL("Track_Status", L.trackStatus),
  N("Open_Count"), N("RMES_Gaps"),
  // blank-safe gate; the AST is CLONED from the live, published CIQ_Case_A00.REG_Gate (same formula with other field ids)
  T("Review_Gate", { gate: true }),
  SEL("Review_Confirm", L.confirm), U("Completed_By"), T("Completed_By_Name"), EM("Completed_By_Email"), DT("Completed_At"),
  SEL("RMES_Decision", L.decision), TA("RMES_Decision_Reason"),
  SEL("Rejection_Handling", L.rejection), TA("Rejection_Note"), T("Rejected_Depts_Covered"), T("On_Behalf_Of"),
];
export const REVIEW_GATE_FORMULA = 'IF(OR(ISBLANK(Open_Count),ISBLANK(RMES_Gaps)),"",IF(Open_Count+RMES_Gaps=0,"OK",""))';
const BASE_E = ["Assignee_User", "Assignee_Name", "Assignee_Email", "Reassign_Reason", "Review_Confirm", "Completed_By", "Completed_By_Name", "Completed_By_Email", "Completed_At", "On_Behalf_Of"];
const BASE_M = ["Review_Confirm", "Completed_By", "Completed_At", "Review_Gate"];
const RMES_E = ["RMES_Decision", "RMES_Decision_Reason"];
// "Rejection_*" (§4.2 RMM row) read with the field table's "RMM only" group: Rejection_Handling, Rejection_Note, Rejected_Depts_Covered
const REJ_E = ["Rejection_Handling", "Rejection_Note", "Rejected_Depts_Covered"];
const lv = (editable, mandatory) => ({ editable, mandatory });
export const REVIEW_STEPS = [
  { dept: "REG", name: "Review – Regulatory", ...lv([...BASE_E, ...RMES_E], [...BASE_M, "RMES_Decision"]) },
  { dept: "SAF", name: "Review – Safety", ...lv([...BASE_E, ...RMES_E], [...BASE_M, "RMES_Decision"]) },
  { dept: "QM", name: "Review – QM", ...lv(BASE_E, BASE_M) },
  { dept: "MIC", name: "Review – Microbiology", ...lv(BASE_E, BASE_M) },
  { dept: "SUS", name: "Review – Sustainability", ...lv(BASE_E, BASE_M) },
  { dept: "RMM", name: "Review – RMM", ...lv([...BASE_E, ...REJ_E], BASE_M) },
];
export const REVIEW = {
  key: "review", name: "CIQ Review", flowType: "Process", expectedId: "CIQ_Review_A00",
  description: "One department review track of one case (one item per activation: completeness, added later, reopened, reactivated). Started by the CIQ Sync Service; the department completes it.",
  fields: REVIEW_FIELDS,
  startName: "Activate review",
};

// ── grafts on existing forms (§4.7, §4.10, §4.11) ──
export const GRAFTS = {
  supplier: { flow: "CIQ_Supplier_A00", header: [T("Supplier_City", { name: "Supplier City" })],
    child: { table: "Contacts", fields: [T("Contacts_Key", { name: "Contact Key" }), T("Contacts_Title", { name: "Contact Title" }), DT("Contacts_Deactivated_At", { name: "Deactivated At" })] } },
  "rmes-saf": { flow: "CIQ_RMES_Safety_A00", header: [], child: { table: "Safety_Findings", fields: [T("Findings_Key", { name: "Finding Key" })] } },
  "rmes-reg": { flow: "CIQ_RMES_Regulatory_A00", header: [], child: { table: "Regulatory_Findings", fields: [T("Findings_Key", { name: "Finding Key" })] } },
  note: { flow: "CIQ_Internal_Note_A00", header: [T("Note_Mentions_Emails", { name: "Note Mentions Emails" }), T("Note_Mentions_Names", { name: "Note Mentions Names" })] },
};
export const NEW_FLOWS = { outbox: OUTBOX, "service-request": SERVICE_REQUEST, "case-data": CASE_DATA, review: REVIEW };
