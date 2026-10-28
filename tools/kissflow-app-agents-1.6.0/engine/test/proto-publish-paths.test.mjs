// proto-publish-paths.test.mjs — the publication guarantee must hold at the BOUNDARY, not inside one
// assembly path: a failed incremental compile keeps the last good preview (never overwrites it with raw
// source), and every publisher (v1, v2, CLI) routes through the ONE boundary so their postconditions are
// identical (the review's findings #2/#3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleRun, indexOf } from "../proto-assemble.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V4_SHELL = readFileSync(join(HERE, "fixtures", "v4-shell.html"), "utf8");

test("#7 a failed incremental compile KEEPS the last good preview — never writes raw source", async () => {
  const runDir = mkdtempSync(join(tmpdir(), "kf-inc-"));
  const pdir = join(runDir, "prototype", "parts");
  mkdirSync(pdir, { recursive: true });

  // 1. a good shell compiles and publishes — this is the last-known-good frame.
  writeFileSync(join(pdir, "shell.html"), V4_SHELL);
  assert.equal(await assembleRun(runDir), true, "the good shell compiled and published");
  const good = readFileSync(indexOf(runDir), "utf8");
  assert.ok(!/tailwindcss\/browser@/.test(good) && !/type=["']text\/tailwindcss["']/.test(good), "and it's compiled");

  // 2. an UNCOMPILABLE shell arrives (bare @import "tailwindcss" → the compiler throws). assembleRun
  // must NOT overwrite index.html with the raw document; it returns false and the last good frame stays.
  writeFileSync(join(pdir, "shell.html"), `<!doctype html><html><head>
    <script src="https://cdn/@tailwindcss/browser@4"></script>
    <style type="text/tailwindcss">@import "tailwindcss";@theme{--x:1}</style></head>
    <body><nav>Broken</nav><!-- @PART:role-x --></body></html>`);
  assert.equal(await assembleRun(runDir), false, "an uncompilable candidate does not publish");
  assert.equal(readFileSync(indexOf(runDir), "utf8"), good, "the last good compiled preview is untouched — no raw source written");
});

test("#3 the chat host and the CLI publisher both route through the ONE boundary", () => {
  // The correctness guarantee must live at the publication boundary, shared by every path — asserted on
  // source so a new bypassing publisher is caught. (The behavior is proven by proto-publish.test.mjs.)
  const read = (p) => readFileSync(join(HERE, "..", p), "utf8");
  const v1 = readFileSync(join(HERE, "..", "..", "chat", "app.mjs"), "utf8");
  const cli = read("publish.mjs");
  const assembler = read("proto-assemble.mjs");
  for (const [name, src] of [["chat host", v1], ["CLI publish", cli], ["assembler", assembler]]) {
    assert.match(src, /preparePrototypeForPublication|proto-publish/,
      `${name} must publish through the shared boundary, not write prototype bytes raw`);
  }
});
