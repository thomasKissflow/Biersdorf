// Every Kissflow call the internal app UI makes goes through this client (DESIGN §3.2 AppClient): SDK calls as the
// signed-in user (no keys in the bundle), every list paged, rate-limit retry with backoff, a 30 s bound on each call, at
// most 6 calls in flight at once (the load reads several flows side by side; the rest wait their turn, in order), and
// errors wrapped as AppError with the platform's own message. The patterns are the portal's (bounded/call/pages/
// itemOrThrow/withCause: src/portal/data/client.ts:68-125), with the app's ids (../ids.ts). Admin item reads use the
// SDK's own admin call with the admin REST route via kf.api as the fallback; kf.api bodies go as a JSON string with a
// Content-Type (CAFM D55, verified live). A webhook POST goes by the browser's fetch (no-cors, text/plain), kf.api only
// when that fetch throws (postWebhook); a relative hook URL (no Kissflow page around the frame: env.ts hookHostOf) goes
// by kf.api only, which the SDK sends to the account's own domain. Writes are refused unless the page runs in
// CIQ_Digital_A00.
import { errorText, rowsOf, totalOf, type Kf, type KfPage } from "@/portal/kf/sdk";
import type { RawItem } from "@/portal/data/raw";
import { hookHostOf, type PageLike } from "../env";
import { APP_ID, FLOWS } from "../ids";
import type { AppClient, FlowKey, FormKey, ProcessKey } from "../types";

/** The SDK's own default page size; a larger one may be capped by the host, which would end paging early. */
/** Rows asked per list call (26 Oct optimisation: 200 instead of the SDK's default 50, so most lists take one call;
 *  the REST list honours 200, proven live 25 Oct; the SDK host [unverified] may cap it, which `pages` allows for). */
export const PAGE_SIZE = 200;
/** The smallest page a host answers in full (the SDK's default): a page shorter than this is the last one. A page of
 *  this size or more but under PAGE_SIZE may be a host's cap, so the next page is read too (at most one empty read). */
export const HOST_PAGE_FLOOR = 50;

/** SDK calls in flight at once, per client (= per session). They go out as the signed-in user, through the Kissflow
 *  page; a modest number keeps a load from bursting into the rate limit. */
export const MAX_IN_FLIGHT = 6;

export class AppError extends Error {}

/** The store's text for a page outside the app (DESIGN §6 step 1); the client refuses its writes with it too. */
export const NOT_IN_APP = "This page is not running in the CIQ Digital app. Nothing was saved.";

/** The Kissflow error number in an error ("050313" for KISSFLOW_ERROR_050313), if it names one. */
export function kfCode(e: unknown): string | undefined {
  return /KISSFLOW_ERROR_(\d+)/.exec(errorText(e))?.[1];
}

export const isRateLimited = (e: unknown) => {
  const o = e as { status?: unknown; errorMessage?: { status?: unknown } } | null;
  return o?.status === 429 || o?.errorMessage?.status === 429 || /\b429\b|too many requests/i.test(errorText(e));
};

/** A refusal about the data itself (field permission, validation): another route would refuse it too, so the admin
 *  read does not fall back on it. Kissflow codes 050312/050313 (master.md §6.6). */
export const isDataRefusal = (e: unknown) => /0503(12|13)|PermissionDeniedToUpdate|validation/i.test(errorText(e));

/** The item itself: an object carrying the expected _id and no Kissflow error envelope. */
function itemOrThrow(body: unknown, id?: string): RawItem {
  const o = body as (RawItem & { error_code?: string }) | null;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new AppError("Kissflow answered without the item.");
  if (o.error_code) throw new AppError(errorText(o));
  if (!o._id || (id !== undefined && o._id !== id)) throw new AppError(`Kissflow answered with a different item (${String(o._id || "no id")}).`);
  return o;
}

/** A write answer: anything but a Kissflow error envelope (the SDK normally rejects instead; the read-back decides). */
function okOrThrow(body: unknown): void {
  if (body && typeof body === "object" && !Array.isArray(body) && (body as { error_code?: unknown }).error_code) throw new AppError(errorText(body));
}

