// Headless check of the BUILT CIQ Workbench (dist-workbench/zip/index.html) the way Kissflow runs it: inside an iframe
// on a different origin, talking to its host page over postMessage (WORKBENCH-DESIGN.md §11). The host page EMULATES
// the Kissflow app host: an IIFE built by esbuild from src/workbench/harness/hostPage.ts (task engine, step
// permissions and formulas from the generated schema, every unkind mode of §11.2, fictional fixtures, recorder).
// Same mechanism as scripts/harness-portal.mjs: two http servers on random 127.0.0.1 ports and Playwright from the
// same absolute path. LOCAL ONLY: no Kissflow call of any kind, no .env, no credentials.
//
//   node scripts/harness-workbench.mjs [S01 S04 …]   run scenarios (default: all), report → dist-workbench/
//   node scripts/harness-workbench.mjs --serve       servers only; prints a host URL for manual demos
//   options: --ui <url>   frame a dev server (npm run dev:workbench → http://localhost:5330/workbench.html) instead
//            --html <file> serve another built single-file Workbench (its build-stamp.txt next to it), e.g. a
//                          scratch build: npx vite build -c vite.workbench.config.ts --outDir <dir>
//            --report <name>  report file name in dist-workbench/ (default harness-report.json)
//            --variant ok|kwb-refuse  run one side of the matrix only (debugging)
//            --no-matrix  skip the kwb=refuse variant of the M scenarios
//            --list       list the scenarios
//            --screens [dir]  no scenarios: one screenshot per fictional role (default dir dist-workbench/screens)
//            --viewport <W>x<H>  browser viewport for --screens and the scenarios (default 1360x900), e.g. 768x1024
//   report: per run (scenario × variant) status, checks and screenshots; byScenario = pass/fail per scenario and per
//   matrix variant; a failing run gets harness-<run>-failure.png taken at its FIRST failing check (any kind)
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SCENARIOS, Pending } from "./harness-workbench-scenarios.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-workbench");
const MARKER = "__WB_HARNESS_ONLY__";
const PW = "/Users/thomas/Documents/Kissflow Projects/POC/Promotion Management/app/node_modules/playwright-core";

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const uiArg = opt("--ui");
const htmlArg = opt("--html");
const reportName = opt("--report") ?? "harness-report.json";
const onlyVariant = opt("--variant"); // ok | kwb-refuse (debugging one side of the matrix)
// --viewport <W>x<H>: the browser viewport (default 1360x900, the size every check and screenshot was written for)
const VIEWPORT = (() => {
  const v = opt("--viewport");
  if (v === undefined) return { width: 1360, height: 900 };
  const m = /^(\d{3,4})x(\d{3,4})$/.exec(v);
  if (!m) {
    console.error(`--viewport expects <W>x<H>, e.g. 768x1024 (got ${v})`);
    process.exit(2);
  }
  return { width: Number(m[1]), height: Number(m[2]) };
})();
// screenshots: harness-<scenario>-<tag>.png (§11.1); a named report prefixes them (harness-report-x.json → harness-x-…)
const SHOT_PREFIX = reportName === "harness-report.json" ? "harness-" : `harness-${path.basename(reportName, ".json").replace(/^harness-report-?/, "") || "run"}-`;
const wanted = argv.filter((a, i) => !a.startsWith("--") && !["--ui", "--html", "--report", "--variant", "--screens", "--viewport"].includes(argv[i - 1]));
if (flag("--list")) {
  for (const s of SCENARIOS) console.log(`${s.id.padEnd(5)} ${s.priority}${s.matrix ? " · M" : "    "} ${s.owner.padEnd(3)} ${s.title}`);
  process.exit(0);
}

