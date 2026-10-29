import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { deriveRequestedDocs, sectionUploadRequired } from "@/domain/requestedDocs";
import { UNDEFINED_ORIGINS, deriveScope } from "@/domain/rules";
import { baseState } from "@/domain/seed";
import { bundleHashMatches, configOf, parseBundle, pinOf } from "@/portal/data/bundle";
import { pairRows } from "../write/configRows";
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
    expect(b.ruleSet.rules.length).toBe(24);
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

describe("the document settings of 29 Oct reach the portal (Config_Bundle_JSON)", () => {
  it("sections pass unchanged and rules lose only basis and note, so the portal's own gates see both settings", async () => {
    // a published release with K3 "Upload required? Mandatory" and a rule whose code of conduct is optional
    let s = A.publishDraft(baseState([{ id: "u-admin", name: "Nina Hoffmann", email: "", side: "internal", title: "Business administrator", initials: "NH" }], []), "u-admin", "Turkey REACH.", "2026-10-29T08:00:00.000Z");
    s = A.createDraft(s, "u-admin", "Document requiredness", "2026-10-29T08:01:00.000Z");
    const k3 = s.config.pairs[1]!.template.sections.find((x) => x.id === "K3")!;
    s = A.upsertSection(s, "u-admin", { id: "K3", code: k3.code, title: k3.title, kind: k3.kind, meaning: k3.meaning, lead: k3.lead, co: k3.co, documentsOnly: true, uploads: "mandatory" }, "2026-10-29T08:02:00.000Z").state;
    s = A.upsertRule(s, "u-admin", { condition: { kind: "always" }, activates: [], outcome: "mandatory", evidence: ["Supplier code of conduct", "Additional site certificate"], optionalEvidence: ["Supplier code of conduct"], departments: ["QM"], basis: "agreed", note: "Internal note." }, "2026-10-29T08:03:00.000Z").state;
    s = A.publishDraft(s, "u-admin", "Mandatory K3 upload; optional code of conduct.", "2026-10-29T08:04:00.000Z");
    const p = s.config.pairs.at(-1)!;
    const rows = await pairRows({ ruleSet: p.ruleSet, template: p.template, state: "Published", publishedAt: p.publishedAt, publishedBy: p.publishedBy, changeNote: p.changeNote, basedOn: p.basedOn, note: p.note, createdAt: p.createdAt, createdBy: p.createdBy, undefinedOrigins: [...UNDEFINED_ORIGINS] });
    const f = await caseStartPayload({ release: rows.rel as unknown as Parameters<typeof supplierBundle>[0], contacts, bdfAnswers: {}, markets: ["EU"] });
    const { bundle, problem } = parseBundle(f[CASE_START_FIELDS.configBundle]);
    expect(problem).toBeUndefined();
    expect(bundle!.template.sections.find((x) => x.id === "K3")).toEqual(p.template.sections.find((x) => x.id === "K3"));
    const { basis: _b, note: _n, ...r122 } = p.ruleSet.rules.find((r) => r.id === "R-122")!;
    void _b, void _n;
    expect(bundle!.ruleSet.rules.find((r) => r.id === "R-122")).toEqual(r122);
    expect(r122).toMatchObject({ optionalEvidence: ["Supplier code of conduct"] });
    // the portal's engine on the pinned bundle: K3 needs an upload, the code of conduct is optional
    const pin = pinOf({ _id: "PkReq1", Config_Bundle_JSON: f[CASE_START_FIELDS.configBundle] });
    const cfg = configOf([pin]);
    const config = { SF01: ["vegetable" as const], SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF09: false, SF10: false, SF11: ["EU" as const], SF12: true };
    const scope = deriveScope(config, pin.ruleSetVersion, pin.templateVersion, cfg);
    const c = { config, ruleSetVersion: pin.ruleSetVersion, templateVersion: pin.templateVersion, scope, liveScope: true as const };
    expect(sectionUploadRequired(c, "K3", cfg)).toBe(true);
    expect(deriveRequestedDocs(c, cfg).map((x) => [x.key, !!x.optional])).toEqual([
      ["EV:supplier-code-of-conduct", true],
      ["EV:additional-site-certificate", false],
    ]);
  });
});
