// B1 helpers (plan-v5-final §5 lists + §4.1 CIQ Case), night 2026-10-14.
// Reuses the PROVEN pure graft helpers of the rehearsal (rehearsal/lib.mjs: removeActivities, setPerm, stripNonTaskPerms,
// draftDiff, steps). Every call goes through ONE paced wrapper (>= 1 s between calls, NO automatic retries), logged to
// b1/requests.jsonl without credentials.
// GUARDS:
//  - DEV only (account AcDOSunMEpSA, dev-beiersdorf.kissflow.eu);
//  - any non-GET whose path does not name CIQ_Case_A00 or one of the B1 lists is refused before it is sent
//    (role and member routes are refused outright: no grants, no role changes tonight);
//  - a 429 or an HTML body (Cloudflare challenge) throws STOP; the caller must not continue.
import { fileURLToPath } from "node:url";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { writer, preflight, kinds } from "../../../lib/meta.mjs";
import { removeActivities, setPerm, stripNonTaskPerms, draftDiff, steps, ents, clone, sleep } from "../rehearsal/lib.mjs";

export const here = (f) => fileURLToPath(new URL(f, import.meta.url));
export const APP = "CIQ_Digital_A00";
export const Q = `_application_id=${APP}`;
export const CASE = "CIQ_Case_A00";
export const NEW_LISTS = [
  { name: "CIQ Case Phase", items: ["Supplier filling in the CIQ", "Review", "Awaiting final release", "Completed", "Cancelled"] },
  { name: "CIQ Track Status", items: ["In review", "Waiting for supplier", "Reopened", "Completed", "Ended"] },
  { name: "CIQ Priority", items: ["Normal", "High"] },
  { name: "CIQ Rejection Handling", items: ["Continue to final release", "Cancel the case"] },
  { name: "CIQ Request Status", items: ["Done", "Refused", "Failed"] },
];
export const CHANGED_LISTS = [
  { id: "CIQ_OP_Kind_A00", add: ["Finding"] },
  { id: "CIQ_OP_Outcome_A00", add: ["Not accepted"] },
  { id: "CIQ_Event_Category_A00", add: ["Supplier master", "Review", "Internal note"] },
];
export const listIdOf = (name) => `${name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}_A00`;
const ALLOWED_WRITE = [CASE, ...NEW_LISTS.map((l) => listIdOf(l.name)), ...CHANGED_LISTS.map((l) => l.id)];

