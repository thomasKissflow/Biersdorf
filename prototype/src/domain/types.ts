// Domain model for the CIQ (Cosmetic Ingredient Questionnaire) prototype.
// Mirrors our understanding of BDF's requirements: see context/analysis/01-expected-workflow.md
// and 02-modules-and-data-model.md. All data is synthetic; nothing talks to a backend.

/** Departments / organisational units. RMM = Raw Material Management (case owner). */
export type Dept = "RMM" | "REG" | "SAF" | "QM" | "MIC" | "SUS" | "CUS" | "LEG";

/**
 * Owner of a Part 2 review track (a "subprocess"). RMM reviews the whole CIQ in parallel with the departments and
 * completes its own review; the five departments review the sections they lead (REVIEW_DEPTS in catalog.ts).
 */
export type ReviewDept = "RMM" | "REG" | "SAF" | "QM" | "MIC" | "SUS";

/** Departments that are only informed / read-only (no review step is defined for them). */
export type InformedDept = "CUS" | "LEG";

export type Side = "internal" | "supplier";

export type Applicability = "mandatory" | "optional" | "na";

export type OriginType =
  | "vegetable"
  | "animal"
  | "mineral"
  | "petrochemical"
  | "polymer"
  | "waste"
  | "ccu"
  | "chemrec";

export type Market = "EU" | "UK" | "TR" | "CN" | "US" | "CA" | "OTHER";

/** Answers to the metadata (configuration) questions SF-01 … SF-12. The supplier answers them inside the CIQ and the
 *  scope follows them live; SF-11 (target markets) is set by RMM at case start. SF-02 (additional sites) and SF-08
 *  (palm) were dropped on 28 Oct (matrix v0.6: no rule used SF-02; FLD-A1-204 asks for palm); running cases may still
 *  store them (never shown: the screens list CONFIG_QUESTIONS). */
export interface ConfigAnswers {
  SF01?: OriginType[]; // origin types (union over components)
  SF03?: boolean; // polymer / REACH polymer definition
  SF04?: boolean; // UV filter
  SF05?: ("colorant" | "preservative")[]; // colorant and/or preservative
  SF06?: boolean; // fermentation / GMO involved
  SF07?: boolean; // mineral-oil based / hydrocarbon
  SF09?: boolean; // in EUDR scope
  SF10?: boolean; // Brazilian genetic heritage
  SF11?: Market[]; // target markets (set by RMM)
  SF12?: boolean; // microbiological testing required
}

export type ConfigQuestionId = keyof ConfigAnswers;

export type SectionKind = "basic" | "chapter" | "annex";

export interface SectionDef {
  id: string; // "K2.1", "A4", "GEN", "COMP"
  code: string; // display code, e.g. "K2.1" or "Annex 4"
  title: string;
  kind: SectionKind;
  meaning: string;
  lead: Dept;
  co: Dept[];
  /** Human-readable trigger, e.g. "Always" or "SF-07 = Yes". */
  trigger: string;
  /** True when the section has questions (fields). The opposite of `documentsOnly`; kept for the existing screens. */
  hasFields: boolean;
  /** "Documents only": no questions, the supplier uploads documents for the section (spec §8.1). */
  documentsOnly: boolean;
  /** Retired in this questionnaire version: new cases on the version never get it. Sections are never deleted. */
  retired?: boolean;
}

export type FieldType =
  | "text"
  | "email"
  | "number"
  | "decimal"
  | "range" // min–max %
  | "yesno"
  | "single"
  | "multi"
  | "file"
  | "longtext";

export type Requiredness = "mandatory" | "optional" | "conditional";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  id: string; // FLM field id, e.g. "FLD-A1-201"
  sectionId: string;
  label: string;
  type: FieldType;
  required: Requiredness;
  options?: FieldOption[];
  unit?: string;
  help?: string;
  /** Visible only when this returns true (conditional mandatory = mandatory if visible). */
  showWhen?: (answers: Answers, config: ConfigAnswers) => boolean;
  /** Only on live-scope cases (the app's flow); the live portal's old flow never shows the field. */
  liveOnly?: boolean;
  /** Returns an error message or null. Only called when a value is present. */
  validate?: (value: AnswerValue) => string | null;
  // Code-side properties (like showWhen and validate, never part of the stored questionnaire data, FieldData):
  /** A controller of a matrix chain (Yes → upload, No → reason): it is answered, never justified ("Cannot provide"). */
  noJustification?: true;
  /** A read-only copy of another field's answer (that field's id): never stored and never required itself. */
  derivedFrom?: string;
  /** The value the field is pre-filled with when its section opens and the field is still empty (undefined: none). */
  prefill?: (c: Pick<CiqCase, "inci" | "components">) => AnswerValue | undefined;
  /** A soft warning on the answer (a hint only: it never blocks), or null. */
  hint?: (value: AnswerValue, c: Pick<CiqCase, "components">) => string | null;
  /** Department whose review owns this field (FLM "Approval" column, reconciled). */
  owner: Dept;
  /** Source reference for traceability, e.g. "FLM r45". */
  source: string;
}

