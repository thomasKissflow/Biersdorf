// Live Kissflow client + two-pass apply. Uses global fetch (Node 18+).
// Credentials from env: KISSFLOW_SUBDOMAIN, KISSFLOW_ACCOUNT_ID, KISSFLOW_API_KEY, KISSFLOW_API_SECRET.
//
// Hard-won live facts (verified on lcncdemo 2026-06-25):
//  - app-association is a QUERY PARAM on create: POST /flow/2/{acct}/{type}/?_application_id={app}
//    (body _application_id is silently dropped). Confirm via GET /flow/2/{acct}/explore.
//  - create returns 200 even when it drops fields → READ-AFTER-WRITE is mandatory.
//  - server assigns _id from Name → capture it and remap references (two-pass).
//  - metadata body: PUT /metadata/2/{acct}/{type}/{id}/draft → POST .../publish.

import { buildApp } from "./builders.mjs";
import { checkHygiene, validateBlob, errors as blobErrors } from "./validators.mjs";
import { slug, eid } from "./util.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

// stable content hash of a flow's blob — the change-detector for incremental re-apply.
const blobHash = (b) => createHash("sha1").update(JSON.stringify(b)).digest("hex").slice(0, 16);

// localize500 — when a flow publishes 500 despite a clean pre-flight (an UNKNOWN cause), field-bisect
// live to NAME the culprit field, so the agent gets "field X 500s" instead of hand-bisecting over many
// turns. Returns the culprit field's name/id, or null when no single field is at fault (whole-flow /
// genuine platform 500). Bounded: ~log2(fields) publish probes. Restores the full draft when done.
async function localize500(c, fm, merged) {
  const root = merged[merged.Root];
  const removable = ((root && root["Model::Field"]) || []).filter((fid) => { const f = merged[fid]; return f && f.Kind === "Field" && !f.Required; });
  if (removable.length < 2) return null;
  const tryWithout = async (removeSet) => {
    const draft = JSON.parse(JSON.stringify(merged));
    const r = draft[draft.Root];
    r["Model::Field"] = (r["Model::Field"] || []).filter((id) => !removeSet.has(id));
    for (const id of removeSet) delete draft[id];
    const pd = await c.putDraft(fm.type, fm.server, draft);
    if (pd.status >= 300) return false;
    return (await c.publish(fm.type, fm.server)).status < 300;
  };
  let culprit = null;
  // if removing ALL removable fields still doesn't publish, it's structural/whole-flow — not one field.
  if (await tryWithout(new Set(removable))) {
    let suspects = [...removable];
    while (suspects.length > 1) {
      const mid = Math.ceil(suspects.length / 2), rest = suspects.slice(mid);
      suspects = (await tryWithout(new Set(rest))) ? rest : suspects.slice(0, mid); // publish w/o rest ⇒ culprit in rest
    }
    const culpritId = suspects[0];
    culprit = merged[culpritId] ? (merged[culpritId].Name || culpritId) : culpritId;
    // leave the flow PUBLISHED in a COHERENT state — everything EXCEPT the one bad field (which we know
    // publishes) — rather than whatever partial subset the bisection's LAST probe happened to leave live.
    await tryWithout(new Set([culpritId]));
  }
  // restore the full intended draft (UNPUBLISHED) for the agent to fix; check the restore landed so we
  // don't silently leave a reduced bisection draft that would mislead the agent's next getDraft.
  const restore = await c.putDraft(fm.type, fm.server, merged);
  if (restore.status >= 300) log(`  localize500: draft restore for ${fm.server} returned ${restore.status} — draft may be reduced; re-apply to reset it`);
  return culprit;
}

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));

// FIX PROCESS-LIST TABLES — the runtime renders a process `view/table` ONLY when it's bound to the
// `myitems` system view WITH a `status:"all"` field. Verified live against the golden Process_Views page
// (myitems → {view_id, showform, status:"all"}) and by direct render test: the engine-built process serves
// data at `/process/{id}/myitems` (200) but not `mytasks`/`_All_Items` (404). The transformer emits a
// mytasks-shape (`steps:"all"`, no `status`), so every process list otherwise fails "Unable to display
// component". Rewrite each process table's binding to the proven golden myitems shape. Transformer-agnostic
// (runs on the output), so it holds even when KF_METADATA_PATH points page_transform at the live source.
export function fixProcessTables(meta) {
  if (!meta || typeof meta !== "object") return meta;
  let seq = 0;
  for (const v of Object.values(meta)) {
    if (!v || v.Kind !== "Component" || v.Script?.web !== "view/table" || v.Data?.flow_type !== "Process") continue;
    const wrap = meta[v.Container];
    if (!wrap) continue;
    const flowId = v.Data.flow_id;
    v.Data = { manifest_id: "Table", category: "view", visualization_type: "table", flow_type: "Process", flow_id: flowId, view_id: "myitems" };
    const shape = { flow_id: flowId, flow_type: "Process", view_id: "myitems", showform: true, status: "all" };
    for (const fmId of wrap["Container::FieldMapping"] || []) { const fm = meta[fmId]; for (const pid of (fm?.["FieldMapping::Property"] || [])) delete meta[pid]; delete meta[fmId]; }
    wrap["Container::FieldMapping"] = [];
    for (const [name, val] of Object.entries(shape)) {
      const fmId = `FieldMapping_pt${++seq}`, prId = `Property_pt${seq}`;
      meta[fmId] = { Id: fmId, Kind: "FieldMapping", Name: name, Container: wrap.Id, "FieldMapping::Property": [prId] };
      meta[prId] = { Id: prId, Kind: "Property", Type: "Value", Value: val, FieldMapping: fmId };
      wrap["Container::FieldMapping"].push(fmId);
    }
  }
  return meta;
}

