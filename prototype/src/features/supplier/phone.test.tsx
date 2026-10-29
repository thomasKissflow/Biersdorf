// The supplier screens on a phone (Thomas, 30 Oct), rendered to HTML with the layout forced (LayoutModeContext): the
// section picker instead of the navigator, the completeness and release actions in the sticky bar (and nowhere else),
// the read-only composition as cards, the request page without a second "My requests" link, Help's title for screen
// readers only. The same screens on a big screen keep their desktop parts. Fictional data only.
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { fixtureSet } from "@/portal/data/fixtures";
import { LayoutModeContext, type LayoutMode } from "@/shell/useLayoutMode";
import { StoreContext, type StoreApi } from "@/store/store";
import { ComponentTable } from "./ComponentTable";
import { SupplierCase, SupplierHelp } from "./index";
import { FinalReleaseView, ReleaseActions } from "./PhaseViews";
import { Questionnaire } from "./Questionnaire";

const flat = (html: string) => html.replace(/<!-- -->/g, "");
const fx = fixtureSet();
const kase = (code: string) => fx.cases[code];
const contact = fx.state.users.find((u) => u.side === "supplier" && kase("ZZT-0001").supplierContactIds.includes(u.id))!;
const noop = () => undefined;
const api = { state: fx.state, me: contact, notify: noop, setAnswer: noop, setJustification: noop, uploadDocument: noop, saveConfig: noop, setComponents: noop, finalRelease: noop } as unknown as StoreApi;

function render(node: ReactNode, mode: LayoutMode, path = "/") {
  return flat(
    renderToString(
      <LayoutModeContext.Provider value={mode}>
        <StoreContext.Provider value={api}>
          <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
        </StoreContext.Provider>
      </LayoutModeContext.Provider>,
    ),
  );
}
const page = (path: string, mode: LayoutMode) =>
  render(
    <Routes>
      <Route path="/portal/case/:id" element={<SupplierCase />} />
      <Route path="/portal/help" element={<SupplierHelp />} />
    </Routes>,
    mode,
    path,
  );
/** The markup of the element carrying `testId`, up to the end of the page. */
const from = (html: string, testId: string) => html.slice(html.indexOf(`data-testid="${testId}"`));
const count = (html: string, s: string) => html.split(s).length - 1;

describe("the questionnaire on a phone", () => {
  const c = kase("ZZT-0001");

  it("has the section picker and the sticky actions instead of the navigator and the header's buttons", () => {
    const html = render(<Questionnaire c={c} locked={false} />, "phone", "/?s=K2.1");
    expect(html).toContain('data-testid="q-section-picker"');
    expect(from(html, "q-section-picker")).toMatch(/^[^>]*aria-label="Section 4 of \d+: K2\.1 · Components and additives, Mandatory, 0 of 2\. Choose a section"/);
    expect(html).not.toContain('data-testid="q-nav-');
    expect(html).not.toContain('aria-label="Section"');
    // Check and Confirm once each, in the sticky bar after the questionnaire's sections
    expect(count(html, 'data-testid="check-completeness"')).toBe(1);
    expect(count(html, 'data-testid="confirm-completeness"')).toBe(1);
    expect(from(html, "sticky-actions")).toContain('data-testid="confirm-completeness"');
    expect(html.indexOf('data-testid="sticky-actions"')).toBeGreaterThan(html.indexOf('data-testid="q-section-K2.1"'));
  });

  it("keeps the navigator and the header's buttons on a tablet and a desktop", () => {
    for (const mode of ["tablet", "desktop"] as const) {
      const html = render(<Questionnaire c={c} locked={false} />, mode, "/?s=K2.1");
      expect(html).not.toContain("q-section-picker");
      expect(html).not.toContain("sticky-actions");
      expect(html).toContain('data-testid="q-nav-K2.1"');
      expect(html).toContain('aria-label="Section"');
      expect(from(html, "completeness-bar")).toContain('data-testid="confirm-completeness"');
    }
  });

  it("has no completeness actions once completeness is confirmed", () => {
    const html = render(<Questionnaire c={kase("ZZT-0003")} locked={false} confirmable={false} />, "phone");
    expect(html).toContain("q-section-picker");
    expect(html).not.toContain("sticky-actions");
    expect(html).not.toContain("check-completeness");
  });
});

describe("the final release on a phone", () => {
  const c = kase("ZZT-0004");

  it("the card explains; the sticky bar holds the one 'Give final release'", () => {
    const card = render(<FinalReleaseView c={c} />, "phone");
    expect(card).toContain('data-testid="final-release-card"');
    expect(card).not.toContain('data-testid="final-release"');
    const bar = render(<ReleaseActions c={c} onRelease={noop} />, "phone");
    expect(bar).toContain('data-testid="sticky-actions"');
    expect(bar).toContain('data-testid="final-release"');
    expect(bar).toContain("Give final release");
  });

  it("a big screen keeps the card's button and has no sticky bar", () => {
    expect(render(<FinalReleaseView c={c} />, "desktop")).toContain('data-testid="final-release"');
    expect(render(<ReleaseActions c={c} onRelease={noop} />, "desktop")).toBe("");
    expect(render(<ReleaseActions c={c} onRelease={noop} />, "tablet")).toBe("");
  });

  it("the request page ends with the sticky bar, and has no second 'My requests' link", () => {
    const html = page(`/portal/case/${c.id}`, "phone");
    expect(html).toContain('data-testid="supplier-request"');
    expect(html).not.toContain('href="/portal"');
    expect(count(html, 'data-testid="final-release"')).toBe(1);
    expect(from(html, "sticky-actions")).toContain('data-testid="final-release"');
    expect(page(`/portal/case/${c.id}`, "desktop")).toContain('href="/portal"');
  });
});

describe("K2.1 read-only on a phone", () => {
  const c = kase("ZZT-0005");

  it("is one card per component, with every column as a field", () => {
    expect(c.components.length).toBeGreaterThan(0);
    const html = render(<ComponentTable c={c} editable={false} />, "phone");
    expect(html).not.toContain("<table");
    expect(html).toContain('data-testid="q-components"');
    expect(count(html, 'data-testid="q-component-card-')).toBe(c.components.length);
    for (const label of ["CAS", "EC / REACH no.", "Function", "Additive", "Origin", "Concentration"]) expect(html).toContain(`>${label}</dt>`);
    expect(html).toContain(c.components[0].inci);
  });

  it("stays a table on a big screen", () => {
    const html = render(<ComponentTable c={c} editable={false} />, "desktop");
    expect(html).toContain("<table");
    expect(html).not.toContain("q-component-card-");
  });
});

describe("Help on a phone", () => {
  it("keeps its title for screen readers only (the header already says Help)", () => {
    expect(page("/portal/help", "phone")).toMatch(/<h1[^>]*><span class="sr-only">Help<\/span><\/h1>/);
    expect(page("/portal/help", "desktop")).toMatch(/<h1[^>]*>Help<\/h1>/);
  });
});
