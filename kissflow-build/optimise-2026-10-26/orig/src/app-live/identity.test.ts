// Owner D: who is signed in and which CIQ role they act in (DESIGN §3.4, §7.1): role ids beat names, the persona
// order, Case administrator / Integration service alone give no persona, and the aliases the domain's rights need.
import { describe, expect, it } from "vitest";
import { check, roleOf } from "@/domain/permissions";
import type { AppState } from "@/domain/types";
import type { Kf, KfRole } from "@/portal/kf/sdk";
import { PERSONA_ORDER, actingAs, identityOf, kfUserIdOf, roleKeyOf, withRoles } from "./identity";
import { OTHER_ROLES, ROLES } from "./ids";
import { fixtureActing } from "./testing/rawFixtures";

/** Only what identityOf reads: kf.user (the handshake's user with its AppRoles). */
const kfWith = (roles: KfRole[], user: Partial<Kf["user"]> = {}): Kf => ({ user: { _id: "UsLenaKrause", Name: "Lena Krause", Email: "lena.krause@beiersdorf.example", AppRoles: roles, ...user } }) as unknown as Kf;
const role = (key: keyof typeof ROLES): KfRole => ({ _id: ROLES[key].id, Name: ROLES[key].name });

describe("withRoles (the dev role switch rebuilds the identity from getRoles().currentRoles)", () => {
  it("keeps the user and takes the new roles: from Business administrator to RMM", () => {
    const user = { kfUserId: "UsThomas", name: "Thomas", email: "t@example.test" };
    const before = withRoles(user, [{ id: ROLES.admin.id, name: ROLES.admin.name }]);
    expect(before.personas).toEqual(["admin"]);
    const after = withRoles(user, [{ id: ROLES.rmm.id, name: "" }]); // currentRoles may carry ids only
    expect(after).toMatchObject({ kfUserId: "UsThomas", name: "Thomas", email: "t@example.test", personas: ["rmm"], caseAdmin: false, integration: false });
  });
  it("a switch into a role without a CIQ persona leaves no persona (the no-role page)", () => {
    expect(withRoles({ kfUserId: "U", name: "", email: "" }, [{ id: OTHER_ROLES.caseAdmin.id, name: OTHER_ROLES.caseAdmin.name }]).personas).toEqual([]);
  });
});

describe("identityOf", () => {
  it("matches a role by its id first: a pre-rename name does not win over the id", () => {
    // Kissflow lists members under the old names; the QM role's id with the Regulatory name is QM
    const id = identityOf(kfWith([{ _id: ROLES.qm.id, Name: ROLES.reg.name }]));
    expect(id.personas).toEqual(["qm"]);
    expect(id.unknownRoles).toEqual([]);
  });

  it("falls back to the name when the id is not one of ours", () => {
    const id = identityOf(kfWith([{ _id: "RoUnknown1", Name: " product safety REVIEWER " }]));
    expect(id.personas).toEqual(["saf"]);
    expect(roleKeyOf({ id: "RoUnknown2", name: "Nobody" })).toBeUndefined();
  });

  it("lists held personas in PERSONA_ORDER, whatever order Kissflow sends them in", () => {
    const id = identityOf(kfWith([role("owner"), role("saf"), role("rmm"), role("cus"), role("admin")]));
    expect(id.personas).toEqual(["rmm", "saf", "cus", "admin", "owner"]);
    expect(PERSONA_ORDER.filter((p) => id.personas.includes(p))).toEqual(id.personas);
  });

  it("gives a Case administrator or Integration service alone no CIQ persona, and names unknown roles", () => {
    const ca = identityOf(kfWith([{ _id: OTHER_ROLES.caseAdmin.id, Name: OTHER_ROLES.caseAdmin.name }, { _id: "RoUser", Name: "User" }]));
    expect(ca.personas).toEqual([]);
    expect(ca.caseAdmin).toBe(true);
    expect(ca.integration).toBe(false);
    expect(ca.unknownRoles).toEqual(["User"]);
    const svc = identityOf(kfWith([{ _id: "RoRenamed", Name: OTHER_ROLES.integration.name }]));
    expect(svc).toMatchObject({ personas: [], caseAdmin: false, integration: true });
  });

  it("keeps the user and the roles as Kissflow sent them; no AppRoles = no persona", () => {
    const id = identityOf(kfWith([role("rmm")]));
    expect(id).toMatchObject({ kfUserId: "UsLenaKrause", name: "Lena Krause", email: "lena.krause@beiersdorf.example", roles: [{ id: ROLES.rmm.id, name: ROLES.rmm.name }] });
    expect(identityOf(kfWith([], { AppRoles: undefined })).personas).toEqual([]);
  });
});

