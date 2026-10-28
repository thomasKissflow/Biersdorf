// The fake app (C, D and their tests write against it) behaves as DESIGN §3.3 says: step routing and assignment, the
// live refusal texts, Mandatory, formulas, form ids, child rows, `_modified_at`, and the call log.
import { describe, expect, it } from "vitest";
import type { KfData } from "@/portal/kf/sdk";
import type { RawItem } from "@/portal/data/raw";
import { FLOWS, ROLES, STEPS } from "../ids";
import { AppError, NOT_IN_APP } from "./client";
import { FAKE_ERRORS, createFakeClient, isBlank, type FakeOptions, type FakeSeed } from "./fakeClient";

const RUTH = { _id: "UsRuth", Name: "Ruth Brandt", Email: "ruth.brandt@example.com" }; // fictional RMM
const QUINN = { _id: "UsQuinn", Name: "Quinn Adler" }; // fictional QM reviewer
const NOW = "2026-10-20T21:00:00Z";

const reviewStart = (dept: string): KfData => ({
  Review_Key: `ZZT-0002-${dept}-1`, Case_Code: "ZZT-0002", Case_Item_Id: "PkCaseZ2", Review_Dept: dept, Round_No: 1, Cycle_No: 1,
  Activation_Kind: "Completeness", Track_Status: "In review", Open_Count: 0, RMES_Gaps: 0,
});
const opStart = (dept: string, raiser = RUTH._id): KfData => ({
  Case_Code: "ZZT-0002", Case_Item_Id: "PkCaseZ2", Cycle_No: 1, OP_Dept: dept, OP_Key: `ZZT-0002-${dept}-OP1`, OP_Kind: "Query",
  Question_Text: "Please confirm the INCI of component 2.", Raised_By_Dept: dept, Raised_By_User: { _id: raiser }, Ref_Kind: "Field",
  Ref_Label: "General: INCI", Responsible_User: { _id: raiser }, Round_No: 1, Supplier_Code: "SUP-SOLVARO", Supplier_Due_Date: "2026-11-03",
  Supplier_Justification: "—", Raiser_Assignee: [{ _id: raiser }], OP_Progress: "Open",
});
const fake = (me = RUTH as FakeSeed["me"], items: FakeSeed["items"] = {}, opts: FakeOptions = {}, tasks?: FakeSeed["tasks"]) =>
  createFakeClient({ items, me, tasks }, { now: () => NOW, ...opts });

