#!/usr/bin/env node
// Offline test of the CIQ final document service: Bundle.gs + Code.gs in a node:vm with Apps Script stand-ins
// (gas.mjs) against an in-memory Kissflow (fake-kissflow.mjs) holding the app's live-shaped ZZT fixtures
// (fixtures/kissflow.json, from make-fixtures.mjs). Event mode (29 Oct): the integration's POST (doPost) queues the
// case, a one-off trigger runs drain(), which files the case PDF, the portal's supplier-safe copy, the audit row and one
// RMM webhook POST. No network. Usage: node kissflow-build/final-pdf/test/offline.mjs
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
  DOPOST_TOKEN: "zzt-dopost-token-77aa",
  RMM_WEBHOOK_URL: "https://zzt-sandbox.kissflow.example/integration/2/AcZZTsandbox01/webhook/ZZTRMMHOOK0123456789",
};
const HOOK_TOKEN = "ZZTRMMHOOK0123456789";
const PORTAL_APP = "CIQ_Supplier_Portal_A00";
const REQ_ID = "PkReq5";
const WEBHOOK = "https://zzt-sandbox.kissflow.example/integration/2/AcZZTsandbox01/webhook/ZZTHOOKTOKEN0123456789";
const SECRETS = [P.KF_ACCESS_KEY_ID, P.KF_ACCESS_KEY_SECRET, "ZZTHOOKTOKEN0123456789", HOOK_TOKEN, P.DOPOST_TOKEN];
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

/** A fake Kissflow with the fixtures, the case variants and the portal request of ZZT-0005, a fake clock, Script
 *  Properties and a cache; `post` is the integration's HTTP step (doPost), `fire` Apps Script's trigger runner. */
function world({ props = {}, listMode = "status", mutate, patch } = {}) {
  const clock = { t: NOW0, now() { return this.t; }, advance(ms) { this.t += Math.max(0, ms); } };
  const db = Object.fromEntries(Object.entries(FLOWS).map(([k, id]) => [id, clone(fx.db[k])]));
  const base = db.CIQ_Case_A00.find((x) => x._id === CASE_ID);
  db.CIQ_Case_A00.push(
    variant(base, "ZZT-0006", { _status: "InProgress", Final_Release_Confirm: undefined, Final_Release_At: undefined, Final_Release_By_Name: undefined }),
    variant(base, "ZZT-0007", { _status: "Completed", Case_Phase: "Cancelled", Cancelled_At: "2026-10-20T19:30:00Z", Final_Release_Confirm: undefined, Final_Release_At: undefined }),
    variant(base, "ZZT-0008", { Final_Document_Hash: `seal:0123456789abcdef sha256:${"a".repeat(64)}` }),
    variant(base, "ZZT-0009", { _status: "InProgress", Final_Release_At: iso(NOW0 - 60000) }),
  );
  // the portal request of ZZT-0005 (the case names it in Portal_Request_Item_Id); the variants name it too, but it
  // names only ZZT-0005 (App_Case_Item_Id)
  db.CIQP_Request_A00 = [{ _id: REQ_ID, App_Case_Item_Id: CASE_ID, Case_Code: "ZZT-0005", Cycle_No: 1, _status: "Completed" }];
  // the SET:current row holds webhook URLs live: they must never reach a log
  const set = db.CIQ_Config_Version_A00.find((r) => r.Config_Key === "SET:current");
  set.Payload_JSON = JSON.stringify({ ...JSON.parse(set.Payload_JSON), webhooks: { "I-1": WEBHOOK } });
  if (mutate) mutate(db);
  const kf = fakeKissflow({ domain: P.KF_DOMAIN, acc: P.KF_ACCOUNT_ID, app: P.KF_APP_ID, portalApp: PORTAL_APP, hookToken: HOOK_TOKEN, keyId: P.KF_ACCESS_KEY_ID, keySecret: P.KF_ACCESS_KEY_SECRET, db, clock, listMode });
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
    /** A new Apps Script execution (fresh globals; the same properties, cache, mails, triggers and Kissflow). */
    exec(o = {}) {
      const ex = execution({ fetch: kf.handle, store, cache, world: shared, clock, ...o });
      if (patch) patch(ex.ctx, clock);
      runs.push(ex);
      return ex;
    },
    run(fn, ...args) {
      const ex = w.exec();
      const r = ex.call(fn, ...args);
      return { r, ex };
    },
    /** The integration's HTTP POST: a JSON body (the token in it by default), an optional query. */
    post(body = { caseItemId: CASE_ID, token: P.DOPOST_TOKEN }, { query = {}, type = "application/json" } = {}) {
      const contents = typeof body === "string" ? body : JSON.stringify(body);
      const out = w.exec().call("doPost", { parameter: query, parameters: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, [v]])), queryString: new URLSearchParams(query).toString(), contentLength: contents.length, postData: { contents, type, length: contents.length, name: "postData" } });
      assert.equal(out.mime, "JSON");
      return JSON.parse(out.getContent());
    },
    /** Apps Script's runner: the earliest unfired one-off trigger fires (30 s after its time); it stays listed. */
    fire(o) {
      const t = shared.triggers.filter((x) => x.dueAt !== undefined && !x.fired).sort((a, b) => a.dueAt - b.dueAt)[0];
      if (!t) return false;
      if (clock.now() < t.dueAt + 30000) clock.t = t.dueAt + 30000;
      t.fired = true;
      w.exec(o).call(t.fn, { triggerUid: t.id, authMode: "FULL" });
      return true;
    },
    fireAll(max = 40) {
      let n = 0;
      while (n < max && w.fire()) n++;
      return n;
    },
    /** One event for the case, then every drain it leads to. */
    event(id = CASE_ID) {
      const a = w.post({ caseItemId: id, token: P.DOPOST_TOKEN });
      return { answer: a, drains: w.fireAll() };
    },
    queue: () => [...store.keys()].filter((k) => k.startsWith("Q_")),
    pending: () => shared.triggers.filter((t) => t.fn === "drain" && !t.fired),
    drainTriggers: () => shared.triggers.filter((t) => t.fn === "drain"),
    logs: () => runs.flatMap((x) => x.logs),
    caseItem: (id = CASE_ID) => db.CIQ_Case_A00.find((x) => x._id === id),
    request: () => db.CIQP_Request_A00.find((x) => x._id === REQ_ID),
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
const isCaseAttach = (c) => isAttach(c) && c.path.includes("/CIQ_Case_A00/");
const hooks = (w) => w.kf.calls.filter((c) => c.write === "webhook");
const auditRows = (w) => w.db.CIQ_Audit_Event_A00.filter((r) => r.Event_Key === "ZZT-0005-FD-PDF");
const adminMails = (w) => w.world.mails.filter((m) => m.to === P.ADMIN_EMAIL);
const sealOf = (bytes) => /\/Subject \(document seal ([0-9a-f]{16})\)/.exec(pdfText(bytes))?.[1] ?? "";
/** The Beiersdorf people of the parity case (names and e-mail addresses) and its supplier contacts. */
const BDF_PEOPLE = ["Katrin Vogel", "Jonas Albrecht", "Mira Hansen", "Lena Krause", "Tobias Keller", "Katrin", "Vogel", "Albrecht", "Hansen", "Krause", "Keller"];
const SUPPLIER_PEOPLE = ["Elena Márquez", "Ravi Menon"];

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

