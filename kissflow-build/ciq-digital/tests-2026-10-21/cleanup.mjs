#!/usr/bin/env node
// Cleanup of the overnight live suite's items (SPEC.md §1 "Ledger", §5). Kissflow-internal.
//   node kissflow-build/ciq-digital/tests-2026-10-21/cleanup.mjs [--run R1|R2|R3]          dry run: prints flow, id, stage
//   node kissflow-build/ciq-digital/tests-2026-10-21/cleanup.mjs --run R1 --apply            deletes them
// - Reads ONLY ledger.jsonl (beside this file): it never deletes an id that is not in the ledger, and never follows an
//   id it reads in an item. One entry per item (flow + id, its latest stage), deleted newest first (children before the
//   case they belong to).
// - Skips form drafts (stage "draft", or an id starting "draft_": that id is the user's ONE draft of the form, so it
//   names whatever draft Thomas has now), items already recorded as "deleted", CIQ Config Version, any flow it does not
//   know, and any line whose app does not match its flow.
// - A process item: admin GET (404 "could not be located" = already gone) → withdraw while InProgress → admin DELETE →
//   admin GET 404. A form row: DELETE → GET 404. Each verified deletion is appended to the ledger (stage "deleted").
// - Dev sandbox only (AcDOSunMEpSA on dev-beiersdorf.kissflow.eu), checked before the first call. The key comes from
//   kissflow-build/lib/kf.mjs (it reads .env; nothing here does), called with retries: 0, and only with --apply: a dry
//   run makes no call and reads no credential.
// - Paced: 2500 ms between calls, also after the suite's last call (queue-state.json). A 429 or an HTML answer ("Just a
//   moment…") stops at once and records the stop there (nothing calls Kissflow for 20 minutes); a call that does not
//   answer within 60 s stops it too (no call may overlap it). A stop recorded less than 20 minutes ago refuses to start.
// - The request log (requests.jsonl) gets {at, method, path, status, ms, err?, by}: relative REST paths, no bodies.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const LEDGER_FILE = resolve(HERE, "ledger.jsonl");
export const REQUEST_LOG = resolve(HERE, "requests.jsonl");
export const QUEUE_STATE = resolve(HERE, "queue-state.json");
const KF_MJS = resolve(HERE, "../../lib/kf.mjs");

export const DEV_ACCOUNT = "AcDOSunMEpSA";
export const DEV_HOST = "dev-beiersdorf.kissflow.eu";
// KF_GAP_MS slows it down (never below 2500): the shared key's rolling-window limit, 21 Oct
export const GAP_MS = Math.max(2500, Number(process.env.KF_GAP_MS) || 2500);
export const PAUSE_MS = 20 * 60 * 1000;
export const CALL_TIMEOUT_MS = 60000;
const APP_ID = "CIQ_Digital_A00";
const PORTAL_ID = "CIQ_Supplier_Portal_A00";

/** The flows the suite writes (SPEC §1 "Allowed writes"); nothing else is ever deleted. */
export const FLOWS = {
  CIQ_Case_A00: { app: APP_ID, kind: "process" },
  CIQ_Review_A00: { app: APP_ID, kind: "process" },
  CIQ_Open_Point_A00: { app: APP_ID, kind: "process" },
  CIQ_Audit_Event_A00: { app: APP_ID, kind: "form" },
  CIQ_Internal_Note_A00: { app: APP_ID, kind: "form" },
  CIQ_RMES_Safety_A00: { app: APP_ID, kind: "form" },
  CIQ_RMES_Regulatory_A00: { app: APP_ID, kind: "form" },
  CIQ_Supplier_A00: { app: APP_ID, kind: "form" },
  CIQ_Scope_Run_A00: { app: APP_ID, kind: "form" },
  CIQP_Request_A00: { app: PORTAL_ID, kind: "process" },
  CIQP_Query_A00: { app: PORTAL_ID, kind: "process" },
};
const NEVER = new Set(["CIQ_Config_Version_A00"]);

/** Every ledger line (a torn last line is skipped). */
export function readLedger(file = LEDGER_FILE) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const l of readFileSync(file, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      // a crash mid-write
    }
  }
  return out;
}

const isDraftForm = (kind, e) => kind === "form" && (e.stage === "draft" || /^draft_/i.test(String(e.id)));