describe("review routing and role assignment", () => {
  it("a created review waits at Start for its creator, then routes on Review_Dept to a role-held step", async () => {
    const rmm = fake({ ...RUTH, roles: ["rmm"] });
    const { id, act } = await rmm.create("review", reviewStart("QM"));
    expect(rmm.db.review[0]).toMatchObject({ _id: id, _status: "Draft", _current_step: "Activate review", _created_by: { _id: RUTH._id, Name: RUTH.Name } });
    expect(rmm.tasks()).toEqual([{ flow: "review", itemId: id, act, activityId: STEPS.review.start }]);
    expect((await rmm.getTask("review", id, act))._activity_instance_id).toBe(act);

    await rmm.submit("review", id, act);
    expect(rmm.stepOf(id)).toMatchObject({ activityId: STEPS.review.QM, held: false });
    expect(rmm.db.review[0]).toMatchObject({ _status: "InProgress", _current_step: "Review – QM" });
    expect((rmm.db.review[0]._current_context as Record<string, unknown>[])[0]._context_assigned_to).toEqual([
      { Kind: "AppRole", _id: "RoEKl85WB1yE", Name: "Quality Management reviewer" },
    ]);
    // the old activity instance is gone: the item moved out of the creator's queue
    await expect(rmm.getTask("review", id, act)).rejects.toThrow(FAKE_ERRORS.queue);
    await expect(rmm.myTasks("review", STEPS.review.QM)).resolves.toEqual([]);
  });

  it("a QM reviewer holds the QM step through the role (by key, id or name) and completes to End", async () => {
    const seedItem: RawItem = { _id: "PkRevQm", _status: "InProgress", _created_by: { _id: RUTH._id, Name: RUTH.Name }, ...reviewStart("QM"),
      _current_context: [{ _context_activity_id: STEPS.review.QM, _context_activity_instance_id: "ActQm1" }] };
    for (const role of ["qm", "RoEKl85WB1yE", "Quality Management reviewer"]) {
      const qm = fake({ ...QUINN, roles: [role] }, { review: [seedItem] });
      const rows = await qm.myTasks("review", STEPS.review.QM);
      expect(rows.map((r) => [r._id, r._activity_instance_id, r._current_step])).toEqual([["PkRevQm", "ActQm1", "Review – QM"]]);
    }
    const qm = fake({ ...QUINN, roles: ["qm"] }, { review: [seedItem] });
    await qm.update("review", "PkRevQm", "ActQm1", { Review_Confirm: "Confirmed", Completed_By: { _id: QUINN._id }, Completed_At: "2026-10-20T21:05:00Z" });
    expect(qm.db.review[0].Completed_By).toEqual({ _id: QUINN._id, Name: QUINN.Name });
    await qm.submit("review", "PkRevQm", "ActQm1");
    expect(qm.db.review[0]).toMatchObject({ _status: "Completed", _current_step: "End", _current_context: [] });
    expect(qm.tasks()).toEqual([]);
  });

  it("refuses a Review_Dept no branch matches", async () => {
    const rmm = fake();
    const { id, act } = await rmm.create("review", reviewStart("CUS"));
    await expect(rmm.submit("review", id, act)).rejects.toThrow(/No branch of CIQ_Review_A00 matches Review_Dept "CUS"/);
  });
});

describe("open points: OP_Dept routing and field assignment", () => {
  it("routes on OP_Dept and assigns the department step to Raiser_Assignee", async () => {
    const rmm = fake();
    const { id, act } = await rmm.create("op", opStart("RMM"));
    await rmm.submit("op", id, act);
    const st = rmm.stepOf(id)!;
    expect(st).toMatchObject({ activityId: STEPS.op.RMM, held: true });
    expect((rmm.db.op[0]._current_context as Record<string, unknown>[])[0]._context_assigned_to).toEqual([{ Kind: "User", _id: RUTH._id, Name: RUTH.Name }]);
    expect((await rmm.myTasks("op", STEPS.op.RMM)).map((r) => r._id)).toEqual([id]);
    expect(rmm.db.op[0].Open_Num).toBe(1);

    await rmm.update("op", id, st.act, { OP_Outcome: "Accepted", Closed_At: "2026-10-20T21:10:00Z", Closed_By: { _id: RUTH._id }, Thread_JSON: "{}" });
    expect(rmm.db.op[0].Open_Num).toBe(0);
    await rmm.submit("op", id, st.act);
    expect(rmm.db.op[0]._status).toBe("Completed");
  });

  it("another raiser's point is not held: no task, and a write is refused as moved out of the queue", async () => {
    const qm = fake({ ...QUINN, roles: ["qm"] });
    const { id, act } = await qm.create("op", opStart("QM", "UsSomeoneElse"));
    await qm.submit("op", id, act);
    const st = qm.stepOf(id)!;
    expect(st.held).toBe(false);
    await expect(qm.update("op", id, st.act, { OP_Outcome: "Accepted" })).rejects.toThrow(FAKE_ERRORS.queue);
  });

  it("set() plays an integration (I-4) and moves _modified_at, so a stale check sees it", async () => {
    const rmm = fake();
    const { id, act } = await rmm.create("op", opStart("RMM"));
    await rmm.submit("op", id, act);
    const before = String(rmm.db.op[0]._modified_at);
    rmm.set(id, { OP_Progress: "In progress", Response_Text: "Confirmed, see the attached spec.", Response_Kind: "Answer" });
    expect(rmm.db.op[0]).toMatchObject({ OP_Progress: "In progress", Response_Kind: "Answer" });
    expect(String(rmm.db.op[0]._modified_at) > before).toBe(true);
    expect(rmm.db.op[0]._modified_by).toEqual({ _id: RUTH._id, Name: RUTH.Name }); // set() does not claim the write
  });
});

