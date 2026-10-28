// run-all.mjs — the chat test entrypoint. Runs EVERY test/*.test.mjs in its OWN process, the same way
// control-plane/test/run-all.mjs does, because the chat tests each spin a real server and share process
// globals (KF_RUNS_DIR, ports, the sessions Map). Loaded together under one `node --test *.test.mjs`
// they intermittently race — two different tests fail on different runs — even though each is correct
// in isolation. One process per file removes the shared state and makes the suite deterministic (the
// property #16 needs: a clean checkout's tests must pass reliably, not usually).
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();
const failed = [];
for (const f of files) {
  process.stdout.write(`\n─── ${f} ─────────────────────────────\n`);
  const r = spawnSync(process.execPath, ["--test", join(here, f)], { stdio: "inherit" });
  if (r.status !== 0) failed.push(f);
}
console.log(`\n${"=".repeat(56)}`);
console.log(failed.length ? `❌ ${failed.length}/${files.length} test file(s) FAILED: ${failed.join(", ")}` : `✅ all ${files.length} chat test files passed`);
process.exit(failed.length ? 1 : 0);
