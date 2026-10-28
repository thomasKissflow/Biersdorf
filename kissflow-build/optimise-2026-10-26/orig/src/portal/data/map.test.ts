// The v5 mapping: live portal items → the prototype's own flow, checked against the canonical cases the fixtures
// were made from (the domain's actions on the demo's fictional Solvaro data).
import { describe, expect, it } from "vitest";
import { completenessBlockers, releaseBlockers, supplierTasks } from "@/domain/selectors";
import { requestedDocuments } from "@/domain/requestedDocs";
import { STEPS } from "../kf/portal";
import { PORTAL_USERS, fixtureSet, loadedFor } from "./fixtures";
import { caseContactsOf, emptyNotes, groupBundles, phaseOf, pointKeyOf, requestStepOf, toSupplierSide, type Loaded } from "./map";
import type { RawItem } from "./raw";

const who = (u: (typeof PORTAL_USERS)["elena"]) => ({ id: u._id, name: u.Name, email: u.Email });
const elena = who(PORTAL_USERS.elena);
const ravi = who(PORTAL_USERS.ravi);
const sideOf = (loaded: Loaded[] = loadedFor(elena.id), me = elena, local = emptyNotes(), now?: Date) => toSupplierSide(groupBundles(loaded), me, local, now);
const caseOf = (code: string, loaded?: Loaded[], me = elena) => sideOf(loaded, me).cases.find((c) => c.id === code)!;
/** The Elena view with one item changed. */
const patched = (id: string, over: Record<string, unknown>) => loadedFor(elena.id).map((l) => (l.item._id === id ? { ...l, item: { ...l.item, ...over } } : l));
const without = (...ids: string[]) => loadedFor(elena.id).filter((l) => !ids.includes(l.item._id));

describe("phase (request step, Case_Phase_Label, release task, Request_Locked)", () => {
  it("maps every fixture case to the prototype's phase", () => {
    const phases = Object.fromEntries(sideOf().cases.map((c) => [c.id, c.phase]));
    expect(phases).toEqual({ "ZZT-0001": "supplier-input", "ZZT-0002": "supplier-input", "ZZT-0003": "review", "ZZT-0004": "final-release", "ZZT-0005": "completed", "ZZT-0006": "cancelled" });
    expect(sideOf().cases.every((c) => c.liveScope === true)).toBe(true);
  });

  it("the step is the truth for Part 1 vs Part 2, even while the service's label lags", () => {
    const b = groupBundles(patched("PkReq2", { _current_step: STEPS.keep.name, Case_Phase_Label: "Filling in" })).find((x) => x.code === "ZZT-0002")!;
    expect(phaseOf(b)).toBe("review");
  });

  it("is the final release while a release task exists, also before the label says so", () => {
    expect(caseOf("ZZT-0004", patched("PkReq4", { Case_Phase_Label: "With Beiersdorf" })).phase).toBe("final-release");
  });

  it("a locked request is completed or cancelled by its label; a release given here shows completed until the lock", () => {
    expect(caseOf("ZZT-0006").cancelled?.fromPhase).toBe("review");
    const local = emptyNotes();
    local.releases.set("ZZT-0004", { type: "final-release", by: elena.id, name: elena.name, email: elena.email, role: "", at: "2026-10-15T10:00:00Z", reviewVersion: 1 });
    const c = sideOf(without("PkRel4"), elena, local).cases.find((x) => x.id === "ZZT-0004")!;
    expect(c.phase).toBe("completed");
    expect(c.confirmations.some((x) => x.type === "final-release" && x.by === elena.id)).toBe(true);
  });

  it("the request locked at the final release (Thomas, 15 Oct) is still the final release, not closed", () => {
    const side = sideOf();
    expect(side.cases.find((c) => c.id === "ZZT-0004")!.phase).toBe("final-release");
    expect(side.extras.get("ZZT-0004")).toMatchObject({ locked: true, closed: false });
    // also without the release task in the list (the label and the lock say so)
    expect(caseOf("ZZT-0004", without("PkRel4")).phase).toBe("final-release");
    // the request's own release step wins over any label (16 Oct)
    expect(caseOf("ZZT-0004", patched("PkReq4", { Case_Phase_Label: "With Beiersdorf" })).phase).toBe("final-release");
    // a request locked under another label at "keep the CIQ up to date" (an older item) is closed, as before
    expect(caseOf("ZZT-0003", patched("PkReq3", { Request_Locked: "Yes", Case_Phase_Label: "With Beiersdorf" })).phase).toBe("cancelled");
    // the other requests: open ones are not locked; the completed and cancelled ones are locked and closed
    expect(side.extras.get("ZZT-0003")).toMatchObject({ locked: false, closed: false });
    expect(side.extras.get("ZZT-0005")).toMatchObject({ locked: true, closed: true });
    expect(side.extras.get("ZZT-0006")).toMatchObject({ locked: true, closed: true });
  });

  it("reads the step from the item, else from where My tasks listed it, else from the completeness fields", () => {
    expect(requestStepOf({ _id: "x", _current_context: [{ _context_activity_id: STEPS.keep.activity }] })).toBe("keep");
    expect(requestStepOf({ _id: "x" }, ["fill"])).toBe("fill");
    expect(requestStepOf({ _id: "x", Completeness_Confirm: "Confirmed" }, ["fill", "keep"])).toBe("keep");
  });
});

