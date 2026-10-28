// T3 suppliers and contacts (§8.14, BR-055): the single-row contact save with re-read and merge, the mirror recompute
// (Contact_Portal_Ids_Text, Pending_Invites), deactivate instead of delete, "requested, not sent" invites, and the
// client-side checks. Every person and supplier here is fictional (@example.test).
import { describe, expect, it } from "vitest";
import { fakeClient, fakeRuntime } from "../../testkit/fakeClient";
import { createActions } from "../../data/actions";
import { toSupplierVM } from "../../data/map";
import type { ContactVM, RawItem } from "../../data/viewModels";
import {
  SUPPLIER_FLOW,
  addContactOp,
  deactivateOp,
  headerPatch,
  isPendingInvite,
  mirrorPatch,
  mirrorsOf,
  modifyContactOp,
  requestInviteOp,
  saveContact,
  supplierCodeTaken,
  validateContact,
  type ContactInput,
} from "./contacts";

const contact = (id: string, o: Record<string, unknown>) => ({ _id: id, Contacts_Active: "Yes", ...o });
const supplierRaw = (): RawItem =>
  ({
    _id: "FmNW",
    Supplier_Code: "SUP-NW",
    Supplier_Legal_Name: "Northwind Botanicals GmbH",
    Supplier_Country_Code: "DE",
    Contact_Portal_Ids_Text: "PU-ana",
    Pending_Invites: 0,
    "Table::Contacts": [
      contact("Contacts_aaaaaaaaaa", { Contacts_Full_Name: "Ana Lindqvist", Contacts_Email: "ana.lindqvist@example.test", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: "PU-ana" }),
      contact("Contacts_bbbbbbbbbb", { Contacts_Full_Name: "Bo Tamsin", Contacts_Email: "bo.tamsin@example.test", Contacts_Can_Confirm: "No" }),
    ],
  }) as RawItem;
const input = (o: Partial<ContactInput> = {}): ContactInput => ({ fullName: "Cleo Varga", email: "cleo.varga@example.test", role: "Quality", canConfirm: true, portalUserId: "PU-cleo", active: true, ...o });

describe("contact checks and row operations", () => {
  const s = toSupplierVM(supplierRaw());
  it("validateContact: required name and e-mail, a valid e-mail, no duplicate e-mail on another row", () => {
    expect(validateContact(input(), s.contacts, null)).toEqual([]);
    expect(validateContact(input({ fullName: " ", email: "" }), s.contacts, null)).toEqual(["Name is required.", "E-mail is required."]);
    expect(validateContact(input({ email: "not-an-email" }), s.contacts, null)).toEqual(["E-mail is not valid."]);
    expect(validateContact(input({ email: "ANA.Lindqvist@example.test" }), s.contacts, null)[0]).toMatch(/already exists/);
    expect(validateContact(input({ email: "ana.lindqvist@example.test" }), s.contacts, "Contacts_aaaaaaaaaa")).toEqual([]);
    expect(validateContact(input({ portalUserId: "has space" }), s.contacts, null)[0]).toMatch(/Portal user id/);
  });
  it("add = one row; modify = only the changed columns (merge), keyed by the old e-mail; no change → null", () => {
    expect(addContactOp(input())).toEqual({ kind: "add", row: { Contacts_Full_Name: "Cleo Varga", Contacts_Email: "cleo.varga@example.test", Contacts_Can_Confirm: "Yes", Contacts_Active: "Yes", Contacts_Role: "Quality", Contacts_Portal_User_Id: "PU-cleo" } });
    const bo = s.contacts[1];
    const same: ContactInput = { fullName: bo.fullName, email: bo.email, role: bo.role, canConfirm: bo.canConfirm, portalUserId: bo.portalUserId, active: bo.active };
    expect(modifyContactOp(bo, same)).toBeNull();
    expect(modifyContactOp(bo, { ...same, portalUserId: "PU-bo" })).toEqual({ kind: "modify", _id: "Contacts_bbbbbbbbbb", row: { Contacts_Portal_User_Id: "PU-bo" }, key: { Contacts_Email: "bo.tamsin@example.test" } });
  });
  it("deactivate instead of delete; the invite request is a timestamp without ms (requested, not sent)", () => {
    const ana = s.contacts[0];
    expect(deactivateOp(ana)).toEqual({ kind: "modify", _id: ana._id, row: { Contacts_Active: "No" }, key: { Contacts_Email: ana.email } });
    expect(deactivateOp(ana, true).kind).toBe("modify");
    expect(requestInviteOp(s.contacts[1], new Date("2026-10-08T10:00:00.456Z"))).toEqual({ kind: "modify", _id: "Contacts_bbbbbbbbbb", row: { Contacts_Invite_Requested_At: "2026-10-08T10:00:00Z" }, key: { Contacts_Email: "bo.tamsin@example.test" } });
  });
  it("mirrors: active portal ids (unique, comma-separated) and pending invites", () => {
    const cs: ContactVM[] = [
      { ...s.contacts[0] },
      { ...s.contacts[1], inviteRequestedAt: "2026-10-08T10:00:00Z" },
      { ...s.contacts[0], _id: "x", portalUserId: "PU-old", active: false },
      { ...s.contacts[0], _id: "y" }, // the same id twice → once
    ];
    expect(mirrorsOf(cs)).toEqual({ Contact_Portal_Ids_Text: "PU-ana", Pending_Invites: 1 });
    expect(isPendingInvite({ active: true, inviteRequestedAt: "t", portalUserId: "PU-1", invitedAt: "" })).toBe(false);
    expect(mirrorPatch(s)).toBeNull();
    expect(mirrorPatch({ ...s, pendingInvites: null })).toEqual({ fields: { Pending_Invites: 0 } });
  });
  it("Supplier_Code uniqueness is case-insensitive; the header patch holds only changed fields and never the code", () => {
    expect(supplierCodeTaken(" sup-nw ", [s])).toBe(true);
    expect(supplierCodeTaken("SUP-LUMEN", [s])).toBe(false);
    expect(headerPatch(s.v, { ...s.v, Supplier_Code: "CHANGED", Supplier_Kind: "Manufacturer" }).fields).toEqual({ Supplier_Kind: "Manufacturer" });
    expect(headerPatch(s.v, { ...s.v, Supplier_Country_Code: null }).fields).toEqual({ Supplier_Country_Code: "" });
  });
});

