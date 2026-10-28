// Every Kissflow call the portal UI makes goes through this client: SDK calls as the signed-in user (no keys in the
// bundle), every list paged, rate-limit retry with backoff, and errors wrapped as PortalError with the platform's
// own message (master.md §6.5–§6.6). Admin item calls use the SDK's own admin methods, with the admin REST route
// via kf.api as the fallback; kf.api bodies go as a JSON string with a Content-Type (CAFM D55, verified live).
import { FLOWS, PORTAL_ID, hookToken, isHookPath, parentHost, type FlowKey, type ParentWindow } from "../kf/portal";
import { errorText, rowsOf, totalOf, type Kf, type KfData, type KfFileMeta, type KfPage } from "../kf/sdk";

/** The SDK's own default page size; a larger one may be capped by the host, which would end paging early. */
const PAGE_SIZE = 50;
import type { RawItem } from "./raw";

export class PortalError extends Error {}

const isRateLimited = (e: unknown) => {
  const o = e as { status?: unknown; errorMessage?: { status?: unknown } } | null;
  return o?.status === 429 || o?.errorMessage?.status === 429 || /\b429\b|too many requests/i.test(errorText(e));
};

/** A refusal about the data itself (field permission, validation): another route would refuse it too, so the admin
 *  calls don't fall back on it. Kissflow codes 050312/050313 (master.md §6.6). */
const isDataRefusal = (e: unknown) => /0503(12|13)|PermissionDeniedToUpdate|validation/i.test(errorText(e));

/** The item itself: an object carrying the expected _id and no Kissflow error envelope. */
function itemOrThrow(body: unknown, id?: string): RawItem {
  const o = body as (RawItem & { error_code?: string }) | null;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new PortalError("Kissflow answered without the item.");
  if (o.error_code) throw new PortalError(errorText(o));
  if (!o._id || (id !== undefined && o._id !== id)) throw new PortalError(`Kissflow answered with a different item (${String(o._id || "no id")}).`);
  return o;
}

export interface PortalClient {
  accountId: string;
  /** The host of the Kissflow page this UI runs in (portal.ts parentHost), read once from the window when the client is
   *  made; undefined when it is not a Kissflow host (the hand-offs then go as relative paths: portal.ts webhooksFor). */
  parentHost: string | undefined;
  /** Items I started. The "took part in" list (getParticipatedItems) fails platform-wide (plan v5 P4) and is never
   *  called: a supplier keeps seeing its request because it holds the "keep the CIQ up to date" step. */
  listMine(flow: FlowKey): Promise<RawItem[]>;
  /** My open tasks on a flow, optionally only those at one step (the SDK's activity filter). */
  listTasks(flow: FlowKey, activityId?: string): Promise<RawItem[]>;
  /** The item with every field, read through its activity instance; null when there is none to read through. */
  getFull(flow: FlowKey, id: string, activityInstanceId?: string): Promise<RawItem | null>;
  update(flow: FlowKey, id: string, activityInstanceId: string, data: KfData): Promise<void>;
  submit(flow: FlowKey, id: string, activityInstanceId: string): Promise<void>;
  create(flow: FlowKey, data: KfData): Promise<{ id: string; activityInstanceId?: string }>;
  /** Throws away a draft the user created (an unsent process item). */
  discard(flow: FlowKey, id: string): Promise<void>;
  /** Stores a file in Kissflow; resolves with its metadata (for an Attachment value). */
  uploadFile(file: File): Promise<KfFileMeta>;
  /** POSTs a JSON payload to a Kissflow webhook integration (plan v6 §4.1). A relative url (the page does not know its
   *  Kissflow host) goes through the SDK's api route only, which sends it to the account's own domain. An absolute one
   *  goes by the browser's fetch (no-cors, text/plain, fire-and-forget), and through the SDK's api route, with the
   *  url's relative path, only when that fetch throws (a CSP refused it). Only exactly a hook path
   *  /integration/2/<account>/webhook/<token>, or an https url with exactly that path, is sent: anything else fails
   *  before either route is used (portal.ts isHookPath, hookToken). */
  postWebhook(url: string, payload: unknown): Promise<void>;
  /** Opens Kissflow's own preview of stored files (Attachment values), on the file at `index`. */
  previewFiles(files: Record<string, unknown>[], index?: number): Promise<void>;
  /** Changes fields of one child-table row (by its server row id) at the contact's step, e.g. a removed upload. */
  updateChildRow(flow: FlowKey, id: string, activityInstanceId: string, tableId: string, rowId: string, data: KfData): Promise<void>;
  /** Adds a child-table row to a process item at the contact's step (its form), e.g. an Uploads row. */
  addChildRow(flow: FlowKey, id: string, activityInstanceId: string, tableId: string, row: KfData): Promise<void>;
  listAll(flow: FlowKey): Promise<RawItem[]>;
  adminGet(flow: FlowKey, id: string): Promise<RawItem>;
  adminUpdate(flow: FlowKey, id: string, data: KfData): Promise<void>;
  adminDelete(flow: FlowKey, id: string): Promise<void>;
  formList(flow: FlowKey): Promise<RawItem[]>;
  formCreate(flow: FlowKey, data: KfData): Promise<string>;
  formUpdate(flow: FlowKey, id: string, data: KfData): Promise<void>;
  formDelete(flow: FlowKey, id: string): Promise<void>;
  apiGet(path: string): Promise<unknown>;
}

