// The metadata (configuration) questions SF-01…SF-12 as one numbered list, shared by the live portal's basic-data step
// (MetadataStep, old flow) and the questionnaire's metadata entry (MetadataQuestions, D-1). SF-11 is Beiersdorf's and
// always read-only. Row ids (cfg-SF01 …) are the jump targets of the completeness check.
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, ChipMulti, Segmented, cx, useProduction } from "@/components/ui";
import { CONFIG_QUESTIONS, MARKET_LABEL, type ConfigQuestion } from "@/domain/catalog";
import type { CiqCase, ConfigAnswers, ConfigQuestionId } from "@/domain/types";
import { REQUIRED_CONFIG, isConfigAnswered } from "./lib";

export function ConfigQuestionList({
  c,
  editable,
  attempted,
  focusId,
  notes,
  onAnswer,
}: {
  c: CiqCase;
  editable: boolean;
  /** Flag unanswered required questions in the bad tone (after a failed submit). */
  attempted: boolean;
  focusId?: string | null;
  /** Extra content under a question, e.g. what the last answer opened or closed. */
  notes?: Partial<Record<ConfigQuestionId, ReactNode>>;
  onAnswer: (id: ConfigQuestionId, patch: ConfigAnswers) => void;
}) {
  const production = useProduction(); // question codes (SF-xx) only with the prototype notes on
  const supplierQs = CONFIG_QUESTIONS.filter((q) => q.answeredBy === "supplier");
  const bdfQs = CONFIG_QUESTIONS.filter((q) => q.answeredBy === "rmm");
  return (
    <ol className="divide-y divide-line">
      {supplierQs.map((q, i) => (
        <ConfigRow key={q.id} c={c} q={q} n={i + 1} editable={editable} attempted={attempted} focused={focusId === q.id} note={notes?.[q.id]} onAnswer={onAnswer} />
      ))}
      {bdfQs.map((q) => (
        <li key={q.id} id={`cfg-${q.id}`} className="scroll-mt-40 px-5 py-4" data-testid={`q-config-${q.id}`} data-answered={c.config.SF11?.length ? "true" : "false"}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
                <Lock size={13} className="text-ink-3" /> Target markets set by Beiersdorf
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">Beiersdorf decides where the raw material will be used. Some markets add chapters (for example UK REACH).</p>
            </div>
            {!production && <span className="shrink-0 font-mono text-[11px] text-ink-3">{q.code}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(c.config.SF11 ?? []).map((m) => (
              <Badge key={m} tone="neutral">
                {MARKET_LABEL[m]}
              </Badge>
            ))}
            {!c.config.SF11?.length && <span className="text-[13px] text-ink-3">Not set yet</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ConfigRow({ c, q, n, editable, attempted, focused, note, onAnswer }: { c: CiqCase; q: ConfigQuestion; n: number; editable: boolean; attempted: boolean; focused: boolean; note?: ReactNode; onAnswer: (id: ConfigQuestionId, patch: ConfigAnswers) => void }) {
  const production = useProduction();
  const required = REQUIRED_CONFIG.includes(q.id);
  const done = isConfigAnswered(c, q.id);
  const flag = required && !done;
  const save = (patch: ConfigAnswers) => onAnswer(q.id, patch);
  const value = c.config[q.id];
  return (
    <li id={`cfg-${q.id}`} className={cx("scroll-mt-40 px-5 py-4 transition-colors", focused && "bg-brand-soft/50")} data-testid={`q-config-${q.id}`} data-required={required ? "true" : "false"} data-answered={done ? "true" : "false"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-ink">
            <span className="mr-1.5 text-ink-3">{n}.</span>
            {q.label}
            {required ? <span className="ml-0.5 text-bad">*</span> : <span className="ml-1.5 text-[12px] font-normal text-ink-3">(optional)</span>}
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">{q.help}</p>
        </div>
        {!production && (
          <span className="shrink-0 font-mono text-[11px] text-ink-3" title="Configuration question id">
            {q.code}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        {q.kind === "multi" ? (
          <ChipMulti value={Array.isArray(value) ? (value as string[]) : []} onChange={(v) => save({ [q.id]: v } as ConfigAnswers)} options={q.options ?? []} disabled={!editable} />
        ) : (
          <Segmented<boolean>
            value={typeof value === "boolean" ? value : undefined}
            onChange={(v) => save({ [q.id]: v } as ConfigAnswers)}
            options={[
              { value: true, label: "Yes" },
              { value: false, label: "No" },
            ]}
            disabled={!editable}
          />
        )}
        {flag && <span className={cx("text-[12px]", attempted ? "font-medium text-bad" : "text-ink-3")}>Not answered yet</span>}
      </div>
      {note && <div className="mt-3">{note}</div>}
    </li>
  );
}
