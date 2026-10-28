// Fictional fixture users (WORKBENCH-DESIGN.md §11.3; ground rule 11): invented names, `<id>@example.test` e-mails.
// AppRoles carry the role display names (ROLES[].name, the prototype's persona names) with fake `Ro…` ids, so the
// Workbench matches them by name (live ids are matched first in Kissflow). The host param roleNames=legacy answers
// the names before the live rename (ROLES[].legacyName, e.g. "CIQ RMM"; a role new in the rename keeps its name), so
// a scenario proves the legacy-name match end to end (kf/app.spec covers it in unit tests).
import { ROLES, type RoleIr } from "../schema/generated";

export interface FixtureUser {
  /** Short fixture id (the `user=` host param). */
  id: string;
  _id: string;
  Name: string;
  Email: string;
  roles: RoleIr[];
  /** Flow Admin on the 3 processes (the dev builder). */
  admin?: boolean;
}

const CIQ_ROLES = (Object.keys(ROLES) as RoleIr[]).filter((r) => r !== "admin" && r !== "user");

const u = (id: string, Name: string, roles: RoleIr[], extra: Partial<FixtureUser> = {}): FixtureUser => ({
  id,
  _id: `Us${id.charAt(0).toUpperCase()}${id.slice(1)}0001`,
  Name,
  Email: `${id}@example.test`,
  roles,
  ...extra,
});

export const USERS: Record<string, FixtureUser> = {
  dev: u("dev", "Dev Builder", [...CIQ_ROLES, "admin"], { admin: true }),
  alex: u("alex", "Alex Rivera", ["ciq_rmm"]),
  casey: u("casey", "Casey Moreau", ["ciq_rmm", "ciq_case_admin"]),
  sam: u("sam", "Sam Okafor", ["ciq_regulatory_reviewer"]),
  jo: u("jo", "Jo Weber", ["ciq_safety_reviewer"]),
  tove: u("tove", "Tove Marsh", ["ciq_qm_reviewer"]),
  lee: u("lee", "Lee Park", ["ciq_microbiology_reviewer"]),
  ana: u("ana", "Ana Silva", ["ciq_sustainability_reviewer"]),
  wren: u("wren", "Wren Ashdown", ["ciq_overall_approver"]),
  robin: u("robin", "Robin Hale", ["ciq_business_admin"]),
  max: u("max", "Max Reed", ["ciq_reader"]),
  cleo: u("cleo", "Cleo Varga", ["ciq_customs"]),
  lena: u("lena", "Lena Brooks", ["ciq_legal"]),
  bo: u("bo", "Bo Lindgren", ["ciq_business_owner"]),
  svc: u("svc", "Service Account", ["ciq_integration_service"]),
  norole: u("norole", "No Role", ["user"]),
};

/** Fake role id per spec role (`Ro…`, stable). */
export const roleId = (r: RoleIr): string => `RoWb${(Object.keys(ROLES) as RoleIr[]).indexOf(r).toString().padStart(2, "0")}${r.replace(/[^a-z]/g, "").slice(0, 6)}`;
/** Role names the host answers: the prototype display names (default) or the names before the live rename. */
export type RoleNames = "prototype" | "legacy";
export const roleName = (r: RoleIr, names: RoleNames = "prototype"): string => {
  const def = ROLES[r] as { name: string; legacyName: string | null };
  return names === "legacy" ? (def.legacyName ?? def.name) : def.name;
};
/** The handshake's AppRoles of a user: `{ _id, Name, Kind }` by role NAME. */
export const appRolesOf = (x: FixtureUser, names: RoleNames = "prototype"): { _id: string; Name: string; Kind: string }[] => x.roles.map((r) => ({ _id: roleId(r), Name: roleName(r, names), Kind: "Role" }));
/** Every app role, for GET_ROLES (16 names). */
export const allAppRoles = (names: RoleNames = "prototype"): { _id: string; Name: string }[] => (Object.keys(ROLES) as RoleIr[]).map((r) => ({ _id: roleId(r), Name: roleName(r, names) }));

export const userById = (_id: string): FixtureUser | undefined => Object.values(USERS).find((x) => x._id === _id);
/** `{ _id, Name }` for a stored User value (reads show the name, like Kissflow). */
export function userRef(v: unknown): unknown {
  const id = typeof v === "string" ? v : v && typeof v === "object" ? (v as { _id?: unknown })._id : undefined;
  if (typeof id !== "string" || !id) return v;
  const x = userById(id);
  return x ? { _id: x._id, Name: x.Name, Kind: "User" } : { _id: id, Kind: "User" };
}
/** Every fixture name and e-mail (S04: the redacted diagnostics copy holds none of them). */
export const FIXTURE_PEOPLE: string[] = Object.values(USERS).flatMap((x) => [x.Name, x.Email]);