// ------------------------------------------------------------------ the supplier-safe copy (entry.ts supplierCopy)

/** Bundle.gs alone in a vm, with the parity document. */
function bundleCtx() {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(resolve(GS_DIR, "Bundle.gs"), "utf8"), ctx, { filename: "Bundle.gs" });
  ctx.doc = clone(EXPECTED);
  return ctx;
}

test("supplierCopy: Beiersdorf people as 'Beiersdorf' plus their role, no names or e-mail addresses; suppliers kept; its own seal", () => {
  const ctx = bundleCtx();
  const before = JSON.stringify(ctx.doc);
  const copy = clone(vm.runInContext("CIQFinal.supplierCopy(doc)", ctx));
  assert.equal(JSON.stringify(ctx.doc), before, "the internal document is not changed");
  ctx.copy = copy;
  assert.equal(vm.runInContext("CIQFinal.verifyFinalDocument(copy)", ctx), true, "the copy's seal verifies (the app's fingerprint)");
  assert.notEqual(copy.fingerprint, EXPECTED.fingerprint, "its own seal");
  assert.equal(clone(vm.runInContext("CIQFinal.supplierCopy(doc)", ctx)).fingerprint, copy.fingerprint, "deterministic");
  const text = JSON.stringify({ ...copy, fingerprint: "" });
  for (const p of BDF_PEOPLE) assert.ok(!text.includes(p), `a Beiersdorf name in the copy: ${p}`);
  assert.ok(!/@beiersdorf/i.test(text), "a Beiersdorf e-mail address in the copy");
  for (const p of SUPPLIER_PEOPLE) assert.ok(text.includes(p), `a supplier name is kept: ${p}`);
  assert.equal(copy.header.ownerName, "Beiersdorf");
  assert.equal(copy.trigger, EXPECTED.trigger, "the supplier's final release");
  assert.deepEqual(copy.confirmations.map((c) => [c.type, c.name, c.email, c.role]), EXPECTED.confirmations.map((c) => (c.type === "dept-completion" ? [c.type, "Beiersdorf", "", c.role] : [c.type, c.name, c.email, c.role])));
  assert.deepEqual(copy.threads.map((t) => t.raisedBy), ["Beiersdorf, Raw Material Manager (RMM)", "Beiersdorf, Product Safety reviewer"]);
  const entries = copy.threads.flatMap((t) => t.rounds.flatMap((r) => r.entries));
  assert.deepEqual([...new Set(entries.filter((e) => e.side !== "supplier").map((e) => e.by))].sort(), ["Product Safety reviewer", "Raw Material Manager (RMM)"], "the PDF adds '(Beiersdorf)' to these itself");
  assert.deepEqual([...new Set(entries.filter((e) => e.side === "supplier").map((e) => e.by))].sort(), ["Elena Márquez", "Ravi Menon"]);
  // everything else is the internal document's
  const strip = (d) => ({ ...d, fingerprint: "", header: { ...d.header, ownerName: "" }, threads: [], confirmations: [] });
  assert.deepEqual(strip(copy), strip(EXPECTED));
});

test("supplierCopy: free text loses Beiersdorf names and e-mail addresses; a name shared with a supplier is masked where unsure", () => {
  const ctx = bundleCtx();
  const d = ctx.doc;
  d.threads[0].rounds[0].entries[0].text = "Katrin Vogel here, write to katrin.vogel@beiersdorf.example or qa.team@beiersdorf.example. Thanks, Katrin Vogels";
  d.sections[0].answers[0].by = "Katrin Vogel"; // an answer a Beiersdorf person entered
  d.sections[0].answers[0].value = "elena.marquez@solvaro.example";
  d.evidence[0].uploadedBy = "Dr. Mira Hansen";
  const copy = clone(vm.runInContext("CIQFinal.supplierCopy(doc)", ctx));
  assert.equal(copy.threads[0].rounds[0].entries[0].text, "Beiersdorf here, write to Beiersdorf or Beiersdorf. Thanks, Katrin Vogels", "whole words only; any address on a Beiersdorf-only domain");
  assert.equal(copy.sections[0].answers[0].by, "Beiersdorf, Raw Material Manager (RMM)");
  assert.equal(copy.sections[0].answers[0].value, "elena.marquez@solvaro.example", "a supplier address stays");
  assert.equal(copy.evidence[0].uploadedBy, "Beiersdorf, Product Safety reviewer");
});

test("the internal PDF is unchanged by the copy; the copy's PDF says 'document seal <its seal>' and names no Beiersdorf person", () => {
  const ctx = bundleCtx();
  const render = (expr) => Buffer.from(Uint8Array.from(vm.runInContext(`CIQFinal.renderPdf(${expr}, {})`, ctx)));
  const internal = render("doc");
  ctx.copy = vm.runInContext("CIQFinal.supplierCopy(doc)", ctx);
  const sup = render("copy");
  assert.ok(render("doc").equals(internal), "rendering the copy leaves the internal PDF as it was");
  assert.equal(sealOf(internal), EXPECTED.fingerprint);
  assert.equal(sealOf(sup), ctx.copy.fingerprint);
  const text = pdfLines(sup).join("\n");
  for (const p of BDF_PEOPLE) assert.ok(!text.includes(p), `a Beiersdorf name in the supplier PDF: ${p}`);
  assert.ok(!/beiersdorf\.example/i.test(pdfText(sup)), "no Beiersdorf e-mail address in the supplier PDF");
  for (const want of ["Case owner (RMM)\nBeiersdorf", "Raised by Beiersdorf, Raw Material Manager (RMM), ", "Raw Material Manager (RMM) (Beiersdorf) · Returned to supplier · ", "Product Safety reviewer (Beiersdorf) · Closed as not accepted · ", "Elena Márquez (supplier) · Answered · ", "Document seal: unchanged"]) assert.ok(text.includes(want), `the supplier PDF lacks: ${want}`);
  assert.ok(text.includes(`ZZT-0005-FD · document seal ${ctx.copy.fingerprint}`), "its own seal in the footer");
  assert.ok(pdfLines(internal).join("\n").includes("Katrin Vogel"), "the internal PDF keeps the names");
});

// ------------------------------------------------------------------ doPost

