// Spec §8.4: the configuration editor in the domain. Draft lifecycle, guards (admin only), the §8.2 validation,
// version-scoped fields (a v1/v2 case never sees a v3 field), publishing pins new cases to the new pair, and the
// harness scenario S13 ("the business changes the configuration") step by step. Every step checks the invariants.
import { afterEach, describe, expect, it } from "vitest";
import * as A from "./actions";
import { FIELDS, FIELD_BY_ID, SECTIONS, SECTION_BY_ID, fieldOf, fieldsOf, sectionOf, templateSections } from "./catalog";
import { configVersions, currentPair, draftChanges, draftPair, fieldMark, nextFieldId, nextRuleId, ruleMark, rulesPointingAt, sectionIdFromCode, sectionMark, validateDraft, type FieldInput, type SectionInput } from "./configActions";
import { buildFinalDocument } from "./finalDocument";
import { RULE_SETS, deriveScope, ruleSet, sectionsInTemplate, syncRegistry } from "./rules";
import { buildSeed } from "./seed";
import { completenessBlockers, departmentsForScope } from "./selectors";
import { PLAIN_CONFIG, Scenario } from "./testkit";
import type { AppState } from "./types";

const ADMIN = "u-admin";
const MICRO: SectionInput = { code: "K6.18", title: "Microplastics declaration", kind: "chapter", meaning: "Intentionally added microplastics and the SPM restriction", lead: "SAF", co: [], documentsOnly: false };
const MICRO_YES: FieldInput = { label: "Does the raw material contain intentionally added microplastics?", type: "yesno", required: "mandatory", owner: "SAF" };
const MICRO_FILE: FieldInput = { label: "Microplastics statement", type: "file", required: "optional", owner: "SAF" };
const MICRO_RULE: A.RuleInput = { condition: { kind: "is", question: "SF03", value: true }, activates: ["K6.18"], outcome: "mandatory", departments: ["SAF"], basis: "agreed", note: "Microplastics declaration for polymers." };

/** Runs an action that returns { state, id } as a scenario step; returns the id. */
function withId(sc: Scenario, label: string, fn: (s: AppState, at: string) => { state: AppState; id: string }): string {
  let id = "";
  sc.step(label, (s, at) => {
    const r = fn(s, at);
    id = r.id;
    return r.state;
  });
  return id;
}

/** S13 steps 1–5 as the administrator, from the given scenario's state. */
function microplasticsRelease(sc: Scenario) {
  sc.step("publish the prepared v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH for the Turkey market.", at));
  sc.step("create a new version", (s, at) => A.createDraft(s, ADMIN, "Microplastics declaration", at));
  const sec = withId(sc, "add K6.18", (s, at) => A.upsertSection(s, ADMIN, MICRO, at));
  const f1 = withId(sc, "add the yes/no question", (s, at) => A.upsertField(s, ADMIN, sec, MICRO_YES, at));
  const f2 = withId(sc, "add the file question", (s, at) => A.upsertField(s, ADMIN, sec, MICRO_FILE, at));
  const rule = withId(sc, "add the rule", (s, at) => A.upsertRule(s, ADMIN, MICRO_RULE, at));
  return { sec, f1, f2, rule };
}

afterEach(() => syncRegistry(undefined));

