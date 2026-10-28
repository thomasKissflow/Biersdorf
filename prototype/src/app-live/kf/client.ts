// Every Kissflow call the internal app UI makes goes through this client (DESIGN §3.2 AppClient): SDK calls as the
// signed-in user (no keys in the bundle), every list paged, rate-limit retry with backoff, a 30 s bound on each call, at
// most 6 calls in flight at once (the load reads several flows side by side; the rest wait their turn, in order), and
// errors wrapped as AppError with the platform's own message. The patterns are the portal's (bounded/call/pages/
// itemOrThrow/withCause: src/portal/data/client.ts:68-125), with the app's ids (../ids.ts). Admin item reads use the
// SDK's own admin call with the admin REST route via kf.api as the fallback; kf.api bodies go as a JSON string with a
// Content-Type (CAFM D55, verified live). A webhook POST goes by the browser's fetch (no-cors, text/plain), kf.api only
// when that fetch throws (postWebhook); a relative hook URL (no Kissflow page around the frame: env.ts hookHostOf) goes
// by kf.api only, which the SDK sends to the account's own domain. Writes are refused unless the page runs in
// CIQ_Digital_A00. The data console's writes (26 Oct; the portal client's pattern, src/portal/data/client.ts): the
// SDK's admin update and form delete first, the REST route by kf.api when the SDK call fails for another reason than
// the data; a process item is deleted by the admin REST route only (the SDK's process deleteItem is not an admin call).
// The Orphans page's grouped delete (26 Oct, console/cascade.ts) also reaches a deleted case's CIQP Request and CIQP
// Query items in the supplier portal: the admin REST routes by kf.api with _application_id=CIQ_Supplier_Portal_A00 (list
// with Kissflow's search `q`, read, delete) [unverified from the app's frame; live with an API key, live/lib/liveClient.ts].
// Rate limits (26 Oct, after Thomas's "429 Too Many Requests" in the console): the retry of a rate-limited call follows a
// RetryPolicy. The CIQ screens keep theirs (SCREEN_RETRY: 3 retries after about 0.6 s, 1.2 s, 1.8 s); the data console
// has its own client (consoleClientOptions: at most CONSOLE_IN_FLIGHT calls in flight, CONSOLE_RETRY: exponential 1 s,
// 2 s, 4 s, 8 s … with jitter, at most 30 s waited per call, a Retry-After honoured), sharing the screens' one-draft-per-
// form queue; a call still limited after that fails with RATE_LIMITED, the console's plain text.
// 27 Oct (opening the supplier's files): previewFiles is kf.client.openFilePreview, Kissflow's own preview, unbounded
// and outside the call slots (it resolves when the person closes the preview), as the portal client's previewFiles.
// 27 Oct (@mentions): roleMembers and accountUsers read the colleague directory by kf.api (app-live/colleagues.ts), in
// their turn like every call; reads, so no container guard.
import { errorText, rowsOf, totalOf, type Kf, type KfPage } from "@/portal/kf/sdk";
import type { RawItem } from "@/portal/data/raw";
import { hookHostOf, type PageLike } from "../env";
import { APP_ID, FLOWS, PORTAL } from "../ids";
import type { AppClient, FlowKey, FormKey, PortalFlowKey, ProcessKey } from "../types";

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

/** The console's text for a call still rate-limited after its backoff (Thomas, 26 Oct). */
export const RATE_LIMITED = "Kissflow is limiting requests right now. Wait a minute, then try again.";

/** A call Kissflow kept answering 429 until the retry policy gave up (its message is the policy's text). */
export class RateLimitError extends AppError {}

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

/** The wait an answer asks for (Retry-After), in ms, if it carries one: a number of seconds or an HTTP date, under
 *  `retryAfter` / `retry_after` / `Retry-After`, in `headers` (a plain object or a Headers), on the error, its
 *  `errorMessage`, `response` or `cause`, or "Retry-After: n" in its text. [unverified] whether the Kissflow host passes
 *  it on to the frame at all; without it the policy's own backoff applies. */
