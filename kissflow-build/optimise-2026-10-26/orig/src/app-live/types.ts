// Shared interfaces of the live internal UI (app-live) for CIQ_Digital_A00, verbatim from DESIGN.md §3.2.
// Owner A. Every other app-live file imports these; change them here only together with DESIGN §3.2.

import type { KfData } from "@/portal/kf/sdk";
import type { RawItem } from "@/portal/data/raw";
import type { AppState, Dept, InternalPersonaId, Persona, ReviewDept, User, AuditEvent, LogEvent } from "@/domain/types";
import type { AppEnv } from "./env";
import type { HandoffCode } from "./shared/handoff";

export type ProcessKey = "case" | "review" | "op";
export type FormKey = "audit" | "note" | "rmesSAF" | "rmesREG" | "supplier" | "config" | "scopeRun";
export type FlowKey = ProcessKey | FormKey;

// ---- client (every SDK call the adapter makes)
export interface AppClient {
  accountId: string;
  /** kf.app._id; writes are refused unless it is APP_ID. */
  appId: string | undefined;
  /** The host of the Kissflow page around the frame (env.ts hookHostOf), which the hand-off URLs are built on; absent
   *  when none is acceptable (the URLs are relative paths, sent by kf.api). */
  hookHost?: string;
  /** getProcess(id).getAdminItems({pageNumber,pageSize:50}) paged (flow Admin only). */
  adminList(flow: ProcessKey): Promise<RawItem[]>;
  /** getAdminItem({instanceId}); fallback kf.api GET /process/2/{acc}/admin/{flow}/{id}?_application_id=APP_ID. */
  adminGet(flow: ProcessKey, id: string): Promise<RawItem>;
  /** getMyTasksItems({activityId,pageNumber,pageSize:50}) paged; rows keep _activity_instance_id. */
  myTasks(flow: ProcessKey, activityId: string): Promise<RawItem[]>;
  /** getMyItems({status:"all",pageNumber,pageSize:50}) paged. */
  myItems(flow: ProcessKey): Promise<RawItem[]>;
  /** getItem({instanceId, activityInstanceId}) → itemOrThrow. */
  getTask(flow: ProcessKey, id: string, act: string): Promise<RawItem>;
  /** Viewer probe [unverified]: kf.api GET /process/2/{acc}/{flow}/{id}?_application_id=APP_ID → itemOrThrow. */
  getById(flow: ProcessKey, id: string): Promise<RawItem>;
  /** createItem({data}) → {id: _id, act: _activity_instance_id} (Start step, held by the creator). */
  create(flow: ProcessKey, data: KfData): Promise<{ id: string; act: string }>;
  /** updateItem({instanceId, activityInstanceId, data}). */
  update(flow: ProcessKey, id: string, act: string, data: KfData): Promise<void>;
  /** submitItem({instanceId, activityInstanceId}) (the SDK adds comment ""). */
  submit(flow: ProcessKey, id: string, act: string): Promise<void>;
  /** discardItem({instanceId}) (an unsent Start draft). */
  discard(flow: ProcessKey, id: string): Promise<void>;
  /** getDataform(id).getItems({pageNumber,pageSize:50}) paged. */
  formList(flow: FormKey): Promise<RawItem[]>;
  /** getDataform(id).getItem({itemId}). */
  formGet(flow: FormKey, id: string): Promise<RawItem>;
  /** createItem({data}) then submitItem({itemId: draft._id}) → the NEW _id. Callers serialise (one draft per user per form). */
  formCreate(flow: FormKey, data: KfData): Promise<string>;
  /** updateItem({itemId, data}) (child rows via "Table::<model>" deltas). */
  formUpdate(flow: FormKey, id: string, data: KfData): Promise<void>;
  /** An https url: fetch(url,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},body:JSON.stringify(p)})
   *  (an opaque answer is "fetch"); only when fetch throws, kf.api(its path,{method:"POST",headers:{"Content-Type":
   *  "application/json"},body}) ("sdk"). Never both after a fetch that did not throw. A relative url
   *  ("/integration/2/…"): kf.api only ("sdk"). */
  postWebhook(url: string, payload: unknown): Promise<"sdk" | "fetch">;
}

// ---- reads
export type Rung = "admin" | "tasks" | "mine" | "byId" | "form" | "snapshot" | "skipped";
export interface ReadReport { flow: FlowKey; rung: Rung; ok: boolean; count: number; ms: number; error?: string;
  /** "mine" rung: the field names the My items rows carried (morning test R-1: what a live list row holds). */
  keys?: string[] }
