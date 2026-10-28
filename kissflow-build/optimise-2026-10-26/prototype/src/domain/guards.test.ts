import { describe, expect, it } from "vitest";
import * as A from "./actions";
import { wasRefused } from "./core";
import { checkInvariants } from "./invariants";
import { can, check, type Capability } from "./permissions";
import { buildSeed } from "./seed";
import { Scenario } from "./testkit";
import type { AppState, CiqCase, Phase } from "./types";

type P = "supplier-input" | "review" | "final-release" | "completed" | "cancelled";
const PHASES: P[] = ["supplier-input", "review", "final-release", "completed", "cancelled"];

/** One fresh case per phase, from the empty start. In supplier-input everything is filled in but not yet confirmed. */
function inPhase(p: P): Scenario {
  const sc = new Scenario().create().metadata().fillMandatory();
  if (p === "supplier-input") return sc;
  sc.confirm();
  if (p === "review") return sc;
  if (p === "cancelled") return sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "Project stopped", at));
  sc.completeAll();
  if (p === "final-release") return sc;
  return sc.release();
}

type Act = { name: string; run: (s: AppState, id: string, at: string) => AppState; ok: P[] };

const ACTIONS: Act[] = [
  // Thomas, 15 Oct: the questionnaire is locked once the final release is requested (B-04).
  { name: "supplier changes an answer", run: (s, id, at) => A.setAnswer(s, "u-sup-1", id, "FLD-GEN-004", "New address", at), ok: ["supplier-input", "review"] },
  { name: "RMM changes an answer", run: (s, id, at) => A.setAnswer(s, "u-rmm", id, "FLD-GEN-004", "New address", at), ok: [] },
  { name: "supplier changes a metadata answer", run: (s, id, at) => A.saveConfig(s, "u-sup-2", id, { SF02: true }, at), ok: ["supplier-input", "review"] },
  { name: "supplier uploads", run: (s, id, at) => A.uploadDocument(s, "u-sup-2", id, { name: "extra.pdf", kind: "Other", sectionId: "K1" }, at).state, ok: ["supplier-input", "review"] },
  { name: "supplier writes a justification", run: (s, id, at) => A.setJustification(s, "u-sup-1", id, "K6.8", "Not halal certified yet.", at), ok: ["supplier-input", "review"] },
  { name: "supplier changes the K2.1 rows", run: (s, id, at) => A.setComponents(s, "u-sup-1", id, [], at), ok: ["supplier-input", "review"] },
  { name: "supplier confirms completeness", run: (s, id, at) => A.confirmCompleteness(s, "u-sup-1", id, at), ok: ["supplier-input"] },
  { name: "RMM confirms completeness", run: (s, id, at) => A.confirmCompleteness(s, "u-rmm", id, at), ok: [] },
  { name: "Regulatory raises a query", run: (s, id, at) => A.raiseOpenPoint(s, "u-reg", id, { dept: "REG", kind: "query", ref: { sectionId: "K1", label: "K1" }, question: "Q?", justification: "J", dueDate: "2026-12-01T00:00:00.000Z" }, at), ok: ["review"] },
  { name: "Safety raises on Regulatory's track", run: (s, id, at) => A.raiseOpenPoint(s, "u-saf", id, { dept: "REG", kind: "query", ref: { sectionId: "K1", label: "K1" }, question: "Q?", justification: "J", dueDate: "2026-12-01T00:00:00.000Z" }, at), ok: [] },
  { name: "Microbiology completes", run: (s, id, at) => A.completeReview(s, "u-mic", id, "MIC", at), ok: ["review"] },
  { name: "QM completes Microbiology's review", run: (s, id, at) => A.completeReview(s, "u-qm", id, "MIC", at), ok: [] },
  { name: "supplier completes a review", run: (s, id, at) => A.completeReview(s, "u-sup-1", id, "MIC", at), ok: [] },
  { name: "Safety adds a section", run: (s, id, at) => A.extendScope(s, "u-saf", id, "A4", "MOAH risk from the refining", at), ok: ["review"] },
  { name: "QM reopens its review", run: (s, id, at) => A.reopenReview(s, "u-qm", id, "QM", "New CoA", at), ok: ["final-release"] },
  { name: "supplier gives the final release", run: (s, id, at) => A.finalRelease(s, "u-sup-1", id, at), ok: ["final-release"] },
  { name: "RMM gives the final release", run: (s, id, at) => A.finalRelease(s, "u-rmm", id, at), ok: [] },
  { name: "RMM cancels", run: (s, id, at) => A.cancelCase(s, "u-rmm", id, "Not needed any more", at), ok: ["supplier-input", "review", "final-release"] },
  { name: "Regulatory cancels", run: (s, id, at) => A.cancelCase(s, "u-reg", id, "Not needed any more", at), ok: [] },
  { name: "RMM reactivates", run: (s, id, at) => A.reactivateCase(s, "u-rmm", id, "The project restarts.", at), ok: ["cancelled"] },
  { name: "Customs posts an internal note", run: (s, id, at) => A.addInternalNote(s, "u-cus", id, "HS code 1515 30", undefined, at), ok: ["supplier-input", "review", "final-release"] },
  { name: "the administrator posts an internal note", run: (s, id, at) => A.addInternalNote(s, "u-admin", id, "A note", undefined, at), ok: [] },
  { name: "the auditor posts an internal note", run: (s, id, at) => A.addInternalNote(s, "u-auditor", id, "A note", undefined, at), ok: [] },
  { name: "supplier reports a change", run: (s, id, at) => A.reportChange(s, "u-sup-1", id, "New production site from 2027.", at), ok: ["completed"] },
  { name: "RMM changes the case contacts", run: (s, id, at) => A.updateCaseContacts(s, "u-rmm", id, ["u-sup-2"], at), ok: ["supplier-input", "review", "final-release"] },
];

