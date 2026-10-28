// B1 runtime check (after both CIQ Case publishes): one FICTIONAL ZZT case walks the new path as the key user, the way the
// service will drive it — Start (RMM fields) → "Waiting for supplier: CIQ" (admin-route writes of the new fields) →
// "Beiersdorf review and final release" → Completed. Every submit uses the activity instance id from the ADMIN GET.
// Also re-reads the one older in-progress item (PkEKlr8g60Nj, at the kept S1) to see that it still reads after the graft.
//   node b1-walk.mjs --run    → b1/walk-result.json   (without --run: prints the plan only)
import { A, Q, CASE, call, adminGet, save, exists, load, sleep } from "./lib-b1.mjs";

if (!process.argv.includes("--run")) { console.log("dry: would create 1 ZZT case and walk it; pass --run"); process.exit(0); }
if (exists("walk-result.json") && load("walk-result.json").item) { console.error("walk already ran (walk-result.json)"); process.exit(1); }
const THOMAS = "UsEJUfjYLM8Y";
const stamp = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const tag = `ZZT-B1-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}`;
const out = { step: "B1-walk", at: new Date().toISOString(), tag };
const ctx = (s) => (s._current_context || []).map((x) => ({ step: x._context_current_step, activity: x._context_activity_id, act: x._context_activity_instance_id, assigned: (x._context_assigned_to || []).map((a) => `${a.Kind}:${a.Name}`) }));
const g = async (id) => { const r = await adminGet(CASE, id); if (r.status !== 200 || typeof r.body !== "object") throw new Error(`admin GET ${id} → ${r.status}`); return r.body; };
const err = (r) => (r.status >= 300 ? `${r.body?.error_code || ""} ${r.body?.en_message || JSON.stringify(r.body).slice(0, 200)}`.trim() : undefined);

// 0. the older in-progress item (created on the v4 definition, parked at S1)
{ const s = await g("PkEKlr8g60Nj"); out.olderItem = { id: "PkEKlr8g60Nj", status: s._status, ctx: ctx(s), current_assigned_to: s._current_assigned_to }; }

// 1. create at Start with the §4.1 Start fields
const body = {
  Case_Code: tag, Cycle_No: 1, Case_Title: `${tag} v5 path check`, Trade_Name: "ZZT Fictional Emollient B1", Main_INCI: "ZZT Fictional INCI",
  BDF_Material_No: `${tag}-MAT`, Supplier_Code: "ZZT-SUP-B1", Supplier_Legal_Name: "ZZT Fictional Oleo GmbH", Owner_RMM: { _id: THOMAS },
  BDF_Contact_Name: "ZZT Rita Tester", BDF_Contact_Email: "rita.tester@example.invalid", Supplier_Due_Date: new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10),
  Case_Contacts_JSON: JSON.stringify([{ id: "ZZT-PU-01", name: "ZZT Sam Supplier" }]), Portal_Contact_Ids: "ZZT-PU-01", Confirm_Contact_Ids: "ZZT-PU-01",
  Supplier_Contact_Emails: "sam.supplier@example.invalid", Target_Markets_Text: "DE", Release_Item_Id: "ZZT-REL-B1", Release_Key: "ZZT-REL-B1-KEY",
  Manifest_Hash: "ZZT-sha256-fictional", Rule_Set_Version: "ZZT-RS-1", Template_Version: "ZZT-T-1",
  Priority: "Normal", Case_Test: "Yes", Release_Manifest_JSON: JSON.stringify({ release: "ZZT-REL-B1" }),
};
const c = await call("POST", `/process/2/${A}/${CASE}?${Q}`, body);
out.create = { status: c.status, err: err(c), item: c.body?._id, metaVersion: c.body?._meta_version };
const item = c.body?._id; out.item = item;
save("walk-result.json", out);
if (!item) { console.log(JSON.stringify(out, null, 1)); process.exit(1); }
await sleep(800);
let s = await g(item);
out.atStart = { status: s._status, ctx: ctx(s), stored: { Template_Version: s.Template_Version ?? null, Priority: s.Priority ?? null, Rule_Set_Version: s.Rule_Set_Version ?? null, Target_Markets_Text: s.Target_Markets_Text ?? null } };
const startAct = ctx(s)[0]?.act || c.body?._activity_instance_id;
const s0 = await call("POST", `/process/2/${A}/${CASE}/${item}/${startAct}/submit?${Q}`, {});
out.submitStart = { status: s0.status, err: err(s0) };
save("walk-result.json", out);
if (s0.status >= 300) { console.log(JSON.stringify(out, null, 1)); process.exit(1); }

// 2. at "Waiting for supplier: CIQ": the service's admin-route writes of the new fields
await sleep(1500);
s = await g(item);
out.atS1 = { status: s._status, ctx: ctx(s), current_assigned_to: s._current_assigned_to };
const w1 = { Case_Phase: "Supplier filling in the CIQ", Undefined_Origin: "No", Case_Data_Item_Id: "ZZT-CD-B1", Portal_Release_Item_Id: "ZZT-PREL-B1" };
const p1 = await call("PUT", `/process/2/${A}/admin/${CASE}/${item}?${Q}`, w1);
await sleep(800); s = await g(item);
out.atS1.adminPut = { status: p1.status, err: err(p1), readBack: Object.fromEntries(Object.keys(w1).map((k) => [k, s[k] ?? null])) };
const a1 = ctx(s)[0]?.act;
const s1 = await call("POST", `/process/2/${A}/${CASE}/${item}/${a1}/submit?${Q}`, {});
out.atS1.submit = { status: s1.status, err: err(s1) };
save("walk-result.json", out);
if (s1.status >= 300) { console.log(JSON.stringify(out, null, 1)); process.exit(1); }

// 3. at "Beiersdorf review and final release"
await sleep(1500);
s = await g(item);
out.atS7 = { status: s._status, ctx: ctx(s), current_assigned_to: s._current_assigned_to };
const w2 = { Case_Phase: "Completed", Release_Requested_At: stamp(), Final_Document_Hash: "ZZT-sha256-doc", Final_Document_At: stamp() };
const p2 = await call("PUT", `/process/2/${A}/admin/${CASE}/${item}?${Q}`, w2);
await sleep(800); s = await g(item);
out.atS7.adminPut = { status: p2.status, err: err(p2), readBack: Object.fromEntries(Object.keys(w2).map((k) => [k, s[k] ?? null])) };
const a2 = ctx(s)[0]?.act;
const s2 = await call("POST", `/process/2/${A}/${CASE}/${item}/${a2}/submit?${Q}`, {});
out.atS7.submit = { status: s2.status, err: err(s2) };
await sleep(1500);
s = await g(item);
out.end = { status: s._status, ctx: ctx(s), Case_Phase: s.Case_Phase ?? null };
out.pathText = [out.atStart.ctx[0]?.step, out.atS1.ctx[0]?.step + ` [${out.atS1.ctx[0]?.assigned.join("+")}]`, out.atS7.ctx[0]?.step + ` [${out.atS7.ctx[0]?.assigned.join("+")}]`, out.end.status].join(" → ");
save("walk-result.json", out);
console.log(JSON.stringify(out, null, 1));
