// §8.1 My work grouping (held tasks only) and the rung-1 tiles; §8.2 case list search/filters.
import { describe, expect, it } from "vitest";
import { heldTask } from "../../testkit/fakeClient";
import { toAuditVM, toCrVM, toPointVM } from "../../data/map";
import type { RawItem, TaskVM } from "../../data/viewModels";
import { caseFixture } from "../case/t1.fixtures";
import { filterCases, filterChoices, NO_FILTERS } from "../case/caseFilters";
import { caseOfTask, endedWithoutCancellation, groupMyWork, strayRejected } from "./workGroups";

const t = (flow: TaskVM["flow"], id: string, act: string, step: TaskVM["step"], due?: string): TaskVM => ({ ...heldTask(flow, id, act, step ?? "CASE_S1"), step, due });

describe("My work (§8.1)", () => {
  it("groups the held tasks: manual supplier steps, decide-and-check, and everything else held", () => {
    const g = groupMyWork([
      t("CIQ_Case_A00", "C1", "a", "CASE_S1", "2026-10-20"),
      t("CIQ_Case_A00", "C3", "a", "CASE_S3", "2026-10-10"),
      t("CIQ_Open_Point_A00", "P1", "a", "OPNT_S1", "2026-10-15"),
      t("CIQ_Case_A00", "C2", "a", "CASE_S2"),
      t("CIQ_Change_Request_A00", "R1", "a", "CHRQ_S1"),
      t("CIQ_Open_Point_A00", "P4", "a", "OPNT_R_RMM"),
      t("CIQ_Case_A00", "C4", "x1", "CASE_B_REG"),
      t("CIQ_Case_A00", "C4", "x2", "CASE_B_SAF"),
      t("CIQ_Case_A00", "C4", "x3", null),
    ]);
    expect(g.manual.map((x) => x.instanceId)).toEqual(["C3", "P1", "C1"]); // by due date
    expect(g.decide.map((x) => x.step)).toEqual(["CASE_S2", "OPNT_R_RMM", "CHRQ_S1"]); // no due date: by title (C2, P4, R1)
    expect(g.other.map((x) => x.key)).toEqual(["C4|x1", "C4|x2", "C4|x3"]); // three distinct _id|act on one case
  });

  it("joins the case of a task (case task, point/CR task by Case_Item_Id)", () => {
    const c = caseFixture({}, "C9");
    expect(caseOfTask(t("CIQ_Case_A00", "C9", "a", "CASE_S2"), [c])?._id).toBe("C9");
    expect(caseOfTask({ ...t("CIQ_Open_Point_A00", "P9", "a", "OPNT_S1"), caseItemId: "C9" }, [c])?._id).toBe("C9");
  });

  it("tiles: stray rejected points/CRs; cases ended without a cancellation event", () => {
    const p = toPointVM({ _id: "P5", _status: "Rejected" } as RawItem);
    const okP = toPointVM({ _id: "P6", _status: "In progress" } as RawItem);
    const r = toCrVM({ _id: "R9", _status: "Rejected" } as RawItem);
    expect(strayRejected([p, okP], [r]).map((x) => x._id)).toEqual(["P5", "R9"]);
    const c10 = caseFixture({ _status: "Rejected" }, "C10");
    const c11 = caseFixture({ _status: "Withdrawn" }, "C11");
    const ev = toAuditVM({ _id: "E1", Event_Category: "Cancellation", Case_Item_Id: "C10" } as RawItem);
    expect(endedWithoutCancellation([c10, c11, caseFixture({}, "C12")], [ev]).map((c) => c._id)).toEqual(["C11"]);
  });
});

describe("Cases list (§8.2)", () => {
  const rows = [
    caseFixture({ Trade_Name: "Lumen Calendula Extract", _current_step: "Scope check", Owner_RMM: { _id: "UsAlex", Name: "Alex Rivera" } }, "A"),
    caseFixture({ Trade_Name: "Corvid Glycerin", Supplier_Code: "SUP-CRV", Supplier_Legal_Name: "Corvid Chemicals Ltd", _status: "Completed" }, "B"),
    caseFixture({ Trade_Name: "Test material", Case_Test: "Yes" }, "C"),
    caseFixture({ Trade_Name: "Rejected one", _status: "Rejected", Dept_SAF_Active: "Yes" }, "D"),
  ];
  it("hides test cases by default and searches the listed columns", () => {
    expect(filterCases(rows, NO_FILTERS).map((c) => c._id)).toEqual(["A", "B", "D"]);
    expect(filterCases(rows, { ...NO_FILTERS, showTest: true }).map((c) => c._id)).toEqual(["A", "B", "C", "D"]);
    expect(filterCases(rows, { ...NO_FILTERS, q: "corvid" }).map((c) => c._id)).toEqual(["B"]);
    expect(filterCases(rows, { ...NO_FILTERS, q: "bdf-100200" })).toHaveLength(3);
  });
  it("filters by status, step, supplier, owner and active department", () => {
    expect(filterCases(rows, { ...NO_FILTERS, status: "cancelled" }).map((c) => c._id)).toEqual(["D"]);
    expect(filterCases(rows, { ...NO_FILTERS, status: "completed" }).map((c) => c._id)).toEqual(["B"]);
    expect(filterCases(rows, { ...NO_FILTERS, step: "CASE_S2" }).map((c) => c._id)).toEqual(["A"]);
    expect(filterCases(rows, { ...NO_FILTERS, supplier: "SUP-CRV" }).map((c) => c._id)).toEqual(["B"]);
    expect(filterCases(rows, { ...NO_FILTERS, owner: "UsAlex" }).map((c) => c._id)).toEqual(["A"]);
    expect(filterCases(rows, { ...NO_FILTERS, dept: "SAF" }).map((c) => c._id)).toEqual(["D"]);
    expect(filterChoices(rows).suppliers.map((s) => s.code)).toEqual(["SUP-CRV", "SUP-NWB"]);
  });
});
