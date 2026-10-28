// StepForm (§8.5): the pure model for EVERY step (no input for any computed field; every gate read-only), and one
// server-side render (react-dom/server; no jsdom).
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { allSteps, isComputed } from "../schema";
import { stepFormModel, StepForm } from "./StepForm";

describe("stepFormModel", () => {
  const steps = allSteps().filter((s) => s.kind === "Start" || s.kind === "UserTask");
  it.each(steps.map((s) => [s.irId] as const))("%s: no input for a computed field; gates read-only", (ir) => {
    const m = stepFormModel(ir, {});
    for (const i of m.inputs) expect(isComputed(m.flow, i.field)).toBe(false);
    for (const g of m.gates) {
      expect(isComputed(m.flow, g.field)).toBe(true);
      expect(m.inputs.some((i) => i.field === g.field)).toBe(false);
    }
  });
  it("CASE_B_SAF: SAF_Gate is a gate with the mirror's explanation; lane fields are inputs", () => {
    const m = stepFormModel("CASE_B_SAF", { SAF_Open_Count: null, SAF_RMES_Gaps: 0, SAF_Gate: "" });
    expect(m.gates).toEqual([{ field: "SAF_Gate", label: "SAF Gate", value: "", ok: false, explanation: "SAF Gate is not OK: SAF Open Count is blank" }]);
    expect(m.inputs.map((i) => i.field)).toContain("SAF_Review_Confirm");
    expect(m.inputs.find((i) => i.field === "SAF_RMES_Decision")).toMatchObject({ required: true, list: ["Approved", "Rejected"] });
  });
  it("OPNT_R_SAF: Rounds is a table, not an input; only/exclude filter", () => {
    const m = stepFormModel("OPNT_R_SAF", {}, { exclude: ["OP_Progress"] });
    expect(m.tables).toEqual(["Rounds"]);
    expect(m.inputs.some((i) => i.field === "OP_Progress")).toBe(false);
    expect(stepFormModel("OPNT_R_SAF", {}, { only: ["OP_Outcome"] }).inputs.map((i) => i.field)).toEqual(["OP_Outcome"]);
  });
  it("renders one step server-side, read-only without a held task", () => {
    const html = renderToString(<StepForm step="CASE_S3" values={{ Completeness_At: "2026-10-08T09:00:00Z" }} onChange={() => {}} held={false} />);
    expect(html).toContain('data-testid="wb-step-CASE_S3"');
    expect(html).toContain("You don&#x27;t hold this task.");
    expect(html).toContain("Completeness At");
  });
});
