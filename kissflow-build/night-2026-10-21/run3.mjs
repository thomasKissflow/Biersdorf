// Pass 3 of the 21 Oct night tests: the gaps two read-only critics found after passes 1 and 2 (coverage-gaps workflow).
// Mostly reads and guards on items already left at their stages; every changed value is put back and read back.
//   node run3.mjs [scenario-prefix]   resumable like run.mjs (results.json); exit 75 = rate-limited (rerun in 20 min)
import { createHash } from "node:crypto";
import { call, A, APP, PORTAL, sleep, RateLimited, results, saveResults, track, markDeleted, isoNow, plusDays, sameFields, procGet, procCreate,
  procDelete, adminUpdate, formCreate, formDelete, hook, until } from "./lib.mjs";
import { CASE, RQ, QRY, OP, REV, ME, ME_LIST, SUP, STEP, SYNCED, WAIT_REFUSED, pick, ids, brief, stable, diffKeys, show, rowsOf, search, actFor, stepPut,
  applied, refused, run, caseBody, answers, startCase, i1 } from "./run.mjs";

const out = (id) => results.scenarios[id]?.out;
const G2 = out("G2.1"), G3 = out("G3.1"), G4 = out("G4.1"), S1 = out("S1.1"), X1 = out("X1.1"), F1 = out("F1.1");
const RUN_START = "2026-10-20T20:58:00Z"; // the night's first call

/** The screen's read (SDK getItem = the user route at the current step) beside the admin read. */
async function userRead(flow, app, id) {
  const admin = await procGet(flow, app, id);
  const act = await actFor(flow, app, id, admin);
  const r = await call("GET", `/process/2/${A}/${flow}/${id}/${act}?_application_id=${app}`);
  const user = r.status === 200 ? r.body : null;
  const fields = Object.keys(admin || {}).filter((k) => !k.startsWith("_") && admin[k] !== null && admin[k] !== "");
  const missing = user ? fields.filter((k) => user[k] === undefined) : fields;
  const differs = user ? fields.filter((k) => user[k] !== undefined && JSON.stringify(user[k]) !== JSON.stringify(admin[k])) : [];
  return { step: admin?._current_step, status: r.status, code: r.body?.error_code, fields: fields.length, missing, differs };
}

