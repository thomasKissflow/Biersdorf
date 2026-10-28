// Read-only in effect: did Thomas's runtime clicks happen? Reads the spike case/points and the Log.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00";
const get = async (proc, id) => (await w.call("GET", `/process/2/${A}/admin/${proc}/${id}?${Q}`)).body || {};
const out = {};
const c = await get("CIQ_ZZ_Spike_Case_A00", "PkEKIVlB5ZUn");
out.case = { step: c._current_step, status: c._status, lanes: ["A", "B", "C", "D", "E", "F"].map((x) => `${x}:${c[`Lane_${x}_Confirm`] ?? "-"}`).join(" "), Open_Count: c.Open_Count ?? null, Gate: c.Gate ?? null };
for (const id of ["PkEKIVviOqQs", "PkEKIVxRRM9x"]) { const p = await get("CIQ_ZZ_Spike_Point_A00", id); out[id] = { step: p._current_step, status: p._status }; }
const L = (await w.call("POST", `/form/2/${A}/CIQ_ZZ_Spike_Log_A00/list?page_number=1&page_size=200&${Q}`, {})).body?.Data || [];
out.logRows = L.map((l) => `${l.Log_Source}/${l.Log_Event}/${l.Log_Item_Id}`);
const reg = (await w.call("GET", `/form/2/${A}/CIQ_ZZ_Spike_Register_A00/PkEKIWtnoX7B?${Q}`)).body || {};
out.register = { Open_Lines: reg.Open_Lines ?? null, lines: (reg["Table::Spike_Lines"] || []).map((x) => x.Line_Open), modified: reg._modified_at };
writeFileSync(fileURLToPath(new URL("./spike-state-check.json", import.meta.url)), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
