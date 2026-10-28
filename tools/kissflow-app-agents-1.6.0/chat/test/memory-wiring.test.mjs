// memory-wiring.test.mjs — the pool was empty for months and nothing said so.
//
// Two independent breaks, both invisible:
//   1. Every agent definition told the agent to hand-append `MEMORY-LOCAL.md`. Nothing reads that
//      file — the drain reads $KF_MEMORY_INBOX (<run>/memory-inbox.jsonl) and parses it as JSONL,
//      so a markdown bullet was discarded by a catch that logged nothing.
//   2. v1's drainMemory called readInbox/clearInbox WITHOUT importing them, so the whole function
//      threw ReferenceError on its first line and the drain's own catch reduced it to a warning.
//
// Neither is the kind of thing a human re-reads 22 files to check. So the suite checks it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..", "..");
const AGENTS = join(PLUGIN, "agents");

test("every agent is told to RECORD, with the command that actually reaches the hive", () => {
  const files = readdirSync(AGENTS).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 20, `expected the full roster, saw ${files.length}`);
  const missing = [];
  for (const f of files) {
    const id = f.replace(/\.md$/, "");
    const doc = readFileSync(join(AGENTS, f), "utf8");
    if (!/memory\.mjs remember/.test(doc)) { missing.push(`${id}: no remember command`); continue; }
    // …and naming ITSELF, so its lessons come back to it on recall rather than to a placeholder
    if (!doc.includes(`--agent ${id}`)) missing.push(`${id}: does not name itself`);
  }
  assert.deepEqual(missing, [], `agents that cannot record what they learn:\n  ${missing.join("\n  ")}`);
});

test("no definition tells an agent to hand-edit a memory file — nothing drains one", () => {
  const offenders = [];
  for (const f of readdirSync(AGENTS).filter((x) => x.endsWith(".md"))) {
    const doc = readFileSync(join(AGENTS, f), "utf8");
    // the exact instruction that broke it: "**append** a one-line dated entry to `MEMORY*.md`"
    if (/\*\*append\*\* a one-line dated entry/.test(doc)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `these still point at a file no drain reads: ${offenders.join(", ")}`);
});

// The ReferenceError bug, generalised: a module that USES an inbox helper must IMPORT it. Static,
// because importing app.mjs for real would boot a server.
const usesButDoesNotImport = (src, name) => {
  const used = new RegExp(`[^.\\w]${name}\\s*\\(`).test(src);
  const imported = new RegExp(`import[^;]*\\b${name}\\b[^;]*from`, "s").test(src);
  return used && !imported;
};

test("both drains import the inbox helpers they call", () => {
  const targets = [
    join(PLUGIN, "chat", "app.mjs"),
    join(PLUGIN, "..", "..", "v2", "worker.mjs"),
  ].filter(existsSync);
  assert.ok(targets.length, "found neither drain — the paths moved");
  const broken = [];
  for (const t of targets) {
    const src = readFileSync(t, "utf8");
    for (const fn of ["readInbox", "readInboxDetailed", "clearInbox"]) {
      if (usesButDoesNotImport(src, fn)) broken.push(`${t.split("/").slice(-2).join("/")}: ${fn}`);
    }
  }
  assert.deepEqual(broken, [], `called without an import — throws on the first lesson:\n  ${broken.join("\n  ")}`);
});

test("a hand-written line is reported, not silently dropped", async () => {
  const { readInboxDetailed } = await import("../../engine/memory.mjs");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "inbox-"));
  const file = join(dir, "memory-inbox.jsonl");
  writeFileSync(file, [
    JSON.stringify({ text: "a real lesson", scope: "agent", agent: "kf-ba" }),
    "- 2026-08-08 [global] the markdown line an agent used to write",
    "",
  ].join("\n"));

  const { rows, skipped } = readInboxDetailed(file);
  assert.equal(rows.length, 1, "the JSONL row survives");
  assert.equal(skipped, 1, "and the markdown one is COUNTED, so the drain can say it was lost");
});
