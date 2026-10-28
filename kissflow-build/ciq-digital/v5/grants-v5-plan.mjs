// Plan v5 §6 (+ §4.14) grant grid for CIQ_Digital_A00: the single source for grants-v5.mjs (apply/dry run) and
// postgen/readback-v5.mjs (conformance). Pure data, no I/O.
export const APP = "CIQ_Digital_A00";
export const ROLES = {
  RMM: ["RoEKl83f9jPF", "CIQ RMM"], REG: ["RoEKl84Hca4w", "CIQ Regulatory Reviewer"], SAF: ["RoEKl84xAFRW", "CIQ Safety Reviewer"],
  QM: ["RoEKl85WB1yE", "CIQ QM Reviewer"], MIC: ["RoEKl8647K2u", "CIQ Microbiology Reviewer"], SUS: ["RoEKl86bQQrO", "CIQ Sustainability Reviewer"],
  CUS: ["RoEKwv6pxX3g", "Customs & Trade Compliance"], LEG: ["RoEKwvH8qaxG", "Legal / IP"], BA: ["RoEKl87f38Xw", "CIQ Business Admin"],
  AUD: ["RoEKl88CJiLP", "CIQ Reader"], BO: ["RoEKwvR_cPvv", "Business owner (reports)"], CA: ["RoEKl88jv4dv", "CIQ Case Admin"],
  SVC: ["RoEKl89I5nGx", "CIQ Integration Service"],
};
export const RETIRED = { OA: ["RoEKl8790ycA", "CIQ Overall Approver"] }; // V-27: no grants anywhere (the role delete waits for Thomas)
export const MANAGED = new Set([...Object.values(ROLES), ...Object.values(RETIRED)].map(([id]) => id));

// §6 grid (columns in the plan's order). Process codes: Init | View | Adm. Form codes: Read | Edit. "-" = none.
export const FLOWS = [
  ["Case", "CIQ_Case_A00", "process"], ["Review", "CIQ_Review_A00", "process"], ["OpenPoint", "CIQ_Open_Point_A00", "process"],
  ["CaseData", "CIQ_Case_Data_A00", "form"], ["Outbox", "CIQ_Mail_Outbox_A00", "form"], ["ServiceRequest", "CIQ_Service_Request_A00", "form"],
  ["Supplier", "CIQ_Supplier_A00", "form"], ["Config", "CIQ_Config_Version_A00", "form"], ["ScopeRun", "CIQ_Scope_Run_A00", "form"],
  ["RmesSaf", "CIQ_RMES_Safety_A00", "form"], ["RmesReg", "CIQ_RMES_Regulatory_A00", "form"], ["Note", "CIQ_Internal_Note_A00", "form"],
  ["Audit", "CIQ_Audit_Event_A00", "form"],
];
//              Case    Review  OP     CaseData Outbox ServReq Supplier Config ScopeRun RmesSaf RmesReg Note   Audit
export const GRID = {
  RMM: ["Init", "View", "View", "Read", "-", "Edit", "Read", "Read", "Read", "-", "-", "Edit", "Read"],
  REG: ["View", "View", "View", "Read", "-", "Edit", "-", "Read", "Read", "-", "Edit", "Edit", "Read"],
  SAF: ["View", "View", "View", "Read", "-", "Edit", "-", "Read", "Read", "Edit", "-", "Edit", "Read"],
  QM: ["View", "View", "View", "Read", "-", "Edit", "-", "Read", "Read", "-", "-", "Edit", "Read"],
  MIC: ["View", "View", "View", "Read", "-", "Edit", "-", "Read", "Read", "-", "-", "Edit", "Read"],
  SUS: ["View", "View", "View", "Read", "-", "Edit", "-", "Read", "Read", "-", "-", "Edit", "Read"],
  CUS: ["View", "View", "View", "Read", "-", "Edit", "-", "Read", "Read", "-", "-", "Edit", "Read"],
  LEG: ["View", "View", "View", "Read", "-", "Edit", "-", "Read", "Read", "-", "-", "Edit", "Read"],
  BA: ["View", "View", "View", "Read", "-", "Edit", "Edit", "Edit", "Read", "-", "-", "Read", "Read"],
  AUD: ["View", "View", "View", "Read", "Read", "Read", "-", "Read", "Read", "Read", "Read", "Read", "Read"],
  BO: ["View", "View", "View", "Read", "-", "-", "-", "Read", "Read", "-", "-", "Read", "Read"],
  CA: ["Adm", "Adm", "Adm", "Read", "Read", "Read", "Read", "Read", "Read", "Read", "Read", "Read", "Read"],
  SVC: ["Init", "Init", "Init", "Edit", "Edit", "Edit", "Edit", "Edit", "Edit", "Edit", "Edit", "Read", "Edit"],
};
// §4.14: no longer used; only the Case administrator keeps access
export const EXTRA = [["Section", "CIQ_Section_A00", "form", { CA: "Read" }], ["ChangeRequest", "CIQ_Change_Request_A00", "process", { CA: "Adm" }]];

export const shapes = (editWithDelete = false) => ({
  process: { Init: { Role: "Member", Permission: ["InitiateItems"] }, View: { Role: "Member", Permission: ["View"] }, Adm: { Role: "Admin", Permission: [] } },
  form: { Read: { Role: "Viewer", Permission: [] }, Edit: { Role: "Member", Permission: editWithDelete ? ["Delete"] : [] }, Adm: { Role: "Admin", Permission: [] } },
});
export function grantPlan() {
  const plan = [];
  FLOWS.forEach(([key, id, type], i) => plan.push({ key, id, type, want: Object.fromEntries(Object.entries(GRID).map(([r, row]) => [r, row[i]]).filter(([, c]) => c !== "-")) }));
  for (const [key, id, type, want] of EXTRA) plan.push({ key, id, type, want });
  return plan;
}

