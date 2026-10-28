import { describe, expect, it } from "vitest";
import { cancelCase, confirmCompleteness, createCase, finalRelease, saveConfig } from "./actions";
import { wasRefused } from "./core";
import { checkInvariants } from "./invariants";
import { mailsFor } from "./mail";
import { resolvePersonaId, switchablePeople } from "./personas";
import { buildSeed } from "./seed";
import { duplicateOpenCases, tasksForContact, visibleCasesFor } from "./selectors";
import {
  addContact,
  addSupplier,
  contactDeactivationImpact,
  isValidDuns,
  isValidEmail,
  setContactActive,
  supplierHistory,
  supplierRows,
  updateContact,
  updateSupplier,
  validateContact,
  validateSupplier,
  type SupplierInput,
} from "./suppliers";
import { NEW_CASE, Scenario, T0 } from "./testkit";
import type { AppState } from "./types";

const NEW: SupplierInput = {
  name: "Brightwater Esters B.V.",
  duns: "087 342-616",
  country: "Netherlands",
  city: "Rotterdam",
  type: "manufacturer",
  contacts: [
    { name: "Femke de Vries", email: "femke.devries@brightwater.example", title: "Regulatory Lead" },
    { name: "Joris Bakker", email: "joris.bakker@brightwater.example", title: "QA Manager", mayConfirm: false },
  ],
};

