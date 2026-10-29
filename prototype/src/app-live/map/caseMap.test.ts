// The case (DESIGN §5.1): the 15 supplier-data fields parsed with the portal's readers, the phase table (G1), the phase
// history, confirmations, the supplier's side of the history, the configuration pin check, and the snapshot fallback.
import { describe, expect, it } from "vitest";
import { RMES_RECORD_LINE, RMES_UNREADABLE, rmesSheet } from "@/domain/rmesSheet";
import { completenessBlockers } from "@/domain/selectors";
import type { ReviewTrack } from "@/domain/types";
import type { RawItem } from "@/portal/data/raw";
import { LIST, STEPS, STEP_NAMES } from "../ids";
import { KF_USERS, appFixtures, fixtureInput, type FixtureCode } from "../testing/rawFixtures";
import type { LiveSnapshot } from "../types";
import type { AuditRow } from "./auditMap";
import { PIN_HASH, PIN_UNKNOWN, casePhase, caseStepOf, phaseHistoryOf } from "./caseMap";
import { toAppState } from "./toAppState";

const fx = appFixtures();
const row = (code: string, at: string): AuditRow => ({ row: { _id: `r-${code}-${at}` }, at, code, caseItemId: "x", caseCode: "", category: "", objectItemId: "", by: "system" });
const track = (dept: ReviewTrack["dept"], status: ReviewTrack["status"]): ReviewTrack => ({ dept, status, assigneeId: "u" });
const at = (activity: string, extra: Record<string, unknown> = {}): RawItem => ({ _id: "c", _status: "InProgress", _current_step: STEP_NAMES[activity], _created_at: "2026-10-01T08:00:00Z", ...extra });

/** toAppState with the snapshot changed first. */
function mapped(change: (s: LiveSnapshot) => void = () => {}, persona: Parameters<typeof fixtureInput>[0] = "rmm", mode: "full" | "role" = "full") {
  const x = fixtureInput(persona, mode);
  x.snap = structuredClone(x.snap);
  change(x.snap);
  return toAppState(x);
}
const caseOf = (m: ReturnType<typeof mapped>, code: FixtureCode | string) => m.state.cases.find((c) => c.id === code)!;

