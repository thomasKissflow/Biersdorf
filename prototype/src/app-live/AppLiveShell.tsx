// Shell of the live internal app: the prototype's InternalShell look (layout/Shells.tsx) without its demo parts
// (no inbox: D-4 mails are webhook-only; no demo menu; DESIGN G-2).
// Left pane (Thomas, 20 Oct): no logo; it collapses to an icon rail and expands again (remembered per browser); at its
// very bottom the "Updated …" note (or "Loading…" / "Saving…"), Reload and the night-mode toggle. A holder of the
// Admin / Developer role also gets "Data console" (console/, 26 Oct) after the persona's menu.
// Phones (< 768 px, Thomas 30 Oct; src/shell/ResponsiveShell.tsx): no left pane; the slim header (back arrow on a detail
// page, the page's title: APP_DETAILS), the bottom tab bar over the same menu and More (the rest, the status note with
// Reload, night mode, Full screen); the dev top bar compact inside the header. The banners and the page stay as they are.
// Top bar: ONLY in the Development sandbox (env.ts), with the role switcher (a held role
// switches the screens; any other CIQ role is a real Kissflow role switch, appEnv.tsx) and the person chip (who
// Kissflow says is signed in, and Diagnostics). Production (beiersdorf.kissflow.eu) has no top bar at all: a user
// with several CIQ roles works in the first one (PERSONA_ORDER).
// Above every page: a failed refresh, a page outside CIQ Digital (nothing is saved), the user's unsent items (items that
// reached Kissflow but were not sent on, with the way to Send / Discard in Diagnostics: FE-CLEANUP A1), load warnings,
// the per-case "could not read the questionnaire" banner and the case's configuration pin problem on /cases/:id and
// /review/:caseId (DESIGN §4). (Until 26 Oct also the Business administrator's read-only configuration banner on
// /admin/*: the configuration editor is live now, DESIGN §1.1.)
// Texts (Thomas, 22 Oct: "a tester sees no technical noise"): the Development sandbox keeps Kissflow's raw causes and
// lists what could not be read and the mapper's notes; production says the same in one plain line, with Reload and
// Details (Diagnostics), and never names a cause, a flow or an item id (userText.ts).
import { AlertTriangle, BarChart3, Building2, ChevronDown, Circle, ClipboardCheck, Database, FolderKanban, GitBranch, LayoutDashboard, ListChecks, ScrollText, Stethoscope, Users, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { Link, Outlet, matchPath, useLocation, useNavigate } from "react-router-dom";
import { Avatar, cx } from "@/components/ui";
import { PERSONA_BY_ID } from "@/domain/catalog";
import type { InternalPersonaId, NavItem } from "@/domain/types";
import { NoAccess, routeAllowed } from "@/layout/Gates";
import { DevTopBar, RoleSwitcher as SharedRoleSwitcher, useDismiss, type SwitchOption } from "@/shell/DevTopBar";
import { phoneHeadOf } from "@/shell/PhoneChrome";
import { ResponsiveShell } from "@/shell/ResponsiveShell";
import type { SidePane as SharedSidePane } from "@/shell/SidePane";
import { useCollapsed } from "@/shell/useCollapsed";
import { useIsPhone, useLayoutMode } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";
import { useAppEnv } from "./appEnv";
import { DATA_PATH } from "./console/common";
import { FullscreenButton } from "./FullscreenButton";
import { useAppExtras } from "./extras";
import { PERSONA_ORDER, roleKeyOf } from "./identity";
import { ROLES } from "./ids";
import { PageBoundary } from "./PageBoundary";
import { DIAGNOSTICS_PATH } from "./routes";
import { CASE_NOT_LISTED, CASE_UNREADABLE, REFRESH_FAILED, SOME_KEPT, SOME_NOT_LOADED, trimEnd } from "./userText";

/** The icons persona.nav names (domain/catalog.ts), resolved statically so the bundle carries only these. */
const NAV_ICONS: Record<string, LucideIcon> = { BarChart3, Building2, ClipboardCheck, FolderKanban, GitBranch, LayoutDashboard, ListChecks, ScrollText, Users };

function NavIcon({ name, size = 17 }: { name: string; size?: number }) {
  const I = NAV_ICONS[name] ?? Circle;
  return <I size={size} strokeWidth={1.9} />;
}

/** Test hook of a menu entry, as layout/Shells.tsx: "/admin/rules" → "nav-admin-rules". */
const navTestId = (to: string) => `nav-${to.replace(/^\//, "").replace(/\//g, "-")}`;

/** Longest matching nav entry wins, so a detail page keeps its section lit while /cases/new lights only "New case". */
function useActiveNav(items: NavItem[]) {
  const { pathname } = useLocation();
  const hits = items.filter((n) => pathname === n.to || pathname.startsWith(n.to + "/"));
  return hits.sort((a, b) => b.to.length - a.to.length)[0]?.to;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The case a page is about (/cases/:id, /review/:caseId), for its banner. */
function caseIdOf(pathname: string): string | undefined {
  const id = matchPath("/cases/:id", pathname)?.params.id ?? matchPath("/review/:caseId", pathname)?.params.caseId;
  return id && id !== "new" ? id : undefined;
}

const COLLAPSED_KEY = "ciq-applive:nav-collapsed";

/** The phone header's title of a page that is no menu entry (the first pattern that matches; phoneHeadOf). */
export const APP_DETAILS: [pattern: string, title: string][] = [
  ["/cases/new", "New case"],
  ["/cases/:id", "Case"],
  ["/review/:caseId", "Review"],
  ["/suppliers/:id", "Supplier"],
  [DIAGNOSTICS_PATH, "Diagnostics"],
  ["/admin/notifications", "Reminders"],
];

/** A phone's tab bar labels for the entries whose own label does not fit a fifth of 360 px (PaneItem.shortLabel). */
const PHONE_TAB_LABEL: Record<string, string> = {
  "/admin/templates": "Questions",
  "/admin/ownership": "Owners",
  [DATA_PATH]: "Data",
};

export function AppLiveShell() {
  const { persona } = useStore();
  const x = useAppExtras();
  const { env } = useAppEnv();
  const loc = useLocation();
  const active = useActiveNav(persona.nav);
  const [collapsed, toggleCollapsed] = useCollapsed(COLLAPSED_KEY);
  useEffect(() => {
    document.title = "CIQ Digital · Beiersdorf";
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const allowed = loc.pathname === DIAGNOSTICS_PATH || routeAllowed(persona, loc.pathname);
  const caseId = caseIdOf(loc.pathname);
  // DESIGN §4: the "why" of a case whose questionnaire this role could not read
  const unreadable = caseId ? x?.caseBanner(caseId) : undefined;
  // m15: the case is pinned to a configuration no release provides, or its fingerprint does not match
  const pin = caseId ? x?.casePin?.(caseId) : undefined;
  const prod = env === "prod";
  const pane = usePane(collapsed, toggleCollapsed, active);

  return (
    <ResponsiveShell
      env={env}
      hasTopBar={env === "dev"}
      pane={pane}
      topBar={
        env === "dev" ? (
          <DevTopBar>
            <RoleSwitcher />
            <PersonChip />
          </DevTopBar>
        ) : null
      }
      mainClassName="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8 lg:py-8"
      // a page outside the role's menu (NoAccess) says so, and goes back to the role's landing page
      phone={allowed ? phoneHeadOf(loc.pathname, pane.items, APP_DETAILS, "CIQ Digital", persona.landing) : { title: "Not available", back: loc.pathname === persona.landing ? undefined : persona.landing }}
    >
      {x?.loadError && (
        <Banner tone="bad" testId="load-error-banner">
          <span className="min-w-0 flex-1">
            {/* C2: production names no cause; dev keeps Kissflow's, without its own full stop (A2) */}
            {prod
              ? x.loadedAt
                ? REFRESH_FAILED(x.loadedAt)
                : "Couldn't refresh from Kissflow."
              : `Couldn't refresh from Kissflow: ${trimEnd(x.loadError)}. ${x.loadedAt ? `You are seeing the data from ${fmtTime(x.loadedAt)}.` : ""}`}
          </span>
          <button type="button" className="font-semibold text-brand hover:underline" onClick={() => void x.reload()}>
            Try again
          </button>
        </Banner>
      )}
      {x && !x.containerOk && (
        <Banner tone="bad" testId="container-banner">
          <span className="min-w-0 flex-1">This page is not running in the CIQ Digital app. You can look around, but nothing you do here is saved.</span>
        </Banner>
      )}
      {x && x.drafts.length > 0 && loc.pathname !== DIAGNOSTICS_PATH && <UnsentBanner drafts={x.drafts} />}
      {x && (prod ? x.warnings.length > 0 && <LoadNotice x={x} /> : (x.warnings.length > 0 || (x.notes?.length ?? 0) > 0) && <LoadDetails warnings={x.warnings} notes={x.notes ?? []} />)}
      {allowed && unreadable && (
        <Banner tone="warn" testId="case-banner">
          {/* C8: Kissflow's reason is dev's */}
          <span className="min-w-0 flex-1">{prod ? CASE_UNREADABLE : `Kissflow did not let your role read this case's questionnaire (${unreadable}). You see its header, reviews and open points.`}</span>
        </Banner>
      )}
      {allowed && pin && (
        <Banner tone="warn" testId="case-pin-banner">
          <span className="min-w-0 flex-1">{pin}</span>
        </Banner>
      )}
      {allowed ? (
        <PageBoundary key={loc.pathname} env={env}>
          <Outlet />
        </PageBoundary>
      ) : (
        <NoAccess />
      )}
    </ResponsiveShell>
  );
}

/** A1: the items that reached Kissflow but were not sent on (a failed read-back, Start gate or submit), in both
 *  environments; Diagnostics' Unsent items sends or discards them. */
function UnsentBanner({ drafts }: { drafts: { label: string }[] }) {
  const one = drafts.length === 1;
  // a phone: no item list (Diagnostics lists them), so the banner stays two short lines on every page; a 44 px link
  const phone = useIsPhone();
  return (
    <Banner tone="warn" testId="unsent-banner">
      <span className="min-w-0 flex-1">
        You have {drafts.length} unsent item{one ? "" : "s"}{phone ? "" : `: ${drafts.map((d) => d.label).join("; ")}`}. {one ? "It" : "They"} reached Kissflow but {one ? "was" : "were"} not sent on.
      </span>
      <Link to={{ pathname: DIAGNOSTICS_PATH, hash: "drafts" }} className={cx("font-semibold text-brand hover:underline", phone && "inline-flex min-h-11 items-center")} data-testid="unsent-open">
        Send or discard
      </Link>
    </Banner>
  );
}

/** C1, production: one plain line for whatever could not be read, the cases left out, Reload and Details. */
function LoadNotice({ x }: { x: { keptAt?: string; dropped?: string[]; reload(): Promise<boolean> } }) {
  // a phone: Reload and Details on a row of their own, 44 px targets
  const phone = useIsPhone();
  const link = phone ? "inline-flex min-h-11 items-center font-medium text-brand hover:underline" : "font-medium text-brand hover:underline";
  return (
    <div className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-2" data-testid="load-warnings">
      <p>
        {x.keptAt ? SOME_KEPT(x.keptAt) : SOME_NOT_LOADED}
        {phone ? <br /> : " "}
        <button type="button" className={link} onClick={() => void x.reload()} data-testid="load-warnings-reload">
          Reload
        </button>
        {phone ? <span className="inline-block w-5" aria-hidden /> : " · "}
        <Link to={DIAGNOSTICS_PATH} className={link} data-testid={phone ? "load-warnings-details" : undefined}>
          Details
        </Link>
      </p>
      {(x.dropped ?? []).map((code) => (
        <p key={code} className="mt-1">
          {CASE_NOT_LISTED(code)}
        </p>
      ))}
    </div>
  );
}

/** C1, dev: what could not be read and the mapper's notes, each listed and labelled, with Details (C9). */
function LoadDetails({ warnings, notes }: { warnings: string[]; notes: string[] }) {
  const phone = useIsPhone();
  return (
    <details className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-2" data-testid="load-warnings">
      <summary className="cursor-pointer">
        {warnings.length ? `${warnings.length} thing${warnings.length === 1 ? "" : "s"} could not be read in full; what you see may be incomplete.` : `${notes.length} note${notes.length === 1 ? "" : "s"} on how the data was read.`}
        {phone ? <br /> : " "}
        <Link to={DIAGNOSTICS_PATH} className={phone ? "inline-flex min-h-11 items-center font-medium text-brand hover:underline" : "font-medium text-brand hover:underline"} data-testid={phone ? "load-warnings-details" : undefined}>
          Details
        </Link>
      </summary>
      <TextList label="Could not be read" items={warnings} testId="load-warnings-list" />
      <TextList label="Notes" items={notes} testId="load-notes-list" />
    </details>
  );
}

function TextList({ label, items, testId }: { label: string; items: string[]; testId: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className="font-medium text-ink-2">{label}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-ink-3" data-testid={testId}>
        {items.map((w, i) => (
          <li key={`${i}-${w}`}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

const BANNER_TONE = {
  bad: "border-bad/30 bg-bad-soft",
  warn: "border-warn/30 bg-warn-soft",
  info: "border-info/30 bg-info-soft",
} as const;

function Banner({ tone, testId, icon, children }: { tone: keyof typeof BANNER_TONE; testId: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} data-testid={testId} className={cx("mb-5 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-[13px] text-ink", BANNER_TONE[tone])}>
      {icon ?? <AlertTriangle size={16} className={cx("shrink-0", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-info")} />}
      {children}
    </div>
  );
}

/** The left pane's props (src/shell/SidePane.tsx): the persona's menu; status, Reload and night mode at its very
 *  bottom. On a phone the same items, status and Full screen fill the tab bar and its More sheet. */
function usePane(collapsed: boolean, onToggle: () => void, active?: string): ComponentProps<typeof SharedSidePane> {
  const { persona } = useStore();
  const x = useAppExtras();
  const phone = useIsPhone();
  const status = x ? { text: x.saving ? "Saving…" : (x.loading ?? x.busy) ? "Loading…" : x.loadedAt ? `Updated ${fmtTime(x.loadedAt)}` : "", busy: x.busy, reload: () => void x.reload() } : undefined;
  return {
    title: "CIQ Digital",
    subtitle: "Cosmetic Ingredient Questionnaire",
    section: persona.label,
    collapsed,
    onToggle,
    status,
    actions: <FullscreenButton row={phone} />,
    items: [
      ...persona.nav.map((n) => ({ to: n.to, label: n.label, shortLabel: PHONE_TAB_LABEL[n.to], icon: <NavIcon name={n.icon} />, active: active === n.to, testId: navTestId(n.to) })),
      ...(x?.identity.developer ? [{ to: DATA_PATH, label: "Data console", shortLabel: PHONE_TAB_LABEL[DATA_PATH], icon: <Database size={17} strokeWidth={1.9} />, testId: navTestId(DATA_PATH) }] : []),
    ],
  };
}

/** Dev role switcher (src/shell/DevTopBar.tsx) over the 11 CIQ roles: a held role switches the screens (the store's
 *  setPersona); any other is a real Kissflow role switch (appEnv.tsx devRoles). */
function RoleSwitcher() {
  const { state, persona, dismissToast, setPersona } = useStore();
  const x = useAppExtras();
  const { devRoles } = useAppEnv();
  const nav = useNavigate();
  const options = useMemo<SwitchOption<InternalPersonaId>[]>(
    () => PERSONA_ORDER.map((id) => ({ key: id, label: PERSONA_BY_ID[id].label, role: { id: ROLES[id].id, name: ROLES[id].name }, matches: (r) => roleKeyOf(r) === id })),
    [],
  );
  const clearToasts = () => {
    for (const t of state.toasts) dismissToast(t.id);
  };
  return (
    <SharedRoleSwitcher
      options={options}
      current={persona.id as InternalPersonaId}
      currentLabel={persona.label}
      held={x?.identity.personas ?? []}
      heldRoleNames={(x?.identity.roles ?? []).map((r) => r.name || r.id)}
      devRoles={devRoles && { list: devRoles.list, switchTo: async (r) => (clearToasts(), devRoles.switchTo(r)) }}
      onHeld={(id) => {
        clearToasts();
        setPersona(id);
        nav(PERSONA_BY_ID[id].landing);
      }}
      onSwitched={(id) => nav(PERSONA_BY_ID[id].landing)}
    />
  );
}

/** The signed-in person (from Kissflow, not a demo pick) and the role they act in, with Diagnostics one click away.
 *  Dev top bar only; roles are switched in RoleSwitcher. */
function PersonChip() {
  const { persona, me } = useStore();
  const x = useAppExtras();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const email = x?.identity.email || me.email;
  const mode = useLayoutMode();
  const phone = mode === "phone";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="person-chip"
        data-persona={persona.id}
        className={cx("flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-left shadow-card transition-colors hover:bg-surface-2", phone && "min-h-11 shrink-0")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${me.name}, ${persona.label}. Open the person menu`}
      >
        <Avatar initials={me.initials} size={26} />
        {/* a tablet (768–1023 px): the avatar only, so the dev top bar fits beside an expanded menu */}
        <span className={mode === "tablet" ? "hidden" : "hidden min-w-0 md:block"}>
          <span className="block max-w-[180px] truncate text-[13px] leading-tight font-medium text-ink">{me.name}</span>
          <span className="block max-w-[180px] truncate text-[11.5px] leading-tight text-ink-3">{persona.label}</span>
        </span>
        <ChevronDown size={14} className={cx("text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" aria-label="Person menu" data-testid="person-menu" className="absolute right-0 z-50 mt-2 flex w-[min(320px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
            <Avatar initials={me.initials} size={36} />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-ink">{me.name}</p>
              {email && <p className="truncate text-[12px] text-ink-3">{email}</p>}
              <p className="truncate text-[12px] text-ink-2">{persona.label}</p>
            </div>
          </div>
          <div className="shrink-0 bg-surface-2 px-2 py-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                nav(DIAGNOSTICS_PATH);
              }}
              data-testid="person-menu-diagnostics"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <Stethoscope size={14} aria-hidden /> Diagnostics
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
