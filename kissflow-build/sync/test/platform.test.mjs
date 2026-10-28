// The fake reproduces the platform behaviours the design depends on (plan v5 §1.2), and the port handles them:
// write-then-verify, child-row ids, deferrals, 429 / Cloudflare challenge, pacing, dry-run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFake, makeClock, CHALLENGE_HTML } from "../fake.mjs";
import { createPort, UnreadableError, BackoffError, DeferredError } from "../kissflow.mjs";
import { verifyIds, verifySummary, FLOW, ROLE } from "../ids.mjs";
import { people, setup, toReview } from "./helpers.mjs";

const Q = (c) => `_application_id=${c}`;
const APP = "CIQ_Digital_A00";
const PORTAL = "CIQ_Supplier_Portal_A00";

function world() {
  const clock = makeClock();
  const fake = createFake({ users: people(), keyUserId: "u-svc", clock });
  const key = fake.key;
  return { clock, fake, key };
}

async function newReview(key, dept = "SAF", extra = {}) {
  const c = await key.call("POST", `/process/2/${key.acc}/${FLOW.review}?${Q(APP)}`, { Review_Key: `K-${dept}`, Case_Code: "CIQ-2026-0009", Case_Item_Id: "Pk1", Review_Dept: dept, ...extra });
  return c.body;
}

test("fake: field-level Required is enforced at the Start submit; step routing by a Select value", async () => {
  const { fake, key } = world();
  const bad = await key.call("POST", `/process/2/${key.acc}/${FLOW.review}?${Q(APP)}`, { Review_Key: "K", Case_Code: "C" });
  const sub = await key.call("POST", `/process/2/${key.acc}/${FLOW.review}/${bad.body._id}/${bad.body._activity_instance_id}/submit?${Q(APP)}`, {});
  assert.equal(sub.status, 400);
  assert.deepEqual(sub.body.args.validation_errors.sort(), ["Case_Item_Id", "Review_Dept"]);
  const ok = await newReview(key, "QM");
  const s2 = await key.call("POST", `/process/2/${key.acc}/${FLOW.review}/${ok._id}/${ok._activity_instance_id}/submit?${Q(APP)}`, {});
  assert.equal(s2.status, 200);
  assert.equal(fake.item(ok._id)._current_context[0]._context_current_step, "Review – QM");
});

test("fake: the key cannot update fields after Start (050313); the admin route can; _created_by/_modified_by are the platform's", async () => {
  const { fake, key } = world();
  const it = await newReview(key, "SAF", { _created_by: { _id: "u-rmm" } });
  await key.call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${it._activity_instance_id}/submit?${Q(APP)}`, {});
  const inst = fake.item(it._id)._current_context[0]._context_activity_instance_id;
  const r = await key.call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${inst}?${Q(APP)}`, { Open_Count: 1 });
  assert.equal(r.status, 400);
  assert.equal(r.body.error_code, "KISSFLOW_ERROR_050313");
  const a = await key.call("PUT", `/process/2/${key.acc}/admin/${FLOW.review}/${it._id}?${Q(APP)}`, { Open_Count: 1 });
  assert.equal(a.status, 200);
  assert.equal(fake.item(it._id).Open_Count, 1);
  assert.equal(fake.item(it._id)._created_by._id, "u-svc", "a sent _created_by is ignored");
  // a real member of the step's role may write and submit at its step (the S-1 assumption)
  const saf = fake.clientFor("u-saf");
  assert.equal((await saf.call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${inst}?${Q(APP)}`, { Review_Confirm: "Confirmed" })).status, 200);
  assert.equal(fake.item(it._id)._modified_by._id, "u-saf");
  // a user whose role does not own the step cannot submit it
  const qm = fake.clientFor("u-qm");
  assert.equal((await qm.call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${inst}/submit?${Q(APP)}`, {})).status, 400);
  // nor can the key (its user is in Integration service only)
  assert.equal((await key.call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${inst}/submit?${Q(APP)}`, {})).status, 400);
  assert.equal((await saf.call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${inst}/submit?${Q(APP)}`, {})).status, 200);
  assert.equal(fake.item(it._id)._status, "Completed");
});

