// actions.ts with a fake host: submitStep (§7.3), creates (§7.6), reject (§7.7), counts policy (§7.9), Return (§7.5).
import { afterEach, describe, expect, it } from "vitest";
import { fakeClient, fakeRuntime, heldTask, type FakeClient } from "../testkit/fakeClient";
import { pinServerActivityIds } from "../testkit/serverIds";
import { ActionError, buildReturnPatch, createActions } from "./actions";
import { toCaseVM, toPointVM } from "./map";
import { CLEAR } from "./normalize";
import type { RawItem } from "./viewModels";

const laneOk = { SAF_Review_Confirm: "Confirmed", SAF_Completed_By: { _id: "UsJo" }, SAF_Completed_By_Email: "jo@example.test", SAF_Completed_At: "2026-10-08T10:00:00Z", SAF_RMES_Decision: "Approved", SAF_Open_Count: 0, SAF_RMES_Gaps: 0, SAF_Gate: "OK" };

function laneSetup(item: Record<string, unknown>, script = {}) {
  const c = fakeClient({ script });
  c.put("CIQ_Case_A00", { _id: "PkC4", Case_Code: "CIQ-2026-PkC4", Cycle_No: 1, ...item }, { act: "a2", step: "CASE_B_SAF" });
  const t = heldTask("CIQ_Case_A00", "PkC4", "a2", "CASE_B_SAF");
  const rt = fakeRuntime(c, { tasks: [t] });
  return { c, rt, t, a: createActions(rt) };
}

describe("submitStep (§7.3)", () => {
  it("a blank writable Mandatory field blocks, with no submit", async () => {
    const { c, t, a } = laneSetup({ ...laneOk, SAF_RMES_Decision: "" });
    const r = await a.submitStep(t);
    expect(r).toMatchObject({ ok: false, kind: "problems" });
    if (r.kind === "problems") expect(r.problems.map((p) => p.field)).toEqual(["SAF_RMES_Decision"]);
    expect(c.ops("submit")).toHaveLength(0);
  });
  it("a computed gate that is not OK on the SERVER blocks, explained by the mirror", async () => {
    const { c, t, a } = laneSetup({ ...laneOk, SAF_Open_Count: 1, SAF_Gate: "" });
    const r = await a.submitStep(t);
    expect(r.kind).toBe("problems");
    if (r.kind === "problems") expect(r.problems[0].message).toMatch(/SAF Gate is not OK: 1 open item/);
    expect(c.ops("submit")).toHaveLength(0);
  });
  it("no held task blocks (ground rule 13)", async () => {
    const { c, a } = laneSetup(laneOk);
    const r = await a.submitStep(heldTask("CIQ_Case_A00", "PkC4", "other-act", "CASE_B_SAF"));
    expect(r).toMatchObject({ ok: false, kind: "no-task" });
    expect(c.ops("submit")).toHaveLength(0);
  });
  it("submits, then writes the F8 lane.completed snapshot, then compares the re-read (rung 1)", async () => {
    const { c, t, a } = laneSetup(laneOk);
    const r = await a.submitStep(t);
    expect(r).toMatchObject({ ok: true, kind: "submitted", postCheck: "compared", laneDiff: [] });
    const ops = c.calls.map((x) => x.op);
    expect(ops.indexOf("submit")).toBeLessThan(ops.indexOf("formCreate"));
    const snap = c.forms.get("CIQ_Audit_Event_A00")![0];
    expect(snap).toMatchObject({ Action_Code: "lane.completed", Object_Key: "CIQ-2026-PkC4:lane:SAF", Actor_Dept: "SAF" });
    expect(JSON.parse(String(snap.Snapshot_JSON)).SAF_Review_Confirm).toBe("Confirmed");
    expect(c.calls.some((x) => x.op === "submit" && x.data)).toBe(false); // never fields in the submit body
  });
  it("detects lane values lost after the submit", async () => {
    let client: FakeClient | null = null;
    const { c, t, a } = laneSetup(laneOk, {
      submit: () => {
        delete client!.items.get("CIQ_Case_A00:PkC4")!.SAF_Review_Confirm;
      },
    });
    client = c;
    const r = await a.submitStep(t);
    expect(r.ok && r.laneDiff).toEqual(["SAF_Review_Confirm"]);
  });
  it("rung 3: the post-submit check could not read the item — a note, not an error", async () => {
    const { t, rt } = laneSetup(laneOk);
    rt.session.adminRefused.add("CIQ_Case_A00");
    const r = await createActions(rt).submitStep(t);
    expect(r).toMatchObject({ ok: true, postCheck: "not-readable" });
    if (r.ok) expect(r.notes[0]).toMatch(/could not read the item with your access/);
  });
  it("refuses on an uncertain item and after a failed save", async () => {
    const { rt, t } = laneSetup(laneOk);
    rt.queue.markUncertain("CIQ_Case_A00:PkC4", { kind: "write" });
    expect(await createActions(rt).submitStep(t)).toMatchObject({ kind: "uncertain" });
  });
});

