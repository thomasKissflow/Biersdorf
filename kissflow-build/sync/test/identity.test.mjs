// The identity contract (identity.mjs, directory.mjs): one Kissflow user may be both an internal user and a supplier
// contact. Units: minting, the look-ups, decode/unmint, the prototype's own side guards, mail and audit sides, the
// port's leak guard and the distrusted service user. All offline (the fake).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDirectory } from "../directory.mjs";
import { MINTED, mintId, kfId, unmint, decodeCase, findMinted, isMinted, scrubMinted, uidOfMinted } from "../identity.mjs";
import { outboxRows } from "../mail.mjs";
import { auditRow } from "../audit.mjs";
import { createFake, makeClock, uiClient } from "../fake.mjs";
import { createPort, IdentityLeakError, DeferredError, isDeferral } from "../kissflow.mjs";
import { seedRows, configFromRows } from "../config.mjs";
import { buildWorld, runAction, caseIn } from "../engine.mjs";
import { ROLE, ROLE_DEPT, ROLE_PERSONA, FLOW } from "../ids.mjs";
import { D, people, dualPeople, solvaroSupplier, zztDevSupplier, DUAL, APP_ROLES } from "./helpers.mjs";

const MINT = mintId(DUAL.supplier, DUAL.id); // "sup:ZZT-DEV:UsDUAL00001"
const CONTACT_GUARD = "Only the supplier's contacts work on the questionnaire. Beiersdorf never changes answers.";
const APP = "CIQ_Digital_A00";
const PORTAL = "CIQ_Supplier_Portal_A00";

/** Role members as loadDirectory reads them (department and persona roles only). */
function rolesOf(users) {
  const roleMembers = {};
  for (const roleId of [...Object.keys(ROLE_DEPT), ...Object.keys(ROLE_PERSONA)]) roleMembers[roleId] = users.filter((u) => u.roles.includes(roleId)).map((u) => ({ _id: u._id, Name: u.Name, Email: u.Email }));
  return roleMembers;
}
const row = (s) => ({ ...s.fields, "Table::Contacts": s.contacts });
const contactRow = (key, name, email, uid, extra = {}) => ({ Contacts_Key: key, Contacts_Full_Name: name, Contacts_Email: email, Contacts_Title: "QA", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: uid, Contacts_Active: "Yes", ...extra });
const supplierRow = (code, contacts) => ({ Supplier_Code: code, Supplier_Legal_Name: `${code} (fictional)`, DUNS_Number: "999000009", Supplier_Active: "Yes", "Table::Contacts": contacts });

function dualDirectory(extra = {}) {
  const warnings = [];
  const dir = buildDirectory({ roleMembers: rolesOf(dualPeople()), supplierRows: [row(zztDevSupplier())], warn: (w) => warnings.push(w), ...extra });
  return { dir, warnings };
}