describe("actingAs", () => {
  const multi = identityOf(kfWith([role("rmm"), role("admin"), role("auditor"), role("owner"), role("qm")]));

  it("acts as the Kissflow user for RMM and the departments, with the persona's dept and label", () => {
    const a = actingAs(multi, "qm");
    expect(a.me).toMatchObject({ id: "UsLenaKrause", name: "Lena Krause", side: "internal", dept: "QM", title: "Quality Management reviewer", initials: "LK" });
    expect(a.persona).toMatchObject({ id: "qm", userId: "UsLenaKrause", landing: "/review" });
    expect(a).toMatchObject({ personaId: "qm", roleId: ROLES.qm.id, dept: "QM" });
  });

  it("acts as u-admin / u-auditor / u-owner for those personas, so the domain's rights hold (G-3)", () => {
    for (const p of ["admin", "auditor", "owner"] as const) {
      const a = actingAs(multi, p);
      expect(a.me.id).toBe(`u-${p}`);
      expect(a.persona.userId).toBe(`u-${p}`);
      expect(a.me.dept).toBeUndefined();
      const state = { users: [a.me] } as unknown as AppState;
      expect(roleOf(state, a.me.id)).toBe(p);
    }
    const ba = actingAs(multi, "admin");
    const s = { users: [ba.me] } as unknown as AppState;
    expect(check(s, ba.me.id, "config.manage")).toBeNull();
    expect(check(s, ba.me.id, "supplier.manage")).toBeNull();
    // without the alias the Kissflow user would be "unknown" to roleOf
    expect(roleOf({ users: [{ ...ba.me, id: multi.kfUserId }] } as unknown as AppState, multi.kfUserId)).toBe("unknown");
  });

  it("matches the fixtures' own acting rule", () => {
    for (const p of PERSONA_ORDER) {
      const mine = actingAs(multi, p);
      const theirs = fixtureActing(multi, p);
      expect(mine.me.id).toBe(theirs.me.id);
      expect(mine.persona.userId).toBe(theirs.persona.userId);
      expect(mine.me.dept).toBe(theirs.me.dept);
    }
  });

  it("uses the role id Kissflow sent for a name-matched role", () => {
    const id = identityOf(kfWith([{ _id: "RoNewRmm", Name: ROLES.rmm.name }]));
    expect(actingAs(id, "rmm").roleId).toBe("RoNewRmm");
  });

  it("never shows an empty name", () => {
    const id = identityOf(kfWith([role("rmm")], { Name: "", Email: "anon@beiersdorf.example" }));
    expect(actingAs(id, "rmm").me.name).toBe("anon@beiersdorf.example");
  });
});

describe("kfUserIdOf", () => {
  it("maps a held persona's alias back to the Kissflow user, and leaves every other id alone", () => {
    const ba = identityOf(kfWith([role("admin")]));
    expect(kfUserIdOf("u-admin", ba)).toBe("UsLenaKrause");
    expect(kfUserIdOf("u-auditor", ba)).toBe("u-auditor"); // not held
    expect(kfUserIdOf("UsSomeoneElse", ba)).toBe("UsSomeoneElse");
    expect(kfUserIdOf("system", ba)).toBe("system");
    expect(kfUserIdOf(actingAs(ba, "admin").me.id, ba)).toBe(ba.kfUserId);
  });
});
