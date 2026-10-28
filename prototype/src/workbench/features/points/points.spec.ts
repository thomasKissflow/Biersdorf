// T2 · open points (§8.9, §7.5, §12.1 T2 acceptance): the Return patch and its refused-round fallback, the Accept /
// Withdraw / Confirm-withdrawal builders, the OPNT_S1 builders and the panel gated on the HELD task, opKindOptions,
// and createPoint with the server Start_Gate. Fixtures are fictional (@example.test).
import { describe, expect, it } from "vitest";
import { assertWritable, type StepIr } from "../../schema";
import { opKindOptions } from "../../domain/flags";
import { buildReturnPatch, createActions, ActionError } from "../../data/actions";
import { mirrorOf } from "../../data/gates";
import { toCaseVM, toPointVM } from "../../data/map";
import { CLEAR } from "../../data/normalize";
import type { RawItem, TaskVM } from "../../data/viewModels";
import { fakeClient, fakeRuntime, heldTask, ME, type FakeClient, type FakeScript } from "../../testkit/fakeClient";
import { pinServerActivityIds } from "../../testkit/serverIds";
import { createPointWith } from "./createPoint";
import {
  buildAcceptPatch,
  buildConfirmWithdrawalPatch,
  buildManualResponsePatch,
  buildProgressPatch,
  buildRaiseData,
  buildS1WithdrawPatch,
  buildWithdrawPatch,
  defaultToSupplier,
  docRefsOf,
  lateDecisionVisible,
  manualResponseProblems,
  pointPanel,
  raiseProblems,
  WITHDRAWN_BY_BDF,
  type RaiseInput,
} from "./model";

const NOW = new Date("2026-10-08T10:15:30.456Z");
const OP = "CIQ_Open_Point_A00" as const;
const ME2 = { _id: "UsJo", Name: "Jo Weber", Email: "jo@example.test" };

const pointRaw = (o: Record<string, unknown> = {}): RawItem =>
  ({
    _id: "PkP2",
    _status: "In progress",
    OP_Key: "CIQ-2026-PkC4-C1-OPabc1",
    Round_No: 2,
    Query_Key: "CIQ-2026-PkC4-C1-OPabc1|R2",
    Case_Code: "CIQ-2026-PkC4",
    Cycle_No: 1,
    Case_Item_Id: "PkC4",
    OP_Kind: "Query",
    OP_Dept: "SAF",
    Raised_By_Dept: "SAF",
    OP_To_Supplier: "Yes",
    Question_Text: "Please confirm the manufacturing site.",
    Supplier_Justification: "Needed for the safety file.",
    Response_Kind: "Answer",
    Response_Text: "Site in Lyon.",
    Response_Doc_Refs_JSON: '["site-letter.pdf"]',
    Thread_Text: "[2026-10-01T08:00:00Z] Raised by Jo Weber (Safety): Please confirm the manufacturing site.",
    ...o,
  }) as RawItem;
const point = (o: Record<string, unknown> = {}) => toPointVM(pointRaw(o), "full");
const rows = (p: { tables?: Record<string, unknown[] | undefined> }) => (p.tables?.Rounds ?? []) as { kind: string; row: Record<string, unknown> }[];
const keysOf = (p: { fields: Record<string, unknown>; tables?: Record<string, unknown> }) => [...Object.keys(p.fields), ...Object.keys(p.tables ?? {})];

