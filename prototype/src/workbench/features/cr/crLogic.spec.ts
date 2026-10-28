// T1 acceptance (§12.1, §8.6): CR after-release forcing (released rule incl. S8 and Completed-after-S7);
// crOutcomeOptions with the flag off and on; the case link of an untriaged CR; the manual CR (Y6).
import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS } from "../../domain/flags";
import { toCrVM } from "../../data/map";
import type { RawItem } from "../../data/viewModels";
import { caseFixture } from "../case/t1.fixtures";
import {
  REFUSED_AFTER_RELEASE,
  buildManualCr,
  buildTriagePatch,
  caseOfCr,
  changeAttemptEvent,
  impactChips,
  isReleased,
  manualCrProblems,
  emptyManualCr,
  triageDefaults,
  triageOutcomeOptions,
  triageProblems,
  withCase,
} from "./crLogic";

const NOW = new Date("2026-10-08T10:00:00Z");
const cr = (f: Record<string, unknown> = {}, id = "PkCr4") =>
  toCrVM({ _id: id, _status: "In progress", CR_Key: "CIQ-2026-PkC8-C1-CRabc", Case_Code: "CIQ-2026-PkC8", Cycle_No: 1, Supplier_Code: "SUP-NWB", Change_Kind: "Answer change", Section_Key: "GEN", ...f } as RawItem, "full", { trustStep: true });

describe("released rule (BR-052)", () => {
  it("Final_Release_At set → released", () => {
    expect(isReleased(caseFixture({ Final_Release_At: "2026-10-06T15:45:00Z", _current_step: "Open items check – before close" }))).toBe(true);
    expect(isReleased(caseFixture({ Final_Release_At: "2026-10-06T15:45:00Z" }))).toBe(true);
  });
  it("at CASE_S8 with Final_Release_At blank (native S7 submit) → released", () => {
    expect(isReleased(caseFixture({ _current_step: "Open items check – before close" }))).toBe(true);
  });
  it("Completed after S7 (Overall_Decision not Rejected) → released; Completed by overall rejection → not", () => {
    expect(isReleased(caseFixture({ _status: "Completed", Overall_Decision: "Approved" }))).toBe(true);
    expect(isReleased(caseFixture({ _status: "Completed" }))).toBe(true);
    expect(isReleased(caseFixture({ _status: "Completed", Overall_Decision: "Rejected" }))).toBe(false);
  });
  it("F5: at CASE_S8 after an overall REJECTION (S7 skipped, PS-11 never ran) → not released", () => {
    expect(isReleased(caseFixture({ _current_step: "Open items check – before close", Overall_Decision: "Rejected" }))).toBe(false);
    expect(isReleased(caseFixture({ _current_step: "Open items check – before close", Overall_Decision: "Approved" }))).toBe(true);
  });
  it("in progress before S7 → not released", () => {
    expect(isReleased(caseFixture({ _current_step: "Open items check – before release request" }))).toBe(false);
    expect(isReleased(caseFixture({ _current_step: "Review – Safety" }))).toBe(false);
  });
});

describe("CR_Outcome options (§7.11, §8.6)", () => {
  it("flag off: 'Accepted – scope extended' is not offered", () => {
    // F1: the after-release refusal needs a released case, so it is not offered before release
    expect(triageOutcomeOptions({ scopeExtendedOutcome: false }, false)).toEqual(["Accepted", "Refused – not valid"]);
    expect(triageOutcomeOptions(DEFAULT_FLAGS, false)).not.toContain("Accepted – scope extended");
  });
  it("flag on: it is offered", () => {
    expect(triageOutcomeOptions({ scopeExtendedOutcome: true }, false)).toContain("Accepted – scope extended");
  });
  it("after release only the refusal is offered, whatever the flag", () => {
    expect(triageOutcomeOptions({ scopeExtendedOutcome: true }, true)).toEqual([REFUSED_AFTER_RELEASE]);
  });
});

