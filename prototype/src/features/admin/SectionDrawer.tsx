// Read-only view of one questionnaire section in one version: owners, the rules that switch it on and its questions.
// Used for published versions (they never change) and by the auditor.
import { FileStack, GitBranch } from "lucide-react";
import { Badge, Drawer, EmptyState, KeyValue } from "@/components/ui";
import { ApplicabilityBadge } from "@/components/status";
import { DEPT_LABEL, DEPT_SHORT, fieldOf, isChoiceType, templateData, templateHasSection } from "@/domain/catalog";
import { configVersions } from "@/domain/configActions";
import { ruleSet } from "@/domain/rules";
import type { Requiredness } from "@/domain/types";
import { useStore } from "@/store/store";
import { FIELD_TYPE_LABEL, REQUIRED_LABEL } from "./fieldTypes";
import { KIND_LABEL } from "./QuestionnaireEditor";
import { shortVersion } from "./shared";

const REQ_TONE: Record<Requiredness, "brand" | "neutral" | "info"> = { mandatory: "brand", optional: "neutral", conditional: "info" };

export function SectionDrawer({ sectionId, templateVersion, ruleSetVersion, onClose }: { sectionId: string | null; templateVersion: string; ruleSetVersion: string; onClose: () => void }) {
  const { state } = useStore();
  const sec = sectionId ? templateData(templateVersion, state.config)?.sections.find((x) => x.id === sectionId) : undefined;
  if (!sec) return null;

  const isDraft = state.config.pairs.some((p) => p.status === "draft" && p.template.version === templateVersion);
  // Published versions show the owners in force (Section owners); the draft shows its own.
  const own = isDraft ? { lead: sec.lead, co: sec.co } : (state.ownership[sec.id] ?? { lead: sec.lead, co: sec.co });
  // Each questionnaire version once (a rules-only release keeps the version before), oldest first; then the draft.
  const all = configVersions(state).reverse();
  const versions = [...new Set(all.filter((v) => v.status !== "draft" && templateHasSection(v.templateVersion, sec.id)).map((v) => shortVersion(v.templateVersion)))];
  const draftRow = all.find((v) => v.status === "draft");
  if (draftRow && templateHasSection(draftRow.templateVersion, sec.id)) versions.push("the draft");
  const rs = ruleSet(ruleSetVersion, state.config);
  const rules = rs.rules.filter((r) => r.activates.includes(sec.id));

  return (
    <Drawer
      open
      onClose={onClose}
      width={640}
      data-testid="section-view"
      title={
        <span>
          <span className="mr-1.5 font-mono text-[15px]">{sec.code}</span>
          {sec.title}
        </span>
      }
      subtitle={sec.meaning}
    >
      <div className="space-y-6">
        {sec.retired && <div className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">Retired in questionnaire {shortVersion(templateVersion)}: new cases on it do not get this section.</div>}

        <KeyValue
          items={[
            { k: "Kind", v: KIND_LABEL[sec.kind] },
            { k: "Included in", v: versions.join(", ") || "—" },
            { k: "Lead department", v: DEPT_LABEL[own.lead] },
            { k: "Co-reviewers", v: own.co.length ? own.co.map((d) => DEPT_SHORT[d]).join(", ") : "None" },
            { k: "Content", v: sec.documentsOnly ? "Documents only" : `${sec.fields.length} ${sec.fields.length === 1 ? "question" : "questions"}${sec.id === "K2.1" ? " + composition table" : ""}` },
          ]}
        />

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
            <GitBranch size={14} className="text-ink-3" />
            Switched on by the rules of {rs.version}
          </h3>
          {rules.length === 0 ? (
            <p className="text-[13px] text-ink-3">No rule switches this section on; it stays not applicable unless a reviewing department adds it.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="w-12 shrink-0 font-mono text-[12.5px] font-medium">{r.id}</span>
                  <span className="min-w-0 flex-1 text-ink">{r.text}</span>
                  <ApplicabilityBadge a={r.outcome} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
            <FileStack size={14} className="text-ink-3" />
            Questions
          </h3>
          {sec.id === "K2.1" && <p className="mb-2 text-[12.5px] text-ink-3">Plus the repeatable composition table: INCI, CAS, EC, function, additive, origin and concentration range per component.</p>}
          {sec.documentsOnly || sec.fields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong">
              <EmptyState title={sec.documentsOnly ? "Documents only" : "No questions"}>{sec.documentsOnly ? "The supplier uploads the documents this section asks for, following the CIQ 2026 template." : "This section has no questions in this version."}</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {sec.fields.map((f) => {
                const conditional = !!fieldOf(f.id, templateVersion, state.config)?.showWhen;
                return (
                  <li key={f.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={REQ_TONE[f.required]}>{REQUIRED_LABEL[f.required]}</Badge>
                      {conditional && <Badge tone="info">Shown on condition</Badge>}
                      <span className="font-mono text-[11px] text-ink-3" title="Question id">
                        {f.id}
                      </span>
                    </div>
                    <div className="mt-1 text-[13.5px] font-medium text-ink">{f.label}</div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {FIELD_TYPE_LABEL[f.type]}
                      {isChoiceType(f.type) && f.options?.length ? ` (${f.options.length} options)` : ""}
                      {f.unit ? ` · unit ${f.unit}` : ""} · owner {DEPT_SHORT[f.owner]}
                    </div>
                    {f.help && <div className="mt-1 text-[12.5px] text-ink-2">{f.help}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}
