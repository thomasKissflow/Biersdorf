// Data console layout (26 Oct, the Admin / Developer role), as the portal's admin console (src/portal/admin/AdminShell.tsx):
// the shared left pane (src/shell/SidePane.tsx) over the overview, every process and form of CIQ Digital, the
// import and the orphans (rows that name a deleted case); it collapses to an icon rail; the theme switch at its very bottom. "Back to CIQ Digital" only when the user
// also acts in a CIQ persona; leaving the console after a write has the CIQ screens read again (their data is stale).
// Top bar: ONLY in the Development sandbox: the role switcher over the CIQ roles and Admin / Developer (a held CIQ
// role switches the screens; any other role is a real Kissflow role switch, appEnv.tsx) and who is signed in.
// Production has no top bar. A page outside CIQ Digital gets a banner: Kissflow refuses every write there. While the
// console's client waits for a rate-limited call (26 Oct, its longer backoff), a line says so.
import { AlertTriangle, ArrowLeft, Building2, ClipboardCheck, Clock, FolderKanban, Ghost, GitBranch, LayoutDashboard, MessagesSquare, Scale, ScrollText, ShieldCheck, SlidersHorizontal, StickyNote, Upload, type LucideIcon } from "lucide-react";
import { useContext, useEffect, useMemo, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { PERSONA_BY_ID } from "@/domain/catalog";
import type { InternalPersonaId } from "@/domain/types";
import { DevTopBar, RoleSwitcher, headerOffsetStyle, type SwitchOption } from "@/shell/DevTopBar";
import { SidePane, type PaneItem } from "@/shell/SidePane";
import { useCollapsed } from "@/shell/useCollapsed";
import { StoreContext } from "@/store/store";
import { useAppEnv } from "../appEnv";
import { useAppExtras } from "../extras";
import { PERSONA_ORDER, roleKeyOf } from "../identity";
import { APP_ID, OTHER_ROLES, ROLES } from "../ids";
import { PageBoundary } from "../PageBoundary";
import type { FlowKey } from "../types";
import { CONSOLE_FLOWS, DATA_PATH, FLOW_LABEL, IMPORT_PATH, ORPHANS_PATH, flowPath } from "./common";
import { useDataConsole } from "./ConsoleContext";
import { useRateWait } from "./rateSignal";

const FLOW_ICON: Record<FlowKey, LucideIcon> = {
  case: FolderKanban,
  review: ClipboardCheck,
  op: MessagesSquare,
  config: SlidersHorizontal,
  supplier: Building2,
  audit: ScrollText,
  note: StickyNote,
  rmesSAF: ShieldCheck,
  rmesREG: Scale,
  scopeRun: GitBranch,
};

const NAV: { to: string; label: string; icon: LucideIcon; exact: boolean }[] = [
  { to: DATA_PATH, label: "Overview", icon: LayoutDashboard, exact: true },
  // one icon per flow, so the collapsed rail tells them apart without tooltips
  ...CONSOLE_FLOWS.map((f) => ({ to: flowPath(f), label: FLOW_LABEL[f], icon: FLOW_ICON[f], exact: false })),
  { to: IMPORT_PATH, label: "Import a file", icon: Upload, exact: false },
  { to: ORPHANS_PATH, label: "Orphans", icon: Ghost, exact: false },
];

/** Test hook of a menu entry, as the app UI: "/data/flow/case" → "nav-data-flow-case". */
const navTestId = (to: string) => `nav-${to.replace(/^\//, "").replace(/\//g, "-")}`;

const COLLAPSED_KEY = "ciq-applive:data-nav-collapsed";

export function DataShell() {
  const { client, besideCiq, takeChanged } = useDataConsole();
  const { env } = useAppEnv();
  const x = useAppExtras();
  const loc = useLocation();
  const nav = useNavigate();
  const [collapsed, toggleCollapsed] = useCollapsed(COLLAPSED_KEY);
  // the CIQ screens read again once the console is left after a write (the store's reload is stable; kept in a ref so
  // the unmount sees the latest)
  const reload = useRef(x?.reload);
  reload.current = x?.reload;
  useEffect(
    () => () => {
      if (takeChanged()) void reload.current?.();
    },
    [takeChanged],
  );
  useEffect(() => {
    document.title = "Data console · CIQ Digital";
    return () => {
      document.title = "CIQ Digital · Beiersdorf";
    };
  }, []);
  const isActive = (to: string, exact: boolean) => (exact ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + "/"));
  const items: PaneItem[] = NAV.map((n) => ({ to: n.to, label: n.label, icon: <n.icon size={17} strokeWidth={1.9} />, active: isActive(n.to, n.exact), testId: navTestId(n.to) }));
  if (besideCiq) items.push({ onClick: () => nav("/"), label: "Back to CIQ Digital", icon: <ArrowLeft size={17} strokeWidth={1.9} />, testId: "nav-data-back" });
  const dev = env === "dev";
  return (
    <div className="flex min-h-full" data-env={env} data-testid="data-console" style={headerOffsetStyle(dev)}>
      <SidePane title="CIQ Digital data" subtitle="Admin / Developer" navLabel="Data console" items={items} collapsed={collapsed} onToggle={toggleCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        {dev && (
          <DevTopBar>
            <ConsoleRoleSwitcher />
          </DevTopBar>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">
          {client.appId !== APP_ID && (
            <div role="alert" data-testid="data-container-banner" className="mb-5 flex items-center gap-3 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-ink">
              <AlertTriangle size={16} className="shrink-0 text-bad" />
              <span className="min-w-0 flex-1">This page is not running in the CIQ Digital app. You can look at the data, but every change is refused.</span>
            </div>
          )}
          <RateLimitNote />
          <PageBoundary key={loc.pathname} env={env}>
            <Outlet />
          </PageBoundary>
        </main>
      </div>
    </div>
  );
}

/** While the console's client waits before trying a rate-limited call again (rateSignal.ts): how long, in seconds. */
function RateLimitNote() {
  const { rate } = useDataConsole();
  const secs = useRateWait(rate);
  if (!secs) return null;
  return (
    <div role="status" data-testid="data-rate-wait" className="mb-5 flex items-center gap-3 rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-[13px] text-ink">
      <Clock size={15} className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1">Kissflow is limiting requests: the console waits {secs} s, then tries again.</span>
    </div>
  );
}

type SwitchKey = InternalPersonaId | "developer";

/** Dev role switcher over the 11 CIQ roles and Admin / Developer (src/shell/DevTopBar.tsx). A held CIQ role switches the
 *  screens (the store's setPersona: only there when a persona is held); any other role is a real Kissflow role switch. */
function ConsoleRoleSwitcher() {
  const { identity } = useDataConsole();
  const { devRoles } = useAppEnv();
  const store = useContext(StoreContext);
  const nav = useNavigate();
  const options = useMemo<SwitchOption<SwitchKey>[]>(
    () => [
      ...PERSONA_ORDER.map((id) => ({ key: id as SwitchKey, label: PERSONA_BY_ID[id].label, role: { id: ROLES[id].id, name: ROLES[id].name }, matches: (r: { id: string; name: string }) => roleKeyOf(r) === id })),
      { key: "developer", label: OTHER_ROLES.developer.name, role: { id: OTHER_ROLES.developer.id, name: OTHER_ROLES.developer.name }, matches: (r) => roleKeyOf(r) === "developer" },
    ],
    [],
  );
  const landing = (k: SwitchKey) => (k === "developer" ? DATA_PATH : PERSONA_BY_ID[k].landing);
  return (
    <>
      <RoleSwitcher
        options={options}
        current="developer"
        currentLabel={OTHER_ROLES.developer.name}
        held={[...identity.personas, "developer"]}
        heldRoleNames={identity.roles.map((r) => r.name || r.id)}
        devRoles={devRoles}
        onHeld={(k) => {
          if (k === "developer") return;
          store?.setPersona(k);
          nav(landing(k));
        }}
        onSwitched={(k) => nav(landing(k))}
      />
      <span className="hidden max-w-[220px] truncate text-[13px] text-ink-2 md:block" data-testid="data-person" title={identity.email || undefined}>
        {identity.name || identity.email || "Signed-in user"}
      </span>
    </>
  );
}
