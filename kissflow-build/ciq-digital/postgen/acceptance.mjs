// ACCEPTANCE JOURNEYS over REST on the generated CIQ Digital app. WRITES TEST ITEMS: run only after Thomas approves.
// Acts as Thomas through the account key (it can submit a step only when Thomas is in the step's role; field writes
// after Start go through the admin route PUT /process/2/{acc}/admin/{proc}/{item}, D33). Every item is fictional and
// labelled "ZZT-…"; nothing is ever deleted: all created ids are listed so Thomas can delete them in the front end.
//
//   node kissflow-build/ciq-digital/postgen/acceptance.mjs --dry-run     no network: prints the planned calls against
//                                                                         the offline simulator (lib/sim.mjs)
//   node kissflow-build/ciq-digital/postgen/acceptance.mjs               LIVE (after approval)
//   options: --journeys d,a,b        run only these journeys (default: d,a,b,c,e,f,g,h, in that order)
//            --user-fields=self      fill User fields with Thomas himself (default: leave them blank; fictional data only)
//            --waive "<text>"        let the gate ignore readback FAILs whose "area id" contains <text> (repeatable;
//                                    never applies to membership). Every waiver is recorded in the result.
//            --quiet                 (dry-run) don't print every planned call
//            --sim-fault <name>      (dry-run) inject a simulator defect to see the gate refuse (e.g. thomas-missing, condition)
//
// Before ANY write it runs the full readback (lib/readback-core.mjs) and refuses to run if the readback has a FAIL
// outside "membership", and refuses each journey whose roles don't all contain Thomas (it prints which).
// Output: postgen/acceptance-result.json (live, rewritten after every journey) or acceptance-result.dry-run.json.
import { appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  APP, Results, THOMAS, buildExpectations, dateIn, disableNetwork, evalFormula, isBlank, loadPlan, short, stamp, stepOwners,
} from "./lib/expect.mjs";
import { liveReadback, printResults } from "./lib/readback-core.mjs";

// ------------------------------------------------------------------------------------------------------------------
// options
// ------------------------------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
if (DRY) disableNetwork("acceptance --dry-run"); // structural guard: no fetch exists in this process from here on
const QUIET = argv.includes("--quiet");
const opt = (name) => { const eq = argv.find((a) => a.startsWith(`${name}=`)); if (eq) return eq.slice(name.length + 1); const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const WAIVE = argv.flatMap((a, i) => (a === "--waive" ? [argv[i + 1]] : a.startsWith("--waive=") ? [a.slice(8)] : [])).filter(Boolean);
const ORDER = ["d", "a", "b", "c", "e", "f", "g", "h"];
const SELECTED = (opt("--journeys") || ORDER.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const USER_FIELDS = opt("--user-fields") === "self" ? "self" : "skip";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const RESULT_FILE = here(DRY ? "./acceptance-result.dry-run.json" : "./acceptance-result.json");
const LEDGER = here("./acceptance-items.jsonl"); // live only, append-only: every created item of every run (the result file is rewritten per run)
const now = new Date();
const RUN = `${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}`;
const T = (j) => `ZZT-${RUN}-${j}`; // every test item carries this label
const sleep = (ms) => (DRY ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
const rnd10 = () => Array.from({ length: 10 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
for (const j of SELECTED) if (!ORDER.includes(j)) { console.error(`unknown journey "${j}" (known: ${ORDER.join(",")})`); process.exit(2); }

// ------------------------------------------------------------------------------------------------------------------
// clients: live = writer (logs every call to postgen/acceptance-requests.jsonl) + read-only client for the readback;
// dry-run = the offline simulator, every call printed.
// ------------------------------------------------------------------------------------------------------------------
const plan = loadPlan();
const exp = buildExpectations(plan);
let api, ro;
if (DRY) {
  const { createSim } = await import("./lib/sim.mjs");
  const sim = createSim({ plan, exp, faults: argv.flatMap((a, i) => (a === "--sim-fault" ? [argv[i + 1]] : [])) });
  ro = sim;
  let n = 0;
  api = {
    acc: sim.acc,
    call: async (method, path, body) => {
      const r = await sim.call(method, path, body);
      if (!QUIET) console.log(`  [dry-run ${String(++n).padStart(3)}] ${method.padEnd(4)} ${path}${body !== undefined ? "  " + short(body, 170) : ""}  → ${r.status}${r.status >= 300 ? " " + short(r.body?.message ?? r.body, 100) : ""}`);
      return r;
    },
  };
} else {
  const { client } = await import("../../lib/kf.mjs"); // loaded only in live mode
  const { writer } = await import("../../lib/meta.mjs");
  ro = client({ readOnly: true });
  const w = writer(here("./acceptance-requests.jsonl"));
  api = { acc: w.acc, call: w.call };
}
const A = api.acc, Q = `_application_id=${APP}`;
const call = (m, p, b) => api.call(m, p, b);
const msg = (r) => r?.body?.message ?? r?.body?.en_message ?? r?.body?.error_code ?? (typeof r?.body === "string" ? r.body.slice(0, 120) : "");

// ------------------------------------------------------------------------------------------------------------------
// result file
// ------------------------------------------------------------------------------------------------------------------
const RESULT = { at: now.toISOString(), mode: DRY ? "dry-run (offline simulator, nothing sent)" : "live", runTag: `ZZT-${RUN}`, userFields: USER_FIELDS, readback: null, journeys: [], items: [], refused: [] };
const flush = () => writeFileSync(RESULT_FILE, JSON.stringify(RESULT, null, 2));

// ------------------------------------------------------------------------------------------------------------------
// 1. READBACK FIRST (gate)
// ------------------------------------------------------------------------------------------------------------------
console.log(`${DRY ? "DRY RUN (offline simulator; nothing is sent)" : "LIVE RUN"} · run tag ZZT-${RUN} · journeys ${SELECTED.join(",")}`);
const RB = new Results();
let rb = { ids: { flows: {} }, membership: {}, liveSteps: {} };
try { rb = await liveReadback({ kf: ro, exp, R: RB, saveDir: DRY ? null : here("./live") }); }
catch (e) { RB.fail("readback", "readback completed", `aborted: ${String(e?.message || e).slice(0, 300)}`); }
if (!DRY) {
  writeFileSync(here("./readback-result.json"), JSON.stringify({ at: new Date().toISOString(), mode: "live (GET only, run by acceptance.mjs)", app: APP, graphRevision: plan.rev, ok: RB.counts.FAIL === 0, counts: RB.counts, summary: RB.byArea(), ids: rb.ids, membership: rb.membership, liveSteps: rb.liveSteps, checks: RB.checks }, null, 2));
}
const fails = RB.checks.filter((c) => c.status === "FAIL");
const waived = fails.filter((c) => c.area !== "membership" && WAIVE.some((w) => `${c.area} ${c.id}`.includes(w)));
const blocking = fails.filter((c) => c.area !== "membership" && !waived.includes(c));
RESULT.readback = { counts: RB.counts, blocking: blocking.map((c) => `${c.area} · ${c.id}`), waived: waived.map((c) => `${c.area} · ${c.id}`), membershipFails: fails.filter((c) => c.area === "membership").map((c) => c.id) };
console.log(`readback${DRY ? " (simulated)" : ""}: ${RB.counts.PASS} pass · ${RB.counts.FAIL} fail · ${RB.counts.WARN} warn${waived.length ? ` · ${waived.length} waived` : ""}`);
if (blocking.length) {
  printResults(RB, { title: "READBACK FAILED: acceptance refuses to write anything", maxLines: 80 });
  RESULT.refused.push({ all: true, reason: "readback has FAILs outside membership", fails: RESULT.readback.blocking });
  flush();
  console.log(`\nREFUSED: fix the app (or waive a understood FAIL with --waive "<text>") and run again. → ${RESULT_FILE}`);
  process.exit(2);
}
const flowIdOf = (name) => rb.ids.flows[name];
const F = (name) => { const f = exp.flows.find((x) => x.name === name); return { ...f, liveId: flowIdOf(name) }; };
const thomasIn = (roleName) => !!rb.membership[roleName]?.members?.includes(THOMAS._id);

// ------------------------------------------------------------------------------------------------------------------
// 2. journey machinery
// ------------------------------------------------------------------------------------------------------------------
class Journey {
  constructor(key, title) {
    this.rec = { journey: key, title, ok: null, path: [], expectedPath: [], checks: [], items: [], notes: [] };
    this.skippedUser = new Set();
  }
  check(id, ok, detail = "", severity = "assert") {
    this.rec.checks.push({ id, ok: !!ok, severity, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
    console.log(`  ${ok ? "PASS" : "FAIL"}${severity === "probe" ? " (probe)" : ""} ${id}${detail ? " · " + short(detail, 260) : ""}`);
    return !!ok;
  }
  note(t) { this.rec.notes.push(t); }
  item(flowName, id, label) {
    const it = { journey: this.rec.journey, flow: flowName, flowId: flowIdOf(flowName), id, label, status: null };
    this.rec.items.push(it);
    RESULT.items.push(it);
    if (!DRY) appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), runTag: `ZZT-${RUN}`, ...it }) + "\n");
    console.log(`  + item ${flowName} ${id} (${label})`);
    return it;
  }
  path(expected) {
    const norm = (p) => p.map((x) => x.split(" | ").sort().join(" | "));
    this.rec.expectedPath = expected;
    return this.check("step path = expected", JSON.stringify(norm(this.rec.path)) === JSON.stringify(norm(expected)), `got ${this.rec.path.join(" → ")}${JSON.stringify(norm(this.rec.path)) === JSON.stringify(norm(expected)) ? "" : ` · expected ${expected.join(" → ")}`}`);
  }
  finish() {
    if (this.skippedUser.size) this.note(`User-type fields left blank (fictional data only; Mandatory is not enforced for the key, D33): ${[...this.skippedUser].join(", ")}`);
    this.rec.ok = this.rec.checks.filter((c) => c.severity === "assert").every((c) => c.ok) && this.rec.checks.length > 0;
    for (const it of this.rec.items) if (it.status === null) it.status = "see journey";
    return this.rec;
  }
}

const sameValue = (live, want) => {
  if (want && typeof want === "object" && want._id) return live === want._id || live?._id === want._id;
  if (typeof want === "number") return live !== null && live !== "" && Number(live) === want;
  if (typeof want === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(want)) return typeof live === "string" && live.replace(/\.\d+/, "").replace(/(Z|\+00:00)$/, "") === want.replace(/Z$/, "");
  if (typeof want === "string" && /^\d{4}-\d{2}-\d{2}$/.test(want)) return typeof live === "string" && live.slice(0, 10) === want;
  return String(live ?? "") === String(want ?? "");
};
const tableOf = (s, cid) => s?.[`Table::${cid}`] ?? s?.[cid] ?? null;
// A finished item keeps one EMPTY context entry (verified live 2026-10-08: Completed case PkEKlBX_AlUK has _current_context [{}]).
const TERMINAL = new Set(["Completed", "Rejected", "Withdrawn"]);
const openTasks = (s) => (TERMINAL.has(s?._status) ? [] : (s?._current_context || []).filter((x) => x && (x._context_current_step || x._context_activity_instance_id)).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id })));

