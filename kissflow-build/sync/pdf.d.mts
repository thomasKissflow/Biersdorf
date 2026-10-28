// Types of pdf.mjs for the TypeScript that imports it (kissflow-build/final-pdf/src/entry.ts, through the app's Final
// document tab). Every bundle that imports it applies the final-pdf patches (final-pdf/src/pdf-patches.mjs: the app's
// document seal wording), in final-pdf/build.mjs and prototype/vite.finalpdf.ts.
export function winAnsi(text: string): string;
/** The PDF bytes of a final document (its display copy) with its seal, laid out as the app's Final document tab.
 *  `verified`: whether the seal was checked against the content (the header badge; left out: a neutral badge). */
export function renderFinalPdf(doc: unknown, seal: string, opts?: { verified?: boolean }): Uint8Array;
export function pdfSha256(bytes: Uint8Array): string;
export function finalPdfName(caseCode: string): string;
/** The date renderer for the next renders (default UTC). */
export function setDateFormat(f: ((iso: string) => string) | undefined): void;