const raw = writer(here("./requests.jsonl"));
if (raw.acc !== "AcDOSunMEpSA" || raw.kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
let last = 0;
const GAP_MS = 1100;
export async function call(method, path, body) {
  if (/\/app_role\/|\/member/.test(path) && method !== "GET") throw new Error(`GUARD: refused ${method} ${path} (no grants or role changes tonight)`);
  const isListCreate = method === "POST" && path.startsWith(`/flow/2/${raw.acc}/list/?_application_id=${APP}`);
  if (method !== "GET" && !isListCreate && !ALLOWED_WRITE.some((id) => path.includes(`/${id}/`) || path.endsWith(`/${id}`) || path.includes(`/${id}?`)))
    throw new Error(`GUARD: refused ${method} ${path} (outside B1 scope)`);
  if (isListCreate && !NEW_LISTS.some((l) => l.name === body?.Name)) throw new Error(`GUARD: refused list create ${body?.Name}`);
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const r = await raw.kf.call(method, path, body, { retries: 0 });
  raw.log({ method, path, status: r.status, req: body === undefined ? undefined : trim(body), res: trim(r.body) });
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge (status ${r.status}) on ${method} ${path}`);
  if (r.status === 429) throw new Error(`STOP: 429 on ${method} ${path}`);
  return r;
}
function trim(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return s && s.length > 1500 ? s.slice(0, 1500) + `…(+${s.length - 1500})` : v; }
export const A = raw.acc;

export function save(rel, data) { const p = here("./" + rel); mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); writeFileSync(p, JSON.stringify(data, null, 1)); return p; }
export const load = (rel) => JSON.parse(readFileSync(here("./" + rel), "utf8"));
export const exists = (rel) => existsSync(here("./" + rel));
/** v5/originals/<name>: written once, never overwritten. */
export function saveOriginal(name, data) { const p = here("../originals/" + name); if (!existsSync(p)) writeFileSync(p, JSON.stringify(data, null, 1)); return p; }

export async function getDraftStrict(id) {
  const r = await call("GET", `/metadata/2/${A}/process/${id}/draft`);
  if (r.status !== 200 || !r.body || typeof r.body !== "object" || Array.isArray(r.body) || !r.body[id] || r.body.Root !== id)
    throw new Error(`getDraft ${id} → ${r.status}: not a JSON draft with model key ${id}; aborting before any change`);
  return r.body;
}
export async function listItemsStrict(id) {
  const r = await call("GET", `/flow/2/${A}/list/${id}/items`);
  const arr = Array.isArray(r.body) ? r.body : r.body?.ListItems;
  if (r.status !== 200 || !Array.isArray(arr) || !arr.every((x) => typeof x === "string")) throw new Error(`list ${id} → ${r.status}: not a JSON string array; aborting`);
  return arr;
}
export async function appLists() {
  const r = await call("GET", `/flow/2/${A}/list/?${Q}&page_number=1&page_size=300`);
  const arr = Array.isArray(r.body) ? r.body : r.body?.Data;
  if (r.status !== 200 || !Array.isArray(arr)) throw new Error(`app list listing → ${r.status}; aborting`);
  return arr;
}
export const adminGet = async (proc, item) => (await call("GET", `/process/2/${A}/admin/${proc}/${item}?${Q}`));

/** putDraft → publish → read back (GET draft). No retries; a non-2xx stops. */
export async function putPublish(id, blob) {
  if (!blob || typeof blob !== "object" || !blob[id] || blob.Root !== id) return { ok: false, stage: "guard", errors: ["blob is not a draft of " + id] };
  const pf = preflight(id, blob);
  if (pf.errors.length) return { ok: false, stage: "preflight", errors: pf.errors };
  const pd = await call("PUT", `/metadata/2/${A}/process/${id}/draft`, blob);
  if (pd.status >= 300) return { ok: false, stage: "putDraft", status: pd.status, body: JSON.stringify(pd.body).slice(0, 800) };
  const pub = await call("POST", `/metadata/2/${A}/process/${id}/publish`, {});
  if (pub.status >= 300) return { ok: false, stage: "publish", putDraft: pd.status, status: pub.status, body: JSON.stringify(pub.body).slice(0, 800) };
  await sleep(1500);
  const back = await getDraftStrict(id);
  return { ok: true, putDraft: pd.status, publish: pub.status, publishedAt: back.PublishedAt, back, warnings: pf.warnings.length };
}
export async function restore(id, live) {
  const rp = await call("PUT", `/metadata/2/${A}/process/${id}/draft`, live);
  const rb = await call("POST", `/metadata/2/${A}/process/${id}/publish`, {});
  const back = await getDraftStrict(id);
  return { putDraft: rp.status, publish: rb.status, diffVsOriginal: draftDiff(live, back) };
}
export async function publishedFields(id) {
  const r = await call("GET", `/process/2/${A}/${id}/fields?${Q}`);
  const arr = Array.isArray(r.body) ? r.body : r.body?.Fields || r.body?.Data || r.body;
  return { status: r.status, body: arr };
}

/** Per-step summary of field permission levels: { activityName: { level: [fieldIds] } } (field columns only). */
export function permMatrix(b) {
  const colToField = {};
  for (const e of ents(b)) if (e.Kind === "Field" && e.Column && e.Model === b.Root) colToField[e.Column] = e.Id;
  const out = {};
  for (const a of ents(b).filter((e) => e.Kind === "Activity" && ["StartEvent", "UserTask", "EndEvent"].includes(e.NodeType))) {
    const m = {};
    for (const pid of a["Activity::Permission"] || []) { const p = b[pid]; const f = p && colToField[p.Column]; if (f) (m[p.Permission] = m[p.Permission] || []).push(f); }
    out[`${a.Name} [${a.Id}]`] = m;
  }
  return out;
}

export { removeActivities, setPerm, stripNonTaskPerms, draftDiff, steps, ents, clone, sleep, preflight, kinds };
