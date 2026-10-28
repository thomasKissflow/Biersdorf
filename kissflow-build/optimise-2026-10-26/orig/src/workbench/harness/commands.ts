// SDK command handlers of the emulated host (WORKBENCH-DESIGN.md §11.1 commands.ts, §11.2). Command names and payload
// keys are the bundled SDK's (@kissflow/lowcode-client-sdk 1.0.49, kfsdk.es.js L806-L1330): flowId, instanceId,
// activityInstanceId, itemId, data, pageNumber, pageSize, status, activityId, stepId, comment, url, args.
// Errors answer like Kissflow does to the SDK: { isError: true, errorMessage: { error_code, en_message } }.
// The host is deliberately unkind (§11.2): it refuses what Kissflow refuses and never fills in for the UI.
import { APP_ID, CHILD_TABLES, FIELDS, FLOWS, GRANTS, SWITCHES, type ChildTableId, type FlowId, type RoleIr } from "../schema/generated";
import { recompute, tableKey } from "./formula";
import type { HostParams } from "./params";
import { analyse, msMessage, notWritableAt, permissionMessage, type DataAnalysis } from "./permissions";
import { clone, draftOf, findItem, findRow, itemsOf, nextId, openActs, rowsOfFlow, type Activity, type FormRow, type HostState, type ProcItem } from "./state";
import { isoSec } from "./time";
import { allAppRoles, appRolesOf, userRef, type FixtureUser } from "./users";
import { activityIdOf, currentStepName, holds, rejectItem, sendBackAct, startItem, startOf, step, stepOfActivityId, submitAct, withdrawItem, type WfCtx } from "./workflow";

export type RefusalCategory =
  | "moved-out"
  | "not-found"
  | "permission-050313"
  | "validation-ms"
  | "unknown-field"
  | "admin-denied"
  | "no-permission"
  | "no-draft"
  | "draft-409"
  | "switch-off"
  | "not-initiator"
  | "body-not-string"
  | "not-emulated"
  | "forbidden"
  | "wrong-container"
  | "bad-request"
  | "mode:kwb"
  | "mode:sendback"
  | "mode:reject"
  | "mode:openForm"
  | "mode:formSubmit"
  | "mode:participated"
  | "mode:progress"
  | "mode:getRoles";

export class HostError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly category: RefusalCategory,
  ) {
    super(message);
  }
}

export interface Req {
  _id?: string;
  command: string;
  flowId?: string;
  instanceId?: string;
  activityInstanceId?: string;
  itemId?: string;
  data?: Record<string, unknown>;
  pageNumber?: number;
  pageSize?: number;
  status?: string;
  activityId?: string;
  stepId?: string;
  comment?: string;
  url?: string;
  args?: { method?: string; body?: unknown; headers?: Record<string, string> };
  roleId?: string;
  roleName?: string;
  [k: string]: unknown;
}

/** Mutable per-run counters of the one-shot modes. */
export interface ModeCounters {
  raceLeft: number | "always";
  writeDelayUsed: boolean;
  formSubmitFailUsed: boolean;
  formDropUsed: boolean;
}

export interface HostCtx {
  state: HostState;
  params: HostParams;
  users: Record<string, FixtureUser>;
  /** epoch ms */
  clock(): number;
  counters: ModeCounters;
  /** Fixture building: no failure modes, no recording. */
  internal?: boolean;
}

export const WRITE_COMMANDS = new Set([
  "PROCESS_CREATE_ITEM",
  "PROCESS_UPDATE_ITEM",
  "PROCESS_UPDATE_ADMIN_ITEM",
  "PROCESS_SUBMIT_ITEM",
  "PROCESS_DISCARD_ITEM",
  "PROCESS_REJECT_ITEM",
  "PROCESS_WITHDRAW_ITEM",
  "PROCESS_SENDBACK_ITEM",
  "PROCESS_DELETE_ITEM",
  "DATAFORM_CREATE_ITEM",
  "DATAFORM_UPDATE_ITEM",
  "DATAFORM_SUBMIT_ITEM",
  "DATAFORM_DISCARD_ITEM",
  "DATAFORM_DELETE_ITEM",
]);

