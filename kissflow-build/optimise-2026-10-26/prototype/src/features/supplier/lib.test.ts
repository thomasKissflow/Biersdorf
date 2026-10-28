import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { saveConfig } from "@/domain/actions";
import { buildRichFixture as buildSeed } from "@/domain/richFixture";
import { completenessBlockers } from "@/domain/selectors";
import { Scenario } from "@/domain/testkit";
import type { AppState, CiqCase, OpenPoint } from "@/domain/types";
import {
  METADATA_SECTION,
  changedAt,
  documentsAt,
  editsOf,
  firstOpenEntry,
  isWithdrawn,
  navEntries,
  overallProgress,
  ownConfirmations,
  sectionDelta,
  sectionMeta,
  stepKey,
  supplierBlockers,
  supplierReleaseBlockers,
  supplierSections,
  supplierStatus,
  supplierSteps,
  visibleThread,
  visibleToContact,
  type SupplierSection,
} from "./lib";

const s = buildSeed();
const byId = (st: AppState, id: string) => st.cases.find((c) => c.id === id)!;
/** The same case as the live portal maps it: no liveScope, so the old flow. */
const portal = (c: CiqCase): CiqCase => ({ ...c, liveScope: undefined });
const fresh = byId(s, "CIQ-2026-0154"); // RICEWAX, primary supplier, nothing answered
const supplierOf = (c: CiqCase) => c.supplierContactIds[0];

describe("live-scope questionnaire (D-1)", () => {
  it("puts the metadata questions right after GEN, only on live-scope cases", () => {
    expect(fresh.liveScope).toBe(true);
    const ids = navEntries(fresh).map((e) => e.sectionId);
    expect(ids[0]).toBe("GEN");
    expect(ids[1]).toBe(METADATA_SECTION);
    expect(navEntries(portal(fresh)).map((e) => e.sectionId)).not.toContain(METADATA_SECTION);
    expect(supplierSections(fresh).map((e) => e.sectionId)).not.toContain(METADATA_SECTION);
    expect(sectionMeta(METADATA_SECTION).title).toBe("Metadata questions");
    expect(sectionMeta("NOPE").code).toBe("NOPE"); // never throws on an unknown id
  });

  it("points unanswered metadata blockers at the metadata entry; the portal sees the domain list unchanged", () => {
    const b = supplierBlockers(fresh);
    expect(b.find((x) => x.sectionId !== "GEN")).toMatchObject({ sectionId: METADATA_SECTION, fieldId: "SF01" }); // navigator order: GEN, then the metadata questions
    expect(b.filter((x) => x.sectionId === METADATA_SECTION)).toHaveLength(9);
    expect(b).toHaveLength(completenessBlockers(fresh).length);
    const p = portal(fresh);
    expect(supplierBlockers(p)).toEqual(completenessBlockers(p));
  });

  it("counts the metadata questions in the progress and starts there once the basic data is in", () => {
    const withMeta = overallProgress(fresh);
    const without = overallProgress(portal(fresh));
    // the 9 required metadata questions, plus the K1 statements slot the app asks for on every case (rule R-00)
    expect(withMeta.total - without.total).toBe(10);
    const genDone = { ...fresh, answers: { ...fresh.answers, "FLD-GEN-001": "x", "FLD-GEN-002": "x", "FLD-GEN-008": "a@b.co" } };
    const first = firstOpenEntry(genDone)?.sectionId;
    expect(first === "GEN" || first === METADATA_SECTION).toBe(true);
  });
});

