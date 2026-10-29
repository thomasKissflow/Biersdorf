import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { buildFinalDocument, fingerprintOf, finalDocumentOf, threadRounds, verifyFinalDocument } from "./finalDocument";
import { can } from "./permissions";
import { updateSupplier } from "./suppliers";
import { buildRichFixture } from "./richFixture";
import { PLAIN_CONFIG, Scenario } from "./testkit";

/** A released case with a two-round point, an edited-then-withdrawn point, an attachment and internal content. */
function released() {
  const sc = new Scenario().toReview();
  sc.raise("QM", "u-qm", "K1", "Please send the CoA of the current batch.");
  const twoRounds = sc.op().id;
  sc.answer(twoRounds, "u-sup-1", "See the attached CoA.", "CoA_2410-002.pdf").decide(twoRounds, "u-qm", "return", "The CoA is older than 12 months.").answer(twoRounds, "u-sup-2", "Current CoA attached.", "CoA_2410-099.pdf").decide(twoRounds, "u-qm", "accept");
  sc.raise("REG", "u-reg", "K2.1", "Please confirm the CAS number of component 1.");
  const withdrawn = sc.op().id;
  sc.step("edit due date", (s, at) => A.editOpenPoint(s, "u-reg", sc.id, withdrawn, { dueDate: "2026-12-15T00:00:00.000Z" }, at));
  sc.step("withdraw", (s, at) => A.closeOpenPoint(s, "u-reg", sc.id, withdrawn, "INTERNAL-REASON confirmed in the REACH dossier", at));
  sc.step("note", (s, at) => A.addInternalNote(s, "u-qm", sc.id, "INTERNAL-NOTE supplier was late last year", undefined, at));
  sc.decision("SAF", "u-saf", "rejected", "INTERNAL-DECISION data gap");
  sc.completeAll({ continueNote: "INTERNAL-CONTINUE agreed with Safety on 14 Oct" });
  sc.release("u-sup-2");
  return { sc, twoRounds, withdrawn };
}

