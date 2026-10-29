// Thomas, 29 Oct: the business administrator sets documents Mandatory or Optional, in both places. (1) A documents-only
// section's "Upload required?": Mandatory blocks completeness and the release of a case the section is mandatory for,
// until a file is in the section or a "Cannot provide" justification (key DOC:<id>) is given. (2) Each document a rule
// asks for: an optional one (RuleData.optionalEvidence) never blocks; the stricter rule wins; after the completeness
// confirmation the stored list keeps the flag and it only tightens (never mandatory → optional). Absent settings are
// today's behaviour, so stored versions and running cases are unchanged.
// Every step checks the invariants (Scenario).
import { afterEach, describe, expect, it } from "vitest";
import * as A from "./actions";
import { builtinTemplateData } from "./catalog";
import { draftChanges, draftPair, sectionMark, type SectionInput } from "./configActions";
import { ruleSentence } from "./conditions";
import { buildFinalDocument } from "./finalDocument";
import {
  deriveRequestedDocs,
  isOptionalEvidence,
  isSectionUploadKey,
  requestedDocuments,
  requestedStatusLabel,
  sectionUploadKey,
  sectionUploadRequired,
  sectionUploadStatus,
  slotBlocks,
  storableSlots,
  uncollectedEvidence,
  uncollectedText,
  uploadKeySection,
} from "./requestedDocs";
import { syncRegistry } from "./rules";
import { completenessBlockers, fieldLabel, releaseBlockers, sectionProgress, sectionsChangedSince } from "./selectors";
import { PLAIN_CONFIG, Scenario } from "./testkit";
import type { AppState, CiqCase, SectionData } from "./types";

const ADMIN = "u-admin";
const SUP = "u-sup-1";
const COC = "Supplier code of conduct";
const SITE = "Additional site certificate";
const POLY = "Polymer statement";
const K_COC = "EV:supplier-code-of-conduct";
const K_SITE = "EV:additional-site-certificate";
const K_POLY = "EV:polymer-statement";
const K3_UPLOAD = "DOC:K3";
const K3_NAME = "Documents for K3 · Storage conditions and handling";
const POLYMER = { ...PLAIN_CONFIG, SF03: true };
const JUST = "We do not issue a storage statement per raw material; see the SDS, section 7.";

afterEach(() => syncRegistry(undefined));

const draftSection = (s: AppState, id: string) => draftPair(s)!.template.sections.find((x) => x.id === id)!;
/** The section form's input for a draft section, with another "Upload required?" and content when given. */
const inputOf = (x: SectionData, patch: Partial<SectionInput> = {}): SectionInput => ({ id: x.id, code: x.code, title: x.title, kind: x.kind, meaning: x.meaning, lead: x.lead, co: [...x.co], documentsOnly: x.documentsOnly, ...patch });
const setSection = (sc: Scenario, id: string, patch: Partial<SectionInput>) => sc.step(`section ${id}`, (s, at) => A.upsertSection(s, ADMIN, inputOf(draftSection(s, id), patch), at).state);
const blockerIds = (sc: Scenario) => completenessBlockers(sc.c, sc.s.config).map((b) => b.fieldId);
const slot = (sc: Scenario, key: string) => requestedDocuments(sc.c, sc.s.config).find((x) => x.key === key);

/**
 * As the administrator: publish the prepared v2, start a case on it (`old`), then publish RS-2026.3 + v3 with
 * K3 (mandatory for every case) and K8.1 (optional for every case) set to "Upload required? Mandatory", and three rules
 * asking for documents no question collects: R-122 (every case: the code of conduct, optional, and the site
 * certificate, mandatory), R-123 (SF-03 Yes: the code of conduct, mandatory) and R-124 (SF-03 Yes: a polymer statement,
 * optional). Returns the old case's id.
 */
