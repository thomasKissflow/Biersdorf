// Input → output vectors for EVERY formula in the spec (WORKBENCH-DESIGN.md §12 "Shared test data"). Used by the T0
// client mirrors (data/gates.ts), T2's mirrors and T4's harness formula engine, so their parity needs no import
// between tasks. The vectors assert v4's results: <D>_Gate = "" and Hold_For_Open_Items = "Yes" when a count is blank
// (spec data_model CIQ_Case_A00 SAF_Gate / Hold_For_Open_Items formulas). A blank input is null (or absent).
import type { ChildTableId, FlowId } from "./generated";

export interface FormulaSample {
  flow: FlowId;
  /** Set for child-table column formulas. */
  table?: ChildTableId;
  field: string;
  inputs: Record<string, unknown>;
  output: string | number;
  note?: string;
}

const CASE = "CIQ_Case_A00" as const;
const OP = "CIQ_Open_Point_A00" as const;
const CR = "CIQ_Change_Request_A00" as const;

const holdSamples: FormulaSample[] = [
  { flow: CASE, field: "Hold_For_Open_Items", inputs: { Open_Items_Count: null, Open_CR_Count: null }, output: "Yes", note: "a new case: blank counts hold (dec L485)" },
  { flow: CASE, field: "Hold_For_Open_Items", inputs: { Open_Items_Count: 0, Open_CR_Count: null }, output: "Yes" },
  { flow: CASE, field: "Hold_For_Open_Items", inputs: { Open_Items_Count: null, Open_CR_Count: 0 }, output: "Yes" },
  { flow: CASE, field: "Hold_For_Open_Items", inputs: { Open_Items_Count: 0, Open_CR_Count: 0 }, output: "No" },
  { flow: CASE, field: "Hold_For_Open_Items", inputs: { Open_Items_Count: 1, Open_CR_Count: 0 }, output: "Yes" },
  { flow: CASE, field: "Hold_For_Open_Items", inputs: { Open_Items_Count: 0, Open_CR_Count: 2 }, output: "Yes" },
];

const gateRelease = (field: "Open_Items_Gate_Release" | "Open_Items_Gate_Close", override: string): FormulaSample[] => [
  { flow: CASE, field, inputs: { [override]: null, Open_Items_Count: null, Open_CR_Count: null }, output: "" },
  { flow: CASE, field, inputs: { [override]: null, Open_Items_Count: 0, Open_CR_Count: null }, output: "" },
  { flow: CASE, field, inputs: { [override]: null, Open_Items_Count: 0, Open_CR_Count: 0 }, output: "OK" },
  { flow: CASE, field, inputs: { [override]: null, Open_Items_Count: 1, Open_CR_Count: 0 }, output: "" },
  { flow: CASE, field, inputs: { [override]: "Supplier point is cosmetic only", Open_Items_Count: 1, Open_CR_Count: 0 }, output: "OK", note: "override" },
  { flow: CASE, field, inputs: { [override]: "Accepted by RMM", Open_Items_Count: null, Open_CR_Count: null }, output: "OK", note: "override on blank counts" },
];

const twoPartGate = (d: "REG" | "SAF"): FormulaSample[] => [
  { flow: CASE, field: `${d}_Gate`, inputs: { [`${d}_Open_Count`]: null, [`${d}_RMES_Gaps`]: null }, output: "", note: "v4: blank → \"\"" },
  { flow: CASE, field: `${d}_Gate`, inputs: { [`${d}_Open_Count`]: 0, [`${d}_RMES_Gaps`]: null }, output: "" },
  { flow: CASE, field: `${d}_Gate`, inputs: { [`${d}_Open_Count`]: null, [`${d}_RMES_Gaps`]: 0 }, output: "" },
  { flow: CASE, field: `${d}_Gate`, inputs: { [`${d}_Open_Count`]: 0, [`${d}_RMES_Gaps`]: 0 }, output: "OK" },
  { flow: CASE, field: `${d}_Gate`, inputs: { [`${d}_Open_Count`]: 1, [`${d}_RMES_Gaps`]: 0 }, output: "" },
  { flow: CASE, field: `${d}_Gate`, inputs: { [`${d}_Open_Count`]: 0, [`${d}_RMES_Gaps`]: 3 }, output: "" },
];
const onePartGate = (d: "QM" | "MIC" | "SUS" | "RMM"): FormulaSample[] => [
  { flow: CASE, field: `${d}_Gate`, inputs: { [`${d}_Open_Count`]: null }, output: "", note: "v4: blank → \"\"" },
  { flow: CASE, field: `${d}_Gate`, inputs: { [`${d}_Open_Count`]: 0 }, output: "OK" },
  { flow: CASE, field: `${d}_Gate`, inputs: { [`${d}_Open_Count`]: 2 }, output: "" },
];

