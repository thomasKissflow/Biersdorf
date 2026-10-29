#!/usr/bin/env node
// Bundles src/entry.ts (the live mapper + the final-document builder + sync/pdf.mjs) into apps-script/Bundle.gs, one
// IIFE with the global CIQFinal, with the prototype's own esbuild. Usage: node kissflow-build/final-pdf/build.mjs
// Idempotent: the same sources give the same Bundle.gs and PROVENANCE.json (no build time inside). Reads the prototype
// and sync/ read-only; writes only apps-script/Bundle.gs and PROVENANCE.json in this folder.
//
// sync/pdf.mjs is imported as it is (it lays the document out as the app's Final document tab), with exact text patches
// applied while bundling (src/pdf-patches.mjs): the app's document seal in place of the retired Case Data seal. A
// patch that no longer matches exactly once stops the build. The bundle runs in strict mode ("use strict" is the file's
// first statement, ahead of the polyfills).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pdfPatches } from "./src/pdf-patches.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const esbuildMain = resolve(root, "prototype/node_modules/esbuild/lib/main.js");
if (!existsSync(esbuildMain)) throw new Error(`esbuild not found at ${esbuildMain}`);
const esbuild = await import(pathToFileURL(esbuildMain).href);

const OUT = resolve(here, "apps-script/Bundle.gs");
const PDF = resolve(root, "kissflow-build/sync/pdf.mjs");


const patchPdf = {
  name: "patch-pdf",
  setup(b) {
    b.onLoad({ filter: /[\\/]sync[\\/]pdf\.mjs$/ }, (args) => {
      let text = readFileSync(args.path, "utf8");
      for (const p of pdfPatches) {
        const n = text.split(p.from).length - 1;
        if (n !== 1) throw new Error(`sync/pdf.mjs patch "${p.what}" matches ${n} times (expected 1): pdf.mjs changed, update src/pdf-patches.mjs`);
        text = text.replace(p.from, () => p.to);
      }
      return { contents: text, loader: "js" };
    });
  },
};

// Host globals Apps Script does not have: any reference becomes a marker the check below refuses.
const FORBIDDEN = ["window", "document", "process", "navigator", "localStorage", "sessionStorage", "fetch", "crypto", "TextEncoder", "TextDecoder", "structuredClone", "setTimeout", "require", "URL"];
const define = Object.fromEntries([...FORBIDDEN.map((g) => [g, `__forbidden_${g}__`]), ["globalThis.crypto", "__forbidden_crypto__"], ["import.meta.env", "__forbidden_import_meta_env__"]]);

const result = await esbuild.build({
  entryPoints: [resolve(here, "src/entry.ts")],
  absWorkingDir: root, // path comments and metafile inputs relative to the repo root, whatever the cwd
  bundle: true,
  write: false,
  format: "iife",
  globalName: "CIQFinal",
  platform: "browser",
  target: "es2017",
  // No `charset: "utf8"`: esbuild's default ASCII output writes \u escapes, so a paste into the Apps Script editor
  // cannot drop or turn into line breaks the zero-width characters and the WinAnsi ellipsis (U+0085) in the strings.
  legalComments: "none",
  tsconfig: resolve(root, "prototype/tsconfig.json"),
  alias: { "node:crypto": resolve(here, "src/shims/node-crypto.js") },
  inject: [resolve(here, "src/shims/buffer.js")],
  define,
  plugins: [patchPdf],
  metafile: true,
  logLevel: "warning",
});

// esbuild's own "use strict" moves to the top of the file (see `out`), ahead of the polyfills.
const code = result.outputFiles[0].text.replace(/^"use strict";\n/, "");
const problems = [];
for (const m of new Set(code.match(/__forbidden_[A-Za-z_]+__/g) ?? [])) problems.push(`references ${m.replace(/^__forbidden_|__$/g, "")}`);
for (const bad of ["DEV_WEBHOOKS", "/webhook/", "hooks.kissflow", "X-Access-Key"]) if (code.includes(bad)) problems.push(`contains "${bad}"`);
if (/\bsubtle\b/.test(code)) problems.push("contains WebCrypto (subtle)");
if (problems.length) throw new Error(`Bundle refused: ${problems.join("; ")}`);

// Provenance: every bundled source with its hash (sorted), so a stale Bundle.gs is visible.
// The build's own inputs (this file, the patches) count too: changing them makes Bundle.gs stale.
const inputs = [...Object.keys(result.metafile.inputs).map((p) => resolve(root, p)), resolve(here, "build.mjs"), resolve(here, "src/pdf-patches.mjs")].sort();
const sources = Object.fromEntries(inputs.map((p) => [relative(root, p), createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16)]));
const sourcesHash = createHash("sha256").update(JSON.stringify(sources)).digest("hex").slice(0, 16);

const polyfills = `// Built-ins the mappers use that Apps Script's V8 may lack (each defined only when missing).
(function () {
  function def(o, k, v) { if (typeof o[k] !== "function") Object.defineProperty(o, k, { value: v, writable: true, configurable: true }); }
  function at(n) { var len = this.length; n = Math.trunc(n) || 0; if (n < 0) n += len; return n < 0 || n >= len ? undefined : this[n]; }
  def(Array.prototype, "at", at);
  def(String.prototype, "at", function (n) { var v = at.call(String(this), n); return v === undefined ? undefined : String(v); });
  def(Array.prototype, "findLast", function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return this[i]; return undefined; });
  def(Array.prototype, "findLastIndex", function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return i; return -1; });
  def(Object, "hasOwn", function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); });
  def(String.prototype, "replaceAll", function (a, b) {
    if (a instanceof RegExp) return String(this).replace(a, b);
    return String(this).replace(new RegExp(String(a).replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&"), "g"), b);
  });
})();
`;

const header = `// Bundle.gs: GENERATED by kissflow-build/final-pdf/build.mjs. Do not edit; rebuild instead.
// The global CIQFinal: finalDocumentFor (the app's live mapper + buildFinalDocument), renderPdf (sync/pdf.mjs),
// displayCopy, signedBytes, pdfName, verifyFinalDocument. Sources ${sourcesHash} (PROVENANCE.json).
`;
const out = `${header}"use strict";\n${polyfills}${code}CIQFinal.BUILD = ${JSON.stringify(sourcesHash)};\n`;
writeFileSync(OUT, out);
const sha256 = createHash("sha256").update(out).digest("hex");
writeFileSync(resolve(here, "PROVENANCE.json"), JSON.stringify({ entry: "src/entry.ts", bundle: "apps-script/Bundle.gs", sha256, sourcesHash, pdfPatches: pdfPatches.map((p) => p.what), sources }, null, 2) + "\n");
console.log(`apps-script/Bundle.gs written: ${Buffer.byteLength(out)} bytes (${(Buffer.byteLength(out) / 1024).toFixed(1)} KB), ${inputs.length} sources, ${pdfPatches.length} pdf.mjs patches, build ${sourcesHash}`);
