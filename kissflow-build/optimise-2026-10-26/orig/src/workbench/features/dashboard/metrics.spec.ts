import { describe, expect, it } from "vitest";
import { attentionItems, bottleneckByStep, byDepartment, caseSide, coverageOf, createdIndex, daysBetween, kpis, partialWhat, pointWaitsOnSupplier, scopeOps } from "./metrics";
import { ALEX, NOW, opsFixture } from "./ops.fixtures";

const ops = () => scopeOps(opsFixture());
const FULL = { cases: true, points: true, crs: true, events: true, runs: true };

describe("dashboard metrics: basics", () => {
  it("scopeOps drops test cases, drafts and their points and change requests (CR linked by code + cycle)", () => {
    const o = ops();
    expect(o.cases.map((c) => c._id)).toEqual(["C1", "C2", "C3", "C4", "C6"]);
    expect(o.points.map((p) => p._id)).toEqual(["P1", "P2", "P3"]);
    expect(o.crs.map((c) => c._id)).toEqual(["CR1"]);
  });

  it("coverage: only rung 1 and full Form reads are complete; index-only cases make the cases partial", () => {
    const q = { cases: "admin", points: "mine+tasks", crs: "viewer", events: "form", runs: "failed" } as const;
    expect(coverageOf(q)).toEqual({ cases: true, points: false, crs: false, events: true, runs: false });
    expect(coverageOf(q, 2).cases).toBe(false);
    expect(partialWhat(coverageOf(q), ["cases", "points", "crs"])).toBe("open points and change requests");
    expect(partialWhat(FULL, ["cases", "points"])).toBeUndefined();
  });

  it("daysBetween: one decimal; null when a time is missing or the end lies before the start", () => {
    expect(daysBetween("2026-07-01T00:00:00Z", "2026-07-31T12:00:00Z")).toBe(30.5);
    expect(daysBetween("", "2026-07-31T00:00:00Z")).toBeNull();
    expect(daysBetween("2026-08-01T00:00:00Z", "2026-07-01T00:00:00Z")).toBeNull();
  });

  it("created time: _created_at, else the case's F8 'Item created' row", () => {
    const o = ops();
    const idx = createdIndex(o.cases, o.events);
    expect(idx.get("C1")).toBe("2026-09-01T08:00:00Z");
    expect(idx.get("C2")).toBe("2026-09-10T09:00:00Z");
  });

  it("sides: supplier steps S1/S3/S7; unknown without a readable step; points by step, else by response", () => {
    const o = ops();
    expect(o.cases.map(caseSide)).toEqual(["bdf", "supplier", "bdf", "unknown", "unknown"]);
    const [p1, p2, p3] = o.points;
    expect([pointWaitsOnSupplier(p1), pointWaitsOnSupplier(p2), pointWaitsOnSupplier(p3)]).toEqual([true, false, false]);
  });
});

describe("dashboard metrics: KPIs", () => {
  it("counts open cases by side, overdue points and lead time to final release", () => {
    const k = kpis(ops(), NOW, FULL);
    expect(k).toMatchObject({ open: 4, pastDue: 1, withSupplier: 1, withBdf: 2, stepUnknown: 1, statusUnknown: 0, completed: 1, cancelled: 0, openPoints: 2, overduePointsAtSupplier: 1, openCrs: 1, avgLeadDays: 30, leadN: 1, firstTimeRight: 100, ftrN: 1, avgRounds: 1.3 });
  });

  it("first-time-right is not computed on a partial open-points list", () => {
    expect(kpis(ops(), NOW, { points: false }).firstTimeRight).toBeNull();
  });

  it("a supplier open point on a released case lowers first-time-right", () => {
    const o = ops();
    const p = { ...o.points[2], caseItemId: "C4" };
    expect(kpis({ ...o, points: [o.points[0], o.points[1], p] }, NOW, FULL).firstTimeRight).toBe(0);
  });
});

describe("dashboard metrics: needs attention", () => {
  it("ranks rejections, overdue points, late supplier steps, scope checks and idle cases", () => {
    const o = ops();
    const items = attentionItems(o, o.cases, NOW, FULL);
    expect(items.map((i) => `${i.c._id}:${i.kind}`)).toEqual(["C3:rejected", "C3:overdue-points", "C2:supplier-late", "C1:scope-check", "C6:idle"]);
    expect(items[1]).toMatchObject({ days: 7, to: "/cases/C3?tab=points" });
    expect(items[2].days).toBe(8);
    expect(items[4]).toMatchObject({ days: 38, title: "No activity for 38 days" });
    expect(items[0].detail).toBe("Reason: Impurity profile missing");
  });

  it("no idle items without a complete audit log; 'My cases' keeps the owner's cases only", () => {
    const o = ops();
    expect(attentionItems(o, o.cases, NOW, { events: false }).some((i) => i.kind === "idle")).toBe(false);
    const mine = o.cases.filter((c) => c.ownerRmm?._id === ALEX);
    expect(attentionItems(o, mine, NOW, FULL).map((i) => i.kind)).toEqual(["supplier-late", "scope-check"]);
  });
});

describe("dashboard metrics: bottleneck and departments", () => {
  it("open cases per step in workflow order; S0 and S6 only when used; unreadable steps counted apart", () => {
    const v = bottleneckByStep(ops().cases, NOW);
    expect(v.rows.map((r) => `${r.step}=${r.count}`)).toEqual(["CASE_S1=0", "CASE_S2=1", "CASE_S3=1", "CASE_PAR=1", "CASE_S5=0", "CASE_S7=0", "CASE_S8=0"]);
    expect(v.rows.find((r) => r.step === "CASE_S3")).toMatchObject({ side: "supplier", pastDue: 1 });
    expect(v.unknown).toBe(1);
    expect(v.top?.step).toBe("CASE_S2");
  });

  it("per department: open review tracks, open points by holder, overdue points, CRs to assess", () => {
    const rows = byDepartment(ops(), NOW);
    expect(rows.map((r) => r.dept)).toEqual(["REG", "SAF", "QM", "MIC", "SUS"]);
    expect(rows.find((r) => r.dept === "SAF")).toMatchObject({ inReview: 1, pointsAtSupplier: 1, pointsAtBdf: 0, overduePoints: 1, crToAssess: 1 });
    expect(rows.find((r) => r.dept === "REG")).toMatchObject({ inReview: 0, pointsAtSupplier: 0, pointsAtBdf: 1, overduePoints: 0, crToAssess: 0 });
    expect(rows.find((r) => r.dept === "QM")).toMatchObject({ inReview: 0, pointsAtSupplier: 0, pointsAtBdf: 0 });
  });
});
