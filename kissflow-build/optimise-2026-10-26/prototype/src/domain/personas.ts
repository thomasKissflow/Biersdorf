// Personas for the demo's "View as" (spec §3). Internal personas are static, one role holder each. Supplier personas
// are derived from the active contacts of the supplier master as "sup:<userId>"; the legacy ids "supplier" and
// "supplier2" resolve to the contacts u-sup-1 and u-sup-2 (or, if those are gone, the first and second active contact).

import { INTERNAL_PERSONAS, PERSONA_BY_ID, SUPPLIER_NAV, SUPPLIER_PERSONA_DESCRIPTION } from "./catalog";
import { unreadCount } from "./mail";
import { isActiveUser, userOf } from "./permissions";
import { reviewTasksFor, tasksForContact } from "./selectors";
import type { AppState, InternalPersonaId, Persona, PersonaId, Side, SupplierPersonaId, User } from "./types";

export const supplierPersonaId = (userId: string): SupplierPersonaId => `sup:${userId}`;
export const isSupplierPersonaId = (id: string): id is SupplierPersonaId => id.startsWith("sup:");

const activeContacts = (s: AppState) => s.users.filter((u) => u.side === "supplier" && isActiveUser(u) && s.suppliers.some((x) => x.id === u.supplierId && x.active !== false));

/** The derived persona of a supplier contact. */
export function supplierPersona(u: User): Persona {
  return { id: supplierPersonaId(u.id), label: "Supplier contact", userId: u.id, side: "supplier", landing: "/portal", description: SUPPLIER_PERSONA_DESCRIPTION, nav: SUPPLIER_NAV };
}

/** The canonical id: legacy supplier ids map to "sup:<userId>"; unknown or deactivated ones give undefined. */
export function resolvePersonaId(s: AppState, id: PersonaId | string): PersonaId | undefined {
  if (id === "supplier" || id === "supplier2") {
    const preferred = userOf(s, id === "supplier" ? "u-sup-1" : "u-sup-2");
    const list = activeContacts(s);
    const u = preferred && list.includes(preferred) ? preferred : list[id === "supplier" ? 0 : 1];
    return u ? supplierPersonaId(u.id) : undefined;
  }
  if (isSupplierPersonaId(id)) {
    const u = userOf(s, id.slice(4));
    return u && activeContacts(s).includes(u) ? id : undefined;
  }
  return INTERNAL_PERSONAS.some((p) => p.id === id) ? (id as InternalPersonaId) : undefined;
}

/**
 * The id a browser tab keeps when the data changed in another tab (or after a reload or a reset). A supplier window
 * never turns into an internal one: a deactivated contact (or one whose supplier was deactivated) stays itself, sees no
 * request and is refused every action; a contact that no longer exists becomes the first active contact. Undefined
 * only when nothing fits (the store then falls back to RMM).
 */
export function keepPersonaId(s: AppState, id: PersonaId | string): PersonaId | undefined {
  const r = resolvePersonaId(s, id);
  if (r) return r;
  if (!isSupplierPersonaId(id) && id !== "supplier" && id !== "supplier2") return undefined;
  const u = isSupplierPersonaId(id) ? userOf(s, id.slice(4)) : undefined;
  if (u?.side === "supplier") return supplierPersonaId(u.id);
  return resolvePersonaId(s, "supplier");
}

/** The persona for an id (static, derived or legacy). A deactivated contact keeps its supplier persona (it acts on
 *  nothing); undefined when the id does not resolve at all. */
export function personaOf(s: AppState, id: PersonaId | string): Persona | undefined {
  const r = resolvePersonaId(s, id);
  if (!r) {
    const u = isSupplierPersonaId(id) ? userOf(s, id.slice(4)) : undefined;
    return u?.side === "supplier" ? supplierPersona(u) : undefined;
  }
  if (isSupplierPersonaId(r)) {
    const u = userOf(s, r.slice(4));
    return u ? supplierPersona(u) : undefined;
  }
  return PERSONA_BY_ID[r as InternalPersonaId];
}

/** Open tasks of a person: a contact's supplier tasks; a reviewer's open review tasks. */
export function taskCountFor(s: AppState, userId: string): number {
  const u = userOf(s, userId);
  if (!u) return 0;
  return u.side === "supplier" ? tasksForContact(s, userId).length : reviewTasksFor(s, userId).length;
}

export interface SwitchablePerson {
  personaId: PersonaId;
  userId: string;
  name: string;
  initials: string;
  /** Role label (internal) or the contact's title (supplier). */
  roleLabel: string;
  title: string;
  side: Side;
  supplierId?: string;
  landing: string;
  tasks: number;
  unread: number;
}

export interface PersonGroup {
  key: string;
  title: string;
  side: Side;
  people: SwitchablePerson[];
}

const INTERNAL_GROUPS: { key: string; title: string; ids: InternalPersonaId[] }[] = [
  { key: "rmm", title: "Raw Material Management", ids: ["rmm"] },
  { key: "departments", title: "Department reviewers", ids: ["reg", "saf", "qm", "mic", "sus"] },
  { key: "informed", title: "Informed, read-only", ids: ["cus", "leg"] },
  { key: "oversight", title: "Administration and oversight", ids: ["admin", "auditor", "owner"] },
];

/**
 * Everyone the demo can "View as": Raw Material Management first, then each active supplier with its active contacts
 * (the demo switches between RMM and the supplier most), then the other Beiersdorf roles.
 */
export function switchablePeople(s: AppState): PersonGroup[] {
  const person = (p: Persona, u: User): SwitchablePerson => ({
    personaId: p.id,
    userId: u.id,
    name: u.name,
    initials: u.initials,
    roleLabel: p.side === "supplier" ? u.title : p.label,
    title: u.title,
    side: p.side,
    supplierId: u.supplierId,
    landing: p.landing,
    tasks: taskCountFor(s, u.id),
    unread: unreadCount(s, u.id),
  });
  const groups: PersonGroup[] = [];
  for (const g of INTERNAL_GROUPS) {
    const people = g.ids.flatMap((id) => {
      const p = PERSONA_BY_ID[id];
      const u = userOf(s, p.userId);
      return u ? [person(p, u)] : [];
    });
    if (people.length) groups.push({ key: g.key, title: g.title, side: "internal", people });
  }
  const contacts = activeContacts(s);
  const suppliers: PersonGroup[] = [];
  for (const sup of s.suppliers.filter((x) => x.active !== false)) {
    const people = contacts.filter((u) => u.supplierId === sup.id).map((u) => person(supplierPersona(u), u));
    if (people.length) suppliers.push({ key: `supplier:${sup.id}`, title: sup.name, side: "supplier", people });
  }
  const afterRmm = groups.findIndex((g) => g.key === "rmm") + 1;
  return [...groups.slice(0, afterRmm), ...suppliers, ...groups.slice(afterRmm)];
}
