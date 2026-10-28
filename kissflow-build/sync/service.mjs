// The CIQ Sync Service run (plan v5 §8): one pass =
//   (1) Service Requests without status (H-00 → H-01, H-04, H-06, H-08, H-09, H-12…H-15, H-18, H-20, rmes.saved, …);
//   (2) portal polling of the stored item ids (H-02, H-03, H-05, H-07, H-08, H-10, H-11, H-16, H-21);
//   (3) new internal notes (H-17);
//   (4) reminders, hourly (H-19);
//   (5) outbox retries and dead letters (§4.5), debounced C-10 flushes.
// Then a heartbeat line. A deferral (429, Cloudflare challenge, back-off) ends the pass at once, writing nothing more.
// Each pass builds the directory first and arms the identity guards from it (identity.mjs): the port refuses any write
// that carries a minted supplier id, and a key user who is a real person (dev) is not trusted as "the service wrote it".
// Host state also keeps, per Failed Service Request, the stamp of the service's own write-back (kissflow.mjs stampOf:
// platform stamp + a hash, no field value), so H-00 can tell a retry from someone else's later edit across runs.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { FLOW, LIST } from "./ids.mjs";
import { readLedger, toCiqCase } from "./engine.mjs";
import { loadConfig } from "./config.mjs";
import { loadDirectory } from "./directory.mjs";
import { isDeferral } from "./kissflow.mjs";
import { retryPlan } from "./mail.mjs";
import { reconcile } from "./reconcile.mjs";
import { pendingRequests, processRequest } from "./handlers/requests.mjs";
import { pollCase } from "./handlers/portal.mjs";
import { processNotes } from "./handlers/notes.mjs";
import { runRemindersFor } from "./handlers/reminders.mjs";
import { loadCase } from "./handlers/common.mjs";
import { kissflowAttacher } from "./attach.mjs";

const HOUR = 3_600_000;
const CLOSED_POLL_MS = 15 * 60_000;

export function memoryState(init = {}) {
  let s = { notesCursor: { at: "", ids: [] }, lastRemindersAt: "", lastClosedPollAt: "", deadLettersSeen: [], ...init };
  return { get: () => s, set: (patch) => (s = { ...s, ...patch }) };
}

/** Host storage for dev (a JSON file next to the service; no secret is ever stored). */
export function fileState(path) {
  const mem = memoryState(existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {});
  return {
    get: mem.get,
    set(patch) {
      mem.set(patch);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(mem.get(), null, 2) + "\n");
    },
  };
}

/**
 * @param {object} o
 * @param {boolean} [o.splitAll]  tests only: every supplier contact gets a minted id (identity.mjs)
 */
