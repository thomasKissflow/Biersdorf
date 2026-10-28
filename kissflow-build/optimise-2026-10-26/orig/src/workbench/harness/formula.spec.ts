import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FORMULA_SAMPLES } from "../schema/formulaSamples";
import { CHILD_TABLES, FIELDS, type ChildTableId } from "../schema/generated";
import { allFormulas, evaluate, recompute, tableKey } from "./formula";
import { sha256Hex } from "./sha256";

const formulaOf = (s: (typeof FORMULA_SAMPLES)[number]): string => {
  const def = s.table ? (CHILD_TABLES[s.table].fields as Record<string, { formula?: string }>)[s.field] : (FIELDS[s.flow] as Record<string, { formula?: string }>)[s.field];
  if (!def?.formula) throw new Error(`${s.flow}.${s.table ?? ""}.${s.field} has no formula`);
  return def.formula;
};

describe("formula engine parity with schema/formulaSamples.ts (v4 results)", () => {
  it("covers every spec formula (header and child columns) with at least one vector", () => {
    const all = allFormulas();
    expect(all.length).toBe(14); // 12 header formulas + Criteria_Open_Num on both RMES child tables
    for (const f of all) expect(FORMULA_SAMPLES.some((s) => s.flow === f.flow && s.field === f.field && (s.table ?? undefined) === f.table), `${f.flow} ${f.table ?? ""} ${f.field}`).toBe(true);
  });

  it.each(FORMULA_SAMPLES.map((s, i) => [i, s] as const))("vector %i: %o", (_i, s) => {
    const got = evaluate(formulaOf(s), (n) => s.inputs[n]);
    expect(got === null ? "" : got).toBe(s.output);
  });

  it("v4: a blank count gives <D>_Gate \"\" and Hold_For_Open_Items \"Yes\"", () => {
    const f: Record<string, unknown> = { SAF_Open_Count: null, SAF_RMES_Gaps: 0, Open_Items_Count: null, Open_CR_Count: 0 };
    recompute("CIQ_Case_A00", f);
    expect(f.SAF_Gate).toBe("");
    expect(f.Hold_For_Open_Items).toBe("Yes");
    f.SAF_Open_Count = 0;
    f.Open_Items_Count = 0;
    recompute("CIQ_Case_A00", f);
    expect(f.SAF_Gate).toBe("OK");
    expect(f.Hold_For_Open_Items).toBe("No");
  });

  it("recomputes child-column formulas per row; childFormula=off leaves them blank", () => {
    const k = tableKey("Safety_Criteria" as ChildTableId);
    const rows = () => [
      { _id: "a", Criteria_Applicable: "Yes", Criteria_Result: "Available" },
      { _id: "b", Criteria_Applicable: "Yes" },
      { _id: "c", Criteria_Applicable: "No" },
    ];
    const on: Record<string, unknown> = { [k]: rows() };
    recompute("CIQ_RMES_Safety_A00", on, { childFormula: true });
    expect((on[k] as { Criteria_Open_Num: unknown }[]).map((r) => r.Criteria_Open_Num)).toEqual([0, 1, 0]);
    const off: Record<string, unknown> = { [k]: rows() };
    recompute("CIQ_RMES_Safety_A00", off, { childFormula: false });
    expect((off[k] as { Criteria_Open_Num: unknown }[]).map((r) => r.Criteria_Open_Num)).toEqual([null, null, null]);
  });

  it("CR_Open_Num sums the open assessments", () => {
    const f: Record<string, unknown> = { CR_Outcome: null, Impact_REG: "Yes", Impact_SAF: "Yes" };
    recompute("CIQ_Change_Request_A00", f);
    expect(f.CR_Open_Num).toBe(3);
  });

  it("rejects functions the host does not emulate", () => {
    expect(() => evaluate("SUM(A,B)", () => 1)).toThrow(/not emulated/);
  });
});

describe("sha256 (fixture content hashes)", () => {
  it.each(["", "abc", "Payload ä ö ü €", JSON.stringify({ sections: [{ sectionKey: "BASIC", default: "Mandatory" }] }), "x".repeat(1000)])("matches node:crypto for %j", (s) => {
    expect(sha256Hex(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
  });
});
