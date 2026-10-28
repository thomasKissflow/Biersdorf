#!/usr/bin/env node
// seed-digest.mjs — the schema of parts/seed.html, without the rows.
//
// WHY. The parts contract's hardest rule is "never guess seed field names or status literals" —
// which agents satisfied by reading the whole seed part (~17k tokens of ROWS) when what the rule
// actually requires is the SCHEMA: exact keys per entity, the status vocabularies, the helper
// names, and a couple of sample rows to see the shapes. On a 7-role fan-out that is ~120k tokens
// of identical row-reading replaced by ~2k of digest per agent. Rows still exist at runtime —
// every widget computes from window.SEED — the digest only changes what an agent READS while
// authoring.
//
// The digest is DERIVED, never authored: it executes the seed's own <script> in a sandbox and
// reports what is actually there, so it cannot drift from the seed the way a hand-written summary
// would. If evaluation fails, this tool fails loudly — a digest silently missing an entity would
// re-create the exact guess-the-key bug the contract rule exists to stop.
//
//   node engine/seed-digest.mjs <runDir>/prototype/parts/seed.html --out <runDir>/prototype/briefs/seed-digest.json
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const ENUM_MAX = 14;     // a string field with ≤14 distinct values is a vocabulary worth listing
const SAMPLES = 2;

export function digestSeed(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  if (!scripts.length) throw new Error("no <script> blocks in the seed part");
  // The seed script writes onto window (SEED, helpers) and then reads its own globals BARE
  // (`SEED[...]` not `window.SEED[...]`) — in a browser those are the same object, so the sandbox
  // must reproduce that: window IS the global scope here. document/localStorage stubs exist only
  // so an incidental reference cannot crash evaluation — the digest reads the globals alone.
  const sandbox = { document: { getElementById: () => null, querySelector: () => null }, console, localStorage: { getItem: () => null, setItem: () => {} } };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // Per-script tolerance, not per-file: a seed block can carry trailing runtime code that needs a
  // real DOM (one real seed ended with role-switcher boot code and failed on the stub AFTER all 20
  // entities were defined). The loud-failure guarantee this tool promises is about the DATA — it
  // moves to the SEED check below, which still refuses to emit a digest when evaluation produced
  // no entities at all.
  const evalErrors = [];
  for (const s of scripts) { try { vm.runInContext(s, sandbox, { timeout: 5000 }); } catch (e) { evalErrors.push(e.message); } }
  const STUBS = new Set(["window", "globalThis", "document", "console", "localStorage"]);
  const windowStub = Object.fromEntries(Object.entries(sandbox).filter(([k]) => !STUBS.has(k)));
  const SEED = windowStub.SEED;
  if (!SEED || typeof SEED !== "object") throw new Error(`evaluating the seed scripts produced no window.SEED — digest refused (a partial digest recreates the guess-the-key bug)${evalErrors.length ? `; script errors: ${evalErrors.join(" | ")}` : ""}`);

  const entities = {}, other = {};
  for (const [name, val] of Object.entries(SEED)) {
    if (Array.isArray(val) && val.length && typeof val[0] === "object") {
      const keys = [], seen = new Set();
      for (const row of val) for (const k of Object.keys(row)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
      // A vocabulary, not just "few distinct values": on a 9-row entity EVERY string field has ≤14
      // distinct values, which pulled free-text descriptions and _ids into the first digest and
      // tripled its size. An enum is a field whose values REPEAT across rows (or a very small,
      // short set), never an identifier, never prose-length text — those the sample rows carry.
      const enums = {};
      for (const k of keys) {
        if (/_?ids?$/i.test(k)) continue;
        const strs = val.map((r) => r[k]).filter((v) => typeof v === "string");
        if (strs.length !== val.length || !strs.length) continue;
        const vals = [...new Set(strs)];
        const avgLen = strs.reduce((a, v) => a + v.length, 0) / strs.length;
        const repeats = vals.length < strs.length;
        if (vals.length <= ENUM_MAX && avgLen <= 40 && (repeats || vals.length <= 6)) enums[k] = vals;
      }
      entities[name] = { rows: val.length, keys, enums, sample: val.slice(0, SAMPLES) };
    } else {
      other[name] = val; // lists, `today`, scalars — small by construction, pass through whole
    }
  }
  const helpers = Object.keys(windowStub).filter((k) => typeof windowStub[k] === "function").sort();
  return {
    _contract: "DERIVED digest of parts/seed.html — exact entity keys, status vocabularies (enums), helpers and 2 sample rows per entity. Author against THIS; the full rows exist at runtime as window.SEED. If an entity or key you need is missing here, the digest generation is stale — regenerate it; never guess and never read the whole seed part.",
    entities, ...Object.keys(other).length ? { other } : {}, helpers,
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const src = process.argv[2];
  const oi = process.argv.indexOf("--out");
  if (!src) { console.error("usage: seed-digest.mjs <parts/seed.html> [--out digest.json]"); process.exit(2); }
  try {
    const d = digestSeed(readFileSync(src, "utf8"));
    const json = JSON.stringify(d, null, 1);
    if (oi >= 0) { writeFileSync(process.argv[oi + 1], json + "\n"); console.log(`seed digest → ${process.argv[oi + 1]} (${Math.round(json.length / 1000)}k chars, ~${Math.round(json.length / 4000)}k tokens; seed part ~${Math.round(readFileSync(src, "utf8").length / 4000)}k) · ${Object.keys(d.entities).length} entities · ${d.helpers.length} helpers`); }
    else process.stdout.write(json + "\n");
  } catch (e) { console.error(`seed-digest: ${e.message}`); process.exit(1); }
}
