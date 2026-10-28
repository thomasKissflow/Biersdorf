// Test harness: the fake of both containers, seeded with the prototype's fictional people (seed.ts) and the supplier
// Solvaro Oleochemicals S.A., plus simulators for the Workbench (real users acting as themselves) and the supplier
// portal UI (contacts writing the CIQP items they are assigned to). Nothing here talks to Kissflow.
//
// Identity fixtures (identity.mjs): `dualPeople()` is one fictional Kissflow user in every app role who is also the only
// contact of the fictional supplier ZZT-DEV (the dev sandbox's situation). CIQ_TEST_SPLIT_ALL=1 (read here only) runs
// every setup with split-all minting and the fake's strictUsers, so all supplier contacts get in-memory ids.

process.env.TZ = "Europe/Berlin";

import { writeFileSync } from "node:fs";
import { createFake, makeClock, uiClient } from "../fake.mjs";
import { createPort } from "../kissflow.mjs";
import { createService, memoryState } from "../service.mjs";
import { seedRows } from "../config.mjs";
import { D, toCiqCase, readLedger, J, rmesFromRows } from "../engine.mjs";
import { FLOW, ROLE, STEP, F } from "../ids.mjs";
import { configFromRows } from "../config.mjs";

export const ROLE_OF = { "u-rmm": [ROLE.RMM], "u-reg": [ROLE.REG], "u-saf": [ROLE.SAF], "u-qm": [ROLE.QM], "u-mic": [ROLE.MIC], "u-sus": [ROLE.SUS], "u-cus": [ROLE.CUS], "u-leg": [ROLE.LEG], "u-admin": [ROLE.admin], "u-auditor": [ROLE.auditor], "u-owner": [ROLE.owner] };

export function people() {
  const internal = D.ROLE_HOLDERS.map((u) => ({ _id: u.id, Name: u.name, Email: u.email, roles: ROLE_OF[u.id] ?? [] }));
  const extra = [
    { _id: "u-saf-2", Name: "Dr. Ole Brandt", Email: "ole.brandt@beiersdorf.example", roles: [ROLE.SAF] },
    { _id: "u-svc", Name: "CIQ Integration Service", Email: "ciq-service@beiersdorf.example", roles: [ROLE.service] },
  ];
  const s1 = D.SUPPLIER_DEFS.find((d) => d.id === "s1");
  const contacts = D.contactsOfDef(s1).map((u) => ({ _id: u.id, Name: u.name, Email: u.email, roles: [ROLE.supplier] }));
  // a third Solvaro portal user, added to the master by the H-18 test (a portal user exists before it is assigned)
  const carla = { _id: "u-sup-3", Name: "Carla Ruiz", Email: "carla.ruiz@solvaro.example", roles: [ROLE.supplier] };
  return [...internal, ...extra, ...contacts, carla];
}

/** The supplier master row of Solvaro Oleochemicals S.A. with Elena and Ravi (today's default). */
export function solvaroSupplier() {
  const s1 = D.SUPPLIER_DEFS.find((d) => d.id === "s1");
  const contacts = D.contactsOfDef(s1);
  return {
    fields: { Supplier_Code: "s1", Supplier_Legal_Name: s1.name, DUNS_Number: s1.duns, Supplier_Kind: "Manufacturer", Supplier_Country_Code: "ES", Supplier_City: s1.city, Supplier_Active: "Yes" },
    contacts: contacts.map((u, i) => ({ Contacts_Key: `s1-c${i + 1}`, Contacts_Full_Name: u.name, Contacts_Email: u.email, Contacts_Title: u.title, Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: u.id, Contacts_Active: "Yes" })),
  };
}

// ---------------------------------------------------------------------------------------------- the dual user (dev)

/** One fictional Kissflow user, internal in every app role AND the only contact of the fictional supplier ZZT-DEV. */
export const DUAL = {
  id: "UsDUAL00001",
  name: "Dana Devtest",
  email: "dana.devtest@example.test",
  supplier: "ZZT-DEV",
  supplierName: "ZZT Dev Supplier (fictional)",
  contactKey: "ZZT-DEV-c1",
  contactName: "Dana Devtest (dev supplier)",
};
export const APP_ROLES = [ROLE.RMM, ROLE.REG, ROLE.SAF, ROLE.QM, ROLE.MIC, ROLE.SUS, ROLE.CUS, ROLE.LEG, ROLE.admin, ROLE.auditor, ROLE.owner];
export const SVC_USER = { _id: "u-svc", Name: "CIQ Integration Service", Email: "ciq-service@beiersdorf.example", roles: [ROLE.service] };

