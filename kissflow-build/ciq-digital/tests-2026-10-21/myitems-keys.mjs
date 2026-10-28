// Read-only: which fields the REST My items rows carry for given item ids (keys + step fields only). Paced, no retry.
//   node myitems-keys.mjs <proc> <id,id> [app]
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const [proc, ids, app = "CIQ_Digital_A00"] = process.argv.slice(2);
const want = new Set(ids.split(","));
for (let page = 1; page <= 5; page++) {
  await new Promise((r) => setTimeout(r, 2500));
  const r = await kf.call("GET", `/process/2/${kf.acc}/${proc}/myitems?page_number=${page}&page_size=50&_application_id=${app}`, undefined, { retries: 0 });
  if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP", r.status); process.exit(2); }
  const rows = Array.isArray(r.body) ? r.body : r.body?.Data || [];
  for (const row of rows) if (want.has(row._id)) console.log(row._id, row._status, "keys:", Object.keys(row).sort().join(","), "| act:", row._activity_instance_id ?? null, "| ctx:", JSON.stringify(row._current_context ?? null).slice(0, 300));
  if (rows.length < 50) break;
}