describe("case routing", () => {
  it("Start → waiting → release → End; the waiting and release steps are nobody's internal task", async () => {
    const rmm = fake();
    const { id, act } = await rmm.create("case", { Case_Code: "ZZT-0009" });
    await expect(rmm.submit("case", id, act)).rejects.toThrow(/^KISSFLOW_ERROR_050312 Validation failed: BDF_Contact_Email, /);
    const lax = fake(RUTH, {}, { enforceMandatory: false });
    const c = await lax.create("case", { Case_Code: "ZZT-0009" });
    await lax.submit("case", c.id, c.act);
    expect(lax.stepOf(c.id)).toMatchObject({ activityId: STEPS.case.waiting, held: false });
    expect(lax.db.case[0]._current_step).toBe("Waiting for supplier: CIQ");
    lax.move(c.id, STEPS.case.release);
    expect(lax.db.case[0]).toMatchObject({ _status: "InProgress", _current_step: "Beiersdorf review and final release" });
    lax.move(c.id, STEPS.case.end);
    expect(lax.db.case[0]).toMatchObject({ _status: "Completed", _current_context: [] });
    expect(() => lax.move(c.id, STEPS.op.QM)).toThrow(/not a step of CIQ_Case_A00/);
  });
});

describe("Mandatory and formulas", () => {
  const atQm = (opts: FakeOptions = {}) => {
    const item: RawItem = { _id: "PkRevQm", _status: "InProgress", _created_by: { _id: RUTH._id, Name: RUTH.Name }, ...reviewStart("QM"), Open_Count: 2,
      _current_context: [{ _context_activity_id: STEPS.review.QM, _context_activity_instance_id: "ActQm1" }] };
    return fake({ ...QUINN, roles: ["qm"] }, { review: [item] }, opts);
  };

  it("refuses a submit with blank Mandatory fields, Review_Gate included until Open_Count + RMES_Gaps = 0", async () => {
    const qm = atQm();
    await qm.update("review", "PkRevQm", "ActQm1", { Review_Confirm: "Confirmed", Completed_By: { _id: QUINN._id }, Completed_At: "2026-10-20T21:05:00Z" });
    expect(qm.db.review[0].Review_Gate).toBe("");
    await expect(qm.submit("review", "PkRevQm", "ActQm1")).rejects.toThrow(FAKE_ERRORS.mandatory(["Review_Gate"]));
    await qm.update("review", "PkRevQm", "ActQm1", { Open_Count: 0 });
    expect(qm.db.review[0].Review_Gate).toBe("OK");
    await qm.submit("review", "PkRevQm", "ActQm1");
    expect(qm.db.review[0]._status).toBe("Completed");
  });

  it("lets a blank submit through with enforceMandatory: false (as live, G-7)", async () => {
    const qm = atQm({ enforceMandatory: false });
    await qm.submit("review", "PkRevQm", "ActQm1");
    expect(qm.db.review[0]._status).toBe("Completed");
  });

  it("treats missing, empty text, empty lists and users without an id as blank", () => {
    expect([undefined, null, "", "  ", [], {}, { _id: "" }].map(isBlank)).toEqual(Array(7).fill(true));
    expect([0, "x", [{ _id: "U" }], { _id: "U" }, false].map(isBlank)).toEqual(Array(5).fill(false));
  });
});

