// Headless check of the BUILT live internal UI (dist-applive/zip/index.html) the way Kissflow runs it: inside an
// iframe on a different origin, talking to its host page over postMessage (src/app-live/DESIGN.md §7.2; the mechanics
// of scripts/harness-portal.mjs). The host page EMULATES Kissflow for CIQ_Digital_A00: it answers the real bundled
// SDK's commands (@kissflow/lowcode-client-sdk 1.0.49: CC_INITIALIZE, PROCESS_*, DATAFORM_*, API), serves the
// fixtures of scripts/applive-fixtures.ts (fictional ZZT cases, Solvaro contacts, the 12 config rows), applies writes
// in memory so read-backs see them, routes submits like the live flows, refuses like the live key route, and records
// every command. It proves the bundle's wiring against the SDK's real protocol, NOT how Kissflow's host answers (the
// morning tests R-1…R-12 do that, with Diagnostics). Both pages are served by the browser context's routes, nothing by
// the network: the host page as an https Kissflow page (the dev sandbox's emulated host, or production's on another
// Kissflow domain with env=prod), the UI on its own https origin. Every request to a Kissflow host is answered or
// refused there, so nothing ever reaches Kissflow.
//   node scripts/harness-applive.mjs [scenario ...] [--allow-todo] [--host k=v ...]   (default: all)
//   --host k=v adds a host parameter to every scenario (e.g. --host admin=1: the same journeys for a Case administrator)
//
// The emulated host (URL parameters of the host page):
//  - roles=rmm,saf     kf.user.AppRoles (ids.ts ROLES keys, or caseAdmin, integration, none); user=<key> picks the
//                      Kissflow user (default: the first role's holder)
//  - admin=1           flow Admin on the processes: GET_ADMIN_ITEMS / GET_ADMIN_ITEM and the admin REST GET answer
//                      (admin list rows are sparse and carry no step, CAFM D55); otherwise refused (050302)
//  - byid=1            the viewer REST GET /process/2/{acc}/{flow}/{id} answers (unverified live); otherwise refused
//  - lax=1             Mandatory is NOT enforced on submit (the live key route, DESIGN G-7); default: enforced
//  - hooks=1           SET:current carries the dev sandbox's webhook URLs, as copied verbatim to every environment:
//                      https://<the dev host>/integration/2/<the dev account>/webhook/<token> (TOKEN); the app keeps only
//                      the token and builds the URL on its own page's host and account (prod-hooks); default: none
//                      (G-15: all pending)
//  - hooks=foreign     the same tokens in URLs on another host and account (only the token counts); hooks=notoken:
//                      URLs that are not exactly a hook URL, a different shape per code (NO_TOKEN; every hand-off pending)
//  - parent=plain      the host page on http://127.0.0.1 (not https), parent=foreign on an https host that is no Kissflow
//                      page: the app has no Kissflow host to post to and sends each hand-off by kf.api, relative path
//  - appId=X           the container the handshake reports (container-guard); default CIQ_Digital_A00
//  - refuse=CMD,…      these commands are refused with 050302 (read-refusals, write-refused); "API:GET"/"API:POST" too;
//                      "CMD@flow" (e.g. DATAFORM_GET_ITEMS@rmesSAF) refuses it on that flow only
//  - empty=1           no items except the config rows (empty start)
//  - noConfig=1        no CIQ Config Version rows (production before the seed import; the data console imports them)
//  - roles=developer   the Admin / Developer role (no CIQ persona: the data console, 26 Oct); it reads and writes
//                      every form (the brief has no grants for it: unverified live)
//  - gone=id,…        these items were deleted before the page opened (26 Oct: Thomas deleted a case alone in the
//                      console): gone from every list, and their reads answer as a deleted item's (below)
//  - portal=refuse     the supplier portal's container refuses the app's REST calls (the console's case delete then
//                      lists the portal items to delete in the portal's admin console)
//  - portal=read       (27 Oct) the REST admin GET of one CIQP item answers without admin=1: a CIQ role granted the
//                      read of the portal's requests, for the app's file opener ([unverified live]; default: refused)
//  - legacyDocs=1      (27 Oct) the cases' Documents_JSON as the portal wrote it before 27 Oct (no `file`); each case's
//                      portal request holds the stored files under the entries' attachment ids (Supplier_Files)
//  - FILEPREVIEW_OPEN  (27 Oct, kf.client.openFilePreview: { files, indexOfFile }) is recorded in window.__kfPreviews
//                      and answered at once (live: when the person closes Kissflow's preview)
//  - window.__kf429({ match, n, after, retryAfter })   (26 Oct) the next `n` calls whose "COMMAND METHOD" matches the
//                      regex text `match` (after skipping `after` of them) are answered 429 Too Many Requests, as
//                      Kissflow's rate limit; `retryAfter` (seconds) adds a Retry-After header to the answer
//  - countries=NO,CH  the country list CIQ_Country_Code_A00 (its items by the API route GET /flow/2/{acc}/list/<id>/items:
//                      a JSON array of codes; the 32 live codes plus these); countries=none: that route is refused (the
//                      app keeps its built-in 32). As live (26 Oct), a CIQ Supplier write whose Supplier_Country_Code
//                      the list does not hold is stored EMPTY with a normal answer
//  - colleagues=1      (27 Oct, the @mention colleagues: app-live/colleagues.ts) the per-role REST GET /app_role/2/{acc}/
//                      {roleId}?_application_id=CIQ_Digital_A00 answers {_id, Name, Members} (FX.directory: the persona's
//                      user, a QM colleague no item names, a portal user of Kind ExternalUser; members without Email) and
//                      GET /user/2/{acc}?page_number&page_size the account's users with their e-mails; colleagues=refuse:
//                      both refused (050302); otherwise not emulated (01015, as an unknown route). Each read is noted in
//                      window.__kfDirReads
//  - delayInit=ms, ignoreInits=n, lag=ms, envelope=Data   as harness-portal.mjs
// Behaviour:
//  - My items = items I created, each row EXACTLY as live (REST, 21 Oct, a Draft and a Completed CIQ Case): Name,
//    _activity_id, _activity_instance_id, _current_assigned_to, _current_step, _id, _modified_at, _progress, _status
//    (+ _completed_at once Completed), no _created_by and no business field (kf/fakeClient.ts myItemRow does the same);
//    My tasks = open items whose CURRENT step I hold, filtered by activityId: a Start step
//    by its creator, a Review department step by a member of that department's role (role-assigned), an Open Point
//    department step by the users in Raiser_Assignee (field-assigned); the case's waiting/release steps by nobody here
//  - GET_ITEM / UPDATE_ITEM / SUBMIT_ITEM need the item's CURRENT activity instance and the holder
//  - UPDATE_ITEM refuses fields outside the step's Editable list (050313, DESIGN G-9/G-10/G-11); DateTimes with
//    milliseconds, non-yyyy-mm-dd Dates and "" for typed fields are refused (050312)
//  - SUBMIT_ITEM checks the step's Mandatory list (ids.ts MANDATORY; Review_Gate must be "OK") unless lax=1, then
//    routes: case Start → "Waiting for supplier: CIQ"; review Start → the Review_Dept step → End; open point Start →
//    the OP_Dept step → End. Review_Gate is recomputed on every review write with the live expression (ids.ts
//    FORMULA_FIELDS): "OK" when Open_Count and RMES_Gaps are both set and add up to 0, else ""
//  - Dataforms: CREATE_ITEM makes a draft (not listed); SUBMIT_ITEM lists it under a NEW id; UPDATE_ITEM applies
//    "Table::<model>" deltas (a known row _id updates that row, an unknown one adds a row); read/write grants per role
//    as the brief's grants (unverified live); DELETE_ITEM and the REST DELETE /form/2/{acc}/{form}/{id} remove a row
//  - Admin writes (admin=1; the data console): PROCESS_UPDATE_ADMIN_ITEM and the REST PUT /process/2/{acc}/admin/{flow}/
//    {id} (the JSON text as the body) write any field at any step; the REST DELETE on that path removes the item
//  - A deleted item (26 Oct, as live answered RMM's load after Thomas deleted a case): PROCESS_GET_ADMIN_ITEM fails with
//    "some error occured" (no code), the REST admin GET with 050201 "This item has moved out of your queue.", the REST
//    viewer GET answers a body without the item, GET_ITEM 050201; a deleted form row: 01015 not found [unverified live]
//  - The supplier portal (26 Oct, the console's case delete): its CIQP Request / CIQP Query items (FX.portal) answer the
//    REST admin routes only with _application_id=CIQ_Supplier_Portal_A00 (another container's id: not found) and admin=1:
//    GET …/admin/{flow}/item?page_number&page_size&q (Kissflow's search: an item any of whose values contains q; rows
//    sparse like the admin list), GET and DELETE …/admin/{flow}/{id}
//  - Webhooks (20 Oct transport; URLs 21 Oct): the app POSTs a hand-off to https://<its parent page's host>/integration/
//    2/<its account>/webhook/<token> by the browser's fetch, mode no-cors, Content-Type text/plain, the JSON text as the
//    body. The browser context answers it on the emulated Kissflow page's host like a Kissflow webhook (200, no CORS
//    headers), recording {url, host, account, token, code, body, route: "fetch", method, contentType}; the fetch mode,
//    which the network stage does not show (and a routed answer skips the CORS check), comes from the UI frame's own
//    fetch (an init script notes the mode of each webhook fetch). A scenario can make that fetch throw
//    (t.blockHookFetch(): a CSP, offline); only then, or without a Kissflow parent (parent=), does the app use the API
//    route: a POST to /integration/2/<account>/webhook/<token> = a webhook, recorded in window.__kfHooks with route
//    "sdk" (the body must be a JSON string; an absolute URL there is recorded with `absolute`). t.hooks() returns both,
//    so a hand-off sent twice would show
// window.__kfCalls (every command), __kfDb (items by flow id), __kfSet(id, patch) (plays I-2/I-4), __kfMove(id,
// activityId), __kfHooks (the API route's webhook POSTs), __kfTasks() let a scenario inspect and play Beiersdorf's or the
// supplier's side.
// In the UI frame the harness keeps window.__toastLog (every toast text shown; toasts vanish after 3.5–8 s).
// Texts (FE-CLEANUP, 22 Oct): the prod-* text scenarios play production (env=prod) and check that the main screens, the
// banners and the toasts carry no technical token (TECH: a Kissflow code, a flow, field or item id, "(SDK)", "[unverified]",
// "Diagnostics"), and what the D2 features say live; the dev scenarios still see the raw texts.
// Scenarios (DESIGN §7.2): the raiser scenarios run as Microbiology (mic-raise-accept, mic-return-edit-close), because
// Quality Management's review of the fixture case ZZT-0003 is already completed, so QM can't raise there. Scenarios
// that write on a case's answers use byid=1 (the viewer route, R-1); read-refusals shows the same screens without it.
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { LEAK_TERMS, RETIRED_TERMS, leakHits } from "./leak-scan.mjs";

const require = createRequire(import.meta.url);
const PW = "/Users/thomas/Documents/Kissflow Projects/POC/Promotion Management/app/node_modules/playwright-core";
const { chromium } = require(PW);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-applive");
const FX = JSON.parse(execFileSync(path.join(root, "node_modules/.bin/vite-node"), [path.join(root, "scripts/applive-fixtures.ts")], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const UI = readFileSync(path.join(out, "zip", "index.html"), "utf8");
/** Every hand-off code (src/app-live/shared/handoff.ts HandoffPayloads). */
const HANDOFF_CODES = ["case.started", "op.round", "op.edited", "op.closed", "release.requested", "review.reopened", "change.received", "case.cancelled", "case.reactivated", "history.updated", "scope.extended", "case.contacts"];
/** The emulated Kissflow pages around the UI (routed: nothing leaves the machine): the dev sandbox's, and production's on
 *  another Kissflow domain (env=prod, with another account: Thomas, 21 Oct). */
const DEV_PARENT = "https://dev-harness.kissflow.eu";
const PROD_PARENT = "https://harness.kissflow.com";
/** An https parent that is no Kissflow page (parent=foreign). */
const FOREIGN_PARENT = "https://kf-host.harness.test";
/** Any Kissflow host: the browser context answers or refuses every request to one (as the app's env.ts KISSFLOW_HOST). */
const KF_HOST = /\.kissflow\.(eu|com)$/;
/** The configuration seed the data console imports (data-console; Kissflow-internal, read in place, never copied). */
const SEED_JSON = path.join(root, "../kissflow-build/night-2026-10-21/prod-seed/config-version.json");
const SEED_XLSX = path.join(root, "../kissflow-build/CIQ-prod-seed-config-version-INTERNAL.xlsx");
/** The UI's own origin (routed). */
const UI_ORIGIN = "https://ciq-ui.harness.test";
/** The webhook token of each code in the emulated SET:current (the live ones are [A-Za-z0-9_-] too), and back. */
const TOKEN = Object.fromEntries(HANDOFF_CODES.map((c) => [c, `ZZTtok_${c.replace(".", "_")}`]));
const CODE_OF = { ...Object.fromEntries(Object.entries(TOKEN).map(([c, k]) => [k, c])), ZZTtok_mail: "mail" };
/** A Kissflow webhook path: account, token. */
const HOOK_PATH = /^\/integration\/2\/([^/]+)\/webhook\/([^/?#]+)$/;
/** hooks=notoken: stored URLs that are not exactly /integration/2/<account>/webhook/<token>, so none gives a token (the
 *  app never takes another segment for one: write/handoff.ts hookToken); one shape per code, round robin. */
const NO_TOKEN = [
  () => `${DEV_PARENT}/integration/2/AcDOSunMEpSA/webhook/`,
  () => `${DEV_PARENT}/integration/2/AcDOSunMEpSA/webhook`,
  () => `${DEV_PARENT}/integration/2/AcDOSunMEpSA`,
  () => `${DEV_PARENT}/process/2/AcDOSunMEpSA/admin/CIQ_Case_A00`,
  (c) => `https://hooks.harness.test/${TOKEN[c]}`,
  (c) => `${DEV_PARENT}/integration/2/AcDOSunMEpSA/webhook/${TOKEN[c]}?x=1`,
];
/** The stored URLs of hooks=1 (the dev sandbox's, copied verbatim), hooks=foreign and hooks=notoken, by code. */
const STORED_HOOKS = {
  "1": (c) => `${DEV_PARENT}/integration/2/AcDOSunMEpSA/webhook/${TOKEN[c]}`,
  foreign: (c) => `https://hooks.harness.test/integration/2/AcSTORED/webhook/${TOKEN[c]}`,
  notoken: (c) => NO_TOKEN[HANDOFF_CODES.indexOf(c) % NO_TOKEN.length](c),
};

function hostPage(uiOrigin) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Kissflow (emulated host)</title>
<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head><body>
<iframe id="kf-frame" title="app-custom-ui-CIQ_Digital_A00"></iframe>
<script>
const P = new URLSearchParams(location.search);
const FX = ${JSON.stringify(FX)}, HANDOFF_CODES = ${JSON.stringify(HANDOFF_CODES)}, CODE_OF = ${JSON.stringify(CODE_OF)};
const STORED = ${JSON.stringify(Object.fromEntries(Object.entries(STORED_HOOKS).map(([k, f]) => [k, Object.fromEntries(HANDOFF_CODES.map((c) => [c, f(c)]))])))}[P.get("hooks")];
let ROLE_KEYS = (P.get("roles") ?? "rmm").split(",").filter(Boolean); // let: the dev SWITCH_ROLE replaces them
const ME = FX.users[P.get("user") || ROLE_KEYS[0] || "none"] || FX.users.none;
// ?env=prod plays production (no top bar, no role switch); otherwise the dev sandbox account (env.ts DEV_ACCOUNT)
const ACCOUNT = P.get("env") === "prod" ? "AcPRODHARNESS" : "AcDOSunMEpSA";
const ADMIN = P.get("admin") === "1", BYID = P.get("byid") === "1", LAX = P.get("lax") === "1", HOOKS = !!STORED, EMPTY = P.get("empty") === "1";
const APP_ID = P.get("appId") || "CIQ_Digital_A00";
const REFUSE = new Set((P.get("refuse") || "").split(",").filter(Boolean));
const DELAY = Number(P.get("delayInit") || 0), ENVELOPE = P.get("envelope") || "items";
const COUNTRY_LIST = P.get("countries") === "none" ? null : [...FX.countryList.codes, ...(P.get("countries") || "").split(",").filter(Boolean)];
const COLLEAGUES = P.get("colleagues") || ""; // 27 Oct: "1" answers the directory reads, "refuse" refuses them
let LAG = Number(P.get("lag") || 0); // let: a scenario slows the answers down to see a write in flight (t.lag)
let ignoreInits = Number(P.get("ignoreInits") || 0);
const clone = (x) => JSON.parse(JSON.stringify(x));
const now = () => new Date().toISOString().replace(/\\.\\d{3}Z$/, "Z");
let seq = 0;

// ---- flows, steps
const FLOW_KEY = Object.fromEntries(Object.entries(FX.flows).map(([k, f]) => [f.id, k]));
const KIND = (f) => FX.flows[FLOW_KEY[f]]?.kind;
const STEPS = FX.steps;
const START = { case: STEPS.case.start, review: STEPS.review.start, op: STEPS.op.start };
const DEPTS = ["REG", "SAF", "QM", "MIC", "SUS", "RMM"];
const DEPT_OF_STEP = Object.fromEntries(["review", "op"].flatMap((k) => DEPTS.map((d) => [STEPS[k][d], { flow: k, dept: d }])));
const isEnd = (a) => a === STEPS.case.end || a === STEPS.review.end || a === STEPS.op.end;
const memberOf = (dept) => ROLE_KEYS.includes(dept.toLowerCase());
const userIds = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((u) => (u && typeof u === "object" ? u._id : u)).filter(Boolean);

// ---- data
const db = {};
const NO_CONFIG = P.get("noConfig") === "1";
for (const [f, rows] of Object.entries(FX.byFlow)) if ((!EMPTY || FLOW_KEY[f] === "config") && !(NO_CONFIG && FLOW_KEY[f] === "config")) db[f] = clone(rows);
// 26 Oct: the supplier portal's CIQP items, under their flow ids (reached only by the REST admin routes, in the portal's container)
const PORTAL_FLOWS = Object.values(FX.portal.flows), PORTAL_APP = FX.portal.appId, PORTAL_REFUSE = P.get("portal") === "refuse";
if (!EMPTY) for (const [k, rows] of Object.entries(FX.portal.items)) db[FX.portal.flows[k]] = clone(rows);
const PORTAL_READ = P.get("portal") === "read";
// legacyDocs=1 (27 Oct): entries without "file"; the request keeps the stored files (as Kissflow keeps an Attachment value)
if (P.get("legacyDocs") === "1") for (const c of db[FX.flows.case.id] || []) {
  const entries = JSON.parse(c.Documents_JSON || "[]");
  const rq = (db[FX.portal.flows.request] || []).find((r) => r._id === c.Portal_Request_Item_Id);
  if (rq) rq.Supplier_Files = entries.filter((e) => e.file).map((e) => ({ uploaded: 100, ...e.file, _created_at: e.uploadedAt, _modified_at: e.uploadedAt }));
  c.Documents_JSON = JSON.stringify(entries.map(({ file, ...e }) => e));
}
if (HOOKS) {
  const set = (db[FX.flows.config.id] || []).find((r) => r.Config_Key === "SET:current");
  // https only (m3: the app drops an http hook URL, which could carry a token in clear text)
  if (set) {
    const p = JSON.parse(set.Payload_JSON || "{}");
    p.webhooks = STORED;
    // mail=1: the mail hook as the portal session stores it (a full dev hook URL, top level; write/mail.ts)
    if (P.get("mail") === "1") p.mailHook = "${DEV_PARENT}/integration/2/AcDOSunMEpSA/webhook/ZZTtok_mail";
    set.Payload_JSON = JSON.stringify(p);
  }
}
const tasks = new Map(EMPTY ? [] : FX.tasks.map(([id, act, activity]) => [id, { act, activity }]));
const drafts = {}; // dataform drafts by flow id: created, not yet submitted, not listed
const gone = new Set(); // ids of the items deleted (their reads answer as live does for a deleted item)
window.__kfCalls = [];
window.__kfDb = db;
window.__kfHooks = [];
window.__kfShape = []; // write-shape notes (e.g. a bare string in a User field), never refusals: R-6 is unverified
const items = (f) => (db[f] ??= []);
const find = (f, id) => items(f).find((x) => x._id === id);
const findAny = (id) => Object.values(db).flat().find((x) => x._id === id);
const stepName = (a) => FX.stepNames[a] || a;
const withAct = (x) => ({ ...clone(x), ...(tasks.has(x._id) ? { _activity_instance_id: tasks.get(x._id).act } : {}) });
window.__kfTasks = () => [...tasks.entries()].map(([id, t]) => ({ id, ...t }));
window.__kfSet = (id, patch) => { const x = findAny(id); Object.assign(x, patch, { _modified_at: now() }); gate(x); return clone(x); };
// an item an integration created (E-A's reviews and history row): pushed as it is, a process item moved to its step
window.__kfAdd = (f, x, activity) => { items(f).push(x); if (activity) window.__kfMove(x._id, activity); return clone(x); };
window.__kfMove = (id, activity) => {
  const x = findAny(id);
  if (isEnd(activity)) { tasks.delete(id); Object.assign(x, { _status: "Completed", _current_step: "End", _modified_at: now() }); return; }
  tasks.set(id, { act: "ActMv" + ++seq, activity });
  Object.assign(x, { _status: "InProgress", _current_step: stepName(activity), _modified_at: now() });
};
/** Deletes an item outside the UI (as Thomas did on 26 Oct: the case item alone): gone from every list and read. */
window.__kfRemove = (id) => { const f = Object.keys(db).find((k) => find(k, id)); if (f) remove(f, id); return !!f; };
window.__kfGone = () => [...gone];
// 26 Oct: Kissflow's rate limit, played (see the header): rules consumed in order
const LIMITS = [];
window.__kf429 = (rule) => { LIMITS.push({ n: 1, after: 0, ...rule, re: new RegExp(rule.match) }); };
function limited(r) {
  const what = r.command + " " + ((r.args && r.args.method) || "");
  for (const l of LIMITS) {
    if (l.n <= 0 || !l.re.test(what)) continue;
    if (l.after > 0) { l.after--; return null; }
    l.n--;
    return { isError: true, errorMessage: { status: 429, en_message: "Too Many Requests", ...(l.retryAfter ? { headers: { "Retry-After": String(l.retryAfter) } } : {}) } };
  }
  return null;
}
for (const id of (P.get("gone") || "").split(",").filter(Boolean)) window.__kfRemove(id);

/** Who holds the current step (see the header). */
function holdsTask(x) {
  const t = tasks.get(x._id);
  if (!t) return false;
  if (Object.values(START).includes(t.activity)) return (x._created_by && x._created_by._id) === ME._id;
  const d = DEPT_OF_STEP[t.activity];
  if (!d) return false; // the case's waiting/release steps: the portal and the integrations
  return d.flow === "review" ? memberOf(d.dept) : userIds(x.Raiser_Assignee).includes(ME._id);
}
/** Who a step is assigned to, as _current_assigned_to shows it (kf/fakeClient.ts assignedTo). */
function assignedTo(key, x, activity) {
  if (activity === START[key]) return x._created_by ? [{ Kind: "User", ...clone(x._created_by) }] : [];
  const d = DEPT_OF_STEP[activity], role = d && FX.roles[d.dept.toLowerCase()];
  if (d && key === "review" && role) return [{ Kind: "AppRole", _id: role._id, Name: role.Name }];
  if (d && key === "op") return userIds(x.Raiser_Assignee).map((id) => ({ Kind: "User", _id: id }));
  return [];
}
const FLOW_NAME = { case: "CIQ Case", review: "CIQ Review", op: "CIQ Open Point" };
/** A My items row with exactly the live keys (see the header); Name is Kissflow's default item name, _progress only
 *  has the live shape (a percentage), _activity_instance_id is "" once the item has no current step. */
function myItemRow(f, x) {
  const key = FLOW_KEY[f], t = tasks.get(x._id), done = x._status === "Completed";
  return {
    Name: FLOW_NAME[key] + " from " + ((x._created_by && x._created_by.Name) || ""),
    _activity_id: t ? t.activity : "",
    _activity_instance_id: t ? t.act : "",
    _current_assigned_to: t && !done ? assignedTo(key, x, t.activity) : [],
    _current_step: x._current_step,
    _id: x._id,
    _modified_at: x._modified_at,
    _progress: done ? 100 : t && t.activity === START[key] ? 0 : 50,
    _status: x._status,
    ...(done ? { _completed_at: x._modified_at } : {}),
  };
}
/** Review_Gate, the live expression (ids.ts FORMULA_FIELDS; kf/fakeClient.ts computes the same):
 *  IF(OR(ISBLANK(Open_Count),ISBLANK(RMES_Gaps)),"",IF(Open_Count+RMES_Gaps=0,"OK","")). */
function gate(x) {
  if (!x || !("Review_Dept" in x)) return;
  const n = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));
  const a = n(x.Open_Count), b = n(x.RMES_Gaps);
  x.Review_Gate = a === undefined || b === undefined ? "" : a + b === 0 ? "OK" : "";
}

// ---- grants (the brief's grants, unverified live): who may list/read and create/update each form
const CIQ = ["rmm", "reg", "saf", "qm", "mic", "sus", "cus", "leg", "admin", "auditor", "owner"];
const FORM_READ = { audit: [...CIQ, "caseAdmin"], config: [...CIQ, "caseAdmin"], note: CIQ, rmesSAF: ["saf", "auditor"], rmesREG: ["reg", "auditor"], supplier: ["rmm", "admin"], scopeRun: ["rmm", "auditor", "owner"] };
const FORM_WRITE = { audit: CIQ, note: ["rmm", "reg", "saf", "qm", "mic", "sus", "cus", "leg"], rmesSAF: ["saf"], rmesREG: ["reg"], supplier: ["admin"], scopeRun: ["rmm"], config: ["admin"] };
// the data console's role: every form (unverified live)
for (const t of [FORM_READ, FORM_WRITE]) for (const k of Object.keys(FX.flows)) if (FX.flows[k].kind === "form") (t[k] ??= []).push("developer");
const may = (table, f) => (table[FLOW_KEY[f]] || []).some((k) => ROLE_KEYS.includes(k));

// ---- answers
const LIST_KEEP = /^(_id|_status|_created_at|_modified_at|_created_by|_modified_by|Case_Code|Cycle_No|Case_Item_Id|Review_Dept|OP_Dept|Round_No|[A-Za-z]+_Key)$/;
const sparse = (x) => Object.fromEntries(Object.entries(x).filter(([k]) => LIST_KEEP.test(k)));
const page = (rows, r) => {
  const n = r.pageNumber || 1, s = r.pageSize || 50, slice = rows.slice((n - 1) * s, n * s);
  return ENVELOPE === "Data" ? { Data: slice } : { items: slice, total: rows.length };
};
class KfError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const notFound = () => new KfError("KISSFLOW_ERROR_01015", "Item not found");
const noAccess = () => new KfError("KISSFLOW_ERROR_050302", "You don't have permission to access this item.");
const movedOut = () => new KfError("KISSFLOW_ERROR_050201", "This item has moved out of your queue.");
/** The SDK's admin read of a deleted item, as live (26 Oct): no Kissflow code. */
const sdkGone = () => new KfError("", "some error occured");

const TYPED = /(_At|_Date)$|^(Cycle_No|Round_No|Open_Count|RMES_Gaps|Open_Criteria_Count|Open_Blocking_Findings_Count)$/;
const USER_FIELDS = /^(Owner_RMM|Raised_By_User|Responsible_User|Closed_By|Completed_By|Assignee_User|Raiser_Assignee|Note_Author|Criteria_Recorded_By)$/;
function checkValues(data, where) {
  for (const [k, v] of Object.entries(data || {})) {
    if (/^Table::/.test(k) && Array.isArray(v)) { for (const row of v) checkValues(row, where + " " + k); continue; }
    if (v === "" && TYPED.test(k)) throw new KfError("KISSFLOW_ERROR_050312", "Validation failed for the following fields: {'" + k + "': ['Invalid value']}");
    if (/_At$/.test(k) && typeof v === "string" && /\\.\\d{3}Z$/.test(v)) throw new KfError("KISSFLOW_ERROR_050312", "Validation failed for the following fields: {'" + k + "': ['Invalid datetime']}");
    if (/_Date$/.test(k) && typeof v === "string" && !/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) throw new KfError("KISSFLOW_ERROR_050312", "Validation failed for the following fields: {'" + k + "': ['Invalid date']}");
    if (USER_FIELDS.test(k) && typeof v === "string") window.__kfShape.push(where + ": " + k + " written as a bare string");
  }
}
const blank = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

function myTask(f, r) {
  const x = find(f, r.instanceId);
  if (!x) throw gone.has(r.instanceId) ? movedOut() : notFound();
  const t = tasks.get(x._id);
  if (!t || t.act !== r.activityInstanceId) throw movedOut();
  if (!holdsTask(x)) throw noAccess();
  return x;
}

/** Kissflow's Select on CIQ_Country_Code_A00 (live fact, 26 Oct): a Supplier_Country_Code outside the list is stored
 *  EMPTY, and the write answers as if all went well. */
function selectFacts(f, data) {
  if (FLOW_KEY[f] !== "supplier" || !data || !data.Supplier_Country_Code) return data;
  const known = COUNTRY_LIST ?? FX.countryList.codes;
  return known.includes(data.Supplier_Country_Code) ? data : { ...data, Supplier_Country_Code: "" };
}

/** "Table::<model>" deltas: a known row _id updates that row; an unknown one adds a row (as live, reader C §1b). */
function applyData(x, data) {
  for (const [k, v] of Object.entries(data || {})) {
    const m = k.match(/^Table::(.+)$/);
    if (!m || !Array.isArray(v)) { x[k] = v; continue; }
    const key = Array.isArray(x[m[1]]) ? m[1] : "Table::" + m[1];
    const rows = (x[key] ??= []);
    for (const d of v) {
      const { _is_created, ...row } = d;
      const cur = row._id && rows.find((y) => y._id === row._id);
      if (cur) Object.assign(cur, row);
      else rows.push({ ...row, _id: row._id || m[1] + "_row" + ++seq });
    }
  }
}

function api(url, args) {
  const method = (args.method || "GET").toUpperCase();
  if (REFUSE.has("API:" + method)) throw noAccess();
  if ((method === "PUT" || method === "POST") && typeof args.body !== "string") throw new KfError("KISSFLOW_ERROR_00500", "Request body was not received (send a JSON string)");
  const hook = url.match(/^\\/integration\\/2\\/([^/]+)\\/webhook\\/([^/?#]+)$/);
  if (hook && method === "POST") { window.__kfHooks.push({ url, account: hook[1], token: hook[2], code: CODE_OF[hook[2]] ?? hook[2], body: JSON.parse(args.body), route: "sdk" }); return {}; }
  if (/^https?:\\/\\//.test(url) && method === "POST") { const k = url.split("/").pop(); window.__kfHooks.push({ url, absolute: true, code: CODE_OF[k] ?? k, body: JSON.parse(args.body), route: "sdk" }); return {}; }
  // the supplier portal's processes: only in the portal's container (26 Oct, the console's case delete)
  const appParam = (url.match(/[?&]_application_id=([^&#]+)/) || [])[1];
  const flowIn = (url.match(/\\/process\\/2\\/[^/]+\\/(?:admin\\/)?([^/?]+)/) || [])[1];
  // portal=read: one item's admin GET answers without flow Admin (27 Oct, the file opener)
  const portalRead = PORTAL_READ && !!flowIn && PORTAL_FLOWS.includes(flowIn) && method === "GET" && !/\\/item\\?/.test(url);
  if (flowIn && PORTAL_FLOWS.includes(flowIn)) {
    if (appParam !== PORTAL_APP) throw notFound();
    if (PORTAL_REFUSE || (!ADMIN && !portalRead)) throw noAccess();
  }
  // the admin list by REST, with Kissflow's search (q: an item any of whose values contains it)
  let m = url.match(/\\/process\\/2\\/[^/]+\\/admin\\/([^/]+)\\/item\\?(.*)$/);
  if (m && method === "GET") {
    if (!ADMIN) throw noAccess();
    const qs = new URLSearchParams(m[2]), text = (qs.get("q") || "").toLowerCase();
    const hit = (x) => !text || Object.values(x).some((v) => (typeof v === "string" || typeof v === "number") && String(v).toLowerCase().includes(text));
    return page(items(m[1]).filter(hit).map(sparse), { pageNumber: Number(qs.get("page_number") || 1), pageSize: Number(qs.get("page_size") || 50) });
  }
  m = url.match(/\\/process\\/2\\/[^/]+\\/admin\\/([^/]+)\\/([^/?]+)/);
  if (m && method === "GET") { if (!ADMIN && !portalRead) throw noAccess(); const id = decodeURIComponent(m[2]), x = find(m[1], id); if (!x) throw gone.has(id) ? movedOut() : notFound(); return clone(x); }
  if (m && method === "PUT") return adminUpdate(m[1], decodeURIComponent(m[2]), JSON.parse(args.body));
  if (m && method === "DELETE") { if (!ADMIN) throw noAccess(); return remove(m[1], decodeURIComponent(m[2])); }
  m = url.match(/\\/form\\/2\\/[^/]+\\/([^/]+)\\/([^/?]+)/);
  if (m && method === "DELETE") { if (!may(FORM_WRITE, m[1])) throw noAccess(); return remove(m[1], decodeURIComponent(m[2])); }
  m = url.match(/\\/process\\/2\\/[^/]+\\/([^/]+)\\/([^/?]+)/);
  if (m && method === "GET") { if (!BYID) throw noAccess(); const x = find(m[1], m[2]); if (!x && gone.has(m[2])) return {}; if (!x) throw notFound(); return clone(x); }
  // 27 Oct, the @mention colleagues: a CIQ role's members, the account's users (colleagues=1; refuse: 050302)
  m = url.match(/^\\/app_role\\/2\\/[^/]+\\/([^/?]+)/);
  if (m && method === "GET") {
    (window.__kfDirReads ??= []).push(url);
    if (COLLEAGUES === "refuse") throw noAccess();
    if (COLLEAGUES !== "1" || appParam !== "CIQ_Digital_A00") throw notFound();
    const key = Object.keys(FX.roles).find((k) => FX.roles[k]._id === decodeURIComponent(m[1]));
    if (!key) throw notFound();
    const members = clone(FX.directory.members[key] || []);
    return { _id: FX.roles[key]._id, Name: FX.roles[key].Name, _application_id: appParam, Members: members, UserCount: members.length };
  }
  if (/^\\/user\\/2\\/[^/?]+\\?/.test(url) && method === "GET") {
    (window.__kfDirReads ??= []).push(url);
    if (COLLEAGUES === "refuse") throw noAccess();
    if (COLLEAGUES !== "1") throw notFound();
    return clone(FX.directory.users);
  }
  // a list's items (26 Oct: the supplier form's countries): a JSON array of the list's values
  m = url.match(/^\\/flow\\/2\\/[^/]+\\/list\\/([^/?]+)\\/items/);
  if (m && method === "GET" && decodeURIComponent(m[1]) === FX.countryList.id) { if (!COUNTRY_LIST) throw noAccess(); (window.__kfListReads ??= []).push(url); return [...COUNTRY_LIST]; }
  throw notFound();
}

/** The admin route's write: any field at any step (ReadOnly ones too, P-RO); the step does not move. */
function adminUpdate(f, id, data) {
  if (!ADMIN) throw noAccess();
  const x = find(f, id);
  if (!x) throw notFound();
  checkValues(data, f);
  applyData(x, data);
  Object.assign(x, { _modified_at: now(), _modified_by: { _id: ME._id, Name: ME.Name } });
  gate(x);
  return clone(x);
}
/** An admin delete of a process item (any step) or a form row: gone from the lists and every read. */
function remove(f, id) {
  const x = find(f, id);
  if (!x) throw gone.has(id) && KIND(f) !== "form" ? movedOut() : notFound();
  items(f).splice(items(f).indexOf(x), 1);
  tasks.delete(id);
  gone.add(id);
  return {};
}

function handle(r) {
  const f = r.flowId;
  if (REFUSE.has(r.command) || (f && REFUSE.has(r.command + "@" + FLOW_KEY[f]))) throw noAccess();
  switch (r.command) {
    case "CC_INITIALIZE":
      return { user: { ...ME, AppRoles: ROLE_KEYS.map((k) => FX.roles[k]).filter(Boolean) }, account: { _id: ACCOUNT }, appId: APP_ID, componentId: "CCEK4Jhdt04g", envDetails: { isMobile: false } };
    case "PROCESS_GET_MY_ITEMS": return page(items(f).filter((x) => x._created_by && x._created_by._id === ME._id).map((x) => myItemRow(f, x)), r);
    case "PROCESS_GET_PARTICIPATED_ITEMS": throw new KfError("KISSFLOW_ERROR_00500", "Participated list is not available"); // fails platform-wide
    case "PROCESS_GET_MY_TASKS_ITEMS": return page(items(f).filter((x) => tasks.has(x._id) && holdsTask(x) && (!r.activityId || tasks.get(x._id).activity === r.activityId)).map(withAct), r);
    case "PROCESS_GET_ADMIN_ITEMS": if (!ADMIN) throw noAccess(); return page(items(f).map(sparse), r); // D55: sparse, no step
    case "PROCESS_GET_ADMIN_ITEM": { if (!ADMIN) throw noAccess(); const x = find(f, r.instanceId); if (!x) throw gone.has(r.instanceId) ? sdkGone() : notFound(); return clone(x); }
    case "PROCESS_GET_ITEM": return withAct(myTask(f, r));
    case "PROCESS_UPDATE_ADMIN_ITEM": return adminUpdate(f, r.instanceId, r.data);
    case "PROCESS_CREATE_ITEM": {
      const key = FLOW_KEY[f];
      if (!START[key]) throw new KfError("KISSFLOW_ERROR_00400", "Not a process: " + f);
      if (key === "review" && !memberOf("RMM")) throw noAccess(); // only RMM has Init on CIQ Review (DESIGN §1.2)
      checkValues(r.data, f);
      const at = now(), x = { _id: "Pk" + key + ++seq, _status: "Draft", _current_step: stepName(START[key]), _created_at: at, _modified_at: at, _created_by: { _id: ME._id, Name: ME.Name } };
      applyData(x, r.data);
      gate(x);
      items(f).push(x);
      tasks.set(x._id, { act: "ActStart" + ++seq, activity: START[key] });
      return withAct(x);
    }
    case "PROCESS_UPDATE_ITEM": {
      const x = myTask(f, r), a = tasks.get(x._id).activity, editable = FX.editable[a];
      checkValues(r.data, f);
      if (editable) {
        const ro = Object.keys(r.data || {}).filter((k) => !k.startsWith("_") && !editable.includes(k));
        if (ro.length) throw new KfError("KISSFLOW_ERROR_050313", "PermissionDeniedToUpdate: " + ro.join(", ") + " can't be changed at this step");
      }
      applyData(x, r.data);
      Object.assign(x, { _modified_at: now(), _modified_by: { _id: ME._id, Name: ME.Name } });
      gate(x);
      return withAct(x);
    }
    case "PROCESS_SUBMIT_ITEM": {
      const x = myTask(f, r), a = tasks.get(x._id).activity, key = FLOW_KEY[f];
      if (!LAX) {
        const missing = (FX.mandatory[a] || []).filter((k) => blank(x[k]) || (k === "Review_Gate" && x[k] !== "OK"));
        if (missing.length) throw new KfError("KISSFLOW_ERROR_050312", "Validation failed for the following fields: {" + missing.map((k) => "'" + k + "': ['This field is mandatory']").join(", ") + "}");
      }
      let next;
      if (a === START[key]) next = key === "case" ? STEPS.case.waiting : STEPS[key][key === "review" ? x.Review_Dept : x.OP_Dept];
      else if (DEPT_OF_STEP[a]) next = STEPS[key].end;
      if (!next) throw new KfError("KISSFLOW_ERROR_00400", "No route from " + stepName(a));
      window.__kfMove(x._id, next);
      x._modified_by = { _id: ME._id, Name: ME.Name };
      return clone(x);
    }
    case "PROCESS_DISCARD_ITEM": {
      const x = find(f, r.instanceId);
      if (!x) throw notFound();
      if (x._status !== "Draft" || (x._created_by && x._created_by._id) !== ME._id) throw noAccess();
      items(f).splice(items(f).indexOf(x), 1);
      tasks.delete(x._id);
      return {};
    }
    // as live (proven 20 Oct): list rows carry no child tables; DATAFORM_GET_ITEM returns them
    case "DATAFORM_GET_ITEMS": if (!may(FORM_READ, f)) throw noAccess(); return page(items(f).map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith("Table::")))), r);
    case "DATAFORM_GET_ITEM": {
      if (!may(FORM_READ, f) && !may(FORM_WRITE, f)) throw noAccess();
      const x = find(f, r.itemId) || (drafts[f] || []).find((d) => d._id === r.itemId);
      if (!x) throw notFound();
      return clone(x);
    }
    case "DATAFORM_CREATE_ITEM": {
      if (!may(FORM_WRITE, f)) throw noAccess();
      checkValues(r.data, f);
      const at = now(), x = { _id: "PkDraft" + ++seq, _status: "Draft", _created_at: at, _modified_at: at, _created_by: { _id: ME._id, Name: ME.Name } };
      applyData(x, selectFacts(f, r.data));
      (drafts[f] ??= []).push(x);
      return clone(x);
    }
    case "DATAFORM_SUBMIT_ITEM": {
      const list = drafts[f] || [], i = list.findIndex((d) => d._id === r.itemId);
      if (i < 0) throw notFound();
      const [x] = list.splice(i, 1);
      checkValues(r.data, f);
      applyData(x, selectFacts(f, r.data));
      Object.assign(x, { _id: "Pk" + FLOW_KEY[f] + ++seq, _status: "Completed", _modified_at: now() }); // submit lists it under a NEW id
      items(f).push(x);
      return clone(x);
    }
    case "DATAFORM_UPDATE_ITEM": {
      if (!may(FORM_WRITE, f)) throw noAccess();
      const x = find(f, r.itemId) || (drafts[f] || []).find((d) => d._id === r.itemId);
      if (!x) throw notFound();
      checkValues(r.data, f);
      applyData(x, selectFacts(f, r.data));
      Object.assign(x, { _modified_at: now(), _modified_by: { _id: ME._id, Name: ME.Name } });
      return clone(x);
    }
    case "DATAFORM_DELETE_ITEM": if (!may(FORM_WRITE, f)) throw noAccess(); return remove(f, r.itemId);
    case "DATAFORM_DISCARD_ITEM": drafts[f] = (drafts[f] || []).filter((d) => d._created_by._id !== ME._id); return {};
    // dev only (index.d.ts l.1294-1330): every app role; currentRoles as ids (the portal facade's type)
    case "GET_ROLES":
      if (ACCOUNT !== "AcDOSunMEpSA") throw new KfError("KISSFLOW_ERROR_00010", "Only available in a Development account");
      return { roles: Object.entries(FX.roles).filter(([k]) => k !== "none").map(([, r]) => ({ _id: r._id, Name: r.Name })), currentRoles: ROLE_KEYS.map((k) => FX.roles[k]).filter(Boolean).map((r) => ({ _id: r._id })) };
    // a REAL switch: the user leaves every current role and joins this one
    case "SWITCH_ROLE": {
      if (ACCOUNT !== "AcDOSunMEpSA") throw new KfError("KISSFLOW_ERROR_00010", "Only available in a Development account");
      const key = Object.keys(FX.roles).find((k) => FX.roles[k]._id === r.roleId || (r.roleName && FX.roles[k].Name === r.roleName));
      if (!key) throw new KfError("KISSFLOW_ERROR_03069", "This Role ID doesn't exist.");
      (window.__kfSwitches ??= []).push({ from: ROLE_KEYS.slice(), to: key });
      ROLE_KEYS = [key];
      return { _id: FX.roles[key]._id, Name: FX.roles[key].Name };
    }
    case "REDIRECT": (window.__kfRedirects ??= []).push(r.url); return {};
    // 27 Oct: Kissflow's file preview (kfsdk openFilePreview → { files, indexOfFile }); answered at once
    case "FILEPREVIEW_OPEN": (window.__kfPreviews ??= []).push({ files: r.files, indexOfFile: r.indexOfFile }); return {};
    case "API": return api(r.url, r.args || {});
    default: throw new KfError("NOT_EMULATED", "Not emulated: " + r.command);
  }
}
const frame = document.getElementById("kf-frame");
window.addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow) return;
  const r = e.data;
  if (!r || !r._id || !r.command) return;
  const body = r.data ?? (r.args && r.args.body) ?? null;
  const rec = { seq: window.__kfCalls.length, at: Date.now(), command: r.command, flowId: r.flowId, instanceId: r.instanceId, itemId: r.itemId, activityInstanceId: r.activityInstanceId, activityId: r.activityId, pageNumber: r.pageNumber, url: r.url, method: r.args && r.args.method, data: (typeof body === "string" ? body : JSON.stringify(body)).slice(0, 4000), keys: Object.keys(r.data ?? {}).sort().join(",") };
  window.__kfCalls.push(rec);
  if (r.command === "CC_INITIALIZE" && ignoreInits > 0) { ignoreInits--; return; }
  const reply = (resp) => frame.contentWindow.postMessage({ _req: r, resp }, "*");
  setTimeout(() => {
    let resp;
    const tooMany = limited(r);
    if (tooMany) { rec.refused = "429 Too Many Requests"; reply(tooMany); return; }
    try { resp = handle(r); } catch (err) { const code = err.code === "" ? "" : err.code || "KISSFLOW_ERROR"; resp = { isError: true, errorMessage: { ...(code ? { error_code: code } : {}), en_message: String(err.message || err) } }; rec.refused = (code + " " + resp.errorMessage.en_message).trim(); }
    reply(resp);
  }, r.command === "CC_INITIALIZE" ? DELAY : LAG);
});
frame.src = ${JSON.stringify(uiOrigin + "/")} + location.hash;
</script></body></html>`;
}

// ---- pages: the UI and the Kissflow pages are answered by the browser context (scenario); parent=plain's host page by a
// local http server
/** The webhook POSTs that reached a host by the browser's fetch, in this scenario. */
const fetchHooks = [];
const listen = (handler) => new Promise((resolve) => { const s = createServer(handler).listen(0, "127.0.0.1", () => resolve(s)); });
const hostServer = await listen((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(hostPage(UI_ORIGIN));
});
const HOST_ORIGIN = `http://127.0.0.1:${hostServer.address().port}`;
/** The page around the UI for these host parameters (parent=, env=). */
const parentOf = (p) => (p.parent === "plain" ? HOST_ORIGIN : p.parent === "foreign" ? FOREIGN_PARENT : p.env === "prod" ? PROD_PARENT : DEV_PARENT);

const ARGV = process.argv.slice(2);
/** --host k=v (repeatable): extra host parameters for every scenario. */
const EXTRA_HOST = Object.fromEntries(ARGV.flatMap((a, i) => (a === "--host" && ARGV[i + 1]?.includes("=") ? [ARGV[i + 1].split("=")] : [])));
const browser = await chromium.launch();
const results = [];
let loads = 0;

/** `opts.ignoreConsole`: console errors the scenario provokes on purpose (a refused fetch logs one). */
async function scenario(name, steps, ctxOpts = {}, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...ctxOpts });
  fetchHooks.length = 0;
  let blockHooks = false;
  await context.route(`${UI_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: UI }));
  // a Kissflow host (and the foreign parent): the host page at "/"; a webhook POST as Kissflow answers it: 200, NO CORS
  // headers (the app's no-cors fetch reads nothing back), recorded with how it came. Blocked (t.blockHookFetch), the
  // browser's fetch throws instead. Anything else is refused: nothing reaches Kissflow
  await context.route((u) => KF_HOST.test(u.hostname) || u.origin === FOREIGN_PARENT, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const hook = HOOK_PATH.exec(u.pathname);
    if (req.method() === "POST" && hook) {
      if (blockHooks) return route.abort("blockedbyclient");
      const headers = await req.allHeaders();
      const text = req.postData() ?? "";
      fetchHooks.push({ url: req.url(), host: u.host, account: hook[1], token: hook[2], code: CODE_OF[hook[2]] ?? hook[2], body: (() => { try { return JSON.parse(text); } catch { return text; } })(), route: "fetch", method: req.method(), contentType: headers["content-type"] });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    if (req.method() === "GET" && u.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: hostPage(UI_ORIGIN) });
    return route.abort();
  });
  // the UI frame's own view of each webhook fetch: the mode it asked for (the network stage does not show it)
  await context.addInitScript(() => {
    if (window.top === window) return;
    const f = window.fetch.bind(window);
    window.fetch = (u, init) => {
      if (/\/integration\/2\/[^/]+\/webhook\//.test(String(u))) (window.__hookInits ??= []).push({ url: String(u), mode: init?.mode ?? "cors" });
      return f(u, init);
    };
  });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !opts.ignoreConsole?.test(m.text())) errors.push("console: " + m.text()); });
  let ui = page; // the UI's frame (or the page itself when opened directly)
  const t = {
    page,
    get ui() { return ui; },
    async host(params, route = "") {
      // a fresh query each time: a URL that differs only in its #route would not reload the host or the frame
      const p = { ...params, ...EXTRA_HOST };
      await page.goto(`${parentOf(p)}/?${new URLSearchParams({ ...p, n: String(++loads) })}#${route}`);
      await page.waitForFunction(() => document.getElementById("kf-frame")?.contentWindow, null, { timeout: 5000 });
      ui = page.frameLocator("#kf-frame");
    },
    async direct(route = "") {
      await page.goto(`${UI_ORIGIN}/#${route}`);
      ui = page;
    },
    frame() { return page.frames().find((f) => f.url().startsWith(UI_ORIGIN)) ?? page.mainFrame(); },
    async hash() { return t.frame().evaluate(() => location.hash); },
    tid(id) { return ui.getByTestId(id); },
    async waitText(text, timeout = 8000) { await ui.getByText(text, { exact: false }).first().waitFor({ timeout }).catch(() => {}); },
    async see(text, label = `sees "${text}"`, timeout = 8000) {
      await t.waitText(text, timeout);
      checks.push({ label, pass: await ui.getByText(text, { exact: false }).first().isVisible().catch(() => false) });
    },
    async notSee(text, label = `does not see "${text}"`) {
      checks.push({ label, pass: (await ui.getByText(text, { exact: false }).count()) === 0 });
    },
    async seeTid(id, label = `shows ${id}`, timeout = 8000) {
      await ui.getByTestId(id).first().waitFor({ timeout }).catch(() => {});
      checks.push({ label, pass: await ui.getByTestId(id).first().isVisible().catch(() => false) });
    },
    async calls(pred = () => true) { return (await page.evaluate(() => window.__kfCalls ?? [])).filter(pred); },
    async item(id) { return page.evaluate((x) => Object.values(window.__kfDb).flat().find((i) => i._id === x), id); },
    async rows(flowId) { return page.evaluate((f) => window.__kfDb[f] ?? [], flowId); },
    async set(id, patch) { return page.evaluate(([x, p]) => window.__kfSet(x, p), [id, patch]); },
    /** Moves an item to another step (activity id): Beiersdorf's or the supplier's side. */
    async move(id, activityId) { await page.evaluate(([x, a]) => window.__kfMove(x, a), [id, activityId]); },
    /** The webhook POSTs since the last call: by the API route (window.__kfHooks, route "sdk") and by fetch ("fetch"). */
    async hooks() {
      const api = await page.evaluate(() => (window.__kfHooks ?? []).splice(0));
      const inits = await t.frame().evaluate(() => (window.__hookInits ?? []).splice(0)).catch(() => []);
      // each fetch that reached the host gets the mode its call asked for (the calls go out one after another, in order)
      const fetched = fetchHooks.splice(0).map((h) => {
        const i = inits.findIndex((x) => x.url === h.url);
        return { ...h, mode: i < 0 ? null : inits.splice(i, 1)[0].mode };
      });
      return [...api, ...fetched];
    },
    /** From now on the browser refuses the webhook fetch (it throws, as under a CSP or offline). */
    blockHookFetch() { blockHooks = true; },
    /** Waits until no write and no read is in flight: the header says "Updated …", neither "Saving…" (a write) nor
     *  "Loading…" (the reload after it, m8). No header (the loader, a page outside the shell): nothing to wait for. */
    async settle(ms = 400) {
      await page.waitForTimeout(ms);
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        const status = await ui.getByTestId("load-status").first().textContent({ timeout: 500 }).catch(() => null);
        if (status === null || !/Saving…|Loading…/.test(status)) break;
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(200);
    },
    check(label, pass, detail) { checks.push({ label, pass: !!pass, ...(detail !== undefined ? { detail } : {}) }); return !!pass; },
    /** A check the rest of the scenario depends on: a failure stops it (reported as not run to the end). */
    must(label, pass, detail) { if (!t.check(label, pass, detail)) throw new Error(`stopped: ${label}`); },
    async shot(tag) { await page.screenshot({ path: path.join(out, `harness-${name}-${tag}.png`), fullPage: false }); },
    /** Every toast the UI showed since the first call (a MutationObserver in the UI frame; toasts vanish after 3.5–8 s). */
    async toastLog() {
      return t.frame().evaluate(() => {
        if (!window.__toastLog) {
          window.__toastLog = [];
          const seen = new WeakSet();
          const scan = () => { for (const e of document.querySelectorAll('div.fixed[aria-live="polite"] span.flex-1')) if (!seen.has(e)) { seen.add(e); window.__toastLog.push(e.textContent || ""); } };
          scan();
          new MutationObserver(scan).observe(document.body, { subtree: true, childList: true });
        }
        return [...window.__toastLog];
      });
    },
    /** The first toast since `from` (an index into toastLog) whose text matches; null after `timeout`. */
    async waitToast(re, from = 0, timeout = 12000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const hit = (await t.toastLog()).slice(from).find((x) => re.test(x));
        if (hit) return hit;
        await page.waitForTimeout(100);
      }
      return null;
    },
    /** A text box by test id: the element itself, or the textarea / input inside it. */
    async box(id) {
      const el = ui.getByTestId(id).first();
      const tag = await el.evaluate((e) => e.tagName, null, { timeout: 5000 });
      return tag === "TEXTAREA" || tag === "INPUT" ? el : el.locator("textarea, input").first();
    },
    /** Types into a text box by test id. */
    async fillText(id, value) { await (await t.box(id)).fill(value); },
    /** What a text box by test id holds now. */
    async value(id) { return (await t.box(id)).inputValue(); },
    /** A button by test id: whether it is disabled, and its label. */
    async button(id) { return ui.getByTestId(id).first().evaluate((b) => ({ disabled: b.disabled, text: (b.textContent || "").trim() }), null, { timeout: 5000 }); },
    /** From now on Kissflow refuses this command with 050302, as the host's refuse= does (on = false: answers it again);
     *  "CMD@flow" on that flow only. */
    async refuse(command, on = true) { await page.evaluate(([c, o]) => void (o ? REFUSE.add(c) : REFUSE.delete(c)), [command, on]); },
    /** Kissflow's rate limit, played: the next matching calls answer 429 (the host's window.__kf429). */
    async limit429(rule) { await page.evaluate((x) => window.__kf429(x), rule); },
    /** From now on every SDK call is answered after `ms` (the host's lag=), so a write in flight can be seen. */
    async lag(ms) { await page.evaluate((x) => { LAG = x; }, ms); },
    /** Clicks a test id and waits until the write it starts (and the reload after it) has settled. */
    async act(id, opts) { await ui.getByTestId(id).first().click(opts); await t.settle(); },
    /** Navigates the UI frame to a route (HashRouter) without reloading it. */
    async go(route) { await t.frame().evaluate((r) => { location.hash = r; }, route); await page.waitForTimeout(300); },
    /** Clicks Reload in the header and waits for the read (and any load-time side effect) to settle. */
    async reload() { await t.tid("reload").click(); await t.settle(600); },
  };
  try {
    await steps(t);
  } catch (e) {
    checks.push({ label: "scenario ran to the end", pass: false, detail: String(e.message || e).slice(0, 400) });
    await t.shot("failure").catch(() => {});
  }
  checks.push({ label: "no page errors", pass: errors.length === 0, ...(errors.length ? { detail: errors.slice(0, 5) } : {}) });
  await context.close();
  const pass = checks.every((c) => c.pass);
  results.push({ name, pass, checks });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} (${checks.length} checks)`);
  for (const c of checks) if (!c.pass) console.log(`   ✗ ${c.label}${c.detail !== undefined ? " — " + JSON.stringify(c.detail) : ""}`);
}

/** A scenario of DESIGN §7.2 not written yet: listed, never counted as passed. */
async function todo(name, proves) {
  results.push({ name, pass: false, todo: true, checks: [{ label: `TODO: ${proves}`, pass: false }] });
  console.log(`TODO ${name}: ${proves}`);
}

// ---- helpers
const ITEM_READ = /^(PROCESS|DATAFORM)_GET_/;
const WRITE = /^(PROCESS|DATAFORM)_(CREATE|UPDATE|SUBMIT|DISCARD|DELETE)_ITEM$|^PROCESS_UPDATE_ADMIN_ITEM$/;
const writes = (t, pred = () => true) => t.calls((c) => (WRITE.test(c.command) || (c.command === "API" && c.method && c.method.toUpperCase() !== "GET")) && pred(c));
const J = (s) => { try { return JSON.parse(s || "null"); } catch { return null; } };
const F = Object.fromEntries(Object.entries(FX.flows).map(([k, f]) => [k, f.id]));
const FLOW_OF = Object.fromEntries(Object.entries(F).map(([k, id]) => [id, k]));
const summary = (cs) => cs.map((c) => `${c.command.replace(/^(PROCESS|DATAFORM)_/, "")} ${FLOW_OF[c.flowId] ?? c.flowId ?? ""}${c.refused ? " REFUSED " + c.refused : ""}`);
/** summary() under another name, for a scenario that has its own `summary` (data-console). */
const callsOf = (cs) => summary(cs);
/** A string with milliseconds in a DateTime, outside JSON text (Kissflow refuses those, CAFM). */
const MS = /\d{2}:\d{2}:\d{2}\.\d+Z/;
const msFields = (item) => Object.entries(item || {}).filter(([, v]) => typeof v === "string" && MS.test(v) && !/^\s*[[{]/.test(v)).map(([k]) => k);
/** The write calls of one flow, as "COMMAND" (refused ones marked). */
const writeSeq = async (t, flow, from = 0) => (await writes(t, (c) => c.flowId === F[flow])).filter((c) => c.seq >= from).map((c) => c.command.replace(/^(PROCESS|DATAFORM)_/, "") + (c.refused ? "!" : ""));
/** Audit rows written by the UI since `from` (a row count of the audit form). */
const auditSince = async (t, from) => (await t.rows(F.audit)).slice(from);
const codes = (rows) => rows.map((r) => r.Action_Code);
/** Writes Kissflow refused since `from` (a refused READ is the ladder working: Diagnostics lists those). */
const refusedCalls = async (t, from = 0) => (await writes(t, (c) => c.refused && c.seq >= from)).map((c) => `${c.command} ${FLOW_OF[c.flowId] ?? ""}: ${c.refused}`);
const CASE3 = "AppZZT-0003", CASE1 = "AppZZT-0001", CASE5 = "AppZZT-0005";
/** A10 (22 Oct): the toast promised "Beiersdorf's system will pass this on." for a pending hand-off; no system does. */
const PENDING = /Beiersdorf's system will pass this on/;
/** What production must not show a tester (FE-CLEANUP C1-C30): Kissflow codes and messages, flow / field / app ids,
 *  the fixtures' item ids, transport tags, unverified marks, pointers to Diagnostics, mapper jargon. */
const TECH = /KISSFLOW_ERROR|\b0503\d\d\b|\b0502\d\d\b|_A00\b|\b[A-Z][A-Za-z]*_[A-Z][A-Za-z_]*\b|\b(Pk|App|Act|Us)[A-Z][A-Za-z0-9-]{3,}|\((SDK|REST|fetch)\)|\[unverified\]|Diagnostics|OWN:current|REM:current|read route|hand-off|history line|screen's state|person menu|row in Kissflow|\.\./;
/** The text of the UI frame's page without the side pane (main column: banners, page, toasts). */
const mainText = async (t) => t.frame().evaluate(() => [...document.querySelectorAll("main, div.fixed[aria-live='polite']")].map((e) => e.innerText).join("\n"));
/** Thomas, 28 Oct: the Rules page shows no Basis (column, filter, counts): where a rule comes from is not needed by the
 *  end users. Checks the rule table's column heads and the page text (the basis labels of domain/conditions.ts). */
async function noBasis(t, who) {
  const heads = await t.frame().evaluate(() => [...document.querySelectorAll("main th")].map((e) => e.innerText.trim()));
  t.check(`${who}: the rule table has no Basis column`, heads.includes("Departments") && !heads.includes("Basis"), heads);
  const text = await mainText(t);
  const left = ["Requirements document", "Agreed with Beiersdorf", "Not in the requirements", "from the requirements document ·", "agreed with Beiersdorf"].filter((x) => text.includes(x));
  t.check(`${who}: … and no basis filter or basis counts`, left.length === 0 && /\d+ rules?\. The strictest outcome wins\./.test(text), left);
}
/** The TECH tokens in a text, for a check's detail. */
const techIn = (text) => [...new Set((text.match(new RegExp(TECH.source, "g")) ?? []))];
/** A webhook payload's keys, sorted and joined (20 Oct: app item ids and the idempotencyKey only). */
const keysOf = (body) => Object.keys(body ?? {}).sort().join();
/** A value as the shared e-mail layout writes it into a Body (src/domain/emailHtml.ts htmlText): escaped, every
 *  character outside ASCII as a numeric reference, line breaks as <br>. */
const mailText = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]).replace(/[^\x00-\x7f]/gu, (ch) => `&#${ch.codePointAt(0)};`).replace(/\r\n?|\n/g, "<br>");
/** The shared e-mail layout (27 Oct): one whole HTML document with the CIQ Digital header band and the footer. */
const isMailLayout = (body) => typeof body === "string" && body.startsWith("<!DOCTYPE html>") && body.includes(">CIQ Digital</p>") && body.includes(">Sent automatically by CIQ Digital. Please do not reply to this e-mail.</p>") && !/<style|<link|<script|<img/i.test(body);
/** The 20 Oct transport: a POST by the browser's fetch, mode no-cors, text/plain, the JSON text as the body. */
const byFetch = (h) => h.route === "fetch" && h.method === "POST" && h.mode === "no-cors" && /^text\/plain\b/.test(h.contentType ?? "") && typeof h.body === "object";

