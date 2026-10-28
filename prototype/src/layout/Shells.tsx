import * as Icons from "lucide-react";
import { Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import logo from "@/assets/beiersdorf-logo.webp";
import { cx, IconButton } from "@/components/ui";
import { tasksForContact } from "@/domain/selectors";
import { useStore } from "@/store/store";
import { NoAccess, routeAllowed } from "./Gates";
import { InboxButton } from "./Inbox";
import { RoleSwitcher } from "./RoleSwitcher";

type NavItem = { to: string; label: string; icon: string };

/** Test hook of a menu entry: "/admin/rules" → "nav-admin-rules" (the row under the header on phones: "nav-m-…"). */
const navTestId = (to: string, mobile?: boolean) => `nav-${mobile ? "m-" : ""}${to.replace(/^\//, "").replace(/\//g, "-")}`;

/** Longest matching nav entry wins, so a detail page (/cases/…, /review/…, /portal/case/…) keeps its section lit
 *  while /cases/new still lights only "New case". */
function useActiveNav(items: NavItem[]) {
  const { pathname } = useLocation();
  const hits = items.filter((n) => pathname === n.to || pathname.startsWith(n.to + "/"));
  return hits.sort((a, b) => b.to.length - a.to.length)[0]?.to;
}

function NavIcon({ name, size = 17 }: { name: string; size?: number }) {
  const I = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle;
  return <I size={size} strokeWidth={1.9} />;
}

export function Logo({ className }: { className?: string }) {
  return <img src={logo} alt="Beiersdorf" className={cx("logo-adaptive h-[22px] w-auto select-none", className)} draggable={false} />;
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return (localStorage.getItem("bdf-theme") as "light" | "dark") ?? "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("bdf-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "light" ? "dark" : "light"))] as const;
}

/** Top bar, right: theme, the simulated inbox and the person chip (with the demo menu). The same in both shells. */
function TopActions() {
  const [theme, toggle] = useTheme();
  return (
    <div className="flex items-center gap-1.5">
      <IconButton label={theme === "light" ? "Dark theme" : "Light theme"} onClick={toggle} data-testid="theme-toggle">
        {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      </IconButton>
      <InboxButton />
      <RoleSwitcher />
    </div>
  );
}

/** The browser tab names the app the persona works in (it shows when the screen is shared). */
function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/** Internal Beiersdorf console: left navigation, dense operational layout. */
export function InternalShell() {
  const { persona } = useStore();
  const loc = useLocation();
  const active = useActiveNav(persona.nav);
  useTitle("CIQ Digital · Beiersdorf");
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pt-5 pb-4">
          <Logo />
          <div className="mt-2 text-[13px] font-semibold text-ink">CIQ Digital</div>
          <p className="mt-0.5 text-[11.5px] text-ink-3">Cosmetic Ingredient Questionnaire</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 scrollbar-thin" aria-label="Main" data-testid="main-nav">
          <div className="px-2 pt-2 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{persona.label}</div>
          {persona.nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              data-testid={navTestId(n.to)}
              aria-current={active === n.to ? "page" : undefined}
              className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors", active === n.to ? "bg-brand-soft font-semibold text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
            >
              <NavIcon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header data-app-header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
            <Logo className="h-[18px] lg:hidden" />
            <div className="ml-auto">
              <TopActions />
            </div>
          </div>
          <MobileNav active={active} />
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8 lg:py-8">{routeAllowed(persona, loc.pathname) ? <Outlet /> : <NoAccess />}</main>
      </div>
    </div>
  );
}

/** Below lg the sidebar is gone: its entries become a full-width scrollable row under the header. */
function MobileNav({ active }: { active?: string }) {
  const { persona } = useStore();
  const ref = useRef<HTMLElement>(null);
  // Keep "you are here" visible: scroll the row (never the page) so the current entry is in view.
  useEffect(() => {
    const nav = ref.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    const n = nav.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left < n.left || r.right > n.right) nav.scrollLeft += r.left - n.left - (n.width - r.width) / 2;
  }, [active, persona.id]);
  return (
    <nav ref={ref} className="-mt-1 flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden scrollbar-thin" aria-label="Main">
      {persona.nav.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          data-testid={navTestId(n.to, true)}
          aria-current={active === n.to ? "page" : undefined}
          className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors", active === n.to ? "bg-brand-soft font-semibold text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
        >
          <NavIcon name={n.icon} size={15} />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** External supplier portal: simpler, guided, top navigation. */
export function SupplierShell() {
  const { persona, me, state } = useStore();
  const loc = useLocation();
  useTitle("CIQ Supplier Portal · Beiersdorf");
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  const active = useActiveNav(persona.nav);
  const supplier = state.suppliers.find((s) => s.id === me.supplierId);
  // Only the requests this contact is named on (spec §4); the count sits on My requests, where the tasks are listed.
  const openTasks = tasksForContact(state, me.id).length;
  return (
    <div className="flex min-h-full flex-col">
      <header data-app-header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-4 px-4 lg:px-6">
          <Logo />
          <span className="hidden h-6 w-px bg-line sm:block" />
          <div className="hidden sm:block">
            <div className="text-[13.5px] leading-tight font-semibold text-ink">Supplier Portal</div>
            <div className="text-[11.5px] leading-tight text-ink-3">Raw material questionnaires</div>
          </div>
          <div className="ml-auto">
            <TopActions />
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1180px] items-center gap-1 px-4 lg:px-6" aria-label="Main" data-testid="main-nav">
          {persona.nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              data-testid={navTestId(n.to)}
              aria-current={active === n.to ? "page" : undefined}
              className={cx("-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] whitespace-nowrap transition-colors", active === n.to ? "border-brand font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink")}
            >
              <span className="flex max-[359px]:hidden">
                <NavIcon name={n.icon} size={16} />
              </span>
              {n.label}
              {n.to === "/portal" && openTasks > 0 && (
                <span data-testid="nav-portal-count" data-count={openTasks} className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-ink tabular-nums" aria-label={`${openTasks} open`}>
                  {openTasks}
                </span>
              )}
            </Link>
          ))}
          {supplier && <span className="ml-auto hidden truncate pl-3 text-[12.5px] text-ink-3 md:block">{supplier.name}</span>}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 lg:px-6 lg:py-8">
        <Outlet />
      </main>
      <footer className="border-t border-line py-4 text-center text-[11.5px] text-ink-3">Beiersdorf Supplier Portal</footer>
    </div>
  );
}

export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[13px] text-ink-3">{children ?? "This screen is being built."}</p>
    </div>
  );
}
