// Test fixtures shaped like live CIQ_Digital_A00 items (plan v6; DESIGN §5, §7.1): flat business fields plus underscore
// system fields, Select fields as their live option texts (ids.ts LIST), User fields as {_id, Name, Kind}, Dates as
// yyyy-mm-dd and DateTimes without milliseconds, child tables under their verified REST read key "Table::<model>".
// Test-only: imported by *.test.ts and by scripts/applive-fixtures.ts (the harness), never by the app bundle (it reads
// kissflow-build/config-seed/rows/*.json with node:fs).
//
// The cases are the portal fixtures' canonical cases (src/portal/data/fixtures.ts fixtureSet(): the prototype's own
// domain actions on the demo's fictional Solvaro data), continued with a few Beiersdorf steps, and written the way the
// app's screens (write/*) and the integrations (I-1, I-2, I-4, request.changed, I-7) leave them:
//   ZZT-0001 the supplier fills in the CIQ (no answers yet)
//   ZZT-0003 in review: RMM's three points (one answered since RMM last wrote its thread: the synthesis case, one
//            returned to round 2, one accepted), a Safety point, RMES results and a finding, two notes, QM completed
//   ZZT-0005 completed (final release, a change report afterwards)
// Kissflow user ids are fictional ("Us…"); the contacts are the portal fixtures' Elena Márquez and Ravi Menon.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as A from "@/domain/actions";
import { DEPT_LABEL, DEPT_SHORT, INTERNAL_PERSONAS } from "@/domain/catalog";
import { Scenario } from "@/domain/testkit";
import type { AppState, AuditEvent, CiqCase, Dept, InternalNote, InternalPersonaId, LogEvent, OpenPoint, ReviewDept, ReviewTrack, User } from "@/domain/types";
import { requestItem, BUNDLE_HASH, BUNDLE_JSON, PORTAL_USERS, SUPPLIER_CODE, SUPPLIER_NAME, fixtureSet } from "@/portal/data/fixtures";
import { documentsJsonOf } from "@/portal/data/map";
import { str, type RawItem } from "@/portal/data/raw";
import { FLOWS, LIST, ROLES, STEPS, STEP_NAMES, TABLES } from "../ids";
import { SYNCED_REQUEST_FIELDS } from "../shared/handoff";
import type { Acting, AuditCode, FlowKey, Identity, LiveSnapshot, MapInput, ProcessKey, TaskRef } from "../types";
import type { AuditSnapshot, CaseHeader } from "../map/auditMap";

// ------------------------------------------------------------------------------------------------ people

export interface KfUserRef {
  _id: string;
  Name: string;
  Email: string;
}

/** The Kissflow users behind the domain's role holders and contacts (fictional). */
export const KF_USERS: Record<string, KfUserRef> = {
  "u-rmm": { _id: "UsRmmKatrin", Name: "Katrin Vogel", Email: "katrin.vogel@beiersdorf.example" },
  "u-reg": { _id: "UsRegJonas", Name: "Dr. Jonas Albrecht", Email: "jonas.albrecht@beiersdorf.example" },
  "u-saf": { _id: "UsSafMira", Name: "Dr. Mira Hansen", Email: "mira.hansen@beiersdorf.example" },
  "u-qm": { _id: "UsQmLena", Name: "Lena Krause", Email: "lena.krause@beiersdorf.example" },
  "u-mic": { _id: "UsMicTobias", Name: "Tobias Keller", Email: "tobias.keller@beiersdorf.example" },
  "u-sus": { _id: "UsSusSophie", Name: "Sophie Wagner", Email: "sophie.wagner@beiersdorf.example" },
  "u-cus": { _id: "UsCusFelix", Name: "Felix Schulz", Email: "felix.schulz@beiersdorf.example" },
  "u-leg": { _id: "UsLegAnna", Name: "Dr. Anna Becker", Email: "anna.becker@beiersdorf.example" },
  "u-admin": { _id: "UsAdminNina", Name: "Nina Hoffmann", Email: "nina.hoffmann@beiersdorf.example" },
  "u-auditor": { _id: "UsAuditPaul", Name: "Paul Neumann", Email: "paul.neumann@beiersdorf.example" },
  "u-owner": { _id: "UsOwnerClaudia", Name: "Dr. Claudia Richter", Email: "claudia.richter@beiersdorf.example" },
  "u-sup-1": PORTAL_USERS.elena,
  "u-sup-2": PORTAL_USERS.ravi,
};
/** The persona each fixture user acts as. */
export const PERSONA_USER: Record<InternalPersonaId, string> = { rmm: "u-rmm", reg: "u-reg", saf: "u-saf", qm: "u-qm", mic: "u-mic", sus: "u-sus", cus: "u-cus", leg: "u-leg", admin: "u-admin", auditor: "u-auditor", owner: "u-owner" };
export const INTEGRATION_USER = { _id: "UsIntegration", Name: "CIQ Integration Service" };
/** A supplier contact without a portal user (id "contact:<Contacts_Key>"), and a second supplier (kind "Trader"). */
export const NO_PORTAL_CONTACT = { key: "c-joana", name: "Joana Pires", email: "joana.pires@solvaro.example", title: "QA Assistant" };
export const SECOND_SUPPLIER = { code: "SUP-ZZT-NORDHAFEN", name: "Nordhafen Minerals GmbH" };

/** Domain user id → Kissflow user id (ids the fixture doesn't know stay as they are, "system" included). */
export const kfIdOf = (domainId: string): string => KF_USERS[domainId]?._id ?? domainId;
const userRef = (domainId: string) => {
  const u = KF_USERS[domainId];
  return u ? { _id: u._id, Name: u.Name, Kind: "User" } : { _id: domainId, Name: domainId, Kind: "User" };
};
const kfDomain = new Map(Object.entries(KF_USERS).map(([d, u]) => [u._id, d]));
/** Kissflow user id → the domain id it stands for. */
export const domainIdOf = (kfId: string): string => kfDomain.get(kfId) ?? kfId;

// ------------------------------------------------------------------------------------------------ the domain cases

export const CODES = ["ZZT-0001", "ZZT-0003", "ZZT-0005"] as const;
export type FixtureCode = (typeof CODES)[number];
const noMs = (iso: string) => iso.replace(/\.\d{3}Z$/, "Z");
const day = (iso: string) => iso.slice(0, 10);

