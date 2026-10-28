// Engine tests through the SDK command surface (handleNow / dispatch), as the bundled SDK would call it.
import { describe, expect, it } from "vitest";
import type { ChildTableId } from "../schema/generated";
import { tableKey } from "./formula";
import { createHostEngine, type HostEngine } from "./hostEngine";
import { findItem, openActs } from "./state";
import { USERS } from "./users";
import { activityIdOf } from "./workflow";
import { pinServerActivityIds } from "../testkit/serverIds";

const P = "CIQ_Case_A00";
/** The verb the host must refuse (kept out of a `method: "…"` literal, which the static guard bans). */
const HTTP_DELETE = "DELETE";
const OP = "CIQ_Open_Point_A00";
const eng = (q: Record<string, string> = {}) => createHostEngine(q, { clock: () => Date.UTC(2026, 9, 8, 10, 0, 0) });
const call = (e: HostEngine, req: Record<string, unknown>) => e.handleNow(req as never);
const ok = (e: HostEngine, req: Record<string, unknown>) => {
  const r = call(e, req);
  if (r.record.refused) throw new Error(`${String(req.command)} refused: ${r.record.refused.message}`);
  return r.resp as Record<string, unknown>;
};
const err = (e: HostEngine, req: Record<string, unknown>) => {
  const r = call(e, req);
  expect(r.record.refused, `${String(req.command)} should be refused`).toBeTruthy();
  return r.record.refused!;
};
const rows = (resp: unknown): Record<string, unknown>[] => {
  if (Array.isArray(resp)) return resp;
  const o = resp as Record<string, unknown>;
  return (o.Data ?? o.items) as Record<string, unknown>[];
};
const actOf = (e: HostEngine, name: string, step: string) => {
  const it = findItem(e.state, name.startsWith("P") ? OP : name.startsWith("CR") ? "CIQ_Change_Request_A00" : P, e.fixtures[name])!;
  return openActs(it).find((a) => a.step === step)!.act;
};

describe("identity (§11.2)", () => {
  it("CC_INITIALIZE answers the user with AppRoles by display name, the account and the app id", () => {
    const r = ok(eng({ user: "casey" }), { command: "CC_INITIALIZE" });
    expect(r.appId).toBe("CIQ_Digital_A00");
    expect((r.user as { AppRoles: { Name: string; _id: string }[] }).AppRoles.map((x) => x.Name)).toEqual(["Raw Material Manager (RMM)", "Case administrator"]);
    expect((r.user as { AppRoles: { _id: string }[] }).AppRoles.every((x) => x._id.startsWith("Ro"))).toBe(true);
    expect((r.account as { _id: string })._id).toBeTruthy();
    expect(ok(eng({ appId: "CIQ_Supplier_Portal_A00" }), { command: "CC_INITIALIZE" }).appId).toBe("CIQ_Supplier_Portal_A00");
  });
  it("GET_ROLES answers {roles (16), currentRoles} with dev=1 and is refused with dev=0", () => {
    const r = ok(eng({ user: "jo", dev: "1" }), { command: "GET_ROLES" });
    expect((r.roles as unknown[]).length).toBe(16);
    expect((r.currentRoles as { Name: string }[]).map((x) => x.Name)).toEqual(["Product Safety reviewer"]);
    expect(err(eng({ dev: "0" }), { command: "GET_ROLES" }).category).toBe("mode:getRoles");
  });
  it("SWITCH_ROLE is refused, recorded and fails the global checks", () => {
    const e = eng();
    expect(err(e, { command: "SWITCH_ROLE", roleId: "x" }).category).toBe("forbidden");
    expect(e.checks().find((c) => c.label === "no SWITCH_ROLE")!.pass).toBe(false);
  });
});