function typeProblem(fd, v) {
  switch (fd.type) {
    case "Select": return exp.listItemsByName[fd.list]?.includes(v) ? null : `"${v}" is not an item of ${fd.list}`;
    case "Number": return typeof v === "number" ? null : "not a number";
    case "Date": return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "not YYYY-MM-DD";
    case "DateTime": return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) ? null : "not a DateTime without milliseconds";
    case "Email": return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "not an e-mail";
    case "Text": case "Textarea": return typeof v === "string" ? null : "not a string";
    case "Reference": case "User": return v && v._id ? null : "needs {_id}";
    default: return `type ${fd.type} is not written by this script`;
  }
}

/** Validate inputs against the plan: field exists, not a formula, value fits the type, Editable/Mandatory at the step. */
function prepare(J, fl, stepName, inputs, { force = false } = {}) {
  const body = {}, problems = [];
  const perms = stepName ? fl.desc.perms[stepName] || {} : null;
  for (const [k, v] of Object.entries(inputs || {})) {
    if (k.startsWith("Table::")) {
      const cid = k.slice(7);
      if (!fl.desc.children[cid]) { problems.push(`${k}: no such child table`); continue; }
      if (perms && !force && !["Editable", "Mandatory"].includes(perms[cid])) J.note(`${k} written at "${stepName}" where the table is ${perms[cid] ?? "unset"} (probe)`);
      for (const row of v) for (const [c, cv] of Object.entries(row)) {
        if (c.startsWith("_")) continue;
        const fd = fl.desc.fields[c];
        if (!fd || fd.model !== cid) problems.push(`${k}.${c}: not a column of ${cid}`);
        else if (fd.formula) problems.push(`${k}.${c}: formula column`);
        else { const p = typeProblem(fd, cv); if (p) problems.push(`${k}.${c}: ${p}`); }
      }
      body[k] = v;
      continue;
    }
    const fd = fl.desc.fields[k];
    if (!fd || fd.model !== fl.id) { problems.push(`${k}: not a header field of ${fl.name}`); continue; }
    if (fd.formula) { problems.push(`${k}: formula field (computed, never written)`); continue; }
    if (fd.type === "User") { if (USER_FIELDS !== "self") { J.skippedUser.add(k); continue; } body[k] = { _id: THOMAS._id }; continue; }
    if (perms && !force && !["Editable", "Mandatory"].includes(perms[k])) problems.push(`${k}: ${perms[k] ?? "no permission"} at "${stepName}" (the Workbench could not write it)`);
    const p = typeProblem(fd, v);
    if (p) problems.push(`${k}: ${p}`);
    body[k] = v;
  }
  return { body, problems };
}

/** Mandatory fields at the step that would still be blank → fictional sample values (reported as notes). */
function autoFill(J, fl, stepName, current, body) {
  const add = {};
  for (const [k, lvl] of Object.entries(fl.desc.perms[stepName] || {})) {
    if (lvl !== "Mandatory") continue;
    const fd = fl.desc.fields[k];
    if (!fd || fd.model !== fl.id || fd.formula || fd.type === "Attachment") continue;
    if (fd.type === "User") { if (USER_FIELDS === "self" && isBlank(current?.[k]) && !(k in body)) add[k] = { _id: THOMAS._id }; else if (USER_FIELDS !== "self") J.skippedUser.add(k); continue; }
    if (k in body || !isBlank(current?.[k])) continue;
    add[k] = fd.type === "Number" ? 1 : fd.type === "Email" ? "zzt.auto@example.invalid" : fd.type === "Date" ? dateIn(14) : fd.type === "DateTime" ? stamp() : fd.type === "Select" ? exp.listItemsByName[fd.list][0] : `ZZT auto ${k}`;
  }
  if (Object.keys(add).length) J.note(`auto-filled Mandatory at "${stepName}": ${Object.keys(add).join(", ")}`);
  return add;
}

/**
 * The Workbench rule (D33): Mandatory fields and gate formulas must be filled before submit; the server doesn't enforce
 * it for the key. If the server returns no value for a gate formula (e.g. a read at Start), the formula from the plan is
 * evaluated locally on the same values, as the Workbench would; the explicit journey checks still assert server values.
 */
function mandatoryGaps(J, fl, stepName, s) {
  const gaps = [];
  for (const [k, lvl] of Object.entries(fl.desc.perms[stepName] || {})) {
    if (lvl !== "Mandatory") continue;
    const fd = fl.desc.fields[k];
    if (!fd) { if (!(tableOf(s, k) || []).length) gaps.push(`${k}: no rows`); continue; }
    if (fd.type === "Attachment" || (fd.type === "User" && USER_FIELDS !== "self")) continue;
    if (!isBlank(s?.[k])) continue;
    if (fd.formula) {
      let local = null;
      try { local = evalFormula(fd.formula, (n) => s?.[n]); } catch { /* unsupported formula: treat as blank */ }
      if (!isBlank(local)) { J.note(`"${stepName}": the server returned no value for ${k}; the plan's formula evaluates to ${JSON.stringify(local)} on the same values`); continue; }
      gaps.push(`${k} (gate formula) is blank`);
    } else gaps.push(`${k} is blank`);
  }
  return gaps;
}

const adminGet = async (fl, id) => (await call("GET", `/process/2/${A}/admin/${fl.liveId}/${id}?${Q}`)).body || {};

