// Round trip (DESIGN §7.1): a domain object the screens produced → the writers' encoding (write/encode.ts, through the
// real writers and activation) → the raw items Kissflow holds (kf/fakeClient.ts, seeded with the live-shaped fixtures)
// → the read mapping (map/toAppState.ts) ≈ the domain object again, on the fields the screens and the next write rely
// on. One test per object kind: the case (read in full, and header-only from its case.created snapshot), an open point
// (raised, returned, accepted), the reviews (started at activation, completed), an internal note, RMES results and
// findings, a supplier contact. Times are compared as instants (Kissflow stores DateTimes without milliseconds).
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { INTERNAL_PERSONAS } from "@/domain/catalog";
import { BDF_SET_FIELDS, departmentsForScope } from "@/domain/selectors";
import * as M from "@/domain/suppliers";
import type { AppState, CiqCase, Confirmation, InternalNote, InternalPersonaId, OpenPoint, ReviewTrack } from "@/domain/types";
import { str, userIds, type RawItem } from "@/portal/data/raw";
import { STEPS } from "../ids";
import { createFakeClient, type FakeClient } from "../kf/fakeClient";
import { SYNCED_REQUEST_FIELDS } from "../shared/handoff";
import { appFixtures, caseItemIdOf, fixtureActing, fixtureIdentity } from "../testing/rawFixtures";
import type { Acting, FlowKey, Identity, LiveSnapshot, Mapped, WritableMethod, WriteCtx } from "../types";
import { liveWriters } from "../write/actions";
import { playEA } from "../testing/playEA";
import { toAppState } from "./toAppState";

const AT = "2026-10-24T09:00:00.000Z";
const DUE = "2026-11-30T17:00:00.000Z";

type Mode = "full" | "role";

// ------------------------------------------------------------------------------------------------ the fake app

/** What load.ts would give a persona from the fake's items: "full" (every item read in full) or "role" (tonight's
 *  grants: the case item only for the RMM who started it, the held tasks and own items, as rawFixtures.fixtureSnapshot). */
function snapOf(fake: FakeClient, identity: Identity, acting: Acting, mode: Mode): LiveSnapshot {
  const tasks = fake.tasks();
  const held = new Map(tasks.map((t) => [t.itemId, t.act]));
  const withAct = (it: RawItem): RawItem => (held.has(it._id) ? { ...structuredClone(it), _activity_instance_id: held.get(it._id)! } : structuredClone(it));
  const all = (f: "case" | "review" | "op") => fake.db[f].filter((it) => str(it, "_status") !== "Draft").map(withAct);
  const mine = (it: RawItem) => userIds(it, "_created_by")[0] === identity.kfUserId;
  const p = acting.personaId;
  const dept = INTERNAL_PERSONAS.find((x) => x.id === p)?.dept;
  const items: LiveSnapshot["items"] =
    mode === "full"
      ? { case: all("case"), review: all("review"), op: all("op") }
      : { case: p === "rmm" ? all("case").filter(mine) : [], review: all("review").filter((it) => held.has(it._id) || (p === "rmm" && mine(it))), op: all("op").filter((it) => held.has(it._id) || mine(it)) };
  const forms: LiveSnapshot["forms"] = {
    audit: structuredClone(fake.db.audit),
    config: fake.db.config,
    note: structuredClone(fake.db.note),
    rmesSAF: mode === "full" || dept === "SAF" || p === "auditor" ? structuredClone(fake.db.rmesSAF) : [],
    rmesREG: mode === "full" || dept === "REG" || p === "auditor" ? structuredClone(fake.db.rmesREG) : [],
    supplier: mode === "full" || p === "rmm" || p === "admin" ? structuredClone(fake.db.supplier) : [],
  };
  const unreadableCases: LiveSnapshot["unreadableCases"] = {};
  if (mode === "role") for (const it of fake.db.case) if (!items.case.some((x) => x._id === it._id)) unreadableCases[it._id] = "no read route for this role";
  return { loadedAt: AT, items, forms, tasks, unreadableCases, reads: [], warnings: [] };
}

interface Boot {
  fake: FakeClient;
  identity: Identity;
  acting: Acting;
  m: Mapped;
  /** Reads the fake again (as the store does after every write). */
  read(mode?: Mode): Mapped;
  ctx(): WriteCtx;
}

function boot(persona: InternalPersonaId, db: Partial<Record<FlowKey, RawItem[]>> = appFixtures().db): Boot {
  const identity = fixtureIdentity([persona]);
  const acting = fixtureActing(identity, persona);
  const fake = createFakeClient({ items: db, me: { _id: identity.kfUserId, Name: identity.name, Email: identity.email, roles: [persona] } }, { now: () => AT });
  const b: Boot = {
    fake,
    identity,
    acting,
    m: undefined as unknown as Mapped,
    read(mode = "full") {
      return toAppState({ snap: snapOf(fake, identity, acting, mode), identity, acting });
    },
    ctx: () => ({ client: fake, identity, acting, index: b.m.index, webhooks: {}, now: () => AT, containerOk: true }),
  };
  b.m = b.read();
  return b;
}