test("identity: no shared Kissflow user → nothing is minted and every identity function is the identity (NO-OP)", () => {
  const warnings = [];
  const dir = buildDirectory({ roleMembers: rolesOf(people()), supplierRows: [row(solvaroSupplier())], warn: (w) => warnings.push(w), serviceUserIds: ["u-svc"] });
  assert.equal(dir.mintedIds.size, 0);
  assert.deepEqual(dir.overlaps, []);
  assert.deepEqual(dir.contacts.map((c) => [c.id, c.kfUserId]), [["u-sup-1", "u-sup-1"], ["u-sup-2", "u-sup-2"]]);
  assert.deepEqual(dir.suppliers[0].contactIds, ["u-sup-1", "u-sup-2"]);
  assert.ok(!warnings.some((w) => w.startsWith("identity")));
  for (const id of ["u-sup-1", "u-rmm", "system", "unknown"]) {
    assert.equal(dir.supplierIdFor(id, "s1"), id);
    assert.equal(kfId(id), id);
  }
  assert.equal(dir.contactIdFor("u-sup-2", "s1"), "u-sup-2");
  assert.equal(dir.contactIdFor("u-rmm", "s1"), undefined, "an internal user is no contact");
  const c = { id: "C", supplierId: "s1", supplierContactIds: ["u-sup-1"], answeredBy: { SF01: { by: "u-sup-1", at: "x" } }, documents: [], confirmations: [], openPoints: [] };
  assert.equal(decodeCase(c, dir), c, "decode returns the case itself");
  assert.equal(unmint(c, dir.mintedIds), c, "unmint returns the value itself");
  assert.equal(dir.unmint(c), c);
  // a supplier's free text that merely looks like a minted id is never changed (nothing is minted)
  const text = { answers: { "FLD-GEN-004": "sup:ES:Tarragona" } };
  assert.equal(dir.unmint(text), text);
  assert.equal(dir.kfId("sup:ES:Tarragona"), "sup:ES:Tarragona");
  assert.equal(dir.byEmail("elena.marquez@solvaro.example").id, "u-sup-1");
  assert.equal(dir.byEmail("elena.marquez@solvaro.example", "internal").id, "u-sup-1", "prefer only matters for a shared address");
  assert.equal(dir.byEmail("mira.hansen@beiersdorf.example").id, "u-saf");
  assert.equal(dir.isHuman("u-svc"), false, "the service user is no person of the directory: it stays trusted");
});

test("identity: the dual user (every app role + only contact of ZZT-DEV) gets a minted supplier side; one warning, ids only", () => {
  const { dir, warnings } = dualDirectory();
  assert.deepEqual([...dir.mintedIds], [MINT]);
  const contact = dir.byId(MINT);
  assert.equal(contact.side, "supplier");
  assert.equal(contact.kfUserId, DUAL.id);
  assert.equal(contact.supplierId, DUAL.supplier);
  assert.equal(contact.name, DUAL.contactName);
  const internal = dir.byId(DUAL.id);
  assert.equal(internal.side, "internal");
  assert.equal(internal.name, DUAL.name);
  assert.equal(internal.dept, "RMM");
  assert.deepEqual(dir.suppliers[0].contactIds, [MINT]);
  assert.ok(dir.isMember(DUAL.id, "SAF") && dir.isMember(DUAL.id, "admin"));
  assert.equal(dir.personaIdFor(DUAL.id, "admin"), "u-admin");
  assert.ok(dir.users().some((u) => u.id === MINT) && dir.users().some((u) => u.id === DUAL.id && u.side === "internal"));
  assert.deepEqual(dir.overlaps.map((o) => [o.id, o.uid, o.supplierCode, o.why]), [[MINT, DUAL.id, DUAL.supplier, ["internal user"]]]);
  const idw = warnings.filter((w) => w.startsWith("identity"));
  assert.equal(idw.length, 1);
  assert.ok(idw[0].includes(DUAL.id) && idw[0].includes(MINT));
  assert.ok(!idw[0].includes(DUAL.email) && !idw[0].includes("Dana"), "ids only, no personal data");
  assert.equal(dir.isHuman(DUAL.id), true);
});