export function createService({ port, now = () => new Date().toISOString(), log = () => {}, linkBase = {}, attacher, state = memoryState(), debounceMs, retryAfterMs, splitAll = false } = {}) {
  async function makeCtx() {
    const indexes = new Map();
    const warnings = new Set();
    const config = await loadConfig(port);
    const directory = await loadDirectory(port, { settings: config.settings, warn: (w) => warnings.add(w), serviceUserIds: port.serviceUserId ? [port.serviceUserId] : [], splitAll });
    port.setLeakGuard?.(directory.mintedIds);
    port.setServiceUserTrusted?.(!directory.isHuman(port.serviceUserId));
    const caseRows = await port.listForm(FLOW.caseData);
    const stamps = new Map(Object.entries(state.get().requestStamps ?? {}));
    const keepStamps = () => state.set({ requestStamps: Object.fromEntries([...stamps].slice(-500)) });
    const ctx = {
      port,
      now,
      log,
      linkBase,
      attacher: attacher ?? kissflowAttacher(port),
      config,
      directory,
      caseRows,
      warnings,
      debounceMs,
      stats: { done: 0, refused: 0, failed: 0, deferred: 0 },
      /** H-00: the stamp of the service's own Failed write-back per request row (host state; no secret, no field value). */
      requestStamps: {
        get: (id) => stamps.get(id),
        set(id, stamp) {
          if (stamp) stamps.set(id, stamp);
          else stamps.delete(id);
          keepStamps();
        },
        delete(id) {
          if (stamps.delete(id)) keepStamps();
        },
      },
      async index(flow, keyField) {
        if (!indexes.has(flow)) indexes.set(flow, new Set((await port.listForm(flow)).map((r) => r[keyField]).filter(Boolean)));
        return indexes.get(flow);
      },
    };
    return ctx;
  }

  /**
   * One pass. `caseCode` limits requests and polling to one case (--case). `caseOnly` (with `caseCode`; the live-e2e
   * driver) also limits the account-wide parts to that case: only its new notes are read (H-17) and only its unsent
   * outbox rows are retried or counted as dead letters, so a test pass never writes for another case.
   */
  async function runOnce({ caseCode, forceReminders = false, caseOnly = false } = {}) {
    const only = caseOnly && caseCode ? caseCode : null;
    const t0 = Date.now();
    const hb = { at: now(), requests: { seen: 0, done: 0, refused: 0, failed: 0, deferred: 0 }, cases: 0, polled: {}, notes: 0, reminders: null, retries: 0, deadLetters: 0, errors: [], aborted: null };
    let ctx;
    try {
      ctx = await makeCtx();
      // (1) requests
      const rows = await port.listForm(FLOW.serviceRequest);
      const pending = pendingRequests(rows).filter((r) => !caseCode || r.Case_Code === caseCode);
      hb.requests.seen = pending.length;
      for (const listed of pending) {
        // A Form list row carries only _id + business fields (live, 15 Oct); the platform's _created_by / _modified_by
        // (the requester checks of H-00) come with the per-row GET only.
        const row = (await port.getFormRow(FLOW.serviceRequest, listed._id)) ?? listed;
        const outcome = await processRequest(ctx, row, rows);
        hb.requests[outcome] = (hb.requests[outcome] ?? 0) + 1;
      }
      // (2) portal polling (closed cases every 15 min)
      const s = state.get();
      const closedDue = !s.lastClosedPollAt || Date.parse(now()) - Date.parse(s.lastClosedPollAt) >= CLOSED_POLL_MS;
      for (const row of ctx.caseRows.filter((r) => !caseCode || r.Case_Code === caseCode)) {
        try {
          const r = await pollCase(ctx, row, { closedToo: closedDue });
          hb.cases++;
          for (const [k, v] of Object.entries(r)) if (typeof v === "number" && v) hb.polled[k] = (hb.polled[k] ?? 0) + v;
        } catch (e) {
          if (isDeferral(e) && (e.unreadable || e.backoff)) throw e;
          if (isDeferral(e)) {
            hb.requests.deferred++;
            continue;
          }
          hb.errors.push(`${row.Case_Code}: ${e.message}`);
          log({ ev: "poll-error", case: row.Case_Code, error: e.message });
        }
      }
      if (closedDue) state.set({ lastClosedPollAt: now() });
      // (3) notes
      const notes = await processNotes(ctx, state.get().notesCursor, only ? { caseCode: only } : {});
      hb.notes = notes.processed;
      state.set({ notesCursor: notes.cursor });
      // (4) reminders, hourly
      const last = state.get().lastRemindersAt;
      if (forceReminders || !last || Date.parse(now()) - Date.parse(last) >= HOUR) {
        hb.reminders = await runRemindersFor(ctx, { now: now(), caseCodes: caseCode ? [caseCode] : undefined });
        state.set({ lastRemindersAt: now() });
      }
      // (5) outbox retries and dead letters
      const outbox = (await port.listForm(FLOW.outbox)).filter((r) => !only || r.Case_Code === only);
      const { retries, deadLetters } = retryPlan(outbox, now(), retryAfterMs);
      const keys = await ctx.index(FLOW.outbox, "Mail_Key");
      for (const r of retries) {
        if (keys.has(r.Mail_Key)) continue;
        await port.createFormRow(FLOW.outbox, r);
        keys.add(r.Mail_Key);
        hb.retries++;
      }
      hb.deadLetters = deadLetters.length;
      const seen = new Set(state.get().deadLettersSeen ?? []);
      for (const d of deadLetters.filter((x) => !seen.has(x.Mail_Key))) log({ ev: "ALERT dead letter", mail: d.Mail_Key, case: d.Case_Code, event: d.Event_Code, attempts: d.attempts });
      state.set({ deadLettersSeen: [...new Set([...seen, ...deadLetters.map((d) => d.Mail_Key)])].slice(-500) });
      hb.requests = { ...hb.requests, ...pick(ctx.stats) };
      hb.warnings = [...ctx.warnings];
      hb.directory = { internalPeople: ctx.directory.people.size, withEmail: [...ctx.directory.people.values()].filter((p) => p.email).length, supplierContacts: ctx.directory.contacts.length, overlaps: ctx.directory.overlaps.length, configReleases: ctx.config.releases.length };
    } catch (e) {
      if (isDeferral(e)) hb.aborted = e.message;
      else {
        hb.errors.push(e.message);
        log({ ev: "run-error", error: e.message });
      }
    }
    hb.ms = Date.now() - t0;
    hb.port = { ...port.stats };
    return hb;
  }

  /** Runbook "replay a case": re-run every idempotent effect for the case's current state (no new action). */
  async function replay(caseCode) {
    const ctx = await makeCtx();
    const cs = await loadCase(ctx, caseCode);
    if (!cs) throw new Error(`unknown case ${caseCode}`);
    return (await reconcile(ctx, cs, cs.before, {}, { triggerKey: undefined })).report;
  }

  async function listFailed() {
    return (await port.listForm(FLOW.serviceRequest)).filter((r) => r.Request_Status === LIST.requestStatus.failed).map((r) => ({ key: r.Request_Key, code: r.Request_Code, case: r.Case_Code, note: r.Result_Note }));
  }

  async function deadLetters() {
    return retryPlan(await port.listForm(FLOW.outbox), now(), retryAfterMs).deadLetters;
  }

  return { runOnce, replay, listFailed, deadLetters, makeCtx };
}

