// Supplier master (spec §4 Suppliers): an imported data master with no onboarding flow. Only the Business
// administrator adds and edits suppliers and contacts; RMM reads them. Contacts are deactivated, never deleted; deactivating a contact
// named on an open case hands that case to a replacement contact. Every change goes to the global log (state.log).

import { audit, logEvent, mapCase, refuse, toast } from "./core";
import { supplierMail } from "./mail";
import { check, isActiveUser, userOf } from "./permissions";
import { isClosed, nowIso } from "./selectors";
import type { AppState, CiqCase, LogEvent, Supplier, User } from "./types";

export interface ContactInput {
  name: string;
  email: string;
  title?: string;
  /** May confirm completeness and give the final release (default true). */
  mayConfirm?: boolean;
}

export interface SupplierInput {
  name: string;
  duns: string;
  country: string;
  city?: string;
  type: Supplier["type"];
  /** At least one; only used when adding a supplier (contacts are maintained one by one afterwards). */
  contacts: ContactInput[];
}

export type SupplierPatch = Partial<Pick<Supplier, "name" | "duns" | "country" | "city" | "type" | "active">>;

/** Validation messages by field: "name", "duns", "country", "type", "contacts", "contacts.0.name", "contacts.0.email". */
export type FieldErrors = Record<string, string>;

/** DUNS as stored: spaces and dashes removed, leading zeros kept. */
export const normaliseDuns = (raw: string) => raw.replace(/[\s-]/g, "");
export const isValidDuns = (raw: string) => /^\d{9}$/.test(normaliseDuns(raw));
export const normaliseEmail = (e: string) => e.trim().toLowerCase();
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i.test(e.trim());
const normaliseName = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");

