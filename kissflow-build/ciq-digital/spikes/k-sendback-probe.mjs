// K-ACT send-back body probe on Point PkEKIVxRRM9x (at Spike review). Failed attempts change nothing (500/400). Stops at first 2xx.
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", P = "CIQ_ZZ_Spike_Point_A00", ID = "PkEKIVxRRM9x";
const WAIT = "Activity_1nm6syq", START = "Activity_1wjqod", c = "K-ACT send back test";
const s = (await w.call("GET", `/process/2/${A}/admin/${P}/${ID}?${Q}`)).body;
const act = s._current_context?.[0]?._context_activity_instance_id;
console.log("at:", s._current_context?.[0]?._context_current_step, act);
const variants = [
  { SendBackTo: WAIT, Comment: c }, { _send_back_to: WAIT, Note: c }, { step_id: WAIT, comment: c }, { StepId: WAIT, Note: c },
  { Step: WAIT, Comment: c }, { ActivityId: WAIT, Comment: c }, { TargetActivityId: WAIT, Comment: c }, { Activity: WAIT, Comment: c },
  { StepId: "Spike waiting", Comment: c }, { StepId: START, Comment: c }, { StepId: "SendBackToInitiator", Comment: c },
  { Comment: c }, {},
];
for (const b of variants) {
  const r = await w.call("POST", `/process/2/${A}/${P}/${ID}/${act}/sendback?${Q}`, b);
  console.log(r.status, JSON.stringify(b), (r.body?.message || r.body?.success || "").slice(0, 120), r.body?.error_code || "");
  if (r.status < 300) break;
}
const a = (await w.call("GET", `/process/2/${A}/admin/${P}/${ID}?${Q}`)).body;
console.log("now:", a._status, a._current_context?.map((x) => x._context_current_step).join(","));
