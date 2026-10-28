// An in-memory AppClient for vitest (DESIGN §3.3), behaving like CIQ_Digital_A00 where the screens' writes depend on it:
// - steps: a create starts at the Start step held by its creator (`_status` Draft); submit routes case → waiting →
//   release → End, review → the `Review_Dept` step → End, open point → the `OP_Dept` step → End (ids.ts STEPS);
// - who holds a step: Start = the creator; review department steps = the department's role (`me.roles`); open-point
//   department steps = the users in `Raiser_Assignee` (field assignment, walk-v6 "to: User:…"); case waiting/release =
//   nobody internal. Seeded `tasks` are held as given until the item moves;
// - task reads and writes need the item's CURRENT activity instance and a held task, else 050201 (live text);
// - step field permissions: an update may write only the step's MANDATORY + EDITABLE fields (ids.ts, from the live
//   drafts), never a `readOnly` field (replays the live 050313 of walk-v6 w2), a system `_` field or a formula; refusals
//   use the live 050313 text. A create stores every field (G-7: ReadOnly-at-Start fields were stored on create);
// - Mandatory is enforced on submit unless `enforceMandatory: false` (live does NOT enforce it, G-7);
// - DateTimes with milliseconds are refused (Kissflow rejects them; CAFM sdk.ts, live);
// - formulas are recomputed on every write (Review_Gate, Open_Num, Start_Gate, Criteria_Open_Num: ids.ts FORMULA_FIELDS);
// - Forms: create gives a draft id, submit a NEW id; "Table::<model>" deltas add rows (`_is_created`), change a row by
//   its `_id`, and ADD a duplicate for an unknown `_id` (live behaviour per DESIGN §6 recordCriterion; logged in `warnings`);
// - CIQ Config Version and CIQ Audit Event (26 Oct, the live configuration editor): their Select fields take only the
//   live list values (Config_State Draft / Published / Retired, Config_Kind, Release_Stage, Event_Category: kissflow-build/
//   ciq-digital/v5/verify-1015/live/list-items), and a config row is created only with its Required Config_Key and
//   Config_Kind; anything else is refused as Kissflow's validation (050312, fake wording);
// - `_modified_at` moves forward on every write, set() and move(); every AppClient call is logged in `calls`;
// - the data console's writes (26 Oct): adminUpdate (flow Admin only) writes any field but system fields and formulas, at
//   any step, as the admin route does (P-RO), "Table::<model>" deltas included; adminDelete (flow Admin only) and
//   formDelete remove the item. A deleted PROCESS item's by-id read answers as live did on 26 Oct (Thomas deleted a
//   case, then RMM's load read it by id): adminGet "some error occured (SDK); KISSFLOW_ERROR_050201 This item has moved
//   out of your queue. (REST)", getById "Kissflow answered with a different item (no id).", getTask 050201; a deleted
//   form row's read answers "not found" (01015, [unverified live]);
// - the supplier portal's CIQP Request / CIQP Query (26 Oct, the console's Orphans page; `seed.portal`): portalList (Kissflow's
//   search `q`: an item any of whose values contains it), portalGet and portalDelete, flow Admin only, as the admin
//   routes (a deleted item reads as a deleted app process item); `refuse` replays a container that refuses them.
//   27 Oct: `portalRead` lets portalGet answer without flow Admin (the app's file opener reads a case's portal request
//   for its stored files; whether a CIQ role may is [unverified live]);
// - previewFiles (27 Oct, Kissflow's file preview): recorded in `previews` ({ files, index }) and logged; it resolves at
//   once (live: when the person closes the preview); `refuse.previewFiles` replays a host that refuses it.
// - the colleague directory (27 Oct, @mentions; `seed.directory`): roleMembers answers a CIQ role as the per-role REST GET
//   does ({_id, Name, Members: [{_id, Name, Kind, Email?}]}; a role of ids.ts ROLES nobody seeded has no members, another
//   id is not found), accountUsers the account's users ([{_id, Email, Name, Kind}]); `refuse.roleMembers` /
//   `refuse.accountUsers` replay a role that may not read them. Without `seed.directory` the client has neither route
//   (as a page without kf.api), so no other test sees these reads. Every webhook POST is in `hooks` (mails included).
// List rows are sparse by default (live: admin list 30/125 fields and no step; My tasks rows carry the step and
// `_activity_instance_id`: STATUS-2026-10-14 §10, WORKBENCH-UI-LOG:405); which fields a live admin or My tasks row keeps
// is not known, so the fake keeps the system fields and short scalar business fields. A My items row is exactly as live
// (REST, proven 21 Oct on a Draft and a Completed CIQ Case): Name, _activity_id, _activity_instance_id,
// _current_assigned_to, _current_step, _id, _modified_at, _progress, _status (+ _completed_at once Completed); no
// _created_by and no business field, whatever `rows` says. Form lists return full rows [unverified live].
import { errorText, kfDateTime, type KfData } from "@/portal/kf/sdk";
import { str, userIds, type RawItem } from "@/portal/data/raw";
import type { ReviewDept } from "@/domain/types";
import { APP_ID, EDITABLE, FLOWS, FORMULA_FIELDS, MANDATORY, ROLES, STEPS, STEP_NAMES, TABLES } from "../ids";
import type { AppClient, FlowKey, FormKey, PortalFlowKey, ProcessKey, TaskRef } from "../types";
import { AppError, NOT_IN_APP } from "./client";

