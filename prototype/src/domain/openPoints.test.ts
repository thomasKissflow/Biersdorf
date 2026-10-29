import { describe, expect, it } from "vitest";
import { closeOpenPoint, completeReview, editOpenPoint, raiseOpenPoint, reviewResponse, saveConfig, supplierRespond } from "./actions";
import { can, raiserOf } from "./permissions";
import { fmtDate, reviewBlockers, supplierTasks } from "./selectors";
import { Scenario, seedWithRegColleague } from "./testkit";
import type { AppState, ReviewDept } from "./types";

/** A case in review with one REG query on K1, raised by Regulatory with a Regulatory colleague as the responsible person. */
function withQuery() {
  const sc = new Scenario(seedWithRegColleague()).toReview();
  sc.raise("REG", "u-reg", "K1", "Please confirm the CoA batch number.", { responsibleId: "u-reg-2" });
  return { sc, op: sc.op().id };
}

describe("open points: only the raiser handles its point (AS-08)", () => {
  it("nobody but the raiser may accept, return, edit or close", () => {
    const { sc, op } = withQuery();
    sc.answer(op);
    for (const by of ["u-reg-2", "u-rmm", "u-saf", "u-qm", "u-admin", "u-sup-1"]) {
      expect(can(sc.s, by, "op.decide", sc.c, { opId: op }), by).toBe(false);
      expect(sc.refused(`edit by ${by}`, (s, at) => editOpenPoint(s, by, sc.id, op, { dueDate: "2026-12-01T00:00:00.000Z" }, at))).toMatch(by === "u-sup-1" ? /Only Beiersdorf/ : /Only Dr\. Jonas Albrecht can change this open point/);
      sc.refused(`close by ${by}`, (s, at) => closeOpenPoint(s, by, sc.id, op, "Not needed", at));
      sc.refused(`accept by ${by}`, (s, at) => reviewResponse(s, by, sc.id, op, "accept", "", at));
    }
    expect(can(sc.s, "u-reg", "op.decide", sc.c, { opId: op })).toBe(true);
    sc.decide(op, "u-reg", "accept");
    expect(sc.op(op)).toMatchObject({ status: "closed", outcome: "accepted", closedBy: "u-reg" });
  });

  it("for a point the system raised, the responsible person acts as the raiser", () => {
    const sc = new Scenario().toReview();
    sc.step("late SF-07", (s, at) => saveConfig(s, "u-sup-1", sc.id, { SF07: true }, at));
    const added = sc.c.openPoints.filter((p) => p.kind === "additional-part");
    expect(added.map((p) => p.ref.sectionId)).toEqual(["A4"]); // A9 is already open for a vegetable origin
    for (const p of added) {
      expect(p.createdBy).toBe("system");
      expect(raiserOf(p)).toBe(sc.track(p.dept)!.assigneeId);
    }
    const p = added[0];
    sc.refused("REG closes SAF's point", (s, at) => closeOpenPoint(s, "u-reg", sc.id, p.id, "n/a", at));
    sc.step("SAF closes it", (s, at) => closeOpenPoint(s, raiserOf(p), sc.id, p.id, "Covered by the SDS", at));
  });
});

