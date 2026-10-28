// The built-in configuration after the matrix v0.6 check (28 Oct, kissflow-build/MATRIX-v0.6-ASSUMPTIONS-2026-10-28.md):
// section leads, field placement and owners, the dropped metadata questions and rule, and the new code-side field
// properties. Fictional values only.
import { describe, expect, it } from "vitest";
import { BASE_RULE_DATA, RS1, RS2 } from "./builtinRules";
import { BUILTIN_FIELDS, BUILTIN_SECTIONS, CONFIG_QUESTIONS, fieldData, fieldsOf } from "./catalog";
import { REFERENCE_MATERIALS } from "./referenceMaterials";
import { REQUIRED_CONFIG } from "./selectors";
import type { Answers, ConfigAnswers } from "./types";

const sec = (id: string) => BUILTIN_SECTIONS.find((x) => x.id === id)!;
const field = (id: string) => BUILTIN_FIELDS.find((f) => f.id === id)!;
const shown = (id: string, a: Answers, c: ConfigAnswers = { SF01: ["vegetable"] }) => field(id).showWhen?.(a, c) ?? true;

describe("matrix v0.6: section leads (approval column)", () => {
  it("K2.1 RMM (co Regulatory), Annex 1 Regulatory (co Sustainability, Safety), Annex 2 RMM (co Safety, Regulatory)", () => {
    expect([sec("K2.1").lead, sec("K2.1").co]).toEqual(["RMM", ["REG"]]);
    expect([sec("A1").lead, sec("A1").co]).toEqual(["REG", ["SUS", "SAF"]]);
    expect([sec("A2").lead, sec("A2").co]).toEqual(["RMM", ["SAF", "REG"]]);
    expect(sec("A1").meaning).toBe("Country of origin, pesticides, palm and RSPO");
    expect(sec("K2.3").meaning).toBe("Origin type per component, feedstock and its content; drives most annexes");
  });

  it("the rule departments follow: R-10 Regulatory, RMM, Safety; R-14 Regulatory, Safety", () => {
    const rule = (id: string) => BASE_RULE_DATA.find((r) => r.id === id)!;
    expect(rule("R-10").departments).toEqual(["REG", "RMM", "SAF"]);
    expect(rule("R-14").departments).toEqual(["REG", "SAF"]);
  });
});

