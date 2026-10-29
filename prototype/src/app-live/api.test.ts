// Owner D: the live StoreApi (DESIGN §6 store flow, §7.1) on B's mapped fixtures, with recording deps and stub writers:
// no writer → "not available"; outside the app → danger and nothing saved; C's guard → its reason; a domain refusal →
// the domain's own toast, no optimistic state, no write; an accepted action → optimistic state, one job on the chain
// and the success value at once; the job's text (domain toast, store text, pending hand-off) and failures; the methods
// the live app does not offer; every StoreApi member present. The store's write jobs (enqueueJob) and the saving rules
// of APP-SAVING-GAPS (20 Oct): read-backs instead of a reload, no job sent behind a failed one, the click's write
// context, the outcome for the screens that wait, Complete review on fresh data.
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { validateDraft } from "@/domain/configActions";
import type { AppState, InternalPersonaId, Toast } from "@/domain/types";
import type { StoreApi } from "@/store/store";
import { ASK_RMM, DRAFT_SAVED, NA, NOT_HELD, NOT_SENT, WHAT, createLiveApi, enqueueJob, failedResult, finalize, handoffProblemText, mailProblemText, newWriteChain, reviewGateCheck, type ApiDeps, type Fresh, type JobDeps } from "./api";
import { NOT_READ_AGAIN } from "./load";
import { STALE_TEXT } from "./write/verify";
import { createFakeClient } from "./kf/fakeClient";
import { AppError, NOT_IN_APP } from "./kf/client";
import { DEV_ACCOUNT } from "./env";
import { WIRING, webhooksFor } from "./LiveAppStore";
import { toAppState } from "./map/toAppState";
import type { HookBase } from "./write/handoff";
import { fixtureIdentity, fixtureActing, fixtureSnapshot } from "./testing/rawFixtures";
import type { LiveSnapshot, LiveWriters, WritableMethod, WriteCtx, WriteResult, Writer } from "./types";
import { NOT_READ_AGAIN_PLAIN } from "./userText";

interface Recorded {
  toasts: { tone: Toast["tone"]; text: string }[];
  optimistic: AppState[];
  jobs: { label: string; job: () => Promise<WriteResult> }[];
  reloads: number;
  personas: InternalPersonaId[];
  dismissed: string[];
}

function harness(o: { persona?: InternalPersonaId; held?: InternalPersonaId[]; containerOk?: boolean; writers?: LiveWriters; guard?: ApiDeps["guard"]; fresh?: ApiDeps["fresh"] } = {}) {
  const persona = o.persona ?? "rmm";
  const identity = fixtureIdentity(o.held ?? [persona]);
  const acting = fixtureActing(identity, persona);
  const mapped = toAppState({ snap: fixtureSnapshot(persona, "full"), identity, acting });
  let current: AppState = mapped.state;
  const rec: Recorded = { toasts: [], optimistic: [], jobs: [], reloads: 0, personas: [], dismissed: [] };
  const ctx: WriteCtx = {
    client: createFakeClient({ items: {}, me: { _id: identity.kfUserId, Name: identity.name } }),
    identity,
    acting,
    index: mapped.index,
    webhooks: {},
    now: () => "2026-10-24T08:00:00Z",
    containerOk: o.containerOk ?? true,
  };
  /** What deps.ctx() answers now (a test replaces it, as a reload would). */
  let ctxNow = ctx;
  const deps: ApiDeps = {
    state: () => current,
    acting,
    ctx: () => ctxNow,
    writers: o.writers ?? {},
    toast: (tone, text) => void rec.toasts.push({ tone, text }),
    dismiss: (id) => void rec.dismissed.push(id),
    optimistic: (next) => {
      rec.optimistic.push(next);
      current = next;
    },
    // the job runs when the test calls it; the method's promise settles with that run's result
    enqueue: (label, job) => {
      let settle!: (r: WriteResult) => void;
      const done = new Promise<WriteResult>((r) => (settle = r));
      rec.jobs.push({
        label,
        job: async () => {
          const r = await job();
          settle(r);
          return r;
        },
      });
      return done;
    },
    fresh: o.fresh ?? (async () => ({ state: { ...current, toasts: [] }, ctx: ctxNow })),
    reload: () => void rec.reloads++,
    setPersona: (id) => void rec.personas.push(id),
    ...(o.guard ? { guard: o.guard } : {}),
  };
  return { api: createLiveApi(deps), rec, ctx, state: () => current, initial: mapped.state, setCtx: (c: WriteCtx) => void (ctxNow = c) };
}

/** A writer that records what it got and answers `result`. */
function stub(result: Partial<WriteResult> = {}) {
  const got: { ctx: WriteCtx; prev: AppState; next: AppState; args: unknown[] }[] = [];
  const writer: Writer = async (ctx, prev, next, args) => {
    got.push({ ctx, prev, next, args });
    return { ok: true, handoffs: [], warnings: [], ...result };
  };
  return { writer, got };
}
const ALL_WRITERS = (w: Writer): LiveWriters => Object.fromEntries((Object.keys(WHAT) as WritableMethod[]).map((m) => [m, w]));

/** An open point of ZZT-0003 the acting user raised (RMM's own). */
const ownOpenPoint = (s: AppState, by: string) => s.cases.find((c) => c.id === "ZZT-0003")!.openPoints.find((p) => p.status !== "closed" && p.createdBy === by)!;

