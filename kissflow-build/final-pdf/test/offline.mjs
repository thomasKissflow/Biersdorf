#!/usr/bin/env node
// Offline test of the CIQ final document service: Bundle.gs + Code.gs in a node:vm with Apps Script stand-ins
// (gas.mjs) against an in-memory Kissflow (fake-kissflow.mjs) holding the app's live-shaped ZZT fixtures
// (fixtures/kissflow.json, from make-fixtures.mjs). No network. Usage: node kissflow-build/final-pdf/test/offline.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { fakeKissflow } from "./fake-kissflow.mjs";
import { GS_DIR, GasBlob, execution, newWorld } from "./gas.mjs";
import { curlCall, keptState, liveProps, liveTransport, refusal, stateToSave, sweepCurlDirs } from "./live.mjs";
import { longCase } from "./long-case.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const sha16 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);

// ------------------------------------------------------------------ fixtures (regenerated when the app's sources moved)

const FIXTURES = resolve(here, "fixtures/kissflow.json");
let fx = JSON.parse(readFileSync(FIXTURES, "utf8"));
const srcNow = { rawFixtures: sha16(resolve(root, "prototype/src/app-live/testing/rawFixtures.ts")), toAppState: sha16(resolve(root, "prototype/src/app-live/map/toAppState.ts")), finalDocument: sha16(resolve(root, "prototype/src/domain/finalDocument.ts")), makeFixtures: sha16(resolve(here, "make-fixtures.mjs")) };
if (JSON.stringify(srcNow) !== JSON.stringify(fx.sources)) {
  console.log("# the app's sources changed since the fixtures were made: regenerating them (make-fixtures.mjs)");
  execFileSync(process.execPath, [resolve(here, "make-fixtures.mjs")], { stdio: "inherit" });
  fx = JSON.parse(readFileSync(FIXTURES, "utf8"));
}
const EXPECTED = fx.expected["ZZT-0005"].doc;

// ------------------------------------------------------------------ the world

const P = {
  KF_DOMAIN: "zzt-sandbox.kissflow.example",
  KF_ACCOUNT_ID: "AcZZTsandbox01",
  KF_APP_ID: "CIQ_Digital_A00",
  KF_ACCESS_KEY_ID: "zzt-key-id-4f2a91",
  KF_ACCESS_KEY_SECRET: "zzt-secret-8c1d7e55b0a4",
  TIME_ZONE: "Europe/Berlin",
  MAIL_ENABLED: "true",
  ADMIN_EMAIL: "admin.zzt@example.com",
  FALLBACK_RMM_EMAIL: "rmm.fallback.zzt@example.com",
};
const WEBHOOK = "https://zzt-sandbox.kissflow.example/integration/2/AcZZTsandbox01/webhook/ZZTHOOKTOKEN0123456789";
const SECRETS = [P.KF_ACCESS_KEY_ID, P.KF_ACCESS_KEY_SECRET, "ZZTHOOKTOKEN0123456789", "zzt-dopost-token-77aa"];
const NOW0 = Date.parse("2026-10-24T08:00:00Z");
const CASE_ID = "AppZZT-0005";
const PDF_NAME = "ZZT-0005-final-document.pdf";
const FLOWS = { case: "CIQ_Case_A00", review: "CIQ_Review_A00", op: "CIQ_Open_Point_A00", audit: "CIQ_Audit_Event_A00", note: "CIQ_Internal_Note_A00", rmesSAF: "CIQ_RMES_Safety_A00", rmesREG: "CIQ_RMES_Regulatory_A00", supplier: "CIQ_Supplier_A00", config: "CIQ_Config_Version_A00" };

