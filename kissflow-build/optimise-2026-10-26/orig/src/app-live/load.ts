// The read ladder of the live internal app (DESIGN §4). Owner D.
// Index first, for every role: the audit form (the universal case index and history: every case has a case.created
// row with its header snapshot) and the configuration rows. Then each process flow climbs its rungs for the acting
// persona (readPlan): admin (flow Admin; a refusal is remembered for the session, a timeout, 429 or network error is
// not) → tasks (My tasks per held step, each
// row read in full through its task) ∪ mine (My items) → byId (case items the index names but no rung read in full:
// the first id probes the route, a refusal skips the rest for this load) → snapshot (the latest audit Snapshot_JSON,
// mapped by map/toAppState). Admin success wins for the data; tasks and mine still list the held steps and the user's
// own drafts (without reading again what admin read). Every rung tried leaves one ReadReport, which Diagnostics shows
// (the morning tests R-1/R-2 read it). The forms the role's grants refuse are skipped, so a refusal is never noise; a
// form that is refused anyway is read as empty with a warning.
// `_activity_instance_id` stays only on items the user holds (tasks rung, own Start drafts), so the writers never act
// on a step they don't hold. A list row whose full read failed is kept as it is (sparse, listed in `sparse`: the mapper
// fills its blanks from the object's latest audit snapshot); an ended open point gives way to the audit snapshot that
// shows it closed, because a sparse row would hide that snapshot's thread.
// Speed (Thomas, 20 Oct: the first load was slow; every SDK call is a round trip through the Kissflow page). What is
// read stays exactly the above; only what waits for what changed. Everything else goes out as soon as ONE index form
// has answered (the load can no longer fail; one that fails reads nothing else). The three process flows and the other
// forms are read side by side. Within a flow every list (admin, each held step's My tasks, My items) goes out at once,
// because none depends on another's answer; the rungs then use them one after the other as before, so an item one
// rung read in full is not read again. Only case's byId waits: it needs the ids the audit rows, the other forms and
// the review and open point items name. Each part keeps its own reports and warnings, joined in a fixed order at the
// end (index, other forms, review, open point, case). The client keeps at most 6 calls in flight (kf/client.ts).
// Also here, pure and testable without React: the drafts split (viewOf), the per-case banner reason, the load-time
// side effects (runLoadEffects), whose body is owner C's ensureRmes, injected, and
// which run only when the reads they decide from answered on this load (effectBlocked), and what the store shows
// between loads (APP-SAVING-GAPS, 20 Oct): a save's read-backs on the last load (withSaved, gap 1), and the last
// load's data where a new load could not read a part again (keepUnread, gap 8: a form, a flow's admin or task lists,
// a form row's own read); and whether a load can decide a review's gate (notReadAgain, gap 9).
// Never calls getParticipatedItems (fails platform-wide). No writes.
import type { AppState, InternalPersonaId, ReviewDept } from "@/domain/types";
import { errorText } from "@/portal/kf/sdk";
import { str, type RawItem } from "@/portal/data/raw";
import type { AppEnv } from "./env";
import { STEPS } from "./ids";
import { isDataRefusal, isRateLimited, pool } from "./kf/client";
import { parseSnapshot } from "./map/auditMap";
import { toAppState } from "./map/toAppState";
import type { Acting, AppClient, FlowKey, FormKey, Identity, LiveIndex, LiveSnapshot, Mapped, ProcessKey, ReadReport, Rung, TaskRef, WriteCtx, WriteResult } from "./types";

/** The flows as their Kissflow names (warnings, draft labels). */
export const FLOW_LABEL: Record<FlowKey, string> = {
  case: "CIQ Case",
  review: "CIQ Review",
  op: "CIQ Open Point",
  audit: "CIQ Audit Event",
  note: "CIQ Internal Note",
  rmesSAF: "CIQ RMES Safety",
  rmesREG: "CIQ RMES Regulatory",
  supplier: "CIQ Supplier",
  config: "CIQ Config Version",
  scopeRun: "CIQ Scope Run",
};

/** The banner reason of a case no rung could read and no error explains (B's wording, map/caseMap.ts). */
export const NO_READ_ROUTE = "no read route for this role";

type ReadForm = Exclude<FormKey, "scopeRun">;
const OTHER_FORMS = ["note", "rmesSAF", "rmesREG", "supplier"] as const satisfies readonly ReadForm[];
const ENDED = new Set(["Completed", "Withdrawn", "Rejected", "Cancelled"]);
const REVIEWERS = new Set<InternalPersonaId>(["reg", "saf", "qm", "mic", "sus"]);
const OP_DEPT_STEPS = (["REG", "SAF", "QM", "MIC", "SUS", "RMM"] as const).map((d) => STEPS.op[d]);
/** Item reads in flight per rung; the client caps the whole load at MAX_IN_FLIGHT. */
const LANES = 6;
/** The forms with child tables, whose list rows lack them (read item by item; see readForm). */
const CHILD_TABLE_FORMS: ReadonlySet<ReadForm> = new Set(["supplier", "rmesSAF", "rmesREG"]);
/** What a form's child tables hold, for the warnings. */
const ROWS_OF: Partial<Record<ReadForm, string>> = { supplier: "contacts", rmesSAF: "criteria and findings", rmesREG: "criteria and findings" };

// ---------------------------------------------------------------------------------- the plan per persona

export interface FlowPlan {
  /** Activity ids of the steps whose My tasks list is read. */
  tasks: string[];
  /** My items (what the user started). */
  mine: boolean;
  /** Items the index names but no rung read: adminGet / getById, probing the first. */
  byId: boolean;
}
export interface ReadPlan {
  process: Record<ProcessKey, FlowPlan>;
  /** Forms read; false = skipped (the role's grant refuses it, DESIGN §4 table). */
  forms: Record<ReadForm, boolean>;
}

/** DESIGN §4: what each persona reads. The admin rung is tried for every process flow and every persona. */
export function readPlan(acting: Pick<Acting, "personaId" | "dept">): ReadPlan {
  const p = acting.personaId;
  const rmm = p === "rmm";
  const reviewer = REVIEWERS.has(p);
  const raiser = rmm || reviewer;
  const ownReview = rmm ? [STEPS.review.RMM] : reviewer && acting.dept ? [STEPS.review[acting.dept as ReviewDept]] : [];
  return {
    process: {
      case: { tasks: [], mine: rmm, byId: true },
      review: { tasks: ownReview, mine: rmm, byId: false },
      // every raiser holds its points at the department step (field-assigned by Raiser_Assignee): all six steps
      op: { tasks: raiser ? OP_DEPT_STEPS : [], mine: raiser, byId: false },
    },
    forms: {
      audit: true,
      config: true,
      note: true,
      rmesSAF: acting.dept === "SAF" || p === "auditor",
      rmesREG: acting.dept === "REG" || p === "auditor",
      supplier: rmm || p === "admin",
    },
  };
}

