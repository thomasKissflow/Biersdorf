import { uiClient } from "../fake.mjs";
// Cancel, reactivate and the request refusals (B-31, B-32, §4.13).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, toReview, completeAll, lastRequest, FLOW } from "./helpers.mjs";

const C = "CIQ-2026-0001";
const CONTACTS = "elena.marquez@solvaro.example, ravi.menon@solvaro.example";

async function withOpenPoint(h) {
  await h.wb("u-saf").request("op.raise", C, { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", fieldId: "FLD-A14-101", label: "K2.2 › Arsenic (As) content" }, question: "Please confirm the arsenic value.", justification: "Needed for the evaluation", dueDate: "2026-11-30T00:00:00.000Z" });
  await h.run();
  return h.ciq(C).openPoints[0].id;
}

test("cancel → every item withdrawn, request locked; reactivate within 365 d continues on new items", async () => {
  const h = setup();
  const caseItem = await toReview(h, C);
  const opId = await withOpenPoint(h);
  const reviewsBefore = Object.fromEntries(h.ciq(C).reviews.map((r) => [r.dept, h.reviewItem(C, r.dept)._id]));
  const query = h.queryItem(C, opId, 1)._id;
  const opItem = h.opItem(C, opId)._id;
  let mark = h.outbox(C).length;

  await h.wb("u-rmm").request("case.cancel", C, { reason: "The material is no longer needed." });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const c = h.ciq(C);
  assert.equal(c.phase, "cancelled");
  assert.equal(c.openPoints[0].outcome, "withdrawn");
  assert.equal(h.item(query)._status, "Withdrawn");
  assert.equal(h.item(opItem)._status, "Withdrawn");
  assert.equal(h.item(opItem).OP_Outcome, "Withdrawn");
  for (const id of Object.values(reviewsBefore)) {
    assert.equal(h.item(id)._status, "Withdrawn");
    assert.equal(h.item(id).Track_Status, "Ended");
  }
  const req = h.requestItem(C);
  assert.equal(req.Request_Locked, "Yes");
  assert.equal(req.Case_Phase_Label, "Cancelled");
  assert.equal(req._status, "InProgress", "the supplier keeps the (locked) request, V-07");
  const ci = h.item(caseItem);
  assert.equal(ci.Case_Phase, "Cancelled");
  assert.equal(ci.Cancel_Reason, "The material is no longer needed.");
  assert.equal(ci.Cancelled_From_Phase, "Review");
  assert.equal(ci._status, "InProgress", "cancel is not a native end");
  const ev = h.outbox(C).slice(mark).map((r) => `${r.Event_Code} → ${r.To_Emails}`);
  assert.ok(ev.includes(`cancelled → ${CONTACTS}`), ev.join(" | "));
  assert.ok(ev.some((e) => e.startsWith("cancelled → ") && e.includes("mira.hansen@")), "open track assignees told (C-15)");
  assert.ok(!ev.some((e) => e.includes("katrin.vogel@")), "never the canceller");
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Cancelled case" && r.Event_Category === "Cancellation"));

  // a request after the cancel is refused by the prototype's guard
  await h.wb("u-saf").request("op.raise", C, { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", label: "K2.2" }, question: "Another question?", justification: "x", dueDate: "2026-11-30T00:00:00.000Z" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /raised during the review/);

  // reactivate within 365 days: back to review, new review items (Reactivated), closed points stay closed
  mark = h.outbox(C).length;
  h.tick(30 * 86_400_000);
  await h.wb("u-rmm").request("case.reactivate", C, { reason: "Needed again for the 2027 launch.", dueDate: "2027-03-31" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const c2 = h.ciq(C);
  assert.equal(c2.phase, "review");
  assert.equal(c2.openPoints[0].status, "closed");
  for (const [dept, oldId] of Object.entries(reviewsBefore)) {
    const now = h.reviewItem(C, dept);
    assert.notEqual(now._id, oldId);
    assert.equal(now._status, "InProgress");
    assert.equal(now.Round_No, 2);
    assert.equal(now.Activation_Kind, "Reactivated");
  }
  assert.equal(h.requestItem(C).Request_Locked, "No");
  assert.equal(h.requestItem(C).Supplier_Due_Date, "2027-03-31");
  assert.equal(h.item(caseItem).Reactivate_Reason, "Needed again for the 2027 launch.");
  assert.ok(h.fake.rows(FLOW.scopeRun).some((r) => r.Case_Code === C && r.Scope_Trigger === "Reactivation"));
  const ev2 = h.outbox(C).slice(mark).map((r) => `${r.Event_Code} → ${r.To_Emails}`);
  assert.ok(ev2.includes(`reactivated → ${CONTACTS}`), ev2.join(" | "));
  // the case goes on to completion after the reactivation
  await completeAll(h, C);
  assert.equal(h.ciq(C).phase, "final-release");
});

test("H-12/H-13 (Thomas, 15 Oct): cancelled while the release is requested and reactivated: back to the release request, locked again", async () => {
  const h = setup();
  await toReview(h, C);
  await completeAll(h, C);
  assert.equal(h.requestItem(C).Request_Locked, "Yes");
  await h.wb("u-rmm").request("case.cancel", C, { reason: "Paused by the brand team." });
  await h.run();
  assert.deepEqual([h.requestItem(C).Request_Locked, h.requestItem(C).Case_Phase_Label], ["Yes", "Cancelled"]);
  await h.wb("u-rmm").request("case.reactivate", C, { reason: "Needed again." });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.equal(h.ciq(C).phase, "final-release");
  assert.deepEqual([h.requestItem(C).Request_Locked, h.requestItem(C).Case_Phase_Label], ["Yes", "Awaiting your final release"]);
  assert.equal(h.releaseItem(C)._status, "InProgress", "a new release task");
});

test("reactivation after 365 days is refused", async () => {
  const h = setup();
  await toReview(h, C);
  await h.wb("u-rmm").request("case.cancel", C, { reason: "Not needed." });
  await h.run();
  h.tick(400 * 86_400_000);
  await h.wb("u-rmm").request("case.reactivate", C, { reason: "Needed again." });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /12-month window/);
});

test("refusals: non-raiser accept, a waiting row changed by another user, a non-member, an unknown code", async () => {
  const h = setup();
  await toReview(h, C);
  const opId = await withOpenPoint(h);
  await h.sup("u-sup-1").answer(C, opId, 1, { text: "0.05 mg/kg" });
  await h.run();

  // another Safety reviewer (not the raiser) tries to accept (D-05)
  await h.wb("u-saf-2").request("op.accepted", C, { opId }, opId);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /Only Dr\. Mira Hansen can change this open point/);
  assert.equal(h.ciq(C).openPoints[0].status, "in-progress", "nothing changed");
  const refusedAudit = h.audit(C).find((r) => r.Action_Code === "Refused: op.accepted");
  assert.ok(refusedAudit);
  assert.equal(refusedAudit.Actor_Email, "ole.brandt@beiersdorf.example", "the actor is the platform _created_by");

  // a waiting request modified by someone else is refused (§4.13 step 2)
  const row = await h.wb("u-saf").request("op.accepted", C, { opId }, opId);
  const other = uiClient(h.fake, "u-rmm");
  await other.call("POST", `/form/2/${other.acc}/${FLOW.serviceRequest}/${row._id}?_application_id=CIQ_Digital_A00`, { Payload_JSON: JSON.stringify({ opId, text: "forged" }) });
  await h.run();
  const r2 = h.requests().find((r) => r._id === row._id);
  assert.equal(r2.Request_Status, "Refused");
  assert.match(r2.Result_Note, /changed by another user/);
  assert.equal(h.ciq(C).openPoints[0].status, "in-progress");

  // the platform author must hold the role (§4.13 step 3)
  await h.wb("u-cus").request("op.raise", C, { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", label: "K2.2" }, question: "Q?", justification: "x", dueDate: "2026-11-30T00:00:00.000Z" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /not a member of Safety/);

  await h.wb("u-rmm").request("case.explode", C, {});
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");

  // the raiser accepts: allowed
  await h.wb("u-saf").request("op.accepted", C, { opId }, opId);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.equal(h.ciq(C).openPoints[0].outcome, "accepted");
});

test("a request carried out once is never carried out twice (idempotent replay and duplicate Request_Key)", async () => {
  const h = setup();
  await toReview(h, C);
  await withOpenPoint(h);
  const opsBefore = h.ciq(C).openPoints.length;
  const mailsBefore = h.outbox(C).length;
  // a replay of the whole case changes nothing
  const rep = await h.service.replay(C);
  assert.equal(rep.created.length, 0);
  assert.equal(h.ciq(C).openPoints.length, opsBefore);
  assert.equal(h.outbox(C).length, mailsBefore);
});

test("Case_Code clash: a second case item with the same code is refused and RMM is told", async () => {
  const h = setup();
  await toReview(h, C);
  const rmm = h.wb("u-rmm");
  const second = await rmm.createCase({ Case_Code: C });
  await rmm.request("case.created", C, { caseItemId: second }, second);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /already used/);
  assert.ok(h.outbox().some((r) => r.Event_Code === "alert" && r.To_Emails === "katrin.vogel@beiersdorf.example"));
});

test("H-13 + H-02 (Thomas, 15 Oct): a save that reached the cancelled request is refused before the reactivation unlocks it, and never mirrored later", async () => {
  const h = setup();
  await toReview(h, C);
  await h.wb("u-rmm").request("case.cancel", C, { reason: "Paused by the brand team." });
  await h.run();
  const before = h.ciq(C);
  assert.equal(h.requestItem(C).Request_Locked, "Yes");
  // an older page still saves on the cancelled request; RMM reactivates before the service ran
  await h.sup("u-sup-2").save(C, { answers: { "FLD-GEN-005": "Plant 3, Reus" } });
  await h.wb("u-rmm").request("case.reactivate", C, { reason: "Needed again." });
  const amark = h.audit(C).length;
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const c = h.ciq(C);
  assert.equal(c.phase, "review");
  assert.equal(h.requestItem(C).Request_Locked, "No");
  assert.equal(c.answers["FLD-GEN-005"], before.answers["FLD-GEN-005"], "refused while cancelled, not applied after the reactivation");
  assert.equal(JSON.parse(h.requestItem(C).Answers_JSON)["FLD-GEN-005"], before.answers["FLD-GEN-005"], "set back on the request");
  const actions = h.audit(C).slice(amark).map((r) => r.Action_Code);
  assert.ok(actions.indexOf("Change attempt refused") >= 0 && actions.indexOf("Change attempt refused") < actions.indexOf("Reactivated case"), actions.join(" | "));
  await h.sup("u-sup-1").save(C, { answers: { "FLD-A14-102": 0.04 } });
  await h.run();
  assert.equal(h.ciq(C).answers["FLD-GEN-005"], before.answers["FLD-GEN-005"]);
  assert.equal(h.ciq(C).answers["FLD-A14-102"], 0.04);
});
