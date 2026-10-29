// Domain behaviour settled by the adversarial review of 14 Oct (permissions, edge cases, spec conformance). Every step
// runs through the Scenario builder, so each one is also an invariant check.
import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { buildFinalDocument } from "./finalDocument";
import { keepPersonaId, personaOf } from "./personas";
import { reviewBlockers, trackView } from "./selectors";
import * as M from "./suppliers";
import { PLAIN_CONFIG, Scenario, seedWithRegColleague } from "./testkit";

const due = (sc: Scenario) => new Date(sc.t + 10 * 86_400_000).toISOString();

describe("Safety / Regulatory: open points and the decision are the whole gate (RMES retired, 28 Oct)", () => {
  /** A record as the retired criteria RMES left it: a criterion without a result and an open blocking finding. */
  const legacy = (sc: Scenario) => {
    sc.s = {
      ...sc.s,
      cases: sc.s.cases.map((c) =>
        c.id === sc.id
          ? {
              ...c,
              rmes: {
                ...c.rmes!,
                criteria: [{ id: "S-B1", part: "B", dept: "SAF", title: "Toxicological profile available and plausible", source: { sectionId: "K4.1", version: 1, label: "K4.1" } }],
                findings: [{ id: "0001-F1", criterionId: "S-B1", dept: "SAF", text: "Sensitisation data missing", blocking: true, status: "open" }],
              },
            }
          : c,
      ),
    };
  };

  it("a legacy record with a pending criterion and an open finding never blocks: the decision completes the review", () => {
    const sc = new Scenario().toReview();
    legacy(sc);
    expect(reviewBlockers(sc.c, "SAF")).toEqual(["Final Safety decision (Approved / Rejected) not yet recorded"]);
    sc.refused("no decision yet", (s, at) => A.completeReview(s, "u-saf", sc.id, "SAF", at));
    sc.decision("SAF", "u-saf", "approved").complete("SAF", "u-saf");
    expect(sc.track("SAF")?.status).toBe("completed");
    expect(reviewBlockers(sc.c, "SAF")).toEqual([]);
  });

  it("a late Annex 4 and changed heavy-metal answers leave the record as it is (no criteria, no limit checks)", () => {
    const sc = new Scenario().toReview();
    const record = sc.c.rmes;
    expect(record).toMatchObject({ criteria: [], findings: [] });
    sc.step("late SF-07", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF07: true }, at));
    sc.step("cadmium 0.5", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-A14-102", 0.5, at));
    expect(sc.c.rmes).toEqual(record);
    expect(sc.c.audit.some((a) => /RMES/.test(a.action))).toBe(false);
  });

  it("a point closed as not accepted adds nothing to the record", () => {
    const sc = new Scenario().toReview();
    sc.raise("SAF", "u-saf", "K1", "Please send the tox summary.");
    sc.answer(sc.op().id).decide(sc.op().id, "u-saf", "not-accepted", "The summary is not the dossier.");
    expect(sc.c.rmes).toMatchObject({ criteria: [], findings: [] });
    sc.decision("SAF", "u-saf", "approved").complete("SAF", "u-saf");
    expect(sc.track("SAF")?.status).toBe("completed");
  });
});

describe("adding a section follows the same rule as a query", () => {
  it("only an open review of the asker's department adds a section; never in final-release", () => {
    const sc = new Scenario().toReview();
    sc.decision("REG", "u-reg", "approved").complete("REG", "u-reg");
    expect(sc.refused("REG completed", (s, at) => A.extendScope(s, "u-reg", sc.id, "A5", "UV absorber found in the SDS", at))).toMatch(/Your review is completed/);
    sc.step("SAF adds A4", (s, at) => A.extendScope(s, "u-saf", sc.id, "A4", "MOAH risk from the refining", at));
    expect(sc.c.scope.find((x) => x.sectionId === "A4")?.applicability).toBe("mandatory");
    const fr = new Scenario().toReview().completeAll();
    expect(fr.c.phase).toBe("final-release");
    expect(fr.refused("final-release", (s, at) => A.extendScope(s, "u-saf", fr.id, "A4", "MOAH risk", at))).toMatch(/Reopen your review to add a section/);
    expect(fr.c.phase).toBe("final-release");
  });
});

describe("the responsible person of an open point belongs to its department", () => {
  it("refuses a read-only role or another department when raising and when editing; a colleague of the department is fine", () => {
    const sc = new Scenario(seedWithRegColleague()).toReview();
    for (const other of ["u-cus", "u-leg", "u-auditor", "u-owner", "u-admin", "u-saf"])
      expect(sc.refused(`raise with ${other}`, (s, at) => A.raiseOpenPoint(s, "u-reg", sc.id, { dept: "REG", kind: "query", ref: { sectionId: "K1", label: "K1" }, question: "Q?", justification: "J", dueDate: due(sc), responsibleId: other }, at))).toMatch(/Beiersdorf user of Regulatory/);
    sc.raise("REG", "u-reg", "K1", "Please confirm the batch.", { responsibleId: "u-reg-2" });
    // a system-raised point (late SF-07 → A4, Safety) can never be handed to a read-only role
    sc.step("late SF-07", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF07: true }, at));
    const sys = sc.c.openPoints.find((p) => p.createdBy === "system")!;
    expect(sc.refused("hand to Customs", (s, at) => A.editOpenPoint(s, "u-saf", sc.id, sys.id, { responsibleId: "u-cus" }, at))).toMatch(/Beiersdorf user of Safety/);
    expect(sc.op(sys.id).responsibleId).toBe("u-saf");
  });
});

