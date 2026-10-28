import { uiClient } from "../fake.mjs";
// End-to-end on the fake (plan v5 §12 walk-through): one case from creation to the change report, asserting the
// outbox rows (event codes and recipients) and the audit rows at each stage.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, fillUntilComplete, fillFor, PLAIN_CONFIG, releaseBlockers, FLOW, D } from "./helpers.mjs";

const C = "CIQ-2026-0001";
const ELENA = "elena.marquez@solvaro.example";
const RAVI = "ravi.menon@solvaro.example";
const CONTACTS = `${ELENA}, ${RAVI}`;
const MAIL = { RMM: "katrin.vogel@beiersdorf.example", REG: "jonas.albrecht@beiersdorf.example", SAF: "mira.hansen@beiersdorf.example", QM: "lena.krause@beiersdorf.example", MIC: "tobias.keller@beiersdorf.example", SUS: "sophie.wagner@beiersdorf.example", CUS: "felix.schulz@beiersdorf.example", LEG: "anna.becker@beiersdorf.example" };
const REVIEWER = { RMM: "u-rmm", REG: "u-reg", SAF: "u-saf", QM: "u-qm", MIC: "u-mic", SUS: "u-sus" };

/** A reviewer records every open RMES result directly in its RMES row (Workbench), then files rmes.saved. */
async function recordRmes(h, dept) {
  const form = dept === "SAF" ? FLOW.rmesSaf : FLOW.rmesReg;
  const table = dept === "SAF" ? "Safety_Criteria" : "Regulatory_Criteria";
  const rowId = h.ledger(C).items[`rmes:${dept}`];
  const open = h.fake.item(rowId)[`Table::${table}`].filter((x) => !x.Criteria_Result);
  if (!open.length) return;
  const who = REVIEWER[dept];
  const cl = uiClient(h.fake, who);
  const r = await cl.call("POST", `/form/2/${cl.acc}/${form}/${rowId}?_application_id=CIQ_Digital_A00`, { [`Table::${table}`]: open.map((x) => ({ _id: x._id, Criteria_Result: "Available", Criteria_Recorded_At: h.clock.now().toISOString() })) });
  assert.equal(r.status, 200);
  await h.wb(who).request("rmes.saved", C, { dept, results: open.map((x) => ({ criterionId: x.Criteria_Code, result: "available", comment: "" })) });
  await h.run();
  assert.equal(h.requests().at(-1).Request_Status, "Done", h.requests().at(-1).Result_Note);
}

/** A reviewer completes its review in the Workbench (own step fields + submit), then files review.completed. */
async function completeReview(h, dept) {
  const who = REVIEWER[dept];
  if (dept === "SAF" || dept === "REG") await recordRmes(h, dept);
  const item = h.reviewItem(C, dept);
  await h.wb(who).actAtStep(FLOW.review, item._id, { Review_Confirm: "Confirmed", Completed_By: { _id: who }, Completed_At: h.clock.now().toISOString(), ...(dept === "SAF" || dept === "REG" ? { RMES_Decision: "Approved" } : {}) });
  await h.wb(who).request("review.completed", C, { dept }, item._id);
  await h.run();
  const last = h.requests().at(-1);
  assert.equal(last.Request_Status, "Done", `${dept}: ${last.Result_Note}`);
}

const events = (h, mark) => h.outbox(C).slice(mark).map((r) => `${r.Event_Code} → ${r.To_Emails}`);
const actions = (h, mark) => h.audit(C).slice(mark).map((r) => `${r.Event_Category}: ${r.Action_Code}`);

