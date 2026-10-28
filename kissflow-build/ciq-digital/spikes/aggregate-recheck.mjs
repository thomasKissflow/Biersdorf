// After the Open_Lines graft: touch the child row, then read Register.Open_Lines and Case.Open_Count/Hold_Flag/Gate.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", REG = "CIQ_ZZ_Spike_Register_A00", CASE = "CIQ_ZZ_Spike_Case_A00";
const ITEM = "PkEKIWtnoX7B", ROW = "Spike_Lines_rE1HuoAdps", CASE_ITEM = "PkEKIVlB5ZUn";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { steps: [] };
const snap = async (label) => { const r = (await w.call("GET", `/form/2/${A}/${REG}/${ITEM}?${Q}`)).body || {}; const c = (await w.call("GET", `/process/2/${A}/admin/${CASE}/${CASE_ITEM}?${Q}`)).body || {}; const s = { label, Open_Lines: r.Open_Lines ?? null, lines: (r["Table::Spike_Lines"] || []).map((x) => x.Line_Open), Case_Open_Count: c.Open_Count ?? null, Hold_Flag: c.Hold_Flag, Gate: c.Gate ?? null }; out.steps.push(s); console.log(JSON.stringify(s)); };
await snap("after graft, before touch");
const t1 = await w.call("POST", `/form/2/${A}/${REG}/${ITEM}?${Q}`, { _id: ITEM, "Table::Spike_Lines": [{ _id: ROW, Line_Open: 1 }] });
console.log("touch write →", t1.status, JSON.stringify(t1.body).slice(0, 300));
await sleep(5000); await snap("after touch Line_Open=1");
const t2 = await w.call("POST", `/form/2/${A}/${REG}/${ITEM}?${Q}`, { _id: ITEM, Register_Key: "ZZT-114155b-R2" });
console.log("header write →", t2.status, JSON.stringify(t2.body).slice(0, 300));
await sleep(5000); await snap("after header save");
writeFileSync(fileURLToPath(new URL("./aggregate-recheck-result.json", import.meta.url)), JSON.stringify(out, null, 2));
