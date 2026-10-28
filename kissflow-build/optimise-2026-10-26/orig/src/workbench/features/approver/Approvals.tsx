// §8.12 Overall approver: the queue (#/approvals) and the decision screen (#/approvals/:caseId/:act).
// Queue: the CASE_S6 tasks the user HOLDS; "Upcoming" = cases in Part 2 with Overall_Approval_Required = "Yes", when
// their position is readable. Decision: lane summary, the read-only RMES summary (T2's RmesSummary: no input, no lock,
// no link to the editing route), the effective SAF/REG decision with its source, the later-decision read check
// (counts policy), then Overall_Decision → saveAtStep → submitStep. Native Reject is off at S6 and never offered.
import { ArrowLeft, CheckCircle2, ShieldCheck, Stamp, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState, KeyValue, Table, Td, Tr } from "@/components/ui/data";
import { Field, TextArea } from "@/components/ui/form";
import { Badge, Button, Card, CardHeader, Mono, PageHeader, cx } from "@/components/ui/primitives";
import { DEPTS } from "../../schema";
import { useCaseBundle, useCaseList, useFormRows, useTasks, useWorkbench } from "../../data/hooks";
import type { CaseVM, ConfigVM, SaveResult, SubmitResult, TaskVM } from "../../data/viewModels";
import { loadPinnedConfig, type PinnedConfig } from "../../domain/config";
import { APPROVE_BLOCKED_PARTIAL, DEPT_LABEL, personLabel } from "../../domain/labels";
import { errorText } from "../../kf/sdk";
import { taskPath } from "../../pages/TaskRouter";
import { StatusBadge, StepBadge } from "../../ui/badges";
import { CodeText } from "../../ui/codes";
import { KwbFallback, StoredKwbFallback } from "../../ui/KwbFallback";
import { WriteOutcome } from "../../ui/WriteOutcome";
import { fmtDate, fmtDateTime } from "../audit/format";
import { ErrorBanner, Notice, Page, Skeleton, WarningList } from "../audit/kit";
import { RmesSummary } from "../rmes/RmesSummary";
import {
  OVERALL_REJECTION,
  approvalCheck,
  approvalRule,
  attestedBefore,
  buildApprovalPatch,
  closingTextFrom,
  decisionProblems,
  isUpcoming,
  type ApprovalRule,
  type DecisionInput,
  type LaneDecision,
} from "./rule";

// ---------------------------------------------------------------- queue

