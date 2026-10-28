import { describe, expect, it } from "vitest";
import { buildRichFixture } from "@/domain/richFixture";
import { buildSeed } from "@/domain/seed";
import { CASE_TAB_TEST, caseMatches } from "./caseFilters";

const s = buildRichFixture();
const find = (q: string) => s.cases.filter((c) => caseMatches(s, c, q)).map((c) => c.id);

describe("Cases register: tabs and search (REQ-PROC-006)", () => {
  it("splits the open cases into Part 1 and Part 2", () => {
    const n = (k: keyof typeof CASE_TAB_TEST) => s.cases.filter(CASE_TAB_TEST[k]).length;
    expect(n("open")).toBe(n("part1") + n("part2"));
    expect(n("open") + n("completed") + n("cancelled")).toBe(s.cases.length);
    expect(n("part1")).toBeGreaterThan(0);
    expect(n("part2")).toBeGreaterThan(0);
  });

  it("finds cases by supplier DUNS, with or without dashes", () => {
    const valmont = s.suppliers.find((x) => x.duns === "087342615")!;
    const ids = s.cases.filter((c) => c.supplierId === valmont.id).map((c) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(find("087342615").sort()).toEqual(ids.sort());
    expect(find("087-342-615").sort()).toEqual(ids.sort());
  });

  it("finds a case by BDF material no. ignoring spaces and dashes, and by main INCI", () => {
    const c = s.cases.find((x) => x.materialNo.includes("-"))!;
    expect(find(c.materialNo.replace("-", " ").toLowerCase())).toContain(c.id);
    expect(find(c.inci.toUpperCase())).toContain(c.id);
  });

  it("finds a case by the CAS number of a component", () => {
    const c = s.cases.find((x) => x.components.some((r) => r.cas))!;
    const cas = c.components.find((r) => r.cas)!.cas!;
    expect(find(cas)).toContain(c.id);
  });

  it("matches everything for an empty query and nothing on the empty start", () => {
    expect(find("  ").length).toBe(s.cases.length);
    const e = buildSeed();
    expect(e.cases.filter((c) => caseMatches(e, c, "CIQ"))).toEqual([]);
  });
});