describe("saveAtStep", () => {
  it("a K-WB refusal stores the pending sheet under _id|act", async () => {
    const { rt, t, a } = laneSetup({}, { update: () => ({ error: { isError: true, errorMessage: "KISSFLOW_ERROR_050313 SAF_Open_Count" } }) });
    const r = await a.saveAtStep(t, { fields: { SAF_Open_Count: 0 } });
    expect(r.kind).toBe("kwb-refused");
    expect(rt.pending.load("PkC4|a2")?.fields).toEqual({ SAF_Open_Count: 0 });
  });
  it("a wrong container refuses the save as a result (not a crash)", async () => {
    const c = fakeClient({ appId: "CIQ_Supplier_Portal_A00" });
    c.put("CIQ_Case_A00", { _id: "PkC4" }, { act: "a2", step: "CASE_B_SAF" });
    const t = heldTask("CIQ_Case_A00", "PkC4", "a2", "CASE_B_SAF");
    const r = await createActions(fakeRuntime(c, { tasks: [t] })).saveAtStep(t, { fields: { SAF_Open_Count: 0 } });
    expect(r).toMatchObject({ ok: false, kind: "refused", code: "wrong-container" });
    expect(c.ops("update")).toHaveLength(0);
  });
});

const caseData = {
  Cycle_No: 1,
  Trade_Name: "Aloe Calm 40",
  Main_INCI: "Aloe Barbadensis Leaf Juice",
  BDF_Material_No: "MAT-000123",
  SAP_Material_No: "SAP-77",
  Supplier_Code: "SUP-NWB",
  Supplier_Legal_Name: "Northwind Botanicals GmbH",
  Owner_RMM: { _id: "UsDev01" },
  BDF_Contact_Name: "Dev Builder",
  BDF_Contact_Email: "dev@example.test",
  Supplier_Due_Date: "2026-10-22",
  Case_Contacts_JSON: "[]",
  Portal_Contact_Ids: "UsP1",
  Confirm_Contact_Ids: "UsP1",
  Supplier_Contact_Emails: "ana.contact@example.test",
  Release_Item_Id: "FmRel1",
  Manifest_Hash: "abc",
  Release_Manifest_JSON: "[]",
  Overall_Approval_Required: "No",
};

describe("createProcessItem (§7.6)", () => {
  const post = (d: { instanceId: string }) => ({ fields: { Case_Code: `CIQ-2026-${d.instanceId}`, Request_Key: `CIQ-2026-${d.instanceId}-C1-REQ` } });
  it("the pre-create check passes without Case_Code/Request_Key; a missing real field creates nothing", async () => {
    const c = fakeClient();
    const a = createActions(fakeRuntime(c));
    await expect(a.createProcessItem("CIQ_Case_A00", { ...caseData, Trade_Name: "" }, { postCreate: post })).rejects.toMatchObject({ kind: "problems" });
    expect(c.ops("create")).toHaveLength(0);
    const r = await a.createProcessItem("CIQ_Case_A00", caseData, { postCreate: post });
    const it = c.items.get(`CIQ_Case_A00:${r.instanceId}`)!;
    expect(it).toMatchObject({ Case_Code: `CIQ-2026-${r.instanceId}`, Request_Key: `CIQ-2026-${r.instanceId}-C1-REQ`, _status: "In progress" });
    expect(c.calls.map((x) => x.op)).toEqual(["create", "getItem", "update", "getItem", "getItem", "submit"]);
  });
  it("the FULL check before submit fails without the post-create keys: nothing is submitted, the draft is returned", async () => {
    const c = fakeClient();
    const err = await createActions(fakeRuntime(c)).createProcessItem("CIQ_Case_A00", caseData).catch((e) => e);
    expect(err).toBeInstanceOf(ActionError);
    expect(err.problems.map((p: { field: string }) => p.field).sort()).toEqual(["Case_Code", "Request_Key"]);
    expect(err.draft).toBeDefined();
    expect(c.ops("submit")).toHaveLength(0);
  });
  it("a preset dropped at create (SAP_Material_No) is re-applied at Start", async () => {
    const c = fakeClient({ script: { create: () => ({ drop: ["SAP_Material_No"] }) } });
    const r = await createActions(fakeRuntime(c)).createProcessItem("CIQ_Case_A00", caseData, { postCreate: post });
    expect(c.ops("update")[0].data).toMatchObject({ SAP_Material_No: "SAP-77" });
    expect(c.items.get(`CIQ_Case_A00:${r.instanceId}`)!.SAP_Material_No).toBe("SAP-77");
  });
  it("a failed submit that did not go through discards the draft and rethrows; a failed discard is said", async () => {
    const c = fakeClient({ script: { submit: () => ({ error: "Server error" }) } });
    await expect(createActions(fakeRuntime(c)).createProcessItem("CIQ_Case_A00", caseData, { postCreate: post })).rejects.toThrow(/Nothing was created/);
    expect(c.ops("discard")).toHaveLength(1);
    const c2 = fakeClient({ script: { submit: () => ({ error: "Server error" }), discard: () => ({ error: "nope" }) } });
    await expect(createActions(fakeRuntime(c2)).createProcessItem("CIQ_Case_A00", caseData, { postCreate: post })).rejects.toThrow(/could not be removed/);
  });
});

