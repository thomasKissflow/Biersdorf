#!/usr/bin/env node
// Refreshes the prod seed (config-version.json, Kissflow-internal) from the regenerated config seed rows
// (kissflow-build/config-seed/rows, written by config-seed/export.mjs from the prototype's domain code).
//   node kissflow-build/night-2026-10-21/prod-seed/refresh-from-config-seed.mjs          write, then check
//   node kissflow-build/night-2026-10-21/prod-seed/refresh-from-config-seed.mjs --check  check only
// - Replaces, by Config_Key, the rule sets, questionnaire versions and releases (v1 Published, v2 Draft), OWN:current
//   and REG:current with the config seed's rows; REM:current, RMES:current and LIM:current only when their
//   Content_Hash changed. Keeps the file's row order and each kept key's Published_At string (Content_Hash does not
//   cover it; Draft rows have none).
// - SET:current is never replaced: it carries the webhook tokens. Its JSON text is checked byte-identical.
// - Never prints a payload: only keys and ok / mismatch / replaced / unchanged.
// - Checks every row offline as the app does (map/config.ts verifyConfig): Content_Hash = sha256(canonicalJson(payload))
//   (the bundle's for a release), Manifest_Hash = the manifest's, and the manifest's ruleSetHash / templateHash = the
//   Content_Hash of its RS / TPL row.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const SEED = here("./config-version.json");
const ROWS = here("../../config-seed/rows/");
const checkOnly = process.argv.includes("--check");

// The same canonical JSON as sync/engine.mjs and prototype/src/portal/data/bundle.ts (sorted keys, undefined left out).
function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",")}]`;
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`)
    .join(",")}}`;
}
const hash = (v) => createHash("sha256").update(canonicalJson(v), "utf8").digest("hex");
const fileOf = (key) => key.replace(/[^A-Za-z0-9.+-]+/g, "_") + ".json";

const ALWAYS = ["RS:RS-2026.1", "TPL:CIQ-2026 v1", "REL:RS-2026.1 + v1", "RS:RS-2026.2", "TPL:CIQ-2026 v2", "REL:RS-2026.2 + v2", "OWN:current", "REG:current"];
const IF_CHANGED = ["REM:current", "RMES:current", "LIM:current"];
const NEVER = "SET:current";

const text = readFileSync(SEED, "utf8");
const rows = JSON.parse(text);
if (JSON.stringify(rows, null, 1) !== text) throw new Error("config-version.json is not in the expected format (JSON, indent 1, no trailing newline)");
const setBefore = JSON.stringify(rows.find((r) => r.Config_Key === NEVER));

if (!checkOnly) {
  const out = rows.map((r) => {
    const key = r.Config_Key;
    if (key === NEVER) return r;
    if (!ALWAYS.includes(key) && !IF_CHANGED.includes(key)) {
      console.log(`${key.padEnd(22)} kept (not a config seed row)`);
      return r;
    }
    const fresh = JSON.parse(readFileSync(ROWS + fileOf(key), "utf8"));
    if (IF_CHANGED.includes(key) && fresh.Content_Hash === r.Content_Hash) {
      console.log(`${key.padEnd(22)} unchanged`);
      return r;
    }
    const next = { ...fresh };
    if (r.Published_At !== undefined) next.Published_At = r.Published_At;
    else delete next.Published_At;
    console.log(`${key.padEnd(22)} ${fresh.Content_Hash === r.Content_Hash ? "replaced (same hash)" : "replaced"}`);
    return next;
  });
  for (const key of [...ALWAYS, ...IF_CHANGED]) if (!rows.some((r) => r.Config_Key === key)) throw new Error(`${key} is missing from config-version.json`);
  writeFileSync(SEED, JSON.stringify(out, null, 1));
}

// ---- offline check of the file as written
const now = JSON.parse(readFileSync(SEED, "utf8"));
let bad = 0;
const byKey = Object.fromEntries(now.map((r) => [r.Config_Key, r]));
const say = (key, ok, what = "") => {
  if (!ok) bad += 1;
  console.log(`${key.padEnd(22)} ${ok ? "ok" : "MISMATCH"}${what ? ` (${what})` : ""}`);
};
for (const r of now) {
  const key = r.Config_Key;
  if (r.Config_Kind === "Release") {
    const bundle = JSON.parse(r.Release_Bundle_JSON);
    const manifest = JSON.parse(r.Release_Manifest_JSON);
    const problems = [];
    if (hash(bundle) !== r.Content_Hash) problems.push("bundle hash");
    if (hash(manifest) !== r.Manifest_Hash) problems.push("manifest hash");
    if (manifest.bundleHash !== r.Content_Hash) problems.push("manifest bundleHash");
    if (byKey[manifest.ruleSetKey]?.Content_Hash !== manifest.ruleSetHash) problems.push("ruleSetHash");
    if (byKey[manifest.templateKey]?.Content_Hash !== manifest.templateHash) problems.push("templateHash");
    say(key, !problems.length, problems.join(", "));
  } else {
    say(key, hash(JSON.parse(r.Payload_JSON)) === r.Content_Hash, "Content_Hash");
  }
}
say(NEVER, JSON.stringify(now.find((r) => r.Config_Key === NEVER)) === setBefore, "byte-identical to before");
if (bad) {
  console.error(`${bad} problem(s)`);
  process.exit(1);
}
