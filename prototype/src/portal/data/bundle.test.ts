import { describe, expect, it } from "vitest";
import { fieldsOf, templateSections } from "@/domain/catalog";
import { deriveScope } from "@/domain/rules";
import { BUNDLE, BUNDLE_HASH, BUNDLE_JSON } from "./fixtures";
import { bundleHashMatches, canonicalJson, configOf, parseBundle, pinOf } from "./bundle";
import type { RawItem } from "./raw";

const req = (over: Record<string, unknown> = {}): RawItem => ({ _id: "PkR", Config_Bundle_JSON: BUNDLE_JSON, Config_Bundle_Hash: BUNDLE_HASH, ...over });

describe("the pinned configuration bundle (plan v5 §11.3, B-50)", () => {
  it("writes canonical JSON like the sync service: sorted keys, undefined left out", () => {
    expect(canonicalJson({ b: 1, a: [1, { d: undefined, c: "x" }], e: undefined })).toBe('{"a":[1,{"c":"x"}],"b":1}');
  });

  it("checks Config_Bundle_Hash (SHA-256 of the canonical JSON) and notices a tampered bundle", async () => {
    expect(await bundleHashMatches(req())).toBe(true);
    const tampered = JSON.parse(BUNDLE_JSON);
    tampered.ruleSet.rules[0].activates = ["K99"];
    expect(await bundleHashMatches(req({ Config_Bundle_JSON: JSON.stringify(tampered) }))).toBe(false);
    expect(await bundleHashMatches(req({ Config_Bundle_Hash: "" }))).toBeUndefined();
  });

  it("refuses a bundle in an unknown format or without its rules or sections, naming why", () => {
    expect(parseBundle(undefined).problem).toMatch(/no pinned questionnaire version/);
    expect(parseBundle("{not json").problem).toMatch(/not JSON/);
    expect(parseBundle(JSON.stringify({ ...BUNDLE, format: "ciq-bundle/2" })).problem).toMatch(/unknown format/);
    expect(parseBundle(JSON.stringify({ ...BUNDLE, ruleSet: { version: "RS-X" } })).problem).toMatch(/rule set is incomplete/);
    expect(parseBundle(BUNDLE_JSON).bundle?.template.sections.length).toBe(BUNDLE.template.sections.length);
  });

  it("pins each case to its own bundle under content-keyed versions, never the built-in code", () => {
    const pin = pinOf(req());
    expect(pin.templateVersion).toMatch(/^CIQ-2026 v1 #[0-9a-f]{8}$/);
    expect(pin.ruleSetVersion).toMatch(/^RS-2026\.1 #[0-9a-f]{8}$/);
    const cfg = configOf([pin, pinOf(req())]);
    expect(cfg.pairs).toHaveLength(1); // the same bundle twice is one pair
    // the rules carry no basis in the bundle; the engine still runs them
    expect(deriveScope({ SF01: ["animal"] }, pin.ruleSetVersion, pin.templateVersion, cfg).find((s) => s.sectionId === "A2")?.applicability).toBeDefined();
  });

  it("resolves sections and fields from THE BUNDLE: a changed label or a missing section shows as pinned", () => {
    const changed = JSON.parse(BUNDLE_JSON);
    const k1 = changed.template.sections.find((s: { id: string }) => s.id === "K1");
    k1.fields[0].label = "Safety data sheet (pinned wording)";
    changed.template.sections = changed.template.sections.filter((s: { id: string }) => s.id !== "K8.1");
    const pin = pinOf(req({ Config_Bundle_JSON: JSON.stringify(changed) }));
    const cfg = configOf([pin]);
    expect(fieldsOf("K1", pin.templateVersion, cfg)[0].label).toBe("Safety data sheet (pinned wording)");
    expect(templateSections(pin.templateVersion, cfg).some((s) => s.id === "K8.1")).toBe(false);
    // a built-in field keeps its code-side checks by id (validate, showWhen)
    const plain = pinOf(req());
    const pc = configOf([plain]);
    const withChecks = templateSections(plain.templateVersion, pc)
      .flatMap((s) => fieldsOf(s.id, plain.templateVersion, pc))
      .filter((f) => f.validate || f.showWhen);
    expect(withChecks.length).toBeGreaterThan(0);
  });

  it("falls back to the built-in first pair, with the reason, when the request carries no bundle yet", () => {
    const pin = pinOf(req({ Config_Bundle_JSON: "" }));
    expect(pin).toMatchObject({ ruleSetVersion: "RS-2026.1", templateVersion: "CIQ-2026 v1" });
    expect(pin.problem).toMatch(/no pinned questionnaire version/);
    expect(configOf([pin]).pairs).toHaveLength(0);
  });
});