// ---------------------------------------------------------------------------------- session memory

/** Flows whose admin rung was refused, per client (= per session: the app makes one client per handshake). */
const adminRefused = new WeakMap<AppClient, Set<ProcessKey>>();
const refusedFor = (client: AppClient): Set<ProcessKey> => {
  let s = adminRefused.get(client);
  if (!s) adminRefused.set(client, (s = new Set()));
  return s;
};

/** The admin rung's report on a flow refused earlier in this session (no call made). */
export const REFUSED_EARLIER = "Refused earlier in this session; not tried again.";

/** A refusal Kissflow would give again (a permission or data refusal, 0503xx): the admin rung remembers it for the
 *  session. A timeout ("did not answer within"), a rate limit (429) or a network error is not one: the next load tries
 *  again (APP-SAVING-GAPS gap 8; before, any failure hid the admin view until the session ended). */
export function isRefusal(e: unknown): boolean {
  const t = errorText(e);
  if (isRateLimited(e) || /did not answer within/i.test(t)) return false;
  // a 404 too: Kissflow answers a role without the list's route that way (DESIGN R-1, process lists for viewers)
  return isDataRefusal(e) || /\b0503\d\d\b|KISSFLOW_ERROR_0503\d\d|permission|not authori[sz]ed|forbidden|access denied|\b40[34]\b|not found/i.test(t);
}

// ---------------------------------------------------------------------------------- collecting items

interface Got {
  item: RawItem;
  /** Read through getTask / adminGet / getById (a list row is not full). */
  full: boolean;
}

class Collected {
  readonly byId = new Map<string, Got>();
  /** Why the latest full read of an item failed (also for ids no rung listed). */
  readonly why = new Map<string, string>();
  add(item: RawItem, full: boolean): void {
    const cur = this.byId.get(item._id);
    if (!cur) this.byId.set(item._id, { item, full });
    else if (full || !cur.full) this.byId.set(item._id, { item: { ...cur.item, ...item }, full: full || cur.full });
    else this.byId.set(item._id, { ...cur, item: { ...item, ...cur.item } }); // a full read wins over a later row
  }
  failed(id: string, why: string): void {
    if (!this.isFull(id)) this.why.set(id, why);
  }
  isFull(id: string): boolean {
    return !!this.byId.get(id)?.full;
  }
}

/** One part of a load (a form, a process flow): its own reports and warnings, so parts read side by side never mix. */
interface Log {
  reads: ReadReport[];
  warnings: string[];
}
const newLog = (): Log => ({ reads: [], warnings: [] });

/** A call sent ahead of the rung that uses it. It never rejects (a refusal no rung looked at yet would be an unhandled
 *  rejection); `answer` gives its value or throws its refusal where the rung reads it. */
type Ahead<T> = Promise<{ ok: true; value: T } | { ok: false; error: unknown }>;
function ahead<T>(send: () => Promise<T>): Ahead<T> {
  let p: Promise<T>;
  try {
    p = send();
  } catch (e) {
    p = Promise.reject(e); // a call that throws at once is a refusal like any other
  }
  return p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}
async function answer<T>(a: Ahead<T>): Promise<T> {
  const r = await a;
  if (r.ok) return r.value;
  throw r.error;
}

/** Times one rung and records its report; the body returns the row count. A throw is a refusal (ok: false). `t0` is
 *  when the rung's first call went out (its list may have gone out ahead of it, with the flow's other lists). */
async function rung(reads: ReadReport[], flow: FlowKey, r: Rung, body: () => Promise<number>, t0 = Date.now()): Promise<boolean> {
  try {
    const count = await body();
    reads.push({ flow, rung: r, ok: true, count, ms: Date.now() - t0 });
    return true;
  } catch (e) {
    reads.push({ flow, rung: r, ok: false, count: 0, ms: Date.now() - t0, error: errorText(e) });
    return false;
  }
}

const skipped = (flow: FlowKey): ReadReport => ({ flow, rung: "skipped", ok: true, count: 0, ms: 0 });
const actOfRow = (it: RawItem): string => {
  const a = str(it, "_activity_instance_id");
  if (a) return a;
  const ctx = Array.isArray(it._current_context) ? (it._current_context[0] as Record<string, unknown> | undefined) : undefined;
  return str(ctx, "_context_activity_instance_id");
};

// ---------------------------------------------------------------------------------- the ladder

interface FlowRead {
  got: Collected;
  tasks: TaskRef[];
}

/** One process flow up its rungs. `knownIds` (case only) is awaited by the byId rung alone: the ids the index, the other
 *  forms and the other flows name. */
