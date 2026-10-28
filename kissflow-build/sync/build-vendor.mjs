#!/usr/bin/env node
// Bundles the prototype's domain modules (read-only) into vendor/domain.mjs with the prototype's own esbuild.
// Usage: node kissflow-build/sync/build-vendor.mjs
// The prototype folder is never written: esbuild reads prototype/src/domain/*.ts and writes only into sync/vendor/.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const esbuild = resolve(root, "prototype/node_modules/.bin/esbuild");
if (!existsSync(esbuild)) throw new Error(`esbuild not found at ${esbuild} (run npm install in prototype/ first)`);
const out = resolve(here, "vendor/domain.mjs");

execFileSync(esbuild, [resolve(here, "vendor-entry.ts"), "--bundle", "--format=esm", "--platform=node", "--target=node20", `--outfile=${out}`, "--log-level=warning"], { stdio: "inherit" });

// Provenance: which prototype sources went in (hash per file), so a stale vendor bundle is visible.
const domainDir = resolve(root, "prototype/src/domain");
const files = ["actions", "core", "catalog", "rules", "builtinRules", "conditions", "configActions", "requestedDocs", "selectors", "finalDocument", "reminders", "mail", "mentions", "permissions", "invariants", "seed", "suppliers", "referenceMaterials", "richFixture", "types"];
const sources = Object.fromEntries(files.map((f) => [f, createHash("sha256").update(readFileSync(resolve(domainDir, `${f}.ts`))).digest("hex").slice(0, 16)]));
writeFileSync(resolve(here, "vendor/PROVENANCE.json"), JSON.stringify({ builtAt: new Date().toISOString(), entry: "vendor-entry.ts", bundle: "domain.mjs", sha256: createHash("sha256").update(readFileSync(out)).digest("hex"), sources }, null, 2) + "\n");
console.log(`vendor/domain.mjs written (${readFileSync(out).length} bytes)`);
