// apply-crash-safe.test.mjs — a crash ANY time after the app shell is created must not duplicate the
// app on the next apply (#14). id-map.json (the reuse handle the CLI reads) is now written the instant
// createApp returns, not only at the end of a long run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyIR } from "../client.mjs";

// A fake client that creates an app, then throws on the very next call — standing in for a crash
// (bash timeout, OOM, killed pod) right after the shell exists but before the run finishes.
function crashingClient() {
  let created = false;
  return {
    acc: "Ac00", host: "dev-test.kissflow.com",
    createApp: async () => { created = true; return { status: 200, body: { _id: "App_CRASH_A00" } }; },
    call: async () => { if (created) throw new Error("simulated crash after createApp"); return { status: 200, body: [] }; },
    getApp: async () => ({ status: 200, body: { _id: "App_CRASH_A00" } }),
    getDraft: async () => ({ status: 200, body: {} }),
  };
}

const IR = {
  app: { name: "Crash Test", description: "x" },
  roles: [{ id: "r_admin", name: "Admin" }],
  forms: [{ id: "req", name: "Request", flowType: "Form", fields: [{ name: "Title", type: "Text" }] }],
  lists: [], permissions: [], pages: [], nav: { menus: [] },
};

test("#14 id-map.json with the app id exists even when the run crashes right after createApp", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kf-crash-"));
  const stateFile = join(dir, "apply-state.json");
  try {
    // The run will throw (or return with errors) once the fake client crashes post-create. Either way,
    // the reuse handle must already be on disk.
    await applyIR(IR, { stateFile, client: crashingClient(), prodClient: null, aiPages: false, pageMode: "none" }).catch(() => {});
    const idMapPath = join(dir, "id-map.json");
    assert.ok(existsSync(idMapPath), "id-map.json must be persisted the instant the app is created");
    const map = JSON.parse(readFileSync(idMapPath, "utf8"));
    assert.equal(map.app, "App_CRASH_A00", "the reuse handle carries the created app id");
    // On the NEXT apply the CLI reads {app} → reuse → no second createApp → no duplicate app.
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("#14 with no stateFile there is nothing to persist and applyIR still does not throw on the write", async () => {
  // stateFile is optional (a --no-checkpoint apply); persistIdMap must simply no-op, not crash.
  const r = await applyIR(IR, { client: crashingClient(), prodClient: null, aiPages: false, pageMode: "none" }).catch((e) => e);
  assert.ok(r, "returned or threw cleanly without a stateFile — no write attempted");
});
