// Mandatory and gate checks before a submit (WORKBENCH-DESIGN.md §7.3, §7.9). The SERVER decides gates: a computed
// gate must read "OK" on a fresh server read. The client mirrors below only EXPLAIN which part is missing ("SAF gate is
// not OK: SAF open count is blank"); they are tested against schema/formulaSamples.ts.
import { fieldLabel, gateFieldsAt, mandatoryAt, stepDef, type FlowId, type StepIr } from "../schema";
import { isBlank } from "./normalize";
import type { Check, Problem, RawItem } from "./viewModels";

/** WB-D5 [provisional]: section-review marks are a client blocker at lane steps. One line to make them informational. */
export const SECTION_REVIEW_MARKS_BLOCK = true;

type Values = Record<string, unknown>;
const blank = (v: Values, k: string) => isBlank(v[k]);
const n = (v: Values, k: string) => Number(v[k]);
const eq = (v: Values, k: string, s: string) => typeof v[k] === "string" && (v[k] as string) === s;

export interface MirrorResult {
  value: string | number;
  /** Why the value is not "OK" / what drives it (empty when OK or not applicable). */
  why: string[];
}
type Mirror = (v: Values) => MirrorResult;

const twoPartGate =
  (d: string): Mirror =>
  (v) => {
    const a = `${d}_Open_Count`;
    const b = `${d}_RMES_Gaps`;
    const why: string[] = [];
    if (blank(v, a)) why.push(`${fieldLabel("CIQ_Case_A00", a)} is blank`);
    if (blank(v, b)) why.push(`${fieldLabel("CIQ_Case_A00", b)} is blank`);
    if (why.length) return { value: "", why };
    if (n(v, a) + n(v, b) === 0) return { value: "OK", why: [] };
    if (n(v, a) > 0) why.push(`${n(v, a)} open item(s) for ${d}`);
    if (n(v, b) > 0) why.push(`${n(v, b)} RMES gap(s)`);
    return { value: "", why };
  };
const onePartGate =
  (d: string): Mirror =>
  (v) => {
    const a = `${d}_Open_Count`;
    if (blank(v, a)) return { value: "", why: [`${fieldLabel("CIQ_Case_A00", a)} is blank`] };
    return n(v, a) === 0 ? { value: "OK", why: [] } : { value: "", why: [`${n(v, a)} open item(s) for ${d}`] };
  };
const holdGate =
  (override: string): Mirror =>
  (v) => {
    if (!blank(v, override)) return { value: "OK", why: [] };
    const why: string[] = [];
    if (blank(v, "Open_Items_Count")) why.push("Open items count is blank");
    if (blank(v, "Open_CR_Count")) why.push("Open CR count is blank");
    if (why.length) return { value: "", why };
    const total = n(v, "Open_Items_Count") + n(v, "Open_CR_Count");
    return total === 0 ? { value: "OK", why: [] } : { value: "", why: [`${n(v, "Open_Items_Count")} open point(s) and ${n(v, "Open_CR_Count")} open change request(s); give an override reason or close them`] };
  };

const START_FIELDS = ["Ref_Kind", "Ref_Section_Key", "Ref_Label", "Kind_Label", "Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Responsible_Name", "Responsible_Dept_Label", "Query_Key", "Portal_Contact_Ids", "Awaiting_Response"];
const criteriaOpen: Mirror = (v) => {
  if (eq(v, "Criteria_Applicable", "No")) return { value: 0, why: [] };
  if (blank(v, "Criteria_Result")) return { value: 1, why: ["no result yet"] };
  if (["Available", "Plausible", "Listed"].some((r) => eq(v, "Criteria_Result", r))) return { value: 0, why: [] };
  if (blank(v, "Criteria_Comment")) return { value: 1, why: [`result "${String(v.Criteria_Result)}" needs a comment`] };
  return { value: 0, why: [] };
};

