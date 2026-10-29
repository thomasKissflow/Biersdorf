// The RMES sheet (BDF's e-mail of 28 Oct): exactly the 8 fields, filled from the CIQ, read-only, no more.
import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { ORIGIN_LABEL } from "./catalog";
import { NOT_ANSWERED, ORIGIN_TEXT_FIELDS, RMES_FREE_TEXT_NOTE, RMES_UNREADABLE, rmesConcText, rmesSheet, type RmesSheet } from "./rmesSheet";
import { manufacturerOf } from "./selectors";
import { updateSupplier } from "./suppliers";
import { PLAIN_CONFIG, Scenario } from "./testkit";
import type { AnswerValue, CiqCase, ComponentRow, OriginType } from "./types";

type Sheet = Extract<RmesSheet, { readable: true }>;
const sheetOf = (sc: Scenario, c: CiqCase = sc.c): Sheet => {
  const r = rmesSheet(sc.s, c);
  if (!r.readable) throw new Error("unreadable");
  return r;
};
const head = (sh: Sheet, key: "material" | "supplier" | "manufacturer") => sh.header.find((h) => h.key === key)!;
const row = (id: string, origin: OriginType, extra: Partial<ComponentRow> = {}): ComponentRow => ({ id, inci: `INCI ${id}`, fn: "emollient", additive: false, origin, concMin: 1, concMax: 2, ...extra });
const withAnswers = (c: CiqCase, answers: Record<string, AnswerValue | undefined>, more: Partial<CiqCase> = {}): CiqCase => {
  const a = { ...c.answers };
  for (const [k, v] of Object.entries(answers)) if (v === undefined) delete a[k];
  else a[k] = v;
  return { ...c, answers: a, ...more };
};

describe("the RMES sheet: the 8 fields", () => {
  it("holds the 3 header fields and the composition's INCI, %, CAS #, EC # and origin (source + free text), each with its CIQ source", () => {
    const sc = new Scenario().toReview();
    const sh = sheetOf(sc);
    expect(sh.record).toBe(`RMES · ${sc.id} · internal: never visible to the supplier · filled automatically from the CIQ`);
    expect(sh.recordAt).toBe(sc.c.rmes!.createdAt);
    expect(sh.header.map((h) => [h.label, h.source.fieldId, h.source.sectionId])).toEqual([
      ["Raw material / tradename", "FLD-GEN-001", "GEN"],
      ["Supplier", "FLD-GEN-002", "GEN"],
      ["Manufacturer", "FLD-GEN-004", "GEN"],
    ]);
    expect(sh.header.map((h) => h.text)).toEqual(["OLIVIA Pure 100", "Solvaro Oleochemicals S.A.", "Described in the attached statement."]);
    expect(sh.header.every((h) => h.state === "answered" && h.source.label && h.at)).toBe(true);
    expect(sh.columns.map((c) => [c.label, c.sources.map((x) => x.fieldId)])).toEqual([
      ["INCI", ["FLD-2.1-001"]],
      ["%", ["FLD-2.1-007"]],
      ["CAS #", ["FLD-2.1-002"]],
      ["EC #", ["FLD-2.1-003"]],
      ["Source of origin", ["FLD-2.3-01"]],
      ["Free text", ["FLD-2.1-101", "FLD-2.3-10"]],
    ]);
    expect(sh.rows).toEqual([
      {
        rowId: "c1",
        inci: "Olea Europaea Fruit Oil",
        conc: "90–99 %",
        cas: "8001-25-0",
        ec: "—",
        origin: "vegetable",
        originLabel: "Vegetable (bio mass)",
        freeText: [
          { text: "Bark", state: "answered", source: { fieldId: "FLD-2.1-101", label: "Part(s) used", sectionId: "K2.3" } },
          { text: "Test value", state: "answered", source: { fieldId: "FLD-2.3-10", label: "Country of origin", sectionId: "K2.3" } },
        ],
      },
    ]);
    expect(sh.footnote).toBe(RMES_FREE_TEXT_NOTE);
  });

  it("has no Process ID / RMT ID / IRMA ID, no Declaration, nothing to edit and nothing of the retired criteria RMES", () => {
    const sc = new Scenario().toReview();
    const sh = sheetOf(sc);
    expect(Object.keys(sh).sort()).toEqual(["caseId", "columns", "footnote", "header", "readable", "record", "recordAt", "rows", "sharedOrigins"]);
    expect(sh.header).toHaveLength(3);
    expect(sh.columns).toHaveLength(6);
    const text = JSON.stringify(sh);
    expect(text).not.toMatch(/Process ID|RMT|IRMA|Declaration|criteri|finding|limit|AI suggestion|Approved|Rejected/i);
    expect(text).not.toContain(sc.c.materialNo);
  });

  it("follows the case: a Part 2 change of the supplier shows at once (nothing is stored)", () => {
    const sc = new Scenario().toReview();
    sc.step("new manufacturer", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "Solvaro Iberia S.L., Tarragona", at));
    expect(head(sheetOf(sc), "manufacturer")).toMatchObject({ text: "Solvaro Iberia S.L., Tarragona", state: "answered", at: sc.c.answeredBy["FLD-GEN-004"]!.at });
  });
});

