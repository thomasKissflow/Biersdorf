// Read-only: the spike case's process metadata (draft = last published), per-activity permissions on the lane fields.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const P = process.argv[2] || "CIQ_ZZ_Spike_Case_A00";
const d = (await w.call("GET", `/metadata/2/${w.acc}/process/${P}/draft`)).body;
writeFileSync(fileURLToPath(new URL(`./meta-${P}.json`, import.meta.url)), JSON.stringify(d, null, 1));
const ents = d?.Entities || d?.entities || d;
const all = Array.isArray(ents) ? ents : Object.values(ents || {});
console.log("top keys:", Object.keys(d || {}).join(","), "| entity count:", all.length);
const types = {}; for (const e of all) types[e._type || e.Type || e.EntityType || "?"] = (types[e._type || e.Type || e.EntityType || "?"] || 0) + 1;
console.log("entity types:", JSON.stringify(types));
