// §8.4 Case detail, route component for #/cases/:caseId?tab=&task= (final contract §12.2: no props). Read-only
// without a held task. Header, stepper (v4 order, S6 before S7), the manual hand-off note, the tabs, and the case
// actions: Cancel case (§7.7, a held task at a step with Reject on; Case Admin during Part 2 / S6), Reactivate
// (cancelled case; RMM or Case Admin), Finish setup (§8.3 recovery), Repair lane (Lanes tab / S5-S8 panel).
import { ArrowLeft, Ban, RotateCcw, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Mono, PageHeader } from "@/components/ui/primitives";
import { Stepper } from "@/components/ui/data";
import { switchesAt } from "../../schema";
import { useActions, useCaseBundle, useTasks, useWorkbench, type CaseBundle } from "../../data/hooks";
import type { ActionResult, TaskVM } from "../../data/viewModels";
import { DEFAULT_SETTINGS } from "../../domain/config";
import { Field, TextArea } from "@/components/ui/form";
import { Modal } from "../../ui/overlay";
import { ManualRecordNote } from "../../ui/ManualRecordNote";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { StatusBadge } from "../../ui/badges";
import { ReReadUncertain } from "../../ui/WriteOutcome";
import { caseFieldsOf, finishSetup, newCaseConfigFrom, reactivationBlocker, setupGaps, type SetupStatus } from "../rmm/createCase";
import { AuditTab, CASE_TABS, CaseTabBar, CrsTab, FactsCards, LanesTab, NotesTab, PointsTab, SectionsTab, type CaseTab } from "./CaseTabs";
import { CASE_PANEL_STEPS, StepPanel } from "./panels/StepPanel";
import { ActionBanner, caseLabel, ErrorBanner, LoadingCard, Page, WarningsList } from "./shared";
import { stepperKey, stepperSteps } from "./stepLogic";
import { usePinnedConfig } from "./useConfig";
import { personLabel } from "../../domain/labels";

const isTab = (x: string | null): x is CaseTab => CASE_TABS.some((t) => t.value === x);

