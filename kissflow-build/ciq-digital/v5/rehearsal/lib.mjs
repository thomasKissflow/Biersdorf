// Shared helpers for the v5 graft rehearsal (plan-v5-final §15 night step 1) on the approved TEST flows only.
// Every call goes through writer() (meta.mjs), logged to requests.jsonl without credentials.
// GUARD: any non-GET call whose path does not name one of the ZZ test flows/lists is refused before it is sent.
import { fileURLToPath } from "node:url";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { writer, preflight, kinds } from "../../../lib/meta.mjs";

export const here = (f) => fileURLToPath(new URL(f, import.meta.url));
export const APP = "CIQ_Digital_A00";
export const Q = `_application_id=${APP}`;
export const CASE = "CIQ_ZZ_Spike_Case_A00";
export const POINT = "CIQ_ZZ_Spike_Point_A00";
export const L_YESNO = "CIQ_ZZ_Spike_Yes_No_A00";
export const L_DEC = "CIQ_ZZ_Spike_Decision_A00";
export const ROLE_A = "RoEKHLFdFsUJ", ROLE_B = "RoEKHLGDsV2J";
export const THOMAS = "UsEJUfjYLM8Y";
const ALLOWED = [CASE, POINT, L_YESNO, L_DEC];

const raw = writer(here("./requests.jsonl"));
if (raw.acc !== "AcDOSunMEpSA" || raw.kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
let last = 0;
const GAP_MS = 1000; // pacing: the CDN answered 429 "Just a moment…" after a burst on 14 Oct; never bypass it, just go slower
async function call(method, path, body) {
  if (method !== "GET" && !ALLOWED.some((id) => path.includes(`/${id}`))) throw new Error(`GUARD: refused ${method} ${path} (not a ZZ test flow)`);
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const r = await raw.call(method, path, body);
  // Cloudflare challenge = an HTML string body (any status); Kissflow's own errors are JSON. Never continue on HTML.
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`HTML challenge (status ${r.status}) on ${method} ${path}: STOP and wait for the coordinator's go`);
  if (r.status === 429) throw new Error(`Kissflow 429 on ${method} ${path}: retry later`);
  return r;
}
export const A = raw.acc;
export const w = {
  acc: A, call, log: raw.log,
  getDraft: (type, id) => call("GET", `/metadata/2/${A}/${type}/${id}/draft`),
  putDraft: (type, id, blob) => call("PUT", `/metadata/2/${A}/${type}/${id}/draft`, blob),
  publish: (type, id) => call("POST", `/metadata/2/${A}/${type}/${id}/publish`, {}),
  putListItems: (id, items) => call("POST", `/flow/2/${A}/list/${id}/items`, { ListItems: items }),
  getListItems: (id) => call("GET", `/flow/2/${A}/list/${id}/items`),
};
export { preflight, kinds };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const ents = (b) => Object.values(b).filter((e) => e && typeof e === "object" && e.Kind);

/** Save a JSON evidence file under rehearsal/ (creates subfolders). */
export function save(rel, data) {
  const p = here("./" + rel);
  mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 1));
  return p;
}
export const load = (rel) => JSON.parse(readFileSync(here("./" + rel), "utf8"));
export const exists = (rel) => existsSync(here("./" + rel));

/** GET the live draft; if `tag` given, save it once as originals/<flow>.<tag>.json (never overwritten). */
export async function snapshot(type, id, tag) {
  const r = await w.getDraft(type, id);
  if (r.status !== 200 || !r.body || typeof r.body !== "object" || Array.isArray(r.body) || !r.body[id] || r.body.Root !== id)
    throw new Error(`getDraft ${id} → ${r.status}: not a JSON draft with model key ${id}; aborting before any change`);
  if (tag) { const rel = `originals/${id}.${tag}.json`; if (!exists(rel)) save(rel, r.body); }
  return r.body;
}

/** Entity-level difference between two drafts. */
export function draftDiff(live, next) {
  const label = (k, e) => `${k} ${e?.Kind ?? "?"} ${e?.Name ?? ""}`.trim();
  const keys = new Set([...Object.keys(live || {}), ...Object.keys(next || {})]);
  const out = { added: [], removed: [], changed: [] };
  for (const k of keys) {
    if (["PublishedAt", "_meta_version", "CurrentVersion", "ModifiedAt", "ModifiedBy"].includes(k)) continue;
    if (!(k in (live || {}))) out.added.push(label(k, next[k]));
    else if (!(k in (next || {}))) out.removed.push(label(k, live[k]));
    else if (JSON.stringify(live[k]) !== JSON.stringify(next[k])) {
      const props = [...new Set([...Object.keys(live[k] || {}), ...Object.keys(next[k] || {})])].filter((p) => JSON.stringify(live[k]?.[p]) !== JSON.stringify(next[k]?.[p]));
      out.changed.push({ entity: label(k, next[k]), props: Object.fromEntries(props.map((p) => [p, { was: live[k]?.[p], now: next[k]?.[p] }])) });
    }
  }
  return out;
}