describe("the CIQ on the request", () => {
  const fx = fixtureSet();

  it("round-trips the supplier's answers, metadata, rows and justifications of the canonical case", () => {
    const want = fx.cases["ZZT-0002"];
    const c = caseOf("ZZT-0002");
    expect(c.config).toEqual(want.config);
    expect(c.answers).toMatchObject(Object.fromEntries(Object.entries(want.answers).filter(([k]) => !k.startsWith("FLD-K1"))));
    expect(c.components).toEqual(want.components);
    expect(c.justifications).toEqual(want.justifications);
    expect(completenessBlockers(c, sideOf().config)).toEqual([]);
    expect(c.scope.map((s) => [s.sectionId, s.applicability])).toEqual(want.scope.map((s) => [s.sectionId, s.applicability]));
  });

  it("shows the Beiersdorf-set values (BDF_Set_JSON) and SF-11 locked, whatever Answers_JSON says (B-05)", () => {
    const c = caseOf("ZZT-0002", patched("PkReq2", { Answers_JSON: JSON.stringify({ "FLD-GEN-001": "changed by someone" }) }));
    expect(c.answers["FLD-GEN-001"]).toBe("SOLVASOFT 300");
    expect(c.answers["FLD-GEN-002"]).toBe("Solvaro Oleochemicals S.A.");
    expect(c.config.SF11).toEqual(["EU"]);
  });

  it("attributes every answer to the contact who saved it (Answered_By_JSON: name, e-mail, time)", () => {
    const c = caseOf("ZZT-0002");
    const bys = new Set(Object.values(c.answeredBy).map((a) => a.by));
    expect([...bys].sort()).toEqual(["UsElena", "UsRavi"]);
  });

  it("files are the Uploads rows; a file question is answered by its latest upload", () => {
    const want = fx.cases["ZZT-0002"];
    const c = caseOf("ZZT-0002");
    expect(c.documents.map((d) => [d.id, d.name, d.sectionId, d.fieldId])).toEqual(want.documents.map((d) => [d.id, d.name, d.sectionId, d.fieldId]));
    expect(c.answers["FLD-K1-001"]).toBe(want.answers["FLD-K1-001"]);
  });

  it("after the completeness confirmation, the requested documents are the stored list (grow-only)", () => {
    const c = caseOf("ZZT-0003");
    expect(c.confirmations.find((x) => x.type === "completeness")).toMatchObject({ name: "Elena Márquez", email: elena.email });
    expect(requestedDocuments(c, sideOf().config).map((s) => s.key)).toEqual(requestedDocuments(fx.cases["ZZT-0003"], fx.state.config).map((s) => s.key));
  });

  it("knows who may confirm (Case_Contacts_JSON mayConfirm; B-11)", () => {
    const users = sideOf().users;
    expect(users.find((u) => u.id === "UsElena")?.mayConfirm).not.toBe(false);
    expect(users.find((u) => u.id === "UsRavi")?.mayConfirm).toBe(false);
    expect(caseOf("ZZT-0002").supplierContactIds).toEqual(["UsElena", "UsRavi"]);
  });

  it("lists the tasks of A-32: fill in, one per open question, the final release", () => {
    const side = sideOf();
    const tasks = supplierTasks({ ...fx.state, cases: side.cases, users: side.users }, side.suppliers[0].id, elena.id).map((t) => `${t.caseId}:${t.kind}`);
    expect(tasks.sort()).toEqual(["ZZT-0001:questionnaire", "ZZT-0002:questionnaire", "ZZT-0003:query", "ZZT-0003:query", "ZZT-0004:final-release"].sort());
  });

  it("has nothing blocking the release of the case awaiting it (B-33)", () => {
    expect(releaseBlockers(caseOf("ZZT-0004"), sideOf().config)).toEqual([]);
  });
});

