// Requested documents (spec §8.5, Thomas 14 Oct): evidence a rule asks for that no question collects becomes an upload
// slot in a section of the case. Slot derivation and placement, version pinning, live scope before the completeness
// confirmation and grow-only after it, the completeness and release blockers, the justification, the final document,
// and the old live-portal flow (no slots). Every step checks the invariants (Scenario).
import { afterEach, describe, expect, it } from "vitest";
import * as A from "./actions";
import { type FieldInput, type SectionInput, validateDraft } from "./configActions";
import { REFERENCE_MATERIALS } from "./referenceMaterials";
import { deriveRequestedDocs, requestedDocStatus, requestedDocuments, slotKey, uncollectedEvidence, uncollectedText } from "./requestedDocs";
import { RULE_SETS, deriveScope, syncRegistry } from "./rules";
import { RELEASE_LOCKED_TEXT } from "./permissions";
import { changedSectionsFor, completenessBlockers, releaseBlockers, sectionProgress, sectionsChangedSince } from "./selectors";
import { PLAIN_CONFIG, Scenario } from "./testkit";
import type { AppState } from "./types";

const ADMIN = "u-admin";
const SUP = "u-sup-1";
const MICRO: SectionInput = { code: "K6.18", title: "Microplastics declaration", kind: "chapter", meaning: "Intentionally added microplastics and the SPM restriction", lead: "SAF", co: [], documentsOnly: false };
const MICRO_YES: FieldInput = { label: "Does the raw material contain intentionally added microplastics?", type: "yesno", required: "mandatory", owner: "SAF" };
const REPORT = "Microplastics test report";
const COC = "Supplier code of conduct";
const SITE = "Additional site certificate";
const K_REPORT = "EV:microplastics-test-report";
const K_COC = "EV:supplier-code-of-conduct";
const K_SITE = "EV:additional-site-certificate";
const POLYMER = { ...PLAIN_CONFIG, SF03: true };

function withId(sc: Scenario, label: string, fn: (s: AppState, at: string) => { state: AppState; id: string }): string {
  let id = "";
  sc.step(label, (s, at) => {
    const r = fn(s, at);
    id = r.id;
    return r.state;
  });
  return id;
}

/**
 * As the administrator: publish the prepared v2, then RS-2026.3 + v3 with K6.18 (one yes/no question) and three rules
 * asking for documents no question collects: R-122 (SF-03 Yes → K6.18 mandatory + microplastics test report), R-123
 * (every case, evidence only: code of conduct) and R-124 (SF-12 No, evidence only: additional site certificate; SF-12 No
 * opens nothing after the completeness confirmation, since the scope only grows).
 * With `beforeV3`, a case is started on v2 first. Returns that case's id.
 */
function customDocsRelease(sc: Scenario, beforeV3 = false): string {
  sc.step("publish the prepared v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
  let old = "";
  if (beforeV3) {
    sc.create({ materialNo: "RM-500001" });
    old = sc.id;
  }
  sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "Requested documents", at));
  withId(sc, "add K6.18", (s, at) => A.upsertSection(s, ADMIN, MICRO, at));
  withId(sc, "add the yes/no question", (s, at) => A.upsertField(s, ADMIN, "K6.18", MICRO_YES, at));
  withId(sc, "R-122", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF03", value: true }, activates: ["K6.18"], outcome: "mandatory", evidence: [REPORT], departments: ["SAF"], basis: "agreed" }, at));
  withId(sc, "R-123", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "always" }, activates: [], outcome: "mandatory", evidence: [COC], departments: ["QM"], basis: "agreed" }, at));
  withId(sc, "R-124", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF12", value: false }, activates: [], outcome: "mandatory", evidence: [SITE], departments: ["QM"], basis: "agreed" }, at));
  sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Requested documents for microplastics, code of conduct and additional sites.", at));
  return old;
}

const keys = (sc: Scenario) => requestedDocuments(sc.c, sc.s.config).map((x) => x.key);
const slot = (sc: Scenario, key: string) => requestedDocuments(sc.c, sc.s.config).find((x) => x.key === key)!;
const blockerIds = (sc: Scenario) => completenessBlockers(sc.c, sc.s.config).map((b) => b.fieldId);
const upload = (sc: Scenario, key: string, name: string, by = SUP) => sc.step(`upload ${name}`, (s, at) => A.uploadDocument(s, by, sc.id, { name, kind: "Analysis", sectionId: "K1", fieldId: key }, at).state);