export type AnswerValue =
  | string
  | number
  | boolean
  | string[]
  | { min: number | null; max: number | null }
  | null;

export type Answers = Record<string, AnswerValue>;

/** One component of the K2.1 table. Stored as typed (autosave of partial input): a blank concentration is null (never
 *  0), an unanswered additive question null (no default, L5). The checks are in composition.ts; the completeness check
 *  and the final release block an incomplete or invalid row. A legacy row may hold 0–0 (read as missing) or the old
 *  checkbox's false (read as No). */
export interface ComponentRow {
  id: string; // stable row id, e.g. "c1"
  inci: string; // INCI (European), else the IUPAC name
  cas?: string;
  ec?: string; // EC number, or a REACH registration number
  fn: string; // function, e.g. "emollient"
  additive: boolean | null;
  origin: OriginType;
  concMin: number | null;
  concMax: number | null;
}

/**
 * The declarative condition of a rule (spec §8.1). One evaluator (evaluateCondition, conditions.ts) turns it into a
 * check, one text builder (conditionText) into a plain sentence such as "Origin includes Vegetable".
 * - includes-any / any-except: the multi-choice questions SF-01, SF-05 and SF-11;
 * - is / yes-or-unanswered: the yes/no questions.
 */
export type RuleCondition =
  | { kind: "always" }
  | { kind: "includes-any"; question: ConfigQuestionId; values: string[] }
  | { kind: "is"; question: ConfigQuestionId; value: boolean }
  | { kind: "yes-or-unanswered"; question: ConfigQuestionId }
  | { kind: "any-except"; question: ConfigQuestionId; values: string[] };

export type RuleConditionKind = RuleCondition["kind"];

/** Where a rule comes from: the requirements document, agreed with Beiersdorf (AS-05, AS-09), not stated in the
 *  requirements (applied to every case), or still without a trigger. */
export type RuleBasis = "document" | "agreed" | "not-stated" | "open";

/** A rule as data (stored in AppState.config, JSON-safe). Spec §8.1. */
export interface RuleData {
  id: string; // "R-10"
  /** The question of the condition ("ALWAYS" for an always-condition); kept in step with `condition`. */
  question: ConfigQuestionId | "ALWAYS";
  condition: RuleCondition;
  activates: string[]; // section ids
  outcome: Applicability; // usually "mandatory"
  evidence?: string[];
  departments: Dept[];
  basis: RuleBasis;
  note?: string;
  /** The rule opens no section: it flags the case in RMM's review (origins without rules, AS-09). */
  flagsCase?: boolean;
}

/** A rule as the engine and the screens use it: the data plus the check and the sentence derived from `condition`. */
export interface Rule extends RuleData {
  /** evaluateCondition(condition, answers). */
  when: (c: ConfigAnswers) => boolean;
  /** conditionText(condition), e.g. "Origin includes Vegetable" or "Any target market outside the EU". */
  text: string;
}

/** A rule set as stored (data). */
export interface RuleSetData {
  version: string; // "RS-2026.3"
  rules: RuleData[];
}

export interface RuleSet {
  version: string; // "RS-2026.1"
  /** draft: being edited; published: the newest published one, used for new cases; superseded: an older published
   *  one, kept by the running cases that started with it. */
  status: "published" | "draft" | "superseded";
  /** The questionnaire version released together with this rule set (the pair). */
  templateVersion: string;
  publishedAt?: string;
  publishedBy?: string;
  changeNote: string;
  rules: Rule[];
}