/** What would be deleted (newest first) and what is skipped, from the ledger lines of `run` (all runs without one). */
export function planCleanup(lines, run) {
  // run|flow|id → its latest line; a Map keeps the place of the first line (the order the items appeared)
  const latest = new Map();
  for (const e of lines) {
    if (!e || typeof e !== "object" || typeof e.id !== "string" || typeof e.flow !== "string") continue;
    if (run && e.run !== run) continue;
    latest.set(`${e.run}|${e.flow}|${e.id}`, e);
  }
  const items = [];
  const skipped = [];
  for (const e of latest.values()) {
    const f = FLOWS[e.flow];
    const skip = (why) => skipped.push({ run: e.run, flow: e.flow, id: e.id, stage: e.stage, why });
    if (NEVER.has(e.flow)) skip("never deleted (configuration)");
    else if (!f) skip("not a flow the suite writes");
    else if (e.app !== f.app) skip(`its app ${e.app} is not ${f.app}`);
    else if (isDraftForm(f.kind, e)) skip("a form draft (the id names the user's current draft)");
    else if (e.stage === "deleted") skip("already deleted and verified");
    else if (!/^[A-Za-z0-9_-]+$/.test(e.id) || /^[a-z_]+$/.test(e.id)) skip("not an item id");
    else items.push({ run: e.run, flow: e.flow, app: f.app, kind: f.kind, id: e.id, stage: e.stage, what: e.what ?? "" });
  }
  return { items: items.reverse(), skipped };
}

/** Why an answer means "stop now" (429, a Cloudflare challenge or any HTML page), or undefined. */
export function challengeOf(status, body) {
  if (status === 429) return "429 Too Many Requests";
  if (typeof body === "string" && /<html|<!doctype html|just a moment/i.test(body)) return `HTML answer (status ${status})`;
  return undefined;
}

