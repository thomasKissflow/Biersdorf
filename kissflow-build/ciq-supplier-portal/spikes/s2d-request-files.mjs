// Spike S-2d: the service's file path on the REAL flow: a ZZT CIQP Request at "Supplier: fill in the CIQ";
// admin attach into Supplier_Files, read back, download by id. Paced 1 s; deletes the item.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
import { loadEnv } from "../../lib/kf.mjs";
import { TEST_USER } from "../portal-spec.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./spike-requests.jsonl"));
const A = w.acc, P = "CIQ_Supplier_Portal_A00", PROC = "CIQP_Request_A00", FIELD = "Supplier_Files";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = loadEnv(); const base = `https://${env.KF_DOMAIN}`;
const auth = { "X-Access-Key-Id": env.KF_ACCESS_KEY_ID, "X-Access-Key-Secret": env.KF_ACCESS_KEY_SECRET };
const out = []; const T = (id, pass, ev) => { out.push({ id, pass, ev }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${JSON.stringify(ev).slice(0, 300)}`); };
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
await sleep(1000);
const cr = await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, { Request_Key: "ZZT-S2D-0001|1", Case_Code: "ZZT-S2D-0001", Cycle_No: 1, Supplier_Code: "SUP-ZZT", App_Case_Item_Id: "ZZT-NO-CASE", BDF_Contact_Name: "ZZT RMM", BDF_Contact_Email: "rmm.zzt@example.com", Supplier_Due_Date: plus(14), Assigned_Contacts: [{ _id: TEST_USER._id }] });
const item = cr.body?._id; if (!item) { console.log("create failed", cr.status); process.exit(1); }
await sleep(1000);
const sub = await w.call("POST", `/process/2/${A}/${PROC}/${item}/${cr.body._activity_instance_id}/submit?_application_id=${P}`, {});
await sleep(1000);
const it = (await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`)).body || {};
T("S2d-at-supplier-step", sub.status === 200 && it._current_step === "Supplier: fill in the CIQ", { submit: sub.status, step: it._current_step });
await sleep(1000);
const fd = new FormData(); fd.append("file", new Blob([Buffer.from("%PDF-1.4\n% ZZT SDS\ntrailer<<>>\n%%EOF\n")], { type: "application/pdf" }), "ZZT-SDS.pdf");
const up = await fetch(`${base}/process/2/${A}/admin/${PROC}/${item}/${FIELD}/attachment?_application_id=${P}`, { method: "POST", headers: auth, body: fd });
const ub = await up.json().catch(() => null); const att = ub?.[FIELD]?.[0];
w.log({ method: "POST(multipart)", path: `…/${PROC}/{item}/${FIELD}/attachment`, status: up.status, res: JSON.stringify(att) });
T("S2d-attach-at-supplier-step", up.status === 200 && !!att?.id, { status: up.status, att });
if (att) {
  await sleep(1000);
  const r = await fetch(`${base}/process/2/${A}/admin/${PROC}/${item}/${FIELD}/attachment/${att.id}?_application_id=${P}`, { headers: auth, redirect: "manual" });
  const loc = r.headers.get("location"); let ok = false, size = 0;
  if (loc) { const t = new URL(loc, base); const d = await fetch(t, { headers: t.host === env.KF_DOMAIN ? auth : {} }); const b = Buffer.from(await d.arrayBuffer()); size = b.length; ok = b.toString().includes("ZZT SDS"); }
  T("S2d-download", ok, { status: r.status, bytes: size });
}
await sleep(1000);
const d = await w.call("DELETE", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`);
await sleep(1000);
const g = await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`);
T("S2d-cleanup", d.status < 300 && g.status >= 400, { del: d.status, after: g.status });
writeFileSync(here("./s2d-result.json"), JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
