// Owner D: the read ladder (DESIGN §4, §7.1) against the fake Kissflow (kf/fakeClient.ts) seeded with B's fixtures:
// the rungs per persona with their refusals recorded, the session memory of an admin refusal, the byId probe, the
// snapshot fallback with the case banner, skipped and refused forms, own drafts, the load-time side effects, and what the
// store shows between loads (a save's read-backs; the last load's data where a new load could not read a part again).
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import type { AppState, InternalPersonaId } from "@/domain/types";
import { str, type RawItem } from "@/portal/data/raw";
import { actingAs } from "./identity";
import { LIST, STEPS } from "./ids";
import { FAKE_ERRORS, createFakeClient, type FakeOptions } from "./kf/fakeClient";
import { NOT_READ_AGAIN, NO_READ_ROUTE, REFUSED_EARLIER, caseBannerOf, draftsOf, keptSince, effectBlocked, effectsFor, isRefusal, keepUnread, keptBlockText, keptRowText, keptText, loadSnapshot, notReadAgain, ownDraftHas, readPlan, runLoadEffects, viewOf, withSaved, withoutDrafts, type LoadFacts, type SideEffect } from "./load";
import { KF_USERS, PERSONA_USER, appFixtures, caseItemIdOf, fixtureIdentity, tasksFor } from "./testing/rawFixtures";
import type { AppClient, FlowKey, LiveSnapshot, WriteCtx, WriteResult } from "./types";
import { liveWriters } from "./write/actions";

function setup(persona: InternalPersonaId, opts: FakeOptions = {}, edit?: (db: Partial<Record<FlowKey, RawItem[]>>) => void) {
  const fx = appFixtures();
  const identity = fixtureIdentity([persona]);
  const acting = actingAs(identity, persona);
  const u = KF_USERS[PERSONA_USER[persona]]!;
  const db = structuredClone(fx.db) as Partial<Record<FlowKey, RawItem[]>>;
  edit?.(db);
  const client = createFakeClient({ items: db, tasks: tasksFor(u._id), me: { _id: u._id, Name: u.Name, Email: u.Email, roles: [persona] } }, opts);
  return { fx, identity, acting, client };
}

const rungs = (snap: LiveSnapshot, flow: FlowKey) => snap.reads.filter((r) => r.flow === flow).map((r) => `${r.rung}:${r.ok ? "ok" : "refused"}`);
const callsOf = (client: ReturnType<typeof setup>["client"], m: string, flow?: FlowKey) => client.calls.filter((c) => c.m === m && (!flow || c.flow === flow));
const CASE_IDS = ["ZZT-0001", "ZZT-0003", "ZZT-0005"].map(caseItemIdOf);

