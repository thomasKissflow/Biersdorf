// The app's data console on a phone (Thomas, 30 Oct): the note to use a larger screen above every page (DataShell), and
// pages that show the data only: a flow's rows as cards (their table rows' test ids), no New row, no checkboxes or
// Delete selected, no import. Rendered on the server with the phone layout forced and the session's lists stubbed (no
// effects run, so nothing would be read); the journey at 360 px is the harness's (phone-console).
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { RawItem } from "@/portal/data/raw";
import { LayoutModeContext, type LayoutMode } from "@/shell/useLayoutMode";
import { AppEnvContext } from "../appEnv";
import { withRoles } from "../identity";
import { OTHER_ROLES } from "../ids";
import { createFakeClient } from "../kf/fakeClient";
import { DataConsoleProvider } from "./ConsoleContext";
import { dataConsoleRoutes } from "./dataRoutes";

const ROWS: Record<string, RawItem[]> = {
  case: [{ _id: "PkCase1", Case_Code: "ZZT-0001", Supplier_Code: "SUP-ZZT-SOLVARO", Trade_Name: "HELIOSOFT 300", _status: "InProgress", _modified_at: "2026-10-20T10:00:00Z", _current_step: "Beiersdorf review" }] as unknown as RawItem[],
  config: [{ _id: "PkCfg1", Config_Key: "REM:current", Config_State: "Published", _modified_at: "2026-10-18T10:00:00Z" }] as unknown as RawItem[],
};
vi.mock("./session", async (orig) => {
  const real = await orig<typeof import("./session")>();
  return { ...real, useFlowList: (_s: unknown, flow: string) => ({ loading: false, rows: ROWS[flow] ?? [], readAt: "2026-10-30T00:00:00Z", refresh: async () => {} }) };
});

const flat = (html: string) => html.replace(/<!-- -->/g, "");
const identity = withRoles({ kfUserId: "UsDev", name: "Jonas Falk", email: "jonas.falk@beiersdorf.example" }, [{ id: OTHER_ROLES.developer.id, name: OTHER_ROLES.developer.name }]);

function render(path: string, layout: LayoutMode): string {
  const client = createFakeClient({ items: {}, me: { _id: "UsDev", Name: "Jonas Falk" } }, { admin: true });
  return flat(
    renderToString(
      <LayoutModeContext.Provider value={layout}>
        <AppEnvContext.Provider value={{ env: "prod" }}>
          <DataConsoleProvider client={client} identity={identity} besideCiq={false}>
            <MemoryRouter initialEntries={[path]}>
              <Routes>{dataConsoleRoutes()}</Routes>
            </MemoryRouter>
          </DataConsoleProvider>
        </AppEnvContext.Provider>
      </LayoutModeContext.Provider>,
    ),
  );
}

describe("the data console on a phone", () => {
  it("a process: its items as cards with the rows' test ids, the step and status; no checkboxes or bulk delete", () => {
    const html = render("/data/flow/case", "phone");
    expect(html).toContain('data-testid="larger-screen-note"');
    expect(html).toContain('data-testid="data-cards"');
    expect(html).toMatch(/<li[^>]*data-testid="data-row-PkCase1"[^>]*><button[^>]*aria-label="Open ZZT-0001"/);
    expect(html).toContain('data-testid="data-step-PkCase1"');
    expect(html).toContain("HELIOSOFT 300");
    expect(html).not.toContain("<table");
    expect(html).not.toContain('data-testid="data-select-');
    // the reads stay: search, Refresh, Show steps
    for (const id of ["data-search", "data-refresh", "data-show-steps"]) expect(html, id).toContain(`data-testid="${id}"`);
  });

  it("a form: no New row on a phone; on a big screen the table with its checkboxes and New row, as before", () => {
    const html = render("/data/flow/config", "phone");
    expect(html).toMatch(/<li[^>]*data-testid="data-row-PkCfg1"/);
    expect(html).not.toContain('data-testid="data-new-row"');
    const big = render("/data/flow/config", "desktop");
    expect(big).toContain('data-testid="data-new-row"');
    expect(big).toMatch(/<tr[^>]*data-testid="data-row-PkCfg1"/);
    expect(big).toContain('data-testid="data-select-page"');
    expect(big).not.toContain('data-testid="larger-screen-note"');
  });

  it("the import says to use a larger screen; the overview's cards stay", () => {
    const imp = render("/data/import", "phone");
    expect(imp).toContain('data-testid="import-larger-screen"');
    expect(imp).not.toContain('data-testid="import-file"');
    expect(render("/data/import", "desktop")).toContain('data-testid="import-file"');
    expect(render("/data", "phone")).toContain('data-testid="data-card-case"');
  });
});
