import { Avatar } from "@/components/kit/Avatar";

// Header identity block — avatar + name/role text, pinned to the end of the header behind
// a border-l divider. Name/role text hides below `sm` (avatar-only on a narrow header).
//
// CANONICAL COPY, generalized from DamWatch's shell 2026-08-13. The avatar's
// `!bg-primary !text-primary-foreground` pair (Tailwind's `!`-important modifier, not
// plain `bg-primary`/`text-primary-foreground`) is load-bearing, not a style choice to
// simplify away: a plain, non-`!`-modifier pair compiles to a *different*, lower-priority
// selector that theme-variants.css's IMPORTANT_OVERRIDES specifically targets — this was
// the "header avatar not reacting to the theme switcher" bug this session, now fixed
// structurally by baking the working classes into the one component every app imports,
// instead of asking each app to independently discover and reapply the fix.
//
// `import { HeaderIdentity } from "@/components/kit/HeaderIdentity"` — `name` is the
// signed-in user's display name, `subtitle` their role/team label.
export function HeaderIdentity({ name, subtitle }) {
  return (
    <div className="flex items-center gap-2.5 border-l border-border pl-3">
      <Avatar name={name} size="sm" className="!bg-primary !text-primary-foreground" />
      <div className="hidden text-left leading-tight sm:block">
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}