export interface ScopeItem {
  sectionId: string;
  applicability: Applicability;
  firedRules: string[]; // rule ids that set this outcome
  reason: string; // e.g. "SF-01 = Vegetable → R-10"
  manual?: { by: string; at: string; justification: string };
  /** Activated after the completeness confirmation: by a Part 2 extension (REQ-ADR-002) or by a changed metadata
   *  answer (the scope only grows, REQ-CFG-008). */
  addedLater?: boolean;
}

export type Phase =
  /** Part 1, ONE supplier step: metadata questions (sections open and close live), fill in, upload, confirm completeness (gate). */
  | "supplier-input"
  /** Part 2: RMM and the activated departments review in parallel, with the direct query loop. */
  | "review"
  /** RMM and every activated department completed: one request for the supplier's final release. */
  | "final-release"
  /** Frozen, completed automatically, final PDF to RMM. */
  | "completed"
  | "cancelled"
  /** @deprecated Legacy: produced only by the live portal's mapping of the old backend (separate basic-data step).
   *  The prototype store never sets it. */
  | "metadata"
  /** @deprecated Legacy: produced only by the live portal's mapping of the old backend (RMM scope check before the
   *  sections are released). The prototype store never sets it. */
  | "scope-check";

export type DocKind = "SDS" | "CoA" | "Specification" | "Analysis" | "Certificate" | "Statement" | "Other";

export interface DocumentRef {
  id: string;
  name: string;
  kind: DocKind;
  sectionId: string;
  fieldId?: string;
  /** @deprecated Documents are referenced by file name and upload date (BRM v2 REQ-PROC-016); never shown. */
  version: number;
  uploadedBy: string; // user id
  uploadedAt: string; // ISO
  sizeKb: number;
}

export type TrackStatus = "not-started" | "in-review" | "waiting-supplier" | "completed" | "reopened";

export interface ReviewTrack {
  dept: ReviewDept;
  status: TrackStatus;
  assigneeId: string;
  startedAt?: string;
  completedAt?: string;
  /** The completion a reopen undid (a reviewer's own reopen, a late activation, or the supplier changing a section this
   *  department owns, Thomas 15 Oct): the "changed since your review" markers keep counting from it. */
  lastCompletedAt?: string;
  /** Only Safety and Regulatory record their internal RMES decision when completing (REQ-RMES-013). */
  decision?: "approved" | "rejected";
  decisionReason?: string;
  /** RMM track only: RMM's explicit choice to continue to the final release despite a Rejected decision (AS-02). */
  continueAfterRejection?: { note: string; by: string; at: string; depts: ReviewDept[] };
}

export type OpenPointKind = "query" | "document-request" | "additional-part" | "finding";
export type OpenPointStatus = "open" | "in-progress" | "closed";

export interface ObjectRef {
  sectionId: string;
  fieldId?: string;
  rowId?: string;
  documentId?: string;
  label: string; // e.g. "K2.1 › component 3 › CAS number"
}

/**
 * One entry of an open point's history. Every entry except "note" is visible to the supplier (the portal API sync
 * would show it there too). "note" carries an internal reason (closed as not accepted) and is never shown to suppliers.
 */
export interface Message {
  id: string;
  at: string;
  by: string; // user id
  side: Side;
  /** Supplier-visible text. For "edited" it describes the change; for "withdrawn" it is the neutral closing line. */
  text: string;
  action: "raised" | "answered" | "returned" | "accepted" | "cannot-provide" | "note" | "edited" | "withdrawn";
  documentId?: string;
  /** True when this entry sent the point back to the supplier as a new round (a return, or an edited question). */
  newRound?: boolean;
}

/** One change the raiser made to an open point (AS-08). Old and new values as display text. */
export interface OpenPointEdit {
  at: string;
  by: string;
  field: "question" | "justification" | "dueDate" | "responsibleId";
  from: string;
  to: string;
}

export interface OpenPoint {
  id: string; // "OP-0142-03"
  caseId: string;
  /** The review track that raised it (RMM's included); it blocks that track's completion. */
  dept: ReviewDept;
  kind: OpenPointKind;
  ref: ObjectRef;
  question: string;
  justification: string;
  responsibleId: string; // BDF user who owns it
  dueDate: string; // ISO date
  status: OpenPointStatus;
  outcome?: "accepted" | "not-accepted" | "withdrawn";
  createdAt: string;
  createdBy: string;
  rounds: number; // how many times it went to the supplier
  thread: Message[];
  /** Changes by the raiser (question, justification, due date, responsible), oldest first. */
  edits?: OpenPointEdit[];
  /** Set when the point is closed (accepted, not accepted or withdrawn). */
  closedAt?: string;
  closedBy?: string;
  /** Internal reason of a withdrawal by the raiser. Never shown to the supplier, in mails or in the final document. */
  closeReason?: string;
}

