// The portal shells (Thomas, 20 Oct): the shared left pane (src/shell/SidePane.tsx) and, only in the Development
// sandbox, the top bar with the role switcher and the person chip. Rendered on the server with a minimal StoreApi, a
// fixed portal mode and fixed live extras (no Kissflow, no LiveSupplierStore). Interactions (collapse, the real role
// switch, Roles & grants) are covered by the harness (scripts/harness-portal.mjs dev-role-switch, prod-no-topbar, admin).
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, User } from "@/domain/types";
import { StoreContext, type StoreApi } from "@/store/store";
import { AdminShell } from "./admin/AdminShell";
import type { LiveExtras } from "./data/LiveSupplierStore";
import type { Kf } from "./kf/sdk";
import { ROLES, type HeldRole, type PortalRole } from "./kf/portal";
import { PortalModeContext, type PortalMode } from "./mode";
import { PortalSupplierShell } from "./supplier/PortalSupplierShell";
import { ThemeProvider } from "./theme";

// the live extras come from LiveSupplierStore, which needs a Kissflow client: the shell reads only useLiveExtras
let extras: LiveExtras | null = null;
vi.mock("./data/LiveSupplierStore", () => ({ useLiveExtras: () => extras }));

/** Server markup without React's text-node separators, so a sentence reads as one string. */
const flat = (html: string) => html.replace(/<!-- -->/g, "");

const DEV = "AcDOSunMEpSA";
const me = { id: "UsElena", name: "Elena Márquez", email: "elena.marquez@solvaro.example", initials: "EM", side: "supplier", supplierId: "S1" } as unknown as User;

/** Two open supplier tasks: one questionnaire, one open question in review. */
const state = {
  suppliers: [{ id: "S1", name: "Solvaro" }],
  cases: [
    { id: "ZZT-0001", supplierId: "S1", phase: "supplier-input", liveScope: false, supplierContactIds: [], openPoints: [], materialName: "A", dueDate: "2026-11-01" },
    { id: "ZZT-0003", supplierId: "S1", phase: "review", liveScope: false, supplierContactIds: [], openPoints: [{ id: "OP-1", status: "open", kind: "question", ref: { label: "GEN" }, question: "?", dueDate: "2026-11-02" }], materialName: "B", dueDate: "2026-11-03" },
  ],
} as unknown as AppState;

/** Only what the shell reads; any other StoreApi member throws, so a new dependency shows up here. */
const store = new Proxy({ state, me } as Partial<StoreApi> as StoreApi, {
  get: (t, k) => {
    if (k in t) return t[k as keyof StoreApi];
    throw new Error(`the shell read StoreApi.${String(k)}`);
  },
});

const kfOn = (account: string) => ({ account: { _id: account }, user: { _id: "UsElena", Name: "Elena Márquez", Email: "elena.marquez@solvaro.example" }, app: {}, api: async () => ({}) }) as unknown as Kf;

function modeFor(env: "dev" | "prod" | "offline", role: PortalRole, held: HeldRole[] = role === "none" ? [] : [role]): PortalMode {
  const kf = env === "offline" ? null : kfOn(env === "dev" ? DEV : "AcPROD");
  return {
    kf,
    role,
    held,
    roles: held.map((k) => ({ id: ROLES[k].id, name: ROLES[k].name })),
    setRole: () => {},
    env: env === "dev" ? "dev" : "prod",
    readyMs: 0,
    demo: false,
    setDemo: () => {},
    client: null,
  };
}

const liveExtras = (patch: Partial<LiveExtras> = {}): LiveExtras => ({
  loadedAt: "2026-10-20T10:40:00Z",
  busy: false,
  warnings: [],
  articles: [],
  loadError: null,
  reload: async () => true,
  presence: () => undefined,
  ...patch,
});

