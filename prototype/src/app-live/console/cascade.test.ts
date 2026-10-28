// The data console's Orphans tool (26 Oct, console/cascade.ts): what still names a case, the grouped delete (paced, Stop)
// and the orphan scan, against the fake client seeded with the app fixtures and the supplier portal's items of the
// fixture cases (testing/rawFixtures.ts portalFixtures). The fake answers a deleted item's read as live did on 26 Oct
// (050201 "moved out of your queue"), so the first test replays Thomas's problem: the case deleted alone still shows for
// RMM, "could not be read". Since the drawer's Delete takes an item alone (remove.ts), the Orphans page is the only way
// into findCaseItems/runDelete; the tests on a case that still exists prove the finder (the Orphans dialog refuses to
// delete such a case's rows). Fictional data.
import { describe, expect, it } from "vitest";
import { str, type RawItem } from "@/portal/data/raw";
import { actingAs } from "../identity";
import { FAKE_ERRORS, createFakeClient, type FakeClient, type FakeOptions } from "../kf/fakeClient";
import { loadSnapshot, viewOf } from "../load";
import { KF_USERS, PERSONA_USER, appFixtures, caseItemIdOf, fixtureIdentity, portalFixtures, tasksFor } from "../testing/rawFixtures";
import type { AppClient, FlowKey } from "../types";
import { DELETE_ORDER, RUN_GAP_MS, confirmText, countsOf, findCaseItems, findOrphans, planBlocked, runDelete, type PartKey } from "./cascade";

const CASE3 = caseItemIdOf("ZZT-0003");
const CASE5 = caseItemIdOf("ZZT-0005");
const DEV = { _id: "UsDevAdmin", Name: "Jonas Falk" };

type Db = Partial<Record<FlowKey, RawItem[]>>;
/** The Admin / Developer's client (flow Admin): the fixtures, the portal's items, and whatever `edit` adds. */
function devClient(opts: FakeOptions = {}, edit?: (db: Db, portal: ReturnType<typeof portalFixtures>) => void): FakeClient {
  const db = structuredClone(appFixtures().db) as Db;
  const portal = portalFixtures();
  edit?.(db, portal);
  return createFakeClient({ items: db, portal, me: DEV }, { admin: true, ...opts });
}

/** RMM's load over what the developer's client holds now (as on 26 Oct: RMM may read the case flow as Admin). */
async function rmmLoad(dev: FakeClient) {
  const identity = fixtureIdentity(["rmm"]);
  const acting = actingAs(identity, "rmm");
  const u = KF_USERS[PERSONA_USER.rmm]!;
  const items = structuredClone(dev.db) as Db;
  const live = new Set(Object.values(items).flat().map((x) => x!._id));
  const client = createFakeClient({ items, tasks: tasksFor(u._id).filter((t) => live.has(t.itemId)), me: { _id: u._id, Name: u.Name, Email: u.Email, roles: ["rmm"] } }, { admin: true });
  // the deleted items' reads answer as deleted ones (the fake keeps that per client)
  for (const id of dev.gone) client.gone.add(id);
  const snap = await loadSnapshot(client, identity, acting);
  return { snap, view: viewOf(snap, identity, acting) };
}

const namesCase = (r: RawItem, id: string) => str(r, "Case_Item_Id") === id;
/** The run's pause between two items, skipped (the pacing has its own test). */
const fast = { sleep: async () => {} };
const partsOf = (items: { part: PartKey }[]) => items.map((x) => x.part);

describe("the problem of 26 Oct, replayed", () => {
  it("a case deleted alone still shows for RMM: its rows name it, and its by-id read answers like a refusal", async () => {
    const dev = devClient();
    await dev.adminDelete("case", CASE3);
    await expect(dev.adminGet("case", CASE3)).rejects.toThrow(FAKE_ERRORS.deleted);
    const { snap } = await rmmLoad(dev);
    expect(snap.unreadableCases[CASE3]).toBe(FAKE_ERRORS.deletedById);
    // the byId rung's report, as Diagnostics showed it: the admin read (SDK, then REST), then the viewer route
    expect(snap.reads.find((r) => r.flow === "case" && r.rung === "byId")?.error).toBe(`${FAKE_ERRORS.deleted}; ${FAKE_ERRORS.deletedById}`);
    expect(snap.warnings.join(" ")).toMatch(/1 case could not be read in full for your role/);
  });
});

