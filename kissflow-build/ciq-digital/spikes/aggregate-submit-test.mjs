// Does the embedded SUM (and the case's cross-flow SUM) compute when a Form item is SUBMITTED with child rows?
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", REG = "CIQ_ZZ_Spike_Register_A00", CASE = "CIQ_ZZ_Spike_Case_A00", CASE_ITEM = "PkEKIVlB5ZUn";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Array.from({ length: 10 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
const out = {};
const d = await w.call("POST", `/form/2/${A}/${REG}?${Q}`, { Register_Key: "ZZT-agg-R3", Register_Case: { _id: CASE_ITEM }, "Table::Spike_Lines": [{ _id: `Spike_Lines_${rnd()}`, _index: 0, _is_created: true, Line_Text: "blocking line", Line_Open: 1 }, { _id: `Spike_Lines_${rnd()}`, _index: 1, _is_created: true, Line_Text: "second", Line_Open: 2 }] });
out.draft = { status: d.status, id: d.body?._id, Open_Lines: d.body?.Open_Lines ?? null, err: d.status >= 300 ? d.body?.en_message : undefined };
console.log("draft", JSON.stringify(out.draft));
if (d.status < 300) {
  const s = await w.call("POST", `/form/2/${A}/${REG}/${d.body._id}/submit?${Q}`, {});
  out.submit = { status: s.status, id: s.body?._id, Open_Lines: s.body?.Open_Lines ?? null, lines: (s.body?.["Table::Spike_Lines"] || []).length, err: s.status >= 300 ? s.body?.en_message : undefined };
  console.log("submit", JSON.stringify(out.submit));
  await sleep(6000);
  const r = (await w.call("GET", `/form/2/${A}/${REG}/${s.body?._id}?${Q}`)).body || {};
  const c = (await w.call("GET", `/process/2/${A}/admin/${CASE}/${CASE_ITEM}?${Q}`)).body || {};
  out.read = { Open_Lines: r.Open_Lines ?? null, lines: (r["Table::Spike_Lines"] || []).map((x) => x.Line_Open), Case_Open_Count: c.Open_Count ?? null, Hold_Flag: c.Hold_Flag, Gate: c.Gate ?? null };
  console.log("read", JSON.stringify(out.read));
}
writeFileSync(fileURLToPath(new URL("./aggregate-submit-result.json", import.meta.url)), JSON.stringify(out, null, 2));
