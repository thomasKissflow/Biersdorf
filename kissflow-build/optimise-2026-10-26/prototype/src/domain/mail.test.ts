import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { SECTION_BY_ID } from "./catalog";
import { internalStrings } from "./invariants";
import { isUnread, mailsFor, markAllMailsRead, markMailRead, sendMail, unreadCount } from "./mail";
import { buildRichFixture } from "./richFixture";
import { Scenario, seedWithRegColleague } from "./testkit";
import type { Mail } from "./types";

const events = (ms: Mail[]) => ms.map((m) => m.event);

describe("mail recipients and counts (spec §2)", () => {
  it("invitation: one mail to every case contact, with a portal link", () => {
    const sc = new Scenario().create();
    expect(sc.mails()).toEqual([expect.objectContaining({ event: "invitation", channel: "task-notification", audience: "supplier", to: ["u-sup-1", "u-sup-2"], link: `/portal/case/${sc.id}`, readBy: [] })]);
    const one = new Scenario().create({ contactIds: ["u-sup-2"] });
    expect(one.mails()[0].to).toEqual(["u-sup-2"]);
  });

  it("completeness: review-assigned to every track assignee (RMM's included), informed to Customs and Legal", () => {
    const sc = new Scenario().toReview();
    const assigned = sc.mails("review-assigned");
    expect(assigned.map((m) => m.to[0]).sort()).toEqual(sc.c.reviews.map((r) => r.assigneeId).sort());
    expect(assigned.every((m) => m.to.length === 1 && m.audience === "internal" && m.link === `/review/${sc.id}`)).toBe(true);
    // One mail per informed department, each opening the case on its own section (K7, K8).
    expect(sc.mails("informed")).toEqual([
      expect.objectContaining({ to: ["u-cus"], link: `/cases/${sc.id}?tab=questionnaire&s=K7`, sectionId: "K7" }),
      expect.objectContaining({ to: ["u-leg"], link: `/cases/${sc.id}?tab=questionnaire&s=K8`, sectionId: "K8" }),
    ]);
  });

  it("open-point events go out on the open-point webhook channel; op-answered to the raiser plus the responsible (de-duplicated)", () => {
    const sc = new Scenario(seedWithRegColleague()).toReview();
    sc.raise("REG", "u-reg", "K1", "Please confirm the batch.", { responsibleId: "u-reg-2" });
    const a = sc.op().id;
    sc.raise("QM", "u-qm", "K1", "Please add the specification.");
    const b = sc.op().id;
    expect(sc.mails("op-raised").map((m) => [m.opId, m.to.join(), m.channel])).toEqual([
      [a, "u-sup-1,u-sup-2", "open-point-webhook"],
      [b, "u-sup-1,u-sup-2", "open-point-webhook"],
    ]);
    sc.answer(a).answer(b, "u-sup-2");
    expect(sc.mails("op-answered").map((m) => [m.opId, m.to.join(), m.audience])).toEqual([
      [a, "u-reg,u-reg-2", "internal"],
      [b, "u-qm", "internal"],
    ]);
    sc.decide(a, "u-reg", "return", "Please attach the CoA.").decide(b, "u-qm", "accept");
    expect(events(sc.mails().filter((m) => m.event.startsWith("op-")))).toEqual(["op-raised", "op-raised", "op-answered", "op-answered", "op-returned", "op-accepted"]);
    expect(sc.mails().filter((m) => m.event.startsWith("op-")).every((m) => m.channel === "open-point-webhook")).toBe(true);
  });

  it("exactly one release request after the last completion; a reopen withdraws it and the next completion sends it again", () => {
    const sc = new Scenario().toReview();
    sc.completeAll();
    expect(sc.c.phase).toBe("final-release");
    expect(sc.mails("release-requested")).toHaveLength(1);
    sc.step("reopen QM", (s, at) => A.reopenReview(s, "u-qm", sc.id, "QM", "New CoA to check", at));
    expect(sc.c.phase).toBe("review");
    expect(sc.mails("release-withdrawn")).toEqual([expect.objectContaining({ audience: "supplier", to: ["u-sup-1", "u-sup-2"] })]);
    sc.complete("QM", "u-qm");
    expect(sc.mails("release-requested")).toHaveLength(2);
  });

  it("the release sends a receipt to the contacts and the final-document mail to the RMM owner", () => {
    const sc = new Scenario().toReview().completeAll().release();
    expect(sc.mails("release-receipt")).toEqual([expect.objectContaining({ audience: "supplier", to: ["u-sup-1", "u-sup-2"] })]);
    expect(sc.mails("final-document")).toEqual([expect.objectContaining({ audience: "internal", channel: "final-document", to: ["u-rmm"], link: `/cases/${sc.id}?tab=final-document` })]);
  });

  it("data-changed goes to the tracks that use the section; a burst of changes is one mail", () => {
    const sc = new Scenario().toReview();
    const k1 = SECTION_BY_ID.K1;
    const users = sc.c.reviews.filter((r) => r.dept === "RMM" || r.dept === k1.lead || (k1.co as string[]).includes(r.dept)).map((r) => r.assigneeId);
    sc.step("new K1 document", (s, at) => A.uploadDocument(s, "u-sup-1", sc.id, { name: "CoA_batch_2410-002.pdf", kind: "CoA", sectionId: "K1", fieldId: "FLD-K1-002" }, at).state);
    let changed = sc.mails("data-changed");
    expect(changed).toHaveLength(1);
    expect(changed[0].to.sort()).toEqual([...new Set(users)].sort());
    expect(changed[0]).toMatchObject({ sectionId: "K1", audience: "internal" });
    expect(changed[0].body).toMatch(/new document CoA_batch_2410-002\.pdf/);
    // GEN is used by RMM only. Two quick changes by the same person merge into one unread mail; after 30 minutes a new one starts.
    const t = Date.parse(changed[0].at);
    let s = A.setAnswer(sc.s, "u-sup-1", sc.id, "FLD-GEN-004", "Solvaro Oleochemicals S.A.\nPolígono Sur, Tarragona", new Date(t + 10 * 60_000).toISOString());
    s = A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-005", "Plant Tarragona", new Date(t + 20 * 60_000).toISOString());
    changed = s.mails.filter((m) => m.event === "data-changed");
    expect(changed).toHaveLength(2);
    expect(changed[1]).toMatchObject({ to: ["u-rmm"], sectionId: "GEN" });
    expect(changed[1].body.split("\n")).toHaveLength(3);
    s = A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "Solvaro Oleochemicals S.A.", new Date(t + 80 * 60_000).toISOString());
    expect(s.mails.filter((m) => m.event === "data-changed")).toHaveLength(3);
    // The same value again is no change at all.
    expect(A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-004", "Solvaro Oleochemicals S.A.", new Date(t + 81 * 60_000).toISOString())).toBe(s);
  });

  it("Part 1 changes send no data-changed mail", () => {
    const sc = new Scenario().create().metadata().fillMandatory();
    expect(sc.mails("data-changed")).toEqual([]);
  });

  it("cancel and reactivate: one neutral mail to the contacts, one internal mail to the open tracks", () => {
    const sc = new Scenario().toReview();
    sc.raise("QM", "u-qm");
    sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "SECRET-CANCEL project stopped", at));
    const cancelled = sc.mails("cancelled");
    expect(cancelled.map((m) => m.audience)).toEqual(["supplier", "internal"]);
    expect(cancelled[0].body).not.toMatch(/SECRET-CANCEL/);
    expect(cancelled[1].body).toMatch(/SECRET-CANCEL/);
    expect(cancelled[1].to).not.toContain("u-rmm"); // the canceller is not told about their own action
    expect(sc.mails("op-closed")).toEqual([]); // no mail per withdrawn point
    sc.step("reactivate", (s, at) => A.reactivateCase(s, "u-rmm", sc.id, "The project restarts.", at));
    expect(sc.mails("reactivated").map((m) => m.audience)).toEqual(["supplier", "internal"]);
  });
});

