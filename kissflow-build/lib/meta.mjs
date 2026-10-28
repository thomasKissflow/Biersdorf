// Metadata helpers for building flows over REST (master.md §3.3, §4.10, §4.11), using the old engine's
// pure builders/validators. Every call is appended to a JSONL request log (no credentials, bodies trimmed).
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { client } from "./kf.mjs";
import { validateBlob, errors as blobErrors, checkHygiene } from "../../tools/kissflow-app-agents-1.6.0/engine/validators.mjs";

export function writer(logFile) {
  const kf = client({ readOnly: false });
  mkdirSync(dirname(logFile), { recursive: true });
  const log = (entry) => appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  async function call(method, path, body) {
    const r = await kf.call(method, path, body);
    log({ method, path, status: r.status, req: body === undefined ? undefined : trim(body), res: trim(r.body) });
    return r;
  }
  const acc = kf.acc;
  return {
    kf, acc, call, log,
    listFlows: (type, app) => call("GET", `/flow/2/${acc}/${type}/?_application_id=${app}&page_number=1&page_size=300`),
    createFlow: (type, app, Name, Description = "") => call("POST", `/flow/2/${acc}/${type}/?_application_id=${app}`, { Name, Description }),
    getDraft: (type, id) => call("GET", `/metadata/2/${acc}/${type}/${id}/draft`),
    // Safety (2026-10-14): never PUT anything that is not a real draft object. A Cloudflare 429 challenge returns an HTML
    // string; merged into a "draft" it would overwrite the flow with garbage. Refuse unless it is an object carrying the model id.
    putDraft: (type, id, blob) => {
      if (!blob || typeof blob !== "object" || Array.isArray(blob) || !blob[id] || typeof blob[id] !== "object")
        return Promise.reject(new Error(`putDraft refused for ${id}: the draft is not a JSON object containing its model id (HTML challenge or bad read?)`));
      return call("PUT", `/metadata/2/${acc}/${type}/${id}/draft`, blob);
    },
    publish: (type, id) => call("POST", `/metadata/2/${acc}/${type}/${id}/publish`, {}),
    putListItems: (id, items) => call("POST", `/flow/2/${acc}/list/${id}/items`, { ListItems: items }),
    getListItems: (id) => call("GET", `/flow/2/${acc}/list/${id}/items`),
  };
}

function trim(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > 1500 ? s.slice(0, 1500) + `…(+${s.length - 1500})` : v;
}

/** Graft a built blob onto the server's starter draft (same rule as engine applyIR PASS 2). */
export function mergeStarter(starter, blob, serverId) {
  const merged = { ...starter };
  for (const [k, v] of Object.entries(blob)) {
    if (k === "Root") continue;
    merged[k] = k === serverId ? { ...starter[serverId], ...v, Id: serverId } : v;
  }
  merged.Root = serverId;
  return merged;
}

export function preflight(label, blob) {
  const issues = [...validateBlob({ label, blob }), ...checkHygiene(blob, label)];
  return { errors: blobErrors(issues), warnings: issues.filter((i) => i.level !== "error") };
}

export const kinds = (blob) => Object.values(blob).reduce((m, e) => (e && e.Kind ? ((m[e.Kind] = (m[e.Kind] || 0) + 1), m) : m), {});

/** Rebuild-safe merge: keep the live draft's top-level metadata, the server-made entities (the synthetic
 *  SendBackToInitiator activity and User records such as PublishedBy) and the root model's server-side
 *  properties; everything else comes from the freshly built blob, so removed or renamed fields leave no orphans. */
export function mergeClean(live, blob, serverId) {
  const out = {};
  for (const [k, v] of Object.entries(live || {})) {
    if (!(v && typeof v === "object" && v.Kind)) { if (k !== "Root") out[k] = v; continue; }
    if (v.Kind === "User" || (v.Kind === "Activity" && (v.NodeType === "SendBackToInitiator" || k === "SendBackToInitiator"))) out[k] = v;
  }
  for (const [k, v] of Object.entries(blob)) {
    if (k === "Root") continue;
    out[k] = k === serverId ? { ...(live?.[serverId] || {}), ...v, Id: serverId } : v;
  }
  out.Root = serverId;
  return out;
}
