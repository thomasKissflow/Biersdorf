// The 21 Oct night tests (Thomas: "run all the tests, create items at different stages … see if data is being stored …
// nothing is corrupted"). Every CIQ object is driven over REST the way the screens drive it (the supplier's writes go
// through the item's current step, as the assignee; Beiersdorf's through the app), and every hand-off is posted to its
// live webhook exactly as the screens post it (only ids, text/plain). Each result is read back from Kissflow.
//   node run.mjs [scenario-prefix]   resumable: a scenario marked done is skipped; exit 75 = rate-limited (rerun in 20 min)
// Items are fictional (ZZT-NT-…), recorded in manifest.json before anything else happens to them, and left in place at
// their stage for Thomas to inspect; cleanup.mjs removes them.
import {
  call, A, APP, PORTAL, THOMAS, sleep, RateLimited, callCount, manifest, results, saveResults, track, markDeleted, scenario,
  noMs, isoNow, plusDays, parses, sameFields, procGet, actOf, procCreate, procSubmit, adminUpdate, formCreate, formGet,
  formUpdate, formDelete, hook, until,
} from "./lib.mjs";

const CASE = "CIQ_Case_A00", RQ = "CIQP_Request_A00", QRY = "CIQP_Query_A00", OP = "CIQ_Open_Point_A00", REV = "CIQ_Review_A00";
const UPLOADS = "CIQP_Request_A00_Uploads";
const ME = THOMAS._id, ME_LIST = JSON.stringify([{ _id: ME }]);
const SUP = "zzt.supplier.night@example.com", SUP_NAME = "ZZT Supplier Nacht (fictional)";
const STEP = {
  caseStart: "Create case", caseWait: "Waiting for supplier: CIQ", caseReview: "Beiersdorf review and final release",
  fill: "Supplier: fill in the CIQ", keep: "Supplier: keep the CIQ up to date", give: "Supplier: give the final release",
  view: "Supplier: view the released CIQ", respond: "Supplier: respond",
};
const DEPT_LABEL = { REG: "Regulatory", SAF: "Safety", QM: "QM", MIC: "Microbiology", SUS: "Sustainability", RMM: "RMM" };
const SYNCED = ["Config_Answers_JSON", "Answers_JSON", "Answered_By_JSON", "Justifications_JSON", "Components_JSON", "Scope_JSON", "Requested_Docs_JSON",
  "Documents_JSON", "Answers_Rev", "Answers_Changed_At", "Answers_Changed_By_Email", "Change_Report_Text", "Change_Report_Rev", "Change_Report_By_Email", "Change_Report_At"];
const I1_COPY = ["Case_Code", "Supplier_Code", "Trade_Name", "Main_INCI", "BDF_Material_No", "BDF_Contact_Name", "BDF_Contact_Email", "Markets_Label", "Template_Label",
  "Supplier_Due_Date", "Rule_Set_Version", "Template_Version", "Config_Bundle_JSON", "Config_Bundle_Hash", "BDF_Set_JSON", "Case_Contacts_JSON"];
const WAIT_REFUSED = 45000; // a hand-off runs in about 5-10 s; a refused one must leave its target unchanged after this
const ONLY = process.argv[2] || "";
// Pass 1 (R1-R3, X, F) found P-1 (a user-route write after "fill in" is refused, 050313) and P-2 (a REST submit ignores
// Mandatory). Pass 2 writes as the screen does first and, on that refusal, uses the admin route as a stand-in for the
// fixed permission, so every hand-off after it is still tested end to end; it makes no early (Mandatory) submits.
let PASS = 1;

// ---------------------------------------------------------------------------------------------------- small helpers
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k] === undefined ? null : o[k]]));
const ids = (list) => (Array.isArray(list) ? list : []).map((u) => u?._id ?? u).filter(Boolean).sort().join(",");
const brief = (it) => it && { _status: it._status, _current_step: it._current_step, assigned: ids(it._current_assigned_to) };
const SYS = new Set(["_modified_at", "_status", "_current_step"]);
const stable = (it) => (it ? Object.fromEntries(Object.entries(it).filter(([k]) => !k.startsWith("_") || SYS.has(k))) : null);
const diffKeys = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
const show = (it, want) => Object.fromEntries(sameFields(it, want).map((k) => [k, { want: want[k], got: it?.[k] }]));
const rowsOf = (it, table, keyField) => {
  for (const k of [table, `Table::${table}`]) if (Array.isArray(it?.[k])) return it[k];
  for (const v of Object.values(it || {})) if (Array.isArray(v) && v.some((r) => r && typeof r === "object" && keyField in r)) return v;
  return [];
};
// 45 min: since 22 Oct a check can sit out the other session's half hour after its write (NG4.5 failed at 15 min: I-5 wrote at
// 07:58:32, the check ran after the 08:30 window opened)
const recent = (v, mins = 45) => { const t = Date.parse(v || ""); return Number.isFinite(t) && Math.abs(Date.now() - t) < mins * 60000; };

async function search(flow, app, q) {
  const r = await call("GET", `/process/2/${A}/admin/${flow}/item?q=${encodeURIComponent(q)}&_application_id=${app}`);
  return Array.isArray(r.body?.Data) ? r.body.Data : [];
}
async function actFor(flow, app, id, it) {
  const a = actOf(it) || (typeof it?._activity_instance_id === "string" ? it._activity_instance_id : null);
  if (a) return a;
  const row = (await search(flow, app, id)).find((r) => r._id === id);
  const x = row?._activity_instance_id;
  return Array.isArray(x) ? x[0] : x;
}
/** A write through the item's current step, as its assignee (the way the supplier's screen writes). */
async function stepPut(flow, app, id, data) {
  const it = await procGet(flow, app, id);
  const act = await actFor(flow, app, id, it);
  const r = await call("POST", `/process/2/${A}/${flow}/${id}/${act}?_application_id=${app}`, data);
  return { status: r.status, body: r.status === 200 ? undefined : r.body, step: it?._current_step };
}
/** Pass 2: the write a screen makes (user route); on the known P-1 refusal the admin route stands in. Returns the route used. */
async function screenWrite(t, flow, app, id, data, label) {
  const w = await stepPut(flow, app, id, data);
  if (w.status === 200) { t.check(`${label}: the screen's write at '${w.step}' is accepted (user route)`, true); return "user"; }
  const p1 = w.body?.error_code === "KISSFLOW_ERROR_050313";
  t.check(`${label}: P-1 reproduced: the user route refuses it at '${w.step}'${p1 ? " (050313)" : " with ANOTHER error"}`, p1, w.body);
  const st = await adminUpdate(flow, app, id, data);
  t.check(`${label}: written by the admin route instead (stand-in for the fixed permission)`, st === 200, st);
  return "admin";
}
/** Pass 1 wrote with stepPut and checked 200; pass 2 goes through screenWrite. Returns {status} like stepPut. */
async function write(t, flow, app, id, data, label) {
  if (PASS === 1) return stepPut(flow, app, id, data);
  if (PASS === 3) { // after Thomas's permission fix (21 Oct): the screen's write must go through on the user route itself
    const w = await stepPut(flow, app, id, data);
    t.check(`${label}: the screen's write at '${w.step}' is accepted (user route)`, w.status === 200, w.body);
    return w;
  }
  const how = await screenWrite(t, flow, app, id, data, label);
  return { status: 200, how };
}
/** Submits the item's current step, as its assignee. */
async function stepSubmit(flow, app, id) {
  const it = await procGet(flow, app, id);
  const act = await actFor(flow, app, id, it);
  const r = await procSubmit(flow, app, id, act);
  await sleep(1500);
  const after = await procGet(flow, app, id);
  return { status: r.status, body: r.status === 200 ? undefined : r.body, from: it?._current_step, to: after?._current_step, statusAfter: after?._status, after };
}
/** Posts a hand-off and waits until its target satisfies `ok` (the read-back is returned, or null). */
async function applied(t, label, code, payload, flow, app, id, ok, ms = 100000) {
  const st = await hook(code, payload);
  const it = await until(async () => { const x = await procGet(flow, app, id); return ok(x) ? x : null; }, ms);
  t.check(label, st === 200 && !!it, { webhook: st, ...(it ? {} : { last: brief(await procGet(flow, app, id)) }) });
  return it;
}
/** Posts a hand-off that must be refused: after WAIT_REFUSED every target item reads back exactly as before. */
async function refused(t, label, code, payload, targets) {
  const before = [];
  for (const [flow, app, id] of targets) before.push(stable(await procGet(flow, app, id)));
  const st = await hook(code, payload);
  await sleep(WAIT_REFUSED);
  const changed = [];
  for (let i = 0; i < targets.length; i++) {
    const [flow, app, id] = targets[i];
    const d = diffKeys(before[i], stable(await procGet(flow, app, id)));
    if (d.length) changed.push({ flow, id, keys: d });
  }
  return t.check(label, st === 200 && !changed.length, { webhook: st, changed });
}
async function run(id, title, fn) {
  if (ONLY && !id.startsWith(ONLY)) return null;
  if (results.scenarios[id]?.done) { console.log(`skip ${id} (done)`); return results.scenarios[id].out ?? null; }
  console.log(`\n== ${id} ${title}`);
  const t = scenario(id, title);
  try {
    const out = await fn(t);
    t.s.out = out ?? null;
    t.done();
    return out ?? null;
  } catch (e) {
    if (e instanceof RateLimited) { saveResults(); throw e; } // not done: the rerun after the pause starts it afresh (21 Oct: S2.3 was cut short this way)
    t.check("scenario ran to the end", false, String(e?.stack || e).slice(0, 500));
    t.done();
    return null;
  } finally {
    saveResults();
  }
}

