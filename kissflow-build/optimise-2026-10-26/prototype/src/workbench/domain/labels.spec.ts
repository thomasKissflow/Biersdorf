// Review fixes (night): the shared plain-language helpers (UX-01, UX-03, UX-04, UX-11, UX-13).
import { describe, expect, it } from "vitest";
import { APPROVE_BLOCKED_PARTIAL, COUNTS_BLOCKED, COUNTS_BLOCKED_LANE, deptName, flowNoun, personLabel, plural, ruleSetLabel } from "./labels";
import { NO_RULE_SET } from "./keys";

describe("plain-language helpers", () => {
  it("a person is never shown as a user _id: name, else e-mail / contact, else —", () => {
    expect(personLabel({ _id: "UsAlex0001", name: "Alex Rivera" })).toBe("Alex Rivera");
    expect(personLabel({ _id: "UsAlex0001" }, "", "alex@example.test")).toBe("alex@example.test");
    expect(personLabel({ _id: "UsAlex0001" })).toBe("—");
    expect(personLabel(null)).toBe("—");
  });
  it("flows as nouns, departments as names, the 'no rule set' marker in words", () => {
    expect(flowNoun("CIQ Case")).toBe("case");
    expect(flowNoun("CIQ Open Point")).toBe("open point");
    expect(flowNoun("CIQ RMES Safety")).toBe("RMES safety");
    expect(deptName("SAF")).toBe("Safety");
    expect(deptName("CUS")).toBe("CUS");
    expect(deptName("")).toBe("—");
    expect(ruleSetLabel(NO_RULE_SET)).toBe("Not set (manual scope)");
    expect(ruleSetLabel("rules@2026.1")).toBe("rules@2026.1");
    expect(plural(1, "task")).toBe("1 task");
    expect(plural(3, "task")).toBe("3 tasks");
  });
  it("the fail-closed explanations keep the policy and name no person or policy switch (WB-D1 unchanged)", () => {
    for (const t of [COUNTS_BLOCKED, COUNTS_BLOCKED_LANE, APPROVE_BLOCKED_PARTIAL]) {
      expect(t).not.toMatch(/Thomas|policy|WB-D/);
      expect(t).toMatch(/Case administrator/);
    }
    expect(COUNTS_BLOCKED).toMatch(/nothing was written/);
    expect(APPROVE_BLOCKED_PARTIAL).toMatch(/^You can still Reject\. Approve is unavailable/);
  });
});