const PROCESS_KEYS: readonly ProcessKey[] = ["case", "review", "op"];
/** The process flows' names, as a live item's default Name starts. */
const FLOW_NAME: Record<ProcessKey, string> = { case: "CIQ Case", review: "CIQ Review", op: "CIQ Open Point" };
const FLOW_KEYS = Object.keys(FLOWS) as FlowKey[];
const REVIEW_DEPTS: readonly ReviewDept[] = ["REG", "SAF", "QM", "MIC", "SUS", "RMM"];
const ENDED = new Set(["Completed", "Withdrawn", "Rejected", "Cancelled"]);
const SYSTEM_KEEP = new Set(["_id", "_status", "_created_at", "_created_by", "_modified_at", "_modified_by"]);
const MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+(Z|[+-]\d{2}:?\d{2})$/;
const TABLE = "Table::";
const WRITES = new Set<keyof AppClient>(["create", "update", "submit", "discard", "formCreate", "formUpdate", "formDelete", "adminUpdate", "adminDelete", "portalDelete", "postWebhook"]);
const PORTAL_KEYS: readonly PortalFlowKey[] = ["request", "query"];

/** Kissflow's own texts where the live walk recorded them (kissflow-build/ciq-digital/v6/walk-v6-result.json); the
 *  others are this fake's wording (marked). */
export const FAKE_ERRORS = {
  /** live */
  queue: "KISSFLOW_ERROR_050201 This item has moved out of your queue.",
  /** live format */
  fields: (flowId: string, fields: string[]) =>
    `KISSFLOW_ERROR_050313 You don't have permission to update the following fields: {"${flowId}": [${fields.map((f) => `"${f}"`).join(", ")}]}.`,
  /** fake wording */
  mandatory: (fields: string[]) => `KISSFLOW_ERROR_050312 Validation failed: ${fields.join(", ")} ${fields.length === 1 ? "is" : "are"} mandatory.`,
  /** fake wording */
  millis: (field: string) => `KISSFLOW_ERROR_050312 Validation failed: ${field} is not a valid DateTime (milliseconds are not accepted).`,
  /** fake wording (only flow Admin may list or read every item) */
  admin: "You don't have permission to view every item of this flow.",
  /** fake wording (the viewer route, DESIGN R-1) */
  viewer: "You don't have permission to view this item.",
  /** the portal client test's wording for a missing item */
  notFound: (id: string) => `KISSFLOW_ERROR_01015 Document not found (${id})`,
  /** live (26 Oct, RMM's load after Thomas deleted a case in the console): the admin read of a deleted process item,
   *  the SDK's admin call failing first and the admin REST route then */
  deleted: "some error occured (SDK); KISSFLOW_ERROR_050201 This item has moved out of your queue. (REST)",
  /** live (the same load): the viewer route's answer for it, a body without the item */
  deletedById: "Kissflow answered with a different item (no id).",
  /** fake wording */
  noBranch: (flowId: string, field: string, value: string) => `No branch of ${flowId} matches ${field} "${value}": the item cannot move on.`,
  /** fake wording */
  discard: "Only your own unsent draft can be discarded.",
  /** fake wording (a Select value its list does not have) */
  select: (field: string, value: string) => `KISSFLOW_ERROR_050312 Validation failed: “${value}” is not an option of ${field}.`,
} as const;

/** The Select fields of the forms whose lists matter to the writers, with the live list values (kissflow-build/
 *  ciq-digital/v5/verify-1015/live/list-items/*.json), and the Required fields of a new row. */
const SELECTS: Partial<Record<FlowKey, Record<string, readonly string[]>>> = {
  config: {
    Config_State: ["Draft", "Published", "Retired"],
    Config_Kind: ["Template", "Section definition", "Rule set", "Section ownership", "RMES criteria", "Limit set", "Text bundle", "Reminders", "Settings", "Regression set", "Release"],
    Release_Stage: ["Test", "Live"],
  },
  audit: {
    Event_Category: ["Case", "Scope", "Section", "Section review", "Snapshot", "Open point", "RMES", "Change request", "Configuration", "Notification", "Delegation", "Assignment", "Change attempt", "Cancellation", "Access", "Item created", "Final PDF", "Supplier master", "Review", "Internal note"],
  },
};
const REQUIRED_ON_CREATE: Partial<Record<FlowKey, readonly string[]>> = { config: ["Config_Key", "Config_Kind"] };

export interface FakeCall {
  m: keyof AppClient;
  flow?: FlowKey;
  id?: string;
  act?: string;
  /** myTasks: the activity filter. */
  activityId?: string;
  /** The data the caller sent (a copy). postWebhook: { url, payload }. */
  data?: unknown;
  /** What a write returned: create { id, act }, formCreate { draftId, id }, postWebhook the route. */
  result?: unknown;
  /** The refusal text when the call was refused. */
  error?: string;
}

/** A refusal: always (a text), or decided per call (return a text to refuse, nothing to let it through). */
export type FakeRefusal = string | ((call: FakeCall) => string | undefined | null | false);

export interface FakeMe {
  _id: string;
  Name: string;
  Email?: string;
  /** App roles held: ROLES keys ("qm"), role ids or role names. Review department steps are held through these. */
  roles?: string[];
}

/** A person as Kissflow lists them in a role's Members or the account's users. */
export interface FakePerson {
  _id: string;
  Name: string;
  Kind?: string;
  Email?: string;
}

export interface FakeSeed {
  items: Partial<Record<FlowKey, RawItem[]>>;
  /** 27 Oct: the colleague directory: role id → its members, and the account's users. */
  directory?: { roles?: Record<string, FakePerson[]>; users?: FakePerson[] };
  /** The supplier portal's CIQP Request / CIQP Query items (the console's Orphans page reaches them). */
  portal?: Partial<Record<PortalFlowKey, RawItem[]>>;
  /** Tasks `me` holds at the start (they override the assignment rules until the item moves). */
  tasks?: TaskRef[];
  me: FakeMe;
}

