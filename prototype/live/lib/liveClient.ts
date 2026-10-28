// The app's AppClient over Kissflow REST for the live suite (tests-2026-10-21/SPEC.md §1, §2), with the key from
// kissflow-build/lib/kf.mjs (dev sandbox only: any other account or host is refused before the first call).
// Three layers, so the offline suite runs the same guards over the fake client:
// - createRest: every call goes through the ONE queue (queue.ts) after the path guard (an allow-list: item and list
//   routes of the two apps, read-only flow/role/draft lists; never metadata writes, publish, integrations, roles,
//   members, lists or connections), with the "floor" write guards (only the app flows of SPEC §1, only ledger ids,
//   never CIQ Config Version) and the redacting request log ({at, method, path, status, ms, err?}: no bodies, no
//   webhook URL, "webhook:<code>" instead). kf.mjs is called with retries: 0 (no automatic retry on a 429).
// - restApp: the AppClient routes of SPEC §2. There is no REST route for the SDK's admin list or My tasks, so they are
//   emulated: adminList = My items ∪ this run's ledger ids, each read by an admin GET ("approximated": every test item
//   is created by the key user or adopted into the ledger); myTasks = those items whose _current_context holds the step
//   for Thomas, directly or through a role he holds (read once at boot, readHeldRoles). oneRead() lets one load share
//   those listings and admin reads; any write ends the sharing. oneRead(fn, {scope: "run"}) is an opt-in further
//   approximation for the suites' loads: the listings are this run's ledger items only (no My items, no admin GET of
//   anybody else's items) and the form lists keep only this run's rows (and every configuration row).
// - guardApp: the flow-level guards in front of either inner client (REST or the offline fake): creates only on the
//   allowed app flows and only for this run's data, writes only to this run's ledger ids, webhooks only to known hook
//   URLs naming ledger items. Every created id goes to the ledger the moment it is known, before the next call.
import { DEV_ACCOUNT } from "@/shell/env";
import { APP_ID, FLOWS, STEPS, STEP_NAMES } from "@/app-live/ids";
import { AppError } from "@/app-live/kf/client";
import type { AppClient, FlowKey, FormKey, LiveRoleRef, ProcessKey } from "@/app-live/types";
import type { HandoffCode } from "@/app-live/shared/handoff";
import { PORTAL_ID, FLOWS as PORTAL_FLOWS, type Webhooks } from "@/portal/kf/portal";
import { errorText, rowsOf, totalOf, type KfData } from "@/portal/kf/sdk";
import { str, type RawItem } from "@/portal/data/raw";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TESTS_DIR, type Ledger } from "./ledger";
import { CutOffError, StopError, type Queue } from "./queue";

export const DEV_HOST = "dev-beiersdorf.kissflow.eu";
/** Thomas, the key's user: he stands in for every role and for the supplier contact (SPEC §1 "Data"). */
export const THOMAS = "UsEJUfjYLM8Y";
export const REQUEST_LOG = `${TESTS_DIR}requests.jsonl`;
const PAGE_SIZE = 50;

/** A hand-off code: the app's (SET:current webhooks) or the portal's (portal.ts webhooksFor keys). */
export type PortalCode = keyof Webhooks;
export type HookCode = HandoffCode | PortalCode;
export const PORTAL_CODES: readonly PortalCode[] = ["requestChanged", "completenessConfirmed", "queryAnswered", "releaseGiven"];

/** A guard refused the call before it reached Kissflow. */
export class GuardError extends Error {
  constructor(message: string) {
    super(`Refused by the live-suite guard: ${message}`);
    this.name = "GuardError";
  }
}

/** A Kissflow answer that is an error: `message` is Kissflow's own text ("KISSFLOW_ERROR_050201 This item has …"). */
export class KfError extends AppError {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------- flows and what may be written

const APP_PROCESSES: Record<ProcessKey, string> = { case: FLOWS.case.id, review: FLOWS.review.id, op: FLOWS.op.id };
/** SPEC §1 "Allowed writes" (forms), CIQ Scope Run included (the app's ensureReviews wrote it until 22 Oct); CIQ Config
 *  Version never. */
export const WRITABLE_FORMS: readonly FormKey[] = ["audit", "note", "rmesSAF", "rmesREG", "supplier", "scopeRun"];
const APP_WRITE_FLOWS = new Set<string>([...Object.values(APP_PROCESSES), ...WRITABLE_FORMS.map((f) => FLOWS[f].id)]);
const PORTAL_WRITE_FLOWS = new Set<string>([PORTAL_FLOWS.request.id, PORTAL_FLOWS.query.id]);
const CONFIG_FLOW = FLOWS.config.id;

/** Flow id → its app and kind (both apps). */
const FLOW_INFO = new Map<string, { app: string; kind: "process" | "form" }>([
  ...Object.values(FLOWS).map((f) => [f.id, { app: APP_ID, kind: f.kind }] as const),
  ...Object.values(PORTAL_FLOWS).map((f) => [f.id, { app: PORTAL_ID, kind: f.kind as "process" | "form" }] as const),
]);
export const appOfFlow = (flowId: string): string | undefined => FLOW_INFO.get(flowId)?.app;
export const kindOfFlow = (flowId: string): "process" | "form" | undefined => FLOW_INFO.get(flowId)?.kind;

// ---------------------------------------------------------------------------------- redacting request log

export interface LogEntry {
  at: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  err?: string;
}
export interface RequestLog {
  readonly file?: string;
  readonly entries: LogEntry[];
  write(e: LogEntry): void;
}

/** Kissflow REST families on the dev host that may stay in a log; every other https URL (a webhook) is replaced. */
const KF_REST = new RegExp(`^https://${DEV_HOST.replace(/\./g, "\\.")}/(process|form|flow|app_role|metadata)/2/`, "i");
/** A URL, also JSON-escaped (https:\/\/…) or percent-encoded (https%3A%2F%2F…). */
const ANY_URL = /(https?|wss?)(?::|%3A)(?:\/\/|\\\/\\\/|%2F%2F)[^\s"'<>)\]}]+/gi;
/** A webhook path without its scheme (an error naming host and path): /integration/2/<acc>/… is the secret. */
const HOOK_PATH = /([A-Za-z0-9.-]+)?\/integration\/2\/[^\s"'<>)\]}]+/g;
/** Text with every URL that is not a Kissflow REST path replaced by "<url>" (webhook URLs carry their only secret). */
export function redactUrls(text: string): string {
  return text.replace(ANY_URL, (m) => (KF_REST.test(m) ? m : "<url>")).replace(HOOK_PATH, "<url>");
}
/** The same for any value (results evidence): every string inside it redacted, object keys too; an Error as its
 *  name, message and cause (a fetch error names its URL in the cause). */
export function redactDeep<T>(v: T): T {
  if (typeof v === "string") return redactUrls(v) as T;
  if (Array.isArray(v)) return v.map(redactDeep) as T;
  if (v instanceof Error) return { name: v.name, message: redactUrls(v.message), ...(v.cause !== undefined ? { cause: redactDeep(v.cause) } : {}) } as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [redactUrls(k), redactDeep(x)])) as T;
  return v;
}

/** A hand-off URL the suite may POST to: a webhook of the dev sandbox (https, its host, /integration/2/<dev account>/),
 *  or an offline fake on a ".invalid" host (never resolves). Never the production host or another account. */
export function isDevHookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    if (u.hostname.endsWith(".invalid")) return true;
    return u.hostname === DEV_HOST && u.pathname.startsWith(`/integration/2/${DEV_ACCOUNT}/`);
  } catch {
    return false;
  }
}