describe("draft lifecycle (spec §8.2)", () => {
  it("the prepared RS-2026.2 + v2 is the draft; createDraft is refused while it is open", () => {
    const sc = new Scenario();
    expect(sc.refused("second draft", (s, at) => A.createDraft(s, ADMIN, "x", at))).toMatch(/RS-2026.2 \+ v2 is still open/);
  });

  it("publishDraft = the earlier 'publish v2' flow; new numbers continue from the newest pair", () => {
    const sc = new Scenario();
    sc.step("publish v2 (earlier button)", (s, at) => A.publishTemplateV2(s, ADMIN, at));
    expect(currentPair(sc.s)).toEqual({ ruleSetVersion: "RS-2026.2", templateVersion: "CIQ-2026 v2" });
    expect(sc.s.activeRuleSet).toBe("RS-2026.2");
    expect(sc.s.templates.map((t) => [t.version, t.status])).toEqual([
      ["CIQ-2026 v1", "published"],
      ["CIQ-2026 v2", "published"],
    ]);
    expect(sc.refused("again", (s, at) => A.publishTemplateV2(s, ADMIN, at))).toMatch(/already published/);
    sc.step("new version", (s, at) => A.createDraft(s, ADMIN, "Next round", at));
    const d = draftPair(sc.s)!;
    expect([d.ruleSet.version, d.template.version, d.basedOn.ruleSetVersion, d.note]).toEqual(["RS-2026.3", "CIQ-2026 v3", "RS-2026.2", "Next round"]);
    expect(d.ruleSet.rules.map((r) => r.id)).toContain("R-111");
    expect(d.template.sections.find((x) => x.id === "K6.3")!.fields.map((f) => f.id)).toEqual(["FLD-6.3-001", "FLD-6.3-002"]);
    expect(draftChanges(sc.s)!.count).toBe(0);
    expect(sc.s.templates.at(-1)).toMatchObject({ version: "CIQ-2026 v3", status: "draft" });
    expect(sc.refused("publish an unchanged draft", (s, at) => A.publishDraft(s, ADMIN, "Nothing", at))).toBe("Nothing to publish: the draft is the same as RS-2026.2 + v2.");
  });

  it("discardDraft drops it; a new draft then reuses the next numbers from the published pair", () => {
    const sc = new Scenario();
    sc.step("discard v2", (s, at) => A.discardDraft(s, ADMIN, at));
    expect(sc.s.config.pairs).toEqual([]);
    expect(sc.s.templates.map((t) => t.version)).toEqual(["CIQ-2026 v1"]);
    expect(sc.refused("discard nothing", (s, at) => A.discardDraft(s, ADMIN, at))).toMatch(/no draft/);
    sc.step("new version", (s, at) => A.createDraft(s, ADMIN, "", at));
    const d = draftPair(sc.s)!;
    expect([d.ruleSet.version, d.template.version]).toEqual(["RS-2026.2", "CIQ-2026 v2"]);
    expect(d.ruleSet.rules.map((r) => r.id)).not.toContain("R-111");
    expect(d.template.sections.map((x) => x.id)).not.toContain("K6.3");
  });

  it("logs every change in the configuration log", () => {
    const sc = new Scenario();
    microplasticsRelease(sc);
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Adds the microplastics declaration.", at));
    expect(sc.s.log.filter((e) => e.kind === "config").map((e) => e.action)).toEqual([
      "Published RS-2026.2 + v2",
      "Created draft",
      "Added section K6.18",
      "Added question to K6.18",
      "Added question to K6.18",
      "Added rule R-122",
      "Published RS-2026.3 + v3",
    ]);
    expect(sc.s.log.find((e) => e.action === "Added rule R-122")!.detail).toContain("If the supplier answers Yes to SF-03 (Polymer), K6.18 becomes mandatory. Reviewed by Safety.");
    expect(sc.s.log.at(-1)!.detail).toContain("1 rule added; 1 section added");
  });
});

describe("guards (admin only, spec §8.4)", () => {
  const others = ["u-rmm", "u-auditor", "u-reg", "u-owner", "u-sup-1"];
  const tries: [string, (s: AppState, by: string) => AppState][] = [
    ["createDraft", (s, by) => A.createDraft(s, by, "x")],
    ["discardDraft", (s, by) => A.discardDraft(s, by)],
    ["upsertRule", (s, by) => A.upsertRule(s, by, { ...MICRO_RULE, activates: ["A5"] }).state],
    ["deleteRule", (s, by) => A.deleteRule(s, by, "R-111")],
    ["upsertSection", (s, by) => A.upsertSection(s, by, MICRO).state],
    ["retireSection", (s, by) => A.retireSection(s, by, "K3")],
    ["upsertField", (s, by) => A.upsertField(s, by, "K6.3", MICRO_FILE).state],
    ["moveField", (s, by) => A.moveField(s, by, "K6.3", "FLD-6.3-002", "up")],
    ["removeField", (s, by) => A.removeField(s, by, "K6.3", "FLD-6.3-001")],
    ["publishDraft", (s, by) => A.publishDraft(s, by, "note")],
    ["publishTemplateV2", (s, by) => A.publishTemplateV2(s, by)],
  ];
  for (const [name, fn] of tries) {
    it(`${name}: refused for everyone but the business administrator`, () => {
      // createDraft needs no open draft; every other action works on the prepared one
      const s = name === "createDraft" ? A.discardDraft(buildSeed(), ADMIN) : buildSeed();
      for (const by of others) {
        const next = fn(s, by);
        expect(A.wasRefused(s, next), `${name} by ${by}`).toBe(true);
        expect(next.config).toBe(s.config);
        expect(next.toasts.at(-1)!.text).toMatch(/business administrator/);
      }
      expect(A.wasRefused(s, fn(s, ADMIN)), `${name} by the admin`).toBe(false);
    });
  }

  it("published pairs never change: every edit goes to the draft only", () => {
    const sc = new Scenario();
    sc.step("publish v2", (s, at) => A.publishDraft(s, ADMIN, "v2", at));
    const v2 = JSON.stringify(sc.s.config.pairs[0]);
    sc.refused("no draft: no edit", (s, at) => A.upsertRule(s, ADMIN, MICRO_RULE, at).state);
    sc.step("draft", (s, at) => A.createDraft(s, ADMIN, "x", at));
    sc.step("edit a copied rule", (s, at) => A.upsertRule(s, ADMIN, { ...ruleSet("RS-2026.3", s.config).rules.find((r) => r.id === "R-40")!, activates: ["A5", "K6.9"] }, at).state);
    sc.step("edit a copied field", (s, at) => A.upsertField(s, ADMIN, "K6.3", { id: "FLD-6.3-001", label: "KKDIK registration no.", type: "text", required: "mandatory", owner: "REG" }, at).state);
    expect(JSON.stringify(sc.s.config.pairs[0])).toBe(v2);
    expect(ruleMark(sc.s, "R-40")).toBe("changed");
    expect(fieldMark(sc.s, "K6.3", "FLD-6.3-001")).toBe("changed");
    expect(sectionMark(sc.s, "K6.3")).toBe("changed");
  });
});

