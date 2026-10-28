// The signed-in user as a supplier contact (dev, 21 Oct): Thomas's one Kissflow user is Beiersdorf staff (RMM, the
// Business administrator through the dev role switch) and the portal Supplier contact of the dev supplier
// (Contacts_Portal_User_Id = his Kissflow user id). The mapper registers that contact as "self:<id>" in every persona
// (map/people.ts), the internal user shows no e-mail then (map/toAppState.ts), and every write sends the real Kissflow
// id (write/encode.ts kfIdOfContact). Here the fixture RMM Katrin Vogel stands in for him (fictional data).
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import * as M from "@/domain/suppliers";
import type { AppState, Confirmation, InternalPersonaId, OpenPoint } from "@/domain/types";
import { childRows, str, type RawItem } from "@/portal/data/raw";
import { LIST, TABLES } from "./ids";
import { createFakeClient, type FakeCall, type FakeClient } from "./kf/fakeClient";
import { mapConfirmation, mapOp } from "./map/auditMap";
import { caseBaseOf } from "./map/caseMap";
import { Directory, selfContactId } from "./map/people";
import { toAppState } from "./map/toAppState";
import { CASE_START_FIELDS } from "./shared/caseStartPayload";
import { KF_USERS, appFixtures, fixtureActing, fixtureIdentity, fixtureInput } from "./testing/rawFixtures";
import type { LiveSnapshot, Mapped, WriteCtx } from "./types";
import { liveWriters } from "./write/actions";
import { auditRowData } from "./write/audit";
import { isKfUser, isPortalUser, portalContactIds, threadJson, userRef } from "./write/encode";
import { GUARD_TEXT, liveGuard } from "./write/guards";

const AT = "2026-10-24T09:00:00Z";
const ME = KF_USERS["u-rmm"]!;
const SELF = `self:${ME._id}`;
const DEV = { code: "ZZT-SUP-DEV", name: "ZZT Dev Supplier (fictional)", rowId: "PkZZTDEV001", contactRowId: "PkZZTDEVc01" };

/** The dev supplier: its one contact is the signed-in user's own portal user. */
const devSupplier = (me: { _id: string; Name: string; Email: string } = ME): RawItem =>
  ({
    _id: DEV.rowId,
    _created_at: "2026-10-20T10:00:00Z",
    _modified_at: "2026-10-20T10:00:00Z",
    Supplier_Code: DEV.code,
    Supplier_Legal_Name: DEV.name,
    DUNS_Number: "900000017",
    Supplier_Kind: LIST.supplierKind.manufacturer,
    Supplier_Country_Code: "DE",
    Supplier_Active: LIST.yes,
    [`Table::${TABLES.contacts}`]: [{ _id: DEV.contactRowId, Contacts_Key: "ZZT-SUP-DEV-c1", Contacts_Full_Name: me.Name, Contacts_Email: me.Email, Contacts_Title: "Dev tester", Contacts_Portal_User_Id: me._id, Contacts_Active: LIST.yes, Contacts_Can_Confirm: LIST.yes }],
  }) as RawItem;

/** Every item read in full (the fake's current items), as load.ts gives them to RMM or the administrator. */
function snapOf(fake: FakeClient): LiveSnapshot {
  const tasks = fake.tasks();
  const held = new Map(tasks.map((t) => [t.itemId, t]));
  const all = (f: "case" | "review" | "op") => fake.db[f].filter((it) => str(it, "_status") !== "Draft").map((it) => ({ ...structuredClone(it), ...(held.has(it._id) ? { _activity_instance_id: held.get(it._id)!.act } : {}) }));
  const form = (f: "audit" | "note" | "rmesSAF" | "rmesREG" | "supplier") => structuredClone(fake.db[f]);
  return { loadedAt: AT, items: { case: all("case"), review: all("review"), op: all("op") }, forms: { audit: form("audit"), config: fake.db.config, note: form("note"), rmesSAF: form("rmesSAF"), rmesREG: form("rmesREG"), supplier: form("supplier") }, tasks, unreadableCases: {}, reads: [], warnings: [] };
}

/** The one user (default: holding RMM and the Business administrator) signed in on the fake app, acting as `persona`,
 *  and the dev supplier's contact. */
function boot(persona: InternalPersonaId, user = "u-rmm", held: InternalPersonaId[] = ["rmm", "admin"]) {
  const identity = fixtureIdentity(held, user);
  const acting = fixtureActing(identity, persona);
  const u = KF_USERS[user]!;
  const db = appFixtures().db;
  const fake = createFakeClient({ items: { ...db, supplier: [...db.supplier, devSupplier(u)] }, me: { _id: u._id, Name: u.Name, Email: u.Email, roles: held } }, { now: () => AT });
  const b = {
    fake,
    identity,
    acting,
    m: undefined as unknown as Mapped,
    reload: () => (b.m = toAppState({ snap: snapOf(fake), identity, acting })),
    ctx: (): WriteCtx => ({ client: fake, identity, acting, index: b.m.index, webhooks: {}, now: () => AT, containerOk: true }),
  };
  b.reload();
  return b;
}

