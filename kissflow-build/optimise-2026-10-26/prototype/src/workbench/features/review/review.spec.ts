// T2 · reviewer queue and lane workspace (§8.7, §8.8): the queue groups (held tasks only, every held OPNT_S1), the
// lane blockers including the section-review blocker (WB-D5) and its "could not check" policy handling, the
// sign-off patch. Fixtures are fictional (@example.test).
import { describe, expect, it } from "vitest";
import { assertWritable, type Dept, type StepIr } from "../../schema";
import { toAuditVM, toCaseVM, toCrVM, toPointVM, toRmesVM, toSectionVM } from "../../data/map";
import { CLEAR } from "../../data/normalize";
import type { AuditVM, RawItem, TaskVM } from "../../data/viewModels";
import { heldTask } from "../../testkit/fakeClient";
import { blockerProblems, buildSignOffPatch, completeChecklist, decisionReasonProblem, groupReviewTasks, isNA, laneBlockers, laneReadiness, ledSections, sectionsForDept, signOffProblems, waitingOnSupplier, type LaneInput } from "./model";

const C4 = toCaseVM({ _id: "PkC4", Case_Code: "CIQ-2026-PkC4", Cycle_No: 1, Dept_SAF_Active: "Yes", Dept_QM_Active: "Yes", SAF_RMES_Decision: "Approved" } as RawItem, "full");
const pt = (id: string, o: Record<string, unknown>) => toPointVM({ _id: id, _status: "In progress", Case_Item_Id: "PkC4", OP_Key: `OP-${id}`, OP_Kind: "Query", Open_Num: 1, ...o } as RawItem, "full");
const sec = (id: string, o: Record<string, unknown>) => toSectionVM({ _id: id, Case_Item_Id: "PkC4", Section_Item_Key: `CIQ-2026-PkC4-C1-${id}`, Section_Key: id, Section_Code: id, Section_Title: `Section ${id}`, Applicability_Label: "Mandatory", ...o } as RawItem);
const mark = (key: string, o: Record<string, unknown> = {}): AuditVM => toAuditVM({ _id: `ev-${key}`, Event_Key: `EV-${key}`, Event_Category: "Section review", Action_Code: "section.reviewed", Object_Key: key, Case_Item_Id: "PkC4", Cycle_No: 1, Actor_Name: "Jo Weber", ...o } as RawItem);
const rmesRow = (o: Record<string, unknown> = {}) => toRmesVM({ _id: "F5a", _created_at: "2026-10-03T08:00:00Z", Case_Item_Id: "PkC4", RMES_Key: "CIQ-2026-PkC4-C1-RMES-SAF", Open_Criteria_Count: 0, Open_Blocking_Findings_Count: 0, ...o } as RawItem, "CIQ_RMES_Safety_A00");

const base = (o: Partial<LaneInput> = {}): LaneInput => ({
  c: C4,
  d: "SAF",
  points: [],
  crs: [],
  sections: [],
  events: [],
  eventsQuality: "form",
  rmes: { rows: [rmesRow()], quality: "form" },
  policy: "fail-closed",
  ...o,
});
const byKind = (bs: ReturnType<typeof laneBlockers>, k: string) => bs.find((b) => b.kind === k)!;

describe("review queue grouping (§8.7)", () => {
  const t = (step: StepIr, id: string, flow: TaskVM["flow"]) => heldTask(flow, id, `a-${id}`, step);
  const tasks: TaskVM[] = [
    t("CASE_B_SAF", "C4", "CIQ_Case_A00"),
    t("CASE_B_REG", "C4", "CIQ_Case_A00"),
    t("OPNT_R_SAF", "P3", "CIQ_Open_Point_A00"),
    t("OPNT_S1", "P1", "CIQ_Open_Point_A00"),
    t("CHRQ_B_SAF", "CR2", "CIQ_Change_Request_A00"),
    t("CASE_S2", "C2", "CIQ_Case_A00"),
    { ...t("OPNT_S1", "P9", "CIQ_Open_Point_A00"), step: null, stepName: null, evidence: null },
  ];
  it("a Safety reviewer: own lane, own R and CR steps; EVERY held OPNT_S1; unresolved apart; no RMM step", () => {
    const g = groupReviewTasks(tasks, ["SAF"]);
    expect(g.cases.map((x) => x.instanceId)).toEqual(["C4"]);
    expect(g.cases[0].step).toBe("CASE_B_SAF");
    expect(g.points.map((x) => x.instanceId)).toEqual(["P3"]);
    expect(g.supplier.map((x) => x.instanceId)).toEqual(["P1"]);
    expect(g.crs.map((x) => x.instanceId)).toEqual(["CR2"]);
    expect(g.unresolved.map((x) => x.instanceId)).toEqual(["P9"]);
  });
  it("the OPNT_S1 group does not depend on the departments (a user without reviewer roles still sees it)", () => {
    expect(groupReviewTasks(tasks, []).supplier.map((x) => x.instanceId)).toEqual(["P1"]);
    expect(groupReviewTasks(tasks, []).cases).toEqual([]);
  });
  it("waiting on supplier: my departments' points at OPNT_S1 that I don't hold", () => {
    const ps = [pt("P1", { Raised_By_Dept: "SAF", _current_step: "Waiting for supplier" }), pt("P5", { Raised_By_Dept: "SAF", _current_step: "Waiting for supplier" }), pt("P6", { Raised_By_Dept: "REG", _current_step: "Waiting for supplier" })];
    expect(waitingOnSupplier(ps, ["SAF"], tasks).map((p) => p._id)).toEqual(["P5"]);
  });
});