const isoNow = (ctx: HostCtx) => isoSec(ctx.clock());
export const wf = (ctx: HostCtx): WfCtx => ({ state: ctx.state, now: () => isoNow(ctx), kfa: ctx.params.kfa });

const flowOf = (req: Req): FlowId => {
  const f = req.flowId;
  if (!f || !(f in FLOWS)) throw new HostError("KISSFLOW_ERROR_01015", `Flow ${String(f)} does not exist in this app`, "not-found");
  return f as FlowId;
};
const isProc = (f: FlowId) => FLOWS[f].kind === "Process";

// ---------------------------------------------------------------- grants
const cellsOf = (u: FixtureUser, f: FlowId): string[] => u.roles.map((r) => ((GRANTS as unknown as Record<RoleIr, Record<FlowId, { cell: string }>>)[r]?.[f]?.cell ?? "—"));
export const canView = (u: FixtureUser, f: FlowId) => cellsOf(u, f).some((c) => c !== "—");
export const canInitiate = (u: FixtureUser, f: FlowId) => cellsOf(u, f).includes("I");
export const canEditForm = (u: FixtureUser, f: FlowId) => cellsOf(u, f).includes("E");
/** Flow Admin on a process (§11.2 adminList): admin users, Case Admin with caseAdminFlowAdmin=on, flowAdmin=<user>. */
export function isFlowAdmin(ctx: HostCtx, u: FixtureUser): boolean {
  if (ctx.params.adminList === "refuse" && !ctx.internal) return false;
  return !!u.admin || (ctx.params.caseAdminFlowAdmin && u.roles.includes("ciq_case_admin")) || ctx.params.flowAdmin === u.id;
}

// ---------------------------------------------------------------- errors
const movedOut = () => new HostError("KISSFLOW_ERROR_00400", "This item has moved out of your queue", "moved-out");
const notFound = (what: string) => new HostError("KISSFLOW_ERROR_01015", `${what} not found`, "not-found");
const adminDenied = () => new HostError("KISSFLOW_ERROR_050302", "You don't have permission to access this item.", "admin-denied");
const noPermission = (what: string) => new HostError("KISSFLOW_ERROR_050302", `You don't have permission to ${what}.`, "no-permission");

function checkPayload(a: DataAnalysis): void {
  if (a.ms.length) throw new HostError("KISSFLOW_ERROR_050312", msMessage(a.ms), "validation-ms");
  if (a.unknown.length) throw new HostError("KISSFLOW_ERROR_01004", `The field(s) ${a.unknown.join(", ")} do not exist`, "unknown-field");
}

// ---------------------------------------------------------------- reads
const SPARSE_KEEP = /^(_id|_status|_current_step|_created_at|_modified_at|_created_by|_modified_by|_activity_instance_id|Case_Code|Cycle_No|Supplier_Code|Case_Item_Id|[A-Za-z]+_Key)$/;

function withUsers(flow: FlowId, fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const defs = FIELDS[flow] as Record<string, { type: string }>;
  for (const [k, v] of Object.entries(fields)) out[k] = defs[k]?.type === "User" && v ? userRef(v) : clone(v);
  return out;
}
const sys = (it: { id: string; createdAt: string; modifiedAt: string; createdBy: string; modifiedBy: string }) => ({
  _id: it.id,
  _created_at: it.createdAt,
  _modified_at: it.modifiedAt,
  _created_by: userRef(it.createdBy),
  _modified_by: userRef(it.modifiedBy),
});

/** The step name a TASK row (or a task getItem) carries, by stepkey mode (§11.2). */
function taskStepKey(ctx: HostCtx, it: ProcItem, a: Activity, read: boolean): string | undefined {
  const s = step(a.step);
  const mode = ctx.params.stepkey;
  if (mode === "none") return read ? s.name : undefined;
  if (!s.parallel || mode === "_current_step") return s.name;
  if (mode === "block") return step(s.parallel.block).name;
  // first: the first open branch's name on every branch row
  const first = openActs(it)
    .map((x) => step(x.step))
    .filter((x) => x.parallel?.block === s.parallel!.block)
    .sort((x, y) => x.parallel!.branchIndex - y.parallel!.branchIndex)[0];
  return (first ?? s).name;
}