describe("Return (§7.5): the patch builder", () => {
  const p = point();
  const patch = buildReturnPatch(p, { questionText: "Send the site certificate too.", supplierJustification: "Needed.", supplierDueDate: "2026-10-22", internalDueDate: "2026-10-29", reason: "The answer lacks the certificate." }, ME, NOW);
  it("adds one Rounds row for the CURRENT round, outcome Returned, with the old question and response", () => {
    expect(rows(patch)).toHaveLength(1);
    expect(rows(patch)[0]).toMatchObject({
      kind: "add",
      row: { Rounds_Round_No: 2, Rounds_Outcome: "Returned", Rounds_Question_Text: p.questionText, Rounds_Response_Kind: "Answer", Rounds_Response_Text: "Site in Lyon.", Rounds_Reason: "The answer lacks the certificate.", Rounds_Reviewed_By: { _id: ME._id } },
    });
  });
  it("Round_No n+1, Query_Key OP_Key|R<n+1>, the new question and dates, Awaiting_Response Yes, Return_Reason", () => {
    expect(patch.fields).toMatchObject({ Round_No: 3, Query_Key: `${p.opKey}|R3`, Question_Text: "Send the site certificate too.", Supplier_Due_Date: "2026-10-22", Internal_Due_Date: "2026-10-29", Awaiting_Response: "Yes", Return_Reason: "The answer lacks the certificate." });
    expect(String(patch.fields.Thread_Text)).toContain(p.threadText);
    expect(String(patch.fields.Thread_Text)).toMatch(/Returned by Dev Builder \(round 2\)/);
  });
  it("CLEARS the response fields and leaves OP_Outcome untouched (BR-046)", () => {
    expect(patch.fields.Response_Kind).toBe(CLEAR);
    expect(patch.fields.Response_Text).toBe(CLEAR);
    expect(patch.fields.Response_Doc_Refs_JSON).toBe(CLEAR);
    expect("OP_Outcome" in patch.fields).toBe(false);
  });
  it("is writable at every OPNT_R_<D> step", () => {
    for (const s of ["OPNT_R_REG", "OPNT_R_SAF", "OPNT_R_QM", "OPNT_R_MIC", "OPNT_R_SUS", "OPNT_R_RMM"] as StepIr[]) expect(() => assertWritable(s, keysOf(patch))).not.toThrow();
  });
});

function returnSetup(script: FakeScript = {}) {
  const c = fakeClient({ script });
  c.put(OP, pointRaw(), { act: "aR", step: "OPNT_R_SAF" });
  const t = heldTask(OP, "PkP2", "aR", "OPNT_R_SAF");
  const rt = fakeRuntime(c, { tasks: [t] });
  return { c, rt, t, a: createActions(rt) };
}
const RET = { questionText: "Send the site certificate too.", supplierJustification: "Needed.", supplierDueDate: "2026-10-22", internalDueDate: "2026-10-29", reason: "The answer lacks the certificate." };

describe("Return (§7.5): fallbacks", () => {
  it("a refused round write (K-WB) goes straight to the fallback with the Rounds row AND the header values; no send-back; never 'already saved'", async () => {
    const { c, rt, t, a } = returnSetup({ update: () => ({ error: { isError: true, errorMessage: "KISSFLOW_ERROR_050313 Round_No Query_Key Rounds" } }) });
    const r = await a.sendBackPoint(t, RET, point());
    expect(r).toMatchObject({ ok: false, mode: "kwb", kind: "fallback" });
    expect(r.message).not.toMatch(/already saved/);
    expect(c.ops("sendBack")).toHaveLength(0);
    const sheet = rt.pending.load(t.key)!;
    expect(sheet.mode).toBe("values+sendback");
    expect(sheet.note).not.toMatch(/already saved/);
    expect(sheet.fields).toMatchObject({ Round_No: 3, Awaiting_Response: "Yes", Return_Reason: RET.reason });
    const round = (sheet.tables?.Rounds ?? [])[0] as { kind: string; row: Record<string, unknown> };
    expect(round.row).toMatchObject({ Rounds_Round_No: 2, Rounds_Outcome: "Returned", Rounds_Reason: RET.reason });
  });
  it("a refused send-back after a VERIFIED round write says 'already saved' and keeps the sheet for Re-read", async () => {
    const restoreIds = pinServerActivityIds({}); // no read-back: the S1 id learned this session
    try {
      const { c, rt, t, a } = returnSetup({ sendBack: () => ({ error: "500 Internal Server Error" }) });
      rt.session.activityIds.set(`${OP}|Waiting for supplier`, "Act_S1");
      const r = await a.sendBackPoint(t, RET, point());
      expect(r).toMatchObject({ ok: false, mode: "openForm", kind: "fallback" });
      expect(r.message).toMatch(/already saved/);
      expect(c.ops("sendBack")).toHaveLength(1);
      expect((c.ops("sendBack")[0].extra as { stepId: string }).stepId).toBe("Act_S1");
      expect(c.items.get(`${OP}:PkP2`)).toMatchObject({ Round_No: 3, Awaiting_Response: "Yes" });
      expect(rt.pending.load(t.key)?.mode).toBe("values+sendback");
    } finally {
      restoreIds();
    }
  });
});