describe("createFormRow (§7.6)", () => {
  const note = { Note_Key: "NOTE-1", Note_Text: "Supplier asked for one more week.", Case_Item_Id: "PkC4" };
  it("discardItem is called before every Form create", async () => {
    const c = fakeClient();
    const a = createActions(fakeRuntime(c));
    await a.createFormRow("CIQ_Internal_Note_A00", note, "Note_Key");
    await a.createFormRow("CIQ_Internal_Note_A00", { ...note, Note_Key: "NOTE-2" }, "Note_Key");
    expect(c.calls.filter((x) => x.op === "formDiscard" || x.op === "formCreate").map((x) => x.op)).toEqual(["formDiscard", "formCreate", "formDiscard", "formCreate"]);
  });
  it("the required check lists problems and creates nothing", async () => {
    const c = fakeClient();
    await expect(createActions(fakeRuntime(c)).createFormRow("CIQ_Internal_Note_A00", { Note_Key: "N" }, "Note_Key")).rejects.toMatchObject({ kind: "problems" });
    expect(c.ops("formCreate")).toHaveLength(0);
  });
  it("a failed submit with no row found discards again and rethrows; a failed second discard is surfaced", async () => {
    const c = fakeClient({ script: { formSubmit: () => ({ error: "Server error" }) } });
    await expect(createActions(fakeRuntime(c)).createFormRow("CIQ_Internal_Note_A00", note, "Note_Key")).rejects.toThrow(/Nothing was created/);
    expect(c.ops("formDiscard")).toHaveLength(2);
    const c2 = fakeClient({ script: { formSubmit: () => ({ error: "Server error" }), formDiscard: (_c, n) => (n === 2 ? { error: "busy" } : undefined) } });
    await expect(createActions(fakeRuntime(c2)).createFormRow("CIQ_Internal_Note_A00", note, "Note_Key")).rejects.toThrow(/still open/);
  });
  it("missing fields are re-applied (not for F8)", async () => {
    const c = fakeClient({ script: { formSubmit: () => ({ drop: ["Note_Text"] }) } });
    await createActions(fakeRuntime(c)).createFormRow("CIQ_Internal_Note_A00", note, "Note_Key");
    expect(c.ops("formUpdate")).toHaveLength(1);
    expect(c.forms.get("CIQ_Internal_Note_A00")![0].Note_Text).toBe(note.Note_Text);
  });
  it("updateFormRow throws for F8", async () => {
    await expect(createActions(fakeRuntime(fakeClient())).updateFormRow("CIQ_Audit_Event_A00", "Ev1", { fields: { Event_Reason: "x" } })).rejects.toThrow(/create-only/);
  });
});

describe("rejectCase (§7.7)", () => {
  function s2(script = {}) {
    const c = fakeClient({ script });
    c.put("CIQ_Case_A00", { _id: "PkC2", Case_Code: "CIQ-2026-PkC2", Cycle_No: 1, Supplier_Contact_Emails: "ana.contact@example.test" }, { act: "s2", step: "CASE_S2" });
    const t = heldTask("CIQ_Case_A00", "PkC2", "s2", "CASE_S2");
    const cv = toCaseVM(c.items.get("CIQ_Case_A00:PkC2")!, "full");
    return { c, t, cv, a: createActions(fakeRuntime(c, { tasks: [t] })) };
  }
  it("an empty reason is blocked", async () => {
    const { c, t, cv, a } = s2();
    expect(await a.rejectCase(t, "  ", cv)).toMatchObject({ ok: false });
    expect(c.calls).toHaveLength(0);
  });
  it("F8 Cancellation is created and verified BEFORE the reject", async () => {
    const { c, t, cv, a } = s2();
    const r = await a.rejectCase(t, "Supplier withdrew the material", cv);
    expect(r).toMatchObject({ ok: true, message: "Cancellation recorded. The supplier is not notified automatically yet." });
    const ops = c.calls.map((x) => x.op);
    expect(ops.indexOf("formSubmit")).toBeLessThan(ops.indexOf("reject"));
    expect(c.forms.get("CIQ_Audit_Event_A00")![0]).toMatchObject({ Event_Category: "Cancellation", Action_Code: "case.cancel", Notify_Recipient: "ana.contact@example.test", Object_Kind: "Case", Object_Item_Id: "PkC2" });
  });
  it("the reject is NOT sent when the F8 row fails", async () => {
    const { c, t, cv, a } = s2({ formSubmit: () => ({ drop: ["Notify_Recipient"] }) });
    const r = await a.rejectCase(t, "Supplier withdrew the material", cv);
    expect(r).toMatchObject({ ok: false, kind: "audit-failed" });
    expect(c.ops("reject")).toHaveLength(0);
  });
  it("a verified correction row counts as recorded: the reject is sent", async () => {
    const { c, t, cv, a } = s2({ formSubmit: (_c: unknown, n: number) => (n === 1 ? { drop: ["Notify_Recipient"] } : undefined) });
    expect((await a.rejectCase(t, "Supplier withdrew the material", cv)).ok).toBe(true);
    expect(c.ops("reject")).toHaveLength(1);
  });
  it("a failed reject writes a case.cancel.failed row pointing at the first event", async () => {
    const { c, t, cv, a } = s2({ reject: () => ({ error: "Reject not allowed" }) });
    const r = await a.rejectCase(t, "Supplier withdrew the material", cv);
    expect(r).toMatchObject({ ok: false, kind: "reject-failed" });
    const [first, failed] = c.forms.get("CIQ_Audit_Event_A00")!;
    expect(failed).toMatchObject({ Event_Category: "Case", Action_Code: "case.cancel.failed", Object_Key: first.Event_Key });
  });
});