describe("Triage after release: forcing (BR-052)", () => {
  it("forces the outcome and every impact to No, generates Notice_Key and sets Case_Item_Id", () => {
    const c8 = caseFixture({ _current_step: "Open items check – before close" }, "PkC8");
    const x = cr();
    const input = { ...withCase(triageDefaults(x, c8), c8), contactVerified: "Yes", outcome: "Accepted", impacts: { REG: "Yes", SAF: "Yes", QM: "No", MIC: "No", SUS: "No" }, noticeTitle: "Answer change", supplierOutcomeText: "Your change can no longer be accepted." };
    const p = buildTriagePatch(x, input, isReleased(c8));
    expect(p.fields).toMatchObject({
      Case_Item_Id: "PkC8",
      Case_Code: "CIQ-2026-PkC8",
      Cycle_No: 1,
      CR_Outcome: REFUSED_AFTER_RELEASE,
      Impact_REG: "No",
      Impact_SAF: "No",
      Impact_QM: "No",
      Impact_MIC: "No",
      Impact_SUS: "No",
      Notice_Key: "CIQ-2026-PkC8-C1-CRabc-NOTICE",
      Portal_Contact_Ids: "PuMira01,PuTeo01",
    });
    expect(triageProblems(input, { released: true, caseReadable: true, flags: DEFAULT_FLAGS })).toEqual([]);
    expect(changeAttemptEvent(x, c8)).toMatchObject({ category: "Change attempt", actionCode: "cr.refused.after-release", objectKey: "CIQ-2026-PkC8-C1-CRabc", caseItemId: "PkC8" });
  });

  it("before release the chosen values are kept", () => {
    const c4 = caseFixture({ _current_step: "Review – Safety" }, "PkC4");
    const x = cr({ Case_Code: "CIQ-2026-PkC4" });
    const input = { ...withCase(triageDefaults(x, c4), c4), contactVerified: "Yes", outcome: "Accepted", impacts: { REG: "Yes", SAF: "No", QM: "No", MIC: "No", SUS: "No" }, noticeTitle: "t", supplierOutcomeText: "s" };
    expect(buildTriagePatch(x, input, false).fields).toMatchObject({ CR_Outcome: "Accepted", Impact_REG: "Yes", Impact_SAF: "No" });
  });

  it("blocks when the case's release state is not readable, a field is missing, or the outcome is not offered", () => {
    const c4 = caseFixture({}, "PkC4");
    const input = { ...withCase(triageDefaults(cr(), c4), c4), contactVerified: "", outcome: "Accepted – scope extended", noticeTitle: "t", supplierOutcomeText: "s" };
    const ps = triageProblems(input, { released: false, caseReadable: false, flags: DEFAULT_FLAGS }).map((p) => p.field);
    expect(ps).toContain("Case_Item_Id");
    expect(ps).toContain("Contact_Verified");
    expect(ps).toContain("CR_Outcome");
    expect(ps).toContain("Impact_REG");
  });
});

