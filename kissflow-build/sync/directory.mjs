// People as the prototype sees them (User objects), built from Kissflow:
// - internal users: members of the app roles (role GET is proven; whether the user objects carry an e-mail is not:
//   a user without a known e-mail simply gets no mail and a warning in the run log);
// - supplier contacts: the Contacts child rows of CIQ Supplier. A contact's prototype id is its portal user id
//   (Contacts_Portal_User_Id), or `contact:<Contacts_Key>` without one, UNLESS that Kissflow user is SHARED (identity.mjs):
//   a member of an app department/persona role, the service's own user, or a contact of more than one supplier. A
//   shared contact gets the in-memory id `sup:<Supplier_Code>:<uid>`, so the internal person and each supplier side are
//   separate people in the world. `kfUserId` always holds the real Kissflow id; no minted id is ever written.
// - look-ups for a case are scoped to the case's supplier: `contactByEmail(email, code)` and `contactIdFor(uid, code)`
//   never fall back to a contact of another supplier.
// - a portal user listed twice at one supplier keeps both rows, as before identity.mjs: look-ups by id (Kissflow writes:
//   names, titles, mayConfirm) use the LAST row; the run log warns once per extra row.
//
// Kissflow roles are many-to-many; a prototype User has one department. So every person appears once with a primary
// department, plus one alias entry per further department (same id) that only department look-ups find
// (assigneeFor, deptUserIds). Request checks then PROJECT the acting person into the department the request is about,
// after role membership was checked (§4.13 step 3). In dev Thomas holds every role (P14), so projection matters there;
// with distinct UAT users it is a no-op.
//
// The prototype recognises the business administrator, the auditor and the business owner by persona ids (u-admin,
// u-auditor, u-owner). The world therefore carries those ids as aliases of the first member of each role.

import { F, FLOW, ROLE, ROLE_DEPT, ROLE_PERSONA } from "./ids.mjs";
import { mintId, kfId, unmint, scrubMinted } from "./identity.mjs";

const DEPT_ORDER = ["RMM", "REG", "SAF", "QM", "MIC", "SUS", "CUS", "LEG"];
const PERSONA_TITLE = { admin: "CIQ Business Administrator", auditor: "Internal Audit", owner: "Process Owner, Raw Material Qualification" };
const initials = (n) => String(n ?? "").replace(/^Dr\. /, "").split(/\s+/).map((x) => x[0] ?? "").join("").slice(0, 2).toUpperCase();
const yes = (v, dflt = true) => (v === undefined || v === null || v === "" ? dflt : v === "Yes" || v === true);

export async function loadDirectory(port, { supplierRows, settings = {}, warn = () => {}, serviceUserIds = [], splitAll = false } = {}) {
  const roleMembers = {};
  for (const roleId of [...Object.keys(ROLE_DEPT), ...Object.keys(ROLE_PERSONA)]) roleMembers[roleId] = await port.roleMembers(roleId);
  return buildDirectory({ roleMembers, supplierRows: supplierRows ?? (await port.listForm(FLOW.supplier)), settings, warn, serviceUserIds, splitAll });
}

/**
 * Pure part (tests feed it directly).
 * @param {object} o
 * @param {string[]} [o.serviceUserIds]  the key's own user(s): a contact with that uid is shared
 * @param {boolean} [o.splitAll]         tests only: every contact uid counts as shared
 */
