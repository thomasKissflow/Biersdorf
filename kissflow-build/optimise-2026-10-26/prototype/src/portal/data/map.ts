// Pure mapping, plan v5: live portal items → the prototype's domain objects, so the approved supplier screens render
// live data unchanged. One CIQP Request per case ("the CIQ") carries every answer; open CIQP Query rounds and
// (since 16 Oct) the request's own "give the final release" step are the supplier's other tasks; the question history comes from Questions_History_JSON.
// The ONLY module (with answers.ts, scope.ts and bundle.ts) that knows portal field ids. No I/O here.
//
// Cases map to the prototype's own flow (liveScope: true; phases supplier-input → review → final-release →
// completed / cancelled), resolved in the case's pinned configuration (bundle.ts, B-50).
import { MARKET_LABEL, fieldOf } from "@/domain/catalog";
import { deriveRequestedDocs } from "@/domain/requestedDocs";
import { BDF_SET_FIELDS, questionnaireLocked } from "@/domain/selectors";
import type { AnswerValue, Answers, ChangeReport, CiqCase, ComponentRow, Confirmation, ConfigAnswers, ConfigState, DocKind, DocumentRef, Market, Message, OpenPoint, OpenPointEdit, OpenPointKind, Phase, PhaseStamp, ReviewDept, Supplier, User } from "@/domain/types";
import { FILES_FIELD, STEPS, UPLOADS_TABLE, type FlowKey, type StepKey } from "../kf/portal";
import { COMPONENTS_KEY, isClosedRequest, isReopened, isWriteLocked, readDoc, type Stamp, type Who } from "./answers";
import { configOf, pinOf, type Pin } from "./bundle";
import { caseKeyOf, childRows, itemState, json, num, str, type RawItem } from "./raw";
import { liveScope, manualScope, partOfPhase, storedScope, storedSlots, type ManualScope } from "./scope";

export type RequestStep = "fill" | "keep" | "release" | "released";

/** A listed item: the flow, the item read in full, and the step(s) it was listed at (My tasks activity filter). */
export interface Loaded {
  flow: FlowKey;
  item: RawItem;
  listedAt?: StepKey[];
}

export interface CaseBundle {
  /** Case_Code|Cycle_No */
  key: string;
  code: string;
  request?: RawItem;
  /** The contact's step on the request; undefined when the request isn't one of its tasks. */
  step?: RequestStep;
  /** Open CIQP Query rounds (tasks at "Supplier: respond"). */
  queries: RawItem[];
  /** Open CIQP Final Release items (tasks at "Supplier: release"). */
  releases: RawItem[];
}

const DOC_KINDS: DocKind[] = ["SDS", "CoA", "Specification", "Analysis", "Certificate", "Statement", "Other"];
const byCreated = (a: RawItem, b: RawItem) => str(a, "_created_at").localeCompare(str(b, "_created_at"));
const cycleOf = (b: CaseBundle) => Number(b.key.split("|")[1]) || 1;

/** The step a request is at: its own step name when the read carries one, else where My tasks listed it, else
 *  whether completeness was confirmed (submitting "fill in the CIQ" is the confirmation). */
export function requestStepOf(item: RawItem, listedAt: StepKey[] = []): RequestStep {
  const ctx = Array.isArray(item._current_context) ? (item._current_context[0] as Record<string, unknown> | undefined) : undefined;
  const name = str(item, "_current_step") || str(ctx, "_context_current_step");
  const act = str(ctx, "_context_activity_id");
  if (name === STEPS.fill.name || act === STEPS.fill.activity) return "fill";
  if (name === STEPS.keep.name || act === STEPS.keep.activity) return "keep";
  if (name === STEPS.release.name || act === STEPS.release.activity) return "release";
  if (name === STEPS.released.name || act === STEPS.released.activity) return "released";
  const at = listedAt.filter((s) => s === "fill" || s === "keep" || s === "release" || s === "released");
  if (at.length === 1) return at[0] as RequestStep;
  return str(item, "Completeness_Confirm") === "Confirmed" ? "keep" : "fill";
}

/** One bundle per case, latest cycle only. Items without a Case_Code are ignored. */
export function groupBundles(loaded: Loaded[]): CaseBundle[] {
  const byKey = new Map<string, CaseBundle>();
  for (const { flow, item, listedAt } of loaded) {
    const code = str(item, "Case_Code");
    if (!code) continue;
    const key = caseKeyOf(item);
    const b = byKey.get(key) ?? { key, code, queries: [], releases: [] };
    byKey.set(key, b);
    if (flow === "request") {
      if (!b.request || byCreated(b.request, item) < 0) {
        b.request = item;
        b.step = requestStepOf(item, listedAt);
      }
    } else if (flow === "query") {
      if (!b.queries.some((x) => x._id === item._id)) b.queries.push(item);
    } else if (flow === "finalRelease") {
      if (!b.releases.some((x) => x._id === item._id)) b.releases.push(item);
    }
  }
  const latestCycle = new Map<string, CaseBundle>();
  for (const b of byKey.values()) {
    const cur = latestCycle.get(b.code);
    if (!cur || cycleOf(b) > cycleOf(cur)) latestCycle.set(b.code, b);
  }
  return [...latestCycle.values()];
}

