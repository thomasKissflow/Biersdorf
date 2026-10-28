// B2 runtime check (run ONLY after `b2-op.mjs steps --apply` and `fields --apply` both read back OK).
// Two FICTIONAL ZZT open points walk the new path as the key user, the way the service will drive them:
//   1. OP_Dept REG, OP_To_Supplier "Yes" (proves the removed "Waiting for supplier" no longer opens):
//      Raise open point → Open point – Regulatory [role] → admin-route writes of Thread_JSON / Closed_At / Closed_By /
//      OP_Outcome "Accepted" → submit → Completed
//   2. OP_Dept RMM (the last conditional step; proves the 5 earlier ones are skipped) → Open point – RMM [role] →
//      OP_Outcome "Not accepted" (the B1 list value) → submit → Completed
// Every submit uses the activity instance id from the ADMIN GET. Also re-reads one older Completed item (PkEKlFeSYb_8,
// which passed the removed step on 8 Oct) to see that its history still reads.
//   node b2-walk.mjs --run    → b2/walk-result.json   (without --run: prints the plan only)
import { A, Q, OP, call, adminGet, save, exists, load, sleep, calls } from "./lib-b2.mjs";

if (!process.argv.includes("--run")) { console.log("dry: would create 2 ZZT open points (REG, RMM) and walk them; pass --run"); process.exit(0); }
if (!exists("fields-result.json") || !load("fields-result.json").write?.ok) { console.error("fields phase not applied (fields-result.json); refusing to walk"); process.exit(1); }
if (exists("walk-result.json") && load("walk-result.json").walks?.length) { console.error("walk already ran (walk-result.json)"); process.exit(1); }
const THOMAS = "UsEJUfjYLM8Y";
const stamp = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const tag = `ZZT-B2-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}`;
const out = { step: "B2-walk", at: new Date().toISOString(), tag, walks: [] };
const ctx = (s) => (s._current_context || []).filter((x) => x._context_activity_instance_id).map((x) => ({ step: x._context_current_step, activity: x._context_activity_id, act: x._context_activity_instance_id, assigned: (x._context_assigned_to || []).map((a) => `${a.Kind}:${a.Name}`) }));
const g = async (id) => { const r = await adminGet(OP, id); if (r.status !== 200 || typeof r.body !== "object") throw new Error(`admin GET ${id} → ${r.status}`); return r.body; };
const err = (r) => (r.status >= 300 ? `${r.body?.error_code || ""} ${r.body?.en_message || JSON.stringify(r.body).slice(0, 200)}`.trim() : undefined);

{ const s = await g("PkEKlFeSYb_8"); out.olderItem = { id: "PkEKlFeSYb_8", status: s._status, OP_To_Supplier: s.OP_To_Supplier, current_step: s._current_step ?? null }; }

for (const [dept, outcome, expectStep] of [["REG", "Accepted", "Open point – Regulatory"], ["RMM", "Not accepted", "Open point – RMM"]]) {
  const w = { dept, expectStep };
  out.walks.push(w);
  const body = {
    OP_Key: `${tag}-${dept}`, Round_No: 1, Case_Code: `${tag}-CASE`, Cycle_No: 1, Supplier_Code: "ZZT-SUP-B2", Case_Item_Id: "ZZT-CASE-ITEM-B2",
    OP_Kind: "Query", OP_Dept: dept, Raised_By_Dept: dept, OP_To_Supplier: "Yes", Raised_By_User: { _id: THOMAS }, Raised_By_Name: "ZZT Rita Raiser",
    Ref_Kind: "Section", Ref_Label: "ZZT Section 1", Question_Text: `${tag} fictional question (${dept})`, Supplier_Justification: "ZZT fictional justification",
    Responsible_User: { _id: THOMAS }, Responsible_Name: "ZZT Rita Raiser", Supplier_Due_Date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
    OP_Progress: "Open", Thread_JSON: JSON.stringify([{ kind: "raised", by: "ZZT Rita Raiser", at: stamp(), text: "ZZT fictional question" }]),
  };
  const c = await call("POST", `/process/2/${A}/${OP}?${Q}`, body);
  w.create = { status: c.status, err: err(c), item: c.body?._id };
  save("walk-result.json", out);
  const item = c.body?._id; if (!item) break;
  await sleep(800);
  let s = await g(item);
  w.atStart = { status: s._status, ctx: ctx(s), stored: { Raised_By_User: s.Raised_By_User ?? null, Raised_By_Name: s.Raised_By_Name ?? null, Thread_JSON: s.Thread_JSON ? "set" : null, OP_Progress: s.OP_Progress ?? null } };
  const s0 = await call("POST", `/process/2/${A}/${OP}/${item}/${ctx(s)[0]?.act || c.body?._activity_instance_id}/submit?${Q}`, {});
  w.submitStart = { status: s0.status, err: err(s0) };
  save("walk-result.json", out);
  if (s0.status >= 300) break;
  await sleep(1500);
  s = await g(item);
  w.atReview = { status: s._status, ctx: ctx(s), current_assigned_to: s._current_assigned_to, stepOk: ctx(s)[0]?.step === expectStep };
  const wr = { OP_Outcome: outcome, Closed_At: stamp(), Closed_By: { _id: THOMAS }, Outcome_Reason: "ZZT fictional close reason", Thread_JSON: JSON.stringify([{ kind: "raised" }, { kind: "accepted", by: "ZZT Rita Raiser", at: stamp() }]) };
  const p = await call("PUT", `/process/2/${A}/admin/${OP}/${item}?${Q}`, wr);
  await sleep(800); s = await g(item);
  w.atReview.adminPut = { status: p.status, err: err(p), readBack: { OP_Outcome: s.OP_Outcome ?? null, Closed_At: s.Closed_At ?? null, Closed_By: s.Closed_By ?? null, Thread_JSON: s.Thread_JSON ? JSON.parse(s.Thread_JSON).length + " entries" : null } };
  const a = ctx(s)[0]?.act;
  const s1 = await call("POST", `/process/2/${A}/${OP}/${item}/${a}/submit?${Q}`, {});
  w.submitReview = { status: s1.status, err: err(s1) };
  await sleep(1500);
  s = await g(item);
  w.end = { status: s._status, OP_Outcome: s.OP_Outcome ?? null };
  w.pathText = [w.atStart.ctx[0]?.step, `${w.atReview.ctx[0]?.step} [${w.atReview.ctx[0]?.assigned.join("+")}]`, w.end.status].join(" → ");
  save("walk-result.json", out);
}
out.calls = calls;
save("walk-result.json", out);
console.log(JSON.stringify(out, null, 1));