export function buildDirectory({ roleMembers, supplierRows, settings = {}, warn = () => {}, serviceUserIds = [], splitAll = false }) {
  const people = new Map(); // id → { id, name, email, depts:Set, personas:Set }
  for (const [roleId, members] of Object.entries(roleMembers)) {
    for (const m of members ?? []) {
      const p = people.get(m._id) ?? { id: m._id, name: m.Name || m._id, email: (m.Email ?? "").toLowerCase(), depts: new Set(), personas: new Set() };
      if (!p.email && m.Email) p.email = m.Email.toLowerCase();
      if (ROLE_DEPT[roleId]) p.depts.add(ROLE_DEPT[roleId]);
      if (ROLE_PERSONA[roleId]) p.personas.add(ROLE_PERSONA[roleId]);
      people.set(m._id, p);
    }
  }
  const defaults = settings.defaultReviewers ?? {};
  const internal = [];
  const aliases = [];
  for (const p of people.values()) {
    if (!p.email) warn(`no e-mail known for internal user ${p.id}: no mail can reach this person`);
    const depts = DEPT_ORDER.filter((d) => p.depts.has(d));
    const base = { id: p.id, name: p.name, email: p.email, side: "internal", title: "", initials: initials(p.name) };
    internal.push({ ...base, dept: depts[0] });
    for (const d of depts.slice(1)) aliases.push({ ...base, dept: d });
  }
  // Default reviewer per department (Settings row, F-08 / V-52): put that person first for its department.
  const rank = (u) => (u.dept && (defaults[u.dept] === u.id || (defaults[u.dept] && defaults[u.dept].toLowerCase?.() === u.email)) ? 0 : 1);
  internal.sort((a, b) => rank(a) - rank(b));
  aliases.sort((a, b) => rank(a) - rank(b));

  // Persona aliases the prototype checks by id.
  const personaUsers = [];
  for (const persona of ["admin", "auditor", "owner"]) {
    const id = `u-${persona}`;
    if (people.has(id)) continue;
    const holder = [...people.values()].find((p) => p.personas.has(persona));
    if (holder) personaUsers.push({ id, name: holder.name, email: holder.email, side: "internal", title: PERSONA_TITLE[persona], initials: initials(holder.name), aliasOf: holder.id });
  }

  // Which Kissflow users are shared (identity.mjs): their supplier side gets a minted id.
  const contactRows = (row) => row[`Table::${F.supplier.contacts.table}`] ?? [];
  const codesOfUid = new Map(); // uid → Set of Supplier_Code
  for (const row of supplierRows ?? []) for (const c of contactRows(row)) if (c.Contacts_Portal_User_Id) (codesOfUid.get(c.Contacts_Portal_User_Id) ?? codesOfUid.set(c.Contacts_Portal_User_Id, new Set()).get(c.Contacts_Portal_User_Id)).add(row.Supplier_Code);
  const services = new Set((serviceUserIds ?? []).filter(Boolean));
  const sharedWhy = (uid) => {
    const why = [];
    const p = people.get(uid);
    if (p && (p.depts.size || p.personas.size)) why.push("internal user");
    if (services.has(uid)) why.push("service user");
    if ((codesOfUid.get(uid)?.size ?? 0) > 1) why.push(`contact of ${codesOfUid.get(uid).size} suppliers`);
    if (splitAll && !why.length) why.push("split-all (tests)");
    return why;
  };

  const suppliers = [];
  const contacts = [];
  const overlaps = []; // one entry per minted contact id (ids only)
  for (const row of supplierRows ?? []) {
    const ids = [];
    const seenUid = new Set();
    for (const c of contactRows(row)) {
      const uid = c.Contacts_Portal_User_Id || null;
      const plain = uid || (c.Contacts_Key ? `contact:${c.Contacts_Key}` : null);
      if (!plain) continue;
      // Listed twice at one supplier: both rows stay (as before identity.mjs); by-id look-ups use the last one.
      const again = !!uid && seenUid.has(uid);
      if (again) warn(`identity: supplier ${row.Supplier_Code} lists portal user ${uid} twice (contact ${c.Contacts_Key ?? "?"}): look-ups by id use the last row`);
      if (uid) seenUid.add(uid);
      const why = uid ? sharedWhy(uid) : [];
      const id = why.length ? mintId(row.Supplier_Code, uid) : plain;
      if (why.length && !again) {
        overlaps.push({ id, uid, supplierCode: row.Supplier_Code, contactKey: c.Contacts_Key, why });
        warn(`identity: portal user ${uid} (contact ${c.Contacts_Key ?? "?"} of ${row.Supplier_Code}) is also ${why.join(" and ")}: its supplier side is ${id} in memory; Kissflow writes keep ${uid}`);
      }
      ids.push(id);
      contacts.push({
        id,
        kfUserId: uid,
        name: c.Contacts_Full_Name ?? "",
        email: String(c.Contacts_Email ?? "").toLowerCase(),
        side: "supplier",
        title: c.Contacts_Title ?? c.Contacts_Role ?? "Supplier contact",
        supplierId: row.Supplier_Code,
        initials: initials(c.Contacts_Full_Name),
        active: yes(c.Contacts_Active),
        ...(c.Contacts_Deactivated_At ? { deactivatedAt: c.Contacts_Deactivated_At } : {}),
        mayConfirm: yes(c.Contacts_Can_Confirm),
        contactKey: c.Contacts_Key,
      });
    }
    suppliers.push({ id: row.Supplier_Code, name: row.Supplier_Legal_Name, duns: String(row.DUNS_Number ?? "").replace(/[\s-]/g, ""), country: row.Supplier_Country_Code ?? "", city: row.Supplier_City, type: String(row.Supplier_Kind ?? "Manufacturer").toLowerCase() === "distributor" ? "distributor" : "manufacturer", contactIds: ids, active: yes(row.Supplier_Active), rowId: row._id });
  }

  const byId = new Map([...internal, ...personaUsers, ...contacts].map((u) => [u.id, u]));
  // E-mail look-ups per side. Without a shared address the result is the same as one map with contacts first.
  const contactsByEmail = new Map(); // e-mail → contacts in master order
  for (const u of contacts) if (u.email) (contactsByEmail.get(u.email) ?? contactsByEmail.set(u.email, []).get(u.email)).push(u);
  const internalByEmail = new Map();
  for (const u of internal) if (u.email && !internalByEmail.has(u.email)) internalByEmail.set(u.email, u);
  // Contacts by Kissflow user id (a contact without a portal user is found by its own `contact:<key>` id).
  const contactsByUid = new Map();
  for (const u of contacts) {
    const k = u.kfUserId ?? u.id;
    (contactsByUid.get(k) ?? contactsByUid.set(k, []).get(k)).push(u);
  }
  const mintedIds = new Set(overlaps.map((o) => o.id));
  const toKf = (id) => kfId(id, mintedIds);
  const norm = (email) => String(email).toLowerCase();
  /**
   * The contact of Kissflow user `uid` (or of an already minted id): with a supplier `code`, ONLY its contact at that
   * supplier (a case's look-ups never cross to another supplier); without one, the only contact with that uid.
   */
  const contactFor = (uid, code) => {
    if (uid === undefined || uid === null || uid === "") return undefined;
    const list = contactsByUid.get(toKf(uid)) ?? [];
    if (code) return list.find((u) => u.supplierId === code);
    return new Set(list.map((u) => u.id)).size === 1 ? list[0] : undefined;
  };

  return {
    people,
    suppliers,
    contacts,
    internal,
    overlaps,
    mintedIds,
    /** The Kissflow user id behind an in-memory id (a minted id of THIS directory → its uid; anything else unchanged). */
    kfId: toKf,
    /** Deep copy with every minted id of this directory replaced by its Kissflow id (identity without minted ids). */
    unmint: (v) => unmint(v, mintedIds),
    /** A text with every minted id of this directory inside it replaced by its Kissflow id. */
    scrub: (text) => scrubMinted(text, mintedIds),
    byId: (id) => byId.get(id),
    /**
     * The person with this e-mail. When an internal user and a contact share the address, `prefer` decides
     * ("supplier", the default, as before; "internal" for Workbench inputs such as note mentions).
     */
    byEmail(email, prefer = "supplier") {
      if (!email) return undefined;
      const e = norm(email);
      const c = contactsByEmail.get(e)?.[0];
      const i = internalByEmail.get(e);
      if (c && i) return prefer === "internal" ? i : c;
      return c ?? i;
    },
    /**
     * Contacts only: the contact with this e-mail at supplier `code` (never one of another supplier); without a `code`,
     * the first contact with it.
     */
    contactByEmail(email, code) {
      if (!email) return undefined;
      const list = contactsByEmail.get(norm(email)) ?? [];
      return code ? list.find((u) => u.supplierId === code) : list[0];
    },
    /** The in-memory id of Kissflow user `uid`'s contact at supplier `code` (without a code: its only contact), else undefined. */
    contactIdFor: (uid, code) => contactFor(uid, code)?.id,
    /** A stored supplier-position id → the in-memory id of its contact at supplier `code` (unchanged when it is none). */
    supplierIdFor: (id, code) => contactFor(id, code)?.id ?? id,
    /** Is this Kissflow user a person of the directory (an internal user or a supplier contact)? */
    isHuman: (uid) => !!uid && (people.has(uid) || contactsByUid.has(uid)),
    /** The Supplier_Codes listing this Kissflow user as a contact. */
    suppliersOfUid: (uid) => [...new Set((contactsByUid.get(toKf(uid)) ?? []).map((u) => u.supplierId))],
    emailOf: (id) => byId.get(id)?.email ?? "",
    nameOf: (id) => (id === "system" ? "System" : (byId.get(id)?.name ?? id)),
    /** Is the person a member of the role behind this department / persona? */
    isMember(userId, deptOrPersona) {
      const p = people.get(userId);
      if (!p) return false;
      return p.depts.has(deptOrPersona) || p.personas.has(deptOrPersona);
    },
    deptsOf: (userId) => [...(people.get(userId)?.depts ?? [])],
    /**
     * The User list for a world. `project` maps user ids to the department they act in for this request (applied only
     * when the person is a member of that department's role).
     */
    users(project = {}) {
      const primary = internal.map((u) => {
        const want = project[u.id];
        return want && people.get(u.id)?.depts.has(want) ? { ...u, dept: want } : u;
      });
      return [...primary, ...personaUsers, ...contacts, ...aliases];
    },
    /** The persona id the prototype expects for an admin / auditor / owner actor (else the user id itself). */
    personaIdFor(userId, persona) {
      if (people.get(userId)?.personas.has(persona) && !people.has(`u-${persona}`)) return `u-${persona}`;
      return userId;
    },
  };
}

export const SERVICE_ROLE = ROLE.service;