/** The store's flow (DESIGN §6): the pure domain action on the loaded state, then its writer; returns `next` and the
 *  state read back from Kissflow afterwards. */
async function roundtrip(b: Boot, method: WritableMethod, args: unknown[], domain: (s: AppState, by: string) => AppState): Promise<{ next: AppState; back: AppState }> {
  const prev = b.m.state;
  const next = domain(prev, b.acting.me.id);
  expect(A.wasRefused(prev, next), next.toasts.at(-1)?.text).toBe(false);
  const r = await liveWriters[method]!(b.ctx(), prev, next, args);
  expect(r, r.message).toMatchObject({ ok: true });
  b.m = b.read();
  return { next, back: b.m.state };
}

// ------------------------------------------------------------------------------------------------ comparisons

/** An instant, whatever its precision (Kissflow drops the milliseconds). */
const instant = (iso: string | undefined) => (iso ? new Date(iso).toISOString() : iso);
const day = (iso: string | undefined) => iso?.slice(0, 10);
const caseIn = (s: AppState, id: string): CiqCase => {
  const c = s.cases.find((x) => x.id === id);
  if (!c) throw new Error(`case ${id} missing`);
  return c;
};
/** Drops undefined values (an absent optional field reads back as absent). */
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const caseKeys = (c: CiqCase) => ({
  id: c.id,
  materialName: c.materialName,
  inci: c.inci,
  materialNo: c.materialNo,
  supplierId: c.supplierId,
  manufacturer: c.manufacturer,
  ownerId: c.ownerId,
  priority: c.priority,
  templateVersion: c.templateVersion,
  ruleSetVersion: c.ruleSetVersion,
  phase: c.phase,
  supplierContactIds: c.supplierContactIds,
  markets: c.config.SF11,
  due: day(c.dueDate),
  bdfAnswers: Object.fromEntries(BDF_SET_FIELDS.filter((k) => c.answers[k] !== undefined).map((k) => [k, c.answers[k]])),
});

const opKeys = (p: OpenPoint) => ({
  id: p.id,
  dept: p.dept,
  kind: p.kind,
  ref: clean(p.ref),
  question: p.question,
  justification: p.justification,
  responsibleId: p.responsibleId,
  due: day(p.dueDate),
  rounds: p.rounds,
  status: p.status,
  outcome: p.outcome,
  createdBy: p.createdBy,
  closedBy: p.closedBy,
  closedAt: instant(p.closedAt),
  thread: p.thread.map((m) => clean({ id: m.id, at: instant(m.at), by: m.by, side: m.side, action: m.action, text: m.text, newRound: m.newRound || undefined })),
});

const trackKeys = (r: ReviewTrack) => ({ dept: r.dept, status: r.status, completedAt: instant(r.completedAt), decision: r.decision });
const confKeys = (k: Confirmation) => ({ type: k.type, dept: k.dept, by: k.by, name: k.name, at: instant(k.at) });
const noteKeys = (n: InternalNote) => clean({ id: n.id, at: instant(n.at), by: n.by, dept: n.dept, text: n.text, sectionId: n.sectionId, mentions: n.mentions?.length ? n.mentions : undefined });

// ------------------------------------------------------------------------------------------------ the tests

