import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { requestedDocuments } from "@/domain/requestedDocs";
import { releaseBlockers } from "@/domain/selectors";
import { PLAIN_CONFIG, Scenario } from "@/domain/testkit";
import type { CiqCase, ScopeItem } from "@/domain/types";
import { BUNDLE_JSON } from "./fixtures";
import { configOf, pinOf } from "./bundle";
import { liveScope, manualScope, requestedDocRows, scopeRows, storedScope, storedSlots, supplierReason } from "./scope";

const pin = pinOf({ _id: "PkR", Config_Bundle_JSON: BUNDLE_JSON });
const cfg = configOf([pin]);
const base = { ruleSetVersion: pin.ruleSetVersion, templateVersion: pin.templateVersion, cfg, stored: [] as ScopeItem[], manual: [] };
const on = (scope: ScopeItem[]) => scope.filter((s) => s.applicability !== "na").map((s) => s.sectionId);

describe("live scope in the portal (B-06…B-08, B-28)", () => {
  it("Part 1: sections open and close live with the metadata answers", () => {
    const veg = on(liveScope({ ...base, part: "part1", config: { ...PLAIN_CONFIG, SF01: ["vegetable"] } }));
    const animal = on(liveScope({ ...base, part: "part1", config: { ...PLAIN_CONFIG, SF01: ["animal"] } }));
    expect(veg).toContain("A2");
    expect(animal).not.toContain("A2"); // closed again: Part 1 follows the answers both ways
  });

  it("Part 2: the scope only grows from what was stored, the closing answer is 'kept'", () => {
    const stored = liveScope({ ...base, part: "part1", config: { ...PLAIN_CONFIG, SF01: ["vegetable"] } });
    const after = liveScope({ ...base, part: "part2", stored: storedScope(scopeRows(stored)), config: { ...PLAIN_CONFIG, SF01: ["animal"] } });
    expect(on(after)).toEqual(expect.arrayContaining(on(stored)));
    const grown = on(after).filter((id) => !on(stored).includes(id));
    expect(after.filter((s) => grown.includes(s.sectionId)).every((s) => s.addedLater)).toBe(true);
  });

  it("locked: the stored scope as it is", () => {
    const stored = storedScope([{ sectionId: "GEN", applicability: "mandatory", reason: "Every case" }]);
    expect(liveScope({ ...base, part: "locked", stored, config: PLAIN_CONFIG })).toEqual(stored);
  });

  it("merges the sections a department added (Manual_Scope_JSON) and never lowers them", () => {
    const manual = manualScope([{ sectionId: "A4", applicability: "mandatory", addedLater: true, at: "2026-10-15T09:00:00Z" }, { junk: 1 }]);
    const s = liveScope({ ...base, part: "part2", stored: storedScope(scopeRows(liveScope({ ...base, part: "part1", config: PLAIN_CONFIG }))), manual, config: PLAIN_CONFIG });
    expect(s.find((x) => x.sectionId === "A4")).toMatchObject({ applicability: "mandatory", addedLater: true });
  });

  it("writes Scope_JSON in supplier wording: no rule ids, no SF codes (D-10), one 'kept' note however often grown", () => {
    const rows = scopeRows(liveScope({ ...base, part: "part1", config: { ...PLAIN_CONFIG, SF03: true } }));
    expect(JSON.stringify(rows)).not.toMatch(/\bR-\d|SF-\d|firedRules/);
    expect(supplierReason("Polymer (SF-03) is Yes → R-31; Every case → R-00")).toBe("Polymer is Yes; Every case");
    const once = supplierReason("Origin includes Vegetable → R-10 · kept: the scope only grows after the completeness confirmation (REQ-CFG-008)");
    expect(supplierReason(`${once} · kept: the scope only grows after the completeness confirmation (REQ-CFG-008)`)).toBe(once);
    expect(once).not.toMatch(/REQ-/);
  });
});

describe("Requested_Docs_JSON: an optional requested document (Thomas, 29 Oct)", () => {
  const ADMIN = "u-admin";
  const POLY = "Polymer statement";
  const K_POLY = "EV:polymer-statement";
  /** RS-2026.3: R-122 asks for the polymer statement as optional when SF-03 is Yes, R-123 as mandatory when SF-06 is
   *  Yes. A case with SF-03 Yes and SF-06 No leaves it out, confirms, then answers SF-03 No (the slot is kept). */
  function world() {
    const sc = new Scenario();
    sc.step("publish v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
    sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "Polymer statement", at));
    sc.step("R-122", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF03", value: true }, activates: [], outcome: "mandatory", evidence: [POLY], optionalEvidence: [POLY], departments: ["SAF"], basis: "agreed" }, at).state);
    sc.step("R-123", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "is", question: "SF06", value: true }, activates: [], outcome: "mandatory", evidence: [POLY], departments: ["SAF"], basis: "agreed" }, at).state);
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Polymer statement.", at));
    sc.create({ materialNo: "RM-520001" }).metadata({ ...PLAIN_CONFIG, SF03: true });
    return sc;
  }
  /** The case as the portal and the app read it back: the slots from the written rows (no rule ids). */
  const live = (sc: Scenario): CiqCase => ({ ...sc.c, requestedDocs: storedSlots(JSON.parse(JSON.stringify(requestedDocRows(sc.c, sc.s.config)))) });

  it("writes `optional` only when true, and reads it back; a row without it is mandatory", () => {
    const sc = world();
    expect(requestedDocRows(sc.c, sc.s.config)).toEqual([{ key: K_POLY, doc: POLY, sectionId: "K1", why: expect.stringContaining("Asked for because"), optional: true }]);
    expect(storedSlots([{ key: K_POLY, doc: POLY, sectionId: "K1", why: "" }])[0]).not.toHaveProperty("optional");
    expect(storedSlots([{ key: K_POLY, doc: POLY, sectionId: "K1", why: "", optional: "yes" }])[0]).not.toHaveProperty("optional");
  });

  it("a kept slot reads the same in the prototype and from the rows: optional, never blocking", () => {
    const sc = world();
    sc.fillMandatory().confirm();
    sc.metadata(PLAIN_CONFIG);
    for (const c of [sc.c, live(sc)]) {
      expect(requestedDocuments(c, sc.s.config).find((x) => x.key === K_POLY)).toMatchObject({ kept: true, optional: true });
      expect(releaseBlockers(c, sc.s.config).map((b) => b.fieldId)).not.toContain(K_POLY);
    }
    // R-123 fires now (SF-06 Yes): mandatory, in both, and the rows say so (no flag)
    sc.metadata({ ...PLAIN_CONFIG, SF06: true });
    for (const c of [sc.c, live(sc)]) expect(releaseBlockers(c, sc.s.config).map((b) => b.fieldId)).toContain(K_POLY);
    expect(requestedDocRows(sc.c, sc.s.config).find((x) => x.key === K_POLY)).not.toHaveProperty("optional");
  });
});