const initialsOf = (n: string) =>
  n
    .replace(/^Dr\. /, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

/** Errors of a supplier form (empty object = valid). `editingId` skips the supplier itself in the uniqueness checks. */
export function validateSupplier(s: AppState, input: Partial<SupplierInput>, editingId?: string): FieldErrors {
  const e: FieldErrors = {};
  if (!input.name?.trim()) e.name = "Enter the supplier's name.";
  const duns = normaliseDuns(input.duns ?? "");
  if (!duns) e.duns = "Enter the DUNS number.";
  else if (!/^\d{9}$/.test(duns)) e.duns = "The DUNS number has exactly 9 digits.";
  else {
    const other = s.suppliers.find((x) => x.id !== editingId && normaliseDuns(x.duns) === duns);
    if (other) e.duns = `DUNS ${duns} is already used by ${other.name}${other.name.endsWith(".") ? "" : "."}`;
  }
  if (!input.country?.trim()) e.country = "Choose the country.";
  if (input.type !== undefined && input.type !== "manufacturer" && input.type !== "distributor") e.type = "Choose manufacturer or distributor.";
  if (!editingId || input.contacts) {
    const contacts = input.contacts ?? [];
    if (!contacts.length) e.contacts = "Add at least one contact.";
    contacts.forEach((c, i) => {
      const ce = validateContact(s, c, { others: contacts.filter((_, j) => j !== i).map((x) => x.email) });
      for (const [k, v] of Object.entries(ce)) e[`contacts.${i}.${k}`] = v;
    });
  }
  return e;
}

/** Errors of a contact form. The e-mail must be unique across every user (all suppliers and Beiersdorf). */
export function validateContact(s: AppState, input: Partial<ContactInput>, opts: { editingUserId?: string; others?: string[] } = {}): FieldErrors {
  const e: FieldErrors = {};
  if (!input.name?.trim()) e.name = "Enter the contact's name.";
  const mail = normaliseEmail(input.email ?? "");
  if (!mail) e.email = "Enter the e-mail address.";
  else if (!isValidEmail(mail)) e.email = "Enter a valid e-mail address, e.g. name@company.com.";
  else {
    const taken = s.users.find((u) => u.id !== opts.editingUserId && normaliseEmail(u.email) === mail);
    if (taken) e.email = `This e-mail is already used by ${taken.name}${taken.supplierId ? ` (${s.suppliers.find((x) => x.id === taken.supplierId)?.name ?? "another supplier"})` : ""}.`;
    else if ((opts.others ?? []).some((o) => normaliseEmail(o) === mail)) e.email = "Two contacts have the same e-mail address.";
  }
  return e;
}

/** Suppliers whose name looks the same (a warning on the form, not an error). */
export const similarSuppliers = (s: AppState, name: string, editingId?: string): Supplier[] => {
  const n = normaliseName(name);
  return n ? s.suppliers.filter((x) => x.id !== editingId && normaliseName(x.name) === n) : [];
};

/** The 1–2 contacts of a case: active contacts of that supplier. Null when valid, else the reason. */
export function validateCaseContacts(s: AppState, supplierId: string, ids: string[]): string | null {
  const unique = [...new Set(ids)];
  if (!unique.length) return "Choose at least one contact of the supplier.";
  if (unique.length > 2) return "A case has one or two supplier contacts.";
  for (const id of unique) {
    const u = userOf(s, id);
    if (!u || u.side !== "supplier" || u.supplierId !== supplierId) return "A case contact must be a contact of the chosen supplier.";
    if (!isActiveUser(u)) return `${u.name} is no longer active.`;
  }
  return null;
}

/**
 * The GEN contact e-mails (FLD-GEN-008/-009) that Beiersdorf sets at case start follow the case's current contacts:
 * after Edit case contacts, a replacement on deactivation or an e-mail change in the master. -009 goes when only one
 * contact is left. Prototype (liveScope) cases only; closed cases never change.
 */
export function syncContactAnswers(s: AppState, c: CiqCase): CiqCase {
  if (!c.liveScope || isClosed(c)) return c;
  const mails = c.supplierContactIds.map((id) => userOf(s, id)).filter((u): u is User => !!u && isActiveUser(u)).map((u) => u.email);
  const answers = { ...c.answers };
  answers["FLD-GEN-008"] = mails[0] ?? answers["FLD-GEN-008"] ?? "";
  if (mails[1]) answers["FLD-GEN-009"] = mails[1];
  else delete answers["FLD-GEN-009"];
  if (answers["FLD-GEN-008"] === c.answers["FLD-GEN-008"] && answers["FLD-GEN-009"] === c.answers["FLD-GEN-009"]) return c;
  return { ...c, answers };
}

// ---------------------------------------------------------------------------------- selectors

export const isActiveSupplier = (x: Supplier) => x.active !== false;
export const activeSuppliers = (s: AppState) => s.suppliers.filter(isActiveSupplier);
export const contactsOf = (s: AppState, supplierId: string, activeOnly = false): User[] =>
  s.users.filter((u) => u.side === "supplier" && u.supplierId === supplierId && (!activeOnly || isActiveUser(u)));
export const casesOfSupplier = (s: AppState, supplierId: string) => s.cases.filter((c) => c.supplierId === supplierId);
export const supplierHistory = (s: AppState, supplierId: string): LogEvent[] => s.log.filter((e) => e.supplierId === supplierId).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));

export interface SupplierRow {
  supplier: Supplier;
  activeContacts: number;
  contacts: number;
  openCases: number;
  cases: number;
  status: "active" | "inactive";
}

/** One row per supplier for the Suppliers list. */
export const supplierRows = (s: AppState): SupplierRow[] =>
  s.suppliers.map((x) => {
    const cs = casesOfSupplier(s, x.id);
    return { supplier: x, activeContacts: contactsOf(s, x.id, true).length, contacts: contactsOf(s, x.id).length, openCases: cs.filter((c) => !isClosed(c)).length, cases: cs.length, status: isActiveSupplier(x) ? "active" : "inactive" };
  });

/** What deactivating a contact would touch: its open cases, those that would lose their last active contact, and
 *  whether it is the supplier's last active contact (then it cannot be deactivated). */
