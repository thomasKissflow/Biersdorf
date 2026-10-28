// audit.ts: create-only F8 rows with ONE correcting row (§7.8; WB-15).
import { describe, expect, it } from "vitest";
import { fakeClient, fakeRuntime } from "../testkit/fakeClient";
import { buildAuditRow, writeAudit } from "./audit";

const ev = { category: "Cancellation", actionCode: "case.cancel", eventReason: "Supplier withdrew the material", caseCode: "CIQ-2026-PkC2", cycleNo: 1, caseItemId: "PkC2", objectKind: "Case", objectItemId: "PkC2", notifyRecipient: "ana.contact@example.test" };

describe("writeAudit", () => {
  it("a complete row → verified with 1 create (discard first) and 0 updates", async () => {
    const c = fakeClient();
    const r = await writeAudit(fakeRuntime(c), ev);
    expect(r.correctionItemId).toBeUndefined();
    expect(c.calls.map((x) => x.op)).toEqual(["formDiscard", "formCreate", "formSubmit", "formGet"]);
    const row = c.forms.get("CIQ_Audit_Event_A00")![0];
    expect(row).toMatchObject({ Event_Category: "Cancellation", Action_Code: "case.cancel", Actor_Side: "BDF", Actor_Name: "Dev Builder", Actor_Email: "dev@example.test", Notify_Recipient: "ana.contact@example.test" });
    expect(String(row.Event_At)).toMatch(/T\d\d:\d\d:\d\dZ$/);
  });
  it("a row missing Notify_Recipient → a case.cancel.correction row with Object_Key = the first Event_Key: 2 creates, 0 updates", async () => {
    const c = fakeClient({ script: { formSubmit: (_c, n) => (n === 1 ? { drop: ["Notify_Recipient"] } : undefined) } });
    const r = await writeAudit(fakeRuntime(c), ev);
    expect(r.correctionItemId).toBeDefined();
    const [first, corr] = c.forms.get("CIQ_Audit_Event_A00")!;
    expect(first.Notify_Recipient).toBeUndefined();
    expect(corr).toMatchObject({ Action_Code: "case.cancel.correction", Object_Key: first.Event_Key, Notify_Recipient: "ana.contact@example.test", Event_Category: "Cancellation" });
    expect(c.ops("formCreate")).toHaveLength(2);
    expect(c.ops("formUpdate")).toHaveLength(0);
  });
  it("both rows missing fields → writeAudit rejects (still no update)", async () => {
    const c = fakeClient({ script: { formSubmit: () => ({ drop: ["Notify_Recipient"] }) } });
    await expect(writeAudit(fakeRuntime(c), ev)).rejects.toThrow(/not recorded completely/);
    expect(c.ops("formUpdate")).toHaveLength(0);
  });
  it("buildAuditRow drops blanks and serialises the snapshot", () => {
    const row = buildAuditRow({ category: "Case", actionCode: "lane.completed", snapshot: { SAF_Review_Confirm: "Confirmed" } }, { name: "Jo Weber", email: "jo@example.test", dept: "SAF", roleId: "Ro1" }, "EV-1", new Date("2026-10-08T10:00:00.500Z"));
    expect(row).toEqual({ Event_Key: "EV-1", Event_At: "2026-10-08T10:00:00Z", Event_Category: "Case", Action_Code: "lane.completed", Actor_Side: "BDF", Actor_Name: "Jo Weber", Actor_Email: "jo@example.test", Actor_Dept: "SAF", Actor_Role_Id: "Ro1", Snapshot_JSON: '{"SAF_Review_Confirm":"Confirmed"}' });
  });
});