export interface FakeOptions {
  /** Flow Admin: adminList/adminGet (and getById) allowed. Default false (every role but Case administrator). */
  admin?: boolean;
  /** Refuse a method (always, or per call). The text is the error message. */
  refuse?: Partial<Record<keyof AppClient, FakeRefusal>>;
  /** Mandatory fields enforced on submit. Default true; live does not enforce them (G-7). */
  enforceMandatory?: boolean;
  /** Activity id (or a Form's flow id) → fields Kissflow refuses to update there, although the draft allows them. */
  readOnly?: Record<string, string[]>;
  /** Only MANDATORY + EDITABLE fields may be updated at a step (ids.ts). Default true. */
  strictSteps?: boolean;
  /** kf.app._id; anything but APP_ID refuses every write as the real client does. Default APP_ID. */
  appId?: string;
  accountId?: string;
  /** The Kissflow host around the frame (AppClient.hookHost). Default none: the hand-off URLs are relative. */
  hookHost?: string;
  /** List rows: "sparse" (default, as live) or "full". Admin rows never carry the step. */
  rows?: "sparse" | "full";
  /** getTask lets the initiator read an item it does not hold. Default false [unverified live]. */
  initiatorRead?: boolean;
  /** getById (the viewer route) answers for non-admins. Default false [unverified live, R-1]. */
  viewerRead?: boolean;
  /** The route postWebhook reports. Default "fetch" (the real client's first route; "sdk" = the fetch threw). */
  webhook?: "sdk" | "fetch";
  /** portalGet answers without flow Admin (27 Oct, the file opener's read of a case's portal request) [unverified live]. */
  portalRead?: boolean;
  /** The clock for _created_at/_modified_at; stamps still move forward by at least 1 s per write. */
  now?: () => string;
}

export interface FakeStep {
  flow: ProcessKey;
  activityId: string;
  /** The current activity instance ("" at End). */
  act: string;
  /** Whether `me` holds the step now. */
  held: boolean;
}

export interface FakeClient extends AppClient {
  formDelete(flow: FormKey, id: string): Promise<void>;
  adminUpdate(flow: ProcessKey, id: string, data: KfData): Promise<void>;
  adminDelete(flow: ProcessKey, id: string): Promise<void>;
  portalList(flow: PortalFlowKey, q?: string): Promise<RawItem[]>;
  portalGet(flow: PortalFlowKey, id: string): Promise<RawItem>;
  portalDelete(flow: PortalFlowKey, id: string): Promise<void>;
  previewFiles(files: Record<string, unknown>[], index?: number): Promise<void>;
  /** The file previews opened, in order (27 Oct). */
  previews: { files: Record<string, unknown>[]; index: number }[];
  calls: FakeCall[];
  /** The live store, per flow (process items carry `_status`, `_current_step`, `_current_context`). */
  db: Record<FlowKey, RawItem[]>;
  /** The supplier portal's CIQP items, per process. */
  portal: Record<PortalFlowKey, RawItem[]>;
  /** Ids of the items and rows deleted so far (their reads answer as live does for a deleted item). */
  gone: Set<string>;
  /** An integration's admin write (I-2/I-4): merges the patch (system fields allowed), recomputes formulas, bumps
   *  `_modified_at`. Not logged in `calls`. */
  set(id: string, patch: KfData): void;
  /** Moves a process item to a step (e.g. what an integration or another user did), with a new activity instance. */
  move(id: string, activityId: string): void;
  /** Webhook POSTs in order. */
  hooks: { url: string; payload: unknown }[];
  /** Seed gaps and live quirks replayed (unknown child row ids, …). */
  warnings: string[];
  /** The tasks `me` holds now. */
  tasks(): TaskRef[];
  stepOf(id: string): FakeStep | undefined;
  find(id: string): { flow: FlowKey; item: RawItem } | undefined;
}

/** Blank as Kissflow's ISBLANK/Mandatory see it: missing, empty text, empty list, or a user without an id. */
export function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "_id" in o ? !o._id : Object.keys(o).length === 0;
  }
  return false;
}

type Row = Record<string, unknown>;
const numOrBlank = (v: unknown): number | undefined => (isBlank(v) ? undefined : Number(v));

/** Start_Gate's ISBLANK list, in the live expression's order. */
const START_GATE_FIELDS = ["Ref_Kind", "Ref_Section_Key", "Ref_Label", "Kind_Label", "Question_Text", "Supplier_Justification", "Supplier_Due_Date",
  "Responsible_Name", "Responsible_Dept_Label", "Query_Key", "Portal_Contact_Ids", "Awaiting_Response"];

const criteriaOpen = (r: Row) =>
  r.Criteria_Applicable === "No" ? 0 : isBlank(r.Criteria_Result) ? 1 : ["Available", "Plausible", "Listed"].includes(String(r.Criteria_Result)) ? 0 : isBlank(r.Criteria_Comment) ? 1 : 0;

/** The live expressions (ExpressionStr in the 2046 drafts). Keyed by flow key or child model. The case's gates are
 *  never written after Start by the UI, so the fake does not compute them (it only refuses writes to them). */
const FORMULAS: Record<string, Record<string, (r: Row) => unknown>> = {
  review: {
    Review_Gate: (r) => {
      const a = numOrBlank(r.Open_Count);
      const b = numOrBlank(r.RMES_Gaps);
      return a === undefined || b === undefined ? "" : a + b === 0 ? "OK" : "";
    },
  },
  op: {
    Open_Num: (r) => (isBlank(r.OP_Outcome) ? 1 : 0),
    Start_Gate: (r) => (r.OP_To_Supplier === "No" ? "OK" : START_GATE_FIELDS.some((k) => isBlank(r[k])) ? "" : r.Awaiting_Response === "Yes" ? "OK" : ""),
  },
  [TABLES.SAF.criteria]: { Criteria_Open_Num: criteriaOpen },
  [TABLES.REG.criteria]: { Criteria_Open_Num: criteriaOpen },
};
const formulaFieldsOf = (key: string): readonly string[] => (FORMULA_FIELDS as Record<string, readonly string[]>)[key] ?? [];