describe("loadSnapshot", () => {
  it("reads the index first, then every process flow in full through the admin rung when Kissflow allows it", async () => {
    const { client, identity, acting } = setup("rmm", { admin: true });
    const snap = await loadSnapshot(client, identity, acting);
    expect(client.calls.slice(0, 2).map((c) => `${c.m}:${c.flow}`).sort()).toEqual(["formList:audit", "formList:config"]);
    for (const f of ["case", "review", "op"] as const) expect(rungs(snap, f)[0]).toBe("admin:ok");
    expect(snap.unreadableCases).toEqual({});
    expect(snap.items.case.map((it) => it._id).sort()).toEqual([...CASE_IDS].sort());
    // full reads: the JSON fields a list row leaves out are there
    expect(snap.items.case.every((it) => typeof it.Case_Contacts_JSON === "string")).toBe(true);
    expect(callsOf(client, "adminGet").length).toBe(snap.items.case.length + snap.items.review.length + snap.items.op.length);
    expect(callsOf(client, "getById")).toHaveLength(0);
    // the held steps are still known (tasks rung), so the writers act only where the user holds the task
    expect(snap.tasks.map((t) => t.itemId).sort()).toEqual(tasksFor(identity.kfUserId).map((t) => t.itemId).sort());
    const view = viewOf(snap, identity, acting);
    expect(view.mapped.state.cases.map((c) => c.id).sort()).toEqual(["ZZT-0001", "ZZT-0003", "ZZT-0005"]);
    expect(caseBannerOf(view.mapped.index, snap, "ZZT-0003")).toBeUndefined();
  });

  it("RMM without admin rights: the refusal is recorded, own cases come from My items, the rest from the history", async () => {
    const { client, identity, acting } = setup("rmm");
    const snap = await loadSnapshot(client, identity, acting);
    expect(rungs(snap, "case")).toEqual(["admin:refused", "mine:ok", "byId:refused", "snapshot:ok"]);
    // every review RMM started is listed under My items (the ended ones too, m16): nothing is served from snapshots
    expect(rungs(snap, "review")).toEqual(["admin:refused", "tasks:ok", "mine:ok"]);
    expect(rungs(snap, "op").slice(0, 3)).toEqual(["admin:refused", "tasks:ok", "mine:ok"]);
    expect(snap.reads.find((r) => r.flow === "case" && r.rung === "admin")?.error).toBe(FAKE_ERRORS.admin);
    // byId: the first id probes the viewer route (adminGet is not tried again after the admin refusal); one refusal
    // stops it for this load
    expect(callsOf(client, "getById", "case")).toHaveLength(1);
    expect(callsOf(client, "adminGet")).toHaveLength(0);
    expect(Object.keys(snap.unreadableCases).sort()).toEqual([...CASE_IDS].sort());
    expect(new Set(Object.values(snap.unreadableCases))).toEqual(new Set([FAKE_ERRORS.viewer]));
    expect(snap.warnings.some((w) => w.startsWith("3 cases could not be read in full"))).toBe(true);
    // the held tasks keep their activity instance; nothing else carries one
    const held = new Map(tasksFor(identity.kfUserId).map((t) => [t.itemId, t.act]));
    expect(snap.tasks.map((t) => t.itemId).sort()).toEqual([...held.keys()].sort());
    for (const it of [...snap.items.review, ...snap.items.op, ...snap.items.case]) expect(it._activity_instance_id).toBe(held.get(it._id));
    // the screens still get every case, with the reason for the banner
    const view = viewOf(snap, identity, acting);
    expect(view.mapped.state.cases.map((c) => c.id).sort()).toEqual(["ZZT-0001", "ZZT-0003", "ZZT-0005"]);
    // the reason only, without Kissflow's full stop (the shell's sentence goes on after it)
    expect(caseBannerOf(view.mapped.index, snap, "ZZT-0003")).toBe(FAKE_ERRORS.viewer.replace(/\.$/, ""));
    expect(caseBannerOf(view.mapped.index, snap, "ZZT-9999")).toBeUndefined();
  });

  it("keeps an ended review row it could not read in full (its live status counts) and fills its blanks from the history (m16)", async () => {
    const { client, identity, acting, fx } = setup("rmm");
    const snap = await loadSnapshot(client, identity, acting);
    // RMM started every review; the completed ones are My items rows only (live: no field of the review, not even its
    // case): kept, marked sparse, placed by the history
    const done = fx.db.review.filter((it) => it._status === "Completed");
    expect(done.length).toBeGreaterThan(0);
    for (const it of done) {
      expect(snap.items.review.some((x) => x._id === it._id)).toBe(true);
      expect(snap.sparse).toContain(it._id);
    }
    const view = viewOf(snap, identity, acting);
    const zzt3 = view.mapped.state.cases.find((c) => c.id === "ZZT-0003")!;
    const qm = fx.cases["ZZT-0003"].reviews.find((r) => r.dept === "QM")!;
    expect(zzt3.reviews.find((r) => r.dept === "QM")?.status).toBe(qm.status);
    expect(view.mapped.index.reviews.get("ZZT-0003|QM")).toMatchObject({ live: true, itemStatus: "Completed" });
    // the list row has no Completed_By: who completed it comes from the review.completed snapshot, not a stand-in
    const conf = zzt3.confirmations.find((k) => k.type === "dept-completion" && k.dept === "QM")!;
    const want = fx.cases["ZZT-0003"].confirmations.find((k) => k.type === "dept-completion" && k.dept === "QM")!;
    expect([conf.name, conf.email]).toEqual([want.name, want.email]);
    // an ended open point we could not read in full still gives way to the snapshot that shows it closed (its thread)
    const closedOps = fx.db.op.filter((it) => it._status === "Completed");
    for (const it of closedOps) if (snap.sparse?.includes(it._id)) throw new Error(`${it._id} kept as a sparse row`);
    // morning test R-1: Diagnostics lists the fields the My items rows carried (the live set, 21 Oct)
    const mine = snap.reads.find((r) => r.flow === "review" && r.rung === "mine")!;
    expect(mine.keys).toEqual(["Name", "_activity_id", "_activity_instance_id", "_completed_at", "_current_assigned_to", "_current_step", "_id", "_modified_at", "_progress", "_status"]);
  });

  it("RMM without admin rights: the history places the reviews My items lists (live: no field of the review), so their live status shows the final release, also while the case still waits at the supplier's step", async () => {
    const { client, identity, acting, fx } = setup("rmm");
    const caseItem = caseItemIdOf("ZZT-0003");
    for (const r of fx.db.review) if (r.Case_Item_Id === caseItem && r._status !== "Completed") client.move(r._id, STEPS.review.end);
    // as live in dev (20 Oct): I-2 wrote the completeness, but could not submit "Waiting for supplier: CIQ"
    client.move(caseItem, STEPS.case.waiting);
    client.set(caseItem, { Case_Phase: LIST.phase.review });
    const snap = await loadSnapshot(client, identity, acting);
    const view = viewOf(snap, identity, acting);
    // before: every review RMM did not hold named no case ("… names no case item; it is not shown")
    expect(view.warnings.filter((w) => /names no case item/.test(w))).toEqual([]);
    const c = view.mapped.state.cases.find((x) => x.id === "ZZT-0003")!;
    expect(c.reviews.map((t) => t.status)).toEqual(Array(5).fill("completed")); // RMM, REG, SAF, QM, MIC (no SF-09: no Sustainability track)
    for (const t of c.reviews) expect(view.mapped.index.reviews.get(`ZZT-0003|${t.dept}`)).toMatchObject({ live: true, itemStatus: "Completed" });
    // before: the case's My items row (status and step only) read as supplier input
    expect(c.phase).toBe("final-release");
  });

  it("a point only My items lists (live: none of its fields) gives way to its snapshot: the own points a cancellation ended show closed by it, without a warning", async () => {
    const { client, identity, acting } = setup("rmm");
    const at = "2026-10-24T08:00:00Z";
    const first = viewOf(await loadSnapshot(client, identity, acting), identity, acting);
    const ctx: WriteCtx = { client, identity, acting, index: first.mapped.index, webhooks: {}, now: () => at, containerOk: true };
    const prev = first.mapped.state;
    const next = A.cancelCase(prev, acting.me.id, "ZZT-0003", "Material discontinued.", at);
    expect((await liveWriters.cancelCase!(ctx, prev, next, ["ZZT-0003", "Material discontinued."])).ok).toBe(true);
    const snap = await loadSnapshot(client, identity, acting);
    const ended = client.db.op.filter((it) => it._status === "Completed").map((it) => it._id);
    expect(ended.length).toBeGreaterThan(0);
    for (const id of ended) expect(snap.items.op.some((it) => it._id === id)).toBe(false);
    const view = viewOf(snap, identity, acting);
    // before: each such row named no case ("Open point … names no case item; it is not shown")
    expect(view.warnings.filter((w) => /names no case item/.test(w))).toEqual([]);
    const c = view.mapped.state.cases.find((x) => x.id === "ZZT-0003")!;
    for (const id of ["OP-0003-01", "OP-0003-02"]) expect(c.openPoints.find((p) => p.id === id)).toMatchObject({ status: "closed", closeReason: "Case cancelled: Material discontinued." });
  });

  describe("a review only My items lists that no history line places (its review.started row was lost)", () => {
    const caseItem = caseItemIdOf("ZZT-0003");
    let saf = "";
    /** RMM without admin rights; ZZT-0003's Safety review (in progress, not RMM's to hold) has no history row. */
    const lost = (opts: FakeOptions) =>
      setup("rmm", opts, (db) => {
        saf = db.review!.find((r) => r.Case_Item_Id === caseItem && r.Review_Dept === "SAF")!._id;
        db.audit = db.audit!.filter((r) => str(r, "Object_Item_Id") !== saf);
      });
    it("is kept with the department its step names (LiveIndex.unplacedReviews), as a dev note, not a load warning", async () => {
      const s = lost({ viewerRead: true });
      const snap = await loadSnapshot(s.client, s.identity, s.acting);
      expect(snap.sparse).toContain(saf);
      const view = viewOf(snap, s.identity, s.acting);
      // B9: a dev note, not a load warning
      expect(view.notes).toContain(`Review ${saf} names no case item; it is not shown.`);
      expect(view.warnings).not.toContain(`Review ${saf} names no case item; it is not shown.`);
      expect(view.mapped.index.unplacedReviews).toEqual([{ itemId: saf, status: "InProgress", dept: "SAF" }]);
      const c = view.mapped.state.cases.find((x) => x.id === "ZZT-0003")!;
      expect([c.phase, view.mapped.index.cases.get("ZZT-0003")?.readable, c.reviews.some((t) => t.dept === "SAF")]).toEqual(["review", true, false]);
    });
  });

  it("26 Oct: a reload reads in full only the open items; ended items read earlier this session are used again", async () => {
    const { client, identity, acting } = setup("rmm", { admin: true });
    const first = await loadSnapshot(client, identity, acting);
    const ended = (["case", "review", "op"] as const).flatMap((f) => first.items[f].filter((it) => ["Completed", "Withdrawn", "Rejected", "Cancelled"].includes(str(it, "_status"))).map((it) => it._id));
    const all = first.items.case.length + first.items.review.length + first.items.op.length;
    expect(ended.length).toBeGreaterThan(0);
    const before = client.calls.length;
    const again = await loadSnapshot(client, identity, acting);
    const reread = client.calls.slice(before).filter((c) => c.m === "adminGet");
    expect(reread).toHaveLength(all - ended.length);
    expect(reread.some((c) => ended.includes(String(c.id ?? "")))).toBe(false);
    expect(again.reads.filter((r) => r.rung === "admin").reduce((n, r) => n + (r.reused ?? 0), 0)).toBe(ended.length);
    // the same screens: the reused reads map exactly like the fresh ones
    expect(viewOf(again, identity, acting).mapped.state.cases).toEqual(viewOf(first, identity, acting).mapped.state.cases);
  });

  it("26 Oct: a new history row on a case reads that case's ended items again; a reopened item is read again", async () => {
    const { client, identity, acting } = setup("rmm", { admin: true });
    const first = await loadSnapshot(client, identity, acting);
    const endedReview = first.items.review.find((it) => str(it, "_status") === "Completed");
    expect(endedReview).toBeDefined();
    const caseId = str(endedReview!, "Case_Item_Id");
    // a history row on its case (the final PDF, a reopen, …)
    client.db.audit.push({ _id: "PkEvNew1", Case_Item_Id: caseId, Case_Code: "x", Event_At: "2026-10-26T01:00:00Z", Action_Code: "case.final-document", Snapshot_JSON: "{}" });
    let before = client.calls.length;
    await loadSnapshot(client, identity, acting);
    let reread = client.calls.slice(before).filter((c) => c.m === "adminGet").map((c) => String(c.id ?? ""));
    expect(reread).toContain(endedReview!._id);
    // nothing new: not read again
    before = client.calls.length;
    await loadSnapshot(client, identity, acting);
    reread = client.calls.slice(before).filter((c) => c.m === "adminGet").map((c) => String(c.id ?? ""));
    expect(reread).not.toContain(endedReview!._id);
    // reopened without a history row: its list row shows another status, so it is read again
    client.set(endedReview!._id, { _status: "InProgress" });
    before = client.calls.length;
    const snap = await loadSnapshot(client, identity, acting);
    reread = client.calls.slice(before).filter((c) => c.m === "adminGet").map((c) => String(c.id ?? ""));
    expect(reread).toContain(endedReview!._id);
    expect(str(snap.items.review.find((it) => it._id === endedReview!._id)!, "_status")).toBe("InProgress");
  });

  it("26 Oct: nothing is reused when this load could not read the history, nor by a new client (a new session)", async () => {
    let block = false;
    const { client, identity, acting } = setup("rmm", { admin: true, refuse: { formList: (c) => (block && c.flow === "audit" ? "This form could not be read." : false) } });
    const first = await loadSnapshot(client, identity, acting);
    const all = first.items.case.length + first.items.review.length + first.items.op.length;
    block = true;
    const before = client.calls.length;
    await loadSnapshot(client, identity, acting);
    expect(client.calls.slice(before).filter((c) => c.m === "adminGet")).toHaveLength(all);
    const fresh = setup("rmm", { admin: true });
    await loadSnapshot(fresh.client, fresh.identity, fresh.acting);
    expect(callsOf(fresh.client, "adminGet")).toHaveLength(all);
  });

  it("26 Oct: by id (a viewer): ended cases read earlier this session are not read again", async () => {
    const { client, identity, acting } = setup("cus", { viewerRead: true });
    const first = await loadSnapshot(client, identity, acting);
    const ended = first.items.case.filter((it) => str(it, "_status") === "Completed").map((it) => it._id);
    const before = client.calls.length;
    const again = await loadSnapshot(client, identity, acting);
    const reread = client.calls.slice(before).filter((c) => c.m === "getById").map((c) => String(c.id ?? ""));
    expect(reread).toHaveLength(first.items.case.length - ended.length);
    expect(reread.some((id) => ended.includes(id))).toBe(false);
    expect(again.items.case.map((it) => it._id).sort()).toEqual(first.items.case.map((it) => it._id).sort());
  });

  it("remembers an admin refusal for the session (the client), and tries again with a new one", async () => {
    const { client, identity, acting } = setup("qm");
    await loadSnapshot(client, identity, acting);
    const before = client.calls.length;
    const again = await loadSnapshot(client, identity, acting);
    expect(client.calls.slice(before).filter((c) => c.m === "adminList")).toHaveLength(0);
    expect(again.reads.find((r) => r.flow === "case" && r.rung === "admin")).toMatchObject({ ok: false, error: "Refused earlier in this session; not tried again." });
    const fresh = setup("qm");
    await loadSnapshot(fresh.client, fresh.identity, fresh.acting);
    expect(callsOf(fresh.client, "adminList")).toHaveLength(3);
  });

  it("reads every case through the viewer route once the probe answers", async () => {
    const { client, identity, acting } = setup("cus", { viewerRead: true });
    const snap = await loadSnapshot(client, identity, acting);
    expect(rungs(snap, "case")).toEqual(["admin:refused", "byId:ok"]);
    expect(callsOf(client, "getById", "case")).toHaveLength(3);
    expect(snap.unreadableCases).toEqual({});
    expect(snap.items.case.every((it) => typeof it.Case_Contacts_JSON === "string")).toBe(true);
  });

  it("reads what each persona's grants allow and skips the rest (DESIGN §4 table)", async () => {
    const qm = setup("qm");
    const snap = await loadSnapshot(qm.client, qm.identity, qm.acting);
    for (const f of ["rmesSAF", "rmesREG", "supplier"] as const) expect(rungs(snap, f)).toEqual(["skipped:ok"]);
    expect(callsOf(qm.client, "myItems", "case")).toHaveLength(0);
    expect(callsOf(qm.client, "myItems", "review")).toHaveLength(0);
    expect(callsOf(qm.client, "myTasks", "review").map((c) => c.activityId)).toEqual([STEPS.review.QM]);
    expect(callsOf(qm.client, "myTasks", "op").map((c) => c.activityId).sort()).toEqual(Object.entries(STEPS.op).filter(([k]) => k !== "start" && k !== "end").map(([, a]) => a).sort());

    const auditor = setup("auditor");
    const a = await loadSnapshot(auditor.client, auditor.identity, auditor.acting);
    expect(a.forms.rmesSAF.length + a.forms.rmesREG.length).toBeGreaterThan(0);
    expect(rungs(a, "supplier")).toEqual(["skipped:ok"]);
    expect(callsOf(auditor.client, "myTasks")).toHaveLength(0);

    const ba = setup("admin");
    const b = await loadSnapshot(ba.client, ba.identity, ba.acting);
    expect(b.forms.supplier.length).toBeGreaterThan(0);
    expect(rungs(b, "rmesSAF")).toEqual(["skipped:ok"]);
    expect(readPlan(ba.acting).process.op.tasks).toEqual([]);
  });

  it("reads a refused form as empty, with a warning", async () => {
    const { client, identity, acting } = setup("rmm", { refuse: { formList: (c) => (c.flow === "note" ? "no permission to view this form" : undefined) } });
    const snap = await loadSnapshot(client, identity, acting);
    expect(snap.forms.note).toEqual([]);
    expect(snap.reads.find((r) => r.flow === "note")).toMatchObject({ rung: "form", ok: false, error: "no permission to view this form" });
    expect(snap.warnings).toContain("CIQ Internal Note could not be read: no permission to view this form");
    expect(snap.forms.audit.length).toBeGreaterThan(0);
  });

  it("fails the load only when neither the case index nor the configuration can be read", async () => {
    const { client, identity, acting } = setup("rmm", { refuse: { formList: (c) => (c.flow === "audit" || c.flow === "config" ? "Kissflow is down" : undefined) } });
    await expect(loadSnapshot(client, identity, acting)).rejects.toThrow(/case index or its configuration: Kissflow is down/);
    expect(client.calls.some((c) => c.m === "adminList" || c.m === "myItems")).toBe(false);
  });

  it("lists every part's reports and warnings in a fixed order, whatever answered first", async () => {
    const { client, identity, acting } = setup("saf", { refuse: { formList: (c) => (c.flow === "note" ? "no permission to view this form" : undefined) } });
    const snap = await loadSnapshot(client, identity, acting);
    expect([...new Set(snap.reads.map((r) => r.flow))]).toEqual(["audit", "config", "note", "rmesSAF", "rmesREG", "supplier", "review", "op", "case"]);
    expect(snap.warnings[0]).toBe("CIQ Internal Note could not be read: no permission to view this form");
  });
});

