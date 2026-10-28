// Scenarios and expected checks (WORKBENCH-DESIGN.md §11.4) for scripts/harness-workbench.mjs. Written against the
// §8 test ids. A scenario whose screen is still T0's stub reports PENDING (t.requireScreen), never FAIL (§12.1 T4).
// M scenarios also run with kwb=refuse (the matrix run, §11.2): in that variant every save at a step after Start goes
// through the K-WB fallback (panel → Open task form → nativeSave → Re-read) via kwbSave().
//
// Test ids used here that §8 does not list (proposed to T1–T3 in CHANGE-REQUESTS.md, T4-harness):
//   wb-step-save (the "Save" of a step panel), wb-lane-save (lane "Save sign-off"), wb-field-<FieldId> (T0 FieldInput).

import { existsSync, readFileSync } from "node:fs";
import { buildSchema, readSpec, READBACK } from "./gen-workbench-schema.mjs";

export class Pending extends Error {}

// Server activity ids the build and the emulated host share: the read-back ids when merged (§4.4, the same merge as
// generated.ts), else the host's fake Activity_<irstep>. With read-back ids the Workbench lists My Tasks per owned
// step with the activity filter (§6.3 rung 1), so the getProgress / getItem / block rungs are never reached for task
// rows: S19, S34 and S35 then check rung 1 instead (the unit tests pin the no-read-back path, testkit/serverIds.ts).
const RB_STEPS = (() => {
  const readback = existsSync(READBACK) ? JSON.parse(readFileSync(READBACK, "utf8")) : undefined;
  return buildSchema(readSpec().spec, { readback }).STEPS;
})();
const READBACK_IDS = Object.values(RB_STEPS).some((s) => s.serverActivityId);
const S1_ACTIVITY = RB_STEPS.OPNT_S1.serverActivityId ?? "Activity_opnt_s1";

const WRITE_RE = /^(PROCESS_(CREATE|UPDATE|UPDATE_ADMIN|SUBMIT|DISCARD|REJECT|WITHDRAW|SENDBACK|DELETE)_ITEM|DATAFORM_(CREATE|UPDATE|SUBMIT|DISCARD|DELETE)_ITEM)$/;
const isWrite = (c) => !c.native && (WRITE_RE.test(c.command) || (c.command === "API" && c.method && c.method.toUpperCase() !== "GET"));
const CASE = "CIQ_Case_A00";
const OP = "CIQ_Open_Point_A00";
const CR = "CIQ_Change_Request_A00";
const F3 = "CIQ_Section_A00";
const F4 = "CIQ_Scope_Run_A00";
const F8 = "CIQ_Audit_Event_A00";
const PROCESSES = [CASE, OP, CR];
const FORMS = ["CIQ_Supplier_A00", "CIQ_Config_Version_A00", "CIQ_Section_A00", "CIQ_Scope_Run_A00", "CIQ_RMES_Safety_A00", "CIQ_RMES_Regulatory_A00", "CIQ_Internal_Note_A00", "CIQ_Audit_Event_A00"];

// ---------------------------------------------------------------- helpers
const item = (st, id) => st.items.find((i) => i.id === id);
const openSteps = (st, id) => (item(st, id)?.acts ?? []).filter((a) => a.open).map((a) => a.step).sort();
const actAt = (st, id, step) => (item(st, id)?.acts ?? []).find((a) => a.open && a.step === step)?.act;
const rows = (st, flow) => st.rows.filter((r) => r.flow === flow && !r.draft);
const noMs = (v) => typeof v !== "string" || !/T\d{2}:\d{2}:\d{2}[.,]\d/.test(v);

/** Polls the host's call record until `pred` matches (returns the matches, possibly empty after the timeout). */
async function until(t, pred, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const got = await t.calls(pred);
    if (got.length || Date.now() > end) return got;
    await t.wait(150);
  }
}
const after = (seq, cmd, extra = () => true) => (c) => c.seq > seq && c.command === cmd && extra(c);

/** Waits until the Diagnostics probes have answered ("checking…" gone), at most 15 s. */
async function diagSettled(t) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if ((await t.ui.getByText("checking…", { exact: false }).count()) === 0) return true;
    await t.wait(200);
  }
  return false;
}

/** The visible nav item ids (wb-nav-<id>). */
async function navIds(t) {
  return t.ui.locator('[data-testid^="wb-nav-"]:not([data-testid^="wb-nav-group-"])').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")).filter((x) => x !== "wb-nav"));
}

/** The hash route the framed UI shows (e.g. "#/rmm"). */
const hashOf = (t) => t.frame().evaluate(() => location.hash).catch(() => "");

/** StatCard tiles inside `testId`: { [label]: { value, hint } } from each tile's text lines (label, value, unit/hint). */
async function tiles(t, testId) {
  const texts = await t.byTestId(testId).first().evaluate((el) => [...el.children].map((c) => c.innerText)).catch(() => []);
  const out = {};
  for (const x of texts) {
    const lines = x.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) out[lines[0]] = { value: lines[1], hint: lines.slice(2).join(" ") };
  }
  return out;
}

/** Expected numbers from the host state (the cases a complete read sees): not test, not Draft. */
function caseFacts(st) {
  const cases = st.items.filter((i) => i.flow === CASE && i.status !== "Draft" && !/^yes$/i.test(String(i.fields.Case_Test ?? "")));
  const ownerId = (v) => (typeof v === "string" ? v : v?._id);
  return {
    cases,
    total: cases.length,
    open: cases.filter((i) => i.status === "InProgress").length,
    completed: cases.filter((i) => i.status === "Completed").length,
    cancelled: cases.filter((i) => i.status === "Rejected" || i.status === "Withdrawn").length,
    released: cases.filter((i) => !!i.fields.Final_Release_At).length,
    openOwnedBy: (userId) => cases.filter((i) => i.status === "InProgress" && ownerId(i.fields.Owner_RMM) === userId).length,
  };
}

