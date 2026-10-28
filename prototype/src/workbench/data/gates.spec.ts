import { describe, expect, it } from "vitest";
import { explainGate, SECTION_REVIEW_MARKS_BLOCK, stepProblems } from "./gates";
import type { RawItem } from "./viewModels";

describe("gates", () => {
  it("explains a gate from the client mirror", () => {
    expect(explainGate("CIQ_Case_A00", "SAF_Gate", { SAF_Open_Count: null, SAF_RMES_Gaps: 0 })).toMatch(/SAF Gate is not OK: SAF Open Count is blank/);
    expect(explainGate("CIQ_Case_A00", "SAF_Gate", { SAF_Open_Count: 0, SAF_RMES_Gaps: 0 })).toBe("");
    expect(explainGate("CIQ_Open_Point_A00", "Start_Gate", { OP_To_Supplier: "Yes" })).toMatch(/Supplier Due Date is blank/);
  });
  it("stepProblems: blank writable Mandatory fields, server gates not OK, and extra checks", () => {
    const fresh = { _id: "Pk1", SAF_Review_Confirm: "Confirmed", SAF_Completed_By: { _id: "Us1" }, SAF_Completed_By_Email: "jo@example.test", SAF_Completed_At: "2026-10-08T10:00:00Z", SAF_RMES_Decision: "", SAF_Gate: "" } as RawItem;
    const ps = stepProblems("CASE_B_SAF", fresh, [() => [{ label: "Blockers", message: "1 open point" }]]);
    expect(ps.map((p) => p.field ?? p.label)).toEqual(["SAF_RMES_Decision", "SAF_Gate", "Blockers"]);
    expect(stepProblems("CASE_B_SAF", { ...fresh, SAF_RMES_Decision: "Approved", SAF_Gate: "OK" } as RawItem)).toEqual([]);
  });
  it("section-review marks block by default (WB-D5)", () => expect(SECTION_REVIEW_MARKS_BLOCK).toBe(true));
});
