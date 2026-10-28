// Small screen helpers shared by T2's folders (review, points, assess, rmes): the three states every screen has
// (§8: loading skeleton · error banner with Try again, last good data kept · warnings list), a "not held" note and a
// definition list. Visuals reuse the prototype kit (WB-2).
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, cx } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/data";

export function Skeleton({ rows = 3, testId }: { rows?: number; testId?: string }) {
  return (
    <div className="space-y-2 p-1" data-testid={testId ?? "wb-loading"} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-2" style={{ width: `${92 - i * 9}%` }} />
      ))}
    </div>
  );
}

export function ErrorBanner({ error, onRetry, testId }: { error: string | null | undefined; onRetry?: () => void; testId?: string }) {
  if (!error) return null;
  return (
    <div role="alert" data-testid={testId ?? "wb-load-error"} className="flex flex-wrap items-center gap-3 rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-[13.5px] text-ink">
      <span className="flex-1">{error}</span>
      {onRetry && (
        <Button size="sm" icon={<RefreshCw size={13} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Warnings({ items, testId }: { items: (string | null | undefined | false)[]; testId?: string }) {
  const list = [...new Set(items.filter((x): x is string => !!x))];
  if (!list.length) return null;
  return (
    <ul role="status" data-testid={testId ?? "wb-warnings-list"} className="space-y-1 rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-[12.5px] text-ink-2">
      {list.map((w, i) => (
        <li key={i} className="flex gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

export function Note({ tone = "info", children, testId, className }: { tone?: "info" | "warn" | "bad" | "ok" | "neutral"; children: ReactNode; testId?: string; className?: string }) {
  const cls =
    tone === "bad" ? "border-bad/40 bg-bad-soft" : tone === "warn" ? "border-warn/40 bg-warn-soft" : tone === "ok" ? "border-ok/40 bg-ok-soft" : tone === "neutral" ? "border-line bg-surface-2" : "border-info/40 bg-info-soft";
  return (
    <div data-testid={testId} className={cx("rounded-lg border px-3.5 py-2.5 text-[13px] text-ink", cls, className)}>
      {children}
    </div>
  );
}

export function NotFound({ title, children, action, testId }: { title: string; children?: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <Card data-testid={testId}>
      <EmptyState title={title} action={action}>
        {children}
      </EmptyState>
    </Card>
  );
}

/** A compact label/value list (wraps on phones). */
export function Facts({ items }: { items: { k: ReactNode; v: ReactNode; testId?: string }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {items.map((it, i) => (
        <div key={i} className="min-w-0" data-testid={it.testId}>
          <dt className="text-xs text-ink-3">{it.k}</dt>
          <dd className="mt-0.5 text-[13.5px] break-words whitespace-pre-wrap text-ink">{it.v === "" || it.v === null || it.v === undefined ? <span className="text-ink-3">—</span> : it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The page frame used by T2's screens (same padding as the other Workbench pages). */
export function Page({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 sm:p-6" data-testid={testId}>
      {children}
    </div>
  );
}