function release(sc: Scenario): string {
  sc.step("publish the prepared v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
  sc.create({ materialNo: "RM-500900" }).metadata(PLAIN_CONFIG);
  const old = sc.id;
  sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "Document requiredness", at));
  setSection(sc, "K3", { uploads: "mandatory" });
  setSection(sc, "K8.1", { uploads: "mandatory" });
  sc.step("R-122", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "always" }, activates: [], outcome: "mandatory", evidence: [COC, SITE], optionalEvidence: ["  supplier CODE of conduct "], departments: ["QM"], basis: "agreed" }, at).state);
  sc.step("R-123", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF03", value: true }, activates: [], outcome: "mandatory", evidence: [COC], departments: ["QM"], basis: "agreed" }, at).state);
  sc.step("R-124", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF03", value: true }, activates: [], outcome: "mandatory", evidence: [POLY], optionalEvidence: [POLY], departments: ["SAF"], basis: "agreed" }, at).state);
  sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Mandatory uploads for K3 and K8.1; optional documents.", at));
  return old;
}

describe("documents-only sections: “Upload required?” (spec §8.1, Thomas 29 Oct)", () => {
  it("the built-in sections keep their optional upload: nothing stored, nothing blocks", () => {
    for (const v of ["CIQ-2026 v1", "CIQ-2026 v2"]) expect(builtinTemplateData(v).sections.some((x) => "uploads" in x), v).toBe(false);
    const sc = new Scenario();
    sc.step("publish v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
    sc.create().metadata(PLAIN_CONFIG);
    expect(sc.c.scope.find((x) => x.sectionId === "K3")?.applicability).toBe("mandatory");
    expect(sectionUploadRequired(sc.c, "K3", sc.s.config)).toBe(false);
    expect(sectionProgress(sc.c, "K3", sc.s.config)).toEqual({ done: 0, total: 0 });
    expect(blockerIds(sc).some(isSectionUploadKey)).toBe(false);
  });

  it("the draft stores it as “mandatory” only, shows it as a change, and switching back is no change", () => {
    const sc = new Scenario();
    sc.step("publish v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
    sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "Uploads", at));
    setSection(sc, "K3", { uploads: "mandatory" });
    expect(draftSection(sc.s, "K3").uploads).toBe("mandatory");
    expect(draftChanges(sc.s)).toMatchObject({ count: 1, sections: { changed: ["K3"] } });
    expect(sectionMark(sc.s, "K3")).toBe("changed");
    expect(sc.s.log.at(-1)).toMatchObject({ action: "Changed section K3" });
    expect(sc.s.log.at(-1)!.detail).toContain("documents only, upload mandatory");
    // the same setting again: nothing to save (the state stays the same object)
    expect(A.upsertSection(sc.s, ADMIN, inputOf(draftSection(sc.s, "K3"), { uploads: "mandatory" })).state).toBe(sc.s);
    // Optional again: the key goes, and the draft is the same as v2
    setSection(sc, "K3", { uploads: "optional" });
    expect("uploads" in draftSection(sc.s, "K3")).toBe(false);
    expect(draftChanges(sc.s)!.count).toBe(0);
    // a section with questions never stores it; a documents-only one switched to questions drops it
    expect(A.upsertSection(sc.s, ADMIN, inputOf(draftSection(sc.s, "K1"), { uploads: "mandatory" })).state).toBe(sc.s);
    expect("uploads" in draftSection(sc.s, "K1")).toBe(false);
    setSection(sc, "K8.1", { uploads: "mandatory" });
    setSection(sc, "K8.1", { documentsOnly: false, uploads: "mandatory" });
    expect(draftSection(sc.s, "K8.1")).toMatchObject({ documentsOnly: false });
    expect("uploads" in draftSection(sc.s, "K8.1")).toBe(false);
  });

  it("a new case: blocks completeness and the release until a file is in the section, or a justification", () => {
    const sc = new Scenario();
    const old = release(sc);
    sc.create({ materialNo: "RM-500901" }).metadata(PLAIN_CONFIG);
    expect(sc.c.templateVersion).toBe("CIQ-2026 v3");
    expect(sectionUploadRequired(sc.c, "K3", sc.s.config)).toBe(true);
    // K8.1 asks for it too, but is optional for every case: no block
    expect(sectionUploadRequired(sc.c, "K8.1", sc.s.config)).toBe(false);
    const k3 = completenessBlockers(sc.c, sc.s.config).filter((b) => b.sectionId === "K3");
    expect(k3).toEqual([{ sectionId: "K3", fieldId: K3_UPLOAD, label: K3_NAME }]);
    expect(releaseBlockers(sc.c, sc.s.config).map((b) => b.label)).toContain(`Missing: ${K3_NAME}`);
    expect(sectionProgress(sc.c, "K3", sc.s.config)).toEqual({ done: 0, total: 1 });
    expect(sectionProgress(sc.c, "K8.1", sc.s.config)).toEqual({ done: 0, total: 0 });
    expect(fieldLabel(K3_UPLOAD, sc.c.templateVersion, sc.s.config)).toBe(K3_NAME);

    // Cannot provide, with a justification: counts as answered
    sc.step("justify K3", (s, at) => A.setJustification(s, SUP, sc.id, K3_UPLOAD, JUST, at));
    expect(sectionUploadStatus(sc.c, "K3")).toBe("justified");
    expect(blockerIds(sc)).not.toContain(K3_UPLOAD);
    expect(sectionProgress(sc.c, "K3", sc.s.config)).toEqual({ done: 1, total: 1 });
    // the justification removed: it blocks again; a file in the section (no question) answers it
    sc.step("remove the justification", (s, at) => A.setJustification(s, SUP, sc.id, K3_UPLOAD, "", at));
    expect(blockerIds(sc)).toContain(K3_UPLOAD);
    sc.step("upload to K3", (s, at) => A.uploadDocument(s, SUP, sc.id, { name: "Storage_statement.pdf", kind: "Statement", sectionId: "K3" }, at).state);
    expect(sectionUploadStatus(sc.c, "K3")).toBe("received");
    expect(blockerIds(sc)).not.toContain(K3_UPLOAD);
    expect(sectionProgress(sc.c, "K3", sc.s.config)).toEqual({ done: 1, total: 1 });

    // the case started on v2 keeps today's behaviour: its K3 upload never blocks
    sc.id = old;
    expect(sectionUploadRequired(sc.c, "K3", sc.s.config)).toBe(false);
    expect(blockerIds(sc).some(isSectionUploadKey)).toBe(false);
  });

  it("the key never meets a field or a slot key; a justification in Part 2 belongs to its section; the final document carries it", () => {
    expect([sectionUploadKey("K3"), uploadKeySection("DOC:A14"), isSectionUploadKey("FLD-K1-001"), isSectionUploadKey("EV:x"), isSectionUploadKey("DOC:K3")]).toEqual(["DOC:K3", "A14", false, false, true]);
    const sc = new Scenario();
    release(sc);
    sc.create({ materialNo: "RM-500902" }).metadata(PLAIN_CONFIG);
    sc.step("justify K3", (s, at) => A.setJustification(s, SUP, sc.id, K3_UPLOAD, JUST, at));
    sc.fillMandatory().confirm();
    expect(sc.c.phase).toBe("review");
    const since = sc.c.confirmations.at(-1)!.at;
    sc.step("change the justification in Part 2", (s, at) => A.setJustification(s, SUP, sc.id, K3_UPLOAD, `${JUST} Updated.`, at));
    expect(sectionsChangedSince(sc.c, since, sc.s.config)).toEqual(["K3"]);
    expect(sc.c.audit.at(-1)?.detail ?? "").toContain(`Justification for ${K3_NAME}`);
    sc.completeAll().release();
    const fd = sc.c.finalDocument!;
    expect(fd.sections.find((x) => x.sectionId === "K3")).toMatchObject({ justification: `${JUST} Updated.`, answers: [] });
    // a section with a file instead carries no justification
    expect(fd.sections.find((x) => x.sectionId === "K8.1")?.justification).toBeUndefined();
  });
});

describe("documents a rule asks for: Mandatory | Optional (Thomas, 29 Oct)", () => {
  it("upsertRule stores optionalEvidence ⊆ evidence, in the evidence's spelling, and only when there is one", () => {
    const sc = new Scenario();
    release(sc);
    const rules = sc.s.config.pairs.find((p) => p.ruleSet.version === "RS-2026.3")!.ruleSet.rules;
    expect(rules.find((r) => r.id === "R-122")).toMatchObject({ evidence: [COC, SITE], optionalEvidence: [COC] });
    expect("optionalEvidence" in rules.find((r) => r.id === "R-123")!).toBe(false);
    // a stale name (no longer asked for) drops out; nothing left: no key at all
    sc.step("create v4", (s, at) => A.createDraft(s, ADMIN, "Stale", at));
    const r122 = draftPair(sc.s)!.ruleSet.rules.find((r) => r.id === "R-122")!;
    sc.step("R-122 without the code of conduct", (s, at) => A.upsertRule(s, ADMIN, { ...r122, evidence: [SITE], optionalEvidence: [COC] }, at).state);
    expect(draftPair(sc.s)!.ruleSet.rules.find((r) => r.id === "R-122")).toMatchObject({ evidence: [SITE] });
    expect("optionalEvidence" in draftPair(sc.s)!.ruleSet.rules.find((r) => r.id === "R-122")!).toBe(false);
  });

  it("a toggle alone is a rule change; toggling back is none", () => {
    const sc = new Scenario();
    release(sc);
    sc.step("create v4", (s, at) => A.createDraft(s, ADMIN, "Toggle", at));
    const r = () => draftPair(sc.s)!.ruleSet.rules.find((x) => x.id === "R-122")!;
    sc.step("site certificate optional too", (s, at) => A.upsertRule(s, ADMIN, { ...r(), optionalEvidence: [COC, SITE] }, at).state);
    expect(draftChanges(sc.s)).toMatchObject({ count: 1, rules: { changed: ["R-122"] } });
    // the same again, written another way: no change (the state stays the same object)
    expect(A.upsertRule(sc.s, ADMIN, { ...r(), optionalEvidence: [" additional SITE certificate", COC] }).state).toBe(sc.s);
    sc.step("back to mandatory", (s, at) => A.upsertRule(s, ADMIN, { ...r(), optionalEvidence: [COC] }, at).state);
    expect(draftChanges(sc.s)!.count).toBe(0);
  });

  it("an optional slot never blocks; when several rules ask for a document, the stricter one wins", () => {
    const sc = new Scenario();
    release(sc);
    sc.create({ materialNo: "RM-500903" }).metadata(PLAIN_CONFIG);
    // only R-122 fires: the code of conduct is optional, the site certificate mandatory (exact shape: optional only when true)
    expect(requestedDocuments(sc.c, sc.s.config)).toEqual([
      { key: K_COC, doc: COC, sectionId: "K1", ruleIds: ["R-122"], why: "Asked for every raw material", conditions: ["Every case"], optional: true },
      { key: K_SITE, doc: SITE, sectionId: "K1", ruleIds: ["R-122"], why: "Asked for every raw material", conditions: ["Every case"] },
    ]);
    expect(blockerIds(sc)).toContain(K_SITE);
    expect(blockerIds(sc)).not.toContain(K_COC);
    expect(slotBlocks(sc.c, slot(sc, K_COC)!)).toBe(false);
    expect(requestedStatusLabel("missing", slot(sc, K_COC)!)).toBe("Not provided (optional)");
    expect(requestedStatusLabel("missing", slot(sc, K_SITE)!)).toBe("Missing");
    // K1 counts the site certificate, not the optional code of conduct
    const k1 = sectionProgress(sc.c, "K1", sc.s.config);
    sc.step("upload the site certificate", (s, at) => A.uploadDocument(s, SUP, sc.id, { name: "Site.pdf", kind: "Certificate", sectionId: "K1", fieldId: K_SITE }, at).state);
    expect(sectionProgress(sc.c, "K1", sc.s.config)).toEqual({ done: k1.done + 1, total: k1.total });
    // SF-03 Yes: R-123 asks for the code of conduct too, without "optional": it is mandatory; R-124's statement optional
    sc.metadata(POLYMER);
    expect(slot(sc, K_COC)).toMatchObject({ ruleIds: ["R-122", "R-123"] });
    expect(slot(sc, K_COC)!.optional).toBeUndefined();
    expect(slot(sc, K_POLY)).toMatchObject({ ruleIds: ["R-124"], optional: true });
    expect(blockerIds(sc)).toContain(K_COC);
    expect(blockerIds(sc)).not.toContain(K_POLY);
    expect(deriveRequestedDocs(sc.c, sc.s.config).filter((x) => x.optional).map((x) => x.key)).toEqual([K_POLY]);
  });

  it("the list fixed at the confirmation stores the flag; a kept slot keeps it, with or without rule ids", () => {
    const sc = new Scenario();
    release(sc);
    sc.create({ materialNo: "RM-500904" }).metadata(POLYMER);
    sc.fillMandatory();
    expect(slot(sc, K_POLY)?.optional).toBe(true);
    expect(blockerIds(sc)).toEqual([]); // the optional polymer statement is still missing, and blocks nothing
    sc.confirm();
    expect(sc.c.requestedDocs!.map((x) => x.key)).toEqual([K_COC, K_SITE, K_POLY]);
    expect(sc.c.requestedDocs!.filter((x) => x.optional).map((x) => x.key)).toEqual([K_POLY]);
    expect(sc.c.requestedDocs!.some((x) => "kept" in x)).toBe(false);
    // SF-03 No in Part 2: R-123 and R-124 stop firing; the polymer statement is kept (the scope only grows), still optional
    sc.metadata(PLAIN_CONFIG);
    expect(slot(sc, K_POLY)).toMatchObject({ kept: true, optional: true });
    expect(releaseBlockers(sc.c, sc.s.config).map((b) => b.fieldId)).not.toContain(K_POLY);
    // Requested_Docs_JSON keeps no rule ids: the stored flag decides, the same answer
    const asStored: CiqCase = { ...sc.c, requestedDocs: sc.c.requestedDocs!.map((x) => ({ ...x, ruleIds: [], conditions: [] })) };
    expect(requestedDocuments(asStored, sc.s.config).find((x) => x.key === K_POLY)).toMatchObject({ kept: true, optional: true });
    expect(releaseBlockers(asStored, sc.s.config).map((b) => b.fieldId)).not.toContain(K_POLY);
    expect(storableSlots(requestedDocuments(sc.c, sc.s.config)).find((x) => x.key === K_POLY)).toMatchObject({ optional: true });
  });

  it("two rules on one document, one Optional, one Mandatory: the kept slot is what it was at the confirmation", () => {
    // R-125 (SF-06 Yes) asks for the polymer statement too, as mandatory; R-124 (SF-03 Yes) as optional. A case with
    // SF-03 Yes and SF-06 No leaves it out (optional), confirms, then answers SF-03 No: the slot is kept, still
    // optional. A rule that never fired for the case does not make it mandatory, with or without stored rule ids.
    const sc = new Scenario();
    release(sc);
    sc.step("create v4", (s, at) => A.createDraft(s, ADMIN, "Polymer statement for GMO materials", at));
    sc.step("R-125", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF06", value: true }, activates: [], outcome: "mandatory", evidence: [POLY], departments: ["SAF"], basis: "agreed" }, at).state);
    sc.step("publish v4", (s, at) => A.publishDraft(s, ADMIN, "Polymer statement mandatory for GMO materials.", at));
    sc.create({ materialNo: "RM-500907" }).metadata(POLYMER).fillMandatory();
    expect(slot(sc, K_POLY)).toMatchObject({ ruleIds: ["R-124"], optional: true });
    sc.confirm();
    sc.metadata(PLAIN_CONFIG);
    const asStored: CiqCase = { ...sc.c, requestedDocs: sc.c.requestedDocs!.map((x) => ({ ...x, ruleIds: [], conditions: [] })) };
    for (const c of [sc.c, asStored]) {
      expect(requestedDocuments(c, sc.s.config).find((x) => x.key === K_POLY)).toMatchObject({ kept: true, optional: true });
      expect(releaseBlockers(c, sc.s.config).map((b) => b.fieldId)).not.toContain(K_POLY);
    }
  });

  it("a slot mandatory at the confirmation never becomes optional, whatever the answers", () => {
    const sc = new Scenario();
    release(sc);
    // SF-03 Yes: R-123 makes the code of conduct mandatory; the supplier says why they cannot provide it
    sc.create({ materialNo: "RM-500908" }).metadata(POLYMER);
    sc.step("justify the code of conduct", (s, at) => A.setJustification(s, SUP, sc.id, K_COC, "We follow our group's code; no separate document per customer.", at));
    sc.fillMandatory().confirm();
    expect(sc.c.requestedDocs!.find((x) => x.key === K_COC)?.optional).toBeUndefined();
    // SF-03 No in Part 2: only R-122 (optional) still asks for it, but it stays mandatory
    sc.metadata(PLAIN_CONFIG);
    expect(slot(sc, K_COC)).toMatchObject({ ruleIds: ["R-122"] });
    expect(slot(sc, K_COC)!.optional).toBeUndefined();
    // the justification removed: it blocks the release again
    sc.step("remove the justification", (s, at) => A.setJustification(s, SUP, sc.id, K_COC, "", at));
    expect(releaseBlockers(sc.c, sc.s.config).map((b) => b.fieldId)).toContain(K_COC);
  });

  it("an optional slot a newly firing rule needs is now mandatory: told, stored, and never optional again", () => {
    const sc = new Scenario();
    release(sc);
    // SF-03 No: only R-122 fires, the code of conduct is optional and left out
    sc.create({ materialNo: "RM-500909" }).metadata(PLAIN_CONFIG).fillMandatory().confirm();
    expect(slot(sc, K_COC)?.optional).toBe(true);
    // SF-03 Yes in Part 2: R-123 needs it
    sc.metadata(POLYMER);
    expect(slot(sc, K_COC)!.optional).toBeUndefined();
    expect(blockerIds(sc)).toContain(K_COC);
    const detail = sc.c.audit.find((x) => x.action === "Changed metadata answer after completeness")!.detail;
    expect(detail).toContain(`Documents now requested: ${POLY} (K1).`);
    expect(detail).toContain(`Documents now mandatory: ${COC} (K1).`);
    expect(sc.c.requestedDocs!.find((x) => x.key === K_COC)?.optional).toBeUndefined();
    expect(sc.s.mails.some((m) => m.event === "data-changed" && m.caseId === sc.id && m.body.includes(`Documents now mandatory: ${COC}`))).toBe(true);
    // SF-03 No again: it stays mandatory
    sc.metadata(PLAIN_CONFIG);
    expect(slot(sc, K_COC)!.optional).toBeUndefined();
    expect(blockerIds(sc)).toContain(K_COC);
  });

  it("evidence a question collects follows that question's requiredness, whatever the rule says", () => {
    const sc = new Scenario();
    sc.step("publish v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
    sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "SDS optional on a rule", at));
    sc.step("R-122", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "always" }, activates: [], outcome: "mandatory", evidence: ["SDS"], optionalEvidence: ["SDS"], departments: ["QM"], basis: "agreed" }, at).state);
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "SDS asked for once more.", at));
    sc.create({ materialNo: "RM-500905" }).metadata(PLAIN_CONFIG);
    expect(requestedDocuments(sc.c, sc.s.config)).toEqual([]);
    expect(blockerIds(sc)).toContain("FLD-K1-001");
  });

  it("the final document leaves out an optional slot that was not provided and lists one that was", () => {
    const sc = new Scenario();
    release(sc);
    sc.create({ materialNo: "RM-500906" }).metadata(POLYMER);
    sc.fillMandatory().confirm();
    // the code of conduct (mandatory with SF-03 Yes) was uploaded by fillMandatory; the polymer statement left out
    sc.metadata(PLAIN_CONFIG); // only R-122 (optional) still asks for it: it stays mandatory, and it is received
    expect(slot(sc, K_COC)!.optional).toBeUndefined();
    sc.completeAll().release();
    const fd = sc.c.finalDocument!;
    const k1 = fd.sections.find((x) => x.sectionId === "K1")!.answers.map((a) => a.fieldId);
    expect(k1).toContain(K_COC);
    expect(k1).toContain(K_SITE);
    expect(k1).not.toContain(K_POLY);
    expect(fd.evidence.filter((e) => e.requested).map((e) => e.requested).sort()).toEqual([SITE, COC].sort());
    expect(buildFinalDocument(sc.s, sc.c, fd.generatedAt, fd.trigger).fingerprint).toBe(fd.fingerprint);
  });

  it("the rule form, the publish check and the rule sentence say which documents are optional", () => {
    expect(isOptionalEvidence({ optionalEvidence: [" supplier code OF conduct"] }, COC)).toBe(true);
    expect(isOptionalEvidence({}, COC)).toBe(false);
    const template = builtinTemplateData("CIQ-2026 v2");
    const [coc, site] = uncollectedEvidence([COC, SITE], [], template, { optional: [COC] });
    expect(uncollectedText(coc)).toBe(`“${COC}” is not collected by a question yet: the supplier gets an optional upload slot for it under “Requested documents” in K1 (the rule switches on no section).`);
    expect(uncollectedText(site)).toBe(`“${SITE}” is not collected by a question yet: the supplier gets an upload slot for it under “Requested documents” in K1 (the rule switches on no section).`);
    const sentence = ruleSentence({ condition: { kind: "always" }, activates: [], outcome: "mandatory", evidence: [COC, SITE], optionalEvidence: [COC], departments: ["QM"] });
    expect(sentence).toBe(`For every case, the supplier uploads ${COC} (optional) and ${SITE}. Reviewed by QM.`);
  });
});