export function Approvals() {
  const tasks = useTasks();
  const cases = useCaseList();
  const mine = (tasks.data ?? []).filter((t) => t.flow === "CIQ_Case_A00" && t.step === "CASE_S6");
  const upcoming = (cases.data ?? []).filter(isUpcoming);
  return (
    <Page testId="wb-approvals">
      <PageHeader eyebrow="Approval" title="Overall approvals" subtitle="Cases waiting for the overall Beiersdorf decision. It runs only where the case asks for overall approval." />
      <ErrorBanner error={tasks.error} onRetry={tasks.reload} testId="wb-approvals-tasks-error" />
      <Card>
        <CardHeader title="Waiting for your decision" subtitle="Tasks you hold at Overall approval." />
        {tasks.loading && !tasks.data ? (
          <Skeleton rows={3} bare />
        ) : !mine.length ? (
          <EmptyState icon={<Stamp size={22} />} title="No approvals waiting for you">
            Cases reach you after the department reviews and the open-items check, when overall approval is required.
          </EmptyState>
        ) : (
          <Table head={["Case", "Task", "Due", ""]}>
            {mine.map((t) => (
              <QueueRow key={t.key} t={t} />
            ))}
          </Table>
        )}
      </Card>
      <Card data-testid="wb-approvals-upcoming">
        <CardHeader title="Upcoming" subtitle="Cases in department review that will need your decision." />
        <div className="space-y-3 p-4">
          <ErrorBanner error={cases.error} onRetry={cases.reload} testId="wb-approvals-cases-error" />
          {cases.loading && !cases.data ? (
            <Skeleton rows={2} bare />
          ) : !upcoming.length ? (
            <p className="text-[13px] text-ink-3">{cases.quality === "admin" ? "No case in department review needs overall approval." : "Cases appear here when they reach overall approval."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((c) => (
                <li key={c._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13.5px]" data-testid={`wb-approvals-upcoming-${c._id}`}>
                  <Link to={`/cases/${c._id}`} className="font-medium text-brand hover:underline">
                    <Mono>
                      {c.caseCode || c._id}
                      {c.cycleNo !== null ? ` · C${c.cycleNo}` : ""}
                    </Mono>
                  </Link>
                  <span className="text-ink">{c.tradeName || "—"}</span>
                  <span className="text-ink-3">{c.supplierLegalName}</span>
                  <span className="ml-auto flex flex-wrap gap-1">
                    {(["SAF", "REG"] as const).filter((d) => c.lanes[d].active).map((d) => (
                      <Badge key={d} tone={c.lanes[d].complete ? "ok" : "neutral"} dot>
                        {DEPT_LABEL[d]}
                        {c.lanes[d].complete ? " done" : ""}
                      </Badge>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </Page>
  );
}

function QueueRow({ t }: { t: TaskVM }) {
  const navigate = useNavigate();
  const to = taskPath(t) ?? `/approvals/${t.instanceId}/${encodeURIComponent(t.activityInstanceId)}`;
  return (
    <Tr>
      <Td>
        <Mono>
          {t.caseCode || t.instanceId}
          {t.cycleNo ? ` · C${t.cycleNo}` : ""}
        </Mono>
      </Td>
      <Td>{t.title}</Td>
      <Td className="whitespace-nowrap text-ink-2">{t.due ? fmtDate(t.due) : "—"}</Td>
      <Td className="text-right">
        <Button size="sm" variant="primary" icon={<Stamp size={13} />} onClick={() => navigate(to)} data-testid={`wb-approvals-row-${t.instanceId}-${t.activityInstanceId}`}>
          Decide
        </Button>
      </Td>
    </Tr>
  );
}

// ---------------------------------------------------------------- decision

function DecisionBadge({ d }: { d: string | null | undefined }) {
  if (d === "Approved")
    return (
      <Badge tone="ok" dot>
        Approved
      </Badge>
    );
  if (d === "Rejected")
    return (
      <Badge tone="bad" dot>
        Rejected
      </Badge>
    );
  return <Badge tone="neutral">Not recorded</Badge>;
}

function LaneSummary({ c }: { c: CaseVM }) {
  const active = DEPTS.filter((d) => c.lanes[d].active);
  if (!active.length) return <p className="px-4 py-3 text-[13px] text-ink-3">No department review is active on this case.</p>;
  return (
    <Table head={["Department", "Confirmed", "By", "At", "On behalf of", "RMES decision", "Reason"]} dense>
      {active.map((d) => {
        const l = c.lanes[d];
        return (
          <Tr key={d}>
            <Td className="font-medium">{DEPT_LABEL[d]}</Td>
            <Td>
              <Badge tone={l.complete ? "ok" : "warn"} dot>
                {l.complete ? "Confirmed" : l.confirm || "Not confirmed"}
              </Badge>
            </Td>
            <Td className="text-ink-2">{personLabel(l.completedBy, l.completedByEmail)}</Td>
            <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(l.completedAt)}</Td>
            <Td className="text-ink-2">{l.onBehalfOf || "—"}</Td>
            <Td>{d === "SAF" || d === "REG" ? <DecisionBadge d={l.rmesDecision} /> : <span className="text-ink-3">n/a</span>}</Td>
            {/* tablet check: a readable minimum width, so the reason is not squeezed to one word per line at 768 px */}
            <Td className="max-w-[18rem] min-w-[12rem] text-ink-2">{d === "SAF" || d === "REG" ? l.rmesDecisionReason || "—" : "—"}</Td>
          </Tr>
        );
      })}
    </Table>
  );
}

function EffectiveDecisions({ lanes }: { lanes: LaneDecision[] }) {
  if (!lanes.length) return <p className="text-[13px] text-ink-3">Neither the Safety nor the Regulatory review is active, so no RMES decision applies.</p>;
  return (
    <ul className="space-y-2">
      {lanes.map((l) => (
        <li key={l.dept} data-testid={`wb-approval-effective-${l.dept}`} className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="w-28 font-medium text-ink">{DEPT_LABEL[l.dept]}</span>
          <DecisionBadge d={l.decision} />
          <span className="text-[12.5px] text-ink-3" data-testid={`wb-approval-effective-source-${l.dept}`}>
            {l.source === "late" ? (
              <>
                from the later department review <Mono>{l.latePoint?.opKey || l.latePoint?._id}</Mono>
                {l.latePoint?.reviewedAt ? ` (${fmtDateTime(l.latePoint.reviewedAt)})` : ""}
                {l.rmesDecision ? `; RMES decision was "${l.rmesDecision}"` : ""}
              </>
            ) : (
              "from the department's RMES decision"
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PartialRead({ c, rule, canAct, onAttest }: { c: CaseVM; rule: ApprovalRule; canAct: boolean; onAttest(text: string): Promise<string | null> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (rule.read.confidence === "complete") return null;
  return (
    <Notice tone={rule.attested ? "info" : "warn"} testId="wb-approval-partial">
      <p className="font-medium">{rule.attested ? "You attested the partial read of later department-review decisions." : "Later department-review decisions could not be read with your access."}</p>
      <ul className="mt-1 list-disc pl-5 text-[13px] text-ink-2" data-testid="wb-counts-unread">
        {rule.read.unread.map((u, i) => (
          <li key={i}>{u.reason}</li>
        ))}
      </ul>
      {c.lateCompletionsText && (
        <p className="mt-2 text-[13px] text-ink-2">
          Hint, late completions recorded on the case: <span className="whitespace-pre-line text-ink">{c.lateCompletionsText}</span>
        </p>
      )}
      {!rule.attested && rule.policy === "fail-closed" && <p className="mt-2 text-[13px]" data-testid="wb-approval-partial-why">{APPROVE_BLOCKED_PARTIAL}</p>}
      {!rule.attested && rule.policy === "attest" && canAct && (
        <div className="mt-3 space-y-2">
          <Field label="Attestation" required hint="At least 20 characters. Recorded in the audit log first; the decision then uses the department-review points you can see, else the RMES decisions.">
            <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={2} data-testid="wb-approval-attest-text" />
          </Field>
          <Button
            size="sm"
            icon={<ShieldCheck size={14} />}
            disabled={text.trim().length < 20 || busy}
            data-testid="wb-counts-attest"
            onClick={async () => {
              setBusy(true);
              setErr(await onAttest(text.trim()));
              setBusy(false);
            }}
          >
            {busy ? "Recording…" : "Attest"}
          </Button>
          {err && <p className="text-[13px] text-bad">{err}</p>}
        </div>
      )}
    </Notice>
  );
}

export function ApprovalDecision() {
  const { caseId, act } = useParams();
  const { me, actions, flagsFor, notify } = useWorkbench();
  const tasks = useTasks();
  const bundle = useCaseBundle(caseId);
  const cfg = useFormRows<ConfigVM>("CIQ_Config_Version_A00");
  const held = caseId ? tasks.heldTask("CIQ_Case_A00", caseId, "CASE_S6") : null;
  const task = held && held.activityInstanceId === act ? held : null;
  const c = bundle.data?.case;

  // pinned release → the neutral closing text prefill
  const [pinned, setPinned] = useState<PinnedConfig | null>(null);
  useEffect(() => {
    let alive = true;
    if (!cfg.data || !c?.releaseItemId) return;
    void loadPinnedConfig(cfg.data, c.releaseItemId)
      .then((p) => alive && setPinned(p))
      .catch(() => alive && setPinned(null));
    return () => {
      alive = false;
    };
  }, [cfg.data, c?.releaseItemId]);
  const closing = closingTextFrom(pinned);

  const [decision, setDecision] = useState<DecisionInput["decision"] | null>(null);
  const [reason, setReason] = useState("");
  const [closingText, setClosingText] = useState<string | null>(null);
  const [attestedNow, setAttestedNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [valuesConfirmed, setValuesConfirmed] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const policy = c ? flagsFor(c).countsPolicy : "fail-closed";
  const rule = useMemo(
    () => (c && bundle.data ? approvalRule({ c, points: bundle.data.lists.points, policy, attested: attestedNow || attestedBefore(bundle.data.events, c, me) }) : null),
    [c, bundle.data, policy, attestedNow, me],
  );

  if (bundle.loading && !bundle.data) return <Page testId="wb-approval"><Skeleton rows={6} testId="wb-approval-loading" /></Page>;
  if (!c || !rule)
    return (
      <Page testId="wb-approval">
        <ErrorBanner error={bundle.error ?? "This case could not be read."} onRetry={bundle.reload} />
        <Link to="/approvals" className="text-[13.5px] text-brand hover:underline">
          Back to approvals
        </Link>
      </Page>
    );

  const input: DecisionInput = { decision: decision ?? "Approved", reason, closingText: closingText ?? closing.text };
  const canAct = !!task && !sent;

  const onAttest = async (text: string): Promise<string | null> => {
    try {
      await actions.writeAudit({
        category: "Case",
        actionCode: "count.attested",
        caseCode: c.caseCode,
        cycleNo: c.cycleNo,
        caseItemId: c._id,
        objectKind: "Case",
        objectItemId: c._id,
        objectKey: `${c.caseCode}:approval`,
        eventReason: text,
        snapshot: { value: rule.lanes.map((l) => ({ dept: l.dept, decision: l.decision, source: l.source })), read: [{ flow: "CIQ_Open_Point_A00", quality: bundle.data!.quality.points, rows: bundle.data!.lists.points.rows.length }], unread: rule.read.unread },
      });
      setAttestedNow(true);
      notify("Attestation recorded.", "success");
      return null;
    } catch (e) {
      return `The attestation could not be recorded, so nothing changed (${errorText(e)}).`;
    }
  };

  const send = async () => {
    if (!task || !decision) return;
    const probs = decisionProblems(input, rule);
    setSubmitResult(null);
    if (probs.length) {
      setSubmitResult({ ok: false, kind: "problems", problems: probs, message: "Not sent: fix these first." });
      return;
    }
    setBusy(true);
    try {
      if (!valuesConfirmed) {
        const save = await actions.saveAtStep(task, buildApprovalPatch(c, input, me));
        setSaveResult(save);
        if (!save.ok) return;
      }
      const sub = await actions.submitStep(task, { extraChecks: [approvalCheck(rule)] });
      setSubmitResult(sub);
      if (sub.ok) setSent(decision);
    } catch (e) {
      setSubmitResult({ ok: false, kind: "refused", message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const activeRmes = (["SAF", "REG"] as const).filter((d) => c.lanes[d].active);

  return (
    <Page testId="wb-approval">
      <Link to="/approvals" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} /> Approvals
      </Link>
      <PageHeader
        eyebrow="Overall approval"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.tradeName || c.title || "Case"} <Mono className="text-[15px] font-normal text-ink-3">{c.caseCode || c._id}</Mono>
          </span>
        }
        subtitle={[c.supplierLegalName, c.mainInci].filter(Boolean).join(" · ")}
        actions={
          <>
            <StatusBadge status={c.status} />
            <StepBadge step={c.currentSteps.find((s) => s === "CASE_S6") ?? c.currentSteps[0] ?? null} />
          </>
        }
      />
      <ErrorBanner error={bundle.error} onRetry={bundle.reload} />
      <WarningList warnings={bundle.warnings} />
      {!task && !sent && (
        <Notice tone="info" testId="wb-approval-readonly">
          You don't hold this task, so this page is read-only. {tasks.loading ? "Loading your tasks…" : "It may have been decided already, or it belongs to someone else."}
        </Notice>
      )}

      <Card>
        <CardHeader title="Case" />
        <div className="p-4">
          <KeyValue
            cols={3}
            items={[
              { k: "Case", v: <Mono>{`${c.caseCode || c._id}${c.cycleNo !== null ? ` · cycle ${c.cycleNo}` : ""}`}</Mono> },
              { k: "BDF material", v: c.bdfMaterialNo || "—" },
              { k: "Supplier", v: c.supplierLegalName ? <CodeText text={`${c.supplierLegalName}${c.supplierCode ? ` (${c.supplierCode})` : ""}`} /> : "—" },
              { k: "Owner RMM", v: c.ownerRmm?.name || c.bdfContactName || "—" },
              { k: "Release", v: c.releaseKey ? <Mono>{c.releaseKey}</Mono> : "—" },
              { k: "Overall approval required", v: c.overallApprovalRequired ? "Yes" : "No" },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Department reviews" subtitle="Sign-off of every active department review, as recorded on the case." />
        <LaneSummary c={c} />
      </Card>

      <Card>
        <CardHeader title="Effective Safety and Regulatory decisions" subtitle="A later department-review decision takes precedence over the RMES decision." />
        <div className="space-y-3 p-4">
          <EffectiveDecisions lanes={rule.lanes} />
          <PartialRead c={c} rule={rule} canAct={canAct} onAttest={onAttest} />
        </div>
      </Card>

      {/* T2's read-only RmesSummary (its own card; no input, no lock, no link to the editing route). */}
      {activeRmes.map((d) => (
        <RmesSummary key={d} c={c} dept={d} />
      ))}

      <Card data-testid="wb-approval-decision">
        <CardHeader title="Overall decision" subtitle={`Decided by ${me.Name || "you"}. The native Kissflow reject is not used here.`} />
        <div className="space-y-4 p-4">
          {sent ? (
            <Notice tone="ok" testId="wb-approval-sent">
              <p className="font-medium">Decision sent: {sent === "elsewhere" ? "submitted in Kissflow" : sent}.</p>
              <p className="mt-1 text-[13px] text-ink-2">
                The case continues in Kissflow.
                {sent === "Rejected" ? " The closing text is stored on the case; the supplier is not notified automatically yet." : ""}
              </p>
              <Link to="/approvals" className="mt-2 inline-block text-[13px] font-medium text-brand hover:underline">
                Back to approvals
              </Link>
            </Notice>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!canAct || !rule.canApprove}
                  aria-pressed={decision === "Approved"}
                  data-testid="wb-approval-approve"
                  title={rule.canApprove ? undefined : rule.why.join(" ")}
                  onClick={() => {
                    setDecision("Approved");
                    setValuesConfirmed(false);
                  }}
                  className={cx(
                    "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                    decision === "Approved" ? "border-ok bg-ok-soft" : "border-line-strong bg-surface hover:bg-surface-2",
                  )}
                >
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">Approve</span>
                    <span className="block text-[12.5px] text-ink-2">{rule.canApprove ? "Every active Safety and Regulatory decision is Approved." : rule.why.join(" ")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!canAct}
                  aria-pressed={decision === "Rejected"}
                  data-testid="wb-approval-reject"
                  onClick={() => {
                    setDecision("Rejected");
                    setValuesConfirmed(false);
                  }}
                  className={cx(
                    "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                    decision === "Rejected" ? "border-bad bg-bad-soft" : "border-line-strong bg-surface hover:bg-surface-2",
                  )}
                >
                  <XCircle size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden />
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">Reject</span>
                    <span className="block text-[12.5px] text-ink-2">The case ends without a final-release request.</span>
                  </span>
                </button>
              </div>
              <Field label="Reason" required={decision === "Rejected"} hint={decision === "Rejected" ? "Internal: stays with Beiersdorf." : decision === "Approved" ? "Optional for an approval." : "Required to reject; optional for an approval."}>
                <TextArea value={reason} onChange={(e) => {
                    setReason(e.target.value);
                    setValuesConfirmed(false);
                  }} rows={3} disabled={!canAct} data-testid="wb-approval-reason" />
              </Field>
              {decision === "Rejected" && (
                <>
                  <Field
                    label="Neutral closing text for the supplier"
                    required
                    hint={`${closing.source === "bundle" ? "Prefilled from the pinned release's text bundle." : "Prefilled with the default neutral text (no text-bundle entry found)."} Stored on the case; the Workbench does not send it.`}
                  >
                    <TextArea value={input.closingText} onChange={(e) => {
                        setClosingText(e.target.value);
                        setValuesConfirmed(false);
                      }} rows={4} disabled={!canAct} data-testid="wb-approval-closing" />
                  </Field>
                  <p className="text-[13px] text-ink-2">
                    Completion trigger: <Mono>{OVERALL_REJECTION}</Mono>
                  </p>
                </>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" icon={<Stamp size={15} />} disabled={!canAct || !decision || busy} onClick={send} data-testid="wb-approval-submit">
                  {busy ? "Sending…" : valuesConfirmed ? "Submit decision" : "Save and submit decision"}
                </Button>
                {!decision && canAct && <span className="text-[13px] text-ink-3">Choose Approve or Reject first.</span>}
              </div>
            </>
          )}
          {task && saveResult?.kind === "kwb-refused" ? (
            <KwbFallback
              task={task}
              caseCode={c.caseCode}
              onResolved={(r) => {
                if (r.submittedElsewhere) setSent("elsewhere");
                else if (r.matches) setValuesConfirmed(true);
              }}
            />
          ) : (
            <>
              {task && !saveResult && (
                <StoredKwbFallback
                  task={task}
                  caseCode={c.caseCode}
                  onResolved={(r) => {
                    if (r.submittedElsewhere) setSent("elsewhere");
                    else if (r.matches) setValuesConfirmed(true);
                  }}
                />
              )}
              <WriteOutcome result={saveResult && !saveResult.ok ? saveResult : null} task={task ?? undefined} caseCode={c.caseCode} />
            </>
          )}
          <WriteOutcome result={submitResult} task={task ?? undefined} caseCode={c.caseCode} okMessage="Decision sent." />
        </div>
      </Card>
    </Page>
  );
}
