// Spec §8.4: the condition evaluator and the plain-language text builder.
import { describe, expect, it } from "vitest";
import { CONDITION_QUESTIONS, conditionKindsFor, conditionProblem, conditionText, defaultCondition, evaluateCondition, ruleSentence, sectionsText } from "./conditions";
import { hydrateRule } from "./rules";
import type { RuleCondition } from "./types";

describe("evaluateCondition", () => {
  it("always", () => {
    expect(evaluateCondition({ kind: "always" }, {})).toBe(true);
  });

  it("includes-any: true when one ticked value is answered; never for an unanswered question", () => {
    const c: RuleCondition = { kind: "includes-any", question: "SF01", values: ["waste", "ccu"] };
    expect(evaluateCondition(c, { SF01: ["vegetable", "ccu"] })).toBe(true);
    expect(evaluateCondition(c, { SF01: ["vegetable"] })).toBe(false);
    expect(evaluateCondition(c, { SF01: [] })).toBe(false);
    expect(evaluateCondition(c, {})).toBe(false);
  });

  it("any-except: true when any answered value is outside the list", () => {
    const c: RuleCondition = { kind: "any-except", question: "SF11", values: ["EU"] };
    expect(evaluateCondition(c, { SF11: ["EU"] })).toBe(false);
    expect(evaluateCondition(c, { SF11: ["EU", "TR"] })).toBe(true);
    expect(evaluateCondition(c, { SF11: ["OTHER"] })).toBe(true);
    expect(evaluateCondition(c, {})).toBe(false);
  });

  it("is Yes / is No: only that exact answer", () => {
    expect(evaluateCondition({ kind: "is", question: "SF03", value: true }, { SF03: true })).toBe(true);
    expect(evaluateCondition({ kind: "is", question: "SF03", value: true }, { SF03: false })).toBe(false);
    expect(evaluateCondition({ kind: "is", question: "SF03", value: true }, {})).toBe(false);
    expect(evaluateCondition({ kind: "is", question: "SF12", value: false }, { SF12: false })).toBe(true);
    expect(evaluateCondition({ kind: "is", question: "SF12", value: false }, {})).toBe(false);
  });

  it("yes-or-unanswered: everything but No", () => {
    const c: RuleCondition = { kind: "yes-or-unanswered", question: "SF12" };
    expect([evaluateCondition(c, { SF12: true }), evaluateCondition(c, {}), evaluateCondition(c, { SF12: false })]).toEqual([true, true, false]);
  });
});

