// Point detail `#/points/:pointId?task=` (§8.9). Shows the header, the question and justifications, the current
// response, the Rounds history and Thread_Text. EVERY action needs the held task for this point at that step (ground
// rule 13); without it the page is read-only. Saves run through saveAtStep (write-then-verify) and then submitStep;
// a K-WB refusal opens the fallback panel (values sheet, Open task form, Re-read), after which the step can be
// submitted from here. The Return uses T0's sendBackPoint (§7.5) with its two fallbacks.
import { Check, CornerUpLeft, Send, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, cx, PageHeader } from "@/components/ui/primitives";
import { Field, Segmented, TextArea, TextInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Table, Td, Tr } from "@/components/ui/data";
import { deptOfOpReviewStep, listValues, stepDef } from "../../schema";
import { DEPT_LABEL } from "../../domain/labels";
import { useActions, useCaseBundle, usePoint, useTasks, useWorkbench, useWorkbenchContext } from "../../data/hooks";
import { addDays } from "../../data/normalize";
import type { ActionResult, Patch, PointVM, SaveResult, SubmitResult, TaskVM } from "../../data/viewModels";
import { StatusBadge, StepBadge } from "../../ui/badges";
import { KwbFallback } from "../../ui/KwbFallback";
import { ManualRecordNote } from "../../ui/ManualRecordNote";
import { ReReadUncertain, WriteOutcome } from "../../ui/WriteOutcome";
import { taskRouterPath } from "../../pages/TaskRouter";
import { ErrorBanner, Facts, Note, NotFound, Page, Skeleton, Warnings } from "../review/kit";
import { useKeptTask } from "../review/useKeptTask";
import {
  buildAcceptPatch,
  buildConfirmWithdrawalPatch,
  buildManualResponsePatch,
  buildProgressPatch,
  buildS1WithdrawPatch,
  buildWithdrawPatch,
  docRefsOf,
  lateDecisionVisible,
  manualResponseProblems,
  pointPanel,
  RESPONSE_KINDS,
  type PointPanel,
} from "./model";
import { fmtDateTime } from "../audit/format";

const deptLabel = (d: string) => DEPT_LABEL[d as keyof typeof DEPT_LABEL] ?? d;

