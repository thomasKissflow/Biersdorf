import { describe, expect, it } from "vitest";
import { setOwnership } from "@/domain/actions";
import { kpis } from "@/domain/metrics";
import { buildRichFixture } from "@/domain/richFixture";
import { buildSeed } from "@/domain/seed";
import { isClosed } from "@/domain/selectors";
import type { AppState } from "@/domain/types";
import { EMPTY_FILTERS, filterEvents, flattenAudit } from "./auditData";
import { clarificationView, flowView, fmtDays, fmtPct, hotspotView, leadTimeView, originView, periodView, pipelineView, scopeToDept, supplierView, workloadView } from "./reportData";

const T = "2026-10-14T08:00:00.000Z";

/** Every sentence the Reports page writes from the data, for one state. */
function sentences(s: AppState): string[] {
  const lead = leadTimeView(s);
  return [
    pipelineView(s, T).takeaway,
    lead.phaseTakeaway,
    lead.caseTakeaway,
    flowView(s).takeaway,
    originView(s).takeaway,
    workloadView(s, "").takeaway,
    workloadView(s, "SAF").takeaway,
    hotspotView(s, "").takeaway,
    hotspotView(scopeToDept(s, "REG"), "REG").takeaway,
    supplierView(s).takeaway,
  ];
}

describe("reports on the empty start", () => {
  const s = buildSeed();

  it("formats missing metrics as a dash, never 0 % or 0 d", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtDays(null)).toBe("—");
    expect(fmtDays(Number.NaN)).toBe("—");
    expect(fmtPct(80)).toBe("80 %");
  });

  it("has no basis for any average or share", () => {
    const k = kpis(s);
    expect([k.avgLeadTime, k.firstTimeRight, k.avgRounds]).toEqual([null, null, null]);
    const lead = leadTimeView(s);
    expect([lead.avgSupplier, lead.avgBdf, lead.supplierShare]).toEqual([null, null, null]);
    expect(clarificationView(s)).toEqual({ raised: 0, answered: 0, avgRounds: null, onTimePct: null });
    expect(periodView(s)).toEqual({ cases: 0, since: undefined });
  });

  it("marks every card as empty", () => {
    const p = pipelineView(s, T);
    expect(p.open).toBe(0);
    expect(p.needsAttention).toBe(0);
    expect(p.phases.every((x) => x.count === 0)).toBe(true);
    expect(flowView(s).empty).toBe(true);
    expect(workloadView(s, "").empty).toBe(true);
    expect(originView(s).groups).toEqual([]);
    expect(hotspotView(s, "").rows).toEqual([]);
    const sup = supplierView(s);
    expect(sup.anyQueries).toBe(false);
    expect(sup.rows.every((r) => r.avgResponseDays === null && r.onTimePct === null && sup.flag(r) === null)).toBe(true);
  });

  it("writes plain sentences without broken numbers", () => {
    for (const t of sentences(s)) {
      expect(t).not.toMatch(/NaN|Infinity|undefined|null/);
      expect(t).not.toMatch(/\b0[\s ]?(%|d\b|days)/);
    }
    expect(pipelineView(s, T).takeaway).toBe("No case has been started yet.");
    expect(workloadView(s, "").takeaway).toBe("No review has started yet.");
  });
});

describe("reports on the rich fixture", () => {
  const s = buildRichFixture();

  it("counts the open cases by phase and lists only open cases as needing attention", () => {
    const p = pipelineView(s, T);
    const open = s.cases.filter((c) => !isClosed(c));
    expect(p.open).toBe(open.length);
    expect(p.phases.reduce((a, b) => a + b.count, 0)).toBe(open.length);
    for (const a of p.attention) for (const c of a.cases) expect(isClosed(c)).toBe(false);
    expect(p.needsAttention).toBeLessThanOrEqual(open.length);
  });

  it("breaks the lead time down over the completed cases", () => {
    const lead = leadTimeView(s);
    expect(lead.done.length).toBeGreaterThan(0);
    expect(lead.supplierShare).not.toBeNull();
    expect(lead.phases.every((x) => Number.isFinite(x.days))).toBe(true);
    expect(lead.perCase).toHaveLength(lead.done.length);
  });

  it("writes plain sentences without broken numbers", () => {
    for (const t of sentences(s)) expect(t).not.toMatch(/NaN|Infinity|undefined|null|—/);
  });
});

describe("audit trail", () => {
  it("is empty on the empty start", () => {
    expect(flattenAudit(buildSeed())).toEqual([]);
  });

  it("lists configuration changes next to case events, filterable by area", () => {
    const s = setOwnership(buildRichFixture(), "u-admin", "K2.2", "QM", ["SAF"], T);
    const events = flattenAudit(s);
    const config = filterEvents(events, { ...EMPTY_FILTERS, area: "config" });
    expect(config).toHaveLength(1);
    expect(config[0]).toMatchObject({ area: "config", caseId: "", action: "Changed section ownership", who: "Nina Hoffmann", side: "internal" });
    expect(filterEvents(events, { ...EMPTY_FILTERS, area: "case" }).every((e) => e.caseId !== "")).toBe(true);
    // newest first
    expect(events[0].at >= events.at(-1)!.at).toBe(true);
  });
});
