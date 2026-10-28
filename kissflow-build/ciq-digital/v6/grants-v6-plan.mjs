// Plan v6 (plan-v6-native.md §3.2) grant grid for the app session's flows in CIQ_Digital_A00. Pure data, no I/O.
// Changes against v5 §6 (v5/grants-v5-plan.mjs):
//  - CIQ Review: RMM may start reviews (the case screen activates the department reviews) → InitView.
//  - CIQ Open Point: RMM and the 5 department reviewers raise open points in the screen → InitView.
//  - CIQ Audit Event: written by the screens (D-7) → every acting role is a Member (no Delete).
//  - CIQ Scope Run: written by the RMM's case screen when it activates the reviews → RMM Member.
//  - CIQ Case Data, CIQ Mail Outbox, CIQ Service Request: not used (D-13) → the Case administrator only.
// CIQ Case is the portal session's tonight and is not in this grid.
export { APP, ROLES, RETIRED, MANAGED } from "../v5/grants-v5-plan.mjs";
export const FLOWS = [
  ["Review", "CIQ_Review_A00", "process"], ["OpenPoint", "CIQ_Open_Point_A00", "process"],
  ["CaseData", "CIQ_Case_Data_A00", "form"], ["Outbox", "CIQ_Mail_Outbox_A00", "form"], ["ServiceRequest", "CIQ_Service_Request_A00", "form"],
  ["Supplier", "CIQ_Supplier_A00", "form"], ["Config", "CIQ_Config_Version_A00", "form"], ["ScopeRun", "CIQ_Scope_Run_A00", "form"],
  ["RmesSaf", "CIQ_RMES_Safety_A00", "form"], ["RmesReg", "CIQ_RMES_Regulatory_A00", "form"], ["Note", "CIQ_Internal_Note_A00", "form"],
  ["Audit", "CIQ_Audit_Event_A00", "form"],
];
//              Review     OP         CaseData Outbox ServReq Supplier Config ScopeRun RmesSaf RmesReg Note   Audit
export const GRID = {
  RMM: ["InitView", "InitView", "-", "-", "-", "Read", "Read", "Edit", "-", "-", "Edit", "Edit"],
  REG: ["View", "InitView", "-", "-", "-", "-", "Read", "Read", "-", "Edit", "Edit", "Edit"],
  SAF: ["View", "InitView", "-", "-", "-", "-", "Read", "Read", "Edit", "-", "Edit", "Edit"],
  QM: ["View", "InitView", "-", "-", "-", "-", "Read", "Read", "-", "-", "Edit", "Edit"],
  MIC: ["View", "InitView", "-", "-", "-", "-", "Read", "Read", "-", "-", "Edit", "Edit"],
  SUS: ["View", "InitView", "-", "-", "-", "-", "Read", "Read", "-", "-", "Edit", "Edit"],
  CUS: ["View", "View", "-", "-", "-", "-", "Read", "Read", "-", "-", "Edit", "Edit"],
  LEG: ["View", "View", "-", "-", "-", "-", "Read", "Read", "-", "-", "Edit", "Edit"],
  BA: ["View", "View", "-", "-", "-", "Edit", "Edit", "Read", "-", "-", "Read", "Edit"],
  AUD: ["View", "View", "-", "-", "-", "-", "Read", "Read", "Read", "Read", "Read", "Read"],
  BO: ["View", "View", "-", "-", "-", "-", "Read", "Read", "-", "-", "Read", "Read"],
  CA: ["Adm", "Adm", "Read", "Read", "Read", "Read", "Read", "Read", "Read", "Read", "Read", "Read"],
  SVC: ["Init", "Init", "-", "-", "-", "Edit", "Edit", "Edit", "Edit", "Edit", "Read", "Edit"],
};
export const shapes = () => ({
  process: { Init: { Role: "Member", Permission: ["InitiateItems"] }, InitView: { Role: "Member", Permission: ["InitiateItems", "View"] }, View: { Role: "Member", Permission: ["View"] }, Adm: { Role: "Admin", Permission: [] } },
  form: { Read: { Role: "Viewer", Permission: [] }, Edit: { Role: "Member", Permission: [] }, Adm: { Role: "Admin", Permission: [] } },
});
export function grantPlan() {
  return FLOWS.map(([key, id, type], i) => ({ key, id, type, want: Object.fromEntries(Object.entries(GRID).map(([r, row]) => [r, row[i]]).filter(([, c]) => c !== "-")) }));
}