// ---------------------------------------------------------------------------------------------------- test data
function caseBody(code, extra = {}) {
  return {
    Case_Code: code, Cycle_No: 1, Case_Title: `${code} night test case (fictional)`, Case_Test: "Yes", Priority: "Normal",
    Trade_Name: "ZZT NightGlow Ester (fictional)", Main_INCI: "Caprylic/Capric Triglyceride", BDF_Material_No: `${code}-RM`, SAP_Material_No: "ZZT-SAP-0001", IRMA_Ref: "ZZT-IRMA-1",
    Supplier_Code: "ZZT-SUP-NT", Supplier_Legal_Name: "ZZT Nachttest Chemie GmbH (fictional) – Zürich “Ä”", Owner_RMM: { _id: ME },
    Target_Markets_Text: "EU, US", Markets_Label: "EU, US", Template_Label: "ZZT template (fictional)",
    BDF_Contact_Name: "ZZT RMM Nacht (fictional)", BDF_Contact_Email: "rmm.night.zzt@example.com", Supplier_Due_Date: plusDays(14),
    Case_Contacts_JSON: JSON.stringify([{ id: ME, name: "ZZT Contact (fictional)", email: SUP, title: "QA", mayConfirm: true }]),
    Portal_Contact_Ids: ME, Confirm_Contact_Ids: ME, Supplier_Contact_Emails: SUP,
    Release_Item_Id: "ZZT-REL-ITEM", Release_Key: "ZZT-REL-NT", Manifest_Hash: "zzt-manifest-hash", Release_Manifest_JSON: '{"zzt":true}',
    Rule_Set_Version: "ZZT-RS-NT", Template_Version: "ZZT-TPL-NT",
    Config_Bundle_JSON: JSON.stringify({ format: "ciq-bundle/1", zzt: true, note: "night test" }), Config_Bundle_Hash: "zzt-bundle-nt", BDF_Set_JSON: '{"zzt":true}',
    Portal_Assignees_JSON: ME_LIST, Release_Assignees_JSON: ME_LIST, ...extra,
  };
}
function answers(rev, big) {
  const a = { S01_GENERAL: { origin: rev % 2 ? "Plant" : "Synthetic", country: "DE", note: `Rev ${rev} – Zürich “quoted” \\ backslash, tab\tand newline\nline 2 ✓` } };
  if (big) for (let i = 0; i < 400; i++) a[`S9_${String(i).padStart(3, "0")}`] = { v: `value ${i} `.repeat(6) };
  return {
    Config_Answers_JSON: JSON.stringify({ origin: "plant", rev }), Answers_JSON: JSON.stringify(a), Answered_By_JSON: JSON.stringify({ "S01_GENERAL.origin": SUP }),
    Justifications_JSON: JSON.stringify({ "S01_GENERAL.origin": `Justification rev ${rev} (fictional) – ß` }),
    Components_JSON: JSON.stringify([{ id: "c1", inci: "Tocopherol", cas: "59-02-9", min: 0.1, max: 0.5 }]),
    Scope_JSON: JSON.stringify({ sections: ["S01_GENERAL", "S02_COMPOSITION"], rev }), Requested_Docs_JSON: JSON.stringify([{ key: "sds", name: "SDS" }]),
    Answers_Rev: rev, Answers_Changed_At: isoNow(), Answers_Changed_By_Email: SUP, Editing_By: SUP, Editing_Since: isoNow(),
  };
}

// ---------------------------------------------------------------------------------------------------- the case chain
/** Creates and starts a case; I-1 creates its request. Returns {caseId, reqId, body}. */
async function startCase(t, code, { submit = true, body: extra = {} } = {}) {
  const body = caseBody(code, extra);
  const c = await procCreate(CASE, APP, body, `${code} case`);
  let it = await procGet(CASE, APP, c._id);
  t.check("case draft reads back every Start field (21 Mandatory + 16 Editable)", !sameFields(it, body).length, show(it, body));
  t.check("case draft is at 'Create case'", it?._current_step === STEP.caseStart && it?._status === "Draft", brief(it));
  if (!submit) return { caseId: c._id, body };
  const sub = await procSubmit(CASE, APP, c._id, c._activity_instance_id);
  await sleep(1500);
  it = await procGet(CASE, APP, c._id);
  t.check("Start submit accepted", sub.status === 200, sub.body);
  t.check("case moved to 'Waiting for supplier: CIQ', in progress", it?._current_step === STEP.caseWait && it?._status === "InProgress", brief(it));
  t.check("info: who holds 'Waiting for supplier: CIQ' (role Integration service)", true, it?._current_assigned_to ?? null);
  t.check("case fields unchanged by the submit", !sameFields(it, body).length, show(it, body));
  return { caseId: c._id, body };
}
async function i1(t, code, k) {
  const it = await applied(t, "case.started (I-1) → the case links its new request", "case.started", { caseItemId: k.caseId }, CASE, APP, k.caseId, (x) => !!x?.Portal_Request_Item_Id);
  if (!it) return null;
  const reqId = it.Portal_Request_Item_Id;
  track("process", RQ, PORTAL, reqId, `${code} request (created by I-1)`);
  t.check("case phase 'Supplier filling in the CIQ'", it.Case_Phase === "Supplier filling in the CIQ", it.Case_Phase);
  const rq = await procGet(RQ, PORTAL, reqId);
  const want = {
    ...pick(k.body, I1_COPY), App_Case_Item_Id: k.caseId, Request_Key: `${code}|1`, Cycle_No: 1, Supplier_Display_Name: k.body.Supplier_Legal_Name,
    Case_Phase_Label: "Filling in", Request_Locked: "No", Manual_Scope_JSON: "[]", Assigned_Contacts: [{ _id: ME }], Release_Contacts: [{ _id: ME }],
  };
  t.check("request carries the case's 16 header fields, its link, key, label, lock and both contact lists", !sameFields(rq, want).length, show(rq, want));
  t.check("request at 'Supplier: fill in the CIQ', in progress, assigned to the portal contact", rq?._current_step === STEP.fill && rq?._status === "InProgress" && ids(rq?._current_assigned_to) === ME, brief(rq));
  t.check("request has no Release_Flag yet", !rq?.Release_Flag, rq?.Release_Flag);
  return { ...k, reqId };
}
async function i1Twins(t, k) {
  await hook("case.started", { caseItemId: k.caseId });
  await hook("case.started", { caseItemId: k.caseId });
  await sleep(WAIT_REFUSED);
  const twins = (await search(RQ, PORTAL, k.caseId)).filter((r) => r.App_Case_Item_Id === k.caseId);
  for (const r of twins) if (r._id !== k.reqId) track("process", RQ, PORTAL, r._id, "UNEXPECTED twin request");
  t.check("two more case.started posts create no second request (idempotent)", twins.length === 1 && twins[0]._id === k.reqId, twins.map((r) => r._id));
  const c = await procGet(CASE, APP, k.caseId);
  t.check("the case still links its first request", c?.Portal_Request_Item_Id === k.reqId, c?.Portal_Request_Item_Id);
}
async function supplierSaves(t, k, { big = false } = {}) {
  let last = null;
  for (const rev of [1, 2, 3]) {
    const data = answers(rev, big && rev === 2);
    const w = await stepPut(RQ, PORTAL, k.reqId, data);
    t.check(`Rev ${rev}${big && rev === 2 ? " (~30 KB answers)" : ""}: the supplier's write at '${w.step}' is accepted`, w.status === 200, w.body);
    last = await procGet(RQ, PORTAL, k.reqId);
    t.check(`Rev ${rev}: the request reads back every answer field exactly`, !sameFields(last, data).length, show(last, data));
    t.check(`Rev ${rev}: every JSON field parses and no time has milliseconds`, SYNCED.filter((f) => /_JSON$/.test(f)).every((f) => parses(last?.[f])) && noMs(last?.Answers_Changed_At), pick(last, ["Answers_Changed_At"]));
    if (rev === 3) await hook("request.changed", { portalRequestItemId: k.reqId }); // the rapid double post (two saves close together)
    const c = await applied(t, `Rev ${rev}: request.changed → the case has Rev ${rev}${rev === 3 ? " (posted twice back to back)" : ""}`, "request.changed", { portalRequestItemId: k.reqId },
      CASE, APP, k.caseId, (x) => Number(x?.Answers_Rev) === rev);
    if (c) t.check(`Rev ${rev}: the case's 15 synced fields equal the request's`, !sameFields(c, pick(last, SYNCED)).length, show(c, pick(last, SYNCED)));
  }
  if (big) {
    const c = await procGet(CASE, APP, k.caseId);
    t.check("after Rev 3 the case holds Rev 3, not the ~30 KB Rev 2 (no stale overwrite)", Number(c?.Answers_Rev) === 3 && !String(c?.Answers_JSON || "").includes("S9_000"), { rev: c?.Answers_Rev, len: String(c?.Answers_JSON || "").length });
  }
  return last;
}
async function readOnlyGuard(t, k, step, fields) {
  const before = await procGet(RQ, PORTAL, k.reqId);
  const w = await stepPut(RQ, PORTAL, k.reqId, fields);
  const after = await procGet(RQ, PORTAL, k.reqId);
  const leaked = Object.keys(fields).filter((f) => JSON.stringify(after?.[f] ?? null) !== JSON.stringify(before?.[f] ?? null));
  const wrongRoute = w.body?.type === "EndpointNotFound" || w.status === 404;
  t.check(`at '${step}' a supplier write cannot change the ReadOnly ${Object.keys(fields).join(", ")}`, !leaked.length && !wrongRoute, { status: w.status, body: w.body, leaked: pick(after, leaked) });
  if (leaked.length) {
    const st = await adminUpdate(RQ, PORTAL, k.reqId, pick(before, leaked)); // put the true values back
    t.check("restored the leaked values (admin)", st === 200, st);
  }
}
async function uploads(t, k, code) {
  const up1 = { Upload_Id: `${code}-UP1`, Upload_Section_Key: "S01_GENERAL", Upload_Field_Key: "sds", Upload_Doc_Kind: "SDS", Upload_File_Name: "zzt-night-sds.pdf", Uploaded_By_Email: SUP, Uploaded_At: isoNow(), Upload_Attachment_Id: `${code}-ATT1` };
  const up2 = { ...up1, Upload_Id: `${code}-UP2`, Upload_Field_Key: "coa", Upload_Doc_Kind: "CoA", Upload_File_Name: "zzt-night-coa (2) – Ä.pdf", Upload_Attachment_Id: `${code}-ATT2` };
  for (const up of [up1, up2]) {
    const w = await stepPut(RQ, PORTAL, k.reqId, { [`Table::${UPLOADS}`]: [{ _is_created: true, ...up }] });
    t.check(`upload row ${up.Upload_Id}: the write is accepted`, w.status === 200, w.body);
  }
  let rq = await procGet(RQ, PORTAL, k.reqId);
  let rows = rowsOf(rq, UPLOADS, "Upload_Id");
  const r1 = rows.find((r) => r.Upload_Id === up1.Upload_Id), r2 = rows.find((r) => r.Upload_Id === up2.Upload_Id);
  t.check("both upload rows are stored with every field", r1 && r2 && !sameFields(r1, up1).length && !sameFields(r2, up2).length, { rows: rows.length, r1: r1 && show(r1, up1), r2: r2 && show(r2, up2) });
  if (!r1) return;
  const rm = { Upload_Removed_At: isoNow(), Upload_Removed_By_Email: SUP };
  const w = await stepPut(RQ, PORTAL, k.reqId, { [`Table::${UPLOADS}`]: [{ _id: r1._id, ...rm }] });
  rq = await procGet(RQ, PORTAL, k.reqId);
  rows = rowsOf(rq, UPLOADS, "Upload_Id");
  const r1b = rows.find((r) => r.Upload_Id === up1.Upload_Id), r2b = rows.find((r) => r.Upload_Id === up2.Upload_Id);
  t.check("removing a file marks its row (Upload_Removed_At / _By_Email), keeps the row and adds none", w.status === 200 && r1b && !sameFields(r1b, rm).length && rows.length === 2, { status: w.status, rows: rows.length, r1: r1b && pick(r1b, Object.keys(rm)) });
  t.check("the other upload row is untouched", r2b && !sameFields(r2b, up2).length && !r2b.Upload_Removed_At, r2b && show(r2b, up2));
  const docs = JSON.stringify([{ id: up2.Upload_Id, attachmentId: up2.Upload_Attachment_Id, name: up2.Upload_File_Name, kind: "CoA", section: "S01_GENERAL", field: "coa" }]);
  const w2 = await stepPut(RQ, PORTAL, k.reqId, { Documents_JSON: docs, Answers_Rev: 4, Answers_Changed_At: isoNow() });
  t.check("the screen's Documents_JSON (Rev 4) is accepted", w2.status === 200, w2.body);
  const c = await applied(t, "request.changed after the upload/removal → the case's Documents_JSON", "request.changed", { portalRequestItemId: k.reqId }, CASE, APP, k.caseId, (x) => Number(x?.Answers_Rev) === 4);
  if (c) t.check("the case's Documents_JSON equals the request's", !sameFields(c, { Documents_JSON: docs }).length, show(c, { Documents_JSON: docs }));
  t.check("not covered: the attachment file itself (Upload_File) needs the browser's upload API", true, "covered by the portal harness, not by REST");
}
async function confirmCompleteness(t, k) {
  const early = PASS === 1 ? await stepSubmit(RQ, PORTAL, k.reqId) : { to: STEP.fill };
  if (PASS === 1) t.check("Kissflow refuses the fill-in submit without the four Mandatory completeness fields", early.status !== 200 && early.to === STEP.fill, { status: early.status, to: early.to, body: early.body });
  const conf = { Completeness_Confirm: "Confirmed", Completeness_By_Name: SUP_NAME, Completeness_By_Email: SUP, Completeness_By_Role: "Coordinator", Completeness_At: isoNow() };
  if (early.to !== STEP.fill) await adminUpdate(RQ, PORTAL, k.reqId, conf);
  else {
    const w = await stepPut(RQ, PORTAL, k.reqId, conf);
    t.check("the supplier's completeness confirmation is accepted at fill-in", w.status === 200, w.body);
    const sub = await stepSubmit(RQ, PORTAL, k.reqId);
    t.check("the fill-in submit moves the request to 'keep the CIQ up to date'", sub.status === 200 && sub.to === STEP.keep && sub.statusAfter === "InProgress", { status: sub.status, to: sub.to, body: sub.body });
  }
  const rq = await procGet(RQ, PORTAL, k.reqId);
  t.check("the request reads back the confirmation", !sameFields(rq, conf).length, show(rq, conf));
  const c = await applied(t, "completeness.confirmed (I-2) → the case records the confirmation", "completeness.confirmed", { portalRequestItemId: k.reqId }, CASE, APP, k.caseId, (x) => x?.Completeness_Confirm === "Confirmed");
  if (c) {
    t.check("the case's Completeness_* fields equal the request's", !sameFields(c, conf).length, show(c, conf));
    t.check("the case's 15 synced fields equal the request's", !sameFields(c, pick(rq, SYNCED)).length, show(c, pick(rq, SYNCED)));
    t.check("the case phase is 'Review'", c.Case_Phase === "Review", c.Case_Phase);
    const moved = await until(async () => { const x = await procGet(CASE, APP, k.caseId); return x?._current_step === STEP.caseReview ? x : null; }, 60000);
    const now = await procGet(CASE, APP, k.caseId);
    t.check("I-2's Approve moves the case to 'Beiersdorf review and final release' (needs Thomas in the role Integration service)", !!moved, brief(now));
  }
  await refused(t, "a second completeness.confirmed is refused (the case already has it): the case is unchanged", "completeness.confirmed", { portalRequestItemId: k.reqId }, [[CASE, APP, k.caseId]]);
  return conf;
}

