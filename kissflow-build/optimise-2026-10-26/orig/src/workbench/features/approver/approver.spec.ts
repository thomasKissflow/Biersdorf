// T3 approver (§8.12): the BR-035 rule with the effective decision (WB-D8) and the partial-read case (WB-D1), the
// rejection side fields, the pre-submit check, and the S6 save + submit on the fake host. Fixtures are fictional.
import { describe, expect, it } from "vitest";
import { fakeClient, fakeRuntime, heldTask } from "../../testkit/fakeClient";
import { createActions } from "../../data/actions";
import { toCaseVM, toConfigVM, toPointVM } from "../../data/map";
import { CLEAR } from "../../data/normalize";
import type { ListRead, PointVM, RawItem } from "../../data/viewModels";
import { permsAt } from "../../schema";
import {
  DEFAULT_CLOSING_TEXT,
  OVERALL_REJECTION,
  approvalCheck,
  approvalRule,
  attestedBefore,
  buildApprovalPatch,
  closingTextFrom,
  decisionProblems,
  isUpcoming,
  laterDecisionRead,
} from "./rule";

const CASE = "PkC6";
const caseRaw = (o: Record<string, unknown> = {}): RawItem =>
  ({
    _id: CASE,
    _status: "In progress",
    Case_Code: "CIQ-2026-PkC6",
    Cycle_No: 1,
    Trade_Name: "Velvet Oat Extract",
    Overall_Approval_Required: "Yes",
    Dept_SAF_Active: "Yes",
    Dept_REG_Active: "Yes",
    Dept_QM_Active: "No",
    SAF_Review_Confirm: "Confirmed",
    SAF_Completed_At: "2026-10-01T10:00:00Z",
    SAF_RMES_Decision: "Approved",
    REG_Review_Confirm: "Confirmed",
    REG_Completed_At: "2026-10-01T11:00:00Z",
    REG_RMES_Decision: "Approved",
    ...o,
  }) as RawItem;

const point = (id: string, o: Record<string, unknown> = {}): PointVM =>
  toPointVM({ _id: id, _status: "Completed", Case_Item_Id: CASE, OP_Key: `CIQ-2026-PkC6-C1-OP${id}`, OP_Kind: "Department review", OP_Dept: "SAF", OP_Outcome: "Accepted", Reviewed_At: "2026-10-05T09:00:00Z", Open_Num: 0, ...o } as RawItem);

const list = (rows: PointVM[], quality: ListRead<PointVM>["quality"] = "admin"): ListRead<PointVM> => ({ rows, quality, indexOnly: new Set(), warnings: [] });

