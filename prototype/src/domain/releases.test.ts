// Thomas, 14 Oct: (A) a new section code may not repeat an existing one, however it is written; (B) a rule change can be
// published without a new questionnaire version (and the other way round): only the side that changed gets a new
// number. Every Scenario step also checks the invariants (one draft, cases on published pairs, numbers that only grow).
import { afterEach, describe, expect, it } from "vitest";
import * as A from "./actions";
import { fieldsOf, templateData, templatePairOf } from "./catalog";
import {
  configVersions,
  currentPair,
  draftPair,
  draftSideNames,
  nextVersionNumbers,
  normalizeSectionCode,
  publishPlan,
  sectionCodeDuplicate,
  sectionCodeKey,
  sectionCodeProblem,
  sectionIdFromCode,
  validateDraft,
  type FieldInput,
  type SectionInput,
} from "./configActions";
import { checkInvariants } from "./invariants";
import { RULE_SETS, deriveScope, ruleSet, ruleSetPairOf, ruleSetsOf, syncRegistry } from "./rules";
import { buildSeed } from "./seed";
import { PLAIN_CONFIG, Scenario } from "./testkit";
import type { AppState } from "./types";

const ADMIN = "u-admin";
/** A rules-only change that reaches the plain test material: vegetable origin makes K6.8 (halal, kosher) mandatory. */
const HALAL_RULE: A.RuleInput = { condition: { kind: "includes-any", question: "SF01", values: ["vegetable"] }, activates: ["K6.8"], outcome: "mandatory", departments: ["REG"], basis: "agreed", note: "Halal and kosher status for vegetable origin." };
/** A questionnaire-only change: one more (optional) question in Annex 1. */
const CERT_FIELD: FieldInput = { label: "Certification body of the plantation", type: "text", required: "optional", owner: "SUS" };
const MICRO: SectionInput = { code: "K6.18", title: "Microplastics declaration", kind: "chapter", meaning: "Intentionally added microplastics", lead: "SAF", co: [], documentsOnly: false };

afterEach(() => syncRegistry(undefined));

const withId = (sc: Scenario, label: string, fn: (s: AppState, at: string) => { state: AppState; id: string }): string => {
  let id = "";
  sc.step(label, (s, at) => {
    const r = fn(s, at);
    id = r.id;
    return r.state;
  });
  return id;
};

const kinds = (s: AppState) => configVersions(s).map((v) => [v.label, v.kind, v.status]);