/** Live: appended to tests-2026-10-21/requests.jsonl; offline (no file): kept in memory only. */
export function createRequestLog(o: { file?: string } = {}): RequestLog {
  const entries: LogEntry[] = [];
  return {
    file: o.file,
    entries,
    write(e) {
      const clean: LogEntry = { ...e, path: redactUrls(e.path), ...(e.err !== undefined ? { err: redactUrls(e.err) } : {}) };
      entries.push(clean);
      if (o.file) {
        mkdirSync(dirname(o.file), { recursive: true });
        appendFileSync(o.file, `${JSON.stringify(clean)}\n`);
      }
    },
  };
}

// ---------------------------------------------------------------------------------- the guard (run, ledger, hooks)

/** Fields that name the item a new row belongs to: each one present must be a ledger id; without any, a text must
 *  carry the run tag. */
const OWNER_FIELDS = ["Case_Item_Id", "Object_Item_Id", "Ref_Item_Id", "App_Case_Item_Id", "App_Open_Point_Id"];
/** Fields that link an item to another one, which the integrations follow (release.requested writes the request the
 *  case's Portal_Request_Item_Id names): a write may set them only to a ledger id, or clear them. */
const LINK_FIELDS = [...OWNER_FIELDS, "Portal_Request_Item_Id", "Portal_Query_Item_Id"];
/** The flow a webhook payload's id key names (an unknown "…ItemId" key may name any ledger item). */
const PAYLOAD_FLOW: Record<string, string> = { caseItemId: FLOWS.case.id, opItemId: FLOWS.op.id, portalRequestItemId: PORTAL_FLOWS.request.id, portalQueryItemId: PORTAL_FLOWS.query.id };
/** The bound on one call: kf.mjs and fetch never time out, and a hung call would hold the queue for good. */
export const CALL_TIMEOUT_MS = 60000;
/** Fields that name an item, in the order the ledger's `what` uses. */
const KEY_FIELDS = ["Case_Code", "Review_Key", "OP_Key", "RMES_Key", "Event_Key", "Action_Code", "Note_Key", "Supplier_Code", "Supplier_Legal_Name"];

export interface Guard {
  readonly ledger: Ledger;
  readonly tag: string;
  knowHook(code: HookCode, url: string): void;
  hookCode(url: string): HookCode | undefined;
  /** The data belongs to this run: every item it names is a ledger item; naming none, one of its texts carries the tag. */
  owns(data: KfData): boolean;
  /** Throws unless a new item of `flowId` with `data` may be created. */
  create(flowId: string, data: KfData): void;
  /** Throws unless item `id` of `flowId` may be written (`what`: the write, for the refusal). */
  write(flowId: string, id: string, what: string): void;
  /** Throws unless the POST may go out; its code. Every "…ItemId" of the payload must be a ledger id. */
  webhook(url: string, payload: unknown): HookCode;
  /** Appends a created or adopted item to the ledger. */
  record(flowId: string, id: string, what: string, stage: string): void;
}

export function whatOf(data: KfData): string {
  return KEY_FIELDS.filter((k) => typeof data[k] === "string" && data[k]).map((k) => `${k}=${String(data[k])}`).slice(0, 2).join(" ") || "(no key field)";
}