describe("final document (spec §1.10, AS-12, R-2)", () => {
  it("is generated once, automatically, with the release", () => {
    const { sc } = released();
    const d = finalDocumentOf(sc.c)!;
    expect(sc.c.phase).toBe("completed");
    expect(d).toMatchObject({ id: `${sc.id}-FD`, caseId: sc.id, trigger: "Final release by Ravi Menon" });
    expect(d.generatedAt).toBe(sc.c.confirmations.find((x) => x.type === "final-release")!.at);
    expect(sc.c.audit.filter((a) => a.action === "Generated final document")).toHaveLength(1);
  });

  it("holds the header, the released answers by section, the components, the evidence, every thread and every confirmation", () => {
    const { sc, twoRounds, withdrawn } = released();
    const d = sc.c.finalDocument!;
    expect(d.header).toMatchObject({ caseId: sc.id, materialName: "OLIVIA Pure 100", materialNo: "RM-500123", supplierName: "Solvaro Oleochemicals S.A.", duns: "471203958", markets: ["EU"], templateVersion: "CIQ-2026 v1", ruleSetVersion: "RS-2026.1", ownerName: "Katrin Vogel" });
    const inScope = sc.c.scope.filter((x) => x.applicability !== "na").map((x) => x.sectionId);
    expect(d.sections.map((x) => x.sectionId)).toEqual(inScope);
    const gen = d.sections.find((x) => x.sectionId === "GEN")!;
    expect(gen.answers.find((a) => a.fieldId === "FLD-GEN-001")?.value).toBe("OLIVIA Pure 100");
    expect(d.components).toHaveLength(1);
    expect(d.evidence.map((e) => e.name)).toEqual(expect.arrayContaining(["CoA_2410-002.pdf", "CoA_2410-099.pdf"]));
    expect(d.evidence.every((e) => e.uploadedBy && e.uploadedAt)).toBe(true);
    const t1 = d.threads.find((t) => t.opId === twoRounds)!;
    expect(t1.result).toBe("Accepted");
    expect(t1.rounds.map((r) => r.entries.map((e) => e.action))).toEqual([["raised", "answered"], ["returned", "answered", "accepted"]]);
    expect(t1.rounds[0].entries[1]).toMatchObject({ by: "Elena Márquez", attachment: "CoA_2410-002.pdf", side: "supplier" });
    const t2 = d.threads.find((t) => t.opId === withdrawn)!;
    expect(t2.result).toBe("Closed, no answer needed");
    expect(t2.rounds).toHaveLength(1);
    expect(t2.rounds[0].entries.map((e) => e.action)).toEqual(["raised", "edited", "withdrawn"]);
    expect(d.confirmations.map((c) => c.type)).toEqual(["completeness", ...sc.c.reviews.map(() => "dept-completion"), "final-release"]);
    expect(d.confirmations.every((c) => c.name && c.email && c.at)).toBe(true);
    expect(d.confirmations.at(-1)).toMatchObject({ name: "Ravi Menon", email: "ravi.menon@solvaro.example", role: "QA Specialist" });
  });

  it("takes the supplier's name and DUNS from the case (FLD-GEN-002/-003), not from a later edit of the supplier master", () => {
    const sc = new Scenario().toReview();
    sc.step("rename the supplier", (s, at) => updateSupplier(s, "u-admin", sc.c.supplierId, { name: "Solvaro Renamed S.L.", duns: "123456789" }, at));
    expect(sc.s.suppliers.find((x) => x.id === sc.c.supplierId)).toMatchObject({ name: "Solvaro Renamed S.L.", duns: "123456789" });
    sc.completeAll().release();
    expect(sc.c.finalDocument!.header).toMatchObject({ supplierName: "Solvaro Oleochemicals S.A.", duns: "471203958" });
  });

  it("keeps a component's blank values as null (the tab and the PDF show them as '—')", () => {
    const sc = new Scenario().toReview();
    const c = { ...sc.c, components: [{ ...sc.c.components[0], additive: null, concMin: null, concMax: null }] };
    const d = buildFinalDocument(sc.s, c, "2026-10-28T10:00:00.000Z", "test");
    expect(d.components[0]).toMatchObject({ additive: null, concMin: null, concMax: null });
  });

  it("shows numbers with their unit and holds every metadata answer that set the scope", () => {
    const { sc } = released();
    const d = sc.c.finalDocument!;
    const k22 = d.sections.find((x) => x.sectionId === "K2.2")!;
    expect(k22.answers.find((a) => a.fieldId === "FLD-A14-101")?.value).toBe("1 mg/kg");
    const md = d.metadata!;
    expect(md.map((m) => m.code)).toEqual(["SF-01", "SF-03", "SF-04", "SF-05", "SF-06", "SF-07", "SF-09", "SF-10", "SF-12", "SF-11"]);
    for (const [k, v] of Object.entries(sc.c.config)) {
      if (v === undefined) continue;
      const m = md.find((x) => x.id === k)!;
      expect(m.value, k).not.toBe("—");
    }
    expect(md.find((m) => m.id === "SF11")).toMatchObject({ value: "European Union", setByBdf: true });
    expect(md.find((m) => m.id === "SF01")?.by).toBeTruthy();
  });

  it("lists the evidence of the sections it holds only", () => {
    const sc = new Scenario().create().metadata({ SF01: ["vegetable"] });
    sc.step("upload at A1", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "pesticides_2026.pdf", kind: "Analysis", sectionId: "A1" }, at).state);
    sc.metadata({ ...PLAIN_CONFIG, SF01: ["animal"] });
    expect(sc.c.scope.find((x) => x.sectionId === "A1")?.applicability).toBe("na");
    sc.fillMandatory().confirm().completeAll().release();
    const d = sc.c.finalDocument!;
    expect(d.sections.some((x) => x.sectionId === "A1")).toBe(false);
    expect(d.evidence.map((e) => e.name)).not.toContain("pesticides_2026.pdf");
    expect(sc.c.documents.map((x) => x.name)).toContain("pesticides_2026.pdf");
  });

  it("holds no RMES decision, finding, internal note or internal reason", () => {
    const { sc } = released();
    const text = JSON.stringify(sc.c.finalDocument);
    expect(text).not.toMatch(/INTERNAL-/);
    expect(text).not.toMatch(/"rmes"|"decision"|"internalNotes"|closeReason/);
  });

  it("is immutable: the fingerprint verifies, and nothing afterwards changes it", () => {
    const { sc } = released();
    const d = structuredClone(sc.c.finalDocument!);
    expect(verifyFinalDocument(d)).toBe(true);
    expect(verifyFinalDocument({ ...d, header: { ...d.header, materialName: "Tampered" } })).toBe(false);
    expect(d.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprintOf("a")).toBe(fingerprintOf("a"));
    expect(fingerprintOf("a")).not.toBe(fingerprintOf("b"));
    // Deterministic: the same case at the same time gives the same document.
    expect(buildFinalDocument(sc.s, sc.c, d.generatedAt, d.trigger).fingerprint).toBe(buildFinalDocument(sc.s, sc.c, d.generatedAt, d.trigger).fingerprint);
    // Every later attempt is refused.
    sc.refused("release again", (s, at) => A.finalRelease(s, "u-sup-1", sc.id, at));
    sc.refused("answer", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "Changed", at));
    sc.refused("upload", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "late.pdf", kind: "Other", sectionId: "K1" }, at).state);
    sc.refused("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Too late", at));
    sc.refused("reopen", (s, at) => A.reopenReview(s, "u-qm", sc.id, "QM", "Recheck", at));
    sc.refused("edit point", (s, at) => A.editOpenPoint(s, "u-qm", sc.id, sc.c.openPoints[0].id, { question: "x" }, at));
    sc.refused("note", (s, at) => A.addInternalNote(s, "u-qm", sc.id, "After the release", undefined, at));
    sc.step("report a change", (s, at) => A.reportChange(s, "u-sup-1", sc.id, "The supplier of the feedstock changed.", at));
    expect(sc.c.finalDocument).toEqual(d);
    expect(verifyFinalDocument(sc.c.finalDocument!)).toBe(true);
    expect(sc.c.phase).toBe("completed");
  });

  it("is internal only", () => {
    const { sc } = released();
    expect(can(sc.s, "u-sup-1", "finalDocument.view", sc.c)).toBe(false);
    for (const by of ["u-rmm", "u-auditor", "u-owner", "u-qm", "u-cus"]) expect(can(sc.s, by, "finalDocument.view", sc.c)).toBe(true);
  });

  it("splits the thread into rounds at every return and every question edit that went back to the supplier", () => {
    const sc = new Scenario().toReview();
    sc.raise("QM", "u-qm");
    const op = sc.op().id;
    sc.answer(op).step("new question", (s, at) => A.editOpenPoint(s, "u-qm", sc.id, op, { question: "Please send the full specification." }, at));
    sc.answer(op).decide(op, "u-qm", "return", "Page 2 is missing.").answer(op).decide(op, "u-qm", "accept");
    expect(threadRounds(sc.s, sc.c, sc.op(op)).map((r) => r.entries.length)).toEqual([2, 2, 3]);
    expect(sc.op(op).rounds).toBe(3);
  });

  it("every completed case of the rich fixture has a verified document", () => {
    const s = buildRichFixture();
    const done = s.cases.filter((c) => c.phase === "completed");
    expect(done.length).toBe(12);
    for (const c of done) expect(c.finalDocument && verifyFinalDocument(c.finalDocument), c.id).toBe(true);
    expect(s.cases.filter((c) => c.phase !== "completed").every((c) => !c.finalDocument)).toBe(true);
  });
});
