// Counts and their confidence (§6.2, §7.9; WB-5, WB-D11).
import { describe, expect, it } from "vitest";
import { crBelongsTo, effectiveDecision, laneOpenCount, openCrCount, openItemsCount, rmesGaps, rmesHeaderCounts } from "./counts";
import { toCaseVM, toCrVM, toPointVM, toRmesVM } from "./map";
import type { CrVM, ListQuality, ListRead, PointVM, RawItem } from "./viewModels";

const C = toCaseVM({ _id: "PkC1", Case_Code: "CIQ-2026-PkC1", Cycle_No: 1, SAF_RMES_Decision: "Rejected", Dept_SAF_Active: "Yes" } as RawItem, "full");
const P = (id: string, f: Record<string, unknown> = {}) => toPointVM({ _id: id, _status: "In progress", Case_Item_Id: "PkC1", OP_Kind: "Query", OP_Dept: "SAF", Raised_By_Dept: "SAF", Open_Num: 1, ...f } as RawItem);
const CR = (id: string, f: Record<string, unknown> = {}) => toCrVM({ _id: id, _status: "In progress", CR_Open_Num: 1, ...f } as RawItem);
const list = <T,>(rows: T[], quality: ListQuality = "admin", indexOnly: string[] = []): ListRead<T> => ({ rows, quality, indexOnly: new Set(indexOnly), warnings: [] });

describe("confidence rule (WB-5)", () => {
  const pts = [P("p1"), P("p2", { OP_Outcome: "Accepted", Open_Num: 0 })];
  it("the same items give complete with quality admin and partial with mine+tasks", () => {
    expect(openItemsCount(C, list(pts, "admin"))).toMatchObject({ value: 1, confidence: "complete" });
    const partial = openItemsCount(C, list(pts, "mine+tasks"));
    expect(partial).toMatchObject({ value: 1, confidence: "partial" });
    expect(partial.unread[0].reason).toMatch(/only the ones you raised or hold a task on/);
  });
  it("a missing Open_Num gives partial (counted as open while In progress)", () => {
    expect(openItemsCount(C, list([P("p1", { Open_Num: undefined })]))).toMatchObject({ value: 1, confidence: "partial" });
  });
  it("an unreadable _status gives partial; an index-only item gives partial; a viewer list is complete only when proven", () => {
    expect(openItemsCount(C, list([P("p1", { _status: undefined })])).confidence).toBe("partial");
    expect(openItemsCount(C, list([P("p1")], "admin", ["p1"])).confidence).toBe("partial");
    expect(openItemsCount(C, { ...list([P("p1")], "viewer"), viewerProven: false }).confidence).toBe("partial");
    expect(openItemsCount(C, { ...list([P("p1")], "viewer"), viewerProven: true }).confidence).toBe("complete");
    expect(openItemsCount(C, list([], "failed")).confidence).toBe("partial");
  });
  it("stray rejected and withdrawn points never count (COH-17); drafts are not points yet", () => {
    expect(openItemsCount(C, list([P("p1", { _status: "Rejected" }), P("p2", { _status: "Withdrawn" }), P("p3", { _status: "Draft" })])).value).toBe(0);
  });
});