describe("(A) section codes: one normalisation, every version", () => {
  it("compares codes whatever the case, the spaces, leading zeros, a trailing dot, or Annex written as A", () => {
    expect(new Set(["Annex 4", "A4", "annex4", "A 4", " annex 04 ", "ANNEX4."].map(sectionCodeKey))).toEqual(new Set(["a4"]));
    expect(new Set(["K6.1", "k6.1", "K 6.1", "K6.01"].map(sectionCodeKey))).toEqual(new Set(["k6.1"]));
    expect(sectionCodeKey("K6.1")).not.toBe(sectionCodeKey("K6.10"));
    expect(sectionCodeKey("Annex 1")).not.toBe(sectionCodeKey("Annex 10"));
    // stored the usual way; the id follows
    expect(["A 15", "a15", "annex 15", "k 6.20", "K6.21."].map(normalizeSectionCode)).toEqual(["Annex 15", "Annex 15", "Annex 15", "K6.20", "K6.21"]);
    expect(sectionIdFromCode(normalizeSectionCode("a 15"))).toBe("A15");
  });

  it("refuses every way of writing an existing code, in the form and in the domain, with where it is used", () => {
    const s = buildSeed();
    const msg = "Annex 4 is already used by “Hydrocarbons (MOAH)” (in this draft). Choose another code.";
    for (const code of ["Annex 4", "A4", "annex4", "A 4"]) {
      expect(sectionCodeDuplicate(s.config, code), code).toBe(msg);
      const next = A.upsertSection(s, ADMIN, { ...MICRO, code, kind: "annex" }).state;
      expect(A.wasRefused(s, next), code).toBe(true);
      expect(next.toasts.at(-1)!.text).toBe(msg);
    }
    for (const code of ["K6.1", "k6.1"]) expect(A.upsertSection(s, ADMIN, { ...MICRO, code }).state.toasts.at(-1)!.text).toBe("K6.1 is already used by “EU REACH” (in this draft). Choose another code.");
    expect(sectionCodeProblem(s.config, "K6.18")).toBeUndefined();
  });

  it("checks retired, published and built-in sections too, and never an edited section against itself", () => {
    const sc = new Scenario();
    sc.step("retire A13", (s, at) => A.retireSection(s, ADMIN, "A13", at));
    expect(sectionCodeDuplicate(sc.s.config, "a 13")).toBe("Annex 13 is already used by “Chemical inventories” (retired in this draft). Choose another code.");
    // editing: the section's own code passes, another section's does not
    expect(sectionCodeDuplicate(sc.s.config, "k6.3", "K6.3")).toBeUndefined();
    expect(sc.refused("K3 takes K4.1's code", (s, at) => A.upsertSection(s, ADMIN, { id: "K3", code: "k 4.1", title: "Storage", kind: "chapter", meaning: "", lead: "QM", co: [], documentsOnly: true }, at).state)).toBe(
      "K4.1 is already used by “Toxicity data” (in this draft). Choose another code.",
    );
    // a built-in section no version holds any more (the prepared v2 discarded): K6.3 stays taken
    const sc2 = new Scenario();
    sc2.step("discard the prepared v2", (s, at) => A.discardDraft(s, ADMIN, at));
    sc2.step("new draft from v1", (s, at) => A.createDraft(s, ADMIN, "", at));
    expect(sectionCodeDuplicate(sc2.s.config, "K 6.3")).toBe("K6.3 is already used by “Turkey REACH (KKDIK)” (in the built-in catalogue). Choose another code.");
    // a published version: after publishing K6.18, with no draft open
    const sc3 = new Scenario();
    sc3.step("publish v2", (s, at) => A.publishDraft(s, ADMIN, "v2", at));
    sc3.step("draft", (s, at) => A.createDraft(s, ADMIN, "", at));
    withId(sc3, "K6.18", (s, at) => A.upsertSection(s, ADMIN, MICRO, at));
    withId(sc3, "rule", (s, at) => A.upsertRule(s, ADMIN, { ...HALAL_RULE, activates: ["K6.18"] }, at));
    sc3.step("question", (s, at) => A.upsertField(s, ADMIN, "K6.18", { ...CERT_FIELD, owner: "SAF" }, at).state);
    sc3.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Microplastics.", at));
    expect(sectionCodeDuplicate(sc3.s.config, "k6.18")).toBe("K6.18 is already used by “Microplastics declaration” (in published version v3). Choose another code.");
  });

  it("never lets the derived id collide: a section keeps its id when its code changes", () => {
    const sc = new Scenario();
    withId(sc, "K6.18", (s, at) => A.upsertSection(s, ADMIN, MICRO, at));
    withId(sc, "recode it K6.19", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, id: "K6.18", code: "K6.19" }, at));
    expect(draftPair(sc.s)!.template.sections.find((x) => x.id === "K6.18")!.code).toBe("K6.19");
    // "K6.18" is free as a code, but a new section would get the id K6.18: refused
    expect(sc.refused("new K6.18", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, title: "Another" }, at).state)).toBe("K6.18 is already used by “Microplastics declaration” (in this draft). Choose another code.");
    // a new annex written as "a 14" is saved as Annex 14 with the id A14, once
    const id = withId(sc, "a 14", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, code: "a 14", kind: "annex" }, at));
    expect(id).toBe("A14");
    expect(draftPair(sc.s)!.template.sections.find((x) => x.id === "A14")!.code).toBe("Annex 14");
    expect(sc.refused("annex14 again", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, code: "annex14", kind: "annex" }, at).state)).toMatch(/^Annex 14 is already used by/);
  });

  it("the “codes are unique” check uses the same comparison", () => {
    const s = buildSeed();
    const d = draftPair(s)!;
    const broken: AppState = { ...s, config: { pairs: [{ ...d, template: { ...d.template, sections: d.template.sections.map((x) => (x.id === "K3" ? { ...x, code: "A 4" } : x)) } }] } };
    expect(validateDraft(broken)!.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(["codes-unique"]);
  });
});

