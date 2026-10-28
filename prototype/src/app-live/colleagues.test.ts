// The @mention colleague directory (27 Oct, app-live/colleagues.ts): the role members with their department and title,
// the account's users filling in the e-mails (read only when needed), portal users and groups never listed, nobody
// when both reads are refused; the merge into the mapped state (map/people.ts Directory.colleague): the people the
// load names keep their names, titles and ids, the writer is never a candidate nor mailed, a supplier contact stays one.
// Fictional people only.
import { describe, expect, it } from "vitest";
import { mentionRecipients, mentionableUsers, parseMentions } from "@/domain/mentions";
import type { AppState } from "@/domain/types";
import { COLLEAGUE_ROLES, accountUsersOf, colleaguesFrom, colleaguesOnce, readColleagues, roleMembersOf, type Colleague } from "./colleagues";
import { ROLES } from "./ids";
import { createFakeClient, type FakePerson } from "./kf/fakeClient";
import { toAppState } from "./map/toAppState";
import { KF_USERS, appFixtures, fixtureActing, fixtureIdentity, fixtureInput, fixtureSnapshot } from "./testing/rawFixtures";
import type { AppClient, LiveSnapshot } from "./types";

const INGRID: FakePerson = { _id: "UsQmIngrid", Name: "Ingrid Nolte", Kind: "User" };
const OSKAR: FakePerson = { _id: "UsSafOskar", Name: "Oskar Brandt", Kind: "User", Email: "oskar.brandt@beiersdorf.example" };
const PORTAL: FakePerson = { _id: "UsPortalElena", Name: "Elena Ruiz", Kind: "ExternalUser", Email: "elena.ruiz@solvaro.example" };
const GROUP: FakePerson = { _id: "GrQmTeam", Name: "QM team", Kind: "Group" };
const RMM = KF_USERS["u-rmm"]!;
const QM = KF_USERS["u-qm"]!;

const meOf = (u: { _id: string; Name: string; Email: string }) => ({ _id: u._id, Name: u.Name, Email: u.Email, roles: ["rmm"] });

/** A fake client with the directory routes: role id → members, and the account's users. */
function directoryClient(roles: Partial<Record<keyof typeof ROLES, FakePerson[]>>, users?: FakePerson[], refuse: Partial<Record<"roleMembers" | "accountUsers", string>> = {}) {
  return createFakeClient(
    { items: {}, me: meOf(RMM), directory: { roles: Object.fromEntries(Object.entries(roles).map(([k, v]) => [ROLES[k as keyof typeof ROLES].id, v!])), ...(users ? { users } : {}) } },
    { refuse },
  );
}

