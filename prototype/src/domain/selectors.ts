// Pure, derived views over the state. Screens should use these instead of re-deriving logic.

import { CONFIG_BY_ID, DEPT_SHORT, ORIGIN_LABEL, REVIEW_DEPTS, fieldOf, fieldsOf, sectionOf } from "./catalog";
import { componentRowProblems } from "./composition";
import { docSectionId, isSectionUploadKey, isSlotKey, requestedByText, requestedDocStatus, requestedDocuments, sectionUploadKey, sectionUploadName, sectionUploadRequired, sectionUploadStatus, slotBlocks, slotName, slotSection, slotsIn, uploadKeySection } from "./requestedDocs";
import { undefinedOrigins } from "./rules";
import type {
  AnswerValue,
  Answers,
  AppState,
  CiqCase,
  ConfigQuestionId,
  ConfigState,
  Dept,
  FieldDef,
  Message,
  OpenPoint,
  Phase,
  ReviewDept,
  ReviewTrack,
  ScopeItem,
  User,
} from "./types";

export const NOW_ISO = "2026-10-06T09:00:00.000Z";

/** "Now" for the demo. Seeded history is anchored to NOW_ISO; live actions use the real clock. */
export function nowIso(): string {
  return new Date().toISOString() < NOW_ISO ? NOW_ISO : new Date().toISOString();
}

export const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / DAY);

export const PHASE_LABEL: Record<Phase, string> = {
  "supplier-input": "Supplier filling in the CIQ",
  review: "Review (RMM and departments)",
  "final-release": "Awaiting final release",
  completed: "Completed",
  cancelled: "Cancelled",
  // Legacy phases of the live portal's old flow (portal/data/map.ts); the prototype never produces them.
  metadata: "Basic data (portal, old flow)",
  "scope-check": "Scope check (portal, old flow)",
};

/** Ordered stepper used on case pages: Part 1 is one supplier step, then the review, the release and the end. */
export const PHASE_STEPS: Phase[] = ["supplier-input", "review", "final-release", "completed"];

export const isClosed = (c: CiqCase) => c.phase === "completed" || c.phase === "cancelled";
/** The legacy portal phases (metadata, scope-check) count as Part 1. */
export const partOf = (c: CiqCase): "Part 1" | "Part 2" | "Closed" =>
  isClosed(c) ? "Closed" : c.phase === "review" || c.phase === "final-release" ? "Part 2" : "Part 1";

/** Who is the ball with right now? Drives the "waiting on" KPIs. */
export function waitingOn(c: CiqCase): "supplier" | "bdf" | "none" {
  if (isClosed(c)) return "none";
  if (c.phase === "scope-check") return "bdf"; // legacy live-portal phase
  if (c.phase !== "review") return "supplier"; // supplier-input, final-release, legacy metadata
  // review: with the supplier if every non-completed track (RMM's included) is waiting on the supplier
  const active = c.reviews.filter((r) => r.status !== "completed");
  if (active.length && active.every((r) => r.status === "waiting-supplier")) return "supplier";
  return "bdf";
}

export const scopeOf = (c: CiqCase, sectionId: string): ScopeItem | undefined => c.scope.find((s) => s.sectionId === sectionId);

/**
 * GEN answers Beiersdorf sets at case start from the case and the supplier master: the trade name, the supplier's name
 * and DUNS, and the case contacts' e-mails. The supplier sees them but cannot change them (New case: "pre-filled for the
 * supplier, who sees but cannot change it"); RMM changes the contacts on the case. Prototype (live-scope) cases only:
 * the live portal's old flow keeps its editable basic data.
 */
export const BDF_SET_FIELDS: readonly string[] = ["FLD-GEN-001", "FLD-GEN-002", "FLD-GEN-003", "FLD-GEN-008", "FLD-GEN-009"];
export const isSetByBdf = (c: Pick<CiqCase, "liveScope">, fieldId: string) => c.liveScope === true && BDF_SET_FIELDS.includes(fieldId);

/** The manufacturer and production site as the supplier answered them in GEN (FLD-GEN-004/-005), else the case's start
 *  values (RMM starts a case with the supplier as manufacturer and no site). */
