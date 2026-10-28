// writeVerified (§7.2) with a fake client.
import { describe, expect, it } from "vitest";
import { LocalGuardError } from "../schema";
import { fakeClient, fakeRuntime } from "../testkit/fakeClient";
import { CLEAR } from "./normalize";
import { UncertainItemError } from "./writeQueue";
import type { Evidence } from "./viewModels";
import { compareWithoutWrite, normalisePatch, writeVerified, type Target } from "./writeVerified";

const refusal = (fields: string[]) => ({ isError: true, errorMessage: { error_code: "KISSFLOW_ERROR_050313", en_message: `You don't have permission to update the following fields: ${fields.join(", ")}` } });
const lane = (evidence: Evidence = "activity"): Target => ({ kind: "task", flow: "CIQ_Case_A00", instanceId: "PkC4", activityInstanceId: "a2", step: "CASE_B_SAF", evidence });
function setup(script = {}) {
  const c = fakeClient({ script });
  c.put("CIQ_Case_A00", { _id: "PkC4", Case_Code: "CIQ-2026-PkC4" }, { act: "a2", step: "CASE_B_SAF" });
  return { c, rt: fakeRuntime(c) };
}

describe("writeVerified", () => {
  it("success first time: one write, one read-back", async () => {
    const { c, rt } = setup();
    const r = await writeVerified(rt, lane(), { fields: { SAF_Review_Confirm: "Confirmed", SAF_Open_Count: 0 } });
    expect(r).toMatchObject({ ok: true, attempts: 1 });
    expect(c.ops("update")).toHaveLength(1);
    expect(c.items.get("CIQ_Case_A00:PkC4")?.SAF_Open_Count).toBe(0);
  });
  it("a lost key is re-applied once, with only that key", async () => {
    const { c, rt } = setup({ update: (_c: unknown, n: number) => (n === 1 ? { drop: ["SAF_Open_Count"] } : undefined) });
    const r = await writeVerified(rt, lane(), { fields: { SAF_Review_Confirm: "Confirmed", SAF_Open_Count: 1 } });
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    expect(c.ops("update")[1].data).toEqual({ SAF_Open_Count: 1 });
  });
  it("always lost → not-kept after 4 writes, naming the field", async () => {
    const { c, rt } = setup({ update: () => ({ drop: ["SAF_Open_Count"] }) });
    const r = await writeVerified(rt, lane(), { fields: { SAF_Open_Count: 1 } });
    expect(r).toMatchObject({ ok: false, kind: "not-kept", missing: ["SAF_Open_Count"] });
    expect(c.ops("update")).toHaveLength(4);
    expect(rt.session.notKept).toBe(1);
  });
  it("CLEAR verifies as blank", async () => {
    const { c, rt } = setup();
    c.items.get("CIQ_Case_A00:PkC4")!.SAF_On_Behalf_Of = "Someone";
    const r = await writeVerified(rt, lane(), { fields: { SAF_On_Behalf_Of: CLEAR } });
    expect(r.ok).toBe(true);
    expect(c.ops("update")[0].data).toEqual({ SAF_On_Behalf_Of: "" });
  });
  it("local guards throw (loud) for a non-writable key, a computed key and any F8 target, before any call", async () => {
    const { c, rt } = setup();
    expect(() => writeVerified(rt, lane(), { fields: { REG_Review_Confirm: "Confirmed" } })).toThrow(LocalGuardError);
    expect(() => writeVerified(rt, lane(), { fields: { SAF_Gate: "OK" } })).toThrow(/computed/);
    expect(() => writeVerified(rt, { kind: "form", flow: "CIQ_Audit_Event_A00", itemId: "Ev1" }, { fields: { Event_Reason: "x" } })).toThrow(/create-only/);
    expect(() => writeVerified(rt, { kind: "form", flow: "CIQ_RMES_Safety_A00", itemId: "F5" }, { fields: {}, tables: { Safety_Criteria: [{ kind: "modify", _id: "c1", row: { Criteria_Open_Num: 0 } }] } })).toThrow(/computed/);
    expect(c.ops("update")).toHaveLength(0);
  });
  it("050313 with ITEM evidence → kwb-refused for this task, but no step is marked", async () => {
    const { rt } = setup({ update: () => ({ error: refusal(["SAF_Review_Confirm"]) }) });
    const r = await writeVerified(rt, lane("item"), { fields: { SAF_Review_Confirm: "Confirmed" } });
    expect(r).toMatchObject({ ok: false, kind: "kwb-refused", stepMarked: false });
    expect(rt.session.kwb.get("CASE_B_SAF")).toBeUndefined();
  });
  it("050313 listing only SOME of the sent keys marks no step", async () => {
    const { rt } = setup({ update: () => ({ error: refusal(["SAF_Review_Confirm"]) }) });
    const r = await writeVerified(rt, lane("activity"), { fields: { SAF_Review_Confirm: "Confirmed", SAF_Open_Count: 1 } });
    expect(r).toMatchObject({ kind: "kwb-refused", stepMarked: false });
    expect(rt.session.kwb.get("CASE_B_SAF")).toBeUndefined();
  });
  it("050313 with ACTIVITY evidence listing every key marks the step; the next save at the step skips the SDK write", async () => {
    const { c, rt } = setup({ update: () => ({ error: refusal(["SAF_Review_Confirm", "SAF_Open_Count"]) }) });
    const r = await writeVerified(rt, lane("activity"), { fields: { SAF_Review_Confirm: "Confirmed", SAF_Open_Count: 1 } });
    expect(r).toMatchObject({ kind: "kwb-refused", stepMarked: true });
    if (r.kind === "kwb-refused") expect(r.pending.fields).toEqual({ SAF_Review_Confirm: "Confirmed", SAF_Open_Count: 1 });
    expect(rt.session.kwb.get("CASE_B_SAF")).toBe("refused");
    const again = await writeVerified(rt, lane("activity"), { fields: { SAF_Open_Count: 2 } });
    expect(again).toMatchObject({ kind: "kwb-refused", skipped: true });
    expect(c.ops("update")).toHaveLength(1);
  });
  it("a timeout marks the item uncertain and the next write is refused locally", async () => {
    const { c, rt } = setup({ update: () => ({ timeout: true }) });
    const r = await writeVerified(rt, lane(), { fields: { SAF_Open_Count: 1 } });
    expect(r).toMatchObject({ ok: false, kind: "timeout" });
    expect(rt.queue.uncertain("CIQ_Case_A00:PkC4")?.patch).toEqual({ fields: { SAF_Open_Count: 1 }, tables: {} }); // the normalised patch (WL-10)
    await expect(writeVerified(rt, lane(), { fields: { SAF_Open_Count: 2 } })).rejects.toBeInstanceOf(UncertainItemError);
    expect(c.ops("update")).toHaveLength(1);
  });
  it("other refusals are plain refusals", async () => {
    const { rt } = setup({ update: () => ({ error: "validation failed: bad value" }) });
    expect(await writeVerified(rt, lane(), { fields: { SAF_Open_Count: 1 } })).toMatchObject({ ok: false, kind: "refused" });
  });
  it("WL-03: the save OUTCOME sets lastFailed (not-kept, refused, K-WB, timeout); a verified save clears it; an empty patch leaves it", async () => {
    const key = "CIQ_Case_A00:PkC4";
    const notKept = setup({ update: () => ({ drop: ["SAF_On_Behalf_Of"] }) });
    expect(await writeVerified(notKept.rt, lane(), { fields: { SAF_On_Behalf_Of: "Sam Okafor" } })).toMatchObject({ kind: "not-kept" });
    expect(notKept.rt.queue.lastFailed(key)).toBe(true);
    expect(await writeVerified(notKept.rt, lane(), { fields: {} })).toMatchObject({ kind: "refused", message: "Nothing to save." });
    expect(notKept.rt.queue.lastFailed(key)).toBe(true);
    const refused = setup({ update: () => ({ error: "validation failed" }) });
    await writeVerified(refused.rt, lane(), { fields: { SAF_Open_Count: 1 } });
    expect(refused.rt.queue.lastFailed(key)).toBe(true);
    const kwb = setup({ update: () => ({ error: refusal(["SAF_Open_Count"]) }) });
    await writeVerified(kwb.rt, lane(), { fields: { SAF_Open_Count: 1 } });
    expect(kwb.rt.queue.lastFailed(key)).toBe(true);
    const ok = setup({ update: (_c: unknown, n: number) => (n === 1 ? { error: "validation failed" } : undefined) });
    await writeVerified(ok.rt, lane(), { fields: { SAF_Open_Count: 1 } });
    expect(ok.rt.queue.lastFailed(key)).toBe(true);
    expect(await writeVerified(ok.rt, lane(), { fields: { SAF_Open_Count: 1 } })).toMatchObject({ ok: true });
    expect(ok.rt.queue.lastFailed(key)).toBe(false);
  });
});

