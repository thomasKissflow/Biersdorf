// The exact text patches build.mjs (and the app's vite plugin, prototype/vite.finalpdf.ts) apply to
// kissflow-build/sync/pdf.mjs while bundling (the file on disk is never changed). Each `from` must match exactly once,
// or the build stops: pdf.mjs changed, so these need a look.
//
// Why: pdf.mjs lays the document out as the app's Final document tab (FinalDocumentTab.tsx) and dates it with
// setDateFormat, but as written it describes the seal of the retired sync service (the SHA-256 of the document's
// canonical JSON on CIQ Case Data). The patch gives it the app's document seal: the page footer
// "<Case_Code>-FD · document seal <seal>", the closing note (the PDF's SHA-256 is filed on the case), and the PDF's
// producer and subject ("document seal <seal>", which Code.gs reads back to recognise its own file).
// The labels themselves (markets, origins, kinds, actions, applicability) come from entry.ts displayCopy.
const L = (...lines) => lines.join("\n");

export const pdfPatches = [
  {
    what: "the app's document seal: page footer, closing note, PDF producer and subject (the service reads the seal back from the subject)",
    from: L(
      "const SEAL = {",
      "  footer: (h, seal) => `Document seal (SHA-256 of the final document JSON): ${seal}`,",
      "  note: (seal) => `Document seal: SHA-256 ${seal} over the canonical JSON of this final document (keys sorted, no whitespace). The JSON is filed on the case data; the seal can be recomputed at any time.`,",
      '  producer: "CIQ Sync Service",',
      "  subject: (seal) => `seal sha256:${seal}`,",
      "};",
    ),
    to: L(
      "const SEAL = {",
      "  footer: (h, seal) => `${h.caseId}-FD · document seal ${seal}`,",
      '  note: () => "The SHA-256 of this PDF is filed on the case (Final Document Hash).",',
      '  producer: "CIQ final document service",',
      "  subject: (seal) => `document seal ${seal}`,",
      "};",
    ),
  },
];