export function createGuard(o: { ledger: Ledger; tag: string }): Guard {
  const urls = new Map<string, HookCode>();
  const inLedger = (flowId: string, id: string) => !!id && o.ledger.byRun().some((e) => e.id === id && e.flow === flowId);
  // a form's draft id (draft_<user>) is the user's ONE draft of that form: once submitted it names whatever draft the
  // user has next (Thomas's own, in the UI), so it is written only by the submit right after its create (armed by the
  // "draft" record, used up by that submit)
  const armed = new Set<string>();
  const isFormDraft = (flowId: string, id: string) => kindOfFlow(flowId) === "form" && (/^draft_/i.test(id) || o.ledger.byRun().some((e) => e.flow === flowId && e.id === id && e.stage === "draft"));
  const g: Guard = {
    ledger: o.ledger,
    tag: o.tag,
    knowHook(code, url) {
      if (url) urls.set(url, code);
    },
    hookCode: (url) => urls.get(url),
    owns(data) {
      // a row naming someone else's item is not ours, whatever its text says (a note on Thomas's own case)
      const named = OWNER_FIELDS.map((k) => data[k]).filter((v): v is string => typeof v === "string" && v !== "");
      if (named.length) return named.every((id) => o.ledger.has(id));
      return Object.values(data).some((v) => typeof v === "string" && v.includes(o.tag));
    },
    create(flowId, data) {
      if (flowId === CONFIG_FLOW) throw new GuardError(`${flowId} is never written.`);
      if (!APP_WRITE_FLOWS.has(flowId)) throw new GuardError(`creating items of ${flowId} is not an allowed write (SPEC §1).`);
      if (!g.owns(data)) throw new GuardError(`the new ${flowId} item (${whatOf(data)}) is not this run's: it names no ${o.ledger.run} ledger item and no text carries "${o.tag}".`);
    },
    write(flowId, id, what) {
      if (flowId === CONFIG_FLOW) throw new GuardError(`${flowId} is never written.`);
      if (!APP_WRITE_FLOWS.has(flowId) && !PORTAL_WRITE_FLOWS.has(flowId)) throw new GuardError(`${what} on ${flowId} is not an allowed write (SPEC §1).`);
      // by flow too: a form's draft id (draft_<user>) is the same on every form
      if (!inLedger(flowId, id)) throw new GuardError(`${what} on ${flowId} ${id || "(no id)"}: the item is not in the ${o.ledger.run} ledger.`);
      if (isFormDraft(flowId, id) && (what !== "formSubmit" || !armed.delete(`${flowId}|${id}`)))
        throw new GuardError(`${what} on ${flowId} ${id}: a form draft is written only by the submit right after its create (after that the id names whatever draft the user has then).`);
    },
    webhook(url, payload) {
      if (!isDevHookUrl(url)) throw new GuardError("POST to a URL that is not a webhook of the dev sandbox.");
      const code = urls.get(url);
      if (!code) throw new GuardError("POST to a URL that is not one of the known hand-off webhooks.");
      const ids = Object.entries((payload ?? {}) as Record<string, unknown>).filter(([k]) => /ItemId$/.test(k));
      if (!ids.length) throw new GuardError(`webhook ${code}: the payload names no item.`);
      for (const [k, v] of ids) {
        const ok = typeof v === "string" && (PAYLOAD_FLOW[k] ? inLedger(PAYLOAD_FLOW[k]!, v) : o.ledger.has(v));
        if (!ok) throw new GuardError(`webhook ${code}: ${k} ${String(v)} is not a ${PAYLOAD_FLOW[k] ?? "ledger"} item of the ${o.ledger.run} ledger.`);
      }
      return code;
    },
    record(flowId, id, what, stage) {
      o.ledger.add({ flow: flowId, app: appOfFlow(flowId) ?? "?", id, what: redactUrls(what), stage });
      if (stage === "draft") armed.add(`${flowId}|${id}`);
    },
  };
  return g;
}

// ---------------------------------------------------------------------------------- the path guard

type Use =
  | { read: true }
  | { read: false; op: "create" | "update" | "submit" | "withdraw" | "adminPut" | "delete" | "formCreate" | "formUpdate" | "formSubmit" | "formDelete"; flowId: string; id?: string };

const SEG = /^[A-Za-z0-9_-]+$/;
const FLOW_TYPES = new Set(["process", "form", "dataform", "list", "integration", "case", "dataset"]);

/** What a REST call is, or a GuardError: an allow-list of SPEC §2's routes (and the read-only lists S-INTEGRITY and the
 *  boot need). Nothing else ever leaves the suite. */