export function retryAfterMs(e: unknown, now: number = Date.now()): number | undefined {
  const parse = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v * 1000);
    if (typeof v !== "string" || !v.trim()) return undefined;
    if (/^\s*\d+(\.\d+)?\s*$/.test(v)) return Math.round(Number(v) * 1000);
    const at = Date.parse(v);
    return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
  };
  const header = (h: unknown): unknown => {
    if (!h || typeof h !== "object") return undefined;
    if (typeof (h as Headers).get === "function") return (h as Headers).get("retry-after") ?? undefined;
    return Object.entries(h as Record<string, unknown>).find(([k]) => k.toLowerCase() === "retry-after")?.[1];
  };
  const seen = new Set<unknown>();
  const visit = (o: unknown, depth: number): number | undefined => {
    if (!o || typeof o !== "object" || seen.has(o) || depth > 3) return undefined;
    seen.add(o);
    const r = o as Record<string, unknown>;
    for (const v of [r.retryAfter, r.retry_after, r["Retry-After"], r["retry-after"], header(r.headers)]) {
      const ms = parse(v);
      if (ms !== undefined) return ms;
    }
    for (const k of ["errorMessage", "response", "cause"]) {
      const ms = visit(r[k], depth + 1);
      if (ms !== undefined) return ms;
    }
    return undefined;
  };
  const found = visit(e, 0);
  if (found !== undefined) return found;
  const m = /retry[- ]after\W{0,3}(\d+)/i.exec(errorText(e));
  return m ? Number(m[1]) * 1000 : undefined;
}

/** How a rate-limited (429) call is retried. */
export interface RetryPolicy {
  /** The wait before the next try, in ms, or undefined to give up. `attempt` counts the retries so far (0 = after the
   *  first 429), `waited` the ms this call has waited for them, `retryAfter` what the answer asked for (retryAfterMs). */
  wait(attempt: number, waited: number, retryAfter: number | undefined, random: () => number): number | undefined;
  /** The message a call still rate-limited fails with (a RateLimitError); absent: Kissflow's own text, as an AppError. */
  exhausted?: string;
}

/** The CIQ screens' policy, unchanged since 20 Oct: `retries` retries (default 3) after about 0.6 s, 1.2 s and 1.8 s
 *  (+ up to 0.25 s), Retry-After not read; then Kissflow's own text. */
export const screenRetry = (retries = 3): RetryPolicy => ({
  wait: (attempt, _waited, _after, random) => (attempt < retries ? 600 * (attempt + 1) + Math.floor(random() * 250) : undefined),
});
export const SCREEN_RETRY: RetryPolicy = screenRetry();

/** The most a console call waits for its retries (CONSOLE_RETRY). */
export const CONSOLE_RETRY_BUDGET_MS = 30000;
/** The data console's policy (26 Oct): exponential, 1 s, 2 s, 4 s, 8 s, 16 s … each plus up to 20 % jitter, until 30 s
 *  are waited in all (the last wait is cut to what is left; with under 1 s left it gives up). A Retry-After the answer
 *  carries is waited as asked, unless it goes past the 30 s: then the call gives up at once. A call still limited fails
 *  with RATE_LIMITED. */
export const CONSOLE_RETRY: RetryPolicy = {
  wait(attempt, waited, retryAfter, random) {
    const left = CONSOLE_RETRY_BUDGET_MS - waited;
    if (retryAfter !== undefined) return retryAfter <= left ? retryAfter : undefined;
    if (left < 1000) return undefined;
    const base = 1000 * 2 ** attempt;
    return Math.min(base + Math.floor(random() * base * 0.2), left);
  },
  exhausted: RATE_LIMITED,
};

