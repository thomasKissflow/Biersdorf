// The writers against the in-memory Kissflow (kf/fakeClient.ts) seeded with the live-shaped fixtures (DESIGN §7.1):
// one test per P1 method, the load-time activation (ensureRmes, planRmesCriteria pinned to the real
// confirmCompleteness), idempotency, the order write → read-back → gate → submit → hand-offs → one audit row, field
// sets with every Mandatory field, Select texts, no milliseconds, stale and refused writes, partial failures (a draft
// left behind; a lost audit row is a warning), hand-offs pending without a URL and sent with one, and their payloads:
// app item ids only (shared/handoff.ts, 20 Oct).
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { INTERNAL_PERSONAS } from "@/domain/catalog";
import * as M from "@/domain/suppliers";
import type { AppState, CiqCase, InternalPersonaId } from "@/domain/types";
import { childRows, str, userIds, type RawItem } from "@/portal/data/raw";
import { EDITABLE, FLOWS, LIST, MANDATORY, STEPS, TABLES } from "../ids";
import { AppError, NOT_IN_APP } from "../kf/client";
import { FAKE_ERRORS, createFakeClient, type FakeCall, type FakeClient, type FakeOptions } from "../kf/fakeClient";
import { keepUnread } from "../load";
import { parseSnapshot } from "../map/auditMap";
import { toAppState } from "../map/toAppState";
import { parseThread } from "../map/trackMap";
import { CASE_START_FIELDS } from "../shared/caseStartPayload";
import { NO_PORTAL_CONTACT, appFixtures, caseItemIdOf, fixtureActing, fixtureIdentity, opItemId } from "../testing/rawFixtures";
import type { AppClient, FlowKey, LiveSnapshot, Mapped, WritableMethod, WriteCtx, WriteResult } from "../types";
import { MOVE_PROBES, draftSentAudit, draftUnread, draftWaits, liveWriters } from "./actions";
import { RMES_WAITS, ensureRmes, planRmesCriteria } from "./activation";
import { GUARD_TEXT, liveGuard } from "./guards";
import { NO_PORTAL_CONTACT as NO_PORTAL_CONTACT_TEXT } from "../userText";
import { HANDED_OVER, PENDING_NO_URL, PENDING_PARTIAL_HISTORY } from "./handoff";
import { CONTACT_KEY_HELD, STALE_TEXT } from "./verify";
import { contactEmails, esc, mailUrlOf } from "./mail";

const AT = "2026-10-24T09:00:00.000Z"; // with milliseconds on purpose: the writers must strip them
const DUE = "2026-11-30T00:00:00.000Z";
const MS = /\d{2}:\d{2}:\d{2}\.\d+Z/;
const HOOKS = { "case.started": "https://hooks.example/case-started", "op.round": "https://hooks.example/op-round", "op.edited": "https://hooks.example/op-edited", "op.closed": "https://hooks.example/op-closed", "history.updated": "https://hooks.example/history", "release.requested": "https://hooks.example/release", "case.cancelled": "https://hooks.example/cancelled", "review.reopened": "https://hooks.example/reopened" } as const;
const WRITES = new Set<FakeCall["m"]>(["create", "update", "submit", "discard", "formCreate", "formUpdate", "postWebhook"]);

type Mode = "full" | "role";

/** The LiveSnapshot load.ts would give a persona, from the fake's current items (as rawFixtures.fixtureSnapshot). */
function snapOf(fake: FakeClient, me: string, persona: InternalPersonaId, mode: Mode): LiveSnapshot {
  const tasks = fake.tasks();
  const held = new Map(tasks.map((t) => [t.itemId, t]));
  const withAct = (it: RawItem): RawItem => (held.has(it._id) ? { ...it, _activity_instance_id: held.get(it._id)!.act } : it);
  const all = (f: "case" | "review" | "op") => fake.db[f].filter((it) => str(it, "_status") !== "Draft").map((it) => withAct(structuredClone(it)));
  const dept = INTERNAL_PERSONAS.find((p) => p.id === persona)?.dept;
  const created = (it: RawItem) => userIds(it, "_created_by")[0] === me;
  const items: LiveSnapshot["items"] =
    mode === "full"
      ? { case: all("case"), review: all("review"), op: all("op") }
      : { case: persona === "rmm" ? all("case").filter(created) : [], review: all("review").filter((it) => held.has(it._id) || (persona === "rmm" && created(it))), op: all("op").filter((it) => held.has(it._id) || created(it)) };
  const forms: LiveSnapshot["forms"] = {
    audit: structuredClone(fake.db.audit),
    config: fake.db.config,
    note: structuredClone(fake.db.note),
    rmesSAF: mode === "full" || dept === "SAF" || persona === "auditor" ? structuredClone(fake.db.rmesSAF) : [],
    rmesREG: mode === "full" || dept === "REG" || persona === "auditor" ? structuredClone(fake.db.rmesREG) : [],
    supplier: mode === "full" || persona === "rmm" || persona === "admin" ? structuredClone(fake.db.supplier) : [],
  };
  const unreadableCases: LiveSnapshot["unreadableCases"] = {};
  if (mode === "role") for (const it of fake.db.case) if (!items.case.some((x) => x._id === it._id)) unreadableCases[it._id] = "no read route for this role";
  return { loadedAt: AT, items, forms, tasks, unreadableCases, reads: [], warnings: [] };
}

interface Boot {
  fake: FakeClient;
  m: Mapped;
  me: string;
  reload(): Mapped;
  ctx(over?: Partial<WriteCtx>): WriteCtx;
}

/** A persona signed in on the fake app, with its mapped state (the store's view after a load). */
function boot(persona: InternalPersonaId, opts: { mode?: Mode; db?: Partial<Record<FlowKey, RawItem[]>>; fake?: FakeOptions; webhooks?: WriteCtx["webhooks"]; client?: (f: FakeClient) => AppClient } = {}): Boot {
  const identity = fixtureIdentity([persona]);
  const acting = fixtureActing(identity, persona);
  const fake = createFakeClient({ items: opts.db ?? appFixtures().db, me: { _id: identity.kfUserId, Name: identity.name, Email: identity.email, roles: [persona] } }, { now: () => AT, ...opts.fake });
  const client = opts.client ? opts.client(fake) : fake;
  const b: Boot = {
    fake,
    me: acting.me.id,
    m: undefined as unknown as Mapped,
    reload() {
      b.m = toAppState({ snap: snapOf(fake, identity.kfUserId, persona, opts.mode ?? "full"), identity, acting });
      return b.m;
    },
    ctx: (over = {}) => ({ client, identity, acting, index: b.m.index, webhooks: opts.webhooks ?? {}, now: () => AT, containerOk: true, ...over }),
  };
  b.reload();
  return b;
}

/** The store's steps 2–5 (DESIGN §6): the live guard, the pure domain action (accepted), then the writer. */
async function act(b: Boot, method: WritableMethod, args: unknown[], domain: (s: AppState, by: string) => AppState, prevState?: AppState) {
  const prev = prevState ?? b.m.state;
  expect(liveGuard(method, b.ctx(), prev, args)).toBeNull();
  const next = domain(prev, b.me);
  expect(A.wasRefused(prev, next), next.toasts.at(-1)?.text).toBe(false);
  const from = b.fake.calls.length;
  const r = await liveWriters[method]!(b.ctx(), prev, next, args);
  return { r, prev, next, calls: b.fake.calls.slice(from) };
}

/** The successful write calls in order, as "m flow". */
const writesOf = (calls: FakeCall[]) => calls.filter((c) => WRITES.has(c.m) && !c.error).map((c) => `${c.m}${c.flow ? ` ${c.flow}` : ""}`);
/** Every string anywhere in a call's data. */
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
const noMillis = (calls: FakeCall[]) => calls.filter((c) => c.m !== "postWebhook").flatMap((c) => strings(c.data)).filter((s) => MS.test(s) && !s.trim().startsWith("{") && !s.trim().startsWith("["));
const dataOf = (calls: FakeCall[], m: FakeCall["m"], flow: FlowKey) => calls.find((c) => c.m === m && c.flow === flow && !c.error)?.data as Record<string, unknown>;
const auditsOf = (calls: FakeCall[]) => calls.filter((c) => c.m === "formCreate" && c.flow === "audit" && !c.error).map((c) => c.data as Record<string, unknown>);
const ok = (r: WriteResult) => expect(r, r.message).toMatchObject({ ok: true });
/** A sent payload: the ids given plus the idempotency key of its code. */
const idsOnly = (code: string, ids: Record<string, unknown>) => ({ ...ids, idempotencyKey: expect.stringMatching(new RegExp(`^HO-${code.replace(".", "\\.")}-`)) });
const caseOf = (s: AppState, id: string): CiqCase => s.cases.find((c) => c.id === id)!;
const sectionIn = (c: CiqCase) => c.scope.find((x) => x.applicability === "mandatory")!.sectionId;

/** What a load gives the load-time effects: its reads (not checked by the effects themselves) and the audit rows. */
const factsOf = (b: Boot) => ({ reads: [], audit: structuredClone(b.fake.db.audit) });

/** The fixture items with some removed (by flow, a predicate). */
function without(drop: Partial<Record<FlowKey, (it: RawItem) => boolean>>): Partial<Record<FlowKey, RawItem[]>> {
  const db = appFixtures().db;
  return Object.fromEntries(Object.entries(db).map(([f, items]) => [f, items.filter((it) => !drop[f as FlowKey]?.(it))]));
}

// ------------------------------------------------------------------------------------------------ createCase

describe("createCase (RMM)", () => {
  const input = (contactIds = ["UsElena", "UsRavi"]): A.NewCaseInput => ({ materialName: "OLIVIA Pure 100", inci: "Olea Europaea Fruit Oil", materialNo: "RM-500123", supplierId: "SUP-ZZT-SOLVARO", contactIds, markets: ["EU", "UK"], dueDate: DUE, priority: "high" });

  it("creates the case with every Start Mandatory field and the six payload fields, reads it back, submits, writes case.created", async () => {
    const b = boot("rmm");
    const { r, next, calls } = await act(b, "createCase", [input()], (s, by) => A.createCase(s, by, input(), AT).state);
    ok(r);
    expect(r.handoffs).toEqual([{ code: "case.started", status: "pending", detail: PENDING_NO_URL }]);
    expect(writesOf(calls)).toEqual(["create case", "submit case", "formCreate audit"]);
    expect(calls.map((c) => c.m)).toContain("getTask");
    const data = dataOf(calls, "create", "case");
    for (const k of MANDATORY[STEPS.case.start]!) expect(data[k], k).toBeTruthy();
    for (const k of Object.values(CASE_START_FIELDS)) expect(data[k], k).toBeTruthy();
    const c = next.cases.find((x) => !b.m.state.cases.some((y) => y.id === x.id))!;
    expect(data).toMatchObject({ Case_Code: c.id, Cycle_No: 1, Priority: LIST.priority.high, Owner_RMM: { _id: "UsRmmKatrin" }, Supplier_Due_Date: "2026-11-30", Target_Markets_Text: "EU, UK", Portal_Contact_Ids: "UsElena,UsRavi", Confirm_Contact_Ids: "UsElena", Release_Item_Id: "PkCfgRelV1", BDF_Contact_Email: "katrin.vogel@beiersdorf.example" });
    expect(JSON.parse(String(data.Portal_Assignees_JSON))).toEqual([{ _id: "UsElena" }, { _id: "UsRavi" }]);
    expect(noMillis(calls)).toEqual([]);
    const id = calls.find((x) => x.m === "create")!.id!;
    expect(b.fake.stepOf(id)).toMatchObject({ activityId: STEPS.case.waiting });
    const [row] = auditsOf(calls);
    expect(row).toMatchObject({ Action_Code: "case.created", Event_Category: "Case", Case_Code: c.id, Case_Item_Id: id, Object_Kind: "Case", Ref_Flow_Id: FLOWS.case.id });
    const snap = parseSnapshot(row as RawItem)!;
    expect(snap.case).toMatchObject({ caseId: c.id, itemId: id, ownerId: "UsRmmKatrin", contacts: [{ id: "UsElena", mayConfirm: true }, { id: "UsRavi", mayConfirm: false }] });
    expect(snap.audit.map((e) => e.action)).toContain("Created case");
  });

  it("sends case.started {caseItemId} once the Start submit succeeded (I-1); the case.created row records its status", async () => {
    const b = boot("rmm", { webhooks: HOOKS });
    const { r, calls } = await act(b, "createCase", [input()], (s, by) => A.createCase(s, by, input(), AT).state);
    ok(r);
    expect(writesOf(calls)).toEqual(["create case", "submit case", "postWebhook", "formCreate audit"]);
    const id = calls.find((x) => x.m === "create")!.id!;
    expect(b.fake.hooks).toEqual([{ url: HOOKS["case.started"], payload: idsOnly("case.started", { caseItemId: id }) }]);
    expect(r.handoffs).toEqual([{ code: "case.started", status: "sent", detail: HANDED_OVER, key: (b.fake.hooks[0]!.payload as { idempotencyKey: string }).idempotencyKey }]);
    const [row] = auditsOf(calls);
    expect(row).toMatchObject({ Action_Code: "case.created", Notify_Channel: "webhook" });
    expect(JSON.parse(String(row!.Notify_Recipient))).toEqual(r.handoffs);
  });

  it("leaves a draft when the Start gate fails (no submit, no audit row)", async () => {
    const db = appFixtures().db;
    const b = boot("rmm", { db: { ...db, config: db.config.map((r) => (r._id === "PkCfgRelV1" ? { ...r, Manifest_Hash: "" } : r)) } });
    const { r, calls } = await act(b, "createCase", [input()], (s, by) => A.createCase(s, by, input(), AT).state);
    expect(r).toMatchObject({ ok: false, tone: "warning" });
    expect(r.message).toMatch(/saved as a draft in Kissflow but not sent: Kissflow misses Manifest_Hash/);
    expect(writesOf(calls)).toEqual(["create case"]);
    expect(str(b.fake.db.case.at(-1), "_status")).toBe("Draft");
  });

  it("leaves a draft when the submit fails, and sends no case.started", async () => {
    const b = boot("rmm", { webhooks: HOOKS, fake: { refuse: { submit: "KISSFLOW_ERROR_050201 This item has moved out of your queue." } } });
    const { r, calls } = await act(b, "createCase", [input()], (s, by) => A.createCase(s, by, input(), AT).state);
    expect(r).toMatchObject({ ok: false, tone: "warning", handoffs: [] });
    expect(r.message).toMatch(/draft.*050201/);
    expect(auditsOf(calls)).toEqual([]);
    expect(b.fake.hooks).toEqual([]);
  });

  it("a draft sent later from Diagnostics gets its case.created row (so a role that can't read the case finds it again) and its case.started", async () => {
    let refuse = true;
    const b = boot("rmm", { webhooks: HOOKS, fake: { refuse: { submit: () => (refuse ? "KISSFLOW_ERROR_00500 Try again later." : undefined) } } });
    const { r, next } = await act(b, "createCase", [input()], (s, by) => A.createCase(s, by, input(), AT).state);
    expect(r).toMatchObject({ ok: false });
    const c = next.cases.find((x) => !b.m.state.cases.some((y) => y.id === x.id))!;
    const draft = b.fake.db.case.at(-1)!;
    const task = b.fake.tasks().find((t) => t.itemId === draft._id)!;
    // what the store's Send does (LiveAppStore sendDraft): read through the Start task, submit, then the history line
    refuse = false;
    const item = await b.fake.getTask("case", draft._id, task.act);
    await b.fake.submit("case", draft._id, task.act);
    const from = b.fake.calls.length;
    expect(b.fake.hooks).toEqual([]);
    const sent = await draftSentAudit(b.ctx(), "case", item);
    expect(sent).toMatchObject({ ok: true, warnings: [] });
    expect(b.fake.hooks).toEqual([{ url: HOOKS["case.started"], payload: idsOnly("case.started", { caseItemId: draft._id }) }]);
    expect(sent.handoffs.map((h) => [h.code, h.status])).toEqual([["case.started", "sent"]]);
    const [row] = auditsOf(b.fake.calls.slice(from));
    expect(row).toMatchObject({ Action_Code: "case.created", Case_Code: c.id, Case_Item_Id: draft._id, Object_Kind: "Case", Object_Item_Id: draft._id });
    expect(JSON.parse(String(row!.Notify_Recipient))).toEqual(sent.handoffs);
    expect(parseSnapshot(row as RawItem)!.case).toMatchObject({ caseId: c.id, itemId: draft._id, ownerId: "UsRmmKatrin", supplierId: c.supplierId, materialName: c.materialName });
    const saf = boot("saf", { mode: "role", db: b.fake.db });
    const seen = caseOf(saf.m.state, c.id);
    expect([seen.materialName, seen.inci, seen.supplierId, seen.ownerId, seen.supplierContactIds, seen.priority, seen.phase]).toEqual([c.materialName, c.inci, c.supplierId, c.ownerId, c.supplierContactIds, c.priority, "supplier-input"]);
  });

  it("is refused before any write when no chosen contact has a portal user", () => {
    const b = boot("rmm");
    expect(b.m.state.users.some((u) => u.id === `contact:${NO_PORTAL_CONTACT.key}`)).toBe(true);
    expect(liveGuard("createCase", b.ctx(), b.m.state, [input([`contact:${NO_PORTAL_CONTACT.key}`])])).toBe(GUARD_TEXT.noPortalContact);
    expect(liveGuard("createCase", b.ctx({ containerOk: false }), b.m.state, [input()])).toBe(NOT_IN_APP);
  });
});