afterEach(() => syncRegistry(undefined));

describe("requested documents: which and where (spec §8.5)", () => {
  it("a stable key per document name", () => {
    expect(slotKey("Microplastics test report")).toBe(K_REPORT);
    expect(slotKey("  Bescheinigung über Prüfung (EU) ")).toBe("EV:bescheinigung-uber-prufung-eu");
    expect(slotKey("!!!")).toBe("EV:document");
  });

  it("the built-in rule sets ask only for documents a question collects: no slot for any reference material", () => {
    for (const rs of RULE_SETS)
      for (const m of REFERENCE_MATERIALS) {
        const scope = deriveScope(m.config, rs.version, rs.templateVersion);
        expect(deriveRequestedDocs({ config: m.config, ruleSetVersion: rs.version, templateVersion: rs.templateVersion, scope, liveScope: true }), `${rs.version} ${m.id}`).toEqual([]);
      }
  });

  it("a fired rule's custom document gets a slot in the first section it switches on; an evidence-only rule's in K1", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create();
    expect(sc.c.templateVersion).toBe("CIQ-2026 v3");
    // Before SF-03 is answered only the every-case rule applies.
    expect(requestedDocuments(sc.c, sc.s.config)).toEqual([{ key: K_COC, doc: COC, sectionId: "K1", ruleIds: ["R-123"], why: "Asked for every raw material", conditions: ["Every case"] }]);
    sc.metadata(POLYMER);
    expect(keys(sc)).toEqual([K_REPORT, K_COC]);
    expect(slot(sc, K_REPORT)).toMatchObject({ doc: REPORT, sectionId: "K6.18", ruleIds: ["R-122"], why: "Asked for because you answered Yes to “Does the raw material contain polymers or meet the REACH polymer definition?”", conditions: ["Polymer (SF-03) is Yes"] });
  });

  it("the questionnaire version is pinned: a case started on v2 never gets the v3 slots", () => {
    const sc = new Scenario();
    const old = customDocsRelease(sc, true);
    sc.id = old;
    expect(sc.c.templateVersion).toBe("CIQ-2026 v2");
    sc.metadata({ ...POLYMER, SF12: false });
    expect(keys(sc)).toEqual([]);
    expect(blockerIds(sc).some((id) => id?.startsWith("EV:"))).toBe(false);
  });

  it("a document whose question a later version removed gets a slot on that version only", () => {
    const sc = new Scenario();
    sc.step("publish the prepared v2", (s, at) => A.publishDraft(s, ADMIN, "v2", at));
    sc.create({ materialNo: "RM-500002" });
    const onV2 = sc.id;
    sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "Drop the SPM statement question", at));
    sc.step("remove the SPM question", (s, at) => A.removeField(s, ADMIN, "K1", "FLD-K1-010", at));
    expect(validateDraft(sc.s)!.infos.map((i) => i.text)).toEqual(["R-15: “SPM scope statement” is not collected by a question yet: the supplier gets an upload slot for it under “Requested documents” in Annex 1."]);
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "SPM statement as a requested document.", at));
    sc.create({ materialNo: "RM-500003" }).metadata({ ...PLAIN_CONFIG, SF01: ["polymer"] });
    expect(requestedDocuments(sc.c, sc.s.config)).toMatchObject([{ key: "EV:spm-scope-statement", sectionId: "A1", ruleIds: ["R-15"], why: "Asked for because the origin includes Polymer" }]);
    sc.id = onV2;
    sc.metadata({ ...PLAIN_CONFIG, SF01: ["polymer"] });
    expect(keys(sc)).toEqual([]);
    expect(blockerIds(sc)).toContain("FLD-K1-010");
  });

  it("the admin's view: the first live section of the rule, else K1", () => {
    const tpl = { sections: [{ id: "K1", code: "K1", fields: [{ id: "FLD-K1-001" }] }, { id: "A6", code: "Annex 6", fields: [] }, { id: "A9", code: "Annex 9", fields: [], retired: true }] } as never;
    expect(uncollectedEvidence(["SDS", "Lab report", "lab report "], ["A9", "A6"], tpl, { alwaysOn: ["K1"] })).toEqual([{ doc: "Lab report", sectionId: "A6", code: "Annex 6", inK1: false }]);
    expect(uncollectedEvidence(["Lab report"], ["A9"], tpl)).toEqual([{ doc: "Lab report", sectionId: "K1", code: "K1", inK1: true }]);
    // a "Not applicable" rule closes its sections, so the slot goes to K1 (as at runtime)
    const na = uncollectedEvidence(["Lab report"], ["A6"], tpl, { outcome: "na" });
    expect(na).toEqual([{ doc: "Lab report", sectionId: "K1", code: "K1", inK1: true, naRule: true }]);
    expect(uncollectedText(na[0])).toBe("“Lab report” is not collected by a question yet: the supplier gets an upload slot for it under “Requested documents” in K1 (the rule makes its sections not applicable).");
    // a known document whose question sits in a section the rule does not always bring into scope
    const sds = uncollectedEvidence(["SDS"], ["A6"], tpl);
    expect(sds).toEqual([{ doc: "SDS", sectionId: "A6", code: "Annex 6", inK1: false, onlyWithout: ["K1"] }]);
    expect(uncollectedText(sds[0])).toBe("“SDS” is collected by a question in K1, which this rule does not switch on: a case without K1 in scope gets an upload slot for it under “Requested documents” in Annex 6 instead.");
  });

  it("admin and runtime agree: a 'Not applicable' rule's slot sits in K1; a known document out of scope becomes a slot and the admin is told", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.step("create v4", (s, at) => A.createDraft(s, ADMIN, "Admin view checks", at));
    withId(sc, "R-125 not applicable", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF06", value: true }, activates: ["K6.17"], outcome: "na", evidence: ["GMO statement custom"], departments: ["QM"], basis: "agreed" }, at));
    withId(sc, "R-126 MOAH value", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF10", value: true }, activates: ["K6.18"], outcome: "mandatory", evidence: ["MOAH value"], departments: ["SAF"], basis: "agreed" }, at));
    const infos = validateDraft(sc.s)!.infos;
    expect(infos.find((i) => i.ruleId === "R-125")).toMatchObject({ sectionId: "K1", text: "R-125: “GMO statement custom” is not collected by a question yet: the supplier gets an upload slot for it under “Requested documents” in K1 (the rule makes its sections not applicable)." });
    expect(infos.find((i) => i.ruleId === "R-126")).toMatchObject({ sectionId: "K6.18", text: "R-126: “MOAH value” is collected by a question in Annex 4, which this rule does not switch on: a case without Annex 4 in scope gets an upload slot for it under “Requested documents” in K6.18 instead." });
    // the built-in rules stay quiet (their documents' questions are always in scope with the rule); only v3's custom ones speak
    expect([...new Set(infos.map((i) => i.ruleId))]).toEqual(["R-122", "R-123", "R-124", "R-125", "R-126"]);
    sc.step("publish v4", (s, at) => A.publishDraft(s, ADMIN, "Admin view checks.", at));
    sc.create().metadata({ ...PLAIN_CONFIG, SF06: true, SF10: true, SF07: false });
    expect(slot(sc, "EV:gmo-statement-custom")).toMatchObject({ sectionId: "K1", ruleIds: ["R-125"] });
    expect(slot(sc, "EV:moah-value")).toMatchObject({ sectionId: "K6.18", ruleIds: ["R-126"] });
    // with Annex 4 in scope the MOAH question collects it: no slot
    sc.metadata({ ...PLAIN_CONFIG, SF06: true, SF10: true, SF07: true });
    expect(keys(sc)).not.toContain("EV:moah-value");
  });

  it("the live portal's old flow (no liveScope) never has slots", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create().metadata(POLYMER);
    const old = { ...sc.c, liveScope: undefined };
    expect(requestedDocuments(old, sc.s.config)).toEqual([]);
    expect(completenessBlockers(old, sc.s.config).some((b) => b.fieldId?.startsWith("EV:"))).toBe(false);
  });
});

