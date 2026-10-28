// kit-sync.test.mjs — ONE KIT, enforced. The pipeline renders three ways from a single authored
// source (starter/src): the React custom UI, the packaged copy in app-kit/ that kit-install ships,
// and the HTML transcription proto-kit/ renders prototypes with. app-kit/ and proto-kit/ are
// GENERATED copies of starter — they exist only because the plugin ships standalone (no starter/ at
// an installed site). Copies drift silently: a WCAG fix to --color-text-muted once landed in
// starter but not in app-kit, so every generated app shipped the failing colour. These checks fail
// if either generated copy is out of date, so "one kit" is a gate, not a hope.
//
// Run: node --test test/kit-sync.test.mjs   (or node test/kit-sync.test.mjs)
// Fix a failure: run the named generator, then re-run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");

function checkOK(script, cwd) {
  const r = spawnSync(process.execPath, [script, "--check"], { cwd, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("proto-kit/tokens.css is in sync with starter (sync-tokens --check)", () => {
  const { code, out } = checkOK("sync-tokens.mjs", join(ENGINE, "proto-kit"));
  assert.equal(code, 0, `proto-kit token contract is OUT OF DATE — run \`node engine/proto-kit/sync-tokens.mjs\`.\n${out}`);
});

test("app-kit/ is in sync with the starter kit (sync-app-kit --check)", () => {
  const { code, out } = checkOK("sync-app-kit.mjs", ENGINE);
  assert.equal(code, 0, `app-kit payload is OUT OF DATE — run \`node engine/sync-app-kit.mjs\`.\n${out}`);
});
