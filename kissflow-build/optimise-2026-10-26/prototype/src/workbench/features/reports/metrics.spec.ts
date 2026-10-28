import { describe, expect, it } from "vitest";
import { scopeOps } from "../dashboard/metrics";
import { NOW, opsFixture } from "../dashboard/ops.fixtures";
import { leadTimeView, reviewDoneAt, scopeReleasedIndex, supplierPerformance } from "./metrics";

const ops = () => scopeOps(opsFixture());

describe("report metrics: lead time by stage", () => {
  it("scope released = the first scope run of the case", () => {
    expect(scopeReleasedIndex(ops().runs).get("C3")).toBe("2026-08-03T00:00:00Z");
  });

  it("review done only when every active review track is completed", () => {
    const [, , c3, c4] = ops().cases;
    expect(reviewDoneAt(c3)).toBeNull();
    expect(reviewDoneAt(c4)).toBe("2026-07-23T00:00:00Z");
  });

  it("averages each stage over the cases that finished it; total runs to final release", () => {
    const v = leadTimeView(ops());
    expect(v.stages.map((s) => [s.id, s.n, s.avg])).toEqual([
      ["setup", 2, 2],
      ["supplier", 2, 13.5],
      ["review", 1, 10],
      ["release", 1, 8],
    ]);
    expect(v.stages[1]).toMatchObject({ min: 10, max: 17, side: "supplier" });
    expect(v.total).toEqual({ n: 1, avg: 30 });
    expect(v.takeaway).toBe("“Supplier questionnaire” takes longest: 13.5 days on average (2 cases).");
  });

  it("no finished stage: no numbers, a plain sentence", () => {
    const v = leadTimeView({ ...ops(), cases: [], runs: [] });
    expect(v.stages.every((s) => s.n === 0 && s.avg === null)).toBe(true);
    expect(v.takeaway).toMatch(/No case has finished a stage yet/);
  });
});

describe("report metrics: supplier performance", () => {
  it("per supplier: cases, open points waiting and overdue, rounds, first-round acceptance; most overdue first", () => {
    const { rows, takeaway } = supplierPerformance(ops(), NOW);
    expect(rows.map((r) => r.code)).toEqual(["SUP-NWB", "SUP-LUM"]);
    expect(rows[0]).toEqual({ code: "SUP-NWB", name: "Northwind Botanicals GmbH", cases: 3, openCases: 3, atSupplier: 0, openPoints: 2, waitingPoints: 1, overduePoints: 1, avgRounds: 1.3, firstRound: 100 });
    expect(rows[1]).toMatchObject({ cases: 2, openCases: 1, atSupplier: 1, openPoints: 0, avgRounds: null, firstRound: null });
    expect(takeaway).toBe("Overdue answers: Northwind Botanicals GmbH (1).");
  });

  it("no supplier answer time is invented: the rows carry none", () => {
    const { rows } = supplierPerformance(ops(), NOW);
    for (const r of rows) expect(Object.keys(r).some((k) => /response|answer|onTime/i.test(k))).toBe(false);
  });
});