describe("phase (G1, DESIGN §5.1 order)", () => {
  it("maps every fixture case to the domain's phase", () => {
    const m = mapped();
    expect(Object.fromEntries(m.state.cases.map((c) => [c.id, c.phase]))).toEqual({ "ZZT-0001": "supplier-input", "ZZT-0003": "review", "ZZT-0005": "completed" });
  });

  it("(1) cancelled: the latest cancel/reactivate row, or Cancelled_At", () => {
    const rows = [row("case.cancelled", "2026-10-02T08:00:00Z")];
    expect(casePhase({ item: at(STEPS.case.release), readable: true, reviews: [], rows })).toBe("cancelled");
    expect(casePhase({ item: at(STEPS.case.release), readable: true, reviews: [], rows: [...rows, row("case.reactivated", "2026-10-03T08:00:00Z")] })).not.toBe("cancelled");
    expect(casePhase({ item: at(STEPS.case.waiting, { Cancelled_At: "2026-10-02T08:00:00Z" }), readable: true, reviews: [], rows: [] })).toBe("cancelled");
    expect(casePhase({ item: at(STEPS.case.waiting, { Cancelled_At: "2026-10-02T08:00:00Z", Reactivated_At: "2026-10-03T08:00:00Z" }), readable: true, reviews: [], rows: [] })).toBe("supplier-input");
  });

  it("(2) completed: Completed, at End, or Final_Release_At", () => {
    expect(casePhase({ item: { _id: "c", _status: "Completed" }, readable: true, reviews: [], rows: [] })).toBe("completed");
    expect(casePhase({ item: { _id: "c", _current_context: [{ _context_activity_id: STEPS.case.end }] }, readable: true, reviews: [], rows: [] })).toBe("completed");
    expect(casePhase({ item: at(STEPS.case.release, { Final_Release_At: "2026-10-05T08:00:00Z" }), readable: true, reviews: [], rows: [] })).toBe("completed");
  });

  it("(3) supplier-input: waiting/start without Case_Phase Review and Completeness_At; unreadable without reviews", () => {
    expect(casePhase({ item: at(STEPS.case.waiting), readable: true, reviews: [], rows: [] })).toBe("supplier-input");
    expect(casePhase({ item: at(STEPS.case.start), readable: true, reviews: [], rows: [] })).toBe("supplier-input");
    // I-2 wrote the completeness before it submitted the step
    expect(casePhase({ item: at(STEPS.case.waiting, { Case_Phase: LIST.phase.review }), readable: true, reviews: [], rows: [] })).toBe("review");
    expect(casePhase({ item: at(STEPS.case.waiting, { Completeness_At: "2026-10-02T08:00:00Z" }), readable: true, reviews: [], rows: [] })).toBe("review");
    expect(casePhase({ readable: false, reviews: [], rows: [] })).toBe("supplier-input");
    expect(casePhase({ readable: false, reviews: [track("RMM", "in-review")], rows: [] })).toBe("review");
    // an item read without its step (an admin list row): the reviews decide
    expect(casePhase({ item: { _id: "c" }, readable: false, reviews: [], rows: [] })).toBe("supplier-input");
    expect(casePhase({ item: { _id: "c" }, readable: false, reviews: [track("RMM", "in-review")], rows: [] })).toBe("review");
    // a live My items row: status and step only, no Case_Phase or Completeness_At (21 Oct). Absent is unknown there, so
    // a case in review still at "Waiting for supplier: CIQ" (I-2 could not submit the step, live 20 Oct) is in review
    const listed: RawItem = { _id: "c", Name: "CIQ Case from Katrin Vogel", _status: "InProgress", _current_step: STEP_NAMES[STEPS.case.waiting], _activity_id: STEPS.case.waiting, _modified_at: "2026-10-02T08:00:00Z" };
    expect(casePhase({ item: listed, readable: false, reviews: [track("RMM", "in-review")], rows: [] })).toBe("review");
    expect(casePhase({ item: listed, readable: false, reviews: [track("RMM", "completed")], rows: [] })).toBe("final-release");
    expect(casePhase({ item: listed, readable: false, reviews: [], rows: [] })).toBe("supplier-input");
    // its step still counts where it tells more: at "Beiersdorf review and final release" it is past the supplier's
    // input, reviews known or not (e.g. the history not read on this load); before: supplier-input
    const atRelease: RawItem = { ...listed, _current_step: STEP_NAMES[STEPS.case.release], _activity_id: STEPS.case.release };
    expect(casePhase({ item: atRelease, readable: false, reviews: [], rows: [] })).toBe("review");
    expect(casePhase({ item: atRelease, readable: false, reviews: [track("RMM", "completed")], rows: [] })).toBe("final-release");
    // read in full, a blank is a blank
    expect(casePhase({ item: at(STEPS.case.waiting), readable: true, reviews: [track("RMM", "in-review")], rows: [] })).toBe("supplier-input");
  });

  it("(4) final-release: every latest round completed, or the latest of release.requested / review.reopened is a request", () => {
    const done = [track("RMM", "completed"), track("QM", "completed")];
    expect(casePhase({ item: at(STEPS.case.release), readable: true, reviews: done, rows: [] })).toBe("final-release");
    const rows = [row("release.requested", "2026-10-04T08:00:00Z")];
    expect(casePhase({ readable: false, reviews: [track("RMM", "in-review")], rows })).toBe("final-release");
    expect(casePhase({ readable: false, reviews: [track("RMM", "reopened")], rows: [...rows, row("review.reopened", "2026-10-05T08:00:00Z")] })).toBe("review");
  });

  it("(5) review otherwise; the step from its name or from _current_context", () => {
    expect(casePhase({ item: at(STEPS.case.release), readable: true, reviews: [track("RMM", "in-review")], rows: [] })).toBe("review");
    expect(caseStepOf({ _id: "c", _current_context: [{ _context_activity_id: STEPS.case.waiting }] })).toBe("waiting");
    expect(caseStepOf({ _id: "c", _current_step: "Something else" })).toBeUndefined();
  });

  it("the phase history is never empty, oldest first, every stamp a date, ending in the current phase", () => {
    const h = phaseHistoryOf({ phase: "final-release", createdAt: "2026-10-01T08:00:00Z", item: at(STEPS.case.release, { Completeness_At: "2026-10-02T08:00:00Z" }), reviews: [], rows: [row("release.requested", "2026-10-04T08:00:00Z"), row("review.reopened", "2026-10-05T08:00:00Z"), row("release.requested", "2026-10-06T08:00:00Z")] });
    expect(h.map((p) => p.phase)).toEqual(["supplier-input", "review", "final-release", "review", "final-release"]);
    expect(phaseHistoryOf({ phase: "supplier-input", createdAt: "2026-10-01T08:00:00Z", reviews: [], rows: [] })).toEqual([{ phase: "supplier-input", at: "2026-10-01T08:00:00Z" }]);
    const odd = phaseHistoryOf({ phase: "review", createdAt: "2026-10-01T08:00:00Z", item: { _id: "c", _modified_at: "2026-10-03T08:00:00Z" }, reviews: [], rows: [] });
    expect(odd.at(-1)).toEqual({ phase: "review", at: "2026-10-03T08:00:00Z" });
  });

  it("the fixture cases' histories equal the domain's", () => {
    const m = mapped();
    for (const code of ["ZZT-0001", "ZZT-0003", "ZZT-0005"] as const) {
      const want = fx.cases[code].phaseHistory.map((p) => [p.phase, Date.parse(p.at)]);
      expect(caseOf(m, code).phaseHistory.map((p) => [p.phase, Date.parse(p.at)])).toEqual(want);
    }
  });
});