type RowMode = "mine" | "task" | "admin" | "item" | "adminItem";
export function procRow(ctx: HostCtx, it: ProcItem, mode: RowMode, a?: Activity): Record<string, unknown> {
  const row: Record<string, unknown> = { ...sys(it), _status: it.status, ...withUsers(it.flow, it.fields) };
  if (a) row._activity_instance_id = a.act;
  if (mode === "task" || mode === "item") {
    const k = a ? taskStepKey(ctx, it, a, mode === "item") : undefined;
    if (k) row._current_step = k;
  } else if (mode === "mine") {
    if (ctx.params.stepkey !== "none") row._current_step = currentStepName(it);
  } else if (mode === "admin") {
    if (ctx.params.adminStep === "row") row._current_step = currentStepName(it);
  } else row._current_step = currentStepName(it);
  if (ctx.params.rows === "sparse" && (mode === "mine" || mode === "task" || mode === "admin")) return Object.fromEntries(Object.entries(row).filter(([k]) => SPARSE_KEEP.test(k)));
  return row;
}
export const formRowOut = (r: FormRow): Record<string, unknown> => ({ ...sys(r), ...withUsers(r.flow, r.fields), ...(r.draft ? { _status: "Draft" } : {}) });

function envelope(ctx: HostCtx, kind: "mine" | "tasks" | "admin" | "form", flow: FlowId, all: Record<string, unknown>[], req: Req): unknown {
  const n = Math.max(1, Number(req.pageNumber) || 1);
  const s = Math.max(1, Number(req.pageSize) || 50);
  const page = all.slice((n - 1) * s, n * s);
  if (ctx.params.envelope === "items") return { items: page, total: all.length };
  if (ctx.params.envelope === "Data") return { Data: page }; // one key: the SDK hands the UI a bare array
  const Columns = Object.keys(FIELDS[flow]).map((id) => ({ Id: id }));
  // live (UI-LOG L106-L110): no total; tasks and admin lists carry the view envelope
  return kind === "tasks" || kind === "admin" ? { _id: `View_${kind}_${flow}`, Columns, Sort: [], Filter: {}, Data: page } : { Columns, Data: page };
}