describe("rules in the draft", () => {
  it("new ids continue the R-numbering; the question follows the condition; unchanged saves change nothing", () => {
    const s = buildSeed();
    expect(nextRuleId(s)).toBe("R-122");
    const r = A.upsertRule(s, ADMIN, { condition: { kind: "includes-any", question: "SF11", values: ["CN", "US"] }, activates: ["A13"], outcome: "optional", departments: ["REG"], basis: "not-stated" });
    expect(r.id).toBe("R-122");
    const rule = draftPair(r.state)!.ruleSet.rules.at(-1)!;
    expect(rule.question).toBe("SF11");
    expect(ruleMark(r.state, "R-122")).toBe("new");
    expect(A.upsertRule(r.state, ADMIN, { ...rule }).state).toBe(r.state);
    const rs = ruleSet("RS-2026.2", r.state.config);
    expect(rs.rules.at(-1)!.text).toBe("Target markets include China or USA");
  });

  it("refuses incomplete conditions, unknown sections and rules without a department", () => {
    const s = buildSeed();
    const t = (x: AppState) => x.toasts.at(-1)!.text;
    expect(t(A.upsertRule(s, ADMIN, { ...MICRO_RULE, condition: { kind: "includes-any", question: "SF01", values: [] } }).state)).toMatch(/Tick at least one/);
    expect(t(A.upsertRule(s, ADMIN, { ...MICRO_RULE }).state)).toMatch(/K6.18 is not in questionnaire v2/);
    expect(t(A.upsertRule(s, ADMIN, { ...MICRO_RULE, activates: ["A5"], departments: [] }).state)).toMatch(/at least one department/);
    expect(t(A.upsertRule(s, ADMIN, { ...MICRO_RULE, id: "R-999", activates: ["A5"] }).state)).toMatch(/R-999 is not in the draft/);
  });

  it("deleteRule removes it from the draft only", () => {
    const sc = new Scenario();
    sc.step("delete R-111", (s, at) => A.deleteRule(s, ADMIN, "R-111", at));
    expect(draftChanges(sc.s)!.rules.added).toEqual([]);
    expect(ruleSet("RS-2026.1", sc.s.config).rules).toHaveLength(24);
  });
});