export function contactDeactivationImpact(s: AppState, userId: string): { openCases: CiqCase[]; needsReplacement: CiqCase[]; lastActive: boolean } {
  const u = userOf(s, userId);
  const openCases = s.cases.filter((c) => !isClosed(c) && c.supplierContactIds.includes(userId));
  const needsReplacement = openCases.filter((c) => !c.supplierContactIds.some((id) => id !== userId && isActiveUser(userOf(s, id))));
  const lastActive = !!u?.supplierId && contactsOf(s, u.supplierId, true).filter((x) => x.id !== userId).length === 0;
  return { openCases, needsReplacement, lastActive };
}

// ---------------------------------------------------------------------------------- actions

/** A new contact's id `u-<supplierId>-<n>`: the first one no user, no contact added in this action (`taken`) and no
 *  row of the supplier (Supplier.contactKeys, live) has. */
const contactUser = (s: AppState, supplierId: string, input: ContactInput, taken: Set<string>): User => {
  const held = new Set(s.suppliers.find((x) => x.id === supplierId)?.contactKeys);
  let k = 1;
  while (taken.has(`u-${supplierId}-${k}`) || held.has(`u-${supplierId}-${k}`) || s.users.some((u) => u.id === `u-${supplierId}-${k}`)) k++;
  const id = `u-${supplierId}-${k}`;
  taken.add(id);
  return { id, name: input.name.trim(), email: normaliseEmail(input.email), title: input.title?.trim() || "Supplier contact", side: "supplier", supplierId, initials: initialsOf(input.name), active: true, mayConfirm: input.mayConfirm !== false };
};

const firstError = (e: FieldErrors) => Object.values(e)[0];

export function addSupplier(s: AppState, by: string, input: SupplierInput, at = nowIso()): { state: AppState; id: string | null } {
  const denied = check(s, by, "supplier.manage");
  if (denied) return { state: refuse(s, denied), id: null };
  const errors = validateSupplier(s, input);
  if (Object.keys(errors).length) return { state: refuse(s, firstError(errors)), id: null };
  const n = Math.max(0, ...s.suppliers.map((x) => Number(x.id.replace(/^s/, "")) || 0)) + 1;
  const id = `s${n}`;
  const taken = new Set<string>();
  const users = input.contacts.map((c) => contactUser(s, id, c, taken));
  const sup: Supplier = { id, name: input.name.trim(), duns: normaliseDuns(input.duns), country: input.country.trim(), city: input.city?.trim() || undefined, type: input.type, contactIds: users.map((u) => u.id), active: true };
  let next: AppState = { ...s, suppliers: [...s.suppliers, sup], users: [...s.users, ...users] };
  next = logEvent(next, { at, by, kind: "supplier", supplierId: id, action: "Added supplier", detail: `${sup.name} (DUNS ${sup.duns}, ${sup.city ? `${sup.city}, ` : ""}${sup.country}, ${sup.type}) with ${users.length} contact${users.length > 1 ? "s" : ""}: ${users.map((u) => `${u.name} <${u.email}>`).join(", ")}.` });
  return { state: toast(next, "success", `${sup.name} added to the suppliers.`), id };
}

const SUPPLIER_FIELD_LABEL: Record<keyof SupplierPatch, string> = { name: "Name", duns: "DUNS", country: "Country", city: "City", type: "Type", active: "Status" };