test("doPost: the token (body first, ?token= fallback), the step-test sample, bad ids; it queues and calls no Kissflow route", () => {
  const w0 = world({ props: { DOPOST_TOKEN: undefined } });
  assert.deepEqual(w0.post(), { ok: false, status: "disabled" });
  const w = world();
  assert.equal(w.post({ caseItemId: CASE_ID }).status, "refused", "no token");
  assert.equal(w.post({ caseItemId: CASE_ID, token: "zzt-dopost-token-77ab" }).status, "refused", "a wrong token");
  assert.equal(w.post({ caseItemId: CASE_ID, token: "wrong" }, { query: { token: P.DOPOST_TOKEN } }).status, "refused", "the body token wins over the query");
  assert.equal(w.post({ caseItemId: "SampleInstance001" }).status, "refused", "the token is checked before the sample id");
  assert.equal(w.post({ caseItemId: "../../x", token: P.DOPOST_TOKEN }).status, "bad case item id");
  assert.equal(w.post("{not json").status, "bad request");
  assert.deepEqual(w.queue(), []);
  assert.deepEqual(w.post({ caseItemId: "SampleInstance001", token: P.DOPOST_TOKEN }), { ok: true, status: "test event", caseItemId: "SampleInstance001" }, "the builder's step test: ok, nothing else");
  assert.deepEqual(w.post({ _id: "SampleInstance001", token: P.DOPOST_TOKEN }).status, "test event");
  assert.deepEqual(w.queue(), []);
  assert.equal(w.world.triggers.length, 0, "no trigger for a step test");
  assert.deepEqual(w.post(), { ok: true, status: "queued", caseItemId: CASE_ID });
  const q = JSON.parse(w.store.get(`Q_${CASE_ID}`));
  assert.equal(q.rev, w.exec().ctx.FD_.CODE_REV, "the entry carries the code revision");
  assert.equal(w.post({ _id: CASE_ID, token: P.DOPOST_TOKEN }).status, "already queued", "_id is accepted");
  assert.equal(w.post({ caseItemId: CASE_ID }, { query: { token: P.DOPOST_TOKEN } }).status, "already queued", "?token= as a fallback");
  assert.equal(w.drainTriggers().length, 1, "one drain trigger for all three events");
  assert.ok(w.drainTriggers()[0].afterMs >= 120000, "SETTLE_MINUTES 2");
  assert.equal(w.kf.calls.length, 0, "doPost calls no Kissflow route");
  assert.equal(w.world.mails.length, 0);
});

test("doPost: a full queue refuses the event with one admin alert an hour", () => {
  const w = world();
  for (let i = 0; i < 50; i++) w.store.set(`Q_PkFAKE${String(i).padStart(4, "0")}`, JSON.stringify({ at: NOW0 + 3600e3, next: NOW0 + 3600e3, n: 0 }));
  assert.equal(w.post().status, "queue full");
  assert.equal(w.post().status, "queue full");
  assert.equal(adminMails(w).length, 1);
  w.clock.advance(61 * 60000);
  w.post();
  assert.equal(adminMails(w).length, 2);
});

// ------------------------------------------------------------------ the event path: doPost → drain

test("event → drain files ZZT-0005 once: case PDF, case fields, supplier copy on the request, audit row, one webhook; no MailApp", () => {
  const w = world();
  const { answer: a, drains } = w.event();
  assert.deepEqual(a, { ok: true, status: "queued", caseItemId: CASE_ID });
  assert.equal(drains, 2, "the filing, then its successor (WATCHDOG_MS) on an empty queue, which schedules nothing");
  const calls = w.kf.calls;
  const writes = writesOf(calls);
  assert.deepEqual(writes.map((c) => c.write), ["attach", "put", "portal-attach", "form-create", "form-submit", "webhook"], "exactly these writes, in this order");

  // the internal PDF on the case
  const att = writes[0];
  assert.match(att.path, new RegExp(`^/process/2/${P.KF_ACCOUNT_ID}/admin/CIQ_Case_A00/${CASE_ID}/Final_PDF/attachment$`));
  assert.equal(att.multipart.file.name, PDF_NAME);
  assert.equal(att.multipart.file.type, "application/pdf");
  assert.equal(att.contentType, undefined, "no JSON content type on the multipart call");
  const pdf = att.multipart.file.bytes;
  const text = pdfText(pdf);
  assert.ok(text.startsWith("%PDF-1.4") && text.trimEnd().endsWith("%%EOF"));
  assert.ok(text.includes(`document seal ${EXPECTED.fingerprint}`), "the app's seal");
  assert.ok(/CES?T\)/.test(text), "dates in TIME_ZONE (Europe/Berlin)");
  const sha = createHash("sha256").update(pdf).digest("hex");

  // the case fields
  const put = writes[1];
  assert.equal(put.path, `/process/2/${P.KF_ACCOUNT_ID}/admin/CIQ_Case_A00/${CASE_ID}`);
  assert.deepEqual(Object.keys(put.body).sort(), ["Completion_Trigger", "Final_Document_At", "Final_Document_Hash"]);
  assert.equal(put.body.Final_Document_Hash, `seal:${EXPECTED.fingerprint} sha256:${sha}`);
  assert.match(put.body.Final_Document_At, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(put.body.Completion_Trigger, "Final release by Elena Márquez");
  assert.deepEqual(w.caseItem().Final_PDF.map((x) => x.name), [PDF_NAME]);

  // the supplier-safe copy on the portal request (admin route, the portal's application id)
  const portal = writes[2];
  assert.equal(portal.path, `/process/2/${P.KF_ACCOUNT_ID}/admin/CIQP_Request_A00/${REQ_ID}/Final_PDF/attachment`);
  assert.match(portal.query, new RegExp(`_application_id=${PORTAL_APP}`));
  assert.equal(portal.multipart.file.name, PDF_NAME, "the same file name as on the case");
  const sup = portal.multipart.file.bytes;
  assert.ok(!sup.equals(pdf), "not the internal PDF");
  const sSeal = sealOf(sup);
  assert.ok(/^[0-9a-f]{16}$/.test(sSeal) && sSeal !== EXPECTED.fingerprint, "its own seal in the subject");
  const supText = pdfLines(sup).join("\n");
  for (const p of BDF_PEOPLE) assert.ok(!supText.includes(p), `a Beiersdorf name in the portal PDF: ${p}`);
  assert.ok(!/beiersdorf\.example/i.test(pdfText(sup)), "a Beiersdorf e-mail address in the portal PDF");
  assert.ok(supText.includes("Elena Márquez"), "the supplier's own people stay");
  assert.deepEqual(w.request().Final_PDF.map((x) => x.name), [PDF_NAME]);

  // the audit row: the supplier seal in New_Value_Text; no Notify_* (the integration's run history is the mail's record)
  const create = writes[3].body;
  const caseAtt = w.caseItem().Final_PDF[0].id;
  const reqAtt = w.request().Final_PDF[0].id;
  assert.equal(create.New_Value_Text, `${PDF_NAME} · ${pdf.length} bytes · SHA-256 ${sha} · document seal ${EXPECTED.fingerprint} · Final_PDF ${caseAtt} · portal request ${REQ_ID} Final_PDF ${reqAtt} · supplier copy seal ${sSeal}`);
  assert.equal(create.Notify_Recipient, undefined);
  assert.equal(create.Notify_Channel, undefined);
  assert.deepEqual(JSON.parse(create.Snapshot_JSON).audit[0].detail, `Final document generated automatically, sealed and filed on the case (document seal ${EXPECTED.fingerprint}). The supplier portal holds its supplier-safe copy (document seal ${sSeal}). It cannot be changed.`);
  assert.equal(auditRows(w).length, 1);

  // the RMM hand-off: one POST to the integration webhook, no access key, the internal seal
  const hook = writes[5];
  assert.equal(hook.host, P.KF_DOMAIN);
  assert.equal(hook.keyHeaders, false, "no access key on the webhook");
  assert.deepEqual(hook.body, { caseItemId: CASE_ID, caseCode: "ZZT-0005", seal: EXPECTED.fingerprint, idempotencyKey: "ZZT-0005-FD-RMM" });
  assert.equal(w.world.mails.length, 0, "no mail at all: the integration mails the RMM role");

  // bookkeeping: queue empty, no state, no trigger left
  assert.deepEqual(w.queue(), []);
  assert.equal(w.state(), null);
  assert.equal(w.drainTriggers().length, 0, "each drain deleted its own trigger");
  // reads and writes: authenticated on KF_DOMAIN (the webhook without the key); never RMES, notes or retired flows; paced
  for (const c of calls) {
    assert.equal(c.host, P.KF_DOMAIN);
    if (c.write !== "webhook") assert.ok(c.auth, `${c.method} ${c.path} without the access key`);
    assert.ok(!/CIQ_RMES_|CIQ_Internal_Note_A00|CIQ_Case_Data_A00|CIQ_Scope_Run_A00/.test(c.path), `never read: ${c.path}`);
    if (/CIQP_/.test(c.path)) assert.ok(c.path.includes(`/CIQP_Request_A00/${REQ_ID}`), `only the case's own request: ${c.path}`);
  }
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at - calls[i - 1].at >= 1200, `calls ${i - 1}→${i} only ${calls[i].at - calls[i - 1].at} ms apart`);
  const logs = w.logs().join("\n");
  for (const step of ["doPost queued", "case start", "read", "built", "rendered", "supplier copy rendered", "attached", "case fields written", "portal copy attached", "audit row written", "rmm notified", "case done", "drain done"]) assert.ok(logs.includes(`[CIQ-FD] ${step}`), `logged: ${step}`);

  // a repeated event: the case is read once, nothing is written
  const n = writes.length;
  w.event();
  assert.equal(writesOf(w.kf.calls).length, n);
  assert.deepEqual(w.queue(), []);
  // runOnce on a filed case does nothing either
  assert.equal(w.run("runOnce", CASE_ID).r.status, "already filed");
  assert.equal(writesOf(w.kf.calls).length, n);
});

