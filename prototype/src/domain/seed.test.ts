import { describe, expect, it } from "vitest";
import { buildRichFixture } from "./richFixture";
import { checkInvariants } from "./invariants";
import { RELEASE_LOCKED_TEXT } from "./permissions";
import { buildSeed } from "./seed";
import { REQUIRED_CONFIG, completenessBlockers, reviewBlockers, rmmFlags, supplierTasks, unansweredConfig, waitingOn } from "./selectors";
import {
  completeReview,
  confirmCompleteness,
  createCase,
  extendScope,
  finalRelease,
  raiseOpenPoint,
  reopenReview,
  reviewResponse,
  saveConfig,
  setAnswer,
  supplierRespond,
} from "./actions";
import { deptWorkload, pipeline } from "./metrics";
import { REVIEW_TRACK_DEPTS } from "./catalog";
import type { AppState } from "./types";

const s = buildRichFixture();
/** A due date that is always in the future (the actions refuse past due dates; the tests run on the real clock). */
const SOON = new Date(Date.now() + 30 * 86_400_000).toISOString();
const byId = (id: string) => s.cases.find((c) => c.id === id)!;
const caseIn = (st: AppState, id: string) => st.cases.find((c) => c.id === id)!;
const app = (st: AppState, id: string, sec: string) => caseIn(st, id).scope.find((x) => x.sectionId === sec)?.applicability;
const track = (st: AppState, id: string, dept: string) => caseIn(st, id).reviews.find((r) => r.dept === dept);

describe("rich fixture", () => {
  it("builds 36 cases deterministically", () => {
    expect(s.cases).toHaveLength(36);
    expect(JSON.stringify(buildRichFixture().cases)).toBe(JSON.stringify(s.cases));
  });

  it("every case reaches the phase its spec intends", () => {
    const counts = s.cases.reduce<Record<string, number>>((m, c) => ({ ...m, [c.phase]: (m[c.phase] ?? 0) + 1 }), {});
    expect(counts).toEqual({ completed: 12, review: 10, "supplier-input": 11, "final-release": 2, cancelled: 1 });
  });

  it("no seeded case passes through a separate metadata step or a scope check, and every case follows the answers live", () => {
    const phases = s.cases.flatMap((c) => c.phaseHistory.map((p) => p.phase));
    expect(phases.filter((p) => p === "metadata" || p === "scope-check")).toEqual([]);
    expect(s.cases.every((c) => c.liveScope === true && c.phaseHistory[0].phase === "supplier-input")).toBe(true);
  });

  it("review-phase cases have tracks, an RMES record and no completeness blockers", () => {
    for (const c of s.cases.filter((x) => x.phase === "review")) {
      expect(c.reviews.length).toBeGreaterThan(0);
      expect(completenessBlockers(c)).toEqual([]);
    }
    expect(byId("CIQ-2026-0131").rmes?.criteria.length).toBeGreaterThan(5);
  });

  it("every case past the completeness confirmation has RMM's whole-CIQ review, assigned to the case owner", () => {
    for (const c of s.cases.filter((x) => x.reviewVersion > 0)) {
      expect(c.reviews[0]).toMatchObject({ dept: "RMM", assigneeId: c.ownerId });
      if (c.phase === "completed" || c.phase === "final-release") expect(c.reviews[0].status).toBe("completed");
    }
  });

  it("completed cases carry the three confirmation types (RMM's completion included) and the final document", () => {
    const c = byId("CIQ-2026-0101");
    const types = new Set(c.confirmations.map((x) => x.type));
    expect(types.has("completeness") && types.has("dept-completion") && types.has("final-release")).toBe(true);
    expect(c.confirmations.some((x) => x.type === "dept-completion" && x.dept === "RMM")).toBe(true);
    expect(c.audit.some((a) => a.action === "Generated final document")).toBe(true);
    expect(c.finalDocument?.caseId).toBe(c.id);
  });

  it("the supplier persona (Solvaro) has questionnaire and query tasks, and a fresh CIQ with no metadata answered", () => {
    const kinds = new Set(supplierTasks(s, "s1").map((t) => t.kind));
    expect(kinds.has("questionnaire") && kinds.has("query")).toBe(true);
    expect(kinds.has("metadata")).toBe(false);
    const fresh = byId("CIQ-2026-0154");
    expect(fresh.supplierId).toBe("s1");
    expect(fresh.phase).toBe("supplier-input");
    expect(unansweredConfig(fresh)).toEqual(REQUIRED_CONFIG);
  });

  it("the MOAH case is blocked by a blocking finding and open points", () => {
    expect(reviewBlockers(byId("CIQ-2026-0134"), "SAF").length).toBeGreaterThan(0);
  });

  it("an origin without rules gets the standard sections and is flagged in RMM's Part 2 review (CIQ-2026-0150)", () => {
    const c = byId("CIQ-2026-0150");
    expect(c.phase).toBe("review");
    expect(rmmFlags(c)).toHaveLength(1);
    expect(rmmFlags(c)[0]).toContain("Carbon capture (CCU)");
    expect(c.audit.some((a) => a.action === "Flagged for RMM")).toBe(true);
    for (const id of ["K1", "K2.1", "A10"]) expect(c.scope.find((x) => x.sectionId === id)?.applicability).toBe("mandatory");
    for (const id of ["A1", "A2", "A4", "A9"]) expect(c.scope.find((x) => x.sectionId === id)?.applicability).toBe("na");
    // The flag is informational: RMM is blocked only by its own open query to the supplier.
    expect(reviewBlockers(c, "RMM")).toHaveLength(1);
    expect(c.openPoints.find((p) => p.dept === "RMM")?.status).toBe("open");
    expect(waitingOn(c)).toBe("bdf");
  });

  it("CIQ-2026-0145 shows the gate: every department completed, only RMM pending, still in review", () => {
    const c = byId("CIQ-2026-0145");
    expect(c.phase).toBe("review");
    expect(c.reviews.filter((r) => r.status !== "completed").map((r) => r.dept)).toEqual(["RMM"]);
  });

  it("metrics: the pipeline has the three open phases and the workload lists RMM's track first", () => {
    expect(pipeline(s).map((p) => p.phase)).toEqual(["supplier-input", "review", "final-release"]);
    expect(deptWorkload(s).map((d) => d.dept)).toEqual(REVIEW_TRACK_DEPTS);
    expect(deptWorkload(s)[0].active).toBeGreaterThan(0);
  });
});

