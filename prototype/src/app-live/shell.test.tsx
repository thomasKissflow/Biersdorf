// Owner E: the production shell, the routes, Diagnostics and the no-role page, rendered on the server with a minimal
// StoreApi and LiveAppExtras (no Kissflow, no LiveAppStore). Interactions (the role picker, Send/Discard) are covered
// by the harness (scripts/harness-applive.mjs multi-role, read-refusals). FE-CLEANUP (22 Oct): production's shell,
// boot pages and Diagnostics carry no technical token; dev keeps the raw texts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PERSONA_BY_ID } from "@/domain/catalog";
import type { AppState, InternalPersonaId, User } from "@/domain/types";
import { LayoutModeContext, type LayoutMode } from "@/shell/useLayoutMode";
import { StoreContext, type StoreApi } from "@/store/store";
import { ConnectFailed, NoRolePage, StartBoundary } from "./AppLiveApp";
import { AppEnvContext, type AppEnvValue } from "./appEnv";
import { AppLiveShell } from "./AppLiveShell";
import { Diagnostics } from "./Diagnostics";
import { AppExtrasContext, type LiveAppExtras } from "./extras";
import { PIN_UNKNOWN } from "./map/caseMap";
import { PageBoundary } from "./PageBoundary";
import { DIAGNOSTICS_PATH, internalChildRoutes } from "./routes";
import type { Identity } from "./types";
import { DIAG_KEPT, SOME_KEPT } from "./userText";

/** Server markup without React's text-node separators, so a sentence reads as one string. */
const flat = (html: string) => html.replace(/<!-- -->/g, "");

const me: User = { id: "UsKatrin", name: "Katrin Vogel", email: "katrin.vogel@beiersdorf.example", initials: "KV", side: "internal", title: "Raw Material Manager", dept: "RMM" };

/** Only what the shell reads; any other StoreApi member throws, so a new dependency shows up here. */
function storeFor(personaId: InternalPersonaId): StoreApi {
  const persona = { ...PERSONA_BY_ID[personaId], userId: me.id };
  const known: Partial<StoreApi> = { state: { toasts: [] } as unknown as AppState, persona, me, dismissToast: () => {}, setPersona: () => {}, notify: () => {} };
  return new Proxy(known as StoreApi, {
    get: (t, k) => {
      if (k in t) return t[k as keyof StoreApi];
      throw new Error(`the shell read StoreApi.${String(k)}`);
    },
  });
}

const identity: Identity = { kfUserId: "UsKatrin", name: "Katrin Vogel", email: me.email, roles: [{ id: "RoEKl83f9jPF", name: "Raw Material Manager (RMM)" }], personas: ["rmm"], caseAdmin: false, integration: false, unknownRoles: [] };

function extrasFor(personaId: InternalPersonaId, patch: Partial<LiveAppExtras> = {}): LiveAppExtras {
  return {
    loadedAt: "2026-10-20T21:00:00Z",
    busy: false,
    loadError: null,
    warnings: [],
    reads: [],
    reload: async () => true,
    identity: { ...identity, personas: [personaId] },
    acting: { personaId, persona: { ...PERSONA_BY_ID[personaId], userId: me.id }, me, roleId: "RoEKl83f9jPF" },
    setPersona: () => {},
    caseBanner: () => undefined,
    drafts: [],
    sendDraft: async () => {},
    discardDraft: async () => {},
    writeLog: [],
    webhooks: {},
    containerOk: true,
    build: "2026-10-20T21:00:00.000Z",
    ...patch,
  };
}

function render(pathname: string, personaId: InternalPersonaId, extras: Partial<LiveAppExtras> = {}, page: ReactNode = <div data-testid="the-page">PAGE</div>, env: AppEnvValue = { env: "dev" }, mode: LayoutMode | null = null): string {
  return flat(renderToString(
    <LayoutModeContext.Provider value={mode}>
      <AppEnvContext.Provider value={env}>
        <StoreContext.Provider value={storeFor(personaId)}>
          <AppExtrasContext.Provider value={extrasFor(personaId, extras)}>
            <MemoryRouter initialEntries={[pathname]}>
              <Routes>
                <Route element={<AppLiveShell />}>
                  <Route path="*" element={page} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AppExtrasContext.Provider>
        </StoreContext.Provider>
      </AppEnvContext.Provider>
    </LayoutModeContext.Provider>,
  ));
}

