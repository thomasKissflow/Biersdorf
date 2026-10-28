// Package dist-portal/portal.html as a Kissflow custom UI zip: index.html + manifest.json (master.md §6.12).
// - Strips `crossorigin` from the script tag only (a failed CORS check behind Kissflow hosting renders the page
//   unstyled); the inlined bundle text is never touched.
// - Moves the inlined module script (about 2 MB) from <head> to the end of <body>, so the browser paints the static
//   branded loader while it is still downloading and parsing the bundle. Module scripts run after parsing either way.
// - Stamps the content hash into the zip name so "which build is running?" is answerable.
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "dist-portal", "portal.html");
let html = readFileSync(src, "utf8");
const open = html.match(/<script type="module"[^>]*>/);
if (!open || open.index === undefined) throw new Error("no inlined module script in portal.html");
const end = html.indexOf("</script>", open.index); // an inline script can't contain "</script>": the first one ends it
const bodyEnd = html.lastIndexOf("</body>");
if (end < 0 || bodyEnd < end) throw new Error("unexpected portal.html layout: module script not in <head>");
const block = open[0].replace(/\scrossorigin(="[^"]*")?/g, "") + html.slice(open.index + open[0].length, end + "</script>".length);
html = html.slice(0, open.index) + html.slice(end + "</script>".length, bodyEnd) + block + "\n" + html.slice(bodyEnd);
if (html.indexOf('id="root"') > html.indexOf('<script type="module"')) throw new Error("the loader must come before the bundle");
const hash = createHash("sha256").update(html).digest("hex").slice(0, 10);
const stage = path.join(root, "dist-portal", "zip");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
writeFileSync(path.join(stage, "index.html"), html);
writeFileSync(path.join(stage, "manifest.json"), JSON.stringify({ Category: "Application", Framework: "React" }));
const zip = path.join(root, "dist-portal", `ciq-portal-ui-${hash}.zip`);
rmSync(zip, { force: true });
execFileSync("zip", ["-q", "-X", zip, "index.html", "manifest.json"], { cwd: stage });
const kb = (statSync(zip).size / 1024).toFixed(0);
if (statSync(zip).size > 5 * 1024 * 1024) throw new Error(`zip is ${kb} KB, over the 5 MB custom UI limit`);
writeFileSync(path.join(root, "dist-portal", "latest.txt"), path.basename(zip) + "\n");
console.log(`portal zip: ${path.relative(root, zip)} (${kb} KB, html sha256 ${hash})`);
