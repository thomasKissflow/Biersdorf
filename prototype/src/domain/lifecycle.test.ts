import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { checkInvariants } from "./invariants";
import { mailsFor } from "./mail";
import { runReminders } from "./reminders";
import { RELEASE_LOCKED_TEXT } from "./permissions";
import { makeUser } from "./seed";
import { DAY, canReactivate, rejectionNeedsRmmChoice, releaseBlockers, reviewQueue, sectionsChangedSince, supplierTasks, changedSectionsFor, waitingOn } from "./selectors";
import { updateContact } from "./suppliers";
import { Scenario } from "./testkit";
import type { Phase } from "./types";

describe("cancel and reactivate (spec §1.11)", () => {
  const build = (p: "supplier-input" | "review" | "final-release") => {
    const sc = new Scenario().create().metadata();
    if (p === "supplier-input") return sc;
    sc.fillMandatory().confirm();
    sc.raise("QM", "u-qm");
    if (p === "review") return sc;
    sc.answer(sc.op().id).decide(sc.op().id, "u-qm", "accept").completeAll();
    return sc;
  };

  for (const p of ["supplier-input", "review", "final-release"] as const)
    it(`in ${p}: ends every task, withdraws the points, and comes back to ${p}`, () => {
      const sc = build(p);
      expect(sc.refused("no reason", (s, at) => A.cancelCase(s, "u-rmm", sc.id, " ", at))).toMatch(/justification/);
      sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Brand project stopped", at));
      expect(sc.c.phase).toBe("cancelled");
      expect(sc.c.cancelled).toMatchObject({ by: "u-rmm", reason: "Brand project stopped", fromPhase: p });
      expect(sc.c.openPoints.every((x) => x.status === "closed" && (x.outcome === "withdrawn" || x.outcome === "accepted"))).toBe(true);
      expect(sc.c.reviews.some((r) => r.status === "waiting-supplier")).toBe(false);
      expect(supplierTasks(sc.s, "s1")).toEqual([]);
      expect(reviewQueue(sc.s, "QM")).toEqual([]);
      expect(waitingOn(sc.c)).toBe("none");
      expect(sc.c.confirmations.at(-1)).toMatchObject({ type: "cancellation", note: "Brand project stopped" });
      expect(sc.mails("cancelled")[0].body).not.toMatch(/Brand project/);
      expect(sc.refused("twice", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Again", at))).toMatch(/already cancelled/);
      sc.step("reactivate", (s, at) => A.reactivateCase(s, "u-rmm", sc.id, "The project restarts.", at));
      expect(sc.c.phase).toBe(p as Phase);
      expect(sc.c.cancelled).toBeUndefined();
      expect(sc.c.openPoints.filter((x) => x.outcome === "withdrawn").every((x) => x.status === "closed")).toBe(true); // withdrawn points stay closed
      expect(supplierTasks(sc.s, "s1").length).toBe(p === "review" ? 0 : 1);
      expect(sc.mails("reactivated").length).toBeGreaterThan(0);
      expect(sc.c.audit.at(-1)?.action).toBe("Reactivated case");
    });

  it("is refused for a completed case, outside the 12-month window, for a case never cancelled, and for non-RMM", () => {
    const done = new Scenario().toReview().completeAll().release();
    expect(done.refused("cancel completed", (s, at) => A.cancelCase(s, "u-rmm", done.id, "Too late", at))).toMatch(/completed case cannot be cancelled/);
    expect(done.refused("reactivate completed", (s, at) => A.reactivateCase(s, "u-rmm", done.id, "The project restarts.", at))).toMatch(/Only a cancelled case/);
    const sc = new Scenario().create();
    expect(sc.refused("by Regulatory", (s, at) => A.cancelCase(s, "u-reg", sc.id, "Stop", at))).toMatch(/Only RMM/);
    sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Stop", at));
    expect(canReactivate(sc.c, new Date(sc.t + 365 * DAY).toISOString())).toBe(true);
    sc.later(366);
    expect(sc.refused("after the window", (s, at) => A.reactivateCase(s, "u-rmm", sc.id, "The project restarts.", at))).toMatch(/12-month window/);
  });

  it("reactivation can set a new due date", () => {
    const sc = new Scenario().create();
    sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "On hold", at));
    expect(sc.refused("past due date", (s, at) => A.reactivateCase(s, "u-rmm", sc.id, "The project restarts.", at, "2026-01-01T00:00:00.000Z"))).toMatch(/today or later/);
    sc.step("reactivate", (s, at) => A.reactivateCase(s, "u-rmm", sc.id, "The project restarts.", at, "2027-02-28T00:00:00.000Z"));
    expect(sc.c.dueDate).toBe("2027-02-28T00:00:00.000Z");
  });
});

