// "Changes in draft" (spec §8.3): what the draft adds, changes or removes against the version it was copied from. On
// Rules it lists the rules, on Questionnaire the sections and questions, in Check & publish everything.
import { ArrowRight, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, cx } from "@/components/ui";
import { templateData } from "@/domain/catalog";
import { changesText, draftChanges, draftPair, pairLabel, type DraftChanges } from "@/domain/configActions";
import { ruleSentence } from "@/domain/conditions";
import { uploadsMandatory } from "@/domain/requestedDocs";
import { ruleSet } from "@/domain/rules";
import type { RuleData } from "@/domain/types";
import { useStore } from "@/store/store";

type Focus = "rules" | "questionnaire" | "all";

const TONE = { added: "brand", changed: "info", removed: "neutral" } as const;

function Line({ tone, tag, children, onOpen, testId }: { tone: "brand" | "info" | "neutral"; tag: string; children: ReactNode; onOpen?: () => void; testId?: string }) {
  const body = (
    <>
      <span className="w-[118px] shrink-0">
        <Badge tone={tone}>{tag}</Badge>
      </span>
      <span className="min-w-0 flex-1 text-[13px] text-ink">{children}</span>
    </>
  );
  return (
    <li data-testid={testId}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2">
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-2 px-1.5 py-1">{body}</div>
      )}
    </li>
  );
}

const questionnairePart = (ch: DraftChanges) =>
  changesText({ ...ch, rules: { added: [], changed: [], removed: [] }, count: ch.count - ch.rules.added.length - ch.rules.changed.length - ch.rules.removed.length });
const rulesPart = (ch: DraftChanges) =>
  changesText({ ...ch, sections: { added: [], changed: [], retired: [], restored: [] }, fields: { added: [], changed: [], removed: [] }, count: ch.rules.added.length + ch.rules.changed.length + ch.rules.removed.length });

/**
 * The change list. `onOpenRule` / `onOpenSection`: open the editor of that rule or section (the lines become links).
 */