describe("F1: a refused request impacts no department", () => {
  const c4 = caseFixture({ _current_step: "Review – Safety" }, "PkC4");
  const x = cr({ Case_Code: "CIQ-2026-PkC4" });
  const base = { ...withCase(triageDefaults(x, c4), c4), contactVerified: "Yes", noticeTitle: "t", supplierOutcomeText: "s" };
  it("'Refused – not valid' writes every Impact_* = No, whatever was picked before (applied after the input)", () => {
    const input = { ...base, outcome: "Refused – not valid", impacts: { REG: "Yes", SAF: "No", QM: "Yes", MIC: "No", SUS: "No" } };
    expect(buildTriagePatch(x, input, false).fields).toMatchObject({ CR_Outcome: "Refused – not valid", Impact_REG: "No", Impact_SAF: "No", Impact_QM: "No", Impact_MIC: "No", Impact_SUS: "No" });
  });
  it("triageProblems refuses a Yes impact with a refusal", () => {
    const input = { ...base, outcome: "Refused – not valid", impacts: { REG: "Yes", SAF: "No", QM: "No", MIC: "No", SUS: "No" } };
    const ps = triageProblems(input, { released: false, caseReadable: true, flags: DEFAULT_FLAGS });
    expect(ps.map((p) => p.message).join(" ")).toMatch(/impacts no department.*REG/);
    expect(triageProblems({ ...input, impacts: { REG: "No", SAF: "No", QM: "No", MIC: "No", SUS: "No" } }, { released: false, caseReadable: true, flags: DEFAULT_FLAGS })).toEqual([]);
  });
  it("'Refused – after final release' picked on a case that is NOT released is refused (no Change attempt can follow)", () => {
    const input = { ...base, outcome: REFUSED_AFTER_RELEASE, impacts: { REG: "No", SAF: "No", QM: "No", MIC: "No", SUS: "No" } };
    expect(triageProblems(input, { released: false, caseReadable: true, flags: DEFAULT_FLAGS }).map((p) => p.message).join(" ")).toMatch(/needs a released case/);
  });
  it("an accepted request keeps the picked impacts", () => {
    const input = { ...base, outcome: "Accepted", impacts: { REG: "Yes", SAF: "No", QM: "No", MIC: "No", SUS: "No" } };
    expect(buildTriagePatch(x, input, false).fields).toMatchObject({ Impact_REG: "Yes" });
  });
});

describe("case link (crBelongsTo)", () => {
  it("an untriaged CR (Case_Item_Id blank) links by Case_Code + Cycle_No; another cycle does not", () => {
    const c8 = caseFixture({}, "PkC8");
    const c8b = caseFixture({ Cycle_No: 2 }, "PkC8b");
    expect(caseOfCr(cr(), [c8b, c8])?._id).toBe("PkC8");
    expect(caseOfCr(cr({ Cycle_No: 3 }), [c8b, c8])).toBeNull();
    expect(caseOfCr(cr({ Case_Item_Id: "PkC8b" }), [c8, c8b])?._id).toBe("PkC8b");
  });
  it("impact chips list the departments with Impact Yes and their assessment state", () => {
    expect(impactChips(cr({ Impact_REG: "Yes", REG_Assessment: "Resolved", Impact_SAF: "Yes", Impact_QM: "No" }))).toEqual([
      { dept: "REG", assessed: true, assessment: "Resolved" },
      { dept: "SAF", assessed: false, assessment: "" },
    ]);
  });
});

describe("manual CR (Y6 fallback)", () => {
  it("requires Case_Code, Change_Kind and Change_Reason; never sets the portal fields", () => {
    const c = caseFixture({}, "PkC4");
    expect(manualCrProblems(emptyManualCr(null)).map((p) => p.field)).toEqual(["Case_Code", "Cycle_No", "Change_Kind", "Change_Reason"]);
    const i = { ...emptyManualCr(c), changeKind: "Answer change", changeReason: "Supplier phoned in a corrected CAS number", proposedValueJson: '{"cas":"84776-23-8"}' };
    expect(manualCrProblems(i)).toEqual([]);
    const d = buildManualCr(i, NOW, () => 0.5);
    expect(d).toMatchObject({ Case_Code: "CIQ-2026-PkC4", Cycle_No: 1, Supplier_Code: "SUP-NWB", Change_Kind: "Answer change" });
    expect(String(d.CR_Key)).toMatch(/^CIQ-2026-PkC4-C1-CR/);
    expect(d).not.toHaveProperty("Portal_CR_Item_Id");
    expect(d).not.toHaveProperty("Raised_By_Portal_User");
    expect(manualCrProblems({ ...i, proposedValueJson: "{not json" }).map((p) => p.field)).toEqual(["Proposed_Value_JSON"]);
  });
});