describe("findCaseItems: what belongs to a case", () => {
  const extra = (db: Db, portal: ReturnType<typeof portalFixtures>) => {
    db.scopeRun = [{ _id: "FmScope1", Run_Key: "ZZT-0003-SR-1", Case_Item_Id: CASE3, Case_Code: "ZZT-0003" }];
    // a history row that names only the code (no case item id, no snapshot)
    db.audit!.push({ _id: "FmEvCodeOnly", Event_Key: "EV-ZZT-0003-code-only", Case_Code: "ZZT-0003", Action_Code: "note.added" });
    // another case's history row with the same kind of fields: not this case's
    db.audit!.push({ _id: "FmEvOther", Event_Key: "EV-ZZT-0001-x", Case_Code: "ZZT-0001", Case_Item_Id: caseItemIdOf("ZZT-0001") });
    // a query of a point deleted earlier: no point names it any more, its Case_Code does
    portal.query.push({ _id: "PkQ3old", Query_Key: "OP-0003-09-R1", Case_Code: "ZZT-0003", App_Open_Point_Id: "PkOpGoneLongAgo", _status: "InProgress" });
    // another case's request
    portal.request.push({ _id: "PkReqOther", Request_Key: "ZZT-0009-REQ", Case_Code: "ZZT-0009", App_Case_Item_Id: "AppZZT-0009", _status: "InProgress" });
  };

  it("finds each flow's items by the fields it carries, in the delete order, the case last", async () => {
    const dev = devClient({}, extra);
    const plan = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    expect(plan.caseState).toBe("exists");
    expect(plan.unlisted).toEqual([]);
    expect(plan.portal).toBeUndefined();
    expect(planBlocked(plan)).toBeUndefined();
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
    const by = Object.fromEntries(plan.items.map((x) => [x.id, x.by]));
    // the request by the case's own link; the queries by the points' links, or by the code alone
    expect(by).toMatchObject({ PkReq3: "Portal_Request_Item_Id", PkQ3a: "Portal_Query_Item_Id", PkQ3b: "Portal_Query_Item_Id", PkQ3old: "Case_Code", FmEvCodeOnly: "Case_Code", FmScope1: "Case_Item_Id", [CASE3]: "the case itself" });
    expect(by.PkQ3d).toBeUndefined(); // OP-0003-04 names a query the portal does not hold
    expect(by.FmEvOther).toBeUndefined();
    expect(by.PkReqOther).toBeUndefined();
    // the case is last; the parts come in DELETE_ORDER
    expect(plan.items.at(-1)).toMatchObject({ part: "case", id: CASE3, key: "ZZT-0003" });
    const order = partsOf(plan.items).map((p) => DELETE_ORDER.indexOf(p));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(confirmText(plan.target)).toBe("ZZT-0003");
    // the portal was searched for the case's id, its code and its points' ids, in the portal's container
    const searched = dev.calls.filter((c) => c.m === "portalList").map((c) => c.data as { flow: string; q: string });
    expect(searched).toEqual(expect.arrayContaining([{ flow: "request", q: CASE3 }, { flow: "request", q: "ZZT-0003" }, { flow: "query", q: "ZZT-0003" }]));
    expect(dev.calls.filter((c) => ["adminDelete", "formDelete", "portalDelete"].includes(c.m))).toEqual([]); // nothing deleted
  });

  it("an audit row that names the case only in its snapshot belongs to it", async () => {
    const dev = devClient({}, (db) => {
      db.audit!.push({ _id: "FmEvSnap", Event_Key: "EV-snap", Snapshot_JSON: JSON.stringify({ v: 1, code: "case.created", audit: [], handoffs: [], case: { caseId: "ZZT-0003", itemId: CASE3 } }) });
    });
    const plan = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    expect(plan.items.find((x) => x.id === "FmEvSnap")?.by).toBe("Snapshot_JSON");
  });

  it("another existing case with the same code (R-13): rows that name only the code are left out, and the plan says so", async () => {
    const dev = devClient({}, (db, portal) => {
      extra(db, portal);
      db.case!.push({ ...structuredClone(db.case!.find((c) => c._id === CASE3)!), _id: "AppZZT-0003b", Portal_Request_Item_Id: "" });
    });
    const plan = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    expect(plan.sharedCode).toEqual(["AppZZT-0003b"]);
    const ids = plan.items.map((x) => x.id);
    expect(ids).not.toContain("FmEvCodeOnly");
    expect(ids).not.toContain("PkQ3old");
    expect(ids).toContain("PkQ3a"); // a point's own link still counts
    expect(ids).not.toContain("AppZZT-0003b");
  });
});