describe("the supplier's data (the 15 synced fields)", () => {
  it("answers, attribution, components, justifications, documents and config equal the domain's", () => {
    const m = mapped();
    for (const code of ["ZZT-0001", "ZZT-0003", "ZZT-0005"] as const) {
      const got = caseOf(m, code);
      const want = fx.cases[code];
      expect(got.answers).toEqual(want.answers);
      expect(got.config).toEqual(want.config);
      expect(got.components).toEqual(want.components);
      expect(got.justifications).toEqual(want.justifications);
      // a pre-fill (M9) is "system" in the domain; the request carries the stamp of the contact whose metadata answer
      // opened its section (the supplier's screen saves both together; fixtures.ts requestItem)
      const saver = (v: { by: string; at: string }) => (v.by !== "system" ? v.by : Object.values(want.answeredBy).find((w) => w.at === v.at && w.by !== "system")!.by);
      expect(Object.fromEntries(Object.entries(got.answeredBy).map(([k, v]) => [k, [v.by, Date.parse(v.at)]]))).toEqual(Object.fromEntries(Object.entries(want.answeredBy).map(([k, v]) => [k, [saver(v), Date.parse(v.at)]])));
      expect(got.documents.map((d) => [d.id, d.name, d.kind, d.sectionId, d.fieldId, d.uploadedBy, Date.parse(d.uploadedAt)])).toEqual(want.documents.map((d) => [d.id, d.name, d.kind, d.sectionId, d.fieldId, d.uploadedBy, Date.parse(d.uploadedAt)]));
    }
  });

  it("the scope equals the domain's, with Beiersdorf's internal reasons restored (G8)", () => {
    const m = mapped();
    for (const code of ["ZZT-0001", "ZZT-0003", "ZZT-0005"] as const) expect(caseOf(m, code).scope).toEqual(fx.cases[code].scope);
    expect(caseOf(m, "ZZT-0003").scope.find((s) => s.sectionId === "GEN")!.reason).toMatch(/→ R-00/);
  });

  it("the completed case passes the domain's completeness check with its mapped data", () => {
    const m = mapped();
    expect(completenessBlockers(caseOf(m, "ZZT-0005"), m.state.config)).toEqual([]);
  });

  it("an unknown stamp e-mail becomes a mail: contact", () => {
    const m = mapped((s) => {
      const c = s.items.case.find((i) => i.Case_Code === "ZZT-0003")!;
      c.Answered_By_JSON = JSON.stringify({ "FLD-GEN-004": { name: "", email: "Someone.Else@solvaro.example", at: "2026-10-16T08:00:00Z" } });
    });
    expect(caseOf(m, "ZZT-0003").answeredBy["FLD-GEN-004"]).toEqual({ by: "mail:someone.else@solvaro.example", at: "2026-10-16T08:00:00Z" });
    expect(m.state.users.find((u) => u.id === "mail:someone.else@solvaro.example")).toMatchObject({ name: "Someone Else", side: "supplier", supplierId: "SUP-ZZT-SOLVARO" });
  });
});