describe("questionnaire in the draft", () => {
  it("section ids come from the code and are unique; new sections go in code order", () => {
    expect([sectionIdFromCode("K6.18"), sectionIdFromCode("Annex 14"), sectionIdFromCode(" annex 15 "), sectionIdFromCode("K 9"), sectionIdFromCode("§"), sectionIdFromCode("")]).toEqual(["K6.18", "A14", "A15", "K9", null, null]);
    const sc = new Scenario();
    withId(sc, "K6.18", (s, at) => A.upsertSection(s, ADMIN, MICRO, at));
    withId(sc, "Annex 14", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, code: "Annex 14", title: "Microplastics data", kind: "annex", documentsOnly: true }, at));
    const ids = draftPair(sc.s)!.template.sections.map((x) => x.id);
    expect(ids.indexOf("K6.18")).toBe(ids.indexOf("K6.17") + 1);
    expect(ids.at(-1)).toBe("A14");
    expect(sc.refused("same id", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, title: "Again" }, at).state)).toBe("K6.18 is already used by “Microplastics declaration” (in this draft). Choose another code.");
    expect(sc.refused("same code on another section", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, id: "A14", code: "K6.18", kind: "annex" }, at).state)).toMatch(/^K6.18 is already used by “Microplastics declaration”/);
    expect(sc.refused("no code", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, code: " " }, at).state)).toMatch(/Enter the section code/);
    expect(sectionMark(sc.s, "K6.18")).toBe("new");
  });

  it("field ids are generated per section; fields move, change and go; documents-only needs no questions", () => {
    const sc = new Scenario();
    withId(sc, "K6.18", (s, at) => A.upsertSection(s, ADMIN, MICRO, at));
    expect(nextFieldId(sc.s, "K6.18")).toBe("FLD-K6.18-001");
    expect(nextFieldId(sc.s, "K1")).toBe("FLD-K1-011");
    const f1 = withId(sc, "q1", (s, at) => A.upsertField(s, ADMIN, "K6.18", MICRO_YES, at));
    const f2 = withId(sc, "q2", (s, at) => A.upsertField(s, ADMIN, "K6.18", MICRO_FILE, at));
    expect([f1, f2]).toEqual(["FLD-K6.18-001", "FLD-K6.18-002"]);
    sc.step("move up", (s, at) => A.moveField(s, ADMIN, "K6.18", f2, "up", at));
    expect(draftPair(sc.s)!.template.sections.find((x) => x.id === "K6.18")!.fields.map((f) => f.id)).toEqual([f2, f1]);
    expect(sc.refused("already first", (s, at) => A.moveField(s, ADMIN, "K6.18", f2, "up", at))).toMatch(/already the first/);
    expect(sc.refused("documents only with questions", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, id: "K6.18", documentsOnly: true }, at).state)).toMatch(/Remove them first/);
    sc.step("remove", (s, at) => A.removeField(s, ADMIN, "K6.18", f1, at));
    sc.step("remove", (s, at) => A.removeField(s, ADMIN, "K6.18", f2, at));
    withId(sc, "documents only", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, id: "K6.18", documentsOnly: true }, at));
    expect(sc.refused("question on documents only", (s, at) => A.upsertField(s, ADMIN, "K6.18", MICRO_YES, at).state)).toMatch(/documents only/);
    expect(nextFieldId(sc.s, "K6.18")).toBe("FLD-K6.18-001");
  });

  it("retiring hides a section for new cases on the version and flags the rules pointing at it; restore brings it back", () => {
    const sc = new Scenario();
    sc.step("retire A13", (s, at) => A.retireSection(s, ADMIN, "A13", at));
    expect(rulesPointingAt(sc.s, "A13")).toEqual(["R-115"]);
    expect(sc.s.toasts.at(-1)!.text).toMatch(/R-115 still points at it/);
    expect(sectionsInTemplate("CIQ-2026 v2", sc.s.config)).not.toContain("A13");
    expect(sectionsInTemplate("CIQ-2026 v1", sc.s.config)).toContain("A13");
    expect(templateSections("CIQ-2026 v2", sc.s.config, true).find((x) => x.id === "A13")!.retired).toBe(true);
    const v = validateDraft(sc.s)!;
    expect(v.ok).toBe(true); // R-115 still switches on K6.4
    expect(v.warnings.map((w) => w.ruleId)).toEqual(["R-115"]);
    expect(sectionMark(sc.s, "A13")).toBe("retired");
    expect(sc.refused("retire GEN", (s, at) => A.retireSection(s, ADMIN, "GEN", at))).toMatch(/cannot be retired/);
    expect(sc.refused("edit a retired section's questions", (s, at) => A.upsertField(s, ADMIN, "A13", MICRO_FILE, at).state)).toMatch(/retired/);
    sc.step("restore", (s, at) => A.restoreSection(s, ADMIN, "A13", at));
    expect(sectionsInTemplate("CIQ-2026 v2", sc.s.config)).toContain("A13");
    expect(draftChanges(sc.s)!.count).toBe(3);
  });

  it("changing owners on the Section owners page keeps the draft in step (no false change, no revert on publish)", () => {
    const sc = new Scenario();
    sc.step("owners", (s, at) => A.setOwnership(s, ADMIN, "K3", "SAF", ["QM"], at));
    expect(draftPair(sc.s)!.template.sections.find((x) => x.id === "K3")).toMatchObject({ lead: "SAF", co: ["QM"] });
    expect(draftChanges(sc.s)!.sections.changed).toEqual([]);
    sc.step("publish", (s, at) => A.publishDraft(s, ADMIN, "v2", at));
    expect(sc.s.ownership.K3).toEqual({ lead: "SAF", co: ["QM"] });
  });
});