export function classifyPath(method: string, path: string, acc: string): Use {
  const no = (why: string): never => {
    throw new GuardError(`${method} ${redactUrls(path.split("?")[0] ?? path)}: ${why}`);
  };
  if (!path.startsWith("/") || /:\/\//.test(path)) no("only relative Kissflow REST paths are allowed.");
  const [p = "", q = ""] = path.split("?");
  const segs = p.split("/").filter(Boolean);
  if (!segs.every((s) => SEG.test(s))) no("unexpected characters in the path.");
  const [family, version, account, ...rest] = segs;
  if (version !== "2" || account !== acc || acc !== DEV_ACCOUNT) no("not the dev sandbox account.");
  if (rest.some((s) => /^(publish|activate|deactivate|test|member|batch|connection|connections)$/i.test(s))) no("metadata, integration, member and connection routes are never called.");
  const appParam = new URLSearchParams(q).get("_application_id") ?? "";
  const flowApp = (flowId: string) => {
    const app = appOfFlow(flowId);
    if (appParam !== APP_ID && appParam !== PORTAL_ID) no("_application_id must be CIQ_Digital_A00 or CIQ_Supplier_Portal_A00.");
    if (app && app !== appParam) no(`${flowId} does not belong to ${appParam}.`);
  };
  const m = method.toUpperCase();
  const n = rest.length;
  // an item or activity id is never a lowercase route word (reject, sendback, skip, import, …): Kissflow ids carry capitals
  const ids = (...xs: (string | undefined)[]) => {
    for (const x of xs) if (!x || /^[a-z_]+$/.test(x)) no(`"${x ?? ""}" is not an item id: only the routes of SPEC §2 are called.`);
  };
  if (family === "process") {
    const admin = rest[0] === "admin";
    const flowId = admin ? rest[1] : rest[0];
    if (!flowId) return no("no flow.");
    flowApp(flowId);
    if (m === "GET") {
      if (admin && n === 3) return { read: true }; // admin/{flow}/{id}
      if (!admin && n === 2 && rest[1] === "myitems") return { read: true };
      if (!admin && (n === 2 || n === 3)) return { read: true }; // {flow}/{id} (viewer), {flow}/{id}/{act} (task)
      return no("not an item read.");
    }
    const writable = (APP_WRITE_FLOWS.has(flowId) || PORTAL_WRITE_FLOWS.has(flowId)) && kindOfFlow(flowId) === "process";
    if (!writable) return no(`${flowId} is not a writable process (SPEC §1).`);
    if (m === "POST" && !admin && n === 1) {
      if (!Object.values(APP_PROCESSES).includes(flowId)) return no(`${flowId} items are created only by the integrations.`);
      return { read: false, op: "create", flowId };
    }
    if (m === "POST" && !admin && n === 3 && rest[2] === "withdraw") return ids(rest[1]), { read: false, op: "withdraw", flowId, id: rest[1] };
    if (m === "POST" && !admin && n === 3) return ids(rest[1], rest[2]), { read: false, op: "update", flowId, id: rest[1] };
    if (m === "POST" && !admin && n === 4 && rest[3] === "submit") return ids(rest[1], rest[2]), { read: false, op: "submit", flowId, id: rest[1] };
    if (m === "PUT" && admin && n === 3) return ids(rest[2]), { read: false, op: "adminPut", flowId, id: rest[2] };
    if (m === "DELETE" && admin && n === 3) return ids(rest[2]), { read: false, op: "delete", flowId, id: rest[2] };
    return no("not one of the process routes of SPEC §2.");
  }
  if (family === "form") {
    const flowId = rest[0];
    if (!flowId) return no("no form.");
    flowApp(flowId);
    if (m === "GET" && n === 2) return { read: true };
    if (m === "POST" && n === 2 && rest[1] === "list") return { read: true }; // the form list is a POST
    if (flowId === CONFIG_FLOW) return no(`${flowId} is never written.`);
    if (!APP_WRITE_FLOWS.has(flowId) || kindOfFlow(flowId) !== "form") return no(`${flowId} is not a writable form (SPEC §1).`);
    if (m === "POST" && n === 1) return { read: false, op: "formCreate", flowId };
    if (m === "POST" && n === 2) return ids(rest[1]), { read: false, op: "formUpdate", flowId, id: rest[1] };
    if (m === "POST" && n === 3 && rest[2] === "submit") return ids(rest[1]), { read: false, op: "formSubmit", flowId, id: rest[1] };
    if (m === "DELETE" && n === 2) return ids(rest[1]), { read: false, op: "formDelete", flowId, id: rest[1] };
    return no("not one of the form routes of SPEC §2.");
  }
  if (m !== "GET") return no("only item writes of the app flows are allowed; this route is read-only or never called.");
  // read-only lists: the flows of an app (names; the integration status check), roles and their members (boot), a
  // flow's draft (field ids for S-INTEGRITY), a list's values
  if (family === "flow" && n === 1 && FLOW_TYPES.has(rest[0]!)) return { read: true };
  if (family === "flow" && n === 3 && rest[0] === "list" && rest[2] === "items") return { read: true };
  if (family === "app_role" && n === 1) return { read: true }; // list, or one role
  if (family === "metadata" && n === 3 && rest[2] === "draft") return { read: true };
  return no("not a route the live suite reads.");
}

// ---------------------------------------------------------------------------------- transport and the REST core

export interface Transport {
  acc: string;
  domain: string;
  /** One REST call; never retried here. */
  call(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
}

interface KfMjs {
  acc: string;
  domain: string;
  call(method: string, path: string, body?: unknown, o?: { retries?: number }): Promise<{ status: number; body: unknown }>;
}

/** kissflow-build/lib/kf.mjs (a computed specifier: it has no types). Loading it reads nothing; client() reads .env. */
export async function loadKfModule(): Promise<{ client(o: { readOnly: boolean }): KfMjs }> {
  // the decoded file path: vite-node does not load a file URL whose path has an escaped space ("Kissflow Projects")
  const file = fileURLToPath(new URL("../../../kissflow-build/lib/kf.mjs", import.meta.url));
  return (await import(file)) as { client(o: { readOnly: boolean }): KfMjs };
}

/** The key's REST client (kf.mjs reads .env itself; nothing here sees the key). Dev sandbox only. */
export async function kfTransport(): Promise<Transport> {
  const kf = (await loadKfModule()).client({ readOnly: false });
  if (kf.acc !== DEV_ACCOUNT || kf.domain !== DEV_HOST) throw new Error(`Refused: the key is not for the dev sandbox (${DEV_ACCOUNT} on ${DEV_HOST}).`);
  return { acc: kf.acc, domain: kf.domain, call: (method, path, body) => kf.call(method, path, body, { retries: 0 }) };
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; text(): Promise<string> }>;

export interface Rest {
  readonly acc: string;
  readonly guard: Guard;
  readonly queue: Queue;
  /** One guarded, paced, logged call; a Kissflow error answer throws KfError, a 429/HTML a StopError. */
  call(method: string, path: string, body?: unknown): Promise<unknown>;
  /** Every page of a list route (`path` without paging; POST for a form list). */
  pages(method: "GET" | "POST", path: string): Promise<RawItem[]>;
  /** A webhook POST (text/plain, the JSON text), paced and logged as "webhook:<code>". */
  webhook(url: string, payload: unknown, code: HookCode): Promise<void>;
  /** Shares listings and admin reads within `fn` (one load); a write ends the sharing. */
  oneRead<T>(fn: () => Promise<T>, o?: ReadScope): Promise<T>;
  /** The shared reads and their scope, while oneRead runs. */
  memo(): Memo | undefined;
}

const isErrorBody = (b: unknown): boolean => !!b && typeof b === "object" && !Array.isArray(b) && !!(b as { error_code?: unknown }).error_code;

/** `p`, or a CutOffError after `ms` (the call may still have reached Kissflow: it is never sent again, and the queue
 *  holds the next call until it settles, so the two never overlap). */
function bounded<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CutOffError(`${what} did not answer within ${Math.round(ms / 1000)} s; not retried (it may have gone through).`, p)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** What one load (oneRead) reads: "all" = SPEC §2's emulation (My items ∪ this run's ledger), "run" = this run's
 *  items and rows only. */
export interface ReadScope {
  scope?: "all" | "run";
}
interface Memo {
  scope: "all" | "run";
  lists: Map<string, Promise<RawItem[]>>;
  items: Map<string, RawItem>;
}

export function createRest(d: { transport: Transport; queue: Queue; log: RequestLog; guard: Guard; fetchImpl?: FetchLike }): Rest {
  const { transport, queue, log, guard } = d;
  // before any call, whatever transport it is given: the dev sandbox only
  if (transport.acc !== DEV_ACCOUNT || transport.domain !== DEV_HOST) throw new Error(`Refused: the transport is not the dev sandbox's (${DEV_ACCOUNT} on ${DEV_HOST}).`);
  const fetchImpl: FetchLike = d.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
  const clock = queue.clock;
  let memo: Memo | undefined;
  let depth = 0;

  /** The floor: a write reaches Kissflow only for an allowed flow, this run's data and this run's ledger ids. */
  function floor(use: Use, body: unknown): void {
    if (use.read) return;
    if (use.op === "create" || use.op === "formCreate") guard.create(use.flowId, (body ?? {}) as KfData);
    else guard.write(use.flowId, use.id ?? "", use.op);
    if (body && typeof body === "object" && !Array.isArray(body))
      for (const k of LINK_FIELDS) {
        const v = (body as Record<string, unknown>)[k];
        if (typeof v === "string" && v !== "" && !guard.ledger.has(v)) throw new GuardError(`${use.op} on ${use.flowId}: ${k} ${v} is not an item of the ${guard.ledger.run} ledger (the integrations would follow it).`);
      }
    if (memo) memo = { scope: memo.scope, lists: new Map(), items: new Map() }; // a write ends what one load shares
  }

  /** Portal items reach the ledger by adoption (the integrations create them): before the first write to one in this
   *  process, an admin GET must show it is this run's (App_Case_Item_Id / App_Open_Point_Id a ledger item). */
  const verified = new Set<string>();
  async function ownPortalItem(flowId: string, id: string, op: string): Promise<void> {
    const key = `${flowId}|${id}`;
    if (verified.has(key)) return;
    const it = itemOf(await call("GET", `/process/2/${transport.acc}/admin/${flowId}/${encodeURIComponent(id)}?_application_id=${appOfFlow(flowId) ?? PORTAL_ID}`), id);
    if (!guard.owns(it)) throw new GuardError(`${op} on ${flowId} ${id}: the item is not this run's (it names no ${guard.ledger.run} ledger item and carries no "${guard.tag}").`);
    verified.add(key);
  }

  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const use = classifyPath(method, path, transport.acc);
    floor(use, body);
    if (!use.read && use.id && PORTAL_WRITE_FLOWS.has(use.flowId)) await ownPortalItem(use.flowId, use.id, use.op);
    return queue.run(`${method} ${path.split("?")[0]}`, async () => {
      const t0 = clock.now();
      let status = 0;
      let err: string | undefined;
      try {
        const r = await bounded(transport.call(method, path, body), CALL_TIMEOUT_MS, `${method} ${path.split("?")[0]}`);
        status = r.status;
        queue.check(r.status, r.body, `${method} ${path.split("?")[0]}`);
        if (status >= 400 || isErrorBody(r.body)) throw new KfError(redactUrls(errorText(r.body)) || `HTTP ${status}`, status, path);
        return r.body;
      } catch (e) {
        err = errorText(e);
        throw e;
      } finally {
        log.write({ at: new Date(t0).toISOString(), method, path, status, ms: clock.now() - t0, ...(err !== undefined ? { err } : {}) });
      }
    });
  }

  async function pages(method: "GET" | "POST", path: string): Promise<RawItem[]> {
    const seen = new Map<string, RawItem>();
    const sep = path.includes("?") ? "&" : "?";
    for (let page = 1; page <= 200; page++) {
      const body = await call(method, `${path}${sep}page_number=${page}&page_size=${PAGE_SIZE}`, method === "POST" ? {} : undefined);
      const rows = rowsOf(body) as RawItem[];
      const total = totalOf(body);
      const fresh = rows.filter((r) => !seen.has(String(r._id)));
      for (const r of fresh) seen.set(String(r._id), r);
      if (rows.length < PAGE_SIZE || !fresh.length || (total !== undefined && seen.size >= total)) return [...seen.values()];
    }
    throw new AppError(`More than ${200 * PAGE_SIZE} rows: the list was not read completely.`);
  }

  async function webhook(url: string, payload: unknown, code: HookCode): Promise<void> {
    if (guard.webhook(url, payload) !== code) throw new GuardError(`webhook ${code}: the URL is another hand-off's.`);
    if (memo) memo = { scope: memo.scope, lists: new Map(), items: new Map() };
    const path = `webhook:${code}`;
    await queue.run(path, async () => {
      const t0 = clock.now();
      let status = 0;
      let err: string | undefined;
      try {
        const res = await bounded(fetchImpl(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) }), CALL_TIMEOUT_MS, path);
        status = res.status;
        const text = await bounded(res.text(), CALL_TIMEOUT_MS, path);
        queue.check(status, text, path);
        if (status >= 400) throw new KfError(`Webhook ${code} answered ${status}.`, status, path);
      } catch (e) {
        err = redactUrls(errorText(e));
        // a fetch error names the URL: never let it travel (toasts, results); a cut-off goes on to the queue as it is
        // (its text names the code only), which holds the next call until the late POST settles
        if (e instanceof KfError || e instanceof GuardError || e instanceof StopError || e instanceof CutOffError) throw e;
        throw new Error(err);
      } finally {
        log.write({ at: new Date(t0).toISOString(), method: "POST", path, status, ms: clock.now() - t0, ...(err !== undefined ? { err } : {}) });
      }
    });
  }

  return {
    acc: transport.acc,
    guard,
    queue,
    call,
    pages,
    webhook,
    async oneRead(fn, o = {}) {
      if (depth++ === 0) memo = { scope: o.scope ?? "all", lists: new Map(), items: new Map() };
      try {
        return await fn();
      } finally {
        if (--depth === 0) memo = undefined;
      }
    },
    memo: () => memo,
  };
}

