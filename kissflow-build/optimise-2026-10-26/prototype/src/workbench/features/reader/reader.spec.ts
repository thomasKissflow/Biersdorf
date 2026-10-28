// T3 reader and Case Admin (§8.15): the audit log filters, and the lane-repair helpers (newest lane.completed
// snapshot per lane, candidates = active incomplete lanes, allow-listed fields only). Fictional data only.
import { describe, expect, it } from "vitest";
import { toAuditVM, toCaseVM } from "../../data/map";
import type { RawItem } from "../../data/viewModels";
import { adminRepairFields } from "../../schema";
import { EMPTY_FILTERS, caseCodesIn, filterAudit, isFiltered } from "./filters";
import { latestLaneSnapshot, repairCandidates } from "./laneRepair";

const ev = (id: string, o: Record<string, unknown>) => toAuditVM({ _id: id, Event_Key: `EV-${id}`, ...o } as RawItem);

describe("audit log filters", () => {
  const events = [
    ev("1", { Case_Code: "CIQ-2026-PkC2", Event_Category: "Cancellation", Action_Code: "case.cancel", Actor_Name: "Alex Rivera", Actor_Email: "alex@example.test", Actor_Side: "BDF", Event_At: "2026-10-02T09:00:00Z" }),
    ev("2", { Case_Code: "CIQ-2026-PkC4", Event_Category: "Case", Action_Code: "lane.completed", Actor_Name: "Jo Weber", Actor_Email: "jo@example.test", Actor_Side: "BDF", Event_At: "2026-10-05T23:59:59Z" }),
    ev("3", { Event_Category: "Configuration", Action_Code: "config.publish", Actor_Name: "Robin Hale", Actor_Email: "robin@example.test", Actor_Side: "BDF", Event_At: "2026-10-06T00:00:00Z" }),
    ev("4", { Case_Code: "CIQ-2026-PkC4", Event_Category: "Notification", Actor_Side: "System" }),
  ];
  const ids = (f: Partial<typeof EMPTY_FILTERS>) => filterAudit(events, { ...EMPTY_FILTERS, ...f }).map((e) => e._id);
  it("no filter shows everything", () => {
    expect(ids({})).toEqual(["1", "2", "3", "4"]);
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTERS, actor: "jo" })).toBe(true);
  });
  it("case code (substring, any case), category (exact), actor (name or e-mail), side (exact)", () => {
    expect(ids({ caseCode: "pkc4" })).toEqual(["2", "4"]);
    expect(ids({ category: "Case" })).toEqual(["2"]);
    expect(ids({ actor: "ROBIN@" })).toEqual(["3"]);
    expect(ids({ actor: "weber" })).toEqual(["2"]);
    expect(ids({ side: "System" })).toEqual(["4"]);
  });
  it("date range is inclusive by day; events without a time are excluded once a bound is set", () => {
    expect(ids({ from: "2026-10-05" })).toEqual(["2", "3"]);
    expect(ids({ to: "2026-10-05" })).toEqual(["1", "2"]);
    expect(ids({ from: "2026-10-03", to: "2026-10-05" })).toEqual(["2"]);
  });
  it("case codes in the log, distinct and sorted", () => {
    expect(caseCodesIn(events)).toEqual(["CIQ-2026-PkC2", "CIQ-2026-PkC4"]);
  });
});

describe("lane repair helpers (§7.10)", () => {
  const c = toCaseVM(
    {
      _id: "PkC5",
      _status: "In progress",
      _current_step: "Open items check – before release request",
      Case_Code: "CIQ-2026-PkC5",
      Cycle_No: 1,
      Dept_QM_Active: "Yes",
      Dept_SAF_Active: "Yes",
      Dept_REG_Active: "No",
      SAF_Review_Confirm: "Confirmed",
      SAF_Completed_At: "2026-10-03T10:00:00Z",
      QM_Completed_At: "2026-10-03T11:00:00Z",
    } as RawItem,
    "full",
  );
  const snap = (id: string, at: string, d: string, o: Record<string, unknown> = {}) =>
    ev(id, { Action_Code: "lane.completed", Event_Category: "Case", Case_Item_Id: "PkC5", Case_Code: "CIQ-2026-PkC5", Cycle_No: 1, Object_Key: `CIQ-2026-PkC5:lane:${d}`, Event_At: at, Snapshot_JSON: JSON.stringify({ QM_Review_Confirm: "Confirmed", QM_Completed_At: "2026-10-03T11:00:00Z", QM_Open_Count: 0, QM_Gate: "OK" }), ...o });
  it("the newest lane.completed snapshot of THIS case, lane and cycle", () => {
    const events = [snap("a", "2026-10-03T11:00:00Z", "QM"), snap("b", "2026-10-03T12:00:00Z", "QM"), snap("c", "2026-10-04T12:00:00Z", "SAF"), snap("d", "2026-10-05T12:00:00Z", "QM", { Case_Item_Id: "PkOther" }), snap("e", "2026-10-06T12:00:00Z", "QM", { Cycle_No: 2 })];
    expect(latestLaneSnapshot(events, c, "QM")?._id).toBe("b");
    expect(latestLaneSnapshot(events, c, "REG")).toBeNull();
  });
  it("candidates: active lanes that read incomplete; only allow-listed snapshot fields (no counts, no gate)", () => {
    const cands = repairCandidates(c, [snap("b", "2026-10-03T12:00:00Z", "QM")]);
    expect(cands.map((x) => x.dept)).toEqual(["QM"]); // SAF is complete, REG inactive
    const fields = cands[0].rows.map((r) => r.field);
    expect(fields).toEqual(expect.arrayContaining(["QM_Review_Confirm", "QM_Completed_At"]));
    expect(fields).not.toContain("QM_Open_Count");
    expect(fields).not.toContain("QM_Gate");
    for (const f of fields) expect(adminRepairFields("QM")).toContain(f);
    expect(cands[0].rows.find((r) => r.field === "QM_Review_Confirm")).toEqual({ field: "QM_Review_Confirm", snapshot: "Confirmed", current: null });
  });
});