try {
  await run("Z1", "the supplier's read (user route) at fill, keep, give, view and respond returns every field the admin read has", async (t) => {
    const items = [[RQ, PORTAL, G2?.reqId, "G2"], [RQ, PORTAL, G3?.reqId, "G3"], [RQ, PORTAL, G4?.reqId, "G4"], [RQ, PORTAL, S1?.reqId, "S1"]];
    const open = (await search(QRY, PORTAL, "ZZT-NT")).find((q) => q._status === "InProgress");
    if (open) items.push([QRY, PORTAL, open._id, "an open query"]);
    for (const [flow, app, id, tag] of items) {
      if (!id) continue;
      const r = await userRead(flow, app, id);
      t.check(`${tag} at '${r.step}': the user-route read answers (${r.status}) with all ${r.fields} filled fields, unchanged`, r.status === 200 && !r.missing.length && !r.differs.length,
        { status: r.status, code: r.code, missing: r.missing, differs: r.differs });
    }
  });

  await run("Z2", "items outside the test: none of the five processes has a non-ZZT item changed since the night began", async (t) => {
    for (const [flow, app] of [[CASE, APP], [REV, APP], [OP, APP], [RQ, PORTAL], [QRY, PORTAL]]) {
      const rows = [];
      for (let page = 1; page <= 20; page++) {
        const r = await call("GET", `/process/2/${A}/admin/${flow}/item?page_number=${page}&page_size=100&_application_id=${app}`);
        const d = Array.isArray(r.body?.Data) ? r.body.Data : [];
        rows.push(...d);
        if (d.length < 100) break;
      }
      const dated = rows.filter((x) => typeof x._modified_at === "string");
      const touched = dated.filter((x) => !String(x.Case_Code || x.Review_Key || x.OP_Key || x.Query_Key || "").startsWith("ZZT") && Date.parse(x._modified_at) >= Date.parse(RUN_START));
      t.check(`${flow}: ${rows.length} items listed (${dated.length} with a modified time), no non-ZZT item modified since ${RUN_START}`, dated.length === rows.length && !touched.length,
        { touched: touched.map((x) => pick(x, ["_id", "Case_Code", "_modified_at", "_modified_by"])), undated: rows.length - dated.length });
    }
  });

  await run("Z3", "a case or open point created with its trust fields set at Start (they are ReadOnly or Hidden there)", async (t) => {
    const fake = { Portal_Request_Item_Id: "ZZT-NT-FAKE-REQ", Completeness_Confirm: "Confirmed", Case_Phase: "Completed", Release_Requested_At: isoNow() };
    const c = await procCreate(CASE, APP, { ...caseBody("ZZT-NT-Z3"), ...fake }, "ZZT-NT-Z3 case (trust fields at create)");
    const it = await procGet(CASE, APP, c._id);
    const stored = Object.keys(fake).filter((k) => !sameFields(it, { [k]: fake[k] }).length);
    t.check("CIQ Case create: no trust field is stored (Portal_Request_Item_Id, Completeness_Confirm, Case_Phase, Release_Requested_At)", !stored.length, { stored });
    const d = await procDelete(CASE, APP, c._id);
    if (d.after === 404) markDeleted(c._id, "draft deleted at once (GET 404)");
    const fakeOp = { Portal_Query_Item_Id: "ZZT-NT-FAKE-QUERY", OP_Outcome: "Accepted", Response_Text: "forged" };
    const p = await procCreate(OP, APP, { OP_Key: "ZZT-NT-Z3-OP", Round_No: 1, Case_Code: "ZZT-NT-Z3", Cycle_No: 1, Supplier_Code: "ZZT-SUP-NT", Case_Item_Id: "ZZT-NT-NONE", OP_Kind: "Query", OP_Dept: "QM",
      Raised_By_Dept: "QM", Ref_Kind: "Section", Ref_Label: "General", Question_Text: "ZZT (fictional)", Supplier_Justification: "ZZT (fictional)", Responsible_User: { _id: ME }, Supplier_Due_Date: plusDays(7),
      Raised_By_User: { _id: ME }, Raiser_Assignee: [{ _id: ME }], ...fakeOp }, "ZZT-NT-Z3 open point (trust fields at create)");
    const po = await procGet(OP, APP, p._id);
    const stored2 = Object.keys(fakeOp).filter((k) => !sameFields(po, { [k]: fakeOp[k] }).length);
    t.check("CIQ Open Point create: no trust field is stored (Portal_Query_Item_Id, OP_Outcome, Response_Text)", !stored2.length, { stored: stored2 });
    const d2 = await procDelete(OP, APP, p._id);
    if (d2.after === 404) markDeleted(p._id, "draft deleted at once (GET 404)");
    t.check("both drafts deleted (GET 404)", d.after === 404 && d2.after === 404, { case: d, op: d2 });
  });

  await run("Z4", "a form refuses a value outside its list (Audit Event: Event_Category, Actor_Dept)", async (t) => {
    for (const [field, bad] of [["Event_Category", "Bogus"], ["Actor_Dept", "XYZ"]]) {
      const body = { Event_Key: `ZZT-NT-Z4-${field}`, Case_Code: "ZZT-NT-Z4", Event_At: isoNow(), Event_Category: "Case", Actor_Side: "System", Actor_Dept: "RMM", [field]: bad };
      let f = null, err = null;
      try { f = await formCreate("CIQ_Audit_Event_A00", APP, body, `ZZT-NT-Z4 audit event with ${field} ${bad}`); } catch (e) { if (e instanceof RateLimited) throw e; err = String(e.message).slice(0, 300); }
      let stored = null;
      if (f) {
        const it = await call("GET", `/form/2/${A}/CIQ_Audit_Event_A00/${f.id}?_application_id=${APP}`);
        stored = it.body?.[field];
        const d = await formDelete("CIQ_Audit_Event_A00", APP, f.id);
        if (d.after === 404) { markDeleted(f.id, "deleted at once (GET 404)"); if (f.draftId !== f.id) markDeleted(f.draftId, "with its item"); }
      }
      t.check(`${field} "${bad}" is refused (no row is kept)`, !f || (f.submit !== 200 && stored !== bad), { refusedAtCreate: err, submit: f?.submit, stored });
    }
  });

  if (G2?.reqId) await run("Z5", "at 'fill in', which ReadOnly fields a supplier write can change (P-1 inventory); all put back", async (t) => {
    const before = await procGet(RQ, PORTAL, G2.reqId);
    const forge = { Release_Contacts: [], Supplier_Due_Date: plusDays(90), Questions_History_JSON: '[{"forged":true}]', Change_Reports_JSON: '[{"forged":true}]', Manual_Scope_JSON: '["S99"]',
      Config_Bundle_JSON: '{"forged":true}', Config_Bundle_Hash: "forged", BDF_Contact_Email: "forged.zzt@example.com", Request_Key: "ZZT-FORGED|9" };
    const w = await stepPut(RQ, PORTAL, G2.reqId, forge);
    const after = await procGet(RQ, PORTAL, G2.reqId);
    const leaked = Object.keys(forge).filter((k) => JSON.stringify(after?.[k] ?? null) !== JSON.stringify(before?.[k] ?? null));
    t.check(`a supplier write at fill changes none of the ${Object.keys(forge).length} ReadOnly fields`, !leaked.length, { status: w.status, leaked });
    if (leaked.length) {
      const back = pick(before, leaked);
      if (Array.isArray(back.Release_Contacts)) back.Release_Contacts = back.Release_Contacts.map((u) => ({ _id: u._id }));
      const st = await adminUpdate(RQ, PORTAL, G2.reqId, back);
      const again = await procGet(RQ, PORTAL, G2.reqId);
      t.check("every leaked value is put back (admin) and reads back", st === 200 && !sameFields(again, back).length, { status: st, diff: show(again, back) });
    }
  });

  if (G2?.reqId) await run("Z6", "I-2 refuses a request at 'fill in' without its completeness", async (t) => {
    await refused(t, "completeness.confirmed for a request without Completeness_Confirm is refused: the case is unchanged", "completeness.confirmed", { portalRequestItemId: G2.reqId }, [[CASE, APP, G2.caseId]]);
  });

  if (G2?.reqId) await run("Z7", "two saves in quick succession, each posted at once (as the screen does): the case ends with the newer", async (t) => {
    for (const round of [1, 2]) {
      const a = answers(10 * round + 1, false), b = answers(10 * round + 2, false);
      await stepPut(RQ, PORTAL, G2.reqId, a);
      await hook("request.changed", { portalRequestItemId: G2.reqId });
      await stepPut(RQ, PORTAL, G2.reqId, b);
      await hook("request.changed", { portalRequestItemId: G2.reqId });
      const c = await until(async () => { const x = await procGet(CASE, APP, G2.caseId); return Number(x?.Answers_Rev) === b.Answers_Rev ? x : null; }, 90000);
      await sleep(30000);
      const fin = await procGet(CASE, APP, G2.caseId), rq = await procGet(RQ, PORTAL, G2.reqId);
      t.check(`round ${round}: after both runs the case holds Rev ${b.Answers_Rev} and the request's 15 synced fields (no stale overwrite)`, !!c && Number(fin?.Answers_Rev) === b.Answers_Rev && !sameFields(fin, pick(rq, SYNCED)).length,
        { rev: fin?.Answers_Rev, diff: show(fin, pick(rq, SYNCED)) });
    }
  });

  if (X1?.reqId) await run("Z8", "release.requested on a CANCELLED request (case X1) must be refused; anything it changes is put back", async (t) => {
    const rq0 = await procGet(RQ, PORTAL, X1.reqId), c0 = await procGet(CASE, APP, X1.caseId);
    t.check("setup: X1's request is labelled Cancelled and locked", rq0?.Case_Phase_Label === "Cancelled" && rq0?.Request_Locked === "Yes", pick(rq0, ["Case_Phase_Label", "Request_Locked"]));
    const ok = await refused(t, "release.requested on a cancelled request is refused: the request and the case are unchanged", "release.requested", { caseItemId: X1.caseId }, [[RQ, PORTAL, X1.reqId], [CASE, APP, X1.caseId]]);
    if (!ok) {
      const rq1 = await procGet(RQ, PORTAL, X1.reqId), c1 = await procGet(CASE, APP, X1.caseId);
      const kr = diffKeys(stable(rq0), stable(rq1)).filter((k) => !k.startsWith("_")), kc = diffKeys(stable(c0), stable(c1)).filter((k) => !k.startsWith("_"));
      t.check("info: what it changed", true, { request: pick(rq1, kr), case: pick(c1, kc) });
      const backR = pick(rq0, kr);
      if (Array.isArray(backR.Release_Contacts)) backR.Release_Contacts = backR.Release_Contacts.map((u) => ({ _id: u._id }));
      const s1 = kr.length ? await adminUpdate(RQ, PORTAL, X1.reqId, backR) : 200, s2 = kc.length ? await adminUpdate(CASE, APP, X1.caseId, pick(c0, kc)) : 200;
      const rq2 = await procGet(RQ, PORTAL, X1.reqId);
      t.check("put back: the request is Cancelled and locked again", s1 === 200 && s2 === 200 && rq2?.Case_Phase_Label === "Cancelled" && rq2?.Request_Locked === "Yes", { s1, s2, now: pick(rq2, ["Case_Phase_Label", "Request_Locked", "Release_Flag"]) });
    }
  });

  if (F1?.reqId) await run("Z9", "release.requested writes the release contact list (multi-user mapping) from an empty list", async (t) => {
    const st = await adminUpdate(RQ, PORTAL, F1.reqId, { Release_Contacts: [] });
    const e = await procGet(RQ, PORTAL, F1.reqId);
    t.check("setup: the request's Release_Contacts emptied (admin)", st === 200 && !ids(e?.Release_Contacts), { status: st, now: e?.Release_Contacts });
    const rq = await applied(t, "release.requested → Release_Contacts holds the case's release contact again", "release.requested", { caseItemId: F1.caseId }, RQ, PORTAL, F1.reqId, (x) => ids(x?.Release_Contacts) === ME && x?.Release_Flag === "Requested");
    if (rq) t.check("and the flag, lock and label are set", rq.Request_Locked === "Yes" && rq.Case_Phase_Label === "Awaiting your final release", pick(rq, ["Release_Flag", "Request_Locked", "Case_Phase_Label"]));
  });

  for (const n of [1, 2]) await run(`Z10.${n}`, `two case.started posts back to back BEFORE the link exists (race ${n}): exactly one request`, async (t) => {
    const k = await startCase(t, `ZZT-NT-Z10-${n}`);
    await hook("case.started", { caseItemId: k.caseId });
    await hook("case.started", { caseItemId: k.caseId });
    const c = await until(async () => { const x = await procGet(CASE, APP, k.caseId); return x?.Portal_Request_Item_Id ? x : null; }, 90000);
    await sleep(WAIT_REFUSED);
    const reqs = (await search(RQ, PORTAL, k.caseId)).filter((r) => r.App_Case_Item_Id === k.caseId);
    for (const r of reqs) track("process", RQ, PORTAL, r._id, `ZZT-NT-Z10-${n} request (created by I-1)${r._id === c?.Portal_Request_Item_Id ? "" : " UNEXPECTED twin"}`);
    t.check("exactly one request names the case, and the case links it", reqs.length === 1 && reqs[0]._id === c?.Portal_Request_Item_Id, { requests: reqs.map((r) => r._id), link: c?.Portal_Request_Item_Id });
  });

  await run("Z11", "I-1 with a ~100 KB configuration bundle and its sha256, duplicate portal contacts, no release contacts, cycle 2", async (t) => {
    const bundle = JSON.stringify({ format: "ciq-bundle/1", zzt: true, sections: Array.from({ length: 900 }, (_, i) => ({ id: `S${i}`, title: `ZZT section ${i} – “Ä” ✓`, fields: [`F${i}a`, `F${i}b`], note: "x".repeat(40) })) });
    const hash = createHash("sha256").update(bundle).digest("hex");
    const code = "ZZT-NT-Z11";
    const k = await startCase(t, code, { body: { Cycle_No: 2, Config_Bundle_JSON: bundle, Config_Bundle_Hash: hash, Portal_Assignees_JSON: JSON.stringify([{ _id: ME }, { _id: ME }]), Release_Assignees_JSON: "" } });
    t.check(`info: the bundle is ${bundle.length} characters`, true, bundle.length);
    const c = await applied(t, "case.started → the case links its request", "case.started", { caseItemId: k.caseId }, CASE, APP, k.caseId, (x) => !!x?.Portal_Request_Item_Id);
    if (!c) return k;
    track("process", RQ, PORTAL, c.Portal_Request_Item_Id, `${code} request (created by I-1)`);
    const rq = await procGet(RQ, PORTAL, c.Portal_Request_Item_Id);
    const got = String(rq?.Config_Bundle_JSON ?? "");
    t.check("the request's Config_Bundle_JSON is byte-equal and its sha256 equals Config_Bundle_Hash", got === bundle && createHash("sha256").update(got).digest("hex") === rq?.Config_Bundle_Hash, { len: got.length, hash: rq?.Config_Bundle_Hash === hash });
    t.check("Assigned_Contacts holds the contact once; Release_Contacts falls back to it; Request_Key is '<code>|2'", ids(rq?.Assigned_Contacts) === ME && ids(rq?.Release_Contacts) === ME && rq?.Request_Key === `${code}|2`,
      pick(rq, ["Assigned_Contacts", "Release_Contacts", "Request_Key", "Cycle_No"]));
    return { ...k, reqId: c.Portal_Request_Item_Id };
  });

  const all = Object.values(results.scenarios).filter((s) => s.id.startsWith("Z")), checks = all.flatMap((s) => s.checks);
  console.log(`\nPASS 3 DONE: ${all.filter((s) => s.pass).length}/${all.length} scenarios pass, ${checks.filter((c) => c.pass).length}/${checks.length} checks`);
} catch (e) {
  if (e instanceof RateLimited) { console.log(`RATE LIMITED: ${e.message}. Stop 20 minutes, then rerun.`); saveResults(); process.exit(75); }
  throw e;
}