export type RmesResult = "available" | "plausible" | "listed" | "not-listed" | "negative" | "implausible" | "na";

export interface LimitCheck {
  substance: string;
  value: number;
  unit: string;
  limit: number;
  limitSetVersion: string;
  pass: boolean;
}

export interface RmesCriterion {
  id: string;
  part: "A" | "B" | "C" | "D";
  dept: "SAF" | "REG";
  title: string;
  source: { sectionId: string; fieldId?: string; documentId?: string; version: number; label: string };
  result?: RmesResult;
  comment?: string;
  by?: string;
  at?: string;
  limit?: LimitCheck;
  aiSuggestion?: string; // marked AI, confirm or discard (REQ-PROC-024)
}

export interface Finding {
  id: string;
  criterionId: string;
  dept: "SAF" | "REG";
  text: string;
  blocking: boolean;
  status: "open" | "closed";
  openPointId?: string;
}

export interface RmesRecord {
  createdAt: string;
  /** @deprecated There is no review version (BRM v2 REQ-PROC-016): kept for data compatibility, never shown. */
  reviewVersion: number;
  criteria: RmesCriterion[];
  findings: Finding[];
}

/** "dept-completion" covers every review track, RMM's included (Confirmation.dept says whose). */
export type ConfirmationType = "completeness" | "dept-completion" | "final-release" | "cancellation";

export interface Confirmation {
  type: ConfirmationType;
  by: string; // user id
  name: string;
  email: string;
  role: string;
  at: string;
  dept?: Dept;
  /** @deprecated There is no review version (BRM v2 REQ-PROC-016): kept for data compatibility, never shown. */
  reviewVersion: number;
  note?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  by: string; // user id or "system"
  action: string; // short verb phrase, e.g. "Raised query"
  detail: string;
  sectionId?: string;
  /** @deprecated No review version (BRM v2 REQ-PROC-016); never shown. */
  version?: number;
}

export interface PhaseStamp {
  phase: Phase;
  at: string;
}

export interface CiqCase {
  id: string; // "CIQ-2026-0142"
  materialName: string; // trade name
  inci: string; // main INCI
  materialNo: string; // BDF material / Teamcenter reference
  supplierId: string;
  manufacturer: string;
  site: string;
  supplierContactIds: string[];
  ownerId: string; // RMM owner
  createdAt: string;
  dueDate: string;
  phase: Phase;
  templateVersion: string;
  ruleSetVersion: string;
  config: ConfigAnswers;
  scope: ScopeItem[];
  answers: Answers;
  /** who last changed each answer (REQ-CTL-001 attribution) */
  answeredBy: Record<string, { by: string; at: string }>;
  components: ComponentRow[];
  justifications: Record<string, string>; // key = field id or section id
  documents: DocumentRef[];
  reviews: ReviewTrack[];
  informed: InformedDept[];
  openPoints: OpenPoint[];
  rmes?: RmesRecord;
  confirmations: Confirmation[];
  audit: AuditEvent[];
  /** @deprecated There is no review version (BRM v2 REQ-PROC-016). Counts the completeness confirmations; never shown. */
  reviewVersion: number;
  phaseHistory: PhaseStamp[];
  /** Set while the case is cancelled; fromPhase is the phase a reactivation returns to. */
  cancelled?: { by: string; at: string; reason: string; fromPhase?: Phase };
  priority: "normal" | "high";
  /** BDF-only discussion (REQ-PROC-020); never visible to suppliers. */
  internalNotes: InternalNote[];
  /**
   * The scope follows the supplier's metadata answers live (the questionnaire carries SF-01…SF-12), and the
   * completeness gate also requires them. Set by createCase. Absent on cases mapped from the live portal, which
   * keeps the old flow (separate basic-data step; the sections arrive with Beiersdorf's release).
   */
  liveScope?: boolean;
  /** Generated once with the final release (AS-12, R-2); immutable. Internal only. */
  finalDocument?: FinalDocument;
  /**
   * The requested-document slots fixed at the completeness confirmation (requestedDocs.ts); after it they only grow,
   * like the scope. Absent before the confirmation (the slots then follow the answers live) and when there are none.
   */
  requestedDocs?: RequestedDocSlot[];
}

