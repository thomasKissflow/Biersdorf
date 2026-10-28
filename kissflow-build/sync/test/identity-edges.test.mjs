// Edge cases of the identity contract (identity.mjs, directory.mjs, handlers) found in review, 15 Oct. One test per
// finding; all offline on the fake. People and suppliers are fictional.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDirectory } from "../directory.mjs";
import { MINTED, mintId, kfId, uidOfMinted, unmint } from "../identity.mjs";
import { makeClock, createFake, uiClient } from "../fake.mjs";
import { createPort, IdentityLeakError, DeferredError } from "../kissflow.mjs";
import { createService } from "../service.mjs";
import { ROLE_DEPT, ROLE_PERSONA } from "../ids.mjs";
import { setup, people, dualPeople, zztDevSupplier, solvaroSupplier, dualCaseFields, toReview, fillUntilComplete, completeReview, completeAll, lastRequest, DUAL, SVC_USER, PLAIN_CONFIG, FLOW, J } from "./helpers.mjs";

const C = "CIQ-2026-0001";
const APP = "CIQ_Digital_A00";
const PORTAL_Q = "_application_id=CIQ_Supplier_Portal_A00";
const noMinted = (h) => {
  for (const flow of Object.keys(h.fake.schema)) for (const r of h.fake.rows(flow)) assert.ok(!JSON.stringify(r).includes("sup:"), `${flow}/${r._id} holds a minted id`);
};

/** A portal UI write as `userId` at the item's current step (no e-mail fields unless given), optionally submitted. */
async function portalWrite(h, userId, flow, itemId, fields, { submit = false } = {}) {
  const c = uiClient(h.fake, userId);
  const inst = h.fake.item(itemId)._current_context[0]._context_activity_instance_id;
  const w = await c.call("POST", `/process/2/${c.acc}/${flow}/${itemId}/${inst}?${PORTAL_Q}`, fields);
  assert.ok(w.status < 300, JSON.stringify(w.body));
  if (submit) {
    const s = await c.call("POST", `/process/2/${c.acc}/${flow}/${itemId}/${inst}/submit?${PORTAL_Q}`, {});
    assert.ok(s.status < 300, JSON.stringify(s.body));
  }
}

// ---------------------------------------------------------------------------------------------- 1. Supplier_Code with " " or ":"

test("finding 1: a Supplier_Code with a space or ':' still gives a reversible minted id; the leak message names the uid only", () => {
  for (const code of ["ZZT DEV", "ZZT:DEV", "ZZT\tDEV"]) {
    const id = mintId(code, DUAL.id);
    assert.ok(MINTED.test(id), `${JSON.stringify(code)} → ${id}`);
    assert.equal(uidOfMinted(id), DUAL.id);
    assert.equal(kfId(id, new Set([id])), DUAL.id);
    const e = new IdentityLeakError("create X", id);
    assert.ok(e.message.includes(DUAL.id) && !e.message.includes(id), e.message);
  }
  assert.equal(mintId("ZZT-DEV", DUAL.id), `sup:ZZT-DEV:${DUAL.id}`, "plain codes are unchanged");
});

for (const code of ["ZZT DEV", "ZZT:DEV"]) {
  test(`finding 1: the dual user at supplier "${code}" files case.created → Done, Case Data created, writes carry the Kissflow id`, async () => {
    const sup = zztDevSupplier();
    sup.fields.Supplier_Code = code;
    const h = setup({ users: dualPeople(), suppliers: [sup] });
    const me = h.wb(DUAL.id);
    const item = await me.createCase({ Case_Code: C, ...dualCaseFields({ Supplier_Code: code }) });
    await me.request("case.created", C, { caseItemId: item }, item);
    await h.run();
    assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
    assert.ok(h.caseRow(C), "the Case Data row exists");
    assert.deepEqual(h.requestItem(C).Assigned_Contacts.map((x) => x._id), [DUAL.id]);
    await h.sup(DUAL.id).save(C, { config: PLAIN_CONFIG });
    await h.run();
    assert.deepEqual(h.ciq(C).config.SF01, ["vegetable"]);
    assert.equal(h.ciq(C).answeredBy.SF01.by, DUAL.id);
    noMinted(h);
  });
}