/** The dual user (all 11 app roles + the portal Supplier role) and the service's key user u-svc. */
export function dualPeople({ serviceRole = false } = {}) {
  const dana = { _id: DUAL.id, Name: DUAL.name, Email: DUAL.email, roles: [...APP_ROLES, ROLE.supplier, ...(serviceRole ? [ROLE.service] : [])] };
  return serviceRole ? [dana] : [dana, { ...SVC_USER }];
}

/** The fictional supplier ZZT-DEV whose only contact (ZZT-DEV-c1) is the dual user. */
export function zztDevSupplier({ extraContacts = [] } = {}) {
  return {
    fields: { Supplier_Code: DUAL.supplier, Supplier_Legal_Name: DUAL.supplierName, DUNS_Number: "999000001", Supplier_Kind: "Manufacturer", Supplier_Country_Code: "DE", Supplier_City: "Teststadt", Supplier_Active: "Yes" },
    contacts: [{ Contacts_Key: DUAL.contactKey, Contacts_Full_Name: DUAL.contactName, Contacts_Email: DUAL.email, Contacts_Title: "Dev supplier contact", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: DUAL.id, Contacts_Active: "Yes" }, ...extraContacts],
  };
}

/** CIQ Case Start fields for a case of ZZT-DEV filed by the dual user. */
export const dualCaseFields = (extra = {}) => ({
  Supplier_Code: DUAL.supplier,
  Supplier_Legal_Name: DUAL.supplierName,
  Owner_RMM: { _id: DUAL.id },
  BDF_Contact_Name: DUAL.name,
  BDF_Contact_Email: DUAL.email,
  Portal_Contact_Ids: DUAL.id,
  Confirm_Contact_Ids: DUAL.id,
  Supplier_Contact_Emails: DUAL.email,
  ...extra,
});

/** Every department reviewed by the dual user. */
export const DUAL_REVIEWERS = { RMM: DUAL.id, REG: DUAL.id, SAF: DUAL.id, QM: DUAL.id, MIC: DUAL.id, SUS: DUAL.id };

// ---------------------------------------------------------------------------------------------- setup

/** CIQ_TEST_SPLIT_ALL=1: every setup mints every contact and the fake is strict about user ids (read here only). */
export const SPLIT_ALL = process.env.CIQ_TEST_SPLIT_ALL === "1";
const splitReport = { setups: 0, mintedMax: 0, leaks: [] };
const splitFakes = [];
if (SPLIT_ALL && process.env.CIQ_TEST_SPLIT_REPORT) {
  // After the test file: no fake row may hold a minted id (identity.mjs), whatever the assertions checked.
  process.on("exit", () => {
    for (const fake of splitFakes)
      for (const flow of Object.keys(fake.schema))
        for (const r of fake.rows(flow)) if (JSON.stringify(r).includes("sup:")) splitReport.leaks.push(`${flow}/${r._id}`);
    writeFileSync(process.env.CIQ_TEST_SPLIT_REPORT, JSON.stringify(splitReport));
  });
}

/**
 * @param {object} [o]
 * @param {object[]} [o.users]       fake users ({_id, Name, Email, roles}); default people()
 * @param {object[]} [o.suppliers]   supplier master rows ({fields, contacts}); default Solvaro
 * @param {string} [o.keyUserId]     the account key's user (default u-svc)
 * @param {string} [o.serviceUserId] CIQ_SERVICE_USER_ID (default u-svc)
 * @param {boolean} [o.splitAll]     every contact minted (default: CIQ_TEST_SPLIT_ALL=1)
 * @param {boolean} [o.strictUsers]  the fake refuses unknown user ids (default: CIQ_TEST_SPLIT_ALL=1)
 */
