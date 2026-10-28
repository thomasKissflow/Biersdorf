// Applies the 21 Oct hardening (HARDENING.md) to ONE of the app session's six hand-off integrations, end to end over REST:
//   preflight → ZZT fixture → 1 switch OFF → 2 rebuild the draft (as build.mjs harden-apply: backup, PUT, read back) →
//   3 capture the trigger sample while OFF → 4 per-step Tests (as test-chain.mjs test) → 5 the new sample into the draft
//   trigger → 6 publish, switch ON, read back → the live guard checks (HARDENING step 6) → clean-up (step 7, after the group's
//   last key). The capture route is the portal session's, proven 21 Oct on I-6 / I-7 (night-2026-10-20/integrations/
//   capture-sample.mjs, finish-integ.mjs).
//
//   node kissflow-build/ciq-digital/integrations/apply-harden.mjs <key>                      DRY RUN (default): the plan
//   node kissflow-build/ciq-digital/integrations/apply-harden.mjs <key> --apply              LIVE: Thomas runs or approves it
//   node kissflow-build/ciq-digital/integrations/apply-harden.mjs <key> --reactivate [--apply]   switch ON again (after a 429)
//   node kissflow-build/ciq-digital/integrations/apply-harden.mjs cleanup <op|case|all> [--apply]   delete the ledger's ZZT items
//   keys in HARDENING.md's order: opRound opEdited opClosed (group op, one open point) · history release cancelled (group case)
//
// Safety:
// - Dev sandbox only: the account and host kf.mjs reads from .env must be AcDOSunMEpSA / dev-beiersdorf.kissflow.eu, checked
//   before the first call. Credentials stay in kf.mjs; this file never reads .env.
// - One call at a time, >= 6 s apart (webhook POSTs included), retries 0. A 429 or an HTML answer stops the run at once:
//   both sessions pause 20 min. If the integration may be OFF then, the run writes apply-harden-PENDING.json and prints the
//   one command that switches it ON after the pause (it does not sleep 20 min itself).
// - It never leaves the integration OFF on exit otherwise: the switch-on runs in a finally block (also on Ctrl-C). Until step
//   6's publish, the PUBLISHED version is still the unhardened 20 Oct one, so switching on restores service. If the failure
//   IS the switch-on, it says so loudly and does not retry.
// - Every ZZT item (tag ZZT-N21-A3) is recorded in apply-harden-ledger.jsonl: an intent line before its create, its id right
//   after the answer that reveals it, before any further call. `cleanup` deletes from the ledger.
// - Webhook URLs come from SET:current (as live-hook.mjs) and are never printed or logged.
// - Run history is not readable over REST: a refused live call is verified by its target's read-back (unchanged), and the
//   message Run history must show is printed for Thomas to confirm in the builder.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APP, DEFS, hardenSpecOf, idsOf } from "./integ-defs.mjs";
import { hardenDraft, checkHardened, integrity } from "./harden.mjs";

export const DEV_ACC = "AcDOSunMEpSA", DEV_HOST = "dev-beiersdorf.kissflow.eu";
export const TAG = "ZZT-N21-A3";
export const ORDER = ["opRound", "opEdited", "opClosed", "history", "release", "cancelled"];
export const GROUP = { opRound: "op", opEdited: "op", opClosed: "op", history: "case", release: "case", cancelled: "case" };
const LAST = { op: "opClosed", case: "cancelled" };
export const CODE = { opRound: "op.round", opEdited: "op.edited", opClosed: "op.closed", release: "release.requested", history: "history.updated", cancelled: "case.cancelled" };
export const PACE_MS = 6000, WAIT_REFUSED_MS = 30000, POLL_TRIES = 10, PAUSE_MIN = 20;
const PORTAL = "CIQ_Supplier_Portal_A00";
const CASE = "CIQ_Case_A00", OP = "CIQ_Open_Point_A00", RQ = "CIQP_Request_A00", QRY = "CIQP_Query_A00";
const APP_OF = { [CASE]: APP, [OP]: APP, [RQ]: PORTAL, [QRY]: PORTAL };
const ME = "UsEJUfjYLM8Y"; // the dev contact, as zzt-op.mjs and the night runner use it
const ME_LIST = JSON.stringify([{ _id: ME }]);
const SUP = "zzt.supplier.a3@example.com";
const RELEASE_FIELDS = ["Release_At", "Release_By_Name", "Release_By_Email", "Release_By_Role"];
const SELF = "kissflow-build/ciq-digital/integrations/apply-harden.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));

export class RateLimited extends Error {}
class Interrupted extends Error {}
class StepFail extends Error { constructor(step, msg) { super(msg); this.step = step; } }

