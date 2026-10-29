// Thomas, 15 Oct (before the client call), binding:
// 1. Once a department has completed its review, a supplier change in a section it leads or co-reviews (section
//    owners, A-29) reopens that review automatically, through the existing reopen path (B-25/B-27): actor "system",
//    the reason in plain words, audit, one review-assigned mail (C-02) per burst; the "changed since your review"
//    markers keep counting from the undone completion. RMM's review only for a section RMM leads or co-reviews.
//    Metadata answers keep their own grow-only rule (B-28).
// 2. Once the final release is requested, the supplier can change nothing: answers, metadata, K2.1 rows,
//    justifications, uploads and requested-document justifications are refused and logged (B-04). Giving the final
//    release stays possible; a reopened review takes the case back to review and unlocks it.
import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { RELEASE_LOCKED_TEXT, can, check } from "./permissions";
import { changedSectionsFor, questionnaireLocked, reviewSince } from "./selectors";
import { Scenario } from "./testkit";
import type { ComponentRow, ReviewDept } from "./types";

const ROW: ComponentRow = { id: "c2", inci: "Tocopherol", fn: "antioxidant", additive: true, origin: "vegetable", concMin: 0.01, concMax: 0.1, cas: "10191-41-0" };
const reopenMails = (sc: Scenario, user: string) => sc.mails("review-assigned").filter((m) => m.to.includes(user) && /reopened/.test(m.body));
const doneByDept = (sc: Scenario, ...depts: ReviewDept[]) => {
  for (const d of depts) {
    const by = Scenario.REVIEWER[d];
    if (d === "SAF" || d === "REG") sc.decision(d, by, "approved");
    sc.complete(d, by);
  }
  return sc;
};