export const manufacturerOf = (c: Pick<CiqCase, "answers" | "manufacturer">): string => (typeof c.answers["FLD-GEN-004"] === "string" && c.answers["FLD-GEN-004"].trim() ? c.answers["FLD-GEN-004"].trim() : c.manufacturer);
/** The case's supplier as Beiersdorf set it at case start (FLD-GEN-002), else the supplier master's name, else the name
 *  the case started with: a released document and the RMES must not follow later edits of the master. "" when none. */
export const caseSupplierName = (s: Pick<AppState, "suppliers">, c: Pick<CiqCase, "answers" | "supplierId" | "manufacturer">): string =>
  String(c.answers["FLD-GEN-002"] ?? "").trim() || s.suppliers.find((x) => x.id === c.supplierId)?.name || c.manufacturer;
export const siteOf = (c: Pick<CiqCase, "answers" | "site">): string => (typeof c.answers["FLD-GEN-005"] === "string" && c.answers["FLD-GEN-005"].trim() ? c.answers["FLD-GEN-005"].trim() : c.site);

/** Sections the supplier must work on (mandatory or optional), in questionnaire order. */
export const activeSections = (c: CiqCase) => c.scope.filter((s) => s.applicability !== "na");

export function isVisible(f: FieldDef, c: CiqCase): boolean {
  if (f.liveOnly && !c.liveScope) return false;
  return !f.showWhen || f.showWhen(c.answers, c.config);
}

export function hasValue(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return v.min !== null || v.max !== null;
  return true;
}

/** A field's answer: a derived field (FLD-A1-105, L6) shows its source field's answer and is never stored itself. */
export const answerOf = (c: Pick<CiqCase, "answers">, f: Pick<FieldDef, "id" | "derivedFrom">): AnswerValue | undefined => c.answers[f.derivedFrom ?? f.id];
/** Who gave a field's answer (a derived field: whoever answered its source). */
export const answeredByOf = (c: Pick<CiqCase, "answeredBy">, f: Pick<FieldDef, "id" | "derivedFrom">): { by: string; at: string } | undefined => c.answeredBy[f.derivedFrom ?? f.id];

/** A required field counts as answered with a value, or with a justification ("Cannot provide"), except a controller
 *  of a matrix chain (noJustification, D10): its justification never counts, so Yes → upload / No → reason can't be
 *  skipped. A justification stored before 28 Oct stays in the data. */
export const fieldAnswered = (c: Pick<CiqCase, "answers" | "justifications">, f: Pick<FieldDef, "id" | "derivedFrom" | "noJustification">): boolean =>
  hasValue(answerOf(c, f)) || (!f.noJustification && !!c.justifications[f.id]);

export interface Blocker {
  sectionId: string;
  /** A field id, a metadata question id (SF01…SF12, in section GEN) for an unanswered metadata question, a
   *  requested-document key ("EV:…", requestedDocs.ts), or a documents-only section's upload ("DOC:<section id>"). */
  fieldId?: string;
  /** A K2.1 component row (its id): the jump opens that row. */
  rowId?: string;
  label: string;
  /** The supplier's wording where it differs (a requested document: no rule ids). */
  supplierLabel?: string;
}

/** The metadata questions the completeness gate requires (liveScope cases). SF-05 is optional; SF-11 is set by RMM. */
export const REQUIRED_CONFIG: ConfigQuestionId[] = ["SF01", "SF03", "SF04", "SF06", "SF07", "SF09", "SF10", "SF12"];

export function isConfigAnswered(c: Pick<CiqCase, "config">, id: ConfigQuestionId): boolean {
  const v = c.config[id];
  if (id === "SF01") return Array.isArray(v) && v.length > 0;
  return v !== undefined;
}

/** Required metadata questions still unanswered, in REQUIRED_CONFIG order. */
export const unansweredConfig = (c: Pick<CiqCase, "config">): ConfigQuestionId[] => REQUIRED_CONFIG.filter((k) => !isConfigAnswered(c, k));

/**
 * The fields of a case's section in the case's questionnaire version (spec §8.1), visible ones only: a field added in
 * a later version never appears on an earlier case. Pass the state's config (`s.config`) from domain code; screens may
 * leave it out (the store-synced registry).
 */
