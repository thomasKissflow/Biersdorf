// Check & publish (spec §8.3): the validation checklist with links to fix, the change summary, "Test the draft" on the
// example materials, a required change note and Publish. Publishing pins new cases to the new pair; running cases
// keep the pair they started with.
import { CircleAlert, CircleCheck, FileUp, FlaskConical, Rocket, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Field, Modal, TextArea, cx } from "@/components/ui";
import { configVersions, currentPair, draftChanges, draftPair, pairLabel, publishPlan, shortTemplate, validateDraft, type PublishPlan, type ValidationCheck, type ValidationIssue } from "@/domain/configActions";
import { REFERENCE_MATERIALS } from "@/domain/referenceMaterials";
import { ruleSetsOf } from "@/domain/rules";
import { useStore } from "@/store/store";
import { currentRuleSet, pendingDraft } from "./config";
import { DraftChangesList } from "./DraftChanges";
import { regressionSummary, runRegression } from "./regression";

/** Where a finding is fixed: the rule form, the section editor (with the question), or a new rule for the section. */
export function fixLink(check: ValidationCheck["id"], issue: ValidationIssue): { to: string; label: string } | undefined {
  if (check === "sections-have-rule" && issue.sectionId) return { to: `/admin/rules?rule=new&sections=${encodeURIComponent(issue.sectionId)}`, label: "Create the rule" };
  if (issue.ruleId) return { to: `/admin/rules?rule=${encodeURIComponent(issue.ruleId)}`, label: `Edit ${issue.ruleId}` };
  if (issue.sectionId) return { to: `/admin/templates?section=${encodeURIComponent(issue.sectionId)}${issue.fieldId ? `&field=${encodeURIComponent(issue.fieldId)}` : ""}`, label: issue.fieldId ? "Edit the question" : "Edit the section" };
  return undefined;
}

/** What publishing gives, in plain words, under the plan line. */
function planNote(plan: PublishPlan): string {
  switch (plan.kind) {
    case "rules":
      return `Only the rules get a new version. The questionnaire stays ${shortTemplate(plan.base.templateVersion)}: no new questionnaire version is made, and new cases get ${plan.label}.`;
    case "questionnaire":
      return `Only the questionnaire gets a new version. The rules stay ${plan.base.ruleSetVersion}: no new rule set is made, and new cases get ${plan.label}.`;
    case "both":
      return `Both the rules and the questionnaire get a new version. New cases get ${plan.label}.`;
    default:
      return "Change a rule or the questionnaire first, or discard the draft.";
  }
}