test("identity: the service user, a uid at two suppliers and split-all are shared; a uid twice at one supplier: both rows kept, by-id = last row (as before)", () => {
  const warnings = [];
  const dir = buildDirectory({
    roleMembers: rolesOf(people()),
    supplierRows: [
      supplierRow("ZZT-A", [contactRow("A-c1", "Max Multi", "max.multi@zzt.example", "UsMULTI"), contactRow("A-c2", "Svc Portal", "svc.portal@zzt.example", "UsKEY"), contactRow("A-c3", "Max Again", "max.again@zzt.example", "UsMULTI")]),
      supplierRow("ZZT-B", [contactRow("B-c1", "Max Multi", "max.multi@zzt.example", "UsMULTI"), contactRow("B-c2", "No Portal", "no.portal@zzt.example", "")]),
    ],
    serviceUserIds: ["UsKEY"],
    warn: (w) => warnings.push(w),
  });
  assert.deepEqual(dir.contacts.map((c) => c.id), ["sup:ZZT-A:UsMULTI", "sup:ZZT-A:UsKEY", "sup:ZZT-A:UsMULTI", "sup:ZZT-B:UsMULTI", "contact:B-c2"]);
  assert.deepEqual(dir.overlaps.map((o) => o.why.join("+")), ["contact of 2 suppliers", "service user", "contact of 2 suppliers"], "one overlap per minted id");
  assert.ok(warnings.some((w) => /ZZT-A lists portal user UsMULTI twice \(contact A-c3\): look-ups by id use the last row/.test(w)));
  assert.equal(dir.byId("sup:ZZT-A:UsMULTI").name, "Max Again", "the last row wins in by-id look-ups, as before identity.mjs");
  assert.equal(dir.contactIdFor("UsMULTI", "ZZT-A"), "sup:ZZT-A:UsMULTI");
  // split-all (tests only): every portal user is minted; a contact without a portal user never is
  const split = buildDirectory({ roleMembers: rolesOf(people()), supplierRows: [row(solvaroSupplier()), supplierRow("ZZT-B", [contactRow("B-c2", "No Portal", "no.portal@zzt.example", "")])], splitAll: true });
  assert.deepEqual(split.contacts.map((c) => c.id), ["sup:s1:u-sup-1", "sup:s1:u-sup-2", "contact:B-c2"]);
  assert.deepEqual(split.suppliers[0].contactIds, ["sup:s1:u-sup-1", "sup:s1:u-sup-2"]);
});

test("identity: kfId, MINTED, unmint (deep, whole strings, members of the minted set only), findMinted", () => {
  const ids = new Set([MINT]);
  assert.ok(MINTED.test(MINT) && isMinted(MINT));
  assert.equal(kfId(MINT, ids), DUAL.id);
  assert.equal(kfId(MINT), MINT, "without the directory's minted ids nothing is replaced");
  assert.equal(kfId("sup:A:B:C", ids), "sup:A:B:C", "not a minted id");
  assert.equal(kfId("sup:ES:Tarragona", ids), "sup:ES:Tarragona", "free text shaped like a minted id is no member: unchanged");
  assert.equal(kfId("UsX", ids), "UsX");
  assert.equal(kfId(undefined, ids), undefined);
  assert.deepEqual(kfId({ _id: MINT }, ids), { _id: MINT }, "kfId maps strings only");
  const v = { a: [MINT, `x ${MINT}`, 3, null, "sup:ES:Tarragona"], b: { c: MINT, d: undefined }, e: "plain" };
  assert.deepEqual(unmint(v, ids), { a: [DUAL.id, `x ${MINT}`, 3, null, "sup:ES:Tarragona"], b: { c: DUAL.id, d: undefined }, e: "plain" });
  assert.equal(unmint(v), v, "no minted set: the value itself");
  assert.equal(unmint(v, new Set()), v);
  const clean = { a: ["UsX"], b: { c: 1 } };
  assert.equal(unmint(clean, ids), clean);
  assert.equal(scrubMinted(`boom ${MINT}; again ${MINT}`, ids), `boom ${DUAL.id}; again ${DUAL.id}`);
  assert.equal(scrubMinted("sup:ES:Tarragona", ids), "sup:ES:Tarragona");
  assert.equal(findMinted({ Body: JSON.stringify({ by: MINT }) }, new Set([MINT])), MINT, "found inside JSON strings");
  assert.equal(findMinted({ x: [{ y: "sup:OTHER:Us1" }] }, new Set([MINT])), null);
  assert.equal(findMinted({ x: MINT }, new Set()), null, "an empty guard is idle");
});