const clone = (x) => JSON.parse(JSON.stringify(x));
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
const variant = (base, code, patch) => {
  const it = { ...clone(base), _id: `App${code}`, Case_Code: code, Case_Title: `${code} · ${base.Trade_Name}`, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete it[k];
  return it;
};

/** Every log line, mail and write body of every execution, for the secrets check at the end. */
const everything = [];

/** A fake Kissflow with the fixtures and the case variants, a fake clock, Script Properties and a cache. */
function world({ props = {}, listMode = "status", mutate } = {}) {
  const clock = { t: NOW0, now() { return this.t; }, advance(ms) { this.t += Math.max(0, ms); } };
  const db = Object.fromEntries(Object.entries(FLOWS).map(([k, id]) => [id, clone(fx.db[k])]));
  const base = db.CIQ_Case_A00.find((x) => x._id === CASE_ID);
  db.CIQ_Case_A00.push(
    variant(base, "ZZT-0006", { _status: "InProgress", Final_Release_Confirm: undefined, Final_Release_At: undefined, Final_Release_By_Name: undefined }),
    variant(base, "ZZT-0007", { _status: "Completed", Case_Phase: "Cancelled", Cancelled_At: "2026-10-20T19:30:00Z", Final_Release_Confirm: undefined, Final_Release_At: undefined }),
    variant(base, "ZZT-0008", { Final_Document_Hash: `seal:0123456789abcdef sha256:${"a".repeat(64)}` }),
    variant(base, "ZZT-0009", { _status: "InProgress", Final_Release_At: iso(NOW0 - 60000) }),
  );
  // the SET:current row holds webhook URLs live: they must never reach a log
  const set = db.CIQ_Config_Version_A00.find((r) => r.Config_Key === "SET:current");
  set.Payload_JSON = JSON.stringify({ ...JSON.parse(set.Payload_JSON), webhooks: { "I-1": WEBHOOK } });
  if (mutate) mutate(db);
  const kf = fakeKissflow({ domain: P.KF_DOMAIN, acc: P.KF_ACCOUNT_ID, app: P.KF_APP_ID, keyId: P.KF_ACCESS_KEY_ID, keySecret: P.KF_ACCESS_KEY_SECRET, db, clock, listMode });
  const store = new Map(Object.entries({ ...P, ...props }).filter(([, v]) => v !== undefined));
  const cache = new Map();
  const shared = newWorld();
  const runs = [];
  const w = {
    clock,
    db,
    kf,
    store,
    world: shared,
    runs,
    /** A new Apps Script execution (fresh globals; the same properties, cache, mails and Kissflow). */
    exec() {
      const ex = execution({ fetch: kf.handle, store, cache, world: shared, clock });
      runs.push(ex);
      return ex;
    },
    run(fn, ...args) {
      const ex = w.exec();
      const r = ex.call(fn, ...args);
      return { r, ex };
    },
    logs: () => runs.flatMap((x) => x.logs),
    caseItem: (id = CASE_ID) => db.CIQ_Case_A00.find((x) => x._id === id),
    state: (id = CASE_ID) => (store.has(`FD_${id}`) ? JSON.parse(store.get(`FD_${id}`)) : null),
  };
  everything.push(w);
  return w;
}

const writesOf = (calls) => calls.filter((c) => c.write);
const pdfText = (bytes) => Buffer.from(bytes).toString("latin1");
const JSON_H = { "Content-Type": "application/json" };
const answer = (status, body = {}) => ({ status, headers: JSON_H, body: JSON.stringify(body) });
const isAttach = (c) => c.method === "POST" && /\/Final_PDF\/attachment$/.test(c.path);
const rmmMails = (w) => w.world.mails.filter((m) => m.subject.endsWith(": final document ready"));
const auditRows = (w) => w.db.CIQ_Audit_Event_A00.filter((r) => r.Event_Key === "ZZT-0005-FD-PDF");
// WinAnsi bytes 0x80-0x9f that pdf.mjs writes (CP1252) back to Unicode
const CP1252 = { 0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ" };
/** The text of a sync/pdf.mjs PDF, one string per shown line (one BT…ET text object; its runs joined), escapes decoded. */
function pdfLines(bytes) {
  const lines = [];
  let cur = null;
  for (const m of pdfText(bytes).matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|\bBT\b|\bET\b/g)) {
    if (m[0] === "BT") cur = [];
    else if (m[0] === "ET") {
      if (cur?.length) lines.push(cur.join(""));
      cur = null;
    } else if (cur) cur.push(m[1].replace(/\\([0-7]{3}|.)/g, (_, x) => (x.length === 3 ? (CP1252[parseInt(x, 8)] ?? String.fromCharCode(parseInt(x, 8))) : x)));
  }
  return lines;
}

// ------------------------------------------------------------------ the bundle

test("Bundle.gs is current and has no host globals", () => {
  const prov = JSON.parse(readFileSync(resolve(here, "../PROVENANCE.json"), "utf8"));
  const bundle = readFileSync(resolve(GS_DIR, "Bundle.gs"));
  assert.equal(createHash("sha256").update(bundle).digest("hex"), prov.sha256, "Bundle.gs differs from PROVENANCE.json: run build.mjs");
  for (const [p, h] of Object.entries(prov.sources)) assert.equal(sha16(resolve(root, p)), h, `${p} changed since the build: run build.mjs`);
  const text = bundle.toString("utf8");
  assert.ok(!/__forbidden_/.test(text));
  for (const bad of ["DEV_WEBHOOKS", "/webhook/", "X-Access-Key", "subtle."]) assert.ok(!text.includes(bad), bad);
  const code = text.replace(/^(\/\/[^\n]*\n)+/, "");
  assert.ok(code.startsWith('"use strict";\n'), "strict mode: \"use strict\" is the first statement, ahead of the polyfills");
  assert.equal(text.split('"use strict"').length - 1, 1);
});

test("manifest: V8, Europe/Berlin, the scopes the code uses (DriveApp needs the full drive scope)", () => {
  const m = JSON.parse(readFileSync(resolve(GS_DIR, "appsscript.json"), "utf8"));
  assert.equal(m.runtimeVersion, "V8");
  assert.equal(m.timeZone, "Europe/Berlin");
  const base = "https://www.googleapis.com/auth/";
  assert.deepEqual([...m.oauthScopes].sort(), ["drive", "script.external_request", "script.scriptapp", "script.send_mail"].map((x) => base + x));
  const code = readFileSync(resolve(GS_DIR, "Code.gs"), "utf8");
  for (const [svc, scope] of [["UrlFetchApp", "script.external_request"], ["ScriptApp.newTrigger", "script.scriptapp"], ["MailApp", "script.send_mail"], ["DriveApp", "drive"]]) assert.ok(code.includes(svc) && m.oauthScopes.includes(base + scope), svc);
});

test("bundle in a bare vm (polyfilled built-ins deleted) gives the app's own document and seal", () => {
  const ctx = vm.createContext({});
  vm.runInContext("delete Array.prototype.at; delete Array.prototype.findLast; delete Array.prototype.findLastIndex; delete Object.hasOwn; delete String.prototype.replaceAll; delete String.prototype.at;", ctx);
  vm.runInContext(readFileSync(resolve(GS_DIR, "Bundle.gs"), "utf8"), ctx, { filename: "Bundle.gs" });
  for (const g of ["window", "document", "process", "require", "Buffer", "fetch", "crypto", "TextEncoder", "structuredClone"]) assert.equal(vm.runInContext(`typeof ${g}`, ctx), "undefined", g);
  const c = fx.db.case.find((x) => x._id === CASE_ID);
  ctx.input = clone({
    caseItem: c,
    reviews: fx.db.review.filter((x) => x.Case_Item_Id === CASE_ID),
    openPoints: fx.db.op.filter((x) => x.Case_Item_Id === CASE_ID),
    auditRows: fx.db.audit.filter((r) => r.Case_Item_Id === CASE_ID || (!r.Case_Item_Id && r.Case_Code === "ZZT-0005")),
    supplierRows: fx.db.supplier.filter((s) => s.Supplier_Code === c.Supplier_Code),
    configRows: fx.db.config,
    loadedAt: "2026-10-25T09:00:00Z",
  });
  const r = vm.runInContext("CIQFinal.finalDocumentFor(input)", ctx);
  assert.equal(r.phase, "completed");
  assert.equal(r.ok, true);
  assert.equal(r.seal, EXPECTED.fingerprint);
  // the parity case has part 4 content: a returned round, an AS-08 change, an attachment, a closed-as-not-accepted entry
  const entries = EXPECTED.threads.flatMap((t) => t.rounds.flatMap((x) => x.entries));
  assert.deepEqual(EXPECTED.threads.map((t) => [t.opId, t.kind, t.result, t.rounds.length]), [["OP-0005-01", "query", "Accepted", 2], ["OP-0005-02", "document-request", "Not accepted", 1]]);
  for (const a of ["returned", "edited", "note", "cannot-provide"]) assert.ok(entries.some((e) => e.action === a), a);
  assert.ok(entries.some((e) => e.attachment === "FLD-K1-003_statement.pdf"));
  assert.ok(!JSON.stringify(EXPECTED).includes("ZZT internal"), "the internal note and reason stay out");
  assert.deepEqual(clone(r.doc), EXPECTED, "the service's document differs from the app's (RMM screen) document");
  ctx.changed = clone(r.doc);
  ctx.changed.header.materialName = "changed";
  assert.equal(vm.runInContext("CIQFinal.verifyFinalDocument(changed)", ctx), false, "a changed document must fail the seal");
});

// ------------------------------------------------------------------ eligibility

test("eligibility: completed with release yes; no release, cancelled, filed, rejected, settling no", () => {
  const w = world();
  const ex = w.exec();
  const c = ex.ctx.cfg_();
  const el = (patch, now = NOW0) => ex.ctx.eligibility_({ ...clone(w.caseItem()), ...patch }, c, now);
  assert.deepEqual(clone(el({})), { ok: true });
  assert.equal(el({ Final_Release_Confirm: undefined }).why, "no final release");
  assert.equal(el({ Final_Release_At: "" }).why, "no final release");
  assert.deepEqual(clone(el({ Case_Phase: "Cancelled" })), { ok: false, why: "cancelled", ended: true });
  assert.equal(el({ Cancelled_At: "2026-10-20T19:00:00Z" }).why, "cancelled");
  assert.equal(el({ Cancelled_At: "2026-10-20T10:00:00Z", Reactivated_At: "2026-10-20T11:00:00Z" }).ok, true, "reactivated after the cancellation");
  assert.deepEqual(clone(el({ Final_Document_Hash: "seal:x sha256:y" })), { ok: false, why: "already filed", done: true });
  assert.equal(el({ _status: "Rejected" }).ended, true);
  assert.equal(el({ _status: "Withdrawn" }).ended, true);
  assert.equal(el({ Final_Release_At: iso(NOW0 - 60000) }).why, "settling", "completed 1 min ago (SETTLE_MINUTES 2)");
  assert.equal(el({ _status: "InProgress", Final_Release_At: iso(NOW0 - 10 * 60000) }).why, "settling");
  assert.equal(el({ _status: "InProgress", Final_Release_At: iso(NOW0 - 16 * 60000) }).ok, true, "released 16 min ago, not completed (failed skip)");
  ex.store.set("RELEASED_AFTER", "2026-10-21T00:00:00Z");
  const ex2 = w.exec();
  assert.equal(ex2.ctx.eligibility_(clone(w.caseItem()), ex2.ctx.cfg_(), NOW0).why, "released before RELEASED_AFTER");
});

// ------------------------------------------------------------------ the main path

test("tick files ZZT-0005 once: PDF attached, case fields, RMM mail, audit row", () => {
  const w = world();
  w.run("tick");
  const calls = w.kf.calls;
  const writes = writesOf(calls);
  assert.deepEqual(writes.map((c) => c.write), ["attach", "put", "form-create", "form-submit"], "exactly these writes, in this order");

  // the attachment
  const att = writes[0];
  assert.match(att.path, new RegExp(`^/process/2/${P.KF_ACCOUNT_ID}/admin/CIQ_Case_A00/${CASE_ID}/Final_PDF/attachment$`));
  assert.ok(att.multipart?.file, "multipart part 'file'");
  assert.equal(att.multipart.file.name, PDF_NAME);
  assert.equal(att.multipart.file.type, "application/pdf");
  assert.equal(att.contentType, undefined, "no JSON content type on the multipart call");
  const pdf = att.multipart.file.bytes;
  const text = pdfText(pdf);
  assert.ok(text.startsWith("%PDF-1.4"), "starts with %PDF");
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.ok(text.includes("ZZT-0005"), "names the case code");
  assert.ok(text.includes(`document seal ${EXPECTED.fingerprint}`), "the app's seal in the footer");
  assert.ok(!text.includes("SHA-256 of the final document JSON") && !text.includes("filed on the case data"), "no retired Case Data wording");
  assert.ok(/CES?T\)/.test(text), "dates in TIME_ZONE (Europe/Berlin)");
  const sha = createHash("sha256").update(pdf).digest("hex");

  // the case fields
  const put = writes[1];
  assert.equal(put.path, `/process/2/${P.KF_ACCOUNT_ID}/admin/CIQ_Case_A00/${CASE_ID}`);
  assert.equal(put.contentType, "application/json");
  assert.deepEqual(Object.keys(put.body).sort(), ["Completion_Trigger", "Final_Document_At", "Final_Document_Hash"]);
  assert.equal(put.body.Final_Document_Hash, `seal:${EXPECTED.fingerprint} sha256:${sha}`);
  assert.match(put.body.Final_Document_At, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/, "ISO without milliseconds");
  assert.equal(put.body.Completion_Trigger, "Final release by Elena Márquez");
  const item = w.caseItem();
  assert.equal(item.Final_Document_Hash, put.body.Final_Document_Hash);
  assert.deepEqual(item.Final_PDF.map((a) => a.name), [PDF_NAME]);

  // the audit row
  const [create, submit] = writes.slice(2);
  assert.equal(create.path, `/form/2/${P.KF_ACCOUNT_ID}/CIQ_Audit_Event_A00`);
  assert.match(submit.path, /\/CIQ_Audit_Event_A00\/draft_[A-Za-z0-9]+\/submit$/);
  const a = create.body;
  const attId = item.Final_PDF[0].id;
  assert.deepEqual(
    { ...a, Event_At: "*", Snapshot_JSON: "*" },
    {
      Event_Key: "ZZT-0005-FD-PDF",
      Case_Code: "ZZT-0005",
      Cycle_No: 1,
      Case_Item_Id: CASE_ID,
      Event_At: "*",
      Event_Category: "Final PDF",
      Action_Code: "final.pdf",
      Actor_Side: "System",
      Actor_Name: "CIQ final document service",
      Object_Kind: "Final document",
      Object_Key: "ZZT-0005-FD",
      Object_Item_Id: CASE_ID,
      Object_State: "Filed",
      New_Value_Text: `${PDF_NAME} · ${pdf.length} bytes · SHA-256 ${sha} · document seal ${EXPECTED.fingerprint} · Final_PDF ${attId}`,
      Ref_Flow_Id: "CIQ_Case_A00",
      Ref_Item_Id: CASE_ID,
      Snapshot_JSON: "*",
      Notify_Recipient: "katrin.vogel@beiersdorf.example",
      Notify_Channel: "E-mail",
    },
  );
  assert.match(a.Event_At, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  const snap = JSON.parse(a.Snapshot_JSON);
  assert.deepEqual(snap, { audit: [{ at: a.Event_At, by: "system", action: "Generated final document", detail: `Final document generated automatically, sealed and filed on the case (document seal ${EXPECTED.fingerprint}). Sent to the RMM owner. It cannot be changed.` }] });
  const row = w.db.CIQ_Audit_Event_A00.find((r) => r.Event_Key === "ZZT-0005-FD-PDF");
  assert.ok(row && !row._id.startsWith("draft_"), "the submitted row exists under its new id");
  assert.ok(calls.some((c) => c.method === "GET" && c.path.endsWith(`/CIQ_Audit_Event_A00/${row._id}`)), "the row is read back");

  // the RMM mail (C-14), with the PDF
  assert.equal(w.world.mails.length, 1);
  const m = w.world.mails[0];
  assert.equal(m.to, "katrin.vogel@beiersdorf.example", "Owner_RMM started the case: BDF_Contact_Email");
  assert.equal(m.subject, "ZZT-0005: final document ready");
  assert.equal(m.body, `The supplier gave the final release of CETYL 16 (ZZT-0005) and the case is completed. The final document was generated automatically and sealed (document seal ${EXPECTED.fingerprint}). It holds the released answers, the evidence list, every open-point thread and all confirmations.\n\nThe PDF is attached and filed on the case in Kissflow (Final PDF).`);
  assert.equal(m.attachments.length, 1);
  assert.equal(m.attachments[0].name, PDF_NAME);
  assert.equal(m.attachments[0].type, "application/pdf");
  assert.ok(m.attachments[0].bytes.equals(pdf), "the mailed PDF is the filed PDF");

  // bookkeeping
  assert.ok(w.store.get("DONE_IDS").split(",").includes(CASE_ID));
  assert.ok(w.store.get("DONE_IDS").split(",").includes("AppZZT-0008"), "a filed case is remembered as done");
  assert.ok(w.store.get("ENDED_IDS").split(",").includes("AppZZT-0007"), "a cancelled case is remembered as ended");
  assert.equal(w.state(), null, "no state left for a finished case");

  // reads: never the portal, RMES, notes or retired flows; always authenticated, on KF_DOMAIN; paced
  for (const c of calls) {
    assert.ok(c.auth, `${c.method} ${c.path} without the access key`);
    assert.equal(c.host, P.KF_DOMAIN);
    assert.ok(!/CIQP_|CIQ_RMES_|CIQ_Internal_Note_A00|CIQ_Case_Data_A00|CIQ_Scope_Run_A00/.test(c.path), `never read: ${c.path}`);
  }
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at - calls[i - 1].at >= 1200, `calls ${i - 1}→${i} only ${calls[i].at - calls[i - 1].at} ms apart`);
  const logs = w.logs().join("\n");
  for (const step of ["case start", "read", "built", "rendered", "attached", "case fields written", "mail sent", "audit row written", "case done", "tick done"]) assert.ok(logs.includes(`[CIQ-FD] ${step}`), `logged: ${step}`);
});

