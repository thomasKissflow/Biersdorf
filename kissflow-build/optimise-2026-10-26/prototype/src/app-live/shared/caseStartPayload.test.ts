import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundleHashMatches, parseBundle } from "@/portal/data/bundle";
import { CASE_START_FIELDS, caseStartPayload, supplierBundle } from "./caseStartPayload";

// the live Release row, exactly as the config seed wrote it (kissflow-build/config-seed/rows)
const row = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../kissflow-build/config-seed/rows/${f}`, import.meta.url)), "utf8"));
const REL1 = row("REL_RS-2026.1_+_v1.json");
const contacts = [
  { portalUserId: "UsElena", name: "Elena Márquez", email: "elena@solvaro.example", title: "Regulatory Affairs", mayConfirm: true },
  { portalUserId: "UsRavi", name: "Ravi Menon", email: "ravi@solvaro.example", title: "QA", mayConfirm: false },
  { name: "No Portal Yet", email: "new@solvaro.example", mayConfirm: true },
  { portalUserId: "UsOld", name: "Former", email: "old@solvaro.example", mayConfirm: true, active: false },
];

describe("caseStartPayload (the CIQ Case Start fields I-1 copies to the portal)", () => {
  it("builds a bundle the portal parses, with the fingerprint the portal checks", async () => {
    const f = await caseStartPayload({ release: REL1, contacts, bdfAnswers: { "FLD-GEN-001": "OLIVIA Pure 100", "FLD-GEN-002": "Solvaro S.A.", "FLD-GEN-003": "123456789", "FLD-GEN-008": "elena@solvaro.example" }, markets: ["EU", "UK"] });
    const { bundle, problem } = parseBundle(f[CASE_START_FIELDS.configBundle]);
    expect(problem).toBeUndefined();
    expect(bundle?.release).toMatchObject({ ruleSetVersion: "RS-2026.1", templateVersion: "CIQ-2026 v1", key: REL1.Release_Key });
    expect(bundle?.template.sections.length).toBe(44);
    expect(await bundleHashMatches({ _id: "x", Config_Bundle_JSON: f[CASE_START_FIELDS.configBundle], Config_Bundle_Hash: f[CASE_START_FIELDS.configBundleHash] })).toBe(true);
  });

  it("is supplier-safe: no rule basis or note leaves Beiersdorf", () => {
    const b = supplierBundle(REL1);
    expect(b.ruleSet.rules.length).toBe(25);
    expect(b.ruleSet.rules.some((r) => "basis" in r || "note" in r)).toBe(false);
    expect(JSON.stringify(b)).not.toMatch(/"basis"|"note"/);
  });

  it("assigns only active contacts with a portal user; every contact is listed with may-confirm", async () => {
    const f = await caseStartPayload({ release: REL1, contacts, bdfAnswers: {}, markets: [] });
    expect(JSON.parse(f[CASE_START_FIELDS.portalAssignees])).toEqual([{ _id: "UsElena" }, { _id: "UsRavi" }]);
    expect(f[CASE_START_FIELDS.releaseAssignees]).toBe(f[CASE_START_FIELDS.portalAssignees]);
    const listed = JSON.parse(f[CASE_START_FIELDS.caseContacts]);
    expect(listed.map((k: { name: string }) => k.name)).toEqual(["Elena Márquez", "Ravi Menon", "No Portal Yet"]);
    expect(listed[1]).toMatchObject({ id: "UsRavi", mayConfirm: false, title: "QA" });
  });

  it("sets the Beiersdorf values the portal shows locked, and nothing else", async () => {
    const f = await caseStartPayload({ release: REL1, contacts, bdfAnswers: { "FLD-GEN-001": "OLIVIA Pure 100", "FLD-K1-001": "not mine" }, markets: ["EU"] });
    expect(JSON.parse(f[CASE_START_FIELDS.bdfSet])).toEqual({ "FLD-GEN-001": "OLIVIA Pure 100", "FLD-GEN-002": null, "FLD-GEN-003": null, "FLD-GEN-008": null, "FLD-GEN-009": null, SF11: ["EU"] });
  });

  it("refuses when nobody could get the task, or the release is unusable", async () => {
    await expect(caseStartPayload({ release: REL1, contacts: [{ name: "x", email: "x@y.z", mayConfirm: true }], bdfAnswers: {}, markets: [] })).rejects.toThrow(/portal user/);
    expect(() => supplierBundle({ Release_Bundle_JSON: "{not json" })).toThrow(/not valid JSON/);
    expect(() => supplierBundle({ Release_Bundle_JSON: { ruleSet: { version: "RS-X" }, template: { version: "v9", sections: [] } } })).toThrow(/no sections/);
  });
});
