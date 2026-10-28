// CIQ Supplier rows (the supplier master, Business administrator and RMM) → the prototype's Supplier[] and its contact
// Users (DESIGN §5.2). A contact's id is its portal user id (Contacts_Portal_User_Id), so the case contacts
// (Case_Contacts_JSON ids) and the supplier's stamps resolve to the same person; the signed-in user's own portal user is
// "self:<id>" (map/people.ts selfContactId); a contact without a portal user is "contact:<Contacts_Key>". Roles without
// the supplier master get suppliers synthesized from their cases. Pure.
import type { CiqCase, Supplier } from "@/domain/types";
import { childRows, str, type RawItem } from "@/portal/data/raw";
import { LIST, TABLES } from "../ids";
import type { SupplierRef } from "../types";
import type { Directory } from "./people";

const KIND_OF: Record<string, Supplier["type"]> = { [LIST.supplierKind.manufacturer]: "manufacturer", [LIST.supplierKind.distributor]: "distributor", Trader: "distributor" };

/** The contact id of a Contacts row (DESIGN §5.2): its portal user; else a contact the app created keeps its own key
 *  (the domain's "u-<supplier>-<n>", so the domain's next new contact gets the next number, not the same one: Thomas's
 *  report, 20 Oct, a second contact reused the first one's key); else "contact:<Contacts_Key or row id>". A row with a
 *  portal user keeps its key all the same: Supplier.contactKeys keeps it from the domain's next new contact (21 Oct). */
export const contactIdOf = (r: Record<string, unknown>): string => {
  const portal = str(r, "Contacts_Portal_User_Id");
  if (portal) return portal;
  const key = str(r, "Contacts_Key");
  return key && DOMAIN_CONTACT_ID.test(key) ? key : `contact:${key || str(r, "_id")}`;
};

/** The ids the domain gives the contacts it creates (domain/suppliers.ts contactUser): `u-<supplierId>-<n>`. */
export const DOMAIN_CONTACT_ID = /^u-.+-\d+$/;

/** Every supplier row with its contacts (registered in the directory, before the cases name them). A code seen twice
 *  keeps the newest row. `unread`: the rows whose contacts this load does not have (their list row only), marked
 *  `contactsUnread` on their ref. What was odd goes to `notes` (dev only: rows made by hand or by a script; the app
 *  writes neither a second row nor another kind, FE-CLEANUP B6, B7); the intended "Trader" → distributor mapping is
 *  only counted. */
export function suppliersFromRows(rows: RawItem[], dir: Directory, notes: string[], unread: ReadonlySet<string> = new Set()): { suppliers: Supplier[]; refs: SupplierRef[] } {
  const byCode = new Map<string, RawItem>();
  for (const it of rows) {
    const code = str(it, "Supplier_Code");
    if (!code) continue;
    const cur = byCode.get(code);
    if (cur) {
      notes.push(`Supplier ${code} appears twice in the supplier master; the newer row is shown.`);
      if ((str(cur, "_modified_at") || str(cur, "_created_at")) > (str(it, "_modified_at") || str(it, "_created_at"))) continue;
    }
    byCode.set(code, it);
  }
  const suppliers: Supplier[] = [];
  const refs: SupplierRef[] = [];
  let traders = 0;
  for (const [code, it] of byCode) {
    const kindText = str(it, "Supplier_Kind");
    const type = KIND_OF[kindText] ?? "manufacturer";
    if (kindText === "Trader") traders++;
    else if (kindText && !KIND_OF[kindText]) notes.push(`Supplier ${code}: unknown kind "${kindText}"; shown as manufacturer.`);
    const ref: SupplierRef = { supplierId: code, itemId: it._id, contactRows: {}, ...(unread.has(it._id) ? { contactsUnread: true as const } : {}) };
    const contactIds: string[] = [];
    // every key a row holds, whatever id its contact has now: the writers find a new row by its Contacts_Key
    const contactKeys: string[] = [];
    for (const r of childRows(it, TABLES.contacts, "Contacts_Email")) {
      const key = str(r, "Contacts_Key");
      if (key && !contactKeys.includes(key)) contactKeys.push(key);
      const deactivatedAt = str(r, "Contacts_Deactivated_At");
      // the directory's id (the signed-in user's own portal user is the self contact, map/people.ts), also for the row
      const id = dir.contact(contactIdOf(r), {
        name: str(r, "Contacts_Full_Name"),
        email: str(r, "Contacts_Email"),
        title: str(r, "Contacts_Title") || str(r, "Contacts_Role"),
        supplierId: code,
        mayConfirm: str(r, "Contacts_Can_Confirm") !== LIST.no,
        active: str(r, "Contacts_Active") !== LIST.no,
        ...(deactivatedAt ? { deactivatedAt } : {}),
      });
      if (!contactIds.includes(id)) contactIds.push(id);
      if (str(r, "_id")) ref.contactRows[id] = str(r, "_id");
    }
    suppliers.push({
      id: code,
      name: str(it, "Supplier_Legal_Name") || code,
      duns: str(it, "DUNS_Number"),
      country: str(it, "Supplier_Country_Code"),
      type,
      contactIds,
      ...(str(it, "Supplier_City") ? { city: str(it, "Supplier_City") } : {}),
      active: str(it, "Supplier_Active") !== LIST.no,
      ...(contactKeys.length ? { contactKeys } : {}),
    });
    refs.push(ref);
  }
  if (traders) notes.push(`${traders} supplier${traders === 1 ? " has" : "s have"} the kind "Trader", shown as distributor.`);
  return { suppliers, refs };
}

/** Suppliers the master does not list (or this role can't read), from their cases: name and DUNS from the case
 *  (Supplier_Legal_Name, BDF_Set_JSON FLD-GEN-003), the case contacts as contacts. */
export function suppliersFromCases(cases: CiqCase[], known: Supplier[]): Supplier[] {
  const out: Supplier[] = [];
  for (const c of cases) {
    if (!c.supplierId || known.some((s) => s.id === c.supplierId)) continue;
    let s = out.find((x) => x.id === c.supplierId);
    if (!s) {
      const duns = c.answers["FLD-GEN-003"];
      s = { id: c.supplierId, name: c.manufacturer || c.supplierId, duns: typeof duns === "string" ? duns : "", country: "", type: "manufacturer", contactIds: [], active: true };
      out.push(s);
    }
    for (const id of c.supplierContactIds) if (!s.contactIds.includes(id)) s.contactIds.push(id);
  }
  return out;
}
