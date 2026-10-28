// The completeness check after the matrix v0.6 check (28 Oct): the K2.1 rows (H1, M1, M2, L5) and the origin
// consistency with SF-01 (D6), the controllers without "Cannot provide" (D10), the number checks (M3, M14, M15, L1),
// the derived Annex 1 country of origin (L6), the pre-fill of FLD-A2-101 (M9), the conditional uploads (D8) and the
// dropped metadata questions (K12). Fictional data only.
import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { fieldOf } from "./catalog";
import { answerOf, caseFields, completenessBlockers, compositionBlockers, prefillAnswers, releaseBlockers, requiredFields, sectionProgress } from "./selectors";
import { PLAIN_CONFIG, Scenario } from "./testkit";
import type { ComponentRow, ConfigAnswers } from "./types";

const ROW: ComponentRow = { id: "c1", inci: "Olea Europaea Fruit Oil", cas: "8001-25-0", fn: "emollient", additive: false, origin: "vegetable", concMin: 90, concMax: 99 };

/** A vegetable case with everything required filled in (testkit), still in Part 1. */
const filled = (config: ConfigAnswers = PLAIN_CONFIG) => new Scenario().create().metadata(config).fillMandatory();
const rows = (sc: Scenario, list: ComponentRow[]) => sc.step("rows", (s, at) => A.setComponents(s, "u-sup-1", sc.id, list, at));
const k21 = (sc: Scenario) => completenessBlockers(sc.c, sc.s.config).filter((b) => b.sectionId === "K2.1");

describe("K2.1 rows block the completeness confirmation (H1, M1, M2, L5)", () => {
  it("a filled case has no blocker; the row and its progress count as done", () => {
    const sc = filled();
    expect(completenessBlockers(sc.c, sc.s.config)).toEqual([]);
    const p = sectionProgress(sc.c, "K2.1", sc.s.config);
    expect(p.done).toBe(p.total);
  });

  it("a blank row is saved as typed and named problem by problem, with its row id", () => {
    const sc = filled();
    rows(sc, [ROW, { id: "c2", inci: "", fn: "", additive: null, origin: "vegetable", concMin: null, concMax: null }]);
    expect(sc.c.components[1]).toMatchObject({ concMin: null, concMax: null, additive: null }); // never 0, never a default
    expect(k21(sc)).toEqual([
      { sectionId: "K2.1", rowId: "c2", label: "Component 2: INCI (European) / IUPAC is missing" },
      { sectionId: "K2.1", rowId: "c2", label: "Component 2: Function is missing" },
      { sectionId: "K2.1", rowId: "c2", label: "Component 2: Additive: answer Yes or No" },
      { sectionId: "K2.1", rowId: "c2", label: "Component 2: Enter a minimum and a maximum concentration" },
    ]);
    const p = sectionProgress(sc.c, "K2.1", sc.s.config);
    expect(p.done).toBe(p.total - 1);
  });

  it("80–120 and 60–10 are refused; a legacy 0–0 row counts as missing", () => {
    const sc = filled();
    rows(sc, [{ ...ROW, concMin: 80, concMax: 120 }]);
    expect(k21(sc).map((b) => b.label)).toEqual(["Component 1: Concentrations must be between 0 and 100 %"]);
    rows(sc, [{ ...ROW, concMin: 60, concMax: 10 }]);
    expect(k21(sc).map((b) => b.label)).toEqual(["Component 1: The minimum is higher than the maximum"]);
    rows(sc, [{ ...ROW, concMin: 0, concMax: 0 }]);
    expect(k21(sc).map((b) => b.label)).toEqual(["Component 1: Enter a minimum and a maximum concentration"]);
  });

  it("a wrong CAS check digit blocks; an EC field with a REACH registration number does not", () => {
    const sc = filled();
    rows(sc, [{ ...ROW, cas: "59-02-8" }]);
    expect(k21(sc).map((b) => b.label)).toEqual(["Component 1: The CAS check digit does not match. Please check for a typo"]);
    rows(sc, [{ ...ROW, ec: "01-2119457892-27-0000" }]);
    expect(k21(sc)).toEqual([]);
  });

  it("the confirmation is refused, and the final release names the row", () => {
    const sc = filled();
    rows(sc, [{ ...ROW, additive: null }]);
    sc.refused("confirm", (s, at) => A.confirmCompleteness(s, "u-sup-1", sc.id, at));
    expect(releaseBlockers(sc.c, sc.s.config).find((b) => b.rowId === "c1")).toMatchObject({ sectionId: "K2.1", rowId: "c1", label: "Missing: Component 1: Additive: answer Yes or No" });
  });
});