describe("Part 2 scope growth tells the reviewers concerned (REQ-CFG-008)", () => {
  it("a lead whose review is already open gets a mail naming the added section; RMM's mail lists the added sections", () => {
    const sc = new Scenario().toReview();
    expect(sc.track("SAF")?.status).toBe("in-review");
    const before = sc.s.mails.length;
    sc.step("late SF-07", (s, at) => A.saveConfig(s, "u-sup-1", sc.id, { SF07: true }, at));
    const fresh = sc.s.mails.slice(before);
    const saf = fresh.find((m) => m.to.includes("u-saf") && m.event === "data-changed");
    expect(saf?.subject).toMatch(/Annex 4 added to your Safety review/);
    expect(saf?.link).toBe(`/review/${sc.id}?s=A4`);
    const rmm = fresh.find((m) => m.to.includes("u-rmm") && m.event === "data-changed");
    expect(rmm?.body).toMatch(/Sections added: Annex 4/);
  });

  it("a data-changed mail opens the review on the changed section", () => {
    const sc = new Scenario().toReview();
    sc.step("new K1 document", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "CoA_new.pdf", kind: "CoA", sectionId: "K1", fieldId: "FLD-K1-002" }, at).state);
    expect(sc.mails("data-changed")[0].link).toBe(`/review/${sc.id}?s=K1`);
  });
});

describe("the GEN contact e-mails follow the case contacts (EC-03, SUP-04)", () => {
  it("Edit case contacts, a replacement on deactivation and an e-mail change in the master all update FLD-GEN-008/-009", () => {
    const sc = new Scenario().create();
    expect(sc.c.answers["FLD-GEN-009"]).toBe("ravi.menon@solvaro.example");
    sc.step("only Ravi", (s, at) => A.updateCaseContacts(s, "u-rmm", sc.id, ["u-sup-2"], at));
    expect(sc.c.answers["FLD-GEN-008"]).toBe("ravi.menon@solvaro.example");
    expect(sc.c.answers["FLD-GEN-009"]).toBeUndefined();
    expect(sc.c.audit.at(-1)?.detail).toMatch(/contact e-mails in General information follow/);
    sc.step("Ravi's new e-mail", (s, at) => M.updateContact(s, "u-admin", "u-sup-2", { email: "r.menon@solvaro.example" }, at));
    expect(sc.c.answers["FLD-GEN-008"]).toBe("r.menon@solvaro.example");
    sc.step("both again", (s, at) => A.updateCaseContacts(s, "u-rmm", sc.id, ["u-sup-2", "u-sup-1"], at));
    sc.step("Ravi leaves, Elena takes over", (s, at) => M.setContactActive(s, "u-admin", "u-sup-2", false, "u-sup-1", at));
    expect(sc.c.supplierContactIds).toEqual(["u-sup-1"]);
    expect(sc.c.answers["FLD-GEN-008"]).toBe("elena.marquez@solvaro.example");
    expect(sc.c.answers["FLD-GEN-009"]).toBeUndefined();
    // and the released record says so
    sc.metadata(PLAIN_CONFIG).fillMandatory("u-sup-1", "u-sup-1").confirm().completeAll().release();
    const gen = sc.c.finalDocument!.sections.find((x) => x.sectionId === "GEN")!;
    expect(gen.answers.find((a) => a.fieldId === "FLD-GEN-008")?.value).toBe("elena.marquez@solvaro.example");
    expect(JSON.stringify(buildFinalDocument(sc.s, sc.c, sc.now(), "x"))).not.toContain("menon");
  });

  it("a contact added during the review is told about the review, not asked to fill in Part 1", () => {
    const sc = new Scenario().create({ contactIds: ["u-sup-1"] }).metadata().fillMandatory("u-sup-1", "u-sup-1").confirm();
    sc.step("add Ravi", (s, at) => A.updateCaseContacts(s, "u-rmm", sc.id, ["u-sup-1", "u-sup-2"], at));
    const inv = sc.mails("invitation").filter((m) => m.to.includes("u-sup-2"));
    expect(inv).toHaveLength(1);
    expect(inv[0].subject).toMatch(/You were added/);
    expect(inv[0].body).toMatch(/Beiersdorf is reviewing it/);
    expect(inv[0].body).not.toMatch(/confirm completeness/);
  });
});