// ------------------------------------------------------------------------------------------------ phase

/** Things this page did that the sync service has not written back yet (it runs about once a minute). */
export interface LocalNotes {
  /** Answers sent from this page: open-point id → the message, until the history shows a supplier entry after it. */
  answers: Map<string, Message>;
  /** Final releases given from this page, until the service locks the request: case id → the confirmation. */
  releases: Map<string, Confirmation>;
  /** Requests released from this page (16 Oct): the submit ends the request, so it is no longer one of the contact's
   *  tasks and a reload would drop it. Kept here, read-only and completed, until the page is closed. */
  released: Map<string, CaseBundle>;
  /** Requests this page moved at a release step itself (Thomas, 21 Oct; liveActions.ts moveAtReleaseSteps): item id →
   *  the step and activity instance it was submitted from, and why the move failed ("" when it went through). At most
   *  one move per task per page load; the mark ends once the request is listed at another step or task. */
  moves: Map<string, { step: StepKey; act: string; failed: string }>;
}
export const emptyNotes = (): LocalNotes => ({ answers: new Map(), releases: new Map(), released: new Map(), moves: new Map() });

/**
 * The prototype phase of a case. The request's step is the truth for Part 1 vs Part 2 (the supplier's own submit
 * moves it); the service's Case_Phase_Label and the release task tell review from the final release; Request_Locked
 * outside the final-release step closes it (completed or cancelled). Since Thomas, 15 Oct the service also locks the
 * request while the final release is requested ("Awaiting your final release"): that is still the final release.
 */
export function phaseOf(b: CaseBundle, local?: LocalNotes): Phase {
  const rq = b.request;
  const label = str(rq, "Case_Phase_Label").trim().toLowerCase();
  if (label === "cancelled") return "cancelled";
  if (label === "completed") return "completed";
  if (local?.releases.has(b.code)) return "completed";
  // the request at its own "give the final release" step (16 Oct): Kissflow's step is the truth
  if (b.step === "release") return "final-release";
  // after the release the request is held at "view the released CIQ" (20 Oct): completed, read-only
  if (b.step === "released") return "completed";
  const released = !!(str(rq, "Release_At") || str(rq, "Release_By_Name"));
  // a reopen (Release_Flag "Reopened", plan v6 D-10) wins over a release label left on the request
  const awaitingRelease = b.releases.some((x) => itemState(x) === "open") || (label.includes("final release") && !isReopened(rq));
  // an open release task (or the label) wins over the lock: the lock of the release step itself (Thomas, 15 Oct)
  if (isClosedRequest(rq) && (released || !awaitingRelease)) return released ? "completed" : "cancelled";
  if (b.step === "fill") return "supplier-input";
  if (awaitingRelease) return "final-release";
  return "review";
}

// ------------------------------------------------------------------------------------------------ people

/** A case contact as the service writes Case_Contacts_JSON ({id, name, email, title, mayConfirm}; plan v5 §3.1); the
 *  7 Oct shape ({name, role, canConfirm, email, portalUserId}) is read too. */
export interface CaseContact {
  id?: string;
  name: string;
  email?: string;
  role?: string;
  mayConfirm?: boolean;
}

export function caseContactsOf(rq: RawItem | undefined): CaseContact[] {
  const rows = json<unknown>(rq, "Case_Contacts_JSON", []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { name?: unknown }).name === "string")
    .map((r) => ({
      id: typeof r.id === "string" ? r.id : typeof r.portalUserId === "string" ? r.portalUserId : undefined,
      name: String(r.name),
      email: typeof r.email === "string" ? r.email : undefined,
      role: typeof r.title === "string" && r.title ? r.title : typeof r.role === "string" ? r.role : undefined,
      mayConfirm: r.mayConfirm === false || r.canConfirm === false ? false : r.mayConfirm === true || r.canConfirm === true ? true : undefined,
    }));
}

const lower = (s?: string) => (s ?? "").trim().toLowerCase();
/** How long a change report without its receipt counts as still being sent (plan v6 §4.1 change.received). */
export const REPORT_PENDING_MS = 10 * 60 * 1000;
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
/** "ben.two@example.com" → "Ben Two": a readable name when only an e-mail is known. */
const nameFromEmail = (email: string) =>
  email
    .split("@")[0]!
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ") || email;

/** Everyone the supplier screens name: the signed-in contact, its colleagues and the Beiersdorf people. */
class People {
  readonly users = new Map<string, User>();
  constructor(
    readonly me: Who,
    readonly supplierId: string,
  ) {}