async function readProcess(client: AppClient, flow: ProcessKey, plan: FlowPlan, knownIds: () => Promise<Set<string>>, log: Log): Promise<FlowRead> {
  const { reads, warnings } = log;
  const got = new Collected();
  const tasks = new Map<string, TaskRef>();
  const refused = refusedFor(client);

  // the flow's lists go out together (none needs another's answer); the rungs below take them in their order
  const t0 = Date.now();
  const adminRows = refused.has(flow) ? undefined : ahead(() => client.adminList(flow));
  const taskLists = plan.tasks.map((activityId) => ahead(() => client.myTasks(flow, activityId)));
  const myRows = plan.mine ? ahead(() => client.myItems(flow)) : undefined;

  // admin: every item, each read in full (admin rows are sparse and carry no step)
  if (adminRows) {
    let adminError: unknown;
    const adminOk = await rung(reads, flow, "admin", async () => {
      const rows = await answer(adminRows).catch((e: unknown) => {
        adminError = e;
        throw e;
      });
      for (const r of rows) got.add(r, false);
      await pool(rows, LANES, async (r) => {
        try {
          got.add(await client.adminGet(flow, r._id), true);
        } catch (e) {
          got.failed(r._id, errorText(e));
          warnings.push(`${FLOW_LABEL[flow]} ${r._id}: ${errorText(e)}`);
        }
      });
      return rows.length;
    }, t0);
    if (!adminOk && isRefusal(adminError)) refused.add(flow);
  } else {
    reads.push({ flow, rung: "admin", ok: false, count: 0, ms: 0, error: REFUSED_EARLIER });
  }

  // tasks and mine run after an admin read too: they say which steps the user holds and which drafts are theirs (an
  // item the admin rung read in full is not read again).
  // tasks: the steps the user holds; each row read in full through its own task
  if (plan.tasks.length) {
    await rung(reads, flow, "tasks", async () => {
      const listed: { row: RawItem; activityId: string }[] = [];
      const errors: string[] = [];
      // in the plan's step order, as when the lists were read one by one
      const lists = await Promise.all(taskLists);
      lists.forEach((l, i) => {
        if (l.ok) for (const row of l.value) listed.push({ row, activityId: plan.tasks[i] });
        else errors.push(errorText(l.error));
      });
      await pool(listed, LANES, async ({ row, activityId }) => {
        const act = str(row, "_activity_instance_id");
        got.add(row, false);
        if (!act) {
          warnings.push(`${FLOW_LABEL[flow]} ${row._id}: listed without its step, so it can't be opened.`);
          return;
        }
        tasks.set(`${row._id}|${act}`, { flow, itemId: row._id, act, activityId });
        if (got.isFull(row._id)) return;
        try {
          got.add({ ...(await client.getTask(flow, row._id, act)), _activity_instance_id: act }, true);
        } catch (e) {
          got.failed(row._id, errorText(e));
          warnings.push(`${FLOW_LABEL[flow]} ${row._id}: ${errorText(e)}`);
        }
      });
      if (errors.length) throw new Error(`${errors.length} of ${plan.tasks.length} task lists refused: ${[...new Set(errors)].join("; ")} (${listed.length} rows from the others)`);
      return listed.length;
    }, t0);
  }

  // mine: what the user started. An own Start draft is held (read and listed as a draft); another open item is
  // read through its current step [unverified for an initiator who is not the assignee]: the first refusal skips
  // the others (one probe per flow and load); an ended item is kept as listed. A live My items row carries only
  // Name, _activity_id, _activity_instance_id, _current_assigned_to, _current_step, _id, _modified_at, _progress and
  // _status (+ _completed_at), proven 21 Oct: no _created_by and no business field, so nothing here may need one.
  if (myRows) {
    const keys = new Set<string>();
    const ok = await rung(reads, flow, "mine", async () => {
      const rows = await answer(myRows);
      let probeFailed = false;
      for (const row of rows) {
        for (const k of Object.keys(row)) keys.add(k);
        got.add(row, false);
        const act = actOfRow(row);
        const status = str(row, "_status");
        if (!act || ENDED.has(status)) continue;
        // an own draft sits at Start, which its creator holds. My items lists only what the user started, so every
        // Draft row there is the user's own (before, a Draft also had to name the user as _created_by, which no live
        // row does: an own unsent draft got no task, so Diagnostics never listed it and no twin check saw it)
        const draft = status === "Draft";
        if (draft) tasks.set(`${row._id}|${act}`, { flow, itemId: row._id, act, activityId: STEPS[flow].start });
        if (got.isFull(row._id) || (!draft && probeFailed)) continue;
        try {
          got.add({ ...(await client.getTask(flow, row._id, act)), _activity_instance_id: act }, true);
        } catch (e) {
          got.failed(row._id, errorText(e));
          if (draft) warnings.push(`${FLOW_LABEL[flow]} ${row._id}: your unsent draft could not be read (${errorText(e)}).`);
          else probeFailed = true;
        }
      }
      return rows.length;
    }, t0);
    // morning test R-1: which fields a live My items row carries (Diagnostics lists them); this flow's own log
    const rep = reads.at(-1);
    if (ok && rep?.flow === flow && rep.rung === "mine") rep.keys = [...keys].sort();
  }

  // byId: items the index names that no rung read in full
  if (plan.byId) {
    const todo = [...new Set([...(await knownIds()), ...got.byId.keys()])].filter((id) => !got.isFull(id));
    if (todo.length) {
      const routes: ("adminGet" | "getById")[] = refused.has(flow) ? ["getById"] : ["adminGet", "getById"];
      await rung(reads, flow, "byId", async () => {
        // the probe: the first id through each route in turn; the route that answers reads the rest
        let route: "adminGet" | "getById" | undefined;
        const errors: string[] = [];
        for (const r of routes) {
          try {
            got.add(await client[r](flow, todo[0]), true);
            route = r;
            break;
          } catch (e) {
            errors.push(errorText(e));
          }
        }
        if (!route) {
          for (const id of todo) got.failed(id, errors.at(-1)!);
          throw new Error(errors.join("; "));
        }
        const via = route;
        await pool(todo.slice(1), LANES, async (id) => {
          try {
            got.add(await client[via](flow, id), true);
          } catch (e) {
            got.failed(id, errorText(e));
          }
        });
        return todo.filter((id) => got.isFull(id)).length;
      });
    }
  }
  return { got, tasks: [...tasks.values()] };
}

/** Audit rows' objects per process flow: the item ids their snapshots describe, and whether that snapshot shows the
 *  object closed (an op closed, a track completed). Latest row wins. */
function snapshotObjects(audit: RawItem[]): Record<ProcessKey, Map<string, { closed: boolean }>> {
  const out: Record<ProcessKey, Map<string, { closed: boolean }>> = { case: new Map(), review: new Map(), op: new Map() };
  const rows = [...audit].sort((a, b) => (str(a, "Event_At") || str(a, "_created_at")).localeCompare(str(b, "Event_At") || str(b, "_created_at")));
  for (const row of rows) {
    const s = parseSnapshot(row);
    if (!s) continue;
    const objectId = str(row, "Object_Item_Id");
    if (s.case) {
      const id = s.case.itemId || objectId || str(row, "Case_Item_Id");
      if (id) out.case.set(id, { closed: false });
    }
    if (s.track && objectId) out.review.set(objectId, { closed: s.track.status === "completed" });
    if (s.op && objectId) out.op.set(objectId, { closed: s.op.status === "closed" });
  }
  return out;
}

/** Case item ids the index names: audit rows, case.created snapshots, and every item or row that names its case. */
function knownCaseIds(audit: RawItem[], others: RawItem[], snaps: Map<string, unknown>): Set<string> {
  const ids = new Set<string>(snaps.keys());
  for (const r of [...audit, ...others]) {
    const id = str(r, "Case_Item_Id");
    if (id) ids.add(id);
  }
  return ids;
}

/** What one process flow gives the snapshot, worked out from its read and the audit snapshots. */
interface FlowItems {
  kept: RawItem[];
  tasks: TaskRef[];
  sparse: string[];
  /** Case only: the case items no rung read in full, with why. */
  unreadable: Record<string, string>;
}