describe("origins: every row's origin is an SF-01 answer, every SF-01 answer is used (D6, a blocker)", () => {
  it("a row whose origin is not selected, and the selected origin no row has", () => {
    const sc = filled();
    rows(sc, [{ ...ROW, origin: "mineral" }]);
    expect(compositionBlockers(sc.c)).toEqual([
      { sectionId: "K2.1", rowId: "c1", label: "Component 1: origin “Mineral” is not one of the SF-01 origins", supplierLabel: "Component 1: its origin “Mineral” is not one of the origins you selected in the metadata questions" },
      { sectionId: "K2.1", label: "SF-01 origin “Vegetable (bio mass)” is not used by any component", supplierLabel: "You selected the origin “Vegetable (bio mass)”, but no component has it. Add the component or remove the origin." },
    ]);
  });

  it("an unused origin of a multi-origin answer blocks; a consistent multi-origin case does not", () => {
    const sc = filled({ ...PLAIN_CONFIG, SF01: ["vegetable", "mineral"] });
    expect(completenessBlockers(sc.c, sc.s.config)).toEqual([]); // testkit: one valid row per origin
    expect(sc.c.components.map((r) => r.origin)).toEqual(["vegetable", "mineral"]);
    rows(sc, [ROW]);
    expect(k21(sc).map((b) => b.label)).toEqual(["SF-01 origin “Mineral” is not used by any component"]);
  });

  it("only once SF-01 is answered (until then its own blocker asks for it)", () => {
    const sc = new Scenario().create();
    rows(sc, [{ ...ROW, origin: "mineral" }]);
    expect(compositionBlockers(sc.c)).toEqual([]);
  });
});

describe("controllers of a matrix chain: no 'Cannot provide' (D10)", () => {
  it("a justified FLD-A1-201 still blocks; a justified ordinary question does not", () => {
    const sc = filled();
    for (const f of ["FLD-A1-201", "FLD-2.1-102"]) {
      sc.step(`clear ${f}`, (s, at) => A.setAnswer(s, "u-sup-1", sc.id, f, null, at));
      sc.step(`justify ${f}`, (s, at) => A.setJustification(s, "u-sup-1", sc.id, f, "The analysis is in progress.", at));
    }
    const ids = completenessBlockers(sc.c, sc.s.config).map((b) => b.fieldId);
    expect(ids).toContain("FLD-A1-201");
    expect(ids).not.toContain("FLD-2.1-102");
    const a1 = sectionProgress(sc.c, "A1", sc.s.config);
    expect(a1.done).toBeLessThan(a1.total);
  });

  it("is set on FLD-A1-201, FLD-A1-204 and FLD-A4-102 only", () => {
    expect(["FLD-A1-201", "FLD-A1-204", "FLD-A4-102"].map((id) => fieldOf(id)?.noJustification)).toEqual([true, true, true]);
    expect(fieldOf("FLD-A1-206")?.noJustification).toBeUndefined();
  });
});

