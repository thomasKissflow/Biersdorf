// Test kit (specs only; never imported by the app): an in-memory WbClient with scriptable answers, and a runtime
// around it. Every call is recorded in `calls` so tests can assert order and absence (e.g. no reject after a failed
// F8 row, no UPDATE on F8). Fixtures are fictional (@example.test).
import type { Kf, KfData } from "../kf/sdk";
import type { LadderResult, RawItem, WbClient } from "../data/client";
import { TimeoutError, WbError } from "../data/client";
import { createPendingStore } from "../data/pendingSheet";
import { testRuntime, type Runtime } from "../data/runtime";
import { createSession } from "../data/session";
import type { TaskVM } from "../data/viewModels";
import { createWriteQueue } from "../data/writeQueue";
import type { FlowId, StepIr } from "../schema";
import { stepDef } from "../schema";

export interface Call {
  op: string;
  flow?: string;
  id?: string;
  act?: string;
  data?: KfData;
  extra?: unknown;
}

type Answer = void | { error?: unknown; timeout?: boolean; drop?: string[]; dropRows?: boolean };

export interface FakeScript {
  update?: (c: Call, n: number) => Answer;
  submit?: (c: Call, n: number) => Answer;
  reject?: (c: Call, n: number) => Answer;
  sendBack?: (c: Call, n: number) => Answer;
  create?: (c: Call, n: number) => Answer;
  getItem?: (c: Call, n: number) => Answer;
  formCreate?: (c: Call, n: number) => Answer;
  formSubmit?: (c: Call, n: number) => Answer;
  formUpdate?: (c: Call, n: number) => Answer;
  formDiscard?: (c: Call, n: number) => Answer;
  formGet?: (c: Call, n: number) => Answer;
  discard?: (c: Call, n: number) => Answer;
  openForm?: () => "opened" | "timeout" | "refused";
  /** Host assigns its own child row ids (harness childIds=server). */
  serverRowIds?: boolean;
}

export const ME = { _id: "UsDev01", Name: "Dev Builder", Email: "dev@example.test" };

export function fakeKfHandle(appId = "CIQ_Digital_A00"): Kf {
  return {
    user: { _id: ME._id, Name: ME.Name, Email: ME.Email, AppRoles: [{ _id: "RoRMM01", Name: "CIQ RMM" }] },
    account: { _id: "AcTEST01" },
    app: { _id: appId, getProcess: () => ({}) as never, getDataform: () => ({}) as never },
    api: async () => ({}),
  };
}

let seq = 0;
const nextId = (p: string) => `${p}${(++seq).toString(36).padStart(4, "0")}`;

/** Applies a write body to a stored item: header fields merge; Table:: arrays add/modify/delete rows. */
function applyBody(item: RawItem, body: KfData, serverRowIds: boolean, drop: string[] = [], dropRows = false) {
  for (const [k, v] of Object.entries(body)) {
    if (drop.includes(k)) continue;
    if (k.startsWith("Table::") && Array.isArray(v)) {
      if (dropRows) continue;
      const rows = ((item[k] as Record<string, unknown>[] | undefined) ?? []).map((r) => ({ ...r }));
      for (const r of v as Record<string, unknown>[]) {
        if (r._is_deleted) {
          const i = rows.findIndex((x) => x._id === r._id);
          if (i >= 0) rows.splice(i, 1);
          continue;
        }
        const i = rows.findIndex((x) => x._id === r._id);
        const clean = Object.fromEntries(Object.entries(r).filter(([c]) => c !== "_is_created" && c !== "_index"));
        if (i >= 0) rows[i] = { ...rows[i], ...clean };
        else if (r._is_created) rows.push({ ...clean, _id: serverRowIds ? nextId("Srv_") : r._id });
        // a modify of an unknown row id is ignored (as a host would not invent the row)
      }
      item[k] = rows;
    } else item[k] = v;
  }
}

export interface FakeClient extends WbClient {
  calls: Call[];
  items: Map<string, RawItem>;
  forms: Map<FlowId, RawItem[]>;
  taskRows: RawItem[];
  script: FakeScript;
  /** Puts a process item (and optionally an open task on it). */
  put(flow: FlowId, item: Partial<RawItem> & { _id: string }, task?: { act: string; step?: StepIr }): RawItem;
  ops(op?: string): Call[];
}

