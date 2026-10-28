// DocName (27 Oct): the prototype and the supplier portal keep the name (a session link only for a file dropped in this
// browser session); with the live app's opener the name is a link-styled button "Open <name>", or the name with the
// quiet note when only the supplier portal can open the file.
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocName } from "./DocName";
import { DocOpenerContext, PORTAL_ONLY_NOTE, type DocOpener, type DocOpenStatus } from "./docOpener";

const html = (node: ReactNode, opener?: DocOpener) => renderToString(opener ? <DocOpenerContext.Provider value={opener}>{node}</DocOpenerContext.Provider> : node).replace(/<!-- -->/g, "");
const openerWith = (status: Record<string, DocOpenStatus>): DocOpener => ({ status: (id) => status[id], prepare: () => {}, open: async () => {} });

describe("DocName", () => {
  it("the prototype: the name as plain text, as before", () => {
    const out = html(<DocName id="d1" name="CoA_2408.pdf" className="truncate font-medium" />);
    expect(out).toBe('<span class="truncate font-medium" title="CoA_2408.pdf">CoA_2408.pdf</span>');
  });

  it("live, openable: a button labelled Open <name>, in the link colour (the caller's text colour gives way)", () => {
    const out = html(<DocName id="d1" name="CoA_2408.pdf" className="min-w-0 font-medium text-ink [overflow-wrap:anywhere]" />, openerWith({ d1: "ready" }));
    expect(out).toMatch(/^<button type="button"/);
    expect(out).toContain('aria-label="Open CoA_2408.pdf"');
    expect(out).toContain('data-testid="doc-open-d1"');
    expect(out).toContain('data-doc-state="ready"');
    expect(out).toContain("text-brand");
    expect(out).not.toMatch(/\btext-ink\b/);
    expect(out).toContain(">CoA_2408.pdf</button>");
  });

  it("live, still checking: the button, busy", () => {
    const out = html(<DocName id="d1" name="SDS.pdf" />, openerWith({ d1: "checking" }));
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('data-doc-state="checking"');
  });

  it("live, not openable here: the name with the quiet note, no button", () => {
    const out = html(<DocName id="d1" name="SDS.pdf" className="font-medium" />, openerWith({ d1: "portal" }));
    expect(out).not.toContain("<button");
    expect(out).toContain('data-testid="doc-portal-only-d1"');
    expect(out).toContain(PORTAL_ONLY_NOTE);
    expect(out).toContain('<span class="font-medium" title="SDS.pdf">SDS.pdf</span>');
  });

  it("live, a file the opener does not know: DocName's own behaviour", () => {
    expect(html(<DocName id="dX" name="x.pdf" />, openerWith({}))).toBe('<span title="x.pdf">x.pdf</span>');
  });
});
