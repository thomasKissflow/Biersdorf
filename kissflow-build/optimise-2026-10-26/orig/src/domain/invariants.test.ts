import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { checkInvariants } from "./invariants";
import { mailsFor, unreadCount } from "./mail";
import { buildRichFixture } from "./richFixture";
import { buildSeed } from "./seed";
import { addSupplier } from "./suppliers";
import { Scenario } from "./testkit";
import type { AppState } from "./types";

const caseOf = (s: AppState, id: string) => s.cases.find((c) => c.id === id)!;
const patchCase = (s: AppState, id: string, patch: Record<string, unknown>): AppState => ({ ...s, cases: s.cases.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

describe("checkInvariants", () => {
  it("holds for the empty start and the rich fixture", () => {
    expect(checkInvariants(buildSeed())).toEqual([]);
    expect(checkInvariants(buildRichFixture())).toEqual([]);
  });

  it("holds after every step of the full demo flow from nothing (S1)", () => {
    // Every Scenario step runs checkInvariants and throws on a violation.
    const sc = new Scenario();
    sc.step("the administrator adds a supplier", (s, at) =>
      addSupplier(s, "u-admin", { name: "Brightwater Esters B.V.", duns: "550123987", country: "Netherlands", type: "manufacturer", contacts: [{ name: "Femke de Vries", email: "femke@brightwater.example" }] }, at).state,
    );
    sc.create();
    sc.metadata({ SF01: ["vegetable"], SF02: false, SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF08: true, SF09: false, SF10: false, SF12: false });
    sc.fillMandatory("u-sup-1", "u-sup-2").confirm("u-sup-2");
    expect(sc.c.phase).toBe("review");
    sc.raise("REG", "u-reg", "K2.1", "Please confirm the CAS number of component 1.", { ref: { sectionId: "K2.1", rowId: "c1", label: "K2.1 › component 1 › CAS number" } });
    const q1 = sc.op().id;
    sc.step("REG edits the due date", (s, at) => A.editOpenPoint(s, "u-reg", sc.id, q1, { dueDate: "2026-12-20T00:00:00.000Z" }, at));
    sc.answer(q1, "u-sup-2", "CAS 8001-25-0 is right.").decide(q1, "u-reg", "return", "Please attach the supplier's REACH certificate.");
    sc.answer(q1, "u-sup-1", "Certificate attached.", "REACH_certificate.pdf").decide(q1, "u-reg", "accept");
    sc.raise("RMM", "u-rmm", "GEN", "Please confirm the production site address.");
    const q2 = sc.op().id;
    sc.step("RMM withdraws", (s, at) => A.closeOpenPoint(s, "u-rmm", sc.id, q2, "Confirmed by phone", at));
    sc.step("Customs note", (s, at) => A.addInternalNote(s, "u-cus", sc.id, "HS code 1509 to be checked by the team.", "K7", at));
    sc.step("supplier changes an answer in review", (s, at) => A.setAnswer(s, "u-sup-1", sc.id, "FLD-GEN-005", "Plant Tarragona, Polígono Sur", at));
    sc.completeAll();
    expect(sc.c.phase).toBe("final-release");
    sc.release("u-sup-1");
    expect(sc.c.phase).toBe("completed");
    expect(sc.c.finalDocument?.threads).toHaveLength(2);
    // Inboxes after the run.
    expect(mailsFor(sc.s, "u-sup-1").map((m) => m.event)).toEqual(expect.arrayContaining(["invitation", "op-raised", "op-edited", "op-returned", "op-accepted", "op-closed", "release-requested", "release-receipt"]));
    expect(mailsFor(sc.s, "u-reg").map((m) => m.event)).toEqual(expect.arrayContaining(["review-assigned", "op-answered"]));
    expect(mailsFor(sc.s, "u-rmm").map((m) => m.event)).toEqual(expect.arrayContaining(["review-assigned", "data-changed", "final-document"]));
    expect(unreadCount(sc.s, "u-cus")).toBe(1);
    expect(sc.log.length).toBeGreaterThan(30);
  });

  it("detects broken states", () => {
    const sc = new Scenario().toReview();
    sc.raise("QM", "u-qm");
    const op = sc.op();
    const id = sc.id;
    const broken: [string, AppState][] = [
      ["final-release with an unresolved open point", patchCase(sc.s, id, { phase: "final-release", reviews: caseOf(sc.s, id).reviews.map((r) => ({ ...r, status: "completed" })) })],
      ["completed without a final document", patchCase(sc.s, id, { phase: "completed" })],
      ["waits for the supplier without an open point", patchCase(sc.s, id, { openPoints: [{ ...op, status: "closed", outcome: "withdrawn" }] })],
      ["belongs to SUS, which has no track", patchCase(sc.s, id, { reviews: caseOf(sc.s, id).reviews.filter((r) => r.dept !== "SUS"), openPoints: [{ ...op, dept: "SUS" }] })],
      ["is unresolved on the N.A. section", patchCase(sc.s, id, { openPoints: [{ ...op, ref: { sectionId: "A4", label: "A4" } }] })],
      ["contains internal text", { ...patchCase(sc.s, id, { internalNotes: [{ id: "n1", at: op.createdAt, by: "u-qm", text: "Confidential pricing remark" }] }), mails: [...sc.s.mails, { ...sc.s.mails.at(-1)!, id: "M-99999", body: "Confidential pricing remark" }] }],
      ["goes to the internal user", { ...sc.s, mails: [...sc.s.mails, { ...sc.s.mails.at(-1)!, id: "M-99998", to: ["u-rmm"] }] }],
      ["open case without an active contact", { ...sc.s, users: sc.s.users.map((u) => (u.side === "supplier" ? { ...u, active: false } : u)) }],
      ["no actor or no ISO time", patchCase(sc.s, id, { audit: [...caseOf(sc.s, id).audit, { id: `${id}-a999`, at: "yesterday", by: "", action: "x", detail: "" }] })],
      ["share a DUNS", { ...sc.s, suppliers: [...sc.s.suppliers, { ...sc.s.suppliers[0], id: "s2", name: "Copy" }] }],
    ];
    for (const [needle, s] of broken) expect(checkInvariants(s).join("\n"), needle).toContain(needle);
  });

  it("a final document that no longer matches its fingerprint is reported", () => {
    const sc = new Scenario().toReview().completeAll().release();
    const d = sc.c.finalDocument!;
    const tampered = patchCase(sc.s, sc.id, { finalDocument: { ...d, header: { ...d.header, materialName: "Other" } } });
    expect(checkInvariants(tampered)).toEqual([`${sc.id}: the final document does not match its fingerprint`]);
  });
});