test("a second tick writes nothing, and runOnce on a filed case does nothing", () => {
  const w = world();
  w.run("tick");
  const before = w.kf.calls.length;
  const mails = w.world.mails.length;
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.equal(writesOf(w.kf.calls.slice(before)).length, 0);
  assert.equal(w.world.mails.length, mails);
  assert.ok(!w.kf.calls.slice(before).some((c) => c.path.endsWith(`/CIQ_Case_A00/${CASE_ID}`)), "a done case is not read again");
  const mid = w.kf.calls.length;
  const { r } = w.run("runOnce", CASE_ID);
  assert.equal(r.status, "already filed");
  assert.equal(writesOf(w.kf.calls.slice(mid)).length, 0);
  assert.equal(w.world.mails.length, mails);
});

test("list rows with the release columns: only released cases are read", () => {
  const w = world({ listMode: "columns" });
  w.run("tick");
  const reads = w.kf.calls.filter((c) => c.method === "GET" && /\/admin\/CIQ_Case_A00\/App/.test(c.path)).map((c) => c.path.split("/").pop());
  assert.ok(!reads.includes("AppZZT-0001") && !reads.includes("AppZZT-0003") && !reads.includes("AppZZT-0006") && !reads.includes("AppZZT-0008"), `read: ${[...new Set(reads)]}`);
  assert.ok(w.store.get("DONE_IDS").split(",").includes("AppZZT-0008"), "a list row with a hash is done without a read");
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "put").length, 1);
});

test("search finds nothing, audit list without snapshots: reviews and points come from the history, rows read in full", () => {
  const w = world();
  w.kf.searchFindsNothing = true;
  w.kf.auditListWithoutSnapshot = true;
  w.run("tick");
  const put = writesOf(w.kf.calls).find((c) => c.write === "put");
  assert.ok(put, "filed");
  assert.equal(put.body.Final_Document_Hash.split(" ")[0], `seal:${EXPECTED.fingerprint}`, "same document seal");
  assert.ok(w.kf.calls.some((c) => c.method === "GET" && /\/form\/2\/[^/]+\/CIQ_Audit_Event_A00\/Pk/.test(c.path)), "audit rows read in full");
});

// ------------------------------------------------------------------ mail switch and recipients

test("MAIL_ENABLED false: no mail, the audit row records none", () => {
  const w = world({ props: { MAIL_ENABLED: "false" } });
  w.run("tick");
  assert.equal(w.world.mails.length, 0);
  const a = writesOf(w.kf.calls).find((c) => c.write === "form-create").body;
  assert.equal(a.Notify_Recipient, undefined);
  assert.equal(a.Notify_Channel, undefined);
  assert.ok(!JSON.parse(a.Snapshot_JSON).audit[0].detail.includes("Sent to the RMM owner."));
});

test("RMM recipient: Owner_RMM e-mail, else the starter's BDF_Contact_Email, else FALLBACK_RMM_EMAIL, else an admin alert", () => {
  const w = world();
  const ex = w.exec();
  const c = ex.ctx.cfg_();
  const base = clone(w.caseItem());
  const rec = (patch, cfg = c) => clone(ex.ctx.rmmRecipient_(cfg, { ...base, ...patch }));
  assert.deepEqual(rec({ Owner_RMM: { _id: "UsX", Name: "X", Email: "owner.zzt@example.com" } }), { to: "owner.zzt@example.com", rule: "owner" });
  assert.deepEqual(rec({}), { to: "katrin.vogel@beiersdorf.example", rule: "starter" });
  assert.deepEqual(rec({ _created_by: { _id: "UsOther", Name: "Other" } }), { to: P.FALLBACK_RMM_EMAIL, rule: "fallback", ownerName: "Katrin Vogel" });
  assert.equal(rec({ _created_by: { _id: "UsOther", Name: "Other" } }, { ...c, fallbackRmm: "" }), null);

  const w2 = world({ props: { FALLBACK_RMM_EMAIL: undefined }, mutate: (db) => { db.CIQ_Case_A00.find((x) => x._id === CASE_ID)._created_by = { _id: "UsOther", Name: "Other", Kind: "User" }; } });
  w2.run("tick");
  assert.deepEqual(w2.world.mails.map((m) => m.to), [P.ADMIN_EMAIL], "only the admin alert");
  assert.ok(w2.caseItem().Final_Document_Hash, "the document is still filed");
  assert.equal(writesOf(w2.kf.calls).find((c) => c.write === "form-create").body.Notify_Recipient, undefined);

  const w3 = world({ mutate: (db) => { db.CIQ_Case_A00.find((x) => x._id === CASE_ID)._created_by = { _id: "UsOther", Name: "Other", Kind: "User" }; } });
  w3.run("tick");
  assert.equal(w3.world.mails[0].to, P.FALLBACK_RMM_EMAIL);
  assert.ok(w3.world.mails[0].body.endsWith("You get this mail as the fallback address for the case owner (RMM), Katrin Vogel."));
});

// ------------------------------------------------------------------ refusals, resume, pause

test("attach refused, no DRIVE_FOLDER_ID: nothing written, retried, one admin alert after 3 attempts, then skipped", () => {
  const w = world();
  w.kf.refuseAttach = true;
  for (let i = 1; i <= 3; i++) {
    w.run("tick");
    assert.equal(w.state().attempts, i);
    w.clock.advance(5 * 60000);
  }
  const writes = writesOf(w.kf.calls).filter((c) => c.path.includes(CASE_ID));
  assert.deepEqual([...new Set(writesOf(w.kf.calls).map((c) => c.write))], ["attach"], "only the refused uploads");
  assert.equal(writes.length, 3);
  assert.equal(w.caseItem().Final_Document_Hash, undefined, "no hash without a filed PDF");
  assert.deepEqual(w.world.mails.map((m) => m.to), [P.ADMIN_EMAIL], "one alert, no RMM mail");
  assert.match(w.world.mails[0].body, /ZZT-0005.*failed 3 times[\s\S]*refused the attachment \(HTTP 400\)/);
  const before = w.kf.calls.length;
  w.run("tick");
  assert.equal(writesOf(w.kf.calls.slice(before)).filter((c) => c.path.includes(CASE_ID)).length, 0, "a stuck case is skipped by the trigger");
  assert.equal(w.world.mails.length, 1, "the alert goes out once");
  w.kf.refuseAttach = false;
  const { r } = w.run("runOnce", CASE_ID);
  assert.equal(r.status, "filed", "runOnce retries a stuck case");
});

