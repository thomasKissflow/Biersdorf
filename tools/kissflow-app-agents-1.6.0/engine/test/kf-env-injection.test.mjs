// kf-env-injection.test.mjs — .kf-env is SOURCED, so every value must be inert shell DATA.
// Before 2026-08-17 values were interpolated bare (or JSON-quoted = double quotes, where $() still
// runs); a control-plane project named `$(cmd)` executed on the operator's machine when sourced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeEnv } from "../connect.mjs";

test("sourcing a .kf-env with injection payloads executes nothing and preserves values", () => {
  const dir = mkdtempSync(join(tmpdir(), "kfenv-"));
  try {
    const env = join(dir, ".kf-env");
    const marker = join(dir, "PWNED");
    writeEnv({
      projectId: "p1", projectName: `$(touch ${marker})`, role: "dev",
      apiToken: "tok`touch " + marker + "`", controlPlaneUrl: "https://x",
      memStore: "m", memOrg: "o", gcs: { bucket: "b", prefix: "p" },
      kissflow: { configured: true, subdomain: "s", accountId: "a", apiKey: "k", apiSecret: `sec'; touch ${marker}` },
    }, env);

    assert.equal((statSync(env).mode & 0o777).toString(8), "600", "secrets file must be 0600");

    // source in a real shell; echo the values back so we can assert they survived verbatim
    const out = execFileSync("bash", ["-c", `source ${env}; printf '%s\\n' "$KF_PROJECT_NAME" "$KF_API_TOKEN" "$KISSFLOW_API_SECRET"`], { encoding: "utf8" });
    assert.ok(!existsSync(marker), "NO injection payload executed while sourcing");
    const [name, tok, sec] = out.split("\n");
    assert.equal(name, "$(touch " + marker + ")", "value survived as literal data");
    assert.equal(tok, "tok`touch " + marker + "`");
    assert.equal(sec, `sec'; touch ${marker}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a newline in a value is rejected, not sanitized", () => {
  assert.throws(() => writeEnv({ projectId: "p", projectName: "a\nexport EVIL=1", role: "r", memStore: "m", memOrg: "o", gcs: {}, kissflow: {} }, join(mkdtempSync(join(tmpdir(), "kfenv-")), ".kf-env")), /newline|NUL/);
});
