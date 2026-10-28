// Centre column: the selected section's answers, attribution and documents, with "Ask supplier" on every field,
// component row and document (REQ-PROC-019, -029). Beiersdorf never changes answers. Answers and uploads the
// supplier changed after the reviewer's reference point are marked "Changed <date> by <name>".
import { DocName } from "@/components/DocName";
import { RequestedDocsList } from "@/components/RequestedDocs";
import { FileText, Info, MessageSquarePlus } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Card, CardHeader, DemoNote, TrafficLight } from "@/components/ui";
import { ApplicabilityBadge } from "@/components/status";
import { DEPT_SHORT, HEAVY_METAL_LIMITS, LIMIT_SET_VERSION, codeTitle, fieldOf, fieldsOf, sectionOf } from "@/domain/catalog";
import { isSlotKey } from "@/domain/requestedDocs";
import { answerOf, answeredByOf, fmtDate, fmtDateTime, formatValue, hasValue, isSetByBdf, isVisible, scopeOf, userById, userName } from "@/domain/selectors";
import type { AppState, CiqCase, DocumentRef, FieldDef, OpenPoint } from "@/domain/types";
import { ComponentTable } from "./ComponentTable";
import { changedAfter } from "./lib";
import { type AskTarget, docLabel, docTarget, fieldTarget, Notice, secCode, sectionTarget } from "./shared";

export function AskButton({ onClick, label, testId }: { onClick: () => void; label: string; testId: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium whitespace-nowrap text-brand opacity-80 transition-opacity group-hover:opacity-100 hover:bg-brand-soft focus-visible:opacity-100"
    >
      <MessageSquarePlus size={14} /> Ask supplier
    </button>
  );
}

function OpChips({ ops, onFocusOp }: { ops: OpenPoint[]; onFocusOp: (id: string) => void }) {
  if (!ops.length) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {ops.map((p) => (
        <button key={p.id} onClick={() => onFocusOp(p.id)} className="rounded-md hover:bg-surface-3" title="Show this open point">
          <TrafficLight status={p.status} label={`${p.id} · ${DEPT_SHORT[p.dept]}`} />
        </button>
      ))}
    </span>
  );
}

/** "Changed 12 Oct 2026 by Elena Márquez": a supplier change after the reviewer's reference point. */
export function ChangedBadge({ by, at, state }: { by: string; at: string; state: AppState }) {
  return (
    <Badge tone="warn" dot>
      Changed {fmtDate(at)} by {userName(state, by)}
    </Badge>
  );
}

/** Limit check shown next to a value: heavy metals from the limit set, MOAH from its RMES criterion. */
function limitFor(c: CiqCase, f: FieldDef) {
  const v = answerOf(c, f);
  if (typeof v !== "number") return null;
  const hm = HEAVY_METAL_LIMITS.find((m) => m.fieldId === f.id);
  if (hm) return { limit: hm.limit, unit: hm.unit, pass: v <= hm.limit, version: LIMIT_SET_VERSION };
  const cr = c.rmes?.criteria.find((x) => x.source.fieldId === f.id && x.limit && x.limit.value === v);
  return cr?.limit ? { limit: cr.limit.limit, unit: cr.limit.unit, pass: cr.limit.pass, version: cr.limit.limitSetVersion } : null;
}

function who(state: AppState, by: { by: string; at: string } | undefined, answered: boolean): ReactNode {
  if (!by) return answered ? "Entered at case creation" : null;
  const u = userById(state, by.by);
  return `${u?.side === "supplier" ? "Supplier" : "Beiersdorf"}: ${userName(state, by.by)} · ${fmtDateTime(by.at)}`;
}

function DocLine({ d, state, earlier }: { d: DocumentRef; state: AppState; earlier?: boolean }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <FileText size={14} className="shrink-0 text-ink-3" />
      <DocName id={d.id} name={d.name} className="min-w-0 truncate font-medium text-ink" />
      {earlier && <Badge tone="neutral">Earlier upload</Badge>}
      <span className="text-xs text-ink-3">
        {d.kind} · {d.sizeKb} KB · uploaded {fmtDate(d.uploadedAt)} by {userName(state, d.uploadedBy)}
      </span>
    </span>
  );
}

