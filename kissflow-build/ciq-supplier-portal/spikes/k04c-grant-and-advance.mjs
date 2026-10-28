// Spike K-04 (runtime, cont.): grant InitiateItems to the portal Admin role on the throwaway process,
// then submit Start and try to act on the field-assigned step 1 as the key's own user.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00", ADMIN_ROLE = "RoEK3_yhR4wx", ITEM = process.argv[2];
const w = writer(fileURLToPath(new URL("./spike-requests.jsonl", import.meta.url)));
const A = w.acc, out = { spike: "K-04 runtime (granted)", steps: [] };
const sys = (b) => b && typeof b === "object" ? Object.fromEntries(Object.entries(b).filter(([k]) => ["_current_step","_status","_current_assigned_to","_activity_instance_id","_progress"].includes(k) || k.startsWith("Probe"))) : { raw: b };
const rec = (step, r, pick) => { const v = pick ? pick(r.body) : r.body; out.steps.push({ step, status: r.status, v }); console.log(step, r.status, JSON.stringify(v).slice(0, 500)); return r; };

const actOf = async () => { const r = await w.call("GET", `/process/2/${A}/${PROC}/myitems?_response_type=full&_application_id=${P}`); const it = (Array.isArray(r.body) ? r.body : r.body?.Data || []).find((x) => x._id === ITEM); return it?._activity_instance_id; };
const a0 = rec("admin read", await w.call("GET", `/process/2/${A}/admin/${PROC}/${ITEM}?_application_id=${P}`), sys);
const act0 = await actOf(); console.log("act0", act0);
rec("submit start", await w.call("POST", `/process/2/${A}/${PROC}/${ITEM}/${act0}/submit?_application_id=${P}`, {}));
const a1 = rec("admin read after submit", await w.call("GET", `/process/2/${A}/admin/${PROC}/${ITEM}?_application_id=${P}`), sys);
const act1 = await actOf(); console.log("act1", act1);
if (act1 && act1 !== act0) {
  rec("assignee update at step 1", await w.call("POST", `/process/2/${A}/${PROC}/${ITEM}/${act1}?_application_id=${P}`, { Probe_Note: "written by the field assignee over REST" }));
  rec("submit step 1", await w.call("POST", `/process/2/${A}/${PROC}/${ITEM}/${act1}/submit?_application_id=${P}`, {}));
  rec("admin read after step-1 submit", await w.call("GET", `/process/2/${A}/admin/${PROC}/${ITEM}?_application_id=${P}`), sys);
}
writeFileSync(new URL("./k04c-result.json", import.meta.url), JSON.stringify(out, null, 2));
