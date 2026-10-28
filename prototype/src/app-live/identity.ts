// Who is signed in and which CIQ role they act in (DESIGN §3.4). Owner D.
// Kissflow sends the user and their app roles in the handshake (kf.user: _id, Name, Email, AppRoles[{_id, Name}];
// @/portal/kf/sdk KfUser, as portal/kf/portal.ts:69-75 reads it). Each role is matched to a CIQ persona by its live id
// first and by its name only when the id is unknown: Kissflow still shows member lists under the pre-rename names, so
// ids win (ids.ts ROLES). Case administrator, Integration service and Admin / Developer are recognised but are no CIQ
// persona; Admin / Developer opens the data console (console/, 26 Oct), beside the personas or instead of the no-access
// page. Its id in ids.ts is the dev sandbox's; production's may differ after the push, so the role is also accepted by
// its name "Admin / Developer" when the id does not match (the same name rule as every role here).
// The acting user is the Kissflow user, except for the Business administrator, Auditor and Business owner, who act
// under the domain's fixed ids u-admin / u-auditor / u-owner: roleOf gives those rights only to these ids (G-3), so
// without the alias the administrator would get no supplier.view / config.manage and wrongly get note.add.
// kfUserIdOf maps an alias back to the Kissflow user before anything is written.
import { INTERNAL_PERSONAS } from "@/domain/catalog";
import type { InternalPersonaId, User } from "@/domain/types";
import type { Kf } from "@/portal/kf/sdk";
import { OTHER_ROLES, ROLES } from "./ids";
import { initialsOf } from "./map/people";
import type { Acting, Identity, LiveRoleRef } from "./types";

/** The order the default persona and the role picker follow. */
export const PERSONA_ORDER: InternalPersonaId[] = ["rmm", "reg", "saf", "qm", "mic", "sus", "cus", "leg", "admin", "auditor", "owner"];

/** The fixed domain ids of the personas whose rights hang on their id (domain/permissions.ts roleOf). */
export const PERSONA_ALIAS: Partial<Record<InternalPersonaId, string>> = { admin: "u-admin", auditor: "u-auditor", owner: "u-owner" };

type RoleKey = InternalPersonaId | "caseAdmin" | "integration" | "developer";

const norm = (s: string) => s.trim().toLowerCase();
const KNOWN: { key: RoleKey; id: string; name: string }[] = [
  ...PERSONA_ORDER.map((key) => ({ key, id: ROLES[key].id, name: ROLES[key].name })),
  { key: "caseAdmin", id: OTHER_ROLES.caseAdmin.id, name: OTHER_ROLES.caseAdmin.name },
  { key: "integration", id: OTHER_ROLES.integration.id, name: OTHER_ROLES.integration.name },
  { key: "developer", id: OTHER_ROLES.developer.id, name: OTHER_ROLES.developer.name },
];
const BY_ID = new Map(KNOWN.map((k) => [k.id, k.key]));
const BY_NAME = new Map(KNOWN.map((k) => [norm(k.name), k.key]));

/** The CIQ role a Kissflow app role stands for: by id; by name only when the id is not one of ours. */
export function roleKeyOf(r: LiveRoleRef): RoleKey | undefined {
  return BY_ID.get(r.id) ?? (r.name ? BY_NAME.get(norm(r.name)) : undefined);
}

/** The signed-in user and the CIQ personas they hold, in PERSONA_ORDER. */
export function identityOf(kf: Kf): Identity {
  const u = kf.user;
  const roles: LiveRoleRef[] = (u?.AppRoles ?? []).map((r) => ({ id: String(r?._id ?? ""), name: String(r?.Name ?? "") }));
  return withRoles({ kfUserId: String(u?._id ?? ""), name: String(u?.Name ?? ""), email: String(u?.Email ?? "") }, roles);
}

/** The same user with another set of app roles: after the dev role switch, from getRoles().currentRoles. */
export function withRoles(user: Pick<Identity, "kfUserId" | "name" | "email">, roles: LiveRoleRef[]): Identity {
  const held = new Set<RoleKey>();
  const unknownRoles: string[] = [];
  for (const r of roles) {
    const k = roleKeyOf(r);
    if (k) held.add(k);
    else unknownRoles.push(r.name || r.id || "(unnamed role)");
  }
  return {
    kfUserId: user.kfUserId,
    name: user.name,
    email: user.email,
    roles,
    personas: PERSONA_ORDER.filter((p) => held.has(p)),
    caseAdmin: held.has("caseAdmin"),
    integration: held.has("integration"),
    developer: held.has("developer"),
    unknownRoles,
  };
}

/**
 * The persona the screens act in: the catalog persona with `userId` = me.id, and `me` = the signed-in user under that
 * persona (dept and title from the persona). Not a permission check: the store only passes held personas (an unheld
 * one is refused in setPersona); Kissflow decides what the user may do.
 */
export function actingAs(id: Identity, personaId: InternalPersonaId): Acting {
  const base = INTERNAL_PERSONAS.find((p) => p.id === personaId);
  if (!base) throw new Error(`Unknown CIQ role "${personaId}".`);
  const userId = PERSONA_ALIAS[personaId] ?? id.kfUserId;
  const name = id.name.trim() || id.email.trim() || "Signed-in user";
  const me: User = { id: userId, name, email: id.email, side: "internal", title: base.label, ...(base.dept ? { dept: base.dept } : {}), initials: initialsOf(name) };
  // the role id as Kissflow sent it (a name-matched role may carry another id than ids.ts)
  const roleId = id.roles.find((r) => roleKeyOf(r) === personaId)?.id || ROLES[personaId].id;
  return { personaId, persona: { ...base, userId }, me, roleId, ...(base.dept ? { dept: base.dept } : {}) };
}

/** The Kissflow user id behind a domain user id: an alias of a persona this user holds maps back to them; every other
 *  id (Kissflow ids, contacts, "system") stays as it is. Used before any write (User fields, Thread_JSON, Snapshot). */
export function kfUserIdOf(domainUserId: string, id: Identity): string {
  for (const [p, alias] of Object.entries(PERSONA_ALIAS) as [InternalPersonaId, string][]) if (alias === domainUserId && id.personas.includes(p)) return id.kfUserId;
  return domainUserId;
}
