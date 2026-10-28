// Fixtures for the dashboard and report specs (imported by specs only; never by the app). Fictional suppliers and
// people. "Now" is 9 Oct 2026, 12:00 local time.
import { toAuditVM, toCaseVM, toCrVM, toPointVM, toRunVM } from "../../data/map";
import type { RawItem } from "../../data/viewModels";
import type { OpsInput } from "./metrics";

export const NOW = new Date(2026, 9, 9, 12, 0, 0);
export const ALEX = "UsAlex01";
const NWB = { Supplier_Code: "SUP-NWB", Supplier_Legal_Name: "Northwind Botanicals GmbH" };
const LUM = { Supplier_Code: "SUP-LUM", Supplier_Legal_Name: "Lumen Minerals Ltd" };
const IP = { _status: "In Progress" };

const kase = (id: string, f: Record<string, unknown>) => toCaseVM({ _id: id, Case_Code: `CIQ-2026-${id}`, Cycle_No: 1, Trade_Name: `Material ${id}`, ...f } as RawItem, "row", { trustStep: true });
const point = (id: string, f: Record<string, unknown>) => toPointVM({ _id: id, OP_Key: `OP-${id}`, ...IP, Open_Num: 1, ...NWB, ...f } as RawItem, "row", { trustStep: true });

export function opsFixture(): OpsInput {
  const cases = [
    kase("C1", { ...IP, ...NWB, Owner_RMM: { _id: ALEX, Name: "Alex Rivera" }, _current_step: "Scope check", _created_at: "2026-09-01T08:00:00Z", Supplier_Due_Date: "2026-10-20" }),
    kase("C2", { ...IP, ...LUM, Owner_RMM: { _id: ALEX }, _current_step: "Waiting for supplier: completeness PS-05", Completeness_Due_Date: "2026-10-01", Supplier_Due_Date: "2026-10-05" }),
    kase("C3", {
      ...IP,
      ...NWB,
      Owner_RMM: { _id: "UsSam01" },
      _current_step: "Review – Safety",
      _created_at: "2026-08-01T00:00:00Z",
      Completeness_At: "2026-08-20T00:00:00Z",
      Dept_SAF_Active: "Yes",
      Dept_REG_Active: "Yes",
      REG_Review_Confirm: "Confirmed",
      REG_Completed_At: "2026-09-01T00:00:00Z",
      SAF_RMES_Decision: "Rejected",
      SAF_RMES_Decision_Reason: "Impurity profile missing",
    }),
    kase("C4", {
      _status: "Completed",
      ...LUM,
      _created_at: "2026-07-01T00:00:00Z",
      Completeness_At: "2026-07-13T00:00:00Z",
      Dept_QM_Active: "Yes",
      QM_Review_Confirm: "Confirmed",
      QM_Completed_At: "2026-07-23T00:00:00Z",
      Final_Release_At: "2026-07-31T00:00:00Z",
    }),
    kase("C5", { ...IP, ...NWB, Case_Test: "Yes", _current_step: "Scope check" }),
    kase("C6", { ...IP, ...NWB, Owner_RMM: { _id: "UsSam01" }, _created_at: "2026-09-01T00:00:00Z" }),
    kase("C7", { _status: "Draft", ...NWB }),
  ];
  const points = [
    point("P1", { Case_Item_Id: "C3", OP_Dept: "SAF", OP_To_Supplier: "Yes", _current_step: "Waiting for supplier", Supplier_Due_Date: "2026-10-02", Round_No: 2 }),
    point("P2", { Case_Item_Id: "C3", OP_Dept: "REG", OP_To_Supplier: "Yes", Response_Kind: "Answer", Internal_Due_Date: "2026-10-30", Round_No: 1 }),
    point("P3", { Case_Item_Id: "C3", OP_Dept: "QM", OP_To_Supplier: "Yes", _status: "Completed", Open_Num: 0, OP_Outcome: "Accepted", Round_No: 1 }),
    point("P4", { Case_Item_Id: "C5", OP_Dept: "SAF", OP_To_Supplier: "Yes", Supplier_Due_Date: "2026-10-01", Round_No: 1 }),
  ];
  const crs = [
    toCrVM({ _id: "CR1", CR_Key: "CR-1", Case_Item_Id: "C3", ...IP, CR_Open_Num: 1, Impact_SAF: "Yes" } as RawItem),
    toCrVM({ _id: "CR2", CR_Key: "CR-2", Case_Code: "CIQ-2026-C5", Cycle_No: 1, ...IP, CR_Open_Num: 1, Impact_SAF: "Yes" } as RawItem),
  ];
  const events = [toAuditVM({ _id: "E1", Event_Category: "Item created", Object_Kind: "Case", Case_Item_Id: "C2", Event_At: "2026-09-10T09:00:00Z" } as RawItem)];
  const runs = [
    toRunVM({ _id: "R1", Case_Item_Id: "C4", Run_At: "2026-07-03T00:00:00Z" } as RawItem),
    toRunVM({ _id: "R2", Case_Item_Id: "C3", Run_At: "2026-08-10T00:00:00Z" } as RawItem),
    toRunVM({ _id: "R3", Case_Item_Id: "C3", Run_At: "2026-08-03T00:00:00Z" } as RawItem),
  ];
  return { cases, points, crs, events, runs };
}
