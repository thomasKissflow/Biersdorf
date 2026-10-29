#!/usr/bin/env node
// DRAFT (not run; written by the e2e design step, 29 Oct). The dev end-to-end test of the event-driven final PDF:
//   supplier's final release (user route, as the portal writes it) -> I-7 completes the case -> app integration 1
//   ("CIQ Case Item exits final step - final release PDF Email") POSTs the case id to the Apps Script web app -> the script
//   files the PDF on CIQ_Case_A00.Final_PDF and CIQP_Request_A00.Final_PDF, writes the hash and the FD-PDF audit row ->
//   the script calls app integration 2 ("CIQ Case - Send Final Release to RMM") -> e-mail with the PDF to the RMM role.
// Usage (Development sandbox only):
//   node e2e-fd-event.mjs preflight                       reads only (GET + one form-list POST)
//   node e2e-fd-event.mjs release --consume-case          T1-T5: the release writes + the I-7 hand-off (irreversible)
//   node e2e-fd-event.mjs watch                           L1-L4: read-only polls, timings, checks
//   node e2e-fd-event.mjs prepare-fallback --consume-case  E2E-28 (or CASE/REQ env): release.requested hook + keep submit
// Env: CASE (default PkEPcDsJ2BhM), REQ (default PkEPcEZhdCwx), CODE (default ZZT-NT2-STAGE4-RELEASE-ASKED), OUT (state dir).
// Rules: one sequential caller, >= 3 s between Kissflow calls, no retry; a 429 or an HTML answer stops the run (exit 75:
// both sessions pause 20 min). Never prints a key, token, webhook URL, signed download URL or e-mail address.
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { client, loadEnv } from "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/kissflow-build/lib/kf.mjs";

const ROOT = "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf";
const OUT = process.env.OUT || "/private/tmp/claude-502/-Users-thomas-Documents-Kissflow-Projects-POC-Beiersdorf/9266c591-0569-4b0c-8f6b-ff391fa10dff/scratchpad/evdesign/e2e/run";
const APP = "CIQ_Digital_A00", PORTAL = "CIQ_Supplier_Portal_A00";
const CASE_FLOW = "CIQ_Case_A00", REQ_FLOW = "CIQP_Request_A00", AUDIT = "CIQ_Audit_Event_A00";
const I7 = "CIQP_Final_release_to_case_A00", INT1 = "CIQ_Case_Item_exits_final_step_fin_A00", INT2 = "CIQ_Case_Send_Final_Release_to_RMM_A00";
const ROLE_INTEGRATION = "RoEKl89I5nGx", ROLE_RMM = "RoEKl83f9jPF", THOMAS = "UsEJUfjYLM8Y";
const ACT = { review: "Activity_gwgj5o", keep: "Activity_1mhx3t7", give: "Activity_wlo2cfxnqa", view: "Activity_vngcws1q8w" };
const CASE = process.env.CASE || "PkEPcDsJ2BhM", REQ = process.env.REQ || "PkEPcEZhdCwx", CODE = process.env.CODE || "ZZT-NT2-STAGE4-RELEASE-ASKED";
const PDF_NAME = `${CODE}-final-document.pdf`, FD_KEY = `${CODE}-FD-PDF`;
const SUP = { name: "ZZT Supplier Nacht (fictional)", email: "zzt.supplier.night@example.com", role: "Coordinator" };
const PACE_MS = 3000;

