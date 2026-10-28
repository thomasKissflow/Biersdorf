// cli-args.test.mjs — the apply command's --mode / --target resolution (#11). Before this, --quick was
// the only strategy flag and --target was accepted but silently ignored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMode, resolveTarget } from "../cli-args.mjs";

const PROD = { KISSFLOW_PROD_ACCOUNT_ID: "Ac", KISSFLOW_PROD_API_KEY: "k", KISSFLOW_PROD_API_SECRET: "s" };

test("#11 resolveMode: --mode express|comprehensive, --quick deprecated alias, default comprehensive", () => {
  assert.deepEqual(resolveMode(["--mode", "express"]), { mode: "express", deprecated: false });
  assert.deepEqual(resolveMode(["--mode", "comprehensive"]), { mode: "comprehensive", deprecated: false });
  assert.deepEqual(resolveMode(["--mode", "quick"]), { mode: "express", deprecated: false });  // internal alias tolerated
  assert.deepEqual(resolveMode(["--quick"]), { mode: "express", deprecated: true });
  assert.deepEqual(resolveMode([]), { mode: "comprehensive", deprecated: false });
});

test("#11 resolveMode: an unknown --mode value throws (a typo must not silently run comprehensive)", () => {
  assert.throws(() => resolveMode(["--mode", "fast"]), /express\|comprehensive/);
  assert.throws(() => resolveMode(["--mode"]), /express\|comprehensive/);
});

test("#11 resolveTarget: --target dev forces dev-direct even with prod creds present", () => {
  assert.deepEqual(resolveTarget(["--target", "dev"], PROD), { target: "dev", prodFirst: false, hasProdCreds: true });
});

test("#11 resolveTarget: --target prod requires prod creds; forces prod-first when present", () => {
  assert.deepEqual(resolveTarget(["--target", "prod"], PROD), { target: "prod", prodFirst: true, hasProdCreds: true });
  assert.throws(() => resolveTarget(["--target", "prod"], {}), /needs prod creds/);
});

test("#11 resolveTarget: default is AUTO — prod-first iff prod creds, else dev; prodFirst undefined", () => {
  assert.deepEqual(resolveTarget([], PROD), { target: "prod", prodFirst: undefined, hasProdCreds: true });
  assert.deepEqual(resolveTarget([], {}), { target: "dev", prodFirst: undefined, hasProdCreds: false });
});

test("#11 resolveTarget: env KF_TARGET is honored when no --target flag is given", () => {
  assert.equal(resolveTarget([], { ...PROD, KF_TARGET: "dev" }).target, "dev");
  assert.equal(resolveTarget([], { ...PROD, KF_TARGET: "dev" }).prodFirst, false);
});

test("#11 resolveTarget: an unknown --target value throws", () => {
  assert.throws(() => resolveTarget(["--target", "staging"], {}), /dev\|prod/);
});
