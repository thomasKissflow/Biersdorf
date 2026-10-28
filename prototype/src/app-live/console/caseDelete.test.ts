// The data console's case delete with everything that belongs to it (27 Oct, console/caseDelete.ts): found from the
// session's cached lists by the Orphans page's rules (the same items as cascade.ts findCaseItems), deleted children first
// and the case last, ONE call each, paced, no read-back ("not found" = gone), with Stop / Run again, the console client's
// 429 backoff and the pause after it, the supplier portal refused (the app's items still deleted, the portal's listed by
// id), and the bulk delete of several cases, one after the other. Fictional data (testing/rawFixtures.ts).
import { describe, expect, it } from "vitest";
import type { Kf, KfProcess } from "@/portal/kf/sdk";
import { str, type RawItem } from "@/portal/data/raw";
import { actingAs } from "../identity";
import { APP_ID } from "../ids";
import { RATE_LIMITED, consoleClientOptions, createAppClient } from "../kf/client";
import { createFakeClient, type FakeCall, type FakeClient, type FakeOptions } from "../kf/fakeClient";
import { loadSnapshot } from "../load";
import { KF_USERS, PERSONA_USER, appFixtures, caseItemIdOf, fixtureIdentity, portalFixtures, tasksFor } from "../testing/rawFixtures";
import type { AppClient, FlowKey } from "../types";
import { DELETE_ORDER, FLOW_OF_PART, RUN_GAP_MS, countsOf, findCaseItems, type PlanItem } from "./cascade";
import { CASE_FLOWS, caseDeleteBlocked, planCaseDeletes, runCaseDeletes, type CaseToDelete } from "./caseDelete";
import { CONSOLE_FLOWS } from "./common";
import { ConsoleSession } from "./session";

const CASE1 = caseItemIdOf("ZZT-0001");
const CASE3 = caseItemIdOf("ZZT-0003");
const CASE5 = caseItemIdOf("ZZT-0005");
const DEV = { _id: "UsDevAdmin", Name: "Jonas Falk" };
type Db = Partial<Record<FlowKey, RawItem[]>>;

function devClient(opts: FakeOptions = {}, edit?: (db: Db, portal: ReturnType<typeof portalFixtures>) => void): FakeClient {
  const db = structuredClone(appFixtures().db) as Db;
  const portal = portalFixtures();
  edit?.(db, portal);
  return createFakeClient({ items: db, portal, me: DEV }, { admin: true, ...opts });
}
/** The console after its overview: every list read once. */
async function overview(client: AppClient): Promise<ConsoleSession> {
  const s = new ConsoleSession(client);
  await Promise.all(CONSOLE_FLOWS.map((f) => s.refresh(f)));
  return s;
}
/** The case as the drawer holds it: its full read. */
const drawer = async (c: AppClient, id: string, code: string): Promise<CaseToDelete> => ({ id, code, item: await c.adminGet("case", id) });
/** RMM's load over what the developer's client holds now (the deleted items' reads answer as deleted ones). */
async function rmmLoad(dev: FakeClient) {
  const identity = fixtureIdentity(["rmm"]);
  const acting = actingAs(identity, "rmm");
  const u = KF_USERS[PERSONA_USER.rmm]!;
  const items = structuredClone(dev.db) as Db;
  const live = new Set(Object.values(items).flat().map((x) => x!._id));
  const client = createFakeClient({ items, tasks: tasksFor(u._id).filter((t) => live.has(t.itemId)), me: { _id: u._id, Name: u.Name, Email: u.Email, roles: ["rmm"] } }, { admin: true });
  for (const id of dev.gone) client.gone.add(id);
  return loadSnapshot(client, identity, acting);
}
const DELETES = new Set(["adminDelete", "formDelete", "portalDelete"]);
const READS = new Set(["adminGet", "formGet", "portalGet", "getById", "getTask"]);
const LISTS = new Set(["adminList", "formList"]);
const since = (c: FakeClient, from: number) => c.calls.slice(from);
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const fast = { sleep: async () => {} };
const namesCase = (r: RawItem, id: string) => str(r, "Case_Item_Id") === id;
/** Removes the deleted items from the session's lists, as the dialog does. */
const dropFrom = (s: ConsoleSession) => (x: PlanItem) => {
  const f = FLOW_OF_PART[x.part];
  if (f) s.removeRow(f, x.id);
};

