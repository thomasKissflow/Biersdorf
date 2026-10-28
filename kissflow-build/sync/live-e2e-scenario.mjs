// The live end-to-end scenario (plan v5 §12 walk-through) as a set of steps over a small ENV interface, so the SAME
// steps run offline against the in-memory fake (test/live-e2e-driver.test.mjs) and live (live-e2e.mjs). The env wraps a
// kf.mjs-shaped key client: in dev the key acts as the dev user (Thomas), who is a member of every app role and the only
// portal Supplier user, so the driver plays every human (RMM, each reviewer, the supplier contact) with the key:
//   - a human "save" is STOOD IN FOR by an admin-route PUT (/process/2/{acc}/admin/{proc}/{item}) carrying the same
//     fields. It is NOT the route the real users write through: the portal UI saves with the SDK's updateItem
//     ({instanceId, activityInstanceId}) and the Workbench with updateItem + activityInstanceId (the user's own step
//     route, assignee check and per-step field permissions, P12); only adminRepair.ts uses the admin route. The key
//     cannot write through the assignee route after Start (P1, 050313), so the driver cannot play that route;
//   - a human step is then SUBMITTED with the key (POST …/{item}/{activityInstanceId}/submit, instance id from the admin
//     GET _current_context: S-5);
//   - process items are created at Start (POST /process/2/{acc}/{proc}) and submitted with the create's instance id;
//   - Form rows are draft + submit, strictly one at a time (D-7); list rows carry no system fields (P16);
//   - every DateTime goes out at second precision (P17);
//   - file questions and requested documents are answered with a "Cannot provide" justification; one OPTIONAL attempt
//     attaches a file to CIQP_Request_A00.Supplier_Files and adds its Uploads row through the admin route (child rows on
//     a process item via the admin route are unproven), recorded PASS/FAIL without failing the run.
// Between the human acts the REAL sync service runs (service.mjs runOnce, scoped to the case: caseOnly).
//
// WHAT A PASS PROVES: the service, the routing (assignments, steps, Raiser_Assignee, Assigned_Contacts), the key's
// submits and the cross-container sync, end to end. It does NOT prove the users' own write path (S-1 open): a real
// supplier's save of Answers_JSON / Completeness_* / Change_Report_*, or a reviewer's Review_Confirm / RMES_Decision at
// its step, may still be refused by a missing per-step field permission. Every PASS line says so (SCOPE).
//
// Safety: the preflight refuses unless the dev user is the ONLY member of every app role (departments, CUS and LEG
// included, persona roles, Integration service, Case administrator) and of the portal Supplier role, and the Settings
// default reviewers are blank or the dev user: so every task, notification and mail of the run reaches the dev user only.
// The ledger is bound to the Kissflow host and account of its preflight; every later mode refuses another target.
//
// Pacing: the driver's port and the service's port share ONE pacing/back-off state (createPort `pace`), so every call
// of the process is ≥ minIntervalMs apart, and the first 429 (Kissflow JSON or the Cloudflare HTML challenge) stops the
// whole run (StopError): nothing is retried fast, nothing more is asked of Kissflow.
//
// Bookkeeping: the driver's ledger (live: .state/live-e2e-<case>.json) records every object the driver's port AND the
// service's port create, the moment Kissflow answers with its id and before the next call (createPort onCreated: process
// items, Form rows, pending Form drafts, attachments), the service's own item map (Case Data Sync_Note) after every read,
// the progress of each human act (a re-run never repeats an act already done), each step's result, any 429 back-off and
// the cleanup. It holds ids and keys only: no e-mail address, no secret. Every printed line, every run-log event and every
// free text stored in the ledger (step reasons, upload details) masks e-mail addresses.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { FLOW, F, STEP, ROLE, LIST, PORTAL, APP, containerOf, verifyIds, verifySummary } from "./ids.mjs";
import { createPort, isDeferral } from "./kissflow.mjs";
import { createService, heartbeatLine, memoryState } from "./service.mjs";
import { D, J, readLedger, toCiqCase, rmesFromRows, sealOf } from "./engine.mjs";
import { configFromRows, configPinnedTo, bundleHash } from "./config.mjs";
import { EVENT_CODE } from "./mail.mjs";

export const CASE_RE = /^ZZT-E2E-\d{4}$/;
export const DEFAULT_CASE = "ZZT-E2E-0001";
export const DEV_SUPPLIER = "ZZT-SUP-DEV";
/** The pinned configuration of the test case: the seeded, published first release. */
export const PIN = { ruleSetVersion: "RS-2026.1", templateVersion: "CIQ-2026 v1", releaseKey: "RS-2026.1 + v1" };
/** Metadata answers that give a plain vegetable-origin case (the e2e test's PLAIN_CONFIG). */
export const PLAIN_CONFIG = { SF01: ["vegetable"], SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF09: false, SF10: false, SF12: true };
export const COMPONENTS = [{ id: "c1", inci: "Olea Europaea Fruit Oil", cas: "8001-25-0", fn: "emollient", additive: false, origin: "vegetable", concMin: 99, concMax: 100 }];
export const CANNOT = "Cannot provide: not available for this fictional test material (ZZT live end-to-end test).";
const REVIEW_ORDER = ["REG", "SAF", "QM", "MIC", "SUS", "RMM"];
const SUPPLIER_EVENTS = new Set(["invitation", "op-raised", "op-edited", "op-returned", "op-accepted", "op-closed", "release-requested", "release-withdrawn", "release-receipt", "cancelled", "reactivated", "reminder"]);
/**
 * App roles the walk needs the dev user in, as their ONLY member (P2: the key submits a step only when its user holds
 * the step's role; the service assigns reviews to the first member of a department and sends the C-03 "informed" mail
 * to every CUS/LEG member; a role-assigned step lands in every member's Kissflow queue).
 */
const REQUIRED_ROLES = { RMM: ROLE.RMM, REG: ROLE.REG, SAF: ROLE.SAF, QM: ROLE.QM, MIC: ROLE.MIC, SUS: ROLE.SUS, CUS: ROLE.CUS, LEG: ROLE.LEG, "Integration service": ROLE.service };
/** Roles the walk does not need the dev user in, but that may hold nobody else (persona mails, item visibility). */
const EXCLUSIVE_ROLES = { "Business administrator": ROLE.admin, Auditor: ROLE.auditor, "Business owner": ROLE.owner, "Case administrator": ROLE.caseAdmin };
/** Forms searched by Case_Code (preflight, status, cleanup). Never CIQ Supplier, CIQ Config Version or Help. */
const CASE_FORMS = [FLOW.rmesSaf, FLOW.rmesReg, FLOW.scopeRun, FLOW.outbox, FLOW.audit, FLOW.note, FLOW.serviceRequest, FLOW.caseData];
const NEVER_DELETE = new Set([FLOW.supplier, FLOW.config, FLOW.help]);
/** The process flows a case can have items in (portal first: the cleanup order). */
const CASE_PROCESSES = [FLOW.query, FLOW.release, FLOW.request, FLOW.openPoint, FLOW.review, FLOW.caseProc];
/**
 * /myitems rows last modified before this instant cannot be items of a ZZT-E2E case (the driver did not exist yet), so
 * the scan reads only the later ones with the admin GET (rows carry no Case_Code).
 */
export const SCAN_EPOCH = "2026-10-15T00:00:00Z";
/** verifyIds gaps the walk tolerates: the Uploads table only serves the OPTIONAL upload attempt. */
const OPTIONAL_TABLES = new Set([`${FLOW.request}/${F.request.uploads.table}`]);
/** The only Kissflow target the live driver writes to (CLAUDE.md: the Development sandbox; never production). */
export const DEV_TARGET = Object.freeze({ domain: "dev-beiersdorf.kissflow.eu", acc: "AcDOSunMEpSA" });
/** Printed with every step result: what a PASS does and does not prove. */
export const SCOPE = "proves the service, routing and submit path; the users' own-step saves are stood in for by the admin PUT (S-1 open)";

/** null when the client targets the dev sandbox, else why not (no value from .env is echoed). */
export function checkTarget(kf, want = DEV_TARGET) {
  const bad = [];
  if (kf?.domain !== want.domain) bad.push(`KF_DOMAIN is not ${want.domain}`);
  if (kf?.acc !== want.acc) bad.push(`KF_ACCOUNT_ID is not ${want.acc}`);
  return bad.length ? `the .env target is not the Development sandbox (${bad.join("; ")}): the live driver writes there only` : null;
}

export class StopError extends Error {
  constructor(why) {
    super(`stopped: ${why}`);
    this.stop = true;
  }
}
export class RefusedError extends Error {
  constructor(why) {
    super(why);
    this.refused = true;
  }
}
class StepFailed extends Error {}

const isStop = (e) => !!e?.stop || (isDeferral(e) && (e.unreadable || e.backoff));
const noMs = (d) => (d instanceof Date ? d : new Date(d)).toISOString().replace(/\.\d+Z$/, "Z");
const day = (d, plusDays = 0) => new Date((d instanceof Date ? d : new Date(d)).getTime() + plusDays * 86_400_000).toISOString().slice(0, 10);
const idOf = (v) => (v && typeof v === "object" ? v._id : v);
const ids = (v) => (Array.isArray(v) ? v.map(idOf) : []);
const rand10 = () => randomBytes(8).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 10).padEnd(10, "x");
const stepName = (item) => item?._current_context?.[0]?._context_current_step ?? null;
const sameMail = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const isRetry = (r) => /#\d+$/.test(String(r.Mail_Key ?? ""));
const evName = (code) => `${code} (${EVENT_CODE[code] ?? "?"})`;
const errText = (body) => (typeof body === "string" ? body.slice(0, 200) : (body?.en_message ?? body?.message ?? JSON.stringify(body ?? {}).slice(0, 200)));
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Any e-mail address in a text → ‹e-mail› (Kissflow error texts echo rejected values). */
export const maskEmails = (text) => String(text).replace(EMAIL_RE, "‹e-mail›");

// ---------------------------------------------------------------------------------------------- ledgers

const freshLedger = (caseCode, label) => ({ v: 1, caseCode, env: label, target: null, startedAt: null, seq: 0, created: [], drafts: {}, gone: {}, service: { items: {} }, progress: {}, steps: {}, marks: { mail: [], audit: [] }, optionalUpload: null, backoff: null, cleanup: null });

/** The driver's ledger kept in memory (tests). */
export function memoryLedger(caseCode, label = "fake") {
  let data = freshLedger(caseCode, label);
  return {
    get data() {
      return data;
    },
    save() {},
    restart() {
      data = freshLedger(caseCode, label);
    },
  };
}

/**
 * The driver's ledger as a JSON file, written synchronously on every save (ids and keys only; any e-mail address that
 * slipped into a free text is masked on the way to the disk). One process at a time holds it (lock.mjs).
 */