/** At most `lanes` calls in flight; results in input order (LiveSupplierStore.tsx:45-57). A thrown call rejects the whole. */
export async function pool<T, R>(items: T[], lanes: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(lanes, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

/** A path on the account's own domain ("/integration/2/…"), not a URL ("//host/…" names a host). */
const isPath = (url: string) => /^\/(?!\/)/.test(url);

const actOf = (it: RawItem): string | undefined => {
  if (typeof it._activity_instance_id === "string" && it._activity_instance_id) return it._activity_instance_id;
  const ctx = Array.isArray(it._current_context) ? (it._current_context[0] as Record<string, unknown> | undefined) : undefined;
  const a = ctx?._context_activity_instance_id;
  return typeof a === "string" && a ? a : undefined;
};

export interface AppClientOptions {
  sleep?: (ms: number) => Promise<void>;
  /** Retries of a rate-limited (429) call. */
  retries?: number;
  /** The bound on one SDK call (default 30 s): the SDK waits forever when the host never answers. */
  callTimeoutMs?: number;
  /** The webhook route (default the browser's fetch). */
  fetchImpl?: typeof fetch;
  /** SDK calls in flight at once (default MAX_IN_FLIGHT); the others wait, first come first served. */
  maxInFlight?: number;
  /** The page whose Kissflow parent hosts the hand-off URLs (default the browser's window: env.ts hookHostOf). */
  page?: PageLike;
}

/** At most `n` jobs running at once; a waiting job starts when one ends, in the order they came. A job's slot is held
 *  until it settles (its retries included), never while it waits. */
function limiter(n: number): <T>(job: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async (job) => {
    if (running >= n) await new Promise<void>((go) => waiting.push(go));
    else running++;
    try {
      return await job();
    } finally {
      const go = waiting.shift();
      if (go) go(); // the slot passes straight on
      else running--;
    }
  };
}

export function createAppClient(kf: Kf, opts: AppClientOptions = {}): AppClient {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retries = opts.retries ?? 3;
  const callTimeoutMs = opts.callTimeoutMs ?? 30000;
  const doFetch: typeof fetch = opts.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const inTurn = limiter(Math.max(1, opts.maxInFlight ?? MAX_IN_FLIGHT));
  const acc = kf.account._id;
  const appId = kf.app._id;

  /** An SDK command waits forever if the host never answers; this turns that into an error the screen can show. */
  function bounded<T>(p: Promise<T>, who = "Kissflow"): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AppError(`${who} did not answer within ${Math.round(callTimeoutMs / 1000)} s. If you were saving or sending, reload to see whether it went through.`)), callTimeoutMs);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  /** One SDK call in its turn (inTurn), bounded, retried on a rate limit. The bound counts from when the call goes
   *  out, not while it waits for its turn. A rate-limited call keeps its slot through the backoff. */
  function call<T>(fn: () => Promise<T>): Promise<T> {
    return inTurn(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await bounded(fn());
        } catch (e) {
          if (isRateLimited(e) && attempt < retries) {
            await sleep(600 * (attempt + 1) + Math.floor(Math.random() * 250));
            continue;
          }
          throw e instanceof AppError ? e : new AppError(errorText(e), { cause: e });
        }
      }
    });
  }

  /** Every page of a list, PAGE_SIZE rows asked a call. Stops on an empty page or one under HOST_PAGE_FLOOR rows, at the reported total, or when a page
   *  repeats rows already seen (a host that ignores the page number). Rows are deduped by `key`. */
  async function pages(get: (page: KfPage) => Promise<unknown>, key: (r: RawItem) => string = (r) => String(r._id), maxPages = 200): Promise<RawItem[]> {
    const seen = new Map<string, RawItem>();
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
      const body = await call(() => get({ pageNumber, pageSize: PAGE_SIZE }));
      okOrThrow(body);
      const rows = rowsOf(body) as RawItem[];
      const total = totalOf(body);
      const fresh = rows.filter((r) => !seen.has(key(r)));
      for (const r of fresh) seen.set(key(r), r);
      if (rows.length === 0 || rows.length < Math.min(PAGE_SIZE, HOST_PAGE_FLOOR) || fresh.length === 0 || (total !== undefined && seen.size >= total)) return [...seen.values()];
    }
    throw new AppError(`More than ${maxPages * PAGE_SIZE} items: the list was not read completely.`);
  }

  /** Runs the REST fallback; if it fails after the SDK call failed, the error names both causes, SDK first. */
  async function withCause<T>(sdkError: unknown, fallback: () => Promise<T>): Promise<T> {
    try {
      return await fallback();
    } catch (e) {
      if (sdkError === undefined) throw e;
      throw new AppError(`${errorText(sdkError)} (SDK); ${errorText(e)} (REST)`);
    }
  }

  /** Writes only from inside the app's own Custom UI (kf.app._id is the handshake's appId). */
  function writable(): void {
    if (appId !== APP_ID) throw new AppError(NOT_IN_APP);
  }

  /** Kissflow keeps one open draft per user per form: concurrent creates on one form would share it, so they queue. */
  const formQueue = new Map<FormKey, Promise<unknown>>();
  function oneAtATime<T>(f: FormKey, job: () => Promise<T>): Promise<T> {
    const run = (formQueue.get(f) ?? Promise.resolve()).catch(() => undefined).then(job);
    formQueue.set(f, run);
    return run;
  }

  const proc = (f: ProcessKey) => kf.app.getProcess(FLOWS[f].id);
  const form = (f: FormKey) => kf.app.getDataform(FLOWS[f].id);
  const q = `_application_id=${APP_ID}`;
  const adminPath = (f: ProcessKey, id: string) => `/process/2/${acc}/admin/${FLOWS[f].id}/${encodeURIComponent(id)}?${q}`;
  const viewPath = (f: ProcessKey, id: string) => `/process/2/${acc}/${FLOWS[f].id}/${encodeURIComponent(id)}?${q}`;
  const flowName = (f: FlowKey) => FLOWS[f].id;

  /** A webhook POST by the Kissflow API route, on the URL's path (the SDK sends it to the account's own domain). */
  async function hookByApi(url: string, body: string): Promise<"sdk"> {
    if (typeof kf.api !== "function") throw new AppError("This page has no Kissflow API route (not available).");
    const path = isPath(url) ? url : new URL(url).pathname;
    okOrThrow(await call(() => kf.api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body })));
    return "sdk";
  }

  return {
    accountId: acc,
    appId,
    hookHost: hookHostOf(opts.page),
    async adminList(f) {
      const p = proc(f);
      if (typeof p.getAdminItems !== "function") throw new AppError(`Listing every ${flowName(f)} item is not available here.`);
      return pages((page) => p.getAdminItems!(page));
    },
    async adminGet(f, id) {
      const p = proc(f);
      let sdkError: unknown;
      if (typeof p.getAdminItem === "function") {
        try {
          return itemOrThrow(await call(() => p.getAdminItem!({ instanceId: id })), id);
        } catch (e) {
          if (isDataRefusal(e)) throw e;
          sdkError = e; // try the admin REST route; if that fails too, both causes are reported
        }
      }
      return withCause(sdkError, async () => itemOrThrow(await call(() => kf.api(adminPath(f, id), { method: "GET" })), id));
    },
    async myTasks(f, activityId) {
      // one item may hold several activity instances: rows are distinct by item and instance
      return pages((p) => proc(f).getMyTasksItems({ ...p, activityId }), (r) => `${String(r._id)}|${String(r._activity_instance_id ?? "")}`);
    },
    async myItems(f) {
      return pages((p) => proc(f).getMyItems({ status: "all", ...p }));
    },
    async getTask(f, id, act) {
      const it = itemOrThrow(await call(() => proc(f).getItem({ instanceId: id, activityInstanceId: act })), id);
      return typeof it._activity_instance_id === "string" && it._activity_instance_id ? it : { ...it, _activity_instance_id: act };
    },
    async getById(f, id) {
      // [unverified] the viewer route: whether a View member may read a process item this way is morning test R-1
      return itemOrThrow(await call(() => kf.api(viewPath(f, id), { method: "GET" })), id);
    },
    async create(f, data) {
      writable();
      const it = itemOrThrow(await call(() => proc(f).createItem({ data })));
      const act = actOf(it) ?? (await draftAct(f, it._id));
      if (!act) throw new AppError(`Kissflow created ${flowName(f)} item ${it._id} without naming its step. It waits as a draft under My items.`);
      return { id: it._id, act };
    },
    async update(f, id, act, data) {
      writable();
      okOrThrow(await call(() => proc(f).updateItem({ instanceId: id, activityInstanceId: act, data })));
    },
    async submit(f, id, act) {
      writable();
      okOrThrow(await call(() => proc(f).submitItem({ instanceId: id, activityInstanceId: act })));
    },
    async discard(f, id) {
      writable();
      const p = proc(f);
      if (typeof p.discardItem !== "function") throw new AppError("Discarding a draft is not available here.");
      okOrThrow(await call(() => p.discardItem!({ instanceId: id })));
    },
    async formList(f) {
      return pages((p) => form(f).getItems(p));
    },
    async formGet(f, id) {
      return itemOrThrow(await call(() => form(f).getItem({ itemId: id })), id);
    },
    async formCreate(f, data) {
      writable();
      return oneAtATime(f, async () => {
        const draft = itemOrThrow(await call(() => form(f).createItem({ data })));
        const done = await call(() => form(f).submitItem({ itemId: draft._id }));
        okOrThrow(done);
        // a NEW id when the draft is finalised; the SDK unwraps a one-key answer ({_id}) into the bare id (kfsdk.es.js:164)
        if (typeof done === "string" && done.trim()) return done.trim();
        const newId = (done as { _id?: unknown } | null)?._id;
        return typeof newId === "string" && newId ? newId : draft._id;
      });
    },
    async formUpdate(f, id, data) {
      writable();
      okOrThrow(await call(() => form(f).updateItem({ itemId: id, data })));
    },
    async postWebhook(url, payload) {
      writable();
      const body = JSON.stringify(payload);
      // no Kissflow page around the frame (webhooksOf gave the relative path): the Kissflow API route only
      if (isPath(url)) return hookByApi(url, body);
      // Kissflow webhooks send no CORS headers but take a text/plain POST whose body is the JSON text, parsed like JSON
      // (portal session, 20 Oct). A no-cors POST of text/plain needs no preflight; its answer is opaque, so it counts as
      // sent once the browser handed it over (fire-and-forget: there is no status to read)
      let threw = false;
      // async: a fetch that throws at once (none on the page) rejects like one refused later
      const sent = (async () => doFetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body }))().catch((e: unknown) => {
        threw = true;
        throw e;
      });
      try {
        await bounded(sent, "The webhook");
        return "fetch";
      } catch (fetchError) {
        // only a fetch that THREW (a CSP refused it, offline) sent nothing: then the Kissflow API route. After the bound
        // the POST may still have gone out, and a second one would deliver the hand-off twice
        if (!threw) throw fetchError;
        try {
          return await hookByApi(url, body);
        } catch (e) {
          throw new AppError(`${errorText(fetchError)} (fetch); ${errorText(e)} (SDK)`);
        }
      }
    },
  };

  /** The step of a just-created draft when the create answer did not name it: the user's draft list [unverified]. */
  async function draftAct(f: ProcessKey, id: string): Promise<string | undefined> {
    try {
      const rows = await pages((p) => proc(f).getMyItems({ status: "draft", ...p }));
      const row = rows.find((r) => r._id === id);
      return row ? actOf(row) : undefined;
    } catch {
      return undefined;
    }
  }
}
