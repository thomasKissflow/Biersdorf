// One test per handler (plan v5 §8.2) against the fake. The e2e test covers H-01…H-03, H-05, H-07, H-11, H-16, H-21 in
// sequence; here each handler is checked on its own, including its refusals.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, toReview, completeAll, completeReview, lastRequest, fillFor, fillUntilComplete, PLAIN_CONFIG, D, FLOW, F, J } from "./helpers.mjs";

const C = "CIQ-2026-0001";
const CONTACTS = "elena.marquez@solvaro.example, ravi.menon@solvaro.example";
const ev = (h, mark) => h.outbox(C).slice(mark).map((r) => `${r.Event_Code} → ${r.To_Emails}`);
const raise = (h, by, dept, extra = {}) =>
  h.wb(by).request("op.raise", C, { dept, kind: "query", ref: { sectionId: "K2.2", fieldId: "FLD-A14-101", label: "K2.2 › Arsenic (As) content" }, question: "Please confirm the arsenic value.", justification: "Needed for the evaluation", dueDate: "2026-11-30T00:00:00.000Z", ...extra });

test("H-01 refuses an invalid case (the prototype's newCaseProblem) and creates nothing", async () => {
  const h = setup();
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C, Portal_Contact_Ids: "" });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /at least one contact/);
  assert.equal(h.caseRow(C), undefined);
  assert.equal(h.fake.rows(FLOW.request).length, 0);
});

test("H-02 Part 1: per-key attribution, live scope opens and closes, no mail; Part 2: debounced C-10 to the tracks using the section", async () => {
  const h = setup();
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  const mark = h.outbox(C).length;
  await h.sup("u-sup-1").save(C, { config: { ...PLAIN_CONFIG, SF07: true } });
  await h.run();
  assert.equal(h.ciq(C).scope.find((x) => x.sectionId === "A4").applicability, "mandatory");
  await h.sup("u-sup-2").save(C, { config: { SF07: false } });
  await h.run();
  const c = h.ciq(C);
  assert.equal(c.scope.find((x) => x.sectionId === "A4").applicability, "na", "Part 1: sections close again");
  assert.equal(c.answeredBy.SF07.by, "u-sup-2");
  assert.equal(c.answeredBy.SF01.by, "u-sup-1");
  assert.deepEqual(ev(h, mark), []);
  assert.equal(h.audit(C).filter((r) => r.Action_Code === "Scope follows answers").length, 2);
  // Part 2
  await fillUntilComplete(h, C);
  await h.sup("u-sup-1").confirmCompleteness(C);
  await h.run();
  const m2 = h.outbox(C).length;
  await h.sup("u-sup-2").save(C, { answers: { "FLD-A14-102": 0.07 } });
  await h.run();
  assert.deepEqual(ev(h, m2), [], "debounced");
  await h.sup("u-sup-2").save(C, { answers: { "FLD-A14-103": 1.2 } });
  await h.run();
  assert.equal(h.outbox(C).slice(m2).filter((r) => r.Event_Code === "data-changed").length, 0, "still within 10 min of the last change");
  h.tick(11 * 60_000);
  await h.run();
  const dc = h.outbox(C).slice(m2).filter((r) => r.Event_Code === "data-changed");
  assert.equal(dc.length, 1, "one merged mail for the burst");
  // K2.2: lead SAF, co QM; RMM reads every change (mail.ts dataChangedMail)
  assert.deepEqual(dc[0].To_Emails.split(", ").sort(), ["katrin.vogel@beiersdorf.example", "lena.krause@beiersdorf.example", "mira.hansen@beiersdorf.example"]);
  assert.equal(dc[0].Body_Text.split("\n").filter((l) => /content/.test(l)).length, 2);
  assert.ok(h.audit(C).filter((r) => r.Action_Code === "Changed answer after completeness").length >= 2);
});

test("H-03: a completeness the engine refuses does not move the case; the next save is checked again", async () => {
  const h = setup();
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  await h.sup("u-sup-1").save(C, { config: PLAIN_CONFIG });
  await h.run();
  await h.sup("u-sup-1").confirmCompleteness(C); // the portal UI let it through, but blockers remain
  await h.run();
  assert.equal(h.ciq(C).phase, "supplier-input");
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Completeness confirmation not applied"));
  assert.equal(h.item(item)._current_context[0]._context_current_step, "Waiting for supplier: CIQ");
  assert.equal(h.fake.rows(FLOW.review).length, 0);
  // the supplier fills the rest at "keep the CIQ up to date"; the next run applies the completeness
  const f = fillFor(h, C);
  await h.sup("u-sup-1").save(C, { answers: f.answers, justifications: f.justifications, uploads: f.uploads, components: f.components });
  await h.run();
  if (h.ciq(C).phase === "supplier-input") {
    const g = fillFor(h, C);
    await h.sup("u-sup-1").save(C, { answers: g.answers, justifications: g.justifications, uploads: g.uploads, ...(g.components ? { components: g.components } : {}) });
    await h.run();
  }
  assert.equal(h.ciq(C).phase, "review");
  assert.equal(h.ciq(C).confirmations.find((x) => x.type === "completeness").name, "Elena Márquez");
});