describe("conditionText (plain sentences)", () => {
  it.each<[RuleCondition, string]>([
    [{ kind: "always" }, "Every case"],
    [{ kind: "includes-any", question: "SF01", values: ["vegetable"] }, "Origin includes Vegetable"],
    [{ kind: "includes-any", question: "SF01", values: ["waste", "ccu", "chemrec"] }, "Origin includes Waste, CCU or Chemical recycling"],
    [{ kind: "includes-any", question: "SF11", values: ["UK"] }, "Target markets include United Kingdom"],
    [{ kind: "includes-any", question: "SF05", values: ["colorant"] }, "Material type includes Colorant"],
    [{ kind: "any-except", question: "SF11", values: ["EU"] }, "Any target market outside the EU"],
    [{ kind: "any-except", question: "SF01", values: ["vegetable", "animal"] }, "Any origin other than Vegetable or Animal"],
    [{ kind: "is", question: "SF03", value: true }, "Polymer (SF-03) is Yes"],
    [{ kind: "is", question: "SF12", value: false }, "Microbiological test required (SF-12) is No"],
    [{ kind: "yes-or-unanswered", question: "SF12" }, "Microbiological test required (SF-12) is Yes or not answered"],
  ])("%j → %s", (cond, text) => {
    expect(conditionText(cond)).toBe(text);
  });

  it("every built-in rule reads as a sentence without codes like 'SF-01 ='", () => {
    for (const q of CONDITION_QUESTIONS) {
      const t = conditionText(defaultCondition(q.id));
      expect(t).not.toMatch(/undefined|\[object/);
    }
  });
});

describe("ruleSentence (the rule form's live preview)", () => {
  it("reads the spec's example", () => {
    const r = { condition: { kind: "includes-any", question: "SF01", values: ["vegetable"] } as RuleCondition, activates: ["A1", "A2", "A9"], outcome: "mandatory" as const, evidence: ["Pesticide analysis"], departments: ["SUS" as const] };
    expect(ruleSentence(r)).toBe("If the origin includes Vegetable, Annex 1, 2 and 9 become mandatory. The supplier uploads Pesticide analysis. Reviewed by Sustainability.");
  });

  it("one section, a yes/no question, several departments", () => {
    const r = { condition: { kind: "is", question: "SF03", value: true } as RuleCondition, activates: ["K6.18"], outcome: "mandatory" as const, departments: ["SAF" as const, "REG" as const] };
    expect(ruleSentence(r, (id) => id)).toBe("If the supplier answers Yes to SF-03 (Polymer), K6.18 becomes mandatory. Reviewed by Safety and Regulatory.");
    expect(ruleSentence(r, (id) => id, (id) => (id === "K6.18" ? "Microplastics declaration" : undefined))).toBe("If the supplier answers Yes to SF-03 (Polymer), K6.18 Microplastics declaration becomes mandatory. Reviewed by Safety and Regulatory.");
  });

  it("evidence-only, flag-only, nothing yet, every case, not applicable", () => {
    expect(ruleSentence({ condition: { kind: "includes-any", question: "SF01", values: ["animal"] }, activates: [], outcome: "mandatory", evidence: ["BSE/TSE certificate"], departments: ["REG"] })).toBe("If the origin includes Animal, the supplier uploads BSE/TSE certificate. Reviewed by Regulatory.");
    expect(ruleSentence({ condition: { kind: "includes-any", question: "SF01", values: ["ccu"] }, activates: [], outcome: "mandatory", departments: ["RMM"], flagsCase: true })).toBe("If the origin includes CCU, the case is flagged in RMM's review. Reviewed by RMM.");
    expect(ruleSentence({ condition: { kind: "always" }, activates: [], outcome: "mandatory", departments: [] })).toMatch(/^For every case, nothing changes yet/);
    expect(ruleSentence({ condition: { kind: "always" }, activates: ["K6.8", "K8.1"], outcome: "optional", departments: ["REG", "LEG"] })).toBe("For every case, K6.8 and K8.1 become optional. Reviewed by Regulatory and Legal.");
    expect(ruleSentence({ condition: { kind: "is", question: "SF12", value: false }, activates: ["K5.1"], outcome: "na", departments: ["MIC"] })).toBe("If the supplier answers No to SF-12 (Microbiological test required), K5.1 becomes not applicable. Reviewed by Microbiology.");
    expect(ruleSentence({ condition: { kind: "yes-or-unanswered", question: "SF12" }, activates: ["K5.1"], outcome: "mandatory", departments: ["MIC"] })).toBe("If the supplier answers Yes to SF-12 (Microbiological test required), or has not answered it yet, K5.1 becomes mandatory. Reviewed by Microbiology.");
  });

  it("groups annexes only when all are annexes", () => {
    expect(sectionsText(["A1", "A2", "A9"])).toBe("Annex 1, 2 and 9");
    expect(sectionsText(["A1", "A6", "K4.3"])).toBe("Annex 1, Annex 6 and K4.3");
    expect(sectionsText(["K4.3", "A6"])).toBe("K4.3 and Annex 6");
    expect(sectionsText(["A5"])).toBe("Annex 5");
    expect(sectionsText([])).toBe("");
  });
});

describe("conditionProblem and the form's choices", () => {
  it("multi-choice questions take includes-any / any-except, yes/no questions is / yes-or-unanswered", () => {
    expect(conditionKindsFor("SF01")).toEqual(["includes-any", "any-except"]);
    expect(conditionKindsFor("SF03")).toEqual(["is", "yes-or-unanswered"]);
    expect(conditionKindsFor("ALWAYS")).toEqual(["always"]);
    expect(CONDITION_QUESTIONS[0].id).toBe("ALWAYS");
    expect(CONDITION_QUESTIONS).toHaveLength(11); // "Every case" and the 10 metadata questions (SF-02 and SF-08 dropped on 28 Oct)
  });

  it("refuses incomplete or mismatched conditions", () => {
    expect(conditionProblem({ kind: "always" })).toBeNull();
    expect(conditionProblem({ kind: "includes-any", question: "SF01", values: [] })).toMatch(/Tick at least one/);
    expect(conditionProblem({ kind: "includes-any", question: "SF01", values: ["plastic"] })).toMatch(/no answer “plastic”/);
    expect(conditionProblem({ kind: "is", question: "SF01", value: true })).toMatch(/multiple-choice/);
    expect(conditionProblem({ kind: "includes-any", question: "SF03", values: ["x"] })).toMatch(/yes\/no/);
    expect(conditionProblem({ kind: "any-except", question: "SF05", values: ["colorant", "preservative"] })).toMatch(/unticked/);
    expect(conditionProblem({ kind: "is", question: "SF03", value: false })).toBeNull();
  });

  it("a hydrated rule carries its check and sentence", () => {
    const r = hydrateRule({ id: "R-1", question: "SF04", condition: { kind: "is", question: "SF04", value: true }, activates: ["A5"], outcome: "mandatory", departments: ["REG"], basis: "document" });
    expect(r.text).toBe("UV filter (SF-04) is Yes");
    expect([r.when({ SF04: true }), r.when({ SF04: false })]).toEqual([true, false]);
  });
});
