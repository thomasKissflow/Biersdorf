import { describe, expect, it } from "vitest";
import { casesByOrigin, deptWorkload, fmtMetric, kpis, leadTimeByPhase, monthlyFlow, pipeline, queryHotspots, supplierPerformance } from "./metrics";
import { buildRichFixture } from "./richFixture";
import { buildSeed } from "./seed";
import { Scenario } from "./testkit";

/** Every number in a metric result is finite or null (never NaN or Infinity). */
function finiteOrNull(x: unknown): boolean {
  if (x === null || x === undefined) return true;
  if (typeof x === "number") return Number.isFinite(x);
  if (Array.isArray(x)) return x.every(finiteOrNull);
  if (typeof x === "object") return Object.values(x as Record<string, unknown>).every(finiteOrNull);
  return true;
}

describe("zero-data safe metrics", () => {
  const now = "2026-10-14T08:00:00.000Z";

  it("with no case, averages and percentages are null and counts are 0", () => {
    const s = buildSeed();
    expect(kpis(s, now)).toEqual({ open: 0, withSupplier: 0, withBdf: 0, overdueCases: 0, overduePoints: 0, avgLeadTime: null, completed: 0, firstTimeRight: null, avgRounds: null });
    expect(deptWorkload(s, now).every((d) => d.avgReviewDays === null && d.active === 0)).toBe(true);
    expect(leadTimeByPhase(s).every((p) => p.days === null)).toBe(true);
    expect(supplierPerformance(s, now)).toEqual([{ supplierId: "s1", name: "Solvaro Oleochemicals S.A.", cases: 0, open: 0, queries: 0, avgResponseDays: null, avgRounds: null, onTimePct: null }]);
    expect(pipeline(s).every((p) => p.count === 0)).toBe(true);
    expect(casesByOrigin(s)).toEqual([]);
    expect(queryHotspots(s)).toEqual([]);
    for (const m of [kpis(s, now), deptWorkload(s, now), leadTimeByPhase(s), supplierPerformance(s, now), monthlyFlow(s)]) expect(finiteOrNull(m)).toBe(true);
  });

  it("fmtMetric shows — for no data, never 0 %, NaN or 0 d", () => {
    expect(fmtMetric(null, "d")).toBe("—");
    expect(fmtMetric(undefined, "%")).toBe("—");
    expect(fmtMetric(Number.NaN, "d")).toBe("—");
    expect(fmtMetric(Infinity)).toBe("—");
    expect(fmtMetric(12.5, "d")).toBe("12.5 d");
    expect(fmtMetric(0, "%")).toBe("0 %");
  });

  it("one released case gives a lead time; a case with points gives rounds", () => {
    const sc = new Scenario().toReview();
    sc.raise("QM", "u-qm").answer(sc.op().id).decide(sc.op().id, "u-qm").completeAll().release();
    const k = kpis(sc.s, new Date(sc.t).toISOString());
    expect(k.completed).toBe(1);
    expect(typeof k.avgLeadTime).toBe("number");
    expect(k.avgRounds).toBe(1);
    expect(k.firstTimeRight).toBe(0);
    expect(finiteOrNull(supplierPerformance(sc.s))).toBe(true);
  });

  it("the rich fixture has numbers everywhere", () => {
    const s = buildRichFixture();
    const k = kpis(s);
    expect(k.avgLeadTime).toBeGreaterThan(0);
    expect(k.firstTimeRight).not.toBeNull();
    for (const m of [k, deptWorkload(s), leadTimeByPhase(s), supplierPerformance(s), monthlyFlow(s)]) expect(finiteOrNull(m)).toBe(true);
  });
});
