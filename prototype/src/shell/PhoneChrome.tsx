// The phone layout's chrome (Thomas, 30 Oct), shared by the app and portal shells through ResponsiveShell.tsx: below
// 768 px (useLayoutMode.ts) there is no left pane; instead
//  - a slim header at the top: a back arrow on a detail page, the page's title, and "Saving…" / "Loading…" while a
//    write or read runs (the status note itself, for screen readers and the harness); in the Development sandbox the
//    compact dev top bar sits above it, in the same sticky block;
//  - a bottom tab bar with the menu's first entries and "More" in its last slot (TAB_SLOTS); More opens a bottom
//    sheet with the other entries, the status note with Reload, the theme switch and the shell's extra actions (the
//    app's Full screen, as a MoreRow): what the side pane's footer holds on a big screen.
// Both keep clear of the notch and the home bar (env(safe-area-inset-*)); every target is at least 44 px. The shell
// root publishes --app-header-h and --app-tabbar-h (phoneOffsetStyle) for sticky panels and StickyActionBar.
// Test ids: phone-header, phone-back, phone-title, load-status; tab-bar, main-nav (its nav), each entry's own test id
// (the side pane's: nav-…), tab-more (data-active), more-sheet, more-nav, more-status, reload, more-theme, more-actions.
import { ArrowLeft, Ellipsis, Moon, RefreshCw, Sun } from "lucide-react";
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, matchPath, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { Sheet, cx } from "@/components/ui";
import { useThemeToggle } from "@/portal/theme";
import type { PaneItem, PaneStatus } from "./SidePane";

/** Heights (px, without their 1 px borders) of the phone header's rows and of the tab bar. */
export const PHONE_TOPBAR_H = 48;
export const PHONE_HEADER_H = 48;
export const PHONE_TABBAR_H = 56;

/** The tab bar's slots; the last is always More, so up to TAB_SLOTS - 1 entries come first. */
export const TAB_SLOTS = 5;

/** The phone shell root's offsets: --app-header-h (the sticky header block: the dev top bar when there is one, the
 *  title row, the notch) and --app-tabbar-h (the tab bar and the home bar), as headerOffsetStyle on a big screen. */
export const phoneOffsetStyle = (hasTopBar: boolean) =>
  ({
    "--app-header-h": `calc(${(hasTopBar ? PHONE_TOPBAR_H + 1 : 0) + PHONE_HEADER_H + 1}px + env(safe-area-inset-top, 0px))`,
    "--app-tabbar-h": `calc(${PHONE_TABBAR_H + 1}px + env(safe-area-inset-bottom, 0px))`,
  }) as CSSProperties;

/** The menu's entries for the tab bar (the first TAB_SLOTS - 1) and for the More sheet (the rest). */
export function splitTabs<T>(items: T[], slots = TAB_SLOTS): { tabs: T[]; more: T[] } {
  const n = Math.max(0, slots - 1);
  return { tabs: items.slice(0, n), more: items.slice(n) };
}

export interface PhoneHead {
  title: string;
  /** The page to go back to (a detail page); none: no back arrow. */
  back?: string;
}

/**
 * The header of a path: a menu entry's own page shows the entry's label and no back arrow; a page below an entry (a
 * detail page: /cases/ZZT-0003 under /cases) shows the title `details` gives it (else the entry's label) and goes back
 * to the entry; any other page shows its `details` title (else `fallback`) and goes back to `home` (unless it is home).
 */
export function phoneHeadOf(pathname: string, entries: { to?: string; label: string }[], details: [pattern: string, title: string][], fallback: string, home?: string): PhoneHead {
  const links = entries.filter((e): e is { to: string; label: string } => !!e.to);
  const own = links.find((e) => e.to === pathname);
  if (own) return { title: own.label };
  const parent = links.filter((e) => pathname.startsWith(e.to + "/")).sort((a, b) => b.to.length - a.to.length)[0];
  const title = details.find(([p]) => matchPath(p, pathname))?.[1] ?? parent?.label ?? fallback;
  const back = parent?.to ?? (home && home !== pathname ? home : undefined);
  return back ? { title, back } : { title };
}

/** Back on a phone: one step back in the UI's own history when it has one (react-router's history index; inside the
 *  Kissflow frame, never past the UI's first page), else to `fallback`. */
