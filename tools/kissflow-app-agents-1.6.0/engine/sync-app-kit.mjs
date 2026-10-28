// sync-app-kit.mjs — copy the LIVE starter kit (components + the three kit stylesheets) into
// app-kit/, the payload kit-install.mjs ships into generated apps.
//
// WHY THIS EXISTS. app-kit/ is a COPY of starter/src, and copies drift. It used to be re-synced by
// a hand `cp -R` documented in app-kit/README.md — and it silently drifted anyway: a WCAG fix to
// `--color-text-muted` landed in starter/src/tokens.css but not in app-kit/tokens.css, so every
// generated app kept shipping the failing #7F8082 (3.95:1). ONE source, gated, is the only honest
// way to keep the travelling copy identical — the same pattern proto-kit/sync-tokens.mjs already
// uses for the token contract, one level up: this carries the kit's actual React source + CSS.
//
// WHY A COPY AND NOT AN IMPORT. The plugin ships standalone (.claude-plugin/marketplace.json:
// `"source": "./plugins/app-agents"`) and contains no copy of starter/. At an installed site
// starter/src does not exist, so the kit has to travel INSIDE the plugin. This script keeps that
// travelling copy honest.
//
//   node sync-app-kit.mjs                 # sync + report what changed
//   node sync-app-kit.mjs --check         # exit 1 if out of date, write nothing (for CI)
//
// NOT synced (app-kit owns these — they have no starter upstream): app-ui-shim.js (maps the kit's
// @kissflow/app-ui imports onto the deployed @kissflow/app-core), kit-compat.css (scaffold-shell
// sidebar-* tokens), README.md. index.css / app-identity.css are NOT part of app-kit — a generated
// app gets those from the create-app scaffold, not this payload.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// engine dir is <repo>/plugins/app-agents/engine; starter is <repo>/starter. Overridable so the
// script still works from a checkout with a different layout.
const STARTER = process.env.KF_STARTER_DIR || join(HERE, "..", "..", "..", "starter", "src");
const APPKIT = join(HERE, "app-kit");
const check = process.argv.includes("--check");

// Files copied from starter/src/<name> → app-kit/<name>, plus the kit/ component dir.
const CSS_FILES = ["shadcn.css", "tokens.css", "theme-variants.css"];
const KIT_DIR = "components/kit"; // → app-kit/kit

if (!existsSync(STARTER)) {
  console.error(`sync-app-kit: starter source not found — ${STARTER}`);
  console.error("set KF_STARTER_DIR=<path to starter/src> if the layout differs.");
  process.exit(2);
}

// Recursively list files (relative paths) under a dir. kit/ is flat today, but walk anyway so a
// future subfolder can't silently escape the sync.
function listFiles(root, rel = "") {
  const out = [];
  for (const name of readdirSync(join(root, rel))) {
    const r = rel ? join(rel, name) : name;
    if (statSync(join(root, r)).isDirectory()) out.push(...listFiles(root, r));
    else out.push(r);
  }
  return out;
}

const drift = []; // human-readable list of what differs / would change

// ── the three kit stylesheets ────────────────────────────────────────────────────────────────
for (const f of CSS_FILES) {
  const src = join(STARTER, f);
  if (!existsSync(src)) { console.error(`sync-app-kit: expected starter file missing — ${src}`); process.exit(2); }
  const want = readFileSync(src, "utf8");
  const dst = join(APPKIT, f);
  const have = existsSync(dst) ? readFileSync(dst, "utf8") : null;
  if (have !== want) {
    drift.push(f);
    if (!check) writeFileSync(dst, want);
  }
}

// ── the component library (app-kit/kit mirrors starter/src/components/kit exactly) ─────────────
const srcKit = join(STARTER, KIT_DIR);
const dstKit = join(APPKIT, "kit");
const srcFiles = new Set(listFiles(srcKit));
const dstFiles = existsSync(dstKit) ? new Set(listFiles(dstKit)) : new Set();

for (const rel of srcFiles) {
  const want = readFileSync(join(srcKit, rel), "utf8");
  const dp = join(dstKit, rel);
  const have = existsSync(dp) ? readFileSync(dp, "utf8") : null;
  if (have !== want) {
    drift.push(`kit/${rel}` + (have === null ? " (new)" : ""));
    if (!check) { mkdirSync(dirname(dp), { recursive: true }); writeFileSync(dp, want); }
  }
}
// files in app-kit/kit that starter no longer has → remove (starter is the source of truth).
for (const rel of dstFiles) {
  if (!srcFiles.has(rel)) {
    drift.push(`kit/${rel} (removed — not in starter)`);
    if (!check) rmSync(join(dstKit, rel));
  }
}

// ── report ────────────────────────────────────────────────────────────────────────────────────
if (check) {
  if (!drift.length) { console.log("sync-app-kit: up to date"); process.exit(0); }
  console.error("sync-app-kit: OUT OF DATE — run `node engine/sync-app-kit.mjs`");
  for (const d of drift) console.error("  · " + d);
  process.exit(1);
}
if (!drift.length) console.log("sync-app-kit: already up to date — nothing copied.");
else { console.log(`sync-app-kit: synced ${drift.length} file(s) from starter → app-kit:`); for (const d of drift) console.log("  · " + d); }
