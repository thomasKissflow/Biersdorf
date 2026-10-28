// The narrow Kissflow port of the CIQ Sync Service (plan v5 §8.1). Every call goes through a kf.mjs-shaped client
// (`{ call(method, path, body), get(path), acc }`): the real one (kissflow-build/lib/kf.mjs) or the in-memory fake.
//
// Write rules (P3, P9, D-4, D-7):
// - one write in flight per item (per-item lock);
// - write, then read back; fields that did not stick are re-applied, up to 3 attempts in all; then it fails loudly;
// - an item whose holder wrote in the last ~2 s is deferred to the next run (DeferredError), not overwritten;
// - Form creates are strictly serial (one draft per user per Form);
// - child rows are matched by their own key column; server row ids are re-read before every modify.
//
// Dry-run: no write leaves the process. Intended writes are recorded in `port.intended`; created items get local ids
// ("dry-…") and later reads see the recorded values (an overlay), so a handler can run to its end. In dry-run the
// caller passes a read-only kf.mjs client, so even a bug here cannot write.
//
// Credentials never pass through this module: kf.mjs holds them. Errors carry status, Kissflow code and message only.
//
// Identity guard (identity.mjs): minted supplier ids live in memory only. `setLeakGuard(ids)` makes every write body
// (live and dry-run) that still carries one fail with IdentityLeakError before any call. `setServiceUserTrusted(false)`
// (the key's user is a real person, as in dev) stops trusting `_modified_by === serviceUserId` as "the service wrote
// it": then an item counts as the service's own only while it is exactly as this port read it back right after its own
// last write (same `_modified_at`, `_modified_by`, status, step and field values: `stampOf`). Live `_modified_at` has
// whole seconds only, so a time comparison cannot tell a holder's write in the same second from the service's own.

import { randomBytes, createHash } from "node:crypto";
import { containerOf, ATTACHMENT_FIELDS } from "./ids.mjs";
import { findMinted, uidOfMinted } from "./identity.mjs";

export class KfError extends Error {
  constructor(what, status, body) {
    const msg = typeof body === "string" ? body.slice(0, 300) : (body?.en_message ?? body?.message ?? JSON.stringify(body ?? {}).slice(0, 300));
    super(`${what}: HTTP ${status}${body?.error_code ? ` ${body.error_code}` : ""} ${msg}`);
    this.status = status;
    this.code = body?.error_code;
  }
}

/** The item's holder wrote it moments ago: try again on the next run (P3). */
export class DeferredError extends Error {
  constructor(what) {
    super(`deferred: ${what}`);
    this.deferred = true;
  }
}

/**
 * Kissflow answered something that is not data: a 429 (rate limit, or the Cloudflare "Just a moment…" HTML challenge)
 * or any non-JSON body. Never merged, written or treated as data: the item is aborted and retried on a later run.
 */
export class UnreadableError extends Error {
  constructor(what, status, challenge) {
    super(`not readable: ${what}: HTTP ${status}${challenge ? " (HTML challenge page)" : ""}`);
    this.unreadable = true;
    this.deferred = true;
    this.status = status;
    this.challenge = challenge;
  }
}

/** The port is in a global back-off after a 429: no call is made until it ends. */
export class BackoffError extends Error {
  constructor(until) {
    super(`backing off until ${new Date(until).toISOString()} after a 429`);
    this.backoff = true;
    this.deferred = true;
    this.until = until;
  }
}

/**
 * A write would carry an in-memory (minted) supplier id instead of the Kissflow user id. A bug, never a deferral: the
 * item fails and nothing is sent. The message names the Kissflow user only (it is written into Result_Note), never the
 * in-memory id itself.
 */
export class IdentityLeakError extends Error {
  constructor(what, id) {
    super(`identity leak refused: ${what} would write the in-memory supplier id of Kissflow user ${uidOfMinted(id) ?? "(unknown)"}; nothing was sent`);
    this.identityLeak = true;
  }
}

/** True for a deferral of any kind (holder wrote recently, unreadable answer, back-off): retry later, write nothing. */
export const isDeferral = (e) => !!e?.deferred;

/** The tail of each pacing state's gate queue (createPort `gate`). */
const gateQueues = new WeakMap();

const rand10 = () => randomBytes(8).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 10).padEnd(10, "x");

// ---------------------------------------------------------------------------------------------- dates on write

const ISO_MS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+Z$/;
/** Deep copy with every ISO DateTime string carrying milliseconds cut to seconds ("…:ssZ"). JSON blobs (long strings) are untouched. */
export function noMillis(v) {
  if (typeof v === "string") { const m = ISO_MS.exec(v); return m ? `${m[1]}Z` : v; }
  if (Array.isArray(v)) return v.map(noMillis);
  if (v && typeof v === "object" && !(v instanceof Uint8Array) && !(typeof Blob !== "undefined" && v instanceof Blob) && !(typeof FormData !== "undefined" && v instanceof FormData)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, noMillis(x)]));
  return v;
}

// ---------------------------------------------------------------------------------------------- value comparison

