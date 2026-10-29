// The questionnaire editor of the draft (spec §8.3): the section form, the section editor with its question list
// (add, edit, reorder, remove), the question form with a live preview of what the supplier sees, and the hint that a
// new section needs a rule that switches it on. One task per dialog; every change is saved into the draft at once.
import { ArrowDown, ArrowUp, FileText, ListPlus, Pencil, Plus, RotateCcw, Settings2, Trash2, Wand2, X } from "lucide-react";
import { useState } from "react";
import { Button, ChipMulti, Drawer, EmptyState, Field, FileDrop, IconButton, KeyValue, Modal, Segmented, Select, TextArea, TextInput, cx } from "@/components/ui";
import { ApplicabilityBadge } from "@/components/status";
import { DEPT_LABEL, DEPT_SHORT, isChoiceType, isNumberType } from "@/domain/catalog";
import { ruleSentence } from "@/domain/conditions";
import { draftPair, draftSideNames, fieldMark, normalizeSectionCode, rulesPointingAt, sectionMark, shortTemplate } from "@/domain/configActions";
import { uploadsMandatory } from "@/domain/requestedDocs";
import type { Dept, FieldType, SectionData, SectionKind } from "@/domain/types";
import { useStore } from "@/store/store";
import { Choice, DEPT_ORDER, DeptChips, MarkBadge } from "./controls";
import { emptyFieldForm, emptySectionForm, fieldFormOf, fieldFormProblems, fieldInputOf, hasProblems, kindFromCode, sectionCodeDuplicateOf, sectionFormOf, sectionFormProblems, sectionInputOf, withType, type FieldForm, type SectionForm } from "./editorModel";
import { EDITOR_FIELD_TYPES, FIELD_TYPE_HINT, FIELD_TYPE_LABEL, REQUIRED_LABEL, UPLOADS_HINT, documentsContent } from "./fieldTypes";
import { Callout } from "./shared";

export const KIND_LABEL: Record<SectionKind, string> = { basic: "Basic data", chapter: "Chapter", annex: "Annex" };

// ---------------------------------------------------------------------------------- section form

