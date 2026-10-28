// Spike K-04/K-07 (act half): can the user who holds a step act on it over REST with the key?
// Item 1 is assigned via the FIELD (to the key's user); item 2 via the AppRole (key's user is a member).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00";
const w = writer(fileURLToPath(new URL("./spike-requests.jsonl", import.meta.url)));
const A = w.acc, results = [];
const actOf = async (item) => { const r = await w.call("GET", `/process/2/${A}/${PROC}/myitems?_response_type=full&_application_id=${P}`); return (Array.isArray(r.body) ? r.body : r.body?.Data || []).find((x) => x._id === item); };
for (const [label, item] of [["field-assigned", process.argv[2]], ["role-assigned", process.argv[3]]]) {
  const mi = await actOf(item);
  const act = mi?._activity_instance_id;
  const upd = await w.call("POST", `/process/2/${A}/${PROC}/${item}/${act}?_application_id=${P}`, { Probe_Note: `written at step 1 (${label})` });
  const sub = await w.call("POST", `/process/2/${A}/${PROC}/${item}/${act}/submit?_application_id=${P}`, {});
  const rd = await w.call("GET", `/process/2/${A}/admin/${PROC}/${item}?_application_id=${P}`);
  const r = { label, item, act, myitemsStep: mi?._current_step, update: upd.status, updateErr: upd.status >= 300 ? upd.body?.en_message : undefined, submit: sub.status, submitErr: sub.status >= 300 ? sub.body?.en_message : undefined, finalStep: rd.body?._current_step, finalStatus: rd.body?._status, note: rd.body?.Probe_Note };
  results.push(r); console.log(JSON.stringify(r));
}
writeFileSync(new URL("./k04e-result.json", import.meta.url), JSON.stringify(results, null, 2));
