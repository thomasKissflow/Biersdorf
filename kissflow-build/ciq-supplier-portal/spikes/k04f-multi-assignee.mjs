// Spike K-04 (multi-contact): can a step be held by ANY of several contacts?
//  M1: one "MultiUser" field as the Field resource.   M2: two single User fields, two Field resources on one step.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer, mergeStarter, preflight } from "../../lib/meta.mjs";
import { buildForm, addWorkflow } from "../../../tools/kissflow-app-agents-1.6.0/engine/builders.mjs";
const P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00", ADMIN_ROLE = "RoEK3_yhR4wx", ME = "UsEJUfjYLM8Y";
const w = writer(fileURLToPath(new URL("./spike-requests.jsonl", import.meta.url)));
const A = w.acc, results = [];
const fieldRes = (rId, actId, fid, label) => ({ Id: rId, Kind: "Resource", ValueType: "Field", DisplayValue: label, Value: fid, Field: fid, Activity: actId });

async function variant(label, multiType, resourceFields, payload) {
  const built = buildForm({ id: PROC, name: "ZZ Spike Assignee", flowType: "Process", fields: [
    { name: "Probe Title", type: "Text", required: true }, { name: "Probe Assignees", type: "User" }, { name: "Probe Note", type: "Textarea" },
    ...(multiType ? [{ name: "Probe Multi", type: multiType }] : []),
    { name: "Probe A1", type: "User" }, { name: "Probe A2", type: "User" },
  ] }, P);
  addWorkflow(built, [{ name: "Start" }, { name: "Spike step", actor: "Admin" }, { name: "End" }], { Admin: ADMIN_ROLE });
  const b = built.blob, act = Object.values(b).find((e) => e?.Kind === "Activity" && e.Name === "Spike step");
  const first = act["Activity::Resource"][0];
  delete b[first];
  act["Activity::Resource"] = resourceFields.map((f, i) => { const rId = `${first}_${i}`; b[rId] = fieldRes(rId, act.Id, f, f); return rId; });
  const starter = (await w.getDraft("process", PROC)).body;
  const merged = mergeStarter(starter, b, PROC);
  const pf = preflight(PROC, merged);
  const pd = await w.putDraft("process", PROC, merged);
  const pub = pd.status < 300 ? await w.publish("process", PROC) : { status: -1 };
  let r = { label, preflight: pf.errors.map((e) => e.code), draft: pd.status, publish: pub.status };
  if (pub.status < 300) {
    const cr = await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, { Probe_Title: `probe ${label}`, ...payload });
    const sub = await w.call("POST", `/process/2/${A}/${PROC}/${cr.body?._id}/${cr.body?._activity_instance_id}/submit?_application_id=${P}`, {});
    const rd = await w.call("GET", `/process/2/${A}/admin/${PROC}/${cr.body?._id}?_application_id=${P}`);
    r = { ...r, item: cr.body?._id, create: cr.status, submit: sub.status, submitErr: sub.status >= 300 ? sub.body?.en_message : undefined, step: rd.body?._current_step, assigned: rd.body?._current_assigned_to, stored: { Probe_Multi: rd.body?.Probe_Multi, Probe_A1: rd.body?.Probe_A1, Probe_A2: rd.body?.Probe_A2 } };
  }
  results.push(r); console.log(JSON.stringify(r));
  return r;
}
await variant("M1 MultiUser field", "MultiUser", ["Probe_Multi"], { Probe_Multi: [{ _id: ME }] });
await variant("M2 two User fields, A1 empty, A2 = me", null, ["Probe_A1", "Probe_A2"], { Probe_A2: { _id: ME } });
await variant("M3 two User fields, both empty", null, ["Probe_A1", "Probe_A2"], {});
writeFileSync(new URL("./k04f-result.json", import.meta.url), JSON.stringify(results, null, 2));
