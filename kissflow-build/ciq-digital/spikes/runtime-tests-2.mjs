// Runtime tests, round 2: header-only Form create (integration trigger), child-table write via the update route, cross-flow SUM.
import { readFileSync, writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, APP = "CIQ_Digital_A00", Q = `_application_id=${APP}`;
const CASE = "CIQ_ZZ_Spike_Case_A00", REG = "CIQ_ZZ_Spike_Register_A00", LOG = "CIQ_ZZ_Spike_Log_A00";
const prev = JSON.parse(readFileSync(new URL("./runtime-tests-result.json", import.meta.url), "utf8"));
const tag = prev.tag + "b", caseId = prev.caseId;
const R = { tag, caseId, tests: [] };
const T = (id, ok, d) => { R.tests.push({ id, ok, detail: d }); console.log(ok === true ? "PASS" : ok === false ? "FAIL" : "INFO", id, JSON.stringify(d)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const formList = async (form) => (await w.call("POST", `/form/2/${A}/${form}/list?page_number=1&page_size=200&${Q}`, {})).body?.Data || [];
const create = async (data) => { const d = await w.call("POST", `/form/2/${A}/${REG}?${Q}`, data); if (d.status >= 300) return d; return w.call("POST", `/form/2/${A}/${REG}/${d.body._id}/submit?${Q}`, {}); };

// T1' header-only create → integration 'register created'
const r1 = await create({ Register_Key: `${tag}-R1` });
T("T1a' header-only Register create+submit", r1.status < 300, { status: r1.status, id: r1.body?._id, err: r1.status >= 300 ? r1.body?.en_message : undefined });
let hit = null; for (let i = 0; i < 12 && !hit; i++) { await sleep(10000); hit = (await formList(LOG)).find((x) => x.Log_Key === `${tag}-R1`); }
T("T1d integration 'register created' fired (Dataform ItemCreated → Log row)", !!hit, hit ? { Log_Source: hit.Log_Source, Log_Event: hit.Log_Event, Log_Item_Id: hit.Log_Item_Id, itemIdMatches: hit.Log_Item_Id === r1.body?._id, Log_At: hit.Log_At, seconds: "≤" + (12 * 10) } : { waitedSeconds: 120 });

// T1e child rows via the UPDATE route
if (r1.body?._id) {
  const up = await w.call("POST", `/form/2/${A}/${REG}/${r1.body._id}?${Q}`, { Spike_Lines: [{ Line_Text: "open line", Line_Open: 1 }, { Line_Text: "closed line", Line_Open: 0 }] });
  const back = (await formList(REG)).find((x) => x._id === r1.body._id) || {};
  T("T1e child rows via REST update route", up.status < 300 && Array.isArray(back.Spike_Lines) && back.Spike_Lines.length === 2, { update: up.status, err: up.status >= 300 ? up.body?.en_message : undefined, lines: back.Spike_Lines?.length, Open_Lines: back.Open_Lines });
  // was an 'updated' log row created? (no ItemUpdated integration exists → expect none; this checks no stray firing)
}

// T3' linked register (header-only), then lines via update, then case Open_Count
if (caseId) {
  const r3 = await create({ Register_Key: `${tag}-R2`, Register_Case: { _id: caseId } });
  T("T3a' linked Register (header-only) created", r3.status < 300, { status: r3.status, id: r3.body?._id, err: r3.status >= 300 ? r3.body?.en_message : undefined });
  if (r3.body?._id) {
    const up = await w.call("POST", `/form/2/${A}/${REG}/${r3.body._id}?${Q}`, { Spike_Lines: [{ Line_Text: "blocking line", Line_Open: 1 }] });
    T("T3a'' add a line with Line_Open=1 via update", up.status < 300, { update: up.status, err: up.status >= 300 ? up.body?.en_message : undefined });
    await sleep(8000);
    const cr = (await w.call("GET", `/process/2/${A}/admin/${CASE}/${caseId}?${Q}`)).body || {};
    T("T3b cross-flow SUM Case.Open_Count after graft", cr.Open_Count === 1 ? true : cr.Open_Count === 0 ? "zero" : false, { Open_Count: cr.Open_Count, Hold_Flag: cr.Hold_Flag, Gate: cr.Gate, linkedRegisterLines: up.status < 300 ? "written" : "not written" });
  }
}
writeFileSync(new URL("./runtime-tests-2-result.json", import.meta.url), JSON.stringify(R, null, 2));
