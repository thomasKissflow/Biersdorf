// Deploy the CIQ Workbench zip into the APP's Application custom component (CIQ_Digital_A00).
// App version of kissflow-build/ciq-supplier-portal/deploy-portal-ui.mjs (same proven upload → trigger → poll → publish path).
// Thomas approved deploying the Workbench (chat, 2026-10-09). Never touches the portal container.
//   node kissflow-build/ciq-digital/deploy-workbench-ui.mjs --check            read-only: custom-UI flag + components
//   node kissflow-build/ciq-digital/deploy-workbench-ui.mjs <path/to/bundle.zip>
// Every request goes to deploy-requests.jsonl (no credentials; the signed storage URL is never logged).
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";

const APP = "CIQ_Digital_A00";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const check = process.argv.includes("--check");
const zipPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!check && !zipPath) { console.error("usage: deploy-workbench-ui.mjs --check | <zip>"); process.exit(1); }
const w = writer(here("./deploy-requests.jsonl"));
const A = w.acc, cbase = `/application/2/${A}/${APP}/component/custom`;
const out = { at: new Date().toISOString(), zip: zipPath ? basename(zipPath) : null, steps: {} };
const step = (k, v) => { out.steps[k] = v; console.log(k, JSON.stringify(v).slice(0, 400)); };
const save = () => writeFileSync(here("./deploy-report.json"), JSON.stringify(out, null, 2));

// 0) custom UI flag on the application (read-only)
const flag = await w.call("GET", `/flow/2/${A}/application/${APP}`);
step("customUiFlag", { status: flag.status, enabled: flag.body?._is_custom_ui_enabled ?? null, keys: Object.keys(flag.body || {}).filter((k) => /custom|ui|deploy/i.test(k)) });

// 1) the Application component(s)
const list = await w.call("GET", `${cbase}/list?page_number=1&page_size=300&Category=Application`);
const comps = (Array.isArray(list.body) ? list.body : list.body?.Data || []).filter((c) => c.Category === "Application");
step("components", { status: list.status, count: comps.length, comps: comps.map((c) => ({ id: c._id, name: c.Name, status: c.Status })) });
if (check) { save(); process.exit(0); }
// 0b) enable Custom UI on the app if it is off — the builder's Settings → Custom UI toggle calls exactly this
//     (old engine deploy-ui.mjs, "[live-verified]": PUT /flow/2/{acc}/application/{appId} {_is_custom_ui_enabled:true}).
if (flag.body?._is_custom_ui_enabled !== true) {
  const en = await w.call("PUT", `/flow/2/${A}/application/${APP}`, { _is_custom_ui_enabled: true });
  const back = await w.call("GET", `/flow/2/${A}/application/${APP}`);
  step("enableCustomUi", { put: en.status, readBack: back.body?._is_custom_ui_enabled ?? null, error: en.status >= 300 ? en.body : undefined });
  if (back.body?._is_custom_ui_enabled !== true) { console.error("Custom UI could not be enabled (read-back not true); stopping."); save(); process.exit(2); }
}
if (comps.length !== 1) { console.error("Expected exactly one Application component in the app; stopping."); save(); process.exit(3); }
const componentId = comps[0]._id;

// 2) upload: init → PUT bytes to the signed URL → trigger → poll
const bytes = readFileSync(zipPath), fileName = basename(zipPath), size = bytes.length;
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const rb = randomBytes(10); let aid = "Attach_"; for (let i = 0; i < 10; i++) aid += B62[rb[i] % 62];
const reqKey = `/${APP}/component/${componentId}/${aid}/${fileName}`;
const init = await w.call("POST", `/upload/2/${A}/?_application_id=${APP}`, { name: fileName, size, key: reqKey, mimeType: "application/zip" });
step("uploadInit", { status: init.status, gotUrl: !!init.body?.Url, key: init.body?.Key, error: init.status >= 300 ? init.body : undefined });
if (init.status >= 300 || !init.body?.Url) { save(); process.exit(4); }
const put = await fetch(init.body.Url, { method: "PUT", headers: { "Content-Type": "application/zip" }, body: bytes });
step("blobPut", { status: put.status, host: new URL(init.body.Url).host });
if (put.status >= 300) { save(); process.exit(5); }
const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const storedKey = init.body.Key || reqKey.replace(/^\//, "");
const trig = await w.call("POST", `${cbase}/${componentId}/trigger?_application_id=${APP}`, [{ uploaded: 100, name: fileName, id: aid, key: storedKey, size, fileExtension: "zip", _modified_at: now, _created_at: now }]);
step("trigger", { status: trig.status, body: trig.status >= 300 ? trig.body : undefined });
let final = "unknown";
for (let i = 0; i < 60; i++) {
  const s = await w.call("GET", `${cbase}/${componentId}/upload/status`);
  final = s.body && typeof s.body === "object" ? s.body.Status : undefined;
  if (final === "Completed" || final === "Failed" || !["Started", "InProgress"].includes(final)) { step("uploadStatus", { status: s.status, final, body: final === "Failed" ? s.body : undefined }); break; }
  await new Promise((r) => setTimeout(r, 1500));
}
if (final !== "Completed") { save(); process.exit(6); }

// 3) publish the component (Source Zip), then read back
const pub = await w.call("POST", `${cbase}/${componentId}/publish?_application_id=${APP}`, { Source: "Zip" });
step("publish", { status: pub.status, body: pub.status >= 300 ? pub.body : undefined });
const after = await w.call("GET", `${cbase}/list?page_number=1&page_size=300&Category=Application`);
const c = (Array.isArray(after.body) ? after.body : after.body?.Data || []).find((x) => x._id === componentId) || {};
const man = await w.call("GET", `${cbase}/${componentId}/manifest/draft`);
step("readBack", { componentStatus: c.Status, manifestSource: man.body?.Source, zipFileName: man.body?.scripts?.ZipFileName || man.body?.ZipFileName, publishedJsonPath: man.body?.PublishedJsonPath ? "set" : null });
out.runtimeUrl = `https://${w.kf.domain}/view/application/${APP}`;
save();