const errText = (body, status) => {
  if (body && typeof body === "object") {
    const t = [body.error_code, body.en_message || body.message].filter(Boolean).join(" ");
    if (t) return t;
  }
  return `HTTP ${status}`;
};
const isError = (r) => r.status >= 400 || !!(r.body && typeof r.body === "object" && !Array.isArray(r.body) && r.body.error_code);
// "gone" is any 404: live (21 Oct) a deleted process item's admin GET answers 404 with 050201 ("moved out of your queue"),
// a form row 404 with 01015; across every request log 145 such 404/050201 items never read 200 again
const located = (r) => r.status === 404;
/** Persisted text never carries a URL. */
const noUrls = (t) => String(t).replace(/(https?|wss?)(:|%3A)(\/\/|\\\/\\\/|%2F%2F)[^\s"'<>)\]}]+/gi, "<url>");

export class Stop extends Error {}

/** The queue-state.json of the live suite: read, and written merged (a stop or a later call is never lost). */
export function stateFile(file = QUEUE_STATE) {
  const read = () => {
    try {
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    } catch {
      return {};
    }
  };
  return {
    read,
    write(patch) {
      const disk = read();
      const merged = { ...disk };
      if (patch.lastCallAt !== undefined) merged.lastCallAt = Math.max(disk.lastCallAt ?? 0, patch.lastCallAt);
      if (patch.stoppedAt !== undefined && patch.stoppedAt > (disk.stoppedAt ?? 0)) Object.assign(merged, { stoppedAt: patch.stoppedAt, why: noUrls(patch.why ?? "") });
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(merged));
      renameSync(tmp, file);
    },
  };
}

/**
 * Deletes the planned items. `d.call(method, path, body)` → {status, body} (kf.mjs with retries 0); `d.now`/`d.sleep`
 * the clock; `d.state` the queue-state file (or null); `d.log(entry)`, `d.record(line)` the request log and the ledger.
 * Returns {deleted, gone, failed, stopped?}. Never throws for one item's failure; a stop ends the run at once.
 */
export async function applyCleanup(plan, d) {
  const out = { deleted: [], gone: [], failed: [], notReached: [], stopped: undefined };
  const timeoutMs = d.timeoutMs ?? CALL_TIMEOUT_MS;
  let lastEnd = d.state?.read().lastCallAt ?? Number.NEGATIVE_INFINITY;

  async function call(method, path, body) {
    if (d.state) lastEnd = Math.max(lastEnd, d.state.read().lastCallAt ?? Number.NEGATIVE_INFINITY);
    // the HOLD file (tests-2026-10-21/HOLD, or KF_HOLD_FILE) pauses every call until removed, as in the live queue
    const hold = process.env.KF_HOLD_FILE ?? fileURLToPath(new URL("./HOLD", import.meta.url));
    while (!process.env.VITEST && existsSync(hold)) await d.sleep(15_000); // never under the test runner's stubs
    let wait = lastEnd + GAP_MS - d.now();
    // KF_WINDOW="a-b": calls only in minutes a..b of each hour (the two sessions take turns, 22 Oct)
    const w = /^(\d{1,2})-(\d{1,2})$/.exec(process.env.KF_WINDOW ?? "");
    if (w) {
      const from = +w[1], to = +w[2], now = new Date(d.now()), m = now.getMinutes();
      if (m < from || m > to) {
        const next = new Date(now);
        next.setSeconds(0, 0);
        if (m > to) next.setHours(now.getHours() + 1);
        next.setMinutes(from);
        wait = Math.max(wait, next.getTime() - d.now());
      }
    }
    if (wait > 0) await d.sleep(wait);
    const t0 = d.now();
    let r;
    let timer;
    try {
      r = await Promise.race([
        Promise.resolve().then(() => d.call(method, path, body)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Stop(`${method} ${path.split("?")[0]} did not answer within ${Math.round(timeoutMs / 1000)} s: stopping, so that no call overlaps it.`)), timeoutMs);
        }),
      ]);
    } catch (e) {
      d.log({ at: new Date(t0).toISOString(), method, path, status: 0, ms: d.now() - t0, err: noUrls(e?.message ?? e), by: "cleanup" });
      throw e instanceof Stop ? e : new Error(noUrls(e?.message ?? e));
    } finally {
      clearTimeout(timer);
      lastEnd = d.now();
      d.state?.write({ lastCallAt: lastEnd });
    }
    const why = challengeOf(r.status, r.body);
    d.log({ at: new Date(t0).toISOString(), method, path, status: r.status, ms: d.now() - t0, ...(why || isError(r) ? { err: noUrls(why ?? errText(r.body, r.status)) } : {}), by: "cleanup" });
    if (why) {
      const msg = `Stopped on ${method} ${path.split("?")[0]}: ${why}. No retry; nothing calls Kissflow for 20 minutes.`;
      d.state?.write({ stoppedAt: d.now(), why: msg });
      throw new Stop(msg);
    }
    return r;
  }

  const acc = d.acc ?? DEV_ACCOUNT;
  const enc = encodeURIComponent;
  for (let i = 0; i < plan.items.length; i++) {
    const it = plan.items[i];
    const q = `_application_id=${it.app}`;
    const fail = (error) => out.failed.push({ flow: it.flow, id: it.id, error });
    try {
      if (it.kind === "process") {
        const adminPath = `/process/2/${acc}/admin/${it.flow}/${enc(it.id)}?${q}`;
        const got = await call("GET", adminPath);
        if (located(got)) {
          out.gone.push({ flow: it.flow, id: it.id });
          continue;
        }
        if (isError(got)) {
          fail(`admin GET: ${errText(got.body, got.status)}`);
          continue;
        }
        if (!got.body || typeof got.body !== "object" || got.body._id !== it.id) {
          fail("admin GET answered with another item or none");
          continue;
        }
        let note;
        if (got.body._status === "InProgress") {
          const w = await call("POST", `/process/2/${acc}/${it.flow}/${enc(it.id)}/withdraw?${q}`, { Comment: `ZZT-N21-${it.run} cleanup` });
          if (isError(w)) note = `withdraw refused (${errText(w.body, w.status)}); deleted at its step`;
        }
        const del = await call("DELETE", adminPath);
        if (isError(del)) {
          fail(`admin DELETE: ${errText(del.body, del.status)}${note ? `; ${note}` : ""}`);
          continue;
        }
        const after = await call("GET", adminPath);
        if (after.status !== 404) {
          fail(`still reads back after its delete (GET ${after.status})`);
          continue;
        }
        out.deleted.push({ flow: it.flow, id: it.id, stage: it.stage, ...(note ? { note } : {}) });
      } else {
        const path = `/form/2/${acc}/${it.flow}/${enc(it.id)}?${q}`;
        const del = await call("DELETE", path);
        const goneBefore = del.status === 404;
        if (isError(del) && !goneBefore) {
          fail(`DELETE: ${errText(del.body, del.status)}`);
          continue;
        }
        const after = await call("GET", path);
        if (after.status !== 404) {
          fail(`still reads back after its delete (GET ${after.status})`);
          continue;
        }
        if (goneBefore) {
          out.gone.push({ flow: it.flow, id: it.id });
          continue;
        }
        out.deleted.push({ flow: it.flow, id: it.id, stage: it.stage });
      }
      d.record({ at: new Date(d.now()).toISOString(), run: it.run, flow: it.flow, app: it.app, id: it.id, what: "cleanup.mjs", stage: "deleted" });
    } catch (e) {
      if (e instanceof Stop) {
        out.stopped = e.message;
        out.notReached = plan.items.slice(i).map((x) => ({ flow: x.flow, id: x.id, stage: x.stage }));
        return out;
      }
      fail(noUrls(e?.message ?? e));
    }
  }
  return out;
}