test("finding 1: an error carrying a minted id still lands as Failed (attempt 1/3) with the uid; the retry then succeeds", async () => {
  const h = setup({ users: dualPeople(), suppliers: [zztDevSupplier()] });
  const MINT = mintId(DUAL.supplier, DUAL.id);
  const me = h.wb(DUAL.id);
  const item = await me.createCase({ Case_Code: C, ...dualCaseFields() });
  await me.request("case.created", C, { caseItemId: item }, item);
  const real = h.port.getProcessItemAdmin;
  let once = true;
  h.port.getProcessItemAdmin = async (flow, id) => {
    if (flow === FLOW.caseProc && once) {
      once = false;
      throw new Error(`simulated failure near ${MINT}`);
    }
    return real(flow, id);
  };
  await h.run();
  const row = lastRequest(h);
  assert.equal(row.Request_Status, "Failed");
  assert.match(row.Result_Note, /^Failed \(attempt 1\/3\): simulated failure near UsDUAL00001$/);
  h.port.getProcessItemAdmin = real;
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  noMinted(h);
});

// ---------------------------------------------------------------------------------------------- 2. look-ups stay at the case's supplier

test("finding 2: the dual user is Solvaro's contact (old e-mail) AND ZZT-DEV's: a save on an s1 case is attributed to the s1 contact", async () => {
  const s1 = solvaroSupplier();
  s1.contacts[0].Contacts_Portal_User_Id = DUAL.id; // keeps Elena's fictional e-mail
  const h = setup({ users: [...people(), dualPeople()[0]], suppliers: [s1, zztDevSupplier()] });
  const sIn1 = mintId("s1", DUAL.id);
  // the directory look-ups never cross to ZZT-DEV for an s1 case
  const dir = (await h.service.makeCtx()).directory;
  assert.equal(dir.contactByEmail(DUAL.email, "s1"), undefined);
  assert.equal(dir.contactByEmail(DUAL.email, DUAL.supplier).id, mintId(DUAL.supplier, DUAL.id));
  assert.equal(dir.contactIdFor(DUAL.id, "s1"), sIn1);
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C, Portal_Contact_Ids: DUAL.id, Confirm_Contact_Ids: DUAL.id, Supplier_Contact_Emails: "elena.marquez@solvaro.example" });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  await h.sup(DUAL.id).save(C, { config: PLAIN_CONFIG }); // writes the dual user's own (ZZT-DEV) e-mail
  await h.run();
  assert.deepEqual(h.ciq(C).config.SF01, ["vegetable"], "the save is applied");
  assert.equal(h.ciq(C).answeredBy.SF01.by, DUAL.id);
  assert.deepEqual(h.audit(C).filter((r) => /not applied/.test(r.Action_Code)).map((r) => r.New_Value_Text), []);
  const scope = h.audit(C).find((r) => r.Action_Code === "Scope follows answers");
  assert.deepEqual([scope.Actor_Side, scope.Actor_Name], ["Supplier", "Elena Márquez"], "the s1 contact row, not 'Dana Devtest (dev supplier)'");
  noMinted(h);
});

// ---------------------------------------------------------------------------------------------- 3. Actor_Dept per department