export function fileLedger(path, caseCode, label = "live") {
  let data = existsSync(path) ? { ...freshLedger(caseCode, label), ...JSON.parse(readFileSync(path, "utf8")) } : freshLedger(caseCode, label);
  if (data.caseCode !== caseCode) throw new RefusedError(`the ledger ${path} belongs to ${data.caseCode}, not ${caseCode}`);
  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.tmp`, maskEmails(JSON.stringify(data, null, 2)) + "\n");
    renameSync(`${path}.tmp`, path);
  };
  return {
    get data() {
      return data;
    },
    save,
    /** After a complete cleanup: keep the old ledger next to it, start a new one for the same case code. */
    restart() {
      if (existsSync(path)) renameSync(path, path.replace(/\.json$/, `.${Date.now()}.json`));
      data = freshLedger(caseCode, label);
      save();
    },
  };
}

// ---------------------------------------------------------------------------------------------- the env

/**
 * The env of one run: the key-user client, the driver's own port, the real service, and the human helpers.
 * @param {object} o
 * @param {object} o.kf            kf.mjs-shaped key client (live: kissflow-build/lib/kf.mjs; offline: fake.key)
 * @param {object} [o.files]       S-2 file transport (live: liveFileTransport; offline: fake.keyFiles)
 * @param {string} o.caseCode      ZZT-E2E-####
 * @param {string} o.devUserId     the dev user's Kissflow id (the key's user; every role; the only portal user)
 * @param {object} o.ledger        memoryLedger() | fileLedger()
 * @param {boolean} [o.liveAllowed] CIQ_SYNC_LIVE=1 was given (the preflight refuses without it)
 * @param {() => Date} [o.now]     data time (offline: the fake's clock)
 * @param {() => Promise} [o.quiet] before each service pass (live: wait out the holder's 2 s quiet window)
 * @param {() => Promise} [o.beforeAct] before each human act (offline: advance the fake clock)
 */
export function createEnv({
  kf,
  files = null,
  caseCode,
  devUserId,
  supplierCode = DEV_SUPPLIER,
  ledger,
  serviceState = memoryState(),
  serviceUserId = null,
  liveAllowed = false,
  label = "live",
  minIntervalMs = 1000,
  now = () => new Date(),
  wallClock,
  sleep,
  quiet = () => new Promise((r) => setTimeout(r, 3500)),
  beforeAct = async () => {},
  linkBase = {},
  log = () => {},
  out = (line) => console.log(line),
  maxServicePasses = 3,
} = {}) {
  if (!kf?.call) throw new Error("createEnv needs a kf.mjs-shaped client");
  let me = null;
  let cfgRows = null;
  const mask = (text) => {
    let s = String(text);
    if (me?.email) s = s.replace(new RegExp(me.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "‹dev e-mail›");
    return maskEmails(s);
  };
  const maskDeep = (v) => (v === undefined || v === null ? v : JSON.parse(mask(JSON.stringify(v))));
  // the run-log sink only ever sees masked events (Kissflow error texts echo rejected values, e-mails included)
  const safeLog = (e) => log(maskDeep(e));
  const clockNow = wallClock ?? (() => Date.now());
  // a back-off recorded by an earlier invocation (a 429 stops the run; the next run must not call before it ends).
  // last = now: the first call of this process also waits minIntervalMs (the previous invocation may have just called).
  const pace = { last: clockNow(), backoffUntil: Number(ledger?.data?.backoff?.until ?? 0), lastReason: ledger?.data?.backoff?.reason ?? null };
  const timing = { ...(wallClock ? { wallClock } : {}), ...(sleep ? { sleep } : {}) };
  // every object either port creates is in the driver's ledger the moment Kissflow answers with its id
  const port = createPort({ kf, files, now, minIntervalMs, pace, log: (e) => safeLog({ src: "driver", ...e }), ...timing, onCreated: (e) => env.recordCreate({ ...e, by: "driver" }) });
  const svcPort = createPort({ kf, files, now, serviceUserId, minIntervalMs, pace, log: safeLog, ...timing, onCreated: (e) => env.recordCreate({ ...e, by: "service" }) });
  const service = createService({ port: svcPort, now: () => now().toISOString(), log: safeLog, linkBase, state: serviceState });
  const acc = kf.acc;
  const target = { domain: kf.domain ?? null, acc: kf.acc ?? null };

  const env = {
    label,
    caseCode,
    devUserId,
    supplierCode,
    liveAllowed,
    client: kf,
    port,
    svcPort,
    service,
    serviceState,
    ledger,
    pace,
    maxServicePasses,
    now: () => noMs(now()),
    today: () => day(now()),
    dayPlus: (n) => day(now(), n),
    quiet,
    beforeAct,
    target,
    out(line) {
      out(env.mask(line));
    },
    /** Every printed line, log event and stored free text: the dev e-mail and any other e-mail address are masked. */
    mask,
    maskDeep,
    /**
     * Records an object the driver's or the service's port created, BEFORE anything else is called (ids only). A Form
     * draft is kept apart (ledger.drafts, one per Form: Kissflow keeps one draft per user per Form, D-7 [proven]) until
     * the submit consumes it. Called again for an id already recorded, it only adds the extra fields (`what`, `key`).
     */
    recordCreate(entry) {
      const L = ledger.data;
      L.drafts ??= {};
      if (entry.kind === "form-draft") {
        L.drafts[entry.flow] = { id: entry.id, by: entry.by ?? null, at: env.now() };
        ledger.save();
        return;
      }
      if (entry.kind === "form") delete L.drafts[entry.flow];
      const had = entry.id ? L.created.find((c) => c.kind === entry.kind && c.id === entry.id) : null;
      if (had) Object.assign(had, Object.fromEntries(Object.entries(entry).filter(([k, v]) => v !== undefined && had[k] === undefined)));
      else L.created.push({ at: env.now(), ...entry });
      ledger.save();
    },
    /** Notes extra fields (`what`, `key`) on an object already recorded by the create hook. */
    annotate(kind, id, extra) {
      const had = ledger.data.created.find((c) => c.kind === kind && c.id === id);
      if (!had) return;
      Object.assign(had, extra);
      ledger.save();
    },
    /** After a 429 / challenge: the back-off goes into the ledger, so the next invocation refuses without a call. */
    persistBackoff() {
      if (!(pace.backoffUntil > 0)) return null;
      ledger.data.backoff = { until: pace.backoffUntil, reason: pace.lastReason, at: env.now() };
      ledger.save();
      return pace.backoffUntil;
    },
    rerunAfter: () => (pace.backoffUntil ? new Date(pace.backoffUntil).toISOString() : "the back-off"),
    /** null when the ledger belongs to this env's Kissflow host and account (or names none yet), else why not. */
    targetMismatch() {
      const t = ledger.data.target;
      if (!t) return null;
      return t.domain === target.domain && t.acc === target.acc ? null : `the ledger of ${caseCode} belongs to another Kissflow target (its preflight ran against ${t.domain ?? "?"} / ${t.acc ?? "?"}); refused`;
    },
    /** Ids a cleanup verified as deleted (kept across cleanup runs; never read again). */
    isGone: (id) => !!ledger.data.gone?.[id],
    nextSeq() {
      ledger.data.seq = (ledger.data.seq ?? 0) + 1;
      ledger.save();
      return ledger.data.seq;
    },

    // -------------------------------------------------------------------------- readers
    read: {
      item: (flow, id) => port.getProcessItemAdmin(flow, id),
      list: (form) => port.listForm(form),
      row: (form, id) => port.getFormRow(form, id),
      /** The case's rows of a Form, as listed (business fields only, P16). */
      byCase: async (form) => (await port.listForm(form)).filter((r) => r.Case_Code === caseCode),
    },
    async configRows() {
      cfgRows ??= await port.listForm(FLOW.config);
      return cfgRows;
    },
    async cfg() {
      return configFromRows(await env.configRows()).cfg;
    },
    async releaseRow() {
      return (await env.configRows()).find((r) => r.Config_Kind === "Release" && r.Release_Key === PIN.releaseKey) ?? null;
    },
    /** The dev user as the role GET shows it (name, e-mail) and as the dev supplier's contact row shows it. */
    async identify() {
      if (me) return me;
      const members = await port.roleMembers(ROLE.RMM);
      const u = members.find((m) => m._id === devUserId);
      const { listed, row: sup } = await env.supplierRow();
      const contact = (sup?.[`Table::${F.supplier.contacts.table}`] ?? []).find((c) => c.Contacts_Portal_User_Id === devUserId);
      me = { id: devUserId, name: u?.Name ?? "", email: u?.Email ?? "", contactName: contact?.Contacts_Full_Name ?? u?.Name ?? "", contactTitle: contact?.Contacts_Title ?? "Supplier contact", contact, supplier: sup, supplierListed: listed };
      return me;
    },
    /** The dev supplier as listed (what the service's directory reads) and as its per-row GET shows it. */
    async supplierRow() {
      const listed = (await port.listForm(FLOW.supplier)).filter((r) => r.Supplier_Code === supplierCode);
      return { listed: listed[0] ?? null, row: listed.length ? await port.getFormRow(FLOW.supplier, listed[0]._id) : null, count: listed.length };
    },
    /**
     * The service's own view of the case (Case Data + RMES rows), and (unless `record: false`, as in --status) a
     * snapshot of its item map into the ledger.
     */
    async view({ record = true } = {}) {
      // the Case Data row id is known after the first read: one GET instead of a list + GET (never for a deleted row:
      // a GET of a deleted Form row answering 404 is unproven)
      const known = ledger.data.service?.caseDataId;
      let row = known && !env.isGone(known) ? await port.getFormRow(FLOW.caseData, known) : null;
      let rows = 1;
      if (!row || row.Case_Code !== caseCode) {
        const listed = await env.read.byCase(FLOW.caseData);
        rows = listed.length;
        if (!listed.length) return null;
        row = await port.getFormRow(FLOW.caseData, listed[0]._id);
      }
      if (!row) return null;
      const L = readLedger(row);
      const rmesRows = {
        SAF: L.items["rmes:SAF"] ? await port.getFormRow(FLOW.rmesSaf, L.items["rmes:SAF"]) : null,
        REG: L.items["rmes:REG"] ? await port.getFormRow(FLOW.rmesReg, L.items["rmes:REG"]) : null,
      };
      const c = toCiqCase(row, { rmes: rmesFromRows(rmesRows) });
      if (record) {
        ledger.data.service = { caseDataId: row._id, caseItemId: row.Case_Item_Id ?? null, items: { ...(ledger.data.service?.items ?? {}), ...L.items }, at: env.now() };
        ledger.save();
      }
      return { row, L, c, rmesRows, rows };
    },
    /**
     * The case's process items as the key's user's /myitems lists them (P5: process items cannot be listed by
     * Case_Code). In dev the key's user starts every item of the run (driver and service), so this finds an item that
     * no ledger or link knows (a lost ledger). Rows carry no Case_Code: each row last modified since SCAN_EPOCH and not
     * in `skip` is read with the admin GET. Returns [{ flow, id, status }] of the case's items (`.read`: GETs made).
     */
    async scanMyItems({ skip = new Set() } = {}) {
      const hits = [];
      let read = 0;
      for (const flow of CASE_PROCESSES) {
        for (const r of await port.listMyItems(flow)) {
          if (!r?._id || skip.has(r._id) || env.isGone(r._id)) continue;
          if (r._modified_at && String(r._modified_at) < SCAN_EPOCH) continue;
          read++;
          const x = await port.getProcessItemAdmin(flow, r._id);
          if (x && x.Case_Code === caseCode) hits.push({ flow, id: r._id, status: x._status });
        }
      }
      hits.read = read;
      return hits;
    },

    // -------------------------------------------------------------------------- the service
    /** One service pass on this case only; a 429 (hb.aborted) stops the run. */
    async runService() {
      await quiet();
      const hb = await service.runOnce({ caseCode, caseOnly: true });
      if (hb.aborted) throw new StopError(`the service pass hit a rate limit / challenge (${hb.aborted})`);
      return hb;
    },
    /** "Run now" for a closed case: the service polls closed cases only every 15 min (its own state). */
    forceClosedPoll() {
      serviceState.set({ lastClosedPollAt: "" });
    },

    // -------------------------------------------------------------------------- Workbench (RMM, reviewers)
    wb: {
      /** RMM creates the CIQ Case at Start with its fields and submits Start (the create's instance id). */
      async createCase(fields) {
        await beforeAct();
        // the port's hook recorded the create the moment Kissflow answered, even if this act was cut off right after
        const rec = ledger.data.created.find((c) => c.kind === "process" && c.flow === FLOW.caseProc && c.by === "driver");
        const known = ledger.data.caseItemId ?? rec?.id;
        if (known) {
          // resumed: the item exists; submit Start if the first try did not get that far
          const it = await port.getProcessItemAdmin(FLOW.caseProc, known);
          if (it && it.Case_Code === caseCode) {
            ledger.data.caseItemId = known;
            ledger.save();
            if (it._status === "Draft") await port.submitStart(FLOW.caseProc, known, ledger.data.caseStartInstance ?? rec?.instance ?? it._current_context?.[0]?._context_activity_instance_id);
            return known;
          }
        }
        const c = await port.createProcessAtStart(FLOW.caseProc, fields); // recorded by the port's hook
        env.annotate("process", c._id, { what: "CIQ Case (driver, at Start)" });
        ledger.data.caseItemId = c._id;
        ledger.data.caseStartInstance = c._activity_instance_id;
        ledger.save();
        await port.submitStart(FLOW.caseProc, c._id, c._activity_instance_id);
        return c._id;
      },
      /** A CIQ Service Request row filed as the key's user (draft + submit, read back). */
      async request(code, payload = {}, objectKey = "") {
        await beforeAct();
        // an interrupted filing of the same request: find its row by its key before filing it again (never twice)
        const pend = ledger.data.pendingRequest;
        let key = pend?.code === code ? pend.key : null;
        if (key) {
          const hit = (await env.read.byCase(FLOW.serviceRequest)).find((r) => r.Request_Key === key);
          if (hit) {
            // its key proves it is this run's row (the hook has normally recorded it already: this adds key and label)
            env.recordCreate({ kind: "form", flow: FLOW.serviceRequest, id: hit._id, by: "driver", key, what: `Service Request ${code} (found after an interruption)` });
            ledger.data.pendingRequest = null;
            ledger.save();
            return { id: hit._id, key };
          }
        } else key = `${caseCode}:${code}:${env.nextSeq()}`;
        ledger.data.pendingRequest = { code, key };
        ledger.save();
        // the draft and then the row are recorded by the port's hook as Kissflow answers (before its read-back)
        const row = await port.createFormRow(FLOW.serviceRequest, { Request_Key: key, Request_Code: code, Case_Code: caseCode, Object_Key: objectKey, Payload_JSON: JSON.stringify(payload) });
        env.annotate("form", row?._id, { key, what: `Service Request ${code}` });
        ledger.data.pendingRequest = null;
        ledger.save();
        return { id: row?._id, key };
      },
      /**
       * A user's own-step save, STOOD IN FOR by the admin PUT (read back; the users' real route is the SDK updateItem
       * with the activity instance id: S-1, unproven here), then that step submitted with the key.
       */
      async actAtStep(flow, itemId, fields, { expectStep, submit = true, resume = false } = {}) {
        await beforeAct();
        if (resume && expectStep) {
          const cur = await port.getProcessItemAdmin(flow, itemId);
          if (cur && stepName(cur) !== expectStep) {
            env.out(`  note  ${flow} ${itemId} is no longer at "${expectStep}" (${cur._status}${stepName(cur) ? `, ${stepName(cur)}` : ""}): the interrupted act submitted it already`);
            return;
          }
        }
        if (fields && Object.keys(fields).length) await port.adminUpdate(flow, itemId, fields, { skipHolderCheck: true });
        if (submit) await port.submitStep(flow, itemId, { expectStep });
      },
      /** A reviewer records RMES results on its RMES row (child rows matched by Criteria_Code, server ids re-read). */
      async updateRmes(dept, rowId, results) {
        await beforeAct();
        const form = dept === "SAF" ? FLOW.rmesSaf : FLOW.rmesReg;
        const table = F.rmes.criteria[dept];
        return port.updateFormRow(form, rowId, {}, { [table]: { key: "Criteria_Code", upsert: results.map((x) => ({ Criteria_Code: x.criterionId, Criteria_Result: LIST.rmesResult[x.result] ?? x.result, Criteria_Recorded_At: env.now() })) } });
      },
    },

    // -------------------------------------------------------------------------- the supplier (portal UI writes)
    supplier: {
      /** One portal save: merged JSON fields, who/when per key, Answers_Rev + 1, Answers_Changed_* (§3.1). */
      async save(reqId, { config, answers, components, justifications, markKeys = [] } = {}) {
        await beforeAct();
        const u = await env.identify();
        const it = await port.getProcessItemAdmin(FLOW.request, reqId);
        const at = env.now();
        const who = J(it.Answered_By_JSON, {});
        const mark = (keys) => keys.forEach((k) => (who[k] = { name: u.contactName, email: u.email, at }));
        const fields = {};
        if (config && Object.keys(config).length) {
          fields.Config_Answers_JSON = JSON.stringify({ ...J(it.Config_Answers_JSON, {}), ...config });
          mark(Object.keys(config));
        }
        if (answers && Object.keys(answers).length) {
          fields.Answers_JSON = JSON.stringify({ ...J(it.Answers_JSON, {}), ...answers });
          mark(Object.keys(answers));
        }
        if (components) {
          fields.Components_JSON = JSON.stringify(components);
          mark(["K2.1:components"]);
        }
        if (justifications && Object.keys(justifications).length) {
          fields.Justifications_JSON = JSON.stringify({ ...J(it.Justifications_JSON, {}), ...justifications });
          mark(Object.keys(justifications));
        }
        mark(markKeys);
        const rev = Number(it.Answers_Rev ?? 0) + 1;
        Object.assign(fields, { Answered_By_JSON: JSON.stringify(who), Answers_Rev: rev, Answers_Changed_At: at, Answers_Changed_By_Email: u.email });
        await port.adminUpdate(FLOW.request, reqId, fields, { skipHolderCheck: true });
        return rev;
      },
      async confirmCompleteness(reqId, { resume = false } = {}) {
        const u = await env.identify();
        await env.wb.actAtStep(FLOW.request, reqId, { Completeness_Confirm: "Confirmed", Completeness_By_Name: u.contactName, Completeness_By_Email: u.email, Completeness_By_Role: u.contactTitle, Completeness_At: env.now() }, { expectStep: STEP.request.fill.name, resume });
      },
      async answer(queryId, { kind = LIST.responseKind.answer, text = "", resume = false } = {}) {
        const u = await env.identify();
        await env.wb.actAtStep(FLOW.query, queryId, { Response_Kind: kind, Response_Text: text, Response_Doc_Refs_JSON: "[]", Supplier_Responsible_Email: u.email }, { expectStep: STEP.query.respond.name, resume });
      },
      async release(releaseId, { resume = false } = {}) {
        const u = await env.identify();
        await env.wb.actAtStep(FLOW.release, releaseId, { Supplier_Confirm: "Confirmed", Confirmed_By_Name: u.contactName, Confirmed_By_Email: u.email, Confirmed_By_Role: u.contactTitle, Confirmed_At: env.now() }, { expectStep: STEP.release.release.name, resume });
      },
      async reportChange(reqId, text) {
        await beforeAct();
        const u = await env.identify();
        const it = await port.getProcessItemAdmin(FLOW.request, reqId);
        const rev = Number(it.Change_Report_Rev ?? 0) + 1;
        await port.adminUpdate(FLOW.request, reqId, { Change_Report_Text: text, Change_Report_Rev: rev, Change_Report_By_Email: u.email, Change_Report_At: env.now() }, { skipHolderCheck: true });
        return rev;
      },
      /**
       * OPTIONAL (unproven: child rows on a process item via the admin route): attach one file to Supplier_Files, then
       * add its Uploads metadata row with ONE admin PUT (no re-apply: a modify with an unknown row id adds a row, P9).
       * Never throws except to stop the run on a 429; returns {attach, row, detail, attId, uploadId}.
       */
      async tryUpload(reqId, { resume = false } = {}) {
        await beforeAct();
        const u = await env.identify();
        const res = { attach: "FAIL", row: "FAIL", detail: "" };
        // stored in the ledger: Kissflow's error texts may echo the rejected value (Uploaded_By_Email)
        const done = (r) => ({ ...r, detail: mask(r.detail ?? "") });
        const name = `${caseCode}-optional-test-file.pdf`;
        const table = F.request.uploads.table;
        const uploadId = `UP-${caseCode}-OPT-1`;
        let cur = null;
        if (resume) {
          // the interrupted try: reuse its file (the port's hook recorded it the moment the upload answered), and its
          // row if it is there already
          const had = ledger.data.created.find((c) => c.kind === "attachment" && c.parent === reqId && c.by === "driver");
          if (had) {
            res.attach = "PASS";
            res.attId = had.id;
            cur = await port.getProcessItemAdmin(FLOW.request, reqId);
            const got = (cur?.[`Table::${table}`] ?? []).filter((x) => x.Upload_Id === uploadId);
            if (got.length === 1 && got[0].Upload_Attachment_Id === had.id) return done({ ...res, row: "PASS", uploadId });
          }
        }
        if (res.attach !== "PASS") {
          try {
            const bytes = Buffer.from(`%PDF-1.4\n% ${caseCode}: fictional test file of the live end-to-end driver\n%%EOF\n`, "latin1");
            const added = await port.attachFile(FLOW.request, reqId, F.request.files, { name, bytes, contentType: "application/pdf" }); // recorded by the hook
            env.annotate("attachment", added.id, { what: "optional upload in CIQP_Request_A00.Supplier_Files" });
            res.attach = "PASS";
            res.attId = added.id;
          } catch (e) {
            if (isStop(e)) throw e;
            res.detail = `attach: ${e.message}`;
            return done(res);
          }
        }
        try {
          // the proven REST child-row add shape (SPIKES SP:89-101): own id <table>_<rand10>, _index = the row count, _is_created
          cur ??= await port.getProcessItemAdmin(FLOW.request, reqId);
          const index = (cur?.[`Table::${table}`] ?? []).length;
          const row = { _id: `${table}_${rand10()}`, _index: index, _is_created: true, Upload_Id: uploadId, Upload_Section_Key: "GEN", Upload_Doc_Kind: "Other", Upload_File_Name: name, Uploaded_By_Email: u.email, Uploaded_At: env.now(), Upload_Attachment_Id: res.attId };
          const r = await port.raw("PUT", `/process/2/${acc}/admin/${FLOW.request}/${reqId}?_application_id=${PORTAL}`, { [`Table::${table}`]: [row] }, "admin PUT CIQP_Request_A00 Uploads row (optional)");
          if (r.status >= 300) {
            res.detail = `Uploads row: admin PUT answered HTTP ${r.status} ${errText(r.body)}`;
            return done(res);
          }
          const back = await port.getProcessItemAdmin(FLOW.request, reqId);
          const got = (back?.[`Table::${table}`] ?? []).filter((x) => x.Upload_Id === uploadId);
          if (got.length === 1 && got[0].Upload_Attachment_Id === res.attId) {
            res.row = "PASS";
            res.uploadId = uploadId;
          } else res.detail = `Uploads row: the admin PUT answered ${r.status}, but the read-back shows ${got.length} row(s) with Upload_Id ${uploadId}`;
        } catch (e) {
          if (isStop(e)) throw e;
          res.detail = `Uploads row: ${e.message}`;
        }
        return done(res);
      },
    },
  };
  // the interface's role names: RMM and the reviewers both act through the Workbench helpers
  env.rmm = env.wb;
  env.reviewer = env.wb;
  return env;
}

// ---------------------------------------------------------------------------------------------- step context

function stepCtx(env, n, title) {
  const checks = [];
  const optional = [];
  env.out(`── Step ${n} · ${title} ${"─".repeat(Math.max(4, 64 - title.length))}`);
  const s = {
    n,
    checks,
    optional,
    /**
     * A human act, done once: a re-run of the step skips acts already done. An act that was interrupted (a 429 between
     * its calls) is resumed: `fn({ resume: true })` looks for what the first try already did before writing again.
     */
    async act(id, label, fn) {
      const key = `${n}.${id}`;
      const p = env.ledger.data.progress[key];
      if (p?.done) {
        env.out(`  skip  ${label} (done ${p.at})`);
        return p.v;
      }
      const resume = !!p?.started;
      env.out(`  act   ${label}${resume ? " (resuming an interrupted act)" : ""}`);
      env.ledger.data.progress[key] = { started: p?.started ?? env.now() };
      env.ledger.save();
      const v = await fn({ resume });
      env.ledger.data.progress[key] = { done: true, at: env.now(), v: env.maskDeep(v ?? true) };
      env.ledger.save();
      return v;
    },
    check(id, label, ok, evidence) {
      checks.push({ id: `${n}.${id}`, label, ok: !!ok });
      env.out(`  ${ok ? "PASS" : "FAIL"}  ${n}.${id} ${label}${evidence !== undefined && evidence !== "" ? ` — ${evidence}` : ""}`);
      return !!ok;
    },
    /**
     * A check of an intermediate state that a later act of this step changes: on a re-run after that act started, it
     * passed before the act (the step would have stopped otherwise), so it is not asserted again.
     */
    checkBefore(actId, id, label, ok, evidence) {
      if (env.ledger.data.progress[`${n}.${actId}`]) {
        env.out(`  ok    ${n}.${id} ${label} (checked before "${actId}" on an earlier run)`);
        return true;
      }
      return s.check(id, label, ok, evidence);
    },
    opt(id, label, ok, evidence) {
      optional.push({ id: `${n}.${id}`, label, ok: !!ok });
      env.out(`  OPTIONAL ${ok ? "PASS" : "FAIL"}  ${n}.${id} ${label}${evidence ? ` — ${evidence}` : ""}`);
    },
    note(text) {
      env.out(`  note  ${text}`);
    },
    /** Stop the step at the first failed check (checks of one group are all printed first). */
    gate() {
      const bad = checks.filter((c) => !c.ok);
      if (bad.length) throw new StepFailed(`${bad.length} check(s) failed: ${bad.map((c) => c.id).join(", ")}`);
    },
    /** Service passes until `until()` holds (at most env.maxServicePasses); service errors fail the step. */
    async service(label, until) {
      for (let pass = 1; pass <= env.maxServicePasses; pass++) {
        const hb = await env.runService();
        env.out(`  svc   ${label} · pass ${pass}: ${heartbeatLine(hb)}`);
        const errs = hb.errors.filter((e) => !/^warning/i.test(e));
        if (errs.length) {
          s.check(`svc`, `${label}: the service pass ran without errors`, false, errs.join("; "));
          s.gate();
        }
        if (!until || (await until())) return hb;
      }
      env.out(`  note  ${label}: the expected state was not reached after ${env.maxServicePasses} pass(es); the checks below say what is missing`);
      return null;
    },
  };
  return s;
}

// ---------------------------------------------------------------------------------------------- shared readers

async function requestRow(env, id) {
  return id ? env.read.row(FLOW.serviceRequest, id) : null;
}
const requestDone = async (env, id) => (await requestRow(env, id))?.Request_Status === LIST.requestStatus.done;
async function checkRequest(env, s, id, label, n = "req") {
  const r = await requestRow(env, id);
  s.check(n, `Service Request ${label} Done`, r?.Request_Status === LIST.requestStatus.done, r ? `${r.Request_Status || "(waiting)"} · ${r.Result_Note ?? ""}` : "row not found");
}
async function caseMails(env) {
  return env.read.byCase(FLOW.outbox);
}
async function caseAudit(env) {
  return env.read.byCase(FLOW.audit);
}
const newSince = (rows, keys, field) => rows.filter((r) => !keys.includes(r[field]));

/** Every mail of the case went to the dev contact's address, on the audience of its event (one person, two sides). */
function checkMailSides(env, s, rows, me, id = "mails") {
  const wrong = rows.filter((r) => !sameMail(r.To_Emails, me.email) || r.Audience !== (SUPPLIER_EVENTS.has(r.Event_Code) ? "Supplier" : "Internal"));
  s.check(id, `every new mail goes to the dev user's address on the right audience (${rows.length} row(s))`, rows.length > 0 && !wrong.length, wrong.length ? wrong.map((r) => `${evName(r.Event_Code)} ${r.Audience} → ${r.To_Emails}`).join("; ") : rows.map((r) => `${evName(r.Event_Code)}/${r.Audience}`).join(", "));
}
function hasEvents(s, id, rows, events, audience) {
  for (const ev of events) {
    const hit = rows.filter((r) => r.Event_Code === ev && (!audience || r.Audience === audience[ev]));
    s.check(`${id}.${ev}`, `outbox ${evName(ev)}${audience?.[ev] ? ` (${audience[ev]})` : ""}`, hit.length > 0, `${hit.length} row(s)`);
  }
}
function hasActions(s, id, rows, actions) {
  const have = rows.map((r) => r.Action_Code);
  const miss = actions.filter((a) => !have.includes(a));
  s.check(id, `audit rows: ${actions.join(" · ")}`, !miss.length, miss.length ? `missing ${miss.join(", ")}` : `${rows.length} audit row(s) for the case`);
}
async function markAll(env) {
  env.ledger.data.marks = { mail: (await caseMails(env)).map((r) => r.Mail_Key), audit: (await caseAudit(env)).map((r) => r.Event_Key) };
  env.ledger.save();
}