describe("lane blockers (§8.8)", () => {
  it("(1) open points of D: OP_Dept or Raised_By_Dept = D; Contact update, closed points and other departments excluded", () => {
    const points = [
      pt("P1", { OP_Dept: "SAF" }),
      pt("P2", { OP_Dept: "QM", Raised_By_Dept: "SAF" }),
      pt("P3", { OP_Dept: "SAF", OP_Kind: "Contact update" }),
      pt("P4", { OP_Dept: "SAF", OP_Outcome: "Accepted", Open_Num: 0 }),
      pt("P5", { OP_Dept: "REG" }),
      pt("P6", { OP_Dept: "SAF", _status: "Rejected" }),
      pt("P7", { OP_Dept: "SAF", Case_Item_Id: "OtherCase" }),
    ];
    const b = byKind(laneBlockers(base({ points })), "open-points");
    expect(b.blocking).toBe(true);
    expect(b.items.map((x) => x.id)).toEqual(["P1", "P2"]);
    expect(b.items[0].href).toBe("/points/P1");
  });
  it("(2) pending CR assessments for D; none for RMM (no RMM assessment exists)", () => {
    const crs = [toCrVM({ _id: "CR2", _status: "In progress", Case_Item_Id: "PkC4", CR_Key: "CR-2", Impact_SAF: "Yes", Impact_RMM: "Yes", CR_Outcome: "Accepted" } as RawItem), toCrVM({ _id: "CR3", _status: "In progress", Case_Item_Id: "PkC4", Impact_SAF: "Yes", SAF_Assessment: "Re-assessed" } as RawItem)];
    expect(byKind(laneBlockers(base({ crs })), "cr-assessments").items.map((x) => x.id)).toEqual(["CR2"]);
    expect(laneBlockers(base({ d: "RMM", crs, rmes: null })).some((b) => b.kind === "cr-assessments")).toBe(false);
  });
  it("(3) RMES: unread, missing, header not saved, open criteria, blocking findings, no decision, Rejected without reason", () => {
    const r = (o: Partial<LaneInput>) => byKind(laneBlockers(base(o)), "rmes").items.map((x) => x.id);
    expect(r({ rmes: { rows: [], quality: "failed" } })).toContain("rmes-unread");
    expect(r({ rmes: { rows: [], quality: "form" } })).toContain("rmes-missing");
    expect(r({ rmes: { rows: [rmesRow({ Open_Criteria_Count: null })], quality: "form" } })).toContain("rmes-header");
    expect(r({ rmes: { rows: [rmesRow({ Open_Criteria_Count: 2, Open_Blocking_Findings_Count: 1 })], quality: "form" } })).toEqual(["rmes-criteria", "rmes-findings"]);
    expect(r({ decision: { decision: "", reason: "" } })).toEqual(["rmes-decision"]);
    expect(r({ decision: { decision: "Rejected", reason: " " } })).toEqual(["rmes-reason"]);
    expect(byKind(laneBlockers(base()), "rmes").blocking).toBe(false);
    expect(laneBlockers(base({ d: "QM", rmes: null })).some((b) => b.kind === "rmes")).toBe(false);
  });
  it("(3) a voided duplicate is ignored; the oldest live row decides", () => {
    const rows = [rmesRow({ _id: "F5new", _created_at: "2026-10-04T08:00:00Z", Open_Criteria_Count: 0 }), rmesRow({ _id: "F5old", Open_Criteria_Count: 3 }), rmesRow({ _id: "F5void", _created_at: "2026-10-01T00:00:00Z", RMES_Voided: "Yes", Open_Criteria_Count: 0 })];
    expect(byKind(laneBlockers(base({ rmes: { rows, quality: "form" } })), "rmes").items.map((x) => x.text)).toEqual(["3 open criteria"]);
  });
});

