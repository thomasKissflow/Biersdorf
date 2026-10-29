// End-to-end harness of the BUILT clickable prototype (dist/, `npm run build` first). It builds nothing itself: it
// serves dist/ on a free 127.0.0.1 port, opens a FRESH browser context per scenario (empty localStorage and
// sessionStorage = the empty demo start) and drives the real UI the way Thomas clicks it: the person chip's demo menu
// ("View as"), the menus and the data-testid hooks. After every step it asserts that the page has no console or page
// error, that the visible text holds no "NaN", "undefined", "Infinity" or "Invalid Date" (nor prototype wording), and
// that window.__ciq.invariants() is empty. Same mechanism as scripts/harness-portal.mjs: Playwright from the absolute
// path below, its own server and its own browser. LOCAL ONLY: no Kissflow call, no .env, no credentials. All people
// and suppliers are fictional.
//
//   node scripts/harness-prototype.mjs [S0 S1 …]   run scenarios (default: all)
//   options: --headed (watch it), --slow <ms> (slow motion), --shots (a full-page screenshot after every step)
//   report: dist-harness/harness-prototype-report.json; a failing scenario leaves dist-harness/<scenario>-failure.png
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LEAK_TERMS } from "./leak-scan.mjs";

const require = createRequire(import.meta.url);
const PW = "/Users/thomas/Documents/Kissflow Projects/POC/Promotion Management/app/node_modules/playwright-core";
const { chromium } = require(PW);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const out = path.join(root, "dist-harness");
if (!existsSync(path.join(dist, "index.html"))) {
  console.error("dist/index.html is missing: run `npm run build` first.");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const argv = process.argv.slice(2);
const opt = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const HEADED = argv.includes("--headed");
const SHOTS = argv.includes("--shots"); // a screenshot after every step, in dist-harness/shots/
const SLOW = Number(opt("--slow") ?? 0);
const wantedIds = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--slow");

// ------------------------------------------------------------------------------------------------- static server

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
const server = await new Promise((resolve) => {
  const s = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const f = path.normalize(path.join(dist, p));
    if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) {
      process.stderr.write(`[harness server] 404 ${p}\n`); // names the missing file behind a "Failed to load resource" console error
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(f).pipe(res);
  });
  s.listen(0, "127.0.0.1", () => resolve(s));
});
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ------------------------------------------------------------------------------------------------- fictional data

const P = {
  rmm: "rmm",
  reg: "reg",
  saf: "saf",
  qm: "qm",
  mic: "mic",
  sus: "sus",
  cus: "cus",
  leg: "leg",
  admin: "admin",
  auditor: "auditor",
  owner: "owner",
  elena: "sup:u-sup-1",
  ravi: "sup:u-sup-2",
};
const DEPT_PERSONA = { RMM: "rmm", REG: "reg", SAF: "saf", QM: "qm", MIC: "mic", SUS: "sus" };
const DEPT_USER = { RMM: "u-rmm", REG: "u-reg", SAF: "u-saf", QM: "u-qm", MIC: "u-mic", SUS: "u-sus", CUS: "u-cus", LEG: "u-leg" };
const INTERNAL_USERS = ["u-rmm", "u-reg", "u-saf", "u-qm", "u-mic", "u-sus", "u-cus", "u-leg", "u-admin", "u-auditor", "u-owner"];
const SUPS = ["u-sup-1", "u-sup-2"];

/** Menus and landings of spec §3 (the harness checks the shell against them). */
const CFG = ["/admin/rules", "/admin/templates", "/admin/ownership"];
const NAV = {
  // 29 Oct (Thomas): every internal role but the admin also reads the configuration (CFG), read-only
  rmm: { landing: "/rmm", nav: ["/rmm", "/review", "/cases", "/suppliers", ...CFG] },
  reg: { landing: "/review", nav: ["/review", "/cases", ...CFG] },
  saf: { landing: "/review", nav: ["/review", "/cases", ...CFG] },
  qm: { landing: "/review", nav: ["/review", "/cases", ...CFG] },
  mic: { landing: "/review", nav: ["/review", "/cases", ...CFG] },
  sus: { landing: "/review", nav: ["/review", "/cases", ...CFG] },
  cus: { landing: "/cases", nav: ["/cases", ...CFG] },
  leg: { landing: "/cases", nav: ["/cases", ...CFG] },
  admin: { landing: "/admin/rules", nav: [...CFG, "/suppliers"], hidden: ["/admin/notifications"] },
  auditor: { landing: "/audit", nav: ["/audit", "/cases", ...CFG] },
  owner: { landing: "/reports", nav: ["/reports", "/cases", ...CFG] },
  "sup:u-sup-1": { landing: "/portal", nav: ["/portal", "/portal/help"] },
  "sup:u-sup-2": { landing: "/portal", nav: ["/portal", "/portal/help"] },
};
const INTERNAL_ROUTES = ["/rmm", "/review", "/cases", "/suppliers", "/reports", "/audit", "/admin/rules", "/admin/templates", "/admin/ownership", "/admin/notifications"];
/** What each menu route shows on the empty start (its designed empty state, or the configuration it maintains). */
const EMPTY_VIEW = {
  "/rmm": "dashboard-start",
  "/review": "review-queue",
  "/cases": "empty-cases",
  "/suppliers": "supplier-row-s1",
  "/admin/rules": "ruleset-card-RS-2026.1",
  "/admin/templates": "template-card-v1",
  "/admin/ownership": "owner-cell-GEN-RMM",
  "/admin/notifications": "empty-reminder-mails",
  "/audit": "empty-audit",
  "/reports": "empty-reports",
  "/portal": "empty-portal",
  "/portal/help": "empty-help-contacts",
};

const MAT = { name: "Solvasoft 300", inci: "Ethylhexyl Palmitate", no: "RM-410001" };
const pdf = (name) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4 harness ${name}`) });
const ORIGIN_LABEL = { vegetable: "Vegetable (bio mass)", animal: "Animal", mineral: "Mineral", petrochemical: "Petrochemical / fossil", polymer: "Polymer", waste: "Waste / side stream", ccu: "Carbon capture (CCU)", chemrec: "Chemical recycling of post-consumer plastic" };
/** domain/rmesSheet.ts ORIGIN_TEXT_FIELDS (the harness drives the built bundle, so it keeps its own copy): the free-text
 *  field(s) the RMES sheet shows for each Source of origin. */
const ORIGIN_TEXT = { vegetable: ["FLD-2.1-101", "FLD-2.3-10"], animal: ["FLD-2.1-101", "FLD-2.3-10"], petrochemical: ["FLD-2.3-11"], mineral: ["FLD-2.3-12"], ccu: ["FLD-2.3-13"], polymer: ["FLD-2.3-14"], waste: ["FLD-2.3-15"], chemrec: ["FLD-2.3-16"] };
/** What the retired criteria RMES showed and the fields BDF left out (not yellow): never on the RMES sheet. */
const NOT_ON_SHEET = /criteri|finding|\bPart [A-D]\b|AI suggestion|BDF limit|limit check|Process ID|RMT ID|IRMA|Declaration|Recorded RMES result|Approved|Rejected/i;

/** Thomas, 15 Oct (permissions.ts RELEASE_LOCKED_TEXT): the questionnaire is locked while the final release is requested. */
const RELEASE_LOCKED = "Your questionnaire is locked because Beiersdorf has requested your final release. If something must change, contact Beiersdorf; they can reopen the review.";

// Visible-text hygiene: technical leaks and prototype wording (spec §0) never show in the default UI.
const BAD_TEXT = [/\bNaN\b/, /\bundefined\b/, /\bInfinity\b/, /Invalid Date/, /\[object Object\]/];
const COPY_TEXT = [/\bprototype\b/i, /review version/i, /\bAS-\d{2}\b/, /\bassumptions?\b/i, /template chapter/i, /not in the portal yet/i, /to be confirmed by Beiersdorf/i, /\b0\s(d|days)\b/, /No supplier has answered a query yet/, /\ba additional\b/i];
/** Shown to suppliers only: no internal field-matrix ids (spec §0). */
const SUPPLIER_TEXT = [/\bFLD-[A-Z0-9.]+-\d+/, /\bR-\d{2,3}\b/];

// ------------------------------------------------------------------------------------------------- the runner

const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOW || undefined });
const results = [];

class Stop extends Error {}

function helpers(page, rec, tab) {
  const h = {
    page,
    tab,
    tid: (id) => page.getByTestId(id),
    async settle(ms = 40) {
      await page.waitForTimeout(ms);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
    },
    async load(route = "/") {
      await page.goto(`${ORIGIN}/#${route}`);
      await page.waitForFunction(() => !!window.__ciq, null, { timeout: 10000 });
      await h.settle(80);
    },
    async go(route) {
      if (page.url() === "about:blank") return h.load(route);
      await page.evaluate((r) => {
        location.hash = r;
      }, route);
      await h.settle(80);
    },
    async hash() {
      return page.evaluate(() => decodeURIComponent(location.hash.slice(1)));
    },
    async route() {
      return (await h.hash()).split("?")[0];
    },
    async waitRoute(re, timeout = 5000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (re.test(await h.route())) return true;
        await page.waitForTimeout(50);
      }
      return false;
    },
    async state() {
      return page.evaluate(() => window.__ciq.state());
    },
    async kase(id) {
      return (await h.state()).cases.find((c) => c.id === id);
    },
    async click(id, o = {}) {
      await h.tid(id).first().click(o);
      await h.settle();
    },
    async fill(id, v) {
      const l = h.tid(id).first();
      await l.fill(String(v));
      await h.settle(20);
    },
    async tick(id) {
      const l = h.tid(id).first();
      const tag = await l.evaluate((e) => e.tagName);
      await (tag === "INPUT" ? l : l.locator('input[type="checkbox"]').first()).check();
      await h.settle(20);
    },
    async visible(id, timeout = 4000) {
      return h
        .tid(id)
        .first()
        .waitFor({ state: "visible", timeout })
        .then(
          () => true,
          () => false,
        );
    },
    async isVisible(id) {
      return h.tid(id).first().isVisible().catch(() => false);
    },
    async attr(id, name) {
      return h.tid(id).first().getAttribute(name);
    },
    async text(id) {
      return id ? h.tid(id).first().innerText() : page.evaluate(() => document.body.innerText);
    },
    check(label, pass, detail) {
      rec.checks.push({ label: `${tab === "tab1" ? "" : `[${tab}] `}${label}`, pass: !!pass, ...(pass || detail === undefined ? {} : { detail }) });
      return !!pass;
    },
    /** A check the rest of the scenario depends on: a failure stops the scenario. */
    must(label, pass, detail) {
      if (!h.check(label, pass, detail)) throw new Stop(label);
    },
    async see(id, label, timeout) {
      return h.check(label ?? `sees ${id}`, await h.visible(id, timeout));
    },
    async seeMust(id, label, timeout) {
      h.must(label ?? `sees ${id}`, await h.visible(id, timeout));
    },
    async notSee(id, label) {
      const n = await h.tid(id).count();
      let vis = false;
      for (let i = 0; i < n; i++) vis ||= await h.tid(id).nth(i).isVisible().catch(() => false);
      return h.check(label ?? `does not see ${id}`, !vis);
    },
    /** After every step: no new console or page error, clean visible text, no broken invariant. */
    async step(label) {
      await h.settle(60);
      const r = await page.evaluate(() => ({
        text: document.body.innerText,
        title: document.title,
        menu: !!document.querySelector('[data-testid="person-menu"]'),
        supplier: (document.querySelector('[data-testid="person-chip"]')?.getAttribute("data-persona") ?? "").startsWith("sup:"),
        inv: window.__ciq ? window.__ciq.invariants() : ["window.__ciq is missing"],
      }));
      const problems = [];
      for (const re of BAD_TEXT) {
        const m = r.text.match(re);
        if (m) problems.push(`text shows “${around(r.text, m.index)}”`);
      }
      for (const re of COPY_TEXT) {
        if (r.menu && /prototype/i.test(re.source)) continue; // the demo menu's own toggle
        const m = r.text.match(re) ?? r.title.match(re);
        if (m) problems.push(`prototype wording “${around(r.text.match(re) ? r.text : r.title, m.index)}”`);
      }
      if (r.supplier && !r.menu)
        for (const re of SUPPLIER_TEXT) {
          const m = r.text.match(re);
          if (m) problems.push(`internal id shown to the supplier “${around(r.text, m.index)}”`);
        }
      if (r.inv.length) problems.push(`invariants: ${r.inv.join(" | ")}`);
      const fresh = rec.errors.slice(rec.seenErrors);
      rec.seenErrors = rec.errors.length;
      if (fresh.length) problems.push(...fresh.map((e) => e.slice(0, 300)));
      rec.steps++;
      h.check(`clean after: ${label}`, problems.length === 0, problems.slice(0, 6));
      if (SHOTS) {
        mkdirSync(path.join(out, "shots"), { recursive: true });
        const file = `${rec.id}-${String(rec.steps).padStart(2, "0")}-${tab}-${label.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.png`;
        await page.screenshot({ path: path.join(out, "shots", file), fullPage: true }).catch(() => {});
      }
    },
    async closeOverlays() {
      for (let i = 0; i < 3; i++) {
        const open = await page.locator('[role="dialog"], [data-testid="person-menu"]').count();
        if (!open) break;
        await page.keyboard.press("Escape");
        await h.settle(40);
      }
    },
    /** The demo menu: View as <persona>. Lands on the persona's landing page. */
    async viewAs(pid) {
      await h.closeOverlays();
      await h.click("person-chip");
      await h.tid("person-menu").waitFor({ timeout: 3000 });
      await h.click(`view-as-${pid}`);
      const ok = await page
        .waitForFunction((p) => document.querySelector('[data-testid="person-chip"]')?.getAttribute("data-persona") === p, pid, { timeout: 4000 })
        .then(
          () => true,
          () => false,
        );
      h.must(`View as ${pid}`, ok);
      await h.settle(60);
    },
    async persona() {
      return h.attr("person-chip", "data-persona");
    },
    /** The open toasts (a domain refusal is one with refusal: true). */
    async toasts() {
      return (await h.state()).toasts;
    },
  };
  return h;
}

const around = (text, i) => text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, " ");