/** What the supplier fills so that no completeness blocker is left (the service's own view); files are justified. */
export function fillPlan(c, cfg, { email } = {}) {
  const blockers = D.completenessBlockers(c, cfg);
  const config = {};
  const answers = {};
  const justifications = {};
  let components;
  const valueFor = (f) => {
    switch (f.type) {
      case "email":
        return email || "";
      case "number":
        return 0.05;
      case "decimal":
        return 0.5;
      case "range":
        return { min: 1, max: 2 };
      case "yesno":
        return false;
      case "single":
        return f.options?.[0]?.value ?? "x";
      case "multi":
        return [f.options?.[0]?.value ?? "x"];
      case "longtext":
        return "Described in the specification of this fictional test material.";
      default:
        return "Test value (ZZT live end-to-end)";
    }
  };
  for (const b of blockers) {
    if (/^SF\d\d$/.test(b.fieldId ?? "")) {
      if (b.fieldId !== "SF11") config[b.fieldId] = PLAIN_CONFIG[b.fieldId] ?? false;
      continue;
    }
    if (!b.fieldId) {
      if (b.sectionId === "K2.1") components = COMPONENTS;
      continue;
    }
    if (D.isSlotKey(b.fieldId)) {
      justifications[b.fieldId] = CANNOT;
      continue;
    }
    const f = D.fieldOf(b.fieldId, c.templateVersion, cfg);
    if (!f || b.fieldId === "FLD-5.1-002" || f.type === "file") {
      justifications[b.fieldId] = CANNOT;
      continue;
    }
    const v = valueFor(f);
    if (v === "" || (f.validate && f.validate(v))) justifications[f.id] = "Not applicable for this fictional test material; see the specification.";
    else answers[f.id] = v;
  }
  return { blockers, config, answers, justifications, components };
}