describe("refreshCaseCounts and the counts policy (§7.9, WB-D1)", () => {
  function s5(step: "CASE_S5" | "CASE_S7", o: { partial: boolean; policy?: "fail-closed" | "attest" }) {
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC5", Case_Code: "CIQ-2026-PkC5", Cycle_No: 1, Release_Item_Id: "FmRel1" }, { act: "x", step });
    c.put("CIQ_Open_Point_A00", { _id: "PkP1", Case_Item_Id: "PkC5", OP_Kind: "Query", OP_Dept: "SAF", Open_Num: 1 });
    const t = heldTask("CIQ_Case_A00", "PkC5", "x", step);
    const rt = fakeRuntime(c, { tasks: [t], lensActive: () => o.partial, flagsFor: () => ({ countsPolicy: o.policy ?? "fail-closed", additionalPartRaise: false, scopeExtendedOutcome: false }) });
    const cv = toCaseVM(c.items.get("CIQ_Case_A00:PkC5")!, "full");
    return { c, t, cv, a: createActions(rt) };
  }
  it("complete (rung 1) → the counts are written and the server gate read", async () => {
    const { c, t, cv, a } = s5("CASE_S5", { partial: false });
    const r = await a.refreshCaseCounts(t, cv, "case");
    expect(r).toMatchObject({ ok: true, confidence: "complete", action: "written", counts: { Open_Items_Count: 1, Open_CR_Count: 0 } });
    expect(c.ops("update")).toHaveLength(1);
  });
  it("partial under fail-closed → NOTHING is written; the unread list names what could not be read", async () => {
    const { c, t, cv, a } = s5("CASE_S5", { partial: true });
    const r = await a.refreshCaseCounts(t, cv, "case");
    expect(r).toMatchObject({ ok: false, confidence: "partial", action: "blocked" });
    expect(r.unread.map((u) => u.flow)).toContain("CIQ_Open_Point_A00");
    expect(c.ops("update")).toHaveLength(0);
  });
  it("partial under attest → the F8 count.attested row FIRST, then the visible counts; a short attestation writes nothing", async () => {
    const { c, t, cv, a } = s5("CASE_S5", { partial: true, policy: "attest" });
    expect(await a.refreshCaseCounts(t, cv, "case", { attestation: "too short" })).toMatchObject({ action: "blocked" });
    expect(c.ops("update")).toHaveLength(0);
    const r = await a.refreshCaseCounts(t, cv, "case", { attestation: "Checked the point list with the RMM team by phone." });
    expect(r).toMatchObject({ ok: true, action: "attested" });
    const ops = c.calls.map((x) => x.op);
    expect(ops.indexOf("formSubmit")).toBeLessThan(ops.indexOf("update"));
    expect(c.forms.get("CIQ_Audit_Event_A00")![0]).toMatchObject({ Action_Code: "count.attested", Object_Key: "CIQ-2026-PkC5:hold:release" });
  });
  it("partial at S7 → both counts are CLEARED so S8 runs", async () => {
    const { c, t, cv, a } = s5("CASE_S7", { partial: true });
    const r = await a.refreshCaseCounts(t, cv, "case");
    expect(r).toMatchObject({ ok: true, action: "cleared" });
    expect(c.ops("update")[0].data).toEqual({ Open_Items_Count: null, Open_CR_Count: null });
  });
  it("never at S2 or S3 (D23): the client guard throws", async () => {
    const { cv, a } = s5("CASE_S5", { partial: false });
    await expect(a.refreshCaseCounts(heldTask("CIQ_Case_A00", "PkC5", "x", "CASE_S2"), cv, "case")).rejects.toThrow(/read-only at Scope check/);
  });
});

