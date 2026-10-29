// /admin/templates: the questionnaire versions and their section catalogue (REQ-CFG-001, -002), and the questionnaire
// editor of the draft (spec §8.3): add a section, edit its settings and questions, retire or restore it.
import { ChevronRight, Pencil, Plus, RotateCcw, Archive } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Card, IconButton, PageHeader, Table, Tabs, Td, Tr, cx } from "@/components/ui";
import { DEPT_LABEL, DEPT_SHORT, SHARED_SECTIONS, templateData } from "@/domain/catalog";
import { configVersions, draftPair, publishPlan, sectionMark } from "@/domain/configActions";
import { uploadsMandatory } from "@/domain/requestedDocs";
import { ruleSetsOf, sectionsInTemplate, triggerText } from "@/domain/rules";
import type { SectionData, SectionKind } from "@/domain/types";
import { useStore } from "@/store/store";
import { VersionsPanel, defaultVersion } from "./ConfigBar";
import { MarkBadge } from "./controls";
import { DraftChangesList } from "./DraftChanges";
import { documentsContent } from "./fieldTypes";
import { PublishModal } from "./PublishModal";
import { KIND_LABEL, SectionEditorDrawer, SectionFormModal } from "./QuestionnaireEditor";
import { RuleEditorDrawer } from "./RuleEditor";
import { SectionDrawer } from "./SectionDrawer";
import { AdminOnly, Callout, ReadOnlyNote, pendingDraft, shortVersion, useAdminAccess } from "./shared";

type Filter = "all" | "chapter" | "annex" | "fields";

const GROUPS: { kind: SectionKind; label: string }[] = [
  { kind: "basic", label: "Basic data" },
  { kind: "chapter", label: "Chapters" },
  { kind: "annex", label: "Annexes" },
];

export function TemplateManager() {
  return (
    <AdminOnly>
      <QuestionnairePage />
    </AdminOnly>
  );
}