describe("cancel and reactivate", () => {
  it("unfinished review tasks read as ended; the audit has no double full stop; reactivation needs a justification", () => {
    const sc = new Scenario().toReview();
    sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Material no longer needed.", at));
    expect(sc.c.reviews.map((r) => trackView(sc.c, r))).toEqual(sc.c.reviews.map(() => "ended"));
    const cancelled = sc.c.audit.find((a) => a.action === "Cancelled case")!;
    expect(cancelled.detail).not.toContain("..");
    expect(cancelled.detail).toMatch(/review tasks ended: RMM/);
    expect(sc.refused("no reason", (s, at) => A.reactivateCase(s, "u-rmm", sc.id, "  ", at))).toMatch(/justification is required/);
    sc.step("reactivate", (s, at) => A.reactivateCase(s, "u-rmm", sc.id, "Project restarted with the brand team.", at));
    expect(sc.c.audit.at(-1)).toMatchObject({ action: "Reactivated case" });
    expect(sc.c.audit.at(-1)!.detail).toMatch(/^Project restarted with the brand team\. Back to/);
    expect(sc.mails("reactivated").find((m) => m.audience === "internal")?.body).toContain("Project restarted with the brand team.");
    expect(sc.mails("reactivated").find((m) => m.audience === "supplier")?.body).not.toContain("brand team");
    expect(sc.c.reviews.every((r) => trackView(sc.c, r) !== "ended")).toBe(true);
  });

  it("an answer, a confirmation or a release on a cancelled request is refused and logged (REQ-PROC-043)", () => {
    const sc = new Scenario().toReview();
    sc.raise("QM", "u-qm");
    const op = sc.op().id;
    sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Project stopped", at));
    const next = A.supplierRespond(sc.s, "u-sup-1", sc.id, op, { text: "Here it is" }, sc.now());
    expect(next.toasts.at(-1)).toMatchObject({ refusal: true });
    expect(next.cases.find((c) => c.id === sc.id)!.audit.at(-1)).toMatchObject({ action: "Change attempt refused", by: "u-sup-1" });
    const rel = A.finalRelease(sc.s, "u-sup-1", sc.id, sc.now());
    expect(rel.cases.find((c) => c.id === sc.id)!.audit.at(-1)).toMatchObject({ action: "Change attempt refused" });
    const conf = A.confirmCompleteness(sc.s, "u-sup-1", sc.id, sc.now());
    expect(conf.cases.find((c) => c.id === sc.id)!.audit.at(-1)).toMatchObject({ action: "Change attempt refused" });
  });
});

describe("after the release: a change report starts the follow-up case", () => {
  it("the new case records which report it follows", () => {
    const sc = new Scenario().toReview().completeAll().release();
    sc.step("report", (s, at) => A.reportChange(s, "u-sup-1", sc.id, "The feedstock supplier changed in 2027.", at));
    const rep = sc.s.changeReports.at(-1)!;
    const r = A.createCase(sc.s, "u-rmm", { materialName: sc.c.materialName, inci: sc.c.inci, materialNo: sc.c.materialNo, supplierId: sc.c.supplierId, contactIds: ["u-sup-1"], markets: ["EU"], dueDate: "2027-03-01T00:00:00.000Z", priority: "normal", followUpOf: { caseId: sc.id, reportId: rep.id } }, sc.now());
    const c = r.state.cases.find((x) => x.id === r.id)!;
    expect(c.audit.find((a) => a.action === "Follow-up case")?.detail).toContain(sc.id);
    expect(c.audit.find((a) => a.action === "Follow-up case")?.detail).toContain("feedstock supplier changed");
  });
});

describe("Customs and Legal are informed on their own section", () => {
  it("one mail per department, deep-linked to K7 and K8", () => {
    const sc = new Scenario().toReview();
    expect(sc.mails("informed").map((m) => [m.to.join(), m.link])).toEqual([
      ["u-cus", `/cases/${sc.id}?tab=questionnaire&s=K7`],
      ["u-leg", `/cases/${sc.id}?tab=questionnaire&s=K8`],
    ]);
  });
});

describe("a supplier window stays on the supplier side", () => {
  it("a deactivated contact keeps its persona; a removed one becomes the first active contact; internal ids do not fall to a supplier", () => {
    const sc = new Scenario().create();
    sc.step("deactivate Ravi", (s, at) => M.setContactActive(s, "u-admin", "u-sup-2", false, undefined, at));
    expect(keepPersonaId(sc.s, "sup:u-sup-2")).toBe("sup:u-sup-2");
    expect(personaOf(sc.s, "sup:u-sup-2")).toMatchObject({ side: "supplier", userId: "u-sup-2" });
    expect(keepPersonaId(sc.s, "sup:u-gone")).toBe("sup:u-sup-1");
    expect(keepPersonaId(sc.s, "rmm")).toBe("rmm");
    expect(keepPersonaId(sc.s, "nobody")).toBeUndefined();
    // and the deactivated contact can do nothing
    expect(sc.refused("Ravi answers", (s, at) => A.setAnswer(s, "u-sup-2", sc.id, "FLD-GEN-004", "x", at))).toMatch(/no longer active|not a contact/);
  });
});
