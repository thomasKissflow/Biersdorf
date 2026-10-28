// deploy-ui.mjs — deploy our built React bundle as an app's Application custom component and
// enable Custom UI, over access-key REST. Reuses clientFromEnv() from client.mjs (same auth +
// resilient call()). Zero dependencies — Node 18+ globals only (fetch/FormData/Blob) + node:fs.
//
// Two modes:
//   ZIP mode  (default): upload the built bundle programmatically — init a signed storage URL
//              (POST /upload/2/{acc}/), PUT the zip bytes to it, then trigger the component to ingest
//              it. Wired from the live browser flow (see deploy-api/api.md); the init/trigger legs are
//              pending live verification over access-key REST — on failure, fall back to --url mode.
//   --url mode (SIMPLE, certain): point the component manifest at a dev URL (scripts.web + Source:"Url"),
//              publish {Source:"Url"}, delete stale, set the flag. No blob upload. Reliable, recommended.
//
// Frontend references mirrored (READ-ONLY):
//   application/web/src/service/index.js .......... exact endpoints (component/custom/*)
//   builder/settings/custom_ui/component.utils.ts . publishUrlComponent (URL mode end-to-end)
//   builder/settings/custom_ui/zip.upload.tsx ..... ensure/activate/delete-stale Application component
//   builder/custom_components/wizard/editor/zip.uploader.jsx . upload → trigger → poll status loop
//   builder/custom_components/helpers.js .......... updateScriptUrl (manifest scripts.web + Source)

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { clientFromEnv } from "./client.mjs";

const CATEGORY_APPLICATION = "Application"; // CUSTOM_COMPONENT_TYPES.APPLICATION
const FRAMEWORK_REACT = "React";
const SOURCE_ZIP = "Zip"; // COMPONENT_EDITOR_CONSTANTS.ZIP
const SOURCE_URL = "Url"; // COMPONENT_EDITOR_CONSTANTS.URL
const LAYOUT_WEB = "web"; // COMPONENT_MODAL_CONSTANTS.WEB.ID (manifest scripts.web target)
// upload/status Status values — COMPONENT_EDITOR_CONSTANTS.STATUS
const STATUS = { STARTED: "Started", INPROGRESS: "InProgress", COMPLETED: "Completed", FAILED: "Failed" };

const log = (...a) => console.log("  ", ...a);
// Any of the frontend's list responses can be a bare array OR {Data:[...]} — normalize.
const asList = (b) => (Array.isArray(b) ? b : Array.isArray(b?.Data) ? b.Data : []);

/**
 * Deploy the app's Application custom component.
 * @param {object} o
 * @param {string} o.appId
 * @param {string} [o.zipPath]  path to the built React zip (ZIP mode)
 * @param {string} [o.url]      dev URL (URL mode — no blob upload)
 * @param {string} [o.name]     component name (default "App custom UI bundle")
 * @returns {Promise<{componentId:string, mode:string, steps:object, warnings:string[]}>}
 */
