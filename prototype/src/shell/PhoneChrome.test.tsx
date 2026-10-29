// The phone chrome (Thomas, 30 Oct): the tab bar's split into tabs and More, the header's title and back target for a
// path, Back that stays inside the UI's own history, the offsets, and ResponsiveShell: the phone layout (no left pane,
// header, tab bar) under LayoutModeContext "phone", the desktop markup unchanged otherwise. Rendered on the server; the
// harnesses (scripts/harness-applive.mjs, harness-portal.mjs: the phone scenarios) drive the real thing at 390 / 360 px.
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/portal/theme";
import { PHONE_TABBAR_H, TAB_SLOTS, goBack, phoneHeadOf, phoneOffsetStyle, splitTabs, usePhoneHeader } from "./PhoneChrome";
import { PHONE_MAIN, ResponsiveShell } from "./ResponsiveShell";
import type { PaneItem } from "./SidePane";
import { LayoutModeContext, type LayoutMode } from "./useLayoutMode";

const flat = (html: string) => html.replace(/<!-- -->/g, "");
const item = (to: string, label: string, extra: Partial<PaneItem> = {}): PaneItem => ({ to, label, icon: <svg />, testId: `nav-${to.slice(1).replace(/\//g, "-")}`, ...extra });
const RMM = [item("/rmm", "Dashboard", { active: true }), item("/review", "My reviews"), item("/cases", "Cases"), item("/suppliers", "Suppliers"), item("/admin/rules", "Rules"), item("/admin/templates", "Questionnaire"), item("/admin/ownership", "Section owners")];

describe("splitTabs", () => {
  it("the last of the 5 slots is always More: up to 4 entries first, the rest in More", () => {
    expect(TAB_SLOTS).toBe(5);
    const n = (k: number) => Array.from({ length: k }, (_, i) => i);
    expect(splitTabs(n(2))).toEqual({ tabs: [0, 1], more: [] }); // the portal supplier: My requests, Help
    expect(splitTabs(n(4))).toEqual({ tabs: [0, 1, 2, 3], more: [] });
    expect(splitTabs(n(5))).toEqual({ tabs: [0, 1, 2, 3], more: [4] }); // a reviewer
    expect(splitTabs(n(8))).toEqual({ tabs: [0, 1, 2, 3], more: [4, 5, 6, 7] }); // RMM with the data console
  });
});

describe("phoneHeadOf", () => {
  const details: [string, string][] = [["/cases/new", "New case"], ["/cases/:id", "Case"], ["/review/:caseId", "Review"], ["/diagnostics", "Diagnostics"]];
  it("a menu entry's page: its label, no back arrow", () => {
    expect(phoneHeadOf("/rmm", RMM, details, "CIQ Digital", "/rmm")).toEqual({ title: "Dashboard" });
    expect(phoneHeadOf("/admin/ownership", RMM, details, "CIQ Digital", "/rmm")).toEqual({ title: "Section owners" });
  });
  it("a page below an entry: its detail title (else the entry's label), back to the entry", () => {
    expect(phoneHeadOf("/cases/ZZT-0003", RMM, details, "CIQ Digital", "/rmm")).toEqual({ title: "Case", back: "/cases" });
    expect(phoneHeadOf("/cases/new", RMM, details, "CIQ Digital", "/rmm")).toEqual({ title: "New case", back: "/cases" });
    expect(phoneHeadOf("/review/ZZT-0003", RMM, details, "CIQ Digital", "/rmm")).toEqual({ title: "Review", back: "/review" });
    expect(phoneHeadOf("/suppliers/S1", RMM, details, "CIQ Digital", "/rmm")).toEqual({ title: "Suppliers", back: "/suppliers" });
  });
  it("the longest entry wins; any other page: its detail title (else the fallback), back home unless it is home", () => {
    const portal = [item("/portal", "My requests"), item("/portal/help", "Help")];
    expect(phoneHeadOf("/portal/help", portal, [], "Supplier portal", "/portal")).toEqual({ title: "Help" });
    expect(phoneHeadOf("/portal/case/ZZT-0001", portal, [["/portal/case/:id", "Request"]], "Supplier portal", "/portal")).toEqual({ title: "Request", back: "/portal" });
    expect(phoneHeadOf("/diagnostics", RMM, details, "CIQ Digital", "/rmm")).toEqual({ title: "Diagnostics", back: "/rmm" });
    expect(phoneHeadOf("/elsewhere", RMM, details, "CIQ Digital", "/rmm")).toEqual({ title: "CIQ Digital", back: "/rmm" });
    expect(phoneHeadOf("/home", [], [], "Home", "/home")).toEqual({ title: "Home" });
  });
  it("buttons in the menu (no route) never count as a page", () => {
    expect(phoneHeadOf("/admin", [{ label: "Roles & grants", icon: null }, item("/admin", "Overview")], [], "x", "/admin")).toEqual({ title: "Overview" });
  });
});