export const caseFields = (c: CiqCase, sectionId: string, cfg?: ConfigState): FieldDef[] => fieldsOf(sectionId, c.templateVersion, cfg).filter((f) => isVisible(f, c));

/**
 * M9: the answers the case's open sections pre-fill (FLD-A2-101 with the main INCI when Annex 2 opens). A field
 * qualifies while it has no value, no justification and no answeredBy entry, so a value the supplier cleared is never
 * filled in again. Returns {fieldId: value} for the non-empty pre-fills; {} when there is nothing to fill.
 */
export function prefillAnswers(c: CiqCase, cfg?: ConfigState): Answers {
  const out: Answers = {};
  for (const sc of c.scope) {
    if (sc.applicability === "na") continue;
    for (const f of caseFields(c, sc.sectionId, cfg)) {
      if (!f.prefill || f.derivedFrom || isSetByBdf(c, f.id)) continue;
      if (hasValue(c.answers[f.id]) || c.justifications[f.id] || c.answeredBy[f.id]) continue;
      const v = f.prefill(c);
      if (v !== undefined && hasValue(v)) out[f.id] = v;
    }
  }
  return out;
}

/** Fields that must have a value (or a justification) before the completeness confirmation (REQ-PROC-012). A derived
 *  field (L6) is never required itself: its source is. */
export function requiredFields(c: CiqCase, sectionId: string, cfg?: ConfigState): FieldDef[] {
  const sc = scopeOf(c, sectionId);
  if (!sc || sc.applicability !== "mandatory") return [];
  return caseFields(c, sectionId, cfg).filter((f) => f.required !== "optional" && !f.derivedFrom);
}

/**
 * The K2.1 composition rows that block the completeness confirmation (matrix v0.6, H1/M1/M2/L5): per row the INCI (or
 * IUPAC name), the function, an explicit Additive Yes/No and a concentration range (0–100 %, min ≤ max), a CAS or EC
 * number in its format when filled. D6 (chosen as a blocker, both ways): every row's origin is one of the SF-01
 * answers, and every SF-01 answer is used by at least one row; SF-01 drives the annexes, so a mismatch means missing
 * or superfluous annexes. The D6 check needs SF-01 answered (until then its own blocker asks for it).
 */
export function compositionBlockers(c: Pick<CiqCase, "components" | "config">): Blocker[] {
  const out: Blocker[] = [];
  c.components.forEach((r, i) => {
    for (const p of componentRowProblems(r)) out.push({ sectionId: "K2.1", rowId: r.id, label: `Component ${i + 1}: ${p.text}` });
  });
  const selected = c.config.SF01 ?? [];
  if (!selected.length || !c.components.length) return out;
  const name = (o: string) => ORIGIN_LABEL[o as keyof typeof ORIGIN_LABEL] ?? o;
  c.components.forEach((r, i) => {
    if (!selected.includes(r.origin))
      out.push({
        sectionId: "K2.1",
        rowId: r.id,
        label: `Component ${i + 1}: origin “${name(r.origin)}” is not one of the SF-01 origins`,
        supplierLabel: `Component ${i + 1}: its origin “${name(r.origin)}” is not one of the origins you selected in the metadata questions`,
      });
  });
  for (const o of selected)
    if (!c.components.some((r) => r.origin === o))
      out.push({ sectionId: "K2.1", label: `SF-01 origin “${name(o)}” is not used by any component`, supplierLabel: `You selected the origin “${name(o)}”, but no component has it. Add the component or remove the origin.` });
  return out;
}

/** Required answers of a section: its mandatory fields, the K2.1 composition (done when it has rows and none of them
 *  blocks), the upload of a documents-only section that requires one (done when a file is there or justified), and
 *  its mandatory requested documents (done when uploaded or justified; an optional one is not counted). */