test("attach refused with DRIVE_FOLDER_ID: PDF in Drive, case fields and audit row name it, RMM mail and admin alert", () => {
  const w = world({ props: { DRIVE_FOLDER_ID: "ZZTFolder01" } });
  w.world.drive.folders.push("ZZTFolder01");
  w.kf.refuseAttach = true;
  w.run("tick");
  assert.equal(w.world.drive.files.length, 1);
  const f = w.world.drive.files[0];
  assert.equal(f.name, PDF_NAME);
  assert.deepEqual(f.viewers, ["katrin.vogel@beiersdorf.example"]);
  const sha = createHash("sha256").update(f.buf).digest("hex");
  assert.equal(w.caseItem().Final_Document_Hash, `seal:${EXPECTED.fingerprint} sha256:${sha}`);
  const a = writesOf(w.kf.calls).find((c) => c.write === "form-create").body;
  assert.ok(a.New_Value_Text.endsWith(` · Drive ${f.getUrl()}`));
  assert.ok(JSON.parse(a.Snapshot_JSON).audit[0].detail.includes("saved in Google Drive"));
  assert.deepEqual(w.world.mails.map((m) => m.to), ["katrin.vogel@beiersdorf.example", P.ADMIN_EMAIL]);
  assert.ok(w.world.mails[0].body.includes("saved in Google Drive"));
  assert.ok(w.world.mails[0].attachments[0].bytes.equals(f.buf));
});

test("resume: the PUT fails after the attach; the next tick reuses the attached PDF (one upload)", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.method === "PUT", respond: { status: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error_code: "Internal", en_message: "server error" }) } });
  w.run("tick");
  assert.equal(w.state().attempts, 1);
  assert.ok(w.state().attId);
  assert.equal(w.world.mails.length, 0);
  w.clock.advance(5 * 60000);
  w.run("tick");
  const writes = writesOf(w.kf.calls);
  assert.equal(writes.filter((c) => c.write === "attach").length, 1, "one upload");
  assert.equal(w.caseItem().Final_PDF.length, 1);
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.equal(w.world.mails.length, 1);
  assert.equal(w.state(), null);
});

test("resume: an attached PDF from a lost run is hashed from Kissflow (302 → signed URL on the same host)", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.method === "PUT", respond: { status: 500, headers: { "Content-Type": "application/json" }, body: "{}" } });
  w.run("tick");
  w.store.delete(`FD_${CASE_ID}`); // the run's state is lost
  w.clock.advance(5 * 60000);
  w.run("tick");
  const dl = w.kf.calls.filter((c) => /\/Final_PDF\/attachment\/Attach-/.test(c.path));
  assert.equal(dl.length, 1);
  assert.equal(dl[0].followRedirects, false, "the 302 is not followed blindly");
  const hop2 = w.kf.calls.filter((c) => c.path.startsWith("/signed/"));
  assert.ok(hop2.length === 1 && hop2[0].auth && hop2[0].followRedirects === false, "the signed URL is fetched without following a redirect");
  const filed = w.caseItem()._attachmentBytes[w.caseItem().Final_PDF[0].id];
  assert.ok(w.caseItem().Final_Document_Hash.endsWith(createHash("sha256").update(filed).digest("hex")));
});

test("resume: the mail fails after the hash is written; the next tick mails the filed PDF and logs the row, nothing re-rendered", () => {
  const w = world();
  w.world.mailFailures = 1;
  w.run("tick");
  const st = w.state();
  assert.equal(st.attempts, 1);
  assert.equal(st.hash, w.caseItem().Final_Document_Hash, "the hash is on the case");
  assert.equal(w.world.mails.length, 0);
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "form-create").length, 0, "no audit row yet");
  const n = w.kf.calls.length;
  w.clock.advance(5 * 60000);
  w.run("tick");
  const later = w.kf.calls.slice(n);
  assert.deepEqual(writesOf(later).map((c) => c.write), ["form-create", "form-submit"], "no second upload or PUT");
  assert.ok(later.some((c) => c.path.startsWith("/signed/")), "the filed PDF is fetched for the mail");
  assert.equal(w.world.mails.length, 1);
  const filed = w.caseItem()._attachmentBytes[w.caseItem().Final_PDF[0].id];
  assert.ok(w.world.mails[0].attachments[0].bytes.equals(filed));
  assert.equal(writesOf(later)[0].body.Notify_Recipient, "katrin.vogel@beiersdorf.example");
  assert.equal(w.state(), null);
  assert.ok(w.store.get("DONE_IDS").split(",").includes(CASE_ID));
});

test("429 pauses the script 20 min (PAUSE_UNTIL); no call while paused", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.path.includes("/CIQ_Review_A00/item"), respond: { status: 429, headers: { "Content-Type": "application/json" }, body: "{}" } });
  w.run("tick");
  const until = Number(w.store.get("PAUSE_UNTIL"));
  assert.ok(until - w.clock.now() > 19 * 60000 && until - w.clock.now() <= 20 * 60000, "about 20 min");
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.equal(w.state(), null, "a pause is not a failed attempt");
  w.clock.advance(5 * 60000);
  const n = w.kf.calls.length;
  w.run("tick");
  const r = w.run("runOnce", CASE_ID).r;
  assert.equal(w.kf.calls.length, n, "no Kissflow call while paused");
  assert.match(r.status, /^paused until/);
  w.clock.advance(16 * 60000);
  w.run("tick");
  assert.ok(w.caseItem().Final_Document_Hash, "filed after the pause");
});

test("an HTML answer (Cloudflare challenge) pauses too", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.path.includes("/CIQ_Case_A00/item"), respond: { status: 200, headers: { "Content-Type": "text/html; charset=UTF-8" }, body: "<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>" } });
  w.run("tick");
  assert.ok(Number(w.store.get("PAUSE_UNTIL")) > w.clock.now());
  assert.equal(w.kf.calls.length, 1);
  assert.ok(w.logs().some((l) => l.includes("pause 20 min") && l.includes('"why":"html"')));
});

// ------------------------------------------------------------------ the PDF's wording

test("the PDF words the document as the app's tab: labels, not codes; part 4 round by round; no internal reason", () => {
  const w = world();
  w.run("tick");
  const lines = pdfLines(writesOf(w.kf.calls)[0].multipart.file.bytes);
  const text = lines.join("\n");
  for (const want of [
    "CIQ FINAL DOCUMENT\nCETYL 16\nCetyl Alcohol\nZZT-0005\nDocument seal: unchanged",
    "Target markets\nEuropean Union",
    "Case owner (RMM)\nKatrin Vogel",
    "1. Released answers by section",
    "General information  Mandatory",
    "Metadata answers  SF-01 to SF-12 · they set the scope",
    "SF-11  Target markets of the raw material\nEuropean Union\nSet by Beiersdorf at case start",
    "K2.1 Components and additives  Mandatory",
    "Further sections in scope",
    "K6.8  Halal and kosher status  Optional\nNo document provided",
    "K3  Storage conditions and handling\nNo document provided\nMandatory",
    "2. Composition (K2.1)",
    "#\nINCI / IUPAC\nCAS\nEC / REACH no.\nFunction\nOrigin\nAdditive\nConcentration",
    "Cetyl Alcohol\n8001-25-0\n—\nemollient\nVegetable\nNo\n90–99 %", // testkit fillMandatory's row since 28 Oct
    "3. Evidence",
    "Document\nSection / question\nUploaded by\nUpload date",
    "FLD-K1-003_statement.pdf\nK1\nRaw material specification\nElena Márquez",
    "4. Open points, round by round",
    "OP-0005-01 · Query · K1 › specification",
    "Raised by Katrin Vogel, 20 Oct 2026, 10:00 CEST · Accepted",
    "ROUND 2",
    "Katrin Vogel (Beiersdorf) · Returned to supplier · 20 Oct 2026, 12:00 CEST",
    "Katrin Vogel (Beiersdorf) · Changed by the raiser · 20 Oct 2026, 12:05 CEST",
    "Elena Márquez (supplier) · Answered · 20 Oct 2026, 11:00 CEST\nSee the attached statement.\nAttachment: FLD-K1-003_statement.pdf",
    "OP-0005-02 · Document request · K4.1 › toxicity data",
    "Elena Márquez (supplier) · Cannot provide (justified)",
    "Dr. Mira Hansen (Beiersdorf) · Closed as not accepted · 20 Oct 2026, 13:30 CEST\nClosed as not accepted.",
    "5. Confirmations",
    "None of these confirmations is a raw-material approval.",
    "ZZT-0005-FD · generated 20 Oct 2026, 14:00 CEST", // 28 Oct: two steps earlier (no Sustainability review in the fixtures), then four more (FLD-A2-101 pre-filled when Annex 2 opens, M9: one answer step less per fixture case)
    `Document seal ${EXPECTED.fingerprint}`,
    "The SHA-256 of this PDF is filed on the case (Final Document Hash).",
  ]) assert.ok(text.includes(want), `the PDF lacks: ${want}`);
  for (const code of ["Target markets\nEU\n", "  mandatory", "  optional", "\nvegetable\n", " on K1 ›", "raised:", "answered:", "returned:", "note:", "No answers recorded.", "Section justification", "ZZT internal", "[attachment:"]) assert.ok(!text.includes(code), `the PDF still prints: ${code}`);
  // every page: the footer with "Page X of Y"; from page 2 on, the running header
  const pages = (pdfText(writesOf(w.kf.calls)[0].multipart.file.bytes).match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pages >= 2, `${pages} pages`);
  for (let i = 1; i <= pages; i++) assert.ok(lines.includes(`Page ${i} of ${pages}`), `page ${i} of ${pages}`);
  assert.equal(lines.filter((l) => l === `ZZT-0005-FD · document seal ${EXPECTED.fingerprint}`).length, pages, "the footer on every page");
  assert.equal(lines.filter((l) => l === "ZZT-0005 · CETYL 16").length, pages - 1, "the running header from page 2 on");
});