const isBlank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const idOf = (v) => (v && typeof v === "object" ? (v._id ?? v.id) : v);

/**
 * What an item looked like, for "is it still exactly as the service left it?": its platform stamp (`_modified_at`,
 * `_modified_by`) plus a hash of its status, current step instance and every business field (attachment fields by
 * their file ids only). Holds no field value (only a hash), so it may be kept in the host's state. [Unverified live:
 * that two admin GETs of an unchanged item give the same fields. A mismatch only defers a write to the next run.]
 */
export function stampOf(item) {
  if (!item?._id) return null;
  const keys = Object.keys(item).filter((k) => !k.startsWith("_") || k === "_status").sort();
  const val = (k) => (ATTACHMENT_FIELDS.has(k) && Array.isArray(item[k]) ? item[k].map((a) => a?.id ?? a?.key ?? null) : item[k]);
  const step = item._current_context?.[0];
  const h = createHash("sha256").update(JSON.stringify([keys.map((k) => [k, val(k)]), step?._context_activity_instance_id ?? step?._activity_instance_id ?? null])).digest("hex").slice(0, 24);
  return { at: item._modified_at ?? null, by: idOf(item._modified_by) ?? null, h };
}

/** Is the item exactly as `stamp` recorded it? */
export const sameStamp = (stamp, item) => {
  if (!stamp || !item) return false;
  const now = stampOf(item);
  return !!now && now.at === stamp.at && now.by === stamp.by && now.h === stamp.h;
};
const ISO_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_D = /^\d{4}-\d{2}-\d{2}$/;

/** True when the value Kissflow returns matches what was written (types normalised: users, dates, numbers, text). */
export function sameValue(want, got) {
  if (isBlank(want)) return isBlank(got);
  if (isBlank(got)) return false;
  if (Array.isArray(want)) {
    if (!Array.isArray(got)) return false;
    if (want.some((x) => x && typeof x === "object" && "_id" in x)) {
      const a = want.map(idOf).sort();
      const b = got.map(idOf).sort();
      return a.length === b.length && a.every((x, i) => x === b[i]);
    }
    return JSON.stringify(want) === JSON.stringify(got);
  }
  if (typeof want === "object") {
    if ("_id" in want) return idOf(got) === want._id;
    return JSON.stringify(want) === JSON.stringify(got);
  }
  if (typeof want === "number") return Number(got) === want;
  if (typeof want === "boolean") return got === want || String(got) === String(want);
  if (typeof want === "string") {
    if (typeof got === "object") return idOf(got) === want;
    if (ISO_D.test(want)) return String(got).slice(0, 10) === want;
    if (ISO_DT.test(want) && ISO_DT.test(String(got))) return Math.floor(Date.parse(want) / 1000) === Math.floor(Date.parse(String(got)) / 1000);
    return want.replace(/\r\n/g, "\n").trim() === String(got).replace(/\r\n/g, "\n").trim();
  }
  return want === got;
}

export function differingFields(fields, item) {
  return Object.keys(fields).filter((k) => !sameValue(fields[k], item?.[k]));
}

// ---------------------------------------------------------------------------------------------- the port

/**
 * @param {object} o
 * @param {object} o.kf              kf.mjs-shaped client
 * @param {boolean} [o.dryRun]       record writes instead of sending them
 * @param {() => Date} [o.now]
 * @param {string} [o.serviceUserId] the key's own user id (for the "holder wrote in the last 2 s" rule)
 * @param {(e: object) => void} [o.log]  structured log sink (no secrets are ever passed)
 */
