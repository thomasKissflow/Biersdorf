// Google Apps Script stand-ins for node: loads apps-script/Bundle.gs + Code.gs into a node:vm context (no window,
// document, process, require, Buffer, fetch or crypto inside, as in Apps Script) with the globals the service uses:
// UrlFetchApp (backed by `fetch`), Utilities, PropertiesService, CacheService, LockService, MailApp, ScriptApp, DriveApp,
// ContentService, Logger, console, Session. Used by offline.mjs (fake Kissflow, fake clock) and live.mjs (curl, real
// clock). Every log line, mail, trigger and Drive file is recorded for the checks. UrlFetchApp follows redirects as
// Apps Script does (same method downgraded to GET, the same headers) unless followRedirects is false. `killWhen` models
// Apps Script ending the run (the 6-min limit): from the matching event on, every service call throws, so no catch or
// finally of the script can save anything more.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
export const GS_DIR = resolve(here, "../apps-script");

const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const toBuffer = (data) => {
  if (Buffer.isBuffer(data)) return Buffer.from(data);
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (Array.isArray(data) || (data && typeof data.length === "number" && typeof data !== "string")) return Buffer.from(Array.from(data, (b) => b & 0xff));
  return Buffer.from(String(data ?? ""), "utf8");
};

/** Apps Script's Blob (the parts the service uses). */
export class GasBlob {
  constructor(data, contentType, name) {
    this.buf = toBuffer(data);
    this.type = contentType ?? "application/octet-stream";
    this.name = name ?? null;
  }
  getBytes() { return signed(this.buf); }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getContentType() { return this.type; }
  setContentType(t) { this.type = t; return this; }
  getDataAsString() { return this.buf.toString("utf8"); }
  copyBlob() { return new GasBlob(this.buf, this.type, this.name); }
}

/** Java SimpleDateFormat subset (yyyy MMM MM dd d HH mm ss z 'literal'), as Utilities.formatDate renders it. */
export function formatDate(date, tz, pattern) {
  const d = new Date(date);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  const mon = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(d);
  const zone = tz === "UTC" || tz === "Etc/UTC" ? "UTC" : (new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).find((x) => x.type === "timeZoneName")?.value ?? tz);
  const map = { yyyy: p.year, MMM: mon, MM: p.month, dd: p.day, d: String(Number(p.day)), HH: p.hour, mm: p.minute, ss: p.second, z: zone };
  return pattern.replace(/'([^']*)'|yyyy|MMM|MM|dd|d|HH|mm|ss|z/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}

/**
 * A fresh Apps Script execution. `store` (Script Properties), `cache` and `world` (mails, triggers, Drive) can be shared
 * between executions to model later runs.
 * @param {object} o
 * @param {(url: string, params: object) => {status: number, headers?: object, body?: string|Buffer}} o.fetch
 * @param {{now(): number, advance(ms: number): void}} [o.clock]  fake clock (Date.now and Utilities.sleep); default real
 * @param {(line: string) => void} [o.onLog]  each Logger / console line as it is written
 */