/** The items of one flow as the snapshot keeps them; also pushes the flow's snapshot rung report (into its own log). */
function itemsOf(flow: ProcessKey, r: FlowRead, snaps: ReturnType<typeof snapshotObjects>, audit: { error?: string }, known: Set<string>, reads: ReadReport[]): FlowItems {
  const held = new Map(r.tasks.map((t) => [t.itemId, t.act]));
  const kept: RawItem[] = [];
  const sparse: string[] = [];
  const unreadable: Record<string, string> = {};
  let fromSnapshots = 0;
  for (const [id, g] of r.got.byId) {
    const { _activity_instance_id: _a, ...rest } = g.item;
    void _a;
    const it = (held.has(id) ? { ...rest, _activity_instance_id: held.get(id)! } : rest) as RawItem;
    if (flow === "case" && !g.full) unreadable[id] = r.got.why.get(id) || NO_READ_ROUTE;
    // an ended open point we could not read in full: the snapshot that shows it closed tells more (its thread). So does
    // any snapshot of a point listed only by My items, whose live row carries none of the point's fields (no OP_Key,
    // no case, no question: mapped, it would show an empty point, or none); a cancellation that ended it closes it from
    // the case's history (trackMap closeByCancellation). A review row is kept (its live status decides the case's
    // phase): the mapper places it by the history and fills its blanks from the snapshot
    // (map/toAppState.ts, map/trackMap.ts reviewsOf).
    if (flow === "op" && !g.full && snaps[flow].has(id) && (!str(it, DRAFT_KEY.op) || (ENDED.has(str(it, "_status")) && snaps[flow].get(id)!.closed))) {
      fromSnapshots++;
      continue;
    }
    if (flow !== "case" && !g.full) sparse.push(id);
    kept.push(it);
  }
  if (flow === "case") for (const id of known) if (!r.got.byId.has(id)) unreadable[id] = r.got.why.get(id) || NO_READ_ROUTE;
  // the snapshot rung serves what no live rung read
  const unread = flow === "case" ? Object.keys(unreadable).length : fromSnapshots + [...snaps[flow].keys()].filter((id) => !r.got.byId.has(id)).length;
  const anyLive = reads.some((x) => x.flow === flow && x.ok && x.rung !== "snapshot");
  if (unread > 0 || !anyLive) reads.push({ flow, rung: "snapshot", ok: !audit.error, count: unread, ms: 0, ...(audit.error ? { error: audit.error } : {}) });
  return { kept, tasks: r.tasks, sparse, unreadable };
}

/** True as soon as one of the reads answered; false once every one failed. */
function anyAnswered(reads: Promise<{ error?: string }>[]): Promise<boolean> {
  return new Promise((resolve) => {
    let failed = 0;
    const fail = () => {
      if (++failed === reads.length) resolve(false);
    };
    for (const p of reads) void p.then((r) => (r.error ? fail() : resolve(true)), fail);
  });
}

/**
 * Reads everything the acting persona may read (DESIGN §4). Throws only when neither the case index (audit) nor the
 * configuration could be read (the first load then shows a full-page error); every other refusal is a ReadReport, a
 * warning, an unreadable case or a skipped rung. The read needs no identity (`_identity` keeps DESIGN §3's signature):
 * My items lists only what the signed-in user started, and its rows name nobody (no _created_by, live 21 Oct).
 */
export async function loadSnapshot(client: AppClient, _identity: Identity, acting: Acting): Promise<LiveSnapshot> {
  const plan = readPlan(acting);
  const formLog = { audit: newLog(), config: newLog(), note: newLog(), rmesSAF: newLog(), rmesREG: newLog(), supplier: newLog() } satisfies Record<ReadForm, Log>;
  const flowLog = { review: newLog(), op: newLog(), case: newLog() } satisfies Record<ProcessKey, Log>;
  /** The rows whose full read failed, per form (keepUnread fills their child tables from the last load). */
  const unreadRows: Partial<Record<ReadForm, string[]>> = {};

  const readForm = async (f: ReadForm): Promise<{ rows: RawItem[]; error?: string }> => {
    const { reads, warnings } = formLog[f];
    if (!plan.forms[f]) {
      reads.push(skipped(f));
      return { rows: [] };
    }
    let rows: RawItem[] = [];
    let error: string | undefined;
    const ok = await rung(reads, f, "form", async () => {
      try {
        rows = await client.formList(f);
      } catch (e) {
        error = errorText(e);
        throw e;
      }
      return rows.length;
    });
    if (!ok) warnings.push(`${FLOW_LABEL[f]} could not be read: ${error}`);
    // Kissflow's form list leaves the child tables out (proven live 20 Oct: a supplier's list row has no Contacts, its
    // full read has them); a form with child tables is read item by item. A failed full read keeps the list row.
    if (ok && CHILD_TABLE_FORMS.has(f) && rows.length) {
      rows = await pool(rows, LANES, async (row) => {
        try {
          return { ...row, ...(await client.formGet(f, row._id)) };
        } catch (e) {
          warnings.push(`${FLOW_LABEL[f]} ${row._id}: its rows (${ROWS_OF[f]}) could not be read: ${errorText(e)}`);
          (unreadRows[f] ??= []).push(row._id);
          return row;
        }
      });
    }
    return { rows, ...(error ? { error } : {}) };
  };

  // the index first, for every role. The rest goes out once ONE of the two has answered: from then on the load cannot
  // fail, and a load that fails reads nothing else
  const auditP = readForm("audit");
  const configP = readForm("config");
  if (!(await anyAnswered([auditP, configP]))) throw new Error(`Kissflow did not let this app read its case index or its configuration: ${(await auditP).error}`);

  // the process flows and the other forms side by side, sent in this order (the client keeps 6 in flight). Only case's
  // byId rung waits: for the ids the audit rows, the other forms and the review and open point items name
  const snapsP = auditP.then((a) => snapshotObjects(a.rows));
  const itemsP = (flow: ProcessKey, r: Promise<FlowRead>, known: () => Promise<Set<string>>) =>
    Promise.all([r, snapsP, auditP]).then(async ([read, s, a]) => itemsOf(flow, read, s, a, await known(), flowLog[flow].reads));
  const noIds = async () => new Set<string>();
  const reviewP = itemsP("review", readProcess(client, "review", plan.process.review, noIds, flowLog.review), noIds);
  const opP = itemsP("op", readProcess(client, "op", plan.process.op, noIds, flowLog.op), noIds);
  const formsP = Promise.all(OTHER_FORMS.map(async (f) => [f, (await readForm(f)).rows] as const));
  let caseIds: Promise<Set<string>> | undefined;
  const knownIds = () => (caseIds ??= Promise.all([auditP, snapsP, reviewP, opP, formsP]).then(([a, s, rv, o, fs]) => knownCaseIds(a.rows, [...rv.kept, ...o.kept, ...fs.flatMap(([, rows]) => rows)], s.case)));
  const caseP = itemsP("case", readProcess(client, "case", plan.process.case, knownIds, flowLog.case), knownIds);
  const [review, op, kase, forms, audit, config] = await Promise.all([reviewP, opP, caseP, formsP, auditP, configP]);

  const unreadableCases = kase.unreadable;
  const sparse = [...review.sparse, ...op.sparse, ...kase.sparse];
  // every part's reports and warnings in a fixed order, whatever answered first
  const logs: Log[] = [...Object.values(formLog), flowLog.review, flowLog.op, flowLog.case];
  const warnings = logs.flatMap((l) => l.warnings);
  const n = Object.keys(unreadableCases).length;
  if (n) warnings.push(`${n} case${n === 1 ? "" : "s"} could not be read in full for your role; their questionnaire answers are missing (Diagnostics shows why).`);
  return {
    loadedAt: new Date().toISOString(),
    items: { review: review.kept, op: op.kept, case: kase.kept },
    forms: { audit: audit.rows, config: config.rows, ...(Object.fromEntries(forms) as Record<(typeof OTHER_FORMS)[number], RawItem[]>) },
    tasks: [...review.tasks, ...op.tasks, ...kase.tasks],
    unreadableCases,
    ...(sparse.length ? { sparse } : {}),
    reads: logs.flatMap((l) => l.reads),
    warnings,
    ...(Object.keys(unreadRows).length ? { unreadRows } : {}),
  };
}

