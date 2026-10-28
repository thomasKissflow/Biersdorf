// 25 Oct: continues ZZT-E2E-25 after I-2 timed out on its bulk create: moves the case into review as I-2 would, then E-B and I-7.
import { run, startCase, i1, stepPut, stepSubmit, search, RQ, CASE, REV } from "./run.mjs";
import { APP, PORTAL, A, call, procGet, hook, isoNow, sleep, track } from "./lib.mjs";
const code = process.env.E2E_CODE || "ZZT-E2E-25", T0 = Date.now();
const AUD = "CIQ_Audit_Event_A00";
const STEP = { fill: "Supplier: fill in the CIQ", keep: "Supplier: keep the CIQ up to date", give: "Supplier: give the final release", view: "Supplier: view the released CIQ", review: "Beiersdorf review and final release" };
const out = { code, created: {}, log: [] };
const note = (m, v) => { const s = `${new Date().toISOString().slice(11, 19)} ${m}${v !== undefined ? " " + JSON.stringify(v) : ""}`; console.log("  · " + s); out.log.push(s); };
async function poll(label, fn, tries = 12) { for (let i = 0; i < tries; i++) { await sleep(3000); const v = await fn(); if (v) return v; } note(`poll timed out: ${label}`); return null; }
async function audits(caseId) {
  const rows = (b) => (Array.isArray(b?.Data) ? b.Data : Array.isArray(b) ? b : []);
  let r = rows((await call("POST", `/form/2/${A}/${AUD}/list?page_number=1&page_size=100&q=${encodeURIComponent(caseId)}&_application_id=${APP}`, {})).body);
  r = r.filter((x) => x.Case_Item_Id === caseId);
  if (!r.length) r = rows((await call("POST", `/form/2/${A}/${AUD}/list?page_number=1&page_size=200&_application_id=${APP}`, {})).body).filter((x) => x.Case_Item_Id === caseId);
  return r;
}
const reviews = async (caseId) => (await search(REV, APP, caseId)).filter((r) => r.Case_Item_Id === caseId);
const fail = (msg) => { out.stopped = msg; finish(); process.exit(1); };
function finish() { out.minutes = +((Date.now() - T0) / 60000).toFixed(1); console.log("\nSUMMARY " + JSON.stringify(out, null, 1)); }
const k = { caseId: "PkEQjP3T6gnx", reqId: "PkEQjPk2blCt" };
out.created = { case: k.caseId, request: k.reqId };
let revs = await reviews(k.caseId), aud = [];
for (const r of revs) track("process", REV, APP, r._id, `${code} ${r.Review_Dept} round-1 review (I-2 bulk)`);
track("process", CASE, APP, k.caseId, `${code} case`);
note("reviews", revs.map((r) => `${r.Review_Dept} ${r._id} ${r._status}`));
const s2 = await run(`E2E25.${code}.2b`, `${code}: case into review (stand-in for I-2's approve)`, async (t) => {
  const s = await stepSubmit(CASE, APP, k.caseId);
  t.check("case moved to review", s.status === 200 && s.to === STEP.review, { status: s.status, from: s.from, to: s.to, body: s.body });
  return s.status === 200;
});
if (!s2) fail("step 2b failed");
const s3 = await run(`E2E25.${code}.3`, `${code}: reviews completed → E-B`, async (t) => {
  for (const d of ["RMM", "SUS"]) {
    const r = revs.find((x) => x.Review_Dept === d);
    const s = await stepSubmit(REV, APP, r._id);
    t.check(`${d} review submitted`, s.status === 200, { id: r._id, status: s.status, from: s.from, to: s.to, statusAfter: s.statusAfter, body: s.body });
  }
  const rq = await poll("request at give", async () => { const x = await procGet(RQ, PORTAL, k.reqId); return x?.Release_Flag === "Requested" && x?._current_step === STEP.give ? x : null; });
  const rq2 = rq || (await procGet(RQ, PORTAL, k.reqId));
  t.check("request Release_Flag 'Requested', locked, labelled, at 'Supplier: give the final release'", !!rq && rq.Request_Locked === "Yes" && rq.Case_Phase_Label === "Awaiting your final release",
    { Release_Flag: rq2?.Release_Flag, Request_Locked: rq2?.Request_Locked, Case_Phase_Label: rq2?.Case_Phase_Label, step: rq2?._current_step, status: rq2?._status });
  const c = await procGet(CASE, APP, k.caseId);
  t.check("case Release_Requested_At set", !!c?.Release_Requested_At, c?.Release_Requested_At ?? null);
  aud = (await poll("release.requested audit", async () => { const a = await audits(k.caseId); return a.some((x) => x.Action_Code === "release.requested") ? a : null; }, 4)) || (await audits(k.caseId));
  const rr = aud.filter((x) => x.Action_Code === "release.requested");
  t.check("a release.requested audit row", rr.length >= 1, rr.map((x) => ({ id: x._id, at: x.Event_At })));
  const rv = await reviews(k.caseId);
  note("reviews after", rv.map((r) => `${r.Review_Dept} ${r._id} ${r._status}`));
  return !!rq;
});
if (!s3) fail("step 3 failed");

await run(`E2E25.${code}.4`, `${code}: final release + I-7`, async (t) => {
  const rel = { Release_By_Name: "ZZT Supplier (fictional)", Release_By_Email: "zzt.supplier.night@example.com", Release_By_Role: "Coordinator", Release_At: isoNow() };
  const w = await stepPut(RQ, PORTAL, k.reqId, rel);
  t.check("release fields written at give (user route)", w.status === 200, { status: w.status, step: w.step, body: w.body });
  const s = await stepSubmit(RQ, PORTAL, k.reqId);
  t.check("release submitted → view", s.status === 200 && s.to === STEP.view, { status: s.status, from: s.from, to: s.to, body: s.body });
  const h = await hook("release.given", { portalRequestItemId: k.reqId });
  t.check("release.given webhook accepted", h === 200, h);
  const c = await poll("case completed", async () => { const x = await procGet(CASE, APP, k.caseId); return x?._status === "Completed" || x?.Case_Phase === "Completed" ? x : null; });
  const c2 = c || (await procGet(CASE, APP, k.caseId));
  const fr = Object.fromEntries(Object.entries(c2 || {}).filter(([x]) => x.startsWith("Final_Release_")));
  t.check("case Completed with Final_Release_* set", !!c && fr.Final_Release_Confirm === "Confirmed" && fr.Final_Release_By_Name === rel.Release_By_Name && !!fr.Final_Release_At,
    { status: c2?._status, step: c2?._current_step, phase: c2?.Case_Phase, ...fr });
});
const a = await audits(k.caseId);
out.created.audits = a.map((x) => ({ id: x._id, action: x.Action_Code, at: x.Event_At }));
for (const x of a) track("form", AUD, APP, x._id, `${code} ${x.Action_Code} audit row`);
finish();
