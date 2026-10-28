// The K2.1 per-row check (matrix v0.6, 28 Oct: H1, M1, M2, L5) and the FLD-A1-104 hint (M8). Fictional rows only.
import { describe, expect, it } from "vitest";
import { additiveText, casError, componentRowProblems, concText, concentrationError, contentRangeHint, ecError } from "./composition";
import type { ComponentRow } from "./types";

const ROW: ComponentRow = { id: "c1", inci: "Tocopherol", cas: "59-02-9", ec: "200-412-2", fn: "antioxidant", additive: true, origin: "vegetable", concMin: 0.1, concMax: 0.5 };

describe("CAS number (M1)", () => {
  it("accepts a valid number and a blank one; refuses a wrong check digit and a wrong format", () => {
    expect(casError("59-02-9")).toBeNull();
    expect(casError(" ")).toBeNull();
    expect(casError(undefined)).toBeNull();
    expect(casError("59-02-8")).toMatch(/check digit does not match/);
    expect(casError("59029")).toMatch(/Use the CAS format/);
    expect(casError("1-02-9")).toMatch(/Use the CAS format/);
  });
});

describe("EC number or REACH registration number (M2)", () => {
  it("accepts a valid EC number and a REACH registration number (format only)", () => {
    expect(ecError("200-412-2")).toBeNull();
    expect(ecError("01-2119457892-27-0000")).toBeNull();
    expect(ecError("")).toBeNull();
  });

  it("refuses a wrong EC check digit and anything in neither format", () => {
    expect(ecError("200-412-3")).toMatch(/EC check digit does not match/);
    for (const bad of ["200412-2", "01-211945789-27-0000", "02-2119457892-27-0000", "01-2119457892-27-000", "n/a"]) expect(ecError(bad), bad).toBe("Use the EC format 123-456-7 or a REACH registration number 01-0123456789-01-0000");
  });
});

describe("concentration range (H1)", () => {
  it("needs both bounds; a legacy 0–0 row counts as missing", () => {
    expect(concentrationError(null, 5)).toBe("Enter a minimum and a maximum concentration");
    expect(concentrationError(5, undefined)).toBe("Enter a minimum and a maximum concentration");
    expect(concentrationError(0, 0)).toBe("Enter a minimum and a maximum concentration");
  });

  it("0 and 100 are allowed; outside, non-numbers and min > max are not", () => {
    expect(concentrationError(0, 100)).toBeNull();
    expect(concentrationError(0, 0.5)).toBeNull();
    expect(concentrationError(-1, 5)).toBe("Concentrations must be between 0 and 100 %");
    expect(concentrationError(80, 120)).toBe("Concentrations must be between 0 and 100 %");
    expect(concentrationError(Number.NaN, 5)).toBe("Concentrations must be numbers");
    expect(concentrationError(60, 10)).toBe("The minimum is higher than the maximum");
  });
});

describe("componentRowProblems", () => {
  it("a complete, valid row has none", () => {
    expect(componentRowProblems(ROW)).toEqual([]);
    expect(componentRowProblems({ ...ROW, cas: undefined, ec: undefined, additive: false })).toEqual([]);
  });

  it("a blank row: INCI, function, additive and concentration, in table order", () => {
    const p = componentRowProblems({ ...ROW, inci: " ", cas: "", ec: "", fn: "", additive: null, concMin: null, concMax: null });
    expect(p.map((x) => x.text)).toEqual(["INCI (European) / IUPAC is missing", "Function is missing", "Additive: answer Yes or No", "Enter a minimum and a maximum concentration"]);
    expect(p.every((x) => x.missing)).toBe(true);
  });

  it("wrong CAS and EC numbers are named between INCI and function; an invalid range is no 'missing'", () => {
    const p = componentRowProblems({ ...ROW, inci: "", cas: "59-02-8", ec: "200-412-3", concMin: 60, concMax: 10 });
    expect(p.map((x) => x.column)).toEqual(["inci", "cas", "ec", "conc"]);
    expect(p.find((x) => x.column === "conc")).toEqual({ column: "conc", text: "The minimum is higher than the maximum" });
  });

  it("a legacy row's additive false is an answer (No); a missing additive is not", () => {
    expect(componentRowProblems({ ...ROW, additive: false })).toEqual([]);
    expect(componentRowProblems({ ...ROW, additive: undefined as unknown as null }).map((x) => x.column)).toEqual(["additive"]);
  });
});

describe("display", () => {
  it("concText: '—' for nothing entered or a legacy 0–0; '?' for a missing bound", () => {
    expect(concText({ concMin: null, concMax: null })).toBe("—");
    expect(concText({ concMin: 0, concMax: 0 })).toBe("—");
    expect(concText({ concMin: 1, concMax: null })).toBe("1–? %");
    expect(concText({ concMin: 90, concMax: 99 })).toBe("90–99 %");
    expect(concText({ concMin: 90, concMax: 99 }, "")).toBe("90–99");
  });

  it("additiveText: Yes, No, or '—' while unanswered", () => {
    expect([true, false, null, undefined].map(additiveText)).toEqual(["Yes", "No", "—", "—"]);
  });
});

describe("FLD-A1-104 hint (M8)", () => {
  const rows = [
    { concMin: 90, concMax: 99 },
    { concMin: 0.1, concMax: 1 },
  ];

  it("inside the union [lowest minimum, highest maximum]: no hint, also between two rows' ranges", () => {
    expect(contentRangeHint(95, rows)).toBeNull();
    expect(contentRangeHint(0.1, rows)).toBeNull();
    expect(contentRangeHint(99, rows)).toBeNull();
    expect(contentRangeHint(50, rows)).toBeNull();
  });

  it("below the lowest minimum or above the highest maximum: a warning that names the range", () => {
    expect(contentRangeHint(0.05, rows)).toBe("This value lies outside the concentration range of the components in K2.1 (0.1–99 %). Please check it.");
    expect(contentRangeHint(99.5, rows)).toBe("This value lies outside the concentration range of the components in K2.1 (0.1–99 %). Please check it.");
  });

  it("an invalid row (min above max, outside 0–100 %) does not widen the range", () => {
    expect(contentRangeHint(5, [{ concMin: 10, concMax: 20 }, { concMin: 30, concMax: 1 }])).toBe("This value lies outside the concentration range of the components in K2.1 (10–20 %). Please check it.");
    expect(contentRangeHint(5, [{ concMin: 10, concMax: 20 }, { concMin: -5, concMax: 150 }])).not.toBeNull();
  });

  it("no complete rows, or no number: no hint", () => {
    expect(contentRangeHint(50, [])).toBeNull();
    expect(contentRangeHint(50, [{ concMin: null, concMax: 10 }, { concMin: 0, concMax: 0 }])).toBeNull();
    expect(contentRangeHint("50", rows)).toBeNull();
    expect(contentRangeHint(null, rows)).toBeNull();
  });
});