describe("editing an open point (AS-08)", () => {
  it("changing only the due date or the justification keeps the round; the history and the supplier see the change", () => {
    const { sc, op } = withQuery();
    const mails = sc.mails("op-edited").length;
    sc.step("due date", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { dueDate: "2026-11-30T00:00:00.000Z" }, at));
    let p = sc.op(op);
    expect(p).toMatchObject({ status: "open", rounds: 1, dueDate: "2026-11-30T00:00:00.000Z" });
    expect(p.edits).toEqual([expect.objectContaining({ field: "dueDate", by: "u-reg", to: "2026-11-30T00:00:00.000Z" })]);
    expect(p.thread.at(-1)).toMatchObject({ action: "edited", side: "internal", text: expect.stringMatching(new RegExp(`^Due date changed from .* to ${fmtDate("2026-11-30T00:00:00.000Z")}\\.$`)) });
    expect(p.thread.at(-1)?.newRound).toBeUndefined();
    expect(sc.mails("op-edited")).toHaveLength(mails + 1);
    expect(sc.mails("op-edited").at(-1)).toMatchObject({ audience: "supplier", channel: "open-point-webhook", to: ["u-sup-1", "u-sup-2"], link: `/portal/case/${sc.id}?op=${op}` });
    expect(sc.c.audit.at(-1)?.action).toBe("Edited open point");

    sc.answer(op);
    sc.step("justification", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { justification: "Needed for the REACH check" }, at));
    p = sc.op(op);
    expect(p).toMatchObject({ status: "in-progress", rounds: 1, justification: "Needed for the REACH check" });
    expect(sc.track("REG")?.status).toBe("in-review");
  });

  it("editing the question of an answered point starts a new round to the supplier", () => {
    const { sc, op } = withQuery();
    sc.answer(op);
    sc.step("new question", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { question: "Please confirm the CoA batch number and its date." }, at));
    const p = sc.op(op);
    expect(p).toMatchObject({ status: "open", rounds: 2, question: "Please confirm the CoA batch number and its date." });
    expect(p.thread.at(-1)).toMatchObject({ action: "edited", newRound: true, text: "Question changed from “Please confirm the CoA batch number.” to “Please confirm the CoA batch number and its date.”." });
    expect(sc.track("REG")?.status).toBe("waiting-supplier");
    expect(supplierTasks(sc.s, "s1").some((t) => t.openPointId === op)).toBe(true);
    expect(sc.mails("op-edited").at(-1)?.body).toMatch(/Please answer the changed question\./);
    // While the point is still open, a changed question is no new round.
    sc.step("reword", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { question: "Please confirm the CoA batch number and the date." }, at));
    expect(sc.op(op).rounds).toBe(2);
    sc.answer(op, "u-sup-2", "Batch 2408-117 of 12 Aug 2026.").decide(op, "u-reg", "accept");
    expect(sc.op(op).thread.map((m) => m.action)).toEqual(["raised", "answered", "edited", "edited", "answered", "accepted"]);
  });

  it("refuses an empty question, a past due date, an internal-less responsible, no change, and closed points", () => {
    const { sc, op } = withQuery();
    expect(sc.refused("empty", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { question: " " }, at))).toMatch(/cannot be empty/);
    expect(sc.refused("past", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { dueDate: "2026-01-01T00:00:00.000Z" }, at))).toMatch(/today or later/);
    expect(sc.refused("supplier responsible", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { responsibleId: "u-sup-1" }, at))).toMatch(/Beiersdorf user/);
    // A read-only role, or a user of another department, never becomes the responsible person.
    for (const other of ["u-cus", "u-auditor", "u-rmm", "u-saf"]) expect(sc.refused(`responsible ${other}`, (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { responsibleId: other }, at))).toMatch(/Beiersdorf user of Regulatory/);
    expect(sc.refused("same", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { question: sc.op(op).question }, at))).toBe("Nothing changed.");
    sc.step("responsible", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { responsibleId: "u-reg" }, at));
    expect(sc.op(op).thread.at(-1)?.text).toBe("Responsible person changed from Tobias Brandt to Dr. Jonas Albrecht.");
    sc.answer(op).decide(op, "u-reg", "accept");
    expect(sc.refused("closed", (s, at) => editOpenPoint(s, "u-reg", sc.id, op, { question: "Again?" }, at))).toMatch(/closed open point cannot be edited/);
  });
});

describe("closing (withdrawing) an open point (AS-08)", () => {
  it("the raiser closes it in any unresolved state with an internal reason; it stops blocking and the supplier is told without the reason", () => {
    const { sc, op } = withQuery();
    expect(reviewBlockers(sc.c, "REG").filter((b) => b.startsWith("OP-"))).toHaveLength(1);
    expect(sc.track("REG")?.status).toBe("waiting-supplier");
    expect(sc.refused("no reason", (s, at) => closeOpenPoint(s, "u-reg", sc.id, op, " ", at))).toMatch(/internal reason/);
    sc.step("withdraw", (s, at) => closeOpenPoint(s, "u-reg", sc.id, op, "SECRET-REASON the batch is known from the audit", at));
    const p = sc.op(op);
    expect(p).toMatchObject({ status: "closed", outcome: "withdrawn", closedBy: "u-reg", closeReason: "SECRET-REASON the batch is known from the audit" });
    expect(p.thread.at(-1)).toMatchObject({ action: "withdrawn", text: "Closed by Beiersdorf: no answer needed." });
    expect(sc.track("REG")?.status).toBe("in-review");
    expect(reviewBlockers(sc.c, "REG").filter((b) => b.startsWith("OP-"))).toEqual([]);
    expect(supplierTasks(sc.s, "s1").some((t) => t.openPointId === op)).toBe(false);
    const mail = sc.mails("op-closed").at(-1)!;
    expect(mail).toMatchObject({ audience: "supplier", to: ["u-sup-1", "u-sup-2"] });
    expect(mail.body).not.toMatch(/SECRET-REASON/);
    expect(sc.c.audit.at(-1)).toMatchObject({ action: "Closed open point (no answer needed)" });
    // A supplier answer to a closed point is refused with the date.
    expect(sc.refused("late answer", (s, at) => supplierRespond(s, "u-sup-1", sc.id, op, { text: "Here it is." }, at))).toMatch(/^Beiersdorf closed this question on \d{1,2} [A-Z][a-z]{2} 2026\.$/);
    expect(sc.refused("close again", (s, at) => closeOpenPoint(s, "u-reg", sc.id, op, "again", at))).toMatch(/already closed/);
  });

  it("an answered point can be closed too, which unblocks the completion", () => {
    const { sc, op } = withQuery();
    sc.answer(op);
    sc.decision("REG", "u-reg", "approved");
    expect(sc.refused("complete with open point", (s, at) => completeReview(s, "u-reg", sc.id, "REG", at))).toMatch(/Cannot complete/);
    sc.step("withdraw", (s, at) => closeOpenPoint(s, "u-reg", sc.id, op, "Answered elsewhere", at));
    sc.complete("REG", "u-reg");
    expect(sc.track("REG")?.status).toBe("completed");
  });
});

