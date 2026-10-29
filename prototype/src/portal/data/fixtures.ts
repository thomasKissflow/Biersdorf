// Test fixtures shaped like live v5 portal items (plan v5 §3; flat business fields + underscore system fields, the
// Uploads child table under its verified REST read key "Table::<model id>"). Test-only: imported by *.test.ts and by
// scripts/portal-fixtures.ts (the harness), never by the bundle.
//
// The cases are made with the prototype's own domain actions (testkit Scenario: the demo's fictional Solvaro data) and
// then written the way the sync service and the supplier UI write them, under fictional "ZZT-" case codes:
//   ZZT-0001 empty start (fill in the CIQ)        ZZT-0004 awaiting the final release: the request at its "give the
//                                                          final release" step (Release_Contacts; only Elena may give it)
//   ZZT-0002 complete, ready to confirm (fill)    ZZT-0005 completed and locked (one change report with receipt)
//   ZZT-0003 in review: an open question, a returned round and an accepted one    ZZT-0006 cancelled and locked
// Elena Márquez may confirm; Ravi Menon may not (B-11). Katrin Vogel is the Beiersdorf contact.
import { createHash } from "node:crypto";
import * as A from "@/domain/actions";
import { RS1 } from "@/domain/builtinRules";
import { DEPT_LABEL, builtinTemplateData, fieldOf } from "@/domain/catalog";
import { UNDEFINED_ORIGINS } from "@/domain/rules";
import { BDF_SET_FIELDS, SUPPLIER_MESSAGE_TEXT, closedByCancellation } from "@/domain/selectors";
import { DAY } from "@/domain/selectors";
import { Scenario } from "@/domain/testkit";
import type { AppState, CiqCase, OpenPoint } from "@/domain/types";
import { STEPS, UPLOADS_TABLE, type FlowKey, type StepKey } from "../kf/portal";
import { canonicalJson, type ConfigBundle } from "./bundle";
import type { Loaded } from "./map";
import type { RawItem } from "./raw";
import { requestedDocRows, scopeRows } from "./scope";

export const SUPPLIER_CODE = "SUP-ZZT-SOLVARO";
export const SUPPLIER_NAME = "Solvaro Oleochemicals S.A.";

/** The Kissflow users behind the demo's contacts (fictional). */
export const PORTAL_USERS = {
  elena: { _id: "UsElena", Name: "Elena Márquez", Email: "elena.marquez@solvaro.example" },
  ravi: { _id: "UsRavi", Name: "Ravi Menon", Email: "ravi.menon@solvaro.example" },
  admin: { _id: "UsAdmin", Name: "Portal Admin", Email: "admin@example.com" },
};
const BY_DOMAIN_ID: Record<string, (typeof PORTAL_USERS)["elena"]> = { "u-sup-1": PORTAL_USERS.elena, "u-sup-2": PORTAL_USERS.ravi };
const SERVICE = { _id: "UsService", Name: "CIQ Integration Service", Kind: "User" };

export const BUNDLE: ConfigBundle = {
  format: "ciq-bundle/1",
  release: { key: "RS-2026.1 + v1", label: "RS-2026.1 + v1", ruleSetVersion: RS1.version, templateVersion: RS1.templateVersion, manifestHash: "fixture-manifest" },
  ruleSet: { version: RS1.version, rules: RS1.rules.map(({ basis: _b, note: _n, ...r }) => (void _b, void _n, r)) },
  template: builtinTemplateData(RS1.templateVersion),
  settings: { undefinedOrigins: [...UNDEFINED_ORIGINS] },
};
export const BUNDLE_JSON = JSON.stringify(BUNDLE);
export const BUNDLE_HASH = createHash("sha256").update(canonicalJson(BUNDLE), "utf8").digest("hex");

// ------------------------------------------------------------------------------------------------ the canonical cases

const CODES = ["ZZT-0001", "ZZT-0002", "ZZT-0003", "ZZT-0004", "ZZT-0005", "ZZT-0006"] as const;

