// Last send-back route probe on Point PkEKOEvnYp7X (at Spike review, send-back now enabled). Read-only GETs + POST variants.
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", P = "CIQ_ZZ_Spike_Point_A00", ID = "PkEKOEvnYp7X", ACT = "PkEKOEz6f4IK", WAIT = "Activity_1nm6syq";
const tries = [
  ["GET", `/process/2/${A}/${P}/${ID}/${ACT}/sendback?${Q}`],
  ["GET", `/process/2/${A}/${P}/${ID}/${ACT}/sendback/steps?${Q}`],
  ["GET", `/process/2/${A}/${P}/${ID}/sendback/steps?${Q}`],
  ["POST", `/process/2/${A}/${P}/${ID}/${ACT}/sendback/${WAIT}?${Q}`, { Comment: "K-SB" }],
  ["POST", `/process/2/${A}/${P}/${ID}/${ACT}/sendback?${Q}`, { SendBackTo: { _id: WAIT }, Comment: "K-SB" }],
  ["POST", `/process/2/${A}/${P}/${ID}/${ACT}/sendback?${Q}`, { _send_back_activity_id: WAIT, Comment: "K-SB" }],
  ["POST", `/process/2/${A}/${P}/${ID}/${ACT}/sendback?${Q}`, { ActivityId: WAIT, Note: "K-SB", Comment: "K-SB", StepId: WAIT, stepId: WAIT, comment: "K-SB" }],
];
for (const [m, p, b] of tries) {
  const r = await w.call(m, p, b);
  console.log(m, p.replace(/\?.*/, "").replace(`/process/2/${A}/${P}/`, "…/"), b ? JSON.stringify(b) : "", "→", r.status, JSON.stringify(r.body).slice(0, 200));
  if (m === "POST" && r.status < 300) break;
}