describe("questions (Questions_History_JSON + the open CIQP Query rounds)", () => {
  const ops = () => caseOf("ZZT-0003").openPoints;

  it("open while the round is my task; a returned round reads 'more information needed'; closed with its outcome", () => {
    const byQ = Object.fromEntries(ops().map((p) => [p.question.slice(0, 20), p]));
    expect(Object.values(byQ).map((p) => p.status).sort()).toEqual(["closed", "open", "open"]);
    const returned = ops().find((p) => p.rounds === 2)!;
    expect(returned.thread.at(-1)?.action).toBe("returned");
    expect(ops().find((p) => p.status === "closed")?.outcome).toBe("accepted");
  });

  it("an answered round (no task any more, history not yet written back) is 'with Beiersdorf'", () => {
    const loaded = without("PkQ3a");
    const op = caseOf("ZZT-0003", loaded).openPoints.find((p) => p.rounds === 1 && p.status !== "closed")!;
    expect(op.status).toBe("in-progress");
  });

  it("shows the answer sent from this page until the history has it", () => {
    const local = emptyNotes();
    const op0 = ops().find((p) => p.rounds === 1 && p.status === "open")!;
    local.answers.set(op0.id, { id: "x", at: "2099-01-01T00:00:00Z", by: elena.id, side: "supplier", text: "Twelve months.", action: "answered" });
    const op = sideOf(without("PkQ3a"), elena, local).cases.find((c) => c.id === "ZZT-0003")!.openPoints.find((p) => p.id === op0.id)!;
    expect(op.thread.at(-1)?.text).toBe("Twelve months.");
  });

  it("a query the history doesn't list yet still shows, from the query itself", () => {
    const op = caseOf("ZZT-0003", patched("PkReq3", { Questions_History_JSON: "[]" })).openPoints.find((p) => p.rounds === 1 && p.status === "open")!;
    expect(op.thread.map((m) => m.action)).toEqual(["raised"]);
    expect(op.question).toMatch(/shelf life/);
  });

  it("'Changed by Beiersdorf' when the service marks an open query edited (Edited_At, Edit_Note; B-17)", () => {
    const op = caseOf("ZZT-0003", patched("PkQ3a", { Edited_At: "2099-01-01T08:00:00Z", Edit_Note: "Changed by Beiersdorf: due date", Supplier_Due_Date: "2099-02-01" })).openPoints.find((p) => p.rounds === 1 && p.status === "open")!;
    expect(op.thread.at(-1)).toMatchObject({ action: "edited", text: "Changed by Beiersdorf: due date" });
    expect(op.dueDate).toBe("2099-02-01");
  });

  it("a withdrawn question is 'Closed, no answer needed'", () => {
    const hist = JSON.parse(String(fixtureSet().items.find((x) => x.item._id === "PkReq3")!.item.Questions_History_JSON));
    hist[0].status = "Closed, no answer needed";
    const op = caseOf("ZZT-0003", patched("PkReq3", { Questions_History_JSON: JSON.stringify(hist) }).filter((l) => l.item._id !== "PkQ3a")).openPoints.find((p) => p.id === hist[0].opId)!;
    expect(op).toMatchObject({ status: "closed", outcome: "withdrawn" });
  });

  it("reads the service's statusCode before the wording (plan v5 §3.1)", () => {
    const hist = JSON.parse(String(fixtureSet().items.find((x) => x.item._id === "PkReq3")!.item.Questions_History_JSON));
    const without = (codes: Record<string, unknown>) => {
      const h = hist.map((p: Record<string, unknown>, i: number) => (i === 0 ? { ...p, status: "Wording the portal does not know", ...codes } : p));
      return caseOf("ZZT-0003", patched("PkReq3", { Questions_History_JSON: JSON.stringify(h) }).filter((l) => l.item._id !== "PkQ3a")).openPoints.find((p) => p.id === hist[0].opId)!;
    };
    expect(without({ statusCode: "accepted" })).toMatchObject({ status: "closed", outcome: "accepted" });
    expect(without({ statusCode: "closed" })).toMatchObject({ status: "closed", outcome: "withdrawn" });
    expect(without({ statusCode: "withdrawn-with-case" })).toMatchObject({ status: "closed", outcome: "withdrawn", closeReason: "Case cancelled" });
    expect(without({ statusCode: "not-accepted" })).toMatchObject({ status: "closed", outcome: "not-accepted" });
    expect(without({ statusCode: "answered" })).toMatchObject({ status: "in-progress" });
  });

  it("takes the contact's title from Case_Contacts_JSON as the confirmation role", () => {
    expect(caseContactsOf({ _id: "r", Case_Contacts_JSON: JSON.stringify([{ id: "Us1", name: "Elena Márquez", email: "elena@example.com", title: "Regulatory Manager", mayConfirm: true }]) })[0]).toMatchObject({ role: "Regulatory Manager", mayConfirm: true });
  });

  it("matches a query round to its point by Query_Key without the round suffix", () => {
    expect(pointKeyOf({ _id: "x", Query_Key: "OP-0003-02-R2" })).toBe("OP-0003-02");
    expect(pointKeyOf({ _id: "x", Query_Key: "OP-0003-02|R2" })).toBe("OP-0003-02");
  });

  it("never names a rule, an SF code or the internal close reason in what the supplier reads (D-10)", () => {
    const text = JSON.stringify(caseOf("ZZT-0003").openPoints.map((p) => p.thread.map((m) => m.text)));
    expect(text).not.toMatch(/\bR-\d|SF-\d/);
  });
});