describe("goBack", () => {
  it("one step back while the UI has history of its own, else to the fallback (never out of the Kissflow frame)", () => {
    const nav = vi.fn();
    goBack(nav, "/cases", { idx: 2, key: "k" });
    expect(nav).toHaveBeenLastCalledWith(-1);
    for (const state of [{ idx: 0 }, null, {}, { idx: "1" }]) {
      goBack(nav, "/cases", state);
      expect(nav).toHaveBeenLastCalledWith("/cases");
    }
  });
});

describe("phoneOffsetStyle", () => {
  it("publishes the header block's and the tab bar's heights, with the safe areas", () => {
    expect(phoneOffsetStyle(true)).toEqual({ "--app-header-h": "calc(98px + env(safe-area-inset-top, 0px))", "--app-tabbar-h": `calc(${PHONE_TABBAR_H + 1}px + env(safe-area-inset-bottom, 0px))` });
    expect(phoneOffsetStyle(false)["--app-header-h" as keyof ReturnType<typeof phoneOffsetStyle>]).toBe("calc(49px + env(safe-area-inset-top, 0px))");
  });
});

function OwnTitle() {
  usePhoneHeader({ title: "ZZT-0003" });
  return <div data-testid="the-page">PAGE</div>;
}

function shell(mode: LayoutMode, path: string, opts: { status?: boolean; topBar?: boolean; page?: React.ReactNode; items?: PaneItem[] } = {}) {
  return flat(
    renderToString(
      <LayoutModeContext.Provider value={mode}>
        <ThemeProvider>
          <MemoryRouter initialEntries={[path]}>
            <ResponsiveShell
              env="prod"
              hasTopBar={!!opts.topBar}
              pane={{ title: "CIQ Digital", items: opts.items ?? RMM, collapsed: false, onToggle: () => {}, status: opts.status ? { text: "Updated 12:40", busy: false, reload: () => {} } : undefined, actions: <button type="button">FS</button> }}
              topBar={opts.topBar ? <div data-testid="dev-top-bar">DEV</div> : null}
              beforeMain={<div data-testid="before">B</div>}
              afterMain={<footer data-testid="after">F</footer>}
              mainClassName="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6"
              phone={phoneHeadOf(path, RMM, [["/cases/:id", "Case"]], "CIQ Digital", "/rmm")}
            >
              {opts.page ?? <div data-testid="the-page">PAGE</div>}
            </ResponsiveShell>
          </MemoryRouter>
        </ThemeProvider>
      </LayoutModeContext.Provider>,
    ),
  );
}