/** Client mirrors of every spec formula, keyed `<flow>.<field>` (child columns: `<flow>.<table>.<field>`). */
export const MIRRORS: Record<string, Mirror> = {
  "CIQ_Case_A00.Hold_For_Open_Items": (v) => {
    if (blank(v, "Open_Items_Count") || blank(v, "Open_CR_Count")) return { value: "Yes", why: ["a count is blank, so the check runs"] };
    return n(v, "Open_Items_Count") + n(v, "Open_CR_Count") === 0 ? { value: "No", why: [] } : { value: "Yes", why: ["open items or change requests remain"] };
  },
  "CIQ_Case_A00.Open_Items_Gate_Release": holdGate("Hold_Override_Reason_Release"),
  "CIQ_Case_A00.Open_Items_Gate_Close": holdGate("Hold_Override_Reason_Close"),
  "CIQ_Case_A00.REG_Gate": twoPartGate("REG"),
  "CIQ_Case_A00.SAF_Gate": twoPartGate("SAF"),
  "CIQ_Case_A00.QM_Gate": onePartGate("QM"),
  "CIQ_Case_A00.MIC_Gate": onePartGate("MIC"),
  "CIQ_Case_A00.SUS_Gate": onePartGate("SUS"),
  "CIQ_Case_A00.RMM_Gate": onePartGate("RMM"),
  "CIQ_Open_Point_A00.Open_Num": (v) => ({ value: eq(v, "OP_Outcome", "Accepted") || eq(v, "OP_Outcome", "Withdrawn") ? 0 : 1, why: [] }),
  "CIQ_Open_Point_A00.Start_Gate": (v) => {
    if (eq(v, "OP_To_Supplier", "No")) return { value: "OK", why: [] };
    const missing = START_FIELDS.filter((f) => blank(v, f));
    if (missing.length) return { value: "", why: missing.map((f) => `${fieldLabel("CIQ_Open_Point_A00", f)} is blank`) };
    return eq(v, "Awaiting_Response", "Yes") ? { value: "OK", why: [] } : { value: "", why: ["Awaiting response is not \"Yes\""] };
  },
  "CIQ_Change_Request_A00.CR_Open_Num": (v) => {
    let total = blank(v, "CR_Outcome") ? 1 : 0;
    const why: string[] = total ? ["not triaged"] : [];
    for (const d of ["REG", "SAF", "QM", "MIC", "SUS"])
      if (eq(v, `Impact_${d}`, "Yes") && blank(v, `${d}_Assessment`)) {
        total++;
        why.push(`${d} assessment pending`);
      }
    return { value: total, why };
  },
  "CIQ_RMES_Safety_A00.Safety_Criteria.Criteria_Open_Num": criteriaOpen,
  "CIQ_RMES_Regulatory_A00.Regulatory_Criteria.Criteria_Open_Num": criteriaOpen,
};

export function mirrorOf(flow: FlowId, field: string, table?: string): Mirror | undefined {
  return MIRRORS[table ? `${flow}.${table}.${field}` : `${flow}.${field}`];
}

/** "SAF gate is not OK: SAF Open Count is blank" (or "" when the mirror says OK). */
export function explainGate(flow: FlowId, field: string, values: Values): string {
  const m = mirrorOf(flow, field);
  const label = fieldLabel(flow, field);
  if (!m) return `${label} is not OK`;
  const r = m(values);
  if (r.value === "OK") return "";
  return `${label} is not OK${r.why.length ? `: ${r.why.join("; ")}` : ""}`;
}

/**
 * The pre-submit problems on a FRESH server read (§7.3 step 3): writable Mandatory fields that are blank, computed
 * gates that do not read "OK" on the server, plus the step's extra checks. The server does not enforce Mandatory
 * (SPIKES L144), so only this check blocks.
 */
export function stepProblems(step: StepIr, fresh: RawItem, extra: Check[] = [], o: { exempt?: string[] } = {}): Problem[] {
  const flow = stepDef(step).flow;
  const out: Problem[] = [];
  for (const f of mandatoryAt(step)) if (!o.exempt?.includes(f) && isBlank(fresh[f])) out.push({ field: f, label: fieldLabel(flow, f), message: `${fieldLabel(flow, f)} is required.` });
  for (const g of gateFieldsAt(step))
    if (fresh[g] !== "OK") out.push({ field: g, label: fieldLabel(flow, g), message: explainGate(flow, g, fresh) || `${fieldLabel(flow, g)} is not OK on the server yet. Re-read and try again.` });
  for (const c of extra) out.push(...c(fresh));
  return out;
}