describe("finding what belongs to the case: the session's lists, the Orphans page's rules", () => {
  const extra = (db: Db, portal: ReturnType<typeof portalFixtures>) => {
    db.scopeRun = [{ _id: "FmScope1", Run_Key: "ZZT-0003-SR-1", Case_Item_Id: CASE3, Case_Code: "ZZT-0003" }];
    db.audit!.push({ _id: "FmEvCodeOnly", Event_Key: "EV-ZZT-0003-code-only", Case_Code: "ZZT-0003", Action_Code: "note.added" });
    db.audit!.push({ _id: "FmEvOther", Event_Key: "EV-ZZT-0001-x", Case_Code: "ZZT-0001", Case_Item_Id: CASE1 });
    portal.query.push({ _id: "PkQ3old", Query_Key: "OP-0003-09-R1", Case_Code: "ZZT-0003", App_Open_Point_Id: "PkOpGoneLongAgo", _status: "InProgress" });
    portal.request.push({ _id: "PkReqOther", Request_Key: "ZZT-0009-REQ", Case_Code: "ZZT-0009", App_Case_Item_Id: "AppZZT-0009", _status: "InProgress" });
  };

  it("after the overview: no list read again, nothing of the app read; the portal searched for the case; the same items as the Orphans finder, the case last", async () => {
    const dev = devClient({}, extra);
    const session = await overview(dev);
    const kase = await drawer(dev, CASE3, "ZZT-0003");
    const from = dev.calls.length;
    const plan = await planCaseDeletes(session, [kase]);
    const calls = since(dev, from);
    expect(calls.filter((c) => LISTS.has(c.m))).toEqual([]);
    expect(calls.filter((c) => c.m === "adminGet" || c.m === "formGet")).toEqual([]);
    expect(calls.every((c) => c.m === "portalList" || c.m === "portalGet")).toBe(true);
    // the portal: the request by the case's id and code, the queries by its code; then the queries the points name
    // that the search did not bring (OP-0003-04 names one the portal does not hold)
    expect(calls.filter((c) => c.m === "portalList").map((c) => c.data)).toEqual([{ flow: "request", q: CASE3 }, { flow: "request", q: "ZZT-0003" }, { flow: "query", q: "ZZT-0003" }]);
    expect(calls.filter((c) => c.m === "portalGet").map((c) => c.id)).toEqual(["PkQ3d"]);
    expect(plan).toMatchObject({ unlisted: [], read: [] });
    expect(plan.portalError).toBeUndefined();
    expect(caseDeleteBlocked(plan)).toBeUndefined();
    const fx = appFixtures().db;
    const n = (f: FlowKey) => fx[f].filter((r) => namesCase(r, CASE3)).length;
    expect(countsOf(plan.items)).toEqual([
      { part: "portalQuery", n: 3 },
      { part: "portalRequest", n: 1 },
      { part: "op", n: n("op") },
      { part: "review", n: n("review") },
      { part: "rmesSAF", n: n("rmesSAF") },
      { part: "rmesREG", n: n("rmesREG") },
      { part: "note", n: n("note") },
      { part: "scopeRun", n: 1 },
      { part: "audit", n: n("audit") + 1 },
      { part: "case", n: 1 },
    ]);
    expect(plan.items.at(-1)).toMatchObject({ part: "case", id: CASE3 });
    const order = plan.items.map((x) => DELETE_ORDER.indexOf(x.part));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // the Orphans page's finder (its own reads) finds exactly these items
    const orphans = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    expect(ids(plan.items).sort()).toEqual(ids(orphans.items).sort());
    expect(Object.fromEntries(plan.items.map((x) => [x.id, x.by]))).toEqual(Object.fromEntries(orphans.items.map((x) => [x.id, x.by])));
    expect(dev.calls.filter((c) => DELETES.has(c.m))).toEqual([]); // nothing deleted by finding
  });

  it("a list not read yet this session is read once, 2 at a time, and stays cached; a second case reads no list", async () => {
    const dev = devClient();
    let inFlight = 0;
    let most = 0;
    const timed = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => async (...a: A) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((ok) => setTimeout(ok, 2));
      try {
        return await fn(...a);
      } finally {
        inFlight--;
      }
    };
    const client: AppClient = { ...dev, adminList: timed(dev.adminList), formList: timed(dev.formList) };
    const session = new ConsoleSession(client);
    await session.refresh("case"); // the case table only
    const from = dev.calls.length;
    const plan = await planCaseDeletes(session, [await drawer(dev, CASE5, "ZZT-0005")]);
    const lists = since(dev, from).filter((c) => LISTS.has(c.m));
    expect(lists.map((c) => c.flow).sort()).toEqual(CASE_FLOWS.filter((f) => f !== "case").sort());
    expect(plan.read.sort()).toEqual(CASE_FLOWS.filter((f) => f !== "case").sort());
    expect(most).toBe(2);
    const from2 = dev.calls.length;
    await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003")]);
    expect(since(dev, from2).filter((c) => LISTS.has(c.m))).toEqual([]);
  });

  it("a case without a code and without open points: the portal searched for its id only, never listed in full", async () => {
    const dev = devClient({}, (db) => {
      db.case!.push({ _id: "AppZZT-0200", _status: "InProgress", _modified_at: "2026-10-27T09:00:00Z" });
      db.audit!.push({ _id: "FmEv200", Event_Key: "EV-200", Case_Item_Id: "AppZZT-0200" });
    });
    const session = await overview(dev);
    const kase = await drawer(dev, "AppZZT-0200", "");
    const from = dev.calls.length;
    const plan = await planCaseDeletes(session, [kase]);
    expect(since(dev, from).filter((c) => c.m === "portalList").map((c) => c.data)).toEqual([{ flow: "request", q: "AppZZT-0200" }]);
    expect(ids(plan.items)).toEqual(["FmEv200", "AppZZT-0200"]);
    expect(plan.cases[0]!.target).toEqual({ id: "AppZZT-0200", code: "" });
    // its row has no Case_Code at all: read in full once, not again for the next case
    expect(since(dev, from).filter((c) => c.m === "adminGet").map((c) => c.id)).toEqual(["AppZZT-0200"]);
    const k5 = await drawer(dev, CASE5, "ZZT-0005");
    const from2 = dev.calls.length;
    await planCaseDeletes(session, [k5]);
    expect(since(dev, from2).filter((c) => c.m === "adminGet")).toEqual([]);
  });

  it("a process row without its link field is read in full ONCE (it replaces the row); a list that can't be read blocks the delete", async () => {
    const dev = devClient();
    const session = await overview(dev);
    const rows = session.list("review").rows!;
    const sparse = rows.find((r) => namesCase(r, CASE3))!;
    const { Case_Item_Id: _drop, ...bare } = sparse;
    void _drop;
    session.setRows("review", rows.map((r) => (r._id === sparse._id ? (bare as RawItem) : r)));
    const from = dev.calls.length;
    const plan = await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003")]);
    expect(since(dev, from).filter((c) => c.m === "adminGet").map((c) => c.id)).toEqual([CASE3, sparse._id]);
    expect(ids(plan.items)).toContain(sparse._id);
    const from2 = dev.calls.length;
    await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003")]);
    expect(since(dev, from2).filter((c) => c.m === "adminGet" && c.id === sparse._id)).toEqual([]);

    const refusing = devClient({ refuse: { formList: (c) => (c.flow === "note" ? "KISSFLOW_ERROR_050302 No access" : undefined) } });
    const s2 = await overview(refusing);
    const from3 = refusing.calls.length;
    const blocked = await planCaseDeletes(s2, [await drawer(refusing, CASE3, "ZZT-0003")]);
    // the failed list is read once more when the dialog opens; still refused: nothing to run, no portal read
    expect(since(refusing, from3).filter((c) => LISTS.has(c.m)).map((c) => c.flow)).toEqual(["note"]);
    expect(blocked.unlisted).toEqual([{ part: "note", error: "KISSFLOW_ERROR_050302 No access" }]);
    expect(caseDeleteBlocked(blocked)).toMatch(/^Not every list could be read \(CIQ Internal Note\).*Nothing is deleted\.$/);
    expect(since(refusing, from3).some((c) => c.m === "portalList")).toBe(false);
  });
});