test("a long case through the bundle (long-case.mjs): deterministic, every page footed, headers repeated, threads continued", () => {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(resolve(GS_DIR, "Bundle.gs"), "utf8"), ctx, { filename: "Bundle.gs" });
  ctx.doc = clone({ ...longCase(EXPECTED), fingerprint: EXPECTED.fingerprint });
  const render = () => Buffer.from(Uint8Array.from(vm.runInContext("CIQFinal.renderPdf(doc, {})", ctx)));
  const pdf = render();
  assert.ok(pdf.equals(render()), "the same document gives the same bytes");
  const lines = pdfLines(pdf);
  const pages = (pdfText(pdf).match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pages >= 10, `${pages} pages`);
  for (let i = 1; i <= pages; i++) assert.ok(lines.includes(`Page ${i} of ${pages}`));
  assert.equal(lines.filter((l) => l === `ZZT-0099-FD · document seal ${EXPECTED.fingerprint}`).length, pages);
  assert.ok(lines.includes("Document seal broken"), "a document whose content no longer matches its seal says so, as the tab does");
  assert.ok(lines.filter((l) => l === "#").length >= 2, "the composition header repeats on its next page");
  assert.ok(lines.some((l) => / · .*  \(continued\)$/.test(l)), "an open point continues under its strip");
  for (const want of ["European Union, United Kingdom, Turkey, China, USA", "K6.8 Halal and kosher status  Not applicable, justified", "Jürgen Weiß (supplier) · Answered · 2026-10-20 07:35 UTC"]) assert.ok(lines.includes(want), want);
  assert.ok(lines.join(" ").includes("LIPOFLUID ÖLPHASE 7 – Pflegeöl für Gesichtscremes (Qualität „Süd“)"), "umlauts, the en dash and German quotes in WinAnsi (the title wraps)");
});

// ------------------------------------------------------------------ lost answers, the time limit, resume without duplicates

test("a lost answer to the case-field PUT: the next tick finds its own hash and only mails and logs the row", () => {
  const w = world();
  w.kf.lost.push({ match: (c) => c.method === "PUT", respond: answer(504, { error_code: "GatewayTimeout" }) });
  w.run("tick");
  const st = w.state();
  assert.ok(w.caseItem().Final_Document_Hash, "Kissflow applied the PUT");
  assert.equal(st.pendingHash, w.caseItem().Final_Document_Hash, "the planned hash was kept before the PUT");
  assert.equal(st.hash, undefined);
  assert.equal(st.attempts, 1);
  assert.equal(w.world.mails.length, 0);
  const n = w.kf.calls.length;
  w.clock.advance(5 * 60000);
  w.run("tick");
  const later = w.kf.calls.slice(n);
  assert.deepEqual(writesOf(later).map((c) => c.write), ["form-create", "form-submit"], "no second upload or PUT");
  assert.equal(rmmMails(w).length, 1);
  assert.equal(auditRows(w).length, 1);
  assert.equal(w.state(), null);
  assert.ok(w.store.get("DONE_IDS").split(",").includes(CASE_ID));
  assert.ok(w.logs().some((l) => l.includes("[CIQ-FD] case fields found written")));
});

test("another hash on the case is left alone: no mail, no row, done", () => {
  const w = world();
  w.store.set(`FD_${CASE_ID}`, JSON.stringify({ attempts: 1, code: "ZZT-0005", pendingHash: "seal:aaaaaaaaaaaaaaaa sha256:" + "b".repeat(64) }));
  w.caseItem().Final_Document_Hash = "seal:cccccccccccccccc sha256:" + "d".repeat(64);
  w.run("tick");
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.equal(w.world.mails.length, 0);
  assert.equal(w.state(), null);
});

test("the run's time limit right after the PUT: not an attempt; the next tick finishes the mail and the row", () => {
  const w = world();
  w.kf.onCall = (c) => { if (c.method === "PUT") w.clock.advance(6 * 60000); }; // a PUT that took 6 min
  w.run("tick");
  const st = w.state();
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.ok(st && !st.attempts && st.lastStop, "kept for the next tick, no attempt counted");
  assert.equal(w.world.mails.length, 0, "no mail past the time limit");
  assert.ok(w.logs().some((l) => l.includes("[CIQ-FD] tick stopped: time is up")));
  w.kf.onCall = null;
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.equal(rmmMails(w).length, 1);
  assert.equal(auditRows(w).length, 1);
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "put").length, 1);
  assert.equal(w.state(), null);
});

test("a case whose reads end near the time limit makes no write; the next tick files it, no attempt counted", () => {
  const w = world();
  let slow = true;
  w.kf.onCall = (c) => {
    if (slow && c.path.endsWith("/CIQ_Config_Version_A00/list")) {
      slow = false;
      w.clock.advance(170 * 1000);
    }
  };
  w.run("tick");
  assert.equal(writesOf(w.kf.calls).length, 0, "no write with less than 2 min left");
  const st = w.state();
  assert.ok(st && !st.attempts && st.lastStop);
  assert.ok(w.logs().some((l) => l.includes("[CIQ-FD] case stopped: time is up")));
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.equal(rmmMails(w).length, 1);
  assert.equal(w.state(), null);
});

test("the run ends right after the RMM mail went out (the 6-min kill): no second mail; the admin is told; the row is logged", () => {
  const w = world();
  const ex = execution({ fetch: w.kf.handle, store: w.store, world: w.world, clock: w.clock, killWhen: (e) => e.type === "mail" && e.mail.subject.endsWith(": final document ready") });
  w.runs.push(ex);
  assert.throws(() => ex.call("tick"), /Exceeded maximum execution time/);
  assert.equal(rmmMails(w).length, 1);
  const st = w.state();
  assert.ok(st.mailingAt && !st.mailedAt, "the state shows the mail was being sent");
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.equal(rmmMails(w).length, 1, "not sent twice");
  const alert = w.world.mails.find((m) => m.to === P.ADMIN_EMAIL);
  assert.match(alert.body, /stopped while the final-document mail of ZZT-0005[\s\S]*not sent again/);
  assert.equal(auditRows(w).length, 1);
  assert.equal(auditRows(w)[0].Notify_Recipient, "katrin.vogel@beiersdorf.example");
  assert.equal(w.state(), null);
});

test("the run ends right after the audit submit: the next run finds the kept id and checks that row, never a second", () => {
  const w = world();
  const ex = execution({ fetch: w.kf.handle, store: w.store, world: w.world, clock: w.clock, killWhen: (e) => e.type === "fetch" && /\/CIQ_Audit_Event_A00\/draft_[^/]+\/submit$/.test(new URL(e.url).pathname) });
  w.runs.push(ex);
  assert.throws(() => ex.call("tick"), /Exceeded maximum execution time/);
  assert.equal(auditRows(w).length, 1, "the row was submitted");
  assert.ok(w.state().auditData && !w.state().auditId, "killed before the id was kept");
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.equal(auditRows(w).length, 1, "found by Event_Key, not written again");
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "form-create").length, 1);
  assert.equal(w.state(), null);
});

test("the audit row's read-back fails after the submit: the kept id is checked on the next run, no second row", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.method === "GET" && /\/CIQ_Audit_Event_A00\/PkZZTAud/.test(c.path), respond: answer(500, { error_code: "Internal" }) });
  w.run("tick");
  const st = w.state();
  assert.ok(st.auditId && !st.auditVerified, "the new id was kept before its read-back");
  assert.equal(st.attempts, 1);
  w.kf.auditListWithoutSnapshot = true; // and the list cannot help: the kept id must
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "form-create").length, 1);
  assert.equal(auditRows(w).length, 1);
  assert.ok(w.kf.calls.filter((c) => c.method === "GET" && c.path.endsWith(`/CIQ_Audit_Event_A00/${st.auditId}`)).length >= 2, "read back again");
  assert.equal(w.state(), null);
});

// ------------------------------------------------------------------ files already on the case, the signed download

test("a same-named file without this document's seal on Final_PDF (a K-15 probe upload) stops the case: never filed or mailed", () => {
  const probe = { key: "Final_PDF", id: "Attach-ZZTprobe", name: PDF_NAME, size: 30, fileExtension: "pdf" };
  const w = world({ mutate: (db) => Object.assign(db.CIQ_Case_A00.find((x) => x._id === CASE_ID), { Final_PDF: [probe], _attachmentBytes: { [probe.id]: Buffer.from("%PDF-1.4\n% K-15 probe\n%%EOF\n") } }) });
  w.run("tick");
  assert.equal(writesOf(w.kf.calls).length, 0, "no upload, no hash, no row");
  assert.deepEqual(w.world.mails.map((m) => m.to), [P.ADMIN_EMAIL], "only the admin alert, at once");
  assert.match(w.world.mails[0].body, /ZZT-0005 \(case item AppZZT-0005\) was stopped[\s\S]*Attach-ZZTprobe \(seal none\)/);
  assert.equal(w.state().attempts, 3, "the trigger skips it now");
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.equal(w.world.mails.length, 1);
  w.caseItem().Final_PDF = []; // a person removed the probe file
  assert.equal(w.run("runOnce", CASE_ID).r.status, "filed");
  assert.equal(rmmMails(w).length, 1);
});

