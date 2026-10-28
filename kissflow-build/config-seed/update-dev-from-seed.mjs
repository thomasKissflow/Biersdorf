// 28 Oct (matrix v0.6 fixes): brings dev's CIQ Config Version rows in line with the regenerated prod seed, so the
// dev app (whose built-in version 1 changed) and new dev cases use the same version 1 as prod will.
//   node kissflow-build/config-seed/update-dev-from-seed.mjs            dry run: compares every seed row with dev's
//   node kissflow-build/config-seed/update-dev-from-seed.mjs --apply    updates the rows whose Content_Hash differs
// Rules:
//   - DEV ONLY (account AcDOSunMEpSA); matched by Config_Key; same Content_Hash = skipped
//   - SET:current is never written (it holds the hand-off tokens and the mail hook)
//   - the live row is saved to backups/ before it is changed; every write is read back and compared by SHA-256
//   - existing cases are not affected: each keeps the bundle it copied at its start
//   - one call at a time, 1.2 s apart; stops on a 429 or a non-JSON answer; credentials come from .env, never printed
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { client } from "../lib/kf.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const APPLY = process.argv.includes("--apply");
const APP = "CIQ_Digital_A00", FORM = "CIQ_Config_Version_A00", Q = `_application_id=${APP}`;
const LONG = ["Payload_JSON", "Release_Bundle_JSON", "Release_Manifest_JSON", "Change_Note"];
const FIELDS = ["Config_Kind", "Version_Label", "Config_State", "Payload_JSON", "Content_Hash", "Evaluator_Version", "Change_Note",
  "Published_At", "Release_Key", "Release_Label", "Release_Stage", "Release_Manifest_JSON", "Release_Bundle_JSON", "Manifest_Hash"];
const sha = (s) => createHash("sha256").update(s ?? "").digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const kf = client({ readOnly: false });
if (kf.acc !== "AcDOSunMEpSA") throw new Error("not the dev sandbox: stopped, nothing written");
const call = async (m, p, b) => {
  await sleep(1200);
  const r = await kf.call(m, p, b);
  if (r.status === 429 || typeof r.body === "string") throw new Error(`stopped: ${r.status} on ${m} ${p.split("?")[0]} (rate limit or challenge); nothing more written`);
  return r;
};

const seed = JSON.parse(readFileSync(here("../night-2026-10-21/prod-seed/config-version.json"), "utf8"));
const listed = await call("POST", `/form/2/${kf.acc}/${FORM}/list?page_number=1&page_size=200&${Q}`, {});
const items = Array.isArray(listed.body) ? listed.body : listed.body?.Data || [];
const live = new Map(items.map((r) => [r.Config_Key, r]));
console.log(`${FORM} (dev): ${items.length} row(s); seed: ${seed.length} row(s)`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
let same = 0, updated = 0, created = 0, skipped = 0, bad = 0;
for (const r of seed) {
  const cur = live.get(r.Config_Key);
  if (cur && cur.Content_Hash === r.Content_Hash && (cur.Manifest_Hash ?? "") === (r.Manifest_Hash ?? "")) { same++; console.log(`same      ${r.Config_Key}`); continue; }
  if (r.Config_Key === "SET:current") { skipped++; console.log(`SKIP      SET:current differs from the seed: never written by this script`); continue; }
  const body = Object.fromEntries(FIELDS.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));
  if (!APPLY) { console.log(`${cur ? "would update" : "would create"} ${r.Config_Key} (${cur ? cur.Content_Hash.slice(0, 10) : "-"} → ${r.Content_Hash.slice(0, 10)})`); continue; }
  let id = cur?._id;
  if (cur) {
    const full = (await call("GET", `/form/2/${kf.acc}/${FORM}/${id}?${Q}`)).body;
    mkdirSync(here("./backups"), { recursive: true });
    writeFileSync(here(`./backups/${r.Config_Key.replace(/[^A-Za-z0-9.+-]+/g, "_")}-${stamp}.json`), JSON.stringify(full));
    await call("POST", `/form/2/${kf.acc}/${FORM}/${id}?${Q}`, body);
  } else {
    const draft = await call("POST", `/form/2/${kf.acc}/${FORM}?${Q}`, { Config_Key: r.Config_Key, ...body });
    id = (await call("POST", `/form/2/${kf.acc}/${FORM}/${draft.body?._id}/submit?${Q}`, {})).body?._id;
  }
  const back = id ? (await call("GET", `/form/2/${kf.acc}/${FORM}/${id}?${Q}`)).body || {} : {};
  const diffs = FIELDS.filter((k) => r[k] !== undefined && (LONG.includes(k) ? sha(back[k]) !== sha(r[k]) : String(back[k] ?? "") !== String(r[k])));
  console.log(`${cur ? "updated" : "created"}   ${r.Config_Key} → ${id}: read back ${diffs.length ? `MISMATCH in ${diffs.join(", ")}` : "OK"}`);
  diffs.length ? bad++ : cur ? updated++ : created++;
}
console.log(`\n${same} same · ${updated} updated · ${created} created · ${skipped} skipped · ${bad} mismatched${APPLY ? "" : " · dry run, nothing written"}`);
