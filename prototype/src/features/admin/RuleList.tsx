// The rule table of one rule-set version, grouped by configuration question (REQ-CFG-003). In the draft, the business
// administrator adds, edits and deletes rules here (spec §8.3); changed and new rules are marked.
// No Basis column, basis filter or basis counts (Thomas, 28 Oct: where a rule comes from is not needed by the end users).
// The rule data keeps its basis, and the rule form still sets it.
import { FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Card, EmptyState, IconButton, Mono, Table, Td, TextInput, Tr } from "@/components/ui";
import { ApplicabilityBadge } from "@/components/status";
import { CONFIG_QUESTIONS, DEPT_LABEL, DEPT_SHORT, SECTION_BY_ID } from "@/domain/catalog";
import type { ConfigQuestionId, Rule, RuleSet } from "@/domain/types";
import { MarkBadge } from "./controls";
import { SectionChips, questionMeta } from "./shared";

const GROUP_ORDER: (ConfigQuestionId | "ALWAYS")[] = ["ALWAYS", ...CONFIG_QUESTIONS.map((q) => q.id)];

function matches(rule: Rule, q: string): boolean {
  if (!q) return true;
  const hay = [
    rule.id,
    rule.text,
    rule.note ?? "",
    ...(rule.evidence ?? []),
    ...rule.departments.flatMap((d) => [d, DEPT_SHORT[d], DEPT_LABEL[d]]),
    ...rule.activates.flatMap((id) => [id, SECTION_BY_ID[id]?.code ?? "", SECTION_BY_ID[id]?.title ?? ""]),
    questionMeta(rule.question).code,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function ActivatesCell({ rule }: { rule: Rule }) {
  if (rule.activates.length) return <SectionChips ids={rule.activates} />;
  if (rule.flagsCase) return <span className="text-[12.5px] text-ink-3">No extra section: standard sections, flagged on RMM's review</span>;
  return <span className="text-[12.5px] text-ink-3">No section: evidence only</span>;
}

export interface RuleListEditing {
  onAdd: () => void;
  onEdit: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
}

/**
 * `marks`: "new" / "changed" per rule id (against the draft's base, or the previous version); `inDraft` words them
 * "New in draft" / "Changed in draft". `editing`: the draft's edit controls (business administrator only).
 */
export function RuleList({ ruleSet, versionLabel, marks, inDraft, editing, intro }: { ruleSet: RuleSet; versionLabel?: string; marks: Map<string, "new" | "changed">; inDraft: boolean; editing?: RuleListEditing; intro?: ReactNode }) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => ruleSet.rules.filter((r) => matches(r, query.trim())), [ruleSet, query]);
  const groups = GROUP_ORDER.map((g) => ({ g, rules: visible.filter((r) => r.question === g) })).filter((x) => x.rules.length);
  const withoutRule = CONFIG_QUESTIONS.filter((q) => !ruleSet.rules.some((r) => r.question === q.id));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink" data-testid="rule-list-title">
            {inDraft ? "Rules in the draft" : "Rules in"} {versionLabel ? <span className="text-[13px] font-medium text-ink-2">({versionLabel})</span> : <Mono className="text-[14px]">{ruleSet.version}</Mono>}
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-3" data-testid="rule-list-count">
            {ruleSet.rules.length} {ruleSet.rules.length === 1 ? "rule" : "rules"}. The strictest outcome wins.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing && (
            <Button data-testid="rule-add" variant="primary" icon={<Plus size={15} />} onClick={editing.onAdd}>
              Add rule
            </Button>
          )}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search rules" aria-label="Search rules by id, section or department" className="w-52 pl-8" />
          </div>
        </div>
      </div>

      {intro}

      {groups.length === 0 ? (
        ruleSet.rules.length === 0 ? (
          <EmptyState data-testid="rules-empty" icon={<FileText size={20} />} title="No rules yet" action={editing ? <Button icon={<Plus size={15} />} onClick={editing.onAdd}>Add the first rule</Button> : undefined}>
            Without rules, every section stays not applicable. A rule switches sections on from the supplier's answers.
          </EmptyState>
        ) : (
          <EmptyState icon={<Search size={20} />} title="No rule matches this search">
            Try a section code such as K6.17 or Annex 4, a department, or clear the search.
          </EmptyState>
        )
      ) : (
        <Table head={["Rule", "Condition", "Activates", "Outcome", "Evidence required", "Departments"]}>
          {groups.map(({ g, rules }) => {
            const meta = questionMeta(g);
            return [
              <tr key={`h-${g}`} className="bg-surface-2">
                <td colSpan={6} className="px-4 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Mono className="font-semibold text-ink">{meta.code}</Mono>
                    <span className="text-[13px] font-medium text-ink">{meta.label}</span>
                    {meta.by && <span className="text-xs text-ink-3">· {meta.by}</span>}
                    <span className="ml-auto text-xs text-ink-3">
                      {rules.length} {rules.length === 1 ? "rule" : "rules"}
                    </span>
                  </div>
                </td>
              </tr>,
              ...rules.map((r) => (
                <Tr key={r.id} data-mark={marks.get(r.id)} className={marks.has(r.id) ? "bg-brand-soft/50" : undefined}>
                  <Td className="w-px align-top whitespace-nowrap" data-testid={`rule-row-${r.id}`}>
                    <Mono className="font-medium">{r.id}</Mono>
                    {editing && (
                      // In the Rule column, so Edit and Delete stay in view however wide the table gets.
                      <div className="mt-1.5 -ml-1.5 flex items-center">
                        <IconButton label={`Edit ${r.id}`} data-testid={`rule-edit-${r.id}`} onClick={() => editing.onEdit(r.id)} className="h-7 w-7">
                          <Pencil size={15} />
                        </IconButton>
                        <IconButton label={`Delete ${r.id}`} data-testid={`rule-delete-${r.id}`} onClick={() => editing.onDelete(r.id)} className="h-7 w-7 hover:text-bad">
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    )}
                  </Td>
                  <Td className="max-w-[300px] min-w-[200px] align-top">
                    {marks.has(r.id) && (
                      // Here rather than under the rule id: a wide badge there pushed the last column out of view.
                      <div className="mb-1">
                        <MarkBadge data-testid={`rule-mark-${r.id}`} mark={marks.get(r.id)} inDraft={inDraft} version={ruleSet.version} />
                      </div>
                    )}
                    {editing ? (
                      <button type="button" onClick={() => editing.onEdit(r.id)} className="text-left text-ink hover:text-brand hover:underline">
                        {r.text}
                      </button>
                    ) : (
                      <div className="text-ink">{r.text}</div>
                    )}
                    {r.note && <div className="mt-0.5 text-[12.5px] text-ink-3">{r.note}</div>}
                  </Td>
                  <Td className="max-w-[260px] min-w-[150px] align-top">
                    <ActivatesCell rule={r} />
                  </Td>
                  <Td className="align-top">
                    <ApplicabilityBadge a={r.outcome} />
                  </Td>
                  <Td className="max-w-[220px] min-w-[150px] align-top">
                    {r.evidence?.length ? (
                      <ul className="space-y-0.5">
                        {r.evidence.map((e) => (
                          <li key={e} className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
                            <FileText size={12} className="mt-0.5 shrink-0 text-ink-3" />
                            {e}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </Td>
                  <Td className="align-top">
                    <div className="flex flex-wrap gap-1">
                      {r.departments.map((d) => (
                        <span key={d} title={DEPT_LABEL[d]}>
                          <Badge>{DEPT_SHORT[d]}</Badge>
                        </span>
                      ))}
                    </div>
                  </Td>
                </Tr>
              )),
            ];
          })}
        </Table>
      )}

      {withoutRule.length > 0 && !query && (
        <div className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
          Questions without a rule:{" "}
          {withoutRule.map((q, i) => (
            <span key={q.id}>
              {i > 0 && "; "}
              <Mono>{q.code}</Mono> {q.label.replace(/\?$/, "")} (for information only)
            </span>
          ))}
          .
        </div>
      )}
    </Card>
  );
}
