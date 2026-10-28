import { describe, expect, it } from "vitest";
import { CLEAR, hasMilliseconds, idOf, isBlank, kfDate, kfDateTime, normaliseFields, sameValue, writeValue } from "./normalize";
import { normalisePatch, toBody } from "./writeVerified";

describe("normalisation (§6.6)", () => {
  it("DateTime is written without milliseconds and compared to the second", () => {
    expect(kfDateTime(new Date("2026-10-08T12:34:56.789Z"))).toBe("2026-10-08T12:34:56Z");
    expect(writeValue("DateTime", "2026-10-08T12:34:56.789Z")).toBe("2026-10-08T12:34:56Z");
    expect(hasMilliseconds(writeValue("DateTime", new Date()))).toBe(false);
    expect(sameValue("DateTime", "2026-10-08T12:34:56Z", "2026-10-08T12:34:56.000Z")).toBe(true);
    expect(sameValue("DateTime", "2026-10-08T12:34:56Z", "2026-10-08T12:34:57Z")).toBe(false);
  });
  it("Date is YYYY-MM-DD; Number is a number; Select/Text are strings", () => {
    expect(writeValue("Date", "2026-10-22")).toBe("2026-10-22");
    expect(kfDate(new Date("2026-10-22T05:00:00Z"))).toBe("2026-10-22");
    expect(writeValue("Number", "3")).toBe(3);
    expect(() => writeValue("Number", "x")).toThrow();
    expect(writeValue("Select", "Yes")).toBe("Yes");
    expect(sameValue("Number", 0, "0")).toBe(true);
    expect(sameValue("Text", " a ", "a")).toBe(true);
  });
  it("User and Reference are written as {_id} and compared by _id; readers accept {_id}, {_id,Name} or a bare id", () => {
    expect(writeValue("User", { _id: "Us1", Name: "Jo Weber" })).toEqual({ _id: "Us1" });
    expect(writeValue("Reference", "Pk1")).toEqual({ _id: "Pk1" });
    expect(sameValue("User", { _id: "Us1" }, { _id: "Us1", Name: "Jo Weber" })).toBe(true);
    expect(sameValue("User", { _id: "Us1" }, "Us1")).toBe(true);
    expect(idOf({ _id: "Us2", Name: "x" })).toBe("Us2");
  });
  it("CLEAR: text types write \"\", typed fields null; a clear compares equal to any blank", () => {
    expect(writeValue("Text", CLEAR)).toBe("");
    expect(writeValue("Textarea", CLEAR)).toBe("");
    expect(writeValue("Number", CLEAR)).toBeNull();
    expect(writeValue("User", CLEAR)).toBeNull();
    expect(sameValue("Number", CLEAR, null)).toBe(true);
    expect(sameValue("Number", CLEAR, 0)).toBe(false);
  });
  it("isBlank: null, undefined, \"\", [], an object without _id", () => {
    for (const v of [null, undefined, "", "  ", [], {}]) expect(isBlank(v)).toBe(true);
    for (const v of [0, "x", { _id: "a" }, ["a"]]) expect(isBlank(v)).toBe(false);
  });
  it("header fields normalise by schema type; unknown ids are refused", () => {
    expect(normaliseFields("CIQ_Case_A00", { Completeness_At: "2026-10-08T09:00:00.120Z", Open_Items_Count: "2" })).toEqual({ Completeness_At: "2026-10-08T09:00:00Z", Open_Items_Count: 2 });
    expect(() => normaliseFields("CIQ_Case_A00", { Nope: 1 })).toThrow(/not a field/);
  });
  it("child-row DateTimes are written without ms too, and adds get a client row id", () => {
    const p = normalisePatch("CIQ_Open_Point_A00", { fields: {}, tables: { Rounds: [{ kind: "add", row: { Rounds_Round_No: 1, Rounds_Reviewed_At: "2026-10-08T09:00:00.999Z" } }] } }, () => 0.5);
    const body = toBody("CIQ_Open_Point_A00", p) as Record<string, Record<string, unknown>[]>;
    const row = body["Table::Rounds"][0];
    expect(row.Rounds_Reviewed_At).toBe("2026-10-08T09:00:00Z");
    expect(String(row._id)).toMatch(/^Rounds_[A-Za-z0-9]{10}$/);
    expect(row._is_created).toBe(true);
  });
});