const usersWith = (s: AppState, email: string) => s.users.filter((u) => u.email.toLowerCase() === email.toLowerCase());
/** Every string anywhere in a value. */
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
const writes = (calls: FakeCall[]) => calls.filter((c) => ["create", "update", "submit", "formCreate", "formUpdate", "postWebhook"].includes(c.m) && !c.error);
const dataOf = (calls: FakeCall[], m: FakeCall["m"], flow: string) => calls.find((c) => c.m === m && c.flow === flow && !c.error)?.data as Record<string, unknown>;

describe("the signed-in user as a supplier contact (self contact, dev)", () => {
  it("acting as RMM: the contact is a supplier contact of the dev supplier, the New case picker offers it, and the internal user shows no e-mail", () => {
    const { m } = boot("rmm");
    expect(m.state.users.find((u) => u.id === SELF)).toMatchObject({ side: "supplier", supplierId: DEV.code, name: ME.Name, email: ME.Email, title: "Dev tester", mayConfirm: true, active: true });
    expect(m.state.suppliers.find((x) => x.id === DEV.code)?.contactIds).toEqual([SELF]);
    // the New case picker (features/rmm/NewCase.tsx) lists the domain's contactsOf
    expect(M.contactsOf(m.state, DEV.code, true).map((u) => u.id)).toEqual([SELF]);
    expect(m.index.suppliers.get(DEV.code)?.contactRows).toEqual({ [SELF]: DEV.contactRowId });
    // the internal user stays itself, without the e-mail the self contact holds (one e-mail per person in the domain)
    expect(m.state.users.find((u) => u.id === ME._id)).toMatchObject({ side: "internal", dept: "RMM", email: "" });
    expect(usersWith(m.state, ME.Email).map((u) => u.id)).toEqual([SELF]);
    // the other suppliers' contacts keep their portal user ids
    expect(M.contactsOf(m.state, "SUP-ZZT-SOLVARO", true).map((u) => u.id)).toEqual(expect.arrayContaining(["UsElena", "UsRavi"]));
  });

  it("acting as the Business administrator: the same contact under the same id, the alias user without the e-mail", () => {
    const { m } = boot("admin");
    expect(m.state.users.find((u) => u.id === SELF)).toMatchObject({ side: "supplier", supplierId: DEV.code, email: ME.Email });
    expect(m.state.suppliers.find((x) => x.id === DEV.code)?.contactIds).toEqual([SELF]);
    expect(m.index.suppliers.get(DEV.code)?.contactRows).toEqual({ [SELF]: DEV.contactRowId });
    expect(m.state.users.some((u) => u.id === ME._id)).toBe(false); // the Kissflow id is the alias "u-admin" here
    expect(m.state.users.find((u) => u.id === "u-admin")).toMatchObject({ side: "internal", email: "" });
    expect(usersWith(m.state, ME.Email).map((u) => u.id)).toEqual([SELF]);
  });

  it("supplier-side stamps of the user's Kissflow id are the self contact; Beiersdorf-side ones stay the acting user (every persona)", () => {
    for (const persona of ["rmm", "admin", "saf"] as const) {
      const acting = fixtureActing(fixtureIdentity(["rmm", "admin", "saf"], "u-rmm"), persona);
      const dir = new Directory(acting.me, ME._id);
      expect(dir.ensure(ME._id, "supplier"), persona).toBe(SELF);
      expect(dir.ensure(ME._id, "internal"), persona).toBe(acting.me.id);
      expect(dir.contactOf({ id: ME._id, email: ME.Email }), persona).toBe(SELF);
      // a stamp with the user's id is the user, never a contact of the same name registered before it
      const named = new Directory(acting.me, ME._id);
      named.contact("UsNamesake", { name: ME.Name, email: "namesake@zzt.example", supplierId: DEV.code });
      expect(named.contact(ME._id, { name: ME.Name, email: ME.Email, supplierId: DEV.code }), persona).toBe(SELF);
      expect(named.contactOf({ id: ME._id, name: ME.Name }), persona).toBe(SELF);
      const msg = { at: AT, text: "x" };
      const op = mapOp({ id: "OP-0009-01", dept: "RMM", question: "q", status: "in-progress", ref: { sectionId: "GEN" }, createdBy: ME._id, responsibleId: ME._id, thread: [{ ...msg, id: "m1", by: ME._id, side: "internal", action: "raised" }, { ...msg, id: "m2", by: ME._id, side: "supplier", action: "answered" }] } as unknown as OpenPoint, dir);
      expect(op.thread.map((x) => x.by), persona).toEqual([acting.me.id, SELF]);
      expect(op.createdBy, persona).toBe(acting.me.id);
      expect(mapConfirmation({ type: "completeness", by: ME._id, name: ME.Name, email: ME.Email, role: "", at: AT, reviewVersion: 1, note: "" } as Confirmation, dir).by, persona).toBe(SELF);
    }
  });

  it("a case contact read from Case_Contacts_JSON is the self contact with its own may-confirm, also for a role that can't read the supplier master", () => {
    const acting = fixtureActing(fixtureIdentity(["saf"], "u-rmm"), "saf");
    const dir = new Directory(acting.me, ME._id);
    const item = { _id: "PkCaseDev", Case_Code: "ZZT-0009", Supplier_Code: DEV.code, Case_Contacts_JSON: JSON.stringify([{ id: ME._id, name: ME.Name, email: ME.Email, title: "Dev tester", mayConfirm: false }]) } as RawItem;
    const base = caseBaseOf({ itemId: item._id, item, rows: [] }, "ZZT-0009", { tracks: new Map(), ops: new Map(), notes: new Map() }, dir);
    expect(base.contactIds).toEqual([SELF]);
    expect(base.contacts).toEqual([{ id: SELF, name: ME.Name, email: ME.Email }]);
    expect(dir.get(SELF)).toMatchObject({ side: "supplier", supplierId: DEV.code, mayConfirm: false });
    expect(dir.get(ME._id)).toMatchObject({ side: "internal", dept: "SAF" });
  });

  it("acting as RMM: a case with the self contact passes the live guard and the writers send the real Kissflow id; a reload maps it back", async () => {
    const b = boot("rmm");
    const input: A.NewCaseInput = { materialName: "DEVTEST Oil 1", inci: "Test", materialNo: "RM-900001", supplierId: DEV.code, contactIds: [SELF], markets: ["EU"], dueDate: "2026-11-30T00:00:00.000Z", priority: "normal" };
    const prev = b.m.state;
    expect(liveGuard("createCase", b.ctx(), prev, [input])).toBeNull();
    const made = A.createCase(prev, b.acting.me.id, input, AT);
    expect(A.wasRefused(prev, made.state), made.state.toasts.at(-1)?.text).toBe(false);
    const from = b.fake.calls.length;
    const r = await liveWriters.createCase!(b.ctx(), prev, made.state, [input]);
    expect(r, r.message).toMatchObject({ ok: true });
    const calls = b.fake.calls.slice(from);
    const data = dataOf(calls, "create", "case");
    expect(data).toMatchObject({ Portal_Contact_Ids: ME._id, Confirm_Contact_Ids: ME._id, Supplier_Contact_Emails: ME.Email, BDF_Contact_Email: ME.Email });
    expect(JSON.parse(String(data[CASE_START_FIELDS.portalAssignees]))).toEqual([{ _id: ME._id }]);
    expect(JSON.parse(String(data[CASE_START_FIELDS.caseContacts]))).toEqual([{ id: ME._id, name: ME.Name, email: ME.Email, title: "Dev tester", mayConfirm: true }]);
    // nothing that reaches Kissflow names the domain's "self:" id (the audit row's Snapshot_JSON included)
    expect(strings(writes(calls).map((c) => c.data)).filter((s) => s.includes("self:"))).toEqual([]);
    const header = JSON.parse(String(dataOf(calls, "formCreate", "audit").Snapshot_JSON)).case;
    expect(header.contacts.map((k: { id: string }) => k.id)).toEqual([ME._id]);

    // the reload: Case_Contacts_JSON's real id is the self contact again, and an open point on the case names the real id
    b.reload();
    const c = b.m.state.cases.find((x) => x.materialName === input.materialName)!;
    expect(c.supplierContactIds).toEqual([SELF]);
    const ref = b.m.index.cases.get(c.id)!;
    expect(ref.contacts.map((k) => k.id)).toEqual([SELF]);
    expect(portalContactIds(ref)).toEqual([ME._id]);
    expect(b.m.state.users.filter((u) => u.id === ME._id || u.id === SELF).map((u) => `${u.id} ${u.side}`).sort()).toEqual([`${ME._id} internal`, `${SELF} supplier`]);
  });

  it("threads and audit snapshots carry the real Kissflow id for the self contact's supplier messages", () => {
    for (const persona of ["rmm", "admin"] as const) {
      const b = boot(persona);
      const ctx = b.ctx();
      // the self contact is the Kissflow user behind it wherever an id becomes a Kissflow value
      expect(userRef(SELF, ctx), persona).toEqual({ _id: ME._id });
      expect([isKfUser(SELF), isPortalUser(SELF), isKfUser(selfContactId("")), isKfUser(selfContactId("system"))], persona).toEqual([true, true, false, false]);
      const op = { thread: [{ id: "m1", at: AT, by: b.acting.me.id, side: "internal", text: "q", action: "raised" }, { id: "m2", at: AT, by: SELF, side: "supplier", text: "a", action: "answered" }], edits: [] } as unknown as OpenPoint;
      expect(JSON.parse(threadJson(op, ctx)).thread.map((m: { by: string }) => m.by), persona).toEqual([ME._id, ME._id]);
      const row = auditRowData(ctx, { code: "op.raised", caseId: "ZZT-0003", object: { kind: "Open point", key: "OP-1" }, entries: [], snapshot: { op }, handoffs: [] });
      expect(String(row.Snapshot_JSON), persona).not.toContain("self:");
    }
  });

  it("acting as the Business administrator: editing the self contact's title saves on its own row (no 'already used' refusal)", async () => {
    const b = boot("admin");
    const prev = b.m.state;
    const patch = { title: "Dev lead" };
    expect(liveGuard("updateContact", b.ctx(), prev, [SELF, patch])).toBeNull();
    expect(liveGuard("setContactActive", b.ctx(), prev, [SELF, true])).not.toBe(GUARD_TEXT.contactUnknown);
    const next = M.updateContact(prev, b.acting.me.id, SELF, patch, AT);
    expect(A.wasRefused(prev, next), next.toasts.at(-1)?.text).toBe(false);
    const from = b.fake.calls.length;
    const r = await liveWriters.updateContact!(b.ctx(), prev, next, [SELF, patch]);
    expect(r, r.message).toMatchObject({ ok: true });
    const calls = b.fake.calls.slice(from);
    expect(dataOf(calls, "formUpdate", "supplier")[`Table::${TABLES.contacts}`]).toEqual([expect.objectContaining({ _id: DEV.contactRowId, Contacts_Title: "Dev lead", Contacts_Email: ME.Email })]);
    expect(strings(writes(calls).map((c) => c.data)).filter((s) => s.includes("self:"))).toEqual([]);
    const rows = childRows(b.fake.db.supplier.find((it) => it._id === DEV.rowId), TABLES.contacts, "Contacts_Email");
    expect(rows).toEqual([expect.objectContaining({ _id: DEV.contactRowId, Contacts_Title: "Dev lead", Contacts_Portal_User_Id: ME._id })]);
    b.reload();
    expect(b.m.state.users.find((u) => u.id === SELF)?.title).toBe("Dev lead");
  });

  it("a write that names the acting user takes its e-mail from the identity (reassigning a review to oneself)", async () => {
    const b = boot("mic", "u-mic", ["mic"]);
    const tobias = KF_USERS["u-mic"]!;
    expect(b.m.state.users.find((u) => u.id === tobias._id)?.email).toBe("");
    // the Microbiology review is with its role, and the reviewer takes it over
    const prev = { ...b.m.state, cases: b.m.state.cases.map((c) => (c.id === "ZZT-0003" ? { ...c, reviews: c.reviews.map((r) => (r.dept === "MIC" ? { ...r, assigneeId: "role:MIC" } : r)) } : c)) };
    const args = ["ZZT-0003", "MIC", tobias._id, "Back from holiday."];
    expect(liveGuard("reassignReview", b.ctx(), prev, args)).toBeNull();
    const next = A.reassignReview(prev, b.acting.me.id, "ZZT-0003", "MIC", tobias._id, "Back from holiday.", AT);
    expect(A.wasRefused(prev, next), next.toasts.at(-1)?.text).toBe(false);
    const from = b.fake.calls.length;
    const r = await liveWriters.reassignReview!(b.ctx(), prev, next, args);
    expect(r, r.message).toMatchObject({ ok: true });
    expect(dataOf(b.fake.calls.slice(from), "update", "review")).toMatchObject({ Assignee_User: { _id: tobias._id }, Assignee_Name: tobias.Name, Assignee_Email: tobias.Email });
  });

  it("without a self contact nothing changes: no 'self:' user, and every persona's own user keeps its e-mail", () => {
    for (const persona of ["rmm", "reg", "saf", "qm", "mic", "sus", "cus", "leg", "admin", "auditor", "owner"] as const) {
      const x = fixtureInput(persona);
      const { state } = toAppState(x);
      expect(state.users.filter((u) => u.id.startsWith("self:")), persona).toEqual([]);
      expect(state.users.find((u) => u.id === x.acting.me.id)?.email, persona).toBe(x.identity.email);
    }
  });
});