describe("sendBackPoint (§7.5)", () => {
  const ret = { questionText: "Please send the full stability study.", supplierJustification: "Needed for the safety assessment.", supplierDueDate: "2026-10-29", internalDueDate: "2026-11-05", reason: "The summary is not enough." };
  function rp(script = {}) {
    const c = fakeClient({ script });
    c.put("CIQ_Open_Point_A00", { _id: "PkP2", OP_Key: "CIQ-2026-PkC4-C1-OPk1", Round_No: 1, OP_To_Supplier: "Yes", Question_Text: "Stability data?", Response_Kind: "Answer", Response_Text: "Stable for 24 months." }, { act: "r1", step: "OPNT_R_SAF" });
    const t = heldTask("CIQ_Open_Point_A00", "PkP2", "r1", "OPNT_R_SAF");
    const rt = fakeRuntime(c, { tasks: [t] });
    return { c, t, rt, p: toPointVM(c.items.get("CIQ_Open_Point_A00:PkP2")!, "full"), a: createActions(rt) };
  }
  // the target step id comes from the read-back (generated) or is learned this session: each test pins which
  let restoreIds: (() => void) | null = null;
  afterEach(() => {
    restoreIds?.();
    restoreIds = null;
  });
  it("builds round n into Rounds and round n+1 on the header; OP_Outcome untouched; responses cleared", () => {
    const { p } = rp();
    const patch = buildReturnPatch(p, ret, { _id: "UsJo", Name: "Jo Weber" }, new Date("2026-10-08T10:00:00Z"));
    expect(patch.fields).toMatchObject({ Round_No: 2, Query_Key: "CIQ-2026-PkC4-C1-OPk1|R2", Awaiting_Response: "Yes", Response_Kind: CLEAR, Response_Text: CLEAR, Response_Doc_Refs_JSON: CLEAR, Return_Reason: ret.reason });
    expect("OP_Outcome" in patch.fields).toBe(false);
    expect(patch.tables!.Rounds![0]).toMatchObject({ kind: "add", row: { Rounds_Round_No: 1, Rounds_Outcome: "Returned", Rounds_Question_Text: "Stability data?", Rounds_Response_Text: "Stable for 24 months." } });
  });
  it("a refused round write → the K-WB fallback with the round and header values; no send-back; never 'already saved'", async () => {
    const { c, t, rt, p, a } = rp({ update: () => ({ error: { isError: true, errorMessage: "KISSFLOW_ERROR_050313" } }) });
    const r = await a.sendBackPoint(t, ret, p);
    expect(r).toMatchObject({ ok: false, mode: "kwb" });
    expect(r.message).not.toMatch(/already saved/);
    expect(c.ops("sendBack")).toHaveLength(0);
    const sheet = rt.pending.load(t.key)!;
    expect(sheet.fields.Round_No).toBe(2);
    expect(sheet.tables!.Rounds![0]).toMatchObject({ kind: "add" });
  });
  it("a verified round write without a known target step → the openForm fallback saying 'already saved'", async () => {
    restoreIds = pinServerActivityIds({}); // no read-back id, none learned
    const { c, t, p, a } = rp();
    const r = await a.sendBackPoint(t, ret, p);
    expect(r).toMatchObject({ ok: false, mode: "openForm" });
    expect(r.message).toMatch(/target step unknown.*already saved/);
    expect(c.ops("sendBack")).toHaveLength(0);
  });
  it("with a known OPNT_S1 activity id the send-back is sent with that step id", async () => {
    restoreIds = pinServerActivityIds({}); // no read-back: the id learned this session
    const { c, t, rt, p, a } = rp();
    rt.session.activityIds.set("CIQ_Open_Point_A00|Waiting for supplier", "Activity_s1");
    expect(await a.sendBackPoint(t, ret, p)).toMatchObject({ ok: true, mode: "sdk" });
    expect(c.ops("sendBack")[0].extra).toEqual({ stepId: "Activity_s1", comment: ret.reason });
  });
  it("with a read-back OPNT_S1 activity id the send-back is sent with it, ahead of one learned this session", async () => {
    restoreIds = pinServerActivityIds({ OPNT_S1: "Activity_rb_s1" });
    const { c, t, rt, p, a } = rp();
    rt.session.activityIds.set("CIQ_Open_Point_A00|Waiting for supplier", "Activity_s1");
    expect(await a.sendBackPoint(t, ret, p)).toMatchObject({ ok: true, mode: "sdk" });
    expect(c.ops("sendBack")[0].extra).toEqual({ stepId: "Activity_rb_s1", comment: ret.reason });
  });
  it("a Return needs every input", async () => {
    const { t, p, a } = rp();
    expect(await a.sendBackPoint(t, { ...ret, reason: "" }, p)).toMatchObject({ ok: false, kind: "problems" });
  });
});

describe("K-WB re-read (§7.4)", () => {
  it("moved out of your queue → submitted in Kissflow; the sheet is cleared", async () => {
    const { c, t, rt, a } = laneSetup({}, { update: () => ({ error: { isError: true, errorMessage: "KISSFLOW_ERROR_050313 SAF_Open_Count" } }) });
    await a.saveAtStep(t, { fields: { SAF_Open_Count: 0 } });
    c.taskRows.splice(0, c.taskRows.length); // submitted natively
    expect(await a.reReadPending(t)).toEqual({ matches: true, missing: [], submittedElsewhere: true });
    expect(rt.pending.load(t.key)).toBeNull();
  });
  it("values entered natively → matches; still missing → listed", async () => {
    const { c, t, a } = laneSetup({}, { update: () => ({ error: { isError: true, errorMessage: "KISSFLOW_ERROR_050313 SAF_Open_Count" } }) });
    await a.saveAtStep(t, { fields: { SAF_Open_Count: 0 } });
    expect(await a.reReadPending(t)).toMatchObject({ matches: false, missing: ["SAF_Open_Count"] });
    (c.items.get("CIQ_Case_A00:PkC4") as RawItem).SAF_Open_Count = 0; // native save
    expect(await a.reReadPending(t)).toMatchObject({ matches: true, submittedElsewhere: false });
  });
  it("openTaskForm counts presses and outcomes", async () => {
    const { t, rt, a } = laneSetup({});
    expect(await a.openTaskForm(t)).toBe("opened");
    expect(rt.session.openForm).toMatchObject({ presses: 1, answered: 1 });
  });
});