function QuestionnairePage() {
  const { state, retireSection, restoreSection } = useStore();
  const { canChange } = useAdminAccess();
  const [params, setParams] = useSearchParams();
  const sets = useMemo(() => ruleSetsOf(state.config), [state.config]);
  const draft = pendingDraft(sets);
  const draftData = draftPair(state);
  const plan = publishPlan(state);

  // The draft is shown by default; the history selects any other release (by its key). A release shows its
  // questionnaire: its own, or the one it kept from the release before (a rules-only release).
  const versions = configVersions(state);
  const [picked, setPicked] = useState<string | null>(null);
  const row = versions.find((v) => v.key === picked) ?? defaultVersion(versions);
  const prevRow = versions[versions.indexOf(row) + 1];
  const tplVersion = row.templateVersion;
  const viewingDraft = row.status === "draft";
  const editable = canChange && viewingDraft;
  const keptTemplate = !viewingDraft && !row.newTemplate && row.kind !== "first";
  const draftRow = versions.find((v) => v.status === "draft");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const sections: SectionData[] = useMemo(() => templateData(tplVersion, state.config)?.sections ?? [], [tplVersion, state.config]);
  // "New" marks against the questionnaire of the release before (none when this release kept it).
  const prevTpl = prevRow && !keptTemplate && prevRow.templateVersion !== tplVersion ? prevRow.templateVersion : undefined;
  const prevIds = useMemo(() => new Set(prevTpl ? sectionsInTemplate(prevTpl, state.config) : []), [prevTpl, state.config]);
  const markOf = (id: string) => (viewingDraft ? sectionMark(state, id) : prevTpl && !prevIds.has(id) ? ("new" as const) : undefined);
  // Which rules the shown questionnaire is used with, in plain words.
  const usedWith = viewingDraft
    ? plan?.questionnaireChanged
      ? `Becomes questionnaire ${shortVersion(plan.result.templateVersion)} when the draft is published, with rules ${plan.result.ruleSetVersion}.`
      : `No change yet: publishing the draft keeps questionnaire ${shortVersion(plan?.base.templateVersion ?? tplVersion)}${plan?.rulesChanged ? `, with the new rules ${plan.result.ruleSetVersion}` : ""}.`
    : row.status === "current"
      ? `Used for new cases with rules ${row.ruleSetVersion}.`
      : `Released with rules ${row.ruleSetVersion}; cases started on ${row.label} keep it.`;

  // Editors open from the URL (?section=K6.18[&field=…], ?rule=new&sections=K6.18), so Check & publish can link to a fix;
  // ?show=K6.18 is the read-only view of a section in the version shown.
  const sectionParam = params.get("section");
  const showParam = params.get("show");
  const fieldParam = params.get("field") ?? undefined;
  const ruleParam = params.get("rule");
  const setParam = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };
  const editing = canChange && sectionParam && draftData?.template.sections.some((x) => x.id === sectionParam) ? sectionParam : null;
  const openSection = (id: string) => setParam(editable ? { section: id, field: null, show: null } : { show: id, section: null, field: null });
  const ruleTarget = canChange && draft && ruleParam ? (ruleParam === "new" ? { sections: (params.get("sections") ?? "").split(",").filter(Boolean) } : { ruleId: ruleParam }) : undefined;

  const counts = {
    all: sections.filter((x) => !x.retired).length,
    chapter: sections.filter((x) => !x.retired && x.kind === "chapter").length,
    annex: sections.filter((x) => !x.retired && x.kind === "annex").length,
    fields: sections.filter((x) => !x.retired && !x.documentsOnly && x.fields.length > 0).length,
  };
  const passes = (x: SectionData) => (filter === "all" ? true : filter === "fields" ? !x.documentsOnly && x.fields.length > 0 : x.kind === filter);
  const ownerOf = (x: SectionData) => (viewingDraft ? x.lead : (state.ownership[x.id]?.lead ?? x.lead));

  return (
    <div>
      <PageHeader
        eyebrow="Business administration"
        title="Questionnaire"
        subtitle="The chapters, annexes and questions of the CIQ, in versions. The business changes them in a new version and publishes it; a version that changes only the rules keeps the questionnaire version. A case keeps the questionnaire version it started with."
      />

      <ReadOnlyNote what="the questionnaire" />

      <VersionsPanel page="questionnaire" viewing={row.key} onView={setPicked} onCheckPublish={() => setPublishOpen(true)} />

      <div className="mt-6 space-y-4">
        {editable && <DraftChangesList focus="questionnaire" onOpenSection={(id) => setParam({ section: id, field: null, show: null })} />}
        {keptTemplate && (
          <div data-testid="questionnaire-kept-note">
            <Callout tone="info" title={`${row.label} changed only the rules`}>
              It kept questionnaire {shortVersion(tplVersion)} unchanged: the same sections and questions as in the version before.
            </Callout>
          </div>
        )}
        {canChange && draftRow && !viewingDraft && (
          <Callout
            tone="neutral"
            title={`Questionnaire ${shortVersion(tplVersion)} is published and never changes`}
            action={
              <Button size="sm" data-testid="view-draft" icon={<Pencil size={14} />} onClick={() => setPicked(draftRow.key)}>
                Edit the draft
              </Button>
            }
          >
            Changes go into the draft. Cases started on this version keep it.
          </Callout>
        )}

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-ink">{viewingDraft ? "Sections in the draft" : `Sections in ${tplVersion}`}</h3>
              <p className="mt-0.5 text-[13px] text-ink-2" data-testid="questionnaire-used-with">
                {usedWith}
              </p>
              <p className="mt-0.5 text-[13px] text-ink-3">
                {counts.all} sections{sections.length > counts.all ? `, ${sections.length - counts.all} retired` : ""}. {editable ? "Select a section to change its settings and questions." : "Select a section to see its questions."}
              </p>
            </div>
            {editable && (
              <Button data-testid="section-add" variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
                Add section
              </Button>
            )}
          </div>
          <Tabs<Filter>
            className="mt-2 px-4"
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: "all", label: "All", count: counts.all },
              { value: "chapter", label: "Chapters", count: counts.chapter },
              { value: "annex", label: "Annexes", count: counts.annex },
              { value: "fields", label: "With questions", count: counts.fields },
            ]}
          />
          <Table head={["Code", "Title", "Kind", "Lead", "Switched on by", "Content", editable ? <span key="a" className="sr-only">Actions</span> : ""]}>
            {GROUPS.map((g) => {
              const secs = sections.filter((x) => x.kind === g.kind && passes(x));
              if (!secs.length) return null;
              return [
                <tr key={`h-${g.kind}`} className="bg-surface-2">
                  <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">
                    {g.label}
                  </td>
                </tr>,
                ...secs.map((x) => {
                  const mark = x.retired ? "retired" : markOf(x.id);
                  const trigger = triggerText(x.id, row.ruleSetVersion, state.config);
                  const lead = ownerOf(x);
                  return (
                    <Tr key={x.id} data-testid={`section-row-${x.id}`} data-mark={mark} onClick={() => openSection(x.id)} className={cx(x.retired && "opacity-60", mark === "new" && "bg-brand-soft/40")}>
                      <Td className="whitespace-nowrap">
                        <span className="font-mono text-[12.5px] font-medium">{x.code || "—"}</span>
                      </Td>
                      <Td className="min-w-[280px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cx("font-medium", x.retired ? "text-ink-3 line-through" : "text-ink")}>{x.title || <span className="text-bad">(no title)</span>}</span>
                          {mark && <MarkBadge data-testid={`section-mark-${x.id}`} mark={mark} inDraft={viewingDraft} version={shortVersion(tplVersion)} />}
                          {SHARED_SECTIONS.includes(x.id) && <Badge tone="info">Shared</Badge>}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-ink-2">{KIND_LABEL[x.kind]}</Td>
                      <Td className="whitespace-nowrap" title={DEPT_LABEL[lead]}>
                        {DEPT_SHORT[lead]}
                      </Td>
                      <Td className={cx("max-w-[280px] min-w-[180px] text-[12.5px]", trigger.startsWith("No rule") && !x.retired ? "font-medium text-[color-mix(in_oklch,var(--warn)_75%,var(--ink))]" : "text-ink-2")}>{trigger}</Td>
                      <Td className="whitespace-nowrap text-[12.5px]">
                        {x.documentsOnly ? (
                          <span className={uploadsMandatory(x) ? "text-ink" : "text-ink-3"} data-testid={`section-row-content-${x.id}`}>
                            {documentsContent(x)}
                          </span>
                        ) : (
                          <span className={x.fields.length ? "text-ink" : "text-bad"}>
                            {x.fields.length === 1 ? "1 question" : `${x.fields.length} questions`}
                            {x.id === "K2.1" && " + table"}
                          </span>
                        )}
                      </Td>
                      <Td className="w-px whitespace-nowrap text-ink-3">
                        {editable ? (
                          <div className="-my-1 flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <IconButton label={`Edit ${x.code}`} data-testid={`section-edit-${x.id}`} onClick={() => openSection(x.id)}>
                              <Pencil size={15} />
                            </IconButton>
                            {x.retired ? (
                              <Button size="sm" variant="ghost" data-testid={`section-restore-${x.id}`} icon={<RotateCcw size={14} />} onClick={() => restoreSection(x.id)}>
                                Restore
                              </Button>
                            ) : x.id !== "GEN" ? (
                              <Button size="sm" variant="ghost" data-testid={`section-retire-${x.id}`} aria-label={`Retire ${x.code}`} title="Hide this section for new cases on this version (you can restore it)" icon={<Archive size={14} />} onClick={() => retireSection(x.id)}>
                                Retire
                              </Button>
                            ) : (
                              <span className="inline-block w-[77px]" aria-hidden />
                            )}
                          </div>
                        ) : (
                          <ChevronRight size={15} />
                        )}
                      </Td>
                    </Tr>
                  );
                }),
              ];
            })}
          </Table>
          {editable && (
            <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3">
              Retire hides a section for new cases on this version; it is never deleted, and cases on earlier versions keep it.
            </p>
          )}
        </Card>
      </div>

      {editing && (
        <SectionEditorDrawer
          key={`${editing}-${fieldParam ?? ""}`}
          sectionId={editing}
          fieldId={fieldParam}
          onClose={() => setParam({ section: null, field: null })}
          onCreateRule={(id) => setParam({ rule: "new", sections: id })}
          onEditRule={(id) => setParam({ rule: id, sections: null })}
        />
      )}
      {!editing && showParam && <SectionDrawer sectionId={showParam} templateVersion={tplVersion} ruleSetVersion={row.ruleSetVersion} onClose={() => setParam({ show: null })} />}
      {ruleTarget && <RuleEditorDrawer key={`${ruleParam}-${params.get("sections") ?? ""}`} target={ruleTarget} onClose={() => setParam({ rule: null, sections: null })} />}
      {adding && <SectionFormModal onClose={() => setAdding(false)} onSaved={(id) => setParam({ section: id, field: null, show: null })} />}
      {canChange && draft && publishOpen && <PublishModal open onClose={() => setPublishOpen(false)} onPublished={() => setPicked(null)} />}
    </div>
  );
}