function FieldRow({ c, f, state, since, canAsk, onAsk, onFocusOp }: { c: CiqCase; f: FieldDef; state: AppState; since?: string; canAsk: boolean; onAsk: (t: AskTarget) => void; onFocusOp: (id: string) => void }) {
  // A derived field (FLD-A1-105, L6) shows its source's answer and who gave it.
  const v = answerOf(c, f);
  const doc = f.type === "file" && typeof v === "string" ? c.documents.find((d) => d.id === v) : undefined;
  const earlier = doc ? c.documents.filter((d) => d.fieldId === f.id && d.id !== doc.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)) : [];
  // Documents stored at a question that is not a file question (the supplier's answer to a query on it).
  const atField = f.type !== "file" ? c.documents.filter((d) => d.fieldId === f.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)) : [];
  const just = c.justifications[f.id];
  const lim = limitFor(c, f);
  const ops = c.openPoints.filter((p) => p.ref.fieldId === f.id && !p.ref.rowId && p.status !== "closed");
  const by = answeredByOf(c, f);
  const changed = changedAfter(since, by?.at) ? by : undefined;
  // M8: the supplier's soft warning, shown to the reviewers too (never a blocker)
  const hint = f.hint && v !== undefined ? f.hint(v, c) : null;
  const attribution = who(state, by, hasValue(v) || !!just);
  let value: ReactNode;
  if (doc) value = <DocLine d={doc} state={state} />;
  else if (!hasValue(v)) value = <span className="text-ink-3">{just ? "Not provided, justified" : "Not answered"}</span>;
  else value = f.type === "number" || f.type === "decimal" ? `${formatValue(v)}${f.unit ? ` ${f.unit}` : ""}` : formatValue(v);

  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3 transition-colors hover:bg-surface-2/60" data-testid={`field-${f.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
          <span>
            {f.label}
            {f.required !== "optional" && <span className="sr-only"> (required)</span>}
          </span>
          {f.required === "optional" && !f.derivedFrom && <span className="text-[11px]">optional</span>}
          {changed && <ChangedBadge by={changed.by} at={changed.at} state={state} />}
          <OpChips ops={ops} onFocusOp={onFocusOp} />
        </div>
        <div className="mt-0.5 text-[14px] break-words whitespace-pre-line text-ink">{value}</div>
        {lim && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <Badge tone={lim.pass ? "ok" : "bad"} dot>
              {lim.pass ? "Within BDF limit" : "Above BDF limit"}
            </Badge>
            <span>
              Limit ≤ {lim.limit} {lim.unit} · limit set {lim.version}
            </span>
          </div>
        )}
        {hint && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3" data-testid={`hint-${f.id}`}>
            <Badge tone="warn" dot>
              Check
            </Badge>
            <span>{hint}</span>
          </div>
        )}
        {f.derivedFrom && <p className="mt-1 text-[11.5px] text-ink-3">Filled in from {fieldOf(f.derivedFrom, c.templateVersion)?.label ?? f.derivedFrom}.</p>}
        {just && <p className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink-2">Justification: {just}</p>}
        {earlier.length > 0 && <p className="mt-1 text-xs text-ink-3">Earlier uploads: {earlier.map((d) => `${d.name} (${fmtDate(d.uploadedAt)})`).join(", ")}</p>}
        {atField.length > 0 && (
          <div className="mt-1.5 space-y-1 text-[13px]">
            {atField.map((d) => (
              <DocLine key={d.id} d={d} state={state} />
            ))}
          </div>
        )}
        {attribution && <p className="mt-1 text-[11.5px] text-ink-3">{attribution}</p>}
      </div>
      {/* Beiersdorf sets the trade name, supplier, DUNS and contact e-mails at case start: the supplier cannot change them, so nobody asks about them. */}
      {/* A derived field is asked about at its source (the supplier can only change it there). */}
      <div className="pt-0.5">{canAsk && !isSetByBdf(c, f.id) && !f.derivedFrom && <AskButton label={`Ask supplier about ${f.label}`} testId={`ask-field-${f.id}`} onClick={() => onAsk(fieldTarget(f, doc, c.templateVersion))} />}</div>
    </div>
  );
}