test("drain: deletes its own trigger first; re-arms only while the queue has work; a case not completed yet waits", () => {
  const w = world({ mutate: (db) => Object.assign(db.CIQ_Case_A00.find((x) => x._id === CASE_ID), { _status: "InProgress", Final_Release_At: iso(NOW0) }) });
  w.post();
  const t = w.drainTriggers()[0];
  w.fire();
  assert.ok(!w.world.triggers.some((x) => x.id === t.id), "the fired trigger is gone");
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.equal(JSON.parse(w.store.get(`Q_${CASE_ID}`)).n, 1);
  assert.ok(w.pending().length >= 1 && Math.min(...w.pending().map((x) => x.dueAt)) - w.clock.now() <= 2 * 60000, "work left: a drain armed within 2 min (the watchdog may stay armed too)");
  w.caseItem()._status = "Completed";
  w.fireAll();
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.deepEqual(w.queue(), []);
  assert.equal(w.pending().length, 0, "an empty queue arms nothing");
  // a drain by hand on an empty queue: no call, no trigger
  const n = w.kf.calls.length;
  w.run("drain");
  assert.equal(w.kf.calls.length, n);
  assert.equal(w.world.triggers.length, 0);
});

test("drain: the lock is held: no call, again in a minute", () => {
  const w = world();
  w.post();
  w.fire({ lockFree: () => false });
  assert.equal(w.kf.calls.length, 0);
  assert.equal(w.pending().length, 1);
  w.fireAll();
  assert.ok(w.caseItem().Final_Document_Hash);
});

test("drain: an event during a running drain is filed by the next drain (no stranded entry)", () => {
  const w = world({
    mutate: (db) => {
      const base = db.CIQ_Case_A00.find((x) => x._id === CASE_ID);
      db.CIQ_Case_A00.push({ ...clone(base), _id: "AppZZT-0010", Case_Code: "ZZT-0010", Portal_Request_Item_Id: "PkReq10" });
      db.CIQP_Request_A00.push({ _id: "PkReq10", App_Case_Item_Id: "AppZZT-0010", Case_Code: "ZZT-0010", Cycle_No: 1, _status: "Completed" });
    },
  });
  w.post();
  let once = true;
  w.kf.onCall = (c) => {
    if (once && c.method === "PUT") {
      once = false;
      assert.equal(w.post({ caseItemId: "AppZZT-0010", token: P.DOPOST_TOKEN }).status, "queued");
    }
  };
  w.fireAll();
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.ok(w.caseItem("AppZZT-0010").Final_Document_Hash);
  assert.equal(w.db.CIQP_Request_A00.find((r) => r._id === "PkReq10").Final_PDF.length, 1, "each case's copy on its own request");
  assert.equal(w.request().Final_PDF.length, 1);
  assert.deepEqual(w.queue(), []);
  assert.equal(w.pending().length, 0);
  assert.equal(hooks(w).length, 2);
});

test("drain: failures outside a case end the chain after 3 drains with one alert", () => {
  const w = world({ patch: (ctx) => { ctx.requeue_ = () => { throw new Error("boom outside a case"); }; } });
  w.post();
  const fired = w.fireAll(12);
  assert.equal(fired, 3);
  assert.equal(adminMails(w).filter((m) => /drain failed 3 times/.test(m.body)).length, 1);
  assert.equal(w.pending().length, 0);
  assert.equal(w.queue().length, 1, "the case stays queued for a drain by hand");
});

test("drain: a case that always hits the time limit leaves the queue after MAX_STOPS with one alert (its state kept)", () => {
  const w = world({ patch: (ctx, clock) => { const orig = ctx.configRows_; ctx.configRows_ = function (c) { clock.advance(4 * 60000); return orig(c); }; } });
  w.post();
  const fired = w.fireAll(20);
  assert.ok(fired <= 7, `${fired} drains`);
  assert.equal(adminMails(w).length, 1);
  assert.match(adminMails(w)[0].body, /each one hit the time limit[\s\S]*runOnce/);
  assert.deepEqual(w.queue(), []);
  assert.equal(writesOf(w.kf.calls).length, 0);
});

test("drain: a broken configuration stops before any call, alerts once an hour, schedules nothing", () => {
  const w = world({ props: { RMM_WEBHOOK_URL: "https://other.example/integration/2/AcZZTsandbox01/webhook/X1234567" } });
  for (const id of ["PkCase0001", "PkCase0002", "PkCase0003"]) {
    w.post({ caseItemId: id, token: P.DOPOST_TOKEN });
    w.fireAll(5);
  }
  assert.equal(w.kf.calls.length, 0);
  assert.equal(adminMails(w).length, 1);
  assert.equal(w.pending().length, 0);
  assert.equal(w.queue().length, 3);
});

test("drain: an event from another code revision is logged (a stale web-app deployment)", () => {
  const w = world();
  w.post();
  const q = JSON.parse(w.store.get(`Q_${CASE_ID}`));
  w.store.set(`Q_${CASE_ID}`, JSON.stringify({ ...q, rev: "old" }));
  w.fireAll();
  assert.ok(w.logs().some((l) => l.includes("this event came from another code revision")));
  const w2 = world();
  w2.event();
  assert.ok(!w2.logs().some((l) => l.includes("another code revision")));
});

// ------------------------------------------------------------------ the portal copy: the right request only, idempotent