describe("supplier status and stepper", () => {
  it("live-scope cases have 3 steps; the live portal keeps its 4", () => {
    expect(supplierSteps(fresh).map((x) => x.label)).toEqual(["Questionnaire", "Beiersdorf review", "Final release"]);
    expect(supplierSteps(portal(fresh)).map((x) => x.label)).toEqual(["Basic questions", "Questionnaire", "Beiersdorf review", "Final release"]);
  });

  it("words a fresh live-scope request as the start of the questionnaire", () => {
    const st = supplierStatus(fresh);
    expect(st.label.startsWith("Fill in the questionnaire — ")).toBe(true);
    expect(st.cta).toBe("Start the questionnaire");
    expect(st.progressLabel).toBe("Step 1 of 3 · metadata questions: 0 of 9 answered");
    expect(supplierStatus(portal(fresh)).progressLabel.startsWith("Step 2 of 4 · ")).toBe(true);
  });

  it("keeps the live portal's old-flow wording", () => {
    const meta = supplierStatus({ ...portal(fresh), phase: "metadata" });
    expect(meta.label).toBe("Answer the basic questions");
    expect(meta.progressLabel).toBe("Step 1 of 4 · 0 of 9 questions answered");
    expect(supplierStatus({ ...portal(fresh), phase: "scope-check" }).label).toBe("Beiersdorf is preparing your questionnaire");
  });

  it("counts review and final release on the case's own stepper", () => {
    const review = s.cases.find((c) => c.phase === "review")!;
    const release = s.cases.find((c) => c.phase === "final-release")!;
    expect(supplierStatus(review).progressLabel.startsWith("Step 2 of 3 · ")).toBe(true);
    expect(supplierStatus(portal(review)).progressLabel.startsWith("Step 3 of 4 · ")).toBe(true);
    expect(supplierStatus(release).progressLabel).toBe("Step 3 of 3 · all Beiersdorf reviews complete · questionnaire locked");
    expect(supplierStatus(portal(release)).progressLabel).toBe("Step 4 of 4 · all Beiersdorf reviews complete · questionnaire locked");
  });

  it("shows a cancelled live-scope request on the questionnaire step", () => {
    const cancelled = s.cases.find((c) => c.phase === "cancelled")!;
    expect(stepKey(cancelled)).not.toBe("basic");
  });
});

describe("sectionDelta: what an answer did to the sections", () => {
  const sec = (sectionId: string, applicability: SupplierSection["applicability"] = "mandatory", waived?: boolean): SupplierSection => ({ sectionId, applicability, waived });

  it("names opened, closed, waived and kept sections", () => {
    const before = [sec("GEN"), sec("K5.1"), sec("A4")];
    expect(sectionDelta(before, [sec("GEN"), sec("K5.1"), sec("A1")])).toMatchObject({ opened: ["A1"], closed: ["A4"] });
    expect(sectionDelta(before, [sec("GEN"), sec("K5.1", "na", true), sec("A4")]).waived).toEqual(["K5.1"]);
    // after completeness: the rules would waive K5.1, the store keeps it mandatory (scope only grows)
    expect(sectionDelta(before, before, [sec("GEN"), sec("K5.1", "na", true)]).kept).toEqual(["K5.1", "A4"]);
  });

  it("reads the store's result: sections open and close live, and only grow after completeness", () => {
    const by = supplierOf(fresh);
    const s1 = saveConfig(s, by, fresh.id, { SF01: ["vegetable"] });
    const opened = sectionDelta(supplierSections(fresh), supplierSections(byId(s1, fresh.id))).opened;
    expect(opened.length).toBeGreaterThan(0);
    const s2 = saveConfig(s1, by, fresh.id, { SF01: ["mineral"] });
    const closed = sectionDelta(supplierSections(byId(s1, fresh.id)), supplierSections(byId(s2, fresh.id))).closed;
    expect(closed.length).toBeGreaterThan(0);
    expect(opened).toEqual(expect.arrayContaining(closed));

    const review = s.cases.find((c) => c.phase === "review" && c.config.SF12 === true)!;
    const s3 = saveConfig(s, supplierOf(review), review.id, { SF12: false });
    const after = byId(s3, review.id);
    const predicted = supplierSections({ ...after, scope: after.scope.map((x) => (x.sectionId === "K5.1" ? { ...x, applicability: "na" } : x)) });
    const d = sectionDelta(supplierSections(review), supplierSections(after), predicted);
    expect(d.kept).toContain("K5.1");
    expect(d.closed).toEqual([]);
  });
});