export function goBack(nav: NavigateFunction, fallback: string, state: unknown = typeof window === "undefined" ? null : window.history.state) {
  const idx = (state as { idx?: unknown } | null)?.idx;
  if (typeof idx === "number" && idx > 0) nav(-1);
  else nav(fallback);
}

export interface PhoneHeaderOverride {
  /** Replaces the shell's title (e.g. the case code on a case page). */
  title?: string;
  /** Replaces the back target; false: no back arrow. */
  back?: string | false;
}

/** The shell's setter for a page's own header (ResponsiveShell provides it). */
export const PhoneHeaderContext = createContext<((o: PhoneHeaderOverride | null) => void) | null>(null);

/** A page's own title (and back target) in the phone header while it is shown; one call per page. No effect on a
 *  big screen or outside a live shell. */
export function usePhoneHeader({ title, back }: PhoneHeaderOverride) {
  const set = useContext(PhoneHeaderContext);
  useEffect(() => {
    if (!set) return;
    set({ title, back });
    return () => set(null);
  }, [set, title, back]);
}

/** The sticky block at the top of a phone: the compact dev top bar (`topBar`, dev only), then back, title and status. */
export function PhoneHeader({ title, back, topBar, status }: PhoneHead & { topBar?: ReactNode; status?: PaneStatus }) {
  const nav = useNavigate();
  return (
    <header data-app-header data-testid="phone-header" className="sticky top-0 z-30 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      {topBar}
      <div className="flex h-12 items-center gap-1 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]">
        {back ? (
          <button type="button" onClick={() => goBack(nav, back)} data-testid="phone-back" aria-label="Back" title="Back" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <span className="w-3 shrink-0" aria-hidden />
        )}
        <p data-testid="phone-title" className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
          {title}
        </p>
        {status && (
          <span data-testid="load-status" aria-live="polite" className={status.busy ? "shrink-0 text-[12px] text-ink-3" : "sr-only"}>
            {status.text}
          </span>
        )}
      </div>
    </header>
  );
}

// the focus ring inside the tab, so the screen's edge does not cut it
const tabCls = (active: boolean) => cx("flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[11px] leading-tight transition-colors focus-visible:-outline-offset-2", active ? "font-semibold text-brand" : "text-ink-3 hover:text-ink");

/** An entry's icon in a soft pill (lit when current), with its count. */
function TabIcon({ icon, active, count }: { icon: ReactNode; active: boolean; count?: number }) {
  return (
    <span className={cx("relative flex h-7 w-12 items-center justify-center rounded-full [&_svg]:size-5", active && "bg-brand-soft")}>
      {icon}
      {!!count && (
        <span className="absolute -top-1 right-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 font-semibold text-brand-ink" aria-label={`${count} open`}>
          {count}
        </span>
      )}
    </span>
  );
}

function TabEntry({ item }: { item: PaneItem }) {
  // the short label where the full one would not fit the slot; the full one stays the accessible name
  const short = item.shortLabel && item.shortLabel !== item.label ? item.shortLabel : undefined;
  const inner = (
    <>
      <TabIcon icon={item.icon} active={!!item.active} count={item.count} />
      <span className="max-w-full truncate">{short ?? item.label}</span>
    </>
  );
  return item.to ? (
    <Link to={item.to} data-testid={item.testId} aria-current={item.active ? "page" : undefined} aria-label={short && item.label} title={short && item.label} className={tabCls(!!item.active)}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={item.onClick} data-testid={item.testId} aria-label={short && item.label} title={short && item.label} className={tabCls(false)}>
      {inner}
    </button>
  );
}

/** A phone's on-screen keyboard is open while a text field has the focus: the visual viewport is much shorter than the
 *  layout viewport (pinch zoom left out). The shell then hides the tab bar and lets the sticky action bar scroll away
 *  (styles.css), so neither rides above the keyboard over the field being typed in. Never true without a keyboard. */
export function useKeyboardOpen(active: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !vv) return setOpen(false);
    const check = () => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "TEXTAREA" || el.isContentEditable || (el.tagName === "INPUT" && !/^(checkbox|radio|file|range|button|submit|reset)$/.test((el as HTMLInputElement).type)));
      setOpen(typing && window.innerHeight - vv.height * vv.scale > 120);
    };
    vv.addEventListener("resize", check);
    window.addEventListener("focusin", check);
    window.addEventListener("focusout", check);
    return () => {
      vv.removeEventListener("resize", check);
      window.removeEventListener("focusin", check);
      window.removeEventListener("focusout", check);
    };
  }, [active]);
  return open;
}