test("the portal copy goes only to the request that names the case: another case's request or none is a skip with one alert", () => {
  const w = world({ mutate: (db) => { db.CIQP_Request_A00[0].App_Case_Item_Id = "AppZZT-9999"; } });
  w.event();
  assert.deepEqual(writesOf(w.kf.calls).map((c) => c.write), ["attach", "put", "form-create", "form-submit", "webhook"], "the filing goes on");
  assert.equal(w.request().Final_PDF, undefined, "nothing on another case's request");
  assert.equal(adminMails(w).length, 1);
  assert.match(adminMails(w)[0].body, /names another case[\s\S]*portalCopy/);
  assert.match(JSON.parse(writesOf(w.kf.calls)[2].body.Snapshot_JSON).audit[0].detail, /filed on the case \(document seal [0-9a-f]{16}\)\. It cannot be changed\.$/);
  const w2 = world({ mutate: (db) => { delete db.CIQ_Case_A00.find((x) => x._id === CASE_ID).Portal_Request_Item_Id; } });
  w2.event();
  assert.ok(!w2.kf.calls.some((c) => /CIQP_/.test(c.path)), "no portal call without Portal_Request_Item_Id");
  assert.match(adminMails(w2)[0].body, /names no portal request/);
  assert.equal(hooks(w2).length, 1);
});

test("the portal copy is idempotent: a lost answer adopts the landed copy; a same-named file with another seal is never copied over", () => {
  const w = world();
  w.kf.lost.push({ match: (c) => c.write === "portal-attach", respond: answer(504, { error_code: "GatewayTimeout" }) });
  w.event();
  assert.equal(w.kf.calls.filter((c) => c.write === "portal-attach").length, 1, "one upload: the landed file is adopted by its seal");
  assert.equal(w.request().Final_PDF.length, 1);
  assert.equal(auditRows(w).length, 1);
  assert.equal(hooks(w).length, 1);
  // a same-named file on the request that carries the INTERNAL seal (not the supplier copy's) is a stop: skipped, alerted
  const internal = { key: "Final_PDF", id: "Attach-ZZTint", name: PDF_NAME, size: 60, fileExtension: "pdf" };
  const w2 = world({ mutate: (db) => Object.assign(db.CIQP_Request_A00[0], { Final_PDF: [internal], _attachmentBytes: { [internal.id]: Buffer.from(`%PDF-1.4\n<< /Subject (document seal ${EXPECTED.fingerprint}) >>\n%%EOF\n`) } }) });
  w2.event();
  assert.equal(w2.kf.calls.filter((c) => c.write === "portal-attach").length, 0);
  assert.deepEqual(w2.request().Final_PDF.map((x) => x.id), ["Attach-ZZTint"]);
  assert.match(adminMails(w2)[0].body, /not on the supplier portal[\s\S]*Attach-ZZTint \(seal [0-9a-f]{16}\)/);
  assert.ok(w2.caseItem().Final_Document_Hash);
  assert.equal(hooks(w2).length, 1);
});

test("portalCopy repairs a skipped portal copy: the rebuilt document must carry the filed seal; a second run adds nothing", () => {
  const w = world({ mutate: (db) => { db.CIQP_Request_A00[0].App_Case_Item_Id = "AppZZT-9999"; } });
  w.event();
  assert.equal(w.request().Final_PDF, undefined);
  w.request().App_Case_Item_Id = CASE_ID; // a person fixed the request
  const n = w.kf.calls.length;
  const r = w.run("portalCopy", CASE_ID).r;
  assert.equal(r.ok, true, r.status);
  const later = writesOf(w.kf.calls.slice(n));
  assert.deepEqual(later.map((c) => c.write), ["portal-attach"], "only the copy: no audit row, no webhook, no case write");
  const sup = later[0].multipart.file.bytes;
  const firstSeal = sealOf(sup);
  assert.notEqual(firstSeal, EXPECTED.fingerprint);
  assert.ok(!pdfLines(sup).join("\n").includes("Katrin Vogel"));
  assert.equal(w.run("portalCopy", CASE_ID).r.ok, true);
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "portal-attach").length, 1, "the copy with that seal is there: not added again");
  // a filed case whose document now builds with another seal: no copy of another document
  w.request().Final_PDF = [];
  w.caseItem().Final_Document_Hash = `seal:0123456789abcdef sha256:${"a".repeat(64)}`;
  const r3 = w.run("portalCopy", CASE_ID).r;
  assert.equal(r3.ok, false);
  assert.match(r3.status, /another seal/);
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "portal-attach").length, 1);
});

test("a resumed filing builds the supplier copy again (its seal unchanged) after a lost case-field answer", () => {
  const w = world();
  w.kf.lost.push({ match: (c) => c.method === "PUT", respond: answer(504, { error_code: "GatewayTimeout" }) });
  w.event();
  assert.deepEqual(writesOf(w.kf.calls).map((c) => c.write), ["attach", "put", "portal-attach", "form-create", "form-submit", "webhook"], "no second upload or PUT");
  assert.ok(w.logs().some((l) => l.includes("[CIQ-FD] case fields found written")));
  const fresh = world();
  fresh.event();
  assert.ok(writesOf(w.kf.calls)[2].multipart.file.bytes.equals(writesOf(fresh.kf.calls)[2].multipart.file.bytes), "the rebuilt copy is byte-identical");
  assert.equal(w.state(), null);
});

test("PORTAL_COPY_ENABLED false: no portal call at all, no alert; the audit row says 'filed on the case'; the webhook still goes", () => {
  const w = world({ props: { PORTAL_COPY_ENABLED: "false" } });
  w.event();
  assert.ok(!w.kf.calls.some((c) => /CIQP_/.test(c.path)));
  assert.deepEqual(writesOf(w.kf.calls).map((c) => c.write), ["attach", "put", "form-create", "form-submit", "webhook"]);
  assert.equal(w.world.mails.length, 0);
  const a = writesOf(w.kf.calls)[2].body;
  assert.ok(!a.New_Value_Text.includes("portal"));
  assert.match(JSON.parse(a.Snapshot_JSON).audit[0].detail, /filed on the case \(document seal [0-9a-f]{16}\)\. It cannot be changed\.$/);
});

// ------------------------------------------------------------------ the RMM webhook: once, never twice

test("the webhook answers 500 once: retried later and sent once more; nothing else written twice", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.path.includes("/webhook/"), respond: answer(500) });
  w.post();
  w.fire();
  assert.equal(w.state().attempts, 1);
  assert.ok(!w.state().notifyingAt && !w.state().notifiedAt);
  w.fireAll();
  assert.deepEqual(writesOf(w.kf.calls).map((c) => c.write), ["attach", "put", "portal-attach", "form-create", "form-submit", "webhook"], "the refused POST is not a write");
  assert.equal(w.kf.calls.filter((c) => c.path.includes("/webhook/")).length, 2, "two POSTs: the refused one and the sent one");
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write !== "webhook").length, 5);
  assert.equal(w.state(), null);
});