  bdf(name: string | undefined, email = ""): string {
    const n = (name ?? "").trim() || "Beiersdorf";
    const id = `bdf:${n}`;
    const u = this.users.get(id);
    if (!u) this.users.set(id, { id, name: n, email, side: "internal", title: "Beiersdorf", initials: initialsOf(n) });
    else if (email && !u.email) u.email = email;
    return id;
  }

  /** A supplier contact; `mayConfirm` undefined keeps what is known. */
  contact(id: string, name: string, email = "", extra: { role?: string; mayConfirm?: boolean } = {}): string {
    const u = this.users.get(id);
    if (!u) {
      this.users.set(id, { id, name: name || nameFromEmail(email) || id, email, side: "supplier", title: extra.role || "Supplier contact", supplierId: this.supplierId, initials: initialsOf(name || email), ...(extra.mayConfirm === false ? { mayConfirm: false } : {}) });
    } else {
      if (email && !u.email) u.email = email;
      if (extra.role && u.title === "Supplier contact") u.title = extra.role;
      if (extra.mayConfirm === false) u.mayConfirm = false;
      if (extra.mayConfirm === true) delete u.mayConfirm;
    }
    return id;
  }

  find(x: { id?: string; email?: string; name?: string }): string | undefined {
    if (x.id && this.users.get(x.id)?.side === "supplier") return x.id;
    for (const u of this.users.values()) if (u.side === "supplier" && x.email && lower(u.email) === lower(x.email)) return u.id;
    for (const u of this.users.values()) if (u.side === "supplier" && x.name && u.name === x.name) return u.id;
    return undefined;
  }

  /** The supplier person behind a stamp (id, e-mail or name); a readable stand-in when unknown. */
  supplier(x: { id?: string; email?: string; name?: string }): string {
    const hit = this.find(x);
    if (hit) return hit;
    if (x.email) return this.contact(`mail:${lower(x.email)}`, x.name ?? "", x.email);
    if (x.name) return this.contact(`name:${x.name}`, x.name);
    return this.me.id;
  }
}

// ------------------------------------------------------------------------------------------------ the case