describe("(4) section-review marks (WB-D5)", () => {
  const sections = [sec("SAF-A", { Lead_Dept: "SAF" }), sec("GEN", { Lead_Dept: "RMM", Co_Review_Depts: "SAF,QM" }), sec("SAF-X", { Lead_Dept: "SAF", Applicability_Label: "N.A." }), sec("REG-B", { Lead_Dept: "REG" })];
  it("only sections D LEADS and that are not N.A. need a mark; the left column also shows co-review and query-owner sections", () => {
    expect(ledSections(sections, "SAF").map((s) => s.sectionKey)).toEqual(["SAF-A"]);
    expect(sectionsForDept(sections, "SAF").map((s) => s.sectionKey)).toEqual(["SAF-A", "GEN", "SAF-X"]);
    expect([isNA("N.A."), isNA("n/a"), isNA("NA"), isNA("Mandatory")]).toEqual([true, true, true, false]);
  });
  it("a led section without an F8 section.reviewed row blocks; a mark for this case and cycle clears it", () => {
    const open = byKind(laneBlockers(base({ sections })), "section-marks");
    expect(open.blocking).toBe(true);
    expect(open.items.map((x) => x.id)).toEqual(["SAF-A"]);
    const cleared = byKind(laneBlockers(base({ sections, events: [mark("CIQ-2026-PkC4-C1-SAF-A")] })), "section-marks");
    expect(cleared).toMatchObject({ blocking: false, items: [] });
  });
  it("a mark of another case or another cycle, or another action code, does not count", () => {
    const evs = [mark("CIQ-2026-PkC4-C1-SAF-A", { Case_Item_Id: "PkOther" }), mark("CIQ-2026-PkC4-C1-SAF-A", { Cycle_No: 2 }), mark("CIQ-2026-PkC4-C1-SAF-A", { Action_Code: "lane.completed" })];
    expect(byKind(laneBlockers(base({ sections, events: evs })), "section-marks").blocking).toBe(true);
  });
  it("F8 not completely readable: 'could not check' blocks under fail-closed; under attest it passes only after the attestation", () => {
    const fc = byKind(laneBlockers(base({ sections, eventsQuality: "failed" })), "section-marks");
    expect(fc.blocking).toBe(true);
    expect(fc.items[0].text).toMatch(/Could not check/);
    expect(byKind(laneBlockers(base({ sections, eventsQuality: "failed", policy: "attest" })), "section-marks").blocking).toBe(true);
    expect(byKind(laneBlockers(base({ sections, eventsQuality: "failed", policy: "attest", attested: true })), "section-marks").blocking).toBe(false);
  });
  it("switched to informational (the WB-D5 one-line flag): listed, never blocking", () => {
    const b = byKind(laneBlockers(base({ sections, marksBlock: false })), "section-marks");
    expect(b.items).toHaveLength(1);
    expect(b.blocking).toBe(false);
  });
  it("blockers become submit problems (extraChecks); non-blocking groups do not", () => {
    const probs = blockerProblems(laneBlockers(base({ sections, points: [pt("P1", { OP_Dept: "SAF" })] })));
    expect(probs.map((p) => p.label)).toEqual(["Open points", "Section review marks"]);
    expect(blockerProblems(laneBlockers(base({ sections, events: [mark("CIQ-2026-PkC4-C1-SAF-A")] })))).toEqual([]);
  });
});