export function CaseDetail() {
  const { caseId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: CaseTab = isTab(params.get("tab")) ? (params.get("tab") as CaseTab) : "overview";
  const taskAct = params.get("task");
  const bundle = useCaseBundle(caseId);
  const tasks = useTasks();
  const setTab = (t: CaseTab) => {
    const next = new URLSearchParams(params);
    if (t === "overview") next.delete("tab");
    else next.set("tab", t);
    setParams(next, { replace: true });
  };

  if (bundle.loading && !bundle.data)
    return (
      <Page testId="wb-case">
        <LoadingCard label="Loading the case…" rows={6} />
      </Page>
    );
  if (!bundle.data)
    return (
      <Page testId="wb-case">
        <BackLink />
        <ErrorBanner error={bundle.error ?? "This case could not be read with your access."} onRetry={bundle.reload} />
      </Page>
    );
  const b = bundle.data;
  const c = b.case;
  const mine = (tasks.data ?? []).filter((t) => t.flow === "CIQ_Case_A00" && t.instanceId === c._id);
  const panelTask = (taskAct ? mine.find((t) => t.activityInstanceId === taskAct) : undefined) ?? mine.find((t) => t.step && (CASE_PANEL_STEPS as readonly string[]).includes(t.step)) ?? mine[0] ?? null;
  const others = mine.filter((t) => t !== panelTask);
  return (
    <Page testId="wb-case">
      <BackLink />
      <CaseHeader b={b} tasks={mine} />
      <ErrorBanner error={bundle.error} onRetry={bundle.reload} />
      <WarningsList warnings={bundle.warnings} />
      {c.readQuality === "index" && <ReadQualityBanner quality="mine+tasks" indexOnly={1} what="Case" />}
      <ManualRecordNote />
      <CaseTabBar value={tab} onChange={setTab} counts={{ points: b.points.length, "change-requests": b.crs.length, sections: b.sections.length, notes: b.notes.length, audit: b.events.length }} />
      {tab === "overview" && (
        <div className="space-y-4" data-testid="wb-case-overview">
          {panelTask ? (
            <StepPanel key={panelTask.key} task={panelTask} b={b} onChanged={bundle.reload} />
          ) : (
            <Card data-testid="wb-case-readonly">
              <CardHeader title="No task of yours on this case" subtitle="The case is shown read-only. Step actions need the task in your Kissflow queue." />
            </Card>
          )}
          {others.length > 0 && <OtherTasks tasks={others} caseId={c._id} />}
          <FinishSetupCard b={b} onChanged={bundle.reload} />
          <FactsCards c={c} />
        </div>
      )}
      {tab === "lanes" && <LanesTab b={b} />}
      {tab === "sections" && <SectionsTab b={b} />}
      {tab === "points" && <PointsTab b={b} onChanged={bundle.reload} />}
      {tab === "change-requests" && <CrsTab b={b} />}
      {tab === "notes" && <NotesTab c={c} />}
      {tab === "audit" && <AuditTab b={b} />}
    </Page>
  );
}

function BackLink() {
  return (
    <Link to="/cases" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
      <ArrowLeft size={14} /> All cases
    </Link>
  );
}

function OtherTasks({ tasks, caseId }: { tasks: TaskVM[]; caseId: string }) {
  const nav = useNavigate();
  return (
    <Card>
      <CardHeader title="Your other tasks on this case" />
      <ul className="divide-y divide-line px-4 text-[13.5px]">
        {tasks.map((t) => (
          <li key={t.key} className="flex items-center gap-3 py-2">
            <span className="flex-1">{t.stepName ?? "Unidentified step"}</span>
            <Button size="sm" onClick={() => nav(t.step?.startsWith("CASE_B_") ? `/review/lane/${caseId}/${encodeURIComponent(t.activityInstanceId)}` : t.step === "CASE_S6" ? `/approvals/${caseId}/${encodeURIComponent(t.activityInstanceId)}` : `/cases/${caseId}?task=${encodeURIComponent(t.activityInstanceId)}`)}>
              Open
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- header + case actions

function CaseHeader({ b, tasks }: { b: CaseBundle; tasks: TaskVM[] }) {
  const c = b.case;
  const nav = useNavigate();
  const { caps } = useWorkbench();
  const actions = useActions();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [res, setRes] = useState<ActionResult | null>(null);
  const cfg = usePinnedConfig(c.releaseItemId || null, { enabled: c.cancelled && !!c.releaseItemId });
  const rejectTask = tasks.find((t) => t.step && switchesAt(t.step).reject) ?? null;
  const inReview = !c.cancelled && c.status !== "completed" && c.currentSteps.some((s) => s === "CASE_PAR" || s.startsWith("CASE_B_") || s === "CASE_S6");
  const adminCancel = !rejectTask && caps.isCaseAdmin && inReview;
  const canCancel = !c.cancelled && (!!rejectTask || adminCancel);
  const canReactivate = c.cancelled && caps.canInitiate("CIQ_Case_A00");
  const reactBlock = canReactivate ? reactivationBlocker(c, b.events, cfg.pinned?.settings ?? DEFAULT_SETTINGS, new Date()) : null;
  const step = stepperKey(c);
  const steps = stepperSteps(c);
  const cascade = [...b.points.filter((p) => p.status === "in-progress"), ...b.crs.filter((x) => x.status === "in-progress")];
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span data-testid="wb-case-code" className="font-mono normal-case">
            {caseLabel(c.caseCode, c.cycleNo)}
          </span>
        }
        title={c.tradeName || c.title || c.caseCode || "Case"}
        subtitle={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{c.mainInci || "—"}</span>
            <span>
              BDF {c.bdfMaterialNo || "—"}
              {c.sapMaterialNo ? ` / SAP ${c.sapMaterialNo}` : ""}
            </span>
            <span>
              {c.supplierLegalName || "—"} {c.supplierCode && <Mono className="text-ink-3">({c.supplierCode})</Mono>}
            </span>
            <span>Owner {personLabel(c.ownerRmm, c.bdfContactName, c.bdfContactEmail)}</span>
            <span>
              Release {c.releaseKey || "—"} {c.manifestHash && <Mono className="text-ink-3">#{c.manifestHash.slice(0, 8)}</Mono>}
            </span>
          </span>
        }
        actions={
          <>
            <StatusBadge status={c.status} />
            {c.isTest && <Badge tone="violet">test case</Badge>}
            {canCancel && (
              <Button variant="danger" icon={<Ban size={15} />} onClick={() => setCancelOpen(true)} data-testid="wb-case-cancel">
                Cancel case
              </Button>
            )}
            {canReactivate && (
              <Button icon={<RotateCcw size={15} />} disabled={!!reactBlock || cfg.loading} title={reactBlock ?? undefined} onClick={() => nav(`/cases/new?reactivate=${encodeURIComponent(c._id)}`)} data-testid="wb-case-reactivate">
                Reactivate
              </Button>
            )}
          </>
        }
      />
      {canReactivate && reactBlock && <p className="text-[12.5px] text-ink-3">Reactivation: {reactBlock}</p>}
      <div data-testid="wb-case-stepper" data-step={step ?? ""}>
        {c.cancelled ? (
          <p className="text-[13px] text-ink-2">This case was cancelled{c.status === "withdrawn" ? " (withdrawn)" : ""}.</p>
        ) : step ? (
          <>
            {/* UX-09: below lg the shared Stepper loses its labels, so a compact line names the step instead */}
            <p className="text-[13px] text-ink-2 lg:hidden" data-testid="wb-case-stepper-compact">
              {compactStep(steps, step)}
            </p>
            <div className="hidden lg:block">
              <Stepper steps={steps} current={step} done={step === "END"} />
            </div>
          </>
        ) : (
          <p className="text-[13px] text-ink-3">The case's position is not readable with your access.</p>
        )}
      </div>
      <ActionBanner result={res} testId={res && !res.ok ? "wb-write-refused" : "wb-case-cancel-result"} />
      {res?.kind === "timeout" && <ReReadUncertain flow="CIQ_Case_A00" itemId={c._id} act={rejectTask?.activityInstanceId} />}
      {res?.kind === "manual-end" && cascade.length > 0 && (
        <Card>
          <CardHeader title="Open items of the cancelled case" subtitle="Not ended automatically: end them as process admin in Kissflow." />
          <ul className="divide-y divide-line px-4 text-[13px]">
            {cascade.map((x) => (
              <li key={x._id} className="py-1.5">
                <Link className="text-brand hover:underline" to={x.flow === "CIQ_Open_Point_A00" ? `/points/${x._id}` : `/change-requests/${x._id}`}>
                  {"opKey" in x ? x.opKey || x._id : x.crKey || x._id}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {cancelOpen && (
        <CancelDialog
          adminCancel={adminCancel}
          onClose={() => setCancelOpen(false)}
          onConfirm={async (reason) => {
            try {
              const r = rejectTask ? await actions.rejectCase(rejectTask, reason, c) : await actions.cancelCaseAsAdmin(c, reason);
              setRes(r);
            } catch (e) {
              setRes({ ok: false, message: e instanceof Error ? e.message : String(e) });
            }
            setCancelOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** "Step 6 of 9 · Open items · next: Approval" (or "Done"). */
function compactStep(steps: { key: string; label: string }[], current: string): string {
  const i = steps.findIndex((s) => s.key === current);
  if (i < 0) return "";
  if (current === "END") return `Done · all ${steps.length - 1} steps completed`;
  const next = steps[i + 1];
  return [`Step ${i + 1} of ${steps.length}`, steps[i].label, next ? `next: ${next.label}` : ""].filter(Boolean).join(" · ");
}

/** Cancel case (§7.7): the reason is required (checked here and again by the action; an empty reason sends nothing). */
function CancelDialog({ adminCancel, onClose, onConfirm }: { adminCancel: boolean; onClose(): void; onConfirm(reason: string): Promise<void> }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Cancel case"
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant="danger"
            disabled={busy}
            data-testid="wb-confirm"
            onClick={async () => {
              if (!reason.trim()) {
                setErr("A reason is required to cancel the case.");
                return;
              }
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : "Record cancellation and end the case"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px] text-ink-2">
        <p>
          The cancellation is recorded in the audit log first; only then is the case ended in Kissflow
          {adminCancel ? " (as process admin, where the read gives an activity)" : ""}. The supplier is not notified automatically yet.
        </p>
        <Field label="Reason" required error={err ?? undefined}>
          <TextArea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setErr(null);
            }}
            rows={3}
            invalid={!!err}
            data-testid="wb-confirm-reason"
          />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Finish setup (§8.3 recovery)

function FinishSetupCard({ b, onChanged }: { b: CaseBundle; onChanged(): void }) {
  const c = b.case;
  const { caps } = useWorkbench();
  const actions = useActions();
  const gaps = useMemo(() => setupGaps(c, b.sections, b.events, { sections: b.quality.sections === "form", events: b.quality.events === "form" }), [c, b]);
  const show = !!gaps && caps.canInitiate("CIQ_Case_A00") && !c.cancelled && c.readQuality !== "index";
  const cfg = usePinnedConfig(c.releaseItemId || null, { enabled: show && !!c.releaseItemId });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SetupStatus | null>(null);
  if (!show || !gaps) return res ? <SetupResult s={res} /> : null;
  const setupCfg = newCaseConfigFrom(cfg.pinned);
  return (
    <Card data-testid="wb-case-finish-setup">
      <CardHeader title="Finish setup" subtitle="The case exists, but rows that belong to its creation are missing. Finish setup creates only what is missing." />
      <div className="space-y-3 p-4 text-[13.5px]">
        <ul className="list-disc pl-5 text-ink-2">
          {gaps.section && <li>The BASIC section row</li>}
          {gaps.audit && <li>The "Item created" audit event (the case index)</li>}
        </ul>
        <Button
          icon={<Wrench size={14} />}
          disabled={busy || cfg.loading}
          onClick={async () => {
            setBusy(true);
            try {
              setRes(await finishSetup(actions, caseFieldsOf(c), c._id, setupCfg, { sectionExists: !gaps.section, auditExists: !gaps.audit }));
              onChanged(); // createFormRow does not trigger a reload by itself
            } finally {
              setBusy(false);
            }
          }}
          data-testid="wb-case-finish-setup-run"
        >
          {busy ? "Working…" : "Finish setup"}
        </Button>
        {res && <SetupResult s={res} />}
      </div>
    </Card>
  );
}

function SetupResult({ s }: { s: SetupStatus }) {
  const ok = s.section !== "failed" && s.audit !== "failed";
  return <ActionBanner result={{ ok, message: ok ? "Setup finished: the missing rows are created and checked." : "Setup is not finished.", notes: s.messages }} testId="wb-case-setup-result" />;
}
