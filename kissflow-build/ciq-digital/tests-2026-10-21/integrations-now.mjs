// Read-only: every integration in both apps with its status/active flag (names only; never URLs). 2.5 s pacing, no retry.
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => { await sleep(8000); const r = await kf.call("GET", p, undefined, { retries: 0 }); if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP", r.status, p); process.exit(2); } return r; };
for (const app of ["CIQ_Digital_A00", "CIQ_Supplier_Portal_A00"]) {
  const r = await get(`/flow/2/${kf.acc}/integration/?_application_id=${app}&page_number=1&page_size=300`);
  const list = Array.isArray(r.body) ? r.body : r.body?.Data || [];
  for (const f of list) console.log(`${app.slice(0, 12)} ${String(f._id).padEnd(44)} ${String(f.Status).padEnd(10)} active=${f.IsActive} ${f.Name}`);
}