/** The portal fixtures' state, continued in ZZT-0003 with Beiersdorf's steps (see the file comment). */
function domainState(): { s: AppState; ids: Record<FixtureCode, string> } {
  const fx = fixtureSet();
  const sc = new Scenario(structuredClone(fx.state), "2026-10-23T08:00:00.000Z");
  sc.id = fx.cases["ZZT-0003"]!.id;
  sc.answer("OP-0003-01", "u-sup-1", "The shelf life is 24 months from production.");
  sc.raise("SAF", "u-saf", "K1", "Please send the full toxicological dossier.");
  sc.step("record S-A1", (s, at) => A.recordCriterion(s, "u-saf", sc.id, "S-A1", "available", "Within the BDF limits.", at));
  sc.step("record R-A1", (s, at) => A.recordCriterion(s, "u-reg", sc.id, "R-A1", "plausible", "", at));
  sc.step("add finding", (s, at) => A.addFinding(s, "u-saf", sc.id, "S-B1", "Sensitisation data missing from the dossier.", false, at));
  sc.step("note RMM", (s, at) => A.addInternalNote(s, "u-rmm", sc.id, "@Dr. Mira Hansen please check the SDS before you complete.", "K1", at));
  sc.step("note QM", (s, at) => A.addInternalNote(s, "u-qm", sc.id, "No QM remarks so far.", undefined, at));
  sc.complete("QM", "u-qm");
  return { s: sc.s, ids: Object.fromEntries(CODES.map((k) => [k, fx.cases[k]!.id])) as Record<FixtureCode, string> };
}

/** The domain case under its live identity: case id = code, user ids = Kissflow ids, supplier = SUPPLIER_CODE. */
function liveIdentity<T>(v: T, domainCaseId: string, code: string): T {
  let text = JSON.stringify(v).replace(new RegExp(`\\b${domainCaseId}\\b`, "g"), code);
  for (const [d, u] of Object.entries(KF_USERS)) text = text.split(`"${d}"`).join(`"${u._id}"`);
  return JSON.parse(text) as T;
}

// ------------------------------------------------------------------------------------------------ system fields

const actOf = (itemId: string) => `Act${itemId}`;
function processSys(id: string, created: string, modified: string, activity: string | "end", by = "u-rmm") {
  const ended = activity === "end";
  return {
    _id: id,
    _status: ended ? "Completed" : "InProgress",
    _current_step: ended ? "End" : STEP_NAMES[activity],
    ...(ended ? {} : { _current_context: [{ _context_activity_id: activity, _context_activity_instance_id: actOf(id), _context_current_step: STEP_NAMES[activity] }] }),
    _created_at: noMs(created),
    _modified_at: noMs(modified),
    _created_by: userRef(by),
    _modified_by: userRef(by),
  };
}
const formSys = (id: string, created: string, by: string) => ({ _id: id, _created_at: noMs(created), _modified_at: noMs(created), _created_by: userRef(by), _modified_by: userRef(by) });
const latest = (...isos: (string | undefined)[]) => isos.filter((x): x is string => !!x).sort().at(-1)!;

// ------------------------------------------------------------------------------------------------ the CIQ Case

const PORTAL_REQUEST: Record<FixtureCode, string> = { "ZZT-0001": "PkReq1", "ZZT-0003": "PkReq3", "ZZT-0005": "PkReq5" };
export const caseItemIdOf = (code: string) => `App${code}`;
const PHASE_STEP: Record<string, string | "end"> = { "supplier-input": STEPS.case.waiting, review: STEPS.case.release, "final-release": STEPS.case.release, completed: "end", cancelled: "end" };

/** The release row a case pins (REL:RS-2026.1 + v1). */
const FIRST_RELEASE_ID = "PkCfgRelV1";

/** The case's header as its `case.created` snapshot and its Start fields carry it. */
function headerOf(c: CiqCase, code: string, contacts: KfUserRef[]): CaseHeader {
  const owner = KF_USERS[c.ownerId] ?? KF_USERS["u-rmm"]!;
  return {
    caseId: code,
    itemId: caseItemIdOf(code),
    cycleNo: 1,
    materialName: c.materialName,
    inci: c.inci,
    materialNo: c.materialNo,
    supplierId: SUPPLIER_CODE,
    manufacturer: SUPPLIER_NAME,
    duns: String(c.answers["FLD-GEN-003"] ?? ""),
    ownerId: owner._id,
    ownerName: owner.Name,
    createdAt: noMs(c.createdAt),
    dueDate: day(c.dueDate),
    priority: c.priority,
    templateVersion: c.templateVersion,
    ruleSetVersion: c.ruleSetVersion,
    markets: c.config.SF11 ?? [],
    contacts: contacts.map((u) => ({ id: u._id, name: u.Name, email: u.Email, title: u._id === PORTAL_USERS.elena._id ? "Regulatory Manager" : "QA Specialist", mayConfirm: u._id !== PORTAL_USERS.ravi._id })),
    bdfSet: { "FLD-GEN-001": c.answers["FLD-GEN-001"] ?? null, "FLD-GEN-002": c.answers["FLD-GEN-002"] ?? null, "FLD-GEN-003": c.answers["FLD-GEN-003"] ?? null, "FLD-GEN-008": c.answers["FLD-GEN-008"] ?? null, "FLD-GEN-009": c.answers["FLD-GEN-009"] ?? null, SF11: c.config.SF11 ?? [] },
  };
}

/** The CIQ Case item: the RMM's Start fields, I-1's Portal_Request_Item_Id, I-2's completeness and the 15 supplier-data
 *  fields copied from the portal request (request.changed), I-7's final release. `c` and `s` are the DOMAIN objects. */
