// Read-only: the integrations of the app and the portal, with status and connectors.
//   node kissflow-build/night-2026-10-20/read-integrations.mjs
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./read-requests.jsonl", import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const app of ["CIQ_Digital_A00", "CIQ_Supplier_Portal_A00"]) {
  await sleep(1300);
  const r = await w.call("GET", `/flow/2/${w.acc}/integration/?_application_id=${app}&page_number=1&page_size=100`);
  const list = Array.isArray(r.body) ? r.body : (r.body?.Data || []);
  console.log("##", app, r.status, list.length);
  for (const x of list) console.log("  ", x._id, "|", x.Name, "| Status", x.Status, "| IsActive", x.IsActive, "|", JSON.stringify(x.Connectors || x.Connector || "").slice(0, 200));
}