describe("field permissions per step (050313, live text)", () => {
  const atOp = (opts: FakeOptions = {}) => {
    const item: RawItem = { _id: "PkOpQm", _status: "InProgress", _created_by: { _id: QUINN._id, Name: QUINN.Name }, ...opStart("QM", QUINN._id),
      _current_step: "Open point – QM" };
    return fake(QUINN, { op: [item] }, opts, [{ flow: "op", itemId: "PkOpQm", act: "ActOp1", activityId: STEPS.op.QM }]);
  };

  it("writes the step's Mandatory and Editable fields, and refuses others with Kissflow's text", async () => {
    const qm = atOp();
    await qm.update("op", "PkOpQm", "ActOp1", { OP_Outcome: "Accepted", Thread_JSON: "{}", Closed_By: { _id: QUINN._id } });
    const err = await qm.update("op", "PkOpQm", "ActOp1", { Case_Code: "ZZT-0003", Return_Reason: "x", Track_Status: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as Error).message).toBe('KISSFLOW_ERROR_050313 You don\'t have permission to update the following fields: {"CIQ_Open_Point_A00": ["Case_Code", "Track_Status"]}.');
  });

  it("replays the live walk with `readOnly` (G-7: Editable fields refused at the department step)", async () => {
    const qm = atOp({ readOnly: { [STEPS.op.QM]: ["Outcome_Reason", "Thread_JSON", "Closed_By", "OP_Outcome", "Closed_At"] } });
    await expect(qm.update("op", "PkOpQm", "ActOp1", { OP_Outcome: "Accepted", Closed_At: "2026-10-20T21:10:00Z", Question_Text: "Q" })).rejects.toThrow(
      FAKE_ERRORS.fields("CIQ_Open_Point_A00", ["OP_Outcome", "Closed_At"]),
    );
    expect(qm.db.op[0].OP_Outcome).toBeUndefined();
  });

  it("strictSteps: false lets any business field through, never a formula or system field", async () => {
    const qm = atOp({ strictSteps: false });
    await qm.update("op", "PkOpQm", "ActOp1", { Case_Code: "ZZT-0003" });
    await expect(qm.update("op", "PkOpQm", "ActOp1", { Open_Num: 0, _status: "Completed" })).rejects.toThrow(/\["Open_Num", "_status"\]/);
  });

  it("stores ReadOnly-at-Start fields on create (G-7) but never formulas", async () => {
    const rmm = fake();
    await rmm.create("op", { ...opStart("RMM"), Response_Text: "stored" });
    expect(rmm.db.op[0].Response_Text).toBe("stored");
    await expect(rmm.create("review", { ...reviewStart("QM"), Review_Gate: "OK" })).rejects.toThrow(/\["Review_Gate"\]/);
  });

  it("refuses DateTimes with milliseconds", async () => {
    const qm = atOp();
    await expect(qm.update("op", "PkOpQm", "ActOp1", { Closed_At: "2026-10-20T21:10:00.123Z" })).rejects.toThrow(FAKE_ERRORS.millis("Closed_At"));
    await expect(qm.formCreate("note", { Note_At: "2026-10-20T21:10:00.5Z" })).rejects.toThrow(/Note_At/);
  });
});

