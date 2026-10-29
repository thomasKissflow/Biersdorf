// Bundle leak scan (28 Oct, BDF's RMES e-mail: "suppliers must have no access to it in any form"). The supplier sees
// the portal, the mails the app sends to its contacts and what the app hands to the portal; none of them may carry the
// internal RMES: the word, the retired criteria RMES (its criterion titles, the canned AI text, its history label, the
// finding question's justification) or the 8-field sheet's own labels.
// Targets:
//  - portal: the BUILT supplier portal, dist-portal/zip/index.html (`npm run build:portal` first). It bundles the shared
//    domain, which is how the criteria texts reached the supplier's browser before 28 Oct.
//  - app-supplier: the parts of the live app (dist-applive) that face the supplier, bundled from their sources with
//    esbuild in memory, tree-shaken as the app build is: the supplier mails (app-live/write/mail.ts MAILS, the shared
//    e-mail layout, domain/mail.ts supplierMail) and the questions history the portal receives
//    (app-live/shared/questionsHistory.ts). The whole app bundle is internal and names the RMES on purpose.
//  - app: the BUILT live app, dist-applive/zip/index.html (`npm run build:applive` first), for the retired criteria
//    RMES only (RETIRED_TERMS): internal or not, nothing of it is left on any screen.
// Reports each term's count only, never the text around a hit (the portal bundle carries a webhook token).
//   node scripts/leak-scan.mjs        exit 1 on any hit; scripts/harness-portal.mjs runs it as its bundle-leak scenario,
//                                     scripts/harness-applive.mjs the app's retired-terms check (rmes-sheet)
// Reads nothing but dist-portal/, dist-applive/ and src/: no .env, no credentials; writes nothing.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The retired criteria RMES (until 28 Oct): no screen of the app or the portal carries it. Plain strings, matched as
 *  written (case-sensitive). */
export const RETIRED_TERMS = [
  // its criterion titles (domain/actions.ts rmesCriteria until 28 Oct)
  "INCI and CAS of every component are consistent",
  "EU REACH registration status listed",
  "Status under Reg. 1223/2009 Annexes",
  "Animal testing statement available",
  "Byproducts and contaminants within BDF limits",
  "Toxicological profile available and plausible",
  "Nanomaterial status plausible",
  "MOAH value assessed against BDF threshold",
  "Pesticide analysis available or justified",
  "Listed in the chemical inventories of all target markets",
  "Overall safety conclusion documented",
  // its canned AI suggestion, its history label and the finding question's justification
  "acute oral toxicity",
  "Recorded RMES result",
  "Needed for the internal evaluation",
];

/** What a supplier may never be shown: the word, the retired criteria RMES and the 8-field sheet's own labels. */
export const LEAK_TERMS = [
  "RMES",
  ...RETIRED_TERMS,
  // the 8-field sheet's own labels (domain/rmesSheet.ts, features/review/RmesTab.tsx)
  "Raw Material Evaluation Sheet",
  "Raw material / tradename",
  "filled automatically from the CIQ",
  "once per origin type",
  "per origin type (K2.3)",
  // what the RMES is, in other words (29 Oct review: the shared domain's persona and audit texts said so)
  "internal evaluation",
  "evaluation sheet",
];

/** The terms found in a text, with their counts (no context). `fieldIds`: Kissflow field ids such as RMES_Decision are
 *  code, not text (the app's step tables in app-live/ids.ts, which every app module that names the app id pulls in),
 *  so they are left out first; the portal is scanned without that allowance. `terms`: LEAK_TERMS unless given (the
 *  whole app is scanned for RETIRED_TERMS only). */
export function leakHits(text, { fieldIds = false, terms = LEAK_TERMS } = {}) {
  const t = fieldIds ? text.replace(/\bRMES_[A-Z][A-Za-z_]*/g, "") : text;
  return terms.map((term) => ({ term, n: t.split(term).length - 1 })).filter((h) => h.n > 0);
}

/** The built portal's index.html; null when it was not built. */
export function portalBundle() {
  const f = path.join(root, "dist-portal", "zip", "index.html");
  return existsSync(f) ? readFileSync(f, "utf8") : null;
}

/** The built live app's index.html; null when it was not built. */
export function appBundle() {
  const f = path.join(root, "dist-applive", "zip", "index.html");
  return existsSync(f) ? readFileSync(f, "utf8") : null;
}

/** The supplier-facing parts of the live app, bundled in memory (minified, tree-shaken; CSS and assets left out). */
export async function appSupplierBundle() {
  const esbuild = await import(pathToFileURL(path.join(root, "node_modules/esbuild/lib/main.js")).href);
  const entry = [
    'export { MAILS } from "@/app-live/write/mail";',
    'export { emailHtml, EMAIL_AUDIENCE } from "@/domain/emailHtml";',
    'export { supplierMail } from "@/domain/mail";',
    'export { questionsHistory, supplierPointView } from "@/app-live/shared/questionsHistory";',
  ].join("\n");
  const r = await esbuild.build({
    stdin: { contents: entry, resolveDir: root, loader: "ts" },
    absWorkingDir: root,
    bundle: true,
    write: false,
    minify: true,
    treeShaking: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    alias: { "@": path.join(root, "src") },
    tsconfig: path.join(root, "tsconfig.json"),
    loader: { ".css": "empty", ".webp": "empty", ".png": "empty", ".svg": "empty", ".woff": "empty", ".woff2": "empty", ".ttf": "empty" },
    define: { "import.meta.env.DEV": "false", "import.meta.env.PROD": "true", "import.meta.env.MODE": '"production"', "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  return r.outputFiles[0].text;
}

/** The three targets: [{ target, size, hits }]; a target that could not be read has `missing`. */
export async function scanAll() {
  const portal = portalBundle();
  const app = await appSupplierBundle();
  const whole = appBundle();
  const built = (target, text, opts) => (text === null ? { target, missing: true, hits: [] } : { target, size: text.length, hits: leakHits(text, opts) });
  return [
    built("portal (dist-portal/zip/index.html)", portal),
    { target: "app-supplier (live app mails and questions history)", size: app.length, hits: leakHits(app, { fieldIds: true }) },
    built("app (dist-applive/zip/index.html, the retired criteria RMES only)", whole, { terms: RETIRED_TERMS }),
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = await scanAll();
  let bad = false;
  for (const r of res) {
    if (r.missing) {
      bad = true;
      console.log(`MISSING ${r.target}: run npm run build:${r.target.startsWith("portal") ? "portal" : "applive"} first`);
      continue;
    }
    bad ||= r.hits.length > 0;
    console.log(`${r.hits.length ? "LEAK" : "clean"} ${r.target}, ${(r.size / 1024).toFixed(0)} KB${r.hits.length ? ": " + r.hits.map((h) => `"${h.term}" ×${h.n}`).join(", ") : ""}`);
  }
  console.log(`${LEAK_TERMS.length} terms checked (${RETIRED_TERMS.length} of them in the whole app)`);
  process.exit(bad ? 1 : 0);
}