/** "EU, United Kingdom; CN" → ["EU", "UK", "CN"]. Codes or names; anything else counts as other markets. */
const MARKETS = Object.keys(MARKET_LABEL) as Market[];
export function parseMarkets(label: string): Market[] {
  const out: Market[] = [];
  for (const t of label.split(/[,;/|]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = MARKETS.find((k) => k === t.toUpperCase() || MARKET_LABEL[k].toLowerCase() === t.toLowerCase()) ?? "OTHER";
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

/** BDF_Set_JSON: the values Beiersdorf sets, shown locked (B-05). The header fields stand in while it is missing. */
function bdfSetOf(rq: RawItem | undefined): { answers: Answers; markets: Market[] } {
  const set = json<Record<string, unknown>>(rq, "BDF_Set_JSON", {});
  const answers: Answers = {};
  for (const k of BDF_SET_FIELDS) {
    const v = set?.[k];
    if (typeof v === "string" && v.trim()) answers[k] = v;
  }
  if (!answers["FLD-GEN-001"] && str(rq, "Trade_Name")) answers["FLD-GEN-001"] = str(rq, "Trade_Name");
  if (!answers["FLD-GEN-002"] && str(rq, "Supplier_Display_Name")) answers["FLD-GEN-002"] = str(rq, "Supplier_Display_Name");
  const sf11 = Array.isArray(set?.SF11) ? (set.SF11 as unknown[]).filter((m): m is Market => typeof m === "string" && (MARKETS as string[]).includes(m)) : [];
  return { answers, markets: sf11.length ? sf11 : parseMarkets(str(rq, "Markets_Label")) };
}

/** The Supplier_Files value (stored file metadata), by attachment id. */
export function attachmentsOf(rq: RawItem | undefined): Record<string, unknown>[] {
  const v = rq?.[FILES_FIELD];
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
}

/** Documents_JSON (plan v6 §4.2): the supplier's files for the app case, one entry per Uploads row that is not removed.
 *  Kept by the supplier's screen on every upload and removal; copied to the app case by the integrations. */
export function documentsJsonOf(rq: RawItem | undefined): string {
  return JSON.stringify(
    childRows(rq, UPLOADS_TABLE, "Upload_Id")
      .filter((r) => !str(r, "Upload_Removed_At"))
      .map((r) => ({ uploadId: str(r, "Upload_Id"), attachmentId: str(r, "Upload_Attachment_Id"), fileName: str(r, "Upload_File_Name"), docKind: str(r, "Upload_Doc_Kind"), sectionKey: str(r, "Upload_Section_Key"), fieldKey: str(r, "Upload_Field_Key") || undefined, rowId: str(r, "Upload_Row_Id") || undefined, uploadedByEmail: str(r, "Uploaded_By_Email"), uploadedAt: str(r, "Uploaded_At") })),
  );
}

/** One DocumentRef per Uploads row (the row is the file's place in the questionnaire; the file is in Supplier_Files). */
function toDocuments(rq: RawItem, people: People, templateVersion: string, cfg: ConfigState): DocumentRef[] {
  const files = new Map(attachmentsOf(rq).map((f) => [String(f.id ?? ""), f]));
  const out: DocumentRef[] = [];
  for (const r of childRows(rq, UPLOADS_TABLE, "Upload_Id")) {
    const id = str(r, "Upload_Id") || str(r, "_id");
    if (!id) continue;
    if (str(r, "Upload_Removed_At")) continue; // removed by the supplier (20 Oct, soft delete: the row stays for the audit)
    const file = files.get(str(r, "Upload_Attachment_Id"));
    const fieldId = str(r, "Upload_Field_Key") || undefined;
    const kind = str(r, "Upload_Doc_Kind") as DocKind;
    const email = str(r, "Uploaded_By_Email");
    out.push({
      id,
      name: str(r, "Upload_File_Name") || str(file, "name") || "Document",
      kind: DOC_KINDS.includes(kind) ? kind : "Other",
      sectionId: str(r, "Upload_Section_Key") || (fieldId ? fieldOf(fieldId, templateVersion, cfg)?.sectionId : undefined) || "GEN",
      fieldId,
      version: 1,
      uploadedBy: email ? people.supplier({ email }) : people.me.id,
      uploadedAt: str(r, "Uploaded_At") || str(rq, "_modified_at"),
      sizeKb: 0, // Kissflow's attachment size unit is not documented: the screens hide an unknown size
    });
  }
  return out.sort((x, y) => x.uploadedAt.localeCompare(y.uploadedAt));
}

/** Per-case facts the store and the actions need next to the CiqCase. */
export interface CaseExtra {
  caseId: string;
  requestId: string;
  step?: RequestStep;
  /** The supplier can change nothing: the final release is requested (Thomas, 15 Oct) or the request is closed. */
  locked: boolean;
  /** Closed for good (completed or cancelled): not even the final release can be given. */
  closed: boolean;
  phaseLabel: string;
  pin: Pin;
  /** Scope_JSON as stored (the base of the grow-only Part 2 scope). */
  stored: ReturnType<typeof storedScope>;
  manual: ManualScope[];
  /** Open-point id → the open CIQP Query of its current round (my task). */
  queryOf: Record<string, string>;
  /** My release task: the request itself at "give the final release", or an open CIQP Final Release (before 16 Oct). */
  releaseId?: string;
  /** Someone else saved here recently (Editing_By / Editing_Since, B-12). */
  editing?: { email: string; name: string; since: string };
  /** Change_Report_Rev written but its receipt not yet in Change_Reports_JSON. */
  reportPending: boolean;
  contacts: CaseContact[];
}

// ------------------------------------------------------------------------------------------------ questions

interface HistMsg {
  at?: string;
  side?: string;
  by?: string;
  action?: string;
  text?: string;
  document?: string;
  newRound?: boolean;
}
interface HistPoint {
  opId?: string;
  kind?: string;
  ref?: string;
  sectionId?: string;
  fieldId?: string;
  rowId?: string;
  question?: string;
  justification?: string;
  dueDate?: string;
  status?: string;
  /** Stable code written by the sync service (plan v5 §3.1): open · answered · accepted · not-accepted · closed · withdrawn-with-case. */
  statusCode?: string;
  rounds?: number;
  thread?: HistMsg[];
  edits?: { at?: string; field?: string; from?: string; to?: string }[];
}

const KIND_OF: Record<string, OpenPointKind> = { question: "query", query: "query", "document request": "document-request", "additional section": "additional-part", "additional section to complete": "additional-part", "additional part": "additional-part" };
const kindOf = (label?: string): OpenPointKind => KIND_OF[lower(label)] ?? "query";
const DEPT_OF: [string, ReviewDept][] = [["regulatory", "REG"], ["safety", "SAF"], ["quality", "QM"], ["qm", "QM"], ["micro", "MIC"], ["sustainab", "SUS"], ["raw material", "RMM"], ["rmm", "RMM"]];
const deptOf = (label: string): ReviewDept => DEPT_OF.find(([k]) => lower(label).includes(k))?.[1] ?? "RMM";
const ACTIONS = new Set<Message["action"]>(["raised", "answered", "returned", "accepted", "cannot-provide", "edited", "withdrawn"]);
const EDIT_FIELDS = new Set<OpenPointEdit["field"]>(["question", "justification", "dueDate", "responsibleId"]);

/** The open point a query round belongs to: Query_Key without its round suffix ("OP-0001-01-R2" → "OP-0001-01"). */
export const pointKeyOf = (q: RawItem): string => (str(q, "Query_Key") || q._id).replace(/[-|]R\d+$/, "");

/** "—" is the service's stand-in for an empty justification (the field is Required at Start). */
const justificationOf = (t: string) => (t.trim() === "—" ? "" : t);

function toMessages(opId: string, thread: HistMsg[], people: People, docs: DocumentRef[]): Message[] {
  return thread
    .filter((m) => ACTIONS.has(m.action as Message["action"]))
    .map((m, i) => {
      const supplier = m.side === "supplier";
      const doc = m.document ? docs.find((d) => d.name === m.document) : undefined;
      return {
        id: `${opId}-m${i}`,
        at: m.at ?? "",
        by: supplier ? people.supplier({ name: m.by }) : people.bdf(m.by),
        side: supplier ? ("supplier" as const) : ("internal" as const),
        text: m.text ?? "",
        action: m.action as Message["action"],
        ...(doc ? { documentId: doc.id } : {}),
        ...(m.newRound ? { newRound: true } : {}),
      };
    });
}

function statusOf(h: HistPoint | undefined, hasTask: boolean): Pick<OpenPoint, "status" | "outcome" | "closeReason"> {
  if (hasTask) return { status: "open" };
  switch (h?.statusCode) {
    case "accepted": return { status: "closed", outcome: "accepted" };
    case "closed": return { status: "closed", outcome: "withdrawn" };
    case "withdrawn-with-case": return { status: "closed", outcome: "withdrawn", closeReason: "Case cancelled" };
    case "not-accepted": return { status: "closed", outcome: "not-accepted" };
    case "open":
    case "answered": return { status: "in-progress" };
  }
  // older history rows without a code: read the supplier wording
  const s = lower(h?.status);
  if (s.startsWith("accepted")) return { status: "closed", outcome: "accepted" };
  if (s.includes("no answer needed")) return { status: "closed", outcome: "withdrawn" };
  if (s.includes("withdrawn")) return { status: "closed", outcome: "withdrawn", closeReason: "Case cancelled" };
  if (s.startsWith("closed")) return { status: "closed", outcome: "not-accepted" };
  // "Waiting for your answer" without a task of this contact: answered (here or by a colleague), the service has not
  // written the history back yet. "With Beiersdorf": answered.
  return { status: "in-progress" };
}

function toOpenPoints(b: CaseBundle, caseId: string, ownerId: string, people: People, docs: DocumentRef[], local?: LocalNotes): { points: OpenPoint[]; queryOf: Record<string, string> } {
  const hist = json<unknown>(b.request, "Questions_History_JSON", []);
  const history = (Array.isArray(hist) ? hist : []).filter((h): h is HistPoint => !!h && typeof h === "object" && typeof (h as HistPoint).opId === "string");
  const open = new Map<string, RawItem>();
  for (const q of b.queries.filter((x) => itemState(x) === "open")) {
    const k = pointKeyOf(q);
    const cur = open.get(k);
    if (!cur || (num(q, "Round_No") ?? 0) > (num(cur, "Round_No") ?? 0)) open.set(k, q);
  }
  const ids = [...new Set([...history.map((h) => h.opId!), ...open.keys()])];
  const queryOf: Record<string, string> = {};
  const points: OpenPoint[] = [];
  for (const id of ids) {
    const h = history.find((x) => x.opId === id);
    const q = open.get(id);
    if (q) queryOf[id] = q._id;
    let thread: Message[];
    if (h?.thread?.length) thread = toMessages(id, h.thread, people, docs);
    else {
      const prev = json<unknown>(q, "Previous_Rounds_JSON", []);
      thread = Array.isArray(prev) && prev.length ? toMessages(id, prev as HistMsg[], people, docs) : [];
      if (!thread.length && q) thread = [{ id: `${id}-m0`, at: str(q, "_created_at"), by: people.bdf(str(q, "Responsible_Name")), side: "internal", text: str(q, "Question_Text"), action: "raised" }];
    }
    const raised = thread.find((m) => m.action === "raised");
    const systemRaised = !raised || raised.by === "bdf:Beiersdorf";
    const responsibleId = q && str(q, "Responsible_Name") ? people.bdf(str(q, "Responsible_Name")) : systemRaised ? ownerId : raised!.by;
    const createdBy = systemRaised ? "system" : raised!.by;
    const raiser = createdBy === "system" ? responsibleId : createdBy;
    const edits: OpenPointEdit[] = (h?.edits ?? [])
      .filter((e) => EDIT_FIELDS.has(e.field as OpenPointEdit["field"]))
      .map((e) => ({ at: e.at ?? "", by: thread.find((m) => m.action === "edited" && m.at === e.at)?.by ?? raiser, field: e.field as OpenPointEdit["field"], from: e.from ?? "", to: e.to ?? "" }));
    // "Changed by Beiersdorf" (B-17): the service marks an open query it edited; the history may follow a minute later.
    const editedAt = str(q, "Edited_At");
    const lastChange = [...edits.map((e) => e.at), ...thread.filter((m) => m.action === "edited").map((m) => m.at)].sort().at(-1) ?? "";
    if (q && editedAt && editedAt > lastChange) {
      thread.push({ id: `${id}-edited`, at: editedAt, by: raiser, side: "internal", text: str(q, "Edit_Note") || "Changed by Beiersdorf", action: "edited" });
      if (edits.length && h?.question && str(q, "Question_Text") && h.question !== str(q, "Question_Text")) edits.push({ at: editedAt, by: raiser, field: "question", from: h.question, to: str(q, "Question_Text") });
    }
    let st = statusOf(h, !!q);
    // An answer sent from this page that the history doesn't show yet.
    const mine = local?.answers.get(id);
    if (mine && !q && !thread.some((m) => m.side === "supplier" && m.at >= mine.at)) {
      thread.push(mine);
      if (st.status !== "closed") st = { status: "in-progress" };
    }
    const sectionId = h?.sectionId || str(q, "Ref_Section_Key") || "GEN";
    const closedAt = st.status === "closed" ? thread.at(-1)?.at : undefined;
    points.push({
      id,
      caseId,
      dept: deptOf(str(q, "Responsible_Department")),
      kind: kindOf(h?.kind ?? str(q, "Kind_Label")),
      ref: {
        sectionId,
        fieldId: h?.fieldId || str(q, "Ref_Field_Key") || undefined,
        rowId: h?.rowId || str(q, "Ref_Row_Id") || undefined,
        documentId: str(q, "Ref_Doc_Id") || undefined,
        label: h?.ref || str(q, "Ref_Label") || sectionId,
      },
      // the open round's own fields are the freshest
      question: (q && str(q, "Question_Text")) || h?.question || "",
      justification: justificationOf((q && str(q, "Supplier_Justification")) || h?.justification || ""),
      responsibleId,
      dueDate: (q && str(q, "Supplier_Due_Date")) || h?.dueDate || "",
      ...st,
      createdAt: thread[0]?.at || str(q, "_created_at"),
      createdBy,
      rounds: Math.max(h?.rounds ?? 0, num(q, "Round_No") ?? 0, 1),
      thread,
      ...(edits.length ? { edits } : {}),
      ...(closedAt ? { closedAt } : {}),
    });
  }
  return { points: points.sort((x, y) => x.dueDate.localeCompare(y.dueDate)), queryOf };
}

// ------------------------------------------------------------------------------------------------ the whole side

export interface SupplierSide {
  cases: CiqCase[];
  users: User[];
  suppliers: Supplier[];
  changeReports: ChangeReport[];
  /** The pinned configurations of every case (bundle.ts). */
  config: ConfigState;
  extras: Map<string, CaseExtra>;
  warnings: string[];
}

const RECENT_EDIT_MS = 15 * 60_000;

function toCase(b: CaseBundle, rq: RawItem, pin: Pin, cfg: ConfigState, people: People, supplierId: string, local: LocalNotes | undefined, nowMs: number): { c: CiqCase; extra: CaseExtra; reports: ChangeReport[] } {
  const caseId = b.code;
  const phase = phaseOf(b, local);
  const contacts = caseContactsOf(rq);
  const contactIds: string[] = [];
  for (const k of contacts) contactIds.push(people.contact(k.id ?? people.supplier({ email: k.email, name: k.name }), k.name, k.email, { role: k.role, mayConfirm: k.mayConfirm }));
  for (const a of Array.isArray(rq.Assigned_Contacts) ? (rq.Assigned_Contacts as Record<string, unknown>[]) : []) {
    const id = String(a?._id ?? "");
    if (id && !contactIds.includes(id)) contactIds.push(people.contact(id, String(a?.Name ?? ""), "", { mayConfirm: contacts.length ? false : undefined }));
  }
  // Kissflow gave this contact the request, so it is on the case (whatever the contact list says).
  if (!contactIds.includes(people.me.id)) contactIds.push(people.contact(people.me.id, people.me.name, people.me.email, { mayConfirm: contacts.length ? false : undefined }));
  const ownerId = people.bdf(str(rq, "BDF_Contact_Name"), str(rq, "BDF_Contact_Email"));

  const doc = readDoc(rq);
  const set = bdfSetOf(rq);
  const config = { ...(doc.config as ConfigAnswers), SF11: set.markets } as ConfigAnswers;
  const answers: Answers = { ...doc.answers };
  for (const k of BDF_SET_FIELDS) delete answers[k];
  Object.assign(answers, set.answers);
  const answeredBy: CiqCase["answeredBy"] = {};
  for (const [k, s] of Object.entries(doc.answeredBy)) {
    const stamp = s as Partial<Stamp>;
    if (!stamp || typeof stamp !== "object") continue;
    answeredBy[k] = { by: people.supplier({ id: stamp.by, email: stamp.email, name: stamp.name }), at: stamp.at ?? "" };
  }
  const documents = toDocuments(rq, people, pin.templateVersion, cfg);
  // An upload answers its file question (latest file), as in the prototype; Answers_JSON never carries file answers.
  for (const d of documents) {
    if (!d.fieldId || fieldOf(d.fieldId, pin.templateVersion, cfg)?.type !== "file") continue;
    answers[d.fieldId] = d.id;
    answeredBy[d.fieldId] = { by: d.uploadedBy, at: d.uploadedAt };
  }

  // Submitting "fill in the CIQ" is the confirmation: the request at "keep the CIQ up to date" (or its fields).
  const confirmed = b.step === "keep" || b.step === "release" || b.step === "released" || str(rq, "Completeness_Confirm") === "Confirmed";
  const confirmations: Confirmation[] = [];
  if (confirmed) {
    const email = str(rq, "Completeness_By_Email");
    confirmations.push({ type: "completeness", by: people.supplier({ email, name: str(rq, "Completeness_By_Name") }), name: str(rq, "Completeness_By_Name"), email, role: str(rq, "Completeness_By_Role"), at: str(rq, "Completeness_At") || str(rq, "_modified_at"), reviewVersion: 1 });
  }
  const releaseName = str(rq, "Release_By_Name");
  if (releaseName || str(rq, "Release_At")) {
    const k = contacts.find((x) => x.name === releaseName);
    confirmations.push({ type: "final-release", by: people.supplier({ name: releaseName, email: k?.email }), name: releaseName, email: k?.email ?? "", role: k?.role ?? "", at: str(rq, "Release_At"), reviewVersion: 1 });
  } else if (local?.releases.has(caseId)) confirmations.push(local.releases.get(caseId)!);

  const { points, queryOf } = toOpenPoints(b, caseId, ownerId, people, documents, local);
  const openRelease = b.releases.filter((x) => itemState(x) === "open").sort(byCreated).at(-1);
  // the release task: the request itself at its release step (16 Oct), else an open CIQP Final Release (before)
  const releaseTaskId = b.step === "release" ? rq._id : openRelease?._id;

  const history: PhaseStamp[] = [{ phase: "supplier-input", at: str(rq, "_created_at") }];
  const cmp = confirmations.find((x) => x.type === "completeness");
  if (cmp) history.push({ phase: "review", at: cmp.at });
  if (phase === "final-release" || phase === "completed") history.push({ phase: "final-release", at: str(openRelease, "_created_at") || (b.step === "release" ? str(rq, "_modified_at") : "") || cmp?.at || "" });
  const rel = confirmations.find((x) => x.type === "final-release");
  if (phase === "completed") history.push({ phase: "completed", at: rel?.at || str(rq, "_modified_at") });
  if (phase === "cancelled") history.push({ phase: "cancelled", at: str(rq, "_modified_at") });

  const part = partOfPhase(phase);
  const stored = storedScope(json<unknown>(rq, "Scope_JSON", []));
  const manual = manualScope(json<unknown>(rq, "Manual_Scope_JSON", []));
  const due = (phase === "final-release" && str(openRelease, "Supplier_Due_Date")) || str(rq, "Supplier_Due_Date");

  const c: CiqCase = {
    id: caseId,
    materialName: str(rq, "Trade_Name") || caseId,
    inci: str(rq, "Main_INCI"),
    materialNo: str(rq, "BDF_Material_No"),
    supplierId,
    manufacturer: "",
    site: "",
    supplierContactIds: contactIds,
    ownerId,
    createdAt: str(rq, "_created_at"),
    dueDate: due,
    phase,
    templateVersion: pin.templateVersion,
    ruleSetVersion: pin.ruleSetVersion,
    config,
    scope: liveScope({ config, ruleSetVersion: pin.ruleSetVersion, templateVersion: pin.templateVersion, cfg, part, stored, manual }),
    answers,
    answeredBy,
    components: (doc.components ?? []) as ComponentRow[],
    justifications: doc.justifications,
    documents,
    reviews: [],
    informed: [],
    openPoints: points,
    confirmations,
    audit: [],
    reviewVersion: cmp ? 1 : 0,
    phaseHistory: history.filter((p) => p.at),
    ...(phase === "cancelled" ? { cancelled: { by: ownerId, at: str(rq, "_modified_at"), reason: "", fromPhase: (cmp ? "review" : "supplier-input") as Phase } } : {}),
    priority: "normal",
    internalNotes: [],
    liveScope: true,
    ...(cmp ? { requestedDocs: storedSlots(json<unknown>(rq, "Requested_Docs_JSON", [])) } : {}),
  };

  // Confirmed before the supplier UI wrote the requested documents: fix them as derived now (none "added later").
  if (cmp && !str(rq, "Requested_Docs_JSON").trim()) c.requestedDocs = deriveRequestedDocs(c, cfg);

  // Change reports: the service's receipts, plus a report written here that has no receipt yet ("Sending…").
  const receipts = json<unknown>(rq, "Change_Reports_JSON", []);
  const company = people.contact(`company:${supplierId}`, str(rq, "Supplier_Display_Name") || "Your company");
  const reports: ChangeReport[] = (Array.isArray(receipts) ? receipts : [])
    .filter((r): r is { id?: string; at?: string; text?: string } => !!r && typeof r === "object")
    .map((r, i) => ({ id: String(r.id ?? `CR-${i + 1}`), caseId, at: String(r.at ?? ""), by: company, text: String(r.text ?? "") }));
  const reportRev = num(rq, "Change_Report_Rev") ?? 0;
  const unreceived = reportRev > reports.length && !!str(rq, "Change_Report_Text");
  // v6 (20 Oct): request.changed carries the report to the app at once; receipts come back only through the
  // change.received hand-off. Without one, the report counts as sent after 10 minutes, so the next can be written.
  const reportAt = str(rq, "Change_Report_At") || str(rq, "_modified_at");
  const reportPending = unreceived && !!reportAt && nowMs - Date.parse(reportAt) < REPORT_PENDING_MS;
  if (unreceived) reports.push({ id: `${reportPending ? "pending" : "sent"}-${reportRev}`, caseId, at: reportAt, by: people.supplier({ email: str(rq, "Change_Report_By_Email") }), text: str(rq, "Change_Report_Text") });

  const editingEmail = str(rq, "Editing_By");
  const since = str(rq, "Editing_Since");
  const editing = editingEmail && lower(editingEmail) !== lower(people.me.email) && since && nowMs - Date.parse(since) < RECENT_EDIT_MS ? { email: editingEmail, name: people.users.get(people.supplier({ email: editingEmail }))?.name ?? editingEmail, since } : undefined;

  const extra: CaseExtra = { caseId, requestId: rq._id, step: b.step, locked: isWriteLocked(rq) || questionnaireLocked({ phase }), closed: phase === "completed" || phase === "cancelled", phaseLabel: str(rq, "Case_Phase_Label"), pin, stored, manual, queryOf, releaseId: releaseTaskId, reportPending, contacts, ...(editing ? { editing } : {}) };
  return { c, extra, reports };
}

/**
 * Every case the contact holds a task on, as CiqCases of the prototype's flow, with the users and suppliers the
 * screens name. Several suppliers on one login (a builder testing) are shown together under one name.
 */
export function toSupplierSide(bundles: CaseBundle[], me: Who, local?: LocalNotes, now: Date = new Date()): SupplierSide {
  const warnings: string[] = [];
  const withRequest = bundles.filter((b): b is CaseBundle & { request: RawItem } => !!b.request);
  for (const b of bundles) if (!b.request) warnings.push(`${b.code}: a task for this request arrived, but the request itself is not one of your tasks, so it is not shown.`);
  const pins = new Map(withRequest.map((b) => [b.key, pinOf(b.request)]));
  for (const b of withRequest) {
    const p = pins.get(b.key)!;
    if (p.problem) warnings.push(`${b.code}: ${p.problem}. The standard questionnaire is shown until Beiersdorf's system pins the version.`);
  }
  const cfg = configOf([...pins.values()]);
  const codes = [...new Set(withRequest.map((b) => str(b.request, "Supplier_Code")).filter(Boolean))];
  const supplierId = codes.length > 1 ? codes.join("+") : (codes[0] ?? "");
  const names = [...new Set(withRequest.map((b) => str(b.request, "Supplier_Display_Name") || str(b.request, "Supplier_Code")).filter(Boolean))];
  const people = new People(me, supplierId);
  people.contact(me.id, me.name, me.email);
  const cases: CiqCase[] = [];
  const extras = new Map<string, CaseExtra>();
  const changeReports: ChangeReport[] = [];
  for (const b of withRequest) {
    const r = toCase(b, b.request, pins.get(b.key)!, cfg, people, supplierId, local, now.getTime());
    cases.push(r.c);
    extras.set(r.c.id, r.extra);
    changeReports.push(...r.reports);
  }
  const suppliers: Supplier[] = supplierId ? [{ id: supplierId, name: names.join(" / ") || supplierId, duns: "", country: "", type: "manufacturer", contactIds: [...new Set(cases.flatMap((c) => c.supplierContactIds))] }] : [];
  return { cases, users: [...people.users.values()], suppliers, changeReports, config: cfg, extras, warnings };
}

/** The case of one request as it would be after a write (Scope_JSON and Requested_Docs_JSON are derived from it). */
export function caseOfRequest(b: CaseBundle, request: RawItem, me: Who, local?: LocalNotes): { c: CiqCase; extra: CaseExtra; config: ConfigState } {
  const side = toSupplierSide([{ ...b, request }], me, local);
  return { c: side.cases[0]!, extra: side.extras.get(b.code)!, config: side.config };
}

/** The Answers_JSON keys the supplier writes: never the Beiersdorf-set values, never file answers. */
export const writableAnswer = (fieldId: string, templateVersion: string, cfg: ConfigState): boolean => !BDF_SET_FIELDS.includes(fieldId) && fieldOf(fieldId, templateVersion, cfg)?.type !== "file";

export { COMPONENTS_KEY };
export type { AnswerValue };
