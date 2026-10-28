// The supplier screens' fixes of 26 Oct (Thomas, testing), against the in-memory Kissflow (kf/fakeClient.ts) seeded
// with the live-shaped fixtures. Fictional people and suppliers only; Katrin Vogel (RMM, Business administrator and
// Admin / Developer) stands in for Thomas.
// - A portal user per contact row: a new supplier's contact rows each carry their own Contacts_Portal_User_Id, a new
//   contact too, and the Edit supplier form saves several contacts' portal users in one Table::Contacts delta; no two
//   contacts may share one (the contact's id IS its portal user id). RMM's New case then lists both contacts.
// - One e-mail may be a Beiersdorf user and a supplier contact, or a contact at two suppliers: the e-mail check is per
//   supplier, and everything that finds a person by e-mail looks within the case's supplier.
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import * as M from "@/domain/suppliers";
import { TWO_ROWS_SAME_ID, portalIdProblems } from "@/components/portalUser";
import { checkInvariants } from "@/domain/invariants";
import type { AppState, InternalPersonaId } from "@/domain/types";
import { childRows, json, str, type RawItem } from "@/portal/data/raw";
import { LIST, TABLES } from "../ids";
import { createFakeClient, type FakeCall, type FakeClient } from "../kf/fakeClient";
import { caseBaseOf } from "../map/caseMap";
import { Directory } from "../map/people";
import { toAppState } from "../map/toAppState";
import { NO_PORTAL_CONTACT, SECOND_SUPPLIER, appFixtures, fixtureActing, fixtureIdentity } from "../testing/rawFixtures";
import type { Identity, LiveSnapshot, Mapped, WritableMethod, WriteCtx, WriteResult } from "../types";
import { PORTAL_TEXT, liveWriters, setContactPortalUsers } from "./actions";
import { GUARD_TEXT, liveGuard, portalIdsProblem } from "./guards";

const AT = "2026-10-26T09:00:00Z";
const DUE = "2026-11-30T00:00:00.000Z";
const SOLVARO = "SUP-ZZT-SOLVARO";
const JOANA = `contact:${NO_PORTAL_CONTACT.key}`;

/** Every item read in full (the fake's current items), as load.ts gives them to RMM or the administrator. */
function snapOf(fake: FakeClient): LiveSnapshot {
  const tasks = fake.tasks();
  const held = new Map(tasks.map((t) => [t.itemId, t]));
  const all = (f: "case" | "review" | "op") => fake.db[f].filter((it) => str(it, "_status") !== "Draft").map((it) => ({ ...structuredClone(it), ...(held.has(it._id) ? { _activity_instance_id: held.get(it._id)!.act } : {}) }));
  const form = (f: "audit" | "note" | "rmesSAF" | "rmesREG" | "supplier") => structuredClone(fake.db[f]);
  return { loadedAt: AT, items: { case: all("case"), review: all("review"), op: all("op") }, forms: { audit: form("audit"), config: fake.db.config, note: form("note"), rmesSAF: form("rmesSAF"), rmesREG: form("rmesREG"), supplier: form("supplier") }, tasks, unreadableCases: {}, reads: [], warnings: [] };
}

