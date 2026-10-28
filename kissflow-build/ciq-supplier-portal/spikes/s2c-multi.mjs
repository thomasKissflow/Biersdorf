// Spike S-2c: does ONE header Attachment field keep several files (uploads add, never replace), each downloadable by id?
// Throwaway probe flow only; paced 1 s; deletes its item.  node kissflow-build/ciq-supplier-portal/spikes/s2c-multi.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
import { loadEnv } from "../../lib/kf.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./spike-requests.jsonl"));
const A = w.acc, P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00", FIELD = "Probe_File";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = loadEnv(); const base = `https://${env.KF_DOMAIN}`;
const auth = { "X-Access-Key-Id": env.KF_ACCESS_KEY_ID, "X-Access-Key-Secret": env.KF_ACCESS_KEY_SECRET };
const out = []; const T = (id, pass, ev) => { out.push({ id, pass, ev }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${JSON.stringify(ev).slice(0, 300)}`); };
const pdf = (n) => Buffer.from(`%PDF-1.4\n% file ${n}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
await sleep(1000);
const cr = await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, { Probe_Title: "ZZT S-2c multi-file probe" });
const item = cr.body?._id; if (!item) { console.log("create failed", cr.status); process.exit(1); }
const ids = [];
for (const n of [1, 2]) {
  await sleep(1000);
  const fd = new FormData(); fd.append("file", new Blob([pdf(n)], { type: "application/pdf" }), `ZZT-sds-v${n}.pdf`);
  const up = await fetch(`${base}/process/2/${A}/admin/${PROC}/${item}/${FIELD}/attachment?_application_id=${P}`, { method: "POST", headers: auth, body: fd });
  const b = await up.json().catch(() => null);
  w.log({ method: "POST(multipart)", path: `…/${PROC}/{item}/${FIELD}/attachment`, status: up.status, res: JSON.stringify(b?.[FIELD]) });
  console.log(`  upload ${n} → ${up.status}, field now holds ${(b?.[FIELD] || []).length} file(s)`);
  const last = (b?.[FIELD] || []).find((x) => x.name === `ZZT-sds-v${n}.pdf`); if (last) ids.push(last.id);
}
await sleep(1000);
const back = (await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`)).body || {};
const files = back[FIELD] || [];
T("S2c-both-files-kept", files.length === 2 && files.map((f) => f.name).sort().join() === "ZZT-sds-v1.pdf,ZZT-sds-v2.pdf", { count: files.length, names: files.map((f) => f.name) });
for (const [i, id] of ids.entries()) {
  await sleep(1000);
  const r = await fetch(`${base}/process/2/${A}/admin/${PROC}/${item}/${FIELD}/attachment/${id}?_application_id=${P}`, { headers: auth, redirect: "manual" });
  const loc = r.headers.get("location"); let ok = false, size = 0, text = "";
  if (loc) { const t = new URL(loc, base); const d = await fetch(t, { headers: t.host === env.KF_DOMAIN ? auth : {} }); const buf = Buffer.from(await d.arrayBuffer()); size = buf.length; text = buf.toString(); ok = text.startsWith("%PDF-") && text.includes(`% file ${i + 1}`); }
  T(`S2c-download-file-${i + 1}`, ok, { status: r.status, bytes: size });
}
await sleep(1000);
const d = await w.call("DELETE", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`);
await sleep(1000);
const g = await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`);
T("S2c-cleanup", d.status < 300 && g.status >= 400, { del: d.status, after: g.status });
writeFileSync(here("./s2c-result.json"), JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