// ---------------------------------------------------------------- host bundle (esbuild, relative imports only)
const esbuild = require(path.join(root, "node_modules/esbuild"));
const built = esbuild.buildSync({
  entryPoints: [path.join(root, "src/workbench/harness/hostPage.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  write: false,
  logLevel: "silent",
  legalComments: "none",
});
const HOST_JS = built.outputFiles[0].text;
if (!HOST_JS.includes(MARKER)) throw new Error(`host bundle lacks the harness marker ${MARKER}`);

// ---------------------------------------------------------------- the UI under test
let UI_HTML = null;
let BUILD_STAMP = null;
const UI_FILE = htmlArg ? path.resolve(htmlArg) : path.join(out, "zip", "index.html");
if (!uiArg) {
  if (!existsSync(UI_FILE)) {
    console.error(`No built Workbench at ${UI_FILE}: run npm run build:workbench first (or pass --ui <dev server url> / --html <file>).`);
    process.exit(2);
  }
  UI_HTML = readFileSync(UI_FILE, "utf8");
  if (UI_HTML.includes(MARKER)) throw new Error(`marker guard: ${MARKER} found in ${UI_FILE} (the host bundle must never enter the Workbench)`);
  const stamp = htmlArg ? path.join(path.dirname(UI_FILE), "build-stamp.txt") : path.join(out, "build-stamp.txt");
  BUILD_STAMP = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : null;
}

const listen = (handler) => new Promise((resolve) => { const s = createServer(handler).listen(0, "127.0.0.1", () => resolve(s)); });
const uiServer = UI_HTML ? await listen((req, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(UI_HTML); }) : null;
const UI_URL = uiArg ?? `http://127.0.0.1:${uiServer.address().port}/`;
const UI_ORIGIN = new URL(UI_URL).origin;
const hostHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Kissflow (emulated host · harness)</title>
<style>html,body{margin:0;height:100%;background:#f3f4f6}</style></head><body>
<script>window.__WB_UI_URL__=${JSON.stringify(UI_URL)};</script>
<script>${HOST_JS.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
const hostServer = await listen((req, res) => {
  if (!req.url.startsWith("/?") && req.url !== "/" && !req.url.startsWith("/#")) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(hostHtml);
});
const HOST_ORIGIN = `http://127.0.0.1:${hostServer.address().port}`;
if (HOST_ORIGIN === UI_ORIGIN) throw new Error("host and UI must be different origins");

if (flag("--serve")) {
  console.log(`Emulated Kissflow host (fictional fixtures, nothing leaves this machine):`);
  console.log(`  ${HOST_ORIGIN}/?user=dev&bar=1#/`);
  console.log(`  ${HOST_ORIGIN}/?user=jo&bar=1#/review          (Safety reviewer, rung 3)`);
  console.log(`  ${HOST_ORIGIN}/?user=alex&bar=1#/my-work       (RMM)`);
  console.log(`  UI: ${UI_URL}${BUILD_STAMP ? ` (build ${BUILD_STAMP})` : ""}`);
  console.log(`  Any §11.2 mode as a query parameter, e.g. &kwb=refuse&openForm=hang. Ctrl+C stops.`);
  await new Promise(() => {});
}

// ---------------------------------------------------------------- Playwright run
// Console errors the BROWSER itself logs for a handled condition (not app code). Each is listed in the report.
//  - Chromium logs a "Permissions policy violation" when the framed Workbench calls navigator.clipboard.writeText
//    without clipboard-write; Diagnostics catches it and shows the JSON instead (S04 reads that fallback).
const BROWSER_NOTICES = [/^Permissions policy violation: The Clipboard API has been blocked because of a permissions policy/];
const { chromium } = require(PW);
const browser = await chromium.launch();
const results = [];
let loads = 0;

// ---------------------------------------------------------------- --screens [dir]: one screenshot per role (T5)
// Not a scenario (no checks, no report): each fictional user on their landing screen, plus a few key screens, on the
// emulated host. Default dir: dist-workbench/screens (vite build empties dist-workbench; pass a dir to keep them).
if (flag("--screens")) {
  const dirArg = opt("--screens");
  // a non-default viewport never lands on the 1360-px set by default: dist-workbench/screens-<W>
  const dir = dirArg && !dirArg.startsWith("--") ? path.resolve(dirArg) : path.join(out, VIEWPORT.width === 1360 ? "screens" : `screens-${VIEWPORT.width}`);
  console.log(`viewport ${VIEWPORT.width}x${VIEWPORT.height} → ${path.relative(root, dir) || "."}`);
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  // names follow the clickable prototype's personas (role-alignment.json); the landing of each persona comes first
  const SHOTS = [
    ["dev", "/my-work", "dev-builder-my-work"],
    ["alex", "/rmm", "rmm-dashboard"],
    ["alex", "/my-work", "rmm-my-work"],
    ["alex", "/reports", "rmm-reports"],
    ["alex", "/cases", "rmm-cases"],
    ["alex", "/cases/new", "rmm-new-case"],
    ["alex", "case:C5:lanes", "rmm-case-c5-lanes"],
    ["casey", "case:C5:lanes", "case-admin-c5-lanes"],
    ["jo", "/review", "safety-review-queue"],
    ["jo", "lane:C4:CASE_B_SAF", "safety-lane-workspace"],
    ["jo", "rmes:C4:SAF", "safety-rmes-sheet"],
    ["sam", "/review", "regulatory-review-queue"],
    ["tove", "/review", "qm-review-queue"],
    ["lee", "/review", "micro-review-queue"],
    ["ana", "/review", "sustainability-review-queue"],
    ["wren", "/approvals", "approver-queue"],
    ["wren", "approval:C6", "approver-decision-c6"],
    ["robin", "/admin/rules", "business-admin-rule-table"],
    ["robin", "/admin/ownership", "business-admin-section-owners"],
    ["robin", "/admin/reminders", "business-admin-reminders"],
    ["robin", "/config", "business-admin-config"],
    ["robin", "/suppliers", "business-admin-suppliers"],
    ["max", "/audit", "auditor-audit-log"],
    ["max", "/cases", "auditor-cases"],
    ["max", "/admin/rules", "auditor-rule-table"],
    ["cleo", "/informed", "customs-informed-cases"],
    ["lena", "/informed", "legal-informed-cases"],
    ["bo", "/reports", "business-owner-reports"],
    ["bo", "/rmm", "business-owner-operations"],
    ["svc", "/", "integration-service-no-access"],
    ["norole", "/", "no-role"],
    ["dev", "/diagnostics", "dev-diagnostics"],
  ];
  for (const [user, route, name] of SHOTS) {
    const context = await browser.newContext({ viewport: VIEWPORT, timezoneId: "Europe/Berlin", locale: "en-GB" });
    const page = await context.newPage();
    const params = new URLSearchParams({ user, ...(user === "jo" ? { c4Rmes: "complete" } : {}) });
    await page.goto(`${HOST_ORIGIN}/?${params}#/`);
    await page.waitForTimeout(1500);
    let r = route;
    if (!route.startsWith("/")) {
      const [kind, c, x] = route.split(":");
      const fx = await page.evaluate(() => window.__kfFixtures);
      const id = fx[c];
      const st = await page.evaluate(() => window.__kfState());
      const it = st.items.find((i) => i.id === id);
      const act = (step) => (it?.acts ?? []).find((a) => a.open && a.step === step)?.act;
      r = kind === "case" ? `/cases/${id}?tab=${x}` : kind === "lane" ? `/review/lane/${id}/${act(x)}` : kind === "rmes" ? `/rmes/${id}?dept=${x}` : `/approvals/${id}/${act("CASE_S6")}`;
    }
    const f = page.frames().find((fr) => fr.url().startsWith(UI_ORIGIN));
    if (f) await f.evaluate((h) => (location.hash = h), `#${r}`);
    await page.waitForTimeout(2500);
    const file = path.join(dir, `role-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    // horizontal page scroll inside the framed UI (a table scrolling in its own container does not count)
    const ox = f ? await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => null) : null;
    console.log(`screen ${user.padEnd(6)} ${r.padEnd(48)} → ${path.relative(root, file)}${ox ? `  ⚠ page scrolls sideways by ${ox}px` : ""}`);
    await context.close();
  }
  await browser.close();
  uiServer?.close();
  hostServer.close();
  process.exit(0);
}

async function runScenario(s, variant) {
  const name = variant === "ok" ? s.id : `${s.id}-${variant}`;
  // Beiersdorf's time zone, so local ↔ UTC conversions of manual timestamps are exercised (not hidden by UTC)
  const context = await browser.newContext({ viewport: VIEWPORT, timezoneId: "Europe/Berlin", locale: "en-GB" });
  // direct mode: record any SDK command the page posts to itself (S01: "no SDK command")
  await context.addInitScript(() => {
    window.__directMsgs = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object" && e.data.command) window.__directMsgs.push(e.data.command);
    });
  });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  const shots = [];
  // the first failing check of any kind takes a screenshot at that moment (harness-<run>-failure.png), awaited before close
  let failShot = null;
  const record = (c) => {
    checks.push(c);
    if (!c.pass && !failShot) {
      const file = `${SHOT_PREFIX}${name}-failure.png`;
      failShot = page.screenshot({ path: path.join(out, file), fullPage: false }).then(() => shots.push(file), () => {});
    }
  };
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  const notices = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (BROWSER_NOTICES.some((re) => re.test(m.text()))) notices.push(m.text().slice(0, 120));
    else errors.push(`console: ${m.text()}`);
  });
  let ui = page;
  let hostLoaded = false;
  let globalOpts = {};
  let postCloseReads = 0; // getItem refused "moved out" for an activity already closed (§7.3 step 7; CR-T2-review-1)
  const harvest = async () => {
    if (!hostLoaded) return;
    postCloseReads += await page
      .evaluate(() => (window.__kfCalls ?? []).filter((c) => c.command === "PROCESS_GET_ITEM" && c.refused?.category === "moved-out").length)
      .catch(() => 0);
    const g = await page.evaluate((o) => (window.__kfChecks ? window.__kfChecks(o) : null), globalOpts).catch((e) => [{ label: "global checks could be read", pass: false, detail: String(e.message || e) }]);
    if (g) for (const c of g) record({ ...c, label: `[global] ${c.label}` });
    else record({ label: "[global] host page answered", pass: false, detail: "window.__kfChecks missing" });
    hostLoaded = false;
    await failShot; // the host is about to reload: take a pending failure screenshot of THIS load first
  };
  const t = {
    id: s.id,
    variant,
    page,
    BUILD_STAMP,
    HOST_ORIGIN,
    UI_ORIGIN,
    get ui() {
      return ui;
    },
    /** Loads the emulated host with params (the matrix variant adds kwb=refuse) and frames the UI at `route`. */
    async host(params = {}, route = "/") {
      await harvest();
      globalOpts = {};
      const q = { ...(variant === "kwb-refuse" && params.kwb === undefined ? { kwb: "refuse" } : {}), ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), n: String(++loads) };
      await page.goto(`${HOST_ORIGIN}/?${new URLSearchParams(q)}#${route}`);
      const hostErr = await page.evaluate(() => window.__kfHostError ?? null);
      if (hostErr) throw new Error(`host refused its params: ${hostErr}`);
      await page.waitForFunction(() => document.getElementById("kf-frame")?.contentWindow, null, { timeout: 5000 });
      ui = page.frameLocator("#kf-frame");
      hostLoaded = true;
    },
    /** Another fictional user on the SAME host state (no fixture rebuild): the frame reloads and handshakes again. */
    async switchUser(id, route = "/", o = {}) {
      await page.evaluate(([u, r, x]) => window.__kfHost.switchUser(u, r, x), [id, route, o]);
      await page.waitForTimeout(400);
      await page.waitForFunction(() => document.getElementById("kf-frame")?.contentWindow, null, { timeout: 5000 });
      ui = page.frameLocator("#kf-frame");
    },
    async direct(route = "/") {
      await harvest();
      await page.goto(`${UI_URL}#${route}`);
      ui = page;
    },
    frame() {
      return page.frames().find((f) => f.url().startsWith(UI_ORIGIN)) ?? page.mainFrame();
    },
    /** Navigates inside the framed UI (hash route) without reloading the host. */
    async route(r) {
      await t.frame().evaluate((h) => (location.hash = h), `#${r}`);
      await page.waitForTimeout(300);
    },
    byTestId(id) {
      return ui.locator(`[data-testid="${id}"]`);
    },
    async seeTestId(id, label = `shows ${id}`, timeout = 8000) {
      const ok = await t.byTestId(id).first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
      record({ label, pass: ok });
      return ok;
    },
    async noTestId(id, label = `no ${id}`) {
      record({ label, pass: (await t.byTestId(id).count()) === 0 });
    },
    async see(text, label = `sees "${text}"`, timeout = 8000) {
      const ok = await ui.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
      record({ label, pass: ok });
      return ok;
    },
    async notSee(text, label = `does not see "${text}"`) {
      record({ label, pass: (await ui.getByText(text, { exact: false }).count()) === 0 });
    },
    async text(id) {
      return (await t.byTestId(id).first().innerText().catch(() => "")).trim();
    },
    /** Clicks a test id; a click on wb-kwb-openform is announced to the host first (the openForm click check). */
    async click(id) {
      if (id === "wb-kwb-openform") await page.evaluate((x) => window.__kfHost.markClick(x), id);
      await t.byTestId(id).first().click();
    },
    /** Picks an option of the kit's custom Select by keyboard (the mouse is unreliable in the frame, NOTES-T0). */
    async select(container, label) {
      const box = typeof container === "string" ? t.byTestId(container) : container;
      const self = (await box.first().getAttribute("role").catch(() => null)) === "combobox";
      const btn = self ? box.first() : box.locator('[role="combobox"]').first();
      await btn.focus();
      await btn.press("Enter");
      const list = ui.getByRole("listbox").first();
      await list.waitFor({ state: "visible", timeout: 3000 });
      const opts = (await list.getByRole("option").allInnerTexts()).map((x) => x.trim());
      const i = opts.findIndex((o) => o === label);
      if (i < 0) throw new Error(`option "${label}" not in [${opts.join(" | ")}]`);
      await btn.press("Home");
      for (let k = 0; k < i; k++) await btn.press("ArrowDown");
      await btn.press("Enter");
      await page.waitForTimeout(250);
      return opts;
    },
    async options(container) {
      const box = typeof container === "string" ? t.byTestId(container) : container;
      const btn = box.locator('[role="combobox"]').first();
      await btn.focus();
      await btn.press("Enter");
      const list = ui.getByRole("listbox").first();
      await list.waitFor({ state: "visible", timeout: 3000 });
      const opts = (await list.getByRole("option").allInnerTexts()).map((x) => x.trim());
      await btn.press("Escape");
      return opts;
    },
    async calls(pred = () => true) {
      return (await page.evaluate(() => window.__kfCalls ?? [])).filter(pred);
    },
    async lastSeq() {
      return page.evaluate(() => (window.__kfCalls ?? []).length ? window.__kfCalls[window.__kfCalls.length - 1].seq : 0);
    },
    async state() {
      return page.evaluate(() => window.__kfState());
    },
    async fixtures() {
      return page.evaluate(() => window.__kfFixtures);
    },
    async host$(fn, ...args) {
      return page.evaluate(([f, a]) => window.__kfHost[f](...a), [fn, args]);
    },
    async people() {
      return page.evaluate(() => window.__kfHost.people);
    },
    expectRefusals(...cats) {
      globalOpts = { ...globalOpts, expectRefusals: [...(globalOpts.expectRefusals ?? []), ...cats] };
    },
    allowAdminWrite() {
      globalOpts = { ...globalOpts, allowAdminWrite: true };
    },
    check(label, pass, detail) {
      record({ label, pass: !!pass, ...(detail !== undefined ? { detail } : {}) });
      return !!pass;
    },
    async shot(tag) {
      const file = `${SHOT_PREFIX}${name}-${tag}.png`;
      await page.screenshot({ path: path.join(out, file), fullPage: false });
      shots.push(file);
    },
    async wait(ms) {
      await page.waitForTimeout(ms);
    },
    /** A feature screen that is still T0's stub (data-stub) makes the scenario PENDING (§12.1 T4), not FAIL. */
    async requireScreen(testId, owner, timeout = 8000) {
      const el = t.byTestId(testId).first();
      const found = await el.waitFor({ state: "attached", timeout }).then(() => true, () => false);
      const stub = found ? await el.getAttribute("data-stub").catch(() => null) : null;
      if (stub) throw new Pending(`${testId} is still a stub (${stub})`);
      if (!found) {
        const anyStub = await ui.locator("[data-stub]").first().getAttribute("data-stub").catch(() => null);
        if (anyStub) throw new Pending(`${testId} not rendered; the page is a stub (${anyStub})`);
        throw new Error(`${testId} not found (${owner} screen)`);
      }
    },
    pending(reason) {
      throw new Pending(reason);
    },
  };
  const t0 = Date.now();
  let pending = null;
  try {
    await s.run(t);
  } catch (e) {
    if (e instanceof Pending) pending = e.message;
    else {
      record({ label: "scenario ran to the end", pass: false, detail: String(e?.message || e).slice(0, 600) });
    }
  }
  await harvest().catch(() => {});
  record({ label: "no page or console errors", pass: errors.length === 0, ...(errors.length ? { detail: errors.slice(0, 6) } : notices.length ? { detail: { browserNoticesIgnored: notices } } : {}) });
  await failShot;
  await context.close();
  const failed = checks.filter((c) => !c.pass);
  const status = failed.length ? "FAIL" : pending ? "PENDING" : "PASS";
  const r = { id: s.id, title: s.title, priority: s.priority, owner: s.owner, matrix: !!s.matrix, variant, status, durationMs: Date.now() - t0, ...(pending ? { pending } : {}), movedOutReads: postCloseReads, checks, screenshots: shots };
  results.push(r);
  console.log(`${status.padEnd(7)} ${name.padEnd(16)} ${s.title}${pending ? ` — ${pending}` : ""} (${checks.length} checks)`);
  for (const c of failed) console.log(`   ✗ ${c.label}${c.detail !== undefined ? " — " + JSON.stringify(c.detail).slice(0, 400) : ""}`);
}

const pick = wanted.length ? SCENARIOS.filter((s) => wanted.includes(s.id)) : SCENARIOS;
if (wanted.length && pick.length !== wanted.length) {
  console.error(`unknown scenario(s): ${wanted.filter((w) => !SCENARIOS.some((s) => s.id === w)).join(", ")}`);
  process.exit(2);
}
for (const s of pick) {
  if (onlyVariant !== "kwb-refuse") await runScenario(s, "ok");
  if (s.matrix && !flag("--no-matrix") && onlyVariant !== "ok") await runScenario(s, "kwb-refuse");
}
await browser.close();
uiServer?.close();
hostServer.close();
const summary = { pass: results.filter((r) => r.status === "PASS").length, fail: results.filter((r) => r.status === "FAIL").length, pending: results.filter((r) => r.status === "PENDING").length };
// pass/fail per scenario and per matrix variant (§11.2: "the report lists both variants separately")
const byScenario = {};
for (const r of results) {
  const e = (byScenario[r.id] ??= { priority: r.priority, owner: r.owner, matrix: r.matrix, title: r.title });
  e[r.variant] = r.status;
  if (r.pending) e.pendingReason = r.pending;
  const failed = r.checks.filter((c) => !c.pass);
  if (failed.length) (e.failedChecks ??= {})[r.variant] = failed.map((c) => c.label);
  const shot = r.screenshots.find((f) => f.endsWith("-failure.png"));
  if (shot) (e.failureScreenshots ??= {})[r.variant] = shot;
}
const p1Open = Object.entries(byScenario).filter(([, e]) => e.priority === "P1" && (e.ok !== "PASS" || (e.matrix && e["kwb-refuse"] !== undefined && e["kwb-refuse"] !== "PASS"))).map(([id]) => id);
console.log("\nscenario  P   M  ok       kwb-refuse");
for (const [id, e] of Object.entries(byScenario)) console.log(`${id.padEnd(9)} ${e.priority} ${e.matrix ? "M" : " "}  ${String(e.ok ?? "-").padEnd(8)} ${e.matrix ? e["kwb-refuse"] ?? "(not run)" : ""}`);
console.log(`P1 scenarios not passing in every variant run: ${p1Open.length ? p1Open.join(", ") : "none"}`);
writeFileSync(
  path.join(out, path.basename(reportName)),
  JSON.stringify({ generatedAt: new Date().toJSON(), ui: uiArg ?? path.relative(root, UI_FILE), build: BUILD_STAMP, hostBundleBytes: HOST_JS.length, summary: { ...summary, p1NotPassing: p1Open }, byScenario, results }, null, 2),
);
console.log(`${summary.pass} passed, ${summary.fail} failed, ${summary.pending} pending of ${results.length} runs (${results.reduce((n, r) => n + r.checks.length, 0)} checks) → dist-workbench/${path.basename(reportName)}`);
process.exit(summary.fail ? 1 : 0);