/** One signed-in user holding `held` (and Admin / Developer unless `developer: false`) on the fake app. */
function session(held: InternalPersonaId[] = ["admin", "rmm"], o: { developer?: boolean; db?: Record<string, RawItem[]> } = {}) {
  const identity: Identity = { ...fixtureIdentity(held, "u-rmm"), developer: o.developer ?? true };
  const fake = createFakeClient({ items: o.db ?? structuredClone(appFixtures().db), me: { _id: identity.kfUserId, Name: identity.name, Email: identity.email, roles: held } }, { now: () => AT });
  const t = {
    identity,
    fake,
    acting: fixtureActing(identity, held[0]!),
    m: undefined as unknown as Mapped,
    /** Acts as `persona` on a fresh load. */
    as(persona: InternalPersonaId): Mapped {
      t.acting = fixtureActing(identity, persona);
      t.m = toAppState({ snap: snapOf(fake), identity, acting: t.acting });
      return t.m;
    },
    ctx: (): WriteCtx => ({ client: fake, identity, acting: t.acting, index: t.m.index, webhooks: {}, now: () => AT, containerOk: true }),
    /** The store's steps (DESIGN §6): the live guard, the domain action (accepted), the writer. */
    async act(method: WritableMethod, args: unknown[], domain: (s: AppState, by: string) => AppState): Promise<{ r: WriteResult; calls: FakeCall[]; next: AppState }> {
      const prev = t.m.state;
      expect(liveGuard(method, t.ctx(), prev, args)).toBeNull();
      const next = domain(prev, t.acting.me.id);
      expect(A.wasRefused(prev, next), next.toasts.at(-1)?.text).toBe(false);
      const from = fake.calls.length;
      const r = await liveWriters[method]!(t.ctx(), prev, next, args);
      expect(r, r.message).toMatchObject({ ok: true });
      return { r, calls: fake.calls.slice(from), next };
    },
  };
  t.as(held[0]!);
  return t;
}

const WRITES = new Set<FakeCall["m"]>(["create", "update", "submit", "formCreate", "formUpdate"]);
const writesOf = (calls: FakeCall[]) => calls.filter((c) => WRITES.has(c.m) && !c.error).map((c) => `${c.m} ${c.flow}`);
const dataOf = (calls: FakeCall[], m: FakeCall["m"], flow: string) => calls.find((c) => c.m === m && c.flow === flow && !c.error)?.data as Record<string, unknown>;
const auditsOf = (calls: FakeCall[]) => calls.filter((c) => c.m === "formCreate" && c.flow === "audit" && !c.error).map((c) => c.data as Record<string, unknown>);
const logOf = (row: Record<string, unknown> | undefined) => json<{ log?: { action: string; detail: string }[] }>(row as RawItem, "Snapshot_JSON", {}).log ?? [];
const supplierRow = (fake: FakeClient, code: string) => fake.db.supplier.find((it) => str(it, "Supplier_Code") === code)!;
const contactRows = (fake: FakeClient, code: string) => childRows(supplierRow(fake, code), TABLES.contacts, "Contacts_Email");

const kestrel = (contacts: M.ContactInput[]): M.SupplierInput => ({ name: "Kestrel Polymers Ltd", duns: "209 558 317", country: "United Kingdom", city: "Runcorn", type: "manufacturer", contacts });
const oliver: M.ContactInput = { name: "Oliver Grant", email: "oliver.grant@kestrel.example", title: "Regulatory Lead", mayConfirm: true };
const priya: M.ContactInput = { name: "Priya Shah", email: "priya.shah@kestrel.example", title: "Customer Quality", mayConfirm: false };
const newCase = (supplierId: string, contactIds: string[]): A.NewCaseInput => ({ materialName: "KESTREL GLIDE 40", inci: "Dimethicone", materialNo: "RM-700040", supplierId, contactIds, markets: ["EU"], dueDate: DUE, priority: "normal" });

// ------------------------------------------------------------------------------------------------ Fix 3

