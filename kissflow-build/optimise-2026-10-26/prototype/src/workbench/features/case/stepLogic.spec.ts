// T1 acceptance (§12.1, §8.5): the S5 lane check (a), (b) and the failing (b); S7 clear-on-partial (and written on a
// complete refresh); S3 writes the input to both fields. S3 and S7 run on T0's real actions over the fake host.
import { describe, expect, it } from "vitest";
import { fakeClient, fakeRuntime, heldTask } from "../../testkit/fakeClient";
import { createActions } from "../../data/actions";
import { toCaseVM } from "../../data/map";
import { kfDateTime } from "../../data/normalize";
import type { RawItem } from "../../data/viewModels";
import { caseFixture, pointFixture } from "./t1.fixtures";
import {
  appendLateCompletion,
  laneCheck,
  laneCheckExtra,
  lateCompletionLine,
  newestLaneSnapshot,
  positionText,
  runHoldOverride,
  runHoldSave,
  runS7,
  s3Patch,
  s3AddableDepts,
  s3DeptAdditions,
  deptAddedEvent,
  DEPT_FLAG_FIELDS,
  stepperKey,
  stepperSteps,
} from "./stepLogic";
import { toAuditVM } from "../../data/map";

const CASE = "PkC5";
const base = { Dept_REG_Active: "Yes", Dept_SAF_Active: "Yes", Dept_QM_Active: "Yes", Dept_MIC_Active: "No", Dept_SUS_Active: "No", Dept_RMM_Active: "No" };
const done = (d: string) => ({ [`${d}_Review_Confirm`]: "Confirmed", [`${d}_Completed_At`]: "2026-10-05T09:00:00Z" });
const deptReview = (opKey: string, outcome = "Accepted") =>
  pointFixture({ OP_Key: opKey, Case_Item_Id: CASE, OP_Kind: "Department review", OP_Dept: "QM", OP_Outcome: outcome, Reviewed_By: { _id: "UsTove", Name: "Tove Marsh" }, Reviewed_By_Email: "tove@example.test", Reviewed_At: "2026-10-07T12:00:00Z" }, `Pt${opKey}`);

describe("S5 lane check (§8.5)", () => {
  it("(a) passes every active lane that is confirmed with a completed-at", () => {
    const rows = laneCheck({ ...base, ...done("REG"), ...done("SAF"), ...done("QM") }, [], CASE);
    expect(rows.filter((r) => r.active).every((r) => r.pass && r.via === "confirmed")).toBe(true);
    expect(laneCheckExtra([], CASE)({ ...base, ...done("REG"), ...done("SAF"), ...done("QM"), _id: CASE } as RawItem)).toEqual([]);
  });

  it("(b) passes a lost lane through an Accepted Department-review point recorded in Late_Completions_Text", () => {
    const p = deptReview("CIQ-2026-PkC5-C1-OPqm01");
    const late = lateCompletionLine("QM", p);
    expect(late).toBe("QM · Tove Marsh · tove@example.test · 2026-10-07T12:00:00Z · CIQ-2026-PkC5-C1-OPqm01");
    const rows = laneCheck({ ...base, ...done("REG"), ...done("SAF"), QM_Review_Confirm: "", Late_Completions_Text: late }, [p], CASE);
    expect(rows.find((r) => r.dept === "QM")).toMatchObject({ pass: true, via: "late-completion" });
  });

  it("(b) fails with an Accepted Department-review point whose OP_Key is NOT in Late_Completions_Text", () => {
    const p = deptReview("CIQ-2026-PkC5-C1-OPqm01");
    const fresh = { ...base, ...done("REG"), ...done("SAF"), Late_Completions_Text: "QM · someone · x@example.test · 2026-10-01 · CIQ-2026-PkC5-C1-OPother" };
    const qm = laneCheck(fresh, [p], CASE).find((r) => r.dept === "QM")!;
    expect(qm.pass).toBe(false);
    expect(qm.point?.opKey).toBe("CIQ-2026-PkC5-C1-OPqm01");
    expect(laneCheckExtra([p], CASE)({ ...fresh, _id: CASE } as RawItem).map((x) => x.label)).toEqual(["QM review"]);
  });

  it("does not pass with a Department-review point that is not Accepted, or of another case or department", () => {
    const pending = deptReview("OPpend", "");
    const other = pointFixture({ OP_Key: "OPx", Case_Item_Id: "PkOther", OP_Kind: "Department review", OP_Dept: "QM", OP_Outcome: "Accepted" }, "PtX");
    const fresh = { ...base, ...done("REG"), ...done("SAF"), Late_Completions_Text: "OPpend OPx" };
    expect(laneCheck(fresh, [pending, other], CASE).find((r) => r.dept === "QM")!.pass).toBe(false);
  });

  it("appends a late-completion line once", () => {
    const p = deptReview("OPqm1");
    const l = lateCompletionLine("QM", p);
    const t1 = appendLateCompletion("", l, p.opKey);
    expect(appendLateCompletion(t1, l, p.opKey)).toBe(t1);
    expect(appendLateCompletion("REG · …", l, p.opKey)).toBe(`REG · …\n${l}`);
  });
});