// ---------------------------------------------------------------------------------------------------- open points
async function openPoint(t, k, code, dept) {
  const opKey = `${code}-OP-${dept}`;
  const body = {
    OP_Key: opKey, Round_No: 1, Query_Key: `${opKey}-R1`, Case_Code: code, Cycle_No: 1, Supplier_Code: "ZZT-SUP-NT", Case_Item_Id: k.caseId,
    OP_Kind: "Query", OP_Dept: dept, Raised_By_Dept: dept, OP_To_Supplier: "Yes", Ref_Kind: "Section", Ref_Section_Key: "S01_GENERAL", Ref_Field_Key: "origin",
    Ref_Label: "General – Origin", Kind_Label: "Question", Question_Text: `ZZT night question R1 for ${dept} (fictional): please confirm the origin – “Ä/ß” ✓`,
    Supplier_Justification: "Needed for the ZZT night test (fictional).", Responsible_User: { _id: ME }, Responsible_Name: "ZZT Reviewer (fictional)",
    Responsible_Dept_Label: DEPT_LABEL[dept], Supplier_Due_Date: plusDays(7), Portal_Contact_Ids: ME, OP_Progress: "Open", Raised_By_User: { _id: ME },
    Raised_By_Name: "ZZT Reviewer (fictional)", Raiser_Assignee: [{ _id: ME }], Thread_JSON: "[]",
  };
  const p = await procCreate(OP, APP, body, `${opKey} open point`);
  let it = await procGet(OP, APP, p._id);
  t.check(`${dept}: the open point draft reads back every Start field`, !sameFields(it, body).length, show(it, body));
  const sub = await procSubmit(OP, APP, p._id, p._activity_instance_id);
  await sleep(1500);
  it = await procGet(OP, APP, p._id);
  t.check(`${dept}: the raise moves the point to 'Open point – ${DEPT_LABEL[dept]}', assigned to the raiser`, sub.status === 200 && it?._current_step === `Open point – ${DEPT_LABEL[dept]}` && ids(it?._current_assigned_to) === ME, { status: sub.status, body: sub.body, now: brief(it) });
  const opId = p._id;
  // round 1
  it = await applied(t, `${dept}: op.round → the point links its round-1 query`, "op.round", { opItemId: opId }, OP, APP, opId, (x) => !!x?.Portal_Query_Item_Id);
  if (!it) return null;
  const q1 = it.Portal_Query_Item_Id;
  track("process", QRY, PORTAL, q1, `${opKey} query round 1 (created by op.round)`);
  let q = await procGet(QRY, PORTAL, q1);
  const wantQ = {
    Query_Key: body.Query_Key, Round_No: 1, App_Open_Point_Id: opId, Case_Code: code, Cycle_No: 1, Supplier_Code: "ZZT-SUP-NT", Kind_Label: "Question",
    Responsible_Department: DEPT_LABEL[dept], Responsible_Name: body.Responsible_Name, Ref_Kind: "Section", Ref_Label: body.Ref_Label, Ref_Section_Key: "S01_GENERAL",
    Ref_Field_Key: "origin", Question_Text: body.Question_Text, Supplier_Justification: body.Supplier_Justification, Supplier_Due_Date: body.Supplier_Due_Date, Assigned_Contacts: [{ _id: ME }],
  };
  t.check(`${dept}: the query carries every field of the point`, !sameFields(q, wantQ).length, show(q, wantQ));
  t.check(`${dept}: the query is at 'Supplier: respond', assigned to the portal contact`, q?._current_step === STEP.respond && ids(q?._current_assigned_to) === ME, brief(q));
  // the raiser edits the question while it is open
  const edit = { Question_Text: `${body.Question_Text} (edited)`, Supplier_Justification: "Edited justification (fictional).", Supplier_Due_Date: plusDays(9) };
  const we = await write(t, OP, APP, opId, edit, `${dept}: the raiser's edit`);
  t.check(`${dept}: the raiser's edit is accepted at the point's step`, we.status === 200, we.body);
  q = await applied(t, `${dept}: op.edited → the open query shows the edit`, "op.edited", { opItemId: opId }, QRY, PORTAL, q1, (x) => x?.Question_Text === edit.Question_Text);
  if (q) t.check(`${dept}: the query has the edited justification, due date and an Edited_At without milliseconds`, !sameFields(q, edit).length && recent(q.Edited_At) && noMs(q.Edited_At), { diff: show(q, edit), Edited_At: q.Edited_At });
  // the supplier answers
  const ans = { Response_Kind: "Answer", Response_Text: `ZZT answer (fictional) for ${dept}: origin is plant – “ok” ✓`, Supplier_Responsible_Email: SUP, Response_Doc_Refs_JSON: "[]" };
  if (PASS === 1) {
    const early = await stepSubmit(QRY, PORTAL, q1);
    t.check(`${dept}: Kissflow refuses the respond submit without Response_Kind (Mandatory)`, early.status !== 200 && early.to === STEP.respond, { status: early.status, to: early.to });
  }
  const wa = await write(t, QRY, PORTAL, q1, ans, `${dept}: the supplier's answer`);
  t.check(`${dept}: the supplier's answer is accepted at 'Supplier: respond'`, wa.status === 200, wa.body);
  const sa = await stepSubmit(QRY, PORTAL, q1);
  t.check(`${dept}: the respond submit completes the query`, sa.status === 200 && sa.statusAfter === "Completed", { status: sa.status, to: sa.to, statusAfter: sa.statusAfter, body: sa.body });
  it = await applied(t, `${dept}: query.answered (I-4) → the point has the answer`, "query.answered", { portalQueryItemId: q1 }, OP, APP, opId, (x) => x?.Response_Text === ans.Response_Text);
  if (it) t.check(`${dept}: the point has all four answer fields and OP_Progress 'In progress'`, !sameFields(it, ans).length && it.OP_Progress === "In progress", { diff: show(it, ans), OP_Progress: it.OP_Progress });
  // round 2: the raiser returns the answer
  const r2 = { Round_No: 2, Query_Key: `${opKey}-R2`, Question_Text: `ZZT night question R2 for ${dept} (fictional): please add the CoA`, Return_Reason: "Returned in the ZZT night test (fictional).", OP_Progress: "Open" };
  const w2 = await write(t, OP, APP, opId, r2, `${dept}: the return (round 2)`);
  t.check(`${dept}: the return (round 2) is accepted at the point's step`, w2.status === 200, w2.body);
  it = await applied(t, `${dept}: op.round → the point links its round-2 query`, "op.round", { opItemId: opId }, OP, APP, opId, (x) => x?.Portal_Query_Item_Id && x.Portal_Query_Item_Id !== q1);
  if (!it) return { opId, q1 };
  const q2 = it.Portal_Query_Item_Id;
  track("process", QRY, PORTAL, q2, `${opKey} query round 2 (created by op.round)`);
  q = await procGet(QRY, PORTAL, q2);
  t.check(`${dept}: the round-2 query has Round_No 2, its key and question, at 'Supplier: respond'`, Number(q?.Round_No) === 2 && q?.Query_Key === r2.Query_Key && q?.Question_Text === r2.Question_Text && q?._current_step === STEP.respond, { ...pick(q, ["Round_No", "Query_Key"]), ...brief(q) });
  const q1now = await procGet(QRY, PORTAL, q1);
  t.check(`${dept}: the answered round-1 query stays completed with its answer`, q1now?._status === "Completed" && q1now?.Response_Text === ans.Response_Text, brief(q1now));
  await refused(t, `${dept}: a replay of the round-1 query.answered is refused (the point waits on round 2)`, "query.answered", { portalQueryItemId: q1 }, [[OP, APP, opId]]);
  await refused(t, `${dept}: op.closed while the point has no outcome is refused (its query stays)`, "op.closed", { opItemId: opId }, [[QRY, PORTAL, q2]]);
  // the raiser closes the point
  const close = { OP_Outcome: "Accepted", Outcome_Reason: "Accepted in the ZZT night test (fictional).", Closed_At: isoNow(), Closed_By: { _id: ME } };
  const wc = await write(t, OP, APP, opId, close, `${dept}: the close`);
  const sc = await stepSubmit(OP, APP, opId);
  t.check(`${dept}: closing (outcome + submit) completes the point`, wc.status === 200 && sc.status === 200 && sc.statusAfter === "Completed", { put: wc.status, submit: sc.status, statusAfter: sc.statusAfter, body: sc.body ?? wc.body });
  q = await applied(t, `${dept}: op.closed → the open round-2 query is completed`, "op.closed", { opItemId: opId }, QRY, PORTAL, q2, (x) => x?._status === "Completed");
  await refused(t, `${dept}: op.edited on the closed point is refused`, "op.edited", { opItemId: opId }, [[QRY, PORTAL, q2]]);
  await refused(t, `${dept}: op.round on the closed point is refused (no new query)`, "op.round", { opItemId: opId }, [[OP, APP, opId]]);
  const all = (await search(QRY, PORTAL, opId)).filter((r) => r.App_Open_Point_Id === opId);
  for (const r of all) if (r._id !== q1 && r._id !== q2) track("process", QRY, PORTAL, r._id, "UNEXPECTED extra query");
  t.check(`${dept}: exactly two queries exist for the point`, all.length === 2, all.map((r) => r._id));
  return { opId, q1, q2 };
}
async function history(t, k, code) {
  const hist = [{ opKey: `${code}-OP-1`, round: 1, question: "ZZT question (fictional) – “Ä”", answer: "ZZT answer", outcome: "Accepted", at: isoNow() }, { opKey: `${code}-OP-2`, round: 2, question: "Second", answer: null, outcome: null, at: isoNow() }];
  const json = JSON.stringify(hist);
  const rq = await applied(t, "history.updated → the request's Questions_History_JSON", "history.updated", { caseItemId: k.caseId, questionsHistoryJson: json }, RQ, PORTAL, k.reqId, (x) => !sameFields(x, { Questions_History_JSON: json }).length);
  if (rq) t.check("the history reads back exactly and parses", parses(rq.Questions_History_JSON), rq.Questions_History_JSON?.slice(0, 200));
  await refused(t, "history.updated with text that is not JSON is refused", "history.updated", { caseItemId: k.caseId, questionsHistoryJson: "not json {" }, [[RQ, PORTAL, k.reqId]]);
  await refused(t, "history.updated with a JSON object (not a list) is refused", "history.updated", { caseItemId: k.caseId, questionsHistoryJson: '{"a":1}' }, [[RQ, PORTAL, k.reqId]]);
  return json;
}