/** Admin-route write, then read back (write-then-verify, max 3 tries, D32). One write in flight per item. */
async function adminWrite(J, fl, id, body, label) {
  const plain = Object.entries(body).filter(([k]) => !k.startsWith("Table::"));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await call("PUT", `/process/2/${A}/admin/${fl.liveId}/${id}?${Q}`, body);
    if (r.status >= 300) { J.check(`${label}: admin-route write accepted`, false, `${r.status} ${msg(r)}`); return null; }
    const s = await adminGet(fl, id);
    const lost = plain.filter(([k, v]) => !sameValue(s[k], v)).map(([k, v]) => `${k} (sent ${short(v, 40)}, read ${short(s[k], 40)})`);
    if (!lost.length) { if (attempt > 1) J.note(`${label}: write needed ${attempt} tries`); return s; }
    if (attempt === 3) { J.check(`${label}: written values read back`, false, `lost after 3 tries: ${lost.join("; ")}`); return s; }
    await sleep(500);
  }
  return null;
}

async function waitMoved(fl, id, submittedActs) {
  for (let i = 0; i < 16; i++) {
    await sleep(1300);
    const s = await adminGet(fl, id);
    const still = openTasks(s).filter((t) => submittedActs.includes(t.act));
    if (!still.length) return s;
  }
  return null;
}

/** Create a process item at Start (fields go in the create body), optional checks at Start, then submit Start. */
async function startProcess(J, fl, startInputs, label, { atStart } = {}) {
  const start = fl.desc.tree[0].name;
  const { body, problems } = prepare(J, fl, start, startInputs);
  if (problems.length) { J.check(`"${start}": inputs valid for the step`, false, problems.join("; ")); return null; }
  const all = { ...body, ...autoFill(J, fl, start, {}, body) };
  const c = await call("POST", `/process/2/${A}/${fl.liveId}?${Q}`, all);
  if (c.status >= 300 || !c.body?._id) { J.check(`create ${fl.name}`, false, `${c.status} ${msg(c)}`); return null; }
  const h = { id: c.body._id, act: c.body._activity_instance_id, item: J.item(fl.name, c.body._id, label) };
  J.rec.path.push(start);
  const read = async () => { const r = await call("GET", `/process/2/${A}/${fl.liveId}/${h.id}/${h.act}?_response_type=full&${Q}`); return r.status < 300 ? r.body : c.body; };
  let s = await read();
  if (atStart) { await atStart(s, h, read); s = await read(); }
  const gaps = mandatoryGaps(J, fl, start, s);
  if (gaps.length) { J.check(`"${start}": Mandatory/gate fields complete before submit (Workbench rule, D33)`, false, gaps.join("; ")); return null; }
  const sub = await call("POST", `/process/2/${A}/${fl.liveId}/${h.id}/${h.act}/submit?${Q}`, {});
  if (sub.status >= 300) { J.check(`submit "${start}"`, false, `${sub.status} ${msg(sub)}`); return null; }
  h.state = await waitMoved(fl, h.id, [h.act]);
  if (!h.state) { J.check(`item left "${start}"`, false, "no move within ~20 s"); return null; }
  return h;
}

/**
 * Walk the item until it has no open task: at every hop record the open step(s), write each open step's fields through
 * the admin route (serially, verified), run the step's checks, then submit all open tasks AT THE SAME MOMENT.
 * stepPlan[stepName] = { set: {..} | (state) => {..}, force?: bool, check?: async (state, J, h) => void, stop?: async (state, task) => finalState }
 */
async function drive(J, fl, h, stepPlan, { maxHops = 14 } = {}) {
  let s = h.state;
  for (let hop = 0; hop < maxHops; hop++) {
    const open = openTasks(s);
    if (!open.length) { J.rec.path.push(`(${s._status})`); h.item.status = s._status; return s; }
    J.rec.path.push(open.map((t) => t.step).sort().join(" | "));
    for (const t of open) {
      const def = stepPlan[t.step];
      if (!def) { J.check(`an input set exists for "${t.step}"`, false, "unexpected step: the journey stops here"); h.item.status = `stopped at ${t.step}`; return s; }
      if (def.stop) { s = await def.stop(s, t); J.rec.path.push(`(${s._status})`); h.item.status = s._status; return s; }
      const inputs = typeof def.set === "function" ? def.set(s) : def.set || {};
      const { body, problems } = prepare(J, fl, t.step, inputs, { force: def.force });
      if (problems.length) { J.check(`"${t.step}": inputs valid for the step`, false, problems.join("; ")); h.item.status = `stopped at ${t.step}`; return s; }
      const all = { ...body, ...autoFill(J, fl, t.step, s, body) };
      if (Object.keys(all).length) { const r = await adminWrite(J, fl, h.id, all, t.step); if (!r) { h.item.status = `stopped at ${t.step}`; return s; } s = r; }
      if (def.check) { await def.check(s, J, h); s = await adminGet(fl, h.id); }
      const gaps = mandatoryGaps(J, fl, t.step, s);
      if (gaps.length) { J.check(`"${t.step}": Mandatory/gate fields complete before submit (Workbench rule, D33)`, false, gaps.join("; ")); h.item.status = `stopped at ${t.step}`; return s; }
    }
    const res = await Promise.all(open.map((t) => call("POST", `/process/2/${A}/${fl.liveId}/${h.id}/${t.act}/submit?${Q}`, {}).then((r) => ({ step: t.step, status: r.status, msg: msg(r) }))));
    const bad = res.filter((r) => r.status >= 300);
    if (open.length > 1) J.check(`${open.length} parallel branches submitted at the same moment`, !bad.length, res.map((r) => `${r.step}: ${r.status}${r.status >= 300 ? " " + r.msg : ""}`).join("; "));
    else if (bad.length) J.check(`submit "${open[0].step}"`, false, `${bad[0].status} ${bad[0].msg}`);
    if (bad.length) { h.item.status = `stopped at ${open.map((t) => t.step).join(" + ")}`; return s; }
    const moved = await waitMoved(fl, h.id, open.map((t) => t.act));
    if (!moved) { J.check(`item moved on after "${open.map((t) => t.step).join(" + ")}"`, false, "still there after ~20 s"); return s; }
    s = moved;
  }
  J.check("journey ended within the hop limit", false, `${maxHops} hops`);
  return s;
}

// ------------------------------------------------------------------------------------------------------------------
// 3. journey data (fictional, labelled ZZT-…)
// ------------------------------------------------------------------------------------------------------------------
const CASE = "CIQ Case", OP = "CIQ Open Point", CR = "CIQ Change Request";
const S = {
  start: "Create case", s1: "Waiting for supplier: basic data", s2: "Scope check", s3: "Waiting for supplier: completeness PS-05",
  s5: "Open items check – before release request", s6: "Overall approval", s7: "Waiting for supplier: final release PS-11", s8: "Open items check – before close",
};
const LANES = { REG: "Review – Regulatory", SAF: "Review – Safety", QM: "Review – QM", MIC: "Review – Microbiology", SUS: "Review – Sustainability", RMM: "Review – RMM" };
const DEPT_ROLE = { REG: "CIQ Regulatory Reviewer", SAF: "CIQ Safety Reviewer", QM: "CIQ QM Reviewer", MIC: "CIQ Microbiology Reviewer", SUS: "CIQ Sustainability Reviewer", RMM: "CIQ RMM" };
const ASSESS = { REG: "Assess – Regulatory", SAF: "Assess – Safety", QM: "Assess – QM", MIC: "Assess – Microbiology", SUS: "Assess – Sustainability" };
const lanesStep = (ds) => ds.map((d) => LANES[d]).sort().join(" | ");
const SHARED = { case: null }; // journey a hands its case to e (Case_Item_Id) and g (RMES Result_Case)