async function scenario(id, title, fn) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "en-GB", timezoneId: "Europe/Berlin" });
  context.setDefaultTimeout(6000);
  const rec = { id, checks: [], errors: [], seenErrors: 0, steps: 0 };
  const attach = (page, tab) => {
    page.on("pageerror", (e) => rec.errors.push(`${tab} pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") rec.errors.push(`${tab} console: ${m.text()}`);
    });
  };
  const page = await context.newPage();
  attach(page, "tab1");
  const t = helpers(page, rec, "tab1");
  t.newTab = async (name) => {
    const p = await context.newPage();
    attach(p, name);
    return helpers(p, rec, name);
  };
  const t0 = Date.now();
  try {
    await fn(t);
  } catch (e) {
    rec.checks.push({ label: "scenario ran to the end", pass: false, detail: e instanceof Stop ? `stopped at: ${e.message}` : String(e.message || e).split("\n").slice(0, 4).join(" ").slice(0, 600) });
    for (const p of context.pages()) await p.screenshot({ path: path.join(out, `${id}-failure-${context.pages().indexOf(p) + 1}.png`) }).catch(() => {});
  }
  rec.checks.push({ label: "no console or page errors", pass: rec.errors.length === 0, ...(rec.errors.length ? { detail: rec.errors.slice(0, 5) } : {}) });
  await context.close();
  const pass = rec.checks.every((c) => c.pass);
  results.push({ id, title, pass, steps: rec.steps, ms: Date.now() - t0, checks: rec.checks });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${title} (${rec.checks.length} checks, ${rec.steps} steps, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  for (const c of rec.checks) if (!c.pass) console.log(`   ✗ ${c.label}${c.detail !== undefined ? " — " + JSON.stringify(c.detail).slice(0, 700) : ""}`);
}

// ------------------------------------------------------------------------------------------------- state helpers

const mailsTo = (s, uid) => s.mails.filter((m) => m.to.includes(uid));
const unreadOf = (s, uid) => s.mails.filter((m) => m.to.includes(uid) && !m.readBy.includes(uid)).length;
const ev = (s, event, caseId) => s.mails.filter((m) => m.event === event && (!caseId || m.caseId === caseId));
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const recipients = (mails) => [...new Set(mails.flatMap((m) => m.to))].sort();
const track = (c, d) => c.reviews.find((r) => r.dept === d);
const op = (c, id) => c.openPoints.find((p) => p.id === id);
const newOpId = (before, after) => after.openPoints.find((p) => !before.openPoints.some((q) => q.id === p.id))?.id;

// ------------------------------------------------------------------------------------------------- UI building blocks

/** RMM: New case through the form. `contacts` limits the preselected case contacts. Returns the new case id. */
async function createCase(t, { material = MAT.name, inci = MAT.inci, no = MAT.no, supplierId = "s1", contacts, markets = ["UK"], duplicateNote } = {}) {
  if ((await t.persona()) !== P.rmm) await t.viewAs(P.rmm);
  const before = (await t.state()).cases.map((c) => c.id);
  await t.go("/cases/new");
  await t.seeMust("newcase-form");
  await t.fill("newcase-material", material);
  await t.fill("newcase-inci", inci);
  await t.fill("newcase-material-no", no);
  await t.click(`newcase-supplier-${supplierId}`);
  if (contacts) {
    const s = await t.state();
    for (const u of s.users.filter((x) => x.supplierId === supplierId && x.active !== false)) {
      const box = t.tid(`newcase-contact-${u.id}`).locator('input[type="checkbox"]');
      if ((await box.isChecked()) !== contacts.includes(u.id)) await box.setChecked(contacts.includes(u.id));
    }
  }
  for (const m of markets) await t.click(`newcase-market-${m}`);
  if (duplicateNote) await t.fill("newcase-duplicate-note", duplicateNote);
  await t.click("newcase-submit");
  t.must("New case opens the created case", await t.waitRoute(/^\/cases\/CIQ-\d{4}-\d{4}$/));
  const id = (await t.route()).split("/").pop();
  t.must(`a new case id (${id})`, !before.includes(id));
  return id;
}

async function openRequest(t, caseId, s) {
  await t.go(`/portal/case/${caseId}${s ? `?s=${s}` : ""}`);
  await t.seeMust("supplier-request", `the request ${caseId} opens for the supplier`);
}

async function navSection(t, id) {
  await t.click(`q-nav-${id}`);
  await t.tid(id === "SF" ? "q-config-SF01" : `q-section-${id}`).first().waitFor({ timeout: 4000 });
}

const fieldBox = (t, fieldId) => t.tid(`q-field-${fieldId}`).first();

async function answerText(t, fieldId, value) {
  const input = fieldBox(t, fieldId).locator('textarea, input:not([type="file"]):not([type="checkbox"])').first();
  await input.fill(String(value));
  await input.blur();
  await t.settle(30);
}
async function answerYesNo(t, fieldId, yes) {
  await fieldBox(t, fieldId).getByRole("button", { name: yes ? "Yes" : "No", exact: true }).click();
  await t.settle(30);
}
async function answerChip(t, fieldId, label) {
  await fieldBox(t, fieldId).getByRole("button", { name: label, exact: true }).click();
  await t.settle(30);
}
async function answerSelect(t, fieldId, label) {
  await fieldBox(t, fieldId).getByRole("combobox").click();
  await t.page.getByRole("option", { name: label, exact: true }).click();
  await t.settle(30);
}
async function upload(t, fieldId, name) {
  await t.tid(`q-upload-${fieldId}`).first().locator('input[type="file"]').setInputFiles(pdf(name));
  await t.settle(30);
}
/** A metadata question: true/false for Yes/No, or a list of chips to click (toggles). */
async function config(t, q, v) {
  const box = t.tid(`q-config-${q}`).first();
  if (typeof v === "boolean") await box.getByRole("button", { name: v ? "Yes" : "No", exact: true }).click();
  else for (const label of v) await box.getByRole("button", { name: label, exact: true }).click();
  await t.settle(30);
}

const NO_FLAGS = { SF03: false, SF04: false, SF06: false, SF07: false, SF09: false, SF10: false, SF12: true };

/** A K2.1 row's Additive answer: Yes/No with no default (matrix v0.6 L5); the completeness gate names a row without it. */
async function additive(t, row, rowId, yes) {
  await row.getByTestId(`q-component-additive-${rowId}`).getByRole("button", { name: yes ? "Yes" : "No", exact: true }).click();
}

/** The parts of a minimal complete CIQ (origin Animal, no flags, micro test required), each filled through the UI. */
const PART = {
  GEN: async (t) => {
    await navSection(t, "GEN");
    await answerText(t, "FLD-GEN-004", "Solvaro Oleochemicals S.A., Polígono Industrial Sud, 43006 Tarragona, Spain");
    await answerText(t, "FLD-GEN-005", "Plant 2, Polígono Industrial Sud, 43006 Tarragona, Spain");
  },
  SF: async (t, flags = {}) => {
    await navSection(t, "SF");
    const cur = (await t.kase((await t.route()).split("/").pop())).config.SF01 ?? [];
    if (!cur.includes("animal")) await config(t, "SF01", ["Animal"]);
    for (const [q, v] of Object.entries({ ...NO_FLAGS, ...flags })) await config(t, q, v);
  },
  K1: async (t) => {
    await navSection(t, "K1");
    await upload(t, "FLD-K1-001", "SDS_Solvasoft300.pdf");
    await upload(t, "FLD-K1-002", "CoA_batch_2609-014.pdf");
    await upload(t, "FLD-K1-003", "Specification_Solvasoft300.pdf");
    // the evidence the rules ask for (R-00 statements; R-12 for the animal origin), each at its own K1 slot
    await upload(t, "FLD-K1-004", "Statements_Solvasoft300.pdf");
    for (const [f, name] of [["FLD-K1-006", "BSE_TSE_certificate_Solvasoft300.pdf"], ["FLD-K1-007", "Annex_II_419_conformity_Solvasoft300.pdf"]]) if (await t.tid(`q-upload-${f}`).count()) await upload(t, f, name);
  },
  "K2.1": async (t) => {
    await navSection(t, "K2.1");
    await t.click("q-component-add");
    const row = t.tid("q-component-c1");
    await row.getByPlaceholder("e.g. Tocopherol").fill("Ethylhexyl Palmitate");
    await row.getByPlaceholder("e.g. antioxidant").fill("emollient");
    await additive(t, row, "c1", false);
    await row.getByLabel("Minimum %").fill("98");
    await row.getByLabel("Maximum %").fill("100");
    await row.getByLabel("Maximum %").blur();
    await t.settle(30);
    await answerText(t, "FLD-2.1-102", "0.98");
  },
  "K2.2": async (t) => {
    await navSection(t, "K2.2");
    await upload(t, "FLD-2.2-001", "Contaminants_two_batches.pdf");
    await answerText(t, "FLD-A14-101", "0.1");
    await answerText(t, "FLD-A14-102", "0.05");
    await answerText(t, "FLD-A14-103", "1.2");
  },
  "K2.3": async (t) => {
    await navSection(t, "K2.3");
    await answerChip(t, "FLD-2.1-101", "Wool");
    await answerText(t, "FLD-2.3-10", "Spain");
    // feedstock and its content: in K2.3 on every case since the matrix v0.6 check (formerly Annex 1)
    await answerText(t, "FLD-A1-102", "Tallow");
    await answerText(t, "FLD-A1-103", "45");
    await answerText(t, "FLD-A1-104", "99");
  },
  "K5.1": async (t) => {
    await navSection(t, "K5.1");
    await upload(t, "FLD-5.1-001", "Micro_test_report.pdf");
  },
};
const ALL_PARTS = ["GEN", "SF", "K1", "K2.1", "K2.2", "K2.3", "K5.1"];

async function fillCiq(t, caseId, parts = ALL_PARTS, flags) {
  await openRequest(t, caseId);
  for (const p of parts) await PART[p](t, flags);
}

/** A contact who may confirm: the completeness check and the declaration modal. */
async function confirmCompleteness(t, caseId) {
  await openRequest(t, caseId);
  await t.click("confirm-completeness");
  await t.tick("confirm-agree");
  await t.click("confirm-submit");
  const c = await t.kase(caseId);
  t.must(`${caseId}: completeness confirmed (phase review)`, c.phase === "review", c.phase === "review" ? undefined : { phase: c.phase, blockers: await t.attr("completeness-bar", "data-blockers").catch(() => "?") });
}

/** From nothing to a case in review: RMM creates it, Elena fills everything and confirms. */
async function caseInReview(t, opts = {}) {
  const id = await createCase(t, opts);
  await t.viewAs(P.elena);
  await fillCiq(t, id, ALL_PARTS, opts.flags);
  await confirmCompleteness(t, id);
  await t.step(`${id} in review`);
  return id;
}

/** A reviewer asks the supplier on a field (or a whole section) in its review workspace. Returns the open point id. */
async function raise(t, caseId, { section, field, question, justification = "Needed for the assessment.", documentRequest = false }) {
  const before = await t.kase(caseId);
  await t.go(`/review/${caseId}?s=${section}`);
  await t.seeMust("review-workspace");
  await t.click(field ? `ask-field-${field}` : `ask-section-${section}`);
  if (documentRequest) await t.tid("ask-kind").getByRole("button", { name: "Document request", exact: true }).click();
  await t.fill("ask-question", question);
  await t.fill("ask-justification", justification);
  await t.click("ask-send");
  const after = await t.kase(caseId);
  const id = newOpId(before, after);
  t.must(`open point raised on ${field ?? section}`, !!id);
  return id;
}

/** The supplier answers a question in the answer drawer (from the request page's Questions for you). */
async function supplierAnswer(t, caseId, opId, text, { doc } = {}) {
  await t.go(`/portal/case/${caseId}?q=${opId}`);
  await t.seeMust("answer-drawer", `the answer drawer of ${opId} opens`);
  if (doc) {
    await t.click("answer-mode-upload");
    await t.tid("answer-file").locator('input[type="file"]').setInputFiles(pdf(doc));
    await t.settle(30);
    if (text) await t.fill("answer-comment", text);
  } else await t.fill("answer-text", text);
  await t.click("answer-send");
  await t.seeMust("answer-sent", `${opId}: the answer is sent`);
  await t.closeOverlays();
}

/** The raiser decides on an answered point: accept, or return with a reason. */
async function decide(t, caseId, opId, decision, reason = "") {
  await t.go(`/review/${caseId}?op=${opId}`);
  await t.seeMust(`op-decide-${opId}`, `${opId}: the raiser can decide`);
  if (decision === "accept") await t.click(`op-accept-${opId}`);
  else {
    await t.click(decision === "return" ? `op-return-${opId}` : `op-not-accepted-${opId}`);
    await t.fill("op-decide-reason", reason);
    await t.click("op-decide-confirm");
  }
}

/** Safety or Regulatory: the decision on the Questionnaire tab's decision card. Since BDF's RMES scope of 28 Oct the
 *  RMES takes no input (a read-only sheet of 8 fields) and the decision is the review's, outside it. */
async function recordDecision(t, caseId, dept, { decision = "approved", reason = "" } = {}) {
  await t.go(`/review/${caseId}`);
  await t.seeMust("decision-card", `${dept}: the decision card on the Questionnaire tab`);
  await t.tid("decision-choice").getByRole("button", { name: decision === "approved" ? "Approved" : "Rejected", exact: true }).click();
  if (reason) await t.fill("decision-reason", reason);
  await t.click("decision-record");
  const after = await t.kase(caseId);
  t.must(`${dept} decision recorded (${decision})`, track(after, dept)?.decision === decision);
}

/** The RMES sheet's text without its record time (to compare two readings). */
async function rmesSheetText(t, caseId) {
  await t.go(`/review/${caseId}?tab=rmes`);
  await t.seeMust("rmes-tab", "the RMES tab");
  return (await t.text("rmes-tab")).replace(/Record created [^\n]*/, "").replace(/\s+/g, " ").trim();
}

/** Safety / Regulatory: the RMES tab shows the case's 8 fields as the case holds them now, each with its CIQ source,
 *  and nothing else: no input, no decision, nothing of the criteria RMES, no Process / RMT / IRMA ID, no Declaration. */
async function checkRmesSheet(t, caseId, who) {
  await t.go(`/review/${caseId}?tab=rmes`);
  await t.seeMust("rmes-tab", `${who}: the RMES tab`);
  const s = await t.state();
  const c = s.cases.find((x) => x.id === caseId);
  const text = (v) => (Array.isArray(v) ? v.join(", ") : v === undefined || v === null || v === "" ? "" : String(v)).trim();
  const shown = (id, fallback = "") => text(c.answers[id]) || (c.justifications?.[id] ? `Cannot provide: ${c.justifications[id].trim()}` : "") || fallback || "Not answered yet";
  const flat = async (id) => (await t.text(id)).replace(/\s+/g, " ").trim();
  t.check(`${who}: the record line`, (await flat("rmes-record")) === `RMES · ${caseId} · internal: never visible to the supplier · filled automatically from the CIQ`, await flat("rmes-record"));
  t.check(`${who}: … and when the record was created`, /^Record created \d/.test(await flat("rmes-record-at")), await flat("rmes-record-at"));
  const supplier = s.suppliers.find((x) => x.id === c.supplierId)?.name ?? "";
  for (const [key, fid, want] of [["material", "FLD-GEN-001", shown("FLD-GEN-001", c.materialName)], ["supplier", "FLD-GEN-002", shown("FLD-GEN-002", supplier)], ["manufacturer", "FLD-GEN-004", shown("FLD-GEN-004")]]) {
    const h = await flat(`rmes-header-${key}`);
    t.check(`${who}: ${key} “${want.slice(0, 40)}”, with its source ${fid}`, h.includes(want.replace(/\s+/g, " ")) && h.includes(fid), h);
  }
  t.check(`${who}: the manufacturer is FLD-GEN-004 only, never the supplier's name in its place`, c.answers["FLD-GEN-004"] || !(await flat("rmes-header-manufacturer")).includes(supplier));
  const heads = await t.tid("rmes-composition").locator("th").evaluateAll((els) => els.map((e) => (e.firstElementChild ?? e).textContent.trim()));
  t.check(`${who}: the composition's columns`, JSON.stringify(heads) === JSON.stringify(["#", "INCI", "%", "CAS #", "EC #", "Source of origin", "Free text"]), heads);
  t.check(`${who}: one row per component, in K2.1 order`, JSON.stringify(await t.page.locator('[data-testid^="rmes-row-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice(9)))) === JSON.stringify(c.components.map((r) => r.id)));
  for (const r of c.components) {
    const row = await flat(`rmes-row-${r.id}`);
    const conc = r.concMin === r.concMax ? `${r.concMin} %` : `${r.concMin}–${r.concMax} %`;
    const free = (ORIGIN_TEXT[r.origin] ?? []).flatMap((f) => [f, shown(f)]);
    const miss = [r.inci, conc, r.cas || "—", r.ec || "—", ORIGIN_LABEL[r.origin], ...free].filter((v) => !row.includes(v));
    t.check(`${who}: ${r.inci}: INCI, %, CAS #, EC #, Source of origin and its free text with the field ids`, miss.length === 0, { row, miss });
  }
  const tab = t.tid("rmes-tab");
  const controls = await tab.locator("input, textarea, select, [role=combobox], [contenteditable=true]").count();
  const buttons = await tab.locator("button").evaluateAll((els) => els.map((e) => e.dataset.testid || e.textContent.trim()).filter((id) => !/^rmes-(source-FLD-|open-composition$)/.test(id)));
  t.check(`${who}: nothing on the sheet is editable (its only buttons open a source)`, controls === 0 && buttons.length === 0, { controls, buttons });
  const all = await t.text("rmes-tab");
  t.check(`${who}: nothing of the criteria RMES, no IDs, no Declaration, no decision on the sheet`, !NOT_ON_SHEET.test(all) && (await tab.locator('[data-testid="decision-card"]').count()) === 0, all.match(NOT_ON_SHEET)?.[0]);
  t.check(`${who}: no criteria or findings UI`, (await t.page.locator('[data-testid^="criterion-"], [data-testid^="finding-"], [data-testid="add-finding"], [data-testid="rmes-progress"]').count()) === 0);
}

async function completeReview(t, caseId, dept) {
  await t.go(`/review/${caseId}`);
  await t.seeMust("complete-review", `${dept}: Complete my review`);
  await t.click("complete-review");
  const c = await t.kase(caseId);
  t.must(`${dept} review completed`, track(c, dept)?.status === "completed", track(c, dept));
}

/** Every open track completes (Safety and Regulatory record their decision first); RMM last unless `rmmFirst`. With `only`, just
 *  those departments (the case then stays in review). */
async function completeAll(t, caseId, { rmmLast = true, only } = {}) {
  const c = await t.kase(caseId);
  const order = c.reviews.filter((r) => r.status !== "completed" && (!only || only.includes(r.dept))).map((r) => r.dept);
  const sorted = rmmLast ? [...order.filter((d) => d !== "RMM"), ...order.filter((d) => d === "RMM")] : order;
  for (const d of sorted) {
    await t.viewAs(DEPT_PERSONA[d]);
    const cur = await t.kase(caseId);
    if ((d === "SAF" || d === "REG") && !track(cur, d).decision) await recordDecision(t, caseId, d);
    await completeReview(t, caseId, d);
    await t.step(`${d} completed ${caseId}`);
  }
  const after = await t.kase(caseId);
  if (only) t.must(`${caseId}: ${only.join(", ")} completed, still in review`, after.phase === "review" && only.every((d) => track(after, d)?.status === "completed"), after.phase);
  else t.must(`${caseId}: every review completed, final release requested`, after.phase === "final-release", after.phase);
}

async function release(t, caseId) {
  await openRequest(t, caseId);
  await t.seeMust("final-release-card");
  await t.click("final-release");
  await t.tick("final-release-agree");
  await t.click("final-release-submit");
  const c = await t.kase(caseId);
  t.must(`${caseId}: final release given, case completed`, c.phase === "completed", c.phase);
}

/** The inbox drawer of the current persona: its mail count line and the items. */
async function inboxCount(t) {
  await t.click("inbox-button");
  await t.seeMust("inbox-drawer");
  const n = await t.page.locator('[data-testid^="inbox-item-"]').count();
  await t.closeOverlays();
  return n;
}

/** Every visible input that could change data inside the main area (frozen views have none). */
async function editableControls(t) {
  return t.page.locator('main input:not([type="checkbox"]):not([disabled]):not([readonly]), main textarea:not([disabled]):not([readonly])').count();
}

// ------------------------------------------------------------------------------------------------- scenarios

const SCENARIOS = [];
const def = (id, title, fn) => SCENARIOS.push({ id, title, fn });

def("S0", "empty start: every persona × every menu route", async (t) => {
  await t.load("/");
  const s = await t.state();
  t.check("0 cases", s.cases.length === 0, s.cases.length);
  t.check("0 mails", s.mails.length === 0, s.mails.length);
  t.check("1 supplier: Solvaro Oleochemicals S.A., DUNS 471203958", s.suppliers.length === 1 && s.suppliers[0].name === "Solvaro Oleochemicals S.A." && s.suppliers[0].duns === "471203958", s.suppliers);
  const contacts = s.users.filter((u) => u.side === "supplier" && u.active !== false);
  t.check("2 active supplier contacts: Elena Márquez and Ravi Menon", contacts.length === 2 && same(contacts.map((u) => u.name), ["Elena Márquez", "Ravi Menon"]), contacts.map((u) => u.name));
  t.check("11 internal people", s.users.filter((u) => u.side === "internal").length === 11);
  t.check("questionnaire v1 published, v2 draft, rule set RS-2026.1", s.templates.find((x) => x.version.endsWith("v1"))?.status === "published" && s.templates.find((x) => x.version.endsWith("v2"))?.status === "draft" && s.activeRuleSet === "RS-2026.1");
  t.check("starts as RMM on the dashboard", (await t.persona()) === P.rmm && (await t.route()) === "/rmm");
  await t.step("empty start");

  // the View-as menu lists everyone, nobody has a task or a mail
  await t.click("person-chip");
  const listed = await t.page.locator('[data-testid^="view-as-"]').evaluateAll((els) => els.map((e) => ({ id: e.dataset.testid.slice(8), tasks: e.dataset.tasks, unread: e.dataset.unread })));
  t.check("View as lists the 11 role holders and the 2 contacts", same(listed.map((x) => x.id), Object.keys(NAV)), listed.map((x) => x.id));
  t.check("nobody has a task or an unread mail", listed.every((x) => x.tasks === "0" && x.unread === "0"), listed);
  t.check("“Show prototype notes” is off", (await t.attr("toggle-prototype-notes", "aria-checked")) === "false");
  await t.closeOverlays();

  for (const [pid, spec] of Object.entries(NAV)) {
    await t.viewAs(pid);
    t.check(`${pid}: lands on ${spec.landing}`, (await t.route()) === spec.landing, await t.route());
    const nav = await t.tid("main-nav").first().locator("a").evaluateAll((els) => els.map((e) => decodeURIComponent(e.getAttribute("href") ?? "").replace(/^#/, "")));
    t.check(`${pid}: menu is ${spec.nav.join(" · ")}`, JSON.stringify(nav) === JSON.stringify(spec.nav), nav);
    t.check(`${pid}: inbox empty`, (await t.attr("inbox-button", "data-count")) === "0");
    for (const r of spec.nav) {
      await t.click(`nav-${r.replace(/^\//, "").replace(/\//g, "-")}`);
      t.check(`${pid}: menu ${r} opens ${r}`, (await t.route()) === r, await t.route());
      const want = r === "/review" ? "review-queue" : EMPTY_VIEW[r];
      await t.see(want, `${pid} ${r}: shows ${want}`);
      if (r === "/review") t.check(`${pid} /review: “No review tasks yet”`, (await t.text("review-queue")).includes("No review tasks yet"));
      if (r === "/admin/notifications" && pid === "admin") await t.see("run-reminders", "admin can run reminders");
      // only the business administrator maintains the supplier master; RMM looks it up read-only
      if (r === "/suppliers" && pid === "admin") await t.see("supplier-add", "admin /suppliers: Add supplier");
      if (r === "/suppliers" && pid === "rmm") {
        await t.notSee("supplier-add", "rmm /suppliers: no Add supplier");
        await t.see("suppliers-read-only", "rmm /suppliers: read-only note");
      }
      const zero = (await t.text()).match(/(^|\s)0 ?%|(^|\s)0 d\b/);
      t.check(`${pid} ${r}: no metric shows 0 % or 0 d without data`, !zero, zero && around(await t.text(), zero.index));
      await t.step(`${pid} ${r}`);
    }
    if (pid.startsWith("sup:")) {
      for (const r of INTERNAL_ROUTES) {
        await t.go(r);
        t.check(`${pid}: ${r} redirects to /portal`, (await t.route()) === "/portal", await t.route());
      }
      await t.go("/portal/tasks");
      t.check(`${pid}: /portal/tasks redirects to /portal`, (await t.route()) === "/portal", await t.route());
      await t.see("empty-portal", `${pid}: No requests yet`);
      await t.click("inbox-button");
      await t.see("inbox-empty", `${pid}: inbox says no mail yet`);
      await t.closeOverlays();
      await t.step(`${pid} redirects`);
    } else {
      for (const r of INTERNAL_ROUTES.filter((x) => !spec.nav.includes(x) && !(spec.hidden ?? []).includes(x) && x !== "/cases")) {
        await t.go(r);
        t.check(`${pid}: ${r} outside the menu shows NoAccess`, await t.visible("no-access", 2500));
      }
      // hidden from the menu but still open by address (Reminders for the admin, Thomas 15 Oct)
      for (const r of spec.hidden ?? []) {
        await t.go(r);
        t.check(`${pid}: ${r} (hidden from the menu) still opens by address`, !(await t.visible("no-access", 800)) && (await t.route()) === r, await t.route());
        if (r === "/admin/notifications") await t.see("run-reminders", `${pid}: the hidden Reminders page works`);
      }
      await t.go("/portal");
      t.check(`${pid}: /portal redirects to the landing`, (await t.route()) === spec.landing, await t.route());
      await t.go("/understanding");
      t.check(`${pid}: the removed /understanding route goes to the landing`, (await t.route()) === spec.landing, await t.route());
      await t.step(`${pid} NoAccess`);
    }
  }
  const after = await t.state();
  t.check("browsing changed no data", after.cases.length === 0 && after.mails.length === 0 && after.log.length === 0);
});

def("S1", "the full demo flow from nothing", async (t) => {
  await t.load("/");
  t.must("starts on the RMM dashboard", (await t.route()) === "/rmm");
  await t.seeMust("dashboard-start");
  await t.step("dashboard start card");

  // 1. RMM starts the case; an empty form lists every missing item
  await t.click("new-case");
  await t.seeMust("newcase-form");
  await t.click("newcase-submit");
  const missing = Number(await t.attr("newcase-errors", "data-count"));
  t.check("an empty New case lists every missing item (≥ 4)", missing >= 4, missing);
  await t.step("New case: missing items listed");
  const id = await createCase(t, {});
  t.check("the first case is CIQ-2026-0001", id === "CIQ-2026-0001", id);
  let s = await t.state();
  let c = s.cases[0];
  t.check("phase supplier-input with live scope", c.phase === "supplier-input" && c.liveScope === true);
  t.check("both contacts are case contacts", same(c.supplierContactIds, SUPS), c.supplierContactIds);
  t.check("target markets EU and UK (SF-11, RMM)", same(c.config.SF11, ["EU", "UK"]), c.config.SF11);
  t.check("one invitation mail to both contacts", ev(s, "invitation").length === 1 && same(ev(s, "invitation")[0].to, SUPS));
  t.check("no review task yet", c.reviews.length === 0);
  await t.step("case created");

  // 2. Elena: invitation mail → request
  await t.viewAs(P.elena);
  t.check("Elena has 1 unread mail", (await t.attr("inbox-button", "data-count")) === "1");
  t.check("a first visit greets Elena without “back”", (await t.text()).includes("Welcome, Elena") && !(await t.text()).includes("Welcome back"));
  await t.see(`task-questionnaire-${id}`, "Elena's task: fill in the CIQ");
  await t.click("inbox-button");
  await t.click(`inbox-item-${ev(s, "invitation")[0].id}`);
  await t.see("inbox-reading-pane");
  await t.click("inbox-open-link");
  t.check("the invitation link opens the request", (await t.route()) === `/portal/case/${id}`, await t.route());
  await t.seeMust("supplier-request");
  await t.step("Elena opens the request from the invitation");

  // GEN and the metadata questions; sections open and close live, answers in a closed section are kept
  await navSection(t, "GEN");
  const locked = [];
  for (const f of ["FLD-GEN-001", "FLD-GEN-002", "FLD-GEN-003", "FLD-GEN-008", "FLD-GEN-009"]) if ((await fieldBox(t, f).locator("input, textarea").count()) === 0) locked.push(f);
  t.check("trade name, supplier, DUNS and contact e-mails are set by Beiersdorf (read-only for the supplier)", locked.length === 5, locked);
  t.check("they show Beiersdorf's values", (await fieldBox(t, "FLD-GEN-001").innerText()).includes(MAT.name) && (await fieldBox(t, "FLD-GEN-003").innerText()).includes("471203958"));
  await PART.GEN(t);
  await t.step("GEN answered");
  await navSection(t, "SF");
  await config(t, "SF01", [ORIGIN_LABEL.vegetable]);
  t.check("Vegetable opens Annex 1, 2 and 9 live", (await t.isVisible("q-nav-A1")) && (await t.isVisible("q-nav-A2")) && (await t.isVisible("q-nav-A9")));
  await t.step("SF-01 Vegetable");
  await navSection(t, "A2");
  await answerText(t, "FLD-A2-101", "Ethylhexyl Palmitate (IUPAC: 2-ethylhexyl hexadecanoate)");
  await navSection(t, "SF");
  await config(t, "SF01", [ORIGIN_LABEL.animal, ORIGIN_LABEL.vegetable]);
  t.check("switching to Animal closes Annex 2 live", !(await t.isVisible("q-nav-A2")));
  c = await t.kase(id);
  t.check("the Annex 2 answer is kept while closed", typeof c.answers["FLD-A2-101"] === "string" && c.answers["FLD-A2-101"].startsWith("Ethylhexyl"), c.answers["FLD-A2-101"]);
  t.check("Annex 2 is N.A. in the scope", c.scope.find((x) => x.sectionId === "A2")?.applicability === "na");
  await t.step("SF-01 Animal: A2 closed");
  await config(t, "SF01", [ORIGIN_LABEL.vegetable]);
  t.check("Vegetable again reopens Annex 2", await t.visible("q-nav-A2", 2000));
  await navSection(t, "A2");
  const kept = await fieldBox(t, "FLD-A2-101").locator("input").inputValue();
  t.check("the reopened Annex 2 shows the kept answer", kept.startsWith("Ethylhexyl Palmitate"), kept);
  await t.step("A2 reopened with its answer");
  await navSection(t, "SF");
  await config(t, "SF01", [ORIGIN_LABEL.vegetable]); // final origin: Animal only
  for (const [q, v] of Object.entries(NO_FLAGS)) await config(t, q, v);
  c = await t.kase(id);
  t.check("SF-01 = Animal and every required metadata question answered", same(c.config.SF01, ["animal"]) && ["SF03", "SF04", "SF06", "SF07", "SF09", "SF10", "SF12"].every((k) => c.config[k] !== undefined), c.config);
  t.check("Annex 1, 2 and 9 are closed again", !(await t.isVisible("q-nav-A1")) && !(await t.isVisible("q-nav-A2")));
  await t.step("metadata answered");
  await PART["K2.1"](t);
  await PART["K2.3"](t);
  await t.step("Elena filled K2.1 and K2.3");

  // completeness is blocked, the blockers are named
  await t.click("check-completeness");
  const blockerText = await t.text("blocker-panel");
  t.check("the check names the missing items", Number(await t.attr("blocker-panel", "data-count")) >= 5 && blockerText.includes("Safety data sheet (SDS)") && blockerText.includes("Microbiological test report"), blockerText.slice(0, 400));
  t.check("the evidence the rules ask for is required too (statements; BSE/TSE and Annex II entry 419 for the animal origin)", ["Statements", "BSE/TSE certificate", "Conformity with Annex II entry 419"].every((x) => blockerText.includes(x)), blockerText.slice(0, 600));
  await t.click("confirm-completeness");
  t.check("the confirmation cannot be submitted while items are missing", await t.tid("confirm-submit").isDisabled());
  await t.step("completeness blocked");
  await t.closeOverlays();

  // 3. Ravi fills other sections in parallel; every answer shows who entered it
  await t.viewAs(P.ravi);
  await t.click(`continue-${id}`);
  await t.seeMust("supplier-request");
  await PART.K1(t);
  await PART["K2.2"](t);
  await PART["K5.1"](t);
  // a documents-only section: Ravi adds the customs statement to K7 (optional, never blocking)
  await navSection(t, "K7");
  await upload(t, "K7", "Customs_statement_HS_code.pdf");
  t.check("the K7 upload is stored on the section", (await t.kase(id)).documents.some((d) => d.sectionId === "K7" && !d.fieldId && d.name === "Customs_statement_HS_code.pdf"));
  await navSection(t, "K1");
  t.check("Ravi sees his own upload attributed to him", (await fieldBox(t, "FLD-K1-001").innerText()).includes("Uploaded by Ravi Menon (you)"));
  await t.step("Ravi filled K1, K2.2 and K5.1");
  await t.viewAs(P.elena);
  await openRequest(t, id, "K1");
  t.check("Elena sees Ravi's upload attributed to Ravi", (await fieldBox(t, "FLD-K1-001").innerText()).includes("Uploaded by Ravi Menon") && !(await fieldBox(t, "FLD-K1-001").innerText()).includes("Ravi Menon (you)"));
  await navSection(t, "GEN");
  t.check("Elena sees her own answer attributed to her", (await fieldBox(t, "FLD-GEN-004").innerText()).includes("Answered by Elena Márquez (you)"));
  await t.click("check-completeness");
  t.check("nothing is missing any more", (await t.attr("blocker-panel", "data-count")) === "0");
  await t.step("attribution and complete check");
  await t.click("confirm-completeness");
  await t.tick("confirm-agree");
  await t.click("confirm-submit");
  s = await t.state();
  c = s.cases[0];
  t.must("completeness confirmed: phase review", c.phase === "review", c.phase);
  const conf = c.confirmations.find((x) => x.type === "completeness");
  t.check("the confirmation records name, e-mail, role and time", conf && conf.name === "Elena Márquez" && conf.email === "elena.marquez@solvaro.example" && conf.role === "Regulatory Manager" && !!conf.at, conf);
  t.check("tracks: RMM plus only the concerned departments (Regulatory, Safety, QM, Microbiology)", same(c.reviews.map((r) => r.dept), ["RMM", "REG", "SAF", "QM", "MIC"]), c.reviews.map((r) => r.dept));
  t.check("RMM's review is assigned to the case owner", track(c, "RMM").assigneeId === "u-rmm");
  t.check("review-assigned mails to exactly RMM, Regulatory, Safety, QM and Microbiology", same(recipients(ev(s, "review-assigned", id)), ["u-rmm", "u-reg", "u-saf", "u-qm", "u-mic"]), recipients(ev(s, "review-assigned", id)));
  t.check("Customs and Legal are informed (one mail each, on K7 and K8)", ev(s, "informed", id).length === 2 && same(recipients(ev(s, "informed", id)), ["u-cus", "u-leg"]) && ev(s, "informed", id).every((m) => m.link.endsWith(`&s=${m.to[0] === "u-cus" ? "K7" : "K8"}`)));
  t.check("Sustainability got nothing", mailsTo(s, "u-sus").length === 0);
  t.check("an RMES record exists (Safety and Regulatory review), header only: no criteria, no findings", !!c.rmes?.createdAt && c.rmes.criteria.length === 0 && c.rmes.findings.length === 0, c.rmes);
  await t.step("completeness confirmed: reviews activated");
  await t.click("person-chip");
  const tasks = Object.fromEntries(await t.page.locator('[data-testid^="view-as-"]').evaluateAll((els) => els.map((e) => [e.dataset.testid.slice(8), Number(e.dataset.tasks)])));
  t.check("View as: one review task each for RMM, Regulatory, Safety, QM and Microbiology, none for the others", JSON.stringify(["rmm", "reg", "saf", "qm", "mic", "sus", "cus", "leg", "admin", "auditor", "owner"].map((k) => tasks[k])) === JSON.stringify([1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]), tasks);
  await t.closeOverlays();
  await t.see("questionnaire-heading", "after the confirmation the questionnaire stays editable (its heading says so)");
  t.check("the heading does not say read-only over an editable questionnaire", !(await t.text("questionnaire-heading")).toLowerCase().includes("read-only"));

  // Customs and Legal are informed and read-only: the case opens on their section
  for (const [pid, sec] of [[P.cus, "K7"], [P.leg, "K8"]]) {
    await t.viewAs(pid);
    t.check(`${pid}: the informed mail is in the inbox`, (await t.attr("inbox-button", "data-count")) === "1");
    if (pid === P.cus) {
      // Customs follows the mail's link; Legal opens the case from the Cases list
      await t.click("inbox-button");
      await t.click(`inbox-item-${ev(s, "informed", id).find((m) => m.to.includes("u-cus")).id}`);
      await t.click("inbox-open-link");
    } else await t.click(`case-row-${id}`);
    t.check(`${pid}: the case opens on ${sec}`, (await t.hash()) === `/cases/${id}?tab=questionnaire&s=${sec}`, await t.hash());
    await t.see(`q-section-${sec}`, `${pid}: ${sec} is shown`);
    t.check(
      `${pid}: the section navigator shows ${sec} selected, scrolled into view`,
      await t.page.evaluate((sec) => {
        const nav = document.querySelector('[data-testid="q-outline"]');
        const row = document.querySelector(`[data-testid="q-outline-${sec}"]`);
        if (!nav || !row || row.getAttribute("aria-current") !== "true") return false;
        const n = nav.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        return r.top >= n.top - 1 && r.bottom <= n.bottom + 1;
      }, sec),
    );
    if (pid === P.cus) t.check("Customs reads the K7 document on its card", (await t.text("q-focus-docs-K7")).includes("Customs_statement_HS_code.pdf"));
    t.check(`${pid}: ${sec} opens as a full card with what it covers, its documents and questions`, (await t.attr(`q-section-${sec}`, "data-focus")) === "true" && (await t.isVisible(`q-focus-docs-${sec}`)) && (await t.text(`q-section-${sec}`)).includes(sec === "K7" ? "HS code" : "Patents"));
    if (pid === P.cus) {
      await t.fill("q-focus-note-K7", "HS code 1516 20 to be checked against the CoA.");
      await t.click("q-focus-note-add-K7");
      const n = (await t.kase(id)).internalNotes.at(-1);
      t.check("Customs posts an internal note on K7 from the card", n && n.sectionId === "K7" && n.by === "u-cus", n);
      t.check("the note is listed on the K7 card", (await t.text("q-focus-notes-K7")).includes("HS code 1516 20"));
    }
    await t.notSee("case-cancel", `${pid}: no RMM action`);
    await t.notSee("case-open-review", `${pid}: no review of its own`);
    await t.step(`${pid} reads the case`);
  }

  // 4. Regulatory raises a query on a field, edits it; the supplier sees the change
  await t.viewAs(P.reg);
  t.check("Regulatory has the review-assigned mail", (await t.attr("inbox-button", "data-count")) === "1");
  await t.click(`review-row-${id}`);
  t.check("the queue row opens the review workspace", (await t.route()) === `/review/${id}`);
  await t.step("Regulatory workspace");
  const op1 = await raise(t, id, { section: "K2.1", field: "FLD-2.1-102", question: "Please confirm the natural origin index of 0.98.", justification: "Needed to verify the natural origin claim." });
  t.check("first open point is OP-0001-01", op1 === "OP-0001-01", op1);
  s = await t.state();
  c = s.cases[0];
  t.check("op-raised mail to both contacts (open-point channel)", ev(s, "op-raised", id).length === 1 && same(ev(s, "op-raised", id)[0].to, SUPS) && ev(s, "op-raised", id)[0].channel === "open-point-webhook");
  t.check("the Regulatory track waits for the supplier", track(c, "REG").status === "waiting-supplier");
  await t.step("OP-0001-01 raised");
  await t.click(`op-edit-${op1}`);
  await t.fill("op-edit-question", "Please send the ISO 16128 calculation behind the natural origin index of 0.98.");
  await t.click("op-edit-save");
  s = await t.state();
  c = s.cases[0];
  t.check("editing an unanswered question starts no new round", op(c, op1).rounds === 1 && op(c, op1).status === "open" && op(c, op1).edits?.length === 1, op(c, op1));
  t.check("op-edited mail to both contacts", ev(s, "op-edited", id).length === 1 && same(ev(s, "op-edited", id)[0].to, SUPS));
  await t.step("OP-0001-01 edited");

  // 5. Elena sees "changed" and the mail, answers; the raiser gets the mail
  await t.viewAs(P.elena);
  t.check("Elena's task row shows the question as changed by Beiersdorf", (await t.text(`task-${op1}`)).includes("Changed by Beiersdorf"));
  t.check("Elena's inbox has the raised and the changed mail", mailsTo(s, "u-sup-1").filter((m) => m.event === "op-raised" || m.event === "op-edited").length === 2);
  await t.click(`answer-${op1}`);
  await t.seeMust("answer-drawer");
  t.check("the drawer shows the changed question and the change in the conversation", (await t.text("answer-drawer")).includes("ISO 16128 calculation") && (await t.page.locator('[data-testid^="thread-"][data-action="edited"]').count()) === 1);
  await t.fill("answer-text", "The index is 0.98 according to ISO 16128-2; the calculation follows.");
  await t.click("answer-send");
  await t.seeMust("answer-sent");
  await t.closeOverlays();
  s = await t.state();
  t.check("op-answered goes to the raiser only (raiser = responsible)", ev(s, "op-answered", id).length === 1 && same(ev(s, "op-answered", id)[0].to, ["u-reg"]));
  await t.step("Elena answered OP-0001-01");

  // 6. the raiser returns it, Elena answers again with a document, the raiser accepts
  await t.viewAs(P.reg);
  await decide(t, id, op1, "return", "The calculation sheet is missing; please attach it.");
  s = await t.state();
  c = s.cases[0];
  t.check("returned: round 2, back with the supplier, op-returned mail", op(c, op1).status === "open" && op(c, op1).rounds === 2 && ev(s, "op-returned", id).length === 1);
  await t.step("OP-0001-01 returned");
  await t.viewAs(P.elena);
  t.check("Elena sees “More information needed”", (await t.text(`task-${op1}`)).includes("More information needed"));
  t.check("a returning contact is greeted with “Welcome back”", (await t.text()).includes("Welcome back, Elena"));
  await supplierAnswer(t, id, op1, "Calculation attached.", { doc: "ISO16128_calculation.pdf" });
  c = await t.kase(id);
  t.check("the document is stored at the question's item and referenced from the reply", c.documents.some((d) => d.name === "ISO16128_calculation.pdf" && d.sectionId === "K2.1") && op(c, op1).thread.at(-1).documentId);
  t.check("the answer to the question's field is unchanged (0.98)", c.answers["FLD-2.1-102"] === 0.98, c.answers["FLD-2.1-102"]);
  await t.step("Elena answered round 2 with a document");
  await t.viewAs(P.reg);
  await decide(t, id, op1, "accept");
  s = await t.state();
  c = s.cases[0];
  t.check("accepted: closed with outcome accepted, op-accepted mail", op(c, op1).status === "closed" && op(c, op1).outcome === "accepted" && ev(s, "op-accepted", id).length === 1);
  t.check("op-answered went to Regulatory twice", ev(s, "op-answered", id).length === 2 && ev(s, "op-answered", id).every((m) => same(m.to, ["u-reg"])));
  await t.step("OP-0001-01 accepted");

  // 7. Safety raises a point and withdraws it (internal reason)
  await t.viewAs(P.saf);
  const op2 = await raise(t, id, { section: "K2.2", field: "FLD-A14-101", question: "Please state the arsenic analysis method." });
  await t.click(`op-close-${op2}`);
  await t.fill("op-close-reason", "Covered by the analytical evidence already uploaded in K2.2.");
  await t.click("op-close-confirm");
  s = await t.state();
  c = s.cases[0];
  t.check(`${op2} withdrawn by its raiser, op-closed mail without the reason`, op(c, op2).outcome === "withdrawn" && ev(s, "op-closed", id).length === 1 && !ev(s, "op-closed", id)[0].body.includes("Covered by the analytical"));
  await t.step(`${op2} withdrawn`);
  await t.viewAs(P.ravi);
  await t.go(`/portal/case/${id}`);
  t.check(`Ravi sees ${op2} as “Closed, no answer needed” without the reason`, (await t.text(`question-${op2}`)).includes("Closed, no answer needed") && !(await t.text()).includes("Covered by the analytical"));
  await t.step(`supplier view of ${op2}`);

  // 8. RMM raises and closes its own query (accepts the answer)
  await t.viewAs(P.rmm);
  await t.seeMust("tile-my-open", "the dashboard shows the live tiles");
  t.check("dashboard: 1 open case", (await t.attr("tile-my-open", "data-count")) === "1");
  await t.step("RMM dashboard with a live case");
  await t.click("nav-review");
  await t.click(`review-row-${id}`);
  t.check("RMM reviews in the same workspace", (await t.route()) === `/review/${id}`);
  await t.notSee("add-section", "RMM never adds sections");
  const op3 = await raise(t, id, { section: "GEN", field: "FLD-GEN-005", question: "Please confirm that the plant number is part of the production site address." });
  await t.step(`RMM raised ${op3}`);
  await t.viewAs(P.elena);
  await t.go("/portal");
  await t.click(`answer-${op3}`);
  await t.fill("answer-text", "Confirmed: Plant 2 is the production site.");
  await t.click("answer-send");
  await t.closeOverlays();
  await t.viewAs(P.rmm);
  await decide(t, id, op3, "accept");
  c = await t.kase(id);
  t.check(`${op3} accepted by RMM`, op(c, op3).outcome === "accepted");
  await t.step(`${op3} accepted`);
  t.check("op-answered of RMM's point went to RMM", ev(await t.state(), "op-answered", id).some((m) => m.opId === op3 && same(m.to, ["u-rmm"])));

  // 9. Regulatory and Safety read the RMES sheet (the 8 fields from the CIQ) and decide on the Questionnaire tab; QM and
  // Microbiology complete; RMM completes last
  let sheet = "";
  for (const d of ["REG", "SAF"]) {
    await t.viewAs(DEPT_PERSONA[d]);
    await checkRmesSheet(t, id, d);
    const now = await rmesSheetText(t, id);
    if (sheet) t.check("Safety sees the same RMES sheet as Regulatory (one RMES for both)", now === sheet, [now.slice(0, 200), sheet.slice(0, 200)]);
    sheet = now;
    await t.step(`${d} RMES sheet`);
    await recordDecision(t, id, d, { reason: `RMES-${d}-NOTE checked against the evidence` });
    await t.step(`${d} decision recorded`);
    await completeReview(t, id, d);
    await t.step(`${d} completed`);
  }
  for (const d of ["QM", "MIC"]) {
    await t.viewAs(DEPT_PERSONA[d]);
    await completeReview(t, id, d);
    await t.step(`${d} completed`);
  }
  s = await t.state();
  t.check("no release request while RMM is still open", ev(s, "release-requested", id).length === 0 && s.cases[0].phase === "review");
  await t.viewAs(P.rmm);
  await completeReview(t, id, "RMM");
  s = await t.state();
  c = s.cases[0];
  t.check("all tracks completed → final-release", c.phase === "final-release");
  t.check("exactly one release-request mail, to both contacts", ev(s, "release-requested", id).length === 1 && same(ev(s, "release-requested", id)[0].to, SUPS));
  await t.step("all reviews completed");

  // 10. the supplier gives the final release; the case completes and the final document goes to RMM
  await t.viewAs(P.elena);
  await t.see(`release-${id}`, "Elena's task: give the final release");
  await t.click(`release-${id}`);
  t.check("the release card is not blocked", (await t.attr("final-release-card", "data-blocked")) === "false");
  await t.click("final-release");
  await t.tick("final-release-agree");
  await t.click("final-release-submit");
  s = await t.state();
  c = s.cases[0];
  t.must("the final release completes the case", c.phase === "completed", c.phase);
  t.check("the final document exists", !!c.finalDocument?.fingerprint);
  t.check("release-receipt mail to both contacts", ev(s, "release-receipt", id).length === 1 && same(ev(s, "release-receipt", id)[0].to, SUPS));
  t.check("final-document mail to the RMM owner only, on its own channel", ev(s, "final-document", id).length === 1 && same(ev(s, "final-document", id)[0].to, ["u-rmm"]) && ev(s, "final-document", id)[0].channel === "final-document");
  await t.step("released and completed");
  await t.see("release-record", "the supplier sees its confirmations");
  t.check("the supplier sees completeness and release, not the department completions", (await t.page.locator('[data-testid^="confirmation-"]').count()) === 2);
  t.check("the frozen questionnaire offers no editable control", (await editableControls(t)) === 0, await editableControls(t));
  t.check("the frozen questionnaire's heading says so", (await t.text("questionnaire-heading")).includes("released questionnaire"));
  await t.notSee("final-document", "no final document for the supplier");
  await t.step("supplier: frozen request");

  // 11. RMM opens the final document from its mail
  await t.viewAs(P.rmm);
  await t.click("inbox-button");
  await t.click(`inbox-item-${ev(s, "final-document", id)[0].id}`);
  await t.click("inbox-open-link");
  t.check("the mail link opens the Final document tab", (await t.hash()) === `/cases/${id}?tab=final-document`, await t.hash());
  await t.seeMust("final-document");
  const fd = await t.text("final-document");
  t.check("FD: the CIQ ID", fd.includes(id));
  t.check("FD: the document seal, verified (green check), with its code", (await t.attr("fd-fingerprint", "data-verified")) === "true" && (await t.text("fd-fingerprint")).includes("Document seal: unchanged") && fd.includes(c.finalDocument.fingerprint));
  t.check("FD: the released answers by section", (await t.text("fd-section-GEN")).includes("Polígono Industrial Sud") && (await t.text("fd-section-K2.3")).includes("Wool"));
  t.check("FD: the evidence with file names and uploaders", ["SDS_Solvasoft300.pdf", "CoA_batch_2609-014.pdf", "Micro_test_report.pdf", "ISO16128_calculation.pdf"].every((n) => fd.includes(n)) && (await t.text("fd-evidence")).includes("Ravi Menon"));
  const t1 = await t.text(`fd-op-${op1}`);
  const needles1 = ["Round 1", "Round 2", "calculation sheet is missing", "ISO 16128-2", "ISO16128_calculation.pdf", "Accepted"].filter((x) => !t1.toLowerCase().includes(x.toLowerCase()));
  t.check("FD: OP-0001-01 as text, round by round, with the return and both answers", needles1.length === 0, { missing: needles1 });
  const t2 = await t.text(`fd-op-${op2}`);
  t.check("FD: the closed point without its internal reason", t2.includes("Closed, no answer needed") && !t2.includes("Covered by the analytical"), t2.slice(0, 300));
  t.check(`FD: RMM's point ${op3}`, (await t.text(`fd-op-${op3}`)).includes("Plant 2"));
  t.check("FD: completeness, 5 review completions and the final release", (await t.tid("fd-confirmation-completeness").count()) === 1 && (await t.tid("fd-confirmation-dept-completion").count()) === 5 && (await t.tid("fd-confirmation-final-release").count()) === 1);
  t.check("FD: the header names the manufacturer and site the supplier answered", c.finalDocument.header.site.startsWith("Plant 2") && c.finalDocument.header.manufacturer.includes("Polígono Industrial Sud"), c.finalDocument.header);
  t.check("FD: no answer of a section that closed (Annex 2)", !fd.includes("2-ethylhexyl hexadecanoate") && (await t.tid("fd-section-A2").count()) === 0);
  t.check("FD: no RMES content (no decision comment, no sheet label, nothing of the criteria RMES)", LEAK_TERMS.every((x) => !fd.includes(x)), LEAK_TERMS.filter((x) => fd.includes(x)));
  t.check("FD: a documents-only section names its file, the others say no document was provided", (await t.attr("fd-section-K7", "data-files")) === "1" && (await t.text("fd-section-K7")).includes("Customs_statement_HS_code.pdf") && (await t.text("fd-section-K8")).includes("No document provided"));
  t.check("FD: the rule evidence is in the evidence list", ["Statements_Solvasoft300.pdf", "BSE_TSE_certificate_Solvasoft300.pdf", "Annex_II_419_conformity_Solvasoft300.pdf"].every((n) => fd.includes(n)));
  t.check("FD: numbers keep their unit", (await t.text("fd-section-K2.2")).includes("0.1 mg/kg"), (await t.text("fd-section-K2.2")).slice(0, 300));
  const md = await t.text("fd-metadata").catch(() => "");
  t.check("FD: the metadata answers SF-01…SF-12 that set the scope", ["SF-01", "SF-03", "SF-07", "SF-12", "SF-11"].every((x) => md.includes(x)) && md.includes("Set by Beiersdorf at case start") && md.includes("Elena Márquez"), md.slice(0, 400));
  await t.step("final document");
  await t.notSee("case-cancel", "a completed case cannot be cancelled");

  // 12. inbox counts per person
  s = await t.state();
  const expected = { "u-sup-1": 11, "u-sup-2": 11, "u-rmm": 3, "u-reg": 3, "u-saf": 1, "u-qm": 1, "u-mic": 1, "u-sus": 0, "u-cus": 1, "u-leg": 1, "u-admin": 0, "u-auditor": 0, "u-owner": 0 };
  const got = Object.fromEntries(Object.keys(expected).map((u) => [u, mailsTo(s, u).length]));
  t.check("mails per person as expected", JSON.stringify(got) === JSON.stringify(expected), got);
  await t.click("person-chip");
  const menu = await t.page.locator('[data-testid^="view-as-"]').evaluateAll((els) => els.map((e) => ({ id: e.dataset.testid.slice(8), unread: Number(e.dataset.unread) })));
  const uid = (pid) => (pid.startsWith("sup:") ? pid.slice(4) : `u-${pid}`);
  t.check("View as shows each person's unread count", menu.every((m) => m.unread === unreadOf(s, uid(m.id))), menu);
  await t.closeOverlays();
  t.check("RMM's inbox lists its 3 mails", (await inboxCount(t)) === 3);
  await t.viewAs(P.ravi);
  t.check("Ravi's inbox lists his 11 mails", (await inboxCount(t)) === 11);
  await t.step("inbox counts");

  // 13. oversight with data: reports, the audit trail (a case ID opens its history), the RMM dashboard
  await t.viewAs(P.owner);
  await t.notSee("empty-reports", "Reports has data");
  t.check("Reports shows its four sections", (await t.page.locator('[data-testid^="report-section-"]').count()) === 4, await t.page.locator('[data-testid^="report-section-"]').count());
  t.check("Reports: 1 completed case", (await t.text("kpi-completed").catch(() => "")).includes("1"), await t.text("kpi-completed").catch(() => "missing"));
  const rep = await t.text();
  t.check("Reports: a same-day lead time reads “< 1 day”, never 0", (await t.text("kpi-lead-time")).replace(/\s+/g, " ").includes("< 1 day"), await t.text("kpi-lead-time"));
  t.check("Reports: a same-day answer counts as answered", !rep.includes("No supplier has answered a query yet") && rep.includes("answers within a day on average"), rep.match(/Supplier performance[^\n]*\n[^\n]*/)?.[0]);
  t.check("Reports: the lead-time charts say the case went through within a day", (await t.isVisible("lead-time-same-day")) && (await t.isVisible("wait-split-same-day")));
  t.check("Reports: the flow takeaway names this month, not a month before the first case", !/since (Jul|Aug|Sep)/.test(rep));
  await t.step("Reports with one completed case");
  await t.viewAs(P.auditor);
  await t.notSee("empty-audit", "the audit trail lists the events");
  await t.page.getByRole("link", { name: id }).first().click();
  await t.settle();
  t.check("a case ID in the audit trail opens the case History tab", (await t.hash()) === `/cases/${id}?tab=history`, await t.hash());
  await t.see("history-events");
  await t.notSee("case-cancel", "the auditor reads only");
  await t.step("audit trail and history");
  await t.viewAs(P.rmm);
  t.check("dashboard: no open case left", (await t.attr("tile-my-open", "data-count")) === "0");
  await t.step("RMM dashboard after the release");
  await t.go("/cases");
  t.check("Cases: the empty Open tab points to the completed case", (await t.text("empty-cases-view")).includes("1 case is in Completed"), await t.text("empty-cases-view"));
  await t.click("cases-empty-go");
  await t.see(`case-row-${id}`, "its button opens the Completed tab with the case");
  await t.step("Cases after the release");
});

def("S2", "late metadata change in review adds a section (grow-only)", async (t) => {
  await t.load("/");
  const id = await caseInReview(t);
  await completeAll(t, id);
  await t.viewAs(P.elena);
  await openRequest(t, id);
  await t.see("final-release-card", "Elena is asked for the final release");
  // Thomas, 15 Oct: locked while the final release is requested; a reviewer reopens to let the supplier change it
  t.check("the questionnaire is locked in final-release (its heading says so)", (await t.attr("questionnaire-heading", "data-locked")) === "true" && (await t.text("questionnaire-heading")).includes(RELEASE_LOCKED));
  await navSection(t, "SF");
  t.check("the metadata questions are read-only while locked", await t.tid("q-config-SF07").getByRole("button", { name: "Yes", exact: true }).isDisabled());
  await t.step("final-release: locked");
  await t.viewAs(P.qm);
  await t.go(`/review/${id}`);
  await t.click("reopen-review");
  await t.fill("reopen-reason", "The supplier must update its origin and mineral oil answers.");
  await t.click("reopen-confirm");
  let s = await t.state();
  let c = s.cases.find((x) => x.id === id);
  t.check("QM reopens: the case goes back to review; release-withdrawn mail", c.phase === "review" && ev(s, "release-withdrawn", id).length === 1 && same(ev(s, "release-withdrawn", id)[0].to, SUPS));
  await t.step("QM reopened");
  await t.viewAs(P.elena);
  await openRequest(t, id);
  t.check("the questionnaire is editable again", (await t.attr("questionnaire-heading", "data-locked")) === "false");
  await navSection(t, "SF");
  // (SF-08 palm was dropped on 28 Oct: a mineral origin now adds Annex 1, which Regulatory leads since the matrix v0.6 check)
  await config(t, "SF01", [ORIGIN_LABEL.mineral]); // mineral: Annex 1 (R-13), led by Regulatory (completed)
  s = await t.state();
  c = s.cases.find((x) => x.id === id);
  const a1 = c.scope.find((x) => x.sectionId === "A1");
  t.check("SF-01 Mineral adds Annex 1 as mandatory, marked added later", a1.applicability === "mandatory" && a1.addedLater === true, a1);
  t.check("the completed Regulatory review is reopened, assigned and waits for the supplier", track(c, "REG")?.status === "waiting-supplier" && track(c, "REG")?.assigneeId === "u-reg" && c.audit.some((a) => a.action === "Reopened Regulatory review"), track(c, "REG"));
  t.check("a second review-assigned mail to Regulatory", ev(s, "review-assigned", id).filter((m) => same(m.to, ["u-reg"])).length === 2);
  const addPoint = c.openPoints.find((p) => p.kind === "additional-part" && p.ref.sectionId === "A1");
  t.check("an additional-part point for Regulatory (responsible Dr. Jonas Albrecht)", addPoint && addPoint.dept === "REG" && addPoint.responsibleId === "u-reg" && addPoint.status === "open", addPoint);
  t.check("Sustainability gets no track (it leads no section of this case)", !track(c, "SUS"));
  t.check("data-changed mail to RMM", ev(s, "data-changed", id).some((m) => m.to.includes("u-rmm")));
  t.check("the RMES record stays header only (no criteria planned for Annex 1)", c.rmes.criteria.length === 0, c.rmes.criteria.length);
  await t.step("SF-01 Mineral after the reopen");
  await t.notSee("final-release-card", "no release card while the review runs again");
  await config(t, "SF12", false); // would close K5.1: the scope only grows
  c = await t.kase(id);
  t.check("grow-only: SF-12 No keeps K5.1 mandatory", c.scope.find((x) => x.sectionId === "K5.1").applicability === "mandatory");
  await t.step("SF-12 No: nothing closes");
  // a late section for a completed department, and an origin without rules after RMM completed
  await config(t, "SF07", true); // mineral oil: Annex 4 and 9, led by Safety (completed)
  await config(t, "SF01", [ORIGIN_LABEL.waste]);
  s = await t.state();
  c = s.cases.find((x) => x.id === id);
  t.check("SF-07 Yes adds Annex 4 and 9", ["A4", "A9"].every((x) => c.scope.find((y) => y.sectionId === x)?.applicability === "mandatory" && c.scope.find((y) => y.sectionId === x)?.addedLater));
  t.check("the completed Safety review is reopened (mail) and waits for the supplier", track(c, "SAF").status === "waiting-supplier" && c.audit.some((a) => a.action === "Reopened Safety review") && ev(s, "review-assigned", id).filter((m) => same(m.to, ["u-saf"])).length === 2, track(c, "SAF"));
  t.check("an origin without rules reopens RMM's completed review (mail) and flags it", track(c, "RMM").status === "reopened" && c.audit.some((a) => a.action === "Flagged for RMM") && ev(s, "review-assigned", id).filter((m) => same(m.to, ["u-rmm"])).length === 2, track(c, "RMM"));
  const added = c.openPoints.filter((p) => p.kind === "additional-part");
  t.check("one additional-part point per added section (A1, A4, A9)", same(added.map((p) => p.ref.sectionId), ["A1", "A4", "A9"]), added.map((p) => p.ref.sectionId));
  await t.step("SF-07 Yes and a waste origin in review");
  // SF-12 No asks for the waiver justification in K5.1 (the uploaded report stays); the waste origin its specification
  await navSection(t, "K5.1");
  await answerText(t, "FLD-5.1-002", "The ester is anhydrous (water activity below 0.6); microbial growth is not supported.");
  c = await t.kase(id);
  t.check("the K5.1 change reopens Microbiology's completed review (Thomas, 15 Oct: system, with the reason)", track(c, "MIC").status === "reopened" && c.audit.some((a) => a.action === "Reopened Microbiology review" && a.by === "system" && a.detail === "The supplier changed K5.1 after your review."), track(c, "MIC"));
  await navSection(t, "K2.3");
  await answerText(t, "FLD-2.3-12", "Talc from a certified mine");
  await answerText(t, "FLD-2.3-15", "Recovered ester from a refinery side stream");
  // every SF-01 origin is used by a component, and every component's origin is an SF-01 answer (matrix v0.6 D6)
  await navSection(t, "K2.1");
  for (const [n, inci, fn, origin, min, max] of [[2, "Talc", "absorbent", "mineral", "0.1", "0.5"], [3, "Recovered Ester", "emollient", "waste", "0.1", "1"]]) {
    await t.click("q-component-add");
    const row = t.tid(`q-component-c${n}`);
    await row.getByPlaceholder("e.g. Tocopherol").fill(inci);
    await row.getByPlaceholder("e.g. antioxidant").fill(fn);
    await additive(t, row, `c${n}`, false);
    await row.getByRole("combobox", { name: `Origin of component ${n}` }).click();
    await t.page.getByRole("option", { name: ORIGIN_LABEL[origin], exact: true }).click();
    await row.getByLabel("Minimum %").fill(min);
    await row.getByLabel("Maximum %").fill(max);
    await row.getByLabel("Maximum %").blur();
    await t.settle(30);
  }
  c = await t.kase(id);
  t.check("K2.1: a mineral and a waste component added", same(c.components.map((r) => r.origin), ["animal", "mineral", "waste"]), c.components.map((r) => r.origin));
  // Elena completes Annex 1 and Annex 4 and reports each added section completed
  await navSection(t, "A1");
  await answerYesNo(t, "FLD-A1-201", false);
  await answerText(t, "FLD-A1-203", "No pesticide residues are expected after refining; analysis planned for Q1 2027.");
  await answerYesNo(t, "FLD-A1-204", true);
  await answerSelect(t, "FLD-A1-206", "Mass Balance");
  await navSection(t, "A4");
  await answerText(t, "FLD-A4-101", "0.4");
  await answerSelect(t, "FLD-A4-102", "Not available");
  await t.step("Annex 1 and 4 filled");
  for (const p of added) {
    await t.go("/portal");
    await t.click(`answer-${p.id}`);
    await t.see("answer-section-progress", `${p.ref.sectionId}: the drawer shows the added section's progress`);
    t.check(`${p.ref.sectionId}: “Section completed.” can be sent`, await t.tid("answer-send").isEnabled());
    await t.click("answer-send");
    await t.closeOverlays();
  }
  await t.step("additional parts answered");
  // the points were raised by the system: the responsible person (the track's reviewer) decides, then completes
  await t.viewAs(P.reg);
  await decide(t, id, added[0].id, "accept");
  await t.viewAs(P.saf);
  for (const p of added.slice(1)) await decide(t, id, p.id, "accept");
  // the RMES follows the supplier's Part 2 changes: the mineral and waste components with their specifications
  c = await t.kase(id);
  await checkRmesSheet(t, id, "Safety (after the Part 2 changes)");
  const waste = c.components.find((r) => r.origin === "waste");
  t.check("the waste component's free text is its FLD-2.3-15 specification", !!waste && (await t.text(`rmes-row-${waste.id}`)).includes("Recovered ester from a refinery side stream") && (await t.text(`rmes-row-${waste.id}`)).includes("FLD-2.3-15"));
  await completeReview(t, id, "SAF");
  await t.step("Regulatory accepted Annex 1, Safety completed");
  // Regulatory completes again (its decision stays recorded; the RMES needs nothing)
  await t.viewAs(P.reg);
  t.check("Regulatory's decision stayed recorded", track(await t.kase(id), "REG")?.decision === "approved");
  await completeReview(t, id, "REG");
  await t.step("Regulatory completed again");
  for (const d of ["MIC", "QM"]) {
    await t.viewAs(DEPT_PERSONA[d]);
    await completeReview(t, id, d);
  }
  await t.step("Microbiology and QM completed again");
  await t.viewAs(P.rmm);
  await t.go(`/review/${id}`);
  await t.see("workspace-origin-flag", "RMM's review shows the origin without rules");
  await completeReview(t, id, "RMM");
  s = await t.state();
  c = s.cases.find((x) => x.id === id);
  t.check("back to final-release: a second release request", c.phase === "final-release" && ev(s, "release-requested", id).length === 2);
  await t.step("all completed again");
  await t.viewAs(P.saf);
  const before = await rmesSheetText(t, id);
  await t.viewAs(P.elena);
  await release(t, id);
  c = await t.kase(id);
  t.check("the final document lists Annex 1, 4 and 9 as added later", ["A1", "A4", "A9"].every((x) => c.finalDocument.sections.some((y) => y.sectionId === x && y.addedLater)));
  await t.step("released");
  await t.viewAs(P.saf);
  t.check("after the final release the RMES sheet is unchanged (frozen with the case)", (await rmesSheetText(t, id)) === before, before.slice(0, 200));
  await t.step("RMES after the release");
});

def("S3", "a department adds a missing section; the supplier completes it", async (t) => {
  await t.load("/");
  const id = await caseInReview(t);
  await t.viewAs(P.rmm);
  await t.go(`/review/${id}`);
  await t.notSee("add-section", "RMM has no “Add a section”");
  await t.viewAs(P.saf);
  await t.go(`/review/${id}`);
  await t.click("add-section");
  await t.tid("add-section-select").getByRole("combobox").click();
  await t.page.getByRole("option", { name: /Annex 4 · Hydrocarbons/ }).click();
  await t.click("add-section-confirm");
  t.check("a justification is required", (await t.kase(id)).scope.find((x) => x.sectionId === "A4").applicability === "na");
  await t.fill("add-section-justification", "The SDS mentions a paraffinic processing aid; MOAH must be assessed.");
  await t.click("add-section-confirm");
  let s = await t.state();
  let c = s.cases.find((x) => x.id === id);
  const a4 = c.scope.find((x) => x.sectionId === "A4");
  t.check("A4 is mandatory, added in review with the justification", a4.applicability === "mandatory" && a4.addedLater && a4.manual?.justification.includes("paraffinic"), a4);
  const pt = c.openPoints.find((p) => p.kind === "additional-part" && p.ref.sectionId === "A4");
  t.check("Safety owns the additional-part point and waits for the supplier", pt?.dept === "SAF" && pt.createdBy === "u-saf" && track(c, "SAF").status === "waiting-supplier", pt);
  t.check("op-raised mail to both contacts", ev(s, "op-raised", id).some((m) => m.opId === pt.id && same(m.to, SUPS)));
  await t.step("Safety added Annex 4");
  await t.viewAs(P.reg);
  await t.go(`/review/${id}?s=K2.1`);
  await t.click("ask-row-c1");
  await t.fill("ask-question", "Please give the CAS number of component 1.");
  await t.fill("ask-justification", "Needed for the REACH check.");
  await t.click("ask-send");
  const rowPoint = (await t.kase(id)).openPoints.find((p) => p.ref.rowId === "c1");
  t.check("a query on a component row", !!rowPoint, (await t.kase(id)).openPoints.map((p) => p.ref));
  await t.viewAs(P.elena);
  await openRequest(t, id, "K2.1");
  await t.notSee("q-component-remove-c1", "the row Beiersdorf asked about cannot be removed");
  t.check("it says “Asked about”", (await t.text("q-component-c1")).includes("Asked about"));
  await t.step("component row asked about");
  await t.viewAs(P.elena);
  await t.see(`task-${pt.id}`, "Elena's task: complete the additional section");
  await t.click(`answer-${pt.id}`);
  t.check("“Section completed.” waits until the section is filled", await t.tid("answer-send").isDisabled());
  await t.closeOverlays();
  await openRequest(t, id);
  await navSection(t, "A4");
  t.check("the supplier sees A4 marked as added after the confirmation", (await t.text("q-section-A4")).includes("Added after your completeness confirmation"));
  await answerText(t, "FLD-A4-101", "0.4");
  await answerSelect(t, "FLD-A4-102", "Not available");
  await t.step("A4 filled");
  await supplierAnswer(t, id, pt.id, "Section completed.");
  await t.viewAs(P.saf);
  await decide(t, id, pt.id, "accept");
  c = await t.kase(id);
  t.check("Safety accepted the added section", op(c, pt.id).outcome === "accepted" && track(c, "SAF").status === "in-review");
  await t.step("A4 accepted");
});

def("S4", "AS-08: edit and withdraw, incl. the supplier having the drawer open", async (t) => {
  await t.load("/");
  const id = await caseInReview(t);
  await t.viewAs(P.reg);
  const op1 = await raise(t, id, { section: "K2.1", field: "FLD-2.1-102", question: "Which method gives the natural origin index?" });
  // tab 1: Elena types in the drawer; tab 2: Regulatory changes the question meanwhile
  await t.viewAs(P.elena);
  await t.go(`/portal/case/${id}?q=${op1}`);
  await t.seeMust("answer-drawer");
  await t.fill("answer-text", "We use ISO 16128-2.");
  const t2 = await t.newTab("tab2");
  await t2.load("/");
  await t2.viewAs(P.reg);
  t.check("each tab keeps its own person", (await t.persona()) === P.elena && (await t2.persona()) === P.reg);
  await t2.go(`/review/${id}?op=${op1}`);
  await t2.click(`op-edit-${op1}`);
  await t2.fill("op-edit-question", "Which standard and which calculation give the natural origin index?");
  await t2.click("op-edit-save");
  await t2.step("Regulatory changed the question");
  await t.settle(200);
  t.check("the open drawer shows the changed question", (await t.text("answer-drawer")).includes("Which standard and which calculation"));
  await t.click("answer-send");
  await t.see("answer-question-changed", "the first Send only shows that the question changed");
  t.check("nothing was sent yet", op(await t.kase(id), op1).status === "open");
  t.check("the typed text is kept", (await t.tid("answer-text").inputValue()) === "We use ISO 16128-2.");
  await t.click("answer-send");
  await t.seeMust("answer-sent");
  await t.closeOverlays();
  let s = await t.state();
  let c = s.cases.find((x) => x.id === id);
  t.check("the answer went through after the second Send", op(c, op1).status === "in-progress");
  await t.step("drawer open while the question changed");
  // due date only: no new round; question of an answered point: a new round
  const due = new Date(Date.parse(op(c, op1).dueDate) + 7 * 86400000).toISOString().slice(0, 10);
  await t2.go(`/review/${id}?op=${op1}`);
  await t2.click(`op-edit-${op1}`);
  await t2.fill("op-edit-due", due);
  await t2.click("op-edit-save");
  c = await t2.kase(id);
  t.check("changing only the due date starts no new round", op(c, op1).status === "in-progress" && op(c, op1).rounds === 1, op(c, op1));
  await t2.click(`op-edit-${op1}`);
  await t2.fill("op-edit-question", "Please also give the calculation for each component.");
  await t2.click("op-edit-save");
  s = await t2.state();
  c = s.cases.find((x) => x.id === id);
  t.check("changing the question of an answered point starts a new round", op(c, op1).status === "open" && op(c, op1).rounds === 2 && op(c, op1).thread.at(-1).newRound === true, op(c, op1));
  t.check("every change mailed the contacts (3 op-edited)", ev(s, "op-edited", id).length === 3 && ev(s, "op-edited", id).at(-1).body.includes("Please answer the changed question"));
  t.check("the edits are in the history", op(c, op1).edits.length === 3);
  await t2.step("due date and question edited");
  // only the raiser: Safety reads the point but cannot change it
  await t2.viewAs(P.saf);
  await t2.go(`/review/${id}`);
  await t2.click("other-open-points");
  await t2.see(`op-other-${op1}`, "Safety sees Regulatory's point read-only");
  await t2.notSee(`op-edit-${op1}`, "Safety cannot edit it");
  await t2.notSee(`op-close-${op1}`, "Safety cannot close it");
  await t2.step("only the raiser");
  await t2.viewAs(P.reg);
  const op3 = await raise(t2, id, { section: "K2.2", field: "FLD-A14-102", question: "Please confirm the cadmium value." });
  await supplierAnswer(t, id, op3, "Cadmium is 0.05 mg/kg in both batches.");
  await t2.go(`/review/${id}?op=${op3}`);
  await t2.click(`op-close-${op3}`);
  await t2.fill("op-close-reason", "Answered by the analysis already on file.");
  await t2.click("op-close-confirm");
  c = await t2.kase(id);
  t.check("the raiser can close an answered point (withdrawn)", op(c, op3).status === "closed" && op(c, op3).outcome === "withdrawn");
  await t.go(`/portal/case/${id}?q=${op3}`);
  t.check("the supplier sees it closed, no answer needed", (await t.text("answer-drawer")).includes("No answer is needed"));
  await t.closeOverlays();
  await t2.step(`answered ${op3} closed`);
  // withdraw while the supplier has the drawer open
  await t2.viewAs(P.reg);
  const op2 = await raise(t2, id, { section: "K2.2", field: "FLD-A14-103", question: "Please confirm the chromium value." });
  await t.go(`/portal/case/${id}?q=${op2}`);
  await t.seeMust("answer-drawer");
  await t.fill("answer-text", "Chromium 1.2 mg/kg is confirmed by batch 2609-014.");
  await t2.click(`op-close-${op2}`);
  await t2.fill("op-close-reason", "Duplicate of the Safety evaluation; no supplier input needed.");
  await t2.click("op-close-confirm");
  await t2.step(`${op2} withdrawn`);
  await t.settle(200);
  await t.see("answer-closed", "the open drawer says Beiersdorf closed the question");
  t.check("the unsent text is offered to copy", (await t.text("answer-closed")).includes("Chromium 1.2 mg/kg"));
  t.check("the drawer never shows the internal reason", !(await t.text("answer-drawer")).includes("Duplicate of the Safety"));
  await t.closeOverlays();
  await t.go(`/portal/case/${id}`);
  t.check("Questions for you: “Closed, no answer needed”", (await t.text(`question-${op2}`)).includes("Closed, no answer needed"));
  s = await t.state();
  t.check("op-closed mail without the internal reason", ev(s, "op-closed", id).some((m) => m.opId === op2 && !m.body.includes("Duplicate of the Safety")));
  await t.step("supplier view after the withdrawal");
});

def("S5", "Safety / Regulatory Rejected: RMM continues with a note or cancels; a completed RMM review reopens", async (t) => {
  await t.load("/");
  const id = await caseInReview(t);
  await t.viewAs(P.rmm);
  await completeReview(t, id, "RMM");
  await t.viewAs(P.saf);
  await t.go(`/review/${id}`);
  await t.seeMust("decision-card", "Safety's decision card on the Questionnaire tab");
  await t.tid("decision-choice").getByRole("button", { name: "Rejected", exact: true }).click();
  await t.click("decision-record");
  t.check("a rejection needs a reason (nothing is recorded without one)", (await t.text("decision-card")).includes("A rejection needs a reason.") && !track(await t.kase(id), "SAF").decision);
  await recordDecision(t, id, "SAF", { decision: "rejected", reason: "SAF-REJECT-REASON: the arsenic evidence covers one batch only." });
  let s = await t.state();
  let c = s.cases.find((x) => x.id === id);
  t.check("Rejected reopens RMM's completed review", track(c, "RMM").status === "reopened");
  t.check("RMM gets a mail about the reopened review", ev(s, "review-assigned", id).filter((m) => same(m.to, ["u-rmm"])).length === 2);
  await t.step("Safety rejected");
  await completeReview(t, id, "SAF");
  await t.viewAs(P.rmm);
  await t.go(`/cases/${id}`);
  await t.see("rejection-banner", "the case page flags the rejection for RMM");
  await t.go(`/review/${id}`);
  await t.notSee("complete-review", "RMM cannot simply complete");
  await t.see("rejection-flag");
  await t.click("rejection-choose");
  await t.click("rejection-continue");
  t.check("continue needs a note", track(await t.kase(id), "RMM").status !== "completed");
  await t.fill("rejection-text", "Agreed with Product Safety: a second batch analysis follows with the next delivery.");
  await t.click("rejection-continue");
  c = await t.kase(id);
  t.check("RMM completed with its continue note", track(c, "RMM").status === "completed" && track(c, "RMM").continueAfterRejection?.note.includes("second batch"), track(c, "RMM"));
  await t.step("RMM continued");
  await completeAll(t, id);
  await t.viewAs(P.elena);
  await openRequest(t, id);
  t.check("the supplier never sees the rejection", !(await t.text()).includes("SAF-REJECT-REASON") && !/rejected/i.test(await t.text()));
  await t.step("supplier view of the rejected case");

  // a second case: Regulatory rejects, RMM cancels the case
  const id2 = await caseInReview(t, { no: "RM-410002", material: "Solvasoft 310" });
  await t.viewAs(P.reg);
  await recordDecision(t, id2, "REG", { decision: "rejected", reason: "REG-REJECT-REASON: not listed in the UK inventory." });
  await t.viewAs(P.rmm);
  await t.go(`/review/${id2}`);
  await t.click("rejection-choose");
  await t.tid("rejection-options").getByRole("button", { name: "Cancel the case", exact: true }).click();
  await t.fill("rejection-text", "Regulatory rejected the material; no alternative grade.");
  await t.click("rejection-cancel");
  s = await t.state();
  c = s.cases.find((x) => x.id === id2);
  t.check("RMM's choice “Cancel the case” cancels it", c.phase === "cancelled" && c.cancelled.reason.includes("no alternative"));
  t.check("the supplier's cancelled mail has no reason", ev(s, "cancelled", id2).some((m) => m.audience === "supplier" && !m.body.includes("no alternative")));
  await t.step("RMM cancelled after the rejection");
});

def("S6", "cancel and reactivate in each phase", async (t) => {
  await t.load("/");
  const id = await createCase(t, {});
  // duplicate warning for the same supplier and material number
  await t.go("/cases/new");
  await t.fill("newcase-material", "Solvasoft 300 (second site)");
  await t.fill("newcase-inci", MAT.inci);
  await t.fill("newcase-material-no", MAT.no);
  await t.click("newcase-supplier-s1");
  await t.see("newcase-duplicate-warning", "duplicate warning for an open case with the same material no.");
  await t.click("newcase-submit");
  t.check("a second case needs a reason", (await t.text("newcase-errors")).includes("Say why a second case is needed"));
  await t.step("duplicate warning");
  // Cases: search by DUNS, INCI and material no.
  await t.go("/cases");
  for (const q of ["471203958", "ethylhexyl", "RM-410001", "Solvaro"]) {
    await t.fill("cases-search", q);
    t.check(`Cases search “${q}” finds the case`, (await t.attr("cases-count", "data-count")) === "1" && (await t.isVisible(`case-row-${id}`)));
  }
  await t.fill("cases-search", "no such material");
  await t.see("empty-cases-view", "a search without hits shows its empty state");
  await t.click("cases-clear");
  await t.step("cases search");
  const cancel = async (phase) => {
    await t.viewAs(P.rmm);
    await t.go(`/cases/${id}`);
    await t.click("case-cancel");
    await t.click("case-cancel-confirm");
    t.check(`${phase}: cancelling needs a justification`, (await t.kase(id)).phase === phase);
    await t.fill("case-cancel-reason", `Harness cancel in ${phase}: supplier paused the material.`);
    await t.click("case-cancel-confirm");
    const s = await t.state();
    const c = s.cases.find((x) => x.id === id);
    t.check(`${phase}: cancelled, every open point withdrawn`, c.phase === "cancelled" && c.cancelled.fromPhase === phase && c.openPoints.every((p) => p.status === "closed"));
    t.check(`${phase}: cancelled mail to the contacts without the reason`, ev(s, "cancelled", id).some((m) => m.audience === "supplier" && same(m.to, SUPS) && !m.body.includes("Harness cancel")));
    await t.see("case-cancelled-banner");
    t.check(`${phase}: the cancel audit has no double full stop`, !c.audit.some((a) => a.detail.includes("..")));
    if (c.reviews.some((r) => r.status !== "completed")) {
      const reviews = await t.text("case-reviews");
      t.check(`${phase}: the case page shows the unfinished review tasks as ended`, !/In review|Waiting for supplier/.test(reviews) && reviews.includes("Ended"), reviews.slice(0, 300));
    }
    await t.go("/cases");
    await t.click("cases-tab-cancelled");
    await t.see(`case-row-${id}`, `${phase}: listed under Cancelled`);
    await t.step(`cancelled in ${phase}`);
    await t.viewAs(P.elena);
    await t.notSee(`task-questionnaire-${id}`, `${phase}: no supplier task left`);
    await t.notSee(`release-${id}`);
    await openRequest(t, id);
    t.check(`${phase}: the supplier sees the withdrawal and a read-only questionnaire`, (await t.text()).includes("Beiersdorf has withdrawn this request") && (await editableControls(t)) === 0);
    await t.step(`supplier view, cancelled in ${phase}`);
    await t.viewAs(P.rmm);
    await t.go(`/cases/${id}`);
    await t.click("case-reactivate");
    await t.click("case-reactivate-confirm");
    t.check(`${phase}: reactivating needs a justification`, (await t.kase(id)).phase === "cancelled");
    await t.fill("case-reactivate-reason", `The supplier resumed the material (${phase}).`);
    await t.click("case-reactivate-confirm");
    const s2 = await t.state();
    const c2 = s2.cases.find((x) => x.id === id);
    t.check(`${phase}: reactivated into ${phase}`, c2.phase === phase, c2.phase);
    t.check(`${phase}: reactivated mail to the contacts`, ev(s2, "reactivated", id).some((m) => m.audience === "supplier" && !m.body.includes("supplier resumed")));
    t.check(`${phase}: the justification is in the audit`, c2.audit.some((a) => a.action === "Reactivated case" && a.detail.includes(`The supplier resumed the material (${phase})`)));
    await t.step(`reactivated into ${phase}`);
  };
  await cancel("supplier-input");
  await t.viewAs(P.elena);
  await t.see(`task-questionnaire-${id}`, "the fill-in task is back");
  await fillCiq(t, id);
  await confirmCompleteness(t, id);
  await t.viewAs(P.reg);
  const op1 = await raise(t, id, { section: "K2.1", field: "FLD-2.1-102", question: "Please confirm the index." });
  await cancel("review");
  let c = await t.kase(id);
  t.check("review: the withdrawn point stays closed after reactivation", op(c, op1).status === "closed" && op(c, op1).outcome === "withdrawn");
  t.check("review: Regulatory no longer waits for the supplier", track(c, "REG").status === "in-review");
  await completeAll(t, id);
  await cancel("final-release");
  await t.viewAs(P.elena);
  await t.see(`release-${id}`, "the release task is back");
  await release(t, id);
  await t.viewAs(P.rmm);
  await t.go(`/cases/${id}`);
  await t.notSee("case-cancel", "a completed case cannot be cancelled");
  await t.notSee("case-reactivate");
  await t.step("completed after three cancellations");
});

def("S7", "release blocked: a mandatory field cleared in Part 2, an open supplier question", async (t) => {
  await t.load("/");
  const id = await caseInReview(t);
  // every department completes; RMM (GEN's owner) still reviews when the supplier clears a mandatory GEN answer
  await completeAll(t, id, { only: ["REG", "SAF", "QM", "MIC"] });
  await t.viewAs(P.elena);
  await openRequest(t, id, "GEN");
  await answerText(t, "FLD-GEN-004", "");
  let s = await t.state();
  let c = s.cases.find((x) => x.id === id);
  t.check("the change mailed RMM (data-changed)", ev(s, "data-changed", id).some((m) => m.to.includes("u-rmm")));
  t.check("RMM's review was still open: nothing reopened", track(c, "RMM").status === "in-review" && !c.audit.some((a) => a.action.startsWith("Reopened")));
  await t.step("a mandatory GEN answer cleared in review");
  await t.viewAs(P.rmm);
  await t.go(`/review/${id}`);
  t.check("RMM sees the change marker", await t.isVisible("section-changed-GEN"));
  await completeReview(t, id, "RMM");
  c = await t.kase(id);
  t.must("RMM completed last: the release is requested", c.phase === "final-release", c.phase);
  await t.viewAs(P.elena);
  await openRequest(t, id, "GEN");
  t.check("clearing a mandatory field blocks the release", (await t.attr("final-release-card", "data-blocked")) === "true" && (await t.tid("final-release").isDisabled()));
  t.check("the reason is listed", (await t.text("final-release-blockers")).includes("Missing: Manufacturer (name and address)"));
  t.check("the supplier is told the questionnaire is locked and whom to contact", (await t.text("release-blockers-locked")).includes("can only be completed after Beiersdorf reopens its review") && (await t.text("release-blockers-locked")).includes("Katrin Vogel"));
  t.check("the questionnaire is locked: no editable control", (await editableControls(t)) === 0, await editableControls(t));
  await t.step("release blocked by a cleared field, questionnaire locked");
  await t.click("release-blocker-item");
  t.check("the reason jumps to the field", (await t.hash()).includes("f=FLD-GEN-004"));
  t.check("the field is read-only there", (await fieldBox(t, "FLD-GEN-004").locator("input, textarea").count()) === 0);
  await t.step("the blocker opens the locked field");
  // RMM reopens and asks: the questionnaire unlocks; the release waits for the answer
  await t.viewAs(P.rmm);
  await t.go(`/review/${id}`);
  await t.click("reopen-review");
  await t.fill("reopen-reason", "The manufacturer address is missing; the supplier must complete it.");
  await t.click("reopen-confirm");
  s = await t.state();
  c = s.cases.find((x) => x.id === id);
  t.check("reopening withdraws the release request (mail)", c.phase === "review" && ev(s, "release-withdrawn", id).length === 1);
  const op1 = await raise(t, id, { section: "GEN", field: "FLD-GEN-004", question: "Please give the manufacturer's name and address again." });
  await t.step("RMM reopened and asked");
  await t.viewAs(P.elena);
  await openRequest(t, id, "GEN");
  await t.notSee("final-release-card", "no release while Beiersdorf's question is open");
  t.check("the request says a question is open", (await t.text()).includes("1 question for you"));
  t.check("the questionnaire is editable again", (await t.attr("questionnaire-heading", "data-locked")) === "false" && (await editableControls(t)) > 0);
  await answerText(t, "FLD-GEN-004", "Solvaro Oleochemicals S.A., Tarragona, Spain");
  await supplierAnswer(t, id, op1, "The address is filled in again.");
  await t.viewAs(P.rmm);
  await decide(t, id, op1, "accept");
  await completeReview(t, id, "RMM");
  s = await t.state();
  t.check("the release request goes out again", s.cases.find((x) => x.id === id).phase === "final-release" && ev(s, "release-requested", id).length === 2);
  await t.viewAs(P.elena);
  await openRequest(t, id);
  t.check("the release is open", (await t.attr("final-release-card", "data-blocked")) === "false");
  await release(t, id);
  await t.step("released after the second request");
});

/** Thomas, 15 Oct: the two rules for the client call. */
def("S17", "a supplier change reopens the owners' completed reviews; the questionnaire locks at the release request (Thomas, 15 Oct)", async (t) => {
  await t.load("/");
  const id = await caseInReview(t);
  // Regulatory (K2.1's lead), QM (K1's lead) and Microbiology complete; Safety and RMM still review
  await completeAll(t, id, { only: ["REG", "QM", "MIC"] });
  await t.viewAs(P.elena);
  await openRequest(t, id);
  let before = await t.kase(id);
  const mailsBefore = (await t.state()).mails.length;
  // 1. a K2.1 answer: Regulatory's completed review reopens automatically
  await navSection(t, "K2.1");
  await answerText(t, "FLD-2.1-102", "0.97");
  let s = await t.state();
  let c = s.cases.find((x) => x.id === id);
  t.check("Regulatory's completed review is reopened by the system", track(c, "REG").status === "reopened" && c.audit.some((a) => a.action === "Reopened Regulatory review" && a.by === "system" && a.detail === "The supplier changed K2.1 after your review."), track(c, "REG"));
  const reopened = (uid) => s.mails.slice(mailsBefore).filter((m) => m.event === "review-assigned" && same(m.to, [uid]));
  t.check("one reopen mail to Regulatory's reviewer", reopened("u-reg").length === 1 && reopened("u-reg")[0].body.startsWith("Your completed review was reopened: The supplier changed K2.1 after your review."), reopened("u-reg").map((m) => m.body));
  t.check("QM and Microbiology stay completed (they do not own K2.1)", track(c, "QM").status === "completed" && track(c, "MIC").status === "completed");
  await t.step("K2.1 answer: Regulatory reopened");
  // a second change in K2.1 in the same burst: no second reopen mail
  await t.click("q-component-add");
  const row = t.tid("q-component-c2");
  await row.getByPlaceholder("e.g. Tocopherol").fill("Tocopherol");
  await row.getByPlaceholder("e.g. antioxidant").fill("antioxidant");
  await additive(t, row, "c2", true);
  await row.getByLabel("Minimum %").fill("0.01");
  await row.getByLabel("Maximum %").fill("0.1");
  await row.getByLabel("Maximum %").blur();
  await t.settle(30);
  s = await t.state();
  c = s.cases.find((x) => x.id === id);
  t.check("a K2.1 row added in the same burst sends no second reopen mail", c.components.length === before.components.length + 1 && reopened("u-reg").length === 1, { rows: c.components.length, mails: reopened("u-reg").length });
  // 2. an upload in K1: its lead QM reopens; Microbiology (no owner of K1) stays completed
  await navSection(t, "K1");
  await upload(t, "FLD-K1-002", "CoA_batch_2610-002.pdf");
  s = await t.state();
  c = s.cases.find((x) => x.id === id);
  t.check("an upload in K1 reopens QM, K1's lead", track(c, "QM").status === "reopened" && reopened("u-qm").length === 1, track(c, "QM"));
  t.check("Microbiology stays completed", track(c, "MIC").status === "completed");
  t.check("RMM's and Safety's open reviews are untouched", track(c, "RMM").status === "in-review" && track(c, "SAF").status === "in-review");
  await t.step("K1 upload: QM reopened");
  // Regulatory sees the change since its completion and why its review is open again
  await t.viewAs(P.reg);
  t.check("Regulatory's inbox has the reopen mail", (await t.attr("inbox-button", "data-count")) !== "0");
  await t.go(`/review/${id}`);
  await t.seeMust("review-workspace");
  t.check("Regulatory sees the change marker on K2.1 (since its completion)", await t.isVisible("section-changed-K2.1"));
  await t.step("Regulatory's workspace after the reopen");
  // every review completes: the questionnaire locks
  await completeAll(t, id);
  await t.viewAs(P.elena);
  await openRequest(t, id, "K2.1");
  t.check("final-release: the heading shows the lock note", (await t.attr("questionnaire-heading", "data-locked")) === "true" && (await t.text("questionnaire-heading")).includes(RELEASE_LOCKED));
  t.check("final-release: no editable control, no row to add", (await editableControls(t)) === 0 && (await t.tid("q-component-add").count()) === 0, await editableControls(t));
  t.check("final-release: the section says it is locked", (await t.text(`q-section-K2.1`)).includes("Locked: Beiersdorf has requested your final release"));
  await navSection(t, "SF");
  t.check("final-release: the metadata questions are read-only", await t.tid("q-config-SF12").getByRole("button", { name: "Yes", exact: true }).isDisabled());
  t.check("final-release: the release card is open", (await t.attr("final-release-card", "data-blocked")) === "false" && (await t.tid("final-release").isEnabled()));
  await t.step("final-release: locked, the release can be given");
  // a reviewer reopens: back to review, the questionnaire unlocks; completing again locks it again
  await t.viewAs(P.mic);
  await t.go(`/review/${id}`);
  await t.click("reopen-review");
  await t.fill("reopen-reason", "The microbiological test report must be checked again.");
  await t.click("reopen-confirm");
  await t.viewAs(P.elena);
  await openRequest(t, id, "K5.1");
  t.check("after the reopen the questionnaire is editable again", (await t.attr("questionnaire-heading", "data-locked")) === "false" && (await editableControls(t)) > 0);
  await t.step("reopened: unlocked");
  await t.viewAs(P.mic);
  await completeReview(t, id, "MIC");
  await t.viewAs(P.elena);
  await release(t, id);
  await t.step("released");
});

/** Thomas, 14 Oct: only the business administrator adds, edits, deactivates and reactivates suppliers and contacts. */
const ONLY_ADMIN = "Only the business administrator maintains the supplier master.";
const MAINTAINED_BY_ADMIN = "Maintained by the business administrator.";
const ASK_ADMIN = "Ask the business administrator to add it in Suppliers.";

def("S8", "supplier master (administrator only): RMM read-only; add, validate, contacts in View as, deactivate with a replacement", async (t) => {
  await t.load("/");
  // RMM looks the supplier master up, read-only
  t.must("starts as RMM", (await t.persona()) === P.rmm);
  const master0 = JSON.stringify({ suppliers: (await t.state()).suppliers, users: (await t.state()).users, log: (await t.state()).log });
  await t.go("/suppliers");
  await t.see("supplier-row-s1", "RMM sees the supplier list");
  await t.see("suppliers-read-only", "RMM: the list says who maintains it");
  t.check(`RMM: “${MAINTAINED_BY_ADMIN}” on the list`, (await t.text("suppliers-read-only")).includes(MAINTAINED_BY_ADMIN));
  await t.notSee("supplier-add", "RMM has no Add supplier");
  await t.go("/suppliers?add=1");
  await t.notSee("supplier-save", "RMM: ?add=1 opens no add form");
  await t.click("supplier-row-s1");
  t.check("RMM opens the supplier page", (await t.route()) === "/suppliers/s1", await t.route());
  await t.see("contact-row-u-sup-1", "RMM sees the contacts");
  await t.see("supplier-read-only", "RMM: the supplier page says who maintains it");
  t.check(`RMM: “${MAINTAINED_BY_ADMIN}” on the supplier page`, (await t.text("supplier-read-only")).includes(MAINTAINED_BY_ADMIN));
  for (const id of ["supplier-edit", "supplier-deactivate", "contact-add", ...SUPS.flatMap((u) => [`contact-edit-${u}`, `contact-deactivate-${u}`, `contact-reactivate-${u}`])]) await t.notSee(id, `RMM: no ${id}`);
  t.check("RMM: no Deactivate or Edit button anywhere on the page", (await t.page.getByRole("button", { name: /^(Deactivate|Reactivate|Edit|Add contact)/ }).count()) === 0);
  await t.step("RMM: suppliers read-only");
  // the domain itself refuses every supplier-master change by RMM (a dry run on the page's state; nothing is saved)
  const probe = (name, by, ...args) => t.page.evaluate(([n, b, a]) => window.__ciq.trySupplierAction(n, b, ...a), [name, by, args]);
  const tries = [
    ["add a supplier", "addSupplier", [{ name: "Probe Esters B.V.", duns: "550123987", country: "Netherlands", type: "manufacturer", contacts: [{ name: "Probe Contact", email: "probe@probe.example" }] }]],
    ["edit the supplier", "updateSupplier", ["s1", { city: "Reus" }]],
    ["deactivate the supplier", "updateSupplier", ["s1", { active: false }]],
    ["add a contact", "addContact", ["s1", { name: "Lucía Ortega", email: "lucia.ortega@solvaro.example" }]],
    ["edit a contact", "updateContact", ["u-sup-2", { mayConfirm: false }]],
    ["deactivate a contact", "setContactActive", ["u-sup-2", false]],
  ];
  for (const [label, name, args] of tries) {
    const r = await probe(name, "u-rmm", ...args);
    t.check(`the domain refuses RMM: ${label}`, r === ONLY_ADMIN, r);
  }
  const capRmm = await t.page.evaluate(() => window.__ciq.check("u-rmm", "supplier.manage"));
  t.check("supplier.manage is refused for RMM", capRmm === ONLY_ADMIN, capRmm);
  t.check("supplier.view is allowed for RMM", (await t.page.evaluate(() => window.__ciq.check("u-rmm", "supplier.view"))) === null);
  t.check("supplier.manage is allowed for the administrator only", (await t.page.evaluate(() => ["u-admin", "u-reg", "u-owner", "u-auditor", "u-sup-1"].map((u) => window.__ciq.check(u, "supplier.manage") === null))).join() === "true,false,false,false,false");
  t.check("the administrator's dry run passes", (await probe("updateSupplier", "u-admin", "s1", { city: "Reus" })) === null);
  t.check("the dry runs saved nothing", JSON.stringify({ suppliers: (await t.state()).suppliers, users: (await t.state()).users, log: (await t.state()).log }) === master0);
  // New case: no inline add-supplier; the form says whom to ask
  await t.go("/cases/new");
  await t.seeMust("newcase-form");
  await t.notSee("newcase-add-supplier", "New case has no Add a supplier");
  await t.see("newcase-supplier-missing", "New case says where a missing supplier comes from");
  t.check(`New case: “Supplier not in the list? ${ASK_ADMIN}”`, (await t.text("newcase-supplier-missing")).includes(ASK_ADMIN), await t.text("newcase-supplier-missing"));
  await t.click("newcase-supplier-s1");
  await t.see("newcase-contact-missing", "New case says where a missing contact comes from");
  t.check(`New case: “Contact not in the list? ${ASK_ADMIN}”`, (await t.text("newcase-contact-missing")).includes(ASK_ADMIN), await t.text("newcase-contact-missing"));
  await t.step("RMM: New case asks the administrator");
  // the business administrator maintains the supplier master
  await t.viewAs(P.admin);
  await t.go("/suppliers");
  await t.notSee("suppliers-read-only", "the administrator's list is not read-only");
  await t.click("supplier-add");
  const save = async () => {
    await t.click("supplier-save");
    return t.isVisible("supplier-errors") ? t.text("supplier-errors") : "";
  };
  await t.fill("supplier-name", "Brenna Lipids B.V.");
  await t.fill("supplier-duns", "12345678");
  await t.fill("supplier-country", "Netherlands");
  await t.fill("supplier-city", "Rotterdam");
  await t.fill("contact-name-0", "Femke de Vries");
  await t.fill("contact-email-0", "elena.marquez@solvaro.example");
  let errs = await save();
  t.check("DUNS with 8 digits is refused", errs.includes("exactly 9 digits"), errs);
  // 26 Oct (Thomas): one e-mail per contact within a supplier only; another supplier's contact may have it too
  t.check("an e-mail another supplier's contact has is accepted", !/e-mail/i.test(errs), errs);
  await t.fill("supplier-duns", "471 203 958");
  errs = await save();
  t.check("a DUNS used by Solvaro is refused", errs.includes("already used by Solvaro Oleochemicals S.A."), errs);
  await t.fill("supplier-duns", "583920174");
  await t.fill("contact-email-0", "femke.devries@brenna.example");
  await t.click("contact-add-row");
  await t.fill("contact-name-1", "Joost Bakker");
  await t.fill("contact-email-1", "FEMKE.devries@brenna.example");
  errs = await save();
  t.check("two contacts with the same e-mail are refused", errs.includes("same e-mail"), errs);
  t.check("nothing was added yet", (await t.state()).suppliers.length === 1);
  await t.step("supplier validation");
  await t.fill("contact-email-1", "joost.bakker@brenna.example");
  await t.tid("contact-may-confirm-1").locator('input[type="checkbox"]').uncheck();
  await t.click("supplier-save");
  let s = await t.state();
  const sup = s.suppliers.find((x) => x.name === "Brenna Lipids B.V.");
  t.must("Brenna Lipids B.V. added with two contacts", sup && sup.duns === "583920174" && sup.contactIds.length === 2, sup);
  t.check("the form opens the new supplier", (await t.route()) === `/suppliers/${sup.id}`);
  await t.see(`contact-row-${sup.contactIds[0]}`);
  for (const id of ["supplier-edit", "supplier-deactivate", "contact-add", `contact-edit-${sup.contactIds[0]}`, `contact-deactivate-${sup.contactIds[0]}`]) await t.see(id, `the administrator has ${id}`);
  await t.notSee("supplier-read-only", "the administrator's supplier page is not read-only");
  t.check("the supplier log records the addition by the administrator", s.log.some((e) => e.supplierId === sup.id && e.action === "Added supplier" && e.by === "u-admin"));
  await t.step("supplier added");
  // the new contacts appear in View as and see no requests
  await t.click("person-chip");
  await t.see(`view-as-sup:${sup.contactIds[0]}`, "Femke appears in View as");
  await t.see(`view-as-sup:${sup.contactIds[1]}`, "Joost appears in View as");
  await t.closeOverlays();
  await t.viewAs(`sup:${sup.contactIds[0]}`);
  await t.see("empty-portal", "Femke has no request");
  t.check("Femke's inbox is empty", (await t.attr("inbox-button", "data-count")) === "0");
  await t.step("new contact: no requests");
  await t.viewAs(P.elena);
  await t.go("/portal");
  t.check("Elena does not see Brenna", !(await t.text()).includes("Brenna"));
  // a case naming only Femke (RMM starts it); deactivating her needs a replacement
  const id = await createCase(t, { supplierId: sup.id, contacts: [sup.contactIds[0]], no: "RM-410077", material: "Brenna Soft 12" });
  s = await t.state();
  t.check("the invitation goes to Femke only", ev(s, "invitation", id).length === 1 && same(ev(s, "invitation", id)[0].to, [sup.contactIds[0]]));
  // RMM's case page links to the supplier, which RMM sees read-only
  await t.see("case-supplier-link", "RMM: the case page links to the supplier");
  await t.click("case-supplier-link");
  t.check("… which opens the supplier page", (await t.route()) === `/suppliers/${sup.id}`, await t.route());
  await t.see("supplier-read-only", "… read-only for RMM");
  await t.notSee(`contact-deactivate-${sup.contactIds[0]}`, "… with no Deactivate for Femke");
  await t.step("RMM: supplier page from the case");
  await t.viewAs(P.reg);
  await t.go(`/cases/${id}`);
  await t.notSee("case-supplier-link", "Regulatory: the supplier name is plain text (no supplier master)");
  await t.go(`/suppliers/${sup.id}`);
  await t.see("no-access", "Regulatory: the supplier page shows NoAccess");
  await t.viewAs(P.admin);
  // a second window viewed as Femke stays on the supplier side when the administrator deactivates her in the first window
  const femke = await t.newTab("tab2");
  await femke.load("/portal");
  await femke.viewAs(`sup:${sup.contactIds[0]}`);
  await femke.see(`portal-request-${id}`, "Femke's window shows her request");
  await t.go(`/suppliers/${sup.id}`);
  await t.click(`contact-deactivate-${sup.contactIds[0]}`);
  await t.click("contact-deactivate-confirm");
  t.check("deactivating the only case contact needs a replacement", (await t.state()).users.find((u) => u.id === sup.contactIds[0]).active !== false);
  await t.tid("contact-replacement").getByRole("combobox").click();
  await t.page.getByRole("option", { name: /Joost Bakker/ }).click();
  await t.see("contact-replacement-no-confirm", "the dialog says the replacement may not confirm");
  await t.click("contact-deactivate-confirm");
  s = await t.state();
  const c = s.cases.find((x) => x.id === id);
  t.check("Femke is deactivated, Joost takes over the case", s.users.find((u) => u.id === sup.contactIds[0]).active === false && same(c.supplierContactIds, [sup.contactIds[1]]));
  t.check("the supplier log records the deactivation by the administrator", s.log.some((e) => e.supplierId === sup.id && e.action === "Deactivated contact" && e.by === "u-admin"));
  t.check("Joost gets the invitation", ev(s, "invitation", id).some((m) => same(m.to, [sup.contactIds[1]])));
  t.check("the case's contact e-mail follows the replacement", c.answers["FLD-GEN-008"] === "joost.bakker@brenna.example" && c.answers["FLD-GEN-009"] === undefined, [c.answers["FLD-GEN-008"], c.answers["FLD-GEN-009"]]);
  await t.step("contact deactivated with a replacement");
  await femke.settle(200);
  t.check("Femke's window keeps her persona (no switch to the administrator)", (await femke.persona()) === `sup:${sup.contactIds[0]}`, await femke.persona());
  t.check("… and stays on the supplier side", (await femke.route()).startsWith("/portal"), await femke.route());
  await femke.see("portal-inactive", "Femke's window says her access has ended");
  await femke.notSee(`portal-request-${id}`, "… and no longer shows the request");
  await femke.notSee("nav-suppliers", "… and no RMM menu");
  await femke.step("deactivated contact's own window");
  await t.click("person-chip");
  await t.notSee(`view-as-sup:${sup.contactIds[0]}`, "a deactivated contact is gone from View as");
  await t.closeOverlays();
  await t.click(`contact-deactivate-${sup.contactIds[1]}`);
  await t.see("contact-last-active", "the last active contact cannot be deactivated");
  t.check("its confirm is disabled", await t.tid("contact-deactivate-confirm").isDisabled());
  await t.closeOverlays();
  await t.viewAs(`sup:${sup.contactIds[1]}`);
  await t.see(`portal-request-${id}`, "Joost sees the case he now holds");
  await openRequest(t, id);
  await t.notSee("confirm-completeness", "Joost may not confirm: no Confirm completeness button");
  await t.see("no-confirmer", "Joost is told that nobody named may confirm and whom to ask");
  t.check("… naming the case owner", (await t.text("no-confirmer")).includes("Katrin Vogel"));
  await t.step("Joost holds the case");
});

def("S9", "supplier leak scan: views and mails never carry internal content", async (t) => {
  await t.load("/");
  // a second supplier (added by the business administrator) with its own case (never visible to Solvaro)
  await t.viewAs(P.admin);
  await t.go("/suppliers");
  await t.click("supplier-add");
  await t.fill("supplier-name", "Kerrow Botanicals Ltd");
  await t.fill("supplier-duns", "619283745");
  await t.fill("supplier-country", "United Kingdom");
  await t.fill("contact-name-0", "Isla Kerrow");
  await t.fill("contact-email-0", "isla.kerrow@kerrow.example");
  await t.click("supplier-save");
  const other = (await t.state()).suppliers.find((x) => x.name === "Kerrow Botanicals Ltd");
  const otherCase = await createCase(t, { supplierId: other.id, no: "RM-499001", material: "Kerrow Aloe Extract" });
  const id = await caseInReview(t);
  // internal content of every kind
  await t.viewAs(P.reg);
  await t.go(`/review/${id}`);
  await t.fill("note-input", "LEAK-NOTE: align with Safety on the arsenic value before asking.");
  await t.click("note-add");
  const opA = await raise(t, id, { section: "K2.1", field: "FLD-2.1-102", question: "Please confirm the index method." });
  const opB = await raise(t, id, { section: "K2.2", field: "FLD-A14-101", question: "Please confirm the arsenic method." });
  await t.click(`op-close-${opB}`);
  await t.fill("op-close-reason", "LEAK-CLOSE-REASON internal duplicate");
  await t.click("op-close-confirm");
  await t.viewAs(P.elena);
  await supplierAnswer(t, id, opA, "ISO 16128-2 is used for the index.");
  await t.viewAs(P.reg);
  await decide(t, id, opA, "not-accepted", "LEAK-NOT-ACCEPTED-NOTE the method is outdated");
  // the RMES sheet (Regulatory reads it) and the decision with a comment
  await checkRmesSheet(t, id, "Regulatory");
  await recordDecision(t, id, "REG", { reason: "LEAK-DECISION-REASON approved with a remark" });
  await t.viewAs(P.cus);
  await t.go(`/cases/${id}?tab=notes`);
  await t.fill("note-text", "LEAK-CUSTOMS-NOTE: HS code to be checked.");
  await t.click("note-add");
  t.check("Customs may post an internal note", (await t.kase(id)).internalNotes.some((n) => n.text.startsWith("LEAK-CUSTOMS")));
  await t.step("internal content recorded");
  await completeAll(t, id);
  await t.viewAs(P.elena);
  await release(t, id);
  await t.step("released");

  const s = await t.state();
  const c = s.cases.find((x) => x.id === id);
  // LEAK_TERMS (scripts/leak-scan.mjs): "RMES", the retired criteria RMES's texts and the RMES sheet's own labels
  const internal = ["LEAK-", ...LEAK_TERMS, c.finalDocument.fingerprint, c.finalDocument.id];
  const otherSupplier = [other.name, "Isla Kerrow", "Kerrow Aloe Extract", otherCase];
  const secrets = [...internal, ...otherSupplier];
  const leaks = (text, list = secrets) => list.filter((x) => text.includes(x));
  for (const pid of [P.elena, P.ravi]) {
    await t.viewAs(pid);
    const pages = ["/portal", "/portal/help", `/portal/case/${id}`, ...ALL_PARTS.filter((x) => x !== "SF").map((x) => `/portal/case/${id}?s=${x}`), `/portal/case/${id}?s=SF`, ...c.openPoints.map((p) => `/portal/case/${id}?q=${p.id}`)];
    for (const r of pages) {
      await t.go(r);
      const found = leaks(await t.text());
      t.check(`${pid} ${r}: no internal content`, found.length === 0, found);
    }
    await t.go(`/portal/case/${otherCase}`);
    await t.see("request-not-available", `${pid}: another supplier's request is not available`);
    for (const r of [`/cases/${id}?tab=final-document`, `/review/${id}`, "/cases", "/suppliers"]) {
      await t.go(r);
      t.check(`${pid}: ${r} is not reachable`, (await t.route()) === "/portal", await t.route());
    }
    // every mail in the inbox, opened
    await t.click("inbox-button");
    const items = await t.page.locator('[data-testid^="inbox-item-"]').evaluateAll((els) => els.map((e) => e.dataset.testid));
    for (const it of items) {
      await t.click(it);
      const found = leaks(await t.text("inbox-reading-pane"));
      t.check(`${pid} mail ${it.slice(11)}: no internal content`, found.length === 0, found);
    }
    await t.closeOverlays();
    await t.step(`${pid} scanned`);
  }
  const supplierMails = s.mails.filter((m) => m.audience === "supplier");
  const bad = supplierMails.filter((m) => leaks(`${m.subject}\n${m.body}`, internal).length);
  t.check(`none of the ${supplierMails.length} supplier mails carries internal content`, bad.length === 0, bad.map((m) => m.id));
  const crossed = supplierMails.filter((m) => m.to.some((u) => SUPS.includes(u)) && leaks(`${m.subject}\n${m.body}`, otherSupplier).length);
  t.check("no mail to Solvaro's contacts names the other supplier", crossed.length === 0, crossed.map((m) => m.id));
  t.check("supplier mails reach supplier contacts only, each only its own supplier's", supplierMails.every((m) => m.to.every((u) => s.users.find((x) => x.id === u)?.supplierId === s.cases.find((x) => x.id === m.caseId)?.supplierId)));
});

def("S10", "reminders: Run reminders now (+days) sends reminder and escalation mails", async (t) => {
  await t.load("/");
  const idA = await createCase(t, {}); // waits for the supplier to fill in
  const idB = await caseInReview(t, { no: "RM-410003", material: "Solvasoft 320" });
  await t.viewAs(P.reg);
  const opB = await raise(t, idB, { section: "K2.1", field: "FLD-2.1-102", question: "Please confirm the index." });
  await t.viewAs(P.admin);
  await t.go("/admin/notifications");
  await t.click("run-reminders");
  t.check("today nothing is due", (await t.attr("run-reminders-result", "data-count")) === "0");
  await t.see("empty-reminder-mails");
  await t.tid("run-reminders-as-of").click();
  await t.click("run-reminders-as-of-option-14");
  await t.click("run-reminders");
  const sent = Number(await t.attr("run-reminders-result", "data-count"));
  const s = await t.state();
  const rem = s.mails.filter((m) => m.event === "reminder" || m.event === "escalation");
  t.check("in 14 days: reminder and escalation mails are sent", sent > 0 && sent === rem.length, { sent, rem: rem.length });
  t.check("rem-1: the supplier is reminded to fill in A", rem.some((m) => m.caseId === idA && m.event === "reminder" && same(m.to, SUPS)));
  t.check("rem-1: RMM gets the escalation for A", rem.some((m) => m.caseId === idA && m.event === "escalation" && same(m.to, ["u-rmm"])));
  t.check("rem-2: the open question is reminded to the supplier", rem.some((m) => m.opId === opB && m.event === "reminder" && same(m.to, SUPS)));
  t.check("rem-2: the raiser and RMM get the escalation", rem.some((m) => m.opId === opB && m.event === "escalation" && same(m.to, ["u-reg", "u-rmm"])));
  t.check("rem-3: an idle review track is reminded", rem.some((m) => m.caseId === idB && m.event === "reminder" && m.to.length === 1 && m.to[0].startsWith("u-") && !m.to[0].startsWith("u-sup")));
  t.check("supplier reminders carry no internal content", rem.filter((m) => m.audience === "supplier").every((m) => !/RMES|internal/i.test(m.body)));
  t.check("the sent reminders are listed", (await t.page.locator('[data-testid^="reminder-mail-"]').count()) > 0);
  await t.step("reminders sent");
  await t.click("run-reminders");
  t.check("running again sends nothing twice", (await t.attr("run-reminders-result", "data-count")) === "0" && (await t.state()).mails.length === s.mails.length);
  await t.step("reminders idempotent");
  await t.viewAs(P.elena);
  t.check("Elena's inbox shows the reminders", (await t.state()).mails.filter((m) => m.event === "reminder" && m.to.includes("u-sup-1")).length >= 2);
  await t.viewAs(P.rmm);
  await t.click("inbox-button");
  const items = await t.page.locator('[data-testid^="inbox-item-"][data-event="escalation"]').count();
  t.check("RMM's inbox lists the escalations", items >= 2, items);
  await t.closeOverlays();
  await t.step("inboxes");
});

def("S11", "the final document is immutable", async (t) => {
  await t.load("/");
  const id = await caseInReview(t);
  await completeAll(t, id);
  await t.viewAs(P.elena);
  await release(t, id);
  const fd0 = JSON.stringify((await t.kase(id)).finalDocument);
  const fp = (await t.kase(id)).finalDocument.fingerprint;
  // the supplier reports a change: the released case and its document stay as they are
  await openRequest(t, id);
  await t.click("report-change");
  await t.fill("report-change-what", "The antioxidant changes to rosemary extract from batch 2611 on.");
  await t.fill("report-change-why", "New antioxidant supplier from November 2026.");
  await t.click("report-change-send");
  let s = await t.state();
  t.check("the change report mails RMM", ev(s, "change-reported", id).length === 1 && same(ev(s, "change-reported", id)[0].to, ["u-rmm"]));
  await t.see("change-reports", "the supplier sees its reported change");
  await t.step("change reported");
  // master data and configuration change later (both by the business administrator)
  await t.viewAs(P.admin);
  await t.go("/suppliers/s1");
  await t.click("contact-edit-u-sup-1");
  await t.fill("contact-name", "Elena Márquez-Ruiz");
  await t.click("contact-save");
  t.check("the contact is renamed in the master", (await t.state()).users.find((u) => u.id === "u-sup-1").name === "Elena Márquez-Ruiz");
  await t.go("/admin/templates");
  await t.click("config-check-publish");
  await t.seeMust("publish-modal");
  await t.click("publish-submit"); // the prepared RS-2026.2 + v2, its change note prefilled
  t.check("questionnaire v2 published", (await t.state()).templates.find((x) => x.version.endsWith("v2")).status === "published");
  await t.step("master data and configuration changed");
  s = await t.state();
  const c = s.cases.find((x) => x.id === id);
  t.check("the final document is byte-for-byte unchanged", JSON.stringify(c.finalDocument) === fd0);
  t.check("the released case keeps v1", c.templateVersion === "CIQ-2026 v1");
  await t.viewAs(P.rmm);
  await t.go(`/cases/${id}?tab=final-document`);
  t.check("the document seal is stable and verified", (await t.attr("fd-fingerprint", "data-verified")) === "true" && (await t.text("fd-fingerprint")).includes("Document seal: unchanged") && (await t.text("final-document")).includes(fp));
  t.check("the document keeps the name it was released with", (await t.text("final-document")).includes("Elena Márquez") && !(await t.text("final-document")).includes("Márquez-Ruiz"));
  await t.go(`/review/${id}`);
  await t.notSee("reopen-review", "no review can be reopened after the release");
  await t.go(`/cases/${id}?tab=notes`);
  await t.see("notes-read-only", "no new internal note on a completed case");
  await t.step("final document after later changes");
  // RMM starts the follow-up case from the reported change
  await t.go(`/cases/${id}`);
  await t.see("case-change-reports", "the completed case shows the reported change");
  t.check("… with its text", (await t.text("case-change-reports")).includes("rosemary extract"));
  await t.click("change-report-new-case");
  t.check("Start a new case opens New case for the follow-up", (await t.hash()) === `/cases/new?from=${id}`, await t.hash());
  await t.see("newcase-follow-up", "New case names the case and the change it follows");
  t.check("New case is pre-filled with the material and the material no.", (await t.tid("newcase-material").inputValue()) === MAT.name && (await t.tid("newcase-material-no").inputValue()) === MAT.no);
  await t.click("newcase-submit");
  t.must("the follow-up case is created", await t.waitRoute(/^\/cases\/CIQ-\d{4}-\d{4}$/));
  const fu = await t.kase((await t.route()).split("/").pop());
  t.check("the follow-up case records the change it follows", fu && fu.id !== id && fu.audit.some((a) => a.action === "Follow-up case" && a.detail.includes(id)) && fu.supplierId === c.supplierId, fu?.audit.map((a) => a.action));
  await t.step("follow-up case from the change report");
});

def("S12", "Reset to empty start returns exactly the S0 state", async (t) => {
  await t.load("/");
  const clean = (s) => JSON.stringify({ ...s, personaId: undefined, toasts: undefined });
  const start = clean(await t.state());
  const id = await createCase(t, {});
  await t.viewAs(P.elena);
  await fillCiq(t, id, ["GEN", "SF"]);
  await t.viewAs(P.admin);
  await t.go("/admin/notifications");
  await t.click("run-reminders");
  t.check("there is demo data before the reset", (await t.state()).cases.length === 1 && (await t.state()).mails.length > 0);
  await t.click("person-chip");
  await t.click("reset-demo");
  await t.seeMust("reset-demo-modal");
  await t.click("reset-demo-cancel");
  t.check("Cancel keeps the data", (await t.state()).cases.length === 1);
  await t.click("person-chip");
  await t.click("reset-demo");
  await t.click("reset-demo-confirm");
  await t.settle(150);
  const after = await t.state();
  t.check("after the reset the state equals the empty start", clean(after) === start, { cases: after.cases.length, mails: after.mails.length, users: after.users.length, suppliers: after.suppliers.length, log: after.log.length });
  t.check("the persona is kept (admin), on its landing", (await t.persona()) === P.admin && (await t.route()) === "/admin/rules");
  await t.step("reset");
  await t.viewAs(P.rmm);
  await t.see("dashboard-start", "RMM is back at the start card");
  await t.viewAs(P.elena);
  await t.see("empty-portal", "Elena has no request again");
  await t.step("empty start again");
});

def("S13", "the business changes the configuration: rules and questionnaire (spec §8.4)", async (t) => {
  await t.load("/");
  const SEC = "K6.18";
  const NOTE = "Adds the microplastics declaration (K6.18) for intentionally added polymers, reviewed by Safety.";
  const rows = (prefix) => t.page.locator(`[data-testid^="${prefix}"]`).count();
  const lastToast = async () => (await t.toasts()).at(-1)?.text ?? "";

  // 1. As admin: publish the prepared RS-2026.2 + v2 (Check & publish)
  await t.viewAs(P.admin);
  t.must("the admin lands on Rules", (await t.route()) === "/admin/rules");
  await t.seeMust("config-draft-bar");
  t.check("the prepared draft is open: new rules RS-2026.2 and questionnaire v2", (await t.attr("config-draft-bar", "data-draft")) === "true" && (await t.attr("config-draft-label", "data-kind")) === "both" && (await t.text("config-change-count")) === "Rules RS-2026.2 (1 change) · questionnaire v2 (2 changes)", await t.text("config-draft-label"));
  t.check("… with 3 changes", (await t.attr("config-change-count", "data-count")) === "3", await t.attr("config-change-count", "data-count"));
  t.check("the history lists the draft and the published RS-2026.1 + v1", (await t.attr("config-history-row-RS-2026.2", "data-status")) === "draft" && (await t.attr("config-history-row-RS-2026.1", "data-status")) === "current");
  await t.see("rule-add", "the admin can add a rule to the draft");
  await t.step("admin: Rules with the prepared draft");
  await t.click("config-check-publish");
  await t.seeMust("publish-modal");
  t.check("all 8 checks pass", (await t.attr("publish-checklist", "data-ok")) === "true" && (await t.tid("publish-checklist").locator('[data-testid^="check-"][data-ok="true"]').count()) === 8);
  t.check("Check & publish says what is published: rules and questionnaire", (await t.attr("publish-plan", "data-kind")) === "both" && (await t.attr("publish-plan", "data-pair")) === "RS-2026.2 + v2", await t.text("publish-plan"));
  t.check("the change note is prefilled from the prepared draft", (await t.tid("publish-note").inputValue()).trim().length > 0);
  await t.step("Check & publish RS-2026.2 + v2");
  await t.click("publish-submit");
  let s = await t.state();
  t.must("RS-2026.2 + v2 is published", s.activeRuleSet === "RS-2026.2" && s.templates.find((x) => x.version === "CIQ-2026 v2")?.status === "published", { active: s.activeRuleSet, templates: s.templates.map((x) => `${x.version}:${x.status}`) });
  t.check("the toast says it is published and nobody runs yet", (await lastToast()).startsWith("RS-2026.2 + v2 published. New cases use it"), await lastToast());
  t.check("the bar shows no draft, RS-2026.2 + v2 for new cases", (await t.attr("config-draft-bar", "data-draft")) === "false" && (await t.text("config-published-label")).includes("Published: RS-2026.2 + v2 · used for new cases"), await t.text("config-published-label"));
  t.check("RS-2026.1 + v1 is superseded", (await t.attr("config-history-row-RS-2026.1", "data-status")) === "superseded" && (await t.attr("config-history-row-RS-2026.2", "data-status")) === "current");
  await t.notSee("rule-add", "without a draft there is no Add rule");
  await t.step("v2 published");

  // a case started before the new version (step 7 looks at it again)
  const idOld = await createCase(t, { material: "Solvasoft 313", no: "RM-410013" });
  let c = await t.kase(idOld);
  t.check(`${idOld} starts on RS-2026.2 + v2`, c.ruleSetVersion === "RS-2026.2" && c.templateVersion === "CIQ-2026 v2", { rs: c.ruleSetVersion, tpl: c.templateVersion });
  await t.step("a case on v2");

  // 2. Create a new version
  await t.viewAs(P.admin);
  await t.click("config-create-version");
  await t.seeMust("config-create-modal");
  await t.fill("config-create-note", "Microplastics declaration for polymers");
  await t.click("config-create-confirm");
  t.must("a draft is open", (await t.attr("config-draft-bar", "data-draft")) === "true");
  t.check("the new draft has no change yet: nothing to publish", (await t.text("config-change-count")) === "Nothing to publish yet: the draft is the same as RS-2026.2 + v2" && (await t.attr("config-change-count", "data-count")) === "0", { label: await t.text("config-draft-label"), count: await t.attr("config-change-count", "data-count") });
  t.check("the history shows the draft on top", (await t.attr("config-history-row-RS-2026.3", "data-status")) === "draft");
  await t.step("draft RS-2026.3 + v3 created");

  // 3. Add section K6.18 Microplastics declaration with 2 questions (yes/no mandatory; file optional)
  await t.click("nav-admin-templates");
  t.must("Questionnaire opens", (await t.route()) === "/admin/templates");
  await t.seeMust("section-add");
  await t.click("section-add");
  await t.seeMust("section-form");
  t.check("the section form shows no demo values as placeholders", ((await t.tid("section-code").getAttribute("placeholder")) ?? "") === "" && ((await t.tid("section-title").getAttribute("placeholder")) ?? "") === "" && ((await t.tid("section-meaning").getAttribute("placeholder")) ?? "") === "");
  await t.click("section-save");
  await t.see("section-form", "an empty section form is not saved");
  await t.fill("section-code", SEC);
  await t.fill("section-title", "Microplastics declaration");
  await t.page.mouse.click(8, 400);
  await t.settle(60);
  t.check("a click on the dimmed page keeps a filled-in form open", (await t.isVisible("section-form")) && (await t.tid("section-code").inputValue()) === SEC);
  t.check("the kind follows the code (chapter)", (await t.attr("section-kind", "data-value")) === "chapter", await t.attr("section-kind", "data-value"));
  await t.fill("section-meaning", "Declaration on intentionally added synthetic polymer microparticles (EU 2023/2055).");
  await t.click("section-lead");
  await t.click("section-lead-option-SAF");
  t.check("questions, not documents only", (await t.attr("section-content", "data-value")) === "questions");
  await t.step("section form filled");
  await t.click("section-save");
  await t.seeMust("section-editor", "the section editor opens on the new section");
  t.check("it is marked New in draft", (await t.attr("section-editor-mark", "data-mark")) === "new");
  await t.see("section-needs-rule", "hint: a new section needs a rule that switches it on");
  await t.see("section-no-questions", "the section has no questions yet");
  await t.step("K6.18 added");

  await t.click("field-add");
  await t.seeMust("field-form");
  await t.page.keyboard.press("Escape");
  await t.settle(60);
  t.check("Escape closes only the question form, not the section editor behind it", !(await t.isVisible("field-form")) && (await t.isVisible("section-editor")));
  await t.click("field-add");
  await t.seeMust("field-form");
  await t.fill("field-label", "Does the material contain intentionally added microplastics?");
  await t.click("field-type");
  await t.click("field-type-option-yesno");
  t.check("a new question is mandatory by default", (await t.attr("field-required", "data-value")) === "mandatory");
  const preview = await t.text("field-preview");
  t.check("the preview shows the question as the supplier sees it", preview.includes("intentionally added microplastics") && preview.includes("Yes") && preview.includes("Mandatory"), preview.slice(0, 200));
  await t.step("question 1 form");
  await t.click("field-save");
  await t.click("field-add");
  await t.seeMust("field-form");
  await t.fill("field-label", "Microplastics test report");
  await t.click("field-type");
  await t.click("field-type-option-file");
  await t.click("field-required-optional");
  await t.fill("field-help", "Upload the test report if you have one.");
  await t.step("question 2 form");
  await t.click("field-save");
  s = await t.state();
  let draft = s.config.pairs.find((p) => p.status === "draft");
  const sec = draft?.template.sections.find((x) => x.id === SEC);
  const [f1, f2] = sec?.fields ?? [];
  t.must("K6.18 holds the 2 questions in the draft", sec && sec.fields.length === 2, sec?.fields);
  t.check("question 1: yes/no, mandatory", f1.id === "FLD-K6.18-001" && f1.type === "yesno" && f1.required === "mandatory", f1);
  t.check("question 2: file, optional, with help text", f2.id === "FLD-K6.18-002" && f2.type === "file" && f2.required === "optional" && !!f2.help, f2);
  t.check("K6.18: chapter, lead Safety, after K6.17", sec.kind === "chapter" && sec.lead === "SAF" && draft.template.sections.findIndex((x) => x.id === SEC) === draft.template.sections.findIndex((x) => x.id === "K6.17") + 1);
  await t.see(`field-row-${f1.id}`, "question 1 is listed");
  await t.see(`field-row-${f2.id}`, "question 2 is listed");
  await t.step("2 questions added");

  // 4. The rule "SF-03 is Yes → K6.18 Mandatory, reviewed by Safety", from the hint
  await t.click("section-create-rule");
  await t.seeMust("rule-form");
  t.check("the rule form starts with K6.18 chosen", (await t.text("rule-sections-chosen")).includes(SEC));
  t.check("… and with Safety, K6.18's lead department, as reviewer", (await t.attr("rule-dept-SAF", "aria-pressed")) === "true");
  t.check("… and is not counted as coming from the requirements document", (await t.tid("rule-basis").first().getAttribute("data-value")) !== "document" && !(await t.text("rule-basis")).includes("Requirements document"), await t.text("rule-basis"));
  await t.click("rule-save");
  await t.see("rule-error", "an incomplete rule names what is missing");
  await t.click("rule-question");
  await t.click("rule-question-option-SF03");
  t.check("“is Yes” is the comparison", (await t.attr("rule-condition", "data-value")) === "is-yes");
  t.check("Mandatory is the outcome", (await t.attr("rule-outcome", "data-value")) === "mandatory");
  if ((await t.attr("rule-dept-SAF", "aria-pressed")) !== "true") await t.click("rule-dept-SAF");
  const sentence = await t.text("rule-preview-sentence");
  t.check("the live preview reads the rule as a sentence", /K6\.18/.test(sentence) && /mandatory/i.test(sentence) && sentence.includes("Safety"), sentence);
  t.check("… in plain words, with the section's title", sentence.includes("If the supplier answers Yes to SF-03") && sentence.includes("K6.18 Microplastics declaration becomes mandatory"), sentence);
  t.check("the preview says where the review task goes", (await t.text("rule-preview-review")).includes("K6.18 → Safety"), await t.text("rule-preview-review"));
  await t.page.mouse.click(8, 400);
  await t.settle(60);
  t.check("a click beside the filled-in rule form keeps it open", await t.isVisible("rule-form"));
  await t.step("rule form filled");
  await t.click("rule-save");
  t.check("the rule form closes", !(await t.isVisible("rule-form")));
  s = await t.state();
  draft = s.config.pairs.find((p) => p.status === "draft");
  const rule = draft.ruleSet.rules.find((r) => r.activates.includes(SEC));
  t.must("the draft has the new rule", !!rule);
  t.check(`${rule.id}: SF-03 is Yes → K6.18 mandatory, reviewed by Safety`, JSON.stringify(rule.condition) === JSON.stringify({ kind: "is", question: "SF03", value: true }) && same(rule.activates, [SEC]) && rule.outcome === "mandatory" && same(rule.departments, ["SAF"]), rule);
  t.check("the rule continues the R-numbering", /^R-\d{3}$/.test(rule.id) && rule.id === "R-122", rule.id);
  await t.notSee("section-needs-rule", "the hint is gone");
  await t.see("section-rules", "the section editor lists the rule that switches it on");
  await t.click("section-editor-close");
  t.check("K6.18 is in the catalogue, New in draft", (await t.attr(`section-row-${SEC}`, "data-mark")) === "new");
  t.check("the bar counts 2 changes: rules RS-2026.3 and questionnaire v3", (await t.attr("config-change-count", "data-count")) === "2" && (await t.text("config-change-count")) === "Rules RS-2026.3 (1 change) · questionnaire v3 (1 change)", await t.text("config-change-count"));
  await t.see(`change-section-${SEC}`, "the changes list K6.18");
  await t.step("rule added from the hint");
  await t.click("nav-admin-rules");
  await t.seeMust(`rule-row-${rule.id}`);
  t.check(`${rule.id} is marked New in draft`, (await t.attr(`rule-mark-${rule.id}`, "data-mark")) === "new" && (await t.text(`rule-mark-${rule.id}`)).includes("New in draft"));
  await t.see(`change-rule-${rule.id}`, "the changes list the rule");
  await t.step("Rules: the new rule");

  // 5. Check & publish with a change note
  await t.click("config-check-publish");
  await t.seeMust("publish-modal");
  t.check("every check passes", (await t.attr("publish-checklist", "data-ok")) === "true");
  t.check("… folded into one line, with the change note in view", (await t.text("publish-checks-toggle")).includes("All 8 checks pass") && (await t.tid("publish-note").isVisible()), await t.text("publish-checks-toggle"));
  const changes = await t.text("publish-changes");
  t.check("the change summary names K6.18, its questions and the rule", changes.includes(SEC) && changes.includes(rule.id), changes.slice(0, 300));
  t.check("1 running case keeps RS-2026.2 + v2", (await t.text("publish-running")).includes("1 running case keeps RS-2026.2 + v2"), await t.text("publish-running"));
  await t.click("publish-test-draft");
  t.check("Test the draft compares the reference materials", (await t.text("publish-test-result")).length > 20);
  await t.fill("publish-note", "");
  await t.click("publish-submit");
  t.check("without a change note nothing is published", (await t.state()).activeRuleSet === "RS-2026.2" && (await t.text("publish-blocked")).includes("change note"));
  await t.fill("publish-note", NOTE);
  await t.step("Check & publish RS-2026.3 + v3");
  await t.click("publish-submit");
  s = await t.state();
  t.must("RS-2026.3 + v3 is published", s.activeRuleSet === "RS-2026.3" && s.config.pairs.find((p) => p.ruleSet.version === "RS-2026.3")?.status === "published" && !s.config.pairs.some((p) => p.status === "draft"));
  t.check("toast: published, 1 running case keeps RS-2026.2 + v2", (await lastToast()) === "RS-2026.3 + v3 published. New cases use it; 1 running case keeps RS-2026.2 + v2.", await lastToast());
  t.check("history: RS-2026.3 current, RS-2026.2 superseded", (await t.attr("config-history-row-RS-2026.3", "data-status")) === "current" && (await t.attr("config-history-row-RS-2026.2", "data-status")) === "superseded");
  const hist = await t.text("config-history-row-RS-2026.3");
  t.check("the history row has the change note and who published it", hist.includes("microplastics declaration") && hist.includes("Nina Hoffmann"), hist);
  t.check("the configuration log has the publish", s.log.some((l) => l.kind === "config" && l.by === "u-admin" && l.action === "Published RS-2026.3 + v3"));
  await t.step("v3 published");

  // 6. RMM starts a case on the new pair; the supplier answers SF-03 = Yes and gets K6.18 with its 2 questions
  await t.viewAs(P.rmm);
  await t.go("/cases/new");
  t.check("New case says it starts on CIQ-2026 v3 / RS-2026.3", (await t.text("newcase-template-version")).includes("CIQ-2026 v3") && (await t.text("newcase-rule-set")).includes("RS-2026.3"));
  const idNew = await createCase(t, { material: "Solvasoft 318", no: "RM-410018" });
  c = await t.kase(idNew);
  t.check(`${idNew} starts on RS-2026.3 + v3`, c.ruleSetVersion === "RS-2026.3" && c.templateVersion === "CIQ-2026 v3", { rs: c.ruleSetVersion, tpl: c.templateVersion });
  await t.step("a case on v3");
  await t.viewAs(P.elena);
  await openRequest(t, idNew);
  t.check("the questionnaire is v3", (await t.attr("q-root", "data-template-version")) === "CIQ-2026 v3");
  await t.notSee(`q-nav-${SEC}`, "K6.18 is closed before SF-03 is answered");
  await fillCiq(t, idNew, ["GEN", "SF", "K1"], { SF03: true });
  await t.seeMust(`q-nav-${SEC}`, "SF-03 = Yes opens K6.18 live");
  t.check("K6.18 is mandatory, 0 of 1 answered", /Mandatory/.test(await t.text(`q-nav-${SEC}`)) && (await t.text(`q-nav-${SEC}`)).includes("0 of 1"), await t.text(`q-nav-${SEC}`));
  await navSection(t, SEC);
  t.check("K6.18 shows as mandatory", (await t.attr(`q-section-${SEC}`, "data-applicability")) === "mandatory");
  await t.see(`q-field-${f1.id}`, "the yes/no question");
  await t.see(`q-yesno-${f1.id}`, "… answered with Yes / No");
  await t.see(`q-field-${f2.id}`, "the file question");
  await t.see(`q-upload-${f2.id}`, "… answered with an upload");
  t.check("the supplier sees the question texts", (await t.text(`q-section-${SEC}`)).includes("intentionally added microplastics") && (await t.text(`q-section-${SEC}`)).includes("Microplastics test report"));
  await t.step("Elena sees K6.18 with its 2 questions");
  await t.click("check-completeness");
  await t.seeMust("blocker-panel");
  const blockFor = (f) => t.page.locator(`[data-testid="blocker-item"][data-field="${f}"]`).count();
  t.check("the mandatory question blocks completeness", (await blockFor(f1.id)) > 0);
  t.check("the optional one does not", (await blockFor(f2.id)) === 0);
  await t.step("completeness blocked by K6.18");
  await navSection(t, SEC);
  await answerYesNo(t, f1.id, false);
  t.check("the answer is saved", (await t.kase(idNew)).answers[f1.id] === false, (await t.kase(idNew)).answers[f1.id]);
  if (!(await t.isVisible("blocker-panel"))) await t.click("check-completeness");
  t.check("answered: K6.18 no longer blocks", (await blockFor(f1.id)) === 0);
  t.check("K6.18 is complete", /Mandatory · complete/.test(await t.text(`q-nav-${SEC}`)), await t.text(`q-nav-${SEC}`));
  await t.step("K6.18 answered");

  // 7. The case started before the publish keeps RS-2026.2 + v2 and never shows K6.18
  await openRequest(t, idOld);
  t.check(`${idOld} is still v2`, (await t.attr("q-root", "data-template-version")) === "CIQ-2026 v2");
  await navSection(t, "SF");
  await config(t, "SF03", true);
  await t.see("q-nav-K4.3", "SF-03 = Yes opens the v2 sections (K4.3)");
  await t.notSee(`q-nav-${SEC}`, "but not K6.18");
  await openRequest(t, idOld, SEC);
  await t.notSee(`q-section-${SEC}`, "K6.18 does not open on the v2 case, even by link");
  c = await t.kase(idOld);
  t.check(`${idOld} keeps RS-2026.2 + v2 and has no K6.18 in its scope`, c.ruleSetVersion === "RS-2026.2" && c.templateVersion === "CIQ-2026 v2" && !c.scope.some((x) => x.sectionId === SEC), { rs: c.ruleSetVersion, tpl: c.templateVersion });
  await t.step("the v2 case is unchanged");
  await t.viewAs(P.rmm);
  await t.go(`/cases/${idOld}`);
  t.check("RMM: the v2 case shows CIQ-2026 v2", (await t.text("case-template-version")).includes("CIQ-2026 v2"));
  await t.go(`/cases/${idOld}?tab=questionnaire`);
  await t.notSee(`q-section-${SEC}`, "RMM: no K6.18 on the v2 case");
  await t.go(`/cases/${idNew}?tab=questionnaire`);
  await t.see(`q-section-${SEC}`, "RMM: K6.18 on the v3 case");
  await t.step("RMM: each case on its own version");

  // 8. The auditor reads the history; RMM sees no edit controls; the domain refuses everyone but the admin
  const probe = (name, by, ...args) => t.page.evaluate(([n, b, a]) => window.__ciq.tryConfigAction(n, b, ...a), [name, by, args]);
  await t.viewAs(P.auditor);
  await t.go("/admin/rules");
  await t.seeMust("config-history", "the auditor sees the version history");
  await t.see("admin-read-only", "… with the read-only note");
  t.check("3 versions: RS-2026.3 current, RS-2026.2 and RS-2026.1 superseded", (await t.attr("config-history-row-RS-2026.3", "data-status")) === "current" && (await t.attr("config-history-row-RS-2026.2", "data-status")) === "superseded" && (await t.attr("config-history-row-RS-2026.1", "data-status")) === "superseded");
  t.check("the auditor reads the change note", (await t.text("config-history")).includes("microplastics declaration"));
  for (const id of ["config-create-version", "config-check-publish", "config-discard-draft", "rule-add", "rules-tab"]) await t.notSee(id, `auditor: no ${id}`);
  t.check("auditor: no Edit or Delete on any rule", (await rows("rule-edit-")) === 0 && (await rows("rule-delete-")) === 0);
  await t.click("ruleset-card-RS-2026.3");
  await t.see(`rule-row-${rule.id}`, `auditor: ${rule.id} in RS-2026.3`);
  t.check(`auditor: ${rule.id} is marked new in RS-2026.3`, (await t.attr(`rule-mark-${rule.id}`, "data-mark")) === "new");
  await t.step("auditor: versions read-only");
  await t.go("/audit");
  await t.fill("audit-search", "RS-2026.3");
  t.check("the audit trail lists the configuration changes", (await t.page.locator('[data-testid^="audit-row-"][data-area="config"]').count()) >= 1 && (await t.text("audit-trail")).includes("Published RS-2026.3 + v3"));
  await t.step("auditor: configuration log");
  const before = JSON.stringify((await t.state()).config);
  const refusals = [];
  for (const by of ["u-auditor", "u-rmm"]) refusals.push([by, await probe("createDraft", by, "probe")]);
  t.check("the domain refuses a new version by the auditor and RMM", refusals.every(([, r]) => typeof r === "string" && r.length > 0), refusals);
  t.check("the same change by the admin would go through (dry run)", (await probe("createDraft", "u-admin", "probe")) === null);
  t.check("the dry runs saved nothing", JSON.stringify((await t.state()).config) === before);
  await t.viewAs(P.rmm);
  // 29 Oct (Thomas): RMM and every department read the rules, the questionnaire and the section owners, read-only
  for (const r of ["/admin/rules", "/admin/templates", "/admin/ownership"]) {
    await t.go(r);
    await t.see("admin-read-only", `RMM: ${r} read-only`);
    for (const id of ["config-create-version", "config-check-publish", "config-discard-draft", "rule-add", "section-add", "rules-tab"]) await t.notSee(id, `RMM ${r}: no ${id}`);
  }
  t.check("RMM: no Edit or Delete on any rule", (await rows("rule-edit-")) === 0 && (await rows("rule-delete-")) === 0);
  await t.step("RMM: read-only, no edit controls");
});

def("S14", "requested documents: a rule asks for documents no question collects (spec §8.5)", async (t) => {
  await t.load("/");
  const SEC = "K6.18";
  const REPORT = "Microplastics test report";
  const COC = "Supplier code of conduct";
  const K_REPORT = "EV:microplastics-test-report";
  const K_COC = "EV:supplier-code-of-conduct";
  const JUST = "Our code of conduct is published on our website; we do not issue it per raw material.";
  const slotInfo = (doc) => t.page.locator(`[data-testid="rule-evidence-slot"][data-doc="${doc}"]`).first();
  const addEvidence = async (doc) => {
    await t.fill("rule-evidence-input", doc);
    await t.click("rule-evidence-add");
  };

  // 1. As admin: publish the prepared v2, then a new version with K6.18 and two rules that ask for custom documents
  await t.viewAs(P.admin);
  await t.click("config-check-publish");
  await t.seeMust("publish-modal");
  await t.click("publish-submit");
  t.must("RS-2026.2 + v2 is published", (await t.state()).activeRuleSet === "RS-2026.2");
  await t.click("config-create-version");
  await t.seeMust("config-create-modal");
  await t.fill("config-create-note", "Requested documents");
  await t.click("config-create-confirm");
  t.must("a draft is open", (await t.attr("config-draft-bar", "data-draft")) === "true");
  await t.click("nav-admin-templates");
  await t.click("section-add");
  await t.seeMust("section-form");
  await t.fill("section-code", SEC);
  await t.fill("section-title", "Microplastics declaration");
  await t.fill("section-meaning", "Declaration on intentionally added synthetic polymer microparticles (EU 2023/2055).");
  await t.click("section-lead");
  await t.click("section-lead-option-SAF");
  await t.click("section-save");
  await t.seeMust("section-editor");
  await t.click("field-add");
  await t.seeMust("field-form");
  await t.fill("field-label", "Does the material contain intentionally added microplastics?");
  await t.click("field-type");
  await t.click("field-type-option-yesno");
  await t.click("field-save");
  const F1 = "FLD-K6.18-001";
  await t.see(`field-row-${F1}`, "the yes/no question is listed");
  await t.step("K6.18 with one question");

  // the rule SF-03 Yes → K6.18, asking for a document no question collects
  await t.click("section-create-rule");
  await t.seeMust("rule-form");
  await t.click("rule-question");
  await t.click("rule-question-option-SF03");
  await addEvidence(REPORT);
  t.check("the custom document is a chip of the rule", (await t.text("rule-evidence-list")).includes(REPORT));
  t.check("no warning: an information line says where the supplier uploads it", (await slotInfo(REPORT).getAttribute("data-section")) === SEC && (await slotInfo(REPORT).innerText()).includes(`is not collected by a question yet: the supplier gets an upload slot for it under “Requested documents” in ${SEC}.`), await slotInfo(REPORT).innerText().catch(() => ""));
  t.check("the old dead-end warning is gone", !(await t.text("rule-form")).includes("nowhere to upload"));
  t.check("the preview names the document", (await t.text("rule-preview-sentence")).includes(`The supplier uploads ${REPORT}`), await t.text("rule-preview-sentence"));
  await t.step("rule form: K6.18 asks for the microplastics test report");
  await t.click("rule-save");
  t.check("the rule form closes", !(await t.isVisible("rule-form")));
  await t.click("section-editor-close");

  // an evidence-only rule on an always-on condition: its document goes to K1
  await t.click("nav-admin-rules");
  await t.click("rule-add");
  await t.seeMust("rule-form");
  await t.click("rule-question");
  await t.click("rule-question-option-ALWAYS");
  await addEvidence(COC);
  t.check("an evidence-only rule's document goes to K1", (await slotInfo(COC).getAttribute("data-section")) === "K1" && (await slotInfo(COC).innerText()).includes("in K1 (the rule switches on no section)"), await slotInfo(COC).innerText().catch(() => ""));
  await t.click("rule-dept-QM");
  await t.step("rule form: every case asks for the code of conduct");
  await t.click("rule-save");
  t.check("the evidence-only rule is saved", !(await t.isVisible("rule-form")), await t.text("rule-error").catch(() => ""));
  let s = await t.state();
  const draftRules = s.config.pairs.find((p) => p.status === "draft").ruleSet.rules;
  const rReport = draftRules.find((r) => (r.evidence ?? []).includes(REPORT));
  const rCoc = draftRules.find((r) => (r.evidence ?? []).includes(COC));
  t.must("the draft holds both rules", !!rReport && !!rCoc, draftRules.slice(-3));
  t.check(`${rReport.id}: SF-03 Yes → K6.18 mandatory, asks for the report`, rReport.condition.kind === "is" && rReport.condition.question === "SF03" && same(rReport.activates, [SEC]));
  t.check(`${rCoc.id}: every case, evidence only`, rCoc.condition.kind === "always" && rCoc.activates.length === 0 && same(rCoc.departments, ["QM"]));

  // Check & publish: the two documents are listed as information, nothing blocks
  await t.click("config-check-publish");
  await t.seeMust("publish-modal");
  t.check("every check passes", (await t.attr("publish-checklist", "data-ok")) === "true");
  const infos = await t.text("publish-infos");
  t.check("the check lists the requested documents as information", infos.includes(`${rReport.id}: “${REPORT}”`) && infos.includes(`${rCoc.id}: “${COC}”`) && infos.includes("nothing to fix"), infos);
  await t.notSee("publish-warnings", "no warning for them");
  await t.fill("publish-note", "Asks for the microplastics test report (K6.18) and the supplier code of conduct (K1).");
  await t.step("Check & publish with requested documents");
  await t.click("publish-submit");
  t.must("RS-2026.3 + v3 is published", (await t.state()).activeRuleSet === "RS-2026.3");

  // 2. RMM starts a case; Elena answers SF-03 = Yes and gets both upload slots
  const id = await createCase(t, { material: "Solvasoft 414", no: "RM-410414" });
  t.check(`${id} runs on v3`, (await t.kase(id)).templateVersion === "CIQ-2026 v3");
  await t.viewAs(P.elena);
  await fillCiq(t, id, ALL_PARTS, { SF03: true });
  await navSection(t, SEC);
  await answerYesNo(t, F1, false);
  await t.seeMust(`q-requested-${SEC}`, "K6.18 ends with Requested documents");
  t.check("the report row is missing", (await t.attr(`q-reqdoc-${K_REPORT}`, "data-status")) === "missing");
  t.check("… with why it is asked, in plain words", (await t.text(`q-reqdoc-why-${K_REPORT}`)) === "Asked for because you answered Yes to “Does the raw material contain polymers or meet the REACH polymer definition?”.", await t.text(`q-reqdoc-why-${K_REPORT}`));
  await t.see(`q-upload-${K_REPORT}`, "… with the same uploader as file questions");
  await t.see(`q-justify-${K_REPORT}`, "… and Cannot provide? Add a justification");
  t.check("K6.18 counts the document: 1 of 2", (await t.text(`q-nav-${SEC}`)).includes("1 of 2"), await t.text(`q-nav-${SEC}`));
  await t.step("Elena: K6.18 with the requested document");
  await navSection(t, "K1");
  await t.seeMust("q-requested-K1", "K1 ends with Requested documents");
  t.check("the code of conduct is asked for every raw material", (await t.text(`q-reqdoc-why-${K_COC}`)) === "Asked for every raw material.");
  await t.click("check-completeness");
  await t.seeMust("blocker-panel");
  const blocker = (k) => t.page.locator(`[data-testid="blocker-item"][data-field="${k}"]`);
  t.check("both documents block completeness", (await blocker(K_REPORT).count()) === 1 && (await blocker(K_COC).count()) === 1, await t.text("blocker-panel"));
  t.check("… named as requested documents, without rule ids", (await blocker(K_REPORT).innerText()).includes(`${REPORT} (requested document)`) && !(await t.text("blocker-panel")).match(/\bR-\d{2,3}\b/));
  t.check("… and only those two block", (await t.attr("completeness-bar", "data-blockers")) === "2", await t.attr("completeness-bar", "data-blockers"));
  await t.step("completeness blocked by the requested documents");
  await blocker(K_REPORT).click();
  await t.settle(80);
  t.check("the blocker jumps to the document in K6.18", (await t.hash()).includes(`s=${SEC}`) && (await t.isVisible(`q-reqdoc-${K_REPORT}`)), await t.hash());
  await upload(t, K_REPORT, "MP_test_report_Solvasoft414.pdf");
  let c = await t.kase(id);
  const reportDoc = c.documents.find((d) => d.fieldId === K_REPORT);
  t.check("the file is stored at the requested document, in K6.18", reportDoc?.sectionId === SEC && reportDoc.uploadedBy === "u-sup-1", reportDoc);
  t.check("the row shows it as uploaded, with who and when", (await t.attr(`q-reqdoc-${K_REPORT}`, "data-status")) === "received" && (await t.text(`q-reqdoc-${K_REPORT}`)).includes("MP_test_report_Solvasoft414.pdf") && (await t.text(`q-reqdoc-${K_REPORT}`)).includes("Elena Márquez (you)"));
  await t.step("report uploaded");
  await navSection(t, "K1");
  await t.click(`q-justify-${K_COC}`);
  await t.fill(`q-reqdoc-justification-${K_COC}-text`, JUST);
  await t.tid(`q-reqdoc-justification-${K_COC}-text`).blur();
  await t.settle(60);
  t.check("the code of conduct is justified", (await t.attr(`q-reqdoc-${K_COC}`, "data-status")) === "justified" && (await t.kase(id)).justifications[K_COC] === JUST);
  t.check("nothing blocks completeness any more", (await t.attr("completeness-bar", "data-blockers")) === "0", await t.attr("completeness-bar", "data-blockers"));
  await t.step("code of conduct justified");
  await confirmCompleteness(t, id);
  c = await t.kase(id);
  t.check("the requested documents are fixed at the confirmation", same(c.requestedDocs.map((x) => x.key), [K_REPORT, K_COC]), c.requestedDocs);

  // 3. The reviewers see each requested document with its status
  await t.viewAs(P.saf);
  await t.go(`/review/${id}?s=${SEC}`);
  await t.seeMust(`requested-${SEC}`, "Safety: K6.18 lists the requested document");
  const safRow = await t.text(`reqdoc-${K_REPORT}`);
  t.check("Safety: received, with the file and the rule that asks for it", (await t.attr(`reqdoc-${K_REPORT}`, "data-status")) === "received" && safRow.includes("Received") && safRow.includes("MP_test_report_Solvasoft414.pdf") && safRow.includes(`Requested by rule ${rReport.id}`), safRow);
  await t.see(`ask-reqdoc-${K_REPORT}`, "Safety can ask the supplier about it");
  await t.step("Safety: requested document received");
  await t.viewAs(P.qm);
  await t.go(`/review/${id}?s=K1`);
  await t.seeMust("requested-K1");
  t.check("QM: the code of conduct is not provided, justified, with the justification", (await t.attr(`reqdoc-${K_COC}`, "data-status")) === "justified" && (await t.text(`reqdoc-${K_COC}`)).includes(JUST));
  await t.step("QM: requested document justified");
  await t.viewAs(P.rmm);
  await t.go(`/cases/${id}?tab=questionnaire`);
  await t.seeMust("q-evidence");
  const chip = (rule, doc) => t.attr(`q-evidence-${rule}-${doc.replace(/[^a-z0-9]+/gi, "-")}`, "data-state");
  t.check("RMM's evidence chips count them: report received, code of conduct justified", (await chip(rReport.id, REPORT)) === "received" && (await chip(rCoc.id, COC)) === "justified", [await chip(rReport.id, REPORT), await chip(rCoc.id, COC)]);
  t.check("the case Questionnaire tab shows the rows with their status", (await t.attr(`reqdoc-${K_REPORT}`, "data-status")) === "received" && (await t.attr(`reqdoc-${K_COC}`, "data-status")) === "justified");
  await t.step("RMM: Questionnaire tab");

  // 4. Release: the final document lists both
  await completeAll(t, id);
  await t.viewAs(P.elena);
  await release(t, id);
  await t.viewAs(P.rmm);
  await t.go(`/cases/${id}?tab=final-document`);
  await t.seeMust("fd-evidence");
  const fdReport = await t.text(`fd-requested-${reportDoc.id}`);
  t.check("FD evidence: the report with file name, uploader and date", fdReport.includes("MP_test_report_Solvasoft414.pdf") && fdReport.includes(`Requested document: ${REPORT}`) && fdReport.includes("Elena Márquez") && /\d{1,2} \w{3} 2026/.test(fdReport), fdReport);
  const fdCoc = await t.text(`fd-requested-${K_COC}`);
  t.check("FD evidence: the code of conduct with its justification", (await t.attr(`fd-requested-${K_COC}`, "data-status")) === "justified" && fdCoc.includes(JUST) && fdCoc.includes("Not provided"), fdCoc);
  const d = (await t.kase(id)).finalDocument;
  t.check("FD sections: K6.18 holds the requested document", d.sections.find((x) => x.sectionId === SEC)?.answers.some((a) => a.fieldId === K_REPORT && a.value === "MP_test_report_Solvasoft414.pdf"));
  await t.step("final document lists the requested documents");
});

def("S15", "internal notes: @mention a colleague, who gets one e-mail linking to the note", async (t) => {
  await t.load("/");
  const id = await caseInReview(t);
  const kb = (key) => t.page.keyboard.press(key).then(() => t.settle(20));
  const options = () => t.page.locator('[data-testid^="mention-option-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice("mention-option-".length)));
  const activeOption = () => t.page.locator('[data-testid^="mention-option-"][data-active="true"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice("mention-option-".length))[0]);

  // 1. RMM on the case page's Internal notes tab: "@" lists the active Beiersdorf colleagues only
  await t.viewAs(P.rmm);
  await t.go(`/cases/${id}?tab=notes`);
  await t.seeMust("note-text");
  const box = t.tid("note-text").first();
  await box.click();
  await box.pressSequentially("Before we ask the supplier, @");
  await t.seeMust("mention-list", "typing @ opens the list of colleagues");
  const listed = await options();
  t.check("… every active Beiersdorf colleague except the writer", same(listed, INTERNAL_USERS.filter((u) => u !== "u-rmm")), listed);
  t.check("… and no supplier contact", !listed.some((u) => SUPS.includes(u)), listed);
  const miraRow = await t.text("mention-option-u-saf");
  t.check("… each with name and role", miraRow.includes("Dr. Mira Hansen") && miraRow.includes("Product Safety Assessor"), miraRow);
  await box.pressSequentially("mi");
  t.check("typing filters: @mi lists Dr. Mira Hansen, then Tobias Keller (Microbiology)", JSON.stringify(await options()) === JSON.stringify(["u-saf", "u-mic"]), await options());
  t.check("… the first is active", (await activeOption()) === "u-saf");
  await kb("ArrowDown");
  t.check("↓ moves to the next colleague", (await activeOption()) === "u-mic");
  await kb("ArrowUp");
  t.check("↑ moves back", (await activeOption()) === "u-saf");
  await t.step("@ list filtered, keyboard");
  await kb("Enter");
  t.check("Enter inserts the mention", (await box.inputValue()) === "Before we ask the supplier, @Dr. Mira Hansen ", await box.inputValue());
  t.check("… and closes the list", !(await t.isVisible("mention-list")));
  await box.pressSequentially("please check the arsenic value from the second batch with @le");
  await t.seeMust("mention-option-u-qm", "@le lists Lena Krause");
  await t.click("mention-option-u-qm");
  t.check("a click inserts the mention", (await box.inputValue()).endsWith("second batch with @Lena Krause "), await box.inputValue());
  await box.pressSequentially("too. @fe");
  await t.seeMust("mention-option-u-cus", "@fe lists Felix Schulz");
  await kb("Escape");
  t.check("Escape closes the list", !(await t.isVisible("mention-list")));
  t.check("… and inserts nothing", (await box.inputValue()).endsWith("@Lena Krause too. @fe"), await box.inputValue());
  for (let i = 0; i < 3; i++) await kb("Backspace");
  await box.pressSequentially("As @Elena");
  await t.seeMust("mention-none", "a supplier contact cannot be mentioned");
  t.check("… the list says only Beiersdorf colleagues can be", (await t.text("mention-none")).includes("Only Beiersdorf colleagues can be mentioned"));
  await kb("Escape");
  await box.pressSequentially(" Márquez wrote, the method changed. Thanks @Dr. Mira Hansen. ");
  t.check("the list is closed after a complete mention", !(await t.isVisible("mention-list")));
  const written = (await box.inputValue()).trim();
  await t.step("note written with three mentions (one twice) and a supplier name");
  await t.click("note-add");
  let c = await t.kase(id);
  const note = c.internalNotes.at(-1);
  t.must("the note is saved with its readable text", note?.text === written, note);
  t.check("… and its mentions as user ids, each once; the supplier contact is none", JSON.stringify(note.mentions) === JSON.stringify(["u-saf", "u-qm"]), note.mentions);
  let s = await t.state();
  const mm = ev(s, "note-mention", id);
  t.check("one mail each to Dr. Mira Hansen and Lena Krause; none to the writer or a supplier", mm.length === 2 && same(recipients(mm), ["u-qm", "u-saf"]) && mm.every((m) => m.to.length === 1 && m.audience === "internal"), mm.map((m) => m.to));
  t.check("… subject “Katrin Vogel mentioned you on …”, the note quoted in the body", mm.every((m) => m.subject === `Katrin Vogel mentioned you on ${id}` && m.body.includes(note.text)), mm.map((m) => m.subject));
  t.check("the toast says who gets an e-mail", (await t.toasts()).some((x) => x.text === "Note added. Dr. Mira Hansen and Lena Krause get an e-mail."), (await t.toasts()).map((x) => x.text));
  const chips = await t.tid(`note-${note.id}`).locator('[data-testid="mention-chip"]').evaluateAll((els) => els.map((e) => e.dataset.user));
  t.check("the note shows its mentions as chips (not the supplier's name)", JSON.stringify(chips) === JSON.stringify(["u-saf", "u-qm", "u-saf"]), chips);
  t.check("… and whom it e-mailed", (await t.text(`note-notified-${note.id}`)).includes("E-mailed Dr. Mira Hansen and Lena Krause"));
  await t.step("RMM: note saved, Mira and Lena e-mailed");

  // 2. Dr. Mira Hansen: the mail is in her inbox and its link opens the note
  await t.viewAs(P.saf);
  const mira = mm.find((m) => m.to[0] === "u-saf");
  await t.click("inbox-button");
  await t.seeMust(`inbox-item-${mira.id}`, "Mira's inbox lists the mention mail");
  t.check("… as unread, labelled “Mentioned in a note”", (await t.attr(`inbox-item-${mira.id}`, "data-read")) === "false" && (await t.text(`inbox-item-${mira.id}`)).includes("Mentioned in a note"));
  await t.click(`inbox-item-${mira.id}`);
  const pane = await t.text("inbox-reading-pane");
  t.check("the mail says who mentioned her where, and quotes the note", pane.includes(`Katrin Vogel mentioned you on ${id}`) && pane.includes(note.text) && pane.includes("the supplier never sees them"), pane.slice(0, 600));
  t.check("… with “Open the note”", (await t.text("inbox-open-link")).includes("Open the note"));
  await t.step("Mira reads the mention mail");
  await t.click("inbox-open-link");
  const safReviews = !!track(c, "SAF");
  t.check(`the link opens ${safReviews ? "her review workspace" : "the case page"}`, (await t.route()) === (safReviews ? `/review/${id}` : `/cases/${id}`), await t.hash());
  await t.seeMust(`note-${note.id}`, "the note is shown");
  t.check("… marked as the linked note", (await t.attr(`note-${note.id}`, "data-linked")) === "true");
  t.check("… scrolled into view", await t.tid(`note-${note.id}`).evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }));
  t.check("… with “Mentions you” and her own mention highlighted", (await t.tid(`note-${note.id}`).locator('[data-testid="note-mentions-you"]').count()) === 1 && (await t.tid(`note-${note.id}`).locator('[data-testid="mention-chip"][data-me="true"]').count()) === 2);
  await t.step("Mira at the note");

  // 3. Mira replies from the review workspace's notes panel and mentions Katrin with a click
  await t.go(`/review/${id}`);
  await t.seeMust("note-input");
  const rbox = t.tid("note-input").first();
  await rbox.click();
  await rbox.pressSequentially("Agreed, @kat");
  await t.click("mention-option-u-rmm");
  await rbox.pressSequentially("I will look at the second batch first.");
  await t.click("note-add");
  c = await t.kase(id);
  const reply = c.internalNotes.at(-1);
  t.check("the reply mentions Katrin Vogel", reply.text === "Agreed, @Katrin Vogel I will look at the second batch first." && JSON.stringify(reply.mentions) === JSON.stringify(["u-rmm"]), reply);
  s = await t.state();
  const kat = ev(s, "note-mention", id).filter((m) => m.to.includes("u-rmm"));
  t.check("Katrin gets one mail, from Dr. Mira Hansen", kat.length === 1 && kat[0].subject === `Dr. Mira Hansen mentioned you on ${id}`, kat.map((m) => m.subject));
  await t.step("Mira mentions Katrin from the review workspace");
  await t.viewAs(P.rmm);
  await t.click("inbox-button");
  await t.click(`inbox-item-${kat[0].id}`);
  await t.click("inbox-open-link");
  t.check("Katrin's link opens her review workspace", (await t.route()) === `/review/${id}`, await t.hash());
  await t.seeMust(`note-${reply.id}`);
  t.check("… at Mira's reply", (await t.attr(`note-${reply.id}`, "data-linked")) === "true");
  await t.step("Katrin at the reply");

  // 4. Customs on its K7 card: the note box suggests colleagues too, and the saved note shows its mention
  await t.viewAs(P.cus);
  await t.go(`/cases/${id}?tab=questionnaire&s=K7`);
  await t.seeMust("q-focus-note-K7", "Customs: the K7 card has its note box");
  const kbox = t.tid("q-focus-note-K7").first();
  await kbox.click();
  await kbox.pressSequentially("HS code checked, @kat");
  await t.seeMust("mention-option-u-rmm", "Customs: @kat on the K7 card lists Katrin Vogel");
  await kb("Enter");
  await kbox.pressSequentially("please confirm the export licence.");
  await t.click("q-focus-note-add-K7");
  c = await t.kase(id);
  const k7 = c.internalNotes.at(-1);
  t.check("Customs: the K7 note is saved with its mention", k7?.sectionId === "K7" && k7.by === "u-cus" && k7.text === "HS code checked, @Katrin Vogel please confirm the export licence." && JSON.stringify(k7.mentions) === JSON.stringify(["u-rmm"]), k7);
  t.check("… the K7 card shows the mention as a chip and whom it e-mailed", (await t.tid("q-focus-notes-K7").locator('[data-testid="mention-chip"]').count()) === 1 && (await t.text(`note-notified-${k7.id}`)).includes("E-mailed Katrin Vogel"));
  s = await t.state();
  t.check("… Katrin gets one mail for it", ev(s, "note-mention", id).filter((m) => m.to.includes("u-rmm") && m.by === "u-cus").length === 1, ev(s, "note-mention", id).map((m) => [m.by, m.to]));
  await t.step("Customs mentions Katrin on the K7 card");

  // 5. The supplier never sees a mention: not in its inbox, not on the request, the link is not reachable
  for (const pid of [P.elena, P.ravi]) {
    await t.viewAs(pid);
    await t.click("inbox-button");
    const evs = await t.page.locator('[data-testid^="inbox-item-"]').evaluateAll((els) => els.map((e) => e.dataset.event));
    t.check(`${pid}: no mention mail in the inbox`, evs.length > 0 && !evs.includes("note-mention"), evs);
    await t.closeOverlays();
    await openRequest(t, id);
    const txt = await t.text();
    t.check(`${pid}: the request shows no note and no mention`, !txt.includes("second batch") && !txt.includes("mentioned you"), txt.match(/.{0,40}(second batch|mentioned you).{0,40}/)?.[0]);
    await t.go(`/cases/${id}?tab=notes&note=${note.id}`);
    t.check(`${pid}: the note link is not reachable`, (await t.route()) === "/portal", await t.route());
    await t.step(`${pid}: nothing of the mention`);
  }
  s = await t.state();
  t.check("every mention mail is internal and goes to Beiersdorf people only", ev(s, "note-mention").every((m) => m.audience === "internal" && m.to.every((u) => INTERNAL_USERS.includes(u))));
  t.check("no supplier mail carries a note or a mention", s.mails.filter((m) => m.audience === "supplier").every((m) => !`${m.subject}\n${m.body}`.includes("second batch") && !`${m.subject}\n${m.body}`.includes("mentioned")));
});

def("S16", "duplicate section codes are refused while typing; rules or questionnaire published on their own (Thomas, 14 Oct)", async (t) => {
  await t.load("/");
  const lastToast = async () => (await t.toasts()).at(-1)?.text ?? "";
  const probe = (name, by, ...args) => t.page.evaluate(([n, b, a]) => window.__ciq.tryConfigAction(n, b, ...a), [name, by, args]);
  const codeError = async () => ((await t.isVisible("section-code-error")) ? await t.text("section-code-error") : "");
  const saveDisabled = () => t.tid("section-save").first().isDisabled();
  // Rules > Test rules > Try one material: the open draft is named by what publishing gives, never by a stray number
  const simOption = async (select, value) => {
    await t.go("/admin/rules?tab=test&view=try");
    await t.seeMust(select);
    await t.click(select);
    const text = (await t.text(`${select}-option-${value}`)).trim();
    await t.page.keyboard.press("Escape");
    await t.settle(40);
    return text;
  };
  const typeCode = async (code) => {
    await t.fill("section-code", "");
    await t.tid("section-code").first().pressSequentially(code, { delay: 15 });
    await t.settle(40);
  };

  // 0. As admin: publish the prepared RS-2026.2 + v2 (rules and questionnaire), then a case starts on it
  await t.viewAs(P.admin);
  await t.click("config-check-publish");
  await t.seeMust("publish-modal");
  await t.click("publish-submit");
  t.must("RS-2026.2 + v2 is published", (await t.state()).activeRuleSet === "RS-2026.2");
  const idV2 = await createCase(t, { material: "Solvasoft 320", no: "RM-410020" });
  await t.step("v2 published, a case on RS-2026.2 + v2");

  // 1. A new version: nothing changed yet, so nothing to publish
  await t.viewAs(P.admin);
  await t.click("config-create-version");
  await t.seeMust("config-create-modal");
  const numbers = await t.text("config-create-numbers");
  t.check("the create dialog explains that only what changes gets a new number (RS-2026.3, v3)", numbers.includes("RS-2026.3") && numbers.includes("v3") && numbers.includes("keeps its version"), numbers);
  await t.fill("config-create-note", "Halal and kosher for fermentation; plantation certificate");
  await t.click("config-create-confirm");
  t.must("a draft is open", (await t.attr("config-draft-bar", "data-draft")) === "true");
  t.check("the bar: nothing to publish yet", (await t.attr("config-change-count", "data-kind")) === "none" && (await t.text("config-change-count")) === "Nothing to publish yet: the draft is the same as RS-2026.2 + v2", await t.text("config-change-count"));
  t.check("the history row of the draft says no changes yet", (await t.attr("config-history-row-RS-2026.3", "data-status")) === "draft" && (await t.attr("config-history-row-RS-2026.3", "data-kind")) === "none");
  await t.click("config-check-publish");
  await t.seeMust("publish-modal");
  t.check("Check & publish: “nothing to publish” is a failing check", (await t.attr("check-has-changes", "data-ok")) === "false" && (await t.text("check-has-changes")).includes("Nothing to publish: the draft is the same as RS-2026.2 + v2."), await t.text("check-has-changes"));
  t.check("… Publish is disabled", await t.tid("publish-submit").first().isDisabled());
  t.check("the domain refuses it too", (await probe("publishDraft", "u-admin", "Nothing")) === "Nothing to publish: the draft is the same as RS-2026.2 + v2.");
  await t.step("Check & publish an unchanged draft");
  await t.page.keyboard.press("Escape");
  await t.settle(60);

  // 2. (A) A new section may not repeat a code, however it is written: inline while typing, Save disabled
  await t.click("nav-admin-templates");
  await t.seeMust("section-add");
  await t.click("section-add");
  await t.seeMust("section-form");
  await t.fill("section-title", "Mineral oil hydrocarbons, second annex");
  const MOAH = "Annex 4 is already used by “Hydrocarbons (MOAH)” (in this draft). Choose another code.";
  for (const code of ["a 4", "A4", "annex4", "Annex 4"]) {
    await typeCode(code);
    const err = await codeError();
    t.check(`typing “${code}”: the duplicate shows under the code at once`, err === MOAH, err);
    t.check(`typing “${code}”: Save is disabled`, await saveDisabled());
  }
  await t.step("duplicate code Annex 4 shown while typing");
  await typeCode("k6.1");
  t.check("“k6.1” is K6.1 (EU REACH)", (await codeError()) === "K6.1 is already used by “EU REACH” (in this draft). Choose another code.", await codeError());
  t.check("… Save stays disabled", await saveDisabled());
  await t.click("section-save", { force: true });
  t.check("clicking the disabled Save adds nothing", (await t.isVisible("section-form")) && !(await t.state()).config.pairs.at(-1).template.sections.some((x) => x.title.startsWith("Mineral oil hydrocarbons")));
  await typeCode("K6.19");
  t.check("a free code: no message, Save enabled", (await codeError()) === "" && !(await saveDisabled()));
  await t.step("a free code can be saved");
  await t.click("section-cancel");
  await t.settle(60);
  // editing an existing section: its own code is fine, another section's is not
  await t.click("section-row-K3");
  await t.seeMust("section-editor");
  await t.click("section-edit-settings");
  await t.seeMust("section-form");
  t.check("editing K3: its own code shows no message", (await codeError()) === "" && !(await saveDisabled()));
  await typeCode("k 4.1");
  t.check("K3 recoded “k 4.1”: K4.1 is used by Toxicity data", (await codeError()) === "K4.1 is already used by “Toxicity data” (in this draft). Choose another code." && (await saveDisabled()), await codeError());
  await t.step("editing K3 to a used code");
  await t.click("section-cancel");
  await t.click("section-editor-close");
  t.check("the domain refuses the duplicate too (written as “annex4”)", (await probe("upsertSection", "u-admin", { code: "annex4", title: "x", kind: "annex", meaning: "", lead: "SAF", co: [], documentsOnly: true })) === MOAH);
  t.check("nothing was added to the draft", (await t.attr("config-change-count", "data-count")) === "0");

  // 3. (B) Rules only: a new rule, then publish RS-2026.3 with questionnaire v2 kept
  await t.click("nav-admin-rules");
  await t.seeMust("rule-add");
  await t.click("rule-add");
  await t.seeMust("rule-form");
  await t.click("rule-question");
  await t.click("rule-question-option-SF06");
  t.check("“is Yes” is the comparison", (await t.attr("rule-condition", "data-value")) === "is-yes");
  await t.fill("rule-sections-search", "K6.8");
  await t.click("rule-section-K6.8");
  if ((await t.attr("rule-dept-REG", "aria-pressed")) !== "true") await t.click("rule-dept-REG");
  await t.fill("rule-note", "Fermentation can affect the halal and kosher status.");
  await t.click("rule-save");
  t.check("the rule form closes", !(await t.isVisible("rule-form")));
  const ruleId = (await t.state()).config.pairs.at(-1).ruleSet.rules.find((r) => r.activates.includes("K6.8") && r.condition.question === "SF06")?.id;
  t.must("the draft has the new rule", !!ruleId);
  t.check("the bar: Rules RS-2026.3 (1 change) · questionnaire stays v2", (await t.attr("config-change-count", "data-kind")) === "rules" && (await t.text("config-change-count")) === "Rules RS-2026.3 (1 change) · questionnaire stays v2", await t.text("config-change-count"));
  t.check("the draft row reads RS-2026.3 + v2, rules only", (await t.attr("config-history-row-RS-2026.3", "data-kind")) === "rules" && (await t.text("ruleset-card-RS-2026.3")).includes("RS-2026.3 + v2"), await t.text("ruleset-card-RS-2026.3"));
  t.check("the draft's rule list says it becomes RS-2026.3", (await t.text("rule-list-title")).includes("RS-2026.3 when published"), await t.text("rule-list-title"));
  await t.step("rules-only draft");
  const simTplRules = await simOption("sim-questionnaire", "CIQ-2026 v3");
  t.check("Try one material: the draft's questionnaire reads “questionnaire stays v2” (no v3)", simTplRules === "Draft: questionnaire stays v2", simTplRules);
  const simRsRules = await simOption("sim-rule-set", "RS-2026.3");
  t.check("… the draft's rules read RS-2026.3 (draft)", simRsRules === "RS-2026.3 (draft)", simRsRules);
  await t.step("Try one material during a rules-only draft");
  await t.go("/admin/rules");
  await t.click("config-check-publish");
  await t.seeMust("publish-modal");
  t.check("Check & publish: rules only, questionnaire v2 kept", (await t.attr("publish-plan", "data-kind")) === "rules" && (await t.attr("publish-plan", "data-pair")) === "RS-2026.3 + v2" && (await t.text("publish-plan")).includes("no new questionnaire version"), await t.text("publish-plan"));
  t.check("… all 8 checks pass", (await t.attr("publish-checklist", "data-ok")) === "true");
  await t.fill("publish-note", "Fermentation (SF-06): halal and kosher status becomes mandatory.");
  await t.step("Check & publish rules only");
  await t.click("publish-submit");
  let s = await t.state();
  const last = s.config.pairs.at(-1);
  t.must("RS-2026.3 + v2 is published", s.activeRuleSet === "RS-2026.3" && last.status === "published" && last.ruleSet.version === "RS-2026.3" && last.template.version === "CIQ-2026 v2");
  t.check("no new questionnaire version: v1 and v2 only", same(s.templates.map((x) => x.version), ["CIQ-2026 v1", "CIQ-2026 v2"]) && !s.config.pairs.some((p) => p.template.version === "CIQ-2026 v3"), s.templates.map((x) => x.version));
  t.check("toast: rules published with questionnaire v2 unchanged", (await lastToast()) === "Rules RS-2026.3 published with questionnaire v2 (unchanged). New cases use RS-2026.3 + v2; 1 running case keeps RS-2026.2 + v2.", await lastToast());
  t.check("history: RS-2026.3 + v2 current, rules only", (await t.attr("config-history-row-RS-2026.3", "data-status")) === "current" && (await t.attr("config-history-row-RS-2026.3", "data-pair")) === "RS-2026.3 + v2" && (await t.text("config-history-kind-RS-2026.3")).includes("Rules only"), await t.text("config-history-kind-RS-2026.3"));
  t.check("… RS-2026.2 + v2 superseded, rules and questionnaire", (await t.attr("config-history-row-RS-2026.2", "data-status")) === "superseded" && (await t.text("config-history-kind-RS-2026.2")).includes("Rules and questionnaire"));
  await t.step("rules-only release published");
  await t.click("nav-admin-templates");
  await t.seeMust("questionnaire-used-with");
  t.check("Questionnaire: v2 is used for new cases with RS-2026.3", (await t.text("questionnaire-used-with")) === "Used for new cases with rules RS-2026.3.", await t.text("questionnaire-used-with"));
  await t.see("questionnaire-kept-note", "Questionnaire: the release kept v2 unchanged");
  await t.step("Questionnaire page after a rules-only release");

  // a new case: RS-2026.3 with the old questionnaire v2; SF-06 = Yes makes K6.8 mandatory (the new rule)
  await t.viewAs(P.rmm);
  await t.go("/cases/new");
  t.check("New case starts on CIQ-2026 v2 with RS-2026.3", (await t.text("newcase-template-version")).includes("CIQ-2026 v2") && (await t.text("newcase-rule-set")).includes("RS-2026.3"));
  const idRules = await createCase(t, { material: "Solvasoft 321", no: "RM-410021" });
  let c = await t.kase(idRules);
  t.check(`${idRules} runs on RS-2026.3 + v2`, c.ruleSetVersion === "RS-2026.3" && c.templateVersion === "CIQ-2026 v2", { rs: c.ruleSetVersion, tpl: c.templateVersion });
  await t.viewAs(P.elena);
  await fillCiq(t, idRules, ["GEN", "SF"], { SF06: true });
  await navSection(t, "K6.8");
  t.check("the new rule applies on the old questionnaire: K6.8 is mandatory", (await t.attr("q-section-K6.8", "data-applicability")) === "mandatory", await t.attr("q-section-K6.8", "data-applicability"));
  c = await t.kase(idRules);
  t.check(`… fired by ${ruleId}`, c.scope.find((x) => x.sectionId === "K6.8")?.firedRules.includes(ruleId), c.scope.find((x) => x.sectionId === "K6.8"));
  await fillCiq(t, idV2, ["GEN", "SF"], { SF06: true });
  await navSection(t, "K6.8");
  t.check("the RS-2026.2 case keeps its rules: K6.8 stays optional", (await t.attr("q-section-K6.8", "data-applicability")) === "optional" && (await t.kase(idV2)).ruleSetVersion === "RS-2026.2", await t.attr("q-section-K6.8", "data-applicability"));
  await t.step("a new case on RS-2026.3 + v2");

  // 4. (B) Questionnaire only: one more question in Annex 1 → v3 (not v4), rule set RS-2026.3 kept
  await t.viewAs(P.admin);
  await t.click("config-create-version");
  await t.seeMust("config-create-modal");
  const numbers2 = await t.text("config-create-numbers");
  t.check("numbers count per side: rules RS-2026.4, questionnaire v3", numbers2.includes("RS-2026.4") && numbers2.includes("v3") && !numbers2.includes("v4"), numbers2);
  await t.click("config-create-confirm");
  await t.click("nav-admin-templates");
  await t.seeMust("section-row-A1");
  await t.click("section-row-A1");
  await t.seeMust("section-editor");
  await t.click("field-add");
  await t.seeMust("field-form");
  await t.fill("field-label", "Certification body of the plantation");
  await t.click("field-required-optional");
  await t.click("field-save");
  await t.click("section-editor-close");
  t.check("the bar: Questionnaire v3 (1 change) · rules stay RS-2026.3", (await t.attr("config-change-count", "data-kind")) === "questionnaire" && (await t.text("config-change-count")) === "Questionnaire v3 (1 change) · rules stay RS-2026.3", await t.text("config-change-count"));
  t.check("the draft's questionnaire becomes v3", (await t.text("questionnaire-used-with")).startsWith("Becomes questionnaire v3"), await t.text("questionnaire-used-with"));
  await t.step("questionnaire-only draft");
  const simRsTpl = await simOption("sim-rule-set", "RS-2026.4");
  t.check("Try one material: the draft's rules read “rules stay RS-2026.3” (no RS-2026.4)", simRsTpl === "Draft: rules stay RS-2026.3", simRsTpl);
  await t.click("sim-rule-set");
  await t.click("sim-rule-set-option-RS-2026.4");
  const simPair = await t.text("sim-pair");
  const simCompare = await t.text("sim-compare");
  t.check("… choosing it tests RS-2026.3 with the draft questionnaire v3", simPair.replace(/\s+/g, " ").trim() === "RS-2026.3 · questionnaire v3 (draft)", simPair);
  t.check("… compared with RS-2026.3 · v2, no RS-2026.4 anywhere", simCompare.replace(/\s+/g, " ").startsWith("RS-2026.3 · v2 → RS-2026.3 · v3 (draft)") && !(await t.text("test-rules")).includes("RS-2026.4"), simCompare);
  await t.step("Try one material during a questionnaire-only draft");
  await t.click("nav-admin-templates");
  await t.click("config-check-publish");
  await t.seeMust("publish-modal");
  t.check("Check & publish: questionnaire only, rules RS-2026.3 kept", (await t.attr("publish-plan", "data-kind")) === "questionnaire" && (await t.attr("publish-plan", "data-pair")) === "RS-2026.3 + v3" && (await t.text("publish-plan")).includes("no new rule set"), await t.text("publish-plan"));
  await t.fill("publish-note", "Asks for the plantation's certification body (Annex 1).");
  await t.click("publish-submit");
  s = await t.state();
  t.must("RS-2026.3 + v3 is published", s.activeRuleSet === "RS-2026.3" && s.config.pairs.at(-1).template.version === "CIQ-2026 v3" && s.config.pairs.at(-1).status === "published");
  t.check("no new rule set: RS-2026.4 does not exist", !s.config.pairs.some((p) => p.ruleSet.version === "RS-2026.4"));
  t.check("toast: questionnaire v3 published with RS-2026.3 unchanged", (await lastToast()) === "Questionnaire v3 published with rules RS-2026.3 (unchanged). New cases use RS-2026.3 + v3; 2 running cases keep the version they started with.", await lastToast());
  t.check("history: RS-2026.3 + v3 current, questionnaire only", (await t.attr("config-history-row-v3", "data-status")) === "current" && (await t.attr("config-history-row-v3", "data-pair")) === "RS-2026.3 + v3" && (await t.text("config-history-kind-v3")).includes("Questionnaire only"));
  t.check("… RS-2026.3 + v2 superseded, running cases keep it", (await t.attr("config-history-row-RS-2026.3", "data-status")) === "superseded");
  await t.step("questionnaire-only release published");
  await t.click("nav-admin-rules");
  await t.see("rules-kept-note", "Rules: the release kept RS-2026.3 unchanged");
  await t.see(`rule-row-${ruleId}`, `Rules: ${ruleId} is in the rules used for new cases`);
  await t.step("Rules page after a questionnaire-only release");

  // a new case: RS-2026.3 + v3; the cases started before keep their pairs
  await t.viewAs(P.rmm);
  await t.go("/cases/new");
  t.check("New case starts on CIQ-2026 v3 with RS-2026.3", (await t.text("newcase-template-version")).includes("CIQ-2026 v3") && (await t.text("newcase-rule-set")).includes("RS-2026.3"));
  const idTpl = await createCase(t, { material: "Solvasoft 322", no: "RM-410022" });
  s = await t.state();
  const pairOf = (id) => {
    const k = s.cases.find((x) => x.id === id);
    return `${k.ruleSetVersion} + ${k.templateVersion}`;
  };
  t.check("each case keeps its pair", pairOf(idV2) === "RS-2026.2 + CIQ-2026 v2" && pairOf(idRules) === "RS-2026.3 + CIQ-2026 v2" && pairOf(idTpl) === "RS-2026.3 + CIQ-2026 v3", [pairOf(idV2), pairOf(idRules), pairOf(idTpl)]);
  await t.step("a new case on RS-2026.3 + v3");

  // the auditor reads the history and the log
  await t.viewAs(P.auditor);
  await t.go("/admin/rules");
  await t.seeMust("config-history");
  const hist = await t.text("config-history");
  t.check("the auditor sees which side each release changed", hist.includes("Questionnaire only") && hist.includes("Rules only") && hist.includes("Rules and questionnaire"), hist.slice(0, 400));
  for (const id of ["config-create-version", "config-check-publish", "rule-add"]) await t.notSee(id, `auditor: no ${id}`);
  s = await t.state();
  t.check("the configuration log names both releases", s.log.some((l) => l.action === "Published RS-2026.3 + v2" && l.detail.startsWith("Rules only")) && s.log.some((l) => l.action === "Published RS-2026.3 + v3" && l.detail.startsWith("Questionnaire only")));
  await t.step("auditor: history and log");
});

// ------------------------------------------------------------------------------------------------- run

const todo = wantedIds.length ? SCENARIOS.filter((s) => wantedIds.includes(s.id)) : SCENARIOS;
if (wantedIds.length && todo.length !== wantedIds.length) console.error(`Unknown scenario(s): ${wantedIds.filter((w) => !SCENARIOS.some((s) => s.id === w)).join(", ")}`);
for (const s of todo) await scenario(s.id, s.title, s.fn);
await browser.close();
server.close();
writeFileSync(path.join(out, "harness-prototype-report.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
const checks = results.reduce((n, r) => n + r.checks.length, 0);
console.log(`${results.length - failed}/${results.length} scenarios passed (${checks} checks)`);
process.exit(failed || !results.length ? 1 : 0);