export function fakeClient(o: { appId?: string; script?: FakeScript } = {}): FakeClient {
  const calls: Call[] = [];
  const items = new Map<string, RawItem>();
  const forms = new Map<FlowId, RawItem[]>();
  const drafts = new Map<FlowId, RawItem>();
  const taskRows: RawItem[] = [];
  const script: FakeScript = o.script ?? {};
  const counts = new Map<string, number>();
  const k = (flow: string, id: string) => `${flow}:${id}`;
  const answer = async (name: keyof FakeScript, c: Call): Promise<Answer> => {
    calls.push(c);
    const n = (counts.get(name) ?? 0) + 1;
    counts.set(name, n);
    const fn = script[name] as ((c: Call, n: number) => Answer) | undefined;
    const a = fn?.(c, n);
    if (a && a.timeout) throw new TimeoutError("Kissflow did not answer within 30 s.");
    if (a && a.error) throw a.error instanceof Error ? a.error : new WbError(typeof a.error === "string" ? a.error : JSON.stringify(a.error), a.error);
    return a;
  };
  const itemOf = (flow: string, id: string) => {
    const it = items.get(k(flow, id));
    if (!it) throw new WbError("Item not found");
    return it;
  };
  const openTask = (flow: string, id: string, act: string) => taskRows.find((t) => t._flow === flow && t._id === id && t._activity_instance_id === act);
  const kf = fakeKfHandle(o.appId);

  const c: FakeClient = {
    kf,
    accountId: "AcTEST01",
    appId: o.appId ?? "CIQ_Digital_A00",
    calls,
    items,
    forms,
    taskRows,
    script,
    ops: (op) => (op ? calls.filter((x) => x.op === op) : calls),
    put(flow, item, task) {
      const it = { _status: "In progress", ...item } as RawItem;
      items.set(k(flow, item._id), it);
      if (task) taskRows.push({ ...item, _flow: flow, _activity_instance_id: task.act, _current_step: task.step ? stepDef(task.step).name : undefined } as RawItem);
      return it;
    },
    call: async (fn) => fn(),
    process: (flow) =>
      ({
        updateAdminItem: async ({ instanceId, data }: { instanceId: string; data: KfData }) => {
          calls.push({ op: "updateAdminItem", flow, id: instanceId, data });
          applyBody(itemOf(flow, instanceId), data, !!script.serverRowIds);
          return { _id: instanceId };
        },
      }) as never,
    dataform: () => ({}) as never,
    async listMine(flow) {
      calls.push({ op: "listMine", flow });
      return [...items.entries()].filter(([key]) => key.startsWith(`${flow}:`)).map(([, v]) => ({ ...v }));
    },
    async listTasks(flow) {
      calls.push({ op: "listTasks", flow });
      return taskRows.filter((t) => t._flow === flow).map((t) => ({ ...t }));
    },
    async listAdmin(flow) {
      calls.push({ op: "listAdmin", flow });
      return [...items.entries()].filter(([key]) => key.startsWith(`${flow}:`)).map(([, v]) => ({ ...v }));
    },
    async listParticipated() {
      throw new WbError("some error occured");
    },
    async readLadder(flow, ol = {}): Promise<LadderResult> {
      if (!ol.skipAdmin) return { rows: await c.listAdmin(flow), quality: "admin", warnings: [], tried: [{ rung: "admin", ok: true, detail: "" }] };
      return { rows: await c.listMine(flow), quality: "mine+tasks", warnings: [], tried: [{ rung: "mine+tasks", ok: true, detail: "" }] };
    },
    async getItem(flow, id, act) {
      await answer("getItem", { op: "getItem", flow, id, act });
      const it = itemOf(flow, id);
      if (!openTask(flow, id, act) && !(it._draft_act === act)) throw new WbError("This item has moved out of your queue");
      return JSON.parse(JSON.stringify(it));
    },
    async getAdminItem(flow, id) {
      calls.push({ op: "getAdminItem", flow, id });
      return JSON.parse(JSON.stringify(itemOf(flow, id)));
    },
    async getProgress(flow, id) {
      calls.push({ op: "getProgress", flow, id });
      throw new WbError("getProgress is not available.");
    },
    async create(flow, data) {
      const a = await answer("create", { op: "create", flow, data });
      const id = nextId("Pk");
      const act = nextId("Act");
      const it = { _id: id, _status: "Draft", _draft_act: act } as RawItem;
      applyBody(it, data, !!script.serverRowIds, a?.drop);
      items.set(k(flow, id), it);
      return { id, act };
    },
    async update(flow, id, act, data) {
      const a = await answer("update", { op: "update", flow, id, act, data });
      applyBody(itemOf(flow, id), data, !!script.serverRowIds, a?.drop, a?.dropRows);
    },
    async submit(flow, id, act, comment) {
      await answer("submit", { op: "submit", flow, id, act, extra: comment });
      const it = itemOf(flow, id);
      if (it._draft_act === act) {
        it._status = "In progress";
        delete it._draft_act;
      }
      const i = taskRows.findIndex((t) => t._flow === flow && t._id === id && t._activity_instance_id === act);
      if (i >= 0) taskRows.splice(i, 1);
    },
    async discard(flow, id) {
      await answer("discard", { op: "discard", flow, id });
      items.delete(k(flow, id));
    },
    async reject(flow, id, act, comment) {
      await answer("reject", { op: "reject", flow, id, act, extra: comment });
      itemOf(flow, id)._status = "Rejected";
    },
    async sendBack(flow, id, act, stepId, comment) {
      await answer("sendBack", { op: "sendBack", flow, id, act, extra: { stepId, comment } });
    },
    async openForm(flow, id, act) {
      calls.push({ op: "openForm", flow, id, act });
      return script.openForm?.() ?? "opened";
    },
    async formList(flow) {
      calls.push({ op: "formList", flow });
      return (forms.get(flow) ?? []).map((r) => JSON.parse(JSON.stringify(r)));
    },
    async formGet(flow, id) {
      await answer("formGet", { op: "formGet", flow, id });
      const r = (forms.get(flow) ?? []).find((x) => x._id === id);
      if (!r) throw new WbError("Item not found");
      return JSON.parse(JSON.stringify(r));
    },
    async formCreate(flow, data) {
      await answer("formCreate", { op: "formCreate", flow, data });
      const d = { _id: `draft_${ME._id}` } as RawItem;
      applyBody(d, data, !!script.serverRowIds);
      drafts.set(flow, d);
      return { ...d };
    },
    async formSubmit(flow, id) {
      const a = await answer("formSubmit", { op: "formSubmit", flow, id });
      const d = drafts.get(flow);
      if (!d) throw new WbError("No draft");
      drafts.delete(flow);
      const row = { ...d, _id: nextId("Fm") } as RawItem;
      for (const f of a?.drop ?? []) delete row[f];
      forms.set(flow, [...(forms.get(flow) ?? []), row]);
      return row._id;
    },
    async formUpdate(flow, id, data) {
      const a = await answer("formUpdate", { op: "formUpdate", flow, id, data });
      const r = (forms.get(flow) ?? []).find((x) => x._id === id);
      if (!r) throw new WbError("Item not found");
      applyBody(r, data, !!script.serverRowIds, a?.drop, a?.dropRows);
    },
    async formDiscard(flow) {
      await answer("formDiscard", { op: "formDiscard", flow });
      drafts.delete(flow);
    },
  };
  return c;
}

/** A runtime around a fake client. Tasks: TaskVMs the user "holds". */
export function fakeRuntime(client: FakeClient, opts: { tasks?: TaskVM[]; appId?: string } & Partial<Omit<Runtime, "tasks">> = {}): Runtime & { taskList: TaskVM[] } {
  const { tasks, appId, ...o } = opts;
  const taskList = tasks ?? [];
  const rt = testRuntime({
    client,
    queue: createWriteQueue({ appId: appId ?? client.appId, locks: null }),
    session: createSession(),
    pending: createPendingStore(null),
    me: ME,
    tasks: () => taskList,
    rnd: (() => {
      let x = 0.123;
      return () => (x = (x * 9301 + 0.49297) % 1);
    })(),
    ...o,
  });
  return Object.assign(rt, { taskList });
}

/** A held TaskVM on a stored item. */
export function heldTask(flow: FlowId, id: string, act: string, step: StepIr, evidence: TaskVM["evidence"] = "activity"): TaskVM {
  return { key: `${id}|${act}`, flow, instanceId: id, activityInstanceId: act, step, stepName: stepDef(step).name, evidence, title: id, raw: { _id: id } as RawItem };
}
