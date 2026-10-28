// Child-table CRUD over REST with the front-end shape Thomas captured (2026-10-07):
//   add    {"_id":item,"Table::<Model>":[{"_id":"<Model>_<rand>","_index":n,"_is_created":true, ...fields}]}
//   modify {"_id":item,"Table::<Model>":[{"_id":rowId, ...fields}]}
//   delete {"_id":item,"Table::<Model>":[{"_id":rowId,"_is_deleted":true}]}
// Form: POST /form/2/{acc}/{form}/{item}   Process: POST /process/2/{acc}/{proc}/{item}/{act}   (writes only ZZ test items)
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00";
const REG = "CIQ_ZZ_Spike_Register_A00", CASE = "CIQ_ZZ_Spike_Case_A00", POINT = "CIQ_ZZ_Spike_Point_A00";
const REG_ITEM = "PkEKIWtnoX7B", CASE_ITEM = "PkEKIVlB5ZUn"; // ZZT-114155b-R2 is linked to this case
const R = { at: new Date().toISOString(), tests: [] };
const T = (id, ok, d) => { R.tests.push({ id, ok, detail: d }); console.log(ok === true ? "PASS" : ok === false ? "FAIL" : "INFO", id, JSON.stringify(d)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Array.from({ length: 10 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
const tableOf = (b, model) => b?.[`Table::${model}`] ?? b?.[model] ?? null;
const readReg = async () => (await w.call("GET", `/form/2/${A}/${REG}/${REG_ITEM}?${Q}`)).body || {};
const readCase = async () => (await w.call("GET", `/process/2/${A}/admin/${CASE}/${CASE_ITEM}?${Q}`)).body || {};
const regWrite = (rows) => w.call("POST", `/form/2/${A}/${REG}/${REG_ITEM}?${Q}`, { _id: REG_ITEM, "Table::Spike_Lines": rows });

// ── FORM: add (with values) ───────────────────────────────────────────────────────────────────────────────
const before = await readReg();
T("F0 read before", true, { Open_Lines: before.Open_Lines ?? null, rows: (tableOf(before, "Spike_Lines") || []).length, readKeys: Object.keys(before).filter((k) => /Spike|Table::/.test(k)) });
const row1 = `Spike_Lines_${rnd()}`;
const a = await regWrite([{ _id: row1, _index: 0, _is_created: true, Line_Text: "blocking line", Line_Open: 1 }]);
const afterAdd = await readReg(); const rowsA = tableOf(afterAdd, "Spike_Lines") || [];
T("F1 add row with values (Form)", a.status < 300 && rowsA.some((r) => r._id === row1 && r.Line_Open === 1), { status: a.status, err: a.status >= 300 ? a.body?.en_message : undefined, rows: rowsA.map((r) => ({ _id: r._id, Line_Text: r.Line_Text, Line_Open: r.Line_Open })), Open_Lines: afterAdd.Open_Lines });
T("F1b embedded SUM Open_Lines = 1", afterAdd.Open_Lines === 1, { Open_Lines: afterAdd.Open_Lines });
await sleep(6000);
let c1 = await readCase();
T("F1c K-20F cross-flow SUM: Case.Open_Count = 1, Hold_Flag Yes, Gate blank", c1.Open_Count === 1 && c1.Hold_Flag === "Yes" && !c1.Gate, { Open_Count: c1.Open_Count ?? null, Hold_Flag: c1.Hold_Flag, Gate: c1.Gate ?? null });

// ── FORM: modify ──────────────────────────────────────────────────────────────────────────────────────────
const m = await regWrite([{ _id: row1, Line_Open: 0 }]);
const afterMod = await readReg(); const rowsM = tableOf(afterMod, "Spike_Lines") || [];
T("F2 modify row (Form)", m.status < 300 && rowsM.some((r) => r._id === row1 && r.Line_Open === 0), { status: m.status, err: m.status >= 300 ? m.body?.en_message : undefined, row: rowsM.find((r) => r._id === row1), Open_Lines: afterMod.Open_Lines });
await sleep(6000);
let c2 = await readCase();
T("F2c Case.Open_Count recalculates to 0, Gate OK", c2.Open_Count === 0 && c2.Gate === "OK", { Open_Count: c2.Open_Count ?? null, Hold_Flag: c2.Hold_Flag, Gate: c2.Gate ?? null });

// ── FORM: add a 2nd row, then delete it ─────────────────────────────────────────────────────────────────
const row2 = `Spike_Lines_${rnd()}`;
const a2 = await regWrite([{ _id: row2, _index: 1, _is_created: true, Line_Text: "temp line", Line_Open: 5 }]);
const mid = await readReg();
const d = await regWrite([{ _id: row2, _is_deleted: true }]);
const afterDel = await readReg(); const rowsD = tableOf(afterDel, "Spike_Lines") || [];
T("F3 add 2nd row then delete it (Form)", a2.status < 300 && d.status < 300 && !rowsD.some((r) => r._id === row2) && rowsD.some((r) => r._id === row1), { add: a2.status, rowsAfterAdd: (tableOf(mid, "Spike_Lines") || []).length, OpenLinesAfterAdd: mid.Open_Lines, delete: d.status, err: d.status >= 300 ? d.body?.en_message : undefined, rowsAfterDelete: rowsD.map((r) => r._id), Open_Lines: afterDel.Open_Lines });

// leave one blocking line for Thomas's gate click (Line_Open = 1)
const back1 = await regWrite([{ _id: row1, Line_Open: 1 }]);
await sleep(6000); const c3 = await readCase();
T("F4 restore blocking line for the gate click", back1.status < 300, { Open_Count: c3.Open_Count ?? null, Gate: c3.Gate ?? null });

// ── PROCESS child table at Start (key can act at Start only); throwaway draft, deleted afterwards ─────────
const p = await w.call("POST", `/process/2/${A}/${POINT}?${Q}`, { Round_No: 1, Question_Text: "ZZT child-table process test", To_Supplier: "No" });
const pid = p.body?._id, pact = p.body?._activity_instance_id;
const rr = `Spike_Rounds_${rnd()}`;
const pw = await w.call("POST", `/process/2/${A}/${POINT}/${pid}/${pact}?${Q}`, { _id: pid, "Table::Spike_Rounds": [{ _id: rr, _index: 0, _is_created: true, Spike_Rounds_Round_No: 1, Question: "q1", Response: "r1", Outcome: "Returned" }] });
const pread = (await w.call("GET", `/process/2/${A}/${POINT}/${pid}/${pact}?_response_type=full&${Q}`)).body || {};
const prow = (tableOf(pread, "Spike_Rounds") || []);
T("P1 add row on a PROCESS child table at Start", pw.status < 300 && prow.some((r) => r._id === rr), { status: pw.status, err: pw.status >= 300 ? pw.body?.en_message : undefined, rows: prow.map((r) => ({ _id: r._id, Question: r.Question, Outcome: r.Outcome })) });
const pm = await w.call("POST", `/process/2/${A}/${POINT}/${pid}/${pact}?${Q}`, { _id: pid, "Table::Spike_Rounds": [{ _id: rr, Outcome: "Accepted" }] });
const pread2 = (await w.call("GET", `/process/2/${A}/${POINT}/${pid}/${pact}?_response_type=full&${Q}`)).body || {};
T("P2 modify process child row", pm.status < 300 && (tableOf(pread2, "Spike_Rounds") || []).some((r) => r._id === rr && r.Outcome === "Accepted"), { status: pm.status, err: pm.status >= 300 ? pm.body?.en_message : undefined });
const pdl = await w.call("POST", `/process/2/${A}/${POINT}/${pid}/${pact}?${Q}`, { _id: pid, "Table::Spike_Rounds": [{ _id: rr, _is_deleted: true }] });
const pread3 = (await w.call("GET", `/process/2/${A}/${POINT}/${pid}/${pact}?_response_type=full&${Q}`)).body || {};
T("P3 delete process child row", pdl.status < 300 && !(tableOf(pread3, "Spike_Rounds") || []).some((r) => r._id === rr), { status: pdl.status, rowsLeft: (tableOf(pread3, "Spike_Rounds") || []).length });
const del = await w.call("DELETE", `/process/2/${A}/${POINT}/${pid}?${Q}`);
T("P4 throwaway Point draft deleted", del.status < 300, { status: del.status, id: pid });
R.regRow = row1; R.regItem = REG_ITEM; R.caseItem = CASE_ITEM;
writeFileSync(new URL("./child-table-shape-result.json", import.meta.url), JSON.stringify(R, null, 2));
