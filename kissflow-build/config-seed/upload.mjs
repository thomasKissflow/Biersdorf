// Uploads the configuration rows in rows/ into CIQ Config Version (app CIQ_Digital_A00) over the REST API.
//   node kissflow-build/config-seed/upload.mjs                 dry run: compares every row with the live one, writes nothing
//   node kissflow-build/config-seed/upload.mjs --apply         creates the rows that are missing, then reads each back
//   node kissflow-build/config-seed/upload.mjs --apply --replace-drafts   also overwrites a live DRAFT row whose content differs
// Rules:
//   - matched by Config_Key; same Content_Hash = same content: skipped
//   - a Published row is NEVER changed (a change is a new version with a new key, e.g. RS-2026.3)
//   - creates run one at a time (Kissflow keeps one draft per user per form), 1.2 s apart, and stop on a 429
//   - DateTimes go without milliseconds (Kissflow rejects them); credentials come from .env and are never printed
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const APPLY = process.argv.includes("--apply");
const REPLACE_DRAFTS = process.argv.includes("--replace-drafts");
const APP = "CIQ_Digital_A00", FORM = "CIQ_Config_Version_A00";
const w = writer(here("./upload-requests.jsonl"));
const A = w.acc, Q = `_application_id=${APP}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (m, p, b) => {
  await sleep(1200);
  const r = await w.call(m, p, b);
  if (r.status === 429 || typeof r.body === "string") throw new Error(`stopped: ${r.status} ${typeof r.body === "string" ? "(non-JSON answer, likely a rate-limit challenge)" : ""} on ${m} ${p.split("?")[0]}; nothing more written`);
  return r;
};
const noMs = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z$/.test(v) ? v.replace(/\.\d+Z$/, "Z") : v]));

const manifest = JSON.parse(readFileSync(here("./rows/manifest.json"), "utf8"));
const rows = manifest.rows.map((m) => noMs(JSON.parse(readFileSync(here(`./rows/${m.file}`), "utf8"))));

const listed = await call("POST", `/form/2/${A}/${FORM}/list?page_number=1&page_size=200&${Q}`, {});
const items = Array.isArray(listed.body) ? listed.body : listed.body?.Data || [];
const live = new Map(items.map((r) => [r.Config_Key, r]));
console.log(`${FORM}: ${items.length} live row(s)`);

let created = 0, replaced = 0, same = 0, blocked = 0;
for (const r of rows) {
  const cur = live.get(r.Config_Key);
  if (cur && cur.Content_Hash === r.Content_Hash) { same++; console.log(`same      ${r.Config_Key}`); continue; }
  if (cur && cur.Config_State !== "Draft") { blocked++; console.log(`DIFFERENT ${r.Config_Key}: live row is ${cur.Config_State}, never changed. Publish the change as a new version instead.`); continue; }
  if (cur && !REPLACE_DRAFTS) { blocked++; console.log(`DIFFERENT ${r.Config_Key}: live Draft differs. Run with --replace-drafts to overwrite it.`); continue; }
  if (!APPLY) { console.log(`${cur ? "would replace" : "would create"} ${r.Config_Key}`); continue; }
  if (cur) {
    await call("POST", `/form/2/${A}/${FORM}/${cur._id}?${Q}`, r);
    const back = (await call("GET", `/form/2/${A}/${FORM}/${cur._id}?${Q}`)).body || {};
    console.log(`replaced  ${r.Config_Key}: read back ${back.Content_Hash === r.Content_Hash ? "OK" : "MISMATCH"}`);
    replaced++;
    continue;
  }
  const draft = await call("POST", `/form/2/${A}/${FORM}?${Q}`, r);
  const done = await call("POST", `/form/2/${A}/${FORM}/${draft.body?._id}/submit?${Q}`, {});
  const id = done.body?._id;
  const back = id ? (await call("GET", `/form/2/${A}/${FORM}/${id}?${Q}`)).body || {} : {};
  const ok = back.Config_Key === r.Config_Key && back.Content_Hash === r.Content_Hash;
  console.log(`created   ${r.Config_Key} → ${id || "no id"}: read back ${ok ? "OK" : "MISMATCH"}`);
  created++;
}
console.log(`\n${same} same · ${created} created · ${replaced} replaced · ${blocked} not changed (see above)${APPLY ? "" : " · dry run, nothing written"}`);