test("identity: contactIdFor (only the supplier's own contact; without a supplier the only one), supplierIdFor, contactByEmail, byEmail prefer", () => {
  const ps = [...people(), dualPeople()[0]];
  const dir = buildDirectory({
    roleMembers: rolesOf(ps),
    supplierRows: [row(solvaroSupplier()), row(zztDevSupplier()), supplierRow("ZZT-A", [contactRow("A-c1", "Max Multi", "max.multi@zzt.example", "UsMULTI")]), supplierRow("ZZT-B", [contactRow("B-c1", "Max Multi", "max.multi@zzt.example", "UsMULTI")])],
  });
  assert.equal(dir.contactIdFor(DUAL.id, DUAL.supplier), MINT);
  assert.equal(dir.contactIdFor(DUAL.id, "s1"), undefined, "not at s1: never another supplier's contact");
  assert.equal(dir.supplierIdFor(DUAL.id, "s1"), DUAL.id, "a stored s1 position never decodes to a ZZT-DEV contact");
  assert.equal(dir.contactIdFor(DUAL.id), MINT);
  assert.equal(dir.contactIdFor("UsMULTI", "ZZT-A"), "sup:ZZT-A:UsMULTI");
  assert.equal(dir.contactIdFor("UsMULTI", "ZZT-B"), "sup:ZZT-B:UsMULTI");
  assert.equal(dir.contactIdFor("UsMULTI"), undefined, "two contacts and no supplier: no guess");
  assert.equal(dir.contactIdFor("u-saf-2", "s1"), undefined);
  assert.equal(dir.contactIdFor(MINT, DUAL.supplier), MINT, "an already minted id maps to itself");
  assert.equal(dir.supplierIdFor(DUAL.id, DUAL.supplier), MINT);
  assert.equal(dir.supplierIdFor("u-saf-2", DUAL.supplier), "u-saf-2");
  assert.equal(dir.supplierIdFor("system", DUAL.supplier), "system");
  assert.deepEqual(dir.suppliersOfUid("UsMULTI"), ["ZZT-A", "ZZT-B"]);
  // contacts only, the case's supplier first
  assert.equal(dir.contactByEmail("max.multi@zzt.example", "ZZT-B").id, "sup:ZZT-B:UsMULTI");
  assert.equal(dir.contactByEmail("MAX.MULTI@zzt.example", "ZZT-A").id, "sup:ZZT-A:UsMULTI");
  assert.equal(dir.contactByEmail("max.multi@zzt.example").id, "sup:ZZT-A:UsMULTI", "without a supplier: the first match");
  assert.equal(dir.contactByEmail(DUAL.email, "s1"), undefined, "never a contact of another supplier");
  assert.equal(dir.contactByEmail(DUAL.email, DUAL.supplier).id, MINT);
  assert.equal(dir.contactByEmail("ole.brandt@beiersdorf.example", "s1"), undefined, "never an internal user");
  // byEmail: the shared address goes to the contact by default (as before), to the internal user when preferred
  assert.equal(dir.byEmail(DUAL.email).id, MINT);
  assert.equal(dir.byEmail(DUAL.email, "internal").id, DUAL.id);
  assert.equal(dir.byEmail("ole.brandt@beiersdorf.example", "supplier").id, "u-saf-2");
  assert.equal(dir.byEmail("ravi.menon@solvaro.example", "internal").id, "u-sup-2");
});

