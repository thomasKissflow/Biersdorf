// Entry for `node --test kissflow-build/sync/test/` (Node 22 resolves the folder through package.json "main").
// Every *.test.mjs file of this folder registers its tests here, in one process.
import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(here).filter((x) => x.endsWith(".test.mjs")).sort()) await import(pathToFileURL(`${here}/${f}`).href);
