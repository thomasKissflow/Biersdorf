#!/usr/bin/env node
// version-check.mjs — tell someone their plugin is old, before it costs them a build.
//
// The plugin changes most days and people install once. A stale copy does not fail loudly: it runs
// last month's agent definitions against this month's engine, so the symptoms are a missing check, a
// shape the builder no longer emits, or advice that contradicts the platform — all of which look
// like the product being wrong rather than the copy being old.
//
// Runs at SessionStart. Three rules, because a startup check that misbehaves is worse than none:
//
//   FAST      one request, 1.5s ceiling, and the answer is cached for a day. Nobody waits on this.
//   SILENT    any failure — offline, DNS, a 500, a laptop on a plane — prints nothing and exits 0.
//             A version check must never be the reason a session looks broken.
//   QUIET     says nothing at all when you are current, which is almost every session. A notice that
//             appears every time is a notice people learn to skip.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.env.KF_VERSION_URL || "https://aibuilder.kissflow.com/plugin/version";
const CACHE = join(tmpdir(), "kf-plugin-version.json");
const CACHE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 1500;

const localVersion = () => {
  for (const p of [join(HERE, "..", ".claude-plugin", "plugin.json"), join(HERE, "..", "plugin.json")]) {
    try { return JSON.parse(readFileSync(p, "utf8")).version || null; } catch { /* try the next */ }
  }
  return null;
};

// "1.10.0" is newer than "1.9.0" — string comparison gets that wrong, and the version people most
// need to be told about is the one right after a minor rolls over.
const newer = (a, b) => {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
};

const readCache = () => {
  try {
    const c = JSON.parse(readFileSync(CACHE, "utf8"));
    return Date.now() - c.at < CACHE_MS ? c : null;
  } catch { return null; }
};

async function latest() {
  const cached = readCache();
  if (cached) return cached.version;
  const r = await fetch(SOURCE, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(String(r.status));
  const { version } = await r.json();
  try { mkdirSync(dirname(CACHE), { recursive: true }); writeFileSync(CACHE, JSON.stringify({ at: Date.now(), version })); } catch { /* cache is an optimisation */ }
  return version;
}

export async function checkVersion() {
  const mine = localVersion();
  if (!mine) return null;                       // not running from a plugin install
  const there = await latest();
  if (!there || !newer(there, mine)) return null;
  return { mine, there };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  try {
    const u = await checkVersion();
    if (u) {
      // The commands are the CLI's own, checked against `claude plugin --help`: `marketplace update`
      // refreshes the catalogue, `update <plugin>` installs it, and the CLI itself says a restart is
      // required to apply. Naming the plugin as app-agents@kissflow avoids ambiguity when someone has
      // several marketplaces configured.
      process.stdout.write(
        `\nKissflow App Agents ${u.mine} is installed — ${u.there} is available.\n` +
        `The agents, commands and engine ship as one version, so an old copy runs last month's rules\n` +
        `against this month's builder. To update:\n\n` +
        `    claude plugin marketplace update kissflow\n` +
        `    claude plugin update app-agents@kissflow\n\n` +
        `Then restart this session — plugin changes only apply to a new one.\n` +
        `Or ask me to run /kf-update and I'll walk you through what changed.\n\n`);
    }
  } catch { /* offline, slow, or the service is down — say nothing at all */ }
  process.exit(0);
}