/** The case without the parts a refusal may touch (the audit logs a frozen attempt; toasts explain). */
const data = (c: CiqCase) => ({ ...c, audit: undefined });

describe("guard matrix: phase × action × actor", () => {
  const cases = Object.fromEntries(PHASES.map((p) => [p, inPhase(p)])) as Record<P, Scenario>;

  it("builds one consistent case per phase", () => {
    for (const p of PHASES) {
      expect(cases[p].c.phase).toBe(p as Phase);
      expect(checkInvariants(cases[p].s)).toEqual([]);
    }
  });

  for (const a of ACTIONS)
    for (const p of PHASES)
      it(`${a.name} in ${p}: ${a.ok.includes(p) ? "allowed" : "refused"}`, () => {
        const sc = cases[p];
        const at = new Date(sc.t + 3_600_000).toISOString();
        const next = a.run(sc.s, sc.id, at);
        const refused = wasRefused(sc.s, next);
        expect(refused, next.toasts.at(-1)?.text).toBe(!a.ok.includes(p));
        if (refused) expect(data(next.cases.find((c) => c.id === sc.id)!)).toEqual(data(sc.c));
        expect(checkInvariants(next)).toEqual([]);
      });

  it("a change attempt on a locked (final release requested), frozen or cancelled CIQ is refused AND logged", () => {
    for (const p of ["final-release", "completed", "cancelled"] as const) {
      const sc = cases[p];
      const next = A.setAnswer(sc.s, "u-sup-1", sc.id, "FLD-GEN-004", "New address", new Date(sc.t + 3_600_000).toISOString());
      const c = next.cases.find((x) => x.id === sc.id)!;
      expect(c.audit.at(-1)).toMatchObject({ action: "Change attempt refused", by: "u-sup-1" });
      expect(c.answers).toEqual(sc.c.answers);
      expect(next.toasts.at(-1)).toMatchObject({ tone: "danger", refusal: true });
    }
  });
});

describe("capabilities per role", () => {
  const s = buildSeed();
  const ROLES = ["u-rmm", "u-reg", "u-saf", "u-qm", "u-mic", "u-sus", "u-cus", "u-leg", "u-admin", "u-auditor", "u-owner", "u-sup-1"];
  const who = (cap: Capability) => ROLES.filter((u) => can(s, u, cap));

  it("case management is RMM's; only the administrator maintains the supplier master, RMM looks it up; the configuration is the administrator's", () => {
    expect(who("case.create")).toEqual(["u-rmm"]);
    expect(who("case.cancel")).toEqual(["u-rmm"]);
    expect(who("case.reactivate")).toEqual(["u-rmm"]);
    expect(who("supplier.manage")).toEqual(["u-admin"]);
    expect(who("supplier.view")).toEqual(["u-rmm", "u-admin"]);
    expect(check(s, "u-rmm", "supplier.manage")).toBe("Only the business administrator maintains the supplier master.");
    expect(who("config.manage")).toEqual(["u-admin"]);
    expect(who("reminders.run")).toEqual(["u-admin"]);
  });

  it("internal notes: everyone internal except the administrator, the business owner and the auditor", () => {
    expect(who("note.add")).toEqual(["u-rmm", "u-reg", "u-saf", "u-qm", "u-mic", "u-sus", "u-cus", "u-leg"]);
  });

  it("only reviewing departments add sections; only internal users see the final document", () => {
    expect(who("scope.extend")).toEqual(["u-reg", "u-saf", "u-qm", "u-mic", "u-sus"]);
    expect(who("finalDocument.view")).toEqual(ROLES.filter((u) => u !== "u-sup-1"));
  });

  it("track actions belong to the track's department", () => {
    const sc = new Scenario().toReview();
    for (const dept of ["RMM", "REG", "SAF", "QM", "MIC", "SUS"] as const) {
      const allowed = ROLES.filter((u) => can(sc.s, u, "review.complete", sc.c, { dept }));
      expect(allowed).toEqual([Scenario.REVIEWER[dept]]);
    }
    expect(can(sc.s, "u-cus", "op.raise", sc.c, { dept: "REG" })).toBe(false);
  });

  it("a supplier contact sees only the cases it is named on", () => {
    const sc = new Scenario().create({ contactIds: ["u-sup-1"] });
    expect(can(sc.s, "u-sup-1", "case.view", sc.c)).toBe(true);
    expect(can(sc.s, "u-sup-2", "case.view", sc.c)).toBe(false);
    expect(can(sc.s, "u-sup-2", "ciq.edit", sc.c)).toBe(false);
    expect(sc.refused("not named", (st, at) => A.setAnswer(st, "u-sup-2", sc.id, "FLD-GEN-004", "x", at))).toMatch(/not a contact on this request/);
    for (const u of ROLES.slice(0, -1)) expect(can(sc.s, u, "case.view", sc.c)).toBe(true);
    // A legacy live-portal case (no liveScope) stays visible to every contact of the supplier.
    expect(can(sc.s, "u-sup-2", "case.view", { ...sc.c, liveScope: undefined })).toBe(true);
  });
});