describe("requested documents: blockers, uploads and justifications", () => {
  it("a missing slot blocks completeness, named with its rule; the supplier's wording has no rule id", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create().metadata(POLYMER);
    const b = completenessBlockers(sc.c, sc.s.config).filter((x) => x.fieldId?.startsWith("EV:"));
    expect(b).toEqual([
      { sectionId: "K1", fieldId: K_COC, label: `${COC} (requested by rule R-123)`, supplierLabel: `${COC} (requested document)` },
      { sectionId: "K6.18", fieldId: K_REPORT, label: `${REPORT} (requested by rule R-122)`, supplierLabel: `${REPORT} (requested document)` },
    ]);
    // listed in its section, after the section's questions
    const k618 = completenessBlockers(sc.c, sc.s.config).filter((x) => x.sectionId === "K6.18").map((x) => x.fieldId);
    expect(k618).toEqual(["FLD-K6.18-001", K_REPORT]);
    expect(sectionProgress(sc.c, "K6.18", sc.s.config)).toEqual({ done: 0, total: 2 });
    sc.fillMandatory();
    // the test kit uploaded the two requested documents
    expect(requestedDocuments(sc.c, sc.s.config).map((x) => requestedDocStatus(sc.c, x))).toEqual(["received", "received"]);
    expect(sectionProgress(sc.c, "K6.18", sc.s.config)).toEqual({ done: 2, total: 2 });
    const files = sc.c.documents.filter((d) => d.fieldId === K_REPORT);
    expect(files).toMatchObject([{ sectionId: "K6.18", uploadedBy: expect.stringMatching(/^u-sup-/) }]);
    // a slot upload is no answer
    expect(sc.c.answers[K_REPORT]).toBeUndefined();
    sc.confirm();
  });

  it("confirm completeness is refused while a slot is missing; a cannot-provide justification counts", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create().metadata(PLAIN_CONFIG);
    // everything but the code of conduct
    sc.step("justify the code of conduct", (s, at) => A.setJustification(s, SUP, sc.id, K_COC, "Our code of conduct is published on our website; we do not issue it per material.", at));
    sc.fillMandatory();
    expect(requestedDocStatus(sc.c, { key: K_COC })).toBe("justified");
    sc.step("remove the justification", (s, at) => A.setJustification(s, SUP, sc.id, K_COC, "", at));
    expect(blockerIds(sc)).toEqual([K_COC]);
    expect(sc.refused("confirm", (s, at) => A.confirmCompleteness(s, SUP, sc.id, at))).toMatch(/1 item\(s\) must be completed or justified/);
    sc.step("justify again", (s, at) => A.setJustification(s, SUP, sc.id, K_COC, "Our code of conduct is published on our website; we do not issue it per material.", at));
    expect(sc.c.answeredBy[K_COC].by).toBe(SUP);
    sc.confirm();
    expect(sc.c.requestedDocs).toEqual([{ key: K_COC, doc: COC, sectionId: "K1", ruleIds: ["R-123"], why: "Asked for every raw material", conditions: ["Every case"] }]);
  });

  it("uploading to a document no rule asks for is refused", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create();
    expect(sc.refused("unknown slot", (s, at) => A.uploadDocument(s, SUP, sc.id, { name: "x.pdf", kind: "Other", sectionId: "K1", fieldId: "EV:unknown" }, at).state)).toMatch(/not requested/);
  });
});