describe("the header", () => {
  it("Raw material / tradename: FLD-GEN-001, else the case's material name, never the case id", () => {
    const sc = new Scenario().toReview();
    expect(head(sheetOf(sc, withAnswers(sc.c, { "FLD-GEN-001": "OLIVIA Pure 100 (refined)" })), "material").text).toBe("OLIVIA Pure 100 (refined)");
    expect(head(sheetOf(sc, withAnswers(sc.c, { "FLD-GEN-001": undefined })), "material")).toMatchObject({ text: "OLIVIA Pure 100", state: "answered" });
    // the live map's last fallback when the case can't be read is the case id: never shown as the trade name
    expect(head(sheetOf(sc, withAnswers(sc.c, { "FLD-GEN-001": undefined }, { materialName: sc.c.id })), "material")).toMatchObject({ text: NOT_ANSWERED, state: "empty" });
  });

  it("Supplier: FLD-GEN-002 as set at case start (later master edits ignored), else the supplier master", () => {
    const sc = new Scenario().toReview();
    sc.step("master renamed", (s, at) => updateSupplier(s, "u-admin", sc.c.supplierId, { name: "Solvaro Group S.A." }, at));
    expect(head(sheetOf(sc), "supplier")).toMatchObject({ text: "Solvaro Oleochemicals S.A." });
    expect(head(sheetOf(sc), "supplier")).not.toHaveProperty("note");
    expect(head(sheetOf(sc, withAnswers(sc.c, { "FLD-GEN-002": undefined })), "supplier")).toMatchObject({ text: "Solvaro Group S.A.", state: "answered", note: "from the supplier master" });
  });

  it("Manufacturer: FLD-GEN-004 only; never the supplier's name the case started with", () => {
    const sc = new Scenario().toReview();
    const c = withAnswers(sc.c, { "FLD-GEN-004": undefined }, { justifications: {} });
    // the trap: manufacturerOf() and c.manufacturer fall back to the supplier
    expect(c.manufacturer).toBeTruthy();
    expect(manufacturerOf(c)).toBe(c.manufacturer);
    expect(head(sheetOf(sc, c), "manufacturer")).toMatchObject({ text: NOT_ANSWERED, state: "empty" });
    expect(head(sheetOf(sc, c), "manufacturer")).not.toHaveProperty("at");
    expect(JSON.stringify(sheetOf(sc, c).header.find((h) => h.key === "manufacturer"))).not.toContain(c.manufacturer);
  });

  it("shows a supplier's 'Cannot provide' justification as such, not as unanswered", () => {
    const sc = new Scenario().toReview();
    const c = withAnswers(sc.c, { "FLD-GEN-004": undefined }, { justifications: { ...sc.c.justifications, "FLD-GEN-004": "Toll manufacturer under NDA." } });
    expect(head(sheetOf(sc, c), "manufacturer")).toMatchObject({ text: "Cannot provide: Toll manufacturer under NDA.", state: "cannot-provide" });
  });
});