// Compile a page INTERMEDIATE through Kissflow's REAL transformer.py (via page_transform.py).
// Returns the rendering-correct page metadata, or null on failure. There is NO JS mirror.
function transformPageReal(intermediate, applicationId, pageId, log) {
  const input = JSON.stringify({ intermediate, applicationId, pageId });
  const r = spawnSync("python3", [join(ENGINE_DIR, "page_transform.py")], { input, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) { if (log) log(`  page transformer error: ${(r.stderr || r.error?.message || "").slice(0, 160)}`); return null; }
  try { return JSON.parse(r.stdout); } catch (e) { if (log) log(`  page transformer bad output: ${e.message}`); return null; }
}

// Cross-flow references a blob points at (ReferredList for selects, LHSModel for
// references). These resolve to OTHER flows, so validateBlob (within-blob only) can't
// check them — a dangling one is the usual cause of the opaque publish 500.
function crossRefs(blob) {
  const refs = new Set();
  for (const e of Object.values(blob)) {
    if (!e || e.Kind !== "Field") continue;
    if (e.ReferredList) refs.add(e.ReferredList);
    for (const qid of e["Field::QueryDefinition"] || []) {
      const lhs = blob[qid]?.LHSModel;
      // in-blob Model = an EMBEDDED child table (aggregate over line-items), not a cross-flow ref
      if (lhs && lhs !== "User" && !blob[lhs]) refs.add(lhs);
    }
  }
  return [...refs];
}

// Flow-type → member-grant contract, single source of truth for both the IR-permission and the
// page-driven access paths. Board is a Case flow server-side; both use the "case" family and
// Permission:[] ONLY (Delete is rejected on cases). Getting "Board" wrong here → grants POST to the
// /form/ endpoint → 404, boards render memberless (hire-onboarding 2026-07-05).
export function flowGrant(flowType, { editable = true, admin = false } = {}) {
  const t = flowType || "Form";
  // golden (Disclosure_Reports/Customer_Fee SharedWith): process members carry InitiateItems —
  // Permission:[] leaves the role unable to raise items at all (found by runtime QA 2026-07-17)
  if (t === "Process") return { family: "process", role: "Member", permission: editable ? ["InitiateItems"] : ["View"] };
  if (t === "Case" || t === "Board")
    return { family: "case", role: admin && editable ? "Admin" : editable ? "Member" : "Viewer", permission: [] };
  return { family: "form", role: editable ? "Member" : "Viewer", permission: editable ? ["Delete"] : [] };
}

// clientFromEnv() reads the DEV credentials; clientFrom("PROD_") reads the PROD_* ones so a real
// prod client can be built (#18 — the CLI logged 'created in prod' but only ever used dev). Same
// name-tolerance (KISSFLOW_*/KF_*), just an optional prefix on each name.
export function clientFromEnv() { return clientFrom(""); }
// `infix` sits AFTER the namespace: dev = KISSFLOW_ACCOUNT_ID / KF_ACCOUNT_ID; prod = KISSFLOW_PROD_
// ACCOUNT_ID / KF_PROD_ACCOUNT_ID. (#18) The prod client reads these so a create can genuinely happen
// in prod, not merely be logged as if it did.
export function clientFrom(infix = "") {
  const env = process.env;
  // build both namespace spellings for a given suffix, e.g. suffix "ACCOUNT_ID" →
  // ["KISSFLOW_<infix>ACCOUNT_ID", "KF_<infix>ACCOUNT_ID"]
  const names = (ksSuffix, kfSuffix = ksSuffix) => [`KISSFLOW_${infix}${ksSuffix}`, `KF_${infix}${kfSuffix}`];
  const pick = (...ns) => { for (const n of ns) if (env[n] != null && env[n] !== "") return env[n]; return undefined; };
  const acc = pick(...names("ACCOUNT_ID"));
  const key = pick(...names("API_KEY", "ACCESS_KEY_ID"));
  const secret = pick(...names("API_SECRET", "ACCESS_KEY_SECRET"));
  // Host resolution: a full-domain override (KISSFLOW_DOMAIN/KF_DOMAIN) wins — required for
  // non-*.kissflow.com hosts (QA/self-hosted). A DOTTED subdomain is also treated as a full host.
  const domain = pick(...names("DOMAIN"));
  const sub = pick(...names("SUBDOMAIN"));
  if (!acc || !key || !secret || (!domain && !sub))
    throw new Error(`Set KISSFLOW_${infix}ACCOUNT_ID/API_KEY/API_SECRET (or KF_${infix}*) and KISSFLOW_${infix}DOMAIN (or KISSFLOW_${infix}SUBDOMAIN) in env`);
  const host = domain ? domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    : sub.includes(".") ? sub.replace(/^https?:\/\//, "") : `${sub}.kissflow.com`;
  const base = `https://${host}`;
  const headers = { "X-Access-Key-Id": key, "X-Access-Key-Secret": secret, "Content-Type": "application/json" };
  // RESILIENT call: retry transient network failures + 5xx/429 with backoff, and NEVER throw —
  // a single hiccup among the hundreds of apply calls must not abort the run (which would skip
  // everything downstream, e.g. nav + role Preference). A hard failure returns {status:-1}.
  // opts (optional 4th arg): { timeoutMs } aborts a hung request so a degraded endpoint fails fast
  // instead of blocking for minutes (the AI page-preview endpoint hangs when the service is degraded —
  // without a timeout a poll loop stretches from minutes into HOURS). { noRetry } skips the backoff loop.
  const call = async (method, path, body, opts = {}) => {
    const MAX = opts.noRetry ? 0 : 4;
    for (let attempt = 0; ; attempt++) {
      try {
        const signal = opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined;
        const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
        const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
        // 500s are retried for GETs only — a write-500 may have COMMITTED server-side; blind
        // retries there duplicate records (the seeding path must verify-then-retry instead).
        const retryable = [429, 502, 503, 504].includes(r.status) || (r.status === 500 && method === "GET");
        if (retryable && attempt < MAX) { await new Promise((s) => setTimeout(s, 500 * (attempt + 1))); continue; }
        return { status: r.status, body: j };
      } catch (e) {
        // AbortError (timeout) is a soft failure — surface it as -2 so pollers can distinguish it
        const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
        if (attempt < MAX) { await new Promise((s) => setTimeout(s, 500 * (attempt + 1))); continue; }
        return { status: timedOut ? -2 : -1, body: { error: timedOut ? "request timed out" : "fetch failed", message: String(e?.message || e) } };
      }
    }
  };
  // Kissflow rejects Description > 250 chars with a bare HTTP 413 (no error body) — clamp at a word boundary
  const clampDesc = (s) => { s = String(s || ""); if (s.length <= 250) return s; const cut = s.slice(0, 249); return cut.slice(0, Math.max(cut.lastIndexOf(" "), 200)) + "…"; };
  return { base, acc, host, call,
    createApp: (Name, Description = "") => call("POST", `/flow/2/${acc}/application/`, { Name, Description: clampDesc(Description) }),
    getApp: (appId) => call("GET", `/flow/2/${acc}/application/${appId}?_application_id=${appId}`, undefined, { noRetry: true, timeoutMs: 8000 }),
    // cases REQUIRE Prefix + ItemType on create (missing → 400 MissingRequiredFieldError)
    createFlow: (type, Name, appId, Description = "") => call("POST", `/flow/2/${acc}/${type}/?_application_id=${appId}`,
      type === "case"
        ? { Name, Description: clampDesc(Description), Prefix: Name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "CSE", ItemType: "Item" }
        : { Name, Description: clampDesc(Description) }),
    getDraft: (type, id) => call("GET", `/metadata/2/${acc}/${type}/${id}/draft`),
    // hygiene-gated: refuses drafts with duplicate step-Permissions / stale Column::Permission
    // back-refs (agent hand-grafts on old plugins injected these — Store_Launch 2026-07-17).
    // KF_SKIP_HYGIENE=1 overrides for deliberate raw writes.
    putDraft: (type, id, blob) => {
      if (process.env.KF_SKIP_HYGIENE !== "1") {
        const bad = checkHygiene(blob).filter((i) => i.level === "error");
        if (bad.length) throw new Error(`putDraft ${type}/${id} REFUSED — draft fails hygiene:\n  ` + bad.map((i) => `${i.code}: ${i.msg}`).join("\n  ") + `\n  fix (or run: node engine/patch.mjs dedupe-permissions ${id}); KF_SKIP_HYGIENE=1 to override`);
      }
      return call("PUT", `/metadata/2/${acc}/${type}/${id}/draft`, blob);
    },
    publish: (type, id) => call("POST", `/metadata/2/${acc}/${type}/${id}/publish`, {}),
    // Lists don't use the metadata draft/publish path — their option values are saved via the
    // runtime save-items handler: POST /flow/2/{acc}/list/{id}/items {ListItems:[...]} (verified
    // live 2026-07-03, Inventory build; wrong shapes: top-level array → 403 TypeMissMatchError,
    // {Name}/{Value} objects → 400 Unknown field, metadata draft path → 404).
    // chunked: one giant ListItems payload is a reliable way to draw a runtime 500 — post in
    // batches of 50 with a breather between them; returns the worst status + per-batch results
    putListItems: async (id, items) => {
      const CHUNK = 50, batches = [];
      for (let i = 0; i < items.length; i += CHUNK) batches.push(items.slice(i, i + CHUNK));
      let worst = 200; const results = [];
      for (const [bi, batch] of batches.entries()) {
        const r = await call("POST", `/flow/2/${acc}/list/${id}/items`, { ListItems: batch });
        results.push({ batch: bi, size: batch.length, status: r.status });
        if (r.status > worst) worst = r.status;
        if (batches.length > 1) await new Promise((s) => setTimeout(s, 300));
      }
      return { status: worst, body: { batches: results } };
    },
    // roles associate via BODY _application_id (NOT the query param flows use); list: /app_role/2/{acc}/list?_application_id=
    createRole: (Name, appId) => call("POST", `/app_role/2/${acc}/`, { Name, _application_id: appId }),
    explore: () => call("GET", `/flow/2/${acc}/explore`),
    deleteFlow: (type, id) => call("DELETE", `/flow/2/${acc}/${type}/${id}`),
    deleteApp: (id) => call("DELETE", `/flow/2/${acc}/application/${id}`),
  };
}

// PROD-FIRST (#18). A prod client, built from PROD_* env, or null when prod creds aren't set. The CLI
// used to LOG "created in prod → awaited in dev" while applyIR only ever used the dev client — a false
// statement about where an irreversible resource landed. With this, the create genuinely happens on
// the prod host and the report records it.
export function prodClient() {
  try { return clientFrom("PROD_"); } catch { return null; }   // null when prod creds aren't fully set
}

/**
 * Poll `client` until app `appId` exists (Kissflow replicates a prod-created app to dev asynchronously),
 * or give up after timeoutMs. Pure control-flow over an injected client, so it is unit-testable without
 * a live account: a mock whose getApp returns 404 a few times then 200 exercises the whole loop.
 * Returns { replicated:boolean, waitedMs, polls }.
 */
export async function awaitReplication(client, appId, { timeoutMs = 120000, pollMs = 3000, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  const start = now();
  let polls = 0;
  for (;;) {
    polls++;
    const r = await client.getApp(appId);
    if (r && r.status >= 200 && r.status < 300 && (r.body?._id || r.body?.Id)) {
      return { replicated: true, waitedMs: now() - start, polls };
    }
    if (now() - start >= timeoutMs) { log(`  ⚠ app ${appId} not replicated to ${client.host || "dev"} after ${Math.round((now() - start) / 1000)}s (${polls} polls)`); return { replicated: false, waitedMs: now() - start, polls }; }
    await sleep(pollMs);
  }
}

// Replace every occurrence of my generated ids with server ids (longest-first to avoid
// substring clobbering). Remaps Root, Model back-refs, LHSModel, ReferredList in one pass.
function remap(blob, genToServer) {
  let s = JSON.stringify(blob);
  for (const [gen, srv] of Object.entries(genToServer).sort((a, b) => b[0].length - a[0].length)) {
    if (gen && srv && gen !== srv) s = s.split(gen).join(srv);
  }
  return JSON.parse(s);
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), " ", ...a); // timestamped — enables per-phase timing analysis of an apply

// bounded-concurrency map: apply phases are dominated by API round-trips on INDEPENDENT artifacts —
// measured on the P2P build (2026-07-03): shells 9s, bodies 14s, permissions 35s, all serial.
// Runs fn over items with at most `limit` in flight, preserving result order.
async function pMap(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Two-pass live apply of an IR. Returns a report.
 * Pass 1: create app + all flow shells (lists, forms/processes) WITH app-association → server ids.
 * Pass 2: per flow, GET starter draft, graft remapped blob (refs → server ids), PUT draft, publish.
 * Then read-after-write verify via explore.
 */
export async function applyIR(ir, opts = {}) {
  // opts.client / opts.prodClient are injection seams for tests (real runs build from env). They do not
  // change production behavior — env is the default — but let the crash-safety and reuse paths be
  // exercised without live Kissflow credentials.
  const c = opts.client || clientFromEnv();
  const acc = c.acc;
  // pageMode is a build POLICY, threaded through — not `ir.pages=[]` upstream, which normalizeIR
  // silently undoes. "none" (custom-UI / backend-only) suppresses every native page + nav artifact.
  const pageMode = opts.pageMode || (opts.aiPages === false ? "authored" : "authored");
  const { artifacts } = buildApp(ir, { pageMode });
  if (pageMode === "none") opts.aiPages = false;   // and the AI generator never runs
  const report = { app: null, created: [], published: [], skipped: [], roles: [], errors: [], verified: {} };
  // INCREMENTAL re-apply: a checkpoint of {gen → blobHash} for flows already published successfully.
  // Pass 2 skips a flow whose blob is unchanged since it last published — so a one-flow fix re-publishes
  // ONE flow (seconds), not all 114 (~8 min). KF_FORCE_REPUBLISH=1 (or opts.force) forces a full re-apply.
  const manifest = opts.stateFile && existsSync(opts.stateFile) ? (() => { try { return JSON.parse(readFileSync(opts.stateFile, "utf8")); } catch { return {}; } })() : {};
  // KF_FORCE_REPUBLISH forces a full re-apply — but only for a TRUTHY value: `=0`/`false`/`off`/empty
  // must NOT force (a bare `||` truthy-tested any non-empty string, so `KF_FORCE_REPUBLISH=0` forced).
  const envForce = process.env.KF_FORCE_REPUBLISH;
  const force = !!opts.force || (envForce != null && !["", "0", "false", "off", "no"].includes(String(envForce).toLowerCase()));
  const saveManifest = () => { if (opts.stateFile) { try { writeFileSync(opts.stateFile, JSON.stringify(manifest)); } catch {} } };
  // CRASH-SAFE app id (#14). The gen→server map used to be written ONLY at the very end of a run, so a
  // crash (bash timeout in Cowork, an OOM, a killed pod) ANY time between createApp and the final line
  // left no id-map.json — and the next `apply` had no reuse handle, so it called createApp AGAIN and
  // built a DUPLICATE app in the customer's account. Persisting {app} the instant the shell exists
  // means a re-apply always finds it and reuses it. Written next to the run's stateFile (same dir the
  // CLI reads idMapFile from). Called again at the end with the full genToServer.
  const persistIdMap = (map) => { if (opts.stateFile) { try { writeFileSync(join(dirname(opts.stateFile), "id-map.json"), JSON.stringify(map, null, 1)); } catch {} } };
  if (Object.keys(manifest).length) log(`incremental: ${Object.keys(manifest).length} flow(s) in checkpoint — unchanged ones will be skipped (KF_FORCE_REPUBLISH=1 to force)`);

  // app — create new, OR reuse an existing app for an INCREMENTAL apply (add pages/permissions/nav
  // onto an already-built app). Reuse mode takes a caller-supplied genToServer so it never depends on
  // the ambiguous account-wide explore (which can't tell two same-named flows from different apps apart).
  const appName = ir.app?.name || "Untitled App";
  let appId;
  if (opts.reuse?.appId) { appId = opts.reuse.appId; report.app = appId; report.reused = true; log(`reuse app ${appId}`); }
  else {
    // PROD-FIRST (#18). When prod creds are set (and not opted out), the app shell is CREATED in prod
    // — the account of record — and we then poll dev until Kissflow replicates it there; the rest of
    // the build proceeds against dev (c). Without prod creds, or with opts.prodFirst===false, the app
    // is created directly in dev. Either way the report records the ACTUAL host, so the log can never
    // again claim prod while writing to dev.
    const prod = opts.prodFirst === false ? null : (opts.prodClient !== undefined ? opts.prodClient : prodClient());
    const creator = prod || c;
    const ra = await creator.createApp(appName, ir.app?.description || "");
    if (ra.status >= 300 || !ra.body?._id) { report.errors.push(`app create failed on ${creator.host}: ${ra.status}`); return report; }
    appId = ra.body._id; report.app = appId; report.createdOn = creator.host;
    persistIdMap({ app: appId, genToServer: {} });   // #14: reusable handle exists the instant the app does — before awaitReplication, before any flow
    log(`app ${appId} created on ${creator.host}`);
    if (prod) {
      const rep = await awaitReplication(c, appId, { log });
      report.replicatedToDev = rep.replicated;
      if (!rep.replicated) { report.errors.push(`app ${appId} created in prod (${prod.host}) but not replicated to dev (${c.host}) within timeout — build aborted before mutating dev`); return report; }
      log(`app replicated prod→dev in ${Math.round(rep.waitedMs / 1000)}s`);
    }
  }

  // roles — REUSE existing app roles (every app ships default Admin + User; don't dup them).
  // Matching is NORMALIZED (trim + case-fold): "HR Ops" / "hr ops " are the same role. If the role
  // list can't be read we ABORT rather than blind-create — an empty map here is how whole role sets
  // get silently recreated on re-apply.
  const roleKey = (n) => String(n || "").trim().toLowerCase();
  const listRoles = async () => {
    const res = await c.call("GET", `/app_role/2/${acc}/list?_application_id=${appId}`);
    if (res.status >= 300) return null;
    const map = {};
    for (const er of (Array.isArray(res.body) ? res.body : (res.body?.Data || []))) map[roleKey(er.Name)] = er._id;
    return map;
  };
  let roleByName = await listRoles();
  if (roleByName === null) {
    report.errors.push(`role list failed for ${appId} — refusing to create roles blind (would duplicate existing ones)`);
    return report;
  }
  for (const r of artifacts.filter((a) => a.type === "role")) {
    const k = roleKey(r.doc.Name);
    if (roleByName[k]) { report.roles.push({ name: r.doc.Name, status: 200, id: roleByName[k], reused: true }); log(`role ${r.doc.Name} → reused`); continue; }
    const rr = await c.createRole(r.doc.Name, appId);
    if (rr.status >= 300 && /exist/i.test(JSON.stringify(rr.body || {}))) {
      // raced or server-side name normalization differs — re-list and reuse instead of failing/duping
      roleByName = (await listRoles()) || roleByName;
      if (roleByName[k]) { report.roles.push({ name: r.doc.Name, status: 200, id: roleByName[k], reused: true }); log(`role ${r.doc.Name} → reused (already existed)`); continue; }
    }
    report.roles.push({ name: r.doc.Name, status: rr.status, id: rr.body?._id });
    if (rr.body?._id) roleByName[k] = rr.body._id; // guard against dup entries later in this same apply
    log(`role ${r.doc.Name} → ${rr.status}`);
  }

  // The developing user belongs in EVERY role by default — otherwise the first thing they hit in
  // their own freshly built app is a "no role assigned" wall (CapEx 2026-07-31). The role PUT's
  // body key is `Users` — `Members` returns success but changes nothing — and adds are additive
  // (removal needs IsDelete:true), so re-applying is harmless.
  try {
    const appDoc = await c.call("GET", `/flow/2/${acc}/application/${appId}`);
    const dev = appDoc.body?._created_by?._id;
    if (dev) {
      // via the agentic layer: the role PUT answers {"status":"success"} for body shapes it does
      // not read, so the grant is verified by reading the members back rather than trusted
      const { grantRoleMembers } = await import("./agentic.mjs");
      let landed = 0;
      for (const r of report.roles) {
        if (!r.id) continue;
        const res = await grantRoleMembers(c, { acc, appId, roleId: r.id, userIds: [dev] }).catch(() => null);
        if (res?.ok) landed++;
        else if (res?.missing?.length) log(`  ! role ${r.name}: grant reported success but did not persist`);
      }
      log(`roles: developer ${dev} added to ${landed}/${report.roles.filter((r) => r.id).length} role(s)`);
    }
  } catch { /* best-effort — the builder is still app Admin either way */ }

  // Seed the remap with ROLE ids: workflow step assignees (Resource.Value) and permission entities
  // use generated role ids (eid("Ro", name)); remap them to the real server role ids.
  const genToServer = {}; const flowMeta = []; const liveIds = new Set();
  for (const r of report.roles) if (r.id) genToServer[eid("Ro", r.name)] = r.id;
  // ALSO map the IR-PROVIDED role ids (kf-architect assigns e.g. "role-dept-head") → server id, by
  // name. buildApp puts `r.id || eid("Ro",name)` into workflow-step assignees (Resource.Value); when
  // the IR carries explicit role ids, ONLY this form appears there, and without this mapping it never
  // remaps → published process has an unresolvable assignee → 400 "no assignee for next step"
  // (hire-onboarding 2026-07-05: all 6 process journeys dead at step 2).
  {
    const serverRoleByName = {}; for (const r of report.roles) if (r.id) serverRoleByName[r.name] = r.id;
    for (const r of ir.roles || []) if (r.id && serverRoleByName[r.name] && r.id !== serverRoleByName[r.name]) genToServer[r.id] = serverRoleByName[r.name];
  }
  // account-wide flow ids (so a colliding/global list e.g. "Currency" can be reused, and
  // cross-refs validated against what actually exists) — needed even when reuse supplies a map,
  // because a NEW artifact created THIS run can still collide with an account-global name.
  const ex0 = await c.explore();
  const accountFlows = Array.isArray(ex0.body) ? ex0.body : [];
  const idByName = new Map(accountFlows.map((f) => [f.Name, f._id]));
  for (const f of accountFlows) liveIds.add(f._id);

  if (opts.reuse?.genToServer) {
    // INCREMENTAL: some flows already exist — seed genToServer from the supplied map so PASS 1 skips
    // THOSE specifically (never the ambiguous explore-by-name for them). This is per-artifact, NOT a
    // global switch: any artifact in THIS IR whose id isn't in the map (a newly added form/case, or
    // one recreated after a delete) still goes through PASS 1 create below — a prior version of this
    // function skipped PASS 1/1b/2/2.5 ENTIRELY whenever any reuse map was supplied, so adding a new
    // flow (or recreating a deleted one) to an app being incrementally re-applied silently did nothing
    // (found live, 2026-07-31: Tiffin's recreated Order_A00 never got created on a "reuse" apply).
    Object.assign(genToServer, opts.reuse.genToServer);
    for (const v of Object.values(opts.reuse.genToServer)) liveIds.add(v);
    log(`reuse: ${Object.keys(opts.reuse.genToServer).length} flow ids from map (skip create for those; new/recreated artifacts in this IR still get created)`);
  }

  // PASS 1 — create shells for artifacts NOT already known (new in this IR, or a reuse map didn't
  // cover them — e.g. recreated after a delete), capturing server ids (reuse/prefix on name collision).
  const appPrefix = (ir.app?.name || "App").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  const accept = (a, serverId, note) => { genToServer[a.id] = serverId; liveIds.add(serverId); report.created.push({ type: a.type, gen: a.id, server: serverId, ...(note || {}) }); if (a.blob) flowMeta.push({ type: a.type, gen: a.id, server: serverId }); };
  await pMap(artifacts.filter((x) => ["list", "form", "process", "case"].includes(x.type) && !genToServer[x.id]), 5, async (a) => {
    const name = a.shell?.Name || a.doc?.Name || a.id;
    const cr = await c.createFlow(a.type, name, appId, a.shell?.Description || "");
    let serverId = cr.body?._id;
    if (cr.status >= 300 || !serverId) {
      if (cr.body?.type === "FlowNameAlreadyExists" && idByName.has(name)) {
        accept(a, idByName.get(name), { reused: true });
        log(`shell ${a.type} ${a.id} → ${idByName.get(name)} (reused existing)`);
        return;
      }
      // account-global name (e.g. "Currency", "Project") we don't own — retry app-scoped/prefixed so
      // it's a NEW flow of ours; refs resolve via gen→server, so only the display Name changes.
      if (cr.body?.type === "FlowNameAlreadyExists") {
        const alt = `${appPrefix} ${name}`.slice(0, 60);
        const cr2 = await c.createFlow(a.type, alt, appId, a.shell?.Description || "");
        if (cr2.status < 300 && cr2.body?._id) {
          accept(a, cr2.body._id, { renamed: alt });
          log(`shell ${a.type} ${a.id} → ${cr2.body._id} (renamed "${alt}" — global name "${name}" was taken)`);
          return;
        }
      }
      report.errors.push(`${a.type} ${a.id} create failed: ${cr.status} ${JSON.stringify(cr.body).slice(0, 80)}`);
      return;
    }
    accept(a, serverId);
    log(`shell ${a.type} ${a.id} → ${serverId}`);
  });

  // PASS 1b — list items: lists are created as shells in PASS 1 but carry no blob (skipped by the
  // body pass). Their option values live in the artifact `.doc.ListItems` and must be saved via the
  // runtime save-items handler — or every Select backed by the list is EMPTY and required Selects
  // become unsatisfiable (no record creatable, even in the Kissflow UI). Live-verified fix
  // (soorya, Inventory build 2026-07-03) — supersedes the "list data API is closed" lesson.
  await pMap(artifacts.filter((x) => x.type === "list"), 4, async (a) => {
    const server = genToServer[a.id];
    const items = a.doc?.ListItems || a.shell?.ListItems;
    if (!server || !Array.isArray(items) || !items.length) return;
    const li = await c.putListItems(server, items);
    if (li.status < 300) (report.listItems = report.listItems || []).push({ id: server, count: items.length });
    else report.errors.push(`list items ${server}: ${li.status} ${JSON.stringify(li.body).slice(0, 120)}`);
    log(`list-items ${server} → ${li.status} (${items.length})`);
  });

  // Reused (pre-existing, from opts.reuse) blob-bearing artifacts don't reach flowMeta via accept()
  // above — they were never "accepted" this run. Register them too so PASS 2's own incremental
  // hash-check (against apply-state.json) can still detect and push a genuine IR change to an
  // already-published flow, instead of that flow being frozen forever once it's in a reuse map.
  // Unchanged ones cost nothing extra: the hash compare below skips them exactly as before.
  for (const a of artifacts) {
    if (a.blob && genToServer[a.id] && !flowMeta.some((fm) => fm.gen === a.id)) {
      flowMeta.push({ type: a.type, gen: a.id, server: genToServer[a.id] });
    }
  }

  // PASS 2 — bodies: graft remapped blob onto the server starter draft, then publish.
  // Parallel (4-wide): flows are independent; genToServer/liveIds are complete after the PASS-1 barrier.
  await pMap(flowMeta, 4, async (fm) => {
    const my = artifacts.find((x) => x.id === fm.gen);
    // INCREMENTAL: unchanged + already-published → skip the whole getDraft/graft/publish round-trip.
    // Hash the REMAPPED blob (the bytes actually published), NOT the gen blob — otherwise a corrected
    // genToServer (a role that failed run 1 but creates fine run 2, or a reconciler repoint) leaves the
    // gen blob byte-identical, the hash matches, and the flow is skipped forever with the stale mapping.
    const remapped = remap(my.blob, genToServer);
    const hash = blobHash(remapped);
    if (!force && manifest[fm.gen] === hash) { report.published.push(fm.server); report.skipped.push(fm.server); log(`body ${fm.server} → skip (unchanged, already published)`); return; }
    const starter = await c.getDraft(fm.type, fm.server);
    if (starter.status >= 300) { report.errors.push(`getDraft ${fm.server} → ${starter.status}`); return; }
    const merged = { ...starter.body };
    for (const [k, v] of Object.entries(remapped)) {
      if (k === "Root") continue;
      merged[k] = k === fm.server ? { ...starter.body[fm.server], ...v, Id: fm.server } : v;
    }
    merged.Root = fm.server;
    // VALIDATE BEFORE PUBLISH — turn the opaque 500 into a legible diagnostic (now incl. publish-invariants).
    const within = blobErrors(validateBlob({ label: fm.server, blob: merged }));
    const dangling = crossRefs(merged).filter((r) => !liveIds.has(r));
    if (within.length || dangling.length) {
      report.errors.push(`${fm.server}: not published — ${within.map((i) => i.code).join(",")}${dangling.length ? " dangling cross-ref(s): " + dangling.join(", ") : ""}`);
      log(`body ${fm.server} → SKIPPED (invalid: ${within.length} structural, ${dangling.length} dangling refs: ${dangling.join(",")})`);
      return;
    }
    const pd = await c.putDraft(fm.type, fm.server, merged);
    const pub = pd.status < 300 ? await c.publish(fm.type, fm.server) : { status: -1 };
    if (pub.status < 300) { report.published.push(fm.server); manifest[fm.gen] = hash; saveManifest(); log(`body ${fm.server} → draft ${pd.status}, publish ${pub.status}`); }
    else {
      // opaque 500 with a clean pre-flight → auto-localize the culprit field (bounded live bisection).
      const culprit = pub.status >= 300 && opts.localize500 !== false ? await localize500(c, fm, merged) : undefined;
      const diag = culprit ? ` — likely culprit field: '${culprit}'` : (culprit === null ? " — no single-field culprit (whole-flow / platform 500 — escalate)" : "");
      report.errors.push(`${fm.type} ${fm.server}: draft=${pd.status} publish=${pub.status}${diag} ${JSON.stringify(pd.status >= 300 ? pd.body : pub.body).slice(0, 200)}`);
      log(`body ${fm.server} → draft ${pd.status}, publish ${pub.status}${diag}`);
    }
  });

  // PASS 2.5 — CASEFLOW STATUSES for board flows. buildBoard emits a separate `caseflow` artifact
  // (the designed lifecycle statuses); the case's model publish above does NOT carry them, so without
  // this the board keeps the default New/In-progress/Closed and every designed status is unreachable
  // (hire-onboarding 2026-07-05: all 6 board journeys blocked). Swap statuses on the case's caseflow
  // draft, mirroring applyBoardLive. Runs after the model is published (statuses reference the model).
  for (const cf of artifacts.filter((a) => a.type === "caseflow")) {
    const caseServer = genToServer[cf.parentModel];
    if (!caseServer) { report.errors.push(`caseflow ${cf.id}: parent case ${cf.parentModel} not created`); continue; }
    const meta = await c.call("GET", `/flow/2/${acc}/case/${caseServer}?_application_id=${appId}`);
    const cfId = meta.body?._default_workflow_id;
    if (!cfId) { report.errors.push(`caseflow ${cf.id}: no _default_workflow_id on ${caseServer}`); continue; }
    const cfd = (await c.call("GET", `/metadata/2/${acc}/case/${caseServer}/caseflow/${cfId}/draft`)).body;
    if (!cfd?.Root) { report.errors.push(`caseflow ${caseServer}: draft unreadable`); continue; }
    const remapped = remap(cf.blob, genToServer);
    const scf = cfd[cfd.Root], mye = remapped[remapped.Root];
    for (const id of [...(scf["CaseFlow::Status"] || []), ...(scf["CaseFlow::State"] || [])]) delete cfd[id];
    for (const id of [...(mye["CaseFlow::Status"] || []), ...(mye["CaseFlow::State"] || [])]) cfd[id] = remapped[id];
    scf["CaseFlow::Status"] = mye["CaseFlow::Status"] || []; scf["CaseFlow::State"] = mye["CaseFlow::State"] || [];
    const pd = await c.call("PUT", `/metadata/2/${acc}/case/${caseServer}/caseflow/${cfId}/draft`, cfd);
    const pub = pd.status < 300 ? await c.call("POST", `/metadata/2/${acc}/case/${caseServer}/caseflow/${cfId}/publish`, {}) : { status: -1 };
    log(`caseflow ${caseServer} → statuses ${(mye["CaseFlow::Status"] || []).length}, draft ${pd.status}, publish ${pub.status}`);
    if (pub.status >= 300) report.errors.push(`caseflow ${caseServer}: draft=${pd.status} publish=${pub.status}`);
  }

  // PAGES + app finalize: create a page per IR page, set DefaultPage, publish the app so it's
  // end-user-runnable. (Page-graph content is a follow-up; shells make the app valid + visible.)
  //
  // AI PAGES (DEFAULT): generate role dashboards via Kissflow's OWN AI page generator instead of the
  // template buildPage → transformPageReal path — richer, natively correct pages that bind to the app's
  // real flows. ON by default; opt OUT with opts.aiPages:false or KF_AI_PAGES=0. Handled below (after
  // roleIdByName is built); the template page loop + nav-build + app-finalize below self-skip because
  // pageServerByName/firstPage stay empty. See ai-page-builder.mjs. Base IR-permission grants still run.
  const aiPages = opts.aiPages ?? (process.env.KF_AI_PAGES !== "0");
  let firstPage = null;
  const pageServerByName = { ...(opts.reuse?.pageServerByName || {}) }; // seed already-built pages in reuse mode

  // A CASE NEEDS A BOARD PAGE. Without one it is created, published, full of designed statuses — and
  // completely unreachable: nothing may embed it. Native-page embedding excludes Case, and the
  // AI-page stub resolver drops Case-bound widgets, both for the same correct reason — a Case is not a
  // table. But "not a table" was treated as "no UI at all", so the board silently had no way in. The
  // Kanban IS its view; give every Case the page /add-board has always given it.
  // Best-effort: a page that fails to build must not fail an otherwise-good apply.
  for (const cf of artifacts.filter((a) => a.type === "caseflow")) {
    const caseServer = genToServer[cf.parentModel] || cf.parentModel;
    const label = (artifacts.find((a) => a.id === cf.parentModel) || {}).name
      || String(cf.parentModel).replace(/_A\d+$/, "").replace(/_/g, " ");
    const pname = `${label} Board`;
    if (!caseServer || pageServerByName[pname]) continue;
    try {
      const { applyKanbanPage } = await import("./board-live.mjs");
      const kp = await applyKanbanPage(c, acc, appId, { name: pname, caseId: caseServer, title: pname, itemLabel: label });
      if (kp.pageId) {
        pageServerByName[pname] = kp.pageId;
        firstPage = firstPage || kp.pageId;
        report.created.push({ type: "page", gen: `${cf.parentModel}_board`, server: kp.pageId });
      } else report.errors.push(`board page ${pname}: ${kp.error || JSON.stringify(kp.steps)}`);
      log(`board page ${pname} → ${kp.pageId || "FAILED"} ${JSON.stringify(kp.steps)}`);
    } catch (e) { report.errors.push(`board page ${pname}: ${e.message}`); }
  }

  for (const p of aiPages ? [] : artifacts.filter((a) => a.type === "page")) {
    const pname = p.shell?.Name || p.id;
    let sid = pageServerByName[pname];
    if (sid) { firstPage = firstPage || sid; log(`page ${p.id} → ${sid} (exists, skip create + content)`); continue; }
    const pr = await c.call("POST", `/flow/2/${acc}/application/${appId}/page/`, { Name: pname });
    if (pr.status >= 300 || !pr.body?._id) { report.errors.push(`page ${p.id} create failed: ${pr.status}`); continue; }
    sid = pr.body._id; firstPage = firstPage || sid;
    pageServerByName[pname] = sid;
    report.created.push({ type: "page", gen: p.id, server: sid });
    // build + publish the page CONTENT via Kissflow's REAL transformer (page_transform.py).
    // Flow refs in the intermediate are gen ids → remap to server ids before transforming.
    if (p.intermediate) {
      const pbase = `/metadata/2/${acc}/application/${appId}/page/${sid}`; // page metadata is APP-SCOPED
      const inter = remap(p.intermediate, genToServer);
      const meta = fixProcessTables(transformPageReal(inter, appId, sid, log));
      if (!meta) { report.errors.push(`page ${sid}: transformer failed`); log(`page ${p.id} → ${sid}, transformer FAILED`); continue; }
      const pd = await c.call("PUT", `${pbase}/draft`, meta);
      const pub = pd.status < 300 ? await c.call("POST", `${pbase}/publish`, {}) : { status: -1 };
      if (pub.status < 300) report.published.push(sid);
      else report.errors.push(`page ${sid}: content draft=${pd.status} publish=${pub.status} ${JSON.stringify(pd.body).slice(0, 80)}`);
      log(`page ${p.id} → ${sid}, content draft ${pd.status}, publish ${pub.status}`);
    }
  }
  if (firstPage && !opts.reuse) {
    const am = await c.call("GET", `/metadata/2/${acc}/application/${appId}/draft`);
    if (am.status < 300 && am.body?.Root) {
      am.body[am.body.Root].DefaultPage = firstPage;
      await c.call("PUT", `/metadata/2/${acc}/application/${appId}/draft`, am.body);
      const ap = await c.call("POST", `/metadata/2/${acc}/application/${appId}/publish`, {});
      report.appPublished = ap.status < 300;
      log(`app finalize: DefaultPage=${firstPage}, publish ${ap.status}`);
    }
  }
  // ROLE MAPPING — grant each role member access to its mapped flows (the flow's `member` list).
  // member = {_id, Name, Kind:"AppRole", Role:"Member", Permission}. Process flows get
  // InitiateItems (can raise requests; View when read-only); forms get Delete (full access).
  const roleIdByName = {};
  for (const r of report.roles) if (r.id) roleIdByName[r.name] = r.id;
  // AI PAGES branch — generate one AI dashboard per role (async create→preview→generate→publish),
  // wire landings + app default + Home nav, and grant each role its page-bound flows. Runs before the
  // base IR-permission grants below (which add the full permission-matrix access) and before the
  // template nav block (skipped: pageServerByName is empty in AI mode, so the AI-wired nav survives).
  if (aiPages) {
    const { generateAppPagesAI } = await import("./ai-page-builder.mjs");
    const ai = await generateAppPagesAI(c, acc, appId, ir, { roleIdByName, log, concurrency: opts.aiConcurrency || 4 });
    // TRUTHFUL reporting (2026-08-17, #10): appPublished is what the publish call actually returned,
    // not an assumption; per-role failures are surfaced, not filtered to null. A run where pages
    // failed to publish now SAYS so instead of exiting green with no dashboards.
    report.aiPages = ai.results.map((r) => ({ role: r.role.name, page: r.pid, grants: r.grants, ok: r.ok, error: r.error || null }));
    report.aiPagesFailed = ai.failed.map((r) => ({ role: r.role.name, error: r.error }));
    report.appPublished = ai.appPublished && ai.failed.length === 0;
    if (ai.failed.length) { const msg = `AI pages: ${ai.failed.length}/${ai.results.length} role page(s) FAILED — ${ai.failed.map((r) => `${r.role.name} (${r.error})`).join("; ")}`; log(`  ⚠ ${msg}`); report.errors.push(msg); }
  }
  // Case AND Board classify as the "case" family server-side (Board is a Case flow with a Kanban
   // view). Missing "Board" here → grants POST to /form/… → 404, and the board renders with zero
   // members (hire-onboarding 2026-07-05). Boards additionally need Permission:[] (Delete rejected).
  const fam = (t) => (t === "Process" ? "process" : (t === "Case" || t === "Board") ? "case" : "form");
  report.members = [];
  // report lists were re-fetched for EVERY role×flow pair (measured: 3× per flow on P2P) — cache per flow
  const reportListCache = new Map();
  const reportsOf = async (fam2, serverFlow) => {
    if (!reportListCache.has(serverFlow)) {
      const r = await c.call("GET", `/flow/2/${acc}/${fam2}/${serverFlow}/report?_application_id=${appId}`);
      reportListCache.set(serverFlow, Array.isArray(r.body) ? r.body : []);
    }
    return reportListCache.get(serverFlow);
  };
  await pMap(ir.permissions || [], 5, async (perm) => {
    const roleId = roleIdByName[perm.role];
    const fSpec = (ir.forms || []).find((f) => (f.id || f.name) === perm.model);
    const serverFlow = fSpec && genToServer[fSpec.id || `${slug(fSpec.name)}_A00`];
    if (!roleId || !serverFlow) return;
    const ft = fSpec.flowType || "Form";
    // member object MUST carry _application_id in the body (not just the query param), and Role is
    // Member (edit) or Viewer (read). Valid permissions by flow type: Process → InitiateItems|View;
    // Form → Delete|View.
    const editable = (perm.level || "Editable") !== "ReadOnly";
    // Case/Board owner (sole mover / coordinator) → Admin; see flowGrant + security slice intent.
    const admin = /admin|owner|sole mover|coordinat/i.test(perm.intent || "");
    // What makes a table/list COMPONENT render data is the flow's REPORT access, granted below.
    const g = flowGrant(ft, { editable, admin });
    const member = { _id: roleId, Name: perm.role, _application_id: appId, Role: g.role, Permission: g.permission, Kind: "AppRole" };
    // 423 RETRY — this loop runs pMap(…, 5, …), so ≥2 roles on the same flow race the same
    // access-control mutex and one 423s (Locked) with no automatic retry, silently leaving that
    // role with Permission:[] — "unable to raise items at all" for a Process (see flowGrant above).
    // patch.mjs's grantAccess already retries this exact call once; this loop never did (found
    // building bug-tracker: Developer + QA Lead both 423'd, apply reported 0 errors regardless
    // because a non-2xx member grant was never pushed to report.errors). Same one-retry pattern.
    let m = await c.call("POST", `/flow/2/${acc}/${g.family}/${serverFlow}/member/batch?_application_id=${appId}`, [member]);
    if (m.status === 423) { await new Promise((r) => setTimeout(r, 1500)); m = await c.call("POST", `/flow/2/${acc}/${g.family}/${serverFlow}/member/batch?_application_id=${appId}`, [member]); }
    report.members.push({ role: perm.role, model: perm.model, status: m.status });
    log(`access ${perm.role} → ${perm.model} (${g.family}) ${m.status}`);
    if (m.status >= 300) report.errors.push(`member grant ${perm.role} → ${perm.model} (${g.family}) failed: ${m.status}`);
    // REPORT "View report" access — THIS is what makes a table/list component render data.
    // Verified from the UI: Role:Member, Permission:["View"] (= "View report"; [] = No access,
    // "ManageReports" → UnsupportedPermissionError). Reports accept Role "Member"/"Admin" only.
    for (const rep of await reportsOf(g.family, serverFlow)) {
      let rm = await c.call("POST", `/flow/2/${acc}/${g.family}/${serverFlow}/report/${rep._id}/member/batch?_application_id=${appId}`,
        [{ _id: roleId, Name: perm.role, _application_id: appId, Role: "Member", Permission: ["View"], Kind: "AppRole" }]);
      if (rm.status === 423) { await new Promise((r) => setTimeout(r, 1500)); rm = await c.call("POST", `/flow/2/${acc}/${g.family}/${serverFlow}/report/${rep._id}/member/batch?_application_id=${appId}`, [{ _id: roleId, Name: perm.role, _application_id: appId, Role: "Member", Permission: ["View"], Kind: "AppRole" }]); }
      if (rm.status < 300) log(`  report ${rep.Name} → ${perm.role} View report`);
    }
    // FORMVIEW access — the third leg (flow, report, formview), and the one nobody sees missing:
    // a Form table widget is a formview consumer, and without this grant the runtime's
    // GET formview/<id> 403s while the report AND the data query succeed — the table then renders
    // "You don't have permission to access this component" (PulseFit, 2026-07-31).
    if (g.family === "form") {
      const fvs = await c.call("GET", `/flow/2/${acc}/form/${serverFlow}/formview/?_application_id=${appId}`).catch(() => ({ body: [] }));
      for (const fv of (Array.isArray(fvs.body) ? fvs.body : [])) {
        await c.call("POST", `/flow/2/${acc}/form/${serverFlow}/formview/${fv._id}/member/batch?_application_id=${appId}`,
          [{ _id: roleId, Name: perm.role, _application_id: appId, Role: "Viewer", Permission: [], Kind: "AppRole" }]).catch(() => {});
      }
    }
  });

  // NAV + ROLE PREFERENCE — the trifecta that makes a role actually see its app. Without the
  // role's Preference{DefaultPage,DefaultNavigation} the role renders BLANK regardless of access.
  // Build nav LAST (creating pages regenerates the app nav and wipes custom VisibleTo).
  if (Object.keys(pageServerByName).length) {
    // PAGE-DRIVEN ACCESS — grant each page's role access to EVERY flow its components reference,
    // not just what the IR permissions list (a dashboard often shows a flow the role wasn't
    // explicitly granted, e.g. an Admin console showing the PO process → else "no access to
    // this component"). Process → Member[InitiateItems,View]; Form → Member[Delete]; + reports.
    const flowServerByName = {};
    for (const f of ir.forms || []) { const sid = genToServer[f.id || `${slug(f.name)}_A00`]; if (sid) flowServerByName[f.name] = { id: sid, type: f.flowType || "Form" }; }
    const pageByName = {}; for (const p of ir.pages || []) pageByName[p.name] = p;
    const flowsOf = (pn) => [...new Set((pageByName[pn]?.cards || []).map((c2) => c2.source_flow).filter(Boolean))];
    // (role → flows) access pairs: a role needs access to every flow on a page it can SEE — that's
    // its own dashboard (page.role) AND every nav sub-menu it's VisibleTo (process-organized nav).
    const want = [];
    for (const p of ir.pages || []) if (p.role) want.push({ role: p.role, flows: flowsOf(p.name) });
    for (const m of (ir.nav?.menus) || []) for (const sub of m.submenus || []) for (const r of (sub.visibleTo || sub.roles || [])) want.push({ role: r, flows: flowsOf(sub.page) });
    const doneAcc = new Set();
    for (const w of want) {
      const role = roleIdByName[w.role]; if (!role) continue;
      for (const fn of w.flows) {
        const f = flowServerByName[fn]; if (!f) continue;
        const key = role + "::" + f.id; if (doneAcc.has(key)) continue; doneAcc.add(key);
        const fCase = f.type === "Case" || f.type === "Board";
        const fm = f.type === "Process" ? "process" : fCase ? "case" : "form";
        const perms = f.type === "Process" ? ["InitiateItems"] : fCase ? [] : ["Delete"]; // Process=InitiateItems (golden); Case member=[] (Delete rejected); Form edit=["Delete"]
        await c.call("POST", `/flow/2/${acc}/${fm}/${f.id}/member/batch?_application_id=${appId}`, [{ _id: role, Name: w.role, _application_id: appId, Role: "Member", Permission: perms, Kind: "AppRole" }]);
        // report "View report" (Permission:["View"]) — required for the page's table to show data
        const reps = await c.call("GET", `/flow/2/${acc}/${fm}/${f.id}/report?_application_id=${appId}`);
        for (const rep of (Array.isArray(reps.body) ? reps.body : [])) await c.call("POST", `/flow/2/${acc}/${fm}/${f.id}/report/${rep._id}/member/batch?_application_id=${appId}`, [{ _id: role, Name: w.role, _application_id: appId, Role: "Member", Permission: ["View"], Kind: "AppRole" }]);
      }
    }
    const am = await c.call("GET", `/metadata/2/${acc}/application/${appId}/draft`);
    const b = am.body;
    if (am.status < 300 && b?.Root) {
      const nav = Object.values(b).find((e) => e && e.Kind === "Navigation");
      const menu = Object.values(b).find((e) => e && e.Kind === "Menu");
      if (nav && menu) {
        // clear ALL existing menus + submenus, then rebuild fresh
        for (const sm of Object.values(b).filter((e) => e && e.Kind === "SubMenu")) {
          for (const fid of sm["SubMenu::FieldMapping"] || []) { for (const pid of b[fid]?.["FieldMapping::Property"] || []) delete b[pid]; delete b[fid]; }
          delete b[sm.Id];
        }
        for (const me of Object.values(b).filter((e) => e && e.Kind === "Menu" && e.Id !== menu.Id)) delete b[me.Id];
        let n = 0, mc = 0;
        const addSub = (menuEnt, name, pageName, roles) => {
          const page = pageServerByName[pageName]; if (!page) return false;
          const smId = `SubMenu_kfa${++n}`, fmId = `FieldMapping_kfa${n}`, prId = `Property_kfa${n}`;
          b[smId] = { Id: smId, Kind: "SubMenu", Name: name, Menu: menuEnt.Id, VisibleTo: roles, "SubMenu::FieldMapping": [fmId] };
          b[fmId] = { Id: fmId, Kind: "FieldMapping", Name: "Page", SubMenu: smId, "FieldMapping::Property": [prId] };
          b[prId] = { Id: prId, Kind: "Property", Type: "Page", Value: page, FieldMapping: fmId };
          menuEnt["Menu::SubMenu"].push(smId);
          return true;
        };
        if (ir.nav && Array.isArray(ir.nav.menus) && ir.nav.menus.length) {
          // PROCESS-ORGANIZED nav: a Menu per ir.nav.menus entry → sub-menus (My Requests/Approvals)
          const menuIds = [];
          for (const mSpec of ir.nav.menus) {
            const menuId = mc === 0 ? menu.Id : `Menu_kfa${mc}`;
            const mEnt = mc === 0 ? menu : { Id: menuId, Kind: "Menu", Navigation: nav.Id }; mc++;
            mEnt.Name = mSpec.name; mEnt["Menu::SubMenu"] = []; b[menuId] = mEnt;
            const seen = new Set();
            for (const sub of mSpec.submenus || []) {
              const roles = [...new Set((sub.visibleTo || sub.roles || []).map((r) => roleIdByName[r]).filter(Boolean))];
              if (addSub(mEnt, sub.name, sub.page, roles)) roles.forEach((r) => seen.add(r));
            }
            mEnt.VisibleTo = [...seen];
            if (mEnt["Menu::SubMenu"].length) menuIds.push(menuId);
          }
          nav["Navigation::Menu"] = menuIds;
        } else {
          // fallback: one menu, a submenu per role dashboard
          menu.Name = menu.Name || "Home"; menu["Menu::SubMenu"] = []; menu.VisibleTo = Object.values(roleIdByName);
          for (const irPage of ir.pages || []) { const role = roleIdByName[irPage.role]; if (role) addSub(menu, irPage.name, irPage.name, [role]); }
          nav["Navigation::Menu"] = [menu.Id];
        }
        const nd = await c.call("PUT", `/metadata/2/${acc}/application/${appId}/draft`, b);
        const np = nd.status < 300 ? await c.call("POST", `/metadata/2/${acc}/application/${appId}/publish`, {}) : { status: -1 };
        log(`nav: ${(nav["Navigation::Menu"] || []).length} menus / ${n} sub-menus, draft ${nd.status} publish ${np.status}`);
        // role Preference{DefaultPage, DefaultNavigation} — DefaultPage = the role's landing dashboard
        // (a page flagged `landing`/`dashboard` for this role, else any page for it).
        report.preferences = [];
        for (const [roleName, roleId] of Object.entries(roleIdByName)) {
          const landing = (ir.pages || []).find((p) => p.role === roleName && (p.landing || p.dashboard)) || (ir.pages || []).find((p) => p.role === roleName);
          const page = landing && pageServerByName[landing.name];
          if (!page) continue;
          const pf = await c.call("PUT", `/app_role/2/${acc}/${roleId}?_application_id=${appId}`,
            { Name: roleName, Preference: { DefaultPage: page, DefaultNavigation: nav.Id }, _application_id: appId });
          report.preferences.push({ role: roleName, page: landing.name, status: pf.status });
          log(`role pref ${roleName} → home ${landing.name} ${pf.status}`);
        }
      }
    }
  }

  // FLOW-STITCH AUTOMATIONS — CREATED live (draft-mapped + published) but NEVER activated.
  // Verified npd-plm 2026-07-03: create + trigger/action wiring + best-effort field maps + publish all
  // work with a standard public API key via applyIntegrationResolved; ONLY the on/off toggle and
  // email-connection provisioning need Integration-Admin. Unmappable bindings (e.g. email To/Subject/
  // Body) are reported and finished in the builder; every integration ships IsActive:false — an admin
  // reviews the mapping (INT-C1 ._id subpaths) and turns it on. Idempotent: existing names are skipped.
  const autos = artifacts.filter((a) => a.type === "integration");
  if (autos.length) {
    const { resolveConnectors, resolveConnections, applyIntegrationResolved } = await import("./integrations.mjs");
    let ictx = null;
    try {
      const connectors = await resolveConnectors(c, acc);
      let connections;
      try { connections = await resolveConnections(c, acc); } catch { /* connection-read may need Integration-Admin */ }
      const flows = {};
      for (const f of ir.forms || []) {
        const key = f.id || f.name;
        const server = genToServer[key] || genToServer[`${slug(f.name)}_A00`];
        if (!server) continue;
        flows[key] = { id: server, display: f.name, fields: (f.fields || []).map((x) => ({ id: x.id || slug(x.name), name: x.name, type: x.type })) };
      }
      // flowTypeOf: resolveSkeleton keys the CONNECTOR off the flow's type (Board/Case → Kissflow Board
      // connector, Process → Kissflow Process). Without it everything defaulted to Process — a create into
      // a Board target would wire CreateAndSubmitItem on the WRONG connector (hire-onboarding AR-8, 2026-07-05).
      const flowTypeOf = (ref) => { const f = (ir.forms || []).find((x) => (x.id || x.name) === ref || x.name === ref || x.id === ref); return f?.flowType || "Process"; };
      ictx = { flows, connectors, flowTypeOf, connections: connections && Object.keys(connections).some((k) => !k.startsWith("_")) ? connections : undefined };
    } catch (e) { log(`automations: connector resolution failed (${String(e.message || e).slice(0, 80)}) — all deferred to builder`); }
    const existing = await c.call("GET", `/flow/2/${acc}/integration?_application_id=${appId}`);
    const existingByName = new Map((Array.isArray(existing.body) ? existing.body : existing.body?.Data || []).map((i) => [i.Name, i._id]));
    report.automations = [];
    for (const a of autos) {
      const name = a.shell?.Name;
      if (existingByName.has(name)) { report.automations.push({ name, id: existingByName.get(name), status: "exists" }); log(`automation ${name} → ${existingByName.get(name)} (already exists — skipped)`); continue; }
      if (!ictx) { report.automations.push({ name, status: "deferred" }); continue; }
      const rep = await applyIntegrationResolved(c, acc, appId, a.automation, ictx);
      const ok = (rep.steps?.publish || 500) < 300;
      report.automations.push({ name, id: rep.id, status: ok ? "created (inactive)" : "partial", steps: rep.steps, unresolved: rep.unresolved });
      log(`automation ${name} → ${rep.id || "?"} ${ok ? "created+published, IsActive:false — review mapping & turn on in builder" : "PARTIAL " + JSON.stringify(rep.steps)}${rep.unresolved ? " · deferred mappings: " + rep.unresolved.join(", ") : ""}`);
    }
  }

  // READ-AFTER-WRITE verify via explore (create returns 200 even when it drops fields)
  const ex = await c.explore();
  if (Array.isArray(ex.body)) {
    const mine = ex.body.filter((f) => f._application_id === appId);
    report.verified = { nestedInApp: mine.length, flows: mine.map((f) => `${f._id}(${f.Status})`) };
  }
  // persist the gen→server id map next to the run — the reliable app→flows tie the import/reconciler
  // needs to fetch each flow's LIVE blob later (explore has no app id; names collide across rebuilds).
  // This UPDATES the crash-safe stub written right after createApp with the full flow-id map.
  persistIdMap({ app: appId, genToServer });
  return report;
}