export function sectionProgress(c: CiqCase, sectionId: string, cfg?: ConfigState): { done: number; total: number } {
  const req = sectionId === "K2.1" ? [...requiredFields(c, sectionId, cfg), null] : requiredFields(c, sectionId, cfg);
  let done = 0;
  for (const f of req) {
    if (f === null) done += c.components.length > 0 && compositionBlockers(c).length === 0 ? 1 : 0;
    else if (fieldAnswered(c, f)) done += 1;
  }
  const upload = sectionUploadRequired(c, sectionId, cfg) ? 1 : 0;
  if (upload && sectionUploadStatus(c, sectionId) !== "missing") done += 1;
  const slots = scopeOf(c, sectionId)?.applicability === "na" ? [] : slotsIn(c, sectionId, cfg).filter((x) => !x.optional);
  for (const slot of slots) if (requestedDocStatus(c, slot) !== "missing") done += 1;
  return { done, total: req.length + upload + slots.length };
}

/** A requested document that is neither uploaded nor justified, as a completeness blocker in its section. */
const slotBlocker = (slot: { key: string; doc: string; sectionId: string; ruleIds: string[] }): Blocker => ({
  sectionId: slot.sectionId,
  fieldId: slot.key,
  label: `${slot.doc} (${requestedByText(slot)})`,
  supplierLabel: `${slot.doc} (requested document)`,
});

/** What still blocks the completeness confirmation, in the case's questionnaire version. Pass `s.config` from domain
 *  code (pure); screens may leave it out. */
export function completenessBlockers(c: CiqCase, cfg?: ConfigState): Blocker[] {
  const out: Blocker[] = [];
  // The metadata questions are part of the CIQ (liveScope); the live portal's old flow asks them in its own step.
  if (c.liveScope) for (const k of unansweredConfig(c)) out.push({ sectionId: "GEN", fieldId: k, label: `${CONFIG_BY_ID[k].code} · ${CONFIG_BY_ID[k].label}` });
  // Requested documents (live-scope cases): each mandatory one, in the section it sits in, after its questions. An
  // optional one (every rule asking for it lets the supplier leave it out) never blocks.
  const missingSlots = requestedDocuments(c, cfg).filter((x) => slotBlocks(c, x));
  const placed = new Set<string>();
  const slotsOf = (sectionId: string) => {
    placed.add(sectionId);
    return missingSlots.filter((x) => x.sectionId === sectionId).map(slotBlocker);
  };
  for (const sc of c.scope) {
    if (sc.applicability === "na") {
      if (sc.sectionId === "K5.1" && !c.justifications["FLD-5.1-002"] && !c.answers["FLD-5.1-002"]) {
        out.push({ sectionId: "K5.1", fieldId: "FLD-5.1-002", label: "Justification for waiving the microbiological test" });
      }
      continue;
    }
    if (sc.applicability !== "mandatory") {
      out.push(...slotsOf(sc.sectionId));
      continue;
    }
    for (const f of requiredFields(c, sc.sectionId, cfg)) {
      const v = c.answers[f.id];
      if (!fieldAnswered(c, f)) out.push({ sectionId: sc.sectionId, fieldId: f.id, label: f.label });
      else if (hasValue(v) && f.validate && f.validate(v!)) out.push({ sectionId: sc.sectionId, fieldId: f.id, label: `${f.label}: ${f.validate(v!)}` });
    }
    if (sc.sectionId === "K2.1") {
      if (c.components.length === 0) out.push({ sectionId: "K2.1", label: "At least one component in the composition table" });
      else out.push(...compositionBlockers(c));
    }
    // A documents-only section whose version requires the upload: a file in the section, or a "Cannot provide" reason.
    if (sectionUploadRequired(c, sc.sectionId, cfg) && sectionUploadStatus(c, sc.sectionId) === "missing") out.push({ sectionId: sc.sectionId, fieldId: sectionUploadKey(sc.sectionId), label: sectionUploadName(c, sc.sectionId, cfg) });
    out.push(...slotsOf(sc.sectionId));
  }
  // A kept slot whose section is not in the scope list any more (never expected): still listed, never lost.
  for (const x of missingSlots) if (!placed.has(x.sectionId)) out.push(slotBlocker(x));
  return out;
}

export const openPointsOf = (c: CiqCase, dept?: ReviewDept) => c.openPoints.filter((p) => (!dept || p.dept === dept));
export const unresolved = (p: OpenPoint) => p.status !== "closed";
/** A point withdrawn because RMM cancelled the case (cancelCase), not closed by its raiser. */
export const closedByCancellation = (p: Pick<OpenPoint, "outcome" | "closeReason">) => p.outcome === "withdrawn" && !!p.closeReason?.startsWith("Case cancelled");