// ---------------------------------------------------------------------------------------------------- release
async function releaseRequested(t, k, label = "") {
  const pre = await adminUpdate(RQ, PORTAL, k.reqId, { Release_At: isoNow(), Release_By_Name: "Earlier round (fictional)" });
  t.check(`${label}seeded an earlier round's Release_At / Release_By_Name on the request (admin) to prove the clear`, pre === 200, pre);
  const rq = await applied(t, `${label}release.requested (I-5) → the request asks for the final release`, "release.requested", { caseItemId: k.caseId }, RQ, PORTAL, k.reqId, (x) => x?.Release_Flag === "Requested" && !x?.Release_At);
  if (rq) {
    t.check(`${label}the request is locked, labelled, has its release contact and no earlier release`, rq.Request_Locked === "Yes" && rq.Case_Phase_Label === "Awaiting your final release" && ids(rq.Release_Contacts) === ME && !rq.Release_At && !rq.Release_By_Name,
      pick(rq, ["Request_Locked", "Case_Phase_Label", "Release_Contacts", "Release_At", "Release_By_Name"]));
    const c = await procGet(CASE, APP, k.caseId);
    t.check(`${label}the case has Release_Requested_At (now, no milliseconds)`, recent(c?.Release_Requested_At) && noMs(c?.Release_Requested_At), c?.Release_Requested_At);
  }
  if (PASS >= 2) {
    const sub = await stepSubmit(RQ, PORTAL, k.reqId);
    t.check(`${label}the supplier's move (submit only: Keep_Open_Gate is a formula, P-2) takes the request to 'give the final release', assigned to the release contact`,
      sub.status === 200 && sub.to === STEP.give && ids(sub.after?._current_assigned_to) === ME, { submit: sub.status, to: sub.to, body: sub.body });
    return rq;
  }
  if (!label) {
    const early = await stepSubmit(RQ, PORTAL, k.reqId);
    t.check("Kissflow refuses the 'keep up to date' submit without Keep_Open_Gate (Mandatory)", early.status !== 200 && early.to === STEP.keep, { status: early.status, to: early.to });
  } else t.check(`${label}info: Keep_Open_Gate before the screen writes it again`, true, (await procGet(RQ, PORTAL, k.reqId))?.Keep_Open_Gate ?? null);
  const w = await stepPut(RQ, PORTAL, k.reqId, { Keep_Open_Gate: "release" });
  const sub = await stepSubmit(RQ, PORTAL, k.reqId);
  t.check(`${label}the supplier's move (gate + submit, plan option a) takes the request to 'give the final release', assigned to the release contact`,
    w.status === 200 && sub.status === 200 && sub.to === STEP.give && ids(sub.after?._current_assigned_to) === ME, { put: w.status, submit: sub.status, to: sub.to, body: sub.body ?? w.body });
  return rq;
}
async function reopen(t, k) {
  const rq = await applied(t, "review.reopened (I-6) → the request is flagged Reopened, unlocked, 'With Beiersdorf'", "review.reopened", { caseItemId: k.caseId }, RQ, PORTAL, k.reqId, (x) => x?.Release_Flag === "Reopened");
  if (rq) t.check("the request is unlocked and labelled 'With Beiersdorf'", rq.Request_Locked === "No" && rq.Case_Phase_Label === "With Beiersdorf", pick(rq, ["Request_Locked", "Case_Phase_Label"]));
  await refused(t, "a second review.reopened is refused (the release is no longer requested)", "review.reopened", { caseItemId: k.caseId }, [[RQ, PORTAL, k.reqId]]);
  const marker = { Release_By_Name: "Reopened by Beiersdorf (marker)", Release_At: isoNow() };
  const w = await write(t, RQ, PORTAL, k.reqId, marker, "the reopen marker at the release step");
  const sub = await stepSubmit(RQ, PORTAL, k.reqId);
  t.check("submitting 'give the final release' while Reopened takes the go-to back to 'keep the CIQ up to date'", w.status === 200 && sub.status === 200 && sub.to === STEP.keep, { put: w.status, submit: sub.status, to: sub.to, body: sub.body ?? w.body });
  await refused(t, "release.given while Reopened is refused: the case stays open", "release.given", { portalRequestItemId: k.reqId }, [[CASE, APP, k.caseId]]);
}
async function releaseGiven(t, k) {
  const rel = { Release_By_Name: SUP_NAME, Release_At: isoNow(), ...(PASS === 3 ? { Release_By_Email: SUP, Release_By_Role: "Coordinator" } : {}) }; // the e-mail and role: 21 Oct
  if (PASS === 1) {
    const early = await stepSubmit(RQ, PORTAL, k.reqId);
    t.check("Kissflow refuses the release submit without Release_By_Name / Release_At (Mandatory)", early.status !== 200 && early.to === STEP.give, { status: early.status, to: early.to });
  }
  const w = await write(t, RQ, PORTAL, k.reqId, rel, "the supplier's final release");
  const sub = await stepSubmit(RQ, PORTAL, k.reqId);
  t.check("the supplier's release (fields + submit) takes the request to 'view the released CIQ'", w.status === 200 && sub.status === 200 && sub.to === STEP.view, { put: w.status, submit: sub.status, to: sub.to, body: sub.body ?? w.body });
  const rq = await procGet(RQ, PORTAL, k.reqId);
  t.check("the request reads back the release", !sameFields(rq, rel).length, show(rq, rel));
  const c = await applied(t, "release.given (I-7) → the case is completed", "release.given", { portalRequestItemId: k.reqId }, CASE, APP, k.caseId, (x) => x?._status === "Completed");
  if (c) {
    const want = { Final_Release_Confirm: "Confirmed", Final_Release_By_Name: rel.Release_By_Name, Final_Release_At: rel.Release_At, Case_Phase: "Completed",
      ...(PASS === 3 ? { Final_Release_By_Email: SUP, Final_Release_By_Role: "Coordinator" } : {}) };
    t.check("the case has Final_Release_* and phase 'Completed'", !sameFields(c, want).length, show(c, want));
  }
  await refused(t, "a second release.given is refused (the case is completed)", "release.given", { portalRequestItemId: k.reqId }, [[CASE, APP, k.caseId]]);
  return rel;
}
async function changeReport(t, k) {
  if (PASS !== 3) await readOnlyGuard(t, k, STEP.view, { Answers_JSON: '{"forged":true}', Release_At: isoNow() });
  const cr = { Change_Report_Text: "ZZT change report after the release (fictional): new supplier site – “Ä”", Change_Report_Rev: 1, Change_Report_By_Email: SUP, Change_Report_At: isoNow() };
  const w = await write(t, RQ, PORTAL, k.reqId, cr, "the supplier's change report");
  if (PASS === 1) t.check("the supplier's change report is accepted at 'view the released CIQ'", w.status === 200, w.body);
  const c = await applied(t, "request.changed after the release → the completed case has the change report", "request.changed", { portalRequestItemId: k.reqId }, CASE, APP, k.caseId, (x) => Number(x?.Change_Report_Rev) === 1);
  if (c) t.check("the case's change-report fields equal the request's and the case stays completed", !sameFields(c, cr).length && c._status === "Completed", { diff: show(c, cr), status: c._status });
}