// ---------------------------------------------------------------------------------- My tasks from _current_context

export interface Holder {
  userId: string;
  roleIds: ReadonlySet<string>;
}

/** The steps an item holds for `holder` now: each _current_context entry assigned to the user or a role they hold. The
 *  step is `_context_activity_id`, else its `_context_current_step` name among `steps` (activity id → live name). */
export function heldSteps(item: RawItem, steps: Record<string, string>, holder: Holder): { activityId: string; act: string }[] {
  const ctxs = Array.isArray(item._current_context) ? (item._current_context as Record<string, unknown>[]) : [];
  const out: { activityId: string; act: string }[] = [];
  for (const c of ctxs) {
    const name = str(c, "_context_current_step");
    const activityId = str(c, "_context_activity_id") || Object.keys(steps).find((a) => steps[a] === name) || "";
    const act = str(c, "_context_activity_instance_id");
    const to = Array.isArray(c._context_assigned_to) ? (c._context_assigned_to as Record<string, unknown>[]) : [];
    const mine = to.some((u) => str(u, "_id") === holder.userId || holder.roleIds.has(str(u, "_id")));
    if (activityId && act && mine) out.push({ activityId, act });
  }
  return out;
}

/** Activity id → live step name, per app process flow (ids.ts: "End" exists in all three, so never across flows). */
export const APP_STEPS: Record<ProcessKey, Record<string, string>> = {
  case: Object.fromEntries(Object.values(STEPS.case).map((a) => [a, STEP_NAMES[a]!])),
  review: Object.fromEntries(Object.values(STEPS.review).map((a) => [a, STEP_NAMES[a]!])),
  op: Object.fromEntries(Object.values(STEPS.op).map((a) => [a, STEP_NAMES[a]!])),
};

