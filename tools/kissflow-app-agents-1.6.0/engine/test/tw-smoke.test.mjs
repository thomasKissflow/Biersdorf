// tw-smoke.test.mjs — the build-time Tailwind smoke check must PASS where the compiler resolves (this
// repo, and every production image after P0-F installs the workspace) and must be a hard gate: exit
// non-zero when it can't compile. Run as a proxy for the container check the Dockerfiles now enforce.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SMOKE = join(HERE, "..", "tw-smoke.mjs");

test("the Tailwind smoke check compiles and exits 0 where the compiler resolves", () => {
  const r = spawnSync(process.execPath, [SMOKE], { encoding: "utf8" });
  assert.equal(r.status, 0, `smoke should pass here: ${r.stderr}`);
  assert.match(r.stdout, /tailwind smoke OK — compiled \d+ bytes/, "it proves a real compile, not just resolution");
});

test("the smoke check is a HARD gate — it exits non-zero when Tailwind can't be found", () => {
  // Genuinely HIDE Tailwind via the search-root seam (#10): KF_TW_PACKAGE points loadTailwind at a
  // package.json that does not depend on tailwindcss, so it resolves to null — exactly a compiler-less
  // image. The old cwd/NODE_PATH trick could not do this because the search uses absolute repo paths.
  const emptyDir = mkdtempSync(join(tmpdir(), "kf-notw-"));
  writeFileSync(join(emptyDir, "package.json"), JSON.stringify({ name: "no-tw", version: "1.0.0" }));
  const r = spawnSync(process.execPath, [SMOKE], {
    encoding: "utf8",
    env: { ...process.env, KF_TW_PACKAGE: join(emptyDir, "package.json") },
  });
  assert.notEqual(r.status, 0, "a compiler-less image must FAIL the smoke gate");
  assert.match(r.stderr, /tailwind smoke FAILED/i, "and say why");
});
