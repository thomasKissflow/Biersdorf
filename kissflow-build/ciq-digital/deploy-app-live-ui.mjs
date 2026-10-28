// Deploy the live internal UI (prototype/src/app-live, DESIGN.md §7.4) into the APP's Application custom component
// (CIQ_Digital_A00). A thin wrapper: it checks the built zip again and hands it to deploy-workbench-ui.mjs, which
// already fixes CIQ_Digital_A00, takes the zip from argv and runs the proven upload → trigger → poll → publish path
// (component CCEK4Jhdt04g, deploy-report.json). No code change there.
// It REPLACES the deployed v4 Workbench (ciq-workbench-ui-235af550b4.zip, no local copy: no rollback zip).
// A deploy needs Thomas's fresh explicit OK in chat (auto-mode guard); this script refuses without --approved.
//   node kissflow-build/ciq-digital/deploy-app-live-ui.mjs --check       read-only pass-through (custom-UI flag + components)
//   node kissflow-build/ciq-digital/deploy-app-live-ui.mjs --approved    deploy prototype/dist-applive/<latest.txt>
// Before handing over it re-checks the zip's staged index.html: the deny-list (prototype/scripts/workbench-deny.mjs),
// no X-Access-Key string, the build stamp, and that the zip name's hash is that index.html's sha256 (so the staged file
// is the one in the zip). Reads no credentials itself; deploy-workbench-ui.mjs reads them through ../lib/meta.mjs.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { denyHits } from "../../prototype/scripts/workbench-deny.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const dist = here("../../prototype/dist-applive/");
const deployer = here("./deploy-workbench-ui.mjs");
const args = process.argv.slice(2);
const fail = (msg, code = 1) => {
  console.error(`deploy-app-live-ui: ${msg}`);
  process.exit(code);
};
const run = (argv) => {
  const r = spawnSync(process.execPath, [deployer, ...argv], { stdio: "inherit" });
  process.exit(r.status ?? 1);
};

if (args.includes("--check")) run(["--check"]); // read-only: no zip, no approval needed
if (!args.includes("--approved")) fail("refused: deploying replaces the live app UI. Run again with --approved once Thomas has given a fresh explicit OK in chat.", 2);

// ---- the zip named in latest.txt
const latest = here("../../prototype/dist-applive/latest.txt");
if (!existsSync(latest)) fail("prototype/dist-applive/latest.txt is missing: run npm run build:applive first");
const name = readFileSync(latest, "utf8").trim();
const m = name.match(/^ciq-app-ui-([0-9a-f]{10})\.zip$/);
if (!m) fail(`latest.txt names "${name}", not a ciq-app-ui-<sha10>.zip`);
const zip = dist + name;
if (!existsSync(zip)) fail(`${name} is missing in prototype/dist-applive/`);

// ---- the guards again, on the staged index.html
const indexHtml = dist + "zip/index.html";
if (!existsSync(indexHtml)) fail("prototype/dist-applive/zip/index.html is missing: rebuild");
const html = readFileSync(indexHtml, "utf8");
const sha = createHash("sha256").update(html).digest("hex").slice(0, 10);
if (sha !== m[1]) fail(`zip/index.html (sha256 ${sha}) is not the file in ${name}: rebuild`);
if (/x-access-key/i.test(html)) fail("index.html contains an X-Access-Key string");
const deny = denyHits(html);
if (deny.length) fail(`index.html contains ${deny.length} deny-list hit(s):\n${deny.slice(0, 20).map((h) => `  [${h.kind}] "${h.match}" … ${JSON.stringify(h.context)}`).join("\n")}`);
const stampFile = dist + "build-stamp.txt";
const stamp = existsSync(stampFile) ? readFileSync(stampFile, "utf8").trim() : "";
if (!stamp || !html.includes(stamp)) fail("index.html does not carry the build stamp of dist-applive/build-stamp.txt: rebuild");

console.log(`deploying ${name} (build ${stamp}) into CIQ_Digital_A00 through deploy-workbench-ui.mjs`);
run([zip]);