describe("BR-035 with the effective decision (WB-D8)", () => {
  it("RMES Approved + a later Accepted Department-review point with Late_Decision Rejected → Approved disabled", () => {
    const c = toCaseVM(caseRaw(), "full");
    const r = approvalRule({ c, points: list([point("P1", { Late_Decision: "Rejected" })]), policy: "fail-closed" });
    expect(r.lanes.find((l) => l.dept === "SAF")).toMatchObject({ decision: "Rejected", source: "late", rmesDecision: "Approved" });
    expect(r.canApprove).toBe(false);
    expect(r.blockedBy).toBe("decisions");
  });
  it("RMES Rejected + a later 'Approved' → enabled (the source is shown as the later point)", () => {
    const c = toCaseVM(caseRaw({ SAF_RMES_Decision: "Rejected", SAF_RMES_Decision_Reason: "Impurity profile missing" }), "full");
    const r = approvalRule({ c, points: list([point("P7", { Late_Decision: "Approved" })]), policy: "fail-closed" });
    const saf = r.lanes.find((l) => l.dept === "SAF")!;
    expect(saf).toMatchObject({ decision: "Approved", source: "late", rmesDecision: "Rejected" });
    expect(saf.latePoint?.opKey).toBe("CIQ-2026-PkC6-C1-OPP7");
    expect(r.canApprove).toBe(true);
  });
  it("the newest later decision (by Reviewed_At) wins", () => {
    const c = toCaseVM(caseRaw(), "full");
    const pts = [point("Pold", { Late_Decision: "Approved", Reviewed_At: "2026-10-02T09:00:00Z" }), point("Pnew", { Late_Decision: "Rejected", Reviewed_At: "2026-10-06T09:00:00Z" })];
    expect(approvalRule({ c, points: list(pts), policy: "fail-closed" }).canApprove).toBe(false);
  });
  it("ignores points of another case, non-Accepted points, other kinds and blank Late_Decision", () => {
    const c = toCaseVM(caseRaw(), "full");
    const pts = [
      point("Pa", { Late_Decision: "Rejected", Case_Item_Id: "PkOther" }),
      point("Pb", { Late_Decision: "Rejected", OP_Outcome: "Withdrawn" }),
      point("Pc", { Late_Decision: "Rejected", OP_Kind: "Query" }),
      point("Pd", { Late_Decision: "" }),
    ];
    const r = approvalRule({ c, points: list(pts), policy: "fail-closed" });
    expect(r.lanes.every((l) => l.source === "rmes" && l.decision === "Approved")).toBe(true);
    expect(r.canApprove).toBe(true);
  });
  it("a lane without a decision blocks; an inactive lane does not count", () => {
    const c = toCaseVM(caseRaw({ REG_RMES_Decision: "", Dept_SAF_Active: "No" }), "full");
    const r = approvalRule({ c, points: list([point("P1", { Late_Decision: "Rejected" })]), policy: "fail-closed" });
    expect(r.lanes.map((l) => l.dept)).toEqual(["REG"]);
    expect(r.canApprove).toBe(false);
    expect(r.why.join(" ")).toMatch(/Regulatory decision is not recorded/); // department names, not codes (UX-11)
  });
});

describe("the later-decision read (WB-D1)", () => {
  it("a partial OP list (rung 3) under fail-closed → Approved disabled, even with every RMES decision Approved", () => {
    const c = toCaseVM(caseRaw(), "full");
    const r = approvalRule({ c, points: list([], "mine+tasks"), policy: "fail-closed" });
    expect(r.read.confidence).toBe("partial");
    expect(r.read.unread[0].reason).toMatch(/Open points of this case/);
    expect(r.canApprove).toBe(false);
    expect(r.blockedBy).toBe("read");
    expect(r.why[0]).toMatch(/could not be read with your access/);
  });
  it("attest policy: blocked until attested; after the attestation the visible points decide (else RMES)", () => {
    const c = toCaseVM(caseRaw(), "full");
    const before = approvalRule({ c, points: list([], "mine+tasks"), policy: "attest" });
    expect(before).toMatchObject({ canApprove: false, blockedBy: "attest" });
    const after = approvalRule({ c, points: list([], "mine+tasks"), policy: "attest", attested: true });
    expect(after.canApprove).toBe(true);
    expect(after.lanes.every((l) => l.source === "rmes")).toBe(true);
    // a VISIBLE later rejection still blocks after an attestation (stricter than ignoring it)
    const visible = approvalRule({ c, points: list([point("P1", { Late_Decision: "Rejected" })], "mine+tasks"), policy: "attest", attested: true });
    expect(visible.canApprove).toBe(false);
  });
  it("an attestation never counts under fail-closed", () => {
    const c = toCaseVM(caseRaw(), "full");
    expect(approvalRule({ c, points: list([], "mine+tasks"), policy: "fail-closed", attested: true }).canApprove).toBe(false);
  });
  it("rung 1 with unreadable rows is partial: unknown status, blank kind, a completed SAF review without an outcome", () => {
    const c = toCaseVM(caseRaw(), "full");
    const rows = [toPointVM({ _id: "Px", Case_Item_Id: CASE, OP_Kind: "Query" } as RawItem), point("Py", { OP_Kind: "" }), point("Pz", { OP_Outcome: "" })];
    const r = laterDecisionRead(c, list(rows));
    expect(r.confidence).toBe("partial");
    expect(r.unread.map((u) => u.reason)).toEqual([expect.stringMatching(/Px: status not readable/), expect.stringMatching(/kind not readable/), expect.stringMatching(/outcome not readable/)]);
  });
  it("without an active SAF/REG lane the point list does not matter", () => {
    const c = toCaseVM(caseRaw({ Dept_SAF_Active: "No", Dept_REG_Active: "No", Dept_QM_Active: "Yes" }), "full");
    const r = approvalRule({ c, points: list([], "mine+tasks"), policy: "fail-closed" });
    expect(r).toMatchObject({ canApprove: true, lanes: [] });
  });
  it("attestedBefore: only this user's count.attested row for <Case_Code>:approval on this case and cycle", () => {
    const c = toCaseVM(caseRaw(), "full");
    const ev = { actionCode: "count.attested", objectKey: "CIQ-2026-PkC6:approval", caseItemId: CASE, actorEmail: "wren@example.test", cycleNo: 1 };
    expect(attestedBefore([ev], c, { Email: "Wren@example.test" })).toBe(true);
    expect(attestedBefore([ev], c, { Email: "max@example.test" })).toBe(false);
    expect(attestedBefore([{ ...ev, objectKey: "CIQ-2026-PkC6:lane:SAF" }], c, { Email: "wren@example.test" })).toBe(false);
    expect(attestedBefore([{ ...ev, cycleNo: 2 }], c, { Email: "wren@example.test" })).toBe(false);
  });
});

