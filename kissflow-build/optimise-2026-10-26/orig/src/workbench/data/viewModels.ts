// View models: THE contract every feature (T1–T4) codes against (WORKBENCH-DESIGN.md §6.4, §12.2). map.ts is the only
// module that builds them from raw items. Every VM keeps `v` (every header field by id, as read) and `raw` (for
// Diagnostics), so a feature never needs a signature change to read one more field: use `vm.v[F.Case.X]`.
// Changing anything here goes through src/workbench/CHANGE-REQUESTS.md (§12).
import type { Dept, FlowId, StepIr } from "../schema";
import type { ListQuality, RawItem } from "./client";
import type { Clear } from "./normalize";

export type { ListQuality, RawItem };

export type ItemStatus = "draft" | "in-progress" | "completed" | "rejected" | "withdrawn" | "unknown";
/** full = a getItem/getAdminItem read; row = a list row (fields may be sparse); index = only from the F8 case index. */
export type ReadQuality = "full" | "row" | "index";
export interface UserRef {
  _id: string;
  name?: string;
}

/** What every hook returns (§6.5). On a failed reload the last good data stays and `error` is set. */
export interface Loaded<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  warnings: string[];
  reload(): void;
}

/** A list read with its quality (§6.2): which rung answered, and which rows came only from the F8 index. */
export interface ListRead<T> {
  rows: T[];
  quality: ListQuality;
  indexOnly: Set<string>;
  warnings: string[];
  /** True only when quality is "viewer" and Diagnostics proved that route live this session (WB-5). */
  viewerProven?: boolean;
}

export interface BaseVM {
  _id: string;
  flow: FlowId;
  status: ItemStatus;
  /** The raw `_status` text, when read. */
  statusText?: string;
  readQuality: ReadQuality;
  createdAt?: string;
  /** Every header field by id, as read (values untouched). */
  v: Readonly<Record<string, unknown>>;
  raw: RawItem;
}

export interface LaneVM {
  dept: Dept;
  active: boolean;
  confirm: string;
  completedBy: UserRef | null;
  completedByEmail: string;
  completedAt: string;
  onBehalfOf: string;
  openCount: number | null;
  /** Computed `<D>_Gate` as read (never written). */
  gate: string;
  /** SAF/REG only. */
  rmesDecision?: string;
  rmesDecisionReason?: string;
  rmesGaps?: number | null;
  /** `<D>_Review_Confirm` = "Confirmed" and `<D>_Completed_At` set (D35). */
  complete: boolean;
}

export interface ConfirmationVM {
  requestKey: string;
  dueDate: string;
  confirm: string;
  byName: string;
  byEmail: string;
  byRole: string;
  at: string;
}

export interface CaseVM extends BaseVM {
  flow: "CIQ_Case_A00";
  caseCode: string;
  cycleNo: number | null;
  title: string;
  tradeName: string;
  mainInci: string;
  bdfMaterialNo: string;
  sapMaterialNo: string;
  irmaRef: string;
  supplierCode: string;
  supplierLegalName: string;
  ownerRmm: UserRef | null;
  bdfContactName: string;
  bdfContactEmail: string;
  targetMarketsText: string;
  marketsLabel: string;
  originTypes: string;
  supplierDueDate: string;
  caseContactsJson: string;
  portalContactIds: string;
  confirmContactIds: string;
  supplierContactEmails: string;
  releaseItemId: string;
  releaseKey: string;
  manifestHash: string;
  ruleSetVersion: string;
  overallApprovalRequired: boolean;
  overallDecision: string;
  overallReason: string;
  overallDecidedBy: UserRef | null;
  completeness: ConfirmationVM;
  finalRelease: ConfirmationVM;
  rmesKey: string;
  openItemsCount: number | null;
  openCrCount: number | null;
  holdForOpenItems: string;
  openItemsGateRelease: string;
  openItemsGateClose: string;
  holdNote: string;
  lateCompletionsText: string;
  completionTrigger: string;
  isTest: boolean;
  reactivatesCaseItem: string;
  lanes: Record<Dept, LaneVM>;
  /** The item's position from a FULL read (or a held task); [] when unknown. May hold CASE_PAR (the block). */
  currentSteps: StepIr[];
  /** _status Rejected or Withdrawn (an F8 Cancellation row is the business record; brd L845-L855). */
  cancelled: boolean;
}