describe("round trip: domain → encode → Kissflow items → toAppState", () => {
  it("a new case: every header field reads back, from the item and from its case.created snapshot alone", async () => {
    const b = boot("rmm");
    const input: A.NewCaseInput = { materialName: "HELIOSOFT 200", inci: "Helianthus Annuus Seed Oil", materialNo: "RM-405217", supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena", "UsRavi"], markets: ["EU", "UK"], dueDate: DUE, priority: "high" };
    const before = b.m.state.cases.map((c) => c.id);
    const { next, back } = await roundtrip(b, "createCase", [input], (s, by) => A.createCase(s, by, input, AT).state);
    const made = next.cases.find((c) => !before.includes(c.id))!;
    expect(made.phase).toBe("supplier-input");
    expect(caseKeys(caseIn(back, made.id))).toEqual(caseKeys(made));
    // a role that can't read the item (R-1) sees the same header from the audit row's snapshot
    const saf = boot("saf", b.fake.db);
    const header = saf.read("role");
    expect(header.index.cases.get(made.id)?.readable).toBe(false);
    expect(caseKeys(caseIn(header.state, made.id))).toEqual(caseKeys(made));
    // the writers' index knows the new case by its item id
    expect(b.m.index.cases.get(made.id)).toMatchObject({ caseId: made.id, cycleNo: 1, supplierCode: "SUP-ZZT-SOLVARO", readable: true });
  });

  it("an open point: raised, then returned and accepted, reads back as the domain left it each time", async () => {
    const mic = boot("mic");
    const c = caseIn(mic.m.state, "ZZT-0003");
    const sec = c.scope.find((x) => x.applicability === "mandatory")!.sectionId;
    const input: A.RaiseInput = { dept: "MIC", kind: "query", ref: { sectionId: sec, label: sec }, question: "Please confirm the total viable count limit.", justification: "Needed for the micro assessment.", dueDate: DUE };
    const raised = await roundtrip(mic, "raiseOpenPoint", ["ZZT-0003", input], (s, by) => A.raiseOpenPoint(s, by, "ZZT-0003", input, AT));
    const op = caseIn(raised.next, "ZZT-0003").openPoints.at(-1)!;
    expect(opKeys(caseIn(raised.back, "ZZT-0003").openPoints.find((p) => p.id === op.id)!)).toEqual(opKeys(op));
    expect(mic.m.index.ops.get(op.id)).toMatchObject({ caseId: "ZZT-0003", roundNo: 1, live: true });

    // RMM returns the answered OP-0003-01 (its supplier answer was synthesized from Response_*: now persisted)
    const rmm = boot("rmm");
    const returned = await roundtrip(rmm, "reviewResponse", ["ZZT-0003", "OP-0003-01", "return", "Please state the test method."], (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "return", "Please state the test method.", AT));
    const r1 = caseIn(returned.next, "ZZT-0003").openPoints.find((p) => p.id === "OP-0003-01")!;
    expect(r1).toMatchObject({ status: "open", rounds: 2 });
    expect(opKeys(caseIn(returned.back, "ZZT-0003").openPoints.find((p) => p.id === "OP-0003-01")!)).toEqual(opKeys(r1));

    // a fresh copy: accept the answer instead
    const rmm2 = boot("rmm");
    const accepted = await roundtrip(rmm2, "reviewResponse", ["ZZT-0003", "OP-0003-01", "accept", ""], (s, by) => A.reviewResponse(s, by, "ZZT-0003", "OP-0003-01", "accept", "", AT));
    const a1 = caseIn(accepted.next, "ZZT-0003").openPoints.find((p) => p.id === "OP-0003-01")!;
    expect(a1).toMatchObject({ status: "closed", outcome: "accepted" });
    expect(opKeys(caseIn(accepted.back, "ZZT-0003").openPoints.find((p) => p.id === "OP-0003-01")!)).toEqual(opKeys(a1));
  });

  it("reviews: started by I-2 (E-A) for RMM and the departments the confirmation named, completed with its confirmation", async () => {
    // I-2 on ZZT-0001: the supplier confirmed completeness (the 15 fields copied, here from ZZT-0003), case moved on
    const rmm = boot("rmm");
    const src = rmm.fake.find(caseItemIdOf("ZZT-0003"))!.item;
    const patch: Record<string, unknown> = { Case_Phase: "Review", Completeness_At: "2026-10-23T10:00:00Z" };
    for (const k of [...SYNCED_REQUEST_FIELDS, "Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role"]) if (src[k] !== undefined) patch[k] = src[k];
    rmm.fake.set(caseItemIdOf("ZZT-0001"), patch);
    rmm.fake.move(caseItemIdOf("ZZT-0001"), STEPS.case.release);
    rmm.m = rmm.read();
    const c1 = caseIn(rmm.m.state, "ZZT-0001");
    expect([c1.phase, c1.reviews]).toEqual(["review", []]);
    // E-A (22 Oct): Review_Depts as the portal's confirmation computes it (departmentsForScope), then I-2's reviews
    const depts = departmentsForScope(c1.scope, rmm.m.state.ownership);
    expect(playEA(rmm.fake, caseItemIdOf("ZZT-0001"), depts).length).toBe(1 + depts.length);
    const back = caseIn(rmm.read().state, "ZZT-0001");
    const want = ["RMM", ...depts];
    expect(back.reviews.map((x) => x.dept).sort()).toEqual([...want].sort());
    expect(back.reviews.every((x) => x.status === "in-review" && !!x.startedAt)).toBe(true);
    expect(back.reviews.find((x) => x.dept === "RMM")!.assigneeId).toBe(c1.ownerId);
    expect(back.phase).toBe("review");

    // Microbiology completes its review of ZZT-0003
    const mic = boot("mic");
    const done = await roundtrip(mic, "completeReview", ["ZZT-0003", "MIC", {}], (s, by) => A.completeReview(s, by, "ZZT-0003", "MIC", AT));
    const want2 = caseIn(done.next, "ZZT-0003");
    const got2 = caseIn(done.back, "ZZT-0003");
    expect(trackKeys(got2.reviews.find((x) => x.dept === "MIC")!)).toEqual(trackKeys(want2.reviews.find((x) => x.dept === "MIC")!));
    const conf = (c: CiqCase) => c.confirmations.filter((k) => k.type === "dept-completion" && k.dept === "MIC").map(confKeys);
    expect(conf(got2)).toEqual(conf(want2));
    expect(got2.phase).toBe(want2.phase);
  });

  it("an internal note with a mention reads back with its section, author, department and mention", async () => {
    const b = boot("cus");
    const text = "@Katrin Vogel the HS code needs a second look.";
    const { next, back } = await roundtrip(b, "addInternalNote", ["ZZT-0003", text, "K7"], (s, by) => A.addInternalNote(s, by, "ZZT-0003", text, "K7", AT));
    const note = caseIn(next, "ZZT-0003").internalNotes.find((n) => n.text === text)!;
    expect(note.mentions).toEqual(["UsRmmKatrin"]);
    expect(noteKeys(caseIn(back, "ZZT-0003").internalNotes.find((n) => n.id === note.id)!)).toEqual(noteKeys(note));
  });

  it("RMES: a recorded result and a new finding read back on their rows", async () => {
    const b = boot("saf");
    const open = caseIn(b.m.state, "ZZT-0003").rmes!.criteria.find((x) => x.dept === "SAF" && !x.result)!;
    const rec = await roundtrip(b, "recordCriterion", ["ZZT-0003", open.id, "plausible", "Dossier checked."], (s, by) => A.recordCriterion(s, by, "ZZT-0003", open.id, "plausible", "Dossier checked.", AT));
    const crit = (c: CiqCase) => {
      const x = c.rmes!.criteria.find((y) => y.id === open.id)!;
      return { id: x.id, dept: x.dept, part: x.part, title: x.title, result: x.result, comment: x.comment, by: x.by, at: instant(x.at), source: { sectionId: x.source.sectionId, fieldId: x.source.fieldId, label: x.source.label } };
    };
    expect(crit(caseIn(rec.back, "ZZT-0003"))).toEqual(crit(caseIn(rec.next, "ZZT-0003")));
    const before = caseIn(b.m.state, "ZZT-0003").rmes!.findings.map((f) => f.id);
    const fnd = await roundtrip(b, "addFinding", ["ZZT-0003", open.id, "The sensitisation study is older than 10 years.", true], (s, by) => A.addFinding(s, by, "ZZT-0003", open.id, "The sensitisation study is older than 10 years.", true, AT));
    const added = caseIn(fnd.next, "ZZT-0003").rmes!.findings.find((f) => !before.includes(f.id))!;
    const fk = (c: CiqCase) => {
      const f = c.rmes!.findings.find((x) => x.id === added.id)!;
      return { id: f.id, dept: f.dept, criterionId: f.criterionId, text: f.text, blocking: f.blocking, status: f.status, openPointId: f.openPointId };
    };
    expect(fk(caseIn(fnd.back, "ZZT-0003"))).toEqual(fk(caseIn(fnd.next, "ZZT-0003")));
  });

  it("the supplier master: a new contact and a changed city read back from the CIQ Supplier row", async () => {
    const b = boot("admin");
    const input: M.ContactInput = { name: "Marta Soler", email: "marta.soler@solvaro.example", title: "Quality Engineer", mayConfirm: false };
    const prev = b.m.state;
    const added = M.addContact(prev, b.acting.me.id, "SUP-ZZT-SOLVARO", input);
    expect(A.wasRefused(prev, added.state)).toBe(false);
    const r = await liveWriters.addContact!(b.ctx(), prev, added.state, ["SUP-ZZT-SOLVARO", input]);
    expect(r, r.message).toMatchObject({ ok: true });
    b.m = b.read();
    const contact = (s: AppState) => {
      const u = s.users.find((x) => x.side === "supplier" && x.email === input.email)!;
      return { name: u.name, email: u.email, title: u.title, mayConfirm: u.mayConfirm !== false, active: u.active !== false, supplierId: u.supplierId };
    };
    expect(contact(b.m.state)).toEqual(contact(added.state));
    const city = await roundtrip(b, "updateSupplier", ["SUP-ZZT-SOLVARO", { city: "Reus" }], (s, by) => M.updateSupplier(s, by, "SUP-ZZT-SOLVARO", { city: "Reus" }));
    const sup = (s: AppState) => {
      const x = s.suppliers.find((y) => y.id === "SUP-ZZT-SOLVARO")!;
      return { id: x.id, name: x.name, duns: x.duns, city: x.city, type: x.type, active: x.active !== false };
    };
    expect(sup(city.back)).toEqual(sup(city.next));
  });
});