test("a same-named older render with another seal stops the case too", () => {
  const old = { key: "Final_PDF", id: "Attach-ZZTold", name: PDF_NAME, size: 60, fileExtension: "pdf" };
  const w = world({ mutate: (db) => Object.assign(db.CIQ_Case_A00.find((x) => x._id === CASE_ID), { Final_PDF: [old], _attachmentBytes: { [old.id]: Buffer.from("%PDF-1.4\n<< /Subject (document seal 0123456789abcdef) >>\n%%EOF\n") } }) });
  w.run("tick");
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.match(w.state().lastError, /Attach-ZZTold \(seal 0123456789abcdef\)/);
});

test("the signed download never follows a further redirect with the key", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.method === "PUT", respond: answer(500) });
  w.run("tick");
  w.store.delete(`FD_${CASE_ID}`); // the run's state is lost: the attached file must be downloaded to be hashed
  w.kf.signedRedirect = true;
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.ok(!w.kf.calls.some((c) => c.host !== P.KF_DOMAIN), "no call left KF_DOMAIN (the key never went to storage)");
  assert.match(w.state().lastError, /signed download failed: HTTP 302/);
  assert.equal(w.caseItem().Final_Document_Hash, undefined);
});

// ------------------------------------------------------------------ the attachment: busy, silent failures, Drive

test("attach answers 423 once: tried again in the same run (after a read), attached once", () => {
  const w = world();
  w.kf.faults.push({ match: isAttach, respond: answer(423, { error_code: "Locked" }) });
  w.run("tick");
  assert.equal(w.kf.calls.filter(isAttach).length, 2);
  assert.equal(w.caseItem().Final_PDF.length, 1);
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.ok(w.logs().some((l) => l.includes("[CIQ-FD] attach busy, tried again")));
  assert.equal(w.world.drive.files.length, 0);
});

test("a lost attach answer: the next run adopts the landed file (its seal matches), one upload", () => {
  const w = world();
  w.kf.lost.push({ match: isAttach, respond: answer(502) });
  w.run("tick");
  assert.equal(w.state().attempts, 1);
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "attach").length, 1);
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.ok(w.logs().some((l) => l.includes("[CIQ-FD] attached PDF reused")));
});

for (const [what, respond] of [["2xx without the file", answer(200, { Final_PDF: [], _id: CASE_ID })], ["HTTP 500", answer(500, { error_code: "Internal" })]]) {
  test(`attach answers ${what} three times, DRIVE_FOLDER_ID set: the third attempt files it in Drive`, () => {
    const w = world({ props: { DRIVE_FOLDER_ID: "ZZTFolder01" } });
    w.world.drive.folders.push("ZZTFolder01");
    w.kf.faults.push({ match: isAttach, respond, times: 3 });
    for (let i = 1; i <= 2; i++) {
      w.run("tick");
      assert.equal(w.state().attempts, i);
      assert.equal(w.world.drive.files.length, 0);
      w.clock.advance(5 * 60000);
    }
    w.run("tick");
    assert.equal(w.world.drive.files.length, 1);
    assert.ok(w.caseItem().Final_Document_Hash);
    assert.deepEqual(w.world.mails.map((m) => m.to), ["katrin.vogel@beiersdorf.example", P.ADMIN_EMAIL], "the RMM mail and the Drive alert, no failure alert");
    assert.equal(w.state(), null);
  });
}

test("Drive fallback: never another case's same-named file; a resumed filing reuses its own; not shared while mail is off", () => {
  const w = world({ props: { DRIVE_FOLDER_ID: "ZZTFolder01", MAIL_ENABLED: "false" } });
  w.world.drive.folders.push("ZZTFolder01");
  const ex = w.exec();
  const other = ex.ctx.DriveApp.getFolderById("ZZTFolder01").createFile(ex.ctx.Utilities.newBlob(Buffer.from("%PDF-1.4 other"), "application/pdf", PDF_NAME));
  other.setDescription("CIQ final document of case item AppZZT-00051 · document seal 0123456789abcdef");
  w.kf.refuseAttach = true;
  w.kf.faults.push({ match: (c) => c.method === "PUT", respond: answer(500) });
  w.run("tick");
  assert.equal(w.world.drive.files.length, 2, "a new file, not the other case's");
  const mine = w.world.drive.files[1];
  assert.equal(mine.description, `CIQ final document of case item ${CASE_ID} · document seal ${EXPECTED.fingerprint}`);
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.equal(w.world.drive.files.length, 2, "the resumed filing reuses its own Drive file");
  assert.ok(w.caseItem().Final_Document_Hash.endsWith(createHash("sha256").update(mine.buf).digest("hex")));
  assert.deepEqual(mine.viewers, [], "not shared: sharing sends Google Drive's own mail");
  assert.deepEqual(w.world.mails.map((m) => m.to), [P.ADMIN_EMAIL]);
  assert.match(w.world.mails[0].body, /not shared with the RMM owner/);
});

// ------------------------------------------------------------------ which cases are read again

test("a cancelled case that is not completed is read again: reactivated and released later, it is filed", () => {
  const w = world({ mutate: (db) => Object.assign(db.CIQ_Case_A00.find((x) => x._id === CASE_ID), { _status: "InProgress", Case_Phase: "Cancelled", Cancelled_At: "2026-10-20T10:00:00Z" }) });
  w.run("tick");
  assert.ok(!String(w.store.get("ENDED_IDS") || "").split(",").includes(CASE_ID), "not ended for good");
  Object.assign(w.caseItem(), { _status: "Completed", Case_Phase: "Completed", Reactivated_At: "2026-10-20T11:00:00Z" });
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.ok(w.caseItem().Final_Document_Hash);
});

test("completed cases that never get a document are remembered, so they do not crowd out a new one", () => {
  const w = world({
    props: { MAX_GETS_PER_TICK: "3" },
    mutate: (db) => {
      const base = db.CIQ_Case_A00.find((x) => x._id === CASE_ID);
      db.CIQ_Case_A00.unshift(...["ZZT-0010", "ZZT-0011", "ZZT-0012"].map((code) => variant(base, code, { Final_Release_Confirm: undefined, Final_Release_At: undefined })));
    },
  });
  w.run("tick");
  const ended = w.store.get("ENDED_IDS").split(",");
  for (const id of ["AppZZT-0010", "AppZZT-0011", "AppZZT-0012"]) assert.ok(ended.includes(id), `${id}: completed without a release, ended`);
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.ok(w.caseItem().Final_Document_Hash, "ZZT-0005 is reached on the next tick");
});

test("RELEASED_AFTER: a completed older case is remembered for that cut-off only; runOnce files it anyway", () => {
  const w = world({ props: { RELEASED_AFTER: "2026-10-21T00:00:00Z" } });
  w.run("tick");
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.ok(w.store.get("OLD_IDS").split(",").includes(CASE_ID));
  assert.equal(w.store.get("OLD_IDS_FOR"), "2026-10-21T00:00:00Z");
  const n = w.kf.calls.length;
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.ok(!w.kf.calls.slice(n).some((c) => c.path.endsWith(`/CIQ_Case_A00/${CASE_ID}`)), "not read again");
  w.store.set("RELEASED_AFTER", "2026-10-01T00:00:00Z");
  w.clock.advance(5 * 60000);
  w.run("tick");
  assert.ok(w.caseItem().Final_Document_Hash, "an earlier cut-off: filed");
  assert.equal(w.store.get("OLD_IDS"), undefined);

  const w2 = world({ props: { RELEASED_AFTER: "2026-10-21T00:00:00Z" } });
  assert.equal(w2.run("runOnce", CASE_ID).r.status, "filed", "a manual run files a case released before the cut-off");
});

test("a review list without Case_Item_Id and no q hits: at most 100 reviews are read for a case", () => {
  const w = world({
    mutate: (db) => {
      for (let i = 0; i < 120; i++) db.CIQ_Review_A00.push({ _id: `PkRevZZTX${String(i).padStart(3, "0")}`, _status: "Completed", Case_Item_Id: "AppZZT-9999", Case_Code: "ZZT-9999", Review_Dept: "RMM" });
      db.CIQ_Audit_Event_A00 = db.CIQ_Audit_Event_A00.filter((r) => !(r.Case_Item_Id === CASE_ID && r.Event_Category === "Review"));
    },
  });
  w.kf.searchFindsNothing = true;
  w.kf.listWithoutCaseRef = true;
  w.run("tick");
  assert.match(w.state().lastError, /items to read for one case \(cap 100\)/);
  assert.ok(!w.kf.calls.some((c) => /\/admin\/CIQ_Review_A00\/PkRev/.test(c.path)), "no review read one by one");
  assert.equal(writesOf(w.kf.calls).length, 0);
});