test("identity: decodeCase maps exactly the supplier positions; unmint(decodeCase(c)) = c", () => {
  const { dir } = dualDirectory();
  const U = DUAL.id;
  const c = {
    id: "CIQ-2026-0042",
    supplierId: DUAL.supplier,
    ownerId: U,
    supplierContactIds: [U],
    answeredBy: { SF01: { by: U, at: "2026-10-15T08:00:00Z" }, "K2.1:components": { by: U, at: "2026-10-15T08:01:00Z" } },
    documents: [{ id: "d1", name: "coa.pdf", uploadedBy: U, uploadedAt: "2026-10-15T08:02:00Z" }],
    confirmations: [{ type: "completeness", by: U, name: "x", at: "a" }, { type: "dept-completion", by: U, dept: "SAF", at: "b" }, { type: "final-release", by: U, at: "c" }],
    reviews: [{ dept: "SAF", assigneeId: U, status: "in-review" }],
    openPoints: [{ id: "OP-0042-01", createdBy: U, responsibleId: U, closedBy: U, thread: [{ by: U, side: "internal", action: "raised" }, { by: U, side: "supplier", action: "answered" }] }],
    scope: [{ sectionId: "K4.3", manual: { by: U, at: "x" } }],
  };
  const d = decodeCase(c, dir);
  assert.deepEqual(d.supplierContactIds, [MINT]);
  assert.deepEqual(Object.values(d.answeredBy).map((x) => x.by), [MINT, MINT]);
  assert.equal(d.documents[0].uploadedBy, MINT);
  assert.deepEqual(d.confirmations.map((x) => x.by), [MINT, U, MINT], "a department completion is internal");
  assert.deepEqual(d.openPoints[0].thread.map((m) => m.by), [U, MINT]);
  assert.equal(d.ownerId, U);
  assert.equal(d.reviews[0].assigneeId, U);
  assert.equal(d.openPoints[0].createdBy, U);
  assert.equal(d.openPoints[0].responsibleId, U);
  assert.equal(d.scope[0].manual.by, U);
  assert.deepEqual(unmint(d, dir.mintedIds), c);
  assert.deepEqual(dir.unmint(d), c);
  assert.deepEqual(c.supplierContactIds, [U], "the stored case is not mutated");
});

test("identity: the prototype's own tripwire refuses the internal user on every supplier action (and lets its contact side in)", () => {
  const { dir } = dualDirectory();
  const config = configFromRows(Object.values(seedRows()).flat().map((r, i) => ({ ...r, _id: `r${i}` })));
  let w = buildWorld({ users: dir.users({ [DUAL.id]: "RMM" }), suppliers: dir.suppliers, config, cases: [] });
  const code = "CIQ-2026-0042";
  w = D.A.createCase(w, DUAL.id, { materialName: "Test oil", inci: "Olea Europaea Fruit Oil", materialNo: "RM-1", supplierId: DUAL.supplier, contactIds: [MINT], markets: ["EU"], dueDate: "2026-12-31T00:00:00.000Z", priority: "normal", ownerId: DUAL.id }, "2026-10-15T08:00:00.000Z", code).state;
  const base = caseIn(w, code);
  assert.ok(base, "the internal user (RMM) creates the case with its contact side as the case contact");
  const withPhase = (phase) => ({ ...w, cases: [{ ...base, phase }] });
  const at = "2026-10-15T09:00:00.000Z";
  const actions = {
    setAnswer: ["supplier-input", (s, by) => D.A.setAnswer(s, by, code, "FLD-GEN-004", "Teststadt plant", at)],
    setComponents: ["supplier-input", (s, by) => D.A.setComponents(s, by, code, [{ id: "c1", inci: "Olea Europaea Fruit Oil", fn: "emollient", additive: false, origin: "vegetable", concMin: 99, concMax: 100 }], at)],
    setJustification: ["supplier-input", (s, by) => D.A.setJustification(s, by, code, "FLD-5.1-002", "Not available.", at)],
    uploadDocument: ["supplier-input", (s, by) => D.A.uploadDocument(s, by, code, { name: "coa.pdf", kind: "Analysis", sectionId: "K1" }, at).state],
    reportChange: ["completed", (s, by) => D.A.reportChange(s, by, code, "New site.", at)],
    confirmCompleteness: ["supplier-input", (s, by) => D.A.confirmCompleteness(s, by, code, at)],
    finalRelease: ["final-release", (s, by) => D.A.finalRelease(s, by, code, at)],
  };
  for (const [name, [phase, fn]] of Object.entries(actions)) {
    const asInternal = runAction(withPhase(phase), code, (s) => fn(s, DUAL.id));
    assert.equal(asInternal.refused, true, `${name}: the internal user is refused`);
    assert.equal(asInternal.refusal, CONTACT_GUARD, name);
    const asContact = runAction(withPhase(phase), code, (s) => fn(s, MINT));
    assert.notEqual(asContact.refusal, CONTACT_GUARD, `${name}: the contact side passes the side guard`);
  }
});

