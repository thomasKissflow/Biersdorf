// v6 walks (20 Oct), after backend-v6: the screens act as the signed-in user, so this uses the USER routes (create, the
// assignee update POST …/{item}/{activityInstance}, submit), never the admin PUT. The key user (Thomas) holds every role.
// W1 CIQ Review: RMM starts a QM review → "Review – QM": write Open_Count/RMES_Gaps (now Editable) + the completion
//    fields → submit → End; and a negative check: a non-zero Open_Count must block the submit (Review_Gate is Mandatory).
// W2 CIQ Open Point: the raiser starts it with Raiser_Assignee → "Open point – QM" assigned to the raiser → accept at the
//    step (user route) → End.
// Fictional ZZT data; every item is withdrawn/deleted at the end (admin DELETE, proven S-5/P-RO).
import { call, A, allowId, sleep } from "../v5/b3/lib-b3.mjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const Q = "_application_id=CIQ_Digital_A00", REVIEW = "CIQ_Review_A00", OP = "CIQ_Open_Point_A00", THOMAS = "UsEJUfjYLM8Y";
allowId(REVIEW); allowId(OP);
const tag = `ZZT-W6-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}`;
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const err = (r) => (r.status >= 300 ? `${r.body?.error_code || ""} ${r.body?.en_message || JSON.stringify(r.body).slice(0, 240)}`.trim() : undefined);
const ctx = (s) => (s._current_context || []).filter((x) => x._context_activity_instance_id).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id, to: (x._context_assigned_to || []).map((a) => `${a.Kind}:${a.Name}`) }));
const aget = async (p, i) => (await call("GET", `/process/2/${A}/admin/${p}/${i}?${Q}`)).body || {};
const out = { at: new Date().toISOString(), tag, w1: {}, w2: {} };
const save = () => writeFileSync(here("./walk-v6-result.json"), JSON.stringify(out, null, 1));
const made = [];
try {
  // W1
  const rb = { Review_Key: `${tag}-QM-1`, Case_Code: `${tag}-CASE`, Cycle_No: 1, Case_Item_Id: "ZZT-CASE-ITEM-W6", Supplier_Code: "ZZT-SUP-W6", Trade_Name: "ZZT Test Material",
    Review_Dept: "QM", Round_No: 1, Activation_Kind: "completeness", Activated_By_Name: "ZZT Katrin Test", Assignee_User: { _id: THOMAS }, Track_Status: "active", Open_Count: 0, RMES_Gaps: 0,
    Completed_At: now() }; // Completed_At is now ReadOnly at Start: it must NOT be stored
  const c = await call("POST", `/process/2/${A}/${REVIEW}?${Q}`, rb);
  out.w1.create = { status: c.status, err: err(c), item: c.body?._id }; save();
  const item = c.body?._id; if (!item) throw new Error("W1 create failed"); made.push([REVIEW, item]);
  await sleep(800); let s = await aget(REVIEW, item);
  out.w1.startReadOnlyHeld = { Completed_At: s.Completed_At ?? null, ok: !s.Completed_At };
  const s0 = await call("POST", `/process/2/${A}/${REVIEW}/${item}/${ctx(s)[0]?.act || c.body?._activity_instance_id}/submit?${Q}`, {});
  out.w1.submitStart = { status: s0.status, err: err(s0) }; save(); if (s0.status >= 300) throw new Error("W1 submit Start");
  await sleep(1500); s = await aget(REVIEW, item);
  const at = ctx(s)[0]; out.w1.atDept = at;
  // negative: a non-zero count must block completion
  const u1 = await call("POST", `/process/2/${A}/${REVIEW}/${item}/${at.act}?${Q}`, { Open_Count: 1, RMES_Gaps: 0, Review_Confirm: "Yes", Completed_By: { _id: THOMAS }, Completed_At: now() });
  const sb1 = await call("POST", `/process/2/${A}/${REVIEW}/${item}/${at.act}/submit?${Q}`, {});
  await sleep(1000); s = await aget(REVIEW, item);
  out.w1.blockedWithOpenPoint = { update: u1.status, updateErr: err(u1), submit: sb1.status, submitErr: err(sb1), stillAt: ctx(s)[0]?.step, Review_Gate: s.Review_Gate ?? null, ok: sb1.status >= 300 && ctx(s)[0]?.step === at.step };
  save();
  // positive: counts 0 → gate OK → complete
  const u2 = await call("POST", `/process/2/${A}/${REVIEW}/${item}/${at.act}?${Q}`, { Open_Count: 0, RMES_Gaps: 0 });
  await sleep(800); s = await aget(REVIEW, item);
  out.w1.userUpdate = { status: u2.status, err: err(u2), Open_Count: s.Open_Count, RMES_Gaps: s.RMES_Gaps, Review_Gate: s.Review_Gate ?? null };
  const sb2 = await call("POST", `/process/2/${A}/${REVIEW}/${item}/${at.act}/submit?${Q}`, {});
  await sleep(1500); s = await aget(REVIEW, item);
  out.w1.complete = { submit: sb2.status, err: err(sb2), status: s._status, Completed_By: s.Completed_By?.Name ?? null, ok: sb2.status < 300 && s._status === "Completed" };
  save();
  // W2
  const ob = { OP_Key: `${tag}-OP-1`, Round_No: 1, Case_Code: `${tag}-CASE`, Cycle_No: 1, Supplier_Code: "ZZT-SUP-W6", Case_Item_Id: "ZZT-CASE-ITEM-W6",
    OP_Kind: "Query", OP_Dept: "QM", Raised_By_Dept: "QM", OP_To_Supplier: "Yes", Raised_By_User: { _id: THOMAS }, Raised_By_Name: "ZZT Quentin Test",
    Ref_Kind: "Section", Ref_Label: "ZZT Section K4", Question_Text: `${tag} fictional question`, Supplier_Justification: "ZZT fictional justification",
    Responsible_User: { _id: THOMAS }, Supplier_Due_Date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), OP_Progress: "Open",
    Raiser_Assignee: [{ _id: THOMAS }], Thread_JSON: JSON.stringify([{ kind: "raised", by: "ZZT Quentin Test", at: now() }]),
    Response_Text: "must not be stored (ReadOnly at Start)" };
  const c2 = await call("POST", `/process/2/${A}/${OP}?${Q}`, ob);
  out.w2.create = { status: c2.status, err: err(c2), item: c2.body?._id }; save();
  const op = c2.body?._id; if (!op) throw new Error("W2 create failed"); made.push([OP, op]);
  await sleep(800); let o = await aget(OP, op);
  out.w2.startReadOnlyHeld = { Response_Text: o.Response_Text ?? null, ok: !o.Response_Text };
  const t0 = await call("POST", `/process/2/${A}/${OP}/${op}/${ctx(o)[0]?.act || c2.body?._activity_instance_id}/submit?${Q}`, {});
  out.w2.submitStart = { status: t0.status, err: err(t0) }; if (t0.status >= 300) throw new Error("W2 submit Start");
  await sleep(1500); o = await aget(OP, op);
  const at2 = ctx(o)[0]; out.w2.atDept = at2; save();
  const u3 = await call("POST", `/process/2/${A}/${OP}/${op}/${at2.act}?${Q}`, { OP_Outcome: "Accepted", Outcome_Reason: "ZZT accepted", Closed_At: now(), Closed_By: { _id: THOMAS },
    Thread_JSON: JSON.stringify([{ kind: "raised" }, { kind: "accepted", by: "ZZT Quentin Test", at: now() }]) });
  const t1 = await call("POST", `/process/2/${A}/${OP}/${op}/${at2.act}/submit?${Q}`, {});
  await sleep(1500); o = await aget(OP, op);
  out.w2.accept = { update: u3.status, updateErr: err(u3), submit: t1.status, submitErr: err(t1), status: o._status, OP_Outcome: o.OP_Outcome ?? null, Open_Num: o.Open_Num ?? null, ok: t1.status < 300 && o._status === "Completed" };
  save();
} catch (e) { out.error = String(e.message || e); save(); }
out.cleanup = [];
for (const [p, i] of made) {
  const s = await aget(p, i);
  let wd = null; if (s._status === "InProgress") wd = (await call("POST", `/process/2/${A}/${p}/${i}/withdraw?${Q}`, { Comment: "ZZT walk clean-up" })).status;
  await sleep(800);
  const d = await call("DELETE", `/process/2/${A}/admin/${p}/${i}?${Q}`);
  await sleep(800);
  const g = await call("GET", `/process/2/${A}/admin/${p}/${i}?${Q}`);
  out.cleanup.push({ flow: p, item: i, withdraw: wd, delete: d.status, deleteErr: err(d), getAfter: g.status });
}
save();
console.log(JSON.stringify(out, null, 1));