/** The test ids in the tab bar, in order (the phone layout). */
const tabIds = (html: string) => [...html.slice(html.indexOf('data-testid="tab-bar"')).matchAll(/data-testid="(nav-[^"]+|tab-more)"/g)].map((m) => m[1]);

describe("AppLiveShell", () => {
  it("builds the sidebar from the persona's menu, with no logo, no inbox and no demo menu", () => {
    const html = render("/rmm", "rmm");
    for (const id of ["nav-rmm", "nav-review", "nav-cases", "nav-suppliers"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toContain('data-testid="the-page"');
    expect(html).not.toContain('alt="Beiersdorf"'); // Thomas, 20 Oct: no logo in the left pane
    expect(html).not.toContain("Inbox");
    expect(html).not.toContain("View as");
    expect(html).not.toContain("Reset to empty start");
  });

  it("dev (dev-beiersdorf.kissflow.eu): the top bar with the role switcher and the person chip", () => {
    const html = render("/rmm", "rmm");
    expect(html).toContain('data-testid="dev-top-bar"');
    expect(html).toContain('data-testid="role-switcher"');
    expect(html).toContain('data-testid="person-chip"');
    expect(html).toContain('data-persona="rmm"');
    expect(html).toContain('data-env="dev"');
  });

  it("prod (beiersdorf.kissflow.eu): no top bar at all, no switcher, no person chip; the menu and its footer stay", () => {
    const html = render("/rmm", "rmm", {}, undefined, { env: "prod" });
    expect(html).not.toContain('data-testid="dev-top-bar"');
    expect(html).not.toContain("<header");
    expect(html).not.toContain('data-testid="role-switcher"');
    expect(html).not.toContain('data-testid="person-chip"');
    expect(html).toContain('data-testid="main-nav"');
    expect(html).toContain('data-testid="side-footer"');
    expect(html).toContain('data-testid="the-page"');
  });

  it("the left pane can collapse (a toggle), and its very bottom holds the status note and Reload", () => {
    const html = render("/rmm", "rmm");
    expect(html).toContain('data-testid="nav-toggle"');
    expect(html).toContain('data-collapsed="false"');
    const footer = html.slice(html.indexOf('data-testid="side-footer"'));
    expect(footer).toContain('data-testid="load-status"');
    expect(footer).toContain('data-testid="reload"');
    expect(footer.indexOf('data-testid="load-status"')).toBeLessThan(footer.indexOf("</aside>"));
    // the main column has no status or Reload of its own
    const mainCol = html.slice(html.indexOf("</aside>"));
    expect(mainCol).not.toContain('data-testid="reload"');
  });

  it("shows the case banner with the reason on /cases/:id and /review/:caseId only", () => {
    const why = (id: string) => (id === "ZZT-0003" ? "no permission to read this item" : undefined);
    const banner = "Kissflow did not let your role read this case&#x27;s questionnaire (no permission to read this item)";
    expect(render("/cases/ZZT-0003", "rmm", { caseBanner: why })).toContain(banner);
    expect(render("/review/ZZT-0003", "rmm", { caseBanner: why })).toContain('data-testid="case-banner"');
    expect(render("/cases/ZZT-0001", "rmm", { caseBanner: why })).not.toContain('data-testid="case-banner"');
    expect(render("/cases", "rmm", { caseBanner: why })).not.toContain('data-testid="case-banner"');
  });

  it("m15: shows the case's configuration pin problem as a warning banner on /cases/:id and /review/:caseId only", () => {
    const pin = (id: string) => (id === "ZZT-0003" ? "ZZT-0003 is pinned to RS-2099.9 + CIQ-2026 v9, which no published release provides." : undefined);
    const html = render("/cases/ZZT-0003", "rmm", { casePin: pin });
    expect(html).toContain('data-testid="case-pin-banner"');
    expect(html).toContain("ZZT-0003 is pinned to RS-2099.9 + CIQ-2026 v9, which no published release provides.");
    expect(render("/review/ZZT-0003", "rmm", { casePin: pin })).toContain('data-testid="case-pin-banner"');
    expect(render("/cases/ZZT-0001", "rmm", { casePin: pin })).not.toContain('data-testid="case-pin-banner"');
    expect(render("/cases", "rmm", { casePin: pin })).not.toContain('data-testid="case-pin-banner"');
  });

  it("m8: the left pane\'s note says Loading… while a read runs and Saving… only while a write runs", () => {
    const status = (patch: Partial<LiveAppExtras>) => /data-testid="load-status"[^>]*>([^<]*)</.exec(render("/rmm", "rmm", patch))?.[1];
    expect(status({ busy: true, loading: true, saving: false })).toBe("Loading…");
    expect(status({ busy: true, loading: false, saving: true })).toBe("Saving…");
    expect(status({ busy: true, loading: true, saving: true })).toBe("Saving…");
    expect(status({ busy: false, loading: false, saving: false })).toMatch(/^Updated /);
  });

  it("26 Oct: no read-only configuration banner any more (the Business administrator's editor is live)", () => {
    const html = render("/admin/rules", "admin");
    expect(html).not.toContain('data-testid="config-readonly-banner"');
    expect(html).not.toContain("In this version the configuration is read-only.");
    expect(render("/admin/rules", "auditor")).not.toContain('data-testid="config-readonly-banner"');
  });

  it("warns when the page is outside CIQ Digital, when a refresh failed, and when reads were incomplete", () => {
    expect(render("/rmm", "rmm", { containerOk: false })).toContain('data-testid="container-banner"');
    const failed = render("/rmm", "rmm", { loadError: "Kissflow did not answer" });
    expect(failed).toContain('data-testid="load-error-banner"');
    expect(failed).toContain("Kissflow did not answer");
    expect(render("/rmm", "rmm", { warnings: ["CIQ Supplier could not be read: no permission"] })).toContain('data-testid="load-warnings"');
    expect(render("/rmm", "rmm")).not.toMatch(/container-banner|load-error-banner|load-warnings/);
  });

  it("keeps a role to its menu, but opens Diagnostics to every role", () => {
    const blocked = render("/suppliers", "qm");
    expect(blocked).toContain('data-testid="no-access"');
    expect(blocked).not.toContain('data-testid="the-page"');
    expect(render(DIAGNOSTICS_PATH, "qm")).toContain('data-testid="the-page"');
    expect(render("/cases/ZZT-0001", "cus")).toContain('data-testid="the-page"');
  });
});

describe("AppLiveShell on a phone (Thomas, 30 Oct: < 768 px)", () => {
  const phone = (path: string, persona: InternalPersonaId, env: AppEnvValue = { env: "prod" }, extras: Partial<LiveAppExtras> = {}) => render(path, persona, extras, undefined, env, "phone");

  it("no left pane; the tab bar: the persona's first four entries, then More (RMM: Dashboard, My reviews, Cases, Suppliers)", () => {
    const html = phone("/rmm", "rmm");
    expect(html).not.toContain('data-testid="side-pane"');
    expect(html).not.toContain('data-testid="side-footer"');
    expect(tabIds(html)).toEqual(["nav-rmm", "nav-review", "nav-cases", "nav-suppliers", "tab-more"]);
    expect(tabIds(phone("/review", "saf"))).toEqual(["nav-review", "nav-cases", "nav-admin-rules", "nav-admin-templates", "tab-more"]);
    expect(tabIds(phone("/cases", "cus"))).toEqual(["nav-cases", "nav-admin-rules", "nav-admin-templates", "nav-admin-ownership", "tab-more"]);
    expect(html).toContain('data-testid="the-page"');
  });

  it("the header names the page; a case or a review page has the back arrow", () => {
    expect(phone("/rmm", "rmm")).toContain('data-testid="phone-title" class="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">Dashboard</p>');
    expect(phone("/rmm", "rmm")).not.toContain('data-testid="phone-back"');
    for (const [path, title] of [["/cases/ZZT-0003", "Case"], ["/review/ZZT-0003", "Review"], ["/cases/new", "New case"], ["/suppliers/S1", "Supplier"], ["/diagnostics", "Diagnostics"]]) {
      const html = phone(path, "rmm");
      expect(html).toContain(`>${title}</p>`);
      expect(html).toContain('data-testid="phone-back"');
    }
  });

  it("prod: no dev top bar; dev: the compact one inside the header, with the role switcher and the person chip", () => {
    const prod = phone("/rmm", "rmm");
    expect(prod).not.toContain('data-testid="dev-top-bar"');
    expect(prod).not.toContain('data-testid="role-switcher"');
    const dev = phone("/rmm", "rmm", { env: "dev" });
    const header = dev.slice(dev.indexOf('data-testid="phone-header"'), dev.indexOf("</header>"));
    expect(header).toContain('data-testid="dev-top-bar" data-compact="true"');
    expect(header).toContain('data-testid="role-switcher"');
    expect(header).toContain('data-testid="person-chip"');
    expect(header).toContain(">Dev</span>");
  });

  it("the status note is in the header (Saving… shown while a write runs); the banners and the page stay in <main>", () => {
    const idle = phone("/rmm", "rmm");
    expect(idle).toMatch(/data-testid="load-status" aria-live="polite" class="sr-only">Updated [^<]+</);
    const busy = phone("/rmm", "rmm", { env: "prod" }, { busy: true, saving: true });
    expect(busy).toMatch(/data-testid="load-status" aria-live="polite" class="shrink-0 text-\[12px\] text-ink-3">Saving…</);
    const why = phone("/cases/ZZT-0003", "rmm", { env: "prod" }, { caseBanner: () => "no permission", loadError: "boom" });
    const main = why.slice(why.indexOf("<main"), why.indexOf("</main>"));
    for (const id of ["case-banner", "load-error-banner", "the-page"]) expect(main).toContain(`data-testid="${id}"`);
  });

  it("a tablet is the desktop layout (the left pane)", () => {
    const html = render("/rmm", "rmm", {}, undefined, { env: "prod" }, "tablet");
    expect(html).toContain('data-testid="side-pane"');
    expect(html).not.toContain('data-testid="tab-bar"');
  });
});

describe("routes", () => {
  it("mirror the prototype's internal routes (src/App.tsx), plus Diagnostics", () => {
    const app = readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
    const internal = app.slice(app.indexOf("<InternalShell />"), app.indexOf("<SupplierShell />"));
    const expected = [...internal.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
    const fragment = internalChildRoutes() as ReactElement<{ children: ReactNode }>;
    const paths = Children.toArray(fragment.props.children)
      .filter(isValidElement)
      .map((r) => (r.props as { path?: string }).path);
    expect(expected.length).toBeGreaterThan(10);
    expect(paths).toEqual([...expected, DIAGNOSTICS_PATH]);
  });
});

describe("Diagnostics", () => {
  it("shows the reads with the rung that served each flow, and webhook hosts without their paths", () => {
    const html = render(DIAGNOSTICS_PATH, "rmm", {
      reads: [
        { flow: "case", rung: "admin", ok: false, count: 0, ms: 12, error: "KISSFLOW_ERROR_050302 no permission" },
        { flow: "case", rung: "mine", ok: true, count: 3, ms: 40 },
        { flow: "case", rung: "byId", ok: true, count: 1, ms: 20 },
        { flow: "supplier", rung: "skipped", ok: true, count: 0, ms: 0 },
        { flow: "review", rung: "mine", ok: true, count: 6, ms: 30, keys: ["Review_Key", "_id", "_status"] },
      ],
      webhooks: { "op.round": "https://hooks.example.test/catch/secret-token-123", "op.closed": "/integration/2/AcTEST/webhook/secret-token-456" },
      writeLog: [{ at: "2026-10-20T21:05:00Z", method: "raiseOpenPoint", ok: true, handoffs: [{ code: "history.updated", status: "pending" }] }],
      drafts: [{ flow: "case", itemId: "PkCase9", act: "Act9", label: "ZZT-0009 · OLIVIA Pure 100" }],
    }, <Diagnostics />);
    expect(html).toContain('data-testid="diag-read-case-admin" data-ok="0"');
    expect(html).toContain("KISSFLOW_ERROR_050302 no permission");
    expect(html.match(/>used</g)?.length).toBe(2); // the first successful read of each flow (case, review)
    expect(html).toContain("configured · hooks.example.test");
    expect(html).not.toContain("secret-token-123");
    // a relative URL (no Kissflow page around the frame) goes by the Kissflow API route
    expect(html).toContain("configured · Kissflow API route");
    expect(html).not.toContain("secret-token-456");
    expect(html).toContain('data-testid="diag-hook-release.requested" data-configured="0"');
    expect(html).toContain('data-testid="diag-write" data-method="raiseOpenPoint" data-ok="1"');
    expect(html).toContain("history.updated: pending");
    expect(html).toContain('data-testid="diag-draft-send-PkCase9"');
    expect(html).toContain('data-testid="diag-build"');
    // m16 / morning test R-1: the fields a live My items row carried
    expect(html).toMatch(/data-testid="diag-read-keys-review"[^>]*>Row fields: <[^>]+>Review_Key, _id, _status</);
  });
});

describe("NoRolePage", () => {
  const caOnly: Identity = { ...identity, personas: [], caseAdmin: true, roles: [{ id: "RoEKl88jv4dv", name: "Case administrator" }] };
  const page = (env: AppEnvValue["env"]) =>
    flat(renderToString(
      <AppEnvContext.Provider value={{ env }}>
        <NoRolePage identity={caOnly} />
      </AppEnvContext.Provider>,
    ));

  it("dev: names the roles Kissflow sent and where Case administrator and Integration service work", () => {
    const html = page("dev");
    expect(html).toContain('data-testid="no-role"');
    expect(html).toContain("has no CIQ role in this app (roles: Case administrator). Case administrator and Integration service work in Kissflow directly.");
  });

  it("C7, prod: says what to do, without the raw role names", () => {
    const html = page("prod");
    expect(html).toContain("Your Kissflow account (katrin.vogel@beiersdorf.example) has no CIQ Digital role. Ask your CIQ administrator for one.");
    expect(html).not.toContain("roles: Case administrator");
    expect(html).not.toContain("Integration service");
  });
});

// ------------------------------------------------------------------------------------------------ FE-CLEANUP, 22 Oct

/** The visible text of server markup (tags dropped). */
const textOf = (html: string) => flat(html).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
/** What a tester must never read in production: Kissflow codes and messages, flow / field / item ids, transport tags,
 *  unverified marks, pointers to Diagnostics, mapper jargon (the inventory's test idea 2). */
const TECH = /_A00\b|KISSFLOW_ERROR|\b05\d{4}\b|\((SDK|REST|fetch)\)|\b[A-Z][A-Za-z]*_[A-Z][A-Za-z_]*\b|\bPk[A-Z][A-Za-z0-9]+|OWN:current|REM:current|read route|hand-off|history line|screen's state|person menu|Diagnostics|\[unverified\]|\.\./;

/** A load as raw as dev data gets: refusals, notes, a failed refresh, a case not read in full, a pin, an unsent item,
 *  a part kept from an earlier load, a case left out. */
const RAW: Partial<LiveAppExtras> = {
  loadError: "KISSFLOW_ERROR_050302 You don't have permission to access this item.",
  warnings: [
    "CIQ Supplier could not be read: KISSFLOW_ERROR_050302 no permission",
    "CIQ Case PkCase3: Kissflow answered without the item. (SDK); 403 (REST)",
    "3 cases could not be read in full for your role; their questionnaire answers are missing (Diagnostics shows why).",
    "CIQ Open Point shown as of 21:00: it could not be read again.",
    "ZZT-0005: this case could not be read (boom); it is not shown. Diagnostics lists the other warnings.",
  ],
  notes: ['1 supplier has the kind "Trader", shown as distributor.', "The section ownership row (OWN:current) could not be read; the built-in owners are shown.", "ZZT-0003: This case is pinned to rule set RS-2099.9 with questionnaire v9, which no configuration release provides; its sections may be shown from another questionnaire version."],
  keptAt: "2026-10-20T21:00:00Z",
  dropped: ["ZZT-0005"],
  caseBanner: (id) => (id === "ZZT-0003" ? "KISSFLOW_ERROR_050302 no permission to read this item" : undefined),
  casePin: (id) => (id === "ZZT-0003" ? PIN_UNKNOWN : undefined),
  drafts: [{ flow: "op", itemId: "PkOp3", act: "Act3", label: "Open point OP-0003-09 on ZZT-0003" }],
};

describe("FE-CLEANUP: the shell in production and in dev", () => {
  it("prod: the main column and its banners carry no technical token (test idea 2)", () => {
    for (const path of ["/rmm", "/cases/ZZT-0003", "/review/ZZT-0003"]) {
      const text = textOf(render(path, "rmm", RAW, undefined, { env: "prod" }));
      expect(text.match(TECH), path).toBeNull();
    }
  });

  it("prod C1: one plain line (parts kept from an earlier read), Reload and Details, the case left out; no list", () => {
    const html = render("/rmm", "rmm", RAW, undefined, { env: "prod" });
    const text = textOf(html);
    expect(text).toContain(`${SOME_KEPT(RAW.keptAt!)} Reload · Details`);
    expect(SOME_KEPT(RAW.keptAt!)).toMatch(/^Some data could not be refreshed; parts of the page show the state of \S.*\.$/);
    expect(text).toContain("Case ZZT-0005 could not be loaded and is not listed.");
    expect(html).not.toContain('data-testid="load-warnings-list"');
    expect(html).not.toContain('data-testid="load-notes-list"');
    const fresh = textOf(render("/rmm", "rmm", { warnings: ["CIQ Supplier could not be read: KISSFLOW_ERROR_050302 no permission"] }, undefined, { env: "prod" }));
    expect(fresh).toContain("Some data could not be loaded, so this page may be incomplete. Reload · Details");
    // notes alone are dev's: production shows nothing
    expect(render("/rmm", "rmm", { notes: ["x"] }, undefined, { env: "prod" })).not.toContain('data-testid="load-warnings"');
  });

  it("dev C1/C9: both lists, labelled, raw, behind Details", () => {
    const html = render("/rmm", "rmm", RAW);
    const text = textOf(html);
    expect(text).toContain("5 things could not be read in full; what you see may be incomplete. Details");
    expect(html).toContain('data-testid="load-warnings-list"');
    expect(html).toContain('data-testid="load-notes-list"');
    expect(text).toContain("Could not be read");
    expect(text).toContain("Notes");
    expect(text).toContain("CIQ Supplier could not be read: KISSFLOW_ERROR_050302 no permission");
    expect(text).toContain("The section ownership row (OWN:current) could not be read");
    expect(textOf(render("/rmm", "rmm", { notes: ["x", "y"] }))).toContain("2 notes on how the data was read. Details");
  });

  it("C2 and A2: prod names no cause; dev keeps Kissflow's, with one full stop", () => {
    expect(textOf(render("/rmm", "rmm", { loadError: "KISSFLOW_ERROR_00500 Try again later." }, undefined, { env: "prod" }))).toContain("Couldn't refresh from Kissflow. You are seeing the data from ");
    const dev = textOf(render("/rmm", "rmm", { loadError: "Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through." }));
    expect(dev).toContain("Couldn't refresh from Kissflow: Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through. You are seeing the data from ");
    expect(dev).not.toContain("..");
  });

  it("C8: the case banner says what it means in prod; dev keeps the reason", () => {
    const why = (id: string) => (id === "ZZT-0003" ? "403 no permission" : undefined);
    expect(textOf(render("/cases/ZZT-0003", "rmm", { caseBanner: why }, undefined, { env: "prod" }))).toContain("The questionnaire of this case could not be loaded for your role. You see its header, reviews and open points. If you need the answers, tell your CIQ administrator.");
    expect(textOf(render("/cases/ZZT-0003", "rmm", { caseBanner: why }))).toContain("Kissflow did not let your role read this case's questionnaire (403 no permission).");
  });

  it("A1: the unsent items in both environments, with the way to send or discard them (not on Diagnostics itself)", () => {
    for (const env of ["dev", "prod"] as const) {
      const html = render("/rmm", "rmm", { drafts: RAW.drafts! }, undefined, { env });
      expect(textOf(html)).toContain("You have 1 unsent item: Open point OP-0003-09 on ZZT-0003. It reached Kissflow but was not sent on. Send or discard");
      expect(html).toMatch(/href="\/diagnostics#drafts"[^>]*data-testid="unsent-open"|data-testid="unsent-open"[^>]*href="\/diagnostics#drafts"/);
    }
    const two = [...RAW.drafts!, { flow: "case" as const, itemId: "PkCase9", act: "Act9", label: "New case ZZT-0009 · OLIVIA Pure 100" }];
    expect(textOf(render("/rmm", "rmm", { drafts: two }))).toContain("You have 2 unsent items: Open point OP-0003-09 on ZZT-0003; New case ZZT-0009 · OLIVIA Pure 100. They reached Kissflow but were not sent on.");
    expect(render(DIAGNOSTICS_PATH, "rmm", { drafts: two })).not.toContain('data-testid="unsent-banner"');
    expect(render("/rmm", "rmm")).not.toContain('data-testid="unsent-banner"');
    // a phone: the count only, so the banner does not fill the screen on every page (Diagnostics lists the items)
    const phone = textOf(render("/rmm", "rmm", { drafts: two }, undefined, { env: "dev" }, "phone"));
    expect(phone).toContain("You have 2 unsent items. They reached Kissflow but were not sent on. Send or discard");
    expect(phone).not.toContain("OLIVIA Pure 100");
  });

  it("B1: a pin problem is one calm banner (the mapper's text), never a load warning", () => {
    const text = textOf(render("/cases/ZZT-0003", "rmm", { casePin: RAW.casePin! }, undefined, { env: "prod" }));
    expect(text).toContain(PIN_UNKNOWN);
    expect(text).not.toMatch(TECH);
  });
});

describe("FE-CLEANUP: the boot pages and the page boundary", () => {
  const boundary = (env: "dev" | "prod" | undefined) => {
    const b = new PageBoundary({ children: null, ...(env ? { env } : {}) });
    b.state = { error: new Error("Cannot read properties of undefined (reading 'Case_Item_Id')") };
    return textOf(renderToString(<>{b.render()}</>));
  };
  const start = (env: "dev" | "prod") => {
    const b = new StartBoundary({ children: null, env });
    b.state = { error: new Error("Kissflow answered without an account or app.") };
    return textOf(renderToString(<MemoryRouter>{b.render()}</MemoryRouter>));
  };

  it("A3/C6: a page that could not be shown says what to do in prod, without the error or the person menu", () => {
    const prod = boundary("prod");
    expect(prod).toContain("Something on this page could not be shown. Other pages and cases are not affected. Reload the page; if it stays, tell your CIQ administrator which page you opened.");
    expect(prod).not.toMatch(TECH);
    expect(boundary("dev")).toContain("(Cannot read properties of undefined (reading 'Case_Item_Id')). Other pages and cases are not affected. Reload, and open Diagnostics from the person menu if it stays.");
  });

  it("C5/A2: the start failure says what to do in prod; dev keeps the message, with one full stop before the bracket", () => {
    expect(start("prod")).toContain("Something went wrong while opening the app. Reload the page; if it stays, tell your CIQ administrator.");
    expect(start("prod")).not.toContain("account or app");
    expect(start("dev")).toContain("Something went wrong while opening the app (Kissflow answered without an account or app). Reload the page");
    expect(start("dev")).not.toContain(".)");
  });

  it("C4: the handshake failure is plain in every environment, Kissflow's answer folded under Technical details", () => {
    const html = flat(renderToString(<ConnectFailed detail="Kissflow did not answer within 12 s." onRetry={() => {}} />));
    const text = textOf(html);
    expect(text).toContain("Kissflow did not answer. Reload the page; if this keeps happening, tell your CIQ administrator.");
    expect(html).toMatch(/<details[^>]*data-testid="connect-failed-detail"(?![^>]*open)/);
    expect(text).toContain("Technical details Kissflow did not answer within 12 s.");
  });
});

describe("FE-CLEANUP: Diagnostics", () => {
  const diag: Partial<LiveAppExtras> = {
    ...RAW,
    reads: [{ flow: "case", rung: "admin", ok: false, count: 0, ms: 12, error: "KISSFLOW_ERROR_050302 no permission" }],
    writeLog: [{ at: "2026-10-20T21:05:00Z", method: "reviewResponse", ok: false, message: "Not saved: Kissflow did not allow this for your role.", detail: "KISSFLOW_ERROR_050302 You don't have permission to access this item.", handoffs: [] }],
  };

  it("C26 prod: Unsent items first, then what could not be loaded, the rest folded under Technical details (for support)", () => {
    const html = render(DIAGNOSTICS_PATH, "rmm", diag, <Diagnostics />, { env: "prod" });
    const at = (needle: string) => html.indexOf(needle);
    expect(at('data-testid="diag-drafts"')).toBeGreaterThan(0);
    expect(at('data-testid="diag-drafts"')).toBeLessThan(at("What could not be loaded"));
    expect(at("What could not be loaded")).toBeLessThan(at('data-testid="diag-technical"'));
    expect(html).toMatch(/<details[^>]*data-testid="diag-technical"(?![^>]*open)/);
    expect(at('data-testid="diag-technical"')).toBeLessThan(at('data-testid="diag-acting"'));
    expect(textOf(html)).toContain("For support: what CIQ Digital could read and save in this session.");
    // A1/C29: the unsent items without their Kissflow process or item id; a true subtitle
    const drafts = textOf(html.slice(at('data-testid="diag-drafts"'), at("What could not be loaded")));
    expect(drafts).toContain("Unsent items");
    expect(drafts).toContain("Items that reached Kissflow but were not sent on. Send them, or discard them.");
    expect(drafts).not.toMatch(/PkOp3|CIQ Open Point/);
    // the Writes log keeps the raw cause, in the folded part
    expect(html.indexOf("KISSFLOW_ERROR_050302 You don&#x27;t have permission to access this item.")).toBeGreaterThan(at('data-testid="diag-technical"'));
    // what could not be loaded, in plain words: everything a tester reads before the fold names no code, flow or item id
    const shown = textOf(html.slice(at('data-testid="diag-drafts"'), at('data-testid="diag-technical"')));
    expect(shown.match(TECH)).toBeNull();
    expect(shown).toContain(`${DIAG_KEPT(RAW.keptAt!)} Case ZZT-0005 could not be loaded and is not listed. If it stays after a reload, tell your CIQ administrator: the technical details below show what failed.`);
    // Kissflow's own warnings are the folded Warnings card's
    for (const w of ["CIQ Supplier could not be read: KISSFLOW_ERROR_050302 no permission", "3 cases could not be read in full for your role"]) expect(html.indexOf(w)).toBeGreaterThan(at('data-testid="diag-technical"'));
    expect(textOf(render(DIAGNOSTICS_PATH, "rmm", {}, <Diagnostics />, { env: "prod" }))).toContain("What could not be loaded Everything was loaded.");
    expect(textOf(render(DIAGNOSTICS_PATH, "rmm", { warnings: RAW.warnings! }, <Diagnostics />, { env: "prod" }))).toContain("What could not be loaded Some data could not be loaded, so some pages may be incomplete.");
  });

  it("dev: every card unfolded as before, plus the mapper's notes; A11's true webhook subtitle", () => {
    const html = render(DIAGNOSTICS_PATH, "rmm", diag, <Diagnostics />);
    expect(html).not.toContain('data-testid="diag-technical"');
    expect(html).toContain('data-testid="diag-notes"');
    expect(textOf(html)).toContain('1 supplier has the kind "Trader", shown as distributor.');
    expect(html.indexOf('data-testid="diag-acting"')).toBeLessThan(html.indexOf('data-testid="diag-drafts"'));
    expect(textOf(html)).toContain("Without one, the change is saved here but not passed to the supplier portal; the Writes log shows it as pending.");
    expect(textOf(html)).not.toContain("pending hand-off");
    expect(html).toContain('id="drafts"');
  });
});
