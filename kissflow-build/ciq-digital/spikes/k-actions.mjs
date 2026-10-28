// K-ACT: send back, reject and withdraw over REST on the approved test flow CIQ ZZ Spike Point (acting as Thomas, Role A + B).
// Route names follow the SDK's Process methods (sendbackItem needs stepId + comment; rejectItem needs comment; withdrawItem).
// Body-key spellings are probed in order; the first 2xx wins. Every attempt is logged.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", P = "CIQ_ZZ_Spike_Point_A00";
const WAITING = "Activity_1nm6syq";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = async (id) => (await w.call("GET", `/process/2/${A}/admin/${P}/${id}?${Q}`)).body || {};
const cur = (s) => (s._current_context || []).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id }));
const logRows = async (id) => ((await w.call("POST", `/form/2/${A}/CIQ_ZZ_Spike_Log_A00/list?page_number=1&page_size=200&${Q}`, {})).body?.Data || []).filter((l) => l.Log_Item_Id === id).map((l) => `${l.Log_Source}/${l.Log_Event}`);
const out = {};
async function tryRoutes(label, variants) {
  const attempts = [];
  for (const [path, body] of variants) {
    const r = await w.call("POST", path, body);
    attempts.push({ path: path.replace(/\?.*/, "").replace(`/process/2/${A}/${P}/`, "…/"), body: Object.keys(body).join(","), status: r.status, msg: r.body?.message ?? r.body?.success ?? null, code: r.body?.error_code ?? null });
    if (r.status < 300) break;
  }
  console.log(label, JSON.stringify(attempts));
  return attempts;
}
async function newPoint(toSupplier) {
  const c = await w.call("POST", `/process/2/${A}/${P}?${Q}`, { To_Supplier: toSupplier, Question_Text: `ZZT K-ACT ${toSupplier}`, Round_No: 1 });
  await w.call("POST", `/process/2/${A}/${P}/${c.body._id}/${c.body._activity_instance_id}/submit?${Q}`, {});
  await sleep(1500);
  return c.body._id;
}

// 1. Send back: PkEKIVxRRM9x (at Spike waiting) → submit → Spike review → send back to Spike waiting
const sb = "PkEKIVxRRM9x";
let s = await admin(sb);
out.sendback = { id: sb, start: cur(s) };
if (cur(s)[0]?.step === "Spike waiting") { await w.call("POST", `/process/2/${A}/${P}/${sb}/${cur(s)[0].act}/submit?${Q}`, {}); await sleep(1500); s = await admin(sb); }
const rv = cur(s).find((x) => x.step === "Spike review");
out.sendback.atReview = !!rv;
if (rv) {
  const base = `/process/2/${A}/${P}/${sb}/${rv.act}`;
  out.sendback.attempts = await tryRoutes("send back:", [
    [`${base}/sendback?${Q}`, { StepId: WAITING, Comment: "K-ACT send back test" }],
    [`${base}/sendback?${Q}`, { stepId: WAITING, comment: "K-ACT send back test" }],
    [`${base}/sendback?${Q}`, { _step_id: WAITING, _comment: "K-ACT send back test" }],
    [`${base}/send_back?${Q}`, { StepId: WAITING, Comment: "K-ACT send back test" }],
    [`${base}/sendBack?${Q}`, { StepId: WAITING, Comment: "K-ACT send back test" }],
  ]);
  await sleep(1500); s = await admin(sb);
  out.sendback.after = { status: s._status, ctx: cur(s) };
  console.log("after send back:", JSON.stringify(out.sendback.after));
  // round trip: submit waiting again → review again (proves the item re-enters the step after a send-back)
  const w2 = cur(s).find((x) => x.step === "Spike waiting");
  if (w2) { const r = await w.call("POST", `/process/2/${A}/${P}/${sb}/${w2.act}/submit?${Q}`, {}); await sleep(1500); s = await admin(sb); out.sendback.reEntry = { submit: r.status, ctx: cur(s) }; console.log("re-entry:", JSON.stringify(out.sendback.reEntry)); }
}

// 2. Reject at Spike review
const rj = await newPoint("No");
s = await admin(rj);
const rjAct = cur(s).find((x) => x.step === "Spike review")?.act;
const rbase = `/process/2/${A}/${P}/${rj}/${rjAct}`;
out.reject = { id: rj, attempts: await tryRoutes("reject:", [
  [`${rbase}/reject?${Q}`, { Comment: "K-ACT reject test" }],
  [`${rbase}/reject?${Q}`, { comment: "K-ACT reject test" }],
  [`${rbase}/reject?${Q}`, { _comment: "K-ACT reject test" }],
]) };
await sleep(8000); s = await admin(rj);
out.reject.after = { status: s._status, ctx: cur(s), logRows: await logRows(rj) };
console.log("after reject:", JSON.stringify(out.reject.after));

// 3. Withdraw (initiator) while at Spike review
const wd = await newPoint("No");
out.withdraw = { id: wd, attempts: await tryRoutes("withdraw:", [
  [`/process/2/${A}/${P}/${wd}/withdraw?${Q}`, { Comment: "K-ACT withdraw test" }],
  [`/process/2/${A}/${P}/${wd}/withdraw?${Q}`, { comment: "K-ACT withdraw test" }],
  [`/process/2/${A}/${P}/${wd}/${cur(await admin(wd))[0]?.act}/withdraw?${Q}`, { Comment: "K-ACT withdraw test" }],
]) };
await sleep(8000); s = await admin(wd);
out.withdraw.after = { status: s._status, ctx: cur(s), logRows: await logRows(wd) };
console.log("after withdraw:", JSON.stringify(out.withdraw.after));
// completion log row for the send-back point, after its re-entry (it is now at review again; submit to complete)
writeFileSync(fileURLToPath(new URL("./k-actions-result.json", import.meta.url)), JSON.stringify(out, null, 2));
