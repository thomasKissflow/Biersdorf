import { describe, expect, it } from "vitest";
import { recompute } from "./formula";
import { createState, openActs, type ProcItem } from "./state";
import { USERS } from "./users";
import { activityIdOf, evalCondition, holds, rejectItem, sendBackAct, startItem, step, stepOfActivityId, submitAct, withdrawItem, type WfCtx } from "./workflow";

const ctx = (kfa = false): WfCtx => {
  let t = 0;
  return { state: createState(), now: () => `2026-10-01T08:${String(t++ % 60).padStart(2, "0")}:00Z`, kfa };
};
const open = (it: ProcItem) => openActs(it).map((a) => a.step);
const submitAt = (c: WfCtx, it: ProcItem, s: string, fields: Record<string, unknown> = {}) => {
  Object.assign(it.fields, fields);
  recompute(it.flow, it.fields);
  const a = openActs(it).find((x) => x.step === s);
  if (!a) throw new Error(`no open ${s}: ${open(it).join(",")}`);
  submitAct(c, it, a, USERS.dev._id);
};

describe("workflow traversal (§11.1 workflow.ts)", () => {
  it("sequential: Start → S1 → S2 → S3 for the case; Start makes it In progress", () => {
    const c = ctx();
    const it = startItem(c, "CIQ_Case_A00", USERS.alex._id, {});
    expect(it.status).toBe("Draft");
    expect(open(it)).toEqual(["CASE_S0"]);
    submitAt(c, it, "CASE_S0");
    expect(it.status).toBe("InProgress");
    expect(open(it)).toEqual(["CASE_S1"]);
    submitAt(c, it, "CASE_S1");
    submitAt(c, it, "CASE_S2");
    expect(open(it)).toEqual(["CASE_S3"]);
  });

  it("parallel: one activity per true branch; the join fires only when all are closed", () => {
    const c = ctx();
    const it = startItem(c, "CIQ_Case_A00", USERS.alex._id, {});
    for (const s of ["CASE_S0", "CASE_S1", "CASE_S2"]) submitAt(c, it, s);
    submitAt(c, it, "CASE_S3", { Dept_REG_Active: "Yes", Dept_SAF_Active: "Yes", Dept_QM_Active: "Yes", Dept_MIC_Active: "No" });
    expect(open(it).sort()).toEqual(["CASE_B_QM", "CASE_B_REG", "CASE_B_SAF"]);
    const rounds = new Set(openActs(it).map((a) => a.round));
    expect(rounds.size).toBe(1);
    submitAt(c, it, "CASE_B_REG");
    submitAt(c, it, "CASE_B_SAF");
    expect(open(it)).toEqual(["CASE_B_QM"]);
    submitAt(c, it, "CASE_B_QM");
    // counts blank → Hold "Yes" → S5
    expect(open(it)).toEqual(["CASE_S5"]);
  });

  it("an all-false block is skipped (SPIKES L132); conditions after the join route S5/S6/S7/S8", () => {
    const c = ctx();
    const it = startItem(c, "CIQ_Case_A00", USERS.alex._id, {});
    for (const s of ["CASE_S0", "CASE_S1", "CASE_S2"]) submitAt(c, it, s);
    submitAt(c, it, "CASE_S3", { Open_Items_Count: 0, Open_CR_Count: 0, Overall_Approval_Required: "No" }); // no dept flags; Hold "No"
    expect(open(it)).toEqual(["CASE_S7"]); // S5 skipped (Hold No), S6 skipped (not required), S7 (decision blank != Rejected)
    submitAt(c, it, "CASE_S7");
    expect(it.status).toBe("Completed"); // S8 skipped (Hold No)
  });

  it("S6 only when Overall_Approval_Required = Yes; an overall rejection skips S7", () => {
    const c = ctx();
    const it = startItem(c, "CIQ_Case_A00", USERS.alex._id, {});
    for (const s of ["CASE_S0", "CASE_S1", "CASE_S2"]) submitAt(c, it, s);
    submitAt(c, it, "CASE_S3", { Open_Items_Count: 0, Open_CR_Count: 0, Overall_Approval_Required: "Yes" });
    expect(open(it)).toEqual(["CASE_S6"]);
    submitAt(c, it, "CASE_S6", { Overall_Decision: "Rejected", Open_Items_Count: null });
    expect(open(it)).toEqual(["CASE_S8"]); // S7 skipped; Hold "Yes" (blank count) → S8
  });

  it("evalCondition: = and != on text; blank is != every value; unknown syntax throws", () => {
    expect(evalCondition('A = "x"', { A: "x" })).toBe(true);
    expect(evalCondition('A != "Rejected"', {})).toBe(true);
    expect(evalCondition('A = "x"', { A: null })).toBe(false);
    expect(() => evalCondition("A > 3", {})).toThrow(/not emulated/);
  });

  it("send-back opens a NEW activity instance at the target step (OP R_SAF → S1)", () => {
    const c = ctx();
    const it = startItem(c, "CIQ_Open_Point_A00", USERS.jo._id, { OP_To_Supplier: "Yes", OP_Dept: "SAF" });
    submitAt(c, it, "OPNT_S0");
    const s1 = openActs(it)[0];
    expect(s1.step).toBe("OPNT_S1");
    submitAt(c, it, "OPNT_S1");
    const r = openActs(it)[0];
    expect(r.step).toBe("OPNT_R_SAF");
    const back = sendBackAct(c, it, r, step("OPNT_S1"), USERS.jo._id);
    expect(back.step).toBe("OPNT_S1");
    expect(back.act).not.toBe(s1.act);
    expect(open(it)).toEqual(["OPNT_S1"]);
    expect(stepOfActivityId("CIQ_Open_Point_A00", activityIdOf("OPNT_S1"))?.irId).toBe("OPNT_S1");
    expect(() => sendBackAct(c, it, back, step("OPNT_R_SAF"), USERS.jo._id)).toThrow(/cannot send back/);
  });

  it("an internal point skips S1 and ends after its review step", () => {
    const c = ctx();
    const it = startItem(c, "CIQ_Open_Point_A00", USERS.alex._id, { OP_To_Supplier: "No", OP_Dept: "QM" });
    submitAt(c, it, "OPNT_S0");
    expect(open(it)).toEqual(["OPNT_R_QM"]);
    submitAt(c, it, "OPNT_R_QM");
    expect(it.status).toBe("Completed");
  });

  it("reject → Rejected and withdraw → Withdrawn; neither completes", () => {
    const c = ctx();
    const a = startItem(c, "CIQ_Case_A00", USERS.alex._id, {});
    submitAt(c, a, "CASE_S0");
    rejectItem(c, a, USERS.alex._id);
    expect(a.status).toBe("Rejected");
    expect(open(a)).toEqual([]);
    const b = startItem(c, "CIQ_Case_A00", USERS.alex._id, {});
    submitAt(c, b, "CASE_S0");
    withdrawItem(c, b, USERS.alex._id);
    expect(b.status).toBe("Withdrawn");
    expect(open(b)).toEqual([]);
  });

  it("tasks go to the owner role; K-FA assigns CASE_S1 from Owner_RMM and OPNT_S1 from Responsible_User", () => {
    const plain = ctx(false);
    const p = startItem(plain, "CIQ_Open_Point_A00", USERS.jo._id, { OP_To_Supplier: "Yes", OP_Dept: "SAF", Responsible_User: { _id: USERS.jo._id } });
    submitAt(plain, p, "OPNT_S0");
    expect(holds(USERS.alex, openActs(p)[0])).toBe(true); // ciq_rmm owns OPNT_S1
    expect(holds(USERS.jo, openActs(p)[0])).toBe(false);
    const kfa = ctx(true);
    const q = startItem(kfa, "CIQ_Open_Point_A00", USERS.jo._id, { OP_To_Supplier: "Yes", OP_Dept: "SAF", Responsible_User: { _id: USERS.jo._id } });
    submitAt(kfa, q, "OPNT_S0");
    expect(holds(USERS.jo, openActs(q)[0])).toBe(true);
    expect(holds(USERS.alex, openActs(q)[0])).toBe(false);
    const k = startItem(kfa, "CIQ_Case_A00", USERS.alex._id, { Owner_RMM: { _id: USERS.casey._id } });
    submitAt(kfa, k, "CASE_S0");
    expect(holds(USERS.casey, openActs(k)[0])).toBe(true);
    expect(holds(USERS.alex, openActs(k)[0])).toBe(false);
  });

  it("the Start activity belongs to the creator only", () => {
    const c = ctx();
    const it = startItem(c, "CIQ_Case_A00", USERS.alex._id, {});
    expect(holds(USERS.alex, openActs(it)[0])).toBe(true);
    expect(holds(USERS.casey, openActs(it)[0])).toBe(false);
  });
});
