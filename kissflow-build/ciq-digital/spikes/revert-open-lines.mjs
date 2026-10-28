// Revert graft-open-lines (it turned the per-item SUM into a whole-form SUM): restore LHSModel = the parent form, then re-test.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./graft-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", REG = "CIQ_ZZ_Spike_Register_A00", AGG = "AggregateDefinition_xond6i";
const rnd = () => Array.from({ length: 10 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
const live = (await w.getDraft("form", REG)).body;
const out = { before: live[AGG]?.LHSModel };
if (live[AGG].LHSModel !== REG) {
  const pd = await w.putDraft("form", REG, { ...live, [AGG]: { ...live[AGG], LHSModel: REG } }); const pub = await w.publish("form", REG);
  out.revert = { put: pd.status, publish: pub.status, after: (await w.getDraft("form", REG)).body[AGG]?.LHSModel };
}
const tests = [];
for (const vals of [[2, 3], [0, 4, 4]]) {
  const rows = vals.map((v, i) => ({ _id: `Spike_Lines_${rnd()}`, _index: i, _is_created: true, Line_Text: `v${v}`, Line_Open: v }));
  const d = await w.call("POST", `/form/2/${A}/${REG}?${Q}`, { Register_Key: `ZZT-sumR-${vals.join("-")}`, "Table::Spike_Lines": rows });
  const s = await w.call("POST", `/form/2/${A}/${REG}/${d.body._id}/submit?${Q}`, {});
  const r = (await w.call("GET", `/form/2/${A}/${REG}/${s.body._id}?${Q}`)).body;
  // then change a line by REST update and re-read (does an update recompute?)
  const firstRow = (r["Table::Spike_Lines"] || [])[0]?._id;
  const u = await w.call("POST", `/form/2/${A}/${REG}/${s.body._id}?${Q}`, { _id: s.body._id, "Table::Spike_Lines": [{ _id: firstRow, Line_Open: 10 }] });
  const r2 = (await w.call("GET", `/form/2/${A}/${REG}/${s.body._id}?${Q}`)).body;
  tests.push({ vals, expected: vals.reduce((a, b) => a + b, 0), atCreate: r.Open_Lines ?? null, afterUpdateFirstTo10: r2.Open_Lines ?? null, expectedAfterUpdate: vals.reduce((a, b) => a + b, 0) - vals[0] + 10, updateStatus: u.status, id: s.body._id });
}
out.tests = tests;
writeFileSync(fileURLToPath(new URL("./revert-open-lines-result.json", import.meta.url)), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
