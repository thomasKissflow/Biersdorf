import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as stub from "@/call/seedStub";
import { BUILTIN_SECTIONS, INTERNAL_PERSONAS } from "./catalog";
import { configVersions, currentPair, draftChanges, draftPair, validateDraft } from "./configActions";
import { checkInvariants } from "./invariants";
import { roleOf, userOf } from "./permissions";
import { switchablePeople } from "./personas";
import * as seed from "./seed";
import { buildSeed, SCHEMA } from "./seed";
import { Scenario } from "./testkit";

describe("empty demo start (spec §0)", () => {
  const s = buildSeed();

  it("has no cases, mails, log entries or change reports", () => {
    expect(s.cases).toEqual([]);
    expect(s.mails).toEqual([]);
    expect(s.log).toEqual([]);
    expect(s.changeReports).toEqual([]);
    expect(s.toasts).toEqual([]);
  });

  it("has the 11 internal role holders, one per role", () => {
    const internal = s.users.filter((u) => u.side === "internal");
    expect(internal).toHaveLength(11);
    expect(INTERNAL_PERSONAS).toHaveLength(11);
    for (const p of INTERNAL_PERSONAS) {
      expect(userOf(s, p.userId), p.id).toBeDefined();
      expect(roleOf(s, p.userId)).toBe(p.id);
    }
  });

  it("has exactly one supplier, Solvaro, with Elena Márquez and Ravi Menon, both active and allowed to confirm", () => {
    expect(s.suppliers).toEqual([{ id: "s1", name: "Solvaro Oleochemicals S.A.", duns: "471203958", country: "Spain", city: "Tarragona", type: "manufacturer", contactIds: ["u-sup-1", "u-sup-2"], active: true }]);
    const contacts = s.users.filter((u) => u.side === "supplier");
    expect(contacts.map((u) => [u.id, u.name, u.title, u.active, u.mayConfirm])).toEqual([
      ["u-sup-1", "Elena Márquez", "Regulatory Manager", true, true],
      ["u-sup-2", "Ravi Menon", "QA Specialist", true, true],
    ]);
    expect(contacts.every((u) => u.supplierId === "s1")).toBe(true);
  });

  it("keeps the configuration: questionnaire v1 published and v2 in draft, RS-2026.1, section ownership, reminders", () => {
    expect(s.templates.map((t) => [t.version, t.status])).toEqual([
      ["CIQ-2026 v1", "published"],
      ["CIQ-2026 v2", "draft"],
    ]);
    expect(s.activeRuleSet).toBe("RS-2026.1");
    expect(Object.keys(s.ownership).sort()).toEqual(BUILTIN_SECTIONS.map((x) => x.id).sort());
    expect(s.reminders.map((r) => r.id)).toEqual(["rem-1", "rem-2", "rem-3", "rem-5", "rem-6"]);
  });

  it("holds the prepared RS-2026.2 + v2 as the one editable draft; RS-2026.1 + v1 is used for new cases (spec §8)", () => {
    expect(s.config.pairs).toHaveLength(1);
    const d = draftPair(s)!;
    expect([d.ruleSet.version, d.template.version, d.status]).toEqual(["RS-2026.2", "CIQ-2026 v2", "draft"]);
    expect(d.basedOn).toEqual({ ruleSetVersion: "RS-2026.1", templateVersion: "CIQ-2026 v1" });
    expect(currentPair(s)).toEqual({ ruleSetVersion: "RS-2026.1", templateVersion: "CIQ-2026 v1" });
    const ch = draftChanges(s)!;
    expect([ch.rules.added, ch.sections.added, ch.count]).toEqual([["R-111"], ["K6.3", "A12"], 3]);
    expect(validateDraft(s)!.ok).toBe(true);
    expect(configVersions(s).map((v) => [v.label, v.status, v.casesUsing])).toEqual([
      ["RS-2026.2 + v2", "draft", 0],
      ["RS-2026.1 + v1", "current", 0],
    ]);
  });

  it("is SCHEMA 9, deterministic and fresh on every call (Reset returns exactly this)", () => {
    expect(SCHEMA).toBe(9);
    expect(s.schema).toBe(9);
    const a = buildSeed();
    a.users[0].name = "changed";
    a.suppliers[0].contactIds.push("x");
    a.config.pairs[0].ruleSet.rules[0].activates.push("x");
    a.config.pairs[0].template.sections[0].fields[0].label = "changed";
    a.ownership.GEN.co.push("SAF");
    expect(buildSeed()).toEqual(s);
    expect(s.personaId).toBe("rmm");
  });

  it("is consistent", () => {
    expect(checkInvariants(s)).toEqual([]);
  });

  it("offers every role holder and both supplier contacts in View as, with no tasks and no mail", () => {
    const groups = switchablePeople(s);
    expect(groups.map((g) => g.title)).toEqual(["Raw Material Management", "Solvaro Oleochemicals S.A.", "Department reviewers", "Informed, read-only", "Administration and oversight"]);
    const people = groups.flatMap((g) => g.people);
    expect(people).toHaveLength(13);
    expect(people.filter((p) => p.side === "supplier").map((p) => p.personaId)).toEqual(["sup:u-sup-1", "sup:u-sup-2"]);
    expect(people.every((p) => p.tasks === 0 && p.unread === 0)).toBe(true);
  });

  it("numbers the first case CIQ-2026-0001 and the next CIQ-2026-0002", () => {
    const sc = new Scenario().create();
    expect(sc.id).toBe("CIQ-2026-0001");
    sc.create({ materialNo: "RM-500124" });
    expect(sc.id).toBe("CIQ-2026-0002");
    expect(sc.c.openPoints).toEqual([]);
    expect(sc.c.reviews).toEqual([]); // review tasks come with the completeness confirmation
  });

  it("keeps the supplier line format that the workbench harness reads from seed.ts", () => {
    const txt = readFileSync(new URL("./seed.ts", import.meta.url), "utf8");
    const names = [...txt.matchAll(/\{ id: "s\d+", name: "([^"]+)"/g)].map((m) => m[1]);
    expect(names).toContain("Solvaro Oleochemicals S.A.");
    expect(names.length).toBeGreaterThanOrEqual(10);
  });

  it("the call build's seed stub exports the same names as seed.ts", () => {
    expect(Object.keys(stub).sort()).toEqual(Object.keys(seed).sort());
    expect(stub.SCHEMA).toBe(SCHEMA);
    expect(Object.keys(stub.buildSeed()).sort()).toEqual(Object.keys(buildSeed()).sort());
  });
});