/** The emulated admin list of one flow: My items ∪ this run's ledger ids of the flow (scope "run": the ledger ids
 *  only), each read in full by an admin GET; a deleted item (404, 01015) is left out. Shared within oneRead. */
export function listing(rest: Rest, app: string, flowId: string): Promise<RawItem[]> {
  const m = rest.memo();
  const key = `${app}|${flowId}`;
  const hit = m?.lists.get(key);
  if (hit) return hit;
  const p = (async () => {
    const rows = m?.scope === "run" ? [] : await rest.pages("GET", `/process/2/${rest.acc}/${flowId}/myitems?_application_id=${app}`);
    // an id whose latest ledger line is "deleted" (cleanup.mjs, cleanupRun) is not read again: live, a deleted item's admin
    // GET answers 404 with 050201 ("moved out of your queue", 21 Oct R3), not only 01015
    const deleted = new Set(rest.guard.ledger.latest().filter((e) => e.flow === flowId && e.stage === "deleted").map((e) => e.id));
    const ids = [...new Set([...rows.map((r) => String(r._id)), ...rest.guard.ledger.latest().filter((e) => e.flow === flowId).map((e) => e.id)])].filter((id) => !deleted.has(id));
    const out: RawItem[] = [];
    for (const id of ids) {
      try {
        out.push(await adminRead(rest, app, flowId, id));
      } catch (e) {
        // only a deleted item is left out (01015 "could not be located"); a 404 with another code (the logs show an
        // admin GET answering 050201 for a moved portal item) is a refusal the load must report
        // live 21 Oct: a deleted process item's admin GET answers 404 with 050201 ("moved out of your queue"), a form row 404
        // with 01015; a ledger id that answers 404 at all is gone (a suite's own cleanup may not have written "deleted")
        if (e instanceof KfError && e.status === 404) continue;
        throw e;
      }
    }
    return out;
  })();
  m?.lists.set(key, p);
  return p;
}

/** GET …/admin/{flow}/{id}; within oneRead an item read once is not read again. */
export async function adminRead(rest: Rest, app: string, flowId: string, id: string): Promise<RawItem> {
  const m = rest.memo();
  const hit = m?.items.get(id);
  if (hit) return structuredClone(hit);
  const it = itemOf(await rest.call("GET", `/process/2/${rest.acc}/admin/${flowId}/${enc(id)}?_application_id=${app}`), id);
  m?.items.set(id, it);
  return structuredClone(it);
}

const enc = (s: string) => encodeURIComponent(s);

export function itemOf(body: unknown, id?: string): RawItem {
  const o = body as RawItem | null;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new AppError("Kissflow answered without the item.");
  if (!o._id || (id !== undefined && o._id !== id)) throw new AppError(`Kissflow answered with a different item (${String(o._id || "no id")}).`);
  return o;
}

// ---------------------------------------------------------------------------------- the AppClient

/** The AppClient plus what the suites need beyond the screens: admin writes, withdraw, delete, raw reads. */
export interface LiveAppClient extends AppClient {
  /** create's `onId` is told the new id the moment Kissflow answers (the ledger records it before the next call). */
  create(flow: ProcessKey, data: KfData, onId?: (id: string) => void): Promise<{ id: string; act: string }>;
  /** formCreate's `onDraft` is told the draft id before its submit. */
  formCreate(flow: FormKey, data: KfData, onDraft?: (draftId: string) => void): Promise<string>;
  postWebhook(url: string, payload: unknown, code?: HookCode): Promise<"sdk" | "fetch">;
  /** PUT …/admin/{proc}/{id}: writes ReadOnly fields too (P-RO). Ledger items only. */
  adminPut(flow: ProcessKey, id: string, data: KfData): Promise<void>;
  /** POST …/{proc}/{id}/withdraw {Comment}. Ledger items only. */
  withdraw(flow: ProcessKey, id: string, comment: string): Promise<void>;
  /** Deletes a process item (admin route, any step) or a form row. Ledger items only. */
  remove(flow: FlowKey, id: string): Promise<void>;
  /** One load's reads: listings and admin reads shared inside `fn` (live), in `scope` (see ReadScope). */
  oneRead<T>(fn: () => Promise<T>, o?: ReadScope): Promise<T>;
  /** A read-only GET of an allowed list route (flow lists, the integration status, roles, drafts). */
  getRaw(path: string): Promise<unknown>;
  /** GET …/admin/{proc}/item?q=<text>: the process items any of whose values match (Kissflow's search, as the
   *  integrations' "Search an item"); how the suite finds what an integration created (22 Oct: E-A's reviews). */
  adminSearch(flow: ProcessKey, q: string): Promise<RawItem[]>;
}