describe("(B) only the side that changed gets a new version", () => {
  /** From the empty start: publish the prepared RS-2026.2 + v2 (both changed) and start a case on it. */
  function onV2() {
    const sc = new Scenario();
    sc.step("publish the prepared v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
    sc.create({ materialNo: "RM-600002" }).metadata(PLAIN_CONFIG);
    const caseV2 = sc.id;
    return { sc, caseV2 };
  }

  it("nothing changed: nothing to publish, shown as a failing check", () => {
    const { sc } = onV2();
    sc.step("draft", (s, at) => A.createDraft(s, ADMIN, "Next", at));
    const plan = publishPlan(sc.s)!;
    expect(plan).toMatchObject({ kind: "none", label: "RS-2026.2 + v2", text: "Nothing to publish yet: the draft is the same as RS-2026.2 + v2" });
    const v = validateDraft(sc.s)!;
    expect(v.ok).toBe(false);
    expect(v.checks[0]).toMatchObject({ id: "has-changes", ok: false });
    expect(v.checks[0].issues[0].text).toMatch(/^Nothing to publish: the draft is the same as RS-2026.2 \+ v2\./);
    expect(sc.refused("publish", (s, at) => A.publishDraft(s, ADMIN, "Nothing", at))).toBe("Nothing to publish: the draft is the same as RS-2026.2 + v2.");
    // a change and its undo: nothing again
    const rule = withId(sc, "add a rule", (s, at) => A.upsertRule(s, ADMIN, HALAL_RULE, at));
    expect(publishPlan(sc.s)!.kind).toBe("rules");
    sc.step("delete it again", (s, at) => A.deleteRule(s, ADMIN, rule, at));
    expect(publishPlan(sc.s)!.kind).toBe("none");
  });

  it("rules only: RS-2026.3 with questionnaire v2 kept, no new questionnaire version; a new case gets RS-2026.3 + v2", () => {
    const { sc, caseV2 } = onV2();
    sc.step("draft", (s, at) => A.createDraft(s, ADMIN, "Halal and kosher", at));
    expect(nextVersionNumbers(sc.s.config)).toEqual({ ruleSetVersion: "RS-2026.4", templateVersion: "CIQ-2026 v4" }); // the draft holds .3 / v3
    withId(sc, "rule", (s, at) => A.upsertRule(s, ADMIN, HALAL_RULE, at));
    expect(publishPlan(sc.s)).toMatchObject({ kind: "rules", label: "RS-2026.3 + v2", text: "Rules RS-2026.3 (1 change) · questionnaire stays v2", ruleChanges: 1, questionnaireChanges: 0 });
    // the screens name the unchanged questionnaire v2, not the draft's working v3
    expect(draftSideNames(sc.s)).toEqual({
      ruleSet: { working: "RS-2026.3", shown: "RS-2026.3", changed: true },
      template: { working: "CIQ-2026 v3", shown: "CIQ-2026 v2", changed: false },
    });
    expect(configVersions(sc.s)[0]).toMatchObject({ status: "draft", label: "RS-2026.3 + v2", kind: "rules", kindLabel: "Rules only", key: "RS-2026.3" });
    expect(validateDraft(sc.s)!.ok).toBe(true);
    sc.step("publish", (s, at) => A.publishDraft(s, ADMIN, "Halal and kosher status for vegetable origin.", at));

    expect(currentPair(sc.s)).toEqual({ ruleSetVersion: "RS-2026.3", templateVersion: "CIQ-2026 v2" });
    expect(sc.s.activeRuleSet).toBe("RS-2026.3");
    expect(sc.s.toasts.at(-1)!.text).toBe("Rules RS-2026.3 published with questionnaire v2 (unchanged). New cases use RS-2026.3 + v2; 1 running case keeps RS-2026.2 + v2.");
    // no new questionnaire version: the registry lists v2 once and resolves it to the release that brought it
    expect(sc.s.templates.map((t) => [t.version, t.status])).toEqual([
      ["CIQ-2026 v1", "published"],
      ["CIQ-2026 v2", "published"],
    ]);
    const [v2pair, rulesOnly] = sc.s.config.pairs;
    expect(rulesOnly.template).toEqual(v2pair.template);
    expect(templatePairOf(sc.s.config, "CIQ-2026 v2")).toBe(v2pair);
    expect(templateData("CIQ-2026 v3", sc.s.config)).toBeUndefined();
    expect(ruleSetsOf(sc.s.config).map((r) => [r.version, r.status, r.templateVersion])).toEqual([
      ["RS-2026.1", "superseded", "CIQ-2026 v1"],
      ["RS-2026.2", "superseded", "CIQ-2026 v2"],
      ["RS-2026.3", "published", "CIQ-2026 v2"],
    ]);
    expect(kinds(sc.s)).toEqual([
      ["RS-2026.3 + v2", "rules", "current"],
      ["RS-2026.2 + v2", "both", "superseded"],
      ["RS-2026.1 + v1", "first", "superseded"],
    ]);
    const log = sc.s.log.at(-1)!;
    expect([log.action, log.detail.startsWith("Rules only: Halal and kosher status for vegetable origin. (1 rule added). The questionnaire stays v2: no new questionnaire version.")]).toEqual(["Published RS-2026.3 + v2", true]);

    // a new case: RS-2026.3 + v2, and the new rule fires
    sc.create({ materialNo: "RM-600003" }).metadata(PLAIN_CONFIG);
    expect(sc.c).toMatchObject({ ruleSetVersion: "RS-2026.3", templateVersion: "CIQ-2026 v2" });
    expect(sc.c.scope.find((x) => x.sectionId === "K6.8")).toMatchObject({ applicability: "mandatory", firedRules: ["R-122"] });
    // the case started before keeps RS-2026.2 + v2: K6.8 stays optional
    sc.id = caseV2;
    sc.metadata({ ...PLAIN_CONFIG, SF05: ["preservative"] });
    expect(sc.c).toMatchObject({ ruleSetVersion: "RS-2026.2", templateVersion: "CIQ-2026 v2" });
    expect(sc.c.scope.find((x) => x.sectionId === "K6.8")!.applicability).toBe("optional");
    expect(configVersions(sc.s).map((v) => [v.label, v.casesUsing])).toEqual([
      ["RS-2026.3 + v2", 1],
      ["RS-2026.2 + v2", 1],
      ["RS-2026.1 + v1", 0],
    ]);
  });

  it("then questionnaire only: v3 (not v4) with rule set RS-2026.3 kept; numbers stay monotonic per side", () => {
    const { sc } = onV2();
    sc.step("draft", (s, at) => A.createDraft(s, ADMIN, "", at));
    withId(sc, "rule", (s, at) => A.upsertRule(s, ADMIN, HALAL_RULE, at));
    sc.step("publish rules only", (s, at) => A.publishDraft(s, ADMIN, "Halal.", at));
    sc.create({ materialNo: "RM-600032" }).metadata(PLAIN_CONFIG);
    const caseRs3v2 = sc.id;

    sc.step("draft", (s, at) => A.createDraft(s, ADMIN, "Plantation certification", at));
    const d = draftPair(sc.s)!;
    expect([d.ruleSet.version, d.template.version]).toEqual(["RS-2026.4", "CIQ-2026 v3"]);
    // no change yet: both sides keep their published names
    expect(draftSideNames(sc.s)).toEqual({
      ruleSet: { working: "RS-2026.4", shown: "RS-2026.3", changed: false },
      template: { working: "CIQ-2026 v3", shown: "CIQ-2026 v2", changed: false },
    });
    const field = withId(sc, "question", (s, at) => A.upsertField(s, ADMIN, "A1", CERT_FIELD, at));
    // questionnaire only: the rules are named RS-2026.3 (publishing creates no RS-2026.4)
    expect(draftSideNames(sc.s)).toEqual({
      ruleSet: { working: "RS-2026.4", shown: "RS-2026.3", changed: false },
      template: { working: "CIQ-2026 v3", shown: "CIQ-2026 v3", changed: true },
    });
    expect(publishPlan(sc.s)).toMatchObject({ kind: "questionnaire", label: "RS-2026.3 + v3", text: "Questionnaire v3 (1 change) · rules stay RS-2026.3" });
    sc.step("publish", (s, at) => A.publishDraft(s, ADMIN, "Asks for the plantation's certification body.", at));

    expect(currentPair(sc.s)).toEqual({ ruleSetVersion: "RS-2026.3", templateVersion: "CIQ-2026 v3" });
    expect(sc.s.activeRuleSet).toBe("RS-2026.3");
    expect(sc.s.toasts.at(-1)!.text).toBe("Questionnaire v3 published with rules RS-2026.3 (unchanged). New cases use RS-2026.3 + v3; 2 running cases keep the version they started with.");
    // no new rule set: RS-2026.3 is listed once, used for new cases with v3; RS-2026.4 does not exist
    expect(ruleSetsOf(sc.s.config).map((r) => [r.version, r.status, r.templateVersion])).toEqual([
      ["RS-2026.1", "superseded", "CIQ-2026 v1"],
      ["RS-2026.2", "superseded", "CIQ-2026 v2"],
      ["RS-2026.3", "published", "CIQ-2026 v3"],
    ]);
    expect(ruleSetPairOf(sc.s.config, "RS-2026.3")).toBe(sc.s.config.pairs[1]);
    expect(sc.s.config.pairs[2].ruleSet.rules).toEqual(sc.s.config.pairs[1].ruleSet.rules);
    expect(sc.s.templates.map((t) => t.version)).toEqual(["CIQ-2026 v1", "CIQ-2026 v2", "CIQ-2026 v3"]);
    expect(kinds(sc.s)).toEqual([
      ["RS-2026.3 + v3", "questionnaire", "current"],
      ["RS-2026.3 + v2", "rules", "superseded"],
      ["RS-2026.2 + v2", "both", "superseded"],
      ["RS-2026.1 + v1", "first", "superseded"],
    ]);
    expect(configVersions(sc.s).map((v) => [v.key, v.templateKey])).toEqual([
      ["v3", "v3"],
      ["RS-2026.3", "RS-2026.3"],
      ["RS-2026.2", "v2"],
      ["RS-2026.1", "v1"],
    ]);

    // a new case: RS-2026.3 + v3 with the new question; the RS-2026.3 + v2 case does not see it
    sc.create({ materialNo: "RM-600033" }).metadata(PLAIN_CONFIG);
    expect(sc.c).toMatchObject({ ruleSetVersion: "RS-2026.3", templateVersion: "CIQ-2026 v3" });
    expect(fieldsOf("A1", sc.c.templateVersion, sc.s.config).map((f) => f.id)).toContain(field);
    expect(fieldsOf("A1", "CIQ-2026 v2", sc.s.config).map((f) => f.id)).not.toContain(field);
    sc.id = caseRs3v2;
    expect(sc.c).toMatchObject({ ruleSetVersion: "RS-2026.3", templateVersion: "CIQ-2026 v2" });
    // the same rules on both questionnaire versions
    expect(deriveScope(PLAIN_CONFIG, "RS-2026.3", "CIQ-2026 v3", sc.s.config).find((x) => x.sectionId === "K6.8")!.applicability).toBe("mandatory");

    // both changed next: RS-2026.4 + v4
    sc.step("draft", (s, at) => A.createDraft(s, ADMIN, "", at));
    withId(sc, "rule", (s, at) => A.upsertRule(s, ADMIN, { ...HALAL_RULE, activates: ["K6.8", "K6.10"] , id: "R-122" }, at));
    withId(sc, "question", (s, at) => A.upsertField(s, ADMIN, "A1", { ...CERT_FIELD, label: "Plantation certificate number" }, at));
    expect(publishPlan(sc.s)).toMatchObject({ kind: "both", label: "RS-2026.4 + v4", text: "Rules RS-2026.4 (1 change) · questionnaire v4 (1 change)" });
    sc.step("publish both", (s, at) => A.publishDraft(s, ADMIN, "Both.", at));
    expect(sc.s.toasts.at(-1)!.text).toMatch(/^RS-2026.4 \+ v4 published. New cases use it;/);
    expect(kinds(sc.s).map(([label, kind]) => `${label}: ${kind}`)).toEqual(["RS-2026.4 + v4: both", "RS-2026.3 + v3: questionnaire", "RS-2026.3 + v2: rules", "RS-2026.2 + v2: both", "RS-2026.1 + v1: first"]);
    expect(checkInvariants(sc.s)).toEqual([]);
  });

  it("works on top of the built-in first pair too (RS-2026.1 + v1)", () => {
    // questionnaire only → RS-2026.1 + v2
    const sc = new Scenario();
    sc.step("discard the prepared v2", (s, at) => A.discardDraft(s, ADMIN, at));
    sc.step("draft", (s, at) => A.createDraft(s, ADMIN, "", at));
    withId(sc, "question", (s, at) => A.upsertField(s, ADMIN, "A1", CERT_FIELD, at));
    sc.step("publish", (s, at) => A.publishDraft(s, ADMIN, "Questionnaire only.", at));
    expect(currentPair(sc.s)).toEqual({ ruleSetVersion: "RS-2026.1", templateVersion: "CIQ-2026 v2" });
    expect(ruleSetsOf(sc.s.config).map((r) => [r.version, r.status, r.templateVersion])).toEqual([["RS-2026.1", "published", "CIQ-2026 v2"]]);
    expect(ruleSet("RS-2026.1", sc.s.config).rules).toHaveLength(24);
    sc.create().metadata(PLAIN_CONFIG);
    expect(sc.c).toMatchObject({ ruleSetVersion: "RS-2026.1", templateVersion: "CIQ-2026 v2" });

    // rules only → RS-2026.2 + v1; v1 stays the built-in questionnaire
    const sc2 = new Scenario();
    sc2.step("discard the prepared v2", (s, at) => A.discardDraft(s, ADMIN, at));
    sc2.step("draft", (s, at) => A.createDraft(s, ADMIN, "", at));
    withId(sc2, "rule", (s, at) => A.upsertRule(s, ADMIN, HALAL_RULE, at));
    sc2.step("publish", (s, at) => A.publishDraft(s, ADMIN, "Rules only.", at));
    expect(currentPair(sc2.s)).toEqual({ ruleSetVersion: "RS-2026.2", templateVersion: "CIQ-2026 v1" });
    expect(templatePairOf(sc2.s.config, "CIQ-2026 v1")).toBeUndefined();
    expect(sc2.s.templates.map((t) => t.version)).toEqual(["CIQ-2026 v1"]);
    expect(nextVersionNumbers(sc2.s.config)).toEqual({ ruleSetVersion: "RS-2026.3", templateVersion: "CIQ-2026 v2" });
    sc2.create().metadata(PLAIN_CONFIG);
    expect(sc2.c).toMatchObject({ ruleSetVersion: "RS-2026.2", templateVersion: "CIQ-2026 v1" });
    expect(sc2.c.scope.map((x) => x.sectionId)).not.toContain("K6.3");
  });

  it("the store-synced registry lists each version once after one-sided releases", () => {
    const { sc } = onV2();
    sc.step("draft", (s, at) => A.createDraft(s, ADMIN, "", at));
    withId(sc, "rule", (s, at) => A.upsertRule(s, ADMIN, HALAL_RULE, at));
    sc.step("publish", (s, at) => A.publishDraft(s, ADMIN, "Rules only.", at));
    syncRegistry(sc.s.config);
    expect(RULE_SETS.map((r) => r.version)).toEqual(["RS-2026.1", "RS-2026.2", "RS-2026.3"]);
    expect(ruleSet("RS-2026.3").templateVersion).toBe("CIQ-2026 v2");
  });
});