// ---------------------------------------------------------------------------------- drafts, mapping, banner

/** An own Start draft the screens left unsent (the Mandatory gate stopped it): Diagnostics offers Send / Discard. */
export interface DraftRef {
  flow: ProcessKey;
  itemId: string;
  act: string;
  activityId: string;
  label: string;
}

const isDraft = (it: RawItem) => str(it, "_status") === "Draft";

/** A draft as the shell and Diagnostics name it. Its keys, else (dev only) its Kissflow item id: production names an
 *  unread draft by its kind alone (FE-CLEANUP C23). */
function draftLabel(flow: ProcessKey, it: RawItem, env?: AppEnv): string {
  const id = env === "prod" ? "" : it._id;
  const named = (kind: string, key: string) => [kind, key].filter(Boolean).join(" ");
  if (flow === "case") return `${named("New case", str(it, "Case_Code") || id)}${str(it, "Trade_Name") ? ` · ${str(it, "Trade_Name")}` : ""}`;
  if (flow === "review") return named("Review", str(it, "Review_Key") || [str(it, "Case_Code"), str(it, "Review_Dept")].filter(Boolean).join(" ") || id);
  return `${named("Open point", str(it, "OP_Key") || id)}${str(it, "Case_Code") ? ` on ${str(it, "Case_Code")}` : ""}`;
}

/** The user's own unsent drafts: the Draft items held at their Start step. Only the mine rung holds a Start step, and
 *  only for a Draft row of My items, which lists what the user started; no _created_by is needed (a live row has none,
 *  and a draft whose full read failed is only that row). */
export function draftsOf(snap: LiveSnapshot, env?: AppEnv): DraftRef[] {
  const out: DraftRef[] = [];
  for (const t of snap.tasks) {
    const it = snap.items[t.flow].find((x) => x._id === t.itemId);
    if (!it || !isDraft(it) || t.activityId !== STEPS[t.flow].start) continue;
    out.push({ flow: t.flow, itemId: t.itemId, act: t.act, activityId: t.activityId, label: draftLabel(t.flow, it, env) });
  }
  return out;
}

/** The snapshot without Draft items (and their tasks): an unsent item is not part of any case yet. */
export function withoutDrafts(snap: LiveSnapshot): LiveSnapshot {
  const drafts = new Set<string>();
  const items = {} as Record<ProcessKey, RawItem[]>;
  for (const f of ["case", "review", "op"] as const) {
    items[f] = snap.items[f].filter((it) => {
      if (isDraft(it)) drafts.add(it._id);
      return !isDraft(it);
    });
  }
  if (!drafts.size) return snap;
  const unreadableCases = Object.fromEntries(Object.entries(snap.unreadableCases).filter(([id]) => !drafts.has(id)));
  return { ...snap, items, tasks: snap.tasks.filter((t) => !drafts.has(t.itemId)), unreadableCases };
}

export interface LoadedView {
  /** As read (drafts included). */
  snap: LiveSnapshot;
  /** The screens' state and the writers' index (drafts left out). */
  mapped: Mapped;
  drafts: DraftRef[];
  /** The load's and the mapper's warnings (what could not be read), once each. */
  warnings: string[];
  /** The mapper's notes (how odd rows were mapped; dev only), once each. */
  notes: string[];
  /** Cases left out because they could not be mapped (their codes). */
  dropped: string[];
}

/** The field that names a process item across its drafts and twins (LiveIndex.ownDraftKeys "<flow>|<value>"). */
export const DRAFT_KEY: Record<ProcessKey, string> = { case: "Case_Code", review: "Review_Key", op: "OP_Key" };

/** The key that stands for an own draft whose key is unknown ("<flow>|*", LiveIndex.ownDraftKeys). */
export const UNKNOWN_DRAFT_KEY = "*";

/** Whether this load read the item in full (a case item no rung read in full is unreadable; a review or open point
 *  row is sparse). */
const readInFull = (snap: LiveSnapshot, flow: ProcessKey, id: string): boolean => (flow === "case" ? !(id in snap.unreadableCases) : !snap.sparse?.includes(id));

/** The keys of the user's own unsent drafts ("<flow>|<key>", LiveIndex.ownDraftKeys). A draft whose full read failed
 *  is only its My items row, which carries no key (live 21 Oct): "<flow>|*" stands for it, so no create of that flow
 *  can twin it until a load reads it (ownDraftHas). A draft read in full whose key is blank (one opened in Kissflow's
 *  own form and left) names no key: it can't be any new item's twin, so it holds none. */
export function ownDraftKeysOf(snap: LiveSnapshot, drafts: DraftRef[]): Set<string> {
  const out = new Set<string>();
  for (const d of drafts) {
    const key = str(snap.items[d.flow].find((x) => x._id === d.itemId), DRAFT_KEY[d.flow]);
    if (key) out.add(`${d.flow}|${key}`);
    else if (!readInFull(snap, d.flow, d.itemId)) out.add(`${d.flow}|${UNKNOWN_DRAFT_KEY}`);
  }
  return out;
}

/** Whether a new `flow` item keyed `key` could twin one of the user's own unsent drafts: that draft's key, or an own
 *  draft of the flow whose key could not be read ("<flow>|*"). */
export const ownDraftHas = (keys: ReadonlySet<string> | undefined, flow: ProcessKey, key: string): "same" | "unread" | undefined =>
  keys?.has(`${flow}|${key}`) ? "same" : keys?.has(`${flow}|${UNKNOWN_DRAFT_KEY}`) ? "unread" : undefined;

/** The snapshot as the screens see it, in the environment `env` (production words a few things plainly). Pure (the
 *  store syncs the registry with mapped.state.config). */
