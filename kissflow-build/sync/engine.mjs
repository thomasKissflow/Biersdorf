// The service's engine: the prototype's own domain code (vendor/domain.mjs, bundled read-only from
// prototype/src/domain) applied to a one-case "world" built from Kissflow data. Every transition, guard, audit text and
// mail text therefore comes from the prototype by construction (plan v5 §11.4); the service only translates the result
// into Kissflow writes (reconcile.mjs).
//
// The canonical case state lives in CIQ Case Data (the service is its only writer):
// - the JSON fields of plan §4.4 (Config_Answers_JSON, Answers_JSON, Answered_By_JSON, Justifications_JSON, Scope_JSON,
//   Tracks_JSON, Open_Points_JSON, Confirmations_JSON, Phase_History_JSON, Final_Document_JSON);
// - the rest of the prototype case (owner, contacts, components, documents, fixed requested documents, cancellation,
//   …) and the service's bookkeeping in the ledger field `Sync_Note` (JSON; see LEDGER_FIELD).
// The child tables (Components, Documents, Requested_Documents, Change_Reports) are projections for the Workbench and
// search; the service writes them and never reads its state back from them.
// RMES lives only in the RMES forms (restricted, §4.10), never in Case Data.

import { createHash } from "node:crypto";
import * as D from "./vendor/domain.mjs";
import { LIST, invert } from "./ids.mjs";

export { D };
export const A = D.A;

/** The Case Data field that holds the service ledger (plan §4.4 "Sync_Note"; must be a Textarea, see README). */
export const LEDGER_FIELD = "Sync_Note";
export const LEDGER_VERSION = 1;
export const EVALUATOR_VERSION = "prototype-domain@vendor";

