// Runtime tests on the zz-spike harness in CIQ_Digital_A00 (Thomas: "run the tests", 2026-10-07).
// Uses the account key (= Thomas). Creates clearly-labelled test items ("ZZT-…"); writes only to CIQ ZZ Spike flows.
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, APP = "CIQ_Digital_A00", Q = `_application_id=${APP}`;
const CASE = "CIQ_ZZ_Spike_Case_A00", POINT = "CIQ_ZZ_Spike_Point_A00", REG = "CIQ_ZZ_Spike_Register_A00", LOG = "CIQ_ZZ_Spike_Log_A00";
const tag = `ZZT-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;
const R = { tag, at: new Date().toISOString(), tests: [] };
const T = (id, ok, detail) => { R.tests.push({ id, ok, detail }); console.log(ok === true ? "PASS" : ok === false ? "FAIL" : "INFO", id, typeof detail === "string" ? detail : JSON.stringify(detail)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const formCreate = async (form, data) => {
  const d = await w.call("POST", `/form/2/${A}/${form}?${Q}`, data);
  if (d.status >= 300) return { status: d.status, body: d.body };
  const s = await w.call("POST", `/form/2/${A}/${form}/${d.body._id}/submit?${Q}`, {});
  return { status: s.status, body: s.body, draft: d.status };
};
const formList = async (form) => { const r = await w.call("POST", `/form/2/${A}/${form}/list?page_number=1&page_size=200&${Q}`, {}); return r.body?.Data || []; };
const adminRead = async (proc, item) => (await w.call("GET", `/process/2/${A}/admin/${proc}/${item}?${Q}`)).body || {};
const myAct = async (proc, item) => ((await w.call("GET", `/process/2/${A}/${proc}/myitems?_response_type=full&${Q}`)).body?.Data || (await w.call("GET", `/process/2/${A}/${proc}/myitems?_response_type=full&${Q}`)).body || []).find?.((x) => x._id === item);

// ── T1 Form + child table + embedded SUM + Dataform ItemCreated integration ─────────────────────────────
const logBefore = (await formList(LOG)).length;
const r1 = await formCreate(REG, { Register_Key: `${tag}-R1`, Spike_Lines: [{ Line_Text: "open line", Line_Open: 1 }, { Line_Text: "closed line", Line_Open: 0 }] });
const reg1 = r1.body;
T("T1a form create+submit with child rows via REST", r1.status < 300, { status: r1.status, id: reg1?._id, err: r1.status >= 300 ? JSON.stringify(r1.body).slice(0, 200) : undefined });
if (reg1?._id) {
  const rows = await formList(REG); const back = rows.find((x) => x._id === reg1._id) || {};
  T("T1b child rows stored", Array.isArray(back.Spike_Lines) && back.Spike_Lines.length === 2, { lines: back.Spike_Lines?.length, keys: Object.keys(back).filter((k) => !k.startsWith("_")) });
  T("T1c embedded SUM Open_Lines = 1", back.Open_Lines === 1, { Open_Lines: back.Open_Lines });
}
let logHit = null;
for (let i = 0; i < 12 && !logHit; i++) { await sleep(10000); logHit = (await formList(LOG)).find((x) => x.Log_Key === `${tag}-R1`); }
T("T1d integration 'register created' (Dataform ItemCreated → create Log row) fired", !!logHit, logHit ? { Log_Source: logHit.Log_Source, Log_Event: logHit.Log_Event, Log_Item_Id: logHit.Log_Item_Id, matchesRegisterId: logHit.Log_Item_Id === reg1?._id } : { waitedSeconds: 120, logRowsBefore: logBefore });

// ── T2 Process create at Start (flags pre-set; admin key) + submit Start ──────────────────────────────────
const c = await w.call("POST", `/process/2/${A}/${CASE}?${Q}`, { Flag_A: "Yes", Flag_B: "Yes", Flag_C: "Yes", Flag_D: "No", Flag_E: "No", Flag_F: "No", Spike_Decision: "Approved" });
const caseId = c.body?._id, caseAct = c.body?._activity_instance_id;
const cs = caseId ? await w.call("POST", `/process/2/${A}/${CASE}/${caseId}/${caseAct}/submit?${Q}`, {}) : { status: -1 };
const caseRead = caseId ? await adminRead(CASE, caseId) : {};
T("T2 Spike Case created + Start submitted", cs.status < 300, { create: c.status, submit: cs.status, id: caseId, step: caseRead._current_step, status: caseRead._status, flags: ["A", "B", "C", "D", "E", "F"].map((x) => caseRead[`Flag_${x}`]).join(","), err: cs.status >= 300 ? JSON.stringify(cs.body).slice(0, 200) : undefined });

// ── T3 cross-flow SUM after graft: Register linked to the case with one open line ──────────────────────────
if (caseId) {
  const r3 = await formCreate(REG, { Register_Key: `${tag}-R2`, Register_Case: { _id: caseId }, Spike_Lines: [{ Line_Text: "blocking line", Line_Open: 1 }] });
  T("T3a linked Register created", r3.status < 300, { status: r3.status, id: r3.body?._id });
  await sleep(5000);
  const cr = await adminRead(CASE, caseId);
  T("T3b cross-flow SUM Case.Open_Count = 1 (after graft)", cr.Open_Count === 1, { Open_Count: cr.Open_Count, Hold_Flag: cr.Hold_Flag, Gate: cr.Gate });
  T("T3c formulas over the aggregate", cr.Hold_Flag === "Yes" && (cr.Gate === "" || cr.Gate === undefined || cr.Gate === null), { Hold_Flag: cr.Hold_Flag, Gate: cr.Gate });
}

// ── T4 can the key (Thomas, member of Role A) act at "Spike prepare"? ───────────────────────────────────
if (caseId) {
  const mi = await myAct(CASE, caseId);
  const act = mi?._activity_instance_id;
  const up = act ? await w.call("POST", `/process/2/${A}/${CASE}/${caseId}/${act}?${Q}`, { Flag_D: "No" }) : { status: -1 };
  const sb = act ? await w.call("POST", `/process/2/${A}/${CASE}/${caseId}/${act}/submit?${Q}`, {}) : { status: -1 };
  const after = await adminRead(CASE, caseId);
  T("T4 key acts at 'Spike prepare' (update+submit)", sb.status < 300, { myitemsStep: mi?._current_step, act, update: up.status, submit: sb.status, err: sb.status >= 300 ? sb.body?.en_message : undefined, stepAfter: after._current_step });
  R.caseId = caseId;
}

// ── T5 condition routing on a Select (Point: To_Supplier) ───────────────────────────────────────────────
for (const [lbl, val, expect] of [["No", "No", "Spike review"], ["Yes", "Yes", "Spike waiting"]]) {
  const p = await w.call("POST", `/process/2/${A}/${POINT}?${Q}`, { To_Supplier: val, Round_No: 1, Question_Text: `${tag} point ${lbl}`, Awaiting_Response: "Yes" });
  const ps = p.body?._id ? await w.call("POST", `/process/2/${A}/${POINT}/${p.body._id}/${p.body._activity_instance_id}/submit?${Q}`, {}) : { status: -1 };
  const pr = p.body?._id ? await adminRead(POINT, p.body._id) : {};
  T(`T5 Point To_Supplier=${lbl} lands at '${expect}'`, pr._current_step === expect, { id: p.body?._id, create: p.status, submit: ps.status, step: pr._current_step, status: pr._status });
  (R.points = R.points || []).push({ id: p.body?._id, To_Supplier: val, step: pr._current_step });
}
writeFileSync(new URL("./runtime-tests-result.json", import.meta.url), JSON.stringify(R, null, 2));
console.log("written runtime-tests-result.json");
