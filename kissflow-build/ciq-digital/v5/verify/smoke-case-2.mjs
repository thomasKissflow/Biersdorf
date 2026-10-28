// Continuation of smoke-case.mjs for item PkEMwsBV0JSm (left as a Draft because the admin GET at Start carries no
// activity instance id). Submit Start with the CREATE response's _activity_instance_id (PkEMwsBWCmtv), admin GET,
// then withdraw (initiator) and admin GET. GUARD: only submit/withdraw on this one item.
import { appendFileSync, readFileSync } from "node:fs";
import { client } from "../../../lib/kf.mjs";
import { here, save, Q } from "./vlib.mjs";
if (!process.argv.includes("--run")) { console.log("dry; pass --run"); process.exit(0); }
const kf = client({ readOnly: false });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not DEV");
const A = kf.acc, P = "CIQ_Case_A00", ITEM = "PkEMwsBV0JSm", START_ACT = "PkEMwsBWCmtv";
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, body) {
  if (method !== "GET" && !(method === "POST" && path.startsWith(`/process/2/${A}/${P}/${ITEM}/`) && (/\/submit\?/.test(path) || /\/withdraw\?/.test(path)))) throw new Error(`GUARD: refused ${method} ${path}`);
  const wait = last + 2000 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
  const r = await kf.call(method, path, body, { retries: 0 });
  const s = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
  appendFileSync(here("./requests.jsonl"), JSON.stringify({ at: new Date().toISOString(), method, path: path.split(A).join("{acc}"), status: r.status, req: body, res: s && s.length > 600 ? s.slice(0, 600) + "…" : s }) + "\n");
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge (${r.status})`);
  if (r.status === 429) throw new Error("STOP: 429");
  return r;
}
const ctx = (s) => (s._current_context || []).map((x) => ({ step: x._context_current_step, activity: x._context_activity_id, act: x._context_activity_instance_id, assigned: (x._context_assigned_to || []).map((a) => `${a.Kind}:${a.Name}:${a._id}`) }));
const err = (r) => (r.status >= 300 ? `${r.body?.error_code || ""} ${r.body?.en_message || JSON.stringify(r.body).slice(0, 200)}`.trim() : undefined);
const g = async () => { const r = await call("GET", `/process/2/${A}/admin/${P}/${ITEM}?${Q}`); if (r.status !== 200 || typeof r.body !== "object") throw new Error(`admin GET → ${r.status}`); return r.body; };
const out = JSON.parse(readFileSync(here("./smoke-case-result.json"), "utf8"));
out.part2 = { at: new Date().toISOString(), startActFromCreate: START_ACT };
const s0 = await call("POST", `/process/2/${A}/${P}/${ITEM}/${START_ACT}/submit?${Q}`, {});
out.part2.submitStart = { status: s0.status, err: err(s0) };
save("smoke-case-result.json", out);
await sleep(1500);
let s = await g();
out.part2.afterSubmit = { status: s._status, ctx: ctx(s), current_assigned_to: s._current_assigned_to, Case_Phase: s.Case_Phase ?? null, Final_Document_Hash: s.Final_Document_Hash ?? null, Template_Version: s.Template_Version ?? null };
save("smoke-case-result.json", out);
if (s._status === "InProgress") {
  const w = await call("POST", `/process/2/${A}/${P}/${ITEM}/withdraw?${Q}`, { Comment: "verifier smoke: fictional ZZT item, withdrawn by its initiator" });
  out.part2.withdraw = { status: w.status, err: err(w) };
  s = await g();
  out.part2.final = { status: s._status, ctx: ctx(s) };
}
save("smoke-case-result.json", out);
console.log(JSON.stringify(out.part2, null, 1));
