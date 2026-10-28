// Independent verifier (night 2026-10-14): GET-only paced client. Any non-GET is refused (the smoke script has its own guard).
// >= 1.2 s between calls, no retries; a 429 or an HTML body throws STOP. Log: verify/requests.jsonl (no credentials).
import { fileURLToPath } from "node:url";
import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { client } from "../../../lib/kf.mjs";
export const here = (f) => fileURLToPath(new URL(f, import.meta.url));
export const APP = "CIQ_Digital_A00";
export const Q = `_application_id=${APP}`;
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
export const A = kf.acc;
let last = 0;
const GAP = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function get(path) {
  const wait = last + GAP - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
  const r = await kf.call("GET", path, undefined, { retries: 0 });
  const s = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
  appendFileSync(here("./requests.jsonl"), JSON.stringify({ at: new Date().toISOString(), method: "GET", path: path.split(A).join("{acc}"), status: r.status, res: s && s.length > 600 ? s.slice(0, 600) + "…" : s }) + "\n");
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge (status ${r.status}) on GET ${path}`);
  if (r.status === 429) throw new Error(`STOP: 429 on GET ${path}`);
  return r;
}
export function save(rel, data) { const p = here("./" + rel); mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); writeFileSync(p, JSON.stringify(data, null, 1)); return p; }
export const rows = (b) => (Array.isArray(b) ? b : b?.Data || b?.data || []);