export function PointDetail() {
  const { pointId } = useParams();
  const [sp] = useSearchParams();
  const act = sp.get("task") ?? undefined;
  const tasks = useTasks();
  // Read with the ?task= activity only while it is still held: after a submit or send-back it has left the queue and
  // a getItem on it would only be refused ("moved out of your queue"). Wait for the task list before reading.
  const liveAct = act && (tasks.data ?? []).some((t) => t.flow === "CIQ_Open_Point_A00" && t.instanceId === pointId && t.activityInstanceId === act) ? act : undefined;
  const pt = usePoint(tasks.data || tasks.error ? pointId : null, liveAct);
  // keep the last good read of THIS point while a re-read under another key loads (the outcome stays on screen)
  const last = useRef<PointVM | null>(null);
  if (pt.data) last.current = pt.data;
  const p = pt.data ?? (last.current?._id === pointId ? last.current : undefined);
  const [done, setDone] = useState(false);
  useEffect(() => setDone(false), [act]);
  const panelBase = p ? pointPanel(p, tasks.data ?? [], act) : null;
  // The case is needed for the late-decision rule and the Return's portal contacts (COH-12); optional.
  const bundle = useCaseBundle(panelBase?.mode === "review" && p?.caseItemId ? p.caseItemId : null);
  const c = bundle.data?.case ?? null;
  const panel = p ? pointPanel(p, tasks.data ?? [], act, { lateDecision: lateDecisionVisible(panelBase?.task?.step ?? null, p) }) : null;

  if (!pointId) return null;
  if ((pt.loading || (!tasks.data && !tasks.error)) && !p)
    return (
      <Page testId="wb-point">
        <Skeleton rows={6} />
      </Page>
    );
  if (!p)
    return (
      <Page testId="wb-point">
        <ErrorBanner error={pt.error} onRetry={pt.reload} />
        <NotFound title="This open point could not be read with your access" testId="wb-point-missing">
          It may belong to another department, or it was completed. Go back to your queue.
        </NotFound>
      </Page>
    );
  return (
    <Page testId="wb-point">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Open point {p.caseCode && <span className="font-mono normal-case">{p.caseCode}{p.cycleNo ? ` · C${p.cycleNo}` : ""}</span>}
          </span>
        }
        title={<span className="font-mono text-[20px]">{p.opKey || p._id}</span>}
        subtitle={p.refLabel ? `${p.kind} · ${p.refLabel}` : p.kind}
        actions={
          <>
            {p.step ? <StepBadge step={p.step} /> : <StatusBadge status={p.status} />}
            {p.caseItemId && (
              <Link to={`/cases/${p.caseItemId}`} className="text-[13px] text-brand hover:underline">
                Open the case
              </Link>
            )}
          </>
        }
      />
      {done ? (
        pt.error && <Note tone="neutral">The point moved on and is no longer readable with your access; the values below are the last ones read.</Note>
      ) : (
        <ErrorBanner error={pt.error} onRetry={pt.reload} />
      )}
      <Warnings items={[...pt.warnings, p.readQuality === "row" ? "Read from a list row: some fields may be missing." : null]} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <PointFacts p={p} />
          <RoundsCard p={p} />
          <Card>
            <CardHeader title="Thread" subtitle="Dated notes written with each round." />
            <div className="px-4 py-3 text-[13px] whitespace-pre-wrap text-ink-2" data-testid="wb-point-thread">
              {p.threadText || <span className="text-ink-3">No thread yet.</span>}
            </div>
          </Card>
        </div>
        <div className="min-w-0">{panel && <ActionPanel key={act ?? ""} p={p} panel={panel} next={(tasks.data ?? []).find((t) => t.flow === "CIQ_Open_Point_A00" && t.instanceId === p._id && t.activityInstanceId !== (act ?? panelBase?.task?.activityInstanceId)) ?? null} onDone={() => setDone(true)} portalContactIds={c?.portalContactIds} caseNote={bundle.error && panelBase?.mode === "review" ? "The case could not be read with your access: the point keeps its portal contacts on a Return." : null} />}</div>
      </div>
    </Page>
  );
}

function PointFacts({ p }: { p: PointVM }) {
  const docs = docRefsOf(p.responseDocRefsJson);
  return (
    <Card>
      <CardHeader title="Point" />
      <div className="space-y-4 px-4 py-3">
        <Facts
          items={[
            { k: "Kind", v: [p.kind, p.kindLabel && p.kindLabel !== p.kind ? `(${p.kindLabel})` : ""].filter(Boolean).join(" ") },
            { k: "Goes to the supplier", v: p.toSupplier ? "Yes" : "No" },
            { k: "Reviewing department", v: deptLabel(p.dept) },
            { k: "Raised by", v: deptLabel(p.raisedByDept) },
            { k: "Reference", v: [p.refKind, p.refSectionKey, p.refFieldKey, p.refRowId].filter(Boolean).join(" · ") },
            { k: "Round", v: p.roundNo ?? "" },
            { k: "Responsible", v: [p.responsibleName, p.responsibleDeptLabel].filter(Boolean).join(" · ") },
            { k: "Progress", v: p.progress },
            { k: "Internal due", v: p.internalDueDate },
            { k: "Supplier due", v: p.supplierDueDate },
          ]}
        />
        <Facts
          items={[
            { k: "Question", v: p.questionText, testId: "wb-point-question-text" },
            { k: "Supplier justification", v: p.supplierJustification },
            { k: "Internal justification", v: p.internalJustification },
          ]}
        />
        <div className="rounded-lg border border-line p-3">
          <p className="mb-2 text-[12.5px] font-semibold text-ink-2">Current response</p>
          <Facts
            items={[
              { k: "Response kind", v: p.responseKind, testId: "wb-point-response-kind" },
              { k: "Awaiting response", v: p.awaitingResponse },
              { k: "Response", v: p.responseText },
              { k: "Documents (names as given)", v: docs.map((d) => d.name).join(", ") },
            ]}
          />
        </div>
        {(p.outcome || p.reviewedAt || p.returnReason) && (
          <Facts
            items={[
              { k: "Outcome", v: p.outcome ? <Badge tone={p.outcome === "Accepted" ? "ok" : "neutral"}>{p.outcome}</Badge> : "" },
              { k: "Outcome reason", v: p.outcomeReason },
              { k: "Last return reason", v: p.returnReason },
              { k: "Reviewed", v: [p.reviewedBy?.name || p.reviewedByEmail, p.reviewedAt ? fmtDateTime(p.reviewedAt) : ""].filter(Boolean).join(" · ") },
              { k: "On behalf of", v: p.onBehalfOf },
              { k: "Late decision", v: [p.lateDecision, p.lateDecisionReason].filter(Boolean).join(": ") },
            ]}
          />
        )}
      </div>
    </Card>
  );
}

