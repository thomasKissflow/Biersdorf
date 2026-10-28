// Spike K-04 (shape search): which Resource shape makes a FIELD-driven assignee route at runtime?
// For each variant: patch the step's Resource in the throwaway process, publish, create an item, submit Start,
// read where it landed. Control = static AppRole (Admin).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00", ADMIN_ROLE = "RoEK3_yhR4wx", ME = "UsEJUfjYLM8Y";
const w = writer(fileURLToPath(new URL("./spike-requests.jsonl", import.meta.url)));
const A = w.acc, results = [];
const base = { Kind: "Resource" };
const VARIANTS = [
  ["control AppRole", { ValueType: "AppRole", DisplayValue: "Admin", Value: ADMIN_ROLE }],
  ["Field + ValueField", { ValueType: "Field", DisplayValue: "Probe Assignees", Value: "Probe_Assignees", ValueField: "Probe_Assignees" }],
  ["Field + Field attr", { ValueType: "Field", DisplayValue: "Probe Assignees", Value: "Probe_Assignees", Field: "Probe_Assignees" }],
  ["Field ValueField only", { ValueType: "Field", DisplayValue: "Probe Assignees", ValueField: "Probe_Assignees" }],
];
for (const [label, shape] of VARIANTS) {
  const d = (await w.getDraft("process", PROC)).body;
  const act = Object.values(d).find((e) => e?.Kind === "Activity" && e.Name === "Spike step");
  const rId = act["Activity::Resource"][0];
  d[rId] = { Id: rId, ...base, ...shape, Activity: act.Id };
  const pd = await w.putDraft("process", PROC, d);
  const pub = await w.publish("process", PROC);
  const cr = await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, { Probe_Title: `probe ${label}`, Probe_Assignees: { _id: ME } });
  const item = cr.body?._id, act0 = cr.body?._activity_instance_id;
  const sub = item ? await w.call("POST", `/process/2/${A}/${PROC}/${item}/${act0}/submit?_application_id=${P}`, {}) : { status: -1 };
  const rd = item ? await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`) : { body: {} };
  const r = { label, draft: pd.status, publish: pub.status, item, submit: sub.status, submitErr: sub.status >= 300 ? sub.body?.en_message : undefined, step: rd.body?._current_step, status: rd.body?._status, assigned: rd.body?._current_assigned_to };
  results.push(r); console.log(JSON.stringify(r));
}
writeFileSync(new URL("./k04d-result.json", import.meta.url), JSON.stringify(results, null, 2));