describe("runDelete: children first, the case last, each read back", () => {
  it("deletes everything, the case last; RMM no longer sees the case and gets no 'could not be read' warning", async () => {
    const dev = devClient();
    const plan = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    const steps: string[] = [];
    const result = await runDelete(dev, plan, { ...fast, onStep: (i, x) => steps.push(`${i}:${x.id}`) });
    expect(result.failed).toBeUndefined();
    expect(result.remaining).toEqual([]);
    expect(result.done).toHaveLength(plan.items.length);
    expect(steps).toEqual(plan.items.map((x, i) => `${i}:${x.id}`));
    // each delete is followed by its read-back, which answers as a deleted item's
    const DEL = new Set(["portalDelete", "adminDelete", "formDelete"]);
    const READ = new Set(["portalGet", "adminGet", "formGet"]);
    const seq = dev.calls.filter((c) => DEL.has(c.m) || (READ.has(c.m) && plan.items.some((x) => x.id === c.id) && dev.calls.indexOf(c) > dev.calls.findIndex((d) => DEL.has(d.m))));
    for (let i = 0; i < seq.length; i += 2) {
      expect(DEL.has(seq[i]!.m)).toBe(true);
      expect(READ.has(seq[i + 1]!.m) && seq[i + 1]!.id === seq[i]!.id).toBe(true);
      expect(seq[i + 1]!.error).toMatch(/050201|01015/);
    }
    expect(seq.filter((c) => DEL.has(c.m)).map((c) => c.id)).toEqual(plan.items.map((x) => x.id));
    expect(seq.filter((c) => DEL.has(c.m)).at(-1)).toMatchObject({ m: "adminDelete", flow: "case", id: CASE3 });
    // nothing that names the case is left, in the app or in the portal
    for (const rows of Object.values(dev.db)) expect(rows.filter((r) => namesCase(r, CASE3) || r._id === CASE3)).toEqual([]);
    expect(dev.portal.request.map((r) => r._id)).not.toContain("PkReq3");
    expect(dev.portal.query.filter((q) => q.Case_Code === "ZZT-0003")).toEqual([]);
    // RMM's load: the case is not there, and nothing "could not be read"
    const { snap, view } = await rmmLoad(dev);
    expect(snap.unreadableCases).toEqual({});
    expect(snap.warnings.join(" ")).not.toMatch(/could not be read/);
    expect(view.mapped.state.cases.map((c) => c.id).sort()).toEqual(["ZZT-0001", "ZZT-0005"]);
  });

  it("a stop halfway leaves the case (and its history) in place and says what remains; running it again finishes it", async () => {
    let refuse = true;
    const dev = devClient({ refuse: { adminDelete: (c) => (refuse && c.flow === "review" ? "KISSFLOW_ERROR_050302 You don't have permission to delete this item." : undefined) } });
    const plan = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    const first = await runDelete(dev, plan, fast);
    expect(first.failed?.item.part).toBe("review");
    expect(first.failed?.why).toMatch(/050302/);
    expect(partsOf(first.done)).toEqual(expect.arrayContaining(["portalQuery", "portalRequest", "op"]));
    expect(new Set(partsOf(first.remaining))).toEqual(new Set(["review", "rmesSAF", "rmesREG", "note", "audit", "case"]));
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(true);
    expect(dev.db.audit.filter((r) => namesCase(r, CASE3)).length).toBeGreaterThan(0);
    // again: what is left is found again and deleted
    refuse = false;
    const again = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    expect(new Set(partsOf(again.items))).toEqual(new Set(["review", "rmesSAF", "rmesREG", "note", "audit", "case"]));
    const second = await runDelete(dev, again, fast);
    expect(second.failed).toBeUndefined();
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(false);
  });

  it("an item still read after its delete, or a read-back that fails otherwise, stops the run there", async () => {
    const dev = devClient();
    const plan = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    const keepNotes: AppClient = { ...dev, formDelete: async (f, id) => (f === "note" ? undefined : dev.formDelete(f, id)) };
    const r1 = await runDelete(keepNotes, plan, fast);
    expect(r1.failed).toMatchObject({ item: { part: "note" }, why: "The delete was accepted, but the item can still be read." });
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(true);
    const plan2 = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    const noConfirm: AppClient = { ...dev, formGet: async () => Promise.reject(new Error("KISSFLOW_ERROR_050302 You don't have permission to access this item.")) };
    const r2 = await runDelete(noConfirm, plan2, fast);
    expect(r2.failed?.item.part).toBe("note");
    expect(r2.failed?.why).toMatch(/^The delete was sent, but the read-back did not confirm it: .*050302/);
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(true);
  });

  it("the supplier portal refused from here: its items the app names are listed, to delete in the portal's admin console; the app's items are deleted", async () => {
    const refusal = "KISSFLOW_ERROR_050302 You don't have permission to access this application.";
    const dev = devClient({ refuse: { portalList: refusal } });
    const plan = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    expect(plan.portal?.error).toBe(refusal);
    expect(plan.portal?.remain.map((x) => `${x.part}:${x.id}`).sort()).toEqual(["portalQuery:PkQ3a", "portalQuery:PkQ3b", "portalQuery:PkQ3d", "portalRequest:PkReq3"]);
    expect(plan.items.some((x) => x.part === "portalQuery" || x.part === "portalRequest")).toBe(false);
    expect(planBlocked(plan)).toBeUndefined();
    const r = await runDelete(dev, plan, fast);
    expect(r.failed).toBeUndefined();
    expect(dev.db.case.some((c) => c._id === CASE3)).toBe(false);
    expect(dev.portal.request.some((x) => x._id === "PkReq3")).toBe(true); // still there: the portal's own console deletes it
    // a client with no portal route at all says so the same way
    const { portalList: _l, portalGet: _g, portalDelete: _d, ...noPortal } = devClient();
    void _l, void _g, void _d;
    const plan2 = await findCaseItems(noPortal as AppClient, { id: CASE3, code: "ZZT-0003" });
    expect(plan2.portal?.error).toBe("Reading the supplier portal is not available here.");
  });

  it("a flow that can't be read blocks the delete: nothing is deleted", async () => {
    const dev = devClient({ refuse: { formList: (c) => (c.flow === "note" ? "KISSFLOW_ERROR_050302 No access" : undefined) } });
    const plan = await findCaseItems(dev, { id: CASE3, code: "ZZT-0003" });
    expect(plan.unlisted).toEqual([{ part: "note", error: "KISSFLOW_ERROR_050302 No access" }]);
    expect(planBlocked(plan)).toMatch(/^Not every flow could be read \(CIQ Internal Note\)/);
    await expect(runDelete(dev, plan, fast)).rejects.toThrow(/Nothing is deleted/);
    expect(dev.calls.filter((c) => ["adminDelete", "formDelete", "portalDelete"].includes(c.m))).toEqual([]);
  });
});

