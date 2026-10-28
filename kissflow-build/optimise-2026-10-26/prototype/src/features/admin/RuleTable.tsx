// /admin/rules: the versioned rules, the rule editor of the draft (spec §8.3) and "Test rules" (comparison plus
// one-material simulator) (REQ-CFG-003). The business administrator edits the draft; the auditor reads every version.
import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Modal, PageHeader, Tabs } from "@/components/ui";
import { configVersions, currentPair, draftChanges, draftPair, pairLabel, publishPlan, shortTemplate } from "@/domain/configActions";
import { ruleSentence } from "@/domain/conditions";
import { ruleSetsOf } from "@/domain/rules";
import { useStore } from "@/store/store";
import { VersionsPanel, defaultVersion } from "./ConfigBar";
import { DraftChangesList } from "./DraftChanges";
import { PublishModal } from "./PublishModal";
import { RuleEditorDrawer } from "./RuleEditor";
import { RuleList } from "./RuleList";
import { TestRules, type TestView } from "./TestRules";
import { AdminOnly, Callout, ReadOnlyNote, currentRuleSet, pendingDraft, ruleMarksBetween, useAdminAccess } from "./shared";

type Tab = "rules" | "test";

export function RuleTable() {
  return (
    <AdminOnly>
      <RulesPage />
    </AdminOnly>
  );
}

