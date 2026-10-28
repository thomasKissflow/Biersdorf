// Live review tracks, open points, RMES records and internal notes → the prototype's objects (DESIGN §5.2).
// - CIQ Review: one item per (case, department, round); the latest round is the track, earlier completions give
//   lastCompletedAt and their dept-completion confirmations. Track_Status is frozen after Start (G17), so the status is
//   derived from the item and the department's open points.
// - CIQ Open Point: Thread_JSON {thread, edits} is the point's history as the raiser's screen last wrote it. An answer
//   the supplier gave since (I-4 writes Response_* and OP_Progress "In progress") is appended here once (G14); the
//   raiser's next write persists it.
// - RMES Safety / Regulatory rows with their criteria and findings child tables; internal notes.
// Roles that can't read an item fall back to the latest audit snapshot of the object (auditMap.ts); an item read only as
// a list row (TrackCtx.sparse) takes the fields it lacks from that snapshot, its own values (its status first) still
// winning (a sparse row must not beat a richer snapshot). Pure.
import { DEPT_SHORT, INTERNAL_PERSONAS, REVIEW_TRACK_DEPTS } from "@/domain/catalog";
import type { Confirmation, Finding, InternalNote, Message, OpenPoint, OpenPointEdit, OpenPointKind, ReviewDept, ReviewTrack, RmesCriterion, RmesRecord, RmesResult } from "@/domain/types";
import { childRows, json, num, str, type RawItem } from "@/portal/data/raw";
import { LIST, STEPS, TABLES } from "../ids";
import type { OpRef, ReviewRef, RmesRef, TaskRef } from "../types";
import type { CancelSnapshot, CaseSnapshots } from "./auditMap";
import { deptOf, nameFromEmail, reviewDeptOf, type Directory } from "./people";

type Row = Record<string, unknown>;

export interface TrackCtx {
  caseId: string;
  caseItemId: string;
  ownerId: string;
  supplierId: string;
  dir: Directory;
  /** Held tasks by item id (LiveSnapshot.tasks). */
  tasks: Map<string, TaskRef>;
  warnings: string[];
  /** How odd items were mapped (an unknown department or result, a duplicate key, a withdrawn review): dev only, in
   *  Diagnostics. Test-script rows cause them; the app writes none of it (FE-CLEANUP B8, B10, C1). */
  notes: string[];
  /** Item ids read only as list rows (LiveSnapshot.sparse): their blanks come from the latest snapshot. */
  sparse?: Set<string>;
}

const invert = <K extends string>(m: Record<K, string>): Record<string, K> => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>;
const OP_KIND_OF = invert(LIST.opKind);
const OP_OUTCOME_OF = invert(LIST.opOutcome);
const RMES_RESULT_OF = invert(LIST.rmesResult);
const DECISION_OF = invert(LIST.decision);
const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};
const validIso = (v: string | undefined): v is string => !!v && Number.isFinite(Date.parse(v));
/** A Kissflow Date ("2026-12-31") as the screens' own due-date instant (16:00 UTC, features/review/shared.tsx
 *  fromDateInput); a DateTime as it is; "" when unreadable. */
export const dateIso = (v: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? `${v.trim()}T16:00:00.000Z` : validIso(v) ? v : "");
/** The item holds a value for the field (a User or list too). */
const has = (it: RawItem, k: string): boolean => {
  const v = it[k];
  return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length);
};

/** The held task of an item, else the step the item reports (_current_context). The act id comes only from a held task
 *  (the task list, or `_activity_instance_id`, which load.ts keeps only on held tasks and own drafts), never from
 *  `_current_context`: an item read through admin or by id shows its current instance whoever holds it, and a writer
 *  must not act on a step the user does not hold (the guard refuses first instead of Kissflow's 050201). */
export function taskOf(it: RawItem, tasks: Map<string, TaskRef>): { act?: string; activityId?: string } {
  const t = tasks.get(it._id);
  const ctx = Array.isArray(it._current_context) ? (it._current_context[0] as Row | undefined) : undefined;
  const act = t?.act ?? (str(it, "_activity_instance_id") || undefined);
  const activityId = t?.activityId ?? (str(ctx, "_context_activity_id") || undefined);
  return { ...(act ? { act } : {}), ...(activityId ? { activityId } : {}) };
}

// ---------------------------------------------------------------------------------- open points