describe("the run: children first, the case last, ONE call each, paced, no read-back", () => {
  it("deletes everything in order with nothing but the deletes, RUN_GAP_MS apart; the session's lists lose the rows; RMM no longer warns", async () => {
    const dev = devClient();
    const session = await overview(dev);
    const plan = await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003")]);
    const cases0 = session.list("case").rows!.length;
    const audit0 = session.list("audit").rows!.length;
    const waits: number[] = [];
    const steps: string[] = [];
    const from = dev.calls.length;
    const r = await runCaseDeletes(dev, plan.items, { sleep: async (ms) => void waits.push(ms), onStep: (p) => steps.push(p.current.id), onDeleted: dropFrom(session) });
    expect(r).toMatchObject({ remaining: [], portalLeft: [], gone: [] });
    expect(r.failed).toBeUndefined();
    expect(ids(r.done)).toEqual(ids(plan.items));
    expect(steps).toEqual(ids(plan.items));
    const calls = since(dev, from);
    expect(calls.every((c) => DELETES.has(c.m))).toBe(true); // no read-back, no list read
    expect(calls.map((c) => c.id)).toEqual(ids(plan.items));
    expect(calls.at(-1)).toMatchObject({ m: "adminDelete", flow: "case", id: CASE3 });
    expect(calls.filter((c) => c.m === "portalDelete").map((c) => (c.data as { flow: string }).flow)).toEqual(["query", "query", "request"]);
    expect(waits).toEqual(Array(plan.items.length - 1).fill(RUN_GAP_MS));
    // Kissflow holds nothing of the case; the cached lists and counts lost the rows without a read
    for (const rows of Object.values(dev.db)) expect(rows.filter((x) => namesCase(x, CASE3) || x._id === CASE3)).toEqual([]);
    expect(dev.portal.request.map((x) => x._id)).not.toContain("PkReq3");
    expect(session.list("case").rows!.length).toBe(cases0 - 1);
    expect(session.list("audit").rows!.length).toBe(audit0 - plan.items.filter((x) => x.part === "audit").length);
    for (const f of CASE_FLOWS) expect(session.list(f).rows!.filter((x) => namesCase(x, CASE3) || x._id === CASE3)).toEqual([]);
    const snap = await rmmLoad(dev);
    expect(snap.unreadableCases).toEqual({});
    expect(snap.warnings.join(" ")).not.toMatch(/could not be read/);
  });

  it(`in real time: one delete at a time, at least about ${RUN_GAP_MS} ms apart`, async () => {
    const dev = devClient();
    const session = await overview(dev);
    const plan = await planCaseDeletes(session, [await drawer(dev, CASE1, "ZZT-0001")]);
    expect(plan.items.length).toBeGreaterThanOrEqual(3);
    const at: number[] = [];
    let inFlight = 0;
    let most = 0;
    const timed: AppClient = {
      ...dev,
      adminDelete: async (f, id) => (at.push(Date.now()), inFlight++, (most = Math.max(most, inFlight)), await dev.adminDelete(f, id).finally(() => inFlight--)),
      formDelete: async (f, id) => (at.push(Date.now()), inFlight++, (most = Math.max(most, inFlight)), await dev.formDelete(f, id).finally(() => inFlight--)),
      portalDelete: async (f, id) => (at.push(Date.now()), inFlight++, (most = Math.max(most, inFlight)), await dev.portalDelete(f, id).finally(() => inFlight--)),
    };
    const r = await runCaseDeletes(timed, plan.items);
    expect(r.remaining).toEqual([]);
    expect(most).toBe(1);
    const gaps = at.slice(1).map((t, i) => t - at[i]!);
    expect(gaps.every((g) => g >= RUN_GAP_MS - 10)).toBe(true);
  });

  it("an item already gone (01015 for a form row, 050201 for a process item) counts as deleted and the run goes on", async () => {
    const dev = devClient();
    const session = await overview(dev);
    const plan = await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003")]);
    const review = plan.items.find((x) => x.part === "review")!;
    const note = plan.items.find((x) => x.part === "note")!;
    await dev.adminDelete("review", review.id); // deleted elsewhere meanwhile
    await dev.formDelete("note", note.id);
    const from = dev.calls.length;
    const r = await runCaseDeletes(dev, plan.items, fast);
    expect(r.failed).toBeUndefined();
    expect(ids(r.gone)).toEqual([review.id, note.id]);
    expect(ids(r.done)).toEqual(ids(plan.items));
    expect(since(dev, from).filter((c) => c.error).map((c) => c.error)).toEqual([expect.stringMatching(/050201/), expect.stringMatching(/01015/)]);
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(false);
  });

  it("Stop ends it before the next delete; Run again goes on with the rest (nothing found again, nothing deleted twice)", async () => {
    const dev = devClient();
    const session = await overview(dev);
    const plan = await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003")]);
    let n = 0;
    const from = dev.calls.length;
    const first = await runCaseDeletes(dev, plan.items, { ...fast, onDeleted: () => void n++, stop: () => n >= 3 });
    expect(first).toMatchObject({ stopped: true });
    expect(ids(first.done)).toEqual(ids(plan.items.slice(0, 3)));
    expect(ids(first.remaining)).toEqual(ids(plan.items.slice(3)));
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(true); // the case stays findable
    const again = await runCaseDeletes(dev, first.remaining, fast);
    expect(again.remaining).toEqual([]);
    const calls = since(dev, from);
    expect(calls.every((c) => DELETES.has(c.m))).toBe(true);
    expect(calls.map((c) => c.id)).toEqual(ids(plan.items));
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(false);
  });

  it("a refusal stops the run there, the case still in place; Run again from the refused item finishes it", async () => {
    let refuse = true;
    const dev = devClient({ refuse: { adminDelete: (c) => (refuse && c.flow === "review" ? "KISSFLOW_ERROR_050302 You don't have permission to delete this item." : undefined) } });
    const session = await overview(dev);
    const plan = await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003")]);
    const r = await runCaseDeletes(dev, plan.items, fast);
    expect(r.failed).toMatchObject({ item: { part: "review" }, why: expect.stringMatching(/050302/) });
    expect(r.remaining[0]).toEqual(r.failed!.item);
    expect(new Set(r.done.map((x) => x.part))).toEqual(new Set(["portalQuery", "portalRequest", "op"]));
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(true);
    expect(dev.calls.filter((c) => c.m === "adminDelete" && c.flow === "review")).toHaveLength(1); // nothing after the refusal
    refuse = false;
    const again = await runCaseDeletes(dev, r.remaining, fast);
    expect(again.failed).toBeUndefined();
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(false);
  });
});