describe("supplier mails never carry internal content (leak scan)", () => {
  it("after a run full of internal notes, RMES comments, findings, decisions and internal reasons", () => {
    const sc = new Scenario().toReview();
    const secrets = ["SECRET-NOTE price too high for the brand", "SECRET-RMES comment on the tox data", "SECRET-FINDING cadmium near the limit", "SECRET-DECISION endocrine data missing", "SECRET-CLOSE known from the audit", "SECRET-NOTACC answer insufficient", "SECRET-CONTINUE agreed with Safety"];
    sc.step("note", (s, at) => A.addInternalNote(s, "u-saf", sc.id, secrets[0], "K1", at));
    const cr = sc.c.rmes!.criteria.find((x) => x.dept === "SAF")!;
    sc.step("rmes negative", (s, at) => A.recordCriterion(s, "u-saf", sc.id, cr.id, "negative", secrets[1], at));
    sc.step("finding", (s, at) => A.addFinding(s, "u-saf", sc.id, cr.id, secrets[2], false, at));
    sc.raise("SAF", "u-saf", "K1", "Please send the tox summary.");
    sc.step("withdraw", (s, at) => A.closeOpenPoint(s, "u-saf", sc.id, sc.op().id, secrets[4], at));
    sc.raise("SAF", "u-saf", "K1", "Please send the endocrine screening.");
    sc.answer(sc.op().id).decide(sc.op().id, "u-saf", "not-accepted", secrets[5]);
    sc.rmes("SAF", "u-saf").decision("SAF", "u-saf", "rejected", secrets[3]);
    // An open finding blocks Safety's completion: it is closed once handled.
    sc.step("close finding", (s, at) => A.closeFinding(s, "u-saf", sc.id, sc.c.rmes!.findings.find((f) => f.text === secrets[2])!.id, at));
    sc.completeAll({ continueNote: secrets[6] });
    sc.release();
    expect(internalStrings(sc.c)).toEqual(expect.arrayContaining(secrets));
    const supplierMails = sc.s.mails.filter((m) => m.audience === "supplier");
    expect(supplierMails.length).toBeGreaterThan(5);
    for (const m of supplierMails) for (const t of secrets) expect(`${m.subject} ${m.body}`, `${m.event}: ${t}`).not.toContain(t.slice(0, 14));
    for (const m of supplierMails) expect(m.body).not.toMatch(/RMES|Rejected|Approved|finding|internal note/i);
    // Supplier mails only ever go to supplier contacts.
    for (const m of supplierMails) expect(m.to.every((id) => id.startsWith("u-sup-"))).toBe(true);
  });

  it("holds for the rich fixture too", () => {
    const s = buildRichFixture();
    for (const c of s.cases) {
      const secrets = internalStrings(c);
      for (const m of s.mails.filter((x) => x.caseId === c.id && x.audience === "supplier")) for (const t of secrets) expect(m.body.includes(t), `${m.id} ${t}`).toBe(false);
    }
  });
});

