// The rule form (spec §8.3): it reads as a sentence. When [question] [is Yes / includes any of …] → then [sections]
// become [Mandatory / Optional / Not applicable], ask for evidence, reviewed by [departments], basis and note. A live
// preview writes the rule in plain words and shows which example materials it applies to.
import { Check, FileText, FileUp, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { Button, Drawer, Field, Select, TextArea, TextInput, cx } from "@/components/ui";
import { CONFIG_BY_ID, CONFIG_QUESTIONS, DEPT_SHORT } from "@/domain/catalog";
import { BASIS_LABEL, OUTCOME_LABEL, evaluateCondition, optionShort, ruleSentence } from "@/domain/conditions";
import { draftPair, draftSideNames, pairLabel, shortTemplate } from "@/domain/configActions";
import { REFERENCE_MATERIALS } from "@/domain/referenceMaterials";
import { alwaysOnSections, uncollectedEvidence, uncollectedText, type UncollectedEvidence } from "@/domain/requestedDocs";
import { EVIDENCE_FIELDS } from "@/domain/rules";
import type { Applicability, ConfigQuestionId, Dept, RuleBasis, SectionData } from "@/domain/types";
import { useStore } from "@/store/store";
import { Choice, DEPT_ORDER, DeptChips, FormBlock, InlineError } from "./controls";
import { CONDITION_MODE_LABEL, addEvidence, conditionOf, emptyRuleForm, hasProblems, modesFor, ruleFormOf, ruleFormProblems, ruleInputOf, withQuestion, type ConditionMode, type RuleForm } from "./editorModel";

const KIND_LABEL = { basic: "Basic data", chapter: "Chapter", annex: "Annex" } as const;

/** Searchable section picker: the chosen sections as chips on top, a filtered list below. */
function SectionPicker({ sections, value, onChange, invalid, codeOf }: { sections: SectionData[]; value: string[]; onChange: (ids: string[]) => void; invalid?: boolean; codeOf: (id: string) => string }) {
  const [q, setQ] = useState("");
  const live = sections.filter((x) => !x.retired);
  const needle = q.trim().toLowerCase();
  const shown = needle ? live.filter((x) => `${x.code} ${x.title} ${x.meaning}`.toLowerCase().includes(needle)) : live;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const byId = new Map(sections.map((x) => [x.id, x]));
  return (
    <div className={cx("rounded-lg border bg-surface", invalid ? "border-bad" : "border-line-strong")}>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 border-b border-line px-2.5 py-2" data-testid="rule-sections-chosen">
        {value.length === 0 ? (
          <span className="text-[13px] text-ink-3">No section chosen yet. Tick sections below.</span>
        ) : (
          value.map((id) => {
            const x = byId.get(id);
            return (
              <span key={id} className={cx("inline-flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-[12.5px] font-medium", x?.retired ? "bg-surface-3 text-ink-3 line-through" : "bg-brand-soft text-brand")} title={x ? `${x.code} · ${x.title}${x.retired ? " (retired in this version)" : ""}` : id}>
                {codeOf(id)}
                <button type="button" aria-label={`Remove ${codeOf(id)}`} onClick={() => toggle(id)} className="rounded p-0.5 hover:bg-brand/10">
                  <X size={12} />
                </button>
              </span>
            );
          })
        )}
      </div>
      <div className="relative border-b border-line">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input
          data-testid="rule-sections-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sections by code or title, e.g. K6.18 or microplastics"
          aria-label="Search sections"
          className="h-9 w-full bg-transparent pr-3 pl-8 text-[13.5px] text-ink placeholder:text-ink-3 focus:outline-none"
        />
      </div>
      <ul className="max-h-56 overflow-y-auto py-1 scrollbar-thin" role="listbox" aria-multiselectable="true" aria-label="Sections">
        {shown.length === 0 && <li className="px-3 py-3 text-[13px] text-ink-3">No section matches “{q.trim()}”.</li>}
        {shown.map((x) => {
          const on = value.includes(x.id);
          return (
            <li key={x.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                data-testid={`rule-section-${x.id}`}
                onClick={() => toggle(x.id)}
                className={cx("flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2", on && "bg-brand-soft/40")}
              >
                <span className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface")}>{on && <Check size={11} strokeWidth={3} />}</span>
                <span className="w-[70px] shrink-0 font-mono text-[12px] text-ink-2">{x.code}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{x.title || <span className="text-ink-3">(no title)</span>}</span>
                <span className="shrink-0 text-[11.5px] text-ink-3">{KIND_LABEL[x.kind]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Evidence the supplier uploads: chips plus an input with suggestions from the other rules. */
function EvidenceChips({ value, onChange, suggestions, uncollected }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; uncollected: UncollectedEvidence[] }) {
  // Known documents (each collected by an upload question) are offered as chips to tick; anything else can be typed.
  // A document no question collects is handled too: the supplier gets an upload slot for it under "Requested
  // documents" (spec §8.5), so the form only says where.
  const known = suggestions;
  const other = value.filter((e) => !known.includes(e));
  const [text, setText] = useState("");
  const toggle = (doc: string) => onChange(value.includes(doc) ? value.filter((x) => x !== doc) : [...value, doc]);
  const add = () => {
    onChange(addEvidence(value, text));
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-[12.5px] text-ink-3">{value.length ? `${value.length} selected · tick or untick` : "Tick the documents the supplier must upload"}</div>
        <div className="flex flex-wrap gap-1.5" data-testid="rule-evidence-options">
          {known.map((doc, i) => {
            const on = value.includes(doc);
            return (
              <button
                type="button"
                key={doc}
                aria-pressed={on}
                data-testid={`rule-evidence-option-${i}`}
                data-doc={doc}
                onClick={() => toggle(doc)}
                className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors", on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3")}
              >
                {on ? <Check size={13} /> : <FileText size={13} className="text-ink-3" />}
                {doc}
              </button>
            );
          })}
        </div>
      </div>
      {other.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" data-testid="rule-evidence-list">
          {other.map((e) => (
            <li key={e} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 py-0.5 pr-1 pl-2.5 text-[12.5px] text-ink">
              <FileText size={12} className="text-ink-3" />
              {e}
              <button type="button" data-testid={`rule-evidence-remove-${value.indexOf(e)}`} aria-label={`Remove ${e}`} onClick={() => onChange(value.filter((x) => x !== e))} className="rounded-full p-0.5 text-ink-3 hover:bg-surface-3 hover:text-ink">
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <div className="mb-1.5 text-[12.5px] text-ink-3">Not in the list?</div>
        <div className="flex gap-2">
          <TextInput data-testid="rule-evidence-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="Name of another document" aria-label="Another document to ask for" className="flex-1" />
          <Button data-testid="rule-evidence-add" icon={<Plus size={14} />} onClick={add} disabled={!text.trim()}>
            Add
          </Button>
        </div>
      </div>
      {uncollected.length > 0 && (
        <ul data-testid="rule-evidence-uncollected" className="space-y-1 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
          {uncollected.map((u) => (
            <li key={u.doc} className="flex items-start gap-1.5" data-testid="rule-evidence-slot" data-doc={u.doc} data-section={u.sectionId}>
              <FileUp size={13} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span>{uncollectedText(u)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The answers of a multiple-choice question as toggle chips (`rule-value-<value>`). */
function ValueChips({ question, value, onChange, invalid }: { question: ConfigQuestionId; value: string[]; onChange: (v: string[]) => void; invalid?: boolean }) {
  const opts = CONFIG_BY_ID[question]?.options ?? [];
  return (
    <div className={cx("flex flex-wrap gap-1.5 rounded-lg", invalid && "ring-2 ring-bad/25 ring-offset-2 ring-offset-surface")}>
      {opts.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            data-testid={`rule-value-${o.value}`}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cx("rounded-full border px-3 py-1 text-[13px] transition-colors", on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface RuleEditorTarget {
  /** Edit this rule of the draft; leave out for a new rule. */
  ruleId?: string;
  /** Sections a new rule starts with ("Create the rule" from a new section). */
  sections?: string[];
}

/** The rule form in a drawer. Render with a `key` per target so the form starts fresh. */
export function RuleEditorDrawer({ target, onClose, onSaved }: { target: RuleEditorTarget; onClose: () => void; onSaved?: (id: string) => void }) {
  const { state, upsertRule } = useStore();
  const draft = draftPair(state);
  const existing = target.ruleId ? draft?.ruleSet.rules.find((r) => r.id === target.ruleId) : undefined;
  // A rule opened from a section starts with the section's lead department as reviewer (review tasks follow the lead).
  const [initial] = useState<RuleForm>(() => {
    if (existing) return ruleFormOf(existing);
    const leads = (target.sections ?? []).map((id) => draft?.template.sections.find((x) => x.id === id)?.lead).filter((d): d is Dept => !!d);
    return emptyRuleForm(target.sections ?? [], [...new Set(leads)]);
  });
  const [f, setF] = useState<RuleForm>(initial);
  const [tried, setTried] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const sections = useMemo(() => draft?.template.sections ?? [], [draft]);
  const liveIds = useMemo(() => new Set(sections.filter((x) => !x.retired).map((x) => x.id)), [sections]);
  const codeOf = useMemo(() => {
    const m = new Map(sections.map((x) => [x.id, x.code]));
    return (id: string) => m.get(id) ?? id;
  }, [sections]);
  const suggestions = useMemo(() => [...new Set([...Object.keys(EVIDENCE_FIELDS), ...(draft?.ruleSet.rules ?? []).flatMap((r) => r.evidence ?? [])])].sort((a, b) => a.localeCompare(b)), [draft]);

  if (!draft) return null;
  const problems = ruleFormProblems(f, liveIds);
  const show = tried ? problems : {};
  const cond = conditionOf(f);
  const sentence = cond && !problems.answer ? ruleSentence({ condition: cond, activates: f.activates.filter((id) => liveIds.has(id)), outcome: f.outcome, evidence: f.evidence, departments: f.departments, flagsCase: f.flagsCase }, codeOf, (id) => sections.find((x) => x.id === id)?.title) : null;
  const applies = cond && !problems.answer ? REFERENCE_MATERIALS.filter((m) => evaluateCondition(cond, m.config)) : [];
  const set = (patch: Partial<RuleForm>) => setF((x) => ({ ...x, ...patch }));
  const modes = modesFor(f.question);
  const q = f.question && f.question !== "ALWAYS" ? CONFIG_BY_ID[f.question] : undefined;
  const liveChosen = f.activates.map((id) => sections.find((x) => x.id === id)).filter((x): x is SectionData => !!x && !x.retired);
  const reviewLine = liveChosen.length
    ? `${liveChosen.length === 1 ? "The review task goes to the section's lead department" : "Review tasks go to each section's lead department"}: ${liveChosen.map((x) => `${x.code} → ${DEPT_SHORT[x.lead]}`).join("; ")}.`
    : "";

  const save = () => {
    setTried(true);
    if (hasProblems(problems)) return;
    const id = upsertRule(ruleInputOf(f));
    if (id) {
      onSaved?.(id);
      onClose();
    }
  };

  const basisOptions: RuleBasis[] = f.basis === "open" ? ["document", "agreed", "not-stated", "open"] : ["document", "agreed", "not-stated"];
  const outcomeOptions: { value: Applicability; label: string }[] = (["mandatory", "optional", "na"] as Applicability[]).map((v) => ({ value: v, label: OUTCOME_LABEL[v] }));
  const errorSummary = tried && hasProblems(problems) ? Object.values(problems).join(" ") : "";

  return (
    <Drawer
      open
      onClose={onClose}
      dismissible={!dirty}
      width={720}
      data-testid="rule-form"
      title={existing ? `Edit rule ${existing.id}` : "Add rule"}
      subtitle={`In the draft (copied from ${pairLabel(draft.basedOn.ruleSetVersion, draft.basedOn.templateVersion)}). Published versions and running cases do not change.`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {errorSummary && (
            <p data-testid="rule-error" role="alert" className="mr-auto max-w-md text-[12.5px] font-medium text-bad">
              {errorSummary}
            </p>
          )}
          <Button data-testid="rule-cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button data-testid="rule-save" variant="primary" onClick={save}>
            {existing ? "Save changes" : "Add rule"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <FormBlock label="When" hint="The answer that switches the rule on.">
          <Field label="Question" error={show.question}>
            <Select
              data-testid="rule-question"
              value={f.question}
              invalid={!!show.question}
              onChange={(e) => setF((x) => withQuestion(x, e.target.value as RuleForm["question"]))}
            >
              <option value="">Choose a question…</option>
              <option value="ALWAYS">Every case, whatever the answers</option>
              <optgroup label="Answered by the supplier">
                {CONFIG_QUESTIONS.filter((x) => x.answeredBy === "supplier").map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Set by Beiersdorf at case start">
                {CONFIG_QUESTIONS.filter((x) => x.answeredBy === "rmm").map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.label}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>

          {f.question === "ALWAYS" && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">This rule applies to every case, whatever the supplier answers.</p>}

          {q && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-ink-2">The answer</span>
                <Choice<ConditionMode>
                  data-testid="rule-condition"
                  aria-label="How the answer is compared"
                  value={f.mode}
                  onChange={(mode) => set({ mode })}
                  options={modes.map((m) => ({ value: m, label: CONDITION_MODE_LABEL[m], hint: m === "yes-or-unanswered" ? "Also applies while the question is not answered yet" : undefined }))}
                />
              </div>
              {q.kind === "multi" && (
                <>
                  <ValueChips question={q.id} value={f.values} onChange={(values) => set({ values })} invalid={!!show.answer} />
                  <p className="text-[12.5px] text-ink-3">
                    {f.mode === "includes-any"
                      ? "The rule applies when at least one of the ticked answers is chosen."
                      : `The rule applies when any answer other than the ticked ones is chosen${f.values.length ? `, e.g. ${optionShort(q.id, (q.options ?? []).find((o) => !f.values.includes(o.value))?.value ?? "")}` : ""}.`}
                  </p>
                </>
              )}
              <InlineError>{show.answer}</InlineError>
            </div>
          )}
        </FormBlock>

        <FormBlock label="Then" hint="The sections the supplier gets, and what they become.">
          <SectionPicker sections={sections} value={f.activates} onChange={(activates) => set({ activates })} invalid={!!show.sections} codeOf={codeOf} />
          <InlineError>{show.sections}</InlineError>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[13px] text-ink-2">{f.activates.length === 1 ? "It becomes" : "They become"}</span>
            <Choice<Applicability> data-testid="rule-outcome" aria-label="Outcome" value={f.outcome} onChange={(outcome) => set({ outcome })} options={outcomeOptions} />
          </div>
          {f.outcome === "na" && <p className="text-[12.5px] text-ink-3">“Not applicable” never wins over another rule that makes the section mandatory or optional: the strictest outcome wins.</p>}
        </FormBlock>

        {f.flagsCase && (
          <p data-testid="rule-flags-note" className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            This rule flags the case for RMM. Which origins count as having no rules yet (Waste, CCU and Chemical recycling) is fixed in this version: editing this rule does not change that list.
          </p>
        )}

        <FormBlock label="Ask for evidence" hint="Optional. Documents the supplier uploads when the rule applies.">
          <EvidenceChips value={f.evidence} onChange={(evidence) => set({ evidence })} suggestions={suggestions} uncollected={uncollectedEvidence(f.evidence, f.activates, draft.template, { outcome: f.outcome, alwaysOn: alwaysOnSections(draft.ruleSet.rules.filter((r) => r.id !== target.ruleId)) })} />
        </FormBlock>

        <FormBlock label="Reviewed by" hint="The departments that review what this rule asks for. Review tasks go to each section's lead department, set on the Questionnaire page.">
          <DeptChips value={f.departments} onChange={(departments) => set({ departments })} options={DEPT_ORDER} testPrefix="rule-dept" invalid={!!show.departments} />
          <InlineError>{show.departments}</InlineError>
        </FormBlock>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Basis" hint="Where the rule comes from.">
            <Select data-testid="rule-basis" value={f.basis} onChange={(e) => set({ basis: e.target.value as RuleBasis })}>
              {basisOptions.map((b) => (
                <option key={b} value={b}>
                  {b === "open" ? "Optional for every case" : BASIS_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" hint="Optional. Shown under the rule.">
            <TextArea data-testid="rule-note" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Why the rule exists" className="min-h-9" />
          </Field>
        </div>

        {/* The preview stays in view at the bottom while the form scrolls. */}
        <div className="-mx-5 border-t border-line bg-surface px-5 pt-3 sm:sticky sm:-bottom-4 sm:z-10 sm:pb-4">
          <div data-testid="rule-preview" className="rounded-xl border border-brand/25 bg-brand-soft px-4 py-3">
            <div className="text-xs font-semibold tracking-wide text-brand uppercase">Preview</div>
            <p className="mt-1 text-[14px] leading-relaxed text-ink" data-testid="rule-preview-sentence">
              {sentence ?? (f.question ? "Tick the answers above to see the rule as a sentence." : "Choose a question to see the rule as a sentence.")}
            </p>
            {cond && !problems.answer && (
              <p className="mt-2 line-clamp-2 text-[12.5px] text-ink-2" data-testid="rule-preview-materials" data-count={applies.length} title={applies.map((m) => m.label).join("; ")}>
                {applies.length === 0
                  ? `It applies to none of the ${REFERENCE_MATERIALS.length} example materials used in “Test rules”.`
                  : `It applies to ${applies.length} of the ${REFERENCE_MATERIALS.length} example materials: ${applies.map((m) => m.label).join("; ")}.`}
              </p>
            )}
            {reviewLine && (
              <p className="mt-2 text-[12.5px] text-ink-2" data-testid="rule-preview-review">
                {reviewLine}
              </p>
            )}
            {f.activates.some((id) => !liveIds.has(id)) && <p className="mt-2 text-[12.5px] text-ink-2">Crossed-out sections are retired in questionnaire {shortTemplate(draftSideNames(state)?.template.shown ?? draft.template.version)}: the rule no longer opens them.</p>}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