function caseItem(c: CiqCase, s: AppState, code: FixtureCode, manifestHash: string): RawItem {
  const contacts = [PORTAL_USERS.elena, PORTAL_USERS.ravi];
  const h = headerOf(c, code, contacts);
  const owner = KF_USERS[c.ownerId]!;
  const phase = c.phase;
  // the portal request as the supplier's screen and the service leave it (fixtures.ts requestItem): the source of the
  // fields the integrations copy, same names and shapes (G-14)
  const rq = requestItem(c, s, code, { id: PORTAL_REQUEST[code], step: phase === "supplier-input" ? "fill" : phase === "completed" ? "released" : "keep", label: "" });
  const synced = Object.fromEntries(SYNCED_REQUEST_FIELDS.filter((k) => k !== "Documents_JSON" && rq[k] !== undefined).map((k) => [k, rq[k]]));
  const cmp = c.confirmations.find((x) => x.type === "completeness");
  const rel = c.confirmations.find((x) => x.type === "final-release");
  const lastChange = latest(c.createdAt, ...Object.values(c.answeredBy).map((v) => v.at), cmp?.at, rel?.at, ...s.changeReports.filter((r) => r.caseId === c.id).map((r) => r.at));
  const contactOf = (id: string) => KF_USERS[id];
  return {
    ...processSys(caseItemIdOf(code), c.createdAt, lastChange, PHASE_STEP[phase]!, c.ownerId),
    Case_Code: code,
    Cycle_No: 1,
    Case_Title: `${code} · ${c.materialName}`,
    Trade_Name: c.materialName,
    Main_INCI: c.inci,
    BDF_Material_No: c.materialNo,
    Supplier_Code: SUPPLIER_CODE,
    Supplier_Legal_Name: SUPPLIER_NAME,
    Owner_RMM: userRef(c.ownerId),
    BDF_Contact_Name: owner.Name,
    BDF_Contact_Email: owner.Email,
    Target_Markets_Text: (c.config.SF11 ?? []).join(", "),
    Markets_Label: (c.config.SF11 ?? []).join(", "),
    Template_Version: c.templateVersion,
    Template_Label: c.templateVersion,
    Rule_Set_Version: c.ruleSetVersion,
    Release_Item_Id: FIRST_RELEASE_ID,
    Release_Key: "RS-2026.1 + v1",
    Manifest_Hash: manifestHash,
    Supplier_Due_Date: day(c.dueDate),
    Priority: LIST.priority[c.priority],
    Case_Contacts_JSON: JSON.stringify(h.contacts),
    Portal_Contact_Ids: contacts.map((u) => u._id).join(","),
    Confirm_Contact_Ids: contacts.filter((u) => u._id !== PORTAL_USERS.ravi._id).map((u) => u._id).join(","),
    Supplier_Contact_Emails: contacts.map((u) => u.Email).join(","),
    BDF_Set_JSON: JSON.stringify(h.bdfSet),
    Config_Bundle_JSON: BUNDLE_JSON,
    Config_Bundle_Hash: BUNDLE_HASH,
    Portal_Assignees_JSON: JSON.stringify(contacts.map((u) => ({ _id: u._id }))),
    Release_Assignees_JSON: JSON.stringify(contacts.map((u) => ({ _id: u._id }))),
    Portal_Request_Item_Id: PORTAL_REQUEST[code],
    Case_Phase: phase === "supplier-input" ? LIST.phase["supplier-input"] : LIST.phase.review,
    ...synced,
    Documents_JSON: documentsJsonOf(rq),
    ...(cmp ? { Completeness_Confirm: LIST.confirm, Completeness_By_Name: contactOf(cmp.by)?.Name ?? cmp.name, Completeness_By_Email: contactOf(cmp.by)?.Email ?? cmp.email, Completeness_By_Role: cmp.role, Completeness_At: noMs(cmp.at) } : {}),
    ...(rel ? { Final_Release_Confirm: LIST.confirm, Final_Release_By_Name: contactOf(rel.by)?.Name ?? rel.name, Final_Release_By_Email: contactOf(rel.by)?.Email ?? rel.email, Final_Release_By_Role: rel.role, Final_Release_At: noMs(rel.at) } : {}),
  };
}

// ------------------------------------------------------------------------------------------------ CIQ Review

const reviewItemId = (code: string, dept: ReviewDept, round = 1) => `PkRev${code.replace(/-/g, "")}${dept}${round}`;

function reviewItem(c: CiqCase, code: FixtureCode, r: ReviewTrack): RawItem {
  const id = reviewItemId(code, r.dept);
  const done = r.status === "completed";
  const conf = c.confirmations.filter((x) => x.type === "dept-completion" && x.dept === r.dept).at(-1);
  const completer = conf ? KF_USERS[conf.by] : undefined;
  const assignee = KF_USERS[r.assigneeId];
  const own = c.openPoints.filter((p) => p.dept === r.dept && p.status !== "closed").length;
  const gaps = r.dept === "SAF" || r.dept === "REG" ? (c.rmes?.criteria.filter((x) => x.dept === r.dept && !x.result).length ?? 0) : 0;
  return {
    ...processSys(id, r.startedAt ?? c.createdAt, done ? (r.completedAt ?? c.createdAt) : (r.startedAt ?? c.createdAt), done ? "end" : STEPS.review[r.dept], c.ownerId),
    Review_Key: `${code}-${r.dept}-1`,
    Case_Code: code,
    Cycle_No: 1,
    Case_Item_Id: caseItemIdOf(code),
    Supplier_Code: SUPPLIER_CODE,
    Trade_Name: c.materialName,
    Review_Dept: r.dept,
    Round_No: 1,
    Activation_Kind: "Completeness",
    Activation_Reason: "Completeness confirmed by the supplier.",
    Activated_By_Name: KF_USERS[c.ownerId]!.Name,
    ...(assignee ? { Assignee_User: userRef(r.assigneeId), Assignee_Name: assignee.Name, Assignee_Email: assignee.Email } : {}),
    Track_Status: LIST.track["in-review"],
    Open_Count: done ? 0 : own,
    RMES_Gaps: done ? 0 : gaps,
    ...(r.decision ? { RMES_Decision: LIST.decision[r.decision], RMES_Decision_Reason: r.decisionReason ?? "" } : {}),
    ...(done && conf
      ? { Review_Confirm: LIST.confirm, Review_Gate: "OK", Completed_By: userRef(conf.by), Completed_By_Name: completer?.Name ?? conf.name, Completed_By_Email: completer?.Email ?? conf.email, Completed_At: noMs(conf.at) }
      : { Review_Gate: own || gaps ? "Open items" : "OK" }),
  };
}

// ------------------------------------------------------------------------------------------------ CIQ Open Point

export const opItemId = (opId: string) => `PkOp${opId.replace(/-/g, "")}`;
const KIND_REF = (op: OpenPoint) => (op.ref.rowId ? "Component row" : op.ref.documentId ? "Document" : op.ref.fieldId ? "Field" : "Section");
/** The open CIQP Query of a point (portal fixtures' ids for ZZT-0003's open points). */
const PORTAL_QUERY: Record<string, string> = { "OP-0003-01": "PkQ3a", "OP-0003-02": "PkQ3b", "OP-0003-04": "PkQ3d" };
/** Points whose latest supplier answer arrived after the raiser last wrote Thread_JSON (I-4 only): the mapper appends it. */
export const UNPERSISTED_ANSWER = ["OP-0003-01"];