// ------------------------------------------------------------------------------------------------ activation

describe("activation", () => {
  it("planRmesCriteria equals the criteria of a real completeness confirmation", () => {
    const fx = appFixtures();
    const real = fx.state.cases.find((c) => c.id === "ZZT-0003")!;
    // the real confirmCompleteness, by the case's own contact, on the case as it was in Part 1
    const part1: CiqCase = { ...real, supplierId: "s1", phase: "supplier-input", reviews: [], rmes: undefined, requestedDocs: undefined, reviewVersion: 0, confirmations: real.confirmations.filter((k) => k.type !== "completeness") };
    const s = { ...fx.state, cases: fx.state.cases.map((c) => (c.id === real.id ? part1 : c)) };
    const confirmed = A.confirmCompleteness(s, real.supplierContactIds[0]!, real.id, AT);
    expect(A.wasRefused(s, confirmed)).toBe(false);
    const want = caseOf(confirmed, real.id).rmes!.criteria;
    const plan = planRmesCriteria(s, real.id, AT);
    expect("criteria" in plan && plan.criteria).toEqual(want);
    // and on the live-mapped case (a reviewer's view)
    const mapped = boot("saf").m.state;
    const live = planRmesCriteria(mapped, "ZZT-0003", AT);
    expect("criteria" in live && live.criteria.map((x) => [x.id, x.part, x.dept, x.title, x.source])).toEqual(want.map((x) => [x.id, x.part, x.dept, x.title, x.source]));
    expect(planRmesCriteria(mapped, "nope", AT)).toEqual({ error: "This case is no longer loaded." });
  });

  it("ensureRmes (SAF) creates its RMES row with the planned criteria once", async () => {
    const db = without({ rmesSAF: (it) => str(it, "Case_Code") === "ZZT-0003", audit: (it) => str(it, "Object_Key") === "ZZT-0003-RMES-SAF" });
    const b = boot("saf", { db });
    const from = b.fake.calls.length;
    const r = (await ensureRmes(b.ctx(), b.m.state, factsOf(b)))!;
    ok(r);
    const calls = b.fake.calls.slice(from);
    expect(writesOf(calls)).toEqual(["formCreate rmesSAF", "formCreate audit"]);
    expect(calls.map((x) => x.m)).toContain("formGet");
    const data = dataOf(calls, "formCreate", "rmesSAF");
    const plan = planRmesCriteria(b.m.state, "ZZT-0003", AT);
    const saf = "criteria" in plan ? plan.criteria.filter((x) => x.dept === "SAF") : [];
    const rows = data[`Table::${TABLES.SAF.criteria}`] as Record<string, unknown>[];
    expect(rows.map((x) => x.Criteria_Code)).toEqual(saf.map((x) => x.id));
    for (const row of rows) {
      expect(row._is_created).toBe(true);
      expect(String(row._id)).toMatch(/^Safety_Criteria_[a-z0-9]{10}$/);
      expect(row).not.toHaveProperty("Criteria_Open_Num");
    }
    expect(data).toMatchObject({ RMES_Key: "ZZT-0003-RMES-SAF", Case_Item_Id: caseItemIdOf("ZZT-0003"), Open_Criteria_Count: saf.length, Open_Blocking_Findings_Count: 0, RMES_Voided: LIST.no });
    // m13: no Reference to the case (refused when the reviewer can't read it); Case_Item_Id is the join key
    expect(data).not.toHaveProperty("Result_Case");
    expect(auditsOf(calls)[0]).toMatchObject({ Action_Code: "rmes.saved", Event_Category: "RMES", Object_Kind: "RMES record" });
    expect(await ensureRmes(b.ctx(), b.m.state, factsOf(b))).toBeNull();
    const again = boot("saf", { db: b.fake.db });
    expect(again.m.index.rmes.get("ZZT-0003|SAF")).toBeTruthy();
    expect(await ensureRmes(again.ctx(), again.m.state, factsOf(again))).toBeNull();
  });
});

describe("activation with tonight's grants (the case item unreadable, R-1)", () => {
  it("ensureRmes creates nothing while the case can't be read (the criteria would stay incomplete): a note instead (M1)", async () => {
    const b = boot("saf", { mode: "role", db: without({ rmesSAF: (it) => str(it, "Case_Code") === "ZZT-0003", audit: (it) => str(it, "Object_Key") === "ZZT-0003-RMES-SAF" }) });
    expect(b.m.index.cases.get("ZZT-0003")!.readable).toBe(false);
    const from = b.fake.calls.length;
    const r = (await ensureRmes(b.ctx(), b.m.state, factsOf(b)))!;
    expect(r).toMatchObject({ ok: true, note: true, message: RMES_WAITS("ZZT-0003", "SAF") });
    expect(writesOf(b.fake.calls.slice(from))).toEqual([]);
  });

  it("ensureRmes creates nothing when the history names the record although this load did not list it (M1)", async () => {
    // the RMES form came back without the row (a refused or partial read), but its rmes.saved "RMES record" row exists
    const b = boot("saf", { db: without({ rmesSAF: (it) => str(it, "Case_Code") === "ZZT-0003", audit: (it) => str(it, "Object_Key") === "ZZT-0003-RMES-SAF" }) });
    expect(await ensureRmes(b.ctx(), b.m.state, factsOf(b)), "without the row it would create").not.toBeNull();
    const b2 = boot("saf", { db: without({ rmesSAF: (it) => str(it, "Case_Code") === "ZZT-0003", audit: (it) => str(it, "Object_Key") === "ZZT-0003-RMES-SAF" }) });
    const audit = [...b2.fake.db.audit, { _id: "PkEvRmes", Case_Code: "ZZT-0003", Case_Item_Id: caseItemIdOf("ZZT-0003"), Action_Code: "rmes.saved", Object_Kind: "RMES record", Object_Key: "ZZT-0003-RMES-SAF", Event_At: "2026-10-23T10:00:00Z" } as RawItem];
    const from = b2.fake.calls.length;
    expect(await ensureRmes(b2.ctx(), b2.m.state, { reads: [], audit })).toBeNull();
    expect(writesOf(b2.fake.calls.slice(from))).toEqual([]);
  });

});

// ------------------------------------------------------------------------------------------------ open points