export async function deployUI(o = {}) {
  const c = clientFromEnv();
  const acc = c.acc;
  const appId = o.appId;
  if (!appId) throw new Error("--app <appId> is required");
  const mode = o.url ? "url" : "zip";
  if (mode === "zip" && !o.zipPath) throw new Error("zip mode requires <zipPath> (or pass --url <devUrl>)");
  const name = o.name || "App custom UI bundle";
  const cbase = `/application/2/${acc}/${appId}/component/custom`; // component/custom base path
  const steps = {}; const warnings = [];

  // 1) LIST existing custom components, filter to Category:"Application".  (frontend: getCustomComponents
  //    → GET …/component/custom/list?Category=Application). We also accept the plain …/component/custom/
  //    collection endpoint as a fallback, then filter locally by Category.  [live-verified endpoint]
  log(`[1/6] list Application components`);
  let listed = await c.call("GET", `${cbase}/list?page_number=1&page_size=300&Category=${CATEGORY_APPLICATION}`);
  if (listed.status >= 300) listed = await c.call("GET", `${cbase}/`);
  if (listed.status >= 300) { log(`  list failed: ${listed.status} ${JSON.stringify(listed.body).slice(0, 200)}`); throw new Error(`list components failed: ${listed.status}`); }
  const apps = asList(listed.body).filter((x) => x?.Category === CATEGORY_APPLICATION);
  steps.list = { status: listed.status, found: apps.length };
  log(`  found ${apps.length} existing Application component(s)`);

  // 1b) ENABLE Custom UI FIRST — the per-app flag must be ON before a component can be created.
  //     Under the current per-app model, POST …/component/custom/ returns 403 CustomUINotEnabled
  //     otherwise (dev-lcncdemo, verified 2026-07-20 — the old plan gate `YourPlanNotSupport` is
  //     gone; it's now a per-app toggle). Idempotent with the final [6/6] enable below.
  if (!apps.length) {
    log(`[1b] enable Custom UI on app ${appId} (must precede component create)`);
    const preflag = await c.call("PUT", `/flow/2/${acc}/application/${appId}`, { _is_custom_ui_enabled: true });
    steps.enableFirst = { status: preflag.status };
    if (preflag.status >= 300) warnings.push(`pre-enable Custom UI flag: ${preflag.status} ${JSON.stringify(preflag.body).slice(0, 120)}`);
    else log(`  Custom UI enabled ${preflag.status}`);
  }

  // 2) REUSE or CREATE.  Only one Application component is allowed per app — reuse its _id if present,
  //    else POST …/component/custom/ with {Name,Category:"Application",Framework:"React"}.  [live-verified]
  let componentId = apps[0]?._id;
  if (componentId) { steps.component = { status: "reused", id: componentId }; log(`[2/6] reuse component ${componentId}`); }
  else {
    log(`[2/6] create Application component "${name}"`);
    const cr = await c.call("POST", `${cbase}/`, { Name: name, Description: "", Category: CATEGORY_APPLICATION, Framework: FRAMEWORK_REACT, Layout: LAYOUT_WEB, _application_id: appId });
    componentId = cr.body?._id;
    if (cr.status >= 300 || !componentId) { log(`  create failed: ${cr.status} ${JSON.stringify(cr.body).slice(0, 200)}`); throw new Error(`create component failed: ${cr.status}`); }
    steps.component = { status: "created", id: componentId };
    log(`  created ${componentId}`);
  }

  // 3) SOURCE — either upload the zip (ZIP mode) or point the manifest at the dev URL (URL mode).
  if (mode === "url") { steps.source = await pointAtUrl(c, cbase, componentId, o.url); }
  else { steps.source = await uploadZip(c, cbase, componentId, o.zipPath, warnings, appId); }

  // 4) PUBLISH the component to Live.  (frontend: publishComponent → POST …/{id}/publish {Source}).  [live-verified]
  log(`[4/6] publish component (Source:"${mode === "url" ? SOURCE_URL : SOURCE_ZIP}")`);
  const pub = await c.call("POST", `${cbase}/${componentId}/publish?_application_id=${appId}`, { Source: mode === "url" ? SOURCE_URL : SOURCE_ZIP });
  steps.publish = { status: pub.status };
  if (pub.status >= 300) { log(`  publish failed: ${pub.status} ${JSON.stringify(pub.body).slice(0, 200)}`); throw new Error(`publish failed: ${pub.status}`); }
  log(`  published ${pub.status}`);

  // 5) DELETE stale — re-list and remove any OTHER Application components so the runtime's live-list
  //    call finds exactly one.  (frontend: deleteStaleApplicationComponents).  [live-verified]
  log(`[5/6] delete stale Application components`);
  let relisted = await c.call("GET", `${cbase}/list?page_number=1&page_size=300&Category=${CATEGORY_APPLICATION}`);
  if (relisted.status >= 300) relisted = await c.call("GET", `${cbase}/`);
  const stale = asList(relisted.body).filter((x) => x?.Category === CATEGORY_APPLICATION && x._id !== componentId);
  steps.deleteStale = [];
  for (const s of stale) {
    const d = await c.call("DELETE", `${cbase}/${s._id}`);
    steps.deleteStale.push({ id: s._id, status: d.status });
    log(`  deleted ${s._id} → ${d.status}`);
  }
  if (!stale.length) log(`  none`);

  // 6) ENABLE Custom UI — set the app flag. (frontend updateApp → updateApplication("application",…) →
  //    PUT /flow/2/{acc}/application/{appId} {_is_custom_ui_enabled:true}).  [live-verified]
  log(`[6/6] enable Custom UI flag on app ${appId}`);
  const flag = await c.call("PUT", `/flow/2/${acc}/application/${appId}`, { _is_custom_ui_enabled: true });
  steps.enableFlag = { status: flag.status };
  if (flag.status >= 300) { warnings.push(`enable-flag failed: ${flag.status} ${JSON.stringify(flag.body).slice(0, 120)}`); log(`  flag failed: ${flag.status}`); }
  else log(`  Custom UI enabled ${flag.status}`);

  // The app's runtime URL — opening it lands on the custom UI (bare app root redirects to /ui).
  const appUrl = `${c.base}/view/application/${appId}`;
  return { componentId, mode, steps, warnings, appUrl };
}