describe("stepper and lanes", () => {
  it("places the case in v4 order (S6 only when overall approval is required)", () => {
    expect(stepperKey(caseFixture({ _current_step: "Review – Safety" }))).toBe("CASE_PAR");
    expect(stepperKey(caseFixture({ _current_step: "Scope check" }))).toBe("CASE_S2");
    expect(stepperKey(caseFixture({ _status: "Completed" }))).toBe("END");
    expect(stepperKey(caseFixture({}))).toBeNull();
    expect(stepperSteps(caseFixture({ Overall_Approval_Required: "No" })).map((s) => s.key)).not.toContain("CASE_S6");
    expect(stepperSteps(caseFixture({ Overall_Approval_Required: "Yes" })).map((s) => s.key).slice(5, 8)).toEqual(["CASE_S5", "CASE_S6", "CASE_S7"]);
    expect(positionText(caseFixture({ _current_step: ["Review – Safety", "Review – QM"] }), (s) => s)).toBe("Part 2 – review (SAF, QM)");
  });

  it("finds the newest lane.completed snapshot of this case, cycle and lane", () => {
    const c = caseFixture({}, CASE);
    const ev = (id: string, at: string, key: string, cycle = 1) => toAuditVM({ _id: id, Action_Code: "lane.completed", Case_Item_Id: CASE, Object_Key: key, Event_At: at, Cycle_No: cycle } as RawItem);
    const s = newestLaneSnapshot([ev("a", "2026-10-01T00:00:00Z", "CIQ-2026-PkC5:lane:QM"), ev("b", "2026-10-03T00:00:00Z", "CIQ-2026-PkC5:lane:QM"), ev("c", "2026-10-04T00:00:00Z", "CIQ-2026-PkC5:lane:SAF"), ev("d", "2026-10-05T00:00:00Z", "CIQ-2026-PkC5:lane:QM", 2)], c, "QM");
    expect(s?._id).toBe("b");
  });
});

describe("S3: Supplier confirmed at → both fields (§8.5)", () => {
  it("the patch writes the INPUT (not now) to Completeness_At and RMES_Created_At, without ms", () => {
    const p = s3Patch("2026-10-02T09:30", { Completeness_By_Name: "Mira Castell" });
    const want = kfDateTime(new Date("2026-10-02T09:30"));
    expect(p.fields).toEqual({ Completeness_By_Name: "Mira Castell", Completeness_At: want, RMES_Created_At: want });
    expect(String(want)).not.toMatch(/\.\d+Z$/);
    expect(() => s3Patch("")).toThrow(/required/);
  });

  it("on the fake host both fields hold the typed time after saveAtStep at CASE_S3", async () => {
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC3", Case_Code: "CIQ-2026-PkC3", Cycle_No: 1 }, { act: "a3", step: "CASE_S3" });
    const t = heldTask("CIQ_Case_A00", "PkC3", "a3", "CASE_S3");
    const a = createActions(fakeRuntime(c, { tasks: [t] }));
    const r = await a.saveAtStep(t, s3Patch("2026-10-02T09:30"));
    expect(r.ok).toBe(true);
    const item = c.items.get("CIQ_Case_A00:PkC3")!;
    expect(item.Completeness_At).toBe(kfDateTime(new Date("2026-10-02T09:30")));
    expect(item.RMES_Created_At).toBe(item.Completeness_At);
  });
});