describe("the decision write (rejection side fields)", () => {
  const me = { _id: "UsWren" };
  it("Rejected: Overall_Reason, a neutral Supplier_Closing_Text and Completion_Trigger 'Overall rejection'; only S6 fields", () => {
    const c = toCaseVM(caseRaw(), "full");
    const p = buildApprovalPatch(c, { decision: "Rejected", reason: "  Safety lane rejected the material ", closingText: " Neutral text " }, me);
    expect(p.fields).toEqual({ Overall_Decision: "Rejected", Overall_Decided_By: { _id: "UsWren" }, Overall_Reason: "Safety lane rejected the material", Supplier_Closing_Text: "Neutral text", Completion_Trigger: OVERALL_REJECTION });
    for (const k of Object.keys(p.fields)) expect(permsAt("CASE_S6")).toContain(k);
  });
  it("Approved: no closing text; a stale 'Overall rejection' trigger is cleared; the reason only when given", () => {
    const c = toCaseVM(caseRaw({ Completion_Trigger: OVERALL_REJECTION }), "full");
    expect(buildApprovalPatch(c, { decision: "Approved", reason: "", closingText: "x" }, me).fields).toEqual({ Overall_Decision: "Approved", Overall_Decided_By: { _id: "UsWren" }, Completion_Trigger: CLEAR });
    const c2 = toCaseVM(caseRaw(), "full");
    expect(buildApprovalPatch(c2, { decision: "Approved", reason: "All clear", closingText: "" }, me).fields).toEqual({ Overall_Decision: "Approved", Overall_Decided_By: { _id: "UsWren" }, Overall_Reason: "All clear" });
  });
  it("client problems: Rejected without a reason is blocked; Approved is blocked when the rule says no", () => {
    const ok = { canApprove: true, why: [] };
    expect(decisionProblems({ decision: "Rejected", reason: " ", closingText: "t" }, ok).map((p) => p.field)).toEqual(["Overall_Reason"]);
    expect(decisionProblems({ decision: "Approved", reason: "", closingText: "" }, { canApprove: false, why: ["SAF decision is \"Rejected\"."] })[0].message).toMatch(/not possible: SAF decision/);
    expect(decisionProblems({}, ok)[0].field).toBe("Overall_Decision");
    expect(decisionProblems({ decision: "Approved", reason: "", closingText: "" }, ok)).toEqual([]);
  });
  it("the fresh-read check: Approved while not allowed, and a rejection without its side fields", () => {
    const no = approvalCheck({ canApprove: false, why: ["x"] });
    expect(no({ _id: CASE, Overall_Decision: "Approved" } as RawItem)).toHaveLength(1);
    const yes = approvalCheck({ canApprove: true, why: [] });
    expect(yes({ _id: CASE, Overall_Decision: "Approved" } as RawItem)).toEqual([]);
    expect(yes({ _id: CASE, Overall_Decision: "Rejected", Overall_Reason: "r" } as RawItem).map((p) => p.field)).toEqual(["Completion_Trigger", "Supplier_Closing_Text"]);
  });
  it("closing text: the pinned Text bundle entry, else the default neutral text", () => {
    const tb = toConfigVM({ _id: "FmTB", Config_Key: "text-bundle-main-v1", Config_Kind: "Text bundle", Payload_JSON: JSON.stringify({ texts: { "closing.overallRejection": "Bundle text" } }) } as RawItem);
    const pinned = { manifest: [{ configKey: "text-bundle-main-v1", kind: "Text bundle", itemId: "FmTB", contentHash: "h" }], rows: new Map([["text-bundle-main-v1", tb]]) };
    expect(closingTextFrom(pinned)).toEqual({ text: "Bundle text", source: "bundle" });
    expect(closingTextFrom(null)).toEqual({ text: DEFAULT_CLOSING_TEXT, source: "default" });
    expect(DEFAULT_CLOSING_TEXT).not.toMatch(/sent|e-mailed|PDF/i);
  });
  it("Upcoming: Part 2 with overall approval required, not cancelled", () => {
    expect(isUpcoming(toCaseVM(caseRaw({ _current_step: "Review – Safety" }), "full"))).toBe(true);
    expect(isUpcoming(toCaseVM(caseRaw({ _current_step: "Part 2 – Beiersdorf review" }), "full"))).toBe(true);
    expect(isUpcoming(toCaseVM(caseRaw({ _current_step: "Overall approval" }), "full"))).toBe(false);
    expect(isUpcoming(toCaseVM(caseRaw({ _current_step: "Review – Safety", Overall_Approval_Required: "No" }), "full"))).toBe(false);
    expect(isUpcoming(toCaseVM(caseRaw({ _current_step: "Review – Safety" }), "row"))).toBe(false); // position not readable
  });
});

