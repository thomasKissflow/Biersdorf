// The colleague directory for @mentions in internal notes (27 Oct, Thomas in prod: "In Internal Note I am not able to
// mention anyone"). The note composer lists mentionableUsers(state): the active Beiersdorf users of the state. Live,
// those were only the people the load reads (the signed-in user, case owners, people named in reviews and history
// rows), so in a fresh production nearly nobody but the writer, whom the composer leaves out. So LiveAppStore reads the
// colleagues once a session in the background, after the first load settled (never on the write chain, never in the
// header's "Loading…"; a refusal never fails the load), and the mapper merges them into the state's users
// (map/toAppState.ts, Directory.colleague):
// - the members of the CIQ app roles (ids.ts ROLES; the Case administrator, Integration service and Admin / Developer
//   roles are not read): kf.api GET /app_role/2/{acc}/{roleId}?_application_id=CIQ_Digital_A00, whose answer carries
//   Members (or Users): [{_id, Name, Kind, …}] (live with an API key: kissflow-build/ciq-digital/postgen/
//   roles-members.mjs; [unverified] as the signed-in user). A member gets the role's department and its title (a
//   review department role: the department's name; the Business administrator, Auditor and Business owner roles: the
//   role's name). Several roles: the first in ROLES order gives them;
// - the account's users, kf.api GET /user/2/{acc}?page_number=1&page_size=500 ([{_id, Email, Name, Kind}]; live with
//   an API key, [unverified] as the user): read only when a role member came without an e-mail (it fills the e-mail
//   in) or when every role read was refused (then its users are the colleagues, without a department);
// - never a supplier: a member or user of Kind "ExternalUser" (a portal user) is skipped, and so is an entry that is no
//   person (a group, a department, a role). A colleague without an e-mail stays mentionable and gets no mail;
// - both refused: nobody is listed, and the composer says "Colleagues can't be listed for your role here."
//   (components/mentions.tsx MentionDirectoryContext); Diagnostics says why.
// At most 12 calls (11 role reads + the user list), 2 at a time, through the client's own limiter and retry.
// Pure apart from readColleagues' calls; no Kissflow id but the role ids of ids.ts.
import { DEPT_LABEL } from "@/domain/catalog";
import type { Dept } from "@/domain/types";
import { errorText } from "@/portal/kf/sdk";
import { ROLES } from "./ids";
import { pool } from "./kf/client";
import type { AppClient } from "./types";

/** A Beiersdorf colleague as the directory read them (Kissflow ids; the mapper turns them into domain users). */
export interface Colleague {
  /** The Kissflow user id. */
  kfId: string;
  name: string;
  /** Absent: none known (mentionable, but no mail). */
  email?: string;
  dept?: Dept;
  title: string;
  /** The CIQ roles (ids.ts ROLES keys) they are a member of; none when they came from the account's users only. */
  roles: string[];
}

/** One role read, for Diagnostics. */
export interface RoleRead {
  /** ids.ts ROLES key. */
  key: string;
  name: string;
  ok: boolean;
  /** People listed (kept), when it answered. */
  members: number;
  /** Members skipped: external (portal) users and entries that are no person. */
  skipped?: number;
  error?: string;
}

export interface ColleagueDirectory {
  /** "loading": not read yet; "ready": a read answered; "unlisted": both reads were refused (or this page has no API route). */
  status: "loading" | "ready" | "unlisted";
  /** Where the colleagues came from: the role members (the user list only filled e-mails in), or the account's users. */
  source?: "roles" | "users";
  colleagues: Colleague[];
  roleReads: RoleRead[];
  /** The account's users, when read. */
  userList?: { ok: boolean; count: number; error?: string };
  /** Why nobody could be listed (status "unlisted"); Diagnostics shows it. */
  reason?: string;
  /** When the read finished. */
  at?: string;
}

/** Not read yet. */
export const COLLEAGUES_LOADING: ColleagueDirectory = { status: "loading", colleagues: [], roleReads: [] };

/** The CIQ roles whose members are colleagues, in ROLES order (the first role of a person gives their department). */
export const COLLEAGUE_ROLES: readonly { key: string; id: string; name: string; dept?: Dept }[] = Object.entries(ROLES).map(([key, r]) => ({
  key,
  id: r.id,
  name: r.name,
  ...("dept" in r ? { dept: r.dept as Dept } : {}),
}));