export function isOverdue(due: string, at = nowIso()): boolean {
  return Date.parse(due) < Date.parse(at);
}

/**
 * Everything that blocks a review track's completion (REQ-PROC-036): the track's own open points, and for Safety and
 * Regulatory their Approved / Rejected decision. The RMES itself never blocks (a read-only sheet since BDF's e-mail of
 * 28 Oct; criteria or findings on a legacy record are ignored). For RMM the undefined-origin flag (rmmFlags) is
 * informational and never blocks.
 */
export function reviewBlockers(c: CiqCase, dept: ReviewDept): string[] {
  const out: string[] = [];
  for (const p of c.openPoints.filter((x) => x.dept === dept && unresolved(x))) {
    out.push(`${p.id} · ${p.kind.replace("-", " ")} on ${p.ref.label} (${p.status === "open" ? "waiting for the supplier" : "answered, waiting for a decision"})`);
  }
  if (dept === "SAF" || dept === "REG") {
    const tr = c.reviews.find((r) => r.dept === dept);
    if (tr && !tr.decision) out.push(`Final ${DEPT_SHORT[dept]} decision (Approved / Rejected) not yet recorded`);
  }
  return out;
}

/**
 * Departments that get a review track: the LEAD department of every active section (OP-18: the lead decides;
 * co-reviewers read and may raise points through the lead).
 */
export function departmentsForScope(scope: ScopeItem[], ownership: AppState["ownership"]): ReviewDept[] {
  // RMM's whole-CIQ track is added by confirmCompleteness; RMM-led sections (GEN, K2.3) do not create a second one.
  const set = new Set<ReviewDept>();
  for (const sc of scope) {
    if (sc.applicability === "na") continue;
    const lead = (ownership[sc.sectionId]?.lead ?? sectionOf(sc.sectionId)?.lead) as Dept;
    if ((REVIEW_DEPTS as Dept[]).includes(lead)) set.add(lead as ReviewDept);
  }
  return REVIEW_DEPTS.filter((d) => set.has(d));
}

/** The review track that answers for a section: its lead department if that is one of REVIEW_DEPTS, else RMM. */
export function reviewDeptOf(ownership: AppState["ownership"], sectionId: string): ReviewDept {
  const lead = (ownership[sectionId]?.lead ?? sectionOf(sectionId)?.lead) as Dept;
  return (REVIEW_DEPTS as Dept[]).includes(lead) ? (lead as ReviewDept) : "RMM";
}

/**
 * Flags shown in RMM's Part 2 review. Today: an origin without rules (waste, CCU, chemical recycling; OP-19), whose
 * supplier got the standard sections only. Derived, so it follows SF-01 changes. Informational: it never blocks.
 */
export function rmmFlags(c: CiqCase): string[] {
  const o = undefinedOrigins(c.config);
  return o.length ? [`Origin without rules: ${o.map((x) => ORIGIN_LABEL[x]).join(", ")}. The supplier got the standard sections only; check whether more is needed and ask the supplier if so.`] : [];
}

export function sectionsOwnedBy(c: CiqCase, dept: Dept, ownership: AppState["ownership"]): string[] {
  return c.scope
    .filter((s) => s.applicability !== "na")
    .map((s) => s.sectionId)
    .filter((id) => {
      const o = ownership[id] ?? { lead: sectionOf(id)?.lead, co: sectionOf(id)?.co ?? [] };
      return o.lead === dept || o.co.includes(dept);
    });
}

export function userById(state: AppState, id: string): User | undefined {
  return state.users.find((u) => u.id === id);
}
export const userName = (state: AppState, id: string) => (id === "system" ? "System" : userById(state, id)?.name ?? id);
export const supplierName = (state: AppState, id: string) => state.suppliers.find((s) => s.id === id)?.name ?? id;

export interface SupplierTask {
  caseId: string;
  kind: "metadata" | "questionnaire" | "query" | "final-release";
  title: string;
  detail: string;
  due: string;
  openPointId?: string;
}