export interface RoundVM {
  _id: string;
  roundNo: number | null;
  questionText: string;
  responseKind: string;
  responseText: string;
  outcome: string;
  reason: string;
  docFileName: string;
  docUploadedAt: string;
  reviewedBy: UserRef | null;
  reviewedAt: string;
}

export interface PointVM extends BaseVM {
  flow: "CIQ_Open_Point_A00";
  opKey: string;
  roundNo: number | null;
  queryKey: string;
  caseCode: string;
  cycleNo: number | null;
  caseItemId: string;
  supplierCode: string;
  kind: string;
  dept: string;
  raisedByDept: string;
  toSupplier: boolean;
  refKind: string;
  refSectionKey: string;
  refFieldKey: string;
  refRowId: string;
  refLabel: string;
  refInternalKey: string;
  kindLabel: string;
  questionText: string;
  supplierJustification: string;
  internalJustification: string;
  responsibleUser: UserRef | null;
  responsibleName: string;
  responsibleDeptLabel: string;
  internalDueDate: string;
  supplierDueDate: string;
  portalContactIds: string;
  threadText: string;
  awaitingResponse: string;
  responseKind: string;
  responseText: string;
  responseDocRefsJson: string;
  progress: string;
  outcome: string;
  outcomeReason: string;
  returnReason: string;
  reviewedBy: UserRef | null;
  reviewedByEmail: string;
  reviewedAt: string;
  lateDecision: string;
  lateDecisionReason: string;
  onBehalfOf: string;
  /** Computed Open_Num as read (null when unreadable). */
  openNum: number | null;
  /** Computed Start_Gate as read. */
  startGate: string;
  rounds: RoundVM[];
  /** Current step from a full read or a held task; null when unknown. */
  step: StepIr | null;
}

export type CrDept = "REG" | "SAF" | "QM" | "MIC" | "SUS";
export interface CrImpactVM {
  impact: string;
  assessment: string;
  note: string;
  by: UserRef | null;
  at: string;
}
export interface CrVM extends BaseVM {
  flow: "CIQ_Change_Request_A00";
  crKey: string;
  caseCode: string;
  cycleNo: number | null;
  supplierCode: string;
  /** Set only at Triage (TK10): blank before. Use crBelongsTo(cr, case) to link. */
  caseItemId: string;
  changeKind: string;
  sectionKey: string;
  fieldKey: string;
  rowId: string;
  currentValueText: string;
  proposedValueJson: string;
  changeReason: string;
  portalCrItemId: string;
  contactVerified: string;
  outcome: string;
  triageNote: string;
  scopeRunKey: string;
  noticeKey: string;
  noticeKind: string;
  noticeTitle: string;
  supplierOutcomeText: string;
  portalContactIds: string;
  impacts: Record<CrDept, CrImpactVM>;
  /** Computed CR_Open_Num as read (null when unreadable). */
  crOpenNum: number | null;
  step: StepIr | null;
}

export interface ComponentRowVM {
  _id: string;
  rowId: string;
  inci: string;
  casNo: string;
  ecNo: string;
  fn: string;
  isAdditive: string;
  origin: string;
  concMin: number | null;
  concMax: number | null;
}
export interface SectionVM extends BaseVM {
  flow: "CIQ_Section_A00";
  sectionItemKey: string;
  caseCode: string;
  cycleNo: number | null;
  caseItemId: string;
  supplierCode: string;
  sectionKey: string;
  sectionCode: string;
  sectionTitle: string;
  sort: number | null;
  applicabilityLabel: string;
  addedLater: string;
  origin: string;
  definitionJson: string;
  definitionHash: string;
  supplierDueDate: string;
  leadDept: string;
  queryOwnerDept: string;
  coReviewDepts: string[];
  scopeRunKey: string;
  searchInci: string;
  searchCas: string;
  components: ComponentRowVM[];
}