describe("K-WB Re-read compare (WL-09)", () => {
  const sheet = { fields: { SAF_Completed_At: "2026-10-08T10:00:07Z", SAF_Review_Confirm: "Confirmed" } };
  it("a DateTime typed by hand (no seconds) matches the sheet's stamp at minute precision", () => {
    expect(compareWithoutWrite("CIQ_Case_A00", { SAF_Completed_At: "2026-10-08T10:00:00Z", SAF_Review_Confirm: "Confirmed" }, sheet)).toEqual({ matches: true, missing: [] });
    expect(compareWithoutWrite("CIQ_Case_A00", { SAF_Completed_At: "2026-10-08T10:00:00.000Z", SAF_Review_Confirm: "Confirmed" }, sheet).matches).toBe(true);
  });
  it("another minute, or a blank stamp, is still missing", () => {
    expect(compareWithoutWrite("CIQ_Case_A00", { SAF_Completed_At: "2026-10-08T10:01:00Z", SAF_Review_Confirm: "Confirmed" }, sheet)).toEqual({ matches: false, missing: ["SAF_Completed_At"] });
    expect(compareWithoutWrite("CIQ_Case_A00", { SAF_Review_Confirm: "Confirmed" }, sheet).missing).toEqual(["SAF_Completed_At"]);
  });
  it("child DateTime columns (Rounds_Reviewed_At) compare at minute precision too", () => {
    const p = { fields: {}, tables: { Rounds: [{ kind: "add" as const, row: { Rounds_Round_No: 1, Rounds_Outcome: "Returned", Rounds_Reviewed_At: "2026-10-08T10:00:07Z" } }] } };
    const back = { "Table::Rounds": [{ _id: "srv1", Rounds_Round_No: 1, Rounds_Outcome: "Returned", Rounds_Reviewed_At: "2026-10-08T10:00:00Z" }] };
    expect(compareWithoutWrite("CIQ_Open_Point_A00", back, p).matches).toBe(true);
  });
  it("the write-then-verify compare stays exact to the second", async () => {
    const { rt } = setup({ update: () => ({ drop: ["SAF_Completed_At"] }) });
    expect(await writeVerified(rt, lane(), { fields: { SAF_Completed_At: "2026-10-08T10:00:07Z" } })).toMatchObject({ kind: "not-kept" });
  });
});

