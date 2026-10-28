// AuditTimeline (§8.16; final contract §12.2): AuditTimeline({ events: AuditVM[]; dense?: boolean }). Props only: it
// reads nothing and writes nothing (F8 is create-only, WB-15). Used by T1's case detail ("Audit" tab) and by the
// reader's audit log page. Newest first; a correcting row is marked as such; the snapshot is collapsible.
import { Badge, Mono, cx, toneDot, type Tone } from "@/components/ui/primitives";
import type { AuditVM } from "../../data/viewModels";
import { actionLabel, actorLine, fmtDateTime, prettySnapshot, sortEventsNewestFirst } from "./format";

export interface AuditTimelineProps {
  events: AuditVM[];
  dense?: boolean;
}

/** Tone of an event dot by category (text always accompanies it). */
export function eventTone(e: Pick<AuditVM, "category" | "actionCode">): Tone {
  if (e.actionCode.endsWith(".correction") || e.actionCode === "case.cancel.failed" || e.actionCode === "config.hash.mismatch") return "warn";
  switch (e.category) {
    case "Cancellation":
      return "bad";
    case "Configuration":
      return "violet";
    case "Delegation":
    case "Section review":
      return "info";
    case "Change attempt":
      return "warn";
    case "Item created":
      return "ok";
    default:
      return "brand";
  }
}

function Change({ e }: { e: AuditVM }) {
  if (!e.oldValueText && !e.newValueText) return null;
  return (
    <p className="text-[12.5px] text-ink-2">
      <span className="font-mono [overflow-wrap:anywhere]">{e.oldValueText || "—"}</span> → <span className="font-mono [overflow-wrap:anywhere]">{e.newValueText || "—"}</span>
    </p>
  );
}

export function AuditTimeline({ events, dense }: AuditTimelineProps) {
  const sorted = sortEventsNewestFirst(events);
  if (!sorted.length)
    return (
      <p data-testid="wb-audit-timeline" data-empty="true" className="text-[13px] text-ink-3">
        No audit events yet.
      </p>
    );
  if (dense)
    return (
      <ol data-testid="wb-audit-timeline" className="divide-y divide-line text-[13px]">
        {sorted.map((e) => (
          <li key={e._id} data-testid={`wb-audit-event-${e.eventKey || e._id}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
            <span className={cx("h-2 w-2 shrink-0 self-center rounded-full", toneDot[eventTone(e)])} aria-hidden />
            <span className="font-medium text-ink">{actionLabel(e)}</span>
            <span className="text-ink-3">· {actorLine(e)}</span>
            {e.objectKey && <Mono className="text-ink-3">{e.objectKey}</Mono>}
            <span className="ml-auto text-xs whitespace-nowrap text-ink-3">{fmtDateTime(e.at)}</span>
          </li>
        ))}
      </ol>
    );
  return (
    <ol data-testid="wb-audit-timeline" className="relative ml-2 border-l border-line pl-5">
      {sorted.map((e) => (
        <li key={e._id} data-testid={`wb-audit-event-${e.eventKey || e._id}`} className="relative pb-4 last:pb-0">
          <span className={cx("absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ring-4 ring-surface", toneDot[eventTone(e)])} aria-hidden />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
            <span className="font-medium text-ink">{actionLabel(e)}</span>
            <Badge tone="neutral">{e.category || "No category"}</Badge>
            <span className="text-ink-3">· {actorLine(e)}</span>
            <span className="ml-auto text-xs whitespace-nowrap text-ink-3">{fmtDateTime(e.at)}</span>
          </div>
          <div className="mt-1 space-y-1 text-[13px] text-ink-2">
            {(e.caseCode || e.objectKey) && (
              <p className="flex flex-wrap gap-x-3">
                {e.caseCode && (
                  <span>
                    Case <Mono>{e.caseCode}</Mono>
                    {e.cycleNo !== null ? ` · cycle ${e.cycleNo}` : ""}
                  </span>
                )}
                {e.objectKey && (
                  <span>
                    {e.objectKind || "Object"} <Mono>{e.objectKey}</Mono>
                  </span>
                )}
              </p>
            )}
            {e.onBehalfOf && <p>On behalf of {e.onBehalfOf}</p>}
            {e.eventReason && <p className="whitespace-pre-line text-ink">{e.eventReason}</p>}
            <Change e={e} />
            {e.notifyRecipient && <p className="text-[12.5px] text-ink-3">Recipient on record (not notified automatically): {e.notifyRecipient}</p>}
            {e.snapshotJson && (
              <details className="text-[12.5px]">
                <summary className="cursor-pointer text-ink-3 hover:text-ink">Snapshot</summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-[12px] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{prettySnapshot(e.snapshot, e.snapshotJson)}</pre>
              </details>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
