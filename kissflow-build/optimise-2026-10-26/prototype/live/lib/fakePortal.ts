// OFFLINE ONLY. An in-memory CIQ Supplier Portal for the suites' offline runs, behaving like CIQ_Supplier_Portal_A00
// where the portal's writers (src/portal/data/liveActions.ts) and the integrations depend on it:
// - CIQP Request: created by I-1 at "Supplier: fill in the CIQ"; submit → "keep the CIQ up to date"; "keep" refuses
//   its submit (Keep_Open_Gate is Mandatory there and never filled, as live); "give the final release" (reached only by
//   a move, as nothing moves it live yet: integrations/STATUS.md "For Thomas" 1) takes Release_By_Name and Release_At
//   only, both Mandatory, then goes to "view the released CIQ" (back to "keep" when Release_Flag is "Reopened").
// - CIQP Query: created by op.round at "Supplier: respond"; submit → End. op.closed's "Skip and complete" completes it.
// - Who holds a step: the users in Assigned_Contacts (Release_Contacts at the release step), as the live assignment.
// - Task reads and writes need the item's current activity instance and a held step, else the live 050201 text;
//   DateTimes with milliseconds are refused; "Table::<model>" deltas add (`_is_created`) or change rows (by `_id`).
// Steps and ids from src/portal/kf/portal.ts. The fake integrations write it through create/set/move/complete.
import { FAKE_ERRORS } from "@/app-live/kf/fakeClient";
import { FLOWS, PORTAL_ID, STEPS, type FlowKey, type StepKey } from "@/portal/kf/portal";
import { kfDateTime, type KfData } from "@/portal/kf/sdk";
import { str, userIds, type RawItem } from "@/portal/data/raw";
import { NOT_IN_SUITE, type LivePortalClient } from "./livePortalClient";

export type PortalProcess = "request" | "query";
type Row = Record<string, unknown>;
const MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+(Z|[+-]\d{2}:?\d{2})$/;
const FIRST: Record<PortalProcess, StepKey> = { request: "fill", query: "respond" };
/** Mandatory on submit, per step (live drafts; the fill step's Assigned_Contacts as the 14 Oct smoke saw it). */
const MANDATORY: Partial<Record<StepKey, string[]>> = { fill: ["Assigned_Contacts"], keep: ["Keep_Open_Gate"], release: ["Release_By_Name", "Release_At"] };
/** The only fields a step lets the supplier write (others: every field the form shows). */
const ONLY: Partial<Record<StepKey, string[]>> = { release: ["Release_By_Name", "Release_At"] };

export const mandatoryText = (fields: string[]) => `KISSFLOW_ERROR_050312 Validation failed for the following fields: {${fields.map((f) => `'${f}': ['Value is required']`).join(", ")}}.`;

export interface FakePortal {
  db: Record<PortalProcess, RawItem[]>;
  find(id: string): { flow: PortalProcess; item: RawItem } | undefined;
  /** The step an item is at ("end" once completed or withdrawn). */
  stepOf(id: string): StepKey | "end" | undefined;
  /** An integration's "Create and submit": the new item at its first supplier step. */
  createSubmitted(flow: PortalProcess, data: KfData): RawItem;
  /** An integration's admin update (UpdateAnItem: ReadOnly fields too). */
  set(id: string, patch: KfData): void;
  /** Moves an item to a step (what no integration does live yet: the release-step moves). */
  move(id: string, step: StepKey | "end"): void;
  /** "Skip and complete". */
  complete(id: string): void;
  /** The PortalClient of one user; its webhook POSTs go to `onWebhook`. */
  client(o: { me: { _id: string; Name: string }; onWebhook(url: string, payload: unknown): void }): LivePortalClient;
}