describe("forms and child rows", () => {
  it("formCreate stores the row under a NEW id (draft → submit) and keeps given child row ids", async () => {
    const saf = fake({ ...QUINN, roles: ["saf"] });
    const id = await saf.formCreate("rmesSAF", {
      RMES_Key: "ZZT-0002-RMES-SAF", Result_Case: { _id: "PkCaseZ2" },
      "Table::Safety_Criteria": [
        { _id: "Safety_Criteria_aaaaaaaaaa", _is_created: true, Criteria_Code: "S-01", Criteria_Applicable: "Yes" },
        { _is_created: true, Criteria_Code: "S-02", Criteria_Applicable: "Yes", Criteria_Result: "Negative" },
      ],
    });
    const call = saf.calls.at(-1)!;
    expect(call).toMatchObject({ m: "formCreate", flow: "rmesSAF", id });
    expect((call.result as { draftId: string }).draftId).not.toBe(id);
    const row = await saf.formGet("rmesSAF", id);
    const rows = row["Table::Safety_Criteria"] as Record<string, unknown>[];
    expect(rows.map((r) => [r._id, r.Criteria_Open_Num])).toEqual([["Safety_Criteria_aaaaaaaaaa", 1], [expect.stringMatching(/^Safety_Criteria_fake\d+$/), 1]]);
    expect(rows.some((r) => "_is_created" in r)).toBe(false);
  });

  it("formUpdate changes a row by id, adds _is_created rows, and adds an unknown id as a duplicate (logged)", async () => {
    const saf = fake();
    const id = await saf.formCreate("rmesSAF", { "Table::Safety_Criteria": [{ _id: "Safety_Criteria_aaaaaaaaaa", Criteria_Code: "S-01" }] });
    const before = String(saf.db.rmesSAF[0]._modified_at);
    await saf.formUpdate("rmesSAF", id, {
      "Table::Safety_Criteria": [{ _id: "Safety_Criteria_aaaaaaaaaa", Criteria_Result: "Available" }],
      "Table::Safety_Findings": [{ _id: "Safety_Findings_bbbbbbbbbb", _is_created: true, Findings_Key: "ZZT-0002-F1" }],
      Open_Criteria_Count: 0,
    });
    const it = saf.db.rmesSAF[0];
    expect(it["Table::Safety_Criteria"]).toEqual([{ _id: "Safety_Criteria_aaaaaaaaaa", Criteria_Code: "S-01", Criteria_Result: "Available", Criteria_Open_Num: 0 }]);
    expect(it["Table::Safety_Findings"]).toEqual([{ _id: "Safety_Findings_bbbbbbbbbb", Findings_Key: "ZZT-0002-F1" }]);
    expect(String(it._modified_at) > before).toBe(true);
    expect(saf.warnings).toEqual([]);

    await saf.formUpdate("rmesSAF", id, { "Table::Safety_Criteria": [{ _id: "Safety_Criteria_unknown000", Criteria_Code: "S-01" }] });
    expect((saf.db.rmesSAF[0]["Table::Safety_Criteria"] as unknown[]).length).toBe(2);
    expect(saf.warnings).toEqual([expect.stringMatching(/Safety_Criteria_unknown000 is unknown/)]);
    await expect(saf.formUpdate("rmesSAF", id, { "Table::Safety_Criteria": [{ _id: "Safety_Criteria_aaaaaaaaaa", Criteria_Open_Num: 0 }] })).rejects.toThrow(
      /\["Safety_Criteria.Criteria_Open_Num"\]/,
    );
  });

  it("formUpdate honours a Form's readOnly list (keyed by the flow id)", async () => {
    const ba = fake({ _id: "UsBa", Name: "Bea Admin" }, { supplier: [{ _id: "FmSup1", Supplier_Code: "SUP-SOLVARO" }] }, { readOnly: { [FLOWS.supplier.id]: ["Supplier_Code"] } });
    await expect(ba.formUpdate("supplier", "FmSup1", { Supplier_Code: "X" })).rejects.toThrow(/\["Supplier_Code"\]/);
    await ba.formUpdate("supplier", "FmSup1", { Supplier_City: "Lisbon" });
    expect(ba.db.supplier[0].Supplier_City).toBe("Lisbon");
  });
});

