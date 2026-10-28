// The ONLY admin-route write (§7.10): allow-list enforced before anything is sent.
import { describe, expect, it } from "vitest";
import { LocalGuardError } from "../schema";
import { fakeClient, fakeRuntime } from "../testkit/fakeClient";
import { adminLaneWrite, assertRepairFields, repairLaneRt } from "./adminRepair";
import { capsFor } from "../kf/app";
import { toAuditVM, toCaseVM } from "./map";
import type { RawItem } from "./viewModels";

describe("adminRepair", () => {
  it("a field outside the allow-list throws before anything is sent", async () => {
    expect(() => assertRepairFields("QM", ["Trade_Name"])).toThrow(LocalGuardError);
    expect(() => assertRepairFields("QM", ["QM_Open_Count"])).toThrow(LocalGuardError); // counts are not repaired
    expect(() => assertRepairFields("QM", ["SAF_Review_Confirm"])).toThrow(LocalGuardError); // another lane
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC5" });
    await expect(adminLaneWrite(fakeRuntime(c), "PkC5", "QM", { Trade_Name: "x" })).rejects.toThrow(LocalGuardError);
    expect(c.ops("updateAdminItem")).toHaveLength(0);
  });

  function setup(caseAdmin = true) {
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC5", Case_Code: "CIQ-2026-PkC5", Cycle_No: 1, Dept_QM_Active: "Yes", QM_Review_Confirm: "", _current_step: "Open items check – before release request" });
    const rt = fakeRuntime(c, { caps: () => capsFor(caseAdmin ? ["ciq_rmm", "ciq_case_admin"] : ["ciq_rmm"]) });
    const cv = toCaseVM(c.items.get("CIQ_Case_A00:PkC5")!, "full");
    const snap = toAuditVM({
      _id: "Ev9",
      Event_Key: "EV-lane-qm",
      Action_Code: "lane.completed",
      Case_Item_Id: "PkC5",
      Cycle_No: 1,
      Object_Key: "CIQ-2026-PkC5:lane:QM",
      Snapshot_JSON: JSON.stringify({ QM_Review_Confirm: "Confirmed", QM_Completed_By: { _id: "UsTove" }, QM_Completed_By_Email: "tove@example.test", QM_Completed_At: "2026-10-07T09:00:00Z", QM_Open_Count: 0, Trade_Name: "tampered" }),
    } as RawItem);
    return { c, rt, cv, snap };
  }
  it("Case Admin: F8 lane.repaired first, then ONE updateAdminItem with only QM lane fields, read back", async () => {
    const { c, rt, cv, snap } = setup();
    const r = await repairLaneRt(rt, cv, "QM", snap, "QM value lost after the join (S39)");
    expect(r).toMatchObject({ ok: true, attempts: 1 });
    const ops = c.calls.map((x) => x.op);
    expect(ops.indexOf("formSubmit")).toBeLessThan(ops.indexOf("updateAdminItem"));
    const upd = c.ops("updateAdminItem");
    expect(upd).toHaveLength(1);
    expect(Object.keys(upd[0].data!).sort()).toEqual(["QM_Completed_At", "QM_Completed_By", "QM_Completed_By_Email", "QM_Review_Confirm"]);
    expect(c.forms.get("CIQ_Audit_Event_A00")![0]).toMatchObject({ Action_Code: "lane.repaired", Object_Key: "EV-lane-qm", Event_Reason: "QM value lost after the join (S39)" });
  });
  it("not offered without Case Admin, without a reason, or for a complete lane", async () => {
    const a = setup(false);
    expect(await repairLaneRt(a.rt, a.cv, "QM", a.snap, "reason")).toMatchObject({ ok: false, kind: "refused" });
    const b = setup();
    expect(await repairLaneRt(b.rt, b.cv, "QM", b.snap, " ")).toMatchObject({ ok: false });
    const done = { ...b.cv, lanes: { ...b.cv.lanes, QM: { ...b.cv.lanes.QM, complete: true } } };
    expect(await repairLaneRt(b.rt, done, "QM", b.snap, "reason")).toMatchObject({ ok: false, message: "The QM review is complete." });
    expect(a.c.ops("updateAdminItem").length + b.c.ops("updateAdminItem").length).toBe(0);
  });
});