describe("supplier master validation", () => {
  const s = buildSeed();

  it.each([
    ["471203958", true],
    ["087342615", true],
    ["0873-42 615", true],
    ["12345678", false],
    ["1234567890", false],
    ["12345678A", false],
    ["", false],
  ])("DUNS %s valid: %s", (duns, ok) => expect(isValidDuns(duns)).toBe(ok));

  it.each([
    ["elena@solvaro.example", true],
    ["a.b-c@sub.domain.co", true],
    ["a@b", false],
    ["no-at.example", false],
    ["two@@x.example", false],
    ["sp ace@x.example", false],
  ])("e-mail %s valid: %s", (mail, ok) => expect(isValidEmail(mail)).toBe(ok));

  it("names every problem of an empty form", () => {
    const e = validateSupplier(s, { name: " ", duns: "", country: "", type: "manufacturer", contacts: [] });
    expect(Object.keys(e).sort()).toEqual(["contacts", "country", "duns", "name"]);
  });

  it("refuses a duplicate DUNS (naming the supplier) and an e-mail used by any other user", () => {
    expect(validateSupplier(s, { ...NEW, duns: "471-203-958" }).duns).toBe("DUNS 471203958 is already used by Solvaro Oleochemicals S.A.");
    expect(validateContact(s, { name: "X", email: " Elena.Marquez@solvaro.example " }).email).toMatch(/already used by Elena Márquez \(Solvaro/);
    expect(validateContact(s, { name: "X", email: "katrin.vogel@beiersdorf.example" }).email).toMatch(/already used by Katrin Vogel/);
    const twice = validateSupplier(s, { ...NEW, contacts: [NEW.contacts[0], { ...NEW.contacts[1], email: NEW.contacts[0].email.toUpperCase() }] });
    expect(twice["contacts.1.email"]).toBe("Two contacts have the same e-mail address.");
    expect(validateSupplier(s, NEW)).toEqual({});
    // Editing the supplier itself does not clash with its own DUNS.
    expect(validateSupplier(s, { ...s.suppliers[0], contacts: undefined }, "s1")).toEqual({});
  });
});

/** Only the Business administrator maintains the supplier master (Thomas, 14 Oct); RMM looks it up. */
const ADMIN = "u-admin";
const ONLY_ADMIN = "Only the business administrator maintains the supplier master.";

describe("supplier master actions", () => {
  it("only the administrator adds suppliers; RMM and everybody else are refused", () => {
    const s = buildSeed();
    for (const by of ["u-rmm", "u-reg", "u-owner", "u-auditor", "u-cus", "u-sup-1"]) {
      const next = addSupplier(s, by, NEW, T0).state;
      expect(wasRefused(s, next), by).toBe(true);
      expect(next.toasts.at(-1)?.text, by).toBe(ONLY_ADMIN);
      expect(next.suppliers, by).toEqual(s.suppliers);
    }
    const r = addSupplier(s, ADMIN, NEW, T0);
    expect(r.id).toBe("s2");
    const sup = r.state.suppliers.find((x) => x.id === "s2")!;
    expect(sup).toMatchObject({ duns: "087342616", active: true, contactIds: ["u-s2-1", "u-s2-2"] }); // stored as 9 digits, leading zero kept
    expect(r.state.users.find((u) => u.id === "u-s2-2")).toMatchObject({ supplierId: "s2", side: "supplier", email: "joris.bakker@brightwater.example", active: true, mayConfirm: false });
    expect(supplierHistory(r.state, "s2").map((e) => e.action)).toEqual(["Added supplier"]);
    expect(checkInvariants(r.state)).toEqual([]);
    expect(addSupplier(r.state, ADMIN, NEW, T0).state.toasts.at(-1)?.text).toMatch(/already used by Brightwater/); // DUNS now taken
  });

  it("its contacts become supplier personas at once and see only the cases they are named on", () => {
    let s = addSupplier(buildSeed(), ADMIN, NEW, T0).state;
    expect(resolvePersonaId(s, "sup:u-s2-1")).toBe("sup:u-s2-1");
    expect(switchablePeople(s).map((g) => g.title)).toContain("Brightwater Esters B.V.");
    const r = createCase(s, "u-rmm", { ...NEW_CASE, supplierId: "s2", contactIds: ["u-s2-1"] }, T0);
    s = r.state;
    expect(visibleCasesFor(s, "u-s2-1").map((c) => c.id)).toEqual([r.id]);
    expect(visibleCasesFor(s, "u-s2-2")).toEqual([]);
    expect(visibleCasesFor(s, "u-sup-1")).toEqual([]);
    expect(visibleCasesFor(s, "u-rmm").map((c) => c.id)).toEqual([r.id]);
    expect(mailsFor(s, "u-s2-1").map((m) => m.event)).toEqual(["invitation"]);
    expect(mailsFor(s, "u-s2-2")).toEqual([]);
    // A contact that may not confirm cannot confirm completeness.
    const named = createCase(s, "u-rmm", { ...NEW_CASE, materialNo: "RM-9", supplierId: "s2", contactIds: ["u-s2-2"] }, T0);
    const refused = confirmCompleteness(named.state, "u-s2-2", named.id, T0);
    expect(refused.toasts.at(-1)?.text).toMatch(/may not confirm/);
  });

  it("new cases use the master: the supplier must exist and be active, the 1–2 contacts must be its active contacts", () => {
    const s = buildSeed();
    const tries: [Partial<typeof NEW_CASE>, RegExp][] = [
      [{ supplierId: "s9" }, /supplier from the supplier master/],
      [{ contactIds: [] }, /at least one contact/],
      [{ contactIds: ["u-sup-1", "u-sup-2", "u-sup-1"] }, /.*/],
      [{ contactIds: ["u-rmm"] }, /contact of the chosen supplier/],
      [{ materialName: " " }, /trade name/],
      [{ inci: "" }, /INCI/],
      [{ materialNo: "" }, /material number/],
      [{ markets: [] }, /target market/],
      [{ dueDate: "2026-10-01T00:00:00.000Z" }, /due date/],
    ];
    for (const [patch, msg] of tries) {
      const r = createCase(s, "u-rmm", { ...NEW_CASE, ...patch }, T0);
      if (patch.contactIds?.length === 3) {
        expect(r.id).toBe("CIQ-2026-0001"); // duplicates are collapsed to the two contacts
        expect(r.state.cases[0].supplierContactIds).toEqual(["u-sup-1", "u-sup-2"]);
        continue;
      }
      expect(r.id, JSON.stringify(patch)).toBe("");
      expect(r.state.toasts.at(-1)?.text).toMatch(msg);
    }
    expect(createCase(s, "u-reg", NEW_CASE, T0).id).toBe("");
    const inactive = updateSupplier(addSupplier(s, ADMIN, NEW, T0).state, ADMIN, "s2", { active: false }, T0);
    expect(createCase(inactive, "u-rmm", { ...NEW_CASE, supplierId: "s2", contactIds: ["u-s2-1"] }, T0).state.toasts.at(-1)?.text).toMatch(/inactive/);
  });

  it("warns about an open case for the same supplier and material number, and audits the reason", () => {
    const sc = new Scenario().create();
    expect(duplicateOpenCases(sc.s, "s1", " rm-500123 ").map((c) => c.id)).toEqual(["CIQ-2026-0001"]);
    expect(duplicateOpenCases(sc.s, "s1", "RM-1")).toEqual([]);
    sc.create({ duplicateNote: "Second grade from another plant" });
    expect(sc.c.audit.find((a) => a.action === "Created despite an open case")?.detail).toBe("Open case for the same supplier and material number: CIQ-2026-0001. Reason: Second grade from another plant");
    sc.step("cancel the first", (s, at) => cancelCase(s, "u-rmm", "CIQ-2026-0001", "Duplicate request", at));
    expect(duplicateOpenCases(sc.s, "s1", "RM-500123").map((c) => c.id)).toEqual(["CIQ-2026-0002"]);
  });

  it("edits suppliers and contacts with validation; every change is in the supplier's history", () => {
    let s = buildSeed();
    expect(wasRefused(s, updateSupplier(s, ADMIN, "s1", { duns: "12" }, T0))).toBe(true);
    s = updateSupplier(s, ADMIN, "s1", { city: "Reus" }, T0);
    expect(s.suppliers[0].city).toBe("Reus");
    expect(updateSupplier(s, ADMIN, "s1", { city: "Reus" }, T0)).toBe(s); // nothing changed
    const added = addContact(s, ADMIN, "s1", { name: "Lucía Ortega", email: "lucia.ortega@solvaro.example", title: "Sustainability Lead" }, T0);
    expect(added.id).toBe("u-s1-1");
    s = added.state;
    expect(wasRefused(s, updateContact(s, ADMIN, "u-s1-1", { email: "ravi.menon@solvaro.example" }, T0))).toBe(true);
    s = updateContact(s, ADMIN, "u-s1-1", { mayConfirm: false, title: "Sustainability Manager" }, T0);
    expect(s.users.find((u) => u.id === "u-s1-1")).toMatchObject({ mayConfirm: false, title: "Sustainability Manager" });
    expect(supplierHistory(s, "s1").map((e) => e.action)).toEqual(["Updated contact", "Added contact", "Updated supplier"]);
    expect(supplierRows(s)[0]).toMatchObject({ activeContacts: 3, contacts: 3, openCases: 0, status: "active" });
    expect(checkInvariants(s)).toEqual([]);
  });

  it("never gives a new contact a key a row of the supplier already holds (live: Supplier.contactKeys)", () => {
    const s = buildSeed();
    const lucia = { name: "Lucía Ortega", email: "lucia.ortega@solvaro.example" };
    // live, the row created as u-s1-1 now shows its portal user's id: no user has the id u-s1-1, the row keeps the key
    const live: AppState = { ...s, suppliers: s.suppliers.map((x) => (x.id === "s1" ? { ...x, contactKeys: ["u-s1-1"] } : x)) };
    expect(addContact(live, ADMIN, "s1", lucia, T0).id).toBe("u-s1-2");
    // the prototype has no rows (no contactKeys): unchanged
    expect(addContact(s, ADMIN, "s1", lucia, T0).id).toBe("u-s1-1");
  });

  it("deactivates contacts (never deletes): a contact named on an open case is replaced, and then gets nothing", () => {
    const sc = new Scenario().create({ contactIds: ["u-sup-1"] });
    sc.step("add a third contact", (s, at) => addContact(s, ADMIN, "s1", { name: "Lucía Ortega", email: "lucia.ortega@solvaro.example" }, at).state);
    expect(contactDeactivationImpact(sc.s, "u-sup-1").needsReplacement.map((c) => c.id)).toEqual([sc.id]);
    expect(sc.refused("deactivate without replacement", (s, at) => setContactActive(s, ADMIN, "u-sup-1", false, undefined, at))).toMatch(/only contact on CIQ-2026-0001\. Choose a replacement/);
    expect(sc.refused("replacement from another supplier", (s, at) => setContactActive(s, ADMIN, "u-sup-1", false, "u-rmm", at))).toMatch(/replacement must be another active contact/);
    sc.step("deactivate with replacement", (s, at) => setContactActive(s, ADMIN, "u-sup-1", false, "u-s1-1", at));
    expect(sc.c.supplierContactIds).toEqual(["u-s1-1"]);
    expect(sc.c.audit.at(-1)).toMatchObject({ action: "Replaced supplier contact" });
    expect(mailsFor(sc.s, "u-s1-1").map((m) => m.event)).toEqual(["invitation"]);
    expect(tasksForContact(sc.s, "u-sup-1")).toEqual([]);
    expect(visibleCasesFor(sc.s, "u-sup-1")).toEqual([]);
    expect(sc.s.users.find((u) => u.id === "u-sup-1")).toMatchObject({ active: false, name: "Elena Márquez" });
    // The deactivated contact can no longer act, and receives no mail.
    const before = mailsFor(sc.s, "u-sup-1").length;
    expect(sc.refused("old contact answers", (s, at) => saveConfig(s, "u-sup-1", sc.id, { SF02: true }, at))).toMatch(/no longer active/);
    sc.metadata(undefined, "u-s1-1");
    expect(mailsFor(sc.s, "u-sup-1")).toHaveLength(before);
    expect(sc.refused("old contact releases", (s, at) => finalRelease(s, "u-sup-1", sc.id, at))).toBeTruthy();
    // Reactivating gives no access by itself: case contacts are chosen per case.
    sc.step("reactivate", (s, at) => setContactActive(s, ADMIN, "u-sup-1", true, undefined, at));
    expect(visibleCasesFor(sc.s, "u-sup-1")).toEqual([]);
  });

  it("removes a contact without a replacement when its cases keep another contact; never the last active contact", () => {
    const sc = new Scenario().create();
    sc.step("deactivate Ravi", (s, at) => setContactActive(s, ADMIN, "u-sup-2", false, undefined, at));
    expect(sc.c.supplierContactIds).toEqual(["u-sup-1"]);
    expect(sc.c.audit.at(-1)?.action).toBe("Removed supplier contact");
    expect(sc.refused("deactivate the last", (s, at) => setContactActive(s, ADMIN, "u-sup-1", false, undefined, at))).toMatch(/last active contact/);
    expect(sc.refused("not allowed", (s, at) => setContactActive(s, "u-reg", "u-sup-1", false, undefined, at))).toBe(ONLY_ADMIN);
    expect(sc.refused("already inactive", (s, at) => setContactActive(s, ADMIN, "u-sup-2", false, undefined, at))).toMatch(/already inactive/);
  });

  it("a supplier with open cases cannot be deactivated", () => {
    const sc = new Scenario().create();
    expect(sc.refused("deactivate supplier", (s, at) => updateSupplier(s, ADMIN, "s1", { active: false }, at))).toMatch(/has open cases \(CIQ-2026-0001\)/);
  });

  it("RMM looks the supplier master up but cannot change it: every add, edit, deactivation and reactivation is refused", () => {
    const sc = new Scenario().create();
    const tries: [string, (s: AppState, at: string) => AppState][] = [
      ["add a supplier", (s, at) => addSupplier(s, "u-rmm", NEW, at).state],
      ["edit the supplier", (s, at) => updateSupplier(s, "u-rmm", "s1", { city: "Reus" }, at)],
      ["deactivate the supplier", (s, at) => updateSupplier(s, "u-rmm", "s1", { active: false }, at)],
      ["add a contact", (s, at) => addContact(s, "u-rmm", "s1", { name: "Lucía Ortega", email: "lucia.ortega@solvaro.example" }, at).state],
      ["edit a contact", (s, at) => updateContact(s, "u-rmm", "u-sup-2", { mayConfirm: false }, at)],
      ["deactivate a contact", (s, at) => setContactActive(s, "u-rmm", "u-sup-2", false, undefined, at)],
    ];
    for (const [label, fn] of tries) expect(sc.refused(`RMM: ${label}`, fn), label).toBe(ONLY_ADMIN);
    // an inactive supplier and contact stay inactive for RMM too
    sc.step("admin deactivates Ravi", (s, at) => setContactActive(s, ADMIN, "u-sup-2", false, undefined, at));
    expect(sc.refused("RMM: reactivate a contact", (s, at) => setContactActive(s, "u-rmm", "u-sup-2", true, undefined, at))).toBe(ONLY_ADMIN);
    const cancelled = sc.step("cancel", (s, at) => cancelCase(s, "u-rmm", sc.id, "Project stopped", at)).step("admin deactivates Solvaro", (s, at) => updateSupplier(s, ADMIN, "s1", { active: false }, at));
    expect(cancelled.refused("RMM: reactivate the supplier", (s, at) => updateSupplier(s, "u-rmm", "s1", { active: true }, at))).toBe(ONLY_ADMIN);
    expect(supplierHistory(cancelled.s, "s1").filter((e) => e.kind === "supplier").map((e) => [e.action, e.by])).toEqual([
      ["Deactivated supplier", ADMIN],
      ["Deactivated contact", ADMIN],
    ]);
  });
});

