// Production shell for the supplier side of the portal: the prototype's approved supplier look, without the
// prototype's role switcher or demo controls. In the Admin's preview it shows a "demo data" bar with a way back.
// Left pane (Thomas, 20 Oct; the shared src/shell/SidePane.tsx, as the app UI): no logo; My requests (with the open
// task count) and Help; it collapses to an icon rail and expands again (remembered per browser); at its very bottom
// the "Updated …" note (or "Saving…"), Reload and the night-mode toggle.
// Top bar: ONLY in the Development sandbox (PortalTopBar: the real role switcher and the person chip). Production
// (beiersdorf.kissflow.eu) and the offline demo have no top bar at all.
// Phones (< 768 px, Thomas 30 Oct; src/shell/ResponsiveShell.tsx): no left pane; the slim header (a request: back to My
// requests), the bottom tab bar with My requests (its count) and Help, and More (the status note with Reload, night
// mode); the dev top bar compact inside the header. The demo bar, the banners, the page and the footer stay.
import { AlertTriangle, ArrowLeft, Inbox, LifeBuoy, Users } from "lucide-react";
import { useEffect } from "react";
import { Link, Outlet, useLocation, matchPath } from "react-router-dom";
import { Badge } from "@/components/ui";
import { fmtDateTime, supplierTasks } from "@/domain/selectors";
import { phoneHeadOf } from "@/shell/PhoneChrome";
import { ResponsiveShell } from "@/shell/ResponsiveShell";
import type { PaneItem, PaneStatus } from "@/shell/SidePane";
import { useCollapsed } from "@/shell/useCollapsed";
import { useStore } from "@/store/store";
import { useLiveExtras } from "../data/LiveSupplierStore";
import { PageBoundary } from "../PageBoundary";
import { usePortalMode } from "../mode";
import { PortalTopBar } from "../PortalTopBar";

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const NAV = [
  { to: "/portal", label: "My requests", icon: Inbox, match: (p: string) => p === "/portal" || p.startsWith("/portal/case"), testId: "nav-portal" },
  { to: "/portal/help", label: "Help", icon: LifeBuoy, match: (p: string) => p.startsWith("/portal/help"), testId: "nav-portal-help" },
];

const COLLAPSED_KEY = "ciq-portal:nav-collapsed";

/** The phone header's title of a page that is no menu entry (phoneHeadOf). */
export const PORTAL_DETAILS: [pattern: string, title: string][] = [["/portal/case/:id", "Request"]];

export function PortalSupplierShell({ demo }: { demo: boolean }) {
  const { state, me } = useStore();
  const extras = useLiveExtras();
  const { role, env, kf, setDemo } = usePortalMode();
  const loc = useLocation();
  const [collapsed, toggleCollapsed] = useCollapsed(COLLAPSED_KEY);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const supplier = state.suppliers.find((s) => s.id === me.supplierId);
  const counts: Record<string, number> = {
    "/portal": supplier ? supplierTasks(state, supplier.id, me.id).length : 0,
  };
  // B-12: a colleague saved this request in the last minutes (Editing_By / Editing_Since on the request).
  const caseId = matchPath("/portal/case/:id", loc.pathname)?.params.id;
  const presence = caseId ? extras?.presence(caseId) : undefined;

  const items: PaneItem[] = NAV.map((n) => ({ to: n.to, label: n.label, icon: <n.icon size={17} strokeWidth={1.9} />, active: n.match(loc.pathname), count: counts[n.to] || undefined, testId: n.testId }));
  // Thomas, 16 Oct: "Saving…" while a write (or the reload after it) runs, else when the data was read
  const status: PaneStatus | undefined = extras ? { text: extras.busy ? "Saving…" : extras.loadedAt ? `Updated ${fmtTime(extras.loadedAt)}` : "", busy: extras.busy, reload: () => void extras.reload() } : undefined;

  return (
    <ResponsiveShell
      env={env}
      hasTopBar={env === "dev" && !!kf}
      pane={{ title: "Supplier portal", subtitle: "Raw material questionnaires", items, collapsed, onToggle: toggleCollapsed, status }}
      topBar={<PortalTopBar />}
      beforeMain={
        demo && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-violet-soft px-4 py-2 text-[12.5px] text-ink" data-testid="demo-bar">
            <Badge tone="violet" className="ring-1 ring-violet/40">
              Demo data
            </Badge>
            <span>Preview of the supplier view with demo data. Nothing here is sent to Kissflow.</span>
            {role === "admin" && (
              <Link to="/admin" onClick={() => setDemo(false)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                <ArrowLeft size={14} /> Back to admin
              </Link>
            )}
          </div>
        )
      }
      afterMain={<footer className="border-t border-line py-4 text-center text-[11.5px] text-ink-3">Beiersdorf Supplier Portal · Raw material questionnaires</footer>}
      mainClassName="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 lg:px-6 lg:py-8"
      phone={phoneHeadOf(loc.pathname, items, PORTAL_DETAILS, "Supplier portal", "/portal")}
    >
      {extras?.loadError && (
        <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-ink">
          <AlertTriangle size={16} className="shrink-0 text-bad" />
          <span className="min-w-0 flex-1">
            Couldn't refresh from Kissflow: {extras.loadError}. {extras.loadedAt ? `You are seeing the data from ${fmtTime(extras.loadedAt)}.` : ""}
          </span>
          <button type="button" className="font-semibold text-brand hover:underline" onClick={() => void extras.reload()}>
            Try again
          </button>
        </div>
      )}
      {extras && extras.warnings.length > 0 && (
        <details className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-2">
          <summary className="cursor-pointer">
            {extras.warnings.length} item{extras.warnings.length === 1 ? "" : "s"} could not be read in full; what you see for {extras.warnings.length === 1 ? "it" : "them"} may be incomplete.
          </summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-3">
            {extras.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {presence && (
        <div role="status" data-testid="presence-hint" className="mb-5 flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">
          <Users size={16} className="mt-0.5 shrink-0 text-ink-3" />
          <span>
            {presence.name} also worked on this questionnaire (last saved {fmtDateTime(presence.since)}). You can work at the same time: each answer is saved on its own, and if you both change the same answer, the later save counts.
          </span>
        </div>
      )}
      <PageBoundary key={loc.pathname}>
        <Outlet />
      </PageBoundary>
    </ResponsiveShell>
  );
}
