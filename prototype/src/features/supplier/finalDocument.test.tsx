// The supplier's copy of the final document on the released view (29 Oct, Final_PDF), rendered to HTML: the card
// only once the live portal has the file, a muted "on its way" line for a day after the release, nothing in the
// prototype. Fictional data only.
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { fixtureSet } from "@/portal/data/fixtures";
import type { CiqCase } from "@/domain/types";
import { PROTOTYPE_CAPS, PortalCapsContext, type PortalCaps } from "@/store/portalCaps";
import { FinalDocumentCard } from "./PhaseViews";

const flat = (html: string) => html.replace(/<!-- -->/g, "");
const released: CiqCase = fixtureSet().cases["ZZT-0005"];
const releaseAt = Date.parse(released.confirmations.find((x) => x.type === "final-release")!.at);
const render = (caps: PortalCaps | null, c: CiqCase = released, now = releaseAt + 60_000) =>
  flat(renderToString(caps ? <PortalCapsContext.Provider value={caps}><FinalDocumentCard c={c} now={now} /></PortalCapsContext.Provider> : <FinalDocumentCard c={c} now={now} />));
const withPdf: PortalCaps = { ...PROTOTYPE_CAPS, finalPdf: () => ({ name: "ZZT-0005-final-document.pdf", sizeKb: 47 }), openFinalPdf: vi.fn() };
const withoutPdf: PortalCaps = { ...PROTOTYPE_CAPS };

describe("FinalDocumentCard (live portal, released view)", () => {
  it("offers the filed PDF with its name and size", () => {
    expect(released.phase).toBe("completed");
    const html = render(withPdf);
    expect(html).toContain('data-testid="final-pdf"');
    expect(html).toContain('data-testid="final-pdf-download"');
    expect(html).toContain("Download final PDF");
    expect(html).toContain("ZZT-0005-final-document.pdf");
    expect(html).toContain("47 KB");
    expect(html).not.toContain("Kissflow");
    expect(html).not.toContain("final-pdf-pending");
  });

  it("only on a released request", () => {
    expect(render(withPdf, { ...released, phase: "final-release" })).toBe("");
  });

  it("says the copy is on its way for a day after the release, then nothing", () => {
    const soon = render(withoutPdf);
    expect(soon).toContain('data-testid="final-pdf-pending"');
    expect(soon).toContain("appears here once Beiersdorf has filed it");
    expect(soon).not.toContain('data-testid="final-pdf"');
    expect(render(withoutPdf, released, releaseAt + 25 * 3600_000)).toBe("");
  });

  it("renders nothing in the prototype", () => {
    expect(render(null)).toBe("");
    expect(render(null, released, releaseAt + 25 * 3600_000)).toBe("");
  });
});