const caseStart = (j, overall) => ({
  Case_Code: T(j), Cycle_No: 1, Case_Title: `${T(j)} acceptance test case`, Trade_Name: `ZZT Fictional Emollient ${j}`,
  Main_INCI: "Caprylic/Capric Triglyceride", BDF_Material_No: `${T(j)}-MAT`, Supplier_Code: `ZZT-SUP-${RUN}`, Supplier_Legal_Name: "ZZT Fictional Oleo GmbH",
  Request_Key: `${T(j)}-REQ`, BDF_Contact_Name: "ZZT Rita Tester", BDF_Contact_Email: "rita.tester@example.invalid", Supplier_Due_Date: dateIn(21),
  Case_Contacts_JSON: JSON.stringify([{ id: "ZZT-PU-01", name: "ZZT Sam Supplier" }]), Portal_Contact_Ids: "ZZT-PU-01", Confirm_Contact_Ids: "ZZT-PU-01",
  Supplier_Contact_Emails: "sam.supplier@example.invalid", Release_Item_Id: `ZZT-REL-${RUN}`, Manifest_Hash: "ZZT-sha256-fictional",
  Release_Manifest_JSON: JSON.stringify({ release: `ZZT-REL-${RUN}` }), Overall_Approval_Required: overall ? "Yes" : "No", Case_Test: "Yes",
});
const laneInputs = (d, decision) => {
  const x = { [`${d}_Review_Confirm`]: "Confirmed", [`${d}_Completed_By_Email`]: `${d.toLowerCase()}.tester@example.invalid`, [`${d}_Completed_At`]: stamp(), [`${d}_Open_Count`]: 0 };
  if (d === "REG" || d === "SAF") Object.assign(x, { [`${d}_RMES_Decision`]: decision, [`${d}_RMES_Gaps`]: 0 });
  if (decision === "Rejected") x[`${d}_RMES_Decision_Reason`] = "ZZT fictional: limit exceeded";
  return x;
};
function casePlan(j, { depts, overallDecision = null, s7Open = 0 }) {
  const flags = Object.fromEntries(Object.keys(LANES).map((d) => [`Dept_${d}_Active`, depts.includes(d) ? "Yes" : "No"]));
  const p = {
    [S.s1]: { set: { Basic_Data_Received: "Yes", Portal_Request_Item_Id: `${T(j)}-PRQ` } },
    [S.s2]: { set: { ...flags, Initial_Scope_Run_Key: `${T(j)}-RUN1`, Rule_Set_Version: "ZZT-RS-1", RMES_Key: `${T(j)}-RMES`, Confirm_Contact_Ids: "ZZT-PU-01", Supplier_Contact_Emails: "sam.supplier@example.invalid", Completeness_Request_Key: `${T(j)}-CMP`, Completeness_Declaration_Text: "ZZT fictional declaration", Completeness_Text_Key: "ZZT-TXT-PS05", Completeness_Due_Date: dateIn(14), Final_Release_Request_Key: `${T(j)}-FRL`, Final_Release_Declaration_Text: "ZZT fictional release text", Final_Release_Text_Key: "ZZT-TXT-PS11", Supplier_Closing_Text: "ZZT: thank you, the questionnaire is closed." } },
    [S.s3]: { set: () => ({ Completeness_Confirm: "Confirmed", Completeness_By_Name: "ZZT Sam Supplier", Completeness_By_Email: "sam.supplier@example.invalid", Completeness_By_Role: "Quality", Completeness_At: stamp(), RMES_Created_At: stamp() }) },
    [S.s5]: {
      set: { Hold_Note: "ZZT: nothing left open", Open_Items_Count: 0, Open_CR_Count: 0 },
      check: (s, J) => J.check("S5: after RMM writes 0/0, Hold_For_Open_Items = No and Open_Items_Gate_Release = OK", s.Hold_For_Open_Items === "No" && s.Open_Items_Gate_Release === "OK", `Hold=${s.Hold_For_Open_Items} Gate=${s.Open_Items_Gate_Release}`),
    },
    [S.s6]: { set: overallDecision === "Rejected" ? { Overall_Decision: "Rejected", Overall_Reason: "ZZT fictional: Safety RMES rejected", Completion_Trigger: "Overall rejection" } : { Overall_Decision: "Approved", Overall_Reason: "ZZT fictional approval" } },
    [S.s7]: {
      set: () => ({ Completion_Trigger: "Supplier final release", Final_Release_Confirm: "Confirmed", Final_Release_By_Name: "ZZT Sam Supplier", Final_Release_By_Email: "sam.supplier@example.invalid", Final_Release_By_Role: "Quality", Final_Release_At: stamp(), Released_Revs_JSON: "{}", Evidence_List_Text: "ZZT none", Open_Items_Count: s7Open, Open_CR_Count: 0 }),
      check: (s, J) => J.check(`S7: Hold_For_Open_Items = ${s7Open ? "Yes" : "No"} with Open_Items_Count ${s7Open}`, s.Hold_For_Open_Items === (s7Open ? "Yes" : "No"), `Hold=${s.Hold_For_Open_Items}`),
    },
    [S.s8]: {
      set: { Hold_Note: "ZZT: late item resolved", Open_Items_Count: 0, Open_CR_Count: 0 },
      check: (s, J) => J.check("S8: Open_Items_Gate_Close = OK after 0/0", s.Open_Items_Gate_Close === "OK", `Gate=${s.Open_Items_Gate_Close}`),
    },
  };
  for (const d of depts) {
    const decision = d === "SAF" && overallDecision === "Rejected" ? "Rejected" : "Approved";
    p[LANES[d]] = { set: () => laneInputs(d, decision), check: (s, J) => J.check(`${LANES[d]}: ${d}_Gate = OK before submit`, s[`${d}_Gate`] === "OK", `${d}_Gate=${JSON.stringify(s[`${d}_Gate`])}`) };
  }
  return p;
}
const caseNeeds = (depts, overall) => ["CIQ RMM", ...depts.map((d) => DEPT_ROLE[d]), ...(overall ? ["CIQ Overall Approver"] : [])];

