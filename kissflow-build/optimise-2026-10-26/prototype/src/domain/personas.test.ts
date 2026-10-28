import { describe, expect, it } from "vitest";
import { INTERNAL_PERSONAS, PERSONA_BY_ID } from "./catalog";
import { personaOf, resolvePersonaId, supplierPersonaId, switchablePeople, taskCountFor } from "./personas";
import { buildSeed } from "./seed";
import { setContactActive } from "./suppliers";
import { Scenario } from "./testkit";

describe("personas (spec §3)", () => {
  it("internal personas are static, with the final menus and landings", () => {
    const nav = Object.fromEntries(INTERNAL_PERSONAS.map((p) => [p.id, [p.landing, p.nav.map((n) => n.label).join(" · ")]]));
    expect(nav).toEqual({
      rmm: ["/rmm", "Dashboard · My reviews · Cases · Suppliers"],
      reg: ["/review", "My reviews · Cases"],
      saf: ["/review", "My reviews · Cases"],
      qm: ["/review", "My reviews · Cases"],
      mic: ["/review", "My reviews · Cases"],
      sus: ["/review", "My reviews · Cases"],
      cus: ["/cases", "Cases"],
      leg: ["/cases", "Cases"],
      admin: ["/admin/rules", "Rules · Questionnaire · Section owners · Suppliers"],
      auditor: ["/audit", "Audit trail · Cases · Rules"],
      owner: ["/reports", "Reports · Cases"],
    });
    const routes = INTERNAL_PERSONAS.flatMap((p) => p.nav.map((n) => n.to));
    expect(routes).not.toContain("/understanding");
    expect(routes).not.toContain("/informed");
    expect(routes).not.toContain("/cases/new");
    expect(INTERNAL_PERSONAS.map((p) => p.description).join(" ")).not.toMatch(/assumption|prototype|AS-\d|review version/i);
  });

  it("supplier personas are derived from the active contacts as sup:<userId>", () => {
    const s = buildSeed();
    const p = personaOf(s, "sup:u-sup-1")!;
    expect(p).toMatchObject({ id: "sup:u-sup-1", userId: "u-sup-1", side: "supplier", landing: "/portal" });
    expect(p.nav.map((n) => n.label)).toEqual(["My requests", "Help"]);
    expect(personaOf(s, "sup:u-nobody")).toBeUndefined();
    expect(personaOf(s, "sup:u-rmm")).toBeUndefined(); // an internal user is no supplier persona
    expect(personaOf(s, "rmm")).toBe(PERSONA_BY_ID.rmm);
    expect(supplierPersonaId("u-sup-2")).toBe("sup:u-sup-2");
  });

  it("maps the legacy supplier ids to the contacts, and drops a deactivated contact", () => {
    let s = buildSeed();
    expect(resolvePersonaId(s, "supplier")).toBe("sup:u-sup-1");
    expect(resolvePersonaId(s, "supplier2")).toBe("sup:u-sup-2");
    expect(resolvePersonaId(s, "nope")).toBeUndefined();
    s = setContactActive(s, "u-admin", "u-sup-1", false, undefined, "2026-10-14T09:00:00.000Z");
    expect(resolvePersonaId(s, "sup:u-sup-1")).toBeUndefined();
    expect(resolvePersonaId(s, "supplier")).toBe("sup:u-sup-2");
    expect(resolvePersonaId(s, "supplier2")).toBe("sup:u-sup-2");
    expect(switchablePeople(s).flatMap((g) => g.people).map((p) => p.personaId)).not.toContain("sup:u-sup-1");
  });

  it("counts tasks and unread mails per person", () => {
    const sc = new Scenario().create();
    const people = () => Object.fromEntries(switchablePeople(sc.s).flatMap((g) => g.people).map((p) => [p.userId, [p.tasks, p.unread]]));
    expect(people()["u-sup-1"]).toEqual([1, 1]);
    expect(people()["u-sup-2"]).toEqual([1, 1]);
    expect(people()["u-reg"]).toEqual([0, 0]);
    sc.metadata().fillMandatory().confirm();
    expect(people()["u-reg"]).toEqual([1, 1]);
    expect(people()["u-rmm"]).toEqual([1, 1]);
    expect(people()["u-cus"]).toEqual([0, 1]); // informed only
    expect(people()["u-sup-1"]).toEqual([0, 1]);
    expect(taskCountFor(sc.s, "u-admin")).toBe(0);
  });

  it("a contact named alone on a case is the only one with its task", () => {
    const sc = new Scenario().create({ contactIds: ["u-sup-2"] });
    expect(taskCountFor(sc.s, "u-sup-2")).toBe(1);
    expect(taskCountFor(sc.s, "u-sup-1")).toBe(0);
  });
});
