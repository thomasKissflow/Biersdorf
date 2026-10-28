// Read-only: each app role with its member names/ids (no e-mails). 2.5 s pacing, no retry, stops on 429/HTML.
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => { await sleep(2500); const r = await kf.call("GET", p, undefined, { retries: 0 }); if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP", r.status, p); process.exit(2); } return r; };
for (const app of ["CIQ_Digital_A00", "CIQ_Supplier_Portal_A00"]) {
  const Q = `_application_id=${app}`;
  const r = await get(`/app_role/2/${kf.acc}/list?${Q}&page_number=1&page_size=100`);
  for (const x of Array.isArray(r.body) ? r.body : r.body?.Data || []) {
    const g = await get(`/app_role/2/${kf.acc}/${x._id}?${Q}`);
    console.log(`${app.slice(0, 12)} ${x._id} ${String(x.Name).padEnd(32)} ${(g.body?.Members || []).map((m) => `${m.Name}(${m._id})`).join(", ") || "(none)"}`);
  }
}
