// A supplier contact's supplier-portal user (CIQ Supplier, Contacts_Portal_User_Id; 26 Oct, Thomas): New case sends the
// questionnaire only to contacts that have one, and a contact's id in the live app IS that portal user id
// (app-live map/suppliersMap.ts contactIdOf). No CIQ screen set it before. The prototype has no portal users to link,
// so it provides nothing and the contact editor shows nothing; the live app (app-live LiveAppStore) provides the link,
// editable for holders of the "Admin / Developer" role, read-only for everyone else.
import { createContext, useContext } from "react";

export interface PortalUserLink {
  /** The signed-in user may set or clear it (live: holds Admin / Developer). */
  canEdit: boolean;
  /** The contact's portal user id as Kissflow holds it, "" when it has none. */
  idOf(contactId: string): string;
  /** The name of another contact that already has this portal user (undefined: free). */
  heldBy(portalUserId: string, contactId: string): string | undefined;
  /** Saves it (empty: clears it); resolves whether it reached Kissflow (the store toasts the outcome). */
  save(contactId: string, portalUserId: string): Promise<boolean>;
  /** 26 Oct: several contacts of ONE supplier in one save (the Edit supplier form's rows); as `save`. */
  saveMany(changes: readonly { contactId: string; portalUserId: string }[]): Promise<boolean>;
}

export const PortalUserLinkContext = createContext<PortalUserLink | null>(null);

/** The live link, or null in the prototype. */
export const usePortalUserLink = () => useContext(PortalUserLinkContext);

/** A Kissflow user id: "Us" and then letters, digits, _ or - (the live ids are about 12 characters). */
export const PORTAL_USER_ID = /^Us[A-Za-z0-9_-]{4,40}$/;

/** Why a typed portal user id can't be saved (trimmed; empty clears the link and is fine), else undefined. */
export function portalUserIdProblem(text: string): string | undefined {
  const v = text.trim();
  if (!v) return undefined;
  if (/\s/.test(v)) return "A Kissflow user id has no spaces.";
  if (!PORTAL_USER_ID.test(v)) return "Enter the Kissflow user id of the contact's supplier-portal user: “Us” followed by 4 to 40 letters, digits, _ or -.";
  return undefined;
}

/** Why each row's portal user id can't be saved (26 Oct: the Add / Edit supplier forms' contact rows and the contact
 *  window), by row key; a row without a problem has no entry. `rows`: every row of the form (`contactId`: an existing
 *  contact; `value` as typed, empty = none; `changed`: false for a row that keeps the id it has). `holderOf`: the
 *  contact (id and name) that holds a portal user id now. A row's id must be shaped like a Kissflow user id, no two rows
 *  may share one, and none may be held by a contact outside the form (of this supplier or any other) whose id stays:
 *  a contact's id in the live app IS its portal user id, so two contacts with one id would become one person. */
export function portalIdProblems(rows: readonly { key: string; contactId?: string; value: string; changed?: boolean }[], holderOf: (portalUserId: string) => { id: string; name: string } | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const inForm = new Set(rows.map((r) => r.contactId).filter(Boolean));
  for (const r of rows) {
    const v = r.value.trim();
    if (!v || r.changed === false) continue;
    const shape = portalUserIdProblem(v);
    if (shape) {
      out[r.key] = shape;
      continue;
    }
    if (rows.some((o) => o.key !== r.key && o.value.trim() === v)) {
      out[r.key] = TWO_ROWS_SAME_ID;
      continue;
    }
    const holder = holderOf(v);
    if (holder && holder.id !== r.contactId && !inForm.has(holder.id)) out[r.key] = `This portal user is already linked to ${holder.name}.`;
  }
  return out;
}

/** Two rows of one form with the same portal user id. */
export const TWO_ROWS_SAME_ID = "Two contacts have the same portal user ID. Each contact needs its own: the app knows a contact by this ID.";

/** The hint of a Portal user ID input. */
export const PORTAL_USER_HINT = "The Kissflow user id of this contact's supplier-portal user (Us…). New case sends the questionnaire only to contacts that have one. Each contact has its own.";

/** What clearing a link means, for the confirmation. */
export const CLEAR_PORTAL_USER = "Without a portal user this contact gets no questionnaire on new cases. Running cases keep the portal user they started with.";