/** The point as Kissflow holds it: Thread_JSON as the raiser's screen last wrote it, Response_* as I-4 wrote them. */
function opItem(op: OpenPoint, code: FixtureCode, s: AppState): RawItem {
  const id = opItemId(op.id);
  const raiser = s.users.find((u) => u.id === op.createdBy);
  const resp = s.users.find((u) => u.id === op.responsibleId);
  const answers = op.thread.filter((m) => m.side === "supplier");
  const lastAnswer = answers.at(-1);
  const pending = UNPERSISTED_ANSWER.includes(op.id) && lastAnswer && op.thread.at(-1) === lastAnswer;
  const thread = pending ? op.thread.slice(0, -1) : op.thread;
  const closed = op.status === "closed";
  const modified = latest(op.createdAt, ...op.thread.map((m) => m.at), op.closedAt);
  // I-4 sets "In progress" with an answer; a return (new round) or an edit sets "Open" again
  const progress = op.status === "in-progress" || (closed && lastAnswer && !op.thread.slice(op.thread.indexOf(lastAnswer)).some((m) => m.newRound)) ? LIST.opProgress["in-progress"] : LIST.opProgress.open;
  const toKf = <T,>(v: T) => JSON.parse(JSON.stringify(v, (k, x) => ((k === "by" || k === "from" || k === "to") && typeof x === "string" ? kfIdOf(x) : x))) as T;
  return {
    ...processSys(id, op.createdAt, modified, closed ? "end" : STEPS.op[op.dept], op.createdBy),
    OP_Key: op.id,
    Round_No: op.rounds,
    Query_Key: `${op.id}-R${op.rounds}`,
    Case_Code: code,
    Cycle_No: 1,
    Supplier_Code: SUPPLIER_CODE,
    Case_Item_Id: caseItemIdOf(code),
    OP_Kind: LIST.opKind[op.kind],
    OP_Dept: op.dept,
    Raised_By_Dept: raiser?.dept ?? op.dept,
    OP_To_Supplier: LIST.yes,
    Ref_Kind: KIND_REF(op),
    Ref_Section_Key: op.ref.sectionId,
    ...(op.ref.fieldId ? { Ref_Field_Key: op.ref.fieldId } : {}),
    ...(op.ref.rowId ? { Ref_Row_Id: op.ref.rowId } : {}),
    ...(op.ref.documentId ? { Ref_Doc_Id: op.ref.documentId } : {}),
    Ref_Label: op.ref.label,
    Kind_Label: LIST.kindLabel[op.kind],
    Question_Text: op.question,
    Supplier_Justification: op.justification || "—",
    Responsible_User: userRef(op.responsibleId),
    Responsible_Name: resp?.name ?? "",
    Responsible_Dept_Label: DEPT_LABEL[op.dept],
    Supplier_Due_Date: day(op.dueDate),
    Portal_Contact_Ids: [PORTAL_USERS.elena._id, PORTAL_USERS.ravi._id].join(","),
    ...(PORTAL_QUERY[op.id] ? { Portal_Query_Item_Id: PORTAL_QUERY[op.id] } : {}),
    OP_Progress: progress,
    ...(lastAnswer
      ? { Response_Kind: lastAnswer.action === "cannot-provide" ? "Cannot provide" : "Answered", Response_Text: lastAnswer.text, Response_Doc_Refs_JSON: JSON.stringify(lastAnswer.documentId ? [{ uploadId: lastAnswer.documentId }] : []), Supplier_Responsible_Email: KF_USERS[lastAnswer.by]?.Email ?? "" }
      : {}),
    ...(op.outcome ? { OP_Outcome: LIST.opOutcome[op.outcome] } : {}),
    ...(op.closeReason ? { Outcome_Reason: op.closeReason } : {}),
    ...(op.closedAt ? { Closed_At: noMs(op.closedAt) } : {}),
    ...(op.closedBy ? { Closed_By: userRef(op.closedBy) } : {}),
    Raised_By_User: userRef(op.createdBy),
    Raised_By_Name: raiser?.name ?? "",
    Raiser_Assignee: [{ _id: kfIdOf(op.createdBy) }],
    Thread_JSON: JSON.stringify(toKf({ thread, edits: op.edits ?? [] })),
  };
}

// ------------------------------------------------------------------------------------------------ RMES, notes

function rmesRow(c: CiqCase, code: FixtureCode, dept: "SAF" | "REG"): RawItem | undefined {
  const r = c.rmes;
  if (!r) return undefined;
  const t = TABLES[dept];
  const criteria = r.criteria.filter((x) => x.dept === dept);
  const findings = r.findings.filter((x) => x.dept === dept);
  const modified = latest(r.createdAt, ...criteria.map((x) => x.at));
  return {
    ...formSys(`PkRmes${code.replace(/-/g, "")}${dept}`, r.createdAt, dept === "SAF" ? "u-saf" : "u-reg"),
    _modified_at: noMs(modified),
    RMES_Key: `${code}-RMES-${dept}`,
    Case_Code: code,
    Result_Case: { _id: caseItemIdOf(code) },
    Case_Item_Id: caseItemIdOf(code),
    Cycle_No: 1,
    Open_Criteria_Count: criteria.filter((x) => !x.result).length,
    Open_Blocking_Findings_Count: findings.filter((f) => f.blocking && f.status === "open").length,
    RMES_Voided: LIST.no,
    [`Table::${t.criteria}`]: criteria.map((x, i) => ({
      _id: `${t.criteria}_${code.slice(-4)}${String(i + 1).padStart(6, "0")}`,
      Criteria_Code: x.id,
      Criteria_Part: x.part,
      Criteria_Title: x.title,
      Criteria_Applicable: LIST.yes,
      Criteria_Applicability_Basis: x.source.label,
      Criteria_Source_Section_Key: x.source.sectionId,
      ...(x.source.fieldId ? { Criteria_Source_Field_Key: x.source.fieldId } : {}),
      ...(x.result ? { Criteria_Result: LIST.rmesResult[x.result] } : {}),
      ...(x.comment ? { Criteria_Comment: x.comment } : {}),
      ...(x.by ? { Criteria_Recorded_By: userRef(x.by) } : {}),
      ...(x.at ? { Criteria_Recorded_At: noMs(x.at) } : {}),
      ...(x.limit ? { Criteria_Reported_Value: x.limit.value, Criteria_Reported_Unit: x.limit.unit, Criteria_Limit_Value: x.limit.limit, Criteria_Limit_Set_Version: x.limit.limitSetVersion, Criteria_Limit_Pass: x.limit.pass ? LIST.yes : LIST.no, Criteria_Source_Value_Text: x.limit.substance } : {}),
      ...(x.aiSuggestion ? { Criteria_AI_Suggestion_Text: x.aiSuggestion } : {}),
    })),
    [`Table::${t.findings}`]: findings.map((f, i) => ({
      _id: `${t.findings}_${code.slice(-4)}${String(i + 1).padStart(6, "0")}`,
      Findings_Key: f.id,
      Findings_Criterion_Code: f.criterionId,
      Findings_Text: f.text,
      Findings_Blocking: f.blocking ? LIST.yes : LIST.no,
      Findings_State: f.status,
      ...(f.openPointId ? { Findings_Linked_OP_Key: f.openPointId } : {}),
    })),
  };
}

