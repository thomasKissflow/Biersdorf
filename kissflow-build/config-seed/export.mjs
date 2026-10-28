// Writes the CIQ configuration rows (rules, questionnaire versions, releases and the single settings rows) as files,
// generated from the prototype's own domain code, so the configuration in Kissflow is exactly what the prototype runs.
//   node kissflow-build/config-seed/export.mjs            rebuild the bundled domain code, then write rows/*.json
//   node kissflow-build/config-seed/export.mjs --no-build write rows/*.json from the current bundle
// One file per row: rows/<Config_Key>.json holds exactly the fields upload.mjs sends to CIQ Config Version; the payload
// fields (Payload_JSON, Release_Bundle_JSON, Release_Manifest_JSON) are JSON strings, as Kissflow stores them.
// readable/<Config_Key>.json shows the same row with those payloads parsed, for reading and review.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
if (!process.argv.includes("--no-build")) execFileSync(process.execPath, [here("../sync/build-vendor.mjs")], { stdio: "inherit" });
const { seedRows } = await import("../sync/config.mjs");
const fileOf = (key) => key.replace(/[^A-Za-z0-9.+-]+/g, "_") + ".json";
const parsed = (v) => { try { return JSON.parse(v); } catch { return v; } };
rmSync(here("./rows"), { recursive: true, force: true });
rmSync(here("./readable"), { recursive: true, force: true });
mkdirSync(here("./rows"), { recursive: true });
mkdirSync(here("./readable"), { recursive: true });
const order = [];
for (const rows of Object.values(seedRows())) {
  for (const r of rows) {
    writeFileSync(here(`./rows/${fileOf(r.Config_Key)}`), JSON.stringify(r, null, 1) + "\n");
    const readable = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, /_JSON$/.test(k) ? parsed(v) : v]));
    writeFileSync(here(`./readable/${fileOf(r.Config_Key)}`), JSON.stringify(readable, null, 2) + "\n");
    order.push({ file: fileOf(r.Config_Key), key: r.Config_Key, kind: r.Config_Kind, state: r.Config_State, hash: r.Content_Hash });
  }
}
// upload order: rule sets and templates before the release that pairs them; single settings rows last
const rank = (k) => (k === "Rule set" ? 0 : k === "Template" ? 1 : k === "Release" ? 2 : 3);
order.sort((a, b) => rank(a.kind) - rank(b.kind) || a.key.localeCompare(b.key));
writeFileSync(here("./rows/manifest.json"), JSON.stringify({ generatedFrom: "prototype/src/domain via kissflow-build/sync/vendor/domain.mjs", rows: order }, null, 1) + "\n");
for (const o of order) console.log(`${o.key.padEnd(22)} ${o.kind.padEnd(18)} ${o.state.padEnd(10)} ${o.file}`);
