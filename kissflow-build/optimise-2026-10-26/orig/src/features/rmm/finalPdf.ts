// The final document as a PDF in the browser (Thomas, 22 Oct): exactly the Apps Script's PDF (kissflow-build/final-pdf:
// entry.ts renderPdf = its display copy of the document, sync/pdf.mjs with the same patches, vite.finalpdf.ts), with
// its dates in Europe/Berlin as the service's TIME_ZONE prints them ("9 Oct 2026, 14:05 CEST"; a date without a time
// "9 Oct 2026"). Pure: the tab makes the Blob and the download.
import type { FinalDocument } from "@/domain/types";
import { pdfName, renderPdf } from "../../../../kissflow-build/final-pdf/src/entry";

export const PDF_TIME_ZONE = "Europe/Berlin";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Apps Script's dateFormatter_ (Code.gs): 'd MMM yyyy, HH:mm z' in the zone, a date-only value 'd MMM yyyy' in UTC. */
export function pdfDate(iso: string, timeZone = PDF_TIME_ZONE): string {
  const s = String(iso);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: dateOnly ? "UTC" : timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  const day = `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
  return dateOnly ? day : `${day}, ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}

/** The PDF's bytes and file name (<Case_Code>-final-document.pdf). */
export function finalPdfOf(d: FinalDocument, timeZone = PDF_TIME_ZONE): { bytes: Uint8Array; name: string } {
  return { bytes: renderPdf(d, { formatDateTime: (iso) => pdfDate(iso, timeZone) }), name: pdfName(d.header.caseId) };
}