describe("a portal user per contact row (Admin / Developer)", () => {
  it("a developer + Business administrator adds a supplier with two contacts, each with its own portal user; RMM's New case is not refused and lists both", async () => {
    const t = session(["admin", "rmm"]);
    const input = kestrel([{ ...oliver, portalUserId: "  UsZztOliver01 " }, { ...priya, portalUserId: "UsZztPriya01" }]);
    const { r, calls } = await t.act("addSupplier", [input], (s, by) => M.addSupplier(s, by, input, AT).state);
    expect(writesOf(calls)).toEqual(["formCreate supplier", "formCreate audit"]);
    const data = dataOf(calls, "formCreate", "supplier");
    expect(data.Supplier_Country_Code).toBe("GB");
    // each new row carries ITS contact's portal user (trimmed)
    expect((data[`Table::${TABLES.contacts}`] as RawItem[]).map((x) => [x.Contacts_Full_Name, x.Contacts_Portal_User_Id])).toEqual([
      ["Oliver Grant", "UsZztOliver01"],
      ["Priya Shah", "UsZztPriya01"],
    ]);
    expect(r.moved).toBe(true); // the contacts' ids change: the store reads everything again
    const [row] = auditsOf(calls);
    expect(logOf(row).map((e) => e.action)).toEqual(["Added supplier", "Linked portal user", "Linked portal user"]);
    expect(JSON.stringify(row)).not.toMatch(/linked to a supplier-portal user[^"]*UsZzt/);
    expect(String(row!.New_Value_Text ?? "")).not.toContain("UsZztOliver01");

    // RMM, after the reload: the supplier's contacts ARE their portal users, and New case goes ahead with both
    t.as("rmm");
    const sup = t.m.state.suppliers.find((x) => x.name === "Kestrel Polymers Ltd")!;
    expect(sup.contactIds).toEqual(["UsZztOliver01", "UsZztPriya01"]);
    expect(M.contactsOf(t.m.state, sup.id, true).map((u) => [u.id, u.name, u.mayConfirm])).toEqual([
      ["UsZztOliver01", "Oliver Grant", true],
      ["UsZztPriya01", "Priya Shah", false],
    ]);
    const nc = newCase(sup.id, sup.contactIds);
    const made = await t.act("createCase", [nc], (s, by) => A.createCase(s, by, nc, AT).state);
    expect(dataOf(made.calls, "create", "case")).toMatchObject({ Supplier_Code: sup.id, Portal_Contact_Ids: "UsZztOliver01,UsZztPriya01", Confirm_Contact_Ids: "UsZztOliver01", Supplier_Contact_Emails: "oliver.grant@kestrel.example,priya.shah@kestrel.example" });
  });

  it("a contact row without a portal user is fine (none yet); a Business administrator without Admin / Developer adds suppliers as before", async () => {
    const t = session(["admin", "rmm"], { developer: false });
    const input = kestrel([oliver, { ...priya, portalUserId: "" }]);
    const { r, calls } = await t.act("addSupplier", [input], (s, by) => M.addSupplier(s, by, input, AT).state);
    expect((dataOf(calls, "formCreate", "supplier")[`Table::${TABLES.contacts}`] as RawItem[]).some((x) => "Contacts_Portal_User_Id" in x)).toBe(false);
    expect(r.moved).toBe(false);
    expect(logOf(auditsOf(calls)[0]).map((e) => e.action)).toEqual(["Added supplier"]);
  });

  it("refuses before any write: no Admin / Developer, an id not shaped like a Kissflow user id, two rows with one id, an id another supplier's contact holds", () => {
    const t = session(["admin", "rmm"]);
    const guard = (contacts: M.ContactInput[], ctx = t.ctx()) => liveGuard("addSupplier", ctx, t.m.state, [kestrel(contacts)]);
    expect(guard([{ ...oliver, portalUserId: "UsZztOliver01" }], { ...t.ctx(), identity: { ...t.identity, developer: false } })).toBe(GUARD_TEXT.portalNotDeveloper);
    expect(guard([{ ...oliver, portalUserId: "Oliver Grant" }])).toBe("A Kissflow user id has no spaces.");
    expect(guard([{ ...oliver, portalUserId: "oliver.grant" }])).toMatch(/^Enter the Kissflow user id/);
    expect(guard([{ ...oliver, portalUserId: "UsZztSame01" }, { ...priya, portalUserId: " UsZztSame01" }])).toBe(GUARD_TEXT.portalTwice);
    // the contact id IS the portal id: Elena (Solvaro) holds UsElena, so a Kestrel contact with it would be Elena
    expect(guard([{ ...oliver, portalUserId: "UsElena" }])).toBe(GUARD_TEXT.portalHeld("Elena Márquez"));
    expect(guard([{ ...oliver, portalUserId: "UsZztOliver01" }, { ...priya, portalUserId: "UsZztPriya01" }])).toBeNull();
    expect(GUARD_TEXT.portalTwice).toBe("Two contacts have the same portal user ID. Each contact needs its own: the app knows a contact by this ID, so two contacts with one ID would be one person.");
  });

  it("a new contact from the contact window carries its portal user; one held by another contact is refused", async () => {
    const t = session(["admin", "rmm"]);
    const ines: M.ContactInput = { name: "Ines Duarte", email: "ines.duarte@solvaro.example", title: "Regulatory Specialist", mayConfirm: true, portalUserId: "UsZztInes01" };
    expect(liveGuard("addContact", t.ctx(), t.m.state, [SOLVARO, { ...ines, portalUserId: "UsRavi" }])).toBe(GUARD_TEXT.portalHeld("Ravi Menon"));
    const { r, calls } = await t.act("addContact", [SOLVARO, ines], (s, by) => M.addContact(s, by, SOLVARO, ines, AT).state);
    expect(dataOf(calls, "formUpdate", "supplier")[`Table::${TABLES.contacts}`]).toEqual([expect.objectContaining({ _is_created: true, Contacts_Full_Name: "Ines Duarte", Contacts_Portal_User_Id: "UsZztInes01" })]);
    expect(r.moved).toBe(true);
    expect(logOf(auditsOf(calls)[0]).map((e) => e.action)).toEqual(["Added contact", "Linked portal user"]);
    expect(t.as("admin").state.suppliers.find((x) => x.id === SOLVARO)!.contactIds).toContain("UsZztInes01");
  });

  it("Edit supplier: several contacts' portal users in ONE Table::Contacts delta with only {_id, Contacts_Portal_User_Id}, read back, one supplier.changed row", async () => {
    const t = session(["admin", "rmm"]);
    const rows = t.m.index.suppliers.get(SOLVARO)!.contactRows;
    const from = t.fake.calls.length;
    const r = await setContactPortalUsers(t.ctx(), t.m.state, [
      { contactId: "UsRavi", portalUserId: "UsZztRavi02" },
      { contactId: JOANA, portalUserId: " UsZztJoana01 " },
    ]);
    expect(r, r.message).toMatchObject({ ok: true, moved: true, message: PORTAL_TEXT.saved(["Ravi Menon", "Joana Pires"]) });
    expect(r.message).toBe("Portal users saved for Ravi Menon and Joana Pires. New cases send the questionnaire to each contact that has one.");
    const calls = t.fake.calls.slice(from);
    expect(calls.filter((c) => c.m === "formUpdate").map((c) => c.data)).toEqual([
      {
        [`Table::${TABLES.contacts}`]: [
          { _id: rows["UsRavi"], Contacts_Portal_User_Id: "UsZztRavi02" },
          { _id: rows[JOANA], Contacts_Portal_User_Id: "UsZztJoana01" },
        ],
      },
    ]);
    expect(calls.some((c) => c.m === "formGet" && c.flow === "supplier")).toBe(true);
    const audits = auditsOf(calls);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ Action_Code: "supplier.changed", Object_Key: SOLVARO, Object_State: "Portal users changed" });
    expect(logOf(audits[0]).map((e) => e.action)).toEqual(["Linked portal user", "Linked portal user"]);
    expect(String(audits[0]!.New_Value_Text ?? "")).not.toMatch(/UsZzt/);
    const after = t.as("admin").state;
    expect(after.suppliers.find((x) => x.id === SOLVARO)!.contactIds).toEqual(["UsElena", "UsZztRavi02", "UsZztJoana01"]);
    // a running case still names Ravi (found by e-mail within its supplier)
    expect(after.cases.find((c) => c.id === "ZZT-0003")!.supplierContactIds).toContain("UsZztRavi02");
  });

  it("Edit supplier: a portal user can move between contacts of the save; one another contact keeps is refused; only Admin / Developer", async () => {
    const t = session(["admin", "rmm"]);
    expect((await setContactPortalUsers(t.ctx(), t.m.state, [{ contactId: JOANA, portalUserId: "UsZztShared01" }])).ok).toBe(true);
    t.as("admin");
    // Joana hands the id to Henrik? No: another supplier's contact may not take it while Joana keeps it
    expect(portalIdsProblem(t.ctx(), t.m.state, [{ contactId: "contact:c-henrik", value: "UsZztShared01" }])).toBe(GUARD_TEXT.portalHeld("Joana Pires"));
    const held = await setContactPortalUsers(t.ctx(), t.m.state, [{ contactId: "UsRavi", portalUserId: "UsZztShared01" }]);
    expect(held).toMatchObject({ ok: false, message: `Not saved: ${GUARD_TEXT.portalHeld("Joana Pires")}` });
    // … but within one save Joana gives it up and Ravi takes it
    const moved = await setContactPortalUsers(t.ctx(), t.m.state, [
      { contactId: "UsZztShared01", portalUserId: "" },
      { contactId: "UsRavi", portalUserId: "UsZztShared01" },
    ]);
    expect(moved, moved.message).toMatchObject({ ok: true });
    expect(contactRows(t.fake, SOLVARO).map((x) => [str(x, "Contacts_Full_Name"), str(x, "Contacts_Portal_User_Id")])).toEqual([
      ["Elena Márquez", "UsElena"],
      ["Ravi Menon", "UsZztShared01"],
      ["Joana Pires", ""],
    ]);
    // two contacts of one save with one id; contacts of two suppliers; no role
    t.as("admin");
    expect((await setContactPortalUsers(t.ctx(), t.m.state, [{ contactId: "UsElena", portalUserId: "UsZztTwice01" }, { contactId: JOANA, portalUserId: "UsZztTwice01" }])).message).toBe(`Not saved: ${GUARD_TEXT.portalTwice}`);
    expect((await setContactPortalUsers(t.ctx(), t.m.state, [{ contactId: "UsElena", portalUserId: "UsZztA0001" }, { contactId: "contact:c-henrik", portalUserId: "UsZztB0001" }])).message).toBe("Not saved: Save the portal users of one supplier at a time.");
    const none = { ...t.ctx(), identity: { ...t.identity, developer: false } };
    expect((await setContactPortalUsers(none, t.m.state, [{ contactId: JOANA, portalUserId: "UsZztC0001" }])).message).toBe(`Not saved: ${PORTAL_TEXT.notDeveloper}`);
  });
});