function scenarios(): { s: AppState; ids: Record<(typeof CODES)[number], string> } {
  const sc = new Scenario();
  const ids = {} as Record<(typeof CODES)[number], string>;
  sc.create({ materialName: "OLIVIA Pure 100", inci: "Olea Europaea Fruit Oil", materialNo: "RM-500123" });
  ids["ZZT-0001"] = sc.id;
  sc.create({ materialName: "SOLVASOFT 300", inci: "Caprylic/Capric Triglyceride", materialNo: "RM-500124" }).metadata().fillMandatory();
  ids["ZZT-0002"] = sc.id;
  sc.create({ materialName: "Tocopherol T-70", inci: "Tocopherol", materialNo: "RM-500125" }).metadata().fillMandatory().confirm();
  ids["ZZT-0003"] = sc.id;
  const rmm = Scenario.REVIEWER.RMM;
  sc.raise("RMM", rmm, "K1", "Please confirm the shelf life stated on the specification.");
  sc.raise("RMM", rmm, "GEN", "Which plant produces the batches you supply to us?");
  const returned = sc.op().id;
  sc.answer(returned, "u-sup-1", "Plant 2 in Tarragona.").decide(returned, rmm, "return", "Please also give the plant's street address.");
  sc.raise("RMM", rmm, "K2.1", "Please confirm the CAS number of the main component.");
  const accepted = sc.op().id;
  sc.answer(accepted, "u-sup-2", "CAS 59-02-9 is correct.").decide(accepted, rmm, "accept");
  sc.create({ materialName: "AQUAGEL HV", inci: "Glycerin", materialNo: "RM-500126" }).metadata().fillMandatory().confirm().completeAll();
  ids["ZZT-0004"] = sc.id;
  sc.create({ materialName: "CETYL 16", inci: "Cetyl Alcohol", materialNo: "RM-500127" }).metadata().fillMandatory().confirm().completeAll().release("u-sup-1");
  sc.step("report a change", (s, at) => A.reportChange(s, "u-sup-1", sc.id, "The antioxidant changes from batch 2611 on.", at));
  ids["ZZT-0005"] = sc.id;
  sc.create({ materialName: "MICA WHITE", inci: "Mica", materialNo: "RM-500128" }).metadata().fillMandatory().confirm();
  sc.step("cancel", (s, at) => A.cancelCase(s, "u-rmm", sc.id, "The material is no longer needed.", at));
  ids["ZZT-0006"] = sc.id;
  return { s: sc.s, ids };
}

// ------------------------------------------------------------------------------------------------ portal items

const contact = (id: string) => BY_DOMAIN_ID[id];
const isoNoMs = (iso: string) => iso.replace(/\.\d{3}Z$/, "Z");
const KIND_LABEL: Record<OpenPoint["kind"], string> = { query: "Question", "document-request": "Document request", "additional-part": "Additional section", finding: "Question" };
const SUPPLIER_STATUS: Record<string, string> = { open: "Waiting for your answer", "in-progress": "With Beiersdorf" };

/** The supplier-visible thread of a point, as the service writes it (reconcile.mjs supplierPointView). */
function pointView(op: OpenPoint, c: CiqCase, s: AppState) {
  const nameOf = (id: string) => (id === "system" ? "Beiersdorf" : (contact(id)?.Name ?? s.users.find((u) => u.id === id)?.name ?? id));
  const outcome = op.status !== "closed" ? undefined : op.outcome === "accepted" ? "Accepted" : closedByCancellation(op) ? "Closed: the request was withdrawn" : op.outcome === "withdrawn" ? "Closed, no answer needed" : "Closed";
  return {
    opId: op.id,
    kind: KIND_LABEL[op.kind],
    ref: op.ref.label,
    sectionId: op.ref.sectionId,
    fieldId: op.ref.fieldId,
    rowId: op.ref.rowId,
    question: op.question,
    justification: op.justification,
    dueDate: op.dueDate,
    status: op.status === "closed" ? outcome : SUPPLIER_STATUS[op.status],
    rounds: op.rounds,
    thread: op.thread
      .filter((m) => m.action !== "note")
      .map((m) => ({ at: m.at, side: m.side, by: nameOf(m.by), action: m.action, verb: SUPPLIER_MESSAGE_TEXT[m.action], text: m.text, ...(m.documentId ? { document: c.documents.find((d) => d.id === m.documentId)?.name } : {}), ...(m.newRound ? { newRound: true } : {}) })),
    edits: (op.edits ?? []).map((e) => ({ at: e.at, field: e.field, from: e.from, to: e.to })),
  };
}

const sys = (id: string, step: StepKey | "end", created: string, modified = created) => ({
  _id: id,
  _status: step === "end" ? "Completed" : "InProgress",
  _current_step: step === "end" ? "End" : STEPS[step].name,
  _created_at: isoNoMs(created),
  _modified_at: isoNoMs(modified),
  _created_by: SERVICE,
  _modified_by: SERVICE,
});

const header = (code: string) => ({ Case_Code: code, Cycle_No: 1, Supplier_Code: SUPPLIER_CODE });
const assigned = (who: (typeof PORTAL_USERS)["elena"][]) => who.map((u) => ({ _id: u._id, Name: u.Name, Kind: "User" }));

