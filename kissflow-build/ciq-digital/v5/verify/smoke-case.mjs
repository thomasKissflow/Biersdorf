// Verifier smoke (night 2026-10-14): ONE fictional ZZT CIQ Case: create → admin GET (Start) → submit Start with the
// admin-GET activity instance id → admin GET (expect "Waiting for supplier: CIQ" on CIQ Integration Service) → withdraw
// (initiator) → admin GET (expect Withdrawn). Adversarial extra: the create body also carries two SERVICE-ONLY fields that are
// ReadOnly at Start (Case_Phase, Final_Document_Hash) to see whether a Start writer can forge them.
// GUARD: the only writes allowed are POST create on CIQ_Case_A00, and submit/withdraw on the item this script created.
// Pacing 2 s, no retries; 429/HTML → STOP. Log: verify/requests.jsonl. Result: verify/smoke-case-result.json.
import { appendFileSync, existsSync } from "node:fs";
import { client } from "../../../lib/kf.mjs";
import { here, save, APP, Q } from "./vlib.mjs";
if (!process.argv.includes("--run")) { console.log("dry: would create 1 ZZT CIQ Case, submit Start, withdraw it; pass --run"); process.exit(0); }
if (existsSync(here("./smoke-case-result.json"))) { console.error("smoke already ran"); process.exit(1); }
const kf = client({ readOnly: false });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not DEV");
const A = kf.acc, P = "CIQ_Case_A00";
let last = 0, created = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, body) {
  if (method !== "GET") {
    const ok = (method === "POST" && path === `/process/2/${A}/${P}?${Q}` && !created) ||
      (created && method === "POST" && (path.startsWith(`/process/2/${A}/${P}/${created}/`) && (/\/submit\?/.test(path) || /\/withdraw\?/.test(path))));
    if (!ok) throw new Error(`GUARD: refused ${method} ${path}`);
  }
  const wait = last + 2000 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
  const r = await kf.call(method, path, body, { retries: 0 });
  const s = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
  appendFileSync(here("./requests.jsonl"), JSON.stringify({ at: new Date().toISOString(), method, path: path.split(A).join("{acc}"), status: r.status, req: body, res: s && s.length > 600 ? s.slice(0, 600) + "…" : s }) + "\n");
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge (${r.status}) on ${method} ${path}`);
  if (r.status === 429) throw new Error(`STOP: 429 on ${method} ${path}`);
  return r;
}
const ctx = (s) => (s._current_context || []).map((x) => ({ step: x._context_current_step, activity: x._context_activity_id, act: x._context_activity_instance_id, assigned: (x._context_assigned_to || []).map((a) => `${a.Kind}:${a.Name}:${a._id}`) }));
const err = (r) => (r.status >= 300 ? `${r.body?.error_code || ""} ${r.body?.en_message || JSON.stringify(r.body).slice(0, 200)}`.trim() : undefined);
const g = async () => { const r = await call("GET", `/process/2/${A}/admin/${P}/${created}?${Q}`); if (r.status !== 200 || typeof r.body !== "object") throw new Error(`admin GET → ${r.status}`); return r.body; };
const tag = `ZZT-VER-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}`;
const out = { step: "verifier-smoke-case", at: new Date().toISOString(), tag };
const body = {
  Case_Code: tag, Cycle_No: 1, Case_Title: `${tag} verifier smoke`, Trade_Name: "ZZT Fictional Verifier Wax", Main_INCI: "ZZT Fictional INCI",
  BDF_Material_No: `${tag}-MAT`, Supplier_Code: "ZZT-SUP-VER", Supplier_Legal_Name: "ZZT Fictional Verifier GmbH", Owner_RMM: { _id: "UsEJUfjYLM8Y" },
  BDF_Contact_Name: "ZZT Vera Verifier", BDF_Contact_Email: "vera.verifier@example.invalid", Supplier_Due_Date: new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10),
  Case_Contacts_JSON: JSON.stringify([{ id: "ZZT-PU-V1", name: "ZZT Sid Supplier" }]), Portal_Contact_Ids: "ZZT-PU-V1", Confirm_Contact_Ids: "ZZT-PU-V1",
  Supplier_Contact_Emails: "sid.supplier@example.invalid", Target_Markets_Text: "DE", Release_Item_Id: "ZZT-REL-VER", Release_Key: "ZZT-REL-VER-KEY",
  Manifest_Hash: "ZZT-sha256-fictional", Rule_Set_Version: "ZZT-RS-1", Template_Version: "ZZT-T-1", Priority: "High", Case_Test: "Yes",
  // adversarial: service-only fields, ReadOnly at Start
  Case_Phase: "Completed", Final_Document_Hash: "ZZT-forged-at-create",
};
const c = await call("POST", `/process/2/${A}/${P}?${Q}`, body);
out.create = { status: c.status, err: err(c), item: c.body?._id };
created = c.body?._id || null; out.item = created;
save("smoke-case-result.json", out);
if (!created) { console.log(JSON.stringify(out, null, 1)); process.exit(1); }
let s = await g();
out.atStart = { status: s._status, ctx: ctx(s), stored: { Template_Version: s.Template_Version ?? null, Priority: s.Priority ?? null, Case_Phase_forged: s.Case_Phase ?? null, Final_Document_Hash_forged: s.Final_Document_Hash ?? null } };
const startAct = ctx(s)[0]?.act;
out.startAct = startAct;
if (!startAct) { out.note = "no activity instance id at Start in the admin GET"; save("smoke-case-result.json", out); }
const s0 = startAct ? await call("POST", `/process/2/${A}/${P}/${created}/${startAct}/submit?${Q}`, {}) : { status: 0 };
out.submitStart = { status: s0.status, err: err(s0) };
save("smoke-case-result.json", out);
s = await g();
out.afterSubmit = { status: s._status, ctx: ctx(s), current_assigned_to: s._current_assigned_to, Case_Phase: s.Case_Phase ?? null, Final_Document_Hash: s.Final_Document_Hash ?? null };
const w = await call("POST", `/process/2/${A}/${P}/${created}/withdraw?${Q}`, { Comment: "verifier smoke: fictional ZZT item, withdrawn by its initiator" });
out.withdraw = { status: w.status, err: err(w) };
s = await g();
out.final = { status: s._status, ctx: ctx(s) };
save("smoke-case-result.json", out);
console.log(JSON.stringify(out, null, 1));