describe("final app: what one contact sees and may do (spec §4)", () => {
  // the empty start, driven through the domain with an explicit clock (every step is checked against the invariants)
  const inReview = () => new Scenario().toReview();

  it("shows a contact only the requests it is named on; old-flow cases stay visible to the whole company", () => {
    const sc = new Scenario().create({ contactIds: ["u-sup-1"] });
    const elena = sc.s.users.find((u) => u.id === "u-sup-1")!;
    const ravi = sc.s.users.find((u) => u.id === "u-sup-2")!;
    expect(visibleToContact(sc.s.cases, elena).map((c) => c.id)).toEqual([sc.id]);
    expect(visibleToContact(sc.s.cases, ravi)).toEqual([]);
    expect(visibleToContact(sc.s.cases.map(portal), ravi).map((c) => c.id)).toEqual([sc.id]);
    expect(visibleToContact(sc.s.cases, { ...elena, active: false })).toEqual([]);
    expect(visibleToContact(sc.s.cases, { id: "u-x", supplierId: "s9" })).toEqual([]);
  });

  it("lists why the final release is blocked, worded for the supplier and with jump targets", () => {
    const sc = new Scenario().toReview();
    sc.completeAll();
    expect(sc.c.phase).toBe("final-release");
    expect(supplierReleaseBlockers(sc.c)).toEqual([]);
    // a question still open, or answered but not yet decided, blocks the release
    const q: OpenPoint = { id: "OP-X", caseId: sc.id, dept: "REG", kind: "query", ref: { sectionId: "K1", label: "K1 › specification" }, question: "?", justification: "", responsibleId: "u-reg", dueDate: sc.c.dueDate, status: "open", createdAt: sc.c.createdAt, createdBy: "u-reg", rounds: 1, thread: [] };
    const blocked: CiqCase = { ...sc.c, openPoints: [q] };
    const b = supplierReleaseBlockers(blocked);
    expect(b).toEqual([{ opId: "OP-X", label: "Answer Beiersdorf's question on K1 › specification" }]);
    const answered: CiqCase = { ...blocked, openPoints: [{ ...q, status: "in-progress" }] };
    expect(supplierReleaseBlockers(answered)[0].label).toBe("Beiersdorf is still checking your answer on K1 › specification");
    // a mandatory answer cleared after completeness: named, with the place to fix it; metadata points at the SF entry
    const cleared = { ...sc.c, config: { ...sc.c.config, SF03: undefined } };
    const missing = supplierReleaseBlockers(cleared);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ sectionId: METADATA_SECTION, fieldId: "SF03" });
    expect(missing[0].label.startsWith("Missing: ")).toBe(true);
  });

  it("marks questions the raiser changed or closed (AS-08) and keeps the edits per thread entry", () => {
    const sc = inReview().raise("REG", "u-reg");
    const op = sc.op();
    expect(changedAt(op)).toBeUndefined();
    sc.step("edit", (s, at) => A.editOpenPoint(s, "u-reg", sc.id, op.id, { question: "Please confirm the peroxide limit.", dueDate: "2026-11-30T00:00:00.000Z" }, at));
    const edited = sc.op(op.id);
    const entry = edited.thread.at(-1)!;
    expect(entry.action).toBe("edited");
    expect(changedAt(edited)).toBe(entry.at);
    expect(editsOf(edited, entry).map((e) => e.field)).toEqual(["question", "dueDate"]);
    expect(isWithdrawn(edited)).toBe(false);
    sc.step("withdraw", (s, at) => A.closeOpenPoint(s, "u-reg", sc.id, op.id, "Found it in the SDS.", at));
    const closed = sc.op(op.id);
    expect(isWithdrawn(closed)).toBe(true);
    expect(visibleThread(closed).map((m) => m.action)).toEqual(["raised", "edited", "withdrawn"]);
    expect(JSON.stringify(visibleThread(closed))).not.toContain("Found it in the SDS.");
  });

  it("keeps every document at a question, newest first, and only the supplier's own confirmations", () => {
    const sc = inReview();
    const f = "FLD-K1-001";
    sc.step("upload 1", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "sds-2025.pdf", kind: "SDS", sectionId: "K1", fieldId: f }, at).state);
    sc.step("upload 2", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "sds-2026.pdf", kind: "SDS", sectionId: "K1", fieldId: f }, at).state);
    expect(documentsAt(sc.c, "K1", f).map((d) => d.name).slice(0, 2)).toEqual(["sds-2026.pdf", "sds-2025.pdf"]);
    sc.completeAll().release();
    expect(sc.c.phase).toBe("completed");
    expect(ownConfirmations(sc.c).map((x) => x.type)).toEqual(["completeness", "final-release"]);
    expect(sc.c.confirmations.some((x) => x.type === "dept-completion")).toBe(true);
  });

  it("keeps one progress value per step, with or without questions", () => {
    const sc = inReview();
    expect(supplierStatus(sc.c).progress).toBe(75);
    sc.raise("QM", Scenario.REVIEWER.QM);
    expect(supplierStatus(sc.c).progress).toBe(75);
  });
});
