// Every feature flag in both states (§7.11, WB-17).
import { describe, expect, it } from "vitest";
import { ADDITIONAL_PART_RAISE, SCOPE_EXTENDED_OUTCOME, countsPolicyFrom, crOutcomeOptions, flagsFor, opKindOptions, partialCountAction } from "./flags";
import type { RoleIr } from "../schema";

const rmm = new Set<RoleIr>(["ciq_rmm"]);
const saf = new Set<RoleIr>(["ciq_safety_reviewer"]);

describe("flags", () => {
  it("MVP defaults: both code flags off", () => {
    expect(ADDITIONAL_PART_RAISE).toBe(false);
    expect(SCOPE_EXTENDED_OUTCOME).toBe(false);
  });
  it("additionalPartRaise: reviewers never get 'Additional part'; RMM only with the flag on", () => {
    expect(opKindOptions(saf, { additionalPartRaise: true })).not.toContain("Additional part");
    expect(opKindOptions(saf, { additionalPartRaise: false })).not.toContain("Additional part");
    expect(opKindOptions(rmm, { additionalPartRaise: false })).not.toContain("Additional part");
    expect(opKindOptions(rmm, { additionalPartRaise: true })).toContain("Additional part");
    expect(opKindOptions(saf, { additionalPartRaise: false })).toEqual(["Query", "Document request", "Internal review", "Department review", "Contact update"]);
  });
  it("scopeExtendedOutcome: 'Accepted – scope extended' only when on", () => {
    expect(crOutcomeOptions({ scopeExtendedOutcome: false })).toEqual(["Accepted", "Refused – after final release", "Refused – not valid"]);
    expect(crOutcomeOptions({ scopeExtendedOutcome: true })).toContain("Accepted – scope extended");
  });
  it("countsPolicy: fail-closed unless Settings say exactly attest", () => {
    expect(countsPolicyFrom(undefined)).toEqual({ policy: "fail-closed", source: "default" });
    expect(countsPolicyFrom({ countsPolicy: "ATTEST" })).toEqual({ policy: "fail-closed", source: "default" });
    expect(countsPolicyFrom({ countsPolicy: "attest" })).toEqual({ policy: "attest", source: "settings" });
    expect(countsPolicyFrom({ countsPolicy: "fail-closed" })).toEqual({ policy: "fail-closed", source: "settings" });
    expect(flagsFor({ countsPolicy: "attest" }).countsPolicy).toBe("attest");
  });
  it("partialCountAction: S7 clears; lanes/S5/S8 follow the policy; nowhere else", () => {
    expect(partialCountAction("CASE_S7", { countsPolicy: "attest" })).toBe("clear");
    expect(partialCountAction("CASE_S5", { countsPolicy: "fail-closed" })).toBe("block");
    expect(partialCountAction("CASE_S8", { countsPolicy: "attest" })).toBe("attest");
    expect(partialCountAction("CASE_B_SAF", { countsPolicy: "fail-closed" })).toBe("block");
    expect(() => partialCountAction("CASE_S2", { countsPolicy: "attest" })).toThrow();
  });
});