test("the app's builder fails on a completed case: the error names it, not 'not completed'", () => {
  const w = world();
  const ex = w.exec();
  vm.runInContext('CIQFinal = Object.assign({}, CIQFinal, { finalDocumentFor: function () { return { phase: "completed", ok: false, warnings: ["ZZT-0005: the final document could not be computed (boom)."] }; } });', ex.ctx);
  ex.call("tick");
  assert.match(w.state().lastError, /^the app could not build the final document: ZZT-0005: the final document could not be computed \(boom\)\.$/);
});

test("installTrigger sets an empty RELEASED_AFTER to now: the trigger files no older release; a set one is kept", () => {
  const w = world();
  w.run("installTrigger");
  assert.equal(w.store.get("RELEASED_AFTER"), iso(NOW0));
  assert.ok(w.logs().some((l) => l.includes('"mailEnabled":true') && l.includes("trigger installed")));
  w.run("tick");
  assert.equal(writesOf(w.kf.calls).length, 0, "no backfill: ZZT-0005 was released before");
  w.store.set("RELEASED_AFTER", "2026-10-01T00:00:00Z");
  w.run("installTrigger");
  assert.equal(w.store.get("RELEASED_AFTER"), "2026-10-01T00:00:00Z");
});

test("Bundle.gs and Code.gs as one script (Bundle's strict mode over both) still file the case", () => {
  const w = world();
  const ex = execution({ fetch: w.kf.handle, store: w.store, world: w.world, clock: w.clock, concat: true });
  w.runs.push(ex);
  ex.call("tick");
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.equal(rmmMails(w).length, 1);
});

// ------------------------------------------------------------------ doPost, probe, triggers, cache

test("doPost: off without DOPOST_TOKEN, refuses a wrong token or id, files with the right token", () => {
  const post = (w, body) => JSON.parse(w.run("doPost", { postData: { contents: JSON.stringify(body) } }).r.getContent());
  const w0 = world();
  assert.deepEqual(post(w0, { caseItemId: CASE_ID, token: "x" }), { ok: false, status: "disabled" });
  assert.equal(w0.kf.calls.length, 0);
  const w = world({ props: { DOPOST_TOKEN: "zzt-dopost-token-77aa" } });
  assert.deepEqual(post(w, { caseItemId: CASE_ID, token: "zzt-dopost-token-77ab" }), { ok: false, status: "refused" });
  assert.deepEqual(post(w, { caseItemId: CASE_ID }), { ok: false, status: "refused" });
  const inUrl = JSON.parse(w.run("doPost", { parameter: { token: "zzt-dopost-token-77aa" }, postData: { contents: JSON.stringify({ caseItemId: CASE_ID }) } }).r.getContent());
  assert.deepEqual(inUrl, { ok: false, status: "refused" }, "a token in the URL is never taken");
  assert.deepEqual(post(w, { caseItemId: "../../x", token: "zzt-dopost-token-77aa" }), { ok: false, status: "bad case item id" });
  assert.equal(w.kf.calls.length, 0, "no Kissflow call before the token and id pass");
  assert.deepEqual(post(w, { caseItemId: CASE_ID, token: "zzt-dopost-token-77aa" }), { ok: true, status: "filed" });
  assert.deepEqual(post(w, { caseItemId: CASE_ID, token: "zzt-dopost-token-77aa" }), { ok: true, status: "already filed" });
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "attach").length, 1);
});

test("probe is read-only and logs field names, never values", () => {
  const w = world();
  const props = JSON.stringify([...w.store]);
  w.run("probe");
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.equal(JSON.stringify([...w.store]), props, "no Script Property changed");
  assert.equal(w.world.mails.length, 0);
  const logs = w.logs().join("\n");
  assert.ok(logs.includes("Final_Release_At") && logs.includes("Case_Code"), "field names are logged");
  assert.ok(logs.includes('"eligible":[{"caseItemId":"AppZZT-0005","caseCode":"ZZT-0005"}]'), logs.split("\n").find((l) => l.includes("eligible")));
  for (const value of ["CETYL 16", "Katrin", "Elena", "Solvaro", "katrin.vogel", "Final release by"]) assert.ok(!logs.includes(value), `value in the probe log: ${value}`);
  // the Drive fallback's folder is checked when it is set (its name is never logged)
  const w2 = world({ props: { DRIVE_FOLDER_ID: "ZZTFolder01" } });
  w2.run("probe");
  assert.ok(w2.logs().some((l) => l.includes('[CIQ-FD] probe: DRIVE_FOLDER_ID {"access":false')));
  w2.world.drive.folders.push("ZZTFolder01");
  w2.run("probe");
  assert.ok(w2.logs().some((l) => l.includes('[CIQ-FD] probe: DRIVE_FOLDER_ID {"access":true}')));
  assert.ok(!w2.logs().join("\n").includes("ZZT folder"));
});

test("installTrigger keeps one 5-minute tick trigger; removeTriggers removes it", () => {
  const w = world();
  w.run("installTrigger");
  w.run("installTrigger");
  assert.equal(w.world.triggers.length, 1);
  assert.equal(w.world.triggers[0].fn, "tick");
  assert.equal(w.world.triggers[0].everyMinutes, 5);
  w.run("removeTriggers");
  assert.equal(w.world.triggers.length, 0);
  w.store.set("TICK_MINUTES", "15");
  w.run("installTrigger");
  assert.deepEqual(w.world.triggers.map((t) => t.everyMinutes), [15], "TICK_MINUTES");
});

test("configuration rows: read in full once, cached 30 min in chunks under 100 KB", () => {
  const w = world();
  const ex = w.exec();
  ex.ctx.begin_();
  const rows = ex.ctx.configRows_(ex.ctx.ctx_());
  assert.equal(rows.length, fx.db.config.length);
  const n = w.kf.calls.length;
  assert.ok(n >= 1 + fx.db.config.length, "list + one GET per row");
  const ex2 = w.exec();
  ex2.ctx.begin_();
  assert.equal(ex2.ctx.configRows_(ex2.ctx.ctx_()).length, rows.length);
  assert.equal(w.kf.calls.length, n, "the second run reads the cache");
  w.clock.advance(31 * 60000);
  const ex3 = w.exec();
  ex3.ctx.begin_();
  ex3.ctx.configRows_(ex3.ctx.ctx_());
  assert.ok(w.kf.calls.length > n, "after 30 min Kissflow is read again");
});

test("a run without the lock does nothing", () => {
  const w = world();
  const ex = execution({ fetch: w.kf.handle, store: w.store, world: w.world, clock: w.clock, lockFree: () => false });
  w.runs.push(ex);
  ex.call("tick");
  ex.call("probe");
  assert.equal(w.kf.calls.length, 0, "tick and probe make no call while another run holds the lock");
  assert.ok(ex.logs.some((l) => l.includes("[CIQ-FD] probe skipped: another run holds the lock")));
  assert.equal(ex.call("runOnce", CASE_ID).status, "busy: another run holds the lock");
});

// ------------------------------------------------------------------ the live harness (live.mjs), offline

