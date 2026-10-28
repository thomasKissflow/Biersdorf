// prod-first.test.mjs — the app shell is created where the log CLAIMS (#18). Before this, applyIR only
// ever used the dev client while the CLI logged 'created in prod'. These cover the two verifiable
// pieces: prod-client construction from PROD_* env, and the replication poll (with an injected mock,
// so no live account is needed). The live prod→dev create path itself needs a real account to prove.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientFrom, prodClient, awaitReplication } from "../client.mjs";

const withEnv = (vars, fn) => {
  const saved = {}; for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(vars)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } }
};

test("clientFrom('PROD_') reads the PROD_* names and targets the prod host", () => {
  withEnv({ KISSFLOW_PROD_ACCOUNT_ID: "acc-prod", KISSFLOW_PROD_API_KEY: "k", KISSFLOW_PROD_API_SECRET: "s", KISSFLOW_PROD_SUBDOMAIN: "acme" }, () => {
    const c = clientFrom("PROD_");
    assert.equal(c.acc, "acc-prod");
    assert.equal(c.host, "acme.kissflow.com", "prod client targets the prod host, not dev");
  });
});

test("dev and prod clients read DIFFERENT credentials from the same env", () => {
  withEnv({
    KISSFLOW_ACCOUNT_ID: "acc-dev", KISSFLOW_API_KEY: "dk", KISSFLOW_API_SECRET: "ds", KISSFLOW_SUBDOMAIN: "dev-acme",
    KISSFLOW_PROD_ACCOUNT_ID: "acc-prod", KISSFLOW_PROD_API_KEY: "pk", KISSFLOW_PROD_API_SECRET: "ps", KISSFLOW_PROD_SUBDOMAIN: "acme",
  }, () => {
    assert.equal(clientFrom("").host, "dev-acme.kissflow.com");
    assert.equal(clientFrom("PROD_").host, "acme.kissflow.com");
  });
});

test("prodClient() is null when prod creds aren't fully set — falls back to dev, never throws mid-apply", () => {
  withEnv({ KISSFLOW_PROD_ACCOUNT_ID: undefined, KISSFLOW_PROD_API_KEY: undefined, KISSFLOW_PROD_API_SECRET: undefined, KISSFLOW_PROD_SUBDOMAIN: undefined },
    () => assert.equal(prodClient(), null));
});

test("awaitReplication polls until the app appears, reporting how long it took", async () => {
  let calls = 0;
  const mock = { host: "dev.kissflow.com", getApp: async () => { calls++; return calls < 3 ? { status: 404, body: {} } : { status: 200, body: { _id: "App_A00" } }; } };
  let t = 0; const now = () => t; const sleep = async (ms) => { t += ms; };   // virtual clock — no real waiting
  const r = await awaitReplication(mock, "App_A00", { pollMs: 3000, timeoutMs: 60000, now, sleep });
  assert.ok(r.replicated, "replicates once the app appears");
  assert.equal(r.polls, 3, "polled until it showed up (404,404,200)");
});

test("awaitReplication gives up at the timeout instead of hanging forever", async () => {
  const mock = { host: "dev.kissflow.com", getApp: async () => ({ status: 404, body: {} }) };  // never appears
  let t = 0; const now = () => t; const sleep = async (ms) => { t += ms; };
  const r = await awaitReplication(mock, "App_A00", { pollMs: 5000, timeoutMs: 20000, now, sleep });
  assert.equal(r.replicated, false, "reports NOT replicated — the caller aborts before mutating dev, no false success");
  assert.ok(r.waitedMs >= 20000);
});