function parseArgs(argv) {
  const o = { run: undefined, apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") o.apply = true;
    else if (argv[i] === "--run") o.run = argv[++i];
    else if (argv[i].startsWith("--run=")) o.run = argv[i].slice(6);
    else throw new Error(`Unknown argument ${argv[i]} (use --run <R> and --apply).`);
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.run !== undefined && !/^[A-Za-z0-9]+$/.test(o.run)) throw new Error(`--run takes a run name (R1, R2, R3), not "${o.run}".`);
  const plan = planCleanup(readLedger(), o.run);
  const scope = o.run ? `run ${o.run}` : "every run";
  console.log(`Ledger ${LEDGER_FILE}: ${plan.items.length} item(s) to delete for ${scope}, newest first; ${plan.skipped.length} skipped.`);
  for (const it of plan.items) console.log(`  ${it.run}  ${it.flow}  ${it.id}  ${it.stage}${it.what ? `  (${it.what})` : ""}`);
  if (plan.skipped.length) {
    console.log("Skipped:");
    for (const s of plan.skipped) console.log(`  ${s.run}  ${s.flow}  ${s.id}  ${s.stage}: ${s.why}`);
  }
  if (!o.apply) {
    console.log(`Dry run: nothing was called or deleted. To delete: --run <R> --apply.`);
    return 0;
  }
  if (!o.run) throw new Error("--apply needs --run <R>: one run at a time.");
  if (!plan.items.length) return 0;

  const state = stateFile();
  const s = state.read();
  if (s.stoppedAt !== undefined && Date.now() - s.stoppedAt < PAUSE_MS) {
    console.error(`Paused: ${s.why ?? "a stop"} at ${new Date(s.stoppedAt).toISOString()}; no Kissflow call before ${new Date(s.stoppedAt + PAUSE_MS).toISOString()}.`);
    return 2;
  }
  // the key: kf.mjs reads .env itself; the account and host are checked before any call
  const { client } = await import(pathToFileURL(KF_MJS).href);
  const kf = client({ readOnly: false });
  if (kf.acc !== DEV_ACCOUNT || kf.domain !== DEV_HOST) throw new Error(`Refused: the key is not for the dev sandbox (${DEV_ACCOUNT} on ${DEV_HOST}).`);
  const report = await applyCleanup(plan, {
    acc: kf.acc,
    call: (method, path, body) => kf.call(method, path, body, { retries: 0 }),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    state,
    log: (e) => {
      mkdirSync(dirname(REQUEST_LOG), { recursive: true });
      appendFileSync(REQUEST_LOG, `${JSON.stringify(e)}\n`);
    },
    record: (line) => appendFileSync(LEDGER_FILE, `${JSON.stringify(line)}\n`),
  });
  console.log(`Deleted ${report.deleted.length}, already gone ${report.gone.length}, failed ${report.failed.length}${report.stopped ? `, not reached ${report.notReached.length}` : ""}.`);
  for (const x of report.deleted) console.log(`  deleted  ${x.flow}  ${x.id}  (${x.stage})${x.note ? `: ${x.note}` : ""}`);
  for (const x of report.gone) console.log(`  gone     ${x.flow}  ${x.id}`);
  for (const x of report.failed) console.log(`  FAILED   ${x.flow}  ${x.id}: ${x.error}`);
  if (report.stopped) {
    console.error(`STOPPED: ${report.stopped}`);
    for (const x of report.notReached) console.error(`  not reached  ${x.flow}  ${x.id}  (${x.stage})`);
    return 2;
  }
  return report.failed.length ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(noUrls(e?.message ?? e));
      process.exit(1);
    },
  );
}