test("fake: withdraw is the initiator's action and terminal; a stale instance id cannot submit (S-5)", async () => {
  const { fake, key } = world();
  const q = await key.call("POST", `/process/2/${key.acc}/${FLOW.query}?${Q(PORTAL)}`, { Query_Key: "Q1", Round_No: 1, Case_Code: "C", Cycle_No: 1, Supplier_Code: "s1", App_Open_Point_Id: "Pk", Kind_Label: "Question", Responsible_Department: "Product Safety", Responsible_Name: "Mira", Ref_Kind: "Field", Ref_Section_Key: "K2.2", Ref_Label: "x", Question_Text: "q", Supplier_Justification: "j", Supplier_Due_Date: "2026-11-30", Assigned_Contacts: [] });
  const empty = await key.call("POST", `/process/2/${key.acc}/${FLOW.query}/${q.body._id}/${q.body._activity_instance_id}/submit?${Q(PORTAL)}`, {});
  assert.equal(empty.status, 400, "no assignee for the field-assigned step");
  await key.call("PUT", `/process/2/${key.acc}/admin/${FLOW.query}/${q.body._id}?${Q(PORTAL)}`, { Assigned_Contacts: [{ _id: "u-sup-1" }] });
  assert.equal((await key.call("POST", `/process/2/${key.acc}/${FLOW.query}/${q.body._id}/${q.body._activity_instance_id}/submit?${Q(PORTAL)}`, {})).status, 200);
  const stale = await fake.clientFor("u-sup-1").call("POST", `/process/2/${key.acc}/${FLOW.query}/${q.body._id}/${q.body._activity_instance_id}/submit?${Q(PORTAL)}`, {});
  assert.equal(stale.status, 400, "the Start instance id is stale after the first step");
  assert.equal((await fake.clientFor("u-sup-1").call("POST", `/process/2/${key.acc}/${FLOW.query}/${q.body._id}/withdraw?${Q(PORTAL)}`, { Comment: "x" })).status, 403);
  assert.equal((await key.call("POST", `/process/2/${key.acc}/${FLOW.query}/${q.body._id}/withdraw?${Q(PORTAL)}`, { Comment: "x" })).status, 200);
  assert.equal(fake.item(q.body._id)._status, "Withdrawn");
  assert.equal((await key.call("POST", `/process/2/${key.acc}/${FLOW.query}/${q.body._id}/withdraw?${Q(PORTAL)}`, { Comment: "x" })).status, 400, "terminal");
  assert.equal((await key.call("PUT", `/process/2/${key.acc}/admin/${FLOW.query}/${q.body._id}?${Q(PORTAL)}`, { Edit_Note: "x" })).status, 400, "no writes on an ended item");
});

test("fake: a Form create replaces child-row ids; a modify with an unknown row id adds a row (P9); one draft per user", async () => {
  const { fake, key } = world();
  const t = "CIQ_Case_Data_A00_Components";
  await key.call("POST", `/form/2/${key.acc}/${FLOW.caseData}?${Q(APP)}`, { Case_Code: "C1", [`Table::${t}`]: [{ _id: `${t}_client1`, Comp_Row_Id: "c1", Comp_INCI: "A" }] });
  const row = (await key.call("POST", `/form/2/${key.acc}/${FLOW.caseData}/draft_u-svc/submit?${Q(APP)}`, {})).body;
  assert.notEqual(row[`Table::${t}`][0]._id, `${t}_client1`);
  await key.call("POST", `/form/2/${key.acc}/${FLOW.caseData}/${row._id}?${Q(APP)}`, { [`Table::${t}`]: [{ _id: `${t}_client1`, Comp_Row_Id: "c1", Comp_INCI: "B" }] });
  assert.equal(fake.item(row._id)[`Table::${t}`].length, 2, "the stale id added a duplicate");
  // two creates by one user before a submit: the second replaces the draft (D-7)
  await key.call("POST", `/form/2/${key.acc}/${FLOW.caseData}?${Q(APP)}`, { Case_Code: "A" });
  await key.call("POST", `/form/2/${key.acc}/${FLOW.caseData}?${Q(APP)}`, { Case_Code: "B" });
  const first = await key.call("POST", `/form/2/${key.acc}/${FLOW.caseData}/draft_u-svc/submit?${Q(APP)}`, {});
  const second = await key.call("POST", `/form/2/${key.acc}/${FLOW.caseData}/draft_u-svc/submit?${Q(APP)}`, {});
  assert.equal(first.body.Case_Code, "B");
  assert.equal(second.status, 404);
});