describe("header, confirmations, history", () => {
  it("the header fields, contacts and dates", () => {
    const m = mapped();
    const got = caseOf(m, "ZZT-0003");
    const want = fx.cases["ZZT-0003"];
    expect([got.materialName, got.inci, got.materialNo, got.supplierId, got.manufacturer, got.ownerId, got.priority, got.templateVersion, got.ruleSetVersion, got.liveScope]).toEqual([want.materialName, want.inci, want.materialNo, "SUP-ZZT-SOLVARO", want.manufacturer, want.ownerId, want.priority, want.templateVersion, want.ruleSetVersion, true]);
    expect(got.supplierContactIds).toEqual(want.supplierContactIds);
    // m6: a Kissflow Date reads as the screens' own due instant (16:00 UTC, features/review/shared.tsx fromDateInput)
    expect(got.dueDate).toBe(`${want.dueDate.slice(0, 10)}T16:00:00.000Z`);
    expect(Date.parse(got.createdAt)).toBe(Date.parse(want.createdAt));
    expect(m.index.cases.get("ZZT-0003")).toEqual({ caseId: "ZZT-0003", itemId: "AppZZT-0003", cycleNo: 1, supplierCode: "SUP-ZZT-SOLVARO", portalRequestItemId: "PkReq3", releaseItemId: "PkCfgRelV1", readable: true, contacts: [{ id: "UsElena", name: "Elena Márquez", email: KF_USERS["u-sup-1"]!.Email }, { id: "UsRavi", name: "Ravi Menon", email: KF_USERS["u-sup-2"]!.Email }] });
  });

  it("confirmations: completeness, every department's completion, the final release", () => {
    const m = mapped();
    for (const code of ["ZZT-0003", "ZZT-0005"] as const) {
      const key = (k: { type: string; dept?: string; by: string; at: string; name: string; email: string }) => [k.type, k.dept, k.by, Date.parse(k.at), k.name, k.email];
      expect(caseOf(m, code).confirmations.map(key)).toEqual(fx.cases[code].confirmations.map(key));
    }
    expect(caseOf(m, "ZZT-0005").confirmations.at(-1)!.note).toBe(fx.cases["ZZT-0005"].confirmations.at(-1)!.note);
  });

  it("the history: the app's rows plus the supplier's side, numbered in time order", () => {
    const m = mapped();
    const c = caseOf(m, "ZZT-0005");
    expect(c.audit.map((e) => e.id)).toEqual(c.audit.map((_, i) => `ZZT-0005-a${i + 1}`));
    expect(c.audit.map((e) => Date.parse(e.at))).toEqual([...c.audit.map((e) => Date.parse(e.at))].sort((a, b) => a - b));
    const actions = c.audit.map((e) => e.action);
    for (const a of ["Created case", "Confirmed completeness", "Final Safety decision", "Completed RMM review", "All reviews completed", "Gave final release", "Reported a change after release"]) expect(actions).toContain(a);
    const c3 = caseOf(m, "ZZT-0003");
    // every supplier answer in a point's thread, the synthesized one included
    expect(c3.audit.filter((e) => e.action === "Answered query").map((e) => e.detail.slice(0, 10)).sort()).toEqual(["OP-0003-01", "OP-0003-02", "OP-0003-03"]);
  });

  it("the change report after the release (G6) and the computed final document (G4)", () => {
    const m = mapped();
    expect(m.state.changeReports).toEqual([{ id: "ZZT-0005-cr1", caseId: "ZZT-0005", at: "2026-10-19T19:00:00Z", by: "UsElena", text: "The antioxidant changes from batch 2611 on." }]);
    const fd = caseOf(m, "ZZT-0005").finalDocument!;
    expect(fd.trigger).toBe("Final release by Elena Márquez");
    expect(fd.sections.length).toBe(fx.cases["ZZT-0005"].finalDocument!.sections.length);
    expect(caseOf(m, "ZZT-0003").finalDocument).toBeUndefined();
  });

  it("the requested documents: stored once in review, derived when never written, absent before", () => {
    const m = mapped((s) => {
      const c = s.items.case.find((i) => i.Case_Code === "ZZT-0003")!;
      c.Requested_Docs_JSON = JSON.stringify([{ key: "EV:test-report", doc: "Test report", sectionId: "K1", why: "Asked for." }]);
    });
    expect(caseOf(m, "ZZT-0003").requestedDocs).toEqual([{ key: "EV:test-report", doc: "Test report", sectionId: "K1", ruleIds: [], why: "Asked for.", conditions: [] }]);
    expect(caseOf(m, "ZZT-0001").requestedDocs).toBeUndefined();
  });
});

