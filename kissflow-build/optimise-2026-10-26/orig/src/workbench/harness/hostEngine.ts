// The emulated Kissflow APP host (WORKBENCH-DESIGN.md §11): fixtures built by driving the engine, the SDK command
// handlers, the recorder (window.__kfCalls), overlap detection (window.__kfOverlaps), write/read delays, the
// unanswered handshakes, native-form operations for the K-WB fallback (__kfHost.*) and the global checks.
// No browser API here except setTimeout (injectable), so vitest drives it directly.
import { APP_ID, FLOWS, type FlowId, type StepIr } from "../schema/generated";
import { globalChecks, createLaneOverlaps, isWriteCommand, type CallRecord, type CheckResult, type Click, type GlobalCheckOptions, type Overlap } from "./checks";
import { HostError, WRITE_COMMANDS, applyData, errorAnswer, handle, wf, type HostCtx, type Req } from "./commands";
import { recompute } from "./formula";
import { buildFixtures, type FixtureIndex } from "./fixtures";
import { DEFAULT_PARAMS, parseParams, type HostParams } from "./params";
import { analyse } from "./permissions";
import { clone, findItemAnyFlow, findRow, snapshot, type HostState, createState } from "./state";
import { USERS, type FixtureUser } from "./users";
import { holds, sendBackAct, stepByName, submitAct } from "./workflow";

export const HARNESS_MARKER = "__WB_HARNESS_ONLY__";

export interface HostEngineOptions {
  /** epoch ms; default Date.now */
  clock?: () => number;
  /** default setTimeout */
  schedule?: (fn: () => void, ms: number) => void;
}

export interface HostEngine {
  readonly params: HostParams;
  /** The signed-in fixture user (switchUser changes it; the state stays). */
  readonly me: FixtureUser;
  readonly state: HostState;
  readonly calls: CallRecord[];
  readonly overlaps: Overlap[];
  readonly clicks: Click[];
  readonly fixtures: FixtureIndex;
  /** Handles one SDK message; `send` is called with the answer (maybe later, maybe never). */
  dispatch(req: Req, send: (resp: unknown) => void): void;
  /** Synchronous handling (tests): the answer and the delay the host would apply. */
  handleNow(req: Req): { resp: unknown; delayMs: number; noAnswer: boolean; record: CallRecord };
  markClick(testId: string): void;
  /** Signs in another fixture user on the SAME state (multi-user scenarios); `dev` follows that user's default. */
  switchUser(id: string, o?: { dev?: boolean; flowAdmin?: string | null }): void;
  native: {
    /** A save in the native task form (after openForm or from My Tasks), child rows included. */
    save(instanceId: string, act: string, data: Record<string, unknown>): void;
    submit(instanceId: string, act: string): void;
    sendBack(instanceId: string, act: string, stepName: string): void;
    /** A lane value lost after the join (S39, S40). */
    dropLaneValue(caseId: string, fieldId: string): void;
  };
  snapshot(): HostState;
  checks(o?: GlobalCheckOptions): CheckResult[];
}

const READS = /^(PROCESS_GET_(MY_ITEMS|MY_TASKS_ITEMS|PARTICIPATED_ITEMS|ADMIN_ITEMS|ITEM|ADMIN_ITEM|PROGRESS)|DATAFORM_GET_(ITEMS|ITEM))$/;

function itemKeyOf(req: Req): string | null {
  if (!WRITE_COMMANDS.has(req.command)) return null;
  if (req.command === "PROCESS_CREATE_ITEM" || req.command === "DATAFORM_CREATE_ITEM") return null; // checked by the create lane
  const id = req.instanceId ?? req.itemId;
  if (req.command === "DATAFORM_DISCARD_ITEM") return `${req.flowId}:draft`;
  return id ? `${req.flowId}:${id}` : null;
}