export interface TaskRef { flow: ProcessKey; itemId: string; act: string; activityId: string }
export interface LiveSnapshot {
  loadedAt: string;
  /** Deduped by _id; full where a rung allowed it; `_activity_instance_id` kept on held tasks. */
  items: Record<ProcessKey, RawItem[]>;
  forms: Record<Exclude<FormKey, "scopeRun">, RawItem[]>;
  tasks: TaskRef[];
  /** Item ids of the case items this role could NOT read in full (banner). */
  unreadableCases: Record<string /* case item id */, string /* why */>;
  /** Review / open-point item ids kept as list rows only (no full read): the mapper fills their blanks from the
   *  latest audit snapshot of the object (a sparse row must not beat a richer snapshot). */
  sparse?: string[];
  reads: ReadReport[];
  warnings: string[];
  /** Flows this load could not read again, shown as an earlier load read them: flow → that load's `loadedAt`
   *  (load.ts keepUnread, APP-SAVING-GAPS gap 8). */
  kept?: Partial<Record<FlowKey, string>>;
  /** Form rows whose full read (their child tables) failed on this load, by form: the list row is all this load has. */
  unreadRows?: Partial<Record<Exclude<FormKey, "scopeRun">, string[]>>;
  /** Form rows shown with the child tables an earlier load read: row `_id` → that load's `loadedAt` (keepUnread). */
  keptRows?: Record<string, string>;
}

// ---- identity
export interface LiveRoleRef { id: string; name: string }
export interface Identity {
  kfUserId: string; name: string; email: string;
  roles: LiveRoleRef[];               // kf.user.AppRoles as sent
  personas: InternalPersonaId[];      // held CIQ personas in PERSONA_ORDER (matched by role id first, then name)
  caseAdmin: boolean; integration: boolean; unknownRoles: string[];
}
export interface Acting {
  personaId: InternalPersonaId;
  persona: Persona;                   // catalog persona with userId = me.id
  me: User;                           // id = kfUserId, or "u-admin"/"u-auditor"/"u-owner" for those personas
  roleId: string; dept?: Dept;
}

// ---- mapping
/** `itemId`: the CIQ Case item (from the item, or from the audit rows' Case_Item_Id when the role can't read it), the id
 *  every case hand-off sends. `portalRequestItemId` as read (informational: the integrations read it from the case). */
export interface CaseRef { caseId: string; itemId: string; cycleNo: number; supplierCode: string; portalRequestItemId?: string;
  releaseItemId?: string; readable: boolean; contacts: { id: string; name: string; email: string }[] }
export interface ReviewRef { caseId: string; dept: ReviewDept; itemId?: string; roundNo: number; reviewKey: string;
  act?: string; activityId?: string; modifiedAt?: string; live: boolean;
  /** The live item's `_status` as read (absent for a review known only from the history): ensureRelease's test. */
  itemStatus?: string }
export interface OpRef { caseId: string; opId: string; itemId?: string; act?: string; activityId?: string; roundNo: number;
  portalQueryItemId?: string; modifiedAt?: string; live: boolean }
export interface RmesRef { caseId: string; dept: "SAF" | "REG"; itemId: string; criteriaRows: Record<string, string>; findingRows: Record<string, string> }
export interface SupplierRef { supplierId: string; itemId: string; contactRows: Record<string /* user id */, string /* row _id */>;
  /** Its contact rows were not read on this load (the row's full read failed) and no earlier load's are shown
   *  (load.ts keepUnread): the keys they hold are unknown, so no contact is added (write/guards.ts). */
  contactsUnread?: true }
export interface ReleaseRow { itemId: string; key: string; ruleSetVersion: string; templateVersion: string; state: "Draft" | "Published" | "Retired"; raw: RawItem }
export interface LiveIndex {
  cases: Map<string, CaseRef>;                 // case code →
  reviews: Map<string, ReviewRef>;             // `${caseId}|${dept}` → latest round
  ops: Map<string, OpRef>;                     // OP_Key →
  rmes: Map<string, RmesRef>;                  // `${caseId}|${dept}` →
  suppliers: Map<string, SupplierRef>;
  releases: ReleaseRow[];
  settings: Record<string, unknown>;           // SET:current Payload_JSON
  caseBanners: Map<string, string>;            // case code → why the answers are missing
  /** case code → its configuration pin problem only (the shell's warning banner on the case pages). */
  casePins?: Map<string, string>;
  /** The user's own unsent Start drafts, as "<flow>|<key>" (review|<Review_Key>, op|<OP_Key>, case|<Case_Code>): the
   *  load-time effects count them as existing (load.ts viewOf), so a draft never gets a twin. "<flow>|*": an own draft
   *  whose key could not be read (only its My items row: no business field), which any create of the flow could twin
   *  (load.ts ownDraftHas). */
  ownDraftKeys?: Set<string>;
  /** Review items the user started that this load read only as list rows and that no history line places (no case,
   *  department or round: a live My items row carries none, 21 Oct): any case's review could be one of them, so the
   *  load-time effects wait while one could be what they would create or count (write/activation.ts). `dept`: the
   *  department whose step the item is at, if any. */
  unplacedReviews?: UnplacedReview[];
}
export interface UnplacedReview { itemId: string; status: string; dept?: ReviewDept }
/** `env`: production words an unknown history code "Other change" (absent: the raw code, as dev). */
export interface MapInput { snap: LiveSnapshot; identity: Identity; acting: Acting; env?: AppEnv }
/** `warnings`: what could not be read (data is missing); `notes`: how odd data was mapped (dev only, Diagnostics);
 *  `dropped`: the codes of cases left out because they could not be mapped. */
