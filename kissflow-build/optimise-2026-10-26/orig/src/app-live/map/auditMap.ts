// CIQ Audit Event rows ↔ the prototype's AuditEvent / LogEvent (DESIGN §5.3). The audit form is the universal case
// index and history (§4): every screen action leaves ONE row whose Action_Code is the v6 code and whose Snapshot_JSON
// keeps the domain's own new entries (the prototype's phrases, so auditTone and "Final <dept> decision" survive) plus
// the object as it was after the action. Roles that can't read a process item fall back to the latest snapshot.
// The snapshot types are exported for the writers (write/audit.ts builds the same shape).
// Pure: no SDK, no Kissflow call.
import type { AuditEvent, Confirmation, Finding, InternalNote, LogEvent, Market, OpenPoint, Phase, ReviewDept, ReviewTrack, RmesCriterion } from "@/domain/types";
import { json, str, type RawItem } from "@/portal/data/raw";
import type { AppEnv } from "../env";
import type { AuditCode, HandoffStatus } from "../types";
import { deptOf, type Directory } from "./people";

/** The case header a `case.created` row keeps (DESIGN §5.3): enough to list and open a case nobody can read. */
export interface CaseHeader {
  caseId: string;
  itemId: string;
  cycleNo: number;
  materialName: string;
  inci: string;
  materialNo: string;
  supplierId: string;
  manufacturer: string;
  duns: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  dueDate: string;
  priority: "normal" | "high";
  templateVersion: string;
  ruleSetVersion: string;
  markets: Market[];
  contacts: { id: string; name: string; email: string; title: string; mayConfirm: boolean }[];
  bdfSet: Record<string, unknown>;
}

export interface CancelSnapshot {
  by: string;
  at: string;
  reason: string;
  fromPhase?: Phase;
  /** The open points the cancellation closed (other raisers' points stay open in Kissflow, DESIGN §6 cancelCase). */
  closedOpIds: string[];
}

/** Snapshot_JSON (v1). User ids are Kissflow user ids (the writers map the acting user's alias back). */
export interface AuditSnapshot {
  v: 1;
  code: AuditCode;
  audit: AuditEvent[];
  log?: LogEvent[];
  case?: CaseHeader;
  track?: ReviewTrack & { roundNo: number };
  /** Several reviews at once, without their item ids (22 Oct: E-A's one review.started row per case, in I-2). */
  tracks?: (ReviewTrack & { roundNo: number })[];
  confirmation?: Confirmation;
  op?: OpenPoint;
  rmes?: { dept: "SAF" | "REG"; criterion?: RmesCriterion; finding?: Finding; decision?: { decision: "approved" | "rejected"; reason?: string } };
  note?: InternalNote;
  cancelled?: CancelSnapshot;
  handoffs: HandoffStatus[];
}

/** One readable audit row. */
export interface AuditRow {
  row: RawItem;
  /** Event_At, else _created_at. */
  at: string;
  /** Action_Code. */
  code: string;
  caseItemId: string;
  caseCode: string;
  category: string;
  /** Object_Item_Id (the item the action wrote). */
  objectItemId: string;
  /** The actor as a domain user id (the acting user's alias applied). */
  by: string;
  snap?: AuditSnapshot;
}

/** The prototype's phrase for a row without a snapshot (actions.ts wording). */
export const ACTION_LABEL: Record<AuditCode, string> = {
  "case.created": "Created case",
  "case.cancelled": "Cancelled case",
  "case.reactivated": "Reactivated case",
  "op.raised": "Raised query",
  "op.round": "Returned answer to supplier",
  "op.edited": "Edited open point",
  "op.accepted": "Accepted answer",
  "op.returned": "Returned answer to supplier",
  "op.notaccepted": "Closed as not accepted",
  "op.closed": "Closed open point (no answer needed)",
  "review.started": "Activated review",
  "review.completed": "Completed review",
  "review.reopened": "Reopened review",
  "review.reassigned": "Reassigned review",
  "release.requested": "All reviews completed",
  "rmes.saved": "Recorded RMES result",
  "note.added": "Added internal note",
  "supplier.changed": "Changed supplier master",
  "config.published": "Published configuration",
};

