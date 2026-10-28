// Spike: can a process with NO user step (Start → End) be published, does an item complete at once,
// and does the creator still see it (myitems)? Uses the throwaway ZZ_Spike_Assignee_A00.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer, mergeClean, preflight } from "../../lib/meta.mjs";
import { buildForm, addWorkflow } from "../../../tools/kissflow-app-agents-1.6.0/engine/builders.mjs";
const P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00";
const w = writer(fileURLToPath(new URL("./spike-requests.jsonl", import.meta.url)));
const A = w.acc, out = {};
const built = buildForm({ id: PROC, name: "ZZ Spike Assignee", flowType: "Process", fields: [{ name: "Probe Title", type: "Text", required: true }, { name: "Probe Note", type: "Textarea" }] }, P);
addWorkflow(built, [{ name: "Start" }, { name: "End" }], {});
const live = (await w.getDraft("process", PROC)).body;
const merged = mergeClean(live, built.blob, PROC);
const pf = preflight(PROC, merged);
const pd = await w.putDraft("process", PROC, merged);
const pub = pd.status < 300 ? await w.publish("process", PROC) : { status: -1, body: null };
out.publish = { preflight: pf.errors.map((e) => e.code), draft: pd.status, publish: pub.status, err: pub.status >= 300 ? pub.body : undefined };
console.log("publish", JSON.stringify(out.publish).slice(0, 300));
if (pub.status < 300) {
  const cr = await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, { Probe_Title: "no-step item", Probe_Note: "hello" });
  const sub = await w.call("POST", `/process/2/${A}/${PROC}/${cr.body?._id}/${cr.body?._activity_instance_id}/submit?_application_id=${P}`, {});
  const rd = await w.call("GET", `/process/2/${A}/admin/${PROC}/${cr.body?._id}?_application_id=${P}`);
  const mi = await w.call("GET", `/process/2/${A}/${PROC}/myitems?_response_type=full&_application_id=${P}`);
  const mine = (Array.isArray(mi.body) ? mi.body : mi.body?.Data || []).filter((x) => x._id === cr.body?._id);
  const own = await w.call("GET", `/process/2/${A}/${PROC}/${cr.body?._id}/${cr.body?._activity_instance_id}?_response_type=full&_application_id=${P}`);
  out.item = { create: cr.status, submit: sub.status, submitErr: sub.status >= 300 ? sub.body?.en_message : undefined, status: rd.body?._status, step: rd.body?._current_step, note: rd.body?.Probe_Note, inMyItems: mine.length, myItemsStatus: mine[0]?._status, ownGet: own.status };
  const del = await w.call("DELETE", `/process/2/${A}/admin/${PROC}/${cr.body?._id}?_application_id=${P}`);
  out.cleanup = del.status;
  console.log("item", JSON.stringify(out.item), "cleanup", del.status);
}
writeFileSync(new URL("./k-no-step-result.json", import.meta.url), JSON.stringify(out, null, 2));
