// Stand-in for @/domain/seed in the stand-alone call view build only (aliased in vite.call.config.ts). The call view
// reads no case, user or supplier data, so the shared page carries none of the prototype's demo data. Keep the exports
// in sync with src/domain/seed.ts (same names and types; empty data).
import type { AppState, CiqCase, Supplier, User } from "@/domain/types";

export const SCHEMA = 9;

export interface SupplierDef {
  id: string;
  name: string;
  duns: string;
  country: string;
  city: string;
  type: Supplier["type"];
  contacts: [string, string, string][];
}

export const ROLE_HOLDERS: User[] = [];
export const SUPPLIER_DEFS: SupplierDef[] = [];
export const DEMO_SUPPLIER_IDS: string[] = [];

export function makeUser(id: string, name: string, title: string, side: User["side"], dept?: User["dept"], supplierId?: string, domain = "example.invalid"): User {
  return { id, name, title, side, dept, supplierId, email: `${id}@${domain}`, initials: "?" };
}

export const supplierOf = (d: SupplierDef): Supplier => ({ id: d.id, name: d.name, duns: d.duns, country: d.country, city: d.city, type: d.type, contactIds: [], active: true });
export const contactsOfDef = (_d: SupplierDef): User[] => [];

export function baseState(users: User[], suppliers: Supplier[]): AppState {
  return { schema: SCHEMA, personaId: "rmm", cases: [], users, suppliers, templates: [], activeRuleSet: "RS-2026.1", config: { pairs: [] }, ownership: {}, reminders: [], toasts: [], mails: [], log: [], changeReports: [] };
}

export function buildSeed(): AppState {
  return baseState([], []);
}

export function caseById(s: AppState, id: string): CiqCase | undefined {
  return s.cases.find((c) => c.id === id);
}