const pick = (s) => ({ done: s.done, refused: s.refused, failed: s.failed, deferred: s.deferred });

/** The heartbeat as one log line (no secrets, no personal data). */
export function heartbeatLine(hb) {
  const polled = Object.entries(hb.polled).map(([k, v]) => `${k}=${v}`).join(" ") || "nothing new";
  return `[ciq-sync] ${hb.at} requests seen=${hb.requests.seen} done=${hb.requests.done ?? 0} refused=${hb.requests.refused ?? 0} failed=${hb.requests.failed ?? 0} deferred=${hb.requests.deferred ?? 0} | cases=${hb.cases} (${polled}) | notes=${hb.notes} | reminders=${hb.reminders ?? "not due"} | retries=${hb.retries} deadLetters=${hb.deadLetters} | people=${hb.directory ? `${hb.directory.internalPeople} internal (${hb.directory.withEmail} with e-mail), ${hb.directory.supplierContacts} contacts, overlaps=${hb.directory.overlaps ?? 0}, ${hb.directory.configReleases} releases` : "?"} | reads=${hb.port?.reads ?? 0} writes=${hb.port?.writes ?? 0} reapplied=${hb.port?.reapplied ?? 0} | ${hb.ms} ms${hb.warnings?.length ? ` | warnings=${hb.warnings.length}` : ""}${hb.aborted ? ` | ABORTED: ${hb.aborted}` : ""}${hb.errors.length ? ` | errors: ${hb.errors.join("; ")}` : ""}`;
}

export { readLedger, toCiqCase };