test("port: write-then-verify re-applies a lost update (P3) and gives up after 3 attempts", async () => {
  const { fake, key, clock } = world();
  const it = await newReview(key);
  await key.call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${it._activity_instance_id}/submit?${Q(APP)}`, {});
  const port = createPort({ kf: key, now: () => clock.now(), serviceUserId: "u-svc", minIntervalMs: 0 });
  fake.dropNextWrites(it._id, 1);
  const r = await port.adminUpdate(FLOW.review, it._id, { Open_Count: 2, Track_Status: "In review" });
  assert.equal(r.attempts, 2);
  assert.equal(port.stats.reapplied, 1);
  assert.equal(fake.item(it._id).Open_Count, 2);
  fake.dropNextWrites(it._id, 5);
  await assert.rejects(port.adminUpdate(FLOW.review, it._id, { Open_Count: 3 }), /not verified after 3 attempts/);
});

test("port: an item its holder wrote moments ago is deferred, not overwritten (P3)", async () => {
  const { fake, key, clock } = world();
  const it = await newReview(key);
  await key.call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${it._activity_instance_id}/submit?${Q(APP)}`, {});
  const inst = fake.item(it._id)._current_context[0]._context_activity_instance_id;
  await fake.clientFor("u-saf").call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${inst}?${Q(APP)}`, { Review_Confirm: "Confirmed" });
  const port = createPort({ kf: key, now: () => clock.now(), serviceUserId: "u-svc", minIntervalMs: 0 });
  await assert.rejects(port.adminUpdate(FLOW.review, it._id, { Open_Count: 1 }), DeferredError);
  clock.advance(5000);
  await port.adminUpdate(FLOW.review, it._id, { Open_Count: 1 });
  assert.equal(fake.item(it._id).Open_Count, 1);
});

test("port: child rows are matched by their own key after the server replaced the ids (P9); duplicates are cleaned", async () => {
  const { fake, key, clock } = world();
  const port = createPort({ kf: key, now: () => clock.now(), serviceUserId: "u-svc", minIntervalMs: 0 });
  const t = "CIQ_Case_Data_A00_Components";
  const row = await port.createFormRow(FLOW.caseData, { Case_Code: "C1" }, { [t]: [{ Comp_Row_Id: "c1", Comp_INCI: "A" }, { Comp_Row_Id: "c2", Comp_INCI: "B" }] });
  await port.updateFormRow(FLOW.caseData, row._id, {}, { [t]: { key: "Comp_Row_Id", upsert: [{ Comp_Row_Id: "c1", Comp_INCI: "A2" }, { Comp_Row_Id: "c3", Comp_INCI: "C" }], removeMissing: true } });
  const rows = fake.item(row._id)[`Table::${t}`];
  assert.deepEqual(rows.map((r) => `${r.Comp_Row_Id}:${r.Comp_INCI}`).sort(), ["c1:A2", "c3:C"]);
  // an earlier stale write left a duplicate: the next update removes it
  const first = rows.find((r) => r.Comp_Row_Id === "c1");
  await key.call("POST", `/form/2/${key.acc}/${FLOW.caseData}/${row._id}?${Q(APP)}`, { [`Table::${t}`]: [{ _id: "stale-id", Comp_Row_Id: "c1", Comp_INCI: "A2" }] });
  assert.equal(fake.item(row._id)[`Table::${t}`].filter((r) => r.Comp_Row_Id === "c1").length, 2);
  await port.updateFormRow(FLOW.caseData, row._id, {}, { [t]: { key: "Comp_Row_Id", upsert: [{ Comp_Row_Id: "c1", Comp_INCI: "A2" }, { Comp_Row_Id: "c3", Comp_INCI: "C" }] } });
  const after = fake.item(row._id)[`Table::${t}`].filter((r) => r.Comp_Row_Id === "c1");
  assert.equal(after.length, 1);
  assert.equal(after[0]._id, first._id);
});

test("port: the HTML 429 challenge is not data; no write follows it; a global back-off stops every call", async () => {
  const h = setup();
  await toReview(h, "CIQ-2026-0001");
  await h.wb("u-saf").request("op.raise", "CIQ-2026-0001", { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", label: "K2.2" }, question: "Q?", justification: "j", dueDate: "2026-11-30T00:00:00.000Z" });
  const before = h.fake.log.length;
  h.fake.setOutage("challenge", 3); // a few calls in, Cloudflare answers every call with the HTML page
  const hb = await h.service.runOnce();
  const after = h.fake.log.slice(before);
  const first429 = after.findIndex((x) => x.status === 429);
  assert.ok(first429 >= 0);
  assert.equal(after.slice(first429).length, 1, "no call at all after the first 429");
  assert.ok(after.every((x) => x.method === "GET" || x.path.endsWith("/list")), "nothing but reads happened before it");
  assert.match(hb.aborted, /not readable|backing off/);
  assert.equal(h.requests().at(-1).Request_Status, undefined, "the request stays waiting (no Failed write)");
  // during the back-off the port refuses to call at all
  h.fake.setOutage(null);
  const hb2 = await h.service.runOnce();
  assert.match(hb2.aborted, /backing off/);
  assert.equal(h.fake.log.length, before + after.length);
  assert.equal(h.port.stats.challenges, 1);
});

test("port: Kissflow's JSON 429 is a short back-off; calls are paced ≥ 1 s apart", async () => {
  const { fake, key } = world();
  let wall = 1_000_000;
  const waits = [];
  const port = createPort({ kf: key, now: () => new Date(wall), serviceUserId: "u-svc", wallClock: () => wall, sleep: async (ms) => { waits.push(ms); wall += ms; }, minIntervalMs: 1000, rateLimitBackoffMs: 60_000 });
  await port.listForm(FLOW.outbox);
  await port.listForm(FLOW.outbox);
  await port.listForm(FLOW.outbox);
  assert.deepEqual(waits, [1000, 1000]);
  fake.setOutage("rate");
  await assert.rejects(port.listForm(FLOW.outbox), UnreadableError);
  fake.setOutage(null);
  await assert.rejects(port.listForm(FLOW.outbox), BackoffError);
  wall += 61_000;
  await port.listForm(FLOW.outbox);
  assert.equal(port.stats.challenges, 0);
  assert.ok(CHALLENGE_HTML.includes("Just a moment"));
});

test("port: dry-run records intended writes, sends none, and later reads see them", async () => {
  const { fake, key, clock } = world();
  const it = await newReview(key);
  await key.call("POST", `/process/2/${key.acc}/${FLOW.review}/${it._id}/${it._activity_instance_id}/submit?${Q(APP)}`, {});
  const before = fake.log.length;
  const port = createPort({ kf: key, dryRun: true, now: () => clock.now(), serviceUserId: "u-svc", minIntervalMs: 0 });
  await port.adminUpdate(FLOW.review, it._id, { Open_Count: 9 });
  const row = await port.createFormRow(FLOW.outbox, { Mail_Key: "k1", Subject: "s" });
  const created = await port.createAndSubmit(FLOW.query, { Query_Key: "Q" });
  assert.equal((await port.getProcessItemAdmin(FLOW.review, it._id)).Open_Count, 9);
  assert.equal(fake.item(it._id).Open_Count, undefined, "nothing written");
  assert.ok(fake.log.slice(before).every((x) => x.method === "GET"));
  assert.deepEqual(port.intended.map((x) => x.op), ["adminUpdate", "createFormRow", "createProcess", "submitStart"]);
  assert.ok(row._id.startsWith("dry-") && created.id.startsWith("dry-"));
  assert.ok([...port.notes].length === 0 || [...port.notes][0].includes("Form lists"));
});

test("verifyIds reports the expected app flows that are missing, without throwing", async () => {
  const { fake, key, clock } = world();
  delete fake.schema[FLOW.review];
  delete fake.schema[FLOW.serviceRequest];
  fake.schema[FLOW.caseProc].fields.delete("Case_Phase");
  const port = createPort({ kf: key, now: () => clock.now(), minIntervalMs: 0 });
  const r = await verifyIds(port.paced);
  assert.deepEqual(r.missingFlows.sort(), [FLOW.review, FLOW.serviceRequest].sort());
  assert.deepEqual(r.missingFields[FLOW.caseProc], ["Case_Phase"]);
  assert.match(verifySummary(r), /missing flows: .*CIQ_Review_A00 \(expected\)/);
  // a 429 stops verifyIds early and is reported, not thrown
  fake.setOutage("challenge");
  const port2 = createPort({ kf: key, now: () => clock.now(), minIntervalMs: 0 });
  const r2 = await verifyIds(port2.paced);
  assert.match(r2.aborted, /not readable/);
  assert.match(verifySummary(r2), /not readable/);
  assert.ok(ROLE.service);
});

test("S-2 (fake = live semantics): attach ADDS to the field, only on in-progress items, admin route only; download = 302 → signed URL", async () => {
  const { fake, key, clock } = world();
  const it = await newReview(key);
  const c = await key.call("POST", `/process/2/${key.acc}/${FLOW.caseProc}?${Q(APP)}`, { Case_Code: "C9" });
  await key.call("POST", `/process/2/${key.acc}/${FLOW.caseProc}/${c.body._id}/${c.body._activity_instance_id}/submit?${Q(APP)}`, {});
  const files = fake.keyFiles;
  const path = `/process/2/${key.acc}/admin/${FLOW.caseProc}/${c.body._id}/Supplier_Files/attachment?${Q(APP)}`;
  const a = await files.upload(path, { name: "sds.pdf", bytes: Buffer.from("one") });
  const b = await files.upload(path, { name: "sds.pdf", bytes: Buffer.from("two") });
  assert.equal(a.status, 200);
  assert.equal(b.body.Supplier_Files.length, 2, "never replaces");
  assert.match(b.body.Supplier_Files[1].id, /^Attach-/);
  assert.deepEqual(Object.keys(b.body.Supplier_Files[0]).sort(), ["fileExtension", "id", "key", "name", "size"]);
  assert.equal((await fake.fileTransport("u-rmm").upload(path, { name: "x.pdf", bytes: Buffer.from("x") })).status, 403);
  const json = await key.call("PUT", `/process/2/${key.acc}/admin/${FLOW.caseProc}/${c.body._id}?${Q(APP)}`, { Final_PDF: [{ id: "x" }] });
  assert.equal(json.status, 400, "attachment fields are not written in a JSON body");
  const dl = await files.download(`/process/2/${key.acc}/admin/${FLOW.caseProc}/${c.body._id}/Supplier_Files/attachment/${a.body.Supplier_Files[0].id}?${Q(APP)}`);
  assert.equal(dl.status, 302);
  assert.match(dl.location, /^\/upload\/2\//);
  assert.equal((await files.fetchSigned(dl.location)).bytes.toString(), "one");
  assert.equal((await fake.fileTransport("u-rmm").fetchSigned(dl.location)).status, 403);
  // after End: refused (completed items are untested live; the service never writes after End)
  const port = createPort({ kf: key, files, now: () => clock.now(), serviceUserId: "u-svc", minIntervalMs: 0 });
  fake.seedUpdate(c.body._id, { _status: "Completed", _current_context: [] });
  await assert.rejects(port.attachFile(FLOW.caseProc, c.body._id, "Final_PDF", { name: "f.pdf", bytes: Buffer.from("%PDF") }), /never writes after End/);
  assert.ok(it._id);
});

test("S-2 port: attachFile verifies by reading back; downloadFile follows the redirect; a 429 mid-copy stops everything", async () => {
  const { fake, key, clock } = world();
  const port = createPort({ kf: key, files: fake.keyFiles, now: () => clock.now(), serviceUserId: "u-svc", minIntervalMs: 0 });
  const c = await port.createAndSubmit(FLOW.caseProc, { Case_Code: "C9" });
  const added = await port.attachFile(FLOW.caseProc, c.id, "Supplier_Files", { name: "coa.pdf", bytes: Buffer.from("CoA bytes") });
  assert.match(added.id, /^Attach-/);
  const back = await port.downloadFile(FLOW.caseProc, c.id, "Supplier_Files", added.id);
  assert.equal(back.bytes.toString(), "CoA bytes");
  const before = fake.log.length;
  fake.setOutage("challenge", 1); // the redirect answers, the signed URL gets the challenge page
  await assert.rejects(port.downloadFile(FLOW.caseProc, c.id, "Supplier_Files", added.id), UnreadableError);
  await assert.rejects(port.attachFile(FLOW.caseProc, c.id, "Supplier_Files", { name: "x.pdf", bytes: Buffer.from("x") }), BackoffError);
  assert.equal(fake.item(c.id).Supplier_Files.length, 1, "no write after the 429");
  assert.ok(fake.log.slice(before).every((x) => x.method === "GET"));
  // dry-run: an attach is recorded, nothing is downloaded or sent
  const dry = createPort({ kf: key, files: fake.keyFiles, dryRun: true, now: () => clock.now(), minIntervalMs: 0 });
  fake.setOutage(null);
  assert.equal(await dry.downloadFile(FLOW.caseProc, c.id, "Supplier_Files", added.id), null);
  const r = await dry.attachFile(FLOW.caseProc, c.id, "Final_PDF", { name: "f.pdf", bytes: Buffer.from("%PDF") });
  assert.ok(r.dry);
  assert.equal(fake.item(c.id).Final_PDF, undefined);
  assert.deepEqual(dry.intended.map((x) => x.op), ["attachFile"]);
});