describe("child rows (§7.2): verified by client _id OR natural key", () => {
  const rp = (step: "OPNT_R_SAF" = "OPNT_R_SAF"): Target => ({ kind: "task", flow: "CIQ_Open_Point_A00", instanceId: "PkP2", activityInstanceId: "r1", step, evidence: "activity" });
  const round = { Rounds_Round_No: 1, Rounds_Outcome: "Returned", Rounds_Reason: "Need the full study", Rounds_Reviewed_At: "2026-10-08T10:00:00.250Z" };
  function op(script = {}) {
    const c = fakeClient({ script });
    c.put("CIQ_Open_Point_A00", { _id: "PkP2" }, { act: "r1", step: "OPNT_R_SAF" });
    return { c, rt: fakeRuntime(c) };
  }
  it("an add is verified by its client _id", async () => {
    const { c, rt } = op();
    const r = await writeVerified(rt, rp(), { fields: {}, tables: { Rounds: [{ kind: "add", row: round }] } });
    expect(r.ok).toBe(true);
    const rows = c.items.get("CIQ_Open_Point_A00:PkP2")!["Table::Rounds"] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].Rounds_Reviewed_At).toBe("2026-10-08T10:00:00Z");
  });
  it("with server-assigned row ids, a missing-looking add matched by natural key is NOT re-added", async () => {
    const { c, rt } = op({ serverRowIds: true, update: (_c: unknown, n: number) => (n === 1 ? { drop: ["Return_Reason"] } : undefined) });
    const r = await writeVerified(rt, rp(), { fields: { Return_Reason: "Need the full study" }, tables: { Rounds: [{ kind: "add", row: round }] } });
    expect(r.ok).toBe(true);
    expect(c.ops("update")).toHaveLength(2);
    expect(Object.keys(c.ops("update")[1].data!)).toEqual(["Return_Reason"]); // no second Table::Rounds add
    expect((c.items.get("CIQ_Open_Point_A00:PkP2")!["Table::Rounds"] as unknown[]).length).toBe(1);
  });
  it("a dropped add is re-applied with the same client _id", async () => {
    const { c, rt } = op({ update: (_c: unknown, n: number) => (n === 1 ? { dropRows: true } : undefined) });
    const r = await writeVerified(rt, rp(), { fields: {}, tables: { Rounds: [{ kind: "add", row: round }] } });
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    const [a, b] = c.ops("update").map((u) => (u.data!["Table::Rounds"] as Record<string, unknown>[])[0]._id);
    expect(a).toBe(b);
  });
  it("WL-15: every add carries _index = rows already in the table + its position (the verified add shape)", async () => {
    const { c, rt } = op();
    c.items.get("CIQ_Open_Point_A00:PkP2")!["Table::Rounds"] = [{ _id: "old1", Rounds_Round_No: 1 }, { _id: "old2", Rounds_Round_No: 2 }];
    const r = await writeVerified(rt, rp(), { fields: {}, tables: { Rounds: [{ kind: "add", row: { ...round, Rounds_Round_No: 3 } }, { kind: "add", row: { ...round, Rounds_Round_No: 4 } }] } });
    expect(r.ok).toBe(true);
    const sent = c.ops("update")[0].data!["Table::Rounds"] as Record<string, unknown>[];
    expect(sent.map((x) => [x._index, x._is_created])).toEqual([[2, true], [3, true]]);
    expect(c.ops().map((x) => x.op)).toEqual(["getItem", "update", "getItem"]); // the count comes from a read through the same route
  });
  it("WL-15: a new item indexes from 0; without a readable item the adds go without _index (as before)", async () => {
    const n = normalisePatch("CIQ_Open_Point_A00", { fields: {}, tables: { Rounds: [{ kind: "add", row: round }, { kind: "add", row: round }] } }, Math.random, {});
    expect(n.tables.Rounds!.map((x) => (x.kind === "add" ? x.row._index : null))).toEqual([0, 1]);
    expect(normalisePatch("CIQ_Open_Point_A00", { fields: {}, tables: { Rounds: [{ kind: "add", row: round }] } }).tables.Rounds![0]).not.toHaveProperty("row._index");
    const { c, rt } = op({ getItem: (_c: unknown, n: number) => (n === 1 ? { error: "busy" } : undefined) });
    expect((await writeVerified(rt, rp(), { fields: {}, tables: { Rounds: [{ kind: "add", row: round }] } })).ok).toBe(true);
    expect((c.ops("update")[0].data!["Table::Rounds"] as Record<string, unknown>[])[0]).not.toHaveProperty("_index");
  });
  it("modify and delete are verified by _id, and by natural key when the _id is unknown on read-back", async () => {
    const c = fakeClient();
    c.forms.set("CIQ_RMES_Safety_A00", [{ _id: "F5", "Table::Safety_Criteria": [{ _id: "srv1", Criteria_Code: "A1", Criteria_Result: "" }, { _id: "srv2", Criteria_Code: "A2" }] } as never]);
    const rt = fakeRuntime(c);
    const t: Target = { kind: "form", flow: "CIQ_RMES_Safety_A00", itemId: "F5" };
    const r = await writeVerified(rt, t, { fields: {}, tables: { Safety_Criteria: [{ kind: "modify", _id: "client-unknown", key: { Criteria_Code: "A1" }, row: { Criteria_Result: "Available" } }, { kind: "delete", _id: "client-x", key: { Criteria_Code: "A2" } }] } });
    expect(r).toMatchObject({ ok: true, attempts: 2 }); // the first write targets unknown ids; the re-apply resolves srv1 and srv2 by natural key
    const rows = c.forms.get("CIQ_RMES_Safety_A00")![0]["Table::Safety_Criteria"] as Record<string, unknown>[];
    expect(rows).toEqual([{ _id: "srv1", Criteria_Code: "A1", Criteria_Result: "Available" }]);
  });
});