export function viewOf(snap: LiveSnapshot, identity: Identity, acting: Acting, env?: AppEnv): LoadedView {
  const mapped = toAppState({ snap: withoutDrafts(snap), identity, acting, ...(env ? { env } : {}) });
  const drafts = draftsOf(snap, env);
  // a draft is not part of any case yet, but the load-time effects must not create its twin (M1)
  mapped.index.ownDraftKeys = ownDraftKeysOf(snap, drafts);
  return { snap, mapped, drafts, warnings: [...new Set([...snap.warnings, ...mapped.warnings])], notes: [...new Set(mapped.notes)], dropped: mapped.dropped };
}

/** The oldest load whose data a part of this snapshot still shows (keepUnread), if any: production's "parts of the page
 *  show the state of HH:MM" (FE-CLEANUP C1). */
export function keptSince(snap: Pick<LiveSnapshot, "kept" | "keptRows">): string | undefined {
  const at = [...Object.values(snap.kept ?? {}), ...Object.values(snap.keptRows ?? {})].filter((x): x is string => !!x).sort();
  return at[0];
}

/** Why a case's questionnaire is missing, for the shell's banner (the shell writes the sentence around it); undefined
 *  when the case was read in full. B's index.caseBanners holds the whole sentence (plus pin problems, also warnings). */
export function caseBannerOf(index: LiveIndex, snap: Pick<LiveSnapshot, "unreadableCases">, caseId: string): string | undefined {
  const ref = index.cases.get(caseId);
  if (!ref || ref.readable) return undefined;
  // the shell closes the sentence itself: no trailing full stop from Kissflow's text
  return (snap.unreadableCases[ref.itemId] || NO_READ_ROUTE).trim().replace(/[.\s]+$/, "") || NO_READ_ROUTE;
}

// ---------------------------------------------------------------------------------- between loads

const PROCESS_KEYS: readonly ProcessKey[] = ["case", "review", "op"];
const isProcess = (f: FlowKey): f is ProcessKey => (PROCESS_KEYS as readonly FlowKey[]).includes(f);

/**
 * The snapshot with a save's read-backs (APP-SAVING-GAPS gap 1; the portal's withSavedRequests): the store shows the
 * items exactly as Kissflow read them back after the write, instead of reading everything again. Each saved item is
 * merged over its row (same `_id`), keeping the row's own `_activity_instance_id`, so a step stays held only where the
 * load found it held; an item the load did not have (a new note, a new supplier) is appended without one, and so is
 * the job's audit row. A process item read back in full is no longer a sparse row, nor a form row read back (with its
 * child tables) an unread or kept one. Nothing is read; `saved` is in write order (a later entry of the same item is
 * newer).
 */
export function withSaved(snap: LiveSnapshot, saved: readonly { flow: FlowKey; item: RawItem }[], auditRow?: RawItem): LiveSnapshot {
  const all = auditRow ? [...saved, { flow: "audit" as const, item: auditRow }] : saved;
  if (!all.length) return snap;
  const items = { ...snap.items };
  const forms = { ...snap.forms };
  const full = new Set<string>(all.map((x) => x.item._id));
  const put = (rows: RawItem[], it: RawItem): RawItem[] => {
    const { _activity_instance_id: _a, ...back } = it;
    void _a;
    const i = rows.findIndex((r) => r._id === it._id);
    if (i < 0) return [...rows, back as RawItem];
    const own = rows[i]._activity_instance_id;
    return rows.map((r, k) => (k === i ? ({ ...r, ...back, ...(own !== undefined ? { _activity_instance_id: own } : {}) } as RawItem) : r));
  };
  for (const { flow, item } of all) {
    if (isProcess(flow)) items[flow] = put(items[flow], item);
    else if (flow !== "scopeRun") forms[flow] = put(forms[flow], item);
  }
  const sparse = snap.sparse?.filter((id) => !full.has(id));
  const unreadRows = Object.fromEntries(Object.entries(snap.unreadRows ?? {}).map(([f, ids]) => [f, ids.filter((id) => !full.has(id))]).filter(([, ids]) => ids.length));
  const keptRows = Object.fromEntries(Object.entries(snap.keptRows ?? {}).filter(([id]) => !full.has(id)));
  const { sparse: _s, unreadRows: _u, keptRows: _k, ...rest } = snap;
  void _s;
  void _u;
  void _k;
  return { ...rest, items, forms, ...(sparse?.length ? { sparse } : {}), ...(Object.keys(unreadRows).length ? { unreadRows } : {}), ...(Object.keys(keptRows).length ? { keptRows } : {}) };
}

/** HH:MM of an ISO time, in the browser's time zone. */
const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** The warning of a flow shown as an earlier load read it. */
export const keptText = (flow: FlowKey, at: string) => `${FLOW_LABEL[flow]} shown as of ${hhmm(at)}: it could not be read again.`;
/** The warning of a form row shown with the child tables an earlier load read. */
export const keptRowText = (form: FlowKey, id: string, at: string) => `${FLOW_LABEL[form]} ${id}: its ${ROWS_OF[form as ReadForm] ?? "rows"} shown as of ${hhmm(at)}: they could not be read again.`;

/** The rungs whose failure keeps a process flow's last data (snapshot and skipped are not data; My items and byId only
 *  add to what admin and the task lists give, and the snapshot rung serves what they miss), and a form's. */
const LIVE_RUNGS: ReadonlySet<Rung> = new Set<Rung>(["admin", "tasks"]);
const FORM_RUNG: ReadonlySet<Rung> = new Set<Rung>(["form"]);

const noStep = (it: RawItem): RawItem => {
  const { _activity_instance_id: _a, ...rest } = it;
  void _a;
  return rest as RawItem;
};

/**
 * A new load with the parts it could not read again taken from the previous load (APP-SAVING-GAPS gap 8; the portal
 * keeps its last good data when a read fails): one transient error must not blank good data (an RMES record whose
 * form read failed would unmount the reviewer's unsaved criterion comments; a flow whose task list failed would lose
 * its held steps).
 * - A form whose list failed now but answered before: its previous rows.
 * - A form row whose full read failed now (its list row has no child tables): the previous load's row under the new
 *   list row, so its criteria, findings or contacts stay (`keptRows`, each with a warning).
 * - A process flow whose admin or tasks rung failed now but answered before: the items this load read win, the ones it
 *   no longer has come from the previous load (a list row this load could not read in full is laid over the previous
 *   load's full read). The held steps are this load's when its task lists answered (an item from the previous load
 *   then holds no step), else the previous load's for every item this load holds none of.
 * A rung skipped as refused earlier in the session is not a failure (that refusal stands; the other rungs' answer is the
 * data now). Each kept part gets a warning with the time it was read, and `kept` carries that time on to the next load,
 * so a part that keeps failing keeps its last good data. `prev` must be the same persona's load. The read reports stay
 * as they are (Diagnostics shows what failed).
 */