/** putDraft → publish → read back; returns statuses + the read-back draft. Throws nothing; caller decides. */
export async function putPublish(type, id, blob) {
  if (!blob || typeof blob !== "object" || !blob[id] || blob.Root !== id) return { ok: false, stage: "guard", errors: ["blob is not a draft of " + id] };
  const pf = preflight(id, blob);
  if (pf.errors.length) return { ok: false, stage: "preflight", errors: pf.errors };
  let pd, pub;
  try { pd = await w.putDraft(type, id, blob); } catch (e) { return { ok: false, stage: "putDraft", error: e.message }; }
  if (pd.status >= 300) return { ok: false, stage: "putDraft", status: pd.status, body: JSON.stringify(pd.body).slice(0, 600) };
  try { pub = await w.publish(type, id); } catch (e) { return { ok: false, stage: "publish", putDraft: pd.status, error: e.message }; }
  if (pub.status >= 300) return { ok: false, stage: "publish", putDraft: pd.status, status: pub.status, body: JSON.stringify(pub.body).slice(0, 600) };
  let back = null;
  for (let i = 0; i < 4 && !back; i++) { try { back = (await w.getDraft(type, id)).body; } catch { await sleep(30000); } }
  return { ok: true, putDraft: pd.status, publish: pub.status, publishedAt: back?.PublishedAt, back, warnings: pf.warnings.length };
}

/** Published (resolved) field list of a process. */
export async function publishedFields(id) {
  const r = await w.call("GET", `/process/2/${A}/${id}/fields?${Q}`);
  const arr = Array.isArray(r.body) ? r.body : r.body?.Fields || r.body?.Data || r.body;
  return { status: r.status, body: arr };
}

// ── runtime helpers (the key acts as Thomas) ──
export const adminGet = async (proc, item) => (await w.call("GET", `/process/2/${A}/admin/${proc}/${item}?${Q}`)).body || {};
export const ctx = (s) => (s._current_context || []).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id, assignedTo: x._context_assigned_to ?? x._context_assignee ?? undefined }));
export async function createItem(proc, body) { return w.call("POST", `/process/2/${A}/${proc}?${Q}`, body); }
export async function submit(proc, item, act) { return w.call("POST", `/process/2/${A}/${proc}/${item}/${act}/submit?${Q}`, {}); }
export async function adminPut(proc, item, body) { return w.call("PUT", `/process/2/${A}/admin/${proc}/${item}?${Q}`, body); }
export async function assigneeUpdate(proc, item, act, body) { return w.call("POST", `/process/2/${A}/${proc}/${item}/${act}?${Q}`, body); }
export async function withdraw(proc, item, Comment) { return w.call("POST", `/process/2/${A}/${proc}/${item}/withdraw?${Q}`, { Comment }); }

/** Summarise a process draft: steps in order (incl. branches), resource, condition, permission count. */
export function steps(b) {
  const root = b[b.Root];
  const pd = ents(b).find((e) => e.Kind === "ProcessDef" && e.WorkflowType === "Sequence") || ents(b).find((e) => e.Kind === "ProcessDef" && !e.Activity);
  const one = (aid, depth = 0) => {
    const a = b[aid]; if (!a) return [{ id: aid, missing: true }];
    const res = (a["Activity::Resource"] || []).map((r) => b[r]).filter(Boolean).map((r) => `${r.ValueType}:${r.DisplayValue || r.Value}`);
    const cond = (a["Activity::Expression"] || []).map((x) => b[x]?.ExpressionStr).filter(Boolean);
    const row = { id: a.Id, name: a.Name, type: a.NodeType, depth, res: res.join(","), cond: cond.join(" | "), perms: (a["Activity::Permission"] || []).length };
    const kids = (a["Activity::ProcessDef"] || []).flatMap((p) => (b[p]?.["ProcessDef::Activity"] || []).flatMap((x) => one(x, depth + 1)));
    return [row, ...kids];
  };
  return { model: root?.Id, processDef: pd?.Id, order: (pd?.["ProcessDef::Activity"] || []).flatMap((x) => one(x)) };
}

// ── graft helpers ──
/** Set the Permission level of (activity, column), updating in place; creates one if missing. */
export function setPerm(b, actId, colId, level) {
  const act = b[actId];
  let p = (act["Activity::Permission"] || []).map((id) => b[id]).find((x) => x && x.Column === colId);
  if (!p) throw new Error(`no permission for ${actId} × ${colId}`);
  p.Permission = level;
  return p.Id;
}
/** Remove Permission entities that the add-field verb puts on Parallel / SendBackToInitiator activities
 *  (the platform's own shape has no permissions there). Returns the removed ids. */