describe("validateDraft (spec §8.2 checklist)", () => {
  const failing = (s: AppState) => validateDraft(s)!.checks.filter((c) => !c.ok).map((c) => c.id);

  it("passes for the prepared draft and lists all eight checks in plain words", () => {
    const v = validateDraft(buildSeed())!;
    expect(v.ok).toBe(true);
    expect(v.checks.map((c) => c.id)).toEqual(["has-changes", "rules-switch-on", "sections-have-rule", "no-empty-labels", "choice-options", "number-units", "codes-unique", "sections-have-questions"]);
    expect(v.warnings).toEqual([]);
    expect(validateDraft({ ...buildSeed(), config: { pairs: [] } })).toBeUndefined();
  });

  it("fails each check with a pointer to what to fix, and publishing is blocked until fixed", () => {
    const sc = new Scenario();
    withId(sc, "new section, no rule, no question", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, title: "" }, at));
    expect(failing(sc.s)).toEqual(["sections-have-rule", "no-empty-labels", "sections-have-questions"]);
    withId(sc, "choice with one option", (s, at) => A.upsertField(s, ADMIN, "K6.18", { label: "Form", type: "single", required: "mandatory", owner: "SAF", options: [{ value: "Bead", label: "Bead" }] }, at));
    withId(sc, "number without unit", (s, at) => A.upsertField(s, ADMIN, "K6.18", { label: "", type: "number", required: "optional", owner: "SAF" }, at));
    withId(sc, "rule without effect", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF04", value: true }, activates: [], outcome: "mandatory", departments: ["REG"], basis: "agreed" }, at));
    const v = validateDraft(sc.s)!;
    expect(v.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(["rules-switch-on", "sections-have-rule", "no-empty-labels", "choice-options", "number-units"]);
    expect(v.checks.find((c) => c.id === "rules-switch-on")!.issues).toEqual([{ ruleId: "R-122", text: "R-122 switches on no section and asks for no evidence." }]);
    expect(v.checks.find((c) => c.id === "choice-options")!.issues[0]).toMatchObject({ sectionId: "K6.18", fieldId: "FLD-K6.18-001" });
    expect(v.checks.find((c) => c.id === "sections-have-rule")!.issues[0].text).toMatch(/needs a rule that switches it on/);
    expect(sc.refused("publish blocked", (s, at) => A.publishDraft(s, ADMIN, "Try", at))).toMatch(/cannot be published yet: every rule switches on/);
    // fix everything
    withId(sc, "title", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, id: "K6.18" }, at));
    withId(sc, "options", (s, at) => A.upsertField(s, ADMIN, "K6.18", { id: "FLD-K6.18-001", label: "Form", type: "single", required: "mandatory", owner: "SAF", options: [{ value: "Bead", label: "Bead" }, { value: "Fibre", label: "Fibre" }] }, at));
    withId(sc, "explicitly no unit", (s, at) => A.upsertField(s, ADMIN, "K6.18", { id: "FLD-K6.18-002", label: "Particles per gram", type: "number", required: "optional", owner: "SAF", unit: "" }, at));
    withId(sc, "rule switches K6.18 on", (s, at) => A.upsertRule(s, ADMIN, { id: "R-122", condition: { kind: "is", question: "SF04", value: true }, activates: ["K6.18"], outcome: "mandatory", departments: ["REG"], basis: "agreed" }, at));
    expect(validateDraft(sc.s)!.ok).toBe(true);
    expect(sc.refused("no change note", (s, at) => A.publishDraft(s, ADMIN, "  ", at))).toMatch(/change note/);
    sc.step("publish", (s, at) => A.publishDraft(s, ADMIN, "Microplastics.", at));
  });

  it("a built-in section that no rule switches on any more fails too (deleting R-00, or taking K7 out of R-01)", () => {
    const sc = new Scenario();
    sc.step("delete R-00", (s, at) => A.deleteRule(s, ADMIN, "R-00", at));
    const v = validateDraft(sc.s)!;
    expect(v.ok).toBe(false);
    const issues = v.checks.find((c) => c.id === "sections-have-rule")!.issues;
    expect(issues.map((i) => i.sectionId)).toEqual(expect.arrayContaining(["GEN", "K1"]));
    expect(issues.find((i) => i.sectionId === "GEN")!.text).toMatch(/no new case would get it/);
    expect(sc.refused("publish blocked", (s, at) => A.publishDraft(s, ADMIN, "Try", at))).toMatch(/cannot be published yet: every section is switched on by a rule/);
    const sc2 = new Scenario();
    const r01 = draftPair(sc2.s)!.ruleSet.rules.find((r) => r.id === "R-01")!;
    withId(sc2, "R-01 without K7", (s, at) => A.upsertRule(s, ADMIN, { ...r01, activates: r01.activates.filter((x) => x !== "K7") }, at));
    expect(validateDraft(sc2.s)!.checks.find((c) => c.id === "sections-have-rule")!.issues.map((i) => i.sectionId)).toEqual(["K7"]);
  });

  it("evidence no question collects is information, not a warning: the supplier gets a requested-document slot", () => {
    const sc = new Scenario();
    withId(sc, "rule asking for an unknown document", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF04", value: true }, activates: ["A5"], outcome: "mandatory", evidence: ["Microplastics test report", "SDS"], departments: ["REG"], basis: "agreed" }, at));
    const v = validateDraft(sc.s)!;
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
    expect(v.infos).toEqual([{ ruleId: "R-122", sectionId: "A5", text: "R-122: “Microplastics test report” is not collected by a question yet: the supplier gets an upload slot for it under “Requested documents” in Annex 5." }]);
    withId(sc, "evidence-only rule", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "always" }, activates: [], outcome: "mandatory", evidence: ["Supplier code of conduct", "coa"], departments: ["QM"], basis: "agreed" }, at));
    const v2 = validateDraft(sc.s)!;
    expect(v2.ok).toBe(true);
    // "coa" is the CoA question (case does not matter); the code of conduct goes to K1.
    expect(v2.infos.map((i) => i.text)).toContain("R-123: “Supplier code of conduct” is not collected by a question yet: the supplier gets an upload slot for it under “Requested documents” in K1 (the rule switches on no section).");
    expect(v2.infos).toHaveLength(2);
  });

  it("an e-mail or whole-number question the administrator adds checks its answers, as the question form promises", () => {
    const sc = new Scenario();
    withId(sc, "K6.18", (s, at) => A.upsertSection(s, ADMIN, MICRO, at));
    const mail = withId(sc, "e-mail", (s, at) => A.upsertField(s, ADMIN, "K6.18", { label: "Contact for microplastics", type: "email", required: "optional", owner: "SAF" }, at));
    const count = withId(sc, "number", (s, at) => A.upsertField(s, ADMIN, "K6.18", { label: "Particles per gram", type: "number", required: "optional", owner: "SAF", unit: "" }, at));
    const byId = new Map(fieldsOf("K6.18", "CIQ-2026 v2", sc.s.config).map((f) => [f.id, f]));
    expect(byId.get(mail)!.validate!("not-an-address")).toBe("Not a valid e-mail address");
    expect(byId.get(mail)!.validate!("anna@example.com")).toBeNull();
    expect(byId.get(count)!.validate!(2.5)).toBe("Enter a whole number");
    expect(byId.get(count)!.validate!(3)).toBeNull();
  });

  it("ticking a department or section off and on again is no change", () => {
    const s = buildSeed();
    const d = draftPair(s)!;
    const r10 = d.ruleSet.rules.find((r) => r.id === "R-10")!;
    const flip = { ...r10, departments: [...r10.departments].reverse(), activates: [...r10.activates].reverse() };
    expect(A.upsertRule(s, ADMIN, flip).state).toBe(s); // saving it is no change at all
    const stored: AppState = { ...s, config: { pairs: s.config.pairs.map((p) => (p === d ? { ...p, ruleSet: { ...p.ruleSet, rules: p.ruleSet.rules.map((r) => (r.id === "R-10" ? flip : r)) } } : p)) } };
    expect(draftChanges(stored)!.rules.changed).toEqual([]);
    expect(ruleMark(stored, "R-10")).toBeUndefined();
  });

  it("duplicate section codes fail (e.g. after a code edit)", () => {
    const sc = new Scenario();
    const s = sc.s;
    const d = draftPair(s)!;
    const broken: AppState = { ...s, config: { pairs: [{ ...d, template: { ...d.template, sections: d.template.sections.map((x) => (x.id === "K3" ? { ...x, code: "K4.1" } : x)) } }] } };
    expect(failing(broken)).toEqual(["codes-unique"]);
  });
});

