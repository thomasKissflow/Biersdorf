#!/usr/bin/env node
// Live harness: runOnce(<caseItemId>) of the SAME Bundle.gs + Code.gs against the REAL dev sandbox, from node.
// Usage: node kissflow-build/final-pdf/test/live.mjs <caseItemId> [--apply]
//   without --apply: reads only. Every write the service would make (attach, PUT, audit row) is answered locally and
//     printed as a planned write; the PDF is written to final-pdf/out/<Case_Code>-final-document.pdf.
//   with --apply: the writes go to Kissflow (the service reads each one back).
// Safety: credentials come from Beiersdorf/.env at run time (lib/kf.mjs loadEnv) and are never printed; the access-key
// headers go to curl through a temporary header file (curl -H @file, mode 600 in a fresh mode-700 folder under the
// system temp folder, outside the project, deleted after each call), never argv. A run killed mid-call (Ctrl-C) can
// leave that folder behind: every start removes such leftovers first.
// Runs against the dev sandbox only: account AcDOSunMEpSA on dev-beiersdorf.kissflow.eu. 8 s between Kissflow calls
// (shared key); a 429 or a challenge page pauses the service 20 min (PAUSE_UNTIL, kept in out/live-state.json). A dry
// run keeps only the pause there: its planned ids and hashes never reach an --apply run.
// No mail is sent from node: MAIL_ENABLED is false here, so the audit row records no notification. curl never follows
// a redirect (the service fetches a signed download itself, only on KF_DOMAIN).
// The transport is exported for the offline test (offline.mjs runs it against the fake Kissflow, no network).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execution } from "./gas.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const OUT = resolve(here, "../out");
const DEV_ACCOUNT = "AcDOSunMEpSA";
const DEV_HOST = "dev-beiersdorf.kissflow.eu";
const PACE_MS = 8000;
const CURL_PREFIX = "ciq-fd-curl-";

const sleepMs = (ms) => ms > 0 && Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** Blocks until minute :30-:58 of the hour, the portal session's half of the shared key (22 Oct night agreement). */
function waitForWindow() {
  for (;;) {
    const d = new Date(), m = d.getMinutes();
    if (m >= 30 && m <= 58) return;
    const next = new Date(d); next.setMinutes(30, 5, 0); if (m >= 30) next.setHours(next.getHours() + 1);
    sleepMs(Math.max(5000, next - d));
  }
}

/** The harness's refusals: only the dev sandbox account on the dev sandbox host. Returns a reason or "". */
export function refusal(env) {
  if (env.KF_ACCOUNT_ID !== DEV_ACCOUNT) return "Refused: .env does not name the dev sandbox account. This harness runs against the dev sandbox only.";
  if (String(env.KF_DOMAIN).toLowerCase() !== DEV_HOST) return "Refused: .env does not name the dev sandbox host. This harness runs against the dev sandbox only.";
  return "";
}

/** The curl folders of this process (removed on exit), and the leftovers of a killed run (removed at start). */
const activeDirs = new Set();
export const removeActiveCurlDirs = () => {
  for (const d of activeDirs) rmSync(d, { recursive: true, force: true });
  activeDirs.clear();
};
export function sweepCurlDirs(root, prefix = CURL_PREFIX) {
  if (!existsSync(root)) return 0;
  const old = readdirSync(root).filter((n) => n.startsWith(prefix));
  for (const n of old) rmSync(resolve(root, n), { recursive: true, force: true });
  return old.length;
}

/**
 * One synchronous HTTP call through curl, UrlFetchApp-shaped in and out. The key headers are written to a mode-600
 * header file in a fresh mode-700 folder under `tmpRoot` (curl -H @file) and deleted with it after the call.
 * `exec` is execFileSync, `now` and `sleep` the clock (the offline test passes stand-ins); `paceMs` between calls.
 */