const LOG_CATEGORIES: Record<string, LogEvent["kind"]> = { "Supplier master": "supplier", Configuration: "config" };
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** Snapshot_JSON when it is a v1 snapshot object; undefined otherwise (an older or foreign row). Its lists are lists
 *  (a parseable but malformed snapshot must not stop the app loading, M4). */
export function parseSnapshot(row: RawItem | undefined): AuditSnapshot | undefined {
  const v = json<unknown>(row, "Snapshot_JSON", undefined);
  if (!isObj(v)) return undefined;
  const list = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x.filter(isObj) as unknown as T[]) : []);
  const { log, ...rest } = v as unknown as AuditSnapshot;
  return { ...rest, audit: list<AuditEvent>(v.audit), handoffs: list<HandoffStatus>(v.handoffs), ...(log !== undefined ? { log: list<LogEvent>(log) } : {}) };
}

/** Every element of `x` when it is a list (a malformed snapshot's "list" reads as empty). */
const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

/** Every audit row, oldest first (Event_At), with its actor in the directory. */
export function readAuditRows(rows: RawItem[], dir: Directory): AuditRow[] {
  return rows
    .map((row): AuditRow => {
      const by = dir.userField(row, "_created_by", { dept: deptOf(str(row, "Actor_Dept")), name: str(row, "Actor_Name") || undefined, email: str(row, "Actor_Email") || undefined }) || "system";
      return {
        row,
        at: str(row, "Event_At") || str(row, "_created_at"),
        code: str(row, "Action_Code"),
        caseItemId: str(row, "Case_Item_Id"),
        caseCode: str(row, "Case_Code"),
        category: str(row, "Event_Category"),
        objectItemId: str(row, "Object_Item_Id"),
        by,
        snap: parseSnapshot(row),
      };
    })
    .sort((a, b) => time(a.at) - time(b.at));
}

// ---------------------------------------------------------------------------------- ids inside snapshots

/** A Kissflow user id from a snapshot as a domain id ("system" kept; unknown people get a stand-in). ensure maps it by
 *  its side: the acting user's alias on the Beiersdorf side, the self contact on the supplier side. */
const uid = (dir: Directory, id: string | undefined, side: "internal" | "supplier" = "internal") => dir.ensure(id, side);

export function mapEvent(e: AuditEvent, dir: Directory): AuditEvent {
  return { ...e, by: uid(dir, e.by) || "system" };
}

export function mapOp(op: OpenPoint, dir: Directory): OpenPoint {
  return {
    ...op,
    createdBy: uid(dir, op.createdBy) || "system",
    responsibleId: uid(dir, op.responsibleId),
    ...(op.closedBy ? { closedBy: uid(dir, op.closedBy) } : {}),
    thread: arr<OpenPoint["thread"][number]>(op.thread).filter(isObj).map((m) => ({ ...m, by: uid(dir, m.by, m.side === "supplier" ? "supplier" : "internal") })),
    ...(op.edits ? { edits: arr<NonNullable<OpenPoint["edits"]>[number]>(op.edits).filter(isObj).map((e) => ({ ...e, by: uid(dir, e.by), ...(e.field === "responsibleId" ? { from: uid(dir, e.from), to: uid(dir, e.to) } : {}) })) } : {}),
  };
}

export function mapTrack(t: ReviewTrack & { roundNo?: number }, dir: Directory): ReviewTrack & { roundNo: number } {
  return {
    ...t,
    roundNo: typeof t.roundNo === "number" && t.roundNo > 0 ? t.roundNo : 1,
    assigneeId: uid(dir, t.assigneeId),
    ...(isObj(t.continueAfterRejection) ? { continueAfterRejection: { ...t.continueAfterRejection, depts: arr<ReviewDept>(t.continueAfterRejection.depts), by: uid(dir, t.continueAfterRejection.by) } } : {}),
  };
}