// ---- the RMES sheet (28 Oct, BDF's e-mail: exactly 8 fields, filled automatically from the CIQ, read only; derived
// from the case by domain/rmesSheet.ts, nothing stored; the decision sits outside it, on the Questionnaire tab)
/** domain/rmesSheet.ts ORIGIN_TEXT_FIELDS and catalog.ts ORIGIN_LABEL (the harness checks the built bundle, so it
 *  keeps its own copy): the free-text field(s) of each Source of origin. */
const ORIGIN_TEXT = { vegetable: ["FLD-2.1-101", "FLD-2.3-10"], animal: ["FLD-2.1-101", "FLD-2.3-10"], petrochemical: ["FLD-2.3-11"], mineral: ["FLD-2.3-12"], ccu: ["FLD-2.3-13"], polymer: ["FLD-2.3-14"], waste: ["FLD-2.3-15"], chemrec: ["FLD-2.3-16"] };
const ORIGIN_NAME = { vegetable: "Vegetable (bio mass)", animal: "Animal", mineral: "Mineral", petrochemical: "Petrochemical / fossil", polymer: "Polymer", waste: "Waste / side stream", ccu: "Carbon capture (CCU)", chemrec: "Chemical recycling of post-consumer plastic" };
/** What the criteria RMES showed (retired 28 Oct) and the fields BDF left out (not yellow): never on the sheet. */
const NOT_ON_SHEET = /criteri|finding|\bPart [A-D]\b|AI suggestion|BDF limit|limit check|Process ID|RMT ID|IRMA|Declaration|Recorded RMES result|Approved|Rejected/i;
/** The old criteria RMES's test ids and labels: nowhere in the app any more. */
const OLD_RMES_UI = '[data-testid^="criterion-"], [data-testid^="finding-"], [data-testid="add-finding"], [data-testid="findings-card"], [data-testid="rmes-progress"]';
/** The 8 fields as the case item in Kissflow holds them now (BDF_Set_JSON over Answers_JSON, Components_JSON). */
async function rmesExpected(t, caseItemId) {
  const kase = await t.item(caseItemId);
  const set = Object.fromEntries(Object.entries(J(kase.BDF_Set_JSON) ?? {}).filter(([, v]) => v !== null && v !== ""));
  const answers = { ...(J(kase.Answers_JSON) ?? {}), ...set };
  const text = (v) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v)).trim();
  return {
    material: text(answers["FLD-GEN-001"]) || kase.Trade_Name,
    supplier: text(answers["FLD-GEN-002"]) || kase.Supplier_Legal_Name,
    manufacturer: text(answers["FLD-GEN-004"]) || "Not answered yet",
    rows: (J(kase.Components_JSON) ?? []).map((r) => ({
      id: r.id,
      inci: r.inci,
      conc: r.concMin === r.concMax ? `${r.concMin} %` : `${r.concMin}–${r.concMax} %`,
      cas: r.cas || "—",
      ec: r.ec || "—",
      origin: ORIGIN_NAME[r.origin],
      free: (ORIGIN_TEXT[r.origin] ?? []).map((f) => [f, text(answers[f]) || "Not answered yet"]),
    })),
  };
}
/** Safety / Regulatory: the RMES tab of a case shows its 8 fields as Kissflow holds them, each with its CIQ source, and
 *  nothing else: no input, no decision, nothing of the criteria RMES, no Process / RMT / IRMA ID, no Declaration. */
async function checkRmesSheet(t, caseCode, caseItemId, who) {
  await t.go(`/review/${caseCode}?tab=rmes`);
  await t.seeTid("rmes-tab", `${who}: the RMES tab`);
  await t.seeTid("rmes-header-material", `${who}: … with the sheet`);
  const x = await rmesExpected(t, caseItemId);
  const txt = async (id) => ((await t.tid(id).first().innerText({ timeout: 3000 }).catch(() => "")) || "").replace(/\s+/g, " ").trim();
  t.check(`${who}: the record line`, (await txt("rmes-record")) === `RMES · ${caseCode} · internal: never visible to the supplier · filled automatically from the CIQ`, await txt("rmes-record"));
  t.check(`${who}: … and when the record was created`, /^Record created \d/.test(await txt("rmes-record-at")), await txt("rmes-record-at"));
  for (const [key, fid, want] of [["material", "FLD-GEN-001", x.material], ["supplier", "FLD-GEN-002", x.supplier], ["manufacturer", "FLD-GEN-004", x.manufacturer]]) {
    const h = await txt(`rmes-header-${key}`);
    t.check(`${who}: ${key} “${want}”, with its source ${fid}`, h.includes(want) && h.includes(fid), h);
  }
  t.check(`${who}: exactly 3 header fields`, (await t.ui.locator('[data-testid^="rmes-header-"]').count()) === 3, await t.ui.locator('[data-testid^="rmes-header-"]').count());
  const heads = await t.tid("rmes-composition").first().locator("th").evaluateAll((els) => els.map((e) => (e.firstElementChild ?? e).textContent.trim()));
  t.check(`${who}: the composition's columns`, JSON.stringify(heads) === JSON.stringify(["#", "INCI", "%", "CAS #", "EC #", "Source of origin", "Free text"]), heads);
  const n = await t.ui.locator('[data-testid^="rmes-row-"]').count();
  t.check(`${who}: one row per component (${x.rows.length})`, x.rows.length > 0 && n === x.rows.length, [n, x.rows.length]);
  for (const r of x.rows) {
    const row = await txt(`rmes-row-${r.id}`);
    const miss = [r.inci, r.conc, r.cas, r.ec, r.origin, ...r.free.flat()].filter((v) => !row.includes(v));
    t.check(`${who}: ${r.inci}: INCI, %, CAS #, EC #, Source of origin and its free text with the field ids`, miss.length === 0, { row, miss });
  }
  const tab = t.tid("rmes-tab").first();
  const controls = await tab.locator("input, textarea, select, [role=combobox], [contenteditable=true]").count();
  const buttons = await tab.locator("button").evaluateAll((els) => els.map((e) => e.dataset.testid || e.textContent.trim()).filter((id) => !/^rmes-(source-FLD-|open-composition$)/.test(id)));
  t.check(`${who}: nothing on the sheet is editable (its only buttons open a source)`, controls === 0 && buttons.length === 0, { controls, buttons });
  const all = await tab.innerText();
  t.check(`${who}: nothing of the criteria RMES, no IDs, no Declaration, no decision on the sheet`, !NOT_ON_SHEET.test(all) && (await tab.locator('[data-testid="decision-card"]').count()) === 0, all.match(NOT_ON_SHEET)?.[0]);
  t.check(`${who}: no criteria or findings UI`, (await t.ui.locator(OLD_RMES_UI).count()) === 0, await t.ui.locator(OLD_RMES_UI).count());
}

// ---- the data console's case delete with everything (26 Oct)
const P_FLOW = FX.portal.flows; // { request: "CIQP_Request_A00", query: "CIQP_Query_A00" }
const PART_OF_FLOW = { [P_FLOW.query]: "portalQuery", [P_FLOW.request]: "portalRequest", [F.op]: "op", [F.review]: "review", [F.rmesSAF]: "rmesSAF", [F.rmesREG]: "rmesREG", [F.note]: "note", [F.scopeRun]: "scopeRun", [F.audit]: "audit", [F.case]: "case" };
const CASCADE_ORDER = ["portalQuery", "portalRequest", "op", "review", "rmesSAF", "rmesREG", "note", "scopeRun", "audit", "case"];
/** The flow id and item id a recorded call is about (SDK fields, or the REST path). */
const flowOfCall = (c) => c.flowId || (c.url && (c.url.match(/\/process\/2\/[^/]+\/(?:admin\/)?([^/?]+)/) || c.url.match(/\/form\/2\/[^/]+\/([^/?]+)/) || [])[1]);
const idOfCall = (c) => c.instanceId || c.itemId || (c.url && decodeURIComponent((c.url.match(/\/([^/?]+)\?/) || [])[1] || ""));
/** Rows a page of the console's tables (console/FlowTable.tsx PAGE_ROWS). */
const PAGE = 25;
/** The flows of the data console (console/common.ts CONSOLE_FLOWS). */
const CONSOLE_FLOWS = ["case", "review", "op", "config", "supplier", "audit", "note", "rmesSAF", "rmesREG", "scopeRun"];
/** A list read: the SDK's admin or form list, or the REST admin list (the portal's). */
const isList = (c) => c.command === "PROCESS_GET_ADMIN_ITEMS" || c.command === "DATAFORM_GET_ITEMS" || (c.command === "API" && /\/item\?/.test(c.url || ""));
const isDelete = (c) => c.command === "DATAFORM_DELETE_ITEM" || (c.command === "API" && (c.method || "").toUpperCase() === "DELETE");
const isRead = (c) => c.command === "PROCESS_GET_ADMIN_ITEM" || c.command === "DATAFORM_GET_ITEM" || (c.command === "API" && (c.method || "GET").toUpperCase() === "GET" && !/\/item\?/.test(c.url || ""));
/** What belongs to a case in the emulated Kissflow, per part of the delete: the rows that name its item id, its portal
 *  request (App_Case_Item_Id) and the queries of its open points (App_Open_Point_Id). */
async function caseParts(t, caseItemId) {
  const db = await t.page.evaluate(() => window.__kfDb);
  const own = (f) => (db[f] ?? []).filter((r) => r.Case_Item_Id === caseItemId).map((r) => r._id);
  const ops = own(F.op);
  const parts = {
    portalQuery: (db[P_FLOW.query] ?? []).filter((q) => ops.includes(q.App_Open_Point_Id)).map((q) => q._id),
    portalRequest: (db[P_FLOW.request] ?? []).filter((r) => r.App_Case_Item_Id === caseItemId).map((r) => r._id),
    op: ops, review: own(F.review), rmesSAF: own(F.rmesSAF), rmesREG: own(F.rmesREG), note: own(F.note), scopeRun: own(F.scopeRun), audit: own(F.audit),
    case: (db[F.case] ?? []).filter((c) => c._id === caseItemId).map((c) => c._id),
  };
  return Object.fromEntries(Object.entries(parts).filter(([, ids]) => ids.length));
}
const countsText = (parts) => Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length]));
/** Runs the open cascade dialog after typing `code`; checks the deletes (order, each read back as deleted). */
async function runCascade(t, code, parts, label) {
  const total = Object.values(parts).flat().length;
  t.check(`${label}: Delete stays disabled until the code is typed`, (await t.button("cascade-go")).disabled);
  await t.fillText("cascade-typed", code.slice(0, -1));
  t.check(`${label}: … and with a wrong code`, (await t.button("cascade-go")).disabled);
  await t.fillText("cascade-typed", code);
  t.check(`${label}: … enabled with ${code}`, !(await t.button("cascade-go")).disabled && (await t.button("cascade-go")).text === `Delete ${total} items`, await t.button("cascade-go"));
  await t.shot(`${label}-confirm`);
  const from = (await t.calls()).length;
  await t.tid("cascade-go").click();
  await t.ui.getByTestId("cascade-result").waitFor({ timeout: 60000 });
  const result = t.tid("cascade-result");
  t.check(`${label}: all ${total} deleted and read back`, (await result.getAttribute("data-outcome")) === "done" && Number(await result.getAttribute("data-done")) === total, [await result.getAttribute("data-outcome"), await result.getAttribute("data-done"), (await result.innerText()).slice(0, 300)]);
  const calls = await t.calls((c) => c.seq >= from);
  const dels = calls.filter(isDelete);
  const seen = dels.map((c) => PART_OF_FLOW[flowOfCall(c)]);
  const order = seen.filter((p, i) => p !== seen[i - 1]);
  t.check(`${label}: deleted children first and the case last (${CASCADE_ORDER.filter((p) => parts[p]).join(" → ")})`, JSON.stringify(order) === JSON.stringify(CASCADE_ORDER.filter((p) => parts[p])) && dels.length === total, order);
  t.check(`${label}: every item deleted once`, JSON.stringify(dels.map(idOfCall).sort()) === JSON.stringify(Object.values(parts).flat().sort()), dels.map(idOfCall));
  const gaps = dels.slice(1).map((c, i) => c.at - dels[i].at);
  t.check(`${label}: paced: one item at a time, at least about 400 ms apart`, gaps.every((g) => g >= 350), gaps);
  const unconfirmed = dels.filter((d) => !calls.some((c) => c.seq > d.seq && isRead(c) && idOfCall(c) === idOfCall(d) && /050201|01015/.test(c.refused || "")));
  t.check(`${label}: … each read back afterwards, answered as a deleted item (050201 / 01015)`, unconfirmed.length === 0, unconfirmed.map(idOfCall));
  const portal = calls.filter((c) => c.command === "API" && PART_OF_FLOW[flowOfCall(c)]?.startsWith("portal"));
  t.check(`${label}: the portal's items by its REST admin routes, in its container`, portal.length > 0 && portal.every((c) => c.url.includes("_application_id=CIQ_Supplier_Portal_A00")), portal.map((c) => c.url).slice(0, 4));
  t.check(`${label}: nothing was refused`, (await refusedCalls(t, from)).length === 0, await refusedCalls(t, from));
  await t.shot(`${label}-done`);
}