/**
 * The supplier's to-do list across its cases (REQ-PROC-030: one task per request). With `contactId`, only the cases
 * that contact is named on (legacy live-portal cases without liveScope count for every contact of the supplier).
 */
export function supplierTasks(state: AppState, supplierId: string, contactId?: string): SupplierTask[] {
  const tasks: SupplierTask[] = [];
  for (const c of state.cases.filter((x) => x.supplierId === supplierId && (!contactId || !x.liveScope || x.supplierContactIds.includes(contactId)))) {
    // 'metadata' only comes from the live portal's old flow.
    if (c.phase === "metadata") tasks.push({ caseId: c.id, kind: "metadata", title: "Answer basic data and configuration questions", detail: c.materialName, due: c.dueDate });
    if (c.phase === "supplier-input") tasks.push({ caseId: c.id, kind: "questionnaire", title: c.liveScope ? "Fill in the CIQ and confirm completeness" : "Complete the questionnaire and upload evidence", detail: c.materialName, due: c.dueDate });
    if (c.phase === "final-release") tasks.push({ caseId: c.id, kind: "final-release", title: "Give the final release", detail: c.materialName, due: c.dueDate });
    if (c.phase === "review" || c.phase === "final-release")
      for (const p of c.openPoints.filter((x) => x.status === "open"))
        tasks.push({ caseId: c.id, kind: "query", title: p.kind === "document-request" ? "Provide a requested document" : p.kind === "additional-part" ? "Complete an additional section" : "Answer a question from Beiersdorf", detail: `${p.ref.label} — ${p.question}`, due: p.dueDate, openPointId: p.id });
  }
  return tasks.sort((a, b) => a.due.localeCompare(b.due));
}

/** Open cases with a track for `dept` (RMM: every case in Part 2; filter by assigneeId for "my" cases). */
export function reviewQueue(state: AppState, dept: ReviewDept): CiqCase[] {
  return state.cases.filter((c) => c.reviews.some((r) => r.dept === dept) && !isClosed(c));
}

/** A field's label; with the case's version (and config) its label in that version. A requested-document key gives
 *  "Requested document"; with the case, the document's name (requestedDocLabel). A section-upload key ("DOC:K3"):
 *  "Documents for K3 · …". */
export const fieldLabel = (id: string, templateVersion?: string, cfg?: ConfigState) =>
  fieldOf(id, templateVersion, cfg)?.label ?? (isSlotKey(id) ? "Requested document" : isSectionUploadKey(id) ? sectionUploadName({ templateVersion: templateVersion ?? "" }, uploadKeySection(id), cfg) : id);

/** Where a document or a justification sits: the field's label, or "Requested document: <name>" for a slot key. */
export const placeLabel = (c: CiqCase, id: string, cfg?: ConfigState) => (isSlotKey(id) ? `Requested document: ${slotName(c, id, cfg)}` : fieldLabel(id, c.templateVersion, cfg));

export function formatValue(v: AnswerValue | undefined): string {
  if (!hasValue(v)) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && v) return `${v.min ?? "?"}–${v.max ?? "?"} %`;
  return String(v);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9 Oct 2026" (spec §5); "—" for no date or an invalid one. */
export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "9 Oct 2026, 14:05"; "—" for no date or an invalid one. */
export function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fmtDate(iso)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Internal label of each open-point history entry. */
export const MESSAGE_ACTION_LABEL: Record<Message["action"], string> = {
  raised: "Raised",
  answered: "Answered",
  returned: "Returned to supplier",
  accepted: "Accepted",
  "cannot-provide": "Cannot provide (justified)",
  note: "Closed as not accepted",
  edited: "Changed by the raiser",
  // The entry's own text says why: "no answer needed" (the raiser) or "the request was withdrawn" (case cancelled).
  withdrawn: "Closed",
};

/** The same entries as the supplier reads them ("Beiersdorf asked …"); "note" is internal and never shown to suppliers. */
export const SUPPLIER_MESSAGE_TEXT: Record<Message["action"], string> = {
  raised: "asked",
  answered: "answered",
  returned: "asked for more information",
  accepted: "accepted the answer",
  "cannot-provide": "said this cannot be provided",
  note: "",
  edited: "changed the question",
  withdrawn: "closed the question: no answer needed",
};