describe("the count functions", () => {
  it("openItemsCount counts all kinds; laneOpenCount excludes Contact update only", () => {
    const pts = [P("p1"), P("p2", { OP_Kind: "Contact update" }), P("p3", { OP_Kind: "Department review", OP_Dept: "SAF", Raised_By_Dept: "RMM" }), P("p4", { OP_Dept: "REG", Raised_By_Dept: "REG" })];
    expect(openItemsCount(C, list(pts)).value).toBe(4);
    expect(laneOpenCount(C, "SAF", list(pts), list<CrVM>([])).value).toBe(2);
  });
  it("laneOpenCount(RMM) has no CR term: a CR with every impact Yes is ignored", () => {
    const cr = CR("cr1", { Case_Item_Id: "PkC1", CR_Outcome: "Accepted", Impact_REG: "Yes", Impact_SAF: "Yes", Impact_QM: "Yes", Impact_MIC: "Yes", Impact_SUS: "Yes" });
    expect(laneOpenCount(C, "RMM", list<PointVM>([]), list([cr])).value).toBe(0);
    expect(laneOpenCount(C, "SAF", list<PointVM>([]), list([cr])).value).toBe(1);
  });
  it("an untriaged CR of the same Case_Code/Cycle_No counts for openCrCount (WB-D11); another cycle does not", () => {
    const triaged = CR("cr1", { Case_Item_Id: "PkC1" });
    const untriaged = CR("cr2", { Case_Code: "CIQ-2026-PkC1", Cycle_No: 1 });
    const otherCycle = CR("cr3", { Case_Code: "CIQ-2026-PkC1", Cycle_No: 2 });
    expect(crBelongsTo(triaged, C) && crBelongsTo(untriaged, C)).toBe(true);
    expect(crBelongsTo(otherCycle, C)).toBe(false);
    expect(crBelongsTo(CR("cr4", { Case_Item_Id: "PkOther", Case_Code: "CIQ-2026-PkC1", Cycle_No: 1 }), C)).toBe(false);
    expect(openCrCount(C, list([triaged, untriaged, otherCycle])).value).toBe(2);
  });
  it("RMES header counts: a blank Criteria_Open_Num on an applicable row counts 1, with a warning", () => {
    const rm = toRmesVM(
      {
        _id: "F5",
        "Table::Safety_Criteria": [
          { _id: "c1", Criteria_Code: "A1", Criteria_Applicable: "Yes", Criteria_Open_Num: "" },
          { _id: "c2", Criteria_Code: "A2", Criteria_Applicable: "No", Criteria_Open_Num: "" },
          { _id: "c3", Criteria_Code: "A3", Criteria_Applicable: "Yes", Criteria_Open_Num: 0 },
        ],
        "Table::Safety_Findings": [
          { _id: "f1", Findings_Blocking: "Yes", Findings_State: "Open" },
          { _id: "f2", Findings_Blocking: "Yes", Findings_State: "Closed" },
        ],
      } as RawItem,
      "CIQ_RMES_Safety_A00",
    );
    const h = rmesHeaderCounts(rm);
    expect(h).toMatchObject({ openCriteria: 1, openBlockingFindings: 1 });
    expect(h.warnings[0]).toMatch(/A1; counted as open/);
  });
  it("rmesGaps: blank without a row; the oldest non-voided row's two header counts", () => {
    expect(rmesGaps([]).value).toBeNull();
    const r = (id: string, at: string, f: Record<string, unknown>) => toRmesVM({ _id: id, _created_at: at, ...f } as RawItem, "CIQ_RMES_Safety_A00");
    expect(rmesGaps([r("b", "2026-10-02", { Open_Criteria_Count: 5, Open_Blocking_Findings_Count: 0 }), r("a", "2026-10-01", { Open_Criteria_Count: 1, Open_Blocking_Findings_Count: 2 }), r("v", "2026-09-01", { RMES_Voided: "Yes", Open_Criteria_Count: 0, Open_Blocking_Findings_Count: 0 })]).value).toBe(3);
  });
  it("effective decision (WB-D8): a later Accepted Department-review point's Late_Decision wins over the RMES decision", () => {
    const late = P("p7", { OP_Kind: "Department review", OP_Dept: "SAF", OP_Outcome: "Accepted", Late_Decision: "Approved", Reviewed_At: "2026-10-07T10:00:00Z" });
    const older = P("p8", { OP_Kind: "Department review", OP_Dept: "SAF", OP_Outcome: "Accepted", Late_Decision: "Rejected", Reviewed_At: "2026-10-01T10:00:00Z" });
    expect(effectiveDecision(C, "SAF", [older, late])).toEqual({ decision: "Approved", source: "late" });
    expect(effectiveDecision(C, "SAF", [])).toEqual({ decision: "Rejected", source: "rmes" });
  });
});