// URL mode — SIMPLE + CERTAIN. Mirror publishUrlComponent + updateScriptUrl: read the draft manifest,
// set scripts.web = url, Source = "Url" (drop ZipFileName), save it back. Save endpoint mirrors the
// frontend's saveComponent (PUT …/component/custom/{id} {Manifest}); if that's rejected we fall back to
// the manifest/draft PUT. Publishing happens in the shared step 4.  [live-verified endpoints]
async function pointAtUrl(c, cbase, componentId, url) {
  log(`[3/6] point manifest at dev URL: ${url}`);
  const got = await c.call("GET", `${cbase}/${componentId}/manifest/draft`);
  if (got.status >= 300) { log(`  get manifest failed: ${got.status}`); throw new Error(`get manifest failed: ${got.status}`); }
  const manifest = got.body && typeof got.body === "object" ? { ...got.body } : {};
  const scripts = { ...(manifest.scripts || {}) };
  scripts.web = url;              // updateScriptUrl: newManifest[SCRIPTS][WEB] = scriptUrl
  delete scripts.ZipFileName;     // updateScriptUrl (URL source): drop ZipFileName
  manifest.scripts = scripts;
  manifest.Source = SOURCE_URL;   // updateScriptUrl: newManifest[SOURCE] = source
  // saveComponent shape first; manifest/draft PUT as fallback (some deployments accept only the latter).
  let saved = await c.call("PUT", `${cbase}/${componentId}`, { Manifest: manifest });
  if (saved.status >= 300) {
    log(`  saveComponent PUT ${saved.status} — falling back to manifest/draft PUT`);
    saved = await c.call("PUT", `${cbase}/${componentId}/manifest/draft`, manifest);
  }
  if (saved.status >= 300) { log(`  save manifest failed: ${saved.status} ${JSON.stringify(saved.body).slice(0, 200)}`); throw new Error(`save manifest failed: ${saved.status}`); }
  log(`  manifest updated ${saved.status} (scripts.web set, Source:"Url")`);
  return { status: saved.status, url };
}

// Client-side attach id (matches the platform's `Attach_<id>` shape). Only needs to be unique — the
// server uses it purely to build the storage path + echoes it back in the trigger payload.
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const attachId = () => { const b = randomBytes(10); let s = "Attach_"; for (let i = 0; i < 10; i++) s += B62[b[i] % 62]; return s; };