export function setup({ start = "2026-10-15T07:00:00.000Z", attacher, schema, users = people(), suppliers = [solvaroSupplier()], keyUserId = "u-svc", serviceUserId = "u-svc", splitAll = SPLIT_ALL, strictUsers = SPLIT_ALL } = {}) {
  const clock = makeClock(start);
  const fake = createFake({ users, keyUserId, clock, strictUsers, ...(schema ? { schema } : {}) });
  if (SPLIT_ALL) splitFakes.push(fake);
  // configuration (the seed generator's rows: RS-2026.1 + v1 published, RS-2026.2 + v2 draft, singletons)
  for (const rows of Object.values(seedRows())) for (const r of rows) fake.seedForm(FLOW.config, r, {}, "u-admin");
  // the supplier master (default: Solvaro with Elena and Ravi)
  for (const s of suppliers) fake.seedForm(FLOW.supplier, s.fields, { [F.supplier.contacts.table]: s.contacts }, "u-admin");
  const logs = [];
  const port = createPort({ kf: fake.key, files: fake.keyFiles, now: () => clock.now(), serviceUserId, minIntervalMs: 0, log: (e) => logs.push(e) });
  const state = memoryState();
  const service = createService({ port, now: () => clock.now().toISOString(), log: (e) => logs.push(e), linkBase: { internal: "https://workbench.example.test/#", supplier: "https://portal.example.test/#" }, attacher, state, splitAll });
  const cfg = () => configFromRows(fake.rows(FLOW.config)).cfg;
  if (SPLIT_ALL) splitReport.setups++;
  const h = {
    clock,
    fake,
    port,
    service,
    state,
    logs,
    cfg,
    users,
    tick(ms = 3_600_000) {
      clock.advance(ms);
    },
    /** The mail integration (§4.6): every outbox row it "sent" gets Sent_Status, like its second action. */
    integrationOn: true,
    deliverMails() {
      const mailer = h.fake.clientFor("u-svc");
      for (const r of h.fake.rows(FLOW.outbox)) if (!r.Sent_Status) h.fake.seedUpdate?.(r._id, { Sent_Status: "Sent" });
    },
    async run(opts) {
      if (h.integrationOn) h.deliverMails();
      h.tick(60_000);
      const hb = await service.runOnce(opts);
      if (SPLIT_ALL) splitReport.mintedMax = Math.max(splitReport.mintedMax, hb.directory?.overlaps ?? 0);
      if (hb.errors.filter((e) => !e.startsWith("warning")).length) throw new Error(`service errors: ${hb.errors.join("; ")}`);
      return hb;
    },
    caseRow: (code) => fake.rows(FLOW.caseData).find((r) => r.Case_Code === code),
    ledger: (code) => readLedger(h.caseRow(code)),
    ciq: (code) => {
      const L = h.ledger(code);
      return toCiqCase(h.caseRow(code), { rmes: rmesFromRows({ SAF: L.items["rmes:SAF"] ? fake.item(L.items["rmes:SAF"]) : null, REG: L.items["rmes:REG"] ? fake.item(L.items["rmes:REG"]) : null }) });
    },
    outbox: (code) => fake.rows(FLOW.outbox).filter((r) => !code || r.Case_Code === code),
    audit: (code) => fake.rows(FLOW.audit).filter((r) => !code || r.Case_Code === code),
    requests: () => fake.rows(FLOW.serviceRequest),
    item: (id) => fake.item(id),
    reviewItem: (code, dept) => {
      const L = h.ledger(code);
      const rounds = Object.keys(L.items).filter((k) => k.startsWith(`review:${dept}:`)).map((k) => Number(k.split(":")[2])).sort((a, b) => a - b);
      return rounds.length ? fake.item(L.items[`review:${dept}:${rounds.at(-1)}`]) : null;
    },
    opItem: (code, opId) => fake.item(h.ledger(code).items[`op:${opId}`]),
    queryItem: (code, opId, round) => fake.item(h.ledger(code).items[`query:${opId}:r${round}`]),
    requestItem: (code) => fake.item(h.ledger(code).items.request),
    releaseItem: (code) => fake.item(h.ledger(code).items.releaseCurrent),
    /** The newest outbox rows since a mark, as "Event_Code → To" strings. */
    mailsSince(mark, code) {
      return h.outbox(code).slice(mark).map((r) => `${r.Event_Code} → ${r.To_Emails}`);
    },
  };
  h.wb = (userId) => workbench(h, userId);
  h.sup = (userId) => supplierPortal(h, userId);
  return h;
}