// ---------------------------------------------------------------------------------------------------- pass 2 extras
/** The controlled check of P-1 on one request: the Uploads table carries its own step permission (Editable at keep,
 *  ReadOnly at view); a Details field is Editable at both steps but the Details section has no permission there. If the
 *  section decides, the table write follows the table's permission and the field write is refused. */
async function p1Probe(t, k, code, where) {
  const it = await procGet(RQ, PORTAL, k.reqId);
  const up = { Upload_Id: `${code}-P1-${where}`, Upload_Section_Key: "S01_GENERAL", Upload_Field_Key: "sds", Upload_Doc_Kind: "Other", Upload_File_Name: `zzt-p1-${where}.pdf`, Uploaded_By_Email: SUP, Uploaded_At: isoNow(), Upload_Attachment_Id: `${code}-P1-${where}` };
  const a = await stepPut(RQ, PORTAL, k.reqId, { [`Table::${UPLOADS}`]: [{ _is_created: true, ...up }] });
  const field = where === "keep" ? { Answers_Rev: Number(it?.Answers_Rev) || 0 } : { Change_Report_Text: it?.Change_Report_Text ?? "" }; // a no-op write of the current value
  const b = await stepPut(RQ, PORTAL, k.reqId, field);
  const back = await procGet(RQ, PORTAL, k.reqId);
  const stored = rowsOf(back, UPLOADS, "Upload_Id").some((r) => r.Upload_Id === up.Upload_Id);
  t.check(`P-1 probe at '${it?._current_step}': an Uploads row (the table is ${where === "keep" ? "Editable" : "ReadOnly"} here) is ${stored ? "stored" : "not stored"} (${a.status}); ${Object.keys(field)[0]} (Editable field, section without permission) answers ${b.status}`,
    stored === (where === "keep") && b.status !== 200, { upload: { status: a.status, code: a.body?.error_code }, field: { status: b.status, code: b.body?.error_code } });
}
/** Pass 3: an upload row at "keep" was proven before the release; after it the table is ReadOnly ("view"): refused. */
async function uploadAt(t, k, code) {
  const w = await stepPut(RQ, PORTAL, k.reqId, { [`Table::${UPLOADS}`]: [{ _is_created: true, Upload_Id: `${code}-UP-VIEW`, Upload_File_Name: "zzt-late.pdf", Uploaded_At: isoNow(), Uploaded_By_Email: SUP }] });
  const back = await procGet(RQ, PORTAL, k.reqId);
  t.check("after the release an upload is refused (the Uploads table is ReadOnly at 'view the released CIQ')", w.status !== 200 && !rowsOf(back, UPLOADS, "Upload_Id").some((r) => r.Upload_Id === `${code}-UP-VIEW`), { status: w.status, code: w.body?.error_code });
}
/** The supplier keeps the CIQ up to date after the completeness (Rev 5): the write, the read-back, request.changed. */
async function keepSave(t, k) {
  const data = answers(5, false);
  await write(t, RQ, PORTAL, k.reqId, data, "Rev 5 at 'keep the CIQ up to date'");
  const back = await procGet(RQ, PORTAL, k.reqId);
  t.check("Rev 5: the request reads back every answer field", !sameFields(back, data).length, show(back, data));
  const c = await applied(t, "Rev 5: request.changed → the case in review has Rev 5", "request.changed", { portalRequestItemId: k.reqId }, CASE, APP, k.caseId, (x) => Number(x?.Answers_Rev) === 5);
  if (c) t.check("Rev 5: the case's 15 synced fields equal the request's, and its completeness is kept", !sameFields(c, pick(back, SYNCED)).length && c.Completeness_Confirm === "Confirmed", show(c, pick(back, SYNCED)));
}

// ---------------------------------------------------------------------------------------------------- scenarios
async function chain(sid, code, { dept = "REG", dept2 = null, reopenRound = false, big = false, stopAt = "end" } = {}) {
  const STAGES = ["started", "filled", "confirmed", "points", "release", "reopened", "released", "end"];
  const upTo = (s) => STAGES.indexOf(s) <= STAGES.indexOf(stopAt);
  const k0 = await run(`${sid}.1`, `${code}: case created, started; I-1 creates the request (+ twins guard)`, async (t) => {
    const k = await startCase(t, code);
    const k2 = await i1(t, code, k);
    if (k2) await i1Twins(t, k2);
    return k2;
  });
  if (!k0?.reqId) return;
  const k = k0;
  if (upTo("filled")) await run(`${sid}.2`, `${code}: the supplier saves three revisions${big ? " (Rev 2 ~30 KB)" : ""}, uploads and removes a file; request.changed`, async (t) => {
    if (PASS !== 3) await readOnlyGuard(t, k, STEP.fill, { App_Case_Item_Id: "ZZT-FORGED-CASE", Release_Flag: "Requested", Request_Locked: "Yes", Case_Phase_Label: "Forged" }); // pass 3: Thomas accepted section-level Editable
    await supplierSaves(t, k, { big });
    await uploads(t, k, code);
  });
  if (upTo("confirmed")) await run(`${sid}.3`, `${code}: completeness confirmed and submitted; I-2`, async (t) => { await confirmCompleteness(t, k); });
  if (PASS >= 2 && upTo("points")) await run(`${sid}.3b`, `${code}: the supplier keeps the CIQ up to date (Rev 5)${PASS === 2 ? "; the P-1 probe at 'keep'" : ""}`, async (t) => {
    await keepSave(t, k);
    if (PASS === 2) await p1Probe(t, k, code, "keep");
  });
  if (upTo("points")) await run(`${sid}.4`, `${code}: open point(s) ${[dept, dept2].filter(Boolean).join(" + ")}: two rounds, edit, answer, close; history.updated`, async (t) => {
    const out = [await openPoint(t, k, code, dept)];
    if (dept2) out.push(await openPoint(t, k, code, dept2));
    await history(t, k, code);
    return out;
  });
  if (upTo("release")) await run(`${sid}.5`, `${code}: release.requested (I-5) and the supplier's move to the release step`, async (t) => { await releaseRequested(t, k); });
  if (reopenRound && upTo("reopened")) await run(`${sid}.6`, `${code}: review.reopened (I-6), the go-to back, and a second release.requested`, async (t) => {
    await reopen(t, k);
    await releaseRequested(t, k, "round 2: ");
  });
  if (upTo("released")) await run(`${sid}.7`, `${code}: the supplier's final release; I-7 completes the case`, async (t) => { await releaseGiven(t, k); });
  if (upTo("end")) await run(`${sid}.8`, `${code}: a change report after the release; request.changed on the completed case`, async (t) => {
    if (PASS === 2) await p1Probe(t, k, code, "view");
    if (PASS === 3) await uploadAt(t, k, code);
    await changeReport(t, k);
  });
}