describe("reads by rung", () => {
  const seeded = () => {
    const mine: RawItem = { _id: "PkCaseZ2", _status: "InProgress", _created_by: { _id: RUTH._id, Name: RUTH.Name }, _current_step: "Waiting for supplier: CIQ",
      Case_Code: "ZZT-0002", Trade_Name: "Zetanol", Case_Contacts_JSON: "[]", Owner_RMM: { _id: RUTH._id, Name: RUTH.Name } };
    const draft: RawItem = { _id: "PkCaseZ3", _status: "Draft", _created_by: { _id: RUTH._id, Name: RUTH.Name }, Case_Code: "ZZT-0003" };
    const other: RawItem = { _id: "PkCaseZ4", _status: "Completed", _created_by: { _id: "UsOther", Name: "Olga Other" }, Case_Code: "ZZT-0004" };
    return { case: [mine, draft, other] };
  };

  it("admin reads are refused by default; with admin the list is sparse, has no step and no drafts", async () => {
    const rmm = fake(RUTH, seeded());
    await expect(rmm.adminList("case")).rejects.toThrow(FAKE_ERRORS.admin);
    await expect(rmm.adminGet("case", "PkCaseZ2")).rejects.toThrow(FAKE_ERRORS.admin);
    const ca = fake(RUTH, seeded(), { admin: true });
    const rows = await ca.adminList("case");
    expect(rows.map((r) => r._id)).toEqual(["PkCaseZ2", "PkCaseZ4"]);
    expect(rows[0]).toEqual({ _id: "PkCaseZ2", _status: "InProgress", _created_by: { _id: RUTH._id, Name: RUTH.Name }, Case_Code: "ZZT-0002", Trade_Name: "Zetanol" });
    const full = await ca.adminGet("case", "PkCaseZ2");
    expect(full).toMatchObject({ Case_Contacts_JSON: "[]", _current_context: [{ _context_activity_id: STEPS.case.waiting }] });
    expect(full._activity_instance_id).toBeUndefined();
  });

  it("My items lists what I started, each row exactly as live: its step and activity instance, no field of the item; reading it needs the task", async () => {
    // the live key set (REST, 21 Oct, a Draft and a Completed CIQ Case): no _created_by, no business field
    const LIVE = ["Name", "_activity_id", "_activity_instance_id", "_current_assigned_to", "_current_step", "_id", "_modified_at", "_progress", "_status"];
    const rmm = fake(RUTH, seeded());
    const rows = await rmm.myItems("case");
    expect(rows.map((r) => [r._id, r._current_step, r._activity_id, typeof r._activity_instance_id])).toEqual([
      ["PkCaseZ2", "Waiting for supplier: CIQ", STEPS.case.waiting, "string"],
      ["PkCaseZ3", "Create case", STEPS.case.start, "string"],
    ]);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(LIVE);
    expect(rows[1]).toMatchObject({ Name: "CIQ Case from Ruth Brandt", _status: "Draft", _progress: 0, _current_assigned_to: [{ Kind: "User", _id: RUTH._id, Name: RUTH.Name }] });
    await expect(rmm.getTask("case", "PkCaseZ2", String(rows[0]._activity_instance_id))).rejects.toThrow(FAKE_ERRORS.queue);
    // `rows: "full"` shapes the admin and My tasks rows only; reading the item still needs the task (or initiatorRead)
    const reader = fake(RUTH, seeded(), { initiatorRead: true, rows: "full" });
    const full = await reader.myItems("case");
    expect(Object.keys(full[0]).sort()).toEqual(LIVE);
    expect((await reader.getTask("case", "PkCaseZ2", String(full[0]._activity_instance_id))).Trade_Name).toBe("Zetanol");
    // once Completed: _completed_at too, and no current instance or assignee
    reader.move("PkCaseZ2", STEPS.case.end);
    const done = (await reader.myItems("case"))[0]!;
    expect(Object.keys(done).sort()).toEqual([...LIVE, "_completed_at"].sort());
    expect(done).toMatchObject({ _status: "Completed", _activity_instance_id: "", _current_assigned_to: [], _progress: 100, _completed_at: done._modified_at });
  });

  it("getById answers only for admin or with viewerRead", async () => {
    await expect(fake(RUTH, seeded()).getById("case", "PkCaseZ4")).rejects.toThrow(FAKE_ERRORS.viewer);
    expect((await fake(RUTH, seeded(), { viewerRead: true }).getById("case", "PkCaseZ4")).Case_Code).toBe("ZZT-0004");
    await expect(fake(RUTH, seeded(), { viewerRead: true }).getById("case", "PkNope")).rejects.toThrow(/Document not found/);
  });

  it("discards only my own unsent draft", async () => {
    const rmm = fake(RUTH, seeded());
    await rmm.discard("case", "PkCaseZ3");
    expect(rmm.db.case.map((r) => r._id)).toEqual(["PkCaseZ2", "PkCaseZ4"]);
    await expect(rmm.discard("case", "PkCaseZ2")).rejects.toThrow(FAKE_ERRORS.discard);
  });

  it("reads the seed's step from tasks, _current_context or _current_step, and warns about items without one", () => {
    const f = fake(QUINN, { review: [{ _id: "PkR", _status: "InProgress" }], op: [{ _id: "PkO", _status: "InProgress", _current_step: "Open point – QM" }] },
      {}, [{ flow: "op", itemId: "PkMissing", act: "A", activityId: STEPS.op.QM }]);
    expect(f.stepOf("PkO")).toMatchObject({ activityId: STEPS.op.QM, held: false });
    expect(f.stepOf("PkR")).toBeUndefined();
    expect(f.warnings).toEqual([expect.stringMatching(/seed review PkR: no step/), "seed task PkMissing: no such process item."]);
  });
});