describe("RMES Rejected (AS-02): flagged for RMM, who continues with a note or cancels", () => {
  it("before RMM completes: RMM's completion needs the explicit continue choice", () => {
    const sc = new Scenario().toReview();
    sc.rmes("SAF", "u-saf");
    expect(sc.refused("reject without reason", (s, at) => A.rmesDecision(s, "u-saf", sc.id, "SAF", "rejected", "", at))).toMatch(/reason is mandatory/);
    expect(sc.refused("REG decides for SAF", (s, at) => A.rmesDecision(s, "u-reg", sc.id, "SAF", "rejected", "x", at))).toMatch(/Only Safety/);
    sc.decision("SAF", "u-saf", "rejected", "Endocrine data missing");
    expect(rejectionNeedsRmmChoice(sc.c)).toEqual(["SAF"]);
    expect(sc.c.audit.at(-1)?.action).toBe("Flagged for RMM");
    // a vegetable case without SF-09: Sustainability has no track (Annex 1 is Regulatory's since 28 Oct)
    for (const d of ["REG", "SAF", "QM", "MIC"] as const) {
      if (d === "REG") sc.rmes("REG", "u-reg").decision("REG", "u-reg", "approved");
      sc.complete(d, Scenario.REVIEWER[d]);
    }
    expect(sc.refused("RMM without choice", (s, at) => A.completeReview(s, "u-rmm", sc.id, "RMM", at))).toMatch(/Safety recorded Rejected\. Choose: continue to the final release with a note, or cancel the case/);
    sc.complete("RMM", "u-rmm", { continueNote: "Agreed with Safety: the brand accepts the restriction." });
    expect(sc.track("RMM")?.continueAfterRejection).toMatchObject({ note: "Agreed with Safety: the brand accepts the restriction.", by: "u-rmm", depts: ["SAF"] });
    expect(sc.c.audit.map((a) => a.action)).toContain("Continue after rejection");
    expect(sc.c.phase).toBe("final-release");
    expect(rejectionNeedsRmmChoice(sc.c)).toEqual([]);
    sc.release();
    expect(sc.c.phase).toBe("completed");
  });

  it("after RMM completed: the rejection reopens RMM's review", () => {
    const sc = new Scenario().toReview();
    sc.complete("RMM", "u-rmm");
    sc.rmes("SAF", "u-saf").decision("SAF", "u-saf", "rejected", "Endocrine data missing");
    expect(sc.track("RMM")?.status).toBe("reopened");
    expect(sc.c.audit.map((a) => a.action)).toEqual(expect.arrayContaining(["Flagged for RMM", "Reopened RMM review"]));
    expect(mailsFor(sc.s, "u-rmm")[0]).toMatchObject({ event: "review-assigned", body: expect.stringMatching(/reopened/) });
    sc.completeAll({ continueNote: "Agreed with Safety." });
    expect(sc.c.phase).toBe("final-release");
  });

  it("or RMM cancels the case with a justification", () => {
    const sc = new Scenario().toReview();
    sc.rmes("SAF", "u-saf").decision("SAF", "u-saf", "rejected", "Endocrine data missing");
    sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Safety rejection: the material is not used", at));
    expect(sc.c.phase).toBe("cancelled");
  });
});