export function createFakePortal(o: { me: { _id: string; Name: string }; now?: () => string }): FakePortal {
  const db: Record<PortalProcess, RawItem[]> = { request: [], query: [] };
  const steps = new Map<string, { step: StepKey | "end"; act: string }>();
  let seq = 0;
  let last = 0;
  const stamp = () => {
    last = Math.max(Date.parse(o.now?.() ?? new Date().toISOString()), last + 1000);
    return kfDateTime(new Date(last));
  };
  const meRef = { _id: o.me._id, Name: o.me.Name, Kind: "User" };

  function find(id: string): { flow: PortalProcess; item: RawItem } | undefined {
    for (const flow of ["request", "query"] as const) {
      const item = db[flow].find((x) => x._id === id);
      if (item) return { flow, item };
    }
    return undefined;
  }
  const holdersOf = (it: RawItem, step: StepKey) => userIds(it, step === "release" ? "Release_Contacts" : "Assigned_Contacts");

  /** The system fields of the item's step, as a full Kissflow read shows them. */
  function reflect(it: RawItem): void {
    const st = steps.get(it._id);
    if (!st || st.step === "end") {
      it._current_step = null;
      it._current_context = [];
      return;
    }
    const s = STEPS[st.step];
    it._current_step = s.name;
    it._current_context = [{ _context_activity_id: s.activity, _context_activity_instance_id: st.act, _context_current_step: s.name, _context_assigned_to: holdersOf(it, st.step).map((id) => ({ _id: id, Name: id === o.me._id ? o.me.Name : id, Kind: "User" })) }];
  }
  function touch(it: RawItem, by: Row | null): void {
    it._modified_at = stamp();
    if (by) it._modified_by = { ...by };
    reflect(it);
  }
  function merge(it: RawItem, data: KfData): void {
    for (const [k, v] of Object.entries(data)) {
      if (k === "_id") continue;
      if (!k.startsWith("Table::")) {
        it[k] = structuredClone(v);
        continue;
      }
      const rows: Row[] = Array.isArray(it[k]) ? [...(it[k] as Row[])] : [];
      for (const raw of (v as Row[]) ?? []) {
        const { _is_created, ...row } = raw ?? {};
        const at = typeof row._id === "string" ? rows.findIndex((r) => r._id === row._id) : -1;
        if (_is_created || at < 0) rows.push({ ...row, _id: `${k.slice(7)}_fake${++seq}` });
        else rows[at] = { ...rows[at], ...row };
      }
      it[k] = rows;
    }
  }
  const noMillis = (data: KfData) => {
    for (const [k, v] of Object.entries(data)) if (typeof v === "string" && MILLIS.test(v)) throw new Error(FAKE_ERRORS.millis(k));
  };
  function go(it: RawItem, step: StepKey | "end"): void {
    steps.set(it._id, { step, act: step === "end" ? "" : `PAct${++seq}` });
    it._status = step === "end" ? "Completed" : "InProgress";
    if (step === "end") it._completed_at = stamp();
    touch(it, null);
  }

  const portal: FakePortal = {
    db,
    find,
    stepOf: (id) => steps.get(id)?.step,
    createSubmitted(flow, data) {
      const at = stamp();
      const it: RawItem = { _id: `Pk${flow === "request" ? "Req" : "Qry"}${++seq}`, _flow_name: FLOWS[flow].name, _application_id: PORTAL_ID, _created_by: { ...meRef }, _created_at: at, _modified_by: { ...meRef }, _modified_at: at };
      merge(it, data);
      db[flow].push(it);
      go(it, FIRST[flow]);
      return structuredClone(it);
    },
    set(id, patch) {
      const hit = find(id);
      if (!hit) throw new Error(`fake portal set: no item ${id}`);
      merge(hit.item, patch);
      touch(hit.item, null);
    },
    move(id, step) {
      const hit = find(id);
      if (!hit) throw new Error(`fake portal move: no item ${id}`);
      go(hit.item, step);
    },
    complete(id) {
      portal.move(id, "end");
    },
    client({ me, onWebhook }) {
      const flowOf = (f: FlowKey): PortalProcess => {
        if (f !== "request" && f !== "query") throw new Error(`The fake portal has no ${FLOWS[f].name} items.`);
        return f;
      };
      const held = (f: FlowKey, id: string, act: string): RawItem => {
        const it = db[flowOf(f)].find((x) => x._id === id);
        const st = steps.get(id);
        if (!it || !st || st.step === "end" || st.act !== act || !holdersOf(it, st.step).includes(me._id)) throw new Error(FAKE_ERRORS.queue);
        return it;
      };
      const tasks = (f: FlowKey, activityId?: string) =>
        db[flowOf(f)].filter((it) => {
          const st = steps.get(it._id);
          return st && st.step !== "end" && holdersOf(it, st.step).includes(me._id) && (!activityId || STEPS[st.step].activity === activityId);
        });
      const by = { _id: me._id, Name: me.Name, Kind: "User" };
      async function update(f: FlowKey, id: string, act: string, data: KfData): Promise<void> {
        const it = held(f, id, act);
        const only = ONLY[steps.get(id)!.step as StepKey];
        const bad = only ? Object.keys(data).filter((k) => !only.includes(k)) : [];
        if (bad.length) throw new Error(FAKE_ERRORS.fields(FLOWS[flowOf(f)].id, bad));
        noMillis(data);
        merge(it, data);
        touch(it, by);
      }
      const refuse = (what: string) => async (): Promise<never> => {
        throw new Error(`The fake portal does not ${what}.`);
      };
      const c: LivePortalClient = {
        accountId: "AcTEST",
        parentHost: undefined, // offline: no Kissflow page around it
        listMine: async (f) => db[flowOf(f)].filter((it) => userIds(it, "_created_by")[0] === me._id).map((it) => structuredClone(it)),
        listTasks: async (f, activityId) => tasks(f, activityId).map((it) => ({ ...structuredClone(it), _activity_instance_id: steps.get(it._id)!.act })),
        async getFull(f, id, act) {
          if (!act) return null;
          return { ...structuredClone(held(f, id, act)), _activity_instance_id: act };
        },
        update,
        async submit(f, id, act) {
          const it = held(f, id, act);
          const step = steps.get(id)!.step as StepKey;
          const blank = (MANDATORY[step] ?? []).filter((k) => it[k] == null || it[k] === "" || (Array.isArray(it[k]) && !(it[k] as unknown[]).length));
          if (blank.length) throw new Error(mandatoryText(blank));
          const next: StepKey | "end" = step === "fill" ? "keep" : step === "release" ? (str(it, "Release_Flag") === "Reopened" ? "keep" : "released") : "end";
          go(it, next);
        },
        create: refuse("create items (the integrations do)"),
        discard: refuse("discard items"),
        async uploadFile() {
          throw new Error(NOT_IN_SUITE("Uploading a file"));
        },
        async postWebhook(url, payload) {
          onWebhook(url, structuredClone(payload));
        },
        async previewFiles() {
          throw new Error(NOT_IN_SUITE("Previewing a file"));
        },
        updateChildRow: (f, id, act, tableId, rowId, data) => update(f, id, act, { [`Table::${tableId}`]: [{ _id: rowId, ...data }] }),
        addChildRow: (f, id, act, tableId, row) => update(f, id, act, { [`Table::${tableId}`]: [{ _is_created: true, ...row }] }),
        listAll: async (f) => db[flowOf(f)].map((it) => structuredClone(it)),
        async adminGet(f, id) {
          const it = db[flowOf(f)].find((x) => x._id === id);
          if (!it) throw new Error(FAKE_ERRORS.notFound(id));
          return structuredClone(it);
        },
        async adminUpdate(f, id, data) {
          const it = db[flowOf(f)].find((x) => x._id === id);
          if (!it) throw new Error(FAKE_ERRORS.notFound(id));
          noMillis(data);
          merge(it, data);
          touch(it, by);
        },
        async adminDelete(f, id) {
          const list = db[flowOf(f)];
          const at = list.findIndex((x) => x._id === id);
          if (at < 0) throw new Error(FAKE_ERRORS.notFound(id));
          list.splice(at, 1);
          steps.delete(id);
        },
        formList: async () => [],
        formCreate: refuse("write forms"),
        formUpdate: refuse("write forms"),
        formDelete: refuse("write forms"),
        apiGet: refuse("answer raw API reads"),
        oneRead: (fn) => fn(),
      };
      return c;
    },
  };
  return portal;
}