const ACTIONS = new Set<Message["action"]>(["raised", "answered", "returned", "accepted", "cannot-provide", "note", "edited", "withdrawn"]);
const EDIT_FIELDS = new Set<OpenPointEdit["field"]>(["question", "justification", "dueDate", "responsibleId"]);

export interface ThreadDoc {
  thread: Message[];
  edits: OpenPointEdit[];
}

/** Thread_JSON {thread, edits} (write/encode.ts threadJson). A bare array or unreadable text → undefined (DESIGN §5.2). */
export function parseThread(it: RawItem | undefined): ThreadDoc | undefined {
  const v = json<unknown>(it, "Thread_JSON", undefined);
  if (!v || typeof v !== "object" || Array.isArray(v) || !Array.isArray((v as { thread?: unknown }).thread)) return undefined;
  const d = v as { thread: unknown[]; edits?: unknown };
  return {
    thread: d.thread.filter((m): m is Message => !!m && typeof m === "object" && ACTIONS.has((m as Message).action) && typeof (m as Message).by === "string"),
    edits: (Array.isArray(d.edits) ? d.edits : []).filter((e): e is OpenPointEdit => !!e && typeof e === "object" && EDIT_FIELDS.has((e as OpenPointEdit).field)),
  };
}

/** Response_Doc_Refs_JSON: the first upload id ([{uploadId}] or ["<uploadId>"]). */
function firstDocRef(it: RawItem): string | undefined {
  const v = json<unknown>(it, "Response_Doc_Refs_JSON", []);
  if (!Array.isArray(v)) return undefined;
  for (const r of v) {
    if (typeof r === "string" && r) return r;
    if (r && typeof r === "object" && typeof (r as { uploadId?: unknown }).uploadId === "string") return (r as { uploadId: string }).uploadId;
  }
  return undefined;
}

/** True when the thread holds no supplier message since its last new round (the round's answer is missing). */
const roundUnanswered = (thread: Message[]) => {
  const start = thread.map((m) => !!m.newRound).lastIndexOf(true);
  return !thread.slice(Math.max(0, start)).some((m) => m.side === "supplier");
};

/** One live CIQ Open Point item as the domain's OpenPoint (`id` = its OP_Key, made unique by the caller). `fb` is the
 *  point's latest snapshot when the item is only a list row: it stands in for the history and the people it lacks. */