function noteRow(n: InternalNote, code: FixtureCode, s: AppState): RawItem {
  const mentioned = (n.mentions ?? []).map((id) => s.users.find((u) => u.id === id)).filter((u): u is User => !!u);
  return {
    ...formSys(`PkNote${n.id.replace(/-/g, "")}`, n.at, n.by),
    Note_Key: n.id,
    Case_Code: code,
    Cycle_No: 1,
    Case_Item_Id: caseItemIdOf(code),
    Linked_Kind: n.sectionId ? "Section" : "Case",
    Linked_Key: n.sectionId ?? code,
    Note_Text: n.text,
    Note_Author: userRef(n.by),
    ...(n.dept ? { Note_Dept: n.dept } : {}),
    Note_At: noMs(n.at),
    Note_Mentions_Emails: mentioned.map((u) => KF_USERS[u.id]?.Email ?? u.email).join(","),
    Note_Mentions_Names: mentioned.map((u) => u.name).join(", "),
  };
}

// ------------------------------------------------------------------------------------------------ CIQ Audit Event

const CATEGORY: Record<AuditCode, string> = {
  "case.created": "Case", "case.cancelled": "Cancellation", "case.reactivated": "Case",
  "op.raised": "Open point", "op.round": "Open point", "op.edited": "Open point", "op.accepted": "Open point", "op.returned": "Open point", "op.notaccepted": "Open point", "op.closed": "Open point",
  "review.started": "Review", "review.completed": "Review", "review.reopened": "Review", "review.reassigned": "Review", "release.requested": "Review",
  "rmes.saved": "RMES", "note.added": "Internal note", "supplier.changed": "Supplier master", "config.published": "Configuration",
  "config.draft.created": "Configuration", "config.draft.discarded": "Configuration", "config.ownership.changed": "Configuration", "config.reminders.changed": "Configuration",
};

/** The domain entry → the v6 code of the app write that produced it; undefined for the supplier's side (the portal's
 *  screens and the integrations; the mapper synthesizes what the app shows of it) and for entries replaced by the
 *  per-review `review.started` rows. */
function codeOf(e: AuditEvent): AuditCode | undefined {
  const a = e.action;
  if (["Created case", "Follow-up case", "Created despite an open case", "Derived scope", "Invited supplier contacts"].includes(a)) return "case.created";
  if (a === "Raised query" || a === "Requested document" || a === "Activated additional section") return "op.raised";
  if (a === "Returned answer to supplier") return "op.returned";
  if (a === "Accepted answer") return "op.accepted";
  if (a === "Closed as not accepted") return "op.notaccepted";
  if (a === "Edited open point") return "op.edited";
  if (a.startsWith("Closed open point")) return "op.closed";
  if (a.startsWith("Completed ") && a.endsWith(" review")) return "review.completed";
  if (a === "Continue after rejection") return "review.completed";
  if (a === "All reviews completed") return "release.requested";
  if (a === "Recorded RMES result" || a === "Added finding" || a === "Closed finding" || /^Final .* decision$/.test(a) || (a === "Flagged for RMM" && e.by === "system" && /recorded an internal Rejected/.test(e.detail))) return "rmes.saved";
  if (a === "Added internal note") return "note.added";
  if (a === "Cancelled case") return "case.cancelled";
  return undefined;
}

/** The point as it was right after `at` (the snapshot a write at that moment keeps). */
function opAsOf(op: OpenPoint, at: string): OpenPoint {
  const thread = op.thread.filter((m) => m.at <= at);
  const closed = !!op.closedAt && op.closedAt <= at;
  const { outcome, closedAt, closedBy, closeReason, ...rest } = op;
  const base: OpenPoint = { ...rest, thread, edits: (op.edits ?? []).filter((e) => e.at <= at), rounds: 1 + thread.filter((m) => m.newRound).length, status: closed ? "closed" : thread.at(-1)?.side === "supplier" ? "in-progress" : "open" };
  return closed ? { ...base, ...(outcome ? { outcome } : {}), ...(closedAt ? { closedAt } : {}), ...(closedBy ? { closedBy } : {}), ...(closeReason ? { closeReason } : {}) } : base;
}

interface RowDraft {
  code: AuditCode;
  at: string;
  by: string;
  entries: AuditEvent[];
  snap: Omit<AuditSnapshot, "v" | "code" | "audit" | "handoffs">;
  object: { kind: string; key: string; itemId?: string; state?: string };
  ref?: { flow: FlowKey; itemId: string };
}

const roleIdOf = (dept?: Dept) => (dept ? Object.values(ROLES).find((r) => "dept" in r && r.dept === dept)?.id : undefined);
let evSeq = 0;
function auditRow(d: RowDraft, code: string, s: AppState, domainCaseId: string): RawItem {
  const actor = s.users.find((u) => u.id === d.by);
  const kf = KF_USERS[d.by] ?? KF_USERS["u-rmm"]!;
  // the writers keep Kissflow user ids in the snapshot (kfUserIdOf, DESIGN §3.4)
  const snapshot: AuditSnapshot = liveIdentity({ v: 1, code: d.code, audit: d.entries, ...d.snap, handoffs: [] } as AuditSnapshot, domainCaseId, code);
  const stamp = noMs(d.at).replace(/[-:TZ]/g, "").slice(0, 14);
  evSeq += 1;
  return {
    ...formSys(`PkEv${String(evSeq).padStart(4, "0")}`, d.at, d.by === "system" ? "u-rmm" : d.by),
    _created_by: { _id: kf._id, Name: kf.Name, Kind: "User" },
    Event_Key: `EV-${code}-${stamp}-${String(evSeq).padStart(4, "0")}`,
    Case_Code: code,
    Cycle_No: 1,
    Case_Item_Id: caseItemIdOf(code),
    Event_At: noMs(d.at),
    Event_Category: CATEGORY[d.code],
    Action_Code: d.code,
    Actor_Side: LIST.actorSide,
    Actor_Name: kf.Name,
    Actor_Email: kf.Email,
    ...(actor?.dept ? { Actor_Dept: actor.dept } : {}),
    ...(roleIdOf(actor?.dept) ? { Actor_Role_Id: roleIdOf(actor?.dept) } : {}),
    Object_Kind: d.object.kind,
    Object_Key: d.object.key,
    ...(d.object.itemId ? { Object_Item_Id: d.object.itemId } : {}),
    ...(d.object.state ? { Object_State: d.object.state } : {}),
    New_Value_Text: d.entries.map((e) => e.detail).join("\n"),
    ...(d.ref ? { Ref_Flow_Id: FLOWS[d.ref.flow].id, Ref_Item_Id: d.ref.itemId } : {}),
    Snapshot_JSON: JSON.stringify(snapshot),
  };
}

