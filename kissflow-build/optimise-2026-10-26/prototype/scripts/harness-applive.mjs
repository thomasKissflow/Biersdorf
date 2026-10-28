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
//                      "CMD@flow" (e.g. DATAFORM_GET_ITEM@rmesSAF) refuses it on that flow only
//  - empty=1           no items except the config rows (empty start)
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
//    as the brief's grants (unverified live)
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
for (const [f, rows] of Object.entries(FX.byFlow)) if (!EMPTY || FLOW_KEY[f] === "config") db[f] = clone(rows);
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
  if (!x) throw notFound();
  const t = tasks.get(x._id);
  if (!t || t.act !== r.activityInstanceId) throw movedOut();
  if (!holdsTask(x)) throw noAccess();
  return x;
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
  let m = url.match(/\\/process\\/2\\/[^/]+\\/admin\\/([^/]+)\\/([^/?]+)/);
  if (m && method === "GET") { if (!ADMIN) throw noAccess(); const x = find(m[1], m[2]); if (!x) throw notFound(); return clone(x); }
  m = url.match(/\\/process\\/2\\/[^/]+\\/([^/]+)\\/([^/?]+)/);
  if (m && method === "GET") { if (!BYID) throw noAccess(); const x = find(m[1], m[2]); if (!x) throw notFound(); return clone(x); }
  throw notFound();
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
    case "PROCESS_GET_ADMIN_ITEM": { if (!ADMIN) throw noAccess(); const x = find(f, r.instanceId); if (!x) throw notFound(); return clone(x); }
    case "PROCESS_GET_ITEM": return withAct(myTask(f, r));
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
      applyData(x, r.data);
      (drafts[f] ??= []).push(x);
      return clone(x);
    }
    case "DATAFORM_SUBMIT_ITEM": {
      const list = drafts[f] || [], i = list.findIndex((d) => d._id === r.itemId);
      if (i < 0) throw notFound();
      const [x] = list.splice(i, 1);
      checkValues(r.data, f);
      applyData(x, r.data);
      Object.assign(x, { _id: "Pk" + FLOW_KEY[f] + ++seq, _status: "Completed", _modified_at: now() }); // submit lists it under a NEW id
      items(f).push(x);
      return clone(x);
    }
    case "DATAFORM_UPDATE_ITEM": {
      if (!may(FORM_WRITE, f)) throw noAccess();
      const x = find(f, r.itemId) || (drafts[f] || []).find((d) => d._id === r.itemId);
      if (!x) throw notFound();
      checkValues(r.data, f);
      applyData(x, r.data);
      Object.assign(x, { _modified_at: now(), _modified_by: { _id: ME._id, Name: ME.Name } });
      return clone(x);
    }
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
  const rec = { seq: window.__kfCalls.length, command: r.command, flowId: r.flowId, instanceId: r.instanceId, itemId: r.itemId, activityInstanceId: r.activityInstanceId, activityId: r.activityId, pageNumber: r.pageNumber, url: r.url, method: r.args && r.args.method, data: (typeof body === "string" ? body : JSON.stringify(body)).slice(0, 4000), keys: Object.keys(r.data ?? {}).sort().join(",") };
  window.__kfCalls.push(rec);
  if (r.command === "CC_INITIALIZE" && ignoreInits > 0) { ignoreInits--; return; }
  const reply = (resp) => frame.contentWindow.postMessage({ _req: r, resp }, "*");
  setTimeout(() => {
    let resp;
    try { resp = handle(r); } catch (err) { resp = { isError: true, errorMessage: { error_code: err.code || "KISSFLOW_ERROR", en_message: String(err.message || err) } }; rec.refused = resp.errorMessage.error_code + " " + resp.errorMessage.en_message; }
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
const CASE3 = "AppZZT-0003", CASE1 = "AppZZT-0001";
/** A10 (22 Oct): the toast promised "Beiersdorf's system will pass this on." for a pending hand-off; no system does. */
const PENDING = /Beiersdorf's system will pass this on/;
/** What production must not show a tester (FE-CLEANUP C1-C30): Kissflow codes and messages, flow / field / app ids,
 *  the fixtures' item ids, transport tags, unverified marks, pointers to Diagnostics, mapper jargon. */
const TECH = /KISSFLOW_ERROR|\b0503\d\d\b|\b0502\d\d\b|_A00\b|\b[A-Z][A-Za-z]*_[A-Z][A-Za-z_]*\b|\b(Pk|App|Act|Us)[A-Z][A-Za-z0-9-]{3,}|\((SDK|REST|fetch)\)|\[unverified\]|Diagnostics|OWN:current|REM:current|read route|hand-off|history line|screen's state|person menu|row in Kissflow|\.\./;
/** The text of the UI frame's page without the side pane (main column: banners, page, toasts). */
const mainText = async (t) => t.frame().evaluate(() => [...document.querySelectorAll("main, div.fixed[aria-live='polite']")].map((e) => e.innerText).join("\n"));
/** The TECH tokens in a text, for a check's detail. */
const techIn = (text) => [...new Set((text.match(new RegExp(TECH.source, "g")) ?? []))];
/** A webhook payload's keys, sorted and joined (20 Oct: app item ids and the idempotencyKey only). */
const keysOf = (body) => Object.keys(body ?? {}).sort().join();
/** The 20 Oct transport: a POST by the browser's fetch, mode no-cors, text/plain, the JSON text as the body. */
const byFetch = (h) => h.route === "fetch" && h.method === "POST" && h.mode === "no-cors" && /^text\/plain\b/.test(h.contentType ?? "") && typeof h.body === "object";

/** Loads a role in the emulated host and waits for the shell; installs the toast log. */
async function open(t, params, route = "/") {
  await t.host(params, route);
  await t.seeTid("main-nav", `the shell opens (${params.roles})`, 15000);
  await t.settle(300);
  await t.toastLog();
}

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
  "ba-config-readonly": () =>
    scenario("ba-config-readonly", async (t) => {
      // FE-CLEANUP A7 / A16 (22 Oct): the live app shows the configuration read-only to the Business administrator too:
      // no edit control (canChange), while the read view and Test rules stay (canEdit; UAT TC-44), in both environments
      const EDIT = '[data-testid="config-discard-draft"], [data-testid="config-check-publish"], [data-testid="config-create-version"], [data-testid="rule-add"], [data-testid^="rule-edit-"], [data-testid^="rule-delete-"], [data-testid="view-draft"], [data-testid="section-add"], [data-testid^="section-retire-"], [data-testid^="section-restore-"], [data-testid^="owner-restore-"], button[data-testid^="owner-cell-"], [data-testid^="reminder-toggle-"]';
      for (const env of ["dev", "prod"]) {
        await open(t, { roles: "admin", ...(env === "prod" ? { env } : {}) });
        await t.seeTid("config-readonly-banner", `${env}: the read-only configuration banner`);
        await t.see("In this version the configuration is read-only. Cases use the configuration shown.", `${env}: it says the configuration is read-only (TC-44 step 1)`);
        t.check(`${env}: lands on /admin/rules`, (await t.hash()).startsWith("#/admin/rules"), await t.hash());
        t.check(`${env}: the config rows were read`, (await t.calls((c) => c.command === "DATAFORM_GET_ITEMS" && c.flowId === F.config)).length > 0);
        await t.seeTid("rules-tab", `${env}: the rule table renders`);
        const rules = await t.ui.locator('[data-testid^="rule-row-"]').count();
        // m10: R-111 (Turkey, KKDIK) exists only in the RS-2026.2 row; without the rows the screen shows RS-2026.1
        t.check(`${env}: the rules come from the configuration rows (R-111, only in the RS-2026.2 row, is listed)`, rules > 0 && (await t.tid("rule-row-R-111").count()) > 0, [rules, await t.tid("rule-row-R-111").count()]);
        t.check(`${env}: the prepared draft from the rows is shown`, (await t.tid("config-draft-bar").getAttribute("data-draft")) === "true");
        t.check(`${env}: the version panel does not say “Only what you change gets a new version number.” (nobody changes it here)`, !(await t.tid("config-draft-bar").innerText()).includes("Only what you change"), await t.tid("config-draft-bar").innerText());
        t.check(`${env}: no "Read-only. Only the business administrator changes …" note for the administrator`, (await t.tid("admin-read-only").count()) === 0);
        const controls = async () => t.ui.locator(EDIT).count();
        t.check(`${env}: Rules: no edit control (create, discard, publish, add, edit, delete)`, (await controls()) === 0, await controls());
        // Test rules stays (TC-44 step 2)
        await t.tid("rules-tab-test").click();
        await t.seeTid("test-rules", `${env}: Test rules opens`);
        t.check(`${env}: Test rules offers "Try one material"`, (await t.ui.locator('[data-testid^="test-rules-view-"]').count()) > 0);
        for (const [route, label] of [["/admin/templates", "Questionnaire"], ["/admin/ownership", "Section owners"], ["/admin/notifications", "Reminders"]]) {
          await t.go(route);
          await t.page.waitForTimeout(300);
          t.check(`${env}: ${label}: no edit control`, (await controls()) === 0, await controls());
        }
        const days = t.ui.locator('input[data-testid^="reminder-after-"], [data-testid^="reminder-after-"] input');
        t.check(`${env}: Reminders: the day fields are shown read-only`, (await days.count()) > 0 && (await t.ui.locator('input[data-testid^="reminder-after-"]:not([disabled]), [data-testid^="reminder-after-"] input:not([disabled])').count()) === 0, await days.count());
        await t.page.waitForTimeout(500);
        t.check(`${env}: zero writes`, (await writes(t)).length === 0, summary(await writes(t)));
      }
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
      // one Kissflow user holding RMM and Product Safety: RMM activates ZZT-0001, then works as Safety
      await open(t, { roles: "rmm,saf", byid: "1" });
      await playCompleteness(t, CASE1);
      await t.reload();
      const saf = (await t.rows(F.review)).find((x) => x.Case_Item_Id === CASE1 && x.Review_Dept === "SAF");
      t.must("I-2 (E-A, played) started the Safety review of ZZT-0001", !!saf);
      const rmesBefore = (await t.rows(F.rmesSAF)).length;
      await t.tid("role-switcher").click();
      await t.tid("switch-role-saf").click(); // held: switches the screens, no Kissflow role change
      await t.settle(800);
      const rmes = (await t.rows(F.rmesSAF)).slice(rmesBefore).find((x) => x.Case_Item_Id === CASE1);
      t.must("Safety's first open creates its RMES row for ZZT-0001", !!rmes);
      const crit = rmes["Table::Safety_Criteria"] ?? rmes.Safety_Criteria ?? [];
      t.check("with the planned criteria as child rows", crit.length > 0 && crit.every((r) => r.Criteria_Code), crit.length);
      const audits = (await t.rows(F.audit)).length;
      const from = (await t.calls()).length;
      await t.go("/review/ZZT-0001?tab=rmes");
      await t.seeTid("rmes-tab", "the RMES tab");
      const ids = await t.ui.locator('[data-testid^="criterion-result-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice("criterion-result-".length)));
      t.check("every criterion can be recorded", ids.length === crit.length, [ids.length, crit.length]);
      for (const id of ids) {
        await t.tid(`criterion-result-${id}`).getByRole("combobox").click();
        await t.ui.getByRole("option", { name: "Available", exact: true }).click();
        await t.act(`criterion-save-${id}`);
      }
      const after = (await t.rows(F.rmesSAF)).find((x) => x._id === rmes._id);
      const rowsAfter = after["Table::Safety_Criteria"] ?? after.Safety_Criteria ?? [];
      t.check("each result written on its own row (no duplicate row)", rowsAfter.length === crit.length && rowsAfter.every((r) => r.Criteria_Result === "Available"), rowsAfter.map((r) => [r.Criteria_Code, r.Criteria_Result]));
      await t.tid("decision-choice").getByRole("button", { name: "Approved", exact: true }).click();
      await t.act("decision-record");
      const rev = (await t.rows(F.review)).find((x) => x._id === saf._id);
      t.check("the decision is written on the Safety review", rev.RMES_Decision === "Approved", rev.RMES_Decision);
      await t.go("/review/ZZT-0001");
      await t.seeTid("complete-review", "Complete my review");
      const n = (await t.calls()).length;
      await t.act("complete-review");
      const seq = (await t.calls((c) => c.seq >= n && c.flowId === F.review && WRITE.test(c.command))).map((c) => c.command + (c.refused ? "!" : ""));
      const upd = (await t.calls((c) => c.seq >= n && c.flowId === F.review && c.command === "PROCESS_UPDATE_ITEM"))[0];
      t.check("complete: the counts and confirmation, then the submit", seq.join(" ") === "PROCESS_UPDATE_ITEM PROCESS_SUBMIT_ITEM" && ["Open_Count", "RMES_Gaps", "Review_Confirm", "Completed_At", "Completed_By"].every((k) => upd.keys.includes(k)), [seq, upd?.keys]);
      const done = (await t.rows(F.review)).find((x) => x._id === saf._id);
      t.check("the Safety review is at End, Review_Gate OK", done._status === "Completed" && done.Review_Gate === "OK", [done._status, done.Review_Gate]);
      const rows = await auditSince(t, audits);
      t.check("audit rows: rmes.saved per result and the decision, then review.completed", codes(rows).filter((c) => c === "rmes.saved").length === ids.length + 1 && codes(rows).at(-1) === "review.completed", codes(rows));
      t.check("no write refused", (await refusedCalls(t, from)).length === 0, await refusedCalls(t, from));
      await t.shot("completed");
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
      await t.go(`/review/ZZT-0003?op=${op.OP_Key}`);
      await t.tid(`op-close-${op.OP_Key}`).first().click();
      await t.fillText("op-close-reason", "Internal: not needed any more.");
      await t.act("op-close-confirm");
      hooks = await t.hooks();
      const closed = hooks.filter((h) => h.code === "mail");
      t.check("close: op.closed, then one mail, without the internal reason", codesNoHist(hooks) === "op.closed,mail" && closed[0]?.body?.Subject === "ZZT-0003: an open question was closed" && !closed[0]?.body?.Body.includes("Internal"), hooks.map((h) => [h.code, h.body?.Subject]));
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
      const OWN = new Set([F.rmesSAF, F.note, F.audit]);
      await open(t, { roles: "saf", byid: "1" });
      await t.settle(600);
      t.check("the first load read the lists", (await t.calls((c) => LISTS.test(c.command))).length > 0);
      await t.go("/review/ZZT-0003?tab=rmes");
      await t.seeTid("rmes-tab", "the RMES tab");
      const ids = await t.ui.locator('[data-testid^="criterion-result-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice("criterion-result-".length)));
      t.must("a Safety criterion waits for its result", ids.length > 0, ids);
      const id = ids[0];
      let from = (await t.calls()).length;
      const toasts = (await t.toastLog()).length;
      await t.tid(`criterion-result-${id}`).getByRole("combobox").click();
      await t.ui.getByRole("option", { name: "Available", exact: true }).click();
      await t.act(`criterion-save-${id}`);
      t.check("“RMES result saved.”", !!(await t.waitToast(/RMES result saved/, toasts)), (await t.toastLog()).slice(toasts));
      const rmes = (await t.rows(F.rmesSAF)).find((x) => x.Case_Item_Id === CASE3);
      const row = (rmes?.["Table::Safety_Criteria"] ?? rmes?.Safety_Criteria ?? []).find((r) => r.Criteria_Code === id);
      t.check("Kissflow holds the result", row?.Criteria_Result === "Available", row);
      let since = await t.calls((c) => c.seq >= from);
      t.check("Save result reads no list again (no DATAFORM_GET_ITEMS / PROCESS_GET_MY_TASKS_ITEMS / PROCESS_GET_MY_ITEMS / PROCESS_GET_ADMIN_ITEMS)", !since.some((c) => LISTS.test(c.command)), summary(since));
      t.check("… only its own calls: the RMES row read, written and read back, and its audit row", since.length > 0 && since.every((c) => /^DATAFORM_(GET_ITEM|UPDATE_ITEM|CREATE_ITEM|SUBMIT_ITEM)$/.test(c.command) && OWN.has(c.flowId)), summary(since));
      const crit = t.tid(`criterion-${id}`);
      const text = (await crit.innerText().catch(() => "")) || "";
      t.check("the screen shows the saved result (Kissflow's read-back, the optimistic state is gone)", /Available/.test(text) && !/No result/.test(text), text.slice(0, 200));
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
  "finding-kept-on-failure": () =>
    scenario("finding-kept-on-failure", async (t) => {
      // gap 6 on the RMES tab: Add finding and Ask the supplier about a finding keep their modal open with the text
      // when the save fails; sent again, they close
      await open(t, { roles: "saf", byid: "1" });
      await t.go("/review/ZZT-0003?tab=rmes");
      await t.seeTid("rmes-tab", "the RMES tab");
      const findings = async () => {
        const rmes = (await t.rows(F.rmesSAF)).find((x) => x.Case_Item_Id === CASE3);
        return rmes?.["Table::Safety_Findings"] ?? rmes?.Safety_Findings ?? [];
      };
      const before = (await findings()).length;
      // 1. a finding (the RMES row's update refused)
      const TEXT = "The CoA gives no limit for nickel.";
      await t.tid("add-finding").first().click();
      await t.fillText("finding-text", TEXT);
      await t.refuse("DATAFORM_UPDATE_ITEM");
      await t.lag(300);
      let toasts = (await t.toastLog()).length;
      await t.tid("finding-save").first().click();
      let busy = await t.button("finding-save");
      t.check("Add finding says “Sending…” and is disabled while the finding is saved", busy.disabled && busy.text === "Sending…", busy);
      await t.lag(0);
      await t.settle();
      t.check("the finding: “Not saved: …”", !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
      const kept = (await t.tid("finding-save").count()) === 1;
      t.check("a failed finding keeps the modal open with its text", kept && (await t.value("finding-text")) === TEXT, [kept, kept && (await t.value("finding-text"))]);
      t.check("Kissflow holds no new finding", (await findings()).length === before, (await findings()).length);
      await t.refuse("DATAFORM_UPDATE_ITEM", false);
      await t.act("finding-save");
      const fid = (await findings()).find((r) => r.Findings_Text === TEXT)?.Findings_Key;
      t.must("sent again: Kissflow holds the finding and the modal closes", !!fid && (await t.tid("finding-save").count()) === 0, [fid, await t.tid("finding-save").count()]);
      // 2. a query from that finding (the CIQ Open Point create refused)
      const ops = (await t.rows(F.op)).map((x) => x._id);
      const Q = "Please send the nickel limit of the material.";
      await t.tid(`finding-ask-${fid}`).first().click();
      await t.fillText("finding-ask-question", Q);
      await t.refuse("PROCESS_CREATE_ITEM");
      await t.lag(300);
      toasts = (await t.toastLog()).length;
      await t.tid("finding-ask-send").first().click();
      busy = await t.button("finding-ask-send");
      t.check("Send to supplier says “Sending…” and is disabled while the query is raised", busy.disabled && busy.text === "Sending…", busy);
      await t.lag(0);
      await t.settle();
      t.check("the query: “Not saved: …”", !!(await t.waitToast(/^Not saved: /, toasts)), (await t.toastLog()).slice(toasts));
      const open1 = (await t.tid("finding-ask-send").count()) === 1;
      t.check("a failed query keeps the modal open with its question", open1 && (await t.value("finding-ask-question")) === Q, [open1, open1 && (await t.value("finding-ask-question"))]);
      t.check("Kissflow holds no new open point", (await t.rows(F.op)).every((x) => ops.includes(x._id)));
      await t.refuse("PROCESS_CREATE_ITEM", false);
      await t.act("finding-ask-send");
      const op = (await t.rows(F.op)).find((x) => !ops.includes(x._id));
      t.check("sent again: Kissflow holds the point and the modal closes", op?.Question_Text === Q && (await t.tid("finding-ask-send").count()) === 0, [op?.Question_Text, await t.tid("finding-ask-send").count()]);
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
      // what the reviewer typed stays: first the RMES list refused, then only the record's full read (its criteria)
      await open(t, { roles: "saf", byid: "1" });
      await t.go("/review/ZZT-0003?tab=rmes");
      await t.seeTid("rmes-tab", "the RMES tab");
      const criteria = () => t.ui.locator('[data-testid^="criterion-result-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice("criterion-result-".length)));
      const ids = await criteria();
      t.must("a Safety criterion waits for its result", ids.length > 0, ids);
      const id = ids[0];
      const NOTE = "Nickel checked against the CoA; waiting for the second batch.";
      await t.fillText(`criterion-comment-${id}`, NOTE);
      const warned = async () => ((await t.tid("load-warnings").count()) ? (await t.tid("load-warnings").first().textContent()) ?? "" : "");
      for (const [cmd, what] of [["DATAFORM_GET_ITEMS@rmesSAF", "the RMES list"], ["DATAFORM_GET_ITEM@rmesSAF", "the RMES record's own read (its criteria)"]]) {
        await t.refuse(cmd);
        await t.reload();
        const now = await criteria();
        t.check(`${what} refused on Reload: the criteria stay on screen`, now.length === ids.length, [now.length, ids.length]);
        const kept = (await t.tid(`criterion-comment-${id}`).count()) === 1;
        t.check(`… and so does the comment typed before it`, kept && (await t.value(`criterion-comment-${id}`)) === NOTE, kept && (await t.value(`criterion-comment-${id}`)));
        t.check(`… with a warning that it is shown as of the earlier read`, /shown as of \d{2}:\d{2}/.test(await warned()), await warned());
        await t.refuse(cmd, false);
      }
      await t.reload();
      t.check("read again: no “shown as of” warning", !/shown as of/.test(await warned()), await warned());
      t.check("… and the comment is still there", (await t.value(`criterion-comment-${id}`)) === NOTE);
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
      // APP-SAVING-GAPS gap 9: Complete review decides from what Kissflow holds when it runs. A finding a colleague added
      // after the screen loaded: with the record's own read refused, the completion is refused as not read again (the
      // list row has no findings, the last load's rows not this one); read again, the domain refuses it for the finding
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
      await t.go("/review/ZZT-0001?tab=rmes");
      await t.seeTid("rmes-tab", "the RMES tab");
      const ids = await t.ui.locator('[data-testid^="criterion-result-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice("criterion-result-".length)));
      for (const id of ids) {
        await t.tid(`criterion-result-${id}`).getByRole("combobox").click();
        await t.ui.getByRole("option", { name: "Available", exact: true }).click();
        await t.act(`criterion-save-${id}`);
      }
      await t.tid("decision-choice").getByRole("button", { name: "Approved", exact: true }).click();
      await t.act("decision-record");
      await t.go("/review/ZZT-0001");
      await t.seeTid("complete-review", "Complete my review");
      // a Safety colleague adds an open blocking finding on the record (another session)
      await t.page.evaluate(([flow, id, crit]) => {
        const x = window.__kfDb[flow].find((r) => r._id === id);
        const key = Array.isArray(x.Safety_Findings) ? "Safety_Findings" : "Table::Safety_Findings";
        (x[key] ??= []).push({ _id: "Safety_Findings_rowColleague", Findings_Key: "ZZT-0001-SAF-F99", Findings_Criterion_Code: crit, Findings_Text: "The CoA lacks the nickel limit.", Findings_Blocking: "Yes", Findings_State: "open" });
        x._modified_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      }, [F.rmesSAF, rmes._id, ids[0]]);
      const status = async () => (await t.rows(F.review)).find((x) => x._id === saf._id)._status;
      await t.refuse("DATAFORM_GET_ITEM@rmesSAF");
      let toasts = (await t.toastLog()).length;
      await t.act("complete-review");
      t.check("the record's own read refused: “Not completed: Kissflow could not read … again”", !!(await t.waitToast(/^Not completed: Kissflow could not read .*CIQ RMES Safety record of ZZT-0001.* again/, toasts)), (await t.toastLog()).slice(toasts));
      t.check("… and the Safety review is not completed in Kissflow", (await status()) !== "Completed", await status());
      await t.refuse("DATAFORM_GET_ITEM@rmesSAF", false);
      // the read after the refusal still showed the last load's rows: the screen allows Complete again
      t.must("Complete my review can be clicked again", !(await t.button("complete-review")).disabled);
      toasts = (await t.toastLog()).length;
      await t.act("complete-review");
      t.check("read again: the colleague's open finding refuses it (“Cannot complete: …”)", !!(await t.waitToast(/^Cannot complete/, toasts)), (await t.toastLog()).slice(toasts));
      t.check("… and the Safety review is still not completed", (await status()) !== "Completed", await status());
      await t.go("/review/ZZT-0001?tab=rmes");
      await t.see("The CoA lacks the nickel limit.", "the colleague's finding is on screen now");
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