describe("number and e-mail checks (M3, M14, M15, L1)", () => {
  const check = (id: string, v: number | string) => fieldOf(id)!.validate!(v);

  it("Natural origin index: 0–1 with at most 2 decimals", () => {
    expect(check("FLD-2.1-102", 0.333)).toBe("Max. 2 decimals");
    expect(check("FLD-2.1-102", 0.33)).toBeNull();
    expect(check("FLD-2.1-102", 0.1 + 0.2)).toBeNull(); // 0.30000000000000004
    expect(check("FLD-2.1-102", 1.5)).toBe("Must be between 0 and 1");
    const sc = filled();
    sc.step("0.333", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-2.1-102", 0.333, at));
    expect(completenessBlockers(sc.c, sc.s.config).map((b) => b.label)).toContain("Natural origin index: Max. 2 decimals");
  });

  it("MOAH 0 or more; viscosity greater than 0", () => {
    expect(check("FLD-A4-101", -1)).toBe("Must be 0 or more");
    expect(check("FLD-A4-101", 0)).toBeNull();
    expect(check("FLD-A4-103", 0)).toBe("Must be greater than 0");
    expect(check("FLD-A4-103", 4.2)).toBeNull();
  });

  it("contact e-mail 2: the format is checked, but it never blocks the supplier (optional, set by Beiersdorf)", () => {
    expect(check("FLD-GEN-009", "qa.solvaro.example")).toBe("Not a valid e-mail address");
    expect(check("FLD-GEN-009", "qa@solvaro.example")).toBeNull();
    const sc = filled();
    const c = { ...sc.c, answers: { ...sc.c.answers, "FLD-GEN-009": "qa.solvaro.example" } };
    expect(completenessBlockers(c, sc.s.config)).toEqual([]);
  });
});

describe("Annex 1 country of origin: a read-only copy of FLD-2.3-10 (L6)", () => {
  it("shows K2.3's country, is never stored or required, and can't be written", () => {
    const sc = filled();
    const f = fieldOf("FLD-A1-105", sc.c.templateVersion, sc.s.config)!;
    expect(caseFields(sc.c, "A1", sc.s.config)[0].id).toBe("FLD-A1-105");
    expect(sc.c.answers["FLD-2.3-10"]).toBeTruthy();
    expect(answerOf(sc.c, f)).toBe(sc.c.answers["FLD-2.3-10"]);
    expect(sc.c.answers["FLD-A1-105"]).toBeUndefined();
    expect(requiredFields(sc.c, "A1", sc.s.config).map((x) => x.id)).not.toContain("FLD-A1-105");
    expect(sc.refused("write the copy", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-A1-105", "Spain", at))).toBe("Country of origin is filled in from Country of origin (K2.3). Change it there.");
  });

  it("is in the final document's Annex 1, with the K2.3 value", () => {
    const sc = filled().confirm().completeAll().release();
    const a1 = sc.c.finalDocument!.sections.find((x) => x.sectionId === "A1")!;
    expect(a1.answers[0]).toMatchObject({ fieldId: "FLD-A1-105", value: String(sc.c.answers["FLD-2.3-10"]) });
  });
});

describe("FLD-A2-101 is pre-filled with the main INCI when Annex 2 opens (M9)", () => {
  it("answering SF-01 = Vegetable fills it, attributed to the system", () => {
    const sc = new Scenario().create();
    expect(sc.c.answers["FLD-A2-101"]).toBeUndefined();
    sc.metadata();
    expect(sc.c.answers["FLD-A2-101"]).toBe("Olea Europaea Fruit Oil");
    expect(sc.c.answeredBy["FLD-A2-101"]?.by).toBe("system");
  });

  it("a value the supplier cleared or changed is never filled in again", () => {
    const sc = new Scenario().create().metadata();
    sc.step("clear", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-A2-101", null, at));
    sc.metadata({ ...PLAIN_CONFIG, SF03: true });
    expect(sc.c.answers["FLD-A2-101"]).toBeNull();
    expect(prefillAnswers(sc.c, sc.s.config)).toEqual({});
  });

  it("the components' INCIs are the fallback without a main INCI", () => {
    const sc = new Scenario().create();
    const c = { ...sc.c, inci: " ", config: PLAIN_CONFIG, scope: sc.c.scope.map((x) => (x.sectionId === "A2" ? { ...x, applicability: "mandatory" as const } : x)), components: [ROW, { ...ROW, id: "c2", inci: "Tocopherol" }] };
    expect(prefillAnswers(c, sc.s.config)).toEqual({ "FLD-A2-101": "Olea Europaea Fruit Oil; Tocopherol" });
  });

  it("after the completeness confirmation: when a changed answer adds Annex 2", () => {
    const sc = new Scenario().toReview({}, { ...PLAIN_CONFIG, SF01: ["mineral"] });
    expect(sc.c.scope.find((x) => x.sectionId === "A2")?.applicability).toBe("na");
    expect(sc.c.answers["FLD-A2-101"]).toBeUndefined();
    sc.metadata({ ...PLAIN_CONFIG, SF01: ["mineral", "vegetable"] });
    expect(sc.c.answers["FLD-A2-101"]).toBe("Olea Europaea Fruit Oil");
  });

  it("when a department adds Annex 2 during the review", () => {
    const sc = new Scenario().toReview({}, { ...PLAIN_CONFIG, SF01: ["mineral"] });
    sc.step("add A2", (s, at) => A.extendScope(s, "u-reg", sc.id, "A2", "The manufacturing process is needed for the assessment.", at));
    expect(sc.c.answers["FLD-A2-101"]).toBe("Olea Europaea Fruit Oil");
  });
});

describe("conditional uploads (D8)", () => {
  it("FLD-A1-209 (certificate) is shown and required only when FLD-A1-207 = Yes", () => {
    const sc = filled();
    const set = (f: string, v: string | boolean) => sc.step(`${f}=${v}`, (s, at) => A.setAnswer(s, "u-sup-1", sc.id, f, v, at));
    const a1 = () => caseFields(sc.c, "A1", sc.s.config).map((f) => f.id);
    expect(a1()).not.toContain("FLD-A1-209");
    set("FLD-A1-204", true);
    set("FLD-A1-206", "No RSPO certification");
    set("FLD-A1-207", false);
    expect(a1()).not.toContain("FLD-A1-209");
    set("FLD-A1-207", true);
    expect(a1()).toEqual(expect.arrayContaining(["FLD-A1-208", "FLD-A1-209"]));
    expect(requiredFields(sc.c, "A1", sc.s.config).map((f) => f.id)).toEqual(expect.arrayContaining(["FLD-A1-208", "FLD-A1-209"]));
    expect(completenessBlockers(sc.c, sc.s.config).map((b) => b.label)).toEqual(expect.arrayContaining(["Other certification (name)", "Other certification: certificate"]));
  });

  it("FLD-A4-104 (analytical data) only when a viscosity is available and FLD-A4-103 holds a number", () => {
    const sc = filled({ ...PLAIN_CONFIG, SF07: true });
    const set = (f: string, v: string | number | null) => sc.step(`${f}=${v}`, (s, at) => A.setAnswer(s, "u-sup-1", sc.id, f, v, at));
    const a4 = () => caseFields(sc.c, "A4", sc.s.config).map((f) => f.id);
    expect(sc.c.answers["FLD-A4-102"]).toBe("Not available"); // testkit: the first option
    expect(a4()).not.toContain("FLD-A4-103");
    expect(a4()).not.toContain("FLD-A4-104");
    set("FLD-A4-102", "Own value");
    expect(a4()).toContain("FLD-A4-103");
    expect(a4()).not.toContain("FLD-A4-104");
    set("FLD-A4-103", 12.5);
    expect(a4()).toContain("FLD-A4-104");
    expect(completenessBlockers(sc.c, sc.s.config).map((b) => b.fieldId)).toContain("FLD-A4-104");
    sc.step("upload", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "Viscosity_analysis_2610.pdf", kind: "Analysis", sectionId: "A4", fieldId: "FLD-A4-104" }, at).state);
    expect(completenessBlockers(sc.c, sc.s.config).map((b) => b.fieldId)).not.toContain("FLD-A4-104");
  });
});

describe("dropped metadata questions (SF-02, SF-08; K12)", () => {
  it("a case that still stores SF-08 saves another answer without error; a dropped key in a patch is ignored", () => {
    const sc = new Scenario().create().metadata();
    sc.s = { ...sc.s, cases: sc.s.cases.map((c) => (c.id === sc.id ? { ...c, config: { ...c.config, SF08: true } as ConfigAnswers } : c)) };
    sc.metadata({ SF03: true });
    expect(sc.c.config.SF03).toBe(true);
    expect((sc.c.config as Record<string, unknown>).SF08).toBe(true); // kept, never shown
    // an old client sending only dropped keys changes nothing (and is no refusal)
    const next = A.saveConfig(sc.s, "u-sup-1", sc.id, { SF02: true, SF08: false } as unknown as ConfigAnswers, sc.now());
    expect(next).toBe(sc.s);
  });
});