/** The CIQP Request of a canonical case, as the service and the supplier UI leave it. */
export function requestItem(c: CiqCase, s: AppState, code: string, opts: { id: string; step: StepKey; label: string; locked?: boolean; contacts?: (typeof PORTAL_USERS)["elena"][] }): RawItem {
  const contacts = opts.contacts ?? [PORTAL_USERS.elena, PORTAL_USERS.ravi];
  const cfg = s.config;
  const supplierAnswers = Object.fromEntries(Object.entries(c.answers).filter(([k]) => !BDF_SET_FIELDS.includes(k) && fieldOf(k, c.templateVersion, cfg)?.type !== "file"));
  const { SF11: _m, ...ownConfig } = c.config;
  void _m;
  // A pre-fill (M9; "system" in the domain) is saved by the supplier's screen together with the metadata answer that
  // opened its section, so it carries that contact's stamp: the other entry of the same moment.
  const saver = (v: { by: string; at: string }) => (v.by !== "system" ? v.by : (Object.values(c.answeredBy).find((w) => w.at === v.at && w.by !== "system")?.by ?? v.by));
  const stamps = Object.fromEntries(
    Object.entries(c.answeredBy).map(([k, v]) => {
      const who = saver(v);
      return [k, { name: contact(who)?.Name ?? who, email: contact(who)?.Email ?? "", at: isoNoMs(v.at), by: contact(who)?._id ?? who }];
    }),
  );
  const cmp = c.confirmations.find((x) => x.type === "completeness");
  const rel = c.confirmations.find((x) => x.type === "final-release");
  const touched = Object.keys(c.answeredBy).length > 0;
  const lastAt = Object.values(c.answeredBy).map((v) => v.at).sort().at(-1);
  const docs = c.documents;
  const reports = s.changeReports.filter((r) => r.caseId === c.id);
  const it: RawItem = {
    ...sys(opts.id, opts.step, c.createdAt, lastAt ?? c.createdAt),
    ...header(code),
    Request_Key: `${code}-REQ`,
    App_Case_Item_Id: `App${code}`,
    Trade_Name: c.materialName,
    Main_INCI: c.inci,
    BDF_Material_No: c.materialNo,
    Supplier_Display_Name: SUPPLIER_NAME,
    BDF_Contact_Name: "Katrin Vogel",
    BDF_Contact_Email: "katrin.vogel@beiersdorf.example",
    Markets_Label: (c.config.SF11 ?? []).join(", "),
    Template_Label: c.templateVersion,
    Supplier_Due_Date: c.dueDate.slice(0, 10),
    Case_Contacts_JSON: JSON.stringify(contacts.map((u) => ({ id: u._id, name: u.Name, email: u.Email, mayConfirm: u._id !== PORTAL_USERS.ravi._id }))),
    Assigned_Contacts: assigned(contacts),
    Rule_Set_Version: c.ruleSetVersion,
    Template_Version: c.templateVersion,
    Config_Bundle_JSON: BUNDLE_JSON,
    Config_Bundle_Hash: BUNDLE_HASH,
    BDF_Set_JSON: JSON.stringify({ ...Object.fromEntries(BDF_SET_FIELDS.map((k) => [k, c.answers[k]])), SF11: c.config.SF11 ?? [] }),
    Manual_Scope_JSON: "[]",
    Case_Phase_Label: opts.label,
    Request_Locked: opts.locked ? "Yes" : "No",
    Questions_History_JSON: JSON.stringify(c.openPoints.map((op) => pointView(op, c, s))),
    Answers_Rev: touched ? Object.keys(c.answeredBy).length : 0,
    Change_Report_Rev: reports.length,
    ...(reports.length ? { Change_Reports_JSON: JSON.stringify(reports.map((r) => ({ id: r.id, at: r.at, text: r.text }))), Change_Report_Text: reports.at(-1)!.text, Change_Report_By_Email: PORTAL_USERS.elena.Email, Change_Report_At: isoNoMs(reports.at(-1)!.at) } : {}),
    ...(touched
      ? {
          Config_Answers_JSON: JSON.stringify(ownConfig),
          Answers_JSON: JSON.stringify(supplierAnswers),
          Answered_By_JSON: JSON.stringify(stamps),
          Justifications_JSON: JSON.stringify(c.justifications),
          Components_JSON: JSON.stringify(c.components),
          Scope_JSON: JSON.stringify(scopeRows(c.scope)),
          Requested_Docs_JSON: JSON.stringify(requestedDocRows(c, cfg)),
          Answers_Changed_At: isoNoMs(lastAt!),
          Answers_Changed_By_Email: PORTAL_USERS.elena.Email,
        }
      : {}),
    ...(cmp ? { Completeness_Confirm: "Confirmed", Completeness_By_Name: contact(cmp.by)?.Name ?? cmp.name, Completeness_By_Email: contact(cmp.by)?.Email ?? cmp.email, Completeness_By_Role: cmp.role, Completeness_At: isoNoMs(cmp.at) } : {}),
    ...(rel ? { Release_By_Name: contact(rel.by)?.Name ?? rel.name, Release_At: isoNoMs(rel.at) } : {}),
    Supplier_Files: docs.map((d) => ({ id: `Attach-${d.id}`, key: `CIQP_Request_A00/${opts.id}/Attach-${d.id}/${d.name}`, name: d.name, size: d.sizeKb * 1024, fileExtension: d.name.split(".").pop() })),
    [`Table::${UPLOADS_TABLE}`]: docs.map((d, i) => ({ _id: `row-${opts.id}-${i}`, Upload_Id: d.id, Upload_Section_Key: d.sectionId, ...(d.fieldId ? { Upload_Field_Key: d.fieldId } : {}), Upload_Doc_Kind: d.kind, Upload_File_Name: d.name, Uploaded_By_Email: contact(d.uploadedBy)?.Email ?? "", Uploaded_At: isoNoMs(d.uploadedAt), Upload_Attachment_Id: `Attach-${d.id}` })),
  };
  return it;
}