/** Department of a review or open-point department step. */
const DEPT_OF_STEP: Record<string, ReviewDept> = {};
for (const d of REVIEW_DEPTS) {
  DEPT_OF_STEP[STEPS.review[d]] = d;
  DEPT_OF_STEP[STEPS.op[d]] = d;
}
const ROLE_OF_DEPT: Record<ReviewDept, { id: string; name: string }> = {
  RMM: ROLES.rmm, REG: ROLES.reg, SAF: ROLES.saf, QM: ROLES.qm, MIC: ROLES.mic, SUS: ROLES.sus,
};
const stepsOf = (f: ProcessKey): Record<string, string> => STEPS[f];

export function createFakeClient(seed: FakeSeed, opts: FakeOptions = {}): FakeClient {
  const me = seed.me;
  const meRef = { _id: me._id, Name: me.Name };
  const appId = opts.appId ?? APP_ID;
  const calls: FakeCall[] = [];
  const hooks: { url: string; payload: unknown }[] = [];
  const previews: { files: Record<string, unknown>[]; index: number }[] = [];
  const warnings: string[] = [];
  const db = Object.fromEntries(FLOW_KEYS.map((f) => [f, (seed.items[f] ?? []).map((it) => structuredClone(it))])) as Record<FlowKey, RawItem[]>;
  const portal = Object.fromEntries(PORTAL_KEYS.map((f) => [f, (seed.portal?.[f] ?? []).map((it) => structuredClone(it))])) as Record<PortalFlowKey, RawItem[]>;
  const gone = new Set<string>();
  const steps = new Map<string, { activityId: string; act: string; forced: boolean }>();

  // ---- roles → the review departments whose steps `me` holds
  const roleTags = new Set(me.roles ?? []);
  const myDepts = new Set<ReviewDept>();
  for (const [key, r] of Object.entries(ROLES)) {
    if (!("dept" in r) || !(roleTags.has(key) || roleTags.has(r.id) || roleTags.has(r.name))) continue;
    if ((REVIEW_DEPTS as readonly string[]).includes(r.dept)) myDepts.add(r.dept as ReviewDept);
  }

  // ---- people seen, so a written {_id} reads back with its Name as Kissflow returns User values
  const names = new Map<string, string>([[me._id, me.Name]]);
  const learn = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(learn);
    else if (v && typeof v === "object") {
      const o = v as Row;
      if (typeof o._id === "string" && typeof o.Name === "string") names.set(o._id, o.Name);
    }
  };
  for (const f of FLOW_KEYS) for (const it of db[f]) for (const v of Object.values(it)) learn(v);

  // ---- clock and ids
  let last = 0;
  for (const f of FLOW_KEYS)
    for (const it of db[f])
      for (const k of ["_created_at", "_modified_at"]) {
        const t = Date.parse(str(it, k));
        if (Number.isFinite(t)) last = Math.max(last, t);
      }
  const stamp = (): string => {
    const base = Date.parse(opts.now?.() ?? new Date().toISOString());
    last = Math.max(Number.isFinite(base) ? base : 0, last + 1000);
    return kfDateTime(new Date(last));
  };
  let seq = 0;
  const TAG: Record<FlowKey, string> = { case: "Case", review: "Rev", op: "Op", audit: "Audit", note: "Note", rmesSAF: "RmesSaf", rmesREG: "RmesReg", supplier: "Sup", config: "Cfg", scopeRun: "Scope" };
  const fresh = (make: () => string): string => {
    for (;;) {
      const id = make();
      if (!find(id)) return id;
    }
  };
  const newItemId = (f: FlowKey) => fresh(() => `${FLOWS[f].kind === "process" ? "Pk" : "Fm"}${TAG[f]}${++seq}`);
  const newDraftId = (f: FlowKey) => `Draft${TAG[f]}${++seq}`;
  const newAct = () => `Act${++seq}`;
  const newRowId = (model: string) => `${model}_fake${++seq}`;

  // ---- lookups
  function find(id: string): { flow: FlowKey; item: RawItem } | undefined {
    for (const f of FLOW_KEYS) {
      const item = db[f].find((it) => it._id === id);
      if (item) return { flow: f, item };
    }
    return undefined;
  }
  function get(f: FlowKey, id: string): RawItem {
    const it = db[f].find((x) => x._id === id);
    if (!it) throw new AppError(gone.has(id) && FLOWS[f].kind === "process" ? FAKE_ERRORS.queue : FAKE_ERRORS.notFound(id));
    return it;
  }
  /** A process item for an admin read: a deleted one answers as live (FAKE_ERRORS.deleted). */
  function adminRead(rows: RawItem[], id: string): RawItem {
    const it = rows.find((x) => x._id === id);
    if (!it) throw new AppError(gone.has(id) ? FAKE_ERRORS.deleted : FAKE_ERRORS.notFound(id));
    return it;
  }
  /** Removes an item for good: its reads answer as a deleted item's. */
  function drop(rows: RawItem[], it: RawItem): void {
    rows.splice(rows.indexOf(it), 1);
    gone.add(it._id);
  }
  const createdByMe = (it: RawItem) => userIds(it, "_created_by")[0] === me._id;

  function holds(f: ProcessKey, it: RawItem): boolean {
    const st = steps.get(it._id);
    if (!st || !st.act || ENDED.has(str(it, "_status"))) return false;
    if (st.forced) return true;
    if (st.activityId === stepsOf(f).start) return createdByMe(it);
    const d = DEPT_OF_STEP[st.activityId];
    if (!d) return false; // case waiting / release: assigned outside the internal roles (DESIGN §4 "Case: —")
    if (f === "review") return myDepts.has(d);
    if (f === "op") return userIds(it, "Raiser_Assignee").includes(me._id);
    return false;
  }

  function assignedTo(f: ProcessKey, it: RawItem, activityId: string): Row[] {
    if (activityId === stepsOf(f).start) return it._created_by && typeof it._created_by === "object" ? [{ Kind: "User", ...(it._created_by as Row) }] : [];
    const d = DEPT_OF_STEP[activityId];
    if (d && f === "review") return [{ Kind: "AppRole", _id: ROLE_OF_DEPT[d].id, Name: ROLE_OF_DEPT[d].name }];
    if (d && f === "op") return userIds(it, "Raiser_Assignee").map((id) => ({ Kind: "User", _id: id, Name: names.get(id) ?? id }));
    return [];
  }

  /** Writes the item's step onto its system fields, as a full Kissflow read shows them. */
  function reflect(f: ProcessKey, it: RawItem): void {
    const st = steps.get(it._id);
    if (!st) return;
    it._current_step = STEP_NAMES[st.activityId] ?? "";
    it._current_context =
      st.activityId === stepsOf(f).end || ENDED.has(str(it, "_status"))
        ? []
        : [{ _context_activity_id: st.activityId, _context_activity_instance_id: st.act, _context_current_step: it._current_step, _context_assigned_to: assignedTo(f, it, st.activityId) }];
  }

  // ---- seed steps
  const seededTasks = new Map((seed.tasks ?? []).map((t) => [t.itemId, t]));
  const stepByName = (f: ProcessKey, name: string) => (name ? Object.values(stepsOf(f)).find((a) => STEP_NAMES[a] === name) : undefined);
  for (const f of PROCESS_KEYS) {
    for (const it of db[f]) {
      const t = seededTasks.get(it._id);
      if (t && t.flow !== f) warnings.push(`seed task ${t.itemId}: flow ${t.flow} given, the item is in ${f}.`);
      const ctx = Array.isArray(it._current_context) ? (it._current_context[0] as Row | undefined) : undefined;
      const status = str(it, "_status");
      const activityId =
        t?.activityId ||
        str(ctx, "_context_activity_id") ||
        stepByName(f, str(it, "_current_step")) ||
        (ENDED.has(status) ? stepsOf(f).end : status === "Draft" ? stepsOf(f).start : "");
      if (!activityId) {
        warnings.push(`seed ${f} ${it._id}: no step (no task, _current_context or _current_step); it can't be held or moved.`);
        continue;
      }
      if (!Object.values(stepsOf(f)).includes(activityId)) warnings.push(`seed ${f} ${it._id}: ${activityId} is not a step of ${FLOWS[f].id}.`);
      const end = activityId === stepsOf(f).end;
      steps.set(it._id, { activityId, act: end ? "" : t?.act || str(ctx, "_context_activity_instance_id") || newAct(), forced: !!t });
      reflect(f, it);
    }
  }
  for (const t of seed.tasks ?? []) if (!steps.has(t.itemId)) warnings.push(`seed task ${t.itemId}: no such process item.`);

  // ---- writes
  /** User values written as {_id} read back with their Name (Kissflow returns User fields as {_id, Name, …}). */
  function withNames(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(withNames);
    if (v && typeof v === "object") {
      const o = v as Row;
      if (typeof o._id === "string" && o.Name === undefined && names.has(o._id)) return { ...o, Name: names.get(o._id) };
    }
    return v;
  }

  /** A Select value outside its list, or a new row without a Required field: Kissflow's validation (050312). */
  function checkForm(f: FlowKey, data: KfData, creating: boolean): void {
    for (const [k, allowed] of Object.entries(SELECTS[f] ?? {})) {
      const v = data[k];
      if (v !== undefined && v !== null && v !== "" && !allowed.includes(String(v))) throw new AppError(FAKE_ERRORS.select(k, String(v)));
    }
    const blank = creating ? (REQUIRED_ON_CREATE[f] ?? []).filter((k) => isBlank(data[k])) : [];
    if (blank.length) throw new AppError(FAKE_ERRORS.mandatory(blank));
  }

  function checkMillis(data: KfData): void {
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" && MILLIS.test(v)) throw new AppError(FAKE_ERRORS.millis(k));
      if (k.startsWith(TABLE) && Array.isArray(v))
        for (const row of v as Row[]) for (const [rk, rv] of Object.entries(row ?? {})) if (typeof rv === "string" && MILLIS.test(rv)) throw new AppError(FAKE_ERRORS.millis(`${k.slice(TABLE.length)}.${rk}`));
    }
  }

  /** Fields of `data` Kissflow refuses: system fields and formulas always; with `allowed`, anything else not in it;
   *  `readOnly` always. Child tables are named by model; a child formula as `<model>.<field>`. */
  function refused(f: FlowKey, data: KfData, allowed: Set<string> | null, readOnly: string[]): string[] {
    const ro = new Set(readOnly);
    const formulas = new Set(formulaFieldsOf(f));
    const out: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      const field = k.startsWith(TABLE) ? k.slice(TABLE.length) : k;
      if (k.startsWith("_") || formulas.has(field) || ro.has(field) || ro.has(k) || (allowed && !allowed.has(field) && !allowed.has(k))) {
        out.push(field);
        continue;
      }
      if (k.startsWith(TABLE) && Array.isArray(v)) {
        const childFormulas = formulaFieldsOf(field);
        for (const row of v as Row[]) for (const rk of Object.keys(row ?? {})) if (childFormulas.includes(rk) && !out.includes(`${field}.${rk}`)) out.push(`${field}.${rk}`);
      }
    }
    return out;
  }

  function mergeTable(owner: RawItem, key: string, delta: unknown, creating: boolean): void {
    const model = key.slice(TABLE.length);
    if (!Array.isArray(delta)) throw new AppError(`${key} must be a list of rows.`);
    const rows: Row[] = Array.isArray(owner[key]) ? [...(owner[key] as Row[])] : [];
    for (const raw of delta as Row[]) {
      const { _is_created, _is_deleted, ...given } = raw ?? {};
      const row = Object.fromEntries(Object.entries(given).map(([k, v]) => [k, withNames(v)])) as Row;
      const id = typeof row._id === "string" ? row._id : "";
      const at = id ? rows.findIndex((r) => r._id === id) : -1;
      if (_is_deleted) {
        if (at >= 0) rows.splice(at, 1);
        else warnings.push(`${key}: delete of unknown row ${id || "(no id)"} ignored.`);
        continue;
      }
      if (_is_created || creating) {
        if (at >= 0) warnings.push(`${key}: a new row reused the id ${id}; Kissflow stores it as another row.`);
        rows.push({ ...row, _id: id && at < 0 ? id : newRowId(model) });
        continue;
      }
      if (at >= 0) {
        rows[at] = { ...rows[at], ...row, _id: id };
        continue;
      }
      // live: a row with an id Kissflow does not know is ADDED as a duplicate (DESIGN §6 recordCriterion)
      warnings.push(`${key}: row ${id || "(no id)"} is unknown, so it was added as a new row.`);
      rows.push({ ...row, _id: newRowId(model) });
    }
    owner[key] = rows;
  }

  function merge(it: RawItem, data: KfData, creating: boolean): void {
    for (const [k, v] of Object.entries(data)) {
      if (k === "_id") continue;
      if (k.startsWith(TABLE)) mergeTable(it, k, v, creating);
      else it[k] = withNames(structuredClone(v));
    }
  }

  function compute(f: FlowKey, it: RawItem): void {
    for (const [k, fn] of Object.entries(FORMULAS[f] ?? {})) it[k] = fn(it);
    for (const [k, v] of Object.entries(it)) {
      if (!k.startsWith(TABLE) || !Array.isArray(v)) continue;
      const fx = FORMULAS[k.slice(TABLE.length)];
      if (fx) for (const row of v as Row[]) for (const [fk, fn] of Object.entries(fx)) row[fk] = fn(row);
    }
  }

  /** After a write: formulas, `_modified_at`, and the step fields. */
  function touch(f: FlowKey, it: RawItem, by: { _id: string; Name: string } | null = meRef): void {
    compute(f, it);
    it._modified_at = stamp();
    if (by) it._modified_by = { ...by };
    if (FLOWS[f].kind === "process") reflect(f as ProcessKey, it);
  }

  function held(f: ProcessKey, id: string, act: string): RawItem {
    const it = get(f, id);
    if (steps.get(id)?.act !== act || !holds(f, it)) throw new AppError(FAKE_ERRORS.queue);
    return it;
  }

  // ---- reads
  function sparse(it: RawItem): RawItem {
    const out: RawItem = { _id: it._id };
    for (const [k, v] of Object.entries(it)) {
      if (SYSTEM_KEEP.has(k)) out[k] = structuredClone(v);
      else if (k.startsWith("_") || k.startsWith(TABLE) || /_JSON$/.test(k)) continue;
      else if (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 200)) out[k] = v;
    }
    return out;
  }
  const adminRow = (it: RawItem): RawItem => {
    if (opts.rows !== "full") return sparse(it);
    const { _current_step: _s, _current_context: _c, ...rest } = structuredClone(it);
    return rest as RawItem;
  };
  const listRow = (it: RawItem, act: string): RawItem => ({
    ...(opts.rows === "full" ? structuredClone(it) : sparse(it)),
    _current_step: it._current_step,
    ...(act ? { _activity_instance_id: act } : {}),
  });
  /** A My items row with exactly the live keys (see the header). `_activity_instance_id` is the current instance, ""
   *  once the item has none (at End: its live value there is unverified); Name is Kissflow's default item name ("CIQ
   *  Case from <creator>", as the live items show); `_progress` only has the live shape (a percentage). */
  const myItemRow = (f: ProcessKey, it: RawItem): RawItem => {
    const st = steps.get(it._id);
    const status = str(it, "_status");
    const done = status === "Completed";
    return {
      Name: `${FLOW_NAME[f]} from ${str(it._created_by as Row | undefined, "Name")}`,
      _activity_id: st?.activityId ?? "",
      _activity_instance_id: st?.act ?? "",
      _current_assigned_to: st && !done ? assignedTo(f, it, st.activityId) : [],
      _current_step: str(it, "_current_step"),
      _id: it._id,
      _modified_at: str(it, "_modified_at"),
      _progress: done ? 100 : st?.activityId === stepsOf(f).start ? 0 : 50,
      _status: status,
      ...(done ? { _completed_at: str(it, "_modified_at") } : {}),
    };
  };

  /** Logs the call, refuses writes outside the app, applies `refuse`, runs the body; every failure leaves as an AppError
   *  with its text logged. */
  async function run<T>(c: FakeCall, body: () => T): Promise<T> {
    calls.push(c);
    await Promise.resolve(); // answers arrive asynchronously, as through the SDK
    try {
      if (WRITES.has(c.m) && appId !== APP_ID) throw new AppError(NOT_IN_APP); // the real client refuses before any call
      const rule = opts.refuse?.[c.m];
      const why = typeof rule === "function" ? rule(c) : rule;
      if (why) throw new AppError(why);
      return body();
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError(errorText(e));
      c.error = err.message;
      throw err;
    }
  }
  const copy = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

  const client: FakeClient = {
    accountId: opts.accountId ?? "AcTEST",
    appId,
    hookHost: opts.hookHost,
    calls,
    db,
    portal,
    gone,
    hooks,
    previews,
    warnings,

    adminList: (f) =>
      run({ m: "adminList", flow: f }, () => {
        if (!opts.admin) throw new AppError(FAKE_ERRORS.admin);
        return db[f].filter((it) => str(it, "_status") !== "Draft").map(adminRow);
      }),
    adminGet: (f, id) =>
      run({ m: "adminGet", flow: f, id }, () => {
        if (!opts.admin) throw new AppError(FAKE_ERRORS.admin);
        return structuredClone(adminRead(db[f], id));
      }),
    myTasks: (f, activityId) =>
      run({ m: "myTasks", flow: f, activityId }, () =>
        db[f].filter((it) => holds(f, it) && (!activityId || steps.get(it._id)?.activityId === activityId)).map((it) => listRow(it, steps.get(it._id)!.act)),
      ),
    myItems: (f) => run({ m: "myItems", flow: f }, () => db[f].filter(createdByMe).map((it) => myItemRow(f, it))),
    getTask: (f, id, act) =>
      run({ m: "getTask", flow: f, id, act }, () => {
        const it = get(f, id);
        const st = steps.get(id);
        const may = holds(f, it) || (!!opts.initiatorRead && createdByMe(it));
        if (!st || st.act !== act || !may) throw new AppError(FAKE_ERRORS.queue);
        return { ...structuredClone(it), _activity_instance_id: act };
      }),
    getById: (f, id) =>
      run({ m: "getById", flow: f, id }, () => {
        if (!opts.admin && !opts.viewerRead) throw new AppError(FAKE_ERRORS.viewer);
        if (gone.has(id) && !db[f].some((x) => x._id === id)) throw new AppError(FAKE_ERRORS.deletedById);
        return structuredClone(get(f, id));
      }),

    create: (f, data) => {
      const c: FakeCall = { m: "create", flow: f, data: copy(data) };
      return run(c, () => {
        const bad = refused(f, data, null, []);
        if (bad.length) throw new AppError(FAKE_ERRORS.fields(FLOWS[f].id, bad));
        checkMillis(data);
        const at = stamp();
        const it: RawItem = { _id: newItemId(f), _status: "Draft", _created_by: { ...meRef }, _created_at: at, _modified_by: { ...meRef }, _modified_at: at };
        merge(it, data, true);
        db[f].push(it);
        const act = newAct();
        steps.set(it._id, { activityId: stepsOf(f).start, act, forced: false });
        compute(f, it);
        reflect(f, it);
        c.id = it._id;
        c.result = { id: it._id, act };
        return { id: it._id, act };
      });
    },
    update: (f, id, act, data) =>
      run({ m: "update", flow: f, id, act, data: copy(data) }, () => {
        const it = held(f, id, act);
        const a = steps.get(id)!.activityId;
        const allowed = opts.strictSteps === false ? null : new Set([...(MANDATORY[a] ?? []), ...(EDITABLE[a] ?? [])]);
        const bad = refused(f, data, allowed, opts.readOnly?.[a] ?? []);
        if (bad.length) throw new AppError(FAKE_ERRORS.fields(FLOWS[f].id, bad));
        checkMillis(data);
        merge(it, data, false);
        touch(f, it);
      }),
    submit: (f, id, act) =>
      run({ m: "submit", flow: f, id, act }, () => {
        const it = held(f, id, act);
        const st = steps.get(id)!;
        if (opts.enforceMandatory !== false) {
          const blank = (MANDATORY[st.activityId] ?? []).filter((k) => isBlank(it[k]));
          if (blank.length) throw new AppError(FAKE_ERRORS.mandatory(blank));
        }
        const to = nextStep(f, it, st.activityId);
        const end = to === stepsOf(f).end;
        steps.set(id, { activityId: to, act: end ? "" : newAct(), forced: false });
        it._status = end ? "Completed" : "InProgress";
        touch(f, it);
      }),
    discard: (f, id) =>
      run({ m: "discard", flow: f, id }, () => {
        const it = get(f, id);
        if (steps.get(id)?.activityId !== stepsOf(f).start || str(it, "_status") !== "Draft" || !createdByMe(it)) throw new AppError(FAKE_ERRORS.discard);
        db[f].splice(db[f].indexOf(it), 1);
        steps.delete(id);
      }),

    // as live (proven 20 Oct): a form list row carries no child tables; formGet returns them
    formList: (f) => run({ m: "formList", flow: f }, () => db[f].map((it) => Object.fromEntries(Object.entries(structuredClone(it)).filter(([k]) => !k.startsWith("Table::"))) as RawItem)),
    formGet: (f, id) => run({ m: "formGet", flow: f, id }, () => structuredClone(get(f, id))),
    formCreate: (f, data) => {
      const c: FakeCall = { m: "formCreate", flow: f, data: copy(data) };
      return run(c, () => {
        const bad = refused(f, data, null, opts.readOnly?.[FLOWS[f].id] ?? []);
        if (bad.length) throw new AppError(FAKE_ERRORS.fields(FLOWS[f].id, bad));
        checkMillis(data);
        checkForm(f, data, true);
        const draftId = newDraftId(f);
        const at = stamp();
        // the draft is finalised under a NEW id (portal client.ts formCreate; plan v5)
        const it: RawItem = { _id: newItemId(f), _created_by: { ...meRef }, _created_at: at, _modified_by: { ...meRef }, _modified_at: at };
        merge(it, data, true);
        compute(f, it);
        db[f].push(it);
        c.id = it._id;
        c.result = { draftId, id: it._id };
        return it._id;
      });
    },
    formUpdate: (f, id, data) =>
      run({ m: "formUpdate", flow: f, id, data: copy(data) }, () => {
        const it = get(f, id);
        const bad = refused(f, data, null, opts.readOnly?.[FLOWS[f].id] ?? []);
        if (bad.length) throw new AppError(FAKE_ERRORS.fields(FLOWS[f].id, bad));
        checkMillis(data);
        checkForm(f, data, false);
        merge(it, data, false);
        touch(f, it);
      }),
    formDelete: (f, id) =>
      run({ m: "formDelete", flow: f, id }, () => drop(db[f], get(f, id))),
    adminUpdate: (f, id, data) =>
      run({ m: "adminUpdate", flow: f, id, data: copy(data) }, () => {
        if (!opts.admin) throw new AppError(FAKE_ERRORS.admin);
        const it = get(f, id);
        const bad = refused(f, data, null, []);
        if (bad.length) throw new AppError(FAKE_ERRORS.fields(FLOWS[f].id, bad));
        checkMillis(data);
        merge(it, data, false);
        touch(f, it);
      }),
    adminDelete: (f, id) =>
      run({ m: "adminDelete", flow: f, id }, () => {
        if (!opts.admin) throw new AppError(FAKE_ERRORS.admin);
        drop(db[f], adminRead(db[f], id));
        steps.delete(id);
      }),
    portalList: (f, q) =>
      run({ m: "portalList", data: { flow: f, q } }, () => {
        if (!opts.admin) throw new AppError(FAKE_ERRORS.admin);
        const needle = (q ?? "").toLowerCase();
        const hit = (it: RawItem) => !needle || Object.values(it).some((v) => (typeof v === "string" || typeof v === "number") && String(v).toLowerCase().includes(needle));
        return portal[f].filter(hit).map(adminRow);
      }),
    portalGet: (f, id) =>
      run({ m: "portalGet", id, data: { flow: f } }, () => {
        if (!opts.admin && !opts.portalRead) throw new AppError(FAKE_ERRORS.admin);
        return structuredClone(adminRead(portal[f], id));
      }),
    portalDelete: (f, id) =>
      run({ m: "portalDelete", id, data: { flow: f } }, () => {
        if (!opts.admin) throw new AppError(FAKE_ERRORS.admin);
        drop(portal[f], adminRead(portal[f], id));
      }),
    previewFiles: (files, index = 0) =>
      run({ m: "previewFiles", data: { files: copy(files), index } }, () => {
        if (!files.length) throw new AppError("There is no stored file to open.");
        previews.push({ files: copy(files), index: Math.max(0, Math.min(index, files.length - 1)) });
      }),
    ...(seed.directory
      ? {
          roleMembers: (roleId: string) =>
            run({ m: "roleMembers", id: roleId }, () => {
              const role = Object.values(ROLES).find((r) => r.id === roleId);
              const members = seed.directory!.roles?.[roleId];
              if (!role && !members) throw new AppError(FAKE_ERRORS.notFound(roleId));
              return { _id: roleId, Name: role?.name ?? roleId, Members: copy(members ?? []) };
            }),
          accountUsers: () => run({ m: "accountUsers" }, () => copy(seed.directory!.users ?? [])),
        }
      : {}),
    postWebhook: (url, payload) => {
      const c: FakeCall = { m: "postWebhook", data: { url, payload: copy(payload) } };
      return run(c, () => {
        hooks.push({ url, payload: copy(payload) });
        const route = opts.webhook ?? "fetch";
        c.result = route;
        return route;
      });
    },

    set(id, patch) {
      const hit = find(id);
      if (!hit) throw new Error(`fake set: no item ${id}`);
      const { _modified_at, ...rest } = patch;
      for (const [k, v] of Object.entries(rest)) if (!k.startsWith(TABLE) && k !== "_id") hit.item[k] = withNames(structuredClone(v));
      for (const [k, v] of Object.entries(rest)) if (k.startsWith(TABLE)) mergeTable(hit.item, k, v, false);
      touch(hit.flow, hit.item, null);
      if (typeof _modified_at === "string") hit.item._modified_at = _modified_at;
    },
    move(id, activityId) {
      const hit = find(id);
      if (!hit || FLOWS[hit.flow].kind !== "process") throw new Error(`fake move: no process item ${id}`);
      const f = hit.flow as ProcessKey;
      if (!Object.values(stepsOf(f)).includes(activityId)) throw new Error(`fake move: ${activityId} is not a step of ${FLOWS[f].id}`);
      const end = activityId === stepsOf(f).end;
      steps.set(id, { activityId, act: end ? "" : newAct(), forced: false });
      hit.item._status = end ? "Completed" : activityId === stepsOf(f).start && str(hit.item, "_status") === "Draft" ? "Draft" : "InProgress";
      touch(f, hit.item, null);
    },
    tasks() {
      const out: TaskRef[] = [];
      for (const f of PROCESS_KEYS)
        for (const it of db[f]) {
          const st = steps.get(it._id);
          if (st && holds(f, it)) out.push({ flow: f, itemId: it._id, act: st.act, activityId: st.activityId });
        }
      return out;
    },
    stepOf(id) {
      const hit = find(id);
      const st = steps.get(id);
      if (!hit || !st || FLOWS[hit.flow].kind !== "process") return undefined;
      const f = hit.flow as ProcessKey;
      return { flow: f, activityId: st.activityId, act: st.act, held: holds(f, hit.item) };
    },
    find,
  };

  /** Routing as built: case Start → waiting → release → End; review/op Start → the department step of Review_Dept /
   *  OP_Dept (the branch expressions `Review_Dept = "QM"` …) → End. */
  function nextStep(f: ProcessKey, it: RawItem, activityId: string): string {
    const S = stepsOf(f);
    if (activityId === S.end) throw new AppError(FAKE_ERRORS.queue);
    if (f === "case") return activityId === S.start ? S.waiting : activityId === S.waiting ? S.release : S.end;
    if (activityId !== S.start) return S.end;
    const field = f === "review" ? "Review_Dept" : "OP_Dept";
    const d = str(it, field);
    if (!(REVIEW_DEPTS as readonly string[]).includes(d)) throw new AppError(FAKE_ERRORS.noBranch(FLOWS[f].id, field, d));
    return S[d];
  }

  return client;
}

/** The forms of the app, for tests that walk every form. */
export const FORM_KEYS = FLOW_KEYS.filter((f): f is FormKey => FLOWS[f].kind === "form");