export function createPort({
  kf,
  dryRun = false,
  now = () => new Date(),
  serviceUserId = null,
  log = () => {},
  holderQuietMs = 2000,
  maxAttempts = 3,
  // Pacing (Cloudflare challenge on the dev account, 14 Oct night): ≥ 1 s between calls, and a global back-off after
  // any 429. A JSON 429 from Kissflow is a normal rate limit; the HTML challenge page needs minutes.
  minIntervalMs = 1000,
  rateLimitBackoffMs = 60_000,
  challengeBackoffMs = 10 * 60_000,
  wallClock = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  listInDryRun = false,
  // S-2 (proven live 14 Oct): multipart attach and signed-URL download, outside kf.mjs's JSON client.
  files = null,
  // Optional shared pacing/back-off state ({ last, backoffUntil, lastReason }): two ports of one process that pass the
  // same object (the live-e2e driver's own port and the service's port) keep ≥ minIntervalMs between ALL their calls
  // and share one global back-off after a 429. Default: a private one (unchanged behaviour).
  pace: sharedPace = null,
  // Optional tooling hook, called right after Kissflow gave a new object its id and before any further call:
  //   { kind: "process", flow, id, instance }   the process create's answer (instance = the Start activity instance)
  //   { kind: "form-draft", flow, id }          the Form draft POST's answer (one draft per user per Form, D-7)
  //   { kind: "form", flow, id, draft }         the Form submit's answer (the draft is consumed)
  //   { kind: "attachment", flow, parent, field, id }  the attachment upload's answer (before its read-back)
  // The live-e2e driver records every object its own port and the service's port create, so its cleanup also finds one
  // whose create was cut off by a 429 before the next checkpoint. Default: none (the service itself never uses it).
  onCreated = null,
} = {}) {
  if (!kf?.call) throw new Error("createPort needs a kf.mjs-shaped client");
  const acc = kf.acc;
  const q = (flow) => `_application_id=${containerOf(flow)}`;
  const stats = { reads: 0, writes: 0, reapplied: 0, deferred: 0, unreadable: 0, challenges: 0 };
  const pace = sharedPace ?? { last: 0, backoffUntil: 0, lastReason: null };
  const notes = new Set();
  let leakIds = new Set(); // minted ids of the current directory (setLeakGuard)
  let serviceTrusted = true; // setServiceUserTrusted
  /** Refuses a write body that carries a minted id (identity.mjs), before anything is sent or recorded. */
  const guardBody = (body, what) => {
    const hit = leakIds.size ? findMinted(body, leakIds) : null;
    if (hit) throw new IdentityLeakError(what, hit);
  };

  /**
   * Back-off check and pacing: every Kissflow call (JSON, upload, download, signed URL) passes here first. Callers queue
   * (per pace object, so ports sharing one also queue together): two calls issued at once still go out ≥ minIntervalMs
   * apart, and a back-off set by the first refuses the second.
   */
  function gate() {
    const turn = (gateQueues.get(pace) ?? Promise.resolve()).then(async () => {
      if (pace.backoffUntil > wallClock()) throw new BackoffError(pace.backoffUntil);
      const wait = pace.last + minIntervalMs - wallClock();
      if (wait > 0) await sleep(wait);
      pace.last = wallClock();
    });
    gateQueues.set(pace, turn.catch(() => {}));
    return turn;
  }

  /** A 429 (JSON or the HTML challenge) sets the global back-off; any 429 or non-JSON answer is not data. */
  function screen(r, what, { binaryOk = false } = {}) {
    const challenge = typeof r.body === "string" && /<html|just a moment|cf-chl|challenge/i.test(r.body);
    if (r.status === 429 || challenge) {
      pace.backoffUntil = wallClock() + (challenge ? challengeBackoffMs : rateLimitBackoffMs);
      pace.lastReason = challenge ? "challenge" : "rate-limit";
      stats.unreadable++;
      if (challenge) stats.challenges++;
      log({ ev: "backoff", status: r.status, challenge, until: new Date(pace.backoffUntil).toISOString() });
      throw new UnreadableError(what, r.status, challenge);
    }
    if (!binaryOk && typeof r.body === "string" && r.body.trim() !== "") {
      stats.unreadable++;
      throw new UnreadableError(what, r.status, false);
    }
    return r;
  }

  /** The single path of every JSON call: gate, no kf.mjs-level retries (the port decides), screen. */
  async function guardedCall(method, path, body, what) {
    await gate();
    const r = await kf.call(method, path, body, { retries: 0 });
    return screen(r, what ?? `${method} ${path.replace(/\?.*$/, "")}`);
  }
  const intended = []; // dry-run record
  const overlay = new Map(); // dry-run: itemId → { flow, kind, fields, tables, created }
  const ourStamps = new Map(); // itemId → stampOf(item) as read back right after this port's own last write
  const noteOwn = (item) => {
    const st = stampOf(item);
    if (st) ourStamps.set(item._id, st);
    return item;
  };
  const locks = new Map();
  let formQueue = Promise.resolve();
  let dryN = 0;

  async function withLock(key, fn) {
    const prev = locks.get(key) ?? Promise.resolve();
    let release;
    const mine = new Promise((r) => (release = r));
    locks.set(key, prev.then(() => mine));
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (locks.get(key) === mine) locks.delete(key);
    }
  }

  async function call(method, path, body, what) {
    if (dryRun && method !== "GET") throw new Error(`dry-run port refused ${method} ${path.replace(/\?.*$/, "")}`);
    // Kissflow rejects DateTimes with milliseconds (live, 15 Oct: 400 KISSFLOW_ERROR_01020 "The date/time … is invalid"),
    // so every value written goes out at second precision.
    if (method !== "GET" && body !== undefined) body = noMillis(body);
    if (method !== "GET") guardBody(body, what ?? `${method} ${path.replace(/\?.*$/, "")}`);
    const r = await guardedCall(method, path, body, what);
    if (method === "GET") stats.reads++;
    else stats.writes++;
    if (r.status >= 300) throw new KfError(what ?? `${method} ${path.replace(/\?.*$/, "")}`, r.status, r.body);
    return r.body;
  }

  async function read(method, path, body, what) {
    const r = await guardedCall(method, path, body, what);
    stats.reads++;
    if (r.status === 404) return null;
    if (r.status >= 300) throw new KfError(what ?? `${method} ${path.replace(/\?.*$/, "")}`, r.status, r.body);
    return r.body;
  }

  function record(op, detail) {
    intended.push({ n: intended.length + 1, op, ...detail });
    log({ ev: "dry-write", op, ...detail.summary });
  }

  const applyOverlay = (itemId, item) => {
    const o = overlay.get(itemId);
    if (!o) return item;
    const base = item ?? { _id: itemId, _status: o.status ?? "InProgress", _created_by: { _id: serviceUserId ?? "dry-service" } };
    const out = { ...base, ...o.fields };
    if (o.status) out._status = o.status;
    for (const [t, rows] of Object.entries(o.tables ?? {})) out[`Table::${t}`] = rows;
    return out;
  };

  // ------------------------------------------------------------------------------ processes

  async function getProcessItemAdmin(flow, itemId) {
    if (!itemId) return null;
    if (dryRun && String(itemId).startsWith("dry-")) return applyOverlay(itemId, null);
    const item = await read("GET", `/process/2/${acc}/admin/${flow}/${itemId}?${q(flow)}`, undefined, `admin GET ${flow}`);
    return dryRun ? applyOverlay(itemId, item) : item;
  }

  /** The current step of an in-progress item: name, activity id and the instance id needed to submit (S-5). */
  function currentStep(item) {
    const c = item?._current_context?.[0];
    if (!c) return null;
    return { name: c._context_current_step, activityId: c._context_activity_id, instanceId: c._context_activity_instance_id ?? c._activity_instance_id, assignedTo: c._context_assigned_to };
  }

  /**
   * Was the item's last write this service's own? By the service user id when trusted, else only while the item is
   * exactly as this port read it back after its own last write (any later write, even in the same second, differs).
   */
  function mine(item) {
    const by = idOf(item?._modified_by);
    const at = Date.parse(item?._modified_at ?? "");
    if (!by || Number.isNaN(at)) return false;
    if (serviceUserId && serviceTrusted) return by === serviceUserId;
    return sameStamp(ourStamps.get(item._id), item);
  }

  function holderWroteRecently(item) {
    const by = idOf(item?._modified_by);
    const at = Date.parse(item?._modified_at ?? "");
    if (!by || Number.isNaN(at)) return false;
    // live stamps have whole seconds: the write may have happened up to 999 ms after the stamp, so the quiet window
    // runs from the end of that second
    const last = /\.\d+/.test(String(item._modified_at)) ? at : at + 999;
    return !mine(item) && now().getTime() - last < holderQuietMs;
  }

  /** Admin-route write (P1) of any field of an in-progress item, then read back and re-apply (P3). */
  async function adminUpdate(flow, itemId, fields, { skipHolderCheck = false } = {}) {
    const keys = Object.keys(fields);
    if (!keys.length) return { ok: true, attempts: 0 };
    return withLock(itemId, async () => {
      if (dryRun) {
        guardBody(fields, `admin PUT ${flow}`);
        const o = overlay.get(itemId) ?? { flow, fields: {}, tables: {} };
        Object.assign(o.fields, fields);
        overlay.set(itemId, o);
        record("adminUpdate", { flow, itemId, fields: keys, summary: { flow, itemId, fields: keys.join(",") } });
        return { ok: true, attempts: 1, dry: true };
      }
      let item = await getProcessItemAdmin(flow, itemId);
      if (!item) throw new KfError(`admin update ${flow}/${itemId}`, 404, "item not found");
      if (!skipHolderCheck && holderWroteRecently(item)) {
        stats.deferred++;
        throw new DeferredError(`${flow}/${itemId} was written by its holder moments ago`);
      }
      let todo = differingFields(fields, item);
      if (!todo.length) return { ok: true, attempts: 0 };
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const body = Object.fromEntries(todo.map((k) => [k, fields[k]]));
        await call("PUT", `/process/2/${acc}/admin/${flow}/${itemId}?${q(flow)}`, body, `admin PUT ${flow}`);
        item = noteOwn(await getProcessItemAdmin(flow, itemId));
        todo = differingFields(fields, item);
        if (!todo.length) return { ok: true, attempts: attempt };
        stats.reapplied++;
        log({ ev: "reapply", flow, itemId, fields: todo.join(","), attempt });
      }
      throw new Error(`write not verified after ${maxAttempts} attempts: ${flow}/${itemId} fields ${todo.join(", ")}`);
    });
  }

  /** Create a process item at Start with its fields (no submit). */
  async function createProcessAtStart(flow, fields) {
    if (dryRun) {
      guardBody(fields, `create ${flow}`);
      const id = `dry-${flow}-${++dryN}`;
      overlay.set(id, { flow, fields: { ...fields }, tables: {}, status: "Draft", created: true });
      record("createProcess", { flow, itemId: id, fields: Object.keys(fields), summary: { flow, itemId: id } });
      return { _id: id, _activity_instance_id: `${id}-start` };
    }
    const body = await call("POST", `/process/2/${acc}/${flow}?${q(flow)}`, fields, `create ${flow}`);
    ourStamps.delete(body._id);
    if (onCreated && body?._id) await onCreated({ kind: "process", flow, id: body._id, instance: body._activity_instance_id ?? null });
    return body;
  }

  async function submitStart(flow, itemId, instanceId) {
    if (dryRun) {
      const o = overlay.get(itemId);
      if (o) o.status = "InProgress";
      record("submitStart", { flow, itemId, summary: { flow, itemId } });
      return { dry: true };
    }
    const r = await call("POST", `/process/2/${acc}/${flow}/${itemId}/${instanceId}/submit?${q(flow)}`, {}, `submit Start ${flow}`);
    ourStamps.delete(itemId);
    return r;
  }

  /** Create at Start, submit, and read the item back (verifies it left Start). */
  async function createAndSubmit(flow, fields) {
    const c = await createProcessAtStart(flow, fields);
    await submitStart(flow, c._id, c._activity_instance_id);
    const item = await getProcessItemAdmin(flow, c._id);
    if (!dryRun) noteOwn(item);
    if (!dryRun && (!item || item._status === "Draft")) throw new Error(`${flow}/${c._id} did not leave Start`);
    return { id: c._id, item };
  }

  /** Submit the item's current step (only the service-held CIQ Case steps; the service never submits a human step). */
  async function submitStep(flow, itemOrId, { expectStep } = {}) {
    const item = typeof itemOrId === "string" ? await getProcessItemAdmin(flow, itemOrId) : itemOrId;
    const step = currentStep(item);
    if (!step) throw new Error(`${flow}/${item?._id}: no current step to submit`);
    if (expectStep && step.name !== expectStep) throw new Error(`${flow}/${item._id}: at "${step.name}", not "${expectStep}"`);
    if (dryRun) {
      record("submitStep", { flow, itemId: item._id, step: step.name, summary: { flow, itemId: item._id, step: step.name } });
      return { dry: true };
    }
    return withLock(item._id, async () => {
      const r = await call("POST", `/process/2/${acc}/${flow}/${item._id}/${step.instanceId}/submit?${q(flow)}`, {}, `submit ${flow} "${step.name}"`);
      // read back, so a later write of the service in the same second is still recognised as following its own
      ourStamps.delete(item._id);
      noteOwn(await getProcessItemAdmin(flow, item._id));
      return r;
    });
  }

  /** Withdraw an item the service started (P2: initiator only; terminal). Already-ended items are left alone. */
  async function withdraw(flow, itemId, comment) {
    return withLock(itemId, async () => {
      if (dryRun) {
        const o = overlay.get(itemId) ?? { flow, fields: {}, tables: {} };
        o.status = "Withdrawn";
        overlay.set(itemId, o);
        record("withdraw", { flow, itemId, summary: { flow, itemId } });
        return { dry: true };
      }
      const item = await getProcessItemAdmin(flow, itemId);
      if (!item || item._status !== "InProgress") return { skipped: item?._status ?? "missing" };
      await call("POST", `/process/2/${acc}/${flow}/${itemId}/withdraw?${q(flow)}`, { Comment: comment }, `withdraw ${flow}`);
      const back = noteOwn(await getProcessItemAdmin(flow, itemId));
      if (back?._status !== "Withdrawn") throw new Error(`withdraw not verified: ${flow}/${itemId} is ${back?._status}`);
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------------------ forms

  async function listForm(form, { pageSize = 500, maxPages = 50 } = {}) {
    const out = [];
    // The Form list route is a POST (master §3.5). A read-only client (dry-run) may only GET, so in dry-run the live
    // lists are not read at all: only rows this run would have created are listed.
    if (dryRun && !listInDryRun) {
      notes.add(`Form lists not read in dry-run (POST …/list needs a write-capable client): ${form}`);
      for (const [id, o] of overlay) if (o.flow === form && o.created) out.push(applyOverlay(id, null));
      return out;
    }
    for (let page = 1; page <= maxPages; page++) {
      const body = await read("POST", `/form/2/${acc}/${form}/list?page_number=${page}&page_size=${pageSize}&${q(form)}`, {}, `list ${form}`);
      const rows = body?.Data ?? body?.data ?? (Array.isArray(body) ? body : []);
      out.push(...rows);
      if (rows.length < pageSize) break;
    }
    if (dryRun) {
      for (const [id, o] of overlay) if (o.flow === form && o.created) out.push(applyOverlay(id, null));
      return out.map((r) => (overlay.has(r._id) && !overlay.get(r._id).created ? applyOverlay(r._id, r) : r));
    }
    return out;
  }

  async function getFormRow(form, id) {
    if (dryRun && String(id).startsWith("dry-")) return applyOverlay(id, null);
    const row = await read("GET", `/form/2/${acc}/${form}/${id}?${q(form)}`, undefined, `GET ${form}`);
    return dryRun ? applyOverlay(id, row) : row;
  }

  const tableRows = (row, table) => row?.[`Table::${table}`] ?? [];

  /**
   * Create a Form row: draft → submit (serial for this user, D-7), then read the real row back. Child rows go in with the
   * create; their ids are replaced by the server (P9), so callers match rows by their own key column afterwards.
   * @param {Record<string, unknown>} fields
   * @param {Record<string, object[]>} [tables]  child rows per table model id (each row carries its own key column)
   */
  async function createFormRow(form, fields, tables = {}) {
    const run = async () => {
      if (dryRun) {
        guardBody({ fields, tables }, `create ${form}`);
        const id = `dry-${form}-${++dryN}`;
        overlay.set(id, { flow: form, fields: { ...fields }, tables: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.map((r) => ({ _id: `${t}_${rand10()}`, ...r }))])), created: true });
        record("createFormRow", { form, itemId: id, fields: Object.keys(fields), summary: { form, itemId: id } });
        return applyOverlay(id, null);
      }
      const body = { ...fields };
      for (const [t, rows] of Object.entries(tables)) body[`Table::${t}`] = rows.map((r, i) => ({ _id: `${t}_${rand10()}`, _index: i, _is_created: true, ...r }));
      const draft = await call("POST", `/form/2/${acc}/${form}?${q(form)}`, body, `create ${form}`);
      // a 429 or crash before the submit leaves this draft (not a listed row): the hook knows it from here on
      if (onCreated && draft?._id) await onCreated({ kind: "form-draft", flow: form, id: draft._id });
      const real = await call("POST", `/form/2/${acc}/${form}/${draft._id}/submit?${q(form)}`, {}, `submit ${form}`);
      const id = real?._id;
      if (!id || id === draft._id) throw new Error(`${form}: submit returned no new row id`);
      if (onCreated) await onCreated({ kind: "form", flow: form, id, draft: draft._id });
      const back = noteOwn(await getFormRow(form, id));
      const miss = differingFields(fields, back);
      if (miss.length) {
        // Re-apply what did not stick (P3) through the update route.
        await updateFormRow(form, id, Object.fromEntries(miss.map((k) => [k, fields[k]])));
        return getFormRow(form, id);
      }
      return back;
    };
    const p = formQueue.then(run, run);
    formQueue = p.catch(() => {});
    return p;
  }

  /**
   * Update a Form row: header fields plus child rows matched by their own key. Server row ids are re-read before any
   * modify (P9: a modify with an unknown row id adds a duplicate). Then read back and re-apply (P3).
   * @param {Record<string, {key: string, upsert?: object[], remove?: string[]}>} [tableOps]
   */
  async function updateFormRow(form, id, fields = {}, tableOps = {}) {
    return withLock(id, async () => {
      if (dryRun) {
        guardBody({ fields, tableOps }, `update ${form}`);
        const o = overlay.get(id) ?? { flow: form, fields: {}, tables: {} };
        Object.assign(o.fields, fields);
        for (const [t, op] of Object.entries(tableOps)) o.tables[t] = mergeRows(o.tables[t] ?? [], op);
        overlay.set(id, o);
        record("updateFormRow", { form, itemId: id, fields: Object.keys(fields), tables: Object.keys(tableOps), summary: { form, itemId: id, fields: Object.keys(fields).join(","), tables: Object.entries(tableOps).map(([t, op]) => `${t}:+${op.upsert?.length ?? 0}/-${op.remove?.length ?? 0}`).join(",") } });
        return { ok: true, dry: true };
      }
      let row = await getFormRow(form, id);
      if (!row) throw new KfError(`update ${form}/${id}`, 404, "row not found");
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const body = {};
        for (const k of differingFields(fields, row)) body[k] = fields[k];
        for (const [t, op] of Object.entries(tableOps)) {
          const ops = rowOps(tableRows(row, t), op, t);
          if (ops.length) body[`Table::${t}`] = ops;
        }
        if (!Object.keys(body).length) return { ok: true, attempts: attempt - 1, row };
        if (attempt > 1) {
          stats.reapplied++;
          log({ ev: "reapply", form, itemId: id, fields: Object.keys(body).join(","), attempt });
        }
        await call("POST", `/form/2/${acc}/${form}/${id}?${q(form)}`, body, `update ${form}`);
        row = noteOwn(await getFormRow(form, id));
      }
      const left = [...differingFields(fields, row), ...Object.entries(tableOps).filter(([t, op]) => rowOps(tableRows(row, t), op, t).length).map(([t]) => `Table::${t}`)];
      if (left.length) throw new Error(`write not verified after ${maxAttempts} attempts: ${form}/${id} ${left.join(", ")}`);
      return { ok: true, attempts: maxAttempts, row };
    });
  }

  /** The child-row operations that bring `current` to the wanted rows (by own key; server ids re-read). */
  function rowOps(current, { key, upsert = [], remove = [], removeMissing = false }, table) {
    const byKey = new Map();
    for (const r of current) if (r[key] !== undefined && r[key] !== null && r[key] !== "") (byKey.get(r[key]) ?? byKey.set(r[key], []).get(r[key])).push(r);
    const ops = [];
    let idx = current.length;
    for (const want of upsert) {
      const have = byKey.get(want[key]) ?? [];
      if (!have.length) ops.push({ _id: `${table}_${rand10()}`, _index: idx++, _is_created: true, ...want });
      else {
        const diff = differingFields(want, have[0]);
        if (diff.length) ops.push({ _id: have[0]._id, ...Object.fromEntries(diff.map((k) => [k, want[k]])) });
        // A duplicate from an earlier lost/duplicated write (P9): remove the extra copies.
        for (const dup of have.slice(1)) ops.push({ _id: dup._id, _is_deleted: true });
      }
    }
    const drop = new Set(remove);
    if (removeMissing) {
      const wanted = new Set(upsert.map((w) => w[key]));
      for (const k of byKey.keys()) if (!wanted.has(k)) drop.add(k);
    }
    for (const k of drop) for (const r of byKey.get(k) ?? []) ops.push({ _id: r._id, _is_deleted: true });
    return ops;
  }

  function mergeRows(rows, { key, upsert = [], remove = [], removeMissing = false }) {
    const wanted = new Set(upsert.map((w) => w[key]));
    const out = rows.filter((r) => !remove.includes(r[key]) && (!removeMissing || wanted.has(r[key])));
    for (const w of upsert) {
      const i = out.findIndex((r) => r[key] === w[key]);
      if (i >= 0) out[i] = { ...out[i], ...w };
      else out.push({ _id: `dry_${rand10()}`, ...w });
    }
    return out;
  }

  // ------------------------------------------------------------------------------ files (S-2, proven live 14 Oct)

  const attachPath = (flow, itemId, fieldId) => `/process/2/${acc}/admin/${flow}/${itemId}/${fieldId}/attachment?${q(flow)}`;
  const isLive = (it) => it && (it._status === "InProgress" || it._status === "Draft");

  /**
   * Attach one file to an Attachment field of an IN-PROGRESS item (admin route, multipart field "file"). Each upload
   * ADDS to the field's list. Never written after End (completed items are untested). Verified by reading back.
   * @returns {{key: string, id: string, name: string, size: number, fileExtension?: string}}
   */
  async function attachFile(flow, itemId, fieldId, { name, bytes, contentType = "application/octet-stream" }) {
    if (dryRun) {
      record("attachFile", { flow, itemId, fieldId, name, size: bytes?.length ?? 0, summary: { flow, itemId, fieldId, name } });
      return { id: `dry-att-${++dryN}`, name, size: bytes?.length ?? 0, dry: true };
    }
    if (!files) throw new Error("no file transport configured (S-2)");
    return withLock(itemId, async () => {
      const before = await getProcessItemAdmin(flow, itemId);
      if (!before) throw new KfError(`attach ${flow}/${itemId}`, 404, "item not found");
      if (!isLive(before)) throw new Error(`attach refused: ${flow}/${itemId} is ${before._status}; the service never writes after End`);
      const had = new Set((before[fieldId] ?? []).map((a) => a.id));
      await gate();
      const r = screen(await files.upload(attachPath(flow, itemId, fieldId), { name, bytes, contentType }), `attach ${flow}.${fieldId}`);
      stats.writes++;
      if (r.status >= 300) throw new KfError(`attach ${flow}.${fieldId}`, r.status, r.body);
      const list = r.body?.[fieldId] ?? [];
      const added = list.find((a) => !had.has(a.id) && a.name === name) ?? list.find((a) => !had.has(a.id));
      if (!added) throw new Error(`attach ${flow}/${itemId}.${fieldId}: the answer lists no new file`);
      if (onCreated) await onCreated({ kind: "attachment", flow, parent: itemId, field: fieldId, id: added.id });
      const back = noteOwn(await getProcessItemAdmin(flow, itemId));
      if (!(back?.[fieldId] ?? []).some((a) => a.id === added.id)) throw new Error(`attach not verified: ${flow}/${itemId}.${fieldId} ${added.id}`);
      return added;
    });
  }

  /** Download one attachment: admin GET → 302 → same-host signed URL fetched with the key (S-2). */
  async function downloadFile(flow, itemId, fieldId, attId) {
    if (dryRun) {
      notes.add("supplier files are not downloaded in dry-run");
      return null;
    }
    if (!files) throw new Error("no file transport configured (S-2)");
    await gate();
    const r = screen(await files.download(`/process/2/${acc}/admin/${flow}/${itemId}/${fieldId}/attachment/${attId}?${q(flow)}`), `download ${flow}.${fieldId}`);
    stats.reads++;
    if (r.status !== 302 || !r.location) throw new KfError(`download ${flow}.${fieldId}`, r.status, r.body ?? "no redirect");
    await gate();
    const f = screen(await files.fetchSigned(r.location), `signed download ${flow}.${fieldId}`, { binaryOk: true });
    stats.reads++;
    if (f.status !== 200 || !f.bytes) throw new KfError(`signed download ${flow}.${fieldId}`, f.status, f.refused ?? f.body ?? "no bytes");
    return { bytes: f.bytes, contentType: f.contentType };
  }

  // ------------------------------------------------------------------------------ roles and flows

  /** The members of an app role ([{ _id, Name, Email? }]). Role GET is proven; the user-object shape is not. */
  async function roleMembers(roleId, container) {
    const body = await read("GET", `/app_role/2/${acc}/${roleId}?_application_id=${container ?? "CIQ_Digital_A00"}`, undefined, `role ${roleId}`);
    const users = body?.Users ?? body?.Members ?? body?.users ?? [];
    return users.map((u) => ({ _id: u._id ?? u.Id ?? u.id, Name: u.Name ?? u.name ?? "", Email: u.Email ?? u.email ?? u.EmailId ?? null }));
  }

  /**
   * The items of a process the key's user started (GET …/{flow}/myitems, proven live in both containers: every status,
   * Draft included). Rows carry system fields only (_id, Name, _status, _current_step, _modified_at, …), no business
   * field: a caller that needs Case_Code reads each row with the admin GET. Tools only (the live-e2e driver).
   */
  async function listMyItems(flow, { pageSize = 200, maxPages = 20 } = {}) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const body = await read("GET", `/process/2/${acc}/${flow}/myitems?page_number=${page}&page_size=${pageSize}&${q(flow)}`, undefined, `myitems ${flow}`);
      const rows = body?.Data ?? body?.data ?? (Array.isArray(body) ? body : []);
      out.push(...rows);
      if (rows.length < pageSize) break;
    }
    return out;
  }

  /** A paced, guarded GET for read-only helpers (verifyIds): `{ acc, get(path) → {status, body} }`. */
  const paced = { acc, get: async (path) => guardedCall("GET", path, undefined, `GET ${path.replace(/\?.*$/, "")}`) };

  /**
   * One raw call through the same gate (pacing, back-off) and screen (a 429 or the HTML challenge stops it) as every
   * other call, answering `{ status, body }` without judging the status. For tools only (the live-e2e driver's DELETEs
   * and its single optional child-row PUT); the service never calls it. Writes are refused in dry-run, cut to second
   * precision and checked by the identity guard like every other write. `binaryOk`: a non-JSON 2xx body is not taken
   * for a challenge (a DELETE may answer plain text); a 429 or an HTML challenge page is still refused.
   */
  async function raw(method, path, body, what, { binaryOk = false } = {}) {
    const label = what ?? `${method} ${path.replace(/\?.*$/, "")}`;
    if (method !== "GET") {
      if (dryRun) throw new Error(`dry-run port refused ${label}`);
      if (body !== undefined) body = noMillis(body);
      guardBody(body, label);
    }
    await gate();
    const r = screen(await kf.call(method, path, body, { retries: 0 }), label, { binaryOk });
    if (method === "GET") stats.reads++;
    else stats.writes++;
    return r;
  }

  return {
    acc,
    paced,
    dryRun,
    /** The key's own user id (CIQ_SERVICE_USER_ID), or null. */
    serviceUserId,
    get serviceUserTrusted() {
      return serviceTrusted;
    },
    /** false when the key's user is a real person (dev): `_modified_by === serviceUserId` then proves nothing. */
    setServiceUserTrusted(trusted) {
      serviceTrusted = !!trusted;
    },
    /** The item's last write was this service's own (the same test as the holder check). */
    isOwnWrite: (item) => mine(item),
    /** The minted ids no write may carry (identity.mjs); an empty set leaves the guard idle. */
    setLeakGuard(ids) {
      leakIds = new Set(ids ?? []);
    },
    stats,
    intended,
    notes,
    pace,
    kf,
    currentStep,
    getProcessItemAdmin,
    adminUpdate,
    createProcessAtStart,
    submitStart,
    createAndSubmit,
    submitStep,
    withdraw,
    listForm,
    getFormRow,
    tableRows,
    createFormRow,
    updateFormRow,
    attachFile,
    downloadFile,
    roleMembers,
    listMyItems,
    rowOps,
    raw,
  };
}

