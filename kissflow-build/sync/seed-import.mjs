// One-time configuration seed (plan v5 §11.2): writes the rows in seed-out/ into CIQ_Config_Version_A00.
//   node kissflow-build/sync/seed-import.mjs            → dry run: reads the live rows, prints what it would create
//   node kissflow-build/sync/seed-import.mjs --apply    → creates the missing rows one at a time and reads each back
// Rules (app session's GO, 15 Oct): never update an existing row (a row with the same Config_Key is skipped, so a
// Published row is never touched); serial creates (one draft per user, D-7); ≥ 1 s pacing; stop on any 429.
// DateTimes are written without milliseconds (…:ssZ). Credentials are read by kf.mjs from .env and never printed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { client } from "../lib/kf.mjs";
import { createPort, isDeferral } from "./kissflow.mjs";
import { FLOW } from "./ids.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const APPLY = process.argv.includes("--apply");
const FILES = ["release-RS-2026.1-v1.json", "release-RS-2026.2-v2-draft.json", "singletons.json"];
const noMs = (v) => (typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z$/.test(v) ? v.replace(/\.\d+Z$/, "Z") : v);

const rows = FILES.flatMap((f) => {
  const j = JSON.parse(readFileSync(here(`./seed-out/${f}`), "utf8"));
  return (Array.isArray(j) ? j : j.rows).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, noMs(v)])));
});

// dry run: a write-capable client (the Form list is a POST) behind a port that records writes instead of sending them
const port = createPort({ kf: client({ readOnly: false }), dryRun: !APPLY, listInDryRun: true, log: () => {} });
const form = FLOW.config;
let live;
try {
  live = await port.listForm(form);
} catch (e) {
  console.error(`Stopped: the live rows could not be read (${isDeferral(e) ? "rate limit / challenge, try later" : e.message}). Nothing written.`);
  process.exit(1);
}
const have = new Map(live.map((r) => [r.Config_Key, r]));
console.log(`${form}: ${live.length} live row(s): ${[...have.keys()].join(", ") || "none"}`);

let created = 0, skipped = 0, failed = 0;
for (const r of rows) {
  if (have.has(r.Config_Key)) {
    const cur = have.get(r.Config_Key);
    console.log(`skip ${r.Config_Key}: exists (${cur.Config_State}, hash ${cur.Content_Hash === r.Content_Hash ? "same" : "DIFFERENT"}) — never updated`);
    skipped++;
    continue;
  }
  if (!APPLY) { console.log(`would create ${r.Config_Kind} · ${r.Config_Key} · ${r.Config_State} (${(r.Payload_JSON ?? "").length + (r.Release_Bundle_JSON ?? "").length} chars)`); continue; }
  try {
    const back = await port.createFormRow(form, r);
    const ok = back && back.Config_Key === r.Config_Key && back.Config_Kind === r.Config_Kind && back.Config_State === r.Config_State && back.Content_Hash === r.Content_Hash
      && (back.Payload_JSON ?? "") === (r.Payload_JSON ?? "") && (back.Release_Bundle_JSON ?? "") === (r.Release_Bundle_JSON ?? "");
    console.log(`${ok ? "created" : "CREATED-BUT-DIFFERS"} ${r.Config_Key} → ${back?._id}`);
    ok ? created++ : failed++;
  } catch (e) {
    console.error(`FAILED ${r.Config_Key}: ${isDeferral(e) ? "rate limit / challenge — stopping" : e.message}`);
    failed++;
    break;
  }
}
console.log(`\n${APPLY ? "apply" : "dry run"}: ${created} created, ${skipped} skipped (already there), ${failed} failed, of ${rows.length}`);
if (APPLY) {
  const after = await port.listForm(form);
  const keys = new Set(after.map((r) => r.Config_Key));
  const missing = rows.filter((r) => !keys.has(r.Config_Key)).map((r) => r.Config_Key);
  console.log(`read back: ${after.length} row(s); missing seed keys: ${missing.join(", ") || "none"}`);
}
