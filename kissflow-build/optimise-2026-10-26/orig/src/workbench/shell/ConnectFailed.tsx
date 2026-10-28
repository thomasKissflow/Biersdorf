// The handshake failed or got no answer: say so, with Try again (§5.1).
import { RefreshCw } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/data";

export function ConnectFailed({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl p-10" data-testid="wb-connect-failed">
      <Card>
        <EmptyState
          title="Couldn't connect to Kissflow"
          action={
            <Button variant="primary" icon={<RefreshCw size={15} />} onClick={onRetry} data-testid="wb-retry">
              Try again
            </Button>
          }
        >
          {detail} If this keeps happening, reload the page.
        </EmptyState>
      </Card>
    </div>
  );
}
