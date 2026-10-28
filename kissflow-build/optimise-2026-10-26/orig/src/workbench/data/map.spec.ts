import { describe, expect, it } from "vitest";
import { caseIndexFromAudit, childRows, statusOf, toAuditVM, toCaseVM, toPointVM, toRmesVM } from "./map";
import type { RawItem } from "./viewModels";

describe("map", () => {
  it("status from _status, case-insensitively; a cancellation is Rejected or Withdrawn", () => {
    expect(statusOf({ _status: "InProgress" })).toBe("in-progress");
    expect(statusOf({ _status: "In progress" })).toBe("in-progress");
    expect(statusOf({ _status: "REJECTED" })).toBe("rejected");
    expect(statusOf({})).toBe("unknown");
    expect(toCaseVM({ _id: "Pk1", _status: "Withdrawn" } as RawItem).cancelled).toBe(true);
  });
  it("lanes: active, confirmed, complete (D35) and SAF/REG RMES fields", () => {
    const c = toCaseVM({ _id: "Pk1", Dept_SAF_Active: "Yes", SAF_Review_Confirm: "Confirmed", SAF_Completed_At: "2026-10-08T10:00:00Z", SAF_RMES_Decision: "Approved", SAF_Open_Count: 0, SAF_Gate: "OK" } as RawItem);
    expect(c.lanes.SAF).toMatchObject({ active: true, complete: true, rmesDecision: "Approved", openCount: 0, gate: "OK" });
    expect(c.lanes.QM.active).toBe(false);
    expect(c.lanes.QM.rmesDecision).toBeUndefined();
  });
  it("a list row's step is not trusted; a full read's is (Part 2 → the block)", () => {
    const raw = { _id: "Pk1", _current_step: "Part 2 – Beiersdorf review" } as RawItem;
    expect(toCaseVM(raw, "row").currentSteps).toEqual([]);
    expect(toCaseVM(raw, "full").currentSteps).toEqual(["CASE_PAR"]);
  });
  it("child rows come from Table::<id> (or the bare id)", () => {
    const p = toPointVM({ _id: "Pk1", "Table::Rounds": [{ _id: "Rounds_x", Rounds_Round_No: 2 }, { _id: "Rounds_y", Rounds_Round_No: 1 }] } as RawItem);
    expect(p.rounds.map((r) => r.roundNo)).toEqual([1, 2]);
    expect(childRows("CIQ_Open_Point_A00", "Rounds", { Rounds: [{ _id: "r" }] })).toHaveLength(1);
    const rm = toRmesVM({ _id: "F5", "Table::Safety_Criteria": [{ _id: "c1", Criteria_Code: "A1", Criteria_Open_Num: "" }] } as RawItem, "CIQ_RMES_Safety_A00");
    expect(rm.criteria[0]).toMatchObject({ code: "A1", openNum: null });
  });
  it("the F8 case index builds index-only cases from Item created rows", () => {
    const ev = toAuditVM({ _id: "Ev1", Event_Category: "Item created", Object_Kind: "Case", Case_Item_Id: "PkC9", Case_Code: "CIQ-2026-PkC9", Cycle_No: 1, Snapshot_JSON: JSON.stringify({ Trade_Name: "Aloe Calm 40", Supplier_Legal_Name: "Northwind Botanicals GmbH" }) } as RawItem);
    const [c] = caseIndexFromAudit([ev, toAuditVM({ _id: "Ev2", Event_Category: "Cancellation", Object_Kind: "Case", Case_Item_Id: "PkC9" } as RawItem)]);
    expect(c).toMatchObject({ _id: "PkC9", readQuality: "index", caseCode: "CIQ-2026-PkC9", tradeName: "Aloe Calm 40", status: "unknown" });
  });
});