/** The bottom tab bar and its More sheet. */
export function PhoneTabBar({ items, status, actions, navLabel = "Main" }: { items: PaneItem[]; status?: PaneStatus; actions?: ReactNode; navLabel?: string }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // a page picked in the sheet (or anywhere) closes it
  useEffect(() => setOpen(false), [pathname]);
  const { tabs, more } = splitTabs(items);
  const moreActive = more.some((n) => n.active);
  return (
    <>
      <div data-testid="tab-bar" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur">
        <nav aria-label={navLabel} data-testid="main-nav">
          <ul className="flex h-14">
            {tabs.map((n) => (
              <li key={n.to ?? n.label} className="min-w-0 flex-1">
                <TabEntry item={n} />
              </li>
            ))}
            <li className="min-w-0 flex-1">
              <button type="button" onClick={() => setOpen(true)} data-testid="tab-more" data-active={moreActive ? "true" : "false"} aria-haspopup="dialog" aria-expanded={open} className={tabCls(moreActive)}>
                <TabIcon icon={<Ellipsis />} active={moreActive} />
                <span>More</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>
      <MoreSheet open={open} onClose={() => setOpen(false)} items={more} status={status} actions={actions} />
    </>
  );
}

const rowCls = "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] transition-colors";

/** A labelled row of the More sheet, for a shell's own action there (the app's Full screen; `actions`). */
export function MoreRow({ icon, label, onClick, title, "data-testid": testId }: { icon: ReactNode; label: string; onClick(): void; title?: string; "data-testid"?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} data-testid={testId} className={cx(rowCls, "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
      <span className="flex shrink-0 items-center justify-center [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
}

/** More: the entries the tab bar has no room for, then what the side pane's footer holds. */
function MoreSheet({ open, onClose, items, status, actions }: { open: boolean; onClose(): void; items: PaneItem[]; status?: PaneStatus; actions?: ReactNode }) {
  const theme = useThemeToggle();
  return (
    <Sheet variant="bottom" open={open} onClose={onClose} title="More" autoFocus data-testid="more-sheet">
      {items.length > 0 && (
        <nav aria-label="More pages" data-testid="more-nav" className="-mx-1 mb-3 border-b border-line pb-3">
          <ul className="space-y-0.5">
            {items.map((n) => {
              const cls = cx(rowCls, n.active ? "bg-brand-soft font-semibold text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink");
              const inner = (
                <>
                  <span className="flex shrink-0 items-center justify-center [&_svg]:size-5">{n.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  {!!n.count && (
                    <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-ink" aria-label={`${n.count} open`}>
                      {n.count}
                    </span>
                  )}
                </>
              );
              return (
                <li key={n.to ?? n.label}>
                  {n.to ? (
                    <Link to={n.to} onClick={onClose} data-testid={n.testId} aria-current={n.active ? "page" : undefined} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        n.onClick?.();
                      }}
                      data-testid={n.testId}
                      className={cls}
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <div className="-mx-1 space-y-0.5">
        {status && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                status.reload();
              }}
              data-testid="reload"
              aria-label="Reload"
              className={cx(rowCls, "min-w-0 flex-1 text-ink-2 hover:bg-surface-2 hover:text-ink")}
            >
              <RefreshCw size={20} className={cx("shrink-0", status.busy && "animate-spin")} aria-hidden />
              <span className="min-w-0 flex-1">Reload</span>
              <span data-testid="more-status" className="shrink-0 text-[12.5px] text-ink-3">
                {status.text}
              </span>
            </button>
          </div>
        )}
        {theme && (
          <button type="button" onClick={theme.toggle} data-testid="more-theme" className={cx(rowCls, "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            {theme.theme === "light" ? <Moon size={20} className="shrink-0" aria-hidden /> : <Sun size={20} className="shrink-0" aria-hidden />}
            <span className="min-w-0 flex-1">{theme.theme === "light" ? "Dark theme" : "Light theme"}</span>
          </button>
        )}
        {actions && (
          <div data-testid="more-actions" className="empty:hidden">
            {actions}
          </div>
        )}
      </div>
    </Sheet>
  );
}
