// Is Open_Lines a real SUM? Create (unlinked) registers with lines [2,3] and [0,4,4] and compare draft/submit/read values.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", REG = "CIQ_ZZ_Spike_Register_A00";
const rnd = () => Array.from({ length: 10 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
const out = [];
for (const vals of [[2, 3], [0, 4, 4]]) {
  const rows = vals.map((v, i) => ({ _id: `Spike_Lines_${rnd()}`, _index: i, _is_created: true, Line_Text: `v${v}`, Line_Open: v }));
  const d = await w.call("POST", `/form/2/${A}/${REG}?${Q}`, { Register_Key: `ZZT-sum-${vals.join("-")}`, "Table::Spike_Lines": rows });
  const s = d.status < 300 ? await w.call("POST", `/form/2/${A}/${REG}/${d.body._id}/submit?${Q}`, {}) : { status: -1, body: {} };
  const r = s.body?._id ? (await w.call("GET", `/form/2/${A}/${REG}/${s.body._id}?${Q}`)).body : {};
  const res = { vals, expectedSum: vals.reduce((a, b) => a + b, 0), draftOpen_Lines: d.body?.Open_Lines ?? null, submitOpen_Lines: s.body?.Open_Lines ?? null, readOpen_Lines: r?.Open_Lines ?? null, readLines: (r?.["Table::Spike_Lines"] || []).map((x) => x.Line_Open), id: s.body?._id };
  out.push(res); console.log(JSON.stringify(res));
}
writeFileSync(fileURLToPath(new URL("./aggregate-sum-check.json", import.meta.url)), JSON.stringify(out, null, 2));