// ---------------------------------------------------------------------------------------------- step 0: preflight

async function step0(env) {
  const s = stepCtx(env, 0, "Preflight (reads only)");
  // the gates that need no Kissflow call
  const gates = [s.check("live", "CIQ_SYNC_LIVE=1 given", env.liveAllowed, env.liveAllowed ? "" : "refused: the driver writes to the dev sandbox only with CIQ_SYNC_LIVE=1"), s.check("code", `case code ${env.caseCode} matches ${CASE_RE}`, CASE_RE.test(env.caseCode))];
  if (gates.includes(false)) throw new RefusedError("preflight refused before any Kissflow call");
  const L = env.ledger.data;
  if (L.cleanup?.result === "PASS" && L.created.length) {
    env.ledger.restart();
    s.note(`the previous run of ${env.caseCode} was cleaned up completely; its ledger was kept aside and a new one started`);
  }
  const mismatch = env.targetMismatch();
  if (mismatch) throw new RefusedError(mismatch);
  // the ledger is bound to this Kissflow host and account: every later mode refuses another target
  env.ledger.data.target = { ...env.target };
  env.ledger.save();
  const vr = await verifyIds(env.port.paced);
  if (vr.aborted) throw new StopError(`verifyIds: ${vr.aborted}`);
  const found = Object.values(vr.flows).filter((f) => f.found).length;
  const missFields = Object.entries(vr.missingFields).flatMap(([flow, m]) => m.map((x) => `${flow}.${x}`));
  const missTables = Object.keys(vr.missingTables).filter((t) => !OPTIONAL_TABLES.has(t));
  const optTables = Object.keys(vr.missingTables).filter((t) => OPTIONAL_TABLES.has(t));
  const idsWhy = [vr.missingFlows.length ? `missing flows: ${vr.missingFlows.join(", ")}` : "", missFields.length ? `missing fields: ${missFields.slice(0, 8).join(", ")}${missFields.length > 8 ? ", …" : ""}` : "", missTables.length ? `missing child tables/columns: ${missTables.join(", ")}` : "", vr.errors.length ? `read errors: ${vr.errors.join("; ")}` : ""].filter(Boolean);
  s.check("ids", `verifyIds ${found}/${Object.keys(vr.flows).length} flows, every expected field and child table present, no read error`, found === 17 && Object.keys(vr.flows).length === 17 && !idsWhy.length, idsWhy.join(" · "));
  for (const line of verifySummary(vr).split("\n").slice(1)) s.note(`verifyIds:${line.replace(/^\s+/, " ")}`);
  if (optTables.length) s.note(`tolerated: ${optTables.join(", ")} missing (it only serves the OPTIONAL upload's Uploads row, 2.u2)`);
  const rows = await env.configRows();
  const rel = await env.releaseRow();
  s.check("release", `Release row ${PIN.releaseKey} Published (row id, key, Manifest_Hash)`, rel && rel.Config_State === "Published" && !!rel._id && !!rel.Manifest_Hash, rel ? `${rel._id} · ${rel.Config_State} · manifest ${String(rel.Manifest_Hash).slice(0, 12)}…` : `not among ${rows.length} config row(s)`);
  const config = configFromRows(rows);
  s.check("pinned", `${PIN.ruleSetVersion} + ${PIN.templateVersion} is a published pair the service can pin`, !!configPinnedTo(config, PIN.ruleSetVersion, PIN.templateVersion), `${config.releases.length} release row(s)`);
  const me = await env.identify();
  s.check("devuser", "the dev user is readable from the role GET (name and e-mail)", !!me.name && !!me.email, me.email ? `${me.id} · e-mail ‹read at run time›` : `${me.id} not in the RMM role or without e-mail`);
  // nobody but the dev user may get a task, a notification or a mail of this run: sole member of every app role
  const roleIssues = [];
  for (const [label, roleId] of Object.entries(REQUIRED_ROLES)) {
    const members = await env.port.roleMembers(roleId);
    if (!members.some((m) => m._id === env.devUserId)) roleIssues.push(`${label}: the dev user is not a member`);
    const others = members.filter((m) => m._id !== env.devUserId);
    if (others.length) roleIssues.push(`${label}: ${others.length} other member(s) (${others.map((m) => m._id).join(", ")})`);
  }
  for (const [label, roleId] of Object.entries(EXCLUSIVE_ROLES)) {
    const others = (await env.port.roleMembers(roleId)).filter((m) => m._id !== env.devUserId);
    if (others.length) roleIssues.push(`${label}: ${others.length} other member(s) (${others.map((m) => m._id).join(", ")})`);
  }
  s.check("roles", `the dev user is the only member of every role the walk needs (${Object.keys(REQUIRED_ROLES).join(", ")}) and nobody else is in ${Object.keys(EXCLUSIVE_ROLES).join(", ")}`, !roleIssues.length, roleIssues.length ? `${roleIssues.join("; ")} — refused: reviews, tasks and mails would reach other people` : "every task, notification and mail of the run reaches the dev user only");
  const dr = config.settings?.defaultReviewers ?? {};
  const otherReviewers = Object.entries(dr).filter(([, v]) => v && v !== env.devUserId && !sameMail(v, me.email)).map(([d]) => d);
  s.check("reviewers", "the Settings default reviewers are blank or the dev user", !otherReviewers.length, otherReviewers.length ? `another person is the default reviewer of: ${otherReviewers.join(", ")}` : `${Object.keys(dr).length} department(s): blank or the dev user`);
  try {
    const portal = await env.port.roleMembers(ROLE.supplier, PORTAL);
    const others = portal.filter((m) => m._id !== env.devUserId);
    s.check("portalrole", "the portal Supplier role holds the dev user and nobody else", portal.some((m) => m._id === env.devUserId) && !others.length, others.length ? `${others.length} other member(s) (${others.map((m) => m._id).join(", ")})` : portal.length ? "1 member: the dev user" : "the dev user is NOT a member");
  } catch (e) {
    if (isStop(e)) throw e;
    s.note(`portal Supplier role not readable (${e.message}); the CIQP steps are field-assigned (Assigned_Contacts = the dev supplier's single contact) and supplier mails go to the case's contacts only`);
  }
  const sup = me.supplier;
  const cs = sup?.[`Table::${F.supplier.contacts.table}`] ?? [];
  s.check("supplier", `dev supplier ${env.supplierCode} present and active`, !!sup && sup.Supplier_Active !== "No", sup ? `${sup._id} · ${sup.Supplier_Legal_Name} · ${cs.length} contact(s)` : "not found");
  const listedContacts = me.supplierListed?.[`Table::${F.supplier.contacts.table}`];
  s.check("dirlist", "the supplier LIST row carries its Contacts rows (the service's directory reads the contacts from the Form list)", Array.isArray(listedContacts) && listedContacts.some((x) => x.Contacts_Portal_User_Id === env.devUserId), Array.isArray(listedContacts) ? `${listedContacts.length} contact row(s) in the list row` : "the list row has no Table::Contacts: H-01 would find no contact and refuse case.created");
  const c = me.contact;
  s.check("contact", "its single contact is the dev user (portal user id, active, may confirm, e-mail = the role GET e-mail)", cs.length === 1 && !!c && c.Contacts_Active !== "No" && c.Contacts_Can_Confirm === "Yes" && sameMail(c.Contacts_Email, me.email), c ? `${c.Contacts_Key} · portal user ${c.Contacts_Portal_User_Id} · may confirm ${c.Contacts_Can_Confirm} · e-mail ${sameMail(c.Contacts_Email, me.email) ? "matches" : "DIFFERS"}${cs.length !== 1 ? ` · ${cs.length} contacts` : ""}` : "no contact names the dev user");
  s.note("the mail integration (S-3, CIQ Mail – send outbox mail) is switched on by hand and its state is not readable through REST: outbox rows may stay without Sent_Status (then they are retried as #2/#3, all for this case only); if it is on, every mail of this run reaches the dev user's own address");
  s.note("[unverified dependency] the integration's action 2 (Dataform UpdateAnItem: Sent_Status ← Sent) is assumed to keep the outbox row's other fields; if it blanked Case_Code, the mail checks would fail and the cleanup counts those rows as left (never deletes them)");
  // nothing of this case exists yet: Form rows by Case_Code, process items through /myitems (P5), the driver's ledger
  const counts = {};
  for (const form of CASE_FORMS) counts[form] = (await env.read.byCase(form)).length;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const driverMade = env.ledger.data.created.length;
  const scan = await env.scanMyItems();
  const why = [Object.entries(counts).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", "), scan.length ? `process items: ${scan.map((x) => `${x.flow}/${x.id} (${x.status})`).join(", ")}` : "", driverMade ? `ledger: ${driverMade} item(s)` : ""].filter(Boolean);
  s.check("fresh", `no row or process item with Case_Code ${env.caseCode} exists yet, and the driver's ledger lists no item`, !why.length, why.length ? `${why.join("; ")} — run --cleanup or use the next ZZT-E2E number` : `Case Data, Service Request, Audit, Outbox, Scope Run, RMES, Notes: 0 · /myitems of ${CASE_PROCESSES.length} processes: ${scan.read} item(s) modified since ${SCAN_EPOCH.slice(0, 10)} read, none of the case`);
  s.gate();
  return s;
}

// ---------------------------------------------------------------------------------------------- step 1: create the case

