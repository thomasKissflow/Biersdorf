// The metadata questions as the questionnaire's second General entry (D-1, live-scope cases only, ?s=SF). Every
// answer goes to saveConfig, and the store re-derives the scope: before the completeness confirmation sections open
// and close freely (answers in a closed section are kept); after it a changed answer only adds sections. The note
// under the answered question is read from the store's result, so the rule itself stays in the domain.
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Card, ProgressBar, cx } from "@/components/ui";
import { fieldsOf } from "@/domain/catalog";
import { deriveScope, hasUndefinedOrigin } from "@/domain/rules";
import type { CiqCase, ConfigAnswers, ConfigQuestionId } from "@/domain/types";
import { useStore } from "@/store/store";
import { ConfigQuestionList } from "./ConfigQuestions";
import { FieldRenderer } from "./FieldRenderer";
import { METADATA_SECTION, WAIVER_FIELD, isPart2, metadataProgress, sectionCode, sectionDelta, sectionMeta, sectionTitle, supplierSections, type SectionDelta, type SupplierSection } from "./lib";
import { LockedNote, SectionDeltaNote, UndefinedOriginNote } from "./parts";
import { ScopePreview, UNDEFINED_ORIGIN_NOTE } from "./ScopePreview";

export function MetadataQuestions({
  c,
  locked,
  focusField,
  prev,
  next,
  onSelect,
}: {
  c: CiqCase;
  locked: boolean;
  focusField: string | null;
  prev?: SupplierSection;
  next?: SupplierSection;
  onSelect: (sectionId: string) => void;
}) {
  const { saveConfig } = useStore();
  const def = sectionMeta(METADATA_SECTION);
  const p = metadataProgress(c);
  const complete = p.done >= p.total;
  const part2 = isPart2(c);
  const pending = useRef<{ q: ConfigQuestionId; before: SupplierSection[]; predicted: SupplierSection[] } | null>(null);
  const [note, setNote] = useState<{ q: ConfigQuestionId; d: SectionDelta } | null>(null);

  const answer = (q: ConfigQuestionId, patch: ConfigAnswers) => {
    const config = { ...c.config, ...patch, SF11: c.config.SF11 };
    // What the rules alone would give: after completeness the store keeps what they would close (scope only grows).
    pending.current = { q, before: supplierSections(c), predicted: supplierSections({ config, scope: deriveScope(config, c.ruleSetVersion, c.templateVersion) }) };
    saveConfig(c.id, patch);
  };

  // The store applies the answer synchronously; compare once the case comes back with its new scope.
  useEffect(() => {
    const pend = pending.current;
    if (!pend) return;
    pending.current = null;
    setNote({ q: pend.q, d: sectionDelta(pend.before, supplierSections(c), part2 ? pend.predicted : undefined) });
  }, [c.scope, c.config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump target of the completeness check (?s=SF&f=SF01).
  useEffect(() => {
    if (!focusField) return;
    const t = setTimeout(() => document.getElementById(`cfg-${focusField}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    return () => clearTimeout(t);
  }, [focusField]);

  const origin = hasUndefinedOrigin(c.config) ? <UndefinedOriginNote>{UNDEFINED_ORIGIN_NOTE}</UndefinedOriginNote> : null;
  const delta = note && <SectionDeltaNote delta={note.d} part2={part2} templateVersion={c.templateVersion} onSelect={onSelect} />;
  const notes: Partial<Record<ConfigQuestionId, ReactNode>> = {};
  if (origin) notes.SF01 = origin;
  if (delta) notes[note.q] = note.q === "SF01" && origin ? <div className="space-y-2">{delta}{origin}</div> : delta;
  // SF-12 = No: the waiver needs a written justification; the box sits right under the question (also shown in K5.1).
  const waiver = c.config.SF12 === false ? fieldsOf("K5.1", c.templateVersion).find((f) => f.id === WAIVER_FIELD) : undefined;
  if (waiver) {
    const box = (
      <div className="-mx-1 rounded-lg border border-line bg-surface" data-testid="sf12-waiver">
        <FieldRenderer c={c} f={waiver} editable={!locked} asJustification />
      </div>
    );
    notes.SF12 = notes.SF12 ? <div className="space-y-2">{notes.SF12}{box}</div> : box;
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] text-ink-3">Metadata</span>
                <Badge tone="brand">Mandatory</Badge>
              </div>
              <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-ink">{def.title}</h2>
              <p className="mt-0.5 text-[13px] text-ink-3">{def.meaning}</p>
            </div>
            <div className="w-full shrink-0 sm:w-40 sm:text-right">
              <p className={cx("text-[12.5px]", complete ? "font-medium text-ok" : "text-ink-2")}>
                {complete ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={14} /> All answered
                  </span>
                ) : (
                  `${p.done} of ${p.total} answered`
                )}
              </p>
              <ProgressBar className="mt-1.5 max-w-60 sm:max-w-none" value={p.done} max={p.total} tone={complete ? "ok" : "brand"} />
            </div>
          </div>
          <div className="mt-3">
            {locked ? (
              <LockedNote>{c.phase === "completed" ? "Frozen with your final release" : c.phase === "final-release" ? "Locked: Beiersdorf has requested your final release" : c.phase === "cancelled" ? "Read-only: this request is closed" : "Read-only"}</LockedNote>
            ) : (
              <p className="text-[12.5px] text-ink-2">
                {part2
                  ? "You confirmed completeness. A changed answer can now only add sections; nothing Beiersdorf is reviewing is removed."
                  : "The sections of your questionnaire open and close as you answer. Answers in a section that closes are kept and come back if it reopens."}
              </p>
            )}
          </div>
        </div>

        <ConfigQuestionList c={c} editable={!locked} attempted={false} focusId={focusField} notes={notes} onAnswer={answer} />

        {(prev || next) && (
          <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
            {prev ? (
              <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => onSelect(prev.sectionId)}>
                {sectionCode(prev.sectionId, c.templateVersion)}
              </Button>
            ) : (
              <span />
            )}
            {next && (
              <Button variant="secondary" size="sm" className="min-w-0" title={`${sectionCode(next.sectionId, c.templateVersion)} · ${sectionTitle(next.sectionId, c.templateVersion)}`} iconRight={<ArrowRight size={14} className="shrink-0" />} onClick={() => onSelect(next.sectionId)}>
                <span className="truncate">
                  Next: {sectionCode(next.sectionId, c.templateVersion)}
                  <span className="hidden sm:inline"> · {sectionTitle(next.sectionId, c.templateVersion)}</span>
                </span>
              </Button>
            )}
          </div>
        )}
      </Card>

      {!locked && <ScopePreview c={c} scope={c.scope} embedded />}
    </div>
  );
}
