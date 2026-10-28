#!/usr/bin/env node
// capture-screens.mjs — headless-screenshot each screen of a self-contained prototype into
// <out>/thumbs/*.png + manifest.json, so `review.mjs` embeds the REAL screens (InVision-style
// Screens review) in the Pages & Nav tab instead of wireframe mocks.
//
//   node engine/capture-screens.mjs <prototype.html> [--out <dir>] [--roles slug:Name:Label,…]
//
// Role discovery: reads `window.ROLES = [{slug,name,title}]` from the shadcn-kit prototype (the
// standard pipeline output); falls back to `<section id="rv-<slug>">` sections. Each screen is
// captured by injecting the prototype's own `switchRole(slug)` before </body>.
//
// LOCAL/DEV ONLY: needs headless Chrome (set CHROME=/path to override the macOS default). In a
// headless sandbox with no Chrome, this is a no-op — review.mjs then falls back to wireframes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const proto = process.argv[2];
if (!proto || !existsSync(proto)) { console.error("usage: capture-screens.mjs <prototype.html> [--out <dir>] [--roles slug:Name,…]"); process.exit(1); }
const outArg = (process.argv.indexOf("--out") >= 0) ? process.argv[process.argv.indexOf("--out") + 1] : join(dirname(proto), "thumbs");
const rolesArg = (process.argv.indexOf("--roles") >= 0) ? process.argv[process.argv.indexOf("--roles") + 1] : "";

// locate Chrome (macOS default + common linux names + $CHROME)
const CANDIDATES = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean);
function chromeBin() {
  for (const c of CANDIDATES) {
    if (c.includes("/") && existsSync(c)) return c;
    const w = spawnSync("which", [c], { encoding: "utf8" }); if (w.status === 0 && w.stdout.trim()) return w.stdout.trim();
  }
  return null;
}
const CHROME = chromeBin();
if (!CHROME) { console.error("capture-screens: no headless Chrome found — skipping (review falls back to wireframes). Set CHROME=/path to enable."); process.exit(0); }

const html = readFileSync(proto, "utf8");

// extract the JS array literal that starts at `anchor` using a string-aware balanced-bracket scan
// (lazy regexes over-match: legacy prototypes embed `];` inside page-HTML strings)
function extractArray(src, anchorRe) {
  const m = src.match(anchorRe); if (!m) return null;
  let i = src.indexOf("[", m.index + m[0].length - 1);
  if (i < 0) return null;
  let depth = 0, str = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (str) { if (c === "\\") j++; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return null;
}
// screens: from --roles, else window.ROLES, else rv-<slug> sections
let screens = [];
if (rolesArg) {
  screens = rolesArg.split(",").map((s) => { const [slug, name, label] = s.split(":"); return { slug, name: label || name || slug, role: name || slug }; });
} else {
  const arr = extractArray(html, /window\.ROLES\s*=\s*/);
  if (arr) {
    try { const R = eval(arr); screens = R.map((r) => ({ slug: r.slug, name: r.title || r.name || r.slug, role: r.name || r.slug })); } catch { /* fall through */ }
  }
  if (!screens.length) {
    // LEGACY prototypes: `var ROLES=[{role,landing,nav}]` + a <select id="role"> switcher + render()
    const larr = extractArray(html, /var\s+ROLES\s*=\s*/);
    if (larr) {
      try {
        const R = eval(larr);
        screens = R.filter((r) => r && r.role).map((r) => ({ slug: String(r.role).replace(/\W+/g, "-").toLowerCase(), name: r.role, role: r.role, legacy: true }));
      } catch { /* fall through */ }
    }
  }
  if (!screens.length) {
    const secs = [...html.matchAll(/id="rv-([a-z0-9-]+)"/gi)].map((x) => x[1]);
    screens = [...new Set(secs)].map((slug) => ({ slug, name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), role: slug }));
  }
}
if (!screens.length) { console.error("capture-screens: no roles/screens found in the prototype (no window.ROLES or rv-* sections)."); process.exit(0); }

mkdirSync(outArg, { recursive: true });
const tmp = join(tmpdir(), "kf-cap-" + basename(proto).replace(/\W/g, ""));
mkdirSync(tmp, { recursive: true });
const manifest = { screens: [] };
for (const s of screens) {
  const driver = s.legacy
    ? `<script>try{cur=${JSON.stringify(s.role)};var _r=ROLES.find(function(x){return x.role===cur});if(_r)curPage=_r.landing;render&&render()}catch(e){}</script></body>`
    : `<script>try{window.switchRole&&switchRole(${JSON.stringify(s.slug)})}catch(e){}</script></body>`;
  const injected = html.replace(/<\/body>/i, driver);
  const tf = join(tmp, s.slug + ".html"); writeFileSync(tf, injected);
  const png = join(outArg, s.slug + ".png");
  const r = spawnSync(CHROME, ["--headless", "--disable-gpu", "--ignore-certificate-errors",
    "--screenshot=" + png, "--window-size=1400,1500", "--virtual-time-budget=8000", "file://" + tf],
    { encoding: "utf8", timeout: 60000 });
  if (existsSync(png)) { manifest.screens.push({ file: s.slug + ".png", name: s.name, role: s.role }); process.stdout.write("  ✓ " + s.name + "\n"); }
  else process.stdout.write("  ✗ " + s.name + " (capture failed)\n");
}
if (manifest.screens.length) { writeFileSync(join(outArg, "manifest.json"), JSON.stringify(manifest, null, 2)); console.log(`captured ${manifest.screens.length}/${screens.length} screens → ${outArg}`); }
else console.error("capture-screens: nothing captured.");