test("finding 3: audit Actor_Dept of the dual user is the department it acted in (SAF raise, QM/SAF reviews, RMES)", async () => {
  const h = setup({ users: dualPeople(), suppliers: [zztDevSupplier()] });
  // SF-09 (EUDR) opens K6.17, so Sustainability reviews too (since 28 Oct it leads no other section of a vegetable case)
  await toReview(h, C, { config: { ...PLAIN_CONFIG, SF09: true }, caseFields: dualCaseFields(), rmm: DUAL.id, supplier: DUAL.id });
  await h.wb(DUAL.id).request("op.raise", C, { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", label: "K2.2" }, question: "Please confirm.", justification: "Needed", dueDate: "2026-11-30T00:00:00.000Z" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  for (const d of ["QM", "MIC", "SUS"]) {
    const r = await completeReview(h, C, d, { by: DUAL.id });
    assert.equal(r.Request_Status, "Done", `${d}: ${r.Result_Note}`);
  }
  const deptOf = (re) => h.audit(C).filter((r) => re.test(r.Action_Code)).map((r) => `${r.Actor_Side}:${r.Actor_Dept}`);
  assert.deepEqual(deptOf(/^Created case/), ["BDF:RMM"]);
  assert.deepEqual(deptOf(/^Raised query/), ["BDF:SAF"]);
  assert.deepEqual(deptOf(/^Completed QM review/), ["BDF:QM"]);
  assert.deepEqual(deptOf(/^Completed Microbiology review/), ["BDF:MIC"]);
  assert.deepEqual(deptOf(/^Completed Sustainability review/), ["BDF:SUS"]);
  assert.deepEqual(deptOf(/^Confirmed completeness/), ["Supplier:undefined"]);
});

// ---------------------------------------------------------------------------------------------- 4. H-00 on Failed rows

/** RMM files review.completed before its item is completed → Failed (attempt 1/3). */
async function failedReviewRequest(h) {
  await toReview(h, C);
  await h.wb("u-rmm").request("review.completed", C, { dept: "RMM" });
  await h.run();
  const row = lastRequest(h);
  assert.equal(row.Request_Status, "Failed");
  assert.match(row.Result_Note, /attempt 1\/3/);
  return row;
}

/** Another member (REG) rewrites that row into a cancellation (Form grants are per Form, §4.13). */
async function hijack(h, row, who = "u-reg") {
  const c = uiClient(h.fake, who);
  const r = await c.call("POST", `/form/2/${c.acc}/${FLOW.serviceRequest}/${row._id}?_application_id=${APP}`, { Request_Code: "case.cancel", Payload_JSON: JSON.stringify({ reason: "hijacked by REG" }) });
  assert.equal(r.status, 200);
  assert.equal(h.fake.item(row._id)._modified_by._id, who);
}

test("finding 4: a Failed request rewritten by another user is refused, never run as the original requester", async () => {
  const h = setup();
  const row = await failedReviewRequest(h);
  await hijack(h, row);
  const mails = h.outbox(C).length;
  await h.run();
  const after = h.fake.item(row._id);
  assert.equal(after.Request_Status, "Refused");
  assert.equal(after.Result_Note, "This request was changed by another user after it was filed. File it again.");
  assert.notEqual(h.ciq(C).phase, "cancelled");
  assert.deepEqual(h.outbox(C).slice(mails).filter((r) => r.Event_Code === "cancelled"), []);
  assert.ok(!h.audit(C).some((r) => r.Action_Code === "Cancelled case"));
});

test("finding 4: a Failed request the service itself wrote back is still retried (and runs once its item is completed)", async () => {
  const h = setup();
  const row = await failedReviewRequest(h);
  await h.run();
  assert.match(h.fake.item(row._id).Result_Note, /attempt 2\/3/, "retried, not refused");
  // the RMM review item gets completed; the next retry applies it
  await completeAll(h, C);
  assert.equal(h.ciq(C).reviews.find((r) => r.dept === "RMM").status, "completed");
});

test("finding 4: without CIQ_SERVICE_USER_ID, a restarted service still tells its own Failed write-back (host state) from a hijack", async () => {
  const h = setup({ serviceUserId: null });
  const row = await failedReviewRequest(h);
  const restart = () => {
    const port = createPort({ kf: h.fake.key, files: h.fake.keyFiles, now: () => h.clock.now(), serviceUserId: null, minIntervalMs: 0 });
    return createService({ port, now: () => h.clock.now().toISOString(), state: h.state, linkBase: { internal: "https://workbench.example.test/#", supplier: "https://portal.example.test/#" } });
  };
  h.tick(60_000);
  await restart().runOnce();
  assert.match(h.fake.item(row._id).Result_Note, /attempt 2\/3/, "a new process retries its own Failed row");
  await hijack(h, row);
  h.tick(60_000);
  await restart().runOnce();
  assert.equal(h.fake.item(row._id).Request_Status, "Refused");
  assert.notEqual(h.ciq(C).phase, "cancelled");
});

// ---------------------------------------------------------------------------------------------- 5. submitter beats a forged e-mail

test("finding 5: a contact who may not confirm cannot confirm completeness by writing a colleague's e-mail", async () => {
  const s1 = solvaroSupplier();
  s1.contacts[1].Contacts_Can_Confirm = "No"; // Ravi
  const h = setup({ suppliers: [s1] });
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  await h.sup("u-sup-2").save(C, { config: PLAIN_CONFIG });
  await h.run();
  await fillUntilComplete(h, C, "u-sup-2");
  h.tick(60_000);
  await portalWrite(h, "u-sup-2", FLOW.request, h.ledger(C).items.request, { Completeness_Confirm: "Confirmed", Completeness_By_Name: "Elena Márquez", Completeness_By_Email: "elena.marquez@solvaro.example", Completeness_By_Role: "Regulatory Manager", Completeness_At: "2026-10-15T09:00:00Z" }, { submit: true });
  const hb = await h.run();
  const c = h.ciq(C);
  assert.equal(c.phase, "supplier-input", "the case does not move");
  assert.ok(!c.confirmations.some((x) => x.type === "completeness"));
  const a = h.audit(C).find((r) => r.Action_Code === "Completeness confirmation not applied");
  assert.ok(a, "the refusal is audited");
  assert.equal(a.Actor_Name, "Ravi Menon", "attributed to the submitter, not to the e-mail");
  assert.ok(hb.warnings.some((w) => w.startsWith("identity: portal item") && w.includes("u-sup-1") && w.includes("u-sup-2")));
  assert.ok(/may not confirm/.test(a.New_Value_Text), a.New_Value_Text);
});

test("finding 5: a query answer submitted by Ravi with Elena's e-mail is Ravi's answer", async () => {
  const h = setup();
  await toReview(h, C);
  await h.wb("u-saf").request("op.raise", C, { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", label: "K2.2" }, question: "Please confirm.", justification: "Needed", dueDate: "2026-11-30T00:00:00.000Z" });
  await h.run();
  const opId = h.ciq(C).openPoints[0].id;
  h.tick(60_000);
  await portalWrite(h, "u-sup-2", FLOW.query, h.ledger(C).items[`query:${opId}:r1`], { Response_Kind: "Answer", Response_Text: "Confirmed.", Response_Doc_Refs_JSON: "[]", Supplier_Responsible_Email: "elena.marquez@solvaro.example" }, { submit: true });
  await h.run();
  const answered = h.ciq(C).openPoints[0].thread.find((m) => m.side === "supplier");
  assert.equal(answered.by, "u-sup-2");
});

// ---------------------------------------------------------------------------------------------- 6. free text is never "unminted"

test("finding 6: a supplier answer shaped like 'sup:<x>:<y>' is stored unchanged (no shared user, and with one)", async () => {
  for (const dual of [false, true]) {
    const h = dual ? setup({ users: [...people(), dualPeople()[0]], suppliers: [solvaroSupplier(), zztDevSupplier()] }) : setup();
    const rmm = h.wb("u-rmm");
    const item = await rmm.createCase({ Case_Code: C });
    await rmm.request("case.created", C, { caseItemId: item }, item);
    await h.run();
    await h.sup("u-sup-2").save(C, { answers: { "FLD-GEN-004": "sup:ES:Tarragona" } });
    await h.run();
    assert.equal(J(h.caseRow(C).Answers_JSON)["FLD-GEN-004"], "sup:ES:Tarragona", `dual=${dual}`);
    assert.equal(h.ciq(C).answers["FLD-GEN-004"], "sup:ES:Tarragona");
  }
  assert.equal(unmint({ a: "sup:ES:Tarragona" }, new Set([mintId("ES", "Tarragona-not-minted")])).a, "sup:ES:Tarragona");
});

// ---------------------------------------------------------------------------------------------- 7. modifier near the service's write

test("finding 7: without CIQ_SERVICE_USER_ID, a supplier save in the same ms as the service's write keeps its modifier as actor", async () => {
  const h = setup({ serviceUserId: null });
  const rmm = h.wb("u-rmm");
  const item = await rmm.createCase({ Case_Code: C });
  await rmm.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  const reqId = h.ledger(C).items.request;
  // the same instant as the service's last write, no e-mail fields at all
  await portalWrite(h, "u-sup-1", FLOW.request, reqId, { Config_Answers_JSON: JSON.stringify({ SF11: ["EU"], ...PLAIN_CONFIG }), Answers_Rev: 1 });
  assert.equal(h.fake.item(reqId)._modified_at, h.clock.now().toISOString());
  await h.run();
  assert.deepEqual(h.ciq(C).config.SF01, ["vegetable"], "applied");
  assert.equal(h.ciq(C).answeredBy.SF01.by, "u-sup-1");
  assert.ok(!h.audit(C).some((r) => /not applied/.test(r.Action_Code)));
});

// ---------------------------------------------------------------------------------------------- 8. a uid twice at one supplier

test("finding 8: a portal user listed twice at one supplier: Kissflow writes use the last row, as before identity.mjs", async () => {
  const s1 = solvaroSupplier();
  s1.contacts.push({ ...s1.contacts[1], Contacts_Key: "s1-c9", Contacts_Title: "QA Lead (new title)", Contacts_Can_Confirm: "No" });
  const h = setup({ suppliers: [s1] });
  await toReview(h, C);
  const ravi = J(h.requestItem(C).Case_Contacts_JSON).find((x) => x.id === "u-sup-2");
  assert.deepEqual([ravi.title, ravi.mayConfirm], ["QA Lead (new title)", false]);
  await completeAll(h, C);
  assert.equal(h.ciq(C).phase, "final-release");
  assert.deepEqual(h.releaseItem(C).Assigned_Contacts.map((x) => x._id), ["u-sup-1"]);
  const hb = await h.run();
  assert.ok(hb.warnings.some((w) => /lists portal user u-sup-2 twice \(contact s1-c9\): look-ups by id use the last row/.test(w)));
});

// ---------------------------------------------------------------------------------------------- 9. own-write check at live precision

/** The fake's key client, answering `_modified_at` / `_created_at` at whole seconds as live Kissflow does. */
function secondsKey(fake) {
  const floor = (v) => (typeof v === "string" ? v.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+Z$/, "$1Z") : v);
  const walk = (b) => {
    if (Array.isArray(b)) return b.map(walk);
    if (b && typeof b === "object") return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, k === "_modified_at" || k === "_created_at" ? floor(v) : walk(v)]));
    return b;
  };
  return { ...fake.key, call: async (m, p, b, o) => { const r = await fake.key.call(m, p, b, o); return { ...r, body: walk(r.body) }; } };
}

