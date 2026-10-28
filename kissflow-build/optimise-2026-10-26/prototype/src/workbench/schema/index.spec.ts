// schema/index.ts helpers (§4.5): computed fields are never writable; gates; stepOf never returns a Parallel step.
import { describe, expect, it } from "vitest";
import { ADMIN_REPAIR_FLOW, assertWritable, childTableOf, crDeptFields, editableAt, gateFieldsAt, isComputed, isWritableAt, LocalGuardError, mandatoryAt, permsAt, requiredFormFields, stepOf, stepsOf, switchesAt } from "./index";
import { STEPS } from "./generated";

describe("schema helpers", () => {
  it("assertWritable(CASE_B_SAF, [SAF_Gate]) throws: computed fields are never writable", () => {
    expect(() => assertWritable("CASE_B_SAF", ["SAF_Gate"])).toThrow(LocalGuardError);
    expect(isWritableAt("CASE_B_SAF", "SAF_Gate")).toBe(false);
  });
  it("assertWritable refuses a ReadOnly field and accepts a writable one", () => {
    expect(() => assertWritable("CASE_B_SAF", ["REG_Review_Confirm"])).toThrow(/not writable/);
    expect(() => assertWritable("CASE_B_SAF", ["SAF_Review_Confirm", "SAF_Open_Count"])).not.toThrow();
  });
  it("editableAt(CASE_S5) has no Open_Items_Gate_Release; gateFieldsAt has it", () => {
    expect(editableAt("CASE_S5")).not.toContain("Open_Items_Gate_Release");
    expect(mandatoryAt("CASE_S5")).not.toContain("Open_Items_Gate_Release");
    expect(gateFieldsAt("CASE_S5")).toEqual(["Open_Items_Gate_Release"]);
  });
  it('gateFieldsAt("OPNT_S0") = ["Start_Gate"]', () => expect(gateFieldsAt("OPNT_S0")).toEqual(["Start_Gate"]));
  it('stepOf(CIQ_Case_A00, "Part 2 – Beiersdorf review") is null (Parallel); End is null; a branch resolves', () => {
    expect(stepOf("CIQ_Case_A00", "Part 2 – Beiersdorf review")).toBeNull();
    expect(stepOf("CIQ_Case_A00", "End")).toBeNull();
    expect(stepOf("CIQ_Case_A00", "Review – Safety")).toBe("CASE_B_SAF");
    expect(stepOf("CIQ_Open_Point_A00", "Review – Safety")).toBe("OPNT_R_SAF");
    expect(stepOf("CIQ_Case_A00", "Review - Safety")).toBeNull(); // hyphen-minus is not the step name
  });
  it("no perms list of any step contains a computed field", () => {
    for (const ir of Object.keys(STEPS) as (keyof typeof STEPS)[]) for (const k of permsAt(ir)) expect(isComputed(STEPS[ir].flow, k)).toBe(false);
  });
  it("switches, child tables, CR dept fields, required form fields", () => {
    expect(switchesAt("CASE_S2").reject).toBe(true);
    expect(switchesAt("CASE_S6").reject).toBe(false);
    expect(childTableOf("CIQ_Open_Point_A00", "Rounds").key).toBe("Table::Rounds");
    expect(crDeptFields("RMM")).toBeNull();
    expect(crDeptFields("SAF")?.assessment).toBe("SAF_Assessment");
    expect(requiredFormFields("CIQ_Section_A00")).toHaveLength(11);
    expect(ADMIN_REPAIR_FLOW).toBe("CIQ_Case_A00");
    expect(stepsOf("CIQ_Case_A00")[0].irId).toBe("CASE_S0");
  });
});