// ------------------------------------------------------------------------------------------------------------------
// 4. journeys
// ------------------------------------------------------------------------------------------------------------------
const JOURNEYS = {
  d: {
    title: "FIRST CHECK (D35/F3): a fresh case reads Open_Items_Count blank (not 0) and Hold = Yes; after 0/0 via the admin route Hold = No, S5 and S8 are skipped",
    needs: () => caseNeeds(["SUS"], false),
    run: async (J) => {
      const fl = F(CASE);
      const h = await startProcess(J, fl, caseStart("D", false), T("D"), {
        atStart: (s) => J.check("read at Start (draft): Open_Items_Count blank and Hold_For_Open_Items = Yes", isBlank(s.Open_Items_Count) && s.Hold_For_Open_Items === "Yes", `Open_Items_Count=${JSON.stringify(s.Open_Items_Count)} Hold=${JSON.stringify(s.Hold_For_Open_Items)}`, "probe"),
      });
      if (!h) return;
      const s0 = h.state;
      J.check("FIRST CHECK at S1: Open_Items_Count is blank (not 0)", isBlank(s0.Open_Items_Count), `Open_Items_Count=${JSON.stringify(s0.Open_Items_Count)} Open_CR_Count=${JSON.stringify(s0.Open_CR_Count)}`);
      J.check("FIRST CHECK at S1: Hold_For_Open_Items = Yes", s0.Hold_For_Open_Items === "Yes", `Hold=${JSON.stringify(s0.Hold_For_Open_Items)}`);
      const { body } = prepare(J, fl, null, { Open_Items_Count: 0, Open_CR_Count: 0 });
      J.note("Open_Items_Count/Open_CR_Count written at S1 through the admin route although ReadOnly there (deliberate probe; the sync service path, D33)");
      const s1 = await adminWrite(J, fl, h.id, body, "admin-route 0/0 at S1");
      if (!s1) return;
      J.check("after 0/0: Open_Items_Count reads 0 (a number, not blank)", s1.Open_Items_Count === 0 || s1.Open_Items_Count === "0", JSON.stringify(s1.Open_Items_Count));
      J.check("after 0/0: Hold_For_Open_Items = No, both gates OK", s1.Hold_For_Open_Items === "No" && s1.Open_Items_Gate_Release === "OK" && s1.Open_Items_Gate_Close === "OK", `Hold=${s1.Hold_For_Open_Items} Release=${s1.Open_Items_Gate_Release} Close=${s1.Open_Items_Gate_Close}`);
      h.state = s1;
      const end = await drive(J, fl, h, casePlan("D", { depts: ["SUS"] }));
      J.path([S.start, S.s1, S.s2, S.s3, LANES.SUS, S.s7, "(Completed)"]);
      J.check("case Completed", end?._status === "Completed", end?._status);
    },
  },
  a: {
    title: "CIQ Case happy path: REG + SAF + RMM lanes (simultaneous submits), overall approval on (S6 runs), S7 and S8 run, End",
    needs: () => caseNeeds(["REG", "SAF", "RMM"], true),
    run: async (J) => {
      const fl = F(CASE);
      const h = await startProcess(J, fl, caseStart("A", true), T("A"));
      if (!h) return;
      SHARED.case = { id: h.id, code: T("A") };
      const end = await drive(J, fl, h, casePlan("A", { depts: ["REG", "SAF", "RMM"], s7Open: 1 }));
      J.path([S.start, S.s1, S.s2, S.s3, lanesStep(["REG", "SAF", "RMM"]), S.s5, S.s6, S.s7, S.s8, "(Completed)"]);
      J.check("case Completed with Overall_Decision Approved and Completion_Trigger 'Supplier final release'", end?._status === "Completed" && end?.Overall_Decision === "Approved" && end?.Completion_Trigger === "Supplier final release", `${end?._status} · ${end?.Overall_Decision} · ${end?.Completion_Trigger}`);
      J.check("lane gates kept: REG_Gate, SAF_Gate, RMM_Gate = OK at End", ["REG", "SAF", "RMM"].every((d) => end?.[`${d}_Gate`] === "OK"), ["REG", "SAF", "RMM"].map((d) => `${d}=${end?.[`${d}_Gate`]}`).join(" "));
    },
  },
  b: {
    title: "CIQ Case with one department (QM), no overall approval: S6 skipped",
    needs: () => caseNeeds(["QM"], false),
    run: async (J) => {
      const fl = F(CASE);
      const h = await startProcess(J, fl, caseStart("B", false), T("B"));
      if (!h) return;
      const end = await drive(J, fl, h, casePlan("B", { depts: ["QM"] }));
      J.path([S.start, S.s1, S.s2, S.s3, LANES.QM, S.s5, S.s7, "(Completed)"]);
      J.check("case Completed, Overall_Decision blank", end?._status === "Completed" && isBlank(end?.Overall_Decision), `${end?._status} · ${JSON.stringify(end?.Overall_Decision)}`);
    },
  },
  c: {
    title: "CIQ Case with Overall_Decision = Rejected: S7 (and S8) skipped, the case still reaches End",
    needs: () => caseNeeds(["SAF"], true),
    run: async (J) => {
      const fl = F(CASE);
      const h = await startProcess(J, fl, caseStart("C", true), T("C"));
      if (!h) return;
      const end = await drive(J, fl, h, casePlan("C", { depts: ["SAF"], overallDecision: "Rejected" }));
      J.path([S.start, S.s1, S.s2, S.s3, LANES.SAF, S.s5, S.s6, "(Completed)"]);
      J.check("case Completed with Overall_Decision Rejected, SAF_RMES_Decision Rejected, Completion_Trigger 'Overall rejection'", end?._status === "Completed" && end?.Overall_Decision === "Rejected" && end?.SAF_RMES_Decision === "Rejected" && end?.Completion_Trigger === "Overall rejection", `${end?._status} · ${end?.Overall_Decision} · ${end?.SAF_RMES_Decision} · ${end?.Completion_Trigger}`);
    },
  },
  e: {
    title: "CIQ Open Point: To_Supplier Yes (REG) vs No (SAF, QM, MIC, SUS, RMM); routing to all 6 review steps; Rounds child rows at Start and via the admin route; OP_Outcome Accepted",
    needs: () => ["CIQ RMM", ...Object.values(DEPT_ROLE)],
    run: async (J) => {
      const fl = F(OP);
      for (const d of ["REG", "SAF", "QM", "MIC", "SUS", "RMM"]) {
        const toSupplier = d === "REG";
        const key = `${T("E")}-${d}`;
        console.log(` · point ${d} (to supplier: ${toSupplier ? "Yes" : "No"})`);
        const pathStart = J.rec.path.length;
        const start = {
          OP_Key: key, Round_No: 1, Case_Item_Id: SHARED.case?.id ?? `${T("E")}-CASE`, Case_Code: SHARED.case?.code ?? T("E"), Cycle_No: 1, Supplier_Code: `ZZT-SUP-${RUN}`,
          OP_Kind: toSupplier ? "Query" : "Department review", OP_Dept: d, Raised_By_Dept: d, OP_To_Supplier: toSupplier ? "Yes" : "No",
          Internal_Due_Date: dateIn(30), Internal_Justification: "ZZT fictional internal reason", Question_Text: "ZZT: please provide the fictional CoA.", Ref_Kind: "Section", Ref_Label: "ZZT K2.1 Composition",
          ...(toSupplier ? { Query_Key: `${key}|R1`, Ref_Section_Key: "K2.1", Kind_Label: "Query", Supplier_Justification: "ZZT: needed for the fictional review", Supplier_Due_Date: dateIn(20), Responsible_Name: "ZZT Resp Tester", Responsible_Dept_Label: d, Portal_Contact_Ids: "ZZT-PU-01", Awaiting_Response: "Yes" } : {}),
        };
        let rowId = null;
        const h = await startProcess(J, fl, start, key, {
          atStart: async (s, hh, read) => {
            J.check(`${d}: read at Start (draft): Start_Gate = OK and Open_Num = 1`, s.Start_Gate === "OK" && Number(s.Open_Num) === 1, `Start_Gate=${JSON.stringify(s.Start_Gate)} Open_Num=${JSON.stringify(s.Open_Num)}`, "probe");
            if (d !== "REG") return;
            rowId = `Rounds_${rnd10()}`;
            const row = { _id: rowId, _index: 0, _is_created: true, Rounds_Round_No: 1, Rounds_Question_Text: "ZZT: please provide the fictional CoA.", Rounds_Response_Kind: "Answer" };
            const { body, problems } = prepare(J, fl, "Raise open point", { "Table::Rounds": [row] });
            if (problems.length) { J.check("Rounds row at Start: inputs valid", false, problems.join("; ")); return; }
            const w = await call("POST", `/process/2/${A}/${fl.liveId}/${hh.id}/${hh.act}?${Q}`, { _id: hh.id, ...body });
            const back = await read();
            J.check("Rounds child row written at Start through the assignee route (Rounds is ReadOnly at Start in the plan)", w.status < 300 && (tableOf(back, "Rounds") || []).some((r) => r._id === rowId), `status ${w.status} ${msg(w)} · rows ${JSON.stringify((tableOf(back, "Rounds") || []).map((r) => r._id))}`, "probe");
          },
        });
        if (!h) continue;
        J.check(`${d}: after Start, Start_Gate = OK and Open_Num = 1 (formulas computed server-side)`, h.state.Start_Gate === "OK" && Number(h.state.Open_Num) === 1, `Start_Gate=${JSON.stringify(h.state.Start_Gate)} Open_Num=${JSON.stringify(h.state.Open_Num)}`);
        const review = LANES[d];
        const plan = {
          "Waiting for supplier": { set: { Response_Kind: "Answer", Response_Text: "ZZT fictional answer", Awaiting_Response: "No" } },
          [review]: {
            set: () => ({ OP_Outcome: "Accepted", Reviewed_By_Email: "rev.tester@example.invalid", Reviewed_At: stamp(), Outcome_Reason: "ZZT accepted" }),
            check: async (s, JJ) => {
              JJ.check(`${d}: Open_Num = 0 once OP_Outcome = Accepted`, Number(s.Open_Num) === 0, `Open_Num=${JSON.stringify(s.Open_Num)}`);
              if (d !== "REG") return;
              const rows = rowId && (tableOf(s, "Rounds") || []).some((r) => r._id === rowId)
                ? [{ _id: rowId, Rounds_Response_Text: "ZZT fictional answer", Rounds_Outcome: "Accepted", Rounds_Reviewed_At: stamp() }]
                : [{ _id: `Rounds_${rnd10()}`, _index: 0, _is_created: true, Rounds_Round_No: 1, Rounds_Question_Text: "ZZT: please provide the fictional CoA.", Rounds_Outcome: "Accepted" }];
              const { body, problems } = prepare(JJ, fl, review, { "Table::Rounds": rows });
              if (problems.length) { JJ.check("Rounds row at review: inputs valid", false, problems.join("; ")); return; }
              const w = await call("PUT", `/process/2/${A}/admin/${fl.liveId}/${h.id}?${Q}`, body);
              const back = await adminGet(fl, h.id);
              const got = (tableOf(back, "Rounds") || []).find((r) => r._id === rows[0]._id);
              JJ.check(`Rounds child row ${rows[0]._is_created ? "added" : "modified"} through the admin route at "${review}"`, w.status < 300 && got?.Rounds_Outcome === "Accepted", `status ${w.status} ${msg(w)} · row ${short(got ?? "missing", 160)}${tableOf(back, "Rounds") === null ? " · admin GET returned no Rounds table" : ""}`, "probe");
            },
          },
        };
        const end = await drive(J, fl, h, plan);
        const got = J.rec.path.slice(pathStart);
        const want = toSupplier ? ["Raise open point", "Waiting for supplier", review, "(Completed)"] : ["Raise open point", review, "(Completed)"];
        J.check(`${d}: step path ${want.join(" → ")}`, JSON.stringify(got) === JSON.stringify(want), `got ${got.join(" → ")}`);
        J.check(`${d}: point Completed with OP_Outcome Accepted`, end?._status === "Completed" && end?.OP_Outcome === "Accepted", `${end?._status} · ${end?.OP_Outcome}`);
      }
      J.rec.expectedPath = ["per point: Raise open point → [Waiting for supplier, REG only] → Review – <D> → (Completed)"];
    },
  },
  f: {
    title: "CIQ Change Request: create at CHRQ_S0, triage, Impact flags fan out to all 5 Assess branches (simultaneous), join, End; plus a refused request (all branches skipped)",
    needs: () => ["CIQ Integration Service", "CIQ RMM", ...Object.keys(ASSESS).map((d) => DEPT_ROLE[d])],
    run: async (J) => {
      const fl = F(CR);
      for (const [n, refused] of [["1", false], ["2", true]]) {
        const key = `${T("F")}-${n}`;
        console.log(` · change request ${n} (${refused ? "refused, no impact" : "accepted, all five impacts"})`);
        const pathStart = J.rec.path.length;
        const h = await startProcess(J, fl, { CR_Key: key, Case_Code: SHARED.case?.code ?? T("F"), Cycle_No: 1, Supplier_Code: `ZZT-SUP-${RUN}`, Change_Kind: "Change notice", Section_Key: "BASIC", Field_Key: "target_markets", Current_Value_Text: "DE", Proposed_Value_JSON: JSON.stringify(["DE", "FR"]), Change_Reason: "ZZT fictional market add", Portal_CR_Item_Id: `${key}-PCR` }, key);
        if (!h) continue;
        const impacts = Object.fromEntries(Object.keys(ASSESS).map((d) => [`Impact_${d}`, refused ? "No" : "Yes"]));
        const plan = {
          Triage: {
            set: { Case_Code: SHARED.case?.code ?? T("F"), Cycle_No: 1, Supplier_Code: `ZZT-SUP-${RUN}`, Case_Item_Id: SHARED.case?.id ?? `${T("F")}-CASE`, Contact_Verified: "Yes", CR_Outcome: refused ? "Refused – not valid" : "Accepted", ...impacts, Notice_Key: `${key}-NOT`, Notice_Kind: "Change request outcome", Notice_Title: "ZZT change request outcome", Supplier_Outcome_Text: "ZZT: your change request has been processed.", Portal_Contact_Ids: "ZZT-PU-01", Triage_Note: "ZZT acceptance" },
            check: (s, JJ) => JJ.check(`CR ${n}: CR_Open_Num = ${refused ? 0 : 5} after triage`, Number(s.CR_Open_Num) === (refused ? 0 : 5), `CR_Open_Num=${JSON.stringify(s.CR_Open_Num)}`),
          },
        };
        for (const [d, step] of Object.entries(ASSESS)) plan[step] = { set: () => ({ [`${d}_Assessment`]: "No impact confirmed", [`${d}_Assessed_At`]: stamp(), [`${d}_Assess_Note`]: "ZZT acceptance" }) };
        const end = await drive(J, fl, h, plan);
        const got = J.rec.path.slice(pathStart);
        const want = refused ? ["Receive change request", "Triage", "(Completed)"] : ["Receive change request", "Triage", Object.values(ASSESS).sort().join(" | "), "(Completed)"];
        J.check(`CR ${n}: step path ${want.join(" → ")}`, JSON.stringify(got.map((x) => x.split(" | ").sort().join(" | "))) === JSON.stringify(want), `got ${got.join(" → ")}`);
        J.check(`CR ${n}: Completed with CR_Open_Num = 0`, end?._status === "Completed" && Number(end?.CR_Open_Num) === 0, `${end?._status} · CR_Open_Num=${JSON.stringify(end?.CR_Open_Num)}`);
      }
      J.rec.expectedPath = ["CR 1: Receive change request → Triage → [5 Assess branches] → (Completed)", "CR 2: Receive change request → Triage → (Completed)"];
    },
  },
  g: {
    title: "Every Form: one item each (serially), child-table add/modify where present, read back, formula columns computed",
    needs: () => [...new Set(FORMS.map((x) => x.writer))],
    run: async (J) => {
      for (const spec of FORMS) {
        const fl = F(spec.flow);
        console.log(` · ${spec.flow}`);
        const header = spec.header();
        const children = spec.rows ? spec.rows() : {};
        const { body, problems } = prepare(J, fl, null, { ...header, ...Object.fromEntries(Object.entries(children).map(([cid, rs]) => [`Table::${cid}`, rs])) });
        if (problems.length) { J.check(`${spec.flow}: inputs valid`, false, problems.join("; ")); continue; }
        const req = Object.entries(fl.desc.fields).filter(([, x]) => x.model === fl.id && x.required).map(([k]) => k).filter((k) => isBlank(header[k]));
        if (req.length) { J.check(`${spec.flow}: Required fields filled`, false, req.join(", ")); continue; }
        const d = await call("POST", `/form/2/${A}/${fl.liveId}?${Q}`, body); // opens Thomas's single draft (draft_<userId>)
        if (d.status >= 300 || !d.body?._id) { J.check(`${spec.flow}: create (draft)`, false, `${d.status} ${msg(d)}`); continue; }
        const stale = Object.keys(fl.desc.fields).filter((k) => fl.desc.fields[k].model === fl.id && !fl.desc.fields[k].formula && !(k in body) && !isBlank(d.body[k]));
        if (stale.length) J.note(`${spec.flow}: the draft already held values for ${stale.join(", ")} (an earlier unfinished draft?)`);
        const sub = await call("POST", `/form/2/${A}/${fl.liveId}/${d.body._id}/submit?${Q}`, {});
        if (sub.status >= 300 || !sub.body?._id) { J.check(`${spec.flow}: submit draft ${d.body._id}`, false, `${sub.status} ${msg(sub)}`); continue; }
        const id = sub.body._id;
        const it = J.item(spec.flow, id, header[spec.labelField]);
        const read = async () => (await call("GET", `/form/2/${A}/${fl.liveId}/${id}?${Q}`)).body || {};
        let s = await read();
        const lost = Object.entries(body).filter(([k]) => !k.startsWith("Table::")).filter(([k, v]) => !sameValue(s[k], v)).map(([k]) => k);
        J.check(`${spec.flow}: header read back after create`, !lost.length, lost.length ? `differs: ${lost.join(", ")}` : `${Object.keys(header).length} fields`);
        for (const [cid, rs] of Object.entries(children)) {
          const got = tableOf(s, cid) || [];
          J.check(`${spec.flow}: ${rs.length} ${cid} row(s) stored at create`, rs.every((r) => got.some((g) => g._id === r._id)), `${got.length} row(s) read`);
        }
        if (spec.formulasAfterCreate) spec.formulasAfterCreate(s, J);
        // update: header change + modify one row, then (second write) add one row; each read back (serial, D32)
        if (spec.update) {
          const u = spec.update(s);
          const { body: ub, problems: up } = prepare(J, fl, null, u);
          if (up.length) { J.check(`${spec.flow}: update inputs valid`, false, up.join("; ")); continue; }
          const w1 = await call("POST", `/form/2/${A}/${fl.liveId}/${id}?${Q}`, { _id: id, ...ub });
          s = await read();
          const lost1 = Object.entries(ub).filter(([k]) => !k.startsWith("Table::")).filter(([k, v]) => !sameValue(s[k], v)).map(([k]) => k);
          const rowsOk = Object.entries(ub).filter(([k]) => k.startsWith("Table::")).every(([k, rs]) => rs.every((r) => { const g = (tableOf(s, k.slice(7)) || []).find((x) => x._id === r._id); return g && Object.entries(r).filter(([c]) => !c.startsWith("_")).every(([c, v]) => sameValue(g[c], v)); }));
          J.check(`${spec.flow}: header + child-row modify read back`, w1.status < 300 && !lost1.length && rowsOk, `status ${w1.status} ${msg(w1)}${lost1.length ? " · lost " + lost1.join(",") : ""}${rowsOk ? "" : " · row change not kept"}`);
        }
        if (spec.addRows) {
          const add = spec.addRows();
          const { body: ab, problems: ap } = prepare(J, fl, null, add);
          if (ap.length) { J.check(`${spec.flow}: added-row inputs valid`, false, ap.join("; ")); continue; }
          const w2 = await call("POST", `/form/2/${A}/${fl.liveId}/${id}?${Q}`, { _id: id, ...ab });
          s = await read();
          const ok = Object.entries(ab).every(([k, rs]) => rs.every((r) => (tableOf(s, k.slice(7)) || []).some((x) => x._id === r._id)));
          J.check(`${spec.flow}: child row added on the submitted item`, w2.status < 300 && ok, `status ${w2.status} ${msg(w2)} · rows now ${Object.keys(ab).map((k) => `${k.slice(7)}=${(tableOf(s, k.slice(7)) || []).length}`).join(" ")}`);
        }
        if (spec.formulasAfterUpdate) spec.formulasAfterUpdate(s, J);
        it.status = "submitted";
      }
      J.rec.expectedPath = ["(forms have no steps)"];
    },
  },
  h: {
    title: "Reject a case at an RMM step (with Comment) and withdraw another; record statuses",
    needs: () => ["CIQ RMM"],
    run: async (J) => {
      const fl = F(CASE);
      for (const [n, action] of [["H1", "reject"], ["H2", "withdraw"]]) {
        console.log(` · ${action}`);
        const pathStart = J.rec.path.length;
        const h = await startProcess(J, fl, caseStart(n, false), T(n));
        if (!h) continue;
        await drive(J, fl, h, {
          [S.s1]: {
            stop: async (s, t) => {
              const comment = `ZZT acceptance: ${action} test at "${t.step}"`;
              const r = action === "reject"
                ? await call("POST", `/process/2/${A}/${fl.liveId}/${h.id}/${t.act}/reject?${Q}`, { Comment: comment })
                : await call("POST", `/process/2/${A}/${fl.liveId}/${h.id}/withdraw?${Q}`, { Comment: comment });
              J.check(`${action} accepted at "${t.step}" (an RMM step)`, r.status < 300, `${r.status} ${msg(r)}`);
              for (let i = 0; i < 10; i++) { await sleep(1300); const x = await adminGet(fl, h.id); if (x._status !== "InProgress") return x; }
              return adminGet(fl, h.id);
            },
          },
        });
        const want = action === "reject" ? "Rejected" : "Withdrawn";
        const got = J.rec.path.slice(pathStart);
        J.check(`${n}: path Create case → ${S.s1} → (${want})`, JSON.stringify(got) === JSON.stringify([S.start, S.s1, `(${want})`]), `got ${got.join(" → ")}`);
        const fin = await adminGet(fl, h.id);
        J.check(`${n}: status ${want} and no open task`, fin._status === want && !openTasks(fin).length, `status ${fin._status} · open ${openTasks(fin).length}`);
      }
      J.rec.expectedPath = [`${S.start} → ${S.s1} → (Rejected)`, `${S.start} → ${S.s1} → (Withdrawn)`];
    },
  },
};

