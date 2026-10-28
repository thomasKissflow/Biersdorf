// The final PDF in the screens (Thomas, 22 Oct: "Download PDF" on the Final document tab), built exactly as the Apps
// Script's bundle (kissflow-build/final-pdf/build.mjs): kissflow-build/sync/pdf.mjs with the same exact text patches
// (final-pdf/src/pdf-patches.mjs; a patch that no longer matches exactly once stops the build), node:crypto as the
// bundle's shim (createHash is never called: the PDF's own SHA-256 is the service's) and the bundle's Buffer stand-in
// (latin-1 strings only). The file on disk is never changed. Used by the app's, the prototype's and the tests' configs.
import path from "node:path";
import type { Plugin } from "vite";
import { pdfPatches } from "../kissflow-build/final-pdf/src/pdf-patches.mjs";

const KB = path.resolve(__dirname, "../kissflow-build");
const SHIMS = path.join(KB, "final-pdf/src/shims");

/** The directories the screens import the final PDF from (the dev server's fs.allow). */
export const FINAL_PDF_DIRS = [path.join(KB, "final-pdf/src"), path.join(KB, "sync")];

const PDF = /[\\/]kissflow-build[\\/]sync[\\/]pdf\.mjs$/;
const isPdf = (id: string | undefined) => !!id && PDF.test(id.split("?")[0]!);

export function finalPdf(): Plugin {
  return {
    name: "final-pdf-patches",
    enforce: "pre",
    // node:crypto only for pdf.mjs (the tests' own node:crypto stays Node's)
    resolveId(source, importer) {
      return source === "node:crypto" && isPdf(importer) ? path.join(SHIMS, "node-crypto.js") : null;
    },
    transform(code, id) {
      if (!isPdf(id)) return null;
      let text = code;
      for (const p of pdfPatches) {
        const n = text.split(p.from).length - 1;
        if (n !== 1) throw new Error(`sync/pdf.mjs patch "${p.what}" matches ${n} times (expected 1): pdf.mjs changed, update final-pdf/src/pdf-patches.mjs`);
        text = text.replace(p.from, () => p.to);
      }
      return { code: `import { Buffer } from ${JSON.stringify(path.join(SHIMS, "buffer.js"))};\n${text}`, map: null };
    },
  };
}
