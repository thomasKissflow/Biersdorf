// Package dist-workbench/workbench.html as a Kissflow custom UI zip: index.html + manifest.json
// (WORKBENCH-DESIGN.md §10; copied from zip-portal.mjs).
// - Strips `crossorigin` from the script tag only; the inlined bundle text is never touched.
// - Moves the inlined module script from <head> to the end of <body>, so the static branded loader paints first.
// - Stamps the content hash into the zip name.
// Guards (the build fails if one trips): zip > 5 MB; an X-Access-Key string (any case) in index.html; the harness
// marker __WB_HARNESS_ONLY__ in index.html; index.html lacking the build stamp written by vite.workbench.config.ts;
// any deny-list hit (scripts/workbench-deny.mjs: Kissflow hosts, auth headers, internal names, test ids and doc
// references; review fix F-09).
// Reads nothing but dist-workbench/: no .env, no credentials.
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { denyHits } from "./workbench-deny.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist-workbench");
const src = path.join(dist, "workbench.html");
const fail = (msg) => {
  console.error(`zip-workbench: ${msg}`);
  process.exit(1);
};
if (!existsSync(src)) fail("dist-workbench/workbench.html is missing: run vite build -c vite.workbench.config.ts first");
let html = readFileSync(src, "utf8");
const open = html.match(/<script type="module"[^>]*>/);
if (!open || open.index === undefined) fail("no inlined module script in workbench.html");
const end = html.indexOf("</script>", open.index); // an inline script can't contain "</script>": the first one ends it
const bodyEnd = html.lastIndexOf("</body>");
if (end < 0 || bodyEnd < end) fail("unexpected workbench.html layout: module script not in <head>");
const block = open[0].replace(/\scrossorigin(="[^"]*")?/g, "") + html.slice(open.index + open[0].length, end + "</script>".length);
html = html.slice(0, open.index) + html.slice(end + "</script>".length, bodyEnd) + block + "\n" + html.slice(bodyEnd);
if (html.indexOf('id="root"') > html.indexOf('<script type="module"')) fail("the loader must come before the bundle");

// ---- guards
if (/x-access-key/i.test(html)) fail("index.html contains an X-Access-Key string");
if (html.includes("__WB_HARNESS_ONLY__")) fail("index.html contains the harness marker __WB_HARNESS_ONLY__");
const deny = denyHits(html);
if (deny.length) fail(`index.html contains ${deny.length} deny-list hit(s):\n${deny.slice(0, 20).map((h) => `  [${h.kind}] "${h.match}" … ${JSON.stringify(h.context)}`).join("\n")}`);
const stampFile = path.join(dist, "build-stamp.txt");
if (!existsSync(stampFile)) fail("dist-workbench/build-stamp.txt is missing");
const stamp = readFileSync(stampFile, "utf8").trim();
if (!/^\d{4}-\d{2}-\d{2}T/.test(stamp) || !html.includes(stamp)) fail(`index.html does not carry the build stamp ${stamp}`);

const hash = createHash("sha256").update(html).digest("hex").slice(0, 10);
const stage = path.join(dist, "zip");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
writeFileSync(path.join(stage, "index.html"), html);
writeFileSync(path.join(stage, "manifest.json"), JSON.stringify({ Category: "Application", Framework: "React" }));
const zip = path.join(dist, `ciq-workbench-ui-${hash}.zip`);
rmSync(zip, { force: true });
execFileSync("zip", ["-q", "-X", zip, "index.html", "manifest.json"], { cwd: stage });
const size = statSync(zip).size;
const kb = (size / 1024).toFixed(0);
if (size > 5 * 1024 * 1024) {
  rmSync(zip, { force: true });
  fail(`zip is ${kb} KB, over the 5 MB custom UI limit`);
}
writeFileSync(path.join(dist, "latest.txt"), path.basename(zip) + "\n");
console.log(`workbench zip: ${path.relative(root, zip)} (${kb} KB, html sha256 ${hash}, build ${stamp})`);