test("H-02 composition projection (L5, 28 Oct): an unanswered Additive is written empty, never \"No\"; Yes and No stay", async () => {
  const h = setup();
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  await h.sup("u-sup-1").save(C, { config: PLAIN_CONFIG });
  await h.run();
  const row = (id, additive, conc = { concMin: 1, concMax: 2 }) => ({ id, inci: `Component ${id}`, fn: "emollient", additive, origin: "vegetable", ...conc });
  await h.sup("u-sup-1").save(C, { components: [row("c1", true), row("c2", false), row("c3", null, { concMin: null, concMax: null })] });
  await h.run();
  const comps = h.ciq(C).components;
  assert.deepEqual(comps.map((r) => r.additive), [true, false, null]);
  assert.deepEqual([comps[2].concMin, comps[2].concMax], [null, null], "a blank concentration is never 0–0 (H1)");
  assert.ok(D.completenessBlockers(h.ciq(C), h.cfg()).some((b) => b.label === "Component 3: Additive: answer Yes or No"));
  const table = h.caseRow(C)[`Table::${F.caseData.components.table}`];
  assert.deepEqual(Object.fromEntries(table.map((r) => [r.Comp_Row_Id, r.Comp_Is_Additive ?? ""])), { c1: "Yes", c2: "No", c3: "" });
});

test("H-04: a department with a completed review cannot raise; RMM may ask on any section", async () => {
  const h = setup();
  await toReview(h, C);
  await completeReview(h, C, "QM");
  await raise(h, "u-qm", "QM");
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /Reopen it to ask/);
  await raise(h, "u-rmm", "RMM", { ref: { sectionId: "K6.1", label: "K6.1 · EU REACH" } });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.equal(h.opItem(C, "OP-0001-01")._current_context[0]._context_current_step, "Open point – RMM");
});

test("H-05: cannot provide is recorded as such and mailed to raiser + responsible once each", async () => {
  const h = setup();
  await toReview(h, C);
  await raise(h, "u-saf", "SAF", { responsibleId: "u-saf-2" });
  await h.run();
  const mark = h.outbox(C).length;
  await h.sup("u-sup-2").answer(C, "OP-0001-01", 1, { kind: "Cannot provide", text: "No batch analysis exists for this lot." });
  await h.run();
  const op = h.ciq(C).openPoints[0];
  assert.equal(op.thread.at(-1).action, "cannot-provide");
  assert.equal(op.thread.at(-1).by, "u-sup-2");
  assert.deepEqual(ev(h, mark), ["op-answered → mira.hansen@beiersdorf.example, ole.brandt@beiersdorf.example"]);
  assert.equal(h.opItem(C, "OP-0001-01").Response_Kind, "Cannot provide");
});

test("H-06: edit while open (query updated, C-08); edit after an answer (new round); close (query withdrawn, C-09); SAF not accepted → closed finding", async () => {
  const h = setup();
  await toReview(h, C);
  await raise(h, "u-saf", "SAF");
  await h.run();
  let mark = h.outbox(C).length;
  await h.wb("u-saf").request("op.edited", C, { opId: "OP-0001-01", patch: { dueDate: "2026-12-15T00:00:00.000Z" } }, "OP-0001-01");
  await h.run();
  const q1 = h.queryItem(C, "OP-0001-01", 1);
  assert.equal(q1.Supplier_Due_Date, "2026-12-15");
  assert.match(q1.Edit_Note, /due date/);
  assert.ok(q1.Edited_At);
  assert.deepEqual(ev(h, mark), [`op-edited → ${CONTACTS}`]);
  // answer, then the raiser changes the question: a new round
  await h.sup("u-sup-1").answer(C, "OP-0001-01", 1, { text: "0.05 mg/kg" });
  await h.run();
  mark = h.outbox(C).length;
  await h.wb("u-saf").request("op.edited", C, { opId: "OP-0001-01", patch: { question: "Please confirm the arsenic AND cadmium values." } }, "OP-0001-01");
  await h.run();
  assert.equal(h.ciq(C).openPoints[0].rounds, 2);
  assert.equal(h.queryItem(C, "OP-0001-01", 2).Question_Text, "Please confirm the arsenic AND cadmium values.");
  assert.match(h.outbox(C).at(-1).Body_Text, /Please answer the changed question/);
  // close while open: the open query is withdrawn, the supplier is told without the reason
  mark = h.outbox(C).length;
  await h.wb("u-saf").request("op.closed", C, { opId: "OP-0001-01", reason: "Covered by the new SDS (internal)." }, "OP-0001-01");
  await h.run();
  assert.equal(h.queryItem(C, "OP-0001-01", 2)._status, "Withdrawn");
  assert.equal(h.opItem(C, "OP-0001-01").OP_Outcome, "Withdrawn");
  assert.equal(h.opItem(C, "OP-0001-01").Outcome_Reason, "Covered by the new SDS (internal).");
  assert.deepEqual(ev(h, mark), [`op-closed → ${CONTACTS}`]);
  assert.ok(!h.outbox(C).at(-1).Body_Text.includes("internal"), "C-09 carries no reason");
  assert.ok(!h.requestItem(C).Questions_History_JSON.includes("Covered by the new SDS"));
  // a second point closed as not accepted → a closed finding in the Safety RMES row (B-16)
  await raise(h, "u-saf", "SAF", { question: "Please send the SDS rev. 7." });
  await h.run();
  await h.sup("u-sup-1").answer(C, "OP-0001-02", 1, { text: "Rev. 6 is current." });
  await h.run();
  await h.wb("u-saf").request("op.notaccepted", C, { opId: "OP-0001-02", text: "Rev. 6 lacks section 11." }, "OP-0001-02");
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const findings = h.fake.item(h.ledger(C).items["rmes:SAF"])["Table::Safety_Findings"];
  assert.equal(findings.length, 1);
  assert.equal(findings[0].Findings_State, "closed");
  assert.equal(findings[0].Findings_Linked_OP_Key, "OP-0001-02");
  assert.equal(h.opItem(C, "OP-0001-02").OP_Outcome, "Not accepted");
});

