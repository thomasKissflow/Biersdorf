// The ONLY app-live file with Kissflow ids (DESIGN.md §3.1). Owner A.
// Flow, step, role and child-model ids, live step names, each step's Mandatory fields (the UI's own gate: the SDK
// submit does not enforce Mandatory, DESIGN G-7) and the Select option texts exactly as live.
// Sources: steps, names and Mandatory from kissflow-build/ciq-digital/v6/live/*.2026-10-19T2046.draft.json (Review,
// Open Point) and kissflow-build/night-2026-10-20/backup-CIQ_Case_A00-2026-10-19T205803683Z.json (Case, after the
// 20:58Z graft), plus the 20:52 changes in ciq-digital/v6/backend-{review,op}-result.json (DESIGN G-9/G-10/G-11).
// Retired flows (CIQ Case Data, Service Request, Mail Outbox, CIQ Case - Thomas) are deliberately absent (D-13, D-14).

export const APP_ID = "CIQ_Digital_A00";

export const FLOWS = {
  case: { id: "CIQ_Case_A00", kind: "process" }, review: { id: "CIQ_Review_A00", kind: "process" },
  op: { id: "CIQ_Open_Point_A00", kind: "process" }, audit: { id: "CIQ_Audit_Event_A00", kind: "form" },
  note: { id: "CIQ_Internal_Note_A00", kind: "form" }, rmesSAF: { id: "CIQ_RMES_Safety_A00", kind: "form" },
  rmesREG: { id: "CIQ_RMES_Regulatory_A00", kind: "form" }, supplier: { id: "CIQ_Supplier_A00", kind: "form" },
  config: { id: "CIQ_Config_Version_A00", kind: "form" }, scopeRun: { id: "CIQ_Scope_Run_A00", kind: "form" },
} as const;

export const STEPS = {
  case: { start: "Activity_p1i6xz", waiting: "Activity_1kltjdn", release: "Activity_gwgj5o", end: "Activity_ycf01a" },
  review: { start: "Activity_47r3ow", REG: "Activity_1wb6scg", SAF: "Activity_116f3su", QM: "Activity_12d3ab4",
            MIC: "Activity_1wkxybl", SUS: "Activity_1um3oo7", RMM: "Activity_1mh3ji6", end: "Activity_1xjk2tg" },
  op: { start: "Activity_18t0lhi", REG: "Activity_uka3mx", SAF: "Activity_1kdump3", QM: "Activity_1go37bt",
        MIC: "Activity_hha7u2", SUS: "Activity_y4af4g", RMM: "Activity_xc8fbb", end: "Activity_i73i25" },
} as const;

/** Activity id → the live step name (as `_current_step` shows it). The dash in the department steps is U+2013. */
export const STEP_NAMES: Record<string, string> = {
  [STEPS.case.start]: "Create case",
  [STEPS.case.waiting]: "Waiting for supplier: CIQ",
  [STEPS.case.release]: "Beiersdorf review and final release",
  [STEPS.case.end]: "End",
  [STEPS.review.start]: "Activate review",
  [STEPS.review.REG]: "Review – Regulatory",
  [STEPS.review.SAF]: "Review – Safety",
  [STEPS.review.QM]: "Review – QM",
  [STEPS.review.MIC]: "Review – Microbiology",
  [STEPS.review.SUS]: "Review – Sustainability",
  [STEPS.review.RMM]: "Review – RMM",
  [STEPS.review.end]: "End",
  [STEPS.op.start]: "Raise open point",
  [STEPS.op.REG]: "Open point – Regulatory",
  [STEPS.op.SAF]: "Open point – Safety",
  [STEPS.op.QM]: "Open point – QM",
  [STEPS.op.MIC]: "Open point – Microbiology",
  [STEPS.op.SUS]: "Open point – Sustainability",
  [STEPS.op.RMM]: "Open point – RMM",
  [STEPS.op.end]: "End",
};

export const ROLES = {
  rmm: { id: "RoEKl83f9jPF", name: "Raw Material Manager (RMM)", dept: "RMM" },
  reg: { id: "RoEKl84Hca4w", name: "Regulatory Affairs reviewer", dept: "REG" },
  saf: { id: "RoEKl84xAFRW", name: "Product Safety reviewer", dept: "SAF" },
  qm:  { id: "RoEKl85WB1yE", name: "Quality Management reviewer", dept: "QM" },
  mic: { id: "RoEKl8647K2u", name: "Microbiology reviewer", dept: "MIC" },
  sus: { id: "RoEKl86bQQrO", name: "Sustainability reviewer", dept: "SUS" },
  cus: { id: "RoEKwv6pxX3g", name: "Customs & Trade Compliance", dept: "CUS" },
  leg: { id: "RoEKwvH8qaxG", name: "Legal / IP", dept: "LEG" },
  admin: { id: "RoEKl87f38Xw", name: "Business administrator" },
  auditor: { id: "RoEKl88CJiLP", name: "Auditor" },
  owner: { id: "RoEKwvR_cPvv", name: "Business owner (reports)" },
} as const;                                        // key = InternalPersonaId

