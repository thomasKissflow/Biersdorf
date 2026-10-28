// Placeholder for a feature screen that its owning task (T1–T3) has not built yet. It reads nothing and writes nothing.
// The owner is kept only as the data-stub attribute (the harness reads it), never as visible text (F-05).
import { Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/data";

export function FeatureStub({ title, owner, testId, children }: { title: string; owner: string; testId: string; children?: React.ReactNode }) {
  return (
    <div className="p-4 sm:p-6" data-testid={testId} data-stub={owner}>
      <Card>
        <EmptyState title={title}>
          {children ?? "This screen is not available yet."}
        </EmptyState>
      </Card>
    </div>
  );
}