/** Add a section, or change the settings of one. `sectionId`: edit that draft section; leave out for a new one. */
export function SectionFormModal({ sectionId, onClose, onSaved }: { sectionId?: string; onClose: () => void; onSaved?: (id: string, isNew: boolean) => void }) {
  const { state, upsertSection } = useStore();
  const draft = draftPair(state);
  const existing = sectionId ? draft?.template.sections.find((x) => x.id === sectionId) : undefined;
  const [initial] = useState<SectionForm>(() => (existing ? sectionFormOf(existing) : emptySectionForm()));
  const [f, setF] = useState<SectionForm>(initial);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const [kindTouched, setKindTouched] = useState(!!existing);
  const [tried, setTried] = useState(false);
  if (!draft) return null;
  const problems = sectionFormProblems(f, state.config);
  // A code another section already uses (any version, written any way) shows while typing and keeps Save disabled;
  // the other checks show after a first Save.
  const duplicate = sectionCodeDuplicateOf(f, state.config);
  const show: typeof problems = tried ? problems : duplicate ? { code: duplicate } : {};
  const set = (patch: Partial<SectionForm>) => setF((x) => ({ ...x, ...patch }));
  const kinds: SectionKind[] = f.kind === "basic" ? ["basic"] : ["chapter", "annex"];
  const savedAs = normalizeSectionCode(f.code);
  const codeHint = savedAs && savedAs !== f.code.trim() ? `Saved as ${savedAs}` : "e.g. K6.18 or Annex 14";

  const save = () => {
    setTried(true);
    if (duplicate || hasProblems(problems)) return;
    const id = upsertSection(sectionInputOf(f));
    if (id) {
      onSaved?.(id, !existing);
      onClose();
    }
  };

  return (
    <Modal
      data-testid="section-form"
      open
      onClose={onClose}
      dismissible={!dirty}
      title={existing ? `Section settings · ${existing.code}` : "Add section"}
      subtitle={
        existing
          ? "Changes apply to new cases on the draft version. A changed lead department or co-reviewers also become the Section owners setting when you publish, which running cases follow too."
          : `A new section in questionnaire ${shortTemplate(draft.template.version)}. Next, add its questions and the rule that switches it on.`
      }
      footer={
        <>
          <Button data-testid="section-cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button data-testid="section-save" variant="primary" disabled={!!duplicate} title={duplicate ? "Choose a code no other section uses" : undefined} onClick={save}>
            {existing ? "Save changes" : "Add section"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
            <Field label="Code" required hint={!show.code ? codeHint : undefined}>
              <TextInput
                data-testid="section-code"
                value={f.code}
                invalid={!!show.code}
                aria-describedby={show.code ? "section-code-error" : undefined}
                onChange={(e) => set({ code: e.target.value, ...(kindTouched ? {} : { kind: kindFromCode(e.target.value) }) })}
              />
            </Field>
            <Field label="Title" required error={show.title}>
              <TextInput data-testid="section-title" value={f.title} invalid={!!show.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
          </div>
          {/* The code's message spans the form: a duplicate names the section and where it is used. */}
          {show.code && (
            <p id="section-code-error" data-testid="section-code-error" data-duplicate={duplicate ? "true" : "false"} role="alert" className="mt-1.5 text-xs font-medium text-bad">
              {show.code}
            </p>
          )}
        </div>
        <Field label="Kind">
          <Choice<SectionKind>
            data-testid="section-kind"
            aria-label="Kind"
            value={f.kind}
            onChange={(kind) => {
              setKindTouched(true);
              set({ kind });
            }}
            options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
        </Field>
        <Field label="What does this section cover?" hint="One or two sentences for the reviewers, e.g. which regulation it serves.">
          <TextArea data-testid="section-meaning" rows={2} value={f.meaning} onChange={(e) => set({ meaning: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lead department" hint={existing ? "Reviews the section and owns its decision. On publish, a change here also applies to running cases." : "Reviews the section and owns its decision. Review tasks go here."}>
            <Select data-testid="section-lead" value={f.lead} onChange={(e) => set({ lead: e.target.value as Dept, co: f.co.filter((d) => d !== e.target.value) })}>
              {DEPT_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DEPT_LABEL[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Co-reviewers" hint="Optional. Review the section as well.">
            <DeptChips value={f.co} onChange={(co) => set({ co })} options={DEPT_ORDER.filter((d) => d !== f.lead)} testPrefix="section-co" />
          </Field>
        </div>
        <Field label="Content" error={show.content}>
          <div className="space-y-1.5">
            <Choice<"questions" | "documents">
              data-testid="section-content"
              aria-label="Content"
              value={f.documentsOnly ? "documents" : "questions"}
              onChange={(v) => set({ documentsOnly: v === "documents" })}
              options={[
                { value: "questions", label: "Questions" },
                { value: "documents", label: "Documents only" },
              ]}
            />
            <p className="text-[12.5px] text-ink-3">{f.documentsOnly ? "The supplier uploads the documents the section asks for; there are no questions to answer." : "The supplier answers the questions you add to the section."}</p>
          </div>
        </Field>
        {f.documentsOnly && (
          <Field label="Upload required?">
            <div className="space-y-1.5">
              <Choice<"mandatory" | "optional">
                data-testid="section-uploads"
                aria-label="Upload required?"
                value={f.uploads}
                onChange={(uploads) => set({ uploads })}
                options={[
                  { value: "mandatory", label: REQUIRED_LABEL.mandatory },
                  { value: "optional", label: REQUIRED_LABEL.optional },
                ]}
              />
              <p className="text-[12.5px] text-ink-3" data-testid="section-uploads-hint">
                {UPLOADS_HINT[f.uploads]}
              </p>
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------- question preview

/** The question as the supplier sees it in the questionnaire (try it: nothing is saved). */
export function FieldPreview({ f }: { f: FieldForm }) {
  const [text, setText] = useState("");
  const [yes, setYes] = useState<boolean | undefined>(undefined);
  const [pick, setPick] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const [file, setFile] = useState<string | undefined>(undefined);
  const required = f.required !== "optional";
  const options = f.options.filter((o) => o.label.trim()).map((o) => ({ value: o.label.trim(), label: o.label.trim() }));
  const unit = isNumberType(f.type) && !f.noUnit ? f.unit.trim() : "";
  const label = f.label.trim() || "Your question appears here";

  let control: React.ReactNode;
  switch (f.type) {
    case "yesno":
      control = (
        <Segmented<boolean>
          value={yes}
          onChange={setYes}
          options={[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ]}
        />
      );
      break;
    case "single":
      control = options.length ? (
        <Select className="max-w-md" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={label}>
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : (
        <p className="text-[12.5px] text-ink-3">Add options to see the list.</p>
      );
      break;
    case "multi":
      control = options.length ? <ChipMulti value={picks} onChange={setPicks} options={options} /> : <p className="text-[12.5px] text-ink-3">Add options to see them.</p>;
      break;
    case "file":
      control = <FileDrop onFile={(name) => setFile(name)} current={file ? { name: file, meta: "Preview only, nothing is uploaded" } : undefined} />;
      break;
    case "longtext":
      control = <TextArea value={text} onChange={(e) => setText(e.target.value)} aria-label={label} />;
      break;
    case "range":
      control = (
        <div className="flex items-center gap-2">
          <TextInput className="w-24" inputMode="decimal" aria-label="Minimum" placeholder="min" />
          <span className="text-ink-3">–</span>
          <TextInput className="w-24" inputMode="decimal" aria-label="Maximum" placeholder="max" />
          <span className="text-[13px] text-ink-3">%</span>
        </div>
      );
      break;
    default:
      control = (
        <div className="flex max-w-md items-center gap-2">
          <TextInput type={f.type === "email" ? "email" : "text"} inputMode={isNumberType(f.type) ? "decimal" : undefined} value={text} onChange={(e) => setText(e.target.value)} className={isNumberType(f.type) ? "max-w-44" : undefined} aria-label={label} />
          {unit && <span className="text-[13px] whitespace-nowrap text-ink-3">{unit}</span>}
        </div>
      );
  }

  return (
    <div data-testid="field-preview" className="rounded-xl border border-line bg-surface shadow-card">
      <div className="border-b border-line px-4 py-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">As the supplier sees it</div>
      <div className="px-4 py-4">
        <label className={cx("text-[13.5px] font-medium", f.label.trim() ? "text-ink" : "text-ink-3 italic")}>
          {label}
          {required && (
            <span className="ml-0.5 text-bad" aria-label="required">
              *
            </span>
          )}
        </label>
        {f.help.trim() && <p className="mt-0.5 text-[12.5px] text-ink-3">{f.help.trim()}</p>}
        <div className="mt-2">{control}</div>
        <p className="mt-3 text-[12px] text-ink-3">{required ? "Mandatory: when the section is mandatory for the case, the supplier cannot confirm completeness without it (or a justification)." : "Optional: the supplier may leave it empty."}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------- question form

/** Add a question to a draft section, or change one. */
export function FieldFormModal({ sectionId, fieldId, onClose }: { sectionId: string; fieldId?: string; onClose: () => void }) {
  const { state, upsertField } = useStore();
  const draft = draftPair(state);
  const sec = draft?.template.sections.find((x) => x.id === sectionId);
  const existing = fieldId ? sec?.fields.find((x) => x.id === fieldId) : undefined;
  const [initial] = useState<FieldForm>(() => (existing ? fieldFormOf(existing) : emptyFieldForm(sec?.lead ?? "REG")));
  const [f, setF] = useState<FieldForm>(initial);
  const [tried, setTried] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  if (!draft || !sec) return null;
  const problems = fieldFormProblems(f);
  const show = tried ? problems : {};
  const set = (patch: Partial<FieldForm>) => setF((x) => ({ ...x, ...patch }));
  const requiredOptions = f.required === "conditional" ? (["mandatory", "optional", "conditional"] as const) : (["mandatory", "optional"] as const);

  const save = () => {
    setTried(true);
    if (hasProblems(problems)) return;
    if (upsertField(sectionId, fieldInputOf(f))) onClose();
  };

  return (
    <Modal
      data-testid="field-form"
      open
      wide
      onClose={onClose}
      dismissible={!dirty}
      title={existing ? "Edit question" : `Add a question to ${sec.code}`}
      subtitle={existing ? `${sec.code} · ${sec.title}` : sec.title}
      footer={
        <>
          <Button data-testid="field-cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button data-testid="field-save" variant="primary" onClick={save}>
            {existing ? "Save changes" : "Add question"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <Field label="Question" required error={show.label}>
            <TextInput data-testid="field-label" value={f.label} invalid={!!show.label} placeholder="e.g. Does the material contain intentionally added microplastics?" onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label="Answer type" hint={FIELD_TYPE_HINT[f.type]}>
            <Select data-testid="field-type" value={f.type} onChange={(e) => setF((x) => withType(x, e.target.value as FieldType))}>
              {EDITOR_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Answer required?">
            <Choice data-testid="field-required" aria-label="Answer required?" value={f.required} onChange={(required) => set({ required })} options={requiredOptions.map((r) => ({ value: r, label: REQUIRED_LABEL[r] }))} />
          </Field>

          {isChoiceType(f.type) && (
            <Field label="Options" required error={show.options}>
              <div className="space-y-1.5">
                {f.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-right text-xs text-ink-3 tabular-nums">{i + 1}.</span>
                    <TextInput
                      data-testid={`field-option-${i}`}
                      value={o.label}
                      aria-label={`Option ${i + 1}`}
                      invalid={!!show.options && !o.label.trim()}
                      placeholder={`Option ${i + 1}`}
                      onChange={(e) => set({ options: f.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                    />
                    <IconButton label={`Remove option ${i + 1}`} data-testid={`field-option-remove-${i}`} onClick={() => set({ options: f.options.filter((_, j) => j !== i) })}>
                      <X size={15} />
                    </IconButton>
                  </div>
                ))}
                <Button size="sm" variant="ghost" data-testid="field-option-add" icon={<Plus size={14} />} onClick={() => set({ options: [...f.options, { label: "" }] })}>
                  Add option
                </Button>
              </div>
            </Field>
          )}

          {isNumberType(f.type) && (
            <Field label="Unit" required error={show.unit}>
              <div className="flex flex-wrap items-center gap-3">
                <TextInput data-testid="field-unit" className="w-40" value={f.noUnit ? "" : f.unit} disabled={f.noUnit} invalid={!!show.unit} placeholder="e.g. mg/kg or %" onChange={(e) => set({ unit: e.target.value })} />
                <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                  <input type="checkbox" data-testid="field-no-unit" checked={f.noUnit} onChange={(e) => set({ noUnit: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
                  No unit
                </label>
              </div>
            </Field>
          )}

          <Field label="Help text" hint="Optional. Shown under the question.">
            <TextArea data-testid="field-help" rows={2} value={f.help} onChange={(e) => set({ help: e.target.value })} placeholder="What the supplier should enter or upload" />
          </Field>
          <Field label="Owner department" hint="The department whose review covers this answer.">
            <Select data-testid="field-owner" value={f.owner} onChange={(e) => set({ owner: e.target.value as Dept })}>
              {DEPT_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DEPT_LABEL[d]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="md:sticky md:top-0 md:self-start">
          <FieldPreview f={f} />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------- section editor

/** One question of the section's list, with reorder, edit and remove (asks first). */
function QuestionRow({ sec, index, onEdit }: { sec: SectionData; index: number; onEdit: (fieldId: string) => void }) {
  const { state, moveField, removeField } = useStore();
  const f = sec.fields[index];
  const [confirm, setConfirm] = useState(false);
  // In a section that is new in the draft every question is new: the section's own badge says so once.
  const mark = sectionMark(state, sec.id) === "new" ? undefined : fieldMark(state, sec.id, f.id);
  const meta = [FIELD_TYPE_LABEL[f.type], REQUIRED_LABEL[f.required], DEPT_SHORT[f.owner], ...(isNumberType(f.type) ? [f.unit ? f.unit : f.unit === "" ? "no unit" : "unit missing"] : []), ...(isChoiceType(f.type) ? [`${f.options?.length ?? 0} options`] : [])];
  if (confirm) {
    return (
      <li data-testid={`field-row-${f.id}`} className="flex flex-wrap items-center gap-2 bg-bad-soft/50 px-3 py-2.5">
        <span className="min-w-0 flex-1 text-[13px] text-ink">
          Remove “{f.label || "this question"}” from the draft? Cases on earlier versions keep it.
        </span>
        <Button size="sm" onClick={() => setConfirm(false)}>
          Keep
        </Button>
        <Button size="sm" variant="danger" data-testid="field-remove-confirm" icon={<Trash2 size={14} />} onClick={() => removeField(sec.id, f.id)}>
          Remove
        </Button>
      </li>
    );
  }
  return (
    <li data-testid={`field-row-${f.id}`} data-mark={mark} className={cx("flex items-start gap-3 px-3 py-2.5", mark && "bg-brand-soft/35")}>
      <span className="mt-0.5 w-5 shrink-0 text-right text-xs text-ink-3 tabular-nums">{index + 1}.</span>
      <button type="button" onClick={() => onEdit(f.id)} title={`Question id ${f.id}`} className="min-w-0 flex-1 text-left">
        <span className="block text-[13.5px] font-medium text-ink">
          {f.label || <span className="text-bad">Question without a label</span>}
          {f.required !== "optional" && <span className="ml-0.5 text-bad">*</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          {meta.join(" · ")}
          {mark && <MarkBadge mark={mark} inDraft />}
        </span>
      </button>
      <div className="-my-1 flex shrink-0 items-center">
        <IconButton label="Move up" data-testid={`field-up-${f.id}`} disabled={index === 0} onClick={() => moveField(sec.id, f.id, "up")} className="disabled:opacity-30">
          <ArrowUp size={15} />
        </IconButton>
        <IconButton label="Move down" data-testid={`field-down-${f.id}`} disabled={index === sec.fields.length - 1} onClick={() => moveField(sec.id, f.id, "down")} className="disabled:opacity-30">
          <ArrowDown size={15} />
        </IconButton>
        <IconButton label="Edit question" data-testid={`field-edit-${f.id}`} onClick={() => onEdit(f.id)}>
          <Pencil size={15} />
        </IconButton>
        <IconButton label="Remove question" data-testid={`field-remove-${f.id}`} onClick={() => setConfirm(true)} className="hover:text-bad">
          <Trash2 size={15} />
        </IconButton>
      </div>
    </li>
  );
}

/**
 * The editor of one draft section: its rules (or the hint that it needs one), its settings and its questions.
 * `fieldId`: open that question's form at once (a fix link of Check & publish).
 */
export function SectionEditorDrawer({ sectionId, fieldId, onClose, onCreateRule, onEditRule }: { sectionId: string; fieldId?: string; onClose: () => void; onCreateRule: (sectionId: string) => void; onEditRule: (ruleId: string) => void }) {
  const { state, restoreSection } = useStore();
  const draft = draftPair(state);
  const sec = draft?.template.sections.find((x) => x.id === sectionId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [question, setQuestion] = useState<{ fieldId?: string } | null>(fieldId ? { fieldId } : null);
  if (!draft || !sec) return null;
  const mark = sectionMark(state, sec.id);
  const codeOf = (id: string) => draft.template.sections.find((x) => x.id === id)?.code ?? id;
  const switching = draft.ruleSet.rules.filter((r) => r.outcome !== "na" && r.activates.includes(sec.id));
  const pointing = rulesPointingAt(state, sec.id);
  const isNew = mark === "new";
  // The questionnaire as publishing would name it: v3 once the draft changes it, otherwise the version it keeps (v2).
  const tplNames = draftSideNames(state)?.template;
  const tplShown = shortTemplate(tplNames?.shown ?? draft.template.version);

  return (
    <Drawer
      open
      onClose={onClose}
      width={680}
      data-testid="section-editor"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>
            <span className="mr-1.5 font-mono text-[15px]">{sec.code || "(no code)"}</span>
            {sec.title || <span className="text-ink-3">(no title)</span>}
          </span>
          <MarkBadge data-testid={`section-editor-mark`} mark={mark} inDraft />
        </span>
      }
      subtitle={sec.meaning || `${KIND_LABEL[sec.kind]} in the draft questionnaire ${tplNames && !tplNames.changed ? `(no changes yet: stays ${tplShown})` : tplShown}`}
      footer={
        <Button data-testid="section-editor-close" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        {sec.retired ? (
          <Callout
            tone="neutral"
            icon={<RotateCcw size={15} />}
            title="Retired in this version"
            action={
              <Button size="sm" data-testid={`section-restore-${sec.id}`} icon={<RotateCcw size={14} />} onClick={() => restoreSection(sec.id)}>
                Restore
              </Button>
            }
          >
            New cases on {tplShown} do not get it; running cases keep it.{pointing.length ? ` ${pointing.join(", ")} still point${pointing.length === 1 ? "s" : ""} at it.` : ""}
          </Callout>
        ) : switching.length === 0 ? (
          <div data-testid="section-needs-rule">
            <Callout
              tone="warn"
              icon={<Wand2 size={16} />}
              title={isNew ? "A new section needs a rule that switches it on" : "No rule switches this section on"}
              action={
                <Button size="sm" variant="primary" data-testid="section-create-rule" icon={<Plus size={14} />} onClick={() => onCreateRule(sec.id)}>
                  Create the rule
                </Button>
              }
            >
              Without a rule, no supplier gets this section. The rule says which answer opens it and who reviews it.
            </Callout>
          </div>
        ) : (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink">Switched on by</h3>
            <ul className="divide-y divide-line rounded-lg border border-line" data-testid="section-rules">
              {switching.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onEditRule(r.id)} className="flex w-full items-start gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface-2">
                    <span className="w-12 shrink-0 font-mono text-[12.5px] font-medium text-ink">{r.id}</span>
                    <span className="min-w-0 flex-1 text-ink">{ruleSentence(r, codeOf, (id) => draft.template.sections.find((x) => x.id === id)?.title)}</span>
                    <ApplicabilityBadge a={r.outcome} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" data-testid="section-add-rule" onClick={() => onCreateRule(sec.id)} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
              <Plus size={13} /> Add another rule for this section
            </button>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink">Settings</h3>
            {!sec.retired && (
              <Button size="sm" data-testid="section-edit-settings" icon={<Settings2 size={14} />} onClick={() => setSettingsOpen(true)}>
                Edit settings
              </Button>
            )}
          </div>
          <div className="rounded-lg border border-line px-3 py-3">
            <KeyValue
              items={[
                { k: "Kind", v: KIND_LABEL[sec.kind] },
                { k: "Content", v: sec.documentsOnly ? "Documents only" : "Questions" },
                ...(sec.documentsOnly ? [{ k: "Upload required?", v: <span data-testid="section-editor-uploads">{uploadsMandatory(sec) ? REQUIRED_LABEL.mandatory : REQUIRED_LABEL.optional}</span> }] : []),
                { k: "Lead department", v: DEPT_LABEL[sec.lead] },
                { k: "Co-reviewers", v: sec.co.length ? sec.co.map((d) => DEPT_SHORT[d]).join(", ") : "None" },
              ]}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink">
              Questions {!sec.documentsOnly && <span className="font-normal text-ink-3">({sec.fields.length})</span>}
            </h3>
            {!sec.documentsOnly && !sec.retired && (
              <Button size="sm" variant="primary" data-testid="field-add" icon={<ListPlus size={14} />} onClick={() => setQuestion({})}>
                Add question
              </Button>
            )}
          </div>
          {sec.id === "K2.1" && <p className="mb-2 text-[12.5px] text-ink-3">Plus the repeatable composition table (INCI, CAS, EC, function, origin and concentration per component), which is not edited here.</p>}
          {sec.documentsOnly ? (
            <div className="rounded-lg border border-dashed border-line-strong">
              <EmptyState icon={<FileText size={20} />} title={documentsContent(sec)} action={!sec.retired ? <Button size="sm" onClick={() => setSettingsOpen(true)}>Switch to questions</Button> : undefined}>
                {UPLOADS_HINT[uploadsMandatory(sec) ? "mandatory" : "optional"]} To ask questions, switch its content to “Questions”.
              </EmptyState>
            </div>
          ) : sec.fields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong" data-testid="section-no-questions">
              <EmptyState icon={<ListPlus size={20} />} title="No questions yet" action={!sec.retired ? <Button size="sm" icon={<Plus size={14} />} onClick={() => setQuestion({})}>Add the first question</Button> : undefined}>
                A section with questions needs at least one before the version can be published.
              </EmptyState>
            </div>
          ) : (
            <ul className={cx("divide-y divide-line rounded-lg border border-line", sec.retired && "pointer-events-none opacity-60")} data-testid="section-questions">
              {sec.fields.map((f, i) => (
                <QuestionRow key={f.id} sec={sec} index={i} onEdit={(id) => setQuestion({ fieldId: id })} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {settingsOpen && <SectionFormModal sectionId={sec.id} onClose={() => setSettingsOpen(false)} />}
      {question && <FieldFormModal key={question.fieldId ?? "new"} sectionId={sec.id} fieldId={question.fieldId} onClose={() => setQuestion(null)} />}
    </Drawer>
  );
}