// Form journey data (g). writer = a role that holds Editable on the form in the plan (checked below before running).
const row = (cid, i, fields) => ({ _id: `${cid}_${rnd10()}`, _index: i, _is_created: true, ...fields });
const criteriaRows = (cid, p) => [
  row(cid, 0, { Criteria_Code: `${p}-1`, Criteria_Part: "A", Criteria_Title: "ZZT criterion not applicable", Criteria_Applicable: "No" }),
  row(cid, 1, { Criteria_Code: `${p}-2`, Criteria_Part: "A", Criteria_Title: "ZZT criterion without result", Criteria_Applicable: "Yes" }),
  row(cid, 2, { Criteria_Code: `${p}-3`, Criteria_Part: "B", Criteria_Title: "ZZT criterion available", Criteria_Applicable: "Yes", Criteria_Result: "Available", Criteria_Recorded_At: stamp() }),
  row(cid, 3, { Criteria_Code: `${p}-4`, Criteria_Part: "C", Criteria_Title: "ZZT criterion not available", Criteria_Applicable: "Yes", Criteria_Result: "Not available" }),
];
const rmesForm = (flow, writer, cid, fid, p) => {
  let rowsMade = null;
  return {
    flow, writer, labelField: "RMES_Key",
    header: () => ({ RMES_Key: `${T("G")}-${p}`, ...(SHARED.case ? { Result_Case: { _id: SHARED.case.id } } : {}), Case_Item_Id: SHARED.case?.id ?? `${T("G")}-CASE`, Case_Code: SHARED.case?.code ?? T("G"), Cycle_No: 1, Open_Criteria_Count: 2, Open_Blocking_Findings_Count: 0, RMES_Voided: "No" }),
    rows: () => (rowsMade = { [cid]: criteriaRows(cid, `ZZT-${p}`), [fid]: [row(fid, 0, { Findings_Text: "ZZT fictional finding", Findings_Criterion_Code: `ZZT-${p}-4`, Findings_Blocking: "No", Findings_State: "Open" })] }),
    formulasAfterCreate: (s, J) => { const got = rowsMade[cid].map((r) => (tableOf(s, cid) || []).find((x) => x._id === r._id)?.Criteria_Open_Num); J.check(`${flow}: Criteria_Open_Num computed per row = [0,1,0,1]`, JSON.stringify(got.map((v) => (isBlank(v) ? null : Number(v)))) === "[0,1,0,1]", JSON.stringify(got)); },
    update: () => ({ Open_Criteria_Count: 1, [`Table::${cid}`]: [{ _id: rowsMade[cid][3]._id, Criteria_Comment: "ZZT: explained" }] }),
    addRows: () => ({ [`Table::${fid}`]: [row(fid, 1, { Findings_Text: "ZZT second fictional finding", Findings_Blocking: "No", Findings_State: "Open" })] }),
    formulasAfterUpdate: (s, J) => { const r4 = (tableOf(s, cid) || []).find((x) => x._id === rowsMade[cid][3]._id); J.check(`${flow}: Criteria_Open_Num recomputed to 0 once the comment is set`, Number(r4?.Criteria_Open_Num) === 0 && !isBlank(r4?.Criteria_Open_Num), JSON.stringify(r4?.Criteria_Open_Num)); },
  };
};
const FORMS = [
  (() => { let r; return {
    flow: "CIQ Supplier", writer: "CIQ RMM", labelField: "Supplier_Code",
    header: () => ({ Supplier_Code: `ZZT-SUP-${RUN}`, Supplier_Legal_Name: "ZZT Fictional Oleo GmbH", DUNS_Number: "ZZT-000000000", Supplier_Kind: "Manufacturer", Supplier_Country_Code: "DE", Supplier_Active: "Yes", Supplier_Test: "Yes", Contact_Portal_Ids_Text: "ZZT-PU-01", Pending_Invites: 0 }),
    rows: () => (r = { Contacts: [row("Contacts", 0, { Contacts_Full_Name: "ZZT Sam Supplier", Contacts_Email: "sam.supplier@example.invalid", Contacts_Role: "Quality", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: "ZZT-PU-01", Contacts_Active: "Yes", Contacts_Invite_Requested_At: stamp() })] }),
    update: () => ({ Pending_Invites: 1, "Table::Contacts": [{ _id: r.Contacts[0]._id, Contacts_Role: "Coordinator" }] }),
    addRows: () => ({ "Table::Contacts": [row("Contacts", 1, { Contacts_Full_Name: "ZZT Kim Contact", Contacts_Email: "kim.contact@example.invalid", Contacts_Role: "Regulatory", Contacts_Can_Confirm: "No", Contacts_Active: "Yes" })] }),
  }; })(),
  { flow: "CIQ Config Version", writer: "CIQ Business Admin", labelField: "Config_Key",
    header: () => ({ Config_Key: `${T("G")}-CFG`, Config_Kind: "Settings", Version_Label: "ZZT v0", Config_State: "Draft", Payload_JSON: "{}", Change_Note: "ZZT acceptance test", Release_Stage: "Test" }),
    update: () => ({ Change_Note: "ZZT acceptance test (updated)" }) },
  (() => { let r; return {
    flow: "CIQ Section", writer: "CIQ RMM", labelField: "Section_Item_Key",
    header: () => ({ Section_Item_Key: `${T("G")}-SEC`, Case_Code: SHARED.case?.code ?? T("G"), Cycle_No: 1, Supplier_Code: `ZZT-SUP-${RUN}`, Section_Key: "K2.1", Section_Code: "K2.1", Section_Title: "ZZT Composition", Section_Sort: 1, Section_Origin: "ZZT acceptance", Definition_JSON: "{}", Definition_Hash: "ZZT-hash", Portal_Contact_Ids: "ZZT-PU-01", Case_Item_Id: SHARED.case?.id ?? `${T("G")}-CASE`, Lead_Dept: "REG", Query_Owner_Dept: "REG" }),
    rows: () => (r = { Components: [row("Components", 0, { Components_Row_Id: "ZZT-R1", Components_INCI: "ZZT Aqua", Components_Function: "Solvent", Components_Is_Additive: "No", Components_Conc_Min: 60, Components_Conc_Max: 70 })] }),
    update: () => ({ Section_Title: "ZZT Composition (updated)", "Table::Components": [{ _id: r.Components[0]._id, Components_Conc_Max: 75 }] }),
    addRows: () => ({ "Table::Components": [row("Components", 1, { Components_Row_Id: "ZZT-R2", Components_INCI: "ZZT Glycerin", Components_Is_Additive: "No", Components_Conc_Min: 5, Components_Conc_Max: 10 })] }),
  }; })(),
  { flow: "CIQ Scope Run", writer: "CIQ RMM", labelField: "Run_Key",
    header: () => ({ Run_Key: `${T("G")}-RUN`, Case_Code: SHARED.case?.code ?? T("G"), Cycle_No: 1, Case_Item_Id: SHARED.case?.id ?? `${T("G")}-CASE`, Run_No: 1, Scope_Trigger: "ZZT acceptance", Rule_Set_Version: "ZZT-RS-1", Input_JSON: "{}", Result_JSON: "{}", Lead_Departments: "REG,SAF", Run_At: stamp() }),
    update: () => ({ Override_Justification: "ZZT: none" }) },
  rmesForm("CIQ RMES Safety", "CIQ Safety Reviewer", "Safety_Criteria", "Safety_Findings", "SAF"),
  rmesForm("CIQ RMES Regulatory", "CIQ Regulatory Reviewer", "Regulatory_Criteria", "Regulatory_Findings", "REG"),
  { flow: "CIQ Internal Note", writer: "CIQ RMM", labelField: "Note_Key",
    header: () => ({ Note_Key: `${T("G")}-NOTE`, Case_Code: SHARED.case?.code ?? T("G"), Cycle_No: 1, Case_Item_Id: SHARED.case?.id ?? `${T("G")}-CASE`, Linked_Kind: "CIQ Case", Linked_Key: SHARED.case?.code ?? T("G"), Note_Text: "ZZT fictional internal note", Note_Dept: "RMM", Note_At: stamp() }),
    update: () => ({ Note_Text: "ZZT fictional internal note (edited)" }) },
  { flow: "CIQ Audit Event", writer: "CIQ RMM", labelField: "Event_Key",
    header: () => ({ Event_Key: `${T("G")}-EVT`, Case_Code: SHARED.case?.code ?? T("G"), Cycle_No: 1, Case_Item_Id: SHARED.case?.id ?? `${T("G")}-CASE`, Event_At: stamp(), Event_Category: "Case", Action_Code: "ZZT acceptance", Actor_Side: "System", Actor_Name: "ZZT acceptance script", Object_Kind: "CIQ Case", Object_Key: SHARED.case?.code ?? T("G"), Object_State: "ZZT" }) },
];