// ---------------------------------------------------------------------------------- lifecycle views (spec §1)

/** A cancelled case can be reactivated within this many days. */
export const REACTIVATION_DAYS = 365;

/** Whether a cancelled case is still inside the reactivation window. */
export const canReactivate = (c: CiqCase, at = nowIso()) => c.phase === "cancelled" && !!c.cancelled && Date.parse(at) - Date.parse(c.cancelled.at) <= REACTIVATION_DAYS * DAY;

/** How a track reads on screen: on a cancelled case every unfinished review task has ended (spec §1.11). */
export type TrackView = ReviewTrack["status"] | "ended";
export const trackView = (c: Pick<CiqCase, "phase">, r: Pick<ReviewTrack, "status">): TrackView => (c.phase === "cancelled" && r.status !== "completed" ? "ended" : r.status);

/** The tracks whose internal Safety / Regulatory decision is Rejected (AS-02: the case is flagged for RMM). */
export const rejectedDepts = (c: CiqCase): ReviewDept[] => c.reviews.filter((r) => r.decision === "rejected").map((r) => r.dept);

/**
 * The Rejected decisions RMM has not yet answered with "Continue to final release". Non-empty means RMM's completion
 * needs that explicit choice (or RMM cancels the case).
 */
export function rejectionNeedsRmmChoice(c: CiqCase): ReviewDept[] {
  const covered = c.reviews.find((r) => r.dept === "RMM")?.continueAfterRejection?.depts ?? [];
  return rejectedDepts(c).filter((d) => !covered.includes(d));
}

export interface ReleaseBlocker {
  label: string;
  /** The supplier's wording where it differs (a requested document: no rule ids). */
  supplierLabel?: string;
  sectionId?: string;
  fieldId?: string;
  /** A K2.1 component row. */
  rowId?: string;
  opId?: string;
}

/**
 * Why the supplier's final release is refused right now (empty = it can be given): the request must be out (every
 * track completed), no open point may be unresolved, and nothing mandatory may be missing.
 */
/** Why the supplier cannot give the final release yet. Pass `s.config` from domain code (pure); screens may leave it out. */
export function releaseBlockers(c: CiqCase, cfg?: ConfigState): ReleaseBlocker[] {
  const out: ReleaseBlocker[] = [];
  if (c.phase !== "final-release") out.push({ label: "Beiersdorf has not finished its review yet." });
  for (const p of c.openPoints.filter(unresolved)) out.push({ label: `Open question on ${p.ref.label}`, sectionId: p.ref.sectionId, fieldId: p.ref.fieldId, opId: p.id });
  for (const b of completenessBlockers(c, cfg)) out.push({ label: `Missing: ${b.label}`, ...(b.supplierLabel ? { supplierLabel: `Missing: ${b.supplierLabel}` } : {}), sectionId: b.sectionId, fieldId: b.fieldId, ...(b.rowId ? { rowId: b.rowId } : {}) });
  return out;
}

/** Open cases of the same supplier with the same material number (the New case duplicate warning). */
export function duplicateOpenCases(state: AppState, supplierId: string, materialNo: string): CiqCase[] {
  const norm = (x: string) => x.replace(/[\s-]/g, "").toUpperCase();
  const m = norm(materialNo);
  if (!m || !supplierId) return [];
  return state.cases.filter((c) => !isClosed(c) && c.supplierId === supplierId && norm(c.materialNo) === m);
}

/** Every case a user may see: internal users see all; a supplier contact only those it is named on (spec §4). */
export function visibleCasesFor(state: AppState, userId: string): CiqCase[] {
  const u = userById(state, userId);
  if (!u) return [];
  if (u.side === "internal") return state.cases;
  if (u.active === false) return [];
  return state.cases.filter((c) => c.supplierId === u.supplierId && (!c.liveScope || c.supplierContactIds.includes(u.id)));
}

/** A supplier contact's tasks (only the cases it is named on; none once deactivated). */
export function tasksForContact(state: AppState, userId: string): SupplierTask[] {
  const u = userById(state, userId);
  if (!u?.supplierId || u.active === false) return [];
  return supplierTasks(state, u.supplierId, userId);
}

