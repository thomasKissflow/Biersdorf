// The 21 Oct night tests: shared runner helpers. ONE sequential caller on the shared key (paced 2 s). On a 429 or a
// Cloudflare HTML answer it throws RateLimited; the runner then exits with its state saved and resumes later (both
// sessions pause 20 minutes). Every item a test creates is recorded in manifest.json BEFORE anything else happens to it,
// so the cleanup can find all of them. All test data is fictional and named ZZT-NT-…; nothing touches production,
// CIQ Case - Thomas, flows, roles, permissions or configuration rows.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
export const w = writer(here("./runner-requests.jsonl"));
export const A = w.acc;
export const APP = "CIQ_Digital_A00", PORTAL = "CIQ_Supplier_Portal_A00";
export const QA = `_application_id=${APP}`, QP = `_application_id=${PORTAL}`;
export const THOMAS = { _id: "UsEJUfjYLM8Y", Name: "Thomas", Kind: "User" };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class RateLimited extends Error {}
let calls = 0;
export const callCount = () => calls;
/** 22 Oct night: the shared key is split by time with the app session (it calls in :00-:29, this session in :30-:58),
 *  so every Kissflow call and webhook post here waits for this session's half hour. */
export async function inWindow() {
  for (;;) {
    // 22 Oct morning: while ./HOLD exists (Thomas's dev checks switch his roles) every call waits, like the app session's
    if (existsSync(here("./HOLD"))) { await sleep(15000); continue; }
    const now = new Date(), m = now.getMinutes();
    if (m >= 30 && m <= 58) return;
    const next = new Date(now);
    next.setMinutes(30, 5, 0);
    if (m >= 30) next.setHours(next.getHours() + 1);
    await sleep(Math.max(5000, next - now));
  }
}
export async function call(method, path, body) {
  await sleep(12000); // 22 Oct 05:14: a 429 inside the app session's own window: the limit counts a longer period, so 12 s
  await inWindow(); // 21 Oct: the shared key has a rolling-window limit (429s at ~25 calls/min combined); both sessions pace at 8 s
  calls++;
  const r = await w.call(method, path, body);
  if (r.status === 429 || (typeof r.body === "string" && /<html/i.test(r.body))) throw new RateLimited(`${r.status} on ${method} ${path.split("?")[0]}`);
  return r;
}

// ---- state: manifest of created items, results per scenario (resumable) ----
const MANIFEST = here("./manifest.json"), RESULTS = here("./results.json");
const load = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
export const manifest = load(MANIFEST, { items: [] });
export const results = load(RESULTS, { scenarios: {} });
const saveManifest = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
export const saveResults = () => writeFileSync(RESULTS, JSON.stringify(results, null, 1));
export function markDeleted(id, how) { const x = manifest.items.find((i) => i.id === id); if (x) { x.deleted = how; saveManifest(); } }
export function track(kind, flow, app, id, note = "") {
  if (!manifest.items.some((x) => x.id === id)) manifest.items.push({ kind, flow, app, id, note, at: new Date().toISOString() });
  saveManifest();
}

// ---- assertions ----
export function scenario(id, title) {
  const s = (results.scenarios[id] ||= { id, title, checks: [], done: false });
  s.title = title;
  if (!s.done) { s.attempts = (s.attempts || 0) + 1; s.checks = []; s.startedAt = new Date().toISOString(); } // a re-run starts the scenario afresh
  return {
    s,
    check(label, pass, detail) {
      s.checks.push({ label, pass: !!pass, ...(detail !== undefined ? { detail: typeof detail === "string" ? detail.slice(0, 600) : JSON.parse(JSON.stringify(detail ?? null)) } : {}) });
      console.log(`  ${pass ? "ok  " : "FAIL"} ${id} ${label}${pass ? "" : " — " + JSON.stringify(detail ?? "").slice(0, 300)}`);
      saveResults();
      return !!pass;
    },
    done() { s.done = true; s.pass = s.checks.every((c) => c.pass); saveResults(); },
  };
}

// ---- data integrity helpers ----
export const noMs = (v) => typeof v !== "string" || !/\.\d{3}Z$/.test(v);
export const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
export const plusDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
export function parses(text) { if (text === undefined || text === null || text === "") return true; try { JSON.parse(text); return true; } catch { return false; } }
/** Every key of `want` reads back equal (JSON text compared parsed, so key order or spacing never count). */
export function sameFields(item, want) {
  const diff = [];
  for (const [k, v] of Object.entries(want)) {
    let got = item?.[k];
    if (typeof v === "string" && /_JSON$/.test(k)) { try { if (JSON.stringify(JSON.parse(v)) !== JSON.stringify(JSON.parse(got ?? "null"))) diff.push(k); } catch { if (got !== v) diff.push(k); } continue; }
    if (Array.isArray(v)) { const ids = (x) => (x || []).map((u) => u._id ?? u).sort().join(","); if (ids(v) !== ids(got)) diff.push(k); continue; }
    if (v && typeof v === "object" && v._id) { if ((got?._id ?? got) !== v._id) diff.push(k); continue; }
    if (v === null) { if (got !== undefined && got !== null && got !== "") diff.push(k); continue; }
    if (typeof v === "number") { if (Number(got) !== v) diff.push(k); continue; }
    if (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) { if (Date.parse(got) !== Date.parse(v)) diff.push(k); continue; }
    if (got !== v) diff.push(k);
  }
  return diff;
}