/** The app's audit rows of a case, as the screens would have written them (one row per action, D-7). */
function auditRows(c: CiqCase, s: AppState, code: FixtureCode): RawItem[] {
  const drafts: RowDraft[] = [];
  const contacts = [PORTAL_USERS.elena, PORTAL_USERS.ravi];
  const opOf = (e: AuditEvent) => c.openPoints.find((p) => e.detail.startsWith(`${p.id}`) || e.detail.startsWith(`${p.id}:`));
  for (const e of c.audit) {
    const k = codeOf(e);
    if (!k) continue;
    const prev = drafts.at(-1);
    if (prev && prev.code === k && prev.at === e.at && (prev.by === e.by || e.by === "system")) {
      prev.entries.push(e);
      continue;
    }
    const by = e.by === "system" ? (prev?.at === e.at ? prev.by : c.ownerId) : e.by;
    const d: RowDraft = { code: k, at: e.at, by, entries: [e], snap: {}, object: { kind: "Case", key: code, itemId: caseItemIdOf(code) } };
    if (k === "case.created") d.snap.case = headerOf(c, code, contacts);
    if (k.startsWith("op.")) {
      const op = opOf(e);
      if (op) {
        d.snap.op = opAsOf(op, e.at);
        d.object = { kind: "Open point", key: op.id, itemId: opItemId(op.id), state: d.snap.op.status };
        d.ref = { flow: "op", itemId: opItemId(op.id) };
      }
    }
    if (k === "review.completed") {
      const dept = (Object.keys(DEPT_SHORT) as Dept[]).find((x) => e.action === `Completed ${DEPT_SHORT[x]} review`) as ReviewDept | undefined;
      const tr = dept ? c.reviews.find((r) => r.dept === dept) : undefined;
      if (tr) {
        d.snap.track = { ...tr, status: "completed", completedAt: e.at, roundNo: 1 };
        d.snap.confirmation = c.confirmations.find((x) => x.type === "dept-completion" && x.dept === tr.dept && x.at === e.at);
        d.object = { kind: "Review", key: `${code}-${tr.dept}-1`, itemId: reviewItemId(code, tr.dept), state: "Completed" };
        d.ref = { flow: "review", itemId: reviewItemId(code, tr.dept) };
      }
    }
    if (k === "rmes.saved") d.object = { kind: "RMES record", key: `${code}-RMES-${e.by === "u-reg" ? "REG" : "SAF"}` };
    if (k === "note.added") {
      const n = c.internalNotes.find((x) => x.at === e.at && x.by === e.by);
      if (n) {
        d.snap.note = n;
        d.object = { kind: "Internal note", key: n.id };
      }
    }
    if (k === "case.cancelled" && c.cancelled) {
      d.snap.cancelled = { ...c.cancelled, closedOpIds: c.openPoints.filter((p) => p.closeReason?.startsWith("Case cancelled")).map((p) => p.id) };
      d.snap.confirmation = c.confirmations.find((x) => x.type === "cancellation");
    }
    drafts.push(d);
  }
  // one review.started row per review, as the app's ensureReviews wrote them until 22 Oct (I-2's E-A writes one row per
  // case since, testing/playEA.ts); the mapper reads both
  const cmp = c.confirmations.find((x) => x.type === "completeness");
  if (cmp)
    for (const r of c.reviews)
      drafts.push({
        code: "review.started",
        at: cmp.at,
        by: c.ownerId,
        entries: [{ id: "", at: cmp.at, by: "system", action: "Activated review", detail: `${DEPT_SHORT[r.dept]} review activated: completeness confirmed.` }],
        snap: { track: { dept: r.dept, status: "in-review", assigneeId: r.assigneeId, startedAt: r.startedAt, roundNo: 1 } },
        object: { kind: "Review", key: `${code}-${r.dept}-1`, itemId: reviewItemId(code, r.dept), state: "In review" },
        ref: { flow: "review", itemId: reviewItemId(code, r.dept) },
      });
  drafts.sort((a, b) => a.at.localeCompare(b.at));
  return drafts.map((d) => auditRow(d, code, s, c.id));
}

// ------------------------------------------------------------------------------------------------ the supplier master

function supplierRows(): RawItem[] {
  const contact = (key: string, u: { Name: string; Email: string; _id?: string }, title: string, canConfirm: boolean, active = true) => ({
    _id: `Contacts_${key.replace(/[^a-z0-9]/gi, "")}`,
    Contacts_Key: key,
    Contacts_Full_Name: u.Name,
    Contacts_Email: u.Email,
    Contacts_Title: title,
    Contacts_Can_Confirm: canConfirm ? LIST.yes : LIST.no,
    ...(u._id ? { Contacts_Portal_User_Id: u._id } : {}),
    Contacts_Active: active ? LIST.yes : LIST.no,
  });
  return [
    {
      ...formSys("PkSupSolvaro", "2026-09-21T10:00:00Z", "u-admin"),
      Supplier_Code: SUPPLIER_CODE,
      Supplier_Legal_Name: SUPPLIER_NAME,
      DUNS_Number: "471203958",
      Supplier_Kind: LIST.supplierKind.manufacturer,
      Supplier_Country_Code: "ES",
      Supplier_City: "Tarragona",
      Supplier_Active: LIST.yes,
      Supplier_Test: LIST.yes,
      [`Table::${TABLES.contacts}`]: [
        contact("c-elena", PORTAL_USERS.elena, "Regulatory Manager", true),
        contact("c-ravi", PORTAL_USERS.ravi, "QA Specialist", false),
        contact(NO_PORTAL_CONTACT.key, { Name: NO_PORTAL_CONTACT.name, Email: NO_PORTAL_CONTACT.email }, NO_PORTAL_CONTACT.title, false),
      ],
    },
    {
      ...formSys("PkSupNordhafen", "2026-09-22T10:00:00Z", "u-admin"),
      Supplier_Code: SECOND_SUPPLIER.code,
      Supplier_Legal_Name: SECOND_SUPPLIER.name,
      DUNS_Number: "318774502",
      Supplier_Kind: "Trader",
      Supplier_Country_Code: "DE",
      Supplier_City: "Bremen",
      Supplier_Active: LIST.yes,
      Supplier_Test: LIST.yes,
      [`Table::${TABLES.contacts}`]: [contact("c-henrik", { Name: "Henrik Lund", Email: "henrik.lund@nordhafen.example" }, "Technical Sales", true)],
    },
  ];
}

