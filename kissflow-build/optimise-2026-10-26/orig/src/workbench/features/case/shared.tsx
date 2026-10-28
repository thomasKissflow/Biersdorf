// Shared bits of the T1 screens (features/rmm, case, cr): page frame, loading/error/warning states, an action-result
// banner and date formatting. Presentational only: nothing here reads or writes.
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, cx } from "@/components/ui/primitives";
import type { ActionResult } from "../../data/viewModels";
import { fmtDate as fmtDateGB, fmtDateTime as fmtDateTimeGB } from "../audit/format";

export function Page({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="space-y-5 p-4 sm:p-6" data-testid={testId}>
      {children}
    </div>
  );
}

/** Loading skeleton (§8: every screen has a loading state). */
export function LoadingCard({ rows = 4, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <Card className="p-4" aria-busy="true" data-testid="wb-loading">
      <span className="sr-only">{label}</span>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-1/3 rounded bg-surface-3" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-3 rounded bg-surface-3" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </Card>
  );
}

/** Error banner with Try again (§8: the last good data stays below it). */
export function ErrorBanner({ error, onRetry }: { error: string | null | undefined; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" data-testid="wb-error" className="flex flex-wrap items-center gap-3 rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-[13.5px] text-ink">
      <AlertTriangle size={16} className="shrink-0 text-bad" aria-hidden />
      <span className="min-w-0 flex-1">{error}</span>
      {onRetry && (
        <Button size="sm" icon={<RefreshCw size={13} />} onClick={onRetry} data-testid="wb-error-retry">
          Try again
        </Button>
      )}
    </div>
  );
}

/** Warnings list (partial reads, degraded routes): never swallowed. */
export function WarningsList({ warnings }: { warnings: string[] | undefined }) {
  const ws = [...new Set(warnings ?? [])];
  if (!ws.length) return null;
  return (
    <ul role="status" data-testid="wb-page-warnings" className="space-y-1 rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-[12.5px] text-ink-2">
      {ws.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  );
}

/** The outcome of an action that is not a plain save (cancel, create, setup, repair …). */
export function ActionBanner({ result, testId = "wb-action-result" }: { result: ActionResult | null | undefined; testId?: string }) {
  if (!result) return null;
  return (
    <div
      role={result.ok ? "status" : "alert"}
      data-testid={testId}
      data-ok={result.ok ? "1" : "0"}
      className={cx("flex gap-2.5 rounded-lg border px-4 py-3 text-[13.5px] text-ink", result.ok ? "border-ok/40 bg-ok-soft" : "border-bad/40 bg-bad-soft")}
    >
      {result.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />}
      <div className="space-y-1">
        <p>{result.message}</p>
        {result.notes?.map((n, i) => (
          <p key={i} className="text-ink-2">
            {n}
          </p>
        ))}
      </div>
    </div>
  );
}

/** A date as read, in ONE format across the Workbench ("15 Oct 2026", en-GB, local time; UX-12); "" stays "". */
export function fmtDate(v: string | null | undefined): string {
  return v ? fmtDateGB(v) : "";
}
/** A date-time as read ("15 Oct 2026, 10:00", en-GB, local time, no seconds, no "UTC"); "" stays "". */
export function fmtDateTime(v: string | null | undefined): string {
  return v ? fmtDateTimeGB(v) : "";
}

/** "CIQ-2026-Pk01 · C1" */
export const caseLabel = (code: string | undefined, cycle: number | null | undefined): string => [code || "(no case code)", cycle ? `C${cycle}` : ""].filter(Boolean).join(" · ");

/** Overdue when a YYYY-MM-DD date lies before today (local). */
export function isOverdue(date: string | undefined | null, now = new Date()): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return false;
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const due = new Date(y, m - 1, d, 23, 59, 59);
  return due.getTime() < now.getTime();
}