describe("matrix v0.6: fields", () => {
  it("feedstock and its content sit in K2.3 after the origin fields, mandatory for every case, owned by RMM", () => {
    const k23 = fieldsOf("K2.3", "CIQ-2026 v1").map((f) => f.id);
    expect(k23.slice(k23.indexOf("FLD-2.3-10"))).toEqual(["FLD-2.3-10", "FLD-A1-102", "FLD-A1-103", "FLD-A1-104"]);
    for (const id of ["FLD-A1-102", "FLD-A1-103", "FLD-A1-104"]) {
      expect(field(id)).toMatchObject({ sectionId: "K2.3", required: "mandatory", owner: "RMM" });
      expect(field(id).showWhen, id).toBeUndefined();
    }
    expect(field("FLD-A1-103").validate!(101)).toMatch(/0 and 100/);
    expect(fieldsOf("A1", "CIQ-2026 v1").map((f) => f.id)).toEqual(["FLD-A1-105", "FLD-A1-201", "FLD-A1-202", "FLD-A1-203", "FLD-A1-204", "FLD-A1-206", "FLD-A1-207", "FLD-A1-208", "FLD-A1-209"]);
  });

  it("owners as the matrix approval column", () => {
    for (const id of ["FLD-A1-201", "FLD-A1-202", "FLD-A1-203", "FLD-A1-204", "FLD-A1-206", "FLD-A1-207", "FLD-A1-208", "FLD-A1-209"]) expect(field(id).owner, id).toBe("REG");
    for (const id of ["FLD-A2-101", "FLD-A2-102", "FLD-A2-103", "FLD-2.1-102", "FLD-A1-105"]) expect(field(id).owner, id).toBe("RMM");
    for (const id of ["FLD-A4-101", "FLD-A4-102", "FLD-A4-103", "FLD-A4-104"]) expect(field(id).owner, id).toBe("SAF");
    expect(field("FLD-K1-005").owner).toBe("SUS");
  });

  it("FLD-A1-209 (the other certificate) only with FLD-A1-207 = Yes; FLD-A1-208 relabelled", () => {
    expect(field("FLD-A1-209")).toMatchObject({ type: "file", required: "conditional", owner: "REG" });
    expect([shown("FLD-A1-209", { "FLD-A1-207": true }), shown("FLD-A1-209", { "FLD-A1-207": false }), shown("FLD-A1-209", {})]).toEqual([true, false, false]);
    expect(field("FLD-A1-208")).toMatchObject({ label: "Other certification (name)", help: "Upload the certificate below." });
  });

  it("FLD-A4-104 (viscosity analytical data) only when a viscosity value is entered under an Available option", () => {
    expect(field("FLD-A4-104")).toMatchObject({ type: "file", required: "conditional", owner: "SAF" });
    expect(shown("FLD-A4-104", { "FLD-A4-102": "Own value", "FLD-A4-103": 8.2 })).toBe(true);
    expect(shown("FLD-A4-104", { "FLD-A4-102": "Conclusion by analogy", "FLD-A4-103": 4 })).toBe(true);
    expect(shown("FLD-A4-104", { "FLD-A4-102": "Own value" })).toBe(false);
    expect(shown("FLD-A4-104", { "FLD-A4-102": "Not available", "FLD-A4-103": 8.2 })).toBe(false);
  });

  it("FLD-A1-105 is a read-only copy of FLD-2.3-10, shown with it, never required", () => {
    expect(field("FLD-A1-105")).toMatchObject({ sectionId: "A1", type: "text", required: "optional", derivedFrom: "FLD-2.3-10" });
    for (const o of ["vegetable", "animal", "mineral"] as const) expect(shown("FLD-A1-105", {}, { SF01: [o] }), o).toBe(shown("FLD-2.3-10", {}, { SF01: [o] }));
  });

  it("no 'Cannot provide' on the chain controllers FLD-A1-201, FLD-A1-204 and FLD-A4-102", () => {
    expect(BUILTIN_FIELDS.filter((f) => f.noJustification).map((f) => f.id)).toEqual(["FLD-A1-201", "FLD-A1-204", "FLD-A4-102"]);
  });

  it("FLD-A2-101 is pre-filled with the main INCI, the components' INCIs as a fallback", () => {
    const prefill = field("FLD-A2-101").prefill!;
    const row = (inci: string) => ({ id: "c1", inci, fn: "emollient", additive: false, origin: "vegetable" as const, concMin: 1, concMax: 2 });
    expect(prefill({ inci: " Olea Europaea Fruit Oil ", components: [row("Tocopherol")] })).toBe("Olea Europaea Fruit Oil");
    expect(prefill({ inci: "", components: [row("Glycerin"), row(" "), row("Aqua")] })).toBe("Glycerin; Aqua");
    expect(prefill({ inci: "", components: [] })).toBeUndefined();
    expect(field("FLD-A2-101").help).toBe("Pre-filled with the main INCI of this request; change it if needed.");
  });

  it("the code-side properties never enter the questionnaire data (the seed)", () => {
    for (const id of ["FLD-A1-105", "FLD-A1-201", "FLD-A2-101"]) {
      const d = fieldData(field(id)) as unknown as Record<string, unknown>;
      for (const k of ["noJustification", "derivedFrom", "prefill", "hint", "showWhen", "validate"]) expect(d[k], `${id}.${k}`).toBeUndefined();
    }
  });
});

describe("matrix v0.6: metadata questions and rules", () => {
  it("SF-02 and SF-08 are gone: 10 questions, 8 required (SF-05 optional, SF-11 by RMM)", () => {
    expect(CONFIG_QUESTIONS.map((q) => q.code)).toEqual(["SF-01", "SF-03", "SF-04", "SF-05", "SF-06", "SF-07", "SF-09", "SF-10", "SF-12", "SF-11"]);
    expect(REQUIRED_CONFIG).toEqual(["SF01", "SF03", "SF04", "SF06", "SF07", "SF09", "SF10", "SF12"]);
    expect(field("FLD-GEN-005").help).toBe("One production site per CIQ.");
  });

  it("R-80 (palm) is dropped: RS-2026.1 has 24 rules, RS-2026.2 25, none on SF-02 or SF-08", () => {
    expect(RS1.rules).toHaveLength(24);
    expect(RS2.rules).toHaveLength(25);
    expect([...RS2.rules].some((r) => r.id === "R-80" || ["SF02", "SF08"].includes(r.question))).toBe(false);
  });

  it("the Test rules materials carry no SF-02 or SF-08 answer", () => {
    for (const m of REFERENCE_MATERIALS) expect(Object.keys(m.config).filter((k) => k === "SF02" || k === "SF08"), m.id).toEqual([]);
    expect(REFERENCE_MATERIALS.find((m) => m.id === "palm")).toMatchObject({ label: "Palm glycerin (vegetable, EUDR)", config: { SF01: ["vegetable"], SF09: true } });
  });
});