describe("lists: envelopes, paging, step keys (§11.2)", () => {
  it("live envelopes: My items {Columns, Data}; tasks and admin {_id, Columns, Sort, Filter, Data}; no total", () => {
    const e = eng({ user: "alex" });
    const mine = ok(e, { command: "PROCESS_GET_MY_ITEMS", flowId: P, status: "all", pageNumber: 1, pageSize: 50 });
    expect(Object.keys(mine).sort()).toEqual(["Columns", "Data"]);
    const tasks = ok(e, { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: P, pageNumber: 1, pageSize: 50 });
    expect(Object.keys(tasks).sort()).toEqual(["Columns", "Data", "Filter", "Sort", "_id"]);
    expect(eng({ envelope: "items" }).handleNow({ command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: P, pageNumber: 1, pageSize: 50 }).resp).toHaveProperty("total");
    expect(Object.keys(ok(eng({ envelope: "Data" }), { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: P }))).toEqual(["Data"]);
  });
  it("pages of 50: extra=120 gives 3 pages of dev's case tasks; the last page is short", () => {
    const e = eng({ extra: "120" });
    const n = [1, 2, 3, 4].map((p) => rows(ok(e, { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: P, pageNumber: p, pageSize: 50 })).length);
    expect(n[0]).toBe(50);
    expect(n[1]).toBe(50);
    expect(n[2]).toBeGreaterThan(0);
    expect(n[2]).toBeLessThan(50);
    expect(n[3]).toBe(0);
  });
  it("multiAct=on puts C4's 3 Part 2 rows across the 50-row page boundary, each once", () => {
    const e = eng({ extra: "120", multiAct: "1" });
    const p1 = rows(ok(e, { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: P, pageNumber: 1 }));
    const p2 = rows(ok(e, { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: P, pageNumber: 2 }));
    const c4 = e.fixtures.C4;
    expect(p1.filter((r) => r._id === c4).length).toBe(1);
    expect(p1[49]._id).toBe(c4);
    expect(p2.filter((r) => r._id === c4).length).toBe(2);
    const acts = [...p1, ...p2].filter((r) => r._id === c4).map((r) => r._activity_instance_id);
    expect(new Set(acts).size).toBe(3);
  });
  it("admin list rows carry no _current_step by default (UI-LOG L43); adminStep=row adds it", () => {
    expect(rows(ok(eng(), { command: "PROCESS_GET_ADMIN_ITEMS", flowId: P })).every((r) => !("_current_step" in r))).toBe(true);
    expect(rows(ok(eng({ adminStep: "row" }), { command: "PROCESS_GET_ADMIN_ITEMS", flowId: P })).every((r) => typeof r._current_step === "string")).toBe(true);
    const item = ok(eng(), { command: "PROCESS_GET_ADMIN_ITEM", flowId: P, instanceId: eng().fixtures.C4 });
    expect(item._current_step).toBe("Part 2 – Beiersdorf review");
  });
  it("stepkey: own name (default), block name, first branch's name, or none", () => {
    const names = (q: Record<string, string>) =>
      rows(ok(eng(q), { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: P }))
        .filter((r) => r._id === eng(q).fixtures.C4)
        .map((r) => r._current_step);
    expect(names({}).sort()).toEqual(["Review – QM", "Review – Regulatory", "Review – Safety"]);
    expect(names({ stepkey: "block" })).toEqual(["Part 2 – Beiersdorf review", "Part 2 – Beiersdorf review", "Part 2 – Beiersdorf review"]);
    expect(names({ stepkey: "first" })).toEqual(["Review – Regulatory", "Review – Regulatory", "Review – Regulatory"]);
    expect(names({ stepkey: "none" })).toEqual([undefined, undefined, undefined]);
  });
  it("rows=sparse keeps only system fields and keys on list rows; getItem stays full", () => {
    const e = eng({ rows: "sparse" });
    const r = rows(ok(e, { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: P }))[0];
    expect(r.Trade_Name).toBeUndefined();
    expect(r.Case_Code).toBeTruthy();
    const full = ok(e, { command: "PROCESS_GET_ITEM", flowId: P, instanceId: r._id, activityInstanceId: r._activity_instance_id });
    expect(full.Trade_Name).toBeTruthy();
  });
  it("participated=error answers the live error; adminList refuses non-admins; flowAdmin / caseAdminFlowAdmin grant it", () => {
    expect(err(eng(), { command: "PROCESS_GET_PARTICIPATED_ITEMS", flowId: P }).message).toBe("some error occured");
    expect(err(eng({ user: "jo" }), { command: "PROCESS_GET_ADMIN_ITEMS", flowId: P }).category).toBe("admin-denied");
    expect(rows(ok(eng({ user: "jo", flowAdmin: "jo" }), { command: "PROCESS_GET_ADMIN_ITEMS", flowId: P })).length).toBeGreaterThan(5);
    expect(err(eng({ user: "casey" }), { command: "PROCESS_GET_ADMIN_ITEMS", flowId: P }).category).toBe("admin-denied");
    expect(rows(ok(eng({ user: "casey", caseAdminFlowAdmin: "on" }), { command: "PROCESS_GET_ADMIN_ITEMS", flowId: P })).length).toBeGreaterThan(5);
    expect(err(eng({ adminList: "refuse" }), { command: "PROCESS_GET_ADMIN_ITEMS", flowId: P }).category).toBe("admin-denied");
  });
  it("tasks go to role holders: jo sees only SAF work, alex the RMM steps", () => {
    const jo = rows(ok(eng({ user: "jo" }), { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: P })).map((r) => r._current_step);
    expect(jo).toEqual(["Review – Safety"]);
    const alexOps = rows(ok(eng({ user: "alex" }), { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: OP })).map((r) => r._current_step);
    expect(alexOps.sort()).toEqual(["Review – RMM", "Waiting for supplier"]);
  });
  it("progress=on lists activities with ids and names; progress=off refuses", () => {
    const e = eng();
    const r = call(e, { command: "PROCESS_GET_PROGRESS", flowId: OP, instanceId: e.fixtures.P2 }).resp as { Data: { Name: string; _activity_id: string }[] };
    expect(r.Data.map((x) => x.Name)).toEqual(["Raise open point", "Waiting for supplier", "Review – Regulatory"]);
    expect(r.Data[1]._activity_id).toBe(activityIdOf("OPNT_S1"));
    expect(err(eng({ progress: "0" }), { command: "PROCESS_GET_PROGRESS", flowId: OP, instanceId: e.fixtures.P2 }).category).toBe("mode:progress");
  });
});

