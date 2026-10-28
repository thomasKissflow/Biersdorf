// Fixer probe (verified finding "final document and seal: attaching the PDF to CIQ Case is unproven on the app"):
// one FICTIONAL ZZT case on CIQ_Case_A00 (v5 definition) walks Start → "Waiting for supplier: CIQ" → "Beiersdorf review and
// final release" as the key user, and the S-2 attachment route is tried on the two ReadOnly Attachment fields:
//   at S1: Supplier_Files            (the service copies supplier files while the supplier fills in)
//   at S7: Final_PDF + Supplier_Files (the final PDF is attached before the last submit)
// Each upload is read back (admin GET) and downloaded again (GET …/{field}/attachment/{attId}, 302 → signed same-host URL,
// the S-2b route). The item is then DELETED (a throwaway test item this probe created). Every call is paced >= 1.1 s and
// logged to fixer/requests.jsonl without credentials; 429/HTML stops the run.
//   node case-attach-probe.mjs --run   → fixer/case-attach-result.json   (without --run: prints the plan)
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../../lib/meta.mjs";
import { loadEnv } from "../../../lib/kf.mjs";

if (!process.argv.includes("--run")) { console.log("dry: would create 1 ZZT case, walk it to S7, attach to Supplier_Files (S1) and Final_PDF + Supplier_Files (S7), download, delete it; pass --run"); process.exit(0); }
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./requests.jsonl"));
if (w.acc !== "AcDOSunMEpSA" || w.kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
const A = w.acc, CASE = "CIQ_Case_A00", Q = "_application_id=CIQ_Digital_A00", THOMAS = "UsEJUfjYLM8Y";
const env = loadEnv(), base = `https://${env.KF_DOMAIN}`;
const auth = { "X-Access-Key-Id": env.KF_ACCESS_KEY_ID, "X-Access-Key-Secret": env.KF_ACCESS_KEY_SECRET };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0, calls = 0;
const pace = async () => { const d = last + 1100 - Date.now(); if (d > 0) await sleep(d); last = Date.now(); calls++; };
async function call(method, path, body) {
  if (method !== "GET" && !path.includes(`/${CASE}`)) throw new Error(`GUARD: refused ${method} ${path}`);
  await pace();
  const r = await w.kf.call(method, path, body, { retries: 0 });
  w.log({ method, path, status: r.status, res: typeof r.body === "string" ? r.body.slice(0, 300) : JSON.stringify(r.body).slice(0, 500) });
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge on ${method} ${path}`);
  if (r.status === 429) throw new Error(`STOP: 429 on ${method} ${path}`);
  return r;
}
const pdf = (label) => Buffer.from(`%PDF-1.4\n% ZZT fictional probe file: ${label}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
async function upload(item, field, name) {
  await pace();
  const fd = new FormData();
  fd.append("file", new Blob([pdf(name)], { type: "application/pdf" }), name);
  const path = `/process/2/${A}/admin/${CASE}/${item}/${field}/attachment?${Q}`;
  const res = await fetch(base + path, { method: "POST", headers: auth, body: fd });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  w.log({ method: "POST(multipart)", path: path.replace(A, "{acc}"), status: res.status, res: typeof body === "string" ? body : JSON.stringify(body).slice(0, 500) });
  if (typeof body === "string" && /<html|just a moment/i.test(body)) throw new Error("STOP: HTML challenge on upload");
  if (res.status === 429) throw new Error("STOP: 429 on upload");
  const att = Array.isArray(body?.[field]) ? body[field].find((a) => a.name === name) ?? body[field].at(-1) : null;
  return { status: res.status, err: res.status >= 300 ? (body?.en_message || JSON.stringify(body).slice(0, 200)) : undefined, att: att ? { id: att.id, name: att.name, size: att.size } : null };
}
async function download(item, field, attId) {
  await pace();
  const path = `/process/2/${A}/admin/${CASE}/${item}/${field}/attachment/${attId}?${Q}`;
  const r = await fetch(base + path, { headers: auth, redirect: "manual" });
  let status = r.status, bytes = null, ok = false, how = "direct";
  if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
    const t = new URL(r.headers.get("location"), base);
    const same = t.host === env.KF_DOMAIN;
    await pace();
    const d = await fetch(t, { headers: same ? auth : {} });
    const b = Buffer.from(await d.arrayBuffer());
    status = `${r.status}→${d.status}`; bytes = b.length; ok = d.status === 200 && b.subarray(0, 5).toString() === "%PDF-"; how = same ? "redirect, same host" : "redirect, other host";
  } else if (r.status === 200) { const b = Buffer.from(await r.arrayBuffer()); bytes = b.length; ok = b.subarray(0, 5).toString() === "%PDF-"; }
  w.log({ method: "GET(download)", path: path.replace(A, "{acc}"), status, res: `${bytes} bytes pdf=${ok}` });
  return { status, bytes, pdf: ok, how };
}
const ctx = (s) => (s._current_context || []).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id }));
const g = async (id) => { const r = await call("GET", `/process/2/${A}/admin/${CASE}/${id}?${Q}`); if (r.status !== 200 || typeof r.body !== "object") throw new Error(`admin GET ${id} → ${r.status}`); return r.body; };
const err = (r) => (r.status >= 300 ? `${r.body?.error_code || ""} ${r.body?.en_message || JSON.stringify(r.body).slice(0, 200)}`.trim() : undefined);
const tag = `ZZT-FX-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}`;
const out = { step: "fixer-case-attach-probe", at: new Date().toISOString(), tag, results: [] };
const T = (id, pass, evidence) => { out.results.push({ id, pass, evidence }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${JSON.stringify(evidence).slice(0, 300)}`); };
const save = () => writeFileSync(here("./case-attach-result.json"), JSON.stringify({ ...out, calls }, null, 1));

let item;
try {
  const body = {
    Case_Code: tag, Cycle_No: 1, Case_Title: `${tag} attach probe`, Trade_Name: "ZZT Fictional Emollient FX", Main_INCI: "ZZT Fictional INCI",
    BDF_Material_No: `${tag}-MAT`, Supplier_Code: "ZZT-SUP-FX", Supplier_Legal_Name: "ZZT Fictional Oleo GmbH", Owner_RMM: { _id: THOMAS },
    BDF_Contact_Name: "ZZT Rita Tester", BDF_Contact_Email: "rita.tester@example.invalid", Supplier_Due_Date: new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10),
    Case_Contacts_JSON: "[]", Portal_Contact_Ids: "ZZT-PU-01", Confirm_Contact_Ids: "ZZT-PU-01", Supplier_Contact_Emails: "sam.supplier@example.invalid",
    Target_Markets_Text: "DE", Release_Item_Id: "ZZT-REL-FX", Release_Key: "ZZT-REL-FX-KEY", Manifest_Hash: "ZZT-sha256-fictional", Rule_Set_Version: "ZZT-RS-1",
    Template_Version: "ZZT-T-1", Priority: "Normal", Case_Test: "Yes",
  };
  const c = await call("POST", `/process/2/${A}/${CASE}?${Q}`, body);
  item = c.body?._id; out.item = item;
  T("create", c.status === 200 && !!item, { status: c.status, err: err(c), item });
  if (!item) throw new Error("create failed");
  const s0 = await call("POST", `/process/2/${A}/${CASE}/${item}/${c.body._activity_instance_id}/submit?${Q}`, {});
  T("submit Start", s0.status < 300, { status: s0.status, err: err(s0) });
  if (s0.status >= 300) throw new Error("start submit failed");
  await sleep(1500);
  let s = await g(item);
  T("at S1", ctx(s)[0]?.step === "Waiting for supplier: CIQ", { ctx: ctx(s) });
  const u1 = await upload(item, "Supplier_Files", `${tag}-supplier-file-1.pdf`);
  s = await g(item);
  T("S1 attach Supplier_Files (ReadOnly field, admin route)", u1.status === 200 && !!u1.att?.id && (s.Supplier_Files || []).some((a) => a.id === u1.att.id), { upload: u1, stored: (s.Supplier_Files || []).map((a) => a.name) });
  if (u1.att?.id) { const d = await download(item, "Supplier_Files", u1.att.id); T("S1 download Supplier_Files", d.pdf, d); }
  const s1 = await call("POST", `/process/2/${A}/${CASE}/${item}/${ctx(s)[0]?.act}/submit?${Q}`, {});
  T("submit S1", s1.status < 300, { status: s1.status, err: err(s1) });
  if (s1.status >= 300) throw new Error("S1 submit failed");
  await sleep(1500);
  s = await g(item);
  T("at S7", ctx(s)[0]?.step === "Beiersdorf review and final release", { ctx: ctx(s) });
  const u2 = await upload(item, "Final_PDF", `${tag}-final-document.pdf`);
  const u3 = await upload(item, "Supplier_Files", `${tag}-supplier-file-2.pdf`);
  s = await g(item);
  T("S7 attach Final_PDF (ReadOnly field, admin route)", u2.status === 200 && !!u2.att?.id && (s.Final_PDF || []).some((a) => a.id === u2.att.id), { upload: u2, stored: (s.Final_PDF || []).map((a) => a.name) });
  T("S7 attach Supplier_Files (second file kept beside the first)", u3.status === 200 && (s.Supplier_Files || []).length === 2, { upload: u3, stored: (s.Supplier_Files || []).map((a) => a.name) });
  if (u2.att?.id) { const d = await download(item, "Final_PDF", u2.att.id); T("S7 download Final_PDF", d.pdf, d); }
  if (u3.att?.id) { const d = await download(item, "Supplier_Files", u3.att.id); T("S7 download Supplier_Files", d.pdf, d); }
} catch (e) {
  out.error = e.message;
  console.log("ERROR", e.message);
} finally {
  save();
  if (item && !/STOP/.test(out.error || "")) {
    const d = await call("DELETE", `/process/2/${A}/admin/${CASE}/${item}?${Q}`);
    const gg = await call("GET", `/process/2/${A}/admin/${CASE}/${item}?${Q}`);
    T("cleanup: delete the ZZT probe item", d.status < 300 && gg.status >= 400, { del: d.status, after: gg.status });
  }
  save();
}
