// CR assessment `#/assess/:crId/:act` (§8.10). Shows the change request; inputs only for the HELD CHRQ_B_<D> task
// (ground rule 13): <D>_Assessment and <D>_Assess_Note; <D>_Assessed_By/_At are set automatically. "Finding raised"
// offers a raise-point link. Then submit (the other departments' branches stay open).
import { Check, MessageSquarePlus, Save } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Field, TextArea } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { DEPT_LABEL } from "../../domain/labels";
import { useActions, useCaseBundle, useCr, useTasks, useWorkbench, useWorkbenchContext } from "../../data/hooks";
import type { CrVM, SaveResult, SubmitResult, TaskVM } from "../../data/viewModels";
import { StatusBadge, StepBadge } from "../../ui/badges";
import { KwbFallback } from "../../ui/KwbFallback";
import { WriteOutcome } from "../../ui/WriteOutcome";
import { RaisePointDialog } from "../points/RaisePointDialog";
import { ErrorBanner, Facts, Note, NotFound, Page, Skeleton, Warnings } from "../review/kit";
import { useKeptTask } from "../review/useKeptTask";
import { assessDeptOf, assessmentOptions, assessProblems, buildAssessPatch, FINDING_RAISED, prettyJson } from "./model";

export function AssessCr() {
  const { crId, act } = useParams();
  const tasks = useTasks();
  // read with the activity only while it is held (after the submit a getItem on it is refused); wait for the tasks
  const liveAct = act && (tasks.data ?? []).some((t) => t.flow === "CIQ_Change_Request_A00" && t.instanceId === crId && t.activityInstanceId === act) ? act : undefined;
  const cr = useCr(tasks.data || tasks.error ? crId : null, liveAct);
  const found = (tasks.data ?? []).find((t) => t.flow === "CIQ_Change_Request_A00" && t.instanceId === crId && t.activityInstanceId === act) ?? null;
  const { task, held } = useKeptTask(found, `${crId}|${act}`);
  const [done, setDone] = useState(false);
  const last = useRef<CrVM | null>(null);
  if (cr.data) last.current = cr.data;
  const v = cr.data ?? (last.current?._id === crId ? last.current : undefined);
  if ((cr.loading && !v) || (tasks.loading && !tasks.data))
    return (
      <Page testId="wb-assess">
        <Skeleton rows={6} />
      </Page>
    );
  if (!v)
    return (
      <Page testId="wb-assess">
        <ErrorBanner error={cr.error} onRetry={cr.reload} />
        <NotFound title="This change request could not be read with your access" testId="wb-assess-missing" />
      </Page>
    );
  const d = assessDeptOf(task?.step);
  return (
    <Page testId="wb-assess">
      <PageHeader
        eyebrow={d ? `Change request · ${DEPT_LABEL[d]} assessment` : "Change request"}
        title={<span className="font-mono text-[20px]">{v.crKey || v._id}</span>}
        subtitle={[v.changeKind, v.caseCode && `${v.caseCode}${v.cycleNo ? ` · C${v.cycleNo}` : ""}`].filter(Boolean).join(" · ")}
        actions={v.step ? <StepBadge step={v.step} /> : <StatusBadge status={v.status} />}
      />
      {done ? cr.error && <Note tone="neutral">After the submit the change request is no longer readable with your access; the values shown are the last ones read.</Note> : <ErrorBanner error={cr.error} onRetry={cr.reload} />}
      <Warnings items={cr.warnings} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader title="The change" />
          <div className="space-y-4 px-4 py-3">
            <Facts
              items={[
                { k: "Change kind", v: v.changeKind },
                { k: "Outcome of triage", v: v.outcome ? <Badge tone="info">{v.outcome}</Badge> : "" },
                { k: "Section", v: v.sectionKey },
                { k: "Field", v: v.fieldKey },
                { k: "Current value", v: v.currentValueText },
                { k: "Triage note", v: v.triageNote },
              ]}
            />
            <Facts items={[{ k: "Change reason", v: v.changeReason }]} />
            <div>
              <p className="text-xs text-ink-3">Proposed value</p>
              <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] whitespace-pre-wrap text-ink scrollbar-thin">{prettyJson(v.proposedValueJson) || "—"}</pre>
            </div>
            <ImpactTable cr={v} />
          </div>
        </Card>
        <div className="min-w-0">{task && d ? <AssessPanel task={task} d={d} cr={v} held={held} onDone={() => setDone(true)} /> : <Note tone="neutral" testId="wb-assess-readonly">You don't hold an assessment task on this change request. It is shown read-only.</Note>}</div>
      </div>
    </Page>
  );
}

