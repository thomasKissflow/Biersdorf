// The user holds no CIQ role with a UI: list the role names, read no items (§5.1).
import { Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/data";
import type { Kf } from "../kf/sdk";

export function NoAccess({ kf }: { kf: Kf }) {
  const roles = kf.user?.AppRoles?.map((r) => r.Name).filter(Boolean) ?? [];
  return (
    <div className="mx-auto max-w-xl p-10" data-testid="wb-noaccess">
      <Card>
        <EmptyState title="No access to the CIQ Workbench">
          Your account ({kf.user?.Email || kf.user?.Name}) holds no CIQ role that opens the Workbench{roles.length ? ` (roles: ${roles.join(", ")})` : ""}. Ask the Business administrator to add you to a CIQ role.
        </EmptyState>
      </Card>
    </div>
  );
}