test("the run ends during the webhook POST: never posted again, the admin is told", () => {
  const w = world();
  w.post();
  const t = w.drainTriggers()[0];
  w.clock.t = t.dueAt + 30000;
  t.fired = true;
  const ex = w.exec({ killWhen: (e) => e.type === "fetch" && e.url.includes("/webhook/") });
  assert.throws(() => ex.call("drain", { triggerUid: t.id }), /Exceeded maximum execution time/);
  assert.ok(w.state().notifyingAt);
  assert.equal(w.queue().length, 1, "still queued");
  assert.equal(w.pending().length, 1, "the killed drain armed its successor before the work (WATCHDOG_MS)");
  w.fireAll();
  assert.equal(w.kf.calls.filter((c) => c.path.includes("/webhook/")).length, 1);
  assert.deepEqual(w.world.mails.map((m) => m.to), [P.ADMIN_EMAIL]);
  assert.match(w.world.mails[0].body, /not sent again/);
  assert.equal(w.state(), null);
});

test("an HTML answer from the webhook is a failed attempt, not a pause: 3 posts, one alert", () => {
  const w = world();
  w.kf.hookRespond = { status: 404, headers: { "Content-Type": "text/html" }, body: "<html>Not found</html>" };
  w.post();
  w.fireAll(20);
  assert.equal(w.store.get("PAUSE_UNTIL"), undefined);
  assert.equal(hooks(w).length, 3);
  assert.equal(adminMails(w).length, 1);
  assert.deepEqual(w.queue(), []);
  assert.ok(w.state().auditVerified, "the state is kept for runOnce");
});

test("MAIL_ENABLED false: no webhook POST (and no RMM_WEBHOOK_URL needed); the case is filed", () => {
  const w = world({ props: { MAIL_ENABLED: "false", RMM_WEBHOOK_URL: undefined } });
  w.event();
  assert.equal(hooks(w).length, 0);
  assert.deepEqual(writesOf(w.kf.calls).map((c) => c.write), ["attach", "put", "portal-attach", "form-create", "form-submit"]);
  assert.ok(w.logs().some((l) => l.includes("rmm notification not sent") && l.includes("MAIL_ENABLED is off")));
});

test("rmmWebhookSample: an unfiled case posts seal 'sample' (prod's step tests come before its first filing); a filed case its real code and seal", () => {
  const w = world();
  assert.equal(w.run("rmmWebhookSample", CASE_ID).r.ok, true);
  assert.equal(hooks(w).length, 1);
  assert.equal(hooks(w)[0].body.seal, "sample");
  w.event();
  const n = w.kf.calls.length;
  assert.equal(w.run("rmmWebhookSample", CASE_ID).r.ok, true);
  const later = w.kf.calls.slice(n);
  assert.deepEqual(later.map((c) => [c.method, c.write ?? "", !!c.auth]), [["GET", "", true], ["POST", "webhook", false]]);
  assert.deepEqual(later[1].body, { caseItemId: CASE_ID, caseCode: "ZZT-0005", seal: EXPECTED.fingerprint, idempotencyKey: "ZZT-0005-FD-RMM-SAMPLE" });
});

test("MailApp only alerts ADMIN_EMAIL: one sendEmail in Code.gs, in alertAdmin_; no RMM mail in any run", () => {
  const code = readFileSync(resolve(GS_DIR, "Code.gs"), "utf8");
  assert.equal(code.split("MailApp.sendEmail").length - 1, 1);
  const fn = code.slice(code.indexOf("function alertAdmin_("), code.indexOf("\n}\n", code.indexOf("function alertAdmin_(")));
  assert.ok(fn.includes("MailApp.sendEmail({ to: c.admin"), "only to ADMIN_EMAIL");
  for (const gone of ["function installTrigger", "RELEASED_AFTER", "DONE_IDS", "FALLBACK_RMM_EMAIL", "everyMinutes"]) assert.ok(!code.includes(gone), `polling left in Code.gs: ${gone}`);
  for (const w of everything) for (const m of w.world.mails) assert.equal(m.to, P.ADMIN_EMAIL, `a mail to ${m.to}`);
});

// ------------------------------------------------------------------ eligibility (read from the case, never from the POST)

test("eligibility: completed with the release yes; no release, cancelled, filed, rejected no; released but not completed waits", () => {
  const w = world();
  const ex = w.exec();
  ex.ctx.begin_();
  const el = (patch, since) => clone(ex.ctx.eligibility_({ ...clone(w.caseItem()), ...patch }, NOW0, since));
  assert.deepEqual(el({}), { ok: true });
  assert.deepEqual(el({ Final_Release_Confirm: undefined }), { ok: false, why: "no final release", wait: false });
  assert.deepEqual(el({ _status: "InProgress", Final_Release_At: "" }), { ok: false, why: "no final release", wait: true });
  assert.equal(el({ Case_Phase: "Cancelled" }).why, "cancelled");
  assert.equal(el({ Cancelled_At: "2026-10-20T19:00:00Z" }).why, "cancelled");
  assert.equal(el({ Cancelled_At: "2026-10-20T10:00:00Z", Reactivated_At: "2026-10-20T11:00:00Z" }).ok, true, "reactivated after the cancellation");
  assert.equal(el({ Final_Document_Hash: "seal:x sha256:y" }).why, "already filed");
  assert.equal(el({ _status: "Rejected" }).ok, false);
  assert.equal(el({ _status: "Withdrawn" }).ok, false);
  assert.deepEqual(el({ _status: "InProgress", Final_Release_At: iso(NOW0 - 60000) }), { ok: false, why: "not completed yet", wait: true });
  assert.equal(el({ _status: "InProgress", Final_Release_At: iso(NOW0 - 16 * 60000) }).ok, true, "released 16 min ago, not completed (a failed Skip and complete)");
  assert.equal(el({ _status: "InProgress", Final_Release_At: iso(NOW0 - 60000) }, NOW0 - 16 * 60000).ok, true, "queued 16 min ago");
  assert.equal(el({ Final_Release_At: "not a date" }).stop, true);
});

test("events for other cases: not found, filed by someone else, cancelled, never released: no write, off the queue", () => {
  const w = world();
  for (const id of ["AppZZT-0404", "AppZZT-0008", "AppZZT-0007", "AppZZT-0006"]) w.post({ caseItemId: id, token: P.DOPOST_TOKEN });
  w.fireAll(60);
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.deepEqual(w.queue(), []);
  assert.equal(w.pending().length, 0);
  assert.ok(w.logs().some((l) => l.includes("queue: gave up waiting") && l.includes("AppZZT-0006")), "an InProgress case without a release waits EVENT_WAIT_MIN, then leaves");
});

// ------------------------------------------------------------------ failures, resume without duplicates

test("attach refused, no DRIVE_FOLDER_ID: nothing filed, retried by the queue, one admin alert after 3 attempts; runOnce retries", () => {
  const w = world();
  w.kf.refuseAttach = true;
  w.event();
  assert.equal(w.kf.calls.filter(isCaseAttach).length, 3);
  assert.deepEqual([...new Set(writesOf(w.kf.calls).map((c) => c.write))], ["attach"], "only the refused uploads");
  assert.equal(w.caseItem().Final_Document_Hash, undefined);
  assert.equal(adminMails(w).length, 1);
  assert.match(adminMails(w)[0].body, /ZZT-0005.*failed 3 times[\s\S]*refused the attachment \(HTTP 400\)/);
  assert.deepEqual(w.queue(), [], "the queue gave up");
  w.event();
  assert.equal(w.kf.calls.filter(isCaseAttach).length, 3, "a new event skips a stuck case");
  w.kf.refuseAttach = false;
  assert.equal(w.run("runOnce", CASE_ID).r.status, "filed", "runOnce retries a stuck case");
  assert.equal(hooks(w).length, 1);
});