/**
 * A "requested document" (spec §8.5): evidence a fired rule asks for that no question of the case's questionnaire
 * collects, so the supplier gets an upload slot for it in a section. Uploads (DocumentRef.fieldId) and a cannot-provide
 * justification (CiqCase.justifications) attach to its `key`. In Kissflow: one row of the "Requested documents" child
 * table on the case item (Document name, Attachment, Uploaded by, Uploaded at, Cannot provide, Justification).
 */
export interface RequestedDocSlot {
  /** "EV:<slug of the document name>", stable for the case. */
  key: string;
  /** The document name as the rule asks for it, e.g. "Microplastics test report". */
  doc: string;
  /** Where the slot sits: the first live section the rule switches on, else K1 Mandatory documents. */
  sectionId: string;
  /** The fired rules that ask for it (internal; never shown to the supplier). */
  ruleIds: string[];
  /** Plain words for the supplier, e.g. "Asked for because the origin includes Animal". */
  why: string;
  /** The rules' conditions in plain words, for the internal views ("Origin includes Animal"). */
  conditions: string[];
  /** Asked for after the completeness confirmation (a changed metadata answer). */
  addedLater?: boolean;
  /** No longer derived from the answers, kept because the scope only grows after the completeness confirmation. */
  kept?: boolean;
}

// ---------------------------------------------------------------------------------- final document (AS-12, R-2)

export interface FinalDocAnswer {
  fieldId: string;
  label: string;
  value: string;
  /** Name of the contact who entered the answer, and when. */
  by?: string;
  at?: string;
  justification?: string;
}

export interface FinalDocSection {
  sectionId: string;
  code: string;
  title: string;
  applicability: Applicability;
  addedLater?: boolean;
  answers: FinalDocAnswer[];
  /** Section-level justification (e.g. the K5.1 waiver). */
  justification?: string;
}

/** One metadata answer (SF-01…SF-12) as released. */
export interface FinalDocMetadataAnswer {
  id: ConfigQuestionId;
  code: string;
  label: string;
  value: string;
  by?: string; // name
  at?: string;
  /** SF-11: set by Beiersdorf at case start, read-only for the supplier. */
  setByBdf?: boolean;
}

export interface FinalDocEvidence {
  /** The document id; for a requested document that was justified instead of uploaded, the slot key. */
  documentId: string;
  name: string;
  sectionId: string;
  sectionCode: string;
  fieldLabel?: string;
  /** Name of the uploader (of the justification, for a justified requested document). */
  uploadedBy: string;
  uploadedAt: string;
  /** Set for a requested document (spec §8.5): the document name the rules asked for. */
  requested?: string;
  /** A requested document that was not provided: the supplier's justification. */
  justification?: string;
}

export interface FinalDocThreadEntry {
  at: string;
  by: string; // name
  side: Side;
  action: Message["action"];
  text: string;
  /** Attachment by file name only, never embedded. */
  attachment?: string;
}

export interface FinalDocThread {
  opId: string;
  ref: string;
  kind: OpenPointKind;
  raisedBy: string; // name
  raisedAt: string;
  /** "Accepted", "Not accepted", "Closed, no answer needed" or "Open" (the last never happens after the release). */
  result: string;
  rounds: { n: number; entries: FinalDocThreadEntry[] }[];
}

export interface FinalDocConfirmation {
  type: ConfirmationType;
  label: string;
  name: string;
  email: string;
  role: string;
  at: string;
  note?: string;
}

/** The on-screen final document. No RMES decisions, findings or internal notes. */
export interface FinalDocument {
  id: string;
  caseId: string;
  generatedAt: string;
  /** What produced it, e.g. "Final release by Elena Márquez". */
  trigger: string;
  /** Deterministic hash of every other field; shown on screen, checked by verifyFinalDocument. */
  fingerprint: string;
  header: {
    caseId: string;
    materialName: string;
    inci: string;
    materialNo: string;
    supplierName: string;
    duns: string;
    manufacturer: string;
    site: string;
    markets: Market[];
    templateVersion: string;
    ruleSetVersion: string;
    ownerName: string;
    createdAt: string;
    releasedAt: string;
  };
  /** The metadata answers that set the scope (documents generated before this block existed have none). */
  metadata?: FinalDocMetadataAnswer[];
  sections: FinalDocSection[];
  components: ComponentRow[];
  evidence: FinalDocEvidence[];
  threads: FinalDocThread[];
  confirmations: FinalDocConfirmation[];
}