describe("D-1: the supplier fills in the CIQ in one step; the scope follows the metadata answers", () => {
  const fresh = () => {
    const r = createCase(buildSeed(), "u-rmm", { materialName: "TEST Oil", inci: "Test", materialNo: "RM-1", supplierId: "s1", contactIds: ["u-sup-1", "u-sup-2"], markets: ["EU"], dueDate: SOON, priority: "normal" });
    return { st: r.state, id: r.id };
  };

  it("a new case opens straight into the supplier's fill-in step with the scope of the target markets", () => {
    const { st, id } = fresh();
    const c = caseIn(st, id);
    expect(c.phase).toBe("supplier-input");
    expect(c.phaseHistory.map((p) => p.phase)).toEqual(["supplier-input"]);
    expect(c.liveScope).toBe(true);
    expect(app(st, id, "K1")).toBe("mandatory");
    expect(app(st, id, "K5.1")).toBe("mandatory"); // SF-12 not answered yet
    expect(app(st, id, "A4")).toBe("na");
    expect(supplierTasks(st, "s1").find((t) => t.caseId === id)?.title).toBe("Fill in the CIQ and confirm completeness");
  });

  it("before completeness, sections open and close freely; answers in a closed section are kept", () => {
    let { st, id } = fresh();
    const audits = () => caseIn(st, id).audit.filter((a) => a.action === "Scope follows answers").length;
    st = saveConfig(st, "u-sup-1", id, { SF07: true });
    expect(app(st, id, "A4")).toBe("mandatory");
    st = setAnswer(st, "u-sup-1", id, "FLD-A4-101", 0.4);
    st = saveConfig(st, "u-sup-1", id, { SF07: false });
    expect(app(st, id, "A4")).toBe("na");
    expect(caseIn(st, id).answers["FLD-A4-101"]).toBe(0.4);
    st = saveConfig(st, "u-sup-1", id, { SF07: true });
    expect(app(st, id, "A4")).toBe("mandatory");
    expect(caseIn(st, id).answers["FLD-A4-101"]).toBe(0.4);
    expect(audits()).toBe(3);
    // An answer that changes no section, or the same answer again, writes no audit entry.
    st = saveConfig(st, "u-sup-1", id, { SF12: true }); // K5.1 is already mandatory while SF-12 is unanswered
    st = saveConfig(st, "u-sup-1", id, { SF07: true });
    expect(audits()).toBe(3);
    expect(caseIn(st, id).config.SF12).toBe(true);
  });

  it("SF-11 stays with RMM", () => {
    let { st, id } = fresh();
    st = saveConfig(st, "u-sup-1", id, { SF11: ["EU", "CN"] });
    expect(caseIn(st, id).config.SF11).toEqual(["EU"]);
  });

  it("the completeness gate requires the metadata answers (liveScope cases only)", () => {
    const { st, id } = fresh();
    const c = caseIn(st, id);
    const blockers = completenessBlockers(c);
    expect(blockers.filter((b) => b.sectionId === "GEN" && b.fieldId?.startsWith("SF")).map((b) => b.fieldId)).toEqual(REQUIRED_CONFIG);
    expect(blockers[0].label).toBe("SF-01 · What is the origin of the components?");
    const after = confirmCompleteness(st, "u-sup-1", id);
    expect(caseIn(after, id).phase).toBe("supplier-input");
    expect(after.toasts.at(-1)?.tone).toBe("danger");
    // The live portal's old flow (no liveScope) asks them in its own step, so they never block completeness there.
    expect(completenessBlockers({ ...c, liveScope: undefined }).some((b) => b.fieldId?.startsWith("SF"))).toBe(false);
    const answered = saveConfig(st, "u-sup-1", id, { SF01: ["vegetable"], SF03: false, SF04: false, SF06: false, SF07: false, SF09: false, SF10: false, SF12: true });
    expect(completenessBlockers(caseIn(answered, id)).some((b) => b.fieldId?.startsWith("SF"))).toBe(false);
  });

  it("completeness cannot be confirmed with blockers", () => {
    const st = confirmCompleteness(buildRichFixture(), "u-sup-1", "CIQ-2026-0143");
    expect(st.cases.find((c) => c.id === "CIQ-2026-0143")!.phase).toBe("supplier-input");
    expect(st.toasts.at(-1)?.tone).toBe("danger");
  });

  it("after completeness a changed metadata answer only adds sections, reopens the lead's review and gives the supplier a task (REQ-CFG-008)", () => {
    const id = "CIQ-2026-0136"; // polymer, waiting for the final release, every track completed
    // locked while the release is requested (Thomas, 15 Oct): QM reopens first, which takes the case back to review
    const locked = saveConfig(buildRichFixture(), "u-s3a", id, { SF09: true });
    expect(caseIn(locked, id).phase).toBe("final-release");
    expect(locked.toasts.at(-1)?.text).toBe(RELEASE_LOCKED_TEXT);
    let st = reopenReview(buildRichFixture(), "u-qm", id, "QM", "The EUDR answer must be checked again");
    // (the reopen itself withdrew the release request and unlocked the questionnaire)
    const withdrawals = (x: AppState) => caseIn(x, id).audit.filter((a) => a.action === "Final-release request withdrawn").length;
    expect([caseIn(st, id).phase, withdrawals(st)]).toEqual(["review", 1]);
    st = saveConfig(st, "u-s3a", id, { SF09: true });
    const c = caseIn(st, id);
    expect(c.scope.find((x) => x.sectionId === "K6.17")).toMatchObject({ applicability: "mandatory", addedLater: true });
    expect(withdrawals(st)).toBe(1); // the metadata answer withdrew nothing more: the case was already back in review
    expect(track(st, id, "SUS")?.status).toBe("waiting-supplier");
    const op = c.openPoints.at(-1)!;
    expect(op).toMatchObject({ dept: "SUS", kind: "additional-part", createdBy: "system", status: "open", responsibleId: track(st, id, "SUS")!.assigneeId });
    expect(op.ref.sectionId).toBe("K6.17");
    expect(supplierTasks(st, "s3").some((t) => t.openPointId === op.id && t.title === "Complete an additional section")).toBe(true);
    // Sustainability cannot complete while the added section is open.
    expect(track(completeReview(st, "u-sus", id, "SUS"), id, "SUS")?.status).not.toBe("completed");
    // Changing the answer back, or waiving the micro test, never removes or lowers a section.
    st = saveConfig(st, "u-s3a", id, { SF09: false });
    expect(app(st, id, "K6.17")).toBe("mandatory");
    st = saveConfig(st, "u-s3a", id, { SF12: false });
    expect(app(st, id, "K5.1")).toBe("mandatory");
    // Once the supplier delivers and Sustainability accepts and completes, the single release request goes out again.
    st = supplierRespond(st, "u-s3a", id, op.id, { text: "EUDR section completed." });
    st = reviewResponse(st, "u-sus", id, op.id, "accept", "");
    st = completeReview(st, "u-sus", id, "SUS");
    st = completeReview(st, "u-qm", id, "QM");
    expect(caseIn(st, id).phase).toBe("final-release");
  });

  it("a late scope growth activates a missing track and creates the RMES record when Safety joins", () => {
    const id = "CIQ-2026-0136";
    // in review (in final-release the questionnaire is locked): QM reopens first, as Beiersdorf would
    const base = reopenReview(buildRichFixture(), "u-qm", id, "QM", "The CoA must be checked again");
    expect(caseIn(base, id).phase).toBe("review");
    const stripped: AppState = { ...base, cases: base.cases.map((c) => (c.id === id ? { ...c, rmes: undefined, reviews: c.reviews.filter((r) => r.dept !== "SAF" && r.dept !== "REG") } : c)) };
    expect(checkInvariants(stripped).filter((v) => v.includes(id) && /in review although/.test(v))).toEqual([]);
    const st = saveConfig(stripped, "u-s3a", id, { SF07: true });
    expect(app(st, id, "A4")).toBe("mandatory");
    expect(track(st, id, "SAF")?.status).toBe("waiting-supplier");
    expect(caseIn(st, id).rmes?.criteria.some((x) => x.id === "S-C2")).toBe(true);
    expect(caseIn(st, id).openPoints.filter((p) => p.kind === "additional-part").map((p) => p.ref.sectionId)).toEqual(["A4", "A9"]);
  });

  it("an origin without rules chosen after completeness flags the case for RMM", () => {
    const id = "CIQ-2026-0131";
    const st = saveConfig(buildRichFixture(), "u-sup-1", id, { SF01: ["vegetable", "waste"] });
    expect(rmmFlags(caseIn(st, id))).toHaveLength(1);
    expect(caseIn(st, id).audit.at(-1)?.action).toBe("Flagged for RMM");
    expect(caseIn(st, id).openPoints).toHaveLength(byId(id).openPoints.length); // no rule opens a section for waste
  });

  it("an origin without rules chosen after RMM completed reopens RMM's review, so the case cannot complete unseen", () => {
    const id = "CIQ-2026-0136"; // waiting for the final release, RMM completed
    expect(track(s, id, "RMM")?.status).toBe("completed");
    // QM reopens first (the questionnaire is locked while the release is requested, Thomas 15 Oct)
    let st = reopenReview(buildRichFixture(), "u-qm", id, "QM", "The CoA must be checked again");
    const auditBefore = caseIn(st, id).audit.length;
    st = saveConfig(st, "u-s3a", id, { SF01: ["polymer", "waste"] });
    const c = caseIn(st, id);
    expect(rmmFlags(c)).toHaveLength(1);
    expect(track(st, id, "RMM")?.status).toBe("reopened");
    expect(c.phase).toBe("review");
    // the metadata answer's own effects (the release request was already withdrawn by QM's reopen)
    expect(c.audit.slice(auditBefore).map((a) => a.action)).toEqual(expect.arrayContaining(["Flagged for RMM", "Reopened RMM review"]));
    expect(c.audit.slice(auditBefore).some((a) => a.action === "Final-release request withdrawn")).toBe(false);
    expect(finalRelease(st, "u-s3a", id).cases.find((x) => x.id === id)!.phase).toBe("review");
    // The flag is informational: RMM re-completes without answering it, and the release request goes out again.
    st = completeReview(st, "u-rmm", id, "RMM");
    st = completeReview(st, "u-qm", id, "QM");
    expect(caseIn(st, id).phase).toBe("final-release");
  });

  it("sections are added only by a reviewing department during the review (REQ-ADR-002)", () => {
    const part1 = extendScope(buildRichFixture(), "u-saf", "CIQ-2026-0143", "A4", "MOAH risk");
    expect(caseIn(part1, "CIQ-2026-0143").scope.find((x) => x.sectionId === "A4")?.applicability).toBe("na");
    expect(part1.toasts.at(-1)?.tone).toBe("danger");
    const byRmm = extendScope(buildRichFixture(), "u-rmm", "CIQ-2026-0131", "A4", "MOAH risk");
    expect(app(byRmm, "CIQ-2026-0131", "A4")).toBe("na");
    expect(byRmm.toasts.at(-1)?.tone).toBe("danger");
    const st = extendScope(buildRichFixture(), "u-saf", "CIQ-2026-0131", "A4", "MOAH risk from the feedstock");
    expect(caseIn(st, "CIQ-2026-0131").scope.find((x) => x.sectionId === "A4")).toMatchObject({ applicability: "mandatory", addedLater: true });
    expect(caseIn(st, "CIQ-2026-0131").openPoints.at(-1)).toMatchObject({ dept: "SAF", kind: "additional-part" });
    // In final-release every review has completed: like a query, adding a section needs the department to reopen first.
    const late = extendScope(buildRichFixture(), "u-qm", "CIQ-2026-0136", "A3", "Fermentation step found in the SDS");
    expect(caseIn(late, "CIQ-2026-0136").phase).toBe("final-release");
    expect(late.toasts.at(-1)?.text).toMatch(/Reopen your review to add a section/);
    const reopened = reopenReview(buildRichFixture(), "u-qm", "CIQ-2026-0136", "QM", "Fermentation step found in the SDS");
    const added = extendScope(reopened, "u-qm", "CIQ-2026-0136", "A3", "Fermentation step found in the SDS");
    expect(caseIn(added, "CIQ-2026-0136").phase).toBe("review");
    expect(track(added, "CIQ-2026-0136", "QM")?.status).toBe("waiting-supplier");
  });
});

