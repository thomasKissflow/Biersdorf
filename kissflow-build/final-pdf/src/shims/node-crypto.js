// node:crypto stand-in for the bundle. sync/pdf.mjs imports createHash for pdfSha256, which the bundle never calls:
// the host computes the SHA-256 of the PDF (Utilities.computeDigest in Apps Script, node:crypto in the tests).
export function createHash() {
  throw new Error("createHash is not available in the bundle: the host computes the SHA-256");
}