describe("S7: refresh counts first; partial → CLEARED, complete → written (§8.5, §7.9)", () => {
  function s7Host() {
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC7", Case_Code: "CIQ-2026-PkC7", Cycle_No: 1, Open_Items_Count: 0, Open_CR_Count: 0 }, { act: "a7", step: "CASE_S7" });
    c.put("CIQ_Open_Point_A00", { _id: "PkOp1", Case_Item_Id: "PkC7", OP_Kind: "Query", Open_Num: 1 });
    const t = heldTask("CIQ_Case_A00", "PkC7", "a7", "CASE_S7");
    const rt = fakeRuntime(c, { tasks: [t] });
    const kase = toCaseVM(c.items.get("CIQ_Case_A00:PkC7")!, "full");
    return { c, t, rt, kase };
  }
  const input = { releasedAt: "2026-10-06T15:45", reason: "Supplier confirmed by phone" };

  it("partial (rung 3): both counts are CLEARED before the submit, so CASE_S8 runs", async () => {
    const { c, t, rt, kase } = s7Host();
    rt.session.adminRefused.add("CIQ_Open_Point_A00");
    rt.session.adminRefused.add("CIQ_Change_Request_A00");
    const r = await runS7(createActions(rt), t, kase, input);
    expect(r.refresh).toMatchObject({ confidence: "partial", action: "cleared" });
    expect(r.stage).toBe("submit");
    expect(r.submit?.ok).toBe(true);
    const item = c.items.get("CIQ_Case_A00:PkC7")!;
    expect(item.Open_Items_Count).toBeNull();
    expect(item.Open_CR_Count).toBeNull();
    expect(item.Final_Release_At).toBe(kfDateTime(new Date(input.releasedAt)));
    expect(item.Completion_Trigger).toBe("Manual by RMM: Supplier confirmed by phone");
    const ops = c.calls.map((x) => x.op);
    expect(ops.indexOf("update")).toBeLessThan(ops.indexOf("submit"));
    expect(c.calls.find((x) => x.op === "update")!.data).toEqual({ Open_Items_Count: null, Open_CR_Count: null });
  });

  it("complete (rung 1): the counts are written (1 open point, 0 CRs) before the submit", async () => {
    const { c, t, rt, kase } = s7Host();
    const r = await runS7(createActions(rt), t, kase, input);
    expect(r.refresh).toMatchObject({ confidence: "complete", action: "written" });
    expect(c.calls.find((x) => x.op === "update")!.data).toEqual({ Open_Items_Count: 1, Open_CR_Count: 0 });
    expect(r.submit?.ok).toBe(true);
  });

  it("an empty 'Supplier released at' blocks before anything is sent", async () => {
    const { c, t, rt, kase } = s7Host();
    const r = await runS7(createActions(rt), t, kase, { releasedAt: "", reason: "x" });
    expect(r.stage).toBe("problems");
    expect(r.problems?.map((p) => p.field)).toEqual(["Final_Release_At"]);
    expect(c.calls.filter((x) => x.op === "update" || x.op === "submit")).toHaveLength(0);
  });
});

describe("S5/S8 hold override (§7.8)", () => {
  it("writes the F8 hold.override row FIRST, then the override reason; the gate is read back", async () => {
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC5o", Case_Code: "CIQ-2026-PkC5o", Cycle_No: 1 }, { act: "a5", step: "CASE_S5" });
    const t = heldTask("CIQ_Case_A00", "PkC5o", "a5", "CASE_S5");
    const a = createActions(fakeRuntime(c, { tasks: [t] }));
    const kase = toCaseVM(c.items.get("CIQ_Case_A00:PkC5o")!, "full");
    const r = await runHoldOverride(a, { ...t, step: "CASE_S5" }, kase, "Supplier answered by phone; point closes tomorrow");
    expect(r.ok).toBe(true);
    const ops = c.calls.map((x) => `${x.op}:${x.flow}`);
    expect(ops.indexOf("formSubmit:CIQ_Audit_Event_A00")).toBeLessThan(ops.indexOf("update:CIQ_Case_A00"));
    expect(c.forms.get("CIQ_Audit_Event_A00")![0]).toMatchObject({ Action_Code: "hold.override.release", Object_Key: "CIQ-2026-PkC5o:hold:release", Event_Reason: "Supplier answered by phone; point closes tomorrow" });
    expect(c.items.get("CIQ_Case_A00:PkC5o")!.Hold_Override_Reason_Release).toBe("Supplier answered by phone; point closes tomorrow");
  });

  it("does not save the override when the F8 row is not recorded", async () => {
    const c = fakeClient({ script: { formSubmit: () => ({ error: "Form submit failed" }) } });
    c.put("CIQ_Case_A00", { _id: "PkC8o", Case_Code: "CIQ-2026-PkC8o", Cycle_No: 1 }, { act: "a8", step: "CASE_S8" });
    const t = heldTask("CIQ_Case_A00", "PkC8o", "a8", "CASE_S8");
    const a = createActions(fakeRuntime(c, { tasks: [t] }));
    const r = await runHoldOverride(a, { ...t, step: "CASE_S8" }, toCaseVM(c.items.get("CIQ_Case_A00:PkC8o")!, "full"), "reason");
    expect(r).toMatchObject({ ok: false, stage: "audit" });
    expect(c.ops("update")).toHaveLength(0);
  });
});

