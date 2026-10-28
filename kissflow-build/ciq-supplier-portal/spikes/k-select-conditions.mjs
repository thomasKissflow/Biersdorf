// Spike: do step conditions route on a SELECT field (list-backed), and what does a non-matching value do?
// Throwaway ZZ_Spike_Assignee_A00: Start → "Spike yes" (Probe_Code = "Yes") → "Spike no" (Probe_Code = "No") → End.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer, mergeClean, preflight } from "../../lib/meta.mjs";
import { buildForm, addWorkflow } from "../../../tools/kissflow-app-agents-1.6.0/engine/builders.mjs";
const P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00", ADMIN_ROLE = "RoEK3_yhR4wx", LIST = "CIQP_Yes_No_A00";
const w = writer(fileURLToPath(new URL("./spike-requests.jsonl", import.meta.url)));
const A = w.acc, out = [];
const built = buildForm({ id: PROC, name: "ZZ Spike Assignee", flowType: "Process", fields: [
  { name: "Probe Title", type: "Text", required: true }, { name: "Probe Code", type: "Select", referredList: LIST }, { name: "Probe Mand", type: "Text" },
] }, P);
addWorkflow(built, [{ name: "Start" }, { name: "Spike yes", actor: "Admin", condition: 'Probe_Code = "Yes"' }, { name: "Spike no", actor: "Admin", condition: 'Probe_Code = "No"' }, { name: "End" }], { Admin: ADMIN_ROLE });
const live = (await w.getDraft("process", PROC)).body;
const merged = mergeClean(live, built.blob, PROC);
const pf = preflight(PROC, merged);
const pd = await w.putDraft("process", PROC, merged);
const pub = pd.status < 300 ? await w.publish("process", PROC) : { status: -1 };
console.log("publish", pd.status, pub.status, "preflight", pf.errors.map((e) => e.code));
for (const [label, val] of [["Yes", "Yes"], ["No", "No"], ["lowercase yes", "yes"], ["blank", undefined]]) {
  const body = { Probe_Title: `select ${label}` }; if (val !== undefined) body.Probe_Code = val;
  const cr = await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, body);
  const sub = cr.body?._id ? await w.call("POST", `/process/2/${A}/${PROC}/${cr.body._id}/${cr.body._activity_instance_id}/submit?_application_id=${P}`, {}) : { status: -1, body: cr.body };
  const rd = cr.body?._id ? (await w.call("GET", `/process/2/${A}/admin/${PROC}/${cr.body._id}?_application_id=${P}`)).body : {};
  const del = cr.body?._id ? await w.call("DELETE", `/process/2/${A}/admin/${PROC}/${cr.body._id}?_application_id=${P}`) : { status: -1 };
  const r = { label, sent: val, create: cr.status, createErr: cr.status >= 300 ? cr.body?.en_message : undefined, stored: rd.Probe_Code, submit: sub.status, submitErr: sub.status >= 300 ? sub.body?.en_message : undefined, step: rd._current_step, status: rd._status, cleanup: del.status };
  out.push(r); console.log(JSON.stringify(r));
}
writeFileSync(new URL("./k-select-result.json", import.meta.url), JSON.stringify(out, null, 2));