export function keepUnread(prev: LiveSnapshot | undefined, next: LiveSnapshot): LiveSnapshot {
  if (!prev) return next;
  const answered = (flow: FlowKey, rung: Rung) => prev.kept?.[flow] !== undefined || prev.reads.some((r) => r.flow === flow && r.rung === rung && r.ok);
  const failed = (flow: FlowKey, rungs: ReadonlySet<Rung>) => next.reads.filter((r) => r.flow === flow && rungs.has(r.rung) && !r.ok && r.error !== REFUSED_EARLIER);
  const kept: Partial<Record<FlowKey, string>> = {};
  const keptRows: Record<string, string> = {};
  const warnings: string[] = [];
  const forms = { ...next.forms };
  for (const f of Object.keys(next.forms) as ReadForm[]) {
    if (failed(f, FORM_RUNG).length && answered(f, "form")) {
      forms[f] = prev.forms[f];
      kept[f] = prev.kept?.[f] ?? prev.loadedAt;
      for (const r of forms[f]) if (prev.keptRows?.[r._id]) keptRows[r._id] = prev.keptRows[r._id];
      continue;
    }
    const unread = new Set(next.unreadRows?.[f] ?? []);
    if (!unread.size) continue;
    const before = new Map(prev.forms[f].map((r) => [r._id, r]));
    forms[f] = forms[f].map((row) => {
      const old = unread.has(row._id) ? before.get(row._id) : undefined;
      // only a previous row that holds more than the list row (its child tables) helps
      if (!old || !Object.keys(old).some((k) => !(k in row))) return row;
      const at = prev.keptRows?.[row._id] ?? prev.kept?.[f] ?? prev.loadedAt;
      keptRows[row._id] = at;
      warnings.push(keptRowText(f, row._id, at));
      return { ...old, ...row };
    });
  }
  const items = { ...next.items };
  let tasks = next.tasks;
  let sparse = next.sparse ?? [];
  let unreadableCases = next.unreadableCases;
  for (const flow of PROCESS_KEYS) {
    const lost = failed(flow, LIVE_RUNGS).filter((r) => answered(flow, r.rung));
    if (!lost.length) continue;
    const tasksLost = lost.some((r) => r.rung === "tasks");
    // a row read in full by neither load is no better than the other; one read in full by the previous load is
    const weak = (s: LiveSnapshot, id: string) => (flow === "case" ? id in s.unreadableCases : !!s.sparse?.includes(id));
    const before = new Map(prev.items[flow].map((it) => [it._id, it]));
    const now = new Set(next.items[flow].map((it) => it._id));
    const heldNow = new Set(next.tasks.filter((t) => t.flow === flow).map((t) => t.itemId));
    const heldBefore = new Map(prev.tasks.filter((t) => t.flow === flow && !heldNow.has(t.itemId)).map((t) => [t.itemId, t.act]));
    const filled = new Set<string>();
    const out = next.items[flow].map((it) => {
      const old = before.get(it._id);
      let row = it;
      if (old && weak(next, it._id) && !weak(prev, it._id)) {
        row = { ...noStep(old), ...it } as RawItem;
        filled.add(it._id);
      }
      return tasksLost && heldBefore.has(it._id) ? ({ ...row, _activity_instance_id: heldBefore.get(it._id)! } as RawItem) : row;
    });
    const only = prev.items[flow].filter((it) => !now.has(it._id)).map((it) => (tasksLost ? it : noStep(it)));
    items[flow] = [...out, ...only];
    if (tasksLost) tasks = [...tasks, ...prev.tasks.filter((t) => heldBefore.has(t.itemId) && t.flow === flow)];
    if (flow === "case") {
      unreadableCases = { ...unreadableCases };
      for (const id of filled) delete unreadableCases[id];
      for (const it of only) {
        if (it._id in prev.unreadableCases) unreadableCases[it._id] = prev.unreadableCases[it._id]!;
        else delete unreadableCases[it._id];
      }
    } else sparse = [...sparse.filter((id) => !filled.has(id)), ...only.filter((it) => weak(prev, it._id)).map((it) => it._id)];
    kept[flow] = prev.kept?.[flow] ?? prev.loadedAt;
  }
  const flows = Object.keys(kept) as FlowKey[];
  if (!flows.length && !Object.keys(keptRows).length) return next;
  for (const f of flows) warnings.push(keptText(f, kept[f]!));
  const { sparse: _s, ...rest } = next;
  void _s;
  return {
    ...rest,
    items,
    forms,
    tasks,
    unreadableCases,
    ...(sparse.length ? { sparse } : {}),
    warnings: [...next.warnings, ...warnings],
    ...(flows.length ? { kept } : {}),
    ...(Object.keys(keptRows).length ? { keptRows } : {}),
  };
}

/** The parts a review's gate is decided from (Complete review, gap 9): the history (the points a colleague raised), the
 *  open points, the reviews and the RMES records. */
const GATE_PARTS: readonly FlowKey[] = ["audit", "op", "review", "rmesSAF", "rmesREG"];

/** Complete review's refusal when its fresh read is not one (some of it is an earlier load's). */
export const NOT_READ_AGAIN = (parts: string[]) => `Not completed: Kissflow could not read ${parts.join(", ")} again just now, so the review gate could not be checked against what Kissflow holds. Nothing was written; try again.`;

/**
 * Why a load cannot decide the review gate of case `caseId` (APP-SAVING-GAPS gap 9: Kissflow's Review_Gate trusts the
 * counts Complete review writes), or undefined: a part it decides from was kept from an earlier load (keepUnread), or
 * the case's RMES record was listed without its criteria and findings (its full read failed; counting from the list row
 * would find no gap). A list that never answered is no reason: the screen never had it either, and a rung refused on
 * every load would block Complete review for good.
 */
export function notReadAgain(snap: LiveSnapshot, caseId: string): string | undefined {
  const parts = GATE_PARTS.filter((f) => snap.kept?.[f] !== undefined).map((f) => FLOW_LABEL[f]);
  for (const f of ["rmesSAF", "rmesREG"] as const) {
    const unread = new Set(snap.unreadRows?.[f] ?? []);
    if (snap.forms[f].some((r) => unread.has(r._id) && str(r, "Case_Code") === caseId)) parts.push(`the ${FLOW_LABEL[f]} record of ${caseId}`);
  }
  return parts.length ? NOT_READ_AGAIN(parts) : undefined;
}

// ---------------------------------------------------------------------------------- load-time side effects