// ---- small helpers ----
let seq = 0;
const newId = (p) => `${p}_${Date.now().toString(36).slice(-5)}${(++seq).toString(36)}`; // integ-lib.mjs newId (not imported: it reads .env)
export const redact = (v) => {
  const s = typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v);
  return s.replace(/https?:\/\/[^\s"'\\<>]+/g, "<url redacted>");
};
const short = (v, n = 300) => redact(v).slice(0, n);
const briefBody = (b) => (b === undefined ? "" : b && typeof b === "object" && b.Root ? `<draft, ${Object.keys(b).length} entries>` : short(b, 160));
const isHtml = (body) => typeof body === "string" && /<html|<!doctype html/i.test(body);
const SYS = new Set(["_modified_at", "_status", "_current_step"]);
const stable = (it) => (it ? Object.fromEntries(Object.entries(it).filter(([k]) => !k.startsWith("_") || SYS.has(k))) : null);
const diffKeys = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
const empty = (v) => v === undefined || v === null || v === "";
const list = (v) => (Array.isArray(v) ? v : []);
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d/;
/** A read-back equal to what was written: a time compared as a time, JSON text compared parsed. */
const sameValue = (got, want) => {
  if (typeof want === "string" && ISO.test(want)) return Date.parse(got) === Date.parse(want);
  if (typeof want === "string" && /^[[{]/.test(want)) { try { return JSON.stringify(JSON.parse(got)) === JSON.stringify(JSON.parse(want)); } catch { return got === want; } }
  return JSON.stringify(got) === JSON.stringify(want);
};
const PAIR_ROLES = new Set(["C1", "R1", "C2"]); // the case group's items, even when an op key creates them (cleaned after cancelled)
const actOf = (it) => it?._current_context?.[0]?._context_activity_instance_id || (typeof it?._activity_instance_id === "string" ? it._activity_instance_id : it?._activity_instance_id?.[0]);
const scriptText = (f) => readFileSync(here(`./scripts/${f}`), "utf8");
const fileStamp = (t) => new Date(t).toISOString().replace(/[:.]/g, "-");

/** The ledger's ZZT items that are not deleted (latest record per id). */
export function activeItems(ledger, groups) {
  const gone = new Set(ledger.filter((e) => e.ev === "deleted").map((e) => e.id));
  const m = new Map();
  for (const e of ledger) if (e.ev === "created" && e.id && !gone.has(e.id)) m.set(e.id, e);
  return [...m.values()].filter((e) => !groups || groups.includes(e.group));
}

// ---- stores: the files (live) or memory (dry run, test) ----
export function fileStore(dir = here(".")) {
  const LEDGER = `${dir}/apply-harden-ledger.jsonl`, PENDING = `${dir}/apply-harden-PENDING.json`, STATE = `${dir}/state.json`;
  return {
    kind: "file", ledgerPath: LEDGER, pendingPath: PENDING,
    appendLedger: (e) => appendFileSync(LEDGER, JSON.stringify(e) + "\n"),
    readLedger: () => (existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []),
    backup: (id, blob, tag, t) => { mkdirSync(`${dir}/backups`, { recursive: true }); const f = `backups/${id}.${tag}.${fileStamp(t)}.json`; writeFileSync(`${dir}/${f}`, JSON.stringify(blob, null, 1)); return f; },
    readState: () => JSON.parse(readFileSync(STATE, "utf8")),
    updateState: (K, patch) => { const s = JSON.parse(readFileSync(STATE, "utf8")); s.integrations[K] = { ...(s.integrations[K] || {}), ...patch }; writeFileSync(STATE, JSON.stringify(s, null, 1)); },
    readPending: () => (existsSync(PENDING) ? JSON.parse(readFileSync(PENDING, "utf8")) : null),
    writePending: (p) => writeFileSync(PENDING, JSON.stringify(p, null, 1)),
    clearPending: () => { if (existsSync(PENDING)) unlinkSync(PENDING); },
    logRequest: (e) => appendFileSync(`${dir}/requests.jsonl`, JSON.stringify(e) + "\n"),
    writeRun: (r, t) => { mkdirSync(`${dir}/apply-harden-runs`, { recursive: true }); const f = `apply-harden-runs/${r.key}.${fileStamp(t)}.json`; writeFileSync(`${dir}/${f}`, JSON.stringify(r, null, 1)); return f; },
  };
}
export function memoryStore(state, ledger = []) {
  const m = { kind: "memory", ledger, backups: {}, state: structuredClone(state), pending: null, runs: [], requests: [], ledgerPath: "(memory)", pendingPath: "(memory)" };
  return Object.assign(m, {
    appendLedger: (e) => { m.ledger.push(structuredClone(e)); },
    readLedger: () => structuredClone(m.ledger),
    backup: (id, blob, tag, t) => { const f = `backups/${id}.${tag}.${fileStamp(t)}.json`; m.backups[f] = structuredClone(blob); return `${f} (dry run: not written)`; },
    readState: () => structuredClone(m.state),
    updateState: (K, patch) => { m.state.integrations[K] = { ...(m.state.integrations[K] || {}), ...patch }; },
    readPending: () => structuredClone(m.pending),
    writePending: (p) => { m.pending = structuredClone(p); },
    clearPending: () => { m.pending = null; },
    logRequest: (e) => { m.requests.push(e); },
    writeRun: (r) => { m.runs.push(structuredClone(r)); return `(memory run ${m.runs.length})`; },
  });
}

/** The live transport: kf.mjs (it reads .env; credentials never pass through here), retries 0; the webhook POST as the app sends it. */
export async function liveRaw() {
  const { client } = await import("../../lib/kf.mjs");
  const kf = client({ readOnly: false });
  return {
    acc: kf.acc, domain: kf.domain,
    call: (method, path, body) => kf.call(method, path, body, { retries: 0 }),
    hook: async (url, payload) => {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(payload) });
      return { status: r.status, text: (await r.text()).slice(0, 300) };
    },
  };
}

/** Paced, logged, stop-on-429 wrapper around a raw transport. */
function pacer(raw, { paceMs, sleep, now, print, log, abort }) {
  let last = now(), count = 0, hooks = 0; // the first call waits a full pace too: a run started right after another keeps the gap
  const gate = async (force) => {
    if (abort?.flag && !force) throw new Interrupted("interrupted (Ctrl-C)");
    const wait = last + paceMs - now();
    if (wait > 0) await sleep(wait);
  };
  return {
    get count() { return count; }, get hooks() { return hooks; },
    async call(method, path, body, { force = false } = {}) {
      await gate(force);
      let r;
      try { r = await raw.call(method, path, body); } finally { last = now(); count++; }
      print(`     ${method.padEnd(6)} ${path}${body !== undefined && method !== "GET" && method !== "DELETE" ? "  " + briefBody(body) : ""}  → ${r.status}`);
      log?.({ at: new Date(now()).toISOString(), method, path, status: r.status, req: body === undefined ? undefined : short(body, 1500), res: short(r.body, 1500) });
      if (r.status === 429 || isHtml(r.body)) throw new RateLimited(`${r.status}${isHtml(r.body) ? " (HTML answer)" : ""} on ${method} ${path.split("?")[0]}`);
      return r;
    },
    async hook(code, url, payload) {
      await gate(false);
      let r;
      try { r = await raw.hook(url, payload); } finally { last = now(); count++; hooks++; }
      print(`     POST   <webhook ${code}: URL from SET:current, not printed>  ${short(payload, 200)}  → ${r.status}`);
      log?.({ at: new Date(now()).toISOString(), method: "POST", path: `webhook:${code}`, status: r.status, req: short(payload, 1500), res: short(r.text, 300) });
      if (r.status === 429 || isHtml(r.text)) throw new RateLimited(`${r.status} on the ${code} webhook`);
      return r;
    },
  };
}

/** The shared machinery of one run: transport, ledger, item helpers. */
function machine(o, { key, group, run }) {
  const { raw, store, out, sleep, now } = o;
  const tx = pacer(raw, { paceMs: o.paceMs ?? PACE_MS, sleep, now, print: out, log: o.dry ? null : store.logRequest, abort: o.abort });
  const A = raw.acc;
  const ledger = (e) => store.appendLedger({ at: new Date(now()).toISOString(), run, key, group, ...e });
  const iso = () => new Date(now()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const plusDays = (d) => new Date(now() + d * 864e5).toISOString().slice(0, 10);
  const itemPath = (flow, id) => `/process/2/${A}/admin/${flow}/${id}?_application_id=${APP_OF[flow]}`;
  const get = async (flow, id) => { const r = await tx.call("GET", itemPath(flow, id)); return r.status === 200 ? r.body : null; };
  const put = async (flow, id, data) => (await tx.call("PUT", itemPath(flow, id), data)).status;
  const search = async (flow, q) => {
    const r = await tx.call("GET", `/process/2/${A}/admin/${flow}/item?q=${encodeURIComponent(q)}&page_number=1&page_size=100&_application_id=${APP_OF[flow]}`);
    return Array.isArray(r.body?.Data) ? r.body.Data : [];
  };
  /** A create: the intent goes to the ledger before the call, the id right after it (before any further call). */
  async function create(role, flow, body, note, step = "F") {
    const code = body.Case_Code && flow === CASE ? body.Case_Code : body.OP_Key;
    const g = PAIR_ROLES.has(role) ? { group: "case" } : {};
    ledger({ ev: "intent", role, flow, app: APP_OF[flow], code, note, ...g });
    const r = await tx.call("POST", `/process/2/${A}/${flow}?_application_id=${APP_OF[flow]}`, body);
    const id = r.body?._id;
    if (id) ledger({ ev: "created", role, flow, app: APP_OF[flow], id, code, note, ...g });
    if (r.status >= 300 || !id) throw new StepFail(step, `create ${role} (${flow}): ${r.status} ${short(r.body)}`);
    return { id, act: r.body._activity_instance_id, code };
  }
  async function submit(flow, id, act) {
    let a = act;
    if (!a) a = actOf(await get(flow, id));
    const r = await tx.call("POST", `/process/2/${A}/${flow}/${id}/${a}/submit?_application_id=${APP_OF[flow]}`, {});
    return { status: r.status, body: r.body, after: await get(flow, id) };
  }
  async function poll(flow, id, okFn, tries = o.pollTries ?? POLL_TRIES) {
    for (let i = 0; i < tries; i++) { const it = await get(flow, id); if (it && okFn(it)) return it; }
    return null;
  }
  return { tx, A, ledger, iso, plusDays, get, put, search, create, submit, poll, itemPath };
}

// ---- fixture bodies (fictional; the night runner's shapes) ----
const caseBody = (code, plusDays, extra = {}) => ({
  Case_Code: code, Cycle_No: 1, Case_Title: `${code} hardening apply test case (fictional)`, Case_Test: "Yes", Priority: "Normal",
  Trade_Name: "ZZT HardenGlow Ester (fictional)", Main_INCI: "Caprylic/Capric Triglyceride", BDF_Material_No: `${code}-RM`, SAP_Material_No: "ZZT-SAP-0001", IRMA_Ref: "ZZT-IRMA-1",
  Supplier_Code: "ZZT-SUP-A3", Supplier_Legal_Name: "ZZT Apply Test Chemie GmbH (fictional)", Owner_RMM: { _id: ME },
  Target_Markets_Text: "EU", Markets_Label: "EU", Template_Label: "ZZT template (fictional)",
  BDF_Contact_Name: "ZZT RMM (fictional)", BDF_Contact_Email: "rmm.a3.zzt@example.com", Supplier_Due_Date: plusDays(14),
  Case_Contacts_JSON: JSON.stringify([{ id: ME, name: "ZZT Contact (fictional)", email: SUP, title: "QA", mayConfirm: true }]),
  Portal_Contact_Ids: ME, Confirm_Contact_Ids: ME, Supplier_Contact_Emails: SUP,
  Release_Item_Id: "ZZT-REL-ITEM", Release_Key: "ZZT-REL-A3", Manifest_Hash: "zzt-manifest-hash", Release_Manifest_JSON: '{"zzt":true}',
  Rule_Set_Version: "ZZT-RS-A3", Template_Version: "ZZT-TPL-A3",
  Config_Bundle_JSON: JSON.stringify({ format: "ciq-bundle/1", zzt: true, note: "hardening apply test" }), Config_Bundle_Hash: "zzt-bundle-a3", BDF_Set_JSON: '{"zzt":true}',
  Portal_Assignees_JSON: ME_LIST, Release_Assignees_JSON: ME_LIST, ...extra,
});
const pointBody = (opKey, caseId, caseCode, plusDays, extra = {}) => ({
  OP_Key: opKey, Round_No: 1, Query_Key: `${opKey}-R1`, Case_Code: caseCode, Cycle_No: 1, Supplier_Code: "ZZT-SUP-A3", Case_Item_Id: caseId,
  OP_Kind: "Query", OP_Dept: "QM", Raised_By_Dept: "QM", OP_To_Supplier: "Yes", Raised_By_User: { _id: ME }, Raised_By_Name: "ZZT Quentin Test (fictional)",
  Ref_Kind: "Section", Ref_Label: "K4 · ZZT test section", Ref_Section_Key: "K4", Kind_Label: "Question",
  Question_Text: `ZZT ${opKey} question for the hardening apply test (fictional).`, Supplier_Justification: "ZZT test justification (fictional).",
  Responsible_User: { _id: ME }, Responsible_Name: "ZZT Quentin Test (fictional)", Responsible_Dept_Label: "Quality Management",
  Supplier_Due_Date: plusDays(14), OP_Progress: "Open", Portal_Contact_Ids: ME, Raiser_Assignee: [{ _id: ME }], Thread_JSON: "[]", ...extra,
});

/**
 * One key, end to end. o: {raw, store, out, sleep, now, dry?, paceMs?, waitRefusedMs?, pollTries?, abort?, run?}.
 * Returns {code, rec}: 0 done · 1 failed (the integration is ON; rolled back to the published version if before step 6) ·
 * 2 stopped before any switch (nothing switched; ZZT items may exist: see the ledger) · 3 LOUD: it may be OFF ·
 * 75 rate-limited (both sessions pause 20 min; the pending switch-on command is printed if it may be OFF).
 */
export async function runKey(K, o) {
  const { store, out, now, sleep } = o;
  const d = DEFS[K];
  if (!d) throw new Error(`unknown key ${K}: ${ORDER.join(" ")}`);
  const group = GROUP[K], spec = hardenSpecOf(K), { T, S1, S2, PS } = idsOf(K);
  const state = store.readState();
  const id = state.integrations?.[K]?.id;
  const run = o.run ?? now().toString(36).slice(-5).toUpperCase();
  const code = { from: scriptText(d.code), to: scriptText(`harden/${d.code}`) };
  const M = machine(o, { key: K, group, run });
  const { tx, A, ledger, get, put, search, create, submit, poll } = M;
  const rec = { key: K, id, run, mode: o.dry ? "dry run (stub)" : "apply", startedAt: new Date(now()).toISOString(), steps: [], checks: [], backups: {}, result: null };
  const head = (tag, title) => out(`\n${tag.padEnd(2)} ${title}`);
  const note = (s) => out(`   ${s}`);
  const fail = (step, msg) => { throw new StepFail(step, msg); };
  const step = (n, what) => { rec.steps.push({ step: n, what, at: new Date(now()).toISOString() }); };
  const activatePath = `/flow/2/${A}/integration/${id}/activate?_application_id=${APP}`;
  const listRow = async (force = false) => {
    const r = await tx.call("GET", `/flow/2/${A}/integration/?_application_id=${APP}&page_number=1&page_size=100`, undefined, { force });
    return (Array.isArray(r.body) ? r.body : r.body?.Data || []).find((x) => x._id === id) || null;
  };
  const urls = {};
  const hook = async (c, payload) => {
    if (!urls[c]) throw new StepFail("F", `no webhook URL loaded for ${c} (the preflight reads only those this key needs)`);
    const sent = { ...payload, idempotencyKey: `${TAG}-${K}-${now().toString(36)}-${++seq}` };
    return { ...(await tx.hook(c, urls[c], sent)), sent };
  };
  const L = () => store.readLedger();
  const role = (r) => activeItems(L()).filter((e) => e.role === r).at(-1) || null;
  const verdict = (label, pass, detail, extra = {}) => {
    rec.checks.push({ label, pass: !!pass, ...(detail !== undefined ? { detail } : {}), ...extra });
    out(`   ${pass ? "ok  " : "FAIL"} ${label}${pass || detail === undefined ? "" : " — " + short(detail)}`);
    return !!pass;
  };

  let mayBeOff = false, activateFailed = false, limited = null, failure = null, published = false, codeOut = 0;
  out(`## ${K} · ${id} · ${o.dry ? "DRY RUN against a stub of Kissflow (no Kissflow call, no webhook POST, nothing written)" : "APPLY (live, dev sandbox)"} · run ${run}`);
  try {
    // ---------------------------------------------------------------- preflight (no write)
    head("P", "preflight: dev sandbox, Live and ON, the live draft passes the hardening check offline, the webhook URLs");
    if (!id) fail("P", `no integration id for ${K} in state.json`);
    if (A !== DEV_ACC || o.raw.domain !== DEV_HOST) fail("P", `not the dev sandbox (account ${A}, host ${o.raw.domain}): refused before any call`);
    note(`account ${A} · host ${o.raw.domain} (dev sandbox) ok`);
    const pending = store.readPending();
    if (pending) fail("P", `a switch-on is pending for ${pending.key} (${pending.id}) since ${pending.at}: run it first: ${pending.command}`);
    const row0 = await listRow();
    if (!row0 || !/^live$/i.test(row0.Status || "") || row0.IsActive !== true) fail("P", `${id} is not Live and ON (Status ${row0?.Status}, IsActive ${row0?.IsActive}): nothing done`);
    note(`${id}: Status ${row0.Status}, IsActive true`);
    const live0 = (await tx.call("GET", `/metadata/2/${A}/integration/${id}/draft`)).body;
    if (!live0 || typeof live0 !== "object" || !live0.Root) fail("P", `the live draft is unreadable: ${short(live0)}`);
    rec.backups.preflight = store.backup(id, live0, "preflight", now());
    note(`live draft saved: ${rec.backups.preflight}  (reprint the check offline: node kissflow-build/ciq-digital/integrations/build.mjs ${K} harden <that file>)`);
    const schemas = {};
    for (const a of Object.keys(spec.clear)) {
      const sf = (await tx.call("GET", `/integration/2/${A}/${id}/action/${a}/fields`)).body;
      if (!Array.isArray(sf)) fail("P", `${a}'s field schema is unreadable: ${short(sf)}`);
      schemas[a] = sf;
    }
    let pre;
    try { pre = hardenDraft(live0, spec, code, newId, schemas); } catch (e) { fail("P", `the live draft fails the hardening check (build.mjs harden): ${e.message}${(e.diff || []).length ? "\n      " + e.diff.join("\n      ") : ""}`); }
    if (pre.already) note("the live draft is already hardened (an earlier run): step 2 will not PUT; steps 3–6 run again");
    else {
      const problems = checkHardened(pre.blob, spec, code.to), i0 = integrity(live0), i1 = integrity(pre.blob);
      if (problems.length || i1.problems.length > i0.problems.length) fail("P", `the hardened draft would not check out: ${[...problems, ...i1.problems].join("; ")}`);
      note(`hardened shape ok (${pre.changes.length} planned changes; scripts/${d.code} → scripts/harden/${d.code}${Object.keys(schemas).length ? "; the cleared fields' schema read live" : ""})`);
    }
    const need = [CODE[K], ...(K === "cancelled" ? ["release.requested"] : []), ...(role("C1") && role("R1") ? [] : ["case.started"])];
    const cfg = (await tx.call("POST", `/form/2/${A}/CIQ_Config_Version_A00/list?page_number=1&page_size=100&_application_id=${APP}`, {})).body;
    const set = (Array.isArray(cfg) ? cfg : cfg?.Data || []).find((r) => r.Config_Key === "SET:current");
    let hooksCfg = {};
    try { hooksCfg = JSON.parse(set?.Payload_JSON || "{}")?.webhooks || {}; } catch { hooksCfg = {}; }
    for (const c of need) {
      if (!/^https:\/\//.test(String(hooksCfg[c] || ""))) fail("P", `no https webhook for ${c} in SET:current`);
      urls[c] = hooksCfg[c];
    }
    note(`webhooks read from SET:current (not printed): ${need.join(", ")}`);

    // ---------------------------------------------------------------- fixture (before the switch-off)
    head("F", `fixture (fictional, ${TAG}; each item in the ledger ${store.ledgerPath === "(memory)" ? "" : "apply-harden-ledger.jsonl "}before any further call)`);
    const fx = await fixture(K, { M, o, role, run, note, verdict, hook, fail, get, put, create, submit, poll, search });
    rec.fixture = fx.summary;
    const payload = fx.payload;

    // ---------------------------------------------------------------- 1 switch OFF
    head("1", "switch OFF (a capture on an ON integration runs it for real)");
    mayBeOff = true; // from here, the finally block switches it back on
    step(1, "deactivate");
    const offR = await tx.call("PUT", `/flow/2/${A}/integration/${id}/deactivate?_application_id=${APP}`, {});
    if (offR.status >= 300 || offR.body?.IsActive !== false) fail(1, `deactivate ${offR.status} ${short(offR.body)}`);
    note(`IsActive false: hand-offs to ${CODE[K]} are lost until step 6`);

    // ---------------------------------------------------------------- 2 rebuild the draft (build.mjs harden-apply)
    head("2", "rebuild the draft (build.mjs harden-apply: re-read the live draft, back it up, refuse a manual change, PUT, read back)");
    step(2, "harden-apply");
    const live = (await tx.call("GET", `/metadata/2/${A}/integration/${id}/draft`)).body;
    if (!live || typeof live !== "object" || !live.Root) fail(2, `the live draft is unreadable: ${short(live)}`);
    rec.backups.beforeHarden = store.backup(id, live, "before-harden", now());
    note(`backup ${rec.backups.beforeHarden} (the unhardened draft, its 20 Oct tested flags)`);
    let r2;
    try { r2 = hardenDraft(live, spec, code, newId, schemas); } catch (e) { fail(2, `STOP (nothing written): ${e.message}${(e.diff || []).length ? "\n      " + e.diff.join("\n      ") : ""}`); }
    if (r2.already) note("already hardened: nothing to PUT");
    else {
      for (const c of r2.changes) note(c);
      const pd = await putDraft(tx, A, id, r2.blob);
      if (pd.status >= 300) fail(2, `PUT draft ${pd.status} ${short(pd.body)}`);
    }
    const back2 = (await tx.call("GET", `/metadata/2/${A}/integration/${id}/draft`)).body;
    const p2 = checkHardened(back2, spec, code.to);
    if (p2.length) fail(2, `read-back MISMATCH: ${p2.join("; ")}`);
    note(`read-back hardened · trigger tested ${!!back2?.[T]?.IsTested}`);
    if (!o.dry) store.updateState(K, { hardened: "draft hardened (untested, unpublished)" });

    // ---------------------------------------------------------------- 3 capture the sample while OFF
    head("3", "capture the trigger sample while OFF (the trigger Test answers at once; the webhook POST ~6 s later becomes its sample)");
    step(3, "capture");
    const tt = await tx.call("POST", `/integration/2/${A}/${id}/trigger/${T}/test?_application_id=${APP}`, {});
    if (tt.status >= 300 || tt.body?.status === "error") fail(3, `trigger Test ${tt.status} ${short(tt.body)}`);
    const sent = { ...payload, idempotencyKey: `${TAG}-${K}-capture-${run}` };
    const hc = await tx.hook(CODE[K], urls[CODE[K]], sent);
    if (hc.status >= 300) fail(3, `webhook POST ${hc.status}`);
    note("the listen answer is not the sample (\"NOT captured\" is expected there); step 4's first Test shows whether it landed");

    // ---------------------------------------------------------------- 4 per-step Tests (test-chain.mjs test)
    head("4", "per-step Tests on the ZZT data (each step really runs), each passed Output stored with IsTested true");
    step(4, "tests");
    const b0 = (await tx.call("GET", `/metadata/2/${A}/integration/${id}/draft`)).body;
    rec.backups.beforeTests = store.backup(id, b0, "before-tests", now());
    const actions = b0?.[b0.Root]?.["Integration::Action"] || [];
    if (!b0?.[T]?.IsTested) fail(4, "the webhook trigger is not marked tested");
    for (const eid of actions) {
      const t = await tx.call("POST", `/integration/2/${A}/${id}/action/${eid}/test?_application_id=${APP}`, {});
      const passed = t.status < 300 && t.body && typeof t.body === "object" && t.body.status !== "error" && !t.body.error_code;
      rec.steps.push({ step: 4, test: eid, status: t.status, pass: passed, answer: short(t.body, 1500) });
      if (!passed) fail(4, `${eid} failed its Test: ${t.status} ${short(t.body)}`);
      await fx.onTested?.(eid, t.body, { S1, S2, PS }); // records an item the Test created before any further call; checks the capture
      const b = (await tx.call("GET", `/metadata/2/${A}/integration/${id}/draft`)).body;
      b[eid] = { ...b[eid], Output: t.body, IsTested: true };
      const ps = await putDraft(tx, A, id, b);
      if (ps.status >= 300) fail(4, `could not store ${eid}'s Output: ${ps.status} ${short(ps.body)}`);
      note(`PASS ${eid}`);
    }
    const back4 = (await tx.call("GET", `/metadata/2/${A}/integration/${id}/draft`)).body;
    const untested = actions.filter((a) => !back4?.[a]?.IsTested);
    if (untested.length) fail(4, `read-back: not tested: ${untested.join(", ")}`);
    await fx.afterTests?.();
    if (!o.dry) store.updateState(K, { tested: "every action passed (hardened draft)" });

    // ---------------------------------------------------------------- 5 the new sample into the draft trigger
    head("5", "the new sample's ids into the draft trigger's stored Output (same shape), IsTested true (finish-integ.mjs)");
    step(5, "trigger sample");
    const b5 = (await tx.call("GET", `/metadata/2/${A}/integration/${id}/draft`)).body;
    const o5 = structuredClone(b5?.[T]?.Output ?? {});
    const tgt = o5 && typeof o5 === "object" && o5.body && typeof o5.body === "object" ? o5.body : o5;
    Object.assign(tgt, sent);
    b5[T] = { ...b5[T], Output: o5, IsTested: true };
    const un5 = actions.filter((a) => !b5[a]?.IsTested);
    if (un5.length) fail(5, `untested: ${un5.join(", ")}`);
    const p5 = await putDraft(tx, A, id, b5);
    if (p5.status >= 300) fail(5, `PUT draft ${p5.status} ${short(p5.body)}`);
    const back5 = (await tx.call("GET", `/metadata/2/${A}/integration/${id}/draft`)).body;
    const o5b = back5?.[T]?.Output, t5b = o5b?.body && typeof o5b.body === "object" ? o5b.body : o5b;
    if (!back5?.[T]?.IsTested || t5b?.[d.key] !== payload[d.key]) fail(5, `read-back: the trigger Output does not hold ${d.key} ${payload[d.key]}`);
    note(`trigger Output ${d.key} = ${payload[d.key]}, IsTested true; every action tested`);

    // ---------------------------------------------------------------- 6 publish, switch ON, read back
    head("6", "publish, switch ON, read back (Status Live, IsActive true)");
    step(6, "publish + activate");
    const pub = await tx.call("POST", `/metadata/2/${A}/integration/${id}/publish`, {});
    if (pub.status >= 300) fail(6, `publish ${pub.status} ${short(pub.body)}`);
    published = true;
    const pubActs = pub.body?.Blob?.[id]?.["Integration::Action"];
    if (Array.isArray(pubActs) && !pubActs.includes(S2)) fail(6, `the published version has no ${S2}`);
    const on = await tx.call("PUT", activatePath, {});
    if (on.status >= 300 || on.body?.IsActive !== true) { activateFailed = true; fail(6, `SWITCH-ON FAILED: activate ${on.status} ${short(on.body)}`); }
    mayBeOff = false;
    const row6 = await listRow();
    if (row6?.IsActive !== true) { mayBeOff = true; activateFailed = true; fail(6, `SWITCH-ON NOT CONFIRMED: read-back IsActive ${row6?.IsActive}`); }
    if (!/^live$/i.test(row6?.Status || "")) fail(6, `read-back Status ${row6?.Status}`);
    note(`read-back Status ${row6.Status}, IsActive true (the hardened version is live)`);
    if (!o.dry) store.updateState(K, { hardened: `applied ${new Date(now()).toISOString().slice(0, 10)}: hardened, tested, published`, active: true });

    // ---------------------------------------------------------------- the live guard checks (HARDENING step 6)
    head("G", "live guard checks (real webhook POSTs, ZZT data only). Run history isn't readable over REST: a refusal is verified by its target's read-back (unchanged), and the message below is the one Run history must show (confirm in Manage → Integrations → Run history)");
    const okChecks = await fx.liveChecks({ refused, accepted });
    rec.liveChecks = okChecks ? "all passed" : "FAILED";
    if (!okChecks) { codeOut = 1; failure = new StepFail("G", "a live guard check failed: the hardened version is live; see above"); }

    // ---------------------------------------------------------------- 7 clean-up after the group's last key
    if (!failure && K === LAST[group]) {
      head("7", `clean-up of group ${group} (withdraw if in progress, delete, read back 404)`);
      const left = await cleanupItems(M, store, [group], note);
      if (left.length) { codeOut = 1; failure = new StepFail(7, `clean-up left ${left.length} item(s): ${left.join(", ")}`); }
    } else if (!failure) out(`\n   clean-up: after ${LAST[group]} (group ${group}); its open items stay in the ledger until then`);
  } catch (e) {
    if (e instanceof RateLimited) limited = e;
    failure = e;
  } finally {
    if (mayBeOff) {
      if (limited) codeOut = pendingPlan({ K, id, o, rec, reason: limited.message, out, published });
      else if (activateFailed) { codeOut = 3; loud(out, id, K, `the switch-on itself failed (${failure?.message}); not retried`); }
      else {
        out(`\n!  ROLLBACK: switching ${id} back ON (${published ? "the hardened version is published" : "the published version is still the unhardened 20 Oct one"})`);
        try {
          const on = await tx.call("PUT", activatePath, {}, { force: true });
          const row = on.status < 300 && on.body?.IsActive === true ? await listRow(true) : null;
          if (row?.IsActive === true) { out(`   ON again: Status ${row.Status}, IsActive true`); rec.rolledBack = true; }
          else { codeOut = 3; loud(out, id, K, `the rollback switch-on failed (activate ${on.status} ${short(on.body)}; read-back ${row?.IsActive})`); }
        } catch (e2) {
          if (e2 instanceof RateLimited) codeOut = pendingPlan({ K, id, o, rec, reason: e2.message, out, published });
          else { codeOut = 3; loud(out, id, K, `the rollback switch-on failed: ${e2.message}`); }
        }
      }
    }
  }

  // ---------------------------------------------------------------- summary
  if (failure && !codeOut) codeOut = limited ? 75 : failure instanceof StepFail && (failure.step === "P" || failure.step === "F") ? 2 : 1;
  if (limited && !mayBeOff && codeOut !== 75) codeOut = 75;
  if (limited && !mayBeOff) out(`\n!  RATE-LIMITED (${limited.message}). Both sessions pause ${PAUSE_MIN} min. ${id} was not switched OFF by this run (or is ON again): nothing to switch on.`);
  rec.result = failure ? `${failure instanceof StepFail ? `step ${failure.step}: ` : ""}${failure.message}` : "done";
  rec.code = codeOut;
  rec.calls = tx.count; rec.hooks = tx.hooks; rec.endedAt = new Date(now()).toISOString();
  out(`\n== ${K}: ${failure ? "STOPPED" : "DONE"} (exit ${codeOut}) · ${rec.result}`);
  if (failure && !(failure instanceof RateLimited) && !["P", "F"].includes(failure.step)) {
    const unhardened = rec.backups.beforeHarden || rec.backups.preflight;
    if (unhardened) out(`   backup of the unhardened draft: ${unhardened} (HARDENING "Rollback": PUT it as the draft, read back, then publish + switch on)`);
    if (published) out("   the hardened version is published and ON; roll back only with Thomas (HARDENING \"Rollback\")");
    else if (rec.rolledBack) out("   service restored: the unhardened 20 Oct version runs; the draft is hardened and partly tested (don't publish it from the builder)");
  }
  if (failure && ["P", "F"].includes(failure.step)) out("   nothing was switched or written to the integration");
  const open = activeItems(store.readLedger());
  if (open.length) {
    out(`   open ZZT items in the ledger: ${open.map((e) => `${e.role}=${e.id} (${e.group})`).join(", ")}`);
    if (failure) out(`   clean them up when done: ${[...new Set(open.map((e) => e.group))].map((g) => `node ${SELF} cleanup ${g} --apply`).join("  ·  ")}`);
  }
  out(`   calls ${tx.count} (webhook POSTs ${tx.hooks}) · ${Math.round((now() - Date.parse(rec.startedAt)) / 1000)} s`);
  if (!o.dry) out(`   run record: ${store.writeRun(rec, now())}`);
  else store.writeRun(rec, now());
  return { code: codeOut, rec };

  // ---- the live-check helpers (they read `tx` and friends from the closure) ----
  /** A hand-off that must be refused: after WAIT_REFUSED every target reads back as before. */
  async function refused(label, c, payload, targets, expect, extra) {
    const before = [];
    for (const [flow, tid] of targets) before.push(stable(await get(flow, tid)));
    const h = await hook(c, payload);
    await sleep(o.waitRefusedMs ?? WAIT_REFUSED_MS);
    const changed = [];
    for (let i = 0; i < targets.length; i++) {
      const [flow, tid] = targets[i];
      const dk = diffKeys(before[i], stable(await get(flow, tid)));
      if (dk.length) changed.push(`${flow} ${tid}: ${dk.join(",")}`);
    }
    const more = extra ? await extra() : null;
    const pass = verdict(`${label}: refused, target(s) unchanged after ${Math.round((o.waitRefusedMs ?? WAIT_REFUSED_MS) / 1000)} s${more?.label ? "; " + more.label : ""}`, h.status < 300 && !changed.length && (!more || more.pass),
      { webhook: h.status, changed, ...(more ? { extra: more.detail } : {}) },
      { kind: "refused", code: c, sent: h.sent, expect, verifiedBy: "target read-back (Run history is not readable over REST)" });
    out(`        Run history must show: "${expect}"`);
    return pass;
  }
  /** A hand-off that must apply: poll its target until okFn holds. */
  async function accepted(label, c, payload, flow, tid, okFn) {
    const h = await hook(c, payload);
    const it = await poll(flow, tid, okFn);
    verdict(`${label}: applied`, h.status < 300 && !!it, { webhook: h.status }, { kind: "accepted", code: c, sent: h.sent });
    return it;
  }
}

/** PUT a draft only when it is a real draft object holding its model id (meta.mjs putDraft's guard against an HTML challenge). */
async function putDraft(tx, A, id, blob) {
  if (!blob || typeof blob !== "object" || Array.isArray(blob) || !blob[id] || typeof blob[id] !== "object") throw new StepFail("draft", `putDraft refused for ${id}: not a JSON draft containing its model id`);
  return tx.call("PUT", `/metadata/2/${A}/integration/${id}/draft`, blob);
}

function loud(out, id, K, why) {
  const bar = "!".repeat(100);
  out(`\n${bar}\n!!! ${id} MAY BE OFF: ${why}.\n!!! Hand-offs to ${CODE[K]} are LOST while it is off. Switch it ON now in the builder (Manage → Integrations), or run:\n!!!   node ${SELF} ${K} --reactivate --apply\n${bar}`);
}

/** After a 429 / HTML answer while the integration may be OFF: write the pending switch-on, print the exact command. */
function pendingPlan({ K, id, o, rec, reason, out, published = false }) {
  const t = o.now(), notBefore = new Date(t + PAUSE_MIN * 60000);
  const command = `node ${SELF} ${K} --reactivate --apply`;
  const p = { key: K, id, at: new Date(t).toISOString(), notBefore: notBefore.toISOString(), reason, command, published };
  o.store.writePending(p);
  rec.pending = p;
  const bar = "!".repeat(100);
  out(`\n${bar}\n!!! RATE-LIMITED: ${reason}. Both sessions stop for ${PAUSE_MIN} min (no further call from this run).\n!!! ${id} MAY BE OFF: hand-offs to ${CODE[K]} are lost until it is ON.\n!!! At or after ${notBefore.toISOString()} (local ${notBefore.toLocaleTimeString()}) run exactly:\n!!!   ${command}\n!!! (one call: PUT …/activate, then the read-back; harmless if it is already ON). Pending: ${o.store.pendingPath}\n${bar}`);
  return 75;
}

/** Deletes the ledger's open items of the groups: portal items first, then the app's (withdraw if in progress), 404 read-back. */
async function cleanupItems(M, store, groups, note) {
  const ORDER_FLOW = [QRY, RQ, OP, CASE];
  const todo = activeItems(store.readLedger(), groups).sort((a, b) => ORDER_FLOW.indexOf(a.flow) - ORDER_FLOW.indexOf(b.flow));
  const left = [];
  for (const e of todo) {
    const path = M.itemPath(e.flow, e.id);
    const g = await M.tx.call("GET", path);
    if (g.status === 404) { M.ledger({ ev: "deleted", role: e.role, flow: e.flow, id: e.id, group: e.group, how: "already gone (GET 404)" }); note(`${e.role} ${e.id}: already gone`); continue; }
    if (g.body?._status === "InProgress") await M.tx.call("POST", `/process/2/${M.A}/${e.flow}/${e.id}/withdraw?_application_id=${APP_OF[e.flow]}`, { Comment: `${TAG} clean-up (fictional test data)` });
    const del = await M.tx.call("DELETE", path);
    const g2 = await M.tx.call("GET", path);
    if (g2.status === 404) { M.ledger({ ev: "deleted", role: e.role, flow: e.flow, id: e.id, group: e.group, how: `DELETE ${del.status}, GET 404` }); note(`${e.role} ${e.id}: deleted (GET 404)`); }
    else { left.push(`${e.role}=${e.id}`); note(`${e.role} ${e.id}: STILL THERE (DELETE ${del.status}, GET ${g2.status})`); }
  }
  return left;
}

/**
 * The fixture each key needs (HARDENING "Before you start" and step 3's table), the checks on its step-4 Tests, and its
 * live guard checks (step 6). Returns {payload, summary, onTested, afterTests, liveChecks}.
 */
async function fixture(K, x) {
  const { M, o, role, run, note, verdict, hook, fail, get, put, create, submit, poll, search } = x;
  const iso = M.iso, plusDays = M.plusDays;
  const pfx = `${TAG}-${run}`;
  const need = (r) => { const e = role(r); if (!e) fail("F", `no open ${r} in the ledger: run the keys in HARDENING.md's order (${ORDER.join(" → ")})`); return e; };

  /** The shared case and request pair, linked both ways (I-1 creates and links the request, as for a real case). */
  async function ensurePair({ make = true } = {}) {
    const c1 = role("C1"), r1 = role("R1");
    if (c1 && r1) {
      const c = await get(CASE, c1.id), r = await get(RQ, r1.id);
      if (c?.Portal_Request_Item_Id !== r1.id || r?.App_Case_Item_Id !== c1.id) fail("F", `the ledger's pair ${c1.id} / ${r1.id} is not linked both ways (${c?.Portal_Request_Item_Id} / ${r?.App_Case_Item_Id}): clean up first`);
      note(`pair reused: C1 ${c1.id} (${c1.code}) ⇄ R1 ${r1.id}`);
      return { c1: c1.id, c1code: c1.code, r1: r1.id };
    }
    if (!make) fail("F", `the case and request pair is not in the ledger (C1 ${c1?.id}, R1 ${r1?.id}): run the op group again from opRound`);
    if (c1 || r1) fail("F", `half a pair in the ledger (C1 ${c1?.id}, R1 ${r1?.id}): node ${SELF} cleanup case --apply first`);
    const code = `${pfx}-C1`;
    const c = await create("C1", CASE, caseBody(code, plusDays), "the pair's case (fictional)");
    const s = await submit(CASE, c.id, c.act);
    if (s.status >= 300 || s.after?._status !== "InProgress") fail("F", `C1's Start submit: ${s.status} ${short(s.body)}; now ${s.after?._status} ${s.after?._current_step}`);
    note(`C1 ${c.id} (${code}) at "${s.after._current_step}"`);
    await hook("case.started", { caseItemId: c.id });
    const linked = await poll(CASE, c.id, (it) => !!it.Portal_Request_Item_Id);
    if (!linked) fail("F", "case.started (I-1) did not link a request to C1");
    M.ledger({ ev: "created", role: "R1", flow: RQ, app: PORTAL, id: linked.Portal_Request_Item_Id, code, note: "the pair's request (created by I-1)", group: "case" });
    const r = await get(RQ, linked.Portal_Request_Item_Id);
    if (r?.App_Case_Item_Id !== c.id) fail("F", `R1 ${linked.Portal_Request_Item_Id} does not name C1 back (${r?.App_Case_Item_Id})`);
    note(`R1 ${r._id} (I-1) ⇄ C1 ${c.id}`);
    return { c1: c.id, c1code: code, r1: r._id };
  }
  /** C2: a second case with Portal_Request_Item_Id preset to R1, submitted like a real case (no case.started). */
  async function ensureC2(pair) {
    const e = role("C2");
    if (e) {
      const c = await get(CASE, e.id);
      if (c?.Portal_Request_Item_Id !== pair.r1) fail("F", `the ledger's C2 ${e.id} no longer presets R1 (${c?.Portal_Request_Item_Id})`);
      note(`C2 reused: ${e.id} (${e.code}) → R1, not named back`);
      return { c2: e.id, c2code: e.code };
    }
    const code = `${pfx}-C2`;
    const c = await create("C2", CASE, caseBody(code, plusDays, { Portal_Request_Item_Id: pair.r1, Case_Title: `${code} FORGED link for the reverse-link check (fictional)` }), "forged case: Portal_Request_Item_Id preset to R1");
    const s = await submit(CASE, c.id, c.act);
    if (s.status >= 300 || s.after?.Portal_Request_Item_Id !== pair.r1) fail("F", `C2's submit: ${s.status}; preset ${s.after?.Portal_Request_Item_Id}`);
    note(`C2 ${c.id} (${code}) → R1 ${pair.r1}, submitted, R1 doesn't name it back`);
    return { c2: c.id, c2code: code };
  }
  async function point(r, opKey, pair, extra, label) {
    const p = await create(r, OP, pointBody(opKey, pair.c1, pair.c1code, plusDays, extra), label);
    const s = await submit(OP, p.id, p.act);
    if (s.status >= 300 || s.after?._status !== "InProgress") fail("F", `${r}'s raise submit: ${s.status} ${short(s.body)}; now ${s.after?._status}`);
    return { id: p.id, code: opKey, item: s.after };
  }
  const readBack = async (flow, id, want, what) => {
    const it = await get(flow, id);
    const bad = Object.entries(want).filter(([k, v]) => (v === null ? !empty(it?.[k]) : !sameValue(it?.[k], v)));
    if (bad.length) fail("F", `${what}: read-back differs on ${bad.map(([k]) => k).join(", ")}`);
    return it;
  };
  const noQueryFor = async (pid) => (await search(QRY, pid)).filter((q) => q.App_Open_Point_Id === pid);
  const recordUnexpected = (rows, why) => { for (const q of rows) if (!activeItems(o.store.readLedger()).some((e) => e.id === q._id)) M.ledger({ ev: "created", role: `X-${q._id}`, flow: QRY, app: PORTAL, id: q._id, note: `UNEXPECTED: ${why}` }); };
  const capture = (wantId, keyName) => (eid, out, { S1, S2 }) => {
    if (eid === S1 && !list(out?.Data).some((r) => r?._id === wantId)) fail(4, `the capture did not land: ${S1} found no ${keyName} ${wantId} (the Test read an old sample)`);
  };

  // ---------------- group op: one open point P1 through op.round → op.edited → op.closed
  if (K === "opRound") {
    const open = activeItems(o.store.readLedger(), ["op"]);
    if (open.length) fail("F", `group op has open items from an earlier run (${open.map((e) => `${e.role}=${e.id}`).join(", ")}): node ${SELF} cleanup op --apply first`);
    const pair = await ensurePair();
    const op1 = `${pfx}-OP1`, op3 = `${pfx}-OP3`;
    const P1 = await point("P1", op1, pair, {}, "P1: the point of the op group (round 1, no query yet)");
    if (!empty(P1.item?.Portal_Query_Item_Id)) fail("F", "P1 already links a query");
    note(`P1 ${P1.id} (${op1}) InProgress at "${P1.item._current_step}", round 1, no query`);
    const P3 = await point("P3", op3, pair, {}, "P3: Completed without OP_Outcome (a REST submit ignores Mandatory)");
    const s3 = await submit(OP, P3.id, actOf(P3.item)); // the second submit (at "Open point – …") completes it
    if (s3.after?._status !== "Completed" || !empty(s3.after?.OP_Outcome)) fail("F", `P3 did not complete without an outcome: ${s3.status}, now ${s3.after?._status}, OP_Outcome ${s3.after?.OP_Outcome}`);
    note(`P3 ${P3.id} (${op3}) Completed, no OP_Outcome`);
    let R1q = null;
    return {
      payload: { opItemId: P1.id }, summary: { C1: pair.c1, R1: pair.r1, P1: P1.id, P3: P3.id },
      async onTested(eid, out, ids) {
        capture(P1.id, "opItemId")(eid, out, ids);
        if (eid === ids.S2 && list(out?.Data).some((q) => q?.Query_Key === `${op1}-R1`)) fail(4, `${ids.S2} found a query for ${op1}-R1 already`);
        if (eid === "Action_OR_create_query") {
          R1q = out?._id || out?.Id;
          if (!R1q) fail(4, `Action_OR_create_query's Output has no _id: ${short(out)}`);
          M.ledger({ ev: "created", role: "R1q", flow: QRY, app: PORTAL, id: R1q, code: `${op1}-R1`, note: "P1's round-1 query (created by the step-4 Test)" });
        }
      },
      async afterTests() {
        const p = await get(OP, P1.id), q = await get(QRY, R1q);
        if (p?.Portal_Query_Item_Id !== R1q || q?.App_Open_Point_Id !== P1.id || q?.Query_Key !== `${op1}-R1`) fail(4, `round 1 not linked: P1 → ${p?.Portal_Query_Item_Id}, R1q names ${q?.App_Open_Point_Id} / ${q?.Query_Key}`);
        note(`the Test created R1q ${R1q} (${op1}-R1) and linked it on P1: an empty search reached the script as an accepted value`);
      },
      async liveChecks({ refused, accepted }) {
        let all = true;
        const st = await put(OP, P1.id, { Round_No: 2, Query_Key: `${op1}-R2` });
        all = verdict("bump P1 to round 2 (admin PUT Round_No 2, Query_Key …-R2)", st === 200 && (await get(OP, P1.id))?.Query_Key === `${op1}-R2`, st) && all;
        const it = await accepted("op.round on P1 round 2 → a new R2 query, linked on P1", "op.round", { opItemId: P1.id }, OP, P1.id, (x) => !empty(x.Portal_Query_Item_Id) && x.Portal_Query_Item_Id !== R1q);
        if (!it) return false;
        const R2q = it.Portal_Query_Item_Id;
        M.ledger({ ev: "created", role: "R2q", flow: QRY, app: PORTAL, id: R2q, code: `${op1}-R2`, note: "P1's round-2 query (created by the live op.round)" });
        const q2 = await get(QRY, R2q);
        all = verdict("R2q carries Query_Key …-R2 and names P1", q2?.Query_Key === `${op1}-R2` && q2?.App_Open_Point_Id === P1.id, { Query_Key: q2?.Query_Key, App_Open_Point_Id: q2?.App_Open_Point_Id }) && all;
        all = (await refused("op.round on P1 again (the same round)", "op.round", { opItemId: P1.id }, [[OP, P1.id]],
          `Open point ${op1} already has CIQP Query ${R2q} for ${op1}-R2 (if the point doesn't link it yet: set Portal_Query_Item_Id to it)`,
          async () => { const rows = await noQueryFor(P1.id); const r2 = rows.filter((q) => q.Query_Key === `${op1}-R2`); recordUnexpected(r2.filter((q) => q._id !== R2q), "twin R2 query"); return { pass: r2.length === 1, label: "still one R2 query", detail: r2.map((q) => q._id) }; })) && all;
        all = (await refused("op.round on P3 (Completed, no OP_Outcome)", "op.round", { opItemId: P3.id }, [[OP, P3.id]],
          `Open point ${op3} is Completed: no new round`,
          async () => { const rows = await noQueryFor(P3.id); recordUnexpected(rows, "query for the Completed P3"); return { pass: rows.length === 0, label: "no query for P3", detail: rows.map((q) => q._id) }; })) && all;
        return all;
      },
    };
  }
  if (K === "opEdited" || K === "opClosed") {
    const P1 = need("P1"), R1q = need("R1q"), R2q = need("R2q");
    const pair = await ensurePair({ make: false });
    const p1 = await get(OP, P1.id);
    if (p1?._status !== "InProgress" || p1?.Portal_Query_Item_Id !== R2q.id || !empty(p1?.OP_Outcome)) fail("F", `P1 is not InProgress linking R2q without an outcome (${p1?._status}, ${p1?.Portal_Query_Item_Id}, ${p1?.OP_Outcome})`);
    const q2 = await get(QRY, R2q.id);
    if (q2?._status !== "InProgress") fail("F", `R2q ${R2q.id} is ${q2?._status}, not InProgress`);
    let P2 = role("P2");
    if (P2) {
      const p2 = await get(OP, P2.id);
      if (p2?.Portal_Query_Item_Id !== R1q.id || p2?._status !== "InProgress") fail("F", `the ledger's P2 ${P2.id} no longer presets R1q (${p2?.Portal_Query_Item_Id}, ${p2?._status})`);
      note(`P2 reused: ${P2.id} (${P2.code}) → R1q, not named back`);
    } else {
      const p = await point("P2", `${pfx}-OP2`, pair, { Portal_Query_Item_Id: R1q.id }, "P2: FORGED, Portal_Query_Item_Id preset to R1q");
      if (p.item?.Portal_Query_Item_Id !== R1q.id) fail("F", `P2 lost its preset link (${p.item?.Portal_Query_Item_Id})`);
      P2 = { id: p.id, code: p.code };
      note(`P2 ${p.id} (${p.code}) InProgress → R1q ${R1q.id}, which doesn't name it back`);
    }
    const forged = `CIQP Query ${R1q.id} does not name open point ${P2.code} (${P2.id}) back`;
    if (K === "opEdited") {
      const text = `ZZT ${P1.code} question, EDITED before the op.edited capture (fictional).`;
      if ((await put(OP, P1.id, { Question_Text: text })) !== 200) fail("F", "the edit of P1's Question_Text was refused");
      await readBack(OP, P1.id, { Question_Text: text }, "P1's edited Question_Text");
      note("P1's Question_Text edited (admin PUT), read back");
      return {
        payload: { opItemId: P1.id }, summary: { P1: P1.id, P2: P2.id, R1q: R1q.id, R2q: R2q.id },
        onTested: (eid, out, ids) => {
          capture(P1.id, "opItemId")(eid, out, ids);
          if (eid === ids.S2 && !list(out?.Data).some((q) => q?._id === R2q.id && q.App_Open_Point_Id === P1.id)) fail(4, `${ids.S2}'s Data lacks R2q naming P1`);
        },
        async afterTests() {
          const q = await get(QRY, R2q.id);
          if (q?.Question_Text !== text) fail(4, `R2q's Question_Text is not the edit: ${short(q?.Question_Text)}`);
          note("the Test wrote the edited question to R2q");
        },
        async liveChecks({ refused, accepted }) {
          let all = true;
          const live = `ZZT ${P1.code} question, EDITED again for the live op.edited (fictional).`;
          all = verdict("edit P1's Question_Text again (admin PUT)", (await put(OP, P1.id, { Question_Text: live })) === 200) && all;
          all = !!(await accepted("op.edited on P1 → R2q carries the new question", "op.edited", { opItemId: P1.id }, QRY, R2q.id, (q) => q.Question_Text === live)) && all;
          all = (await refused("op.edited on P2 (forged link to R1q)", "op.edited", { opItemId: P2.id }, [[QRY, R1q.id]], forged)) && all;
          return all;
        },
      };
    }
    // opClosed
    if ((await put(OP, P1.id, { OP_Outcome: "Withdrawn", Outcome_Reason: "ZZT test close (fictional)", Closed_At: iso(), Closed_By: { _id: ME } })) !== 200) fail("F", "setting P1's OP_Outcome was refused");
    await readBack(OP, P1.id, { OP_Outcome: "Withdrawn" }, "P1's OP_Outcome");
    note("P1 OP_Outcome \"Withdrawn\" (admin PUT, zzt-op.mjs outcome), read back");
    return {
      payload: { opItemId: P1.id }, summary: { P1: P1.id, P2: P2.id, R1q: R1q.id, R2q: R2q.id },
      onTested: (eid, out, ids) => {
        capture(P1.id, "opItemId")(eid, out, ids);
        if (eid === ids.S2 && !list(out?.Data).some((q) => q?._id === R2q.id && q.App_Open_Point_Id === P1.id)) fail(4, `${ids.S2}'s Data lacks R2q naming P1`);
      },
      async afterTests() {
        const q = await get(QRY, R2q.id);
        if (q?._status !== "Completed") fail(4, `R2q is ${q?._status} after the Test, not Completed`);
        note("the Test completed R2q (Skip and complete): the accepted case is proven by step 4");
      },
      async liveChecks({ refused }) {
        let all = verdict("op.closed accepted on P1: R2q Completed by the step-4 Test (HARDENING: the step-4 Output is the proof)", (await get(QRY, R2q.id))?._status === "Completed");
        all = verdict("give P2 an OP_Outcome (admin PUT; without one \"is still open\" refuses first)", (await put(OP, P2.id, { OP_Outcome: "Withdrawn", Outcome_Reason: "ZZT forged close (fictional)", Closed_At: iso(), Closed_By: { _id: ME } })) === 200) && all;
        all = (await refused("op.closed on P2 (forged link to R1q)", "op.closed", { opItemId: P2.id }, [[QRY, R1q.id]], forged,
          async () => { const q = await get(QRY, R1q.id); return { pass: q?._status === "InProgress", label: "R1q still InProgress", detail: q?._status }; })) && all;
        return all;
      },
    };
  }

  // ---------------- group case: the pair C1 ⇄ R1 and the forged C2, through history → release → cancelled
  const pair = await ensurePair();
  const { c2, c2code } = await ensureC2(pair);
  const forgedCase = `CIQP Request ${pair.r1} does not name case ${c2code} (${c2}) back`;
  const capCase = capture(pair.c1, "caseItemId");
  const s2HasR1 = (eid, out, ids) => { if (eid === ids.S2 && !list(out?.Data).some((r) => r?._id === pair.r1 && r.App_Case_Item_Id === pair.c1)) fail(4, `${ids.S2}'s Data lacks R1 naming C1`); };
  const r1now = await get(RQ, pair.r1), c1now = await get(CASE, pair.c1);
  if (K === "history") {
    return {
      payload: { caseItemId: pair.c1, questionsHistoryJson: "[]" }, summary: { ...pair, C2: c2 },
      onTested: (eid, out, ids) => { capCase(eid, out, ids); s2HasR1(eid, out, ids); },
      async afterTests() { if (!sameValue((await get(RQ, pair.r1))?.Questions_History_JSON, "[]")) fail(4, "R1's Questions_History_JSON is not \"[]\" after the Test"); note("the Test wrote Questions_History_JSON \"[]\" to R1"); },
      async liveChecks({ refused, accepted }) {
        const json = JSON.stringify([{ opKey: `${pfx}-OP1`, round: 1, question: "ZZT question (fictional)", answer: "ZZT answer (fictional)", outcome: "Accepted", at: iso() }]);
        let all = !!(await accepted("history.updated on C1 → R1's Questions_History_JSON", "history.updated", { caseItemId: pair.c1, questionsHistoryJson: json }, RQ, pair.r1, (r) => sameValue(r.Questions_History_JSON, json)));
        all = (await refused("history.updated on C2 (forged link to R1)", "history.updated", { caseItemId: c2, questionsHistoryJson: JSON.stringify([{ opKey: "ZZT-FORGED", round: 9 }]) }, [[RQ, pair.r1]], forgedCase)) && all;
        return all;
      },
    };
  }
  if (K === "release") {
    if (String(c1now?.Case_Phase || "").toLowerCase() === "cancelled" || String(r1now?.Case_Phase_Label || "").toLowerCase() === "cancelled") fail("F", "the pair is cancelled already: release needs it not cancelled (run release before cancelled)");
    const c2now = await get(CASE, c2);
    if (String(c2now?.Case_Phase || "").toLowerCase() === "cancelled") {
      if ((await put(CASE, c2, { Case_Phase: "Supplier filling in the CIQ" })) !== 200) fail("F", "C2's Case_Phase could not be reset from an earlier backstop check");
      note("C2's Case_Phase reset from an earlier backstop check (admin PUT)");
    }
    const seed = () => ({ Release_At: iso(), Release_By_Name: "ZZT Earlier Releaser (fictional)", Release_By_Email: "zzt.release.a3@example.com", Release_By_Role: "ZZT QA lead (fictional)" });
    const s0 = seed();
    if ((await put(RQ, pair.r1, s0)) !== 200) fail("F", "seeding R1's four release fields was refused");
    await readBack(RQ, pair.r1, s0, "R1's four release fields");
    note("R1 holds ZZT values in Release_At, Release_By_Name, Release_By_Email, Release_By_Role (admin PUT), read back");
    const cleared = (r) => RELEASE_FIELDS.every((f) => empty(r?.[f]));
    return {
      payload: { caseItemId: pair.c1 }, summary: { ...pair, C2: c2 },
      onTested: (eid, out, ids) => { capCase(eid, out, ids); s2HasR1(eid, out, ids); },
      async afterTests() {
        const r = await get(RQ, pair.r1), c = await get(CASE, pair.c1);
        if (!cleared(r) || r?.Release_Flag !== "Requested") fail(4, `after the Test R1 holds ${RELEASE_FIELDS.filter((f) => !empty(r?.[f])).join(", ") || "-"}; Release_Flag ${r?.Release_Flag}`);
        if (empty(c?.Release_Requested_At)) fail(4, "C1's Release_Requested_At was not stamped");
        note("the Test cleared all four release fields on R1 (first proof that a null mapping clears the Email field) and stamped C1");
      },
      async liveChecks({ refused, accepted }) {
        const s1 = seed();
        let all = verdict("seed R1's four release fields again (admin PUT)", (await put(RQ, pair.r1, s1)) === 200);
        all = !!(await accepted("release.requested on C1 → R1's four release fields empty, Release_Flag Requested", "release.requested", { caseItemId: pair.c1 }, RQ, pair.r1, (r) => cleared(r) && r.Release_Flag === "Requested")) && all;
        all = (await refused("release.requested on C2 (forged link to R1)", "release.requested", { caseItemId: c2 }, [[RQ, pair.r1], [CASE, c2]], forgedCase)) && all;
        // the case-side backstop (HARDENING: optional): C2's own Case_Phase "Cancelled"; the pair's case is left alone
        const st = await put(CASE, c2, { Case_Phase: "Cancelled" });
        if (st === 200 && String((await get(CASE, c2))?.Case_Phase).toLowerCase() === "cancelled")
          all = (await refused("release.requested on C2 with Case_Phase Cancelled (backstop)", "release.requested", { caseItemId: c2 }, [[RQ, pair.r1], [CASE, c2]], `Case ${c2code} is cancelled: no final release`)) && all;
        else note(`(optional backstop skipped: C2's Case_Phase could not be set, PUT ${st})`);
        return all;
      },
    };
  }
  // cancelled (last of the group)
  const preLabel = String(r1now?.Case_Phase_Label || "").toLowerCase() === "cancelled" ? { Case_Phase_Label: "With Beiersdorf", Request_Locked: "No" } : { Case_Phase_Label: r1now?.Case_Phase_Label ?? "", Request_Locked: r1now?.Request_Locked ?? "No" };
  note(`R1's label before the Test: "${preLabel.Case_Phase_Label}", locked ${preLabel.Request_Locked} (put back before the C2 check, so a wrong write would show)`);
  return {
    payload: { caseItemId: pair.c1, phaseLabel: "Cancelled", locked: "Yes" }, summary: { ...pair, C2: c2 },
    onTested: (eid, out, ids) => { capCase(eid, out, ids); s2HasR1(eid, out, ids); },
    async afterTests() { const r = await get(RQ, pair.r1); if (r?.Case_Phase_Label !== "Cancelled" || r?.Request_Locked !== "Yes") fail(4, `R1 is "${r?.Case_Phase_Label}" / ${r?.Request_Locked} after the Test`); note("the Test labelled R1 \"Cancelled\" and locked it"); },
    async liveChecks({ refused, accepted }) {
      let all = verdict(`put R1's label back to "${preLabel.Case_Phase_Label}" / ${preLabel.Request_Locked} (admin PUT)`, (await put(RQ, pair.r1, preLabel)) === 200 && (await get(RQ, pair.r1))?.Case_Phase_Label === preLabel.Case_Phase_Label);
      all = (await refused("case.cancelled on C2 (forged link to R1)", "case.cancelled", { caseItemId: c2, phaseLabel: "Cancelled", locked: "Yes" }, [[RQ, pair.r1]], forgedCase)) && all;
      all = !!(await accepted("case.cancelled on C1 → R1 \"Cancelled\", locked", "case.cancelled", { caseItemId: pair.c1, phaseLabel: "Cancelled", locked: "Yes" }, RQ, pair.r1, (r) => r.Case_Phase_Label === "Cancelled" && r.Request_Locked === "Yes")) && all;
      all = (await refused("release.requested on the cancelled pair (release's cancel guard)", "release.requested", { caseItemId: pair.c1 }, [[RQ, pair.r1], [CASE, pair.c1]], `CIQP Request ${pair.r1}: the case was cancelled`)) && all;
      return all;
    },
  };
}

/** After a 429: one switch-on (PUT …/activate) and its read-back, not before the pending time. */
export async function reactivate(K, o) {
  const { store, out, now } = o;
  const id = store.readState().integrations?.[K]?.id;
  const M = machine(o, { key: K, group: GROUP[K], run: "reactivate" });
  out(`## ${K} · ${id} · switch ON${o.dry ? " · DRY RUN against a stub (no Kissflow call)" : ""}`);
  if (!id) { out("   STOP: no id in state.json"); return { code: 2 }; }
  if (M.A !== DEV_ACC || o.raw.domain !== DEV_HOST) { out(`   STOP: not the dev sandbox (${M.A}, ${o.raw.domain})`); return { code: 2 }; }
  const p = store.readPending();
  if (p && p.key === K && now() < Date.parse(p.notBefore)) { out(`   STOP: the ${PAUSE_MIN}-min pause after the 429 runs until ${p.notBefore}; run it again then: ${p.command}`); return { code: 2 }; }
  try {
    const on = await M.tx.call("PUT", `/flow/2/${M.A}/integration/${id}/activate?_application_id=${APP}`, {});
    const r = await M.tx.call("GET", `/flow/2/${M.A}/integration/?_application_id=${APP}&page_number=1&page_size=100`);
    const row = (Array.isArray(r.body) ? r.body : r.body?.Data || []).find((x) => x._id === id);
    if (on.status < 300 && row?.IsActive === true) {
      if (p && p.key === K) store.clearPending();
      M.ledger({ ev: "reactivated", id, status: row.Status });
      out(`   ON: Status ${row.Status}, IsActive true${p?.published === false ? " (the published version is the unhardened 20 Oct one; the draft is hardened: run the key again later)" : ""}`);
      return { code: 0 };
    }
    loud(out, id, K, `activate ${on.status} ${short(on.body)}; read-back IsActive ${row?.IsActive}`);
    return { code: 3 };
  } catch (e) {
    if (e instanceof RateLimited) return { code: pendingPlan({ K, id, o, rec: {}, reason: e.message, out, published: !!p?.published }) };
    loud(out, id, K, e.message);
    return { code: 3 };
  }
}

/** `cleanup <op|case|all>`: deletes the ledger's open items of the group(s). */
export async function cleanupGroups(which, o) {
  const groups = which === "all" ? ["op", "case"] : [which];
  const M = machine(o, { key: "cleanup", group: which, run: "cleanup" });
  const open = activeItems(o.store.readLedger(), groups);
  o.out(`## cleanup ${which}: ${open.length} open ZZT item(s) in the ledger${o.dry ? " · DRY RUN (no call): per item GET, POST …/withdraw if InProgress, DELETE, GET (expect 404)" : ""}`);
  for (const e of open) o.out(`   ${e.role.padEnd(4)} ${e.flow} ${e.id}  ${e.code || ""}  ${e.note || ""}`);
  if (o.dry || !open.length) return { code: 0 };
  if (M.A !== DEV_ACC || o.raw.domain !== DEV_HOST) { o.out(`   STOP: not the dev sandbox (${M.A}, ${o.raw.domain})`); return { code: 2 }; }
  try {
    const left = await cleanupItems(M, o.store, groups, (s) => o.out(`   ${s}`));
    o.out(left.length ? `   ${left.length} item(s) still there: ${left.join(", ")}` : "   all gone (GET 404)");
    return { code: left.length ? 1 : 0 };
  } catch (e) {
    if (e instanceof RateLimited) { o.out(`\n!  RATE-LIMITED (${e.message}): both sessions pause ${PAUSE_MIN} min; run the clean-up again after it.`); return { code: 75 }; }
    throw e;
  }
}

/**
 * The DRY RUN: the key's plan, made by running this file against the stub (apply-harden-sim.mjs) with a virtual clock. The
 * keys before it in HARDENING.md's order run first, quietly, so its fixture is the one it would find. Nothing is written.
 */
export async function dryRun(K, { out = console.log, ledgerFile = here("./apply-harden-ledger.jsonl") } = {}) {
  const { createSim } = await import("./apply-harden-sim.mjs");
  const state = JSON.parse(readFileSync(here("./state.json"), "utf8"));
  let t = Date.parse("2026-10-21T18:00:00Z");
  const now = () => t, sleep = async (ms) => { t += ms; };
  const ids = Object.fromEntries(ORDER.map((k) => [k, state.integrations[k].id]));
  const sim = createSim({ ids, now });
  const store = memoryStore(state);
  const raw = { acc: sim.acc, domain: sim.domain, call: sim.call, hook: sim.hook };
  const quiet = () => {};
  for (const k of ORDER.slice(0, ORDER.indexOf(K))) {
    const r = await runKey(k, { raw, store, out: quiet, now, sleep, dry: true, run: "DRY" });
    if (r.code) { out(`(the quiet simulation of ${k} failed: ${r.rec.result})`); return 1; }
  }
  const lines = [];
  const t0 = t, n0 = sim.calls.length;
  let tOff = null, tOn = null, nOff = null, nOn = null;
  const watch = (line) => {
    lines.push(line);
    if (/\/deactivate\?/.test(line) && tOff === null) { tOff = t; nOff = sim.calls.length; }
    if (/\/activate\?/.test(line) && !/deactivate/.test(line) && tOn === null) { tOn = t; nOn = sim.calls.length; }
  };
  const res = await runKey(K, { raw, store, out: watch, now, sleep, dry: true, run: "DRY" });
  // ids → their ledger roles (the sim's ids are placeholders)
  const names = new Map();
  for (const e of store.ledger) if (e.id) names.set(e.id, `<${e.role}>`);
  const sub = (s) => s.replace(/PkSIM\d{3}/g, (m) => names.get(m) || "<item>").replace(/AkSIM\d{3}/g, "<activity>");
  const real = existsSync(ledgerFile) ? readFileSync(ledgerFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const openReal = activeItems(real);
  const pend = existsSync(here("./apply-harden-PENDING.json")) ? JSON.parse(readFileSync(here("./apply-harden-PENDING.json"), "utf8")) : null;
  out(`# apply-harden ${K} · DRY RUN · no Kissflow call, no webhook POST, nothing written`);
  out(`  The plan below is this file run against apply-harden-sim.mjs (a stub of Kissflow seeded with the 21 Oct 02:2x snapshot`);
  out(`  drafts; the scripts in the drafts really run). It assumes the keys before ${K} in HARDENING.md's order ran (simulated`);
  out(`  quietly). Ids in <> are placeholders; a poll shows once; "ok" lines are the stub's answers, not proof.`);
  out(`  Real ledger (apply-harden-ledger.jsonl): ${openReal.length ? openReal.map((e) => `${e.role}=${e.id}`).join(", ") : "no open ZZT-N21-A3 items"}${pend ? ` · PENDING switch-on: ${pend.key} (${pend.command})` : ""}`);
  out(`  Live: node ${SELF} ${K} --apply   (Thomas runs it or approves it; a free shared key; tell the portal session)`);
  for (const l of lines) out(sub(l));
  const calls = sim.calls.length - n0, hooks = sim.calls.slice(n0).filter((c) => c.kind === "hook").length;
  out(`\n  totals: ${calls} calls (${calls - hooks} Kissflow REST + ${hooks} webhook POSTs), paced >= ${PACE_MS / 1000} s, retries 0 · about ${Math.round((t - t0) / 60000)} min`);
  if (tOff !== null && tOn !== null) out(`  OFF window (steps 1–6): ${nOn - nOff + 1} calls, about ${Math.round((tOn - tOff) / 60000 * 10) / 10} min`);
  out(`  ROLLBACK if a step after 1 fails: PUT /flow/2/${DEV_ACC}/integration/${ids[K]}/activate?_application_id=${APP} (until step 6's publish the published version is still the unhardened 20 Oct one), then the backup path is printed and the run stops.`);
  out(`  On a 429 / HTML answer: no further call; if it may be OFF, apply-harden-PENDING.json and the command: node ${SELF} ${K} --reactivate --apply (after the ${PAUSE_MIN}-min pause).`);
  return res.code;
}

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const [K, sub] = args.filter((a) => !a.startsWith("--"));
  const usage = `usage: apply-harden.mjs <${ORDER.join("|")}> [--apply] | <key> --reactivate [--apply] | cleanup <op|case|all> [--apply]`;
  const abort = { flag: false };
  const onSignal = (sig) => {
    if (abort.flag) { console.log(`\n!!! second ${sig}: quitting NOW. The integration MAY BE OFF: check list.mjs and switch it on (apply-harden.mjs <key> --reactivate --apply).`); process.exit(130); }
    abort.flag = true;
    console.log(`\n!  ${sig}: stopping before the next call; if the integration is OFF it is switched back ON first (${sig} again quits at once)`);
  };
  process.on("SIGINT", () => onSignal("Ctrl-C"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  const live = async () => ({ raw: await liveRaw(), store: fileStore(), out: (l) => console.log(redact(l)), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now(), abort });
  let code = 0;
  if (K === "cleanup") {
    if (!["op", "case", "all"].includes(sub)) { console.error(usage); process.exit(1); }
    code = (await cleanupGroups(sub, apply ? await live() : { raw: { acc: DEV_ACC, domain: DEV_HOST }, store: fileStore(), out: console.log, sleep: async () => {}, now: () => Date.now(), dry: true })).code;
  } else if (!DEFS[K]) { console.error(usage); process.exit(1); }
  else if (args.includes("--reactivate")) {
    if (apply) code = (await reactivate(K, await live())).code;
    else {
      const { createSim } = await import("./apply-harden-sim.mjs");
      const state = JSON.parse(readFileSync(here("./state.json"), "utf8"));
      const sim = createSim({ ids: Object.fromEntries(ORDER.map((k) => [k, state.integrations[k].id])) });
      code = (await reactivate(K, { raw: { acc: sim.acc, domain: sim.domain, call: sim.call, hook: sim.hook }, store: memoryStore(state), out: console.log, sleep: async () => {}, now: () => Date.now(), dry: true })).code;
    }
  } else code = apply ? (await runKey(K, await live())).code : await dryRun(K);
  process.exit(code);
}
