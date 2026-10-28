#!/usr/bin/env node
// Renders sample PDFs of the final document into out/samples/, with the Apps Script bundle (apps-script/Bundle.gs:
// the same bytes as the app's "Download PDF") and dates in Europe/Berlin as the service prints them:
//   ZZT-0005-final-document.pdf  the fixture case (the offline test's parity case: 2 open points, 7 documents)
//   ZZT-0099-final-document.pdf  a fictional long case (test/long-case.mjs): 10 open points over up to 4 rounds, long
//                                answers (one taller than a page), 26 components, 26 documents, umlauts and accents
// On macOS it also writes PNGs of the pages: <name>-page-1.png with sips, and every page with PDFKit (osascript).
// Offline: no network, no .env. Reads the prototype read-only. Usage: node kissflow-build/final-pdf/test/samples.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { longCase } from "./long-case.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const OUT = resolve(here, "../out/samples");
mkdirSync(OUT, { recursive: true });

// the app's fingerprintOf (domain/finalDocument.ts), to seal the long case as the app would
const tmp = resolve(here, ".tmp-samples");
mkdirSync(tmp, { recursive: true });
let fingerprintOf;
try {
  const esbuild = await import(pathToFileURL(resolve(root, "prototype/node_modules/esbuild/lib/main.js")).href);
  writeFileSync(resolve(tmp, "entry.ts"), `export { fingerprintOf } from "../../../../prototype/src/domain/finalDocument";\n`);
  await esbuild.build({ entryPoints: [resolve(tmp, "entry.ts")], bundle: true, format: "esm", platform: "node", target: "node20", outfile: resolve(tmp, "fp.mjs"), tsconfig: resolve(root, "prototype/tsconfig.json"), logLevel: "warning" });
  ({ fingerprintOf } = await import(pathToFileURL(resolve(tmp, "fp.mjs")).href));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const seal = (doc) => {
  const { fingerprint: _omit, ...rest } = doc;
  return { ...rest, fingerprint: fingerprintOf(JSON.stringify(rest)) };
};

// the service's dates (Code.gs dateFormatter_, as prototype/src/features/rmm/finalPdf.ts pdfDate)
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function berlin(iso) {
  const s = String(iso);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: dateOnly ? "UTC" : "Europe/Berlin", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const day = `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}`;
  return dateOnly ? day : `${day}, ${p.hour}:${p.minute} ${p.timeZoneName}`;
}

const ctx = vm.createContext({});
vm.runInContext(readFileSync(resolve(here, "../apps-script/Bundle.gs"), "utf8"), ctx, { filename: "Bundle.gs" });
const render = vm.runInContext("(d, f) => ({ ok: CIQFinal.verifyFinalDocument(d), bytes: CIQFinal.renderPdf(d, { formatDateTime: f }), name: CIQFinal.pdfName(d.header.caseId) })", ctx);

const fx = JSON.parse(readFileSync(resolve(here, "fixtures/kissflow.json"), "utf8"));
const typical = fx.expected["ZZT-0005"].doc;
const docs = [typical, seal(longCase(typical))];

for (const f of readdirSync(OUT)) if (/\.(pdf|png)$/.test(f)) rmSync(resolve(OUT, f));
const mac = process.platform === "darwin";
const jxa = resolve(OUT, ".pages.js");
if (mac)
  writeFileSync(
    jxa,
    `ObjC.import("Quartz"); ObjC.import("AppKit");
function run(a) { const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(a[0])); const W = Number(a[2]);
  for (let i = 0; i < doc.pageCount; i++) { const p = doc.pageAtIndex(i); const b = p.boundsForBox($.kPDFDisplayBoxMediaBox);
    const img = p.thumbnailOfSizeForBox($.NSMakeSize(W, Math.round((W * b.size.height) / b.size.width)), $.kPDFDisplayBoxMediaBox);
    $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation).representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(a[1] + "-page-" + (i + 1) + ".png", true); }
  return String(doc.pageCount); }
`,
  );
try {
  for (const doc of docs) {
    const r = render(JSON.parse(JSON.stringify(doc)), berlin);
    if (!r.ok) throw new Error(`${doc.header.caseId}: the seal does not verify`);
    const file = resolve(OUT, r.name);
    const bytes = Buffer.from(Uint8Array.from(r.bytes));
    writeFileSync(file, bytes);
    const pages = (bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    let png = "";
    if (mac) {
      const base = file.replace(/\.pdf$/, "");
      try {
        execFileSync("sips", ["-s", "format", "png", file, "--out", `${base}-page-1.png`], { stdio: "ignore" });
        execFileSync("osascript", ["-l", "JavaScript", jxa, file, base, "1240"], { stdio: ["ignore", "ignore", "ignore"] });
        png = `, PNGs ${base.split("/").pop()}-page-1…${pages}.png`;
      } catch (e) {
        png = `, no PNG (${String(e.message).split("\n")[0]})`;
      }
    }
    console.log(`out/samples/${r.name}: ${pages} pages, ${bytes.length} bytes, seal ${doc.fingerprint}${png}`);
  }
} finally {
  if (existsSync(jxa)) rmSync(jxa);
}
