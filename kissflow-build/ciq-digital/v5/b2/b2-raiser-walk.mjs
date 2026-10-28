// V-19(b) runtime check (run ONLY after `b2-raiser.mjs --apply` read back PASS). One FICTIONAL ZZT open point:
//   create with OP_Dept "QM" + Raiser_Assignee [Thomas UsEJUfjYLM8Y] → submit Start → the admin GET must show
//   "Open point – QM" (Activity_1go37bt) assigned to User:Thomas and to no AppRole → admin PUT of OP_Outcome "Accepted"
//   (+ Closed_At / Closed_By / Outcome_Reason / Thread_JSON, the way the service writes) → submit with the activity
//   instance id from the ADMIN GET → Completed. The point is completed, so nothing stays in flight.
//   node b2-raiser-walk.mjs --run    → b2/raiser-walk-result.json   (without --run: prints the plan only)
// Guards (lib-b2.mjs): DEV only; >= 1.2 s between calls, no retries; writes only to CIQ_Open_Point_A00; 429/HTML → STOP.
import { A, Q, OP, call, adminGet, getDraftStrict, save, exists, load, sleep, calls } from "./lib-b2.mjs";

const PLAN = 'create 1 ZZT open point (OP_Dept QM, Raiser_Assignee [Thomas]) → submit Start → expect "Open point – QM" [User:Thomas] → admin PUT OP_Outcome Accepted → submit → Completed';
if (!process.argv.includes("--run")) { console.log(`dry: would ${PLAN}; pass --run`); process.exit(0); }
if (!exists("raiser-result.json") || !load("raiser-result.json").write?.ok || !load("raiser-result.json").pass) { console.error("b2-raiser.mjs --apply has not read back PASS (raiser-result.json); refusing to walk"); process.exit(1); }
if (exists("raiser-walk-result.json") && load("raiser-walk-result.json").create?.item) { console.error("walk already ran (raiser-walk-result.json)"); process.exit(1); }

const THOMAS = "UsEJUfjYLM8Y";
const QM = { activity: "Activity_1go37bt", step: "Open point – QM" };
const stamp = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const tag = `ZZT-B2R-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}`;
const out = { step: "B2-raiser-walk (V-19 b)", at: new Date().toISOString(), tag, plan: PLAN };
const ctx = (s) => (s._current_context || []).filter((x) => x._context_activity_instance_id).map((x) => ({ step: x._context_current_step, activity: x._context_activity_id, act: x._context_activity_instance_id, assigned: (x._context_assigned_to || []).map((a) => ({ kind: a.Kind, id: a._id, name: a.Name })) }));
const g = async (id) => { const r = await adminGet(OP, id); if (r.status !== 200 || typeof r.body !== "object") throw new Error(`admin GET ${id} → ${r.status}`); return r.body; };
const err = (r) => (r.status >= 300 ? `${r.body?.error_code || ""} ${r.body?.en_message || JSON.stringify(r.body).slice(0, 200)}`.trim() : undefined);
const onlyThomas = (list) => list.length > 0 && list.every((a) => a.kind === "User" && a.id === THOMAS);