export const OTHER_ROLES = { caseAdmin: { id: "RoEKl88jv4dv", name: "Case administrator" }, integration: { id: "RoEKl89I5nGx", name: "Integration service" } } as const;

export const TABLES = { SAF: { criteria: "Safety_Criteria", findings: "Safety_Findings" }, REG: { criteria: "Regulatory_Criteria", findings: "Regulatory_Findings" }, contacts: "Contacts" } as const;

// Mandatory fields per step (G-9/G-10/G-11). End steps and the case's waiting/release steps have none (all RO/Hidden).
const REVIEW_DEPT_M = ["Completed_At", "Completed_By", "Review_Confirm", "Review_Gate"] as const;
const REVIEW_RMES_M = [...REVIEW_DEPT_M, "RMES_Decision"] as const;
const OP_DEPT_M = ["OP_Outcome"] as const;

/** Activity id → fields that must be set before the screen submits that step. `Review_Gate` must also equal "OK". */
export const MANDATORY: Record<string, readonly string[]> = {
  [STEPS.case.start]: [
    "BDF_Contact_Email", "BDF_Contact_Name", "BDF_Material_No", "Case_Code", "Case_Contacts_JSON", "Confirm_Contact_Ids",
    "Cycle_No", "Main_INCI", "Manifest_Hash", "Owner_RMM", "Portal_Contact_Ids", "Release_Item_Id", "Release_Key",
    "Rule_Set_Version", "Supplier_Code", "Supplier_Contact_Emails", "Supplier_Due_Date", "Supplier_Legal_Name",
    "Target_Markets_Text", "Template_Version", "Trade_Name",
  ],
  // No step-level Mandatory at "Activate review"; these four are the model's field-level Required flags [live draft].
  [STEPS.review.start]: ["Review_Key", "Case_Code", "Case_Item_Id", "Review_Dept"],
  [STEPS.review.REG]: REVIEW_RMES_M,
  [STEPS.review.SAF]: REVIEW_RMES_M,
  [STEPS.review.QM]: REVIEW_DEPT_M,
  [STEPS.review.MIC]: REVIEW_DEPT_M,
  [STEPS.review.SUS]: REVIEW_DEPT_M,
  [STEPS.review.RMM]: REVIEW_DEPT_M,
  [STEPS.op.start]: [
    "Case_Code", "Case_Item_Id", "Cycle_No", "OP_Dept", "OP_Key", "OP_Kind", "Question_Text", "Raised_By_Dept",
    "Raised_By_User", "Ref_Kind", "Ref_Label", "Responsible_User", "Round_No", "Supplier_Code", "Supplier_Due_Date",
    "Supplier_Justification",
    "Raiser_Assignee", // Mandatory since 20:52 [live v6/backend-op-result.json]
  ],
  [STEPS.op.REG]: OP_DEPT_M,
  [STEPS.op.SAF]: OP_DEPT_M,
  [STEPS.op.QM]: OP_DEPT_M,
  [STEPS.op.MIC]: OP_DEPT_M,
  [STEPS.op.SUS]: OP_DEPT_M,
  [STEPS.op.RMM]: OP_DEPT_M,
};

// Editable (non-Mandatory) fields per step, from the same live drafts (`Activity::Permission` = "Editable"), with the
// 20:52 changes applied: Open_Count and RMES_Gaps became Editable at the review department steps; Raiser_Assignee moved
// from Editable to Mandatory at "Raise open point"; the completion and decision fields left "Activate review" and the
// outcome, response and portal fields left "Raise open point" (ReadOnly there since 20:52: kissflow-build/ciq-digital/v6/
// backend-review-result.json, backend-op-result.json; DESIGN G-10/G-11). Every other field of a step is ReadOnly or
// Hidden. No Start writer writes the removed fields (write/encode.ts reviewStartFields, opStartFields).
// The live key route refused some of these anyway (G-7, risk R-3); the fake client's `readOnly` option replays that.
const REVIEW_DEPT_E = ["Assignee_Email", "Assignee_Name", "Assignee_User", "Completed_By_Email", "Completed_By_Name", "On_Behalf_Of",
  "Reassign_Reason", "Open_Count", "RMES_Gaps"] as const;
const OP_DEPT_E = ["Closed_At", "Closed_By", "Kind_Label", "OP_Progress", "Outcome_Reason", "Query_Key", "Question_Text", "Responsible_Name",
  "Responsible_User", "Return_Reason", "Round_No", "Supplier_Due_Date", "Supplier_Justification", "Thread_JSON"] as const;