/** The account's users asked for in one call (GET /user/2/{acc}?page_number=1&page_size=…). */
export const USER_PAGE_SIZE = 500;

/** Role reads in flight at once (the client's limiter bounds every call as well). */
export const COLLEAGUE_LANES = 2;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A person entry ({_id, Name, Email?, Kind?}) as Kissflow sends it in a role's Members / Users or the user list. */
export interface PersonEntry {
  id: string;
  name: string;
  email?: string;
  kind: string;
}

/** The Kinds that are no Beiersdorf person: a portal user ("ExternalUser") and the entries a role may hold that are no
 *  person. Any other Kind ("User", none) counts as a person, as the PUT's Users default it to "User". */
const NOT_A_COLLEAGUE = new Set(["externaluser", "group", "department", "team", "approle", "role"]);
/** A Beiersdorf person: not an external (portal) user, and not a group or another kind of entry. */
export const isColleagueEntry = (e: PersonEntry): boolean => !!e.id && !NOT_A_COLLEAGUE.has(e.kind.toLowerCase());

function entryOf(x: unknown): PersonEntry | undefined {
  if (!isObj(x)) return undefined;
  const id = text(x._id) || text(x.Id) || text(x.id);
  if (!id) return undefined;
  const email = text(x.Email) || text(x.email);
  return { id, name: text(x.Name) || text(x.name) || text(x.Full_Name), ...(EMAIL.test(email) ? { email } : {}), kind: text(x.Kind) || text(x.kind) || text(x.Type) };
}

/** The people of an answer that is a list ([…], {Data: […]}, {Users: […]}, {Members: […]}, …). */
function listOf(body: unknown, keys: readonly string[]): unknown[] | undefined {
  if (Array.isArray(body)) return body;
  if (!isObj(body)) return undefined;
  for (const k of keys) if (Array.isArray(body[k])) return body[k] as unknown[];
  for (const k of ["Data", "data", "Result", "result"]) if (isObj(body[k])) return listOf(body[k], keys);
  return undefined;
}

/** The members of a role read: its Members (or Users) as person entries. Throws on an answer without either (a Kissflow
 *  error envelope or another shape), so the read counts as refused. */
export function roleMembersOf(body: unknown): PersonEntry[] {
  if (isObj(body) && body.error_code) throw new Error(errorText(body));
  const list = listOf(body, ["Members", "Users", "members", "users"]);
  if (!list) throw new Error(`Kissflow answered the role without its members (${isObj(body) ? `keys: ${Object.keys(body).join(", ") || "none"}` : typeof body}).`);
  return list.map(entryOf).filter((e): e is PersonEntry => !!e);
}

/** The account's users of a user-list read. Throws on another shape. */
export function accountUsersOf(body: unknown): PersonEntry[] {
  if (isObj(body) && body.error_code) throw new Error(errorText(body));
  const list = listOf(body, ["Users", "users", "Items", "items", "Data", "data"]);
  if (!list) throw new Error(`Kissflow answered the user list in an unknown shape (${isObj(body) ? `keys: ${Object.keys(body).join(", ") || "none"}` : typeof body}).`);
  return list.map(entryOf).filter((e): e is PersonEntry => !!e);
}

/** One role's answer: its members, or why it was refused. */
export interface RoleAnswer {
  key: string;
  members?: PersonEntry[];
  error?: string;
}

/**
 * The colleagues of the reads: every person member of a role that answered (department and title of their first role
 * in ROLES order; the e-mail from the role entry, else from the user list), or, when no role read answered, every
 * person of the user list (no department, title "Beiersdorf"). External users and non-person entries are skipped.
 * Each person once, in ROLES order, then by name.
 */
