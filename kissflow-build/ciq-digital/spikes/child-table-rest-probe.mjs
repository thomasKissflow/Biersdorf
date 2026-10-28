// Probe: can REST write child-table rows on a Form under any key/route shape? (writes only to a ZZ test Register row)
import { readFileSync, writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", REG = "CIQ_ZZ_Spike_Register_A00";
const r2 = JSON.parse(readFileSync(new URL("./runtime-tests-2-result.json", import.meta.url), "utf8"));
const item = r2.tests.find((t) => t.id.startsWith("T3a' linked"))?.detail?.id;
const row = [{ Line_Text: "blocking line", Line_Open: 1 }];
const tries = [
  ["POST", `/form/2/${A}/${REG}/${item}?${Q}`, { "Spike Lines": row }],
  ["POST", `/form/2/${A}/${REG}/${item}?${Q}`, { CIQ_ZZ_Spike_Register_A00_Spike_Lines: row }],
  ["POST", `/form/2/${A}/${REG}/${item}/Spike_Lines?${Q}`, row[0]],
  ["POST", `/form/2/${A}/${REG}/${item}/Spike_Lines/batch?${Q}`, row],
  ["PUT", `/form/2/${A}/${REG}/${item}?${Q}`, { Spike_Lines: row }],
];
const out = [];
for (const [m, p, b] of tries) { const r = await w.call(m, p, b); out.push({ m, route: p.replace(A, "{acc}").replace(item, "{item}"), status: r.status, msg: r.body?.en_message || JSON.stringify(r.body).slice(0, 160) }); }
const back = ((await w.call("POST", `/form/2/${A}/${REG}/list?page_number=1&page_size=200&${Q}`, {})).body?.Data || []).find((x) => x._id === item) || {};
const res = { item, tries: out, after: { Spike_Lines: back.Spike_Lines ?? null, Open_Lines: back.Open_Lines ?? null } };
writeFileSync(new URL("./child-table-rest-probe.json", import.meta.url), JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 1));