export interface RunVM extends BaseVM {
  flow: "CIQ_Scope_Run_A00";
  runKey: string;
  caseCode: string;
  cycleNo: number | null;
  caseItemId: string;
  runNo: number | null;
  scopeTrigger: string;
  relatedKey: string;
  releaseItemId: string;
  ruleSetVersion: string;
  evaluatorVersion: string;
  resultJson: string;
  addedSectionKeys: string;
  leadDepartments: string;
  runBy: UserRef | null;
  runAt: string;
}

export interface CriterionVM {
  _id: string;
  code: string;
  part: string;
  title: string;
  applicable: string;
  result: string;
  comment: string;
  /** Computed Criteria_Open_Num as read back (null when blank: counted as open when applicable, §7.9). */
  openNum: number | null;
  impactResolution: string;
  recordedBy: UserRef | null;
  recordedAt: string;
  /** Every column as read. */
  v: Readonly<Record<string, unknown>>;
}
export interface FindingVM {
  _id: string;
  text: string;
  criterionCode: string;
  blocking: string;
  state: string;
  linkedOpKey: string;
}
export interface RmesVM extends BaseVM {
  flow: "CIQ_RMES_Safety_A00" | "CIQ_RMES_Regulatory_A00";
  dept: "SAF" | "REG";
  rmesKey: string;
  caseItemId: string;
  caseCode: string;
  cycleNo: number | null;
  openCriteriaCount: number | null;
  openBlockingFindingsCount: number | null;
  editingBy: string;
  editingSince: string;
  voided: boolean;
  criteria: CriterionVM[];
  findings: FindingVM[];
}

export interface NoteVM extends BaseVM {
  flow: "CIQ_Internal_Note_A00";
  noteKey: string;
  caseCode: string;
  cycleNo: number | null;
  caseItemId: string;
  linkedKind: string;
  linkedKey: string;
  text: string;
  author: UserRef | null;
  dept: string;
  at: string;
}

export interface AuditVM extends BaseVM {
  flow: "CIQ_Audit_Event_A00";
  eventKey: string;
  caseCode: string;
  cycleNo: number | null;
  caseItemId: string;
  at: string;
  category: string;
  actionCode: string;
  actorSide: string;
  actorName: string;
  actorEmail: string;
  actorDept: string;
  actorRoleId: string;
  onBehalfOf: string;
  objectKind: string;
  objectKey: string;
  objectItemId: string;
  oldValueText: string;
  newValueText: string;
  eventReason: string;
  notifyRecipient: string;
  snapshotJson: string;
  /** Snapshot_JSON parsed; null when blank or not JSON. */
  snapshot: unknown;
}

export interface ContactVM {
  _id: string;
  fullName: string;
  email: string;
  role: string;
  canConfirm: boolean;
  /** Typed by RMM as given by portal user management (Thomas). Never generated (§4.6). */
  portalUserId: string;
  active: boolean;
  inviteRequestedAt: string;
  invitedAt: string;
}
export interface SupplierVM extends BaseVM {
  flow: "CIQ_Supplier_A00";
  code: string;
  legalName: string;
  kind: string;
  countryCode: string;
  active: boolean;
  test: boolean;
  contactPortalIdsText: string;
  pendingInvites: number | null;
  contacts: ContactVM[];
}

export interface ConfigVM extends BaseVM {
  flow: "CIQ_Config_Version_A00";
  configKey: string;
  kind: string;
  versionLabel: string;
  state: string;
  sectionKey: string;
  sectionRev: number | null;
  payloadJson: string;
  annotationsJson: string;
  contentHash: string;
  evaluatorVersion: string;
  changeNote: string;
  publishedBy: UserRef | null;
  publishedAt: string;
  releaseKey: string;
  releaseLabel: string;
  releaseStage: string;
  releaseManifestJson: string;
  releaseBundleJson: string;
  manifestHash: string;
}