describe("S13 in the domain: the business changes the configuration (spec §8.4)", () => {
  it("publish pins new cases to the new pair; a running case keeps its version and never sees a v3 field", () => {
    const sc = new Scenario();
    // a case started on RS-2026.1 + v1, before anything is published
    sc.create();
    const caseV1 = sc.id;
    const { sec, f1, f2, rule } = microplasticsRelease(sc);
    expect([sec, f1, f2, rule]).toEqual(["K6.18", "FLD-K6.18-001", "FLD-K6.18-002", "R-122"]);
    // a case started on RS-2026.2 + v2 while v3 is still a draft
    sc.create({ materialNo: "RM-500200" });
    const caseV2 = sc.id;
    expect(sc.c).toMatchObject({ ruleSetVersion: "RS-2026.2", templateVersion: "CIQ-2026 v2" });
    expect(draftChanges(sc.s)).toMatchObject({ count: 2, rules: { added: ["R-122"] }, sections: { added: ["K6.18"] } });
    expect(validateDraft(sc.s)!.ok).toBe(true);
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Adds the microplastics declaration (K6.18) for polymers.", at));
    expect(sc.s.toasts.at(-1)!.text).toBe("RS-2026.3 + v3 published. New cases use it; 2 running cases keep the version they started with.");
    expect(currentPair(sc.s)).toEqual({ ruleSetVersion: "RS-2026.3", templateVersion: "CIQ-2026 v3" });
    expect(sc.s.ownership["K6.18"]).toEqual({ lead: "SAF", co: [] });

    // RMM starts a case: it runs on the new pair; the supplier answers SF-03 = Yes and gets K6.18 with both questions
    sc.create({ materialNo: "RM-500300" });
    const caseV3 = sc.id;
    expect(sc.c).toMatchObject({ ruleSetVersion: "RS-2026.3", templateVersion: "CIQ-2026 v3" });
    sc.metadata({ ...PLAIN_CONFIG, SF03: true });
    expect(sc.c.scope.find((x) => x.sectionId === "K6.18")).toMatchObject({ applicability: "mandatory", firedRules: ["R-122"], reason: "Polymer (SF-03) is Yes → R-122" });
    expect(fieldsOf("K6.18", sc.c.templateVersion, sc.s.config).map((f) => [f.id, f.type, f.required])).toEqual([
      [f1, "yesno", "mandatory"],
      [f2, "file", "optional"],
    ]);
    const blockers = completenessBlockers(sc.c, sc.s.config).filter((b) => b.sectionId === "K6.18");
    expect(blockers.map((b) => b.fieldId)).toEqual([f1]); // the mandatory question blocks; the optional file does not
    sc.fillMandatory().confirm();
    expect(departmentsForScope(sc.c.scope, sc.s.ownership)).toContain("SAF");
    sc.completeAll().release();
    const fd = sc.c.finalDocument!;
    expect(fd.header).toMatchObject({ templateVersion: "CIQ-2026 v3", ruleSetVersion: "RS-2026.3" });
    expect(fd.sections.find((x) => x.sectionId === "K6.18")).toMatchObject({ code: "K6.18", title: "Microplastics declaration" });
    expect(fd.sections.find((x) => x.sectionId === "K6.18")!.answers.map((a) => a.fieldId)).toEqual([f1]);

    // the cases started before keep their versions: SF-03 = Yes opens no K6.18 and no v3 field appears
    for (const [id, tpl] of [
      [caseV1, "CIQ-2026 v1"],
      [caseV2, "CIQ-2026 v2"],
    ]) {
      sc.id = id;
      sc.metadata({ ...PLAIN_CONFIG, SF03: true });
      expect(sc.c.templateVersion).toBe(tpl);
      expect(sc.c.scope.map((x) => x.sectionId)).not.toContain("K6.18");
      expect(fieldsOf("K6.18", tpl, sc.s.config)).toEqual([]);
      expect(completenessBlockers(sc.c, sc.s.config).some((b) => b.fieldId?.startsWith("FLD-K6.18"))).toBe(false);
      expect(fieldOf(f1, tpl, sc.s.config)?.id).toBe(f1); // the newest definition, for labels only
    }
    sc.id = caseV1;
    expect(sc.c.scope.map((x) => x.sectionId)).not.toContain("K6.3");

    // the history: version, date, who, change note, cases using it
    const h = configVersions(sc.s);
    expect(h.map((v) => [v.label, v.status, v.statusLabel, v.casesUsing, v.runningCases, v.byName])).toEqual([
      ["RS-2026.3 + v3", "current", "Used for new cases", 1, 0, "Nina Hoffmann"],
      ["RS-2026.2 + v2", "superseded", "Superseded, running cases keep it", 1, 1, "Nina Hoffmann"],
      ["RS-2026.1 + v1", "superseded", "Superseded, running cases keep it", 1, 1, "Nina Hoffmann"],
    ]);
    expect(h[0].changeNote).toBe("Adds the microplastics declaration (K6.18) for polymers.");
    expect(caseV3).not.toBe(caseV2);
  });

  it("is pure: the domain uses the state's config, whatever the registry was synced with", () => {
    const sc = new Scenario();
    microplasticsRelease(sc);
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Microplastics.", at));
    syncRegistry(buildSeed().config); // the registry knows nothing of v3
    expect(SECTION_BY_ID["K6.18"]).toBeUndefined();
    sc.create().metadata({ ...PLAIN_CONFIG, SF03: true });
    expect(completenessBlockers(sc.c, sc.s.config).map((b) => b.fieldId)).toContain("FLD-K6.18-001");
    expect(deriveScope(sc.c.config, "RS-2026.3", "CIQ-2026 v3", sc.s.config).find((x) => x.sectionId === "K6.18")!.applicability).toBe("mandatory");
    expect(buildFinalDocument(sc.s, sc.c, "2026-10-20T00:00:00.000Z", "test").sections.map((x) => x.sectionId)).toContain("K6.18");
  });

  it("the store-synced registry lists admin-created versions, sections and fields, and drops them again", () => {
    const sc = new Scenario();
    microplasticsRelease(sc);
    syncRegistry(sc.s.config);
    // a draft-only section and its fields resolve by id (the editor labels them) but are not listed until published
    expect(SECTION_BY_ID["K6.18"]?.title).toBe("Microplastics declaration");
    expect(FIELD_BY_ID["FLD-K6.18-001"]?.sectionId).toBe("K6.18");
    expect(SECTIONS.map((x) => x.id)).not.toContain("K6.18");
    expect(templateSections("CIQ-2026 v3").map((x) => x.id)).toContain("K6.18");
    expect(RULE_SETS.map((r) => [r.version, r.status])).toEqual([
      ["RS-2026.1", "superseded"],
      ["RS-2026.2", "published"],
      ["RS-2026.3", "draft"],
    ]);
    expect(ruleSet("RS-2026.3").templateVersion).toBe("CIQ-2026 v3");
    expect(fieldsOf("K6.18", "CIQ-2026 v3").map((f) => f.id)).toEqual(["FLD-K6.18-001", "FLD-K6.18-002"]);
    expect(fieldsOf("K6.18", "CIQ-2026 v2")).toEqual([]);
    expect(sectionOf("K6.18", "CIQ-2026 v3")?.hasFields).toBe(true);
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Microplastics.", at));
    syncRegistry(sc.s.config);
    expect(SECTIONS.map((x) => x.id).indexOf("K6.18")).toBe(SECTIONS.map((x) => x.id).indexOf("K6.17") + 1);
    expect(FIELDS.map((f) => f.id)).toContain("FLD-K6.18-002");
    syncRegistry(buildSeed().config);
    expect(SECTION_BY_ID["K6.18"]).toBeUndefined();
    expect(FIELD_BY_ID["FLD-K6.18-001"]).toBeUndefined();
    expect(RULE_SETS.map((r) => r.version)).toEqual(["RS-2026.1", "RS-2026.2"]);
  });

  it("a draft edit of an existing section never leaks into running cases", () => {
    const sc = new Scenario();
    sc.create();
    sc.step("relabel a v2 draft field of K2.3", (s, at) => A.upsertField(s, ADMIN, "K2.3", { id: "FLD-A1-102", label: "Feedstock (plant)", type: "text", required: "mandatory", owner: "RMM" }, at).state);
    syncRegistry(sc.s.config);
    expect(FIELD_BY_ID["FLD-A1-102"].label).toBe("Feedstock (e.g. sunflower, palm, soy)");
    expect(fieldsOf("K2.3", sc.c.templateVersion, sc.s.config).find((f) => f.id === "FLD-A1-102")!.label).toBe("Feedstock (e.g. sunflower, palm, soy)");
    expect(fieldsOf("K2.3", "CIQ-2026 v2", sc.s.config).find((f) => f.id === "FLD-A1-102")!.label).toBe("Feedstock (plant)");
    // an unchanged built-in field is the catalogue's own object, with its checks
    expect(fieldsOf("A1", "CIQ-2026 v2", sc.s.config).find((f) => f.id === "FLD-A1-202")!.showWhen).toBeTypeOf("function");
  });
});
