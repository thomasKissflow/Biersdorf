// v6 probe P-RO (20 Oct): can the admin route write fields that are ReadOnly at the item's current step?
// I-3 writes Portal_Query_Item_Id and I-4 writes Response_* on an open point at "Open point – <Dept>", where they are ReadOnly.
// One ZZT test open point (fictional values; the key user is the raiser): create → submit Start → admin PUT ReadOnly fields
// at the department step → admin GET read-back → withdraw → admin DELETE (clean-up). Writes only CIQ_Open_Point_A00 (lib-b2 guard).
import { A, Q, OP, call, adminGet, sleep } from "../v5/b2/lib-b2.mjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const THOMAS = "UsEJUfjYLM8Y";
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const tag = `ZZT-PRO-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}`;
const err = (r) => (r.status >= 300 ? `${r.body?.error_code || ""} ${r.body?.en_message || JSON.stringify(r.body).slice(0, 200)}`.trim() : undefined);
const ctx = (s) => (s._current_context || []).filter((x) => x._context_activity_instance_id).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id }));
const out = { probe: "P-RO admin PUT on ReadOnly fields", at: new Date().toISOString(), tag };
const save = () => writeFileSync(here("./probe-readonly-put-result.json"), JSON.stringify(out, null, 1));
const body = {
  OP_Key: `${tag}-REG`, Round_No: 1, Case_Code: `${tag}-CASE`, Cycle_No: 1, Supplier_Code: "ZZT-SUP-PRO", Case_Item_Id: "ZZT-CASE-ITEM-PRO",
  OP_Kind: "Query", OP_Dept: "REG", Raised_By_Dept: "REG", OP_To_Supplier: "Yes", Raised_By_User: { _id: THOMAS }, Raised_By_Name: "ZZT Rita Raiser",
  Ref_Kind: "Section", Ref_Label: "ZZT Section 1", Question_Text: `${tag} fictional question`, Supplier_Justification: "ZZT fictional justification",
  Responsible_User: { _id: THOMAS }, Supplier_Due_Date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
  OP_Progress: "Open", Raiser_Assignee: [{ _id: THOMAS }],
};
let item;
try {
  const c = await call("POST", `/process/2/${A}/${OP}?${Q}`, body);
  out.create = { status: c.status, err: err(c), item: c.body?._id }; save();
  item = c.body?._id; if (!item) throw new Error("create failed");
  await sleep(800);
  let s = (await adminGet(OP, item)).body;
  const s0 = await call("POST", `/process/2/${A}/${OP}/${item}/${ctx(s)[0]?.act || c.body?._activity_instance_id}/submit?${Q}`, {});
  out.submitStart = { status: s0.status, err: err(s0) }; save();
  if (s0.status >= 300) throw new Error("submit Start failed");
  await sleep(1500);
  s = (await adminGet(OP, item)).body;
  out.atDept = { status: s._status, ctx: ctx(s) };
  // ReadOnly at "Open point – Regulatory": Portal_Query_Item_Id, Response_Kind, Response_Text, Response_Doc_Refs_JSON, Supplier_Responsible_Email
  const wr = { Portal_Query_Item_Id: "ZZT-PQ-1", Response_Kind: "Answer", Response_Text: "ZZT fictional supplier answer", Response_Doc_Refs_JSON: "[]", Supplier_Responsible_Email: "zzt.contact@example.com" };
  const p = await call("PUT", `/process/2/${A}/admin/${OP}/${item}?${Q}`, wr);
  await sleep(1000);
  s = (await adminGet(OP, item)).body;
  out.adminPutReadOnly = { status: p.status, err: err(p), wrote: wr, readBack: Object.fromEntries(Object.keys(wr).map((k) => [k, s[k] ?? null])) };
  out.verdict = p.status < 300 && Object.entries(wr).every(([k, v]) => s[k] === v) ? "ADMIN PUT WRITES READONLY FIELDS" : "ADMIN PUT DOES NOT WRITE READONLY FIELDS (or partly)";
  save();
} catch (e) { out.error = String(e.message || e); save(); }
if (item) {
  const wd = await call("POST", `/process/2/${A}/${OP}/${item}/withdraw?${Q}`, { Comment: "ZZT probe P-RO clean-up" });
  await sleep(1000);
  const d = await call("DELETE", `/process/2/${A}/admin/${OP}/${item}?${Q}`);
  await sleep(1000);
  const g = await adminGet(OP, item);
  out.cleanup = { withdraw: wd.status, withdrawErr: err(wd), delete: d.status, deleteErr: err(d), getAfter: g.status };
}
save();
console.log(JSON.stringify(out, null, 1));
