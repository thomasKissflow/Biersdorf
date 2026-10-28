import { describe, expect, it } from "vitest";
import { PLAIN_CONFIG } from "@/domain/testkit";
import type { ScopeItem } from "@/domain/types";
import { BUNDLE_JSON } from "./fixtures";
import { configOf, pinOf } from "./bundle";
import { liveScope, manualScope, scopeRows, storedScope, supplierReason } from "./scope";

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
