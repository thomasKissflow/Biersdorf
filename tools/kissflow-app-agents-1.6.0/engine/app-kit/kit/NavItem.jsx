import { NavLink } from "react-router-dom";

// Sidebar nav item — pill-shaped: fully rounded (not rounded-md), the icon dims to 42%
// opacity at rest and snaps to full on the active/hover states, and the active fill is
// bg-accent/text-accent-foreground (the theme-reactive token — never bg-sidebar-accent,
// a legacy scaffold-only bridge that stays fixed regardless of the picked theme).
//
// CANONICAL COPY, generalized from DamWatch's shell 2026-08-13 after a sweep found three
// different sidebar-selection patterns across four built apps (a rounded-md shape, a
// bg-sidebar-accent fill, a solid bg-primary fill) — each app had hand-authored its own
// nav item from prose instructions instead of sharing one. Import this instead of writing
// a new one per app: `import { NavItem } from "@/components/kit/NavItem"`. Only the props
// below are read, so an app's own richer nav-config objects (badges, counts, etc.) pass
// through untouched — this component doesn't assume a particular nav-item shape upstream,
// only that the caller resolves `to`/`icon`/`label` from whatever config it already has.
export function NavItem({ to, end, icon: Icon, label, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        "group flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors " +
        (isActive
          ? "bg-accent text-accent-foreground"
          : "text-sidebar-muted hover:bg-foreground/5 hover:text-sidebar-foreground")
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={"size-4 shrink-0 " + (isActive ? "opacity-100" : "opacity-[.42] group-hover:opacity-100")} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}
