// Read-only: raw per-role GET for spike Role A and B (keys + member fields).
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
for (const id of ["RoEKHLFdFsUJ", "RoEKHLGDsV2J"]) {
  const g = (await w.call("GET", `/app_role/2/${w.acc}/${id}?_application_id=CIQ_Digital_A00`)).body || {};
  console.log(id, "keys:", Object.keys(g).join(","));
  for (const k of Object.keys(g)) if (/user|member|count/i.test(k)) console.log("  ", k, JSON.stringify(g[k]).slice(0, 300));
}