const kf = client({ readOnly: false });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("refused: not the Development sandbox");
mkdirSync(OUT, { recursive: true });
const STATE = `${OUT}/state-${CASE}.json`;
const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { case: CASE, request: REQ, code: CODE, t: {}, checks: [] };
const save = () => writeFileSync(STATE, JSON.stringify(st, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const scrub = (v) => JSON.stringify(v ?? null)
  .replace(/https?:\/\/[^"\s]+/g, "<url>")
  .replace(/[^"\s@,;]+@[^"\s@,;]+\.[A-Za-z]{2,}/g, "<email>")
  .replace(/[A-Za-z0-9_\-]{32,}/g, "<tok>")
  .slice(0, 400);
const check = (label, pass, detail) => {
  st.checks.push({ at: isoNow(), label, pass: !!pass, detail: detail === undefined ? undefined : scrub(detail) });
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label}${pass || detail === undefined ? "" : " - " + scrub(detail)}`);
  save();
  return !!pass;
};
let last = 0, calls = 0;
async function call(method, path, body) {
  const wait = last + PACE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  calls++;
  const r = await kf.call(method, path, body, { retries: 0 });
  appendFileSync(`${OUT}/requests.jsonl`, JSON.stringify({ at: isoNow(), method, path: path.split("?")[0], status: r.status }) + "\n");
  if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) {
    console.log(`STOP: ${r.status} on ${method} ${path.split("?")[0]}. Both sessions pause 20 min.`);
    save();
    process.exit(75);
  }
  return r;
}
const get = (p) => call("GET", p);
const caseGet = async () => (await get(`/process/2/${kf.acc}/admin/${CASE_FLOW}/${CASE}?_application_id=${APP}`)).body;
const reqGet = async () => (await get(`/process/2/${kf.acc}/admin/${REQ_FLOW}/${REQ}?_application_id=${PORTAL}`)).body;
const ctxOf = (it) => it?._current_context?.[0] || {};
const files = (it, f = "Final_PDF") => (Array.isArray(it?.[f]) ? it[f] : []);
const ids = (l) => (Array.isArray(l) ? l : []).map((u) => u?._id ?? u).filter(Boolean).sort().join(",");
const sameInstant = (a, b) => Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);

// ---- run history (field names tolerant: _id, IntegrationId, IntegrationName, State/Status, a created time) ----
const rowsOf = (b) => (Array.isArray(b) ? b : b?.Data || []);
const runIntegration = (x) => x.IntegrationId || x._integration_id || x.FlowId || "";
const runAt = (x) => x._created_at || x.StartedAt || x.CreatedAt || x._modified_at || "";
async function runs(app, integ, sinceIso) {
  const r = await get(`/integration/2/${kf.acc}/history?page_number=1&page_size=30&apply_preference=false&_application_id=${app}`);
  const since = Date.parse(sinceIso || 0) - 5000;
  return rowsOf(r.body).filter((x) => runIntegration(x) === integ && Date.parse(runAt(x)) >= since);
}
async function steps(app, integ, runId) {
  const r = await get(`/integration/2/${kf.acc}/history/${integ}/instance/${runId}?_application_id=${app}`);
  return rowsOf(r.body?.ActionInstance ? r.body.ActionInstance : r.body);
}
/** Only safe keys of a step output: never a payload (URLs, tokens, addresses live there). */
const SAFE = ["ok", "status", "Status", "statusCode", "StatusCode", "_id", "_status", "Success", "Case_Code"];
const safeOut = (o) => (o && typeof o === "object" ? Object.fromEntries(Object.keys(o).map((k) => [k, SAFE.includes(k) ? o[k] : Array.isArray(o[k]) ? `list(${o[k].length})` : typeof o[k]])) : typeof o);
const stepLine = (a) => `${String(a.Name || a.ActionName || "").padEnd(34)} ${String(a.State ?? "").padEnd(10)} ${String(a.Status ?? "").padEnd(10)} ${a.ErrorMessage ? scrub(a.ErrorMessage) : ""}`;
async function until(label, fn, everyMs, maxMs) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return { v, ms: Date.now() - t0 };
    if (Date.now() - t0 > maxMs) { console.log(`  · timed out after ${Math.round(maxMs / 1000)} s: ${label}`); return { v: null, ms: Date.now() - t0 }; }
    await sleep(Math.max(0, everyMs - PACE_MS));
  }
}

// ---- the hand-off post (as the portal screen posts it: text/plain JSON, ids only) ----
function hookUrl(code) {
  const s = JSON.parse(readFileSync(`${ROOT}/kissflow-build/night-2026-10-20/integrations/state.json`, "utf8"));
  const url = s.integrations?.[code]?.webhookUrl;
  if (!url || !/^https:\/\/dev-beiersdorf\.kissflow\.eu\/integration\/2\/AcDOSunMEpSA\/webhook\//.test(url)) throw new Error(`no dev webhook for ${code}`);
  return url; // never printed
}
async function hook(code, payload) {
  await sleep(Math.max(0, last + PACE_MS - Date.now()));
  last = Date.now();
  const r = await fetch(hookUrl(code), { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ ...payload, idempotencyKey: `ZZT-E2E-FD-${code}-${Date.now().toString(36)}` }) });
  appendFileSync(`${OUT}/requests.jsonl`, JSON.stringify({ at: isoNow(), hook: code, payload, status: r.status }) + "\n");
  return r.status;
}

// ---- a filed attachment's bytes: admin GET -> 302 -> the signed URL (redirect manual on both hops, URL never printed) ----
async function attachmentSha(flow, app, id, attId) {
  const env = loadEnv();
  const h = { "X-Access-Key-Id": env.KF_ACCESS_KEY_ID, ["X-Access-Key-" + "Secret"]: env["KF_ACCESS_KEY_" + "SECRET"] };
  await sleep(Math.max(0, last + PACE_MS - Date.now())); last = Date.now(); calls++;
  const a = await fetch(`https://${kf.domain}/process/2/${kf.acc}/admin/${flow}/${id}/Final_PDF/attachment/${attId}?_application_id=${app}`, { headers: h, redirect: "manual" });
  const loc = a.headers.get("location");
  if (a.status < 300 || a.status >= 400 || !loc) return { error: `download ${a.status}` };
  const u = new URL(loc, `https://${kf.domain}`);
  await sleep(PACE_MS); last = Date.now();
  const f = await fetch(u, { headers: u.host === kf.domain ? h : {}, redirect: "manual" });
  if (f.status !== 200) return { error: `signed download ${f.status}` };
  const bytes = Buffer.from(await f.arrayBuffer());
  const seal = /\/Subject \(document seal ([0-9a-f]{16})\)/.exec(bytes.toString("latin1"))?.[1] || "";
  return { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), seal };
}

// =============================================================================================== phases
async function preflight() {
  console.log(`== preflight ${CODE} (case ${CASE}, request ${REQ})`);
  const c = await caseGet();
  check("P1 case InProgress at 'Beiersdorf review and final release'", c?._status === "InProgress" && ctxOf(c)._context_activity_id === ACT.review, { status: c?._status, step: c?._current_step });
  check("P1 case: Review, completeness confirmed, release requested, linked to the request", c?.Case_Phase === "Review" && c?.Completeness_Confirm === "Confirmed" && !!c?.Release_Requested_At && c?.Portal_Request_Item_Id === REQ, { phase: c?.Case_Phase, rr: c?.Release_Requested_At, link: c?.Portal_Request_Item_Id });
  check("P1 case: no final release, PDF or hash yet", !c?.Final_Release_At && !files(c).length && !c?.Final_Document_Hash, { fra: c?.Final_Release_At ?? null, pdf: files(c).length, hash: !!c?.Final_Document_Hash });
  const q = await reqGet();
  st.giveAct = ctxOf(q)._context_activity_instance_id;
  check("P2 request InProgress at 'Supplier: give the final release', assigned to Thomas", q?._status === "InProgress" && ctxOf(q)._context_activity_id === ACT.give && ids(q?._current_assigned_to) === THOMAS, { step: q?._current_step, act: st.giveAct, to: ids(q?._current_assigned_to) });
  check("P2 request: Release_Flag Requested, no release yet, linked to the case, no Final_PDF", q?.Release_Flag === "Requested" && !q?.Release_At && !q?.Release_By_Name && q?.App_Case_Item_Id === CASE && !files(q).length, { flag: q?.Release_Flag, at: q?.Release_At ?? null, link: q?.App_Case_Item_Id });
  for (const [app, want] of [[PORTAL, [I7]], [APP, [INT1, INT2]]]) {
    const r = await get(`/flow/2/${kf.acc}/integration/?_application_id=${app}&page_number=1&page_size=200`);
    for (const id of want) { const x = rowsOf(r.body).find((y) => y._id === id); check(`P3 integration ${id} published and ON`, !!x?.IsActive && /publish/i.test(String(x?.Status)), { status: x?.Status, active: x?.IsActive }); }
  }
  for (const id of [INT1, INT2]) {
    const d = (await get(`/metadata/2/${kf.acc}/integration/${id}/draft`)).body || {};
    const root = d[d.Root] || {};
    const all = [...(root["Integration::Trigger"] || []), ...(root["Integration::Action"] || [])].map((e) => d[e]).filter(Boolean);
    check(`P4 ${id}: every step tested`, all.length >= 2 && all.every((e) => e.IsTested === true), all.map((e) => `${e.Name}:${e.IsTested ? "tested" : "NOT tested"}`));
    if (id === INT1) {
      const http = all.find((e) => e.Connector?.ActionId === "POSTCall");
      const blob = JSON.stringify(Object.values(d).filter((e) => e && (e.Action === http?.Id || e.FieldMapping)));
      check("P4 integration 1: the HTTP step points at an Apps Script web app (host only) and maps the trigger's _id", !!http && /script\.google\.com\/macros\/s\/[^"\/]+\/exec/.test(blob) && blob.includes("context.Trigger_CDWGsX1igS._id"), { http: !!http, host: /script\.google\.com/.test(blob) });
    }
  }
  for (const [role, label] of [[ROLE_INTEGRATION, "Integration service"], [ROLE_RMM, "Raw Material Manager (RMM)"]]) {
    const r = (await get(`/app_role/2/${kf.acc}/${role}?_application_id=${APP}`)).body || {};
    const users = r.Users || r.Members || [];
    check(`P5 role ${label}: Thomas is a member`, Array.isArray(users) && users.some((u) => (u._id ?? u) === THOMAS), { count: r.UserCount ?? (Array.isArray(users) ? users.length : "?") });
  }
  const rd = (await get(`/metadata/2/${kf.acc}/process/${REQ_FLOW}/draft`)).body || {};
  const fpdf = Object.values(rd).find((e) => e && e.Kind === "Field" && (e.Id === "Final_PDF" || e.Name === "Final PDF"));
  check("P6 CIQP_Request_A00 has the Final_PDF attachment field (permission per step: read in the design's own check)", !!fpdf, { type: fpdf?.Type ?? null });
  st.t.historyFrom = isoNow();
  const aud = await call("POST", `/form/2/${kf.acc}/${AUDIT}/list?page_number=1&page_size=100&q=${encodeURIComponent(CASE)}&_application_id=${APP}`, {});
  const mine = rowsOf(aud.body).filter((x) => x.Case_Item_Id === CASE);
  check(`P7 no ${FD_KEY} audit row yet`, !mine.some((x) => x.Event_Key === FD_KEY), { rows: mine.length });
  console.log(`preflight: ${st.checks.filter((x) => !x.pass).length} failed, ${calls} calls`);
  save();
}

async function release() {
  if (!process.argv.includes("--consume-case")) throw new Error("release completes the case for good: pass --consume-case after Thomas's OK");
  console.log(`== release ${CODE}`);
  const q0 = await reqGet();
  const act = ctxOf(q0)._context_activity_instance_id;
  if (ctxOf(q0)._context_activity_id !== ACT.give || q0?.Release_Flag !== "Requested" || q0?.Release_At) throw new Error("the request is not waiting for its release: run preflight");
  const rel = { Release_By_Name: SUP.name, Release_By_Email: SUP.email, Release_By_Role: SUP.role, Release_At: isoNow() };
  st.release = rel; st.t.t0 = rel.Release_At; save();
  const w = await call("POST", `/process/2/${kf.acc}/${REQ_FLOW}/${REQ}/${act}?_application_id=${PORTAL}`, rel);
  if (!check("T1 the release fields written at 'give the final release' (user route, as the assignee)", w.status === 200, { status: w.status, code: w.body?.error_code })) return;
  const q1 = await reqGet();
  check("T2 the request reads the release back", q1?.Release_By_Name === SUP.name && q1?.Release_By_Email === SUP.email && q1?.Release_By_Role === SUP.role && sameInstant(q1?.Release_At, rel.Release_At));
  const s = await call("POST", `/process/2/${kf.acc}/${REQ_FLOW}/${REQ}/${act}/submit?_application_id=${PORTAL}`, {});
  if (!check("T3 the release step submitted", s.status === 200, { status: s.status, code: s.body?.error_code })) return;
  const q2 = await reqGet();
  st.viewAct = ctxOf(q2)._context_activity_instance_id;
  check("T4 the request is held at 'Supplier: view the released CIQ', InProgress, still Requested", ctxOf(q2)._context_activity_id === ACT.view && q2?._status === "InProgress" && q2?.Release_Flag === "Requested", { step: q2?._current_step, status: q2?._status });
  const h = await hook("I7", { portalRequestItemId: REQ });
  st.t.hook = isoNow();
  check("T5 release.given (I-7) webhook accepted", h === 200, h);
  save();
}

async function watch() {
  console.log(`== watch ${CODE}`);
  const since = st.t.hook || st.t.historyFrom;
  // L1: I-7 completes the case (21 Oct: about 17 s after the release)
  const l1 = await until("case Completed", async () => { const c = await caseGet(); return c?._status === "Completed" ? c : null; }, 5000, 120000);
  const c = l1.v || (await caseGet());
  st.t.caseDone = c?._modified_at; save();
  check(`L1 I-7: the case is Completed (${Math.round(l1.ms / 1000)} s)`, !!l1.v && !c?._current_step, { status: c?._status, step: c?._current_step });
  check("L1 I-7: Final_Release_* from the request, Case_Phase Completed", c?.Final_Release_Confirm === "Confirmed" && c?.Final_Release_By_Name === st.release?.Release_By_Name && c?.Final_Release_By_Email === st.release?.Release_By_Email && c?.Final_Release_By_Role === st.release?.Release_By_Role && sameInstant(c?.Final_Release_At, st.release?.Release_At) && c?.Case_Phase === "Completed");
  const r7 = await runs(PORTAL, I7, since);
  check("L1 I-7: exactly one run since the hand-off", r7.length === 1, r7.map((x) => [x._id, x.State, x.Status]));
  if (r7[0]) for (const a of await steps(PORTAL, I7, r7[0]._id)) console.log("     ", stepLine(a));
  // L2: integration 1 (exit trigger -> HTTP POST to the web app)
  const l2 = await until("integration 1 run", async () => { const r = await runs(APP, INT1, st.t.caseDone || since); return r.length ? r : null; }, 15000, 300000);
  check(`L2 integration 1 ran after the case completed (${Math.round(l2.ms / 1000)} s)`, !!l2.v, l2.v ? l2.v.map((x) => [x._id, runAt(x), x.State, x.Status]) : "no run: does 'When an item exits this step' fire on I-7's Skip and complete?");
  if (l2.v) {
    check("L2 integration 1: exactly one run (no duplicate exit event)", l2.v.length === 1, l2.v.length);
    for (const a of await steps(APP, INT1, l2.v[0]._id)) { console.log("     ", stepLine(a)); console.log("       out:", scrub(safeOut(a.OutputData))); }
    st.t.int1 = runAt(l2.v[0]);
  }
  // L3: the script's filing (one-off trigger >= settle, then about 40-60 Kissflow calls at 1.2 s)
  const l3 = await until("Final_Document_Hash", async () => { const x = await caseGet(); return x?.Final_Document_Hash ? x : null; }, 20000, 15 * 60000);
  const f = l3.v || (await caseGet());
  st.t.filed = f?.Final_Document_At; save();
  const m = /^seal:([0-9a-f]{16}) sha256:([0-9a-f]{64})$/.exec(String(f?.Final_Document_Hash || ""));
  check(`L3 the script filed the case (${Math.round(l3.ms / 1000)} s)`, !!l3.v && !!m, { hash: !!f?.Final_Document_Hash });
  check(`L3 case Final_PDF: exactly one ${PDF_NAME}`, files(f).length === 1 && files(f)[0].name === PDF_NAME, files(f).map((x) => x.name));
  check("L3 case Final_Document_At and Completion_Trigger", !!f?.Final_Document_At && f?.Completion_Trigger === `Final release by ${SUP.name}`, { at: f?.Final_Document_At, trig: f?.Completion_Trigger });
  const q = await reqGet();
  check(`L3 request Final_PDF: exactly one ${PDF_NAME}`, files(q).length === 1 && files(q)[0].name === PDF_NAME, files(q).map((x) => x.name));
  if (m && files(f)[0]) {
    const a = await attachmentSha(CASE_FLOW, APP, CASE, files(f)[0].id);
    check("L3 the case's PDF: SHA-256 and seal equal Final_Document_Hash", a.sha256 === m[2] && a.seal === m[1], a);
    if (files(q)[0]) { const b = await attachmentSha(REQ_FLOW, PORTAL, REQ, files(q)[0].id); check("L3 the request's PDF is the same file (SHA-256)", b.sha256 === m[2], b); }
  }
  const aud = await call("POST", `/form/2/${kf.acc}/${AUDIT}/list?page_number=1&page_size=100&q=${encodeURIComponent(CASE)}&_application_id=${APP}`, {});
  const fd = rowsOf(aud.body).filter((x) => x.Case_Item_Id === CASE && x.Event_Key === FD_KEY);
  check(`L3 exactly one ${FD_KEY} audit row`, fd.length === 1, fd.map((x) => x._id));
  if (fd[0]) {
    const row = (await get(`/form/2/${kf.acc}/${AUDIT}/${fd[0]._id}?_application_id=${APP}`)).body || {};
    st.auditRowId = fd[0]._id; save();
    check("L3 audit row: final.pdf, Filed, names the file, hash and seal", row.Action_Code === "final.pdf" && row.Event_Category === "Final PDF" && row.Object_State === "Filed" && !!m && String(row.New_Value_Text).includes(m[2]) && String(row.New_Value_Text).includes(m[1]) && String(row.New_Value_Text).includes(String(files(f)[0]?.id)), { code: row.Action_Code, state: row.Object_State });
  }
  // L4: integration 2 (webhook from the script -> search the case -> RMM role e-mails -> Send an email with the PDF)
  const l4 = await until("integration 2 run", async () => { const r = await runs(APP, INT2, st.t.filed || since); return r.length ? r : null; }, 15000, 300000);
  check(`L4 integration 2 ran after the filing (${Math.round(l4.ms / 1000)} s)`, !!l4.v, l4.v ? l4.v.map((x) => [x._id, runAt(x), x.State, x.Status]) : "no run");
  if (l4.v) {
    check("L4 integration 2: exactly one run (one mail)", l4.v.length === 1, l4.v.length);
    for (const a of await steps(APP, INT2, l4.v[0]._id)) {
      console.log("     ", stepLine(a));
      const out = a.OutputData, pay = a.ActionPayload;
      if (Array.isArray(out?.Data)) console.log("       search rows:", out.Data.length, "| the case:", out.Data.some((x) => x._id === CASE), "| Final_PDF files:", files(out.Data.find((x) => x._id === CASE)).length);
      if (Array.isArray(out?.Users)) console.log("       users:", out.Users.length, "| with e-mail:", out.Users.filter((u) => /@/.test(String(u.Email))).length);
      if (pay && (pay.To || pay.Attachments)) console.log("       mail: To", String(pay.To || "").split(/[,;]/).filter((x) => /@/.test(x)).length, "address(es) | attachments", Array.isArray(pay.Attachments) ? pay.Attachments.length : typeof pay.Attachments);
    }
  }
  console.log(`\nL5 for Thomas: the RMM mail with ${PDF_NAME} attached; the Apps Script Executions log; the Triggers page has no leftover trigger.`);
  console.log(`watch: ${st.checks.filter((x) => !x.pass).length} failed checks in total, ${calls} calls; timings ${JSON.stringify(st.t)}`);
  save();
}

/** A fresh release case from one at review with its request at "keep" (E-B stand-in, as the live suite plays it). */
async function prepareFallback() {
  if (!process.argv.includes("--consume-case")) throw new Error("pass --consume-case after Thomas's OK (and CASE/REQ/CODE of the fallback case)");
  const c = await caseGet(), q = await reqGet();
  if (c?._status !== "InProgress" || ctxOf(c)._context_activity_id !== ACT.review || c?.Completeness_Confirm !== "Confirmed" || c?.Portal_Request_Item_Id !== REQ) throw new Error("the fallback case is not in review and linked");
  if (ctxOf(q)._context_activity_id !== ACT.keep) throw new Error("the fallback request is not at 'keep the CIQ up to date'");
  const h = await hook("P_release_requested", { caseItemId: CASE });
  check("F1 release.requested webhook accepted", h === 200, h);
  const r = await until("Release_Flag Requested", async () => { const x = await reqGet(); return x?.Release_Flag === "Requested" && !x?.Release_At ? x : null; }, 5000, 100000);
  check("F2 the request is Requested, the case has Release_Requested_At", !!r.v && !!(await caseGet())?.Release_Requested_At);
  const act = ctxOf(r.v || q)._context_activity_instance_id;
  const s = await call("POST", `/process/2/${kf.acc}/${REQ_FLOW}/${REQ}/${act}/submit?_application_id=${PORTAL}`, {});
  const q2 = await reqGet();
  check("F3 the supplier's move: the request is at 'give the final release'", s.status === 200 && ctxOf(q2)._context_activity_id === ACT.give, { status: s.status, step: q2?._current_step });
}

const phase = process.argv[2];
const fn = { preflight, release, watch, "prepare-fallback": prepareFallback }[phase];
if (!fn) { console.log("phase: preflight | release --consume-case | watch | prepare-fallback --consume-case"); process.exit(2); }
await fn();