// ---------------------------------------------------------------------------------------------- live file transport

/**
 * The S-2 transport for live runs: multipart upload and the attachment download (302 → same-host signed URL). It
 * bypasses kf.mjs's JSON client, so the key headers are built here, in-process, from kf.mjs's loadEnv(). They are never
 * logged, printed or returned; the signed URL is fetched with them ONLY when its host is KF_DOMAIN.
 */
export function liveFileTransport(env) {
  const base = `https://${env.KF_DOMAIN}`;
  const headers = () => ({ "X-Access-Key-Id": env.KF_ACCESS_KEY_ID, "X-Access-Key-Secret": env.KF_ACCESS_KEY_SECRET });
  const parse = async (res) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
  return {
    async upload(path, { name, bytes, contentType }) {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: contentType }), name);
      const res = await fetch(base + path, { method: "POST", headers: headers(), body: form });
      return { status: res.status, body: await parse(res) };
    },
    async download(path) {
      const res = await fetch(base + path, { method: "GET", headers: headers(), redirect: "manual" });
      if (res.status === 302 || res.status === 301 || res.status === 303 || res.status === 307) return { status: 302, location: res.headers.get("location") };
      return { status: res.status, body: await parse(res) };
    },
    async fetchSigned(location) {
      const url = new URL(location, base);
      if (url.host !== env.KF_DOMAIN) return { status: 0, refused: `signed URL host is not the Kissflow host (${url.host})` };
      const res = await fetch(url, { headers: headers(), redirect: "manual" });
      if (res.status !== 200) return { status: res.status, body: await parse(res) };
      return { status: 200, bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    },
  };
}