async function cancelChain(sid, code, { confirm = false } = {}) {
  const k = await run(`${sid}.1`, `${code}: case started + I-1 (to be cancelled${confirm ? " in review" : " while filling in"})`, async (t) => {
    const k1 = await startCase(t, code);
    const k2 = await i1(t, code, k1);
    if (k2 && confirm) await confirmCompleteness(t, k2);
    return k2;
  });
  if (!k?.reqId) return;
  await run(`${sid}.2`, `${code}: case.cancelled guards, the cancel, and every supplier hand-off refused afterwards`, async (t) => {
    await refused(t, "case.cancelled with phaseLabel 'Completed' is refused", "case.cancelled", { caseItemId: k.caseId, phaseLabel: "Completed", locked: "Yes" }, [[RQ, PORTAL, k.reqId]]);
    await refused(t, "case.cancelled with locked 'No' is refused", "case.cancelled", { caseItemId: k.caseId, phaseLabel: "Cancelled", locked: "No" }, [[RQ, PORTAL, k.reqId]]);
    const rq = await applied(t, "case.cancelled → the request is labelled Cancelled and locked", "case.cancelled", { caseItemId: k.caseId, phaseLabel: "Cancelled", locked: "Yes" }, RQ, PORTAL, k.reqId, (x) => x?.Case_Phase_Label === "Cancelled" && x?.Request_Locked === "Yes");
    if (!rq) return;
    const st = await adminUpdate(RQ, PORTAL, k.reqId, { ...answers(9, false), Completeness_Confirm: "Confirmed", Completeness_By_Name: SUP_NAME, Completeness_By_Email: SUP, Completeness_At: isoNow(), Release_Flag: "Requested", Release_By_Name: SUP_NAME, Release_At: isoNow() });
    t.check("seeded the cancelled request with answers, a confirmation and a release (admin) so each guard is really exercised", st === 200, st);
    await refused(t, "request.changed on a cancelled request is refused: the case is unchanged", "request.changed", { portalRequestItemId: k.reqId }, [[CASE, APP, k.caseId]]);
    if (!confirm) await refused(t, "completeness.confirmed on a cancelled request is refused", "completeness.confirmed", { portalRequestItemId: k.reqId }, [[CASE, APP, k.caseId]]);
    await refused(t, "release.given on a cancelled request is refused: the case stays open", "release.given", { portalRequestItemId: k.reqId }, [[CASE, APP, k.caseId]]);
    await refused(t, "review.reopened on a cancelled request is refused", "review.reopened", { caseItemId: k.caseId }, [[RQ, PORTAL, k.reqId]]);
  });
}

async function forged(sid, code) {
  const k = await run(`${sid}.1`, `${code}: a case in review whose release Beiersdorf never asked for`, async (t) => {
    const k1 = await startCase(t, code);
    const k2 = await i1(t, code, k1);
    if (k2) await confirmCompleteness(t, k2);
    return k2;
  });
  if (!k?.reqId) return;
  await run(`${sid}.2`, `${code}: forged release, forged case link, unknown ids, I-1 on a draft and without contacts`, async (t) => {
    const st = await adminUpdate(RQ, PORTAL, k.reqId, { Release_Flag: "Requested", Release_By_Name: "Forger (fictional)", Release_At: isoNow() });
    t.check("seeded a forged release on the request (admin): flag, name and time, but no Release_Requested_At on the case", st === 200, st);
    await refused(t, "release.given without Beiersdorf's request is refused: the case stays open and unchanged", "release.given", { portalRequestItemId: k.reqId }, [[CASE, APP, k.caseId]]);
    const other = await startCase(t, `${code}-B`);
    const o = await i1(t, `${code}-B`, other);
    if (o) {
      const st2 = await adminUpdate(RQ, PORTAL, k.reqId, { App_Case_Item_Id: o.caseId });
      t.check("re-pointed the forged request at another case (admin)", st2 === 200, st2);
      await refused(t, "request.changed from a request the other case does not link is refused: that case is unchanged", "request.changed", { portalRequestItemId: k.reqId }, [[CASE, APP, o.caseId]]);
      const st3 = await adminUpdate(RQ, PORTAL, k.reqId, { App_Case_Item_Id: k.caseId, Release_Flag: null, Release_By_Name: null, Release_At: null });
      t.check("restored the request's own case link and cleared the forged release (admin)", st3 === 200, st3);
    }
    for (const [code2, payload, target] of [
      ["request.changed", { portalRequestItemId: "PkZZTNOSUCH0" }, [CASE, APP, k.caseId]], ["release.given", { portalRequestItemId: "PkZZTNOSUCH0" }, [CASE, APP, k.caseId]],
      ["case.started", { caseItemId: "PkZZTNOSUCH0" }, [CASE, APP, k.caseId]], ["release.requested", { caseItemId: "PkZZTNOSUCH0" }, [RQ, PORTAL, k.reqId]],
      ["history.updated", { caseItemId: "PkZZTNOSUCH0", questionsHistoryJson: "[]" }, [RQ, PORTAL, k.reqId]], ["op.round", { opItemId: "PkZZTNOSUCH0" }, [RQ, PORTAL, k.reqId]],
      ["query.answered", { portalQueryItemId: "PkZZTNOSUCH0" }, [RQ, PORTAL, k.reqId]], ["case.cancelled", { caseItemId: "PkZZTNOSUCH0", phaseLabel: "Cancelled", locked: "Yes" }, [RQ, PORTAL, k.reqId]],
    ]) await refused(t, `${code2} with an unknown id changes nothing`, code2, payload, [target]);
    const draft = await startCase(t, `${code}-D`, { submit: false });
    await hook("case.started", { caseItemId: draft.caseId });
    await sleep(WAIT_REFUSED);
    const d1 = await procGet(CASE, APP, draft.caseId), r1 = (await search(RQ, PORTAL, draft.caseId)).filter((r) => r.App_Case_Item_Id === draft.caseId);
    t.check("case.started for a draft case (never submitted) creates no request", !d1?.Portal_Request_Item_Id && !r1.length, { link: d1?.Portal_Request_Item_Id, requests: r1.map((r) => r._id) });
    const none = await startCase(t, `${code}-N`, { body: { Portal_Assignees_JSON: "[]" } });
    await hook("case.started", { caseItemId: none.caseId });
    await sleep(WAIT_REFUSED);
    const n1 = await procGet(CASE, APP, none.caseId), r2 = (await search(RQ, PORTAL, none.caseId)).filter((r) => r.App_Case_Item_Id === none.caseId);
    t.check("case.started for a case with no portal contact creates no request", !n1?.Portal_Request_Item_Id && !r2.length, { link: n1?.Portal_Request_Item_Id, requests: r2.map((r) => r._id) });
    for (const r of [...r1, ...r2]) track("process", RQ, PORTAL, r._id, "UNEXPECTED request from a refused case.started");
  });
}

async function reviews(sid, code, caseId) {
  await run(sid, `${code}: CIQ Review, one per department: activate, the department step, the app's admin writes`, async (t) => {
    for (const dept of ["REG", "SAF", "QM", "MIC", "SUS", "RMM"]) {
      const key = `${code}-REV-${dept}`;
      const body = { Review_Key: key, Case_Code: code, Cycle_No: 1, Case_Item_Id: caseId, Supplier_Code: "ZZT-SUP-NT", Trade_Name: "ZZT NightGlow Ester (fictional)", Review_Dept: dept, Round_No: 1,
        Activation_Kind: "Initial", Activation_Reason: "ZZT night test (fictional)", Activated_By_Name: "ZZT RMM Nacht (fictional)", Assignee_User: { _id: ME }, Assignee_Name: "ZZT Reviewer (fictional)",
        Assignee_Email: "reviewer.zzt@example.com", Track_Status: "In review", Open_Count: 0, RMES_Gaps: 0 };
      const r = await procCreate(REV, APP, body, `${key} review`);
      let it = await procGet(REV, APP, r._id);
      t.check(`${dept}: the review draft reads back every field`, !sameFields(it, body).length, show(it, body));
      const sub = await procSubmit(REV, APP, r._id, r._activity_instance_id);
      await sleep(1500);
      it = await procGet(REV, APP, r._id);
      t.check(`${dept}: activation moves the review to 'Review – ${DEPT_LABEL[dept] === "QM" ? "QM" : DEPT_LABEL[dept]}'`, sub.status === 200 && String(it?._current_step || "").startsWith("Review –") && it?._status === "InProgress", { status: sub.status, body: sub.body, now: brief(it) });
      t.check(`${dept}: info: who holds the department step (its reviewer role is empty tonight)`, true, it?._current_assigned_to ?? null);
      const upd = { Track_Status: "Waiting for supplier", Open_Count: 2, RMES_Gaps: 1, Reassign_Reason: "ZZT admin write (fictional)" };
      const st = await adminUpdate(REV, APP, r._id, upd);
      it = await procGet(REV, APP, r._id);
      t.check(`${dept}: the app's admin write of counters and status reads back`, st === 200 && !sameFields(it, upd).length, { status: st, diff: show(it, upd) });
    }
  });
}

