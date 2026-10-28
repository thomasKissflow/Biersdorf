// Generic renderer for one FieldDef of the field matrix (FLM v0.6): input by type, required star,
// help, live validation, per-answer attribution and the "cannot provide" justification (REQ-PROC-012).
import { AlertTriangle, FileText, Lock, MessageSquareWarning } from "lucide-react";
import { useState } from "react";
import { Badge, ChipMulti, FileDrop, Segmented, Select, TextArea, TextInput, cx, useProduction } from "@/components/ui";
import { HEAVY_METAL_LIMITS } from "@/domain/catalog";
import { fmtDateTime, formatValue, hasValue, userName } from "@/domain/selectors";
import type { AnswerValue, CiqCase, FieldDef } from "@/domain/types";
import { usePortalCaps } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { documentsAt, inferDocKind, isLiveScope } from "./lib";
import { Attribution, DocumentList, RequestedBadge } from "./parts";

/** Local draft that follows the stored value when it changes elsewhere (e.g. a colleague's edit). */
function useDraft(stored: string) {
  const [draft, setDraft] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    setDraft(stored);
  }
  return [draft, setDraft] as const;
}

const asText = (v: AnswerValue | undefined) => (v === null || v === undefined ? "" : typeof v === "object" ? "" : String(v));

export interface FieldRendererProps {
  c: CiqCase;
  f: FieldDef;
  /** Editable now (supplier-input, metadata, or requested by Beiersdorf in review). */
  editable: boolean;
  requested?: boolean;
  focused?: boolean;
  /** Store the text as a justification instead of an answer (K5.1 waiver, REQ-PROC-012). */
  asJustification?: boolean;
  /** A short note under the label, e.g. for a question that no longer applies to the answers. */
  notice?: string;
}

/** The one K2.2 justification shared by every heavy-metal value above its BDF limit. */
const LIMIT_JUSTIFICATION = "FLD-2.2-002";