describe("S6 save + submit on the fake host", () => {
  const setup = (item: Record<string, unknown>) => {
    const c = fakeClient();
    c.put("CIQ_Case_A00", { ...caseRaw(), ...item, _id: CASE }, { act: "a6", step: "CASE_S6" });
    const t = heldTask("CIQ_Case_A00", CASE, "a6", "CASE_S6");
    const rt = fakeRuntime(c, { tasks: [t] });
    return { c, t, a: createActions(rt), cvm: toCaseVM(c.items.get(`CIQ_Case_A00:${CASE}`)!, "full") };
  };
  it("Rejected: one update with S6 fields only, then the submit (no native reject)", async () => {
    const { c, t, a, cvm } = setup({});
    const rule = approvalRule({ c: cvm, points: list([point("P1", { Late_Decision: "Rejected" })]), policy: "fail-closed" });
    const save = await a.saveAtStep(t, buildApprovalPatch(cvm, { decision: "Rejected", reason: "Later SAF rejection", closingText: DEFAULT_CLOSING_TEXT }, { _id: "UsWren" }));
    expect(save.ok).toBe(true);
    const sub = await a.submitStep(t, { extraChecks: [approvalCheck(rule)] });
    expect(sub).toMatchObject({ ok: true, kind: "submitted" });
    const updates = c.ops("update");
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].data!).sort()).toEqual(["Completion_Trigger", "Overall_Decided_By", "Overall_Decision", "Overall_Reason", "Supplier_Closing_Text"]);
    expect(c.ops("reject")).toHaveLength(0);
    expect(c.ops("submit")).toHaveLength(1);
  });
  it("Approved on the server while the rule says no → the submit is blocked by the extra check", async () => {
    const { c, t, a, cvm } = setup({ Overall_Decision: "Approved", Overall_Decided_By: { _id: "UsWren" } });
    const rule = approvalRule({ c: cvm, points: list([], "mine+tasks"), policy: "fail-closed" });
    const sub = await a.submitStep(t, { extraChecks: [approvalCheck(rule)] });
    expect(sub.kind).toBe("problems");
    expect(c.ops("submit")).toHaveLength(0);
  });
});