/** What a load-time effect may rely on beside the mapped state: this load's read reports (which rungs answered) and
 *  the audit rows as read (empty when that read failed, which `reads` then says). */
export interface LoadFacts {
  reads: ReadReport[];
  audit: RawItem[];
  /** The parts this load could not read again and shows as an earlier load read them (LiveSnapshot.kept). */
  kept?: LiveSnapshot["kept"];
}
/** A load-time effect's result; `note` = nothing was written, only a line for Diagnostics (no toast, no reload).
 *  `tally`: what it started and what failed for its one case, as labels (the departments of the reviews; "sent";
 *  "created"), from which production words its toast (userText.ts effectToasts). */
export type EffectResult = WriteResult & { note?: boolean; tally?: { done: string[]; failed: string[] } };
/** Owner C's ensureRmes shape (DESIGN §3.3): null = nothing to do. The reviews and the final-release request are the
 *  integrations' since 22 Oct (I-2 with E-A; E-B on a review's completion). */
export type SideEffect = (ctx: WriteCtx, state: AppState, facts: LoadFacts) => Promise<EffectResult | null>;
export interface LoadEffects {
  ensureRmes?: SideEffect;
}
export type EffectName = keyof LoadEffects;
export interface EffectOutcome {
  effect: EffectName;
  caseId: string;
  result: EffectResult;
  /** Nothing was written: Diagnostics lists it, the store neither toasts it nor reloads for it. */
  note?: boolean;
}

/** Which side effects the acting persona runs after a load: SAF/REG create their RMES row. */
export function effectsFor(personaId: InternalPersonaId): EffectName[] {
  return personaId === "saf" || personaId === "reg" ? ["ensureRmes"] : [];
}

/** The case phase each effect works on. */
const PHASE: Record<EffectName, AppState["cases"][number]["phase"]> = { ensureRmes: "review" };
const WHAT_FAILED: Record<EffectName, string> = { ensureRmes: "the RMES record" };

const formOk = (reads: ReadReport[], flow: FlowKey) => reads.some((r) => r.flow === flow && r.rung === "form" && r.ok);

/** An effect's note when a part it decides from is an earlier load's (keepUnread). */
export const keptBlockText = (_name: EffectName, dept: string | undefined, flows: FlowKey[]) =>
  `The ${dept === "REG" ? "Regulatory" : "Safety"} RMES record was not created on this load: ${flows.map((f) => FLOW_LABEL[f]).join(", ")} could not be read again (the screen shows an earlier read). Reload to try again.`;

/**
 * Why an effect must not run on this load (M1), or undefined. Each effect decides from what this load READ: a refused
 * read looks exactly like "nothing there", and a create on that basis would make a twin. ensureRmes needs the audit
 * rows (rmes.saved "RMES record") and its own RMES form. A part kept from an earlier load (`kept`, gap 8) is not what
 * this load read either: ensureRmes does not run
 * ensureRmes while the reviews (its held task), the history or its form are.
 */
export function effectBlocked(name: EffectName, acting: Pick<Acting, "dept">, reads: ReadReport[], kept?: LiveSnapshot["kept"]): string | undefined {
  const audit = formOk(reads, "audit");
  const form = acting.dept === "REG" ? "rmesREG" : "rmesSAF";
  const old = (["review", "audit", form] as FlowKey[]).filter((f) => kept?.[f] !== undefined);
  if (!audit || !formOk(reads, form)) return `The ${acting.dept === "REG" ? "Regulatory" : "Safety"} RMES record was not created on this load: the case history or the ${FLOW_LABEL[form]} form could not be read, so an existing record could look missing. Reload to try again.`;
  return old.length ? keptBlockText(name, acting.dept, old) : undefined;
}

/**
 * DESIGN §4: after a successful load, on the serial chain. Each effect runs ONE case at a time: `state.cases` and
 * `ctx.index.cases` hold only that case, so each case is attempted at most once per session (`attempted`, kept by the
 * store across persona switches; ensureRmes once per case and department, so a dev switch from Safety to Regulatory
 * still creates Regulatory's row), even if a created item does not show up on the next read. A case
 * whose effect had nothing to do (null) stays eligible (e.g. SAF's review task arrives later); a case with any result,
 * a failure included, is never tried again. A note (nothing written) is recorded once per session and leaves the case
 * eligible. An effect whose reads failed on this load (effectBlocked) does not run; its note is recorded once.
 * Nothing runs outside the app (writes would be refused).
 */
export async function runLoadEffects(x: { acting: Pick<Acting, "personaId" | "dept">; state: AppState; ctx: WriteCtx; effects: LoadEffects; attempted: Set<string>; facts: LoadFacts }): Promise<EffectOutcome[]> {
  if (!x.ctx.containerOk) return [];
  const out: EffectOutcome[] = [];
  for (const name of effectsFor(x.acting.personaId)) {
    const fn = x.effects[name];
    if (!fn) continue;
    const cases = x.state.cases.filter((c) => c.phase === PHASE[name]);
    if (!cases.length) continue;
    // ensureRmes is the acting department's (its form, its row, its note): "ensureRmes|SAF", "ensureRmes|REG"
    const effect = name === "ensureRmes" ? `${name}|${x.acting.dept ?? ""}` : name;
    const blocked = effectBlocked(name, x.acting, x.facts.reads, x.facts.kept);
    if (blocked) {
      const key = `${effect}|blocked`;
      if (!x.attempted.has(key)) {
        x.attempted.add(key);
        out.push({ effect: name, caseId: "", result: { ok: true, message: blocked, tone: "info", handoffs: [], warnings: [] }, note: true });
      }
      continue;
    }
    for (const c of cases) {
      const key = `${effect}|${c.id}`;
      if (x.attempted.has(key)) continue;
      const ref = x.ctx.index.cases.get(c.id);
      const ctx: WriteCtx = { ...x.ctx, index: { ...x.ctx.index, cases: new Map(ref ? [[c.id, ref]] : []) } };
      let result: EffectResult | null;
      try {
        result = await fn(ctx, { ...x.state, cases: [c] }, x.facts);
      } catch (e) {
        result = { ok: false, tone: "danger", message: `${c.id}: ${WHAT_FAILED[name]} could not be created (${errorText(e).trim().replace(/[.\s]+$/, "")}).`, handoffs: [], warnings: [] };
      }
      if (!result) continue;
      if (result.note) {
        const noteKey = `${effect}|note|${c.id}`;
        if (x.attempted.has(noteKey)) continue;
        x.attempted.add(noteKey);
        const { note: _n, ...r } = result;
        void _n;
        out.push({ effect: name, caseId: c.id, result: r, note: true });
        continue;
      }
      x.attempted.add(key);
      out.push({ effect: name, caseId: c.id, result });
    }
  }
  return out;
}
