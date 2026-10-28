// The final PDF's home (plan v5 §10, S-2 proven live 14 Oct): render the final document and attach it to
// CIQ_Case_A00.Final_PDF through the admin attachment route, BEFORE the case's last step is submitted (the service never
// writes an ended item). Idempotent: the PDF name is fixed per case, so a replay finds the file it already attached.

import { FLOW, F } from "./ids.mjs";
import { renderFinalPdf, pdfSha256, finalPdfName } from "./pdf.mjs";

export function kissflowAttacher(port) {
  return {
    async attach({ caseCode, caseItemId, document, seal }) {
      const name = finalPdfName(caseCode);
      const item = await port.getProcessItemAdmin(FLOW.caseProc, caseItemId);
      const existing = (item?.[F.caseProc.finalPdf] ?? []).find((a) => a.name === name);
      if (existing) return { attached: true, where: `CIQ_Case_A00.Final_PDF ${existing.id} (already attached)`, id: existing.id };
      const bytes = renderFinalPdf(document, seal);
      const added = await port.attachFile(FLOW.caseProc, caseItemId, F.caseProc.finalPdf, { name, bytes, contentType: "application/pdf" });
      return { attached: true, where: `CIQ_Case_A00.Final_PDF ${added.id}${added.dry ? " (dry-run)" : ""}`, id: added.id, pdfSha256: pdfSha256(bytes), size: bytes.length };
    },
  };
}

/** For hosts without the file transport: the document JSON and its seal are still filed; the PDF is not. */
export const notAttached = { attach: async () => ({ attached: false, note: "not attached: no file transport configured" }) };