test("H-08: a completion the prototype refuses keeps the track open with a new review item and records why", async () => {
  const h = setup();
  await toReview(h, C);
  await raise(h, "u-qm", "QM", { ref: { sectionId: "K1", label: "K1 › CoA" } });
  await h.run();
  const first = h.reviewItem(C, "QM");
  const r = await completeReview(h, C, "QM"); // completes the item although its own point is open
  assert.equal(r.Request_Status, "Refused");
  assert.match(r.Result_Note, /Cannot complete: 1 open item/);
  const second = h.reviewItem(C, "QM");
  assert.notEqual(second._id, first._id);
  assert.equal(second.Round_No, 2);
  assert.equal(second.Activation_Kind, "Reactivated");
  assert.match(second.Activation_Reason, /Completion not accepted/);
  assert.equal(h.ciq(C).reviews.find((x) => x.dept === "QM").status, "waiting-supplier");
  assert.ok(h.audit(C).some((x) => x.Action_Code === "Review completion not accepted"));
});

test("H-08 by polling: a review item completed in the Workbench is applied even before its request", async () => {
  const h = setup();
  await toReview(h, C);
  const item = h.reviewItem(C, "MIC");
  await h.wb("u-mic").actAtStep(FLOW.review, item._id, { Review_Confirm: "Confirmed", Completed_By: { _id: "u-mic" } });
  await h.run();
  assert.equal(h.ciq(C).reviews.find((x) => x.dept === "MIC").status, "completed");
  await h.wb("u-mic").request("review.completed", C, { dept: "MIC" }, item._id);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done");
  assert.equal(h.audit(C).filter((x) => x.Action_Code === "Completed Microbiology review").length, 1, "applied once");
});