try {
  // 0. the live definition must carry the field routing (one GET)
  const d = await getDraftStrict(OP);
  const r = (d[QM.activity]?.["Activity::Resource"] || []).map((x) => d[x]);
  out.definition = { metaVersion: d._meta_version, qmOwner: r.map((x) => `${x?.ValueType}:${x?.Value}`).join(","), fieldType: d.Raiser_Assignee?.Type ?? null };
  if (!(r.length === 1 && r[0].ValueType === "Field" && r[0].Value === "Raiser_Assignee" && d.Raiser_Assignee?.Type === "MultiUser")) throw new Error(`the live definition is not field-assigned (${out.definition.qmOwner}); nothing created`);

  // 1. create (all 16 Start Mandatory fields + Raiser_Assignee), fictional values only
  const body = {
    OP_Key: `${tag}-QM`, Round_No: 1, Case_Code: `${tag}-CASE`, Cycle_No: 1, Supplier_Code: "ZZT-SUP-B2R", Case_Item_Id: "ZZT-CASE-ITEM-B2R",
    OP_Kind: "Query", OP_Dept: "QM", Raised_By_Dept: "QM", OP_To_Supplier: "Yes", Raised_By_User: { _id: THOMAS }, Raised_By_Name: "ZZT Rita Raiser",
    Raiser_Assignee: [{ _id: THOMAS }],
    Ref_Kind: "Section", Ref_Label: "ZZT Section 1", Question_Text: `${tag} fictional question (QM)`, Supplier_Justification: "ZZT fictional justification",
    Responsible_User: { _id: THOMAS }, Responsible_Name: "ZZT Rita Raiser", Supplier_Due_Date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
    OP_Progress: "Open", Thread_JSON: JSON.stringify([{ kind: "raised", by: "ZZT Rita Raiser", at: stamp(), text: "ZZT fictional question" }]),
  };
  const c = await call("POST", `/process/2/${A}/${OP}?${Q}`, body);
  out.create = { status: c.status, err: err(c), item: c.body?._id, startAct: c.body?._activity_instance_id, metaVersion: c.body?._meta_version };
  save("raiser-walk-result.json", out);
  const item = c.body?._id;
  if (!item) throw new Error(`create refused: ${out.create.err}`);
  await sleep(800);
  let s = await g(item);
  out.atStart = { status: s._status, Raiser_Assignee: s.Raiser_Assignee ?? null, OP_Dept: s.OP_Dept ?? null };

  // 2. submit Start
  const s0 = await call("POST", `/process/2/${A}/${OP}/${item}/${c.body?._activity_instance_id}/submit?${Q}`, {});
  out.submitStart = { status: s0.status, err: err(s0) };
  save("raiser-walk-result.json", out);
  if (s0.status >= 300) throw new Error(`Start submit refused: ${out.submitStart.err} (item ${item} stays a Draft)`);

  // 3. the review step: field-assigned to User:Thomas, no role
  await sleep(1500);
  s = await g(item);
  const cx = ctx(s);
  out.atReview = {
    status: s._status, ctx: cx, current_assigned_to: (s._current_assigned_to || []).map((a) => `${a.Kind}:${a.Name}:${a._id}`),
    stepOk: cx.length === 1 && cx[0].step === QM.step && cx[0].activity === QM.activity,
    assignedToThomasOnly: cx.length === 1 && onlyThomas(cx[0].assigned) && onlyThomas((s._current_assigned_to || []).map((a) => ({ kind: a.Kind, id: a._id }))),
  };
  save("raiser-walk-result.json", out);

  // 4. complete it: admin PUT (outcome + close fields) → submit with the admin-GET activity instance id
  if (s._status === "InProgress" && cx[0]?.act) {
    const wr = { OP_Outcome: "Accepted", Closed_At: stamp(), Closed_By: { _id: THOMAS }, Outcome_Reason: "ZZT fictional close reason", Thread_JSON: JSON.stringify([{ kind: "raised" }, { kind: "accepted", by: "ZZT Rita Raiser", at: stamp() }]) };
    const p = await call("PUT", `/process/2/${A}/admin/${OP}/${item}?${Q}`, wr);
    await sleep(800);
    s = await g(item);
    out.adminPut = { status: p.status, err: err(p), readBack: { OP_Outcome: s.OP_Outcome ?? null, Closed_At: s.Closed_At ?? null, Closed_By: s.Closed_By?._id ?? null, Thread_JSON: s.Thread_JSON ? JSON.parse(s.Thread_JSON).length + " entries" : null } };
    const act = ctx(s)[0]?.act;
    const s1 = await call("POST", `/process/2/${A}/${OP}/${item}/${act}/submit?${Q}`, {});
    out.submitReview = { status: s1.status, err: err(s1), act };
    await sleep(1500);
    s = await g(item);
    out.end = { status: s._status, OP_Outcome: s.OP_Outcome ?? null, Open_Num: s.Open_Num ?? null };
  }
  out.pathText = ["Raise open point", `${out.atReview.ctx[0]?.step} [${(out.atReview.ctx[0]?.assigned || []).map((a) => `${a.kind}:${a.name}`).join("+")}]`, out.end?.status ?? "(not completed)"].join(" → ");
  out.pass = !!(out.atReview.stepOk && out.atReview.assignedToThomasOnly && out.adminPut?.status < 300 && out.submitReview?.status < 300 && out.end?.status === "Completed");
} catch (e) {
  out.stop = e.message;
  out.pass = false;
}
out.calls = calls;
save("raiser-walk-result.json", out);
console.log(JSON.stringify(out, null, 1));
process.exit(out.pass ? 0 : 1);