/** Activity id → fields a step may also write besides its MANDATORY ones (a step not listed writes nothing). */
export const EDITABLE: Record<string, readonly string[]> = {
  [STEPS.case.start]: [
    "BDF_Set_JSON", "Case_Test", "Case_Title", "Config_Bundle_Hash", "Config_Bundle_JSON", "Duplicate_Reason", "Follow_Up_Of_Case",
    "Follow_Up_Of_Report", "IRMA_Ref", "Markets_Label", "Portal_Assignees_JSON", "Priority", "Release_Assignees_JSON",
    "Release_Manifest_JSON", "SAP_Material_No", "Template_Label",
  ],
  [STEPS.review.start]: [
    "Activated_By_Name", "Activation_Kind", "Activation_Reason", "Assignee_Email", "Assignee_Name", "Assignee_User", "Case_Code",
    "Case_Item_Id", "Cycle_No", "On_Behalf_Of", "Open_Count", "RMES_Gaps", "Reassign_Reason", "Review_Dept", "Review_Key", "Round_No",
    "Supplier_Code", "Track_Status", "Trade_Name",
  ],
  [STEPS.review.REG]: [...REVIEW_DEPT_E, "RMES_Decision_Reason"],
  [STEPS.review.SAF]: [...REVIEW_DEPT_E, "RMES_Decision_Reason"],
  [STEPS.review.QM]: REVIEW_DEPT_E,
  [STEPS.review.MIC]: REVIEW_DEPT_E,
  [STEPS.review.SUS]: REVIEW_DEPT_E,
  [STEPS.review.RMM]: [...REVIEW_DEPT_E, "Rejected_Depts_Covered", "Rejection_Handling", "Rejection_Note"],
  [STEPS.op.start]: [
    "Kind_Label", "OP_Progress", "OP_To_Supplier", "Portal_Contact_Ids", "Query_Key", "Raised_By_Email", "Raised_By_Name", "Ref_Doc_File_Name",
    "Ref_Doc_Id", "Ref_Doc_Uploaded_At", "Ref_Field_Key", "Ref_Internal_Key", "Ref_Row_Id", "Ref_Section_Key", "Responsible_Dept_Label",
    "Responsible_Name", "Thread_JSON",
  ],
  [STEPS.op.REG]: OP_DEPT_E,
  [STEPS.op.SAF]: OP_DEPT_E,
  [STEPS.op.QM]: OP_DEPT_E,
  [STEPS.op.MIC]: OP_DEPT_E,
  [STEPS.op.SUS]: OP_DEPT_E,
  [STEPS.op.RMM]: OP_DEPT_E,
};

/** Formula (Expression) fields as live: never written by the UI; Kissflow computes them. Child-model formulas are keyed
 *  by the child model. Review_Gate = IF(OR(ISBLANK(Open_Count),ISBLANK(RMES_Gaps)),"",IF(Open_Count+RMES_Gaps=0,"OK","")). */
export const FORMULA_FIELDS = {
  case: ["Hold_For_Open_Items", "Open_Items_Gate_Release", "Open_Items_Gate_Close", "REG_Gate", "SAF_Gate", "QM_Gate", "MIC_Gate", "SUS_Gate", "RMM_Gate"],
  review: ["Review_Gate"], op: ["Open_Num", "Start_Gate"],
  [TABLES.SAF.criteria]: ["Criteria_Open_Num"], [TABLES.REG.criteria]: ["Criteria_Open_Num"],
} as const;

export const LIST = {   // option texts exactly as live [live ciq-digital/v5/verify-1015/live/list-items, via reader D §2]
  phase: { "supplier-input": "Supplier filling in the CIQ", review: "Review", "final-release": "Awaiting final release", completed: "Completed", cancelled: "Cancelled" },
  track: { "in-review": "In review", "waiting-supplier": "Waiting for supplier", reopened: "Reopened", completed: "Completed" },
  opKind: { query: "Query", "document-request": "Document request", "additional-part": "Additional part", finding: "Finding" },
  kindLabel: { query: "Question", "document-request": "Document request", "additional-part": "Additional section", finding: "Question" },
  opProgress: { open: "Open", "in-progress": "In progress" },
  opOutcome: { accepted: "Accepted", withdrawn: "Withdrawn", "not-accepted": "Not accepted" },
  rmesResult: { available: "Available", plausible: "Plausible", listed: "Listed", "not-listed": "Not listed", negative: "Negative", implausible: "Implausible", na: "Not applicable" },
  decision: { approved: "Approved", rejected: "Rejected" }, confirm: "Confirmed", continueRelease: "Continue to final release",
  priority: { normal: "Normal", high: "High" }, yes: "Yes", no: "No",
  supplierKind: { manufacturer: "Manufacturer", distributor: "Distributor" },   // live also has "Trader" → read as "distributor" + warning
  actorSide: "BDF",
} as const;
