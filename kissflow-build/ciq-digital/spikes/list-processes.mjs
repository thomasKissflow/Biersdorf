// Read-only: every application and process flow in the sandbox account (to find a hand-built process with send-back on).
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc;
for (const p of [`/flow/2/${A}/application/?page_number=1&page_size=100`, `/flow/2/${A}/application?page_number=1&page_size=100`]) {
  const r = await w.call("GET", p);
  const items = r.body?.Data || r.body || [];
  console.log(p.replace(A, "{acc}"), r.status, Array.isArray(items) ? items.map((x) => `${x._id}:${x.Name}`).join(" | ").slice(0, 1500) : JSON.stringify(r.body).slice(0, 300));
  if (r.status < 300) break;
}
const r2 = await w.call("GET", `/flow/2/${A}/process/?page_number=1&page_size=300`);
const pr = r2.body?.Data || r2.body || [];
console.log("processes (all apps):", r2.status, Array.isArray(pr) ? pr.map((x) => `${x._id} [${x._application_id || x.ApplicationId || "?"}] ${x.Name}`).join("\n  ") : JSON.stringify(r2.body).slice(0, 300));