describe("OPNT_R_<D> builders: each sets Reviewed_By/_Email/_At and ONE Rounds row", () => {
  const p = point();
  const cases: [string, ReturnType<typeof buildAcceptPatch>, string][] = [
    ["Accept", buildAcceptPatch(p, "OPNT_R_SAF", { acceptedDocFileName: "site-letter.pdf", onBehalfOf: "Lee Park" }, ME2, NOW), "Accepted"],
    ["Withdraw", buildWithdrawPatch(p, "Covered by another point.", ME2, NOW), "Withdrawn"],
    ["Confirm withdrawal", buildConfirmWithdrawalPatch(point({ OP_Outcome: "Withdrawn", Outcome_Reason: "Supplier left the market." }), ME2, NOW), "Withdrawn"],
  ];
  it.each(cases)("%s", (_n, patch, outcome) => {
    expect(patch.fields).toMatchObject({ Reviewed_By: { _id: ME2._id }, Reviewed_By_Email: ME2.Email, Reviewed_At: "2026-10-08T10:15:30Z" });
    expect(rows(patch)).toHaveLength(1);
    expect(rows(patch)[0].row).toMatchObject({ Rounds_Round_No: 2, Rounds_Outcome: outcome, Rounds_Reviewed_By: { _id: ME2._id }, Rounds_Reviewed_At: "2026-10-08T10:15:30Z" });
    expect(() => assertWritable("OPNT_R_SAF", keysOf(patch))).not.toThrow();
  });
  it("Accept: OP_Outcome Accepted and the accepted document; Withdraw: Outcome_Reason and OP_Outcome Withdrawn", () => {
    expect(cases[0][1].fields).toMatchObject({ OP_Outcome: "Accepted", Accepted_Doc_File_Name: "site-letter.pdf", On_Behalf_Of: "Lee Park" });
    expect(cases[1][1].fields).toMatchObject({ OP_Outcome: "Withdrawn", Outcome_Reason: "Covered by another point." });
    expect(rows(cases[1][1])[0].row.Rounds_Reason).toBe("Covered by another point.");
  });
  it("Confirm withdrawal does not write OP_Outcome again; its round reason is Outcome_Reason", () => {
    expect("OP_Outcome" in cases[2][1].fields).toBe(false);
    expect(rows(cases[2][1])[0].row.Rounds_Reason).toBe("Supplier left the market.");
  });
  it("Late_Decision only where it is writable (R_REG/R_SAF), never at R_QM (on a Department review point, F3)", () => {
    const saf = buildAcceptPatch(point({ OP_Kind: "Department review" }), "OPNT_R_SAF", { lateDecision: "Approved", lateDecisionReason: "Study received." }, ME2, NOW);
    const qm = buildAcceptPatch(point({ OP_Dept: "QM", OP_Kind: "Department review" }), "OPNT_R_QM", { lateDecision: "Approved" }, ME2, NOW);
    expect(saf.fields).toMatchObject({ Late_Decision: "Approved", Late_Decision_Reason: "Study received." });
    expect("Late_Decision" in qm.fields).toBe(false);
    expect(() => assertWritable("OPNT_R_QM", keysOf(qm))).not.toThrow();
  });
  it("progress patch is writable at R", () => {
    expect(() => assertWritable("OPNT_R_REG", keysOf(buildProgressPatch("In progress")))).not.toThrow();
  });
});

const task = (step: StepIr, id = "PkP2", act = "a1"): TaskVM => heldTask(OP, id, act, step);