function RulesPage() {
  const { state, deleteRule } = useStore();
  const { canEdit, canChange } = useAdminAccess();
  const [params, setParams] = useSearchParams();
  const sets = useMemo(() => ruleSetsOf(state.config), [state.config]);
  const current = currentRuleSet(sets);
  const draft = pendingDraft(sets);
  const draftData = draftPair(state);
  const changes = draftChanges(state);

  // Testing is the administrator's tool; the auditor reads the rule versions. The old ?tab=simulator / ?tab=regression
  // links land on the matching view of Test rules.
  const raw = params.get("tab");
  const tab: Tab = canEdit && (raw === "test" || raw === "simulator" || raw === "regression") ? "test" : "rules";
  const view: TestView = params.get("view") === "try" || raw === "simulator" ? "try" : "compare";
  const material = params.get("material") ?? undefined;
  const go = (next: { tab: Tab; view?: TestView; material?: string }) => {
    const p = new URLSearchParams();
    if (next.tab === "test") {
      p.set("tab", "test");
      if (next.view === "try") p.set("view", "try");
      if (next.material) p.set("material", next.material);
    }
    setParams(p, { replace: true });
  };

  // The rule form opens from the URL (?rule=R-12 or ?rule=new&sections=K6.18), so Check & publish can link to a fix.
  const ruleParam = params.get("rule");
  const editTarget = canChange && draft && ruleParam ? (ruleParam === "new" ? { sections: (params.get("sections") ?? "").split(",").filter(Boolean) } : { ruleId: ruleParam }) : undefined;
  const openRule = (ruleId?: string, sections?: string[]) => {
    const p = new URLSearchParams();
    p.set("rule", ruleId ?? "new");
    if (!ruleId && sections?.length) p.set("sections", sections.join(","));
    setParams(p, { replace: true });
  };
  const closeRule = () => {
    const p = new URLSearchParams(params);
    p.delete("rule");
    p.delete("sections");
    setParams(p, { replace: true });
  };

  // The draft is shown by default; the history selects any other release (by its key). A release shows its rule set:
  // its own, or the one it kept from the release before (a questionnaire-only release).
  const versions = configVersions(state);
  const plan = publishPlan(state);
  const [picked, setPicked] = useState<string | null>(null);
  const row = versions.find((v) => v.key === picked) ?? defaultVersion(versions);
  const rowIndex = versions.indexOf(row);
  const prevRow = versions[rowIndex + 1];
  const viewed = sets.find((r) => r.version === row.ruleSetVersion) ?? current;
  const viewingDraft = row.status === "draft";
  const editable = canChange && viewingDraft;
  const keptRules = !viewingDraft && !row.newRuleSet && row.kind !== "first";

  const marks = useMemo(() => {
    if (viewingDraft) return new Map<string, "new" | "changed">([...(changes?.rules.added ?? []).map((id) => [id, "new"] as const), ...(changes?.rules.changed ?? []).map((id) => [id, "changed"] as const)]);
    const prev = prevRow && !keptRules ? sets.find((r) => r.version === prevRow.ruleSetVersion) : undefined;
    return prev && prev !== viewed ? ruleMarksBetween(prev.rules, viewed.rules) : new Map<string, "new" | "changed">();
  }, [viewingDraft, changes, sets, viewed, prevRow, keptRules]);
  const draftRow = versions.find((v) => v.status === "draft");
  // What the draft's rules become: a new rule set when they changed, else the published one stays.
  const draftRulesLabel = plan ? (plan.rulesChanged ? `${plan.result.ruleSetVersion} when published` : `no change yet: ${plan.base.ruleSetVersion} stays`) : undefined;
  const cur = currentPair(state);
  const testLabels = { base: pairLabel(cur.ruleSetVersion, cur.templateVersion), draft: plan && plan.kind !== "none" ? plan.label : "the draft (no changes yet)", draftTemplate: plan ? shortTemplate(plan.result.templateVersion) : "" };

  const [publishOpen, setPublishOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const deletingRule = deleting ? draftData?.ruleSet.rules.find((r) => r.id === deleting) : undefined;
  const codeOf = (id: string) => draftData?.template.sections.find((x) => x.id === id)?.code ?? id;

  return (
    <div>
      <PageHeader
        eyebrow="Business administration"
        title="Rules"
        subtitle="The metadata answers SF-01 to SF-12 decide which chapters, annexes and evidence each supplier gets. The business changes these rules in a new version, tests it and publishes it; running cases keep the version they started with."
      />

      <ReadOnlyNote what="the rules and publishes their versions" extra="Every version is kept permanently, with its publish date and change note." />

      <VersionsPanel page="rules" viewing={row.key} onView={setPicked} onCheckPublish={() => setPublishOpen(true)} />

      {canEdit ? (
        <Tabs<Tab>
          data-testid="rules-tab"
          className="mt-6 mb-4"
          value={tab}
          onChange={(t) => go({ tab: t })}
          tabs={[
            { value: "rules", label: "Rules", count: viewed.rules.length },
            { value: "test", label: "Test rules" },
          ]}
        />
      ) : (
        <div className="mt-6" />
      )}

      {tab === "rules" ? (
        <div className="space-y-4">
          {editable && <DraftChangesList focus="rules" onOpenRule={(id) => openRule(id)} />}
          {keptRules && (
            <div data-testid="rules-kept-note">
              <Callout tone="info" title={`${row.label} changed only the questionnaire`}>
                It kept rule set {row.ruleSetVersion} unchanged: these are the same rules as in the version before.
              </Callout>
            </div>
          )}
          {canChange && draftRow && !viewingDraft && (
            <Callout
              tone="neutral"
              title={`${row.label} is published and never changes`}
              action={
                <Button size="sm" data-testid="view-draft" icon={<Pencil size={14} />} onClick={() => setPicked(draftRow.key)}>
                  Edit the draft
                </Button>
              }
            >
              Changes go into the draft. Cases started on this version keep it.
            </Callout>
          )}
          <RuleList
            ruleSet={viewed}
            versionLabel={viewingDraft ? draftRulesLabel : undefined}
            marks={marks}
            inDraft={viewingDraft}
            editing={editable ? { onAdd: () => openRule(), onEdit: (id) => openRule(id), onDelete: setDeleting } : undefined}
          />
        </div>
      ) : (
        <TestRules base={current} draft={draft} labels={testLabels} view={view} onView={(v) => go({ tab: "test", view: v })} material={material} onMaterial={(id) => go({ tab: "test", view: "try", material: id })} />
      )}

      {editTarget && <RuleEditorDrawer key={`${ruleParam}-${params.get("sections") ?? ""}`} target={editTarget} onClose={closeRule} onSaved={() => setPicked(draftRow?.key ?? null)} />}

      {canChange && draftData && deleting && (
        <Modal
          data-testid="rule-delete-modal"
          open
          onClose={() => setDeleting(null)}
          title={`Delete ${deleting} from the draft?`}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Keep the rule</Button>
              <Button
                variant="danger"
                data-testid="rule-delete-confirm"
                icon={<Trash2 size={15} />}
                onClick={() => {
                  deleteRule(deleting);
                  setDeleting(null);
                }}
              >
                Delete rule
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-[13px] text-ink-2">
            {deletingRule && <p className="rounded-lg bg-surface-2 px-3 py-2 text-ink">{ruleSentence(deletingRule, codeOf, (id) => draftData?.template.sections.find((x) => x.id === id)?.title)}</p>}
            <p>The published versions keep this rule, so running cases are not affected. Until you publish, you can add it again or discard the draft.</p>
          </div>
        </Modal>
      )}

      {canChange && draft && publishOpen && <PublishModal open onClose={() => setPublishOpen(false)} onPublished={() => setPicked(null)} />}
    </div>
  );
}