describe("pins and unreadable cases", () => {
  it("a pair no release provides, or another manifest fingerprint: a banner", () => {
    const m = mapped((s) => {
      s.items.case.find((i) => i.Case_Code === "ZZT-0003")!.Rule_Set_Version = "RS-2099.9";
      s.items.case.find((i) => i.Case_Code === "ZZT-0005")!.Manifest_Hash = "f00";
    });
    // B1, B2: the banner in calm words; the versions and the release only in dev's notes, never a load warning
    expect(m.index.casePins?.get("ZZT-0003")).toBe(PIN_UNKNOWN);
    expect(m.index.casePins?.get("ZZT-0005")).toBe(PIN_HASH);
    expect(m.index.caseBanners.has("ZZT-0001")).toBe(false);
    expect(m.notes.some((n) => n.startsWith("ZZT-0003:") && /RS-2099\.9/.test(n))).toBe(true);
    expect(m.notes.some((n) => n.startsWith("ZZT-0005:") && /fingerprint/.test(n))).toBe(true);
    expect(m.warnings.some((w) => /RS-2099|fingerprint|pinned/.test(w))).toBe(false);
  });

  it("a case only its audit rows name: header from the case.created snapshot, banner, no answers but the BDF-set ones", () => {
    const m = mapped((s) => {
      s.items.case = s.items.case.filter((i) => i.Case_Code !== "ZZT-0003");
      s.unreadableCases["AppZZT-0003"] = "403 no permission";
    });
    const c = caseOf(m, "ZZT-0003");
    const want = fx.cases["ZZT-0003"];
    expect([c.materialName, c.ownerId, c.dueDate, c.phase, c.supplierContactIds.join()]).toEqual([want.materialName, want.ownerId, `${want.dueDate.slice(0, 10)}T16:00:00.000Z`, "review", want.supplierContactIds.join()]);
    expect(Object.keys(c.answers).sort()).toEqual(["FLD-GEN-001", "FLD-GEN-002", "FLD-GEN-003", "FLD-GEN-008", "FLD-GEN-009"]);
    expect(m.index.caseBanners.get("ZZT-0003")).toBe("Kissflow did not let your role read this case's questionnaire (403 no permission). You see its header, reviews and open points.");
    expect(m.index.cases.get("ZZT-0003")!.readable).toBe(false);
  });

  it("a case only a review item names still lists, from the review's own fields", () => {
    const m = mapped((s) => {
      s.items.case = s.items.case.filter((i) => i.Case_Code !== "ZZT-0003");
      s.forms.audit = s.forms.audit.filter((r) => r.Case_Code !== "ZZT-0003");
    });
    const c = caseOf(m, "ZZT-0003");
    expect([c.materialName, c.supplierId, c.phase]).toEqual([fx.cases["ZZT-0003"].materialName, "SUP-ZZT-SOLVARO", "review"]);
    expect(c.reviews.length).toBe(5); // RMM, REG, SAF, QM, MIC (no SF-09: no Sustainability track)
    expect(Number.isFinite(Date.parse(c.createdAt))).toBe(true);
  });
});

describe("the RMES sheet on the live-mapped case (domain/rmesSheet.ts, the same selector as the prototype)", () => {
  it("is filled from CIQ Case: Trade_Name / BDF_Set_JSON, Answers_JSON (FLD-GEN-004, the free texts) and Components_JSON", () => {
    const m = mapped(() => {}, "saf");
    const c = caseOf(m, "ZZT-0003");
    const want = fx.cases["ZZT-0003"];
    const live = rmesSheet(m.state, c, { readable: m.index.cases.get("ZZT-0003")!.readable });
    const proto = rmesSheet(fx.state, fx.state.cases.find((x) => x.id === want.id)!);
    expect(live.readable && proto.readable).toBe(true);
    if (!live.readable || !proto.readable) return;
    expect(live.record).toBe(RMES_RECORD_LINE("ZZT-0003"));
    expect(live.header.map((h) => [h.key, h.text, h.state])).toEqual(proto.header.map((h) => [h.key, h.text, h.state]));
    expect(live.header.find((h) => h.key === "manufacturer")!.text).toBe(String(want.answers["FLD-GEN-004"]));
    expect(live.rows).toEqual(proto.rows);
    expect(live.rows.length).toBeGreaterThan(0);
  });

  it("a case the role can't read: the one notice, never the case id as the trade name or the supplier as manufacturer", () => {
    const m = mapped((s) => {
      s.items.case = s.items.case.filter((i) => i.Case_Code !== "ZZT-0003");
      s.unreadableCases["AppZZT-0003"] = "403 no permission";
    }, "saf");
    const ref = m.index.cases.get("ZZT-0003")!;
    expect(ref.readable).toBe(false);
    expect(rmesSheet(m.state, caseOf(m, "ZZT-0003"), { readable: ref.readable })).toMatchObject({ readable: false, notice: RMES_UNREADABLE });
  });
});