// ZIP mode — programmatic bundle upload, wired from the live browser flow (dev-play, 2026-07-31;
// captured in deploy-api/api.md). Three legs:
//   a) INIT    POST /upload/2/{acc}/?_application_id={appId}  {name,size,key,mimeType}
//              → { Url: <GCS V4 signed PUT url>, Key: <storage path> }
//   b) PUT     the raw zip bytes to that signed Url with Content-Type: application/zip and NO Kissflow
//              auth (the V4 signature covers only content-type;host — the access key is irrelevant here).
//   c) TRIGGER POST {cbase}/{componentId}/trigger  [{uploaded:100,name,id:attachId,key:Key,size,…}]
// then poll upload/status until Completed/Failed.
// NOTE(live-verify): the capture used the browser (CSRF + cookies). The INIT + TRIGGER legs are assumed
// to behave the same over access-key REST (X-Access-Key-*) — verify on a live dev account. If INIT is
// rejected server-to-server, fall back to `--url` mode or a manual Settings → Custom UI zip upload.
async function uploadZip(c, cbase, componentId, zipPath, warnings, appId) {
  const bytes = readFileSync(zipPath);
  const fileName = basename(zipPath);
  const size = bytes.length;
  const acc = c.acc;
  const aid = attachId();
  const reqKey = `/${appId}/component/${componentId}/${aid}/${fileName}`; // leading slash on the request

  // a) INIT — ask the upload service for a signed storage PUT url.
  log(`[3/6] upload zip → init (${fileName}, ${size} bytes)`);
  const init = await c.call("POST", `/upload/2/${acc}/?_application_id=${appId}`, { name: fileName, size, key: reqKey, mimeType: "application/zip" });
  if (init.status >= 300 || !init.body?.Url) {
    const msg = typeof init.body === "string" ? init.body.slice(0, 200) : JSON.stringify(init.body).slice(0, 200);
    throw new Error(
      `upload init failed (POST /upload/2/${acc}/): ${init.status} ${msg}\n` +
      "  If this endpoint isn't reachable over access keys, use `--url <dev/hosted URL>` or upload the\n" +
      "  zip manually in App Builder → Settings → Custom UI."
    );
  }
  const uploadUrl = init.body.Url;
  const storedKey = init.body.Key || reqKey.replace(/^\//, "");

  // b) PUT the raw bytes to the signed url — no Kissflow auth (the signature is self-contained).
  log(`  upload → PUT bytes to signed storage url`);
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/zip" }, body: bytes });
  if (put.status >= 300) { const t = await put.text().catch(() => ""); throw new Error(`blob PUT failed: ${put.status} ${t.slice(0, 200)}`); }

  // c) TRIGGER — tell the component the bundle landed; the server ingests + validates it.
  log(`  upload → trigger ingest`);
  const nowIso = new Date().toISOString();
  const triggerPayload = [{ uploaded: 100, name: fileName, id: aid, key: storedKey, size, fileExtension: "zip", _modified_at: nowIso, _created_at: nowIso }];
  const trig = await c.call("POST", `${cbase}/${componentId}/trigger?_application_id=${appId}`, triggerPayload);
  if (trig.status >= 300) throw new Error(`trigger failed: ${trig.status} ${JSON.stringify(trig.body).slice(0, 200)}`);

  // poll upload/status until Completed / Failed (frontend polls every 3s).  [endpoint confident]
  log(`  poll upload/status`);
  const status = await pollUploadStatus(c, cbase, componentId, warnings);
  return { status: "uploaded", key: storedKey, finalStatus: status };
}

async function pollUploadStatus(c, cbase, componentId, warnings, { intervalMs = 1000, maxTries = 120 } = {}) {
  for (let i = 0; i < maxTries; i++) {
    const r = await c.call("GET", `${cbase}/${componentId}/upload/status`);
    // 204 / empty body = no upload in progress (matches the frontend's isEmpty(data) check).
    const s = r.body && typeof r.body === "object" ? r.body.Status : undefined;
    if (s === STATUS.COMPLETED) { log(`  upload status: Completed`); return STATUS.COMPLETED; }
    if (s === STATUS.FAILED) {
      const msg = JSON.stringify(r.body).slice(0, 300);
      log(`  upload status: Failed — ${msg}`);
      throw new Error(`zip validation Failed: ${msg}`);
    }
    if (![STATUS.STARTED, STATUS.INPROGRESS].includes(s)) {
      // unknown/empty — record and stop rather than loop forever.
      warnings.push(`upload/status returned no recognized Status (got ${JSON.stringify(s)}); assuming done`);
      log(`  upload status: ${JSON.stringify(s)} (no in-progress marker — stopping poll)`);
      return s || "unknown";
    }
    log(`  upload status: ${s} — retry in ${intervalMs}ms (${i + 1}/${maxTries})`);
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  warnings.push("upload/status did not reach Completed within poll window");
  return "timeout";
}