/** A reviewer's open review tasks: assigned tracks, not completed, in cases under review. */
export function reviewTasksFor(state: AppState, userId: string): { c: CiqCase; dept: ReviewDept }[] {
  const out: { c: CiqCase; dept: ReviewDept }[] = [];
  for (const c of state.cases) {
    if (c.phase !== "review") continue;
    for (const r of c.reviews) if (r.assigneeId === userId && r.status !== "completed") out.push({ c, dept: r.dept });
  }
  return out;
}

/**
 * The moment a track's "changed since your review" markers count from: its completion; for a reopened track the
 * completion the reopen undid (so the reviewer sees what changed since it last completed); else the completeness
 * confirmation.
 */
export function reviewSince(c: CiqCase, dept: ReviewDept): string | undefined {
  const tr = c.reviews.find((r) => r.dept === dept);
  if (tr?.completedAt) return tr.completedAt;
  if (tr?.lastCompletedAt) return tr.lastCompletedAt;
  return c.confirmations.filter((x) => x.type === "completeness").at(-1)?.at;
}

/** A section's owners (A-29): the admin's section-owner setting, else the section's own lead and co-reviewers. */
export function sectionOwners(s: Pick<AppState, "ownership" | "config">, sectionId: string): { lead?: Dept; co: Dept[] } {
  const own = s.ownership[sectionId];
  if (own) return own;
  const def = sectionOf(sectionId, undefined, s.config);
  return { lead: def?.lead, co: def?.co ?? [] };
}

/** True when the department leads or co-reviews the section (section owners decide, RMM included). */
export function ownsSection(s: Pick<AppState, "ownership" | "config">, dept: Dept, sectionId: string): boolean {
  const o = sectionOwners(s, sectionId);
  return o.lead === dept || o.co.includes(dept);
}

/**
 * Thomas, 15 Oct: once Beiersdorf has requested the final release, the supplier can change nothing in the questionnaire
 * (answers, metadata, K2.1 rows, justifications, uploads); giving the release stays possible. A reopened review takes
 * the case back to review and unlocks it. After the release or a cancellation it stays locked for good.
 */
export const questionnaireLocked = (c: Pick<CiqCase, "phase">) => c.phase === "final-release" || c.phase === "completed" || c.phase === "cancelled";

/**
 * Sections whose answers, rows, justifications or documents changed after `since` (metadata answers count as GEN,
 * unless `metadata: false`: they keep their own grow-only rule, B-28, and reopen no section owner).
 */
export function sectionsChangedSince(c: CiqCase, since?: string, cfg?: ConfigState, { metadata = true }: { metadata?: boolean } = {}): string[] {
  if (!since) return [];
  const t = Date.parse(since);
  const out = new Set<string>();
  for (const [key, v] of Object.entries(c.answeredBy)) {
    if (Date.parse(v.at) <= t) continue;
    if (key === "K2.1:components") out.add("K2.1");
    else if (/^SF\d\d$/.test(key) || BDF_SET_FIELDS.includes(key)) {
      // metadata answers, and the values Beiersdorf sets (B-05), which are no supplier change
      if (metadata) out.add("GEN");
    } else if (isSlotKey(key)) out.add(slotSection(c, key, cfg) ?? "GEN"); // a requested document's justification
    else if (isSectionUploadKey(key)) out.add(uploadKeySection(key)); // why a documents-only section has no upload
    else out.add(fieldOf(key, c.templateVersion, cfg)?.sectionId ?? (sectionOf(key, c.templateVersion, cfg) ? key : "GEN"));
  }
  for (const d of c.documents) if (Date.parse(d.uploadedAt) > t) out.add(docSectionId(c, d, cfg)); // a slot's file: its slot's section
  return [...out];
}

/** "Changed since your review" for one track. */
export const changedSectionsFor = (c: CiqCase, dept: ReviewDept, cfg?: ConfigState) => sectionsChangedSince(c, reviewSince(c, dept), cfg);

export function relDays(iso: string, from = nowIso()): string {
  const d = Math.round((Date.parse(iso) - Date.parse(from)) / DAY);
  if (d === 0) return "today";
  if (d > 0) return `in ${d} d`;
  return `${-d} d ago`;
}