test("finding 9: distrusted key user, whole-second stamps: a holder write in the same second as the service's is not taken for its own", async () => {
  const clock = makeClock("2026-10-15T07:00:00.000Z");
  const fake = createFake({ users: dualPeople({ serviceRole: true }), keyUserId: DUAL.id, clock });
  const port = createPort({ kf: secondsKey(fake), now: () => clock.now(), serviceUserId: DUAL.id, minIntervalMs: 0 });
  port.setServiceUserTrusted(false);
  const it = await port.createAndSubmit(FLOW.review, { Review_Key: "K-SAF", Case_Code: "C", Case_Item_Id: "Pk1", Review_Dept: "SAF" });
  clock.advance(200); // 07:00:00.200
  await port.adminUpdate(FLOW.review, it.id, { Open_Count: 1 });
  // the service writes again in the same second: its own write, not deferred
  await port.adminUpdate(FLOW.review, it.id, { Open_Count: 2 }, {});
  assert.equal(fake.item(it.id).Open_Count, 2);
  // the same person, through the Workbench, writes at 07:00:00.700
  clock.advance(500);
  const ui = uiClient(fake, DUAL.id);
  const inst = fake.item(it.id)._current_context[0]._context_activity_instance_id;
  assert.equal((await ui.call("POST", `/process/2/${fake.acc}/${FLOW.review}/${it.id}/${inst}?_application_id=${APP}`, { Review_Confirm: "Confirmed" })).status, 200);
  await assert.rejects(port.adminUpdate(FLOW.review, it.id, { Open_Count: 3 }), DeferredError);
  // 2 s after the END of that second the write goes ahead
  clock.advance(2400); // 07:00:03.100
  await port.adminUpdate(FLOW.review, it.id, { Open_Count: 3 });
  assert.equal(fake.item(it.id).Open_Count, 3);
  assert.equal(fake.item(it.id).Review_Confirm, "Confirmed", "the holder's value is kept");
});

