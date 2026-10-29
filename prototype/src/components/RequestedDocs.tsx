// "Requested documents" of a section as Beiersdorf reads them (review workspace, case Questionnaire tab): the documents
// the rules ask for that no question collects (spec §8.5), each with its status (received, not provided and justified,
// missing; an optional one left out is "Not provided (optional)", never a red "Missing"), the rule that asks for it, the
// files with who and when, or the justification. Read-only; Beiersdorf never uploads for the supplier. Internal only:
// it names the rules. Also the upload of a documents-only section that requires one (SectionUploadRow).
import { FileUp, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { DocName } from "@/components/DocName";
import { Badge, cx, type Tone } from "@/components/ui";
import { REQUESTED_STATUS_LABEL, requestedByText, requestedDocStatus, requestedStatusLabel, sectionUploadKey, sectionUploadRequired, sectionUploadStatus, sectionUploads, slotDocuments, slotsIn, type RequestedDocStatus } from "@/domain/requestedDocs";
import { fmtDate, fmtDateTime, isClosed, userName } from "@/domain/selectors";
import type { AppState, CiqCase, DocumentRef, RequestedDocSlot } from "@/domain/types";

const TONE: Record<RequestedDocStatus, Tone> = { received: "ok", justified: "warn", missing: "bad" };

export function RequestedDocsList({
  c,
  state,
  sectionId,
  since,
  action,
  className,
  inset = "px-4",
  who,
}: {
  c: CiqCase;
  state: AppState;
  sectionId: string;
  /** Files uploaded after this moment are marked "Changed". */
  since?: string;
  /** E.g. an "Ask supplier" button per document (the newest file, if any). */
  action?: (slot: RequestedDocSlot, newest?: DocumentRef) => ReactNode;
  className?: string;
  /** Horizontal padding of the rows, to line up with the card around the list. */
  inset?: string;
  /** Who and when of a file or a justification; plain text when not given. */
  who?: (by: string, at: string) => ReactNode;
}) {
  const slots = slotsIn(c, sectionId);
  if (!slots.length) return null;
  return (
    <section className={cx("border-t border-line", className)} data-testid={`requested-${sectionId}`} data-count={slots.length}>
      <p className={cx("flex items-center gap-1.5 pt-3 pb-1 text-xs font-medium text-ink-3", inset)}>
        <FileUp size={13} aria-hidden /> Requested documents · asked for by the rules, no question collects them
      </p>
      <ul className="divide-y divide-line">
        {slots.map((slot) => {
          const status = requestedDocStatus(c, slot);
          const docs = slotDocuments(c, slot.key);
          const just = c.justifications[slot.key];
          const justBy = c.answeredBy[slot.key];
          return (
            <li key={slot.key} className={cx("group grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-3", inset)} data-testid={`reqdoc-${slot.key}`} data-status={status} data-optional={slot.optional ? "true" : "false"}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13.5px] font-medium text-ink">{slot.doc}</span>
                  <Badge tone={slot.optional && status === "missing" ? "neutral" : TONE[status]} dot>
                    {requestedStatusLabel(status, slot, isClosed(c))}
                  </Badge>
                  {slot.optional && status !== "missing" && <Badge tone="neutral">Optional</Badge>}
                  {slot.addedLater && <Badge tone="info">Added after completeness</Badge>}
                  {slot.kept && <Badge tone="neutral">Kept: the scope only grows</Badge>}
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  {requestedByText(slot).replace(/^r/, "R")} · {slot.conditions.join("; ")}
                </p>
                {docs.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {docs.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                        <Paperclip size={13} className="shrink-0 text-ink-3" aria-hidden />
                        <DocName id={d.id} name={d.name} className="min-w-0 font-medium text-ink [overflow-wrap:anywhere]" />
                        {who ? (
                          who(d.uploadedBy, d.uploadedAt)
                        ) : (
                          <span className="text-[12px] text-ink-3">
                            uploaded {fmtDateTime(d.uploadedAt)} by {userName(state, d.uploadedBy)}
                          </span>
                        )}
                        {since && Date.parse(d.uploadedAt) > Date.parse(since) && (
                          <Badge tone="warn" dot>
                            Changed {fmtDate(d.uploadedAt)}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {just && (
                  <p className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink-2">
                    {docs.length ? "Justification (a file was uploaded too)" : "Cannot provide"}: {just}
                    {justBy &&
                      (who ? (
                        <span className="mt-1 block">{who(justBy.by, justBy.at)}</span>
                      ) : (
                        <span className="mt-0.5 block text-[11.5px] text-ink-3">
                          {userName(state, justBy.by)} · {fmtDateTime(justBy.at)}
                        </span>
                      ))}
                  </p>
                )}
                {status === "missing" && (
                  <p className="mt-1 text-[12.5px] text-ink-3">
                    {slot.optional ? "Optional: the rules let the supplier leave it out, so it blocks nothing." : isClosed(c) ? "No file and no justification." : "Not uploaded yet. It blocks the completeness confirmation and the final release."}
                  </p>
                )}
              </div>
              <div className="pt-0.5">{action?.(slot, docs[0])}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The upload of a documents-only section whose questionnaire version requires one ("Upload required? Mandatory",
 * 29 Oct) while the section is mandatory for the case: received (the files are listed with the section's documents),
 * not provided and justified (with the supplier's reason), or missing. Nothing for any other section.
 */
export function SectionUploadRow({ c, state, sectionId, className, inset = "px-4", who }: { c: CiqCase; state: AppState; sectionId: string; className?: string; inset?: string; who?: (by: string, at: string) => ReactNode }) {
  if (!sectionUploadRequired(c, sectionId)) return null;
  const status = sectionUploadStatus(c, sectionId);
  const n = sectionUploads(c, sectionId).length;
  const key = sectionUploadKey(sectionId);
  const just = c.justifications[key];
  const justBy = c.answeredBy[key];
  return (
    <section className={cx("border-t border-line py-3", inset, className)} data-testid={`section-upload-${sectionId}`} data-status={status}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13.5px] font-medium text-ink">Documents for this section</span>
        <Badge tone={TONE[status]} dot>
          {status === "received" ? `Received · ${n} ${n === 1 ? "document" : "documents"}` : status === "justified" ? REQUESTED_STATUS_LABEL.justified : isClosed(c) ? "Not provided" : REQUESTED_STATUS_LABEL.missing}
        </Badge>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-3">Mandatory upload: at least one document, or the supplier says why they cannot provide one.</p>
      {status === "justified" && (
        <p className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink-2">
          Cannot provide: {just}
          {justBy &&
            (who ? (
              <span className="mt-1 block">{who(justBy.by, justBy.at)}</span>
            ) : (
              <span className="mt-0.5 block text-[11.5px] text-ink-3">
                {userName(state, justBy.by)} · {fmtDateTime(justBy.at)}
              </span>
            ))}
        </p>
      )}
      {status === "missing" && <p className="mt-1 text-[12.5px] text-ink-3">{isClosed(c) ? "No file and no justification." : "Nothing uploaded yet. It blocks the completeness confirmation and the final release."}</p>}
    </section>
  );
}
