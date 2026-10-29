// The phone kit (Thomas, 30 Oct; phone.tsx): every piece renders only on a phone, or its desktop form unchanged.
// ResponsiveTable on a big screen is exactly the hand-written Table / Tr / Td; on a phone the same rows as cards with
// the same row test ids. Rendered on the server under LayoutModeContext (the Sheet is a portal: the harness opens it).
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LayoutModeContext, type LayoutMode } from "@/shell/useLayoutMode";
import { Table, Td, Tr } from "./data";
import { CardList, CardListItem, HideOnPhone, LargerScreenNote, PhoneOnly, ResponsiveTable, StickyActionBar, type ResponsiveColumn } from "./phone";

const at = (mode: LayoutMode, node: ReactNode) => renderToString(<LayoutModeContext.Provider value={mode}>{node}</LayoutModeContext.Provider>).replace(/<!-- -->/g, "");

type Row = { code: string; supplier: string; status: string };
const ROWS: Row[] = [
  { code: "ZZT-0001", supplier: "Solvaro", status: "Open" },
  { code: "ZZT-0003", supplier: "Kelmar", status: "In review" },
];
const COLUMNS: ResponsiveColumn<Row>[] = [
  { header: "Case", cell: (r) => r.code, primary: true, className: "font-mono" },
  { header: "Supplier", cell: (r) => r.supplier },
  { header: "Status", cell: (r) => <span className="badge">{r.status}</span>, badge: true },
];

describe("PhoneOnly / HideOnPhone", () => {
  it("show their children on a phone only, or everywhere but a phone (no wrapper element)", () => {
    expect(at("phone", <PhoneOnly>P</PhoneOnly>)).toBe("P");
    expect(at("tablet", <PhoneOnly>P</PhoneOnly>)).toBe("");
    expect(at("desktop", <HideOnPhone>D</HideOnPhone>)).toBe("D");
    expect(at("tablet", <HideOnPhone>D</HideOnPhone>)).toBe("D");
    expect(at("phone", <HideOnPhone>D</HideOnPhone>)).toBe("");
  });
});

describe("StickyActionBar and LargerScreenNote", () => {
  it("render nothing at >= 768 px", () => {
    for (const mode of ["tablet", "desktop"] as const) {
      expect(at(mode, <StickyActionBar>Send</StickyActionBar>)).toBe("");
      expect(at(mode, <LargerScreenNote />)).toBe("");
    }
  });

  it("the action bar sticks above the tab bar, edge to edge, 44 px buttons; its test id can be the screen's own", () => {
    const html = at("phone", <StickyActionBar data-testid="op-actions"><button type="button">Send</button></StickyActionBar>);
    expect(html).toContain('data-testid="op-actions"');
    expect(html).toContain("sticky bottom-[var(--app-tabbar-h,0px)]");
    expect(html).toContain("-mx-4");
    expect(html).toContain("[&amp;_button]:min-h-11");
    expect(at("phone", <StickyActionBar>x</StickyActionBar>)).toContain('data-testid="sticky-actions"');
  });

  it("the note says to use a larger screen to edit, and that viewing works; a screen may word the second part", () => {
    const html = at("phone", <LargerScreenNote />);
    expect(html).toContain('role="note" data-testid="larger-screen-note"');
    expect(html).toContain("Use a larger screen to edit.</span> On a phone you can look at everything here, but not change it.");
    expect(at("phone", <LargerScreenNote>On a phone you can look at the rules.</LargerScreenNote>)).toContain("edit.</span> On a phone you can look at the rules.");
  });
});

describe("CardList / CardListItem", () => {
  it("a list of cards; a card that opens something is one button (44 px) with a chevron; the test id on the item", () => {
    const html = at(
      "phone",
      <CardList label="Cases" data-testid="case-cards">
        <CardListItem data-testid="case-row-ZZT-0001" title="ZZT-0001" badge={<b>Open</b>} meta="Solvaro" fields={[{ label: "Due", value: "1 Nov" }]} onClick={() => {}} />
        <CardListItem title="Plain" aside={<button type="button">x</button>} />
      </CardList>,
    );
    expect(html).toMatch(/^<ul aria-label="Cases" data-testid="case-cards"/);
    expect(html).toContain('<li data-testid="case-row-ZZT-0001"');
    expect(html).toMatch(/<button type="button" class="flex min-h-11[^"]*"><span class="min-w-0 flex-1">/);
    expect(html).toContain("<dt");
    expect(html).toContain(">Due</dt>");
    expect((html.match(/lucide-chevron-right/g) ?? []).length).toBe(1); // the plain card: no chevron, no button around it
  });
});

describe("ResponsiveTable", () => {
  const table = (mode: LayoutMode) => at(mode, <ResponsiveTable data-testid="cases" rows={ROWS} columns={COLUMNS} rowKey={(r) => r.code} rowTestId={(r) => `case-row-${r.code}`} onRowClick={() => {}} label="Cases" />);

  it("at >= 768 px: exactly the hand-written Table / Tr / Td", () => {
    const byHand = renderToString(
      <div data-testid="cases">
        <Table head={["Case", "Supplier", "Status"]}>
          {ROWS.map((r) => (
            <Tr key={r.code} data-testid={`case-row-${r.code}`} onClick={() => {}}>
              <Td className="font-mono">{r.code}</Td>
              <Td>{r.supplier}</Td>
              <Td>
                <span className="badge">{r.status}</span>
              </Td>
            </Tr>
          ))}
        </Table>
      </div>,
    ).replace(/<!-- -->/g, "");
    expect(table("desktop")).toBe(byHand);
    expect(table("tablet")).toBe(byHand);
  });

  it("on a phone: a card per row with the same test id, the primary column as its title, the badge beside it, the rest as fields", () => {
    const html = table("phone");
    expect(html).not.toContain("<table");
    expect(html).toMatch(/^<ul aria-label="Cases" data-testid="cases"/);
    for (const r of ROWS) expect(html).toContain(`<li data-testid="case-row-${r.code}"`);
    const first = html.slice(html.indexOf('data-testid="case-row-ZZT-0001"'), html.indexOf('data-testid="case-row-ZZT-0003"'));
    expect(first).toContain(">ZZT-0001</span><span><span class=\"badge\">Open</span></span>");
    expect(first).toContain(">Supplier</dt>");
    expect(first).not.toContain(">Status</dt>");
    expect(first).not.toContain(">Case</dt>");
  });

  it("no rows: the empty state, if given; a phoneCard replaces the generated card", () => {
    expect(at("phone", <ResponsiveTable rows={[]} columns={COLUMNS} rowKey={(r) => r.code} empty={<p>None yet</p>} />)).toBe("<p>None yet</p>");
    const custom = at("phone", <ResponsiveTable rows={ROWS} columns={COLUMNS} rowKey={(r) => r.code} rowTestId={(r) => `row-${r.code}`} phoneCard={(r) => <em>{r.supplier}</em>} />);
    expect(custom).toContain('<li data-testid="row-ZZT-0003"><em>Kelmar</em></li>');
  });
});
