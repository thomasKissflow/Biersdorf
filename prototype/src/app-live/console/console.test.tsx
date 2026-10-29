// The Admin / Developer role and the data console's shell (26 Oct): the role is recognised by its id and, when
// production's id differs, by its name; it is no CIQ persona (the persona rules are unchanged); the CIQ shell's left
// pane offers "Data console" to its holders only; the console's own pane lists every flow and the import, offers the
// way back only beside the CIQ screens, and has a top bar only in the Development sandbox. Rendered on the server (no
// effects run, so nothing is read); the journeys themselves are the harness's (data-console, data-console-persona).
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PERSONA_BY_ID } from "@/domain/catalog";
import type { AppState, User } from "@/domain/types";
import { LayoutModeContext, type LayoutMode } from "@/shell/useLayoutMode";
import { StoreContext, type StoreApi } from "@/store/store";
import { AppEnvContext, type AppEnvValue } from "../appEnv";
import { AppLiveShell } from "../AppLiveShell";
import { AppExtrasContext, type LiveAppExtras } from "../extras";
import { PERSONA_ORDER, roleKeyOf, withRoles } from "../identity";
import { OTHER_ROLES, ROLES } from "../ids";
import { createFakeClient } from "../kf/fakeClient";
import type { Identity } from "../types";
import { CONSOLE_FLOWS, flowPath } from "./common";
import { DataConsoleProvider } from "./ConsoleContext";
import { dataConsoleRoutes } from "./dataRoutes";

const user = { kfUserId: "UsDev", name: "Jonas Falk", email: "jonas.falk@beiersdorf.example" };
const DEV = { id: OTHER_ROLES.developer.id, name: OTHER_ROLES.developer.name };
const flat = (html: string) => html.replace(/<!-- -->/g, "");

describe("the Admin / Developer role", () => {
  it("is recognised by its id (dev sandbox's, read live 26 Oct) and, with another id (production), by its name", () => {
    expect(OTHER_ROLES.developer).toEqual({ id: "RoEK3_3Jy9XU", name: "Admin / Developer" });
    expect(roleKeyOf(DEV)).toBe("developer");
    expect(roleKeyOf({ id: "RoPRODother", name: "Admin / Developer" })).toBe("developer");
    expect(roleKeyOf({ id: "RoPRODother", name: "Developer" })).toBeUndefined();
  });

  it("is no CIQ persona: alone it holds none; beside RMM the personas are as before; it is not an unknown role", () => {
    const alone = withRoles(user, [DEV]);
    expect(alone).toMatchObject({ personas: [], developer: true, caseAdmin: false, integration: false, unknownRoles: [] });
    const both = withRoles(user, [{ id: ROLES.rmm.id, name: ROLES.rmm.name }, { id: "RoPRODother", name: "Admin / Developer" }]);
    expect(both).toMatchObject({ personas: ["rmm"], developer: true });
    expect(withRoles(user, [{ id: ROLES.rmm.id, name: ROLES.rmm.name }]).developer).toBe(false);
    expect(PERSONA_ORDER).toHaveLength(11);
  });
});

// ---- the CIQ shell's pane (as shell.test.tsx renders it)
const me: User = { id: "UsDev", name: "Jonas Falk", email: user.email, initials: "JF", side: "internal", title: "Raw Material Manager", dept: "RMM" };
const store = (): StoreApi => {
  const persona = { ...PERSONA_BY_ID.rmm, userId: me.id };
  return { state: { toasts: [] } as unknown as AppState, persona, me, dismissToast: () => {}, setPersona: () => {}, notify: () => {} } as unknown as StoreApi;
};
const extras = (identity: Identity): LiveAppExtras => ({
  loadedAt: "2026-10-26T09:00:00Z", busy: false, loadError: null, warnings: [], reads: [], reload: async () => true, identity,
  acting: { personaId: "rmm", persona: { ...PERSONA_BY_ID.rmm, userId: me.id }, me, roleId: ROLES.rmm.id }, setPersona: () => {},
  caseBanner: () => undefined, drafts: [], sendDraft: async () => {}, discardDraft: async () => {}, writeLog: [], webhooks: {}, containerOk: true, build: "2026-10-26T09:00:00.000Z",
});