describe("ResponsiveShell", () => {
  it("desktop and tablet: the left pane, the top bar, the slots and <main> with the shell's own classes; no phone chrome", () => {
    for (const mode of ["desktop", "tablet"] as const) {
      const html = shell(mode, "/rmm", { status: true, topBar: true });
      expect(html).toContain('data-testid="side-pane"');
      expect(html).toContain('<main class="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">');
      expect(html).toContain('style="--app-header-h:57px"');
      expect(html).not.toContain("data-layout");
      for (const id of ["phone-header", "tab-bar", "tab-more"]) expect(html).not.toContain(`data-testid="${id}"`);
      expect(html.indexOf('data-testid="dev-top-bar"')).toBeLessThan(html.indexOf('data-testid="before"'));
      expect(html.indexOf("<main")).toBeLessThan(html.indexOf('data-testid="after"'));
    }
  });

  it("phone: no left pane; the header (top bar inside), the slot before <main>, <main> with the phone gutter, then the tab bar (no footer slot)", () => {
    const html = shell("phone", "/rmm", { status: true, topBar: true });
    expect(html).not.toContain('data-testid="side-pane"');
    expect(html).toContain('data-layout="phone"');
    expect(html).toContain(`<main class="${PHONE_MAIN}">`);
    expect(html).toContain("--app-tabbar-h:calc(57px + env(safe-area-inset-bottom, 0px))");
    const order = ["phone-header", "dev-top-bar", "phone-title", "before", "the-page", "tab-bar"].map((id) => html.indexOf(`data-testid="${id}"`));
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);
    // nothing between the page's sticky action bar and the tab bar
    expect(html).not.toContain('data-testid="after"');
    expect(html).toMatch(/<header data-app-header="true" data-testid="phone-header"/);
  });

  it("phone: the tab bar holds the first four entries (their own test ids, the current one marked) and More", () => {
    const html = shell("phone", "/rmm");
    const bar = html.slice(html.indexOf('data-testid="tab-bar"'));
    for (const id of ["nav-rmm", "nav-review", "nav-cases", "nav-suppliers", "tab-more"]) expect(bar).toContain(`data-testid="${id}"`);
    for (const id of ["nav-admin-rules", "nav-admin-templates", "nav-admin-ownership"]) expect(bar).not.toContain(`data-testid="${id}"`);
    expect(bar).toContain('data-testid="main-nav"');
    expect(bar.match(/<a[^>]*data-testid="nav-rmm"[^>]*>/)?.[0]).toContain('aria-current="page"');
    expect(bar.match(/<a[^>]*data-testid="nav-cases"[^>]*>/)?.[0]).not.toContain("aria-current");
    expect(bar).toMatch(/data-testid="tab-more" data-active="false" aria-haspopup="dialog" aria-expanded="false"/);
    // the More sheet renders only when opened (a portal)
    expect(html).not.toContain('data-testid="more-sheet"');
  });

  it("phone: a page in More lights More; a menu page has no back arrow, a detail page has one", () => {
    const owners = RMM.map((n) => ({ ...n, active: n.to === "/admin/ownership" }));
    expect(shell("phone", "/admin/ownership", { items: owners }).match(/data-testid="tab-more" data-active="(\w+)"/)?.[1]).toBe("true");
    expect(shell("phone", "/rmm").match(/data-testid="tab-more" data-active="(\w+)"/)?.[1]).toBe("false");
    const menu = shell("phone", "/rmm");
    expect(menu).toContain('data-testid="phone-title" class="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">Dashboard</p>');
    expect(menu).not.toContain('data-testid="phone-back"');
    const detail = shell("phone", "/cases/ZZT-0003");
    expect(detail).toContain('data-testid="phone-back" aria-label="Back"');
    expect(detail).toContain(">Case</p>");
  });

  it("phone: the status note sits in the header for screen readers (shown while busy); prod without a top bar: no dev bar", () => {
    const html = shell("phone", "/rmm", { status: true });
    expect(html).toMatch(/data-testid="load-status" aria-live="polite" class="sr-only">Updated 12:40</);
    expect(html).not.toContain('data-testid="dev-top-bar"');
    expect(html).toContain("--app-header-h:calc(49px + env(safe-area-inset-top, 0px))");
  });

  it("a page's own title (usePhoneHeader) applies after its effect runs; the server shows the shell's", () => {
    // effects do not run on the server: the shell's own title shows; the harness checks the page's title live
    expect(shell("phone", "/cases/ZZT-0003", { page: <OwnTitle /> })).toContain(">Case</p>");
  });
});