describe("Kissflow's rate limit, through the console's real client", () => {
  /** A scripted SDK handle: the admin REST DELETE by kf.api; `limit(id, n)` answers 429 n times (Retry-After `ra`). */
  function scripted() {
    const deleted: string[] = [];
    const rules = new Map<string, { n: number; ra?: number }>();
    const kf = {
      user: DEV,
      account: { _id: "AcTEST" },
      app: { _id: APP_ID, getProcess: () => ({}) as KfProcess, getDataform: () => ({}) },
      api: async (url: string, opts?: { method?: string }) => {
        if (opts?.method !== "DELETE") return {};
        const id = decodeURIComponent(url.split("?")[0]!.split("/").pop()!);
        const rule = rules.get(id);
        if (rule && rule.n > 0) {
          rule.n--;
          return Promise.reject({ isError: true, errorMessage: { status: 429, en_message: "Too Many Requests", ...(rule.ra ? { headers: { "Retry-After": String(rule.ra) } } : {}) } });
        }
        deleted.push(id);
        return {};
      },
    } as unknown as Kf;
    return { kf, deleted, limit: (id: string, n: number, ra?: number) => rules.set(id, { n, ra }) };
  }
  const items: PlanItem[] = [
    { part: "op", id: "PkOp1", key: "OP-1", by: "Case_Item_Id" },
    { part: "review", id: "PkRev1", key: "REV-1", by: "Case_Item_Id" },
    { part: "review", id: "PkRev2", key: "REV-2", by: "Case_Item_Id" },
    { part: "case", id: "AppZZT-0101", key: "ZZT-0101", by: "the case itself" },
  ];

  it("429 twice, then 200: the client waits about 1 s and 2 s and the run goes on", async () => {
    const s = scripted();
    s.limit("PkRev1", 2);
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const client = createAppClient(s.kf, consoleClientOptions({ sleep, random: () => 0.5 }));
    const r = await runCaseDeletes(client, items, { sleep });
    expect(r).toMatchObject({ remaining: [], portalLeft: [] });
    expect(s.deleted).toEqual(ids(items));
    // the pause before PkRev1, the client's two backoff waits (+10 % jitter at random 0.5), the pauses before PkRev2 and the case
    expect(waits).toEqual([RUN_GAP_MS, 1100, 2200, RUN_GAP_MS, RUN_GAP_MS]);
  });

  it("a 429 that outlasts the backoff (Retry-After 120 s) pauses the run with the plain text; Continue finishes it", async () => {
    const s = scripted();
    s.limit("PkRev2", 1, 120);
    const sleep = async () => {};
    const client = createAppClient(s.kf, consoleClientOptions({ sleep }));
    const r = await runCaseDeletes(client, items, { sleep });
    expect(r).toMatchObject({ paused: RATE_LIMITED });
    expect(ids(r.remaining)).toEqual(["PkRev2", "AppZZT-0101"]);
    expect(s.deleted).toEqual(["PkOp1", "PkRev1"]);
    const again = await runCaseDeletes(client, r.remaining, { sleep });
    expect(again.remaining).toEqual([]);
    expect(s.deleted).toEqual(ids(items));
  });
});