async function step1(env) {
  const s = stepCtx(env, 1, "RMM creates the case → service → portal request, C-01");
  const me = await env.identify();
  const rel = await env.releaseRow();
  if (!rel) throw new RefusedError(`the release row ${PIN.releaseKey} is missing (run --step 0)`);
  const caseItemId = await s.act("case", "RMM creates the CIQ Case at Start (supplier, contact, markets EU, pinned release, Case_Test Yes) and submits Start", () =>
    env.wb.createCase({
      Case_Code: env.caseCode,
      Cycle_No: 1,
      Case_Title: `${env.caseCode} live end-to-end test (fictional)`,
      Trade_Name: `ZZT E2E Test Oil ${env.caseCode.slice(-4)} (fictional)`,
      Main_INCI: "Olea Europaea Fruit Oil",
      BDF_Material_No: `${env.caseCode}-RM`,
      Supplier_Code: env.supplierCode,
      Supplier_Legal_Name: me.supplier?.Supplier_Legal_Name ?? env.supplierCode,
      Owner_RMM: { _id: env.devUserId },
      BDF_Contact_Name: me.name,
      BDF_Contact_Email: me.email,
      Supplier_Due_Date: env.dayPlus(30),
      Case_Contacts_JSON: "[]",
      Portal_Contact_Ids: env.devUserId,
      Confirm_Contact_Ids: env.devUserId,
      Supplier_Contact_Emails: me.email,
      Target_Markets_Text: "EU",
      Release_Item_Id: rel._id,
      Release_Key: rel.Release_Key,
      Manifest_Hash: rel.Manifest_Hash,
      Rule_Set_Version: PIN.ruleSetVersion,
      Template_Version: PIN.templateVersion,
      Priority: "Normal",
      Case_Test: "Yes",
    }),
  );
  const req = await s.act("request", "RMM files Service Request case.created", () => env.wb.request("case.created", { caseItemId }, caseItemId));
  await s.service("case.created", () => requestDone(env, req.id));
  await checkRequest(env, s, req.id, "case.created", "1");
  const listedCaseData = await env.read.byCase(FLOW.caseData);
  const v = await env.view();
  s.check("2", "one CIQ Case Data row for the case", listedCaseData.length === 1 && !!v, v ? `${v.row._id}` : `${listedCaseData.length} row(s)`);
  s.gate();
  const reqItem = await env.read.item(FLOW.request, v.L.items.request);
  s.check("3", `CIQP Request at "${STEP.request.fill.name}" assigned to the dev user`, stepName(reqItem) === STEP.request.fill.name && ids(reqItem?.Assigned_Contacts).join() === env.devUserId, reqItem ? `${reqItem._id} · ${stepName(reqItem)} · assigned ${ids(reqItem.Assigned_Contacts).join(",")}` : "no request item");
  const bundle = J(reqItem?.Config_Bundle_JSON, null);
  s.check("4", "Config_Bundle_JSON is ciq-bundle/1 for the pinned release, and Config_Bundle_Hash matches it", bundle?.format === "ciq-bundle/1" && bundle?.release?.label === `${PIN.ruleSetVersion} + ${PIN.templateVersion}` && reqItem.Config_Bundle_Hash === bundleHash(bundle), bundle ? `${bundle.format} · ${bundle.release?.label} · ${String(reqItem.Config_Bundle_JSON).length} chars · hash ${reqItem.Config_Bundle_Hash === bundleHash(bundle) ? "matches" : "DIFFERS"}` : "no bundle");
  const bdf = J(reqItem?.BDF_Set_JSON, null);
  s.check("5", "BDF_Set_JSON carries the BDF-set values (FLD-GEN-003 = the supplier's DUNS)", !!bdf && String(bdf["FLD-GEN-003"] ?? "") === String(me.supplier?.DUNS_Number ?? ""), bdf ? `${Object.keys(bdf).length} key(s)` : "missing");
  const ci = await env.read.item(FLOW.caseProc, caseItemId);
  s.check("6", `CIQ Case at "${STEP.caseProc.waitingSupplier.name}", phase "${LIST.casePhase["supplier-input"]}", linked to the request and the Case Data row`, stepName(ci) === STEP.caseProc.waitingSupplier.name && ci?.Case_Phase === LIST.casePhase["supplier-input"] && ci?.Portal_Request_Item_Id === reqItem?._id && ci?.Case_Data_Item_Id === v.row._id, ci ? `${ci._id} · ${stepName(ci)} · ${ci.Case_Phase}` : "case item not found");
  const mails = await caseMails(env);
  hasEvents(s, "7", mails, ["invitation"], { invitation: "Supplier" });
  checkMailSides(env, s, mails, me, "8");
  hasActions(s, "9", await caseAudit(env), ["Created case", "Derived scope", "Invited supplier contacts"]);
  s.gate();
  await markAll(env);
  return s;
}

// ---------------------------------------------------------------------------------------------- step 2: Part 1 filling

async function step2(env) {
  const s = stepCtx(env, 2, "Supplier fills in the CIQ (Part 1) → service mirrors it, no mail");
  const me = await env.identify();
  let v = await env.view();
  const reqId = v?.L.items.request;
  if (!reqId) throw new RefusedError("no portal request for the case yet (run step 1)");
  const saved = { config: {}, answers: {}, justifications: {} };
  let rev = await s.act("config", "supplier saves the metadata answers (PLAIN_CONFIG, admin PUT as the portal UI's save)", () => env.supplier.save(reqId, { config: PLAIN_CONFIG }));
  Object.assign(saved.config, PLAIN_CONFIG);
  await s.service("metadata save", async () => (await env.view())?.L.answersRev >= rev);
  // the one optional upload attempt (never fails the run)
  const up = await s.act("upload", "OPTIONAL: attach one file to CIQP_Request_A00.Supplier_Files and add its Uploads row through the admin route", ({ resume }) => env.supplier.tryUpload(reqId, { resume }));
  env.ledger.data.optionalUpload = up;
  env.ledger.save();
  s.opt("u1", "attach to Supplier_Files (admin attachment route)", up.attach === "PASS", up.attId ?? up.detail);
  s.opt("u2", "Uploads child row via the admin PUT (unproven route)", up.row === "PASS", up.row === "PASS" ? up.uploadId : up.detail);
  let pendingUpload = up.row === "PASS" && !(v?.L.uploads ?? {})[up.uploadId];
  const cfg = await env.cfg();
  for (let round = 1; round <= 6; round++) {
    v = await env.view();
    const f = fillPlan(v.c, cfg, me);
    if (!f.blockers.length && !pendingUpload) break;
    env.out(`  act   round ${round}: ${f.blockers.length} blocker(s) → ${Object.keys(f.answers).length} answer(s), ${Object.keys(f.justifications).length} justification(s)${f.components ? ", the K2.1 composition" : ""}${Object.keys(f.config).length ? `, ${Object.keys(f.config).length} metadata answer(s)` : ""}${pendingUpload ? ", the optional upload's row" : ""}`);
    rev = await env.supplier.save(reqId, { config: f.config, answers: f.answers, justifications: f.justifications, ...(f.components ? { components: f.components } : {}) });
    Object.assign(saved.config, f.config);
    Object.assign(saved.answers, f.answers);
    Object.assign(saved.justifications, f.justifications);
    pendingUpload = false;
    await s.service(`save rev ${rev}`, async () => (await env.view())?.L.answersRev >= rev);
  }
  v = await env.view();
  const left = D.completenessBlockers(v.c, cfg);
  s.check("1", "no completeness blocker is left (the service's own view)", !left.length, left.length ? left.slice(0, 5).map((b) => b.label).join("; ") : `answers ${Object.keys(v.c.answers).length}, justifications ${Object.keys(v.c.justifications).length}, components ${v.c.components.length}`);
  s.check("2", "Case Data mirrors the metadata answers (SF01 vegetable), attributed to the dev user's Kissflow id", JSON.stringify(v.c.config.SF01) === JSON.stringify(["vegetable"]) && v.c.answeredBy?.SF01?.by === env.devUserId, `SF01 ${JSON.stringify(v.c.config.SF01)} by ${v.c.answeredBy?.SF01?.by}`);
  const expected = D.deriveScope({ ...v.c.config, SF11: ["EU"] }, PIN.ruleSetVersion, PIN.templateVersion, cfg);
  const scopeOk = JSON.stringify(v.c.scope.map((x) => [x.sectionId, x.applicability])) === JSON.stringify(expected.map((x) => [x.sectionId, x.applicability]));
  s.check("3", "Scope_JSON = the prototype's deriveScope over the same answers", v.c.scope.length > 0 && scopeOk, `${v.c.scope.length} section(s), ${v.c.scope.filter((x) => x.applicability === "mandatory").length} mandatory`);
  const notMirrored = Object.keys(saved.answers).filter((k) => JSON.stringify(v.c.answers[k]) !== JSON.stringify(saved.answers[k]));
  s.check("4", "Answers_JSON mirrors every answer saved", !notMirrored.length, notMirrored.length ? `not mirrored: ${notMirrored.join(", ")}` : `${Object.keys(saved.answers).length} answer(s)`);
  const jMiss = Object.keys(saved.justifications).filter((k) => !v.c.justifications[k]);
  s.check("5", "Justifications_JSON mirrors every justification saved (file questions and requested documents: Cannot provide)", !jMiss.length, jMiss.length ? `not mirrored: ${jMiss.join(", ")}` : `${Object.keys(saved.justifications).length} justification(s)`);
  const marks = env.ledger.data.marks;
  const fresh = newSince(await caseMails(env), marks.mail, "Mail_Key").filter((r) => !isRetry(r));
  s.check("6", "no mail in Part 1", !fresh.length, fresh.length ? fresh.map((r) => evName(r.Event_Code)).join(", ") : "0 new outbox row(s) (retries of earlier rows not counted)");
  const audit = newSince(await caseAudit(env), marks.audit, "Event_Key");
  const bad = audit.filter((r) => /not applied|Refused/.test(r.Action_Code ?? ""));
  s.check("7", "no supplier change was refused", !bad.length, bad.length ? bad.map((r) => `${r.Action_Code}: ${r.New_Value_Text ?? r.Event_Reason ?? ""}`).join("; ") : `${audit.length} new audit row(s)`);
  if (up.row === "PASS") {
    const docs = v.row[`Table::${F.caseData.documents.table}`] ?? [];
    const d = docs.find((x) => x.Doc_Key === up.attId);
    s.opt("u3", "the optional upload is mirrored as a document (Case Data Documents, Doc_Key = the attachment id)", !!d, d ? `${d.Doc_File_Name} · copy ${d.Doc_Attachment_Id ?? "none"}` : `${docs.length} document row(s)`);
    const ci = await env.read.item(FLOW.caseProc, env.ledger.data.caseItemId);
    s.opt("u4", "…and copied to CIQ_Case_A00.Supplier_Files (S-2)", !!d?.Doc_Attachment_Id && (ci?.Supplier_Files ?? []).some((a) => a.id === d.Doc_Attachment_Id), `${(ci?.Supplier_Files ?? []).length} file(s) on the case`);
  }
  s.gate();
  await markAll(env);
  return s;
}

// ---------------------------------------------------------------------------------------------- step 3: completeness

async function step3(env) {
  const s = stepCtx(env, 3, "Completeness → reviews, RMES rows, C-02/C-03, scope run");
  const me = await env.identify();
  let v = await env.view();
  const reqId = v.L.items.request;
  await s.act("confirm", `supplier writes Completeness_* and submits "${STEP.request.fill.name}"`, ({ resume }) => env.supplier.confirmCompleteness(reqId, { resume }));
  await s.service("completeness", async () => (await env.view())?.c.phase === "review");
  v = await env.view();
  s.check("1", "the case is in review", v.c.phase === "review", `phase ${v.c.phase}`);
  s.gate();
  const depts = v.c.reviews.map((r) => r.dept);
  // the lead departments of the in-scope sections (the prototype's departmentsForScope, with the configured ownership)
  const { ownership } = configFromRows(await env.configRows());
  const leads = new Set(v.c.scope.filter((x) => x.applicability !== "na").map((x) => ownership[x.sectionId]?.lead ?? D.sectionOf(x.sectionId)?.lead));
  const want = ["RMM", ...D.REVIEW_DEPTS.filter((d) => leads.has(d))];
  s.check("2", "reviews for RMM and every lead department of the scope, each assigned to the dev user", JSON.stringify([...depts].sort()) === JSON.stringify([...want].sort()) && v.c.reviews.every((r) => r.assigneeId === env.devUserId), `${v.c.reviews.map((r) => `${r.dept}:${r.assigneeId === env.devUserId ? "dev" : r.assigneeId}`).join(", ")}${JSON.stringify([...depts].sort()) === JSON.stringify([...want].sort()) ? "" : ` · expected ${want.join(", ")}`}`);
  const wrong = [];
  for (const r of v.c.reviews) {
    const item = await env.read.item(FLOW.review, v.L.items[`review:${r.dept}:1`]);
    if (!item || item._status !== "InProgress" || stepName(item) !== STEP.review.byDept[r.dept] || item.Review_Key !== `${env.caseCode}-${r.dept}-1` || item.Activation_Kind !== "Completeness" || idOf(item.Assignee_User) !== env.devUserId) wrong.push(`${r.dept}: ${item ? `${item._status} · ${stepName(item)} · ${item.Review_Key} · ${item.Activation_Kind}` : "no item"}`);
  }
  s.check("3", "each CIQ Review item sits at its department's step (Review_Key <case>-<dept>-1, Activation_Kind Completeness)", !wrong.length, wrong.join("; ") || depts.map((d) => STEP.review.byDept[d]).join(", "));
  const saf = v.rmesRows.SAF;
  const reg = v.rmesRows.REG;
  s.check("4", "RMES rows for SAF and REG (with their criteria)", !!saf && !!reg && saf.Case_Code === env.caseCode && reg.Case_Code === env.caseCode && (saf[`Table::${F.rmes.criteria.SAF}`] ?? []).length > 0 && (reg[`Table::${F.rmes.criteria.REG}`] ?? []).length > 0, `SAF ${saf?._id ?? "-"} (${(saf?.[`Table::${F.rmes.criteria.SAF}`] ?? []).length} criteria) · REG ${reg?._id ?? "-"} (${(reg?.[`Table::${F.rmes.criteria.REG}`] ?? []).length} criteria)`);
  const ci = await env.read.item(FLOW.caseProc, env.ledger.data.caseItemId);
  s.check("5", `CIQ Case at "${STEP.caseProc.review.name}" with the completeness confirmation`, stepName(ci) === STEP.caseProc.review.name && ci?.Completeness_Confirm === "Confirmed" && sameMail(ci?.Completeness_By_Email, me.email), `${stepName(ci)} · ${ci?.Case_Phase} · by ${sameMail(ci?.Completeness_By_Email, me.email) ? "the dev contact" : ci?.Completeness_By_Email}`);
  const reqItem = await env.read.item(FLOW.request, reqId);
  s.check("6", `CIQP Request at "${STEP.request.keep.name}", label "${LIST.portalPhaseLabel.review}"`, stepName(reqItem) === STEP.request.keep.name && reqItem?.Case_Phase_Label === LIST.portalPhaseLabel.review, `${stepName(reqItem)} · ${reqItem?.Case_Phase_Label}`);
  const fresh = newSince(await caseMails(env), env.ledger.data.marks.mail, "Mail_Key").filter((r) => !isRetry(r));
  hasEvents(s, "7", fresh, ["review-assigned", "informed"], { "review-assigned": "Internal", informed: "Internal" });
  checkMailSides(env, s, fresh, me, "8");
  const runs = await env.read.byCase(FLOW.scopeRun);
  s.check("9", "a CIQ Scope Run row with Scope_Trigger Completeness", runs.some((r) => r.Scope_Trigger === "Completeness"), runs.map((r) => `${r.Run_Key}:${r.Scope_Trigger}`).join(", ") || "none");
  hasActions(s, "10", await caseAudit(env), ["Confirmed completeness", "Activated reviews"]);
  s.gate();
  await markAll(env);
  return s;
}