/** The fake behind a network: every call waits until the test answers all the calls then pending together (one round
 *  trip); `sent` records the trip each call went out in. The trips a load needs are what the user waits for, whatever
 *  one trip costs (the SDK goes through the Kissflow page). */
function inRounds(fake: AppClient) {
  let trip = 1;
  let pending: (() => void)[] = [];
  const sent: { m: string; flow: string; trip: number }[] = [];
  const client = new Proxy(fake, {
    get(target, prop, receiver) {
      const v: unknown = Reflect.get(target, prop, receiver);
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        sent.push({ m: String(prop), flow: String(args[0]), trip });
        return new Promise<void>((go) => pending.push(go)).then(() => (v as (...a: unknown[]) => unknown).apply(target, args));
      };
    },
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  async function run<T>(load: Promise<T>): Promise<{ value: T; trips: number }> {
    let done = false;
    const out = load.finally(() => (done = true));
    await settle();
    let trips = 0;
    while (!done) {
      if (!pending.length) throw new Error("the load waits for nothing it sent");
      const go = pending;
      pending = [];
      trips++;
      trip++;
      for (const g of go) g();
      await settle();
    }
    return { value: await out, trips };
  }
  const tripsOf = (pred: (c: (typeof sent)[number]) => boolean) => [...new Set(sent.filter(pred).map((c) => c.trip))].sort((a, b) => a - b);
  return { client, sent, run, tripsOf };
}

describe("loadSnapshot: what waits for what (Thomas 20 Oct: the first load was slow)", () => {
  it("RMM: the index alone, then every list of every flow at once, case's byId last: 5 round trips (19 one after the other before)", async () => {
    const { client, identity, acting } = setup("rmm");
    const net = inRounds(client);
    const { value: snap, trips } = await net.run(loadSnapshot(net.client, identity, acting));
    expect(net.sent.filter((c) => c.trip === 1).map((c) => `${c.m}:${c.flow}`).sort()).toEqual(["formList:audit", "formList:config"]);
    // trip 2: the admin, My tasks (all six open point steps) and My items lists of the three flows, and the other forms
    for (const m of ["adminList", "myTasks", "myItems"]) expect(net.tripsOf((c) => c.m === m)).toEqual([2]);
    expect(net.sent.filter((c) => c.m === "myTasks" && c.flow === "op")).toHaveLength(6);
    expect(net.tripsOf((c) => c.m === "formList" && c.flow !== "audit" && c.flow !== "config")).toEqual([2]);
    // case's byId needs the ids the review and open point items name: it goes out after their last call
    const byId = net.tripsOf((c) => c.flow === "case" && (c.m === "getById" || c.m === "adminGet"));
    expect(byId[0]).toBeGreaterThan(Math.max(...net.tripsOf((c) => c.flow === "review" || c.flow === "op")));
    expect(trips).toBe(5);
    // the same ladder (the tests above): its rungs and what they read
    expect(rungs(snap, "case")).toEqual(["admin:refused", "mine:ok", "byId:refused", "snapshot:ok"]);
    expect(rungs(snap, "op").slice(0, 3)).toEqual(["admin:refused", "tasks:ok", "mine:ok"]);
  });

  it("a reviewer and a role without tasks need as many round trips as their longest flow", async () => {
    const saf = setup("saf");
    const a = inRounds(saf.client);
    expect((await a.run(loadSnapshot(a.client, saf.identity, saf.acting))).trips).toBe(4);
    const cus = setup("cus");
    const b = inRounds(cus.client);
    expect((await b.run(loadSnapshot(b.client, cus.identity, cus.acting))).trips).toBe(3);
  });

  it("goes on once one index form answered: the process flows do not wait for the case index, case's byId does", async () => {
    const { client, identity, acting } = setup("qm");
    let auditIn!: () => void;
    const auditHeld = new Promise<void>((r) => (auditIn = r));
    const slow: AppClient = { ...client, formList: async (f) => (f === "audit" ? (await auditHeld, client.formList(f)) : client.formList(f)) };
    const load = loadSnapshot(slow, identity, acting);
    await new Promise((r) => setTimeout(r, 0));
    expect(client.calls.filter((c) => c.m === "myTasks").length).toBeGreaterThan(0); // sent before the audit form answered
    expect(client.calls.some((c) => c.m === "getById")).toBe(false);
    auditIn();
    const snap = await load;
    expect(rungs(snap, "case")).toEqual(["admin:refused", "byId:refused", "snapshot:ok"]);
    expect(snap.forms.audit.length).toBeGreaterThan(0);
  });
});

describe("drafts", () => {
  it("lists the user's own unsent Start draft and keeps it out of the screens", async () => {
    const { client, identity, acting } = setup("rmm", { admin: true });
    const { id, act } = await client.create("case", { Case_Code: "ZZT-0099", Trade_Name: "Test emollient", Cycle_No: 1 });
    const snap = await loadSnapshot(client, identity, acting);
    expect(draftsOf(snap)).toEqual([{ flow: "case", itemId: id, act, activityId: STEPS.case.start, label: "New case ZZT-0099 · Test emollient" }]);
    const clean = withoutDrafts(snap);
    expect(clean.items.case.some((it) => it._id === id)).toBe(false);
    expect(clean.tasks.some((t) => t.itemId === id)).toBe(false);
    expect(viewOf(snap, identity, acting).mapped.state.cases.map((c) => c.id)).not.toContain("ZZT-0099");
    expect(withoutDrafts(clean)).toBe(clean);
  });

  it("an own draft whose full read failed is still the user's (its My items row names nobody, live 21 Oct) and holds every key of its flow", async () => {
    const { client, identity, acting } = setup("rmm", { refuse: { getTask: (c) => (c.flow === "case" ? "KISSFLOW_ERROR_00500 Try again later." : undefined) } });
    const { id, act } = await client.create("case", { Case_Code: "ZZT-0099", Trade_Name: "Test emollient", Cycle_No: 1 });
    const snap = await loadSnapshot(client, identity, acting);
    expect(snap.warnings).toContain(`CIQ Case ${id}: your unsent draft could not be read (KISSFLOW_ERROR_00500 Try again later.).`);
    const view = viewOf(snap, identity, acting);
    expect(view.drafts).toEqual([{ flow: "case", itemId: id, act, activityId: STEPS.case.start, label: `New case ${id}` }]);
    // its key is unknown: it may be any new case's (writers: draftUnread)
    expect([...view.mapped.index.ownDraftKeys!]).toEqual(["case|*"]);
    expect([ownDraftHas(view.mapped.index.ownDraftKeys, "case", "ZZT-0099"), ownDraftHas(view.mapped.index.ownDraftKeys, "op", "ZZT-0099-OP1")]).toEqual(["unread", undefined]);
  });
});

describe("drafts read in full whose key is blank (one opened in Kissflow's own form and left)", () => {
  const dropZ3Reviews = (db: Partial<Record<FlowKey, RawItem[]>>) => {
    db.review = db.review!.filter((it) => str(it, "Case_Code") !== "ZZT-0003");
    db.audit = db.audit!.filter((it) => !(str(it, "Case_Code") === "ZZT-0003" && /^(review|release)\./.test(str(it, "Action_Code"))));
  };

  it("a case draft holds no key: a new case is created (before: \"case|*\" refused every new case, and a reload never helped)", async () => {
    const s = setup("rmm", { admin: true });
    const { id } = await s.client.create("case", { Trade_Name: "left in Kissflow's own form" });
    const snap = await loadSnapshot(s.client, s.identity, s.acting);
    expect(snap.unreadableCases[id]).toBeUndefined();
    const view = viewOf(snap, s.identity, s.acting);
    expect(view.drafts.map((d) => d.itemId)).toEqual([id]);
    expect([...view.mapped.index.ownDraftKeys!]).toEqual([]);
    const input: A.NewCaseInput = { materialName: "OLIVIA Pure 100", inci: "Olea Europaea Fruit Oil", materialNo: "RM-500123", supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena", "UsRavi"], markets: ["EU", "UK"], dueDate: "2026-12-31T16:00:00.000Z", priority: "high" };
    const prev = view.mapped.state;
    const made = A.createCase(prev, s.acting.me.id, input, "2026-10-24T08:00:00Z");
    const ctx: WriteCtx = { client: s.client, identity: s.identity, acting: s.acting, index: view.mapped.index, webhooks: {}, now: () => "2026-10-24T08:00:00Z", containerOk: true };
    expect(await liveWriters.createCase!(ctx, prev, made.state, [input])).toMatchObject({ ok: true });
    expect(s.client.db.case.some((it) => it.Case_Code === made.id && it._status !== "Draft")).toBe(true);
  });

  it("the same draft whose full read failed still holds every key of its flow (only its My items row was read)", async () => {
    let draft = "";
    const fails = (c: { id?: string }) => (c.id === draft ? "KISSFLOW_ERROR_00500 Try again later." : undefined);
    const s = setup("rmm", { admin: true, refuse: { getTask: fails, adminGet: fails } }, dropZ3Reviews);
    const { id } = await s.client.create("review", { Activation_Reason: "opened in Kissflow and left" });
    draft = id;
    const snap = await loadSnapshot(s.client, s.identity, s.acting);
    expect(snap.sparse).toContain(id);
    expect([...viewOf(snap, s.identity, s.acting).mapped.index.ownDraftKeys!]).toEqual(["review|*"]);
  });
});

describe("runLoadEffects", () => {
  async function ready(persona: InternalPersonaId, containerOk = true) {
    const { client, identity, acting } = setup(persona, { admin: true });
    const snap = await loadSnapshot(client, identity, acting);
    const view = viewOf(snap, identity, acting);
    const ctx: WriteCtx = { client, identity, acting, index: view.mapped.index, webhooks: {}, now: () => "2026-10-24T08:00:00Z", containerOk };
    const facts: LoadFacts = { reads: snap.reads, audit: snap.forms.audit };
    return { state: view.mapped.state, ctx, acting, facts };
  }
  const ok = (message: string): WriteResult => ({ ok: true, message, handoffs: [], warnings: [] });

  it("SAF runs ensureRmes one case in review at a time, each case at most once per session", async () => {
    const { state, ctx, acting, facts } = await ready("saf");
    const inReview = state.cases.filter((c) => c.phase === "review").map((c) => c.id);
    expect(inReview).toEqual(["ZZT-0003"]);
    const seen: { cases: string[]; index: string[] }[] = [];
    const ensureRmes: SideEffect = async (c, s) => {
      seen.push({ cases: s.cases.map((x) => x.id), index: [...c.index.cases.keys()] });
      return ok("RMES record created.");
    };
    const attempted = new Set<string>();
    const first = await runLoadEffects({ acting, state, ctx, effects: { ensureRmes }, attempted, facts });
    expect(first).toEqual([{ effect: "ensureRmes", caseId: "ZZT-0003", result: ok("RMES record created.") }]);
    expect(seen).toEqual([{ cases: ["ZZT-0003"], index: ["ZZT-0003"] }]);
    expect(await runLoadEffects({ acting, state, ctx, effects: { ensureRmes }, attempted, facts })).toEqual([]);
    expect(seen).toHaveLength(1);
  });

  it("keeps a case with nothing to do eligible, and records a thrown failure once", async () => {
    const { state, ctx, acting, facts } = await ready("saf");
    expect(effectsFor("saf")).toEqual(["ensureRmes"]);
    expect(effectsFor("rmm")).toEqual([]); // the reviews and the release request are the integrations' (22 Oct: E-A, E-B)
    const attempted = new Set<string>();
    let calls = 0;
    const nothing: SideEffect = async () => {
      calls++;
      return null;
    };
    expect(await runLoadEffects({ acting, state, ctx, effects: { ensureRmes: nothing }, attempted, facts })).toEqual([]);
    expect(await runLoadEffects({ acting, state, ctx, effects: { ensureRmes: nothing }, attempted, facts })).toEqual([]);
    expect(calls).toBe(2);
    const boom: SideEffect = async () => {
      throw new Error("050313 no permission");
    };
    const out = await runLoadEffects({ acting, state, ctx, effects: { ensureRmes: boom }, attempted, facts });
    expect(out).toHaveLength(1);
    expect(out[0]!.result).toMatchObject({ ok: false, tone: "danger" });
    expect(out[0]!.result.message).toContain("the RMES record could not be created (050313 no permission)");
    expect(await runLoadEffects({ acting, state, ctx, effects: { ensureRmes: boom }, attempted, facts })).toEqual([]);
  });

  it("a dev switch between held roles (same store, same `attempted`) from Safety to Regulatory still runs Regulatory's ensureRmes", async () => {
    const saf = await ready("saf");
    const reg = await ready("reg");
    const seen: string[] = [];
    const ensureRmes: SideEffect = async (c) => (seen.push(`${c.acting.dept} ${[...c.index.cases.keys()].join()}`), ok(`${c.acting.dept} RMES record created.`));
    const attempted = new Set<string>();
    expect((await runLoadEffects({ ...saf, effects: { ensureRmes }, attempted })).map((o) => o.result.message)).toEqual(["SAF RMES record created."]);
    expect((await runLoadEffects({ ...reg, effects: { ensureRmes }, attempted })).map((o) => o.result.message)).toEqual(["REG RMES record created."]);
    expect(seen).toEqual(["SAF ZZT-0003", "REG ZZT-0003"]);
    // still once per case and department, back and forth
    expect(await runLoadEffects({ ...saf, effects: { ensureRmes }, attempted })).toEqual([]);
    expect(await runLoadEffects({ ...reg, effects: { ensureRmes }, attempted })).toEqual([]);
    // the notes too: each department's own once
    const waits: SideEffect = async (c) => ({ ok: true, note: true, message: `${c.acting.dept} waits for the case`, handoffs: [], warnings: [] });
    const quiet = new Set<string>();
    expect((await runLoadEffects({ ...saf, effects: { ensureRmes: waits }, attempted: quiet })).map((o) => o.result.message)).toEqual(["SAF waits for the case"]);
    expect((await runLoadEffects({ ...reg, effects: { ensureRmes: waits }, attempted: quiet })).map((o) => o.result.message)).toEqual(["REG waits for the case"]);
    const never: SideEffect = async () => {
      throw new Error("must not run");
    };
    const noAudit = (x: typeof saf) => ({ ...x, facts: { ...x.facts, reads: x.facts.reads.map((r) => (r.flow === "audit" ? { ...r, ok: false } : r)) } });
    const blocked = new Set<string>();
    expect((await runLoadEffects({ ...noAudit(saf), effects: { ensureRmes: never }, attempted: blocked })).map((o) => o.result.message)).toEqual([expect.stringMatching(/^The Safety RMES record was not created/)]);
    expect((await runLoadEffects({ ...noAudit(reg), effects: { ensureRmes: never }, attempted: blocked })).map((o) => o.result.message)).toEqual([expect.stringMatching(/^The Regulatory RMES record was not created/)]);
  });

  it("M1: an effect whose deciding read failed on this load does not run; one Diagnostics note per session", async () => {
    const never: SideEffect = async () => {
      throw new Error("must not run");
    };
    // SAF: the audit form was refused (it lists the rmes.saved rows): one note per session
    const saf = await ready("saf");
    const noAudit = { ...saf.facts, reads: saf.facts.reads.map((r) => (r.flow === "audit" ? { ...r, ok: false, error: "no permission" } : r)) };
    const attempted = new Set<string>();
    const out = await runLoadEffects({ ...saf, facts: noAudit, effects: { ensureRmes: never }, attempted });
    expect(out.map((o) => [o.effect, o.note])).toEqual([["ensureRmes", true]]);
    expect(out[0]!.result.message).toMatch(/^The Safety RMES record was not created on this load/);
    expect(await runLoadEffects({ ...saf, facts: noAudit, effects: { ensureRmes: never }, attempted })).toEqual([]);
    // its RMES form was refused (read as empty), so a record that exists would look missing
    const noForm = { ...saf.facts, reads: saf.facts.reads.map((r) => (r.flow === "rmesSAF" ? { ...r, ok: false } : r)) };
    const o2 = await runLoadEffects({ ...saf, facts: noForm, effects: { ensureRmes: never }, attempted: new Set() });
    expect(o2.map((o) => [o.effect, o.note])).toEqual([["ensureRmes", true]]);
    // with the reads in place the effect runs
    let ran = 0;
    const counted: SideEffect = async () => (ran++, null);
    await runLoadEffects({ ...saf, effects: { ensureRmes: counted }, attempted: new Set() });
    expect(ran).toBe(1);
  });

  it("gap 8: an effect does not run while a part it decides from is shown as an earlier load read it", async () => {
    const never: SideEffect = async () => {
      throw new Error("must not run");
    };
    const saf = await ready("saf");
    const old = { ...saf.facts, kept: { review: "2026-10-24T07:55:00Z" } };
    const out = await runLoadEffects({ ...saf, facts: old, effects: { ensureRmes: never }, attempted: new Set() });
    expect(out.map((o) => [o.effect, o.note])).toEqual([["ensureRmes", true]]);
    expect(out[0]!.result.message).toBe(keptBlockText("ensureRmes", "SAF", ["review"]));
    expect(effectBlocked("ensureRmes", saf.acting, saf.facts.reads, { note: "x" })).toBeUndefined(); // not what it decides from
    expect(effectBlocked("ensureRmes", saf.acting, saf.facts.reads, { review: "x", rmesSAF: "x" })).toBe(keptBlockText("ensureRmes", "SAF", ["review", "rmesSAF"]));
    expect((await runLoadEffects({ ...saf, facts: { ...saf.facts, kept: { rmesSAF: "x" } }, effects: { ensureRmes: never }, attempted: new Set() })).map((o) => o.note)).toEqual([true]);
    expect(effectBlocked("ensureRmes", saf.acting, saf.facts.reads, { rmesREG: "x" })).toBeUndefined();
  });

  it("M1: a note from an effect (nothing written) is recorded once and leaves the case eligible", async () => {
    const { state, ctx, acting, facts } = await ready("saf");
    let calls = 0;
    const note: SideEffect = async () => (calls++, { ok: true, note: true, message: "waits for the case", handoffs: [], warnings: [] });
    const attempted = new Set<string>();
    const first = await runLoadEffects({ acting, state, ctx, effects: { ensureRmes: note }, attempted, facts });
    expect(first).toEqual([{ effect: "ensureRmes", caseId: "ZZT-0003", note: true, result: { ok: true, message: "waits for the case", handoffs: [], warnings: [] } }]);
    expect(await runLoadEffects({ acting, state, ctx, effects: { ensureRmes: note }, attempted, facts })).toEqual([]);
    expect(calls).toBe(2);
  });

  it("M1: the user's own unsent review draft counts as existing (no twin)", async () => {
    const { client, identity, acting } = setup("rmm", { admin: true });
    const { id } = await client.create("review", { Review_Key: "ZZT-0001-SAF-1", Case_Code: "ZZT-0001", Review_Dept: "SAF", Round_No: 1 });
    const snap = await loadSnapshot(client, identity, acting);
    const view = viewOf(snap, identity, acting);
    expect(view.drafts.map((d) => d.itemId)).toEqual([id]);
    expect([...(view.mapped.index.ownDraftKeys ?? [])]).toEqual(["review|ZZT-0001-SAF-1"]);
  });

  it("runs nothing for other personas or outside the app", async () => {
    const never: SideEffect = async () => {
      throw new Error("must not run");
    };
    const qm = await ready("qm");
    expect(effectsFor("qm")).toEqual([]);
    expect(await runLoadEffects({ ...qm, effects: { ensureRmes: never }, attempted: new Set() })).toEqual([]);
    const rmm = await ready("rmm");
    expect(await runLoadEffects({ ...rmm, effects: { ensureRmes: never }, attempted: new Set() })).toEqual([]);
    const outside = await ready("saf", false);
    expect(await runLoadEffects({ ...outside, effects: { ensureRmes: never }, attempted: new Set() })).toEqual([]);
    // only cases in review qualify
    const none = { ...outside.state, cases: outside.state.cases.filter((c) => c.phase !== "review") } as AppState;
    expect(await runLoadEffects({ ...outside, ctx: { ...outside.ctx, containerOk: true }, state: none, effects: { ensureRmes: never }, attempted: new Set() })).toEqual([]);
  });
});

describe("caseBannerOf", () => {
  it("gives only the reason (the shell writes the sentence), with the fallback reason when none was recorded", async () => {
    const { client, identity, acting } = setup("rmm");
    const snap = await loadSnapshot(client, identity, acting);
    const view = viewOf(snap, identity, acting);
    const bare = { unreadableCases: {} };
    expect(caseBannerOf(view.mapped.index, bare, "ZZT-0001")).toBe(NO_READ_ROUTE);
    expect(caseBannerOf(view.mapped.index, snap, "ZZT-0001")).not.toMatch(/Kissflow did not let/);
  });
});

describe("forms with child tables (Kissflow's list leaves them out; proven live 20 Oct, Thomas's supplier report)", () => {
  it("the Business administrator's load has every supplier's contacts, and the mapped suppliers list them", async () => {
    const { identity, acting, client } = setup("admin");
    const snap = await loadSnapshot(client, identity, acting);
    expect(snap.forms.supplier.length).toBeGreaterThan(0);
    for (const row of snap.forms.supplier) expect(Array.isArray((row as Record<string, unknown>)["Table::Contacts"]), row._id).toBe(true);
    expect(callsOf(client, "formGet", "supplier").length).toBe(snap.forms.supplier.length);
    const { mapped } = viewOf(snap, identity, acting);
    expect(mapped.state.suppliers.every((s) => s.contactIds.length > 0)).toBe(true);
  });

  it("a Safety reviewer's load has its RMES record's criteria", async () => {
    const { identity, acting, client } = setup("saf");
    const snap = await loadSnapshot(client, identity, acting);
    expect(snap.forms.rmesSAF.length).toBeGreaterThan(0);
    for (const row of snap.forms.rmesSAF) expect(Array.isArray((row as Record<string, unknown>)["Table::Safety_Criteria"]), row._id).toBe(true);
  });

  it("a failed full read keeps the list row and says so", async () => {
    const { identity, acting, client } = setup("admin", { refuse: { formGet: (c) => (c.flow === "supplier" ? "no permission" : undefined) } });
    const snap = await loadSnapshot(client, identity, acting);
    expect(snap.forms.supplier.length).toBeGreaterThan(0);
    expect(snap.warnings.some((w) => /contacts\) could not be read/.test(w))).toBe(true);
  });
});

describe("saving like the portal: what the store shows between loads (APP-SAVING-GAPS, 20 Oct)", () => {
  const LISTS = new Set(["formList", "myTasks", "myItems", "adminList"]);
  const TIMEOUT = "Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through.";

  it("gap 1: a saved RMES result and a new note show from the writers' read-backs, with no list read again", async () => {
    const { client, identity, acting } = setup("saf");
    const snap = await loadSnapshot(client, identity, acting);
    const view = viewOf(snap, identity, acting);
    const ctx: WriteCtx = { client, identity, acting, index: view.mapped.index, webhooks: {}, now: () => "2026-10-24T08:00:00Z", containerOk: true };
    const prev = view.mapped.state;
    const cr = prev.cases.find((c) => c.id === "ZZT-0003")!.rmes!.criteria.find((x) => x.dept === "SAF" && !x.result)!;
    const next = A.recordCriterion(prev, acting.me.id, "ZZT-0003", cr.id, "available", "Within the BDF limits.");
    const from = client.calls.length;
    const r = await liveWriters.recordCriterion!(ctx, prev, next, ["ZZT-0003", cr.id, "available", "Within the BDF limits."]);
    expect(r).toMatchObject({ ok: true, moved: false });
    const shown = withSaved(snap, r.saved ?? [], r.auditRow);
    const after = viewOf(shown, identity, acting).mapped.state;
    expect(after.cases.find((c) => c.id === "ZZT-0003")!.rmes!.criteria.find((x) => x.id === cr.id)).toMatchObject({ result: "available", comment: "Within the BDF limits." });
    expect(shown.forms.audit.length).toBe(snap.forms.audit.length + 1);
    // the note: a NEW form item and its audit row, appended
    const n0 = viewOf(shown, identity, acting).mapped;
    const withNote = A.addInternalNote(n0.state, acting.me.id, "ZZT-0003", "Checked the SDS against the CoA.");
    const r2 = await liveWriters.addInternalNote!({ ...ctx, index: n0.index }, n0.state, withNote, ["ZZT-0003", "Checked the SDS against the CoA."]);
    expect(r2).toMatchObject({ ok: true, moved: false });
    const shown2 = withSaved(shown, r2.saved ?? [], r2.auditRow);
    expect(shown2.forms.note.length).toBe(snap.forms.note.length + 1);
    expect(viewOf(shown2, identity, acting).mapped.state.cases.find((c) => c.id === "ZZT-0003")!.internalNotes.some((x) => x.text === "Checked the SDS against the CoA.")).toBe(true);
    expect(client.calls.slice(from).filter((c) => LISTS.has(c.m))).toEqual([]);
  });

  it("gap 1: a read-back replaces its row by _id and keeps the row's own step; an item the load did not have is appended without one", () => {
    const base: LiveSnapshot = { loadedAt: "2026-10-24T08:00:00Z", items: { case: [], review: [{ _id: "PkRev1", _activity_instance_id: "ActRev1", Review_Key: "K", RMES_Decision: "" }], op: [] }, forms: { audit: [], config: [], note: [], rmesSAF: [], rmesREG: [], supplier: [] }, tasks: [], unreadableCases: {}, sparse: ["PkRev1"], reads: [], warnings: [] };
    const out = withSaved(base, [{ flow: "review", item: { _id: "PkRev1", _activity_instance_id: "ActOther", RMES_Decision: "Approved" } }, { flow: "review", item: { _id: "PkRev2", _activity_instance_id: "ActX" } }], { _id: "PkEv1" });
    expect(out.items.review).toEqual([{ _id: "PkRev1", _activity_instance_id: "ActRev1", Review_Key: "K", RMES_Decision: "Approved" }, { _id: "PkRev2" }]);
    expect(out.forms.audit).toEqual([{ _id: "PkEv1" }]);
    expect(out.sparse).toBeUndefined(); // read back in full
    expect(withSaved(base, [])).toBe(base);
  });

  it("gap 8: a timeout or a 429 of the admin rung is tried again on the next load; a refusal is remembered", async () => {
    let failing: string | undefined = TIMEOUT;
    const { client, identity, acting } = setup("rmm", { admin: true, refuse: { adminList: (c) => (c.flow === "review" ? failing : undefined) } });
    await loadSnapshot(client, identity, acting);
    failing = "429 Too Many Requests";
    const second = await loadSnapshot(client, identity, acting);
    expect(second.reads.find((r) => r.flow === "review" && r.rung === "admin")).toMatchObject({ ok: false, error: "429 Too Many Requests" });
    failing = undefined;
    const third = await loadSnapshot(client, identity, acting);
    expect(rungs(third, "review")[0]).toBe("admin:ok");
    expect(callsOf(client, "adminList", "review")).toHaveLength(3);
    failing = FAKE_ERRORS.admin;
    await loadSnapshot(client, identity, acting);
    const fifth = await loadSnapshot(client, identity, acting);
    expect(fifth.reads.find((r) => r.flow === "review" && r.rung === "admin")?.error).toBe(REFUSED_EARLIER);
    expect(callsOf(client, "adminList", "review")).toHaveLength(4);
    expect([TIMEOUT, "429 Too Many Requests", "Failed to fetch"].map(isRefusal)).toEqual([false, false, false]);
    expect([FAKE_ERRORS.admin, "KISSFLOW_ERROR_050302 You don't have permission to access this item.", FAKE_ERRORS.fields("Fl", ["X"])].map(isRefusal)).toEqual([true, true, true]);
    // a 404 is how Kissflow answers a role without the list's route (DESIGN R-1): remembered, not asked on every load
    expect(["404 Not Found", "KISSFLOW_ERROR_01015 Item not found"].map(isRefusal)).toEqual([true, true]);
  });

  it("gap 8: a form or a flow that could not be read again keeps the last load's data, with a warning, until it answers", async () => {
    let failing = false;
    const { client, identity, acting } = setup("saf", { refuse: { formList: (c) => (failing && c.flow === "rmesSAF" ? TIMEOUT : undefined), myTasks: (c) => (failing && c.flow === "op" ? TIMEOUT : undefined) } });
    const first = await loadSnapshot(client, identity, acting);
    const rmesOf = (s: LiveSnapshot) => viewOf(s, identity, acting).mapped.state.cases.find((c) => c.id === "ZZT-0003")!.rmes;
    expect(rmesOf(first)).toBeDefined();
    const heldOps = first.tasks.filter((t) => t.flow === "op");
    expect(heldOps.length).toBeGreaterThan(0);
    failing = true;
    const second = await loadSnapshot(client, identity, acting);
    // before: the RMES record vanished (its criteria rows and their unsaved comments with it) and the held points lost
    // their tasks
    expect(rmesOf(second)).toBeUndefined();
    expect(second.tasks.filter((t) => t.flow === "op")).toEqual([]);
    const kept = keepUnread(first, second);
    expect(kept.forms.rmesSAF).toBe(first.forms.rmesSAF);
    expect(rmesOf(kept)).toEqual(rmesOf(first));
    expect(kept.items.op).toEqual(first.items.op); // the task lists failed: the last load's points, with their steps
    expect(kept.tasks.filter((t) => t.flow === "op")).toEqual(heldOps);
    expect(kept.items.review).toBe(second.items.review); // what answered is the new read
    expect(kept.kept).toEqual({ rmesSAF: first.loadedAt, op: first.loadedAt });
    expect(kept.warnings).toEqual(expect.arrayContaining([keptText("rmesSAF", first.loadedAt), keptText("op", first.loadedAt)]));
    expect(keptText("op", "2026-10-24T08:05:00Z")).toMatch(/^CIQ Open Point shown as of \d{2}:\d{2}: it could not be read again\.$/);
    // failing again: still the first load's data and time
    const third = keepUnread(kept, await loadSnapshot(client, identity, acting));
    expect(third.forms.rmesSAF).toBe(first.forms.rmesSAF);
    expect(third.kept).toEqual({ rmesSAF: first.loadedAt, op: first.loadedAt });
    // answered again: the new read, no warning
    failing = false;
    const fourth = keepUnread(third, await loadSnapshot(client, identity, acting));
    expect(fourth.kept).toBeUndefined();
    expect(fourth.warnings.some((w) => /shown as of/.test(w))).toBe(false);
    // a part that never answered keeps nothing (a refused form, the normal admin refusal)
    expect(keepUnread(undefined, second)).toBe(second);
    expect(keepUnread(second, second).kept).toBeUndefined();
  });

  it("gap 8: a failed My items list keeps nothing: the task lists and the history give that flow's data now", async () => {
    let failing = false;
    const { client, identity, acting } = setup("rmm", { refuse: { myItems: (c) => (failing && c.flow === "op" ? TIMEOUT : undefined) } });
    const first = await loadSnapshot(client, identity, acting);
    const held = first.tasks.find((t) => t.flow === "op")!;
    expect(held).toBeDefined();
    client.set(held.itemId, { Question_Text: "CHANGED SINCE THE FIRST LOAD" });
    failing = true;
    const second = await loadSnapshot(client, identity, acting);
    expect(second.reads.find((r) => r.flow === "op" && r.rung === "mine")).toMatchObject({ ok: false });
    const now = keepUnread(first, second);
    expect(now.kept).toBeUndefined();
    expect(now.items.op.find((x) => x._id === held.itemId)).toMatchObject({ Question_Text: "CHANGED SINCE THE FIRST LOAD", _activity_instance_id: held.act });
    expect(now.tasks).toBe(second.tasks);
  });

  it("gap 8: only the admin list failed: this load's items and held steps win, the items it no longer has come from the last load without a step", async () => {
    let failing = false;
    const { client, identity, acting } = setup("rmm", { admin: true, refuse: { adminList: (c) => (failing && c.flow === "op" ? TIMEOUT : undefined) } });
    const first = await loadSnapshot(client, identity, acting);
    const held = first.tasks.find((t) => t.flow === "op")!;
    client.set(held.itemId, { Question_Text: "CHANGED SINCE THE FIRST LOAD" });
    failing = true;
    const second = await loadSnapshot(client, identity, acting);
    const now = keepUnread(first, second);
    expect(now.kept).toEqual({ op: first.loadedAt });
    expect(now.items.op.find((x) => x._id === held.itemId)).toMatchObject({ Question_Text: "CHANGED SINCE THE FIRST LOAD", _activity_instance_id: held.act });
    const only = first.items.op.filter((x) => !second.items.op.some((y) => y._id === x._id));
    expect(only.length).toBeGreaterThan(0); // the points only the admin list gave
    for (const it of only) expect(now.items.op.find((x) => x._id === it._id)).toEqual(Object.fromEntries(Object.entries(it).filter(([k]) => k !== "_activity_instance_id")));
    expect(now.tasks.filter((t) => t.flow === "op")).toEqual(second.tasks.filter((t) => t.flow === "op"));
  });

  it("gap 8: a record whose full read failed keeps the last load's criteria and findings, with a warning, until a read or a save reads them again", async () => {
    let failing = false;
    const { client, identity, acting } = setup("saf", { refuse: { formGet: (c) => (failing && c.flow === "rmesSAF" ? TIMEOUT : undefined) } });
    const first = await loadSnapshot(client, identity, acting);
    const rmesOf = (s: LiveSnapshot) => viewOf(s, identity, acting).mapped.state.cases.find((c) => c.id === "ZZT-0003")!.rmes;
    const criteria = rmesOf(first)!.criteria;
    expect(criteria.length).toBeGreaterThan(0);
    failing = true;
    const second = await loadSnapshot(client, identity, acting);
    const row = second.forms.rmesSAF.find((r) => r.Case_Code === "ZZT-0003")!;
    expect(second.unreadRows).toEqual({ rmesSAF: second.forms.rmesSAF.map((r) => r._id) });
    expect(rmesOf(second)?.criteria ?? []).toEqual([]); // before: the criteria rows (and their unsaved comments) vanished
    const now = keepUnread(first, second);
    expect(rmesOf(now)!.criteria).toEqual(criteria);
    const all = Object.fromEntries(second.forms.rmesSAF.map((r) => [r._id, first.loadedAt]));
    expect(now.keptRows).toEqual(all);
    expect(now.kept).toBeUndefined(); // the form list answered: the rest of the form is this load's
    expect(now.warnings).toContain(keptRowText("rmesSAF", row._id, first.loadedAt));
    // Complete review can't decide from it (gap 9), nor from a part kept from an earlier load
    expect(notReadAgain(now, "ZZT-0003")).toBe(NOT_READ_AGAIN(["the CIQ RMES Safety record of ZZT-0003"]));
    expect(notReadAgain(now, "ZZT-0001")).toBeUndefined();
    expect(notReadAgain({ ...first, kept: { op: first.loadedAt, note: first.loadedAt } }, "ZZT-0003")).toBe(NOT_READ_AGAIN(["CIQ Open Point"]));
    expect(notReadAgain(first, "ZZT-0003")).toBeUndefined();
    // still failing: the first load's rows and time
    const third = keepUnread(now, await loadSnapshot(client, identity, acting));
    expect(third.keptRows).toEqual(all);
    expect(rmesOf(third)!.criteria).toEqual(criteria);
    // a save's read-back of the record reads its rows again
    const back = { ...structuredClone(client.find(row._id)!.item) };
    const saved = withSaved(third, [{ flow: "rmesSAF", item: back }]);
    expect(saved.unreadRows?.rmesSAF).not.toContain(row._id);
    expect(saved.keptRows?.[row._id]).toBeUndefined();
    expect(notReadAgain(saved, "ZZT-0003")).toBeUndefined();
  });
});

describe("FE-CLEANUP: what a load tells production (22 Oct)", () => {
  const bare = (items: LiveSnapshot["items"], tasks: LiveSnapshot["tasks"]): LiveSnapshot => ({ loadedAt: "2026-10-24T08:00:00Z", items, forms: { audit: [], config: [], note: [], rmesSAF: [], rmesREG: [], supplier: [] }, tasks, unreadableCases: {}, reads: [], warnings: [] });

  it("C23: an unsent draft whose key could not be read is named by its kind in prod, by its Kissflow item id in dev", () => {
    const snap = bare({ case: [{ _id: "PkCase9", _status: "Draft" }], review: [{ _id: "PkRev9", _status: "Draft" }], op: [{ _id: "PkOp9", _status: "Draft", Case_Code: "ZZT-0003" }] }, [
      { flow: "case", itemId: "PkCase9", act: "A1", activityId: STEPS.case.start },
      { flow: "review", itemId: "PkRev9", act: "A2", activityId: STEPS.review.start },
      { flow: "op", itemId: "PkOp9", act: "A3", activityId: STEPS.op.start },
    ]);
    expect(draftsOf(snap).map((d) => d.label)).toEqual(["New case PkCase9", "Review PkRev9", "Open point PkOp9 on ZZT-0003"]);
    expect(draftsOf(snap, "prod").map((d) => d.label)).toEqual(["New case", "Review", "Open point on ZZT-0003"]);
    // a draft with its key: the same label in both
    const keyed = bare({ case: [{ _id: "PkCase9", _status: "Draft", Case_Code: "ZZT-0009", Trade_Name: "OLIVIA" }], review: [], op: [] }, [{ flow: "case", itemId: "PkCase9", act: "A1", activityId: STEPS.case.start }]);
    expect(draftsOf(keyed, "prod")[0]!.label).toBe("New case ZZT-0009 · OLIVIA");
    expect(draftsOf(keyed)[0]!.label).toBe("New case ZZT-0009 · OLIVIA");
  });

  it("C1: a part shown from an earlier read gives the oldest such time; a fresh load none", () => {
    expect(keptSince({})).toBeUndefined();
    expect(keptSince({ kept: { op: "2026-10-24T08:00:00Z", audit: "2026-10-24T07:00:00Z" }, keptRows: { PkRmes1: "2026-10-24T07:30:00Z" } })).toBe("2026-10-24T07:00:00Z");
  });

  it("B3-B10: the mapper's notes travel apart from the read failures (viewOf)", async () => {
    const s = setup("rmm", { viewerRead: true });
    const snap = await loadSnapshot(s.client, s.identity, s.acting);
    const view = viewOf(snap, s.identity, s.acting, "prod");
    expect(view.notes).toContain('1 supplier has the kind "Trader", shown as distributor.');
    expect(view.warnings.some((w) => /Trader/.test(w))).toBe(false);
    expect(view.dropped).toEqual([]);
  });
});
