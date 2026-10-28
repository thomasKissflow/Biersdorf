// Opened outside Kissflow: say so at once. There is no demo mode (§5.1).
import { Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/data";

export function Offline() {
  return (
    <div className="mx-auto max-w-xl p-10" data-testid="wb-offline">
      <Card>
        <EmptyState title="Not running inside Kissflow">This is the CIQ Workbench for Beiersdorf's internal CIQ roles. Open it from the CIQ Digital app in Kissflow.</EmptyState>
      </Card>
    </div>
  );
}