test("attach refused with DRIVE_FOLDER_ID: the PDF in Drive (never shared), the hash and the audit row name it; no webhook; admin told", () => {
  const w = world({ props: { DRIVE_FOLDER_ID: "ZZTFolder01" } });
  w.world.drive.folders.push("ZZTFolder01");
  w.kf.faults.push({ match: isCaseAttach, respond: answer(400, { error_code: "ItemCompleted" }), times: 99 });
  w.event();
  assert.equal(w.world.drive.files.length, 1);
  const f = w.world.drive.files[0];
  assert.deepEqual(f.viewers, []);
  assert.equal(w.caseItem().Final_Document_Hash, `seal:${EXPECTED.fingerprint} sha256:${createHash("sha256").update(f.buf).digest("hex")}`);
  const a = writesOf(w.kf.calls).find((c) => c.write === "form-create").body;
  assert.ok(a.New_Value_Text.includes(` · Drive ${f.getUrl()}`));
  assert.equal(hooks(w).length, 0, "the integration mails the case's Final PDF, which is empty");
  assert.equal(w.request().Final_PDF.length, 1, "the supplier copy is on the portal");
  assert.equal(adminMails(w).length, 1);
  assert.match(adminMails(w)[0].body, /saved in Google Drive/);
});

test("resume: the PUT fails after the attach; the next drain reuses the attached PDF (one upload)", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.method === "PUT", respond: answer(500, { error_code: "Internal", en_message: "server error" }) });
  w.post();
  w.fire();
  assert.equal(w.state().attempts, 1);
  assert.ok(w.state().attId);
  w.fireAll();
  assert.equal(w.kf.calls.filter(isCaseAttach).length, 1, "one upload");
  assert.equal(w.caseItem().Final_PDF.length, 1);
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.equal(hooks(w).length, 1);
  assert.equal(w.state(), null);
});

test("resume: an attached PDF from a lost run is hashed from Kissflow (302 → signed URL on the same host, no further redirect)", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.method === "PUT", respond: answer(500) });
  w.post();
  w.fire();
  w.store.delete(`FD_${CASE_ID}`); // the run's state is lost
  w.fireAll();
  const dl = w.kf.calls.filter((c) => /\/CIQ_Case_A00\/[^/]+\/Final_PDF\/attachment\/Attach-/.test(c.path));
  assert.equal(dl.length, 1);
  assert.equal(dl[0].followRedirects, false);
  const filed = w.caseItem()._attachmentBytes[w.caseItem().Final_PDF[0].id];
  assert.ok(w.caseItem().Final_Document_Hash.endsWith(createHash("sha256").update(filed).digest("hex")));
  // the signed URL answering a redirect: the key never leaves KF_DOMAIN
  const w2 = world();
  w2.kf.faults.push({ match: (c) => c.method === "PUT", respond: answer(500) });
  w2.post();
  w2.fire();
  w2.store.delete(`FD_${CASE_ID}`);
  w2.kf.signedRedirect = true;
  w2.fire();
  assert.ok(!w2.kf.calls.some((c) => c.host !== P.KF_DOMAIN));
  assert.match(w2.state().lastError, /signed download failed: HTTP 302/);
});

test("429 pauses the script 20 min (PAUSE_UNTIL), not an attempt; the queue files the case after the pause", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.path.includes("/CIQ_Review_A00/item"), respond: answer(429) });
  w.post();
  w.fire();
  const until = Number(w.store.get("PAUSE_UNTIL"));
  assert.ok(until - w.clock.now() > 19 * 60000 && until - w.clock.now() <= 20 * 60000);
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.equal(w.state(), null, "a pause is not a failed attempt");
  const n = w.kf.calls.length;
  assert.match(w.run("runOnce", CASE_ID).r.status, /^paused until/);
  assert.equal(w.kf.calls.length, n, "no Kissflow call while paused");
  assert.ok(w.pending().length >= 1, "a drain stays armed (the watchdog; a drain during the pause arms the next one after it)");
  w.fireAll();
  assert.ok(w.caseItem().Final_Document_Hash);
});

test("an HTML answer (Cloudflare challenge) on a REST call pauses too; a second pause within 30 min alerts once", () => {
  const w = world();
  w.kf.faults.push({ match: (c) => c.path.includes("/CIQ_Case_A00/"), respond: { status: 200, headers: { "Content-Type": "text/html; charset=UTF-8" }, body: "<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>" } });
  w.post();
  w.fire();
  assert.ok(Number(w.store.get("PAUSE_UNTIL")) > w.clock.now());
  assert.equal(w.kf.calls.length, 1);
  assert.ok(w.logs().some((l) => l.includes("pause 20 min") && l.includes('"why":"html"')));
  w.kf.faults.push({ match: () => true, respond: answer(429), times: 2 });
  w.fire();
  w.fire();
  assert.equal(adminMails(w).filter((m) => /paused again/.test(m.body)).length, 1);
});

test("the run's time limit right after the PUT: not an attempt; the next drain finishes the copy, the row and the webhook", () => {
  const w = world();
  w.kf.onCall = (c) => { if (c.method === "PUT") w.clock.advance(6 * 60000); };
  w.post();
  w.fire();
  const st = w.state();
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.ok(st && !st.attempts && st.lastStop, "kept, no attempt counted");
  assert.equal(hooks(w).length, 0);
  w.kf.onCall = null;
  w.fireAll();
  assert.deepEqual(writesOf(w.kf.calls).map((c) => c.write), ["attach", "put", "portal-attach", "form-create", "form-submit", "webhook"]);
  assert.equal(w.state(), null);
});

test("the run ends right after the audit submit: the next drain finds the row by its key, never a second", () => {
  const w = world();
  w.post();
  const t = w.drainTriggers()[0];
  w.clock.t = t.dueAt + 30000;
  t.fired = true;
  const ex = w.exec({ killWhen: (e) => e.type === "fetch" && /\/CIQ_Audit_Event_A00\/draft_[^/]+\/submit$/.test(new URL(e.url).pathname) });
  assert.throws(() => ex.call("drain", { triggerUid: t.id }), /Exceeded maximum execution time/);
  assert.equal(auditRows(w).length, 1);
  w.fireAll();
  assert.equal(auditRows(w).length, 1);
  assert.equal(writesOf(w.kf.calls).filter((c) => c.write === "form-create").length, 1);
  assert.equal(hooks(w).length, 1);
  assert.equal(w.state(), null);
});

test("a same-named file without this document's seal on the case's Final_PDF stops the case at once: never filed, copied or posted", () => {
  const probe = { key: "Final_PDF", id: "Attach-ZZTprobe", name: PDF_NAME, size: 30, fileExtension: "pdf" };
  const w = world({ mutate: (db) => Object.assign(db.CIQ_Case_A00.find((x) => x._id === CASE_ID), { Final_PDF: [probe], _attachmentBytes: { [probe.id]: Buffer.from("%PDF-1.4\n% K-15 probe\n%%EOF\n") } }) });
  w.event();
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.equal(adminMails(w).length, 1);
  assert.match(adminMails(w)[0].body, /ZZT-0005 \(case item AppZZT-0005\) was stopped[\s\S]*Attach-ZZTprobe \(seal none\)/);
  w.caseItem().Final_PDF = [];
  assert.equal(w.run("runOnce", CASE_ID).r.status, "filed");
});