/** A stand-in for execFileSync("curl", argv): checks the header file and argv, then asks the fake Kissflow. */
function curlStandIn(kf, env, seen) {
  return (cmd, argv) => {
    assert.equal(cmd, "curl");
    const opt = (flag) => argv[argv.indexOf(flag) + 1];
    const all = (flag) => argv.flatMap((a, i) => (a === flag ? [argv[i + 1]] : []));
    for (const s of [env.KF_ACCESS_KEY_ID, env.KF_ACCESS_KEY_SECRET]) assert.ok(!argv.join(" ").includes(s), "a key in curl's argv");
    assert.ok(!argv.includes("-L") && !argv.includes("--location"), "curl must not follow redirects");
    const hdrFile = all("-H").find((h) => h.startsWith("@")).slice(1);
    assert.equal(statSync(hdrFile).mode & 0o777, 0o600, "header file mode 600");
    assert.equal(statSync(dirname(hdrFile)).mode & 0o777, 0o700, "header folder mode 700");
    seen.push(dirname(hdrFile));
    const headers = Object.fromEntries(readFileSync(hdrFile, "utf8").trim().split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
    const params = { method: opt("-X").toLowerCase(), headers, muteHttpExceptions: true, followRedirects: false };
    const data = all("--data-binary")[0];
    if (data) {
      params.payload = readFileSync(data.slice(1), "utf8");
      params.contentType = all("-H").find((h) => h.startsWith("Content-Type:")).split(": ")[1];
    }
    for (const f of all("-F")) {
      const [, field, path, type, name] = /^([^=]+)=@([^;]+);type=([^;]+);filename=(.+)$/.exec(f);
      params.payload = { ...(params.payload ?? {}), [field]: new GasBlob(readFileSync(path), type, name) };
    }
    const r = kf.handle(argv.at(-1), params);
    const head = Object.entries(r.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\r\n");
    writeFileSync(opt("-D"), `HTTP/2 ${r.status}\r\n${head}\r\n\r\n`);
    writeFileSync(opt("-o"), Buffer.isBuffer(r.body) ? r.body : Buffer.from(String(r.body ?? "")));
    return String(r.status);
  };
}

function harnessRun(apply) {
  const w = world();
  const env = { KF_DOMAIN: P.KF_DOMAIN, KF_ACCOUNT_ID: P.KF_ACCOUNT_ID, KF_ACCESS_KEY_ID: P.KF_ACCESS_KEY_ID, KF_ACCESS_KEY_SECRET: P.KF_ACCESS_KEY_SECRET };
  const outDir = mkdtempSync(resolve(here, ".tmp-live-"));
  const seen = [];
  try {
    const live = liveTransport({ domain: env.KF_DOMAIN, apply, call: curlCall({ env, tmpRoot: outDir, paceMs: 0, exec: curlStandIn(w.kf, env, seen), sleep: () => {} }) });
    const store = new Map(Object.entries(liveProps(env)));
    const ex = execution({ fetch: live.transport, store, clock: w.clock });
    w.runs.push(ex);
    const r = ex.call("runOnce", CASE_ID);
    assert.deepEqual(readdirSync(outDir), [], "every curl folder (header file included) is deleted");
    assert.ok(seen.length > 10 && seen.every((d) => !existsSync(d)));
    return { w, r, live, store };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

test("live harness, dry run: reads only, the PDF and the planned writes, 8 s pacing", () => {
  const { w, r, live, store } = harnessRun(false);
  assert.equal(r.status, "filed", "the pipeline runs to the end on the planned writes");
  assert.equal(w.kf.writes().length, 0, "no write reached Kissflow");
  assert.equal(w.caseItem().Final_Document_Hash, undefined);
  const want = [
    ["POST", new RegExp(`/admin/CIQ_Case_A00/${CASE_ID}/Final_PDF/attachment$`)],
    ["PUT", new RegExp(`/admin/CIQ_Case_A00/${CASE_ID}$`)],
    ["POST", /^\/form\/2\/[^/]+\/CIQ_Audit_Event_A00$/],
    ["POST", /\/CIQ_Audit_Event_A00\/draft_planned\/submit$/],
  ];
  assert.equal(live.planned.length, want.length, live.planned.map((x) => `${x.method} ${x.path}`).join("\n"));
  want.forEach(([m, re], i) => assert.ok(live.planned[i].method === m && re.test(live.planned[i].path), `${live.planned[i].method} ${live.planned[i].path}`));
  assert.equal(live.planned[0].file.name, PDF_NAME);
  assert.equal(live.pdf().name, PDF_NAME);
  assert.ok(pdfText(live.pdf().bytes).startsWith("%PDF-1.4"));
  assert.equal(live.planned[1].body.Final_Document_Hash, `seal:${EXPECTED.fingerprint} sha256:${createHash("sha256").update(live.pdf().bytes).digest("hex")}`);
  assert.equal(live.planned[2].body.Notify_Recipient, undefined, "MAIL_ENABLED is false in the harness: no notification recorded");
  assert.equal(w.world.mails.length, 0);
  const calls = w.kf.calls;
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at - calls[i - 1].at >= 8000, "8 s between calls");
  assert.ok(!Object.keys(keptState(store)).some((k) => k.startsWith("KF_")), "the kept state holds no connection data");
});

test("live harness, --apply: the writes reach Kissflow and are read back", () => {
  const { w, r, live } = harnessRun(true);
  assert.equal(r.status, "filed");
  assert.deepEqual(w.kf.writes().map((c) => c.write), ["attach", "put", "form-create", "form-submit"]);
  assert.equal(live.planned.length, 0);
  assert.ok(w.caseItem().Final_Document_Hash.startsWith(`seal:${EXPECTED.fingerprint} sha256:`));
  assert.equal(w.kf.writes()[0].multipart.file.name, PDF_NAME, "multipart through curl -F");
});

test("live harness runs only on the dev sandbox account and host", () => {
  assert.match(refusal({ KF_ACCOUNT_ID: "AcOther", KF_DOMAIN: "dev-beiersdorf.kissflow.eu" }), /^Refused/);
  assert.match(refusal({ KF_ACCOUNT_ID: "AcDOSunMEpSA", KF_DOMAIN: "beiersdorf.kissflow.eu" }), /^Refused/);
  assert.match(refusal({ KF_ACCOUNT_ID: "AcDOSunMEpSA", KF_DOMAIN: "dev-other.kissflow.eu" }), /^Refused/, "any other host too");
  assert.match(refusal({ KF_ACCOUNT_ID: "AcDOSunMEpSA" }), /^Refused/, "no host");
  assert.equal(refusal({ KF_ACCOUNT_ID: "AcDOSunMEpSA", KF_DOMAIN: "dev-beiersdorf.kissflow.eu" }), "");
});

test("live harness: its own 8 s between curl calls, on its clock", () => {
  const dir = mkdtempSync(resolve(here, ".tmp-pace-"));
  try {
    const clock = { t: 1_000_000 };
    const sleeps = [];
    const exec = (cmd, argv) => {
      writeFileSync(argv[argv.indexOf("-D") + 1], "HTTP/2 200\r\nContent-Type: application/json\r\n\r\n");
      writeFileSync(argv[argv.indexOf("-o") + 1], "{}");
      return "200";
    };
    const env = { KF_DOMAIN: P.KF_DOMAIN, KF_ACCESS_KEY_ID: P.KF_ACCESS_KEY_ID, KF_ACCESS_KEY_SECRET: P.KF_ACCESS_KEY_SECRET };
    const call = curlCall({ env, tmpRoot: dir, exec, now: () => clock.t, sleep: (ms) => { sleeps.push(ms); clock.t += Math.max(0, ms); } });
    const url = `https://${P.KF_DOMAIN}/x`;
    call(url, { method: "get" });
    clock.t += 1000;
    call(url, { method: "get" });
    call(url, { method: "get" });
    assert.deepEqual(sleeps, [7000, 8000], "the first call does not wait; then 8 s after the previous call");
    assert.deepEqual(readdirSync(dir), [], "no curl folder left");
    assert.throws(() => call("https://storage.zzt.example/x", { method: "get" }), /another host/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("live harness: a dry run keeps only the pause; leftover curl folders are swept", () => {
  const store = new Map([["KF_ACCESS_KEY_SECRET", "s"], ["PAUSE_UNTIL", "123"], ["DONE_IDS", "AppZZT-0005"], [`FD_${CASE_ID}`, '{"attId":"planned-attachment"}']]);
  const saved = { DONE_IDS: "AppZZT-0001", [`FD_${CASE_ID}`]: '{"attempts":1}' };
  assert.deepEqual(stateToSave(store, saved, false), { ...saved, PAUSE_UNTIL: "123" }, "the planned ids never reach the saved state");
  assert.deepEqual(stateToSave(store, saved, true), { PAUSE_UNTIL: "123", DONE_IDS: "AppZZT-0005", [`FD_${CASE_ID}`]: '{"attId":"planned-attachment"}' }, "an --apply run keeps its state, never the connection");
  const dir = mkdtempSync(resolve(here, ".tmp-sweep-"));
  try {
    mkdtempSync(resolve(dir, "ciq-fd-curl-"));
    mkdtempSync(resolve(dir, "other-"));
    assert.equal(sweepCurlDirs(dir), 1);
    assert.deepEqual(readdirSync(dir).map((n) => n.replace(/-.*/, "")), ["other"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ secrets (last: every world above)

test("no key, token, webhook URL, e-mail address or person's name in any log; no secret in mails or Kissflow writes", () => {
  assert.ok(everything.length >= 10);
  const people = ["Katrin", "Vogel", "Elena", "Márquez", "Ravi", "Menon", "Joana", "Jonas", "Mira"];
  for (const w of everything) {
    const logs = w.logs().join("\n");
    for (const s of SECRETS) assert.ok(!logs.includes(s), `secret in a log: ${s.slice(0, 6)}…`);
    assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(logs), `e-mail in a log: ${logs.match(/\S+@\S+/)?.[0]}`);
    assert.ok(!/https?:\/\//.test(logs), "URL in a log");
    for (const p of people) assert.ok(!logs.includes(p), `name in a log: ${p}`);
    for (const m of w.world.mails) for (const s of SECRETS) assert.ok(!`${m.subject}\n${m.body}`.includes(s), "secret in a mail");
    for (const c of writesOf(w.kf.calls)) for (const s of SECRETS) assert.ok(!JSON.stringify(c.body ?? {}).includes(s), "secret in a Kissflow write");
  }
});

// 22 Oct live test (ZZT-NT2-N1): a component without an origin crashed displayCopy ("reading 'split'") before any write
test("the PDF renders when optional values are missing (a component without origin, empty lists)", () => {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(resolve(GS_DIR, "Bundle.gs"), "utf8"), ctx, { filename: "Bundle.gs" });
  const c = fx.db.case.find((x) => x._id === CASE_ID);
  ctx.input = clone({ caseItem: c, reviews: [], openPoints: fx.db.op.filter((x) => x.Case_Item_Id === CASE_ID), auditRows: [], supplierRows: [], configRows: fx.db.config, loadedAt: "2026-10-25T09:00:00Z" });
  const r = vm.runInContext("CIQFinal.finalDocumentFor(input)", ctx);
  assert.equal(r.ok, true);
  const doc = clone(r.doc);
  doc.components = [{ ...(doc.components[0] || {}), origin: undefined }, { inci: "Tocopherol" }];
  ctx.doc = doc;
  const bytes = vm.runInContext("CIQFinal.renderPdf(doc, {})", ctx);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  ctx.doc = { ...doc, threads: [{ ...(doc.threads[0] || {}), rounds: undefined }], sections: undefined, header: { ...doc.header, markets: undefined } };
  assert.equal(Buffer.from(vm.runInContext("CIQFinal.renderPdf(doc, {})", ctx).slice(0, 5)).toString(), "%PDF-");
});