// ---------------------------------------------------------------- review fixes (night): write layer
describe("WL-03: 'the last save failed' follows the SAVE result, not a thrown call", () => {
  it("a save that was not kept blocks the next submit (§7.3 step 1): nothing is submitted", async () => {
    const { c, t, a } = laneSetup(laneOk, { update: () => ({ drop: ["SAF_On_Behalf_Of"] }) });
    expect(await a.saveAtStep(t, { fields: { SAF_On_Behalf_Of: "Sam Okafor" } })).toMatchObject({ kind: "not-kept" });
    expect(await a.submitStep(t)).toMatchObject({ ok: false, kind: "last-save-failed" });
    expect(c.ops("submit")).toHaveLength(0);
  });
  it("a submit that threw once does not block the next submit", async () => {
    const { c, t, a } = laneSetup(laneOk, { submit: (_c: unknown, n: number) => (n === 1 ? { error: "Server error" } : undefined) });
    expect(await a.submitStep(t)).toMatchObject({ ok: false, kind: "refused" });
    expect(await a.submitStep(t)).toMatchObject({ ok: true, kind: "submitted" });
    expect(c.ops("submit")).toHaveLength(2);
  });
  it("a refused send-back does not block a later save-and-submit on the point", async () => {
    const c = fakeClient({ script: { sendBack: () => ({ error: "Request failed with status code 500" }) } });
    c.put("CIQ_Open_Point_A00", { _id: "PkP2", OP_Key: "CIQ-2026-PkC4-C1-OPk1", Round_No: 1, OP_To_Supplier: "Yes", Question_Text: "Stability data?" }, { act: "r1", step: "OPNT_R_SAF" });
    const t = heldTask("CIQ_Open_Point_A00", "PkP2", "r1", "OPNT_R_SAF");
    const rt = fakeRuntime(c, { tasks: [t] });
    rt.session.activityIds.set("CIQ_Open_Point_A00|Waiting for supplier", "Activity_s1");
    const a = createActions(rt);
    const ret = { questionText: "Full study please.", supplierJustification: "Safety file.", supplierDueDate: "2026-10-29", internalDueDate: "2026-11-05", reason: "Summary only." };
    expect(await a.sendBackPoint(t, ret, toPointVM(c.items.get("CIQ_Open_Point_A00:PkP2")!, "full"))).toMatchObject({ mode: "openForm" });
    expect(rt.queue.lastFailed("CIQ_Open_Point_A00:PkP2")).toBe(false);
  });
  it("a K-WB refused save blocks the submit until the Re-read finds the values (then it is sent)", async () => {
    const { c, t, a } = laneSetup(laneOk, { update: () => ({ error: { isError: true, errorMessage: "KISSFLOW_ERROR_050313 SAF_On_Behalf_Of" } }) });
    expect((await a.saveAtStep(t, { fields: { SAF_On_Behalf_Of: "Sam Okafor" } })).kind).toBe("kwb-refused");
    expect(await a.submitStep(t)).toMatchObject({ kind: "last-save-failed" });
    (c.items.get("CIQ_Case_A00:PkC4") as RawItem).SAF_On_Behalf_Of = "Sam Okafor"; // entered in the Kissflow form
    expect(await a.reReadPending(t)).toMatchObject({ matches: true });
    expect(await a.submitStep(t)).toMatchObject({ ok: true, kind: "submitted" });
  });
});

describe("WL-13: the post-submit lane compare is per field type across two read routes", () => {
  it("a User with extra keys and a DateTime with ms from the admin route are NOT a change", async () => {
    const { c, t, a } = laneSetup(laneOk);
    const admin = c.getAdminItem.bind(c);
    c.getAdminItem = async (f, id) => ({ ...(await admin(f, id)), SAF_Completed_By: { _id: "UsJo", Name: "Jo Weber", Kind: "User" }, SAF_Completed_At: "2026-10-08T10:00:00.000Z" });
    const r = await a.submitStep(t);
    expect(r).toMatchObject({ ok: true, postCheck: "compared", laneDiff: [] });
  });
  it("a value really lost is still reported", async () => {
    const { c, t, a } = laneSetup(laneOk);
    const admin = c.getAdminItem.bind(c);
    c.getAdminItem = async (f, id) => ({ ...(await admin(f, id)), SAF_Completed_By: { _id: "UsOther", Name: "Someone" } });
    expect(await a.submitStep(t)).toMatchObject({ ok: true, laneDiff: ["SAF_Completed_By"] });
  });
});