/** The Business administrator's supplier-master change as its global audit row (blank Case_Code, Snapshot_JSON.log). */
function supplierLogRow(): RawItem {
  const at = "2026-10-12T09:30:00Z";
  const log: LogEvent[] = [{ id: "L-0001", at, by: KF_USERS["u-admin"]!._id, kind: "supplier", action: "Added contact", detail: `${NO_PORTAL_CONTACT.name} (${NO_PORTAL_CONTACT.title}) added to ${SUPPLIER_NAME}`, supplierId: SUPPLIER_CODE }];
  const kf = KF_USERS["u-admin"]!;
  return {
    ...formSys("PkEvSupplier1", at, "u-admin"),
    Event_Key: "EV-LOG-20261012093000-0001",
    Case_Code: "",
    Event_At: at,
    Event_Category: "Supplier master",
    Action_Code: "supplier.changed",
    Actor_Side: LIST.actorSide,
    Actor_Name: kf.Name,
    Actor_Email: kf.Email,
    Actor_Role_Id: ROLES.admin.id,
    Object_Kind: "Supplier",
    Object_Key: SUPPLIER_CODE,
    Object_Item_Id: "PkSupSolvaro",
    New_Value_Text: log[0]!.detail,
    Snapshot_JSON: JSON.stringify({ v: 1, code: "supplier.changed", audit: [], log, handoffs: [] }),
  };
}

// ------------------------------------------------------------------------------------------------ configuration rows

const CONFIG_DIR = fileURLToPath(new URL("../../../../kissflow-build/config-seed/rows/", import.meta.url));
const CONFIG_IDS: Record<string, string> = { "REL:RS-2026.1 + v1": FIRST_RELEASE_ID };
/** A stray test row the live form holds (reader E §1): a Settings draft that must never be picked. */
export const STRAY_CONFIG_KEY = "ZZT-1008-1843-G-CFG";

/**
 * The 12 CIQ Config Version rows exactly as uploaded (kissflow-build/config-seed/rows/*.json, read with node:fs), each
 * with an _id and system fields; plus, unless `stray: false`, the stray ZZT Settings draft the live form also holds.
 */
export function configRows(opts: { stray?: boolean } = {}): RawItem[] {
  const files = readdirSync(CONFIG_DIR).filter((f) => f.endsWith(".json") && f !== "manifest.json").sort();
  const rows = files.map((f, i) => {
    const r = JSON.parse(readFileSync(`${CONFIG_DIR}${f}`, "utf8")) as Record<string, unknown>;
    const key = String(r.Config_Key);
    const at = typeof r.Published_At === "string" ? noMs(r.Published_At) : "2026-10-01T09:00:00Z";
    return { _id: CONFIG_IDS[key] ?? `PkCfg${String(i + 1).padStart(2, "0")}`, _created_at: at, _modified_at: at, _created_by: { _id: "UsSeedApiKey", Name: "API key", Kind: "User" }, ...r } as RawItem;
  });
  if (opts.stray === false) return rows;
  return [...rows, { _id: "PkCfgStray", _created_at: "2026-10-08T18:43:00Z", _modified_at: "2026-10-08T18:43:00Z", Config_Key: STRAY_CONFIG_KEY, Config_Kind: "Settings", Version_Label: "test", Config_State: "Draft", Payload_JSON: JSON.stringify({ undefinedOrigins: [], note: "stray test row" }) }];
}

// ------------------------------------------------------------------------------------------------ the fixture set

export interface HeldTask {
  task: TaskRef;
  /** Kissflow user ids that hold it (role members or the field-assigned raiser). */
  holders: string[];
}

export interface AppFixtures {
  /** The domain state the items were made from, under live identities (case ids = codes, user ids = Kissflow ids). */
  state: AppState;
  /** The fixture cases under live identities, by code. */
  cases: Record<FixtureCode, CiqCase>;
  /** Every item per flow, as Kissflow holds them. */
  db: Record<FlowKey, RawItem[]>;
  /** Every open task with its holders. */
  tasks: HeldTask[];
  /** Kissflow users by domain id. */
  users: typeof KF_USERS;
}

function build(): AppFixtures {
  evSeq = 0;
  const { s, ids } = domainState();
  const cfg = configRows();
  const manifestHash = str(cfg.find((r) => r._id === FIRST_RELEASE_ID), "Manifest_Hash");
  const db: Record<FlowKey, RawItem[]> = { case: [], review: [], op: [], audit: [], note: [], rmesSAF: [], rmesREG: [], supplier: supplierRows(), config: cfg, scopeRun: [] };
  const tasks: HeldTask[] = [];
  const cases = {} as Record<FixtureCode, CiqCase>;
  for (const code of CODES) {
    const c = s.cases.find((x) => x.id === ids[code])!;
    // every item under live identities: the code for the domain case id, Kissflow ids for the domain user ids (JSON text
    // fields such as Thread_JSON and Snapshot_JSON are written with Kissflow ids already)
    const add = (flow: FlowKey, it: RawItem) => db[flow].push(liveIdentity(it, c.id, code));
    add("case", caseItem(c, s, code, manifestHash));
    for (const r of c.reviews) {
      const it = reviewItem(c, code, r);
      add("review", it);
      if (r.status !== "completed") tasks.push({ task: { flow: "review", itemId: it._id, act: actOf(it._id), activityId: STEPS.review[r.dept] }, holders: [kfIdOf(r.assigneeId)] });
    }
    for (const op of c.openPoints) {
      const it = opItem(op, code, s);
      add("op", it);
      if (op.status !== "closed") tasks.push({ task: { flow: "op", itemId: it._id, act: actOf(it._id), activityId: STEPS.op[op.dept] }, holders: [kfIdOf(op.createdBy)] });
    }
    for (const dept of ["SAF", "REG"] as const) {
      const row = rmesRow(c, code, dept);
      if (row) add(dept === "SAF" ? "rmesSAF" : "rmesREG", row);
    }
    for (const n of c.internalNotes) add("note", noteRow(n, code, s));
    for (const row of auditRows(c, s, code)) add("audit", row);
    cases[code] = { ...liveIdentity(c, c.id, code), supplierId: SUPPLIER_CODE };
  }
  db.audit.push(supplierLogRow());
  const codeOfCase = (caseId: string) => CODES.find((k) => ids[k] === caseId);
  const changeReports = s.changeReports.filter((r) => codeOfCase(r.caseId)).map((r) => liveIdentity(r, r.caseId, codeOfCase(r.caseId)!));
  const state = liveIdentity({ ...s, cases: CODES.map((k) => cases[k]), changeReports }, "__none", "__none");
  return { state, cases, db, tasks, users: KF_USERS };
}

