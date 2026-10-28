// Domain bugs found by the end-to-end harness (scripts/harness-prototype.mjs), each pinned by a unit test here.
import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { buildFinalDocument } from "./finalDocument";
import { manufacturerOf, siteOf } from "./selectors";
import { Scenario } from "./testkit";

describe("a document sent as the answer to a question", () => {
  it("on a non-file question is stored at that question and leaves its answer unchanged", () => {
    const sc = new Scenario().toReview();
    const before = sc.c.answers["FLD-2.1-102"];
    expect(typeof before).toBe("number");
    sc.raise("REG", "u-reg", "K2.1", "Please send the ISO 16128 calculation.", { ref: { sectionId: "K2.1", fieldId: "FLD-2.1-102", label: "K2.1 › Natural origin index" } });
    const op = sc.op().id;
    sc.answer(op, "u-sup-1", "Calculation attached.", "ISO16128_calculation.pdf");
    const doc = sc.c.documents.find((d) => d.name === "ISO16128_calculation.pdf")!;
    expect(doc).toMatchObject({ sectionId: "K2.1", fieldId: "FLD-2.1-102", uploadedBy: "u-sup-1" });
    expect(sc.c.answers["FLD-2.1-102"]).toBe(before);
    expect(sc.op(op).thread.at(-1)).toMatchObject({ action: "answered", documentId: doc.id });
    // the final document shows the number, and the file in the evidence list
    const fd = buildFinalDocument(sc.s, sc.c, "2026-12-01T00:00:00.000Z", "test");
    expect(fd.sections.find((s) => s.sectionId === "K2.1")?.answers.find((a) => a.fieldId === "FLD-2.1-102")?.value).toBe(String(before));
    expect(fd.evidence.map((e) => e.name)).toContain("ISO16128_calculation.pdf");
  });

  it("on a file question becomes that question's answer", () => {
    const sc = new Scenario().toReview();
    sc.raise("QM", "u-qm", "K1", "Please send the current SDS.", { kind: "document-request", ref: { sectionId: "K1", fieldId: "FLD-K1-001", label: "K1 › Safety data sheet (SDS)" } });
    sc.answer(sc.op().id, "u-sup-2", "Current SDS attached.", "SDS_2026.pdf");
    const doc = sc.c.documents.find((d) => d.name === "SDS_2026.pdf")!;
    expect(sc.c.answers["FLD-K1-001"]).toBe(doc.id);
    expect(sc.c.answeredBy["FLD-K1-001"].by).toBe("u-sup-2");
  });
});

describe("the final document's header", () => {
  it("names the manufacturer and the production site the supplier answered in GEN", () => {
    const sc = new Scenario().create();
    expect(sc.c.site).toBe("");
    sc.step("manufacturer", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "Solvaro Oleochemicals S.A., 43006 Tarragona", at));
    sc.step("site", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-005", "Plant 2, 43006 Tarragona", at));
    sc.metadata().fillMandatory().confirm().completeAll().release();
    expect(sc.c.finalDocument!.header).toMatchObject({ manufacturer: "Solvaro Oleochemicals S.A., 43006 Tarragona", site: "Plant 2, 43006 Tarragona" });
    expect(manufacturerOf(sc.c)).toBe("Solvaro Oleochemicals S.A., 43006 Tarragona");
    expect(siteOf(sc.c)).toBe("Plant 2, 43006 Tarragona");
  });

  it("falls back to the case's start values while GEN is unanswered", () => {
    const sc = new Scenario().create();
    expect(manufacturerOf(sc.c)).toBe("Solvaro Oleochemicals S.A.");
    expect(siteOf(sc.c)).toBe("");
  });
});

describe("GEN answers Beiersdorf sets at case start", () => {
  it("the trade name, supplier name, DUNS and contact e-mails cannot be changed by the supplier", () => {
    const sc = new Scenario().create();
    for (const f of ["FLD-GEN-001", "FLD-GEN-002", "FLD-GEN-003", "FLD-GEN-008", "FLD-GEN-009"]) {
      const before = sc.c.answers[f];
      const text = sc.refused(`supplier changes ${f}`, (s, at) => A.setAnswer(s, "u-sup-1", sc.id, f, "changed", at));
      expect(text).toMatch(/set by Beiersdorf at case start/);
      // 28 Oct: no promise of an edit the supplier can't make; whom to tell instead
      expect(text).not.toMatch(/Ask .* to change it/);
      expect(text).toMatch(/can't be changed in the questionnaire\. If it is wrong, tell /);
      expect(sc.c.answers[f]).toBe(before);
    }
    expect(sc.c.answers["FLD-GEN-001"]).toBe(sc.c.materialName);
    expect(sc.c.answers["FLD-GEN-003"]).toBe("471203958");
    // the rest of GEN stays the supplier's
    sc.step("manufacturer", (s, at) => A.setAnswer(s, "u-sup-2", sc.id, "FLD-GEN-004", "Solvaro, Tarragona", at));
  });
});