/** The console's case delete (27 Oct, CaseCascadeDialog): runs the open dialog after typing `typed` and checks the
 *  deletes: `groups` holds each case's parts (caseParts), in the order the cases are deleted: case after case, children
 *  first and each case LAST, every item once, ONE call each, paced (at least about 400 ms apart), and NOTHING read (no
 *  read-back, no list read). */
async function runCaseDelete(t, typed, groups, label) {
  const all = groups.flatMap((g) => Object.values(g).flat());
  const total = all.length;
  t.check(`${label}: Delete stays disabled until ${typed} is typed`, (await t.button("case-delete-go")).disabled);
  await t.fillText("case-delete-typed", typed.length > 1 ? typed.slice(0, -1) : "0");
  t.check(`${label}: … and with a wrong text`, (await t.button("case-delete-go")).disabled);
  await t.fillText("case-delete-typed", typed);
  const go = await t.button("case-delete-go");
  t.check(`${label}: … enabled with ${typed}: "Delete ${total} items"`, !go.disabled && go.text === `Delete ${total} items`, go);
  await t.shot(`${label}-confirm`);
  const from = (await t.calls()).length;
  await t.tid("case-delete-go").click();
  await t.seeTid("case-delete-progress", `${label}: a progress line while it runs`);
  await t.ui.getByTestId("case-delete-result").waitFor({ timeout: 90000 });
  const result = t.tid("case-delete-result");
  t.check(`${label}: all ${total} deleted`, (await result.getAttribute("data-outcome")) === "done" && Number(await result.getAttribute("data-done")) === total && (await result.getAttribute("data-remaining")) === "0", [await result.getAttribute("data-outcome"), await result.getAttribute("data-done"), (await result.innerText()).slice(0, 300)]);
  const calls = await t.calls((c) => c.seq >= from);
  const dels = calls.filter(isDelete);
  t.check(`${label}: nothing but the deletes: no read-back, no list read`, calls.length === dels.length, summary(calls.filter((c) => !isDelete(c))));
  t.check(`${label}: every item deleted once, ONE call each`, JSON.stringify(dels.map(idOfCall).sort()) === JSON.stringify([...all].sort()), dels.map(idOfCall));
  const caseOf = (id) => groups.findIndex((g) => Object.values(g).flat().includes(id));
  const seq = dels.map((c) => caseOf(idOfCall(c)));
  if (groups.length > 1) t.check(`${label}: one case after the other`, seq.every((x, i) => i === 0 || x >= seq[i - 1]), seq);
  for (const [k, g] of groups.entries()) {
    const seen = dels.filter((c) => caseOf(idOfCall(c)) === k).map((c) => PART_OF_FLOW[flowOfCall(c)]);
    const order = seen.filter((p, i) => p !== seen[i - 1]);
    const want = CASCADE_ORDER.filter((p) => g[p]);
    t.check(`${label}: ${groups.length > 1 ? `case ${k + 1}: ` : ""}children first, the case last (${want.join(" → ")})`, JSON.stringify(order) === JSON.stringify(want), order);
  }
  const gaps = dels.slice(1).map((c, i) => c.at - dels[i].at);
  t.check(`${label}: paced: one delete at a time, at least about 400 ms apart`, gaps.every((g) => g >= 350), gaps);
  const portal = dels.filter((c) => c.command === "API" && PART_OF_FLOW[flowOfCall(c)]?.startsWith("portal"));
  if (groups.some((g) => g.portalRequest || g.portalQuery)) t.check(`${label}: the portal's items by its REST admin DELETE, in its container`, portal.length > 0 && portal.every((c) => c.url.includes("_application_id=CIQ_Supplier_Portal_A00")), portal.map((c) => c.url).slice(0, 4));
  t.check(`${label}: nothing was refused`, calls.every((c) => !c.refused), summary(calls.filter((c) => c.refused)));
  await t.shot(`${label}-done`);
}

/** Loads a role in the emulated host and waits for the shell; installs the toast log. */
async function open(t, params, route = "/") {
  await t.host(params, route);
  await t.seeTid("main-nav", `the shell opens (${params.roles})`, 15000);
  await t.settle(300);
  await t.toastLog();
}

/** Switches to a persona the user holds (the dev role switcher; a held role switches the screens, no SWITCH_ROLE). */
async function asPersona(t, persona) {
  if ((await t.tid("role-switcher").getAttribute("data-persona")) === persona) return;
  await t.tid("role-switcher").click();
  await t.seeTid("role-menu");
  await t.tid(`switch-role-${persona}`).click();
  await t.page.waitForTimeout(500);
  await t.seeTid("role-switcher");
  await t.settle(400);
  t.check(`now acts as ${persona}`, (await t.tid("role-switcher").getAttribute("data-persona")) === persona);
}