describe("deciding on an answer", () => {
  it("accept only after an answer; return needs a reason and starts a new round with a fresh due date", () => {
    const { sc, op } = withQuery();
    expect(sc.refused("accept unanswered", (s, at) => reviewResponse(s, "u-reg", sc.id, op, "accept", "", at))).toMatch(/not answered yet/);
    sc.answer(op);
    expect(sc.refused("return without reason", (s, at) => reviewResponse(s, "u-reg", sc.id, op, "return", "", at))).toMatch(/short reason/);
    sc.decide(op, "u-reg", "return", "Please attach the CoA itself.");
    expect(sc.op(op)).toMatchObject({ status: "open", rounds: 2 });
    expect(sc.op(op).thread.at(-1)).toMatchObject({ action: "returned", newRound: true });
    expect(sc.mails("op-returned").at(-1)?.body).toMatch(/“Please attach the CoA itself\.”/);
    sc.answer(op, "u-sup-2", "CoA attached.", "CoA_batch_2408.pdf");
    expect(sc.mails("op-answered").at(-1)?.body).toMatch(/CoA_batch_2408\.pdf/);
    sc.decide(op, "u-reg", "not-accepted", "SECRET-NOTE insufficient for REACH");
    expect(sc.op(op)).toMatchObject({ status: "closed", outcome: "not-accepted" });
    expect(sc.mails("op-closed").at(-1)?.body).not.toMatch(/SECRET-NOTE/);
  });

  it("raising needs the review phase, the raiser's own active track, an in-scope section and a due date", () => {
    const sc = new Scenario().create().metadata();
    expect(sc.refused("before review", (s, at) => raise(s, at, sc.id, "REG", "u-reg"))).toMatch(/during the review/);
    sc.fillMandatory().confirm();
    expect(sc.refused("other department", (s, at) => raise(s, at, sc.id, "REG", "u-saf"))).toMatch(/Only Regulatory/);
    expect(sc.refused("supplier", (s, at) => raise(s, at, sc.id, "REG", "u-sup-1"))).toMatch(/Only Beiersdorf reviewers/);
    expect(sc.refused("N.A. section", (s, at) => raise(s, at, sc.id, "REG", "u-reg", "A4"))).toMatch(/does not apply/);
    expect(sc.refused("past due", (s, at) => raise(s, at, sc.id, "REG", "u-reg", "K1", "2026-01-01T00:00:00.000Z"))).toMatch(/today or later/);
    expect(sc.refused("no question", (s, at) => raise(s, at, sc.id, "REG", "u-reg", "K1", undefined, " "))).toMatch(/needs a question/);
    sc.step("RMM asks on any section", (s, at) => raise(s, at, sc.id, "RMM", "u-rmm", "K2.1"));
    expect(sc.c.openPoints).toHaveLength(1);
  });
});

function raise(s: AppState, at: string, caseId: string, dept: ReviewDept, by: string, sectionId = "K1", dueDate = "2026-12-01T00:00:00.000Z", question = "Please confirm.") {
  return raiseOpenPoint(s, by, caseId, { dept, kind: "query", ref: { sectionId, label: sectionId }, question, justification: "Needed", dueDate }, at);
}
