// Read-only: each app role with its member names (ids only for users; no e-mails printed).
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
const Q = "_application_id=CIQ_Digital_A00";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r = await kf.call("GET", `/app_role/2/${kf.acc}/list?${Q}&page_number=1&page_size=100`);
for (const x of Array.isArray(r.body) ? r.body : r.body?.Data || []) {
  await sleep(1200);
  const g = await kf.call("GET", `/app_role/2/${kf.acc}/${x._id}?${Q}`);
  console.log(`${x.Name.padEnd(30)} ${(g.body?.Members || []).map((m) => `${m.Name}(${m._id})`).join(", ") || "(none)"}`);
}