async function forms(sid, caseId, code, opts = {}) {
  await run(`${sid}.audit`, "CIQ Audit Event: three events, every field, an update", async (t) => {
    for (const [i, cat] of ["Case", "Open point", "Final PDF"].entries()) {
      const body = { Event_Key: `${code}-EV${i + 1}`, Case_Code: code, Cycle_No: 1, Case_Item_Id: caseId, Event_At: isoNow(), Event_Category: cat, Action_Code: `zzt.${i}`, Actor_Side: ["BDF", "Supplier", "System"][i],
        Actor_Name: "ZZT Actor (fictional)", Actor_Email: "actor.zzt@example.com", Actor_Dept: "RMM", Object_Kind: "Case", Object_Key: code, Object_Item_Id: caseId, Object_State: "test",
        Old_Value_Text: "old – “Ä”", New_Value_Text: "new\nline 2", Source_Answers_Rev: 3, Event_Reason: "ZZT night test (fictional)", Snapshot_JSON: JSON.stringify({ case: { code }, i }) };
      const f = await formCreate("CIQ_Audit_Event_A00", APP, body, `${body.Event_Key} audit event`);
      let it = await formGet("CIQ_Audit_Event_A00", APP, f.id);
      t.check(`${cat}: the event is stored (submit ${f.submit}) and reads back every field`, f.submit === 200 && !sameFields(it, body).length, show(it, body));
      if (i === 0) {
        const st = await formUpdate("CIQ_Audit_Event_A00", APP, f.id, { Event_Reason: "updated (fictional)" });
        it = await formGet("CIQ_Audit_Event_A00", APP, f.id);
        t.check("an update of one field reads back and leaves the others", st === 200 && it?.Event_Reason === "updated (fictional)" && it?.Snapshot_JSON === body.Snapshot_JSON, { status: st, Event_Reason: it?.Event_Reason });
      }
    }
  });
  await run(`${sid}.note`, "CIQ Internal Note: two notes, mentions, an edit", async (t) => {
    for (const i of [1, 2]) {
      const body = { Note_Key: `${code}-NOTE${i}`, Case_Code: code, Cycle_No: 1, Case_Item_Id: caseId, Linked_Kind: "Case", Linked_Key: code, Note_Text: `ZZT internal note ${i} (fictional) – not for the supplier – “ß”`,
        Note_Author: { _id: ME }, Note_Dept: i === 1 ? "REG" : "SAF", Note_At: isoNow(), Note_Mentions_Emails: "a.zzt@example.com, b.zzt@example.com", Note_Mentions_Names: "ZZT A, ZZT B" };
      const f = await formCreate("CIQ_Internal_Note_A00", APP, body, `${body.Note_Key} internal note`);
      let it = await formGet("CIQ_Internal_Note_A00", APP, f.id);
      t.check(`note ${i}: stored and reads back every field`, f.submit === 200 && !sameFields(it, body).length, show(it, body));
      if (i === 2) {
        const st = await formUpdate("CIQ_Internal_Note_A00", APP, f.id, { Note_Text: "edited (fictional)" });
        it = await formGet("CIQ_Internal_Note_A00", APP, f.id);
        t.check("the edit reads back", st === 200 && it?.Note_Text === "edited (fictional)", { status: st, Note_Text: it?.Note_Text });
      }
    }
  });
  for (const [dept, form, prefix] of [["SAF", "CIQ_RMES_Safety_A00", "Safety"], ["REG", "CIQ_RMES_Regulatory_A00", "Regulatory"]]) {
    await run(`${sid}.rmes${dept}`, `CIQ RMES ${prefix}: header, two criteria and a finding (child tables), a row update, a row added`, async (t) => {
      const crit = (n, part) => ({ Criteria_Code: `${dept}-C${n}`, Criteria_Part: part, Criteria_Title: `ZZT criterion ${n} (fictional)`, Criteria_Applicable: "Yes", Criteria_Result: "Available",
        Criteria_Comment: "ok – “Ä”", Criteria_Recorded_By: { _id: ME }, Criteria_Recorded_At: isoNow(), Criteria_Reported_Value: 0.25, Criteria_Reported_Unit: "%", Criteria_Limit_Value: 1, Criteria_Limit_Comparator: "<=", Criteria_Limit_Pass: "Yes", Criteria_Open_Num: 0 });
      const header = { RMES_Key: `${code}-RMES-${dept}`, Case_Item_Id: caseId, Case_Code: code, Cycle_No: 1, Open_Criteria_Count: 0, Open_Blocking_Findings_Count: 1, RMES_Voided: "No" };
      const c1 = crit(1, "A"), c2 = crit(2, "B");
      const fd = { Findings_Key: `${dept}-F1`, Findings_Text: "ZZT finding (fictional)", Findings_Criterion_Code: c1.Criteria_Code, Findings_Blocking: "Yes", Findings_State: "Open" };
      const f = await formCreate(form, APP, { ...header, [`Table::${prefix}_Criteria`]: [c1, c2], [`Table::${prefix}_Findings`]: [fd] }, `${header.RMES_Key} RMES`);
      let it = await formGet(form, APP, f.id);
      let cr = rowsOf(it, `${prefix}_Criteria`, "Criteria_Code"), fr = rowsOf(it, `${prefix}_Findings`, "Findings_Key");
      t.check("the header reads back", f.submit === 200 && !sameFields(it, header).length, show(it, header));
      const g1 = cr.find((r) => r.Criteria_Code === c1.Criteria_Code), g2 = cr.find((r) => r.Criteria_Code === c2.Criteria_Code), gf = fr.find((r) => r.Findings_Key === fd.Findings_Key);
      t.check("both criteria rows read back every field", cr.length === 2 && g1 && g2 && !sameFields(g1, c1).length && !sameFields(g2, c2).length, { rows: cr.length, c1: g1 && show(g1, c1), c2: g2 && show(g2, c2) });
      t.check("the finding row reads back every field", fr.length === 1 && gf && !sameFields(gf, fd).length, { rows: fr.length, f: gf && show(gf, fd) });
      if (!g1) return;
      const st = await formUpdate(form, APP, f.id, { [`Table::${prefix}_Criteria`]: [{ _id: g1._id, Criteria_Result: "Not available", Criteria_Comment: "changed (fictional)" }] });
      it = await formGet(form, APP, f.id);
      cr = rowsOf(it, `${prefix}_Criteria`, "Criteria_Code");
      const h1 = cr.find((r) => r.Criteria_Code === c1.Criteria_Code), h2 = cr.find((r) => r.Criteria_Code === c2.Criteria_Code);
      t.check("a row update by its id changes that row only, adds none", st === 200 && cr.length === 2 && h1?.Criteria_Result === "Not available" && h2 && !sameFields(h2, c2).length, { status: st, rows: cr.length, c1: h1 && pick(h1, ["Criteria_Result", "Criteria_Comment"]) });
      const f2 = { ...fd, Findings_Key: `${dept}-F2`, Findings_Blocking: "No", Findings_Text: "second finding (fictional)" };
      const st2 = await formUpdate(form, APP, f.id, { [`Table::${prefix}_Findings`]: [{ _is_created: true, ...f2 }] });
      it = await formGet(form, APP, f.id);
      fr = rowsOf(it, `${prefix}_Findings`, "Findings_Key");
      t.check("a new finding row is added, the first one kept", st2 === 200 && fr.length === 2 && fr.some((r) => r.Findings_Key === f2.Findings_Key) && fr.some((r) => r.Findings_Key === fd.Findings_Key), { status: st2, keys: fr.map((r) => r.Findings_Key) });
    });
  }
  await run(`${sid}.scope`, "CIQ Scope Run: a run with JSON input and result", async (t) => {
    const body = { Run_Key: `${code}-RUN1`, Case_Code: code, Cycle_No: 1, Case_Item_Id: caseId, Run_No: 1, Scope_Trigger: "Initial", Related_Key: code, Release_Item_Id: "ZZT-REL-ITEM", Rule_Set_Version: "ZZT-RS-NT",
      Evaluator_Version: "zzt-1", Input_JSON: JSON.stringify({ origin: "plant", markets: ["EU", "US"] }), Input_Hash: "zzt-in", Result_JSON: JSON.stringify({ sections: ["S01", "S02"], lead: ["REG"] }),
      Added_Section_Keys: "S02", Lead_Departments: "REG, SAF", Run_By: { _id: ME }, Run_At: isoNow() };
    const f = await formCreate("CIQ_Scope_Run_A00", APP, body, `${body.Run_Key} scope run`);
    const it = await formGet("CIQ_Scope_Run_A00", APP, f.id);
    t.check("the run is stored and reads back every field", f.submit === 200 && !sameFields(it, body).length, show(it, body));
  });
  await run(`${sid}.supplier`, "CIQ Supplier: a supplier with two contacts (child table), a contact deactivated", async (t) => {
    const header = { Supplier_Code: opts.supplierCode ?? `${code}-SUP`, Supplier_Legal_Name: "ZZT Nachttest Lieferant AG (fictional)", DUNS_Number: "000000000", Supplier_Kind: "Manufacturer", Supplier_Country_Code: "DE", Supplier_Active: "Yes",
      Supplier_Test: "Yes", Supplier_City: "Hamburg", Contact_Portal_Ids_Text: opts.portalUserId ?? ME, Pending_Invites: 0 };
    const k1 = { Contacts_Key: `${code}-CT1`, Contacts_Full_Name: "ZZT Contact One (fictional)", Contacts_Email: "one.zzt@example.com", Contacts_Role: "Coordinator", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: opts.portalUserId ?? ME, Contacts_Active: "Yes", Contacts_Title: "QA" };
    const k2 = { ...k1, Contacts_Key: `${code}-CT2`, Contacts_Full_Name: "ZZT Contact Two (fictional)", Contacts_Email: "two.zzt@example.com", Contacts_Role: "Regulatory", Contacts_Can_Confirm: "No", Contacts_Portal_User_Id: "" };
    const f = await formCreate("CIQ_Supplier_A00", APP, { ...header, "Table::Contacts": [k1, k2] }, `${header.Supplier_Code} supplier`);
    let it = await formGet("CIQ_Supplier_A00", APP, f.id);
    let rows = rowsOf(it, "Contacts", "Contacts_Key");
    const g1 = rows.find((r) => r.Contacts_Key === k1.Contacts_Key), g2 = rows.find((r) => r.Contacts_Key === k2.Contacts_Key);
    t.check("the supplier header reads back", f.submit === 200 && !sameFields(it, header).length, show(it, header));
    t.check("both contacts read back every field", rows.length === 2 && g1 && g2 && !sameFields(g1, k1).length && !sameFields(g2, { ...k2, Contacts_Portal_User_Id: null }).length, { rows: rows.length, c1: g1 && show(g1, k1), c2: g2 && show(g2, k2) });
    if (!g2) return;
    const off = { Contacts_Active: "No", Contacts_Deactivated_At: isoNow() };
    const st = await formUpdate("CIQ_Supplier_A00", APP, f.id, { "Table::Contacts": [{ _id: g2._id, ...off }] });
    it = await formGet("CIQ_Supplier_A00", APP, f.id);
    rows = rowsOf(it, "Contacts", "Contacts_Key");
    const h2 = rows.find((r) => r.Contacts_Key === k2.Contacts_Key);
    t.check("deactivating one contact changes that row only", st === 200 && rows.length === 2 && h2 && !sameFields(h2, off).length, { status: st, rows: rows.length, c2: h2 && pick(h2, Object.keys(off)) });
  });
  await run(`${sid}.help`, "CIQP Help Article (portal, seen by suppliers): created, read back, deleted at once", async (t) => {
    const body = { Article_Title: "ZZT-NT test article (fictional) – deleted at once", Article_Body: "ZZT night test (fictional).\nLine 2 – “Ä”", Sort_Order: 999 };
    const f = await formCreate("CIQP_Help_Article_A00", PORTAL, body, "ZZT-NT help article");
    const it = await formGet("CIQP_Help_Article_A00", PORTAL, f.id);
    t.check("the article is stored and reads back every field", f.submit === 200 && !sameFields(it, body).length, show(it, body));
    const d = await formDelete("CIQP_Help_Article_A00", PORTAL, f.id);
    if (f.draftId !== f.id) await formDelete("CIQP_Help_Article_A00", PORTAL, f.draftId);
    t.check("the article is deleted (GET 404)", d.after === 404, d);
    if (d.after === 404) { markDeleted(f.id, "DELETE " + d.delete + ", GET 404"); if (f.draftId !== f.id) markDeleted(f.draftId, "with its item"); }
  });
}