/** The open CIQP Query of a point's current round. */
export function queryItem(op: OpenPoint, c: CiqCase, s: AppState, code: string, id: string, contacts = [PORTAL_USERS.elena, PORTAL_USERS.ravi]): RawItem {
  const view = pointView(op, c, s);
  const at = op.thread.filter((m) => m.side === "internal").at(-1)?.at ?? op.createdAt;
  return {
    ...sys(id, "respond", at),
    ...header(code),
    Query_Key: `${op.id}-R${op.rounds}`,
    Round_No: op.rounds,
    App_Open_Point_Id: `AppOP-${op.id}`,
    Kind_Label: KIND_LABEL[op.kind],
    Responsible_Department: DEPT_LABEL[op.dept],
    Responsible_Name: s.users.find((u) => u.id === op.responsibleId)?.name ?? "Beiersdorf",
    Ref_Kind: op.ref.rowId ? "Component row" : op.ref.fieldId ? "Field" : "Section",
    Ref_Section_Key: op.ref.sectionId,
    ...(op.ref.fieldId ? { Ref_Field_Key: op.ref.fieldId } : {}),
    ...(op.ref.rowId ? { Ref_Row_Id: op.ref.rowId } : {}),
    Ref_Label: op.ref.label,
    Question_Text: op.question,
    Supplier_Justification: op.justification || "—",
    Supplier_Due_Date: op.dueDate.slice(0, 10),
    ...(op.rounds > 1 ? { Previous_Rounds_JSON: JSON.stringify(view.thread) } : {}),
    Assigned_Contacts: assigned(contacts),
  };
}

export function releaseItem(c: CiqCase, code: string, id: string, contacts = [PORTAL_USERS.elena]): RawItem {
  const at = c.phaseHistory.filter((p) => p.phase === "final-release").at(-1)?.at ?? c.createdAt;
  return {
    ...sys(id, "release", at),
    ...header(code),
    Confirmation_Key: `${code}-FR-1`,
    App_Case_Item_Id: `App${code}`,
    Declaration_Text: "Final CIQ release: the information and evidence are correct and complete. The CIQ is frozen.",
    Declaration_Text_Key: "FR-2026-1",
    Supplier_Due_Date: new Date(Date.parse(at) + 3 * DAY).toISOString().slice(0, 10),
    Assigned_Contacts: assigned(contacts),
  };
}

// ------------------------------------------------------------------------------------------------ the fixture set

export interface FixtureSet {
  state: AppState;
  /** Canonical case per code. */
  cases: Record<string, CiqCase>;
  /** Every item, per flow. */
  items: { flow: FlowKey; item: RawItem }[];
  /** Open tasks: item id → [activity instance id, activity id]. */
  tasks: [string, string, string][];
}

/** The supplier's copy of the final document on PkReq5 (29 Oct), as Kissflow stores an attached file. */
export const FINAL_PDF_ZZT_0005 = { id: "Attach-FD-ZZT-0005", key: "CIQP_Request_A00/PkReq5/Attach-FD-ZZT-0005/ZZT-0005-final-document.pdf", name: "ZZT-0005-final-document.pdf", size: 48213, fileExtension: "pdf" };

