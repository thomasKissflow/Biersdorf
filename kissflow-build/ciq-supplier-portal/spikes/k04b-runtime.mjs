// Spike K-04 (runtime half): does an item route to the user held in the assignee field, and can that user
// (here: the API key's own user) act on the step over REST? Uses the throwaway ZZ_Spike_Assignee_A00 process.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";

const P = "CIQ_Supplier_Portal_A00";
const PROC = "ZZ_Spike_Assignee_A00";
const ME = "UsEJUfjYLM8Y";
const w = writer(fileURLToPath(new URL("./spike-requests.jsonl", import.meta.url)));
const A = w.acc;
const out = { spike: "K-04 runtime", steps: [] };
const rec = (step, r, pick) => { const e = { step, status: r.status, ...(pick ? pick(r.body) : { body: r.body }) }; out.steps.push(e); console.log(step, r.status, JSON.stringify(pick ? pick(r.body) : r.body).slice(0, 400)); return r; };
const sys = (b) => b && typeof b === "object" ? Object.fromEntries(Object.entries(b).filter(([k]) => k.startsWith("_") || k.startsWith("Probe"))) : { raw: b };

const cr = rec("create item", await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, { Probe_Title: "probe-runtime-1", Probe_Assignees: { _id: ME } }));
const item = cr.body?._id, act0 = cr.body?._activity_instance_id;
if (!item) { writeFileSync(new URL("./k04b-result.json", import.meta.url), JSON.stringify(out, null, 2)); process.exit(1); }

rec("admin read after create", await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`), sys);
rec("submit start", await w.call("POST", `/process/2/${A}/${PROC}/${item}/${act0}/submit?_application_id=${P}`, {}));
const a1 = rec("admin read after submit", await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`), sys);
rec("myitems", await w.call("GET", `/process/2/${A}/${PROC}/myitems?_response_type=full&_application_id=${P}`), (b) => ({ count: (Array.isArray(b) ? b : b?.Data || []).length, mine: (Array.isArray(b) ? b : b?.Data || []).filter((x) => x._id === item).map(sys) }));
rec("mytasks", await w.call("GET", `/process/2/${A}/${PROC}/mytasks?_application_id=${P}`), (b) => ({ sample: JSON.stringify(b).slice(0, 600) }));

const act1 = a1.body?._activity_instance_id;
if (act1 && act1 !== act0) {
  rec("assignee update at step 1 (key user = field assignee)", await w.call("POST", `/process/2/${A}/${PROC}/${item}/${act1}?_application_id=${P}`, { Probe_Note: "written by the field assignee over REST" }));
  rec("submit step 1 (key user = field assignee)", await w.call("POST", `/process/2/${A}/${PROC}/${item}/${act1}/submit?_application_id=${P}`, {}));
  rec("admin read after step-1 submit", await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`), sys);
}
out.item = item;
writeFileSync(new URL("./k04b-result.json", import.meta.url), JSON.stringify(out, null, 2));