export function DraftChangesList({ focus, onOpenRule, onOpenSection, className, "data-testid": testId = "draft-changes" }: { focus: Focus; onOpenRule?: (id: string) => void; onOpenSection?: (id: string) => void; className?: string; "data-testid"?: string }) {
  const { state } = useStore();
  const draft = draftPair(state);
  const ch = draftChanges(state);
  if (!draft || !ch) return null;
  const sections = new Map(draft.template.sections.map((x) => [x.id, x]));
  const codeOf = (id: string) => sections.get(id)?.code ?? id;
  const secName = (id: string) => {
    const x = sections.get(id);
    return x ? `${x.code} · ${x.title || "(no title)"}` : id;
  };
  const draftRules = new Map(draft.ruleSet.rules.map((r) => [r.id, r]));
  const baseRules = new Map(ruleSet(ch.base.ruleSetVersion, state.config).rules.map((r) => [r.id, r as RuleData]));
  const sentence = (r: RuleData | undefined) => (r ? ruleSentence(r, codeOf, (id) => sections.get(id)?.title) : "");
  // A documents-only section whose "Upload required?" changed says so (the other section settings show in the editor).
  const baseSections = new Map((templateData(ch.base.templateVersion, state.config)?.sections ?? []).map((x) => [x.id, x]));
  const uploadsChange = (id: string) => {
    const x = sections.get(id);
    const b = baseSections.get(id);
    if (!x?.documentsOnly || !b || uploadsMandatory(x) === uploadsMandatory(b)) return "";
    return uploadsMandatory(x) ? "upload now mandatory" : "upload now optional";
  };

  const showRules = focus !== "questionnaire";
  const showTpl = focus !== "rules";
  const ruleCount = ch.rules.added.length + ch.rules.changed.length + ch.rules.removed.length;
  const tplCount = ch.count - ruleCount;
  const base = pairLabel(ch.base.ruleSetVersion, ch.base.templateVersion);

  const lines: ReactNode[] = [];
  if (showRules) {
    for (const id of ch.rules.added) lines.push(<Line key={`ra-${id}`} testId={`change-rule-${id}`} tone={TONE.added} tag="Rule added" onOpen={onOpenRule && (() => onOpenRule(id))}><span className="font-mono text-[12.5px] font-medium">{id}</span> · {sentence(draftRules.get(id))}</Line>);
    for (const id of ch.rules.changed) lines.push(<Line key={`rc-${id}`} testId={`change-rule-${id}`} tone={TONE.changed} tag="Rule changed" onOpen={onOpenRule && (() => onOpenRule(id))}><span className="font-mono text-[12.5px] font-medium">{id}</span> · {sentence(draftRules.get(id))}</Line>);
    for (const id of ch.rules.removed) lines.push(<Line key={`rr-${id}`} testId={`change-rule-${id}`} tone={TONE.removed} tag="Rule removed"><span className="font-mono text-[12.5px] font-medium line-through">{id}</span> <span className="text-ink-3">· {sentence(baseRules.get(id))}</span></Line>);
  }
  if (showTpl) {
    for (const id of ch.sections.added) {
      const n = sections.get(id)?.fields.length ?? 0;
      const x = sections.get(id);
      lines.push(<Line key={`sa-${id}`} testId={`change-section-${id}`} tone={TONE.added} tag="Section added" onOpen={onOpenSection && (() => onOpenSection(id))}>{secName(id)}<span className="text-ink-3"> · {x?.documentsOnly ? (uploadsMandatory(x) ? "documents only, mandatory upload" : "documents only") : n === 1 ? "1 question" : `${n} questions`}</span></Line>);
    }
    for (const id of [...ch.sections.changed, ...ch.sections.restored]) {
      const detail = uploadsChange(id);
      lines.push(<Line key={`sc-${id}`} testId={`change-section-${id}`} tone={TONE.changed} tag={ch.sections.restored.includes(id) ? "Section restored" : "Section changed"} onOpen={onOpenSection && (() => onOpenSection(id))}>{secName(id)}{detail && <span className="text-ink-3"> · {detail}</span>}</Line>);
    }
    for (const id of ch.sections.retired) lines.push(<Line key={`sr-${id}`} testId={`change-section-${id}`} tone={TONE.removed} tag="Section retired" onOpen={onOpenSection && (() => onOpenSection(id))}>{secName(id)}<span className="text-ink-3"> · hidden for new cases on this version</span></Line>);
    for (const f of ch.fields.added) lines.push(<Line key={`fa-${f.fieldId}`} testId={`change-field-${f.fieldId}`} tone={TONE.added} tag="Question added" onOpen={onOpenSection && (() => onOpenSection(f.sectionId))}>“{f.label || "(no label)"}” <span className="text-ink-3">in {codeOf(f.sectionId)}</span></Line>);
    for (const f of ch.fields.changed) lines.push(<Line key={`fc-${f.fieldId}`} testId={`change-field-${f.fieldId}`} tone={TONE.changed} tag="Question changed" onOpen={onOpenSection && (() => onOpenSection(f.sectionId))}>“{f.label || "(no label)"}” <span className="text-ink-3">in {codeOf(f.sectionId)}</span></Line>);
    for (const f of ch.fields.removed) lines.push(<Line key={`fr-${f.fieldId}`} testId={`change-field-${f.fieldId}`} tone={TONE.removed} tag="Question removed"><span className="line-through">“{f.label}”</span> <span className="text-ink-3">in {codeOf(f.sectionId)}</span></Line>);
  }

  const otherCount = focus === "rules" ? tplCount : focus === "questionnaire" ? ruleCount : 0;
  const empty = lines.length === 0;

  return (
    <div data-testid={testId} data-count={ch.count} className={cx("rounded-lg border border-line bg-surface", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
        <GitBranch size={15} className="text-brand" />
        <h3 className="text-[13.5px] font-semibold text-ink">Changes in draft</h3>
        <span className="text-[12.5px] text-ink-3">compared with {base}</span>
      </div>
      {empty ? (
        <p className="px-3.5 py-3 text-[13px] text-ink-3">
          {focus === "rules" ? "No rule changed yet. Add a rule, or edit one of the rules below." : focus === "questionnaire" ? "No section or question changed yet. Add a section, or edit one below." : "Nothing changed yet. Change a rule or the questionnaire first."}
        </p>
      ) : (
        <ul className="space-y-0.5 px-2 py-2">{lines}</ul>
      )}
      {otherCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3.5 py-2 text-[12.5px] text-ink-2">
          <span>{focus === "rules" ? `Questionnaire: ${questionnairePart(ch)}.` : `Rules: ${rulesPart(ch)}.`}</span>
          <Link to={focus === "rules" ? "/admin/templates" : "/admin/rules"} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
            Open {focus === "rules" ? "Questionnaire" : "Rules"} <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </div>
  );
}