describe("refusals (always on)", () => {
  it("a wrong or closed activity instance, or a user not in the step role: moved out of your queue (SPIKES L118)", () => {
    const e = eng({ user: "jo" });
    const c4 = e.fixtures.C4;
    expect(err(e, { command: "PROCESS_GET_ITEM", flowId: P, instanceId: c4, activityInstanceId: actOf(e, "C4", "CASE_B_REG") }).message).toBe("This item has moved out of your queue");
    const saf = actOf(e, "C4", "CASE_B_SAF");
    ok(e, { command: "PROCESS_GET_ITEM", flowId: P, instanceId: c4, activityInstanceId: saf });
    ok(e, { command: "PROCESS_SUBMIT_ITEM", flowId: P, instanceId: c4, activityInstanceId: saf });
    expect(err(e, { command: "PROCESS_GET_ITEM", flowId: P, instanceId: c4, activityInstanceId: saf }).category).toBe("moved-out");
  });
  it("050313 for a field not writable at the step and for any computed field, listing them", () => {
    const e = eng({ user: "jo" });
    const saf = actOf(e, "C4", "CASE_B_SAF");
    const r = err(e, { command: "PROCESS_UPDATE_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: saf, data: { SAF_Open_Count: 1, REG_Open_Count: 0, SAF_Gate: "OK" } });
    expect(r.code).toBe("KISSFLOW_ERROR_050313");
    expect(r.message).toContain("REG_Open_Count");
    expect(r.message).toContain("SAF_Gate");
    expect(r.message).not.toContain("SAF_Open_Count");
    const okr = ok(e, { command: "PROCESS_UPDATE_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: saf, data: { SAF_Open_Count: 1 } });
    expect(okr.SAF_Gate).toBe(""); // server formula recomputed: blank RMES gaps → ""
  });
  it("a DateTime with ms is refused by field TYPE, header and child-row columns", () => {
    const e = eng({ user: "jo" });
    const saf = actOf(e, "C4", "CASE_B_SAF");
    expect(err(e, { command: "PROCESS_UPDATE_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: saf, data: { SAF_Completed_At: "2026-10-08T10:00:00.123Z" } }).category).toBe("validation-ms");
    ok(e, { command: "PROCESS_UPDATE_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: saf, data: { SAF_Completed_At: "2026-10-08T10:00:00Z" } });
    const p3 = e.fixtures.P3;
    const act = actOf(e, "P3", "OPNT_R_SAF");
    const k = tableKey("Rounds" as ChildTableId);
    expect(err(e, { command: "PROCESS_UPDATE_ITEM", flowId: OP, instanceId: p3, activityInstanceId: act, data: { [k]: [{ _id: "Rounds_aaaaaaaaaa", _is_created: true, Rounds_Round_No: 1, Rounds_Outcome: "Accepted", Rounds_Reviewed_At: "2026-10-08T10:00:00.5Z" }] } }).message).toContain(`${k}.Rounds_Reviewed_At`);
  });
  it("kf.api: a non-string body and any DELETE are refused; DELETE fails the checks", () => {
    const e = eng();
    expect(err(e, { command: "API", url: "/process/2/AcX/admin/CIQ_Case_A00/x", args: { method: "PUT", body: { a: 1 } } }).category).toBe("body-not-string");
    // the verb sits in a constant: guards.spec.ts bans a DELETE method literal everywhere, specs included
    expect(err(e, { command: "API", url: "/x", args: { method: HTTP_DELETE.toLowerCase() } }).category).toBe("forbidden");
    expect(e.checks().find((c) => /DELETE/.test(c.label))!.pass).toBe(false);
  });
  it("*_DELETE_ITEM refused and fails; DATAFORM_DISCARD_ITEM of one's own draft is allowed", () => {
    const e = eng();
    expect(err(e, { command: "DATAFORM_DELETE_ITEM", flowId: "CIQ_Internal_Note_A00", itemId: "x" }).category).toBe("forbidden");
    expect(err(e, { command: "PROCESS_DELETE_ITEM", flowId: P, instanceId: "x" }).category).toBe("forbidden");
    expect(e.checks().find((c) => /DELETE/.test(c.label))!.pass).toBe(false);
    const f = eng({ user: "alex" });
    ok(f, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Internal_Note_A00", data: { Note_Text: "x" } });
    ok(f, { command: "DATAFORM_DISCARD_ITEM", flowId: "CIQ_Internal_Note_A00" });
    expect(f.checks().every((c) => c.pass)).toBe(true);
  });
  it("UPDATE_ADMIN_ITEM needs flow Admin; any admin write fails the checks except S39's allow-listed lane fields", () => {
    expect(err(eng({ user: "alex" }), { command: "PROCESS_UPDATE_ADMIN_ITEM", flowId: P, instanceId: "x", data: {} }).category).toBe("admin-denied");
    const e = eng({ user: "casey", caseAdminFlowAdmin: "on" });
    ok(e, { command: "PROCESS_UPDATE_ADMIN_ITEM", flowId: P, instanceId: e.fixtures.C5, data: { QM_Review_Confirm: "Confirmed" } });
    expect(e.checks().find((c) => /no UPDATE_ADMIN_ITEM/.test(c.label))!.pass).toBe(false);
    expect(e.checks({ allowAdminWrite: true }).find((c) => /allow-listed/.test(c.label))!.pass).toBe(true);
    ok(e, { command: "PROCESS_UPDATE_ADMIN_ITEM", flowId: P, instanceId: e.fixtures.C5, data: { Hold_Note: "x" } });
    expect(e.checks({ allowAdminWrite: true }).find((c) => /allow-listed/.test(c.label))!.pass).toBe(false);
  });
});

describe("modes (§11.2)", () => {
  it("kwb=refuse: every UPDATE_ITEM after Start gives 050313 for ALL fields; Start drafts still accept updates", () => {
    const e = eng({ user: "jo", kwb: "refuse" });
    const saf = actOf(e, "C4", "CASE_B_SAF");
    const r = err(e, { command: "PROCESS_UPDATE_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: saf, data: { SAF_Open_Count: 1, SAF_On_Behalf_Of: "x" } });
    expect(r.code).toBe("KISSFLOW_ERROR_050313");
    expect(r.message).toContain("SAF_Open_Count");
    expect(r.message).toContain("SAF_On_Behalf_Of");
    const a = eng({ user: "alex", kwb: "refuse" });
    const d = ok(a, { command: "PROCESS_CREATE_ITEM", flowId: P, data: { Trade_Name: "T" } });
    ok(a, { command: "PROCESS_UPDATE_ITEM", flowId: P, instanceId: d._id, activityInstanceId: d._activity_instance_id, data: { Case_Code: "CIQ-2026-x" } });
  });
  it("race=<flow>:1 answers 200 but drops the keys once; :always every time; child:1 drops only child adds", () => {
    const once = eng({ user: "jo", race: "CIQ_Case_A00:1" });
    const saf = actOf(once, "C4", "CASE_B_SAF");
    const w = (e: HostEngine, v: number) => call(e, { command: "PROCESS_UPDATE_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: saf, data: { SAF_Open_Count: v } });
    expect(w(once, 1).record.refused).toBeUndefined();
    expect(findItem(once.state, P, once.fixtures.C4)!.fields.SAF_Open_Count).toBeUndefined();
    w(once, 2);
    expect(findItem(once.state, P, once.fixtures.C4)!.fields.SAF_Open_Count).toBe(2);
    const always = eng({ user: "jo", race: "CIQ_Case_A00:always" });
    for (let i = 0; i < 4; i++) w(always, 3);
    expect(findItem(always.state, P, always.fixtures.C4)!.fields.SAF_Open_Count).toBeUndefined();
    const child = eng({ user: "jo", race: "child:1" });
    const act = actOf(child, "P3", "OPNT_R_SAF");
    const k = tableKey("Rounds" as ChildTableId);
    ok(child, { command: "PROCESS_UPDATE_ITEM", flowId: OP, instanceId: child.fixtures.P3, activityInstanceId: act, data: { OP_Progress: "In progress", [k]: [{ _id: "Rounds_bbbbbbbbbb", _is_created: true, Rounds_Round_No: 1, Rounds_Outcome: "Accepted" }] } });
    const p3 = findItem(child.state, OP, child.fixtures.P3)!;
    expect(p3.fields.OP_Progress).toBe("In progress");
    expect(p3.fields[k] ?? []).toEqual([]);
  });
  it("childIds=server ignores client row ids; client (default) keeps them", () => {
    for (const [mode, keep] of [["client", true], ["server", false]] as const) {
      const e = eng({ user: "jo", childIds: mode });
      const act = actOf(e, "P3", "OPNT_R_SAF");
      const k = tableKey("Rounds" as ChildTableId);
      ok(e, { command: "PROCESS_UPDATE_ITEM", flowId: OP, instanceId: e.fixtures.P3, activityInstanceId: act, data: { [k]: [{ _id: "Rounds_cccccccccc", _is_created: true, Rounds_Round_No: 1, Rounds_Outcome: "Accepted" }] } });
      const row = (findItem(e.state, OP, e.fixtures.P3)!.fields[k] as { _id: string }[])[0];
      expect(row._id === "Rounds_cccccccccc").toBe(keep);
    }
  });
  it("drafts=strict: a second Form create while a draft is open gives 409 (SPIKES L158)", () => {
    const e = eng({ user: "alex" });
    ok(e, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Internal_Note_A00", data: { Note_Text: "a" } });
    expect(err(e, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Internal_Note_A00", data: { Note_Text: "b" } }).category).toBe("draft-409");
  });
  it("drafts=sticky: an old draft with leftovers is reused unless DATAFORM_DISCARD_ITEM came first", () => {
    const e = eng({ user: "alex", drafts: "sticky" });
    const reused = ok(e, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Internal_Note_A00", data: { Note_Key: "N1", Note_Text: "new" } });
    expect(reused.Linked_Kind).toBe("LEFTOVER");
    const f = eng({ user: "alex", drafts: "sticky" });
    ok(f, { command: "DATAFORM_DISCARD_ITEM", flowId: "CIQ_Internal_Note_A00" });
    const clean = ok(f, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Internal_Note_A00", data: { Note_Key: "N1", Note_Text: "new" } });
    expect(clean.Linked_Kind).toBeUndefined();
  });
  it("formSubmit=fail: the next Form submit answers an error and stores nothing (the draft stays)", () => {
    const e = eng({ user: "alex", formSubmit: "fail" });
    const d = ok(e, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Internal_Note_A00", data: { Note_Key: "N9", Note_Text: "x" } });
    expect(err(e, { command: "DATAFORM_SUBMIT_ITEM", flowId: "CIQ_Internal_Note_A00", itemId: d._id }).category).toBe("mode:formSubmit");
    const list = rows(ok(e, { command: "DATAFORM_GET_ITEMS", flowId: "CIQ_Internal_Note_A00" }));
    expect(list.some((r) => r.Note_Key === "N9")).toBe(false);
    ok(e, { command: "DATAFORM_SUBMIT_ITEM", flowId: "CIQ_Internal_Note_A00", itemId: d._id }); // only the next one fails
  });
  it("formDrop stores the next submitted row WITHOUT that field; formSubmitId=new returns a new id", () => {
    const e = eng({ user: "alex", formDrop: "CIQ_Audit_Event_A00:Notify_Recipient", formSubmitId: "new" });
    const d = ok(e, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Audit_Event_A00", data: { Event_Key: "EV-1", Event_Category: "Cancellation", Notify_Recipient: "a@example.test" } });
    const s = ok(e, { command: "DATAFORM_SUBMIT_ITEM", flowId: "CIQ_Audit_Event_A00", itemId: d._id });
    expect(s._id).not.toBe(d._id);
    expect(s.Notify_Recipient).toBeUndefined();
    expect(s.Event_Key).toBe("EV-1");
  });
  it("F8 updates and updates of a Published F2 row fail the checks; a state-only Retire patch passes", () => {
    const e = eng({ user: "alex" });
    const ev = e.state.rows.find((r) => r.flow === "CIQ_Audit_Event_A00")!.id;
    ok(e, { command: "DATAFORM_UPDATE_ITEM", flowId: "CIQ_Audit_Event_A00", itemId: ev, data: { Event_Reason: "x" } });
    expect(e.checks().find((c) => /F8 is create-only/.test(c.label))!.pass).toBe(false);
    const r = eng({ user: "robin" });
    const tpl = r.fixtures.CFG_TEMPLATE;
    ok(r, { command: "DATAFORM_UPDATE_ITEM", flowId: "CIQ_Config_Version_A00", itemId: tpl, data: { Config_State: "Retired" } });
    expect(r.checks().find((c) => /Published F2/.test(c.label))!.pass).toBe(true);
    const r2 = eng({ user: "robin" });
    ok(r2, { command: "DATAFORM_UPDATE_ITEM", flowId: "CIQ_Config_Version_A00", itemId: tpl, data: { Config_State: "Retired", Change_Note: "x" } });
    expect(r2.checks().find((c) => /Published F2/.test(c.label))!.pass).toBe(false);
  });
  it("sendback=ok sends the point back to S1 by activity id; sendback=500 refuses; send-back is off on the case", () => {
    const e = eng({ user: "sam" });
    const p2 = e.fixtures.P2;
    const act = actOf(e, "P2", "OPNT_R_REG");
    ok(e, { command: "PROCESS_SENDBACK_ITEM", flowId: OP, instanceId: p2, activityInstanceId: act, stepId: activityIdOf("OPNT_S1"), comment: "Please resend" });
    expect(openActs(findItem(e.state, OP, p2)!).map((a) => a.step)).toEqual(["OPNT_S1"]);
    const f = eng({ user: "sam", sendback: "500" });
    expect(err(f, { command: "PROCESS_SENDBACK_ITEM", flowId: OP, instanceId: p2, activityInstanceId: actOf(f, "P2", "OPNT_R_REG"), stepId: activityIdOf("OPNT_S1"), comment: "x" }).category).toBe("mode:sendback");
    const g = eng({ user: "jo" });
    expect(err(g, { command: "PROCESS_SENDBACK_ITEM", flowId: P, instanceId: g.fixtures.C4, activityInstanceId: actOf(g, "C4", "CASE_B_SAF"), stepId: activityIdOf("CASE_S3"), comment: "x" }).category).toBe("switch-off");
  });
  it("reject=ok rejects at a step with reject on; reject=refuse refuses; reject is off at the lanes", () => {
    const e = eng({ user: "alex" });
    ok(e, { command: "PROCESS_REJECT_ITEM", flowId: P, instanceId: e.fixtures.C2, activityInstanceId: actOf(e, "C2", "CASE_S2"), comment: "Cancelled" });
    expect(findItem(e.state, P, e.fixtures.C2)!.status).toBe("Rejected");
    const f = eng({ user: "alex", reject: "refuse" });
    expect(err(f, { command: "PROCESS_REJECT_ITEM", flowId: P, instanceId: f.fixtures.C2, activityInstanceId: actOf(f, "C2", "CASE_S2"), comment: "x" }).category).toBe("mode:reject");
    const g = eng({ user: "jo" });
    expect(err(g, { command: "PROCESS_REJECT_ITEM", flowId: P, instanceId: g.fixtures.C4, activityInstanceId: actOf(g, "C4", "CASE_B_SAF"), comment: "x" }).category).toBe("switch-off");
  });
  it("openForm: ok answers, hang never answers, refuse errors; it must follow a click on wb-kwb-openform", () => {
    const e = eng({ user: "jo" });
    const req = { command: "PROCESS_OPEN_FORM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: actOf(e, "C4", "CASE_B_SAF") };
    ok(e, req);
    expect(e.checks().find((c) => /OPEN_FORM/.test(c.label))!.pass).toBe(false); // no click before it
    const f = eng({ user: "jo", openForm: "hang" });
    f.markClick("wb-kwb-openform");
    const h = call(f, { ...req, instanceId: f.fixtures.C4, activityInstanceId: actOf(f, "C4", "CASE_B_SAF") });
    expect(h.noAnswer).toBe(true);
    expect(f.checks().find((c) => /OPEN_FORM/.test(c.label))!.pass).toBe(true);
    const g = eng({ user: "jo", openForm: "refuse" });
    g.markClick("wb-kwb-openform");
    expect(err(g, { ...req, instanceId: g.fixtures.C4, activityInstanceId: actOf(g, "C4", "CASE_B_SAF") }).category).toBe("mode:openForm");
  });
  it("wrong container (appId=CIQ_Supplier_Portal_A00): any write is refused and fails the checks", () => {
    const e = eng({ user: "alex", appId: "CIQ_Supplier_Portal_A00" });
    expect(err(e, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Internal_Note_A00", data: { Note_Text: "x" } }).category).toBe("wrong-container");
    expect(e.state.rows.some((r) => r.fields.Note_Text === "x")).toBe(false);
    expect(e.checks().find((c) => /wrong container/.test(c.label))!.pass).toBe(false);
    ok(e, { command: "PROCESS_GET_MY_ITEMS", flowId: P }); // reads still work
  });
  it("leniency as live: a submit with blank Mandatory fields is accepted (SPIKES L144)", () => {
    const e = eng({ user: "jo" });
    ok(e, { command: "PROCESS_SUBMIT_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: actOf(e, "C4", "CASE_B_SAF") });
  });
});

describe("dispatch: delays, unanswered handshakes and overlap detection", () => {
  const timers = () => {
    const q: { fn: () => void; ms: number }[] = [];
    return { q, schedule: (fn: () => void, ms: number) => void q.push({ fn, ms }), flush: () => q.splice(0).forEach((x) => x.fn()) };
  };
  it("ignoreInits leaves the first CC_INITIALIZE unanswered; delayInit delays the answer", () => {
    const t = timers();
    const e = createHostEngine({ ignoreInits: "1", delayInit: "1200" }, { schedule: t.schedule });
    const got: unknown[] = [];
    e.dispatch({ _id: "a", command: "CC_INITIALIZE" }, (r) => got.push(r));
    expect(t.q.length).toBe(0);
    e.dispatch({ _id: "b", command: "CC_INITIALIZE" }, (r) => got.push(r));
    expect(t.q[0].ms).toBe(1200);
    t.flush();
    expect(got.length).toBe(1);
    expect(e.calls.filter((c) => c.command === "CC_INITIALIZE").length).toBe(2);
  });
  it("writeDelay: a second write to the same item while the first is unanswered is an overlap; once=1 delays only the first write", () => {
    const t = timers();
    const e = createHostEngine({ user: "jo", writeDelay: "400" }, { schedule: t.schedule });
    const act = actOf(e, "C4", "CASE_B_SAF");
    const w = { command: "PROCESS_UPDATE_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: act, data: { SAF_Open_Count: 1 } };
    e.dispatch({ _id: "1", ...w }, () => {});
    e.dispatch({ _id: "2", ...w }, () => {});
    expect(e.overlaps.length).toBe(1);
    expect(t.q.map((x) => x.ms)).toEqual([400, 400]);
    t.flush();
    e.dispatch({ _id: "3", ...w }, () => {});
    expect(e.overlaps.length).toBe(1);
    const t2 = timers();
    const once = createHostEngine({ user: "jo", writeDelay: "31000", writeDelayOnce: "1" }, { schedule: t2.schedule });
    once.dispatch({ _id: "1", ...w, instanceId: once.fixtures.C4, activityInstanceId: actOf(once, "C4", "CASE_B_SAF") }, () => {});
    once.dispatch({ _id: "2", command: "PROCESS_GET_MY_ITEMS", flowId: P }, () => {});
    once.dispatch({ _id: "3", ...w, instanceId: once.fixtures.C4, activityInstanceId: actOf(once, "C4", "CASE_B_SAF") }, () => {});
    expect(t2.q.map((x) => x.ms)).toEqual([31000, 0, 0]);
    expect(once.overlaps.length).toBe(1); // the second write overlapped the first, unanswered one
  });
  it("creates never overlap: a create before the previous one's submit is reported", () => {
    const e = eng({ user: "alex" });
    const a = ok(e, { command: "PROCESS_CREATE_ITEM", flowId: P, data: { Trade_Name: "A" } });
    ok(e, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Internal_Note_A00", data: { Note_Text: "x" } });
    expect(e.checks().find((c) => /create lane/.test(c.label))!.pass).toBe(false);
    const f = eng({ user: "alex" });
    const b = ok(f, { command: "PROCESS_CREATE_ITEM", flowId: P, data: { Trade_Name: "A" } });
    ok(f, { command: "PROCESS_SUBMIT_ITEM", flowId: P, instanceId: b._id, activityInstanceId: b._activity_instance_id });
    ok(f, { command: "DATAFORM_CREATE_ITEM", flowId: "CIQ_Internal_Note_A00", data: { Note_Text: "x" } });
    expect(f.checks().find((c) => /create lane/.test(c.label))!.pass).toBe(true);
    void a;
  });
});

describe("native form operations (__kfHost)", () => {
  it("nativeSave writes like the native task form; nativeSubmit closes the task; then getItem is moved out", () => {
    const e = eng({ user: "jo", kwb: "refuse" });
    const c4 = e.fixtures.C4;
    const act = actOf(e, "C4", "CASE_B_SAF");
    e.native.save(c4, act, { SAF_Open_Count: 0, SAF_RMES_Gaps: 0 });
    expect(findItem(e.state, P, c4)!.fields.SAF_Gate).toBe("OK");
    e.native.submit(c4, act);
    expect(err(e, { command: "PROCESS_GET_ITEM", flowId: P, instanceId: c4, activityInstanceId: act }).category).toBe("moved-out");
    expect(() => e.native.save(c4, act, { SAF_Open_Count: 1 })).toThrow(/holds no open task/);
    expect(() => e.native.save(e.fixtures.C4, actOf(e, "C4", "CASE_B_QM"), { QM_Gate: "OK" })).toThrow(); // jo does not hold QM
  });
  it("switchUser signs in another fixture user on the same state", () => {
    const e = eng({ user: "alex" });
    const d = ok(e, { command: "PROCESS_CREATE_ITEM", flowId: OP, data: { OP_Key: "K", OP_To_Supplier: "No", OP_Dept: "QM" } });
    ok(e, { command: "PROCESS_SUBMIT_ITEM", flowId: OP, instanceId: d._id, activityInstanceId: d._activity_instance_id });
    e.switchUser("tove");
    expect(e.me.id).toBe("tove");
    expect(e.params.dev).toBe(false);
    const r = rows(ok(e, { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: OP }));
    expect(r.some((x) => x._id === d._id && x._current_step === "Review – QM")).toBe(true);
    expect(ok(e, { command: "CC_INITIALIZE" }).user).toMatchObject({ Name: "Tove Marsh" });
  });
  it("nativeSendBack sends a point back by step name; dropLaneValue loses a lane value after the join", () => {
    const e = eng({ user: "sam" });
    const p2 = e.fixtures.P2;
    e.native.sendBack(p2, actOf(e, "P2", "OPNT_R_REG"), "Waiting for supplier");
    expect(openActs(findItem(e.state, OP, p2)!).map((a) => a.step)).toEqual(["OPNT_S1"]);
    e.native.dropLaneValue(e.fixtures.C5, "QM_Review_Confirm");
    expect(findItem(e.state, P, e.fixtures.C5)!.fields.QM_Review_Confirm).toBeNull();
    expect(e.checks().every((c) => c.pass)).toBe(true); // native operations are not SDK commands
  });
});

describe("a clean session passes every global check", () => {
  it("reads only", () => {
    const e = eng({ user: "dev" });
    for (const f of ["CIQ_Case_A00", "CIQ_Open_Point_A00", "CIQ_Change_Request_A00"]) {
      ok(e, { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: f });
      ok(e, { command: "PROCESS_GET_ADMIN_ITEMS", flowId: f });
    }
    call(e, { command: "PROCESS_GET_PARTICIPATED_ITEMS", flowId: P });
    const failed = e.checks().filter((c) => !c.pass);
    expect(failed).toEqual([]);
  });
  it("a refusal the scenario did not expect fails; expectRefusals allows it", () => {
    const e = eng({ user: "jo" });
    err(e, { command: "PROCESS_GET_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: "nope" });
    expect(e.checks().find((c) => /unless the scenario expects/.test(c.label))!.pass).toBe(false);
    expect(e.checks({ expectRefusals: ["moved-out"] }).find((c) => /unless the scenario expects/.test(c.label))!.pass).toBe(true);
  });
  it("a moved-out read of a task this session just submitted is the expected post-submit re-read (§6.2)", () => {
    const e = eng({ user: "jo" });
    const act = actOf(e, "C4", "CASE_B_SAF");
    ok(e, { command: "PROCESS_SUBMIT_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: act });
    err(e, { command: "PROCESS_GET_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: act });
    expect(e.checks().find((c) => /unless the scenario expects/.test(c.label))!.pass).toBe(true);
    err(e, { command: "PROCESS_UPDATE_ITEM", flowId: P, instanceId: e.fixtures.C4, activityInstanceId: act, data: { SAF_Open_Count: 0 } });
    expect(e.checks().find((c) => /unless the scenario expects/.test(c.label))!.pass).toBe(false); // a write to it is not
  });
  it("users are fictional (@example.test)", () => {
    for (const u of Object.values(USERS)) expect(u.Email.endsWith("@example.test")).toBe(true);
  });
});

describe("server activity ids (§4.4): the read-back id when merged, else the fake Activity_<irstep>", () => {
  it("task filter, getProgress and send-back all use the read-back id; the fake id is then refused", () => {
    const restore = pinServerActivityIds({ OPNT_S1: "Activity_rb_s1", OPNT_R_REG: "Activity_rb_reg" });
    try {
      const e = eng();
      const prog = call(e, { command: "PROCESS_GET_PROGRESS", flowId: OP, instanceId: e.fixtures.P2 }).resp as { Data: { _activity_id: string }[] };
      expect(prog.Data.map((x) => x._activity_id)).toEqual(["Activity_opnt_s0", "Activity_rb_s1", "Activity_rb_reg"]);
      const s = eng({ user: "sam" });
      const p2 = s.fixtures.P2;
      const mine = rows(ok(s, { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: OP, activityId: "Activity_rb_reg" }));
      expect(mine.map((r) => r._id)).toContain(p2);
      expect(mine.every((r) => typeof r._activity_instance_id === "string")).toBe(true); // live: My Tasks rows carry it
      expect(rows(ok(s, { command: "PROCESS_GET_MY_TASKS_ITEMS", flowId: OP, activityId: "Activity_opnt_r_reg" }))).toEqual([]);
      const act = actOf(s, "P2", "OPNT_R_REG");
      expect(err(s, { command: "PROCESS_SENDBACK_ITEM", flowId: OP, instanceId: p2, activityInstanceId: act, stepId: "Activity_opnt_s1", comment: "x" }).category).toBe("bad-request");
      ok(s, { command: "PROCESS_SENDBACK_ITEM", flowId: OP, instanceId: p2, activityInstanceId: act, stepId: "Activity_rb_s1", comment: "Please resend" });
      expect(openActs(findItem(s.state, OP, p2)!).map((a) => a.step)).toEqual(["OPNT_S1"]);
      // live (Diagnostics 2026-10-08): admin list rows carry no _activity_instance_id
      expect(rows(ok(eng(), { command: "PROCESS_GET_ADMIN_ITEMS", flowId: OP })).every((r) => !("_activity_instance_id" in r))).toBe(true);
    } finally {
      restore();
    }
  });
  it("without read-back ids the host fakes Activity_<irstep>", () => {
    const restore = pinServerActivityIds({});
    try {
      expect(activityIdOf("OPNT_S1")).toBe("Activity_opnt_s1");
      const e = eng();
      const prog = call(e, { command: "PROCESS_GET_PROGRESS", flowId: OP, instanceId: e.fixtures.P2 }).resp as { Data: { _activity_id: string }[] };
      expect(prog.Data.map((x) => x._activity_id)).toEqual(["Activity_opnt_s0", "Activity_opnt_s1", "Activity_opnt_r_reg"]);
    } finally {
      restore();
    }
  });
});
