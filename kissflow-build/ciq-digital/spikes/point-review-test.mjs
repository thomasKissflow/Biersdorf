// Spike Point PkEKIVviOqQs sits at "Spike review" (Role B; Thomas is a member). Submit it as Thomas through the key,
// then check that the switched-on test integration "point completed" writes a Log row with this item's id.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", P = "CIQ_ZZ_Spike_Point_A00", ITEM = "PkEKIVviOqQs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = async () => (await w.call("GET", `/process/2/${A}/admin/${P}/${ITEM}?${Q}`)).body || {};
const logs = async () => ((await w.call("POST", `/form/2/${A}/CIQ_ZZ_Spike_Log_A00/list?page_number=1&page_size=200&${Q}`, {})).body?.Data || []).filter((l) => l.Log_Item_Id === ITEM);
const out = {};
let p = await read();
const cur = (p._current_context || [])[0] || {};
out.before = { step: p._current_step, status: p._status, act: cur._context_activity_instance_id, to: (cur._context_assigned_to || []).map((a) => a.Name).join(","), logRowsForItem: (await logs()).length };
console.log("before", JSON.stringify(out.before));
if (p._current_step !== "Spike review") { console.log("not at Spike review; stop"); process.exit(1); }
const s = await w.call("POST", `/process/2/${A}/${P}/${ITEM}/${out.before.act}/submit?${Q}`, {});
out.submit = { status: s.status, err: s.body?.message ?? null };
console.log("submit", JSON.stringify(out.submit));
if (s.status < 300) {
  for (let i = 0; i < 20; i++) { p = await read(); const L = await logs(); if (L.length > out.before.logRowsForItem) { out.log = L.map((l) => ({ src: l.Log_Source, ev: l.Log_Event, item: l.Log_Item_Id, at: l.Log_At })); out.secondsToLog = (i + 1) * 3; break; } await sleep(3000); }
  out.after = { step: p._current_step, status: p._status };
}
console.log(JSON.stringify(out, null, 1));
writeFileSync(fileURLToPath(new URL("./point-review-result.json", import.meta.url)), JSON.stringify(out, null, 2));