describe("WL-02 / WL-10: Re-read of an uncertain item", () => {
  it("a Process item without a task is read through the admin route, never the Form API; the mark is cleared", async () => {
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC5", QM_Review_Confirm: "Confirmed" });
    const rt = fakeRuntime(c);
    rt.queue.markUncertain("CIQ_Case_A00:PkC5", { kind: "write", patch: { fields: { QM_Review_Confirm: "Confirmed", QM_Open_Count: 0 }, tables: {} } });
    const r = await createActions(rt).reReadUncertain("CIQ_Case_A00", "PkC5");
    expect(r).toMatchObject({ checked: true, cleared: true, landed: ["QM_Review_Confirm"], notLanded: ["QM_Open_Count"] });
    expect(c.ops("formGet")).toHaveLength(0);
    expect(c.ops("getAdminItem")).toHaveLength(1);
    expect(rt.queue.uncertain("CIQ_Case_A00:PkC5")).toBeUndefined();
  });
  it("without the admin route: cleared with a 'could not check' note, nothing read", async () => {
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC5" });
    const rt = fakeRuntime(c);
    rt.session.adminRefused.add("CIQ_Case_A00");
    rt.queue.markUncertain("CIQ_Case_A00:PkC5", { kind: "write", patch: { fields: { QM_Open_Count: 0 }, tables: {} } });
    const r = await createActions(rt).reReadUncertain("CIQ_Case_A00", "PkC5");
    expect(r).toMatchObject({ checked: false, cleared: true, landed: [], notLanded: [] });
    expect(r.note).toMatch(/could not check/);
    expect(c.calls).toHaveLength(0);
    expect(rt.queue.uncertain("CIQ_Case_A00:PkC5")).toBeUndefined();
  });
  it("a failed admin read also clears with the note (the case is not locked for the session)", async () => {
    const c = fakeClient();
    const rt = fakeRuntime(c);
    rt.queue.markUncertain("CIQ_Case_A00:PkGone", { kind: "write" });
    expect(await createActions(rt).reReadUncertain("CIQ_Case_A00", "PkGone")).toMatchObject({ checked: false, cleared: true });
  });
  it("a timed-out Return that landed (User value + child add under a server row id) reads as landed, not 'Not landed'", async () => {
    const c = fakeClient({ script: { update: () => ({ timeout: true }) } });
    c.put("CIQ_Open_Point_A00", { _id: "PkP2", OP_Key: "CIQ-2026-PkC4-C1-OPk1", Round_No: 1, OP_To_Supplier: "Yes", Question_Text: "Stability data?" }, { act: "r1", step: "OPNT_R_SAF" });
    const t = heldTask("CIQ_Open_Point_A00", "PkP2", "r1", "OPNT_R_SAF");
    const rt = fakeRuntime(c, { tasks: [t] });
    const a = createActions(rt);
    const patch = { fields: { Return_Reason: "Summary only.", Reviewed_By: { _id: "UsDev01" } }, tables: { Rounds: [{ kind: "add" as const, row: { Rounds_Round_No: 1, Rounds_Outcome: "Returned", Rounds_Reviewed_By: { _id: "UsDev01" } } }] } };
    expect(await a.saveAtStep(t, patch)).toMatchObject({ kind: "timeout" });
    // the write landed after all: the host shows the user with its name and the row under its own id
    Object.assign(c.items.get("CIQ_Open_Point_A00:PkP2")!, { Return_Reason: "Summary only.", Reviewed_By: { _id: "UsDev01", Name: "Dev Builder" }, "Table::Rounds": [{ _id: "Srv_9", Rounds_Round_No: 1, Rounds_Outcome: "Returned", Rounds_Reviewed_By: { _id: "UsDev01", Name: "Dev Builder" } }] });
    const r = await a.reReadUncertain("CIQ_Open_Point_A00", "PkP2", "r1");
    expect(r.notLanded).toEqual([]);
    expect(r.landed.sort()).toEqual(["Return_Reason", "Reviewed_By", "Rounds"]);
  });
});