// ---------------------------------------------------------------------------------------------- 10. portal writes without e-mail fields

const dualKeyCase = async (h) => {
  const me = h.wb(DUAL.id);
  const item = await me.createCase({ Case_Code: C, ...dualCaseFields() });
  await me.request("case.created", C, { caseItemId: item }, item);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  return h.ledger(C).items.request;
};

for (const serviceUserId of [DUAL.id, null]) {
  test(`finding 10: key user = portal user (service user ${serviceUserId ?? "unset"}): a save without e-mail fields is never pinned on the contact`, async () => {
    const h = setup({ users: dualPeople({ serviceRole: true }), suppliers: [zztDevSupplier()], keyUserId: DUAL.id, serviceUserId });
    const reqId = await dualKeyCase(h);
    h.tick(60_000);
    await portalWrite(h, DUAL.id, FLOW.request, reqId, { Config_Answers_JSON: JSON.stringify({ SF11: ["EU"], ...PLAIN_CONFIG }), Answers_Rev: 1 });
    await h.run();
    assert.equal(h.ciq(C).config.SF01, undefined, "not applied: only the e-mail fields can tell who acted");
    const a = h.audit(C).find((r) => r.Action_Code === "Change not applied");
    assert.ok(a && /Unknown user/.test(a.New_Value_Text), JSON.stringify(a));
    noMinted(h);
  });
}

