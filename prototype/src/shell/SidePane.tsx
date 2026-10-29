// The left pane of the live custom UIs (app and portal; Thomas, 20 Oct): no logo; a title; the menu; collapsible to an
// icon rail (labels as tooltips; the rail scrolls without a visible scrollbar, so a short frame can't push the icons off
// centre) and expandable again; at its very bottom the "Updated …" note (or "Saving…" /
// "Loading…"), Reload and the night-mode toggle. Test ids: side-pane (data-collapsed), nav-toggle, main-nav,
// side-footer, load-status, reload.
import { PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconButton, cx } from "@/components/ui";
import { ThemeToggle } from "@/portal/theme";

export interface PaneItem {
  /** Route (a Link), or an action (a button: e.g. a page outside the UI). */
  to?: string;
  onClick?: () => void;
  label: string;
  /** A phone's tab bar label when `label` does not fit its slot ("Questions" for Questionnaire); the full label stays
   *  its accessible name and the More sheet's. */
  shortLabel?: string;
  icon: ReactNode;
  active?: boolean;
  /** A small count after the label (and a dot on the rail). */
  count?: number;
  testId?: string;
}

export interface PaneStatus {
  /** "Saving…", "Loading…", "Updated 12:40" or "". */
  text: string;
  busy: boolean;
  reload(): void;
}

export function SidePane({
  title,
  subtitle,
  section,
  items,
  collapsed,
  onToggle,
  status,
  navLabel = "Main",
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Small caps label above the menu (e.g. the acting role). */
  section?: string;
  items: PaneItem[];
  collapsed: boolean;
  onToggle(): void;
  /** Without it (e.g. a page with nothing to refresh) the footer holds the theme toggle only. */
  status?: PaneStatus;
  navLabel?: string;
  /** Extra icon buttons in the footer, before the theme toggle (the app's "Full screen", 27 Oct; the portal has none). */
  actions?: ReactNode;
}) {
  return (
    <aside
      data-testid="side-pane"
      data-collapsed={collapsed ? "true" : "false"}
      className={cx("sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200", collapsed ? "w-16" : "w-[244px]")}
    >
      <div className={cx("flex pt-4 pb-3", collapsed ? "justify-center" : "items-start gap-2 pr-3 pl-5")}>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">{title}</div>
            {subtitle && <p className="mt-0.5 text-[11.5px] text-ink-3">{subtitle}</p>}
          </div>
        )}
        <IconButton label={collapsed ? "Expand the menu" : "Collapse the menu"} onClick={onToggle} aria-expanded={!collapsed} data-testid="nav-toggle" className="shrink-0">
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </IconButton>
      </div>
      <nav className={cx("flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto px-3 pb-4", collapsed ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "scrollbar-thin")} aria-label={navLabel} data-testid="main-nav">
        {!collapsed && section && <div className="px-2 pt-2 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{section}</div>}
        {items.map((n) => {
          const cls = cx(
            "relative flex w-full items-center rounded-lg text-[13.5px] transition-colors",
            collapsed ? "h-10 justify-center" : "gap-2.5 px-2.5 py-2 text-left",
            n.active ? "bg-brand-soft font-semibold text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
          );
          const inner = (
            <>
              <span className="flex shrink-0 items-center justify-center">{n.icon}</span>
              {!collapsed && <span className="min-w-0 flex-1 truncate">{n.label}</span>}
              {!!n.count &&
                (collapsed ? (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand" aria-hidden />
                ) : (
                  <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-ink" aria-label={`${n.count} open`}>
                    {n.count}
                  </span>
                ))}
            </>
          );
          const common = { "data-testid": n.testId, "aria-label": collapsed ? (n.count ? `${n.label} (${n.count} open)` : n.label) : undefined, title: collapsed ? n.label : undefined, className: cls };
          return n.to ? (
            <Link key={n.to} to={n.to} aria-current={n.active ? "page" : undefined} {...common}>
              {inner}
            </Link>
          ) : (
            <button key={n.label} type="button" onClick={n.onClick} {...common}>
              {inner}
            </button>
          );
        })}
      </nav>
      <div data-testid="side-footer" className={cx("shrink-0 border-t border-line py-2.5", collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-1 pr-3 pl-4")}>
        {status && (
          <>
            <span className={cx("text-[12px] text-ink-3", collapsed ? "sr-only" : "min-w-0 flex-1 truncate")} aria-live="polite" data-testid="load-status" title={status.text || undefined}>
              {status.text}
            </span>
            <IconButton label="Reload" title={status.text ? `Reload (${status.text})` : "Reload"} onClick={status.reload} data-testid="reload">
              <RefreshCw size={16} className={cx(status.busy && "animate-spin")} />
            </IconButton>
          </>
        )}
        {!status && !collapsed && <span className="min-w-0 flex-1" />}
        {actions}
        <ThemeToggle />
      </div>
    </aside>
  );
}
