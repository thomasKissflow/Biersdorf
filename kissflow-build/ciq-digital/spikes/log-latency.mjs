// Read-only in effect (the form list endpoint is a POST): integration latency = Log row created_at − Register created_at.
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const Q = "_application_id=CIQ_Digital_A00";
const list = async (f) => (await w.call("POST", `/form/2/${w.acc}/${f}/list?page_number=1&page_size=200&${Q}`, {})).body?.Data || [];
const L = await list("CIQ_ZZ_Spike_Log_A00"), R = await list("CIQ_ZZ_Spike_Register_A00");
const rows = L.map((l) => { const r = R.find((x) => x._id === l.Log_Item_Id); return { log: l.Log_Key, src: l.Log_Source, ev: l.Log_Event, logCreated: l._created_at, by: l._created_by?.Name, registerCreated: r?._created_at, latencySeconds: r ? (Date.parse(l._created_at) - Date.parse(r._created_at)) / 1000 : null }; });
writeFileSync(new URL("./log-latency.json", import.meta.url), JSON.stringify({ rows, registers: R.map((r) => ({ key: r.Register_Key, id: r._id, case: r.Register_Case?._id || null })) }, null, 2));
console.log(JSON.stringify(rows, null, 1)); console.log("registers:", R.map((r) => `${r.Register_Key}:${r._id}`).join(" | "));