describe("WL-06: timeouts of reject, send-back and admin cancel are uncertain, not failures", () => {
  function s2(script = {}) {
    const c = fakeClient({ script });
    c.put("CIQ_Case_A00", { _id: "PkC2", Case_Code: "CIQ-2026-PkC2", Cycle_No: 1 }, { act: "s2", step: "CASE_S2" });
    const t = heldTask("CIQ_Case_A00", "PkC2", "s2", "CASE_S2");
    const rt = fakeRuntime(c, { tasks: [t] });
    return { c, t, rt, cv: toCaseVM(c.items.get("CIQ_Case_A00:PkC2")!, "full"), a: createActions(rt) };
  }
  const f8 = (c: FakeClient) => (c.forms.get("CIQ_Audit_Event_A00") ?? []).map((r) => r.Action_Code);
  it("reject timeout with the task still open: 'timeout', item locked, NO case.cancel.failed yet", async () => {
    const { c, t, rt, cv, a } = s2({ reject: () => ({ timeout: true }) });
    const r = await a.rejectCase(t, "Supplier withdrew the material", cv);
    expect(r).toMatchObject({ ok: false, kind: "timeout" });
    expect(f8(c)).toEqual(["case.cancel"]);
    expect(rt.queue.uncertain("CIQ_Case_A00:PkC2")?.kind).toBe("reject");
  });
  it("…then Re-read finds the task still open: the reject did not happen → case.cancel.failed pointing at the event", async () => {
    const { c, t, rt, cv, a } = s2({ reject: () => ({ timeout: true }) });
    await a.rejectCase(t, "Supplier withdrew the material", cv);
    const r = await a.reReadUncertain("CIQ_Case_A00", "PkC2", "s2");
    expect(r.note).toMatch(/not cancelled/);
    const [first, failed] = c.forms.get("CIQ_Audit_Event_A00")!;
    expect(failed).toMatchObject({ Action_Code: "case.cancel.failed", Object_Key: first.Event_Key });
    expect(rt.queue.uncertain("CIQ_Case_A00:PkC2")).toBeUndefined();
  });
  it("…or the task left the queue (the reject landed): no case.cancel.failed", async () => {
    let client: FakeClient | null = null;
    const { c, t, cv, a } = s2({
      reject: () => {
        client!.taskRows.splice(0, client!.taskRows.length);
        client!.items.get("CIQ_Case_A00:PkC2")!._status = "Rejected";
        return { timeout: true };
      },
    });
    client = c;
    expect(await a.rejectCase(t, "Supplier withdrew the material", cv)).toMatchObject({ ok: true, kind: "verified" });
    expect(f8(c)).toEqual(["case.cancel"]);
  });
  it("a send-back timeout is not 'refused': the item is locked until Re-read and no fallback sheet says it was refused", async () => {
    const c = fakeClient({ script: { sendBack: () => ({ timeout: true }) } });
    c.put("CIQ_Open_Point_A00", { _id: "PkP2", OP_Key: "CIQ-2026-PkC4-C1-OPk1", Round_No: 1, OP_To_Supplier: "Yes", Question_Text: "Stability data?" }, { act: "r1", step: "OPNT_R_SAF" });
    const t = heldTask("CIQ_Open_Point_A00", "PkP2", "r1", "OPNT_R_SAF");
    const rt = fakeRuntime(c, { tasks: [t] });
    rt.session.activityIds.set("CIQ_Open_Point_A00|Waiting for supplier", "Activity_s1");
    const ret = { questionText: "Full study please.", supplierJustification: "Safety file.", supplierDueDate: "2026-10-29", internalDueDate: "2026-11-05", reason: "Summary only." };
    const r = await createActions(rt).sendBackPoint(t, ret, toPointVM(c.items.get("CIQ_Open_Point_A00:PkP2")!, "full"));
    expect(r).toMatchObject({ ok: false, mode: "sdk", kind: "timeout" });
    expect(rt.session.sendBack).not.toBe("refused");
    expect(rt.pending.load(t.key)).toBeNull();
    expect(rt.queue.uncertain("CIQ_Open_Point_A00:PkP2")).toBeDefined();
  });
  it("an admin cancel whose reject times out is 'timeout' (not 'manual-end' ok) and the case is locked", async () => {
    const c = fakeClient({ script: { reject: () => ({ timeout: true }) } });
    c.put("CIQ_Case_A00", { _id: "PkC5", Case_Code: "CIQ-2026-PkC5", Cycle_No: 1, _activity_instance_id: "adm1" });
    const rt = fakeRuntime(c, { caps: () => ({ ...fakeRuntime(c).caps(), isCaseAdmin: true }) });
    const r = await createActions(rt).cancelCaseAsAdmin(toCaseVM(c.items.get("CIQ_Case_A00:PkC5")!, "full"), "Duplicate case");
    expect(r).toMatchObject({ ok: false, kind: "timeout" });
    expect(rt.queue.uncertain("CIQ_Case_A00:PkC5")).toBeDefined();
  });
});

describe("WL-11: a Return is built from a full read of the point, never from a list row", () => {
  const ret = { questionText: "Full study please.", supplierJustification: "Safety file.", supplierDueDate: "2026-10-29", internalDueDate: "2026-11-05", reason: "Summary only." };
  function setup(script = {}) {
    const c = fakeClient({ script });
    c.put("CIQ_Open_Point_A00", { _id: "PkP2", OP_Key: "CIQ-2026-PkC4-C1-OPk1", Round_No: 3, OP_To_Supplier: "Yes", Question_Text: "Stability data?", Thread_Text: "[2026-10-01T08:00:00Z] Raised: Stability data?" }, { act: "r1", step: "OPNT_R_SAF" });
    const t = heldTask("CIQ_Open_Point_A00", "PkP2", "r1", "OPNT_R_SAF");
    const rt = fakeRuntime(c, { tasks: [t] });
    // a sparse list row: no Round_No, no Thread_Text
    const sparse = toPointVM({ _id: "PkP2", OP_Key: "CIQ-2026-PkC4-C1-OPk1", OP_To_Supplier: "Yes" } as RawItem, "row");
    return { c, t, rt, sparse, a: createActions(rt) };
  }
  it("the round number and the thread come from the server read", async () => {
    const { c, t, sparse, a } = setup();
    await a.sendBackPoint(t, ret, sparse);
    const sent = c.ops("update")[0].data!;
    expect(sent).toMatchObject({ Round_No: 4, Query_Key: "CIQ-2026-PkC4-C1-OPk1|R4" });
    expect(String(sent.Thread_Text)).toMatch(/^\[2026-10-01T08:00:00Z\] Raised: Stability data\?\n\n/);
  });
  it("no read → no Return (nothing written)", async () => {
    const { c, t, sparse, a } = setup({ getItem: () => ({ error: "Request failed with status code 429" }) });
    expect(await a.sendBackPoint(t, ret, sparse)).toMatchObject({ ok: false, kind: "refused" });
    expect(c.ops("update")).toHaveLength(0);
  });
});