describe("open points", () => {
  it("raiseOpenPoint (MIC) creates the point with every Start Mandatory field, submits it to its department step, history pending", async () => {
    const b = boot("mic");
    const c = caseOf(b.m.state, "ZZT-0003");
    const sec = sectionIn(c);
    const input: A.RaiseInput = { dept: "MIC", kind: "document-request", ref: { sectionId: sec, label: sec }, question: "Please send the microbiological test report.", justification: "", dueDate: DUE };
    const { r, next, calls } = await act(b, "raiseOpenPoint", ["ZZT-0003", input], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", input, AT));
    ok(r);
    expect(writesOf(calls)).toEqual(["create op", "submit op", "formCreate audit"]);
    const data = dataOf(calls, "create", "op");
    for (const k of MANDATORY[STEPS.op.start]!) expect(data[k], k).toBeTruthy();
    const op = caseOf(next, "ZZT-0003").openPoints.at(-1)!;
    expect(data).toMatchObject({ OP_Key: op.id, Round_No: 1, Query_Key: `${op.id}-R1`, OP_Kind: LIST.opKind["document-request"], Kind_Label: LIST.kindLabel["document-request"], OP_Dept: "MIC", Raised_By_Dept: "MIC", OP_To_Supplier: LIST.yes, OP_Progress: LIST.opProgress.open, Supplier_Justification: "—", Supplier_Due_Date: "2026-11-30", Raiser_Assignee: [{ _id: "UsMicTobias" }], Responsible_User: { _id: "UsMicTobias" }, Portal_Contact_Ids: "UsElena,UsRavi" });
    expect(parseThread({ _id: "x", Thread_JSON: data.Thread_JSON } as RawItem)!.thread.map((m) => m.action)).toEqual(["raised"]);
    const id = calls.find((x) => x.m === "create")!.id!;
    expect(b.fake.stepOf(id)).toMatchObject({ activityId: STEPS.op.MIC, held: true });
    expect(r.handoffs.map((h) => [h.code, h.status])).toEqual([["op.round", "pending"], ["history.updated", "pending"]]);
    const [row] = auditsOf(calls);
    expect(row).toMatchObject({ Action_Code: "op.raised", Object_Key: op.id, Object_Item_Id: id, Case_Item_Id: caseItemIdOf("ZZT-0003"), Notify_Channel: "webhook" });
    expect(parseSnapshot(row as RawItem)!.op).toMatchObject({ id: op.id, status: "open" });
    expect(noMillis(calls)).toEqual([]);
  });

  it("raiseOpenPoint sends op.round {opItemId} (round 1, I-3) after the Start submit: the point holds the round when it goes", async () => {
    const b = boot("mic", { webhooks: HOOKS });
    const sec = sectionIn(caseOf(b.m.state, "ZZT-0003"));
    const input: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please confirm the shelf life.", justification: "", dueDate: DUE };
    const { r, next, calls } = await act(b, "raiseOpenPoint", ["ZZT-0003", input], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", input, AT));
    ok(r);
    expect(writesOf(calls)).toEqual(["create op", "submit op", "postWebhook", "postWebhook", "formCreate audit"]);
    const id = calls.find((x) => x.m === "create")!.id!;
    const op = caseOf(next, "ZZT-0003").openPoints.at(-1)!;
    expect(b.fake.hooks[0]).toEqual({ url: HOOKS["op.round"], payload: idsOnly("op.round", { opItemId: id }) });
    expect(b.fake.find(id)!.item).toMatchObject({ Round_No: 1, Query_Key: `${op.id}-R1`, Question_Text: input.question });
    expect(r.handoffs.map((h) => [h.code, h.status])).toEqual([["op.round", "sent"], ["history.updated", "sent"]]);
    // a raise whose submit fails sends nothing (the draft is not the supplier's yet)
    const d = boot("mic", { webhooks: HOOKS, fake: { refuse: { submit: "KISSFLOW_ERROR_00500 Try again later." } } });
    const failed = await act(d, "raiseOpenPoint", ["ZZT-0003", input], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", input, AT));
    expect(failed.r).toMatchObject({ ok: false, handoffs: [] });
    expect(d.fake.hooks).toEqual([]);
  });

  it("an open point sent later from Diagnostics gets its op.raised row: the other roles see it from the snapshot", async () => {
    let refuse = true;
    const b = boot("mic", { fake: { refuse: { submit: () => (refuse ? "KISSFLOW_ERROR_00500 Try again later." : undefined) } } });
    const c = caseOf(b.m.state, "ZZT-0003");
    const sec = sectionIn(c);
    const input: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please send the preservative efficacy test.", justification: "", dueDate: DUE };
    const { r, next } = await act(b, "raiseOpenPoint", ["ZZT-0003", input], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", input, AT));
    expect(r).toMatchObject({ ok: false });
    const op = caseOf(next, "ZZT-0003").openPoints.at(-1)!;
    const draft = b.fake.db.op.at(-1)!;
    const task = b.fake.tasks().find((t) => t.itemId === draft._id)!;
    refuse = false;
    const item = await b.fake.getTask("op", draft._id, task.act);
    await b.fake.submit("op", draft._id, task.act);
    const from = b.fake.calls.length;
    expect(await draftSentAudit(b.ctx(), "op", item)).toMatchObject({ ok: true, warnings: [] });
    const [row] = auditsOf(b.fake.calls.slice(from));
    expect(row).toMatchObject({ Action_Code: "op.raised", Object_Key: op.id, Object_Item_Id: draft._id, Case_Item_Id: caseItemIdOf("ZZT-0003") });
    const rmm = boot("rmm", { mode: "role", db: b.fake.db });
    const seen = caseOf(rmm.m.state, "ZZT-0003").openPoints.find((p) => p.id === op.id);
    expect(seen && [seen.dept, seen.question, seen.createdBy, seen.status, seen.thread.map((m) => m.action)]).toEqual(["MIC", op.question, "UsMicTobias", "open", ["raised"]]);
  });

  it("reviewResponse accept: update (with the synthesized supplier answer persisted), read-back, gate, submit to End", async () => {
    const b = boot("rmm");
    const args = ["ZZT-0003", "OP-0003-01", "accept", ""];
    const { r, calls } = await act(b, "reviewResponse", args, (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "accept", "", AT));
    ok(r);
    expect(writesOf(calls)).toEqual(["update op", "submit op", "formCreate audit"]);
    expect(calls[0]!.m).toBe("getTask"); // staleCheck first
    const data = dataOf(calls, "update", "op");
    expect(Object.keys(data).sort()).toEqual(["Closed_At", "Closed_By", "OP_Outcome", "Thread_JSON"]);
    expect(data).toMatchObject({ OP_Outcome: LIST.opOutcome.accepted, Closed_By: { _id: "UsRmmKatrin" }, Closed_At: "2026-10-24T09:00:00Z" });
    const thread = parseThread({ _id: "x", Thread_JSON: data.Thread_JSON } as RawItem)!.thread;
    expect(thread.slice(-2).map((m) => [m.side, m.action])).toEqual([["supplier", "answered"], ["internal", "accepted"]]);
    expect(str(b.fake.find(opItemId("OP-0003-01"))!.item, "_status")).toBe("Completed");
    expect(r.handoffs.map((h) => [h.code, h.status])).toEqual([["history.updated", "pending"]]);
    expect(auditsOf(calls)[0]).toMatchObject({ Action_Code: "op.accepted", Object_State: "closed" });
  });

  it("reviewResponse return: a new round without submit; op.round and history.updated sent to their webhooks", async () => {
    const b = boot("rmm", { webhooks: HOOKS });
    const { r, next, calls } = await act(b, "reviewResponse", ["ZZT-0003", "OP-0003-01", "return", "Please state the test method."], (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "return", "Please state the test method.", AT));
    ok(r);
    expect(writesOf(calls)).toEqual(["update op", "postWebhook", "postWebhook", "formCreate audit"]);
    const op = caseOf(next, "ZZT-0003").openPoints.find((p) => p.id === "OP-0003-01")!;
    expect(dataOf(calls, "update", "op")).toMatchObject({ Round_No: 2, Query_Key: "OP-0003-01-R2", OP_Progress: LIST.opProgress.open, Return_Reason: "Please state the test method.", Supplier_Due_Date: op.dueDate.slice(0, 10) });
    expect(b.fake.stepOf(opItemId("OP-0003-01"))).toMatchObject({ activityId: STEPS.op.RMM });
    expect(b.fake.hooks.map((h) => h.url)).toEqual([HOOKS["op.round"], HOOKS["history.updated"]]);
    expect(b.fake.hooks[0]!.payload).toEqual(idsOnly("op.round", { opItemId: opItemId("OP-0003-01") }));
    // the round goes out after the update was written AND read back: the integration reads round 2 from the point
    const at = (m: string) => calls.findIndex((x) => x.m === m && !x.error);
    expect(calls.findLastIndex((x) => x.m === "getTask" && x.id === opItemId("OP-0003-01"))).toBeGreaterThan(at("update"));
    expect(at("postWebhook")).toBeGreaterThan(calls.findLastIndex((x) => x.m === "getTask" && x.id === opItemId("OP-0003-01")));
    expect(b.fake.find(opItemId("OP-0003-01"))!.item).toMatchObject({ Round_No: 2, Query_Key: "OP-0003-01-R2" });
    expect(b.fake.hooks[1]!.payload).toEqual(idsOnly("history.updated", { caseItemId: caseItemIdOf("ZZT-0003"), questionsHistoryJson: expect.any(String) }));
    const hist = JSON.parse(String((b.fake.hooks[1]!.payload as { questionsHistoryJson: string }).questionsHistoryJson)) as { opId: string; rounds: number }[];
    expect(hist.find((p) => p.opId === "OP-0003-01")!.rounds).toBe(2);
    expect(r.handoffs.map((h) => [h.code, h.status])).toEqual([["op.round", "sent"], ["history.updated", "sent"]]);
    const [row] = auditsOf(calls);
    expect(row).toMatchObject({ Action_Code: "op.returned", Notify_Channel: "webhook", Event_Reason: "Please state the test method." });
    expect(JSON.parse(String(row!.Notify_Recipient))).toEqual(r.handoffs);
  });

  it("reviewResponse not-accepted: outcome and internal reason, then End", async () => {
    const b = boot("rmm");
    const { r, calls } = await act(b, "reviewResponse", ["ZZT-0003", "OP-0003-01", "not-accepted", "Shelf life is not supported by data."], (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "not-accepted", "Shelf life is not supported by data.", AT));
    ok(r);
    expect(dataOf(calls, "update", "op")).toMatchObject({ OP_Outcome: LIST.opOutcome["not-accepted"], Outcome_Reason: "Shelf life is not supported by data." });
    expect(writesOf(calls)).toEqual(["update op", "submit op", "formCreate audit"]);
    expect(auditsOf(calls)[0]!.Action_Code).toBe("op.notaccepted");
  });

  it("editOpenPoint: an open point's edit goes to the portal query (op.edited); a question edit after an answer starts a new round (op.round)", async () => {
    const b = boot("rmm", { webhooks: HOOKS });
    const due = "2026-12-15T00:00:00.000Z";
    const e1 = await act(b, "editOpenPoint", ["ZZT-0003", "OP-0003-02", { dueDate: due }], (s, by) => A.editOpenPoint(s, by, "ZZT-0003", "OP-0003-02", { dueDate: due }, AT));
    ok(e1.r);
    expect(writesOf(e1.calls)).toEqual(["update op", "postWebhook", "postWebhook", "formCreate audit"]);
    expect(dataOf(e1.calls, "update", "op")).toMatchObject({ Supplier_Due_Date: "2026-12-15" });
    expect(dataOf(e1.calls, "update", "op")).not.toHaveProperty("Round_No");
    expect(b.fake.hooks[0]).toEqual({ url: HOOKS["op.edited"], payload: idsOnly("op.edited", { opItemId: opItemId("OP-0003-02") }) });
    expect(auditsOf(e1.calls)[0]!.Action_Code).toBe("op.edited");

    const b2 = boot("rmm", { webhooks: HOOKS });
    const patch = { question: "What is the shelf life after opening?" };
    const e2 = await act(b2, "editOpenPoint", ["ZZT-0003", "OP-0003-01", patch], (s, by) => A.editOpenPoint(s, by, "ZZT-0003", "OP-0003-01", patch, AT));
    ok(e2.r);
    expect(dataOf(e2.calls, "update", "op")).toMatchObject({ Question_Text: patch.question, Round_No: 2, Query_Key: "OP-0003-01-R2", OP_Progress: LIST.opProgress.open });
    expect(e2.r.handoffs.map((h) => h.code)).toEqual(["op.round", "history.updated"]);
    expect(b2.fake.hooks[0]).toEqual({ url: HOOKS["op.round"], payload: idsOnly("op.round", { opItemId: opItemId("OP-0003-01") }) });
  });

  it("editOpenPoint: op.edited only while the supplier's query waits for an answer, whether or not its query id was read", async () => {
    // an answered point: a due-date change starts no round and goes to no query
    const b = boot("rmm", { webhooks: HOOKS });
    const due = "2026-12-15T00:00:00.000Z";
    const e = await act(b, "editOpenPoint", ["ZZT-0003", "OP-0003-01", { dueDate: due }], (s, by) => A.editOpenPoint(s, by, "ZZT-0003", "OP-0003-01", { dueDate: due }, AT));
    ok(e.r);
    expect(e.r.handoffs.map((h) => h.code)).toEqual(["history.updated"]);
    // an open point whose Portal_Query_Item_Id this load did not see: op.edited still goes (the integration refuses a
    // point without a query; the screen no longer needs the id)
    const db = appFixtures().db;
    const noQuery = boot("rmm", { webhooks: HOOKS, db: { ...db, op: db.op.map((it) => (it.OP_Key === "OP-0003-02" ? { ...it, Portal_Query_Item_Id: "" } : it)) } });
    expect(noQuery.m.index.ops.get("OP-0003-02")!.portalQueryItemId).toBeUndefined();
    const e2 = await act(noQuery, "editOpenPoint", ["ZZT-0003", "OP-0003-02", { dueDate: due }], (s, by) => A.editOpenPoint(s, by, "ZZT-0003", "OP-0003-02", { dueDate: due }, AT));
    ok(e2.r);
    expect(noQuery.fake.hooks[0]).toEqual({ url: HOOKS["op.edited"], payload: idsOnly("op.edited", { opItemId: opItemId("OP-0003-02") }) });
  });

  it("closeOpenPoint: Withdrawn with the internal reason, submit, op.closed for the open portal query", async () => {
    const b = boot("rmm", { webhooks: HOOKS });
    const { r, calls } = await act(b, "closeOpenPoint", ["ZZT-0003", "OP-0003-02", "Clarified by phone."], (s, by) => A.closeOpenPoint(s, by, "ZZT-0003", "OP-0003-02", "Clarified by phone.", AT));
    ok(r);
    expect(dataOf(calls, "update", "op")).toMatchObject({ OP_Outcome: LIST.opOutcome.withdrawn, Outcome_Reason: "Clarified by phone." });
    expect(writesOf(calls)).toEqual(["update op", "submit op", "postWebhook", "postWebhook", "formCreate audit"]);
    expect(b.fake.hooks[0]).toEqual({ url: HOOKS["op.closed"], payload: idsOnly("op.closed", { opItemId: opItemId("OP-0003-02") }) });
    // the point is closed in Kissflow (OP_Outcome set) before the integration is told
    expect(str(b.fake.find(opItemId("OP-0003-02"))!.item, "OP_Outcome")).toBe(LIST.opOutcome.withdrawn);
    // m2: the key the payload carried is on the hand-off's status (and so on the audit row)
    expect(r.handoffs[0]!.key).toBe((b.fake.hooks[0]!.payload as { idempotencyKey: string }).idempotencyKey);
    expect(auditsOf(calls)[0]).toMatchObject({ Action_Code: "op.closed", Event_Reason: "Clarified by phone." });
  });

  it("closeOpenPoint: no op.closed for a point the supplier already answered (its query is not waiting)", async () => {
    const b = boot("rmm", { webhooks: HOOKS });
    const { r } = await act(b, "closeOpenPoint", ["ZZT-0003", "OP-0003-01", "Clarified by phone."], (s, by) => A.closeOpenPoint(s, by, "ZZT-0003", "OP-0003-01", "Clarified by phone.", AT));
    ok(r);
    expect(r.handoffs.map((h) => h.code)).toEqual(["history.updated"]);
    expect(b.fake.hooks.map((h) => h.url)).toEqual([HOOKS["history.updated"]]);
  });

  it("refuses a point that changed since the load (an integration wrote it): no write, no audit row", async () => {
    const b = boot("rmm");
    b.fake.set(opItemId("OP-0003-02"), { Response_Text: "Answered meanwhile." });
    const { r, calls } = await act(b, "closeOpenPoint", ["ZZT-0003", "OP-0003-02", "x"], (s, by) => A.closeOpenPoint(s, by, "ZZT-0003", "OP-0003-02", "x", AT));
    expect(r).toEqual({ ok: false, tone: "danger", message: STALE_TEXT.op, handoffs: [], warnings: [] });
    expect(writesOf(calls)).toEqual([]);
  });

  it("two actions on the same point before the reload: the first write is not mistaken for a change by someone else", async () => {
    const b = boot("rmm");
    const ret = "Please state the test method.";
    const first = await act(b, "reviewResponse", ["ZZT-0003", "OP-0003-01", "return", ret], (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "return", ret, AT));
    ok(first.r);
    // the store reloads only after the last queued write: the second writer still has the first load's index
    const patch = { question: "Please state the test method and the batch tested." };
    const second = await act(b, "editOpenPoint", ["ZZT-0003", "OP-0003-01", patch], (s, by) => A.editOpenPoint(s, by, "ZZT-0003", "OP-0003-01", patch, AT), first.next);
    ok(second.r);
    expect(str(b.fake.find(opItemId("OP-0003-01"))!.item, "Question_Text")).toBe(patch.question);
    // a change by anyone else after our own write is still caught
    b.fake.set(opItemId("OP-0003-01"), { Response_Text: "Answered meanwhile." });
    const third = await act(b, "closeOpenPoint", ["ZZT-0003", "OP-0003-01", "x"], (s, by) => A.closeOpenPoint(s, by, "ZZT-0003", "OP-0003-01", "x", AT), second.next);
    expect(third.r).toMatchObject({ ok: false, message: STALE_TEXT.op });
    expect(writesOf(third.calls)).toEqual([]);
  });

  it("a write Kissflow refuses (050313) is not saved: danger toast text, no audit row", async () => {
    const b = boot("rmm", { fake: { readOnly: { [STEPS.op.RMM]: ["Thread_JSON"] } } });
    const { r, calls } = await act(b, "reviewResponse", ["ZZT-0003", "OP-0003-01", "accept", ""], (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "accept", "", AT));
    expect(r).toMatchObject({ ok: false, tone: "danger" });
    expect(r.message).toMatch(/^Not saved: KISSFLOW_ERROR_050313/);
    expect(writesOf(calls)).toEqual([]);
  });

  it("refuses a point whose task this role does not hold", () => {
    const b = boot("saf", { mode: "role" });
    expect(liveGuard("reviewResponse", b.ctx(), b.m.state, ["ZZT-0003", "OP-0003-01", "accept", ""])).toBe(GUARD_TEXT.opNotHeld);
  });
});

// ------------------------------------------------------------------------------------------------ RMES

describe("RMES (Safety)", () => {
  it("recordCriterion updates the known criterion row by its _id, never adds one", async () => {
    const b = boot("saf");
    const rowId = b.m.index.rmes.get("ZZT-0003|SAF")!.criteriaRows["S-B1"]!;
    const { r, calls } = await act(b, "recordCriterion", ["ZZT-0003", "S-B1", "plausible", "Dossier checked."], (s, by) => A.recordCriterion(s, by, "ZZT-0003", "S-B1", "plausible", "Dossier checked.", AT));
    ok(r);
    expect(writesOf(calls)).toEqual(["formUpdate rmesSAF", "formCreate audit"]);
    const data = dataOf(calls, "formUpdate", "rmesSAF");
    expect(data[`Table::${TABLES.SAF.criteria}`]).toEqual([{ _id: rowId, Criteria_Result: LIST.rmesResult.plausible, Criteria_Comment: "Dossier checked.", Criteria_Recorded_By: { _id: "UsSafMira" }, Criteria_Recorded_At: "2026-10-24T09:00:00Z" }]);
    expect(b.fake.warnings).toEqual([]);
    const row = childRows(b.fake.find("PkRmesZZT0003SAF")!.item, TABLES.SAF.criteria, "Criteria_Code").filter((x) => x.Criteria_Code === "S-B1");
    expect(row).toHaveLength(1);
    expect(auditsOf(calls)[0]).toMatchObject({ Action_Code: "rmes.saved", Object_Kind: "RMES criterion", Object_Key: "S-B1" });
  });

  it("addFinding adds a created row; closeFinding updates its row", async () => {
    const b = boot("saf");
    const add = await act(b, "addFinding", ["ZZT-0003", "S-C1", "Nano status unclear.", true], (s, by) => A.addFinding(s, by, "ZZT-0003", "S-C1", "Nano status unclear.", true, AT));
    ok(add.r);
    const rows = dataOf(add.calls, "formUpdate", "rmesSAF")[`Table::${TABLES.SAF.findings}`] as Record<string, unknown>[];
    expect(rows).toEqual([expect.objectContaining({ _is_created: true, Findings_Text: "Nano status unclear.", Findings_Blocking: LIST.yes, Findings_State: "open" })]);
    expect(dataOf(add.calls, "formUpdate", "rmesSAF")).toMatchObject({ Open_Blocking_Findings_Count: 1 });

    const b2 = boot("saf");
    const rowId = b2.m.index.rmes.get("ZZT-0003|SAF")!.findingRows["0003-F1"];
    const close = await act(b2, "closeFinding", ["ZZT-0003", "0003-F1"], (s, by) => A.closeFinding(s, by, "ZZT-0003", "0003-F1", AT));
    ok(close.r);
    expect(dataOf(close.calls, "formUpdate", "rmesSAF")[`Table::${TABLES.SAF.findings}`]).toEqual([{ _id: rowId, Findings_State: "closed" }]);
    expect(b2.fake.warnings).toEqual([]);
  });

  it("findingToQuery raises the point (Ref_Internal_Key) and links the finding row; one op.raised row", async () => {
    const b = boot("saf");
    const { r, next, calls } = await act(b, "findingToQuery", ["ZZT-0003", "0003-F1", "Please send the sensitisation data.", DUE], (s, by) => A.findingToQuery(s, by, "ZZT-0003", "0003-F1", "Please send the sensitisation data.", DUE, AT));
    ok(r);
    expect(writesOf(calls)).toEqual(["create op", "submit op", "formUpdate rmesSAF", "formCreate audit"]);
    const op = caseOf(next, "ZZT-0003").openPoints.at(-1)!;
    expect(dataOf(calls, "create", "op")).toMatchObject({ Ref_Internal_Key: "0003-F1", OP_Kind: LIST.opKind.finding, Kind_Label: LIST.kindLabel.finding });
    expect(dataOf(calls, "formUpdate", "rmesSAF")[`Table::${TABLES.SAF.findings}`]).toEqual([{ _id: b.m.index.rmes.get("ZZT-0003|SAF")!.findingRows["0003-F1"], Findings_Linked_OP_Key: op.id }]);
    const rows = auditsOf(calls);
    expect(rows).toHaveLength(1);
    expect(parseSnapshot(rows[0] as RawItem)!.rmes).toMatchObject({ dept: "SAF", finding: { id: "0003-F1", openPointId: op.id } });
  });

  it("findingToQuery sends op.round {opItemId} (round 1, I-3) after the Start submit, as a raise does", async () => {
    const b = boot("saf", { webhooks: HOOKS });
    const { r, calls } = await act(b, "findingToQuery", ["ZZT-0003", "0003-F1", "Please send the sensitisation data.", DUE], (s, by) => A.findingToQuery(s, by, "ZZT-0003", "0003-F1", "Please send the sensitisation data.", DUE, AT));
    ok(r);
    const id = calls.find((x) => x.m === "create")!.id!;
    expect(calls.findIndex((x) => x.m === "postWebhook")).toBeGreaterThan(calls.findIndex((x) => x.m === "submit" && x.id === id));
    expect(b.fake.hooks[0]).toEqual({ url: HOOKS["op.round"], payload: idsOnly("op.round", { opItemId: id }) });
    expect(r.handoffs[0]).toMatchObject({ code: "op.round", status: "sent", detail: HANDED_OVER });
  });

  it("rmesDecision writes the decision on the own review; Rejected is refused while RMM's review is completed", async () => {
    const b = boot("saf");
    // the evaluation is complete in the screen's state (each step its own write, tested above)
    let s = b.m.state;
    for (const cr of caseOf(s, "ZZT-0003").rmes!.criteria.filter((x) => x.dept === "SAF" && !x.result)) s = A.recordCriterion(s, b.me, "ZZT-0003", cr.id, "available", "", AT);
    s = A.closeFinding(s, b.me, "ZZT-0003", "0003-F1", AT);
    const { r, calls } = await act(b, "rmesDecision", ["ZZT-0003", "SAF", "approved", ""], (x, by) => A.rmesDecision(x, by, "ZZT-0003", "SAF", "approved", "", AT), s);
    ok(r);
    expect(writesOf(calls)).toEqual(["update review", "formCreate audit"]);
    expect(dataOf(calls, "update", "review")).toEqual({ RMES_Decision: LIST.decision.approved });
    const [row] = auditsOf(calls);
    expect(row).toMatchObject({ Action_Code: "rmes.saved", Object_Kind: "RMES decision" });
    expect(parseSnapshot(row as RawItem)!.audit.map((e) => e.action)).toEqual(["Final Safety decision"]);

    const rmmDone = { ...s, cases: s.cases.map((c) => (c.id === "ZZT-0003" ? { ...c, reviews: c.reviews.map((t) => (t.dept === "RMM" ? { ...t, status: "completed" as const, completedAt: AT } : t)) } : c)) };
    expect(liveGuard("rmesDecision", b.ctx(), rmmDone, ["ZZT-0003", "SAF", "rejected", "x"])).toBe(GUARD_TEXT.rmmCompleted);
  });

  it("completeReview is refused for Safety when its RMES record could not be read", () => {
    const b = boot("saf", { db: without({ rmesSAF: () => true }), mode: "role" });
    // tonight's grants: Safety can't read the case item, so the record was never prepared (not a reload problem)
    expect(b.ctx().index.cases.get("ZZT-0003")?.readable).toBe(false);
    expect(liveGuard("completeReview", b.ctx(), b.m.state, ["ZZT-0003", "SAF"])).toBe(GUARD_TEXT.rmesCaseUnreadable);
  });

  it("asks for a reload when the case is readable but its RMES record was not read", () => {
    const b = boot("saf", { db: without({ rmesSAF: () => true }), mode: "role" });
    const ctx = b.ctx();
    const ref = ctx.index.cases.get("ZZT-0003")!;
    ctx.index.cases.set("ZZT-0003", { ...ref, readable: true });
    expect(liveGuard("completeReview", ctx, b.m.state, ["ZZT-0003", "SAF"])).toBe(GUARD_TEXT.rmesUnknown);
  });
});

// ------------------------------------------------------------------------------------------------ reviews

describe("reviews", () => {
  it("completeReview (MIC): counts and confirmation, read-back, Review_Gate OK, submit to End; review.completed row", async () => {
    const b = boot("mic");
    const { r, next, calls } = await act(b, "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    ok(r);
    expect(writesOf(calls)).toEqual(["update review", "submit review", "formCreate audit"]);
    const data = dataOf(calls, "update", "review");
    expect(data).toEqual({ Open_Count: 0, RMES_Gaps: 0, Review_Confirm: LIST.confirm, Completed_By: { _id: "UsMicTobias" }, Completed_By_Name: "Tobias Keller", Completed_By_Email: "tobias.keller@beiersdorf.example", Completed_At: "2026-10-24T09:00:00Z" });
    expect(str(b.fake.find("PkRevZZT0003MIC1")!.item, "_status")).toBe("Completed");
    expect(caseOf(next, "ZZT-0003").phase).toBe("review");
    expect(r.handoffs).toEqual([]);
    const rows = auditsOf(calls);
    expect(rows.map((x) => x.Action_Code)).toEqual(["review.completed"]);
    const snap = parseSnapshot(rows[0] as RawItem)!;
    expect(snap.track).toMatchObject({ dept: "MIC", status: "completed", roundNo: 1 });
    expect(snap.confirmation).toMatchObject({ type: "dept-completion", dept: "MIC" });
  });

  it("the gate blocks the submit when Kissflow's Review_Gate is not OK (Mandatory not enforced by the submit, G-7)", async () => {
    const lax = (f: FakeClient): AppClient => ({ ...f, getTask: async (flow, id, a) => ({ ...(await f.getTask(flow, id, a)), Review_Gate: "" }) });
    const b = boot("mic", { fake: { enforceMandatory: false }, client: lax });
    const { r, calls } = await act(b, "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    expect(r).toMatchObject({ ok: false, message: "Kissflow's review gate is not OK yet; nothing was completed." });
    expect(writesOf(calls)).toEqual(["update review"]);
  });

  /** Every review of ZZT-0003 but `except` completed in Kissflow (as each department's own write would leave it). */
  function completeOthers(fake: FakeClient, except: string) {
    for (const it of fake.db.review.filter((x) => str(x, "Case_Code") === "ZZT-0003" && str(x, "Review_Dept") !== except && str(x, "_status") !== "Completed")) {
      fake.set(it._id, { Review_Confirm: LIST.confirm, Completed_At: "2026-10-24T08:00:00Z", Completed_By: { _id: "UsRmmKatrin" }, Open_Count: 0, RMES_Gaps: 0 });
      fake.move(it._id, STEPS.review.end);
    }
    for (const it of fake.db.op.filter((x) => str(x, "Case_Code") === "ZZT-0003" && str(x, "_status") !== "Completed")) {
      fake.set(it._id, { OP_Outcome: LIST.opOutcome.withdrawn });
      fake.move(it._id, STEPS.op.end);
    }
  }

  it("the last completion does NOT send the release request: E-B, the integration on its completion, does (22 Oct)", async () => {
    const b = boot("mic", { webhooks: HOOKS });
    completeOthers(b.fake, "MIC");
    b.reload();
    const { r, next, calls } = await act(b, "completeReview", ["ZZT-0003", "MIC"], (x, by) => A.completeReview(x, by, "ZZT-0003", "MIC", AT));
    ok(r);
    expect(caseOf(next, "ZZT-0003").phase).toBe("final-release");
    expect(writesOf(calls)).toEqual(["update review", "submit review", "formCreate audit"]);
    expect(b.fake.hooks).toEqual([]);
    // C18: the request goes from E-B, an integration on this completion (22 Oct)
    expect(r.message).toBe("Microbiology review completed. Every review is complete; the final-release request goes to the supplier in a moment.");
    const [done] = auditsOf(calls);
    expect(parseSnapshot(done as RawItem)!.audit.map((e) => e.action)).not.toContain("All reviews completed");
  });

  it("reopenReview (RMM, P2): round 2 created and started; review.reopened hand-off from the final release", async () => {
    const b = boot("rmm");
    const s = { ...b.m.state, cases: b.m.state.cases.map((c) => (c.id !== "ZZT-0003" ? c : { ...c, phase: "final-release" as const, reviews: c.reviews.map((t) => ({ ...t, status: "completed" as const, completedAt: AT })) })) };
    const { r, calls } = await act(b, "reopenReview", ["ZZT-0003", "RMM", "The SDS changed."], (x, by) => A.reopenReview(x, by, "ZZT-0003", "RMM", "The SDS changed.", AT), s);
    ok(r);
    expect(writesOf(calls)).toEqual(["create review", "submit review", "formCreate audit"]);
    expect(dataOf(calls, "create", "review")).toMatchObject({ Review_Key: "ZZT-0003-RMM-2", Round_No: 2, Activation_Kind: "Reopened", Activation_Reason: "The SDS changed.", Track_Status: LIST.track.reopened });
    expect(r.handoffs.map((h) => [h.code, h.status])).toEqual([["review.reopened", "pending"]]);
    expect(r.handoffs[0]!.detail).toBe(PENDING_NO_URL);
    expect(auditsOf(calls)[0]).toMatchObject({ Action_Code: "review.reopened" });
    expect(liveGuard("reopenReview", b.ctx(), b.m.state, ["ZZT-0003", "QM", "x"])).toBe(GUARD_TEXT.reopenNotRmm);
  });
});

// ------------------------------------------------------------------------------------------------ notes, cancel, supplier master

describe("notes, cancellation, supplier master", () => {
  it("addInternalNote (Customs): the note row, read back, note.added; the mention toast", async () => {
    const b = boot("cus");
    const text = "@Katrin Vogel the HS code needs a second look.";
    const { r, calls } = await act(b, "addInternalNote", ["ZZT-0003", text, "K7"], (s, by) => A.addInternalNote(s, by, "ZZT-0003", text, "K7", AT));
    ok(r);
    expect(r.message).toBe("Note added. E-mail notifications are not live yet.");
    expect(writesOf(calls)).toEqual(["formCreate note", "formCreate audit"]);
    expect(dataOf(calls, "formCreate", "note")).toMatchObject({ Case_Code: "ZZT-0003", Case_Item_Id: caseItemIdOf("ZZT-0003"), Linked_Kind: "Section", Linked_Key: "K7", Note_Text: text, Note_Author: { _id: "UsCusFelix" }, Note_Dept: "CUS", Note_At: "2026-10-24T09:00:00Z", Note_Mentions_Emails: "katrin.vogel@beiersdorf.example", Note_Mentions_Names: "Katrin Vogel" });
    expect(auditsOf(calls)[0]).toMatchObject({ Action_Code: "note.added", Event_Category: "Internal note", Actor_Dept: "CUS" });
  });

  it("cancelCase (RMM, P2): its own points withdrawn, others stay open; case.cancelled with every closed point", async () => {
    const b = boot("rmm", { webhooks: HOOKS });
    const { r, calls } = await act(b, "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT));
    ok(r);
    expect(writesOf(calls)).toEqual(["update op", "submit op", "update op", "submit op", "postWebhook", "postWebhook", "formCreate audit"]);
    expect(str(b.fake.find(opItemId("OP-0003-04"))!.item, "_status")).toBe("InProgress");
    expect(b.fake.hooks.map((h) => h.url)).toEqual([HOOKS["op.closed"], HOOKS["case.cancelled"]]);
    // op.closed only for the own point whose query was waiting (OP-0003-02), not for the answered OP-0003-01
    expect(b.fake.hooks[0]!.payload).toEqual(idsOnly("op.closed", { opItemId: opItemId("OP-0003-02") }));
    expect(b.fake.hooks[1]!.payload).toEqual(idsOnly("case.cancelled", { caseItemId: caseItemIdOf("ZZT-0003"), phaseLabel: "Cancelled", locked: "Yes" }));
    const snap = parseSnapshot(auditsOf(calls)[0] as RawItem)!;
    expect(snap.cancelled).toMatchObject({ reason: "Material discontinued.", closedOpIds: ["OP-0003-01", "OP-0003-02", "OP-0003-04"] });
  });

  it("addContact (Business administrator, P2): a created Contacts row and a supplier.changed row with the log", async () => {
    const b = boot("admin");
    const input: M.ContactInput = { name: "Ines Duarte", email: "ines.duarte@solvaro.example", title: "Regulatory Specialist", mayConfirm: true };
    const { r, calls } = await act(b, "addContact", ["SUP-ZZT-SOLVARO", input], (s, by) => M.addContact(s, by, "SUP-ZZT-SOLVARO", input, AT).state);
    ok(r);
    expect(writesOf(calls)).toEqual(["formUpdate supplier", "formCreate audit"]);
    expect(dataOf(calls, "formUpdate", "supplier")[`Table::${TABLES.contacts}`]).toEqual([expect.objectContaining({ _is_created: true, Contacts_Full_Name: "Ines Duarte", Contacts_Email: "ines.duarte@solvaro.example", Contacts_Can_Confirm: LIST.yes, Contacts_Active: LIST.yes })]);
    const [row] = auditsOf(calls);
    expect(row).toMatchObject({ Action_Code: "supplier.changed", Event_Category: "Supplier master", Object_Key: "SUP-ZZT-SOLVARO" });
    expect(row).not.toHaveProperty("Case_Code");
    const snap = parseSnapshot(row as RawItem)!;
    expect(snap.log!.map((e) => [e.action, e.by])).toEqual([["Added contact", "UsAdminNina"]]);
  });

  it("addSupplier (P2): the row with its contact rows, read back; updateSupplier writes only the changed fields", async () => {
    const b = boot("admin");
    const input: M.SupplierInput = { name: "Kestrel Polymers Ltd", duns: "209 558 317", country: "United Kingdom", city: "Runcorn", type: "manufacturer", contacts: [{ name: "Oliver Grant", email: "oliver.grant@kestrel.example", title: "Regulatory Lead", mayConfirm: true }] };
    const add = await act(b, "addSupplier", [input], (s, by) => M.addSupplier(s, by, input, AT).state);
    ok(add.r);
    expect(writesOf(add.calls)).toEqual(["formCreate supplier", "formCreate audit"]);
    expect(add.calls.map((c) => c.m)).toContain("formGet");
    const data = dataOf(add.calls, "formCreate", "supplier");
    expect(data).toMatchObject({ Supplier_Legal_Name: "Kestrel Polymers Ltd", DUNS_Number: "209558317", Supplier_Country_Code: "GB", Supplier_Kind: LIST.supplierKind.manufacturer, Supplier_City: "Runcorn", Supplier_Active: LIST.yes });
    expect(data[`Table::${TABLES.contacts}`]).toEqual([expect.objectContaining({ _is_created: true, Contacts_Full_Name: "Oliver Grant", Contacts_Can_Confirm: LIST.yes })]);
    expect(auditsOf(add.calls)[0]).toMatchObject({ Action_Code: "supplier.changed", Object_Key: String(data.Supplier_Code) });

    const upd = await act(b, "updateSupplier", ["SUP-ZZT-SOLVARO", { city: "Reus" }], (s, by) => M.updateSupplier(s, by, "SUP-ZZT-SOLVARO", { city: "Reus" }, AT));
    ok(upd.r);
    expect(dataOf(upd.calls, "formUpdate", "supplier")).toEqual({ Supplier_City: "Reus" });
  });

  it("updateContact and setContactActive (P2) change the contact's row by its _id", async () => {
    const b = boot("admin");
    const rows = b.m.index.suppliers.get("SUP-ZZT-SOLVARO")!.contactRows;
    const upd = await act(b, "updateContact", ["UsRavi", { title: "QA Lead" }], (s, by) => M.updateContact(s, by, "UsRavi", { title: "QA Lead" }, AT));
    ok(upd.r);
    expect(dataOf(upd.calls, "formUpdate", "supplier")[`Table::${TABLES.contacts}`]).toEqual([{ _id: rows["UsRavi"], Contacts_Full_Name: "Ravi Menon", Contacts_Email: "ravi.menon@solvaro.example", Contacts_Title: "QA Lead", Contacts_Can_Confirm: LIST.no }]);
    const joana = `contact:${NO_PORTAL_CONTACT.key}`;
    const off = await act(b, "setContactActive", [joana, false], (s, by) => M.setContactActive(s, by, joana, false, undefined, AT));
    ok(off.r);
    expect(dataOf(off.calls, "formUpdate", "supplier")[`Table::${TABLES.contacts}`]).toEqual([{ _id: rows[joana], Contacts_Active: LIST.no, Contacts_Deactivated_At: "2026-10-24T09:00:00Z" }]);
    expect(b.fake.warnings).toEqual([]);
  });

  it("reassignReview (P2): the assignee fields on the held review, no submit", async () => {
    const b = boot("mic");
    const colleague = { id: "UsMicJana", name: "Jana Roth", email: "jana.roth@beiersdorf.example", side: "internal" as const, title: "Microbiology reviewer", dept: "MIC" as const, initials: "JR" };
    const s = { ...b.m.state, users: [...b.m.state.users, colleague] };
    const { r, calls } = await act(b, "reassignReview", ["ZZT-0003", "MIC", colleague.id, "Holiday cover."], (x, by) => A.reassignReview(x, by, "ZZT-0003", "MIC", colleague.id, "Holiday cover.", AT), s);
    ok(r);
    expect(writesOf(calls)).toEqual(["update review", "formCreate audit"]);
    expect(dataOf(calls, "update", "review")).toEqual({ Assignee_User: { _id: "UsMicJana" }, Assignee_Name: "Jana Roth", Assignee_Email: "jana.roth@beiersdorf.example", Reassign_Reason: "Holiday cover." });
    expect(auditsOf(calls)[0]).toMatchObject({ Action_Code: "review.reassigned" });
  });

  it("guards the supplier master: deactivating a contact on open cases, a country outside the live list", () => {
    const b = boot("admin");
    expect(liveGuard("setContactActive", b.ctx(), b.m.state, ["UsElena", false])).toBe(GUARD_TEXT.contactOnOpenCases);
    expect(liveGuard("updateSupplier", b.ctx(), b.m.state, ["SUP-ZZT-SOLVARO", { country: "Brazil" }])).toBe(GUARD_TEXT.country("Brazil"));
    expect(liveGuard("updateSupplier", b.ctx(), b.m.state, ["SUP-ZZT-SOLVARO", { country: "Portugal" }])).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ partial failures

describe("partial failures and the container", () => {
  it("a lost audit row is a warning: the action stays ok", async () => {
    const b = boot("mic", { fake: { refuse: { formCreate: (c) => (c.flow === "audit" ? "You don't have permission to add items to this form." : undefined) } } });
    const { r, calls } = await act(b, "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    expect(r.ok).toBe(true);
    // C19: the grammar in both environments, the cause without its own full stop
    expect(r.warnings).toEqual(["The Microbiology review was saved, but it is missing from the case history (You don't have permission to add items to this form)."]);
    expect(writesOf(calls)).toEqual(["update review", "submit review"]);
  });

  it("a failed webhook POST leaves the action ok: the row records it handed over, the failure goes to onHandoffProblem (gap 5)", async () => {
    const b = boot("rmm", { webhooks: HOOKS, fake: { refuse: { postWebhook: "The webhook answered 502." } } });
    const problems: string[][] = [];
    const args = ["ZZT-0003", "OP-0003-02", "Not needed."];
    const next = A.closeOpenPoint(b.m.state, b.me, "ZZT-0003", "OP-0003-02", "Not needed.", AT);
    const from = b.fake.calls.length;
    const r = await liveWriters.closeOpenPoint!(b.ctx({ onHandoffProblem: (code, key, why) => problems.push([code, key, why]) }), b.m.state, next, args);
    await new Promise((go) => setTimeout(go, 0));
    ok(r);
    expect(r.handoffs.map((h) => [h.code, h.status, h.detail])).toEqual([["op.closed", "sent", HANDED_OVER], ["history.updated", "sent", HANDED_OVER]]);
    expect(problems).toEqual(r.handoffs.map((h) => [h.code, h.key, "The webhook answered 502."]));
    expect(JSON.parse(String(auditsOf(b.fake.calls.slice(from))[0]!.Notify_Recipient))).toEqual(r.handoffs);
  });

  it("a page outside the app writes nothing", async () => {
    const b = boot("rmm", { fake: { appId: "Some_Other_App" } });
    const next = A.closeOpenPoint(b.m.state, b.me, "ZZT-0003", "OP-0003-02", "x", AT);
    const r = await liveWriters.closeOpenPoint!(b.ctx(), b.m.state, next, ["ZZT-0003", "OP-0003-02", "x"]);
    expect(r).toMatchObject({ ok: false, message: `Not saved: ${NOT_IN_APP}` });
    expect(writesOf(b.fake.calls)).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------ review fixes (20 Oct)

describe("review fixes: duplicates, the release request, the history hand-off, partial failures", () => {
  it("M3: history.updated waits when an unresolved open point of the case was not read live; sent when all were", async () => {
    // RMM in tonight's grants: the Safety point of ZZT-0003 is known only from its audit snapshot
    const b = boot("rmm", { mode: "role", webhooks: HOOKS });
    const c = caseOf(b.m.state, "ZZT-0003");
    expect(c.openPoints.some((p) => p.status !== "closed" && b.m.index.ops.get(p.id)?.live === false)).toBe(true);
    const ret = "Please state the test method.";
    const { r } = await act(b, "reviewResponse", ["ZZT-0003", "OP-0003-01", "return", ret], (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "return", ret, AT));
    ok(r);
    expect(r.handoffs.map((h) => [h.code, h.status])).toEqual([["op.round", "sent"], ["history.updated", "pending"]]);
    expect(r.handoffs[1]!.detail).toBe(PENDING_PARTIAL_HISTORY);
    // C30: what happened, with no promise that a system passes it on (the text is saved on the audit row)
    expect(r.handoffs[1]!.detail).toBe("Not sent to the supplier portal: this screen could not read every open point of the case.");
    expect(b.fake.hooks.map((h) => h.url)).toEqual([HOOKS["op.round"]]);
    // a raise: the new point is the writer's own; the rest must be live
    const full = boot("mic", { webhooks: HOOKS });
    const sec = sectionIn(caseOf(full.m.state, "ZZT-0003"));
    const input: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please confirm the shelf life.", justification: "", dueDate: DUE };
    const raised = await act(full, "raiseOpenPoint", ["ZZT-0003", input], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", input, AT));
    ok(raised.r);
    expect(raised.r.handoffs.map((h) => [h.code, h.status])).toEqual([["op.round", "sent"], ["history.updated", "sent"]]);
  });

  it("m4: cancelCase names the points it closed when the audit row then fails (not 'Not saved')", async () => {
    const b = boot("rmm", { fake: { refuse: { formCreate: (c) => (c.flow === "audit" ? "You don't have permission to add items to this form." : undefined) } } });
    const { r } = await act(b, "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT));
    expect(r.ok).toBe(false);
    expect(r.message).not.toMatch(/^Not saved/);
    expect(r.message).toMatch(/OP-0003-01 was closed\. OP-0003-02 was closed\. Not finished: You don't have permission/);
  });

  it("m11: an open point sent from Diagnostics also sends its history hand-off (subject to M3)", async () => {
    let refuse = true;
    const b = boot("mic", { webhooks: HOOKS, fake: { refuse: { submit: () => (refuse ? "KISSFLOW_ERROR_00500 Try again later." : undefined) } } });
    const sec = sectionIn(caseOf(b.m.state, "ZZT-0003"));
    const input: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please send the challenge test.", justification: "", dueDate: DUE };
    const { r } = await act(b, "raiseOpenPoint", ["ZZT-0003", input], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", input, AT));
    expect(r.ok).toBe(false);
    expect(b.fake.hooks).toEqual([]);
    const draft = b.fake.db.op.at(-1)!;
    const task = b.fake.tasks().find((t) => t.itemId === draft._id)!;
    refuse = false;
    const item = await b.fake.getTask("op", draft._id, task.act);
    await b.fake.submit("op", draft._id, task.act);
    const from = b.fake.calls.length;
    const sent = await draftSentAudit(b.ctx(), "op", item, b.m.state);
    // the round 1 the writer would have sent after its submit, then the history
    expect(sent.handoffs.map((h) => [h.code, h.status])).toEqual([["op.round", "sent"], ["history.updated", "sent"]]);
    expect(b.fake.hooks[0]).toEqual({ url: HOOKS["op.round"], payload: idsOnly("op.round", { opItemId: draft._id }) });
    const hist = JSON.parse(String((b.fake.hooks.at(-1)!.payload as { questionsHistoryJson: string }).questionsHistoryJson)) as { opId: string }[];
    expect(hist.some((p) => p.opId === str(item, "OP_Key"))).toBe(true);
    expect(JSON.parse(String(auditsOf(b.fake.calls.slice(from))[0]!.Notify_Recipient))).toEqual(sent.handoffs);
  });

  it("m12: the Start writers write only the Start step's Mandatory and Editable fields (none of the fields ReadOnly since 20:52)", async () => {
    const removed = {
      [STEPS.review.start]: ["Review_Confirm", "Completed_By", "Completed_By_Name", "Completed_By_Email", "Completed_At", "RMES_Decision", "RMES_Decision_Reason", "Rejection_Handling", "Rejection_Note", "Rejected_Depts_Covered"],
      [STEPS.op.start]: ["OP_Outcome", "Outcome_Reason", "Return_Reason", "Closed_At", "Closed_By", "Response_Kind", "Response_Text", "Response_Doc_Refs_JSON", "Supplier_Responsible_Email", "Portal_Query_Item_Id"],
    };
    for (const [a, fields] of Object.entries(removed)) for (const f of fields) expect(EDITABLE[a], `${f} at ${a}`).not.toContain(f);
    // the app's review Start writer is the RMM reopen's round n+1 (the round-1 reviews are I-2's since 22 Oct, E-A)
    const b = boot("rmm");
    const s0 = { ...b.m.state, cases: b.m.state.cases.map((c) => (c.id !== "ZZT-0003" ? c : { ...c, phase: "final-release" as const, reviews: c.reviews.map((t) => ({ ...t, status: "completed" as const, completedAt: AT })) })) };
    const reopened = await act(b, "reopenReview", ["ZZT-0003", "RMM", "The SDS changed."], (x, by) => A.reopenReview(x, by, "ZZT-0003", "RMM", "The SDS changed.", AT), s0);
    ok(reopened.r);
    const mic = boot("mic");
    const sec = sectionIn(caseOf(mic.m.state, "ZZT-0003"));
    const input: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please confirm the shelf life.", justification: "", dueDate: DUE };
    const raised = await act(mic, "raiseOpenPoint", ["ZZT-0003", input], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", input, AT));
    const creates = [...reopened.calls, ...raised.calls].filter((x) => x.m === "create" && !x.error);
    expect(creates.map((c) => c.flow)).toEqual(["review", "op"]);
    for (const c of creates) {
      const a = c.flow === "review" ? STEPS.review.start : STEPS.op.start;
      const allowed = new Set([...(MANDATORY[a] ?? []), ...(EDITABLE[a] ?? [])]);
      expect(Object.keys(c.data as object).filter((k) => !allowed.has(k)), `${c.flow} create`).toEqual([]);
    }
  });

  it("m14: a supplier whose contact rows Kissflow lost on create gets them added again (as new rows), then verified", async () => {
    // the first create keeps the header but drops the child rows
    let first = true;
    const lossy = (f: FakeClient): AppClient => ({
      ...f,
      formCreate: async (flow, data) => {
        if (flow === "supplier" && first) {
          first = false;
          const { [`Table::${TABLES.contacts}`]: _rows, ...header } = data;
          void _rows;
          return f.formCreate(flow, header);
        }
        return f.formCreate(flow, data);
      },
    });
    const b = boot("admin", { client: lossy });
    const input: M.SupplierInput = { name: "Kestrel Polymers Ltd", duns: "209 558 317", country: "United Kingdom", city: "Runcorn", type: "manufacturer", contacts: [{ name: "Oliver Grant", email: "oliver.grant@kestrel.example", title: "Regulatory Lead", mayConfirm: true }] };
    const { r, calls } = await act(b, "addSupplier", [input], (s, by) => M.addSupplier(s, by, input, AT).state);
    ok(r);
    const upd = dataOf(calls, "formUpdate", "supplier");
    expect(upd[`Table::${TABLES.contacts}`]).toEqual([expect.objectContaining({ _is_created: true, Contacts_Full_Name: "Oliver Grant" })]);
    const row = b.fake.db.supplier.find((x) => str(x, "Supplier_Legal_Name") === "Kestrel Polymers Ltd")!;
    expect(childRows(row, TABLES.contacts, "Contacts_Key").map((x) => str(x, "Contacts_Full_Name"))).toEqual(["Oliver Grant"]);
  });
});

// ------------------------------------------------------------------------------------------------ hand-off payloads (20 Oct)

describe("hand-off payloads: app item ids only (the integrations read target and values from Kissflow)", () => {
  /** The keys each sent code may carry besides idempotencyKey (shared/handoff.ts HandoffPayloads). */
  const KEYS: Record<string, string[]> = {
    "case.started": ["caseItemId"],
    "op.round": ["opItemId"],
    "op.edited": ["opItemId"],
    "op.closed": ["opItemId"],
    "review.reopened": ["caseItemId"],
    "case.cancelled": ["caseItemId", "locked", "phaseLabel"],
    "history.updated": ["caseItemId", "questionsHistoryJson"],
  };
  const codeOf = (url: string) => Object.entries(HOOKS).find(([, u]) => u === url)![0];

  it("every code the writers send carries only its ids (and the idempotency key)", async () => {
    const hooks: { url: string; payload: unknown }[] = [];
    const input: A.NewCaseInput = { materialName: "HELIOSOFT 200", inci: "Helianthus Annuus Seed Oil", materialNo: "RM-405217", supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena"], markets: ["EU"], dueDate: DUE, priority: "normal" };
    const created = boot("rmm", { webhooks: HOOKS });
    ok((await act(created, "createCase", [input], (s, by) => A.createCase(s, by, input, AT).state)).r);
    hooks.push(...created.fake.hooks);
    const mic = boot("mic", { webhooks: HOOKS });
    const sec = sectionIn(caseOf(mic.m.state, "ZZT-0003"));
    const raise: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please confirm the shelf life.", justification: "", dueDate: DUE };
    ok((await act(mic, "raiseOpenPoint", ["ZZT-0003", raise], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", raise, AT))).r);
    hooks.push(...mic.fake.hooks);
    const rmm = boot("rmm", { webhooks: HOOKS });
    const due = "2026-12-15T00:00:00.000Z";
    const edited = await act(rmm, "editOpenPoint", ["ZZT-0003", "OP-0003-02", { dueDate: due }], (s, by) => A.editOpenPoint(s, by, "ZZT-0003", "OP-0003-02", { dueDate: due }, AT));
    ok(edited.r);
    ok((await act(rmm, "reviewResponse", ["ZZT-0003", "OP-0003-01", "return", "Please state the method."], (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "return", "Please state the method.", AT), edited.next)).r);
    hooks.push(...rmm.fake.hooks);
    const cancel = boot("rmm", { webhooks: HOOKS });
    ok((await act(cancel, "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT))).r);
    hooks.push(...cancel.fake.hooks);
    const rel = boot("rmm", { webhooks: HOOKS });
    for (const it of rel.fake.db.review.filter((x) => str(x, "Case_Code") === "ZZT-0003" && str(x, "_status") !== "Completed")) {
      rel.fake.set(it._id, { Review_Confirm: LIST.confirm, Completed_At: "2026-10-24T08:00:00Z", Completed_By: { _id: "UsRmmKatrin" }, Open_Count: 0, RMES_Gaps: 0 });
      rel.fake.move(it._id, STEPS.review.end);
    }
    rel.reload();
    const s = { ...rel.m.state, cases: rel.m.state.cases.map((c) => (c.id !== "ZZT-0003" ? c : { ...c, phase: "final-release" as const, reviews: c.reviews.map((t) => ({ ...t, status: "completed" as const, completedAt: AT })) })) };
    const reopen = boot("rmm", { webhooks: HOOKS });
    ok((await act(reopen, "reopenReview", ["ZZT-0003", "RMM", "The SDS changed."], (x, by) => A.reopenReview(x, by, "ZZT-0003", "RMM", "The SDS changed.", AT), s)).r);
    hooks.push(...rel.fake.hooks, ...reopen.fake.hooks);

    expect([...new Set(hooks.map((h) => codeOf(h.url)))].sort()).toEqual(Object.keys(KEYS).sort());
    for (const h of hooks) {
      const code = codeOf(h.url);
      expect(Object.keys(h.payload as object).sort(), code).toEqual([...KEYS[code]!, "idempotencyKey"].sort());
    }
    // no portal id of any kind travels any more
    expect(JSON.stringify(hooks.map((h) => h.payload))).not.toMatch(/portalRequestItemId|portalQueryItemId|PkReq|PkQ3/);
  });

  it("R-7 fixed: a role that can't read the case still sends {caseItemId}, from the audit rows' Case_Item_Id", async () => {
    // the case item was started by another RMM: with tonight's grants this RMM can't read it (My items only)
    const db = appFixtures().db;
    const b = boot("rmm", { mode: "role", webhooks: HOOKS, db: { ...db, case: db.case.map((it) => (it.Case_Code === "ZZT-0003" ? { ...it, _created_by: { _id: "UsRmmOther", Name: "Other RMM", Kind: "User" } } : it)) } });
    const ref = b.m.index.cases.get("ZZT-0003")!;
    expect(ref).toMatchObject({ itemId: caseItemIdOf("ZZT-0003"), readable: false });
    expect(ref.portalRequestItemId).toBeUndefined();
    const { r } = await act(b, "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT));
    ok(r);
    const told = r.handoffs.find((h) => h.code === "case.cancelled")!;
    expect(told.status).toBe("sent");
    expect(b.fake.hooks.find((h) => h.url === HOOKS["case.cancelled"])!.payload).toEqual(idsOnly("case.cancelled", { caseItemId: caseItemIdOf("ZZT-0003"), phaseLabel: "Cancelled", locked: "Yes" }));
  });
});

// ------------------------------------------------------------------------------------------------ supplier master, Thomas's report (20 Oct)

describe("supplier master: Thomas's report (20 Oct): a new supplier's second contact, editing a contact's e-mail", () => {
  it("a new supplier's added contact gets its own id and Contacts_Key, and both contacts show after a reload", async () => {
    const b = boot("admin");
    const input: M.SupplierInput = { name: "Talon Esters SA", duns: "318 442 907", country: "Spain", city: "Reus", type: "manufacturer", contacts: [{ name: "Eva Quintana", email: "eva.quintana@talon.example", title: "QA Lead", mayConfirm: true }] };
    const add = await act(b, "addSupplier", [input], (s, by) => M.addSupplier(s, by, input, AT).state);
    ok(add.r);
    const code = String(dataOf(add.calls, "formCreate", "supplier").Supplier_Code);
    b.reload();
    const contact: M.ContactInput = { name: "Pau Ferrer", email: "pau.ferrer@talon.example", title: "Regulatory", mayConfirm: true };
    const more = await act(b, "addContact", [code, contact], (s, by) => M.addContact(s, by, code, contact, AT).state);
    ok(more.r);
    const row = b.fake.db.supplier.find((it) => str(it, "Supplier_Code") === code)!;
    const keys = childRows(row, TABLES.contacts, "Contacts_Email").map((r) => str(r, "Contacts_Key"));
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2); // no two rows share a key
    b.reload();
    const sup = b.m.state.suppliers.find((x) => x.id === code)!;
    expect(sup.contactIds).toHaveLength(2);
    expect(sup.contactIds.map((id) => b.m.state.users.find((u) => u.id === id)?.name).sort()).toEqual(["Eva Quintana", "Pau Ferrer"]);
  });

  it("a contact whose portal user is the signed-in administrator (the dev supplier) is a supplier contact and its e-mail can be edited", async () => {
    const meKf = fixtureIdentity(["admin"]).kfUserId;
    const db = structuredClone(appFixtures().db);
    db.supplier = [
      ...db.supplier,
      { _id: "PkZZTDEV001", Supplier_Code: "ZZT-SUP-DEV", Supplier_Legal_Name: "ZZT Dev Supplier (fictional)", Supplier_Active: LIST.yes, Supplier_Kind: LIST.supplierKind.manufacturer, Supplier_Country_Code: "DE",
        [`Table::${TABLES.contacts}`]: [{ _id: "PkZZTDEVc01", Contacts_Key: "ZZT-SUP-DEV-c1", Contacts_Full_Name: "Dev contact (fictional)", Contacts_Email: "dev.contact@zzt.example", Contacts_Portal_User_Id: meKf, Contacts_Active: LIST.yes, Contacts_Can_Confirm: LIST.yes }] } as RawItem,
    ];
    const b = boot("admin", { db });
    // the signed-in user's own portal user is the self contact (map/people.ts, 21 Oct), in every persona
    const self = `self:${meKf}`;
    const u = b.m.state.users.find((x) => x.id === self);
    expect(u?.side).toBe("supplier");
    expect(u?.supplierId).toBe("ZZT-SUP-DEV");
    const patch = { email: "dev.contact.new@zzt.example" };
    const upd = await act(b, "updateContact", [self, patch], (s, by) => M.updateContact(s, by, self, patch, AT));
    ok(upd.r);
    expect(dataOf(upd.calls, "formUpdate", "supplier")[`Table::${TABLES.contacts}`]).toEqual([expect.objectContaining({ _id: "PkZZTDEVc01", Contacts_Email: "dev.contact.new@zzt.example" })]);
  });

  // a supplier the app created (Contacts_Key u-s5-<n>) whose contacts have their portal users since: no contact's id is
  // its key any more
  const s5Row = (n: number, name: string, email: string, portal: string) => ({ _id: `PkS5c${n}`, Contacts_Key: `u-s5-${n}`, Contacts_Full_Name: name, Contacts_Email: email, Contacts_Portal_User_Id: portal, Contacts_Active: LIST.yes, Contacts_Can_Confirm: LIST.yes });
  const withS5 = (rows: ReturnType<typeof s5Row>[]) => {
    const db = structuredClone(appFixtures().db);
    db.supplier = [
      ...db.supplier,
      { _id: "PkSupS5", Supplier_Code: "s5", Supplier_Legal_Name: "Talon Esters SA", Supplier_Active: LIST.yes, Supplier_Kind: LIST.supplierKind.manufacturer, Supplier_Country_Code: "ES", [`Table::${TABLES.contacts}`]: rows } as RawItem,
    ];
    return db;
  };
  const eva = () => s5Row(1, "Eva Quintana", "eva.quintana@talon.example", "UsEvaPortal");
  const pau: M.ContactInput = { name: "Pau Ferrer", email: "pau.ferrer@talon.example", title: "Regulatory", mayConfirm: true };
  /** The Contacts_Key of every row Kissflow holds for s5. */
  const keysOf = (b: Boot) => childRows(b.fake.db.supplier.find((it) => str(it, "Supplier_Code") === "s5")!, TABLES.contacts, "Contacts_Email").map((r) => str(r, "Contacts_Key"));

  it("21 Oct: a row whose contact became its portal user keeps its Contacts_Key, so a new contact never takes that key again", async () => {
    const meKf = fixtureIdentity(["admin"]).kfUserId;
    // the second row is the signed-in user's own portal user (the self contact)
    const db = withS5([eva(), s5Row(2, "Dev contact (fictional)", "dev.contact@zzt.example", meKf)]);
    // every persona that reads the master knows the keys the rows hold
    for (const p of ["admin", "rmm"] as const) expect(boot(p, { db: structuredClone(db) }).m.state.suppliers.find((x) => x.id === "s5")?.contactKeys, p).toEqual(["u-s5-1", "u-s5-2"]);
    const b = boot("admin", { db });
    expect(b.m.state.suppliers.find((x) => x.id === "s5")!.contactIds).toEqual(["UsEvaPortal", `self:${meKf}`]);
    const more = await act(b, "addContact", ["s5", pau], (s, by) => M.addContact(s, by, "s5", pau, AT).state);
    ok(more.r);
    expect(dataOf(more.calls, "formUpdate", "supplier")[`Table::${TABLES.contacts}`]).toEqual([expect.objectContaining({ _is_created: true, Contacts_Key: "u-s5-3", Contacts_Full_Name: "Pau Ferrer" })]);
    expect(keysOf(b)).toEqual(["u-s5-1", "u-s5-2", "u-s5-3"]);
    b.reload();
    const sup = b.m.state.suppliers.find((x) => x.id === "s5")!;
    expect(sup.contactIds.map((id) => b.m.state.users.find((u) => u.id === id)?.name)).toEqual(["Eva Quintana", "Dev contact (fictional)", "Pau Ferrer"]);
  }, 15000);

  it("21 Oct: while a supplier's contact rows are unread (its full read failed, no earlier load shows them), no contact is added: its key could be one a row holds", async () => {
    const b = boot("admin", { db: withS5([eva()]) });
    const identity = fixtureIdentity(["admin"]);
    const acting = fixtureActing(identity, "admin");
    const read = snapOf(b.fake, identity.kfUserId, "admin", "full");
    // the load as load.ts gives it when the supplier's formGet failed: its list row, without the Contacts
    const listRow = (it: RawItem) => Object.fromEntries(Object.entries(it).filter(([k]) => !k.startsWith("Table::"))) as RawItem;
    const unread: LiveSnapshot = { ...read, forms: { ...read.forms, supplier: read.forms.supplier.map((it) => (it._id === "PkSupS5" ? listRow(it) : it)) }, unreadRows: { supplier: ["PkSupS5"] } };
    b.m = toAppState({ snap: unread, identity, acting });
    expect(b.m.index.suppliers.get("s5")?.contactsUnread).toBe(true);
    expect(liveGuard("addContact", b.ctx(), b.m.state, ["s5", pau])).toBe(GUARD_TEXT.contactsUnread);
    // the writer checks the key against the item as read just before it writes: Kissflow holds u-s5-1, nothing is sent
    const next = M.addContact(b.m.state, b.me, "s5", pau, AT);
    expect(next.id).toBe("u-s5-1");
    const from = b.fake.calls.length;
    const r = await liveWriters.addContact!(b.ctx(), b.m.state, next.state, ["s5", pau]);
    expect(r).toMatchObject({ ok: false, tone: "danger", message: CONTACT_KEY_HELD });
    expect(writesOf(b.fake.calls.slice(from))).toEqual([]);
    expect(keysOf(b)).toEqual(["u-s5-1"]);
    // an earlier load that read the rows shows them (load.ts keepUnread): the keys are known, the next one is free
    b.m = toAppState({ snap: keepUnread(read, unread), identity, acting });
    expect(b.m.index.suppliers.get("s5")?.contactsUnread).toBeUndefined();
    ok((await act(b, "addContact", ["s5", pau], (s, by) => M.addContact(s, by, "s5", pau, AT).state)).r);
    expect(keysOf(b)).toEqual(["u-s5-1", "u-s5-2"]);
  }, 15000);

  it("21 Oct: a contact another session added since this load holds the key the domain hands out: refused as stale, never a second row with that key", async () => {
    const b = boot("admin", { db: withS5([eva(), s5Row(2, "Rosa Vidal", "rosa.vidal@talon.example", "UsRosaPortal")]) });
    // after this load, another session adds Joan as u-s5-3
    b.fake.set("PkSupS5", { [`Table::${TABLES.contacts}`]: [{ _is_created: true, ...s5Row(3, "Joan Puig", "joan.puig@talon.example", "UsJoanPortal") }] });
    const stale = await act(b, "addContact", ["s5", pau], (s, by) => M.addContact(s, by, "s5", pau, AT).state);
    expect(stale.r).toMatchObject({ ok: false, tone: "danger", message: CONTACT_KEY_HELD });
    expect(writesOf(stale.calls)).toEqual([]);
    expect(keysOf(b)).toEqual(["u-s5-1", "u-s5-2", "u-s5-3"]);
    // read again (the store does after a failed write): the next key is free
    b.reload();
    const again = await act(b, "addContact", ["s5", pau], (s, by) => M.addContact(s, by, "s5", pau, AT).state);
    ok(again.r);
    expect(keysOf(b)).toEqual(["u-s5-1", "u-s5-2", "u-s5-3", "u-s5-4"]);
    // the same row sent again (a repeat) is no clash: Kissflow already holds it, nothing is added
    ok(await liveWriters.addContact!(b.ctx(), again.prev, again.next, ["s5", pau]));
    expect(keysOf(b)).toEqual(["u-s5-1", "u-s5-2", "u-s5-3", "u-s5-4"]);
  }, 15000);

  it("an existing contact's e-mail can be edited (a plain portal contact)", async () => {
    const b = boot("admin");
    const patch = { email: "ravi.menon.new@solvaro.example" };
    const upd = await act(b, "updateContact", ["UsRavi", patch], (s, by) => M.updateContact(s, by, "UsRavi", patch, AT));
    ok(upd.r);
    expect(dataOf(upd.calls, "formUpdate", "supplier")[`Table::${TABLES.contacts}`]).toEqual([expect.objectContaining({ Contacts_Email: "ravi.menon.new@solvaro.example" })]);
  });
});

describe("supplier master: the 8 Oct seed supplier's live contact rows (an empty row, a row without a key)", () => {
  const oleo = (): RawItem => ({ _id: "PkZZTOLEO01", Supplier_Code: "ZZT-SUP-1008-1843", Supplier_Legal_Name: "ZZT Fictional Oleo GmbH", Supplier_Active: LIST.yes, Supplier_Kind: LIST.supplierKind.manufacturer, Supplier_Country_Code: "DE",
    [`Table::${TABLES.contacts}`]: [
      { _id: "PkZZTOLc01", Contacts_Full_Name: "ZZT Sam Supplier", Contacts_Email: "sam@zzt.example", Contacts_Portal_User_Id: "ZZT-PU-01", Contacts_Active: LIST.yes, Contacts_Can_Confirm: LIST.yes },
      { _id: "Contacts_j5rfJXkmdV" },
      { _id: "Contacts_iND9gBjWKl", Contacts_Full_Name: "ZZT Kim Contact", Contacts_Email: "kim@zzt.example", Contacts_Active: LIST.yes, Contacts_Can_Confirm: LIST.no },
    ] } as RawItem);
  for (const [who, idOf] of [["Sam (portal id)", () => "ZZT-PU-01"], ["Kim (no key)", () => "contact:Contacts_iND9gBjWKl"]] as const) {
    it(`edits ${who}'s e-mail`, async () => {
      const db = structuredClone(appFixtures().db);
      db.supplier = [...db.supplier, oleo()];
      const b = boot("admin", { db });
      const id = idOf();
      const patch = { email: `new.${id.replace(/\W/g, "")}@zzt.example` };
      const prev = b.m.state;
      const guard = liveGuard("updateContact", b.ctx(), prev, [id, patch]);
      const next = M.updateContact(prev, b.me, id, patch, AT);
      expect({ guard, refused: A.wasRefused(prev, next) ? next.toasts.at(-1)?.text : null }).toEqual({ guard: null, refused: null });
      const r = await liveWriters.updateContact!(b.ctx(), prev, next, [id, patch]);
      expect(r.message ?? "").not.toMatch(/Not saved/);
      ok(r);
    });
  }
});

describe("supplier master: a new item's child rows that lag behind the item (live, 20 Oct)", () => {
  it("addSupplier does not duplicate a contact whose row is missing from the first read-back", async () => {
    let hidden = 0;
    const b = boot("admin", {
      client: (f) => ({
        ...f,
        formGet: async (flow, id) => {
          const it = await f.formGet(flow, id);
          if (flow !== "supplier" || hidden++ > 0) return it;
          const { [`Table::${TABLES.contacts}`]: _rows, ...rest } = it as Record<string, unknown>; // the first read shows no rows yet
          void _rows;
          return rest as RawItem;
        },
      }),
    });
    const input: M.SupplierInput = { name: "Lagging Rows BV", duns: "407 118 226", country: "Netherlands", city: "Delft", type: "manufacturer", contacts: [{ name: "Joost Bakker", email: "joost.bakker@lagging.example", title: "QA", mayConfirm: true }] };
    const add = await act(b, "addSupplier", [input], (s, by) => M.addSupplier(s, by, input, AT).state);
    ok(add.r);
    const code = String(dataOf(add.calls, "formCreate", "supplier").Supplier_Code);
    const row = b.fake.db.supplier.find((it) => str(it, "Supplier_Code") === code)!;
    expect(childRows(row, TABLES.contacts, "Contacts_Email")).toHaveLength(1);
  }, 10000);
});

// ------------------------------------------------------------------------------------------------ saving like the portal (20 Oct)

/** A client whose submit goes through but whose answer is lost (the 30 s bound fired after Kissflow moved the item).
 *  `probe` is what the re-read through the old task answers then (default: the fake's own, a 050201). */
const lostAnswer =
  (probe?: (f: FakeClient, flow: "case" | "review" | "op", id: string, act: string) => RawItem, lands = true) =>
  (f: FakeClient): AppClient => {
    const gone = new Set<string>();
    return {
      ...f,
      submit: async (flow, id, act) => {
        if (lands) await f.submit(flow, id, act);
        gone.add(`${id}|${act}`);
        throw new AppError("Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through.");
      },
      getTask: (flow, id, act) => (probe && gone.has(`${id}|${act}`) ? Promise.resolve(probe(f, flow, id, act)) : f.getTask(flow, id, act)),
    };
  };

/** A client on which a NEW child row (sent with `_is_created`) is missing from the first read after it was sent, as
 *  Kissflow showed it late on 20 Oct (`keys`: model → the field a row is found by). */
const lagging =
  (keys: Record<string, string>) =>
  (f: FakeClient): AppClient => {
    const fresh = new Set<string>();
    const hidden = new Set<string>();
    const note = (data: Record<string, unknown>) => {
      for (const [model, keyField] of Object.entries(keys))
        for (const r of (data[`Table::${model}`] ?? []) as Record<string, unknown>[]) if (r._is_created) fresh.add(`${model}|${String(r[keyField])}`);
    };
    return {
      ...f,
      formCreate: async (flow, data) => (note(data), f.formCreate(flow, data)),
      formUpdate: async (flow, id, data) => (note(data), f.formUpdate(flow, id, data)),
      formGet: async (flow, id) => {
        const it = await f.formGet(flow, id);
        for (const [model, keyField] of Object.entries(keys)) {
          const rows = it[`Table::${model}`];
          if (!Array.isArray(rows)) continue;
          it[`Table::${model}`] = (rows as Record<string, unknown>[]).filter((r) => {
            const k = `${model}|${String(r[keyField])}`;
            if (!fresh.has(k) || hidden.has(k)) return true;
            hidden.add(k); // this read does not show it yet; the next one does
            return false;
          });
        }
        return it;
      },
    };
  };

describe("saving like the portal (APP-SAVING-GAPS, 20 Oct)", () => {
  it("gap 1: a write that moves no step carries its read-backs and its audit row, so the store can show them without reading everything again", async () => {
    const b = boot("saf");
    const crit = await act(b, "recordCriterion", ["ZZT-0003", "S-B1", "plausible", "Dossier checked."], (s, by) => A.recordCriterion(s, by, "ZZT-0003", "S-B1", "plausible", "Dossier checked.", AT));
    ok(crit.r);
    expect(crit.r.saved).toEqual([{ flow: "rmesSAF", item: b.fake.find("PkRmesZZT0003SAF")!.item }]);
    expect(crit.r.auditRow).toEqual(b.fake.db.audit.at(-1));
    expect(crit.r.auditRow).toMatchObject({ Action_Code: "rmes.saved", Object_Key: "S-B1" });
    expect(crit.r.moved).toBe(false);
    // a new form row (a note): as read back
    const cus = boot("cus");
    const note = await act(cus, "addInternalNote", ["ZZT-0003", "HS code checked.", "K7"], (s, by) => A.addInternalNote(s, by, "ZZT-0003", "HS code checked.", "K7", AT));
    ok(note.r);
    expect(note.r.saved).toEqual([{ flow: "note", item: cus.fake.db.note.at(-1) }]);
    expect(note.r).toMatchObject({ moved: false, auditRow: { Action_Code: "note.added" } });
    // a held process item written without a submit: updateHeld's read-back, through its task
    const mic = boot("mic");
    const colleague = { id: "UsMicJana", name: "Jana Roth", email: "jana.roth@beiersdorf.example", side: "internal" as const, title: "Microbiology reviewer", dept: "MIC" as const, initials: "JR" };
    const withJana = { ...mic.m.state, users: [...mic.m.state.users, colleague] };
    const handed = await act(mic, "reassignReview", ["ZZT-0003", "MIC", "UsMicJana", "Holiday."], (s, by) => A.reassignReview(s, by, "ZZT-0003", "MIC", "UsMicJana", "Holiday."), withJana);
    ok(handed.r);
    expect(handed.r.saved).toEqual([{ flow: "review", item: { ...mic.fake.find("PkRevZZT0003MIC1")!.item, _activity_instance_id: mic.fake.stepOf("PkRevZZT0003MIC1")!.act } }]);
    expect(handed.r.moved).toBe(false);
  });

  it("gap 1: a step move, or a hand-off that writes the item back, is marked moved (the store reads again)", async () => {
    const closed = await act(boot("rmm"), "closeOpenPoint", ["ZZT-0003", "OP-0003-02", "x"], (s, by) => A.closeOpenPoint(s, by, "ZZT-0003", "OP-0003-02", "x", AT));
    expect(closed.r).toMatchObject({ ok: true, moved: true });
    const done = await act(boot("mic"), "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    expect(done.r).toMatchObject({ ok: true, moved: true });
    const cancelled = await act(boot("rmm"), "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT));
    expect(cancelled.r).toMatchObject({ ok: true, moved: true, auditRow: { Action_Code: "case.cancelled" } });
    // a cancellation that closes no point of its own still changes every screen
    const none = boot("rmm", { db: without({ op: (it) => userIds(it, "_created_by")[0] === "UsRmmKatrin" }) });
    const quiet = await act(none, "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT));
    expect(writesOf(quiet.calls)).toEqual(["formCreate audit"]);
    expect(quiet.r).toMatchObject({ ok: true, moved: true });
    // a return: no step moves; I-3 writes the point back only when op.round went out
    const ret = "Please state the test method.";
    const returned = (b: Boot) => act(b, "reviewResponse", ["ZZT-0003", "OP-0003-01", "return", ret], (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "return", ret, AT));
    const pending = await returned(boot("rmm"));
    expect(pending.r).toMatchObject({ ok: true, moved: false });
    expect(pending.r.saved!.map((x) => [x.flow, x.item._id])).toEqual([["op", opItemId("OP-0003-01")]]);
    expect((await returned(boot("rmm", { webhooks: HOOKS }))).r).toMatchObject({ ok: true, moved: true });
  });

  it("gap 3: a case whose submit answer was lost although it moved on still sends case.started and writes case.created", async () => {
    const b = boot("rmm", { webhooks: HOOKS, client: lostAnswer() });
    const input: A.NewCaseInput = { materialName: "OLIVIA Pure 100", inci: "Olea Europaea Fruit Oil", materialNo: "RM-500123", supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena", "UsRavi"], markets: ["EU", "UK"], dueDate: DUE, priority: "high" };
    const { r, calls } = await act(b, "createCase", [input], (s, by) => A.createCase(s, by, input, AT).state);
    ok(r);
    const id = calls.find((x) => x.m === "create")!.id!;
    expect(b.fake.stepOf(id)).toMatchObject({ activityId: STEPS.case.waiting });
    // the probe: one read through the old task, refused as out of the queue
    expect(calls.filter((x) => x.m === "getTask" && x.error).map((x) => x.error)).toEqual(["KISSFLOW_ERROR_050201 This item has moved out of your queue."]);
    expect(b.fake.hooks).toEqual([{ url: HOOKS["case.started"], payload: idsOnly("case.started", { caseItemId: id }) }]);
    expect(auditsOf(calls).map((x) => [x.Action_Code, x.Case_Item_Id])).toEqual([["case.created", id]]);
    expect(r.moved).toBe(true);
  });

  it("gap 3: an open point whose submit answer was lost: a read showing it no longer a Draft proves the move, so op.round goes out", async () => {
    // [unverified] live, getItem may answer an item that moved on with the item itself rather than 050201
    const asStored = (f: FakeClient, _flow: string, id: string, act: string): RawItem => {
      const { _current_context: _c, ...it } = structuredClone(f.find(id)!.item);
      void _c;
      return { ...it, _activity_instance_id: act } as RawItem;
    };
    const b = boot("mic", { webhooks: HOOKS, client: lostAnswer(asStored) });
    const sec = sectionIn(caseOf(b.m.state, "ZZT-0003"));
    const input: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please confirm the shelf life.", justification: "", dueDate: DUE };
    const { r, calls } = await act(b, "raiseOpenPoint", ["ZZT-0003", input], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", input, AT));
    ok(r);
    const id = calls.find((x) => x.m === "create")!.id!;
    expect(b.fake.hooks.map((h) => h.url)).toEqual([HOOKS["op.round"], HOOKS["history.updated"]]);
    expect(b.fake.hooks[0]!.payload).toEqual(idsOnly("op.round", { opItemId: id }));
    expect(auditsOf(calls).map((x) => x.Action_Code)).toEqual(["op.raised"]);
  });

  it("gap 3: a held review whose submit answer was lost: a read naming another activity instance proves the move", async () => {
    const elsewhere = (f: FakeClient, _flow: string, id: string, act: string): RawItem => ({ ...structuredClone(f.find(id)!.item), _status: "InProgress", _activity_instance_id: act, _current_context: [{ _context_activity_instance_id: "ActLater" }] });
    const b = boot("mic", { client: lostAnswer(elsewhere) });
    const { r, calls } = await act(b, "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    ok(r);
    expect(str(b.fake.find("PkRevZZT0003MIC1")!.item, "_status")).toBe("Completed");
    expect(auditsOf(calls).map((x) => x.Action_Code)).toEqual(["review.completed"]);
  });

  it("gap 3: a held step's submit that got no answer and moved nothing still fails (no audit row)", async () => {
    const b = boot("mic", { fake: { refuse: { submit: "Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through." } } });
    const { r, calls } = await act(b, "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toMatch(/did not answer within 30 s/);
    expect(str(b.fake.find("PkRevZZT0003MIC1")!.item, "_status")).not.toBe("Completed");
    expect(auditsOf(calls)).toEqual([]);
    // the probes read the review still at its step, through the same task
    const probes = calls.slice(calls.findIndex((x) => x.m === "submit") + 1).filter((x) => x.m === "getTask");
    expect(probes.map((x) => [x.id, x.error])).toEqual(Array(MOVE_PROBES).fill(["PkRevZZT0003MIC1", undefined]));
  }, 10000);

  it("gap 3: a submit Kissflow refused is its answer: no probe, and a 050201 on a re-read does not count as a move", async () => {
    // probe P3 of the 20 Oct review: the submit and a re-read both refused with 050201, the review still at its step
    let submitted = false;
    const refused = (f: FakeClient): AppClient => ({
      ...f,
      submit: async () => {
        submitted = true;
        throw new AppError(FAKE_ERRORS.queue);
      },
      getTask: async (flow, id, act) => {
        if (submitted) throw new AppError(FAKE_ERRORS.queue);
        return f.getTask(flow, id, act);
      },
    });
    const b = boot("mic", { client: refused });
    const { r, calls } = await act(b, "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toContain("050201");
    expect(auditsOf(calls)).toEqual([]);
    expect(str(b.fake.find("PkRevZZT0003MIC1")!.item, "_status")).not.toBe("Completed");
    expect(submitted).toBe(true);
  });

  it("gap 3: a new item still a Draft is never taken as sent, whatever else its read says", async () => {
    // [unverified] answer shapes: a Draft that names another activity instance (the old probe took it as moved on)
    let probes = 0;
    const odd = (f: FakeClient, _flow: string, id: string): RawItem => (probes++, { ...structuredClone(f.find(id)!.item), _status: "Draft", _activity_instance_id: "ActSomethingElse" });
    const b = boot("rmm", { webhooks: HOOKS, client: lostAnswer(odd, false) });
    const input: A.NewCaseInput = { materialName: "OLIVIA Pure 100", inci: "Olea Europaea Fruit Oil", materialNo: "RM-500123", supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena", "UsRavi"], markets: ["EU", "UK"], dueDate: DUE, priority: "high" };
    const { r, calls } = await act(b, "createCase", [input], (s, by) => A.createCase(s, by, input, AT).state);
    expect(r).toMatchObject({ ok: false, tone: "warning" });
    expect(r.message).toMatch(/saved as a draft in Kissflow but not sent/);
    expect(b.fake.hooks).toEqual([]); // no case.started for a draft
    expect(auditsOf(calls)).toEqual([]);
    expect(probes).toBe(MOVE_PROBES); // read again while the submit may still be on its way
  }, 10000);

  it("gap 3: a submit that lands after its answer was lost is found by a later probe, so the hand-offs and the audit row still go", async () => {
    let probes = 0;
    let parked: (() => Promise<void>) | undefined;
    const late = (f: FakeClient): AppClient => ({
      ...f,
      submit: async (flow, id, act) => {
        parked = () => f.submit(flow, id, act); // reaches Kissflow after the bound fired
        throw new AppError("Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through.");
      },
      getTask: async (flow, id, act) => {
        if (parked && ++probes === 2) await parked();
        return f.getTask(flow, id, act);
      },
    });
    const b = boot("mic", { client: late });
    const { r, calls } = await act(b, "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    ok(r);
    expect(probes).toBe(2);
    expect(str(b.fake.find("PkRevZZT0003MIC1")!.item, "_status")).toBe("Completed");
    expect(auditsOf(calls).map((x) => x.Action_Code)).toEqual(["review.completed"]);
  }, 10000);

  it("gap 6: a retry of a create that stopped as a draft is refused while that draft waits (no second item with the same key)", async () => {
    const b = boot("rmm");
    const input: A.NewCaseInput = { materialName: "OLIVIA Pure 100", inci: "Olea Europaea Fruit Oil", materialNo: "RM-500123", supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena", "UsRavi"], markets: ["EU", "UK"], dueDate: DUE, priority: "high" };
    const id = A.createCase(b.m.state, b.me, input, AT).id;
    b.m.index.ownDraftKeys = new Set([`case|${id}`]);
    const { r, calls } = await act(b, "createCase", [input], (s, by) => A.createCase(s, by, input, AT).state);
    expect(r).toEqual({ ok: false, tone: "warning", message: draftWaits(`Case ${id}`), handoffs: [], warnings: [] });
    expect(writesOf(calls)).toEqual([]);
    // an open point the same way (its OP_Key)
    const mic = boot("mic");
    const sec = sectionIn(caseOf(mic.m.state, "ZZT-0003"));
    const raiseIn: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please confirm the shelf life.", justification: "", dueDate: DUE };
    const next = A.raiseOpenPoint(mic.m.state, mic.me, "ZZT-0003", raiseIn, AT);
    const op = caseOf(next, "ZZT-0003").openPoints.find((p) => !caseOf(mic.m.state, "ZZT-0003").openPoints.some((q) => q.id === p.id))!;
    mic.m.index.ownDraftKeys = new Set([`op|${op.id}`]);
    const raised = await act(mic, "raiseOpenPoint", ["ZZT-0003", raiseIn], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", raiseIn, AT));
    expect(raised.r.message).toBe(draftWaits(`Open point ${op.id}`));
    expect(writesOf(raised.calls)).toEqual([]);
  });

  it("gap 6: while an own draft of the flow could not be read (its key unknown, load.ts \"<flow>|*\"), no item of that flow is created", async () => {
    const b = boot("rmm");
    const input: A.NewCaseInput = { materialName: "OLIVIA Pure 100", inci: "Olea Europaea Fruit Oil", materialNo: "RM-500123", supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena", "UsRavi"], markets: ["EU", "UK"], dueDate: DUE, priority: "high" };
    const id = A.createCase(b.m.state, b.me, input, AT).id;
    b.m.index.ownDraftKeys = new Set(["case|*"]);
    const { r, calls } = await act(b, "createCase", [input], (s, by) => A.createCase(s, by, input, AT).state);
    expect(r).toEqual({ ok: false, tone: "warning", message: draftUnread(`Case ${id}`), handoffs: [], warnings: [] });
    expect(writesOf(calls)).toEqual([]);
  });

  it("a completion's confirmation keeps the user's e-mail although the state shows none (the user is also a supplier contact)", async () => {
    const b = boot("mic");
    const me = b.ctx().identity;
    const state = { ...b.m.state, users: b.m.state.users.map((u) => (u.id === b.me ? { ...u, email: "" } : u)) };
    const { r, calls } = await act(b, "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT), state);
    ok(r);
    const snap = parseSnapshot(auditsOf(calls)[0] as RawItem)!;
    expect(snap.confirmation).toMatchObject({ type: "dept-completion", email: me.email });
    expect(me.email).toBeTruthy();
  });

  it("gap 5: a cancellation whose audit row failed says the cancellation was handed over, not that the portal locked it", async () => {
    const b = boot("rmm", { webhooks: HOOKS, fake: { refuse: { formCreate: (c) => (c.flow === "audit" ? "KISSFLOW_ERROR_00500 Try again later." : undefined) } } });
    const { r } = await act(b, "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT));
    expect(r.ok).toBe(false);
    expect(r.message).toContain("The cancellation was handed over to the supplier portal.");
    expect(r.message).not.toContain("locked");
  });

  it("gap 5: a webhook that never answers does not hold the save: the hand-offs are handed over and the audit row written", async () => {
    const b = boot("rmm", { webhooks: HOOKS, client: (f) => ({ ...f, postWebhook: () => new Promise<never>(() => undefined) }) });
    const next = A.closeOpenPoint(b.m.state, b.me, "ZZT-0003", "OP-0003-02", "Not needed.", AT);
    const from = b.fake.calls.length;
    const r = await Promise.race([liveWriters.closeOpenPoint!(b.ctx(), b.m.state, next, ["ZZT-0003", "OP-0003-02", "Not needed."]), new Promise<"held">((go) => setTimeout(() => go("held"), 1000))]);
    expect(r).not.toBe("held");
    const res = r as WriteResult;
    ok(res);
    expect(res.handoffs.map((h) => [h.code, h.status, h.detail])).toEqual([["op.closed", "sent", HANDED_OVER], ["history.updated", "sent", HANDED_OVER]]);
    expect(auditsOf(b.fake.calls.slice(from)).map((x) => x.Action_Code)).toEqual(["op.closed"]);
  });

  it("gap 7: a new finding or contact whose row Kissflow shows late is not added twice", async () => {
    const saf = boot("saf", { client: lagging({ [TABLES.SAF.findings]: "Findings_Key" }) });
    const add = await act(saf, "addFinding", ["ZZT-0003", "S-C1", "Nano status unclear.", true], (s, by) => A.addFinding(s, by, "ZZT-0003", "S-C1", "Nano status unclear.", true, AT));
    ok(add.r);
    const f = added(saf.m.state, add.next);
    expect(childRows(saf.fake.find("PkRmesZZT0003SAF")!.item, TABLES.SAF.findings, "Findings_Key").filter((x) => x.Findings_Key === f)).toHaveLength(1);
    expect(writesOf(add.calls)).toEqual(["formUpdate rmesSAF", "formCreate audit"]);
    expect(saf.fake.warnings).toEqual([]);

    const admin = boot("admin", { client: lagging({ [TABLES.contacts]: "Contacts_Key" }) });
    const input: M.ContactInput = { name: "Ines Duarte", email: "ines.duarte@solvaro.example", title: "Regulatory Specialist", mayConfirm: true };
    const contact = await act(admin, "addContact", ["SUP-ZZT-SOLVARO", input], (s, by) => M.addContact(s, by, "SUP-ZZT-SOLVARO", input, AT).state);
    ok(contact.r);
    const sup = admin.fake.db.supplier.find((x) => str(x, "Supplier_Code") === "SUP-ZZT-SOLVARO")!;
    expect(childRows(sup, TABLES.contacts, "Contacts_Email").filter((x) => x.Contacts_Email === input.email)).toHaveLength(1);
    expect(writesOf(contact.calls)).toEqual(["formUpdate supplier", "formCreate audit"]);
  }, 15000);

  it("gap 7: ensureRmes waits and reads again before it adds criteria rows Kissflow shows late (no duplicate criteria)", async () => {
    const db = without({ rmesSAF: (it) => str(it, "Case_Code") === "ZZT-0003", audit: (it) => str(it, "Object_Key") === "ZZT-0003-RMES-SAF" });
    const b = boot("saf", { db, client: lagging({ [TABLES.SAF.criteria]: "Criteria_Code" }) });
    const from = b.fake.calls.length;
    ok((await ensureRmes(b.ctx(), b.m.state, factsOf(b)))!);
    const calls = b.fake.calls.slice(from);
    expect(writesOf(calls)).toEqual(["formCreate rmesSAF", "formCreate audit"]);
    const plan = planRmesCriteria(b.m.state, "ZZT-0003", AT);
    const want = "criteria" in plan ? plan.criteria.filter((x) => x.dept === "SAF").map((x) => x.id) : [];
    expect(want.length).toBeGreaterThan(0);
    const item = b.fake.db.rmesSAF.find((x) => str(x, "RMES_Key") === "ZZT-0003-RMES-SAF")!;
    expect(childRows(item, TABLES.SAF.criteria, "Criteria_Code").map((x) => str(x, "Criteria_Code"))).toEqual(want);
  }, 10000);
});

/** The id of the one finding `next` added on ZZT-0003. */
function added(prev: AppState, next: AppState): string {
  const had = new Set((caseOf(prev, "ZZT-0003").rmes?.findings ?? []).map((x) => x.id));
  return caseOf(next, "ZZT-0003").rmes!.findings.find((x) => !had.has(x.id))!.id;
}

// ------------------------------------------------------------------------------------------------ FE-CLEANUP texts

describe("FE-CLEANUP: what the writers say in production (22 Oct)", () => {
  const input = (contactIds = ["UsElena", "UsRavi"]): A.NewCaseInput => ({ materialName: "OLIVIA Pure 100", inci: "Olea Europaea Fruit Oil", materialNo: "RM-500123", supplierId: "SUP-ZZT-SOLVARO", contactIds, markets: ["EU", "UK"], dueDate: DUE, priority: "high" });
  const REFUSED = "KISSFLOW_ERROR_050302 You don't have permission to access this item.";
  /** What production must not show (Kissflow codes, field ids, flow names, item ids, Diagnostics, doubled stops). */
  const TECH = /KISSFLOW_ERROR|\b05\d{4}\b|_A00\b|\b[A-Z][A-Za-z]*_[A-Z][A-Za-z_]*\b|\bPk[A-Z]|CIQ (Case|Review|Open Point|Audit Event|RMES)|Diagnostics|history line|RMES row|\.\./;
  /** The writer run as the store runs it, in `env`. */
  async function run(b: ReturnType<typeof boot>, env: "dev" | "prod", method: WritableMethod, args: unknown[], domain: (s: AppState, by: string) => AppState) {
    const next = domain(b.m.state, b.me);
    return liveWriters[method]!(b.ctx({ env }), b.m.state, next, args);
  }
  const newCase = (s: AppState, by: string) => A.createCase(s, by, input(), AT).state;

  it("C12: nothing reached Kissflow: “Not saved: <plain cause>”, Kissflow's answer only in `detail`; dev keeps it in the toast", async () => {
    const prod = await run(boot("rmm", { fake: { refuse: { create: REFUSED } } }), "prod", "createCase", [input()], newCase);
    expect(prod).toMatchObject({ ok: false, tone: "danger", message: "Not saved: Kissflow did not allow this for your role.", detail: REFUSED });
    const dev = await run(boot("rmm", { fake: { refuse: { create: REFUSED } } }), "dev", "createCase", [input()], newCase);
    expect(dev).toMatchObject({ ok: false, tone: "danger", message: `Not saved: ${REFUSED}` });
    expect(dev.detail).toBeUndefined();
  });

  it("A1, A15, C15: a draft left behind names the plain cause and Unsent items; dev keeps Kissflow's text, with one full stop", async () => {
    const prod = await run(boot("rmm", { fake: { refuse: { submit: REFUSED } } }), "prod", "createCase", [input()], newCase);
    expect(prod.message).toMatch(/^Case \S+ was saved as a draft in Kissflow but not sent: Kissflow did not allow this for your role\. Use Unsent items at the top of the page to send or discard it\.$/);
    expect(prod.message).not.toMatch(TECH);
    expect(prod.detail).toBe("KISSFLOW_ERROR_050302 You don't have permission to access this item");
    const dev = await run(boot("rmm", { fake: { refuse: { submit: REFUSED } } }), "dev", "createCase", [input()], newCase);
    expect(dev.message).toMatch(/^Case \S+ was saved as a draft in Kissflow but not sent: KISSFLOW_ERROR_050302 You don't have permission to access this item\. Use Unsent items at the top of the page to send or discard it\.$/);
    // the Start gate: prod names no field
    const db = appFixtures().db;
    const gateDb = { ...db, config: db.config.map((r) => (r._id === "PkCfgRelV1" ? { ...r, Manifest_Hash: "" } : r)) };
    const gate = await run(boot("rmm", { db: gateDb }), "prod", "createCase", [input()], newCase);
    expect(gate.message).toMatch(/^Case \S+ was saved as a draft in Kissflow but not sent: Kissflow still needs some required information\. Use Unsent items/);
    expect(gate.detail).toBe("Kissflow misses Manifest_Hash.");
    expect(draftWaits("Case ZZT-0009")).toBe("Case ZZT-0009 is already in Kissflow as your unsent draft, so it was not created again. Use Unsent items at the top of the page to send or discard that draft.");
    expect(draftUnread("Case ZZT-0009")).not.toMatch(TECH);
  });

  it("C16, C15: Complete review stopped by Kissflow's gate says what it means in prod", async () => {
    const lax = (f: FakeClient): AppClient => ({ ...f, getTask: async (flow, id, a) => ({ ...(await f.getTask(flow, id, a)), Review_Gate: "" }) });
    const b = boot("mic", { fake: { enforceMandatory: false }, client: lax });
    const r = await run(b, "prod", "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    expect(r).toMatchObject({ ok: false, message: "Kissflow does not see this review as ready yet (open points or RMES entries are still open). Nothing was completed; reload and check.", detail: "Kissflow's review gate is not OK yet." });
  });

  it("C19: a partial success's warning: the case-history grammar in both environments, the cause plain in prod", async () => {
    const refuse = { formCreate: (c: FakeCall) => (c.flow === "audit" ? REFUSED : undefined) };
    const prod = await run(boot("mic", { fake: { refuse } }), "prod", "completeReview", ["ZZT-0003", "MIC"], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    expect(prod.ok).toBe(true);
    expect(prod.warnings).toEqual(["The Microbiology review was saved, but it is missing from the case history (Kissflow did not allow this for your role)."]);
    expect(prod.detail).toBe("KISSFLOW_ERROR_050302 You don't have permission to access this item");
    // dev: the same grammar with Kissflow's own answer (its full stop dropped inside the brackets)
    const b = boot("mic", { fake: { refuse } });
    const sec = sectionIn(caseOf(b.m.state, "ZZT-0003"));
    const raise: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please confirm the shelf life.", justification: "Needed.", dueDate: DUE };
    const dev = await run(b, "dev", "raiseOpenPoint", ["ZZT-0003", raise], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", raise, AT));
    expect(dev.warnings).toEqual([expect.stringMatching(/^Open point OP-\S+ was saved, but it is missing from the case history \(KISSFLOW_ERROR_050302 You don't have permission to access this item\)\.$/)]);
  });

  it("C22, C21+: the guards' texts name no Kissflow item, flow, list or Diagnostics; noPortalContact keeps its quoted start", () => {
    const texts = Object.values(GUARD_TEXT).map((t) => (typeof t === "function" ? (t as (x: string) => string)("SAF") : t));
    for (const t of texts) expect(t, t).not.toMatch(/Diagnostics|CIQ Case|row in Kissflow|Kissflow's country list|known to the screen|release row|item, so/);
    expect(GUARD_TEXT.noPortalContact.startsWith("None of the active supplier contacts has a portal user yet, so nobody would get the questionnaire.")).toBe(true);
    expect(GUARD_TEXT.noPortalContact).toContain("Ask your CIQ administrator to link a contact to its supplier-portal user, then start the case.");
    expect(GUARD_TEXT.noPortalContact).toBe(NO_PORTAL_CONTACT_TEXT);
  });

  it("C12: a partial save in prod names what reached Kissflow, the plain cause, and says to reload once", async () => {
    const cancelWith = (why: string) => {
      const b = boot("rmm", { fake: { refuse: { formCreate: (c: FakeCall) => (c.flow === "audit" ? why : undefined) } } });
      return run(b, "prod", "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT));
    };
    const done = "OP-0003-01 was closed. OP-0003-02 was closed. Not finished: ";
    const refused = await cancelWith(REFUSED);
    expect(refused).toMatchObject({ ok: false, tone: "warning", message: `${done}Kissflow did not allow this for your role. Reload to see the current state.` });
    expect(refused.detail).toContain(REFUSED);
    // a cause that says to reload itself gets no second "Reload"
    expect((await cancelWith("Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through.")).message).toBe(`${done}Kissflow did not answer in time. Reload to see whether it went through.`);
    expect((await cancelWith("KISSFLOW_ERROR_050201 This item has moved out of your queue.")).message).toBe(`${done}This is no longer one of your open tasks in Kissflow. Reload to see its current state.`);
    // dev: Kissflow's own answer, nothing added
    const dev = await run(boot("rmm", { fake: { refuse: { formCreate: (c: FakeCall) => (c.flow === "audit" ? REFUSED : undefined) } } }), "dev", "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT));
    expect(dev.message).toBe(`${done}${REFUSED}`);
  });

  it("C24: a draft sent later is recorded “(after a retry)”, not “from an unsent draft”", async () => {
    let refuse = true;
    const b = boot("rmm", { fake: { refuse: { submit: () => (refuse ? "KISSFLOW_ERROR_00500 Try again later." : undefined) } } });
    await act(b, "createCase", [input()], newCase);
    const draft = b.fake.db.case.at(-1)!;
    const task = b.fake.tasks().find((t) => t.itemId === draft._id)!;
    refuse = false;
    const item = await b.fake.getTask("case", draft._id, task.act);
    await b.fake.submit("case", draft._id, task.act);
    const from = b.fake.calls.length;
    await draftSentAudit(b.ctx({ env: "prod" }), "case", item);
    const [row] = auditsOf(b.fake.calls.slice(from));
    expect(parseSnapshot(row as RawItem)!.audit[0]!.detail).toMatch(/ sent to the supplier \(after a retry\)\.$/);
  });

});

// ------------------------------------------------------------------------------------------------ e-mails (22 Oct, D1 a)

describe("e-mails from the screens: {To, Subject, Body} to SET:current mailHook, after the hand-off that went out", () => {
  // a full hook URL as the portal session stores it (another host and account: only its token counts)
  const MAIL_HOOK = "https://dev.example/integration/2/AcOTHER/webhook/MailTok_1";
  const MAIL_URL = "/integration/2/AcTEST/webhook/MailTok_1"; // the fake client's account, no Kissflow page around it
  const withMail = (b: Boot) => {
    b.m.index.settings = { ...b.m.index.settings, mailHook: MAIL_HOOK };
    return b;
  };
  const mails = (b: Boot) => b.fake.hooks.filter((h) => h.url === MAIL_URL).map((h) => h.payload as { To: string; Subject: string; Body: string });
  const DUE = "2026-12-15T00:00:00.000Z";

  it("the hook URL is built where the screen runs from the stored token; nothing without one", () => {
    const b = boot("rmm");
    expect(mailUrlOf(b.ctx())).toBeUndefined();
    expect(mailUrlOf(withMail(b).ctx())).toBe(MAIL_URL);
    b.m.index.settings = { ...b.m.index.settings, mailHook: "http://dev.example/integration/2/AcX/webhook/MailTok_1" };
    expect(mailUrlOf(b.ctx())).toBeUndefined();
    b.m.index.settings = { ...b.m.index.settings, mailHook: "https://dev.example/integration/2/AcX/webhook/" };
    expect(mailUrlOf(b.ctx())).toBeUndefined();
    expect(esc(`<b>"R&D"</b> 'x'`)).toBe("&lt;b&gt;&quot;R&amp;D&quot;&lt;/b&gt; &#39;x&#39;");
  });

  it("editOpenPoint while the supplier's query waits: op.edited, then one mail to the case's supplier contacts", async () => {
    const b = withMail(boot("rmm", { webhooks: HOOKS }));
    const to = contactEmails(b.ctx(), "ZZT-0003");
    expect(to.length).toBeGreaterThan(0);
    const e = await act(b, "editOpenPoint", ["ZZT-0003", "OP-0003-02", { dueDate: DUE }], (s, by) => A.editOpenPoint(s, by, "ZZT-0003", "OP-0003-02", { dueDate: DUE }, AT));
    ok(e.r);
    expect(b.fake.hooks.map((h) => h.url)).toEqual([HOOKS["op.edited"], MAIL_URL, HOOKS["history.updated"]]);
    const [m] = mails(b);
    expect(m!.To).toBe(to.join(", "));
    expect(m!.Subject).toBe("ZZT-0003: Beiersdorf changed an open question");
    expect(m!.Body).toContain("Please answer by:</b> 2026-12-15");
    expect(Object.keys(m!).sort()).toEqual(["Body", "Subject", "To"]);
    expect(e.r.detail).toMatch(/E-mail \(question OP-0003-02 changed\) handed over/);
  });

  it("no mail: no mail hook, a hand-off that did not go out, or a point the supplier already answered", async () => {
    const plain = boot("rmm", { webhooks: HOOKS });
    const e1 = await act(plain, "editOpenPoint", ["ZZT-0003", "OP-0003-02", { dueDate: DUE }], (s, by) => A.editOpenPoint(s, by, "ZZT-0003", "OP-0003-02", { dueDate: DUE }, AT));
    ok(e1.r);
    expect(plain.fake.hooks.map((h) => h.url)).toEqual([HOOKS["op.edited"], HOOKS["history.updated"]]);
    expect(e1.r.detail).toMatch(/No e-mail \(question OP-0003-02 changed\): no mail hook is configured/);
    const pending = withMail(boot("rmm"));
    ok((await act(pending, "editOpenPoint", ["ZZT-0003", "OP-0003-02", { dueDate: DUE }], (s, by) => A.editOpenPoint(s, by, "ZZT-0003", "OP-0003-02", { dueDate: DUE }, AT))).r);
    expect(mails(pending)).toEqual([]);
    const answered = withMail(boot("rmm", { webhooks: HOOKS }));
    ok((await act(answered, "closeOpenPoint", ["ZZT-0003", "OP-0003-01", "Clarified by phone."], (s, by) => A.closeOpenPoint(s, by, "ZZT-0003", "OP-0003-01", "Clarified by phone.", AT))).r);
    expect(mails(answered)).toEqual([]);
  });

  it("closeOpenPoint while the query waits: op.closed, then the mail, without the internal reason", async () => {
    const b = withMail(boot("rmm", { webhooks: HOOKS }));
    ok((await act(b, "closeOpenPoint", ["ZZT-0003", "OP-0003-02", "Clarified by phone."], (s, by) => A.closeOpenPoint(s, by, "ZZT-0003", "OP-0003-02", "Clarified by phone.", AT))).r);
    expect(b.fake.hooks.map((h) => h.url)).toEqual([HOOKS["op.closed"], MAIL_URL, HOOKS["history.updated"]]);
    const [m] = mails(b);
    expect(m!.Subject).toBe("ZZT-0003: an open question was closed");
    expect(m!.Body).toContain("No answer is needed any more.");
    expect(m!.Body).not.toContain("Clarified by phone");
  });

  it("cancelCase: one mail for the case, without the internal reason", async () => {
    const b = withMail(boot("rmm", { webhooks: HOOKS }));
    ok((await act(b, "cancelCase", ["ZZT-0003", "Material discontinued."], (s, by) => A.cancelCase(s, by, "ZZT-0003", "Material discontinued.", AT))).r);
    const m = mails(b);
    expect(m.map((x) => x.Subject)).toEqual(["ZZT-0003: the CIQ request was cancelled"]);
    expect(m[0]!.Body).not.toContain("Material discontinued");
  });

  it("reopenReview: a mail only when the final-release request is withdrawn (from the final release)", async () => {
    const final = withMail(boot("rmm", { webhooks: HOOKS }));
    const s = { ...final.m.state, cases: final.m.state.cases.map((c) => (c.id !== "ZZT-0003" ? c : { ...c, phase: "final-release" as const, reviews: c.reviews.map((t) => ({ ...t, status: "completed" as const, completedAt: AT })) })) };
    ok((await act(final, "reopenReview", ["ZZT-0003", "RMM", "The SDS changed."], (x, by) => A.reopenReview(x, by, "ZZT-0003", "RMM", "The SDS changed.", AT), s)).r);
    expect(mails(final).map((x) => x.Subject)).toEqual(["ZZT-0003: the request for your final release is withdrawn for now"]);
    expect(mails(final)[0]!.Body).not.toContain("SDS");
  });

  it("a mail POST that fails later reaches onMailProblem; the action stays done", async () => {
    const problems: string[] = [];
    const b = withMail(boot("rmm", { webhooks: HOOKS, client: (f) => ({ ...f, postWebhook: (url, payload) => (url === MAIL_URL ? Promise.reject(new Error("TypeError: Failed to fetch")) : f.postWebhook(url, payload)) }) }));
    const prev = b.m.state;
    const next = A.closeOpenPoint(prev, b.me, "ZZT-0003", "OP-0003-02", "x", AT);
    const r = await liveWriters.closeOpenPoint!(b.ctx({ onMailProblem: (what, why) => problems.push(`${what}: ${why}`) }), prev, next, ["ZZT-0003", "OP-0003-02", "x"]);
    ok(r);
    await new Promise((res) => setTimeout(res, 0));
    expect(problems).toEqual(["question OP-0003-02 closed: TypeError: Failed to fetch"]);
  });
});

