// The evidence-based step resolver (§6.3, WB-6) and task loading (WB-7).
import { afterEach, describe, expect, it } from "vitest";
import { createSession } from "./session";
import { findHeldTask, lensTasks, loadTasks, progressActivities, resolveTaskStep } from "./tasks";
import { fakeClient } from "../testkit/fakeClient";
import { pinServerActivityIds } from "../testkit/serverIds";
import type { RawItem } from "./client";
import type { RoleIr } from "../schema";

const BLOCK = "Part 2 – Beiersdorf review";
const all = new Set<RoleIr>(["ciq_rmm", "ciq_regulatory_reviewer", "ciq_safety_reviewer", "ciq_qm_reviewer"]);
const jo = new Set<RoleIr>(["ciq_safety_reviewer"]);
const row = (act: string, step?: string) => ({ _id: "PkC4", _activity_instance_id: act, ...(step ? { _current_step: step } : {}) });
const progress = [
  { activityInstanceId: "a1", name: "Review – Regulatory", activityId: "Activity_reg" },
  { activityInstanceId: "a2", name: "Review – Safety", activityId: "Activity_saf" },
  { activityInstanceId: "a3", name: "Review – QM", activityId: "Activity_qm" },
];

describe("resolveTaskStep", () => {
  it("three Part 2 rows on one _id, all carrying the block name: unresolved without progress", () => {
    for (const a of ["a1", "a2", "a3"]) expect(resolveTaskStep("CIQ_Case_A00", row(a, BLOCK), { openTasksOnItem: 3, roles: all })).toEqual({ step: null, stepName: null, evidence: null });
  });
  it("…resolved with progress, by activity instance (evidence activity)", () => {
    expect(resolveTaskStep("CIQ_Case_A00", row("a2", BLOCK), { openTasksOnItem: 3, roles: all, progress })).toMatchObject({ step: "CASE_B_SAF", evidence: "activity" });
    expect(resolveTaskStep("CIQ_Case_A00", row("a3", BLOCK), { openTasksOnItem: 3, roles: all, progress })).toMatchObject({ step: "CASE_B_QM", evidence: "activity" });
  });
  it("a row carrying ANOTHER branch's name for a multi-task user is not used", () => {
    expect(resolveTaskStep("CIQ_Case_A00", row("a2", "Review – Regulatory"), { openTasksOnItem: 3, roles: all })).toMatchObject({ step: null });
  });
  it("a single-role user with the block name → block-unique", () => {
    expect(resolveTaskStep("CIQ_Case_A00", row("a2", BLOCK), { openTasksOnItem: 1, roles: jo })).toMatchObject({ step: "CASE_B_SAF", evidence: "block-unique" });
  });
  it("the block name with several owned branches stays unresolved even with one task", () => {
    expect(resolveTaskStep("CIQ_Case_A00", row("a2", BLOCK), { openTasksOnItem: 1, roles: all })).toMatchObject({ step: null });
  });
  it("a known step name on a single task → item evidence; an activity filter → activity evidence", () => {
    expect(resolveTaskStep("CIQ_Case_A00", { _id: "Pk1", _activity_instance_id: "x", _current_step: "Scope check" }, { openTasksOnItem: 1, roles: all })).toMatchObject({ step: "CASE_S2", evidence: "item" });
    expect(resolveTaskStep("CIQ_Case_A00", { _id: "Pk1", _activity_instance_id: "x" }, { openTasksOnItem: 1, roles: all, activityStep: "CASE_S2" })).toMatchObject({ step: "CASE_S2", evidence: "activity" });
  });
  it("never returns a Parallel or End step (an activity filter on a block is ignored)", () => {
    expect(resolveTaskStep("CIQ_Case_A00", { _id: "Pk1", _activity_instance_id: "x" }, { openTasksOnItem: 1, roles: all, activityStep: "CASE_PAR" }).step).toBeNull();
    expect(resolveTaskStep("CIQ_Case_A00", { _id: "Pk1", _activity_instance_id: "x", _current_step: "End" }, { openTasksOnItem: 1, roles: all }).step).toBeNull();
  });
  it("falls back to a getItem read's keys for a single task whose row has none", () => {
    expect(resolveTaskStep("CIQ_Open_Point_A00", { _id: "Pk1", _activity_instance_id: "x" }, { openTasksOnItem: 1, roles: all, itemRead: { _current_step: "Waiting for supplier" } })).toMatchObject({ step: "OPNT_S1", evidence: "item" });
  });
  it("parses a getProgress answer tolerantly", () => {
    expect(progressActivities({ Data: [{ _activity_instance_id: "a1", Name: "Review – Safety", _activity_id: "Act_1" }, { junk: 1 }] })).toEqual([{ activityInstanceId: "a1", name: "Review – Safety", activityId: "Act_1" }]);
  });
});