describe("Part 2 changes (spec §1.7)", () => {
  it("a changed metadata answer only adds sections; each gets a task and an additional-part point", () => {
    const sc = new Scenario().toReview();
    sc.step("SF-07 yes", (s, at) => A.saveConfig(s, "u-sup-2", sc.id, { SF07: true }, at));
    expect(sc.c.scope.find((x) => x.sectionId === "A4")).toMatchObject({ applicability: "mandatory", addedLater: true });
    const p = sc.c.openPoints.find((x) => x.kind === "additional-part")!;
    expect(p).toMatchObject({ dept: "SAF", createdBy: "system", status: "open", responsibleId: "u-saf" });
    expect(sc.track("SAF")?.status).toBe("waiting-supplier");
    expect(sc.mails("op-raised").at(-1)?.opId).toBe(p.id);
    expect(sc.c.answeredBy.SF07?.by).toBe("u-sup-2");
    sc.step("SF-07 back to no", (s, at) => A.saveConfig(s, "u-sup-2", sc.id, { SF07: false }, at));
    expect(sc.c.scope.find((x) => x.sectionId === "A4")?.applicability).toBe("mandatory");
    expect(sc.mails("data-changed").length).toBeGreaterThan(0);
  });

  it("in final-release the questionnaire is locked; after a reopen a growing answer reopens the lead and the request goes out again", () => {
    const sc = new Scenario().toReview().completeAll();
    expect(sc.c.phase).toBe("final-release");
    // Thomas, 15 Oct: a metadata answer is refused (and logged) while Beiersdorf waits for the final release
    expect(sc.refused("SF-09 yes while locked", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF09: true }, at))).toBe(RELEASE_LOCKED_TEXT);
    expect(sc.c.config.SF09).toBe(false);
    expect(sc.c.audit.at(-1)).toMatchObject({ action: "Change attempt refused", by: "u-sup-1" });
    // a reviewer reopens: back to review, the release request is withdrawn and the questionnaire unlocks
    sc.reopen("QM", "The preservative answer must be checked again.");
    expect(sc.c.phase).toBe("review");
    expect(sc.mails("release-withdrawn")).toHaveLength(1);
    // SF-05 Preservative opens Annex 8, led by Regulatory, whose review had completed
    sc.step("SF-05 preservative", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF05: ["preservative"] }, at));
    expect(sc.track("REG")?.status).toBe("waiting-supplier");
    expect(sc.mails("review-assigned").at(-1)?.body).toMatch(/reopened/);
    const p = sc.op();
    sc.answer(p.id, "u-sup-1", "Annex 8 completed.").decide(p.id, "u-reg", "accept").complete("REG", "u-reg");
    expect(sc.c.phase).toBe("review");
    sc.complete("QM", "u-qm");
    expect(sc.c.phase).toBe("final-release");
    expect(sc.mails("release-requested")).toHaveLength(2);
  });

  it("a reviewer reopens its completed review with a reason; the release request is withdrawn", () => {
    const sc = new Scenario().toReview().completeAll();
    expect(sc.refused("no reason", (s, at) => A.reopenReview(s, "u-reg", sc.id, "REG", " ", at))).toMatch(/reason/);
    expect(sc.refused("another department", (s, at) => A.reopenReview(s, "u-qm", sc.id, "REG", "x", at))).toMatch(/Only Regulatory/);
    sc.step("reopen", (s, at) => A.reopenReview(s, "u-reg", sc.id, "REG", "The supplier changed K2.1", at));
    expect(sc.c.phase).toBe("review");
    expect(sc.mails("release-withdrawn")).toHaveLength(1);
    expect(sc.refused("release now", (s, at) => A.finalRelease(s, "u-sup-1", sc.id, at))).toMatch(/requested only after/);
  });

  it("marks the sections changed since a reviewer's completion", () => {
    const sc = new Scenario().toReview();
    sc.complete("MIC", "u-mic");
    const since = sc.track("MIC")!.completedAt!;
    expect(changedSectionsFor(sc.c, "MIC")).toEqual([]);
    sc.step("change K5.2 statement", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "TAMC_2410.pdf", kind: "Analysis", sectionId: "K5.2" }, at).state);
    sc.step("change GEN", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "New address", at));
    expect(changedSectionsFor(sc.c, "MIC").sort()).toEqual(["GEN", "K5.2"]);
    expect(sectionsChangedSince(sc.c, since)).toEqual(changedSectionsFor(sc.c, "MIC"));
    expect(sc.c.audit.filter((a) => a.action === "Changed answer after completeness")).toHaveLength(1);
  });
});

