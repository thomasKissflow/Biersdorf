// Suppliers and contacts (F1 CIQ Supplier; §8.14, BR-055). Pure builders (unit-tested) and the contact save sequence.
//
// - Contacts are written ONE ROW PER SAVE through the `Table::Contacts` operation (add, or modify with only the
//   changed columns), then re-read (write-then-verify) and merged: the parent mirrors `Contact_Portal_Ids_Text` and
//   `Pending_Invites` are recomputed from the READ-BACK rows and written only when they differ.
// - Deactivate (`Contacts_Active` = "No") instead of delete. No delete anywhere.
// - "Request portal invite" sets `Contacts_Invite_Requested_At` = now: requested, NOT sent. Thomas manages portal users.
// - `Contacts_Portal_User_Id` is typed by RMM as given by portal user management; the Workbench never generates it.
import { kfDateTime } from "../../data/normalize";
import { toSupplierVM } from "../../data/map";
import type { Actions } from "../../data/actions";
import type { ContactVM, Patch, RawItem, RowOp, SaveResult, SupplierVM } from "../../data/viewModels";

export const SUPPLIER_FLOW = "CIQ_Supplier_A00" as const;

export interface ContactInput {
  fullName: string;
  email: string;
  role: string;
  canConfirm: boolean;
  portalUserId: string;
  active: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lc = (s: string) => s.trim().toLowerCase();

/** Problems of a contact form; `editingId` is the row being edited (null for a new contact). */
export function validateContact(i: ContactInput, existing: readonly Pick<ContactVM, "_id" | "email">[], editingId: string | null): string[] {
  const out: string[] = [];
  if (!i.fullName.trim()) out.push("Name is required.");
  if (!i.email.trim()) out.push("E-mail is required.");
  else if (!EMAIL_RE.test(i.email.trim())) out.push("E-mail is not valid.");
  // A duplicate e-mail would match the other row by its natural key (Contacts_Email) on read-back.
  else if (existing.some((c) => c._id !== editingId && lc(c.email) === lc(i.email))) out.push("A contact with this e-mail already exists on this supplier: edit that one instead.");
  if (i.portalUserId.trim() && !/^[A-Za-z0-9_-]+$/.test(i.portalUserId.trim())) out.push("Portal user id: letters, digits, _ and - only (as given by portal user management).");
  return out;
}

const yn = (b: boolean) => (b ? "Yes" : "No");

/** The add row for a new contact (one row). */
export function addContactOp(i: ContactInput): RowOp {
  const row: Record<string, unknown> = {
    Contacts_Full_Name: i.fullName.trim(),
    Contacts_Email: i.email.trim(),
    Contacts_Can_Confirm: yn(i.canConfirm),
    Contacts_Active: yn(i.active),
  };
  if (i.role) row.Contacts_Role = i.role;
  if (i.portalUserId.trim()) row.Contacts_Portal_User_Id = i.portalUserId.trim();
  return { kind: "add", row };
}

/** A modify with ONLY the columns that changed against the row as read (merge, not overwrite). Null = no change. */
export function modifyContactOp(prev: ContactVM, i: ContactInput): RowOp | null {
  const row: Record<string, unknown> = {};
  if (i.fullName.trim() !== prev.fullName) row.Contacts_Full_Name = i.fullName.trim();
  if (i.email.trim() !== prev.email) row.Contacts_Email = i.email.trim();
  if ((i.role || "") !== (prev.role || "")) row.Contacts_Role = i.role;
  if (i.canConfirm !== prev.canConfirm) row.Contacts_Can_Confirm = yn(i.canConfirm);
  if (i.portalUserId.trim() !== prev.portalUserId) row.Contacts_Portal_User_Id = i.portalUserId.trim();
  if (i.active !== prev.active) row.Contacts_Active = yn(i.active);
  if (!Object.keys(row).length) return null;
  return { kind: "modify", _id: prev._id, row, key: { Contacts_Email: prev.email } };
}

export const deactivateOp = (c: ContactVM, active = false): RowOp => ({ kind: "modify", _id: c._id, row: { Contacts_Active: yn(active) }, key: { Contacts_Email: c.email } });
export const requestInviteOp = (c: ContactVM, now: Date): RowOp => ({ kind: "modify", _id: c._id, row: { Contacts_Invite_Requested_At: kfDateTime(now) }, key: { Contacts_Email: c.email } });

/** A contact waits for a portal invite [convention]: active, invite requested, no portal user id and not invited yet. */
export const isPendingInvite = (c: Pick<ContactVM, "active" | "inviteRequestedAt" | "portalUserId" | "invitedAt">): boolean => c.active && !!c.inviteRequestedAt && !c.portalUserId && !c.invitedAt;

/** The parent mirrors from the contact rows: active portal user ids (comma-separated, for search) and the pending
 *  invite count. */
export function mirrorsOf(contacts: readonly ContactVM[]): { Contact_Portal_Ids_Text: string; Pending_Invites: number } {
  const ids = [...new Set(contacts.filter((c) => c.active && c.portalUserId).map((c) => c.portalUserId.trim()))];
  return { Contact_Portal_Ids_Text: ids.join(","), Pending_Invites: contacts.filter(isPendingInvite).length };
}

/** The mirror patch for a supplier as read back, or null when the stored mirrors already match. */
export function mirrorPatch(s: Pick<SupplierVM, "contacts" | "contactPortalIdsText" | "pendingInvites">): Patch | null {
  const m = mirrorsOf(s.contacts);
  const fields: Patch["fields"] = {};
  if (m.Contact_Portal_Ids_Text !== (s.contactPortalIdsText || "")) fields.Contact_Portal_Ids_Text = m.Contact_Portal_Ids_Text;
  if (m.Pending_Invites !== (s.pendingInvites ?? null)) fields.Pending_Invites = m.Pending_Invites;
  return Object.keys(fields).length ? { fields } : null;
}

export interface ContactSave {
  contact: SaveResult;
  /** The mirror write, when the read-back mirrors differed. */
  mirrors?: SaveResult;
}

/** One contact row per save → read back (writeVerified) → mirrors from the read-back rows → write them if changed. */
export async function saveContact(a: Pick<Actions, "updateFormRow">, supplierId: string, op: RowOp): Promise<ContactSave> {
  const contact = await a.updateFormRow(SUPPLIER_FLOW, supplierId, { fields: {}, tables: { Contacts: [op] } });
  if (!contact.ok) return { contact };
  const back = toSupplierVM(contact.item as RawItem, "full");
  const mp = mirrorPatch(back);
  if (!mp) return { contact };
  return { contact, mirrors: await a.updateFormRow(SUPPLIER_FLOW, supplierId, mp) };
}

/** Supplier_Code is unique (checked client-side against the complete list, trimmed, case-insensitive). */
export function supplierCodeTaken(code: string, suppliers: readonly Pick<SupplierVM, "code">[]): boolean {
  return suppliers.some((s) => lc(s.code) === lc(code));
}

export const SUPPLIER_HEADER_FIELDS = ["Supplier_Legal_Name", "DUNS_Number", "Supplier_Kind", "Supplier_Country_Code", "SAP_Vendor_Id", "Teamcenter_Supplier_Id", "Supplier_Active", "Supplier_Test"] as const;

/** Header edit patch: only changed fields (Supplier_Code never changes: it is the isolation key). */
export function headerPatch(current: Readonly<Record<string, unknown>>, next: Record<string, unknown>): Patch {
  const fields: Patch["fields"] = {};
  for (const k of SUPPLIER_HEADER_FIELDS) {
    const a = current[k] === null || current[k] === undefined ? "" : String(current[k]);
    const b = next[k] === null || next[k] === undefined ? "" : String(next[k]);
    if (a !== b) fields[k] = b;
  }
  return { fields };
}