describe("the supplier portal refused from here", () => {
  it("its list refused: the portal items the app names are listed by id; the app's items are deleted; no portal call in the run", async () => {
    const refusal = "KISSFLOW_ERROR_050302 You don't have permission to access this application.";
    const dev = devClient({ refuse: { portalList: refusal } });
    const session = await overview(dev);
    const plan = await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003")]);
    expect(plan.portalError).toBe(refusal);
    expect(plan.cases[0]!.portal?.remain.map((x) => `${x.part}:${x.id}`).sort()).toEqual(["portalQuery:PkQ3a", "portalQuery:PkQ3b", "portalQuery:PkQ3d", "portalRequest:PkReq3"]);
    expect(plan.items.some((x) => x.part === "portalQuery" || x.part === "portalRequest")).toBe(false);
    expect(caseDeleteBlocked(plan)).toBeUndefined();
    const from = dev.calls.length;
    const r = await runCaseDeletes(dev, plan.items, fast);
    expect(r.failed).toBeUndefined();
    expect(since(dev, from).some((c) => c.m.startsWith("portal"))).toBe(false);
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(false);
    expect(dev.portal.request.some((x) => x._id === "PkReq3")).toBe(true); // the portal's own console deletes it
  });

  it("its delete refused: that and the later portal items are listed, not tried again; the app's items are deleted", async () => {
    const refusal = "KISSFLOW_ERROR_050302 You don't have permission to delete in this application.";
    const dev = devClient({ refuse: { portalDelete: refusal } });
    const session = await overview(dev);
    const plan = await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003"), await drawer(dev, CASE5, "ZZT-0005")]);
    const portal = plan.items.filter((x) => x.part === "portalQuery" || x.part === "portalRequest");
    expect(portal.length).toBe(4); // ZZT-0003: 2 queries + its request; ZZT-0005: its request
    const r = await runCaseDeletes(dev, plan.items, fast);
    expect(r.failed).toBeUndefined();
    expect(r.portalError).toBe(refusal);
    expect(ids(r.portalLeft)).toEqual(ids(portal));
    expect(dev.calls.filter((c) => c.m === "portalDelete")).toHaveLength(1);
    expect(ids(r.done)).toEqual(ids(plan.items.filter((x) => !portal.includes(x))));
    expect(dev.db.case.map((c) => c._id)).toEqual([CASE1]);
  });
});