describe("D-2: RMM reviews in parallel and completes like a department", () => {
  it("completeness activates only the relevant reviews and assigns the CIQ to RMM", () => {
    const c = byId("CIQ-2026-0150");
    expect(c.reviews.map((r) => r.dept)).toEqual(["RMM", "REG", "SAF", "QM", "MIC"]);
    expect(c.audit.find((a) => a.action === "Activated reviews")?.detail).toContain("CIQ assigned to RMM");
  });

  it("the single final-release request waits for RMM: completing RMM last releases CIQ-2026-0145", () => {
    const st = completeReview(buildRichFixture(), "u-rmm", "CIQ-2026-0145", "RMM");
    const c = caseIn(st, "CIQ-2026-0145");
    expect(c.phase).toBe("final-release");
    expect(c.confirmations.at(-1)).toMatchObject({ type: "dept-completion", dept: "RMM" });
    expect(c.audit.find((a) => a.action === "All reviews completed")?.detail).toContain("RMM and 4 department reviews completed"); // no Sustainability track without SF-09
  });

  it("...and waits for every department when RMM completes first", () => {
    const id = "CIQ-2026-0136";
    let st = reopenReview(buildRichFixture(), "u-qm", id, "QM", "CoA renewed");
    st = reopenReview(st, "u-rmm", id, "RMM", "Re-check");
    expect(caseIn(st, id).phase).toBe("review");
    st = completeReview(st, "u-rmm", id, "RMM");
    expect(caseIn(st, id).phase).toBe("review");
    st = completeReview(st, "u-qm", id, "QM");
    expect(caseIn(st, id).phase).toBe("final-release");
  });

  it("RMM can ask the supplier about any section and cannot complete while the query is open", () => {
    const id = "CIQ-2026-0131";
    let st = raiseOpenPoint(buildRichFixture(), "u-rmm", id, { dept: "RMM", kind: "query", ref: { sectionId: "K6.9", label: "K6.9 › Nanomaterials" }, question: "Please confirm the particle size.", justification: "Whole-CIQ review", dueDate: SOON });
    const op = caseIn(st, id).openPoints.at(-1)!;
    expect(track(st, id, "RMM")?.status).toBe("waiting-supplier");
    expect(reviewBlockers(caseIn(st, id), "RMM")).toHaveLength(1);
    expect(track(completeReview(st, "u-rmm", id, "RMM"), id, "RMM")?.status).not.toBe("completed");
    st = supplierRespond(st, "u-sup-1", id, op.id, { text: "D50 = 2.4 µm, not a nanomaterial." });
    st = reviewResponse(st, "u-rmm", id, op.id, "accept", "");
    st = completeReview(st, "u-rmm", id, "RMM");
    expect(track(st, id, "RMM")?.status).toBe("completed");
    expect(caseIn(st, id).phase).toBe("review"); // the departments are still reviewing
  });

  it("RMM's completion is not blocked by the undefined-origin flag", () => {
    const id = "CIQ-2026-0150";
    let st = buildRichFixture();
    const op = caseIn(st, id).openPoints.find((p) => p.dept === "RMM")!;
    st = supplierRespond(st, "u-s8a", id, op.id, { text: "CO₂ from a bioethanol plant, ISCC PLUS certificate attached." });
    st = reviewResponse(st, "u-rmm-2", id, op.id, "accept", "");
    st = completeReview(st, "u-rmm-2", id, "RMM");
    expect(track(st, id, "RMM")?.status).toBe("completed");
    expect(caseIn(st, id).confirmations.at(-1)?.note).toContain("Flag reviewed");
  });

  it("a department cannot complete with open points", () => {
    const st = completeReview(buildRichFixture(), "u-saf", "CIQ-2026-0134", "SAF");
    expect(st.cases.find((c) => c.id === "CIQ-2026-0134")!.reviews.find((r) => r.dept === "SAF")!.status).not.toBe("completed");
  });
});

