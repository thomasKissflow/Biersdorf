// Typed surface of the Kissflow custom-UI SDK that the portal UI uses (master.md §6.2), and the connection to it.
// The host does NOT install window.kf into the custom UI's cross-origin iframe: the bundle carries
// @kissflow/lowcode-client-sdk, whose initialize() posts CC_INITIALIZE to the parent frame and resolves with the
// handle once Kissflow answers (kfsdk.es.js 1.0.49; same as the live Promotion Management and CAFM UIs).

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
  getMyItems(opts?: KfPage & { status?: "all" | "draft" | "inprogress" }): Promise<unknown>;
  getMyTasksItems(opts?: KfPage & { activityId?: string }): Promise<unknown>;
  getParticipatedItems(opts?: KfPage): Promise<unknown>;
  getAdminItems?(opts?: KfPage): Promise<unknown>;
  /** Both ids are required: the SDK rejects the call without an activityInstanceId. */
  getItem(opts: { instanceId: string; activityInstanceId: string }): Promise<unknown>;
  createItem(opts: { data: KfData }): Promise<unknown>;
  updateItem(opts: { instanceId: string; activityInstanceId: string; data: KfData }): Promise<unknown>;
  submitItem(opts: { instanceId: string; activityInstanceId: string; comment?: string }): Promise<unknown>;
  withdrawItem?(opts: { instanceId: string; activityInstanceId?: string; comment?: string }): Promise<unknown>;
  deleteItem?(opts: { instanceId: string }): Promise<unknown>;
  discardItem?(opts: { instanceId: string }): Promise<unknown>;
  /** The item's form at a step; without the activity instance Kissflow starts a NEW draft (Ardee, live). */
  initForm?(instanceId: string, activityInstanceId: string): Promise<KfForm>;
  getAdminItem?(opts: { instanceId: string }): Promise<unknown>;
  updateAdminItem?(opts: { instanceId: string; data: KfData }): Promise<unknown>;
  getFields?(): Promise<unknown>;
}

/** A stored file as Kissflow returns it from uploadFile and keeps it in an Attachment value (an array of these). */
export interface KfFileMeta {
  id?: string;
  key?: string;
  name?: string;
  size?: number;
  fileExtension?: string;
  [k: string]: unknown;
}

/** A child table of an item's form (kfsdk.es.js Table: addRow posts ADD_TABLE_ROW; the host's form store saves it). */
export interface KfTable {
  addRow(row: KfData): Promise<unknown>;
  /** One row of the table (kfsdk.es.js TableForm: updateField posts UPDATE_FORM with the row id). */
  getRow(rowId: string): { updateField(data: KfData): Promise<unknown> };
  toJSON(): Promise<unknown>;
}

export interface KfForm {
  getTable(tableId: string): KfTable;
  toJSON(): Promise<unknown>;
}

export interface KfDataform {
  getItems(opts?: KfPage & { searchValue?: string }): Promise<unknown>;
  getItem(opts: { itemId: string }): Promise<unknown>;
  createItem(opts: { data: KfData }): Promise<unknown>;
  submitItem(opts: { itemId: string }): Promise<unknown>;
  updateItem(opts: { itemId: string; data: KfData }): Promise<unknown>;
  deleteItem(opts: { itemId: string }): Promise<unknown>;
}

export interface Kf {
  user: KfUser;
  account: { _id: string };
  app: {
    /** The container the UI runs in (the handshake's appId). */
    _id?: string;
    getProcess(id: string): KfProcess;
    getDataform(id: string): KfDataform;
    getRoles?(): Promise<{ roles: { _id: string; Name: string }[]; currentRoles: { _id: string }[] }>;
  };
  client?: {
    showInfo?(msg: string): void;
    /** Stores the file and resolves with its metadata, or null on failure (kfsdk.es.js uploadFile, FILE_UPLOAD). */
    uploadFile?(file: File, fileName?: string): Promise<KfFileMeta | null>;
    openFilePicker?(...args: unknown[]): Promise<unknown>;
    /** Navigates the Kissflow page itself (not the custom UI frame) to a URL (kfsdk REDIRECT). */
    redirect?(url: string): unknown;
    /** Kissflow's own file preview (lightbox) for stored files (kfsdk.es.js openFilePreview, FILEPREVIEW_OPEN). The
     *  files are the Attachment values as Kissflow stores them; resolves when the viewer closes it. */
    openFilePreview?(args: { files: Record<string, unknown>[]; indexOfFile?: number }): Promise<unknown>;
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

const looksLikeKf = (x: unknown): x is Kf => {
  const k = x as Partial<Kf> | null;
  return !!k && typeof k.api === "function" && !!k.app && typeof k.app.getProcess === "function" && !!k.account?._id;
};

/**
 * Connects to Kissflow once per attempt. Opened directly (not in a frame) it answers at once, without loading the
 * SDK. Inside a frame it runs the SDK handshake, which waits forever if nobody answers, so it is raced with a timeout.
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
 * The rows of a list answer. The SDK declares { items, total } (index.d.ts QueryResponse); hosts have also answered
 * { Data, count } or a bare array (CAFM, Promotion Management). A one-key answer arrives already unwrapped by the SDK.
 * An object in any other shape is refused rather than read as an empty list, so a parsing gap can't look like
 * "no data".
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

/** A Kissflow DateTime value: ISO without milliseconds (Kissflow rejects them; CAFM sdk.ts, verified live). */
export const kfDateTime = (d: Date = new Date()): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Error text from whatever the SDK rejected with: its { isError, errorMessage } object (errorMessage a string or a
 *  Kissflow error envelope), an Error, a Kissflow envelope or a string. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as { errorMessage?: unknown; en_message?: string; message?: string; error_code?: string };
    if (typeof o.errorMessage === "string" && o.errorMessage) return o.errorMessage;
    if (o.errorMessage && typeof o.errorMessage === "object") return errorText(o.errorMessage);
    return [o.error_code, o.en_message || o.message].filter(Boolean).join(" ") || JSON.stringify(e).slice(0, 200);
  }
  return String(e);
}