describe("1. a supplier change reopens the completed reviews of the section's owners", () => {
  it("K2.1 row added after Regulatory (lead) completed: reopened by the system with a plain reason, audited, one mail per burst", () => {
    const sc = doneByDept(new Scenario().toReview(), "REG");
    const completedAt = sc.track("REG")!.completedAt!;
    expect(sc.c.phase).toBe("review");
    sc.step("add a K2.1 row", (s, at) => A.setComponents(s, "u-sup-1", sc.id, [...sc.c.components, ROW], at));
    expect(sc.track("REG")).toMatchObject({ status: "reopened", lastCompletedAt: completedAt });
    expect(sc.track("REG")!.completedAt).toBeUndefined();
    expect(sc.c.audit.find((a) => a.action === "Reopened Regulatory review")).toMatchObject({ by: "system", detail: "The supplier changed K2.1 after your review." });
    expect(reopenMails(sc, "u-reg")).toHaveLength(1);
    expect(reopenMails(sc, "u-reg")[0].body).toMatch(/^Your completed review was reopened: The supplier changed K2\.1 after your review\./);
    // the markers still count from the undone completion
    expect(reviewSince(sc.c, "REG")).toBe(completedAt);
    expect(changedSectionsFor(sc.c, "REG", sc.s.config)).toEqual(["K2.1"]);
    // more changes of the same burst: no second reopen mail (the track is already reopened)
    sc.step("change the row", (s, at) => A.setComponents(s, "u-sup-2", sc.id, sc.c.components.map((r) => (r.id === "c2" ? { ...r, concMax: 0.2 } : r)), at));
    sc.step("answer in K2.1", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-2.1-102", 0.97, at));
    expect(reopenMails(sc, "u-reg")).toHaveLength(1);
    expect(sc.c.audit.filter((a) => a.action === "Reopened Regulatory review")).toHaveLength(1);
    // Regulatory completes again; the next change reopens it again (a new burst)
    sc.complete("REG", "u-reg");
    sc.step("answer in K2.1 again", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-2.1-102", 0.96, at));
    expect(sc.track("REG")!.status).toBe("reopened");
    expect(reopenMails(sc, "u-reg")).toHaveLength(2);
  });

  it("one burst of changes within minutes: one reopen mail and one merged data-changed mail", () => {
    const sc = doneByDept(new Scenario().toReview(), "REG");
    const at = (min: number) => new Date(sc.t + min * 60_000).toISOString();
    let st = A.setComponents(sc.s, "u-sup-1", sc.id, [...sc.c.components, ROW], at(1));
    st = A.setAnswer(st, "u-sup-1", sc.id, "FLD-2.1-102", 0.97, at(3));
    st = A.setComponents(st, "u-sup-1", sc.id, st.cases.find((c) => c.id === sc.id)!.components.map((r) => (r.id === "c2" ? { ...r, concMax: 0.2 } : r)), at(5));
    const mails = st.mails.filter((m) => m.caseId === sc.id && m.to.includes("u-reg") && Date.parse(m.at) > sc.t);
    expect(mails.map((m) => m.event)).toEqual(["review-assigned", "data-changed"]);
    expect(mails[1].body.split("\n").filter((l) => /^K2\.1:/.test(l))).toHaveLength(3);
  });

  it("an upload in K1 reopens its lead (QM) and its co-reviewer (Safety); a department that does not own K1 stays completed", () => {
    const sc = doneByDept(new Scenario().toReview(), "QM", "SAF", "MIC");
    sc.step("upload in K1", (s, at) => A.uploadDocument(s, "u-sup-2", sc.id, { name: "CoA_batch_2610.pdf", kind: "CoA", sectionId: "K1" }, at).state);
    expect(sc.track("QM")!.status).toBe("reopened");
    expect(sc.track("SAF")!.status).toBe("reopened");
    expect(sc.track("MIC")!.status).toBe("completed");
    expect(sc.track("RMM")!.status).toBe("in-review"); // a co-reviewer of K1, but not completed
    expect(reopenMails(sc, "u-qm")).toHaveLength(1);
    expect(reopenMails(sc, "u-saf")).toHaveLength(1);
    expect(reopenMails(sc, "u-mic")).toHaveLength(0);
    expect(sc.c.audit.filter((a) => /^Reopened (QM|Safety) review$/.test(a.action)).every((a) => a.by === "system" && a.detail === "The supplier changed K1 after your review.")).toBe(true);
  });

  it("RMM's review reopens only for a section RMM leads or co-reviews", () => {
    const sc = doneByDept(new Scenario().toReview(), "RMM");
    sc.step("K2.2 answer (Safety and QM)", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-A14-102", 0.04, at));
    expect(sc.track("RMM")!.status).toBe("completed");
    sc.step("GEN answer (RMM)", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-005", "Plant 3, Tarragona", at));
    expect(sc.track("RMM")!.status).toBe("reopened");
    expect(reopenMails(sc, "u-rmm")).toHaveLength(1);
    const i = sc.c.audit.findIndex((a) => a.action === "Reopened RMM review");
    expect(sc.c.audit[i - 1]).toMatchObject({ action: "Changed answer after completeness", sectionId: "GEN" }); // the change is audited first
    expect(sc.c.audit[i].detail).toBe("The supplier changed General information after your review.");
  });

  it("a justification and a file sent with an answer count as changes in their section", () => {
    const sc = doneByDept(new Scenario().toReview(), "REG", "QM");
    sc.step("justification in K6.8 (Regulatory)", (s, at) => A.setJustification(s, "u-sup-1", sc.id, "K6.8", "Not halal certified yet.", at));
    expect(sc.track("REG")!.status).toBe("reopened");
    // RMM asks on K1; the supplier answers with a document stored in K1: QM (K1's lead) reopens, no data-changed mail
    sc.raise("RMM", "u-rmm", "K1", "Please send the current CoA.");
    const dataChanged = sc.mails("data-changed").length;
    sc.answer(sc.op().id, "u-sup-1", "Attached.", "CoA_2610.pdf");
    expect(sc.track("QM")!.status).toBe("reopened");
    expect(reopenMails(sc, "u-qm")).toHaveLength(1);
    expect(sc.mails("data-changed")).toHaveLength(dataChanged);
  });

  it("metadata answers keep their grow-only rule: no owner reopen for GEN", () => {
    const sc = doneByDept(new Scenario().toReview(), "RMM");
    sc.step("SF-05 preservative", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF05: ["preservative"] }, at));
    expect(sc.track("RMM")!.status).toBe("completed");
    expect(sc.c.audit.some((a) => a.action === "Reopened RMM review")).toBe(false);
  });

  it("nothing reopens before the completeness confirmation or while the owner's review is still open", () => {
    const part1 = new Scenario().create().metadata().fillMandatory();
    part1.step("Part 1 change", (s, at) => A.setAnswer(s, "u-sup-1", part1.id, "FLD-GEN-005", "Plant 4", at));
    expect(part1.c.reviews).toEqual([]);
    const sc = new Scenario().toReview();
    sc.step("change while Regulatory reviews", (s, at) => A.setComponents(s, "u-sup-1", sc.id, [...sc.c.components, ROW], at));
    expect(sc.track("REG")!.status).toBe("in-review");
    expect(sc.c.audit.some((a) => a.action.startsWith("Reopened"))).toBe(false);
  });
});

describe("1b. a completion applied after a later supplier change (the live service, H-08: CompleteOptions.completedAt)", () => {
  // The sync service applies a CIQ Review item's completion on its next pass. A supplier change that came after the
  // reviewer completed may already be in the case by then: the department reopens at once, as in the prototype.
  it("QM (K1's lead) completed before a K1 upload it never saw: completed, then reopened by the system; no release request", () => {
    const sc = new Scenario().toReview().completeAll(undefined, ["QM"]);
    const qmDoneAt = sc.now(); // QM submits its review item in the Workbench
    sc.step("upload in K1 after QM completed", (s, at) => A.uploadDocument(s, "u-sup-2", sc.id, { name: "CoA-new.pdf", kind: "CoA", sectionId: "K1" }, at).state);
    // the upload reopened K1's other completed owners at once; QM was still open then
    expect((["REG", "SAF", "RMM"] as ReviewDept[]).map((d) => sc.track(d)!.status)).toEqual(["reopened", "reopened", "reopened"]);
    const releaseMails = sc.mails("release-requested").length;
    sc.complete("QM", "u-qm", { completedAt: qmDoneAt });
    expect(sc.track("QM")).toMatchObject({ status: "reopened", lastCompletedAt: qmDoneAt });
    const actions = sc.c.audit.map((a) => a.action);
    expect(actions.slice(-2)).toEqual(["Completed QM review", "Reopened QM review"]);
    expect(sc.c.audit.at(-1)).toMatchObject({ by: "system", detail: "The supplier changed K1 after your review." });
    expect(reopenMails(sc, "u-qm")).toHaveLength(1);
    expect(changedSectionsFor(sc.c, "QM", sc.s.config)).toEqual(["K1"]);
    expect(sc.c.phase).toBe("review");
    expect(sc.mails("release-requested")).toHaveLength(releaseMails);
  });

  it("even as the last completion: the change keeps the case in review instead of requesting the release", () => {
    const sc = new Scenario().toReview().completeAll(undefined, ["SAF"]);
    sc.decision("SAF", "u-saf", "approved");
    const safDoneAt = sc.now();
    // K2.2: Safety leads, QM co-reviews (QM is completed, so it reopens with the change itself)
    sc.step("K2.2 answer after Safety completed", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-A14-102", 0.04, at));
    expect(sc.track("QM")!.status).toBe("reopened");
    sc.complete("SAF", "u-saf", { completedAt: safDoneAt });
    expect(sc.track("SAF")!.status).toBe("reopened");
    expect(sc.c.phase).toBe("review");
    expect(sc.c.audit.some((a) => a.action === "All reviews completed")).toBe(false);
  });

  it("changes before the completion, metadata answers and other departments' sections reopen nothing", () => {
    const sc = new Scenario().toReview().completeAll(undefined, ["QM", "MIC"]);
    sc.step("K1 upload before QM completed", (s, at) => A.uploadDocument(s, "u-sup-2", sc.id, { name: "CoA-old.pdf", kind: "CoA", sectionId: "K1" }, at).state);
    const qmDoneAt = sc.now();
    sc.step("SF-05 after QM completed (metadata: grow-only rule)", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF05: ["preservative"] }, at));
    sc.step("K6.8 justification after QM completed (Regulatory's section)", (s, at) => A.setJustification(s, "u-sup-1", sc.id, "K6.8", "Not halal certified yet.", at));
    sc.complete("QM", "u-qm", { completedAt: qmDoneAt });
    expect(sc.track("QM")!.status).toBe("completed");
    expect(sc.c.audit.some((a) => a.action === "Reopened QM review")).toBe(false);
    // without the option (the prototype's own screens complete "now") nothing is looked up either
    sc.complete("MIC", "u-mic");
    expect(sc.track("MIC")!.status).toBe("completed");
  });
});

describe("2. the questionnaire is locked while the final release is requested", () => {
  it("every supplier change is refused and logged; giving the final release stays possible", () => {
    const sc = new Scenario().toReview().completeAll();
    expect(sc.c.phase).toBe("final-release");
    expect(questionnaireLocked(sc.c)).toBe(true);
    expect(can(sc.s, "u-sup-1", "ciq.edit", sc.c)).toBe(false);
    expect(check(sc.s, "u-sup-1", "ciq.edit", sc.c)).toBe(RELEASE_LOCKED_TEXT);
    const before = { answers: sc.c.answers, config: sc.c.config, components: sc.c.components, justifications: sc.c.justifications, documents: sc.c.documents, reviews: sc.c.reviews };
    const attempts: [string, Parameters<Scenario["refused"]>[1]][] = [
      ["answer", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "New address", at)],
      ["metadata", (s, at) => A.saveConfig(s, "u-sup-2", sc.id, { SF03: true }, at)],
      ["K2.1 rows", (s, at) => A.setComponents(s, "u-sup-1", sc.id, [...sc.c.components, ROW], at)],
      ["justification", (s, at) => A.setJustification(s, "u-sup-1", sc.id, "K6.8", "Not halal certified yet.", at)],
      ["requested-document justification", (s, at) => A.setJustification(s, "u-sup-1", sc.id, "EV:additional-site-certificate", "Only one site.", at)],
      ["upload", (s, at) => A.uploadDocument(s, "u-sup-2", sc.id, { name: "extra.pdf", kind: "Other", sectionId: "K1" }, at).state],
    ];
    for (const [label, fn] of attempts) expect(sc.refused(label, fn), label).toBe(RELEASE_LOCKED_TEXT);
    expect(sc.c.audit.filter((a) => a.action === "Change attempt refused")).toHaveLength(attempts.length);
    expect(sc.c.audit.filter((a) => a.action === "Change attempt refused").every((a) => /locked while Beiersdorf waits for the final release/.test(a.detail))).toBe(true);
    expect({ answers: sc.c.answers, config: sc.c.config, components: sc.c.components, justifications: sc.c.justifications, documents: sc.c.documents, reviews: sc.c.reviews }).toEqual(before);
    expect(sc.c.phase).toBe("final-release");
    expect(sc.refused("report a change", (s, at) => A.reportChange(s, "u-sup-1", sc.id, "x", at))).toBe(RELEASE_LOCKED_TEXT);
    sc.release("u-sup-1");
    expect(sc.c.phase).toBe("completed");
  });

  it("a reopened review takes the case back to review and unlocks the questionnaire; the next request locks it again", () => {
    const sc = new Scenario().toReview().completeAll();
    sc.reopen("QM", "The CoA must be checked again.");
    expect(sc.c.phase).toBe("review");
    expect(questionnaireLocked(sc.c)).toBe(false);
    expect(can(sc.s, "u-sup-1", "ciq.edit", sc.c)).toBe(true);
    sc.step("upload the new CoA", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "CoA_2611.pdf", kind: "CoA", sectionId: "K1" }, at).state);
    // the upload in K1 reopened K1's other completed owners too (Regulatory, Safety, RMM)
    expect((["REG", "SAF", "RMM"] as ReviewDept[]).map((d) => sc.track(d)!.status)).toEqual(["reopened", "reopened", "reopened"]);
    sc.completeAll();
    expect(sc.c.phase).toBe("final-release");
    expect(sc.refused("locked again", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "x", at))).toBe(RELEASE_LOCKED_TEXT);
  });

  it("a case cancelled in final-release and reactivated is locked again (back to the release request)", () => {
    const sc = new Scenario().toReview().completeAll();
    sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Paused by the brand team", at));
    sc.step("reactivate", (s, at) => A.reactivateCase(s, "u-rmm", sc.id, "Needed again.", at));
    expect(sc.c.phase).toBe("final-release");
    expect(sc.refused("answer", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "x", at))).toBe(RELEASE_LOCKED_TEXT);
    sc.release("u-sup-1");
    expect(sc.c.phase).toBe("completed");
  });
});