test("attach answers 423 once: tried again in the same run (after a read), attached once", () => {
  const w = world();
  w.kf.faults.push({ match: isCaseAttach, respond: answer(423, { error_code: "Locked" }) });
  w.event();
  assert.equal(w.kf.calls.filter(isCaseAttach).length, 2);
  assert.equal(w.caseItem().Final_PDF.length, 1);
  assert.ok(w.logs().some((l) => l.includes("[CIQ-FD] attach busy, tried again")));
});

test("the app's builder fails on a completed case: the error names it, not 'not completed'", () => {
  const w = world({ patch: (ctx) => { ctx.CIQFinal = { ...ctx.CIQFinal, finalDocumentFor: () => ({ phase: "completed", ok: false, warnings: ["ZZT-0005: the final document could not be computed (boom)"] }) }; } });
  const r = w.run("runOnce", CASE_ID).r;
  assert.match(r.status, /the app could not build the final document: ZZT-0005: the final document could not be computed/);
});

test("Bundle.gs and Code.gs as one script (Bundle's strict mode over both) still file the case", () => {
  const w = world();
  w.post();
  const t = w.drainTriggers()[0];
  w.clock.t = t.dueAt + 30000;
  t.fired = true;
  const ex = execution({ fetch: w.kf.handle, store: w.store, world: w.world, clock: w.clock, concat: true });
  w.runs.push(ex);
  ex.call("drain", { triggerUid: t.id });
  assert.ok(w.caseItem().Final_Document_Hash);
  assert.equal(w.request().Final_PDF.length, 1);
  assert.equal(hooks(w).length, 1);
});

// ------------------------------------------------------------------ probe, triggers

test("probe: read-only, never throws without RMM_WEBHOOK_URL; logs field names (never values) and the released cases without a PDF", () => {
  const w = world({ props: { RMM_WEBHOOK_URL: undefined, RUN_ONCE_CASE_ID: CASE_ID }, listMode: "columns" });
  const props = JSON.stringify([...w.store]);
  w.run("probe");
  assert.equal(writesOf(w.kf.calls).length, 0);
  assert.equal(JSON.stringify([...w.store]), props, "no Script Property changed");
  assert.equal(w.world.mails.length, 0);
  const logs = w.logs().join("\n");
  assert.ok(logs.includes('"rmmWebhook":{"set":false'));
  assert.ok(logs.includes('"portalCopy":true'));
  assert.ok(logs.includes("Final_Release_At") && logs.includes("Case_Code"), "field names are logged");
  const missed = w.logs().find((l) => l.includes("released without a final document"));
  assert.ok(missed && missed.includes("ZZT-0005") && !missed.includes("ZZT-0008") && !missed.includes("ZZT-0006"), missed);
  assert.ok(logs.includes('"linked":true'), "its portal request names the case");
  for (const value of ["CETYL 16", "Katrin", "Elena", "Solvaro", "katrin.vogel", "Final release by"]) assert.ok(!logs.includes(value), `value in the probe log: ${value}`);
  const w2 = world();
  w2.run("probe");
  assert.ok(w2.logs().some((l) => l.includes("missed events cannot be listed")));
});

test("tick is retired: an old tick trigger removes itself; removeTriggers clears tick and drain; no installTrigger", () => {
  const w = world();
  w.exec().ctx.ScriptApp.newTrigger("tick").timeBased().everyMinutes(5).create();
  w.run("tick");
  assert.equal(w.world.triggers.length, 0);
  assert.equal(w.kf.calls.length, 0);
  w.exec().ctx.ScriptApp.newTrigger("tick").timeBased().everyMinutes(5).create();
  w.post();
  w.run("removeTriggers");
  assert.equal(w.world.triggers.length, 0);
  assert.equal(w.queue().length, 1, "queued cases stay queued");
  assert.equal(typeof w.exec().ctx.installTrigger, "undefined");
});

test("a run without the lock does nothing", () => {
  const w = world();
  const ex = execution({ fetch: w.kf.handle, store: w.store, world: w.world, clock: w.clock, lockFree: () => false });
  w.runs.push(ex);
  ex.call("probe");
  assert.equal(ex.call("runOnce", CASE_ID).status, "busy: another run holds the lock");
  assert.equal(ex.call("portalCopy", CASE_ID).status, "busy: another run holds the lock");
  assert.equal(w.kf.calls.length, 0);
});

// ------------------------------------------------------------------ the PDF's wording

test("the PDF words the document as the app's tab: labels, not codes; part 4 round by round; no internal reason", () => {
  const w = world();
  w.event();
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
    "ZZT-0005-FD · generated 19 Oct 2026, 20:00 CEST", // 28 Oct: two steps earlier (no Sustainability review in the fixtures), then four more (FLD-A2-101 pre-filled when Annex 2 opens, M9: one answer step less per fixture case), then 18 more (the RMES criteria are retired: completeAll records no criterion results)
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

// ------------------------------------------------------------------ cache

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
    ["POST", new RegExp(`/admin/CIQP_Request_A00/${REQ_ID}/Final_PDF/attachment$`)],
    ["POST", /^\/form\/2\/[^/]+\/CIQ_Audit_Event_A00$/],
    ["POST", /\/CIQ_Audit_Event_A00\/draft_planned\/submit$/],
  ];
  assert.equal(live.planned.length, want.length, live.planned.map((x) => `${x.method} ${x.path}`).join("\n"));
  want.forEach(([m, re], i) => assert.ok(live.planned[i].method === m && re.test(live.planned[i].path), `${live.planned[i].method} ${live.planned[i].path}`));
  assert.equal(live.planned[0].file.name, PDF_NAME);
  assert.equal(live.pdf().name, PDF_NAME);
  assert.ok(pdfText(live.pdf().bytes).startsWith("%PDF-1.4"));
  assert.equal(live.planned[1].body.Final_Document_Hash, `seal:${EXPECTED.fingerprint} sha256:${createHash("sha256").update(live.pdf().bytes).digest("hex")}`);
  assert.equal(live.planned[3].body.Notify_Recipient, undefined, "MAIL_ENABLED is false in the harness: no notification recorded");
  assert.equal(live.portalPdf().name, PDF_NAME);
  assert.notEqual(sealOf(live.portalPdf().bytes), EXPECTED.fingerprint, "the portal gets the supplier copy");
  assert.ok(!w.kf.calls.some((c) => c.path.includes("/webhook/")), "the harness never posts the webhook");
  assert.equal(w.world.mails.length, 0);
  const calls = w.kf.calls;
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at - calls[i - 1].at >= 8000, "8 s between calls");
  assert.ok(!Object.keys(keptState(store)).some((k) => k.startsWith("KF_")), "the kept state holds no connection data");
});

test("live harness, --apply: the writes reach Kissflow and are read back", () => {
  const { w, r, live } = harnessRun(true);
  assert.equal(r.status, "filed");
  assert.deepEqual(w.kf.writes().map((c) => c.write), ["attach", "put", "portal-attach", "form-create", "form-submit"]);
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
