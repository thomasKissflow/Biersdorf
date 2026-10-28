// Typed surface of the Kissflow custom-UI SDK the Workbench uses, and the connection to it. Copied from the portal
// facade (src/portal/kf/sdk.ts; WB-3: copied, never imported) with the additions of WORKBENCH-DESIGN.md §6.1:
// rejectItem, withdrawItem (no activity instance), sendbackItem, openForm, getProgress, Dataform discardItem.
// There is NO delete method on any facade (ground rule 9). switchRole is not declared (ground rule 8).
// updateAdminItem is declared here but may be called only from data/adminRepair.ts (guards.spec.ts).
//
// The host does NOT install window.kf into the custom UI's cross-origin iframe: the bundle carries
// @kissflow/lowcode-client-sdk, whose initialize() posts CC_INITIALIZE to the parent frame and resolves with the
// handle once Kissflow answers (kfsdk.es.js 1.0.49; UI-LOG L19-L31).

export interface KfRole {
  _id: string;
  Name: string;
  Kind?: string;
}

export interface KfUser {
  _id: string;
  Name: string;
  Email?: string;
  Role?: unknown;
  AppRoles?: KfRole[];
}

export type KfData = Record<string, unknown>;

/** List paging: the SDK sends pageNumber 1 and pageSize 50 when they are omitted. */
export interface KfPage {
  pageNumber?: number;
  pageSize?: number;
}

export interface KfProcess {
  getMyItems(opts?: KfPage & { status?: "all" | "draft" | "inprogress" | "completed" | "withdrawn" | "rejected" }): Promise<unknown>;
  getMyTasksItems(opts?: KfPage & { activityId?: string }): Promise<unknown>;
  getParticipatedItems(opts?: KfPage & { activityId?: string }): Promise<unknown>;
  getAdminItems?(opts?: KfPage): Promise<unknown>;
  /** Both ids are required: the SDK rejects the call without an activityInstanceId. */
  getItem(opts: { instanceId: string; activityInstanceId: string }): Promise<unknown>;
  createItem(opts: { data: KfData }): Promise<unknown>;
  updateItem(opts: { instanceId: string; activityInstanceId: string; data: KfData }): Promise<unknown>;
  /** Fields in the body are ignored by Kissflow (SPIKES L142): never send any. */
  submitItem(opts: { instanceId: string; activityInstanceId: string; comment?: string }): Promise<unknown>;
  rejectItem?(opts: { instanceId: string; activityInstanceId: string; comment: string }): Promise<unknown>;
  /** Initiator only. No activity instance (sdk.d.ts ProcessWithdrawItemOptions). Not offered by the Workbench (COH-17). */
  withdrawItem?(opts: { instanceId: string; comment?: string }): Promise<unknown>;
  sendbackItem?(opts: { instanceId: string; activityInstanceId: string; stepId: string; comment: string }): Promise<unknown>;
  /** Discards the user's own draft (allowed; ground rule 9). */
  discardItem?(opts: { instanceId: string }): Promise<unknown>;
  getAdminItem?(opts: { instanceId: string }): Promise<unknown>;
  /** ONLY data/adminRepair.ts may call this (WB-16, guards.spec.ts). */
  updateAdminItem?(opts: { instanceId: string; data: KfData }): Promise<unknown>;
  /** Never answers in some hosts (_postMessageAsync has no timeout): always bound it (§7.4). */
  openForm?(item: { _id: string; _activity_instance_id: string }): unknown;
  getProgress?(opts: { instanceId: string }): Promise<unknown>;
  getFields?(): Promise<unknown>;
}

export interface KfDataform {
  getItems(opts?: KfPage & { searchValue?: string }): Promise<unknown>;
  getItem(opts: { itemId: string }): Promise<unknown>;
  createItem(opts: { data: KfData }): Promise<unknown>;
  submitItem(opts: { itemId: string }): Promise<unknown>;
  updateItem(opts: { itemId: string; data: KfData }): Promise<unknown>;
  /** No item id: discards the user's current draft of this Form (sdk.d.ts L859-L865). */
  discardItem?(opts?: Record<string, never>): Promise<unknown>;
  openForm?(item: { _id: string }): unknown;
}

export interface KfRolesAnswer {
  roles: { _id: string; Name: string }[];
  currentRoles: { _id: string; Name?: string }[];
}