export interface Mapped { state: AppState; index: LiveIndex; warnings: string[]; notes: string[]; dropped: string[] }

// ---- writes
/** "sent": the POST was handed over (write/handoff.ts does not wait for it; a later failure goes to
 *  WriteCtx.onHandoffProblem). */
export interface HandoffStatus { code: HandoffCode; status: "sent" | "pending" | "failed"; detail?: string;
  /** The idempotencyKey the payload carried (a POST was attempted). */
  key?: string }
export interface WriteCtx { client: AppClient; identity: Identity; acting: Acting; index: LiveIndex;
  webhooks: Partial<Record<HandoffCode, string>>; now(): string; containerOk: boolean;
  /** Where the screen runs: production's toasts carry no raw cause (userText.ts); absent = dev. */
  env?: AppEnv;
  /** A hand-off POST failed after the action went on (the portal's onSyncProblem): `key` is its idempotencyKey. */
  onHandoffProblem?(code: HandoffCode, key: string, why: string): void;
  /** A mail POST failed after the action went on (write/mail.ts sendMail): `what` names the mail. */
  onMailProblem?(what: string, why: string): void }
export interface WriteResult { ok: boolean; message?: string; tone?: "success" | "info" | "warning" | "danger";
  handoffs: HandoffStatus[]; warnings: string[];
  /** The raw causes production's message and warnings put in plain words (the Writes log keeps them). */
  detail?: string;
  /** The items as Kissflow read them back after the job's own writes, in write order (a later entry of the same item is
   *  newer): what the store shows instead of reading everything again. */
  saved?: { flow: FlowKey; item: RawItem }[];
  /** The job's audit row as read back. */
  auditRow?: RawItem;
  /** The job moved a step (a create or submit; a cancellation) or handed over a hand-off whose integration writes the
   *  item back (op.round, op.edited): the store reads again. false: `saved` and `auditRow` are all that changed.
   *  Absent (not a writer's result): unknown. */
  moved?: boolean }
/** `next` is the pure domain action's result on `prev` (already accepted); the writer encodes it. */
export type Writer = (ctx: WriteCtx, prev: AppState, next: AppState, args: unknown[]) => Promise<WriteResult>;
export type WritableMethod = "createCase" | "raiseOpenPoint" | "reviewResponse" | "editOpenPoint" | "closeOpenPoint" |
  "recordCriterion" | "addFinding" | "closeFinding" | "findingToQuery" | "rmesDecision" | "completeReview" | "addInternalNote" |
  "reassignReview" | "reopenReview" | "cancelCase" | "addSupplier" | "updateSupplier" | "addContact" | "updateContact" | "setContactActive";
export type LiveWriters = Partial<Record<WritableMethod, Writer>>;   // a missing writer = "not available" toast

// ---- audit
export type AuditCode = "case.created" | "case.cancelled" | "case.reactivated" | "op.raised" | "op.round" | "op.edited" |
  "op.accepted" | "op.returned" | "op.notaccepted" | "op.closed" | "review.started" | "review.completed" | "review.reopened" |
  "review.reassigned" | "release.requested" | "rmes.saved" | "note.added" | "supplier.changed" | "config.published";
export interface AuditInput {
  code: AuditCode; caseId?: string;
  object: { kind: string; key: string; itemId?: string; state?: string };
  ref?: { flow: FlowKey; itemId: string; act?: string };
  reason?: string;
  entries: AuditEvent[];               // the domain's NEW audit entries of this action (phrases kept)
  log?: LogEvent[];                    // the domain's NEW log entries (supplier/config)
  snapshot?: Record<string, unknown>;  // object state after the action (see §5.3)
  handoffs: HandoffStatus[];
}