/** The data console's calls in flight at once (26 Oct): its own limiter; the CIQ screens keep MAX_IN_FLIGHT. */
export const CONSOLE_IN_FLIGHT = 2;

/** Kissflow keeps one open draft per user per form: form creates queue per form. One queue for the screens' client and
 *  the console's, so a create in one waits for a create in the other. */
export type FormQueue = Map<FormKey, Promise<unknown>>;
export const newFormQueue = (): FormQueue => new Map();

/** A refusal about the data itself (field permission, validation): another route would refuse it too, so the admin
 *  read does not fall back on it. Kissflow codes 050312/050313 (master.md §6.6). */
export const isDataRefusal = (e: unknown) => /0503(12|13)|PermissionDeniedToUpdate|validation/i.test(errorText(e));

/** An SDK failure the REST route is not tried after: a refusal about the data (REST refuses it the same way), or the
 *  console's call still rate-limited after its backoff (26 Oct: another route would only add a call to the limit). */
const noFallback = (e: unknown) => isDataRefusal(e) || e instanceof RateLimitError;

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
  /** Retries of a rate-limited (429) call, with the screens' backoff (screenRetry); ignored when `retry` is given. */
  retries?: number;
  /** How a rate-limited call is retried (default: the screens' screenRetry(retries)). */
  retry?: RetryPolicy;
  /** The jitter's random source (default Math.random). */
  random?: () => number;
  /** Told before each wait for a rate-limited call (the console shows that it waits). */
  onRateLimit?: (waitMs: number) => void;
  /** The one-draft-per-form queue (default: this client's own); one queue for every client of a session. */
  formQueue?: FormQueue;
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

/** The data console's client options (26 Oct): its own limiter of CONSOLE_IN_FLIGHT calls and CONSOLE_RETRY, so its
 *  reads and deletes neither burst into the rate limit nor wait behind the CIQ screens' load. */
export const consoleClientOptions = (opts: AppClientOptions = {}): AppClientOptions => ({ maxInFlight: CONSOLE_IN_FLIGHT, retry: CONSOLE_RETRY, ...opts });