const byCreated = <T extends { createdAt: string; id: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

function myStatus(it: ProcItem, status: string): boolean {
  const s = (status || "all").toLowerCase();
  if (s === "draft") return it.status === "Draft";
  if (it.status === "Draft") return false;
  if (s === "all") return true;
  return it.status.toLowerCase() === s.replace(/[\s_-]/g, "");
}

/** Open activities a user holds, in list order (multiAct places C4's Part 2 rows across the 50-row boundary). */
export function taskRows(ctx: HostCtx, u: FixtureUser, flow: FlowId, activityId?: string): { it: ProcItem; a: Activity }[] {
  const rows: { it: ProcItem; a: Activity }[] = [];
  for (const it of itemsOf(ctx.state, flow).sort(byCreated))
    for (const a of it.acts) if (holds(u, a) && it.status !== "Draft" && (!activityId || activityIdOf(a.step) === activityId)) rows.push({ it, a });
  const c4 = ctx.state.fixtures.C4;
  if (ctx.params.multiAct && u.id === "dev" && flow === "CIQ_Case_A00" && c4) {
    const moved = rows.filter((r) => r.it.id === c4 && step(r.a.step).parallel);
    const rest = rows.filter((r) => !moved.includes(r));
    const at = Math.min(49, Math.max(0, rest.length - 1));
    rest.splice(at, 0, ...moved); // the first lands on row 50 (page 1), the others on page 2
    return rest;
  }
  return rows;
}

function heldAct(u: FixtureUser, it: ProcItem, act: string | undefined): Activity {
  const a = it.acts.find((x) => x.act === act);
  if (!a || !holds(u, a)) throw movedOut();
  return a;
}

// ---------------------------------------------------------------- child rows
const childRowId = (ctx: HostCtx, t: ChildTableId) => {
  const sid: string | null = CHILD_TABLES[t].serverModelId;
  return `${sid ?? CHILD_TABLES[t].id}_${nextId(ctx.state, "s").slice(1).padStart(10, "0")}`;
};

/** Applies a write payload (header fields + `Table::` row operations) to stored fields. Returns what was applied. */
export function applyData(ctx: HostCtx, flow: FlowId, fields: Record<string, unknown>, data: Record<string, unknown>, o: { dropAdds?: boolean } = {}): void {
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("_")) continue;
    if (!k.startsWith("Table::")) {
      fields[k] = clone(v);
      continue;
    }
    const t = (Object.keys(CHILD_TABLES) as ChildTableId[]).find((x) => tableKey(x) === k && CHILD_TABLES[x].flow === flow);
    if (!t) continue;
    const rows = (Array.isArray(fields[k]) ? (fields[k] as Record<string, unknown>[]) : []).map((r) => ({ ...r }));
    for (const op of Array.isArray(v) ? (v as Record<string, unknown>[]) : []) {
      if (!op || typeof op !== "object") continue;
      const id = typeof op._id === "string" ? op._id : "";
      const cols = Object.fromEntries(Object.entries(op).filter(([c]) => !c.startsWith("_")));
      if (op._is_deleted) {
        const i = rows.findIndex((r) => r._id === id);
        if (i < 0) throw new HostError("KISSFLOW_ERROR_01015", `Row ${id} of ${t} not found`, "not-found");
        rows.splice(i, 1);
      } else if (op._is_created) {
        if (o.dropAdds) continue;
        const rowId = ctx.params.childIds === "server" || !id ? childRowId(ctx, t) : id;
        if (rows.some((r) => r._id === rowId)) throw new HostError("KISSFLOW_ERROR_00409", `Row ${rowId} already exists`, "bad-request");
        rows.push({ _id: rowId, ...clone(cols) });
      } else {
        const r = rows.find((x) => x._id === id);
        // [verified live 2026-10-08, acceptance journey g, RMES Safety PkEKlHAXWos6]: a modify that names an unknown row id
        // is NOT refused — Kissflow ADDS a new row with that id. So a stale client id silently duplicates a row.
        if (!r) rows.push({ _id: id || childRowId(ctx, t), ...clone(cols) });
        else Object.assign(r, clone(cols));
      }
    }
    fields[k] = rows;
  }
}

const touch = (ctx: HostCtx, x: { modifiedAt: string; modifiedBy: string }, u: FixtureUser) => {
  x.modifiedAt = isoNow(ctx);
  x.modifiedBy = u._id;
};

/** race mode: does this update drop its keys (or its child adds)? Consumes one count. */
function raceHit(ctx: HostCtx, flow: FlowId, data: Record<string, unknown>): "keys" | "adds" | null {
  const r = ctx.params.race;
  if (!r || ctx.internal) return null;
  const left = ctx.counters.raceLeft;
  if (left !== "always" && left <= 0) return null;
  let hit: "keys" | "adds" | null = null;
  if (r.target === flow) hit = "keys";
  else if (r.target === "child" && Object.entries(data).some(([k, v]) => k.startsWith("Table::") && Array.isArray(v) && v.some((x) => x && (x as { _is_created?: unknown })._is_created))) hit = "adds";
  if (hit && left !== "always") ctx.counters.raceLeft = left - 1;
  return hit;
}

// ---------------------------------------------------------------- the handler
export interface HandleOut {
  resp?: unknown;
  /** PROCESS_OPEN_FORM with openForm=hang: never answered. */
  noAnswer?: boolean;
  /** Extra facts for the recorder. */
  note?: Record<string, unknown>;
}