describe("final release (spec §1.9)", () => {
  it("is refused while the supplier's questions are open or a mandatory item is missing, with the reasons", () => {
    // every department completes; the supplier clears a mandatory answer of RMM's section while RMM still reviews
    const sc = new Scenario().toReview().completeAll(undefined, ["RMM"]);
    expect(releaseBlockers(sc.c).map((b) => b.label)).toEqual(["Beiersdorf has not finished its review yet."]);
    // (the trade name, supplier name, DUNS and contact e-mails are Beiersdorf's: the supplier clears its own answer)
    sc.step("clear the manufacturer", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", null, at));
    sc.complete("RMM", "u-rmm");
    expect(sc.c.phase).toBe("final-release");
    expect(releaseBlockers(sc.c).map((b) => b.label)).toEqual(["Missing: Manufacturer (name and address)"]);
    expect(sc.refused("release", (s, at) => A.finalRelease(s, "u-sup-1", sc.id, at))).toBe("The release is not possible yet: Missing: Manufacturer (name and address).");
    // locked (Thomas, 15 Oct): the supplier cannot fill it now; RMM reopens, the supplier fills it, RMM completes again
    expect(sc.refused("fill it while locked", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "Solvaro Oleochemicals S.A., Tarragona", at))).toBe(RELEASE_LOCKED_TEXT);
    sc.reopen("RMM", "The manufacturer address is missing.");
    sc.step("fill it again", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "Solvaro Oleochemicals S.A., Tarragona", at));
    sc.complete("RMM", "u-rmm");
    expect(sc.c.phase).toBe("final-release");
    expect(releaseBlockers(sc.c)).toEqual([]);
    expect(sc.refused("by RMM", (s, at) => A.finalRelease(s, "u-rmm", sc.id, at))).toMatch(/Only the supplier's contacts/);
    sc.step("Ravi may not confirm", (s, at) => updateContact(s, "u-admin", "u-sup-2", { mayConfirm: false }, at));
    expect(sc.refused("by Ravi", (s, at) => A.finalRelease(s, "u-sup-2", sc.id, at))).toMatch(/may not confirm/);
    sc.release("u-sup-1");
    expect(sc.c.confirmations.at(-1)).toMatchObject({ type: "final-release", name: "Elena Márquez", email: "elena.marquez@solvaro.example", role: "Regulatory Manager" });
  });

  it("freezes the case: every change attempt is refused and logged; a change report goes to RMM", () => {
    const sc = new Scenario().toReview().completeAll().release();
    const before = sc.c.answers;
    sc.refused("answer", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "x", at));
    sc.refused("metadata", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF03: true }, at));
    sc.refused("rows", (s, at) => A.setComponents(s, "u-sup-1", sc.id, [], at));
    sc.refused("justification", (s, at) => A.setJustification(s, "u-sup-1", sc.id, "K6.8", "x", at));
    sc.refused("upload", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "x.pdf", kind: "Other", sectionId: "K1" }, at).state);
    expect(sc.c.audit.filter((a) => a.action === "Change attempt refused")).toHaveLength(5);
    expect(sc.c.answers).toBe(before);
    expect(sc.refused("empty report", (s, at) => A.reportChange(s, "u-sup-1", sc.id, " ", at))).toMatch(/Describe/);
    expect(sc.refused("report by RMM", (s, at) => A.reportChange(s, "u-rmm", sc.id, "x", at))).toMatch(/Only the supplier's contacts/);
    sc.step("report", (s, at) => A.reportChange(s, "u-sup-2", sc.id, "Our feedstock supplier changes in 2027.", at));
    expect(sc.s.changeReports).toEqual([expect.objectContaining({ id: "CR-0001", caseId: sc.id, by: "u-sup-2", text: "Our feedstock supplier changes in 2027." })]);
    expect(sc.mails("change-reported")).toEqual([expect.objectContaining({ to: ["u-rmm"], audience: "internal", link: `/cases/${sc.id}?tab=overview` })]);
    expect(sc.c.phase).toBe("completed");
  });

  it("before the release a change report is not needed", () => {
    const sc = new Scenario().toReview();
    expect(sc.refused("report", (s, at) => A.reportChange(s, "u-sup-1", sc.id, "x", at))).toMatch(/change the answers directly/);
  });
});