describe("saveContact on the fake host (one row per save, re-read and merge, mirror recompute)", () => {
  const host = () => {
    const c = fakeClient();
    c.forms.set(SUPPLIER_FLOW, [supplierRaw()]);
    return { c, a: createActions(fakeRuntime(c)) };
  };
  it("adding a contact sends exactly one row, verifies it, then writes the recomputed mirrors", async () => {
    const { c, a } = host();
    const r = await saveContact(a, "FmNW", addContactOp(input()));
    expect(r.contact.ok).toBe(true);
    expect(r.mirrors?.ok).toBe(true);
    const upd = c.ops("formUpdate");
    expect(upd).toHaveLength(2);
    const rows = upd[0].data!["Table::Contacts"] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Contacts_Email: "cleo.varga@example.test", Contacts_Portal_User_Id: "PU-cleo", _is_created: true });
    expect(Object.keys(upd[0].data!)).toEqual(["Table::Contacts"]);
    expect(upd[1].data).toEqual({ Contact_Portal_Ids_Text: "PU-ana,PU-cleo" });
    const stored = toSupplierVM(c.forms.get(SUPPLIER_FLOW)![0]);
    expect(stored.contacts).toHaveLength(3); // the two existing rows are kept (merged, not replaced)
    expect(stored.contactPortalIdsText).toBe("PU-ana,PU-cleo");
  });
  it("a portal invite request raises Pending_Invites; deactivating removes the id from the mirror; no delete", async () => {
    const { c, a } = host();
    const s = toSupplierVM(c.forms.get(SUPPLIER_FLOW)![0]);
    const r1 = await saveContact(a, "FmNW", requestInviteOp(s.contacts[1], new Date("2026-10-08T10:00:00Z")));
    expect(r1.mirrors?.ok).toBe(true);
    expect(toSupplierVM(c.forms.get(SUPPLIER_FLOW)![0]).pendingInvites).toBe(1);
    const r2 = await saveContact(a, "FmNW", deactivateOp(s.contacts[0]));
    expect(r2.contact.ok).toBe(true);
    const after = toSupplierVM(c.forms.get(SUPPLIER_FLOW)![0]);
    expect(after.contacts.find((x) => x._id === "Contacts_aaaaaaaaaa")?.active).toBe(false);
    expect(after.contactPortalIdsText).toBe("");
    expect(c.ops().some((x) => /delete/i.test(x.op) || (x.data && JSON.stringify(x.data).includes("_is_deleted")))).toBe(false);
  });
  it("a refused contact write stops before the mirrors", async () => {
    const c = fakeClient({ script: { formUpdate: () => ({ error: "Not allowed" }) } });
    c.forms.set(SUPPLIER_FLOW, [supplierRaw()]);
    const r = await saveContact(createActions(fakeRuntime(c)), "FmNW", addContactOp(input()));
    expect(r.contact).toMatchObject({ ok: false, kind: "refused" });
    expect(r.mirrors).toBeUndefined();
    expect(c.ops("formUpdate")).toHaveLength(1);
  });
});