function ImpactTable({ cr }: { cr: CrVM }) {
  const rows = (Object.keys(cr.impacts) as (keyof CrVM["impacts"])[]).filter((d) => cr.impacts[d].impact);
  if (!rows.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs text-ink-3">Impacts</p>
      <ul className="space-y-1 text-[13px]">
        {rows.map((d) => (
          <li key={d} className="flex flex-wrap items-center gap-2">
            <span className="min-w-28 font-medium">{DEPT_LABEL[d]}</span>
            <Badge tone={cr.impacts[d].impact === "Yes" ? "warn" : "neutral"}>impact {cr.impacts[d].impact}</Badge>
            {cr.impacts[d].assessment ? <Badge tone="ok">{cr.impacts[d].assessment}</Badge> : cr.impacts[d].impact === "Yes" ? <span className="text-ink-3">assessment pending</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssessPanel({ task, d, cr, held, onDone }: { task: TaskVM; d: "REG" | "SAF" | "QM" | "MIC" | "SUS"; cr: CrVM; held: boolean; onDone(): void }) {
  const actions = useActions();
  const { me, caps, notify } = useWorkbench();
  const { pending } = useWorkbenchContext();
  const [assessment, setAssessment] = useState(cr.impacts[d].assessment);
  const [note, setNote] = useState(cr.impacts[d].note);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [save, setSave] = useState<SaveResult | null>(null);
  const [submit, setSubmit] = useState<SubmitResult | null>(null);
  const [kwbOpen, setKwbOpen] = useState(false);
  const [kwbReady, setKwbReady] = useState(false);
  const [raise, setRaise] = useState(false);
  const bundle = useCaseBundle(assessment === FINDING_RAISED && cr.caseItemId ? cr.caseItemId : null);
  const stored = pending.load(task.key);
  const done = submit?.ok === true;

  const run = async (andSubmit: boolean) => {
    const probs = assessProblems(d, assessment);
    setProblems(probs.map((p) => p.message));
    if (probs.length) return;
    setBusy(true);
    setSave(null);
    setSubmit(null);
    try {
      const s = await actions.saveAtStep(task, buildAssessPatch(d, assessment, note, me, new Date()));
      setSave(s);
      if (s.kind === "kwb-refused") setKwbOpen(true);
      if (!s.ok) return;
      if (!andSubmit) {
        notify("Assessment saved and checked.", "success");
        return;
      }
      const r = await actions.submitStep(task); // WriteOutcome raises the single ok toast
      setSubmit(r);
      if (r.ok) onDone();
    } catch (e) {
      setSave({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  const submitOnly = async () => {
    setBusy(true);
    try {
      const r = await actions.submitStep(task);
      setSubmit(r);
      if (r.ok) onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card data-testid={`wb-step-${task.step}`}>
        <CardHeader title={`${DEPT_LABEL[d]} assessment`} subtitle="Assessed by and at are set to you and now when you save." />
        <div className="space-y-3 px-4 py-3">
          {done ? (
            <Note tone="ok" testId="wb-assess-done">
              Assessment sent. The other departments' assessments stay open until they decide.{" "}
              <Link className="text-brand hover:underline" to="/review">
                Back to the review queue
              </Link>
            </Note>
          ) : !held ? (
            <Note tone="neutral">This task is no longer in your queue. The change request is shown read-only.</Note>
          ) : (
            <>
              <Field label="Assessment" required>
                <div data-testid="wb-assess-assessment">
                  <Select value={assessment} onChange={(e) => setAssessment(e.target.value)} aria-label="Assessment">
                    <option value="">Select…</option>
                    {assessmentOptions(d).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </div>
              </Field>
              <Field label="Note">
                <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-testid="wb-assess-note" />
              </Field>
              {assessment === FINDING_RAISED && (
                <Note tone="neutral">
                  Raise an open point for the finding.{" "}
                  {caps.canInitiate("CIQ_Open_Point_A00") && bundle.data?.case ? (
                    <Button size="sm" variant="subtle" icon={<MessageSquarePlus size={13} />} onClick={() => setRaise(true)} data-testid="wb-assess-raise">
                      Raise open point
                    </Button>
                  ) : bundle.loading ? (
                    <span className="text-ink-3">Reading the case…</span>
                  ) : cr.caseItemId ? (
                    <Link className="text-brand hover:underline" to={`/cases/${cr.caseItemId}`}>
                      Raise it from the case
                    </Link>
                  ) : (
                    <span className="text-ink-3">This change request is not linked to a case yet.</span>
                  )}
                </Note>
              )}
              {problems.length > 0 && <Note tone="bad">{problems.join(" ")}</Note>}
              <div className="flex flex-wrap gap-2">
                <Button icon={<Save size={14} />} disabled={busy} onClick={() => void run(false)} data-testid="wb-assess-save">
                  Save
                </Button>
                <Button variant="primary" icon={<Check size={14} />} disabled={busy} onClick={() => void run(true)} data-testid="wb-assess-submit">
                  {busy ? "Saving…" : "Save and submit"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
      {save && !save.ok && save.kind !== "kwb-refused" && <WriteOutcome result={save} task={task} />}
      {submit && <WriteOutcome result={submit} task={task} okMessage={`${DEPT_LABEL[d]} assessment sent.`} />}
      {held && (kwbOpen || stored) && !done && (
        <div className="space-y-2">
          <KwbFallback task={task} caseCode={cr.caseCode} onResolved={(x) => setKwbReady(x.matches && !x.submittedElsewhere)} />
          {kwbReady && (
            <Button variant="primary" disabled={busy} onClick={() => void submitOnly()} data-testid="wb-assess-submit-after-kwb">
              Submit the assessment
            </Button>
          )}
        </div>
      )}
      {raise && bundle.data?.case && (
        <RaisePointDialog
          open
          onClose={() => setRaise(false)}
          c={bundle.data.case}
          preset={{ refKind: "Change request", refLabel: `${cr.crKey || cr._id}${cr.sectionKey ? ` · ${cr.sectionKey}` : ""}`, refSectionKey: cr.sectionKey || undefined, refFieldKey: cr.fieldKey || undefined, refInternalKey: cr.crKey || undefined, opDept: d, raisedByDept: d }}
          onRaised={() => setRaise(false)}
        />
      )}
    </div>
  );
}