// ---------------------------------------------------------------------------------------------- step 4: open point rounds

async function step4(env) {
  const s = stepCtx(env, 4, "Safety raises a point → two query rounds → Safety accepts");
  const me = await env.identify();
  let v = await env.view();
  const k22 = v.c.scope.find((x) => x.sectionId === "K2.2" && x.applicability !== "na");
  const first = v.c.scope.find((x) => x.applicability !== "na");
  const ref = k22 ? { sectionId: "K2.2", fieldId: "FLD-A14-101", label: "K2.2 › Arsenic (As) content" } : { sectionId: first.sectionId, label: first.sectionId };
  const due = `${env.dayPlus(45)}T00:00:00Z`;
  const raise = await s.act("raise", `Safety files op.raise on ${ref.label}`, () => env.wb.request("op.raise", { dept: "SAF", kind: "query", ref, question: "Please confirm the arsenic value with the batch analysis (ZZT live end-to-end test).", justification: "Needed for the heavy-metal evaluation", dueDate: due }));
  await s.service("op.raise", () => requestDone(env, raise.id));
  await checkRequest(env, s, raise.id, "op.raise", "1");
  v = await env.view();
  const op = v.c.openPoints[0];
  s.check("2", "the open point is in the case", !!op, op ? `${op.id} · ${op.status}` : "none");
  s.gate();
  const opItemId = v.L.items[`op:${op.id}`];
  let opItem = await env.read.item(FLOW.openPoint, opItemId);
  s.checkBefore("accept-step", "3", `CIQ Open Point at "${STEP.openPoint.byDept.SAF}", Raiser_Assignee = the dev user, Raised_By_User = the dev user`, stepName(opItem) === STEP.openPoint.byDept.SAF && ids(opItem?.Raiser_Assignee).join() === env.devUserId && idOf(opItem?.Raised_By_User) === env.devUserId, opItem ? `${opItem._id} · ${stepName(opItem)} · Raiser_Assignee ${ids(opItem.Raiser_Assignee).join(",") || "(none)"}` : "no item");
  let q1 = await env.read.item(FLOW.query, v.L.items[`query:${op.id}:r1`]);
  s.checkBefore("answer1", "4", `CIQP Query round 1 at "${STEP.query.respond.name}" assigned to the dev user`, stepName(q1) === STEP.query.respond.name && ids(q1?.Assigned_Contacts).join() === env.devUserId && q1?.Query_Key === `${op.id}-R1`, q1 ? `${q1._id} · ${q1.Query_Key} · ${stepName(q1)}` : "no query");
  const safReview = await env.read.item(FLOW.review, v.L.items["review:SAF:1"]);
  s.checkBefore("answer1", "5", "the Safety review waits for the supplier (Track_Status, Open_Count 1)", safReview?.Track_Status === LIST.trackStatus["waiting-supplier"] && Number(safReview?.Open_Count) === 1, `${safReview?.Track_Status} · open ${safReview?.Open_Count}`);
  let fresh = newSince(await caseMails(env), env.ledger.data.marks.mail, "Mail_Key").filter((r) => !isRetry(r));
  hasEvents(s, "6", fresh, ["op-raised"], { "op-raised": "Supplier" });
  s.gate();

  // round 1 answer
  await s.act("answer1", `supplier answers round 1 and submits "${STEP.query.respond.name}"`, ({ resume }) => env.supplier.answer(q1._id, { text: "As is 0.05 mg/kg in batch ZZT-2408 (fictional).", resume }));
  await s.service("answer round 1", async () => (await env.view())?.c.openPoints[0]?.thread?.some((m) => m.action === "answered"));
  v = await env.view();
  opItem = await env.read.item(FLOW.openPoint, opItemId);
  q1 = await env.read.item(FLOW.query, q1._id);
  s.checkBefore("return", "7", "H-05: the answer is on the point (thread raised → answered, OP_Progress In progress), query round 1 Completed", v.c.openPoints[0].thread.map((m) => m.action).join(",") === "raised,answered" && opItem?.OP_Progress === LIST.opProgress["in-progress"] && q1?._status === "Completed", `${v.c.openPoints[0].thread.map((m) => `${m.side}:${m.action}`).join(" → ")} · ${opItem?.OP_Progress} · query ${q1?._status}`);
  s.check("8", "the answer is attributed to the dev user's supplier side (Supplier_Responsible_Email = the contact)", v.c.openPoints[0].thread[1]?.by === env.devUserId && sameMail(opItem?.Supplier_Responsible_Email, me.email), `by ${v.c.openPoints[0].thread[1]?.by}`);
  fresh = newSince(await caseMails(env), env.ledger.data.marks.mail, "Mail_Key").filter((r) => !isRetry(r));
  hasEvents(s, "9", fresh, ["op-answered"], { "op-answered": "Internal" });
  s.gate();

  // Safety returns the answer → round 2
  const ret = await s.act("return", "Safety files op.returned (round 2)", () => env.wb.request("op.returned", { opId: op.id, text: "Please attach the full batch analysis report." }, op.id));
  await s.service("op.returned", () => requestDone(env, ret.id));
  await checkRequest(env, s, ret.id, "op.returned", "10");
  v = await env.view();
  const q2 = await env.read.item(FLOW.query, v.L.items[`query:${op.id}:r2`]);
  opItem = await env.read.item(FLOW.openPoint, opItemId);
  s.checkBefore("answer2", "11", `CIQP Query round 2 at "${STEP.query.respond.name}" (Previous_Rounds_JSON), Round_No 2 on the point`, q2?._status === "InProgress" && stepName(q2) === STEP.query.respond.name && q2?.Query_Key === `${op.id}-R2` && J(q2?.Previous_Rounds_JSON, []).length >= 2 && Number(opItem?.Round_No) === 2, q2 ? `${q2._id} · ${q2.Query_Key} · ${stepName(q2)} · previous ${J(q2.Previous_Rounds_JSON, []).length}` : "no round-2 query");
  fresh = newSince(await caseMails(env), env.ledger.data.marks.mail, "Mail_Key").filter((r) => !isRetry(r));
  hasEvents(s, "12", fresh, ["op-returned"], { "op-returned": "Supplier" });
  s.gate();

  // round 2 answer
  await s.act("answer2", "supplier answers round 2 (Cannot provide the report: justification)", ({ resume }) => env.supplier.answer(q2._id, { kind: LIST.responseKind.answer, text: "The full report cannot be provided for this fictional test material; the value is confirmed.", resume }));
  await s.service("answer round 2", async () => (await env.view())?.c.openPoints[0]?.thread?.filter((m) => m.action === "answered").length >= 2);
  v = await env.view();
  s.checkBefore("accept-step", "13", "round 2 answered (thread raised → answered → returned → answered)", v.c.openPoints[0].thread.map((m) => m.action).join(",") === "raised,answered,returned,answered", v.c.openPoints[0].thread.map((m) => m.action).join(" → "));
  s.gate();

  // Safety accepts: own step (OP_Outcome) + submit, then op.accepted
  await s.act("accept-step", `Safety writes OP_Outcome Accepted on "${STEP.openPoint.byDept.SAF}" and submits it`, ({ resume }) => env.wb.actAtStep(FLOW.openPoint, opItemId, { OP_Outcome: LIST.opOutcome.accepted }, { expectStep: STEP.openPoint.byDept.SAF, resume }));
  const acc = await s.act("accept", "Safety files op.accepted", () => env.wb.request("op.accepted", { opId: op.id }, op.id));
  await s.service("op.accepted", () => requestDone(env, acc.id));
  await checkRequest(env, s, acc.id, "op.accepted", "14");
  v = await env.view();
  opItem = await env.read.item(FLOW.openPoint, opItemId);
  s.check("15", "the point is accepted and its item Completed", opItem?._status === "Completed" && v.c.openPoints[0].status === "closed" && v.c.openPoints[0].outcome === "accepted", `${opItem?._status} · ${v.c.openPoints[0].status}/${v.c.openPoints[0].outcome}`);
  const qs = [];
  const mapped = new Set();
  for (const [k, id] of Object.entries(v.L.items)) {
    if (!k.startsWith(`query:${op.id}:`)) continue;
    mapped.add(id);
    qs.push(await env.read.item(FLOW.query, id));
  }
  // every other CIQP Query the service created in this run (the driver's ledger, onCreated): an orphan of a 429 between a
  // create and the service's checkpoint (README gap) would still sit at "Supplier: respond" in the supplier's queue
  const orphans = [];
  for (const c of env.ledger.data.created) {
    if (c.kind !== "process" || c.flow !== FLOW.query || mapped.has(c.id)) continue;
    const q = await env.read.item(FLOW.query, c.id);
    if (q && q.Case_Code === env.caseCode && (q._status === "InProgress" || q._status === "Draft")) orphans.push(q);
  }
  s.check("16", "both query rounds are handled and no other CIQP Query of the run is live (the item map + every query the service created)", qs.length === 2 && qs.every((q) => q && q._status !== "InProgress") && !orphans.length, [qs.map((q) => `${q?.Query_Key}:${q?._status}`).join(", "), orphans.length ? `LIVE ORPHAN(S) outside the service's item map: ${orphans.map((q) => `${q._id} ${q.Query_Key ?? ""} ${q._status} at "${stepName(q) ?? "-"}"`).join(", ")} (README gap: a 429 between a create and its checkpoint; --cleanup removes it)` : ""].filter(Boolean).join(" · "));
  const safNow = await env.read.item(FLOW.review, v.L.items["review:SAF:1"]);
  s.check("17", "the Safety review has no open point any more (Open_Count 0)", Number(safNow?.Open_Count) === 0, `${safNow?.Track_Status} · open ${safNow?.Open_Count}`);
  const hist = J((await env.read.item(FLOW.request, v.L.items.request))?.Questions_History_JSON, []);
  s.check("18", "the supplier's question history shows the point Accepted", hist[0]?.status === "Accepted", `${hist.length} point(s) · ${hist[0]?.status}`);
  const all = newSince(await caseMails(env), env.ledger.data.marks.mail, "Mail_Key").filter((r) => !isRetry(r));
  hasEvents(s, "19", all, ["op-raised", "op-answered", "op-returned", "op-accepted"], { "op-raised": "Supplier", "op-answered": "Internal", "op-returned": "Supplier", "op-accepted": "Supplier" });
  checkMailSides(env, s, all, me, "20");
  hasActions(s, "21", await caseAudit(env), ["Raised query", "Answered query", "Returned answer to supplier", "Accepted answer"]);
  s.gate();
  await markAll(env);
  return s;
}

// ---------------------------------------------------------------------------------------------- step 5: reviews complete