function RoundsCard({ p }: { p: PointVM }) {
  return (
    <Card data-testid="wb-point-rounds">
      <CardHeader title="Rounds" subtitle="Each decision on a round adds a row." />
      {p.rounds.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-ink-3">No rounds recorded yet.</p>
      ) : (
        <Table head={["Round", "Outcome", "Question", "Response", "Reason", "Reviewed"]} dense>
          {p.rounds.map((r, i) => (
            <Tr key={r._id || i}>
              <Td>{r.roundNo ?? "—"}</Td>
              <Td>
                <Badge tone={r.outcome === "Accepted" ? "ok" : r.outcome === "Returned" ? "warn" : "neutral"}>{r.outcome || "—"}</Badge>
              </Td>
              <Td className="max-w-[220px] truncate" title={r.questionText}>
                {r.questionText || "—"}
              </Td>
              <Td className="max-w-[200px] truncate" title={r.responseText}>
                {[r.responseKind, r.responseText].filter(Boolean).join(": ") || "—"}
              </Td>
              <Td className="max-w-[200px] truncate" title={r.reason}>
                {r.reason || "—"}
              </Td>
              <Td className="whitespace-nowrap">{[r.reviewedBy?.name, r.reviewedAt ? fmtDateTime(r.reviewedAt) : ""].filter(Boolean).join(" · ") || "—"}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- the action panel

type Outcome = { save?: SaveResult | null; submit?: SubmitResult | null; action?: (ActionResult & { mode?: string }) | null };

function useStepRunner(task: TaskVM | null) {
  const actions = useActions();
  const { notify } = useWorkbench();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome>({});
  const [kwbOpen, setKwbOpen] = useState(false);
  const [kwbReady, setKwbReady] = useState(false);
  const [okMessage, setOkMessage] = useState("Sent.");
  const run = async (patch: Patch | null, okMsg: string, o: { submit?: boolean } = {}) => {
    if (!task) return;
    setBusy(true);
    setOut({});
    setKwbReady(false);
    setOkMessage(okMsg);
    try {
      if (patch) {
        const s = await actions.saveAtStep(task, patch);
        setOut({ save: s });
        if (s.kind === "kwb-refused") setKwbOpen(true);
        if (!s.ok) return;
        if (o.submit === false) {
          notify(okMsg, "success"); // a save-only action: one toast, after the read-back
          return;
        }
      }
      const r = await actions.submitStep(task);
      setOut((x) => ({ ...x, submit: r })); // WriteOutcome raises the single "ok" toast with okMessage
      if (r.ok) setKwbOpen(false);
    } catch (e) {
      setOut({ save: { ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) } });
    } finally {
      setBusy(false);
    }
  };
  return { task, busy, out, setOut, run, kwbOpen, setKwbOpen, kwbReady, setKwbReady, setBusy, actions, okMessage };
}

function ActionPanel({ p, panel, portalContactIds, caseNote, onDone, next }: { p: PointVM; panel: PointPanel; portalContactIds?: string; caseNote: string | null; onDone(): void; next: TaskVM | null }) {
  // the pending-sheet store (K-WB values kept across a reload, §7.4) lives on the provider
  const { pending } = useWorkbenchContext();
  const { caps } = useWorkbench();
  const kept = useKeptTask(panel.task, p._id);
  const t = kept.task;
  const r = useStepRunner(t);
  const [handedOff, setHandedOff] = useState<string | null>(null);
  const stored = t && kept.held ? pending.load(t.key) : null;
  const showKwb = !!t && kept.held && (r.kwbOpen || !!stored);
  const done = r.out.submit?.ok === true || (r.out.action?.ok === true && r.out.action.mode === "sdk") || !!handedOff;
  const back = caps.reviewerDepts.some((d) => d !== "RMM") ? "/review" : "/my-work";
  useEffect(() => {
    if (done) onDone();
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  // The outcome stays on screen after the task left the queue (tasks reload after every write).
  if (done && t)
    return (
      <div className="space-y-3">
        <Note tone="ok" testId="wb-point-done">
          {handedOff ? (
            <span data-testid="wb-kwb-reread-result">{handedOff}</span>
          ) : r.out.action?.ok ? (
            r.out.action.message
          ) : (
            "Done: this step was sent and the point moved on."
          )}{" "}
          {next?.step && next.activityInstanceId !== t.activityInstanceId ? (
            <Link className="font-medium text-brand hover:underline" to={`/points/${p._id}?task=${encodeURIComponent(next.activityInstanceId)}`} data-testid="wb-point-continue">
              Continue: you now hold "{stepDef(next.step).name}"
            </Link>
          ) : (
            <Link className="text-brand hover:underline" to={back}>
              Back to your queue
            </Link>
          )}
        </Note>
        <OutcomeBlock r={r} task={t} caseCode={p.caseCode} hideAction />
      </div>
    );
  if (panel.mode === "readonly" || !t)
    return (
      <Card data-testid="wb-point-readonly">
        <CardHeader title="Actions" />
        <p className="px-4 py-3 text-[13.5px] text-ink-2">{t && !kept.held ? "This task is no longer in your queue." : (panel.note ?? "You don't hold this task.")} The point is shown read-only.</p>
      </Card>
    );
  if (panel.mode === "unresolved" || !t.step)
    return (
      <Card>
        <CardHeader title="Actions" />
        <div className="space-y-2 px-4 py-3 text-[13.5px] text-ink-2">
          <p>{panel.note ?? "Task at an unidentified step: open it in Kissflow."}</p>
          <Link className="text-brand hover:underline" to={taskRouterPath(t)}>
            Open in Kissflow
          </Link>
        </div>
      </Card>
    );
  const stepName = stepDef(t.step).name;
  const sendBackSheet = stored?.mode === "values+sendback" || r.out.action?.mode === "kwb" || r.out.action?.mode === "openForm";
  return (
    <div className="space-y-3" data-testid={`wb-step-${t.step}`}>
      <Card>
        <CardHeader title={panel.mode === "s1" ? "Supplier responded (manual record)" : `Decide: ${stepName}`} subtitle={`Your task: ${stepName}`} />
        <div className="space-y-4 px-4 py-3">
          {panel.mode === "s1" ? <S1Panel p={p} r={r} /> : <ReviewPanel p={p} panel={panel} r={r} portalContactIds={portalContactIds} />}
          {caseNote && <Note tone="neutral">{caseNote}</Note>}
        </div>
      </Card>
      <OutcomeBlock r={r} task={t} caseCode={p.caseCode} />
      {showKwb && (
        <div className="space-y-2">
          <KwbFallback
            task={t}
            caseCode={p.caseCode}
            onResolved={(x) => {
              r.setKwbReady(x.matches && !x.submittedElsewhere);
              if (x.submittedElsewhere) {
                r.setKwbOpen(false);
                setHandedOff(sendBackSheet ? "Sent back in Kissflow; the Workbench could not check the values with your access." : "Submitted in Kissflow; the Workbench could not check the values with your access.");
              }
            }}
          />
          {r.kwbReady && (
            <Button variant="primary" icon={<Send size={14} />} disabled={r.busy} data-testid="wb-point-submit-after-kwb" onClick={() => r.run(null, "Sent.")}>
              Submit this step
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function OutcomeBlock({ r, task, caseCode, hideAction }: { r: ReturnType<typeof useStepRunner>; task: TaskVM; caseCode?: string; hideAction?: boolean }) {
  const { save, submit, action } = r.out;
  return (
    <div className="space-y-2" aria-live="polite">
      {save && !save.ok && save.kind !== "kwb-refused" && <WriteOutcome result={save} task={task} caseCode={caseCode} />}
      {submit && <WriteOutcome result={submit} task={task} caseCode={caseCode} okMessage={r.okMessage} />}
      {action && !hideAction && (
        <Note tone={action.ok ? "ok" : action.kind === "fallback" ? "warn" : "bad"} testId="wb-point-action-result">
          {action.message}
          {action.kind === "timeout" && (
            <span className="mt-2 block">
              <ReReadUncertain flow={task.flow} itemId={task.instanceId} act={task.activityInstanceId} />
            </span>
          )}
        </Note>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- OPNT_S1

function S1Panel({ p, r }: { p: PointVM; r: ReturnType<typeof useStepRunner> }) {
  const [mode, setMode] = useState<"response" | "withdraw">("response");
  const [kind, setKind] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const owner = deptLabel(p.dept);
  return (
    <div className="space-y-4" data-testid="wb-point-s1">
      <ManualRecordNote>Supplier hand-offs are not connected yet. Record what the supplier answered, exactly as received.</ManualRecordNote>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "response", label: "Supplier responded" },
          { value: "withdraw", label: "Withdraw point" },
        ]}
      />
      {mode === "response" ? (
        <div className="space-y-3">
          <Field label="Response kind" required>
            <div data-testid="wb-point-response-kind-input">
              <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Response kind">
                <option value="">Select…</option>
                {RESPONSE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Response">
            <TextArea rows={3} value={text} onChange={(e) => setText(e.target.value)} data-testid="wb-point-response-text" />
          </Field>
          <Field label="Document file names" hint="One per line, as the supplier named them. Files are not uploaded here.">
            <TextArea rows={2} value={files} onChange={(e) => setFiles(e.target.value)} data-testid="wb-point-response-files" />
          </Field>
          <Field label="Supplier responsible e-mail">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="wb-point-response-email" />
          </Field>
          {errors.length > 0 && <Note tone="bad">{errors.join(" ")}</Note>}
          <Button
            variant="primary"
            icon={<Send size={14} />}
            disabled={r.busy}
            data-testid="wb-point-manual-response"
            onClick={() => {
              const input = { responseKind: kind, responseText: text, docFileNames: files.split(/\n+/), supplierResponsibleEmail: email };
              const probs = manualResponseProblems(input);
              setErrors(probs.map((x) => x.message));
              if (!probs.length) void r.run(buildManualResponsePatch(input), `Response recorded by hand. The point moved to the ${owner} review.`);
            }}
          >
            {r.busy ? "Saving…" : "Record response and send on"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Note tone="neutral">Withdrawing writes "Withdrawn by Beiersdorf". The point still goes to the {owner} review, where the owner confirms the withdrawal.</Note>
          <Field label="Reason" required>
            <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="wb-point-withdraw-reason" />
          </Field>
          <Button variant="danger" icon={<Undo2 size={14} />} disabled={r.busy || !reason.trim()} data-testid="wb-point-withdraw" onClick={() => void r.run(buildS1WithdrawPatch(reason), `Point withdrawn. The ${owner} review confirms it.`)}>
            Withdraw point
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- OPNT_R_<D>

function ReviewPanel({ p, panel, r, portalContactIds }: { p: PointVM; panel: PointPanel; r: ReturnType<typeof useStepRunner>; portalContactIds?: string }) {
  const { me } = useWorkbench();
  const t = panel.task!;
  const step = t.step!;
  const has = (a: string) => panel.actions.includes(a as never);
  const decisions = (["accept", "withdraw", "return"] as const).filter((a) => has(a));
  const [mode, setMode] = useState<"accept" | "withdraw" | "return">(decisions[0] ?? "accept");
  const docs = useMemo(() => docRefsOf(p.responseDocRefsJson), [p.responseDocRefsJson]);
  const [doc, setDoc] = useState(docs[0]?.name ?? "");
  const [onBehalf, setOnBehalf] = useState("");
  const [note, setNote] = useState("");
  const [late, setLate] = useState("");
  const [lateReason, setLateReason] = useState("");
  const [reason, setReason] = useState("");
  const [progress, setProgress] = useState(p.progress || "In progress");
  const dept = deptOfOpReviewStep(step);

  if (has("confirm-withdrawal"))
    return (
      <div className="space-y-3">
        <Note tone="neutral">
          This point was withdrawn at "Waiting for supplier"{p.outcomeReason ? `: ${p.outcomeReason.replace(/[.\s]+$/, "")}` : ""}. Confirm the withdrawal to close it.
        </Note>
        <Button variant="primary" icon={<Check size={14} />} disabled={r.busy} data-testid="wb-point-confirm-withdrawal" onClick={() => void r.run(buildConfirmWithdrawalPatch(p, me, new Date()), "Withdrawal confirmed.")}>
          Confirm withdrawal
        </Button>
      </div>
    );
  if (has("submit"))
    return (
      <div className="space-y-3">
        <Note tone="neutral">{panel.note}</Note>
        <Button variant="primary" icon={<Send size={14} />} disabled={r.busy} data-testid="wb-point-submit" onClick={() => void r.run(null, "Sent.")}>
          Submit
        </Button>
      </div>
    );

  const lateBlock: ReactNode = has("late-decision") ? (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Late decision" hint={`The overall approver uses this decision instead of the earlier ${dept ? deptLabel(dept) : ""} RMES decision.`}>
        <div data-testid="wb-point-late-decision">
          <Select value={late} onChange={(e) => setLate(e.target.value)} aria-label="Late decision">
            <option value="">Select…</option>
            {listValues("CIQ_Decision").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      </Field>
      <Field label="Late decision reason">
        <TextArea rows={2} value={lateReason} onChange={(e) => setLateReason(e.target.value)} />
      </Field>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {decisions.length > 1 && (
        <div role="tablist" aria-label="Decision" className="inline-flex max-w-full flex-wrap rounded-lg border border-line-strong bg-surface-2 p-0.5">
          {decisions.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={mode === d}
              // "wb-point-return" opens the Return form; its submit is "wb-point-return-submit"
              data-testid={d === "return" ? "wb-point-return" : `wb-point-mode-${d}`}
              onClick={() => setMode(d)}
              className={cx("h-8 min-w-16 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors", mode === d ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink")}
            >
              {d === "accept" ? "Accept" : d === "withdraw" ? "Withdraw" : "Return"}
            </button>
          ))}
        </div>
      )}
      {mode === "accept" && (
        <div className="space-y-3">
          {docs.length > 0 && (
            <Field label="Accepted document" hint="Picked from the documents named in the response.">
              <Select value={doc} onChange={(e) => setDoc(e.target.value)} aria-label="Accepted document">
                <option value="">None</option>
                {docs.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="On behalf of">
            <TextInput value={onBehalf} onChange={(e) => setOnBehalf(e.target.value)} />
          </Field>
          <Field label="Note for the round">
            <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {lateBlock}
          <Button
            variant="primary"
            icon={<Check size={14} />}
            disabled={r.busy}
            data-testid="wb-point-accept"
            onClick={() =>
              void r.run(
                buildAcceptPatch(p, step, { acceptedDocFileName: doc || undefined, acceptedDocUploadedAt: docs.find((d) => d.name === doc)?.uploadedAt, onBehalfOf: onBehalf, note, lateDecision: late || undefined, lateDecisionReason: lateReason }, me, new Date()),
                "Point accepted. The review step is complete.",
              )
            }
          >
            {r.busy ? "Saving…" : "Accept and complete"}
          </Button>
        </div>
      )}
      {mode === "withdraw" && (
        <div className="space-y-3">
          <Field label="Reason" required>
            <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="wb-point-withdraw-reason" />
          </Field>
          <Field label="On behalf of">
            <TextInput value={onBehalf} onChange={(e) => setOnBehalf(e.target.value)} />
          </Field>
          <Button variant="danger" icon={<Undo2 size={14} />} disabled={r.busy || !reason.trim()} data-testid="wb-point-withdraw" onClick={() => void r.run(buildWithdrawPatch(p, reason, me, new Date(), onBehalf), "Point withdrawn. The review step is complete.")}>
            Withdraw point
          </Button>
        </div>
      )}
      {mode === "return" && <ReturnForm p={p} r={r} portalContactIds={portalContactIds} />}
      {has("progress") && (
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <div className="min-w-40 flex-1">
            <Field label="Progress">
              <Select value={progress} onChange={(e) => setProgress(e.target.value)} aria-label="Progress">
                {listValues("CIQ_OP_Progress").map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button disabled={r.busy} data-testid="wb-point-progress" onClick={() => void r.run(buildProgressPatch(progress), `Progress saved: ${progress}.`, { submit: false })}>
            Save progress
          </Button>
        </div>
      )}
    </div>
  );
}

function ReturnForm({ p, r, portalContactIds }: { p: PointVM; r: ReturnType<typeof useStepRunner>; portalContactIds?: string }) {
  const [q, setQ] = useState(p.questionText);
  const [sj, setSj] = useState(p.supplierJustification);
  const [sd, setSd] = useState(p.supplierDueDate || addDays(new Date(), 14));
  const [idd, setIdd] = useState(p.internalDueDate || addDays(new Date(), 7));
  const [reason, setReason] = useState("");
  const missing = [!q.trim() && "question", !sj.trim() && "supplier justification", !sd && "supplier due date", !idd && "internal due date", !reason.trim() && "reason"].filter(Boolean) as string[];
  const { notify } = useWorkbench();
  return (
    <div className="space-y-3" data-testid="wb-point-return-form">
      <Note tone="neutral">A Return saves the current round (Returned), asks a new question in round {(p.roundNo ?? 1) + 1} and sends the point back to "Waiting for supplier". Nothing is sent to the supplier automatically.</Note>
      <Field label="New question" required>
        <TextArea rows={3} value={q} onChange={(e) => setQ(e.target.value)} data-testid="wb-point-return-question" />
      </Field>
      <Field label="Supplier justification" required>
        <TextArea rows={2} value={sj} onChange={(e) => setSj(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier due date" required>
          <TextInput type="date" value={sd} onChange={(e) => setSd(e.target.value)} />
        </Field>
        <Field label="Internal due date" required>
          <TextInput type="date" value={idd} onChange={(e) => setIdd(e.target.value)} />
        </Field>
      </div>
      <Field label="Return reason" required>
        <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="wb-point-return-reason" />
      </Field>
      <Button
        variant="primary"
        icon={<CornerUpLeft size={14} />}
        disabled={r.busy || missing.length > 0}
        title={missing.length ? `Fill in: ${missing.join(", ")}` : undefined}
        data-testid="wb-point-return-submit"
        onClick={async () => {
          if (!r.task) return;
          r.setBusy(true);
          r.setOut({});
          try {
            const res = await r.actions.sendBackPoint(r.task, { questionText: q, supplierJustification: sj, supplierDueDate: sd, internalDueDate: idd, reason, portalContactIds: portalContactIds || undefined }, p);
            r.setOut({ action: res });
            if (res.mode === "kwb" || res.mode === "openForm") r.setKwbOpen(true);
            if (res.ok) notify(res.message, "success");
          } catch (e) {
            r.setOut({ action: { ok: false, message: e instanceof Error ? e.message : String(e) } });
          } finally {
            r.setBusy(false);
          }
        }}
      >
        {r.busy ? "Returning…" : "Return to the supplier step"}
      </Button>
      {missing.length > 0 && <p className="text-[12.5px] text-ink-3">Fill in: {missing.join(", ")}.</p>}
    </div>
  );
}