export function createHostEngine(paramsIn: HostParams | Record<string, string> | URLSearchParams = DEFAULT_PARAMS, o: HostEngineOptions = {}): HostEngine {
  const params: HostParams = "user" in paramsIn && typeof (paramsIn as HostParams).dev === "boolean" ? (paramsIn as HostParams) : parseParams(paramsIn as Record<string, string>);
  let me = USERS[params.user];
  if (!me) throw new Error(`unknown fixture user ${params.user} (known: ${Object.keys(USERS).join(", ")})`);
  const clock = o.clock ?? (() => Date.now());
  const schedule = o.schedule ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms));
  const state = createState();
  const ctx: HostCtx = {
    state,
    params,
    users: USERS,
    clock,
    counters: { raceLeft: params.race ? params.race.n : 0, writeDelayUsed: false, formSubmitFailUsed: false, formDropUsed: false },
    internal: true,
  };
  const fixtures = buildFixtures(ctx);
  ctx.internal = false;

  const calls: CallRecord[] = [];
  const overlaps: Overlap[] = [];
  const clicks: Click[] = [];
  const inflight = new Map<string, number>();
  let ignoreInits = params.ignoreInits;
  let seq = 0;
  let clickUsed = 0;

  function record(req: Req): CallRecord {
    const rec: CallRecord = { seq: ++seq, at: clock(), user: me.id, command: String(req.command) };
    for (const k of ["flowId", "instanceId", "activityInstanceId", "itemId", "activityId", "stepId", "status", "comment", "url"] as const) if (req[k] !== undefined && req[k] !== "") (rec as unknown as Record<string, unknown>)[k] = req[k];
    if (typeof req.pageNumber === "number") rec.pageNumber = req.pageNumber;
    if (typeof req.pageSize === "number") rec.pageSize = req.pageSize;
    if (req.args?.method) rec.method = String(req.args.method);
    let data: unknown = req.data;
    if (req.command === "API" && typeof req.args?.body === "string") {
      try {
        data = JSON.parse(req.args.body);
      } catch {
        data = req.args.body;
      }
    } else if (req.command === "API" && req.args?.body !== undefined) data = req.args.body;
    if (data !== undefined && (WRITE_COMMANDS.has(rec.command) || rec.command === "API")) rec.data = clone(data);
    if (req.flowId && req.flowId in FLOWS && req.data && typeof req.data === "object") {
      const a = analyse(req.flowId as FlowId, req.data as Record<string, unknown>);
      rec.keys = { fields: a.fields, tables: a.tables, computed: a.computed, ms: a.ms, unknown: a.unknown };
    }
    calls.push(rec);
    return rec;
  }

  function violationsOf(req: Req, rec: CallRecord): string[] {
    const v: string[] = [];
    if (req.command === "SWITCH_ROLE") v.push("SWITCH_ROLE sent");
    if (/_DELETE_ITEM$/.test(req.command)) v.push("delete command sent");
    if (req.command === "API" && String(req.args?.method ?? "").toUpperCase() === "DELETE") v.push("kf.api DELETE sent");
    if ((WRITE_COMMANDS.has(req.command) || (req.command === "API" && String(req.args?.method ?? "GET").toUpperCase() !== "GET")) && params.appId !== APP_ID) v.push("write in the wrong container");
    if (req.command === "DATAFORM_UPDATE_ITEM" && req.flowId === "CIQ_Audit_Event_A00") v.push("F8 update");
    if (req.command === "PROCESS_UPDATE_ADMIN_ITEM") v.push("admin-route write");
    if (isWriteCommand(rec) && rec.keys?.computed.length) v.push("computed field written");
    if (isWriteCommand(rec) && rec.keys?.ms.length) v.push("DateTime with ms written");
    if (req.command === "PROCESS_OPEN_FORM") {
      const pending = clicks.filter((c) => c.testId === "wb-kwb-openform").length;
      if (pending > clickUsed) clickUsed++;
      else v.push("openForm without a click");
    }
    return v;
  }

  function run(req: Req): { resp: unknown; delayMs: number; noAnswer: boolean; record: CallRecord } {
    const rec = record(req);
    const v = violationsOf(req, rec);
    if (v.length) rec.violations = v;
    let delayMs = 0;
    if (req.command === "CC_INITIALIZE") delayMs = params.delayInit;
    else if (WRITE_COMMANDS.has(req.command)) {
      if (params.writeDelay && !(params.writeDelayOnce && ctx.counters.writeDelayUsed)) {
        delayMs = params.writeDelay;
        ctx.counters.writeDelayUsed = true;
      }
    } else if (READS.test(req.command)) delayMs = params.readDelay;
    try {
      if (v.includes("write in the wrong container")) throw new HostError("KISSFLOW_ERROR_050302", `This UI runs in ${params.appId}: writes to ${APP_ID} flows are not allowed here`, "wrong-container");
      const out = handle(ctx, me, req);
      if (out.note) rec.note = { ...(rec.note ?? {}), ...out.note };
      if (typeof out.note?.step === "string") rec.step = out.note.step as string;
      if ((req.command === "PROCESS_CREATE_ITEM" || req.command === "DATAFORM_CREATE_ITEM") && out.resp && typeof out.resp === "object") rec.note = { ...(rec.note ?? {}), createdId: (out.resp as { _id?: unknown })._id };
      if (out.noAnswer) {
        rec.noAnswer = true;
        return { resp: undefined, delayMs, noAnswer: true, record: rec };
      }
      return { resp: out.resp, delayMs, noAnswer: false, record: rec };
    } catch (e) {
      const err = e instanceof HostError ? e : new HostError("KISSFLOW_ERROR", e instanceof Error ? e.message : String(e), "bad-request");
      rec.refused = { code: err.code, message: err.message, category: err.category };
      return { resp: errorAnswer(err), delayMs, noAnswer: false, record: rec };
    }
  }

  const engine: HostEngine = {
    params,
    get me() {
      return me;
    },
    state,
    calls,
    overlaps,
    clicks,
    fixtures,
    handleNow: run,
    dispatch(req, send) {
      if (req.command === "CC_INITIALIZE" && ignoreInits > 0) {
        ignoreInits--;
        const rec = record(req);
        rec.ignored = true;
        return;
      }
      const key = itemKeyOf(req);
      if (key) {
        const prev = inflight.get(key);
        if (prev !== undefined) overlaps.push({ key, first: prev, second: seq + 1 });
      }
      const r = run(req);
      if (key) inflight.set(key, r.record.seq);
      if (r.noAnswer) {
        if (key) inflight.delete(key);
        return;
      }
      schedule(() => {
        if (key && inflight.get(key) === r.record.seq) inflight.delete(key);
        r.record.answeredAt = clock();
        send(r.resp);
      }, r.delayMs);
    },
    markClick(testId) {
      clicks.push({ testId, at: clock(), afterSeq: seq });
    },
    switchUser(id, o = {}) {
      const u = USERS[id];
      if (!u) throw new Error(`unknown fixture user ${id}`);
      me = u;
      params.user = id;
      params.dev = o.dev ?? id === "dev";
      if (o.flowAdmin !== undefined) params.flowAdmin = o.flowAdmin;
      calls.push({ seq: ++seq, at: clock(), user: id, command: "HOST_SWITCH_USER", native: true, note: { dev: params.dev, flowAdmin: params.flowAdmin } });
    },
    native: {
      save(instanceId, act, data) {
        const it = findItemAnyFlow(state, instanceId);
        if (!it) throw new Error(`nativeSave: no item ${instanceId}`);
        const a = it.acts.find((x) => x.act === act);
        if (!a || !holds(me, a)) throw new Error(`nativeSave: ${me.id} holds no open task ${act} on ${instanceId}`);
        const an = analyse(it.flow, data);
        if (an.unknown.length || an.computed.length) throw new Error(`nativeSave: the native form has no input for ${[...an.unknown, ...an.computed].join(", ")}`);
        applyData(ctx, it.flow, it.fields, data);
        recompute(it.flow, it.fields, { childFormula: params.childFormula });
        it.modifiedAt = wf(ctx).now();
        it.modifiedBy = me._id;
        calls.push({ seq: ++seq, at: clock(), user: me.id, command: "NATIVE_SAVE", flowId: it.flow, instanceId, activityInstanceId: act, data: clone(data), native: true, step: a.step });
      },
      submit(instanceId, act) {
        const it = findItemAnyFlow(state, instanceId);
        const a = it?.acts.find((x) => x.act === act);
        if (!it || !a || !holds(me, a)) throw new Error(`nativeSubmit: ${me.id} holds no open task ${act} on ${instanceId}`);
        submitAct(wf(ctx), it, a, me._id, "native-submit");
        recompute(it.flow, it.fields, { childFormula: params.childFormula });
        calls.push({ seq: ++seq, at: clock(), user: me.id, command: "NATIVE_SUBMIT", flowId: it.flow, instanceId, activityInstanceId: act, native: true, step: a.step });
      },
      sendBack(instanceId, act, stepName) {
        const it = findItemAnyFlow(state, instanceId);
        const a = it?.acts.find((x) => x.act === act);
        if (!it || !a || !holds(me, a)) throw new Error(`nativeSendBack: ${me.id} holds no open task ${act} on ${instanceId}`);
        const target = stepByName(it.flow, stepName);
        if (!target) throw new Error(`nativeSendBack: no step "${stepName}" in ${it.flow}`);
        sendBackAct(wf(ctx), it, a, target, me._id, "native-send-back");
        calls.push({ seq: ++seq, at: clock(), user: me.id, command: "NATIVE_SENDBACK", flowId: it.flow, instanceId, activityInstanceId: act, native: true, step: a.step, note: { to: target.irId } });
      },
      dropLaneValue(caseId, fieldId) {
        const it = findItemAnyFlow(state, caseId);
        if (!it || it.flow !== "CIQ_Case_A00") throw new Error(`dropLaneValue: no case ${caseId}`);
        it.fields[fieldId] = null;
        recompute(it.flow, it.fields, { childFormula: params.childFormula });
        calls.push({ seq: ++seq, at: clock(), user: "host", command: "HOST_DROP_LANE_VALUE", flowId: it.flow, instanceId: caseId, native: true, note: { fieldId } });
      },
    },
    snapshot: () => snapshot(state),
    checks: (opts = {}) => {
      const out = globalChecks(calls, overlaps, opts);
      const lane = createLaneOverlaps(calls);
      out.push({ label: "creates never overlap (one create lane)", pass: lane.length === 0, ...(lane.length ? { detail: lane.slice(0, 5) } : {}) });
      return out;
    },
  };
  return engine;
}

/** A Form row by fixture name (tests). */
export const fixtureRow = (e: HostEngine, flow: FlowId, name: string) => findRow(e.state, flow, e.fixtures[name] ?? "");
export type { StepIr };