export function updateSupplier(s: AppState, by: string, supplierId: string, patch: SupplierPatch, at = nowIso()): AppState {
  const denied = check(s, by, "supplier.manage");
  if (denied) return refuse(s, denied);
  const cur = s.suppliers.find((x) => x.id === supplierId);
  if (!cur) return refuse(s, "This supplier no longer exists.");
  const merged = { ...cur, ...patch, duns: patch.duns !== undefined ? normaliseDuns(patch.duns) : cur.duns };
  const errors = validateSupplier(s, { ...merged, contacts: undefined }, supplierId);
  if (Object.keys(errors).length) return refuse(s, firstError(errors));
  if (patch.active === false && cur.active !== false) {
    const open = casesOfSupplier(s, supplierId).filter((c) => !isClosed(c));
    if (open.length) return refuse(s, `${cur.name} has open cases (${open.map((c) => c.id).join(", ")}). Cancel or complete them first.`);
  }
  const changes = (Object.keys(patch) as (keyof SupplierPatch)[])
    .filter((k) => JSON.stringify(merged[k]) !== JSON.stringify(cur[k]))
    .map((k) => (k === "active" ? `${SUPPLIER_FIELD_LABEL[k]}: ${merged.active === false ? "inactive" : "active"}` : `${SUPPLIER_FIELD_LABEL[k]}: ${String(cur[k] ?? "—")} → ${String(merged[k] ?? "—")}`));
  if (!changes.length) return s;
  let next: AppState = { ...s, suppliers: s.suppliers.map((x) => (x.id === supplierId ? merged : x)) };
  next = logEvent(next, { at, by, kind: "supplier", supplierId, action: patch.active === false ? "Deactivated supplier" : patch.active === true && cur.active === false ? "Reactivated supplier" : "Updated supplier", detail: `${changes.join("; ")}. Running cases keep the data they were started with.` });
  return toast(next, "success", `${merged.name} updated.`);
}

export function addContact(s: AppState, by: string, supplierId: string, input: ContactInput, at = nowIso()): { state: AppState; id: string | null } {
  const denied = check(s, by, "supplier.manage");
  if (denied) return { state: refuse(s, denied), id: null };
  const sup = s.suppliers.find((x) => x.id === supplierId);
  if (!sup) return { state: refuse(s, "This supplier no longer exists."), id: null };
  const errors = validateContact(s, input);
  if (Object.keys(errors).length) return { state: refuse(s, firstError(errors)), id: null };
  const u = contactUser(s, supplierId, input, new Set());
  let next: AppState = { ...s, users: [...s.users, u], suppliers: s.suppliers.map((x) => (x.id === supplierId ? { ...x, contactIds: [...x.contactIds, u.id] } : x)) };
  next = logEvent(next, { at, by, kind: "supplier", supplierId, action: "Added contact", detail: `${u.name} <${u.email}>, ${u.title}${u.mayConfirm ? ", may confirm" : ", may not confirm"}.` });
  return { state: toast(next, "success", `${u.name} added to ${sup.name}.`), id: u.id };
}

export function updateContact(s: AppState, by: string, userId: string, patch: Partial<ContactInput>, at = nowIso()): AppState {
  const denied = check(s, by, "supplier.manage");
  if (denied) return refuse(s, denied);
  const cur = userOf(s, userId);
  if (!cur || cur.side !== "supplier") return refuse(s, "This contact no longer exists.");
  const merged = { name: patch.name ?? cur.name, email: patch.email ?? cur.email, title: patch.title ?? cur.title, mayConfirm: patch.mayConfirm ?? cur.mayConfirm !== false };
  const errors = validateContact(s, merged, { editingUserId: userId });
  if (Object.keys(errors).length) return refuse(s, firstError(errors));
  const changes: string[] = [];
  if (merged.name.trim() !== cur.name) changes.push(`Name: ${cur.name} → ${merged.name.trim()}`);
  if (normaliseEmail(merged.email) !== cur.email) changes.push(`E-mail: ${cur.email} → ${normaliseEmail(merged.email)}`);
  if ((merged.title?.trim() || cur.title) !== cur.title) changes.push(`Title: ${cur.title} → ${merged.title?.trim()}`);
  if (merged.mayConfirm !== (cur.mayConfirm !== false)) changes.push(merged.mayConfirm ? "May confirm: yes" : "May confirm: no");
  if (!changes.length) return s;
  const u: User = { ...cur, name: merged.name.trim(), email: normaliseEmail(merged.email), title: merged.title?.trim() || cur.title, mayConfirm: merged.mayConfirm, initials: initialsOf(merged.name) };
  let next: AppState = { ...s, users: s.users.map((x) => (x.id === userId ? u : x)) };
  if (u.email !== cur.email) {
    // Open cases that name the contact show its current e-mail in General information.
    for (const c of next.cases.filter((x) => !isClosed(x) && x.supplierContactIds.includes(userId))) {
      next = mapCase(next, c.id, (x) => {
        const y = syncContactAnswers(next, x);
        return y === x ? x : audit(y, by, at, "Updated contact e-mail", `${u.name}: ${cur.email} → ${u.email}. The contact e-mails in General information follow.`, "GEN");
      });
    }
  }
  next = logEvent(next, { at, by, kind: "supplier", supplierId: cur.supplierId, action: "Updated contact", detail: `${u.name}: ${changes.join("; ")}. Earlier answers and confirmations keep the name they were given with.` });
  return toast(next, "success", `${u.name} updated.`);
}

