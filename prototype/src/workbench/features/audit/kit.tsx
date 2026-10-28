// Small screen-state pieces shared by the T3 screens (§8 "Every screen has three states": loading skeleton, error
// banner with Try again where the last good data stays, warnings list). Kit primitives only.
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card } from "@/components/ui/primitives";

export function Skeleton({ rows = 4, testId, bare }: { rows?: number; testId?: string; /** Inside an existing card: no card of its own. */ bare?: boolean }) {
  const lines = Array.from({ length: rows }, (_, i) => <div key={i} className="h-4 animate-pulse rounded bg-surface-3" style={{ width: `${90 - ((i * 17) % 40)}%` }} />);
  if (bare)
    return (
      <div className="space-y-3 p-4" data-testid={testId} aria-busy="true" aria-label="Loading">
        {lines}
      </div>
    );
  return (
    <Card className="space-y-3 p-4" data-testid={testId} aria-busy="true" aria-label="Loading">
      {lines}
    </Card>
  );
}

export function ErrorBanner({ error, onRetry, testId = "wb-load-error" }: { error: string | null | undefined; onRetry?: () => void; testId?: string }) {
  if (!error) return null;
  return (
    <div role="alert" data-testid={testId} className="flex flex-wrap items-center gap-3 rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-[13.5px] text-ink">
      <AlertTriangle size={16} className="shrink-0 text-bad" aria-hidden />
      <span className="min-w-0 flex-1">Could not load: {error}</span>
      {onRetry && (
        <Button size="sm" icon={<RefreshCw size={13} />} onClick={onRetry} data-testid={`${testId}-retry`}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function WarningList({ warnings, testId = "wb-screen-warnings" }: { warnings: string[]; testId?: string }) {
  if (!warnings.length) return null;
  return (
    <ul data-testid={testId} className="space-y-1 rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-[12.5px] text-ink-2">
      {warnings.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  );
}

/** A plain coloured notice (the outcome of a multi-step action that WriteOutcome does not cover, e.g. an F8 row). */
export function Notice({ tone, children, testId }: { tone: "ok" | "bad" | "warn" | "info"; children: ReactNode; testId?: string }) {
  const cls = { ok: "border-ok/40 bg-ok-soft", bad: "border-bad/40 bg-bad-soft", warn: "border-warn/40 bg-warn-soft", info: "border-info/40 bg-info-soft" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} data-testid={testId} className={`rounded-lg border px-4 py-3 text-[13.5px] text-ink ${cls}`}>
      {children}
    </div>
  );
}

/** Page padding used by every Workbench screen. */
export function Page({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6" data-testid={testId}>
      {children}
    </div>
  );
}