describe("pointPanel: actions by step, decided by the HELD task only (ground rule 13)", () => {
  it("Confirm withdrawal is the ONLY action when OP_Outcome = Withdrawn (Accept and Return absent)", () => {
    const pn = pointPanel(point({ OP_Outcome: "Withdrawn" }), [task("OPNT_R_SAF")]);
    expect(pn).toMatchObject({ mode: "review", actions: ["confirm-withdrawal"] });
  });
  it("blank outcome: Accept, Withdraw, Return (supplier point), progress; no Return for an internal point", () => {
    expect(pointPanel(point(), [task("OPNT_R_SAF")]).actions).toEqual(["accept", "withdraw", "return", "progress"]);
    expect(pointPanel(point({ OP_To_Supplier: "No" }), [task("OPNT_R_SAF")]).actions).toEqual(["accept", "withdraw", "progress"]);
    expect(pointPanel(point(), [task("OPNT_R_SAF")], null, { lateDecision: true }).actions).toContain("late-decision");
  });
  it("the OPNT_S1 panel is ENABLED for a non-RMM user who holds the task (a reviewer after K-FA)", () => {
    // jo (Safety only) raised the supplier point and holds its OPNT_S1 task; no role is consulted
    const pn = pointPanel(point(), [task("OPNT_S1", "PkP2", "aS1")]);
    expect(pn.mode).toBe("s1");
    expect(pn.actions).toEqual(["s1-response", "s1-withdraw"]);
    expect(pn.task?.activityInstanceId).toBe("aS1");
  });
  it("…and DISABLED (read-only) for an RMM user who does not hold it, although RMM owns OPNT_S1", () => {
    const pn = pointPanel(point(), [task("OPNT_R_RMM", "OtherPoint")]);
    expect(pn).toMatchObject({ mode: "readonly", task: null, actions: [] });
    expect(pn.note).toMatch(/don't hold this task/);
  });
  it("a ?task= activity that is not held gives read-only; an unresolved task says open in Kissflow", () => {
    expect(pointPanel(point(), [task("OPNT_S1", "PkP2", "aS1")], "other").mode).toBe("readonly");
    const unresolved: TaskVM = { ...task("OPNT_S1"), step: null, stepName: null, evidence: null };
    expect(pointPanel(point(), [unresolved]).mode).toBe("unresolved");
  });
});

describe("OPNT_S1 builders (manual record, Y3 fallback)", () => {
  it("Withdraw point: Response_Kind 'Withdrawn by Beiersdorf', OP_Outcome Withdrawn, Outcome_Reason — writable at S1", () => {
    const p = buildS1WithdrawPatch("  The material was discontinued. ");
    expect(p.fields).toEqual({ Response_Kind: WITHDRAWN_BY_BDF, OP_Outcome: "Withdrawn", Outcome_Reason: "The material was discontinued." });
    expect(() => assertWritable("OPNT_S1", keysOf(p))).not.toThrow();
  });
  it("Supplier responded: kind, text, file names as a JSON array, e-mail, Awaiting_Response No; Portal_Query_Item_Id stays blank", () => {
    const p = buildManualResponsePatch({ responseKind: "Document", responseText: "See attached.", docFileNames: ["cert.pdf", " ", "spec.pdf"], supplierResponsibleEmail: "qa@northwind.example.test" });
    expect(p.fields).toEqual({ Response_Kind: "Document", Response_Text: "See attached.", Response_Doc_Refs_JSON: '["cert.pdf","spec.pdf"]', Supplier_Responsible_Email: "qa@northwind.example.test", Awaiting_Response: "No" });
    expect("Portal_Query_Item_Id" in p.fields).toBe(false);
    expect(() => assertWritable("OPNT_S1", keysOf(p))).not.toThrow();
    expect(manualResponseProblems({ responseKind: "" }).map((x) => x.field)).toEqual(["Response_Kind"]);
    expect(manualResponseProblems({ responseKind: "Answer" })).toEqual([]);
  });
  it("document references are read tolerantly", () => {
    expect(docRefsOf('["a.pdf",{"name":"b.pdf","uploadedAt":"2026-10-01T00:00:00Z"}]')).toEqual([{ name: "a.pdf" }, { name: "b.pdf", uploadedAt: "2026-10-01T00:00:00Z" }]);
    expect(docRefsOf("a.pdf, b.pdf")).toEqual([{ name: "a.pdf" }, { name: "b.pdf" }]);
    expect(docRefsOf("")).toEqual([]);
  });
});

describe("raise: opKindOptions (§7.11) and the create data", () => {
  const reviewer = new Set(["ciq_safety_reviewer"] as const);
  const rmm = new Set(["ciq_rmm"] as const);
  it("reviewers NEVER get 'Additional part' (flag off or on); RMM gets it only with the flag on", () => {
    expect(opKindOptions(reviewer, { additionalPartRaise: false })).not.toContain("Additional part");
    expect(opKindOptions(reviewer, { additionalPartRaise: true })).not.toContain("Additional part");
    expect(opKindOptions(rmm, { additionalPartRaise: false })).not.toContain("Additional part");
    expect(opKindOptions(rmm, { additionalPartRaise: true })).toContain("Additional part");
    expect(opKindOptions(reviewer, { additionalPartRaise: false })).toEqual(["Query", "Document request", "Internal review", "Department review", "Contact update"]);
  });
  it("OP_To_Supplier defaults: Yes for Query/Document request, No for internal kinds, the user picks for Contact update", () => {
    expect([defaultToSupplier("Query"), defaultToSupplier("Document request"), defaultToSupplier("Internal review"), defaultToSupplier("Department review"), defaultToSupplier("Contact update")]).toEqual([true, true, false, false, null]);
  });
  const c = toCaseVM({ _id: "PkC4", Case_Code: "CIQ-2026-PkC4", Cycle_No: 1, Supplier_Code: "NWB-001", Portal_Contact_Ids: "UsPortal1,UsPortal2" } as RawItem, "full");
  const input: RaiseInput = { opKind: "Query", opDept: "SAF", raisedByDept: "SAF", toSupplier: true, refKind: "Section", refSectionKey: "SAF-A", refLabel: "SAF-A · Safety data", questionText: "Please send the toxicology summary.", supplierJustification: "Needed for the assessment.", internalJustification: "Gap in the safety file.", internalDueDate: "2026-10-15", supplierDueDate: "2026-10-22" };
  it("generated keys: OP_Key, Round_No 1, Query_Key OP_Key|R1, Awaiting_Response Yes, Responsible_User = me; never Start_Gate", () => {
    const data = buildRaiseData(input, c, ME2, NOW, () => 0.5);
    expect(data).toMatchObject({ Round_No: 1, Case_Item_Id: "PkC4", Case_Code: "CIQ-2026-PkC4", Supplier_Code: "NWB-001", OP_To_Supplier: "Yes", Awaiting_Response: "Yes", Responsible_User: { _id: "UsJo" }, Responsible_Name: "Jo Weber", Responsible_Dept_Label: "Safety", Portal_Contact_Ids: "UsPortal1,UsPortal2", Kind_Label: "Query" });
    expect(String(data.OP_Key)).toMatch(/^CIQ-2026-PkC4-C1-OP/);
    expect(data.Query_Key).toBe(`${data.OP_Key}|R1`);
    expect("Start_Gate" in data).toBe(false);
    expect(() => assertWritable("OPNT_S0", Object.keys(data))).not.toThrow();
    expect(mirrorOf(OP, "Start_Gate")!(data).value).toBe("OK");
  });
  it("internal points: no supplier fields, no Awaiting_Response; Start gate OK by formula", () => {
    const data = buildRaiseData({ ...input, opKind: "Internal review", toSupplier: false }, c, ME2, NOW);
    expect(data.OP_To_Supplier).toBe("No");
    expect("Supplier_Due_Date" in data || "Supplier_Justification" in data || "Awaiting_Response" in data).toBe(false);
  });
  it("client problems: supplier justification needed for supplier points; supplier due date NOT checked (the server gate decides); Additional part refused", () => {
    expect(raiseProblems({ ...input, supplierJustification: "" }).map((p) => p.field)).toEqual(["Supplier_Justification"]);
    expect(raiseProblems({ ...input, supplierDueDate: "" })).toEqual([]);
    expect(raiseProblems({ ...input, opKind: "Additional part" }).map((p) => p.field)).toEqual(["OP_Kind"]);
  });
});

describe("createPoint (§8.9): create → read back the SERVER Start_Gate → submit only when OK", () => {
  function setup() {
    let client: FakeClient | null = null;
    const gate = (c: { id?: string }) => {
      const it = client!.items.get(`${OP}:${c.id}`);
      if (it) it.Start_Gate = String(mirrorOf(OP, "Start_Gate")!(it).value); // the host computes the formula
    };
    client = fakeClient({ script: { getItem: (c) => gate(c) } });
    const rt = fakeRuntime(client, {});
    return { c: client, a: createActions(rt) };
  }
  const caseVM = toCaseVM({ _id: "PkC4", Case_Code: "CIQ-2026-PkC4", Cycle_No: 1, Supplier_Code: "NWB-001", Portal_Contact_Ids: "UsPortal1" } as RawItem, "full");
  const base: RaiseInput = { opKind: "Query", opDept: "SAF", raisedByDept: "SAF", toSupplier: true, refKind: "Section", refSectionKey: "SAF-A", refLabel: "SAF-A", questionText: "Toxicology summary?", supplierJustification: "Needed.", internalJustification: "Gap.", internalDueDate: "2026-10-15" };
  it("a blank Supplier_Due_Date leaves the server gate blank: problems listed, the draft kept, NO submit; fixed → resumed → submitted", async () => {
    const { c, a } = setup();
    let err: unknown;
    try {
      await createPointWith(a, ME, base, caseVM, { now: NOW, opKey: "CIQ-2026-PkC4-C1-OPkeep" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ActionError);
    const ae = err as ActionError;
    expect(ae.kind).toBe("problems");
    expect(ae.problems.map((p) => p.field)).toContain("Start_Gate");
    expect(ae.problems.find((p) => p.field === "Start_Gate")!.message).toMatch(/Supplier Due Date is blank/);
    expect(ae.draft).toBeTruthy();
    expect(c.ops("submit")).toHaveLength(0);
    const r = await createPointWith(a, ME, { ...base, supplierDueDate: "2026-10-22" }, caseVM, { now: NOW, draft: ae.draft, opKey: "CIQ-2026-PkC4-C1-OPkeep" });
    expect(r.instanceId).toBe(ae.draft!.instanceId);
    expect(c.ops("create")).toHaveLength(1);
    expect(c.ops("submit")).toHaveLength(1);
    expect(c.items.get(`${OP}:${r.instanceId}`)).toMatchObject({ OP_Key: "CIQ-2026-PkC4-C1-OPkeep", Supplier_Due_Date: "2026-10-22", Start_Gate: "OK" });
  });
  it("an internal point submits at once; no create at all on client problems", async () => {
    const { c, a } = setup();
    await createPointWith(a, ME, { ...base, opKind: "Internal review", toSupplier: false }, caseVM, { now: NOW });
    expect(c.ops("submit")).toHaveLength(1);
    await expect(createPointWith(a, ME, { ...base, questionText: "" }, caseVM)).rejects.toBeInstanceOf(ActionError);
    expect(c.ops("create")).toHaveLength(1);
  });
});

describe("late decision visibility", () => {
  it("F3: only a Department review point at R_SAF/R_REG, whatever the lane state; never at R_QM", () => {
    // a Query (or any other kind) never gets it, even with the lane completed: S6 reads only Department review points
    expect(lateDecisionVisible("OPNT_R_SAF", { kind: "Query" })).toBe(false);
    expect(lateDecisionVisible("OPNT_R_REG", { kind: "Document request" })).toBe(false);
    expect(lateDecisionVisible("OPNT_R_SAF", { kind: "Department review" })).toBe(true);
    expect(lateDecisionVisible("OPNT_R_REG", { kind: "Department review" })).toBe(true);
    expect(lateDecisionVisible("OPNT_R_QM", { kind: "Department review" })).toBe(false);
  });
  it("F3: Accept on a Query never writes Late_Decision, even when one is passed", () => {
    const q = buildAcceptPatch(point({ OP_Kind: "Query" }), "OPNT_R_SAF", { lateDecision: "Rejected", lateDecisionReason: "x" }, ME2, NOW);
    expect("Late_Decision" in q.fields).toBe(false);
    expect("Late_Decision_Reason" in q.fields).toBe(false);
  });
});