describe("sign-off (§8.8 right column)", () => {
  const me = { _id: "UsJo", Email: "jo@example.test" };
  const blank = { confirm: "", onBehalfOf: "", reason: "" };
  it.each(["REG", "SAF", "QM", "MIC", "SUS", "RMM"] as Dept[])("%s: every key is writable at CASE_B_%s; Completed_By/_Email/_At = me, now", (d) => {
    const p = buildSignOffPatch(d, { confirmed: true, onBehalfOf: "Lee Park", decision: "Approved", reason: "" }, me, "2026-10-08T10:00:00Z", blank);
    expect(() => assertWritable(`CASE_B_${d}` as StepIr, Object.keys(p.fields))).not.toThrow();
    expect(p.fields).toMatchObject({ [`${d}_Review_Confirm`]: "Confirmed", [`${d}_Completed_By`]: { _id: "UsJo" }, [`${d}_Completed_By_Email`]: "jo@example.test", [`${d}_Completed_At`]: "2026-10-08T10:00:00Z", [`${d}_On_Behalf_Of`]: "Lee Park" });
    expect(`${d}_RMES_Decision` in p.fields).toBe(d === "SAF" || d === "REG");
    expect(`${d}_Open_Count` in p.fields).toBe(false);
  });
  it("a save on a fresh lane still writes the sign-off stamp (so a refused write shows the K-WB fallback); blanks are not sent", () => {
    const p = buildSignOffPatch("REG", { confirmed: false, onBehalfOf: "", decision: "", reason: "" }, me, "2026-10-08T10:00:00Z", blank);
    expect(Object.keys(p.fields)).toEqual(["REG_Completed_By", "REG_Completed_By_Email", "REG_Completed_At"]);
  });
  it("clears explicitly what the user emptied (confirm, On_Behalf_Of, reason)", () => {
    const p = buildSignOffPatch("SAF", { confirmed: false, onBehalfOf: "", decision: "Approved", reason: "" }, me, "2026-10-08T10:00:00Z", { confirm: "Confirmed", onBehalfOf: "Lee Park", reason: "old" });
    expect(p.fields).toMatchObject({ SAF_Review_Confirm: CLEAR, SAF_On_Behalf_Of: CLEAR, SAF_RMES_Decision_Reason: CLEAR, SAF_RMES_Decision: "Approved" });
  });
  it("client rule: a Rejected decision needs a reason; the rest is checked on the server at Complete review", () => {
    expect(signOffProblems("REG", { confirmed: true, onBehalfOf: "", decision: "Rejected", reason: "" }).map((p) => p.field)).toEqual(["REG_RMES_Decision_Reason"]);
    expect(signOffProblems("SAF", { confirmed: false, onBehalfOf: "", decision: "", reason: "" })).toEqual([]);
    expect(signOffProblems("QM", { confirmed: true, onBehalfOf: "", decision: "", reason: "" })).toEqual([]);
    expect(decisionReasonProblem("SAF", { SAF_RMES_Decision: "Rejected", SAF_RMES_Decision_Reason: "" })).toHaveLength(1);
    expect(decisionReasonProblem("SAF", { SAF_RMES_Decision: "Approved" })).toEqual([]);
  });
});

describe("UX-05: 'Complete review' says what to do next, in plain words", () => {
  const lane = (o: Record<string, unknown> = {}) => ({ dept: "SAF" as Dept, gate: "", openCount: null, rmesGaps: null, complete: false, ...o });
  const noIds = /_|SAF_|Gate\b|blank|rung|mine\+tasks|blocker group/;
  it("an ordered checklist: mark sections (left), RMES, decision (right), Refresh counts (middle)", () => {
    const bs = laneBlockers(base({ sections: [sec("SAF-A", { Lead_Dept: "SAF" })], rmes: { rows: [rmesRow({ Open_Criteria_Count: 3 })], quality: "form" }, decision: { decision: "", reason: "" } }));
    const list = completeChecklist({ d: "SAF", blockers: bs, lane: lane(), countsBlocked: false, held: true });
    expect(list).toEqual(["Mark reviewed (left): SAF-A · Section SAF-A", "Complete the RMES sheet: 3 open criteria", "Choose the RMES decision (right) and save the sign-off", "Press Refresh counts (middle)"]);
    for (const l of list) expect(l).not.toMatch(noIds);
  });
  it("after a refused refresh (fail-closed) it names the access limit instead of 'Refresh counts'", () => {
    const list = completeChecklist({ d: "QM", blockers: [], lane: { ...lane({ dept: "QM", complete: true }) }, countsBlocked: true, held: true });
    expect(list).toEqual(["Not every open point and change request of this case can be checked with your access"]);
  });
  it("nothing left → empty; a saved sign-off with counts written and OK → empty", () => {
    expect(completeChecklist({ d: "QM", blockers: [], lane: lane({ dept: "QM", gate: "OK", openCount: 0, complete: true }), countsBlocked: false, held: true })).toEqual([]);
  });
  it("the readiness reads in words, never 'blank'", () => {
    expect(laneReadiness({ dept: "SAF", gate: "", openCount: null, rmesGaps: null })).toEqual({ ready: false, lines: ["Safety open items: not counted yet", "RMES gaps: not counted yet"] });
    expect(laneReadiness({ dept: "QM", gate: "OK", openCount: 0, rmesGaps: undefined })).toEqual({ ready: true, lines: ["QM open items: 0"] });
  });
});