async function step5(env) {
  const s = stepCtx(env, 5, "Every review completes (RMES for SAF/REG) → final release requested, C-11");
  const me = await env.identify();
  let v = await env.view();
  // RMES: every open criterion recorded on its row, then rmes.saved (one pass for both)
  for (const dept of ["SAF", "REG"]) {
    if (!v.c.reviews.some((r) => r.dept === dept)) continue;
    const rowId = v.L.items[`rmes:${dept}`];
    const open = (v.rmesRows[dept]?.[`Table::${F.rmes.criteria[dept]}`] ?? []).filter((x) => !x.Criteria_Result).map((x) => x.Criteria_Code);
    const results = open.map((criterionId) => ({ criterionId, result: "available", comment: "" }));
    await s.act(`rmes-${dept}`, `${dept} records ${results.length} RMES result(s) on its RMES row and files rmes.saved`, async () => {
      if (results.length) await env.wb.updateRmes(dept, rowId, results);
      const r = await env.wb.request("rmes.saved", { dept, results }, rowId);
      return { request: r };
    });
  }
  const rmesReqs = ["SAF", "REG"].map((d) => env.ledger.data.progress[`5.rmes-${d}`]?.v?.request).filter(Boolean);
  // sequential on purpose: the shared pacing gate serialises calls only when they are not issued in parallel
  await s.service("rmes.saved", async () => {
    for (const r of rmesReqs) if (!(await requestDone(env, r.id))) return false;
    return true;
  });
  for (const r of rmesReqs) await checkRequest(env, s, r.id, "rmes.saved", `1-${r.key.split(":").at(-1)}`);
  v = await env.view();
  const openCrit = v.c.rmes?.criteria.filter((x) => !x.result) ?? [];
  s.check("2", "every RMES criterion has a result", !!v.c.rmes && !openCrit.length, openCrit.length ? openCrit.map((x) => x.id).join(", ") : `${v.c.rmes?.criteria.length ?? 0} criteria`);
  s.gate();
  // each department writes its own CIQ Review step, submits it and files review.completed (one pass for all)
  for (const dept of REVIEW_ORDER) {
    const t = v.c.reviews.find((r) => r.dept === dept);
    if (!t || t.status === "completed") continue;
    const itemId = v.L.items[`review:${dept}:${t.round ?? 1}`] ?? t.itemId;
    await s.act(`complete-${dept}`, `${dept} confirms its review (own step fields${dept === "SAF" || dept === "REG" ? " + RMES_Decision Approved" : ""}), submits "${STEP.review.byDept[dept]}" and files review.completed`, async ({ resume }) => {
      await env.wb.actAtStep(FLOW.review, itemId, { Review_Confirm: "Confirmed", Completed_By: { _id: env.devUserId }, Completed_By_Name: me.name, Completed_By_Email: me.email, Completed_At: env.now(), ...(dept === "SAF" || dept === "REG" ? { RMES_Decision: LIST.decision.approved } : {}) }, { expectStep: STEP.review.byDept[dept], resume });
      return { request: await env.wb.request("review.completed", { dept }, itemId) };
    });
  }
  const done = REVIEW_ORDER.map((d) => env.ledger.data.progress[`5.complete-${d}`]?.v?.request).filter(Boolean);
  await s.service("review.completed", async () => (await env.view())?.c.phase === "final-release");
  for (const r of done) await checkRequest(env, s, r.id, `review.completed`, `3-${r.key.split(":").at(-1)}`);
  v = await env.view();
  s.check("4", "every review is completed and the case awaits the final release", v.c.phase === "final-release" && v.c.reviews.every((r) => r.status === "completed"), `${v.c.phase} · ${v.c.reviews.map((r) => `${r.dept}:${r.status}`).join(", ")}`);
  s.gate();
  const rel = await env.read.item(FLOW.release, v.L.items.releaseCurrent);
  s.check("5", `CIQP Final Release at "${STEP.release.release.name}" assigned to the dev user`, rel?._status === "InProgress" && stepName(rel) === STEP.release.release.name && ids(rel?.Assigned_Contacts).join() === env.devUserId && rel?.Confirmation_Key === `${env.caseCode}-FR-1`, rel ? `${rel._id} · ${rel.Confirmation_Key} · ${stepName(rel)}` : "no release item");
  const ci = await env.read.item(FLOW.caseProc, env.ledger.data.caseItemId);
  s.check("6", `CIQ Case phase "${LIST.casePhase["final-release"]}" (still at "${STEP.caseProc.review.name}")`, ci?.Case_Phase === LIST.casePhase["final-release"] && stepName(ci) === STEP.caseProc.review.name && ci?.Portal_Release_Item_Id === rel?._id, `${ci?.Case_Phase} · ${stepName(ci)}`);
  const reqItem = await env.read.item(FLOW.request, v.L.items.request);
  // Thomas, 15 Oct: the questionnaire is locked while the final release is requested
  s.check("7", `CIQP Request label "${LIST.portalPhaseLabel["final-release"]}" and Request_Locked Yes`, reqItem?.Case_Phase_Label === LIST.portalPhaseLabel["final-release"] && reqItem?.Request_Locked === "Yes", `${reqItem?.Case_Phase_Label} · ${reqItem?.Request_Locked}`);
  const fresh = newSince(await caseMails(env), env.ledger.data.marks.mail, "Mail_Key").filter((r) => !isRetry(r));
  hasEvents(s, "8", fresh, ["release-requested"], { "release-requested": "Supplier" });
  checkMailSides(env, s, fresh, me, "9");
  hasActions(s, "10", await caseAudit(env), ["All reviews completed", ...v.c.reviews.map((r) => `Completed ${D.DEPT_SHORT[r.dept]} review`)]);
  s.gate();
  await markAll(env);
  return s;
}

// ---------------------------------------------------------------------------------------------- step 6: final release

async function step6(env) {
  const s = stepCtx(env, 6, "Supplier releases → final document, seal, PDF, case completed");
  const me = await env.identify();
  let v = await env.view();
  const relId = v.L.items.releaseCurrent;
  await s.act("release", `supplier writes the release confirmation and submits "${STEP.release.release.name}"`, ({ resume }) => env.supplier.release(relId, { resume }));
  await s.service("final release", async () => (await env.view())?.c.phase === "completed");
  v = await env.view();
  s.check("1", "the case is completed", v.c.phase === "completed", v.c.phase);
  s.gate();
  const doc = J(v.row.Final_Document_JSON, null);
  s.check("2", "Final_Document_JSON + Final_Document_Hash on Case Data; the seal is the SHA-256 of the canonical JSON", !!doc && v.row.Final_Document_Hash === sealOf(doc), doc ? `seal ${String(v.row.Final_Document_Hash).slice(0, 16)}…` : "no document");
  s.check("3", "the prototype's own fingerprint check holds and the document carries no RMES", !!doc && D.verifyFinalDocument(doc) && !JSON.stringify(doc).includes("RMES") && (doc.threads ?? []).length >= 1, doc ? `${(doc.threads ?? []).length} thread(s)` : "");
  const ci = await env.read.item(FLOW.caseProc, env.ledger.data.caseItemId);
  s.check("4", "CIQ Case Completed (both service-held steps submitted), seal on the case", ci?._status === "Completed" && ci?.Final_Document_Hash === v.row.Final_Document_Hash && sameMail(ci?.Final_Release_By_Email, me.email), `${ci?._status} · seal ${ci?.Final_Document_Hash === v.row.Final_Document_Hash ? "matches" : "DIFFERS"}`);
  const pdfs = ci?.Final_PDF ?? [];
  s.check("5", "the final PDF is attached to CIQ_Case_A00.Final_PDF", pdfs.length === 1 && pdfs[0].name === `${env.caseCode}-final-document.pdf`, pdfs.map((p) => `${p.name} (${p.id})`).join(", ") || "none");
  let head = "";
  let carries = false;
  if (pdfs[0]) {
    try {
      const f = await env.port.downloadFile(FLOW.caseProc, ci._id, F.caseProc.finalPdf, pdfs[0].id);
      head = Buffer.from(f.bytes).subarray(0, 5).toString("latin1");
      carries = Buffer.from(f.bytes).toString("latin1").includes(v.row.Final_Document_Hash);
    } catch (e) {
      if (isStop(e)) throw e;
      head = `download failed: ${e.message}`;
    }
  }
  s.check("6", "the PDF downloads (302 → signed URL) and starts with %PDF and carries the seal", head === "%PDF-" && carries, head || "not downloaded");
  const reqItem = await env.read.item(FLOW.request, v.L.items.request);
  s.check("7", `CIQP Request locked: Request_Locked Yes, label "${LIST.portalPhaseLabel.completed}", at "${STEP.request.keep.name}"`, reqItem?.Request_Locked === "Yes" && reqItem?.Case_Phase_Label === LIST.portalPhaseLabel.completed && stepName(reqItem) === STEP.request.keep.name, `${reqItem?.Request_Locked} · ${reqItem?.Case_Phase_Label} · ${stepName(reqItem)}`);
  const rel = await env.read.item(FLOW.release, relId);
  s.check("8", "CIQP Final Release Completed", rel?._status === "Completed", rel?._status);
  const fresh = newSince(await caseMails(env), env.ledger.data.marks.mail, "Mail_Key").filter((r) => !isRetry(r));
  hasEvents(s, "9", fresh, ["release-receipt", "final-document"], { "release-receipt": "Supplier", "final-document": "Internal" });
  checkMailSides(env, s, fresh, me, "10");
  hasActions(s, "11", await caseAudit(env), ["Gave final release", "Case completed", "Generated final document", "Final PDF"]);
  s.gate();
  await markAll(env);
  return s;
}

// ---------------------------------------------------------------------------------------------- step 7: change report

async function step7(env) {
  const s = stepCtx(env, 7, "Supplier reports a change → change report row, C-17");
  const me = await env.identify();
  let v = await env.view();
  const text = `We changed the production site (ZZT live end-to-end test, ${env.caseCode}).`;
  await s.act("report", "supplier writes Change_Report_Text / _Rev + 1 / _By_Email / _At on the request", () => env.supplier.reportChange(v.L.items.request, text));
  env.forceClosedPoll();
  await s.service("change report", async () => {
    const x = await env.view();
    return (x?.row?.[`Table::${F.caseData.changeReports.table}`] ?? []).some((r) => r.CR_Text === text);
  });
  v = await env.view();
  const crs = (v.row[`Table::${F.caseData.changeReports.table}`] ?? []).filter((r) => r.CR_Text === text);
  s.check("1", "Case Data has the change report child row (CR key, text, the dev contact)", crs.length === 1 && /^CR-\d{4}$/.test(crs[0].CR_Key ?? "") && sameMail(crs[0].CR_By_Email, me.email), crs.map((r) => `${r.CR_Key} · by ${sameMail(r.CR_By_Email, me.email) ? "the dev contact" : r.CR_By_Email}`).join(", ") || "none");
  const receipts = J((await env.read.item(FLOW.request, v.L.items.request))?.Change_Reports_JSON, []);
  s.check("2", "the receipt is on the CIQP Request (Change_Reports_JSON)", receipts.some((r) => r.text === text), `${receipts.length} receipt(s)`);
  const fresh = newSince(await caseMails(env), env.ledger.data.marks.mail, "Mail_Key").filter((r) => !isRetry(r));
  hasEvents(s, "3", fresh, ["change-reported"], { "change-reported": "Internal" });
  checkMailSides(env, s, fresh, me, "4");
  hasActions(s, "5", await caseAudit(env), ["Reported a change after release"]);
  s.gate();
  await markAll(env);
  return s;
}

export const STEPS = [
  { n: 0, title: "preflight", fn: step0 },
  { n: 1, title: "create the case", fn: step1 },
  { n: 2, title: "supplier fills in", fn: step2 },
  { n: 3, title: "completeness", fn: step3 },
  { n: 4, title: "open point rounds", fn: step4 },
  { n: 5, title: "reviews complete", fn: step5 },
  { n: 6, title: "final release", fn: step6 },
  { n: 7, title: "change report", fn: step7 },
];

// ---------------------------------------------------------------------------------------------- running steps

/**
 * Runs one step. Every earlier step must have passed (its result is in the ledger), unless `force` (live debugging; the
 * preflight must still have passed); a step that passed already is run again only as a re-check (its acts are skipped).
 * Returns { n, result: "PASS"|"FAIL"|"REFUSED"|"STOPPED", ... }.
 */
