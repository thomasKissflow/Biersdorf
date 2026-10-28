// T5 integration: the CHANGE-REQUESTS.md entries applied to the foundation (CR-T2-review-1, CR-T3-admin-2,
// CR-T4-harness-3; CR-T4-harness-1 is in domain/keys.spec.ts and writeVerified below).
import { describe, expect, it } from "vitest";
import { fakeClient, fakeRuntime, heldTask } from "../testkit/fakeClient";
import { createActions } from "./actions";
import { loadCaseBundle } from "./hooks";
import { toCaseVM } from "./map";
import { isClosedAct, markClosedAct } from "./session";
import { missingFrom, normalisePatch } from "./writeVerified";
import type { RawItem } from "./viewModels";

const laneOk = { SAF_Review_Confirm: "Confirmed", SAF_Completed_By: { _id: "UsJo" }, SAF_Completed_By_Email: "jo@example.test", SAF_Completed_At: "2026-10-08T10:00:00Z", SAF_RMES_Decision: "Approved", SAF_Open_Count: 0, SAF_RMES_Gaps: 0, SAF_Gate: "OK" };

function setup(item: Record<string, unknown>, script = {}) {
  const c = fakeClient({ script });
  c.put("CIQ_Case_A00", { _id: "PkC4", Case_Code: "CIQ-2026-PkC4", Cycle_No: 1, ...item }, { act: "a2", step: "CASE_B_SAF" });
  const t = heldTask("CIQ_Case_A00", "PkC4", "a2", "CASE_B_SAF");
  let changes = 0;
  const rt = fakeRuntime(c, { tasks: [t], changed: () => void changes++ });
  return { c, rt, t, a: createActions(rt), changes: () => changes };
}

describe("CR-T4-harness-3: a passing K-WB Re-read signals a change", () => {
  it("matches → the sheet is cleared and changed() is called; still missing → no change signalled", async () => {
    const { c, t, rt, a, changes } = setup({}, { update: () => ({ error: { isError: true, errorMessage: "KISSFLOW_ERROR_050313 SAF_Open_Count" } }) });
    await a.saveAtStep(t, { fields: { SAF_Open_Count: 0 } });
    const n0 = changes();
    expect(await a.reReadPending(t)).toMatchObject({ matches: false });
    expect(changes()).toBe(n0);
    (c.items.get("CIQ_Case_A00:PkC4") as RawItem).SAF_Open_Count = 0; // native save
    expect(await a.reReadPending(t)).toMatchObject({ matches: true, submittedElsewhere: false });
    expect(rt.pending.load(t.key)).toBeNull();
    expect(changes()).toBe(n0 + 1);
  });
});

describe("CR-T3-admin-2: createFormRow signals a change (not for F8)", () => {
  it("a verified F7 note create calls changed(); an F8 row alone does not", async () => {
    const { a, changes } = setup({});
    await a.createFormRow("CIQ_Internal_Note_A00", { Note_Key: "NOTE-1", Note_Text: "Supplier asked for one more week.", Case_Item_Id: "PkC4" }, "Note_Key");
    expect(changes()).toBe(1);
    await a.writeAudit({ category: "Case", actionCode: "note.test", caseItemId: "PkC4", objectKind: "Case", objectItemId: "PkC4" });
    expect(changes()).toBe(1);
  });
  it("a refused create signals nothing", async () => {
    const { a, changes } = setup({});
    await expect(a.createFormRow("CIQ_Internal_Note_A00", { Note_Key: "N" }, "Note_Key")).rejects.toMatchObject({ kind: "problems" });
    expect(changes()).toBe(0);
  });
});

describe("CR-T2-review-1: an activity closed by this session is never read again", () => {
  it("submitStep marks the submitted activity closed", async () => {
    const { t, rt, a } = setup(laneOk);
    expect(isClosedAct(rt.session, t.flow, t.instanceId, t.activityInstanceId)).toBe(false);
    expect(await a.submitStep(t)).toMatchObject({ ok: true });
    expect(isClosedAct(rt.session, t.flow, t.instanceId, t.activityInstanceId)).toBe(true);
  });
  it("rejectCase marks the rejected activity closed", async () => {
    const c = fakeClient();
    c.put("CIQ_Case_A00", { _id: "PkC2", Case_Code: "CIQ-2026-PkC2", Cycle_No: 1 }, { act: "s2", step: "CASE_S2" });
    const t = heldTask("CIQ_Case_A00", "PkC2", "s2", "CASE_S2");
    const rt = fakeRuntime(c, { tasks: [t] });
    const r = await createActions(rt).rejectCase(t, "Supplier withdrew the material.", toCaseVM(c.items.get("CIQ_Case_A00:PkC2") as RawItem, "full"));
    expect(r.ok).toBe(true);
    expect(isClosedAct(rt.session, "CIQ_Case_A00", "PkC2", "s2")).toBe(true);
  });
  it("the case bundle skips getItem with a closed activity (stale task list) and reads the next rung", async () => {
    const { c, t, rt } = setup(laneOk);
    markClosedAct(rt.session, t.flow, t.instanceId, t.activityInstanceId);
    const b = await loadCaseBundle(rt, "PkC4");
    expect(b.data.case._id).toBe("PkC4");
    expect(c.calls.filter((x) => x.op === "getItem")).toHaveLength(0);
    expect(c.calls.some((x) => x.op === "getAdminItem" || x.op === "listTasks" || x.op === "listAdmin" || x.op === "listMine")).toBe(true);
  });
  it("an open held activity is still read with getItem", async () => {
    const { c, rt } = setup(laneOk);
    await loadCaseBundle(rt, "PkC4");
    expect(c.calls.filter((x) => x.op === "getItem").map((x) => x.act)).toEqual(["a2"]);
  });
});

describe("CR-T4-harness-1: a finding without a criterion is matched by its text under server row ids", () => {
  it("missingFrom finds the add although the server assigned its own row _id", () => {
    const pending = normalisePatch("CIQ_RMES_Safety_A00", { fields: {}, tables: { Safety_Findings: [{ kind: "add", row: { Findings_Text: "Residual solvent above limit" } }] } }, () => 0.5);
    const back = { _id: "Rm1", "Table::Safety_Findings": [{ _id: "SERVER_1", Findings_Text: "Residual solvent above limit", Findings_Criterion_Code: null }] };
    const miss = missingFrom("CIQ_RMES_Safety_A00", back, pending);
    expect(miss.tables.Safety_Findings ?? []).toHaveLength(0);
    const other = { _id: "Rm1", "Table::Safety_Findings": [{ _id: "SERVER_1", Findings_Text: "Another finding", Findings_Criterion_Code: null }] };
    expect(missingFrom("CIQ_RMES_Safety_A00", other, pending).tables.Safety_Findings).toHaveLength(1);
  });
});
