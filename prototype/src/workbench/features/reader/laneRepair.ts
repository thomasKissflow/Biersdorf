// Case Admin lane repair, the UI side (§7.10, §8.15; WB-16, WB-D4 [provisional]). Pure helpers: which lanes are
// candidates, and the newest F8 `lane.completed` snapshot per lane. The write itself is T0's repairLane()
// (data/adminRepair.ts: allow-listed lane fields only, F8 `lane.repaired` first, then the admin write, then read back).
import { DEPTS, adminRepairFields, type Dept } from "../../schema";
import type { AuditVM, CaseVM } from "../../data/viewModels";

/** The newest `lane.completed` row for lane D of this case and cycle (newest by Event_At), or null. */
export function latestLaneSnapshot(events: readonly AuditVM[], c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo">, d: Dept): AuditVM | null {
  const key = `${c.caseCode}:lane:${d}`;
  return (
    events
      .filter((e) => e.actionCode === "lane.completed" && e.caseItemId === c._id && e.objectKey === key && (c.cycleNo === null || e.cycleNo === null || e.cycleNo === c.cycleNo))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] ?? null
  );
}

export interface RepairCandidate {
  dept: Dept;
  snapshot: AuditVM | null;
  /** Allow-listed snapshot values (what a repair would write), each next to the current case value. */
  rows: { field: string; snapshot: unknown; current: unknown }[];
}

/** Active lanes that read incomplete: the only lanes a repair can be about (§7.10). */
export function repairCandidates(c: CaseVM, events: readonly AuditVM[]): RepairCandidate[] {
  return DEPTS.filter((d) => c.lanes[d].active && !c.lanes[d].complete).map((d) => {
    const snapshot = latestLaneSnapshot(events, c, d);
    const snap = snapshot?.snapshot && typeof snapshot.snapshot === "object" && !Array.isArray(snapshot.snapshot) ? (snapshot.snapshot as Record<string, unknown>) : {};
    const rows = adminRepairFields(d)
      .filter((f) => snap[f] !== undefined && snap[f] !== null && snap[f] !== "")
      .map((f) => ({ field: f, snapshot: snap[f], current: c.v[f] ?? null }));
    return { dept: d, snapshot, rows };
  });
}