/** canonicalJson + SHA-256 (portal/data/bundle.ts, the sync engine's): a CIQ Config Version row's fingerprints. */
const canon = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) ?? "null" : Array.isArray(v) ? `[${v.map((x) => (x === undefined ? "null" : canon(x))).join(",")}]` : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`);
const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
/** The row's content hashes to its Content_Hash (a release: the bundle, and the manifest to its Manifest_Hash). */
const fingerprintOk = (r) => {
  if (!r.Content_Hash) return true; // a row without a fingerprint (the stray test row) has nothing to match
  try {
    const rel = r.Config_Kind === "Release";
    return sha(canon(JSON.parse(rel ? r.Release_Bundle_JSON : r.Payload_JSON))) === r.Content_Hash && (!rel || sha(canon(JSON.parse(r.Release_Manifest_JSON))) === r.Manifest_Hash);
  } catch {
    return false;
  }
};
/** The CIQ Config Version writes since `from`: "UPDATE <Config_Key as the row has it now> <sent keys>". */
const cfgWrites = async (t, from) => {
  const db = await t.rows(F.config);
  const key = (c) => db.find((r) => r._id === c.itemId)?.Config_Key ?? J(c.data)?.Config_Key ?? c.itemId;
  return (await writes(t, (c) => c.seq >= from && c.flowId === F.config)).map((c) => `${c.command.replace(/^DATAFORM_/, "")} ${key(c)} ${c.keys}${c.refused ? " REFUSED" : ""}`);
};
const cfgRow = async (t, key) => (await t.rows(F.config)).find((r) => r.Config_Key === key);
const DRAFT_KEYS = ["RS:RS-2026.2", "TPL:CIQ-2026 v2", "REL:RS-2026.2 + v2"];
const CONTENT = { rs: "Content_Hash,Payload_JSON", rel: "Content_Hash,Manifest_Hash,Release_Bundle_JSON,Release_Manifest_JSON" };

/** I-2 on a case: the supplier confirmed completeness, the service copied the 15 supplier-data fields (here from
 *  ZZT-0003, whose answers are complete) with the completeness fields and Review_Depts (here ZZT-0003's departments),
 *  set Case_Phase "Review", started the round-1 reviews with ONE case-level review.started row (E-A, 22 Oct:
 *  kissflow-build/night-2026-10-20/integrations/scripts/i2-plan-reviews.js; created by the integration's connection,
 *  no Assignee_*) and moved the case on. */
async function playCompleteness(t, toId, fromId = CASE3) {
  await t.page.evaluate(([from, to, synced, release, reviewFlow, auditFlow, reviewSteps]) => {
    const all = Object.values(window.__kfDb).flat();
    const src = all.find((x) => x._id === from);
    const kase = all.find((x) => x._id === to);
    const at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const ORDER = ["RMM", "REG", "SAF", "QM", "MIC", "SUS"];
    const LABEL = { RMM: "RMM", REG: "Regulatory", SAF: "Safety", QM: "QM", MIC: "Microbiology", SUS: "Sustainability" };
    const named = new Set(window.__kfDb[reviewFlow].filter((x) => x.Case_Item_Id === from).map((x) => x.Review_Dept));
    const depts = ORDER.filter((d) => d !== "RMM" && named.has(d));
    const patch = { Case_Phase: "Review", Review_Depts: depts.join(",") };
    for (const k of synced) if (src[k] !== undefined) patch[k] = src[k];
    for (const k of Object.keys(src)) if (/^Completeness_/.test(k)) patch[k] = src[k];
    patch.Completeness_At = at;
    window.__kfSet(to, patch);
    const code = kase.Case_Code, by = { _id: "UsIntegrationConnection", Name: "Kissflow integration" };
    const have = new Set(window.__kfDb[reviewFlow].filter((x) => x.Case_Item_Id === to).map((x) => x.Review_Key));
    const want = ["RMM", ...depts].filter((d) => !have.has(`${code}-${d}-1`));
    for (const d of want)
      window.__kfAdd(reviewFlow, { _id: `PkEA${code.replace(/-/g, "")}${d}`, _status: "InProgress", _created_at: at, _modified_at: at, _created_by: by, Review_Key: `${code}-${d}-1`, Case_Code: code, Cycle_No: kase.Cycle_No || 1, Case_Item_Id: to,
        Supplier_Code: kase.Supplier_Code || "", Trade_Name: kase.Trade_Name || "", Review_Dept: d, Round_No: 1, Activation_Kind: "Completeness", Activation_Reason: "The supplier confirmed completeness.",
        Activated_By_Name: "Integration", Track_Status: "In review", Open_Count: 0, RMES_Gaps: 0 }, reviewSteps[d]);
    if (want.length) {
      const text = `Reviews started: ${want.map((d) => LABEL[d]).join(", ")}.`;
      const owner = kase.Owner_RMM && kase.Owner_RMM._id;
      window.__kfAdd(auditFlow, { _id: `PkEvEA${code.replace(/-/g, "")}`, _created_at: at, _modified_at: at, _created_by: by, Event_Key: `EV-${code}-${at.replace(/[-:TZ]/g, "").slice(0, 14)}-ea00`, Case_Code: code, Cycle_No: kase.Cycle_No || 1,
        Case_Item_Id: to, Event_At: at, Event_Category: "Review", Action_Code: "review.started", Actor_Side: "BDF", Actor_Name: "Integration", Object_Kind: "Case", Object_Key: code, Object_Item_Id: to, Object_State: "In review", New_Value_Text: text,
        Snapshot_JSON: JSON.stringify({ v: 1, code: "review.started", audit: [{ id: "", at, by: "system", action: "Activated review", detail: text }], handoffs: [],
          tracks: want.map((d) => ({ dept: d, status: "in-review", roundNo: 1, startedAt: at, ...(d === "RMM" && owner ? { assigneeId: owner } : {}) })) }) });
    }
    window.__kfMove(to, release);
  }, [fromId, toId, FX.synced, FX.steps.case.release, F.review, F.audit, FX.steps.review]);
}

/** Another department completed its review through the app (played): its review item gets the completion fields and
 *  moves to End, and its screen's review.completed audit row (write/actions.ts completeReview: the track and the
 *  dept-completion confirmation in Snapshot_JSON) lands in the audit form, which is how a department that can read only
 *  its own review item learns about the others (DESIGN §4 snapshot rung). */
async function playCompleted(t, itemId, dept, by) {
  const at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  await t.set(itemId, { Review_Confirm: "Confirmed", Completed_At: at, Completed_By: { _id: by._id, Name: by.Name }, Completed_By_Name: by.Name, Completed_By_Email: by.Email, Open_Count: 0, RMES_Gaps: 0, ...(dept === "SAF" || dept === "REG" ? { RMES_Decision: "Approved" } : {}) });
  await t.move(itemId, FX.steps.review.end);
  await t.page.evaluate(([auditFlow, id, d, u, now]) => {
    const rev = Object.values(window.__kfDb).flat().find((x) => x._id === id);
    const rows = (window.__kfDb[auditFlow] ??= []);
    const track = { dept: d, status: "completed", assigneeId: u._id, startedAt: rev._created_at, completedAt: now, roundNo: 1, ...(d === "SAF" || d === "REG" ? { decision: "approved" } : {}) };
    const confirmation = { type: "dept-completion", dept: d, by: u._id, name: u.Name, email: u.Email, role: d, at: now, reviewVersion: 1, note: "Review completed: assigned data and documents reviewed, no open query. Not a raw-material approval." };
    const snapshot = { v: 1, code: "review.completed", audit: [{ id: "", at: now, by: u._id, action: `Completed ${d} review`, detail: "All assigned sections reviewed; no open points." }], track, confirmation, handoffs: [] };
    rows.push({ _id: `PkEvPlay${rows.length}`, _created_at: now, _modified_at: now, _created_by: { _id: u._id, Name: u.Name }, Event_Key: `EV-${rev.Case_Code}-${now.replace(/[-:TZ]/g, "")}-${d}`, Case_Code: rev.Case_Code, Cycle_No: 1, Case_Item_Id: rev.Case_Item_Id, Event_At: now, Event_Category: "Review", Action_Code: "review.completed", Actor_Side: "BDF", Actor_Name: u.Name, Actor_Email: u.Email, Actor_Dept: d, Object_Kind: "Review", Object_Key: rev.Review_Key, Object_Item_Id: id, Object_State: "Completed", Snapshot_JSON: JSON.stringify(snapshot) });
  }, [F.audit, itemId, dept, by, at]);
}

/** The reviewer raises a question on a section of the case in the review workspace; returns the new point's item. */
async function raiseOn(t, caseCode, section, question) {
  const before = (await t.rows(F.op)).map((x) => x._id);
  await t.go(`/review/${caseCode}?s=${section}`);
  await t.seeTid("review-workspace", `${caseCode}: the review workspace`);
  await t.tid(`ask-section-${section}`).first().click();
  await t.fillText("ask-question", question);
  await t.fillText("ask-justification", "Needed for the assessment.");
  await t.act("ask-send");
  return (await t.rows(F.op)).find((x) => !before.includes(x._id));
}

/** I-4: the supplier answered the open point in the portal (Response_* set, OP_Progress "In progress"). */
async function playAnswer(t, opItemId, text) {
  await t.set(opItemId, { OP_Progress: "In progress", Response_Kind: "Answered", Response_Text: text, Response_Doc_Refs_JSON: "[]", Supplier_Responsible_Email: FX.contacts.elena.Email });
}

const SCENARIOS = {
  outside: () =>
    scenario("outside", async (t) => {
      const t0 = Date.now();
      await t.direct("/");
      await t.see("Not running inside Kissflow", undefined, 4000);
      t.check("says so at once when opened directly (no SDK wait)", Date.now() - t0 < 4000, `${Date.now() - t0} ms`);
      await t.notSee("Open demo preview", "no demo preview in the internal app");
    }),
  "no-answer": () =>
    scenario("no-answer", async (t) => {
      await t.host({ roles: "rmm", ignoreInits: 1 }, "/");
      await t.page.waitForTimeout(700);
      await t.see("Loading CIQ Digital", "branded loader while connecting (one label from the start: C11)");
      await t.see("Couldn't connect to Kissflow", "says so when Kissflow does not answer", 16000);
      await t.see("Kissflow did not answer. Reload the page; if this keeps happening, tell your CIQ administrator.", "C4: what to do, in plain words (the environment is not known yet)");
      t.check("C4: Kissflow's own answer is folded away under Technical details", (await t.tid("connect-failed-detail").count()) === 1 && (await t.tid("connect-failed-detail").getAttribute("open")) === null);
      await t.ui.getByRole("button", { name: "Try again" }).click();
      await t.seeTid("main-nav", "Try again connects and opens the app", 15000);
      t.check("two handshakes were sent (first unanswered, then Try again)", (await t.calls((c) => c.command === "CC_INITIALIZE")).length === 2);
    }),
  "no-role": () =>
    scenario("no-role", async (t) => {
      await t.host({ roles: "none" }, "/");
      await t.seeTid("no-role", "the no-role page");
      await t.see("has no CIQ role in this app");
      await t.see("roles: User", "names the roles Kissflow sent");
      t.check("no item reads", (await t.calls((c) => ITEM_READ.test(c.command))).length === 0, summary(await t.calls((c) => ITEM_READ.test(c.command))));
    }),
  "ca-only": () =>
    scenario("ca-only", async (t) => {
      await t.host({ roles: "caseAdmin", admin: "1" }, "/");
      await t.seeTid("no-role", "a Case administrator alone gets the no-role page");
      await t.see("Case administrator and Integration service work in Kissflow directly");
      t.check("no item reads", (await t.calls((c) => ITEM_READ.test(c.command))).length === 0);
    }),
  "container-guard": () =>
    scenario("container-guard", async (t) => {
      await open(t, { roles: "rmm", appId: "CIQ_Supplier_Portal_A00" });
      await t.seeTid("container-banner", "says the page is not in CIQ Digital and nothing is saved");
      // a screen action: an internal note in the review workspace
      await t.go("/review/ZZT-0003");
      await t.seeTid("review-workspace", "the review workspace still opens");
      await t.fillText("note-input", "Checked against the SDS.");
      await t.tid("note-add").click();
      t.check("the note is refused with the not-in-the-app toast", !!(await t.waitToast(/not running in the CIQ Digital app\. Nothing was saved/)), await t.toastLog());
      await t.page.waitForTimeout(800);
      t.check("zero writes (no review start either)", (await writes(t)).length === 0, summary(await writes(t)));
    }),
  "multi-role": () =>
    scenario("multi-role", async (t) => {
      await t.host({ roles: "rmm,saf" }, "/");
      await t.seeTid("role-switcher");
      t.check("acts as the first held role (RMM)", (await t.tid("role-switcher").getAttribute("data-persona")) === "rmm");
      t.check("lands on the RMM dashboard", (await t.hash()).startsWith("#/rmm"), await t.hash());
      const before = (await t.calls()).length;
      await t.tid("role-switcher").click();
      await t.seeTid("role-menu", "the dev role switcher lists the roles");
      await t.tid("switch-role-saf").click();
      await t.page.waitForTimeout(500);
      await t.seeTid("role-switcher");
      t.check("now acts as Product Safety", (await t.tid("role-switcher").getAttribute("data-persona")) === "saf");
      t.check("lands on My reviews", (await t.hash()).startsWith("#/review"), await t.hash());
      const after = (await t.calls()).slice(before);
      t.check("a held role switches the screens only (no SWITCH_ROLE)", !after.some((c) => c.command === "SWITCH_ROLE"), summary(after).slice(0, 20));
      t.check("the reads ran again for the new role (SAF review step)", after.some((c) => c.command === "PROCESS_GET_MY_TASKS_ITEMS" && c.activityId === FX.steps.review.SAF), summary(after).slice(0, 20));
      await t.tid("person-chip").click();
      await t.tid("person-menu-diagnostics").click();
      await t.seeTid("diagnostics", "Diagnostics opens from the person menu");
      t.check("Diagnostics names the acting role", (await t.tid("diag-acting").getAttribute("data-persona")) === "saf");
      await t.shot("diagnostics");
    }),
  "dev-role-switch": () =>
    scenario("dev-role-switch", async (t) => {
      // Thomas, 20 Oct: in dev a role the user does not hold is a REAL Kissflow role switch (kf.app.switchRole)
      await t.host({ roles: "admin" }, "/");
      await t.seeTid("dev-top-bar", "dev: the top bar is there");
      t.check("acts as the Business administrator", (await t.tid("role-switcher").getAttribute("data-persona")) === "admin");
      await t.tid("role-switcher").click();
      await t.seeTid("role-menu");
      t.check("the switcher lists every CIQ role", (await t.page.frameLocator("#kf-frame").locator('[data-testid^="switch-role-"]:not([data-testid^="switch-role-confirm"])').count()) === 11);
      await t.tid("switch-role-rmm").click();
      await t.seeTid("switch-role-confirm-box", "a role not held asks for confirmation first");
      t.check("nothing switched before the confirmation", !(await t.calls()).some((c) => c.command === "SWITCH_ROLE"));
      await t.tid("switch-role-confirm").click();
      await t.page.waitForTimeout(800);
      await t.seeTid("role-switcher");
      const sw = (await t.calls()).filter((c) => c.command === "SWITCH_ROLE");
      t.check("one SWITCH_ROLE call", sw.length === 1, summary(sw));
      const switches = await t.page.evaluate(() => window.__kfSwitches ?? []);
      t.check("Kissflow moved the user from Business administrator to RMM", JSON.stringify(switches) === JSON.stringify([{ from: ["admin"], to: "rmm" }]), switches);
      t.check("the app now acts as RMM", (await t.tid("role-switcher").getAttribute("data-persona")) === "rmm");
      t.check("and lands on the RMM dashboard", (await t.hash()).startsWith("#/rmm"), await t.hash());
      await t.shot("dev-role-switch");
    }),
  "prod-no-topbar": () =>
    scenario("prod-no-topbar", async (t) => {
      // Thomas, 20 Oct: production (beiersdorf.kissflow.eu) has no top bar; a multi-role user works in the first role
      await t.host({ roles: "rmm,saf", env: "prod" }, "/");
      await t.seeTid("main-nav", "the shell opens");
      await t.settle(300);
      const f = t.page.frameLocator("#kf-frame");
      t.check("no top bar", (await f.locator("header").count()) === 0 && (await f.locator('[data-testid="dev-top-bar"]').count()) === 0);
      t.check("no role switcher and no person chip", (await f.locator('[data-testid="role-switcher"], [data-testid="person-chip"]').count()) === 0);
      t.check("acts as the first held role (lands on the RMM dashboard)", (await t.hash()).startsWith("#/rmm"), await t.hash());
      t.check("no GET_ROLES / SWITCH_ROLE call", !(await t.calls()).some((c) => c.command === "GET_ROLES" || c.command === "SWITCH_ROLE"));
      t.check("Reload and the status note sit in the left pane's footer", (await f.locator('[data-testid="side-footer"] [data-testid="reload"]').count()) === 1 && (await f.locator('[data-testid="side-footer"] [data-testid="load-status"]').count()) === 1);
      const width = async () => Math.round((await t.tid("side-pane").boundingBox())?.width ?? -1);
      t.check("the left pane starts expanded (244 px)", (await width()) === 244, await width());
      await t.tid("nav-toggle").click();
      await t.page.waitForTimeout(400); // the 200 ms width transition
      t.check("the left pane collapses to an icon rail (64 px)", (await t.tid("side-pane").getAttribute("data-collapsed")) === "true" && (await width()) === 64, await width());
      await t.shot("prod-collapsed");
      await t.tid("nav-toggle").click();
      await t.page.waitForTimeout(400);
      t.check("and expands again", (await t.tid("side-pane").getAttribute("data-collapsed")) === "false" && (await width()) === 244, await width());
    }),
  "prod-hooks": () =>
    scenario("prod-hooks", async (t) => {
      // Thomas, 21 Oct: SET:current is copied verbatim from the dev sandbox (hooks=1: the dev host and account in every
      // URL); production differs in both its Kissflow domain and its account, the tokens are the same. So each hand-off
      // goes to https://<the Kissflow page around the frame>/integration/2/<the handshake's account>/webhook/<token>
      // (write/handoff.ts webhooksOf, env.ts hookHostOf, LiveAppStore webhooksFor). Microbiology's raise (op.round) shows
      // where the hooks went (before 22 Oct, RMM's load-time release request; E-B sends that now): production, the dev
      // sandbox, then a row naming another host and account, whose token alone counts
      for (const [env, hooks, parent, account] of [["prod", "1", PROD_PARENT, "AcPRODHARNESS"], ["dev", "1", DEV_PARENT, "AcDOSunMEpSA"], ["prod", "foreign", PROD_PARENT, "AcPRODHARNESS"]]) {
        const label = `${env}, hooks=${hooks}`;
        await open(t, { roles: "mic", byid: "1", hooks, ...(env === "prod" ? { env } : {}) });
        t.check(`${label}: nothing is sent on load`, (await t.hooks()).length === 0);
        const op = await raiseOn(t, "ZZT-0003", "K1", "Please confirm the preservative system.");
        t.must(`${label}: Microbiology raised an open point`, !!op);
        const sent = await t.hooks();
        const rel = sent.filter((h) => h.code === "op.round");
        const want = `${parent}/integration/2/${account}/webhook/${TOKEN["op.round"]}`;
        t.check(`${label}: one POST op.round by the browser's fetch, to the page's host with the running account and the stored token`, rel.length === 1 && byFetch(rel[0]) && rel[0].url === want && rel[0].body.opItemId === op?._id, sent.map((h) => [h.code, h.route, h.url]));
        t.check(`${label}: no hand-off went to another host or account`, sent.every((h) => h.url.startsWith(`${parent}/integration/2/${account}/webhook/`)), sent.map((h) => h.url));
      }
    }),
  "hooks-no-parent": () =>
    scenario("hooks-no-parent", async (t) => {
      // no Kissflow page to post to (the host page on http, or on an https host that is no Kissflow page): the hand-off
      // goes by the Kissflow API route on the relative path, which the SDK sends to the account's own domain; the
      // browser's fetch is not used (production's account: its id is in the path)
      for (const parent of ["plain", "foreign"]) {
        await open(t, { roles: "mic", byid: "1", hooks: "1", env: "prod", parent });
        t.check(`parent=${parent}: the frame runs inside it`, (await t.page.evaluate(() => location.origin)) === parentOf({ parent }), await t.page.evaluate(() => location.origin));
        const op = await raiseOn(t, "ZZT-0003", "K1", "Please confirm the preservative system.");
        t.must(`parent=${parent}: Microbiology raised an open point`, !!op);
        const sent = await t.hooks();
        const rel = sent.filter((h) => h.code === "op.round");
        t.check(`parent=${parent}: one POST op.round by the API route, on /integration/2/<production's account>/webhook/<token>`, rel.length === 1 && rel[0].route === "sdk" && !rel[0].absolute && rel[0].url === `/integration/2/AcPRODHARNESS/webhook/${TOKEN["op.round"]}` && rel[0].body.opItemId === op?._id && keysOf(rel[0].body) === "idempotencyKey,opItemId", sent.map((h) => [h.code, h.route, h.url]));
        t.check(`parent=${parent}: nothing by the browser's fetch`, sent.every((h) => h.route === "sdk") && (await t.frame().evaluate(() => (window.__hookInits ?? []).length)) === 0, sent.map((h) => [h.code, h.route]));
      }
    }),
  "hooks-no-token": () =>
    scenario("hooks-no-token", async (t) => {
      // SET:current's URLs without a token (NO_TOKEN: "/webhook/", "/webhook", a REST path, another site, a query): no
      // URL, so every hand-off is pending and nothing is posted; the raise's row says so
      await open(t, { roles: "mic", byid: "1", hooks: "notoken" });
      const audits = (await t.rows(F.audit)).length;
      const op = await raiseOn(t, "ZZT-0003", "K1", "Please confirm the preservative system.");
      t.must("Microbiology raised an open point", !!op);
      const rows = await auditSince(t, audits);
      t.check("the raise writes one op.raised row", codes(rows).join() === "op.raised", codes(rows));
      t.check("nothing is posted, by either route", (await t.hooks()).length === 0);
      const raised = rows.find((r) => r.Action_Code === "op.raised");
      t.check("the op.raised row records op.round as pending (no webhook configured)", (J(raised?.Notify_Recipient) ?? []).some((h) => h.code === "op.round" && h.status === "pending" && /No webhook is configured/.test(h.detail ?? "")), raised?.Notify_Recipient);
      await t.go("/diagnostics");
      await t.seeTid("diagnostics");
      t.check("Diagnostics shows every hand-off as not configured", (await t.ui.locator('[data-testid^="diag-hook-"][data-configured="1"]').count()) === 0, await t.ui.locator('[data-testid^="diag-hook-"][data-configured="1"]').count());
    }),
  "ba-config-access": () =>
    scenario("ba-config-access", async (t) => {
      // 26 Oct: the configuration editor is live for the Business administrator (was ba-config-readonly, FE-CLEANUP A7 /
      // A16): no read-only banner, the edit controls are there, Test rules stays; looking writes nothing
      const EDIT = '[data-testid="config-discard-draft"], [data-testid="config-check-publish"], [data-testid="config-create-version"], [data-testid="rule-add"], [data-testid^="rule-edit-"], [data-testid^="rule-delete-"], [data-testid="view-draft"], [data-testid="section-add"], [data-testid^="section-retire-"], [data-testid^="section-restore-"], [data-testid^="owner-restore-"], button[data-testid^="owner-cell-"], [data-testid^="reminder-toggle-"]';
      for (const env of ["dev", "prod"]) {
        await open(t, { roles: "admin", ...(env === "prod" ? { env } : {}) });
        t.check(`${env}: lands on /admin/rules`, (await t.hash()).startsWith("#/admin/rules"), await t.hash());
        await t.seeTid("rules-tab", `${env}: the rule table renders`);
        t.check(`${env}: no read-only banner any more`, (await t.tid("config-readonly-banner").count()) === 0 && !(await mainText(t)).includes("In this version the configuration is read-only"));
        t.check(`${env}: the config rows were read`, (await t.calls((c) => c.command === "DATAFORM_GET_ITEMS" && c.flowId === F.config)).length > 0);
        t.check(`${env}: the rules come from the configuration rows (R-111, only in the RS-2026.2 row, is listed)`, (await t.tid("rule-row-R-111").count()) > 0);
        t.check(`${env}: the prepared draft from the rows is shown`, (await t.tid("config-draft-bar").getAttribute("data-draft")) === "true");
        t.check(`${env}: the version panel says “Only what you change gets a new version number.”`, (await t.tid("config-draft-bar").innerText()).includes("Only what you change"), await t.tid("config-draft-bar").innerText());
        const controls = async () => t.ui.locator(EDIT).count();
        t.check(`${env}: Rules: the edit controls (discard, publish, add, edit, delete)`, (await t.tid("config-discard-draft").count()) > 0 && (await t.tid("config-check-publish").count()) > 0 && (await t.ui.locator('[data-testid^="rule-edit-"]').count()) > 0, await controls());
        await noBasis(t, `${env}: Rules`);
        await t.tid("rule-row-R-111").first().scrollIntoViewIfNeeded().catch(() => {});
        await t.shot(`${env}-rules`);
        await t.tid("rules-tab-test").click();
        await t.seeTid("test-rules", `${env}: Test rules opens`);
        for (const [route, label, sel] of [["/admin/templates", "Questionnaire", '[data-testid="section-add"]'], ["/admin/ownership", "Section owners", 'button[data-testid^="owner-cell-"]'], ["/admin/notifications", "Reminders", '[data-testid^="reminder-toggle-"]']]) {
          await t.go(route);
          await t.page.waitForTimeout(300);
          t.check(`${env}: ${label}: edit controls`, (await t.ui.locator(sel).count()) > 0, await t.ui.locator(sel).count());
        }
        t.check(`${env}: Reminders: the day fields can be changed`, (await t.ui.locator('input[data-testid^="reminder-after-"]:not([disabled]), [data-testid^="reminder-after-"] input:not([disabled])').count()) > 0);
        await t.page.waitForTimeout(500);
        t.check(`${env}: zero writes by looking`, (await writes(t)).length === 0, summary(await writes(t)));
      }
    }),
  "ba-config-live": () =>
    scenario("ba-config-live", async (t) => {
      // 26 Oct: the Business administrator's configuration editor writes CIQ Config Version rows (write/config.ts);
      // the user also holds RMM, so New case on the new pair runs in the same emulated Kissflow (one page, one db)
      await open(t, { roles: "admin,rmm" });
      await asPersona(t, "admin");
      await t.go("/admin/rules");
      await t.seeTid("config-draft-bar");
      const audits0 = (await t.rows(F.audit)).length;
      const rows0 = (await t.rows(F.config)).length;
      // 1. discard the seed's prepared draft: RS, TPL, then REL to Retired, no Published_At, nothing deleted
      let from = (await t.calls()).length;
      await t.tid("config-discard-draft").click();
      await t.seeTid("config-discard-modal");
      await t.act("config-discard-confirm");
      let w = await cfgWrites(t, from);
      t.check("discard: RS, TPL, then REL → Retired (only Config_State)", w.join(" | ") === DRAFT_KEYS.map((k) => `UPDATE_ITEM ${k} Config_State`).join(" | "), w);
      const retired = await Promise.all(DRAFT_KEYS.map((k) => cfgRow(t, k)));
      t.check("… Retired with no Published_At; nothing deleted", retired.every((r) => r?.Config_State === "Retired" && !r.Published_At) && (await t.rows(F.config)).length === rows0, retired.map((r) => [r?.Config_State, r?.Published_At]));
      t.check("… the screen has no draft", (await t.tid("config-draft-bar").getAttribute("data-draft")) === "false");
      t.check("… one config.draft.discarded row (Configuration, no case)", codes(await auditSince(t, audits0)).join() === "config.draft.discarded" && (await auditSince(t, audits0)).every((r) => r.Event_Category === "Configuration" && !r.Case_Code));
      // 2. a new version: the three discarded rows are reused (no new row), as Draft, REL last
      from = (await t.calls()).length;
      await t.tid("config-create-version").click();
      await t.seeTid("config-create-modal");
      await t.fillText("config-create-note", "Fictional ZZT harness version");
      await t.act("config-create-confirm");
      w = await cfgWrites(t, from);
      t.check("create: RS, TPL, then REL updated back to Draft (the discarded rows reused)", w.map((x) => x.split(" ").slice(0, -1).join(" ")).join(" | ") === DRAFT_KEYS.map((k) => `UPDATE_ITEM ${k}`).join(" | "), w);
      t.check("… no new row, every key a Draft again", (await t.rows(F.config)).length === rows0 && (await Promise.all(DRAFT_KEYS.map((k) => cfgRow(t, k)))).every((r) => r.Config_State === "Draft"));
      t.check("… the screen shows the draft", (await t.tid("config-draft-bar").getAttribute("data-draft")) === "true");
      // 3. a rule: R-12 is reviewed by Sustainability too → RS and REL only
      await t.go("/admin/rules");
      await t.tid("rule-edit-R-12").click();
      await t.seeTid("rule-form", "the rule editor opens");
      if ((await t.tid("rule-dept-SUS").getAttribute("aria-pressed")) !== "true") await t.tid("rule-dept-SUS").click();
      from = (await t.calls()).length;
      await t.act("rule-save");
      w = await cfgWrites(t, from);
      t.check("a rule change writes RS and REL only (payload and hashes)", w.join(" | ") === [`UPDATE_ITEM RS:RS-2026.2 ${CONTENT.rs}`, `UPDATE_ITEM REL:RS-2026.2 + v2 ${CONTENT.rel}`].join(" | "), w);
      // 4. a question of K1 → TPL and REL only
      await t.go("/admin/templates");
      await t.tid("section-row-K1").click();
      await t.seeTid("section-editor");
      const k1 = JSON.parse((await cfgRow(t, "TPL:CIQ-2026 v2")).Payload_JSON).sections.find((x) => x.id === "K1").fields[0];
      await t.tid(`field-edit-${k1.id}`).click();
      await t.seeTid("field-form", `the question editor opens (${k1.id})`);
      await t.fillText("field-label", `${k1.label} (fictional harness edit)`);
      from = (await t.calls()).length;
      await t.act("field-save");
      w = await cfgWrites(t, from);
      t.check("a question change writes TPL and REL only", w.join(" | ") === [`UPDATE_ITEM TPL:CIQ-2026 v2 ${CONTENT.rs}`, `UPDATE_ITEM REL:RS-2026.2 + v2 ${CONTENT.rel}`].join(" | "), w);
      await t.tid("section-editor-close").click().catch(() => {});
      t.check("draft edits leave no audit row", codes(await auditSince(t, audits0)).join() === "config.draft.discarded,config.draft.created", codes(await auditSince(t, audits0)));
      await t.shot("draft");
      // 5. publish with a change note: RS, TPL, then REL to Published (REL last), Published_At without ms
      await t.tid("config-check-publish").click();
      await t.seeTid("publish-modal");
      await t.fillText("publish-note", "Fictional harness release: R-12 reviewed by Sustainability; K1 question reworded.");
      from = (await t.calls()).length;
      await t.act("publish-submit");
      w = await cfgWrites(t, from);
      t.check("publish: RS, TPL, then REL (last) → Published", w.length === 3 && DRAFT_KEYS.every((k, i) => w[i].startsWith(`UPDATE_ITEM ${k} `)) && w.every((x) => /Config_State/.test(x) && /Published_At/.test(x) && /Change_Note/.test(x) && /Published_By/.test(x)), w);
      const pub = await Promise.all(DRAFT_KEYS.map((k) => cfgRow(t, k)));
      t.check("… Published, Published_At a Kissflow DateTime without ms, the change note, Published_By the signed-in user", pub.every((r) => r.Config_State === "Published" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.Published_At) && r.Change_Note.startsWith("Fictional harness release") && r.Published_By?._id === FX.users.admin._id), pub.map((r) => [r.Config_State, r.Published_At, r.Published_By]));
      t.check("every CIQ Config Version row's content matches its fingerprints", (await t.rows(F.config)).every(fingerprintOk), (await t.rows(F.config)).filter((r) => !fingerprintOk(r)).map((r) => r.Config_Key));
      t.check("one config.published row", codes(await auditSince(t, audits0)).join() === "config.draft.discarded,config.draft.created,config.published");
      t.check("its success toast", !!(await t.waitToast(/published/i)), await t.toastLog());
      await t.shot("published");
      // 6. RMM: New case starts on the new pair; an older case keeps its pinned pair
      await asPersona(t, "rmm");
      const cases = (await t.rows(F.case)).map((x) => x._id);
      await t.go("/cases/new");
      await t.seeTid("newcase-form", "the New case form");
      t.check("New case offers RS-2026.2 with questionnaire v2", (await t.tid("newcase-rule-set").innerText()).includes("RS-2026.2") && (await t.tid("newcase-template-version").innerText()).includes("CIQ-2026 v2"), [await t.tid("newcase-rule-set").innerText(), await t.tid("newcase-template-version").innerText()]);
      await t.fillText("newcase-material", "HELIOSOFT 310");
      await t.fillText("newcase-inci", "Helianthus Annuus Seed Oil");
      await t.fillText("newcase-material-no", "RM-405310");
      await t.tid("newcase-supplier-SUP-ZZT-SOLVARO").click();
      await t.seeTid("newcase-contacts");
      await t.act("newcase-submit");
      const item = (await t.rows(F.case)).find((x) => !cases.includes(x._id));
      const rel = await cfgRow(t, "REL:RS-2026.2 + v2");
      t.must("the case was created", !!item);
      t.check("… pinned to RS-2026.2 + CIQ-2026 v2 with the new release's manifest", item.Rule_Set_Version === "RS-2026.2" && item.Template_Version === "CIQ-2026 v2" && J(item.Release_Manifest_JSON)?.bundleHash === rel.Content_Hash, [item.Rule_Set_Version, item.Template_Version]);
      const old = await t.item(CASE3);
      t.check("ZZT-0003 keeps the pair it started on", old.Rule_Set_Version === "RS-2026.1" && old.Template_Version === "CIQ-2026 v1", [old.Rule_Set_Version, old.Template_Version]);
      await t.go("/cases/ZZT-0003");
      await t.page.waitForTimeout(400);
      t.check("… and shows no pin warning", (await t.tid("case-pin-banner").count()) === 0);
      await t.shot("new-case");
      // 7. BA: a section owner (OWN:current) and a reminder (REM:current), one row each
      await asPersona(t, "admin");
      await t.go("/admin/ownership");
      await t.seeTid("owner-cell-K1-SUS");
      from = (await t.calls()).length;
      await t.act("owner-cell-K1-SUS");
      w = await cfgWrites(t, from);
      const own = JSON.parse((await cfgRow(t, "OWN:current")).Payload_JSON).ownership.K1;
      t.check("a section owner writes OWN:current (payload and hash) only", w.join(" | ") === `UPDATE_ITEM OWN:current ${CONTENT.rs}` && own.co.includes("SUS"), [w, own]);
      await t.shot("owners");
      await t.go("/admin/notifications");
      const rem = JSON.parse((await cfgRow(t, "REM:current")).Payload_JSON).reminders[0];
      from = (await t.calls()).length;
      await t.act(`reminder-toggle-${rem.id}`);
      w = await cfgWrites(t, from);
      const rem2 = JSON.parse((await cfgRow(t, "REM:current")).Payload_JSON).reminders[0];
      t.check("a reminder writes REM:current only", w.join(" | ") === `UPDATE_ITEM REM:current ${CONTENT.rs}` && rem2.enabled === !rem.enabled, [w, rem.enabled, rem2.enabled]);
      await t.shot("reminders");
      const rows = await auditSince(t, audits0);
      t.check("one audit row per committed change, Configuration, no case, with the domain's log", codes(rows).filter((c) => c.startsWith("config.")).join() === "config.draft.discarded,config.draft.created,config.published,config.ownership.changed,config.reminders.changed" && rows.filter((r) => r.Action_Code.startsWith("config.")).every((r) => r.Event_Category === "Configuration" && !r.Case_Code && (J(r.Snapshot_JSON)?.log ?? []).length > 0), codes(rows));
      t.check("every CIQ Config Version row still matches its fingerprints", (await t.rows(F.config)).every(fingerprintOk));
      t.check("no write refused", (await refusedCalls(t)).length === 0, await refusedCalls(t));
    }),
  "ba-config-refused": () =>
    scenario("ba-config-refused", async (t) => {
      // the Business administrator's form rights refused (production): the plain text, nothing changed
      await open(t, { roles: "admin", env: "prod", refuse: "DATAFORM_UPDATE_ITEM@config" });
      const audits0 = (await t.rows(F.audit)).length;
      const n = (await t.toastLog()).length;
      await t.tid("config-discard-draft").click();
      await t.seeTid("config-discard-modal");
      await t.act("config-discard-confirm");
      const toast = await t.waitToast(/Kissflow refused/, n);
      t.check("the rights text", toast === "Not saved: Kissflow refused to save the configuration for your role. Ask the app admin to grant Business administrator create and edit on the CIQ Config Version form.", toast);
      t.check("… with no technical token", !!toast && techIn(toast).length === 0, techIn(toast ?? ""));
      t.check("the write was refused by Kissflow, nothing else was written", (await refusedCalls(t)).length === 1 && (await auditSince(t, audits0)).length === 0, await refusedCalls(t));
      t.check("the draft is still there (screen and rows)", (await t.tid("config-draft-bar").getAttribute("data-draft")) === "true" && (await cfgRow(t, "REL:RS-2026.2 + v2")).Config_State === "Draft");
      await t.shot("refused");
    }),
  "ba-suppliers": () =>
    scenario("ba-suppliers", async (t) => {
      await open(t, { roles: "admin" });
      const audits = (await t.rows(F.audit)).length;
      await t.go("/suppliers/SUP-ZZT-SOLVARO");
      await t.seeTid("supplier-title", "the supplier master: Solvaro");
      await t.see("Joana Pires", "its contacts from the Contacts rows (also one without a portal user)");
      const from = (await t.calls()).length;
      await t.tid("contact-add").click();
      await t.fillText("contact-name", "Marta Soler");
      await t.fillText("contact-email", "marta.soler@solvaro.example");
      await t.fillText("contact-title", "Quality Engineer");
      await t.act("contact-save");
      const up = (await t.calls((c) => c.seq >= from && c.command === "DATAFORM_UPDATE_ITEM" && c.flowId === F.supplier && !c.refused))[0];
      t.check("the contact is added as a Table::Contacts row of the supplier", !!up && up.keys.includes("Table::Contacts") && /Marta Soler/.test(up.data), up && up.keys);
      const row = ((await t.rows(F.supplier)).find((x) => x.Supplier_Code === "SUP-ZZT-SOLVARO")?.["Table::Contacts"] ?? []).find((r) => r.Contacts_Full_Name === "Marta Soler");
      t.check("Kissflow holds the new row (e-mail, may confirm)", row && row.Contacts_Email === "marta.soler@solvaro.example" && !!row.Contacts_Can_Confirm, row);
      const rows = await auditSince(t, audits);
      t.check("one supplier.changed audit row, no case code, with the log", codes(rows).join() === "supplier.changed" && !rows[0].Case_Code && (J(rows[0].Snapshot_JSON)?.log ?? []).length > 0, rows.map((r) => [r.Action_Code, r.Case_Code, r.Event_Category]));
      await t.see("Marta Soler", "the contact is listed after the reload");
      t.check("no write refused", (await refusedCalls(t, from)).length === 0, await refusedCalls(t, from));
    }),
  "dev-portal-user": () =>
    scenario("dev-portal-user", async (t) => {
      // 26 Oct (Thomas): a holder of Admin / Developer links a supplier contact to its supplier-portal user on the
      // Business administrator's supplier screen; New case was refused for Nordhafen (its only contact has none) and
      // goes ahead afterwards. The data console's Portal users panel sets another contact. Without the role: no field.
      const ID = "UsZztHenrik01";
      await open(t, { roles: "admin,rmm,developer" });
      await asPersona(t, "admin");
      await t.go("/suppliers/SUP-ZZT-NORDHAFEN");
      await t.seeTid("supplier-title", "Nordhafen's supplier page");
      const audits0 = (await t.rows(F.audit)).length;
      await t.tid("contact-edit-contact:c-henrik").click();
      await t.seeTid("contact-portal-user", "the contact editor offers the Portal user ID (Admin / Developer)");
      await t.fillText("contact-portal-user", "Henrik Lund");
      await t.see("A Kissflow user id has no spaces", "a name is refused as a portal user id");
      await t.fillText("contact-portal-user", "henrik.lund");
      await t.see("Enter the Kissflow user id", "… and so is anything not shaped like a Kissflow user id");
      await t.fillText("contact-portal-user", FX.contacts.elena._id);
      await t.see("This portal user is already linked to Elena", "another contact's portal user is refused");
      await t.fillText("contact-portal-user", `  ${ID} `);
      const from = (await t.calls()).length;
      await t.act("contact-save");
      const up = await writes(t, (c) => c.seq >= from && c.flowId === F.supplier);
      t.check("one write: a Table::Contacts delta with only _id and Contacts_Portal_User_Id (trimmed)", up.length === 1 && up[0].command === "DATAFORM_UPDATE_ITEM" && JSON.stringify(J(up[0].data)) === JSON.stringify({ "Table::Contacts": [{ _id: "Contacts_chenrik", Contacts_Portal_User_Id: ID }] }), up.map((c) => c.data));
      t.check("… read back", (await t.calls((c) => c.seq > up[0].seq && c.command === "DATAFORM_GET_ITEM" && c.flowId === F.supplier)).length > 0);
      const row = ((await t.rows(F.supplier)).find((x) => x.Supplier_Code === "SUP-ZZT-NORDHAFEN")?.["Table::Contacts"] ?? []).find((r) => r._id === "Contacts_chenrik");
      t.check("Kissflow holds the link", row?.Contacts_Portal_User_Id === ID, row);
      const rows = await auditSince(t, audits0);
      t.check("one supplier.changed row, its log says linked (no id in the text)", codes(rows).join() === "supplier.changed" && (J(rows[0].Snapshot_JSON)?.log ?? [])[0]?.action === "Linked portal user" && !String(rows[0].New_Value_Text).includes(ID), rows.map((r) => r.New_Value_Text));
      t.check("its toast", !!(await t.waitToast(/Henrik Lund is linked to the supplier-portal user/)), await t.toastLog());
      await t.seeTid(`contact-row-${ID}`, "after the reload the contact is its portal user");
      await t.shot("linked");
      // RMM: New case for Nordhafen goes ahead now
      await asPersona(t, "rmm");
      const cases = (await t.rows(F.case)).map((x) => x._id);
      await t.go("/cases/new");
      await t.seeTid("newcase-form");
      await t.fillText("newcase-material", "NORDHAFEN TALC 20");
      await t.fillText("newcase-inci", "Talc");
      await t.fillText("newcase-material-no", "RM-700020");
      await t.tid("newcase-supplier-SUP-ZZT-NORDHAFEN").click();
      await t.seeTid("newcase-contacts", "Nordhafen's contact is offered");
      const n = (await t.toastLog()).length;
      await t.act("newcase-submit");
      const kase = (await t.rows(F.case)).find((x) => !cases.includes(x._id));
      t.check("New case is no longer refused (no “has a portal user” toast)", !(await t.toastLog()).slice(n).some((x) => /portal user/.test(x)), (await t.toastLog()).slice(n));
      t.check("… the case is created for Henrik's portal user", kase?.Supplier_Code === "SUP-ZZT-NORDHAFEN" && kase.Portal_Contact_Ids === ID, kase && [kase.Supplier_Code, kase.Portal_Contact_Ids]);
      await t.shot("new-case");
      // the data console: the Portal users panel of Solvaro sets Joana's (she has none)
      await t.tid("nav-data").click();
      await t.seeTid("data-overview");
      await t.go("/data/flow/supplier");
      await t.seeTid("data-row-PkSupSolvaro");
      await t.tid("data-row-PkSupSolvaro").click();
      await t.seeTid("data-portal-users", "a supplier item shows its contacts' portal users");
      t.check("… Joana has none", (await t.tid("data-portal-row-Contacts_cjoana").getAttribute("data-portal")) === "");
      await t.tid("data-portal-edit-Contacts_cjoana").click();
      await t.fillText("data-portal-input-Contacts_cjoana", "UsZztJoana01");
      const from2 = (await t.calls()).length;
      await t.tid("data-portal-save-Contacts_cjoana").click();
      await t.waitText("saved and read back");
      const up2 = await writes(t, (c) => c.seq >= from2 && c.flowId === F.supplier);
      t.check("the console writes the same delta and reads it back", up2.length === 1 && JSON.stringify(J(up2[0].data)) === JSON.stringify({ "Table::Contacts": [{ _id: "Contacts_cjoana", Contacts_Portal_User_Id: "UsZztJoana01" }] }) && (await t.tid("data-portal-row-Contacts_cjoana").getAttribute("data-portal")) === "UsZztJoana01", up2.map((c) => c.data));
      await t.shot("console");
      t.check("no write refused", (await refusedCalls(t)).length === 0, await refusedCalls(t));
      // without Admin / Developer: the Business administrator sees the id read-only, cannot change it
      await open(t, { roles: "admin" }, "/suppliers/SUP-ZZT-SOLVARO");
      await t.seeTid("supplier-title");
      await t.tid(`contact-edit-${FX.contacts.elena._id}`).click();
      await t.seeTid("contact-portal-user-readonly", "the Business administrator alone sees Elena's portal user read-only");
      t.check("… and has no field to change it", (await t.tid("contact-portal-user").count()) === 0);
    }),
  "ba-supplier-country": () =>
    scenario("ba-supplier-country", async (t) => {
      // 26 Oct (Thomas): live, Supplier_Country_Code is a Kissflow Select on CIQ_Country_Code_A00 and a value outside it
      // is stored EMPTY, so the supplier form offers a dropdown of exactly that list (read once a session, the 32 codes
      // built in), by name; the writer sends the code. A supplier whose country the list does not hold shows it marked
      // and is asked for a listed one. A country added to the Kissflow list appears without a rebuild.
      await open(t, { roles: "admin" }, "/suppliers");
      await t.tid("supplier-add").click();
      await t.seeTid("supplier-country", "Add supplier: the country");
      t.check("… is a dropdown, no text box", (await t.tid("supplier-country").evaluate((e) => `${e.tagName}|${e.getAttribute("role")}`)) === "BUTTON|combobox");
      await t.page.waitForTimeout(400);
      const field = t.tid("supplier-country-field");
      t.check("… of Kissflow's list as read this session: 32 countries", (await field.getAttribute("data-country-source")) === "kissflow" && (await field.getAttribute("data-country-count")) === "32", [await field.getAttribute("data-country-source"), await field.getAttribute("data-country-count")]);
      const reads = await t.page.evaluate(() => window.__kfListReads ?? []);
      t.check("… one read of the list's items by the API route", reads.length === 1 && reads[0].startsWith("/flow/2/AcDOSunMEpSA/list/CIQ_Country_Code_A00/items"), reads);
      await t.tid("supplier-country").click();
      const names = (await t.ui.getByRole("option").allTextContents()).map((x) => x.trim());
      t.check("the options: a prompt, then the 32 countries by name (one name per code)", names.length === 33 && /^Choose a country/.test(names[0]) && ["United Kingdom", "Czechia", "United States", "Spain", "Turkey", "Canada"].every((n) => names.includes(n)) && !names.includes("Brazil") && !names.includes("USA"), names);
      await t.tid("supplier-country-option-United Kingdom").click();
      await t.fillText("supplier-name", "Brenna Lipids Ltd");
      await t.fillText("supplier-duns", "583 920 174");
      await t.fillText("supplier-city", "Hull");
      await t.fillText("contact-name-0", "Femke de Vries");
      await t.fillText("contact-email-0", "femke.devries@brenna.example");
      const from = (await t.calls()).length;
      await t.act("supplier-save");
      const create = (await t.calls((c) => c.seq >= from && c.command === "DATAFORM_CREATE_ITEM" && c.flowId === F.supplier))[0];
      t.check("the new supplier is written with the code GB", J(create?.data)?.Supplier_Country_Code === "GB", J(create?.data)?.Supplier_Country_Code);
      const row = (await t.rows(F.supplier)).find((x) => x.Supplier_Legal_Name === "Brenna Lipids Ltd");
      t.check("… and Kissflow holds it", row?.Supplier_Country_Code === "GB", row?.Supplier_Country_Code);
      await t.see("United Kingdom", "its page names the country");
      // an existing supplier: its stored code shows as the list's name
      await t.go("/suppliers/SUP-ZZT-SOLVARO");
      await t.tid("supplier-edit").click();
      await t.seeTid("supplier-country");
      t.check("Edit Solvaro: the stored ES is “Spain”", (await t.tid("supplier-country").getAttribute("data-value")) === "Spain", await t.tid("supplier-country").getAttribute("data-value"));
      await t.ui.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      // older data: a country the list does not hold
      await t.set("PkSupNordhafen", { Supplier_Country_Code: "BR" });
      await t.reload();
      await t.go("/suppliers/SUP-ZZT-NORDHAFEN");
      await t.tid("supplier-edit").click();
      await t.seeTid("supplier-country");
      await t.see("Brazil (not in the country list)", "Edit Nordhafen: its country shows as a selected extra option, marked");
      const from2 = (await t.calls()).length;
      await t.tid("supplier-save").click();
      await t.page.waitForTimeout(300);
      await t.see("Brazil is not in the country list. Choose a country from the list.", "… and the form asks for a listed country before saving");
      t.check("… nothing written", (await writes(t, (c) => c.seq >= from2 && c.flowId === F.supplier)).length === 0);
      await t.tid("supplier-country").click();
      await t.tid("supplier-country-option-Austria").click();
      await t.act("supplier-save");
      t.check("a listed country chosen: saved as its code", (await t.rows(F.supplier)).find((x) => x._id === "PkSupNordhafen")?.Supplier_Country_Code === "AT");
      t.check("no write refused", (await refusedCalls(t)).length === 0, await refusedCalls(t));
      await t.shot("edit");
      // a country added to the Kissflow list appears without a rebuild, and is written as its code
      await open(t, { roles: "admin", countries: "NO" }, "/suppliers");
      await t.tid("supplier-add").click();
      await t.seeTid("supplier-country");
      await t.page.waitForTimeout(400);
      t.check("countries=NO: 33 countries", (await t.tid("supplier-country-field").getAttribute("data-country-count")) === "33");
      await t.tid("supplier-country").click();
      t.must("… Norway among them", (await t.tid("supplier-country-option-Norway").count()) === 1);
      await t.tid("supplier-country-option-Norway").click();
      await t.fillText("supplier-name", "Fjord Esters AS");
      await t.fillText("supplier-duns", "583 920 182");
      await t.fillText("contact-name-0", "Ola Nordmann");
      await t.fillText("contact-email-0", "ola.nordmann@fjord.example");
      await t.act("supplier-save");
      t.check("… saved as NO", (await t.rows(F.supplier)).find((x) => x.Supplier_Legal_Name === "Fjord Esters AS")?.Supplier_Country_Code === "NO");
      // the list's route refused: the built-in 32, the form never waits
      await open(t, { roles: "admin", countries: "none" }, "/suppliers");
      await t.tid("supplier-add").click();
      await t.seeTid("supplier-country");
      await t.page.waitForTimeout(400);
      t.check("countries=none (route refused): the built-in 32", (await t.tid("supplier-country-field").getAttribute("data-country-source")) === "built-in" && (await t.tid("supplier-country-field").getAttribute("data-country-count")) === "32");
    }),
  "dev-supplier-portal-users": () =>
    scenario("dev-supplier-portal-users", async (t) => {
      // 26 Oct (Thomas): "by design the ability to add one portal user id is wrong per supplier; we need to have that in
      // the child table". A developer + Business administrator adds a supplier with two contacts, each with its own
      // portal user id (the first with the signed-in user's own e-mail: no longer refused); RMM's New case is not
      // refused and lists both; Edit supplier changes one contact's id (one delta); without the role: no column.
      await open(t, { roles: "admin,rmm,developer" });
      await asPersona(t, "admin");
      await t.go("/suppliers");
      await t.tid("supplier-add").click();
      await t.seeTid("contact-portal-0", "Add supplier: the contact row has its own Portal user ID (Admin / Developer)");
      await t.fillText("supplier-name", "Brenna Lipids B.V.");
      await t.fillText("supplier-duns", "583920174");
      await t.tid("supplier-country").click();
      await t.tid("supplier-country-option-Netherlands").click();
      await t.fillText("supplier-city", "Rotterdam");
      await t.fillText("contact-name-0", "Femke de Vries");
      await t.fillText("contact-email-0", FX.users.admin.Email);
      await t.fillText("contact-title-0", "Regulatory Lead");
      await t.fillText("contact-portal-0", " UsZztFemke01");
      await t.tid("contact-add-row").click();
      await t.seeTid("contact-portal-1", "… and so has the second row");
      await t.fillText("contact-name-1", "Joost Bakker");
      await t.fillText("contact-email-1", "joost.bakker@brenna.example");
      await t.fillText("contact-portal-1", "UsZztFemke01");
      await t.see("Two contacts have the same portal user ID", "two rows with one portal user id are refused");
      await t.fillText("contact-portal-1", FX.contacts.elena._id);
      await t.see("This portal user is already linked to Elena", "… and so is another supplier's contact's");
      await t.fillText("contact-portal-1", "UsZztJoost01");
      const audits0 = (await t.rows(F.audit)).length;
      const from = (await t.calls()).length;
      const n = (await t.toastLog()).length;
      await t.act("supplier-save");
      t.check("the signed-in user's own e-mail as a contact is not refused", !(await t.toastLog()).slice(n).some((x) => /already used by/.test(x)) && (await t.tid("supplier-errors").count()) === 0, (await t.toastLog()).slice(n));
      const create = (await t.calls((c) => c.seq >= from && c.command === "DATAFORM_CREATE_ITEM" && c.flowId === F.supplier))[0];
      const sent = J(create?.data)?.["Table::Contacts"] ?? [];
      t.check("one supplier row, each contact row with its own Contacts_Portal_User_Id (trimmed)", JSON.stringify(sent.map((r) => [r.Contacts_Full_Name, r.Contacts_Portal_User_Id])) === JSON.stringify([["Femke de Vries", "UsZztFemke01"], ["Joost Bakker", "UsZztJoost01"]]), sent);
      const row = (await t.rows(F.supplier)).find((x) => x.Supplier_Legal_Name === "Brenna Lipids B.V.");
      t.must("Kissflow holds the supplier", !!row);
      const code = row.Supplier_Code;
      const rows = await auditSince(t, audits0);
      t.check("one supplier.changed row: added, and each portal user linked (no id in the text)", codes(rows).join() === "supplier.changed" && JSON.stringify((J(rows[0].Snapshot_JSON)?.log ?? []).map((e) => e.action)) === JSON.stringify(["Added supplier", "Linked portal user", "Linked portal user"]) && !/UsZzt/.test(String(rows[0].New_Value_Text)), rows.map((r) => [r.Action_Code, r.New_Value_Text]));
      await t.seeTid("contact-row-UsZztFemke01", "after the reload each contact is its portal user");
      await t.seeTid("contact-row-UsZztJoost01");
      await t.shot("added");
      // RMM: New case lists both contacts and is not refused
      await asPersona(t, "rmm");
      const cases = (await t.rows(F.case)).map((x) => x._id);
      await t.go("/cases/new");
      await t.seeTid("newcase-form");
      await t.fillText("newcase-material", "BRENNA SOFT 12");
      await t.fillText("newcase-inci", "Caprylic/Capric Triglyceride");
      await t.fillText("newcase-material-no", "RM-700012");
      await t.tid(`newcase-supplier-${code}`).click();
      await t.seeTid("newcase-contact-UsZztFemke01", "New case lists Femke");
      await t.seeTid("newcase-contact-UsZztJoost01", "… and Joost");
      const n2 = (await t.toastLog()).length;
      await t.act("newcase-submit");
      const kase = (await t.rows(F.case)).find((x) => !cases.includes(x._id));
      t.check("New case is not refused (no “portal user” toast)", !(await t.toastLog()).slice(n2).some((x) => /portal user/.test(x)), (await t.toastLog()).slice(n2));
      t.check("… the case goes to both portal users; Femke may confirm", kase?.Supplier_Code === code && kase.Portal_Contact_Ids === "UsZztFemke01,UsZztJoost01" && kase.Confirm_Contact_Ids === "UsZztFemke01,UsZztJoost01", kase && [kase.Portal_Contact_Ids, kase.Confirm_Contact_Ids]);
      // Edit supplier: each existing contact's portal user; one change = one delta with only _id and the id
      await asPersona(t, "admin");
      await t.go(`/suppliers/${code}`);
      await t.tid("supplier-edit").click();
      await t.seeTid("supplier-portal-users", "Edit supplier shows the contacts' portal users");
      t.check("… with their ids", (await t.value("supplier-portal-input-UsZztFemke01")) === "UsZztFemke01" && (await t.value("supplier-portal-input-UsZztJoost01")) === "UsZztJoost01");
      await t.fillText("supplier-portal-input-UsZztJoost01", "UsZztFemke01");
      await t.see("Two contacts have the same portal user ID", "… one contact can't take the other's");
      await t.fillText("supplier-portal-input-UsZztJoost01", "UsZztJoost02");
      const audits1 = (await t.rows(F.audit)).length;
      const from3 = (await t.calls()).length;
      await t.act("supplier-save");
      const up = await writes(t, (c) => c.seq >= from3 && c.flowId === F.supplier);
      const joostRow = (await t.rows(F.supplier)).find((x) => x.Supplier_Code === code)?.["Table::Contacts"]?.find((r) => r.Contacts_Full_Name === "Joost Bakker");
      t.check("one write: a Table::Contacts delta with only _id and Contacts_Portal_User_Id", up.length === 1 && up[0].command === "DATAFORM_UPDATE_ITEM" && JSON.stringify(J(up[0].data)) === JSON.stringify({ "Table::Contacts": [{ _id: joostRow?._id, Contacts_Portal_User_Id: "UsZztJoost02" }] }), up.map((c) => c.data));
      t.check("… Kissflow holds it, one supplier.changed row", joostRow?.Contacts_Portal_User_Id === "UsZztJoost02" && codes(await auditSince(t, audits1)).join() === "supplier.changed");
      await t.seeTid("contact-row-UsZztJoost02", "after the reload Joost is his new portal user");
      t.check("no write refused", (await refusedCalls(t)).length === 0, await refusedCalls(t));
      await t.shot("edited");
      // without Admin / Developer: no portal user column anywhere on the supplier forms
      await open(t, { roles: "admin" }, "/suppliers");
      await t.tid("supplier-add").click();
      await t.seeTid("contact-name-0");
      t.check("the Business administrator alone: no Portal user ID on the rows", (await t.tid("contact-portal-0").count()) === 0 && (await t.tid("contact-portal-hint").count()) === 0);
      await t.ui.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await t.go("/suppliers/SUP-ZZT-SOLVARO");
      await t.tid("supplier-edit").click();
      await t.seeTid("supplier-country");
      t.check("… nor on Edit supplier", (await t.tid("supplier-portal-users").count()) === 0);
    }),
  "rmm-empty": () =>
    scenario("rmm-empty", async (t) => {
      await open(t, { roles: "rmm", empty: "1" });
      t.check("lands on the RMM dashboard", (await t.hash()).startsWith("#/rmm"), await t.hash());
      await t.notSee("could not be loaded", "no load error");
      await t.go("/cases");
      await t.page.waitForTimeout(400);
      await t.go("/cases/new");
      await t.seeTid("newcase-form", "New case opens on an empty start");
      await t.page.waitForTimeout(500);
      t.check("zero writes (nothing to activate)", (await writes(t)).length === 0, summary(await writes(t)));
    }),
  "rmm-new-case": () =>
    scenario("rmm-new-case", async (t) => {
      await open(t, { roles: "rmm", hooks: "1" });
      t.check("no hand-off on the first load", (await t.hooks()).length === 0);
      const audits = (await t.rows(F.audit)).length;
      const cases = (await t.rows(F.case)).map((x) => x._id);
      await t.go("/cases/new");
      await t.seeTid("newcase-form", "the New case form");
      // a material no open case has (ZZT-0001 is OLIVIA Pure 100, RM-500123: that would ask why a second case)
      await t.fillText("newcase-material", "HELIOSOFT 200");
      await t.fillText("newcase-inci", "Helianthus Annuus Seed Oil");
      await t.fillText("newcase-material-no", "RM-405217");
      await t.tid("newcase-supplier-SUP-ZZT-SOLVARO").click();
      await t.seeTid("newcase-contacts", "Solvaro's contacts are offered");
      const from = (await t.calls()).length;
      await t.act("newcase-submit");
      const create = (await t.calls((c) => c.seq >= from && c.command === "PROCESS_CREATE_ITEM" && c.flowId === F.case))[0];
      t.must("one CIQ Case create", !!create && !create.refused, create?.refused);
      const keys = create.keys.split(",");
      const missing = FX.mandatory[FX.steps.case.start].filter((k) => !keys.includes(k));
      t.check("the create carries every Start Mandatory field (G-9)", missing.length === 0, missing);
      const payload = FX.caseStartFields.filter((k) => !keys.includes(k));
      t.check("… and the six fields caseStartPayload computes", payload.length === 0, payload);
      const item = (await t.rows(F.case)).find((x) => !cases.includes(x._id));
      t.must("Kissflow holds the new case", !!item);
      t.check("read back through its task, then submitted", (await writeSeq(t, "case", from)).join(" ") === "CREATE_ITEM SUBMIT_ITEM" && (await t.calls((c) => c.seq >= from && c.command === "PROCESS_GET_ITEM" && c.instanceId === item._id)).length > 0, await writeSeq(t, "case", from));
      t.check("the case moved on to “Waiting for supplier: CIQ” (I-1 takes it from there)", item._current_step === FX.stepNames[FX.steps.case.waiting], item._current_step);
      t.check("Owner_RMM, contacts and the BDF contact are the signed-in RMM's", item.Owner_RMM?._id === FX.users.rmm._id && item.BDF_Contact_Email === FX.users.rmm.Email && item.Portal_Contact_Ids === `${FX.contacts.elena._id},${FX.contacts.ravi._id}`, [item.Owner_RMM, item.BDF_Contact_Email, item.Portal_Contact_Ids]);
      t.check("Dates as yyyy-mm-dd, no milliseconds anywhere", /^\d{4}-\d{2}-\d{2}$/.test(item.Supplier_Due_Date) && msFields(item).length === 0, [item.Supplier_Due_Date, msFields(item)]);
      const rows = await auditSince(t, audits);
      const snap = J(rows[0]?.Snapshot_JSON);
      t.check("one case.created audit row with the header snapshot", codes(rows).join() === "case.created" && rows[0].Case_Item_Id === item._id && snap?.case?.caseId === item.Case_Code, rows.map((r) => r.Action_Code));
      const hooks = await t.hooks();
      t.check("one POST case.started {caseItemId} after the submit (I-1 creates the portal request from the case)", hooks.length === 1 && hooks[0].code === "case.started" && hooks[0].body.caseItemId === item._id && keysOf(hooks[0].body) === "caseItemId,idempotencyKey", hooks.map((h) => [h.code, h.body]));
      t.check("… by the browser's no-cors fetch (text/plain, the JSON text), and not again by the API route", hooks.length === 1 && byFetch(hooks[0]), hooks.map((h) => [h.route, h.mode, h.contentType]));
      const started = (J(rows[0]?.Notify_Recipient) ?? []).find((h) => h.code === "case.started");
      // the POST is fire-and-forget (APP-SAVING-GAPS gap 5): the row says it was handed over, not which route took it
      t.check("… recorded sent (handed over) on the case.created row, with the key it carried", started?.status === "sent" && started.detail === "handed over" && started.key === hooks[0]?.body.idempotencyKey, rows[0]?.Notify_Recipient);
      t.check("the UI opened the new case", (await t.hash()).startsWith(`#/cases/${item.Case_Code}`), await t.hash());
      t.check("its success toast", !!(await t.waitToast(new RegExp(`${item.Case_Code} created`))), await t.toastLog());
      t.check("no write refused", (await refusedCalls(t, from)).length === 0, await refusedCalls(t, from));
      await t.shot("case");
    }),
  "draft-send": () =>
    scenario("draft-send", async (t) => {
      // the submit of a new case fails: the writer leaves a draft, Diagnostics lists it, Send finishes it with its
      // case.created row (the case index of every other role)
      await open(t, { roles: "rmm", refuse: "PROCESS_SUBMIT_ITEM" });
      const cases = (await t.rows(F.case)).map((x) => x._id);
      const audits = (await t.rows(F.audit)).length;
      await t.go("/cases/new");
      await t.seeTid("newcase-form", "the New case form");
      await t.fillText("newcase-material", "HELIOSOFT 200");
      await t.fillText("newcase-inci", "Helianthus Annuus Seed Oil");
      await t.fillText("newcase-material-no", "RM-405217");
      await t.tid("newcase-supplier-SUP-ZZT-SOLVARO").click();
      const toasts = (await t.toastLog()).length;
      await t.act("newcase-submit");
      t.check("the toast says a draft was left and where to send it (A1: Unsent items, at the top of the page)", !!(await t.waitToast(/saved as a draft in Kissflow but not sent: .*KISSFLOW_ERROR.*[^.]\. Use Unsent items at the top of the page to send or discard it\.$/, toasts)), (await t.toastLog()).slice(toasts));
      t.check("A15: Kissflow's own full stop is not doubled", !(await t.toastLog()).slice(toasts).some((x) => /\.\./.test(x)), (await t.toastLog()).slice(toasts));
      const draft = (await t.rows(F.case)).find((x) => !cases.includes(x._id));
      t.must("Kissflow holds the draft", !!draft && draft._status === "Draft", draft?._status);
      t.check("no audit row for the unsent case", (await auditSince(t, audits)).length === 0);
      await t.page.evaluate(() => REFUSE.delete("PROCESS_SUBMIT_ITEM")); // the cause is fixed
      await t.seeTid("unsent-banner", "A1: the shell says there is an unsent item, on every page");
      await t.tid("unsent-open").click();
      await t.page.waitForTimeout(300);
      t.check("… and its link opens Diagnostics at Unsent items", (await t.hash()).startsWith("#/diagnostics") && (await t.hash()).endsWith("#drafts"), await t.hash());
      await t.seeTid(`diag-draft-${draft._id}`, "Diagnostics lists the unsent draft");
      await t.act(`diag-draft-send-${draft._id}`);
      const sent = (await t.rows(F.case)).find((x) => x._id === draft._id);
      t.check("Send submits it (“Waiting for supplier: CIQ”)", sent._current_step === FX.stepNames[FX.steps.case.waiting], sent._current_step);
      const rows = await auditSince(t, audits);
      t.check("… and writes its case.created row with the header", codes(rows).join() === "case.created" && J(rows[0].Snapshot_JSON)?.case?.itemId === draft._id, codes(rows));
      t.check("… with its case.started hand-off (pending: no webhook configured)", (J(rows[0]?.Notify_Recipient) ?? []).some((h) => h.code === "case.started" && h.status === "pending"), rows[0]?.Notify_Recipient);
      await t.page.waitForTimeout(300);
      t.check("the draft is no longer listed", (await t.tid(`diag-draft-${draft._id}`).count()) === 0);
    }),
  "rmm-activate": () =>
    scenario("rmm-activate", async (t) => {
      // 22 Oct (load-time redesign): I-2 starts the round-1 reviews at the confirmation (E-A, played by
      // playCompleteness); RMM's load starts nothing, and its screens show the reviews from E-A's one history row
      await open(t, { roles: "rmm", byid: "1" });
      t.check("nothing written on the first load", (await writes(t)).length === 0, summary(await writes(t)));
      await playCompleteness(t, CASE1);
      const reviews = (await t.rows(F.review)).filter((x) => x.Case_Item_Id === CASE1);
      t.must("I-2 (E-A, played) started ZZT-0001's reviews", reviews.length >= 2 && reviews.some((x) => x.Review_Dept === "RMM"), reviews.map((x) => x.Review_Dept));
      const from = (await t.calls()).length;
      await t.reload();
      t.check("RMM's load writes nothing (before: it created the reviews and a row each)", (await writes(t, (c) => c.seq >= from)).length === 0, summary(await writes(t, (c) => c.seq >= from)));
      t.check("Kissflow still holds exactly E-A's reviews", (await t.rows(F.review)).filter((x) => x.Case_Item_Id === CASE1).length === reviews.length);
      await t.go("/cases/ZZT-0001");
      await t.see("Review", "the case page shows the case in review");
      await t.notSee("The reviews start when the supplier confirms completeness.", "… with its reviews, not the waiting text");
      await t.tid("case-tab-history").first().click();
      await t.see(`Reviews started: ${["RMM", "REG", "SAF", "QM", "MIC", "SUS"].filter((d) => reviews.some((x) => x.Review_Dept === d)).map((d) => ({ RMM: "RMM", REG: "Regulatory", SAF: "Safety", QM: "QM", MIC: "Microbiology", SUS: "Sustainability" })[d]).join(", ")}.`, "the History shows E-A's one line");
    }),
  "saf-review": () =>
    scenario("saf-review", async (t) => {
      // one Kissflow user holding RMM and Product Safety: RMM activates ZZT-0001, then works as Safety. Since BDF's RMES
      // scope of 28 Oct: the RMES record is a header-only row, the RMES tab a read-only sheet of 8 fields derived from
      // the case, and the Safety decision sits on the Questionnaire tab
      await open(t, { roles: "rmm,saf", byid: "1" });
      await playCompleteness(t, CASE1);
      await t.reload();
      const saf = (await t.rows(F.review)).find((x) => x.Case_Item_Id === CASE1 && x.Review_Dept === "SAF");
      t.must("I-2 (E-A, played) started the Safety review of ZZT-0001", !!saf);
      const rmesBefore = (await t.rows(F.rmesSAF)).length;
      const audits0 = (await t.rows(F.audit)).length;
      const created0 = (await t.calls()).length;
      await t.tid("role-switcher").click();
      await t.tid("switch-role-saf").click(); // held: switches the screens, no Kissflow role change
      await t.settle(800);
      const rmes = (await t.rows(F.rmesSAF)).slice(rmesBefore).find((x) => x.Case_Item_Id === CASE1);
      t.must("Safety's first open creates its RMES row for ZZT-0001", !!rmes);
      const create = (await t.calls((c) => c.seq >= created0 && c.command === "DATAFORM_CREATE_ITEM" && c.flowId === F.rmesSAF))[0];
      t.check("header only: RMES_Key, Case_Code, Case_Item_Id, Cycle_No and RMES_Voided, no child table", create?.keys === "Case_Code,Case_Item_Id,Cycle_No,RMES_Key,RMES_Voided", create?.keys);
      t.check("… and Kissflow holds no criteria or findings rows on it", !Object.keys(rmes).some((k) => /Criteria|Findings|^Table::/.test(k)) && rmes.RMES_Key === "ZZT-0001-RMES-SAF", Object.keys(rmes));
      const made = (await auditSince(t, audits0)).filter((r) => r.Action_Code === "rmes.saved");
      t.check("one audit row: “RMES record created”", made.length === 1 && made[0].Object_Kind === "RMES record" && /RMES record created/.test(made[0].Snapshot_JSON ?? ""), made.map((r) => [r.Object_Kind, r.New_Value_Text]));
      const audits = (await t.rows(F.audit)).length;
      const from = (await t.calls()).length;
      // the RMES tab: the 8 fields of ZZT-0001 as I-2 (played) copied them from the supplier's request
      await checkRmesSheet(t, "ZZT-0001", CASE1, "Safety");
      await t.shot("rmes-sheet");
      // a source reference opens its section in the Questionnaire tab
      await t.act("rmes-source-FLD-GEN-004");
      const jumped = await t.hash();
      t.check("the Manufacturer's source opens GEN on the Questionnaire tab", !/tab=rmes/.test(jumped) && /[?&]s=GEN\b/.test(jumped), jumped);
      // the completion bar's decision line: not recorded yet; its link goes to the decision card on the Questionnaire tab
      await t.go("/review/ZZT-0001?tab=rmes");
      await t.seeTid("complete-decision", "the bar's decision line");
      const line = (await t.tid("complete-decision").first().innerText()).replace(/\s+/g, " ").trim();
      t.check("“Safety decision: not recorded yet · Record the decision”", /^Safety decision: not recorded yet Record the decision\b/.test(line), line);
      await t.act("decision-go");
      const h = await t.hash();
      await t.seeTid("decision-card", "“Record the decision” opens the decision card");
      t.check("… on the Questionnaire tab, focused", !/tab=rmes/.test(h) && (await t.frame().evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "decision-card", [h, await t.frame().evaluate(() => document.activeElement?.getAttribute("data-testid"))]);
      t.check("the card is titled “Safety decision” and sits outside the RMES", /^Safety decision/.test((await t.tid("decision-card").first().innerText()).trim()) && (await t.tid("rmes-tab").count()) === 0);
      t.check("no criteria or findings UI on the Questionnaire tab", (await t.ui.locator(OLD_RMES_UI).count()) === 0);
      await t.tid("decision-choice").getByRole("button", { name: "Approved", exact: true }).click();
      await t.act("decision-record");
      const rev = (await t.rows(F.review)).find((x) => x._id === saf._id);
      t.check("the decision is written on the Safety review", rev.RMES_Decision === "Approved", rev.RMES_Decision);
      await t.seeTid("complete-review", "Complete my review");
      const n = (await t.calls()).length;
      await t.act("complete-review");
      const seq = (await t.calls((c) => c.seq >= n && c.flowId === F.review && WRITE.test(c.command))).map((c) => c.command + (c.refused ? "!" : ""));
      const upd = (await t.calls((c) => c.seq >= n && c.flowId === F.review && c.command === "PROCESS_UPDATE_ITEM"))[0];
      t.check("complete: the counts and confirmation, then the submit", seq.join(" ") === "PROCESS_UPDATE_ITEM PROCESS_SUBMIT_ITEM" && ["Open_Count", "RMES_Gaps", "Review_Confirm", "Completed_At", "Completed_By"].every((k) => upd.keys.includes(k)), [seq, upd?.keys]);
      const done = (await t.rows(F.review)).find((x) => x._id === saf._id);
      t.check("the Safety review is at End, RMES_Gaps 0 (the decision is there), Review_Gate OK", done._status === "Completed" && done.RMES_Gaps === 0 && done.Review_Gate === "OK", [done._status, done.RMES_Gaps, done.Review_Gate]);
      const rows = await auditSince(t, audits);
      t.check("audit rows: rmes.saved for the decision, then review.completed", codes(rows).join() === "rmes.saved,review.completed" && rows[0].Object_Kind === "RMES decision", codes(rows));
      t.check("the RMES record is never read item by item (no criteria to read)", (await t.calls((c) => c.seq >= from && c.command === "DATAFORM_GET_ITEM" && c.flowId === F.rmesSAF)).length === 0);
      t.check("no write refused", (await refusedCalls(t, from)).length === 0, await refusedCalls(t, from));
      await t.shot("completed");
    }),
  "rmes-sheet": () =>
    scenario("rmes-sheet", async (t) => {
      // 28 Oct (BDF: the RMES is Regulatory's and Safety's internal sheet, exactly 8 fields from the CIQ, no access for
      // anybody else): Safety and Regulatory see the same sheet of ZZT-0003; a role that can't read the questionnaire
      // gets one notice instead of blank or wrong fields; RMM and QM have no RMES tab, and RMM's case page no RMES card
      await open(t, { roles: "saf", byid: "1" });
      await checkRmesSheet(t, "ZZT-0003", CASE3, "Safety");
      const sheetOf = async () => (await t.tid("rmes-tab").first().innerText()).replace(/Record created [^\n]*/, "").replace(/\s+/g, " ").trim();
      const safSheet = await sheetOf();
      t.check("Safety: the tab is named “RMES” (no count)", (await t.tid("workspace-tab-rmes").first().innerText()).trim() === "RMES", await t.tid("workspace-tab-rmes").first().innerText());
      await open(t, { roles: "reg", byid: "1" });
      await checkRmesSheet(t, "ZZT-0003", CASE3, "Regulatory");
      t.check("Regulatory sees the same sheet as Safety (one RMES for both)", (await sheetOf()) === safSheet, [await sheetOf(), safSheet]);
      t.check("… and decides only its own decision, on the Questionnaire tab", await (async () => { await t.go("/review/ZZT-0003"); await t.seeTid("decision-card"); return /^Regulatory decision/.test((await t.tid("decision-card").first().innerText()).trim()) && (await t.tid("decision-card").count()) === 1; })());
      await t.shot("regulatory");
      // Safety without the viewer route (R-1): Kissflow does not let the role read ZZT-0003's questionnaire
      await open(t, { roles: "saf" });
      await t.go("/review/ZZT-0003?tab=rmes");
      await t.seeTid("rmes-unreadable", "an unreadable case: the RMES notice");
      t.check("… “Kissflow did not let your role read this case's questionnaire, so the RMES can't be filled.”", (await t.tid("rmes-unreadable").first().innerText()).replace(/\s+/g, " ").trim() === "Kissflow did not let your role read this case's questionnaire, so the RMES can't be filled.", await t.tid("rmes-unreadable").first().innerText());
      t.check("… instead of the 8 fields (no header field, no composition, never the case id as the trade name)", (await t.ui.locator('[data-testid^="rmes-header-"]').count()) === 0 && (await t.tid("rmes-composition").count()) === 0);
      await t.shot("unreadable");
      // RMM and Quality Management: no RMES
      for (const [role, who] of [["rmm", "RMM"], ["qm", "Quality Management"]]) {
        await open(t, { roles: role, byid: "1" });
        await t.go("/review/ZZT-0003");
        await t.seeTid("review-workspace", `${who}: the review workspace`);
        t.check(`${who}: no RMES tab`, (await t.tid("workspace-tab-rmes").count()) === 0 && (await t.tid("decision-card").count()) === 0);
        await t.go("/review/ZZT-0003?tab=rmes");
        await t.seeTid("review-workspace", `${who}: ?tab=rmes`);
        t.check(`${who}: ?tab=rmes shows the questionnaire, not the RMES`, (await t.tid("rmes-tab").count()) === 0);
      }
      await open(t, { roles: "rmm", byid: "1" });
      await t.go("/cases/ZZT-0003");
      await t.seeTid("case-facts", "RMM: the case page");
      const overview = await mainText(t);
      t.check("RMM: no RMES card on the case Overview (and no RMES at all)", !/RMES/.test(overview) && (await t.ui.locator(OLD_RMES_UI).count()) === 0, overview.match(/.{0,60}RMES.{0,60}/)?.[0]);
      // nothing of the retired criteria RMES is left in the built app, internal screens included (scripts/leak-scan.mjs
      // RETIRED_TERMS: its criterion titles, the canned AI text, the old history label; counts only)
      const retired = leakHits(UI, { terms: RETIRED_TERMS });
      t.check(`the built app (index.html) holds none of the ${RETIRED_TERMS.length} texts of the retired criteria RMES`, retired.length === 0, retired);
    }),
  "mic-raise-accept": () =>
    scenario("mic-raise-accept", async (t) => {
      await open(t, { roles: "mic", byid: "1" });
      const audits = (await t.rows(F.audit)).length;
      const from = (await t.calls()).length;
      const op = await raiseOn(t, "ZZT-0003", "K1", "Please confirm the shelf life of the material.");
      t.must("Microbiology raised an open point (CIQ Open Point create)", !!op);
      const create = (await t.calls((c) => c.seq >= from && c.command === "PROCESS_CREATE_ITEM" && c.flowId === F.op))[0];
      const missing = FX.mandatory[FX.steps.op.start].filter((k) => !create.keys.split(",").includes(k));
      t.check("the create carries every Start Mandatory field (G-11), Raiser_Assignee included", missing.length === 0, missing);
      t.check("Raiser_Assignee = the raiser, as [{_id}]", JSON.stringify(op.Raiser_Assignee) === JSON.stringify([{ _id: FX.users.mic._id }]), op.Raiser_Assignee);
      t.check("submitted to “Open point – Microbiology”'s step (its op.round takes it to the supplier)", op._current_step === FX.stepNames[FX.steps.op.MIC] && (await writeSeq(t, "op", from)).join(" ") === "CREATE_ITEM SUBMIT_ITEM", [op._current_step, await writeSeq(t, "op", from)]);
      let rows = await auditSince(t, audits);
      t.check("one op.raised audit row", codes(rows).join() === "op.raised", codes(rows));
      t.check("… its op.round (round 1: I-3 takes it to the supplier) recorded pending", (J(rows[0]?.Notify_Recipient) ?? []).some((h) => h.code === "op.round" && h.status === "pending"), rows[0]?.Notify_Recipient);
      // the supplier answers in the portal; I-4 writes the answer onto the point
      await playAnswer(t, op._id, "24 months from the production date.");
      await t.reload();
      await t.go(`/review/ZZT-0003?op=${op.OP_Key}`);
      await t.seeTid(`op-decide-${op.OP_Key}`, "the answer is shown and Microbiology can decide");
      await t.see("24 months from the production date.", "the supplier's answer (from Response_*) is in the thread");
      const n = (await t.calls()).length;
      const toasts = (await t.toastLog()).length;
      await t.act(`op-accept-${op.OP_Key}`);
      const upd = (await t.calls((c) => c.seq >= n && c.command === "PROCESS_UPDATE_ITEM" && c.flowId === F.op))[0];
      t.check("accept: OP_Outcome, Closed_*, Thread_JSON, then the submit", (await writeSeq(t, "op", n)).join(" ") === "UPDATE_ITEM SUBMIT_ITEM" && ["OP_Outcome", "Closed_At", "Closed_By", "Thread_JSON"].every((k) => upd.keys.includes(k)), [await writeSeq(t, "op", n), upd?.keys]);
      const closed = (await t.rows(F.op)).find((x) => x._id === op._id);
      t.check("the point is closed in Kissflow (Accepted, End)", closed.OP_Outcome === "Accepted" && closed._status === "Completed", [closed.OP_Outcome, closed._status]);
      const thread = J(closed.Thread_JSON)?.thread ?? [];
      t.check("the synthesized supplier answer is persisted in Thread_JSON", thread.some((m) => m.side === "supplier" && /24 months/.test(m.text)), thread.map((m) => [m.side, m.action]));
      rows = await auditSince(t, audits);
      const acc = rows.find((r) => r.Action_Code === "op.accepted");
      t.check("one op.accepted audit row", codes(rows).join() === "op.raised,op.accepted", codes(rows));
      t.check("its hand-off is recorded pending (no webhook configured)", (J(acc?.Notify_Recipient) ?? []).some((h) => h.status === "pending"), acc?.Notify_Recipient);
      t.check("its toast", !!(await t.waitToast(/Answer accepted/, toasts)), await t.toastLog());
      t.check("A10: the toast promises no system that passes the hand-off on", !(await t.toastLog()).slice(toasts).some((x) => PENDING.test(x)), await t.toastLog());
      t.check("no webhook was posted", (await t.hooks()).length === 0);
      t.check("no write refused", (await refusedCalls(t, from)).length === 0, await refusedCalls(t, from));
    }),
  "final-pdf": () =>
    scenario("final-pdf", async (t) => {
      // Thomas, 22 Oct: "Download PDF" on the Final document tab of a completed case saves the final-document service's
      // PDF (features/rmm/finalPdf.ts; the same bytes as the Apps Script bundle, finalPdf.test.ts); in production too
      await open(t, { roles: "rmm", byid: "1", env: "prod" });
      await t.go("/cases/ZZT-0005");
      await t.tid("case-tab-final-document").first().click();
      await t.seeTid("fd-download-pdf", "the completed case's Final document tab offers Download PDF");
      const [dl] = await Promise.all([t.page.waitForEvent("download", { timeout: 10000 }), t.tid("fd-download-pdf").first().click()]);
      const file = await dl.path();
      const head = file ? readFileSync(file).subarray(0, 5).toString("latin1") : "";
      const text = file ? readFileSync(file).toString("latin1") : "";
      t.check("a PDF named ZZT-0005-final-document.pdf", dl.suggestedFilename() === "ZZT-0005-final-document.pdf" && head === "%PDF-", [dl.suggestedFilename(), head]);
      // the final-pdf patches applied in the browser build: the service's producer, the seal in the subject, Berlin dates
      t.check("… patched as the service's (producer, the document seal in the subject) and dated in Europe/Berlin", /\/Producer \(CIQ final document service\)/.test(text) && /\/Subject \(document seal [0-9a-f]{16,}\)/.test(text) && /CES?T/.test(text), text.match(/\/(Producer|Subject) \([^)]*\)/g));
      t.check("… and the tab shows no failure", (await t.ui.getByText("The PDF could not be made").count()) === 0);
      await t.go("/cases/ZZT-0003");
      t.check("a case in review has no Final document tab, so no Download PDF", (await t.tid("case-tab-final-document").count()) === 0 && (await t.tid("fd-download-pdf").count()) === 0);
    }),
  "matrix-v06-review": () =>
    scenario("matrix-v06-review", async (t) => {
      // 28 Oct, matrix v0.6: what the reviewers and RMM read of the supplier's new questions. Annex 1 starts with the
      // read-only Country of origin, a copy of K2.3's (L6; asked about at its source, so no Ask supplier there); the
      // feedstock and its content sit in K2.3 (D3); the composition reads INCI / IUPAC and EC / REACH no. (L4, M2)
      await open(t, { roles: "rmm", byid: "1" });
      const from = (await t.calls()).length;
      await t.go("/review/ZZT-0003?s=K2.3");
      await t.seeTid("field-FLD-2.3-10", "the review shows K2.3's Country of origin");
      const country = (await t.tid("field-FLD-2.3-10").first().innerText()).split("\n").map((l) => l.trim()).filter((l) => l && l !== "(required)");
      for (const id of ["FLD-A1-102", "FLD-A1-103", "FLD-A1-104"]) t.check(`${id} is answered in K2.3`, (await t.tid(`field-${id}`).count()) === 1);
      await t.go("/review/ZZT-0003?s=A1");
      await t.seeTid("field-FLD-A1-105", "Annex 1 shows its Country of origin");
      const copy = (await t.tid("field-FLD-A1-105").first().innerText()).split("\n").map((l) => l.trim()).filter(Boolean);
      t.check("with K2.3's answer (the value line of FLD-2.3-10), not marked optional", country.length > 1 && copy[1] === country[1] && !copy.includes("optional"), { country, copy });
      t.check("… and says where it comes from", copy.some((l) => l === "Filled in from Country of origin."), copy);
      t.check("no Ask supplier on the copy (the supplier can only change it in K2.3)", (await t.tid("ask-field-FLD-A1-105").count()) === 0 && (await t.tid("ask-field-FLD-A1-201").count()) === 1);
      t.check("the feedstock is no longer asked in Annex 1", (await t.tid("field-FLD-A1-102").count()) === 0);
      await t.go("/review/ZZT-0003?s=K2.1");
      await t.seeTid("component-table", "the composition table");
      t.check("the reviewers' table names CAS / EC or REACH no.", (await t.tid("component-table").first().innerText()).includes("CAS / EC or REACH no."));
      await t.go("/cases/ZZT-0003?tab=questionnaire&s=K2.1");
      await t.seeTid("q-composition", "RMM's questionnaire tab shows the composition");
      const head = await t.tid("q-composition").first().locator("th").allInnerTexts();
      t.check("headed INCI / IUPAC and EC / REACH no.", head.map((h) => h.trim()).join("|") === "#|INCI / IUPAC|CAS|EC / REACH no.|Function|Origin|Additive|Concentration", head);
      await t.go("/cases/ZZT-0003?tab=questionnaire&s=A1");
      await t.seeTid("q-field-FLD-A1-105", "RMM's Annex 1 starts with the Country of origin");
      const rmm = (await t.tid("q-field-FLD-A1-105").first().innerText()).split("\n").map((l) => l.trim()).filter(Boolean);
      t.check("with K2.3's answer, said to be filled in from it", rmm.includes(country[1]) && rmm.includes("Filled in from Country of origin.") && !rmm.some((l) => /optional/.test(l)), rmm);
      t.check("reading writes nothing", (await writes(t, (c) => c.seq >= from && c.flowId !== F.audit)).length === 0, summary(await writes(t, (c) => c.seq >= from)));
      await t.shot("annex1");
    }),
  "mails": () =>
    scenario("mails", async (t) => {
      // D1 (a), 22 Oct: the screens post {To, Subject, Body} to the mail hook (SET:current mailHook) after the hand-off
      // that went out: a question edited or closed while the supplier's query waits (write/mail.ts)
      await open(t, { roles: "mic", byid: "1", hooks: "1", mail: "1" });
      const op = await raiseOn(t, "ZZT-0003", "K1", "Please send the stability study.");
      t.must("Microbiology raised an open point", !!op);
      t.check("the raise sends no mail (not one of the four)", (await t.hooks()).every((h) => h.code !== "mail"));
      await t.set(op._id, { Portal_Query_Item_Id: "PkQNew" });
      await t.reload();
      await t.go(`/review/ZZT-0003?op=${op.OP_Key}`);
      await t.tid(`op-edit-${op.OP_Key}`).first().click();
      await t.fillText("op-edit-question", "Please send the signed <stability> study.");
      await t.act("op-edit-save");
      // history.updated may wait (M3: this role reads other departments' points only from the history)
      const codesNoHist = (hs) => hs.map((h) => h.code).filter((c) => c !== "history.updated").join();
      let hooks = await t.hooks();
      const edited = hooks.filter((h) => h.code === "mail");
      const to = String(edited[0]?.body?.To ?? "").split(", ");
      t.check("edit: op.edited, then one mail by the browser's fetch to the running account's mail hook", codesNoHist(hooks) === "op.edited,mail" && edited.length === 1 && byFetch(edited[0]) && edited[0].url === `${DEV_PARENT}/integration/2/AcDOSunMEpSA/webhook/ZZTtok_mail`, hooks.map((h) => [h.code, h.route, h.url]));
      t.check("… {To, Subject, Body} only, To the case's supplier contacts", keysOf(edited[0]?.body ?? {}) === "Body,Subject,To" && to.length > 0 && to.every((e) => /^[^@\s]+@[^@\s]+$/.test(e)), edited[0]?.body);
      t.check("… the subject and the escaped question", edited[0]?.body?.Subject === "ZZT-0003: Beiersdorf changed an open question" && edited[0]?.body?.Body.includes("Please send the signed &lt;stability&gt; study."), edited[0]?.body);
      // 27 Oct: the shared layout; to the supplier: where to look, no button (the portal's URL is not known in the app)
      const eb = edited[0]?.body?.Body ?? "";
      t.check("… in the shared e-mail layout, with the case as a details row, where to look and the supplier's audience line, no button", isMailLayout(eb) && />Case<\/td><td [^>]*>ZZT-0003<\/td>/.test(eb) && eb.includes(">Please open the CIQ supplier portal for the details.</p>") && eb.includes(">This message concerns your CIQ request with Beiersdorf.</p>") && !eb.includes("<a "), eb.slice(0, 400));
      await t.go(`/review/ZZT-0003?op=${op.OP_Key}`);
      await t.tid(`op-close-${op.OP_Key}`).first().click();
      await t.fillText("op-close-reason", "Internal: not needed any more.");
      await t.act("op-close-confirm");
      hooks = await t.hooks();
      const closed = hooks.filter((h) => h.code === "mail");
      t.check("close: op.closed, then one mail, without the internal reason", codesNoHist(hooks) === "op.closed,mail" && closed[0]?.body?.Subject === "ZZT-0003: an open question was closed" && !closed[0]?.body?.Body.includes("Internal"), hooks.map((h) => [h.code, h.body?.Subject]));
      t.check("… in the shared e-mail layout: no answer needed", isMailLayout(closed[0]?.body?.Body) && closed[0].body.Body.includes("No answer is needed any more.") && !closed[0].body.Body.includes("<a "));
      // 28 Oct: the internal RMES never reaches the supplier (scripts/leak-scan.mjs LEAK_TERMS)
      const leaked = [...edited, ...closed].flatMap((h) => LEAK_TERMS.filter((x) => `${h.body?.Subject ?? ""}\n${h.body?.Body ?? ""}`.includes(x)));
      t.check("… and neither supplier mail carries anything of the internal RMES", edited.length + closed.length === 2 && leaked.length === 0, leaked);
    }),
  "mic-return-edit-close": () =>
    scenario("mic-return-edit-close", async (t) => {
      await open(t, { roles: "mic", byid: "1", hooks: "1" });
      const op = await raiseOn(t, "ZZT-0003", "K1", "Please send the stability study.");
      t.must("Microbiology raised an open point", !!op);
      const all = [];
      let hooks = await t.hooks();
      all.push(...hooks);
      t.check("the raise POSTs op.round {opItemId} (round 1; the integration reads the round from the point)", hooks.filter((h) => h.code === "op.round").length === 1 && hooks.some((h) => h.code === "op.round" && h.body.opItemId === op._id && keysOf(h.body) === "idempotencyKey,opItemId") && op.Round_No === 1, hooks.map((h) => [h.code, h.body]));
      await playAnswer(t, op._id, "The study is in preparation.");
      await t.reload();
      await t.go(`/review/ZZT-0003?op=${op.OP_Key}`);
      await t.seeTid(`op-decide-${op.OP_Key}`, "Microbiology can decide on the answer");
      const n = (await t.calls()).length;
      await t.tid(`op-return-${op.OP_Key}`).click();
      await t.fillText("op-decide-reason", "Please send the signed study report.");
      await t.act("op-decide-confirm");
      let it = (await t.rows(F.op)).find((x) => x._id === op._id);
      t.check("return: Round_No 2 and Query_Key -R2, no submit", it.Round_No === 2 && it.Query_Key === `${op.OP_Key}-R2` && !(await writeSeq(t, "op", n)).includes("SUBMIT_ITEM"), [it.Round_No, it.Query_Key, await writeSeq(t, "op", n)]);
      hooks = await t.hooks();
      all.push(...hooks);
      const round = hooks.find((h) => h.code === "op.round");
      t.check("POST op.round {opItemId} for the new round (the point holds round 2 when it goes)", round && round.body.opItemId === op._id && keysOf(round.body) === "idempotencyKey,opItemId", hooks.map((h) => [h.code, h.body]));
      // M3: history.updated replaces the portal's whole history, so it waits while a point of the case is known to this
      // role only from the history (here the other departments' points): recorded pending on the row, not posted
      const returned = (await t.rows(F.audit)).filter((r) => r.Action_Code === "op.returned" && r.Object_Item_Id === op._id).at(-1);
      const hist = (J(returned?.Notify_Recipient) ?? []).find((h) => h.code === "history.updated");
      t.check("… and history.updated waits (pending: not every open point of the case was readable live, M3)", !hooks.some((h) => h.code === "history.updated") && hist?.status === "pending" && /could not read every open point of the case/i.test(hist.detail ?? ""), [hooks.map((h) => h.code), hist]);
      // I-3 created the round's CIQP Query: an edit of an open point goes to it (the integration reads it from the point)
      await t.set(op._id, { Portal_Query_Item_Id: "PkQNew" });
      await t.reload();
      await t.go(`/review/ZZT-0003?op=${op.OP_Key}`);
      await t.tid(`op-edit-${op.OP_Key}`).first().click();
      await t.fillText("op-edit-question", "Please send the signed stability study report.");
      const m = (await t.calls()).length;
      await t.act("op-edit-save");
      it = (await t.rows(F.op)).find((x) => x._id === op._id);
      t.check("edit: the question is updated", it.Question_Text === "Please send the signed stability study report." && (await writeSeq(t, "op", m)).join(" ") === "UPDATE_ITEM", [it.Question_Text, await writeSeq(t, "op", m)]);
      hooks = await t.hooks();
      all.push(...hooks);
      t.check("… and POST op.edited {opItemId} (the integration edits the point's open query)", hooks.some((h) => h.code === "op.edited" && h.body.opItemId === op._id && keysOf(h.body) === "idempotencyKey,opItemId"), hooks.map((h) => [h.code, h.body]));
      await t.go(`/review/ZZT-0003?op=${op.OP_Key}`);
      await t.tid(`op-close-${op.OP_Key}`).first().click();
      await t.fillText("op-close-reason", "Not needed any more.");
      const k = (await t.calls()).length;
      await t.act("op-close-confirm");
      it = (await t.rows(F.op)).find((x) => x._id === op._id);
      t.check("close: Withdrawn, then the submit (End)", it.OP_Outcome === "Withdrawn" && it._status === "Completed" && (await writeSeq(t, "op", k)).join(" ") === "UPDATE_ITEM SUBMIT_ITEM", [it.OP_Outcome, it._status, await writeSeq(t, "op", k)]);
      hooks = await t.hooks();
      all.push(...hooks);
      t.check("… and POST op.closed {opItemId} (the point is closed in Kissflow first)", hooks.some((h) => h.code === "op.closed" && h.body.opItemId === op._id && keysOf(h.body) === "idempotencyKey,opItemId"), hooks.map((h) => [h.code, h.body]));
      t.check("every hand-off went once, by the no-cors fetch (text/plain), none by the API route too", all.length > 0 && all.every(byFetch) && new Set(all.map((h) => h.body.idempotencyKey)).size === all.length, all.map((h) => [h.code, h.route, h.mode, h.contentType]));
      t.check("no portal id in any payload", !/portalRequestItemId|portalQueryItemId|PkQNew|PkReq/.test(JSON.stringify(all.map((h) => h.body))), all.map((h) => h.body));
      t.check("no write refused", (await refusedCalls(t, n)).length === 0, await refusedCalls(t, n));
    }),
  "last-review-release": () =>
    scenario("last-review-release", async (t) => {
      await open(t, { roles: "mic", byid: "1", hooks: "1" });
      // every other review of ZZT-0003 was completed by its department (played): Microbiology is the last
      for (const r of (await t.rows(F.review)).filter((x) => x.Case_Item_Id === CASE3 && x.Review_Dept !== "MIC" && x._status !== "Completed")) await playCompleted(t, r._id, r.Review_Dept, FX.users[r.Review_Dept.toLowerCase()]);
      await t.reload();
      const audits = (await t.rows(F.audit)).length;
      await t.hooks();
      await t.go("/review/ZZT-0003");
      await t.seeTid("complete-review", "Microbiology can complete its review");
      // 22 Oct: live, E-B sends the request on this completion (before, RMM's next load did)
      await t.see("You are the last open review: completing sends the final-release request to the supplier and locks its questionnaire.", "the bar says the final-release request goes on this completion");
      const n = (await t.calls()).length;
      const toasts = (await t.toastLog()).length;
      await t.act("complete-review");
      const mic = (await t.rows(F.review)).find((x) => x.Case_Item_Id === CASE3 && x.Review_Dept === "MIC");
      t.check("the Microbiology review is completed in Kissflow", mic._status === "Completed", mic._status);
      const rows = await auditSince(t, audits);
      // M2: a department's view may be partial or stale; E-B, the integration on this completion, is the only sender
      t.check("one audit row: review.completed (no release.requested from a department)", codes(rows).join() === "review.completed", codes(rows));
      t.check("no release.requested POST from a department", (await t.hooks()).every((h) => h.code !== "release.requested"));
      t.check("the toast says the final-release request goes in a moment (C18: E-B)", !!(await t.waitToast(/Every review is complete; the final-release request goes to the supplier in a moment\.$/, toasts)), (await t.toastLog()).slice(toasts));
      await t.go("/cases/ZZT-0003");
      await t.see("Awaiting final release", "the case shows “Awaiting final release”");
      t.check("no write refused", (await refusedCalls(t, n)).length === 0, await refusedCalls(t, n));
    }),
  "rmm-release": () =>
    scenario("rmm-release", async (t) => {
      await open(t, { roles: "rmm", byid: "1", hooks: "1" });
      t.check("nothing is sent while reviews are open", (await t.hooks()).length === 0);
      // every review of ZZT-0003 completed (played: the departments and RMM's own)
      for (const r of (await t.rows(F.review)).filter((x) => x.Case_Item_Id === CASE3 && x._status !== "Completed")) await playCompleted(t, r._id, r.Review_Dept, FX.users[r.Review_Dept.toLowerCase()]);
      const audits = (await t.rows(F.audit)).length;
      const n = (await t.calls()).length;
      await t.reload();
      const rows = await auditSince(t, audits);
      // 22 Oct: the request is E-B's (an integration on the last review's completion); before, RMM's load sent it
      t.check("RMM's load writes no release.requested row", codes(rows).length === 0, codes(rows));
      t.check("… and posts no release.requested", (await t.hooks()).every((h) => h.code !== "release.requested"));
      await t.go("/cases/ZZT-0003");
      await t.see("Awaiting final release", "the case shows “Awaiting final release”");
      t.check("no write refused", (await refusedCalls(t, n)).length === 0, await refusedCalls(t, n));
    }),
  "rmm-unplaced-review": () =>
    scenario("rmm-unplaced-review", async (t) => {
      // RMM without admin rights reads the reviews it started from My items, whose live rows carry no field of the review
      // (21 Oct): the history places them. Here ZZT-0003's Safety review (in progress, Safety's to hold) lost its only
      // history line, so nothing ties it to its case (the reviewer's findings 1 and 4, 21 Oct)
      await open(t, { roles: "rmm", byid: "1", hooks: "1" });
      const saf = (await t.rows(F.review)).find((x) => x.Case_Item_Id === CASE3 && x.Review_Dept === "SAF");
      t.must("ZZT-0003's Safety review is in progress", saf?._status === "InProgress", saf?._status);
      const lost = await t.page.evaluate(([f, id]) => {
        const rows = window.__kfDb[f];
        let n = 0;
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].Object_Item_Id === id) (rows.splice(i, 1), n++);
        return n;
      }, [F.audit, saf._id]);
      t.must("its history line is gone", lost > 0, lost);
      const n = (await t.calls()).length;
      await t.reload();
      t.check("no review is created (the round-1 reviews are I-2's since 22 Oct, E-A)", (await writeSeq(t, "review", n)).length === 0, await writeSeq(t, "review", n));
      t.check("Kissflow still holds one Safety review of ZZT-0003", (await t.rows(F.review)).filter((x) => x.Case_Item_Id === CASE3 && x.Review_Dept === "SAF").length === 1);
      await t.go("/diagnostics");
      await t.seeTid("diagnostics");
      const keys = (await t.tid("diag-read-keys-review").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      t.check("Diagnostics: the My items rows carried exactly the live fields", keys === "Row fields: Name, _activity_id, _activity_instance_id, _completed_at, _current_assigned_to, _current_step, _id, _modified_at, _progress, _status", keys);
    }),
  "hook-fetch-blocked": () =>
    scenario(
      "hook-fetch-blocked",
      async (t) => {
        // the browser refuses the webhook fetch (it throws: the Kissflow page's CSP, offline): then, and only then, the
        // Kissflow API route takes the hand-off, once
        t.blockHookFetch();
        await open(t, { roles: "mic", byid: "1", hooks: "1" });
        const op = await raiseOn(t, "ZZT-0003", "K1", "Please confirm the preservative system.");
        t.must("Microbiology raised an open point", !!op);
        const hooks = await t.hooks();
        const rounds = hooks.filter((h) => h.code === "op.round");
        t.check("op.round went once, by the API route (kf.api POST, the JSON string body)", rounds.length === 1 && rounds[0].route === "sdk" && rounds[0].body.opItemId === op._id && keysOf(rounds[0].body) === "idempotencyKey,opItemId", hooks.map((h) => [h.code, h.route]));
        t.check("… on the relative path with the running account and the token (the SDK sends it to the account's domain)", rounds[0]?.url === `/integration/2/AcDOSunMEpSA/webhook/${TOKEN["op.round"]}` && !rounds[0]?.absolute, rounds.map((h) => h.url));
        t.check("nothing reached the hook host by fetch", hooks.every((h) => h.route === "sdk"), hooks.map((h) => [h.code, h.route]));
        const row = (await t.rows(F.audit)).filter((r) => r.Action_Code === "op.raised" && r.Object_Item_Id === op._id).at(-1);
        // fire-and-forget (gap 5): the row is written before the POST's route is known
        t.check("the op.raised row records op.round sent (handed over), with the key that route carried", (J(row?.Notify_Recipient) ?? []).some((h) => h.code === "op.round" && h.status === "sent" && h.detail === "handed over" && h.key === rounds[0]?.body.idempotencyKey), row?.Notify_Recipient);
      },
      {},
      { ignoreConsole: /Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/ },
    ),
  "hook-failed": () =>
    scenario(
      "hook-failed",
      async (t) => {
        // APP-SAVING-GAPS gap 5: a hand-off is fire-and-forget; when both routes fail (the fetch throws, the API route is
        // refused), the save still stands, and the user gets a warning and a line in Diagnostics' write log
        t.blockHookFetch();
        await open(t, { roles: "mic", byid: "1", hooks: "1", refuse: "API:POST" });
        const toasts = (await t.toastLog()).length;
        const op = await raiseOn(t, "ZZT-0003", "K1", "Please confirm the preservative system.");
        t.must("Microbiology raised an open point", !!op);
        t.check("the point moved on in Kissflow all the same", op._current_step === FX.stepNames[FX.steps.op.MIC], op._current_step);
        t.check("its success toast", !!(await t.waitToast(/Sent to the supplier as a task/, toasts)), (await t.toastLog()).slice(toasts));
        t.check("a warning names the failed hand-off and says the change is saved", !!(await t.waitToast(/^Saved, but its hand-off to the supplier portal \(op\.round\) failed: .*Diagnostics lists it\.$/, toasts)), (await t.toastLog()).slice(toasts));
        await t.go("/diagnostics");
        await t.seeTid("diagnostics");
        const line = t.ui.locator('[data-testid="diag-write"][data-method="handoff op.round"]');
        t.check("Diagnostics' write log lists the failed hand-off", (await line.count()) === 1 && (await line.getAttribute("data-ok")) === "0", await line.count());
      },
      {},
      { ignoreConsole: /Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/ },
    ),
  "saves-no-reload": () =>
    scenario("saves-no-reload", async (t) => {
      // APP-SAVING-GAPS gap 1 (the portal's autosave rule, harness-portal.mjs k21-typing): a save that moves no step shows
      // the items as Kissflow read them back after the write; no list is read again, and the screen keeps the value
      const LISTS = /^(DATAFORM_GET_ITEMS|PROCESS_GET_MY_TASKS_ITEMS|PROCESS_GET_MY_ITEMS|PROCESS_GET_ADMIN_ITEMS)$/;
      const OWN = new Set([F.review, F.note, F.audit]);
      await open(t, { roles: "saf", byid: "1" });
      await t.settle(600);
      t.check("the first load read the lists", (await t.calls((c) => LISTS.test(c.command))).length > 0);
      // the Safety decision (28 Oct: on the Questionnaire tab, stored on the CIQ Review item; the RMES has no input)
      await t.go("/review/ZZT-0003");
      await t.seeTid("decision-card", "the Safety decision card");
      let from = (await t.calls()).length;
      const toasts = (await t.toastLog()).length;
      await t.tid("decision-choice").getByRole("button", { name: "Approved", exact: true }).click();
      await t.act("decision-record");
      t.check("“Decision recorded.”", !!(await t.waitToast(/^Decision recorded\./, toasts)), (await t.toastLog()).slice(toasts));
      t.check("Kissflow holds the decision", (await t.item("PkRevZZT0003SAF1"))?.RMES_Decision === "Approved", (await t.item("PkRevZZT0003SAF1"))?.RMES_Decision);
      let since = await t.calls((c) => c.seq >= from);
      t.check("Record approval reads no list again (no DATAFORM_GET_ITEMS / PROCESS_GET_MY_TASKS_ITEMS / PROCESS_GET_MY_ITEMS / PROCESS_GET_ADMIN_ITEMS)", !since.some((c) => LISTS.test(c.command)), summary(since));
      t.check("… only its own calls: the review read, written and read back, and its audit row", since.length > 0 && since.every((c) => /^(PROCESS_(GET_ITEM|UPDATE_ITEM)|DATAFORM_(GET_ITEM|CREATE_ITEM|SUBMIT_ITEM))$/.test(c.command) && OWN.has(c.flowId)), summary(since));
      const card = (await t.tid("decision-card").first().innerText().catch(() => "")) || "";
      t.check("the card shows the saved decision (Kissflow's read-back, the optimistic state is gone)", /Approved/.test(card) && (await t.tid("decision-record").count()) === 0 && (await t.tid("decision-change").count()) === 1, card.slice(0, 200));
      // an internal note on the review workspace
      await t.go("/review/ZZT-0003");
      await t.seeTid("review-workspace", "the review workspace");
      from = (await t.calls()).length;
      const NOTE = "Checked the SDS against the CoA: no remarks from Safety.";
      await t.fillText("note-input", NOTE);
      await t.act("note-add");
      t.check("Kissflow holds the note", (await t.rows(F.note)).some((x) => x.Note_Text === NOTE));
      since = await t.calls((c) => c.seq >= from);
      t.check("an internal note reads no list again", !since.some((c) => LISTS.test(c.command)), summary(since));
      t.check("… only its own calls: the note created and read back, and its audit row", since.length > 0 && since.every((c) => /^DATAFORM_(GET_ITEM|UPDATE_ITEM|CREATE_ITEM|SUBMIT_ITEM)$/.test(c.command) && OWN.has(c.flowId)), summary(since));
      await t.see(NOTE, "the note is on screen (from its read-back)");
      t.check("no write refused", (await refusedCalls(t, from)).length === 0, await refusedCalls(t, from));
      await t.shot("saved");
    }),
  "doc-preview": () =>
    scenario("doc-preview", async (t) => {
      // 27 Oct (Thomas's prod test: "the attachments are not able to view in the app … fix this in both the
      // questionnaire and the Documents overview"): an RMM opens the supplier's files from the case's Questionnaire tab
      // and its Documents overview; the app sends Kissflow's file preview (SDK FILEPREVIEW_OPEN { files, indexOfFile })
      // with every openable file of the case's Documents_JSON, on the clicked one. Nothing is written.
      const previews = () => t.page.evaluate(() => (window.__kfPreviews ?? []).splice(0));
      const portalReads = (from = 0) => t.calls((c) => c.seq >= from && c.command === "API" && /CIQP_Request_A00/.test(c.url || ""));
      const READ_URL = "/process/2/AcDOSunMEpSA/admin/CIQP_Request_A00/PkReq3?_application_id=CIQ_Supplier_Portal_A00";
      const tab = async (name) => { await t.tid(`case-tab-${name}`).first().click(); await t.page.waitForTimeout(300); };
      const state = (id) => t.tid(`doc-open-${id}`).first().getAttribute("data-doc-state", { timeout: 5000 }).catch(() => null);
      const waitReady = async (id) => { for (let i = 0; i < 40 && (await state(id)) !== "ready"; i++) await t.page.waitForTimeout(100); return state(id); };
      const sameFiles = (a, b) => JSON.stringify(a) === JSON.stringify(b);

      // 1. entries with "file" (the portal writes it since 27 Oct): opened from the entry, no portal read
      await open(t, { roles: "rmm", byid: "1" });
      const entries = J((await t.item(CASE3)).Documents_JSON) ?? [];
      t.must("ZZT-0003's Documents_JSON entries carry file (id, key)", entries.length > 2 && entries.every((e) => e.file?.id && e.file?.key), entries.map((e) => e.uploadId));
      const files = entries.map((e) => e.file);
      await t.go("/cases/ZZT-0003");
      await tab("questionnaire");
      const q = entries.find((e) => e.fieldKey === "FLD-K1-002");
      await t.seeTid(`doc-open-${q.uploadId}`, "Questionnaire tab: the file answer is a button");
      const label = await t.tid(`doc-open-${q.uploadId}`).first().getAttribute("aria-label");
      t.check(`… labelled "Open ${q.fileName}"`, label === `Open ${q.fileName}`, label);
      t.check("… every K1 file answer is one", (await t.ui.locator('[data-testid^="doc-open-"][data-doc-state="ready"]').count()) >= 5, await t.ui.locator('[data-testid^="doc-open-"]').count());
      await t.tid(`doc-open-${q.uploadId}`).first().click();
      await t.page.waitForTimeout(300);
      let p = await previews();
      t.check("Questionnaire: the click sends FILEPREVIEW_OPEN with the case's files (the entries' file), on the clicked one", p.length === 1 && sameFiles(p[0].files, files) && p[0].indexOfFile === entries.indexOf(q), p.map((x) => [x.files?.map((f) => f.id), x.indexOfFile]));
      await t.shot("questionnaire");
      await tab("documents");
      await t.seeTid("case-documents", "the Documents overview");
      const rows = await t.ui.locator('[data-testid^="doc-row-"]').count();
      const buttons = await t.ui.locator('[data-testid^="doc-row-"] button[data-testid^="doc-open-"]').count();
      t.check("Documents overview: every document row has its Open button", rows === entries.length && buttons === rows, [rows, buttons]);
      // 27 Oct (Thomas): no Size column, and no size in the header line
      const heads = await t.ui.locator('[data-testid="case-documents"] thead th').allInnerTexts();
      t.check("Documents overview: the columns without Size", heads.map((h) => h.trim()).join("|") === "Document|Type|Section / question|Uploaded by|Upload date", heads);
      const sub = await t.tid("case-documents").first().innerText();
      t.check("… and no size in the header line", !/\b\d+(\.\d)?\s?(KB|MB)\b/.test(sub), sub.slice(0, 300));
      const last = entries.at(-1);
      await t.tid(`doc-row-${last.uploadId}`).getByRole("button", { name: `Open ${last.fileName}` }).click();
      await t.page.waitForTimeout(300);
      p = await previews();
      t.check("Documents: the newest file opens on its own index of the case's list", p.length === 1 && sameFiles(p[0].files, files) && p[0].indexOfFile === entries.length - 1, p.map((x) => [x.files?.map((f) => f.id), x.indexOfFile]));
      t.check("no portal read for entries with file", (await portalReads()).length === 0, (await portalReads()).map((c) => c.url));
      t.check("part 1: nothing written", (await writes(t)).length === 0, summary(await writes(t)));
      await t.shot("documents");

      // 2. entries written before 27 Oct (no file), a role granted the portal request's read: read ONCE, then opened
      await open(t, { roles: "rmm", byid: "1", legacyDocs: "1", portal: "read" });
      const legacy = J((await t.item(CASE3)).Documents_JSON) ?? [];
      t.must("legacyDocs: the entries have no file", legacy.length === entries.length && legacy.every((e) => !e.file));
      const stored = (await t.item("PkReq3")).Supplier_Files;
      const from2 = (await t.calls()).length;
      await t.go("/cases/ZZT-0003");
      await tab("documents");
      await t.seeTid(`doc-open-${last.uploadId}`, "an older entry is a button too");
      t.check("… ready once the case's portal request is read", (await waitReady(last.uploadId)) === "ready", await state(last.uploadId));
      await t.tid(`doc-open-${last.uploadId}`).first().click();
      await t.page.waitForTimeout(300);
      p = await previews();
      t.check("Documents: FILEPREVIEW_OPEN with the request's stored files (Supplier_Files by attachmentId)", p.length === 1 && sameFiles(p[0].files, stored) && p[0].indexOfFile === legacy.length - 1, p.map((x) => [x.files?.map((f) => f.id), x.indexOfFile]));
      await tab("questionnaire");
      await t.seeTid(`doc-open-${q.uploadId}`);
      await t.tid(`doc-open-${q.uploadId}`).first().click();
      await t.page.waitForTimeout(300);
      p = await previews();
      t.check("Questionnaire: the same, on its own file", p.length === 1 && sameFiles(p[0].files, stored) && p[0].files[p[0].indexOfFile]?.id === q.attachmentId, p.map((x) => [x.files?.map((f) => f.id), x.indexOfFile]));
      const reads = await portalReads(from2);
      t.check("the case's portal request is read once, by the REST admin route in the portal's container", reads.length === 1 && reads[0].url === READ_URL && (reads[0].method || "GET").toUpperCase() === "GET" && !reads[0].refused, reads.map((c) => [c.url, c.method, c.refused]));
      t.check("part 2: nothing written", (await writes(t)).length === 0, summary(await writes(t)));
      await t.shot("documents-older-entries");

      // 3. older entries and no grant on the portal's request (the default host): the name with the quiet note
      await open(t, { roles: "rmm", byid: "1", legacyDocs: "1" });
      const from3 = (await t.calls()).length;
      await t.go("/cases/ZZT-0003");
      await tab("documents");
      await t.seeTid(`doc-portal-only-${last.uploadId}`, "not openable here: the name with the quiet note");
      await t.see("This file can be opened in the supplier portal.", "… which says the supplier portal opens it");
      t.check("… on every row, without a button", (await t.ui.locator('[data-testid^="doc-portal-only-"]').count()) === entries.length && (await t.ui.locator('[data-testid^="doc-row-"] button[data-testid^="doc-open-"]').count()) === 0);
      const refused = await portalReads(from3);
      t.check("one refused read of the request (not one per file)", refused.length === 1 && !!refused[0].refused, refused.map((c) => [c.url, c.refused]));
      t.check("no preview sent", (await previews()).length === 0);
      await t.shot("portal-only");
      await t.go("/diagnostics");
      await t.seeTid("diagnostics");
      const lines = t.ui.locator('[data-testid="diag-write"][data-method="openFile"]');
      t.check("dev: Diagnostics gives the reason in one Writes line (nothing written)", (await lines.count()) === 1 && /could not be read/.test(await lines.first().innerText()) && (await lines.first().getAttribute("data-note")) === "1", await lines.allInnerTexts());
      t.check("part 3: nothing written", (await writes(t)).length === 0, summary(await writes(t)));
    }),
  "cus-readonly": () =>
    scenario("cus-readonly", async (t) => {
      await open(t, { roles: "cus" });
      t.check("Customs lands on Cases", (await t.hash()).startsWith("#/cases"), await t.hash());
      await t.see("ZZT-0003", "the cases from the audit index");
      const audits = (await t.rows(F.audit)).length;
      await t.go("/cases/ZZT-0003?tab=questionnaire&s=K7");
      await t.seeTid("q-focus-note-K7", "the K7 card has its note box");
      const from = (await t.calls()).length;
      await t.fillText("q-focus-note-K7", "HS code 1516 20 to be checked against the CoA.");
      await t.act("q-focus-note-add-K7");
      const ws = (await writes(t, (c) => c.seq >= from)).map((c) => `${c.command.replace(/^DATAFORM_/, "")} ${FLOW_OF[c.flowId]}`);
      t.check("the note is a CIQ Internal Note row, plus its audit row; nothing else is written", ws.length > 0 && ws.every((w) => / (note|audit)$/.test(w)) && ws.some((w) => w === "CREATE_ITEM note"), ws);
      const note = (await t.rows(F.note)).find((x) => x.Note_Text === "HS code 1516 20 to be checked against the CoA.");
      t.check("on K7, by Customs", note && note.Linked_Key === "K7" && note.Note_Dept === "CUS" && note.Note_Author?._id === FX.users.cus._id, note && [note.Linked_Key, note.Note_Dept, note.Note_Author]);
      t.check("one note.added audit row", codes(await auditSince(t, audits)).join() === "note.added", codes(await auditSince(t, audits)));
      t.check("no write other than the note (no review start, no RMES)", (await writes(t)).every((c) => c.flowId === F.note || c.flowId === F.audit), summary(await writes(t)));
    }),
  auditor: () =>
    scenario("auditor", async (t) => {
      await open(t, { roles: "auditor" });
      t.check("the Auditor lands on the audit trail", (await t.hash()).startsWith("#/audit"), await t.hash());
      await t.see("ZZT-0003", "the audit trail lists the cases' history from the audit rows");
      t.check("reads both RMES forms (Viewer)", (await t.calls((c) => c.command === "DATAFORM_GET_ITEMS" && (c.flowId === F.rmesSAF || c.flowId === F.rmesREG) && !c.refused)).length >= 2);
      // the configuration pages: the Auditor reads them with its own read-only note (the shell's banner is the
      // administrator's), in the live app too (FE-CLEANUP A7 hides nothing from the Auditor)
      await t.go("/admin/rules");
      await t.seeTid("admin-read-only", "the Auditor's read-only note on the rules");
      await noBasis(t, "the Auditor's rules");
      await t.see("Only the business administrator changes", "… which says who changes the configuration");
      t.check("… and no administrator banner", (await t.tid("config-readonly-banner").count()) === 0);
      await t.page.waitForTimeout(500);
      t.check("zero writes", (await writes(t)).length === 0, summary(await writes(t)));
    }),
  owner: () =>
    scenario("owner", async (t) => {
      await open(t, { roles: "owner" });
      t.check("the Business owner lands on the reports", (await t.hash()).startsWith("#/reports"), await t.hash());
      const text = await t.ui.locator("main").first().innerText();
      t.check("the reports render from the live cases", text.length > 200 && !/NaN|undefined|Invalid Date/.test(text), text.slice(0, 200));
      await t.page.waitForTimeout(500);
      t.check("zero writes", (await writes(t)).length === 0, summary(await writes(t)));
    }),
  "end-user-tour": () =>
    scenario("end-user-tour", async (t) => {
      // 28 Oct (Thomas: "if you find anything else that might not be needed for the end user let me know"): the
      // end-user screens as production shows them (env=prod: no dev top bar), one screenshot each, for the review list
      // kissflow-build/END-USER-CLEANUP-REVIEW-2026-10-28.md. Looking only: no write is refused.
      const at = async (route, tid, tag) => {
        await t.go(route);
        await t.seeTid(tid, `${tag}: ${route} renders`);
        await t.settle(200);
        // 28 Oct: the criteria RMES is retired on every screen
        t.check(`${tag}: no criteria or findings UI`, (await t.ui.locator(OLD_RMES_UI).count()) === 0, await t.ui.locator(OLD_RMES_UI).count());
        await t.shot(tag);
      };
      // each persona on its own page load (the host's call log starts again with each)
      const as = async (who, params) => {
        await open(t, params);
        return async () => t.check(`${who}: looking only, no write was refused`, (await refusedCalls(t)).length === 0, await refusedCalls(t));
      };
      let done = await as("RMM", { roles: "rmm", byid: "1", env: "prod" });
      await at("/rmm", "tile-my-open", "rmm-dashboard");
      await at("/cases", "cases-search", "rmm-cases");
      await at("/cases/ZZT-0003", "case-facts", "case-overview");
      await at("/cases/ZZT-0003?tab=questionnaire&s=scope", "q-scope", "case-questionnaire-scope");
      await at("/cases/ZZT-0003?tab=questionnaire&s=K1", "q-tab", "case-questionnaire-section");
      await at("/cases/ZZT-0003?tab=notes", "case-header", "case-notes");
      await at("/cases/ZZT-0003?tab=history", "history-events", "case-history");
      await at("/cases/ZZT-0005?tab=final-document", "final-document", "case-final-document");
      await at("/cases/new", "newcase-form", "new-case");
      await at("/suppliers", "supplier-search", "suppliers");
      await t.ui.locator('[data-testid^="supplier-row-"]').first().click().catch(() => {});
      await t.seeTid("supplier-title", "supplier detail renders");
      await t.settle(200);
      await t.shot("supplier-detail");
      await done();
      done = await as("Safety", { roles: "saf", byid: "1", env: "prod" });
      await at("/review", "review-queue", "review-queue");
      await at("/review/ZZT-0003", "review-workspace", "review-workspace");
      await at("/review/ZZT-0003?tab=rmes", "rmes-tab", "review-rmes");
      await done();
      done = await as("Business administrator", { roles: "admin", env: "prod" });
      await at("/admin/rules", "rules-tab", "admin-rules");
      await at("/admin/templates", "section-add", "admin-questionnaire");
      await at("/admin/ownership", "main-nav", "admin-owners");
      await at("/admin/templates?section=K1", "section-editor", "admin-section");
      await at("/admin/notifications", "run-reminders-card", "admin-reminders");
      await done();
      done = await as("Auditor", { roles: "auditor", env: "prod" });
      await at("/audit", "audit-trail", "auditor-audit-trail");
      await at("/admin/rules", "admin-read-only", "auditor-rules");
      await done();
      // 29 Oct (Thomas): the departments read the configuration too, read-only
      done = await as("Safety reviewer", { roles: "saf", env: "prod" });
      await at("/admin/rules", "admin-read-only", "saf-rules");
      await at("/admin/templates", "admin-read-only", "saf-questionnaire");
      await at("/admin/ownership", "admin-read-only", "saf-owners");
      await done();
      done = await as("Business owner", { roles: "owner", env: "prod" });
      await at("/reports", "reports", "owner-reports");
      await done();
    }),
  "read-refusals": () =>
    scenario("read-refusals", async (t) => {
      // Quality Management with tonight's grants: no flow Admin, no viewer route (R-1)
      await open(t, { roles: "qm" });
      await t.go("/review/ZZT-0003");
      await t.seeTid("review-workspace", "the review workspace still opens");
      await t.seeTid("case-banner", "the case banner says the questionnaire could not be read");
      t.check("dev: the case banner keeps Kissflow's reason (C8)", /^Kissflow did not let your role read this case's questionnaire \(.+\)\. You see its header, reviews and open points\.$/.test((await t.tid("case-banner").first().innerText()).trim()), await t.tid("case-banner").first().innerText());
      t.check("dev: the load box lists what could not be read, raw (C1), behind Details (C9)", (await t.tid("load-warnings-list").count()) === 1 && /could not be read in full for your role/.test(await t.tid("load-warnings-list").first().textContent()) && (await t.ui.locator('[data-testid="load-warnings"] summary a', { hasText: "Details" }).count()) === 1);
      await t.see("OP-0003-04", "the open points are there (from the items and the audit snapshots)");
      t.check("no write", (await writes(t)).length === 0, summary(await writes(t)));
      await t.go("/diagnostics");
      await t.seeTid("diagnostics");
      const ok = async (id) => t.tid(id).first().getAttribute("data-ok").catch(() => null);
      t.check("Diagnostics: the admin read of CIQ Case refused", (await ok("diag-read-case-admin")) === "0", await ok("diag-read-case-admin"));
      t.check("Diagnostics: the by-id read of CIQ Case refused", (await ok("diag-read-case-byId")) === "0", await ok("diag-read-case-byId"));
      t.check("Diagnostics: the audit snapshots serve the cases", (await ok("diag-read-case-snapshot")) === "1", await ok("diag-read-case-snapshot"));
      t.check("Diagnostics: the own review step is read through My tasks", (await ok("diag-read-review-tasks")) === "1", await ok("diag-read-review-tasks"));
      t.check("dev: Diagnostics shows every card unfolded (no Technical details fold), with Kissflow's raw refusals", (await t.tid("diag-technical").count()) === 0 && (await t.tid("diag-acting").isVisible()) && /KISSFLOW_ERROR/.test(await t.tid("diagnostics").innerText()));
      await t.shot("diagnostics");
    }),
  "stale-op": () =>
    scenario("stale-op", async (t) => {
      await open(t, { roles: "rmm", byid: "1" });
      await t.go("/review/ZZT-0003?op=OP-0003-01");
      await t.seeTid("op-decide-OP-0003-01", "RMM can decide on the answered point");
      // the supplier answered again after the load (I-4 wrote the point)
      await t.set("PkOpOP000301", { Response_Text: "Updated: 24 months, see the new CoA." });
      const n = (await t.calls()).length;
      const audits = (await t.rows(F.audit)).length;
      const toasts = (await t.toastLog()).length;
      await t.act("op-accept-OP-0003-01");
      t.check("the accept is refused with the reload toast", !!(await t.waitToast(/This open point changed in the meantime/, toasts)), (await t.toastLog()).slice(toasts));
      t.check("nothing written on the point", (await writeSeq(t, "op", n)).length === 0, await writeSeq(t, "op", n));
      t.check("no audit row", (await auditSince(t, audits)).length === 0);
      await t.see("Updated: 24 months", "the reload shows the newer answer");
    }),
  "write-refused": () =>
    scenario("write-refused", async (t) => {
      await open(t, { roles: "rmm", byid: "1", refuse: "PROCESS_UPDATE_ITEM" });
      await t.go("/review/ZZT-0003?op=OP-0003-01");
      await t.seeTid("op-decide-OP-0003-01", "RMM can decide on the answered point");
      const audits = (await t.rows(F.audit)).length;
      const toasts = (await t.toastLog()).length;
      await t.act("op-accept-OP-0003-01");
      t.check("a danger toast “Not saved: …”", !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
      t.check("no audit row", (await auditSince(t, audits)).length === 0);
      t.check("the point is still open in Kissflow", !(await t.rows(F.op)).find((x) => x._id === "PkOpOP000301").OP_Outcome);
      await t.seeTid("op-decide-OP-0003-01", "the reload shows the point undecided again");
    }),
  "kept-on-failure": () =>
    scenario("kept-on-failure", async (t) => {
      // APP-SAVING-GAPS gap 6 (the portal's AnswerDrawer): a screen that waits for its save says "Sending…", and when the
      // save fails it keeps what the user typed; sent again once Kissflow answers, it clears or closes
      await open(t, { roles: "rmm", byid: "1" });
      await t.go("/review/ZZT-0003?s=K1");
      await t.seeTid("review-workspace", "the review workspace");
      // 1. an internal note (the CIQ Internal Note create refused)
      const NOTE = "Checked the CoA against the SDS: one value to clarify with Safety.";
      await t.fillText("note-input", NOTE);
      await t.refuse("DATAFORM_CREATE_ITEM");
      await t.lag(300);
      let toasts = (await t.toastLog()).length;
      await t.tid("note-add").first().click();
      let busy = await t.button("note-add");
      t.check("Add note says “Sending…” and is disabled while the note is saved", busy.disabled && busy.text === "Sending…", busy);
      t.check("… and the text stays in the box meanwhile", (await t.value("note-input")) === NOTE, await t.value("note-input"));
      await t.lag(0);
      await t.settle();
      t.check("the note: “Not saved: …”", !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
      t.check("a failed note keeps its text", (await t.value("note-input")) === NOTE, await t.value("note-input"));
      busy = await t.button("note-add");
      t.check("… and Add note can be clicked again", !busy.disabled && busy.text === "Add note", busy);
      t.check("Kissflow holds no such note", !(await t.rows(F.note)).some((x) => x.Note_Text === NOTE));
      await t.refuse("DATAFORM_CREATE_ITEM", false);
      await t.act("note-add");
      t.check("sent again: Kissflow holds the note and the box is empty", (await t.rows(F.note)).some((x) => x.Note_Text === NOTE) && (await t.value("note-input")) === "", await t.value("note-input"));
      // 2. a question to the supplier (the CIQ Open Point create refused): the modal stays open with it
      const ops = (await t.rows(F.op)).map((x) => x._id);
      const Q = "Please confirm the storage temperature range.";
      await t.tid("ask-section-K1").first().click();
      await t.fillText("ask-question", Q);
      await t.fillText("ask-justification", "Needed for the assessment.");
      await t.refuse("PROCESS_CREATE_ITEM");
      await t.lag(300);
      toasts = (await t.toastLog()).length;
      await t.tid("ask-send").first().click();
      busy = await t.button("ask-send");
      t.check("Send to supplier says “Sending…” and is disabled while the point is raised", busy.disabled && busy.text === "Sending…", busy);
      await t.lag(0);
      await t.settle();
      t.check("the raise: “Not saved: …”", !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
      const open1 = (await t.tid("ask-send").count()) === 1;
      t.check("a failed raise keeps the modal open with its question", open1 && (await t.value("ask-question")) === Q, [open1, open1 && (await t.value("ask-question"))]);
      t.check("Kissflow holds no new open point", (await t.rows(F.op)).every((x) => ops.includes(x._id)));
      await t.refuse("PROCESS_CREATE_ITEM", false);
      await t.act("ask-send");
      const op = (await t.rows(F.op)).find((x) => !ops.includes(x._id));
      t.check("sent again: Kissflow holds the point and the modal closes", op?.Question_Text === Q && (await t.tid("ask-send").count()) === 0, [op?.Question_Text, await t.tid("ask-send").count()]);
      // 2b. the modal is closed while its question is sent, and another one opened: the first one's answer leaves it open
      const cancel = () => t.ui.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await t.tid("ask-section-K1").first().click();
      await t.fillText("ask-question", "Please confirm the shelf life.");
      await t.fillText("ask-justification", "Needed for the assessment.");
      await t.lag(500);
      await t.tid("ask-send").first().click();
      await cancel();
      await t.tid("ask-section-K1").first().click();
      const Q2 = "Please confirm the packaging material.";
      await t.fillText("ask-question", Q2);
      await t.lag(0);
      await t.settle();
      const still = (await t.tid("ask-send").count()) === 1;
      t.check("a modal opened while an earlier question was sent stays open with its text", still && (await t.value("ask-question")) === Q2, [still, still && (await t.value("ask-question"))]);
      if (still) await cancel();
      // 3. returning an answer (the point's update refused): the point comes back answered, with the reason typed
      const round = (await t.item("PkOpOP000301")).Round_No;
      await t.go("/review/ZZT-0003?op=OP-0003-01");
      await t.seeTid("op-decide-OP-0003-01", "RMM can decide on the answered point");
      const R = "Please give the range in °C, not only “cool and dry”.";
      await t.tid("op-return-OP-0003-01").click();
      await t.fillText("op-decide-reason", R);
      await t.refuse("PROCESS_UPDATE_ITEM");
      toasts = (await t.toastLog()).length;
      await t.act("op-decide-confirm");
      t.check("the return: “Not saved: …”", !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
      await t.seeTid("op-decide-OP-0003-01", "the point is answered again on screen");
      const kept = (await t.tid("op-decide-reason").count()) === 1;
      t.check("a failed return keeps its reason", kept && (await t.value("op-decide-reason")) === R, [kept, kept && (await t.value("op-decide-reason"))]);
      t.check("the point is unchanged in Kissflow", (await t.item("PkOpOP000301")).Round_No === round, (await t.item("PkOpOP000301")).Round_No);
      await t.refuse("PROCESS_UPDATE_ITEM", false);
      await t.act("op-decide-confirm");
      t.check("sent again: the point goes back to the supplier (next round)", (await t.item("PkOpOP000301")).Round_No === round + 1 && (await t.tid("op-decide-OP-0003-01").count()) === 0, (await t.item("PkOpOP000301")).Round_No);
      // 4. closing the next answer as not accepted (refused): on screen the point moves to the closed ones at once, and
      // comes back answered with the reason (the panel keeps it, not the point's card)
      await playAnswer(t, "PkOpOP000301", "Between 5 and 25 °C.");
      await t.reload();
      await t.go("/review/ZZT-0003?op=OP-0003-01");
      await t.seeTid("op-decide-OP-0003-01", "RMM can decide on the next answer");
      const N = "The range does not cover transport in summer.";
      await t.tid("op-not-accepted-OP-0003-01").click();
      await t.fillText("op-decide-reason", N);
      await t.refuse("PROCESS_UPDATE_ITEM");
      toasts = (await t.toastLog()).length;
      await t.act("op-decide-confirm");
      t.check("not accepted: “Not saved: …”", !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
      await t.seeTid("op-decide-OP-0003-01", "the point is answered again on screen");
      const keptN = (await t.tid("op-decide-reason").count()) === 1;
      const choice = keptN ? (await t.button("op-decide-confirm")).text : null;
      t.check("a failed “not accepted” keeps its reason and the choice", keptN && (await t.value("op-decide-reason")) === N && choice === "Close as not accepted", [keptN, keptN && (await t.value("op-decide-reason")), choice]);
      await t.refuse("PROCESS_UPDATE_ITEM", false);
      await t.act("op-decide-confirm");
      const done = await t.item("PkOpOP000301");
      t.check("sent again: the point is closed as not accepted", !!done.OP_Outcome && (await t.tid("op-decide-OP-0003-01").count()) === 0, done.OP_Outcome);
    }),
  "decision-kept-on-failure": () =>
    scenario("decision-kept-on-failure", async (t) => {
      // gap 6 for the Safety decision (28 Oct: it replaced the RMES findings as the reviewer's only RMES-side input): a
      // rejection whose save fails keeps the choice and the reason typed; sent again once Kissflow answers, it is saved
      await open(t, { roles: "saf", byid: "1" });
      await t.go("/review/ZZT-0003");
      await t.seeTid("decision-card", "the Safety decision card");
      const R = "The arsenic evidence covers one batch only.";
      await t.tid("decision-choice").getByRole("button", { name: "Rejected", exact: true }).click();
      await t.fillText("decision-reason", R);
      await t.refuse("PROCESS_UPDATE_ITEM");
      const toasts = (await t.toastLog()).length;
      await t.act("decision-record");
      t.check("the rejection: “Not saved: …”", !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
      const open1 = (await t.tid("decision-record").count()) === 1;
      const pressed = open1 ? await t.tid("decision-choice").getByRole("button", { name: "Rejected", exact: true }).getAttribute("aria-pressed").catch(() => null) : null;
      t.check("a failed rejection keeps the card open with the reason", open1 && (await t.value("decision-reason")) === R, [open1, open1 && (await t.value("decision-reason"))]);
      t.check("… and the choice (“Record rejection”)", open1 && (await t.button("decision-record")).text === "Record rejection", [pressed, open1 && (await t.button("decision-record")).text]);
      t.check("Kissflow holds no decision", !(await t.item("PkRevZZT0003SAF1")).RMES_Decision, (await t.item("PkRevZZT0003SAF1")).RMES_Decision);
      await t.refuse("PROCESS_UPDATE_ITEM", false);
      await t.act("decision-record");
      const rev = await t.item("PkRevZZT0003SAF1");
      t.check("sent again: Kissflow holds Rejected with the reason, and the card shows it", rev.RMES_Decision === "Rejected" && rev.RMES_Decision_Reason === R && (await t.tid("decision-record").count()) === 0, [rev.RMES_Decision, rev.RMES_Decision_Reason]);
    }),
  "new-case-failed": () =>
    scenario("new-case-failed", async (t) => {
      // gap 6: New case waits for Kissflow; a case that was not created leaves the form as it was (no "Case not found")
      await open(t, { roles: "rmm" });
      const cases = (await t.rows(F.case)).map((x) => x._id);
      await t.go("/cases/new");
      await t.seeTid("newcase-form", "the New case form");
      await t.fillText("newcase-material", "HELIOSOFT 200");
      await t.fillText("newcase-inci", "Helianthus Annuus Seed Oil");
      await t.fillText("newcase-material-no", "RM-405217");
      await t.tid("newcase-supplier-SUP-ZZT-SOLVARO").click();
      await t.refuse("PROCESS_CREATE_ITEM");
      await t.lag(300);
      const toasts = (await t.toastLog()).length;
      await t.tid("newcase-submit").click();
      const busy = await t.button("newcase-submit");
      t.check("Create case says “Sending…” and is disabled while the case is created", busy.disabled && busy.text === "Sending…", busy);
      t.check("… and the case shown meanwhile is no duplicate of itself", (await t.tid("newcase-duplicate-warning").count()) === 0);
      await t.lag(0);
      await t.settle();
      t.check("“Not saved: …”", !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
      const hash = await t.hash();
      const form = hash === "#/cases/new" && (await t.tid("newcase-form").count()) === 1;
      t.check("New case stays on the form, as it was filled in", form && (await t.value("newcase-material")) === "HELIOSOFT 200" && (await t.value("newcase-material-no")) === "RM-405217", [hash, form && (await t.value("newcase-material"))]);
      await t.notSee("Case not found", "no “Case not found”");
      t.check("Kissflow holds no new case", (await t.rows(F.case)).every((x) => cases.includes(x._id)));
      await t.refuse("PROCESS_CREATE_ITEM", false);
      await t.act("newcase-submit");
      const item = (await t.rows(F.case)).find((x) => !cases.includes(x._id));
      t.check("sent again: Kissflow holds the case and the UI opens it", !!item && (await t.hash()).startsWith(`#/cases/${item.Case_Code}`), [item?.Case_Code, await t.hash()]);
      // the form left while its case is created (Cancel): the late answer does not pull the user to the new case
      const known = (await t.rows(F.case)).map((x) => x._id);
      await t.go("/cases/new");
      await t.seeTid("newcase-form", "the New case form again");
      await t.fillText("newcase-material", "HELIOSOFT 300");
      await t.fillText("newcase-inci", "Helianthus Annuus Seed Oil");
      await t.fillText("newcase-material-no", "RM-405218");
      await t.tid("newcase-supplier-SUP-ZZT-SOLVARO").click();
      await t.lag(500);
      await t.tid("newcase-submit").click();
      await t.ui.getByRole("button", { name: "Cancel", exact: true }).click();
      const left = await t.hash();
      await t.lag(0);
      await t.settle();
      const later = (await t.rows(F.case)).find((x) => !known.includes(x._id));
      t.check("a case created after the form was left does not open by itself", !!later && left !== "#/cases/new" && (await t.hash()) === left, [later?.Case_Code, left, await t.hash()]);
    }),
  "reload-kept": () =>
    scenario("reload-kept", async (t) => {
      // APP-SAVING-GAPS gap 8: a reload that could not read a part again shows that part as the last load read it, so
      // what the reviewer typed stays: the RMES list refused on Reload keeps the record (and the decision reason typed);
      // since 28 Oct the record is never read item by item (no criteria), so its list is the only RMES read
      await open(t, { roles: "saf", byid: "1" });
      await t.go("/review/ZZT-0003");
      await t.seeTid("decision-card", "the Safety decision card");
      const NOTE = "Nickel checked against the CoA; waiting for the second batch.";
      await t.fillText("decision-reason", NOTE);
      const warned = async () => ((await t.tid("load-warnings").count()) ? (await t.tid("load-warnings").first().textContent()) ?? "" : "");
      await t.refuse("DATAFORM_GET_ITEMS@rmesSAF");
      await t.reload();
      const kept = (await t.tid("decision-reason").count()) === 1;
      t.check("the RMES list refused on Reload: the reason typed stays", kept && (await t.value("decision-reason")) === NOTE, kept && (await t.value("decision-reason")));
      t.check("… the decision can still be recorded (the record is kept from the earlier read)", kept && !(await t.button("decision-record")).disabled && (await t.tid("decision-no-record").count()) === 0);
      t.check("… with a warning that it is shown as of the earlier read", /shown as of \d{2}:\d{2}/.test(await warned()), await warned());
      await t.refuse("DATAFORM_GET_ITEMS@rmesSAF", false);
      await t.reload();
      t.check("read again: no “shown as of” warning", !/shown as of/.test(await warned()), await warned());
      t.check("… and the reason is still there", (await t.value("decision-reason")) === NOTE);
      t.check("no load read an RMES record item by item", (await t.calls((c) => c.command === "DATAFORM_GET_ITEM" && (c.flowId === F.rmesSAF || c.flowId === F.rmesREG))).length === 0);
    }),
  "step-kept": () =>
    scenario("step-kept", async (t) => {
      // gap 8 after a step move: the read after closing a point could not read the point list again, so it shows the
      // points as the last load read it; the screen keeps the close (the optimistic state) instead of showing the point
      // open again, and the next read that answers shows Kissflow's
      await open(t, { roles: "rmm", byid: "1" });
      const OP = "OP-0003-02";
      await t.go(`/review/ZZT-0003?op=${OP}`);
      await t.seeTid(`op-close-${OP}`, "RMM can close its own open point");
      await t.tid(`op-close-${OP}`).first().click();
      await t.fillText("op-close-reason", "Covered by the safety data sheet.");
      await t.refuse("PROCESS_GET_MY_TASKS_ITEMS@op");
      await t.act("op-close-confirm");
      const it = (await t.rows(F.op)).find((x) => x.OP_Key === OP);
      t.must("Kissflow holds the point closed", it?.OP_Outcome === "Withdrawn" && it?._status === "Completed", [it?.OP_Outcome, it?._status]);
      const warned = async () => ((await t.tid("load-warnings").count()) ? (await t.tid("load-warnings").first().textContent()) ?? "" : "");
      t.check("the read after it says the open points are shown as of the earlier read", /CIQ Open Point shown as of/.test(await warned()), await warned());
      t.check("… and the screen keeps the point closed (no Close button for it again)", (await t.tid(`op-close-${OP}`).count()) === 0, await t.tid(`op-close-${OP}`).count());
      await t.refuse("PROCESS_GET_MY_TASKS_ITEMS@op", false);
      await t.reload();
      t.check("read again: closed, as Kissflow holds it", (await t.tid(`op-close-${OP}`).count()) === 0 && !/CIQ Open Point shown as of/.test(await warned()), [await t.tid(`op-close-${OP}`).count(), await warned()]);
    }),
  "complete-fresh": () =>
    scenario("complete-fresh", async (t) => {
      // APP-SAVING-GAPS gap 9: Complete review decides from what Kissflow holds when it runs. Since 28 Oct the Safety
      // gate is its own open points, the RMES record's presence and the decision: with the RMES list refused, the
      // completion is refused as not read again (it can't see the record); read again, a legacy row that still holds an
      // unrecorded criterion and an open blocking finding (the criteria RMES, retired) does not block it
      await open(t, { roles: "rmm,saf", byid: "1" });
      await playCompleteness(t, CASE1);
      await t.reload();
      const saf = (await t.rows(F.review)).find((x) => x.Case_Item_Id === CASE1 && x.Review_Dept === "SAF");
      t.must("I-2 (E-A, played) started the Safety review of ZZT-0001", !!saf);
      await t.tid("role-switcher").click();
      await t.tid("switch-role-saf").click();
      await t.settle(800);
      const rmes = (await t.rows(F.rmesSAF)).find((x) => x.Case_Item_Id === CASE1);
      t.must("Safety's RMES row for ZZT-0001", !!rmes);
      const created = (await t.calls()).length;
      await t.go("/review/ZZT-0001");
      await t.seeTid("decision-card", "the Safety decision card");
      await t.tid("decision-choice").getByRole("button", { name: "Approved", exact: true }).click();
      await t.act("decision-record");
      await t.seeTid("complete-review", "Complete my review");
      // an older version of the app left criteria and findings on the record (legacy dev / prod rows)
      await t.page.evaluate(([flow, id]) => {
        const x = window.__kfDb[flow].find((r) => r._id === id);
        x["Table::Safety_Criteria"] = [{ _id: "Safety_Criteria_rowLegacy", Criteria_Code: "S-B1", Criteria_Part: "B", Criteria_Title: "LEGACY-CRITERION toxicological profile", Criteria_Applicable: "Yes" }];
        x["Table::Safety_Findings"] = [{ _id: "Safety_Findings_rowLegacy", Findings_Key: "ZZT-0001-SAF-F99", Findings_Criterion_Code: "S-B1", Findings_Text: "LEGACY-FINDING The CoA lacks the nickel limit.", Findings_Blocking: "Yes", Findings_State: "open" }];
        x._modified_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      }, [F.rmesSAF, rmes._id]);
      const status = async () => (await t.rows(F.review)).find((x) => x._id === saf._id)._status;
      await t.refuse("DATAFORM_GET_ITEMS@rmesSAF");
      let toasts = (await t.toastLog()).length;
      await t.act("complete-review");
      t.check("the RMES list refused: “Not completed: Kissflow could not read … CIQ RMES Safety … again”", !!(await t.waitToast(/^Not completed: Kissflow could not read .*CIQ RMES Safety.* again/, toasts)), (await t.toastLog()).slice(toasts));
      t.check("… and the Safety review is not completed in Kissflow", (await status()) !== "Completed", await status());
      await t.refuse("DATAFORM_GET_ITEMS@rmesSAF", false);
      t.must("Complete my review can be clicked again", !(await t.button("complete-review")).disabled);
      toasts = (await t.toastLog()).length;
      await t.act("complete-review");
      const done = (await t.rows(F.review)).find((x) => x._id === saf._id);
      t.check("read again: the legacy criterion and finding do not block; completed with RMES_Gaps 0", done._status === "Completed" && done.RMES_Gaps === 0 && done.Review_Gate === "OK", [done._status, done.RMES_Gaps, done.Review_Gate, (await t.toastLog()).slice(toasts)]);
      await t.go("/review/ZZT-0001?tab=rmes");
      await t.seeTid("rmes-tab", "the RMES tab");
      await t.notSee("LEGACY-", "the legacy criterion and finding are not on screen");
      t.check("no criteria or findings UI", (await t.ui.locator(OLD_RMES_UI).count()) === 0);
      t.check("after its creation's read-back, the RMES record was never read item by item", (await t.calls((c) => c.seq >= created && c.command === "DATAFORM_GET_ITEM" && c.flowId === F.rmesSAF)).length === 0);
    }),
  "notes-kept-on-failure": () =>
    scenario("notes-kept-on-failure", async (t) => {
      // APP-SAVING-GAPS gap 6 on the case page's Internal notes tab and on a section's note box (questionnaire): a note
      // that was not saved keeps its text; sent again, the box clears
      await open(t, { roles: "cus" });
      const places = [
        ["the Internal notes tab", "/cases/ZZT-0003?tab=notes", "note-text", "note-add", "HS code 1516 20: check the licence before asking the supplier."],
        ["the K7 note box", "/cases/ZZT-0003?tab=questionnaire&s=K7", "q-focus-note-K7", "q-focus-note-add-K7", "HS code 1516 20 to be checked against the CoA."],
      ];
      for (const [where, route, box, add, text] of places) {
        await t.go(route);
        await t.seeTid(box, `${where}: the note box`);
        await t.fillText(box, text);
        await t.refuse("DATAFORM_CREATE_ITEM");
        await t.lag(300);
        const toasts = (await t.toastLog()).length;
        await t.tid(add).first().click();
        const busy = await t.button(add);
        t.check(`${where}: Add note says “Sending…” and is disabled while the note is saved`, busy.disabled && busy.text === "Sending…", busy);
        await t.lag(0);
        await t.settle();
        t.check(`${where}: “Not saved: …”`, !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
        t.check(`${where}: a failed note keeps its text`, (await t.value(box)) === text, await t.value(box));
        t.check(`${where}: Kissflow holds no such note`, !(await t.rows(F.note)).some((x) => x.Note_Text === text));
        await t.refuse("DATAFORM_CREATE_ITEM", false);
        await t.act(add);
        t.check(`${where}: sent again, Kissflow holds the note and the box is empty`, (await t.rows(F.note)).some((x) => x.Note_Text === text) && (await t.value(box)) === "", await t.value(box));
      }
    }),
  "mentions": () =>
    scenario("mentions", async (t) => {
      // 27 Oct (Thomas, prod: "In Internal Note I am not able to mention anyone"): the colleagues of the CIQ roles are read
      // once in the background after the load (app-live/colleagues.ts); an RMM types "@" on a case's Internal notes, picks
      // a colleague only the role members name, saves, and the mail hook gets one mail to her (write/mail.ts)
      const ingrid = FX.directory.ingrid;
      await open(t, { roles: "rmm", hooks: "1", mail: "1", colleagues: "1" });
      const t0 = Date.now();
      while (Date.now() - t0 < 10000 && (await t.page.evaluate(() => (window.__kfDirReads ?? []).length)) < 12) await t.page.waitForTimeout(100);
      const reads = await t.page.evaluate(() => window.__kfDirReads ?? []);
      const roleReads = reads.filter((u) => u.startsWith("/app_role/2/"));
      t.check("the directory: the 11 CIQ roles by the per-role REST GET in the app, then the account's users once (12 calls)", roleReads.length === 11 && roleReads.every((u) => u.includes("_application_id=CIQ_Digital_A00")) && reads.filter((u) => u.startsWith("/user/2/")).length === 1 && reads.length === 12, reads);
      t.check("… none of them is a write", (await writes(t, (c) => c.command === "API" && /app_role|\/user\//.test(c.url || ""))).length === 0);
      await t.go("/cases/ZZT-0003?tab=notes");
      await t.seeTid("note-text", "the Internal notes tab has its note box");
      const box = await t.box("note-text");
      await box.click();
      await box.pressSequentially("@");
      await t.seeTid("mention-list", "typing @ opens the mention list");
      await t.seeTid(`mention-option-${ingrid._id}`, "the list shows a colleague only the role members name (Ingrid Nolte, QM)");
      const option = await t.tid(`mention-option-${ingrid._id}`).innerText().catch(() => "");
      t.check("… with her role's department", /Ingrid Nolte/.test(option) && /Quality Management/.test(option), option);
      const ids = await t.tid("mention-list").locator('[role="option"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
      t.check("… and the other role members (Safety, Regulatory, …)", ids.includes(`mention-option-${FX.users.saf._id}`) && ids.includes(`mention-option-${FX.users.reg._id}`), ids);
      t.check("… never the writer, never the portal user in the RMM role (Kind ExternalUser)", !ids.includes(`mention-option-${FX.users.rmm._id}`) && !ids.includes(`mention-option-${FX.contacts.elena._id}`), ids);
      t.check("… no 'can't be listed' line", (await t.tid("mention-unlisted").count()) === 0);
      await t.shot("list");
      await box.pressSequentially("Ingr");
      t.check("typing filters to her", Number(await t.tid("mention-list").getAttribute("data-count")) === 1, await t.tid("mention-list").getAttribute("data-count"));
      await t.tid(`mention-option-${ingrid._id}`).click();
      t.check("picking her inserts @Ingrid Nolte", (await t.value("note-text")) === "@Ingrid Nolte ", await t.value("note-text"));
      await box.pressSequentially("please check the microbiology limits.");
      await t.hooks(); // nothing before the note
      const toasts = (await t.toastLog()).length;
      const notes0 = (await t.rows(F.note)).length;
      await t.act("note-add");
      const toast = await t.waitToast(/^Note added\./, toasts);
      t.check("toast: “Note added. 1 colleague notified by e-mail.”", toast === "Note added. 1 colleague notified by e-mail.", toast);
      const row = (await t.rows(F.note)).slice(notes0)[0];
      t.check("Kissflow holds the note with her as the mention", !!row && row.Note_Text === "@Ingrid Nolte please check the microbiology limits." && row.Note_Mentions_Emails === ingrid.Email && row.Note_Mentions_Names === "Ingrid Nolte", row && { text: row.Note_Text, emails: row.Note_Mentions_Emails, names: row.Note_Mentions_Names });
      const hooks = await t.hooks();
      const mails = hooks.filter((h) => h.code === "mail");
      t.check("the mail hook got ONE mail, by the browser's fetch, on the running account's hook", mails.length === 1 && byFetch(mails[0]) && mails[0].url === `${DEV_PARENT}/integration/2/AcDOSunMEpSA/webhook/ZZTtok_mail`, hooks.map((h) => [h.code, h.route, h.url]));
      const m = mails[0]?.body ?? {};
      t.check("… {To, Subject, Body}, to her alone", keysOf(m) === "Body,Subject,To" && m.To === ingrid.Email, m.To);
      t.check("… subject “Katrin Vogel mentioned you on ZZT-0003”", m.Subject === `${FX.users.rmm.Name} mentioned you on ZZT-0003`, m.Subject);
      const trade = (await t.item(CASE3))?.Trade_Name;
      // 27 Oct: the shared e-mail layout like the supplier mails: the case code and trade name, the note as a quote, the
      // button to the app's home page and the internal audience line
      t.check("… the shared e-mail layout: the case code and trade name, the note, the button to the app's home page", isMailLayout(m.Body) && m.Body.includes(`on ZZT-0003 (${mailText(trade)}).</p>`) && m.Body.includes(">@Ingrid Nolte please check the microbiology limits.</td>") && m.Body.includes(`<a href="${DEV_PARENT}/view/application/CIQ_Digital_A00/ui" target="_blank"`) && m.Body.includes(">Open CIQ Digital</a>"), m.Body);
      t.check("… and the internal audience line", typeof m.Body === "string" && m.Body.includes(">Internal notes are for Beiersdorf only; the supplier never sees them.</p>"), m.Body?.slice(-600));
      await t.seeTid("mention-chip", "the saved note shows her mention as a chip");
      t.check("… naming her", (await t.tid("mention-chip").first().getAttribute("data-user")) === ingrid._id, await t.tid("mention-chip").first().getAttribute("data-user"));
      await t.shot("sent");
      await t.go("/diagnostics");
      await t.seeTid("diag-colleagues", "Diagnostics lists the colleague reads");
      t.check("… ready, from the role members", (await t.tid("diag-colleagues").getAttribute("data-status")) === "ready" && /from the CIQ roles' members/.test(await t.tid("diag-colleagues").innerText()), (await t.tid("diag-colleagues").innerText()).slice(0, 300));
    }),
  "mentions-refused": () =>
    scenario("mentions-refused", async (t) => {
      // 27 Oct: a role that may read neither the CIQ roles' members nor the account's users: nobody is added, the list says
      // so in one line, Diagnostics (dev) says why; the load is not affected
      await open(t, { roles: "rmm", colleagues: "refuse" });
      const t0 = Date.now();
      while (Date.now() - t0 < 10000 && (await t.page.evaluate(() => (window.__kfDirReads ?? []).length)) < 12) await t.page.waitForTimeout(100);
      await t.settle();
      const refused = (await t.calls((c) => c.command === "API" && /^\/(app_role|user)\/2\//.test(c.url || ""))).map((c) => c.refused || "answered");
      t.check("both reads were tried and refused (11 roles, the account's users)", refused.length === 12 && refused.every((r) => /050302/.test(r)), refused);
      t.check("the load stands: the dashboard and no load error", await t.tid("main-nav").isVisible() && (await t.tid("load-failed").count()) === 0);
      await t.go("/cases/ZZT-0003?tab=notes");
      await t.seeTid("note-text", "the Internal notes tab has its note box");
      const box = await t.box("note-text");
      await box.click();
      await box.pressSequentially("@");
      await t.seeTid("mention-unlisted", "typing @ shows the line");
      t.check("… “Colleagues can't be listed for your role here.”", (await t.tid("mention-unlisted").innerText()) === "Colleagues can't be listed for your role here.", await t.tid("mention-unlisted").innerText());
      t.check("… and no colleague only the role members would name", (await t.tid(`mention-option-${FX.directory.ingrid._id}`).count()) === 0);
      await box.pressSequentially("Ingrid");
      const lines = await t.tid("mention-list").locator("li").evaluateAll((els) => els.map((e) => e.textContent));
      t.check("… “@Ingrid”: the list is that one line", lines.length === 1 && lines[0] === "Colleagues can't be listed for your role here.", lines);
      await t.shot("unlisted");
      await box.press("Escape");
      await t.go("/diagnostics");
      await t.seeTid("diag-colleagues", "Diagnostics lists the colleague reads");
      const diag = await t.tid("diag-colleagues").innerText();
      t.check("… nobody listed, and why (dev: Kissflow's refusal)", (await t.tid("diag-colleagues").getAttribute("data-status")) === "unlisted" && /Nobody could be listed/.test(diag) && /050302/.test(diag), diag.slice(0, 400));
    }),
  "prod-plain-reads": () =>
    scenario("prod-plain-reads", async (t) => {
      // FE-CLEANUP C1, C8, C9, C26 (22 Oct): Quality Management with tonight's grants (no flow Admin, no viewer route):
      // production says in one line that some data could not be loaded, the case banner says what it means, and nothing
      // on the main screens names a Kissflow code, flow, field or item id; Diagnostics shows Unsent items first and folds
      // the technical cards away. Dev (read-refusals) keeps the raw lists.
      await open(t, { roles: "qm", env: "prod" });
      await t.seeTid("load-warnings", "C1: the load notice");
      const notice = (await t.tid("load-warnings").first().innerText()) ?? "";
      t.check("C1: one plain line with Reload and Details, no list", /^Some data could not be (loaded, so this page may be incomplete|refreshed; parts of the page show the state of \d{2}:\d{2})\. Reload · Details/.test(notice.trim()) && (await t.tid("load-warnings-list").count()) === 0, notice);
      let text = await mainText(t);
      t.check("the landing page and its banners carry no technical token", text.length > 100 && !TECH.test(text), [text.length, techIn(text)]);
      await t.go("/review/ZZT-0003");
      await t.seeTid("review-workspace", "the review workspace opens");
      await t.seeTid("case-banner", "the case banner");
      t.check("C8: the case banner says what it means, without Kissflow's reason", (await t.tid("case-banner").first().innerText()).trim() === "The questionnaire of this case could not be loaded for your role. You see its header, reviews and open points. If you need the answers, tell your CIQ administrator.", await t.tid("case-banner").first().innerText());
      text = await mainText(t);
      t.check("the review workspace and its banners carry no technical token", text.length > 100 && !TECH.test(text), [text.length, techIn(text)]);
      await t.ui.locator('[data-testid="load-warnings"] a', { hasText: "Details" }).first().click();
      await t.seeTid("diagnostics", "C9: Details opens Diagnostics");
      const order = await t.frame().evaluate(() => [...document.querySelectorAll('[data-testid="diagnostics"] > *')].map((e) => e.getAttribute("data-testid") || e.querySelector("h2, h3")?.textContent || e.tagName));
      t.check("C26: Unsent items first, then what could not be loaded, then the folded technical details", order.indexOf("diag-drafts") === 1 && order.at(-1) === "diag-technical", order);
      t.check("… folded: the session and the reads are not shown until opened", (await t.tid("diag-technical").getAttribute("open")) === null && !(await t.tid("diag-acting").isVisible()), await t.tid("diag-technical").getAttribute("open"));
      await t.see("For support: what CIQ Digital could read and save in this session.", "C26: the support subtitle");
      // what a tester reads there (below the page title "Diagnostics"): what could not be loaded in plain words;
      // Kissflow's own warnings are folded away with the rest
      const shown = await t.frame().evaluate(() => [...document.querySelectorAll('[data-testid="diagnostics"] > *')].slice(1).map((e) => e.innerText).join("\n"));
      t.check("C26: the unfolded part of Diagnostics carries no technical token", shown.length > 50 && !TECH.test(shown), [shown.length, techIn(shown)]);
      t.check("… it says what could not be loaded plainly, and what to do", /What could not be loaded\s+Some data could not be (loaded, so some pages may be incomplete|refreshed; parts of the pages show the state of \d{2}:\d{2})\.[\s\S]*If it stays after a reload, tell your CIQ administrator: the technical details below show what failed\./.test(shown), shown);
      await t.tid("diag-technical").locator("summary").click();
      t.check("… and Kissflow's own warnings are in the Technical details", /could not be read in full for your role/.test(await t.tid("diag-warnings").innerText()));
    }),
  "prod-plain-writes": () =>
    scenario(
      "prod-plain-writes",
      async (t) => {
        // C12, C13 (22 Oct): in production a refused write says so plainly ("Not saved: Kissflow did not allow this for
        // your role."), and a hand-off that fails after its save says what it means for the supplier; the Writes log
        // keeps Kissflow's raw answer (Technical details)
        await open(t, { roles: "rmm", byid: "1", env: "prod", refuse: "PROCESS_UPDATE_ITEM" });
        await t.go("/review/ZZT-0003?op=OP-0003-01");
        await t.seeTid("op-decide-OP-0003-01", "RMM can decide on the answered point");
        let toasts = (await t.toastLog()).length;
        await t.act("op-accept-OP-0003-01");
        const refused = await t.waitToast(/^Not saved: /, toasts);
        t.check("C12: “Not saved: Kissflow did not allow this for your role.”", refused === "Not saved: Kissflow did not allow this for your role.", (await t.toastLog()).slice(toasts));
        await t.go("/diagnostics");
        await t.tid("diag-technical").locator("summary").click();
        const detail = t.ui.locator('[data-testid="diag-write"][data-method="reviewResponse"] [data-testid="diag-write-detail"]');
        t.check("… and the Writes log keeps Kissflow's answer", (await detail.count()) === 1 && /KISSFLOW_ERROR_050302/.test(await detail.innerText()), (await detail.count()) && (await detail.innerText()));
        t.blockHookFetch();
        await open(t, { roles: "mic", byid: "1", hooks: "1", refuse: "API:POST", env: "prod" });
        toasts = (await t.toastLog()).length;
        const op = await raiseOn(t, "ZZT-0003", "K1", "Please confirm the preservative system.");
        t.must("Microbiology raised an open point", !!op);
        const warn = await t.waitToast(/^Saved\. /, toasts);
        t.check("C13: the failed hand-off says what it means for the supplier, no code or cause", warn === "Saved. The supplier portal could not be updated just now, so the supplier may not see this change yet. Tell your CIQ administrator.", (await t.toastLog()).slice(toasts));
        const all = (await t.toastLog()).slice(toasts).join("\n");
        t.check("no toast of the run carries a technical token", !TECH.test(all), techIn(all));
      },
      {},
      { ignoreConsole: /Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/ },
    ),
  "prod-draft-send": () =>
    scenario("prod-draft-send", async (t) => {
      // A1, C29 (22 Oct): a new case whose submit Kissflow refused waits as an unsent item: production's toast names no
      // code, the shell says so on every page, and its link opens Diagnostics' Unsent items (first), where Send finishes it
      await open(t, { roles: "rmm", refuse: "PROCESS_SUBMIT_ITEM", env: "prod" });
      const cases = (await t.rows(F.case)).map((x) => x._id);
      await t.go("/cases/new");
      await t.seeTid("newcase-form", "the New case form");
      await t.fillText("newcase-material", "HELIOSOFT 200");
      await t.fillText("newcase-inci", "Helianthus Annuus Seed Oil");
      await t.fillText("newcase-material-no", "RM-405217");
      await t.tid("newcase-supplier-SUP-ZZT-SOLVARO").click();
      const toasts = (await t.toastLog()).length;
      await t.act("newcase-submit");
      const toast = await t.waitToast(/saved as a draft in Kissflow but not sent/, toasts);
      t.check("the toast: the plain cause and where to send it", /^Case \S+ was saved as a draft in Kissflow but not sent: Kissflow did not allow this for your role\. Use Unsent items at the top of the page to send or discard it\.$/.test(toast ?? ""), (await t.toastLog()).slice(toasts));
      const draft = (await t.rows(F.case)).find((x) => !cases.includes(x._id));
      t.must("Kissflow holds the draft", !!draft && draft._status === "Draft", draft?._status);
      await t.page.evaluate(() => REFUSE.delete("PROCESS_SUBMIT_ITEM"));
      await t.go("/rmm");
      await t.seeTid("unsent-banner", "A1: the unsent-items banner, on another page too");
      const banner = (await t.tid("unsent-banner").first().innerText()).trim();
      t.check("… naming the case by its code, without its Kissflow item id", banner.startsWith(`You have 1 unsent item: New case ${draft.Case_Code}`) && !TECH.test(banner), [banner, techIn(banner)]);
      await t.tid("unsent-open").click();
      await t.seeTid(`diag-draft-${draft._id}`, "Send or discard opens Diagnostics with the item");
      const first = await t.frame().evaluate(() => document.querySelector('[data-testid="diagnostics"] > [data-testid="diag-drafts"]') === document.querySelector('[data-testid="diagnostics"]').children[1]);
      t.check("C26: Unsent items is the first card", first);
      t.check("… listed without its process or item id", !(await t.tid(`diag-draft-${draft._id}`).innerText()).includes(draft._id));
      await t.act(`diag-draft-send-${draft._id}`);
      const sent = (await t.rows(F.case)).find((x) => x._id === draft._id);
      t.check("Send submits it", sent._current_step === FX.stepNames[FX.steps.case.waiting], sent._current_step);
      await t.go("/rmm");
      await t.page.waitForTimeout(300);
      t.check("the banner is gone once the item is sent", (await t.tid("unsent-banner").count()) === 0);
    }),
  "prod-activate": () =>
    scenario("prod-activate", async (t) => {
      // A13, C14 (22 Oct): since the load-time redesign I-2 starts the reviews (E-A, played by playCompleteness), so
      // RMM's load starts nothing and says nothing
      await open(t, { roles: "rmm", byid: "1", env: "prod" });
      const toasts = (await t.toastLog()).length;
      await playCompleteness(t, CASE1);
      const from = (await t.calls()).length;
      await t.reload();
      const reviews = (await t.rows(F.review)).filter((x) => x.Case_Item_Id === CASE1);
      t.must("I-2 (E-A, played) started the reviews of ZZT-0001", reviews.length > 1, reviews.length);
      await t.page.waitForTimeout(400);
      const shown = (await t.toastLog()).slice(toasts);
      t.check("RMM's load writes nothing and shows no toast (before: “Reviews started for ZZT-0001 (RMM, …).”)", (await writes(t, (c) => c.seq >= from)).length === 0 && shown.length === 0, [summary(await writes(t, (c) => c.seq >= from)), shown]);
    }),
  "prod-d2-honest": () =>
    scenario("prod-d2-honest", async (t) => {
      // D2 (22 Oct, Thomas decides whether to build them): the features this version lacks stay on screen, but stop
      // pretending they worked: the window says so and stays open, the refusal comes at once, no demo badge, no false
      // "Nothing due"
      // A4: Add a section (TC-23)
      await open(t, { roles: "mic", byid: "1", env: "prod" });
      await t.go("/review/ZZT-0003");
      await t.seeTid("review-workspace", "the review workspace");
      // the section list's button (the small-screen picker has a hidden twin); no CSS pseudo-class in this file: Tailwind
      // scans it and would emit a class for one
      const adds = t.ui.getByTestId("add-section");
      for (let i = 0; i < (await adds.count()); i++) if (await adds.nth(i).isVisible()) { await adds.nth(i).click(); break; }
      await t.seeTid("add-section-not-available", "A4: the window says adding a section is not available in this version");
      await t.fillText("add-section-justification", "Needed for the colourant.");
      let toasts = (await t.toastLog()).length;
      await t.tid("add-section-confirm").click();
      t.check("… the click gets the refusal toast (TC-23 step 3)", !!(await t.waitToast(/^Adding a section to the scope is not available in this version yet\.$/, toasts)), (await t.toastLog()).slice(toasts));
      await t.page.waitForTimeout(300);
      t.check("… and the window stays open (it no longer closes as if the section was added)", (await t.tid("add-section-confirm").count()) === 1);
      t.check("… nothing written", (await writes(t)).length === 0, summary(await writes(t)));
      // A8: a department's Reopen my review (TC-17 step 6)
      await open(t, { roles: "qm", byid: "1", env: "prod" });
      await t.go("/review/ZZT-0003");
      await t.seeTid("reopen-review", "QM's completed review offers Reopen my review");
      toasts = (await t.toastLog()).length;
      await t.tid("reopen-review").click();
      t.check("A8: the click gets “Ask RMM: …” at once", !!(await t.waitToast(/^Ask RMM: only RMM can restart a review in this version\.$/, toasts)), (await t.toastLog()).slice(toasts));
      t.check("… no reason box first", (await t.tid("reopen-reason").count()) === 0);
      // A6: Run reminders
      await open(t, { roles: "admin", env: "prod" });
      await t.go("/admin/notifications");
      await t.seeTid("run-reminders-card", "the Run reminders card stays");
      t.check("A6: no “Demo action” badge", !(await t.tid("run-reminders-card").innerText()).includes("Demo action"));
      toasts = (await t.toastLog()).length;
      await t.tid("run-reminders").click();
      t.check("… the click gets the refusal toast", !!(await t.waitToast(/^Running reminders is not available in this version yet\.$/, toasts)), (await t.toastLog()).slice(toasts));
      t.check("… and no false “Nothing due” status", !/Nothing due/.test(await t.tid("run-reminders-result").innerText()), await t.tid("run-reminders-result").innerText());
      // A9: deactivating a contact named on open cases
      await t.go("/suppliers/SUP-ZZT-SOLVARO");
      await t.seeTid(`contact-deactivate-${FX.contacts.elena._id}`, "Elena can be deactivated from the supplier page");
      await t.tid(`contact-deactivate-${FX.contacts.elena._id}`).click();
      await t.seeTid("contact-replace-not-available", "A9: the window says up front that replacing a contact is not available");
      const notice = (await t.tid("contact-replace-not-available").innerText()).trim();
      t.check("… that she can't be deactivated while named on open cases", notice === `${FX.contacts.elena.Name} can't be deactivated while named on open cases: replacing a contact on running cases is not available in this version yet.`, notice);
      for (const promise of ["The other case contact continues", "a replacement must take over", "(the other case contact continues)"]) await t.notSee(promise, `… and does not promise “${promise}”`);
      // a replacement chosen, as the window allows: Confirm is still refused, and the window stays open
      const picker = t.tid("contact-replacement").locator("select");
      if ((await picker.locator("option").count()) > 1) await picker.selectOption({ index: 1 });
      toasts = (await t.toastLog()).length;
      await t.tid("contact-deactivate-confirm").click();
      t.check("Confirm gets the refusal", !!(await t.waitToast(/^This contact is named on open cases\. Replacing a contact on running cases is not available in this version yet\.$/, toasts)), (await t.toastLog()).slice(toasts));
      await t.page.waitForTimeout(300);
      t.check("… and the window stays open", (await t.tid("contact-deactivate-confirm").count()) === 1);
      t.check("nothing written", (await writes(t)).length === 0, summary(await writes(t)));
    }),
  "live-waiting-texts": () =>
    scenario("live-waiting-texts", async (t) => {
      // 22 Oct: live as in the prototype, the reviews start at the confirmation (I-2 with E-A); only the RMES record
      // waits for a Safety or Regulatory reviewer's own load (load.ts runLoadEffects); in production, with no
      // technical token
      await open(t, { roles: "rmm", byid: "1", env: "prod" });
      await t.go("/cases/ZZT-0001");
      await t.see("The reviews start when the supplier confirms completeness.", "RMM, Overview > Reviews of a case still with the supplier (I-2 starts them, 22 Oct; TC-12 quotes the old text)");
      await t.go("/cases/ZZT-0003");
      // the final-release request goes on the last completion (E-B), as in the prototype
      await t.see("the supplier is asked for the final release once all have completed.", "RMM, Overview > Reviews of a case in review");
      let text = await mainText(t);
      t.check("… no technical token on the case page", !TECH.test(text), techIn(text));
      await open(t, { roles: "mic", byid: "1", env: "prod" });
      await t.go("/review/ZZT-0001");
      await t.seeTid("workspace-not-started", "Microbiology, the workspace of a case still with the supplier");
      await t.see("The review tasks are created when the supplier confirms completeness; you get an e-mail then.", "… says when its review task comes");
      for (const [role, want] of [
        ["rmm", "Your review of the whole CIQ starts on every case as soon as the supplier confirms completeness. You also get an e-mail."],
        ["saf", "A task appears when a supplier confirms completeness on a case with a Safety section. You also get an e-mail."],
      ]) {
        await open(t, { roles: role, empty: "1", env: "prod" });
        await t.go("/review");
        await t.see(want, `${role}, an empty review queue says when a task comes`);
      }
      text = await mainText(t);
      t.check("… no technical token on the queue", !TECH.test(text), techIn(text));
    }),
  "data-console": () =>
    scenario("data-console", async (t) => {
      // 26 Oct: the Admin / Developer role in PRODUCTION (no top bar), before the configuration seed is imported (no CIQ
      // Config Version rows): the data console is its landing page; it shows a process item and a form row with its
      // child table, imports the seed JSON as 12 rows one at a time (each read back), skips them on a second import,
      // reads the seed workbook to the same rows (the browser's DOMParser), edits and deletes a row, and edits and
      // deletes an open point through the admin routes. 26 Oct, after Thomas's 429s: each list is read once (the
      // overview's, reused by the flow pages), no current step is read until Show steps (then only the page's open
      // items), and a delete is ONE call with nothing read after it
      const seed = JSON.parse(readFileSync(SEED_JSON, "utf8"));
      const canon = (rows) => createHash("sha256").update(JSON.stringify(rows.map((r) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))))).digest("hex");
      await t.host({ roles: "developer", admin: "1", noConfig: "1", env: "prod" }, "/");
      await t.seeTid("data-overview", "Admin / Developer without a CIQ persona lands on the data console", 15000);
      t.check("… not the no-access page, at #/data", (await t.tid("no-role").count()) === 0 && (await t.hash()) === "#/data", await t.hash());
      t.check("… production: no top bar", (await t.tid("dev-top-bar").count()) === 0);
      await t.waitText("CIQ Config Version · 0 rows");
      await t.see("CIQ Config Version · 0 rows", "the overview counts the empty configuration form");
      await t.shot("overview");

      // the overview read each list once
      await t.page.waitForTimeout(400);
      const perFlow = Object.fromEntries(CONSOLE_FLOWS.map((k) => [k, 0]));
      for (const c of await t.calls(isList)) if (FLOW_OF[c.flowId] in perFlow) perFlow[FLOW_OF[c.flowId]]++;
      t.check("the overview reads every flow's list once", Object.values(perFlow).every((n) => n === 1), perFlow);

      // a process item: the case table (the overview's list; no step read until Show steps), then ZZT-0003's drawer
      const atCase = (await t.calls()).length;
      await t.tid("nav-data-flow-case").click();
      await t.seeTid("data-flow-case", "Cases: the admin list");
      await t.seeTid(`data-row-${CASE3}`, "… lists ZZT-0003");
      await t.page.waitForTimeout(600);
      t.check("… the overview's list, not read again", (await t.calls((c) => c.seq >= atCase && isList(c))).length === 0, callsOf(await t.calls((c) => c.seq >= atCase)));
      t.check("… no current step read on load (the admin list has none)", (await t.calls((c) => c.seq >= atCase && c.command === "PROCESS_GET_ADMIN_ITEM")).length === 0);
      const openCases = (await t.rows(F.case)).filter((x) => !["Completed", "Rejected", "Withdrawn", "Cancelled"].includes(x._status)).map((x) => x._id).sort();
      t.check(`Show steps offers the page's ${openCases.length} open items`, (await t.tid("data-show-steps").getAttribute("data-count")) === String(openCases.length), await t.tid("data-show-steps").innerText());
      await t.tid("data-show-steps").click();
      await t.page.waitForTimeout(600);
      const stepReads = (await t.calls((c) => c.seq >= atCase && c.command === "PROCESS_GET_ADMIN_ITEM")).map((c) => c.instanceId).sort();
      t.check("… and reads exactly their steps, once each", JSON.stringify(stepReads) === JSON.stringify(openCases), stepReads);
      t.check("… ZZT-0003's step shows", (await t.tid(`data-step-${CASE3}`).innerText()).trim() === (await t.item(CASE3))._current_step, await t.tid(`data-step-${CASE3}`).innerText());
      t.check("… Show steps has nothing left to read on this page", (await t.button("data-show-steps")).disabled);
      await t.tid(`data-row-${CASE3}`).click();
      await t.seeTid("data-view-Case_Code", "the case drawer shows its fields");
      const drawer = await t.tid("data-drawer").innerText();
      t.check("… ZZT-0003 with its step and a JSON field pretty-printed", drawer.includes("ZZT-0003") && /Beiersdorf review|Waiting for supplier|Create case/.test(drawer) && /Payload|_JSON/.test(drawer), drawer.slice(0, 300));
      await t.shot("case");
      await t.page.keyboard.press("Escape");

      // a form row with a child table: the list row lacks it, the drawer's full read has it
      await t.tid("nav-data-flow-supplier").click();
      await t.seeTid("data-row-PkSupSolvaro", "Suppliers: the form list");
      const from = (await t.calls()).length;
      await t.tid("data-row-PkSupSolvaro").click();
      await t.seeTid("data-table-Contacts", "the supplier drawer shows its Contacts table");
      t.check("… read in full (DATAFORM_GET_ITEM), with the contacts' rows", (await t.calls((c) => c.seq >= from && c.command === "DATAFORM_GET_ITEM" && c.itemId === "PkSupSolvaro")).length === 1 && (await t.tid("data-table-Contacts").innerText()).includes(FX.contacts.elena.Name));
      await t.shot("supplier");
      await t.page.keyboard.press("Escape");

      // the seed JSON into the empty configuration form
      await t.tid("nav-data-import").click();
      await t.seeTid("data-import", "the import page");
      await t.see("CIQ Config Version holds 0 rows now.", "… the configuration form is empty");
      await t.ui.locator('[data-testid="import-file"]').setInputFiles(SEED_JSON);
      await t.seeTid("import-preview", "the seed JSON is previewed");
      const preview = t.tid("import-preview");
      const jsonSha = await preview.getAttribute("data-rows-sha");
      t.check("… 12 rows, all new; the mapping keeps every column", (await preview.getAttribute("data-rows")) === "12" && (await t.ui.locator('[data-testid^="import-plan-"][data-status="new"]').count()) === 12 && (await t.tid("import-mapping").innerText()).includes("Release_Bundle_JSON"));
      t.check("… the rows' fingerprint is the file's", jsonSha === canon(seed), [jsonSha, canon(seed)]);
      await t.shot("import-preview");
      const before = (await t.calls()).length;
      await t.tid("import-run").click();
      // the import is done when its summary is there and its Stop button gone (asked in the UI's own frame)
      await t.frame().waitForFunction(() => /\d+ created/.test(document.querySelector('[data-testid="import-summary"]')?.textContent ?? "") && !document.querySelector('[data-testid="import-stop"]'), null, { timeout: 60000 }).catch(() => {});
      const summary = (await t.tid("import-summary").textContent()) ?? "";
      t.must("12 created, 0 differ, 0 skipped, 0 failed", summary === "12 created, 0 differ, 0 skipped, 0 failed", summary);
      const rows = await t.rows(F.config);
      const same = seed.every((r) => { const x = rows.find((y) => y.Config_Key === r.Config_Key); return x && Object.entries(r).every(([k, v]) => x[k] === v); });
      t.check("Kissflow holds the 12 rows, every field exactly as the file (cells of ~25,000 characters too)", rows.length === 12 && same, rows.length);
      const seqOf = (await t.calls((c) => c.seq >= before && c.flowId === F.config && /^DATAFORM_(CREATE|SUBMIT|GET)_ITEM$/.test(c.command))).map((c) => c.command.replace("DATAFORM_", "").replace("_ITEM", ""));
      t.check("… created strictly one at a time: create, submit, full read, twelve times", seqOf.join(",") === Array(12).fill("CREATE,SUBMIT,GET").join(","), seqOf.slice(0, 9));
      t.check("… every row shown created and verified", (await t.ui.locator('[data-testid^="import-result-"][data-outcome="created"]').count()) === 12);
      await t.tid("import-results").scrollIntoViewIfNeeded();
      await t.shot("import-result");

      // the same file again: every key is held, so nothing would be created
      await t.ui.locator('[data-testid="import-file"]').setInputFiles(SEED_JSON);
      await t.seeTid("import-preview");
      await t.page.waitForTimeout(300);
      t.check("a second import: all 12 already in the form, Import disabled", (await t.ui.locator('[data-testid^="import-plan-"][data-status="exists"]').count()) === 12 && (await t.button("import-run")).disabled);
      // the seed workbook: the same rows, read by the browser's DOMParser
      await t.ui.locator('[data-testid="import-file"]').setInputFiles(SEED_XLSX);
      await t.waitText("sheet “CIQ Config Version”");
      await t.seeTid("import-mapping");
      const mapping = await t.tid("import-mapping").innerText();
      t.check("the workbook: its 20 labels map to field ids (Config Key → Config_Key)", (await t.tid("import-file-summary").innerText()).includes("12 rows, 20 of 20 columns imported") && /Config Key\s+Config_Key/.test(mapping), (await t.tid("import-file-summary").innerText()));
      t.check("… to exactly the JSON file's rows (the same fingerprint)", (await t.tid("import-preview").getAttribute("data-rows-sha")) === jsonSha);
      await t.shot("import-xlsx");

      // edit, then delete a configuration row (LIM:current)
      const lim = (await t.rows(F.config)).find((r) => r.Config_Key === "LIM:current");
      await t.tid("nav-data-flow-config").click();
      await t.seeTid(`data-row-${lim._id}`, "the imported rows are listed");
      await t.tid(`data-row-${lim._id}`).click();
      await t.seeTid("data-edit");
      await t.tid("data-edit").click();
      await t.fillText("data-field-Change_Note", "Checked in the data console.");
      await t.fillText("data-field-Payload_JSON", "{ not json");
      await t.tid("data-save").click();
      await t.seeTid("data-message");
      t.check("an invalid JSON text is not sent", /Payload_JSON: Not valid JSON/.test(await t.tid("data-message").innerText()) && (await writes(t, (c) => c.command === "DATAFORM_UPDATE_ITEM")).length === 0);
      await t.fillText("data-field-Payload_JSON", lim.Payload_JSON);
      await t.tid("data-save").click();
      await t.waitText("Saved and read back");
      t.check("the edit is saved and read back", /Saved and read back \(1 field\)/.test(await t.tid("data-message").innerText()) && (await t.item(lim._id)).Change_Note === "Checked in the data console." && (await t.item(lim._id)).Payload_JSON === lim.Payload_JSON, await t.tid("data-message").innerText());
      const upd = (await writes(t, (c) => c.command === "DATAFORM_UPDATE_ITEM")).map((c) => J(c.data));
      t.check("… only the changed field was sent", upd.length === 1 && JSON.stringify(upd[0]) === JSON.stringify({ Change_Note: "Checked in the data console." }), upd);
      await t.shot("edit");
      await t.tid("data-delete").click();
      await t.seeTid("data-delete-confirm", "a delete asks first");
      t.check("… 'Delete LIM:current?'", (await t.tid("data-delete-confirm").innerText()).includes("Delete LIM:current?"));
      await t.shot("delete-confirm");
      const atDel = (await t.calls()).length;
      await t.tid("data-delete-go").click();
      await t.page.waitForTimeout(800);
      const delCalls = await t.calls((c) => c.seq >= atDel);
      t.check("the row is deleted with ONE call (DATAFORM_DELETE_ITEM), nothing read after it; the drawer closes", !(await t.item(lim._id)) && (await t.tid("data-drawer").count()) === 0 && delCalls.length === 1 && delCalls[0].command === "DATAFORM_DELETE_ITEM" && delCalls[0].itemId === lim._id, callsOf(delCalls));
      t.check("… the row leaves the table, the list not read again", (await t.tid(`data-row-${lim._id}`).count()) === 0 && (await t.ui.locator('[data-testid^="data-row-"]').count()) === 11);
      // a new row: the fields seen on the form's rows, empty; only the filled ones are sent
      await t.tid("data-new-row").click();
      await t.seeTid("data-field-Config_Key", "New row offers the form's fields");
      await t.fillText("data-field-Config_Key", "ZZT:console-row");
      await t.fillText("data-field-Config_Kind", "Settings");
      await t.fillText("data-field-Payload_JSON", '{"note":"console"}');
      await t.tid("data-save").click();
      await t.waitText("and read back");
      const made = (await t.rows(F.config)).find((r) => r.Config_Key === "ZZT:console-row");
      t.check("the new row is created (create + submit), read back, and shown under its new id", !!made && made.Payload_JSON === '{"note":"console"}' && (await t.tid("data-message").innerText()).includes(`Created as ${made._id} and read back (3 fields)`), made && (await t.tid("data-message").innerText()));
      t.check("… read once (the drawer shows that read-back), the list not read", made && (await t.calls((c) => c.command === "DATAFORM_GET_ITEM" && c.itemId === made._id)).length === 1 && (await t.calls((c) => c.seq >= atDel && isList(c))).length === 0);
      await t.page.keyboard.press("Escape");

      // an open point: an admin field edit, then a delete after its key is typed
      const op = (await t.rows(F.op)).find((x) => x._status === "InProgress" && x.OP_Key);
      await t.tid("nav-data-flow-op").click();
      await t.seeTid(`data-row-${op._id}`, `Open points lists ${op.OP_Key}`);
      await t.tid(`data-row-${op._id}`).click();
      await t.seeTid("data-edit");
      await t.tid("data-edit").click();
      await t.fillText("data-field-Question_Text", "Please send the current specification (console edit).");
      await t.tid("data-save").click();
      await t.waitText("Saved and read back");
      const adminWrites = await writes(t, (c) => c.command === "PROCESS_UPDATE_ADMIN_ITEM" && c.instanceId === op._id);
      t.check("the admin update is saved and read back; the step does not move", adminWrites.length === 1 && (await t.item(op._id)).Question_Text === "Please send the current specification (console edit)." && (await t.item(op._id))._current_step === op._current_step, J(adminWrites[0]?.data));
      await t.tid("data-delete").click();
      await t.seeTid("data-delete-typed", "an item's delete asks for its key");
      t.check("… Delete stays disabled until the key is typed", (await t.button("data-delete-go")).disabled);
      await t.fillText("data-delete-typed", op.OP_Key);
      await t.shot("op-delete-confirm");
      const atOpDel = (await t.calls()).length;
      await t.tid("data-delete-go").click();
      await t.page.waitForTimeout(800);
      const del = await writes(t, (c) => c.command === "API" && (c.method || "").toUpperCase() === "DELETE");
      const opCalls = await t.calls((c) => c.seq >= atOpDel);
      t.check("the item is deleted by ONE call, the admin REST DELETE; nothing read after it", !(await t.item(op._id)) && del.length === 1 && del[0].url.includes(`/admin/${F.op}/${op._id}`) && opCalls.length === 1, callsOf(opCalls));
      t.check("… the row leaves the table", (await t.tid(`data-row-${op._id}`).count()) === 0);
      // the overview again: the counts from the session's lists, no read; the deleted point counted out
      const atBack = (await t.calls()).length;
      await t.tid("nav-data").click();
      await t.seeTid("data-overview");
      await t.page.waitForTimeout(500);
      const opsLeft = (await t.rows(F.op)).length;
      t.check("back on the overview: nothing read again; Open points counts one fewer", (await t.calls((c) => c.seq >= atBack)).length === 0 && (await t.tid("data-card-op").innerText()).includes(String(opsLeft)), [await t.tid("data-card-op").innerText(), opsLeft]);
      await t.tid("data-overview-refresh").click();
      await t.page.waitForTimeout(800);
      t.check("… Refresh reads every list again, once", (await t.calls((c) => c.seq >= atBack && isList(c))).length === Object.keys(perFlow).length, callsOf(await t.calls((c) => c.seq >= atBack)));
      t.check("nothing was refused", (await refusedCalls(t)).length === 0, await refusedCalls(t));
    }),
  "data-console-persona": () =>
    scenario("data-console-persona", async (t) => {
      // 26 Oct, dev: RMM who also holds Admin / Developer: the CIQ pane offers "Data console"; the console's dev top bar
      // has the role switcher; after a write there, Back to CIQ Digital reads the CIQ screens again
      await open(t, { roles: "rmm,developer" }, "/rmm");
      await t.seeTid("tile-my-open", "RMM's dashboard, as before");
      await t.seeTid("nav-data", "the CIQ pane offers Data console");
      await t.tid("nav-data").click();
      await t.seeTid("data-overview", "the console opens beside the CIQ screens");
      await t.seeTid("nav-data-back", "… with the way back");
      await t.seeTid("role-switcher", "… and, in dev, the role switcher");
      await t.shot("console");
      const set = (await t.rows(F.config)).find((r) => r.Config_Key === "REM:current");
      await t.go(`/data/flow/config`);
      await t.seeTid(`data-row-${set._id}`);
      await t.tid(`data-row-${set._id}`).click();
      await t.seeTid("data-edit");
      await t.tid("data-edit").click();
      await t.fillText("data-field-Change_Note", "Seed, checked.");
      await t.tid("data-save").click();
      await t.waitText("Saved and read back");
      await t.page.keyboard.press("Escape");
      const from = (await t.calls()).length;
      await t.tid("nav-data-back").click();
      await t.seeTid("tile-my-open", "Back to CIQ Digital: RMM's dashboard");
      await t.settle(600);
      t.check("… which reads the configuration again after the console's write", (await t.calls((c) => c.seq >= from && c.command === "DATAFORM_GET_ITEMS" && c.flowId === F.config)).length > 0);
      // a user without the role gets no console: /data leads to the persona's landing page
      await open(t, { roles: "rmm" }, "/data");
      t.check("RMM alone: no Data console entry, /data leads home", (await t.tid("nav-data").count()) === 0 && (await t.hash()) === "#/rmm", await t.hash());
    }),
  "dev-plain-delete": () =>
    scenario("dev-plain-delete", async (t) => {
      // 27 Oct (Thomas: "say I delete a case in the admin, all associated to that also gets deleted, like how it was
      // before"): RMM who also holds Admin / Developer (dev, flow Admin) deletes the case ZZT-0003 in the data console:
      // the dialog lists what belongs to it per flow, found in the lists the overview read (no list read again, nothing
      // of the app read but the drawer's read of the case; the supplier portal searched for the case); the code typed;
      // then ONE call per item, children first, the case LAST, paced, NOTHING read back. The rows leave the table and the
      // overview's counts without a read; the Orphans page finds none; RMM's load warns of nothing. Another item (a
      // review of ZZT-0005) is still deleted with ONE call (the 26 Oct plain delete).
      await open(t, { roles: "rmm,developer", admin: "1", byid: "1" }, "/cases");
      await t.seeTid("case-row-ZZT-0003", "RMM's case list shows ZZT-0003");
      const parts = await caseParts(t, CASE3);
      t.must("the fixtures hold ZZT-0003's reviews, open points, notes, RMES and audit rows, its portal request and queries", ["portalQuery", "portalRequest", "op", "review", "rmesSAF", "rmesREG", "note", "audit", "case"].every((p) => parts[p]?.length), countsText(parts));
      const total = Object.values(parts).flat().length;
      await t.tid("nav-data").click();
      await t.seeTid("data-overview");
      await t.frame().waitForFunction(() => /Read at/.test(document.querySelector('[data-testid="data-overview-read-at"]')?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
      const cases0 = (await t.rows(F.case)).length;
      const audit0 = (await t.rows(F.audit)).length;
      t.check(`the overview counts ${cases0} cases and ${audit0} audit rows`, (await t.tid("data-card-case").innerText()).includes(String(cases0)) && (await t.tid("data-card-audit").innerText()).includes(String(audit0)));
      const atTable = (await t.calls()).length;
      await t.tid("nav-data-flow-case").click();
      await t.seeTid(`data-row-${CASE3}`, "the console's case table lists ZZT-0003");
      await t.tid(`data-row-${CASE3}`).click();
      await t.seeTid("data-delete");
      t.check("the case's Delete: 'Delete case'", (await t.tid("data-delete").innerText()).trim() === "Delete case", await t.tid("data-delete").innerText());
      await t.tid("data-delete").click();
      await t.seeTid("case-delete-plan", "it lists what belongs to the case first", 20000);
      const found = await t.calls((c) => c.seq >= atTable);
      const portalRead = (c) => c.command === "API" && (c.method || "GET").toUpperCase() === "GET" && (c.url || "").includes("_application_id=CIQ_Supplier_Portal_A00");
      t.check("… from the session's lists: no list of the app read again", !found.some((c) => isList(c) && !portalRead(c)), summary(found.filter((c) => isList(c) && !portalRead(c))));
      t.check("… nothing of the app read but the drawer's read of the case; the supplier portal searched for it (its REST admin routes)", found.every((c) => (c.command === "PROCESS_GET_ADMIN_ITEM" && c.instanceId === CASE3) || portalRead(c)) && found.some(portalRead), summary(found).concat(found.filter((c) => c.url).map((c) => c.url)));
      const plan = t.tid("case-delete-plan");
      t.check(`… ${total} items: the case and the ${total - 1} that belong to it`, Number(await plan.getAttribute("data-items")) === total && /The case and the \d+ items that belong to it are deleted/.test(await t.tid("case-delete-summary").innerText()), [await plan.getAttribute("data-items"), await t.tid("case-delete-summary").innerText()]);
      for (const [part, ids] of Object.entries(parts)) {
        const n = await t.tid(`case-delete-counts-${part}`).getAttribute("data-count", { timeout: 2000 }).catch(() => null);
        t.check(`… ${part}: ${ids.length}`, Number(n) === ids.length, n);
      }
      await runCaseDelete(t, "ZZT-0003", [parts], "case");
      const left = await caseParts(t, CASE3);
      t.check("Kissflow holds nothing of ZZT-0003 any more: the case, its rows, its portal request and queries", Object.keys(left).length === 0, countsText(left));
      const atClose = (await t.calls()).length;
      await t.tid("case-delete-close").click();
      await t.page.waitForTimeout(300);
      t.check("Close: the dialog and the drawer close; the case leaves the table", (await t.tid("case-delete-dialog").count()) === 0 && (await t.tid("data-drawer").count()) === 0 && (await t.tid(`data-row-${CASE3}`).count()) === 0);
      await t.tid("nav-data").click();
      await t.seeTid("data-overview");
      await t.page.waitForTimeout(400);
      const audit1 = audit0 - parts.audit.length;
      t.check(`the overview counts ${cases0 - 1} cases and ${audit1} audit rows, without reading anything`, (await t.tid("data-card-case").innerText()).includes(String(cases0 - 1)) && (await t.tid("data-card-audit").innerText()).includes(String(audit1)) && (await t.calls((c) => c.seq >= atClose)).length === 0, [await t.tid("data-card-case").innerText(), await t.tid("data-card-audit").innerText(), summary(await t.calls((c) => c.seq >= atClose))]);
      await t.tid("nav-data-orphans").click();
      await t.seeTid("orphans-none", "the Orphans page (read when opened) finds no orphans", 20000);
      await t.shot("orphans-none");
      // another item: still the plain delete, ONE call
      await t.tid("nav-data-flow-review").click();
      const review = (await t.rows(F.review)).find((r) => r.Case_Item_Id === CASE5);
      t.must("ZZT-0005 has a review", review, review);
      await t.seeTid(`data-row-${review._id}`, "the reviews' table");
      await t.tid(`data-row-${review._id}`).click();
      await t.seeTid("data-delete");
      t.check("a review's Delete: 'Delete item'", (await t.tid("data-delete").innerText()).trim() === "Delete item", await t.tid("data-delete").innerText());
      await t.tid("data-delete").click();
      await t.seeTid("data-delete-confirm", "… 'Delete <key>?', the key typed");
      t.check("… only this item", (await t.tid("data-delete-confirm").innerText()).includes(`Delete ${review.Review_Key}?`) && (await t.tid("case-delete-dialog").count()) === 0);
      await t.fillText("data-delete-typed", review.Review_Key);
      const atReview = (await t.calls()).length;
      await t.tid("data-delete-go").click();
      await t.page.waitForTimeout(1200);
      const one = await t.calls((c) => c.seq >= atReview);
      t.check("… exactly ONE call, the admin REST DELETE; the drawer closes, the row leaves the table", one.length === 1 && isDelete(one[0]) && one[0].url.includes(`/admin/${F.review}/${review._id}`) && !one[0].refused && (await t.tid("data-drawer").count()) === 0 && (await t.tid(`data-row-${review._id}`).count()) === 0, summary(one).concat(one.map((c) => c.url || "")));
      // RMM: ZZT-0003 is gone, and nothing "could not be read"
      await t.tid("nav-data-back").click();
      await t.seeTid("main-nav", "Back to CIQ Digital");
      await t.settle(800);
      await t.go("/cases");
      await t.seeTid("case-row-ZZT-0001");
      const warn = (await t.tid("load-warnings-list").count()) ? await t.tid("load-warnings-list").first().textContent() : "";
      t.check("RMM: no 'could not be read' warning", !/could not be read/i.test(warn), warn);
      t.check("… and no ZZT-0003", (await t.tid("case-row-ZZT-0003").count()) === 0);
      await t.shot("rmm-after");
      t.check("nothing was refused", (await refusedCalls(t)).length === 0, await refusedCalls(t));
    }),
  "dev-case-delete-portal-refused": () =>
    scenario("dev-case-delete-portal-refused", async (t) => {
      // 27 Oct: the supplier portal's container refuses the app's REST calls (portal=refuse): the case delete lists the
      // portal items the app names (ZZT-0001's request, by the drawer's read of the case) to delete in the portal's
      // admin console, and still deletes the app's items, the case last, nothing read back.
      await t.host({ roles: "developer", admin: "1", portal: "refuse" }, "/data/flow/case");
      await t.seeTid(`data-row-${CASE1}`, "the cases' table", 15000);
      const parts = await caseParts(t, CASE1);
      const request = parts.portalRequest?.[0];
      t.must("ZZT-0001 has its portal request", request, countsText(parts));
      delete parts.portalRequest;
      await t.tid(`data-row-${CASE1}`).click();
      await t.seeTid("data-delete");
      await t.tid("data-delete").click();
      await t.seeTid("case-delete-plan", "the plan", 20000);
      const left = t.tid("case-delete-portal-left");
      t.check("… says the supplier portal could not be read and names its request, to delete in the portal's admin console", (await left.count()) === 1 && (await t.tid(`case-delete-portal-${request}`).count()) === 1 && /admin console/.test(await left.innerText()), (await left.innerText().catch(() => "")).slice(0, 300));
      t.check(`… the app's items only: ${Object.values(parts).flat().length}`, Number(await t.tid("case-delete-plan").getAttribute("data-items")) === Object.values(parts).flat().length && (await t.tid("case-delete-counts-portalRequest").count()) === 0, await t.tid("case-delete-plan").getAttribute("data-items"));
      await t.shot("plan");
      await runCaseDelete(t, "ZZT-0001", [parts], "app-items");
      t.check("the result still names the portal request", (await t.tid("case-delete-result").getAttribute("data-portal-left")) === "1" && (await t.tid(`case-delete-portal-${request}`).count()) === 1);
      const after = await caseParts(t, CASE1);
      t.check("Kissflow: the case and its app rows are gone; the portal request stays (the portal's admin console deletes it)", JSON.stringify(Object.keys(after)) === JSON.stringify(["portalRequest"]), countsText(after));
    }),
  "dev-bulk-delete": () =>
    scenario("dev-bulk-delete", async (t) => {
      // 26 Oct, for clearing test data without hitting Kissflow's rate limit: Admin / Developer on the audit events (46
      // rows: two pages of 25). Five rows chosen, "Delete selected (5)": strictly one at a time, about 400 ms apart, one
      // call each, a progress line, nothing read; Kissflow answers 429 twice on the third: the console says it waits and
      // tries again after about 1 s and 2 s, and goes on. A 429 asking to wait 2 minutes (past the 30 s) pauses the run
      // with the plain text, the screen stays usable, Continue finishes it. A run of five stopped after its first delete
      // leaves four, still chosen. 27 Oct: two CIQ Cases chosen: the confirmation says their related items go too, with
      // the totals; each case with everything that belongs to it, one case after the other, its case last, paced, nothing
      // read back.
      await t.host({ roles: "developer", admin: "1" }, "/data/flow/audit");
      await t.seeTid("data-flow-audit", "the audit events' table", 15000);
      await t.seeTid("data-pager", "… paged");
      const total0 = (await t.rows(F.audit)).length;
      t.check(`… ${total0} rows, ${PAGE} a page`, (await t.ui.locator('[data-testid^="data-row-"]').count()) === PAGE && (await t.tid("data-pager").getAttribute("data-pages")) === String(Math.ceil(total0 / PAGE)) && (await t.tid("data-page-info").innerText()).includes(`1–${PAGE} of ${total0}`), await t.tid("data-page-info").innerText());
      const pageIds = async () => t.frame().evaluate(() => [...document.querySelectorAll('[data-testid^="data-row-"]')].map((e) => e.getAttribute("data-testid").slice("data-row-".length)));
      const choose = async (n) => {
        const ids = (await pageIds()).slice(0, n);
        for (const id of ids) await t.tid(`data-select-${id}`).check();
        return ids;
      };
      const deletesSince = async (from) => t.calls((c) => c.seq >= from && c.command === "DATAFORM_DELETE_ITEM");

      // five, with two 429s on the third
      const ids = await choose(5);
      await t.seeTid("data-bulk-delete");
      t.check("five chosen: 'Delete selected (5)'", (await t.tid("data-bulk-delete").innerText()).trim() === "Delete selected (5)", await t.tid("data-bulk-delete").innerText());
      await t.tid("data-bulk-delete").click();
      await t.seeTid("bulk-confirm", "it asks first, listing the five");
      t.check("… each of them", (await t.tid("bulk-list").locator("li").count()) === 5);
      await t.limit429({ match: "^DATAFORM_DELETE_ITEM", after: 2, n: 2 });
      const from = (await t.calls()).length;
      await t.tid("bulk-go").click();
      await t.seeTid("bulk-progress", "a progress line while it runs");
      await t.seeTid("bulk-rate-wait", "… and, while Kissflow limits, it says it waits", 6000);
      t.check("… the console's shell says so too", (await t.tid("data-rate-wait").count()) === 1);
      await t.shot("rate-wait");
      await t.ui.getByTestId("bulk-result").waitFor({ timeout: 30000 });
      const dels = await deletesSince(from);
      t.check("… the dialog keeps its five while they leave the table", /Delete 5 rows/.test(await t.tid("bulk-dialog").innerText()), (await t.tid("bulk-dialog").innerText()).slice(0, 80));
      const ok = dels.filter((c) => !c.refused);
      const tooMany = dels.filter((c) => /429/.test(c.refused || ""));
      t.check("five deleted, one call each, plus the two answered 429", ok.length === 5 && tooMany.length === 2 && JSON.stringify(ok.map((c) => c.itemId).sort()) === JSON.stringify([...ids].sort()), summary(dels));
      const gaps = dels.slice(1).map((c, i) => c.at - dels[i].at);
      t.check("… one at a time, at least about 400 ms apart; after a 429 about 1 s, then about 2 s", gaps.every((g) => g >= 350) && gaps[2] >= 950 && gaps[3] >= 1950, gaps);
      t.check("… nothing but the deletes: no read-back, no list read", (await t.calls((c) => c.seq >= from)).every((c) => c.command === "DATAFORM_DELETE_ITEM"), summary(await t.calls((c) => c.seq >= from)));
      const result = t.tid("bulk-result");
      t.check("… the result: 5 deleted", (await result.getAttribute("data-outcome")) === "done" && (await result.getAttribute("data-deleted")) === "5", await result.innerText());
      await t.tid("bulk-close").click();
      t.check("Kissflow no longer holds them; the table counts five fewer", (await t.rows(F.audit)).length === total0 - 5 && (await t.tid("data-flow-audit").innerText()).includes(`CIQ Audit Event · ${total0 - 5} rows`) && (await Promise.all(ids.map((id) => t.tid(`data-row-${id}`).count()))).every((n) => n === 0));
      await t.shot("done");

      // a 429 asking to wait 2 minutes (past the console's 30 s): the run pauses, plain text; Continue finishes it
      const ids2 = await choose(3);
      await t.tid("data-bulk-delete").click();
      await t.seeTid("bulk-confirm");
      await t.limit429({ match: "^DATAFORM_DELETE_ITEM", after: 1, n: 1, retryAfter: 120 });
      const from2 = (await t.calls()).length;
      await t.tid("bulk-go").click();
      await t.seeTid("bulk-paused", "a lasting 429 pauses the run", 15000);
      const paused = await t.tid("bulk-paused").innerText();
      t.check("… 'Kissflow is limiting requests right now. Wait a minute, then try again.', two not deleted yet", paused.includes("Kissflow is limiting requests right now. Wait a minute, then try again.") && /2 rows not deleted yet/.test(paused), paused);
      t.check("… after the 429 nothing more was sent", (await deletesSince(from2)).length === 2, summary(await deletesSince(from2)));
      await t.shot("paused");
      await t.tid("bulk-again").click();
      await t.ui.getByTestId("bulk-result").and(t.ui.locator('[data-outcome="done"]')).waitFor({ timeout: 15000 }).catch(() => {});
      const audit2 = (await t.rows(F.audit)).map((r) => r._id);
      t.check("Continue deletes the two left", (await t.tid("bulk-result").getAttribute("data-outcome")) === "done" && (await t.tid("bulk-result").getAttribute("data-deleted")) === "3" && ids2.every((id) => !audit2.includes(id)) && audit2.length === total0 - 8, audit2.length);
      await t.tid("bulk-close").click();

      // five, stopped after the first delete
      await t.lag(500);
      const ids3 = await choose(5);
      await t.tid("data-bulk-delete").click();
      await t.seeTid("bulk-confirm");
      const from3 = (await t.calls()).length;
      await t.tid("bulk-go").click();
      await t.seeTid("bulk-stop");
      await t.tid("bulk-stop").click();
      await t.ui.getByTestId("bulk-result").waitFor({ timeout: 15000 });
      const stopped = t.tid("bulk-result");
      const gone3 = (await deletesSince(from3)).length;
      t.check("Stop: the run ends after the delete in flight; the rest are not sent", (await stopped.getAttribute("data-outcome")) === "stopped" && gone3 === 1 && (await stopped.getAttribute("data-remaining")) === "4", [await stopped.getAttribute("data-outcome"), gone3, await stopped.getAttribute("data-remaining")]);
      await t.tid("bulk-close").click();
      await t.lag(0);
      const audit3 = (await t.rows(F.audit)).map((r) => r._id);
      t.check("… the four left stay, still chosen", audit3.length === total0 - 9 && ids3.filter((id) => audit3.includes(id)).length === 4 && (await t.tid("data-selection").getAttribute("data-count")) === "4", [audit3.length, await t.tid("data-selection").getAttribute("data-count").catch(() => null)]);
      await t.shot("stopped");

      // 27 Oct: cases selected: each case with everything that belongs to it, one case after the other, paced
      await t.tid("data-select-none").click();
      await t.tid("nav-data-flow-case").click();
      await t.seeTid(`data-row-${CASE5}`, "the cases' table");
      const chosenCases = [CASE1, CASE5];
      for (const id of chosenCases) await t.tid(`data-select-${id}`).check();
      t.check("two cases chosen: 'Delete selected (2)'", (await t.tid("data-bulk-delete").innerText()).trim() === "Delete selected (2)", await t.tid("data-bulk-delete").innerText());
      // the order the console deletes them in: its case list's
      const order = (await t.rows(F.case)).map((r) => r._id).filter((id) => chosenCases.includes(id));
      const groups = [];
      for (const id of order) groups.push(await caseParts(t, id));
      const all = groups.flatMap((g) => Object.values(g).flat());
      t.must("… ZZT-0005 holds reviews, RMES and audit rows and its portal request; ZZT-0001 its request", groups.every((g) => g.case && g.portalRequest) && groups.some((g) => g.review?.length), groups.map(countsText));
      const atFind = (await t.calls()).length;
      await t.tid("data-bulk-delete").click();
      await t.seeTid("case-delete-plan", "the confirmation lists what belongs to the cases first", 20000);
      const finding = await t.calls((c) => c.seq >= atFind);
      const appLists = finding.filter((c) => isList(c) && !(c.url || "").includes("CIQ_Supplier_Portal_A00")).map((c) => FLOW_OF[c.flowId] ?? c.flowId);
      t.check("… the lists not read yet this session read once each (the cases' and the audit events' table: not again)", appLists.length === new Set(appLists).size && !appLists.includes("case") && !appLists.includes("audit"), appLists);
      const summaryText = await t.tid("case-delete-summary").innerText();
      t.check(`… it says the cases' related items are deleted too, with the totals (${all.length - 2} related, ${all.length} in all)`, summaryText.includes(`the 2 cases and their ${all.length - 2} related items, ${all.length} items in all`), summaryText);
      const sum = (part) => groups.reduce((a, g) => a + (g[part]?.length ?? 0), 0);
      for (const part of CASCADE_ORDER.filter((p) => sum(p))) {
        const n = await t.tid(`case-delete-counts-${part}`).getAttribute("data-count", { timeout: 2000 }).catch(() => null);
        t.check(`… ${part}: ${sum(part)} in all`, Number(n) === sum(part), n);
      }
      for (const [k, id] of order.entries()) t.check(`… ${id}: ${Object.values(groups[k]).flat().length} items`, Number(await t.tid(`case-delete-case-${id}`).getAttribute("data-count")) === Object.values(groups[k]).flat().length);
      await runCaseDelete(t, "2", groups, "cases");
      await t.tid("case-delete-close").click();
      const leftCases = await Promise.all(order.map((id) => caseParts(t, id)));
      t.check("Kissflow holds nothing of either case any more; they leave the table, the choice is empty", leftCases.every((l) => Object.keys(l).length === 0) && (await Promise.all(order.map((id) => t.tid(`data-row-${id}`).count()))).every((n) => n === 0) && (await t.tid("data-selection").count()) === 0, leftCases.map(countsText));
      await t.shot("cases-done");
      t.check("nothing was refused but the played 429s", (await refusedCalls(t)).every((x) => /429/.test(x)), await refusedCalls(t));
    }),
  "dev-orphans": () =>
    scenario("dev-orphans", async (t) => {
      // 26 Oct as Thomas left it: ZZT-0005's case item was deleted ALONE in the console (gone=; since the plain delete,
      // every case delete leaves its rows so). RMM's load still finds the case by its rows and can't read it: the problem,
      // replayed. The console's Orphans page lists those rows as one group, counts per flow, and deletes them after the
      // typed code, children first, each read back, PACED (one at a time, about 400 ms apart); the group then leaves the
      // page without a new scan; then RMM's load warns of nothing.
      await open(t, { roles: "rmm,developer", admin: "1", byid: "1", gone: CASE5 }, "/cases");
      await t.seeTid("load-warnings", "RMM: the load box", 15000);
      const warn0 = await t.tid("load-warnings-list").first().textContent().catch(() => "");
      t.check("RMM: '1 case could not be read in full for your role' (the problem of 26 Oct)", /1 case could not be read in full for your role/.test(warn0), warn0);
      const byId = await t.calls((c) => idOfCall(c) === CASE5 && isRead(c));
      t.check("… because its by-id reads answer as for a deleted item: the SDK's admin read, then 050201 by REST, then no item", byId.some((c) => c.command === "PROCESS_GET_ADMIN_ITEM" && c.refused === "some error occured") && byId.some((c) => c.command === "API" && /admin/.test(c.url) && /050201/.test(c.refused || "")) && byId.some((c) => c.command === "API" && !/admin/.test(c.url) && !c.refused), byId.map((c) => `${c.command} ${c.url || ""} ${c.refused || "ok"}`));
      await t.shot("rmm-before");
      const parts = await caseParts(t, CASE5);
      delete parts.case;
      t.must("ZZT-0005's rows are still there: reviews, RMES rows, audit rows, its portal request", parts.review?.length && parts.audit?.length && parts.portalRequest?.length === 1, countsText(parts));
      await t.tid("nav-data").click();
      await t.seeTid("data-overview");
      await t.seeTid("nav-data-orphans", "the console's pane offers Orphans");
      await t.tid("nav-data-orphans").click();
      await t.seeTid(`orphan-group-${CASE5}`, "the Orphans page lists ZZT-0005's group", 20000);
      t.check("… one group only (every other row names a case that exists)", (await t.tid("orphans-groups").getAttribute("data-groups")) === "1");
      const group = t.tid(`orphan-group-${CASE5}`);
      t.check("… its case item confirmed deleted", (await group.getAttribute("data-state")) === "gone" && /ZZT-0005/.test(await group.innerText()));
      for (const [part, ids] of Object.entries(parts)) {
        const n = await t.tid(`orphan-count-${CASE5}-${part}`).getAttribute("data-count", { timeout: 2000 }).catch(() => null);
        t.check(`… ${part}: ${ids.length}`, Number(n) === ids.length, n);
      }
      await t.shot("orphans");
      await t.tid(`orphan-delete-${CASE5}`).click();
      await t.seeTid("cascade-plan", "Delete these items: the same dialog", 20000);
      t.check("… the case is gone already: its rows and items only", (await t.tid("cascade-plan").getAttribute("data-case")) === "gone" && Number(await t.tid("cascade-plan").getAttribute("data-items")) === Object.values(parts).flat().length, [await t.tid("cascade-plan").getAttribute("data-case"), await t.tid("cascade-plan").getAttribute("data-items")]);
      const ran = (await t.calls()).length;
      await runCascade(t, "ZZT-0005", parts, "orphans");
      const left = await caseParts(t, CASE5);
      t.check("Kissflow holds nothing that names ZZT-0005 any more", Object.keys(left).length === 0, countsText(left));
      const scanned = (await t.calls()).length;
      await t.tid("cascade-close").click();
      await t.seeTid("orphans-none", "the group leaves the page: no orphans", 5000);
      await t.page.waitForTimeout(400);
      t.check("… without a new scan (the page reads when opened and on Read again only)", (await t.calls((c) => c.seq >= scanned)).length === 0, summary(await t.calls((c) => c.seq >= scanned)));
      t.check("… the dialog's own search before the run read each list once", (await t.calls((c) => c.seq >= ran && isList(c) && !/\/item\?/.test(c.url || ""))).length <= CONSOLE_FLOWS.length);
      await t.shot("orphans-after");
      await t.tid("nav-data-back").click();
      await t.seeTid("main-nav", "Back to CIQ Digital");
      await t.settle(800);
      await t.go("/cases");
      await t.seeTid("case-row-ZZT-0001");
      const warn1 = (await t.tid("load-warnings-list").count()) ? await t.tid("load-warnings-list").first().textContent() : "";
      t.check("RMM: no 'could not be read' warning any more", !/could not be read/i.test(warn1), warn1);
      t.check("… and no ZZT-0005", (await t.tid("case-row-ZZT-0005").count()) === 0);
    }),
  "boot-timing": () =>
    scenario("boot-timing", async (t) => {
      // The first load as the user waits for it: every SDK call answered after BOOT_LAG ms (the host's ?lag=, default
      // 250), per role the time from the host page's navigation to the first content of the landing page ("paint") and
      // to the end of the load and its side effects ("settled": the status note no longer says Loading… / Saving…),
      // with the SDK calls sent by then. Median of BOOT_RUNS runs (default 3). Reported on the console and in
      // harness-report.json; a check fails only when the landing page does not show, never on speed.
      const LAG = Number(process.env.BOOT_LAG || 250), RUNS = Math.max(1, Number(process.env.BOOT_RUNS || 3));
      const LANDING = { rmm: '[data-testid="tile-my-open"]', saf: '[data-testid="review-queue"]', cus: '[data-testid="cases-search"], [data-testid="empty-cases"]', admin: '[data-testid="rules-tab"]' };
      const ANY_LANDING = Object.values(LANDING).join(", ");
      // host page: each recorded call gets the wall-clock time it reached the host; UI frame: the times its landing
      // content first showed and its status note first settled after that (one browser, one clock)
      await t.page.addInitScript((sel) => {
        if (window.top === window) {
          let calls;
          Object.defineProperty(window, "__kfCalls", { configurable: true, get: () => calls, set: (v) => { calls = v; const push = v.push.bind(v); v.push = (...rs) => { for (const r of rs) r.at = Date.now(); return push(...rs); }; } });
          return;
        }
        const look = () => {
          if (!window.__landingAt && document.querySelector(sel)) window.__landingAt = Date.now();
          const status = document.querySelector('[data-testid="load-status"]');
          if (window.__landingAt && !window.__settledAt && status && !/Loading…|Saving…/.test(status.textContent || "")) window.__settledAt = Date.now();
        };
        new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true });
      }, ANY_LANDING);
      const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
      const report = {};
      for (const [role, sel] of Object.entries(LANDING)) {
        const runs = [];
        for (let i = 0; i < RUNS; i++) {
          await t.host({ roles: role, lag: String(LAG) }, "/");
          const shown = await t.ui.locator(sel).first().waitFor({ timeout: 60000 }).then(() => true, () => false);
          if (!t.check(`${role}: the landing page shows (run ${i + 1})`, shown)) break;
          await t.frame().waitForFunction(() => window.__settledAt, null, { timeout: 60000 }).catch(() => {});
          const [nav, calls] = [await t.page.evaluate(() => performance.timeOrigin), await t.calls()];
          const { landingAt, settledAt } = await t.frame().evaluate(() => ({ landingAt: window.__landingAt, settledAt: window.__settledAt }));
          const before = (at) => calls.filter((c) => c.at <= at && c.command !== "CC_INITIALIZE").length;
          runs.push({ paint: Math.round(landingAt - nav), paintCalls: before(landingAt), settled: settledAt ? Math.round(settledAt - nav) : null, settledCalls: settledAt ? before(settledAt) : null, writes: calls.filter((c) => WRITE.test(c.command)).length });
        }
        if (!runs.length) continue;
        const pick = (k) => median(runs.map((r) => r[k] ?? Infinity));
        report[role] = { paintMs: pick("paint"), callsBeforePaint: pick("paintCalls"), settledMs: pick("settled"), callsBySettled: pick("settledCalls"), writes: pick("writes"), runs };
        console.log(`   boot-timing ${role} (lag ${LAG} ms, median of ${runs.length}): landing page after ${report[role].paintMs} ms with ${report[role].callsBeforePaint} SDK calls; settled after ${report[role].settledMs} ms with ${report[role].callsBySettled} calls (${report[role].writes} writes)`);
      }
      t.check("timings recorded", Object.keys(report).length === Object.keys(LANDING).length, { lag: LAG, ...report });
    }),
};

const args = ARGV;
const allowTodo = args.includes("--allow-todo");
const wanted = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--host");
for (const w of wanted.length ? wanted : Object.keys(SCENARIOS)) {
  if (!SCENARIOS[w]) { console.error(`unknown scenario ${w}`); process.exitCode = 1; continue; }
  await SCENARIOS[w]();
}
await browser.close();
hostServer.close();
writeFileSync(path.join(out, "harness-report.json"), JSON.stringify({ fixtures: FX.source, results }, null, 2));
const todos = results.filter((r) => r.todo).length;
const failed = results.filter((r) => !r.pass && !r.todo).length;
console.log(`${results.length - failed - todos}/${results.length} scenarios passed (${failed} failed, ${todos} to do; ${results.reduce((n, r) => n + r.checks.length, 0)} checks; fixtures: ${FX.source})`);
process.exit(failed || (todos && !allowTodo) ? 1 : process.exitCode ?? 0);