export function SectionContent({ c, state, sectionId, mine, canAsk, since, onAsk, onFocusOp }: { c: CiqCase; state: AppState; sectionId: string; mine: boolean; canAsk: boolean; since?: string; onAsk: (t: AskTarget) => void; onFocusOp: (id: string) => void }) {
  // The section and its fields as the case's own questionnaire version defines them (spec §8.1).
  const tv = c.templateVersion;
  const sec = sectionOf(sectionId, tv);
  const sc = scopeOf(c, sectionId);
  if (!sec || !sc) return null;
  const own = state.ownership[sectionId] ?? { lead: sec.lead, co: sec.co };
  const fields = fieldsOf(sectionId, tv).filter((f) => isVisible(f, c));
  const fieldIds = new Set(fields.map((f) => f.id));
  // Files of requested documents are listed with their document below, not as other documents.
  const extraDocs = c.documents.filter((d) => d.sectionId === sectionId && !isSlotKey(d.fieldId) && (!d.fieldId || !fieldIds.has(d.fieldId))).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const sectionOps = c.openPoints.filter((p) => p.ref.sectionId === sectionId && !p.ref.fieldId && !p.ref.rowId && !p.ref.documentId && p.status !== "closed");
  const newest = (d: DocumentRef) => !d.fieldId || !c.documents.some((x) => x.fieldId === d.fieldId && x.uploadedAt > d.uploadedAt);

  return (
    <Card className="min-w-0" data-testid={`section-content-${sectionId}`}>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{codeTitle(sec.code, sec.title)}</span>
            {sec.hasFields ? <ApplicabilityBadge a={sc.applicability} manual={!!sc.manual} /> : <Badge tone="neutral">Documents only · optional</Badge>}
            {sc.addedLater && <Badge tone="brand">Added during the review</Badge>}
          </span>
        }
        subtitle={sec.meaning}
        action={canAsk ? <AskButton label={`Ask supplier about ${sec.code}`} testId={`ask-section-${sectionId}`} onClick={() => onAsk(sectionTarget(sectionId, tv))} /> : undefined}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface-2 px-4 py-2 text-xs text-ink-3">
        <span>
          Lead: <span className="font-medium text-ink-2">{DEPT_SHORT[own.lead]}</span>
          {own.co.length > 0 && <> · Co-review: {own.co.map((d) => DEPT_SHORT[d]).join(", ")}</>}
        </span>
        <span className="min-w-0">Why in scope: {sc.reason}</span>
      </div>

      {!mine && canAsk && (
        <div className="px-4 pt-3">
          <Notice tone="neutral" icon={<Info size={15} />}>
            {DEPT_SHORT[own.lead]} leads this section. You can ask the supplier here too; align with {DEPT_SHORT[own.lead]} in the internal notes so the supplier gets one clear question.
          </Notice>
        </div>
      )}
      {sectionOps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-xs text-ink-3">
          Open points on the whole section: <OpChips ops={sectionOps} onFocusOp={onFocusOp} />
        </div>
      )}

      {sectionId === "K2.1" && (
        <div className="mt-2 border-b border-line">
          <ComponentTable c={c} state={state} since={since} canAsk={canAsk} onAsk={onAsk} onFocusOp={onFocusOp} />
        </div>
      )}

      {sec.hasFields ? (
        fields.length ? (
          <div className="divide-y divide-line">
            {fields.map((f) => (
              <FieldRow key={f.id} c={c} f={f} state={state} since={since} canAsk={canAsk} onAsk={onAsk} onFocusOp={onFocusOp} />
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-ink-3">No question of this section applies to the supplier's answers.</p>
        )
      ) : (
        <div className="px-4 py-4">
          <div className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center">
            <p className="text-[13.5px] font-medium text-ink">Documents only</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-3">The supplier may answer this section with the CIQ template document, a statement or a certificate; the upload is optional and does not block completeness. {extraDocs.length ? "Its documents are listed below." : "No document uploaded."} Questions to the supplier work as usual.</p>
            <div className="mt-2">
              <DemoNote>answers of this section not modelled</DemoNote>
            </div>
          </div>
        </div>
      )}

      <RequestedDocsList
        c={c}
        state={state}
        sectionId={sectionId}
        since={since}
        action={(slot, newest) => (
          <span className="flex flex-col items-end gap-1">
            {canAsk && (
              <AskButton
                label={`Ask supplier about ${slot.doc}`}
                testId={`ask-reqdoc-${slot.key}`}
                onClick={() => onAsk({ ref: { sectionId, fieldId: slot.key, documentId: newest?.id, label: `${secCode(sectionId, tv)} › ${slot.doc}${newest ? ` (${docLabel(newest)})` : ""}` }, defaultKind: "document-request" })}
              />
            )}
            <OpChips ops={c.openPoints.filter((p) => p.ref.fieldId === slot.key && p.status !== "closed")} onFocusOp={onFocusOp} />
          </span>
        )}
      />

      {extraDocs.length > 0 && (
        <div className="border-t border-line">
          <p className="px-4 pt-3 pb-1 text-xs font-medium text-ink-3">{sec.hasFields ? "Other documents in this section" : "Documents"}</p>
          <div className="divide-y divide-line">
            {extraDocs.map((d) => (
              <div key={d.id} className="group flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-surface-2/60">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <DocLine d={d} state={state} earlier={!newest(d)} />
                  {changedAfter(since, d.uploadedAt) && <ChangedBadge by={d.uploadedBy} at={d.uploadedAt} state={state} />}
                </span>
                {canAsk && <AskButton label={`Ask supplier about ${d.name}`} testId={`ask-doc-${d.id}`} onClick={() => onAsk(docTarget(d, d.fieldId ? fieldOf(d.fieldId, tv)?.label : undefined, tv))} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
