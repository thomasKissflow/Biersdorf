// Spike S-2b: can the API key DOWNLOAD a file stored in an Attachment field (needed to copy supplier files into the app)?
// Creates one ZZT item on the throwaway probe flow, uploads a tiny PDF (route proven by s2-attach.mjs), then tries a
// small set of candidate GET routes that mirror the upload route. Paced 1 s per call; deletes the item at the end.
//   node kissflow-build/ciq-supplier-portal/spikes/s2b-download.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
import { loadEnv } from "../../lib/kf.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./spike-requests.jsonl"));
const A = w.acc, P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00", FIELD = "Probe_File";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = loadEnv();
const base = `https://${env.KF_DOMAIN}`;
const auth = { "X-Access-Key-Id": env.KF_ACCESS_KEY_ID, "X-Access-Key-Secret": env.KF_ACCESS_KEY_SECRET };
const out = [];
const T = (id, pass, evidence) => { out.push({ id, pass, evidence }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${JSON.stringify(evidence).slice(0, 300)}`); };
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

await sleep(1000);
const cr = await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, { Probe_Title: "ZZT S-2b download probe" });
const item = cr.body?._id;
if (!item) { console.log("create failed", cr.status); process.exit(1); }
await sleep(1000);
const fd = new FormData();
fd.append("file", new Blob([pdf], { type: "application/pdf" }), "ZZT-download-probe.pdf");
const up = await fetch(`${base}/process/2/${A}/admin/${PROC}/${item}/${FIELD}/attachment?_application_id=${P}`, { method: "POST", headers: auth, body: fd });
const upBody = await up.json().catch(() => null);
const att = upBody?.[FIELD]?.[0];
w.log({ method: "POST(multipart)", path: `/process/2/{acc}/admin/${PROC}/{item}/${FIELD}/attachment`, status: up.status, res: JSON.stringify(att) });
T("S2b-upload", up.status === 200 && !!att?.id, { status: up.status, att });

const cands = att ? [
  `/process/2/${A}/admin/${PROC}/${item}/${FIELD}/attachment/${att.id}?_application_id=${P}`,
  `/process/2/${A}/${PROC}/${item}/${FIELD}/attachment/${att.id}?_application_id=${P}`,
  `/process/2/${A}/admin/${PROC}/${item}/${FIELD}/attachment/${att.id}/download?_application_id=${P}`,
] : [];
let found = null;
for (const path of cands) {
  await sleep(1000);
  const r = await fetch(base + path, { headers: auth, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  const loc = r.headers.get("location");
  let pdfOk = false, note = "";
  if (r.status === 200 && /pdf|octet/.test(ct)) { const b = Buffer.from(await r.arrayBuffer()); pdfOk = b.subarray(0, 5).toString() === "%PDF-"; note = `${b.length} bytes`; }
  else if (r.status === 200) { const t = await r.text(); note = t.slice(0, 160); try { const j = JSON.parse(t); const u = j?.url || j?.Url || j?.signed_url || j?.download_url; if (u) { const d = await fetch(u); const b = Buffer.from(await d.arrayBuffer()); pdfOk = b.subarray(0, 5).toString() === "%PDF-"; note = `json→url ${d.status} ${b.length} bytes`; } } catch {} }
  else if (loc) {
    const target = new URL(loc, base);
    const same = target.host === env.KF_DOMAIN;
    const d = await fetch(target, { headers: same ? auth : {} });
    const b = Buffer.from(await d.arrayBuffer());
    pdfOk = b.subarray(0, 5).toString() === "%PDF-";
    const keyInPath = decodeURIComponent(target.pathname).includes(att.key);
    note = `redirect ${r.status} → host ${same ? "same" : target.host} path ${target.pathname.split("/").slice(0, 4).join("/")}/… (segments ${target.pathname.split("/").length}, contains the attachment key: ${keyInPath}, query keys: ${[...target.searchParams.keys()].join(",") || "none"}) → ${d.status} ${b.length} bytes`;
    if (keyInPath) {
      // try the key-only form directly: /upload/2/{acc}/{key}
      const direct = await fetch(`${base}/upload/2/${A}/${att.key}`, { headers: auth });
      const db = Buffer.from(await direct.arrayBuffer());
      console.log(`  direct /upload/2/{acc}/{key} → ${direct.status} ${db.subarray(0, 5).toString() === "%PDF-" ? "PDF ok" : "not a PDF"} ${db.length} bytes`);
    }
  }
  else { note = (await r.text()).slice(0, 160); }
  const shown = path.replace(A, "{acc}").replace(item, "{item}").replace(att.id, "{attId}");
  w.log({ method: "GET", path: shown, status: r.status, res: note });
  console.log(`  try ${shown} → ${r.status} ${ct} ${note.replace(/\s+/g, " ").slice(0, 120)}`);
  if (pdfOk) { found = shown; break; }
}
T("S2b-download", !!found, { route: found });
await sleep(1000);
const d = await w.call("DELETE", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`);
await sleep(1000);
const g = await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`);
T("S2b-cleanup", d.status < 300 && g.status >= 400, { del: d.status, after: g.status });
writeFileSync(here("./s2b-result.json"), JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