export function opFromItem(it: RawItem, id: string, x: TrackCtx, fb?: OpenPoint): { op: OpenPoint; ref: OpRef } {
  const { dir } = x;
  const dept = reviewDeptOf(str(it, "OP_Dept")) ?? "RMM";
  if (!reviewDeptOf(str(it, "OP_Dept"))) x.notes.push(`${id}: unknown department "${str(it, "OP_Dept")}"; shown under RMM.`);
  const kind: OpenPointKind = OP_KIND_OF[str(it, "OP_Kind")] ?? "query";
  const createdAt = str(it, "_created_at");
  const createdBy = dir.userField(it, "Raised_By_User", { dept: deptOf(str(it, "Raised_By_Dept")), name: str(it, "Raised_By_Name") || undefined }) || fb?.createdBy || x.ownerId;
  const responsibleId = dir.userField(it, "Responsible_User", { dept, name: str(it, "Responsible_Name") || undefined }) || fb?.responsibleId || createdBy;
  const question = str(it, "Question_Text");

  // status / outcome (DESIGN §5.2): an outcome or an ended item closes it
  const status = str(it, "_status");
  const outcomeText = str(it, "OP_Outcome");
  let outcome = OP_OUTCOME_OF[outcomeText];
  const ended = status === "Completed" || status === "Withdrawn";
  if (!outcome && ended) {
    outcome = "withdrawn";
    if (status === "Completed") x.notes.push(`${id}: completed in Kissflow without an outcome; shown as closed, no answer needed.`);
  }
  const closed = !!outcome;
  const inProgress = str(it, "OP_Progress") === LIST.opProgress["in-progress"];

  // the history
  const doc = parseThread(it) ?? (fb && fb.thread.length ? { thread: fb.thread, edits: fb.edits ?? [] } : undefined);
  const thread: Message[] = doc?.thread.length
    ? doc.thread.map((m, i) => ({ ...m, id: m.id || `${id}-m${i + 1}`, at: m.at || createdAt, by: dir.ensure(m.side === "supplier" ? m.by : dir.id(m.by), m.side === "supplier" ? "supplier" : "internal"), side: m.side === "supplier" ? "supplier" : "internal" }))
    : [{ id: `${id}-m1`, at: createdAt, by: createdBy, side: "internal", text: question, action: "raised" }];
  // G14: the supplier's answer arrived on Response_* after the raiser last wrote the thread; appended exactly once
  if (inProgress && roundUnanswered(thread)) {
    const last = thread.at(-1)?.at ?? createdAt;
    const at = str(it, "_modified_at") && time(str(it, "_modified_at")) >= time(last) ? str(it, "_modified_at") : last;
    const docId = firstDocRef(it);
    thread.push({
      id: `${id}-m${thread.length + 1}`,
      at,
      by: dir.contactIdByEmail(str(it, "Supplier_Responsible_Email"), undefined, x.supplierId),
      side: "supplier",
      text: str(it, "Response_Text"),
      action: /cannot/i.test(str(it, "Response_Kind")) ? "cannot-provide" : "answered",
      ...(docId ? { documentId: docId } : {}),
    });
  }
  const edits = (doc?.edits ?? []).map((e) => ({ ...e, by: dir.ensure(dir.id(e.by)), ...(e.field === "responsibleId" ? { from: dir.ensure(dir.id(e.from)), to: dir.ensure(dir.id(e.to)) } : {}) }));

  const justification = str(it, "Supplier_Justification");
  const due = dateIso(str(it, "Supplier_Due_Date")) || createdAt;
  const closedAt = str(it, "Closed_At") || (closed ? str(it, "_modified_at") : "");
  const closedBy = closed ? dir.userField(it, "Closed_By") || fb?.closedBy || createdBy : "";
  const op: OpenPoint = {
    id,
    caseId: x.caseId,
    dept,
    kind,
    ref: {
      sectionId: str(it, "Ref_Section_Key") || "GEN",
      ...(str(it, "Ref_Field_Key") ? { fieldId: str(it, "Ref_Field_Key") } : {}),
      ...(str(it, "Ref_Row_Id") ? { rowId: str(it, "Ref_Row_Id") } : {}),
      ...(str(it, "Ref_Doc_Id") ? { documentId: str(it, "Ref_Doc_Id") } : {}),
      label: str(it, "Ref_Label") || str(it, "Ref_Section_Key") || "GEN",
    },
    question,
    justification: justification.trim() === "—" ? "" : justification,
    responsibleId,
    dueDate: due,
    status: closed ? "closed" : inProgress ? "in-progress" : "open",
    ...(outcome ? { outcome } : {}),
    createdAt,
    createdBy,
    rounds: Math.max(1, num(it, "Round_No") ?? 1),
    thread,
    ...(edits.length ? { edits } : {}),
    ...(closed && closedAt ? { closedAt } : {}),
    ...(closed && closedBy ? { closedBy } : {}),
    ...(outcome === "withdrawn" && str(it, "Outcome_Reason") ? { closeReason: str(it, "Outcome_Reason") } : {}),
  };
  const ref: OpRef = {
    caseId: x.caseId,
    opId: id,
    itemId: it._id,
    ...taskOf(it, x.tasks),
    roundNo: op.rounds,
    ...(str(it, "Portal_Query_Item_Id") ? { portalQueryItemId: str(it, "Portal_Query_Item_Id") } : {}),
    ...(str(it, "_modified_at") ? { modifiedAt: str(it, "_modified_at") } : {}),
    // a list row whose full read failed lacks Thread_JSON / Response_*: not "live" for history.updated (M3)
    live: !x.sparse?.has(it._id),
  };
  return { op, ref };
}

/**
 * The case's open points: live items first (oldest first; a duplicate OP_Key gets the suffix "·2" and a warning,
 * R-13), then the snapshot of every point no live item shows. `seen` holds the ids already used (all cases).
 */