describe("the forms' row check as typed (components/portalUser.tsx portalIdProblems)", () => {
  const holders: Record<string, { id: string; name: string }> = { UsElena: { id: "UsElena", name: "Elena Márquez" }, UsRavi: { id: "UsRavi", name: "Ravi Menon" } };
  const holderOf = (v: string) => holders[v];

  it("Add supplier rows: shape, two rows with one id, an id another contact holds; empty is fine", () => {
    expect(portalIdProblems([{ key: "a", value: "" }, { key: "b", value: "  " }], holderOf)).toEqual({});
    expect(portalIdProblems([{ key: "a", value: "Oliver Grant" }], holderOf)).toEqual({ a: "A Kissflow user id has no spaces." });
    expect(portalIdProblems([{ key: "a", value: "UsZztSame01" }, { key: "b", value: " UsZztSame01 " }], holderOf)).toEqual({ a: TWO_ROWS_SAME_ID, b: TWO_ROWS_SAME_ID });
    expect(portalIdProblems([{ key: "a", value: "UsElena" }], holderOf)).toEqual({ a: "This portal user is already linked to Elena Márquez." });
    expect(portalIdProblems([{ key: "a", value: "UsZztOliver01" }, { key: "b", value: "UsZztPriya01" }], holderOf)).toEqual({});
  });

  it("Edit supplier rows: an unchanged id is not re-checked; ids may move between the form's contacts, not onto another contact's", () => {
    const rows = (elena: string, ravi: string) => [
      { key: "e", contactId: "UsElena", value: elena, changed: elena !== "UsElena" },
      { key: "r", contactId: "UsRavi", value: ravi, changed: ravi !== "UsRavi" },
    ];
    expect(portalIdProblems(rows("UsElena", "UsRavi"), holderOf)).toEqual({});
    expect(portalIdProblems(rows("UsElena", "UsElena"), holderOf)).toEqual({ r: TWO_ROWS_SAME_ID });
    expect(portalIdProblems(rows("UsRavi", "UsElena"), holderOf)).toEqual({}); // a swap within the form
    expect(portalIdProblems(rows("", "UsElena"), holderOf)).toEqual({}); // Elena gives hers up, Ravi takes it
    expect(portalIdProblems([{ key: "h", contactId: "contact:c-henrik", value: "UsRavi", changed: true }], holderOf)).toEqual({ h: "This portal user is already linked to Ravi Menon." });
  });
});

