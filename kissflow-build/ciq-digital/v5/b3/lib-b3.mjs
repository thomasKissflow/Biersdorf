// B3 helpers (plan-v5-final §4.2, §4.4, §4.5, §4.7, §4.10, §4.11, §4.13), night 2026-10-14/15. Same guard model as
// b2/lib-b2.mjs (one paced wrapper, >= 1.1 s between calls, NO automatic retries, logged to b3/requests.jsonl without
// credentials) and the PROVEN pure graft helpers of the rehearsal (rehearsal/lib.mjs).
// GUARDS:
//  - DEV only (account AcDOSunMEpSA, dev-beiersdorf.kissflow.eu);
//  - role and member routes are refused outright (no grants, no role changes tonight);
//  - a non-GET is sent only when its path names one of the B3 flows (ALLOWED_WRITE), or it is the flow-create POST of
//    one of the 4 B3 names (CREATE_NAMES) in app CIQ_Digital_A00; anything else is refused before it is sent;
//  - a 429 or an HTML body (Cloudflare challenge) throws STOP; the caller must not continue.
import { fileURLToPath } from "node:url";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { writer, preflight, kinds, mergeClean } from "../../../lib/meta.mjs";
import { setPerm, stripNonTaskPerms, draftDiff, steps, ents, clone, sleep } from "../rehearsal/lib.mjs";

export const here = (f) => fileURLToPath(new URL(f, import.meta.url));
export const APP = "CIQ_Digital_A00";
export const Q = `_application_id=${APP}`;
export const CREATE_NAMES = ["CIQ Review", "CIQ Case Data", "CIQ Mail Outbox", "CIQ Service Request"];
export const ALLOWED_WRITE = [
  "CIQ_Review_A00", "CIQ_Case_Data_A00", "CIQ_Mail_Outbox_A00", "CIQ_Service_Request_A00", // new (expected ids; the real ids are added at create)
  "CIQ_Supplier_A00", "CIQ_RMES_Safety_A00", "CIQ_RMES_Regulatory_A00", "CIQ_Internal_Note_A00", // grafts
];

const raw = writer(here("./requests.jsonl"));
if (raw.acc !== "AcDOSunMEpSA" || raw.kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
let last = 0;
const GAP_MS = 1100;
export let calls = 0;
export const allowId = (id) => { if (id && !ALLOWED_WRITE.includes(id)) ALLOWED_WRITE.push(id); };
export async function call(method, path, body) {
  if (/\/app_role|\/member/.test(path) && method !== "GET") throw new Error(`GUARD: refused ${method} ${path} (no grants or role changes tonight)`);
  if (method !== "GET") {
    const isCreate = method === "POST" && /^\/flow\/2\/[^/]+\/(form|process)\/\?_application_id=CIQ_Digital_A00$/.test(path) && CREATE_NAMES.includes(body?.Name);
    const named = ALLOWED_WRITE.some((id) => path.includes(`/${id}/`) || path.endsWith(`/${id}`) || path.includes(`/${id}?`));
    if (!isCreate && !named) throw new Error(`GUARD: refused ${method} ${path} (outside B3 scope)`);
  }
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  calls++;
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

const rows = (b) => (Array.isArray(b) ? b : b?.Data || []);
export async function listFlows(type) {
  const r = await call("GET", `/flow/2/${A}/${type}/?${Q}&page_number=1&page_size=300`);
  if (r.status !== 200 || typeof r.body !== "object") throw new Error(`flow list ${type} → ${r.status}; aborting`);
  return rows(r.body).map((x) => ({ id: x._id, name: x.Name, status: x.Status }));
}
export async function getDraftStrict(type, id) {
  const r = await call("GET", `/metadata/2/${A}/${type}/${id}/draft`);
  if (r.status !== 200 || !r.body || typeof r.body !== "object" || Array.isArray(r.body) || !r.body[id] || r.body.Root !== id)
    throw new Error(`getDraft ${type} ${id} → ${r.status}: not a JSON draft with model key ${id}; aborting before any change`);
  return r.body;
}
/** putDraft → publish → read back (GET draft). No retries; a non-2xx stops. */
export async function putPublish(type, id, blob) {
  if (!blob || typeof blob !== "object" || !blob[id] || blob.Root !== id) return { ok: false, stage: "guard", errors: ["blob is not a draft of " + id] };
  const pf = preflight(id, blob);
  if (pf.errors.length) return { ok: false, stage: "preflight", errors: pf.errors };
  const pd = await call("PUT", `/metadata/2/${A}/${type}/${id}/draft`, blob);
  if (pd.status >= 300) return { ok: false, stage: "putDraft", status: pd.status, body: JSON.stringify(pd.body).slice(0, 800) };
  const pub = await call("POST", `/metadata/2/${A}/${type}/${id}/publish`, {});
  if (pub.status >= 300) return { ok: false, stage: "publish", putDraft: pd.status, status: pub.status, body: JSON.stringify(pub.body).slice(0, 800) };
  await sleep(1500);
  const back = await getDraftStrict(type, id);
  return { ok: true, putDraft: pd.status, publish: pub.status, publishedAt: back.PublishedAt, back, warnings: pf.warnings.length };
}
export async function restore(type, id, live) {
  const rp = await call("PUT", `/metadata/2/${A}/${type}/${id}/draft`, live);
  const rb = await call("POST", `/metadata/2/${A}/${type}/${id}/publish`, {});
  const back = await getDraftStrict(type, id);
  return { putDraft: rp.status, publish: rb.status, diffVsOriginal: draftDiff(live, back) };
}
/** Published runtime fields: GET /{type}/2/{acc}/{id}/allfields → { ids, tables } (root field ids and child model ids). */
export async function allFields(type, id) {
  const r = await call("GET", `/${type}/2/${A}/${id}/allfields?${Q}`);
  // live shape (14 Oct snapshots): { [id]: { Id, Name, Tables:[childId…], Fields:[{Id,Type,Required…}], [childId]: { Fields:[…] }, System, Workflow } }
  const root = r.status === 200 && r.body && typeof r.body === "object" ? r.body[id] ?? null : null;
  const fields = (root?.Fields || []).filter((f) => f && !f.IsSystemField).map((f) => ({ id: f.Id, type: f.Type, required: !!f.Required }));
  const tables = (root?.Tables || []).map((t) => (typeof t === "string" ? t : t?.Id ?? t?._id));
  const childFields = Object.fromEntries(tables.map((t) => [t, (root?.[t]?.Fields || []).filter((f) => f && !f.IsSystemField).map((f) => ({ id: f.Id, type: f.Type, required: !!f.Required }))]));
  return { status: r.status, ids: fields.map((f) => f.id), fields, tables, childFields, workflow: (root?.Workflow || []).map((w) => ({ id: w.Id, name: w.Name })) };
}

export { setPerm, stripNonTaskPerms, draftDiff, steps, ents, clone, sleep, preflight, kinds, mergeClean };