export function openPointsOf(items: RawItem[], snaps: CaseSnapshots["ops"], x: TrackCtx, seen: Set<string>): { points: OpenPoint[]; refs: OpRef[] } {
  const points: OpenPoint[] = [];
  const refs: OpRef[] = [];
  const liveKeys = new Set<string>();
  for (const it of [...items].sort((a, b) => time(str(a, "_created_at")) - time(str(b, "_created_at")))) {
    const key = str(it, "OP_Key") || it._id;
    liveKeys.add(key);
    let id = key;
    for (let n = 2; seen.has(id); n++) id = `${key}·${n}`;
    if (id !== key) x.notes.push(`Two open points share the key ${key} (item ${it._id}); the later one is shown as ${id}.`);
    seen.add(id);
    const r = opFromItem(it, id, x, x.sparse?.has(it._id) ? snaps.get(key)?.op : undefined);
    points.push(r.op);
    refs.push(r.ref);
  }
  for (const [key, s] of snaps) {
    if (liveKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    points.push({ ...s.op, caseId: x.caseId });
    refs.push({ caseId: x.caseId, opId: key, ...(s.itemId ? { itemId: s.itemId } : {}), roundNo: s.op.rounds, live: false });
  }
  return { points, refs };
}

/** The points a cancellation closed (its snapshot's closedOpIds), shown closed although other raisers' items stay
 *  open in Kissflow (DESIGN §6 cancelCase); the same entries the domain's cancelCase writes. */
export function closeByCancellation(points: OpenPoint[], cancel: CancelSnapshot | undefined): OpenPoint[] {
  if (!cancel) return points;
  const ids = new Set(cancel.closedOpIds);
  return points.map((p) =>
    p.status === "closed" || !ids.has(p.id)
      ? p
      : { ...p, status: "closed", outcome: "withdrawn", closedAt: cancel.at, closedBy: cancel.by, closeReason: `Case cancelled: ${cancel.reason}`, thread: [...p.thread, { id: `${p.id}-m${p.thread.length + 1}`, at: cancel.at, by: cancel.by, side: "internal", text: "Closed: the request was withdrawn.", action: "withdrawn" }] },
  );
}

// ---------------------------------------------------------------------------------- review tracks

/** When a completed review item was completed: Completed_At, else Kissflow's own completion time (a live My items row
 *  carries `_completed_at` and no Completed_At, 21 Oct), else its last change. */
const completedAtOf = (it: RawItem): string => str(it, "Completed_At") || str(it, "_completed_at") || str(it, "_modified_at");

const roleLabel = (d: ReviewDept) => INTERNAL_PERSONAS.find((p) => p.dept === d)?.label ?? DEPT_SHORT[d];

interface Round {
  dept: ReviewDept;
  roundNo: number;
  item?: RawItem;
  snap?: { track: ReviewTrack & { roundNo: number }; itemId: string; confirmation?: Confirmation };
}

/** One live CIQ Review item as a track (status before the open-point check). */
function trackFromItem(it: RawItem, dept: ReviewDept, x: TrackCtx): ReviewTrack {
  const { dir } = x;
  const completed = str(it, "_status") === "Completed";
  const assignee = dir.userField(it, "Assignee_User", { dept, name: str(it, "Assignee_Name") || undefined, email: str(it, "Assignee_Email") || undefined });
  const decision = DECISION_OF[str(it, "RMES_Decision")];
  const continueAfter =
    str(it, "Rejection_Handling") === LIST.continueRelease
      ? {
          note: str(it, "Rejection_Note"),
          by: dir.userField(it, "Completed_By", { dept }) || x.ownerId,
          at: completedAtOf(it),
          // separator [unverified]: commas, semicolons or spaces
          depts: str(it, "Rejected_Depts_Covered")
            .split(/[,;\s]+/)
            .map((d) => reviewDeptOf(d))
            .filter((d): d is ReviewDept => !!d),
        }
      : undefined;
  return {
    dept,
    status: completed ? "completed" : str(it, "Activation_Kind") === LIST.track.reopened ? "reopened" : "in-review",
    assigneeId: assignee || (dept === "RMM" ? x.ownerId : dir.roleUser(dept)),
    startedAt: str(it, "_created_at"),
    ...(completed ? { completedAt: completedAtOf(it) } : {}),
    ...(decision ? { decision } : {}),
    ...(str(it, "RMES_Decision_Reason") || decision ? { decisionReason: str(it, "RMES_Decision_Reason") } : {}),
    ...(continueAfter ? { continueAfterRejection: continueAfter } : {}),
  };
}

/** m16: a review item read only as a list row lacks fields its latest snapshot (same department and round) has: those
 *  fill its blanks (RMES_Decision above all; a live My items row lacks even its creation time); the item's own values,
 *  its status first, still win. */
function fillFromSnapshot(t: ReviewTrack, it: RawItem, s: ReviewTrack): ReviewTrack {
  return {
    ...t,
    ...(!has(it, "_created_at") && s.startedAt ? { startedAt: s.startedAt } : {}),
    ...(!has(it, "Assignee_User") && s.assigneeId ? { assigneeId: s.assigneeId } : {}),
    ...(t.status === "completed" && !has(it, "Completed_At") && s.completedAt ? { completedAt: s.completedAt } : {}),
    ...(!has(it, "RMES_Decision") && s.decision ? { decision: s.decision, decisionReason: has(it, "RMES_Decision_Reason") ? str(it, "RMES_Decision_Reason") : (s.decisionReason ?? "") } : {}),
    ...(!has(it, "Rejection_Handling") && s.continueAfterRejection ? { continueAfterRejection: s.continueAfterRejection } : {}),
    ...(!has(it, "Activation_Kind") && t.status === "in-review" && s.status === "reopened" ? { status: "reopened" as const } : {}),
  };
}

function completionOf(it: RawItem, dept: ReviewDept, x: TrackCtx): Confirmation | undefined {
  if (str(it, "_status") !== "Completed") return undefined;
  const by = x.dir.userField(it, "Completed_By", { dept, name: str(it, "Completed_By_Name") || undefined, email: str(it, "Completed_By_Email") || undefined });
  const u = by ? x.dir.get(by) : undefined;
  return { type: "dept-completion", by: by || x.ownerId, name: str(it, "Completed_By_Name") || u?.name || "", email: str(it, "Completed_By_Email") || u?.email || "", role: roleLabel(dept), at: completedAtOf(it), dept, reviewVersion: 1 };
}

/**
 * The case's tracks (RMM first, then the departments), one per department: its latest round, live item before
 * snapshot. Status (DESIGN §5.2 / G17): completed; a Withdrawn item is dropped with a note; while one of the
 * department's points waits for the supplier: waiting-supplier (before "reopened", as the domain's retrack does);
 * Activation_Kind "Reopened": reopened; else in review. Earlier completions give lastCompletedAt and their
 * dept-completion confirmations.
 */
export function reviewsOf(items: RawItem[], snaps: CaseSnapshots["tracks"], points: OpenPoint[], x: TrackCtx): { reviews: ReviewTrack[]; refs: ReviewRef[]; completions: Confirmation[] } {
  const rounds: Round[] = [];
  for (const it of items) {
    const dept = reviewDeptOf(str(it, "Review_Dept"));
    if (!dept) {
      x.notes.push(`${x.caseId}: a review item (${it._id}) has no known department; it is ignored.`);
      continue;
    }
    if (str(it, "_status") === "Withdrawn") {
      // an ended state, not a read problem: a Case administrator may withdraw one in Kissflow (B8)
      x.notes.push(`${x.caseId}: the ${DEPT_SHORT[dept]} review item ${it._id} was withdrawn in Kissflow; it is not shown.`);
      continue;
    }
    rounds.push({ dept, roundNo: Math.max(1, num(it, "Round_No") ?? 1), item: it });
  }
  for (const s of snaps.values()) {
    const d = reviewDeptOf(s.track.dept);
    if (!d) continue;
    const live = rounds.find((r) => r.dept === d && r.roundNo === s.track.roundNo);
    if (live) live.snap = s;
    else rounds.push({ dept: d, roundNo: s.track.roundNo, snap: s });
  }
  const reviews: ReviewTrack[] = [];
  const refs: ReviewRef[] = [];
  const completions: Confirmation[] = [];
  for (const dept of REVIEW_TRACK_DEPTS) {
    const mine = rounds.filter((r) => r.dept === dept).sort((a, b) => a.roundNo - b.roundNo || Number(!!a.item) - Number(!!b.item));
    if (!mine.length) continue;
    // completions of every round (a reopened track keeps the confirmation of the completion it undid, as the domain)
    for (const r of mine) {
      // a list row without its completer: the snapshot's confirmation names who completed it
      const fromSnap = r.item && x.sparse?.has(r.item._id) && !has(r.item, "Completed_By") && str(r.item, "_status") === "Completed" ? r.snap?.confirmation : undefined;
      const c = fromSnap ?? (r.item ? completionOf(r.item, dept, x) : r.snap?.confirmation);
      if (c) completions.push(r.item && r.snap?.confirmation?.note ? { ...c, note: r.snap.confirmation.note } : c);
    }
    const latest = mine.at(-1)!;
    const fromItem = latest.item ? trackFromItem(latest.item, dept, x) : undefined;
    const base: ReviewTrack = fromItem ? (latest.snap && x.sparse?.has(latest.item!._id) ? fillFromSnapshot(fromItem, latest.item!, latest.snap.track) : fromItem) : { ...latest.snap!.track };
    delete (base as Partial<{ roundNo: number }>).roundNo;
    const earlier = mine
      .filter((r) => r !== latest)
      .map((r) => (r.item ? (str(r.item, "_status") === "Completed" ? completedAtOf(r.item) : "") : (r.snap!.track.completedAt ?? "")))
      .filter(validIso)
      .sort((a, b) => time(a) - time(b))
      .at(-1);
    const track: ReviewTrack = { ...base, ...(earlier && base.status !== "completed" ? { lastCompletedAt: earlier } : {}) };
    if (track.status !== "completed") {
      const waiting = points.some((p) => p.dept === dept && p.status === "open");
      if (waiting) track.status = "waiting-supplier";
      else if (track.status === "waiting-supplier") track.status = "in-review";
    }
    if (!track.assigneeId) track.assigneeId = dept === "RMM" ? x.ownerId : x.dir.roleUser(dept);
    reviews.push(track);
    const it = latest.item;
    refs.push({
      caseId: x.caseId,
      dept,
      ...(it ? { itemId: it._id } : latest.snap?.itemId ? { itemId: latest.snap.itemId } : {}),
      roundNo: latest.roundNo,
      reviewKey: (it && str(it, "Review_Key")) || `${x.caseId}-${dept}-${latest.roundNo}`,
      ...(it ? taskOf(it, x.tasks) : {}),
      ...(it && str(it, "_modified_at") ? { modifiedAt: str(it, "_modified_at") } : {}),
      ...(it && str(it, "_status") ? { itemStatus: str(it, "_status") } : {}),
      live: !!it,
    });
  }
  return { reviews, refs, completions };
}

/** The review step a department's task sits at (for the writers' and the loader's step checks). */
export const reviewStepOf = (dept: ReviewDept): string => STEPS.review[dept];

// ---------------------------------------------------------------------------------- RMES

function criterionOf(r: Row, dept: "SAF" | "REG", x: TrackCtx): RmesCriterion | undefined {
  const id = str(r, "Criteria_Code");
  if (!id) return undefined;
  const resultText = str(r, "Criteria_Result");
  const result: RmesResult | undefined = RMES_RESULT_OF[resultText];
  if (resultText && !result) x.notes.push(`${x.caseId} RMES ${id}: the result "${resultText}" has no equivalent here; it is shown as not recorded.`);
  const part = /([ABCD])\s*$/.exec(str(r, "Criteria_Part"))?.[1] as RmesCriterion["part"] | undefined;
  const value = num(r, "Criteria_Reported_Value");
  const limit = num(r, "Criteria_Limit_Value");
  const by = x.dir.userField(r, "Criteria_Recorded_By", { dept });
  return {
    id,
    part: part ?? "A",
    dept,
    title: str(r, "Criteria_Title"),
    source: {
      sectionId: str(r, "Criteria_Source_Section_Key") || "GEN",
      ...(str(r, "Criteria_Source_Field_Key") ? { fieldId: str(r, "Criteria_Source_Field_Key") } : {}),
      version: 1,
      label: str(r, "Criteria_Applicability_Basis") || str(r, "Criteria_Source_Section_Key"),
    },
    ...(result ? { result } : {}),
    ...(str(r, "Criteria_Comment") ? { comment: str(r, "Criteria_Comment") } : result ? { comment: "" } : {}),
    ...(by ? { by } : {}),
    ...(str(r, "Criteria_Recorded_At") ? { at: str(r, "Criteria_Recorded_At") } : {}),
    ...(value !== undefined && limit !== undefined
      ? { limit: { substance: str(r, "Criteria_Source_Value_Text"), value, unit: str(r, "Criteria_Reported_Unit"), limit, limitSetVersion: str(r, "Criteria_Limit_Set_Version"), pass: str(r, "Criteria_Limit_Pass") === LIST.yes } }
      : {}),
    ...(str(r, "Criteria_AI_Suggestion_Text") ? { aiSuggestion: str(r, "Criteria_AI_Suggestion_Text") } : {}),
  };
}

function findingOf(r: Row, dept: "SAF" | "REG"): Finding | undefined {
  const id = str(r, "Findings_Key");
  if (!id) return undefined;
  return {
    id,
    criterionId: str(r, "Findings_Criterion_Code"),
    dept,
    text: str(r, "Findings_Text"),
    blocking: str(r, "Findings_Blocking") === LIST.yes,
    status: str(r, "Findings_State").trim().toLowerCase() === "closed" ? "closed" : "open",
    ...(str(r, "Findings_Linked_OP_Key") ? { openPointId: str(r, "Findings_Linked_OP_Key") } : {}),
  };
}

/** The case's RMES record from the rows this role can read (SAF and/or REG); absent when none (the RMES card then
 *  stays hidden, as for RMM and the other departments). Voided rows are skipped; of several rows the newest counts. */
export function rmesOf(rows: { dept: "SAF" | "REG"; item: RawItem }[], x: TrackCtx): { rmes?: RmesRecord; refs: RmesRef[] } {
  const refs: RmesRef[] = [];
  const criteria: RmesCriterion[] = [];
  const findings: Finding[] = [];
  const created: string[] = [];
  for (const dept of ["REG", "SAF"] as const) {
    const mine = rows.filter((r) => r.dept === dept && str(r.item, "RMES_Voided") !== LIST.yes).sort((a, b) => time(str(b.item, "_modified_at") || str(b.item, "_created_at")) - time(str(a.item, "_modified_at") || str(a.item, "_created_at")));
    if (!mine.length) continue;
    if (mine.length > 1) x.notes.push(`${x.caseId}: ${mine.length} ${DEPT_SHORT[dept]} RMES records exist; the newest is shown.`);
    const it = mine[0]!.item;
    created.push(str(it, "_created_at"));
    const ref: RmesRef = { caseId: x.caseId, dept, itemId: it._id, criteriaRows: {}, findingRows: {} };
    for (const r of childRows(it, TABLES[dept].criteria, "Criteria_Code")) {
      const cr = criterionOf(r, dept, x);
      if (!cr) continue;
      criteria.push(cr);
      if (str(r, "_id")) ref.criteriaRows[cr.id] = str(r, "_id");
    }
    for (const r of childRows(it, TABLES[dept].findings, "Findings_Key")) {
      const f = findingOf(r, dept);
      if (!f) continue;
      findings.push(f);
      if (str(r, "_id")) ref.findingRows[f.id] = str(r, "_id");
    }
    refs.push(ref);
  }
  if (!refs.length) return { refs };
  const createdAt = created.filter(validIso).sort((a, b) => time(a) - time(b))[0] ?? "";
  return { rmes: { createdAt, reviewVersion: 1, criteria, findings }, refs };
}

// ---------------------------------------------------------------------------------- internal notes

/** The case's internal notes (form rows; snapshots stand in for rows this role can't list), oldest first. */
export function notesOf(rows: RawItem[], snaps: CaseSnapshots["notes"], x: TrackCtx): InternalNote[] {
  const out: InternalNote[] = [];
  for (const it of rows) {
    const id = str(it, "Note_Key") || it._id;
    const dept = deptOf(str(it, "Note_Dept"));
    const emails = str(it, "Note_Mentions_Emails").split(/[,;\s]+/).filter(Boolean);
    const names = str(it, "Note_Mentions_Names").split(/\s*[,;]\s*/).filter(Boolean);
    // the names line up with the e-mails only when every person mentioned had one (write/encode.ts noteFields)
    const aligned = names.length === emails.length;
    const mentions = emails.map((e, i) => x.dir.byEmail(e) ?? x.dir.internal(`mail:${e.toLowerCase()}`, { name: aligned ? names[i] : nameFromEmail(e), email: e }));
    // 27 Oct: a colleague mentioned without an e-mail (the directory knew none) is found by their name
    if (!aligned) for (const n of names) {
      const id = x.dir.byName(n);
      if (id && !mentions.includes(id)) mentions.push(id);
    }
    out.push({
      id,
      at: str(it, "Note_At") || str(it, "_created_at"),
      by: x.dir.userField(it, "Note_Author", { dept }) || "system",
      ...(dept ? { dept } : {}),
      text: str(it, "Note_Text"),
      ...(/section/i.test(str(it, "Linked_Kind")) && str(it, "Linked_Key") ? { sectionId: str(it, "Linked_Key") } : {}),
      mentions: [...new Set(mentions)],
    });
  }
  for (const [id, n] of snaps) if (!out.some((o) => o.id === id)) out.push(n);
  return out.sort((a, b) => time(a.at) - time(b.at));
}