describe("refusals, container guard, webhooks and the log", () => {
  it("refuse: a text refuses every call of a method; a function decides per call", async () => {
    const rmm = fake(RUTH, {}, {
      refuse: { submit: "KISSFLOW_ERROR_050201 This item has moved out of your queue.", formCreate: (c) => (c.flow === "audit" ? "Audit is down" : undefined) },
    });
    const { id, act } = await rmm.create("op", opStart("RMM"));
    await expect(rmm.submit("op", id, act)).rejects.toThrow(FAKE_ERRORS.queue);
    expect(rmm.stepOf(id)?.activityId).toBe(STEPS.op.start); // nothing moved
    await expect(rmm.formCreate("audit", {})).rejects.toThrow("Audit is down");
    expect(await rmm.formCreate("note", { Note_Key: "ZZT-0002-N1" })).toMatch(/^FmNote\d+$/);
    expect(rmm.calls.map((c) => [c.m, c.flow, c.error])).toEqual([
      ["create", "op", undefined],
      ["submit", "op", FAKE_ERRORS.queue],
      ["formCreate", "audit", "Audit is down"],
      ["formCreate", "note", undefined],
    ]);
  });

  it("refuses every write outside CIQ_Digital_A00, as the real client does", async () => {
    const outside = fake(RUTH, {}, { appId: "CIQ_Supplier_Portal_A00" });
    await expect(outside.create("op", opStart("RMM"))).rejects.toThrow(NOT_IN_APP);
    await expect(outside.formCreate("note", {})).rejects.toThrow(NOT_IN_APP);
    await expect(outside.postWebhook("https://example.invalid/h", {})).rejects.toThrow(NOT_IN_APP);
    expect(outside.db.op).toEqual([]);
    expect(await outside.formList("note")).toEqual([]);
  });

  it("records webhook posts and the route (default fetch, the real client's first route)", async () => {
    const f = fake(RUTH);
    expect(await f.postWebhook("https://example.invalid/op-round", { opItemId: "PkO1", idempotencyKey: "HO-op.round-x" })).toBe("fetch");
    expect(f.hooks).toEqual([{ url: "https://example.invalid/op-round", payload: { opItemId: "PkO1", idempotencyKey: "HO-op.round-x" } }]);
    expect(await fake(RUTH, {}, { webhook: "sdk" }).postWebhook("https://example.invalid/op-round", {})).toBe("sdk");
  });

  it("logs the data as sent (a copy) and the ids a create returned", async () => {
    const f = fake();
    const data: KfData = { ...opStart("RMM") };
    const { id, act } = await f.create("op", data);
    data.Question_Text = "changed after the call";
    expect(f.calls[0]).toMatchObject({ m: "create", flow: "op", id, result: { id, act } });
    expect((f.calls[0].data as KfData).Question_Text).toBe("Please confirm the INCI of component 2.");
  });

  it("stamps without milliseconds and always forward", async () => {
    const f = fake();
    const a = await f.create("op", opStart("RMM"));
    await f.submit("op", a.id, a.act);
    const stamps = [String(f.db.op[0]._created_at), String(f.db.op[0]._modified_at)];
    expect(stamps.every((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s))).toBe(true);
    expect(stamps[1] > stamps[0]).toBe(true);
  });
});