export function colleaguesFrom(roles: readonly RoleAnswer[], users?: readonly PersonEntry[]): Colleague[] {
  const byId = new Map<string, Colleague>();
  const userById = new Map((users ?? []).filter(isColleagueEntry).map((u) => [u.id, u]));
  const answered = roles.filter((r) => r.members);
  if (answered.length) {
    for (const def of COLLEAGUE_ROLES) {
      const r = answered.find((a) => a.key === def.key);
      for (const m of r?.members ?? []) {
        if (!isColleagueEntry(m)) continue;
        const known = byId.get(m.id);
        if (known) {
          if (!known.roles.includes(def.key)) known.roles.push(def.key);
          if (!known.email && m.email) known.email = m.email;
          continue;
        }
        const u = userById.get(m.id);
        const email = m.email ?? u?.email;
        const name = m.name || u?.name || email || m.id;
        byId.set(m.id, { kfId: m.id, name, ...(email ? { email } : {}), ...(def.dept ? { dept: def.dept } : {}), title: def.dept ? DEPT_LABEL[def.dept] : def.name, roles: [def.key] });
      }
    }
    return [...byId.values()];
  }
  for (const u of userById.values()) {
    if (byId.has(u.id)) continue;
    byId.set(u.id, { kfId: u.id, name: u.name || u.email || u.id, ...(u.email ? { email: u.email } : {}), title: "Beiersdorf", roles: [] });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every refusal of the reads as one sentence (Diagnostics). */
function reasonOf(reads: readonly RoleRead[], userError?: string): string {
  const roleError = reads.find((r) => !r.ok)?.error;
  return `The CIQ roles' members could not be read (${roleError ?? "no answer"}) and neither could the account's users (${userError ?? "no answer"}).`;
}

/**
 * Reads the colleague directory (see the header): the role members, 2 at a time; then the account's users when a
 * member came without an e-mail or no role read answered. Never throws: a refused read is in the result (`roleReads`,
 * `userList`, `reason`). A client without the routes (no kf.api) lists nobody.
 */
export async function readColleagues(client: Pick<AppClient, "roleMembers" | "accountUsers">, now: () => string = () => new Date().toISOString()): Promise<ColleagueDirectory> {
  if (!client.roleMembers && !client.accountUsers) return { status: "unlisted", colleagues: [], roleReads: [], reason: "This page has no Kissflow API route, so the CIQ roles' members can't be read.", at: now() };
  const answers: RoleAnswer[] = await pool([...COLLEAGUE_ROLES], COLLEAGUE_LANES, async (def): Promise<RoleAnswer> => {
    if (!client.roleMembers) return { key: def.key, error: "not available here" };
    try {
      return { key: def.key, members: roleMembersOf(await client.roleMembers(def.id)) };
    } catch (e) {
      return { key: def.key, error: errorText(e) };
    }
  });
  const roleReads: RoleRead[] = answers.map((a) => {
    const def = COLLEAGUE_ROLES.find((r) => r.key === a.key)!;
    if (!a.members) return { key: a.key, name: def.name, ok: false, members: 0, ...(a.error ? { error: a.error } : {}) };
    const kept = a.members.filter(isColleagueEntry).length;
    return { key: a.key, name: def.name, ok: true, members: kept, ...(a.members.length > kept ? { skipped: a.members.length - kept } : {}) };
  });
  const anyRole = answers.some((a) => a.members);
  const noEmail = answers.some((a) => a.members?.some((m) => isColleagueEntry(m) && !m.email));
  let users: PersonEntry[] | undefined;
  let userList: ColleagueDirectory["userList"];
  if ((!anyRole || noEmail) && client.accountUsers) {
    try {
      users = accountUsersOf(await client.accountUsers());
      userList = { ok: true, count: users.length };
    } catch (e) {
      userList = { ok: false, count: 0, error: errorText(e) };
    }
  }
  if (!anyRole && !users) return { status: "unlisted", colleagues: [], roleReads, ...(userList ? { userList } : {}), reason: reasonOf(roleReads, userList?.error ?? (client.accountUsers ? undefined : "not available here")), at: now() };
  return { status: "ready", source: anyRole ? "roles" : "users", colleagues: colleaguesFrom(answers, users), roleReads, ...(userList ? { userList } : {}), at: now() };
}

/** One read a session per client (a new set of roles makes a new client, AppLiveApp): every store of the session gets
 *  the same answer. */
const SESSION = new WeakMap<object, Promise<ColleagueDirectory>>();
export function colleaguesOnce(client: Pick<AppClient, "roleMembers" | "accountUsers">): Promise<ColleagueDirectory> {
  let p = SESSION.get(client);
  if (!p) SESSION.set(client, (p = readColleagues(client)));
  return p;
}