describe("requested documents follow the live scope", () => {
  it("before completeness a slot closes and reopens with the answer; its upload is kept and comes back", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create().metadata(POLYMER);
    upload(sc, K_REPORT, "MP-report.pdf");
    sc.metadata({ ...POLYMER, SF03: false });
    expect(keys(sc)).toEqual([K_COC]);
    expect(blockerIds(sc)).not.toContain(K_REPORT);
    sc.metadata(POLYMER);
    expect(keys(sc)).toEqual([K_REPORT, K_COC]);
    expect(requestedDocStatus(sc.c, slot(sc, K_REPORT))).toBe("received");
  });

  it("after completeness slots only grow: a closed one is kept, a new one is added later and blocks the release until uploaded", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create().metadata(POLYMER).fillMandatory().confirm();
    expect(sc.c.requestedDocs?.map((x) => x.key)).toEqual([K_REPORT, K_COC]);
    // SF-03 back to No: K6.18 and its slot are kept
    sc.metadata({ ...POLYMER, SF03: false });
    expect(slot(sc, K_REPORT)).toMatchObject({ sectionId: "K6.18", kept: true });
    // SF-12 No: a new slot in K1
    sc.metadata({ ...POLYMER, SF03: false, SF12: false });
    expect(slot(sc, K_SITE)).toMatchObject({ sectionId: "K1", ruleIds: ["R-124"], addedLater: true });
    expect(sc.c.requestedDocs?.map((x) => x.key)).toEqual([K_REPORT, K_COC, K_SITE]);
    expect(sc.c.audit.at(-1)!.detail).toMatch(/Documents now requested: Additional site certificate \(K1\)/);
    expect(sc.mails("data-changed").at(-1)!.body).toMatch(/Documents now requested: Additional site certificate/);
    // back to Yes: still requested (grow-only)
    sc.metadata({ ...POLYMER, SF03: false, SF12: true });
    expect(slot(sc, K_SITE)).toMatchObject({ kept: true, addedLater: true });
    sc.completeAll();
    expect(sc.c.phase).toBe("final-release");
    expect(releaseBlockers(sc.c, sc.s.config)).toEqual([{ label: `Missing: ${SITE} (requested by rule R-124)`, supplierLabel: `Missing: ${SITE} (requested document)`, sectionId: "K1", fieldId: K_SITE }]);
    expect(sc.refused("release", (s, at) => A.finalRelease(s, SUP, sc.id, at))).toBe(`The release is not possible yet: Missing: ${SITE} (requested document).`);
    // locked while the release is requested (Thomas, 15 Oct): QM (K1's lead) reopens, then the supplier uploads
    expect(sc.refused("upload while locked", (s, at) => A.uploadDocument(s, "u-sup-2", sc.id, { name: "Site-2-ISO-9001.pdf", kind: "Certificate", sectionId: "K1", fieldId: K_SITE }, at).state)).toBe(RELEASE_LOCKED_TEXT);
    sc.reopen("QM", "The additional site certificate is still missing.");
    const qmCompleted = sc.track("QM")!.lastCompletedAt!;
    upload(sc, K_SITE, "Site-2-ISO-9001.pdf", "u-sup-2");
    expect(sectionsChangedSince(sc.c, qmCompleted, sc.s.config)).toContain("K1");
    expect(changedSectionsFor(sc.c, "QM", sc.s.config)).toContain("K1");
    // the upload in K1 reopens K1's other completed owners (co-reviewers Regulatory, Safety and RMM)
    expect(["REG", "SAF", "RMM"].map((d) => sc.track(d as "REG")!.status)).toEqual(["reopened", "reopened", "reopened"]);
    sc.completeAll();
    expect(sc.c.phase).toBe("final-release");
    sc.release();
    expect(sc.c.phase).toBe("completed");
  });

  it("a justification after completeness marks the slot's section as changed", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create().metadata(POLYMER).fillMandatory().confirm();
    const since = sc.c.confirmations.at(-1)!.at;
    sc.step("justify", (s, at) => A.setJustification(s, SUP, sc.id, K_REPORT, "The test report follows in November; the declaration in K6.18 applies.", at));
    expect(sectionsChangedSince(sc.c, since, sc.s.config)).toEqual(["K6.18"]);
    expect(sc.c.audit.at(-1)).toMatchObject({ action: "Changed justification after completeness", sectionId: "K6.18" });
    expect(sc.c.audit.at(-1)!.detail).toMatch(/^Justification for Microplastics test report \(requested document\)/);
  });

  it("a requested-document justification after Safety (K6.18's lead) completed reopens Safety's review (Thomas, 15 Oct)", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create().metadata(POLYMER).fillMandatory().confirm();
    sc.decision("SAF", "u-saf", "approved").complete("SAF", "u-saf");
    sc.step("justify", (s, at) => A.setJustification(s, SUP, sc.id, K_REPORT, "The test report follows in November.", at));
    expect(sc.track("SAF")!.status).toBe("reopened");
    expect(sc.c.audit.find((a) => a.action === "Reopened Safety review")).toMatchObject({ by: "system", detail: "The supplier changed K6.18 after your review." });
    expect(changedSectionsFor(sc.c, "SAF", sc.s.config)).toEqual(["K6.18"]);
  });
});

