// Read-only: the custom UI component of each container and its deployed zip (same reads as the deploy scripts).
import { client } from "../lib/kf.mjs";
const kf = client({ readOnly: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const app of ["CIQ_Digital_A00", "CIQ_Supplier_Portal_A00"]) {
  const base = `/application/2/${kf.acc}/${app}/component/custom`;
  await sleep(1100);
  const l = await kf.get(`${base}/list?page_number=1&page_size=300&Category=Application`);
  const rows = Array.isArray(l.body) ? l.body : l.body?.Data || [];
  for (const c of rows) {
    await sleep(1100);
    const m = await kf.get(`${base}/${c._id}/manifest/draft`);
    console.log(`${app} · ${c._id} · ${c.Status} · ${m.body?.scripts?.ZipFileName || m.body?.ZipFileName || "?"}`);
  }
}