export async function runStep(env, n, { force = false } = {}) {
  const st = STEPS.find((x) => x.n === n);
  if (!st) throw new RefusedError(`no step ${n} (steps 0–7; cleanup is --cleanup)`);
  const L = env.ledger.data;
  // the ledger is bound to the host and account of its preflight (a changed .env never reaches another target)
  const mismatch = env.targetMismatch() ?? (n > 0 && L.steps[0]?.result === "PASS" && !L.target ? "the ledger names no Kissflow target: its preflight predates the target binding (run --cleanup, then start again)" : null);
  if (mismatch) {
    env.out(`REFUSED step ${n}: ${mismatch}`);
    return { n, result: "REFUSED", why: mismatch };
  }
  if (n > 0 && force && L.steps[0]?.result !== "PASS") {
    env.out(`REFUSED step ${n}: --force never skips the preflight (step 0 has not passed)`);
    return { n, result: "REFUSED", why: "step 0 first" };
  }
  if (n > 0 && !force) {
    const missing = STEPS.filter((x) => x.n < n && L.steps[x.n]?.result !== "PASS").map((x) => x.n);
    if (missing.length) {
      env.out(`REFUSED step ${n}: step(s) ${missing.join(", ")} have not passed yet`);
      return { n, result: "REFUSED", why: `steps ${missing.join(", ")} first` };
    }
  }
  if (n === 0 && L.steps[0]?.result === "PASS" && L.created.length && L.cleanup?.result !== "PASS") {
    env.out(`── Step 0 · preflight: passed at ${L.steps[0].at}; the case exists now, so it is not re-checked (use --status)`);
    return { n, result: "PASS", skipped: true };
  }
  L.startedAt ??= env.now();
  const t0 = Date.now();
  let res;
  try {
    const s = await st.fn(env);
    res = { n, result: "PASS", checks: s.checks.length, optional: s.optional };
  } catch (e) {
    // stored in the ledger: Kissflow's error texts may echo a rejected value (an e-mail field), so masked
    if (e instanceof StepFailed) res = { n, result: "FAIL", why: env.mask(e.message) };
    else if (e?.refused) res = { n, result: "REFUSED", why: env.mask(e.message) };
    else if (isStop(e)) res = { n, result: "STOPPED", why: env.mask(e.message) };
    else res = { n, result: "FAIL", why: env.mask(`error: ${e.message}`) };
  }
  const Lnow = env.ledger.data; // the preflight may have started a new ledger (after a complete cleanup)
  Lnow.steps[n] = { at: env.now(), result: res.result, ...(res.why ? { why: res.why } : {}), ...(res.result === "PASS" && n > 0 ? { scope: SCOPE } : {}) };
  Lnow.startedAt ??= Lnow.steps[n].at;
  env.ledger.save();
  if (res.result === "STOPPED") env.persistBackoff();
  const ps = (env.port.stats.reads + env.port.stats.writes) + (env.svcPort.stats.reads + env.svcPort.stats.writes);
  env.out(`step ${n}: ${res.result}${res.why ? ` (${res.why})` : ""}${res.result === "PASS" && n > 0 ? ` — ${SCOPE}` : ""} · ${Math.round((Date.now() - t0) / 1000)} s · calls so far ${ps} (driver r${env.port.stats.reads}/w${env.port.stats.writes}, service r${env.svcPort.stats.reads}/w${env.svcPort.stats.writes})`);
  if (res.result === "STOPPED") env.out(`STOPPED: Kissflow answered 429 / a challenge page. No further call was made. Re-run the same step after ${env.rerunAfter()} (the ledger keeps what was done and the back-off; an earlier re-run is refused without a call).`);
  return res;
}

/** Steps 0–7 in order; skips steps that passed already; stops at the first step that does not pass. */
export async function runAll(env) {
  const out = [];
  for (const st of STEPS) {
    if (st.n > 0 && env.ledger.data.steps[st.n]?.result === "PASS") {
      env.out(`── Step ${st.n} · ${st.title}: passed at ${env.ledger.data.steps[st.n].at}, skipped`);
      out.push({ n: st.n, result: "PASS", skipped: true });
      continue;
    }
    const r = await runStep(env, st.n);
    out.push(r);
    if (r.result !== "PASS") break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- what exists for the case

/**
 * Every process item known for the case: the driver's own creates, the service's item map (driver ledger snapshot +
 * Case Data Sync_Note) and, with `deep`, the links the items themselves carry (CIQ Case → portal request / release,
 * CIQ Open Point → portal query, case.created → its Result_Item_Id), for items created just before a lost checkpoint.
 */
async function knownItems(env, { deep = false } = {}) {
  const out = new Map();
  const add = (flow, id, from) => {
    if (!id || out.has(id)) return;
    out.set(id, { flow, id, from });
  };
  for (const c of env.ledger.data.created) if (c.kind === "process") add(c.flow, c.id, c.by ?? "driver");
  const maps = [env.ledger.data.service?.items ?? {}];
  let caseRows = [];
  try {
    caseRows = await env.read.byCase(FLOW.caseData);
  } catch (e) {
    if (isStop(e)) throw e;
  }
  for (const r of caseRows) {
    const row = (await env.read.row(FLOW.caseData, r._id)) ?? r;
    maps.push(readLedger(row).items);
    add(FLOW.caseProc, row.Case_Item_Id, "Case Data");
  }
  if (env.ledger.data.service?.caseItemId) add(FLOW.caseProc, env.ledger.data.service.caseItemId, "ledger");
  for (const m of maps)
    for (const [k, id] of Object.entries(m)) {
      if (k === "request") add(FLOW.request, id, k);
      else if (k.startsWith("query:")) add(FLOW.query, id, k);
      else if (k === "releaseCurrent" || k.startsWith("release:")) add(FLOW.release, id, k);
      else if (k.startsWith("review:")) add(FLOW.review, id, k);
      else if (k.startsWith("op:")) add(FLOW.openPoint, id, k);
    }
  if (deep) {
    for (const r of await env.read.byCase(FLOW.serviceRequest)) {
      if (r.Request_Code !== "case.created") continue;
      add(FLOW.caseProc, r.Object_Key || J(r.Payload_JSON, {}).caseItemId, "case.created request");
      add(FLOW.request, r.Result_Item_Id, "case.created result");
    }
    for (const it of [...out.values()]) {
      if (it.flow !== FLOW.caseProc && it.flow !== FLOW.openPoint) continue;
      const x = await env.read.item(it.flow, it.id);
      if (!x || x.Case_Code !== env.caseCode) continue;
      if (it.flow === FLOW.caseProc) {
        add(FLOW.request, x.Portal_Request_Item_Id, "case link");
        add(FLOW.release, x.Portal_Release_Item_Id, "case link");
      } else add(FLOW.query, x.Portal_Query_Item_Id, "open point link");
    }
  }
  return [...out.values()];
}

/** --status: what exists for the case, in both containers (reads only). */
export async function status(env) {
  env.out(`── Status of ${env.caseCode} (${env.label}) ──`);
  const L = env.ledger.data;
  env.out(`ledger: ${L.created.length} driver create(s); steps ${Object.entries(L.steps).map(([k, v]) => `${k}:${v.result}`).join(" ") || "none"}${L.optionalUpload ? `; optional upload attach ${L.optionalUpload.attach}, row ${L.optionalUpload.row}` : ""}${L.cleanup ? `; cleanup ${L.cleanup.at}: ${L.cleanup.deleted.length} deleted, ${L.cleanup.left} left` : ""}`);
  const v = await env.view();
  if (v) env.out(`Case Data ${v.row._id}: phase ${v.c.phase} · reviews ${v.c.reviews.map((r) => `${r.dept}:${r.status}`).join(",") || "-"} · points ${v.c.openPoints.map((p) => `${p.id}:${p.status}`).join(",") || "-"}`);
  else env.out("Case Data: none");
  const items = await knownItems(env);
  const lines = [];
  for (const it of items) {
    const x = await env.read.item(it.flow, it.id);
    lines.push({ ...it, status: x ? x._status : "absent (404)", step: stepName(x), code: x?.Case_Code });
    env.out(`  ${it.flow.padEnd(24)} ${it.id}  ${(x ? x._status : "absent (404)").padEnd(12)} ${stepName(x) ?? ""}${x && x.Case_Code !== env.caseCode ? `  ⚠ Case_Code ${x.Case_Code}` : ""}  [${it.from}]`);
  }
  const forms = {};
  for (const form of CASE_FORMS) {
    const rows = await env.read.byCase(form);
    forms[form] = rows.length;
    const extra = form === FLOW.serviceRequest ? ` (${rows.map((r) => `${r.Request_Code}:${r.Request_Status || "waiting"}`).join(", ")})` : form === FLOW.outbox ? ` (${[...new Set(rows.map((r) => r.Event_Code))].join(", ")})` : "";
    env.out(`  ${form.padEnd(24)} ${rows.length} row(s)${extra}`);
  }
  return { items: lines, forms, caseData: !!v };
}

// ---------------------------------------------------------------------------------------------- step 9: cleanup

/**
 * Deletes EVERYTHING the case created in both containers, found through the driver's ledger AND by Case_Code: portal
 * request / queries / final releases; the app case, reviews and open points; RMES rows, Scope Run rows, outbox rows,
 * audit rows, notes, Service Requests and the Case Data row (last). Process items by the admin DELETE, Form rows by the
 * Form DELETE; each is read first and deleted only when its Case_Code IS the run's code; absence is verified after.
 * Never CIQ Supplier, CIQ Config Version or Help rows.
 */
export async function cleanup(env) {
  env.out(`── Cleanup of ${env.caseCode} (${env.label}) ──`);
  if (!env.liveAllowed) throw new RefusedError("cleanup refused: CIQ_SYNC_LIVE=1 not given");
  if (!CASE_RE.test(env.caseCode)) throw new RefusedError(`cleanup refused: ${env.caseCode} does not match ${CASE_RE}`);
  const L = env.ledger.data;
  const deleted = [];
  const skipped = [];
  const failed = [];
  const acc = env.client.acc;
  const del = async (path) => {
    const r = await env.port.raw("DELETE", path, undefined, `DELETE ${path.replace(/\?.*$/, "")}`, { binaryOk: true });
    return r.status;
  };
  // 1. process items: portal first, then the app's points, reviews and the case
  const order = [FLOW.query, FLOW.release, FLOW.request, FLOW.openPoint, FLOW.review, FLOW.caseProc];
  const items = (await knownItems(env, { deep: true })).sort((a, b) => order.indexOf(a.flow) - order.indexOf(b.flow));
  for (const it of items) {
    if (NEVER_DELETE.has(it.flow)) continue;
    const x = await env.read.item(it.flow, it.id);
    if (!x) {
      env.out(`  gone  ${it.flow} ${it.id} (already absent)`);
      continue;
    }
    if (x.Case_Code !== env.caseCode) {
      skipped.push(`${it.flow}/${it.id}`);
      env.out(`  SKIP  ${it.flow} ${it.id}: its Case_Code is ${JSON.stringify(x.Case_Code ?? null)}, not ${env.caseCode} — never deleted`);
      continue;
    }
    const q = `_application_id=${containerOf(it.flow)}`;
    let st = await del(`/process/2/${acc}/admin/${it.flow}/${it.id}?${q}`);
    if (st >= 300 && st !== 404) st = await del(`/process/2/${acc}/${it.flow}/${it.id}?${q}`);
    const after = await env.read.item(it.flow, it.id);
    if (!after) {
      deleted.push(`${it.flow}/${it.id}`);
      env.out(`  del   ${it.flow} ${it.id} (${x._status}) → ${st}, 404 after`);
    } else {
      failed.push(`${it.flow}/${it.id}`);
      env.out(`  FAIL  ${it.flow} ${it.id}: DELETE → ${st}, still ${after._status}`);
    }
    L.cleanup = { at: env.now(), deleted, skipped, failed, left: null };
    env.ledger.save();
  }
  // 2. Form rows by Case_Code (and the driver's own rows), Case Data last
  for (const form of CASE_FORMS) {
    if (NEVER_DELETE.has(form)) continue;
    const listed = await env.read.byCase(form);
    const ownIds = L.created.filter((c) => c.kind === "form" && c.flow === form && c.id && !listed.some((r) => r._id === c.id)).map((c) => c.id);
    const targets = [...listed];
    for (const id of ownIds) {
      const row = await env.read.row(form, id);
      if (row) targets.push(row);
    }
    for (const row of targets) {
      if (row.Case_Code !== env.caseCode) {
        skipped.push(`${form}/${row._id}`);
        env.out(`  SKIP  ${form} ${row._id}: its Case_Code is ${JSON.stringify(row.Case_Code ?? null)} — never deleted`);
        continue;
      }
      const st = await del(`/form/2/${acc}/${form}/${row._id}?_application_id=${containerOf(form)}`);
      if (st < 300 || st === 404) deleted.push(`${form}/${row._id}`);
      else failed.push(`${form}/${row._id}`);
      L.cleanup = { at: env.now(), deleted, skipped, failed, left: null };
      env.ledger.save();
    }
    if (targets.length) env.out(`  del   ${form}: ${targets.filter((r) => r.Case_Code === env.caseCode).length} row(s)`);
  }
  // 3. verify: nothing with the case code is left anywhere
  let left = 0;
  for (const it of items) if (!skipped.includes(`${it.flow}/${it.id}`) && (await env.read.item(it.flow, it.id))) left++;
  const leftForms = {};
  for (const form of CASE_FORMS) {
    const n = (await env.read.byCase(form)).length;
    if (n) leftForms[form] = n;
    left += n;
  }
  L.cleanup = { at: env.now(), deleted, skipped, failed, left };
  env.ledger.save();
  env.out(`cleanup: ${deleted.length} deleted, ${skipped.length} skipped (not this case), ${failed.length} failed; left with Case_Code ${env.caseCode}: ${left}${Object.keys(leftForms).length ? ` (${JSON.stringify(leftForms)})` : ""}`);
  env.out("note: the dev supplier ZZT-SUP-DEV and the configuration rows were not touched");
  return { deleted, skipped, failed, left, result: left === 0 && !failed.length ? "PASS" : "FAIL" };
}

export { isStop };