function ciqShell(identity: Identity): string {
  return flat(renderToString(
    <AppEnvContext.Provider value={{ env: "prod" }}>
      <StoreContext.Provider value={store()}>
        <AppExtrasContext.Provider value={extras(identity)}>
          <MemoryRouter initialEntries={["/rmm"]}>
            <Routes>
              <Route element={<AppLiveShell />}>
                <Route path="*" element={<div>PAGE</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AppExtrasContext.Provider>
      </StoreContext.Provider>
    </AppEnvContext.Provider>,
  ));
}

function console_(path: string, identity: Identity, env: AppEnvValue, besideCiq: boolean, layout: LayoutMode | null = null): string {
  const client = createFakeClient({ items: {}, me: { _id: user.kfUserId, Name: user.name } }, { admin: true });
  return flat(renderToString(
    <LayoutModeContext.Provider value={layout}>
      <AppEnvContext.Provider value={env}>
        <DataConsoleProvider client={client} identity={identity} besideCiq={besideCiq}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>{dataConsoleRoutes()}</Routes>
          </MemoryRouter>
        </DataConsoleProvider>
      </AppEnvContext.Provider>
    </LayoutModeContext.Provider>,
  ));
}

describe("the shells", () => {
  it("the CIQ pane offers Data console to a holder of the role only", () => {
    const rmm = withRoles(user, [{ id: ROLES.rmm.id, name: ROLES.rmm.name }]);
    expect(ciqShell(rmm)).not.toContain('data-testid="nav-data"');
    const html = ciqShell(withRoles(user, [{ id: ROLES.rmm.id, name: ROLES.rmm.name }, DEV]));
    expect(html).toContain('data-testid="nav-data"');
    expect(html).toContain("Data console");
    expect(html).toContain('data-testid="nav-rmm"'); // the persona's menu is unchanged
  });

  it("the console's pane: the overview, every flow, the import; the way back only beside the CIQ screens; production has no top bar", () => {
    const alone = withRoles(user, [DEV]);
    const html = console_("/data", alone, { env: "prod" }, false);
    expect(html).toContain('data-testid="data-console"');
    expect(html).toContain('data-testid="data-overview"');
    for (const f of CONSOLE_FLOWS) expect(html).toContain(`data-testid="nav-${flowPath(f).slice(1).replace(/\//g, "-")}"`);
    expect(html).toContain('data-testid="nav-data-import"');
    expect(html).toContain('data-testid="nav-data-orphans"'); // 26 Oct: rows that name a deleted case
    expect(html).not.toContain('data-testid="nav-data-back"');
    expect(html).not.toContain('data-testid="dev-top-bar"');
    expect(console_("/data", withRoles(user, [{ id: ROLES.rmm.id, name: ROLES.rmm.name }, DEV]), { env: "prod" }, true)).toContain('data-testid="nav-data-back"');
  });

  it("dev: the top bar with the role switcher (Admin / Developer current)", () => {
    const html = console_("/data", withRoles(user, [DEV]), { env: "dev" }, false);
    expect(html).toContain('data-testid="dev-top-bar"');
    expect(html).toContain('data-testid="role-switcher"');
    expect(html).toContain("Admin / Developer");
  });

  it("a phone (Thomas, 30 Oct): the tab bar and More over the console's menu, the note to use a larger screen to edit", () => {
    const html = console_("/data/flow/case", withRoles(user, [DEV]), { env: "prod" }, false, "phone");
    expect(html).not.toContain('data-testid="side-pane"');
    expect(html).toContain('data-testid="tab-bar"');
    expect(html).toContain('data-testid="tab-more"');
    expect(html).toContain('data-testid="larger-screen-note"');
    expect(html).toContain('data-testid="data-flow-case"'); // viewing still works
    expect(console_("/data", withRoles(user, [DEV]), { env: "prod" }, false)).not.toContain('data-testid="larger-screen-note"');
  });

  it("a flow's page and the import page render", () => {
    const alone = withRoles(user, [DEV]);
    expect(console_("/data/flow/config", alone, { env: "prod" }, false)).toContain('data-testid="data-flow-config"');
    expect(console_("/data/flow/case", alone, { env: "prod" }, false)).toContain('data-testid="data-flow-case"');
    expect(console_("/data/orphans", alone, { env: "prod" }, false)).toContain('data-testid="data-orphans"');
    const imp = console_("/data/import", alone, { env: "prod" }, false);
    expect(imp).toContain('data-testid="data-import"');
    expect(imp).toContain("Config_Key");
  });
});
