// K-SB: switch on send-back at "Spike review" of the approved TEST flow CIQ ZZ Spike Point, then test a send-back over REST.
// Graft: IsSendbackEnabled=true on the step's model-level permission (Column "Model"). The original draft is saved first
// (meta-CIQ_ZZ_Spike_Point_A00.before-sb.json) so `node k-sendback-graft.mjs --revert` can restore it.
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./graft-requests.jsonl", import.meta.url)));
const rt = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", P = "CIQ_ZZ_Spike_Point_A00";
const REVIEW = "Activity_2yluch", WAIT = "Activity_1nm6syq";
const BEFORE = fileURLToPath(new URL("./meta-CIQ_ZZ_Spike_Point_A00.before-sb.json", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv.includes("--revert")) {
  const orig = JSON.parse(readFileSync(BEFORE, "utf8"));
  const p = await w.putDraft("process", P, orig); const q = await w.publish("process", P);
  console.log("revert: put", p.status, "publish", q.status); process.exit(0);
}

const d = (await w.getDraft("process", P)).body;
if (!existsSync(BEFORE)) writeFileSync(BEFORE, JSON.stringify(d, null, 1));
const act = d[REVIEW];
const modelPerm = (act["Activity::Permission"] || []).map((id) => d[id]).find((p) => d[p.Column]?.Type === "Model");
if (!modelPerm) { console.log("no model-level permission on the review step"); process.exit(1); }
console.log("model permission:", JSON.stringify(modelPerm));
modelPerm.IsSendbackEnabled = true;
const put = await w.putDraft("process", P, d);
console.log("put draft:", put.status, put.status >= 300 ? JSON.stringify(put.body).slice(0, 300) : "");
if (put.status >= 300) process.exit(1);
const pub = await w.publish("process", P);
console.log("publish:", pub.status, pub.status >= 300 ? JSON.stringify(pub.body).slice(0, 300) : "");
if (pub.status >= 300) process.exit(1);
const back = (await w.getDraft("process", P)).body;
console.log("read back IsSendbackEnabled:", back[modelPerm.Id]?.IsSendbackEnabled, "| PublishedAt:", back.PublishedAt);

// runtime: new Point To_Supplier=Yes → Start → Spike waiting → submit → Spike review → send back to Spike waiting
const admin = async (id) => (await rt.call("GET", `/process/2/${A}/admin/${P}/${id}?${Q}`)).body || {};
const cur = (s) => (s._current_context || []).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id }));
const c = await rt.call("POST", `/process/2/${A}/${P}?${Q}`, { To_Supplier: "Yes", Question_Text: "ZZT K-SB send back", Round_No: 1 });
const id = c.body._id;
await rt.call("POST", `/process/2/${A}/${P}/${id}/${c.body._activity_instance_id}/submit?${Q}`, {}); await sleep(1500);
let s = await admin(id);
await rt.call("POST", `/process/2/${A}/${P}/${id}/${cur(s)[0].act}/submit?${Q}`, {}); await sleep(1500);
s = await admin(id);
console.log("point", id, "at:", JSON.stringify(cur(s)));
const rv = cur(s).find((x) => x.step === "Spike review");
const variants = [{ StepId: WAIT, Comment: "K-SB" }, { stepId: WAIT, comment: "K-SB" }, { Comment: "K-SB" }, { StepId: "SendBackToInitiator", Comment: "K-SB" }];
for (const b of variants) {
  const r = await rt.call("POST", `/process/2/${A}/${P}/${id}/${rv.act}/sendback?${Q}`, b);
  console.log("sendback", JSON.stringify(b), "→", r.status, (r.body?.message || r.body?.success || "").slice(0, 100));
  if (r.status < 300) break;
}
await sleep(1500); s = await admin(id);
console.log("after:", s._status, JSON.stringify(cur(s)));
writeFileSync(fileURLToPath(new URL("./k-sendback-graft-result.json", import.meta.url)), JSON.stringify({ point: id, after: { status: s._status, ctx: cur(s) } }, null, 2));