// ------------------------------------------------------------------------------------------------ Fix 2

describe("one e-mail as a Beiersdorf user and a supplier contact, or as a contact at two suppliers", () => {
  it("Thomas's own e-mail as a contact of a supplier (its own portal user), used on a New case", async () => {
    const t = session(["admin", "rmm"]);
    const me = t.identity;
    const input: M.SupplierInput = { name: "ZZT Dev Test Supplier", duns: "900 000 025", country: "Germany", type: "manufacturer", contacts: [{ name: me.name, email: me.email.toUpperCase(), title: "Tester", mayConfirm: true, portalUserId: "UsZztPortalKatrin" }] };
    // before 26 Oct: "This e-mail is already used by Katrin Vogel."
    expect(M.validateSupplier(t.m.state, input)).toEqual({});
    await t.act("addSupplier", [input], (s, by) => M.addSupplier(s, by, input, AT).state);
    t.as("rmm");
    const s = t.m.state;
    const sup = s.suppliers.find((x) => x.name === "ZZT Dev Test Supplier")!;
    expect(sup.contactIds).toEqual(["UsZztPortalKatrin"]);
    expect(s.users.find((u) => u.id === "UsZztPortalKatrin")).toMatchObject({ side: "supplier", supplierId: sup.id, email: me.email, name: me.name });
    // the Beiersdorf user keeps her e-mail: the contact is another (portal) user
    expect(s.users.find((u) => u.id === me.kfUserId)).toMatchObject({ side: "internal", email: me.email });
    expect(checkInvariants(s)).toEqual([]);
    // New case lists the contact and is not refused
    expect(M.contactsOf(s, sup.id, true).map((u) => u.id)).toEqual(["UsZztPortalKatrin"]);
    const nc = newCase(sup.id, ["UsZztPortalKatrin"]);
    const made = await t.act("createCase", [nc], (x, by) => A.createCase(x, by, nc, AT).state);
    expect(dataOf(made.calls, "create", "case")).toMatchObject({ Portal_Contact_Ids: "UsZztPortalKatrin", Confirm_Contact_Ids: "UsZztPortalKatrin", Supplier_Contact_Emails: me.email, BDF_Contact_Email: me.email, Owner_RMM: { _id: me.kfUserId } });
    // read again: the case's contact is the supplier contact, its owner the Beiersdorf user
    const c = t.as("rmm").state.cases.find((x) => x.supplierId === sup.id)!;
    expect([c.supplierContactIds, c.ownerId]).toEqual([["UsZztPortalKatrin"], me.kfUserId]);
    // later edits of that contact are not refused for the e-mail
    t.as("admin");
    expect(A.wasRefused(t.m.state, M.updateContact(t.m.state, t.acting.me.id, "UsZztPortalKatrin", { title: "Dev tester" }, AT))).toBe(false);
  });

  it("… and as the self contact (the contact's portal user is the signed-in user's own): New case goes ahead too", async () => {
    const t = session(["admin", "rmm"]);
    const me = t.identity;
    const input: M.SupplierInput = { name: "ZZT Self Test Supplier", duns: "900 000 033", country: "Germany", type: "manufacturer", contacts: [{ name: me.name, email: me.email, title: "Tester", mayConfirm: true, portalUserId: me.kfUserId }] };
    await t.act("addSupplier", [input], (s, by) => M.addSupplier(s, by, input, AT).state);
    const s = t.as("rmm").state;
    const sup = s.suppliers.find((x) => x.name === "ZZT Self Test Supplier")!;
    expect(sup.contactIds).toEqual([`self:${me.kfUserId}`]);
    const nc = newCase(sup.id, sup.contactIds);
    const made = await t.act("createCase", [nc], (x, by) => A.createCase(x, by, nc, AT).state);
    expect(dataOf(made.calls, "create", "case")).toMatchObject({ Portal_Contact_Ids: me.kfUserId, Supplier_Contact_Emails: me.email });
  });

  it("the same e-mail at two suppliers: two contacts, and every look-up by e-mail stays within the case's supplier", () => {
    const db = structuredClone(appFixtures().db) as Record<string, RawItem[]>;
    const elena = contactRows({ db } as unknown as FakeClient, SOLVARO).find((x) => str(x, "Contacts_Full_Name") === "Elena Márquez")!;
    const ravi = contactRows({ db } as unknown as FakeClient, SOLVARO).find((x) => str(x, "Contacts_Full_Name") === "Ravi Menon")!;
    // a second supplier whose contacts (no portal users) have Elena's and Ravi's e-mails; its row comes FIRST
    const twin = { _id: "PkSupTwin", _created_at: AT, _modified_at: AT, Supplier_Code: "SUP-ZZT-TWIN", Supplier_Legal_Name: "ZZT Twin Distribution (fictional)", DUNS_Number: "900000041", Supplier_Kind: LIST.supplierKind.distributor, Supplier_Country_Code: "AT", Supplier_Active: LIST.yes,
      [`Table::${TABLES.contacts}`]: [
        { _id: "Contacts_twin1", Contacts_Key: "c-twin1", Contacts_Full_Name: "Elena M. (Twin)", Contacts_Email: str(elena, "Contacts_Email").toUpperCase(), Contacts_Can_Confirm: LIST.yes, Contacts_Active: LIST.yes },
        { _id: "Contacts_twin2", Contacts_Key: "c-twin2", Contacts_Full_Name: "Ravi M. (Twin)", Contacts_Email: str(ravi, "Contacts_Email"), Contacts_Can_Confirm: LIST.yes, Contacts_Active: LIST.yes },
      ] } as unknown as RawItem;
    db.supplier = [twin, ...db.supplier];
    const t = session(["admin", "rmm"], { db });
    for (const p of ["rmm", "admin"] as const) {
      const s = t.as(p).state;
      expect(M.contactsOf(s, "SUP-ZZT-TWIN").map((u) => u.id)).toEqual(["contact:c-twin1", "contact:c-twin2"]);
      expect(M.contactsOf(s, SOLVARO).map((u) => u.id)).toEqual(["UsElena", "UsRavi", JOANA]);
      // Solvaro's cases: the completeness stamps (by e-mail) are Solvaro's contacts, never the twin's
      for (const c of s.cases.filter((x) => x.supplierId === SOLVARO)) {
        for (const k of c.confirmations.filter((x) => x.type === "completeness" || x.type === "final-release")) expect(["UsElena", "UsRavi"], `${c.id} ${k.type}`).toContain(k.by);
        for (const id of c.supplierContactIds) expect(s.users.find((u) => u.id === id)?.supplierId, `${c.id} ${id}`).toBe(SOLVARO);
      }
      expect(checkInvariants(s)).toEqual([]);
    }
    // the directory itself: by e-mail (and by name) within the supplier asked for
    const dir = new Directory(t.acting.me, t.identity.kfUserId);
    const a = dir.contact("UsElena", { name: "Elena Márquez", email: "same@zzt.example", supplierId: SOLVARO });
    const b = dir.contact("contact:c-twin1", { name: "Elena M. (Twin)", email: "SAME@zzt.example", supplierId: "SUP-ZZT-TWIN" });
    expect([dir.contactOf({ email: "same@zzt.example" }, "SUP-ZZT-TWIN"), dir.contactOf({ email: "same@zzt.example" }, SOLVARO)]).toEqual([b, a]);
    expect(dir.contactIdByEmail("same@zzt.example", undefined, "SUP-ZZT-TWIN")).toBe(b);
    // a case of the twin that names its contact by e-mail only (no portal user) is the twin's contact
    const item = { _id: "PkCaseTwin", Case_Code: "ZZT-0090", Supplier_Code: "SUP-ZZT-TWIN", Case_Contacts_JSON: JSON.stringify([{ name: "Elena M.", email: "same@zzt.example" }]) } as RawItem;
    expect(caseBaseOf({ itemId: item._id, item, rows: [] }, "ZZT-0090", { tracks: new Map(), ops: new Map(), notes: new Map() }, dir).contactIds).toEqual([b]);
    // an unknown e-mail at a third supplier is a stand-in, not either contact
    expect(dir.contactOf({ email: "same@zzt.example" }, SECOND_SUPPLIER.code)).toBe("mail:same@zzt.example");
  });

  it("a note's @-mention by e-mail is the Beiersdorf user, never a supplier contact with the same e-mail", () => {
    const t = session(["admin", "rmm"]);
    const dir = new Directory(t.acting.me, t.identity.kfUserId);
    dir.contact("UsZztPortalKatrin", { name: "Katrin (portal)", email: t.identity.email, supplierId: SOLVARO });
    const colleague = dir.internal("UsQmLena", { name: "Lena Krause", email: "lena.krause@beiersdorf.example", dept: "QM" });
    dir.contact("UsZztLenaPortal", { name: "Lena (portal)", email: "lena.krause@beiersdorf.example", supplierId: SOLVARO });
    expect(dir.byEmail("lena.krause@beiersdorf.example")).toBe(colleague);
    expect(dir.byEmail(t.identity.email)).toBe(t.acting.me.id);
    expect(dir.byEmail("nobody@zzt.example")).toBeUndefined();
  });

  it("the domain: per supplier only, active or inactive; the invariant allows the same e-mail on both sides and at two suppliers", () => {
    const t = session(["admin", "rmm"]);
    const s = t.m.state;
    const by = t.acting.me.id;
    const ravi = s.users.find((u) => u.id === "UsRavi")!;
    // another Solvaro contact: refused (with its name); at Nordhafen or as the Beiersdorf user's e-mail: fine
    expect(M.addContact(s, by, SOLVARO, { name: "R. Menon", email: ravi.email }, AT).state.toasts.at(-1)?.text).toBe("Ravi Menon, another contact of this supplier, has this e-mail address.");
    expect(M.addContact(s, by, SECOND_SUPPLIER.code, { name: "R. Menon", email: ravi.email }, AT).id).toBeTruthy();
    expect(M.addContact(s, by, SECOND_SUPPLIER.code, { name: "K. Vogel", email: t.identity.email }, AT).id).toBeTruthy();
    const off = { ...s, users: s.users.map((u) => (u.id === "UsRavi" ? { ...u, active: false } : u)) };
    expect(M.validateContact(off, { name: "R. Menon", email: ravi.email }, { supplierId: SOLVARO }).email).toBe("Ravi Menon, an inactive contact of this supplier, has this e-mail address. Reactivate that contact instead.");
    // the contact itself keeps its own e-mail on an edit
    expect(A.wasRefused(s, M.updateContact(s, by, "UsRavi", { title: "QA Lead" }, AT))).toBe(false);
    const twoSides: AppState = { ...s, users: [...s.users, { id: "UsZztX", name: "X", email: t.identity.email, side: "supplier", supplierId: SECOND_SUPPLIER.code, title: "", initials: "X" }, { id: "UsZztY", name: "Y", email: ravi.email, side: "supplier", supplierId: SECOND_SUPPLIER.code, title: "", initials: "Y" }] };
    expect(checkInvariants(twoSides).filter((v) => /e-mail/.test(v))).toEqual([]);
    const sameSupplier: AppState = { ...s, users: [...s.users, { id: "UsZztZ", name: "Z", email: ravi.email.toUpperCase(), side: "supplier", supplierId: SOLVARO, title: "", initials: "Z" }] };
    expect(checkInvariants(sameSupplier).filter((v) => /e-mail/.test(v))).toEqual([`two contacts of ${SOLVARO} share an e-mail address`]);
  });
});
