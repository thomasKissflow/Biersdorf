// "Requested documents" at the end of a section (spec §8.5): the documents Beiersdorf's rules ask for that no question
// of the questionnaire collects. One row per document: its name, why it is asked (plain words, no rule ids), the
// uploader of the file questions, the uploaded files with who and when, and "Cannot provide? Add a justification".
// Each one is required for the completeness confirmation, unless Beiersdorf's rules mark it optional (no asterisk, no
// "Cannot provide": the supplier may leave it out). Live-scope requests only (the live portal keeps its flow).
import { FileUp, MessageSquareWarning } from "lucide-react";
import { useState } from "react";
import { Badge, FileDrop, cx } from "@/components/ui";
import { requestedDocStatus, slotDocuments, slotsIn } from "@/domain/requestedDocs";
import type { CiqCase, RequestedDocSlot } from "@/domain/types";
import { usePortalCaps } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { Justification } from "./FieldRenderer";
import { isLiveScope, type RequestedRefs } from "./lib";
import { Attribution, DocumentList, RequestedBadge } from "./parts";

/** The block's lead-in: what the supplier must do, or may do, with the documents listed. */
function introOf(slots: RequestedDocSlot[]): string {
  const optional = slots.filter((x) => x.optional).length;
  if (!optional) return slots.length === 1 ? "Beiersdorf needs this document for this raw material. Upload it, or say why you cannot provide it." : "Beiersdorf needs these documents for this raw material. Upload each one, or say why you cannot provide it.";
  if (optional === slots.length) return slots.length === 1 ? "Beiersdorf asks for this document for this raw material. It is optional: upload it if you have it." : "Beiersdorf asks for these documents for this raw material. They are optional: upload them if you have them.";
  return "Beiersdorf needs the documents marked * for this raw material: upload each one, or say why you cannot provide it. The others are optional.";
}

export function RequestedDocuments({ c, sectionId, locked, requested, focusField }: { c: CiqCase; sectionId: string; locked: boolean; requested: RequestedRefs; focusField: string | null }) {
  const slots = isLiveScope(c) ? slotsIn(c, sectionId) : [];
  if (!slots.length) return null;
  return (
    <section className="border-t border-line" data-testid={`q-requested-${sectionId}`} data-count={slots.length}>
      <div className="flex items-start gap-2.5 bg-surface-2 px-5 py-3">
        <FileUp size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-ink">Requested documents</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-3">{introOf(slots)}</p>
        </div>
      </div>
      <div className="divide-y divide-line">
        {slots.map((slot) => (
          <SlotRow key={slot.key} c={c} slot={slot} editable={!locked || requested.fields.has(slot.key)} asked={requested.fields.has(slot.key)} focused={focusField === slot.key} />
        ))}
      </div>
    </section>
  );
}

function SlotRow({ c, slot, editable, asked, focused }: { c: CiqCase; slot: RequestedDocSlot; editable: boolean; asked: boolean; focused: boolean }) {
  const { setJustification, uploadDocument, notify } = useStore();
  const uploadable = usePortalCaps().canUpload(c.id, slot.sectionId);
  const docs = slotDocuments(c, slot.key);
  const just = c.justifications[slot.key];
  const status = requestedDocStatus(c, slot);
  const [jOpen, setJOpen] = useState(!!just);
  return (
    <div id={`field-${slot.key}`} data-testid={`q-reqdoc-${slot.key}`} data-status={status} data-optional={slot.optional ? "true" : "false"} className={cx("scroll-mt-40 px-5 py-4 transition-colors", focused && "bg-brand-soft/50")}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-ink">
            {slot.doc}
            {slot.optional ? (
              <span className="ml-1.5 text-[12px] font-normal text-ink-3">Optional</span>
            ) : (
              <span className="ml-0.5 text-bad" aria-label="required">
                *
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-3" data-testid={`q-reqdoc-why-${slot.key}`}>
            {slot.why}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {asked && <RequestedBadge />}
          {slot.addedLater && <Badge tone="ok">Added after your completeness confirmation</Badge>}
          {status === "received" && <Badge tone="ok">Uploaded</Badge>}
          {status === "justified" && <Badge tone="warn">Justified</Badge>}
        </div>
      </div>
      <div className="mt-2 max-w-2xl space-y-2">
        <DocumentList docs={docs} />
        {editable ? (
          <>
            <div data-testid={`q-upload-${slot.key}`}>
              <FileDrop
                disabled={!uploadable}
                onFile={(name, sizeKb, file) => {
                  return Promise.resolve(uploadDocument(c.id, { name, kind: "Analysis", sectionId: slot.sectionId, fieldId: slot.key, sizeKb }, file)).then((docId) => {
                    if (docId) notify("success", `${name} uploaded.`);
                  });
                }}
              />
            </div>
            {docs.length > 0 && uploadable && <p className="text-[12px] text-ink-3">A new file is added next to the earlier ones, with today's date. Earlier files stay listed.</p>}
            {!uploadable && <p className="text-[12px] text-ink-3">This part of the questionnaire is assigned to a colleague, so only they can upload here.</p>}
          </>
        ) : (
          docs.length === 0 && !just && <p className="text-[13px] text-ink-3">{slot.optional ? "Not provided (optional)" : "No document"}</p>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        {just && !docs.length ? <Attribution c={c} keyId={slot.key} verb="Justified" /> : <span />}
        {editable && !jOpen && !docs.length && !slot.optional && (
          <button type="button" onClick={() => setJOpen(true)} className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-brand" data-testid={`q-justify-${slot.key}`}>
            <MessageSquareWarning size={13} /> Cannot provide? Add a justification
          </button>
        )}
      </div>
      {(jOpen || just) && (editable || just) && (
        <Justification
          testId={`q-reqdoc-justification-${slot.key}`}
          value={just ?? ""}
          editable={editable}
          onSave={(t) => setJustification(c.id, slot.key, t)}
          onRemove={() => {
            if (just) setJustification(c.id, slot.key, "");
            setJOpen(false);
          }}
        />
      )}
    </div>
  );
}