test("e2e: create → Part 1 → completeness → open point rounds → release → late section → release → final document → change report", async (t) => {
  const h = setup();
  const rmm = h.wb("u-rmm");
  const saf = h.wb("u-saf");
  const elena = h.sup("u-sup-1");
  const ravi = h.sup("u-sup-2");
  let mark = 0;
  let amark = 0;
  let caseItem;

  await t.test("1. RMM creates the case → Case Data row, portal request, C-01 invitation", async () => {
    caseItem = await rmm.createCase({ Case_Code: C });
    await rmm.request("case.created", C, { caseItemId: caseItem }, caseItem);
    await h.run();
    assert.equal(h.requests().at(-1).Request_Status, "Done");
    assert.deepEqual(events(h, mark), [`invitation → ${CONTACTS}`]);
    assert.deepEqual(actions(h, amark), ["Case: Created case", "Scope: Derived scope", "Notification: Invited supplier contacts"]);
    const req = h.requestItem(C);
    assert.equal(req._current_context[0]._context_current_step, "Supplier: fill in the CIQ");
    assert.equal(req.Case_Phase_Label, "Filling in");
    assert.equal(req.Rule_Set_Version, "RS-2026.1");
    assert.ok(req.Config_Bundle_JSON.length > 10_000);
    const bundle = JSON.parse(req.Config_Bundle_JSON);
    assert.equal(bundle.format, "ciq-bundle/1");
    assert.equal(bundle.release.label, "RS-2026.1 + CIQ-2026 v1");
    assert.ok(!/"basis"|"note"/.test(req.Config_Bundle_JSON), "no rule basis or notes (§11.3)");
    assert.equal(req.Config_Bundle_Hash, (await import("../config.mjs")).bundleHash(bundle));
    assert.deepEqual(JSON.parse(req.BDF_Set_JSON)["FLD-GEN-003"], "471203958");
    const ci = h.item(caseItem);
    assert.equal(ci.Case_Phase, "Supplier filling in the CIQ");
    assert.equal(ci.Portal_Request_Item_Id, req._id);
    assert.equal(ci.Case_Data_Item_Id, h.caseRow(C)._id);
    assert.equal(ci._current_context[0]._context_current_step, "Waiting for supplier: CIQ");
    mark = h.outbox(C).length;
    amark = h.audit(C).length;
  });

  await t.test("2. the supplier saves answers; the live scope comes from the bundle; two contacts in parallel", async () => {
    await elena.save(C, { config: PLAIN_CONFIG });
    await ravi.save(C, { answers: { "FLD-GEN-004": "Solvaro Oleochemicals S.A., Tarragona" } });
    await h.run();
    const c = h.ciq(C);
    assert.deepEqual(c.config.SF01, ["vegetable"]);
    assert.equal(c.answeredBy.SF01.by, "u-sup-1");
    assert.equal(c.answeredBy["FLD-GEN-004"].by, "u-sup-2");
    // same engine as the prototype: the scope equals deriveScope over the same answers
    const expected = D.deriveScope({ ...PLAIN_CONFIG, SF11: ["EU"] }, "RS-2026.1", "CIQ-2026 v1", h.cfg());
    assert.deepEqual(c.scope.map((x) => [x.sectionId, x.applicability]), expected.map((x) => [x.sectionId, x.applicability]));
    assert.ok(c.scope.find((x) => x.sectionId === "A1").applicability === "mandatory");
    assert.deepEqual(events(h, mark), [], "no mail in Part 1");
    assert.deepEqual(actions(h, amark), ["Scope: Scope follows answers"]);
    await fillUntilComplete(h, C);
    assert.ok(h.caseRow(C)["Table::CIQ_Case_Data_A00_Documents"].length >= 5, "documents mirrored as child rows");
    mark = h.outbox(C).length;
    amark = h.audit(C).length;
  });

  await t.test("3. completeness → reviews (RMM + lead departments), RMES rows, C-02 and C-03, case step submitted", async () => {
    await elena.confirmCompleteness(C);
    await h.run();
    const c = h.ciq(C);
    assert.equal(c.phase, "review");
    // 28 Oct (matrix v0.6): Annex 1 is led by Regulatory, so a vegetable case without SF-09 has no Sustainability review
    assert.deepEqual(c.reviews.map((r) => r.dept), ["RMM", "REG", "SAF", "QM", "MIC"]);
    for (const r of c.reviews) {
      const item = h.reviewItem(C, r.dept);
      assert.equal(item.Review_Key, `${C}-${r.dept}-1`);
      assert.equal(item.Activation_Kind, "Completeness");
      assert.equal(item._current_context[0]._context_current_step, D.DEPT_SHORT && { RMM: "Review – RMM", REG: "Review – Regulatory", SAF: "Review – Safety", QM: "Review – QM", MIC: "Review – Microbiology", SUS: "Review – Sustainability" }[r.dept]);
    }
    assert.ok(h.ledger(C).items["rmes:SAF"] && h.ledger(C).items["rmes:REG"], "RMES rows for SAF and REG");
    assert.deepEqual(events(h, mark), [...["RMM", "REG", "SAF", "QM", "MIC"].map((d) => `review-assigned → ${MAIL[d]}`), `informed → ${MAIL.CUS}`, `informed → ${MAIL.LEG}`]);
    assert.deepEqual(actions(h, amark), ["Case: Confirmed completeness", "Review: Activated reviews"]);
    assert.equal(h.item(caseItem)._current_context[0]._context_current_step, "Beiersdorf review and final release");
    assert.equal(h.item(caseItem).Completeness_By_Email, ELENA);
    assert.equal(h.requestItem(C).Case_Phase_Label, "With Beiersdorf");
    const runs = h.fake.rows(FLOW.scopeRun).filter((r) => r.Case_Code === C);
    assert.deepEqual(runs.map((r) => r.Scope_Trigger), ["Completeness"]);
    mark = h.outbox(C).length;
    amark = h.audit(C).length;
  });

  let opId;
  await t.test("4. Safety raises → query round 1 → answer → return → round 2 → answer with a document → accept", async () => {
    await saf.request("op.raise", C, { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", fieldId: "FLD-A14-101", label: "K2.2 › Arsenic (As) content" }, question: "Please confirm the arsenic value with the batch analysis.", justification: "Needed for the heavy-metal evaluation", dueDate: "2026-11-30T00:00:00.000Z" });
    await h.run();
    opId = h.ciq(C).openPoints[0].id;
    assert.equal(opId, "OP-0001-01");
    assert.deepEqual(events(h, mark), [`op-raised → ${CONTACTS}`]);
    assert.equal(h.opItem(C, opId)._current_context[0]._context_current_step, "Open point – Safety");
    assert.equal(h.opItem(C, opId).Raised_By_User._id, "u-saf");
    assert.equal(h.queryItem(C, opId, 1)._current_context[0]._context_current_step, "Supplier: respond");
    assert.equal(h.reviewItem(C, "SAF").Track_Status, "Waiting for supplier");
    assert.equal(h.reviewItem(C, "SAF").Open_Count, 1);
    mark = h.outbox(C).length;

    await elena.answer(C, opId, 1, { text: "As is 0.05 mg/kg in batch 2408-117." });
    await h.run();
    assert.deepEqual(events(h, mark), [`op-answered → ${MAIL.SAF}`]);
    assert.equal(h.opItem(C, opId).OP_Progress, "In progress");
    assert.equal(h.reviewItem(C, "SAF").Track_Status, "In review");
    mark = h.outbox(C).length;

    await saf.request("op.returned", C, { opId, text: "Please attach the full batch analysis report." }, opId);
    await h.run();
    assert.deepEqual(events(h, mark), [`op-returned → ${CONTACTS}`]);
    const q2 = h.queryItem(C, opId, 2);
    assert.equal(q2._status, "InProgress");
    assert.equal(h.queryItem(C, opId, 1)._status, "Completed");
    assert.equal(JSON.parse(q2.Previous_Rounds_JSON).length, 3);
    assert.equal(h.opItem(C, opId).Round_No, 2);
    mark = h.outbox(C).length;

    await elena.save(C, { uploads: [{ id: "UP-AN-1", sectionId: "K2.2", fieldId: "FLD-A14-101", name: "batch-analysis-2408-117.pdf", kind: "Analysis" }] });
    await elena.answer(C, opId, 2, { kind: "Document", text: "Full report attached.", uploadIds: ["UP-AN-1"] });
    await h.run();
    assert.deepEqual(events(h, mark), [`op-answered → ${MAIL.SAF}`], "the upload at the question sends no data-changed mail");
    const c = h.ciq(C);
    assert.equal(c.documents.filter((d) => d.name === "batch-analysis-2408-117.pdf").length, 1, "the answer's file is stored once");
    assert.deepEqual(c.openPoints[0].thread.map((m) => m.action), ["raised", "answered", "returned", "answered"]);
    mark = h.outbox(C).length;

    await saf.actAtStep(FLOW.openPoint, h.opItem(C, opId)._id, { OP_Outcome: "Accepted" });
    await saf.request("op.accepted", C, { opId }, opId);
    await h.run();
    assert.equal(h.requests().at(-1).Request_Status, "Done");
    assert.deepEqual(events(h, mark), [`op-accepted → ${CONTACTS}`]);
    assert.equal(h.opItem(C, opId)._status, "Completed");
    assert.equal(h.reviewItem(C, "SAF").Open_Count, 0);
    const hist = JSON.parse(h.requestItem(C).Questions_History_JSON);
    assert.equal(hist[0].status, "Accepted");
    assert.ok(hist[0].thread.every((m) => m.action !== "note"));
    const a = actions(h, amark);
    for (const x of ["Open point: Raised query", "Open point: Answered query", "Open point: Returned answer to supplier", "Open point: Accepted answer"]) assert.ok(a.includes(x), `${x} in ${a.join(" | ")}`);
    mark = h.outbox(C).length;
    amark = h.audit(C).length;
  });

  await t.test("5. every review completes → CIQP Final Release created for the contacts who may confirm; C-11", async () => {
    for (const d of ["REG", "SAF", "QM", "MIC", "RMM"]) await completeReview(h, d);
    const c = h.ciq(C);
    assert.equal(c.phase, "final-release");
    const rel = h.releaseItem(C);
    assert.equal(rel._current_context[0]._context_current_step, "Supplier: release");
    assert.deepEqual(rel.Assigned_Contacts.map((x) => x._id).sort(), ["u-sup-1", "u-sup-2"]);
    assert.deepEqual(events(h, mark), [`release-requested → ${CONTACTS}`]);
    assert.equal(h.item(caseItem).Case_Phase, "Awaiting final release");
    assert.equal(h.requestItem(C).Case_Phase_Label, "Awaiting your final release");
    assert.equal(h.requestItem(C).Request_Locked, "Yes", "the questionnaire is locked at the release request (Thomas, 15 Oct)");
    const a = actions(h, amark);
    assert.ok(a.includes("Review: All reviews completed"));
    assert.equal(a.filter((x) => /Completed .* review/.test(x)).length, 5);
    mark = h.outbox(C).length;
    amark = h.audit(C).length;
  });

  let relBefore;
  await t.test("6a. locked while the release is requested: a supplier save is refused and logged, nothing is mirrored", async () => {
    relBefore = h.releaseItem(C)._id;
    const before = { config: h.caseRow(C).Config_Answers_JSON, scope: h.caseRow(C).Scope_JSON };
    await elena.save(C, { config: { SF01: ["vegetable", "petrochemical"] } });
    await h.run();
    const c = h.ciq(C);
    assert.equal(c.phase, "final-release");
    assert.deepEqual({ config: h.caseRow(C).Config_Answers_JSON, scope: h.caseRow(C).Scope_JSON }, before);
    assert.equal(h.item(relBefore)._status, "InProgress", "the release task stays");
    assert.equal(h.requestItem(C).Request_Locked, "Yes");
    assert.deepEqual(actions(h, amark), ["Change attempt: Change attempt refused"]);
    assert.match(h.audit(C).at(-1).New_Value_Text, /locked while Beiersdorf waits for the final release/);
    assert.deepEqual(events(h, mark), [], "no mail");
    mark = h.outbox(C).length;
    amark = h.audit(C).length;
  });

  await t.test("6b. QM reopens (H-09/H-10): release withdrawn, the request unlocked (back to review)", async () => {
    await h.wb("u-qm").request("review.reopen", C, { dept: "QM", reason: "The palm and mineral oil answers must be updated" });
    await h.run();
    assert.equal(h.requests().at(-1).Request_Status, "Done", h.requests().at(-1).Result_Note);
    assert.equal(h.ciq(C).phase, "review");
    assert.equal(h.item(relBefore)._status, "Withdrawn");
    const req = h.requestItem(C);
    assert.equal(req.Request_Locked, "No");
    assert.equal(req.Case_Phase_Label, "With Beiersdorf");
    assert.equal(h.reviewItem(C, "QM").Activation_Kind, "Reopened");
    assert.deepEqual(events(h, mark), [`release-withdrawn → ${CONTACTS}`]);
    mark = h.outbox(C).length;
    amark = h.audit(C).length;
  });

  await t.test("6. a Part 2 origin change adds Annex 4 → Safety reopened, additional-part point", async () => {
    await elena.save(C, { config: { SF01: ["vegetable", "petrochemical"] } });
    await h.run();
    const c = h.ciq(C);
    assert.equal(c.phase, "review");
    assert.equal(c.scope.find((x) => x.sectionId === "A4").addedLater, true);
    const saf2 = h.reviewItem(C, "SAF");
    assert.equal(saf2.Round_No, 2);
    assert.equal(saf2.Activation_Kind, "Reopened");
    const ap = c.openPoints.find((p) => p.kind === "additional-part");
    assert.ok(ap && ap.createdBy === "system" && ap.responsibleId === "u-saf");
    assert.equal(h.queryItem(C, ap.id, 1)._status, "InProgress");
    assert.ok(c.rmes.criteria.some((x) => x.id === "S-C2"), "RMES gains the MOAH criterion (H-21)");
    assert.ok(h.fake.item(h.ledger(C).items["rmes:SAF"])["Table::Safety_Criteria"].some((x) => x.Criteria_Code === "S-C2"));
    const ev = events(h, mark);
    assert.ok(ev.includes(`review-assigned → ${MAIL.SAF}`), ev.join(" | "));
    assert.ok(ev.includes(`op-raised → ${CONTACTS}`), ev.join(" | "));
    assert.ok(!ev.some((e) => e.startsWith("data-changed")), "C-10 is debounced, not sent at once");
    assert.equal(h.ledger(C).pendingMail.length, 1);
    assert.deepEqual(h.fake.rows(FLOW.scopeRun).filter((r) => r.Case_Code === C).map((r) => r.Scope_Trigger), ["Completeness", "Added later"]);
    const a = actions(h, amark);
    for (const x of ["Scope: Changed metadata answer after completeness", "Review: Reopened Safety review", "Open point: Activated additional section"]) assert.ok(a.includes(x), `${x} in ${a.join(" | ")}`);
    // 10 minutes later the merged data-changed mail goes out (F-15)
    mark = h.outbox(C).length;
    h.tick(11 * 60_000);
    await h.run();
    const dc = h.outbox(C).slice(mark).filter((r) => r.Event_Code === "data-changed");
    assert.equal(dc.length, 1);
    // a metadata answer counts as GEN, which only RMM's whole-CIQ review uses (mail.ts dataChangedMail)
    assert.equal(dc[0].To_Emails, MAIL.RMM);
    assert.match(dc[0].Body_Text, /SF-01/);
    mark = h.outbox(C).length;
    amark = h.audit(C).length;

    // the supplier completes the new section (and, matrix v0.6 D6, adds the petrochemical component) and answers the
    // additional-part point; Safety accepts it
    const f = fillFor(h, C);
    assert.deepEqual(f.components?.map((r) => r.origin), ["vegetable", "petrochemical"]);
    await elena.save(C, { answers: f.answers, justifications: f.justifications, uploads: f.uploads, components: f.components });
    await h.run();
    // Thomas, 15 Oct: the K2.3 answer (petrochemical feedstock) reopens the completed reviews of K2.3's owners (RMM
    // leads; Regulatory co-reviews; Sustainability co-reviews too but has no track without SF-09; Safety is already
    // open) through H-09: new CIQ Review items
    const c2 = h.ciq(C);
    assert.deepEqual(c2.reviews.filter((r) => r.status === "reopened").map((r) => r.dept).sort(), ["QM", "REG", "RMM"]);
    for (const d of ["RMM", "REG"]) {
      const it = h.reviewItem(C, d);
      assert.deepEqual([it.Round_No, it.Activation_Kind, it.Activation_Reason, it._status], [2, "Reopened", "The supplier changed K2.3 after your review.", "InProgress"], d);
    }
    const reopenMails = h.outbox(C).slice(mark).filter((r) => r.Event_Code === "review-assigned").map((r) => r.To_Emails).sort();
    assert.deepEqual(reopenMails, [MAIL.REG, MAIL.RMM].sort(), "one C-02 per reopened review (not per change)");
    await elena.answer(C, ap.id, 1, { kind: "Additional part completed", text: "Annex 4 is completed." });
    await h.run();
    await saf.actAtStep(FLOW.openPoint, h.opItem(C, ap.id)._id, { OP_Outcome: "Accepted" });
    await saf.request("op.accepted", C, { opId: ap.id }, ap.id);
    await h.run();
    assert.equal(h.requests().at(-1).Request_Status, "Done", h.requests().at(-1).Result_Note);
    await completeReview(h, "SAF");
    for (const d of ["QM", "REG"]) {
      assert.equal(h.ciq(C).phase, "review", `${d}'s reopened review still waits`);
      await completeReview(h, d);
    }
    await completeReview(h, "RMM");
    assert.equal(h.ciq(C).phase, "final-release");
    assert.equal(h.requestItem(C).Request_Locked, "Yes", "locked again at the second release request");
    const relAgain = h.releaseItem(C);
    assert.notEqual(relAgain._id, relBefore);
    assert.equal(relAgain._status, "InProgress");
    assert.ok(events(h, mark).includes(`release-requested → ${CONTACTS}`));
    // the supplier's Part 2 changes of this burst go out as ONE merged data-changed mail 10 min later (F-15)
    h.tick(11 * 60_000);
    await h.run();
    const merged = h.outbox(C).slice(mark).filter((r) => r.Event_Code === "data-changed");
    assert.equal(merged.length, 1);
    assert.ok(merged[0].Body_Text.split("\n").length > 3, "several changes merged into one mail");
    mark = h.outbox(C).length;
    amark = h.audit(C).length;
  });

  await t.test("7. release → final document + SHA-256 seal → case completed (both steps), request locked; C-13, C-14", async () => {
    assert.deepEqual(releaseBlockers(h, C), []);
    await elena.release(C);
    await h.run();
    const c = h.ciq(C);
    assert.equal(c.phase, "completed");
    const row = h.caseRow(C);
    const doc = JSON.parse(row.Final_Document_JSON);
    assert.equal(row.Final_Document_Hash, (await import("../engine.mjs")).sealOf(doc));
    assert.ok(D.verifyFinalDocument(doc), "the prototype's own fingerprint check still holds");
    assert.ok(!JSON.stringify(doc).includes("RMES"), "no RMES in the final document");
    assert.equal(doc.threads.length, 2);
    assert.deepEqual(doc.threads[0].rounds.map((r) => r.n), [1, 2]);
    assert.equal(h.item(caseItem)._status, "Completed");
    assert.equal(h.item(caseItem).Final_Document_Hash, row.Final_Document_Hash);
    const req = h.requestItem(C);
    assert.equal(req.Request_Locked, "Yes");
    assert.equal(req.Case_Phase_Label, "Completed");
    assert.equal(req._current_context[0]._context_current_step, "Supplier: keep the CIQ up to date");
    assert.deepEqual(events(h, mark), [`release-receipt → ${CONTACTS}`, `final-document → ${MAIL.RMM}`]);
    assert.ok(h.outbox(C).at(-1).Body_Text.includes("SHA-256 "), "the seal in the mail is the SHA-256 one");
    const a = actions(h, amark);
    assert.deepEqual(a, ["Case: Gave final release", "Case: Case completed", "Final PDF: Generated final document", "Final PDF: Final PDF"]);
    // S-2: the PDF is attached to CIQ_Case_A00.Final_PDF BEFORE the case's last step was submitted
    const pdfs = h.item(caseItem).Final_PDF;
    assert.equal(pdfs.length, 1);
    assert.equal(pdfs[0].name, `${C}-final-document.pdf`);
    const bytes = h.fake.blob(pdfs[0].id);
    assert.equal(bytes.subarray(0, 8).toString("latin1"), "%PDF-1.4");
    assert.ok(bytes.toString("latin1").includes(row.Final_Document_Hash), "the PDF carries the seal");
    assert.ok(bytes.toString("latin1").includes("OP-0001-01"), "the PDF carries the open-point threads");
    assert.match(h.audit(C).at(-1).New_Value_Text, /Final PDF attached to CIQ_Case_A00\.Final_PDF Attach-/);
    // every supplier file was copied once into CIQ_Case_A00.Supplier_Files, byte for byte (Doc_Attachment_Id)
    const docsRows = h.caseRow(C)["Table::CIQ_Case_Data_A00_Documents"];
    const caseFiles = h.item(caseItem).Supplier_Files;
    assert.equal(caseFiles.length, docsRows.length);
    for (const d of docsRows) {
      assert.match(d.Doc_Key, /^Attach-/, "Doc_Key = the portal attachment id");
      const copy = caseFiles.find((a) => a.id === d.Doc_Attachment_Id);
      assert.ok(copy, `copy of ${d.Doc_File_Name}`);
      assert.deepEqual(h.fake.blob(copy.id), h.fake.blob(d.Doc_Key));
    }
    mark = h.outbox(C).length;
    amark = h.audit(C).length;
  });

  await t.test("after the lock: a supplier change is refused and logged (B-35), nothing is mirrored", async () => {
    const before = h.caseRow(C).Answers_JSON;
    await ravi.save(C, { answers: { "FLD-GEN-005": "New site in Reus" } });
    h.tick(16 * 60_000);
    await h.run();
    assert.equal(h.caseRow(C).Answers_JSON, before);
    assert.ok(actions(h, amark).includes("Change attempt: Change attempt refused"));
    amark = h.audit(C).length;
  });

  await t.test("8. a change report → CR-0001 child row, receipt on the request, C-17 to RMM", async () => {
    await elena.reportChange(C, "We changed the production site to Reus.");
    h.tick(16 * 60_000);
    await h.run();
    const crs = h.caseRow(C)["Table::CIQ_Case_Data_A00_Change_Reports"];
    assert.equal(crs.length, 1);
    assert.equal(crs[0].CR_Key, "CR-0001");
    assert.equal(crs[0].CR_By_Email, ELENA);
    assert.deepEqual(events(h, mark), [`change-reported → ${MAIL.RMM}`]);
    assert.deepEqual(actions(h, amark), ["Change request: Reported a change after release"]);
    // the completed request item is locked and no longer written (it is "keep up to date", still in progress)
    assert.equal(JSON.parse(h.requestItem(C).Change_Reports_JSON ?? "[]").length, 1);
  });

  await t.test("invariants of the prototype hold on the canonical case", () => {
    const c = h.ciq(C);
    const world = { ...D.buildSeed(), cases: [{ ...c, audit: [], internalNotes: [] }], mails: [] };
    const v = D.checkInvariants(world).filter((x) => !/audit|active rule set|not a published|never published/.test(x));
    assert.deepEqual(v, []);
  });
});