/** Re-reads every item the night created: its flow name, JSON fields parse, times without milliseconds. */
async function scan(sid) {
  await run(sid, "every item created tonight, re-read: flow, JSON, times", async (t) => {
    const bad = [];
    let n = 0;
    for (const x of manifest.items.filter((i) => !i.deleted && !/\(draft\)$/.test(i.note))) {
      const it = x.kind === "form" ? await formGet(x.flow, x.app, x.id) : await procGet(x.flow, x.app, x.id);
      n++;
      if (!it) { bad.push({ id: x.id, flow: x.flow, problem: "not readable" }); continue; }
      const probs = [];
      if (it._flow_name && !/^CIQP? /.test(it._flow_name)) probs.push(`flow name ${it._flow_name}`);
      for (const [f, v] of Object.entries(it)) {
        if (/_JSON$/.test(f) && typeof v === "string" && !parses(v)) probs.push(`${f} does not parse`);
        if (/_At$/.test(f) && typeof v === "string" && !noMs(v)) probs.push(`${f} has milliseconds`);
        if (typeof v === "string" && /<html|�/i.test(v)) probs.push(`${f} holds HTML or broken characters`);
      }
      if (probs.length) bad.push({ id: x.id, flow: x.flow, probs });
    }
    t.check(`all ${n} items read back cleanly`, !bad.length, bad);
  });
}

// ---------------------------------------------------------------------------------------------------- main
// The helpers are shared with run3.mjs (the gap pass); the main sequence runs only when this file is started itself.
export { CASE, RQ, QRY, OP, REV, UPLOADS, ME, ME_LIST, SUP, SUP_NAME, STEP, SYNCED, I1_COPY, WAIT_REFUSED, pick, ids, brief, stable, diffKeys, show, rowsOf, recent,
  search, actFor, stepPut, stepSubmit, applied, refused, run, caseBody, answers, startCase, i1, confirmCompleteness };
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) try {
  const t0 = Date.now();
  await chain("R1", "ZZT-NT-R1", { dept: "REG" });
  await chain("R2", "ZZT-NT-R2", { dept: "SAF", dept2: "QM", reopenRound: true, big: true });
  await chain("R3", "ZZT-NT-R3", { dept: "MIC", dept2: "SUS", reopenRound: true });
  await cancelChain("X1", "ZZT-NT-X1");
  await cancelChain("X2", "ZZT-NT-X2", { confirm: true });
  await forged("F1", "ZZT-NT-F1");
  PASS = 2;
  await chain("S1", "ZZT-NT-S1", { dept: "REG" });
  const s1 = results.scenarios["S1.1"]?.out;
  if (s1?.caseId) {
    await reviews("V1", "ZZT-NT-S1", s1.caseId);
    await forms("FM", s1.caseId, "ZZT-NT-FM");
  }
  await chain("S2", "ZZT-NT-S2", { dept: "SAF", dept2: "QM", reopenRound: true, big: true });
  // the gallery: one case left at each stage for Thomas to look at
  await chain("G1", "ZZT-NT-G1-STARTED", { stopAt: "started" });
  await chain("G2", "ZZT-NT-G2-FILLED", { stopAt: "filled" });
  await chain("G3", "ZZT-NT-G3-CONFIRMED", { stopAt: "confirmed" });
  await chain("G4", "ZZT-NT-G4-RELEASE-ASKED", { dept: "RMM", stopAt: "release" });
  await chain("G5", "ZZT-NT-G5-REOPENED-REASKED", { reopenRound: true, stopAt: "reopened" });
  await chain("S3", "ZZT-NT-S3", { dept: "MIC", dept2: "RMM", reopenRound: true });
  // pass 3 (21 Oct afternoon): after Thomas's permission fix, every screen write on the user route itself
  PASS = 3;
  await chain("U1", "ZZT-NT-U1", { dept: "REG", dept2: "SUS" });
  await chain("U2", "ZZT-NT-U2", { dept: "SAF", dept2: "QM", reopenRound: true, big: true });
  // night 21-22 Oct (Thomas: "run tests again … create items at different steps"): fresh items on the user route, left in
  // place for him (the earlier ones are cleaned up); after the A3 hardening of the app session's six integrations
  await chain("N1", "ZZT-NT2-N1", { dept: "RMM", dept2: "MIC" });
  await chain("N2", "ZZT-NT2-N2", { dept: "REG", dept2: "QM", reopenRound: true, big: true });
  await cancelChain("NX1", "ZZT-NT2-NX1");
  await cancelChain("NX2", "ZZT-NT2-NX2", { confirm: true });
  await forged("NF1", "ZZT-NT2-NF1");
  await chain("NG1", "ZZT-NT2-STAGE1-STARTED", { stopAt: "started" });
  await chain("NG2", "ZZT-NT2-STAGE2-FILLED", { stopAt: "filled" });
  await chain("NG3", "ZZT-NT2-STAGE3-IN-REVIEW", { stopAt: "confirmed" });
  await chain("NG4", "ZZT-NT2-STAGE4-RELEASE-ASKED", { dept: "SAF", stopAt: "release" });
  await chain("NG5", "ZZT-NT2-STAGE5-REOPENED", { dept: "SUS", reopenRound: true, stopAt: "reopened" });
  await chain("NG6", "ZZT-NT2-STAGE6-RELEASED", { dept: "QM", stopAt: "released" });
  // N2 ran while a second copy of this runner was running (01:30-02:31, every write doubled): a clean re-run
  await chain("N3", "ZZT-NT2-N3", { dept: "REG", dept2: "QM", reopenRound: true, big: true });
  // the reviews, audit rows and the case's own supplier go on the completed N3 (N1 already has its PDF), so the final-PDF
  // service can then be proven on a case with reviews, audit rows and a supplier row
  const n3 = results.scenarios["N3.1"]?.out, n1 = results.scenarios["N1.1"]?.out;
  const [vCode, vCase] = n3?.caseId && results.scenarios["N3.7"]?.pass ? ["ZZT-NT2-N3", n3.caseId] : ["ZZT-NT2-N1", n1?.caseId];
  if (vCase) {
    await reviews("NV1", vCode, vCase);
    // a fictional portal user id: a second supplier carrying Thomas's own portal user takes his dev self contact off "ZZT Dev Supplier"
    await forms("NFM", vCase, "ZZT-NT2-FM", { supplierCode: "ZZT-SUP-NT", portalUserId: "UsZZTNIGHT001" });
  }
  await scan("NSCAN");
  await scan("SCAN");
  const all = Object.values(results.scenarios), checks = all.flatMap((s) => s.checks);
  console.log(`\nDONE in ${Math.round((Date.now() - t0) / 60000)} min, ${callCount()} calls: ${all.filter((s) => s.pass).length}/${all.length} scenarios pass, ${checks.filter((c) => c.pass).length}/${checks.length} checks`);
} catch (e) {
  if (e instanceof RateLimited) { console.log(`RATE LIMITED: ${e.message}. Stop 20 minutes, then rerun.`); saveResults(); process.exit(75); }
  throw e;
}
