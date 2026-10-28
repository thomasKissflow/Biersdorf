// spend-accounting.test.mjs — what a build cost, recorded where the person who paid can see it.
//
// Two $200+ sessions were reported in two days, and answering "why" meant reading production logs
// and then the database — because the numbers were recorded per turn and never surfaced. Worse, both
// investigations dead-ended: the sessions predated log retention entirely.
//
// The arithmetic is the part worth pinning, because it is easy to get wrong in a way that looks
// right: total_cost_usd is CUMULATIVE for a CLI session, so a turn's own cost is the DELTA from the
// previous reading — and a value LOWER than its predecessor means a fresh child process, where the
// reading already IS the delta. Summing the raw field instead over-counts enormously (a 10-turn
// session bills its first turn ten times). The same rule lives in db.mjs chatSpendTotal; this is the
// per-session half of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "app.mjs"), "utf8");

// recordUsage is not exported (it is host-internal), so it is executed against a stub session the
// same way the stream-recovery suite executes the UI's handlers: what broke here is arithmetic, and
// only running it checks arithmetic.
const from = SRC.indexOf("function recordUsage(");
const to = SRC.indexOf("\nasync function publishBuild(");
assert.ok(from > 0 && to > from, "recordUsage() must exist");
const recordUsage = new Function("persist", "console", `${SRC.slice(from, to)}\nreturn recordUsage;`)(
  () => {}, { log() {} });

const run = (costs, usage) => {
  const s = {};
  for (const c of costs) recordUsage(s, { cost: c, usage: usage || { input_tokens: 1, cache_read_input_tokens: 99, output_tokens: 1 } });
  return s;
};

test("a session's spend is the DELTA per turn — the raw field is cumulative", () => {
  // one CLI session reporting a running total: the build cost 2.50, not 1 + 1.5 + 2.5 = 5.00
  const s = run([1.0, 1.5, 2.5]);
  assert.equal(Number(s.spendUsd.toFixed(2)), 2.5, "summing the cumulative field bills early turns again and again");
  assert.equal(s.usageTotals.turns, 3);
});

test("a drop means a NEW child process — that reading is already a delta", () => {
  // resume spawns a fresh conductor and the counter restarts. 1.00 + 3.00 (delta) + 0.75 (restart —
  // the reading IS the delta) + 0.50 (delta again) = 5.25. Never a negative, which is what
  // subtracting blindly across the restart would produce.
  const s = run([1.0, 4.0, 0.75, 1.25]);
  assert.equal(Number(s.spendUsd.toFixed(2)), 5.25);
});

test("cost is counted even when a turn reports no token usage", () => {
  // the two fields are independent on the result; accounting cost inside the usage branch drops it
  const s = {};
  recordUsage(s, { cost: 3.0 });          // no `usage` key at all
  assert.equal(s.spendUsd, 3.0, "a turn that billed dollars must not contribute zero");
  assert.equal(s.usageTotals, undefined, "and it must not invent token totals it was never given");
});

test("token totals accumulate across turns", () => {
  const s = run([1, 2]);
  assert.equal(s.usageTotals.cached, 198);
  assert.equal(s.usageTotals.out, 2);
});

test("publicSession exposes usage ONLY to a platform admin — cost is not shown inside the app", () => {
  const pub = SRC.slice(SRC.indexOf("function publicSession(s, me) {"), SRC.indexOf("\nasync function withRemoteArtifacts("));
  assert.match(pub, /usage:/, "the readout has nothing to render without this");
  assert.match(pub, /perTurn/, "tokens-per-turn is the number that EXPLAINS the bill — cost tracks context size");
  assert.match(pub, /cacheHit/);
  // ADMIN-ONLY: the usage field is gated behind me.role === "admin", so a regular member of an app
  // watching a build sees no cost. Fails safe — an absent/unknown `me` is not an admin.
  assert.match(pub, /me\?\.role === "admin" && s\.usageTotals/,
    "usage must be gated to a platform admin — a member must not see the spend");
});

// CACHE WRITES ARE THE EXPENSIVE HALF and were missing from every number here. input_tokens,
// cache_read_input_tokens and cache_creation_input_tokens are DISJOINT parts of one request's input;
// a ratio over the first two calls a session that re-cached its whole context "100% hit". That is
// how baseline-kissflow-spec reported ~$25 of measurable tokens against a $235 bill: 26 turns of a
// 2.66M-token context, most of them REBUILDING the cache at ~12x a read rather than reusing it.
test("write tokens are counted, not silently dropped", () => {
  const s = run([1], { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 2_600_000, output_tokens: 500 });
  assert.equal(s.usageTotals.written, 2_600_000, "the field that dominates the bill cannot be missing from the total");
});

test("a turn that RE-CACHED its context does not report a high cache hit", () => {
  // read-only denominator: 0/(10+0) = 0%... but with a 2.6M write it must not read as healthy either
  const s = run([1], { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 2_600_000, output_tokens: 5 });
  const t = s.usageTotals;
  const cheap = Math.round((t.cached / (t.fresh + t.cached + t.written)) * 100);
  assert.ok(cheap < 1, `re-caching must not present as a good ratio (got ${cheap}%)`);
  assert.ok(t.written > t.cached, "and the re-caching condition the UI warns on must hold");
});

test("context per turn includes what was written, or it understates the bill", () => {
  const s = run([1, 2], { input_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, output_tokens: 10 });
  const t = s.usageTotals;
  const perTurn = Math.round((t.fresh + t.cached + t.written) / t.turns);
  assert.equal(perTurn, 2_000_000, "2M of input per turn, half of it written — omitting writes halves the figure");
});