/** The AppClient over REST (no flow-level guards: wrap it in guardApp). */
export function restApp(rest: Rest, holder: Holder): LiveAppClient {
  const acc = rest.acc;
  const q = `_application_id=${APP_ID}`;
  const procOf = (f: ProcessKey) => APP_PROCESSES[f];
  const formOf = (f: FormKey) => FLOWS[f].id;
  const actOf = (it: RawItem): string => {
    const a = str(it, "_activity_instance_id");
    if (a) return a;
    const ctx = Array.isArray(it._current_context) ? (it._current_context[0] as Record<string, unknown> | undefined) : undefined;
    return str(ctx, "_context_activity_instance_id");
  };
  const notDraft = (it: RawItem) => str(it, "_status") !== "Draft";

  return {
    accountId: acc,
    appId: APP_ID,
    // approximated (SPEC §2): there is no REST admin list
    adminList: async (f) => (await listing(rest, APP_ID, procOf(f))).filter(notDraft),
    adminGet: (f, id) => adminRead(rest, APP_ID, procOf(f), id),
    // emulated (SPEC §2): the listed items whose context holds `activityId` for Thomas or one of his roles
    async myTasks(f, activityId) {
      const out: RawItem[] = [];
      for (const it of await listing(rest, APP_ID, procOf(f)))
        for (const h of heldSteps(it, APP_STEPS[f], holder)) if (!activityId || h.activityId === activityId) out.push({ ...it, _activity_instance_id: h.act });
      return out;
    },
    myItems: (f) => rest.pages("GET", `/process/2/${acc}/${procOf(f)}/myitems?${q}`),
    async getTask(f, id, act) {
      const it = itemOf(await rest.call("GET", `/process/2/${acc}/${procOf(f)}/${enc(id)}/${enc(act)}?${q}`), id);
      return str(it, "_activity_instance_id") ? it : { ...it, _activity_instance_id: act };
    },
    getById: async (f, id) => itemOf(await rest.call("GET", `/process/2/${acc}/${procOf(f)}/${enc(id)}?${q}`), id),
    async create(f, data, onId) {
      const body = (await rest.call("POST", `/process/2/${acc}/${procOf(f)}?${q}`, data)) as { _id?: unknown; _activity_instance_id?: unknown } | null;
      const id = typeof body?._id === "string" ? body._id : "";
      if (!id) throw new AppError(`Kissflow created a ${procOf(f)} item without naming it.`);
      onId?.(id);
      const act = typeof body?._activity_instance_id === "string" && body._activity_instance_id ? body._activity_instance_id : actOf(await adminRead(rest, APP_ID, procOf(f), id));
      if (!act) throw new AppError(`Kissflow created ${procOf(f)} item ${id} without naming its step.`);
      return { id, act };
    },
    update: async (f, id, act, data) => void (await rest.call("POST", `/process/2/${acc}/${procOf(f)}/${enc(id)}/${enc(act)}?${q}`, data)),
    submit: async (f, id, act) => void (await rest.call("POST", `/process/2/${acc}/${procOf(f)}/${enc(id)}/${enc(act)}/submit?${q}`, {})),
    // approximated: no REST route for the SDK's discardItem; the admin delete removes an item at any step (SPEC §2)
    discard: async (f, id) => void (await rest.call("DELETE", `/process/2/${acc}/admin/${procOf(f)}/${enc(id)}?${q}`)),
    formList: (f) => rest.pages("POST", `/form/2/${acc}/${formOf(f)}/list?${q}`),
    formGet: async (f, id) => itemOf(await rest.call("GET", `/form/2/${acc}/${formOf(f)}/${enc(id)}?${q}`), id),
    async formCreate(f, data, onDraft) {
      const draft = (await rest.call("POST", `/form/2/${acc}/${formOf(f)}?${q}`, data)) as { _id?: unknown } | null;
      const draftId = typeof draft?._id === "string" ? draft._id : "";
      if (!draftId) throw new AppError(`Kissflow answered the ${formOf(f)} create without a draft id.`);
      onDraft?.(draftId);
      const done = (await rest.call("POST", `/form/2/${acc}/${formOf(f)}/${enc(draftId)}/submit?${q}`, {})) as { _id?: unknown } | string | null;
      if (typeof done === "string" && done.trim()) return done.trim();
      const id = (done as { _id?: unknown } | null)?._id;
      return typeof id === "string" && id ? id : draftId;
    },
    formUpdate: async (f, id, data) => void (await rest.call("POST", `/form/2/${acc}/${formOf(f)}/${enc(id)}?${q}`, data)),
    async postWebhook(url, payload, code) {
      const c = code ?? rest.guard.hookCode(url);
      if (!c) throw new GuardError("POST to a URL that is not one of the known hand-off webhooks.");
      await rest.webhook(url, payload, c);
      return "fetch";
    },
    adminPut: async (f, id, data) => void (await rest.call("PUT", `/process/2/${acc}/admin/${procOf(f)}/${enc(id)}?${q}`, data)),
    withdraw: async (f, id, comment) => void (await rest.call("POST", `/process/2/${acc}/${procOf(f)}/${enc(id)}/withdraw?${q}`, { Comment: comment })),
    async remove(f, id) {
      if (f === "case" || f === "review" || f === "op") await rest.call("DELETE", `/process/2/${acc}/admin/${procOf(f)}/${enc(id)}?${q}`);
      else await rest.call("DELETE", `/form/2/${acc}/${formOf(f)}/${enc(id)}?${q}`);
    },
    oneRead: (fn, o) => rest.oneRead(fn, o),
    getRaw: (path) => rest.call("GET", path),
    adminSearch: async (f, text) => rowsOf(await rest.call("GET", `/process/2/${acc}/admin/${procOf(f)}/item?q=${enc(text)}&page_number=1&page_size=${PAGE_SIZE}&${q}`)) as RawItem[],
  };
}