export function createClient(kf: Kf, opts: { sleep?: (ms: number) => Promise<void>; retries?: number; callTimeoutMs?: number; fetch?: (url: string, init: RequestInit) => Promise<unknown>; window?: ParentWindow } = {}): PortalClient {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const doFetch = opts.fetch ?? ((url: string, init: RequestInit) => globalThis.fetch(url, init));
  const retries = opts.retries ?? 3;
  const callTimeoutMs = opts.callTimeoutMs ?? 30000;
  const acc = kf.account._id;
  const host = parentHost(opts.window); // once: the page around the UI does not change

  /** An SDK command waits forever if the host never answers; this turns that into an error the screen can show. */
  function bounded<T>(p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PortalError(`Kissflow did not answer within ${Math.round(callTimeoutMs / 1000)} s. If you were saving or sending, reload to see whether it went through.`)), callTimeoutMs);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await bounded(fn());
      } catch (e) {
        if (isRateLimited(e) && attempt < retries) {
          await sleep(600 * (attempt + 1) + Math.floor(Math.random() * 250));
          continue;
        }
        throw e instanceof PortalError ? e : new PortalError(errorText(e));
      }
    }
  }

  /** Every page of a list (the SDK's default page size). Stops on a short page, or when a page repeats rows
   *  already seen (a host that ignores the page number). */
  async function pages(get: (page: KfPage) => Promise<unknown>, maxPages = 200): Promise<RawItem[]> {
    const seen = new Map<string, RawItem>();
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
      const body = await call(() => get({ pageNumber, pageSize: PAGE_SIZE }));
      const rows = rowsOf(body) as RawItem[];
      const total = totalOf(body);
      const fresh = rows.filter((r) => !seen.has(String(r._id)));
      for (const r of fresh) seen.set(String(r._id), r);
      if (rows.length < PAGE_SIZE || fresh.length === 0 || (total !== undefined && seen.size >= total)) return [...seen.values()];
    }
    throw new PortalError(`More than ${maxPages * PAGE_SIZE} items: the list was not read completely.`);
  }

  /** Runs the REST fallback; if it fails after the SDK call failed, the error names both causes, SDK first. */
  async function withCause<T>(sdkError: unknown, fallback: () => Promise<T>): Promise<T> {
    try {
      return await fallback();
    } catch (e) {
      if (sdkError === undefined) throw e;
      throw new PortalError(`${errorText(sdkError)} (SDK); ${errorText(e)} (REST)`);
    }
  }

  const proc = (f: FlowKey) => kf.app.getProcess(FLOWS[f].id);
  const form = (f: FlowKey) => kf.app.getDataform(FLOWS[f].id);
  const adminPath = (f: FlowKey, id: string) => `/process/2/${acc}/admin/${FLOWS[f].id}/${id}?_application_id=${PORTAL_ID}`;

  return {
    accountId: acc,
    parentHost: host,
    async listMine(f) {
      return pages((p) => proc(f).getMyItems({ status: "all", ...p }));
    },
    async listTasks(f, activityId) {
      return pages((p) => proc(f).getMyTasksItems(activityId ? { ...p, activityId } : p));
    },
    async getFull(f, id, act) {
      if (!act) return null;
      return itemOrThrow(await call(() => proc(f).getItem({ instanceId: id, activityInstanceId: act })), id);
    },
    async update(f, id, act, data) {
      await call(() => proc(f).updateItem({ instanceId: id, activityInstanceId: act, data }));
    },
    async submit(f, id, act) {
      await call(() => proc(f).submitItem({ instanceId: id, activityInstanceId: act }));
    },
    async create(f, data) {
      const r = itemOrThrow(await call(() => proc(f).createItem({ data })));
      return { id: r._id, activityInstanceId: typeof r._activity_instance_id === "string" ? r._activity_instance_id : undefined };
    },
    async uploadFile(file) {
      if (typeof kf.client?.uploadFile !== "function") throw new PortalError("Uploading files is not available here.");
      // A file upload can take longer than the 30 s allowed for ordinary calls.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PortalError(`The upload of ${file.name} did not finish within 2 minutes.`)), 120000);
      });
      try {
        const meta = await Promise.race([kf.client.uploadFile(file, file.name), timeout]);
        if (!meta || typeof meta !== "object") throw new PortalError(`Kissflow could not store ${file.name}.`);
        return meta;
      } catch (e) {
        throw e instanceof PortalError ? e : new PortalError(errorText(e));
      } finally {
        clearTimeout(timer);
      }
    },
    async postWebhook(url, payload) {
      const body = JSON.stringify(payload);
      /** The SDK's api route, which sends a relative path to the account's own domain (Thomas, 21 Oct: production's
       *  domain is not written in the bundle). It answers a refusal as a body, not a rejection (as itemOrThrow knows). */
      const viaApi = async (path: string) => {
        if (typeof kf.api !== "function") throw new PortalError("This page has no Kissflow API route (not available).");
        const answer = await call(() => kf.api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body }));
        if (answer && typeof answer === "object" && !Array.isArray(answer) && (answer as { error_code?: unknown }).error_code) throw new PortalError(errorText(answer));
      };
      // Only a hook is sent: kf.api POSTs as the signed-in user to the account's own domain, so it takes nothing but
      // exactly /integration/2/<account>/webhook/<token> (portal.ts isHookPath: no "//" or "/\" naming another host, no
      // tab or newline the URL parser would drop, no other path), and an absolute url counts only with exactly that path
      // on https (portal.ts hookToken). Anything else fails before either route is used.
      // A relative url (portal.ts webhooksFor, when the page does not know its Kissflow host): the SDK only.
      if (url.startsWith("/")) {
        if (!isHookPath(url)) throw new PortalError("This is not a Kissflow webhook path.");
        return viaApi(url);
      }
      if (!hookToken(url)) throw new PortalError("This is not a Kissflow webhook URL.");
      // Kissflow webhooks send no CORS headers but take a text/plain POST whose body is the JSON text, parsed like JSON
      // (proven live 20 Oct). A no-cors POST of text/plain needs no preflight; its answer is opaque, so it counts as sent
      // once the browser handed it over (fire-and-forget: there is no status to read). The app UI does the same
      // (src/app-live/kf/client.ts postWebhook).
      let threw = false;
      // async: a fetch that throws at once (none on the page) rejects like one refused later
      const sent = (async () => doFetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body }))().catch((e: unknown) => {
        threw = true;
        throw e;
      });
      try {
        await bounded(sent);
      } catch (fetchError) {
        // only a fetch that THREW (a CSP refused it, offline) sent nothing: then the Kissflow API route. After the bound
        // the POST may still have gone out, and a second one would deliver the hand-off twice
        if (!threw) throw fetchError instanceof PortalError ? fetchError : new PortalError(errorText(fetchError));
        try {
          // the url's RELATIVE path, never the absolute url: the SDK sends it to the account's own domain. hookToken
          // took the url above, so its path is exactly a hook path (and it has no query); checked again all the same
          const path = new URL(url).pathname;
          if (!isHookPath(path)) throw new PortalError("This is not a Kissflow webhook path.");
          await viaApi(path);
        } catch (e) {
          throw new PortalError(`${errorText(fetchError)} (fetch); ${errorText(e)} (SDK)`);
        }
      }
    },
    async previewFiles(files, index = 0) {
      if (typeof kf.client?.openFilePreview !== "function") throw new PortalError("Previewing files is not available here.");
      if (!files.length) throw new PortalError("This file is not stored on the questionnaire yet.");
      try {
        // no 30 s bound: the call resolves only when the person closes the preview
        await kf.client.openFilePreview({ files, indexOfFile: Math.max(0, Math.min(index, files.length - 1)) });
      } catch (e) {
        throw e instanceof PortalError ? e : new PortalError(errorText(e));
      }
    },
    async addChildRow(f, id, act, tableId, row) {
      const p = proc(f);
      if (typeof p.initForm === "function") {
        const form = await call(() => p.initForm!(id, act));
        await call(() => form.getTable(tableId).addRow(row));
        return;
      }
      // Without the form API: the child-table delta through the item update (Table:: key, verified over REST).
      await call(() => p.updateItem({ instanceId: id, activityInstanceId: act, data: { [`Table::${tableId}`]: [{ _is_created: true, ...row }] } }));
    },
    async updateChildRow(f, id, act, tableId, rowId, data) {
      const p = proc(f);
      if (typeof p.initForm === "function") {
        const form = await call(() => p.initForm!(id, act));
        await call(() => form.getTable(tableId).getRow(rowId).updateField(data));
        return;
      }
      // Without the form API: the child-table delta through the item update, by the row's server id (P9: a known id
      // modifies the row; an unknown one would add a duplicate)
      await call(() => p.updateItem({ instanceId: id, activityInstanceId: act, data: { [`Table::${tableId}`]: [{ _id: rowId, ...data }] } }));
    },
    async discard(f, id) {
      const p = proc(f);
      if (typeof p.discardItem !== "function") throw new PortalError("Discarding a draft is not available.");
      await call(() => p.discardItem!({ instanceId: id }));
    },
    async listAll(f) {
      const p = proc(f);
      if (typeof p.getAdminItems !== "function") throw new PortalError("Listing every item needs the portal Admin role.");
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
    async adminUpdate(f, id, data) {
      const p = proc(f);
      let sdkError: unknown;
      if (typeof p.updateAdminItem === "function") {
        try {
          await call(() => p.updateAdminItem!({ instanceId: id, data }));
          return;
        } catch (e) {
          if (isDataRefusal(e)) throw e; // REST would refuse it the same way: report the real cause
          sdkError = e;
        }
      }
      // kf.api write bodies go as a JSON string with a Content-Type (CAFM D55, verified live); callers read back.
      await withCause(sdkError, () => call(() => kf.api(adminPath(f, id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })));
    },
    async adminDelete(f, id) {
      await call(() => kf.api(adminPath(f, id), { method: "DELETE" }));
    },
    async formList(f) {
      return pages((p) => form(f).getItems(p));
    },
    async formCreate(f, data) {
      const draft = itemOrThrow(await call(() => form(f).createItem({ data })));
      const done = (await call(() => form(f).submitItem({ itemId: draft._id }))) as RawItem | null; // a NEW id when finalised
      return String(done?._id || draft._id);
    },
    async formUpdate(f, id, data) {
      await call(() => form(f).updateItem({ itemId: id, data }));
    },
    async formDelete(f, id) {
      await call(() => form(f).deleteItem({ itemId: id }));
    },
    async apiGet(path) {
      return call(() => kf.api(path, { method: "GET" }));
    },
  };
}