describe("loadTasks / lens / held task", () => {
  // the activity filter needs read-back ids: each loadTasks test pins whether the schema has them
  let restoreIds: (() => void) | null = null;
  afterEach(() => {
    restoreIds?.();
    restoreIds = null;
  });
  it("keys tasks by _id|act, resolves single tasks, leaves Part 2 blocks unresolved without progress", async () => {
    restoreIds = pinServerActivityIds({}); // no read-back ids: one unfiltered My Tasks list
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC2", Case_Code: "CIQ-2026-PkC2" }, { act: "s2", step: "CASE_S2" });
    for (const a of ["a1", "a2", "a3"]) c.taskRows.push({ _id: "PkC4", _flow: "CIQ_Case_A00", _activity_instance_id: a, _current_step: BLOCK } as never);
    const s = createSession();
    const r = await loadTasks(c, { roles: all, session: s, flows: ["CIQ_Case_A00"] });
    expect(r.tasks.map((t) => t.key).sort()).toEqual(["PkC2|s2", "PkC4|a1", "PkC4|a2", "PkC4|a3"]);
    expect(r.tasks.find((t) => t.instanceId === "PkC2")).toMatchObject({ step: "CASE_S2", evidence: "item", caseCode: "CIQ-2026-PkC2" });
    expect(r.tasks.filter((t) => t.instanceId === "PkC4").every((t) => t.step === null)).toBe(true);
    // plain words (UX-13): no flow id, no field name; says where to open them
    expect(r.warnings.join(" ")).toMatch(/3 case tasks can't be opened here: open them from Kissflow's My Tasks/);
    expect(r.warnings.join(" ")).not.toMatch(/CIQ_|_A00|_activity_instance_id/);
    expect([...(s.taskRowKeys.get("CIQ_Case_A00") ?? [])]).toContain("_current_step");
  });
  it("with read-back activity ids: one filtered list per owned step, Part 2 rows resolved by the filter (evidence activity)", async () => {
    restoreIds = pinServerActivityIds({ CASE_S2: "Act_S2", CASE_B_REG: "Act_REG", CASE_B_SAF: "Act_SAF", CASE_B_QM: "Act_QM" });
    const c = fakeClient();
    const byAct: Record<string, RawItem[]> = {
      Act_S2: [{ _id: "PkC2", _activity_instance_id: "s2", Case_Code: "CIQ-2026-PkC2" } as RawItem],
      Act_REG: [{ _id: "PkC4", _activity_instance_id: "a1", _current_step: BLOCK } as RawItem],
      Act_SAF: [{ _id: "PkC4", _activity_instance_id: "a2", _current_step: BLOCK } as RawItem],
      Act_QM: [{ _id: "PkC4", _activity_instance_id: "a3", _current_step: BLOCK } as RawItem],
    };
    const filters: (string | undefined)[] = [];
    c.listTasks = async (flow, activityId) => {
      filters.push(activityId);
      return flow === "CIQ_Case_A00" && activityId ? (byAct[activityId] ?? []).map((r) => ({ ...r })) : [];
    };
    const r = await loadTasks(c, { roles: all, session: createSession(), flows: ["CIQ_Case_A00"] });
    expect(filters.sort()).toEqual(["Act_QM", "Act_REG", "Act_S2", "Act_SAF"]); // never an unfiltered list
    const byKey = Object.fromEntries(r.tasks.map((t) => [t.key, [t.step, t.evidence]]));
    expect(byKey).toEqual({ "PkC2|s2": ["CASE_S2", "activity"], "PkC4|a1": ["CASE_B_REG", "activity"], "PkC4|a2": ["CASE_B_SAF", "activity"], "PkC4|a3": ["CASE_B_QM", "activity"] });
    expect(r.warnings).toEqual([]);
    expect(c.ops("getProgress")).toHaveLength(0); // the filter decided every row
  });
  it("the lens hides tasks at steps none of its roles own, but never field-assigned steps (OPNT_S1, CASE_S1)", () => {
    const t = (step: "CASE_S2" | "OPNT_S1" | "CASE_B_SAF") => ({ key: step, flow: step.startsWith("OPNT") ? "CIQ_Open_Point_A00" : "CIQ_Case_A00", instanceId: "x", activityInstanceId: step, step, stepName: "", evidence: "item", title: "", raw: { _id: "x" } }) as never;
    const shown = lensTasks([t("CASE_S2"), t("OPNT_S1"), t("CASE_B_SAF")], jo).map((x) => x.step);
    expect(shown).toEqual(["OPNT_S1", "CASE_B_SAF"]);
    expect(findHeldTask([t("OPNT_S1")], "CIQ_Open_Point_A00", "x", "OPNT_S1")).not.toBeNull();
    expect(findHeldTask([t("OPNT_S1")], "CIQ_Open_Point_A00", "y")).toBeNull();
  });
});
