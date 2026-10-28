// The configuration editor's forms (spec §8.3): the inline checks, and that what the forms send is what the domain
// stores (the S13 microplastics release built through the form models).
import { afterEach, describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { draftPair, validateDraft } from "@/domain/configActions";
import { ruleSetsOf, syncRegistry } from "@/domain/rules";
import { buildSeed } from "@/domain/seed";
import type { AppState } from "@/domain/types";
import { currentRuleSet, nextVersions, pendingDraft, ruleDiff, ruleMarksBetween } from "./config";
import {
  addEvidence,
  conditionOf,
  emptyFieldForm,
  emptyRuleForm,
  emptySectionForm,
  fieldFormOf,
  fieldFormProblems,
  fieldInputOf,
  hasProblems,
  kindFromCode,
  modesFor,
  ruleFormOf,
  ruleFormProblems,
  ruleInputOf,
  sectionCodeDuplicateOf,
  sectionFormProblems,
  sectionInputOf,
  withQuestion,
  withType,
  type RuleForm,
} from "./editorModel";
import { runRegression } from "./regression";

const ADMIN = "u-admin";
afterEach(() => syncRegistry(undefined));

describe("rule form", () => {
  it("offers the comparisons that fit the question", () => {
    expect(modesFor("")).toEqual([]);
    expect(modesFor("ALWAYS")).toEqual(["always"]);
    expect(modesFor("SF03")).toEqual(["is-yes", "is-no", "yes-or-unanswered"]);
    expect(modesFor("SF11")).toEqual(["includes-any", "any-except"]);
  });

  it("a new rule from a section starts with that section and its lead as reviewer; it is not counted as from the requirements document", () => {
    expect(emptyRuleForm(["K6.18"], ["SAF"])).toMatchObject({ activates: ["K6.18"], departments: ["SAF"], basis: "agreed" });
    expect(emptyRuleForm().basis).not.toBe("document");
  });

  it("asks for a question, an answer, a section or evidence, and a department", () => {
    const f = emptyRuleForm();
    expect(ruleFormProblems(f)).toEqual({ question: "Choose the question that switches the rule on.", sections: "Choose at least one section, or ask for evidence.", departments: "Choose at least one department that reviews it." });
    const multi = withQuestion({ ...f, activates: ["A1"], departments: ["SUS"] }, "SF01");
    expect(multi.mode).toBe("includes-any");
    expect(ruleFormProblems(multi).answer).toMatch(/Tick at least one answer of SF-01/);
    expect(hasProblems(ruleFormProblems({ ...multi, values: ["vegetable"] }))).toBe(false);
    // evidence alone is enough
    expect(ruleFormProblems({ ...multi, values: ["vegetable"], activates: [], evidence: ["Pesticide analysis"] })).toEqual({});
  });

  it("does not count a retired section as switched on", () => {
    const f: RuleForm = { ...withQuestion(emptyRuleForm(["K6.3"]), "SF03"), departments: ["REG"] };
    expect(ruleFormProblems(f, new Set(["A1"])).sections).toBeDefined();
    expect(ruleFormProblems(f, new Set(["K6.3"])).sections).toBeUndefined();
  });

  it("builds the declarative condition and round-trips every built-in rule", () => {
    expect(conditionOf({ ...emptyRuleForm(), question: "SF03", mode: "is-no" })).toEqual({ kind: "is", question: "SF03", value: false });
    expect(conditionOf({ ...emptyRuleForm(), question: "SF11", mode: "any-except", values: ["EU"] })).toEqual({ kind: "any-except", question: "SF11", values: ["EU"] });
    const rs = currentRuleSet(ruleSetsOf(buildSeed().config));
    for (const r of rs.rules) {
      const back = ruleInputOf(ruleFormOf(r));
      expect(back.condition).toEqual(r.condition);
      expect(back.activates).toEqual(r.activates);
      expect(back.departments).toEqual(r.departments);
      expect(!!back.flagsCase).toBe(!!r.flagsCase);
    }
  });

  it("switching the question resets the comparison and the ticked answers", () => {
    const f = { ...withQuestion(emptyRuleForm(), "SF01"), values: ["vegetable"] };
    const g = withQuestion(f, "SF04");
    expect([g.mode, g.values]).toEqual(["is-yes", []]);
  });

  it("adds evidence names once", () => {
    expect(addEvidence(["SDS"], " sds ")).toEqual(["SDS"]);
    expect(addEvidence(["SDS"], "  ")).toEqual(["SDS"]);
    expect(addEvidence(["SDS"], "Microplastics test report")).toEqual(["SDS", "Microplastics test report"]);
  });
});

describe("section form", () => {
  const cfg = () => buildSeed().config;
  const draft = () => draftPair(buildSeed())!.template.sections;

  it("suggests the kind from the code", () => {
    expect([kindFromCode("Annex 14"), kindFromCode("annex14"), kindFromCode("A 14"), kindFromCode("a14"), kindFromCode("K6.18")]).toEqual(["annex", "annex", "annex", "annex", "chapter"]);
  });

  it("checks code and title inline", () => {
    expect(sectionFormProblems(emptySectionForm(), cfg())).toEqual({ code: "Enter the section code, e.g. K6.18 or Annex 14.", title: "Enter a title." });
    expect(sectionFormProblems({ ...emptySectionForm(), code: "K6.3", title: "x" }, cfg()).code).toBe("K6.3 is already used by “Turkey REACH (KKDIK)” (in this draft). Choose another code.");
    expect(sectionFormProblems({ ...emptySectionForm(), code: "6/18", title: "x" }, cfg()).code).toMatch(/Use a code like/);
    expect(sectionFormProblems({ ...emptySectionForm(), code: "K6.18", title: "Microplastics declaration" }, cfg())).toEqual({});
  });

  it("flags a duplicate code while typing, written any way, and never compares a section with itself", () => {
    const dup = (code: string, id?: string) => sectionCodeDuplicateOf({ ...emptySectionForm(), code, ...(id ? { id } : {}) }, cfg());
    for (const code of ["Annex 4", "A4", "annex4", "A 4", " annex 04 "]) expect(dup(code), code).toBe("Annex 4 is already used by “Hydrocarbons (MOAH)” (in this draft). Choose another code.");
    for (const code of ["K6.1", "k6.1", "K 6.1"]) expect(dup(code), code).toBe("K6.1 is already used by “EU REACH” (in this draft). Choose another code.");
    expect(dup("K6.10")).toMatch(/^K6.10 is already used by “Listing in pharmacopeia”/);
    expect(dup("general")).toMatch(/^General is already used by “General information”/);
    expect(dup("K6.18")).toBeUndefined();
    expect(dup("")).toBeUndefined();
    // editing: its own code is fine, another section's is not
    expect(dup("k 6.3", "K6.3")).toBeUndefined();
    expect(dup("K6.2", "K6.3")).toMatch(/^K6.2 is already used by “UK REACH”/);
  });

  it("keeps questions before switching a section to documents only", () => {
    const k21 = draft().find((x) => x.id === "K2.1")!;
    expect(sectionFormProblems({ ...emptySectionForm(), id: "K2.1", code: k21.code, title: k21.title, documentsOnly: true }, cfg()).content).toMatch(/still has/);
  });

  it("sends the lead outside the co-reviewers", () => {
    expect(sectionInputOf({ ...emptySectionForm(), code: " K6.18 ", title: " T ", lead: "SAF", co: ["SAF", "REG"] })).toMatchObject({ code: "K6.18", title: "T", lead: "SAF", co: ["REG"] });
  });

  it("writes codes the usual way (k6.19 → K6.19, K 6.20 → K6.20, annex 14 / A 14 → Annex 14) and catches a clash written differently", () => {
    expect(["k6.19", "K 6.20", " annex  14 ", "A 14", "a14", "K6.21.", "Annex 12", "GEN", "K6.16.1"].map((code) => sectionInputOf({ ...emptySectionForm(), code, title: "T" }).code)).toEqual(["K6.19", "K6.20", "Annex 14", "Annex 14", "Annex 14", "K6.21", "Annex 12", "GEN", "K6.16.1"]);
    expect(sectionFormProblems({ ...emptySectionForm(), code: "k 6.17", title: "T" }, cfg()).code).toMatch(/already used/);
  });
});

describe("question form", () => {
  it("starts a choice type with two options and needs both", () => {
    const f = withType(emptyFieldForm("SAF"), "single");
    expect(f.options).toHaveLength(2);
    expect(fieldFormProblems({ ...f, label: "Q" }).options).toBe("Give at least 2 options.");
    expect(fieldFormProblems({ ...f, label: "Q", options: [{ label: "A" }, { label: "a" }] }).options).toBe("Two options have the same text.");
    expect(fieldFormProblems({ ...f, label: "Q", options: [{ label: "A" }, { label: "B" }] })).toEqual({});
  });

  it("asks a number for its unit, or “No unit”", () => {
    const f = { ...withType(emptyFieldForm("QM"), "number"), label: "Water content" };
    expect(fieldFormProblems(f).unit).toBeDefined();
    expect(fieldInputOf({ ...f, noUnit: true }).unit).toBe("");
    expect(fieldInputOf({ ...f, unit: " % " }).unit).toBe("%");
  });

  it("keeps the stored value of existing options", () => {
    const f = fieldFormOf({ id: "F", label: "Q", type: "single", required: "mandatory", options: [{ value: "v1", label: "One" }], owner: "REG" });
    expect(fieldInputOf({ ...f, options: [...f.options, { label: "Two" }] }).options).toEqual([
      { value: "v1", label: "One" },
      { value: "", label: "Two" },
    ]);
  });
});

describe("the editor's forms build the S13 release", () => {
  it("a section, two questions and a rule from the forms pass the checks and publish", () => {
    let s: AppState = buildSeed();
    s = A.publishDraft(s, ADMIN, "Turkey REACH.");
    expect(nextVersions(s.config).label).toBe("RS-2026.3 + v3");
    s = A.createDraft(s, ADMIN, "Microplastics");
    const sec = A.upsertSection(s, ADMIN, sectionInputOf({ ...emptySectionForm(), code: "K6.18", title: "Microplastics declaration", lead: "SAF" }));
    expect(sec.id).toBe("K6.18");
    s = sec.state;
    s = A.upsertField(s, ADMIN, "K6.18", fieldInputOf({ ...withType(emptyFieldForm("SAF"), "yesno"), label: "Contains microplastics?" })).state;
    s = A.upsertField(s, ADMIN, "K6.18", fieldInputOf({ ...withType(emptyFieldForm("SAF"), "file"), label: "Microplastics statement", required: "optional" })).state;
    expect(validateDraft(s)!.checks.find((c) => c.id === "sections-have-rule")!.ok).toBe(false);
    const rule: RuleForm = { ...withQuestion(emptyRuleForm(["K6.18"]), "SF03"), departments: ["SAF"] };
    expect(ruleFormProblems(rule)).toEqual({});
    const r = A.upsertRule(s, ADMIN, ruleInputOf(rule));
    expect(r.id).toBe("R-122");
    s = r.state;
    expect(validateDraft(s)!.ok).toBe(true);

    // Test the draft: only the polymer reference material gets K6.18, explained by R-122.
    const sets = ruleSetsOf(s.config);
    const rows = runRegression(currentRuleSet(sets), pendingDraft(sets)!, "new-request", s.config);
    const changed = rows.filter((x) => x.changed);
    expect(changed.map((x) => x.m.id)).toEqual(["acrylate"]);
    expect(changed[0]).toMatchObject({ expected: true, firing: ["R-122"] });
    expect(changed[0].diff.added).toEqual(["K6.18"]);
    // running cases keep their own version
    expect(runRegression(currentRuleSet(sets), pendingDraft(sets)!, "pinned", s.config).filter((x) => x.changed)).toEqual([]);

    s = A.publishDraft(s, ADMIN, "Microplastics declaration for polymers.");
    expect(s.activeRuleSet).toBe("RS-2026.3");
    expect(pendingDraft(ruleSetsOf(s.config))).toBeUndefined();
  });
});

describe("rule changes between versions", () => {
  it("compares rules whatever the key order, and finds added, changed and removed ones", () => {
    const sets = ruleSetsOf(buildSeed().config);
    const [rs1, rs2] = sets;
    expect(ruleDiff(rs1.rules, rs2.rules)).toEqual({ added: ["R-111"], changed: [], removed: [] });
    const reordered = rs1.rules.map((r) => ({ ...r, departments: [...r.departments].reverse() }));
    expect(ruleDiff(rs1.rules, reordered)).toEqual({ added: [], changed: [], removed: [] });
    const edited = rs1.rules.slice(1).map((r, i) => (i === 0 ? { ...r, outcome: "optional" as const } : r));
    const d = ruleDiff(rs1.rules, edited);
    expect(d.removed).toEqual([rs1.rules[0].id]);
    expect(d.changed).toEqual([rs1.rules[1].id]);
    expect(ruleMarksBetween(rs1.rules, rs2.rules).get("R-111")).toBe("new");
  });
});
