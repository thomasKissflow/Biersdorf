// End-to-end on the fake with ONE Kissflow user who is a member of every internal role AND the supplier contact of the
// case (the dev sandbox: "use myself as the supplier dev user in dev for tests"). The walk: create → fill → completeness
// → a Safety point raised, answered with an upload, accepted → a self-mention → every review (RMES SAF/REG) → final
// release → final document → change report. Every audit row must carry the right side, every mail the right audience,
// every write the real Kissflow user id, and no request may be refused for identity reasons.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSchema } from "../fake.mjs";
import { DeferredError } from "../kissflow.mjs";
import { sealOf } from "../engine.mjs";
import { setup, people, dualPeople, zztDevSupplier, solvaroSupplier, dualCaseFields, toReview, fillUntilComplete, completeReview, lastRequest, DUAL, DUAL_REVIEWERS, PLAIN_CONFIG, FLOW, F, D, J } from "./helpers.mjs";

const C = "CIQ-2026-0001";
const MINT = `sup:${DUAL.supplier}:${DUAL.id}`;
const SUPPLIER_EVENTS = new Set(["invitation", "op-raised", "op-edited", "op-returned", "op-accepted", "op-closed", "release-requested", "release-withdrawn", "release-receipt", "cancelled", "reactivated", "reminder"]);
const SUPPLIER_ACTIONS = /^(Scope follows answers|Uploaded document|Confirmed completeness|Answered query|Justified non-delivery|Gave final release|Reported a change|Changed .* after completeness|Change attempt refused)/;
const SYSTEM_ACTIONS = /^(Derived scope|Invited supplier contacts|Activated reviews|All reviews completed|Case completed|Generated final document|Final PDF)$/;
const USER_FIELDS = ["Owner_RMM", "Assignee_User", "Responsible_User", "Raised_By_User", "Completed_By", "Closed_By", "Note_Author", "Run_By", "Published_By"];
const MULTIUSER_FIELDS = ["Assigned_Contacts", "Raiser_Assignee"];

/** The open-point steps assigned from Raiser_Assignee (V-19 b), so the field is written and asserted too. */
function raiserSchema() {
  const schema = defaultSchema();
  const op = schema[FLOW.openPoint];
  op.fields.add("Raiser_Assignee");
  op.steps = op.steps.map((s) => (s.kind === "user" ? { ...s, assignee: { field: "Raiser_Assignee" } } : s));
  return schema;
}

const tracks = (h) => J(h.caseRow(C).Tracks_JSON, []).map((t) => `${t.dept}:${t.lastActivityAt ?? "-"}`);