function supplier(mode: PortalMode, opts: { demo?: boolean; path?: string } = {}): string {
  return flat(
    renderToString(
      <ThemeProvider>
        <PortalModeContext.Provider value={mode}>
          <StoreContext.Provider value={store}>
            <MemoryRouter initialEntries={[opts.path ?? "/portal"]}>
              <Routes>
                <Route element={<PortalSupplierShell demo={!!opts.demo} />}>
                  <Route path="*" element={<div data-testid="the-page">PAGE</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </StoreContext.Provider>
        </PortalModeContext.Provider>
      </ThemeProvider>,
    ),
  );
}

function admin(mode: PortalMode, path = "/admin"): string {
  return flat(
    renderToString(
      <ThemeProvider>
        <PortalModeContext.Provider value={mode}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/admin" element={<AdminShell />}>
                <Route path="*" element={<div data-testid="the-page">PAGE</div>} />
                <Route index element={<div data-testid="the-page">PAGE</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </PortalModeContext.Provider>
      </ThemeProvider>,
    ),
  );
}

/** The left pane's footer (from its test id to the end of the pane). */
const footerOf = (html: string) => html.slice(html.indexOf('data-testid="side-footer"'), html.indexOf("</aside>"));

beforeEach(() => {
  extras = liveExtras();
});

describe("PortalSupplierShell", () => {
  it("the left pane: no logo, My requests with the open-task count, Help; no top tab bar", () => {
    const html = supplier(modeFor("prod", "supplier"));
    expect(html).toContain('data-testid="side-pane"');
    expect(html).toContain("Supplier portal");
    expect(html).toContain('data-testid="nav-portal"');
    expect(html).toContain('data-testid="nav-portal-help"');
    expect(html).toMatch(/aria-label="2 open"[^>]*>2</);
    expect(html).not.toContain('alt="Beiersdorf"');
    expect(html).toContain('data-testid="the-page"');
  });

  it("the pane's very bottom holds 'Updated HH:MM', Reload and the theme toggle", () => {
    const footer = footerOf(supplier(modeFor("prod", "supplier")));
    expect(footer).toMatch(/data-testid="load-status"[^>]*>Updated \d{1,2}:\d\d(\s?[AP]M)?</); // the browser's locale
    expect(footer).toContain('aria-label="Reload"');
    expect(footer).toContain('aria-label="Dark theme"');
  });

  it("says Saving… while busy (the harness waits for it to go)", () => {
    extras = liveExtras({ busy: true });
    expect(footerOf(supplier(modeFor("prod", "supplier")))).toMatch(/data-testid="load-status"[^>]*>Saving…</);
  });

  it("prod (beiersdorf.kissflow.eu): no top bar at all, no switcher, no person chip", () => {
    const html = supplier(modeFor("prod", "supplier"));
    expect(html).not.toContain("<header");
    expect(html).not.toContain('data-testid="dev-top-bar"');
    expect(html).not.toContain('data-testid="role-switcher"');
    expect(html).not.toContain('data-testid="person-chip"');
    expect(html).toContain('data-env="prod"');
  });

  it("dev (dev-beiersdorf.kissflow.eu): the top bar with the role switcher and the person chip", () => {
    const html = supplier(modeFor("dev", "supplier"));
    expect(html).toContain('data-testid="dev-top-bar"');
    expect(html).toMatch(/data-testid="role-switcher" data-persona="supplier"/);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toMatch(/data-testid="person-chip" data-persona="supplier"/);
    expect(html).toContain("Elena Márquez");
    // the pane keeps the status: the top bar carries no Reload of its own
    const top = html.slice(html.indexOf('data-testid="dev-top-bar"'));
    expect(top.slice(0, top.indexOf("</header>"))).not.toContain('aria-label="Reload"');
  });

  it("keeps the error, warnings and presence banners", () => {
    extras = liveExtras({ loadError: "Kissflow did not answer", warnings: ["CIQP Request PkX: no step"], presence: () => ({ name: "Ravi Menon", since: "2026-10-20T10:38:00Z" }) as ReturnType<LiveExtras["presence"]> });
    const html = supplier(modeFor("prod", "supplier"), { path: "/portal/case/ZZT-0002" });
    expect(html).toContain("Couldn&#x27;t refresh from Kissflow: Kissflow did not answer.");
    expect(html).toContain("1 item could not be read in full");
    expect(html).toContain('data-testid="presence-hint"');
  });

  it("the demo preview: the demo bar with its badge; no status and no Reload (nothing to reload); offline has no top bar", () => {
    extras = null;
    const html = supplier(modeFor("offline", "none"), { demo: true });
    expect(html).toContain('data-testid="demo-bar"');
    expect(html).toContain("Demo data");
    expect(html).toContain("Preview of the supplier view with demo data");
    expect(html).not.toContain("Back to admin");
    expect(footerOf(html)).not.toContain('data-testid="reload"');
    expect(footerOf(html)).toContain("theme");
    expect(html).not.toContain("<header");
  });

  it("the Admin's demo preview links back to the admin console", () => {
    extras = null;
    expect(supplier(modeFor("prod", "admin"), { demo: true })).toContain("Back to admin");
  });
});

describe("AdminShell", () => {
  it("keeps every menu entry; Roles & grants is a button (Kissflow's own manage page), the rest are links", () => {
    const html = admin(modeFor("prod", "admin"));
    for (const label of ["Overview", "Requests", "Help articles", "Roles &amp; grants", "Diagnostics"]) expect(html).toContain(label);
    expect(html).toMatch(/<a [^>]*data-testid="nav-admin"/);
    expect(html).toMatch(/<a [^>]*data-testid="nav-admin-flow-request"/);
    expect(html).toMatch(/<button [^>]*data-testid="nav-admin-roles"/);
    expect(html).toContain("Supplier portal admin");
  });

  it("no phone-only page picker, no Reload; the theme toggle sits at the pane's very bottom", () => {
    const html = admin(modeFor("prod", "admin"));
    expect(html).not.toContain("<select");
    expect(html).not.toContain('aria-label="Go to"');
    expect(html).not.toContain('data-testid="reload"');
    expect(footerOf(html)).toContain('aria-label="Dark theme"');
  });

  it("prod: no top bar; dev: the top bar with the switcher acting as Portal admin", () => {
    expect(admin(modeFor("prod", "admin"))).not.toContain("<header");
    const dev = admin(modeFor("dev", "admin", ["admin", "supplier"]));
    expect(dev).toContain('data-testid="dev-top-bar"');
    expect(dev).toMatch(/data-testid="role-switcher" data-persona="admin"/);
    expect(dev).toContain("Portal admin");
  });
});
