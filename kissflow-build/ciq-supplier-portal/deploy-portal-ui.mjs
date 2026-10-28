// Deploy a custom UI zip into the PORTAL's Application custom component (portal-aware version of the old engine's
// deploy-ui.mjs ZIP mode). Reuses the portal's existing Application component; never touches the app container.
//   node kissflow-build/ciq-supplier-portal/deploy-portal-ui.mjs <path/to/bundle.zip>
// Every request goes to deploy-requests.jsonl (no credentials; the signed storage URL is never logged).
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
import { PORTAL } from "./portal-spec.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const zipPath = process.argv[2];
if (!zipPath) { console.error("usage: deploy-portal-ui.mjs <zip>"); process.exit(1); }
const w = writer(here("./deploy-requests.jsonl"));
const A = w.acc, P = PORTAL, cbase = `/application/2/${A}/${P}/component/custom`;
const out = { at: new Date().toISOString(), zip: basename(zipPath), steps: {} };
const step = (k, v) => { out.steps[k] = v; console.log(k, JSON.stringify(v).slice(0, 300)); };

// 0) custom UI must already be enabled on the portal (read-only check; the flag lives under /flow/2/{acc}/portal/{id})
const flag = await w.call("GET", `/flow/2/${A}/portal/${P}`);
step("customUiEnabled", { status: flag.status, enabled: flag.body?._is_custom_ui_enabled });
if (flag.body?._is_custom_ui_enabled !== true) { console.error("Custom UI is not enabled on the portal — enable it in the portal Settings → Custom UI first."); process.exit(2); }

// 1) the single Application component (reuse)
const list = await w.call("GET", `${cbase}/list?page_number=1&page_size=300&Category=Application`);
const comps = (Array.isArray(list.body) ? list.body : list.body?.Data || []).filter((c) => c.Category === "Application");
step("components", { status: list.status, count: comps.length, ids: comps.map((c) => c._id) });
if (comps.length !== 1) { console.error("Expected exactly one Application component in the portal; stopping."); process.exit(3); }
const componentId = comps[0]._id;

// 2) upload: init → PUT bytes to the signed URL → trigger → poll
const bytes = readFileSync(zipPath), fileName = basename(zipPath), size = bytes.length;
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const rb = randomBytes(10); let aid = "Attach_"; for (let i = 0; i < 10; i++) aid += B62[rb[i] % 62];
const reqKey = `/${P}/component/${componentId}/${aid}/${fileName}`;
const init = await w.call("POST", `/upload/2/${A}/?_application_id=${P}`, { name: fileName, size, key: reqKey, mimeType: "application/zip" });
step("uploadInit", { status: init.status, gotUrl: !!init.body?.Url, key: init.body?.Key, error: init.status >= 300 ? init.body : undefined });
if (init.status >= 300 || !init.body?.Url) { writeFileSync(here("./deploy-report.json"), JSON.stringify(out, null, 2)); process.exit(4); }
const put = await fetch(init.body.Url, { method: "PUT", headers: { "Content-Type": "application/zip" }, body: bytes });
step("blobPut", { status: put.status, host: new URL(init.body.Url).host });
if (put.status >= 300) { writeFileSync(here("./deploy-report.json"), JSON.stringify(out, null, 2)); process.exit(5); }
const now = new Date().toISOString();
const storedKey = init.body.Key || reqKey.replace(/^\//, "");
const trig = await w.call("POST", `${cbase}/${componentId}/trigger?_application_id=${P}`, [{ uploaded: 100, name: fileName, id: aid, key: storedKey, size, fileExtension: "zip", _modified_at: now, _created_at: now }]);
step("trigger", { status: trig.status, body: trig.status >= 300 ? trig.body : undefined });
let final = "unknown";
for (let i = 0; i < 60; i++) {
  const s = await w.call("GET", `${cbase}/${componentId}/upload/status`);
  final = s.body && typeof s.body === "object" ? s.body.Status : undefined;
  if (final === "Completed" || final === "Failed" || !["Started", "InProgress"].includes(final)) { step("uploadStatus", { status: s.status, final, body: final === "Failed" ? s.body : undefined }); break; }
  await new Promise((r) => setTimeout(r, 1500));
}

// 3) publish the component (Source Zip), then read back
const pub = await w.call("POST", `${cbase}/${componentId}/publish?_application_id=${P}`, { Source: "Zip" });
step("publish", { status: pub.status, body: pub.status >= 300 ? pub.body : undefined });
const after = await w.call("GET", `${cbase}/list?page_number=1&page_size=300&Category=Application`);
const c = (Array.isArray(after.body) ? after.body : []).find((x) => x._id === componentId) || {};
const man = await w.call("GET", `${cbase}/${componentId}/manifest/draft`);
step("readBack", { componentStatus: c.Status, manifestSource: man.body?.Source, scriptsWeb: man.body?.scripts?.web ? "set" : "empty", zipFileName: man.body?.scripts?.ZipFileName || man.body?.ZipFileName, publishedJsonPath: man.body?.PublishedJsonPath ? "set" : null });
out.runtimeUrl = `https://${w.kf.domain}/view/portal/${P}`;
writeFileSync(here("./deploy-report.json"), JSON.stringify(out, null, 2));
