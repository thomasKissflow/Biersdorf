// One questionnaire section: header, field-level content (FieldRenderer / K2.1 table), the K5.1 waiver,
// or, for a chapter answered with documents only, its document upload (blocking only when the questionnaire version
// requires it and the section is mandatory for the case: then a file or a "Cannot provide" justification).
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Lock, MessageSquareWarning, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, FileDrop, ProgressBar, cx } from "@/components/ui";
import { fieldsOf } from "@/domain/catalog";
import { sectionUploadKey, sectionUploadRequired, sectionUploadStatus, sectionUploads, slotsIn } from "@/domain/requestedDocs";
import { isSetByBdf, isVisible } from "@/domain/selectors";
import type { CiqCase, SectionDef } from "@/domain/types";
import { usePortalCaps } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { ComponentTable } from "./ComponentTable";
import { FieldRenderer, Justification } from "./FieldRenderer";
import { isLiveScope, navProgress, sectionCode, sectionCodeShown, sectionMeta, sectionTitle, type RequestedRefs, type SupplierSection, WAIVER_FIELD } from "./lib";
import { Attribution, DocumentList, LockedNote, RequestedBadge } from "./parts";
import { RequestedDocuments } from "./RequestedDocuments";

export interface SectionPanelProps {
  c: CiqCase;
  sec: SupplierSection;
  locked: boolean;
  requested: RequestedRefs;
  focusField: string | null;
  focusRow: string | null;
  prev?: SupplierSection;
  next?: SupplierSection;
  onSelect: (id: string) => void;
}

