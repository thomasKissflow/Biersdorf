// Diagnostics redaction (§9): people redacted by default, consistently within one copy.
import { describe, expect, it } from "vitest";
import { redactPeople } from "./redact";

const diag = {
  user: { name: "Dev Builder", email: "dev@example.test", _id: "UsDev01", appRoles: [{ id: "Ro1", role: "CIQ RMM" }] },
  sample: { Actor_Name: "Jo Weber", Note_Author: { _id: "UsJo", Name: "Jo Weber" }, Supplier_Contact_Emails: "ana.contact@example.test, lee@example.test" },
  error: "Permission denied for dev@example.test (Dev Builder)",
};

describe("redactPeople", () => {
  it("replaces names and e-mails with consistent tags; keeps ids and role names", () => {
    const out = JSON.stringify(redactPeople(diag, { knownNames: ["Dev Builder"], knownEmails: ["dev@example.test"] }));
    for (const s of ["Dev Builder", "Jo Weber", "dev@example.test", "ana.contact@example.test", "lee@example.test"]) expect(out).not.toContain(s);
    expect(out).toContain("<person#1>");
    expect(out).toContain("<email#1>");
    expect(out).toContain("CIQ RMM");
    expect(out).toContain("UsDev01");
    const o = redactPeople(diag, { knownNames: ["Dev Builder"], knownEmails: ["dev@example.test"] }) as typeof diag;
    expect(o.error).toBe("Permission denied for <email#1> (<person#1>)");
    expect(o.sample.Actor_Name).toBe(o.sample.Note_Author.Name);
  });
  it("with the checkbox on, nothing is redacted", () => {
    expect(redactPeople(diag, { includePeople: true })).toBe(diag);
  });
});