describe("change reports, presence, several suppliers", () => {
  it("lists the receipts, and a report without its receipt yet as pending (for 10 minutes, then as sent)", () => {
    const rows = patched("PkReq5", { Change_Report_Rev: 2, Change_Report_Text: "Second report", Change_Report_At: "2026-10-15T09:00:00Z", Change_Report_By_Email: elena.email });
    const soon = sideOf(rows, elena, emptyNotes(), new Date("2026-10-15T09:05:00Z"));
    const reports = soon.changeReports.filter((r) => r.caseId === "ZZT-0005");
    expect(reports.map((r) => r.text)).toEqual(["The antioxidant changes from batch 2611 on.", "Second report"]);
    expect(soon.extras.get("ZZT-0005")?.reportPending).toBe(true);
    expect(reports.at(-1)?.id).toBe("pending-2");
    // v6: no service writes receipts; after 10 minutes the report counts as sent and the next one can be written
    const later = sideOf(rows, elena, emptyNotes(), new Date("2026-10-15T09:20:00Z"));
    expect(later.extras.get("ZZT-0005")?.reportPending).toBe(false);
    expect(later.changeReports.filter((r) => r.caseId === "ZZT-0005").at(-1)?.id).toBe("sent-2");
    expect(sideOf().extras.get("ZZT-0005")?.reportPending).toBe(false);
  });

  it("shows who else saved in the last minutes (Editing_By / Editing_Since)", () => {
    const at = new Date("2026-10-15T10:00:00Z");
    const side = sideOf(patched("PkReq2", { Editing_By: ravi.email, Editing_Since: "2026-10-15T09:55:00Z" }), elena, emptyNotes(), at);
    expect(side.extras.get("ZZT-0002")?.editing).toMatchObject({ name: "Ravi Menon" });
    expect(sideOf(patched("PkReq2", { Editing_By: elena.email, Editing_Since: "2026-10-15T09:55:00Z" }), elena, emptyNotes(), at).extras.get("ZZT-0002")?.editing).toBeUndefined();
  });

  it("shows the requests of several suppliers together (a builder testing) instead of hiding some", () => {
    const other: RawItem = { ...loadedFor(elena.id).find((l) => l.item._id === "PkReq1")!.item, _id: "PkOther", Case_Code: "ZZT-0099", Supplier_Code: "SUP-ZZT-OTHER", Supplier_Display_Name: "Other Test Supplier" };
    const side = sideOf([...loadedFor(elena.id), { flow: "request", item: other, listedAt: ["fill"] }]);
    expect(side.suppliers).toHaveLength(1);
    expect(side.suppliers[0].name).toBe("Solvaro Oleochemicals S.A. / Other Test Supplier");
    expect(new Set(side.cases.map((c) => c.supplierId)).size).toBe(1);
  });

  it("warns, and shows the standard questionnaire, when a request has no pinned version yet", () => {
    const side = sideOf(patched("PkReq1", { Config_Bundle_JSON: "" }));
    expect(side.warnings.join(" ")).toMatch(/ZZT-0001: no pinned questionnaire version/);
    expect(side.cases.find((c) => c.id === "ZZT-0001")?.templateVersion).toBe("CIQ-2026 v1");
  });

  it("Ravi sees the same requests (nothing depends on having acted on them), the release step included (16 Oct)", () => {
    const side = sideOf(loadedFor(ravi.id), ravi);
    expect(side.cases.map((c) => c.id).sort()).toEqual(sideOf().cases.map((c) => c.id).sort());
    expect(side.cases.find((c) => c.id === "ZZT-0004")?.phase).toBe("final-release");
    // he holds the release step (Release_Contacts = every contact); the screen lets only Elena give it (B-11)
    expect(side.extras.get("ZZT-0004")?.releaseId).toBe("PkReq4");
  });
});