export function FieldRenderer({ c, f, editable, requested, focused, asJustification, notice }: FieldRendererProps) {
  const { state, setAnswer, setJustification, uploadDocument, notify } = useStore();
  const production = useProduction();
  // The live portal's old flow (no liveScope) keeps its earlier file question: one current file with its version.
  const legacy = !isLiveScope(c);
  const uploadable = usePortalCaps().canUpload(c.id, f.sectionId);
  const stored = asJustification ? (c.justifications[f.id] ?? c.answers[f.id]) : c.answers[f.id];
  const just = asJustification ? undefined : c.justifications[f.id];
  const [touched, setTouched] = useState(false);
  const [jOpen, setJOpen] = useState(!!just);
  const required = f.required !== "optional";
  const canJustify = required && f.sectionId !== "GEN" && f.type !== "longtext";

  const commit = (v: AnswerValue) => {
    if (JSON.stringify(v) === JSON.stringify(stored ?? null)) return;
    if (asJustification) setJustification(c.id, f.id, typeof v === "string" ? v : "");
    else setAnswer(c.id, f.id, v);
  };

  // validation on the value as it is now (draft for text-like inputs)
  const [draft, setDraft] = useDraft(asText(stored));
  const numeric = f.type === "number" || f.type === "decimal";
  const draftValue: AnswerValue = numeric ? (draft.trim() === "" ? null : Number(draft.replace(",", "."))) : draft;
  const textLike = f.type === "text" || f.type === "email" || f.type === "longtext" || numeric;
  const current = textLike ? draftValue : stored;
  let error: string | null = null;
  if (numeric && draft.trim() !== "" && !Number.isFinite(draftValue as number)) error = "Please enter a number";
  else if (hasValue(current ?? null) && f.validate) error = f.validate(current as AnswerValue);
  const showError = !!error && (touched || hasValue(stored ?? null));
  // K2.2: a value above the BDF limit is allowed but needs the justification field that appears below it
  const limit = HEAVY_METAL_LIMITS.find((m) => m.fieldId === f.id);
  const aboveLimit = !!limit && !showError && typeof stored === "number" && stored > limit.limit;
  // The shared K2.2 justification box, still empty while a value is above its limit: highlighted until it is filled in.
  const awaitsLimitReason = f.id === LIMIT_JUSTIFICATION && editable && !hasValue(stored ?? null);
  const goToLimitReason = () => {
    const box = document.getElementById(`field-${LIMIT_JUSTIFICATION}`);
    box?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => box?.querySelector<HTMLTextAreaElement>("textarea")?.focus(), 350);
  };

  const commitDraft = () => {
    setTouched(true);
    if (numeric) {
      if (draft.trim() === "") return commit(null);
      const n = Number(draft.replace(",", "."));
      if (Number.isFinite(n)) commit(n);
      return;
    }
    commit(draft.trim() === "" ? null : draft);
  };

  // Documents are added next to each other with their upload date, never versioned or deleted (BRM v2 REQ-PROC-029).
  const docs = f.type === "file" && !legacy ? documentsAt(c, f.sectionId, f.id) : [];
  // Documents stored at another kind of question: the supplier's answer to a Beiersdorf question on it.
  const fieldDocs = f.type !== "file" && !legacy ? documentsAt(c, f.sectionId, f.id).filter((d) => d.fieldId === f.id) : [];
  const legacyDoc = legacy && f.type === "file" && typeof stored === "string" ? c.documents.find((d) => d.id === stored) : undefined;

  let control: React.ReactNode;
  if (legacy && f.type === "file" && !editable) {
    control = (
      <div className="flex min-h-9 max-w-2xl items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13.5px]">
        <Lock size={13} className="mt-1 shrink-0 text-ink-3" aria-label="Locked" />
        {legacyDoc ? (
          <span className="flex flex-wrap items-center gap-x-2 text-ink">
            <FileText size={14} className="text-ink-3" />
            <span className="font-medium">{legacyDoc.name}</span>
            <span className="rounded bg-surface-3 px-1.5 text-[11px] text-ink-2">v{legacyDoc.version}</span>
            <span className="text-xs text-ink-3">{legacyDoc.sizeKb} KB</span>
          </span>
        ) : (
          <span className="text-ink-3">No document</span>
        )}
      </div>
    );
  } else if (legacy && f.type === "file") {
    control = (
      <>
        <FileDrop
          disabled={!uploadable}
          current={legacyDoc ? { name: legacyDoc.name, version: legacyDoc.version, meta: [legacyDoc.sizeKb ? `${legacyDoc.sizeKb} KB` : "", userName(state, legacyDoc.uploadedBy), fmtDateTime(legacyDoc.uploadedAt)].filter(Boolean).join(" · ") } : undefined}
          onFile={(name, sizeKb, file) => {
            return Promise.resolve(uploadDocument(c.id, { name, kind: inferDocKind(f), sectionId: f.sectionId, fieldId: f.id, sizeKb }, file)).then((docId) => {
              if (docId) notify("success", `${name} uploaded${legacyDoc ? ` as version ${legacyDoc.version + 1}` : ""}.`);
            });
          }}
        />
        {!uploadable && editable && <p className="mt-1 text-[12px] text-ink-3">This part of the questionnaire is assigned to a colleague, so only they can upload here.</p>}
      </>
    );
  } else if (!editable && f.type === "file" && docs.length) {
    control = <DocumentList docs={docs} className="max-w-2xl" />;
  } else if (!editable) {
    control = (
      <div className={cx("flex min-h-9 items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13.5px]", f.type !== "longtext" && "max-w-2xl")}>
        <Lock size={13} className="mt-1 shrink-0 text-ink-3" aria-label="Locked" />
        {f.type === "file" ? (
          <span className="text-ink-3">No document</span>
        ) : (
          <span className={cx("whitespace-pre-line", hasValue(stored ?? null) ? "text-ink" : "text-ink-3")}>
            {hasValue(stored ?? null) ? formatValue(stored) : "Not answered"}
            {hasValue(stored ?? null) && f.unit ? ` ${f.unit}` : ""}
          </span>
        )}
      </div>
    );
  } else if (f.type === "yesno") {
    control = (
      <div data-testid={`q-yesno-${f.id}`} className="inline-flex">
        <Segmented<boolean>
          value={typeof stored === "boolean" ? stored : undefined}
          onChange={(v) => commit(v)}
          options={[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ]}
        />
      </div>
    );
  } else if (f.type === "single") {
    control = (
      <Select className="max-w-md" value={typeof stored === "string" ? stored : ""} onChange={(e) => commit(e.target.value || null)} aria-label={f.label}>
        <option value="">Select…</option>
        {f.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  } else if (f.type === "multi") {
    control = <ChipMulti value={Array.isArray(stored) ? stored : []} onChange={(v) => commit(v.length ? v : null)} options={f.options ?? []} />;
  } else if (f.type === "file") {
    control = (
      <div className="max-w-2xl space-y-2">
        <DocumentList docs={docs} />
        <div data-testid={`q-upload-${f.id}`}>
          <FileDrop
            disabled={!uploadable}
            onFile={(name, sizeKb, file) => {
              return Promise.resolve(uploadDocument(c.id, { name, kind: inferDocKind(f), sectionId: f.sectionId, fieldId: f.id, sizeKb }, file)).then((docId) => {
                if (docId) notify("success", `${name} uploaded.`);
              });
            }}
          />
        </div>
        {docs.length > 0 && uploadable && <p className="text-[12px] text-ink-3">A new file is added next to the earlier ones, with today's date. Earlier files stay listed.</p>}
        {!uploadable && editable && <p className="text-[12px] text-ink-3">This part of the questionnaire is assigned to a colleague, so only they can upload here.</p>}
      </div>
    );
  } else if (f.type === "longtext") {
    control = <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commitDraft} invalid={showError} aria-label={f.label} />;
  } else if (f.type === "range") {
    const r = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : { min: null, max: null };
    control = (
      <div className="flex items-center gap-2">
        <TextInput className="w-28" type="number" defaultValue={r.min ?? ""} onBlur={(e) => commit({ ...r, min: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Minimum" />
        <span className="text-ink-3">–</span>
        <TextInput className="w-28" type="number" defaultValue={r.max ?? ""} onBlur={(e) => commit({ ...r, max: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Maximum" />
        <span className="text-[13px] text-ink-3">%</span>
      </div>
    );
  } else {
    control = (
      <div className="flex max-w-md items-center gap-2">
        <TextInput
          type={f.type === "email" ? "email" : "text"}
          inputMode={numeric ? "decimal" : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          invalid={showError}
          className={numeric ? "max-w-44" : undefined}
          aria-label={f.label}
        />
        {f.unit && <span className="text-[13px] whitespace-nowrap text-ink-3">{f.unit}</span>}
      </div>
    );
  }

  return (
    <div
      id={`field-${f.id}`}
      data-testid={`q-field-${f.id}`}
      data-field-type={f.type}
      data-required={required ? "true" : "false"}
      data-answered={hasValue(stored ?? null) || !!just ? "true" : "false"}
      className={cx("scroll-mt-40 px-5 py-4 transition-colors", focused && "bg-brand-soft/50", awaitsLimitReason && "bg-warn-soft/60 ring-2 ring-inset ring-warn/40")}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <label className="text-[13.5px] font-medium text-ink">
            {f.label}
            {required && (
              <span className="ml-0.5 text-bad" aria-label="required">
                *
              </span>
            )}
          </label>
          {f.help && <p className="mt-0.5 text-[12.5px] text-ink-3">{f.help}</p>}
          {notice && <p className="mt-1 text-[12.5px] font-medium text-violet">{notice}</p>}
        </div>
        <div className="flex items-center gap-2">
          {requested && <RequestedBadge />}
          {just && !hasValue(stored ?? null) && <Badge tone="warn">Justified</Badge>}
          {!production && (
            <span className="font-mono text-[11px] text-ink-3" title="Field id">
              {f.id}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2">{control}</div>
      {fieldDocs.length > 0 && <DocumentList docs={fieldDocs} className="mt-2 max-w-2xl" />}
      {showError && <p className="mt-1.5 text-xs font-medium text-bad">{error}</p>}
      {aboveLimit && limit && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink">
          <AlertTriangle size={13} className="mt-px shrink-0 text-warn" />
          <span>
            Above the BDF limit of {limit.limit} {limit.unit}.{" "}
            {editable ? (
              <>
                Please explain the value in “Justification for values above the BDF limit” at the end of this section.{" "}
                <button type="button" data-testid={`limit-reason-${f.id}`} onClick={goToLimitReason} className="font-medium text-brand underline-offset-2 hover:underline">
                  Write the justification
                </button>
              </>
            ) : (
              "A justification is required for this value."
            )}
          </span>
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <Attribution c={c} keyId={f.id} verb={just && !hasValue(stored ?? null) ? "Justified" : f.type === "file" ? "Uploaded" : "Answered"} fallback={f.sectionId === "GEN" && hasValue(stored ?? null) ? "Pre-filled by Beiersdorf" : undefined} />
        {canJustify && editable && !jOpen && !hasValue(stored ?? null) && (
          <button type="button" onClick={() => setJOpen(true)} className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-brand" data-testid={`q-justify-${f.id}`}>
            <MessageSquareWarning size={13} /> Cannot provide? Add a justification
          </button>
        )}
      </div>
      {canJustify && (jOpen || just) && (editable || just) && (
        <Justification
          value={just ?? ""}
          editable={editable}
          onSave={(t) => setJustification(c.id, f.id, t)}
          onRemove={() => {
            if (just) setJustification(c.id, f.id, "");
            setJOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** The cannot-provide justification under a question or a requested document. */
export function Justification({ value, editable, onSave, onRemove, testId }: { value: string; editable: boolean; onSave: (t: string) => void; onRemove: () => void; testId?: string }) {
  const [draft, setDraft] = useDraft(value);
  return (
    <div className="mt-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink">Why can't you provide this?</span>
        {editable && (
          <button type="button" onClick={onRemove} className="text-[12px] text-ink-3 hover:text-ink">
            Remove justification
          </button>
        )}
      </div>
      {editable ? (
        <>
          <TextArea className="mt-1.5 min-h-[60px]" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onSave(draft)} placeholder="For example: the analysis is in progress and will be available in November." aria-label="Justification" data-testid={testId ? `${testId}-text` : undefined} />
          <p className="mt-1 text-[11.5px] text-ink-3">A justification counts as answered for the completeness check. Beiersdorf decides whether it is acceptable.</p>
        </>
      ) : (
        <p className="mt-1 text-[13px] whitespace-pre-line text-ink-2">{value}</p>
      )}
    </div>
  );
}
