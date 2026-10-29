// Headless check of the BUILT portal UI (dist-portal/zip/index.html) the way Kissflow runs it: inside an iframe on a
// different origin, talking to its host page over postMessage. The host page here EMULATES Kissflow: it answers the
// real bundled SDK's commands (@kissflow/lowcode-client-sdk 1.0.49: CC_INITIALIZE, PROCESS_*, DATAFORM_*, API), serves
// the live-shaped v5 fixtures (src/portal/data/fixtures.ts: the demo's fictional Solvaro contacts on ZZT- cases),
// applies writes in memory so read-backs see them, pages lists like the SDK (50 per page), filters My tasks by step
// (the activity filter), moves the request from "fill in the CIQ" to "keep the CIQ up to date" on submit, leaves the
// current step out of admin lists (CAFM D55), and records every command. Proves the bundle's wiring against the SDK's
// real protocol, NOT how Kissflow's host actually answers (spike S-1 does that, in the Diagnostics page).
//   node scripts/harness-portal.mjs [scenario ...]   (default: all)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { LEAK_TERMS, appSupplierBundle, leakHits } from "./leak-scan.mjs";

const require = createRequire(import.meta.url);
const PW = "/Users/thomas/Documents/Kissflow Projects/POC/Promotion Management/app/node_modules/playwright-core";
const { chromium } = require(PW);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-portal");
const FX = JSON.parse(execFileSync(path.join(root, "node_modules/.bin/vite-node"), [path.join(root, "scripts/portal-fixtures.ts")], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const UI = readFileSync(path.join(out, "zip", "index.html"), "utf8");
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const HOOK_KINDS = ["requestChanged", "completenessConfirmed", "queryAnswered", "releaseGiven"];
/** The sha256 of each stored sandbox hook URL, per kind (src/portal/kf/portal.ts DEV_WEBHOOKS, read from its source):
 *  the hand-off scenarios compare what the UI sent with these, so no hook URL or token is kept or printed here. */
const STORED_SHA = (() => {
  const block = readFileSync(path.join(root, "src/portal/kf/portal.ts"), "utf8").match(/export const DEV_WEBHOOKS: Webhooks = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  const got = Object.fromEntries([...block.matchAll(/^\s*(\w+): "(https:\/\/[^"\s]+)",?$/gm)].map(([, kind, url]) => [kind, sha(url)]));
  if (Object.keys(got).length !== 4 || !HOOK_KINDS.every((k) => got[k])) throw new Error("harness: portal.ts DEV_WEBHOOKS does not hold the four stored sandbox hook URLs");
  return got;
})();

const ROLE_IDS = { admin: { _id: "RoEK3_yhR4wx", Name: "Admin", Kind: "Role" }, supplier: { _id: "RoEK4XPKXCvH", Name: "Supplier", Kind: "Role" }, none: { _id: "RoUser", Name: "User", Kind: "Role" } };
ROLE_IDS.supplier2 = ROLE_IDS.supplier;
const USERS = {
  admin: FX.users.admin,
  supplier: FX.users.elena, // may confirm
  supplier2: FX.users.ravi, // may not confirm (B-11)
  none: { _id: "UsNone", Name: "No Role", Email: "norole@example.com" },
};
// 16 Oct: the final release is a step of CIQP Request, assigned from Release_Contacts
const STEP = { fill: "Activity_15rz7z2", keep: "Activity_1mhx3t7", respond: "Activity_qohzey", release: "Activity_wlo2cfxnqa", released: "Activity_vngcws1q8w" };
const STEP_NAME = { [STEP.fill]: "Supplier: fill in the CIQ", [STEP.keep]: "Supplier: keep the CIQ up to date", [STEP.respond]: "Supplier: respond", [STEP.release]: "Supplier: give the final release", [STEP.released]: "Supplier: view the released CIQ" };

// The emulated Kissflow host. It is deliberately NOT kind to the UI:
//  - per-user lists: My items = items I started (a supplier starts none); My tasks = open items assigned to me
//    (Assigned_Contacts) at the step asked for (activityId); All items only for the Admin role; the participated list
//    answers, but a v5 UI must never ask for it (it fails platform-wide)
//  - lists answer { items, total } (the SDK's documented QueryResponse); ?envelope=Data answers { Data } instead
//  - ?rows=sparse: list rows carry only system fields and the case header; full fields only through getItem
//  - ?nofilter=1: the host ignores the activity filter (every task of the process comes back for every step)
//  - task reads/writes need the item's CURRENT activity instance and an assignee; DateTimes with milliseconds and
//    kf.api write bodies that are not JSON strings are refused (CAFM, live); errors come as { isError, errorMessage }
//  - a submit ignores Mandatory fields (proven live 21 Oct): "keep the CIQ up to date" moves on to "give the final
//    release" (the screen submits it only when Release_Flag is "Requested")
//  - ?race=1: right after the UI's first answers write on a request, a colleague's save made from the OLD state lands
//    and replaces it (plan v5 P3: two writes within ~0.1 s lose one)
//  - ?empty=1: no items at all (empty start)
//  - ?lag=N: every answer after the handshake comes N ms late (a slow connection; uploads twice as late)
//  - at "give the final release" only Release_By_Name, Release_By_Email, Release_By_Role and Release_At can be written
//    (every other field is ReadOnly there), and the submit holds the request at "view the released CIQ" unless
//    Release_Flag is "Reopened" (then the go-to step returns it to "keep the CIQ up to date")
//  - after the release the request is held at "view the released CIQ" (20 Oct): only the change-report fields can be
//    written there; the screen never submits it, so a submit there is refused (it would show as a refused command)
//  - UPDATE_FORM on a child-table row (the SDK's TableForm.updateField) changes that row of the item
//  - FILEPREVIEW_OPEN (Kissflow's file preview) is recorded in window.__kfPreviews
//  - the account is production's (no top bar) unless ?env=dev, which plays the Development sandbox (src/shell/env.ts
//    DEV_ACCOUNT): only there GET_ROLES answers and SWITCH_ROLE moves the user into another role for real (they leave
//    every current role; recorded in window.__kfSwitches), as scripts/harness-applive.mjs; ?also=supplier adds a
//    second held role
//  - hand-offs (portal.ts webhooksFor, Thomas 21 Oct: the sandbox's tokens on the page's own account, on the Kissflow
//    host around the page, else as a relative path): this host page is not on a Kissflow host, so the UI sends each
//    as the relative path /integration/2/<account>/webhook/<token> through kf.api, which records it (window.__kfHooks
//    and the harness) and answers like the webhook; kf.api refuses a webhook URL that is not relative, or names
//    another account. A scenario can load this page from an emulated Kissflow host instead (t.host's `parent`): the
//    UI then POSTs to that host itself, which the browser context records and answers; it answers no other request.
//    A request to the two local servers (this page's origin, the UI's) that is not a GET is recorded as a hand-off to
//    127.0.0.1, a host no page is given, and refused (405); the hand-offs are compared with the stored sandbox URLs by
//    sha256 only (STORED_SHA)
// window.__kfDb (the items), window.__kfSet(id, patch) and window.__kfMove(id, step) let a scenario play Beiersdorf's
// side (the sync service or the app's integrations).
function hostPage(uiOrigin) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Kissflow (emulated host)</title>
<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head><body>
<iframe id="kf-frame" title="app-custom-ui-CIQ_Supplier_Portal_A00"></iframe>
<script>
const P = new URLSearchParams(location.search);
const ROLE = P.get("role") || "admin", DELAY = Number(P.get("delayInit") || 0), EXTRA = Number(P.get("extra") || 0);
const LAG = Number(P.get("lag") || 0);
const ENVELOPE = P.get("envelope") || "items", SPARSE = P.get("rows") === "sparse", NOFILTER = P.get("nofilter") === "1", RACE = P.get("race") === "1";
let ignoreInits = Number(P.get("ignoreInits") || 0);
const ACCOUNT = P.get("env") === "dev" ? "AcDOSunMEpSA" : "AcHARNESS";
const FX = ${JSON.stringify(FX)}, ROLE_IDS = ${JSON.stringify(ROLE_IDS)}, USERS = ${JSON.stringify(USERS)}, STEP_NAME = ${JSON.stringify(STEP_NAME)}, STEP = ${JSON.stringify(STEP)};
const ME = USERS[ROLE];
let ROLE_KEYS = [ROLE, ...(P.get("also") || "").split(",").filter(Boolean)]; // let: the dev SWITCH_ROLE replaces them
const isAdmin = () => ROLE_KEYS.includes("admin");
const clone = (x) => JSON.parse(JSON.stringify(x));
const db = P.get("empty") === "1" ? {} : clone(FX.byFlow), help = clone(FX.help);
const tasks = new Map(P.get("empty") === "1" ? [] : FX.tasks.map(([id, act, activity]) => [id, { act, activity }]));
for (let i = 0; i < EXTRA; i++) (db.CIQP_Request_A00 ??= []).push({ _id: "PkGen" + i, _status: "Completed", _current_step: "End", _created_at: "2026-09-01T00:00:00Z", _modified_at: "2026-09-01T00:00:00Z", _created_by: { _id: "UsService" }, Case_Code: "GEN-" + i, Cycle_No: 1, Supplier_Code: "SUP-GEN", Request_Key: "GEN-" + i + "-REQ", Trade_Name: "Generated " + i });
const stores = new Map();
window.__kfCalls = [];
window.__kfDb = db;
let seq = 0, raced = false;
const now = () => new Date().toISOString().replace(/\\.\\d{3}Z$/, "Z");
const items = (f) => (db[f] ??= []);
const find = (f, id) => items(f).find((x) => x._id === id);
const findAny = (id) => Object.values(db).flat().find((x) => x._id === id);
window.__kfSet = (id, patch) => Object.assign(findAny(id), patch);
window.__kfMove = (id, step) => { tasks.set(id, { act: "ActMv" + ++seq, activity: STEP[step] }); Object.assign(findAny(id), { _current_step: STEP_NAME[STEP[step]], _status: "InProgress" }); };
window.__kfPreviews = [];
window.__kfHooks = [];
// the release step is assigned from Release_Contacts; every other step from Assigned_Contacts
const assignedToMe = (x) => (x[tasks.get(x._id)?.activity === STEP.release ? "Release_Contacts" : "Assigned_Contacts"] || []).some((u) => u._id === ME._id);
const withAct = (x) => ({ ...clone(x), ...(tasks.has(x._id) ? { _activity_instance_id: tasks.get(x._id).act } : {}) });
const LIST_KEEP = /^(_id|_status|_current_step|_created_at|_modified_at|_created_by|_modified_by|_activity_instance_id|Case_Code|Cycle_No|Supplier_Code|[A-Za-z]+_Key)$/;
const listRow = (x) => (SPARSE ? Object.fromEntries(Object.entries(x).filter(([k]) => LIST_KEEP.test(k))) : x);
const page = (rows, r) => {
  const n = r.pageNumber || 1, s = r.pageSize || 50, slice = rows.slice((n - 1) * s, n * s).map(listRow);
  return ENVELOPE === "Data" ? { Data: slice } : { items: slice, total: rows.length };
};
class KfError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const notFound = () => new KfError("KISSFLOW_ERROR_01015", "Item not found");
const noAccess = () => new KfError("KISSFLOW_ERROR_050302", "You don't have permission to access this item.");
const myTask = (f, r) => {
  const x = find(f, r.instanceId);
  if (!x) throw notFound();
  const t = tasks.get(x._id);
  if (!t || t.act !== r.activityInstanceId || !assignedToMe(x)) throw noAccess();
  return x;
};
const checkDates = (data) => {
  for (const [k, v] of Object.entries(data || {})) if (/(_At|_Since)$/.test(k) && typeof v === "string" && /\\.\\d{3}Z$/.test(v)) throw new KfError("KISSFLOW_ERROR_050312", "Validation failed for the following fields: {'" + k + "': ['Invalid datetime']}");
};
const M = (Role, Permission) => ({ Role, Permission });
function api(url, args) {
  const method = (args.method || "GET").toUpperCase();
  if ((method === "PUT" || method === "POST") && typeof args.body !== "string") throw new KfError("KISSFLOW_ERROR_00500", "Request body was not received (send a JSON string)");
  const body = typeof args.body === "string" ? JSON.parse(args.body) : args.body;
  let m = url.match(/\\/process\\/2\\/[^/]+\\/admin\\/([^/]+)\\/([^/?]+)/);
  if (m) {
    if (!isAdmin()) throw noAccess();
    const [, f, id] = m, x = find(f, id);
    if (!x) throw notFound();
    if (method === "GET") return clone(x);
    if (method === "PUT") { checkDates(body); Object.assign(x, body, { _modified_at: now() }); return clone(x); }
    if (method === "DELETE") { items(f).splice(items(f).indexOf(x), 1); tasks.delete(id); return {}; }
  }
  if (/\\/app_role\\/2\\/[^/]+\\/list/.test(url)) return { Data: [ROLE_IDS.supplier, ROLE_IDS.admin, { _id: "RoUser", Name: "User" }] };
  m = url.match(/\\/app_role\\/2\\/[^/]+\\/([^/?]+)/);
  if (m) return { _id: m[1], UserCount: { RoEK4XPKXCvH: 3, RoEK3_yhR4wx: 1 }[m[1]] ?? 0 };
  m = url.match(/\\/flow\\/2\\/[^/]+\\/(process|form)\\/([^/]+)\\/member/);
  if (m) {
    const used = ["CIQP_Request_A00", "CIQP_Query_A00", "CIQP_Final_Release_A00"].includes(m[2]);
    const sup = m[1] === "form" ? [{ _id: ROLE_IDS.supplier._id, Name: "Supplier", ...M("Viewer", []) }] : used ? [{ _id: ROLE_IDS.supplier._id, Name: "Supplier", ...M("Member", []) }] : [];
    const adm = m[1] === "form" ? M("Member", ["Delete"]) : M("Member", ["InitiateItems", "View"]);
    return [...sup, { _id: ROLE_IDS.admin._id, Name: "Admin", ...adm }];
  }
  if (/\\/flow\\/2\\/[^/]+\\/process\\//.test(url)) return { Data: Object.keys(db).map((k) => ({ _id: k })) };
  // a hand-off through the SDK (portal client.ts postWebhook): only a relative path, which Kissflow sends to the
  // account's own domain, on this account's integrations; recorded, then answered like the webhook does
  m = url.match(/\\/integration\\/2\\/([^/?#]+)\\/webhook\\/[^/?#]+/);
  if (m && method === "POST") {
    const h = { url, account: m[1], type: (args.headers || {})["Content-Type"], body: args.body, callsAt: window.__kfCalls.length };
    if (!url.startsWith("/integration/2/")) h.refused = "not a relative path";
    else if (m[1] !== ACCOUNT) h.refused = "another account";
    window.__kfHooks.push(h);
    if (window.__harnessHook) window.__harnessHook(h);
    if (h.refused) throw new KfError("KISSFLOW_ERROR_00404", "Webhook not found (" + h.refused + ")");
    return { status: "success" };
  }
  throw notFound();
}
function handle(r) {
  const f = r.flowId;
  switch (r.command) {
    case "CC_INITIALIZE":
      return { user: { ...ME, AppRoles: ROLE_KEYS.map((k) => ROLE_IDS[k]) }, account: { _id: ACCOUNT }, appId: "CIQ_Supplier_Portal_A00", componentId: "CCEK4IlNaGsH", envDetails: { isMobile: false } };
    case "PROCESS_GET_MY_ITEMS": return page(items(f).filter((x) => x._created_by && x._created_by._id === ME._id), r);
    case "PROCESS_GET_PARTICIPATED_ITEMS": return page([], r);
    case "PROCESS_GET_MY_TASKS_ITEMS": return page(items(f).filter((x) => tasks.has(x._id) && assignedToMe(x) && (NOFILTER || !r.activityId || tasks.get(x._id).activity === r.activityId)).map(withAct), r);
    case "PROCESS_GET_ADMIN_ITEMS": if (!isAdmin()) throw noAccess(); return page(items(f).map((x) => { const y = clone(x); delete y._current_step; return y; }), r); // D55: no step in the admin list
    case "PROCESS_GET_ITEM": return withAct(myTask(f, r));
    case "PROCESS_GET_ADMIN_ITEM": { if (!isAdmin()) throw noAccess(); const x = find(f, r.instanceId); if (!x) throw notFound(); return clone(x); }
    case "PROCESS_UPDATE_ITEM": {
      const x = myTask(f, r);
      checkDates(r.data);
      if (tasks.get(x._id).activity === STEP.release) {
        const ro = Object.keys(r.data || {}).filter((k) => !["Release_By_Name", "Release_By_Email", "Release_By_Role", "Release_At"].includes(k));
        if (ro.length) throw new KfError("KISSFLOW_ERROR_050313", "PermissionDeniedToUpdate: " + ro.join(", ") + " can't be changed at this step");
      }
      if (tasks.get(x._id).activity === STEP.released) {
        const ro = Object.keys(r.data || {}).filter((k) => !/^Change_Report_/.test(k));
        if (ro.length) throw new KfError("KISSFLOW_ERROR_050313", "PermissionDeniedToUpdate: " + ro.join(", ") + " can't be changed at this step");
      }
      const before = clone(x);
      Object.assign(x, r.data, { _modified_at: now(), _modified_by: { _id: ME._id, Name: ME.Name } });
      if (RACE && !raced && f === "CIQP_Request_A00" && r.data.Answers_JSON) {
        raced = true; // Ravi's save from the state before this write lands right after it and replaces it
        const old = JSON.parse(before.Answers_JSON || "{}"), oldBy = JSON.parse(before.Answered_By_JSON || "{}");
        Object.assign(x, { Answers_JSON: JSON.stringify({ ...old, "FLD-GEN-005": "Plant 2, Tarragona (Ravi)" }), Answered_By_JSON: JSON.stringify({ ...oldBy, "FLD-GEN-005": { name: "Ravi Menon", email: USERS.supplier2.Email, at: now(), by: "UsRavi" } }), Answers_Rev: (before.Answers_Rev || 0) + 1, _modified_by: { _id: "UsRavi", Name: "Ravi Menon" } });
      }
      return clone(x);
    }
    case "PROCESS_UPDATE_ADMIN_ITEM": { if (!isAdmin()) throw noAccess(); const x = find(f, r.instanceId); if (!x) throw notFound(); checkDates(r.data); Object.assign(x, r.data, { _modified_at: now() }); return clone(x); }
    case "PROCESS_SUBMIT_ITEM": {
      const x = myTask(f, r);
      const t = tasks.get(x._id);
      // a submit ignores Mandatory fields (proven live 21 Oct); the screen must never submit "view the released CIQ"
      if (t.activity === STEP.released) throw new KfError("KISSFLOW_ERROR_HARNESS", "The screen must never submit 'view the released CIQ'");
      if (t.activity === STEP.keep) {
        window.__kfMove(x._id, "release"); // assigned from Release_Contacts from here on
        return clone(x);
      }
      if (t.activity === STEP.release) {
        // the go-to step after the release: back to editing when reopened, else held at "view the released CIQ"
        window.__kfMove(x._id, x.Release_Flag === "Reopened" ? "keep" : "released");
        return clone(x);
      }
      if (t.activity === STEP.fill) {
        tasks.set(x._id, { act: "ActKeep" + ++seq, activity: STEP.keep });
        Object.assign(x, { _current_step: STEP_NAME[STEP.keep], _modified_at: now(), _modified_by: { _id: ME._id, Name: ME.Name } });
      } else {
        tasks.delete(x._id);
        Object.assign(x, { _status: "Completed", _current_step: "End", _modified_at: now(), _modified_by: { _id: ME._id, Name: ME.Name } });
      }
      return clone(x);
    }
    case "FILE_UPLOAD": {
      const file = r.file;
      if (!file || typeof file.name !== "string") throw new KfError("KISSFLOW_ERROR_00400", "No file received");
      const id = "Attach-" + ++seq;
      return { id, key: "CIQP_Request_A00/x/" + id + "/" + (r.fileName || file.name), name: r.fileName || file.name, size: file.size, fileExtension: "pdf", uploaded: 100, _created_at: now() };
    }
    case "PROCESS_INIT_FORM": {
      if (!r.activityInstanceId) throw new KfError("KISSFLOW_ERROR_00400", "initForm without an activity instance would start a NEW draft");
      const x = myTask(f, r);
      const storeId = "store-" + ++seq;
      stores.set(storeId, { flowId: f, instanceId: x._id, act: r.activityInstanceId });
      return { storeId, itemId: x._id, activityInstanceId: r.activityInstanceId };
    }
    case "ADD_TABLE_ROW": {
      const st = stores.get(r.storeId);
      if (!st || st.instanceId !== r.instanceId) throw new KfError("KISSFLOW_ERROR_00400", "Unknown form store");
      const x = myTask(st.flowId, { instanceId: st.instanceId, activityInstanceId: st.act });
      checkDates(r.rowObject);
      if (!r.rowObject.Upload_Id || !r.rowObject.Upload_Attachment_Id) throw new KfError("KISSFLOW_ERROR_050312", "An Uploads row needs Upload_Id and Upload_Attachment_Id");
      const key = Array.isArray(x[r.tableId]) ? r.tableId : "Table::" + r.tableId;
      x[key] = [...(x[key] || []), { _id: "row-" + ++seq, ...r.rowObject }];
      x._modified_at = now();
      return {};
    }
    case "UPDATE_FORM": {
      const st = stores.get(r.storeId);
      if (!st || st.instanceId !== r.instanceId) throw new KfError("KISSFLOW_ERROR_00400", "Unknown form store");
      const x = myTask(st.flowId, { instanceId: st.instanceId, activityInstanceId: st.act });
      checkDates(r.data);
      if (!r.tableId || !r.rowId) { Object.assign(x, r.data); x._modified_at = now(); return {}; }
      const key = Array.isArray(x[r.tableId]) ? r.tableId : "Table::" + r.tableId;
      const row = (x[key] || []).find((y) => y._id === r.rowId);
      if (!row) throw new KfError("KISSFLOW_ERROR_00404", "No such row");
      Object.assign(row, r.data);
      x._modified_at = now();
      return {};
    }
    case "DATAFORM_GET_ITEMS": return page(help, r);
    case "DATAFORM_CREATE_ITEM": { const x = { _id: "PkDraft" + ++seq, ...r.data }; help.push(x); return clone(x); }
    case "DATAFORM_SUBMIT_ITEM": { const x = help.find((h) => h._id === r.itemId); if (!x) throw notFound(); x._id = "PkHelpNew" + ++seq; return clone(x); } // submit finalises under a NEW id
    case "DATAFORM_UPDATE_ITEM": { const x = help.find((h) => h._id === r.itemId); if (!x) throw notFound(); Object.assign(x, r.data); return clone(x); }
    case "DATAFORM_DELETE_ITEM": { const i = help.findIndex((h) => h._id === r.itemId); if (i < 0) throw notFound(); help.splice(i, 1); return {}; }
    case "FILEPREVIEW_OPEN": window.__kfPreviews.push({ files: r.files, indexOfFile: r.indexOfFile }); return {};
    case "REDIRECT": (window.__kfRedirects ??= []).push(r.url); return {};
    // dev only (index.d.ts l.1294-1330): every portal role; currentRoles as ids (the portal facade's type)
    case "GET_ROLES":
      if (ACCOUNT !== "AcDOSunMEpSA") throw new KfError("KISSFLOW_ERROR_00010", "Only available in a Development account");
      return { roles: ["supplier", "admin", "none"].map((k) => ({ _id: ROLE_IDS[k]._id, Name: ROLE_IDS[k].Name })), currentRoles: [...new Set(ROLE_KEYS.map((k) => ROLE_IDS[k]._id))].map((_id) => ({ _id })) };
    // a REAL switch: the user leaves every current role and joins this one
    case "SWITCH_ROLE": {
      if (ACCOUNT !== "AcDOSunMEpSA") throw new KfError("KISSFLOW_ERROR_00010", "Only available in a Development account");
      const key = ["supplier", "admin", "none"].find((k) => ROLE_IDS[k]._id === r.roleId || (r.roleName && ROLE_IDS[k].Name === r.roleName));
      if (!key) throw new KfError("KISSFLOW_ERROR_03069", "This Role ID doesn't exist.");
      (window.__kfSwitches ??= []).push({ from: ROLE_KEYS.slice(), to: key });
      ROLE_KEYS = [key];
      return { _id: ROLE_IDS[key]._id, Name: ROLE_IDS[key].Name };
    }
    case "API": return api(r.url, r.args || {});
    default: throw new KfError("NOT_EMULATED", "Not emulated: " + r.command);
  }
}
const frame = document.getElementById("kf-frame");
window.addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow) return;
  const r = e.data;
  if (!r || !r._id || !r.command) return;
  const rec = { seq: window.__kfCalls.length, command: r.command, flowId: r.flowId, instanceId: r.instanceId, activityInstanceId: r.activityInstanceId, activityId: r.activityId, pageNumber: r.pageNumber, url: r.url, method: r.args && r.args.method, data: JSON.stringify(r.data ?? r.rowObject ?? (r.args && r.args.body) ?? (r.file ? { fileName: r.fileName } : null)).slice(0, 600), keys: Object.keys(r.data ?? r.rowObject ?? {}).sort().join(",") };
  window.__kfCalls.push(rec);
  if (r.command === "CC_INITIALIZE" && ignoreInits > 0) { ignoreInits--; return; }
  const reply = (resp) => frame.contentWindow.postMessage({ _req: r, resp }, "*");
  setTimeout(() => {
    let resp;
    try { resp = handle(r); } catch (err) { resp = { isError: true, errorMessage: { error_code: err.code || "KISSFLOW_ERROR", en_message: String(err.message || err) } }; rec.refused = resp.errorMessage.en_message; }
    reply(resp);
  }, r.command === "CC_INITIALIZE" ? DELAY : r.command === "FILE_UPLOAD" ? LAG * 2 : LAG);
});
frame.src = ${JSON.stringify(uiOrigin + "/")} + location.hash;
</script></body></html>`;
}

const listen = (handler) => new Promise((resolve) => { const s = createServer(handler).listen(0, "127.0.0.1", () => resolve(s)); });
/** Told of every request to the two local servers that is not a GET (set by the running scenario, which records it as a
 *  hand-off to 127.0.0.1). The browser context does not route these servers, so without it a UI that POSTed to its own
 *  origin or the host page's (a regression that fetch()es the relative hook path) would go unseen. */
let onLocalRequest = null;
/** A local server: a GET (or HEAD) is answered with its page; anything else is recorded (onLocalRequest) and refused. */
const localServer = (page) => (req, res) => {
  if (req.method === "GET" || req.method === "HEAD") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(page()); return; }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    onLocalRequest?.({ method: req.method, url: `http://127.0.0.1:${req.socket.localPort}${req.url}`, type: req.headers["content-type"], body: Buffer.concat(chunks).toString("utf8") });
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
    res.end("Only GET is served here.");
  });
};
const uiServer = await listen(localServer(() => UI));
const UI_ORIGIN = `http://127.0.0.1:${uiServer.address().port}`;
const hostServer = await listen(localServer(() => hostPage(UI_ORIGIN)));
const HOST_ORIGIN = `http://127.0.0.1:${hostServer.address().port}`;

const browser = await chromium.launch();
const results = [];
let loads = 0;

/** The account each emulated environment's handshake carries (hostPage ACCOUNT). */
const ACCOUNT_OF = { dev: "AcDOSunMEpSA", prod: "AcHARNESS" };
/** Where a recorded hand-off went, without its token: the page's environment and account, the route and the host. */
const hookWhere = (h) => (h ? `${h.env}/${h.account || "?"} → ${h.route === "api" ? `kf.api (${h.url.startsWith("/") ? "relative" : "absolute"})` : h.host}${h.method && h.method !== "POST" ? ` (${h.method})` : ""}${h.given ? ` [page on ${h.given}]` : ""}${h.refused ? ` refused: ${h.refused}` : ""}` : "none");
/** A hand-off that went where no page sent it (scenario's last check): from a page without an account, to another
 *  account, refused, through kf.api with anything but a relative hook path, or by the browser to a host the page was not
 *  given (127.0.0.1, the local servers, is never given). */
const astrayHook = (h) => h.env === "none" || h.account !== ACCOUNT_OF[h.env] || !!h.refused || (h.route === "api" ? !h.url.startsWith("/integration/2/") : !h.given || h.host !== h.given);
// Emulated Kissflow hosts a host page can be loaded from (t.host's `parent`). Built from parts: a Kissflow host written
// as text is what the zip guards refuse. Nothing is sent to either: the browser context answers both.
const DEV_HOST = `dev-beiersdorf.kissflow.${"eu"}`; // the Development sandbox's own
const PROD_PARENT = `ciq-prod-harness.kissflow.${"com"}`; // a fictional production host
// The UI as such a page frames it: from another emulated https origin (Chromium does not let a public https page frame
// 127.0.0.1), answered by the browser context like the parent.
const UI_ROUTED = "https://ciq-portal-ui.harness.test";

async function scenario(name, steps, ctxOpts = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...ctxOpts });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  // No harness run may leave this machine: the browser context answers every request that is not to the two local
  // servers. A POST is recorded as a hand-off (route "fetch", with its host) and, when its path is a webhook's
  // (/integration/2/<account>/webhook/<token>), answered like Kissflow does (200 {"status":"success"}); the emulated
  // Kissflow host a scenario loads the host page from (t.host's `parent`) is served that page, and UI_ROUTED the UI it
  // frames; anything else is refused. Hand-offs the UI sends through kf.api (route "api", a relative path) come from the host page's emulator.
  // A request to the two local servers that is not a GET is recorded too (route "fetch", host 127.0.0.1: a host no page
  // is given) and refused by the server (localServer).
  // Each hand-off records the page's account and the host the page was given.
  const hooks = [];
  // 22 Oct: the mails to "Mail Integration - Thomas" ({To, Subject, Body}) go through the same routes; they are kept apart,
  // so every hand-off check below sees the hand-offs only (a hand-off payload never has a Subject)
  const mails = [];
  const keep = (h) => (/Subject/.test(JSON.stringify(h)) ? mails : hooks).push(h);
  let env = "none"; // the account of the page that sent a hand-off: "dev", "prod", or "none" (the UI opened directly)
  let given = null; // the Kissflow host the host page was loaded from (t.host's `parent`); null: none (127.0.0.1)
  await context.exposeBinding("__harnessHook", (_source, h) => { keep({ ...h, route: "api", host: "", env, given }); });
  onLocalRequest = async (q) => {
    const at = { env, given };
    const callsAt = await page.evaluate(() => (window.__kfCalls ?? []).length).catch(() => -1);
    const m = new URL(q.url).pathname.match(/^\/integration\/2\/([^/]+)\/webhook\/[^/]+$/);
    keep({ ...q, account: m?.[1] ?? "", host: "127.0.0.1", route: "fetch", callsAt, ...at });
  };
  const local = (u) => u.origin === HOST_ORIGIN || u.origin === UI_ORIGIN;
  await context.route((u) => /^https?:$/.test(u.protocol) && !local(u), async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (r.method() === "GET" && given && u.hostname === given && u.pathname === "/harness-host") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: hostPage(UI_ROUTED) });
    if (r.method() === "GET" && u.origin === UI_ROUTED && u.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: UI });
    if (r.method() === "POST") {
      const m = u.pathname.match(/^\/integration\/2\/([^/]+)\/webhook\/[^/]+$/);
      // where the host's command log stood when the POST arrived: proves what happened before it
      const callsAt = await page.evaluate(() => (window.__kfCalls ?? []).length).catch(() => -1);
      keep({ url: r.url(), account: m?.[1] ?? "", host: u.hostname, route: "fetch", type: r.headers()["content-type"], body: r.postData(), callsAt, env, given });
      if (m) return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"success"}' });
    }
    return route.abort();
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  let ui = page; // the UI's frame (or the page itself when opened directly)
  const t = {
    page,
    get ui() { return ui; },
    hooks: () => hooks,
    /** The mails the UI posted ({To, Subject, Body}; only when the build carries the mail token). */
    mails: () => mails,
    errors: () => errors,
    /** Loads the emulated host page; `parent` loads it from that (emulated) Kissflow host instead of 127.0.0.1. */
    async host(params, route = "", { parent } = {}) {
      env = params.env === "dev" ? "dev" : "prod";
      given = parent ?? null;
      const at = parent ? `https://${parent}/harness-host` : `${HOST_ORIGIN}/`;
      // a fresh query each time: a URL that differs only in its #route would not reload the host or the frame
      await page.goto(`${at}?${new URLSearchParams({ ...params, n: String(++loads) })}#${route}`);
      await page.waitForFunction(() => document.getElementById("kf-frame")?.contentWindow, null, { timeout: 5000 });
      ui = page.frameLocator("#kf-frame");
    },
    async direct(route = "") {
      env = "none";
      given = null;
      await page.goto(`${UI_ORIGIN}/#${route}`);
      ui = page;
    },
    frame() { return page.frames().find((f) => f.url().startsWith(UI_ORIGIN) || f.url().startsWith(UI_ROUTED)) ?? page.mainFrame(); },
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
    async calls(pred) { return (await page.evaluate(() => window.__kfCalls ?? [])).filter(pred); },
    async item(id) { return page.evaluate((x) => Object.values(window.__kfDb).flat().find((i) => i._id === x), id); },
    async set(id, patch) { await page.evaluate(([x, p]) => window.__kfSet(x, p), [id, patch]); },
    /** Moves a task to another step (Beiersdorf's side: the app's integration approving the item). */
    async move(id, step) { await page.evaluate(([x, st]) => window.__kfMove(x, st), [id, step]); },
    async previews() { return page.evaluate(() => window.__kfPreviews ?? []); },
    /** Waits until no write is in flight (the header says "Updated …", not "Saving…"). */
    async settle(ms = 400) { await page.waitForTimeout(ms); await ui.getByText("Saving…").first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {}); await page.waitForTimeout(200); },
    check(label, pass, detail) { checks.push({ label, pass: !!pass, ...(detail !== undefined ? { detail } : {}) }); },
    async shot(tag) { await page.screenshot({ path: path.join(out, `harness-${name}-${tag}.png`), fullPage: false }); },
  };
  try {
    await steps(t);
  } catch (e) {
    checks.push({ label: "scenario ran to the end", pass: false, detail: String(e.message || e).slice(0, 400) });
    await t.shot("failure").catch(() => {});
  }
  checks.push({ label: "no page errors", pass: errors.length === 0, ...(errors.length ? { detail: errors.slice(0, 5) } : {}) });
  // each hand-off goes to the page's own account (portal.ts webhooksFor, Thomas 21 Oct) and to no host the page was not
  // given: a POST of the browser's only to the Kissflow host the page was loaded from, kf.api only with a relative path
  // (Kissflow sends it to the account's own domain), and nothing to the local servers (127.0.0.1); a page without an
  // account sends none. Only hosts and accounts are reported: a hook URL carries its token
  const astray = hooks.filter(astrayHook);
  checks.push({ label: "every hand-off goes to the page's own account, and to no host the page was not given (kf.api: relative paths only)", pass: astray.length === 0, ...(astray.length ? { detail: astray.map(hookWhere) } : {}) });
  await context.close();
  onLocalRequest = null;
  const pass = checks.every((c) => c.pass);
  results.push({ name, pass, checks });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} (${checks.length} checks)`);
  for (const c of checks) if (!c.pass) console.log(`   ✗ ${c.label}${c.detail !== undefined ? " — " + JSON.stringify(c.detail) : ""}`);
}

const TASK_ACT = Object.fromEntries(FX.tasks.map(([id, act]) => [id, act]));
const noMs = (c) => !/\.\d{3}Z/.test(c.data);
const J = (s) => JSON.parse(s || "null");
const writes = (t, pred = () => true) => t.calls((c) => /UPDATE_ITEM|SUBMIT_ITEM|ADD_TABLE_ROW|CREATE_ITEM|FILE_UPLOAD|PROCESS_INIT_FORM/.test(c.command) && !/ADMIN/.test(c.command) && pred(c));
const summary = (cs) => cs.map((c) => `${c.command.replace("PROCESS_", "")}${c.instanceId ? " " + c.instanceId : ""}${c.command === "PROCESS_UPDATE_ITEM" ? " [" + c.keys + "]" : ""}`);

const htmlTheme = (t) => t.frame().evaluate(() => document.documentElement.dataset.theme);
// Lightness 0–1 of the page background: oklch() reports L directly; rgb() is converted to relative luminance.
const bgLightness = (t) =>
  t.frame().evaluate(() => {
    const c = getComputedStyle(document.body).backgroundColor;
    const n = c.match(/[\d.]+/g).map(Number);
    return c.startsWith("oklch") ? n[0] : (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255;
  });

/** A metadata question: a list of chips to click (toggles), or Yes/No. */
async function config(t, q, v) {
  const box = t.tid(`q-config-${q}`).first();
  if (typeof v === "boolean") await box.getByRole("button", { name: v ? "Yes" : "No", exact: true }).click();
  else for (const label of v) await box.getByRole("button", { name: label, exact: true }).click();
  await t.page.waitForTimeout(150);
}
async function answerText(t, fieldId, value) {
  const input = t.tid(`q-field-${fieldId}`).first().locator('textarea, input:not([type="file"]):not([type="checkbox"])').first();
  await input.fill(String(value));
  await input.blur();
}
const pdf = (name) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 harness") });
/** Thomas, 15 Oct (permissions.ts RELEASE_LOCKED_TEXT): the questionnaire is locked while the final release is requested. */
const RELEASE_LOCKED = "Your questionnaire is locked because Beiersdorf has requested your final release. If something must change, contact Beiersdorf; they can reopen the review.";
/** Editable data controls in the questionnaire (text inputs and enabled uploads); a locked questionnaire has none. */
const editable = (t) => t.ui.locator('[data-testid="q-root"] input:not([type="checkbox"]):not([type="file"]):not([disabled]):not([readonly]), [data-testid="q-root"] textarea:not([disabled]):not([readonly]), [data-testid^="q-upload-"] input[type="file"]:not([disabled])').count();

const SCENARIOS = {
  "bundle-leak": () =>
    scenario("bundle-leak", async (t) => {
      // 28 Oct (BDF: suppliers have no access to the RMES in any form): the built portal and the supplier-facing parts
      // of the live app carry no RMES text, none of the retired criteria RMES and none of the sheet's labels
      // (scripts/leak-scan.mjs; counts only, never the text around a hit)
      const portal = leakHits(UI);
      t.check(`the built portal (index.html, ${(UI.length / 1024).toFixed(0)} KB) holds none of the ${LEAK_TERMS.length} internal RMES terms`, portal.length === 0, portal);
      const app = await appSupplierBundle();
      const appHits = leakHits(app, { fieldIds: true });
      t.check("the live app's supplier mails and questions history hold none of them either", app.length > 10000 && appHits.length === 0, appHits.length ? appHits : app.length);
    }),
  outside: () =>
    scenario("outside", async (t) => {
      const t0 = Date.now();
      await t.direct("/");
      await t.see("Not running inside Kissflow", undefined, 4000);
      t.check("says so at once when opened directly (no SDK wait)", Date.now() - t0 < 4000, `${Date.now() - t0} ms`);
      await t.ui.getByRole("button", { name: "Open demo preview" }).click();
      await t.see("Preview of the supplier view with demo data");
      await t.notSee("Back to admin", "demo opened outside Kissflow has no admin link");
      await t.shot("demo");
    }),
  "no-answer": () =>
    scenario("no-answer", async (t) => {
      await t.host({ role: "admin", ignoreInits: 1 }, "/");
      await t.page.waitForTimeout(700);
      await t.see("Connecting to Kissflow", "branded loader while connecting");
      t.check("loader shows the Beiersdorf logo", await t.ui.getByRole("img", { name: "Beiersdorf" }).first().isVisible().catch(() => false));
      await t.see("Couldn't connect to Kissflow", "says so when Kissflow does not answer", 16000);
      await t.ui.getByRole("button", { name: "Try again" }).click();
      await t.see("Overview", "Try again connects once the host answers");
      t.check("two handshakes were sent (first unanswered, then Retry)", (await t.calls((c) => c.command === "CC_INITIALIZE")).length === 2);
    }),
  none: () =>
    scenario("none", async (t) => {
      await t.host({ role: "none" }, "/");
      await t.see("No access to the supplier portal");
      await t.notSee("OLIVIA Pure 100", "no case data shown");
      t.check("no item reads", (await t.calls((c) => /^PROCESS_|^DATAFORM_/.test(c.command))).length === 0);
    }),
  "empty-start": () =>
    scenario("empty-start", async (t) => {
      await t.host({ role: "supplier", empty: "1" }, "/portal");
      await t.seeTid("empty-portal", "an empty start says 'No requests yet'");
      await t.see("No requests yet");
      t.check("nothing is written", (await writes(t)).length === 0);
      await t.shot("empty");
    }),
  supplier: () =>
    scenario(
      "supplier",
      async (t) => {
        await t.host({ role: "supplier", delayInit: 1200 }, "/admin");
        await t.page.waitForTimeout(500);
        await t.see("OLIVIA Pure 100");
        t.check("admin route redirects a supplier to /portal", (await t.frame().evaluate(() => location.hash)).startsWith("#/portal"));
        t.check("light theme by default although the OS prefers dark", (await htmlTheme(t)) === "light" && (await bgLightness(t)) > 0.85, { theme: await htmlTheme(t), bg: await bgLightness(t) });
        await t.seeTid("portal-tasks", "the tasks are on My requests (A-32)");
        for (const [code, kind] of [["ZZT-0001", "questionnaire"], ["ZZT-0002", "questionnaire"], ["ZZT-0004", "final-release"]]) await t.seeTid(`task-${kind}-${code}`, `task: ${kind} for ${code}`);
        t.check("one task per open question of ZZT-0003", (await t.ui.locator('[data-testid^="task-OP-"]').count()) === 2);
        await t.see("INCI: Olea Europaea Fruit Oil", "INCI from the request");
        await t.see("RM-500123", "Beiersdorf material number from the request");
        await t.seeTid("requests-closed", "closed requests stay listed (the request is held at 'keep the CIQ up to date')");
        await t.see("Solvaro Oleochemicals S.A.", "the supplier's name");
        await t.notSee("Demo data", "live view has no demo badge");
        await t.notSee("Notices", "no Notices page any more");
        await t.notSee("Corrections", "no Corrections page any more");
        const admin = await t.calls((c) => /ADMIN/.test(c.command) || c.command === "API");
        t.check("no admin reads", admin.length === 0, admin.map((c) => c.command));
        t.check("never asks for the participated list (it fails platform-wide)", (await t.calls((c) => c.command === "PROCESS_GET_PARTICIPATED_ITEMS")).length === 0);
        const lists = await t.calls((c) => c.command === "PROCESS_GET_MY_TASKS_ITEMS");
        t.check("My tasks is read per supplier step (activity filter; the release is a step of the request since 16 Oct)", ["Activity_15rz7z2", "Activity_1mhx3t7", "Activity_qohzey", "Activity_wlo2cfxnqa"].every((a) => lists.some((c) => c.activityId === a)), lists.map((c) => `${c.flowId}:${c.activityId}`));
        const getItems = await t.calls((c) => c.command === "PROCESS_GET_ITEM");
        t.check("full reads carry the item's own current activity instance", getItems.length > 0 && getItems.every((c) => c.activityInstanceId === TASK_ACT[c.instanceId]), getItems.map((c) => [c.instanceId, c.activityInstanceId]));
        const refused = await t.calls((c) => c.refused);
        t.check("Kissflow refused no command", refused.length === 0, refused.map((c) => `${c.command} ${c.instanceId ?? ""}: ${c.refused}`));
        await t.notSee("could not be read in full", "no partial-read warning");
        t.check("nothing is written by looking", (await writes(t)).length === 0);
        await t.shot("home");
        await t.ui.getByRole("button", { name: "Dark theme" }).click();
        await t.page.waitForTimeout(300);
        t.check("theme switch turns dark", (await htmlTheme(t)) === "dark" && (await bgLightness(t)) < 0.3);
        await t.host({ role: "supplier" }, "/portal/help");
        t.check("the dark choice is remembered", (await htmlTheme(t)) === "dark");
        await t.ui.getByRole("button", { name: "Light theme" }).click();
        await t.see("How do I fill in the CIQ?", "help reads the live articles");
        await t.see("Katrin Vogel", "the Beiersdorf contact per open request");
      },
      { colorScheme: "dark" },
    ),
  "fill-live-scope": () =>
    scenario("fill-live-scope", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0001?s=SF");
      await t.seeTid("q-config-SF01", "the CIQ opens on the metadata questions");
      t.check("before any answer: no origin annex", !(await t.tid("q-nav-A2").first().isVisible().catch(() => false)));
      await config(t, "SF01", ["Vegetable (bio mass)"]);
      await t.seeTid("q-nav-A2", "Vegetable opens Annex 2 live, before anything is saved", 3000);
      await config(t, "SF01", ["Animal", "Vegetable (bio mass)"]); // Animal on, Vegetable off
      await t.page.waitForTimeout(200);
      t.check("switching to Animal closes Annex 2 live", !(await t.tid("q-nav-A2").first().isVisible().catch(() => false)));
      await t.settle(1200);
      const w = await writes(t, (c) => c.instanceId === "PkReq1");
      t.check("saved through the request's task at 'fill in the CIQ'", w.length >= 1 && w.every((c) => c.command === "PROCESS_UPDATE_ITEM" && c.activityInstanceId === TASK_ACT.PkReq1), summary(w));
      t.check("one save carries the metadata, the scope and the requested documents together", w.some((c) => /Config_Answers_JSON/.test(c.keys) && /Scope_JSON/.test(c.keys) && /Requested_Docs_JSON/.test(c.keys) && /Answers_Rev/.test(c.keys)), w.map((c) => c.keys));
      t.check("DateTimes without milliseconds", w.every(noMs));
      const it = await t.item("PkReq1");
      t.check("Config_Answers_JSON holds the last answer", JSON.stringify(J(it.Config_Answers_JSON)?.SF01) === '["animal"]', it.Config_Answers_JSON);
      const scope = J(it.Scope_JSON) ?? [];
      t.check("Scope_JSON: Annex 2 closed again, supplier wording only (no rule ids, no SF codes)", scope.find((s) => s.sectionId === "A2")?.applicability === "na" && !/\bR-\d|SF-\d|firedRules/.test(it.Scope_JSON), it.Scope_JSON.slice(0, 300));
      t.check("Answered_By_JSON names who answered", J(it.Answered_By_JSON)?.SF01?.email === "elena.marquez@solvaro.example");
      t.check("no submit while filling in", (await t.calls((c) => c.command === "PROCESS_SUBMIT_ITEM")).length === 0);
      await t.notSee("Not saved", "no save error");
      // (a new host page would start from the fixtures again: reload the data in the page instead)
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.settle();
      t.check("the answer is still there after a reload", (await t.tid("q-config-SF01").first().getAttribute("data-answered")) === "true");
      t.check("and Annex 2 stays closed", !(await t.tid("q-nav-A2").first().isVisible().catch(() => false)));
      // Thomas, 28 Oct: a rule's basis (where it comes from) is not for end users. The app's Rules page dropped its Basis
      // column; the portal never showed one, on the metadata questions or in any section
      const basisOf = () => t.frame().evaluate(() => {
        const text = document.body.innerText;
        return { column: [...document.querySelectorAll("th")].some((e) => e.innerText.trim() === "Basis"), labels: ["Requirements document", "Agreed with Beiersdorf", "Not in the requirements"].filter((x) => text.includes(x)) };
      });
      const onMetadata = await basisOf();
      t.check("the metadata questions show no rule basis (no Basis column, none of its labels)", !onMetadata.column && onMetadata.labels.length === 0, onMetadata);
      await t.shot("metadata");
      await t.frame().evaluate(() => { location.hash = "/portal/case/ZZT-0001?s=K2.1"; });
      await t.page.waitForTimeout(500);
      const onSection = await basisOf();
      t.check("… nor the composition section K2.1", !onSection.column && onSection.labels.length === 0, onSection);
    }),
  "matrix-v06": () =>
    scenario("matrix-v06", async (t) => {
      // 28 Oct, matrix v0.6, the supplier's side: 9 metadata questions (SF-02 and SF-08 dropped); Annex 2 opening
      // pre-fills FLD-A2-101 with the main INCI, saved with the answer (M9); the feedstock and its content in K2.3 (D3);
      // Annex 1 starts with a locked copy of K2.3's Country of origin (L6) and offers no "Cannot provide" on its chain
      // controllers (D10); a K2.1 row asks Additive Yes/No with no default (L5) and its blockers jump to the row (H1)
      const go = async (route) => {
        await t.frame().evaluate((r) => { location.hash = r; }, route);
        await t.page.waitForTimeout(500);
      };
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0001?s=SF");
      await t.seeTid("q-config-SF01", "the CIQ opens on the metadata questions");
      const qs = await t.ui.locator('[data-testid^="q-config-"][data-required]').evaluateAll((els) => els.map((e) => [e.dataset.testid.slice("q-config-".length), e.dataset.required]));
      t.check("9 metadata questions to answer, 8 of them required (no SF-02, no SF-08; SF-05 optional)", qs.length === 9 && qs.filter(([, r]) => r === "true").length === 8 && !qs.some(([id]) => id === "SF02" || id === "SF08"), qs);
      await config(t, "SF01", ["Vegetable (bio mass)"]);
      await t.seeTid("q-nav-A2", "Vegetable opens Annex 2", 3000);
      await t.settle(1200);
      const it = await t.item("PkReq1");
      t.check("FLD-A2-101 is pre-filled with the main INCI, in the save of the answer", J(it.Answers_JSON)?.["FLD-A2-101"] === "Olea Europaea Fruit Oil" && JSON.stringify(J(it.Config_Answers_JSON)?.SF01) === '["vegetable"]', [it.Answers_JSON, it.Config_Answers_JSON]);
      t.check("… attributed to the contact who saved it", J(it.Answered_By_JSON)?.["FLD-A2-101"]?.email === "elena.marquez@solvaro.example", J(it.Answered_By_JSON)?.["FLD-A2-101"]);
      await go("/portal/case/ZZT-0001?s=A2");
      await t.seeTid("q-field-FLD-A2-101");
      t.check("Annex 2 shows it, editable", (await t.tid("q-field-FLD-A2-101").locator("input").inputValue()) === "Olea Europaea Fruit Oil");
      await go("/portal/case/ZZT-0001?s=K2.3");
      for (const id of ["FLD-A1-102", "FLD-A1-103", "FLD-A1-104"]) await t.seeTid(`q-field-${id}`, `${id} is asked in K2.3`);
      await go("/portal/case/ZZT-0001?s=A1");
      await t.seeTid("q-field-FLD-A1-105", "Annex 1 shows its Country of origin");
      t.check("as its first question", (await t.ui.locator('[data-testid^="q-field-"]').first().getAttribute("data-testid")) === "q-field-FLD-A1-105");
      t.check("locked: filled in from K2.3, never required itself", (await t.tid("q-field-FLD-A1-105").locator('[aria-label="Locked"]').count()) === 1 && (await t.tid("q-field-FLD-A1-105").getAttribute("data-required")) === "false");
      t.check("the feedstock is no longer asked in Annex 1", (await t.tid("q-field-FLD-A1-102").count()) === 0);
      t.check("no 'Cannot provide' on the pesticides and palm questions", (await t.tid("q-justify-FLD-A1-201").count()) === 0 && (await t.tid("q-justify-FLD-A1-204").count()) === 0 && (await t.tid("q-field-FLD-A1-201").count()) === 1);
      await t.shot("annex1");
      await go("/portal/case/ZZT-0001?s=K2.1");
      await t.tid("q-component-add").click();
      await t.settle(1200);
      const row = t.tid("q-component-c1");
      const additive = row.getByTestId("q-component-additive-c1");
      t.check("a new row asks Additive Yes/No, none chosen", (await additive.getByRole("button", { name: "Yes", exact: true }).count()) === 1 && (await additive.getByRole("button", { pressed: true }).count()) === 0);
      t.check("the INCI column reads INCI (European) / IUPAC, the EC column also takes the REACH registration number", (await row.innerText()).includes("INCI (European) / IUPAC") && (await row.innerText()).includes("EC number (EINECS/ELINCS/NLP) or REACH registration no."));
      const saved = (J((await t.item("PkReq1")).Components_JSON) ?? []).find((r) => r.id === "c1");
      t.check("the blank row is saved as typed: no additive, no concentration (null, never false or 0)", saved && saved.additive === null && saved.concMin === null && saved.concMax === null, saved);
      await t.tid("check-completeness").click();
      await t.seeTid("blocker-panel");
      const rowItems = await t.ui.locator('[data-testid="blocker-item"][data-row="c1"]').allInnerTexts();
      t.check("the completeness check names the row's problems one by one", ["INCI (European) / IUPAC is missing", "Function is missing", "Additive: answer Yes or No", "Enter a minimum and a maximum concentration"].every((x) => rowItems.some((l) => l.includes(`Component 1: ${x}`))), rowItems);
      await go("/portal/case/ZZT-0001?s=SF");
      if (!(await t.tid("blocker-panel").count())) await t.tid("check-completeness").click(); // the check stays open across sections
      await t.ui.locator('[data-testid="blocker-item"][data-row="c1"]').first().click();
      await t.page.waitForTimeout(500);
      const hash = await t.frame().evaluate(() => location.hash);
      t.check("a row's blocker opens K2.1 at that row", /[?&]s=K2\.1/.test(hash) && /[?&]row=c1/.test(hash) && !/[?&]f=/.test(hash), hash);
      await t.notSee("Not saved", "no save error");
      await t.shot("k21");
    }),
  completeness: () =>
    scenario("completeness", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0002");
      await t.seeTid("completeness-bar");
      t.check("nothing blocks: 0 blockers", (await t.tid("completeness-bar").first().getAttribute("data-blockers")) === "0");
      await t.tid("confirm-completeness").first().click();
      await t.tid("confirm-agree").getByRole("checkbox").first().check();
      await t.tid("confirm-submit").click();
      await t.see("Completeness confirmed", "success only after the write and the submit", 10000);
      await t.settle();
      const w = await writes(t, (c) => c.instanceId === "PkReq2");
      t.check("confirm = the Completeness_* fields (read back), then the submit of 'fill in the CIQ', both through its task", summary(w).join(" | ") === "UPDATE_ITEM PkReq2 [Completeness_At,Completeness_By_Email,Completeness_By_Name,Completeness_By_Role,Completeness_Confirm,Requested_Docs_JSON,Review_Depts,Scope_JSON] | SUBMIT_ITEM PkReq2" && w.every((c) => c.activityInstanceId === TASK_ACT.PkReq2), summary(w));
      const it = await t.item("PkReq2");
      t.check("recorded with name, e-mail, role and time", it.Completeness_By_Name === "Elena Márquez" && it.Completeness_By_Email === "elena.marquez@solvaro.example" && /:\d\dZ$/.test(it.Completeness_At), [it.Completeness_By_Name, it.Completeness_At]);
      t.check("the request now sits at 'keep the CIQ up to date'", it._current_step === "Supplier: keep the CIQ up to date");
      await t.see("Beiersdorf is reviewing", "the page moves to the review phase");
      await t.notSee("Confirm completeness", "no second confirmation");
      await t.shot("confirmed");
    }),
  "handoffs-dev": () =>
    scenario("handoffs-dev", async (t) => {
      // plan v6 §4.1 (built and switched on 20 Oct): in the Development sandbox each supplier action that Beiersdorf's
      // app must learn of POSTs its hand-off after the action succeeded, with only the item's id + a key. This host page
      // is not on a Kissflow host, so each goes through kf.api as the relative path on the sandbox's account (portal.ts
      // webhooksFor, Thomas 21 Oct). Only routes, accounts and hosts are reported: a hook URL carries its token
      const PATH = /^\/integration\/2\/AcDOSunMEpSA\/webhook\/[A-Za-z0-9_-]{30,}$/;
      const HOOK = /^https:\/\/dev-beiersdorf\.kissflow\.eu\/integration\/2\/AcDOSunMEpSA\/webhook\/[A-Za-z0-9_-]{30,}$/;
      const last = () => t.hooks()[t.hooks().length - 1];
      const bodyOf = (h) => { try { return JSON.parse(h?.body ?? "null"); } catch { return null; } };
      const okPost = (h) => !!h && h.route === "api" && h.account === "AcDOSunMEpSA" && PATH.test(h.url) && /^application\/json/.test(h.type ?? "") && Object.keys(bodyOf(h) ?? {}).length === 2;
      /** The item's submit is in the host's log before the POST arrived. */
      const afterSubmit = async (h, id) => (await t.calls((c) => c.command === "PROCESS_SUBMIT_ITEM" && c.instanceId === id)).some((c) => h && c.seq < h.callsAt);
      // a save → request.changed
      await t.host({ role: "supplier", env: "dev" }, "/portal/case/ZZT-0003");
      await t.seeTid("questions-for-you");
      await answerText(t, "FLD-GEN-004", "Plant 7, Hamburg (fictional)");
      await t.settle(800);
      await t.page.waitForTimeout(500);
      const rc = last();
      t.check("a save posts request.changed with only the request id, through kf.api as the sandbox account's relative path", okPost(rc) && bodyOf(rc)?.portalRequestItemId === "PkReq3" && /^HO-requestChanged-/.test(bodyOf(rc)?.idempotencyKey), [hookWhere(rc), rc?.type, rc?.body]);
      // an answer → I-4
      await t.tid("answer-OP-0003-01").first().click();
      await t.tid("answer-text").fill("Twelve months from the production date.");
      await t.tid("answer-send").click();
      await t.see("Your response was sent to Beiersdorf", "the answer is sent", 10000);
      await t.settle();
      await t.page.waitForTimeout(500);
      const i4 = last();
      t.check("an answer posts query.answered (I-4) with only the query id, after the submit of 'respond'", okPost(i4) && bodyOf(i4)?.portalQueryItemId === "PkQ3a" && /^HO-queryAnswered-/.test(bodyOf(i4)?.idempotencyKey) && i4.url !== rc.url && (await afterSubmit(i4, "PkQ3a")), [hookWhere(i4), i4?.body, i4?.callsAt]);
      await t.page.keyboard.press("Escape");
      // completeness → I-2
      await t.host({ role: "supplier", env: "dev" }, "/portal/case/ZZT-0002");
      await t.seeTid("completeness-bar");
      await t.tid("confirm-completeness").first().click();
      await t.tid("confirm-agree").getByRole("checkbox").first().check();
      await t.tid("confirm-submit").click();
      await t.see("Completeness confirmed", "completeness is confirmed", 10000);
      await t.settle();
      await t.page.waitForTimeout(500);
      const i2 = last();
      t.check("confirming completeness posts completeness.confirmed (I-2) with only the request id, after the submit", okPost(i2) && bodyOf(i2)?.portalRequestItemId === "PkReq2" && /^HO-completenessConfirmed-/.test(bodyOf(i2)?.idempotencyKey) && (await afterSubmit(i2, "PkReq2")), [hookWhere(i2), i2?.body, i2?.callsAt]);
      // the final release → I-7
      await t.host({ role: "supplier", env: "dev" }, "/portal/case/ZZT-0004");
      await t.seeTid("final-release-card");
      await t.tid("final-release").click();
      await t.tid("final-release-agree").getByRole("checkbox").first().check();
      await t.tid("final-release-submit").click();
      await t.see("Final release recorded", "the release is recorded", 10000);
      await t.settle();
      await t.page.waitForTimeout(500);
      const i7 = last();
      t.check("the final release posts release.given (I-7) with only the request id, after the submit of the release step", okPost(i7) && bodyOf(i7)?.portalRequestItemId === "PkReq4" && /^HO-releaseGiven-/.test(bodyOf(i7)?.idempotencyKey) && (await afterSubmit(i7, "PkReq4")), [hookWhere(i7), i7?.body, i7?.callsAt]);
      const kinds = new Set(t.hooks().map((h) => h.url));
      t.check("exactly four POSTs, one to each of four integrations, each with only an id and a key", t.hooks().length === 4 && kinds.size === 4 && t.hooks().every(okPost), t.hooks().map((h) => bodyOf(h)?.idempotencyKey?.split("-")[1]));
      // per kind (from its idempotency key): the path, on the sandbox's host, is exactly the stored URL of THAT kind
      // (compared by sha256: no token is printed), so a wrong token, or two kinds' tokens swapped, fails here
      const kindOf = (h) => bodyOf(h)?.idempotencyKey?.split("-")[1];
      t.check("each hand-off's path, on the sandbox's host, is exactly the stored sandbox URL of its own kind (sha256)", HOOK_KINDS.every((k) => t.hooks().filter((h) => kindOf(h) === k).length === 1) && t.hooks().every((h) => STORED_SHA[kindOf(h)] === sha(`https://${DEV_HOST}${h.url}`)), t.hooks().map((h) => `${kindOf(h)}: ${STORED_SHA[kindOf(h)] === sha(`https://${DEV_HOST}${h.url}`) ? "same" : "differs"}`));
      // inside the sandbox's own page (an emulated parent on its host) the same save POSTs the stored sandbox URL itself
      await t.host({ role: "supplier", env: "dev" }, "/portal/case/ZZT-0003", { parent: DEV_HOST });
      await t.seeTid("questions-for-you");
      await answerText(t, "FLD-GEN-004", "Plant 7, Hamburg (fictional)");
      await t.settle(800);
      await t.page.waitForTimeout(500);
      const own = last();
      t.check("inside the sandbox's page a save POSTs (the browser's, text/plain) exactly the stored sandbox URL of request.changed (sha256): its host + the same path", !!own && own !== rc && own.route === "fetch" && HOOK.test(own.url) && sha(own.url) === STORED_SHA.requestChanged && own.url === `https://${DEV_HOST}${rc?.url}` && /^text\/plain/.test(own.type ?? "") && bodyOf(own)?.portalRequestItemId === "PkReq3", hookWhere(own));
    }),
  "handoffs-prod": () =>
    scenario("handoffs-prod", async (t) => {
      // Thomas, 21 Oct: production differs from the sandbox in its account AND its domain, and the webhook tokens are
      // the same, so the UI builds each hand-off at runtime (portal.ts webhooksFor): the page's own account, on the
      // Kissflow host around the page, else as the relative path through kf.api. The same save in the sandbox and in
      // production (this host page: no Kissflow host), then in production inside an emulated Kissflow page. Only routes,
      // accounts and hosts are reported: a hook URL carries its token
      const bodyOf = (h) => { try { return JSON.parse(h?.body ?? "null"); } catch { return null; } };
      const tokenOf = (h) => (h ? h.url.slice(h.url.lastIndexOf("/webhook/") + "/webhook/".length) : "");
      const save = async (params, value, parent) => {
        await t.host({ role: "supplier", ...params }, "/portal/case/ZZT-0003", { parent });
        await t.seeTid("questions-for-you");
        await answerText(t, "FLD-GEN-004", value);
        await t.settle(800);
        await t.page.waitForTimeout(500);
        return t.hooks()[t.hooks().length - 1];
      };
      const dev = await save({ env: "dev" }, "Plant 7, Hamburg (fictional)");
      const prod = await save({}, "Plant 8, Hamburg (fictional)");
      const inPage = await save({}, "Plant 9, Hamburg (fictional)", PROD_PARENT);
      t.check("in the sandbox a save posts request.changed through kf.api, as the relative path on the sandbox's account", !!dev && dev.route === "api" && dev.account === "AcDOSunMEpSA" && dev.url === `/integration/2/AcDOSunMEpSA/webhook/${tokenOf(dev)}` && tokenOf(dev).length >= 30 && bodyOf(dev)?.portalRequestItemId === "PkReq3", hookWhere(dev));
      t.check("in production the same save posts through kf.api on production's account, with the same token", !!prod && prod !== dev && prod.route === "api" && prod.account === "AcHARNESS" && prod.url === `/integration/2/AcHARNESS/webhook/${tokenOf(dev)}`, hookWhere(prod));
      // the token both send is the stored one of request.changed (compared by sha256: no token is printed)
      t.check("that token is the stored sandbox URL's of request.changed (sha256)", !!dev && sha(`https://${DEV_HOST}${dev.url}`) === STORED_SHA.requestChanged && sha(`https://${DEV_HOST}/integration/2/AcDOSunMEpSA/webhook/${tokenOf(prod)}`) === STORED_SHA.requestChanged, [dev, prod].map(hookWhere));
      t.check("in production inside a Kissflow page the save POSTs (the browser's, text/plain) to that page's host: its account, the same token", !!inPage && inPage.route === "fetch" && inPage.host === PROD_PARENT && inPage.given === PROD_PARENT && inPage.url === `https://${PROD_PARENT}${prod?.url}` && /^text\/plain/.test(inPage.type ?? ""), hookWhere(inPage));
      t.check("production's POSTs carry only the request id and a key", [prod, inPage].every((h) => bodyOf(h)?.portalRequestItemId === "PkReq3" && /^HO-requestChanged-/.test(bodyOf(h)?.idempotencyKey) && Object.keys(bodyOf(h) ?? {}).length === 2), [prod, inPage].map((h) => h?.body));
      t.check("nothing reaches the sandbox's host or account from production", t.hooks().filter((h) => h.env === "prod").every((h) => h.account === "AcHARNESS" && h.host !== DEV_HOST), t.hooks().map(hookWhere));
      t.check("one POST per save", t.hooks().length === 3, t.hooks().map(hookWhere));
    }),
  "harness-local-posts": () =>
    scenario("harness-local-posts", async (t) => {
      // the harness itself (review, 21 Oct): a POST to the two local servers (the UI's own origin, the host page's) is
      // recorded as a hand-off to 127.0.0.1, refused, and taken for one that went astray; the browser context does not
      // route those servers. The probes are the harness's own, sent from each page and then taken out again
      await t.host({ role: "supplier" }, "/portal");
      await t.seeTid("main-nav", "the shell opens");
      const ui = await t.frame().evaluate(() => fetch("/integration/2/AcHARNESS/webhook/harness-probe", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.status, (e) => String(e)));
      const host = await t.page.evaluate(() => fetch("/integration/2/AcHARNESS/webhook/harness-probe", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" }).then((r) => r.status, (e) => String(e)));
      await t.page.waitForTimeout(400);
      const probes = t.hooks().filter((h) => h.host === "127.0.0.1");
      t.check("a POST from the UI to its own origin, and from the host page to its own, are both recorded (route fetch, host 127.0.0.1)", probes.length === 2 && probes.every((h) => h.route === "fetch" && h.method === "POST" && h.account === "AcHARNESS") && new Set(probes.map((h) => new URL(h.url).port)).size === 2, probes.map(hookWhere));
      t.check("the local servers refuse them (405)", ui === 405 && host === 405, { ui, host });
      t.check("both count as gone astray (a host no page is given)", probes.length === 2 && probes.every(astrayHook), probes.map(hookWhere));
      const hs = t.hooks();
      hs.splice(0, hs.length, ...hs.filter((h) => !probes.includes(h)));
      t.check("nothing else was posted", hs.length === 0, hs.map(hookWhere));
      // the browser logs each refused probe as a console error: those two are the probes' own, not the page's
      const es = t.errors(), refused = es.filter((e) => /status of 405 \(Method Not Allowed\)/.test(e));
      t.check("the browser logged both refusals", refused.length === 2, refused);
      es.splice(0, es.length, ...es.filter((e) => !refused.includes(e)));
    }),
  "who-confirms": () =>
    scenario("who-confirms", async (t) => {
      await t.host({ role: "supplier2" }, "/portal/case/ZZT-0002");
      await t.seeTid("completeness-bar");
      t.check("no 'Confirm completeness' for a contact who may not confirm (B-11)", (await t.tid("confirm-completeness").count()) === 0);
      await t.see("Elena Márquez can confirm completeness for your company", "says who can");
      await t.host({ role: "supplier2" }, "/portal/case/ZZT-0004");
      await t.seeTid("final-release-card");
      t.check("no release button for him either", (await t.tid("final-release").count()) === 0);
      await t.see("can give the final release", "says who can release");
      t.check("nothing written", (await writes(t)).length === 0);
      await t.shot("ravi");
    }),
  questions: () =>
    scenario("questions", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0003");
      await t.seeTid("questions-for-you");
      const open = await t.ui.locator('[data-testid^="answer-OP-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
      t.check("two questions wait for an answer", open.length === 2, open);
      await t.see("More information needed", "the returned round reads 'more information needed'");
      await t.see("Closed", "the accepted one is closed");
      // round 1: a plain answer
      await t.tid("answer-OP-0003-01").first().click();
      await t.tid("answer-text").fill("Twelve months from the production date.");
      await t.tid("answer-send").click();
      await t.see("Your response was sent to Beiersdorf", "sent only after the write", 10000);
      await t.settle();
      const q1 = await writes(t, (c) => c.flowId === "CIQP_Query_A00");
      t.check("answer = Response_* + responsible e-mail, then submit, through the query's task", summary(q1).join(" | ") === "UPDATE_ITEM PkQ3a [Response_Kind,Response_Text,Supplier_Responsible_Email] | SUBMIT_ITEM PkQ3a", summary(q1));
      await t.page.keyboard.press("Escape");
      await t.page.waitForTimeout(300);
      const n0 = (await t.calls(() => true)).length;
      // the returned round: answer with a document stored at the question's item
      await t.tid("answer-OP-0003-02").first().click();
      await t.tid("answer-mode-upload").click();
      await t.tid("answer-file").locator('input[type="file"]').setInputFiles(pdf("plant-address.pdf"));
      await t.tid("answer-send").click();
      await t.see("Your response was sent to Beiersdorf", "sent after the upload and the answer", 12000);
      await t.settle();
      const w = (await writes(t)).filter((c) => c.seq >= n0);
      t.check("upload → Supplier_Files → Uploads row → the file list (Documents_JSON, plan v6 §4.2) → the answer with its reference → submit (no Answers_Rev signal)", summary(w).join(" | ") === "FILE_UPLOAD | UPDATE_ITEM PkReq3 [Supplier_Files] | INIT_FORM PkReq3 | ADD_TABLE_ROW PkReq3 | UPDATE_ITEM PkReq3 [Documents_JSON] | UPDATE_ITEM PkQ3b [Response_Doc_Refs_JSON,Response_Kind,Response_Text,Supplier_Responsible_Email] | SUBMIT_ITEM PkQ3b", summary(w));
      const q = await t.item("PkQ3b");
      const ref = J(q.Response_Doc_Refs_JSON)?.[0] ?? {};
      const rq = await t.item("PkReq3");
      t.check("a Document answer that references the Upload_Id and the Attach- id", q.Response_Kind === "Document" && /^UP-/.test(ref.uploadId) && /^Attach-/.test(ref.attachmentId), q.Response_Doc_Refs_JSON);
      t.check("the file is added next to the others in Supplier_Files", rq.Supplier_Files.some((f) => f.id === ref.attachmentId) && rq.Supplier_Files.length > 7, rq.Supplier_Files.length);
      t.check("its Uploads row points at the file and the question's place", (rq["Table::CIQP_Request_A00_Uploads"] ?? []).some((r) => r.Upload_Id === ref.uploadId && r.Upload_Attachment_Id === ref.attachmentId && r.Upload_Section_Key === "GEN"));
      t.check("Kissflow refused no command", (await t.calls((c) => c.refused)).length === 0, (await t.calls((c) => c.refused)).map((c) => `${c.command}: ${c.refused}`));
      await t.page.keyboard.press("Escape");
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.settle();
      t.check("both answered questions now read 'With Beiersdorf'", (await t.ui.locator('[data-testid^="question-OP-"][data-status="in-progress"]').count()) === 2);
      await t.shot("answered");
    }),
  "final-release": () =>
    scenario("final-release", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0004");
      await t.seeTid("final-release-card");
      t.check("nothing blocks the release (B-33)", (await t.tid("final-release-card").first().getAttribute("data-blocked")) === "false");
      // Thomas, 15 Oct: the service locked the request at the release request; the questionnaire is read-only
      t.check("the request item is locked by the service (Request_Locked Yes)", (await t.item("PkReq4")).Request_Locked === "Yes");
      t.check("the questionnaire heading says it is locked, with the plain note", (await t.tid("questionnaire-heading").first().getAttribute("data-locked")) === "true" && (await t.tid("questionnaire-heading").first().innerText()).includes(RELEASE_LOCKED));
      t.check("the questionnaire is read-only: no editable field, no enabled upload", (await editable(t)) === 0, await editable(t));
      await t.tid("q-nav-K1").first().click();
      await t.see("Locked: Beiersdorf has requested your final release", "the section says why it is locked");
      await t.tid("final-release").click();
      await t.tid("final-release-agree").getByRole("checkbox").first().check();
      await t.tid("final-release-submit").click();
      await t.see("Final release recorded", "success only after the writes", 10000);
      await t.settle();
      const w = await writes(t);
      t.check("release = Release_By_Name, _By_Email, _By_Role + Release_At on the request (read back), then the submit of its release step", summary(w).join(" | ") === "UPDATE_ITEM PkReq4 [Release_At,Release_By_Email,Release_By_Name,Release_By_Role] | SUBMIT_ITEM PkReq4" && w.every((c) => c.activityInstanceId === TASK_ACT.PkReq4), summary(w));
      t.check("Release_At without milliseconds", w.every(noMs));
      const done = await t.item("PkReq4");
      t.check("the request is held at 'view the released CIQ' (Release_Flag 'Requested', not 'Reopened': the go-to step is skipped)", done._current_step === "Supplier: view the released CIQ" && done.Release_By_Name === "Elena Márquez", [done._current_step, done.Release_By_Name]);
      t.check("who released is recorded with e-mail and role (REQ-PROC-042)", done.Release_By_Email === "elena.marquez@solvaro.example" && done.Release_By_Role === "Supplier contact", [done.Release_By_Email, done.Release_By_Role]);
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.settle();
      await t.see("Your released questionnaire", "after a reload the released request is still listed (held step, plan v6 D-11)");
      await t.see("Your released questionnaire", "the request reads as released while Beiersdorf files it");
      await t.shot("released");
    }),
  "completed-report": () =>
    scenario("completed-report", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0005");
      await t.seeTid("release-record", "the released request shows its confirmations");
      await t.see("Your released questionnaire");
      await t.seeTid("change-reports", "the earlier report and its receipt");
      t.check("read-only: no upload and no confirm", (await t.ui.locator('[data-testid^="q-upload-"] input[type="file"]:not([disabled])').count()) === 0 && (await t.tid("confirm-completeness").count()) === 0);
      await t.tid("report-change").click();
      await t.tid("report-change-what").fill("The antioxidant changes to rosemary extract from batch 2611 on.");
      await t.tid("report-change-why").fill("A new antioxidant supplier from November 2026.");
      await t.tid("report-change-send").click();
      await t.see("Beiersdorf has been told", "success only after the write", 10000);
      await t.settle();
      const w = await writes(t);
      t.check("report = Change_Report_Text, _Rev + 1, _By_Email and _At together, on the request's task", summary(w).join(" | ") === "UPDATE_ITEM PkReq5 [Change_Report_At,Change_Report_By_Email,Change_Report_Rev,Change_Report_Text]", summary(w));
      const it = await t.item("PkReq5");
      t.check("the rev counts up from the last receipt", it.Change_Report_Rev === 2 && it.Change_Report_By_Email === "elena.marquez@solvaro.example" && /:\d\dZ$/.test(it.Change_Report_At), [it.Change_Report_Rev, it.Change_Report_At]);
      await t.seeTid("report-change-pending", "'Sending your report…' until its receipt arrives");
      t.check("no second 'Report a change' meanwhile", (await t.tid("report-change").count()) === 0);
      // the sync service writes the receipt: the button comes back
      await t.set("PkReq5", { Change_Reports_JSON: JSON.stringify([...J(it.Change_Reports_JSON), { id: "CR-0002", at: it.Change_Report_At, text: it.Change_Report_Text }]) });
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.seeTid("report-change", "'Report a change' is offered again after the receipt");
      await t.shot("reported");
    }),
  cancelled: () =>
    scenario("cancelled", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0006");
      await t.see("Beiersdorf has withdrawn this request", "a neutral banner");
      t.check("read-only: no confirm, no report, no upload", (await t.tid("confirm-completeness").count()) === 0 && (await t.tid("report-change").count()) === 0 && (await t.ui.locator('[data-testid^="q-upload-"] input[type="file"]:not([disabled])').count()) === 0);
      await t.host({ role: "supplier" }, "/portal");
      await t.seeTid("portal-request-ZZT-0006");
      t.check("no task for the cancelled request", (await t.ui.locator('[data-testid$="-ZZT-0006"][data-testid^="task-"]').count()) === 0);
      t.check("nothing written", (await writes(t)).length === 0);
    }),
  "two-contacts": () =>
    scenario("two-contacts", async (t) => {
      await t.host({ role: "supplier", race: "1" }, "/portal/case/ZZT-0002?s=GEN");
      await t.seeTid("q-field-FLD-GEN-004");
      await answerText(t, "FLD-GEN-004", "Solvaro Oleochemicals S.A., 43006 Tarragona (Elena)");
      await t.settle(1500);
      const w = await writes(t, (c) => c.instanceId === "PkReq2" && c.command === "PROCESS_UPDATE_ITEM");
      t.check("the lost save is noticed on read-back and re-applied: 2 writes", w.length === 2, summary(w));
      const it = await t.item("PkReq2");
      const ans = J(it.Answers_JSON);
      t.check("both answers are kept: Elena's and Ravi's (merge per key, never a blind overwrite)", ans["FLD-GEN-004"] === "Solvaro Oleochemicals S.A., 43006 Tarragona (Elena)" && ans["FLD-GEN-005"] === "Plant 2, Tarragona (Ravi)", { "004": ans["FLD-GEN-004"], "005": ans["FLD-GEN-005"] });
      const by = J(it.Answered_By_JSON);
      t.check("and both stamps", by["FLD-GEN-004"]?.name === "Elena Márquez" && by["FLD-GEN-005"]?.name === "Ravi Menon");
      await t.notSee("Not saved", "no error for the contact");
    }),
  "locked-refusal": () =>
    scenario("locked-refusal", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0003?s=GEN");
      await t.seeTid("q-field-FLD-GEN-004");
      // meanwhile the case was completed (the sync service locks the request)
      await t.set("PkReq3", { Request_Locked: "Yes", Case_Phase_Label: "Completed", Release_By_Name: "Elena Márquez", Release_At: "2026-10-15T10:00:00Z" });
      await answerText(t, "FLD-GEN-004", "A change after the lock");
      await t.settle(1500);
      await t.see("Not saved: This request is closed", "the write is refused with a clear message");
      t.check("no write reached the locked request", (await writes(t, (c) => c.instanceId === "PkReq3")).length === 0, summary(await writes(t)));
      await t.see("Your released questionnaire", "and the page shows it released and read-only");
      await t.shot("refused");
    }),
  "release-lock-refusal": () =>
    scenario("release-lock-refusal", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0003?s=GEN");
      await t.seeTid("q-field-FLD-GEN-004");
      // meanwhile every review completed: the sync service locks the request for the final release (Thomas, 15 Oct)
      await t.set("PkReq3", { Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release" });
      await answerText(t, "FLD-GEN-004", "A change after the release request");
      await t.settle(1500);
      await t.see("Not saved: Your questionnaire is locked because Beiersdorf has requested your final release", "the write is refused with the plain lock message");
      t.check("no write reached the locked request", (await writes(t, (c) => c.instanceId === "PkReq3")).length === 0, summary(await writes(t)));
      t.check("the page now shows the final release, read-only", (await t.tid("supplier-request").first().getAttribute("data-phase")) === "final-release" && (await t.tid("questionnaire-heading").first().getAttribute("data-locked")) === "true" && (await editable(t)) === 0);
      await t.shot("release-locked");
    }),
  "reopen-unlocks": () =>
    scenario("reopen-unlocks", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0004?s=GEN");
      await t.seeTid("final-release-card");
      t.check("locked while the release is requested", (await editable(t)) === 0);
      // a reviewer reopens: Beiersdorf's side (I-6) sets Release_Flag "Reopened" and lifts the lock; the request is still
      // at its release step, so the screen submits it while loading (Thomas, 21 Oct) and the go-to step returns it to
      // "keep the CIQ up to date"
      await t.set("PkReq4", { Request_Locked: "No", Case_Phase_Label: "With Beiersdorf", Release_Flag: "Reopened" });
      const n0 = (await t.calls(() => true)).length;
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.settle();
      const moved = (await writes(t)).filter((c) => c.seq >= n0);
      t.check("the screen submits the release step once, without writing the release fields", summary(moved).join(" | ") === "SUBMIT_ITEM PkReq4" && moved[0].activityInstanceId === TASK_ACT.PkReq4, summary(moved));
      const back = await t.item("PkReq4");
      t.check("the go-to returned the request to 'keep the CIQ up to date', unreleased", back._current_step === "Supplier: keep the CIQ up to date" && !back.Release_By_Name && !back.Release_At, [back._current_step, back.Release_By_Name]);
      t.check("back to review: no release card, the questionnaire editable again", (await t.tid("supplier-request").first().getAttribute("data-phase")) === "review" && (await t.tid("final-release-card").count()) === 0 && (await t.tid("questionnaire-heading").first().getAttribute("data-locked")) === "false" && (await editable(t)) > 0);
      await answerText(t, "FLD-GEN-005", "Plant 3, Polígono Industrial Sud, Tarragona");
      await t.settle(1500);
      const w = await writes(t, (c) => c.instanceId === "PkReq4" && c.command === "PROCESS_UPDATE_ITEM");
      t.check("the change is saved on the request again", w.length >= 1 && J((await t.item("PkReq4")).Answers_JSON)["FLD-GEN-005"] === "Plant 3, Polígono Industrial Sud, Tarragona", summary(w));
      await t.notSee("Not saved", "no save error");
    }),
  "release-requested": () =>
    scenario("release-requested", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0003");
      await t.seeTid("questions-for-you");
      // Beiersdorf requests the final release (I-5: Release_Flag "Requested", the lock, the label, Release_Contacts) while
      // the request is at "keep the CIQ up to date"; the screen submits "keep" while loading (Thomas, 21 Oct)
      const it = await t.item("PkReq3");
      await t.set("PkReq3", { Release_Flag: "Requested", Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release", Release_Contacts: it.Assigned_Contacts });
      const n0 = (await t.calls(() => true)).length;
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.settle();
      const moved = (await writes(t)).filter((c) => c.seq >= n0);
      t.check("the screen submits 'keep' once, through its task, with no field written", summary(moved).join(" | ") === "SUBMIT_ITEM PkReq3" && moved[0].activityInstanceId === TASK_ACT.PkReq3, summary(moved));
      t.check("the request is at 'give the final release'", (await t.item("PkReq3"))._current_step === "Supplier: give the final release");
      await t.seeTid("final-release-card", "the page offers the final release");
      t.check("the questionnaire is read-only", (await editable(t)) === 0, await editable(t));
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.settle();
      t.check("another reload moves nothing more", (await writes(t)).filter((c) => c.seq >= n0).length === 1, summary((await writes(t)).filter((c) => c.seq >= n0)));
      t.check("Kissflow refused no command", (await t.calls((c) => c.refused)).length === 0, (await t.calls((c) => c.refused)).map((c) => `${c.command}: ${c.refused}`));
      await t.notSee("could not be moved on", "no move warning");
      await t.shot("moved");
      // Beiersdorf reopens while the page stays open (I-6): the next reload on the same page submits the release step
      // without the release fields, and the go-to returns the request to editing (a new visit of a step moves again)
      await t.set("PkReq3", { Request_Locked: "No", Case_Phase_Label: "With Beiersdorf", Release_Flag: "Reopened" });
      const n1 = (await t.calls(() => true)).length;
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.settle();
      const back = (await writes(t)).filter((c) => c.seq >= n1);
      t.check("after a reopen on the same page the reload submits the release step once, through its own task", summary(back).join(" | ") === "SUBMIT_ITEM PkReq3" && /^ActMv/.test(back[0]?.activityInstanceId ?? ""), summary(back));
      const reopened = await t.item("PkReq3");
      t.check("the request is back at 'keep the CIQ up to date', unreleased", reopened._current_step === "Supplier: keep the CIQ up to date" && !reopened.Release_By_Name && !reopened.Release_At, [reopened._current_step, reopened.Release_By_Name]);
      t.check("back to review: no release card, the questionnaire unlocked", (await t.tid("supplier-request").first().getAttribute("data-phase")) === "review" && (await t.tid("final-release-card").count()) === 0 && (await t.tid("questionnaire-heading").first().getAttribute("data-locked")) === "false");
      await t.notSee("could not be returned", "no move warning after the reopen");
    }),
  "upload-preview": () =>
    scenario("upload-preview", async (t) => {
      // a slow connection: the upload takes a moment, so the person must see that it is running (Thomas, 16 Oct)
      await t.host({ role: "supplier", lag: "500" }, "/portal/case/ZZT-0003?s=K1");
      await t.seeTid("q-upload-FLD-K1-001");
      await t.tid("q-upload-FLD-K1-001").locator('input[type="file"]').setInputFiles(pdf("sds-2026.pdf"));
      await t.seeTid("file-uploading", "the upload box shows 'Uploading sds-2026.pdf…' with a spinner", 3000);
      t.check("the box names the file", (await t.tid("file-uploading").first().innerText()).includes("sds-2026.pdf"));
      await t.seeTid("section-uploading-K1", "the section header says a file is uploading", 3000);
      await t.see("sds-2026.pdf uploaded.", "success only after the writes", 20000);
      await t.settle();
      t.check("the spinner is gone after the upload", (await t.tid("file-uploading").count()) === 0 && (await t.tid("section-uploading-K1").count()) === 0);
      const preview = t.ui.locator('[data-testid^="doc-preview-UP-"]').first();
      await preview.waitFor({ timeout: 8000 }).catch(() => {});
      t.check("the uploaded file offers 'Preview'", await preview.isVisible().catch(() => false));
      await preview.click();
      await t.page.waitForTimeout(1200);
      const shown = await t.previews();
      const it = await t.item("PkReq3");
      const stored = (it.Supplier_Files || []).find((f) => f.name === "sds-2026.pdf");
      t.check("Preview opens Kissflow's own file preview with the stored file", shown.length === 1 && !!stored && shown[0].files?.[0]?.id === stored.id, shown);
      // 27 Oct: the app opens the supplier's files from Documents_JSON (copied onto the case): the new upload's entry
      // carries the upload answer's preview metadata as "file"; its other fields as before
      const entry = (J(it.Documents_JSON) ?? []).find((e) => e.attachmentId === stored?.id);
      const want = stored && { id: stored.id, key: stored.key, name: stored.name, size: stored.size, fileExtension: stored.fileExtension };
      t.check("the new upload's Documents_JSON entry carries file (id, key, name, size, fileExtension of the upload answer)", !!entry && !!stored?.key && JSON.stringify(entry.file) === JSON.stringify(want), entry);
      t.check("… with its other fields as before", !!entry && Object.keys(entry).join() === "uploadId,attachmentId,fileName,docKind,sectionKey,fieldKey,uploadedByEmail,uploadedAt,file" && entry.fileName === "sds-2026.pdf" && entry.fieldKey === "FLD-K1-001", entry && Object.keys(entry));
      await t.notSee("Not saved", "no save error");
      await t.shot("uploaded");
    }),
  "k21-typing": () =>
    scenario("k21-typing", async (t) => {
      // Thomas, 16 Oct: type the INCI name, then the CAS number at once; the CAS number must not disappear while the
      // first value is still being saved (a slow connection makes the save take a while)
      await t.host({ role: "supplier", lag: "300" }, "/portal/case/ZZT-0002?s=K2.1");
      await t.seeTid("q-component-add");
      await t.tid("q-component-add").click();
      const row = t.ui.locator('[data-testid^="q-component-c"]').last();
      const rowId = (await row.getAttribute("data-testid")).replace("q-component-", "");
      await row.locator('input[placeholder="e.g. Tocopherol"]').fill("Tocopheryl Acetate");
      const cas = row.locator('input[placeholder="59-02-9"]');
      await cas.click(); // leaving the INCI box commits the row: its save starts now
      await cas.pressSequentially("7695-91-2", { delay: 90 });
      await t.page.waitForTimeout(3500); // the INCI save (with its read-backs) finishes while the CAS box still has focus
      t.check("the CAS number typed during the save is still in the box", (await cas.inputValue()) === "7695-91-2", await cas.inputValue());
      t.check("and the INCI name too", (await row.locator('input[placeholder="e.g. Tocopherol"]').inputValue()) === "Tocopheryl Acetate");
      await cas.blur();
      await t.settle(1500);
      // matrix v0.6 L5: Additive is an explicit Yes/No with no default; a blank concentration is saved as empty, never 0
      const additive = row.locator(`[data-testid="q-component-additive-${rowId}"]`);
      t.check("the new row's Additive is unanswered (no default)", (await additive.getByRole("button", { pressed: true }).count()) === 0);
      const before = (J((await t.item("PkReq2")).Components_JSON) ?? []).find((r) => r.id === rowId);
      t.check("saved so far without an additive answer and without a concentration (null, not false or 0)", before?.additive === null && before?.concMin === null && before?.concMax === null, before);
      await additive.getByRole("button", { name: "No", exact: true }).click();
      await t.settle(1500);
      const rows = J((await t.item("PkReq2")).Components_JSON) ?? [];
      const saved = rows.find((r) => r.id === rowId);
      t.check("both values are saved on the request", saved?.inci === "Tocopheryl Acetate" && saved?.cas === "7695-91-2", saved);
      t.check("and the Additive answer No", saved?.additive === false, saved);
      const w = await writes(t, (c) => c.instanceId === "PkReq2" && c.command === "PROCESS_UPDATE_ITEM");
      t.check("each save is one write (no re-applied write lost to a reload)", w.length >= 2 && w.every((c) => /Components_JSON/.test(c.keys)), summary(w));
      const lists = await t.calls((c) => c.command === "PROCESS_GET_MY_TASKS_ITEMS");
      t.check("autosaves don't read every task list again (only the first load did: one list per supplier step)", lists.length === 5, lists.length);
      await t.notSee("Not saved", "no save error");
    }),
  "remove-upload": () =>
    scenario("remove-upload", async (t) => {
      // plan v6 D-12: the contact removes their own upload; the Uploads row stays, marked removed
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0003?s=K1");
      await t.seeTid("q-upload-FLD-K1-001");
      await t.tid("q-upload-FLD-K1-001").locator('input[type="file"]').setInputFiles(pdf("wrong-file.pdf"));
      await t.see("wrong-file.pdf uploaded.", "uploaded first", 15000);
      await t.settle();
      const remove = t.ui.locator('[data-testid^="doc-remove-UP-"]').first();
      await remove.waitFor({ timeout: 8000 }).catch(() => {});
      t.check("the contact's own upload offers 'Remove'", await remove.isVisible().catch(() => false));
      await remove.click();
      await t.ui.locator('[data-testid^="doc-remove-yes-UP-"]').first().click();
      await t.see("File removed from the questionnaire.", "success only after Kissflow kept it", 10000);
      await t.settle();
      const rows = (await t.item("PkReq3"))["Table::CIQP_Request_A00_Uploads"] || [];
      const row = rows.find((r) => r.Upload_File_Name === "wrong-file.pdf");
      t.check("the Uploads row stays, marked removed by the contact", !!row && /:\d\dZ$/.test(row.Upload_Removed_At || "") && row.Upload_Removed_By_Email === "elena.marquez@solvaro.example", row);
      t.check("the file is no longer listed", (await t.ui.locator('li[data-testid^="doc-"]', { hasText: "wrong-file.pdf" }).count()) === 0);
      const strays = await t.frame().evaluate(() => [...document.querySelectorAll('li[data-testid^="doc-"]')].filter((li) => li.querySelector('[data-testid^="doc-remove-"]') && !li.textContent.includes("(you)")).length);
      t.check("'Remove' only on the contact's own uploads, never on a colleague's", strays === 0, strays);
      await t.notSee("Not saved", "no error");
    }),
  "answer-attachment": () =>
    scenario("answer-attachment", async (t) => {
      // 27 Oct (Thomas): an answer's attachment can be previewed right after its upload, before the answer is sent
      // (Kissflow's preview from the upload answer); before sending it can still be taken off the answer; once sent it
      // can't be removed, whatever the question's state since, and neither can a file sent with an earlier round
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0003?s=K1");
      // 1. a file sent with an earlier round (OP-0003-02's first answer; Beiersdorf's history names it) is never removable
      const D2 = "CIQ-2026-0003-d2", D3 = "CIQ-2026-0003-d3"; // Elena's own uploads at K1
      await t.seeTid(`doc-${D2}`);
      t.check("before: the contact's own upload offers 'Remove'", (await t.tid(`doc-remove-${D2}`).count()) === 1);
      const hist = J((await t.item("PkReq3")).Questions_History_JSON);
      const round1 = hist.find((h) => h.opId === "OP-0003-02")?.thread.find((m) => m.side === "supplier");
      t.check("OP-0003-02 has a first-round answer in the history", !!round1);
      if (round1) round1.document = "FLD-K1-002_statement.pdf";
      await t.set("PkReq3", { Questions_History_JSON: JSON.stringify(hist) });
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.settle();
      await t.seeTid(`doc-${D2}`, "the earlier round's file is still listed");
      t.check("… without 'Remove' once the history shows it was sent with that answer", (await t.tid(`doc-remove-${D2}`).count()) === 0);
      t.check("… the contact's other upload keeps 'Remove'", (await t.tid(`doc-remove-${D3}`).count()) === 1);
      await t.shot("earlier-round");

      // 2. the answer to the returned round, with a file previewed before it is sent
      await t.frame().evaluate(() => { location.hash = "#/portal/case/ZZT-0003"; });
      await t.seeTid("questions-for-you");
      await t.tid("answer-OP-0003-02").first().click();
      await t.tid("answer-mode-upload").click();
      const n0 = (await t.calls(() => true)).length;
      await t.tid("answer-file").locator('input[type="file"]').setInputFiles(pdf("first-try.pdf"));
      await t.seeTid("answer-file-preview", "right after the upload the picked file offers 'Preview'", 10000);
      const early = (await writes(t)).filter((c) => c.seq >= n0);
      t.check("the upload alone: the file is stored, nothing written to the questionnaire or the question", summary(early).join(" | ") === "FILE_UPLOAD", summary(early));
      await t.tid("answer-file-remove").click();
      t.check("before sending, 'Remove' takes the file off the answer", (await t.tid("answer-file-picked").count()) === 0);
      await t.tid("answer-file").locator('input[type="file"]').setInputFiles(pdf("plant-letter.pdf"));
      await t.seeTid("answer-file-preview", "a second file: 'Preview' again", 10000);
      await t.shot("before-send");
      await t.tid("answer-file-preview").click();
      await t.page.waitForTimeout(600);
      const shown = await t.previews();
      const f = shown[0]?.files?.[0] ?? {};
      t.check("Preview opens Kissflow's file preview with the upload answer (id, key, name, size, fileExtension)", shown.length === 1 && shown[0].files.length === 1 && /^Attach-/.test(f.id) && String(f.key).endsWith("/plant-letter.pdf") && f.name === "plant-letter.pdf" && typeof f.size === "number" && f.fileExtension === "pdf", shown);
      t.check("… before anything is written for the answer", (await writes(t)).filter((c) => c.seq >= n0 && c.command !== "FILE_UPLOAD").length === 0, summary((await writes(t)).filter((c) => c.seq >= n0)));
      await t.tid("answer-send").click();
      await t.see("Your response was sent to Beiersdorf", "sent after the preview", 15000);
      await t.settle();
      const previewCall = await t.calls((c) => c.command === "FILEPREVIEW_OPEN" && c.seq >= n0);
      const submit = await t.calls((c) => c.command === "PROCESS_SUBMIT_ITEM" && c.instanceId === "PkQ3b");
      t.check("the preview command went before the answer's submit", previewCall.length === 1 && submit.length === 1 && previewCall[0].seq < submit[0].seq, [previewCall.map((c) => c.seq), submit.map((c) => c.seq)]);
      const uploads = await t.calls((c) => c.command === "FILE_UPLOAD" && c.seq >= n0);
      t.check("Send did not upload again: one upload per picked file", uploads.length === 2, uploads.length);
      const ref = J((await t.item("PkQ3b")).Response_Doc_Refs_JSON)?.[0] ?? {};
      t.check("the answer references the previewed file", !!f.id && ref.attachmentId === f.id && /^UP-/.test(ref.uploadId), ref);
      const rq = await t.item("PkReq3");
      const rows = rq["Table::CIQP_Request_A00_Uploads"] ?? [];
      t.check("only the sent file is on the questionnaire; the file taken off never was", rows.some((r) => r.Upload_Id === ref.uploadId && r.Upload_File_Name === "plant-letter.pdf") && !rows.some((r) => r.Upload_File_Name === "first-try.pdf") && !(rq.Supplier_Files ?? []).some((x) => x.name === "first-try.pdf"), rows.map((r) => r.Upload_File_Name));
      t.check("Kissflow refused no command", (await t.calls((c) => c.refused)).length === 0, (await t.calls((c) => c.refused)).map((c) => `${c.command}: ${c.refused}`));

      // 3. after sending (the question is with Beiersdorf): the file is listed at the question's item, without 'Remove'
      await t.page.keyboard.press("Escape");
      await t.page.waitForTimeout(300);
      await t.seeTid("view-OP-0003-02", "the answered question reads 'View'");
      await t.tid("view-OP-0003-02").first().click();
      await t.seeTid("answer-stored-documents", "the drawer lists the documents at the question's item");
      await t.seeTid(`doc-${ref.uploadId}`, "… with the sent file");
      t.check("… which offers 'Preview'", (await t.tid(`doc-preview-${ref.uploadId}`).count()) === 1);
      t.check("… but no 'Remove' (sent with the answer)", (await t.tid(`doc-remove-${ref.uploadId}`).count()) === 0);
      await t.shot("sent");
      // 4. Beiersdorf accepts the answer and the history comes back: still no 'Remove'
      const h2 = J((await t.item("PkReq3")).Questions_History_JSON);
      const p2 = h2.find((h) => h.opId === "OP-0003-02");
      p2.thread.push({ at: new Date().toISOString(), side: "supplier", by: "Elena Márquez", action: "answered", text: "Document uploaded: plant-letter.pdf", document: "plant-letter.pdf" });
      p2.thread.push({ at: new Date(Date.now() + 1000).toISOString(), side: "internal", by: "Katrin Vogel", action: "accepted", text: "" });
      Object.assign(p2, { status: "Accepted", statusCode: "accepted" });
      await t.set("PkReq3", { Questions_History_JSON: JSON.stringify(h2) });
      await t.page.keyboard.press("Escape");
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.settle();
      await t.frame().evaluate(() => { location.hash = "#/portal/case/ZZT-0003"; });
      await t.seeTid("view-OP-0003-02");
      t.check("the question now reads closed", (await t.tid("question-OP-0003-02").first().getAttribute("data-status")) === "closed");
      await t.tid("view-OP-0003-02").first().click();
      await t.seeTid(`doc-${ref.uploadId}`, "closed (accepted): the sent file is still listed");
      t.check("… still without 'Remove'", (await t.tid(`doc-remove-${ref.uploadId}`).count()) === 0);
      // the portal's mails (only when the build carries the mail token, vite.portal.config.ts): the shared layout
      const sent = t.mails().map((h) => { try { return typeof h.body === "string" ? JSON.parse(h.body) : h.body; } catch { return null; } }).filter(Boolean);
      t.check("every mail the portal posted is {To, Subject, Body} in the shared e-mail layout, without a button (none without a mail token)", sent.every((m) => Object.keys(m).sort().join() === "Body,Subject,To" && String(m.Body).startsWith("<!DOCTYPE html>") && m.Body.includes(">CIQ Digital</p>") && m.Body.includes(">Sent automatically by CIQ Digital. Please do not reply to this e-mail.</p>") && !m.Body.includes("<a ")), sent.map((m) => m.Subject));
      t.check("… the answer's mail among them when mails go out, naming the attachment", !sent.length || sent.some((m) => m.Subject === "ZZT-0003: the supplier answered your question" && m.Body.includes(">plant-letter.pdf</td>")), sent.map((m) => m.Subject));
      await t.notSee("Not saved", "no save error");
    }),
  presence: () =>
    scenario("presence", async (t) => {
      await t.host({ role: "supplier" }, "/portal/case/ZZT-0002");
      await t.seeTid("completeness-bar");
      t.check("no hint while nobody else is working on it", (await t.tid("presence-hint").count()) === 0);
      await t.set("PkReq2", { Editing_By: "ravi.menon@solvaro.example", Editing_Since: new Date(Date.now() - 120000).toISOString().replace(/\.\d{3}Z$/, "Z") });
      await t.ui.getByRole("button", { name: "Reload" }).click();
      await t.seeTid("presence-hint", "a colleague who saved minutes ago is named (B-12)");
      await t.see("Ravi Menon also worked on this questionnaire");
    }),
  diagnostics: () =>
    scenario("diagnostics", async (t) => {
      await t.host({ role: "admin" }, "/admin/diagnostics");
      await t.seeTid("s1-tests", "the S-1 write tests are offered to the builder");
      await t.see("Supplier task lists");
      for (const n of [1, 2, 3]) {
        await t.tid(`s1-run-${n}`).click();
        await t.ui.locator(`[data-testid="s1-result-${n}"][data-state="pass"], [data-testid="s1-result-${n}"][data-state="fail"]`).first().waitFor({ timeout: 10000 }).catch(() => {});
        t.check(`test ${n} PASS`, (await t.tid(`s1-result-${n}`).getAttribute("data-state")) === "pass", await t.tid(`s1-result-${n}`).textContent().catch(() => ""));
      }
      for (const n of [4, 5]) {
        await t.tid(`s1-run-${n}`).click();
        await t.tid("s1-confirm").click();
        await t.ui.locator(`[data-testid="s1-result-${n}"][data-state="pass"], [data-testid="s1-result-${n}"][data-state="fail"]`).first().waitFor({ timeout: 10000 }).catch(() => {});
        t.check(`test ${n} PASS (after asking)`, (await t.tid(`s1-result-${n}`).getAttribute("data-state")) === "pass", await t.tid(`s1-result-${n}`).textContent().catch(() => ""));
      }
      const touched = await writes(t);
      const codes = await Promise.all([...new Set(touched.map((c) => c.instanceId).filter(Boolean))].map(async (id) => (await t.item(id))?.Case_Code));
      t.check("only ZZT- test items were written", codes.length > 0 && codes.every((c) => c.startsWith("ZZT-")), codes);
      t.check("the non-test item DEMO-0099 was never touched", touched.every((c) => c.instanceId !== "PkNotTest"));
      t.check("test 4 moved its request to 'keep the CIQ up to date'", (await t.item("PkS1Fill"))._current_step === "Supplier: keep the CIQ up to date");
      t.check("test 5 completed its query", (await t.item("PkS1Q"))._status === "Completed");
      await t.shot("s1");
    }),
  admin: () =>
    scenario("admin", async (t) => {
      await t.host({ role: "admin" }, "/");
      await t.see("Overview");
      t.check("admin lands on /admin", (await t.frame().evaluate(() => location.hash)) === "#/admin");
      await t.see("Requests");
      t.check("the flows plan v5 no longer uses are hidden from the admin view (16 Oct)", (await t.ui.getByText("(not used)").count()) === 0);
      await t.host({ role: "admin" }, "/admin/flow/request");
      await t.see("ZZT-0001-REQ");
      await t.see("Supplier: fill in the CIQ", "current step filled from the item's own admin read (not in the admin list)");
      await t.ui.getByText("ZZT-0002-REQ").first().click();
      await t.see("Trade_Name", "drawer shows the item's fields");
      await t.ui.getByRole("button", { name: "Edit fields" }).click();
      await t.ui.locator('input[value="SOLVASOFT 300"]').fill("SOLVASOFT 300 (edited)");
      await t.ui.getByRole("button", { name: "Save changes" }).click();
      await t.see("Saved and read back (1 field)");
      const upd = await t.calls((c) => c.command === "PROCESS_UPDATE_ADMIN_ITEM");
      t.check("edit = one SDK admin update with only the changed field", upd.length === 1 && upd[0].data === '{"Trade_Name":"SOLVASOFT 300 (edited)"}', upd);
      await t.ui.getByRole("button", { name: "Delete item" }).click();
      await t.ui.getByRole("button", { name: "Delete", exact: true }).click();
      await t.page.waitForTimeout(1200);
      const del = await t.calls((c) => c.command === "API" && c.method === "DELETE");
      t.check("delete = one admin DELETE for that item", del.length === 1 && del[0].url.includes("CIQP_Request_A00/PkReq2"), del);
      await t.notSee("ZZT-0002-REQ", "deleted item is gone from the table");
      await t.host({ role: "admin" }, "/admin/help");
      await t.see("How do I fill in the CIQ?");
      await t.ui.getByRole("button", { name: "New article" }).click();
      const drawer = t.ui.getByRole("dialog");
      await drawer.locator("input").first().fill("Harness article");
      await drawer.locator("textarea").first().fill("Created by the harness.");
      await t.ui.getByRole("button", { name: "Save", exact: true }).click();
      await t.see("Harness article");
      t.check("new article = form create + submit", (await t.calls((c) => c.command === "DATAFORM_CREATE_ITEM")).length === 1 && (await t.calls((c) => c.command === "DATAFORM_SUBMIT_ITEM")).length === 1);
      await t.host({ role: "admin" }, "/admin/roles");
      await t.see("Member · InitiateItems, View", "grants show the Admin role's level");
      await t.host({ role: "admin" }, "/admin");
      await t.see("Overview");
      t.check("no 'Preview supplier view' any more (16 Oct)", (await t.ui.getByText("Preview supplier view").count()) === 0);
      t.check("the theme switch sits in the sidebar", (await t.ui.getByRole("button", { name: /Dark theme|Light theme/ }).count()) >= 1);
      // 16 Oct: "Roles & grants" sends Kissflow itself to the portal's manage page (not the dev account here: production's)
      await t.ui.getByRole("button", { name: "Roles & grants" }).first().click();
      await t.page.waitForTimeout(600);
      const redirects = await t.page.evaluate(() => window.__kfRedirects ?? []);
      t.check("Roles & grants redirects Kissflow to the manage page", redirects.length === 1 && redirects[0] === "https://beiersdorf.kissflow.eu/view/portal/administration/CIQ_Supplier_Portal_A00/manage", redirects);
      await t.shot("admin");
    }),
  sparse: () =>
    scenario("sparse", async (t) => {
      // list rows with only system fields and the case header: every supplier item is a task, so it is read in full
      await t.host({ role: "supplier", rows: "sparse" }, "/portal");
      await t.see("OLIVIA Pure 100", "names come from the full reads");
      await t.see("CETYL 16", "also for a completed request (held at 'keep the CIQ up to date')");
    }),
  nofilter: () =>
    scenario("nofilter", async (t) => {
      // a host that ignores the activity filter: the step comes from the item itself
      await t.host({ role: "supplier", nofilter: "1" }, "/portal");
      await t.seeTid("portal-request-ZZT-0003");
      t.check("ZZT-0003 is still in review", (await t.tid("portal-request-ZZT-0003").getAttribute("data-phase")) === "review");
      t.check("ZZT-0001 is still filling in", (await t.tid("portal-request-ZZT-0001").getAttribute("data-phase")) === "supplier-input");
      t.check("Kissflow refused no command", (await t.calls((c) => c.refused)).length === 0);
    }),
  "envelope-data": () =>
    scenario("envelope-data", async (t) => {
      await t.host({ role: "supplier", envelope: "Data" }, "/portal");
      await t.see("OLIVIA Pure 100", "lists also read when the host answers { Data } (a bare array after the SDK)");
      await t.host({ role: "admin", envelope: "Data" }, "/admin/flow/request");
      await t.see("ZZT-0001-REQ");
    }),
  phone: () =>
    scenario(
      "phone",
      async (t) => {
        await t.host({ role: "supplier" }, "/portal/help");
        await t.see("How it works");
        // Thomas, 20 Oct: no top tab bar any more; on a narrow window the left pane starts as its icon rail
        const pane = t.tid("side-pane").first();
        t.check("on a phone the menu is the icon rail (64 px)", (await pane.getAttribute("data-collapsed")) === "true" && Math.round((await pane.boundingBox())?.width ?? -1) === 64, await pane.boundingBox());
        const help = t.tid("nav-portal-help").first();
        const box = await help.boundingBox();
        t.check("the current page (Help) is in view and marked current", !!box && box.x >= 0 && box.x + box.width <= 390 && (await help.getAttribute("aria-current")) === "page", box);
        t.check("no page scrolls sideways", await t.frame().evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), await t.frame().evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]));
        await t.shot("help");
      },
      { viewport: { width: 390, height: 800 } },
    ),
  "dev-role-switch": () =>
    scenario("dev-role-switch", async (t) => {
      // Thomas, 20 Oct: in the Development sandbox the top bar's switcher moves the user into a role they do not hold
      // for REAL (kf.app.switchRole: they leave their current role); the portal then acts in the new role
      await t.host({ role: "supplier", env: "dev" }, "/portal");
      await t.seeTid("dev-top-bar", "dev: the top bar is there");
      await t.see("OLIVIA Pure 100", "the supplier screens show");
      t.check("acts as Supplier", (await t.tid("role-switcher").getAttribute("data-persona")) === "supplier");
      const chip = (await t.tid("person-chip").first().innerText().catch(() => "")).replace(/\s+/g, " ");
      t.check("the person chip names the signed-in contact and the role", chip.includes("Elena Márquez") && chip.includes("Supplier"), chip);
      t.check("nothing asked for the roles before the menu opens", (await t.calls((c) => c.command === "GET_ROLES")).length === 0);
      await t.tid("role-switcher").click();
      await t.seeTid("role-menu", "the switcher lists the portal roles");
      t.check("the switcher is a menu button, now expanded", (await t.tid("role-switcher").getAttribute("aria-haspopup")) === "menu" && (await t.tid("role-switcher").getAttribute("aria-expanded")) === "true");
      const options = await t.ui.locator('[data-testid^="switch-role-"]:not([data-testid^="switch-role-confirm"])').evaluateAll((els) => els.map((e) => [e.getAttribute("data-testid"), e.getAttribute("role"), e.getAttribute("aria-checked"), e.textContent]));
      t.check("two options, Supplier (checked) and Portal admin, as menu radio items", options.length === 2 && options[0][0] === "switch-role-supplier" && options[0][2] === "true" && options[1][0] === "switch-role-admin" && options[1][3].includes("Portal admin") && options.every((o) => o[1] === "menuitemradio"), options);
      t.check("the open menu asked Kissflow for the roles (GET_ROLES)", (await t.calls((c) => c.command === "GET_ROLES")).length >= 1);
      await t.tid("switch-role-admin").click();
      await t.seeTid("switch-role-confirm-box", "a role not held asks for confirmation first");
      const confirm = await t.tid("switch-role-confirm-box").first().innerText();
      t.check("the confirmation names the role the user leaves", confirm.includes("Portal admin") && confirm.includes("You leave: Supplier"), confirm);
      t.check("nothing switched before the confirmation", (await t.calls((c) => c.command === "SWITCH_ROLE")).length === 0);
      await t.shot("confirm");
      await t.tid("switch-role-confirm").click();
      await t.seeTid("nav-admin", "the admin console shows after the switch");
      await t.see("Requests", "with the portal's flows");
      const sw = await t.calls((c) => c.command === "SWITCH_ROLE");
      t.check("one SWITCH_ROLE call", sw.length === 1, sw.map((c) => c.command));
      const switches = await t.page.evaluate(() => window.__kfSwitches ?? []);
      t.check("Kissflow moved the user from Supplier to Admin", JSON.stringify(switches) === JSON.stringify([{ from: ["supplier"], to: "admin" }]), switches);
      t.check("the portal now acts as Portal admin", (await t.tid("role-switcher").getAttribute("data-persona")) === "admin");
      t.check("on the admin console (not the demo preview)", (await t.frame().evaluate(() => location.hash)) === "#/admin" && (await t.tid("demo-bar").count()) === 0, await t.frame().evaluate(() => location.hash));
      const adminReads = await t.calls((c) => c.command === "PROCESS_GET_ADMIN_ITEMS" && !c.refused);
      t.check("the admin console reads as Admin now (Kissflow allows the admin lists)", adminReads.length > 0 && (await t.calls((c) => c.refused)).length === 0, (await t.calls((c) => c.refused)).map((c) => `${c.command}: ${c.refused}`));
      await t.shot("admin");
      await t.ui.getByRole("button", { name: "Roles & grants" }).first().click();
      await t.page.waitForTimeout(600);
      const redirects = await t.page.evaluate(() => window.__kfRedirects ?? []);
      t.check("in dev, Roles & grants redirects Kissflow to the Development sandbox's manage page", redirects.length === 1 && redirects[0] === "https://dev-beiersdorf.kissflow.eu/view/application/CIQ_Supplier_Portal_A00/manage", redirects);
      // a role the user already holds switches the screens only
      await t.host({ role: "admin", also: "supplier", env: "dev" }, "/admin");
      await t.seeTid("nav-admin");
      t.check("holding both roles, the portal acts as Portal admin first", (await t.tid("role-switcher").getAttribute("data-persona")) === "admin");
      const n0 = (await t.calls(() => true)).length;
      await t.tid("role-switcher").click();
      await t.seeTid("role-menu");
      t.check("Supplier is marked held", (await t.tid("switch-role-supplier").innerText()).includes("held"));
      await t.tid("switch-role-supplier").click();
      await t.seeTid("nav-portal", "the supplier screens show");
      await t.settle();
      const after = (await t.calls(() => true)).slice(n0);
      t.check("a held role switches the screens only (no SWITCH_ROLE)", !after.some((c) => c.command === "SWITCH_ROLE"), after.map((c) => c.command).slice(0, 20));
      t.check("now acts as Supplier, on My requests", (await t.tid("role-switcher").getAttribute("data-persona")) === "supplier" && (await t.frame().evaluate(() => location.hash)) === "#/portal");
      t.check("the supplier task lists were read for the new role", after.some((c) => c.command === "PROCESS_GET_MY_TASKS_ITEMS"));
      await t.tid("role-switcher").click();
      await t.page.keyboard.press("Escape");
      await t.page.waitForTimeout(200);
      t.check("Escape closes the menu", (await t.tid("role-menu").count()) === 0 && (await t.tid("role-switcher").getAttribute("aria-expanded")) === "false");
    }),
  "prod-no-topbar": () =>
    scenario("prod-no-topbar", async (t) => {
      // Thomas, 20 Oct: production (beiersdorf.kissflow.eu) has no top bar; the left pane collapses and expands
      await t.host({ role: "supplier" }, "/portal");
      await t.seeTid("main-nav", "the shell opens");
      await t.see("OLIVIA Pure 100");
      await t.settle(300);
      t.check("no top bar", (await t.ui.locator("header").count()) === 0 && (await t.tid("dev-top-bar").count()) === 0);
      t.check("no role switcher and no person chip", (await t.ui.locator('[data-testid="role-switcher"], [data-testid="person-chip"]').count()) === 0);
      t.check("no GET_ROLES / SWITCH_ROLE call", (await t.calls((c) => c.command === "GET_ROLES" || c.command === "SWITCH_ROLE")).length === 0);
      t.check("Reload and the status note sit in the left pane's footer", (await t.ui.locator('[data-testid="side-footer"] [data-testid="reload"]').count()) === 1 && (await t.ui.locator('[data-testid="side-footer"] [data-testid="load-status"]').count()) === 1);
      const note = await t.tid("load-status").first().innerText();
      t.check("the note reads 'Updated …' once nothing runs", /^Updated \d/.test(note), note);
      t.check("the theme toggle is there too", (await t.ui.locator('[data-testid="side-footer"]').getByRole("button", { name: /Dark theme|Light theme/ }).count()) === 1);
      const badge = await t.tid("nav-portal").first().locator('[aria-label$=" open"]').innerText().catch(() => "");
      const tasks = await t.ui.locator('[data-testid="portal-tasks"] li').count();
      t.check("My requests carries the open-task count", Number(badge) > 0 && Number(badge) === tasks, { badge, tasks });
      const width = async () => Math.round((await t.tid("side-pane").first().boundingBox())?.width ?? -1);
      t.check("the left pane starts expanded (244 px)", (await width()) === 244, await width());
      await t.tid("nav-toggle").first().click();
      await t.page.waitForTimeout(400); // the 200 ms width transition
      t.check("the left pane collapses to an icon rail (64 px)", (await t.tid("side-pane").first().getAttribute("data-collapsed")) === "true" && (await width()) === 64, await width());
      t.check("collapsed, Reload keeps its name and the menu entries theirs", (await t.ui.getByRole("button", { name: "Reload" }).count()) === 1 && (await t.tid("nav-portal-help").first().getAttribute("aria-label")) === "Help");
      await t.shot("collapsed");
      await t.tid("nav-toggle").first().click();
      await t.page.waitForTimeout(400);
      t.check("and expands again", (await t.tid("side-pane").first().getAttribute("data-collapsed")) === "false" && (await width()) === 244, await width());
      await t.shot("expanded");
      // the admin console in production: no top bar either
      await t.host({ role: "admin" }, "/admin");
      await t.seeTid("nav-admin");
      t.check("admin: no top bar", (await t.ui.locator("header").count()) === 0 && (await t.tid("role-switcher").count()) === 0);
      t.check("admin: no phone-only page picker", (await t.ui.getByRole("combobox", { name: "Go to" }).count()) === 0);
      t.check("admin: Roles & grants is a button in the pane", (await t.tid("nav-admin-roles").first().evaluate((e) => e.tagName)) === "BUTTON");
      await t.shot("admin");
    }),
  paging: () =>
    scenario("paging", async (t) => {
      // 26 Oct: 200 rows asked a call (client.ts PAGE_SIZE); 450 + the fixtures span 3 pages, plus at most one empty read
      const total = 450 + FX.byFlow.CIQP_Request_A00.length;
      await t.host({ role: "admin", extra: 450 }, "/admin/flow/request");
      await t.see(`${total} items in total`, "every request read across pages of 200");
      const pages = [...new Set((await t.calls((c) => c.command === "PROCESS_GET_ADMIN_ITEMS" && c.flowId === "CIQP_Request_A00")).map((c) => c.pageNumber))].sort((a, b) => a - b);
      const need = Math.ceil(total / 200);
      t.check(`pages 1 to ${need} were asked for (at most one more, empty)`, pages.every((n, i) => n === i + 1) && pages.length >= need && pages.length <= need + 1, pages);
    }),
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS);
for (const w of wanted) await SCENARIOS[w]();
await browser.close();
uiServer.close();
hostServer.close();
writeFileSync(path.join(out, "harness-report.json"), JSON.stringify({ results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed}/${results.length} scenarios passed (${results.reduce((n, r) => n + r.checks.length, 0)} checks)`);
process.exit(failed ? 1 : 0);