test("H-09/H-10: a reopen while the release is requested withdraws it (C-12) and starts a new review item", async () => {
  const h = setup();
  await toReview(h, C);
  assert.equal(h.requestItem(C).Request_Locked, "No", "open in review");
  await completeAll(h, C);
  const rel = h.releaseItem(C);
  assert.equal(rel._status, "InProgress");
  // H-08 (Thomas, 15 Oct): the release request locks the questionnaire
  assert.deepEqual([h.requestItem(C).Request_Locked, h.requestItem(C).Case_Phase_Label], ["Yes", "Awaiting your final release"]);
  const mark = h.outbox(C).length;
  await h.wb("u-qm").request("review.reopen", C, { dept: "QM", reason: "The CoA must be re-checked" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.equal(h.item(rel._id)._status, "Withdrawn");
  assert.equal(h.ciq(C).phase, "review");
  // H-10: the request is unlocked again
  assert.deepEqual([h.requestItem(C).Request_Locked, h.requestItem(C).Case_Phase_Label], ["No", "With Beiersdorf"]);
  const qm = h.reviewItem(C, "QM");
  assert.equal(qm.Activation_Kind, "Reopened");
  assert.equal(qm.Round_No, 2);
  assert.deepEqual(ev(h, mark), [`release-withdrawn → ${CONTACTS}`]);
  await completeReview(h, C, "QM");
  assert.equal(h.ciq(C).phase, "final-release");
  assert.notEqual(h.releaseItem(C)._id, rel._id);
  assert.equal(h.requestItem(C).Request_Locked, "Yes", "locked again at the second release request");
});

test("H-02 while locked for the final release (Thomas, 15 Oct): every change is refused and logged, nothing mirrored, no mail", async () => {
  const h = setup();
  await toReview(h, C);
  await completeAll(h, C);
  const row = h.caseRow(C);
  const before = { answers: row.Answers_JSON, just: row.Justifications_JSON, docs: (row["Table::CIQ_Case_Data_A00_Documents"] ?? []).length, comps: h.ciq(C).components };
  const mark = h.outbox(C).length;
  const amark = h.audit(C).length;
  // a save that still reaches the locked request (an older page, or one in flight when the lock landed)
  await h.sup("u-sup-2").save(C, { answers: { "FLD-GEN-005": "Plant 3, Reus" }, justifications: { "K6.8": "Not halal certified yet." }, components: [], uploads: [{ id: "UP-LATE-1", sectionId: "K1", fieldId: "FLD-K1-002", name: "late-CoA.pdf", kind: "CoA" }] });
  await h.run();
  const c = h.ciq(C);
  assert.equal(c.phase, "final-release");
  const after = h.caseRow(C);
  assert.deepEqual({ answers: after.Answers_JSON, just: after.Justifications_JSON, docs: (after["Table::CIQ_Case_Data_A00_Documents"] ?? []).length, comps: c.components }, before);
  const rows = h.audit(C).slice(amark);
  assert.deepEqual(rows.map((r) => `${r.Event_Category}: ${r.Action_Code}`), Array(4).fill("Change attempt: Change attempt refused"));
  assert.ok(rows.every((r) => r.Actor_Side === "Supplier" && /locked while Beiersdorf waits for the final release/.test(r.New_Value_Text)), rows.map((r) => r.New_Value_Text).join(" | "));
  assert.ok(!rows.some((r) => r.Action_Code === "Change not applied"), "no second refusal row");
  assert.deepEqual(ev(h, mark), []);
  assert.equal(h.releaseItem(C)._status, "InProgress");
  assert.equal(h.requestItem(C).Request_Locked, "Yes");
  // the request's supplier JSON is set back to the case: the locked page shows what Beiersdorf has, stamps included
  const rq = h.requestItem(C);
  const caseNow = h.ciq(C);
  assert.equal(J(rq.Answers_JSON, {})["FLD-GEN-005"], caseNow.answers["FLD-GEN-005"]);
  assert.equal(J(rq.Justifications_JSON, {})["K6.8"], undefined);
  assert.deepEqual(J(rq.Components_JSON, null), caseNow.components);
  assert.deepEqual(J(rq.Answered_By_JSON, {})["FLD-GEN-005"], { name: "Elena Márquez", email: "elena.marquez@solvaro.example", at: caseNow.answeredBy["FLD-GEN-005"].at, by: "u-sup-1" });
  assert.equal(h.ledger(C).uploadsRefused["UP-LATE-1"], true);
  // the same save is not replayed on the next run
  await h.run();
  assert.equal(h.audit(C).length, amark + 4);
  // nor after a reopen: QM reopens (unlocked), the supplier saves something else; only that is mirrored
  await h.wb("u-qm").request("review.reopen", C, { dept: "QM", reason: "The CoA must be re-checked" });
  await h.run();
  assert.equal(h.requestItem(C).Request_Locked, "No");
  const amark2 = h.audit(C).length;
  await h.sup("u-sup-1").save(C, { answers: { "FLD-A14-102": 0.04 } });
  await h.run();
  const c2 = h.ciq(C);
  assert.equal(c2.answers["FLD-A14-102"], 0.04);
  assert.equal(c2.answers["FLD-GEN-005"], caseNow.answers["FLD-GEN-005"], "the refused value is not mirrored after the reopen");
  assert.deepEqual(c2.components, caseNow.components);
  assert.ok(!c2.documents.some((d) => d.name === "late-CoA.pdf"), "the refused upload is not mirrored after the reopen");
  assert.deepEqual(h.audit(C).slice(amark2).map((r) => r.Action_Code).filter((a) => /^Changed|^Uploaded|^Reopened/.test(a)), ["Changed answer after completeness", "Reopened Safety review"]);
  assert.deepEqual(c2.reviews.filter((r) => r.status === "reopened").map((r) => r.dept).sort(), ["QM", "SAF"]);
});

test("H-02 + H-08 same pass (Thomas, 15 Oct): a save made in review is mirrored before the last completion, never refused by the lock it sets", async () => {
  const h = setup();
  await toReview(h, C);
  for (const d of ["REG", "SAF", "MIC", "RMM"]) await completeReview(h, C, d);
  assert.deepEqual([h.requestItem(C).Request_Locked, h.requestItem(C).Case_Phase_Label], ["No", "With Beiersdorf"]);
  // the supplier saves in GEN (RMM's section); before the service runs, QM completes and files review.completed
  await h.sup("u-sup-2").save(C, { answers: { "FLD-GEN-005": "Plant 9, Reus" } });
  h.tick(30_000);
  const amark = h.audit(C).length;
  await completeReview(h, C, "QM");
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const c = h.ciq(C);
  assert.equal(c.answers["FLD-GEN-005"], "Plant 9, Reus", "mirrored, not refused");
  assert.equal(J(h.requestItem(C).Answers_JSON, {})["FLD-GEN-005"], "Plant 9, Reus");
  assert.deepEqual(c.reviews.map((r) => `${r.dept}:${r.status}`).sort(), ["MIC:completed", "QM:completed", "REG:completed", "RMM:reopened", "SAF:completed"]);
  assert.equal(c.phase, "review", "RMM reopened before QM's completion: no release request");
  assert.equal(h.ledger(C).items.releaseCurrent, undefined);
  assert.deepEqual([h.requestItem(C).Request_Locked, h.requestItem(C).Case_Phase_Label], ["No", "With Beiersdorf"]);
  assert.deepEqual([h.reviewItem(C, "RMM").Activation_Kind, h.reviewItem(C, "RMM").Activation_Reason], ["Reopened", "The supplier changed General information after your review."]);
  const actions = h.audit(C).slice(amark).map((r) => r.Action_Code);
  assert.ok(!actions.includes("Change attempt refused"), actions.join(" | "));
  assert.ok(actions.indexOf("Changed answer after completeness") < actions.indexOf("Completed QM review"), actions.join(" | "));
});

test("H-02 + H-08 by polling (Thomas, 15 Oct): a change after a department completed reopens it, even when its completion is picked up after the save", async () => {
  const h = setup();
  await toReview(h, C);
  for (const d of ["REG", "SAF", "MIC", "RMM"]) await completeReview(h, C, d);
  const round1 = h.reviewItem(C, "QM");
  // QM submits its item in the Workbench (no request yet); a minute later the supplier uploads a new CoA in K1 (QM leads)
  await h.wb("u-qm").actAtStep(FLOW.review, round1._id, { Review_Confirm: "Confirmed", Completed_By: { _id: "u-qm" }, Completed_At: h.clock.now().toISOString() });
  const mark = h.outbox(C).length;
  await h.sup("u-sup-1").save(C, { uploads: [{ id: "UP-COA-NEW", sectionId: "K1", fieldId: "FLD-K1-002", name: "CoA-new.pdf", kind: "CoA" }] });
  await h.run();
  const c = h.ciq(C);
  // K1: QM leads; Regulatory, RMM and Safety co-review: all four reopen, Microbiology stays completed (no Sustainability
  // track: since 28 Oct a vegetable case without SF-09 has none)
  assert.deepEqual(c.reviews.map((r) => `${r.dept}:${r.status}`).sort(), ["MIC:completed", "QM:reopened", "REG:reopened", "RMM:reopened", "SAF:reopened"]);
  const qm = h.reviewItem(C, "QM");
  assert.notEqual(qm._id, round1._id);
  assert.deepEqual([qm.Round_No, qm.Activation_Kind, qm.Activation_Reason, qm._status, qm.Track_Status], [2, "Reopened", "The supplier changed K1 after your review.", "InProgress", "Reopened"]);
  assert.ok(ev(h, mark).includes("review-assigned → lena.krause@beiersdorf.example"), ev(h, mark).join(" | "));
  const actions = h.audit(C).map((r) => r.Action_Code);
  assert.ok(actions.lastIndexOf("Reopened QM review") > actions.lastIndexOf("Completed QM review"));
  assert.equal(c.phase, "review");
  assert.equal(h.ledger(C).items.releaseCurrent, undefined, "no release request on a completion made before the change");
  // the "changed since your review" markers count from QM's own completion
  assert.equal(c.reviews.find((r) => r.dept === "QM").lastCompletedAt, round1.Completed_At ?? h.item(round1._id).Completed_At);
});

test("H-09/H-10 + H-02 (Thomas, 15 Oct): a save that reached the locked request is refused before a reopen unlocks it; an upload without its notice is not taken over", async () => {
  const h = setup();
  await toReview(h, C);
  await completeAll(h, C);
  assert.equal(h.requestItem(C).Request_Locked, "Yes");
  const before = h.ciq(C);
  // a save in flight when the lock landed, and an Uploads row whose upload notice the portal's lock refused
  await h.sup("u-sup-2").save(C, { answers: { "FLD-GEN-005": "Plant 3, Reus" } });
  await h.sup("u-sup-2").save(C, { uploads: [{ id: "UP-ORPHAN-1", sectionId: "K1", fieldId: "FLD-K1-002", name: "orphan-CoA.pdf", kind: "CoA" }] }, { bump: false });
  // QM reopens before the service ran
  await h.wb("u-qm").request("review.reopen", C, { dept: "QM", reason: "The CoA must be re-checked" });
  const amark = h.audit(C).length;
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const c = h.ciq(C);
  assert.equal(c.phase, "review");
  assert.equal(c.answers["FLD-GEN-005"], before.answers["FLD-GEN-005"], "refused while locked, not applied after the reopen");
  assert.equal(J(h.requestItem(C).Answers_JSON, {})["FLD-GEN-005"], before.answers["FLD-GEN-005"]);
  const rows = h.audit(C).slice(amark);
  const refused = rows.filter((r) => r.Action_Code === "Change attempt refused").map((r) => r.New_Value_Text);
  assert.equal(refused.length, 2, refused.join(" | "));
  // (the row is on the request when the waiting save is processed, so it is refused with it)
  assert.ok(refused.every((t) => /locked while Beiersdorf waits for the final release/.test(t)), refused.join(" | "));
  assert.match(refused[1], /tried to change the documents \(orphan-CoA\.pdf\)/);
  assert.equal(h.ledger(C).uploadsRefused["UP-ORPHAN-1"], true);
  assert.equal(rows.findIndex((r) => r.Action_Code === "Change attempt refused") < rows.findIndex((r) => r.Action_Code === "Reopened QM review"), true, "the save is processed before the reopen");
  // the next save in review mirrors only its own change
  await h.sup("u-sup-1").save(C, { answers: { "FLD-A14-102": 0.04 } });
  await h.run();
  const c2 = h.ciq(C);
  assert.equal(c2.answers["FLD-A14-102"], 0.04);
  assert.equal(c2.answers["FLD-GEN-005"], before.answers["FLD-GEN-005"]);
  assert.ok(!c2.documents.some((d) => d.name === "orphan-CoA.pdf"));
});

test("H-10 unlock sweep (Thomas, 15 Oct): an Uploads row stored on the locked request without its save signal is logged and never mirrored later", async () => {
  const h = setup();
  await toReview(h, C);
  await completeAll(h, C);
  // the portal stored the row, then its upload notice met the lock (liveActions.ts bumpRev): no Answers_Rev change
  await h.sup("u-sup-2").save(C, { uploads: [{ id: "UP-ORPHAN-2", sectionId: "K1", fieldId: "FLD-K1-002", name: "orphan-2.pdf", kind: "CoA" }] }, { bump: false });
  await h.run();
  assert.equal(h.ledger(C).uploadsRefused?.["UP-ORPHAN-2"], undefined, "nothing to do while locked: no save signal");
  const amark = h.audit(C).length;
  await h.wb("u-qm").request("review.reopen", C, { dept: "QM", reason: "The CoA must be re-checked" });
  await h.run();
  assert.equal(h.requestItem(C).Request_Locked, "No");
  assert.equal(h.ledger(C).uploadsRefused["UP-ORPHAN-2"], true);
  const row = h.audit(C).slice(amark).find((r) => r.Action_Code === "Change attempt refused");
  assert.ok(row, "logged");
  assert.equal(row.Actor_Side, "Supplier");
  assert.match(row.New_Value_Text, /Ravi Menon added the document orphan-2\.pdf while the questionnaire was locked; it is not taken over\./);
  await h.sup("u-sup-1").save(C, { answers: { "FLD-A14-102": 0.04 } });
  await h.run();
  assert.ok(!h.ciq(C).documents.some((d) => d.name === "orphan-2.pdf"));
});

test("H-02 + H-09 (Thomas, 15 Oct): a save in a section a completed department owns reopens it: a new CIQ Review item, C-02 once per burst; RMM only for its own sections", async () => {
  const h = setup();
  await toReview(h, C);
  for (const d of ["REG", "QM", "MIC", "RMM"]) await completeReview(h, C, d);
  const round1 = Object.fromEntries(["REG", "QM", "MIC", "RMM"].map((d) => [d, h.reviewItem(C, d)._id]));
  let mark = h.outbox(C).length;
  // K2.2 (Safety leads, QM co-reviews): QM reopens; RMM (no owner of K2.2), Regulatory and Microbiology stay completed
  await h.sup("u-sup-1").save(C, { answers: { "FLD-A14-102": 0.04 } });
  await h.run();
  let c = h.ciq(C);
  assert.deepEqual(c.reviews.map((r) => `${r.dept}:${r.status}`), ["RMM:completed", "REG:completed", "SAF:in-review", "QM:reopened", "MIC:completed"]);
  const qm = h.reviewItem(C, "QM");
  assert.notEqual(qm._id, round1.QM);
  assert.deepEqual([qm.Round_No, qm.Activation_Kind, qm.Activation_Reason, qm._status, qm.Track_Status], [2, "Reopened", "The supplier changed K2.2 after your review.", "InProgress", "Reopened"]);
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Reopened QM review" && r.Actor_Side === "System"));
  assert.deepEqual(ev(h, mark).filter((e) => e.startsWith("review-assigned")), ["review-assigned → lena.krause@beiersdorf.example"]);
  // the same burst again in K2.2: no new item, no second mail
  mark = h.outbox(C).length;
  await h.sup("u-sup-1").save(C, { answers: { "FLD-A14-103": 1.1 } });
  await h.run();
  assert.equal(h.reviewItem(C, "QM")._id, qm._id);
  assert.deepEqual(ev(h, mark).filter((e) => e.startsWith("review-assigned")), []);
  // GEN (RMM leads) and K2.1 (RMM leads, Regulatory co-reviews since 28 Oct) in one save: each reopens with its own reason
  await h.sup("u-sup-2").save(C, { answers: { "FLD-GEN-005": "Plant 3, Reus", "FLD-2.1-102": 0.97 } });
  await h.run();
  c = h.ciq(C);
  assert.deepEqual(c.reviews.filter((r) => r.status === "reopened").map((r) => r.dept).sort(), ["QM", "REG", "RMM"]);
  assert.equal(h.reviewItem(C, "RMM").Activation_Reason, "The supplier changed General information after your review.");
  assert.equal(h.reviewItem(C, "REG").Activation_Reason, "The supplier changed K2.1 after your review.");
  assert.equal(h.reviewItem(C, "MIC")._id, round1.MIC, "Microbiology owns neither section");
  // the data-changed mails stay debounced (C-10) and the case stays in review
  assert.equal(c.phase, "review");
  assert.equal(h.requestItem(C).Request_Locked, "No");
});

test("H-14: reassign within the department (Assignee_* on the item, C-02 to the new assignee)", async () => {
  const h = setup();
  await toReview(h, C);
  const mark = h.outbox(C).length;
  await h.wb("u-saf").request("review.reassign", C, { dept: "SAF", toUserId: "u-saf-2", reason: "Holiday cover" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const it = h.reviewItem(C, "SAF");
  assert.equal(it.Assignee_User._id, "u-saf-2");
  assert.equal(it.Assignee_Email, "ole.brandt@beiersdorf.example");
  assert.equal(it.Reassign_Reason, "Holiday cover");
  assert.deepEqual(ev(h, mark), ["review-assigned → ole.brandt@beiersdorf.example"]);
  // to someone outside the department: refused by the prototype
  await h.wb("u-saf").request("review.reassign", C, { dept: "SAF", toUserId: "u-qm", reason: "x" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
});

test("H-15: a department adds a section (Manual_Scope_JSON, Scope Run, additional-part point by the asker, C-04)", async () => {
  const h = setup();
  await toReview(h, C);
  const mark = h.outbox(C).length;
  await h.wb("u-saf").request("section.add", C, { dept: "SAF", sectionId: "K4.3", justification: "Microplastic particles seen in the SEM images" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const c = h.ciq(C);
  const k43 = c.scope.find((x) => x.sectionId === "K4.3");
  assert.equal(k43.applicability, "mandatory");
  assert.equal(k43.manual.by, "u-saf");
  assert.deepEqual(JSON.parse(h.requestItem(C).Manual_Scope_JSON).map((x) => x.sectionId), ["K4.3"]);
  const ap = c.openPoints.find((p) => p.kind === "additional-part");
  assert.equal(ap.createdBy, "u-saf");
  assert.ok(h.fake.rows(FLOW.scopeRun).some((r) => r.Scope_Trigger === "Department addition" && r.Override_Justification.includes("SEM")));
  assert.ok(ev(h, mark).includes(`op-raised → ${CONTACTS}`));
  // RMM never adds sections (D-04): refused by role
  await h.wb("u-rmm").request("section.add", C, { dept: "RMM", sectionId: "K4.2", justification: "x" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
});

test("H-17: a note mentions people → C-20 to each mentioned active internal user except the writer; none on a closed case", async () => {
  const h = setup();
  await toReview(h, C);
  const mark = h.outbox(C).length;
  await h.wb("u-rmm").note(C, "@Dr. Mira Hansen please check K2.2 with @Lena Krause. cc @Katrin Vogel", { Note_Dept: "RMM", Linked_Kind: "section", Linked_Key: "K2.2", Note_Mentions_Emails: "sophie.wagner@beiersdorf.example" });
  await h.run();
  const got = ev(h, mark).sort();
  assert.deepEqual(got, ["note-mention → lena.krause@beiersdorf.example", "note-mention → mira.hansen@beiersdorf.example", "note-mention → sophie.wagner@beiersdorf.example"]);
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Added internal note" && r.Event_Category === "Internal note"));
  await h.run();
  assert.equal(h.outbox(C).length, mark + 3, "the cursor: a note is mailed once");
  // a closed case: no new notes (B-37)
  await h.wb("u-rmm").request("case.cancel", C, { reason: "Stop." });
  await h.run();
  const m2 = h.outbox(C).length;
  await h.wb("u-saf").note(C, "@Katrin Vogel too late?", { Note_Dept: "SAF" });
  await h.run();
  assert.equal(h.outbox(C).slice(m2).filter((r) => r.Event_Code === "note-mention").length, 0);
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Internal note not mailed"));
});

test("H-18: a contact's e-mail change reaches the open case (GEN-008, BDF_Set_JSON, case e-mails); deactivation with a replacement (C-01)", async () => {
  const h = setup();
  const caseItem = await toReview(h, C);
  const sup = h.fake.rows(FLOW.supplier)[0];
  const contacts = sup[`Table::${F.supplier.contacts.table}`];
  // the administrator changed Elena's e-mail in the master, then files supplier.changed
  contacts[0].Contacts_Email = "e.marquez@solvaro.example";
  h.fake.seedUpdate(sup._id, { [`Table::${F.supplier.contacts.table}`]: contacts }, "u-admin");
  await h.wb("u-admin").request("supplier.changed", "", { contactUserId: "u-sup-1", change: "email", before: { email: "elena.marquez@solvaro.example" }, after: { email: "e.marquez@solvaro.example" } });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.equal(J(h.requestItem(C).BDF_Set_JSON)["FLD-GEN-008"], "e.marquez@solvaro.example");
  assert.equal(h.ciq(C).answers["FLD-GEN-008"], "e.marquez@solvaro.example");
  assert.match(h.item(caseItem).Supplier_Contact_Emails, /e\.marquez@solvaro\.example/);
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Updated contact e-mail"));
  assert.ok(h.audit().some((r) => r.Action_Code === "Updated contact" && r.Event_Category === "Supplier master"));
  // deactivate Ravi with a replacement contact (a third contact added by the administrator)
  contacts.push({ _id: "Contacts_3", Contacts_Key: "s1-c3", Contacts_Full_Name: "Carla Ruiz", Contacts_Email: "carla.ruiz@solvaro.example", Contacts_Title: "QA Lead", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: "u-sup-3", Contacts_Active: "Yes" });
  contacts[1].Contacts_Active = "No";
  h.fake.seedUpdate(sup._id, { [`Table::${F.supplier.contacts.table}`]: contacts }, "u-admin");
  const mark = h.outbox(C).length;
  await h.wb("u-admin").request("supplier.changed", "", { contactUserId: "u-sup-2", change: "deactivate", before: { active: true }, replacementUserId: "u-sup-3" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.deepEqual(h.requestItem(C).Assigned_Contacts.map((x) => x._id).sort(), ["u-sup-1", "u-sup-3"]);
  assert.equal(h.item(caseItem).Portal_Contact_Ids, "u-sup-1,u-sup-3");
  assert.deepEqual(ev(h, mark), ["invitation → carla.ruiz@solvaro.example"]);
  // only the business administrator files it
  await h.wb("u-rmm").request("supplier.changed", "", { contactUserId: "u-sup-1", change: "email" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
});

test("H-19/H-20: reminders and escalations follow the Reminders row, never twice (C-21); run now is admin-only", async () => {
  const h = setup();
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  h.tick(8 * 86_400_000);
  await h.run();
  const r1 = h.outbox(C).filter((r) => r.Event_Code === "reminder");
  assert.equal(r1.length, 1);
  assert.equal(r1[0].To_Emails, CONTACTS);
  assert.match(r1[0].Mail_Key, /^rem-1:CIQ-2026-0001:/);
  h.tick(2 * 3_600_000);
  await h.run();
  assert.equal(h.outbox(C).filter((r) => r.Event_Code === "reminder").length, 1, "idempotent");
  h.tick(7 * 86_400_000);
  await h.run();
  const esc = h.outbox(C).filter((r) => r.Event_Code === "escalation");
  assert.equal(esc.length, 1);
  assert.equal(esc[0].To_Emails, "katrin.vogel@beiersdorf.example");
  // H-20
  await h.wb("u-rmm").request("reminders.run", "", {});
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  await h.wb("u-admin").request("reminders.run", "", {});
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
});

test("rmes.saved: guards from the prototype (own department, comment for a negative result); a Rejected decision flags RMM", async () => {
  const h = setup();
  await toReview(h, C);
  await h.wb("u-reg").request("rmes.saved", C, { dept: "SAF", results: [{ criterionId: "S-A1", result: "available" }] });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  await h.wb("u-saf").request("rmes.saved", C, { dept: "SAF", results: [{ criterionId: "S-A1", result: "negative", comment: "" }] });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /comment is required/);
  // results for every Safety criterion, then a Rejected decision
  const rowId = h.ledger(C).items["rmes:SAF"];
  const crit = h.fake.item(rowId)["Table::Safety_Criteria"];
  await h.wb("u-saf").request("rmes.saved", C, { dept: "SAF", results: crit.map((x) => ({ criterionId: x.Criteria_Code, result: "available", comment: "" })), decision: { value: "rejected", reason: "Endocrine data missing" } });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.equal(h.ciq(C).reviews.find((x) => x.dept === "SAF").decision, "rejected");
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Flagged for RMM"));
  assert.ok(!h.caseRow(C).Tracks_JSON.includes("Endocrine"), "no decision reason in Case Data (§4.4)");
});

test("config.published: the release's content hash is checked and the publish is recorded", async () => {
  const h = setup();
  const rel = h.fake.rows(FLOW.config).find((r) => r.Config_Kind === "Release" && r.Config_State === "Draft");
  h.fake.seedUpdate(rel._id, { Config_State: "Published", Published_At: "2026-10-15T08:00:00.000Z" }, "u-admin");
  await h.wb("u-admin").request("config.published", "", { releaseRowId: rel._id });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.ok(h.audit().some((r) => r.Event_Category === "Configuration" && r.Action_Code === "Published configuration"));
  // new cases now pin RS-2026.2 + v2; a tampered bundle is refused
  const bundle = JSON.parse(rel.Release_Bundle_JSON);
  bundle.ruleSet.rules[0].outcome = "optional";
  h.fake.seedUpdate(rel._id, { Release_Bundle_JSON: JSON.stringify(bundle) }, "u-admin");
  await h.wb("u-admin").request("config.published", "", { releaseRowId: rel._id });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /content hash/);
});

test("a case pinned to RS-2026.2 + v2 gets the Turkey sections (B-50) from its pinned bundle", async () => {
  const h = setup();
  const rel = h.fake.rows(FLOW.config).find((r) => r.Config_Kind === "Release" && r.Config_State === "Draft");
  h.fake.seedUpdate(rel._id, { Config_State: "Published", Published_At: "2026-10-15T08:00:00.000Z" }, "u-admin");
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C, Rule_Set_Version: "RS-2026.2", Template_Version: "CIQ-2026 v2", Target_Markets_Text: "EU, TR" });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const c = h.ciq(C);
  assert.equal(c.templateVersion, "CIQ-2026 v2");
  assert.equal(c.scope.find((x) => x.sectionId === "K6.3").applicability, "mandatory");
  assert.equal(JSON.parse(h.requestItem(C).Config_Bundle_JSON).release.templateVersion, "CIQ-2026 v2");
  assert.ok(JSON.parse(h.requestItem(C).Config_Bundle_JSON).template.sections.some((x) => x.id === "K6.3" && x.fields.length === 2));
});

test("H-07 while the lead track is open: C-10a to its assignee; H-14: system-raised points follow a reassignment (B-26)", async () => {
  const h = setup();
  await toReview(h, C);
  const mark = h.outbox(C).length;
  await h.sup("u-sup-1").save(C, { config: { SF01: ["vegetable", "petrochemical"] } });
  await h.run();
  const rows = h.outbox(C).slice(mark);
  const c10a = rows.filter((r) => r.Event_Code === "data-changed-section-added");
  assert.equal(c10a.length, 1);
  assert.equal(c10a[0].To_Emails, "mira.hansen@beiersdorf.example");
  assert.match(c10a[0].Subject, /Annex 4 added to your Safety review/);
  assert.equal(h.reviewItem(C, "SAF").Round_No, 1, "an open track is not re-created");
  const ap = h.ciq(C).openPoints.find((p) => p.kind === "additional-part");
  assert.equal(h.opItem(C, ap.id).Responsible_User._id, "u-saf");
  await h.wb("u-saf").request("review.reassign", C, { dept: "SAF", toUserId: "u-saf-2", reason: "Holiday cover" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.equal(h.opItem(C, ap.id).Responsible_User._id, "u-saf-2", "the system point follows the track");
  assert.equal(h.ciq(C).openPoints.find((p) => p.id === ap.id).responsibleId, "u-saf-2");
});

test("H-01 ignores service-owned case fields filled at creation: clears the Text ones, audits a change attempt (app verifier, 15 Oct)", async () => {
  const h = setup();
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C, Final_Document_Hash: "forged-seal", Cancel_Reason: "forged", Case_Data_Item_Id: "forged-id" });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done");
  const it = h.item(item);
  assert.equal(it.Final_Document_Hash || "", "", "the forged seal is cleared");
  assert.equal(it.Cancel_Reason || "", "", "the forged cancel reason is cleared");
  assert.notEqual(it.Case_Data_Item_Id, "forged-id", "the service writes the real Case Data link");
  const attempt = h.audit(C).find((r) => r.Event_Category === "Change attempt");
  assert.ok(attempt, "a change attempt is audited");
  assert.match(attempt.Event_Reason ?? attempt.New_Value_Text ?? JSON.stringify(attempt), /Final_Document_Hash/);
});

test("H-04 V-19(b): with Raiser_Assignee live, the point's department step is assigned to the raiser; without it, creation still works", async () => {
  const { defaultSchema } = await import("../fake.mjs");
  const schema = defaultSchema();
  const op = schema[FLOW.openPoint];
  op.fields.add("Raiser_Assignee");
  op.steps = op.steps.map((s) => (s.kind === "user" ? { ...s, assignee: { field: "Raiser_Assignee" } } : s));
  const h = setup({ schema });
  await toReview(h, C);
  await raise(h, "u-saf", "SAF");
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const point = h.fake.rows(FLOW.openPoint).at(-1);
  assert.deepEqual((point.Raiser_Assignee ?? []).map((u) => u._id), ["u-saf"], "Raiser_Assignee holds the raiser");
  assert.deepEqual((point._current_context?.[0]?._context_assigned_to ?? []).map((u) => u._id), ["u-saf"], "the step is the raiser's task");
  // the default schema (field not live yet) is covered by every other open-point test: the create retries without it
});