describe("S5 override retried after a failed save", () => {
  it("does not write the F8 override row twice for the same text", async () => {
    const c = fakeClient({ script: { update: (_c, n) => (n === 1 ? { error: "Kissflow did not answer" } : undefined) } });
    c.put("CIQ_Case_A00", { _id: "PkC5r", Case_Code: "CIQ-2026-PkC5r", Cycle_No: 1 }, { act: "a5", step: "CASE_S5" });
    const t = heldTask("CIQ_Case_A00", "PkC5r", "a5", "CASE_S5");
    const a = createActions(fakeRuntime(c, { tasks: [t] }));
    const kase = toCaseVM(c.items.get("CIQ_Case_A00:PkC5r")!, "full");
    const first = await runHoldSave(a, { ...t, step: "CASE_S5" }, kase, { override: "Internal point only", others: { Hold_Note: "n" } });
    expect(first).toMatchObject({ ok: false, stage: "save", recorded: "Internal point only" });
    const second = await runHoldSave(a, { ...t, step: "CASE_S5" }, kase, { override: "Internal point only", others: { Hold_Note: "n" }, alreadyRecorded: first.recorded });
    expect(second.ok).toBe(true);
    expect(c.forms.get("CIQ_Audit_Event_A00")!.filter((r) => r.Action_Code === "hold.override.release")).toHaveLength(1);
  });
});

describe("F4: at S3 the department flags only grow, with a reason", () => {
  const c = caseFixture({ Dept_SAF_Active: "Yes", Dept_REG_Active: "Yes", Dept_QM_Active: "No" }, "PkC3");
  it("only departments not active on the server can be added; an active one is never written (no No, no blank)", () => {
    expect(s3AddableDepts(c)).toEqual(["QM", "MIC", "SUS", "RMM"]);
    const r = s3DeptAdditions(c, ["SAF", "QM"], "Supplier added a preservative: QM must check the specification.");
    expect(r.added).toEqual(["QM"]);
    expect(r.fields).toEqual({ Dept_QM_Active: "Yes" });
    expect(Object.values(r.fields).every((v) => v === "Yes")).toBe(true);
    expect(r.problems).toEqual([]);
  });
  it("an addition needs a reason; no addition needs none", () => {
    expect(s3DeptAdditions(c, ["MIC"], " ").problems.map((p) => p.message)).toEqual([expect.stringMatching(/reason is required to add Microbiology/)]);
    expect(s3DeptAdditions(c, [], "")).toEqual({ fields: {}, added: [], problems: [] });
  });
  it("the F8 row names the added departments and the reason", () => {
    expect(deptAddedEvent(c, ["QM"], " Preservative added. ")).toMatchObject({ category: "Scope", actionCode: "scope.dept.added", caseItemId: "PkC3", newValueText: "QM", eventReason: "Preservative added." });
  });
  it("the six flags are the ones the S3 form never shows", () => {
    expect(DEPT_FLAG_FIELDS).toEqual(["Dept_REG_Active", "Dept_SAF_Active", "Dept_QM_Active", "Dept_MIC_Active", "Dept_SUS_Active", "Dept_RMM_Active"]);
  });
});