describe("the bulk delete with cases selected", () => {
  it("each case with what belongs to it, one case after the other, its case last; a row naming two of them goes with the first; paced throughout", async () => {
    const both = JSON.stringify({ v: 1, code: "case.created", audit: [], handoffs: [], case: { caseId: "ZZT-0005", itemId: CASE5 } });
    const dev = devClient({}, (db) => void db.audit!.push({ _id: "FmEvBoth", Event_Key: "EV-both", Case_Item_Id: CASE3, Snapshot_JSON: both }));
    const session = await overview(dev);
    // alone, ZZT-0003 leaves the row naming the other existing case
    expect(ids((await planCaseDeletes(session, [await drawer(dev, CASE3, "ZZT-0003")])).items)).not.toContain("FmEvBoth");
    const rows = new Map(session.list("case").rows!.map((r) => [r._id, r]));
    const plan = await planCaseDeletes(session, [CASE3, CASE5].map((id) => ({ id, code: str(rows.get(id), "Case_Code"), item: rows.get(id) })));
    expect(plan.cases.map((c) => c.target.code)).toEqual(["ZZT-0003", "ZZT-0005"]);
    const [p3, p5] = plan.cases;
    expect(ids(p3!.items)).toContain("FmEvBoth");
    expect(ids(p5!.items)).not.toContain("FmEvBoth");
    expect(new Set(ids(plan.items)).size).toBe(plan.items.length); // nothing planned twice
    expect(p3!.items.at(-1)).toMatchObject({ part: "case", id: CASE3 });
    expect(p5!.items.at(-1)).toMatchObject({ part: "case", id: CASE5 });
    expect(ids(plan.items)).toEqual([...ids(p3!.items), ...ids(p5!.items)]);
    const totals = countsOf(plan.items);
    expect(totals.find((t) => t.part === "case")?.n).toBe(2);
    expect(totals.reduce((a, t) => a + t.n, 0)).toBe(p3!.items.length + p5!.items.length);
    const waits: number[] = [];
    const from = dev.calls.length;
    const r = await runCaseDeletes(dev, plan.items, { sleep: async (ms) => void waits.push(ms), onDeleted: dropFrom(session) });
    expect(r.remaining).toEqual([]);
    const calls = since(dev, from);
    expect(calls.every((c: FakeCall) => DELETES.has(c.m) && !READS.has(c.m))).toBe(true);
    expect(calls.map((c) => c.id)).toEqual(ids(plan.items));
    expect(waits).toEqual(Array(plan.items.length - 1).fill(RUN_GAP_MS));
    expect(dev.db.case.map((c) => c._id)).toEqual([CASE1]);
    for (const rows of Object.values(dev.db)) expect(rows.filter((x) => [CASE3, CASE5].includes(str(x, "Case_Item_Id")))).toEqual([]);
    expect(dev.portal.request.map((x) => x._id)).toEqual(["PkReq1"]);
    expect(session.list("case").rows!.map((x) => x._id)).toEqual([CASE1]);
    const snap = await rmmLoad(dev);
    expect(snap.unreadableCases).toEqual({});
  });
});