test("identity: mail C-00 by id and side: one Internal and one Supplier row to the same address; crossed audiences dropped", () => {
  const { dir } = dualDirectory();
  const c = { id: "CIQ-2026-0042", supplierContactIds: [MINT], internalNotes: [], openPoints: [], reviews: [], confirmations: [] };
  const mails = [
    { event: "op-raised", audience: "supplier", to: [MINT], subject: "s1", body: "b", link: "/portal/case/X", caseId: c.id, by: DUAL.id },
    { event: "op-answered", audience: "internal", to: [DUAL.id], subject: "s2", body: "b", link: "/review/X", caseId: c.id, by: MINT },
    { event: "op-accepted", audience: "supplier", to: [DUAL.id], subject: "s3", body: "b", link: "", caseId: c.id, by: DUAL.id },
    { event: "change-reported", audience: "internal", to: [MINT], subject: "s4", body: "b", link: "", caseId: c.id, by: MINT },
    { event: "data-changed", audience: "internal", to: [DUAL.id], subject: "s5", body: "K2.2: x", link: "/review/X", caseId: c.id, by: MINT },
  ];
  const { rows, dropped, debounced } = outboxRows({ directory: dir, c, mails, triggerKey: "req:R1", at: "2026-10-15T10:00:00.000Z" });
  assert.deepEqual(rows.map((r) => [r.Event_Code, r.Audience, r.To_Emails]), [["op-raised", "Supplier", DUAL.email], ["op-answered", "Internal", DUAL.email]]);
  assert.deepEqual(dropped.map((d) => d.key), ["op-accepted:req:R1:3", "change-reported:req:R1:4"], "a supplier mail never reaches the internal user, an internal mail never the contact");
  assert.equal(debounced.length, 1);
  assert.equal(debounced[0].by, DUAL.id, "the debounce entry (ledger, Mail_Key) carries the Kissflow id");
});

test("identity: audit rows take the side from the in-memory id", () => {
  const { dir } = dualDirectory();
  const row = (by) => auditRow({ key: "k#1", entry: { at: "2026-10-15T10:00:00Z", by, action: "Answered query", detail: "OP-0042-01: x" }, directory: dir, caseCode: "C" });
  const s = row(MINT);
  assert.deepEqual([s.Actor_Side, s.Actor_Name, s.Actor_Email, s.Actor_Dept], ["Supplier", DUAL.contactName, DUAL.email, undefined]);
  const b = row(DUAL.id);
  assert.deepEqual([b.Actor_Side, b.Actor_Name, b.Actor_Email, b.Actor_Dept], ["BDF", DUAL.name, DUAL.email, "RMM"]);
  const a = row("u-admin");
  assert.deepEqual([a.Actor_Side, a.Actor_Name], ["BDF", DUAL.name], "the persona alias is the real person");
  assert.equal(row("system").Actor_Side, "System");
});

