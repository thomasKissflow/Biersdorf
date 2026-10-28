import { describe, expect, it } from "vitest";
import { deriveScope, diffScope, growScope, hasUndefinedOrigin, requiredEvidence, undefinedOrigins } from "./rules";

const app = (items: ReturnType<typeof deriveScope>, id: string) => items.find((i) => i.sectionId === id)?.applicability;

describe("deriveScope", () => {
  it("is reproducible for the same answers and rule-set version (REQ-PROC-009)", () => {
    const c = { SF01: ["vegetable" as const], SF09: true, SF11: ["EU" as const] };
    expect(deriveScope(c, "RS-2026.1")).toEqual(deriveScope(c, "RS-2026.1"));
  });

  it("vegetable activates Annex 1 through R-10; no metadata rule for palm (R-80 dropped, FLD-A1-204 asks it)", () => {
    const c = { SF01: ["vegetable" as const] };
    const s = deriveScope(c, "RS-2026.1");
    expect(app(s, "A1")).toBe("mandatory");
    expect(s.find((i) => i.sectionId === "A1")!.firedRules).toEqual(["R-10"]);
    expect(requiredEvidence(c, "RS-2026.1").map((e) => e.doc)).not.toContain("RSPO certificate with supply-chain model");
  });

  it("mineral origin hides GMO (A3) and palm-specific parts stay internal (REQ-PROC-009 example)", () => {
    const s = deriveScope({ SF01: ["mineral"] }, "RS-2026.1");
    expect(app(s, "A3")).toBe("na");
    expect(app(s, "A1")).toBe("mandatory");
  });

  it("mineral oil entered as Mineral still gets MOAH via SF-07", () => {
    const s = deriveScope({ SF01: ["mineral"], SF07: true }, "RS-2026.1");
    expect(app(s, "A4")).toBe("mandatory");
    expect(app(s, "A9")).toBe("mandatory");
  });

  it("blends get the union of annexes", () => {
    const s = deriveScope({ SF01: ["vegetable", "petrochemical"] }, "RS-2026.1");
    expect(app(s, "A2")).toBe("mandatory");
    expect(app(s, "A4")).toBe("mandatory");
  });

  it("SF-12 = No waives K5.1 but keeps K5.2 mandatory", () => {
    const s = deriveScope({ SF01: ["vegetable"], SF12: false }, "RS-2026.1");
    expect(app(s, "K5.1")).toBe("na");
    expect(app(s, "K5.2")).toBe("mandatory");
  });

  it("EU REACH annex always applies; Turkey sections exist only from template v2 / RS-2026.2", () => {
    const v1 = deriveScope({ SF01: ["vegetable"], SF11: ["TR"] }, "RS-2026.1", "CIQ-2026 v1");
    expect(app(v1, "A10")).toBe("mandatory");
    expect(app(v1, "K6.3")).toBeUndefined();
    const v2 = deriveScope({ SF01: ["vegetable"], SF11: ["TR"] }, "RS-2026.2", "CIQ-2026 v2");
    expect(app(v2, "K6.3")).toBe("mandatory");
    expect(app(v2, "A12")).toBe("mandatory");
  });

  it("flags origins without rules (waste, CCU, chemical recycling) for RMM's Part 2 review (OP-19, AS-09)", () => {
    expect(hasUndefinedOrigin({ SF01: ["ccu"] })).toBe(true);
    expect(hasUndefinedOrigin({ SF01: ["vegetable"] })).toBe(false);
    expect(hasUndefinedOrigin({})).toBe(false);
    expect(undefinedOrigins({ SF01: ["waste", "vegetable", "chemrec"] })).toEqual(["waste", "chemrec"]);
  });

  it("origins without rules get the standard sections only", () => {
    const s = deriveScope({ SF01: ["ccu"], SF11: ["EU"] }, "RS-2026.1");
    for (const id of ["GEN", "K1", "K2.1", "K2.3", "A10"]) expect(app(s, id)).toBe("mandatory");
    for (const id of ["A1", "A2", "A4", "A9"]) expect(app(s, id)).toBe("na");
  });
});

describe("diffScope", () => {
  it("lists added and removed sections when an origin changes (REQ-CFG-008)", () => {
    const before = deriveScope({ SF01: ["vegetable"] }, "RS-2026.1");
    const after = deriveScope({ SF01: ["petrochemical"] }, "RS-2026.1");
    const d = diffScope(before, after);
    expect(d.added).toContain("A4");
    expect(d.removed).toContain("A2");
  });
});

describe("growScope (after the completeness confirmation the scope only grows, REQ-CFG-008)", () => {
  it("adds newly derived sections and keeps sections the new answers would close", () => {
    const before = deriveScope({ SF01: ["vegetable"] }, "RS-2026.1");
    const g = growScope(before, deriveScope({ SF01: ["petrochemical"] }, "RS-2026.1"));
    expect(g.added).toContain("A4");
    expect(g.scope.find((i) => i.sectionId === "A4")).toMatchObject({ applicability: "mandatory", addedLater: true });
    expect(g.kept).toContain("A2");
    const a2 = g.scope.find((i) => i.sectionId === "A2")!;
    expect(a2.applicability).toBe("mandatory");
    expect(a2.reason).toContain("REQ-CFG-008");
    expect(g.added).not.toContain("A1"); // applied before and after
    expect(g.scope).toHaveLength(before.length);
  });

  it("never lowers mandatory: SF-12 Yes → No keeps K5.1 mandatory", () => {
    const g = growScope(deriveScope({ SF01: ["vegetable"], SF12: true }, "RS-2026.1"), deriveScope({ SF01: ["vegetable"], SF12: false }, "RS-2026.1"));
    expect(app(g.scope, "K5.1")).toBe("mandatory");
    expect(g.kept).toEqual(["K5.1"]);
  });

  it("is stable: growing twice with the same answers adds nothing and does not repeat the note", () => {
    const once = growScope(deriveScope({ SF01: ["vegetable"] }, "RS-2026.1"), deriveScope({ SF01: ["mineral"] }, "RS-2026.1"));
    const twice = growScope(once.scope, deriveScope({ SF01: ["mineral"] }, "RS-2026.1"));
    expect(twice.added).toEqual([]);
    expect(twice.scope.find((i) => i.sectionId === "A2")!.reason.match(/REQ-CFG-008/g)).toHaveLength(1);
  });

  it("keeps a manual extension and sections that exist only in the earlier template", () => {
    const before = deriveScope({ SF01: ["vegetable"], SF11: ["TR"] }, "RS-2026.2", "CIQ-2026 v2").map((i) =>
      i.sectionId === "A5" ? { ...i, applicability: "mandatory" as const, manual: { by: "u-reg", at: "2026-10-01T00:00:00Z", justification: "UV claim" }, addedLater: true } : i,
    );
    const g = growScope(before, deriveScope({ SF01: ["vegetable"], SF11: ["TR"] }, "RS-2026.1", "CIQ-2026 v1"));
    expect(g.scope.find((i) => i.sectionId === "A5")?.manual?.justification).toBe("UV claim");
    expect(app(g.scope, "K6.3")).toBe("mandatory");
  });
});