const flowIdOf = (f: FlowKey) => FLOWS[f].id;

/**
 * The flow-level guards in front of an inner client (restApp live, the offline fake adapter): what may be created,
 * written and posted, and the ledger. Reads pass through. A created id is recorded the moment the inner client knows
 * it (onId / onDraft), so it is in the ledger before any further call; the final id of a form row on its answer.
 */
export function guardApp(inner: LiveAppClient, g: Guard): LiveAppClient {
  const writeOk = (f: FlowKey, id: string, what: string) => g.write(flowIdOf(f), id, what);
  // scope "run" (oneRead): lists keep this run's items and rows only (and every configuration row)
  let scope: "all" | "run" = "all";
  const onlyRun = (rows: RawItem[]) => (scope === "run" ? rows.filter((r) => g.ledger.has(r._id)) : rows);
  const onlyRunRows = (f: FormKey, rows: RawItem[]) => (scope === "run" && f !== "config" ? rows.filter((r) => g.ledger.has(r._id) || g.owns(r)) : rows);
  return {
    ...inner,
    adminList: async (f) => onlyRun(await inner.adminList(f)),
    myTasks: async (f, activityId) => onlyRun(await inner.myTasks(f, activityId)),
    myItems: async (f) => onlyRun(await inner.myItems(f)),
    formList: async (f) => onlyRunRows(f, await inner.formList(f)),
    async oneRead(fn, o = {}) {
      const outer = scope;
      if (o.scope) scope = o.scope;
      try {
        return await inner.oneRead(fn, o);
      } finally {
        scope = outer;
      }
    },
    async create(f, data, onId) {
      g.create(flowIdOf(f), data);
      let told = "";
      const tell = (id: string) => {
        if (told === id) return;
        told = id;
        g.record(flowIdOf(f), id, whatOf(data), "Start");
        onId?.(id);
      };
      const r = await inner.create(f, data, tell);
      tell(r.id);
      return r;
    },
    async update(f, id, act, data) {
      writeOk(f, id, "update");
      return inner.update(f, id, act, data);
    },
    async submit(f, id, act) {
      writeOk(f, id, "submit");
      return inner.submit(f, id, act);
    },
    async discard(f, id) {
      writeOk(f, id, "discard");
      return inner.discard(f, id);
    },
    async formCreate(f, data, onDraft) {
      if (!WRITABLE_FORMS.includes(f)) throw new GuardError(`${flowIdOf(f)} is not an allowed write (SPEC §1).`);
      g.create(flowIdOf(f), data);
      let draft = "";
      const id = await inner.formCreate(f, data, (draftId) => {
        draft = draftId;
        g.record(flowIdOf(f), draftId, `${whatOf(data)} (draft)`, "draft");
        onDraft?.(draftId);
      });
      // the submit's answer must name the NEW row: its draft id would name the user's next draft, not this row
      if (!id || id === draft || /^draft_/i.test(id)) throw new AppError(`Kissflow answered the ${flowIdOf(f)} submit without the new row's id: the row (${whatOf(data)}) may exist, but it is NOT in the ledger; find it by that key.`);
      g.record(flowIdOf(f), id, whatOf(data), "saved");
      return id;
    },
    async formUpdate(f, id, data) {
      writeOk(f, id, "formUpdate");
      return inner.formUpdate(f, id, data);
    },
    async postWebhook(url, payload) {
      return inner.postWebhook(url, payload, g.webhook(url, payload));
    },
    async adminPut(f, id, data) {
      writeOk(f, id, "adminPut");
      return inner.adminPut(f, id, data);
    },
    async withdraw(f, id, comment) {
      writeOk(f, id, "withdraw");
      return inner.withdraw(f, id, comment);
    },
    async remove(f, id) {
      writeOk(f, id, "remove");
      return inner.remove(f, id);
    },
  };
}

/** The live AppClient: REST, the floor guards, the flow guards, the ledger. */
export function createLiveClient(rest: Rest, holder: Holder): LiveAppClient {
  return guardApp(restApp(rest, holder), rest.guard);
}

// ---------------------------------------------------------------------------------- boot: the roles Thomas holds

/** The roles of an app the user is a member of (read-only: the role list, then each role with members), and the
 *  user's name and e-mail as the member list carries them. */
export async function readHeldRoles(rest: Rest, app: string, userId: string): Promise<{ roles: LiveRoleRef[]; name?: string; email?: string }> {
  const list = rowsOf(await rest.call("GET", `/app_role/2/${rest.acc}/list?_application_id=${app}&page_number=1&page_size=100`)) as Record<string, unknown>[];
  const roles: LiveRoleRef[] = [];
  let name: string | undefined;
  let email: string | undefined;
  for (const r of list) {
    if (r.UserCount === 0) continue; // nobody in it: no call needed
    const role = (await rest.call("GET", `/app_role/2/${rest.acc}/${String(r._id)}?_application_id=${app}`)) as { Members?: Record<string, unknown>[] } | null;
    const me = (role?.Members ?? []).find((m) => str(m, "_id") === userId);
    if (!me) continue;
    roles.push({ id: String(r._id), name: String(r.Name ?? "") });
    name ??= str(me, "Name") || undefined;
    email ??= str(me, "Email") || undefined;
  }
  return { roles, ...(name ? { name } : {}), ...(email ? { email } : {}) };
}