export function mapConfirmation(c: Confirmation, dir: Directory): Confirmation {
  return { ...c, by: uid(dir, c.by, c.type === "completeness" || c.type === "final-release" ? "supplier" : "internal") };
}

export function mapNote(n: InternalNote, dir: Directory): InternalNote {
  return { ...n, by: uid(dir, n.by), ...(n.mentions ? { mentions: arr<string>(n.mentions).filter((m) => typeof m === "string").map((m) => uid(dir, m)) } : {}) };
}

// ---------------------------------------------------------------------------------- per case

/** An Action_Code this app does not know, as History and the Audit trail name it: the code itself in dev, a plain
 *  label in production (FE-CLEANUP C25); a row without one keeps the fallback in both. */
const unknownCode = (code: string, fallback: string, env?: AppEnv) => (!code ? fallback : env === "prod" ? "Other change" : code);

/** The case's history from its rows (unnumbered; caseMap merges the synthesized supplier entries and numbers them). */
export function caseEntries(rows: AuditRow[], dir: Directory, env?: AppEnv): AuditEvent[] {
  const out: AuditEvent[] = [];
  for (const r of rows) {
    const own = r.snap?.audit.filter((e) => e && typeof e.action === "string") ?? [];
    if (own.length) for (const e of own) out.push(mapEvent({ ...e, at: e.at || r.at, detail: e.detail ?? "" }, dir));
    else out.push({ id: "", at: r.at, by: r.by, action: ACTION_LABEL[r.code as AuditCode] ?? unknownCode(r.code, "Recorded", env), detail: str(r.row, "New_Value_Text") });
  }
  return out;
}

/** The latest row of the given codes (or undefined). */
export function lastOf(rows: AuditRow[], codes: string[]): AuditRow | undefined {
  return [...rows].reverse().find((r) => codes.includes(r.code));
}

/** The latest snapshot of each kind of object the case's rows carry (live items beat these, DESIGN §5.3). */
export interface CaseSnapshots {
  header?: CaseHeader;
  /** `${dept}|${roundNo}` → the track as last written, with the row's item id and its confirmation, if any. */
  tracks: Map<string, { track: ReviewTrack & { roundNo: number }; itemId: string; confirmation?: Confirmation; at: string }>;
  /** op id → the point as last written. */
  ops: Map<string, { op: OpenPoint; itemId: string; at: string }>;
  notes: Map<string, InternalNote>;
  cancelled?: CancelSnapshot;
  cancellation?: Confirmation;
}

/** A snapshot object in the shape the screens need (M4: anything else is skipped with a warning). */
const isOp = (o: unknown): o is OpenPoint => isObj(o) && typeof o.id === "string" && typeof o.dept === "string" && typeof o.question === "string" && typeof o.status === "string" && isObj(o.ref);
const isTrack = (o: unknown): o is ReviewTrack => isObj(o) && typeof o.dept === "string" && typeof o.status === "string";
const isNote = (o: unknown): o is InternalNote => isObj(o) && typeof o.id === "string" && typeof o.text === "string";