test("identity: the port's leak guard refuses a write carrying a minted id before any call (live and dry-run); idle when empty", async () => {
  const clock = makeClock();
  const fake = createFake({ users: dualPeople(), keyUserId: "u-svc", clock });
  const port = createPort({ kf: fake.key, now: () => clock.now(), serviceUserId: "u-svc", minIntervalMs: 0 });
  port.setLeakGuard(new Set([MINT]));
  await assert.rejects(port.createAndSubmit(FLOW.query, { Query_Key: "Q1", Assigned_Contacts: [{ _id: MINT }] }), IdentityLeakError);
  await assert.rejects(port.createFormRow(FLOW.outbox, { Mail_Key: "k1", Body_Text: JSON.stringify({ by: MINT }) }), (e) => e instanceof IdentityLeakError && !isDeferral(e) && !e.message.includes(MINT) && e.message.includes(DUAL.id));
  assert.equal(fake.log.length, 0, "nothing reached Kissflow");
  const dry = createPort({ kf: fake.key, dryRun: true, now: () => clock.now(), minIntervalMs: 0 });
  dry.setLeakGuard([MINT]);
  await assert.rejects(dry.createFormRow(FLOW.caseData, { Case_Code: "C", Sync_Note: JSON.stringify({ core: { contactIds: [MINT] } }) }), IdentityLeakError);
  assert.equal(dry.intended.length, 0);
  // the Kissflow id passes; an empty guard is idle
  const ok = await port.createFormRow(FLOW.outbox, { Mail_Key: "k2", Body_Text: JSON.stringify({ by: DUAL.id }) });
  assert.ok(ok._id);
  port.setLeakGuard(new Set());
  assert.ok((await port.createFormRow(FLOW.outbox, { Mail_Key: "k3", Body_Text: MINT }))._id);
});

test("identity: a service user who is a real person (dev) is distrusted: their own UI write moments ago defers the service", async () => {
  const clock = makeClock();
  const users = dualPeople({ serviceRole: true }); // the key's user is the dual user
  const fake = createFake({ users, keyUserId: DUAL.id, clock });
  const port = createPort({ kf: fake.key, now: () => clock.now(), serviceUserId: DUAL.id, minIntervalMs: 0 });
  const it = await port.createAndSubmit(FLOW.review, { Review_Key: "K-SAF", Case_Code: "C", Case_Item_Id: "Pk1", Review_Dept: "SAF" });
  assert.equal(port.isOwnWrite(fake.item(it.id)), true);
  // the same person, through the Workbench (not the key), writes at the step
  const ui = uiClient(fake, DUAL.id);
  const inst = fake.item(it.id)._current_context[0]._context_activity_instance_id;
  const w = await ui.call("POST", `/process/2/${fake.acc}/${FLOW.review}/${it.id}/${inst}?_application_id=${APP}`, { Review_Confirm: "Confirmed" });
  assert.equal(w.status, 200, "a UI client of the key's user is an ordinary user (viaKey false)");
  assert.equal(fake.item(it.id)._modified_by._id, DUAL.id);
  // trusted (the default) the service would take that write for its own and overwrite it
  assert.equal(port.isOwnWrite(fake.item(it.id)), true);
  await port.adminUpdate(FLOW.review, it.id, { Open_Count: 1 });
  // distrusted (as makeCtx does when the service user is a person of the directory): deferred
  clock.advance(1000);
  await ui.call("POST", `/process/2/${fake.acc}/${FLOW.review}/${it.id}/${inst}?_application_id=${APP}`, { Review_Confirm: "Confirmed", Completed_At: "2026-10-15T07:00:01Z" });
  port.setServiceUserTrusted(false);
  assert.equal(port.isOwnWrite(fake.item(it.id)), false);
  await assert.rejects(port.adminUpdate(FLOW.review, it.id, { Open_Count: 2 }), DeferredError);
  clock.advance(5000);
  await port.adminUpdate(FLOW.review, it.id, { Open_Count: 2 });
  assert.equal(fake.item(it.id).Open_Count, 2);
  assert.equal(port.isOwnWrite(fake.item(it.id)), true, "its own write is still recognised by its write time");
  // the key's own client keeps the admin powers; the key cannot update fields after Start (P1) either way
  assert.equal((await fake.key.call("GET", `/process/2/${fake.acc}/admin/${FLOW.review}/${it.id}?_application_id=${APP}`)).status, 200);
  assert.equal((await ui.call("GET", `/process/2/${fake.acc}/admin/${FLOW.review}/${it.id}?_application_id=${APP}`)).status, 403);
  assert.ok(PORTAL && APP_ROLES.length === 11 && ROLE.supplier);
});
