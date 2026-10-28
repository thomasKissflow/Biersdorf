// Sidebar wordmark block — the badge + app name pinned to the top of the sidebar rail.
//
// CANONICAL COPY, generalized from DamWatch's shell 2026-08-13. Badge is a size-9
// rounded-lg bg-primary square holding either an icon or a short text mark (SV Portal's
// "SV") — `text-sm font-bold` is included unconditionally so both cases render correctly
// from one component (an icon ignores text sizing; a text mark needs it — DamWatch and SV
// Portal had actually drifted on this exact class before this component existed). NO
// tagline or role-name eyebrow underneath: a wordmark identifies, it does not pitch, and
// the active role is already answered by the header's role switcher — repeating it here
// is the same information twice (DamWatch's own reasoning, kept here so it isn't
// re-litigated per app).
//
// `import { SidebarWordmark } from "@/components/kit/SidebarWordmark"` — pass either
// `icon` (a lucide component) or `mark` (a short text string), plus `name`.
export function SidebarWordmark({ icon: Icon, mark, name }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-gray-2 px-5 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-contact">
        {Icon ? <Icon className="size-4" /> : mark}
      </span>
      <div className="min-w-0">
        <div className="break-words font-display text-sm font-semibold leading-snug text-sidebar-foreground">
          {name}
        </div>
      </div>
    </div>
  );
}