// ---------------------------------------------------------------------------------------------- Workbench simulator

let reqSeq = 0;
function workbench(h, userId) {
  const c = uiClient(h.fake, userId);
  const ok = (r, what) => {
    if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const q = (flow) => `_application_id=${flow.startsWith("CIQP") ? "CIQ_Supplier_Portal_A00" : "CIQ_Digital_A00"}`;
  return {
    client: c,
    /** RMM creates the CIQ Case at Start (Case_Code written at Start) and submits it (§4.1). */
    async createCase(fields) {
      const body = {
        Cycle_No: 1,
        Trade_Name: "OLIVIA Pure 100",
        Main_INCI: "Olea Europaea Fruit Oil",
        BDF_Material_No: "RM-500123",
        Supplier_Code: "s1",
        Supplier_Legal_Name: "Solvaro Oleochemicals S.A.",
        Owner_RMM: { _id: userId },
        BDF_Contact_Name: "Katrin Vogel",
        BDF_Contact_Email: "katrin.vogel@beiersdorf.example",
        Supplier_Due_Date: "2026-12-31",
        Case_Contacts_JSON: "[]",
        Portal_Contact_Ids: "u-sup-1,u-sup-2",
        Confirm_Contact_Ids: "u-sup-1,u-sup-2",
        Supplier_Contact_Emails: "elena.marquez@solvaro.example, ravi.menon@solvaro.example",
        Target_Markets_Text: "EU",
        Release_Item_Id: "seed",
        Release_Key: "RS-2026.1 + v1",
        Manifest_Hash: "seed",
        Rule_Set_Version: "RS-2026.1",
        Template_Version: "CIQ-2026 v1",
        Priority: "Normal",
        ...fields,
      };
      const r = ok(await c.call("POST", `/process/2/${c.acc}/${FLOW.caseProc}?${q(FLOW.caseProc)}`, body), "create case");
      ok(await c.call("POST", `/process/2/${c.acc}/${FLOW.caseProc}/${r._id}/${r._activity_instance_id}/submit?${q(FLOW.caseProc)}`, {}), "submit case");
      return r._id;
    },
    /** A CIQ Service Request row, created as this user (draft + submit). */
    async request(code, caseCode, payload = {}, objectKey = "") {
      h.tick(1000);
      const key = `RQ-${userId}-${++reqSeq}`;
      ok(await c.call("POST", `/form/2/${c.acc}/${FLOW.serviceRequest}?${q(FLOW.serviceRequest)}`, { Request_Key: key, Request_Code: code, Case_Code: caseCode, Object_Key: objectKey, Payload_JSON: JSON.stringify(payload) }), "request draft");
      const row = ok(await c.call("POST", `/form/2/${c.acc}/${FLOW.serviceRequest}/draft_${userId}/submit?${q(FLOW.serviceRequest)}`, {}), "request submit");
      return row;
    },
    /** A user writes fields at its own step and submits it (the S-1 path: real user, SDK). */
    async actAtStep(flow, itemId, fields, { submit = true } = {}) {
      const it = h.fake.item(itemId);
      const inst = it._current_context[0]._context_activity_instance_id;
      if (fields && Object.keys(fields).length) ok(await c.call("POST", `/process/2/${c.acc}/${flow}/${itemId}/${inst}?${q(flow)}`, fields), "write step");
      if (submit) ok(await c.call("POST", `/process/2/${c.acc}/${flow}/${itemId}/${inst}/submit?${q(flow)}`, {}), "submit step");
    },
    async note(caseCode, text, extra = {}) {
      ok(await c.call("POST", `/form/2/${c.acc}/${FLOW.note}?${q(FLOW.note)}`, { Note_Key: `N-${++reqSeq}`, Case_Code: caseCode, Note_Text: text, ...extra }), "note draft");
      return ok(await c.call("POST", `/form/2/${c.acc}/${FLOW.note}/draft_${userId}/submit?${q(FLOW.note)}`, {}), "note submit");
    },
  };
}

// ---------------------------------------------------------------------------------------------- supplier portal simulator

function supplierPortal(h, userId) {
  const c = uiClient(h.fake, userId);
  const me = h.users.find((u) => u._id === userId);
  const q = `_application_id=CIQ_Supplier_Portal_A00`;
  const write = async (flow, itemId, fields) => {
    const it = h.fake.item(itemId);
    const inst = it._current_context[0]._context_activity_instance_id;
    const r = await c.call("POST", `/process/2/${c.acc}/${flow}/${itemId}/${inst}?${q}`, fields);
    if (r.status >= 300) throw new Error(`supplier write: ${r.status} ${JSON.stringify(r.body)}`);
  };
  const submit = async (flow, itemId) => {
    const it = h.fake.item(itemId);
    const inst = it._current_context[0]._context_activity_instance_id;
    const r = await c.call("POST", `/process/2/${c.acc}/${flow}/${itemId}/${inst}/submit?${q}`, {});
    if (r.status >= 300) throw new Error(`supplier submit: ${r.status} ${JSON.stringify(r.body)}`);
  };
  return {
    /**
     * One save of the portal UI: merged JSON fields, per-key who/when, Answers_Rev + 1 (§3.1). `bump: false`: no save
     * signal (an Uploads row whose upload notice the portal's lock refused, liveActions.ts bumpRev).
     */
    async save(caseCode, { config, answers, components, justifications, uploads } = {}, { bump = true } = {}) {
      h.tick(60_000);
      const reqId = h.ledger(caseCode).items.request;
      const it = h.fake.item(reqId);
      const at = h.clock.now().toISOString();
      const who = J(it.Answered_By_JSON, {});
      const mark = (keys) => keys.forEach((k) => (who[k] = { name: me.Name, email: me.Email, at }));
      const fields = {};
      if (config) {
        fields.Config_Answers_JSON = JSON.stringify({ ...J(it.Config_Answers_JSON, {}), ...config });
        mark(Object.keys(config));
      }
      if (answers) {
        fields.Answers_JSON = JSON.stringify({ ...J(it.Answers_JSON, {}), ...answers });
        mark(Object.keys(answers));
      }
      if (components) {
        fields.Components_JSON = JSON.stringify(components);
        mark(["K2.1:components"]);
      }
      if (justifications) {
        fields.Justifications_JSON = JSON.stringify({ ...J(it.Justifications_JSON, {}), ...justifications });
        mark(Object.keys(justifications));
      }
      if (uploads?.length) {
        // the portal UI uploads each file into Supplier_Files (SDK uploadFile, S-1 path), then writes its metadata row
        const att = uploads.map((u) => h.fake.userAttach(userId, FLOW.request, reqId, F.request.files, { name: u.name, bytes: Buffer.from(`%PDF-1.4\n% fictional test file ${u.name}\n`) }));
        fields[`Table::${F.request.uploads.table}`] = uploads.map((u, i) => ({ _id: `${F.request.uploads.table}_u${Date.now()}${i}`, _is_created: true, Upload_Id: u.id, Upload_Section_Key: u.sectionId, Upload_Field_Key: u.fieldId, Upload_Doc_Kind: u.kind ?? "Other", Upload_File_Name: u.name, Uploaded_By_Email: me.Email, Uploaded_At: at, Upload_Attachment_Id: att[i].id }));
        mark(uploads.map((u) => u.fieldId).filter(Boolean));
      }
      fields.Answered_By_JSON = JSON.stringify(who);
      if (bump) {
        fields.Answers_Rev = Number(it.Answers_Rev ?? 0) + 1;
        fields.Answers_Changed_At = at;
        fields.Answers_Changed_By_Email = me.Email;
      }
      await write(FLOW.request, reqId, fields);
    },
    async confirmCompleteness(caseCode) {
      h.tick(60_000);
      const reqId = h.ledger(caseCode).items.request;
      await write(FLOW.request, reqId, { Completeness_Confirm: "Confirmed", Completeness_By_Name: me.Name, Completeness_By_Email: me.Email, Completeness_By_Role: "Regulatory Manager", Completeness_At: h.clock.now().toISOString() });
      await submit(FLOW.request, reqId);
    },
    async answer(caseCode, opId, round, { kind = "Answer", text = "", uploadIds = [] } = {}) {
      h.tick(60_000);
      const qid = h.ledger(caseCode).items[`query:${opId}:r${round}`];
      await write(FLOW.query, qid, { Response_Kind: kind, Response_Text: text, Response_Doc_Refs_JSON: JSON.stringify(uploadIds), Supplier_Responsible_Email: me.Email });
      await submit(FLOW.query, qid);
    },
    async release(caseCode) {
      h.tick(60_000);
      const id = h.ledger(caseCode).items.releaseCurrent;
      await write(FLOW.release, id, { Supplier_Confirm: "Confirmed", Confirmed_By_Name: me.Name, Confirmed_By_Email: me.Email, Confirmed_By_Role: "Regulatory Manager", Confirmed_At: h.clock.now().toISOString() });
      await submit(FLOW.release, id);
    },
    async reportChange(caseCode, text) {
      h.tick(60_000);
      const reqId = h.ledger(caseCode).items.request;
      const it = h.fake.item(reqId);
      await write(FLOW.request, reqId, { Change_Report_Text: text, Change_Report_Rev: Number(it.Change_Report_Rev ?? 0) + 1, Answers_Changed_By_Email: me.Email, Answers_Changed_At: h.clock.now().toISOString() });
    },
  };
}

// ---------------------------------------------------------------------------------------------- filling the CIQ

function valueFor(f) {
  switch (f.type) {
    case "email":
      return "qa@solvaro.example";
    case "number":
      return 0.05;
    case "decimal":
      return 0.5;
    case "range":
      return { min: 1, max: 2 };
    case "yesno":
      return false;
    case "single":
      return f.options?.[0]?.value ?? "x";
    case "multi":
      return [f.options?.[0]?.value ?? "x"];
    case "longtext":
      return "Described in the attached statement.";
    default:
      return "Test value";
  }
}

export const PLAIN_CONFIG = { SF01: ["vegetable"], SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF09: false, SF10: false, SF12: true };
export const COMPONENTS = [{ id: "c1", inci: "Olea Europaea Fruit Oil", cas: "8001-25-0", fn: "emollient", additive: false, origin: "vegetable", concMin: 99, concMax: 100 }];

/** One valid row per SF-01 origin (matrix v0.6 D6: every row's origin is an SF-01 answer and every answer is used by a
 *  row); a vegetable case's first row is COMPONENTS[0]. */
export function componentsFor(c) {
  const origins = c.config.SF01?.length ? c.config.SF01 : ["vegetable"];
  return origins.map((o, i) => (i === 0 && o === "vegetable" ? COMPONENTS[0] : { id: `c${i + 1}`, inci: i ? `Component ${i + 1}` : c.inci, cas: "8001-25-0", fn: "emollient", additive: false, origin: o, concMin: i ? 0.1 : 99, concMax: i ? 1 : 100 }));
}

/** What a supplier fills so that no completeness blocker is left (by the service's own view of the case). */
export function fillFor(h, code) {
  const c = h.ciq(code);
  const cfg = h.cfg();
  const blockers = D.completenessBlockers(c, cfg);
  const answers = {};
  const justifications = {};
  const uploads = [];
  let components;
  for (const b of blockers) {
    if (b.fieldId?.startsWith("SF")) continue;
    if (!b.fieldId) {
      if (b.sectionId === "K2.1") components = componentsFor(c);
      continue;
    }
    if (D.isSlotKey(b.fieldId)) {
      uploads.push({ id: `UP-${code}-${b.fieldId}`, sectionId: b.sectionId, fieldId: b.fieldId, name: `${b.fieldId.slice(3)}.pdf`, kind: "Analysis" });
      continue;
    }
    const f = D.fieldOf(b.fieldId, c.templateVersion, cfg);
    if (b.fieldId === "FLD-5.1-002" || !f) {
      justifications[b.fieldId] = "Not available for this material; statement attached.";
      continue;
    }
    if (f.type === "file") uploads.push({ id: `UP-${code}-${f.id}`, sectionId: f.sectionId, fieldId: f.id, name: `${f.id}_statement.pdf`, kind: "Statement" });
    else if (f.validate && f.validate(valueFor(f))) justifications[f.id] = "Not applicable; see the specification.";
    else answers[f.id] = valueFor(f);
  }
  return { blockers, answers, justifications, uploads, components };
}

/** Fill and save until the service sees no completeness blocker (each save is mirrored by one service run). */
export async function fillUntilComplete(h, code, by = "u-sup-1") {
  for (let round = 0; round < 6; round++) {
    const f = fillFor(h, code);
    if (!f.blockers.length) return;
    await h.sup(by).save(code, { answers: f.answers, justifications: f.justifications, uploads: f.uploads, ...(f.components ? { components: f.components } : {}) });
    await h.run();
  }
  throw new Error(`still blocked: ${D.completenessBlockers(h.ciq(code), h.cfg()).map((b) => b.label).join("; ")}`);
}

/** Release blockers as the supplier would see them (the service's view). */
export const releaseBlockers = (h, code) => D.releaseBlockers(h.ciq(code), h.cfg());

export { D, FLOW, STEP, J, F };

// ---------------------------------------------------------------------------------------------- scenario shortcuts

/** create → metadata → fill → completeness confirmed (phase review). `rmm` files the case, `supplier` fills it. */
export async function toReview(h, code = "CIQ-2026-0001", { config = PLAIN_CONFIG, caseFields = {}, rmm: rmmId = "u-rmm", supplier = "u-sup-1" } = {}) {
  const rmm = h.wb(rmmId);
  const caseItem = await rmm.createCase({ Case_Code: code, ...caseFields });
  await rmm.request("case.created", code, { caseItemId: caseItem }, caseItem);
  await h.run();
  await h.sup(supplier).save(code, { config });
  await h.run();
  await fillUntilComplete(h, code, supplier);
  await h.sup(supplier).confirmCompleteness(code);
  await h.run();
  return caseItem;
}

export const REVIEWER = { RMM: "u-rmm", REG: "u-reg", SAF: "u-saf", QM: "u-qm", MIC: "u-mic", SUS: "u-sus" };

/** RMES results for every open criterion of a department, written as the department (`by`), then rmes.saved. */
export async function recordRmes(h, code, dept, { decision, by } = {}) {
  const form = dept === "SAF" ? FLOW.rmesSaf : FLOW.rmesReg;
  const table = dept === "SAF" ? "Safety_Criteria" : "Regulatory_Criteria";
  const rowId = h.ledger(code).items[`rmes:${dept}`];
  const open = h.fake.item(rowId)[`Table::${table}`].filter((x) => !x.Criteria_Result);
  const who = by ?? REVIEWER[dept];
  const cl = uiClient(h.fake, who);
  if (open.length) await cl.call("POST", `/form/2/${cl.acc}/${form}/${rowId}?_application_id=CIQ_Digital_A00`, { [`Table::${table}`]: open.map((x) => ({ _id: x._id, Criteria_Result: "Available" })) });
  await h.wb(who).request("rmes.saved", code, { dept, results: open.map((x) => ({ criterionId: x.Criteria_Code, result: "available", comment: "" })), ...(decision ? { decision } : {}) });
  await h.run();
}

/** A department completes its review in the Workbench (as `by`, default its usual reviewer) and files review.completed. */
export async function completeReview(h, code, dept, { decision = "Approved", extra = {}, by } = {}) {
  const who = by ?? REVIEWER[dept];
  if (dept === "SAF" || dept === "REG") await recordRmes(h, code, dept, { by: who });
  const item = h.reviewItem(code, dept);
  await h.wb(who).actAtStep(FLOW.review, item._id, { Review_Confirm: "Confirmed", Completed_By: { _id: who }, Completed_At: h.clock.now().toISOString(), ...(dept === "SAF" || dept === "REG" ? { RMES_Decision: decision } : {}), ...extra });
  await h.wb(who).request("review.completed", code, { dept }, item._id);
  await h.run();
  return h.requests().at(-1);
}

export async function completeAll(h, code, { reviewers = REVIEWER } = {}) {
  for (const d of ["REG", "SAF", "QM", "MIC", "SUS", "RMM"]) {
    const t = h.ciq(code).reviews.find((r) => r.dept === d);
    if (t && t.status !== "completed") await completeReview(h, code, d, { by: reviewers[d] });
  }
}

export const lastRequest = (h) => h.requests().at(-1);