// ------------------------------------------------------------------------------------------------------------------
// 5. pre-flight on the definitions (network-free): roles of each journey, writer roles of each form
// ------------------------------------------------------------------------------------------------------------------
for (const spec of FORMS) {
  const fl = exp.flows.find((f) => f.name === spec.flow);
  const slug = exp.roles.find((r) => r.name === spec.writer)?.slug;
  const g = exp.flowGrants.find((x) => x.model === fl?.id && x.roleSlug === slug);
  if (!fl || g?.level !== "Editable") { console.error(`definition error: ${spec.writer} has no Editable grant on ${spec.flow} in the plan`); process.exit(2); }
}
for (const k of ["a", "b", "c", "d", "h"]) for (const st of Object.values(S).slice(1)) if (!stepOwners(exp.flows.find((f) => f.name === CASE), st).length) { console.error(`definition error: no owner for "${st}"`); process.exit(2); }

// ------------------------------------------------------------------------------------------------------------------
// 6. run
// ------------------------------------------------------------------------------------------------------------------
const t0 = Date.now();
for (const key of ORDER.filter((k) => SELECTED.includes(k))) {
  const def = JOURNEYS[key];
  const J = new Journey(key, def.title);
  const needs = [...new Set(def.needs())];
  const missing = needs.filter((r) => !thomasIn(r));
  console.log(`\n== journey ${key}: ${def.title}\n   roles needed: ${needs.join(", ")}`);
  if (missing.length) {
    console.log(`   REFUSED: Thomas (${THOMAS._id}) is not a member of ${missing.join(", ")}`);
    RESULT.refused.push({ journey: key, missingRoles: missing });
    J.check("Thomas is a member of every role this journey needs", false, `missing: ${missing.join(", ")} (journey not run, nothing written)`);
    RESULT.journeys.push(J.finish());
    flush();
    continue;
  }
  try { await def.run(J); } catch (e) { J.check("journey ran without an exception", false, String(e?.stack || e).slice(0, 400)); }
  RESULT.journeys.push(J.finish());
  flush();
  console.log(`   → journey ${key}: ${J.rec.ok ? "OK" : "NOT OK"} (${J.rec.checks.filter((c) => c.ok).length}/${J.rec.checks.length} checks)`);
}