describe("query loop end to end", () => {
  it("raise → answer → accept unblocks the department", () => {
    let st = buildRichFixture();
    const id = "CIQ-2026-0138"; // RMM, REG and QM done; SAF, MIC and SUS pending
    st = raiseOpenPoint(st, "u-mic", id, { dept: "MIC", kind: "query", ref: { sectionId: "K5.2", label: "K5.2" }, question: "Please provide the TAMC limit.", justification: "Needed", dueDate: SOON });
    const op = st.cases.find((c) => c.id === id)!.openPoints.at(-1)!;
    expect(reviewBlockers(st.cases.find((c) => c.id === id)!, "MIC")).toHaveLength(1);
    st = supplierRespond(st, "u-s6a", id, op.id, { text: "TAMC ≤ 100 cfu/g" });
    st = reviewResponse(st, "u-mic", id, op.id, "accept", "");
    expect(reviewBlockers(st.cases.find((c) => c.id === id)!, "MIC")).toEqual([]);
  });
});

describe("D-3: the case ends the requirements-matrix way", () => {
  it("final release freezes the CIQ, completes the case and files the final document for RMM", () => {
    const st = finalRelease(buildRichFixture(), "u-s3a", "CIQ-2026-0136");
    const c = caseIn(st, "CIQ-2026-0136");
    expect(c.phase).toBe("completed");
    expect(c.phaseHistory.at(-1)?.phase).toBe("completed");
    expect(c.confirmations.some((x) => x.type === "final-release")).toBe(true);
    expect(c.audit.map((a) => a.action)).toEqual(expect.arrayContaining(["Gave final release", "Case completed", "Generated final document"]));
  });

  it("the final release is refused before RMM and every department have completed", () => {
    const st = finalRelease(buildRichFixture(), "u-sup-1", "CIQ-2026-0131");
    expect(caseIn(st, "CIQ-2026-0131").phase).toBe("review");
    expect(st.toasts.at(-1)?.tone).toBe("danger");
  });
});