function build(): FixtureSet {
  const { s, ids } = scenarios();
  const kase = (code: (typeof CODES)[number]) => s.cases.find((c) => c.id === ids[code])!;
  const items: FixtureSet["items"] = [];
  const tasks: FixtureSet["tasks"] = [];
  const add = (flow: FlowKey, item: RawItem, step?: StepKey) => {
    items.push({ flow, item });
    if (step) tasks.push([item._id, `Act${item._id.slice(2)}`, STEPS[step].activity]);
  };
  add("request", requestItem(kase("ZZT-0001"), s, "ZZT-0001", { id: "PkReq1", step: "fill", label: "Filling in" }), "fill");
  add("request", requestItem(kase("ZZT-0002"), s, "ZZT-0002", { id: "PkReq2", step: "fill", label: "Filling in" }), "fill");
  const c3 = kase("ZZT-0003");
  add("request", requestItem(c3, s, "ZZT-0003", { id: "PkReq3", step: "keep", label: "With Beiersdorf" }), "keep");
  c3.openPoints.filter((p) => p.status === "open").forEach((op, i) => add("query", queryItem(op, c3, s, "ZZT-0003", `PkQ3${String.fromCharCode(97 + i)}`), "respond"));
  const c4 = kase("ZZT-0004");
  // 16 Oct: the release is a step of the request, assigned from Release_Contacts. Every case contact is in it, so all
  // keep seeing the case; the screen lets only a contact who may confirm give the release (B-11), as in the prototype.
  // Release_Flag "Requested" stays on while it waits there (I-5 writes it): the screen must not move it (21 Oct).
  add("request", { ...requestItem(c4, s, "ZZT-0004", { id: "PkReq4", step: "release", label: "Awaiting your final release", locked: true }), Release_Flag: "Requested", Release_Contacts: assigned([PORTAL_USERS.elena, PORTAL_USERS.ravi]) }, "release");
  // 20 Oct: a released request is held at "view the released CIQ" (plan v6 D-11)
  // 29 Oct: Beiersdorf's final-PDF service has attached the supplier's copy of the final document (Final_PDF, the
  // shape of Kissflow's attach answer). requestItem() stays as it is: the other requests have none
  add("request", { ...requestItem(kase("ZZT-0005"), s, "ZZT-0005", { id: "PkReq5", step: "released", label: "Completed", locked: true }), Final_PDF: [FINAL_PDF_ZZT_0005] }, "released");
  add("request", requestItem(kase("ZZT-0006"), s, "ZZT-0006", { id: "PkReq6", step: "keep", label: "Cancelled", locked: true }), "keep");
  // the builder's own test items for the Diagnostics S-1 tests (assigned to the Portal Admin), and one that is NOT a
  // test item (its case code doesn't start with ZZT-): the tests must never touch it
  const me = [PORTAL_USERS.admin];
  add("request", requestItem(kase("ZZT-0002"), s, "ZZT-S1-A", { id: "PkS1Fill", step: "fill", label: "Filling in", contacts: me }), "fill");
  add("request", requestItem(c3, s, "ZZT-S1-B", { id: "PkS1Keep", step: "keep", label: "With Beiersdorf", contacts: me }), "keep");
  add("query", queryItem(c3.openPoints.find((p) => p.status === "open")!, c3, s, "ZZT-S1-B", "PkS1Q", me), "respond");
  add("request", requestItem(kase("ZZT-0001"), s, "DEMO-0099", { id: "PkNotTest", step: "fill", label: "Filling in", contacts: me }), "fill");
  return { state: s, cases: Object.fromEntries(CODES.map((k) => [k, kase(k)])), items, tasks };
}

let cached: FixtureSet | undefined;
/** Built once per process (the domain scenario takes a moment). */
export function fixtureSet(): FixtureSet {
  return (cached ??= build());
}

/** The contact's view: every item it holds a task on, as the store loads them. */
export function loadedFor(userId: string): Loaded[] {
  const fx = fixtureSet();
  const stepOf = new Map(fx.tasks.map(([id, , activity]) => [id, (Object.keys(STEPS) as StepKey[]).find((k) => STEPS[k].activity === activity)!]));
  return fx.items
    // the release step goes to Release_Contacts (16 Oct); every other step to Assigned_Contacts
    .filter(({ item }) => ((stepOf.get(item._id) === "release" ? item.Release_Contacts : item.Assigned_Contacts) as { _id: string }[] | undefined ?? []).some((u) => u._id === userId) && stepOf.has(item._id))
    .map(({ flow, item }) => ({ flow, item: { ...structuredClone(item), _activity_instance_id: fx.tasks.find((t) => t[0] === item._id)![1] }, listedAt: [stepOf.get(item._id)!] }));
}
