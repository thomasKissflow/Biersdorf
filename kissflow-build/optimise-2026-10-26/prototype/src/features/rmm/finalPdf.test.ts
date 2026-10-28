// The tab's PDF is the final-document service's PDF: the same bytes as the Apps Script bundle
// (kissflow-build/final-pdf/apps-script/Bundle.gs, CIQFinal.renderPdf) for the same document and date format, and its
// dates as the service prints them in Europe/Berlin.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { toAppState } from "@/app-live/map/toAppState";
import { fixtureInput } from "@/app-live/testing/rawFixtures";
import { verifyFinalDocument } from "@/domain/finalDocument";
import { finalPdfOf, pdfDate } from "./finalPdf";

const BUNDLE = fileURLToPath(new URL("../../../../kissflow-build/final-pdf/apps-script/Bundle.gs", import.meta.url));
const latin1 = (b: Uint8Array) => String.fromCharCode(...b);

describe("Download PDF: the final-document service's PDF", () => {
  const c = toAppState(fixtureInput("rmm")).state.cases.find((x) => x.id === "ZZT-0005")!;

  it("ZZT-0005 is completed and carries its sealed final document", () => {
    expect(c.phase).toBe("completed");
    expect(verifyFinalDocument(c.finalDocument!)).toBe(true);
  });

  it("a PDF named <Case_Code>-final-document.pdf whose subject carries the document seal", () => {
    const { bytes, name } = finalPdfOf(c.finalDocument!);
    expect(name).toBe("ZZT-0005-final-document.pdf");
    const text = latin1(bytes);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain(c.finalDocument!.fingerprint);
  });

  it("the same bytes as the Apps Script bundle for the same document and date format", () => {
    const ctx = vm.createContext({});
    vm.runInContext(readFileSync(BUNDLE, "utf8"), ctx);
    const doc = c.finalDocument!;
    const theirs = vm.runInContext("(d, f) => CIQFinal.renderPdf(d, { formatDateTime: f })", ctx)(JSON.parse(JSON.stringify(doc)), (iso: string) => pdfDate(iso)) as Uint8Array;
    expect(latin1(finalPdfOf(doc).bytes)).toBe(latin1(Uint8Array.from(theirs)));
  });

  it("dates as the service's dateFormatter_ prints them: Europe/Berlin with its zone, a bare date in UTC", () => {
    expect(pdfDate("2026-10-09T12:05:00Z")).toBe("9 Oct 2026, 14:05 CEST");
    expect(pdfDate("2026-12-09T23:30:00Z")).toBe("10 Dec 2026, 00:30 CET");
    expect(pdfDate("2026-09-01")).toBe("1 Sep 2026");
    expect(pdfDate("not a date")).toBe("not a date");
  });
});