/** The walk of the dual user; `hooks.afterSave(h)` runs right after the first supplier save (before the service sees it). */
async function dualWalk(h, hooks = {}) {
  const me = h.wb(DUAL.id);
  const portal = h.sup(DUAL.id);
  const caseItem = await me.createCase({ Case_Code: C, ...dualCaseFields() });
  await me.request("case.created", C, { caseItemId: caseItem }, caseItem);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  // the portal twin is assigned to the real Kissflow user; its contact list names it by its Kissflow id
  const req = h.requestItem(C);
  assert.deepEqual(req.Assigned_Contacts.map((x) => x._id), [DUAL.id]);
  assert.deepEqual(J(req.Case_Contacts_JSON).map((x) => [x.id, x.name, x.email]), [[DUAL.id, DUAL.contactName, DUAL.email]]);
  assert.equal(h.item(caseItem).Portal_Contact_Ids, DUAL.id);
  assert.equal(h.item(caseItem).Supplier_Contact_Emails, DUAL.email);

  await portal.save(C, { config: PLAIN_CONFIG });
  if (hooks.afterSave) await hooks.afterSave(h);
  await h.run();
  assert.equal(h.ciq(C).answeredBy.SF01.by, DUAL.id, "Case Data stores the Kissflow id");
  await fillUntilComplete(h, C, DUAL.id);
  await portal.confirmCompleteness(C);
  await h.run();
  const c = h.ciq(C);
  assert.equal(c.phase, "review");
  assert.deepEqual(c.reviews.map((r) => `${r.dept}:${r.assigneeId}`), ["RMM", "REG", "SAF", "QM", "MIC"].map((d) => `${d}:${DUAL.id}`));
  assert.equal(c.confirmations.find((x) => x.type === "completeness").by, DUAL.id);
  assert.equal(h.item(caseItem).Completeness_By_Email, DUAL.email);
  assert.equal(h.item(caseItem).Completeness_By_Name, DUAL.contactName);

  // Safety raises; the dual user answers with an upload at the question; Safety (the raiser) accepts
  await me.request("op.raise", C, { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", fieldId: "FLD-A14-101", label: "K2.2 › Arsenic (As) content" }, question: "Please confirm the arsenic value with the batch analysis.", justification: "Needed for the heavy-metal evaluation", dueDate: "2026-11-30T00:00:00.000Z" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const opId = h.ciq(C).openPoints[0].id;
  const op = h.opItem(C, opId);
  assert.equal(op.Raised_By_User._id, DUAL.id);
  assert.deepEqual((op.Raiser_Assignee ?? []).map((x) => x._id), [DUAL.id]);
  assert.equal(op.Portal_Contact_Ids, DUAL.id);
  assert.deepEqual(h.queryItem(C, opId, 1).Assigned_Contacts.map((x) => x._id), [DUAL.id]);
  const before = tracks(h);
  await portal.save(C, { uploads: [{ id: "UP-AN-1", sectionId: "K2.2", fieldId: "FLD-A14-101", name: "batch-analysis.pdf", kind: "Analysis" }] });
  await portal.answer(C, opId, 1, { kind: "Document", text: "Full report attached.", uploadIds: ["UP-AN-1"] });
  await h.run();
  assert.deepEqual(tracks(h), before, "supplier saves leave the reviewers' lastActivityAt alone");
  const thread = h.ciq(C).openPoints[0].thread;
  assert.deepEqual(thread.map((m) => `${m.side}:${m.by}:${m.action}`), [`internal:${DUAL.id}:raised`, `supplier:${DUAL.id}:answered`]);
  assert.deepEqual(J(h.opItem(C, opId).Thread_JSON).thread.map((m) => m.by), [DUAL.id, DUAL.id]);
  assert.equal(h.opItem(C, opId).Supplier_Responsible_Email, DUAL.email);
  const doc = h.ciq(C).documents.find((d) => d.name === "batch-analysis.pdf");
  assert.equal(doc.uploadedBy, DUAL.id);
  await me.actAtStep(FLOW.openPoint, h.opItem(C, opId)._id, { OP_Outcome: "Accepted" });
  await me.request("op.accepted", C, { opId }, opId);
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.equal(h.opItem(C, opId)._status, "Completed");

  // the dual user mentions itself (text and Note_Mentions_Emails): never a C-20 to itself, on either side
  const mails = h.outbox(C).length;
  await me.note(C, `@${DUAL.name} reminder to self: check K2.2.`, { Note_Dept: "SAF", Note_Mentions_Emails: DUAL.email });
  await h.run();
  assert.deepEqual(h.outbox(C).slice(mails).filter((r) => r.Event_Code === "note-mention"), []);
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Added internal note" && r.Actor_Side === "BDF"));

  // every review, as the dual user (RMES for SAF and REG)
  for (const d of ["REG", "SAF", "QM", "MIC", "RMM"]) {
    const r = await completeReview(h, C, d, { by: DUAL_REVIEWERS[d] });
    assert.equal(r.Request_Status, "Done", `${d}: ${r.Result_Note}`);
    assert.equal(h.reviewItem(C, d).Completed_By._id, DUAL.id);
  }
  assert.equal(h.ciq(C).phase, "final-release");
  assert.deepEqual(h.releaseItem(C).Assigned_Contacts.map((x) => x._id), [DUAL.id]);

  // final release → final document + seal
  await portal.release(C);
  await h.run();
  assert.equal(h.ciq(C).phase, "completed");
  const row = h.caseRow(C);
  const fd = JSON.parse(row.Final_Document_JSON);
  assert.equal(row.Final_Document_Hash, sealOf(fd), "the seal verifies");
  assert.ok(D.verifyFinalDocument(fd));
  assert.equal(h.item(caseItem).Final_Release_By_Email, DUAL.email);
  assert.equal(h.item(caseItem)._status, "Completed");

  // a change report after the release
  await portal.reportChange(C, "We changed the production site.");
  h.tick(16 * 60_000);
  await h.run();
  const crs = h.caseRow(C)[`Table::${F.caseData.changeReports.table}`];
  assert.deepEqual(crs.map((r) => [r.CR_Key, r.CR_By_Name, r.CR_By_Email]), [["CR-0001", DUAL.contactName, DUAL.email]]);
  assert.equal(h.ledger(C).changeReports[0].by, DUAL.id);
  return caseItem;
}

/** What must hold after the walk, whoever holds the key. */
function checkWalk(h) {
  // no request refused or failed, no change "not applied"
  assert.deepEqual(h.requests().filter((r) => r.Request_Status !== "Done").map((r) => `${r.Request_Code}: ${r.Request_Status} ${r.Result_Note}`), []);
  assert.deepEqual(h.audit(C).filter((r) => /not applied|not accepted|^Refused/.test(r.Action_Code)).map((r) => r.Action_Code), []);
  // every audit row on the right side, with the name of that side
  const wrong = [];
  for (const r of h.audit(C)) {
    const want = SYSTEM_ACTIONS.test(r.Action_Code) ? "System" : SUPPLIER_ACTIONS.test(r.Action_Code) ? "Supplier" : "BDF";
    const name = { System: "System", Supplier: DUAL.contactName, BDF: DUAL.name }[want];
    if (r.Actor_Side !== want || r.Actor_Name !== name || (want !== "System" && r.Actor_Email !== DUAL.email)) wrong.push(`${r.Action_Code}: ${r.Actor_Side} ${r.Actor_Name}`);
  }
  assert.deepEqual(wrong, []);
  const sides = new Set(h.audit(C).map((r) => r.Actor_Side));
  assert.deepEqual([...sides].sort(), ["BDF", "Supplier", "System"]);
  // every mail to the one address, on the audience of its event (supplier mails = the contact, internal = the user)
  const out = h.outbox(C);
  assert.ok(out.length >= 15, `${out.length} mails`);
  assert.deepEqual(out.filter((r) => r.To_Emails !== DUAL.email || r.Audience !== (SUPPLIER_EVENTS.has(r.Event_Code) ? "Supplier" : "Internal")).map((r) => `${r.Event_Code} ${r.Audience} → ${r.To_Emails}`), []);
  for (const ev of ["invitation", "op-raised", "op-accepted", "release-requested", "release-receipt"]) assert.ok(out.some((r) => r.Event_Code === ev && r.Audience === "Supplier"), ev);
  for (const ev of ["review-assigned", "op-answered", "final-document", "change-reported"]) assert.ok(out.some((r) => r.Event_Code === ev && r.Audience === "Internal"), ev);
  assert.ok(!out.some((r) => r.Mail_Key.includes("sup:")));
  // every USER / MULTIUSER value written is a real Kissflow user, never a minted id
  const known = new Set(h.users.map((u) => u._id));
  for (const flow of Object.keys(h.fake.schema)) {
    for (const r of h.fake.rows(flow)) {
      for (const k of USER_FIELDS) if (r[k]) assert.ok(known.has(r[k]._id), `${flow}.${k} = ${r[k]._id}`);
      for (const k of MULTIUSER_FIELDS) for (const u of r[k] ?? []) assert.ok(known.has(u._id), `${flow}.${k} = ${u._id}`);
      assert.ok(!JSON.stringify(r).includes("sup:"), `${flow}/${r._id} holds a minted id`);
    }
  }
}

test("dual user (key u-svc): one Kissflow user in every role is also the case's supplier contact — the whole walk", async () => {
  const h = setup({ users: dualPeople(), suppliers: [zztDevSupplier()], schema: raiserSchema() });
  await dualWalk(h);
  checkWalk(h);
  assert.equal(h.port.serviceUserTrusted, true, "u-svc is no person of the directory");
  const hb = await h.run();
  assert.equal(hb.directory.overlaps, 1);
  assert.ok(hb.warnings.some((w) => w.startsWith("identity:") && w.includes(MINT)));
});

test("dual user = key user = service user (viaKey): the same walk; a portal save 1 s before a service PUT is deferred", async () => {
  const h = setup({ users: dualPeople({ serviceRole: true }), suppliers: [zztDevSupplier()], schema: raiserSchema(), keyUserId: DUAL.id, serviceUserId: DUAL.id });
  await dualWalk(h, {
    async afterSave(h) {
      assert.equal(h.port.serviceUserTrusted, false, "the key's user is a person of the directory: distrusted");
      const reqId = h.ledger(C).items.request;
      assert.equal(h.item(reqId)._modified_by._id, DUAL.id, "the portal UI wrote it as the same Kissflow user as the key");
      h.tick(1000);
      await assert.rejects(h.port.adminUpdate(FLOW.request, reqId, { Case_Phase_Label: "Filling in" }), DeferredError);
      // trusted, the same write would have been taken for the service's own and gone ahead
      h.port.setServiceUserTrusted(true);
      await h.port.adminUpdate(FLOW.request, reqId, { Case_Phase_Label: "Filling in" });
      h.port.setServiceUserTrusted(false);
    },
  });
  checkWalk(h);
  assert.equal(h.port.serviceUserTrusted, false);
});

test("mixed fixture (dual user + the standard people): Ole's note naming the shared e-mail gives exactly one Internal C-20", async () => {
  const h = setup({ users: [...people(), dualPeople()[0]], suppliers: [solvaroSupplier(), zztDevSupplier()] });
  await toReview(h, C);
  const mark = h.outbox(C).length;
  await h.wb("u-saf-2").note(C, "Please look at K2.2.", { Note_Dept: "SAF", Note_Mentions_Emails: DUAL.email });
  await h.run();
  const c20 = h.outbox(C).slice(mark).filter((r) => r.Event_Code === "note-mention");
  assert.deepEqual(c20.map((r) => [r.Audience, r.To_Emails]), [["Internal", DUAL.email]]);
  // the Solvaro contacts are untouched by the overlap elsewhere
  assert.deepEqual(h.requestItem(C).Assigned_Contacts.map((x) => x._id).sort(), ["u-sup-1", "u-sup-2"]);
});

// ---------------------------------------------------------------------------------------------- H-18 with shared users

const ZOE = { _id: "UsZOE00002", Name: "Zoe Zeta", Email: "zoe.zeta@zzt-dev.example", roles: ["RoEK4XPKXCvH"] };
const zoeRow = { Contacts_Key: "ZZT-DEV-c2", Contacts_Full_Name: "Zoe Zeta", Contacts_Email: ZOE.Email, Contacts_Title: "QA Lead", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: ZOE._id, Contacts_Active: "Yes" };
const contactsOf = (h, code) => {
  const sup = h.fake.rows(FLOW.supplier).find((r) => r.Supplier_Code === code);
  return { sup, rows: sup[`Table::${F.supplier.contacts.table}`] };
};

test("H-18 dual: deactivating the dual user's contact side (replacement Zoe) leaves the internal user alone; reactivation", async () => {
  const h = setup({ users: [...dualPeople(), ZOE], suppliers: [zztDevSupplier({ extraContacts: [zoeRow] })] });
  const caseItem = await toReview(h, C, { caseFields: dualCaseFields(), rmm: DUAL.id, supplier: DUAL.id });
  assert.equal(h.ciq(C).phase, "review");
  // the administrator (the dual user, in the admin role) deactivates the contact row, then files supplier.changed
  const { sup, rows } = contactsOf(h, DUAL.supplier);
  rows[0].Contacts_Active = "No";
  h.fake.seedUpdate(sup._id, { [`Table::${F.supplier.contacts.table}`]: rows }, DUAL.id);
  let mark = h.outbox(C).length;
  await h.wb(DUAL.id).request("supplier.changed", "", { contactUserId: DUAL.id, change: "deactivate", before: { active: true }, replacementUserId: ZOE._id });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.deepEqual(h.requestItem(C).Assigned_Contacts.map((x) => x._id), [ZOE._id]);
  assert.equal(h.item(caseItem).Portal_Contact_Ids, ZOE._id);
  assert.deepEqual(h.outbox(C).slice(mark).map((r) => `${r.Event_Code} ${r.Audience} → ${r.To_Emails}`), [`invitation Supplier → ${ZOE.Email}`]);
  assert.ok(h.audit().some((r) => r.Action_Code === "Deactivated contact" && r.Actor_Side === "BDF" && r.Object_Key === DUAL.supplier));
  // the internal user is still active: raises a point (Zoe is asked) and gets Zoe's answer (C-05)
  mark = h.outbox(C).length;
  await h.wb(DUAL.id).request("op.raise", C, { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", label: "K2.2" }, question: "Please confirm.", justification: "Needed", dueDate: "2026-11-30T00:00:00.000Z" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  await h.sup(ZOE._id).answer(C, "OP-0001-01", 1, { text: "Confirmed." });
  await h.run();
  assert.deepEqual(h.outbox(C).slice(mark).map((r) => `${r.Event_Code} ${r.Audience} → ${r.To_Emails}`), [`op-raised Supplier → ${ZOE.Email}`, `op-answered Internal → ${DUAL.email}`]);
  // reactivation (the master row first)
  rows[0].Contacts_Active = "Yes";
  h.fake.seedUpdate(sup._id, { [`Table::${F.supplier.contacts.table}`]: rows }, DUAL.id);
  await h.wb(DUAL.id).request("supplier.changed", "", { contactUserId: DUAL.id, change: "reactivate", before: { active: false } });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.ok(h.audit().some((r) => r.Action_Code === "Reactivated contact" && r.Event_Category === "Supplier master"));
  assert.ok(!JSON.stringify(h.fake.rows(FLOW.audit)).includes("sup:"));
});

test("H-18: a portal user listed at two suppliers is refused without supplierCode; with it, only that supplier's contact changes", async () => {
  const MULTI = { _id: "UsMULTI0003", Name: "Max Multi", Email: "max.multi@zzt-multi.example", roles: ["RoEK4XPKXCvH"] };
  const OTHER = { _id: "UsOTHER0004", Name: "Olga Other", Email: "olga.other@zzt-multi.example", roles: ["RoEK4XPKXCvH"] };
  const contact = (code, u, n) => ({ Contacts_Key: `${code}-c${n}`, Contacts_Full_Name: u.Name, Contacts_Email: u.Email, Contacts_Title: "QA", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: u._id, Contacts_Active: "Yes" });
  const supplier = (code) => ({ fields: { Supplier_Code: code, Supplier_Legal_Name: `${code} (fictional)`, DUNS_Number: "999000002", Supplier_Active: "Yes" }, contacts: [contact(code, MULTI, 1), contact(code, OTHER, 2)] });
  const h = setup({ users: [...people(), MULTI, OTHER], suppliers: [solvaroSupplier(), supplier("ZZT-A"), supplier("ZZT-B")] });
  await h.wb("u-admin").request("supplier.changed", "", { contactUserId: MULTI._id, change: "deactivate", before: { active: true } });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /contact of 2 suppliers \(ZZT-A, ZZT-B\).*supplierCode/);
  const { sup, rows } = contactsOf(h, "ZZT-B");
  rows[0].Contacts_Active = "No";
  h.fake.seedUpdate(sup._id, { [`Table::${F.supplier.contacts.table}`]: rows }, "u-admin");
  await h.wb("u-admin").request("supplier.changed", "", { contactUserId: MULTI._id, supplierCode: "ZZT-B", change: "deactivate", before: { active: true } });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  const log = h.audit().filter((r) => r.Action_Code === "Deactivated contact");
  assert.deepEqual(log.map((r) => r.Object_Key), ["ZZT-B"]);
  await h.wb("u-admin").request("supplier.changed", "", { contactUserId: MULTI._id, supplierCode: "s1", change: "reactivate" });
  await h.run();
  assert.equal(lastRequest(h).Request_Status, "Refused");
  assert.match(lastRequest(h).Result_Note, /not a contact of s1/);
});

test("H-18 dual: an e-mail change of the shared Kissflow user reaches the open case (26 Oct: an e-mail is unique within one supplier and may also be a Beiersdorf user's)", async () => {
  const h = setup({ users: dualPeople(), suppliers: [zztDevSupplier()] });
  await toReview(h, C, { caseFields: dualCaseFields(), rmm: DUAL.id, supplier: DUAL.id });
  // one Kissflow user, one e-mail: the role GET and the contact row both show the new address
  const NEW = "dana.d@example.test";
  h.users.find((u) => u._id === DUAL.id).Email = NEW;
  const { sup, rows } = contactsOf(h, DUAL.supplier);
  rows[0].Contacts_Email = NEW;
  h.fake.seedUpdate(sup._id, { [`Table::${F.supplier.contacts.table}`]: rows }, DUAL.id);
  await h.wb(DUAL.id).request("supplier.changed", "", { contactUserId: DUAL.id, change: "email", before: { email: DUAL.email }, after: { email: NEW } });
  await h.run();
  // prototype suppliers.ts validateContact (Thomas, 26 Oct): the same e-mail as a Beiersdorf user is allowed, so the
  // change is applied like H-18's: GEN-008 and the case e-mails of the open case get the new address
  assert.equal(lastRequest(h).Request_Status, "Done", lastRequest(h).Result_Note);
  assert.equal(J(h.requestItem(C).BDF_Set_JSON)["FLD-GEN-008"], NEW);
  assert.equal(h.ciq(C).answers["FLD-GEN-008"], NEW);
  assert.ok(h.audit(C).some((r) => r.Action_Code === "Updated contact e-mail"));
  assert.equal(h.requests().filter((r) => r.Request_Status === "Refused").length, 0);
});