// ---- Kissflow item helpers (process items) ----
export const procGet = async (flow, app, id) => { const r = await call("GET", `/process/2/${A}/admin/${flow}/${id}?_application_id=${app}`); return r.status === 200 ? r.body : null; };
export const actOf = (it) => it?._current_context?.[0]?._context_activity_instance_id;
export async function procCreate(flow, app, data, note) {
  const r = await call("POST", `/process/2/${A}/${flow}?_application_id=${app}`, data);
  if (!r.body?._id) throw new Error(`create ${flow}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  track("process", flow, app, r.body._id, note);
  return r.body; // {_id, _activity_instance_id}
}
export async function procSubmit(flow, app, id, act) {
  const r = await call("POST", `/process/2/${A}/${flow}/${id}/${act}/submit?_application_id=${app}`, {});
  return { status: r.status, body: r.body };
}
/** Submits the item's current step (as Thomas: he must hold it). */
export async function submitCurrent(flow, app, id) {
  const it = await procGet(flow, app, id);
  const r = await procSubmit(flow, app, id, actOf(it));
  const after = await procGet(flow, app, id);
  return { ...r, from: it?._current_step, to: after?._current_step, after };
}
export const adminUpdate = async (flow, app, id, data) => (await call("PUT", `/process/2/${A}/admin/${flow}/${id}?_application_id=${app}`, data)).status;
export async function procDelete(flow, app, id) {
  const d = await call("DELETE", `/process/2/${A}/admin/${flow}/${id}?_application_id=${app}`);
  const g = await call("GET", `/process/2/${A}/admin/${flow}/${id}?_application_id=${app}`);
  return { delete: d.status, after: g.status };
}

// ---- forms ----
export async function formCreate(form, app, data, note) {
  const d = await call("POST", `/form/2/${A}/${form}?_application_id=${app}`, data);
  if (!d.body?._id) throw new Error(`form create ${form}: ${d.status} ${JSON.stringify(d.body).slice(0, 300)}`);
  track("form", form, app, d.body._id, note + " (draft)");
  const s = await call("POST", `/form/2/${A}/${form}/${d.body._id}/submit?_application_id=${app}`, {});
  const id = s.body?._id || d.body._id;
  track("form", form, app, id, note);
  return { id, draftId: d.body._id, submit: s.status };
}
export const formGet = async (form, app, id) => { const r = await call("GET", `/form/2/${A}/${form}/${id}?_application_id=${app}`); return r.status === 200 ? r.body : null; };
export const formUpdate = async (form, app, id, data) => (await call("POST", `/form/2/${A}/${form}/${id}?_application_id=${app}`, data)).status;
export async function formDelete(form, app, id) {
  const d = await call("DELETE", `/form/2/${A}/${form}/${id}?_application_id=${app}`);
  const g = await call("GET", `/form/2/${A}/${form}/${id}?_application_id=${app}`);
  return { delete: d.status, after: g.status };
}

// ---- webhooks (as the screens send them) ----
const STATE = load(here("../night-2026-10-20/integrations/state.json"), { integrations: {} });
export const HOOK = {
  "case.started": "I1", "request.changed": "RC", "completeness.confirmed": "I2", "query.answered": "I4", "review.reopened": "I6", "release.given": "I7",
  "op.round": "P_op_round", "op.edited": "P_op_edited", "op.closed": "P_op_closed", "release.requested": "P_release_requested", "history.updated": "P_history_updated", "case.cancelled": "P_case_cancelled",
};
let hookSeq = 0;
export async function hook(code, payload) {
  const url = STATE.integrations[HOOK[code]]?.webhookUrl;
  if (!url) throw new Error(`no URL for ${code}`);
  await sleep(300);
  await inWindow();
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ ...payload, idempotencyKey: `ZZT-NT-${code}-${Date.now().toString(36)}-${++hookSeq}` }) });
  appendFileSync(here("./runner-webhooks.jsonl"), JSON.stringify({ at: new Date().toISOString(), code, payload, status: r.status }) + "\n");
  return r.status;
}
/** Polls `fn` every 5 s until it returns something truthy (or the time runs out → null). */
export async function until(fn, ms = 60000) {
  for (let t = 0; t <= ms; t += 5000) { await sleep(5000); const v = await fn(); if (v) return v; }
  return null;
}