export function PublishModal({ open, onClose, onPublished }: { open: boolean; onClose: () => void; onPublished: (label: string) => void }) {
  const { state, publishDraft } = useStore();
  const navigate = useNavigate();
  const draft = draftPair(state);
  const v = validateDraft(state);
  const ch = draftChanges(state);
  const plan = publishPlan(state);
  const [initialNote] = useState(() => draft?.changeNote || draft?.note || "");
  const [note, setNote] = useState(initialNote);
  const [tried, setTried] = useState(false);
  const [tested, setTested] = useState(false);
  // When every check passes, the list folds into one line so the change note stays in view.
  const [showChecks, setShowChecks] = useState(false);

  const sets = useMemo(() => ruleSetsOf(state.config), [state.config]);
  const test = useMemo(() => {
    if (!tested) return undefined;
    const d = pendingDraft(sets);
    return d ? regressionSummary(runRegression(currentRuleSet(sets), d, "new-request", state.config)) : undefined;
  }, [tested, sets, state.config]);

  if (!draft || !v || !ch || !plan) return null;
  const nothing = plan.kind === "none";
  const name = nothing ? "the draft" : plan.label;
  const cur = currentPair(state);
  const curLabel = pairLabel(cur.ruleSetVersion, cur.templateVersion);
  const versions = configVersions(state);
  const running = versions.reduce((n, x) => n + (x.status === "draft" ? 0 : x.runningCases), 0);
  const onCurrent = versions.find((x) => x.status === "current")?.runningCases ?? 0;
  const runningText = !running
    ? `No case is running. Every case started after publishing uses ${name}.`
    : `${running} running case${running === 1 ? "" : "s"} ${onCurrent === running ? `keep${running === 1 ? "s" : ""} ${curLabel}` : `keep the version they started with (${onCurrent} on ${curLabel})`}. Only cases started after publishing use ${name}.`;
  const failing = v.checks.filter((c) => !c.ok);
  const noteMissing = !note.trim();
  const otherFailing = failing.filter((c) => c.id !== "has-changes");
  const blockers = [...(nothing ? ["change a rule or the questionnaire (nothing to publish yet)"] : []), ...(otherFailing.length ? [`${otherFailing.length === 1 ? "1 check fails" : `${otherFailing.length} checks fail`}`] : []), ...(noteMissing ? ["write a change note"] : [])];

  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  const publish = () => {
    setTried(true);
    if (blockers.length) return;
    const label = plan.label;
    if (publishDraft(note)) {
      onPublished(label);
      onClose();
    }
  };

  return (
    <Modal
      data-testid="publish-modal"
      open={open}
      onClose={onClose}
      dismissible={note === initialNote && !tested}
      wide
      title={nothing ? "Check & publish the draft" : `Check & publish ${name}`}
      subtitle="Once published, new cases use it. Running cases keep the version they started with. Only what changed gets a new version number."
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {blockers.length > 0 && (
            <p data-testid="publish-blocked" className={cx("mr-auto text-[12.5px]", tried ? "font-medium text-bad" : "text-ink-3")}>
              To publish: {blockers.join("; ")}.
            </p>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" data-testid="publish-submit" icon={<Rocket size={15} />} disabled={failing.length > 0} onClick={publish}>
            {nothing ? "Publish" : `Publish ${name}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-[13px]">
        <section data-testid="publish-plan" data-kind={plan.kind} data-pair={nothing ? "" : plan.label} className={cx("rounded-lg border px-3 py-2.5", nothing ? "border-bad/40 bg-bad-soft/40" : "border-line bg-surface-2")}>
          <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">What will be published</h3>
          <p className="mt-1 text-[14px] font-semibold text-ink" data-testid="publish-plan-text">
            {plan.text}
          </p>
          <p className="mt-0.5 text-ink-2">{planNote(plan)}</p>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Checks</h3>
          {v.ok && (
            <button
              type="button"
              data-testid="publish-checks-toggle"
              aria-expanded={showChecks}
              onClick={() => setShowChecks((x) => !x)}
              className={cx("flex w-full items-center gap-2 border border-line px-3 py-2 text-left hover:bg-surface-2", showChecks ? "rounded-t-lg border-b-0" : "rounded-lg")}
            >
              <CircleCheck size={16} className="shrink-0 text-ok" aria-hidden />
              <span className="font-medium text-ink">All {v.checks.length} checks pass</span>
              <span className="ml-auto text-[12.5px] font-medium text-brand">{showChecks ? "Hide the checks" : "Show the checks"}</span>
            </button>
          )}
          <ul data-testid="publish-checklist" data-ok={v.ok ? "true" : "false"} hidden={v.ok && !showChecks} className={cx("divide-y divide-line border border-line", v.ok ? "rounded-b-lg" : "rounded-lg")}>
            {v.checks.map((c) => (
              <li key={c.id} data-testid={`check-${c.id}`} data-ok={c.ok ? "true" : "false"} className="px-3 py-2">
                <div className="flex items-start gap-2">
                  {c.ok ? <CircleCheck size={16} className="mt-px shrink-0 text-ok" aria-label="Passed" /> : <CircleAlert size={16} className="mt-px shrink-0 text-bad" aria-label="Fails" />}
                  <span className={c.ok ? "text-ink-2" : "font-medium text-ink"}>{c.label}</span>
                </div>
                {!c.ok && (
                  <ul className="mt-1.5 space-y-1 pl-6">
                    {c.issues.map((issue, i) => {
                      const fix = fixLink(c.id, issue);
                      return (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink-2">
                          <span>{issue.text}</span>
                          {fix && (
                            <button type="button" data-testid={`check-fix-${c.id}-${i}`} onClick={() => go(fix.to)} className="font-medium text-brand hover:underline">
                              {fix.label}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {v.warnings.length > 0 && (
            <div data-testid="publish-warnings" className="mt-2 rounded-lg bg-warn-soft px-3 py-2">
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                <TriangleAlert size={14} className="text-[color-mix(in_oklch,var(--warn)_75%,var(--ink))]" />
                Worth a look (does not block publishing)
              </p>
              <ul className="mt-1 space-y-0.5 pl-5 text-[12.5px] text-ink-2">
                {v.warnings.map((w, i) => (
                  <li key={i} className="list-disc">
                    {w.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {v.infos.length > 0 && (
            <div data-testid="publish-infos" className="mt-2 rounded-lg bg-surface-2 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                <FileUp size={14} className="text-ink-3" aria-hidden />
                Requested documents (nothing to fix)
              </p>
              <ul className="mt-1 space-y-0.5 pl-5 text-[12.5px] text-ink-2">
                {v.infos.map((w, i) => (
                  <li key={i} className="list-disc">
                    {w.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">What changes</h3>
          <DraftChangesList data-testid="publish-changes" focus="all" onOpenRule={(id) => go(`/admin/rules?rule=${encodeURIComponent(id)}`)} onOpenSection={(id) => go(`/admin/templates?section=${encodeURIComponent(id)}`)} />
        </section>

        <section className="rounded-lg border border-line px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <FlaskConical size={15} className="text-brand" />
            <span className="font-medium text-ink">Test the draft</span>
            {test && (
              <Badge tone={test.unexpected ? "warn" : "ok"} dot>
                {test.unexpected ? "Check the changes" : "Passed"}
              </Badge>
            )}
            <span className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" data-testid="publish-test-draft" onClick={() => setTested(true)} disabled={tested}>
                {tested ? "Tested" : "Run the test"}
              </Button>
              {test && (
                <Button size="sm" variant="ghost" onClick={() => go("/admin/rules?tab=test")}>
                  See the comparison
                </Button>
              )}
            </span>
          </div>
          <p className="mt-1 text-ink-2" data-testid="publish-test-result">
            {test ? test.text : `Runs the ${REFERENCE_MATERIALS.length} typical example materials through ${curLabel} and through the draft, and shows what changes for each. No case is read or changed.`}
          </p>
        </section>

        <p className="rounded-lg bg-info-soft px-3 py-2 text-ink-2" data-testid="publish-running">
          {runningText}
        </p>

        <Field label="Change note" required hint="What changes, and why. Shown in the version history." error={tried && noteMissing ? "Write a change note: what changes, and why." : undefined}>
          <TextArea data-testid="publish-note" rows={3} value={note} invalid={tried && noteMissing} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Adds the microplastics declaration (K6.18) for polymers, reviewed by Safety." />
        </Field>
      </div>
    </Modal>
  );
}