// ---------------------------------------------------------------------------------- mail (spec §2, R-1)

export type MailEvent =
  | "invitation"
  | "review-assigned"
  | "informed"
  | "op-raised"
  | "op-answered"
  | "op-returned"
  | "op-accepted"
  | "op-edited"
  | "op-closed"
  | "data-changed"
  | "release-requested"
  | "release-withdrawn"
  | "release-receipt"
  | "final-document"
  | "cancelled"
  | "reactivated"
  | "change-reported"
  | "reminder"
  | "escalation"
  | "note-mention";

/** open-point-webhook: R-1, every op-* event. task-notification: native Kissflow and portal task mails. final-document: AS-12. */
export type MailChannel = "open-point-webhook" | "task-notification" | "final-document";

/** A simulated e-mail. One object per event and audience; `to` are user ids. */
export interface Mail {
  id: string;
  at: string;
  to: string[];
  /** Who caused it (user id or "system"). */
  by: string;
  event: MailEvent;
  channel: MailChannel;
  /** "supplier" mails are built only from supplier-visible fields. */
  audience: "supplier" | "internal";
  subject: string;
  body: string;
  caseId?: string;
  opId?: string;
  sectionId?: string;
  /** In-app deep link (hash route), e.g. "/portal/case/CIQ-2026-0001?op=OP-0001-01". */
  link: string;
  readBy: string[];
  /** Idempotency key (reminders): a mail with the same key is never sent twice. */
  key?: string;
}

/** Global log of supplier-master and configuration changes (case events stay in CiqCase.audit). */
export interface LogEvent {
  id: string;
  at: string;
  by: string;
  kind: "supplier" | "config";
  action: string;
  detail: string;
  supplierId?: string;
}

/** "Report a change" after the release: the released case never changes; RMM may start a new case. */
export interface ChangeReport {
  id: string;
  caseId: string;
  at: string;
  by: string;
  text: string;
}

export interface InternalNote {
  id: string;
  at: string;
  by: string;
  dept?: Dept;
  /** Readable text; a mention stays in it as "@<name>" (e.g. "@Dr. Mira Hansen"). */
  text: string;
  sectionId?: string;
  /**
   * The internal users mentioned with @, as user ids in the order of their first mention (always set on a new note,
   * empty when nobody is mentioned; absent on notes saved before mentions existed). Each one except the writer got
   * one note-mention mail. Supplier contacts are never mentioned.
   */
  mentions?: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  side: Side;
  title: string;
  dept?: Dept;
  supplierId?: string;
  initials: string;
  /** Supplier contacts are deactivated, never deleted. Absent = active. */
  active?: boolean;
  /** When the contact was last deactivated (it gets no mail or task after it). */
  deactivatedAt?: string;
  /** May confirm completeness and give the final release. Absent = true. */
  mayConfirm?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  duns: string;
  country: string;
  type: "manufacturer" | "distributor";
  contactIds: string[];
  city?: string;
  /** Absent = active. An inactive supplier cannot be chosen for a new case. */
  active?: boolean;
  /** Live only (app-live/map/suppliersMap.ts): the Contacts_Key of every contact row the master holds for it. A new
   *  contact never takes one of them (suppliers.ts contactUser): a row keeps the key it was created with when its
   *  contact's id became its portal user. Absent in the prototype. */
  contactKeys?: string[];
}

/** The static Beiersdorf personas, one role holder each. */
export type InternalPersonaId = "rmm" | "reg" | "saf" | "qm" | "mic" | "sus" | "cus" | "leg" | "admin" | "auditor" | "owner";

/** A supplier persona is derived from an active supplier contact: "sup:<userId>". */
export type SupplierPersonaId = `sup:${string}`;

/** Legacy fixed supplier personas: "supplier" and "supplier2" resolve to the contacts u-sup-1 and u-sup-2. */
export type LegacySupplierPersonaId = "supplier" | "supplier2";

export type PersonaId = InternalPersonaId | SupplierPersonaId | LegacySupplierPersonaId;

