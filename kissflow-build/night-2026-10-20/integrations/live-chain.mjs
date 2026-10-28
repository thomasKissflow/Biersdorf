// Drives a ZZT case through the LIVE hand-offs as the screens would (text/plain webhook POSTs), reading back each.
//   node live-chain.mjs <slot>
import { call, A, load, save } from "./integ-lib.mjs";
const s = load(); const slot = process.argv[2]; const Z = s.zzt[slot];
const QA = "_application_id=CIQ_Digital_A00", QP = "_application_id=CIQ_Supplier_Portal_A00";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (key, payload) => { const r = await fetch(s.integrations[key].webhookUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ ...payload, idempotencyKey: `ZZT-${slot}-${key}` }) }); return r.status; };
const kase = async () => (await call("GET", `/process/2/${A}/admin/CIQ_Case_A00/${Z.caseId}?${QA}`)).body;
const req = async (id) => (await call("GET", `/process/2/${A}/admin/CIQP_Request_A00/${id}?${QP}`)).body;
const until = async (what, fn, ms = 40000) => { for (let t = 0; t < ms; t += 5000) { await sleep(5000); const v = await fn(); if (v) return v; } throw new Error(`timed out: ${what}`); };
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
console.log("I-1 case.started", await post("I1", { caseItemId: Z.caseId }));
const c1 = await until("I-1 link", async () => (await kase()).Portal_Request_Item_Id && (await kase()));
Z.requestId = c1.Portal_Request_Item_Id; save(s);
const r1 = await req(Z.requestId);
console.log("  → request", Z.requestId, JSON.stringify({ step: r1._current_step, key: r1.Request_Key, assigned: (r1.Assigned_Contacts || []).map((u) => u._id) }));
await call("PUT", `/process/2/${A}/admin/CIQP_Request_A00/${Z.requestId}?${QP}`, { Answers_JSON: '{"FLD-ZZT-001":"ZZT answer (fictional)"}', Answers_Rev: 1, Completeness_Confirm: "Confirmed", Completeness_By_Name: "ZZT Contact (fictional)", Completeness_By_Email: "zzt.contact@example.com", Completeness_By_Role: "Supplier", Completeness_At: now() });
console.log("I-2 completeness.confirmed", await post("I2", { portalRequestItemId: Z.requestId }));
const c2 = await until("I-2 move", async () => { const c = await kase(); return c._current_step === "Beiersdorf review and final release" && c; });
console.log("  → case", JSON.stringify({ step: c2._current_step, Completeness_Confirm: c2.Completeness_Confirm, Case_Phase: c2.Case_Phase, Answers_Rev: c2.Answers_Rev }));
console.log("I-5 release.requested", await post("P_release_requested", { caseItemId: Z.caseId }));
const c3 = await until("I-5 stamp", async () => { const c = await kase(); return c.Release_Requested_At && c; });
const r3 = await req(Z.requestId);
console.log("  → case Release_Requested_At", c3.Release_Requested_At, "| request", JSON.stringify({ Release_Flag: r3.Release_Flag, Request_Locked: r3.Request_Locked, label: r3.Case_Phase_Label }));
