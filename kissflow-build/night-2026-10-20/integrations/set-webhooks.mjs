// Writes the app's hand-off webhook URLs into the Settings row SET:current (CIQ Config Version, CIQ_Digital_A00):
// Payload_JSON.webhooks = {code: url} (plan v6 §4.1; read by prototype/src/app-live/write/handoff.ts webhooksOf).
// The row is the one Published singleton the app reads at load, so it is updated in place: the payload gains (or
// replaces) its `webhooks` object only, and Content_Hash is recomputed exactly as the app checks it
// (sha256(canonicalJson(Payload_JSON)), map/config.ts verifyConfig). Refuses unless the live hash reproduces first.
// The URLs come from state.json and are never printed.   node set-webhooks.mjs [--apply]
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { call, A, load } from "./integ-lib.mjs";

const APPLY = process.argv.includes("--apply");
const FORM = "CIQ_Config_Version_A00", Q = "_application_id=CIQ_Digital_A00";
const CODES = { "case.started": "I1", "op.round": "P_op_round", "op.edited": "P_op_edited", "op.closed": "P_op_closed", "release.requested": "P_release_requested",
  "review.reopened": "I6", "case.cancelled": "P_case_cancelled", "history.updated": "P_history_updated" };
const canonicalJson = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",")}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
};
const sha = (v) => createHash("sha256").update(canonicalJson(v)).digest("hex");

const s = load();
const webhooks = {};
for (const [code, key] of Object.entries(CODES)) {
  const url = s.integrations[key]?.webhookUrl;
  if (!/^https:\/\/dev-beiersdorf\.kissflow\.eu\/integration\/2\/AcDOSunMEpSA\/webhook\/[A-Za-z0-9_-]{30,}$/.test(url || "")) throw new Error(`no valid URL for ${code} (${key})`);
  webhooks[code] = url;
}
const listed = await call("POST", `/form/2/${A}/${FORM}/list?page_number=1&page_size=200&${Q}`, {});
const row = (listed.body?.Data || listed.body || []).find((x) => x.Config_Key === "SET:current");
if (!row) throw new Error("SET:current not found");
const full = (await call("GET", `/form/2/${A}/${FORM}/${row._id}?${Q}`)).body;
const payload = JSON.parse(full.Payload_JSON);
if (sha(payload) !== String(full.Content_Hash).toLowerCase()) throw new Error("the live Content_Hash does not reproduce: stopping, nothing written");
mkdirSync(new URL("./backups/", import.meta.url), { recursive: true });
writeFileSync(new URL(`./backups/SET_current.${new Date().toISOString().replace(/[:.]/g, "-")}.json`, import.meta.url), JSON.stringify(full, null, 1));
const next = { ...payload, webhooks };
const nextHash = sha(next);
console.log(`SET:current ${row._id} (${full.Config_State}): hash reproduces; payload keys ${Object.keys(payload).join(", ")} → + webhooks (${Object.keys(webhooks).length} codes: ${Object.keys(webhooks).join(", ")})`);
if (!APPLY) { console.log("dry run: nothing written"); process.exit(0); }
const r = await call("POST", `/form/2/${A}/${FORM}/${row._id}?${Q}`, { Payload_JSON: JSON.stringify(next), Content_Hash: nextHash, Change_Note: `${full.Change_Note ? full.Change_Note + " · " : ""}20 Oct: hand-off webhook URLs added (plan v6 §4.1)` });
console.log("update", r.status, r.status >= 300 ? JSON.stringify(r.body).slice(0, 300) : "");
const back = (await call("GET", `/form/2/${A}/${FORM}/${row._id}?${Q}`)).body;
const bp = JSON.parse(back.Payload_JSON);
const ok = back.Content_Hash === nextHash && sha(bp) === nextHash && Object.entries(webhooks).every(([k, v]) => bp.webhooks?.[k] === v)
  && Object.keys(payload).every((k) => canonicalJson(bp[k]) === canonicalJson(payload[k])) && back.Config_State === full.Config_State;
console.log(`read back: ${ok ? "OK" : "MISMATCH"} (state ${back.Config_State}, ${Object.keys(bp.webhooks || {}).length} webhooks, hash ${back.Content_Hash === nextHash ? "matches" : "differs"})`);
process.exitCode = ok ? 0 : 1;
