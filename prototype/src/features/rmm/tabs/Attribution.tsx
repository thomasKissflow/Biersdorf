// "Who and when" next to an answer, a document or a note: the person's avatar and name with the time, on one row and
// vertically centred. `stacked` puts the time under the name (the "Answered by" column of the answers list); on phones
// the stacked form folds back into one line. One avatar size everywhere.
import type { ReactNode } from "react";
import { Avatar, cx } from "@/components/ui";
import { fmtDateTime, userById } from "@/domain/selectors";
import type { AppState } from "@/domain/types";

const SIZE = 22;

export function Attribution({ state, by, at, stacked, className, "data-testid": testId }: { state: AppState; by: string; at: string; stacked?: boolean; className?: string; "data-testid"?: string }) {
  const u = userById(state, by);
  const name = u?.name ?? (by === "system" ? "System" : "Unknown user");
  const when = fmtDateTime(at);
  return (
    <span className={cx("inline-flex max-w-full min-w-0 items-center gap-2 text-[12px] leading-4 text-ink-3", className)} title={`${u ? (u.side === "supplier" ? "Supplier" : "Beiersdorf") + ": " : ""}${name} · ${when}`} data-testid={testId}>
      <Avatar initials={u?.initials ?? "?"} side={u?.side ?? "internal"} size={SIZE} />
      <span className="min-w-0">
        <span className={cx("font-medium text-ink-2", stacked && "md:block md:truncate")}>{name}</span>
        <span className={cx(stacked && "md:hidden")} aria-hidden>
          {" · "}
        </span>
        <span className={cx("whitespace-nowrap", stacked && "md:block")}>{when}</span>
      </span>
    </span>
  );
}

/** The same row for an answer nobody typed in: pre-filled by Beiersdorf at case creation, set by RMM. */
export function SourceNote({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex max-w-full items-center gap-2 text-[12px] leading-4 text-ink-3", className)}>
      <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-3" style={{ width: SIZE, height: SIZE }}>
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}
