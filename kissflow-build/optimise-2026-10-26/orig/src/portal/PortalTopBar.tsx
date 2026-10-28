// The portal's Development-sandbox top bar (Thomas, 20 Oct), shared by the supplier shell and the admin console: the
// shared DevTopBar (src/shell/DevTopBar.tsx) with the role switcher over the two portal roles and a small person chip.
// Only when Kissflow answered from the Development account (mode.tsx env); production and the offline demo render
// nothing. A held role switches the screens (mode.tsx setRole); any other is a real Kissflow role switch (devRoles).
import { useMemo } from "react";
import { Avatar } from "@/components/ui";
import { DevTopBar, RoleSwitcher, type SwitchOption } from "@/shell/DevTopBar";
import { ROLES, type HeldRole, type PortalRole } from "./kf/portal";
import { usePortalMode } from "./mode";

export const ROLE_LABEL: Record<PortalRole, string> = { supplier: "Supplier", admin: "Portal admin", none: "No portal role" };

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function PortalTopBar() {
  const { env, kf } = usePortalMode();
  if (env !== "dev" || !kf) return null;
  return (
    <DevTopBar>
      <PortalRoleSwitcher />
      <PersonChip />
    </DevTopBar>
  );
}

/** The two portal roles; the user's held ones switch the screens, the other one their Kissflow role. */
function PortalRoleSwitcher() {
  const { role, held, roles, setRole, devRoles } = usePortalMode();
  const options = useMemo<SwitchOption<HeldRole>[]>(() => (["supplier", "admin"] as const).map((k) => ({ key: k, label: ROLE_LABEL[k], role: { id: ROLES[k].id, name: ROLES[k].name } })), []);
  if (role === "none") return null;
  return (
    <RoleSwitcher
      options={options}
      current={role}
      currentLabel={ROLE_LABEL[role]}
      held={held}
      heldRoleNames={roles.map((r) => r.name || r.id)}
      devRoles={devRoles}
      onHeld={setRole}
    />
  );
}

/** Who Kissflow says is signed in, and the role the portal acts in. */
function PersonChip() {
  const { kf, role } = usePortalMode();
  const name = kf?.user?.Name || kf?.user?.Email || "Signed-in user";
  const email = kf?.user?.Email;
  return (
    <div data-testid="person-chip" data-persona={role} title={email || undefined} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 shadow-card">
      <Avatar initials={initialsOf(name)} side={role === "supplier" ? "supplier" : "internal"} size={26} />
      <span className="min-w-0 max-md:sr-only">
        <span className="block max-w-[180px] truncate text-[13px] leading-tight font-medium text-ink">{name}</span>
        <span className="block max-w-[180px] truncate text-[11.5px] leading-tight text-ink-3">{ROLE_LABEL[role]}</span>
      </span>
    </div>
  );
}
