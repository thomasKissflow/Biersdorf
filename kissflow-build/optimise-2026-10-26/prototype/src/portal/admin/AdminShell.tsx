// Admin console layout: the shared left pane (src/shell/SidePane.tsx, as the app UI; Thomas, 20 Oct) over every portal
// flow, help articles, roles & grants and diagnostics; it collapses to an icon rail (which also serves narrow windows)
// and expands again; the theme switch at its very bottom. Shown only to the portal Admin role (Kissflow builders).
// Top bar: ONLY in the Development sandbox (PortalTopBar: the real role switcher and the person chip).
import { Activity, Inbox, LayoutDashboard, LifeBuoy, MessagesSquare, ShieldCheck, Stamp, Workflow, type LucideIcon } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { SidePane, type PaneItem } from "@/shell/SidePane";
import { envOf } from "@/shell/env";
import { useCollapsed } from "@/shell/useCollapsed";
import { usePortalMode } from "../mode";
import { headerOffsetStyle } from "@/shell/DevTopBar";
import { PortalTopBar } from "../PortalTopBar";
import { FLOW_LABEL, PROCESS_KEYS } from "./common";

const FLOW_ICON: Partial<Record<(typeof PROCESS_KEYS)[number], LucideIcon>> = { request: Inbox, query: MessagesSquare, finalRelease: Stamp };

/** Thomas, 16 Oct: "Roles & grants" opens Kissflow's own portal management page (users, roles, permissions). The
 *  browser's Back returns to the portal. Dev sandbox account (src/shell/env.ts DEV_ACCOUNT) → its page; any other
 *  account → production's page. */
const MANAGE_URL = {
  dev: "https://dev-beiersdorf.kissflow.eu/view/application/CIQ_Supplier_Portal_A00/manage",
  prod: "https://beiersdorf.kissflow.eu/view/portal/administration/CIQ_Supplier_Portal_A00/manage",
};
const ROLES = "/admin/roles";

const NAV: { to: string; label: string; icon: LucideIcon; exact: boolean }[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  // one icon per flow, so the collapsed rail tells them apart without tooltips
  ...PROCESS_KEYS.map((k) => ({ to: `/admin/flow/${k}`, label: FLOW_LABEL[k], icon: FLOW_ICON[k] ?? Workflow, exact: false })),
  { to: "/admin/help", label: "Help articles", icon: LifeBuoy, exact: false },
  { to: ROLES, label: "Roles & grants", icon: ShieldCheck, exact: false },
  { to: "/admin/diagnostics", label: "Diagnostics", icon: Activity, exact: false },
];

/** Test hook of a menu entry, as the app UI: "/admin/flow/request" → "nav-admin-flow-request". */
const navTestId = (to: string) => `nav-${to.replace(/^\//, "").replace(/\//g, "-")}`;

/** One choice for the whole portal (the supplier shell uses the same key). */
const COLLAPSED_KEY = "ciq-portal:nav-collapsed";

export function AdminShell() {
  const { kf, env } = usePortalMode();
  const loc = useLocation();
  const [collapsed, toggleCollapsed] = useCollapsed(COLLAPSED_KEY);
  const isActive = (to: string, exact: boolean) => (exact ? loc.pathname === to : loc.pathname.startsWith(to));
  const manageUrl = envOf(kf?.account?._id) === "dev" ? MANAGE_URL.dev : MANAGE_URL.prod;
  /** Kissflow's page itself goes there (the SDK), so Back comes back here; outside Kissflow, the window does. */
  const openManage = () => {
    if (typeof kf?.client?.redirect === "function") void kf.client.redirect(manageUrl);
    else window.top!.location.href = manageUrl;
  };
  const items: PaneItem[] = NAV.map((n) => {
    const icon = <n.icon size={17} strokeWidth={1.9} />;
    // a button, not a page of this UI: Kissflow's own manage page
    if (n.to === ROLES) return { onClick: openManage, label: n.label, icon, testId: navTestId(n.to) };
    return { to: n.to, label: n.label, icon, active: isActive(n.to, n.exact), testId: navTestId(n.to) };
  });
  return (
    <div className="flex min-h-full" data-env={env} style={headerOffsetStyle(env === "dev" && !!kf)}>
      {/* Thomas, 16 Oct: the theme switch here, and no Reload: each page reads its own data */}
      <SidePane title="Supplier portal admin" navLabel="Admin" items={items} collapsed={collapsed} onToggle={toggleCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PortalTopBar />
        <main className="flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
