// version-check.test.mjs — telling someone their plugin is old, without becoming a nuisance.
//
// The plugin changes most days and people install once. A stale copy does not fail loudly: last
// month's agent definitions against this month's engine looks like the product being wrong.
//
// The failure modes of the CHECK are what this pins, because a startup check that misbehaves is
// worse than no check at all: it must be silent when you are current (almost every session), silent
// when the network is not there (a laptop on a plane must not look broken), and right about which
// version is newer — 1.10.0 over 1.9.0 is exactly when people most need telling.
import "./_env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "engine", "version-check.mjs");

// ASYNC on purpose. spawnSync blocks the parent's event loop, so the test server below could not
// answer until the child gave up — every network case "passed" by timing out silently, which is the
// exact failure this suite exists to catch. Each run gets its own TMPDIR so the 24h cache cannot
// leak between cases.
const exec = promisify(execFile);
const run = async (url) => {
  try {
    const { stdout } = await exec(process.execPath, [SCRIPT], {
      env: { ...process.env, KF_VERSION_URL: url, TMPDIR: mkdtempSync(join(tmpdir(), "kfvc-")) },
    });
    return { stdout, status: 0 };
  } catch (e) { return { stdout: e.stdout || "", status: e.code ?? 1 }; }
};

const serve = async (body, status = 200) => {
  const srv = createServer((_q, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  }).listen(0);
  await new Promise((r) => srv.once("listening", r));
  return { url: `http://127.0.0.1:${srv.address().port}/plugin/version`, close: () => srv.close() };
};

test("a newer published version is announced, with how to get it", async () => {
  const s = await serve({ name: "app-agents", version: "99.0.0" });
  const r = await run(s.url); s.close();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /99\.0\.0 is available/);
  // the exact commands, checked against `claude plugin --help` on a real install — a notice telling
  // someone to run something that does not exist is worse than no notice
  assert.match(r.stdout, /claude plugin marketplace update kissflow/, "refresh the catalogue");
  assert.match(r.stdout, /claude plugin update app-agents@kissflow/, "then install it");
  assert.match(r.stdout, /restart/i, "and the CLI says a restart is required to apply");
});

test("being current says nothing at all", async () => {
  const s = await serve({ name: "app-agents", version: "0.0.1" });   // older than whatever ships here
  const r = await run(s.url); s.close();
  assert.equal(r.stdout.trim(), "", "a notice on every session is a notice people learn to skip");
  assert.equal(r.status, 0);
});

test("offline is silent — a version check must never look like a broken session", async () => {
  const r = await run("http://127.0.0.1:9/plugin/version");   // nothing listens on port 9
  assert.equal(r.stdout.trim(), "");
  assert.equal(r.status, 0, "and it must not fail the session either");
});

test("a broken response is silent too", async () => {
  const s = await serve("not json at all");
  const r = await run(s.url); s.close();
  assert.equal(r.stdout.trim(), "");
  assert.equal(r.status, 0);
});

test("a 500 from the service is silent", async () => {
  const s = await serve({ error: "boom" }, 500);
  const r = await run(s.url); s.close();
  assert.equal(r.stdout.trim(), "");
  assert.equal(r.status, 0);
});

test("1.10.0 is newer than 1.9.0 — string comparison gets this backwards", async () => {
  const { checkVersion } = await import("../../engine/version-check.mjs");
  assert.ok(typeof checkVersion === "function", "exported so the comparison is testable at all");
  // the ordering itself, through the public path: a 1.10.0 server against this 1.x plugin announces
  const s = await serve({ version: "1.10.0" });
  const r = await run(s.url); s.close();
  assert.match(r.stdout, /1\.10\.0 is available/);
});

test("the manifest and the marketplace agree on the version", async () => {
  // They are two files, edited by hand, and the update notice compares the SERVICE's number against
  // the INSTALLED one. If they drift, the notice either never fires or points at a version nobody
  // can install — and both failures are silent.
  const { readFileSync } = await import("node:fs");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const manifest = JSON.parse(readFileSync(join(root, "plugins", "app-agents", ".claude-plugin", "plugin.json"), "utf8"));
  const market = JSON.parse(readFileSync(join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  const entry = market.plugins.find((p) => p.name === manifest.name);
  assert.ok(entry, `marketplace has no entry named "${manifest.name}"`);
  assert.equal(entry.version, manifest.version, "the published number and the shipped number must match");
});

test("the changelog documents the version being shipped", async () => {
  // /kf-update reads this to tell someone what they are getting. A bump without an entry means the
  // command has nothing to say at the moment it matters most.
  const { readFileSync } = await import("node:fs");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const version = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8")).version;
  const log = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.ok(log.includes(`## ${version} `), `CHANGELOG.md has no entry for ${version}`);
});

test("every agent and command has frontmatter Claude Code can actually parse", async () => {
  // `claude plugin validate` found 14 files whose YAML failed to parse — descriptions containing
  // ": " and argument-hints that opened a quote and kept going. The runtime does not complain: it
  // loads the file with EMPTY metadata, so the tools restriction, the description an agent is
  // selected by, and the model choice are all silently dropped. An agent still runs; it just runs
  // unrestricted and unfindable. Nothing in a normal test suite sees that, which is why this checks
  // the same thing the plugin loader does.
  const { readFileSync, readdirSync } = await import("node:fs");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const bad = [];
  for (const dir of ["agents", "commands"]) {
    for (const f of readdirSync(join(root, dir)).filter((x) => x.endsWith(".md"))) {
      const src = readFileSync(join(root, dir, f), "utf8");
      const m = /^---\n([\s\S]*?)\n---/.exec(src);
      if (!m) continue;                       // no frontmatter is allowed; broken frontmatter is not
      for (const line of m[1].split("\n")) {
        const kv = /^([a-zA-Z-]+):\s*(.+)$/.exec(line);
        if (!kv) continue;
        const v = kv[2].trim();
        // an ESCAPED quote inside a quoted scalar is fine — \" is exactly how you write one
        const inner = v.slice(1, -1).split("\\" + v[0]).join("");
        const quoted = v.length > 1 && (v[0] === '"' || v[0] === "'") && v.endsWith(v[0]) && !inner.includes(v[0]);
        if (quoted) continue;
        if (v.includes(": ")) bad.push(`${dir}/${f} → ${kv[1]}: unquoted value contains ": "`);
        else if (v[0] === '"' || v[0] === "'") bad.push(`${dir}/${f} → ${kv[1]}: quote opened and not closed cleanly`);
      }
    }
  }
  assert.deepEqual(bad, [], `frontmatter that loads as EMPTY metadata:\n  ${bad.join("\n  ")}`);
});