export function handle(ctx: HostCtx, u: FixtureUser, req: Req): HandleOut {
  const P = ctx.params;
  const off = !!ctx.internal; // fixture building: no failure modes
  switch (req.command) {
    case "CC_INITIALIZE":
      return {
        resp: {
          user: { _id: u._id, Name: u.Name, Email: u.Email, AppRoles: appRolesOf(u, P.roleNames) },
          account: { _id: "AcHARNESS01" },
          appId: P.appId,
          componentId: "CCWbHarness01",
          envDetails: { isMobile: false },
        },
      };
    case "GET_ROLES":
      if (!P.dev) throw new HostError("KISSFLOW_ERROR_00010", "Not available in a published page", "mode:getRoles");
      return { resp: { roles: allAppRoles(P.roleNames), currentRoles: appRolesOf(u, P.roleNames).map(({ _id, Name }) => ({ _id, Name })) } };
    case "SWITCH_ROLE":
      throw new HostError("FORBIDDEN", "SWITCH_ROLE removes the user from their roles: never allowed (ground rule 8)", "forbidden");
    case "PROCESS_DELETE_ITEM":
    case "DATAFORM_DELETE_ITEM":
      throw new HostError("FORBIDDEN", `${req.command}: the Workbench never deletes (ground rule 9)`, "forbidden");
    case "API":
      return { resp: api(ctx, u, req) };
  }

  const flow = flowOf(req);
  if (isProc(flow) && req.command.startsWith("DATAFORM_")) throw notFound(`Form ${flow}`);
  if (!isProc(flow) && req.command.startsWith("PROCESS_")) throw notFound(`Process ${flow}`);

  switch (req.command) {
    // ---- process lists
    case "PROCESS_GET_MY_ITEMS": {
      const all = itemsOf(ctx.state, flow)
        .filter((it) => it.createdBy === u._id && myStatus(it, String(req.status ?? "all")))
        .sort(byCreated)
        .map((it) => procRow(ctx, it, "mine", it.status === "Draft" ? openActs(it)[0] : undefined));
      return { resp: envelope(ctx, "mine", flow, all, req) };
    }
    case "PROCESS_GET_MY_TASKS_ITEMS": {
      const all = taskRows(ctx, u, flow, req.activityId || undefined).map(({ it, a }) => procRow(ctx, it, "task", a));
      return { resp: envelope(ctx, "tasks", flow, all, req) };
    }
    case "PROCESS_GET_PARTICIPATED_ITEMS": {
      if (P.participated === "error") throw new HostError("KISSFLOW_ERROR_00500", "some error occured", "mode:participated"); // UI-LOG L113, verbatim
      const all = itemsOf(ctx.state, flow)
        .filter((it) => it.actors.includes(u._id) && it.status !== "Draft")
        .sort(byCreated)
        .map((it) => procRow(ctx, it, "mine"));
      return { resp: envelope(ctx, "mine", flow, all, req) };
    }
    case "PROCESS_GET_ADMIN_ITEMS": {
      if (!isFlowAdmin(ctx, u)) throw adminDenied();
      const all = itemsOf(ctx.state, flow)
        .filter((it) => it.status !== "Draft")
        .sort(byCreated)
        .map((it) => procRow(ctx, it, "admin"));
      return { resp: envelope(ctx, "admin", flow, all, req) };
    }
    // ---- process items
    case "PROCESS_GET_ITEM": {
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw movedOut();
      const a = heldAct(u, it, req.activityInstanceId);
      return { resp: procRow(ctx, it, "item", a) };
    }
    case "PROCESS_GET_ADMIN_ITEM": {
      if (!isFlowAdmin(ctx, u)) throw adminDenied();
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw notFound("Item");
      return { resp: procRow(ctx, it, "adminItem") };
    }
    case "PROCESS_GET_PROGRESS": {
      if (!P.progress) throw new HostError("NOT_EMULATED", "getProgress is not available", "mode:progress");
      if (!canView(u, flow)) throw noPermission("view this flow");
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw notFound("Item");
      // [harness assumption] shape: one entry per activity, oldest first; {Data} is unwrapped by the SDK
      return {
        resp: {
          Data: it.acts.map((a) => ({
            _activity_instance_id: a.act,
            _activity_id: activityIdOf(a.step),
            Name: step(a.step).name,
            Status: a.open ? "InProgress" : a.how === "rejected" ? "Rejected" : "Completed",
            _created_at: a.openedAt,
            ...(a.closedAt ? { _completed_at: a.closedAt } : {}),
          })),
        },
      };
    }
    case "PROCESS_CREATE_ITEM": {
      if (!canInitiate(u, flow)) throw noPermission("create items in this flow");
      const data = (req.data ?? {}) as Record<string, unknown>;
      const an = analyse(flow, data);
      checkPayload(an);
      const bad = notWritableAt(startOf(flow).irId, an);
      if (bad.length) throw new HostError("KISSFLOW_ERROR_050313", permissionMessage(bad), "permission-050313");
      const fields: Record<string, unknown> = {};
      applyData(ctx, flow, fields, data);
      const it = startItem(wf(ctx), flow, u._id, fields);
      recompute(flow, it.fields, { childFormula: P.childFormula });
      return { resp: procRow(ctx, it, "item", openActs(it)[0]) };
    }
    case "PROCESS_UPDATE_ITEM": {
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw movedOut();
      const a = heldAct(u, it, req.activityInstanceId);
      const data = (req.data ?? {}) as Record<string, unknown>;
      const an = analyse(flow, data);
      checkPayload(an);
      const keys = [...an.fields, ...an.tables.map((t) => tableKey(t))];
      if (!off && P.kwb === "refuse" && step(a.step).kind !== "Start") throw new HostError("KISSFLOW_ERROR_050313", permissionMessage(keys), "mode:kwb"); // SPIKES L141: every field
      const bad = notWritableAt(a.step, an);
      if (bad.length) throw new HostError("KISSFLOW_ERROR_050313", permissionMessage(bad), "permission-050313");
      const race = raceHit(ctx, flow, data);
      if (race !== "keys") {
        applyData(ctx, flow, it.fields, data, { dropAdds: race === "adds" });
        recompute(flow, it.fields, { childFormula: P.childFormula });
        touch(ctx, it, u);
      }
      if (!it.actors.includes(u._id)) it.actors.push(u._id);
      return { resp: procRow(ctx, it, "item", a), note: race ? { race } : undefined };
    }
    case "PROCESS_UPDATE_ADMIN_ITEM": {
      if (!isFlowAdmin(ctx, u)) throw adminDenied();
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw notFound("Item");
      const data = (req.data ?? {}) as Record<string, unknown>;
      const an = analyse(flow, data);
      checkPayload(an);
      if (an.computed.length) throw new HostError("KISSFLOW_ERROR_050313", permissionMessage(an.computed), "permission-050313");
      const race = raceHit(ctx, flow, data);
      if (race !== "keys") {
        applyData(ctx, flow, it.fields, data, { dropAdds: race === "adds" });
        recompute(flow, it.fields, { childFormula: P.childFormula });
        touch(ctx, it, u);
      }
      return { resp: procRow(ctx, it, "adminItem"), note: race ? { race } : undefined };
    }
    case "PROCESS_SUBMIT_ITEM": {
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw movedOut();
      const a = heldAct(u, it, req.activityInstanceId);
      // Leniency as live: blank Mandatory fields are accepted (SPIKES L144); fields in the body are ignored (L142).
      submitAct(wf(ctx), it, a, u._id);
      recompute(flow, it.fields, { childFormula: P.childFormula });
      touch(ctx, it, u);
      return { resp: procRow(ctx, it, "adminItem"), note: { step: a.step } };
    }
    case "PROCESS_DISCARD_ITEM": {
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw notFound("Item");
      if (it.status !== "Draft" || it.createdBy !== u._id) throw noPermission("discard this item (only your own draft)");
      ctx.state.items.splice(ctx.state.items.indexOf(it), 1);
      return { resp: { discarded: true, _id: it.id } };
    }
    case "PROCESS_REJECT_ITEM": {
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw movedOut();
      const a = heldAct(u, it, req.activityInstanceId);
      if (!(SWITCHES as Record<string, { reject: boolean }>)[a.step]?.reject) throw new HostError("KISSFLOW_ERROR_00400", `Reject is not enabled at ${step(a.step).name}`, "switch-off");
      if (!off && P.reject === "refuse") throw new HostError("KISSFLOW_ERROR_00400", "Reject failed", "mode:reject");
      if (!String(req.comment ?? "").trim()) throw new HostError("KISSFLOW_ERROR_00400", "A comment is required to reject", "bad-request");
      rejectItem(wf(ctx), it, u._id);
      touch(ctx, it, u);
      return { resp: procRow(ctx, it, "adminItem"), note: { step: a.step } };
    }
    case "PROCESS_WITHDRAW_ITEM": {
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw notFound("Item");
      if (it.createdBy !== u._id || it.status !== "InProgress") throw new HostError("KISSFLOW_ERROR_00400", "Only the initiator can withdraw an item in progress", "not-initiator");
      withdrawItem(wf(ctx), it, u._id);
      touch(ctx, it, u);
      return { resp: procRow(ctx, it, "adminItem") };
    }
    case "PROCESS_SENDBACK_ITEM": {
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw movedOut();
      const a = heldAct(u, it, req.activityInstanceId);
      if (!(SWITCHES as Record<string, { sendBack: boolean }>)[a.step]?.sendBack) throw new HostError("KISSFLOW_ERROR_00400", `Send back is not enabled at ${step(a.step).name}`, "switch-off");
      if (!off && P.sendback === "500") throw new HostError("KISSFLOW_ERROR_00500", "Internal server error", "mode:sendback"); // SPIKES L147
      const target = stepOfActivityId(flow, String(req.stepId ?? ""));
      if (!target) throw new HostError("KISSFLOW_ERROR_00400", `Unknown step ${String(req.stepId)}`, "bad-request");
      if (!String(req.comment ?? "").trim()) throw new HostError("KISSFLOW_ERROR_00400", "A comment is required to send back", "bad-request");
      const next = sendBackAct(wf(ctx), it, a, target, u._id);
      touch(ctx, it, u);
      return { resp: procRow(ctx, it, "adminItem"), note: { step: a.step, to: next.step } };
    }
    case "PROCESS_OPEN_FORM": {
      const it = findItem(ctx.state, flow, String(req.instanceId));
      if (!it) throw movedOut();
      const a = heldAct(u, it, req.activityInstanceId);
      if (!off && P.openForm === "hang") return { noAnswer: true, note: { step: a.step } };
      if (!off && P.openForm === "refuse") throw new HostError("KISSFLOW_ERROR_00500", "The form could not be opened", "mode:openForm");
      return { resp: { opened: true, _id: it.id, _activity_instance_id: a.act }, note: { step: a.step } };
    }
    // ---- forms
    case "DATAFORM_GET_ITEMS": {
      if (!canView(u, flow)) throw noPermission("view this form");
      const all = rowsOfFlow(ctx.state, flow).sort(byCreated).map(formRowOut);
      return { resp: envelope(ctx, "form", flow, all, req) };
    }
    case "DATAFORM_GET_ITEM": {
      if (!canView(u, flow)) throw noPermission("view this form");
      const r = findRow(ctx.state, flow, String(req.itemId));
      if (!r || (r.draft && r.createdBy !== u._id)) throw notFound("Item");
      return { resp: formRowOut(r) };
    }
    case "DATAFORM_CREATE_ITEM": {
      if (!canEditForm(u, flow)) throw noPermission("create rows in this form");
      const data = (req.data ?? {}) as Record<string, unknown>;
      const an = analyse(flow, data);
      checkPayload(an);
      if (an.computed.length) throw new HostError("KISSFLOW_ERROR_050313", permissionMessage(an.computed), "permission-050313");
      const open = draftOf(ctx.state, flow, u._id);
      if (open) {
        if (P.drafts === "strict" || off) throw new HostError("KISSFLOW_ERROR_00409", `Conflict: your draft of ${FLOWS[flow].name} is still open`, "draft-409"); // SPIKES L158
        applyData(ctx, flow, open.fields, data); // sticky: the old draft is reused, leftovers stay
        recompute(flow, open.fields, { childFormula: P.childFormula });
        touch(ctx, open, u);
        return { resp: formRowOut(open), note: { reusedDraft: open.id } };
      }
      const at = isoNow(ctx);
      const r: FormRow = { flow, id: nextId(ctx.state, "Fr"), fields: {}, createdBy: u._id, createdAt: at, modifiedAt: at, modifiedBy: u._id, draft: true };
      applyData(ctx, flow, r.fields, data);
      recompute(flow, r.fields, { childFormula: P.childFormula });
      ctx.state.rows.push(r);
      return { resp: formRowOut(r) };
    }
    case "DATAFORM_SUBMIT_ITEM": {
      const r = findRow(ctx.state, flow, String(req.itemId));
      if (!r || !r.draft || r.createdBy !== u._id) throw notFound("Draft");
      if (!off && P.formSubmit === "fail" && !ctx.counters.formSubmitFailUsed) {
        ctx.counters.formSubmitFailUsed = true;
        throw new HostError("KISSFLOW_ERROR_00500", "The item could not be submitted", "mode:formSubmit");
      }
      let dropped: string | undefined;
      if (!off && P.formDrop && P.formDrop.flow === flow && !ctx.counters.formDropUsed) {
        ctx.counters.formDropUsed = true;
        dropped = P.formDrop.field;
        delete r.fields[dropped];
      }
      r.draft = false;
      if (!off && P.formSubmitId === "new") r.id = nextId(ctx.state, "Fr");
      recompute(flow, r.fields, { childFormula: P.childFormula });
      touch(ctx, r, u);
      return { resp: formRowOut(r), note: dropped ? { dropped } : undefined };
    }
    case "DATAFORM_UPDATE_ITEM": {
      const r = findRow(ctx.state, flow, String(req.itemId));
      if (!r || (r.draft && r.createdBy !== u._id)) throw notFound("Item");
      if (!canEditForm(u, flow)) throw noPermission("edit rows in this form");
      const data = (req.data ?? {}) as Record<string, unknown>;
      const an = analyse(flow, data);
      checkPayload(an);
      if (an.computed.length) throw new HostError("KISSFLOW_ERROR_050313", permissionMessage(an.computed), "permission-050313");
      const note: Record<string, unknown> = { stateBefore: r.fields.Config_State ?? null };
      const race = raceHit(ctx, flow, data);
      if (race !== "keys") {
        applyData(ctx, flow, r.fields, data, { dropAdds: race === "adds" });
        recompute(flow, r.fields, { childFormula: P.childFormula });
        touch(ctx, r, u);
      }
      if (race) note.race = race;
      return { resp: formRowOut(r), note };
    }
    case "DATAFORM_DISCARD_ITEM": {
      const r = draftOf(ctx.state, flow, u._id);
      if (!r) {
        if (P.noDraft === "ok") return { resp: { discarded: false, flowId: flow } };
        throw new HostError("KISSFLOW_ERROR_01015", "No draft found to discard", "no-draft");
      }
      ctx.state.rows.splice(ctx.state.rows.indexOf(r), 1);
      return { resp: { discarded: true, _id: r.id } };
    }
    case "DATAFORM_OPEN_FORM":
      return { resp: { opened: true, _id: String(req.itemId) } };
  }
  throw new HostError("NOT_EMULATED", `Not emulated: ${req.command}`, "not-emulated");
}

