// Every Kissflow call the Workbench makes goes through this client (WORKBENCH-DESIGN.md §6.1–§6.2). Copied from the
// portal client (src/portal/data/client.ts; WB-3) and extended:
// - keyed by flow id from the generated schema;
// - task lists dedupe by `_id|_activity_instance_id` (WB-7), and the "no new row" stop compares that pair;
// - the admin REST fallback is a READ (GET) only, with _application_id = APP_ID;
// - there is no delete path at all (ground rule 9): the portal's adminDelete/formDelete are not copied;
// - a timeout is not a failure: bounded() rejects with TimeoutError, but the postMessage is not cancelled and may still
//   land, so writes that time out put the item into the "uncertain" state (writeQueue.ts).
// updateAdminItem is NOT called here; only data/adminRepair.ts may (WB-16).
import { APP_ID, flowName, type FlowId } from "../schema";
import { flowNoun } from "../domain/labels";
import { errorBlob, errorText, rowsOf, totalOf, type Kf, type KfData, type KfDataform, type KfPage, type KfProcess } from "../kf/sdk";

/** The SDK's own default page size; a larger one may be capped by the host, which would end paging early. */
export const PAGE_SIZE = 50;
export const MAX_PAGES = 200;

export type RawItem = KfData & { _id: string };