describe("reassignment within a department", () => {
  it("hands the track and its system-raised points to another member; points a person raised stay with that person", () => {
    const sc = new Scenario();
    sc.s = { ...sc.s, users: [...sc.s.users, makeUser("u-saf-2", "Dr. Ole Brandt", "Toxicologist", "internal", "SAF")] };
    sc.toReview();
    sc.raise("SAF", "u-saf", "K1", "Please send the tox summary.");
    const own = sc.op().id;
    sc.step("SF-07 yes", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF07: true }, at));
    const sys = sc.op().id;
    expect(sc.refused("no reason", (s, at) => A.reassignReview(s, "u-saf", sc.id, "SAF", "u-saf-2", " ", at))).toMatch(/reason/);
    expect(sc.refused("to another department", (s, at) => A.reassignReview(s, "u-saf", sc.id, "SAF", "u-reg", "Holiday", at))).toMatch(/another member of Safety/);
    expect(sc.refused("by another department", (s, at) => A.reassignReview(s, "u-reg", sc.id, "SAF", "u-saf-2", "Holiday", at))).toMatch(/Only Safety/);
    sc.step("reassign", (s, at) => A.reassignReview(s, "u-saf", sc.id, "SAF", "u-saf-2", "Holiday", at));
    expect(sc.track("SAF")?.assigneeId).toBe("u-saf-2");
    expect(sc.op(sys).responsibleId).toBe("u-saf-2");
    expect(sc.op(own).createdBy).toBe("u-saf");
    expect(mailsFor(sc.s, "u-saf-2")[0]).toMatchObject({ event: "review-assigned", body: expect.stringMatching(/Holiday/) });
    expect(sc.c.audit.at(-1)).toMatchObject({ action: "Reassigned Safety review", detail: "Dr. Mira Hansen → Dr. Ole Brandt: Holiday" });
  });
});

describe("reminders (spec §1.13)", () => {
  it("sends due, overdue and escalation mails per the settings, each only once", () => {
    const sc = new Scenario().create();
    const at = (days: number) => new Date(sc.t + days * DAY).toISOString();
    let s = runReminders(sc.s, at(1));
    expect(s.mails).toHaveLength(sc.s.mails.length);
    expect(s.toasts.at(-1)?.text).toMatch(/No reminder is due/);
    s = runReminders(sc.s, at(8));
    expect(s.mails.filter((m) => m.event === "reminder")).toEqual([expect.objectContaining({ audience: "supplier", to: ["u-sup-1", "u-sup-2"], subject: `Reminder: fill in the CIQ and confirm completeness (${sc.id})` })]);
    expect(runReminders(s, at(9)).mails).toHaveLength(s.mails.length); // idempotent
    s = runReminders(s, at(15));
    expect(s.mails.filter((m) => m.event === "escalation")).toEqual([expect.objectContaining({ to: ["u-rmm"] })]);
    s = runReminders(s, at(90)); // past the case due date
    expect(s.mails.filter((m) => m.event === "reminder" && m.subject.startsWith("Overdue"))).toHaveLength(1);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("covers unanswered points and idle reviews, and honours disabled settings and permissions", () => {
    const sc = new Scenario().toReview();
    sc.raise("QM", "u-qm");
    const at = (days: number) => new Date(sc.t + days * DAY).toISOString();
    let s = runReminders(sc.s, at(6));
    const rem = s.mails.filter((m) => m.event === "reminder");
    expect(rem.filter((m) => m.audience === "supplier").map((m) => m.opId)).toEqual([sc.op().id]);
    expect(rem.filter((m) => m.audience === "internal").map((m) => m.to[0]).sort()).toEqual(["u-mic", "u-reg", "u-rmm", "u-saf"]); // QM waits for the supplier; no Sustainability track without SF-09
    s = runReminders(s, at(11));
    expect(s.mails.filter((m) => m.event === "escalation" && m.opId === sc.op().id)[0].to).toEqual(["u-qm", "u-rmm"]);
    expect(s.mails.some((m) => m.subject.startsWith("Overdue") && m.opId === sc.op().id)).toBe(true);
    const off = { ...sc.s, reminders: sc.s.reminders.map((r) => ({ ...r, enabled: false })) };
    expect(runReminders(off, at(60)).mails).toHaveLength(off.mails.length);
    expect(runReminders(sc.s, at(6), "u-rmm").toasts.at(-1)).toMatchObject({ refusal: true });
    expect(runReminders(sc.s, at(6), "u-admin").mails.length).toBeGreaterThan(sc.s.mails.length);
  });
});

describe("two contacts in parallel", () => {
  it("every answer shows who entered it", () => {
    const sc = new Scenario().create().metadata();
    sc.step("Elena", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "Solvaro, Tarragona", at));
    sc.step("Ravi", (s, at) => A.setAnswer(s, "u-sup-2", sc.id, "FLD-GEN-005", "Plant Tarragona", at));
    expect(sc.c.answeredBy["FLD-GEN-004"].by).toBe("u-sup-1");
    expect(sc.c.answeredBy["FLD-GEN-005"].by).toBe("u-sup-2");
    expect(sc.c.answeredBy.SF01.by).toBe("u-sup-1");
  });
});