export const J = (text, fallback) => {
  if (text === undefined || text === null || text === "") return fallback;
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

/** Canonical JSON: keys sorted at every level, no whitespace, undefined dropped. The seal (plan §10) is SHA-256 of it. */
export function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",")}]`;
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`)
    .join(",")}}`;
}
export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
export const sealOf = (doc) => sha256(canonicalJson(doc));

export const PHASE_OF_LABEL = invert(LIST.casePhase);
export const isoDate = (iso) => (iso ? String(iso).slice(0, 10) : undefined);
export const toIsoDay = (d) => (d ? (String(d).length === 10 ? `${d}T00:00:00.000Z` : new Date(d).toISOString()) : undefined);

// ---------------------------------------------------------------------------------------------- ledger

export function emptyLedger() {
  return {
    v: LEDGER_VERSION,
    core: {},
    components: [],
    documents: [],
    requestedDocs: undefined,
    changeReports: [],
    uploads: {}, // portal Upload_Id → prototype document id
    items: {}, // idempotency map: "review:SAF:1" → item id, "op:OP-0001-01", "query:OP-0001-01:r2", "release:2", "rmes:SAF", "request", "scopeRun:3"
    applied: [], // trigger keys already applied to the state (requests, portal events)
    answersRev: 0,
    changeReportRev: 0,
    queriesSeen: {},
    releasesSeen: {},
    pendingMail: [], // C-10 debounce buffer
    scopeRuns: 0,
    alerts: [],
  };
}

export const readLedger = (row) => ({ ...emptyLedger(), ...J(row?.[LEDGER_FIELD], {}) });

export function remember(ledger, key) {
  if (!ledger.applied.includes(key)) ledger.applied = [...ledger.applied, key].slice(-300);
}

// ---------------------------------------------------------------------------------------------- canonical case

/** The prototype CiqCase from the Case Data row (+ RMES rows). */
export function toCiqCase(row, { rmes } = {}) {
  const L = readLedger(row);
  const reviews = J(row.Tracks_JSON, []);
  // The synthetic audit carries each assignee's last activity, so reminder rem-3 (reminders.ts) sees it.
  const audit = reviews.filter((r) => r.lastActivityAt).map((r, i) => ({ id: `${row.Case_Code}-act${i}`, at: r.lastActivityAt, by: r.assigneeId, action: "activity", detail: "" }));
  return {
    id: row.Case_Code,
    materialName: row.Trade_Name ?? "",
    inci: row.Main_INCI ?? "",
    materialNo: row.BDF_Material_No ?? "",
    supplierId: row.Supplier_Code,
    manufacturer: L.core.manufacturer ?? row.Supplier_Name ?? "",
    site: L.core.site ?? "",
    supplierContactIds: L.core.contactIds ?? [],
    ownerId: L.core.ownerId,
    createdAt: L.core.createdAt ?? row.Created_At,
    dueDate: L.core.dueDate,
    phase: L.core.phase ?? PHASE_OF_LABEL[row.Case_Phase] ?? "supplier-input",
    templateVersion: row.Template_Version,
    ruleSetVersion: row.Rule_Set_Version,
    config: J(row.Config_Answers_JSON, {}),
    scope: J(row.Scope_JSON, []),
    answers: J(row.Answers_JSON, {}),
    answeredBy: J(row.Answered_By_JSON, {}),
    components: L.components ?? [],
    justifications: J(row.Justifications_JSON, {}),
    documents: L.documents ?? [],
    reviews,
    informed: L.core.informed ?? [],
    openPoints: J(row.Open_Points_JSON, []),
    rmes: rmes ?? undefined,
    confirmations: J(row.Confirmations_JSON, []),
    audit,
    reviewVersion: L.core.reviewVersion ?? 0,
    phaseHistory: J(row.Phase_History_JSON, []),
    cancelled: L.core.cancelled ?? undefined,
    priority: L.core.priority ?? "normal",
    internalNotes: [],
    liveScope: true,
    finalDocument: J(row.Final_Document_JSON, undefined),
    requestedDocs: L.requestedDocs,
  };
}

/** Tracks as stored: the prototype track plus item bookkeeping; never the RMES decision reason (§4.4: no reasons). */
const storedTrack = (r) => {
  const { decisionReason: _dr, continueAfterRejection, ...rest } = r;
  return { ...rest, ...(continueAfterRejection ? { continueAfterRejection: { depts: continueAfterRejection.depts, by: continueAfterRejection.by, at: continueAfterRejection.at } } : {}) };
};

/** The Case Data header fields and ledger for a canonical case (child tables are built in reconcile.mjs). */
export function caseDataFields(c, ledger, extra = {}) {
  const L = {
    ...ledger,
    core: {
      ...ledger.core,
      ownerId: c.ownerId,
      contactIds: c.supplierContactIds,
      createdAt: c.createdAt,
      dueDate: c.dueDate,
      phase: c.phase,
      priority: c.priority,
      manufacturer: c.manufacturer,
      site: c.site,
      informed: c.informed,
      reviewVersion: c.reviewVersion,
      cancelled: c.cancelled ?? undefined,
    },
    components: c.components,
    documents: c.documents,
    requestedDocs: c.requestedDocs,
  };
  const open = c.openPoints.filter((p) => p.status !== "closed");
  const at = extra.now ?? new Date().toISOString();
  const completed = c.phaseHistory.filter((p) => p.phase === "completed").at(-1)?.at;
  const out = {
    Case_Code: c.id,
    Cycle_No: 1,
    Supplier_Code: c.supplierId,
    Trade_Name: c.materialName,
    Main_INCI: c.inci,
    BDF_Material_No: c.materialNo,
    Case_Phase: LIST.casePhase[c.phase],
    Phase_History_JSON: JSON.stringify(c.phaseHistory),
    Priority: LIST.priority[c.priority] ?? "Normal",
    Due_Date: isoDate(c.dueDate),
    Created_At: c.createdAt,
    Completed_At: completed,
    Cancelled_At: c.phase === "cancelled" ? c.cancelled?.at : undefined,
    Template_Version: c.templateVersion,
    Rule_Set_Version: c.ruleSetVersion,
    Target_Markets_Text: (c.config.SF11 ?? []).join(", "),
    Origin_Types: (c.config.SF01 ?? []).join(", "),
    Undefined_Origin: D.hasUndefinedOrigin(c.config) ? "Yes" : "No",
    Config_Answers_JSON: JSON.stringify(c.config),
    Answers_JSON: JSON.stringify(c.answers),
    Answered_By_JSON: JSON.stringify(c.answeredBy),
    Justifications_JSON: JSON.stringify(c.justifications),
    Scope_JSON: JSON.stringify(c.scope),
    Fixed_Scope_At: c.confirmations.find((x) => x.type === "completeness")?.at,
    Tracks_JSON: JSON.stringify(c.reviews.map(storedTrack)),
    Open_Points_JSON: JSON.stringify(c.openPoints),
    Confirmations_JSON: JSON.stringify(c.confirmations),
    Open_Points_Count: open.length,
    Overdue_Points_Count: open.filter((p) => Date.parse(p.dueDate) + 86_400_000 <= Date.parse(at)).length,
    Final_Document_JSON: c.finalDocument ? JSON.stringify(c.finalDocument) : undefined,
    Synced_At: at,
    [LEDGER_FIELD]: JSON.stringify(L),
    ...extra.fields,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

// ---------------------------------------------------------------------------------------------- RMES rows ⇄ prototype

const RESULT_OF = invert(LIST.rmesResult);

/** The prototype RMES record from the SAF/REG rows (criteria + findings). */
export function rmesFromRows(rows, { createdAt } = {}) {
  const present = Object.entries(rows ?? {}).filter(([, r]) => r);
  if (!present.length) return undefined;
  const criteria = [];
  const findings = [];
  for (const [dept, row] of present) {
    for (const r of row[`Table::${dept === "SAF" ? "Safety_Criteria" : "Regulatory_Criteria"}`] ?? []) {
      const limit =
        r.Criteria_Limit_Value !== undefined && r.Criteria_Limit_Value !== null && r.Criteria_Limit_Value !== ""
          ? { substance: r.Criteria_Source_Value_Text ?? "", value: Number(r.Criteria_Reported_Value), unit: r.Criteria_Reported_Unit ?? "", limit: Number(r.Criteria_Limit_Value), limitSetVersion: r.Criteria_Limit_Set_Version ?? "", pass: r.Criteria_Limit_Pass === "Yes" }
          : undefined;
      criteria.push({
        id: r.Criteria_Code,
        part: r.Criteria_Part,
        dept,
        title: r.Criteria_Title,
        source: { sectionId: r.Criteria_Source_Section_Key, ...(r.Criteria_Source_Field_Key ? { fieldId: r.Criteria_Source_Field_Key } : {}), version: 0, label: r.Criteria_Applicability_Basis ?? "" },
        ...(r.Criteria_Result ? { result: RESULT_OF[r.Criteria_Result] ?? r.Criteria_Result } : {}),
        ...(r.Criteria_Comment ? { comment: r.Criteria_Comment } : {}),
        ...(r.Criteria_Recorded_By ? { by: r.Criteria_Recorded_By?._id ?? r.Criteria_Recorded_By } : {}),
        ...(r.Criteria_Recorded_At ? { at: r.Criteria_Recorded_At } : {}),
        ...(limit ? { limit } : {}),
        ...(r.Criteria_AI_Suggestion_Text ? { aiSuggestion: r.Criteria_AI_Suggestion_Text } : {}),
      });
    }
    for (const f of row[`Table::${dept === "SAF" ? "Safety_Findings" : "Regulatory_Findings"}`] ?? []) {
      findings.push({ id: f.Findings_Linked_OP_Key ? `${f.Findings_Linked_OP_Key}-F` : `${dept}-${f.Findings_Criterion_Code}-${sha256(f.Findings_Text ?? "").slice(0, 6)}`, criterionId: f.Findings_Criterion_Code ?? "", dept, text: f.Findings_Text ?? "", blocking: true, status: f.Findings_State === "closed" ? "closed" : "open", ...(f.Findings_Linked_OP_Key ? { openPointId: f.Findings_Linked_OP_Key } : {}) });
    }
  }
  return { createdAt: createdAt ?? present[0][1]._created_at, reviewVersion: 1, criteria, findings };
}

export function criterionRow(cr) {
  return {
    Criteria_Code: cr.id,
    Criteria_Part: cr.part,
    Criteria_Title: cr.title,
    Criteria_Applicable: "Yes",
    Criteria_Applicability_Basis: cr.source?.label ?? "",
    Criteria_Source_Section_Key: cr.source?.sectionId ?? "",
    ...(cr.source?.fieldId ? { Criteria_Source_Field_Key: cr.source.fieldId } : {}),
    ...(cr.limit
      ? { Criteria_Source_Value_Text: cr.limit.substance, Criteria_Reported_Value: cr.limit.value, Criteria_Reported_Unit: cr.limit.unit, Criteria_Limit_Value: cr.limit.limit, Criteria_Limit_Comparator: "≤", Criteria_Limit_Set_Version: cr.limit.limitSetVersion, Criteria_Limit_Pass: cr.limit.pass ? "Yes" : "No" }
      : {}),
    ...(cr.aiSuggestion ? { Criteria_AI_Suggestion_Text: cr.aiSuggestion, Criteria_AI_State: "Proposed" } : {}),
  };
}

// ---------------------------------------------------------------------------------------------- world and runner

/**
 * A prototype AppState around one case (or a few, for supplier-level actions). `users` come from the directory (with
 * actor projection already applied), `config` from the CIQ Config Version rows, `mails` are stubs of the outbox keys
 * that exist, so idempotent mails (reminders) are never sent twice.
 */
export function buildWorld({ users, suppliers, config, cases, mailKeys = [], changeReports = [] }) {
  D.syncRegistry(config.cfg);
  return {
    schema: 9,
    personaId: "rmm",
    cases,
    users,
    suppliers,
    templates: [],
    activeRuleSet: D.currentPair({ config: config.cfg }).ruleSetVersion,
    config: config.cfg,
    ownership: config.ownership,
    reminders: config.reminders,
    toasts: [],
    mails: mailKeys.map((key, i) => ({ id: `M-stub-${i}`, key, to: [], event: "stub", readBy: [], at: "1970-01-01T00:00:00.000Z" })),
    log: [],
    changeReports,
  };
}

/**
 * Runs one prototype action. Returns the new state and what it produced. A refusal keeps only the audit entries the
 * refusal itself wrote (e.g. "Change attempt refused", B-35) and nothing else.
 */
export function runAction(world, caseId, fn) {
  const before = world;
  const beforeCase = caseId ? world.cases.find((c) => c.id === caseId) : undefined;
  const auditBefore = beforeCase?.audit.length ?? 0;
  const mailsBefore = world.mails.length;
  const logBefore = world.log.length;
  const crBefore = world.changeReports.length;
  const next = fn(world);
  const refused = D.wasRefused(before, next);
  const afterCase = caseId ? next.cases.find((c) => c.id === caseId) : undefined;
  const newAudit = afterCase ? afterCase.audit.slice(auditBefore) : [];
  if (refused) {
    return { refused: true, refusal: next.toasts.at(-1)?.text ?? "Refused.", state: before, newAudit, newMails: [], newLog: [], newChangeReports: [] };
  }
  return {
    refused: false,
    refusal: null,
    state: next,
    newAudit,
    newMails: next.mails.slice(mailsBefore),
    newLog: next.log.slice(logBefore),
    newChangeReports: next.changeReports.slice(crBefore),
    toast: next.toasts.at(-1)?.text,
  };
}

/** Runs several actions one after the other (e.g. a supplier save: config, answers, rows, uploads). */
export function runSequence(world, caseId, steps) {
  let state = world;
  const out = { state, newAudit: [], newMails: [], newLog: [], newChangeReports: [], refusals: [] };
  for (const s of steps) {
    const r = runAction(state, caseId, (w) => s.fn(w));
    out.newAudit.push(...r.newAudit.map((a) => ({ ...a, _trigger: s.label })));
    if (r.refused) {
      out.refusals.push({ label: s.label, text: r.refusal });
      continue;
    }
    state = r.state;
    if (s.after) state = s.after(state) ?? state;
  }
  out.state = state;
  // Taken once at the end: a data-changed mail of a later step may have been merged into an earlier one (mail.ts).
  out.newMails = state.mails.slice(world.mails.length);
  out.newLog = state.log.slice(world.log.length);
  out.newChangeReports = state.changeReports.slice(world.changeReports.length);
  return out;
}

export const caseIn = (state, id) => state.cases.find((c) => c.id === id);