export function createAppClient(kf: Kf, opts: AppClientOptions = {}): AppClient {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const policy = opts.retry ?? screenRetry(opts.retries ?? 3);
  const random = opts.random ?? Math.random;
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

  /** One SDK call in its turn (inTurn), bounded, retried on a rate limit as the policy says. The bound counts from when
   *  the call goes out, not while it waits for its turn. A rate-limited call keeps its slot through the backoff, so the
   *  calls behind it wait too. */
  function call<T>(fn: () => Promise<T>): Promise<T> {
    return inTurn(async () => {
      let waited = 0;
      for (let attempt = 0; ; attempt++) {
        try {
          return await bounded(fn());
        } catch (e) {
          if (isRateLimited(e)) {
            const ms = policy.wait(attempt, waited, retryAfterMs(e), random);
            if (ms !== undefined) {
              opts.onRateLimit?.(ms);
              await sleep(ms);
              waited += ms;
              continue;
            }
            if (policy.exhausted) throw new RateLimitError(policy.exhausted, { cause: e });
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
  const formQueue = opts.formQueue ?? newFormQueue();
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
  const formPath = (f: FormKey, id: string) => `/form/2/${acc}/${FLOWS[f].id}/${encodeURIComponent(id)}?${q}`;
  const flowName = (f: FlowKey) => FLOWS[f].id;
  // the supplier portal's processes (the Orphans page's grouped delete): the same admin routes, in the portal's container
  const pq = `_application_id=${PORTAL.appId}`;
  const portalPath = (f: PortalFlowKey, id: string) => `/process/2/${acc}/admin/${PORTAL.flows[f]}/${encodeURIComponent(id)}?${pq}`;
  const portalListPath = (f: PortalFlowKey, page: KfPage, text?: string) =>
    `/process/2/${acc}/admin/${PORTAL.flows[f]}/item?page_number=${page.pageNumber}&page_size=${page.pageSize}${text ? `&q=${encodeURIComponent(text)}` : ""}&${pq}`;
  const needApi = () => {
    if (typeof kf.api !== "function") throw new AppError("This page has no Kissflow API route (not available).");
  };

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
          if (noFallback(e)) throw e;
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
    async formDelete(f, id) {
      writable();
      const d = form(f);
      let sdkError: unknown;
      if (typeof d.deleteItem === "function") {
        try {
          okOrThrow(await call(() => d.deleteItem({ itemId: id })));
          return;
        } catch (e) {
          if (noFallback(e)) throw e;
          sdkError = e; // [unverified] the form REST route; if that fails too, both causes are reported
        }
      }
      await withCause(sdkError, async () => okOrThrow(await call(() => kf.api(formPath(f, id), { method: "DELETE" }))));
    },
    async adminUpdate(f, id, data) {
      writable();
      const p = proc(f);
      let sdkError: unknown;
      if (typeof p.updateAdminItem === "function") {
        try {
          okOrThrow(await call(() => p.updateAdminItem!({ instanceId: id, data })));
          return;
        } catch (e) {
          if (noFallback(e)) throw e; // REST would refuse it the same way: report the real cause
          sdkError = e;
        }
      }
      // kf.api write bodies go as a JSON string with a Content-Type (CAFM D55, verified live); the caller reads back
      await withCause(sdkError, async () => okOrThrow(await call(() => kf.api(adminPath(f, id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }))));
    },
    async adminDelete(f, id) {
      writable();
      okOrThrow(await call(() => kf.api(adminPath(f, id), { method: "DELETE" })));
    },
    async portalList(f, text) {
      needApi();
      return pages((page) => kf.api(portalListPath(f, page, text), { method: "GET" }));
    },
    async portalGet(f, id) {
      needApi();
      return itemOrThrow(await call(() => kf.api(portalPath(f, id), { method: "GET" })), id);
    },
    async portalDelete(f, id) {
      writable();
      needApi();
      okOrThrow(await call(() => kf.api(portalPath(f, id), { method: "DELETE" })));
    },
    async previewFiles(files, index = 0) {
      // the portal client's previewFiles (src/portal/data/client.ts): no 30 s bound and no call slot (inTurn), since the
      // call resolves only when the person closes the preview; a read, so no container guard either
      const open = kf.client?.openFilePreview;
      if (typeof open !== "function") throw new AppError("Opening files is not available here.");
      if (!files.length) throw new AppError("There is no stored file to open.");
      try {
        await open.call(kf.client, { files, indexOfFile: Math.max(0, Math.min(index, files.length - 1)) });
      } catch (e) {
        throw e instanceof AppError ? e : new AppError(errorText(e), { cause: e });
      }
    },
    async listItems(listId) {
      // 26 Oct: the supplier form's countries; [unverified] whether a user (not an API key) may read a list this way
      if (typeof kf.api !== "function") throw new AppError("This page has no Kissflow API route (not available).");
      const body = await call(() => kf.api(`/flow/2/${acc}/list/${encodeURIComponent(listId)}/items?${q}`, { method: "GET" }));
      okOrThrow(body);
      return body;
    },
    async roleMembers(roleId) {
      // 27 Oct, the @mention colleagues (app-live/colleagues.ts); [unverified] whether a CIQ role may read a role this way
      needApi();
      const body = await call(() => kf.api(`/app_role/2/${acc}/${encodeURIComponent(roleId)}?${q}`, { method: "GET" }));
      okOrThrow(body);
      return body;
    },
    async accountUsers() {
      // 27 Oct: the account's users, one page (the e-mails of the role members); [unverified] as the user
      needApi();
      const body = await call(() => kf.api(`/user/2/${acc}?page_number=1&page_size=500`, { method: "GET" }));
      okOrThrow(body);
      return body;
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