export class WbError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WbError";
  }
}
/** The call did not answer within the bound. It may still land (the SDK postMessage is never cancelled). */
export class TimeoutError extends WbError {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export const isTimeout = (e: unknown): boolean => e instanceof TimeoutError;
export const isRateLimited = (e: unknown): boolean => {
  const o = e as { status?: unknown; errorMessage?: { status?: unknown } } | null;
  return o?.status === 429 || o?.errorMessage?.status === 429 || /\b429\b|too many requests/i.test(errorText(e));
};
/** A field-level refusal at a step: KISSFLOW_ERROR_050313 or PermissionDeniedToUpdate (K-WB trigger, §7.4). */
export const isFieldRefusal = (e: unknown): boolean => /050313|PermissionDeniedToUpdate/i.test(errorBlob(e));
/** A refusal about the data itself (field permission, validation): another route would refuse it too. */
export const isDataRefusal = (e: unknown): boolean => /0503(12|13)|PermissionDeniedToUpdate|validation/i.test(errorBlob(e));
/** "This item has moved out of your queue" (SPIKES L118): the task is closed or not the user's. */
export const isMovedOut = (e: unknown): boolean => /moved out of (your|the) queue/i.test(errorBlob(e));
/** Of the keys sent, those the refusal names (word match in the error text or payload). [unverified] list format. */
export function refusedFieldsOf(e: unknown, sent: string[]): string[] {
  const blob = errorBlob(e);
  return sent.filter((k) => new RegExp(`(^|[^A-Za-z0-9_])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_]|$)`).test(blob));
}
/** An error that means "there is no draft to discard" (Dataform discardItem without a draft). [unverified] wording. */
export const isNoDraft = (e: unknown): boolean => /no (open )?draft|draft (was )?not found|nothing to discard|does not exist|not found/i.test(errorBlob(e));

/** The item itself: an object carrying the expected _id and no Kissflow error envelope. */
export function itemOrThrow(body: unknown, id?: string): RawItem {
  const o = body as (RawItem & { error_code?: string }) | null;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new WbError("Kissflow answered without the item.");
  if (o.error_code) throw new WbError(errorText(o), o);
  if (!o._id || (id !== undefined && o._id !== id)) throw new WbError(`Kissflow answered with a different item (${String(o._id || "no id")}).`);
  return o;
}

export const actOf = (row: KfData): string | undefined => (typeof row._activity_instance_id === "string" && row._activity_instance_id ? row._activity_instance_id : undefined);
export const taskKeyOf = (row: KfData): string => `${String(row._id ?? "")}|${actOf(row) ?? ""}`;

export interface ClientOptions {
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  callTimeoutMs?: number;
  openFormTimeoutMs?: number;
}

export type ListQuality = "admin" | "viewer" | "mine+tasks" | "form" | "failed";
export interface LadderResult {
  rows: RawItem[];
  quality: ListQuality;
  warnings: string[];
  /** Per rung: what was tried and how it answered (Diagnostics). */
  tried: { rung: "admin" | "viewer" | "mine+tasks"; ok: boolean; detail: string }[];
}
/** A pluggable viewer-route probe (rung 2). Stays disabled until Diagnostics proves a route live (K-14). */
export type ViewerRoute = (flow: FlowId) => Promise<RawItem[]>;

export interface WbClient {
  readonly kf: Kf;
  readonly accountId: string;
  /** The container this UI runs in (handshake appId). */
  readonly appId: string | undefined;
  call<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T>;
  process(flow: FlowId): KfProcess;
  dataform(flow: FlowId): KfDataform;
  // ---- process lists
  listMine(flow: FlowId, status?: "all" | "draft"): Promise<RawItem[]>;
  listTasks(flow: FlowId, activityId?: string): Promise<RawItem[]>;
  listAdmin(flow: FlowId): Promise<RawItem[]>;
  listParticipated(flow: FlowId): Promise<RawItem[]>;
  /** The read ladder (§6.2): admin → viewer (disabled unless proven) → mine ∪ tasks. */
  readLadder(flow: FlowId, o?: { skipAdmin?: boolean; viewer?: ViewerRoute | null }): Promise<LadderResult>;
  // ---- process items
  getItem(flow: FlowId, id: string, act: string): Promise<RawItem>;
  getAdminItem(flow: FlowId, id: string): Promise<RawItem>;
  getProgress(flow: FlowId, id: string): Promise<unknown>;
  create(flow: FlowId, data: KfData): Promise<{ id: string; act?: string }>;
  update(flow: FlowId, id: string, act: string, data: KfData): Promise<void>;
  submit(flow: FlowId, id: string, act: string, comment?: string): Promise<void>;
  /** Discard one's own process draft (ground rule 9 allows it). */
  discard(flow: FlowId, id: string): Promise<void>;
  reject(flow: FlowId, id: string, act: string, comment: string): Promise<void>;
  sendBack(flow: FlowId, id: string, act: string, stepId: string, comment: string): Promise<void>;
  /** Bounded to 8 s: openForm may never answer (§7.4). Button-only. */
  openForm(flow: FlowId, id: string, act: string): Promise<"opened" | "timeout" | "refused">;
  // ---- forms
  formList(flow: FlowId): Promise<RawItem[]>;
  formGet(flow: FlowId, id: string): Promise<RawItem>;
  formCreate(flow: FlowId, data: KfData): Promise<RawItem>;
  /** Submits a Form draft; the answer may carry a NEW id (the portal saw one). */
  formSubmit(flow: FlowId, id: string): Promise<string | undefined>;
  formUpdate(flow: FlowId, id: string, data: KfData): Promise<void>;
  /** Discards the user's current draft of this Form (no item id). */
  formDiscard(flow: FlowId): Promise<void>;
}

export function createClient(kf: Kf, opts: ClientOptions = {}): WbClient {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retries = opts.retries ?? 3;
  const callTimeoutMs = opts.callTimeoutMs ?? 30000;
  const openFormTimeoutMs = opts.openFormTimeoutMs ?? 8000;
  const acc = kf.account._id;

  /** An SDK command waits forever if the host never answers; this turns that into a TimeoutError. */
  function bounded<T>(p: Promise<T>, ms = callTimeoutMs): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(`Kissflow did not answer within ${Math.round(ms / 1000)} s.`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  async function call<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await bounded(Promise.resolve().then(fn), timeoutMs);
      } catch (e) {
        if (e instanceof TimeoutError) throw e;
        if (isRateLimited(e) && attempt < retries) {
          await sleep(600 * (attempt + 1) + Math.floor(Math.random() * 250));
          continue;
        }
        throw e instanceof WbError ? e : new WbError(errorText(e), e);
      }
    }
  }

  /** Every page of a list. Stops on a short page, on the reported total, or when a page brings no new row (a host
   *  that ignores the page number); throws after MAX_PAGES. */
  async function pages(get: (page: KfPage) => Promise<unknown>, keyOf: (r: KfData) => string): Promise<RawItem[]> {
    const seen = new Map<string, RawItem>();
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
      const body = await call(() => get({ pageNumber, pageSize: PAGE_SIZE }));
      let rows: KfData[];
      try {
        rows = rowsOf(body);
      } catch (e) {
        throw new WbError(errorText(e), e);
      }
      const total = totalOf(body);
      let fresh = 0;
      for (const r of rows) {
        const k = keyOf(r);
        if (!r._id || seen.has(k)) continue;
        seen.set(k, r as RawItem);
        fresh++;
      }
      if (rows.length < PAGE_SIZE || fresh === 0 || (total !== undefined && seen.size >= total)) return [...seen.values()];
    }
    throw new WbError(`More than ${MAX_PAGES * PAGE_SIZE} rows: the list was not read completely.`);
  }
  const byId = (r: KfData) => String(r._id ?? "");

  const proc = (f: FlowId) => kf.app.getProcess(f);
  const form = (f: FlowId) => kf.app.getDataform(f);
  const adminPath = (f: FlowId, id: string) => `/process/2/${acc}/admin/${f}/${id}?_application_id=${APP_ID}`;

  const client: WbClient = {
    kf,
    accountId: acc,
    appId: kf.app._id,
    call,
    process: proc,
    dataform: form,
    async listMine(f, status = "all") {
      return pages((p) => proc(f).getMyItems({ status, ...p }), byId);
    },
    async listTasks(f, activityId) {
      return pages((p) => proc(f).getMyTasksItems(activityId ? { activityId, ...p } : p), taskKeyOf);
    },
    async listAdmin(f) {
      const p = proc(f);
      if (typeof p.getAdminItems !== "function") throw new WbError("Listing every item needs flow Admin.");
      return pages((page) => p.getAdminItems!(page), byId);
    },
    async listParticipated(f) {
      return pages((p) => proc(f).getParticipatedItems(p), byId);
    },
    async readLadder(f, o = {}) {
      const tried: LadderResult["tried"] = [];
      const warnings: string[] = [];
      if (!o.skipAdmin) {
        try {
          const rows = await client.listAdmin(f);
          tried.push({ rung: "admin", ok: true, detail: `${rows.length} rows` });
          return { rows, quality: "admin", warnings, tried };
        } catch (e) {
          tried.push({ rung: "admin", ok: false, detail: errorText(e) });
        }
      } else tried.push({ rung: "admin", ok: false, detail: "skipped (View as lens or no flow Admin)" });
      if (o.viewer) {
        try {
          const rows = await o.viewer(f);
          tried.push({ rung: "viewer", ok: true, detail: `${rows.length} rows` });
          return { rows, quality: "viewer", warnings, tried };
        } catch (e) {
          tried.push({ rung: "viewer", ok: false, detail: errorText(e) });
        }
      } else tried.push({ rung: "viewer", ok: false, detail: "disabled (no viewer route known)" });
      try {
        const [mine, tasks] = await Promise.all([client.listMine(f, "all"), client.listTasks(f)]);
        const seen = new Map<string, RawItem>();
        for (const r of [...mine, ...tasks]) if (!seen.has(r._id)) seen.set(r._id, r);
        tried.push({ rung: "mine+tasks", ok: true, detail: `${mine.length} mine, ${tasks.length} task rows` });
        return { rows: [...seen.values()], quality: "mine+tasks", warnings, tried };
      } catch (e) {
        tried.push({ rung: "mine+tasks", ok: false, detail: errorText(e) });
        warnings.push(`The ${flowNoun(flowName(f))} list could not be read (${errorText(e)}).`);
        return { rows: [], quality: "failed", warnings, tried };
      }
    },
    async getItem(f, id, act) {
      return itemOrThrow(await call(() => proc(f).getItem({ instanceId: id, activityInstanceId: act })), id);
    },
    async getAdminItem(f, id) {
      const p = proc(f);
      let sdkError: unknown;
      if (typeof p.getAdminItem === "function") {
        try {
          return itemOrThrow(await call(() => p.getAdminItem!({ instanceId: id })), id);
        } catch (e) {
          if (isDataRefusal(e) || e instanceof TimeoutError) throw e;
          sdkError = e;
        }
      }
      // READ fallback only (GET). The REST route is never used to write.
      try {
        return itemOrThrow(await call(() => kf.api(adminPath(f, id), { method: "GET" })), id);
      } catch (e) {
        if (sdkError === undefined) throw e;
        throw new WbError(`${errorText(sdkError)} (SDK); ${errorText(e)} (REST)`, e);
      }
    },
    async getProgress(f, id) {
      const p = proc(f);
      if (typeof p.getProgress !== "function") throw new WbError("getProgress is not available.");
      return call(() => p.getProgress!({ instanceId: id }));
    },
    async create(f, data) {
      const r = itemOrThrow(await call(() => proc(f).createItem({ data })));
      return { id: r._id, act: actOf(r) };
    },
    async update(f, id, act, data) {
      await call(() => proc(f).updateItem({ instanceId: id, activityInstanceId: act, data }));
    },
    async submit(f, id, act, comment) {
      await call(() => proc(f).submitItem(comment ? { instanceId: id, activityInstanceId: act, comment } : { instanceId: id, activityInstanceId: act }));
    },
    async discard(f, id) {
      const p = proc(f);
      if (typeof p.discardItem !== "function") throw new WbError("Discarding a draft is not available.");
      await call(() => p.discardItem!({ instanceId: id }));
    },
    async reject(f, id, act, comment) {
      const p = proc(f);
      if (typeof p.rejectItem !== "function") throw new WbError("Reject is not available.");
      await call(() => p.rejectItem!({ instanceId: id, activityInstanceId: act, comment }));
    },
    async sendBack(f, id, act, stepId, comment) {
      const p = proc(f);
      if (typeof p.sendbackItem !== "function") throw new WbError("Send back is not available.");
      await call(() => p.sendbackItem!({ instanceId: id, activityInstanceId: act, stepId, comment }));
    },
    async openForm(f, id, act) {
      const p = proc(f);
      if (typeof p.openForm !== "function") return "refused";
      try {
        await call(() => Promise.resolve(p.openForm!({ _id: id, _activity_instance_id: act })), openFormTimeoutMs);
        return "opened";
      } catch (e) {
        return e instanceof TimeoutError ? "timeout" : "refused";
      }
    },
    async formList(f) {
      return pages((p) => form(f).getItems(p), byId);
    },
    async formGet(f, id) {
      return itemOrThrow(await call(() => form(f).getItem({ itemId: id })), id);
    },
    async formCreate(f, data) {
      return itemOrThrow(await call(() => form(f).createItem({ data })));
    },
    async formSubmit(f, id) {
      const done = (await call(() => form(f).submitItem({ itemId: id }))) as { _id?: unknown } | null | undefined;
      return done && typeof done === "object" && typeof done._id === "string" && done._id ? done._id : undefined;
    },
    async formUpdate(f, id, data) {
      await call(() => form(f).updateItem({ itemId: id, data }));
    },
    async formDiscard(f) {
      const d = form(f);
      if (typeof d.discardItem !== "function") throw new WbError("Discarding a Form draft is not available.");
      await call(() => d.discardItem!());
    },
  };
  return client;
}

/** Runs `fn` over `items` with at most `n` in flight (reads only; writes are serial). */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