describe("opening the supplier's files (27 Oct)", () => {
  const files = [{ id: "Attach_1", key: "upload/2/AcTEST/Attach_1/a.pdf", name: "a.pdf" }];
  const request = { _id: "PkReqZ", App_Case_Item_Id: "PkCaseZ2", Supplier_Files: files };

  it("previewFiles records the files and the (clamped) index in `previews` and the call log; refusable; works outside the app", async () => {
    const f = createFakeClient({ items: {}, me: RUTH }, { appId: "CIQ_Supplier_Portal_A00" });
    await f.previewFiles(files, 4);
    expect(f.previews).toEqual([{ files, index: 0 }]);
    expect(f.calls.map((c) => c.m)).toEqual(["previewFiles"]);
    await expect(f.previewFiles([])).rejects.toThrow("There is no stored file to open.");
    const no = createFakeClient({ items: {}, me: RUTH }, { refuse: { previewFiles: "KISSFLOW_ERROR_050302 No permission" } });
    await expect(no.previewFiles(files)).rejects.toThrow(AppError);
    expect(no.previews).toEqual([]);
  });

  it("portalGet: flow Admin, or portalRead (the opener's read of a case's request, [unverified live])", async () => {
    const seed = { items: {}, portal: { request: [request] }, me: RUTH };
    await expect(createFakeClient(seed).portalGet("request", "PkReqZ")).rejects.toThrow(FAKE_ERRORS.admin);
    expect((await createFakeClient(seed, { portalRead: true }).portalGet("request", "PkReqZ")).Supplier_Files).toEqual(files);
    expect((await createFakeClient(seed, { admin: true }).portalGet("request", "PkReqZ"))._id).toBe("PkReqZ");
  });
});

describe("the colleague directory and the mail hook (27 Oct, @mentions)", () => {
  const MEMBER = { _id: "UsQmIngrid", Name: "Ingrid Nolte", Kind: "User" };
  const PORTAL_USER = { _id: "UsPortalElena", Name: "Elena Ruiz", Kind: "ExternalUser", Email: "elena.ruiz@solvaro.example" };

  it("answers a CIQ role with its members, the account's users, and records every webhook POST", async () => {
    const fake = createFakeClient({ items: {}, me: RUTH, directory: { roles: { [ROLES.qm.id]: [MEMBER, PORTAL_USER] }, users: [{ ...MEMBER, Email: "ingrid.nolte@beiersdorf.example" }] } });
    expect(await fake.roleMembers!(ROLES.qm.id)).toEqual({ _id: ROLES.qm.id, Name: ROLES.qm.name, Members: [MEMBER, PORTAL_USER] });
    // a CIQ role nobody seeded has no members; another id is not found
    expect(await fake.roleMembers!(ROLES.saf.id)).toEqual({ _id: ROLES.saf.id, Name: ROLES.saf.name, Members: [] });
    await expect(fake.roleMembers!("RoUnknown")).rejects.toThrow(/01015/);
    expect(await fake.accountUsers!()).toEqual([{ ...MEMBER, Email: "ingrid.nolte@beiersdorf.example" }]);
    await fake.postWebhook("/integration/2/AcTEST/webhook/MailTok_1", { To: "ingrid.nolte@beiersdorf.example", Subject: "s", Body: "b" });
    expect(fake.hooks).toEqual([{ url: "/integration/2/AcTEST/webhook/MailTok_1", payload: { To: "ingrid.nolte@beiersdorf.example", Subject: "s", Body: "b" } }]);
    expect(fake.calls.map((c) => c.m)).toEqual(["roleMembers", "roleMembers", "roleMembers", "accountUsers", "postWebhook"]);
  });

  it("refuses the reads as a role that may not read them; without a seeded directory the routes don't exist", async () => {
    const fake = createFakeClient({ items: {}, me: RUTH, directory: {} }, { refuse: { roleMembers: "KISSFLOW_ERROR_050302 No access", accountUsers: "KISSFLOW_ERROR_050302 No access" } });
    await expect(fake.roleMembers!(ROLES.qm.id)).rejects.toThrow(/050302/);
    await expect(fake.accountUsers!()).rejects.toThrow(/050302/);
    const plain = createFakeClient({ items: {}, me: RUTH });
    expect(plain.roleMembers).toBeUndefined();
    expect(plain.accountUsers).toBeUndefined();
  });
});
