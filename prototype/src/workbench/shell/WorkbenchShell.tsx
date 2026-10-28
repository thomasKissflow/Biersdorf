// The Workbench shell (§5.5), embedded in Kissflow: the host already shows the Beiersdorf header, so there is no header
// of our own and the left nav starts at the very top. The nav holds the persona groups, then (bottom left) the theme
// toggle with the saving state and the builder footer (Diagnostics, build stamp). The builder-only "View as" lens is a
// small dock fixed at the top right (kf/viewAs.tsx). Below lg a slim bar keeps only the menu button for the drawer.
import { Activity, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { cx } from "@/components/ui/primitives";
import { BUILD } from "../build";
import { useWorkbenchContext } from "../data/hooks";
import { ViewAsDock } from "../kf/viewAs";
import { APP_ID } from "../schema";
import { ThemeToggle } from "../theme";
import { Toaster } from "../ui/Toaster";
import { FOOTER_ITEMS, activeNavPath, buildNav } from "./nav";
import { navRegistry } from "./routes";

const itemCls = (isActive: boolean) =>
  cx("block rounded-md px-3 py-1.5 text-[13.5px] transition-colors", isActive ? "bg-brand-soft font-semibold text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink");
const linkCls = ({ isActive }: { isActive: boolean }) => itemCls(isActive);

/** F-02 / UX-02: Diagnostics and the build stamp are for Workbench builders only (the View-as signal). */
export function BuilderFooter({ isBuilder, onNavigate }: { isBuilder: boolean; onNavigate?(): void }) {
  if (!isBuilder) return null;
  return (
    <div className="mt-2 border-t border-line pt-2">
      {FOOTER_ITEMS.map((i) => (
        <NavLink key={i.id} to={i.path} className={linkCls} data-testid={`wb-nav-${i.id}`} onClick={onNavigate}>
          <span className="inline-flex items-center gap-2">
            <Activity size={14} aria-hidden />
            {i.label}
          </span>
        </NavLink>
      ))}
      <p className="px-3 pt-2 font-mono text-[11px] text-ink-3" data-testid="wb-build">
        build {BUILD}
      </p>
    </div>
  );
}

export function WorkbenchShell() {
  const { kf, caps, heldRoles, isBuilder, lens, setLens, busy, containerOk, warnings } = useWorkbenchContext();
  const groups = buildNav(caps, navRegistry());
  const active = activeNavPath(
    groups.flatMap((g) => g.items.map((i) => i.path)),
    useLocation().pathname,
  );
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="flex min-h-full flex-col bg-bg">
      {/* Below lg only (no Kissflow desktop space is used): the menu button that opens the nav drawer. */}
      <div data-app-header className="sticky top-0 z-30 flex h-11 items-center border-b border-line bg-surface px-2 lg:hidden">
        <button className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2" aria-label="Menu" aria-expanded={open} aria-controls="wb-nav" onClick={() => setOpen((o) => !o)}>
          <Menu size={18} />
        </button>
      </div>
      {isBuilder && <ViewAsDock held={heldRoles.held} lens={lens} onChange={setLens} />}
      <div className="flex min-h-0 flex-1">
        {/* UX-09: below lg the nav is a drawer over a dimmed page: a click on the page or Escape closes it. From lg it
            is a full-height column that stays in view while a long case page scrolls. The lg classes come last so a
            drawer left open never leaks into the desktop. */}
        {open && <div aria-hidden className="fixed inset-x-0 top-11 bottom-0 z-30 bg-[oklch(0.2_0.03_262/0.35)] lg:hidden" data-testid="wb-nav-backdrop" onClick={() => setOpen(false)} />}
        <nav
          id="wb-nav"
          aria-label="Workbench"
          className={cx(
            "w-60 shrink-0 flex-col border-r border-line bg-surface px-2 py-3",
            open ? "fixed top-11 bottom-0 left-0 z-40 flex overflow-y-auto shadow-xl" : "hidden",
            "lg:sticky lg:top-0 lg:bottom-auto lg:z-auto lg:flex lg:h-screen lg:overflow-y-auto lg:shadow-none",
          )}
          data-testid="wb-nav"
        >
          <div className="flex-1">
            {groups.map((g) => (
              <div key={g.id} className="mb-4" data-testid={`wb-nav-group-${g.id}`}>
                <p className="px-3 pb-1 text-[11.5px] font-semibold tracking-wide text-ink-3 uppercase">{g.label}</p>
                {g.items.map((i) => (
                  <Link key={i.id} to={i.path} className={itemCls(active === i.path)} aria-current={active === i.path ? "page" : undefined} data-testid={`wb-nav-${i.id}`} onClick={() => setOpen(false)}>
                    {i.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-line px-1 pt-2" data-testid="wb-theme-row">
            <ThemeToggle />
            <span className="min-w-0 truncate text-[12px] text-ink-3" data-testid="wb-busy" aria-live="polite">
              {busy.saving ? "Saving…" : busy.updatedAt ? `Updated ${busy.updatedAt}` : ""}
            </span>
          </div>
          <BuilderFooter isBuilder={isBuilder} onNavigate={() => setOpen(false)} />
        </nav>
        <main className="min-w-0 flex-1">
          {!containerOk && (
            <div role="alert" data-testid="wb-container-banner" className="border-b border-bad/40 bg-bad-soft px-4 py-2 text-[13px] text-ink">
              This Workbench runs in <strong>{kf.app._id ?? "an unknown container"}</strong>, not {APP_ID}. Screens are read-only and every save is refused.
            </div>
          )}
          {warnings.length > 0 && (
            <ul className="space-y-1 border-b border-line bg-warn-soft px-4 py-2 text-[12.5px] text-ink-2" data-testid="wb-warnings">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