describe("requested documents in the final document", () => {
  it("lists every slot: files with name, upload date and uploader, or the justification", () => {
    const sc = new Scenario();
    customDocsRelease(sc);
    sc.create().metadata(POLYMER);
    sc.step("justify the code of conduct", (s, at) => A.setJustification(s, "u-sup-2", sc.id, K_COC, "Published on our website; not issued per material.", at));
    sc.fillMandatory().confirm().completeAll().release();
    const d = sc.c.finalDocument!;
    const report = d.evidence.find((e) => e.requested === REPORT)!;
    expect(report).toMatchObject({ name: "microplastics-test-report.pdf", sectionId: "K6.18", sectionCode: "K6.18", fieldLabel: `Requested document: ${REPORT}`, uploadedBy: expect.stringMatching(/Elena Márquez|Ravi Menon/) });
    expect(report.uploadedAt).toMatch(/^2026-/);
    expect(report.justification).toBeUndefined();
    const coc = d.evidence.find((e) => e.requested === COC)!;
    expect(coc).toMatchObject({ documentId: K_COC, name: COC, sectionCode: "K1", uploadedBy: "Ravi Menon", justification: "Published on our website; not issued per material." });
    // and in their sections
    expect(d.sections.find((x) => x.sectionId === "K6.18")!.answers.map((a) => a.label)).toEqual([MICRO_YES.label, `${REPORT} (requested document)`]);
    expect(d.sections.find((x) => x.sectionId === "K1")!.answers.find((a) => a.fieldId === K_COC)).toMatchObject({ value: "—", justification: "Published on our website; not issued per material.", by: "Ravi Menon" });
    // no rule ids in the document's requested-document lines
    expect(JSON.stringify(d.evidence)).not.toMatch(/R-12\d/);
  });

  it("a file follows its slot when a shared slot moves before completeness (evidence list, changes since)", () => {
    const sc = new Scenario();
    sc.step("publish the prepared v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
    sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "Shared lab report", at));
    withId(sc, "add K6.18", (s, at) => A.upsertSection(s, ADMIN, MICRO, at));
    withId(sc, "add its question", (s, at) => A.upsertField(s, ADMIN, "K6.18", MICRO_YES, at));
    withId(sc, "add K6.19", (s, at) => A.upsertSection(s, ADMIN, { ...MICRO, code: "K6.19", title: "Nanoform declaration", meaning: "Nanoforms of the raw material" }, at));
    withId(sc, "add its question", (s, at) => A.upsertField(s, ADMIN, "K6.19", { ...MICRO_YES, label: "Does the raw material contain nanoforms?" }, at));
    withId(sc, "R-122", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF03", value: true }, activates: ["K6.18"], outcome: "mandatory", evidence: ["Lab report"], departments: ["SAF"], basis: "agreed" }, at));
    withId(sc, "R-123", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF04", value: true }, activates: ["K6.19"], outcome: "mandatory", evidence: ["Lab report"], departments: ["SAF"], basis: "agreed" }, at));
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Shared lab report.", at));
    sc.create().metadata({ ...PLAIN_CONFIG, SF03: true, SF04: true });
    expect(slot(sc, "EV:lab-report")).toMatchObject({ sectionId: "K6.18", ruleIds: ["R-122", "R-123"] });
    upload(sc, "EV:lab-report", "lab.pdf");
    expect(sc.c.documents.find((d) => d.name === "lab.pdf")!.sectionId).toBe("K6.18");
    sc.metadata({ ...PLAIN_CONFIG, SF03: false, SF04: true });
    expect(slot(sc, "EV:lab-report")).toMatchObject({ sectionId: "K6.19", ruleIds: ["R-123"] });
    expect(requestedDocStatus(sc.c, slot(sc, "EV:lab-report"))).toBe("received");
    sc.fillMandatory().confirm();
    const since = sc.c.confirmations.at(-1)!.at;
    upload(sc, "EV:lab-report", "lab-v2.pdf");
    expect(sectionsChangedSince(sc.c, since, sc.s.config)).toEqual(["K6.19"]);
    sc.completeAll().release();
    const d = sc.c.finalDocument!;
    expect(d.evidence.filter((e) => e.requested === "Lab report").map((e) => [e.name, e.sectionId, e.sectionCode])).toEqual([
      ["lab.pdf", "K6.19", "K6.19"],
      ["lab-v2.pdf", "K6.19", "K6.19"],
    ]);
    expect(d.sections.find((x) => x.sectionId === "K6.19")!.answers.find((a) => a.fieldId === "EV:lab-report")!.value).toBe("lab-v2.pdf, lab.pdf");
  });

  it("a final document without requested documents is unchanged (no new keys)", () => {
    const sc = new Scenario();
    sc.toReview().completeAll().release();
    const d = sc.c.finalDocument!;
    expect(d.evidence.every((e) => !("requested" in e) && !("justification" in e))).toBe(true);
    expect(sc.c.requestedDocs).toBeUndefined();
  });
});