describe("createLiveApi: the store flow", () => {
  it("has every StoreApi member", () => {
    const { api } = harness();
    const members = {
      state: 1, persona: 1, me: 1, setPersona: 1, reset: 1, notify: 1, dismissToast: 1, createCase: 1, updateCaseContacts: 1, saveConfig: 1, submitMetadata: 1, extendScope: 1,
      setAnswer: 1, setComponents: 1, setJustification: 1, uploadDocument: 1, confirmCompleteness: 1, raiseOpenPoint: 1, supplierRespond: 1, reviewResponse: 1, editOpenPoint: 1,
      closeOpenPoint: 1, rmesDecision: 1, completeReview: 1, reopenReview: 1, reassignReview: 1,
      finalRelease: 1, cancelCase: 1, reactivateCase: 1, reportChange: 1, addInternalNote: 1, addSupplier: 1, updateSupplier: 1, addContact: 1, updateContact: 1,
      setContactActive: 1, markMailRead: 1, markAllMailsRead: 1, runReminders: 1, publishTemplateV2: 1, setOwnership: 1, updateReminder: 1, createDraft: 1, discardDraft: 1,
      upsertRule: 1, deleteRule: 1, upsertSection: 1, retireSection: 1, restoreSection: 1, upsertField: 1, moveField: 1, removeField: 1, validateDraft: 1, publishDraft: 1,
    } satisfies Record<keyof StoreApi, 1>;
    for (const k of Object.keys(members) as (keyof StoreApi)[]) expect(api[k], k).toBeDefined();
    expect(api.persona.userId).toBe(api.me.id);
    expect(api.state.personaId).toBe("rmm");
  });

  it("says 'not available' when owner C has no writer for a method, and changes nothing", () => {
    const { api, rec, state } = harness({ writers: {} });
    const before = state();
    const op = ownOpenPoint(before, before.users[0]!.id);
    expect(api.closeOpenPoint("ZZT-0003", op.id, "Not needed any more")).toBe(false);
    expect(rec.toasts).toEqual([{ tone: "warning", text: NA(WHAT.closeOpenPoint) }]);
    expect(rec.optimistic).toHaveLength(0);
    expect(rec.jobs).toHaveLength(0);
  });

  it("refuses an accepted action outside CIQ_Digital_A00: nothing is saved", () => {
    const s = stub();
    const { api, rec } = harness({ writers: ALL_WRITERS(s.writer), containerOk: false });
    api.addInternalNote("ZZT-0003", "Checked the SDS.");
    expect(rec.toasts).toEqual([{ tone: "danger", text: NOT_IN_APP }]);
    expect(rec.optimistic).toHaveLength(0);
    expect(rec.jobs).toHaveLength(0);
  });

  it("shows C's live guard reason and writes nothing", () => {
    const s = stub();
    const seen: unknown[][] = [];
    const { api, rec } = harness({
      writers: ALL_WRITERS(s.writer),
      guard: (method, ctx, state, args) => {
        seen.push([method, ctx.containerOk, state.cases.length, args]);
        return method === "addInternalNote" ? "The case item id is not known yet; reload." : null;
      },
    });
    api.addInternalNote("ZZT-0003", "Checked the SDS.", "K2.1");
    expect(seen).toEqual([["addInternalNote", true, 3, ["ZZT-0003", "Checked the SDS.", "K2.1"]]]);
    expect(rec.toasts).toEqual([{ tone: "danger", text: "The case item id is not known yet; reload." }]);
    expect(rec.jobs).toHaveLength(0);
  });

  it("copies the domain's refusal toast, keeps the state and returns the refused value", () => {
    const s = stub();
    const { api, rec } = harness({ writers: ALL_WRITERS(s.writer) });
    api.completeReview("ZZT-0003", "QM");
    expect(rec.toasts).toEqual([{ tone: "danger", text: "Only QM can act on the QM review." }]);
    expect(api.editOpenPoint("ZZT-0003", "OP-NOPE", { question: "?" })).toBe(false);
    expect(rec.toasts.at(-1)).toEqual({ tone: "danger", text: "This open point no longer exists." });
    expect(rec.optimistic).toHaveLength(0);
    expect(rec.jobs).toHaveLength(0);
    expect(s.got).toHaveLength(0);
  });

  it("m7: the domain's refusal comes first (it says what to change); the live guard sees only accepted actions", () => {
    const s = stub();
    const seen: string[] = [];
    const { api, rec } = harness({ writers: ALL_WRITERS(s.writer), guard: (method) => (seen.push(method), "The case item id is not known yet; reload.") });
    api.cancelCase("ZZT-0003", "  ");
    expect(rec.toasts).toEqual([{ tone: "danger", text: "A justification is required to cancel." }]);
    expect(seen).toEqual([]);
    // accepted by the domain: now the guard decides
    api.cancelCase("ZZT-0003", "Material discontinued.");
    expect(seen).toEqual(["cancelCase"]);
    expect(rec.toasts.at(-1)).toEqual({ tone: "danger", text: "The case item id is not known yet; reload." });
    expect(rec.optimistic).toHaveLength(0);
    expect(rec.jobs).toHaveLength(0);
  });

  it("m9: a cancellation says the store's own text, not the domain's promise of a reactivation (not available live)", async () => {
    const s = stub();
    const { api, rec } = harness({ writers: ALL_WRITERS(s.writer) });
    api.cancelCase("ZZT-0003", "Material discontinued.");
    const r = await rec.jobs[0]!.job();
    expect(r.message).toBe("ZZT-0003 cancelled.");
    expect(r.message).not.toMatch(/reactivat/i);
  });

  it("commits an accepted action at once (mails and toasts stripped), enqueues ONE writer job and returns its value", async () => {
    const s = stub({ handoffs: [{ code: "history.updated", status: "pending" }] });
    const { api, rec, initial } = harness({ writers: ALL_WRITERS(s.writer) });
    const me = initial.users[0]!.id;
    const op = ownOpenPoint(initial, me);
    expect(api.closeOpenPoint("ZZT-0003", op.id, "Not needed any more")).toBe(true);
    expect(rec.toasts).toHaveLength(0); // the success toast comes when the write settles
    expect(rec.optimistic).toHaveLength(1);
    const next = rec.optimistic[0]!;
    expect(next.toasts).toEqual([]);
    expect(next.mails).toEqual([]);
    expect(next.cases.find((c) => c.id === "ZZT-0003")!.openPoints.find((p) => p.id === op.id)).toMatchObject({ status: "closed", outcome: "withdrawn", closedBy: me });
    expect(rec.jobs.map((j) => j.label)).toEqual(["closeOpenPoint"]);
    const r = await rec.jobs[0]!.job();
    expect(s.got).toHaveLength(1);
    expect(s.got[0]!.args).toEqual(["ZZT-0003", op.id, "Not needed any more"]);
    expect(s.got[0]!.prev.cases.find((c) => c.id === "ZZT-0003")!.openPoints.find((p) => p.id === op.id)!.status).not.toBe("closed");
    expect(s.got[0]!.next.cases.find((c) => c.id === "ZZT-0003")!.openPoints.find((p) => p.id === op.id)!.status).toBe("closed");
    // the domain's own toast; a pending hand-off adds nothing (A10: no system passes it on), the result keeps it
    expect(r).toMatchObject({ ok: true, tone: "success", message: "Open point closed. The supplier is told no answer is needed." });
    expect(r.message).not.toMatch(/Beiersdorf's system/);
  });

  it("a second action in the same tick runs on the first one's optimistic state", () => {
    const s = stub();
    const { api, rec } = harness({ writers: ALL_WRITERS(s.writer) });
    api.addInternalNote("ZZT-0003", "First note.");
    api.addInternalNote("ZZT-0003", "Second note.");
    const notes = rec.optimistic[1]!.cases.find((c) => c.id === "ZZT-0003")!.internalNotes.map((n) => n.text);
    expect(notes.slice(-2)).toEqual(["First note.", "Second note."]);
    expect(rec.jobs).toHaveLength(2);
  });

  it("uses the store's text when the domain gives none (notes: the writer's mention toast wins, 27 Oct)", async () => {
    const s = stub();
    const { api, rec, initial } = harness({ writers: ALL_WRITERS(s.writer) });
    api.addInternalNote("ZZT-0003", "Checked the SDS.");
    expect((await rec.jobs[0]!.job()).message).toBe("Note added.");
    const colleague = initial.users.find((u) => u.side === "internal" && u.dept === "QM" && u.active !== false)!;
    api.addInternalNote("ZZT-0003", `@${colleague.name} please look at K2.1.`);
    // no "not live yet" any more: a writer without a message gets the plain text, the real writer says who was mailed
    expect((await rec.jobs[1]!.job()).message).toBe("Note added.");
  });

  it("shows the new case at once and gives its id once the write settled (gap 6), with the store text", async () => {
    const s = stub();
    const { api, rec, initial } = harness({ writers: ALL_WRITERS(s.writer) });
    const sup = initial.suppliers.find((x) => x.active !== false && x.contactIds.length)!;
    const contact = initial.users.find((u) => u.id === sup.contactIds[0])!;
    const due = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
    const pending = api.createCase({ materialName: "Test emollient", inci: "Caprylic/Capric Triglyceride", materialNo: "ZZT-M-0042", supplierId: sup.id, contactIds: [contact.id], markets: ["EU"], dueDate: due, priority: "normal" });
    const id = rec.optimistic[0]!.cases.find((c) => !initial.cases.some((x) => x.id === c.id))!.id;
    expect(id).toMatch(/\S/);
    expect((await rec.jobs[0]!.job()).message).toBe(`${id} created and the supplier contacts invited.`);
    expect(await pending).toBe(id);
    // refused: no contacts → "" and the domain's reason
    expect(await api.createCase({ materialName: "", inci: "", materialNo: "", supplierId: sup.id, contactIds: [], markets: [], dueDate: due, priority: "normal" })).toBe("");
    expect(rec.toasts.at(-1)?.tone).toBe("danger");
    expect(rec.jobs).toHaveLength(1);
  });

  it("turns a writer failure into 'Not saved' and keeps a writer's own message", async () => {
    const boom: Writer = async () => {
      throw new Error("KISSFLOW_ERROR_050313 You don't have permission to update the following fields");
    };
    const h = harness({ writers: ALL_WRITERS(boom) });
    h.api.addInternalNote("ZZT-0003", "Checked the SDS.");
    expect(await h.rec.jobs[0]!.job()).toEqual({ ok: false, tone: "danger", message: "Not saved: KISSFLOW_ERROR_050313 You don't have permission to update the following fields", handoffs: [], warnings: [] });
    const gate = stub({ ok: false, message: "Kissflow's review gate is not OK yet; nothing was completed." });
    const g = harness({ writers: ALL_WRITERS(gate.writer) });
    g.api.addInternalNote("ZZT-0003", "Checked the SDS.");
    expect(await g.rec.jobs[0]!.job()).toMatchObject({ ok: false, tone: "danger", message: "Kissflow's review gate is not OK yet; nothing was completed." });
  });

  it("lets only RMM reopen a review in this version", () => {
    const s = stub();
    const qm = harness({ persona: "qm", writers: ALL_WRITERS(s.writer) });
    qm.api.reopenReview("ZZT-0003", "QM", "The supplier changed K2.1.");
    expect(qm.rec.toasts).toEqual([{ tone: "warning", text: ASK_RMM }]);
    expect(qm.rec.jobs).toHaveLength(0);
  });

  it("runs the supplier master as the Business administrator (u-admin alias)", async () => {
    const s = stub();
    const { api, rec, initial } = harness({ persona: "admin", writers: ALL_WRITERS(s.writer) });
    expect(api.me.id).toBe("u-admin");
    const sup = initial.suppliers.find((x) => x.contactIds.length)!;
    const id = api.addContact(sup.id, { name: "Pia Lorenz", email: "pia.lorenz@solvaro.example", title: "Regulatory officer" });
    expect(id).toBeTruthy();
    expect(rec.jobs.map((j) => j.label)).toEqual(["addContact"]);
    expect((await rec.jobs[0]!.job()).message).toBe(`Pia Lorenz added to ${sup.name}.`);
    // an RMM may not: the domain says why
    const rmm = harness({ writers: ALL_WRITERS(s.writer) });
    expect(rmm.api.addContact(sup.id, { name: "Pia Lorenz", email: "pia.lorenz@solvaro.example" })).toBeNull();
    expect(rmm.rec.toasts.at(-1)?.tone).toBe("danger");
  });
});

describe("createLiveApi: what the live app does not offer", () => {
  it("toasts why and returns the typed 'nothing happened' value", () => {
    const { api, rec, state } = harness({ writers: ALL_WRITERS(stub().writer) });
    expect(api.reactivateCase("ZZT-0005", "again")).toBe(false);
    expect(api.updateCaseContacts("ZZT-0003", [])).toBe(false);
    expect(api.reportChange("ZZT-0005", "x")).toBe(false);
    expect(api.runReminders()).toBe(0);
    expect(api.uploadDocument("ZZT-0003", { name: "a.pdf", kind: "SDS", sectionId: "K2" })).toBe("");
    expect(api.supplierRespond("ZZT-0003", "OP-1", { text: "x" })).toBeUndefined();
    api.markAllMailsRead();
    expect(rec.toasts.slice(0, 7).every((t) => t.tone === "warning" && t.text.endsWith("is not available in this version yet."))).toBe(true);
    const n = rec.toasts.length;
    // 26 Oct: the configuration editor is live, but only for the Business administrator: the domain refuses RMM
    expect(api.upsertRule({} as never)).toBeNull();
    expect(api.publishDraft("note")).toBe(false);
    api.setOwnership("K2", "SAF", []);
    expect(rec.toasts.slice(n)).toEqual([0, 1, 2].map(() => ({ tone: "danger", text: "Only the business administrator changes the configuration." })));
    expect(api.validateDraft()).toEqual(validateDraft(state()));
    expect(rec.optimistic).toHaveLength(0);
    expect(rec.jobs).toHaveLength(0);
  });

  it("switches only to a persona the user holds; reset reloads; notify and dismiss pass through", () => {
    const { api, rec } = harness({ held: ["rmm", "saf"] });
    api.setPersona("saf");
    api.setPersona("rmm"); // the current one: nothing
    api.setPersona("auditor");
    api.setPersona("sup:u-sup-1");
    expect(rec.personas).toEqual(["saf"]);
    expect(rec.toasts).toEqual([
      { tone: "danger", text: NOT_HELD },
      { tone: "danger", text: NOT_HELD },
    ]);
    api.reset();
    expect(rec.reloads).toBe(1);
    api.notify("info", "Hello");
    api.dismissToast("t1");
    expect(rec.toasts.at(-1)).toEqual({ tone: "info", text: "Hello" });
    expect(rec.dismissed).toEqual(["t1"]);
  });
});

describe("saving like the portal: the store side (APP-SAVING-GAPS, 20 Oct)", () => {
  /** The store's chain as LiveAppStore wires it (enqueueJob), recording what the store would do. */
  function chain(o: { showSaved?: (r: WriteResult) => boolean; onDrop?: () => void; readOk?: boolean } = {}) {
    const state = newWriteChain();
    let tail: Promise<unknown> = Promise.resolve();
    let gen = 0;
    const seen = { reports: [] as { label: string; r: WriteResult }[], shown: [] as WriteResult[], reads: 0, drops: 0, saving: 0 };
    const deps: JobDeps = {
      serial: (fn) => {
        const p = tail.then(fn);
        tail = p.catch(() => undefined);
        return p;
      },
      saving: (d) => void (seen.saving += d),
      report: (label, r) => void seen.reports.push({ label, r }),
      generation: () => gen,
      dropOptimistic: () => {
        seen.drops++;
        o.onDrop?.();
      },
      showSaved: (r) => (seen.shown.push(r), o.showSaved ? o.showSaved(r) : true),
      read: async () => (seen.reads++, o.readOk ?? true),
    };
    /** An accepted action: a new optimistic generation, then its job. */
    const enqueue = (label: string, job: () => Promise<WriteResult>) => {
      gen++;
      return enqueueJob(state, deps, label, job);
    };
    return { state, seen, enqueue };
  }
  const result = (r: Partial<WriteResult> = {}): WriteResult => ({ ok: true, handoffs: [], warnings: [], ...r });
  const saved = [{ flow: "review" as const, item: { _id: "PkRev1", RMES_Decision: "Approved" } }];

  it("gap 1: a save that moved no step shows its read-backs and reads nothing again; a step move reads once, after the last job", async () => {
    const c = chain();
    const r = await c.enqueue("rmesDecision", async () => result({ saved, auditRow: { _id: "PkEv1" }, moved: false }));
    expect(r.ok).toBe(true);
    expect(c.seen.shown).toEqual([r]);
    expect(c.seen.reads).toBe(0);
    expect(c.seen.drops).toBe(1); // nothing newer: the optimistic state gives way to the read-backs
    // a step move (or an item-writing hand-off), then a plain save queued behind it: ONE read, after the last job
    const moved = c.enqueue("raiseOpenPoint", async () => result({ moved: true }));
    const plain = c.enqueue("addInternalNote", async () => result({ saved: [{ flow: "note", item: { _id: "PkNote9" } }], moved: false }));
    await Promise.all([moved, plain]);
    expect(c.seen.reads).toBe(1);
    expect(c.seen.shown.map((x) => x.saved?.[0]?.item._id)).toEqual(["PkRev1", "PkNote9"]);
    // a result that does not say whether it moved (not a writer's) reads again
    await c.enqueue("x", async () => result());
    expect(c.seen.reads).toBe(2);
    // read-backs the store could not show: it reads again
    const d = chain({ showSaved: () => false });
    await d.enqueue("rmesDecision", async () => result({ saved, moved: false }));
    expect(d.seen.reads).toBe(1);
    expect(c.seen.saving).toBe(0);
  });

  it("gap 2: a job queued behind a failed one is not sent; one clicked after the failure is", async () => {
    let ran: string[] = [];
    const later: Promise<WriteResult>[] = [];
    const c = chain({
      // the click after the failure: the screens no longer show the failed job's optimistic state
      onDrop: () => {
        if (later.length === 0) later.push(c.enqueue("addInternalNote", async () => (ran.push("addInternalNote"), result({ moved: false }))));
      },
    });
    const first = c.enqueue("rmesDecision", async () => (ran.push("rmesDecision"), { ok: false, tone: "danger" as const, message: "Not saved: Kissflow did not answer within 30 s.", handoffs: [], warnings: [] }));
    const queued = c.enqueue("completeReview", async () => (ran.push("completeReview"), result({ moved: true })));
    const [a, b] = await Promise.all([first, queued]);
    await later[0];
    expect(a.ok).toBe(false);
    expect(b).toEqual({ ok: false, tone: "warning", message: NOT_SENT, handoffs: [], warnings: [] });
    expect(ran).toEqual(["rmesDecision", "addInternalNote"]);
    expect(c.state.failEpoch).toBe(1); // the job that was not sent is no new failure
    expect(c.seen.reports.map((x) => [x.label, x.r.ok])).toEqual([["rmesDecision", false], ["completeReview", false], ["addInternalNote", true]]);
    expect(c.seen.reads).toBe(1); // once, after the last job
    ran = [];
    expect((await c.enqueue("closeOpenPoint", async () => (ran.push("closeOpenPoint"), result({ moved: false })))).ok).toBe(true);
    expect(ran).toEqual(["closeOpenPoint"]);
  });

  it("gap 4: the writer gets the write context of the click, not the one of a load that finished before the job ran", async () => {
    const s = stub();
    const h = harness({ writers: ALL_WRITERS(s.writer) });
    h.api.addInternalNote("ZZT-0003", "Checked the SDS.");
    const reloaded: WriteCtx = { ...h.ctx, index: { ...h.ctx.index, ops: new Map() } };
    h.setCtx(reloaded); // a reload finished meanwhile
    await h.rec.jobs[0]!.job();
    expect(s.got[0]!.ctx).toBe(h.ctx);
    expect(s.got[0]!.ctx).not.toBe(reloaded);
  });

  it("gap 6: the screens that keep the user's input learn whether it reached Kissflow", async () => {
    let ok = true;
    const writer: Writer = async () => (ok ? { ok: true, handoffs: [], warnings: [], moved: false } : { ok: false, message: "Not saved: 050313", handoffs: [], warnings: [] });
    const { api, rec, initial } = harness({ persona: "mic", writers: ALL_WRITERS(writer) });
    const note = api.addInternalNote("ZZT-0003", "Checked the SDS.");
    expect(note).toBeInstanceOf(Promise);
    await rec.jobs[0]!.job();
    expect(await note).toBe(true);
    ok = false;
    const query = api.raiseOpenPoint("ZZT-0003", { dept: "MIC", kind: "query", ref: { sectionId: "K1", label: "K1 › specification" }, question: "Please confirm the shelf life.", justification: "Needed.", dueDate: "2026-11-30T00:00:00.000Z" });
    await rec.jobs[1]!.job();
    expect(await query).toBe(false);
    // refused here (the domain: no text): false at once, nothing queued
    expect(await api.addInternalNote("ZZT-0003", "   ")).toBe(false);
    expect(rec.jobs).toHaveLength(2);
    const op = initial.cases.find((c) => c.id === "ZZT-0003")!.openPoints.find((p) => p.status !== "closed")!;
    expect(api.reviewResponse("ZZT-0003", op.id, "accept", "")).toBeInstanceOf(Promise);
  });

  it("gap 9: Complete review decides from what Kissflow holds now: a point a colleague raised since the load refuses it, nothing is written", async () => {
    const s = stub();
    let fresh: { state: AppState; ctx: WriteCtx } | undefined;
    const h = harness({ persona: "mic", writers: ALL_WRITERS(s.writer), fresh: async () => fresh! });
    const me = h.initial.users[0]!.id;
    // a Microbiology colleague raised a point on ZZT-0003 after this screen loaded
    const now = A.raiseOpenPoint({ ...h.initial, toasts: [] }, me, "ZZT-0003", { dept: "MIC", kind: "query", ref: { sectionId: "K1", label: "K1 › specification" }, question: "Please confirm the shelf life.", justification: "Needed.", dueDate: "2026-11-30T00:00:00.000Z" });
    expect(A.wasRefused(h.initial, now)).toBe(false);
    const freshCtx: WriteCtx = { ...h.ctx };
    fresh = { state: { ...now, toasts: [] }, ctx: freshCtx };
    h.api.completeReview("ZZT-0003", "MIC");
    expect(h.rec.optimistic).toHaveLength(1); // the screen's data allowed it
    const r = await h.rec.jobs[0]!.job();
    expect(r).toMatchObject({ ok: false, tone: "danger" });
    expect(r.message).toMatch(/^Cannot complete: 1 open item/);
    expect(s.got).toHaveLength(0);
    // Kissflow agrees with the screen: the writer gets the fresh context and state, and the domain's result on them
    const h2 = harness({ persona: "mic", writers: ALL_WRITERS(s.writer), fresh: async () => fresh! });
    fresh = { state: { ...h2.initial, toasts: [] }, ctx: freshCtx };
    h2.api.completeReview("ZZT-0003", "MIC");
    expect((await h2.rec.jobs[0]!.job()).ok).toBe(true);
    expect(s.got[0]!.ctx).toBe(freshCtx);
    expect(s.got[0]!.prev).toBe(fresh.state);
    expect(s.got[0]!.next.cases.find((c) => c.id === "ZZT-0003")!.reviews.find((r) => r.dept === "MIC")!.status).toBe("completed");
  });

  it("gap 9: Complete review is not decided from a read that could not read the gate's parts again, nor over a review changed since the click", async () => {
    const s = stub();
    let fresh: Fresh | undefined;
    const h = harness({ persona: "mic", writers: ALL_WRITERS(s.writer), fresh: async () => fresh! });
    const base = fixtureSnapshot("mic", "full");
    // the open points were kept from an earlier load (keepUnread): a point a colleague raised meanwhile would not count
    fresh = { state: { ...h.initial, toasts: [] }, ctx: h.ctx, snap: { ...base, kept: { op: base.loadedAt } } };
    h.api.completeReview("ZZT-0003", "MIC");
    expect(await h.rec.jobs[0]!.job()).toEqual({ ok: false, tone: "warning", message: NOT_READ_AGAIN(["CIQ Open Point"]), handoffs: [], warnings: [] });
    expect(s.got).toHaveLength(0);
    // the review item changed after the click (a colleague recorded a decision or reassigned it)
    const k = "ZZT-0003|MIC";
    const reviews = new Map(h.ctx.index.reviews);
    const ref = reviews.get(k)!;
    expect(ref.modifiedAt).toBeTruthy();
    reviews.set(k, { ...ref, modifiedAt: "2026-10-24T09:30:00Z" });
    const h2 = harness({ persona: "mic", writers: ALL_WRITERS(s.writer), fresh: async () => fresh! });
    fresh = { state: { ...h2.initial, toasts: [] }, ctx: { ...h2.ctx, index: { ...h2.ctx.index, reviews } }, snap: base };
    h2.api.completeReview("ZZT-0003", "MIC");
    expect(await h2.rec.jobs[0]!.job()).toMatchObject({ ok: false, tone: "danger", message: STALE_TEXT.review });
    expect(s.got).toHaveLength(0);
    // the same stamp (or our own earlier write's, handed over to the click's entry): it completes
    const h3 = harness({ persona: "mic", writers: ALL_WRITERS(s.writer), fresh: async () => fresh! });
    fresh = { state: { ...h3.initial, toasts: [] }, ctx: { ...h3.ctx }, snap: base };
    h3.api.completeReview("ZZT-0003", "MIC");
    expect((await h3.rec.jobs[0]!.job()).ok).toBe(true);
    expect(s.got).toHaveLength(1);
  });

  it("gap 1: a read after a step move that failed stays owed: the next save reads again instead of showing its read-backs on the old data", async () => {
    const c = chain({ readOk: false });
    await c.enqueue("completeReview", async () => result({ moved: true }));
    expect(c.seen.reads).toBe(1);
    expect(c.seen.drops).toBe(0);
    expect(c.state.readOwed).toBe(true);
    await c.enqueue("addInternalNote", async () => result({ saved: [{ flow: "note", item: { _id: "PkNote9" } }], moved: false }));
    expect(c.seen.reads).toBe(2);
    expect(c.seen.drops).toBe(0); // the optimistic state is not dropped onto the data from before the move
  });

  it("gap 5: a hand-off that failed after its save says the change is saved and where to look", () => {
    expect(handoffProblemText("op.round", "Kissflow did not answer within 30 s.")).toBe("Saved, but its hand-off to the supplier portal (op.round) failed: Kissflow did not answer within 30 s. Diagnostics lists it.");
    expect(handoffProblemText("op.round", "Kissflow did not answer within 30 s.", "dev")).toBe(handoffProblemText("op.round", "Kissflow did not answer within 30 s."));
  });

  it("C13: production says what a failed hand-off means for the supplier: no code, no cause, no Diagnostics", () => {
    const t = handoffProblemText("op.round", "TypeError: Failed to fetch (fetch); KISSFLOW_ERROR_050302 no permission (SDK)", "prod");
    expect(t).toBe("Saved. The supplier portal could not be updated just now, so the supplier may not see this change yet. Tell your CIQ administrator.");
    expect(t).not.toMatch(/op\.round|KISSFLOW|Diagnostics|\((SDK|fetch)\)/);
  });

  it("27 Oct: a mention mail that failed names the colleague; production gives no cause", () => {
    expect(mailProblemText("mention", "TypeError: Failed to fetch.", "dev", "Ingrid Nolte")).toBe("The note is saved, but the e-mail to Ingrid Nolte failed: TypeError: Failed to fetch.");
    expect(mailProblemText("mention", "TypeError: Failed to fetch.", "prod", "Ingrid Nolte")).toBe("The note is saved, but the e-mail to Ingrid Nolte could not be sent.");
    // the supplier mails keep their texts
    expect(mailProblemText("case cancelled", "x", "prod")).toBe("Saved, but the e-mail to the supplier contacts could not be sent.");
    expect(mailProblemText("case cancelled", "x.", "dev")).toBe("Saved, but the e-mail (case cancelled) failed: x.");
  });
});

describe("finalize", () => {
  const ok = (r: Partial<WriteResult> = {}): WriteResult => ({ ok: true, handoffs: [], warnings: [], ...r });
  it("prefers the writer's message; a pending hand-off adds nothing to the toast (A10) but stays on the result", () => {
    const success = { tone: "success" as const, text: "Answer accepted." };
    expect(finalize(ok(), success)).toMatchObject({ tone: "success", message: "Answer accepted." });
    expect(finalize(ok({ message: "Accepted; its history line was not saved.", tone: "warning" }), success)).toMatchObject({ tone: "warning", message: "Accepted; its history line was not saved." });
    const pending = finalize(ok({ handoffs: [{ code: "history.updated", status: "pending" }, { code: "op.closed", status: "pending" }] }), success);
    expect(pending.message).toBe("Answer accepted.");
    expect(pending.handoffs.map((h) => h.status)).toEqual(["pending", "pending"]);
    expect(finalize({ ok: false, handoffs: [], warnings: [] }, success)).toMatchObject({ tone: "danger", message: "Not saved." });
  });
});

describe("WIRING", () => {
  it("is owner C's write layer: writers, the live guard, the load-time side effects, webhooks and the Mandatory check", () => {
    expect(Object.keys(WIRING.writers).length).toBeGreaterThan(0);
    for (const m of Object.keys(WIRING.writers)) expect(Object.keys(WHAT)).toContain(m);
    for (const f of [WIRING.guard, WIRING.ensureRmes, WIRING.webhooksOf, WIRING.assertMandatory]) expect(typeof f).toBe("function");
  });

  it("builds the hand-off URLs where the client runs: its account and the Kissflow host around the frame reach the URL (21 Oct)", () => {
    // SET:current as copied from the dev sandbox; only each URL's token is used (op.closed: on another host and account),
    // and a URL that is not exactly a hook URL has none (op.edited: no token after "/webhook"; history.updated: another
    // kind of URL), so its hand-off is pending wherever the client runs
    const settings = {
      webhooks: {
        "op.round": `https://dev-beiersdorf.kissflow.eu/integration/2/${DEV_ACCOUNT}/webhook/hk-R`,
        "op.closed": "https://hooks.example/integration/2/AcOTHER/webhook/hk-C",
        "op.edited": `https://dev-beiersdorf.kissflow.eu/integration/2/${DEV_ACCOUNT}/webhook`,
        "history.updated": "https://hooks.example/closed",
      },
    };
    const me = { _id: "UsRmmKatrin", Name: "Katrin Vogel" };
    const at = (accountId: string, hookHost?: string) => webhooksFor(WIRING, createFakeClient({ items: {}, me }, { accountId, hookHost }), settings);
    expect(at(DEV_ACCOUNT, "dev-beiersdorf.kissflow.eu")).toEqual({ "op.round": settings.webhooks["op.round"], "op.closed": `https://dev-beiersdorf.kissflow.eu/integration/2/${DEV_ACCOUNT}/webhook/hk-C` });
    expect(at("AcPRODHARNESS", "ciq-prod.kissflow.com")).toEqual({ "op.round": "https://ciq-prod.kissflow.com/integration/2/AcPRODHARNESS/webhook/hk-R", "op.closed": "https://ciq-prod.kissflow.com/integration/2/AcPRODHARNESS/webhook/hk-C" });
    expect(at("AcPRODHARNESS")).toEqual({ "op.round": "/integration/2/AcPRODHARNESS/webhook/hk-R", "op.closed": "/integration/2/AcPRODHARNESS/webhook/hk-C" }); // kf.api
    const seen: HookBase[] = [];
    const recording = { webhooksOf: (_s: Record<string, unknown>, where: HookBase) => (seen.push(where), {}) };
    webhooksFor(recording, { accountId: DEV_ACCOUNT, hookHost: "dev-beiersdorf.kissflow.eu" }, settings);
    webhooksFor(recording, { accountId: "AcPRODHARNESS" }, settings);
    expect(seen).toEqual([{ accountId: DEV_ACCOUNT, host: "dev-beiersdorf.kissflow.eu" }, { accountId: "AcPRODHARNESS" }]);
    expect(webhooksFor({}, { accountId: "AcPRODHARNESS" }, settings)).toEqual({}); // no webhooksOf: every hand-off pending
  });
});

describe("FE-CLEANUP: the store's failure texts (22 Oct)", () => {
  const refusal = new AppError("KISSFLOW_ERROR_050302 You don't have permission to access this item.");

  it("C12: a thrown write is “Not saved: <plain>” in prod, with Kissflow's answer kept for the Writes log; dev unchanged", () => {
    expect(failedResult(refusal, "prod")).toEqual({ ok: false, tone: "danger", message: "Not saved: Kissflow did not allow this for your role.", detail: "KISSFLOW_ERROR_050302 You don't have permission to access this item.", handoffs: [], warnings: [] });
    expect(failedResult(refusal, "dev")).toEqual({ ok: false, tone: "danger", message: "Not saved: KISSFLOW_ERROR_050302 You don't have permission to access this item.", handoffs: [], warnings: [] });
    expect(failedResult(refusal)).toEqual(failedResult(refusal, "dev"));
  });

  it("C12: a job that throws in the store's chain (enqueueJob) says it plainly in prod too", async () => {
    const logged: WriteResult[] = [];
    const d: JobDeps = { serial: (fn) => fn(), saving: () => {}, report: (_l, r) => void logged.push(r), generation: () => 0, dropOptimistic: () => {}, showSaved: () => true, read: async () => true, env: "prod" };
    const r = await enqueueJob(newWriteChain(), d, "raiseOpenPoint", async () => {
      throw refusal;
    });
    expect(r.message).toBe("Not saved: Kissflow did not allow this for your role.");
    expect(logged[0]!.detail).toBe("KISSFLOW_ERROR_050302 You don't have permission to access this item.");
  });

  it("C17: Complete review's refusal names no flow in prod; dev names the parts", () => {
    const snap: LiveSnapshot = { loadedAt: "2026-10-24T08:00:00Z", items: { case: [], review: [], op: [] }, forms: { audit: [], config: [], note: [], rmesSAF: [], rmesREG: [], supplier: [] }, tasks: [], unreadableCases: {}, reads: [], warnings: [], kept: { op: "2026-10-24T07:00:00Z" } };
    const fresh = { state: {} as AppState, ctx: {} as WriteCtx, snap } satisfies Fresh;
    expect(reviewGateCheck("ZZT-0003", "MIC")(fresh, { env: "prod" } as WriteCtx)).toEqual({ tone: "warning", text: NOT_READ_AGAIN_PLAIN });
    expect(reviewGateCheck("ZZT-0003", "MIC")(fresh, { env: "dev" } as WriteCtx)).toEqual({ tone: "warning", text: NOT_READ_AGAIN(["CIQ Open Point"]) });
    expect(NOT_READ_AGAIN_PLAIN).not.toMatch(/CIQ |Kissflow could not read/);
  });
});

describe("createLiveApi: the configuration editor (26 Oct, the Business administrator)", () => {
  it("the domain decides: a second draft, a publish without a change note and RMM are refused with its own reason, nothing written", () => {
    const s = stub();
    const ba = harness({ persona: "admin", writers: ALL_WRITERS(s.writer) });
    // the seed's prepared RS-2026.2 + v2 is the open draft
    expect(ba.api.createDraft("second")).toBe(false);
    expect(ba.rec.toasts.at(-1)).toEqual({ tone: "danger", text: "The draft RS-2026.2 + v2 is still open. Publish or discard it first." });
    expect(ba.api.publishDraft("  ")).toBe(false);
    expect(ba.rec.toasts.at(-1)).toEqual({ tone: "danger", text: "Write a change note: what changes, and why." });
    expect(ba.rec.jobs).toHaveLength(0);
    const rmm = harness({ writers: ALL_WRITERS(s.writer) });
    expect(rmm.api.discardDraft()).toBe(false);
    expect(rmm.rec.toasts.at(-1)?.text).toBe("Only the business administrator changes the configuration.");
    expect(s.got).toHaveLength(0);
  });

  it("an accepted change: shown at once, one job with the click's state, the domain's toast (or Draft saved.) when it settles", async () => {
    const s = stub();
    const { api, rec, initial } = harness({ persona: "admin", writers: ALL_WRITERS(s.writer) });
    expect(api.discardDraft()).toBe(true);
    expect(rec.optimistic.at(-1)!.config.pairs).toEqual([]);
    expect(api.createDraft("Fictional draft")).toBe(true);
    expect(rec.optimistic.at(-1)!.config.pairs.map((p) => [p.ruleSet.version, p.template.version, p.status])).toEqual([["RS-2026.2", "CIQ-2026 v2", "draft"]]);
    const draft = rec.optimistic.at(-1)!.config.pairs[0]!;
    const rule = draft.ruleSet.rules[2]!;
    // an unchanged save answers its id and writes nothing (the prototype store's savedId)
    expect(api.upsertRule(rule)).toBe(rule.id);
    expect(rec.jobs.map((j) => j.label)).toEqual(["discardDraft", "createDraft"]);
    expect(api.upsertRule({ ...rule, departments: [...new Set([...rule.departments, "SUS" as const])] })).toBe(rule.id);
    expect(api.moveField("GEN", draft.template.sections[0]!.fields[0]!.id, "down")).toBe(true);
    expect(rec.jobs.map((j) => j.label)).toEqual(["discardDraft", "createDraft", "upsertRule", "moveField"]);
    const results = [];
    for (const j of rec.jobs) results.push(await j.job());
    expect(results.map((r) => r.message)).toEqual([`Draft RS-2026.2 + v2 discarded.`, "New draft created from RS-2026.1 + v1. Change the rules or the questionnaire, then check and publish.", DRAFT_SAVED, DRAFT_SAVED]);
    // each writer got the state of its click and the domain's result
    expect(s.got[0]!.prev).toMatchObject({ config: initial.config });
    expect(s.got[2]!.next.config.pairs[0]!.ruleSet.rules.find((r) => r.id === rule.id)!.departments).toContain("SUS");
  });

  it("publishTemplateV2, setOwnership and updateReminder go to their writers too", async () => {
    const s = stub();
    const { api, rec, initial } = harness({ persona: "admin", writers: ALL_WRITERS(s.writer) });
    api.setOwnership("K2.1", "SAF", ["REG"]);
    const rem = initial.reminders[0]!;
    api.updateReminder(rem.id, { afterDays: rem.afterDays + 1 });
    api.updateReminder(rem.id, {}); // no change: nothing to write
    api.publishTemplateV2();
    expect(rec.jobs.map((j) => j.label)).toEqual(["setOwnership", "updateReminder", "publishTemplateV2"]);
    expect(rec.optimistic.at(-1)!.config.pairs[0]!.status).toBe("published");
  });
});
