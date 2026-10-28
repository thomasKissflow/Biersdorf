// Split-all (identity.mjs): the scenario test files run again in child processes with CIQ_TEST_SPLIT_ALL=1, so EVERY
// supplier contact gets an in-memory id `sup:<code>:<uid>` and the fake refuses unknown user ids (strictUsers). Their
// assertions are unchanged and must pass, and afterwards no fake row may hold a minted id. The golden walk is included:
// its projection must stay byte-identical, which is the strongest "minted ids never leave memory" check.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPLIT_ALL } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FILES = ["e2e.test.mjs", "handlers.test.mjs", "lifecycle.test.mjs", "golden.test.mjs"];

function runSplit(file, dir) {
  const report = join(dir, `${file}.json`);
  const env = { ...process.env, CIQ_TEST_SPLIT_ALL: "1", CIQ_TEST_SPLIT_REPORT: report };
  delete env.NODE_TEST_CONTEXT; // the child is its own test run, not a sub-process of this runner
  delete env.CIQ_GOLDEN_WRITE; // never re-capture the golden in split mode
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, file)], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out, report: existsSync(report) ? JSON.parse(readFileSync(report, "utf8")) : null }));
  });
}

test("split-all: e2e, handlers, lifecycle and golden pass unchanged with every contact minted + strictUsers; no fake row holds sup:", { skip: SPLIT_ALL ? "already in split-all mode" : false }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciq-split-"));
  try {
    const results = await Promise.all(FILES.map((f) => runSplit(f, dir)));
    results.forEach((r, i) => {
      const failed = r.out.split("\n").filter((l) => /^\s*not ok|^# fail [1-9]/.test(l));
      assert.equal(r.code, 0, `${FILES[i]} in split-all mode:\n${failed.join("\n")}\n${r.out.slice(-1500)}`);
      assert.ok(r.report, `${FILES[i]}: no split-all report`);
      assert.ok(r.report.setups > 0 && r.report.mintedMax > 0, `${FILES[i]}: split-all did not mint (${JSON.stringify(r.report)})`);
      assert.deepEqual(r.report.leaks, [], `${FILES[i]}: rows holding a minted id`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