export function stripNonTaskPerms(b, colId) {
  const removed = [];
  for (const a of ents(b).filter((e) => e.Kind === "Activity" && !["StartEvent", "UserTask", "EndEvent"].includes(e.NodeType))) {
    const keep = [];
    for (const pid of a["Activity::Permission"] || []) { if (b[pid]?.Column === colId) { delete b[pid]; removed.push(`${a.Id}:${pid}`); } else keep.push(pid); }
    if (a["Activity::Permission"]) { if (keep.length) a["Activity::Permission"] = keep; else delete a["Activity::Permission"]; }
  }
  return removed;
}
/** Remove activities (and, for a Parallel node, its branch ProcessDefs and their activities, recursively)
 *  with every Permission, Resource and Expression (+ Node tree) that belongs to them, and unlink them from
 *  their parent ProcessDef. Returns the removed entity ids by kind. Throws if anything still refers to a removed id. */
export function removeActivities(b, actIds) {
  const gone = new Set();
  const dropNode = (id) => { const n = b[id]; if (!n || gone.has(id)) return; gone.add(id); for (const c of n["Node::Node"] || []) dropNode(c); };
  const dropAct = (aid) => {
    const a = b[aid]; if (!a) throw new Error(`no activity ${aid}`);
    gone.add(aid);
    for (const pid of a["Activity::Permission"] || []) gone.add(pid);
    for (const e of ents(b)) if (e.Kind === "Permission" && e.Activity === aid) gone.add(e.Id);
    for (const rid of a["Activity::Resource"] || []) gone.add(rid);
    for (const e of ents(b)) if (e.Kind === "Resource" && e.Activity === aid) gone.add(e.Id);
    const exprs = new Set([...(a["Activity::Expression"] || []), ...ents(b).filter((e) => e.Kind === "Expression" && e.Activity === aid).map((e) => e.Id)]);
    for (const x of exprs) { gone.add(x); for (const n of b[x]?.["Expression::Node"] || []) dropNode(n); }
    for (const pd of a["Activity::ProcessDef"] || []) { gone.add(pd); for (const child of b[pd]?.["ProcessDef::Activity"] || []) dropAct(child); }
  };
  for (const aid of actIds) {
    const parent = b[b[aid]?.ProcessDef];
    dropAct(aid);
    if (parent) parent["ProcessDef::Activity"] = (parent["ProcessDef::Activity"] || []).filter((x) => x !== aid);
  }
  // Nodes whose Expression was removed but were not reached through the tree
  for (const e of ents(b)) if (e.Kind === "Node" && gone.has(e.Expression)) dropNode(e.Id);
  const byKind = {};
  for (const id of gone) { const k = b[id]?.Kind || "?"; (byKind[k] = byKind[k] || []).push(id); delete b[id]; }
  // dangling scan: no remaining value may name a removed id
  const dangling = [];
  for (const [k, v] of Object.entries(b)) {
    if (!v || typeof v !== "object") continue;
    for (const [p, val] of Object.entries(v)) for (const x of Array.isArray(val) ? val : [val]) if (typeof x === "string" && gone.has(x)) dangling.push(`${k}.${p}→${x}`);
  }
  if (dangling.length) throw new Error(`dangling refs after removal: ${dangling.slice(0, 10).join(", ")}`);
  return Object.fromEntries(Object.entries(byKind).map(([k, ids]) => [k, ids.length]));
}

/** Walk an item: submit whatever step it is at (one at a time, P3) until Completed / stuck. Records step, role/user, status. */
export async function walk(proc, item, { maxHops = 12, pause = 1500, before } = {}) {
  const path = [];
  for (let hop = 0; hop < maxHops; hop++) {
    await sleep(pause);
    const s = await adminGet(proc, item);
    if (s._status !== "InProgress") { path.push({ end: true, status: s._status, step: s._current_step ?? null }); break; }
    const cs = (s._current_context || []).filter((c) => c._context_activity_instance_id);
    if (!cs.length) { path.push({ stuck: true, status: s._status }); break; }
    const c = cs[0];
    const rec = { step: c._context_current_step, activity: c._context_activity_id, assignedTo: (c._context_assigned_to || []).map((x) => `${x.Kind}:${x.Name}`), parallelOpen: cs.length };
    if (before) Object.assign(rec, await before(rec, s, c));
    const r = await submit(proc, item, c._context_activity_instance_id);
    rec.submit = r.status; if (r.status >= 300) rec.submitErr = r.body?.en_message || r.body?.message || JSON.stringify(r.body).slice(0, 200);
    path.push(rec);
    if (r.status >= 300) break;
  }
  return path;
}
export const pathText = (startName, path) => [startName, ...path.map((p) => (p.end ? `${p.status}` : p.stuck ? "STUCK" : `${p.step}[${p.assignedTo.join("+")}]${p.submit >= 300 ? "!" + p.submit : ""}`))].join(" → ");

/** GET list items; returns the array only when status 200 and every item is a string, else throws. */
export async function listItemsStrict(id) {
  const r = await w.getListItems(id);
  const arr = Array.isArray(r.body) ? r.body : r.body?.ListItems;
  if (r.status !== 200 || !Array.isArray(arr) || !arr.every((x) => typeof x === "string")) throw new Error(`list ${id} → ${r.status}: not a JSON string array; aborting`);
  return arr;
}