export function caseSnapshots(rows: AuditRow[], dir: Directory, warnings?: string[]): CaseSnapshots {
  const out: CaseSnapshots = { tracks: new Map(), ops: new Map(), notes: new Map() };
  const odd = (r: AuditRow, what: string) => warnings?.push(`${r.caseCode || "A case"}: the history row ${str(r.row, "Event_Key") || r.row._id} keeps ${what} in a shape this app does not know; that part is not shown.`);
  for (const r of rows) {
    if (r.code === "case.reactivated") {
      delete out.cancelled;
      delete out.cancellation;
    }
    const s = r.snap;
    if (!s) continue;
    if (s.case && isObj(s.case)) {
      if ((s.case.contacts !== undefined && !Array.isArray(s.case.contacts)) || (s.case.markets !== undefined && !Array.isArray(s.case.markets))) odd(r, "the case header");
      out.header = {
        ...s.case,
        contacts: arr<CaseHeader["contacts"][number]>(s.case.contacts).filter(isObj),
        markets: arr<Market>(s.case.markets).filter((m) => typeof m === "string"),
        bdfSet: isObj(s.case.bdfSet) ? s.case.bdfSet : {},
        ownerId: s.case.ownerId ? dir.internal(s.case.ownerId, { name: s.case.ownerName, dept: "RMM" }) : "",
      };
    }
    if (s.track !== undefined && !isTrack(s.track)) odd(r, "a review");
    if (s.tracks !== undefined && (!Array.isArray(s.tracks) || !s.tracks.every(isTrack))) odd(r, "the reviews");
    if (s.op !== undefined && !isOp(s.op)) {
      const o: unknown = s.op;
      odd(r, `open point ${isObj(o) && typeof o.id === "string" ? o.id : ""}`.trim());
    }
    if (s.note !== undefined && !isNote(s.note)) odd(r, "an internal note");
    // a usable object with a list that is not a list: shown without that list (mapOp / mapNote), and said so
    if (isOp(s.op) && ((s.op.thread !== undefined && !Array.isArray(s.op.thread)) || (s.op.edits !== undefined && !Array.isArray(s.op.edits)))) odd(r, `the history of open point ${s.op.id}`);
    if (isNote(s.note) && s.note.mentions !== undefined && !Array.isArray(s.note.mentions)) odd(r, `the mentions of note ${s.note.id}`);
    if (isTrack(s.track)) {
      const track = mapTrack(s.track, dir);
      out.tracks.set(`${track.dept}|${track.roundNo}`, { track, itemId: r.objectItemId, at: r.at, ...(s.confirmation && s.confirmation.type === "dept-completion" ? { confirmation: mapConfirmation(s.confirmation, dir) } : {}) });
    }
    // E-A's case-level row: each usable track, with no item id (the row names the case, not a review; a live item, where
    // the role can read it, wins over the snapshot as always)
    for (const t of Array.isArray(s.tracks) ? s.tracks.filter(isTrack) : []) {
      const track = mapTrack(t, dir);
      out.tracks.set(`${track.dept}|${track.roundNo}`, { track, itemId: "", at: r.at });
    }
    if (isOp(s.op)) out.ops.set(s.op.id, { op: mapOp(s.op, dir), itemId: r.objectItemId, at: r.at });
    if (isNote(s.note)) out.notes.set(s.note.id, mapNote(s.note, dir));
    if (r.code === "case.cancelled" && s.cancelled && isObj(s.cancelled)) {
      out.cancelled = { ...s.cancelled, by: uid(dir, s.cancelled.by) || r.by, closedOpIds: Array.isArray(s.cancelled.closedOpIds) ? s.cancelled.closedOpIds : [] };
      if (s.confirmation && s.confirmation.type === "cancellation") out.cancellation = mapConfirmation(s.confirmation, dir);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------- the global log

/** Supplier-master and configuration changes (rows without a case): Snapshot_JSON.log, else the row itself.
 *  Ids are renumbered L-0001… in time order, as the domain's logEvent numbers them. */
export function logOf(rows: AuditRow[], dir: Directory, env?: AppEnv): LogEvent[] {
  const out: LogEvent[] = [];
  for (const r of rows) {
    const kind = LOG_CATEGORIES[r.category];
    if (!kind || r.caseCode) continue;
    const entries = r.snap?.log?.filter((e) => e && typeof e.action === "string") ?? [];
    if (entries.length) for (const e of entries) out.push({ ...e, at: e.at || r.at, by: uid(dir, e.by) || r.by, kind: e.kind === "config" || e.kind === "supplier" ? e.kind : kind, detail: e.detail ?? "" });
    else out.push({ id: "", at: r.at, by: r.by, kind, action: ACTION_LABEL[r.code as AuditCode] ?? unknownCode(r.code, "Changed", env), detail: str(r.row, "New_Value_Text"), ...(kind === "supplier" && str(r.row, "Object_Key") ? { supplierId: str(r.row, "Object_Key") } : {}) });
  }
  return out.sort((a, b) => time(a.at) - time(b.at)).map((e, i) => ({ ...e, id: `L-${String(i + 1).padStart(4, "0")}` }));
}
