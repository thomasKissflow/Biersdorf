// Cases list (WORKBENCH-DESIGN.md §8.2): client-side search and filters, pure.
import { DEPTS, type Dept, type StepIr } from "../../schema";
import type { CaseVM } from "../../data/viewModels";
import { stepperKey } from "./stepLogic";

export type StatusFilter = "" | "in-progress" | "completed" | "cancelled";
export interface CaseFilters {
  q: string;
  status: StatusFilter;
  /** A stepper key (CASE_S1 …, CASE_PAR) or "". */
  step: string;
  supplier: string;
  /** An Owner_RMM _id, or "". */
  owner: string;
  dept: Dept | "";
  showTest: boolean;
}
export const NO_FILTERS: CaseFilters = { q: "", status: "", step: "", supplier: "", owner: "", dept: "", showTest: false };

/** Search over Case_Code, Trade_Name, Main_INCI, BDF_Material_No, SAP_Material_No, Supplier_Code, Supplier_Legal_Name. */
export function matchesSearch(c: CaseVM, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return [c.caseCode, c.tradeName, c.mainInci, c.bdfMaterialNo, c.sapMaterialNo, c.supplierCode, c.supplierLegalName].some((x) => (x ?? "").toLowerCase().includes(n));
}

export function statusGroup(c: CaseVM): StatusFilter | "unknown" {
  if (c.cancelled) return "cancelled";
  if (c.status === "completed") return "completed";
  if (c.status === "in-progress" || c.status === "draft") return "in-progress";
  return "unknown";
}

export function filterCases(rows: CaseVM[], f: CaseFilters): CaseVM[] {
  return rows.filter((c) => {
    if (!f.showTest && c.isTest) return false;
    if (!matchesSearch(c, f.q)) return false;
    if (f.status && statusGroup(c) !== f.status) return false;
    if (f.step && stepperKey(c) !== (f.step as StepIr)) return false;
    if (f.supplier && c.supplierCode !== f.supplier) return false;
    if (f.owner && c.ownerRmm?._id !== f.owner) return false;
    if (f.dept && !c.lanes[f.dept]?.active) return false;
    return true;
  });
}

/** Filter choices from the rows themselves (suppliers, owners). */
export function filterChoices(rows: CaseVM[]): { suppliers: { code: string; name: string }[]; owners: { id: string; name: string }[] } {
  const sup = new Map<string, string>();
  const own = new Map<string, string>();
  for (const c of rows) {
    if (c.supplierCode) sup.set(c.supplierCode, c.supplierLegalName || c.supplierCode);
    if (c.ownerRmm?._id) own.set(c.ownerRmm._id, c.ownerRmm.name ?? c.ownerRmm._id);
  }
  return {
    suppliers: [...sup].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)),
    owners: [...own].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export const ACTIVE_DEPTS = (c: CaseVM): Dept[] => DEPTS.filter((d) => c.lanes[d]?.active);