describe("the composition", () => {
  const base = () => new Scenario().toReview();

  it("CAS # and EC # show '—' when blank; EC # may hold a REACH registration number", () => {
    const sc = base();
    const sh = sheetOf(sc, { ...sc.c, components: [row("c1", "vegetable", { cas: "  " }), row("c2", "vegetable", { cas: "59-02-9", ec: "01-2119485492-27-0000" })] });
    expect(sh.rows.map((r) => [r.cas, r.ec])).toEqual([
      ["—", "—"],
      ["59-02-9", "01-2119485492-27-0000"],
    ]);
  });

  it("% is the CIQ's range: '10–20 %', one value when min = max, '—' while blank or invalid", () => {
    expect(rmesConcText({ concMin: 10, concMax: 20 })).toBe("10–20 %");
    expect(rmesConcText({ concMin: 99.5, concMax: 100 })).toBe("99.5–100 %");
    expect(rmesConcText({ concMin: 5, concMax: 5 })).toBe("5 %");
    expect(rmesConcText({ concMin: 100, concMax: 100 })).toBe("100 %");
    expect(rmesConcText({ concMin: null, concMax: null })).toBe("—");
    // an invalid range reaches review on a legacy case or a Part 2 save: shown as entered, never as a blank
    expect(rmesConcText({ concMin: 10, concMax: null })).toBe("10–? %");
    expect(rmesConcText({ concMin: 20, concMax: 10 })).toBe("20–10 %");
    expect(rmesConcText({ concMin: 80, concMax: 120 })).toBe("80–120 %");
    expect(rmesConcText({ concMin: 0, concMax: 0 })).toBe("—"); // a legacy blank row
    expect(rmesConcText({ concMin: 0, concMax: 0.5 })).toBe("0–0.5 %");
  });

  it("one constant maps every Source of origin to its CIQ free-text field(s)", () => {
    expect(Object.keys(ORIGIN_TEXT_FIELDS).sort()).toEqual(Object.keys(ORIGIN_LABEL).sort());
    expect(ORIGIN_TEXT_FIELDS).toEqual({
      vegetable: ["FLD-2.1-101", "FLD-2.3-10"],
      animal: ["FLD-2.1-101", "FLD-2.3-10"],
      petrochemical: ["FLD-2.3-11"],
      mineral: ["FLD-2.3-12"],
      ccu: ["FLD-2.3-13"],
      polymer: ["FLD-2.3-14"],
      waste: ["FLD-2.3-15"],
      chemrec: ["FLD-2.3-16"],
    });
  });

  it("the free text per origin: vegetable with Part(s) (the multi-select as text) and Country, the others their specification", () => {
    const sc = base();
    const answers = { "FLD-2.1-101": ["Seed", "Kernel"], "FLD-2.3-10": "Ukraine, Moldova", "FLD-2.3-11": "Paraffin wax", "FLD-2.3-12": "Talc from Finland", "FLD-2.3-13": "CO₂ from a cement plant", "FLD-2.3-14": "Polydimethylsiloxane", "FLD-2.3-15": "Used cooking oil", "FLD-2.3-16": "Pyrolysis oil of mixed plastics" };
    const origins: OriginType[] = ["vegetable", "animal", "petrochemical", "mineral", "ccu", "polymer", "waste", "chemrec"];
    const c = withAnswers({ ...sc.c, components: origins.map((o, i) => row(`c${i + 1}`, o)) }, answers);
    const sh = sheetOf(sc, c);
    expect(sh.rows.map((r) => [r.originLabel, r.freeText.map((t) => `${t.source.fieldId}: ${t.text}`)])).toEqual([
      ["Vegetable (bio mass)", ["FLD-2.1-101: Seed, Kernel", "FLD-2.3-10: Ukraine, Moldova"]],
      ["Animal", ["FLD-2.1-101: Seed, Kernel", "FLD-2.3-10: Ukraine, Moldova"]],
      ["Petrochemical / fossil", ["FLD-2.3-11: Paraffin wax"]],
      ["Mineral", ["FLD-2.3-12: Talc from Finland"]],
      ["Carbon capture (CCU)", ["FLD-2.3-13: CO₂ from a cement plant"]],
      ["Polymer", ["FLD-2.3-14: Polydimethylsiloxane"]],
      ["Waste / side stream", ["FLD-2.3-15: Used cooking oil"]],
      ["Chemical recycling of post-consumer plastic", ["FLD-2.3-16: Pyrolysis oil of mixed plastics"]],
    ]);
    expect(sh.rows[2]!.freeText[0]!.source).toEqual({ fieldId: "FLD-2.3-11", label: "Fossil specification (e.g. oil, wax, gas)", sectionId: "K2.3" });
    expect(sh.columns.find((x) => x.key === "freeText")!.sources.map((x) => x.fieldId)).toEqual(["FLD-2.1-101", "FLD-2.3-10", "FLD-2.3-11", "FLD-2.3-12", "FLD-2.3-13", "FLD-2.3-14", "FLD-2.3-15", "FLD-2.3-16"]);
  });

  it("a free text not given yet reads 'Not answered yet'; a justification reads 'Cannot provide: …'", () => {
    const sc = base();
    const c = withAnswers({ ...sc.c, components: [row("c1", "petrochemical"), row("c2", "vegetable")], justifications: { "FLD-2.3-10": "Several farms; the list is confidential." } }, { "FLD-2.1-101": undefined, "FLD-2.3-10": undefined });
    const [petro, veg] = sheetOf(sc, c).rows;
    expect(petro!.freeText).toEqual([{ text: NOT_ANSWERED, state: "empty", source: expect.objectContaining({ fieldId: "FLD-2.3-11" }) }]);
    expect(veg!.freeText.map((t) => [t.text, t.state])).toEqual([
      [NOT_ANSWERED, "empty"],
      ["Cannot provide: Several farms; the list is confidential.", "cannot-provide"],
    ]);
  });

  it("two rows of the same origin share the origin's one free text (it is asked once per origin type)", () => {
    const sc = new Scenario().create().metadata({ ...PLAIN_CONFIG, SF01: ["vegetable", "petrochemical"] }).fillMandatory().confirm();
    const c = withAnswers({ ...sc.c, components: [row("c1", "vegetable"), row("c2", "petrochemical"), row("c3", "vegetable", { inci: "Tocopherol", concMin: 0.1, concMax: 0.5 })] }, { "FLD-2.3-10": "Spain" });
    const sh = sheetOf(sc, c);
    expect(sh.rows.map((r) => r.rowId)).toEqual(["c1", "c2", "c3"]); // the K2.1 order
    expect(sh.rows[0]!.freeText).toEqual(sh.rows[2]!.freeText);
    expect(sh.rows[2]!.freeText.map((t) => t.text)).toContain("Spain");
    expect(sh.sharedOrigins).toEqual(["vegetable"]);
    expect(sh.footnote).toBe(RMES_FREE_TEXT_NOTE);
  });

  it("a vegetable and an animal row share the one Part(s) and Country (the CIQ asks them once for both)", () => {
    const sc = new Scenario().create().metadata({ ...PLAIN_CONFIG, SF01: ["vegetable", "animal", "petrochemical"] }).fillMandatory().confirm();
    const c = withAnswers({ ...sc.c, components: [row("c1", "vegetable"), row("c2", "animal"), row("c3", "petrochemical")] }, { "FLD-2.1-101": ["Seed"], "FLD-2.3-10": "Spain" });
    const sh = sheetOf(sc, c);
    const [veg, ani] = sh.rows;
    expect(veg!.freeText.map((t) => t.source.fieldId)).toEqual(["FLD-2.1-101", "FLD-2.3-10"]);
    expect(ani!.freeText).toEqual(veg!.freeText);
    expect(ani!.freeText.map((t) => t.text)).toEqual(["Seed", "Spain"]);
    expect(sh.sharedOrigins).toEqual(["vegetable", "animal"]); // both starred, the petrochemical row not
    expect(sh.footnote).toBe(RMES_FREE_TEXT_NOTE);
    expect(RMES_FREE_TEXT_NOTE).toContain("vegetable and animal together");
    // one vegetable row alone shares nothing
    expect(sheetOf(sc, { ...c, components: [row("c1", "vegetable"), row("c3", "petrochemical")] }).sharedOrigins).toEqual([]);
  });

  it("no components yet: an empty table, the header still filled", () => {
    const sc = base();
    const sh = sheetOf(sc, { ...sc.c, components: [] });
    expect(sh.rows).toEqual([]);
    expect(sh.sharedOrigins).toEqual([]);
    expect(sh.columns.find((x) => x.key === "freeText")!.sources).toEqual([]);
    expect(head(sh, "material").text).toBe("OLIVIA Pure 100");
  });
});

describe("a case the role can't read (live: !ref.readable)", () => {
  it("shows the one notice instead of the 8 fields", () => {
    const sc = new Scenario().toReview();
    const r = rmesSheet(sc.s, { ...sc.c, materialName: sc.c.id, components: [], answers: {} }, { readable: false });
    expect(r).toEqual({ readable: false, caseId: sc.id, record: `RMES · ${sc.id} · internal: never visible to the supplier · filled automatically from the CIQ`, recordAt: sc.c.rmes!.createdAt, notice: RMES_UNREADABLE });
    expect(RMES_UNREADABLE).toBe("Kissflow did not let your role read this case's questionnaire, so the RMES can't be filled.");
    expect(r).not.toHaveProperty("header");
    expect(r).not.toHaveProperty("rows");
    // readable (the prototype, or a case read in full): the sheet
    expect(rmesSheet(sc.s, sc.c, { readable: true }).readable).toBe(true);
    expect(rmesSheet(sc.s, sc.c).readable).toBe(true);
  });
});
