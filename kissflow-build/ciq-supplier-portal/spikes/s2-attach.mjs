// Spike S-2 / K-15 (plan-v5-final.md §14): can the API key attach a file to a process item, and download it again?
// Throwaway target only: the portal probe flow "ZZ Spike Assignee" (ZZ_Spike_Assignee_A00, no supplier access).
//   node …/s2-attach.mjs graft [--apply]   → add an Attachment field "Probe File" (dry run unless --apply)
//   node …/s2-attach.mjs attach             → create a ZZT item, try the candidate upload routes, read back, download,
//                                             then repeat on a COMPLETED item; deletes every item it made.
// The route candidate comes from Kissflow's developer reference slug "post_process-2-account-id-admin-process-id-
// instance-id-field-id-attachment" ("Add attachment to form field", flow admin only). Unverified until this runs.
// Credentials are read by kf.mjs from .env and are never printed; request bodies are not logged for uploads.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer, mergeClean, preflight } from "../../lib/meta.mjs";
import { loadEnv } from "../../lib/kf.mjs";
import { buildForm, addWorkflow } from "../../../tools/kissflow-app-agents-1.6.0/engine/builders.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./spike-requests.jsonl"));
// pace every call ~1 s apart: the shared key hit a Cloudflare 429 challenge at 23:40 (both sessions building)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rawCall = w.call;
w.call = async (...a) => { await sleep(1000); return rawCall(...a); };
for (const k of ["getDraft", "putDraft", "publish"]) { const f = w[k]; w[k] = async (...a) => { await sleep(1000); return f(...a); }; }
const A = w.acc, P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00";
const mode = process.argv[2];
const out = [];
const T = (id, pass, evidence) => { out.push({ id, pass, evidence }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${JSON.stringify(evidence).slice(0, 400)}`); };

if (mode === "graft") {
  const gd = await w.getDraft("process", PROC);
  const live = gd.body;
  if (gd.status !== 200 || !live || typeof live !== "object" || !live[PROC]) { console.log(`ABORT: live draft not readable (status ${gd.status}); nothing written`); process.exit(1); }
  const built = buildForm({ id: PROC, name: "ZZ Spike Assignee", flowType: "Process", description: "Throwaway probe (spikes K-04, S-2). Safe to ignore.", fields: [
    { name: "Probe Title", type: "Text", required: true }, { name: "Probe Note", type: "Textarea" }, { name: "Probe File", type: "Attachment" },
  ] }, P);
  addWorkflow(built, [{ name: "Start" }, { name: "End" }], {});
  const merged = mergeClean(live, built.blob, PROC);
  const pf = preflight(PROC, merged);
  const fields = Object.values(merged).filter((e) => e?.Kind === "Field" && e.Model === PROC).map((f) => `${f.Id}:${f.Type}`);
  console.log(JSON.stringify({ preflightErrors: pf.errors, fields }));
  if (pf.errors.length || !process.argv.includes("--apply")) process.exit(0);
  const pd = await w.putDraft("process", PROC, merged);
  const pub = pd.status < 300 ? await w.publish("process", PROC) : { status: -1 };
  const back = (await w.getDraft("process", PROC)).body;
  const f = back?.Probe_File;
  T("S2-graft-attachment-field", pd.status < 300 && pub.status < 300 && f?.Type === "Attachment", { draft: pd.status, publish: pub.status, type: f?.Type });
}

if (mode === "attach") {
  const env = loadEnv();
  const base = `https://${env.KF_DOMAIN}`;
  const authHeaders = { "X-Access-Key-Id": env.KF_ACCESS_KEY_ID, "X-Access-Key-Secret": env.KF_ACCESS_KEY_SECRET };
  // a tiny valid one-page PDF (fictional content)
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const read = async (item) => (await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`)).body || {};
  const created = [];
  async function newItem(submit) {
    const cr = await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, { Probe_Title: "ZZT S-2 attach probe" });
    if (cr.body?._id) created.push(cr.body._id);
    if (submit && cr.body?._id) await w.call("POST", `/process/2/${A}/${PROC}/${cr.body._id}/${cr.body._activity_instance_id}/submit?_application_id=${P}`, {});
    return cr.body?._id;
  }
  async function upload(path, fieldName) {
    const fd = new FormData();
    fd.append(fieldName, new Blob([pdf], { type: "application/pdf" }), "ZZT-final-document.pdf");
    const res = await fetch(base + path, { method: "POST", headers: authHeaders, body: fd });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
    w.log({ method: "POST(multipart)", path, status: res.status, res: typeof body === "string" ? body : JSON.stringify(body).slice(0, 600) });
    return { status: res.status, body };
  }
  for (const [label, submit] of [["in-progress item (at Start)", false], ["completed item", true]]) {
    const item = await newItem(submit);
    const st = (await read(item))._status;
    let ok = null;
    for (const [route, fieldName] of [
      [`/process/2/${A}/admin/${PROC}/${item}/Probe_File/attachment?_application_id=${P}`, "file"],
      [`/process/2/${A}/admin/${PROC}/${item}/Probe_File/attachment?_application_id=${P}`, "attachment"],
    ]) {
      const r = await upload(route, fieldName);
      console.log(`  try ${label} · ${route.replace(A, "{acc}").replace(item, "{item}")} [${fieldName}] → ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      if (r.status < 300) { ok = { route: route.replace(A, "{acc}").replace(item, "{item}"), fieldName, resp: r.body }; break; }
    }
    const back = await read(item);
    const val = back.Probe_File;
    T(`S2-attach-${label}`, !!ok && !!val && JSON.stringify(val).includes("ZZT-final-document"), { status: st, route: ok?.route, fieldName: ok?.fieldName, value: val });
    // download: try the value's own URL/key with the key headers (shape unknown before this run)
    const first = Array.isArray(val) ? val[0] : val;
    const url = first?.url || first?.Url || first?.downloadUrl || first?.DownloadUrl || first?.signed_url;
    if (url) {
      const full = url.startsWith("http") ? url : base + url;
      const d = await fetch(full, { headers: url.startsWith("http") && !full.startsWith(base) ? {} : authHeaders });
      const buf = Buffer.from(await d.arrayBuffer());
      T(`S2-download-${label}`, d.status === 200 && buf.subarray(0, 5).toString() === "%PDF-", { status: d.status, bytes: buf.length, sameHost: full.startsWith(base) });
    } else T(`S2-download-${label}`, false, { note: "no URL in the stored value; value keys", keys: first ? Object.keys(first) : null });
  }
  for (const item of created) {
    const d = await w.call("DELETE", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`);
    const g = await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`);
    T(`S2-cleanup-${item}`, d.status < 300 && g.status >= 400, { del: d.status, after: g.status });
  }
}
writeFileSync(here(`./s2-${mode}-result.json`), JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