export function SectionPanel({ c, sec, locked, requested, focusField, focusRow, prev, next, onSelect }: SectionPanelProps) {
  const tv = c.templateVersion;
  const def = sectionMeta(sec.sectionId, tv);
  const live = isLiveScope(c);
  const p = navProgress(c, sec);
  const complete = p.total > 0 && p.done >= p.total;
  const isRequested = requested.sections.has(sec.sectionId);
  // live portal: files of this section still uploading (the prototype has none)
  const uploads = usePortalCaps().uploadsIn(c.id, sec.sectionId);
  // The fields of the case's own questionnaire version (spec §8.1): a field added in a later version never shows here.
  // A field Beiersdorf asks about stays shown even when a later answer hides it (EC-LC-07).
  const fields = sec.waived ? fieldsOf("K5.1", tv).filter((f) => f.id === WAIVER_FIELD) : fieldsOf(sec.sectionId, tv).filter((f) => isVisible(f, c) || (live && requested.fields.has(f.id)));
  const k21Editable = !locked || (sec.sectionId === "K2.1" && (requested.rows.size > 0 || requested.wholeSections.has("K2.1")));

  useEffect(() => {
    const id = focusField ? `field-${focusField}` : focusRow ? `row-${focusRow}` : null;
    if (!id) return;
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    return () => clearTimeout(t);
  }, [focusField, focusRow, sec.sectionId]);

  return (
    <Card data-testid={`q-section-${sec.sectionId}`} data-applicability={sec.waived ? "waived" : sec.applicability}>
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {sectionCodeShown(sec.sectionId, tv) && <span className="font-mono text-[12.5px] text-ink-3">{def.code}</span>}
              {sec.waived ? (
                <Badge tone="neutral">Waived · justification needed</Badge>
              ) : !def.hasFields ? (
                sectionUploadRequired(c, sec.sectionId) ? (
                  <Badge tone="brand">Documents · mandatory upload</Badge>
                ) : requestedHere(c, sec.sectionId) ? (
                  <Badge tone="brand">Documents · requested documents</Badge>
                ) : (
                  <Badge tone="neutral">Documents only</Badge>
                )
              ) : (
                <Badge tone={sec.applicability === "mandatory" ? "brand" : "neutral"}>{sec.applicability === "mandatory" ? "Mandatory" : "Optional"}</Badge>
              )}
              {live && sec.addedLater && <Badge tone="ok">Added after your completeness confirmation</Badge>}
              {isRequested && <RequestedBadge />}
              {uploads > 0 && (
                <span role="status" data-testid={`section-uploading-${sec.sectionId}`} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-medium text-brand">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  Uploading {uploads === 1 ? "1 file" : `${uploads} files`}…
                </span>
              )}
            </div>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-ink">{def.title}</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">{def.meaning}</p>
          </div>
          {p.total > 0 && (
            <div className="w-full shrink-0 sm:w-40 sm:text-right">
              <p className={cx("text-[12.5px]", complete ? "font-medium text-ok" : "text-ink-2")}>
                {complete ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={14} /> Complete
                  </span>
                ) : (
                  `${p.done} of ${p.total} answered`
                )}
              </p>
              <ProgressBar className="mt-1.5 max-w-60 sm:max-w-none" value={p.done} max={p.total} tone={complete ? "ok" : "brand"} />
            </div>
          )}
        </div>
        {locked && (
          <div className="mt-3">
            <LockedNote>
              {c.phase === "completed"
                ? "Frozen with your final release"
                : c.phase === "final-release"
                  ? "Locked: Beiersdorf has requested your final release"
                  : c.phase === "cancelled"
                  ? "Read-only: this request is closed"
                  : isRequested
                    ? "Locked after submission, except the items Beiersdorf asks about"
                    : "Read-only"}
            </LockedNote>
          </div>
        )}
      </div>

      {sec.waived && (
        <div className="border-b border-line bg-surface-2 px-5 py-3 text-[13px] text-ink-2">
          You answered No to “Is microbiological testing of the raw material required?”. Please explain why below. The total microbial count (K5.2) stays mandatory.
        </div>
      )}

      {def.hasFields || sec.waived ? (
        <div className="divide-y divide-line">
          {sec.sectionId === "K2.1" && !sec.waived && <ComponentTable c={c} editable={k21Editable} requestedRows={requested.rows} focusRow={focusRow} restrictTo={locked && !requested.wholeSections.has("K2.1") ? requested.rows : undefined} />}
          {fields.map((f) => (
            <FieldRenderer key={f.id} c={c} f={f} editable={(!locked || requested.fields.has(f.id)) && !isSetByBdf(c, f.id)} requested={(locked || live) && requested.fields.has(f.id)} focused={focusField === f.id} asJustification={sec.waived} notice={isVisible(f, c) ? undefined : "Beiersdorf asked about this item. It no longer applies to your answers; you can still answer the question."} />
          ))}
          {fields.length === 0 && sec.sectionId !== "K2.1" && (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <SearchX size={26} className="mb-2 text-ink-3" />
              <p className="font-medium text-ink">No questions apply for your answers</p>
              <p className="mt-1 max-w-md text-[13px] text-ink-3">The questions of this section depend on the origin you selected in the {live ? "metadata" : "basic"} questions. None of them applies to this material.</p>
            </div>
          )}
        </div>
      ) : (
        <TemplateChapter key={sec.sectionId} c={c} sectionId={sec.sectionId} kind={def.kind} editable={!locked || requested.wholeSections.has(sec.sectionId)} focused={focusField === sectionUploadKey(sec.sectionId)} />
      )}

      {!sec.waived && <RequestedDocuments c={c} sectionId={sec.sectionId} locked={locked} requested={requested} focusField={focusField} />}

      {(prev || next) && (
        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          {prev ? (
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => onSelect(prev.sectionId)}>
              {sectionCode(prev.sectionId, tv)}
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button variant="secondary" size="sm" className="min-w-0" title={`${sectionCode(next.sectionId, tv)} · ${sectionTitle(next.sectionId, tv)}`} iconRight={<ArrowRight size={14} className="shrink-0" />} onClick={() => onSelect(next.sectionId)}>
              <span className="truncate">
                Next: {sectionCode(next.sectionId, tv)}
                <span className="hidden sm:inline"> · {sectionTitle(next.sectionId, tv)}</span>
              </span>
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/** True when the rules ask for a mandatory requested document in the section (it blocks, whatever its own upload). */
const requestedHere = (c: CiqCase, sectionId: string) => isLiveScope(c) && slotsIn(c, sectionId).some((x) => !x.optional);

/**
 * A chapter answered with documents only: the CIQ template document, a statement or a certificate. Optional, unless
 * the questionnaire version requires the upload ("Upload required? Mandatory", 29 Oct) and the section is mandatory for
 * the case: then at least one file, or "Cannot provide" with a justification, before the completeness confirmation.
 * A mandatory requested document below (RequestedDocuments) blocks on its own, so the text never says "does not block"
 * then. Keyed by section: the justification editor's open state belongs to one section.
 */
function TemplateChapter({ c, sectionId, kind, editable, focused }: { c: CiqCase; sectionId: string; kind: SectionDef["kind"]; editable: boolean; focused: boolean }) {
  const noun = kind === "annex" ? "annex" : kind === "basic" ? "section" : "chapter";
  const { uploadDocument, notify, setJustification } = useStore();
  const caps = usePortalCaps();
  const docs = sectionUploads(c, sectionId);
  const required = sectionUploadRequired(c, sectionId);
  const key = sectionUploadKey(sectionId);
  const just = c.justifications[key];
  const [jOpen, setJOpen] = useState(!!just);
  return (
    <div id={`field-${key}`} data-testid={`q-documents-${sectionId}`} data-required={required ? "true" : "false"} data-status={sectionUploadStatus(c, sectionId)} className={cx("scroll-mt-40 space-y-4 px-5 py-5 transition-colors", focused && "bg-brand-soft/50")}>
      <div className="rounded-lg border border-line bg-surface-2 px-4 py-4" data-testid={`q-documents-only-${sectionId}`}>
        <p className="text-[13.5px] font-medium text-ink">This {noun} is answered with documents</p>
        <p className="mt-1 text-[13px] text-ink-3">
          It is covered by the CIQ template document. Upload the completed template, or a statement or certificate that covers it.{" "}
          {required
            ? "Beiersdorf needs at least one document here: until you upload one, or say why you cannot provide it, it blocks your completeness confirmation."
            : requestedHere(c, sectionId)
              ? "This upload is optional. Beiersdorf also needs the requested documents below: upload each one, or say why you cannot provide it."
              : "It does not block your completeness confirmation."}
        </p>
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-[13.5px] font-medium text-ink">
            Documents for this {noun}
            {required && (
              <span className="ml-0.5 text-bad" aria-label="required">
                *
              </span>
            )}
          </p>
          <p className="text-[12.5px] text-ink-3">{required ? "Required: at least one document. Each file is listed with its upload date." : "Optional. Each file is listed with its upload date."}</p>
        </div>
        <DocumentList docs={docs} />
        {editable && caps.canUpload(c.id, sectionId) ? (
          <div data-testid={`q-upload-${sectionId}`}>
            <FileDrop
              onFile={(name, sizeKb, file) => {
                return Promise.resolve(uploadDocument(c.id, { name, kind: "Statement", sectionId, sizeKb }, file)).then((docId) => {
                  if (docId) notify("success", `${name} added to ${sectionCode(sectionId, c.templateVersion)}.`);
                });
              }}
            />
          </div>
        ) : (
          docs.length === 0 &&
          !just && (
            <p className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <Lock size={12} /> No supporting documents were added.
            </p>
          )
        )}
        {(required || just) && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {just && !docs.length ? <Attribution c={c} keyId={key} verb="Justified" /> : <span />}
              {required && editable && !jOpen && !docs.length && (
                <button type="button" onClick={() => setJOpen(true)} className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-brand" data-testid={`q-justify-${key}`}>
                  <MessageSquareWarning size={13} /> Cannot provide? Add a justification
                </button>
              )}
            </div>
            {(jOpen || just) && (editable || just) && (
              <Justification
                testId={`q-documents-justification-${sectionId}`}
                value={just ?? ""}
                editable={editable}
                onSave={(t) => setJustification(c.id, key, t)}
                onRemove={() => {
                  if (just) setJustification(c.id, key, "");
                  setJOpen(false);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