const START_FIELDS = ["Ref_Kind", "Ref_Section_Key", "Ref_Label", "Kind_Label", "Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Responsible_Name", "Responsible_Dept_Label", "Query_Key", "Portal_Contact_Ids", "Awaiting_Response"] as const;
const fullStart: Record<string, unknown> = {
  OP_To_Supplier: "Yes",
  Ref_Kind: "Section",
  Ref_Section_Key: "GEN",
  Ref_Label: "GEN · Manufacturer",
  Kind_Label: "Query",
  Question_Text: "Please confirm the manufacturing site.",
  Supplier_Justification: "Needed for the regulatory file.",
  Supplier_Due_Date: "2026-10-22",
  Responsible_Name: "Jo Weber",
  Responsible_Dept_Label: "Safety",
  Query_Key: "CIQ-2026-Pk1-C1-OPabc|R1",
  Portal_Contact_Ids: "Us1,Us2",
  Awaiting_Response: "Yes",
};
const startSamples: FormulaSample[] = [
  { flow: OP, field: "Start_Gate", inputs: { OP_To_Supplier: "No" }, output: "OK", note: "internal point" },
  { flow: OP, field: "Start_Gate", inputs: { ...fullStart }, output: "OK" },
  { flow: OP, field: "Start_Gate", inputs: { ...fullStart, Awaiting_Response: "No" }, output: "" },
  ...START_FIELDS.map((f): FormulaSample => ({ flow: OP, field: "Start_Gate", inputs: { ...fullStart, [f]: null }, output: "", note: `${f} blank` })),
];

const openNum: FormulaSample[] = [
  { flow: OP, field: "Open_Num", inputs: { OP_Outcome: null }, output: 1 },
  { flow: OP, field: "Open_Num", inputs: { OP_Outcome: "Accepted" }, output: 0 },
  { flow: OP, field: "Open_Num", inputs: { OP_Outcome: "Withdrawn" }, output: 0 },
];

const crBase = { CR_Outcome: "Accepted", Impact_REG: "No", Impact_SAF: "No", Impact_QM: "No", Impact_MIC: "No", Impact_SUS: "No" };
const crOpen: FormulaSample[] = [
  { flow: CR, field: "CR_Open_Num", inputs: { CR_Outcome: null }, output: 1, note: "untriaged" },
  { flow: CR, field: "CR_Open_Num", inputs: { ...crBase }, output: 0 },
  { flow: CR, field: "CR_Open_Num", inputs: { ...crBase, Impact_REG: "Yes", Impact_SAF: "Yes", REG_Assessment: null, SAF_Assessment: null }, output: 2 },
  { flow: CR, field: "CR_Open_Num", inputs: { ...crBase, Impact_REG: "Yes", Impact_SAF: "Yes", REG_Assessment: "No impact confirmed", SAF_Assessment: null }, output: 1 },
  { flow: CR, field: "CR_Open_Num", inputs: { CR_Outcome: null, Impact_QM: "Yes", Impact_MIC: "Yes", Impact_SUS: "Yes" }, output: 4 },
  { flow: CR, field: "CR_Open_Num", inputs: { ...crBase, Impact_SUS: "Yes", SUS_Assessment: "Re-assessed" }, output: 0 },
  { flow: CR, field: "CR_Open_Num", inputs: { CR_Outcome: "Refused – after final release", Impact_REG: "No", Impact_SAF: "No", Impact_QM: "No", Impact_MIC: "No", Impact_SUS: "No" }, output: 0 },
];

const criteria = (flow: FlowId, table: ChildTableId): FormulaSample[] => [
  { flow, table, field: "Criteria_Open_Num", inputs: { Criteria_Applicable: "No" }, output: 0 },
  { flow, table, field: "Criteria_Open_Num", inputs: { Criteria_Applicable: "Yes", Criteria_Result: null }, output: 1 },
  { flow, table, field: "Criteria_Open_Num", inputs: { Criteria_Applicable: null, Criteria_Result: null }, output: 1, note: "applicability blank counts as applicable" },
  { flow, table, field: "Criteria_Open_Num", inputs: { Criteria_Applicable: "Yes", Criteria_Result: "Available" }, output: 0 },
  { flow, table, field: "Criteria_Open_Num", inputs: { Criteria_Applicable: "Yes", Criteria_Result: "Plausible" }, output: 0 },
  { flow, table, field: "Criteria_Open_Num", inputs: { Criteria_Applicable: "Yes", Criteria_Result: "Listed" }, output: 0 },
  { flow, table, field: "Criteria_Open_Num", inputs: { Criteria_Applicable: "Yes", Criteria_Result: "Implausible", Criteria_Comment: null }, output: 1 },
  { flow, table, field: "Criteria_Open_Num", inputs: { Criteria_Applicable: "Yes", Criteria_Result: "Not available", Criteria_Comment: "Supplier sends the study in Q1." }, output: 0 },
];

export const FORMULA_SAMPLES: FormulaSample[] = [
  ...holdSamples,
  ...gateRelease("Open_Items_Gate_Release", "Hold_Override_Reason_Release"),
  ...gateRelease("Open_Items_Gate_Close", "Hold_Override_Reason_Close"),
  ...twoPartGate("REG"),
  ...twoPartGate("SAF"),
  ...onePartGate("QM"),
  ...onePartGate("MIC"),
  ...onePartGate("SUS"),
  ...onePartGate("RMM"),
  ...openNum,
  ...startSamples,
  ...crOpen,
  ...criteria("CIQ_RMES_Safety_A00", "Safety_Criteria"),
  ...criteria("CIQ_RMES_Regulatory_A00", "Regulatory_Criteria"),
];
