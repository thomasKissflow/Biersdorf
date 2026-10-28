// Gate check for the demo start the app opens with (and "Reset to empty start" returns): no cases, no mails,
// one supplier with two active contacts, the 11 internal role holders. emptyStart.test.ts covers the details.
import { describe, expect, it } from "vitest";
import { contactsOf } from "./suppliers";
import { buildSeed } from "./seed";

describe("empty start (gate)", () => {
  const s = buildSeed();

  it("has 0 cases and 0 mails", () => {
    expect(s.cases).toHaveLength(0);
    expect(s.mails).toHaveLength(0);
  });

  it("has 1 supplier with 2 active contacts", () => {
    expect(s.suppliers).toHaveLength(1);
    const [sup] = s.suppliers;
    expect(sup.active).not.toBe(false);
    const active = contactsOf(s, sup.id, true);
    expect(active).toHaveLength(2);
    expect(active.every((u) => u.side === "supplier" && u.supplierId === sup.id && u.active !== false)).toBe(true);
  });

  it("has 11 internal users", () => {
    expect(s.users.filter((u) => u.side === "internal")).toHaveLength(11);
  });
});