describe("runDelete is paced and stoppable (26 Oct, after the 429s)", () => {
  it(`waits ${RUN_GAP_MS} ms between two items (none before the first); Stop ends the run before the next item`, async () => {
    const dev = devClient();
    await dev.adminDelete("case", CASE5);
    const plan = await findCaseItems(dev, { id: CASE5, code: "ZZT-0005" });
    expect(plan.items.length).toBeGreaterThan(3);
    const DEL = new Set(["portalDelete", "adminDelete", "formDelete"]);
    const from = dev.calls.length;
    const waits: number[] = [];
    let started = 0;
    const r = await runDelete(dev, plan, { sleep: async (ms) => void waits.push(ms), onStep: () => void started++, stop: () => started >= 2 });
    expect(r).toMatchObject({ stopped: true });
    expect(r.failed).toBeUndefined();
    expect(r.done.map((x) => x.id)).toEqual(plan.items.slice(0, 2).map((x) => x.id));
    expect(r.remaining).toEqual(plan.items.slice(2));
    expect(waits).toEqual([RUN_GAP_MS, RUN_GAP_MS]);
    expect(dev.calls.slice(from).filter((c) => DEL.has(c.m)).map((c) => c.id)).toEqual(r.done.map((x) => x.id));
  });
});

describe("findOrphans: rows that name a deleted case", () => {
  it("groups them by the missing case with counts per flow; a draft case missing from the admin list is none; an unconfirmed one is offered no delete; a group is deleted like a case", async () => {
    const dev = devClient({ refuse: { adminGet: (c) => (c.flow === "case" && c.id === "AppZZT-0098" ? "KISSFLOW_ERROR_050302 You don't have permission to access this item." : undefined) } }, (db) => {
      // a case still in Draft: the admin list does not show it, its own read does
      db.case!.push({ _id: "AppZZT-0097", _status: "Draft", Case_Code: "ZZT-0097" });
      db.audit!.push({ _id: "FmEvDraft", Case_Code: "ZZT-0097", Case_Item_Id: "AppZZT-0097" });
      // a case whose read is refused otherwise: maybe there
      db.note!.push({ _id: "FmNote98", Note_Key: "N-98", Case_Code: "ZZT-0098", Case_Item_Id: "AppZZT-0098" });
      // rows that name only a code no case holds
      db.audit!.push({ _id: "FmEv77", Case_Code: "ZZT-0077", Action_Code: "note.added" });
    });
    // Thomas's delete of 26 Oct: the case item alone
    await dev.adminDelete("case", CASE5);
    const scan = await findOrphans(dev);
    expect(scan.errors).toEqual([]);
    const keys = scan.groups.map((g) => `${g.target.id || "-"}|${g.target.code}|${g.state}`);
    expect(keys).toEqual([`${CASE5}|ZZT-0005|gone`, "-|ZZT-0077|gone", "AppZZT-0098|ZZT-0098|unconfirmed"]);
    const g5 = scan.groups[0]!;
    const fx = appFixtures().db;
    const n = (f: FlowKey) => fx[f].filter((r) => namesCase(r, CASE5)).length;
    expect(countsOf(g5.items)).toEqual([
      { part: "portalRequest", n: 1 },
      { part: "review", n: n("review") },
      { part: "rmesSAF", n: n("rmesSAF") },
      { part: "rmesREG", n: n("rmesREG") },
      { part: "audit", n: n("audit") },
    ]);
    expect(scan.groups[2]!.why).toMatch(/050302/);
    // the group deleted through the same plan: the case is gone already, so its rows only; then no orphan of it is left
    const plan = await findCaseItems(dev, g5.target);
    expect(plan.caseState).toBe("gone");
    expect(plan.items.map((x) => x.id).sort()).toEqual(g5.items.map((x) => x.id).sort());
    expect(confirmText(plan.target)).toBe("ZZT-0005");
    expect((await runDelete(dev, plan, fast)).failed).toBeUndefined();
    const after = await findOrphans(dev);
    expect(after.groups.map((g) => g.target.code)).toEqual(["ZZT-0077", "ZZT-0098"]);
    // the code-only group: confirmed by its code
    const g77 = after.groups[0]!;
    expect(confirmText(g77.target)).toBe("ZZT-0077");
    const plan77 = await findCaseItems(dev, g77.target);
    expect(plan77.items.map((x) => x.id)).toEqual(["FmEv77"]);
    expect((await runDelete(dev, plan77, fast)).failed).toBeUndefined();
    // RMM: ZZT-0005 no longer "could not be read"
    const { snap } = await rmmLoad(dev);
    expect(snap.unreadableCases[CASE5]).toBeUndefined();
  });

  it("without the case list nothing is called an orphan; a portal that can't be read is said, the app's orphans are still listed", async () => {
    const noCases = devClient({ refuse: { adminList: (c) => (c.flow === "case" ? "KISSFLOW_ERROR_050302 No access" : undefined) } });
    const a = await findOrphans(noCases);
    expect(a.groups).toEqual([]);
    expect(a.errors.map((e) => e.part)).toContain("case");
    const noPortal = devClient({ refuse: { portalList: "KISSFLOW_ERROR_050302 No access" } });
    await noPortal.adminDelete("case", CASE5);
    const b = await findOrphans(noPortal);
    expect(b.errors).toEqual([{ part: "portalRequest", error: "KISSFLOW_ERROR_050302 No access" }]);
    expect(b.groups.map((g) => g.target.id)).toEqual([CASE5]);
    expect(b.groups[0]!.items.some((x) => x.part === "portalRequest")).toBe(false);
  });
});