let cached: AppFixtures | undefined;
/** Built once per process (the domain scenario takes a moment). Treat it as read-only; clone before changing. */
export function appFixtures(): AppFixtures {
  return (cached ??= build());
}

/** The open tasks a Kissflow user holds. */
export const tasksFor = (kfUserId: string): TaskRef[] => appFixtures().tasks.filter((t) => t.holders.includes(kfUserId)).map((t) => t.task);

/**
 * The harness seed (scripts/applive-fixtures.ts → scripts/harness-applive.mjs, the createFakeClient seed shape of
 * DESIGN §3.3): every item as Kissflow holds it, and every open task. Who holds a task is the emulated host's rule (role
 * members at a review step, Raiser_Assignee at an open-point step, the creator at Start), so no holders travel.
 */
export function harnessFixtures(): { items: Partial<Record<FlowKey, RawItem[]>>; tasks: TaskRef[] } {
  const fx = appFixtures();
  return { items: structuredClone(fx.db), tasks: fx.tasks.map((t) => ({ ...t.task })) };
}

/**
 * The supplier portal's CIQP Request and CIQP Query items of the fixture cases (src/portal/data/fixtures.ts), as the
 * data console's case delete finds them (26 Oct): one request per case (App_Case_Item_Id = the case item, the case's
 * Portal_Request_Item_Id), and ZZT-0003's queries that an app open point names (Portal_Query_Item_Id), each with
 * App_Open_Point_Id = that point's item id, as the op.round integration writes it. Other cases' portal items are left out.
 */
export function portalFixtures(): { request: RawItem[]; query: RawItem[] } {
  const fx = appFixtures();
  const caseIds = new Set(fx.db.case.map((c) => c._id));
  const opOfQuery = new Map(fx.db.op.filter((o) => str(o, "Portal_Query_Item_Id")).map((o) => [str(o, "Portal_Query_Item_Id"), o._id]));
  const all = fixtureSet().items;
  return {
    request: all.filter((x) => x.flow === "request" && caseIds.has(str(x.item, "App_Case_Item_Id"))).map((x) => structuredClone(x.item)),
    query: all.filter((x) => x.flow === "query" && opOfQuery.has(x.item._id)).map((x) => ({ ...structuredClone(x.item), App_Open_Point_Id: opOfQuery.get(x.item._id)! })),
  };
}

// ------------------------------------------------------------------------------------------------ identity and snapshots

/** The Identity of a fixture user holding the given personas (role ids as live). */
export function fixtureIdentity(personas: InternalPersonaId[], domainUser = PERSONA_USER[personas[0] ?? "rmm"]): Identity {
  const u = KF_USERS[domainUser]!;
  return { kfUserId: u._id, name: u.Name, email: u.Email, roles: personas.map((p) => ({ id: ROLES[p].id, name: ROLES[p].name })), personas, caseAdmin: false, integration: false, unknownRoles: [] };
}

/** DESIGN §3.4 actingAs, for tests (identity.ts owns the real one): me.id is the Kissflow id, or the static alias of
 *  the Business administrator, Auditor and Business owner, whose rights hang on those ids (roleOf, G-3). */
export function fixtureActing(identity: Identity, personaId: InternalPersonaId): Acting {
  const p = INTERNAL_PERSONAS.find((x) => x.id === personaId)!;
  const id = personaId === "admin" || personaId === "auditor" || personaId === "owner" ? `u-${personaId}` : identity.kfUserId;
  const me: User = { id, name: identity.name, email: identity.email, side: "internal", title: p.label, ...(p.dept ? { dept: p.dept } : {}), initials: identity.name.replace(/^Dr\. /, "").split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") };
  return { personaId, persona: { ...p, userId: id }, me, roleId: ROLES[personaId].id, ...(p.dept ? { dept: p.dept } : {}) };
}

export type ReadMode = "full" | "role";

/**
 * A LiveSnapshot as load.ts would give it to a persona.
 * - "full": every item read in full (a Case administrator's view, or the morning's R-1 fix);
 * - "role": tonight's grants (DESIGN §4): the audit, config and note forms for all; RMM reads its cases and the reviews
 *   it started (mine) and its own points; a department its open review task and its own points; RMES rows only the
 *   own department (both: Auditor); the supplier master RMM and the Business administrator. Case items nobody else can
 *   read are listed in unreadableCases.
 */
export function fixtureSnapshot(personaId: InternalPersonaId, mode: ReadMode = "full", opts: { loadedAt?: string } = {}): LiveSnapshot {
  const fx = appFixtures();
  const me = KF_USERS[PERSONA_USER[personaId]]!._id;
  const mine = tasksFor(me);
  const held = new Map(mine.map((t) => [t.itemId, t]));
  const withAct = (it: RawItem): RawItem => (held.has(it._id) ? { ...it, _activity_instance_id: held.get(it._id)!.act } : it);
  const all = (flow: ProcessKey) => fx.db[flow].map(withAct);
  const dept = INTERNAL_PERSONAS.find((p) => p.id === personaId)?.dept;
  const created = (it: RawItem) => (it._created_by as { _id?: string } | undefined)?._id === me;
  const items: LiveSnapshot["items"] =
    mode === "full"
      ? { case: all("case"), review: all("review"), op: all("op") }
      : {
          case: personaId === "rmm" ? all("case").filter(created) : [],
          review: all("review").filter((it) => held.has(it._id) || (personaId === "rmm" && created(it))),
          op: all("op").filter((it) => held.has(it._id) || created(it)),
        };
  const forms: LiveSnapshot["forms"] = {
    audit: fx.db.audit,
    config: fx.db.config,
    note: fx.db.note,
    rmesSAF: mode === "full" || dept === "SAF" || personaId === "auditor" ? fx.db.rmesSAF : [],
    rmesREG: mode === "full" || dept === "REG" || personaId === "auditor" ? fx.db.rmesREG : [],
    supplier: mode === "full" || personaId === "rmm" || personaId === "admin" ? fx.db.supplier : [],
  };
  const unreadableCases: LiveSnapshot["unreadableCases"] = {};
  if (mode === "role") for (const it of fx.db.case) if (!items.case.some((x) => x._id === it._id)) unreadableCases[it._id] = "no read route for this role";
  return { loadedAt: opts.loadedAt ?? "2026-10-24T08:00:00Z", items, forms, tasks: mine, unreadableCases, reads: [], warnings: [] };
}

/** The whole mapper input for a persona (a fixture user holding only that persona). */
export function fixtureInput(personaId: InternalPersonaId, mode: ReadMode = "full"): MapInput {
  const identity = fixtureIdentity([personaId]);
  return { snap: fixtureSnapshot(personaId, mode), identity, acting: fixtureActing(identity, personaId) };
}