export function curlCall({ env, tmpRoot = tmpdir(), paceMs = PACE_MS, exec = execFileSync, now = Date.now, sleep = sleepMs }) {
  let lastReal = 0;
  const secrets = [env.KF_ACCESS_KEY_ID, env.KF_ACCESS_KEY_SECRET].filter((s) => s && s.length >= 4);
  const scrub = (text) => secrets.reduce((s, v) => s.split(v).join("[secret]"), String(text));
  return (url, params) => {
    if (!url.startsWith(`https://${env.KF_DOMAIN}/`)) throw new Error("refused: a call to another host");
    if (lastReal) sleep(lastReal + paceMs - now());
    if (sleep === sleepMs) waitForWindow(); // 22 Oct night: the shared key is split with the app session (it calls in :00-:29)
    lastReal = now();
    const dir = mkdtempSync(resolve(tmpRoot, CURL_PREFIX));
    chmodSync(dir, 0o700);
    activeDirs.add(dir);
    try {
      const hdr = resolve(dir, "h");
      writeFileSync(hdr, `X-Access-Key-Id: ${env.KF_ACCESS_KEY_ID}\nX-Access-Key-Secret: ${env.KF_ACCESS_KEY_SECRET}\n`, { mode: 0o600 });
      chmodSync(hdr, 0o600);
      const method = String(params.method || "get").toUpperCase();
      const argv = ["-sS", "--max-time", "120", "-X", method, "-H", `@${hdr}`, "-D", resolve(dir, "rh"), "-o", resolve(dir, "rb"), "-w", "%{http_code}"];
      if (typeof params.payload === "string") {
        writeFileSync(resolve(dir, "b"), params.payload, { mode: 0o600 });
        argv.push("-H", `Content-Type: ${params.contentType || "application/json"}`, "--data-binary", `@${resolve(dir, "b")}`);
      } else if (params.payload && typeof params.payload === "object") {
        for (const [field, blob] of Object.entries(params.payload)) {
          const f = resolve(dir, `f-${field}`);
          writeFileSync(f, blob.buf, { mode: 0o600 });
          argv.push("-F", `${field}=@${f};type=${blob.getContentType()};filename=${blob.getName()}`);
        }
      }
      argv.push(url);
      let code;
      try {
        code = String(exec("curl", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim();
      } catch (e) {
        throw new Error(`curl failed (exit ${e.status ?? "?"}): ${scrub(String(e.stderr || "").trim()).slice(0, 200)}`);
      }
      const blocks = (existsSync(resolve(dir, "rh")) ? readFileSync(resolve(dir, "rh"), "latin1") : "").split(/\r?\n\r?\n/).filter((b) => b.trim());
      const headers = {};
      for (const line of (blocks.at(-1) ?? "").split(/\r?\n/).slice(1)) {
        const i = line.indexOf(":");
        if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
      return { status: Number(code), headers, body: existsSync(resolve(dir, "rb")) ? readFileSync(resolve(dir, "rb")) : Buffer.alloc(0) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
      activeDirs.delete(dir);
    }
  };
}

/**
 * The service's UrlFetchApp transport. With `apply`, every call goes to `call`. Without, reads go to `call` (case item
 * reads overlaid with the planned changes) and writes are answered locally as Kissflow answers them and recorded.
 * `pdf()` gives the PDF the service attached (or would attach).
 */
export function liveTransport({ domain, apply, call }) {
  const planned = [];
  const overlay = { fields: {}, files: {}, rows: {}, draft: null, realPdf: {} };
  const pdfs = {};
  const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify(body)) });
  const transport = (url, params) => {
    const method = String(params.method || "get").toUpperCase();
    const path = url.replace(/^https:\/\/[^/]+/, "").replace(/\?.*$/, "");
    const file = params.payload && typeof params.payload === "object" ? params.payload.file : null;
    const target = /\/admin\/(CIQ_Case_A00|CIQP_Request_A00)\/([A-Za-z0-9_-]+)\/Final_PDF\/attachment$/.exec(path);
    if (file && target) pdfs[target[1]] = { name: file.getName(), bytes: Buffer.from(file.buf) };
    // the harness never posts a webhook (MAIL_ENABLED is false here; this is a second guard)
    if (/^\/integration\//.test(path)) throw new Error("refused: the live harness never posts a webhook");
    if (apply) return call(url, params);
    const isRead = method === "GET" || (method === "POST" && path.endsWith("/list"));
    if (isRead) {
      const row = /\/form\/2\/[^/]+\/CIQ_Audit_Event_A00\/(planned-[a-z-]+)$/.exec(path);
      if (row) return overlay.rows[row[1]] ? json(200, overlay.rows[row[1]]) : json(404, { error_code: "NotFound" });
      const dl = /\/(?:CIQ_Case_A00|CIQP_Request_A00)\/[^/]+\/Final_PDF\/attachment\/(planned-[a-z-]+)$/.exec(path);
      if (dl) return { status: 302, headers: { Location: `https://${domain}/planned-signed/${dl[1]}` }, body: Buffer.alloc(0) };
      const signed = /^\/planned-signed\/(planned-[a-z-]+)$/.exec(path);
      if (signed) return { status: 200, headers: { "Content-Type": "application/pdf" }, body: overlay.files[signed[1]] };
      const r = call(url, params);
      const im = /\/admin\/(CIQ_Case_A00|CIQP_Request_A00)\/([A-Za-z0-9_-]+)$/.exec(path);
      const item = im && [null, `${im[1]}/${im[2]}`];
      if (!item || r.status !== 200) return r;
      let real;
      try {
        real = JSON.parse(Buffer.isBuffer(r.body) ? r.body.toString("utf8") : String(r.body));
      } catch {
        return r; // not JSON (a challenge page): the service pauses on it
      }
      overlay.realPdf[item[1]] = Array.isArray(real.Final_PDF) ? real.Final_PDF : [];
      return overlay.fields[item[1]] ? { ...r, body: Buffer.from(JSON.stringify({ ...real, ...overlay.fields[item[1]] })) } : r;
    }
    // a write: recorded, answered as Kissflow answers it
    const body = typeof params.payload === "string" ? JSON.parse(params.payload) : undefined;
    planned.push({ method, path, ...(body !== undefined ? { body } : {}), ...(file ? { file: { part: "file", name: file.getName(), type: file.getContentType(), bytes: file.buf.length, sha256: createHash("sha256").update(file.buf).digest("hex") } } : {}) });
    let m = target;
    if (m && file) {
      const key = `${m[1]}/${m[2]}`;
      const pid = m[1] === "CIQ_Case_A00" ? "planned-attachment" : "planned-portal-attachment";
      const list = [...(overlay.fields[key]?.Final_PDF ?? overlay.realPdf[key] ?? []), { key: "Final_PDF", id: pid, name: file.getName(), size: file.buf.length, fileExtension: "pdf" }];
      overlay.fields[key] = { ...(overlay.fields[key] ?? {}), Final_PDF: list };
      overlay.files[pid] = Buffer.from(file.buf);
      return json(200, { Final_PDF: list, _id: m[2] });
    }
    m = /\/admin\/CIQ_Case_A00\/([A-Za-z0-9_-]+)$/.exec(path);
    if (m && method === "PUT") {
      const key = `CIQ_Case_A00/${m[1]}`;
      overlay.fields[key] = { ...(overlay.fields[key] ?? {}), ...body };
      return json(200, { ...body, _id: m[1] });
    }
    if (/\/form\/2\/[^/]+\/CIQ_Audit_Event_A00$/.test(path) && method === "POST") {
      overlay.draft = { ...body, _id: "draft_planned", _is_draft: true };
      return json(200, overlay.draft);
    }
    if (/\/CIQ_Audit_Event_A00\/draft_planned\/submit$/.test(path)) {
      const { _is_draft, ...row } = overlay.draft ?? {};
      overlay.rows["planned-audit-row"] = { ...row, _id: "planned-audit-row" };
      return json(200, overlay.rows["planned-audit-row"]);
    }
    m = /\/CIQ_Audit_Event_A00\/(planned-[a-z-]+)$/.exec(path);
    if (m && method === "POST") {
      overlay.rows[m[1]] = { ...overlay.rows[m[1]], ...body };
      return json(200, { ...body, _id: m[1] });
    }
    return json(400, { error_code: "PlannedWriteUnknown", en_message: `the dry run does not model ${method} ${path}` });
  };
  return { transport, planned, pdf: () => pdfs.CIQ_Case_A00 ?? null, portalPdf: () => pdfs.CIQP_Request_A00 ?? null };
}

/** The Script Properties of a harness run: .env's connection, MAIL_ENABLED false, 8 s pacing, plus the saved state.
 *  RUN_LIMIT_S 3600: Apps Script's 6-min run limit does not apply in node, and 8 s pacing needs longer. */
export const liveProps = (env, saved = {}) => ({ ...saved, KF_DOMAIN: env.KF_DOMAIN, KF_ACCOUNT_ID: env.KF_ACCOUNT_ID, KF_APP_ID: "CIQ_Digital_A00", KF_ACCESS_KEY_ID: env.KF_ACCESS_KEY_ID, KF_ACCESS_KEY_SECRET: env.KF_ACCESS_KEY_SECRET, TIME_ZONE: "Europe/Berlin", MAIL_ENABLED: "false", PACE_MS: String(PACE_MS), RUN_LIMIT_S: "3600" });
/** What is kept between runs: the service's own state (pause, done ids, FD_ resume state), never the connection. */
export const keptState = (store) => Object.fromEntries([...store].filter(([k]) => !/^KF_|^PACE_MS$|^MAIL_ENABLED$|^TIME_ZONE$|^RUN_LIMIT_S$/.test(k)));
/** What a run writes back to out/live-state.json. An --apply run: its state. A dry run: the saved state with only
 *  PAUSE_UNTIL updated (its done ids and FD_ state name planned ids and hashes that never reached Kissflow). */
export function stateToSave(store, saved, apply) {
  if (apply) return keptState(store);
  const out = { ...saved };
  if (store.get("PAUSE_UNTIL")) out.PAUSE_UNTIL = store.get("PAUSE_UNTIL");
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const caseItemId = args.find((a) => !a.startsWith("--"));
  if (!caseItemId || !/^[A-Za-z0-9_-]{6,40}$/.test(caseItemId)) {
    console.error("Usage: node kissflow-build/final-pdf/test/live.mjs <caseItemId> [--apply]");
    process.exit(2);
  }
  const { loadEnv } = await import("../../lib/kf.mjs");
  const env = loadEnv();
  const why = refusal(env);
  if (why) {
    console.error(why);
    process.exit(3);
  }
  const swept = sweepCurlDirs(tmpdir()) + sweepCurlDirs(OUT, ".curl-");
  if (swept) console.log(`Removed ${swept} curl folder(s) a killed run left behind.`);
  process.on("exit", removeActiveCurlDirs);
  const secrets = [env.KF_ACCESS_KEY_ID, env.KF_ACCESS_KEY_SECRET].filter((s) => s && s.length >= 4);
  const scrub = (text) => secrets.reduce((s, v) => s.split(v).join("[secret]"), String(text));
  const maskMail = (text) => String(text).replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "$1***@$2");

  mkdirSync(OUT, { recursive: true });
  const STATE = resolve(OUT, "live-state.json");
  const saved = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
  const store = new Map(Object.entries(liveProps(env, saved)));
  const live = liveTransport({ domain: env.KF_DOMAIN, apply, call: curlCall({ env }) });
  console.log(`CIQ final document, live harness: dev sandbox, case item ${caseItemId}, ${apply ? "APPLY (writes go to Kissflow)" : "dry run (reads only)"}, ${PACE_MS / 1000} s between calls`);
  const ex = execution({ fetch: live.transport, store, onLog: (line) => console.log(`  ${maskMail(scrub(line))}`) });
  let result;
  try {
    result = ex.call("runOnce", caseItemId);
  } finally {
    writeFileSync(STATE, JSON.stringify(stateToSave(store, saved, apply), null, 1) + "\n");
  }
  console.log(`\nResult: ${result.ok ? "ok" : "not done"}: ${scrub(result.status)}`);
  const pdf = live.pdf();
  if (pdf) {
    const file = resolve(OUT, pdf.name);
    writeFileSync(file, pdf.bytes);
    console.log(`PDF: ${file} (${pdf.bytes.length} bytes, SHA-256 ${createHash("sha256").update(pdf.bytes).digest("hex")})`);
  }
  if (!apply) {
    console.log(`\nPlanned writes (${live.planned.length}; nothing was written):`);
    for (const w of live.planned) console.log(maskMail(scrub(`- ${w.method} ${w.path.split(env.KF_ACCOUNT_ID).join("{acc}")}\n  ${JSON.stringify(w.file ?? w.body ?? {}, null, 1).replace(/\n/g, "\n  ")}`)));
    console.log("\nIn Apps Script with MAIL_ENABLED on, the service also mails the RMM owner, and the audit row then carries Notify_Recipient and Notify_Channel.");
  }
  if (Number(store.get("PAUSE_UNTIL") || 0) > Date.now()) console.log(`\nPAUSED until ${new Date(Number(store.get("PAUSE_UNTIL"))).toISOString()}: a 429 or a challenge page. Both sessions stop for 20 min (shared key).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