describe("reading the directory", () => {
  it("lists the members of the CIQ roles with their department and title; the first role in ROLES order gives them", async () => {
    const fake = directoryClient({ rmm: [{ ...RMM, Kind: "User" }], qm: [{ ...QM, Kind: "User" }, OSKAR], saf: [OSKAR], admin: [{ _id: "UsAdminNina", Name: "Nina Hoffmann", Email: "nina.hoffmann@beiersdorf.example" }] });
    const d = await readColleagues(fake);
    expect(d).toMatchObject({ status: "ready", source: "roles" });
    const byId = new Map(d.colleagues.map((c) => [c.kfId, c]));
    expect(byId.get(QM._id)).toEqual({ kfId: QM._id, name: "Lena Krause", email: QM.Email, dept: "QM", title: "Quality Management", roles: ["qm"] });
    // SAF comes before QM in ROLES: Oskar is a Safety colleague who is also in QM
    expect(byId.get(OSKAR._id)).toMatchObject({ dept: "SAF", title: "Product Safety", roles: ["saf", "qm"] });
    // a role without a department: its name is the title
    expect(byId.get("UsAdminNina")).toMatchObject({ title: "Business administrator", roles: ["admin"] });
    expect(byId.get("UsAdminNina")!.dept).toBeUndefined();
    // every member had an e-mail: the account's users are not read; 11 role reads, nothing else
    expect(fake.calls.map((c) => c.m)).toEqual(Array(COLLEAGUE_ROLES.length).fill("roleMembers"));
    expect(COLLEAGUE_ROLES.map((r) => r.key)).toEqual(Object.keys(ROLES));
    expect(d.roleReads.find((r) => r.key === "qm")).toEqual({ key: "qm", name: ROLES.qm.name, ok: true, members: 2 });
  });

  it("fills a member's missing e-mail from the account's users", async () => {
    const fake = directoryClient({ qm: [INGRID] }, [{ ...INGRID, Email: "ingrid.nolte@beiersdorf.example" }, OSKAR]);
    const d = await readColleagues(fake);
    expect(d.colleagues).toEqual([{ kfId: INGRID._id, name: "Ingrid Nolte", email: "ingrid.nolte@beiersdorf.example", dept: "QM", title: "Quality Management", roles: ["qm"] }]);
    expect(d.userList).toEqual({ ok: true, count: 2 });
    // only role members are colleagues: Oskar (in the account, in no CIQ role) is not one
    expect(fake.calls.filter((c) => c.m === "accountUsers")).toHaveLength(1);
  });

  it("keeps a member without an e-mail when the account's users can't be read: mentionable, no mail", async () => {
    const d = await readColleagues(directoryClient({ qm: [INGRID] }, [], { accountUsers: "KISSFLOW_ERROR_050302 You don't have permission." }));
    expect(d.status).toBe("ready");
    expect(d.colleagues).toEqual([{ kfId: INGRID._id, name: "Ingrid Nolte", dept: "QM", title: "Quality Management", roles: ["qm"] }]);
    expect(d.userList).toMatchObject({ ok: false, error: expect.stringMatching(/050302/) });
  });

  it("skips portal users (Kind ExternalUser) and groups, in the roles and in the account's users", async () => {
    const d = await readColleagues(directoryClient({ qm: [INGRID, PORTAL, GROUP] }, [{ ...INGRID, Email: "ingrid.nolte@beiersdorf.example" }, PORTAL]));
    expect(d.colleagues.map((c) => c.kfId)).toEqual([INGRID._id]);
    expect(d.roleReads.find((r) => r.key === "qm")).toMatchObject({ ok: true, members: 1, skipped: 2 });
    // the role reads refused: the account's users are the colleagues, the portal user still not
    const users = await readColleagues(directoryClient({}, [OSKAR, PORTAL, { ...INGRID, Email: "ingrid.nolte@beiersdorf.example" }], { roleMembers: "KISSFLOW_ERROR_050302 You don't have permission." }));
    expect(users).toMatchObject({ status: "ready", source: "users" });
    expect(users.colleagues).toEqual([
      { kfId: INGRID._id, name: "Ingrid Nolte", email: "ingrid.nolte@beiersdorf.example", title: "Beiersdorf", roles: [] },
      { kfId: OSKAR._id, name: "Oskar Brandt", email: OSKAR.Email, title: "Beiersdorf", roles: [] },
    ]);
  });

  it("lists nobody when both reads are refused, and says why", async () => {
    const fake = directoryClient({ qm: [INGRID] }, [OSKAR], { roleMembers: "KISSFLOW_ERROR_050302 You don't have permission.", accountUsers: "KISSFLOW_ERROR_050302 You don't have permission." });
    const d = await readColleagues(fake);
    expect(d).toMatchObject({ status: "unlisted", colleagues: [] });
    expect(d.reason).toMatch(/CIQ roles' members could not be read \(KISSFLOW_ERROR_050302.*\) and neither could the account's users \(KISSFLOW_ERROR_050302/);
    expect(d.roleReads.every((r) => !r.ok)).toBe(true);
    // 11 role reads and the user list: at most 12 calls
    expect(fake.calls).toHaveLength(12);
    // a page without the API route lists nobody and calls nothing
    expect(await readColleagues({})).toMatchObject({ status: "unlisted", colleagues: [], roleReads: [] });
  });

  it("reads at most 2 roles at a time, and once a session per client", async () => {
    let inFlight = 0;
    let most = 0;
    let calls = 0;
    const client: Pick<AppClient, "roleMembers" | "accountUsers"> = {
      roleMembers: async () => {
        calls++;
        most = Math.max(most, ++inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight--;
        return { Members: [OSKAR] };
      },
      accountUsers: async () => [],
    };
    const [a, b] = await Promise.all([colleaguesOnce(client), colleaguesOnce(client)]);
    expect(a).toBe(b);
    expect(most).toBe(2);
    expect(calls).toBe(COLLEAGUE_ROLES.length);
  });

  it("reads the answer shapes: Members or Users, in a Data envelope too; an error envelope or a bare object is refused", () => {
    expect(roleMembersOf({ _id: "Ro1", Members: [{ _id: "U1", Name: "A", Kind: "User" }] })).toEqual([{ id: "U1", name: "A", kind: "User" }]);
    expect(roleMembersOf({ Users: [{ _id: "U2", Name: "B", Email: "b@x.example" }] })).toEqual([{ id: "U2", name: "B", email: "b@x.example", kind: "" }]);
    expect(roleMembersOf({ Data: { Members: [] } })).toEqual([]);
    expect(() => roleMembersOf({ error_code: "KISSFLOW_ERROR_050302", en_message: "No access" })).toThrow(/050302/);
    expect(() => roleMembersOf({ _id: "Ro1", Name: "x" })).toThrow(/without its members/);
    expect(accountUsersOf([{ _id: "U3", Name: "C", Email: "not an e-mail" }])).toEqual([{ id: "U3", name: "C", kind: "" }]);
    expect(accountUsersOf({ Data: [{ _id: "U4", Name: "D" }] })).toEqual([{ id: "U4", name: "D", kind: "" }]);
    expect(colleaguesFrom([{ key: "qm", error: "refused" }])).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------ the mapped state

/** A fresh production: no case, no history, only the configuration rows. */
function freshSnap(): LiveSnapshot {
  const fx = appFixtures();
  return { loadedAt: "2026-10-27T08:00:00Z", items: { case: [], review: [], op: [] }, forms: { audit: [], config: fx.db.config, note: [], rmesSAF: [], rmesREG: [], supplier: [] }, tasks: [], unreadableCases: {}, reads: [], warnings: [] };
}
const colleague = (kfId: string, name: string, extra: Partial<Colleague> = {}): Colleague => ({ kfId, name, title: "Quality Management", dept: "QM", roles: ["qm"], ...extra });
const candidates = (s: AppState, meId: string) => mentionableUsers(s).filter((u) => u.id !== meId);

describe("the colleagues in the mapped state", () => {
  const identity = fixtureIdentity(["rmm"]);
  const acting = fixtureActing(identity, "rmm");

  it("a fresh production: nobody to mention but the writer; with the directory, the colleagues", () => {
    const before = toAppState({ snap: freshSnap(), identity, acting }).state;
    expect(candidates(before, acting.me.id)).toEqual([]);
    const after = toAppState({ snap: freshSnap(), identity, acting, colleagues: [colleague(INGRID._id, "Ingrid Nolte"), colleague(OSKAR._id, "Oskar Brandt", { email: OSKAR.Email, dept: "SAF", title: "Product Safety" })] }).state;
    expect(candidates(after, acting.me.id).map((u) => [u.id, u.name, u.title, u.dept, u.email])).toEqual([
      [INGRID._id, "Ingrid Nolte", "Quality Management", "QM", ""],
      [OSKAR._id, "Oskar Brandt", "Product Safety", "SAF", OSKAR.Email],
    ]);
  });

  it("the writer is never a candidate, nor mailed, even when the directory lists them", () => {
    const s = toAppState({ snap: freshSnap(), identity, acting, colleagues: [colleague(RMM._id, "Somebody Else", { dept: "QM", email: "other@beiersdorf.example" }), colleague(INGRID._id, "Ingrid Nolte")] }).state;
    const me = s.users.filter((u) => u.id === acting.me.id);
    // the signed-in user stays as they are (once, their own name, department and e-mail)
    expect(me).toEqual([acting.me]);
    expect(candidates(s, acting.me.id).map((u) => u.id)).toEqual([INGRID._id]);
    const mentions = parseMentions(s, `@${acting.me.name} and @Ingrid Nolte, please look.`);
    expect(mentionRecipients(s, { by: acting.me.id, mentions })).toEqual([INGRID._id]);
  });

  it("the people the load names keep their names, titles and ids; a missing e-mail is filled in", () => {
    const input = fixtureInput("rmm");
    const plain = toAppState(input).state;
    const lena = plain.users.find((u) => u.id === QM._id)!;
    const s = toAppState({ ...input, colleagues: [colleague(QM._id, "L. Krause (QM)", { title: "Quality Management", email: "lena.other@beiersdorf.example" })] }).state;
    const after = s.users.find((u) => u.id === QM._id)!;
    expect(after).toMatchObject({ id: lena.id, name: lena.name, title: lena.title, dept: lena.dept });
    expect(after.email).toBe(lena.email || "lena.other@beiersdorf.example");
    expect(s.users.filter((u) => u.id === QM._id)).toHaveLength(1);
  });

  it("never turns a supplier contact into a colleague, and an e-mail is not given to two Beiersdorf users", () => {
    const input = fixtureInput("rmm");
    const contact = toAppState(input).state.users.find((u) => u.side === "supplier" && !u.id.includes(":"))!;
    const taken = KF_USERS["u-saf"]!.Email;
    const s = toAppState({ ...input, colleagues: [colleague(contact.id, "Not A Colleague"), colleague("UsNewcomer", "New Comer", { email: taken })] }).state;
    expect(s.users.filter((u) => u.id === contact.id).map((u) => u.side)).toEqual(["supplier"]);
    expect(s.users.find((u) => u.id === "UsNewcomer")).toMatchObject({ side: "internal", email: "" });
    expect(s.users.filter((u) => u.side === "internal" && u.email === taken)).toHaveLength(1);
  });

  it("nothing is listed when both reads were refused: the state is the load's", () => {
    const input = fixtureInput("qm");
    expect(toAppState({ ...input, colleagues: [] }).state.users).toEqual(toAppState(input).state.users);
  });

  it("a note's mention of a colleague without an e-mail is found again by the name", () => {
    const fx = appFixtures();
    const snap = fixtureSnapshot("rmm");
    const note = { ...fx.db.note[0]!, Note_Text: "@Ingrid Nolte and @Lena Krause, please check.", Note_Mentions_Emails: QM.Email, Note_Mentions_Names: "Ingrid Nolte, Lena Krause" };
    const s = toAppState({ snap: { ...snap, forms: { ...snap.forms, note: [note, ...snap.forms.note.slice(1)] } }, identity, acting, colleagues: [colleague(INGRID._id, "Ingrid Nolte")] }).state;
    const n = s.cases.flatMap((c) => c.internalNotes).find((x) => x.text.startsWith("@Ingrid Nolte"))!;
    expect(n.mentions).toEqual([QM._id, INGRID._id]);
  });
});