export interface Kf {
  user: KfUser;
  account: { _id: string };
  app: {
    /** The container the UI runs in (the handshake's appId). */
    _id?: string;
    getProcess(id: string): KfProcess;
    getDataform(id: string): KfDataform;
    /** Development accounts; may also answer non-builders (sdk.d.ts L1297). [unverified] as a builder signal. */
    getRoles?(): Promise<KfRolesAnswer>;
  };
  /** The custom component the bundle runs in (the handshake's componentId). */
  context?: { _id?: string };
  env?: unknown;
  client?: {
    showInfo?(msg: string): void;
  };
  api(url: string, opts?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<unknown>;
}

export type Connection =
  | { kf: Kf; ms: number }
  | { kf: null; reason: "outside" | "no-answer" | "refused"; detail: string; ms: number };

type SdkModule = { initialize(): Promise<unknown> };

const loadSdk = async (): Promise<SdkModule> => (await import("@kissflow/lowcode-client-sdk")).default as SdkModule;

/** True inside any frame. A cross-origin parent throws on access, which is also a frame. */
export function inFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export const looksLikeKf = (x: unknown): x is Kf => {
  const k = x as Partial<Kf> | null;
  return !!k && typeof k.api === "function" && !!k.app && typeof k.app.getProcess === "function" && !!k.account?._id;
};

/**
 * Connects to Kissflow once per attempt. Opened directly (not in a frame) it answers at once, without loading the
 * SDK. Inside a frame it runs the SDK handshake, which waits forever if nobody answers, so it is raced with a
 * timeout (12 s by default; UI-LOG L19-L31, verified L102).
 */
export async function connectKf(opts: { timeoutMs?: number; framed?: boolean; load?: () => Promise<SdkModule> } = {}): Promise<Connection> {
  const t0 = Date.now();
  const ms = () => Date.now() - t0;
  const timeoutMs = opts.timeoutMs ?? 12000;
  if (!(opts.framed ?? inFrame())) return { kf: null, reason: "outside", detail: "This page is not inside Kissflow.", ms: ms() };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const sdk = await (opts.load ?? loadSdk)();
    const got = await Promise.race([sdk.initialize(), timeout]);
    if (got === "timeout") return { kf: null, reason: "no-answer", detail: `Kissflow did not answer within ${Math.round(timeoutMs / 1000)} s.`, ms: ms() };
    if (!looksLikeKf(got)) return { kf: null, reason: "refused", detail: "Kissflow answered without an account or app.", ms: ms() };
    return { kf: got, ms: ms() };
  } catch (e) {
    return { kf: null, reason: "refused", detail: errorText(e), ms: ms() };
  } finally {
    clearTimeout(timer);
  }
}

const LIST_KEYS = ["items", "Items", "Data", "data"] as const;

/**
 * The rows of a list answer. Live envelopes are {Columns, Data} and {_id, Columns, Sort, Filter, Data} with no total
 * (UI-LOG L106-L110); the SDK declares { items, total }; hosts have also answered a bare array. An object in any
 * other shape is refused rather than read as an empty list, so a parsing gap can't look like "no data".
 */
export function rowsOf(body: unknown): KfData[] {
  if (Array.isArray(body)) return body as KfData[];
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const k of LIST_KEYS) if (Array.isArray(b[k])) return b[k] as KfData[];
    if (Object.keys(b).length === 0) return [];
    throw new Error(`Kissflow answered a list in an unknown shape (keys: ${Object.keys(b).join(", ")}).`);
  }
  if (body == null) return [];
  throw new Error(`Kissflow answered a list with a ${typeof body}.`);
}

/** The total count a list answer reports, if any. */
export function totalOf(body: unknown): number | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const b = body as Record<string, unknown>;
  const t = b.total ?? b.Total ?? b.count ?? b.Count;
  return typeof t === "number" ? t : undefined;
}

/** "array", "{items,total}", … : the shape of a list answer, for Diagnostics. */
export const envelopeOf = (body: unknown): string => (Array.isArray(body) ? "array" : body && typeof body === "object" ? `{${Object.keys(body).join(",")}}` : typeof body);

/** Error text from whatever the SDK rejected with: its { isError, errorMessage } object (errorMessage a string or a
 *  Kissflow error envelope), an Error, a Kissflow envelope or a string. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as { errorMessage?: unknown; en_message?: string; message?: string; error_code?: string };
    if (typeof o.errorMessage === "string" && o.errorMessage) return o.errorMessage;
    if (o.errorMessage && typeof o.errorMessage === "object") return errorText(o.errorMessage);
    return [o.error_code, o.en_message || o.message].filter(Boolean).join(" ") || JSON.stringify(e).slice(0, 300);
  }
  return String(e);
}

/** Everything an SDK error carries, as one string (for code and field-list detection). */
export function errorBlob(e: unknown): string {
  const parts = [errorText(e)];
  try {
    if (e && typeof e === "object") parts.push(JSON.stringify(e instanceof Error ? { message: e.message, cause: (e as { cause?: unknown }).cause } : e));
  } catch {
    /* circular: the text is enough */
  }
  return parts.join(" ");
}
