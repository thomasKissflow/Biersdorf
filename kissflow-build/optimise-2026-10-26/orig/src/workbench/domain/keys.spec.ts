import { describe, expect, it } from "vitest";
import { caseCode, childRowId, completenessRequestKey, configKey, eventKey, finalReleaseRequestKey, naturalKeyOf, noticeKey, opKey, queryKey, releaseKey, requestKey, rmesKey, rmesRowKey, runKey, sectionItemKey } from "./keys";

const fixed = () => 0.42;
describe("key formats (§4.6)", () => {
  it("Case_Code and per-cycle keys", () => {
    const code = caseCode(2026, "PkEK1");
    expect(code).toBe("CIQ-2026-PkEK1");
    expect(requestKey(code, 1)).toBe("CIQ-2026-PkEK1-C1-REQ");
    expect(completenessRequestKey(code, 1)).toBe("CIQ-2026-PkEK1-C1-PS05");
    expect(finalReleaseRequestKey(code, 2)).toBe("CIQ-2026-PkEK1-C2-PS11");
    expect(rmesRowKey(rmesKey(code, 1), "SAF")).toBe("CIQ-2026-PkEK1-C1-RMES-SAF");
    expect(runKey(code, 1, 2)).toBe("CIQ-2026-PkEK1-C1-RUN2");
    expect(sectionItemKey(code, 1, "K2.1")).toBe("CIQ-2026-PkEK1-C1-K2.1");
  });
  it("OP_Key, Query_Key (brd L887), Notice, Event, Config, Release, child row ids", () => {
    const op = opKey("CIQ-2026-PkEK1", 1, new Date(0), fixed);
    expect(op).toMatch(/^CIQ-2026-PkEK1-C1-OP0[0-9a-z]{4}$/);
    expect(queryKey(op, 2)).toBe(`${op}|R2`);
    expect(noticeKey("X-CR1")).toBe("X-CR1-NOTICE");
    expect(eventKey(new Date(36), fixed)).toMatch(/^EV-10[0-9a-z]{6}$/);
    expect(configKey("Section definition", "K2.1", 3)).toBe("section-definition-K2.1-v3");
    expect(releaseKey(new Date("2026-10-08T10:00:00Z"), 1)).toBe("REL-20261008-1");
    expect(childRowId("Rounds", fixed)).toMatch(/^Rounds_[A-Za-z0-9]{10}$/);
  });
  it("natural keys: Rounds by round + outcome; Contacts by e-mail, lower-case; blank key → null", () => {
    expect(naturalKeyOf("Rounds", { Rounds_Round_No: 1, Rounds_Outcome: "Returned" })).toBe(naturalKeyOf("Rounds", { Rounds_Round_No: "1", Rounds_Outcome: "Returned" }));
    expect(naturalKeyOf("Contacts", { Contacts_Email: "Ana.Contact@Example.test" })).toBe(naturalKeyOf("Contacts", { Contacts_Email: "ana.contact@example.test" }));
    expect(naturalKeyOf("Safety_Criteria", { Criteria_Code: "" })).toBeNull();
  });
  it("natural keys: a finding without a criterion code is keyed on its text (CR-T4-harness-1); a blank text → null", () => {
    const k = naturalKeyOf("Safety_Findings", { Findings_Criterion_Code: "", Findings_Text: "Impurity above limit" });
    expect(k).not.toBeNull();
    expect(naturalKeyOf("Safety_Findings", { Findings_Text: "Impurity above limit" })).toBe(k);
    expect(naturalKeyOf("Safety_Findings", { Findings_Criterion_Code: null, Findings_Text: " Impurity above limit " })).toBe(k);
    expect(naturalKeyOf("Safety_Findings", { Findings_Criterion_Code: "SAF-A1", Findings_Text: "Impurity above limit" })).not.toBe(k);
    expect(naturalKeyOf("Regulatory_Findings", { Findings_Criterion_Code: "", Findings_Text: "" })).toBeNull();
  });
});