export interface NavItem {
  to: string;
  label: string;
  icon: string; // lucide icon name, resolved in the shell
}

export interface Persona {
  id: PersonaId;
  label: string; // role name
  userId: string;
  side: Side;
  dept?: Dept;
  landing: string;
  description: string;
  nav: NavItem[];
  /** Pages the role may still open by address although they are hidden from its menu (e.g. Reminders, Thomas 15 Oct). */
  hiddenRoutes?: string[];
}

export interface TemplateVersion {
  version: string; // "CIQ-2026 v1"
  status: "published" | "draft";
  publishedAt?: string;
  publishedBy?: string;
  changeNote: string;
  sections: string[]; // section ids included
  casesUsing: number;
}

// ---------------------------------------------------------------------------------- configuration (spec §8)

/** A question (field) as data, inside a questionnaire version. Built-in fields keep their checks (showWhen, validate)
 *  by id; everything else comes from this data. */
export interface FieldData {
  id: string; // "FLD-K6.18-001"
  label: string;
  type: FieldType;
  /** The editor sets mandatory or optional; built-in fields may be "conditional" (mandatory when shown). */
  required: Requiredness;
  /** Choice types (single, multi) only. */
  options?: FieldOption[];
  /** Number and decimal only: the unit, or "" for explicitly none. */
  unit?: string;
  help?: string;
  owner: Dept;
}

/** A section as data, inside a questionnaire version (spec §8.1). */
export interface SectionData {
  id: string; // "K6.18", "A14"
  code: string; // "K6.18", "Annex 14"
  title: string;
  kind: SectionKind;
  /** "What does this section cover?" */
  meaning: string;
  lead: Dept;
  co: Dept[];
  documentsOnly: boolean;
  fields: FieldData[];
  /** Retired in this version: hidden for new cases on it; never deleted. */
  retired?: boolean;
  /** The trigger text of a built-in section ("Always", "SF-07 = Yes"); new sections are described by their rules. */
  trigger?: string;
}

/** A questionnaire version as data: its sections in order. */
export interface TemplateData {
  version: string; // "CIQ-2026 v3"
  sections: SectionData[];
}

/**
 * A configuration release (spec §8.1): rule set RS-2026.N plus questionnaire CIQ-2026 vN. At most one pair is a
 * draft; published pairs never change. The built-in first pair (RS-2026.1 + v1) is not stored.
 */
export interface ConfigPair {
  ruleSet: RuleSetData;
  template: TemplateData;
  status: "draft" | "published";
  /** The published pair the draft was copied from; the change summary compares against it. */
  basedOn: { ruleSetVersion: string; templateVersion: string };
  /** What the administrator wrote when creating the draft. */
  note: string;
  createdAt: string;
  createdBy: string;
  /** Required to publish; the prepared v2 draft comes with its own. */
  changeNote: string;
  publishedAt?: string;
  publishedBy?: string;
}

/** The admin-created configuration versions, oldest first (the draft, if any, is the last). */
export interface ConfigState {
  pairs: ConfigPair[];
}

export interface AppState {
  schema: number;
  personaId: PersonaId;
  cases: CiqCase[];
  users: User[];
  suppliers: Supplier[];
  /** The questionnaire versions as a list (kept in step with `config`; the version history is configVersions()). */
  templates: TemplateVersion[];
  /** The rule set new cases use: the newest published pair's (kept in step with `config`). */
  activeRuleSet: string;
  /** Admin-created configuration versions: the draft pair and later published pairs (spec §8.1). */
  config: ConfigState;
  ownership: Record<string, { lead: Dept; co: Dept[] }>; // section id → owners (REQ-CFG-006)
  reminders: ReminderSetting[];
  toasts: Toast[];
  /** Simulated e-mail, every person's inbox (spec §2). */
  mails: Mail[];
  /** Supplier-master and configuration changes. */
  log: LogEvent[];
  /** "Report a change" entries after a release. */
  changeReports: ChangeReport[];
}

export interface ReminderSetting {
  id: string;
  event: string;
  recipient: string;
  afterDays: number;
  escalateTo: string;
  escalateAfterDays: number;
  enabled: boolean;
}

export interface Toast {
  id: string;
  tone: "success" | "info" | "warning" | "danger";
  text: string;
  /** Set when a domain guard refused the action (the store then shows no success message). */
  refusal?: boolean;
}