test("finding 10: after a key rotation to the portal user (items created by the old key), CIQ_SERVICE_USER_ID still keeps the key's own modifier out", async () => {
  const h = setup({ users: [...dualPeople({ serviceRole: true }), { ...SVC_USER }], suppliers: [zztDevSupplier()], keyUserId: "u-svc", serviceUserId: "u-svc" });
  const reqId = await dualKeyCase(h);
  assert.equal(h.fake.item(reqId)._created_by._id, "u-svc");
  // the key now belongs to the dual user (who is also the portal user)
  const port = createPort({ kf: h.fake.clientFor(DUAL.id, { viaKey: true }), now: () => h.clock.now(), serviceUserId: DUAL.id, minIntervalMs: 0 });
  const service = createService({ port, now: () => h.clock.now().toISOString(), state: h.state, linkBase: { internal: "https://workbench.example.test/#", supplier: "https://portal.example.test/#" } });
  h.tick(60_000);
  await portalWrite(h, DUAL.id, FLOW.request, reqId, { Config_Answers_JSON: JSON.stringify({ SF11: ["EU"], ...PLAIN_CONFIG }), Answers_Rev: 1 });
  h.tick(60_000);
  const hb = await service.runOnce();
  assert.deepEqual(hb.errors, []);
  assert.equal(h.ciq(C).config.SF01, undefined, "the key's own user as modifier proves nothing");
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Change not applied" && /Unknown user/.test(r.New_Value_Text)));
});

test("finding 10: key user = portal user: Answered_By_JSON 'by' (a Kissflow id) attributes the save to the contact", async () => {
  const h = setup({ users: dualPeople({ serviceRole: true }), suppliers: [zztDevSupplier()], keyUserId: DUAL.id, serviceUserId: DUAL.id });
  const reqId = await dualKeyCase(h);
  h.tick(60_000);
  const at = "2026-10-15T07:05:00Z";
  const who = Object.fromEntries(Object.keys(PLAIN_CONFIG).map((k) => [k, { by: DUAL.id, at }]));
  await portalWrite(h, DUAL.id, FLOW.request, reqId, { Config_Answers_JSON: JSON.stringify({ SF11: ["EU"], ...PLAIN_CONFIG }), Answered_By_JSON: JSON.stringify(who), Answers_Rev: 1 });
  await h.run();
  assert.deepEqual(h.ciq(C).config.SF01, ["vegetable"]);
  assert.equal(h.ciq(C).answeredBy.SF01.by, DUAL.id, "stored as the Kissflow id");
  const scope = h.audit(C).find((r) => r.Action_Code === "Scope follows answers");
  assert.deepEqual([scope.Actor_Side, scope.Actor_Name], ["Supplier", DUAL.contactName]);
  noMinted(h);
});

test("directory: a world built from role members only (no suppliers) mints nothing and its kfId/unmint are the identity", () => {
  const roleMembers = {};
  for (const roleId of [...Object.keys(ROLE_DEPT), ...Object.keys(ROLE_PERSONA)]) roleMembers[roleId] = [];
  const dir = buildDirectory({ roleMembers, supplierRows: [] });
  const v = { a: "sup:x:y" };
  assert.equal(dir.unmint(v), v);
  assert.equal(dir.kfId("sup:x:y"), "sup:x:y");
  assert.equal(dir.scrub("sup:x:y"), "sup:x:y");
});