/** kf.api: a GET of the admin REST route (read fallback) only. DELETE and non-string bodies are refused. */
function api(ctx: HostCtx, u: FixtureUser, req: Req): unknown {
  const args = req.args ?? {};
  const method = String(args.method ?? "GET").toUpperCase();
  if (method === "DELETE") throw new HostError("FORBIDDEN", "kf.api DELETE: the Workbench never deletes (ground rule 9)", "forbidden");
  if ((method === "PUT" || method === "POST") && typeof args.body !== "string") throw new HostError("KISSFLOW_ERROR_00500", "Request body was not received (send a JSON string)", "body-not-string");
  const m = /\/process\/2\/[^/]+\/admin\/([^/]+)\/([^/?]+)/.exec(String(req.url ?? ""));
  if (m && method === "GET") {
    if (!isFlowAdmin(ctx, u)) throw adminDenied();
    const flow = m[1] as FlowId;
    const it = flow in FLOWS ? findItem(ctx.state, flow, m[2]) : undefined;
    if (!it) throw notFound("Item");
    return procRow(ctx, it, "adminItem");
  }
  throw new HostError("NOT_EMULATED", `Not emulated: kf.api ${method} ${String(req.url)}`, "not-emulated");
}

/** The Kissflow-shaped error answer the SDK rejects with. */
export const errorAnswer = (e: HostError | Error): { isError: true; errorMessage: { error_code: string; en_message: string } } => ({
  isError: true,
  errorMessage: { error_code: e instanceof HostError ? e.code : "KISSFLOW_ERROR", en_message: e.message },
});

export { APP_ID };