// ---------------------------------------------------------------- tasks

export type Evidence = "activity" | "block-unique" | "item" | null;
/** A task the user HOLDS (getMyTasksItems). Keyed `_id|_activity_instance_id` (WB-7). Step actions need one (rule 13). */
export interface TaskVM {
  key: string;
  flow: FlowId;
  instanceId: string;
  activityInstanceId: string;
  /** Resolved step; null = "Task at an unidentified step: open in Kissflow". Never a Parallel or End step. */
  step: StepIr | null;
  stepName: string | null;
  evidence: Evidence;
  caseItemId?: string;
  caseCode?: string;
  cycleNo?: number | null;
  title: string;
  due?: string;
  raw: RawItem;
}
export type TaskRef = Pick<TaskVM, "key" | "flow" | "instanceId" | "activityInstanceId" | "step" | "stepName" | "evidence"> & Partial<Pick<TaskVM, "caseCode" | "title">>;

// ---------------------------------------------------------------- writes

export type RowOp =
  | { kind: "add"; row: Record<string, unknown> }
  | { kind: "modify"; _id: string; row: Record<string, unknown>; key?: Record<string, unknown> }
  | { kind: "delete"; _id: string; key?: Record<string, unknown> };
export interface Patch {
  fields: Record<string, unknown | Clear>;
  /** By child table id (Rounds, Contacts, …). The write key is Table::<model id>. */
  tables?: Partial<Record<string, RowOp[]>>;
}

export type SaveResult =
  | { ok: true; kind: "ok"; attempts: number; item: RawItem }
  | { ok: false; kind: "not-kept"; missing: string[]; message: string }
  | { ok: false; kind: "kwb-refused"; fields: string[]; pending: Patch; message: string; stepMarked: boolean; skipped?: boolean }
  | { ok: false; kind: "refused"; message: string; fields?: string[]; code?: "wrong-container" | "uncertain" | "no-task" | "moved-out" | "last-save-failed" }
  | { ok: false; kind: "timeout"; message: string };

export interface Problem {
  field?: string;
  label: string;
  message: string;
}
/** An extra pre-submit check: returns the problems it finds on the fresh server read. */
export type Check = (fresh: RawItem) => Problem[];

export type SubmitResult =
  | {
      ok: true;
      kind: "submitted";
      notes: string[];
      /** Lane steps: the snapshot sent; laneDiff lists fields that changed after the submit (rung-1 re-read only). */
      laneSnapshot?: Record<string, unknown>;
      laneDiff?: string[];
      postCheck: "compared" | "not-readable" | "skipped";
      /** Amber: "lane snapshot not recorded". The submit already happened. */
      auditWarning?: string;
    }
  | { ok: false; kind: "problems"; problems: Problem[]; message: string }
  | { ok: false; kind: "no-task" | "uncertain" | "last-save-failed" | "refused" | "timeout" | "moved-out" | "wrong-container"; message: string };

export interface ActionResult {
  ok: boolean;
  message: string;
  /** e.g. "verified", "reject-failed", "fallback". */
  kind?: string;
  eventKey?: string;
  notes?: string[];
}

export interface ReturnInput {
  questionText: string;
  supplierJustification: string;
  supplierDueDate: string;
  internalDueDate: string;
  reason: string;
}

export interface AuditInput {
  category: string;
  actionCode: string;
  caseCode?: string;
  cycleNo?: number | null;
  caseItemId?: string;
  objectKind?: string;
  objectKey?: string;
  objectItemId?: string;
  objectState?: string;
  oldValueText?: string;
  newValueText?: string;
  eventReason?: string;
  notifyRecipient?: string;
  onBehalfOf?: string;
  configKeys?: string;
  sourceAnswersRev?: number;
  snapshot?: unknown;
  /** Defaults to the acting role's department. */
  actorDept?: string;
  actorRoleId?: string;
}

export interface Unread {
  flow: FlowId;
  rung: ListQuality | "index" | "item";
  reason: string;
  /** How many rows were visible on that read. */
  visible?: number;
}
