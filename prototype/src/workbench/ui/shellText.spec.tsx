// Review fixes (night): what a NON-builder sees (F-02, UX-02, UX-10): no Diagnostics link, no build stamp, Diagnostics
// restricted without mounting the probes; the read-quality note is an info note in the reader's words.
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkbenchData } from "../data/hooks";
import { Diagnostics } from "../pages/Diagnostics";
import { BuilderFooter, WorkbenchShell } from "../shell/WorkbenchShell";
import { ThemeProvider } from "../theme";
import { fakeClient } from "../testkit/fakeClient";
import { ReadQualityBanner } from "./ReadQualityBanner";

function render(path: string, el: React.ReactNode): string {
  const client = fakeClient(); // its kf handle has no getRoles: never a builder
  return renderToString(
    <WorkbenchData kf={client.kf} readyMs={0} client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={el} />
        </Routes>
      </MemoryRouter>
    </WorkbenchData>,
  );
}

describe("non-builder view (F-02, UX-02)", () => {
  it("the shell footer (Diagnostics link, build stamp) renders for a builder only", () => {
    const footer = (isBuilder: boolean) => renderToString(<MemoryRouter>{<BuilderFooter isBuilder={isBuilder} />}</MemoryRouter>);
    expect(footer(false)).toBe("");
    expect(footer(true)).toContain('data-testid="wb-nav-diagnostics"');
    expect(footer(true)).toContain('data-testid="wb-build"');
  });
  it("/diagnostics renders the restricted card, not the probing page", () => {
    const html = render("/diagnostics", <Diagnostics />);
    expect(html).toContain('data-testid="wb-diag-restricted"');
    expect(html).not.toContain('data-testid="wb-diag"');
  });
});

describe("Kissflow-embedded layout: no header of our own", () => {
  const html = render("/cases", <ThemeProvider><WorkbenchShell /></ThemeProvider>);
  it("no logo, title, View as or lens banner at the top; the menu bar exists below lg only", () => {
    expect(html).not.toMatch(/<header|CIQ Workbench|wb-lens-banner|UI lens only/);
    expect(html).toMatch(/data-app-header="true" class="[^"]*lg:hidden/);
    expect(html).not.toContain('data-testid="wb-viewas"'); // a non-builder: no dock
  });
  it("the left nav starts at the very top and carries the theme toggle and the saving state at its bottom left", () => {
    expect(html).toMatch(/id="wb-nav"[^>]*class="[^"]*lg:top-0[^"]*lg:h-screen/);
    const nav = html.slice(html.indexOf('id="wb-nav"'), html.indexOf("<main"));
    expect(nav).toContain('data-testid="wb-theme-row"');
    expect(nav).toMatch(/aria-label="Dark theme"/);
    expect(nav).toContain('data-testid="wb-busy"');
    expect(nav.indexOf("wb-theme-row")).toBeGreaterThan(nav.lastIndexOf("wb-nav-group-"));
  });
  it("persona groups with the prototype's names (the fake user holds the legacy RMM name)", () => {
    expect(html).toContain('data-testid="wb-nav-group-rmm"');
    expect(html).toContain("Raw Material Manager (RMM)");
    expect(html).toMatch(/data-testid="wb-nav-cases"[^>]*>All cases</);
    expect(html).toMatch(/aria-current="page"[^>]*data-testid="wb-nav-cases"/);
  });
});

describe("read-quality note (UX-04, UX-10)", () => {
  it("'only your items' is an info note in plain words; the counts sentence only where counts are computed", () => {
    const html = renderToString(<ReadQualityBanner quality="mine+tasks" what="Cases" scope="cases" />);
    expect(html).toContain("You see the cases you created or have a task on.");
    expect(html).toContain("bg-info-soft");
    expect(html).not.toMatch(/Counts|partial|audit index|item\(s\)/);
    expect(renderToString(<ReadQualityBanner quality="mine+tasks" scope="open points" counts />)).toContain("Counts based on this list cannot be confirmed with your access.");
  });
  it("cases known only from the audit log are explained once (no per-row sentence)", () => {
    const html = renderToString(<ReadQualityBanner quality="mine+tasks" indexOnly={11} what="Cases" scope="cases" />);
    expect(html).toContain("You see every CIQ case from the audit log. Status and step are shown only for cases you work on.");
    expect(html).not.toMatch(/audit index|item\(s\)/);
  });
  it("a list that could not be read is a warning", () => {
    expect(renderToString(<ReadQualityBanner quality="failed" />)).toContain("bg-warn-soft");
  });
});