describe("inbox", () => {
  it("lists a person's mails newest first; read and unread are per person", () => {
    const sc = new Scenario().toReview();
    sc.raise("QM", "u-qm");
    const mine = mailsFor(sc.s, "u-sup-1");
    expect(events(mine)).toEqual(["op-raised", "invitation"]);
    expect(unreadCount(sc.s, "u-sup-1")).toBe(2);
    let s = markMailRead(sc.s, "u-sup-1", mine[0].id);
    expect(unreadCount(s, "u-sup-1")).toBe(1);
    expect(unreadCount(s, "u-sup-2")).toBe(2);
    expect(isUnread(s.mails.find((m) => m.id === mine[0].id)!, "u-sup-1")).toBe(false);
    s = markMailRead(s, "u-sup-1", mine[0].id, false);
    expect(unreadCount(s, "u-sup-1")).toBe(2);
    s = markMailRead(s, "u-rmm", mine[0].id); // not the recipient: no effect
    expect(s.mails.find((m) => m.id === mine[0].id)!.readBy).toEqual([]);
    s = markAllMailsRead(s, "u-sup-1");
    expect(unreadCount(s, "u-sup-1")).toBe(0);
    expect(unreadCount(s, "u-sup-2")).toBe(2);
  });

  it("sends nothing to unknown or deactivated users, nothing without recipients, and a keyed mail only once", () => {
    const sc = new Scenario();
    const d = { by: "system", event: "reminder" as const, audience: "internal" as const, subject: "x", body: "y", link: "/" };
    expect(sendMail(sc.s, { ...d, to: ["u-nobody"] }, "2026-10-14T09:00:00.000Z")).toBe(sc.s);
    const once = sendMail(sc.s, { ...d, to: ["u-rmm", "u-rmm"], key: "k1" }, "2026-10-14T09:00:00.000Z");
    expect(once.mails).toEqual([expect.objectContaining({ to: ["u-rmm"], id: "M-00001" })]);
    expect(sendMail(once, { ...d, to: ["u-rmm"], key: "k1" }, "2026-10-14T10:00:00.000Z")).toBe(once);
  });
});