/**
 * Deactivates or reactivates a contact (never deleted). A deactivated contact gets no mail or task and cannot act. On
 * every open case it is named on it is replaced by `replacementId` (an active contact of the same supplier) or, when
 * the case keeps another active contact, just removed. Refused when a case would be left without an active contact
 * and no replacement is given, or when it is the supplier's last active contact.
 */
export function setContactActive(s: AppState, by: string, userId: string, active: boolean, replacementId?: string, at = nowIso()): AppState {
  const denied = check(s, by, "supplier.manage");
  if (denied) return refuse(s, denied);
  const u = userOf(s, userId);
  if (!u || u.side !== "supplier" || !u.supplierId) return refuse(s, "This contact no longer exists.");
  if (active === isActiveUser(u)) return refuse(s, `${u.name} is already ${active ? "active" : "inactive"}.`, "info");
  const supplierId = u.supplierId;
  if (active) {
    let next: AppState = { ...s, users: s.users.map((x) => (x.id === userId ? { ...x, active: true } : x)) };
    next = logEvent(next, { at, by, kind: "supplier", supplierId, action: "Reactivated contact", detail: `${u.name} is active again. Add the contact to a case to give it access.` });
    return toast(next, "success", `${u.name} is active again.`);
  }
  const impact = contactDeactivationImpact(s, userId);
  if (impact.lastActive) return refuse(s, `${u.name} is the last active contact of this supplier. Add another contact first.`);
  let rep: User | undefined;
  if (replacementId) {
    rep = userOf(s, replacementId);
    if (!rep || rep.id === userId || rep.supplierId !== supplierId || !isActiveUser(rep)) return refuse(s, "The replacement must be another active contact of the same supplier.");
  } else if (impact.needsReplacement.length) {
    return refuse(s, `${u.name} is the only contact on ${impact.needsReplacement.map((c) => c.id).join(", ")}. Choose a replacement contact.`);
  }
  let next: AppState = { ...s, users: s.users.map((x) => (x.id === userId ? { ...x, active: false, deactivatedAt: at } : x)) };
  for (const c of impact.openCases) {
    const ids = [...new Set(c.supplierContactIds.map((id) => (id === userId ? (rep?.id ?? "") : id)).filter(Boolean))];
    const added = rep && !c.supplierContactIds.includes(rep.id);
    const after = next;
    next = mapCase(next, c.id, (x) =>
      audit(
        syncContactAnswers(after, { ...x, supplierContactIds: ids }),
        by,
        at,
        rep ? "Replaced supplier contact" : "Removed supplier contact",
        `${rep ? `${u.name} is no longer active; ${rep.name} takes over the request.` : `${u.name} is no longer active; the other case contact continues.`} The contact e-mails in General information follow.`,
      ),
    );
    if (added) next = supplierMail(next, next.cases.find((x) => x.id === c.id)!, "invitation", by, at, undefined, { to: [rep!.id] });
  }
  next = logEvent(next, { at, by, kind: "supplier", supplierId, action: "Deactivated contact", detail: `${u.name} <${u.email}> deactivated.${impact.openCases.length ? ` ${rep ? `${rep.name} takes over` : "Removed from"} ${impact.openCases.map((c) => c.id).join(", ")}.` : ""}` });
  return toast(next, "success", `${u.name} deactivated.`);
}