export function execution({ fetch, store = new Map(), cache = new Map(), world = newWorld(), clock, timeZone = "Europe/Berlin", lockFree = () => true, onLog, killWhen, concat = false }) {
  const logs = [];
  let dead = false;
  const alive = () => {
    if (dead) throw new Error("Exceeded maximum execution time");
  };
  /** After `event` happened: the run ends here when killWhen says so. */
  const maybeKill = (event) => {
    if (killWhen && !dead && killWhen(event)) {
      dead = true;
      throw new Error("Exceeded maximum execution time");
    }
  };
  const record = (line) => {
    alive();
    logs.push(line);
    if (onLog) onLog(line);
  };
  const now = () => (clock ? clock.now() : Date.now());
  const sleeps = [];
  const sleep = (ms) => {
    sleeps.push(ms);
    if (clock) clock.advance(ms);
    else if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  };
  const props = {
    getProperty: (k) => (alive(), store.has(k) ? store.get(k) : null),
    setProperty: (k, v) => { alive(); store.set(k, String(v)); maybeKill({ type: "prop", key: k, value: String(v) }); return props; },
    deleteProperty: (k) => { alive(); store.delete(k); return props; },
    getProperties: () => (alive(), Object.fromEntries(store)),
    setProperties: (o, deleteOthers) => { if (deleteOthers) store.clear(); for (const [k, v] of Object.entries(o)) store.set(k, String(v)); return props; },
    getKeys: () => [...store.keys()],
    deleteAllProperties: () => { store.clear(); return props; },
  };
  const live = (k) => { const e = cache.get(k); return e && e.until > now() ? e.value : null; };
  const putOne = (k, v, ttl = 600) => {
    if (Buffer.byteLength(String(v)) > 100 * 1024) throw new Error(`Argument too large: value (${k})`);
    cache.set(k, { value: String(v), until: now() + ttl * 1000 });
  };
  const scriptCache = {
    get: (k) => live(k),
    getAll: (keys) => Object.fromEntries(keys.filter((k) => live(k) !== null).map((k) => [k, live(k)])),
    put: putOne,
    putAll: (o, ttl) => { for (const [k, v] of Object.entries(o)) putOne(k, v, ttl); },
    remove: (k) => cache.delete(k),
    removeAll: (keys) => keys.forEach((k) => cache.delete(k)),
  };
  let held = false;
  const lock = {
    tryLock: () => (lockFree() && !held ? (held = true) : false),
    waitLock: () => { if (!lockFree()) throw new Error("Lock timeout"); held = true; },
    releaseLock: () => { held = false; },
    hasLock: () => held,
  };
  const response = (r) => {
    const body = r.body === undefined || r.body === null ? Buffer.alloc(0) : Buffer.isBuffer(r.body) ? r.body : Buffer.from(String(r.body), "utf8");
    const headers = r.headers ?? {};
    return {
      getResponseCode: () => r.status,
      getHeaders: () => ({ ...headers }),
      getAllHeaders: () => ({ ...headers }),
      getContentText: () => body.toString("utf8"),
      getContent: () => signed(body),
      getBlob: () => new GasBlob(body, headers["Content-Type"] ?? headers["content-type"] ?? "application/octet-stream", null),
    };
  };
  const mail = (a, subject, body, options) => {
    alive();
    const m = typeof a === "object" ? a : { to: a, subject, body, ...(options ?? {}) };
    if (world.mailFailures > 0) {
      world.mailFailures--;
      throw new Error("Service invoked too many times for one day: email.");
    }
    const sent = { at: now(), to: m.to, subject: m.subject, body: m.body, name: m.name, attachments: (m.attachments ?? []).map((b) => ({ name: b.getName(), type: b.getContentType(), bytes: Buffer.from(b.buf) })) };
    world.mails.push(sent);
    maybeKill({ type: "mail", mail: sent });
  };
  const trigger = (fn, everyMinutes) => ({ id: `T${world.triggers.length + 1}-${Math.random().toString(36).slice(2, 7)}`, fn, everyMinutes, getHandlerFunction() { return this.fn; }, getUniqueId() { return this.id; } });
  const driveFile = (folderId, blob) => {
    const id = `ZZTDrive${world.drive.files.length + 1}`;
    const f = { id, folderId, name: blob.getName(), buf: Buffer.from(blob.buf), viewers: [], description: null, getId: () => id, getUrl: () => `https://drive.google.example/file/d/${id}/view`, getName: () => f.name, getDescription: () => f.description, setDescription: (d) => { f.description = String(d); return f; }, addViewer: (e) => { f.viewers.push(e); return f; }, getBlob: () => new GasBlob(f.buf, "application/pdf", f.name) };
    world.drive.files.push(f);
    return f;
  };
  const iterator = (list) => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
  const globals = {
    UrlFetchApp: {
      fetch: (url, params = {}) => {
        alive();
        if (params.muteHttpExceptions !== true) throw new Error("the service must call UrlFetchApp with muteHttpExceptions");
        let r = fetch(url, params);
        for (let hop = 0; params.followRedirects !== false && r.status >= 300 && r.status < 400 && hop < 5; hop++) {
          const loc = Object.entries(r.headers ?? {}).find(([k]) => k.toLowerCase() === "location")?.[1];
          if (!loc) break;
          url = new URL(loc, url).href;
          r = fetch(url, { ...params, method: "get", payload: undefined, contentType: undefined });
        }
        maybeKill({ type: "fetch", url, method: String(params.method || "get").toUpperCase(), status: r.status });
        return response(r);
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256", SHA_1: "SHA_1", MD5: "MD5" },
      Charset: { UTF_8: "UTF_8", US_ASCII: "US_ASCII" },
      computeDigest: (alg, value) => {
        if (alg !== "SHA_256") throw new Error(`digest ${alg} not modelled`);
        return signed(createHash("sha256").update(toBuffer(value)).digest());
      },
      newBlob: (data, contentType, name) => new GasBlob(data, contentType, name),
      formatDate: (d, tz, pattern) => formatDate(d, tz, pattern),
      sleep,
    },
    PropertiesService: { getScriptProperties: () => props },
    CacheService: { getScriptCache: () => scriptCache },
    LockService: { getScriptLock: () => lock },
    MailApp: { sendEmail: mail, getRemainingDailyQuota: () => 100 },
    ScriptApp: {
      getProjectTriggers: () => [...world.triggers],
      deleteTrigger: (t) => { world.triggers = world.triggers.filter((x) => x.id !== t.getUniqueId()); },
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => { const t = trigger(fn, n); world.triggers.push(t); return t; } }) }) }),
    },
    DriveApp: {
      getFolderById: (id) => {
        if (!world.drive.folders.includes(id)) throw new Error("No item with the given ID could be found");
        return {
          getName: () => `ZZT folder ${id}`,
          getFilesByName: (name) => iterator(world.drive.files.filter((f) => f.folderId === id && f.name === name)),
          createFile: (blob) => driveFile(id, blob),
        };
      },
      getFileById: (id) => {
        const f = world.drive.files.find((x) => x.id === id);
        if (!f) throw new Error("No item with the given ID could be found");
        return f;
      },
    },
    ContentService: {
      MimeType: { JSON: "JSON", TEXT: "TEXT" },
      createTextOutput: (s) => ({ content: String(s), mime: "TEXT", setMimeType(m) { this.mime = m; return this; }, getContent() { return this.content; } }),
    },
    Logger: { log: (...a) => record(a.map(String).join(" ")) },
    console: Object.fromEntries(["log", "info", "warn", "error"].map((k) => [k, (...a) => record(`console.${k} ${a.map(String).join(" ")}`)])),
    Session: { getScriptTimeZone: () => timeZone, getEffectiveUser: () => ({ getEmail: () => "" }), getActiveUser: () => ({ getEmail: () => "" }) },
  };
  const ctx = vm.createContext(globals);
  if (clock) {
    ctx.__now = () => clock.now();
    vm.runInContext("Date.now = function () { return __now(); };", ctx);
  }
  // Apps Script loads each file as its own script; `concat` runs them as one (Bundle.gs's "use strict" then covers Code.gs)
  const files = ["Bundle.gs", "Code.gs"].map((f) => [f, readFileSync(resolve(GS_DIR, f), "utf8")]);
  if (concat) vm.runInContext(files.map(([, t]) => t).join("\n"), ctx, { filename: "Bundle.gs+Code.gs" });
  else for (const [f, t] of files) vm.runInContext(t, ctx, { filename: f });
  return {
    ctx,
    logs,
    sleeps,
    store,
    cache,
    world,
    /** Calls a global function of the script (as the editor, a trigger or the web app would). */
    call: (name, ...args) => ctx[name](...args),
  };
}

/** What outlives one execution: mails sent, triggers, Drive; `mailFailures` makes the next n sendEmail calls throw. */
export const newWorld = () => ({ mails: [], triggers: [], drive: { folders: [], files: [] }, mailFailures: 0 });