/** Supplier names of the clickable prototype's seed (src/domain/seed.ts): live pages must never show them. */
const SEED_SUPPLIERS = (() => {
  const f = new URL("../src/domain/seed.ts", import.meta.url);
  const txt = existsSync(f) ? readFileSync(f, "utf8") : "";
  return [...txt.matchAll(/\{ id: "s\d+", name: "([^"]+)"/g)].map((m) => m[1]);
})();

/** The case ids of the informed rows the page shows. */
const informedIds = (t) => t.ui.locator('[data-testid^="wb-informed-open-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("wb-informed-open-", "")).sort());

/** A stored K-WB sheet ({ fields, tables }) → the payload a native-form save would write (Table:: row ops). */
function sheetToNative(sheet) {
  const data = { ...(sheet?.fields ?? {}) };
  for (const [table, ops] of Object.entries(sheet?.tables ?? {}))
    data[`Table::${table}`] = ops.map((op) => (op.kind === "add" ? { ...op.row, _is_created: true } : op.kind === "modify" ? { _id: op._id, ...op.row } : { _id: op._id, _is_deleted: true }));
  return data;
}

/**
 * The K-WB fallback after a refused (or, once the step is marked, skipped) save at a step after Start (§7.4, WB-9):
 * the panel with the values sheet and the My Tasks instruction BEFORE any click → Open task form (PROCESS_OPEN_FORM
 * with the task's _id and act) → __kfHost.nativeSave(the pending values) → Re-read passes (the stored sheet is cleared).
 * `task` = { id, act } of the task (used when no refused call carries the values).
 */
async function kwbAfter(t, before, label, task) {
  t.expectRefusals("mode:kwb");
  const refused = (await until(t, after(before, "PROCESS_UPDATE_ITEM", (c) => c.refused?.category === "mode:kwb"), 4000))[0];
  const id = refused?.instanceId ?? task?.id;
  const act = refused?.activityInstanceId ?? task?.act;
  await t.seeTestId("wb-kwb", `${label}: the K-WB fallback panel shows`);
  await t.seeTestId("wb-kwb-sheet", `${label}: the values sheet is shown before any click`);
  await t.seeTestId("wb-kwb-mytasks", `${label}: the My Tasks instruction is shown before any click`);
  if (!id || !act) {
    t.check(`${label}: the refused task is known`, false);
    return { refused: null };
  }
  if (!refused) t.check(`${label}: the step is already marked refused: no UPDATE_ITEM was sent (WB-9)`, (await t.calls(after(before, "PROCESS_UPDATE_ITEM"))).length === 0);
  const key = `wb:pending:${id}|${act}`;
  const sheetOf = () => t.frame().evaluate((k) => { try { const v = sessionStorage.getItem(k); return v === null ? null : JSON.parse(v); } catch { return undefined; } }, key);
  const sheet = await sheetOf();
  t.check(`${label}: the pending sheet is kept in sessionStorage (survives a reload)`, !!sheet);
  const s0 = await t.lastSeq();
  await t.click("wb-kwb-openform");
  const of = (await until(t, after(s0, "PROCESS_OPEN_FORM")))[0];
  t.check(`${label}: Open task form → PROCESS_OPEN_FORM with the task's _id and act`, of && of.instanceId === id && of.activityInstanceId === act, of && [of.instanceId, of.activityInstanceId]);
  await t.host$("nativeSave", id, act, refused ? refused.data : sheetToNative(sheet));
  const r0 = await t.lastSeq();
  await t.click("wb-kwb-reread");
  // A passing Re-read removes the stored sheet (§7.4); the panel's own text may be replaced by the screen's reload.
  let cleared = false;
  let txt = "";
  for (const end = Date.now() + 6000; Date.now() < end; ) {
    txt = (await t.text("wb-kwb-reread-result")) || txt;
    if ((await sheetOf()) === null) {
      cleared = true;
      break;
    }
    await t.wait(120);
  }
  t.check(`${label}: Re-read passes after the native save (the stored sheet is cleared)`, cleared && !/^Not there yet/i.test(txt), txt || "(panel resolved)");
  const rr = await t.calls((c) => c.seq > r0 && c.instanceId === id);
  t.check(`${label}: Re-read only reads (no write)`, !rr.some(isWrite), rr.map((c) => c.command));
  return { refused, sheet };
}

/** A save at a step after Start: "ok" → the UPDATE_ITEM lands; "kwb-refuse" → the K-WB fallback (kwbAfter). */
async function kwbSave(t, saveTestId, label = "save", task) {
  const before = await t.lastSeq();
  await t.click(saveTestId);
  if (t.variant === "ok") {
    const w = await until(t, after(before, "PROCESS_UPDATE_ITEM", (c) => !c.refused));
    t.check(`${label}: UPDATE_ITEM landed`, w.length > 0, w.map((c) => c.refused?.message));
    return { refused: null };
  }
  return kwbAfter(t, before, label, task);
}

/** An action that saves AND submits in one click (point decisions, approval, assessment). K-WB-aware. */
async function actAndSubmit(t, actionId, { flow, label = actionId, task, afterKwb }) {
  const before = await t.lastSeq();
  await t.click(actionId);
  if (t.variant !== "ok") {
    await kwbAfter(t, before, label, task);
    if (afterKwb) await t.click(afterKwb);
  }
  const s = (await until(t, after(before, "PROCESS_SUBMIT_ITEM", (c) => c.flowId === flow && !c.refused), 12000))[0];
  t.check(`${label}: saved and submitted (SUBMIT_ITEM accepted)`, !!s);
  return s;
}

/** Clicks a submit and waits for the SUBMIT_ITEM (returns it). */
async function submitVia(t, testId, flow = CASE) {
  const before = await t.lastSeq();
  const btn = t.byTestId(testId).first();
  let enabled = false;
  for (const end = Date.now() + 6000; Date.now() < end && !(enabled = await btn.isEnabled().catch(() => false)); ) await t.wait(150);
  if (!enabled) {
    const why = (await t.text(`${testId}-why`)) || (await t.text("wb-step-problems"));
    t.check(`${testId}: enabled`, false, why || "(disabled, no reason shown)");
    return undefined;
  }
  await t.click(testId);
  const s = (await until(t, after(before, "PROCESS_SUBMIT_ITEM", (c) => c.flowId === flow && !c.refused), 10000))[0];
  t.check(`${testId}: SUBMIT_ITEM sent and accepted`, !!s);
  return s;
}

/** The UTC `YYYY-MM-DDTHH:MM:SSZ` of a datetime-local value as the framed browser reads it (context TZ). */
async function localToIso(t, local) {
  const ms = await t.frame().evaluate((v) => new Date(v).getTime(), local);
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`;
}

async function fill(t, fieldId, value) {
  const el = t.byTestId(`wb-field-${fieldId}`).first();
  await el.fill(String(value));
}

// ---------------------------------------------------------------- scenarios
export const SCENARIOS = [
  // ======================================================== T0 (foundation)
  {
    id: "S01",
    title: "outside Kissflow (direct UI)",
    priority: "P1",
    owner: "T0",
    async run(t) {
      const t0 = Date.now();
      await t.direct("/");
      await t.see("Not running inside Kissflow", "says \"Not running inside Kissflow\"", 4000);
      t.check("says so at once (no SDK handshake wait)", Date.now() - t0 < 4000, `${Date.now() - t0} ms`);
      await t.wait(800);
      const msgs = await t.page.evaluate(() => window.__directMsgs ?? []);
      t.check("no SDK command was posted", msgs.length === 0, msgs);
      await t.notSee("demo", "no demo mode");
      await t.shot("outside");
    },
  },
  {
    id: "S02",
    title: "no answer to the first handshake (ignoreInits=1) → Couldn't connect → Try again",
    priority: "P1",
    owner: "T0",
    async run(t) {
      await t.host({ user: "dev", ignoreInits: 1 }, "/");
      await t.wait(500);
      await t.see("Connecting to Kissflow", "branded loader while connecting");
      await t.shot("loader");
      await t.seeTestId("wb-connect-failed", "\"Couldn't connect\" after the 12 s handshake bound", 16000);
      await t.see("Couldn't connect to Kissflow");
      await t.shot("failed");
      await t.click("wb-retry");
      await t.seeTestId("wb-nav", "Try again connects: the shell is live", 10000);
      const inits = await t.calls((c) => c.command === "CC_INITIALIZE");
      t.check("exactly 2 CC_INITIALIZE (the first unanswered)", inits.length === 2 && inits[0].ignored === true, inits.map((c) => ({ seq: c.seq, ignored: !!c.ignored })));
      await t.shot("live");
    },
  },
  {
    id: "S03",
    title: "user without a CIQ role (user=norole)",
    priority: "P1",
    owner: "T0",
    async run(t) {
      await t.host({ user: "norole" }, "/");
      await t.seeTestId("wb-noaccess", "the no-access page shows");
      await t.see("roles: User", "it lists the role \"User\"");
      await t.wait(1500);
      const reads = await t.calls((c) => /^(PROCESS|DATAFORM)_/.test(c.command));
      t.check("no PROCESS_* or DATAFORM_* command", reads.length === 0, reads.map((c) => c.command));
      await t.shot("noaccess");
    },
  },
  {
    id: "S04",
    title: "Diagnostics as the dev builder",
    priority: "P1",
    owner: "T0",
    async run(t) {
      await t.host({ user: "dev" }, "/diagnostics");
      await t.seeTestId("wb-diag", "Diagnostics renders");
      t.check("the probes answered within 15 s", await diagSettled(t));
      const container = await t.text("wb-diag-container");
      t.check("container CIQ_Digital_A00 ✓", container.includes("CIQ_Digital_A00") && container.includes("✓"), container);
      const build = await t.text("wb-diag-build");
      t.check("build stamp = the built stamp (dist-workbench/build-stamp.txt)", t.BUILD_STAMP ? build === t.BUILD_STAMP : !!build, { shown: build, built: t.BUILD_STAMP });
      const roles = await t.text("wb-diag-roles");
      t.check("16 role names (getRoles answered for the builder: 11 CIQ roles, the 3 new persona roles, Admin, User)", /yes · 16 roles/.test(roles), roles.slice(0, 300));
      for (const n of ["Customs & Trade Compliance", "Legal / IP", "Business owner (reports)"]) t.check(`the dev builder holds the new role "${n}" (matched by its prototype name)`, roles.includes(n));
      for (const f of [...PROCESSES, ...FORMS]) t.check(`flow probed: ${f} shown`, (await t.byTestId(`wb-diag-flow-${f}`).count()) > 0);
      const calls = await t.calls();
      for (const f of PROCESSES)
        for (const cmd of ["PROCESS_GET_MY_ITEMS", "PROCESS_GET_MY_TASKS_ITEMS", "PROCESS_GET_ADMIN_ITEMS", "PROCESS_GET_PARTICIPATED_ITEMS"])
          t.check(`${f}: ${cmd} probed`, calls.some((c) => c.command === cmd && c.flowId === f));
      for (const f of FORMS) t.check(`${f}: DATAFORM_GET_ITEMS probed`, calls.some((c) => c.command === "DATAFORM_GET_ITEMS" && c.flowId === f));
      t.check("Participated shows its (expected) error for the 3 processes", (await t.ui.getByText("error (expected for this list)", { exact: false }).count()) === 3);
      // review fix F-02/F-09: the builder page carries no internal doc or test reference
      const diagText = await t.ui.locator("body").innerText();
      t.check("Diagnostics shows no internal doc/test reference (K-14, K-WB, WB-D, SEC-HR, UI-LOG, [unverified])", !/\bK-(14|WB)\b|WB-D\d|SEC-HR\d|UI-LOG|\[unverified/.test(diagText), (diagText.match(/\bK-(14|WB)\b|WB-D\d|SEC-HR\d|UI-LOG|\[unverified[^\]]*\]/g) ?? []).slice(0, 5));
      await t.seeTestId("wb-nav-diagnostics", "the builder has the Diagnostics link");
      await t.seeTestId("wb-build", "the builder sees the build stamp");
      t.check("no write command", calls.filter(isWrite).length === 0, calls.filter(isWrite).map((c) => c.command));
      await t.shot("diagnostics");
      // "Copy diagnostics JSON": people redacted unless the checkbox is on
      const people = await t.people();
      const copied = async () => {
        await t.click("wb-diag-copy");
        const pre = t.ui.locator("pre").first();
        const ok = await pre.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
        return ok ? pre.innerText() : null;
      };
      const red = await copied();
      if (red === null) t.check("the copied JSON is shown (clipboard blocked in the frame)", false, "no <pre> after Copy");
      else {
        const leaked = people.filter((p) => red.includes(p));
        t.check("Copy diagnostics JSON holds no fixture name or e-mail (redacted by default)", leaked.length === 0, leaked);
        t.check("the redacted copy names people as <person#n>/<email#n>", /<person#\d+>|<email#\d+>/.test(red));
        await t.byTestId("wb-diag-include-people").locator('input[type="checkbox"]').check();
        const full = await copied();
        t.check("with \"include names and e-mails\" on, the copy holds the user's name", !!full && full.includes("Dev Builder"));
      }
    },
  },
  {
    id: "S05",
    title: "View as lens: builder, dev=0, non-builder answered by getRoles",
    priority: "P1",
    owner: "T0",
    async run(t) {
      // a) the dev builder, getRoles answers → switcher; lens to Safety Reviewer narrows nav and skips rung 1
      await t.host({ user: "dev", dev: 1 }, "/diagnostics");
      await t.seeTestId("wb-viewas", "dev=1: the View as switcher exists");
      await diagSettled(t);
      const allNav = await navIds(t);
      const mark = await t.lastSeq();
      await t.select("wb-viewas", "Product Safety reviewer");
      await t.seeTestId("wb-lens-badge", "the dock shows the lens badge (Viewing as Product Safety reviewer)");
      const lensNav = await navIds(t);
      t.check("lens = Product Safety reviewer: nav is My reviews, RMES sheet and All cases only (+ Diagnostics)", JSON.stringify([...lensNav].sort()) === JSON.stringify(["wb-nav-cases", "wb-nav-diagnostics", "wb-nav-review", "wb-nav-rmes"]), { before: allNav, after: lensNav });
      await t.wait(2500);
      const adm = await t.calls((c) => c.seq > mark && c.command === "PROCESS_GET_ADMIN_ITEMS");
      t.check("no PROCESS_GET_ADMIN_ITEMS while the lens is on (rung 1 skipped)", adm.length === 0, adm.map((c) => c.seq));
      await t.see("skipped: the View as lens has no flow Admin", "Diagnostics shows the admin probe skipped");
      await t.shot("lens-safety");
      // the remembered lens applies from the first read after a reload
      await t.host({ user: "dev", dev: 1 }, "/diagnostics");
      await t.seeTestId("wb-lens-badge", "the lens is remembered after a reload (sessionStorage)");
      await t.wait(2500);
      const adm2 = await t.calls((c) => c.command === "PROCESS_GET_ADMIN_ITEMS");
      t.check("after the reload: still no PROCESS_GET_ADMIN_ITEMS", adm2.length === 0, adm2.length);
      await t.select("wb-viewas", "All my roles");
      // b) dev=0: no switcher; the nav is the union
      await t.host({ user: "dev", dev: 0 }, "/diagnostics");
      await t.seeTestId("wb-nav", "dev=0: the shell is live");
      await t.wait(800);
      await t.noTestId("wb-viewas", "dev=0: no switcher");
      await t.noTestId("wb-lens-badge", "dev=0: no lens");
      // review fix F-02/UX-02: without the builder signal there is no Diagnostics link, no build stamp, and
      // #/diagnostics shows a short card and runs no probe (no Participated / admin-list probe of Diagnostics)
      await t.noTestId("wb-nav-diagnostics", "dev=0: no Diagnostics link");
      await t.noTestId("wb-build", "dev=0: no build stamp");
      await t.seeTestId("wb-diag-restricted", "dev=0: #/diagnostics says it is for Workbench administrators");
      await t.noTestId("wb-diag", "dev=0: the Diagnostics page itself is not rendered");
      t.check("dev=0: no Diagnostics probe ran (no PROCESS_GET_PARTICIPATED_ITEMS)", (await t.calls((c) => c.command === "PROCESS_GET_PARTICIPATED_ITEMS")).length === 0);
      for (const g of ["rmm", "reg", "cus", "approver", "admin", "auditor"]) t.check(`dev=0: nav group ${g} (union of all roles, by persona)`, (await t.byTestId(`wb-nav-group-${g}`).count()) === 1);
      await t.shot("dev0-union");
      // c) jo (non-builder) answered by getRoles: only her own role is offered; nothing changes
      await t.host({ user: "jo", dev: 1 }, "/diagnostics");
      await t.seeTestId("wb-viewas", "jo + dev=1: the switcher exists (a Development account answers anyone)");
      await diagSettled(t);
      const opts = await t.options("wb-viewas");
      t.check("jo: the switcher offers only \"Product Safety reviewer\"", JSON.stringify(opts) === JSON.stringify(["All my roles", "Product Safety reviewer"]), opts);
      const navBefore = await navIds(t);
      const tasksTable = () => t.ui.getByRole("table").filter({ hasText: "Held tasks (evidence)" }).first().innerText().catch(() => "");
      const tasksBefore = await tasksTable();
      const m2 = await t.lastSeq();
      await t.select("wb-viewas", "Product Safety reviewer");
      await t.wait(2500);
      t.check("jo: nav unchanged under the lens", JSON.stringify(await navIds(t)) === JSON.stringify(navBefore));
      t.check("jo: held tasks unchanged under the lens", (await tasksTable()) === tasksBefore);
      const adm3 = await t.calls((c) => c.seq > m2 && c.command === "PROCESS_GET_ADMIN_ITEMS");
      t.check("jo: rung unchanged (no admin list either way: refused before, skipped now)", adm3.length === 0);
      const before = await t.calls((c) => c.seq <= m2 && c.command === "PROCESS_GET_ADMIN_ITEMS");
      t.check("jo without the lens: the admin probe was refused (not a flow Admin)", before.every((c) => c.refused?.category === "admin-denied"));
      await t.shot("jo-lens");
      await t.select("wb-viewas", "All my roles");
    },
  },
  {
    id: "S33",
    title: "envelopes and paging (items / Data, extra=120, sparse rows, multiAct)",
    priority: "P1",
    owner: "T0",
    async run(t) {
      for (const envelope of ["items", "Data", "live"]) {
        await t.host({ user: "dev", envelope, extra: 120, rows: "sparse", multiAct: 1 }, "/diagnostics");
        await t.seeTestId("wb-diag", `${envelope}: Diagnostics renders with sparse rows (no crash)`);
        await diagSettled(t);
        const pages = [...new Set((await until(t, (c) => c.command === "PROCESS_GET_MY_TASKS_ITEMS" && c.flowId === CASE && c.pageNumber === 3, 10000)).length ? (await t.calls((c) => c.command === "PROCESS_GET_MY_TASKS_ITEMS" && c.flowId === CASE)).map((c) => c.pageNumber) : [])].sort();
        t.check(`${envelope}: the case task list was read past 50 and past 100 (pages 1, 2, 3)`, [1, 2, 3].every((p) => pages.includes(p)), pages);
        const st = await t.state();
        const fx = await t.fixtures();
        const code = item(st, fx.C4).fields.Case_Code;
        const table = t.ui.getByRole("table").filter({ hasText: "Held tasks (evidence)" }).first();
        await t.wait(1500);
        for (const s of ["CASE_B_REG", "CASE_B_SAF", "CASE_B_QM"]) {
          const row = await table.locator("tr", { hasText: s }).first().innerText().catch(() => "");
          const n = row.split(code).length - 1;
          t.check(`${envelope}: C4's ${s} task appears once (distinct _id|act across the page boundary)`, n === 1, row.slice(0, 200));
        }
        // per task list: one unfiltered list, or one per owned step with read-back activity ids (§6.3 rung 1)
        const perList = {};
        for (const c of await t.calls((c) => c.command === "PROCESS_GET_MY_TASKS_ITEMS" && c.flowId === CASE)) perList[c.activityId ?? "-"] = (perList[c.activityId ?? "-"] ?? 0) + 1;
        t.check(`${envelope}: paging stopped (no runaway: ≤ 4 task pages per load, per task list)`, Object.values(perList).every((n) => n <= 4 * 2), perList);
      }
      await t.shot("diag-paging");
      // admin rows carry no _current_step: the step comes from GET_ADMIN_ITEM, at most 4 in flight (Cases list, T1)
      await t.host({ user: "dev", extra: 120, readDelay: 60 }, "/cases");
      await t.requireScreen("wb-cases", "T1");
      await t.wait(4000);
      const reads = await t.calls((c) => c.command === "PROCESS_GET_ADMIN_ITEM");
      let maxIn = 0;
      for (const c of reads) maxIn = Math.max(maxIn, reads.filter((d) => d.at <= c.at && (d.answeredAt ?? Infinity) > c.at).length);
      t.check("admin rows: the step of open items is read with GET_ADMIN_ITEM", reads.length > 0, reads.length);
      t.check("GET_ADMIN_ITEM: at most 4 in flight", maxIn <= 4, maxIn);
    },
  },
  {
    id: "S34",
    title: "stepkey=none: tasks resolve through getItem / getProgress, else unidentified",
    priority: "P2",
    owner: "T0",
    async run(t) {
      // progress on: every task resolves by activity
      await t.host({ user: "dev", stepkey: "none", progress: 1 }, "/diagnostics");
      await diagSettled(t);
      await t.wait(1000);
      const st = await t.state();
      const fx = await t.fixtures();
      const table = () => t.ui.getByRole("table").filter({ hasText: "Held tasks (evidence)" }).first();
      const row = async (s) => table().locator("tr", { hasText: s }).first().innerText().catch(() => "");
      const c1 = item(st, fx.C1).fields.Case_Code;
      const c4 = item(st, fx.C4).fields.Case_Code;
      t.check("progress on: C1's S1 task resolves by activity", (await row("CASE_S1")).includes(`${c1}`) && /\(activity\)/.test(await row("CASE_S1")), (await row("CASE_S1")).slice(0, 200));
      t.check("progress on: C4's Part 2 tasks resolve by activity", (await row("CASE_B_SAF")).includes(c4));
      // progress off: single-task items resolve from getItem (item evidence); C4's three stay unidentified.
      // With read-back ids: every task resolves by the activity filter instead (rung 1), C4's three included.
      await t.host({ user: "dev", stepkey: "none", progress: 0 }, "/diagnostics");
      await diagSettled(t);
      await t.wait(1500);
      const un = await t.ui.getByText("Unidentified steps:", { exact: false }).first().innerText().catch(() => "");
      if (READBACK_IDS) {
        t.check("progress off, read-back ids: C1's S1 resolves by the activity filter (activity evidence)", (await row("CASE_S1")).includes(c1) && /\(activity\)/.test(await row("CASE_S1")), (await row("CASE_S1")).slice(0, 200));
        for (const s of ["CASE_B_REG", "CASE_B_SAF", "CASE_B_QM"]) t.check(`progress off, read-back ids: C4's ${s} task resolves by the activity filter`, (await row(s)).includes(c4) && /\(activity\)/.test(await row(s)), (await row(s)).slice(0, 200));
        t.check("progress off, read-back ids: none of C4's tasks is unidentified", !un.includes(c4), un.slice(0, 200));
        t.check("read-back ids: My Tasks was listed with the activity filter", (await t.calls((c) => c.command === "PROCESS_GET_MY_TASKS_ITEMS" && !!c.activityId)).length > 0);
      } else {
        t.check("progress off: C1's S1 resolves through getItem (item evidence)", (await row("CASE_S1")).includes(c1) && /\(item\)/.test(await row("CASE_S1")), (await row("CASE_S1")).slice(0, 200));
        t.check("progress off: C4's three branch tasks are unidentified (open in Kissflow)", un.split(c4).length - 1 === 3, un.slice(0, 200));
        t.check("getItem was used for the single-task rows", (await t.calls((c) => c.command === "PROCESS_GET_ITEM")).length > 0);
      }
    },
  },
  {
    id: "S38",
    title: "wrong container (appId=CIQ_Supplier_Portal_A00)",
    priority: "P1",
    owner: "T0",
    async run(t) {
      await t.host({ appId: "CIQ_Supplier_Portal_A00", user: "dev" }, "/diagnostics");
      await t.seeTestId("wb-container-banner", "the shell shows the wrong-container banner");
      const c = await t.text("wb-diag-container");
      t.check("Diagnostics: a red container row (≠ CIQ_Digital_A00)", c.includes("CIQ_Supplier_Portal_A00") && c.includes("≠ CIQ_Digital_A00"), c);
      const red = await t.byTestId("wb-diag-container").first().getAttribute("class");
      t.check("the container row is styled as an error", /text-bad/.test(red ?? ""), red);
      await t.shot("diag");
      t.check("no write command so far", (await t.calls(isWrite)).length === 0);
      // pressing a save shows the container error (needs a step panel: T1's S1 manual record)
      const st = await t.state();
      const fx = await t.fixtures();
      await t.route(`/cases/${fx.C1}?task=${actAt(st, fx.C1, "CASE_S1")}`);
      await t.requireScreen("wb-step-CASE_S1", "T1");
      await t.click("wb-step-save");
      await t.see("not CIQ_Digital_A00", "the save shows the container error", 4000);
      t.check("no write, create, submit, reject or send-back command", (await t.calls(isWrite)).length === 0);
    },
  },

  // ======================================================== T1 (RMM)
  {
    id: "S06",
    title: "RMM new case (user=alex)",
    priority: "P1",
    owner: "T1",
    async run(t) {
      await t.host({ user: "alex" }, "/cases/new");
      await t.requireScreen("wb-newcase", "T1");
      const st = await t.state();
      const nwb = st.rows.find((r) => r.fields.Supplier_Code === "SUP-NWB");
      await t.select("wb-newcase-supplier", "Northwind Botanicals GmbH");
      for (const c of nwb.fields["Table::Contacts"].filter((x) => x.Contacts_Can_Confirm === "Yes")) await t.byTestId(`wb-newcase-contact-${c._id}`).locator("input").check();
      await fill(t, "Trade_Name", "Harness Mint Water");
      await fill(t, "Main_INCI", "Mentha Piperita Leaf Water");
      await fill(t, "BDF_Material_No", "RM-499001");
      const before = await t.lastSeq();
      await t.click("wb-newcase-submit");
      await until(t, after(before, "DATAFORM_SUBMIT_ITEM", (c) => c.flowId === F8), 15000);
      // discard-first answers "no draft" (benign) when there is none: keep those calls in the sequence
      const seq = (await t.calls((c) => c.seq > before && (!c.refused || c.refused.category === "no-draft"))).map((c) => `${c.command}:${c.flowId ?? ""}`);
      const order = ["PROCESS_CREATE_ITEM:CIQ_Case_A00", "PROCESS_GET_ITEM:CIQ_Case_A00", "PROCESS_UPDATE_ITEM:CIQ_Case_A00", "PROCESS_GET_ITEM:CIQ_Case_A00", "PROCESS_SUBMIT_ITEM:CIQ_Case_A00", `DATAFORM_DISCARD_ITEM:${F3}`, `DATAFORM_CREATE_ITEM:${F3}`, `DATAFORM_SUBMIT_ITEM:${F3}`, `DATAFORM_DISCARD_ITEM:${F8}`, `DATAFORM_CREATE_ITEM:${F8}`, `DATAFORM_SUBMIT_ITEM:${F8}`];
      let i = 0;
      for (const s of seq) if (s === order[i]) i++;
      t.check("call order: create → GET → UPDATE keys → GET → SUBMIT → F3 discard/create/submit → F8 discard/create/submit", i === order.length, seq);
      const reads = (await t.calls((c) => c.seq <= before)).map((c) => `${c.command}:${c.flowId}`);
      t.check("F1/F2 were read before the create", reads.includes("DATAFORM_GET_ITEMS:CIQ_Supplier_A00") && reads.includes("DATAFORM_GET_ITEMS:CIQ_Config_Version_A00"));
      const create = (await t.calls(after(before, "PROCESS_CREATE_ITEM")))[0];
      const upd = (await t.calls(after(before, "PROCESS_UPDATE_ITEM", (c) => c.instanceId === create?.note?.createdId)))[0];
      const id = create?.note?.createdId;
      t.check("Case_Code = CIQ-<yyyy>-<id> and Request_Key = <Case_Code>-C1-REQ", upd && upd.data.Case_Code === `CIQ-${new Date().getUTCFullYear()}-${id}` && upd.data.Request_Key === `${upd.data.Case_Code}-C1-REQ`, upd?.data);
      t.check("Case_Code/Request_Key are not in the create payload (POST_CREATE_KEYS)", create && !("Case_Code" in create.data) && !("Request_Key" in create.data));
      const st2 = await t.state();
      t.check("host: the new case is at S1", JSON.stringify(openSteps(st2, id)) === '["CASE_S1"]', openSteps(st2, id));
      t.check("host: an F8 \"Item created\" row with Snapshot_JSON", rows(st2, F8).some((r) => r.fields.Case_Item_Id === id && r.fields.Event_Category === "Item created" && r.fields.Snapshot_JSON));
      await t.shot("created");
    },
  },
  {
    id: "S07",
    title: "new case without a confirm contact → problems, no create",
    priority: "P1",
    owner: "T1",
    async run(t) {
      await t.host({ user: "alex" }, "/cases/new");
      await t.requireScreen("wb-newcase", "T1");
      await t.select("wb-newcase-supplier", "Northwind Botanicals GmbH");
      await fill(t, "Trade_Name", "Harness Rose Water");
      await t.click("wb-newcase-submit");
      await t.seeTestId("wb-newcase-errors", "the problems list shows");
      const txt = await t.text("wb-newcase-errors");
      t.check("Case_Code / Request_Key are not listed as problems", !/Case Code|Request Key/i.test(txt), txt);
      await t.wait(800);
      t.check("no PROCESS_CREATE_ITEM", (await t.calls((c) => c.command === "PROCESS_CREATE_ITEM")).length === 0);
    },
  },
  {
    id: "S08",
    title: "S1 manual record → S2",
    priority: "P1",
    matrix: true,
    owner: "T1",
    async run(t) {
      await t.host({ user: "dev" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      await t.route(`/cases/${fx.C1}?task=${actAt(st, fx.C1, "CASE_S1")}`);
      await t.requireScreen("wb-step-CASE_S1", "T1");
      await t.seeTestId("wb-manual-note", "the \"manual record\" note is visible");
      await t.select(t.byTestId("wb-field-Basic_Data_Received"), "Yes").catch(async () => fill(t, "Basic_Data_Received", "Yes"));
      await kwbSave(t, "wb-step-save", "S1", { id: fx.C1, act: actAt(st, fx.C1, "CASE_S1") });
      t.check("host: Basic_Data_Received = Yes", item(await t.state(), fx.C1).fields.Basic_Data_Received === "Yes", item(await t.state(), fx.C1).fields.Basic_Data_Received);
      await submitVia(t, "wb-step-submit");
      const st2 = await t.state();
      t.check("host: C1 at S2", JSON.stringify(openSteps(st2, fx.C1)) === '["CASE_S2"]', openSteps(st2, fx.C1));
      await t.notSee("sent to supplier");
    },
  },
  {
    id: "S09",
    title: "S2 scope: F4 then F3 rows, S2 fields, Rule_Set_Version none (manual-wb-1)",
    priority: "P1",
    matrix: true,
    owner: "T1",
    async run(t) {
      await t.host({ user: "dev" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      await t.route(`/cases/${fx.C2}?task=${actAt(st, fx.C2, "CASE_S2")}`);
      await t.requireScreen("wb-step-CASE_S2", "T1");
      // "flags as chosen": add one department the leads do not require (with the reason), then compare every flag
      await t.seeTestId("wb-scope-depts", "the department flags show");
      const deptBoxes = t.ui.locator('[data-testid^="wb-scope-dept-"]:not([data-testid="wb-scope-dept-reason"])');
      let added = null;
      for (const el of await deptBoxes.all()) {
        const cb = el.locator('input[type="checkbox"]').first();
        if ((await el.getAttribute("data-on")) === "0" && (await cb.isEnabled().catch(() => false))) {
          await cb.check();
          added = (await el.getAttribute("data-testid")).replace("wb-scope-dept-", "");
          break;
        }
      }
      t.check("a department the leads do not require can be added", !!added);
      if (added) await t.byTestId("wb-scope-dept-reason").first().fill("Added for the harness (flags as chosen).");
      const chosen = Object.fromEntries(await Promise.all((await deptBoxes.all()).map(async (el) => [(await el.getAttribute("data-testid")).replace("wb-scope-dept-", ""), (await el.getAttribute("data-on")) === "1" ? "Yes" : "No"])));
      const before = await t.lastSeq();
      await kwbSave(t, "wb-step-save", "S2 scope", { id: fx.C2, act: actAt(st, fx.C2, "CASE_S2") });
      const creates = await t.calls((c) => c.seq > before && c.command === "DATAFORM_CREATE_ITEM");
      t.check("an F4 run first, then F3 rows", creates[0]?.flowId === F4 && creates.slice(1).every((c) => c.flowId === F3), creates.map((c) => c.flowId));
      const discards = await t.calls((c) => c.seq > before && c.command === "DATAFORM_DISCARD_ITEM");
      t.check("each create after a discard", discards.length >= creates.length);
      const st2 = await t.state();
      const f = item(st2, fx.C2).fields;
      t.check("Rule_Set_Version = none (manual-wb-1) on the case and on F4", f.Rule_Set_Version === "none (manual-wb-1)" && rows(st2, F4).some((r) => r.fields.Case_Item_Id === fx.C2 && r.fields.Rule_Set_Version === "none (manual-wb-1)"));
      const flagDiff = Object.entries(chosen).filter(([d, v]) => f[`Dept_${d}_Active`] !== v).map(([d, v]) => `${d}: chosen ${v}, host ${f[`Dept_${d}_Active`]}`);
      t.check(`S2 fields written: Dept_<D>_Active as chosen (added ${added ?? "none"})`, Object.keys(chosen).length >= 5 && flagDiff.length === 0, flagDiff.length ? flagDiff : chosen);
      await submitVia(t, "wb-step-submit");
      t.check("host: C2 at S3", JSON.stringify(openSteps(await t.state(), fx.C2)) === '["CASE_S3"]');
      const n = rows(await t.state(), F3).filter((r) => r.fields.Case_Item_Id === fx.C2).length;
      await t.click("wb-step-save").catch(() => {});
      await t.wait(1500);
      t.check("a rerun creates no duplicates", rows(await t.state(), F3).filter((r) => r.fields.Case_Item_Id === fx.C2).length === n);
    },
  },
  {
    id: "S10",
    title: "S3 manual → Part 2 (Supplier confirmed at → both fields)",
    priority: "P1",
    matrix: true,
    owner: "T1",
    async run(t) {
      await t.host({ user: "dev" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      await t.route(`/cases/${fx.C3}?task=${actAt(st, fx.C3, "CASE_S3")}`);
      await t.requireScreen("wb-step-CASE_S3", "T1");
      const typed = "2026-10-07T09:15";
      await t.byTestId("wb-s3-confirmed-at").locator("input").first().fill(typed);
      await kwbSave(t, "wb-step-save", "S3", { id: fx.C3, act: actAt(st, fx.C3, "CASE_S3") });
      await submitVia(t, "wb-step-submit");
      const f = item(await t.state(), fx.C3).fields;
      const want = await localToIso(t, typed);
      t.check("Completeness_At = RMES_Created_At = the typed time (not now), no ms", f.Completeness_At === want && f.RMES_Created_At === want && noMs(f.Completeness_At), { want, got: [f.Completeness_At, f.RMES_Created_At] });
      t.check("host: 3 open activities on one _id", openSteps(await t.state(), fx.C3).length === 3);
      await t.route("/my-work");
      await t.requireScreen("wb-mywork", "T1");
      const acts = item(await t.state(), fx.C3).acts.filter((a) => a.open).map((a) => a.act);
      for (const a of acts) await t.seeTestId(`wb-mywork-row-${fx.C3}-${a}`, `My work lists ${a}`);
      t.check("My work: 3 distinct _id|act rows for C3", (await Promise.all(acts.map((a) => t.byTestId(`wb-mywork-row-${fx.C3}-${a}`).count()))).every((n) => n === 1));
      await t.route("/review");
      await t.requireScreen("wb-review", "T2");
      await t.byTestId("wb-review-tab-cases").first().click();
      for (const a of acts) await t.seeTestId(`wb-review-row-${fx.C3}-${a}`, `Review lists ${a}`);
      t.check("Review: 3 distinct _id|act rows for C3", (await Promise.all(acts.map((a) => t.byTestId(`wb-review-row-${fx.C3}-${a}`).count()))).every((n) => n === 1));
    },
  },
  {
    id: "S23",
    title: "cancel at S2 (reject ok, refuse, formDrop correction)",
    priority: "P1",
    owner: "T1",
    async run(t) {
      for (const mode of ["ok", "refuse", "drop"]) {
        const p = mode === "ok" ? {} : mode === "refuse" ? { reject: "refuse" } : { formDrop: `${F8}:Notify_Recipient` };
        await t.host({ user: "alex", ...p }, "/");
        const st = await t.state();
        const fx = await t.fixtures();
        await t.route(`/cases/${fx.C2}?task=${actAt(st, fx.C2, "CASE_S2")}`);
        await t.requireScreen("wb-case-cancel", "T1");
        await t.click("wb-case-cancel");
        const before = await t.lastSeq();
        await t.click("wb-confirm");
        await t.wait(500);
        t.check(`${mode}: an empty reason is blocked (no F8 create)`, (await t.calls(after(before, "DATAFORM_CREATE_ITEM"))).length === 0);
        await t.byTestId("wb-confirm-reason").fill("Supplier stopped the material (harness).");
        await t.click("wb-confirm");
        if (mode === "refuse") t.expectRefusals("mode:reject");
        await until(t, after(before, "PROCESS_REJECT_ITEM"), 10000);
        const cs = await t.calls((c) => c.seq > before && (c.command === "PROCESS_REJECT_ITEM" || (c.flowId === F8 && /CREATE|SUBMIT|UPDATE/.test(c.command))));
        const firstF8 = cs.findIndex((c) => c.command === "DATAFORM_SUBMIT_ITEM");
        const rej = cs.findIndex((c) => c.command === "PROCESS_REJECT_ITEM");
        t.check(`${mode}: F8 Cancellation create+submit BEFORE PROCESS_REJECT_ITEM`, firstF8 >= 0 && rej > firstF8, cs.map((c) => c.command));
        const st2 = await t.state();
        const ev = rows(st2, F8).filter((r) => r.fields.Case_Item_Id === fx.C2);
        if (mode === "ok") {
          t.check("ok: Notify_Recipient = the supplier contact e-mails", ev.some((r) => r.fields.Event_Category === "Cancellation" && r.fields.Notify_Recipient === item(st2, fx.C2).fields.Supplier_Contact_Emails));
          t.check("ok: host case Rejected", item(st2, fx.C2).status === "Rejected");
        } else if (mode === "refuse") {
          t.check("refuse: a second F8 case.cancel.failed row", ev.some((r) => r.fields.Action_Code === "case.cancel.failed"));
          await t.seeTestId("wb-write-refused", "refuse: a red banner");
        } else {
          const first = ev.find((r) => r.fields.Action_Code === "case.cancel");
          t.check("formDrop: a case.cancel.correction row with Object_Key = the first Event_Key", ev.some((r) => r.fields.Action_Code === "case.cancel.correction" && r.fields.Object_Key === first?.fields.Event_Key));
          t.check("formDrop: no DATAFORM_UPDATE_ITEM on F8", (await t.calls((c) => c.command === "DATAFORM_UPDATE_ITEM" && c.flowId === F8)).length === 0);
          t.check("formDrop: then the reject", item(st2, fx.C2).status === "Rejected");
        }
      }
    },
  },
  {
    id: "S24a",
    title: "S5 with an open item + override (dev, rung 1)",
    priority: "P1",
    matrix: true,
    owner: "T1",
    async run(t) {
      await t.host({ user: "dev" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      await t.route(`/cases/${fx.C5}?task=${actAt(st, fx.C5, "CASE_S5")}`);
      await t.requireScreen("wb-step-CASE_S5", "T1");
      await kwbSave(t, "wb-counts-refresh", "refresh counts", { id: fx.C5, act: actAt(st, fx.C5, "CASE_S5") });
      const f = item(await t.state(), fx.C5).fields;
      t.check("counts written 1/0 (P8 open, no CR)", f.Open_Items_Count === 1 && f.Open_CR_Count === 0, [f.Open_Items_Count, f.Open_CR_Count]);
      t.check("server gate blank", f.Open_Items_Gate_Release === "");
      await t.byTestId("wb-override").locator("textarea").first().fill("Remaining point is internal only (harness).");
      await fill(t, "Hold_Note", "Override recorded (harness).");
      await kwbSave(t, "wb-step-save", "override + hold note", { id: fx.C5, act: actAt(st, fx.C5, "CASE_S5") });
      const st2 = await t.state();
      t.check("an F8 override row", rows(st2, F8).some((r) => r.fields.Case_Item_Id === fx.C5 && r.fields.Action_Code === "hold.override.release"));
      t.check("server gate OK after the override", item(st2, fx.C5).fields.Open_Items_Gate_Release === "OK");
      await submitVia(t, "wb-step-submit");
    },
  },
  {
    id: "S24b",
    title: "S5 on rung 3 (alex): counts not written, override still works",
    priority: "P1",
    matrix: true,
    owner: "T1",
    async run(t) {
      await t.host({ user: "alex" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      await t.route(`/cases/${fx.C5}?task=${actAt(st, fx.C5, "CASE_S5")}`);
      await t.requireScreen("wb-step-CASE_S5", "T1");
      const before = await t.lastSeq();
      await t.click("wb-counts-refresh");
      await t.seeTestId("wb-counts-unread", "the unread lists are named");
      t.check("counts NOT written (partial, fail-closed)", (await t.calls(after(before, "PROCESS_UPDATE_ITEM", (c) => c.data && ("Open_Items_Count" in c.data || "Open_CR_Count" in c.data)))).length === 0);
      await t.byTestId("wb-override").locator("textarea").first().fill("Checked by hand (harness).");
      await fill(t, "Hold_Note", "Override (harness).");
      await kwbSave(t, "wb-step-save", "override", { id: fx.C5, act: actAt(st, fx.C5, "CASE_S5") });
      await submitVia(t, "wb-step-submit");
    },
  },
  {
    id: "S26a",
    title: "S7 manual, complete (dev)",
    priority: "P1",
    matrix: true,
    owner: "T1",
    async run(t) {
      await t.host({ user: "dev" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      await t.route(`/cases/${fx.C7}?task=${actAt(st, fx.C7, "CASE_S7")}`);
      await t.requireScreen("wb-step-CASE_S7", "T1");
      await t.byTestId("wb-s7-released-at").locator("input").first().fill("");
      const b0 = await t.lastSeq();
      await t.click("wb-step-submit");
      await t.seeTestId("wb-step-problems", "an empty \"Supplier released at\" blocks");
      t.check("no submit while it is empty", (await t.calls(after(b0, "PROCESS_SUBMIT_ITEM"))).length === 0);
      await t.byTestId("wb-s7-released-at").locator("input").first().fill("2026-10-07T16:30");
      await kwbSave(t, "wb-counts-refresh", "refresh counts", { id: fx.C7, act: actAt(st, fx.C7, "CASE_S7") });
      await kwbSave(t, "wb-step-save", "S7", { id: fx.C7, act: actAt(st, fx.C7, "CASE_S7") });
      const pre = item(await t.state(), fx.C7).fields;
      t.check("counts refreshed and written before the submit (host holds numbers)", typeof pre.Open_Items_Count === "number" && typeof pre.Open_CR_Count === "number", [pre.Open_Items_Count, pre.Open_CR_Count]);
      const sub = await submitVia(t, "wb-step-submit");
      if (t.variant === "ok") {
        const cw = (await t.calls((c) => c.command === "PROCESS_UPDATE_ITEM" && c.instanceId === fx.C7 && !c.refused && c.data && "Open_Items_Count" in c.data))[0];
        t.check("the count UPDATE_ITEM precedes SUBMIT_ITEM", cw && sub && cw.seq < sub.seq, [cw?.seq, sub?.seq]);
      }
      const f = item(await t.state(), fx.C7).fields;
      const want = await localToIso(t, "2026-10-07T16:30");
      t.check("Final_Release_At = the input (no ms); Completion_Trigger Manual by RMM", f.Final_Release_At === want && /^Manual by RMM: /.test(String(f.Completion_Trigger)), { want, got: f.Final_Release_At, trigger: f.Completion_Trigger });
      await t.notSee("PDF");
      await t.notSee("e-mailed");
    },
  },
  {
    id: "S26b",
    title: "S7 manual, partial (alex): counts cleared → S8",
    priority: "P1",
    matrix: true,
    owner: "T1",
    async run(t) {
      await t.host({ user: "alex" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      await t.route(`/cases/${fx.C7}?task=${actAt(st, fx.C7, "CASE_S7")}`);
      await t.requireScreen("wb-step-CASE_S7", "T1");
      await t.byTestId("wb-s7-released-at").locator("input").first().fill("2026-10-07T16:30");
      await kwbSave(t, "wb-counts-refresh", "refresh counts (partial → clear)", { id: fx.C7, act: actAt(st, fx.C7, "CASE_S7") });
      await kwbSave(t, "wb-step-save", "S7", { id: fx.C7, act: actAt(st, fx.C7, "CASE_S7") });
      const s = await submitVia(t, "wb-step-submit");
      const st2 = await t.state();
      const f = item(st2, fx.C7).fields;
      t.check("counts cleared before SUBMIT_ITEM", (f.Open_Items_Count ?? null) === null && (f.Open_CR_Count ?? null) === null);
      t.check("host Hold_For_Open_Items = Yes → the case is at S8, not Completed", f.Hold_For_Open_Items === "Yes" && JSON.stringify(openSteps(st2, fx.C7)) === '["CASE_S8"]', { hold: f.Hold_For_Open_Items, steps: openSteps(st2, fx.C7), s: !!s });
    },
  },
  {
    id: "S27",
    title: "CR triage after release (CR3 on C9, CR4 untriaged on C8)",
    priority: "P1",
    matrix: true,
    owner: "T1",
    async run(t) {
      for (const [cr, c] of [["CR3", "C9"], ["CR4", "C8"]]) {
        await t.host({ user: "dev" }, "/");
        const st = await t.state();
        const fx = await t.fixtures();
        if (cr === "CR4") {
          await t.route(`/cases/${fx.C8}?tab=change-requests`);
          await t.requireScreen("wb-case", "T1");
          await t.see(item(st, fx.CR4).fields.CR_Key, "CR4 is listed under C8 before triage (Case_Code + Cycle_No)");
        }
        await t.route(`/change-requests/${fx[cr]}?task=${actAt(st, fx[cr], "CHRQ_S1")}`);
        await t.requireScreen("wb-cr-triage", "T1");
        const opts = await t.options(t.byTestId("wb-field-CR_Outcome")).catch(() => []);
        t.check(`${cr}: "Accepted – scope extended" is not offered`, !opts.includes("Accepted – scope extended"), opts);
        await kwbSave(t, "wb-step-save", `${cr} triage`, { id: fx[cr], act: actAt(st, fx[cr], "CHRQ_S1") });
        await submitVia(t, "wb-step-submit", CR);
        const st2 = await t.state();
        const f = item(st2, fx[cr]).fields;
        t.check(`${cr}: outcome forced to "Refused – after final release", impacts No`, f.CR_Outcome === "Refused – after final release" && ["REG", "SAF", "QM", "MIC", "SUS"].every((d) => f[`Impact_${d}`] === "No"));
        t.check(`${cr}: Case_Item_Id set at triage`, f.Case_Item_Id === fx[c]);
        t.check(`${cr}: an F8 "Change attempt" row`, rows(st2, F8).some((r) => r.fields.Event_Category === "Change attempt" && r.fields.Case_Item_Id === fx[c]));
        t.check(`${cr}: ends with no branches`, item(st2, fx[cr]).status === "Completed");
      }
    },
  },
  {
    id: "S39",
    title: "Case Admin lane repair (casey, caseAdminFlowAdmin=on)",
    priority: "P1",
    owner: "T1",
    async run(t) {
      await t.host({ user: "casey", caseAdminFlowAdmin: "on" }, "/");
      const fx = await t.fixtures();
      await t.host$("dropLaneValue", fx.C5, "QM_Review_Confirm");
      t.allowAdminWrite();
      await t.route(`/cases/${fx.C5}?tab=lanes`);
      await t.requireScreen("wb-lane-repair-QM", "T1");
      const before = await t.lastSeq();
      await t.click("wb-lane-repair-QM");
      await t.byTestId("wb-confirm-reason").fill("QM confirmation lost after the join (harness).").catch(() => {});
      await t.click("wb-confirm").catch(() => {});
      await until(t, after(before, "PROCESS_UPDATE_ADMIN_ITEM"), 10000);
      const cs = await t.calls((c) => c.seq > before && (c.command === "PROCESS_UPDATE_ADMIN_ITEM" || (c.flowId === F8 && c.command === "DATAFORM_SUBMIT_ITEM")));
      t.check("F8 lane.repaired first, then exactly one UPDATE_ADMIN_ITEM", cs[0]?.command === "DATAFORM_SUBMIT_ITEM" && cs.filter((c) => c.command === "PROCESS_UPDATE_ADMIN_ITEM").length === 1, cs.map((c) => c.command));
      const upd = cs.find((c) => c.command === "PROCESS_UPDATE_ADMIN_ITEM");
      t.check("the admin write carries only QM lane fields", upd && Object.keys(upd.data).every((k) => k.startsWith("QM_")), upd?.data);
      t.check("read back with GET_ADMIN_ITEM", (await t.calls(after(upd?.seq ?? 0, "PROCESS_GET_ADMIN_ITEM"))).length > 0);
      t.check("the lane check passes (QM confirmed again)", item(await t.state(), fx.C5).fields.QM_Review_Confirm === "Confirmed");
      await t.host({ user: "alex" }, `/cases/${fx.C5}?tab=lanes`);
      await t.requireScreen("wb-case", "T1");
      await t.noTestId("wb-lane-repair-QM", "alex sees no Repair button");
    },
  },
  {
    id: "S40",
    title: "department-review alternative for a lost lane value (alex, then tove)",
    priority: "P1",
    matrix: true,
    owner: "T1",
    async run(t) {
      await t.host({ user: "alex" }, "/");
      const fx = await t.fixtures();
      await t.host$("dropLaneValue", fx.C5, "QM_Review_Confirm");
      const s5 = actAt(await t.state(), fx.C5, "CASE_S5");
      await t.route(`/cases/${fx.C5}?task=${s5}`);
      await t.requireScreen("wb-s5-raise-deptreview-QM", "T1");
      const b0 = await t.lastSeq();
      await t.click("wb-s5-raise-deptreview-QM");
      const sub = (await until(t, after(b0, "PROCESS_SUBMIT_ITEM", (c) => c.flowId === OP && !c.refused), 12000))[0];
      t.check("Raise department review for QM → a point submitted", !!sub);
      const st = await t.state();
      const point = st.items.find((i) => i.flow === OP && i.fields.Case_Item_Id === fx.C5 && i.fields.OP_Kind === "Department review" && i.fields.OP_Dept === "QM");
      t.check("the point is at R_QM (internal, Department review, QM)", point && JSON.stringify(openSteps(st, point.id)) === '["OPNT_R_QM"]', point && openSteps(st, point.id));
      if (!point) return;
      // tove (QM) accepts it
      await t.switchUser("tove", `/points/${point.id}?task=${actAt(st, point.id, "OPNT_R_QM")}`);
      await t.requireScreen("wb-point-accept", "T2");
      await actAndSubmit(t, "wb-point-accept", { flow: OP, label: "tove accepts", task: { id: point.id, act: actAt(st, point.id, "OPNT_R_QM") }, afterKwb: "wb-point-submit-after-kwb" });
      t.check("the point is Accepted", item(await t.state(), point.id).fields.OP_Outcome === "Accepted");
      // alex records the late completion → Late_Completions_Text holds its OP_Key → the lane check passes → submit
      await t.switchUser("alex", `/cases/${fx.C5}?task=${s5}`);
      await t.requireScreen("wb-s5-late-completion-QM", "T1");
      await kwbSave(t, "wb-s5-late-completion-QM", "record late completion", { id: fx.C5, act: s5 });
      const f = item(await t.state(), fx.C5).fields;
      t.check("Late_Completions_Text holds the point's OP_Key", String(f.Late_Completions_Text ?? "").includes(String(item(await t.state(), point.id).fields.OP_Key)), f.Late_Completions_Text);
      await t.byTestId("wb-override").locator("textarea").first().fill("Counts checked by hand (harness).").catch(() => {});
      await fill(t, "Hold_Note", "QM completed late through a department review (harness).").catch(() => {});
      await kwbSave(t, "wb-step-save", "override + hold note", { id: fx.C5, act: s5 });
      await submitVia(t, "wb-step-submit");
      t.check("host: C5 left S5", !openSteps(await t.state(), fx.C5).includes("CASE_S5"), openSteps(await t.state(), fx.C5));
    },
  },
  {
    id: "S44",
    title: "drafts=sticky, then formSubmit=fail on the S2 F3 create",
    priority: "P1",
    owner: "T1",
    async run(t) {
      for (const p of [{ drafts: "sticky" }, { formSubmit: "fail" }]) {
        await t.host({ user: "alex", ...p }, "/");
        const st = await t.state();
        const fx = await t.fixtures();
        await t.route(`/cases/${fx.C2}?task=${actAt(st, fx.C2, "CASE_S2")}`);
        await t.requireScreen("wb-step-CASE_S2", "T1");
        if (p.formSubmit) t.expectRefusals("mode:formSubmit");
        const before = await t.lastSeq();
        await t.click("wb-step-save");
        await t.wait(4000);
        const cs = await t.calls((c) => c.seq > before && /DATAFORM_(CREATE|DISCARD)_ITEM/.test(c.command));
        t.check(`${Object.keys(p)[0]}: DATAFORM_DISCARD_ITEM before every create`, cs.every((c, i) => c.command !== "DATAFORM_CREATE_ITEM" || cs[i - 1]?.command === "DATAFORM_DISCARD_ITEM"), cs.map((c) => c.command));
        if (p.drafts) t.check("sticky: created rows hold no leftover values", !JSON.stringify(rows(await t.state(), F3)).includes("LEFTOVER"));
        else {
          await t.seeTestId("wb-write-refused", "fail: the error is shown");
          await t.click("wb-step-save");
          await t.wait(4000);
          const n = rows(await t.state(), F4).filter((r) => r.fields.Case_Item_Id === fx.C2).length;
          t.check("fail: a retry creates the row once", n === 1, n);
        }
      }
    },
  },

  // ======================================================== T2 (review, points, RMES)
  {
    id: "S11a",
    title: "lane gate on rung 3 (jo, C4): partial, nothing written, Complete disabled",
    priority: "P1",
    owner: "T2",
    async run(t) {
      const { fx } = await laneOpen(t, { user: "jo" });
      const before = await t.lastSeq();
      await t.click("wb-counts-refresh");
      await t.seeTestId("wb-counts-unread", "partial: the unread lists are named");
      const txt = await t.text("wb-counts-unread");
      t.check("the unread list names the open points of this case and the rung", /open points/i.test(txt), txt);
      // review fixes WL-01 / UX-01 / F-08: plain words, no internal name, a next step
      t.check("plain words: no read-rung code in the unread list", !/mine\+tasks|\(read:/.test(txt), txt);
      t.check("no internal name; names who can help (a Case administrator)", !/Thomas|counts policy/.test(txt) && /Case administrator/.test(txt), txt);
      await t.seeTestId("wb-counts-blocked-next", "the lane says what to do now (save the sign-off, ask a Case Admin)");
      await t.wait(800);
      t.check("no UPDATE_ITEM of SAF_Open_Count", (await t.calls(after(before, "PROCESS_UPDATE_ITEM", (c) => c.data && "SAF_Open_Count" in c.data))).length === 0);
      t.check("\"Complete review\" disabled", await t.byTestId("wb-lane-complete").first().isDisabled().catch(() => false));
      t.check("no SUBMIT_ITEM", (await t.calls(after(before, "PROCESS_SUBMIT_ITEM"))).length === 0);
      void fx;
      await t.shot("partial");
    },
  },
  {
    id: "S11b",
    title: "lane gate on rung 1 (jo, flowAdmin=jo): count written, gate blank, blockers",
    priority: "P1",
    matrix: true,
    owner: "T2",
    async run(t) {
      const { fx, act } = await laneOpen(t, { user: "jo", flowAdmin: "jo" });
      await kwbSave(t, "wb-counts-refresh", "refresh counts", { id: fx.C4, act });
      const f = item(await t.state(), fx.C4).fields;
      t.check("SAF_Open_Count = 1 (P3) on the server", f.SAF_Open_Count === 1, f.SAF_Open_Count);
      t.check("server SAF_Gate = \"\"", f.SAF_Gate === "");
      await t.seeTestId("wb-lane-blockers", "blockers listed");
      t.check("a section-review blocker for SAF-A (no review mark yet)", (await t.text("wb-lane-blockers")).includes("SAF-A"), (await t.text("wb-lane-blockers")).slice(0, 300));
      t.check("Complete disabled", await t.byTestId("wb-lane-complete").first().isDisabled().catch(() => false));
      t.check("no SUBMIT_ITEM", (await t.calls((c) => c.command === "PROCESS_SUBMIT_ITEM")).length === 0);
    },
  },
  {
    id: "S12a",
    title: "lane completes on rung 1 (jo, flowAdmin=jo), then REG and QM → S5",
    priority: "P1",
    matrix: true,
    owner: "T2",
    async run(t) {
      const P = { user: "jo", flowAdmin: "jo", c4Rmes: "complete" };
      await acceptPoint(t, P, "P3", "OPNT_R_SAF");
      await completeSafLane(t, { rung: 1 });
      // the REG and QM lanes too (dev holds them; recorded natively here) → the join → S5
      const fx = await t.fixtures();
      await t.switchUser("dev", `/cases/${fx.C4}`);
      const st = await t.state();
      for (const d of ["REG", "QM"]) {
        const act = actAt(st, fx.C4, `CASE_B_${d}`);
        const lane = { [`${d}_Review_Confirm`]: "Confirmed", [`${d}_Completed_By`]: { _id: "UsDev0001" }, [`${d}_Completed_By_Email`]: "dev@example.test", [`${d}_Completed_At`]: "2026-10-08T09:00:00Z", [`${d}_Open_Count`]: 0 };
        if (d === "REG") Object.assign(lane, { REG_RMES_Gaps: 0, REG_RMES_Decision: "Approved" });
        await t.host$("nativeSave", fx.C4, act, lane);
        await t.host$("nativeSubmit", fx.C4, act);
      }
      t.check("after the REG and QM lanes too → the case at S5", JSON.stringify(openSteps(await t.state(), fx.C4)) === '["CASE_S5"]', openSteps(await t.state(), fx.C4));
    },
  },
  {
    id: "S12b",
    title: "lane completes by attestation (jo, countsPolicy=attest, rung 3)",
    priority: "P1",
    matrix: true,
    owner: "T2",
    async run(t) {
      const P = { user: "jo", countsPolicy: "attest", c4Rmes: "complete" };
      await acceptPoint(t, P, "P3", "OPNT_R_SAF");
      await completeSafLane(t, { rung: 3 });
      await t.seeTestId("wb-submit-note", "the post-submit note (could not read with your access) shows");
      t.check("…as a note, not an error", /could not|not readable|your access/i.test(await t.text("wb-submit-note")), await t.text("wb-submit-note"));
    },
  },
  {
    id: "S13",
    title: "race=CIQ_Case_A00:1 on a lane save: re-applied, success",
    priority: "P1",
    owner: "T2",
    async run(t) {
      const { fx } = await laneOpen(t, { user: "jo", flowAdmin: "jo", race: "CIQ_Case_A00:1" });
      await signOff(t, "Approved");
      const b0 = await t.lastSeq();
      await t.click("wb-lane-save");
      await until(t, (c) => c.seq > b0 && c.command === "PROCESS_UPDATE_ITEM" && !c.note?.race, 8000);
      await t.wait(800);
      const ups = await t.calls(after(b0, "PROCESS_UPDATE_ITEM"));
      t.check("UPDATE_ITEM sent twice (the first answered 200 but was dropped)", ups.length === 2 && ups[0].note?.race === "keys", ups.map((c) => c.note));
      await t.noTestId("wb-write-notkept", "no \"not kept\" banner");
      await t.noTestId("wb-write-refused", "no error banner");
      t.check("the host has the values", item(await t.state(), fx.C4).fields.SAF_Review_Confirm === "Confirmed");
    },
  },
  {
    id: "S14",
    title: "race=CIQ_Case_A00:always: 4 UPDATE_ITEM then \"not kept\"",
    priority: "P1",
    owner: "T2",
    async run(t) {
      await laneOpen(t, { user: "jo", flowAdmin: "jo", race: "CIQ_Case_A00:always" });
      await signOff(t, "Approved");
      const b0 = await t.lastSeq();
      await t.click("wb-lane-save");
      await t.seeTestId("wb-write-notkept", "a \"not kept\" banner", 12000);
      t.check("the banner names the fields", /SAF|Review|Completed/i.test(await t.text("wb-write-notkept")), await t.text("wb-write-notkept"));
      t.check("exactly 4 UPDATE_ITEM (1 write + 3 re-applies)", (await t.calls(after(b0, "PROCESS_UPDATE_ITEM"))).length === 4);
      t.check("no submit", (await t.calls(after(b0, "PROCESS_SUBMIT_ITEM"))).length === 0);
    },
  },
  {
    id: "S15",
    title: "writeDelay=400: rapid double save, refresh, two notes — no overlap",
    priority: "P1",
    owner: "T2",
    async run(t) {
      await laneOpen(t, { user: "jo", flowAdmin: "jo", writeDelay: 400 });
      await signOff(t, "Approved");
      const b0 = await t.lastSeq();
      await t.byTestId("wb-lane-save").first().click();
      await t.byTestId("wb-lane-save").first().click({ timeout: 1500 }).catch(() => {}); // disabled while saving is fine
      await t.byTestId("wb-counts-refresh").first().click().catch(() => {});
      // two notes back to back: the second is typed as soon as the first add has cleared the input
      for (const n of ["First harness note.", "Second harness note."]) {
        const box = t.byTestId("wb-note-text").first();
        for (const end = Date.now() + 8000; Date.now() < end && (await box.inputValue().catch(() => "")); ) await t.wait(50);
        await box.fill(n);
        await t.byTestId("wb-note-add").first().click({ timeout: 8000 });
      }
      await t.wait(6000);
      const ov = await t.page.evaluate(() => window.__kfOverlaps);
      t.check("__kfOverlaps empty", ov.length === 0, ov);
      const f7 = await t.calls((c) => c.seq > b0 && c.flowId === "CIQ_Internal_Note_A00" && /DATAFORM_(CREATE|DISCARD|SUBMIT)_ITEM/.test(c.command));
      const creates = f7.filter((c) => c.command === "DATAFORM_CREATE_ITEM");
      t.check("two F7 creates", creates.length === 2, f7.map((c) => c.command));
      t.check("each F7 create comes after a discard, and the second after the first's submit", f7.map((c) => c.command).join(",") === "DATAFORM_DISCARD_ITEM,DATAFORM_CREATE_ITEM,DATAFORM_SUBMIT_ITEM,DATAFORM_DISCARD_ITEM,DATAFORM_CREATE_ITEM,DATAFORM_SUBMIT_ITEM", f7.map((c) => c.command));
    },
  },
  {
    id: "S16",
    title: "kwb=refuse at CASE_B_REG (sam, flowAdmin=sam): fallback, reload restores, second save skips",
    priority: "P1",
    owner: "T2",
    async run(t) {
      const P = { user: "sam", flowAdmin: "sam", kwb: "refuse" };
      const { fx, act } = await laneOpen(t, P, "REG");
      t.expectRefusals("mode:kwb");
      await signOff(t, "Approved");
      const b0 = await t.lastSeq();
      await t.click("wb-lane-save");
      t.check("050313 on the save", (await until(t, after(b0, "PROCESS_UPDATE_ITEM", (c) => c.refused?.category === "mode:kwb"))).length === 1);
      await t.seeTestId("wb-kwb", "the KwbFallback panel");
      await t.seeTestId("wb-kwb-mytasks", "the My Tasks instruction before any click");
      const sheet = await t.text("wb-kwb-sheet");
      t.check("no computed field in the sheet", !/REG_Gate|REG gate/i.test(sheet), sheet.slice(0, 300));
      await t.click("wb-kwb-openform");
      const of = (await until(t, (c) => c.command === "PROCESS_OPEN_FORM"))[0];
      t.check("PROCESS_OPEN_FORM with the right _id and act", of?.instanceId === fx.C4 && of?.activityInstanceId === act);
      // a second save at the same step goes straight to the fallback: the step is marked kwb:refused for this page
      // session (WB-9; data/session.ts keeps the mark in memory, so a reload clears it)
      await signOff(t, "Approved", { onBehalfOf: "Harness colleague" });
      const b1 = await t.lastSeq();
      await t.click("wb-lane-save");
      await t.seeTestId("wb-kwb", "the second save opens the fallback");
      await t.wait(800);
      t.check("a second save at the same step skips UPDATE_ITEM", (await t.calls(after(b1, "PROCESS_UPDATE_ITEM"))).length === 0);
      // reload: the sheet is restored from sessionStorage (same tab, same UI origin)
      await t.host(P, `/review/lane/${fx.C4}/${act}`);
      t.expectRefusals("mode:kwb");
      await t.seeTestId("wb-kwb", "after a reload the sheet is restored from sessionStorage", 10000);
      const stored = await t.frame().evaluate((k) => sessionStorage.getItem(k), `wb:pending:${fx.C4}|${act}`);
      await t.host$("nativeSave", fx.C4, act, sheetToNative(JSON.parse(stored ?? "{}")));
      await t.click("wb-kwb-reread");
      let cleared = false;
      for (const end = Date.now() + 6000; Date.now() < end && !cleared; await t.wait(150)) cleared = (await t.frame().evaluate((k) => sessionStorage.getItem(k), `wb:pending:${fx.C4}|${act}`)) === null;
      t.check("Re-read passes after the native save", cleared);
      const f = item(await t.state(), fx.C4).fields;
      t.check("host: the REG sign-off values are there (no data loss)", f.REG_Review_Confirm === "Confirmed" && f.REG_On_Behalf_Of === "Harness colleague", [f.REG_Review_Confirm, f.REG_On_Behalf_Of]);
    },
  },
  {
    id: "S17",
    title: "Return with sendback=ok and progress=on",
    priority: "P1",
    owner: "T2",
    async run(t) {
      const { fx, act } = await pointOpen(t, { user: "sam", sendback: "ok", progress: 1 }, "P2", "OPNT_R_REG", "wb-point-return");
      const b0 = await t.lastSeq();
      await doReturn(t);
      const sb = (await until(t, after(b0, "PROCESS_SENDBACK_ITEM"), 10000))[0];
      const up = (await t.calls(after(b0, "PROCESS_UPDATE_ITEM", (c) => !c.refused)))[0];
      const rounds = up?.data?.["Table::Rounds"] ?? [];
      t.check("Rounds row \"Returned\" for round 1", rounds.some((r) => r.Rounds_Outcome === "Returned" && r.Rounds_Round_No === 1), rounds);
      t.check("Round_No 2 and Query_Key …|R2", up?.data?.Round_No === 2 && String(up?.data?.Query_Key).endsWith("|R2"), up?.data && [up.data.Round_No, up.data.Query_Key]);
      t.check("Response_* cleared and Awaiting_Response = Yes", up && ["Response_Kind", "Response_Text", "Response_Doc_Refs_JSON"].every((k) => k in up.data && (up.data[k] === "" || up.data[k] === null)) && up.data.Awaiting_Response === "Yes", up?.data);
      t.check("OP_Outcome untouched", up && !("OP_Outcome" in up.data));
      t.check("PROCESS_SENDBACK_ITEM with the OPNT_S1 activity id, after the verified write", sb && sb.stepId === S1_ACTIVITY && sb.activityInstanceId === act && sb.seq > up.seq, sb);
      t.check("host: the point is back at S1", JSON.stringify(openSteps(await t.state(), fx.P2)) === '["OPNT_S1"]');
    },
  },
  {
    id: "S18a",
    title: "Return with sendback=500 (sam, rung 3): fallback with \"already saved\"",
    priority: "P1",
    owner: "T2",
    async run(t) {
      const { fx, act } = await pointOpen(t, { user: "sam", sendback: "500" }, "P2", "OPNT_R_REG", "wb-point-return");
      t.expectRefusals("mode:sendback");
      const b0 = await t.lastSeq();
      await doReturn(t);
      t.check("the new round was saved and verified first", (await until(t, after(b0, "PROCESS_UPDATE_ITEM", (c) => !c.refused))).length > 0);
      await t.seeTestId("wb-kwb", "the fallback shows");
      await t.see("already saved", "the fallback says the new round is already saved");
      await t.click("wb-kwb-openform");
      t.check("click → PROCESS_OPEN_FORM", (await until(t, (c) => c.command === "PROCESS_OPEN_FORM")).length === 1);
      await t.host$("nativeSendBack", fx.P2, act, "Waiting for supplier");
      await t.click("wb-kwb-reread");
      await t.see("Sent back in Kissflow", "Re-read answers moved out → \"sent back in Kissflow\" note", 6000);
      t.check("host: the point is at S1", JSON.stringify(openSteps(await t.state(), fx.P2)) === '["OPNT_S1"]');
    },
  },
  {
    id: "S18b",
    title: "Return with kwb=refuse: round values + header values, no \"already saved\"",
    priority: "P1",
    owner: "T2",
    async run(t) {
      const { fx, act } = await pointOpen(t, { user: "sam", kwb: "refuse" }, "P2", "OPNT_R_REG", "wb-point-return");
      t.expectRefusals("mode:kwb");
      const b0 = await t.lastSeq();
      await doReturn(t);
      await t.seeTestId("wb-kwb", "the fallback shows");
      const sheet = await t.text("wb-kwb-sheet");
      t.check("the sheet lists the Rounds row values and the header values", /Returned/.test(sheet) && /Round|Query/i.test(sheet), sheet.slice(0, 400));
      await t.notSee("already saved", "\"already saved\" is absent");
      t.check("no PROCESS_SENDBACK_ITEM", (await t.calls(after(b0, "PROCESS_SENDBACK_ITEM"))).length === 0);
      const stored = JSON.parse((await t.frame().evaluate((k) => sessionStorage.getItem(k), `wb:pending:${fx.P2}|${act}`)) ?? "{}");
      await t.host$("nativeSave", fx.P2, act, sheetToNative(stored));
      await t.host$("nativeSendBack", fx.P2, act, "Waiting for supplier");
      await t.click("wb-kwb-reread");
      await t.wait(2500);
      t.check("Re-read passes (moved out = sent back in Kissflow)", /Sent back in Kissflow|saved/i.test(await t.ui.locator("body").innerText()), "");
      const p = item(await t.state(), fx.P2);
      t.check("host: round 2 at S1, round 1 Returned", p.fields.Round_No === 2 && JSON.stringify(openSteps(await t.state(), fx.P2)) === '["OPNT_S1"]', [p.fields.Round_No, openSteps(await t.state(), fx.P2)]);
    },
  },
  {
    id: "S19",
    title: "Return with progress=off: target step unknown",
    priority: "P2",
    owner: "T2",
    async run(t) {
      const { fx, act } = await pointOpen(t, { user: "sam", progress: 0 }, "P2", "OPNT_R_REG", "wb-point-return");
      const b0 = await t.lastSeq();
      await doReturn(t);
      if (READBACK_IDS) {
        // the read-back OPNT_S1 id is known without getProgress: the send-back goes out with it
        const sb = (await until(t, after(b0, "PROCESS_SENDBACK_ITEM"), 10000))[0];
        t.check("read-back ids: PROCESS_SENDBACK_ITEM with the read-back OPNT_S1 id, no getProgress needed", sb && sb.stepId === S1_ACTIVITY && sb.activityInstanceId === act && !sb.refused, sb);
        await t.noTestId("wb-kwb", "read-back ids: no fallback");
        t.check("host: the point is back at S1", JSON.stringify(openSteps(await t.state(), fx.P2)) === '["OPNT_S1"]');
      } else {
        await t.seeTestId("wb-kwb", "straight to the fallback");
        await t.see("target step unknown", "\"target step unknown\"", 4000);
        t.check("no SENDBACK", (await t.calls(after(b0, "PROCESS_SENDBACK_ITEM"))).length === 0);
      }
    },
  },
  {
    id: "S20",
    title: "Accept a point (jo, P3)",
    priority: "P1",
    matrix: true,
    owner: "T2",
    async run(t) {
      const { fx } = await acceptPoint(t, { user: "jo" }, "P3", "OPNT_R_SAF");
      const p = item(await t.state(), fx.P3);
      const rounds = p.fields["Table::Rounds"] ?? [];
      t.check("a Rounds row \"Accepted\"", rounds.some((r) => r.Rounds_Outcome === "Accepted"), rounds);
      t.check("OP_Outcome Accepted, Reviewed_By/_Email/_At set", p.fields.OP_Outcome === "Accepted" && p.fields.Reviewed_By && p.fields.Reviewed_By_Email === "jo@example.test" && noMs(p.fields.Reviewed_At) && p.fields.Reviewed_At);
      t.check("host: Completed, Open_Num = 0", p.status === "Completed" && p.fields.Open_Num === 0);
    },
  },
  {
    id: "S21",
    title: "OPNT_S1 manual response, withdraw at S1, then confirm withdrawal (P1, P6)",
    priority: "P1",
    matrix: true,
    owner: "T2",
    async run(t) {
      // a) response at S1 → R_<OP_Dept>
      let o = await pointOpen(t, { user: "alex" }, "P1", "OPNT_S1", "wb-point-s1");
      await t.select("wb-point-response-kind-input", "Answer");
      await t.byTestId("wb-point-response-text").fill("The study is attached (harness).");
      await actAndSubmit(t, "wb-point-manual-response", { flow: OP, label: "manual response", task: { id: o.fx.P1, act: o.act }, afterKwb: "wb-point-submit-after-kwb" });
      t.check("the response routes to R_SAF", JSON.stringify(openSteps(await t.state(), o.fx.P1)) === '["OPNT_R_SAF"]');
      // b) withdraw at S1 (fresh host): "Withdrawn by Beiersdorf" + OP_Outcome Withdrawn → still routes to R_SAF
      o = await pointOpen(t, { user: "alex" }, "P1", "OPNT_S1", "wb-point-s1");
      await t.ui.getByRole("tab", { name: /withdraw/i }).first().click().catch(async () => t.ui.getByRole("button", { name: /withdraw/i }).first().click());
      await t.byTestId("wb-point-withdraw-reason").first().fill("Asked by mistake (harness).");
      await actAndSubmit(t, "wb-point-withdraw", { flow: OP, label: "withdraw at S1", task: { id: o.fx.P1, act: o.act }, afterKwb: "wb-point-submit-after-kwb" });
      const p1 = item(await t.state(), o.fx.P1).fields;
      t.check("withdraw writes \"Withdrawn by Beiersdorf\" and OP_Outcome Withdrawn", p1.Response_Kind === "Withdrawn by Beiersdorf" && p1.OP_Outcome === "Withdrawn", [p1.Response_Kind, p1.OP_Outcome]);
      // c) at R_SAF (P6, already withdrawn) only Confirm withdrawal is offered
      o = await pointOpen(t, { user: "jo" }, "P6", "OPNT_R_SAF", "wb-point-confirm-withdrawal");
      await t.noTestId("wb-point-accept", "Accept is absent");
      await t.noTestId("wb-point-return", "Return is absent");
      await actAndSubmit(t, "wb-point-confirm-withdrawal", { flow: OP, label: "confirm withdrawal", task: { id: o.fx.P6, act: o.act }, afterKwb: "wb-point-submit-after-kwb" });
      const p6 = item(await t.state(), o.fx.P6);
      t.check("Reviewed_* set and a Rounds row (Withdrawn); Completed", p6.status === "Completed" && p6.fields.Reviewed_By_Email === "jo@example.test" && (p6.fields["Table::Rounds"] ?? []).some((r) => r.Rounds_Outcome === "Withdrawn"));
    },
  },
  {
    id: "S22",
    title: "raise a point with Supplier_Due_Date missing: Start_Gate blocks, fixed, submitted",
    priority: "P1",
    owner: "T2",
    async run(t) {
      const { fx } = await laneOpen(t, { user: "jo" });
      await t.click("wb-section-SAF-A-raise");
      await t.seeTestId("wb-point-raise", "the raise dialog opens");
      await t.select("wb-point-kind", "Query").catch(() => {});
      await t.byTestId("wb-point-question").fill("Please send the impurity certificate (harness).");
      await t.byTestId("wb-point-supplier-justification").fill("Needed for the safety assessment (harness).").catch(() => {});
      await t.byTestId("wb-point-internal-justification").fill("Lane blocker (harness).");
      await t.byTestId("wb-point-supplier-due").fill("").catch(() => {});
      const b0 = await t.lastSeq();
      await t.click("wb-point-raise-submit");
      await t.seeTestId("wb-point-startgate", "server Start_Gate blank → the submit is blocked, missing items listed", 10000);
      t.check("a create happened, no submit", (await t.calls(after(b0, "PROCESS_CREATE_ITEM"))).length === 1 && (await t.calls(after(b0, "PROCESS_SUBMIT_ITEM", (c) => c.flowId === OP))).length === 0);
      t.check("no input for Start_Gate", (await t.byTestId("wb-field-Start_Gate").count()) === 0);
      await t.byTestId("wb-point-supplier-due").fill("2026-10-30");
      await t.click("wb-point-raise-submit");
      const sub = (await until(t, after(b0, "PROCESS_SUBMIT_ITEM", (c) => c.flowId === OP && !c.refused), 10000))[0];
      t.check("fixed → submitted → at S1", sub && JSON.stringify(openSteps(await t.state(), sub.instanceId)) === '["OPNT_S1"]');
      void fx;
    },
  },
  {
    id: "S28",
    title: "CR assessment (sam, CR2): REG assessed, SAF branch stays open",
    priority: "P2",
    matrix: true,
    owner: "T2",
    async run(t) {
      await t.host({ user: "sam" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      const act = actAt(st, fx.CR2, "CHRQ_B_REG");
      await t.route(`/assess/${fx.CR2}/${act}`);
      await t.requireScreen("wb-assess", "T2");
      await t.select("wb-assess-assessment", "No impact confirmed");
      await t.byTestId("wb-assess-note").first().fill("No regulatory impact (harness).").catch(() => {});
      await actAndSubmit(t, "wb-assess-submit", { flow: CR, label: "assess REG", task: { id: fx.CR2, act }, afterKwb: "wb-assess-submit-after-kwb" });
      const st2 = await t.state();
      const f = item(st2, fx.CR2).fields;
      t.check("REG_Assessment + by/at written", f.REG_Assessment === "No impact confirmed" && f.REG_Assessed_By && f.REG_Assessed_At && noMs(f.REG_Assessed_At));
      t.check("the SAF branch stays open", JSON.stringify(openSteps(st2, fx.CR2)) === '["CHRQ_B_SAF"]', openSteps(st2, fx.CR2));
    },
  },
  {
    id: "S29",
    title: "RMES sheet (jo, C4): lock, two-phase save, route guard for sam, no link for wren",
    priority: "P1",
    owner: "T2",
    async run(t) {
      await t.host({ user: "wren" }, "/");
      await t.seeTestId("wb-nav", "wren: the shell is live");
      await t.noTestId("wb-nav-rmes", "wren: no RMES link in the nav");
      const wm = await t.lastSeq();
      await t.route("/rmes");
      await t.seeTestId("wb-rmes-denied", "wren: the RMES route says \"Not available for your role\"");
      await t.wait(800);
      t.check("wren: no RMES read on the route", (await t.calls((c) => c.seq > wm && /RMES/.test(String(c.flowId)))).length === 0);
      await t.host({ user: "sam" }, "/");
      const fx = await t.fixtures();
      const m = await t.lastSeq();
      await t.route(`/rmes/${fx.C4}?dept=SAF`);
      await t.requireScreen("wb-rmes-denied", "T2");
      await t.wait(800);
      t.check("sam: no SAF RMES read on the route", (await t.calls((c) => c.seq > m && c.flowId === "CIQ_RMES_Safety_A00")).length === 0);
      // jo: lock written on open; criteria saved through Table:: (phase 1), header counts from the read-back (phase 2)
      await t.host({ user: "jo" }, `/rmes/${fx.C4}?dept=SAF`);
      await t.requireScreen("wb-rmes", "T2");
      const lock = (await until(t, (c) => c.command === "DATAFORM_UPDATE_ITEM" && c.flowId === "CIQ_RMES_Safety_A00" && c.data && "Editing_By" in c.data, 8000))[0];
      t.check("the soft lock is written on opening (Editing_By, Editing_Since without ms)", lock && /Jo Weber/.test(String(lock.data.Editing_By)) && noMs(lock.data.Editing_Since), lock?.data);
      await t.select(t.byTestId("wb-rmes-criterion-SAF-B1").getByRole("combobox", { name: "Result" }), "Available");
      await t.byTestId("wb-rmes-finding-add").first().click();
      await t.byTestId("wb-rmes-finding-text").last().fill("Sensitisation study is for an older grade (harness).");
      await t.select(t.byTestId("wb-rmes-finding-new").last().getByRole("combobox", { name: "Criterion" }), "SAF-B1").catch(() => {});
      const b0 = await t.lastSeq();
      await t.click("wb-rmes-save");
      await until(t, after(b0, "DATAFORM_UPDATE_ITEM", (c) => c.data && "Open_Criteria_Count" in c.data), 10000);
      const ups = await t.calls(after(b0, "DATAFORM_UPDATE_ITEM", (c) => c.flowId === "CIQ_RMES_Safety_A00"));
      const p1 = ups.find((c) => c.data && ("Table::Safety_Criteria" in c.data || "Table::Safety_Findings" in c.data));
      const p2 = ups.find((c) => c.data && "Open_Criteria_Count" in c.data);
      t.check("phase 1: criteria and findings through Table:: (no header counts in it)", p1 && !("Open_Criteria_Count" in p1.data), p1 && Object.keys(p1.data));
      t.check("phase 2: the header counts after it, from the read-back", p1 && p2 && p2.seq > p1.seq, ups.map((c) => Object.keys(c.data ?? {})));
      const row = (await t.state()).rows.find((r) => r.id === fx.RMES_C4_SAF);
      t.check("host: Open_Criteria_Count = the sum of the read-back Criteria_Open_Num (blank counts 1)", row.fields.Open_Criteria_Count === (row.fields["Table::Safety_Criteria"] ?? []).reduce((n, r) => n + (r.Criteria_Open_Num ?? 1), 0), row.fields.Open_Criteria_Count);
      t.check("host: the finding was added", (row.fields["Table::Safety_Findings"] ?? []).some((f) => /older grade/.test(f.Findings_Text)));
    },
  },
  {
    id: "S35",
    title: "resolver in Part 2 (C4): block/off, first/on, jo block-unique with kwb=refuse",
    priority: "P1",
    owner: "T2",
    async run(t) {
      await t.host({ user: "dev", stepkey: "block", progress: 0 }, "/diagnostics");
      await t.seeTestId("wb-diag");
      await diagSettled(t);
      await t.wait(1000);
      const st = await t.state();
      const fx = await t.fixtures();
      const code = item(st, fx.C4).fields.Case_Code;
      const stepsTable = () => t.ui.getByRole("table").filter({ hasText: "Held tasks (evidence)" }).first();
      const unresolved = await t.ui.getByText("Unidentified steps:", { exact: false }).first().innerText().catch(() => "");
      if (READBACK_IDS) {
        // rung 1: the activity filter decides each branch, whatever the row's step key says
        t.check("dev/block/off, read-back ids: none of C4's branch tasks is unidentified", !unresolved.includes(code), unresolved.slice(0, 300));
        for (const s of ["CASE_B_REG", "CASE_B_SAF", "CASE_B_QM"]) {
          const row = await stepsTable().locator("tr", { hasText: s }).first().innerText().catch(() => "");
          t.check(`dev/block/off, read-back ids: C4 resolves to ${s} by the activity filter`, row.split(code).length - 1 === 1 && /\(activity\)/.test(row), row.slice(0, 160));
        }
      } else {
        t.check("dev/block/off: C4's 3 branch tasks are at an unidentified step", unresolved.split(code).length - 1 === 3, unresolved.slice(0, 300));
        for (const s of ["CASE_B_REG", "CASE_B_SAF", "CASE_B_QM"]) {
          const row = await stepsTable().locator("tr", { hasText: s }).first().innerText().catch(() => "");
          t.check(`dev/block/off: no task marked at ${s}`, !row.includes(code), row.slice(0, 160));
        }
      }
      t.check("dev/block/off: nothing written", (await t.calls(isWrite)).length === 0);
      await t.shot("block-off");
      await t.host({ user: "dev", stepkey: "first", progress: 1 }, "/diagnostics");
      await diagSettled(t);
      await t.wait(1000);
      for (const s of ["CASE_B_REG", "CASE_B_SAF", "CASE_B_QM"]) {
        const row = await stepsTable().locator("tr", { hasText: s }).first().innerText().catch(() => "");
        t.check(`dev/first/on: C4 resolves to ${s} by activity`, row.includes(code) && /\(activity\)/.test(row), row.slice(0, 160));
      }
      // jo, stepkey=block, kwb=refuse; progress=0 so the resolver cannot use activity evidence first
      // dev=1: Diagnostics is builder-only now (review fix F-02); jo's builder signal is the getRoles answer
      await t.host({ user: "jo", dev: 1, stepkey: "block", kwb: "refuse", progress: 0 }, "/diagnostics");
      await diagSettled(t);
      await t.wait(1000);
      const saf = await stepsTable().locator("tr", { hasText: "CASE_B_SAF" }).first().innerText().catch(() => "");
      if (READBACK_IDS) t.check("jo/block, read-back ids: the single task resolves to SAF by the activity filter", saf.includes(code) && /\(activity\)/.test(saf), saf.slice(0, 160));
      else t.check("jo/block: the single task resolves to SAF (block-unique)", saf.includes(code) && /\(block-unique\)/.test(saf), saf.slice(0, 160));
      await t.route(`/review/lane/${fx.C4}/${actAt(await t.state(), fx.C4, "CASE_B_SAF")}`);
      await t.requireScreen("wb-lane", "T2");
      t.expectRefusals("mode:kwb");
      await signOff(t, "Approved");
      await t.click("wb-lane-save");
      await t.seeTestId("wb-kwb", "the 050313 opens the fallback");
      await t.route("/diagnostics");
      await diagSettled(t);
      const kwb = await stepsTable().innerText().catch(() => "");
      const rowOf = (s) => kwb.split("\n").find((l) => l.startsWith(s)) ?? "";
      t.check("jo: the 050313 marks only SAF kwb:refused", /refused/.test(rowOf("CASE_B_SAF")) && !/refused/.test(rowOf("CASE_B_REG")) && !/refused/.test(rowOf("CASE_B_QM")), [rowOf("CASE_B_SAF"), rowOf("CASE_B_REG"), rowOf("CASE_B_QM")]);
    },
  },
  {
    id: "S36",
    title: "OPNT_S1 held by a reviewer (kfa=on, jo)",
    priority: "P1",
    matrix: true,
    owner: "T2",
    async run(t) {
      await laneOpen(t, { user: "jo", kfa: 1 });
      await t.click("wb-section-SAF-A-raise");
      await t.seeTestId("wb-point-raise", "the raise dialog opens");
      const kinds = await t.options("wb-point-kind").catch(() => []);
      t.check("no \"Additional part\" kind for a reviewer", kinds.length > 0 && !kinds.includes("Additional part"), kinds);
      await t.select("wb-point-kind", "Query").catch(() => {});
      await t.byTestId("wb-point-question").fill("Please confirm the solvent residues (harness).");
      await t.byTestId("wb-point-supplier-justification").fill("Needed for SAF-A (harness).").catch(() => {});
      await t.byTestId("wb-point-internal-justification").fill("SAF lane (harness).");
      await t.byTestId("wb-point-supplier-due").fill("2026-10-29");
      const b0 = await t.lastSeq();
      await t.click("wb-point-raise-submit");
      const sub = (await until(t, after(b0, "PROCESS_SUBMIT_ITEM", (c) => c.flowId === OP && !c.refused), 12000))[0];
      t.check("the point is raised", !!sub);
      if (!sub) return;
      const st = await t.state();
      const s1 = item(st, sub.instanceId).acts.find((a) => a.open && a.step === "OPNT_S1");
      t.check("K-FA: the host assigns OPNT_S1 to jo (Responsible_User)", s1?.assignee?.userId === "UsJo0001", s1?.assignee);
      await t.route("/review");
      await t.requireScreen("wb-review", "T2");
      await t.byTestId("wb-review-tab-supplier").first().click();
      await t.seeTestId(`wb-review-row-${sub.instanceId}-${s1.act}`, "jo's Review queue lists it under \"Record supplier response (manual)\"");
      const rowText = await t.byTestId(`wb-review-row-${sub.instanceId}-${s1.act}`).first().locator("xpath=ancestor::tr[1]").innerText().catch(() => "");
      t.check("…with the point's Supplier_Due_Date", /2026-10-29|29 Oct|Oct 29|29\.10\./.test(rowText), rowText.replace(/\s+/g, " ").slice(0, 200));
      await t.route(`/points/${sub.instanceId}?task=${s1.act}`);
      await t.requireScreen("wb-point-s1", "T2");
      await t.select("wb-point-response-kind-input", "Answer");
      await t.byTestId("wb-point-response-text").fill("Residues below the limit (harness).");
      await actAndSubmit(t, "wb-point-manual-response", { flow: OP, label: "jo records the response", task: { id: sub.instanceId, act: s1.act }, afterKwb: "wb-point-submit-after-kwb" });
      t.check("→ R_SAF", JSON.stringify(openSteps(await t.state(), sub.instanceId)) === '["OPNT_R_SAF"]');
    },
  },
  {
    id: "S37",
    title: "openForm=hang, then openForm=refuse (kwb=refuse)",
    priority: "P1",
    owner: "T2",
    async run(t) {
      for (const mode of ["hang", "refuse"]) {
        await laneOpen(t, { user: "jo", flowAdmin: "jo", kwb: "refuse", openForm: mode });
        t.expectRefusals("mode:kwb", "mode:openForm");
        await signOff(t, "Approved");
        await t.click("wb-lane-save");
        await t.seeTestId("wb-kwb-sheet", `${mode}: the sheet shows before the click`);
        await t.seeTestId("wb-kwb-mytasks", `${mode}: the My Tasks instruction shows before the click`);
        const t0 = Date.now();
        await t.click("wb-kwb-openform");
        await t.seeTestId("wb-kwb-openform-note", `${mode}: a note appears`, mode === "hang" ? 12000 : 3000);
        const dt = Date.now() - t0;
        t.check(`${mode}: the note timing (hang ≈ 8 s, refuse at once)`, mode === "hang" ? dt >= 7000 && dt < 12000 : dt < 3000, dt);
        await t.seeTestId("wb-kwb-sheet", `${mode}: the sheet never disappears`);
        t.check(`${mode}: the page stays usable (nav works)`, await t.byTestId("wb-nav-review").first().isEnabled().catch(() => false));
      }
    },
  },
  {
    id: "S41",
    title: "write timeout (writeDelay=31000, once): uncertain, no second UPDATE_ITEM, Re-read clears",
    priority: "P1",
    owner: "T2",
    async run(t) {
      const { fx } = await laneOpen(t, { user: "jo", flowAdmin: "jo", writeDelay: 31000, writeDelayOnce: 1 });
      await signOff(t, "Approved");
      const b0 = await t.lastSeq();
      await t.click("wb-lane-save");
      await t.seeTestId("wb-write-timeout", "the timeout message (item uncertain)", 40000);
      await t.click("wb-lane-save").catch(() => {});
      await t.wait(1500);
      t.check("a second save sends no second UPDATE_ITEM", (await t.calls(after(b0, "PROCESS_UPDATE_ITEM"))).length === 1);
      await t.click("wb-reread-uncertain");
      await t.wait(2500);
      t.check("Re-read shows what landed and clears the mark", (await t.byTestId("wb-write-timeout").count()) === 0 || /landed|saved/i.test(await t.ui.locator("body").innerText()));
      t.check("the write landed in the host", item(await t.state(), fx.C4).fields.SAF_Review_Confirm === "Confirmed");
      t.check("__kfOverlaps empty", (await t.page.evaluate(() => window.__kfOverlaps)).length === 0);
    },
  },
  {
    id: "S42",
    title: "childIds=server: Return and RMES save with a forced re-apply create no duplicate rows",
    priority: "P1",
    owner: "T2",
    async run(t) {
      const { fx } = await pointOpen(t, { user: "sam", childIds: "server", race: "child:1" }, "P2", "OPNT_R_REG", "wb-point-return");
      const b0 = await t.lastSeq();
      await doReturn(t);
      await until(t, after(b0, "PROCESS_SENDBACK_ITEM"), 10000);
      const ups = await t.calls(after(b0, "PROCESS_UPDATE_ITEM"));
      t.check("the Rounds add was dropped once and re-applied", ups.length >= 2 && ups[0].note?.race === "adds", ups.map((c) => c.note));
      const rounds = item(await t.state(), fx.P2).fields["Table::Rounds"] ?? [];
      t.check("no duplicate Rounds row (natural key match)", rounds.filter((r) => r.Rounds_Round_No === 1 && r.Rounds_Outcome === "Returned").length === 1, rounds);
      // an RMES criteria save with one forced re-apply (the first update is dropped), rows with server ids
      // (race=child:1: the first update carrying a child-row ADD drops it; the soft-lock write on opening carries none)
      await t.host({ user: "jo", childIds: "server", race: "child:1" }, `/rmes/${fx.C4}?dept=SAF`);
      await t.requireScreen("wb-rmes", "T2");
      await t.select(t.byTestId("wb-rmes-criterion-SAF-B1").getByRole("combobox", { name: "Result" }), "Available");
      await t.byTestId("wb-rmes-finding-add").first().click();
      await t.byTestId("wb-rmes-finding-text").last().fill("A finding to re-apply (harness).");
      await t.select(t.byTestId("wb-rmes-finding-new").last().getByRole("combobox", { name: "Criterion" }), "SAF-B1");
      const c0 = await t.lastSeq();
      await t.click("wb-rmes-save");
      await until(t, (c) => c.seq > c0 && c.command === "DATAFORM_UPDATE_ITEM" && c.data && "Open_Criteria_Count" in c.data, 10000);
      const rups = await t.calls(after(c0, "DATAFORM_UPDATE_ITEM"));
      t.check("RMES: the finding add was dropped once and re-applied", rups[0]?.note?.race === "adds" && rups.length >= 3, rups.map((c) => c.note?.race ?? Object.keys(c.data ?? {}).join("+")));
      let row = (await t.state()).rows.find((r) => r.id === fx.RMES_C4_SAF);
      t.check("RMES: 6 criteria rows, no duplicate", (row.fields["Table::Safety_Criteria"] ?? []).length === 6);
      t.check("RMES: no duplicate finding row (criterion + text natural key)", (row.fields["Table::Safety_Findings"] ?? []).filter((f) => /re-apply/.test(f.Findings_Text)).length === 1, (row.fields["Table::Safety_Findings"] ?? []).length);
      // beyond §11.4: a finding WITHOUT a criterion code has no natural key (domain/keys.ts naturalKeyOf → null), so
      // with server row ids every verify pass re-adds it (CHANGE-REQUESTS.md CR-T4-harness-1)
      await t.host({ user: "jo", childIds: "server" }, `/rmes/${fx.C4}?dept=SAF`);
      await t.requireScreen("wb-rmes", "T2");
      await t.byTestId("wb-rmes-finding-add").first().click();
      await t.byTestId("wb-rmes-finding-text").last().fill("A finding without a criterion (harness).");
      const d0 = await t.lastSeq();
      await t.click("wb-rmes-save");
      await until(t, (c) => c.seq > d0 && c.command === "DATAFORM_UPDATE_ITEM" && c.data && "Open_Criteria_Count" in c.data, 10000);
      await t.wait(1000);
      row = (await t.state()).rows.find((r) => r.id === fx.RMES_C4_SAF);
      t.check("(beyond §11.4, CR-T4-harness-1) a finding without a criterion code is not duplicated under server row ids", (row.fields["Table::Safety_Findings"] ?? []).filter((f) => /without a criterion/.test(f.Findings_Text)).length === 1, (row.fields["Table::Safety_Findings"] ?? []).filter((f) => /without a criterion/.test(f.Findings_Text)).length);
    },
  },
  {
    id: "S43",
    title: "childFormula=off (jo, C4): blank Criteria_Open_Num counts as open",
    priority: "P1",
    owner: "T2",
    async run(t) {
      await t.host({ user: "jo", childFormula: 0 }, "/");
      const fx = await t.fixtures();
      await t.route(`/rmes/${fx.C4}?dept=SAF`);
      await t.requireScreen("wb-rmes", "T2");
      const b0 = await t.lastSeq();
      await t.click("wb-rmes-save");
      const p2 = (await until(t, after(b0, "DATAFORM_UPDATE_ITEM", (c) => c.data && "Open_Criteria_Count" in c.data), 10000))[0];
      t.check("Open_Criteria_Count counts every applicable row with a blank Criteria_Open_Num (6)", p2?.data?.Open_Criteria_Count === 6, p2?.data);
      await t.seeTestId("wb-rmes-warnings", "the \"counted as open\" warning shows");
      const { act } = await laneOpen(t, { user: "jo", flowAdmin: "jo", childFormula: 0 });
      await kwbSave(t, "wb-counts-refresh", "refresh counts", { id: fx.C4, act });
      t.check("the SAF gate cannot pass (RMES gaps > 0)", item(await t.state(), fx.C4).fields.SAF_Gate === "");
    },
  },

  // ======================================================== T3 (approver, admin, masters, reader)
  {
    id: "S25a",
    title: "approver (wren, C6): read-only RMES summary, Approved disabled, rejection with a reason",
    priority: "P1",
    matrix: true,
    owner: "T3",
    async run(t) {
      await t.host({ user: "wren" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      const act = actAt(st, fx.C6, "CASE_S6");
      await t.route(`/approvals/${fx.C6}/${act}`);
      await t.requireScreen("wb-approval", "T3");
      await t.seeTestId("wb-approval-rmes-SAF", "the RMES summary is shown");
      t.check("the RMES summary has no input", (await t.byTestId("wb-approval-rmes-SAF").locator("input,textarea,[role=combobox]").count()) === 0);
      t.check("\"Approved\" is disabled (SAF RMES decision Rejected)", await t.byTestId("wb-approval-approve").first().isDisabled().catch(() => false));
      const b0 = await t.lastSeq();
      await t.click("wb-approval-reject");
      await t.byTestId("wb-approval-submit").first().click().catch(() => {});
      await t.wait(800);
      t.check("Rejected without a reason is blocked", (await t.calls(after(b0, "PROCESS_SUBMIT_ITEM"))).length === 0);
      await t.byTestId("wb-approval-reason").first().fill("Genotoxicity data missing (harness).");
      await actAndSubmit(t, "wb-approval-submit", { flow: CASE, label: "overall rejection", task: { id: fx.C6, act }, afterKwb: "wb-approval-submit" });
      const st2 = await t.state();
      t.check("Completion_Trigger = Overall rejection; the host skips S7", item(st2, fx.C6).fields.Completion_Trigger === "Overall rejection" && !openSteps(st2, fx.C6).includes("CASE_S7"), [item(st2, fx.C6).fields.Completion_Trigger, openSteps(st2, fx.C6)]);
      t.check("no write to F5/F6 and no Editing_By", (await t.calls((c) => isWrite(c) && /RMES/.test(String(c.flowId)))).length === 0);
    },
  },
  {
    id: "S25b",
    title: "effective decision from P7 (wren, flowAdmin=wren); without flowAdmin Approved stays disabled",
    priority: "P1",
    matrix: true,
    owner: "T3",
    async run(t) {
      await t.host({ user: "wren", flowAdmin: "wren" }, "/");
      const st = await t.state();
      const fx = await t.fixtures();
      const act = actAt(st, fx.C6, "CASE_S6");
      await t.route(`/approvals/${fx.C6}/${act}`);
      await t.requireScreen("wb-approval", "T3");
      await t.seeTestId("wb-approval-effective-SAF", "the SAF effective decision is shown");
      const eff = await t.text("wb-approval-effective-SAF");
      t.check("SAF effective decision Approved from P7 (source shown)", /Approved/.test(eff) && /late|department/i.test(eff + (await t.text("wb-approval-effective-source-SAF"))), eff);
      t.check("\"Approved\" enabled", !(await t.byTestId("wb-approval-approve").first().isDisabled().catch(() => true)));
      await t.click("wb-approval-approve");
      await actAndSubmit(t, "wb-approval-submit", { flow: CASE, label: "overall approval", task: { id: fx.C6, act }, afterKwb: "wb-approval-submit" });
      t.check("→ S7", openSteps(await t.state(), fx.C6).includes("CASE_S7"), openSteps(await t.state(), fx.C6));
      // without flowAdmin and with the default counts policy: Approved disabled, "could not be read"
      await t.host({ user: "wren" }, `/approvals/${fx.C6}/${act}`);
      await t.requireScreen("wb-approval", "T3");
      await t.wait(1500);
      t.check("rung 3: \"Approved\" disabled", await t.byTestId("wb-approval-approve").first().isDisabled().catch(() => false));
      await t.see("could not be read", "rung 3: the \"could not be read\" note");
      const why = await t.text("wb-approval-partial-why");
      t.check("rung 3: the approver is told Reject still works and who can help, with no internal name", /You can still Reject/.test(why) && /Case administrator/.test(why) && !/Thomas|counts policy/.test(why), why);
    },
  },
  {
    id: "S30",
    title: "config (robin): draft → publish → F8; Published read-only; retire = F8 then a state-only update",
    priority: "P2",
    owner: "T3",
    async run(t) {
      await t.host({ user: "robin" }, "/config");
      await t.requireScreen("wb-config", "T3");
      const fx = await t.fixtures();
      // a Published row is read-only; retire it: F8 config.retire first, then exactly { Config_State: "Retired" }
      await t.route(`/config/${fx.CFG_TEXTS}`);
      await t.requireScreen("wb-config-edit", "T3");
      await t.seeTestId("wb-config-readonly", "a Published row is read-only");
      const b0 = await t.lastSeq();
      await t.click("wb-config-retire");
      await t.byTestId("wb-confirm-reason").first().fill("Replaced by a newer text bundle (harness).").catch(() => {});
      await t.click("wb-confirm");
      const upd = (await until(t, after(b0, "DATAFORM_UPDATE_ITEM", (c) => c.flowId === "CIQ_Config_Version_A00"), 10000))[0];
      const f8 = (await t.calls(after(b0, "DATAFORM_SUBMIT_ITEM", (c) => c.flowId === F8)))[0];
      t.check("retire: the F8 config.retire row comes first", f8 && upd && f8.seq < upd.seq);
      t.check("retire: one update with exactly { Config_State: \"Retired\" }", upd && JSON.stringify(Object.keys(upd.data)) === '["Config_State"]' && upd.data.Config_State === "Retired", upd?.data);
      // draft → publish
      await t.route("/config/new?kind=Text%20bundle");
      await t.requireScreen("wb-config-edit", "T3");
      await t.byTestId("wb-config-name").first().fill("harness-texts").catch(() => {});
      await t.byTestId("wb-config-payload").first().fill(JSON.stringify({ texts: { "closing.neutral": "Thank you (harness)." } }));
      const b1 = await t.lastSeq();
      await t.click("wb-config-create");
      await until(t, after(b1, "DATAFORM_SUBMIT_ITEM", (c) => c.flowId === "CIQ_Config_Version_A00"), 10000);
      await t.click("wb-config-publish");
      const pub = (await until(t, after(b1, "DATAFORM_UPDATE_ITEM", (c) => c.flowId === "CIQ_Config_Version_A00" && c.data?.Config_State === "Published"), 10000))[0];
      t.check("publish: Config_State Published, Published_By/_At, Content_Hash", pub && pub.data.Published_By && pub.data.Published_At && pub.data.Content_Hash, pub?.data);
      await until(t, after(pub?.seq ?? b1, "DATAFORM_SUBMIT_ITEM", (c) => c.flowId === F8), 8000);
      const pubRows = (await t.state()).rows.filter((r) => r.flow === F8 && r.fields.Event_Category === "Configuration");
      t.check("publish: an F8 Configuration row", pubRows.some((r) => /publish/.test(String(r.fields.Action_Code))), pubRows.map((r) => r.fields.Action_Code));
      t.check("no delete command", (await t.calls((c) => /DELETE/.test(c.command))).length === 0);
    },
  },
  {
    id: "S31",
    title: "supplier contacts: RMM adds one (manual portal user id); robin read-only",
    priority: "P2",
    owner: "T3",
    async run(t) {
      await t.host({ user: "alex" }, "/suppliers");
      await t.requireScreen("wb-suppliers", "T3");
      const fx = await t.fixtures();
      await t.route(`/suppliers/${fx["SUP-LUM"]}`);
      await t.requireScreen("wb-supplier", "T3");
      await t.click("wb-supplier-contact-add");
      await t.byTestId("wb-contact-name").fill("Pia Holm");
      await t.byTestId("wb-contact-email").fill("pia.holm@example.test");
      await t.byTestId("wb-contact-portal-user-id").fill("UsPortalLum02");
      await t.see("manual", "the portal user id input is labelled manual");
      const b0 = await t.lastSeq();
      await t.click("wb-contact-save");
      const up = (await until(t, after(b0, "DATAFORM_UPDATE_ITEM", (c) => c.flowId === "CIQ_Supplier_A00"), 10000))[0];
      t.check("one row per save through Table::Contacts", up && Array.isArray(up.data["Table::Contacts"]) && up.data["Table::Contacts"].length === 1, up?.data);
      const lum = (await t.state()).rows.find((r) => r.id === fx["SUP-LUM"]);
      t.check("verified: the contact is stored with the typed portal user id", (lum.fields["Table::Contacts"] ?? []).some((c) => c.Contacts_Email === "pia.holm@example.test" && c.Contacts_Portal_User_Id === "UsPortalLum02"));
      await t.host({ user: "robin" }, `/suppliers/${fx["SUP-LUM"]}`);
      await t.requireScreen("wb-supplier", "T3");
      await t.seeTestId("wb-supplier-readonly", "robin sees the supplier read-only");
      await t.noTestId("wb-supplier-contact-add", "robin: no contact add");
    },
  },
  {
    id: "S32",
    title: "reader (max): cases via the F8 index, read-only case, audit log, notes only",
    priority: "P1",
    owner: "T3",
    async run(t) {
      await t.host({ user: "max", adminList: "refuse" }, "/cases");
      await t.seeTestId("wb-nav", "the shell is live for the Reader");
      t.check("nav group auditor", (await t.byTestId("wb-nav-group-auditor").count()) === 1);
      await t.requireScreen("wb-cases", "T1");
      await t.seeTestId("wb-readquality", "the read-quality banner explains the index-only list");
      const fx = await t.fixtures();
      await t.seeTestId(`wb-cases-row-${fx.C4}`, "cases found through the F8 \"Item created\" index");
      await t.route(`/cases/${fx.C4}`);
      await t.requireScreen("wb-case", "T1");
      t.check("the case is read-only (no step panel)", (await t.byTestId("wb-step-save").count()) === 0 && (await t.byTestId("wb-step-submit").count()) === 0);
      await t.route("/audit");
      await t.requireScreen("wb-audit", "T3");
      await t.wait(1500);
      t.check("the audit log lists F8 rows", Number((await t.text("wb-audit-count")).match(/\d+/)?.[0] ?? 0) > 0, await t.text("wb-audit-count"));
      await t.route(`/cases/${fx.C4}?tab=notes`);
      await t.byTestId("wb-case-tab-notes").first().click().catch(() => {});
      await t.requireScreen("wb-notes", "T3");
      const b0 = await t.lastSeq();
      await t.byTestId("wb-note-text").first().fill("Reader note (harness).");
      await t.click("wb-note-add");
      await until(t, after(b0, "DATAFORM_SUBMIT_ITEM", (c) => c.flowId === "CIQ_Internal_Note_A00"), 8000);
      const w = (await t.calls(isWrite)).filter((c) => c.flowId !== "CIQ_Internal_Note_A00");
      t.check("the only write allowed is adding a note", w.length === 0, w.map((c) => `${c.command} ${c.flowId}`));
    },
  },

  // ======================================================== T5 (prototype parity, 2026-10-09)
  {
    id: "S45",
    title: "role names before the live rename (roleNames=legacy): the same personas, landings and lens",
    priority: "P1",
    owner: "T5",
    async run(t) {
      // dev: AppRoles carry "CIQ RMM", "CIQ Reader", …; every one is matched (no unmatched name), the nav is the same
      await t.host({ user: "dev", roleNames: "legacy" }, "/diagnostics");
      await t.seeTestId("wb-diag", "Diagnostics renders");
      await diagSettled(t);
      const roles = await t.text("wb-diag-roles");
      t.check("the host answered the legacy names (AppRoles shows CIQ RMM and CIQ Reader)", roles.includes("CIQ RMM (") && roles.includes("CIQ Reader ("), roles.slice(0, 300));
      t.check("no unmatched role name", /Unmatched names\s*none/.test(roles), roles.match(/Unmatched names[^\n]*(\n[^\n]*)?/)?.[0]);
      t.check("matched under the prototype names (Raw Material Manager (RMM), Auditor, Business administrator)", ["Raw Material Manager (RMM)", "Auditor", "Business administrator"].every((n) => roles.includes(n)));
      for (const g of ["rmm", "reg", "cus", "approver", "admin", "auditor"]) t.check(`legacy names: nav group ${g}`, (await t.byTestId(`wb-nav-group-${g}`).count()) === 1);
      const opts = await t.options("wb-viewas");
      t.check("the View as dock offers the prototype names", opts.includes("Raw Material Manager (RMM)") && opts.includes("Auditor") && !opts.some((o) => /^CIQ /.test(o)), opts);
      // one user per legacy-named role: the right landing
      for (const [user, group, landing, testId] of [
        ["alex", "rmm", "#/rmm", "wb-dashboard"],
        ["jo", "saf", "#/review", "wb-nav-review"],
        ["wren", "approver", "#/approvals", "wb-nav-approvals"],
        ["robin", "admin", "#/admin/rules", "wb-admin-rules"],
        ["max", "auditor", "#/audit", "wb-audit"],
      ]) {
        await t.host({ user, roleNames: "legacy" }, "/");
        await t.seeTestId(testId, `${user} (legacy name): ${testId} shows`);
        t.check(`${user}: nav group ${group}, no no-access page`, (await t.byTestId(`wb-nav-group-${group}`).count()) === 1 && (await t.byTestId("wb-noaccess").count()) === 0);
        const h = await hashOf(t);
        t.check(`${user}: lands on ${landing}`, h === landing || h.startsWith(`${landing}?`), h);
      }
      await t.shot("legacy-robin");
      t.check("no write command", (await t.calls(isWrite)).length === 0);
    },
  },
  {
    id: "S46",
    title: "RMM dashboard (#/rmm): live counts from the host, RMM landing, Business owner read-only Operations",
    priority: "P1",
    owner: "T5",
    async run(t) {
      // dev holds RMM and is flow Admin (rung 1): the case list is complete, so the KPIs equal the host's numbers
      await t.host({ user: "dev" }, "/");
      await t.requireScreen("wb-dashboard", "T5");
      const h = await hashOf(t);
      t.check("dev (holds RMM): lands on #/rmm", h === "#/rmm", h);
      await t.seeTestId("wb-dash-kpis", "the KPI tiles render", 12000);
      await t.wait(1500);
      const f = caseFacts(await t.state());
      const k = await tiles(t, "wb-dash-kpis");
      t.check("6 KPI tiles", Object.keys(k).length === 6, Object.keys(k));
      t.check(`"Open cases" = the host's open cases (${f.open})`, k["Open cases"]?.value === String(f.open), k["Open cases"]);
      const ws = Number(k["With supplier"]?.value), wb = Number(k["With Beiersdorf"]?.value);
      t.check("With supplier + With Beiersdorf never exceed the open cases", ws + wb <= f.open, { ws, wb, open: f.open });
      t.check(
        `"Average lead time": ${f.released ? `over the ${f.released} released case(s)` : "— (none released)"}`,
        f.released ? new RegExp(`${f.released} case`).test(k["Average lead time"]?.hint ?? "") && /^\d/.test(k["Average lead time"]?.value ?? "") : k["Average lead time"]?.value === "—",
        k["Average lead time"],
      );
      const sub = await t.ui.locator('[data-testid="wb-dashboard"]').first().innerText();
      const owned = f.openOwnedBy("UsDev0001");
      t.check(`the greeting counts the dev's own open cases (${owned})`, new RegExp(`You own ${owned} open case`).test(sub), sub.slice(0, 200));
      await t.seeTestId("wb-dash-attention", "\"Needs your action\" renders");
      await t.seeTestId("wb-dash-bottleneck", "\"Where cases wait\" renders");
      await t.seeTestId("wb-dash-depts", "the department card renders");
      t.check("no prototype seed supplier on the page", !SEED_SUPPLIERS.some((n) => sub.includes(n)), SEED_SUPPLIERS.filter((n) => sub.includes(n)));
      await t.shot("dev-dashboard");
      // alex (RMM only): the RMM landing, "My cases" first, "New case" offered
      await t.host({ user: "alex" }, "/");
      await t.requireScreen("wb-dashboard", "T5");
      t.check("alex: lands on #/rmm", (await hashOf(t)) === "#/rmm", await hashOf(t));
      await t.see("Good ", "alex: the RMM greeting");
      await t.see("Needs your action", "alex: \"Needs your action\"");
      const alexNav = await navIds(t);
      t.check("alex: the nav has Dashboard, My work, New case and Reports", ["wb-nav-dashboard", "wb-nav-my-work", "wb-nav-new-case", "wb-nav-reports"].every((x) => alexNav.includes(x)), alexNav);
      await t.shot("alex-dashboard");
      // bo (Business owner, read-only): Reports first; Operations is the same page, read-only, no New case
      await t.host({ user: "bo" }, "/");
      await t.requireScreen("wb-reports", "T5");
      t.check("bo: lands on #/reports", (await hashOf(t)) === "#/reports", await hashOf(t));
      t.check("bo: nav group owner with Reports and Operations", (await t.byTestId("wb-nav-group-owner").count()) === 1 && (await navIds(t)).includes("wb-nav-operations"), await navIds(t));
      await t.route("/rmm");
      await t.requireScreen("wb-dashboard", "T5");
      await t.see("CIQ operations overview", "bo: the Operations title (not the RMM greeting)");
      t.check("bo: no New case button and no My cases switch", (await t.ui.getByRole("button", { name: "New case" }).count()) === 0 && (await t.ui.getByRole("button", { name: "My cases" }).count()) === 0);
      await t.shot("owner-operations");
      t.check("no write command", (await t.calls(isWrite)).length === 0, (await t.calls(isWrite)).map((c) => c.command));
    },
  },
  {
    id: "S47",
    title: "Reports (#/reports): every number from the host data, unrecorded times named, no prototype data",
    priority: "P1",
    owner: "T5",
    async run(t) {
      await t.host({ user: "dev" }, "/reports");
      await t.requireScreen("wb-reports", "T5");
      await t.seeTestId("wb-rep-kpis", "the KPI tiles render", 12000);
      await t.wait(1500);
      const st = await t.state();
      const f = caseFacts(st);
      const page = await t.ui.locator('[data-testid="wb-reports"]').first().innerText();
      t.check(`"Calculated live from the ${f.total} CIQ cases"`, page.includes(`Calculated live from the ${f.total} CIQ case`), page.slice(0, 200));
      const k = await tiles(t, "wb-rep-kpis");
      t.check(`"Open cases" = ${f.open}`, k["Open cases"]?.value === String(f.open), k["Open cases"]);
      t.check(`"Completed" = ${f.completed}, hint "${f.cancelled} cancelled"`, k.Completed?.value === String(f.completed) && new RegExp(`^${f.cancelled} cancelled`).test(k.Completed?.hint ?? ""), k.Completed);
      t.check(
        "\"Average lead time\" rests on the released cases only",
        f.released ? new RegExp(`${f.released} case`).test(k["Average lead time"]?.hint ?? "") : k["Average lead time"]?.value === "—",
        { tile: k["Average lead time"], released: f.released },
      );
      await t.seeTestId("wb-rep-leadtime", "the lead-time card renders");
      // supplier performance: one row per supplier of the host's cases, case counts equal
      await t.seeTestId("wb-rep-suppliers", "the supplier card renders");
      const rows = await t.byTestId("wb-rep-suppliers").locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim())));
      const bySupplier = {};
      for (const c of f.cases) bySupplier[c.fields.Supplier_Legal_Name] = (bySupplier[c.fields.Supplier_Legal_Name] ?? 0) + 1;
      t.check("one row per supplier of the host's cases", rows.length === Object.keys(bySupplier).length && rows.every((r) => r[0] in bySupplier), { rows: rows.map((r) => r[0]), host: bySupplier });
      t.check("each supplier's case count equals the host's", rows.every((r) => Number(r[1]?.match(/\/\s*(\d+)/)?.[1]) === bySupplier[r[0]]), rows.map((r) => [r[0], r[1]]));
      t.check("answer time is named \"not available yet\" (never filled in)", rows.every((r) => r[r.length - 1] === "not available yet") && page.includes("supplier answers are recorded by hand"));
      t.check("no prototype seed supplier on the page", !SEED_SUPPLIERS.some((n) => page.includes(n)), SEED_SUPPLIERS.filter((n) => page.includes(n)));
      // a chart switches to a table with the same numbers
      const lead = t.byTestId("wb-rep-leadtime").first();
      await lead.getByRole("button", { name: "Table", exact: true }).first().click().catch(() => {});
      await t.wait(300);
      t.check("the lead-time card switches to a table", (await lead.locator("table").count()) > 0);
      await t.shot("reports");
      // bo (Business owner): read-only and its reads are marked partial where the access does not cover every case
      await t.host({ user: "bo" }, "/reports");
      await t.requireScreen("wb-reports", "T5");
      await t.seeTestId("wb-rep-kpis", "bo: the KPI tiles render", 12000);
      await t.wait(1500);
      const kb = await tiles(t, "wb-rep-kpis");
      t.check("bo: \"Open cases\" never exceeds the host's open cases", Number(kb["Open cases"]?.value) <= f.open, kb["Open cases"]);
      t.check("no write command", (await t.calls(isWrite)).length === 0, (await t.calls(isWrite)).map((c) => c.command));
    },
  },
  {
    id: "S48",
    title: "Informed cases: Customs sees only K7 cases, Legal only K8 (read-only, no review step; unreadable status never shown as active)",
    priority: "P1",
    owner: "T5",
    async run(t) {
      const filterBtn = (name) => t.ui.getByRole("button", { name, exact: true }).first().click();
      const waitRows = () => t.ui.locator('[data-testid^="wb-informed-open-"]').first().waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
      // dev holds Customs and Legal and reads every case with its status (rung 1): Active / Closed / All are exact
      await t.host({ user: "dev" }, "/informed");
      await t.requireScreen("wb-informed", "T5");
      const st = await t.state();
      const casesWith = (lead) => [...new Set(rows(st, F3).filter((r) => r.fields.Lead_Dept === lead && r.fields.Applicability_Label !== "N.A.").map((r) => r.fields.Case_Item_Id))].sort();
      const k7 = casesWith("CUS");
      const k8 = casesWith("LEG");
      const open = (ids) => ids.filter((id) => item(st, id)?.status === "InProgress");
      const closed = (ids) => ids.filter((id) => ["Completed", "Rejected", "Withdrawn"].includes(item(st, id)?.status));
      t.check("fixtures: K7 on two cases (one open, one closed), K8 on another", k7.length === 2 && open(k7).length === 1 && closed(k7).length === 1 && k8.length === 1 && !k7.includes(k8[0]), { k7, k8 });
      await t.seeTestId("wb-informed-dept", "dev (Customs and Legal): the department switch");
      await t.see("Customs & Trade Compliance — informed cases", "Customs first");
      await waitRows();
      await t.wait(600);
      const active = await informedIds(t);
      t.check("dev · Customs · Active: exactly the open K7 case", JSON.stringify(active) === JSON.stringify(open(k7)), { shown: active, expected: open(k7) });
      await filterBtn("Closed");
      await t.wait(300);
      const shut = await informedIds(t);
      t.check("dev · Customs · Closed: exactly the closed K7 case", JSON.stringify(shut) === JSON.stringify(closed(k7)), { shown: shut, expected: closed(k7) });
      await filterBtn("All");
      await t.wait(300);
      const all = await informedIds(t);
      t.check("dev · Customs · All: exactly the K7 cases; the K8 case is not listed", JSON.stringify(all) === JSON.stringify(k7) && !all.includes(k8[0]), { shown: all, expected: k7 });
      for (const id of all) {
        const secs = await t.text(`wb-informed-sections-${id}`);
        t.check(`${id}: sections in scope name K7 only`, /K7/.test(secs) && !/K8/.test(secs), secs);
      }
      await t.byTestId("wb-informed-dept").getByRole("button", { name: "Legal / IP", exact: true }).first().click();
      await t.wait(600);
      await filterBtn("All");
      await t.wait(300);
      const devLegal = await informedIds(t);
      t.check("dev · Legal / IP · All: exactly the K8 case", JSON.stringify(devLegal) === JSON.stringify(k8), { shown: devLegal, expected: k8 });
      // cleo (Customs only): lands here; cases known from the audit log only, so no status is claimed
      await t.host({ user: "cleo" }, "/");
      await t.requireScreen("wb-informed", "T5");
      t.check("cleo (Customs & Trade Compliance): lands on #/informed", (await hashOf(t)) === "#/informed", await hashOf(t));
      t.check("cleo: nav group cus with Informed cases and All cases only", (await t.byTestId("wb-nav-group-cus").count()) === 1 && JSON.stringify((await navIds(t)).sort()) === JSON.stringify(["wb-nav-cases", "wb-nav-informed"]), await navIds(t));
      await t.see("Customs & Trade Compliance — informed cases", "the Customs title");
      await t.noTestId("wb-informed-dept", "cleo: no department switch");
      await waitRows();
      await t.wait(600);
      const cAll = await informedIds(t);
      t.check("cleo (opens on All when no status is readable): exactly the K7 cases, never the K8 case", JSON.stringify(cAll) === JSON.stringify(k7), { shown: cAll, expected: k7 });
      for (const id of cAll) t.check(`cleo · ${id}: K7 only`, /K7/.test(await t.text(`wb-informed-sections-${id}`)) && !/K8/.test(await t.text(`wb-informed-sections-${id}`)));
      await t.shot("customs");
      await filterBtn("Active");
      await t.wait(300);
      const cActive = await informedIds(t);
      t.check("cleo · Active: no closed case shown as active", cActive.every((id) => open(k7).includes(id)), cActive);
      if (cActive.length < k7.length) await t.seeTestId("wb-informed-unknown", "cleo · Active: the page says which cases have a status she can't see");
      // the row opens the case read-only
      await t.route(`/cases/${k7[0]}`);
      await t.requireScreen("wb-case", "T1");
      t.check("the case is read-only for Customs (no step panel)", (await t.byTestId("wb-step-save").count()) === 0 && (await t.byTestId("wb-step-submit").count()) === 0);
      // lena (Legal / IP only): only the K8 case
      await t.host({ user: "lena" }, "/");
      await t.requireScreen("wb-informed", "T5");
      await t.see("Legal / IP — informed cases", "the Legal title");
      await waitRows();
      await filterBtn("All");
      await t.wait(300);
      const legal = await informedIds(t);
      t.check("lena · All: exactly the K8 case", JSON.stringify(legal) === JSON.stringify(k8), { shown: legal, expected: k8 });
      await t.shot("legal");
      t.check("no write command", (await t.calls(isWrite)).length === 0, (await t.calls(isWrite)).map((c) => c.command));
    },
  },
  {
    id: "S49",
    title: "Rule table: read-only for the Auditor; the Business administrator starts a new draft (or edits the open one)",
    priority: "P1",
    owner: "T5",
    async run(t) {
      // max (Auditor), a Published rule set: rules listed, read-only, no version button
      await t.host({ user: "max", ruleSet: "published" }, "/admin/rules");
      await t.requireScreen("wb-admin-rules", "T5");
      await t.seeTestId("wb-rules-list", "max: the rules are listed");
      for (const r of ["R-1", "R-2", "R-3"]) await t.see(r, `max: rule ${r} shows`);
      await t.seeTestId("wb-parity-readonly", "max: \"Read-only for your roles\"");
      await t.noTestId("wb-parity-new-version", "max: no New draft button");
      await t.noTestId("wb-parity-open-draft", "max: no Edit draft button");
      t.check("max: the Rule table is in the auditor nav", (await navIds(t)).includes("wb-nav-rules"), await navIds(t));
      await t.shot("auditor-rules");
      t.check("max: no write command", (await t.calls(isWrite)).length === 0);
      // robin (Business administrator), the same rule set: lands here; "New draft from v1" creates a Draft copy
      await t.host({ user: "robin", ruleSet: "published" }, "/");
      await t.requireScreen("wb-admin-rules", "T5");
      t.check("robin: lands on #/admin/rules", (await hashOf(t)) === "#/admin/rules", await hashOf(t));
      await t.noTestId("wb-parity-readonly", "robin: not read-only");
      await t.seeTestId("wb-parity-new-version", "robin: the New draft button");
      t.check("robin: the button reads \"New draft from v1\"", (await t.text("wb-parity-new-version")).includes("New draft from v1"), await t.text("wb-parity-new-version"));
      const fx = await t.fixtures();
      const pub = rows(await t.state(), "CIQ_Config_Version_A00").find((r) => r.id === fx.CFG_RULESET);
      const m0 = await t.lastSeq();
      await t.click("wb-parity-new-version");
      await until(t, after(m0, "DATAFORM_SUBMIT_ITEM", (c) => c.flowId === "CIQ_Config_Version_A00"), 8000);
      await t.wait(800);
      const st = await t.state();
      const made = rows(st, "CIQ_Config_Version_A00").filter((r) => r.fields.Config_Kind === "Rule set" && r.id !== fx.CFG_RULESET);
      t.check("one new Rule set row, state Draft", made.length === 1 && made[0].fields.Config_State === "Draft", made.map((r) => r.fields.Config_State));
      t.check("the draft copies the published rules", made[0] && JSON.stringify(JSON.parse(String(made[0].fields.Payload_JSON)).rules) === JSON.stringify(JSON.parse(String(pub.fields.Payload_JSON)).rules));
      const after1 = rows(st, "CIQ_Config_Version_A00").find((r) => r.id === fx.CFG_RULESET);
      t.check("the Published v1 is unchanged", JSON.stringify(after1?.fields) === JSON.stringify(pub?.fields));
      t.check("no update of the Published row", (await t.calls((c) => c.command === "DATAFORM_UPDATE_ITEM" && (c.instanceId === fx.CFG_RULESET || c.itemId === fx.CFG_RULESET))).length === 0);
      const h = await hashOf(t);
      t.check("the draft opens in Configuration", !!made[0] && h === `#/config/${made[0].id}`, h);
      await t.shot("admin-new-draft");
      // robin, the default fixtures (a Draft rule set is open): "Edit and publish the draft" opens it, nothing written
      await t.host({ user: "robin" }, "/admin/rules");
      await t.requireScreen("wb-admin-rules", "T5");
      await t.seeTestId("wb-parity-open-draft", "robin: an open draft → Edit and publish the draft");
      await t.noTestId("wb-parity-new-version", "robin: no second draft offered while one is open");
      const m1 = await t.lastSeq();
      await t.click("wb-parity-open-draft");
      await t.wait(800);
      const fx2 = await t.fixtures();
      t.check("the open draft opens in Configuration", (await hashOf(t)) === `#/config/${fx2.CFG_RULESET_DRAFT}`, await hashOf(t));
      t.check("opening the draft writes nothing", (await t.calls((c) => c.seq > m1 && isWrite(c))).length === 0);
    },
  },
  {
    id: "S50",
    title: "Integration service as the only role: the no-access page, nothing read",
    priority: "P1",
    owner: "T5",
    async run(t) {
      await t.host({ user: "svc" }, "/");
      await t.seeTestId("wb-noaccess", "the no-access page shows");
      await t.see("Integration service", "it lists the role \"Integration service\"");
      await t.noTestId("wb-nav", "no nav");
      await t.wait(1500);
      const reads = await t.calls((c) => /^(PROCESS|DATAFORM)_/.test(c.command));
      t.check("no PROCESS_* or DATAFORM_* command", reads.length === 0, reads.map((c) => c.command));
      await t.shot("noaccess");
      // the legacy name is matched too (and still gives no screen)
      await t.host({ user: "svc", roleNames: "legacy" }, "/rmm");
      await t.seeTestId("wb-noaccess", "legacy name \"CIQ Integration Service\": no-access page too");
      await t.see("CIQ Integration Service", "it lists the legacy role name");
    },
  },
  {
    id: "S51",
    title: "layout in Kissflow: no header, View as dock top right (builder only), theme toggle bottom left of the nav",
    priority: "P1",
    owner: "T5",
    async run(t) {
      await t.host({ user: "dev" }, "/cases");
      await t.seeTestId("wb-nav", "the shell is live");
      await t.wait(800);
      const g = await t.frame().evaluate(() => {
        const box = (sel) => {
          const e = document.querySelector(sel);
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), visible: r.height > 0 && getComputedStyle(e).display !== "none" };
        };
        return {
          vw: innerWidth,
          vh: innerHeight,
          bar: box("[data-app-header]"),
          nav: box('[data-testid="wb-nav"]'),
          main: box("main"),
          dock: box('[data-testid="wb-viewas"]'),
          theme: box('[data-testid="wb-theme-row"]'),
          lastGroup: [...document.querySelectorAll('[data-testid^="wb-nav-group-"]')].map((e) => Math.round(e.getBoundingClientRect().bottom)).pop() ?? 0,
          themeInNav: !!document.querySelector('[data-testid="wb-nav"] [data-testid="wb-theme-row"] button'),
          logo: document.querySelectorAll("header, [data-testid='wb-header'], [data-testid='wb-brand']").length,
        };
      });
      t.check("no header: the menu bar is hidden at desktop width and no header/brand element exists", (!g.bar || !g.bar.visible) && g.logo === 0, g);
      t.check("the nav starts at the very top and runs the full height", g.nav?.top === 0 && Math.abs(g.nav.h - g.vh) <= 1, g.nav);
      t.check("the page content starts at the top (no space taken above it)", g.main?.top === 0, g.main);
      t.check("the theme toggle sits in the nav, below the groups, at its bottom left", g.themeInNav && g.theme.top >= g.lastGroup && g.theme.left < 60, { theme: g.theme, lastGroup: g.lastGroup });
      t.check("the View as dock is a small tab at the top right", !!g.dock && g.dock.top === 0 && g.dock.h <= 32 && g.vw - g.dock.right <= 24, g.dock);
      const panel = t.byTestId("wb-viewas-panel").first();
      t.check("collapsed, the dock's panel is not shown", !(await panel.evaluate((e) => e.getBoundingClientRect().width > 2).catch(() => false)));
      await t.byTestId("wb-viewas").first().hover();
      await t.wait(300);
      const open = await panel.innerText().catch(() => "");
      t.check("on hover the panel opens with the plain note (no \"UI lens\" wording)", open.includes("Preview only") && !/UI lens|permissions are unchanged/i.test(open), open);
      await t.page.mouse.move(400, 500);
      const theme0 = await t.frame().evaluate(() => document.documentElement.dataset.theme);
      await t.byTestId("wb-theme-row").locator("button").first().click();
      await t.wait(300);
      const theme1 = await t.frame().evaluate(() => document.documentElement.dataset.theme);
      t.check("the toggle in the nav switches the theme", !!theme0 && !!theme1 && theme0 !== theme1, [theme0, theme1]);
      await t.shot("layout");
      await t.byTestId("wb-theme-row").locator("button").first().click();
      // a non-builder (dev=0): no dock at all
      await t.host({ user: "alex" }, "/cases");
      await t.seeTestId("wb-nav", "alex: the shell is live");
      await t.wait(600);
      await t.noTestId("wb-viewas", "alex (no builder signal): no View as dock");
      await t.noTestId("wb-lens-badge", "alex: no lens badge");
    },
  },
];

// ---------------------------------------------------------------- T2 helpers
/** Opens the lane workspace of `dept` on C4 for the params' user; PENDING while it is a stub. */
async function laneOpen(t, params, dept = "SAF") {
  await t.host(params, "/");
  const st = await t.state();
  const fx = await t.fixtures();
  const act = actAt(st, fx.C4, `CASE_B_${dept}`);
  await t.route(`/review/lane/${fx.C4}/${act}`);
  await t.requireScreen("wb-lane", "T2");
  await t.seeTestId("wb-lane-signoff", `${dept} lane: the sign-off column shows`, 10000);
  return { st, fx, act };
}

/** Ticks "Review confirmed", picks the RMES decision (SAF/REG) and optionally fills On behalf of. */
async function signOff(t, decision, o = {}) {
  const box = t.byTestId("wb-lane-signoff").first();
  const cb = box.locator('input[type="checkbox"]').first();
  if (!(await cb.isChecked().catch(() => false))) await cb.check();
  if (decision) await box.getByRole("button", { name: decision, exact: true }).first().click().catch(() => {});
  if (o.onBehalfOf !== undefined) await t.byTestId("wb-lane-on-behalf").first().fill(o.onBehalfOf);
}

/** Opens a point at its step for the params' user (fresh host), waiting for `testId`. */
async function pointOpen(t, params, point, step, testId) {
  await t.host(params, "/");
  const st = await t.state();
  const fx = await t.fixtures();
  const act = actAt(st, fx[point], step);
  await t.route(`/points/${fx[point]}?task=${act}`);
  await t.requireScreen(testId, "T2");
  return { st, fx, act };
}

/** Accepts a point at its review step (K-WB-aware). */
async function acceptPoint(t, params, point, step) {
  const o = await pointOpen(t, params, point, step, "wb-point-accept");
  await actAndSubmit(t, "wb-point-accept", { flow: OP, label: `accept ${point}`, task: { id: o.fx[point], act: o.act }, afterKwb: "wb-point-submit-after-kwb" });
  t.check(`${point} Accepted and closed`, item(await t.state(), o.fx[point]).status === "Completed");
  return o;
}

/** Fills the Return form (new question, justification, due dates, reason) and sends it. */
async function doReturn(t) {
  await t.click("wb-point-return");
  const form = t.byTestId("wb-point-return-form").first();
  await form.waitFor({ state: "visible", timeout: 5000 });
  await t.byTestId("wb-point-return-question").fill("Please send the 2026 certificate instead (harness).");
  const areas = form.locator("textarea");
  await areas.nth(1).fill("The 2025 certificate expired (harness).");
  const dates = form.locator('input[type="date"]');
  await dates.nth(0).fill("2026-10-30");
  await dates.nth(1).fill("2026-11-06");
  await t.byTestId("wb-point-return-reason").fill("Expired certificate (harness).");
  await t.click("wb-point-return-submit");
}

/** The SAF lane on C4 for the current user: mark SAF-A reviewed, sign off, refresh counts (or attest on rung 3), complete. */
async function completeSafLane(t, { rung }) {
  const st = await t.state();
  const fx = await t.fixtures();
  const act = actAt(st, fx.C4, "CASE_B_SAF");
  await t.route(`/review/lane/${fx.C4}/${act}`);
  await t.requireScreen("wb-lane", "T2");
  await t.seeTestId("wb-lane-signoff", "the lane workspace shows", 10000);
  const m0 = await t.lastSeq();
  await t.click("wb-section-SAF-A-reviewed");
  await until(t, after(m0, "DATAFORM_SUBMIT_ITEM", (c) => c.flowId === F8), 8000);
  t.check("Mark reviewed: an F8 Section review row for SAF-A", (await t.state()).rows.some((r) => r.flow === F8 && r.fields.Action_Code === "section.reviewed" && String(r.fields.Object_Key).endsWith("-SAF-A")));
  await signOff(t, "Approved");
  await kwbSave(t, "wb-lane-save", "save sign-off", { id: fx.C4, act });
  if (rung === 1) await kwbSave(t, "wb-counts-refresh", "refresh counts (complete)", { id: fx.C4, act });
  else {
    await t.click("wb-counts-refresh");
    await t.seeTestId("wb-counts-unread", "rung 3: the refresh is partial");
    await t.byTestId("wb-counts-attest-text").first().fill("I checked the open points of this case with the RMM by phone (harness).");
    const a0 = await t.lastSeq();
    await t.click("wb-counts-attest");
    if (t.variant !== "ok") await kwbAfter(t, a0, "attest and write", { id: fx.C4, act });
    await until(t, after(a0, "DATAFORM_SUBMIT_ITEM", (c) => c.flowId === F8), 8000);
    const f8 = (await t.calls(after(a0, "DATAFORM_SUBMIT_ITEM", (c) => c.flowId === F8)))[0];
    const cnt = (await t.calls(after(a0, "PROCESS_UPDATE_ITEM", (c) => c.data && "SAF_Open_Count" in c.data)))[0];
    t.check("attest: the F8 count.attested row is created and submitted BEFORE the count UPDATE_ITEM", f8 && (!cnt || f8.seq < cnt.seq), [f8?.seq, cnt?.seq]);
    t.check("attest: an F8 count.attested row", (await t.state()).rows.some((r) => r.flow === F8 && r.fields.Action_Code === "count.attested"));
  }
  const f = item(await t.state(), fx.C4).fields;
  t.check("counts 0 → server SAF_Gate OK", f.SAF_Open_Count === 0 && f.SAF_RMES_Gaps === 0 && f.SAF_Gate === "OK", [f.SAF_Open_Count, f.SAF_RMES_Gaps, f.SAF_Gate]);
  const s = await submitVia(t, "wb-lane-complete");
  await t.wait(1500);
  await t.noTestId("wb-submit-lane-diff", "pre and post re-read equal (no lane-diff banner)");
  t.check("an F8 lane.completed row with the SAF lane", (await t.state()).rows.some((r) => r.flow === F8 && r.fields.Action_Code === "lane.completed" && r.fields.Object_Key === `${f.Case_Code}:lane:SAF` && String(r.fields.Snapshot_JSON).includes("SAF_Review_Confirm") && r.fields.Event_At > "2026-10-02"));
  return s;
}