// ------------------------------------------------------------------------------------------------------------------
// 7. summary
// ------------------------------------------------------------------------------------------------------------------
RESULT.seconds = Math.round((Date.now() - t0) / 1000);
RESULT.ok = RESULT.journeys.length > 0 && RESULT.journeys.every((j) => j.ok);
flush();
console.log(`\n== SUMMARY ${DRY ? "(dry run against the offline simulator: proves the script and the journey definitions, not Kissflow)" : ""}`);
console.log("journey | ok  | checks (fail/total) | items | path");
for (const j of RESULT.journeys) console.log(`${j.journey.padEnd(7)} | ${j.ok ? "yes" : "NO "} | ${String(j.checks.filter((c) => !c.ok).length).padStart(4)}/${String(j.checks.length).padEnd(14)} | ${String(j.items.length).padStart(5)} | ${short(j.path.join(" → "), 150)}`);
for (const j of RESULT.journeys) for (const c of j.checks.filter((x) => !x.ok)) console.log(`  ${j.journey}: ${c.severity === "probe" ? "PROBE " : ""}FAIL ${c.id} · ${short(c.detail, 220)}`);
for (const j of RESULT.journeys) for (const n of j.notes) console.log(`  ${j.journey}: note · ${short(n, 220)}`);
console.log(`\nITEMS CREATED (${RESULT.items.length}; delete them from the front end, the scripts never delete):`);
for (const it of RESULT.items) console.log(`  ${it.journey} · ${it.flow} · ${it.id} · ${it.label} · ${it.status}`);
console.log(`\n${RESULT.ok ? "ACCEPTANCE OK" : "ACCEPTANCE NOT OK"} · ${RESULT.seconds} s → ${RESULT_FILE}`);
process.exitCode = RESULT.ok ? 0 : 1;
