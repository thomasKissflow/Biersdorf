// Spec §8.1 on the case screens: the supplier questionnaire, the review workspace and the case page resolve sections
// and fields in the case's own questionnaire version. A section the business administrator added (K6.18) and a built-in
// section it renamed (K6.9) show on cases started on the new version only; older cases keep their own definitions.
// The screens read the store-synced registry, so the test syncs it like the store does.
import { afterEach, describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { fieldsOf, sectionOf } from "@/domain/catalog";
import type { FieldInput, SectionInput } from "@/domain/configActions";
import { syncRegistry } from "@/domain/rules";
import { PLAIN_CONFIG, Scenario } from "@/domain/testkit";
import type { AppState } from "@/domain/types";
import { secCode, sectionTarget, secTitle } from "@/features/review/shared";
import { chaptersThenAnnexes, sectionCode as caseSectionCode, sectionTitleIn } from "@/features/rmm/shared";
import { navProgress, sectionLabelOf, sectionMeta, sectionTitle, supplierBlockers, supplierSections } from "./lib";

const ADMIN = "u-admin";
const MICRO: SectionInput = { code: "K6.18", title: "Microplastics declaration", kind: "chapter", meaning: "Intentionally added microplastics and the SPM restriction", lead: "SAF", co: [], documentsOnly: false };
const MICRO_YES: FieldInput = { label: "Does the raw material contain intentionally added microplastics?", type: "yesno", required: "mandatory", owner: "SAF" };
const MICRO_FILE: FieldInput = { label: "Microplastics statement", type: "file", required: "optional", owner: "SAF" };
const MICRO_RULE: A.RuleInput = { condition: { kind: "is", question: "SF03", value: true }, activates: ["K6.18"], outcome: "mandatory", departments: ["SAF"], basis: "agreed" };

function withId(sc: Scenario, label: string, fn: (s: AppState, at: string) => { state: AppState; id: string }): string {
  let id = "";
  sc.step(label, (s, at) => {
    const r = fn(s, at);
    id = r.id;
    return r.state;
  });
  return id;
}

/** S13 steps 1–5, plus a renamed built-in section (K6.9) in the same release. Returns the case ids per version. */
function releaseV3() {
  const sc = new Scenario();
  sc.create().metadata({ ...PLAIN_CONFIG, SF03: true });
  const caseV1 = sc.id;
  sc.step("publish the prepared v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH for the Turkey market.", at));
  sc.step("create a new version", (s, at) => A.createDraft(s, ADMIN, "Microplastics declaration", at));
  const nano = sectionOf("K6.9", "CIQ-2026 v3", sc.s.config)!;
  sc.step("rename K6.9", (s, at) => A.upsertSection(s, ADMIN, { id: nano.id, code: nano.code, title: "Nanomaterials and nanoforms", kind: nano.kind, meaning: nano.meaning, lead: nano.lead, co: nano.co, documentsOnly: nano.documentsOnly }, at).state);
  const sec = withId(sc, "add K6.18", (s, at) => A.upsertSection(s, ADMIN, MICRO, at));
  const f1 = withId(sc, "add the yes/no question", (s, at) => A.upsertField(s, ADMIN, sec, MICRO_YES, at));
  const f2 = withId(sc, "add the file question", (s, at) => A.upsertField(s, ADMIN, sec, MICRO_FILE, at));
  withId(sc, "add the rule", (s, at) => A.upsertRule(s, ADMIN, MICRO_RULE, at));
  sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Adds the microplastics declaration (K6.18) for polymers.", at));
  sc.create({ materialNo: "RM-500300" }).metadata({ ...PLAIN_CONFIG, SF03: true });
  const caseV3 = sc.id;
  syncRegistry(sc.s.config); // what the store does on every commit
  const get = (id: string) => sc.s.cases.find((c) => c.id === id)!;
  return { sc, v1: get(caseV1), v3: get(caseV3), f1, f2 };
}

afterEach(() => syncRegistry(undefined));

describe("case screens resolve sections and fields in the case's version (spec §8.1)", () => {
  it("a new case shows the added section with its questions; the mandatory one blocks completeness", () => {
    const { v3, f1, f2 } = releaseV3();
    expect(v3.templateVersion).toBe("CIQ-2026 v3");
    const sec = supplierSections(v3).find((s) => s.sectionId === "K6.18");
    expect(sec).toMatchObject({ applicability: "mandatory" });
    expect(sectionMeta("K6.18", v3.templateVersion)).toMatchObject({ code: "K6.18", title: "Microplastics declaration", kind: "chapter", hasFields: true });
    expect(sectionLabelOf("K6.18", v3.templateVersion)).toBe("K6.18 · Microplastics declaration");
    expect(fieldsOf("K6.18", v3.templateVersion).map((f) => f.id)).toEqual([f1, f2]);
    expect(navProgress(v3, sec!)).toEqual({ done: 0, total: 1 }); // the optional file does not count
    expect(supplierBlockers(v3).filter((b) => b.sectionId === "K6.18").map((b) => b.fieldId)).toEqual([f1]);
    // review workspace and case page
    expect(secCode("K6.18", v3.templateVersion)).toBe("K6.18");
    expect(sectionTarget("K6.18", v3.templateVersion).ref.label).toBe("K6.18 › Microplastics declaration");
    expect(caseSectionCode("K6.18", v3.templateVersion)).toBe("K6.18");
    expect(sectionTitleIn("K6.18", v3.templateVersion)).toBe("Microplastics declaration");
    expect(chaptersThenAnnexes(["A1", "K6.18", "K1"], v3.templateVersion)).toEqual(["K6.18", "K1", "A1"]);
  });

  it("a case started before the release never shows the added section or its questions", () => {
    const { v1, f1 } = releaseV3();
    expect(v1.templateVersion).toBe("CIQ-2026 v1");
    expect(v1.config.SF03).toBe(true);
    expect(supplierSections(v1).map((s) => s.sectionId)).not.toContain("K6.18");
    expect(fieldsOf("K6.18", v1.templateVersion)).toEqual([]);
    expect(supplierBlockers(v1).some((b) => b.fieldId === f1)).toBe(false);
  });

  it("a renamed built-in section keeps its old title on older cases", () => {
    const { v1, v3 } = releaseV3();
    expect(sectionTitle("K6.9", v1.templateVersion)).toBe("Nanomaterials");
    expect(sectionTitle("K6.9", v3.templateVersion)).toBe("Nanomaterials and nanoforms");
    expect(secTitle("K6.9", v1.templateVersion)).toBe("Nanomaterials");
    expect(secTitle("K6.9", v3.templateVersion)).toBe("Nanomaterials and nanoforms");
    expect(sectionTitleIn("K6.9", v1.templateVersion)).toBe("Nanomaterials");
    // without a version: the newest published definition
    expect(sectionTitle("K6.9")).toBe("Nanomaterials and nanoforms");
  });

  it("unknown versions (the live portal's labels) and unknown ids never throw", () => {
    expect(sectionMeta("K2.1", "").title).toBe("Components and additives");
    expect(sectionMeta("K2.1", "CIQ-2026 v1").title).toBe("Components and additives");
    expect(fieldsOf("GEN", "CIQ-2026 v1").length).toBeGreaterThan(0);
    expect(sectionMeta("NOPE", "CIQ-2026 v1").code).toBe("NOPE");
    expect(secCode("NOPE", "CIQ-2026 v1")).toBe("NOPE");
    expect(caseSectionCode("NOPE")).toBe("NOPE");
  });
});
