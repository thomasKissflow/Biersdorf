// §8.6 Change requests: the list (#/change-requests), the detail with Triage at CHRQ_S1 (#/change-requests/:crId
// ?task=, held task only), and the manual CR (Y6 fallback, #/change-requests/new?case=). The case link is
// crBelongsTo (Case_Item_Id, or Case_Code + Cycle_No while it is blank). After final release the outcome is forced
// to "Refused – after final release", every impact to No, and an F8 "Change attempt" row is written (BR-052).
// "Accepted – scope extended" is offered only behind scopeExtendedOutcome (off for the MVP).
import { ArrowLeft, FilePlus2, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Mono, PageHeader } from "@/components/ui/primitives";
import { EmptyState, KeyValue } from "@/components/ui/data";
import { Field, Segmented, TextArea, TextInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { ActionError } from "../../data/actions";
import { crBelongsTo } from "../../data/counts";
import { useActions, useCaseBundle, useCaseList, useCr, useFormRows, useTasks, useWorkbench } from "../../data/hooks";
import { toCrVM } from "../../data/map";
import type { ActionResult, CaseVM, CrVM, Problem, RawItem, TaskVM } from "../../data/viewModels";
import { noticeKey } from "../../domain/keys";
import { DEPT_LABEL } from "../../domain/labels";
import { ManualRecordNote } from "../../ui/ManualRecordNote";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { StatusBadge } from "../../ui/badges";
import { CrRows } from "../case/CaseTabs";
import { PanelOutcome, ProblemsBanner, useBusy, type PanelResult } from "../case/panels/PanelKit";
import { ActionBanner, ErrorBanner, LoadingCard, Page, WarningsList, caseLabel } from "../case/shared";
import {
  AFTER_RELEASE_TEXT,
  CR_DEPTS,
  CR_FLOW,
  buildManualCr,
  buildTriagePatch,
  caseOfCr,
  changeAttemptEvent,
  effectiveTriage,
  emptyManualCr,
  isRefusal,
  isReleased,
  manualCrProblems,
  triageDefaults,
  triageOutcomeOptions,
  triageProblems,
  withCase,
  type ManualCrInput,
  type TriageInput,
} from "./crLogic";

const YN = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];

// ---------------------------------------------------------------- list

export function CrList() {
  const { caps } = useWorkbench();
  const nav = useNavigate();
  const tasks = useTasks();
  const list = useFormRows<RawItem>(CR_FLOW); // a Process list through the read ladder (raw rows)
  const cases = useCaseList();
  const crs = useMemo(() => (list.data ?? []).map((r) => toCrVM(r)), [list.data]);
  const triage = (tasks.data ?? []).filter((t) => t.flow === CR_FLOW && t.step === "CHRQ_S1");
  const heldAct = (id: string) => (tasks.data ?? []).find((t) => t.flow === CR_FLOW && t.instanceId === id)?.activityInstanceId;
  const open = (id: string) => {
    const act = heldAct(id);
    nav(`/change-requests/${id}${act ? `?task=${encodeURIComponent(act)}` : ""}`);
  };
  const caseCell = (cr: CrVM) => {
    const c = (cases.data ?? []).find((x) => crBelongsTo(cr, x));
    return c ? (
      <Link to={`/cases/${c._id}`} onClick={(e) => e.stopPropagation()} className="text-brand hover:underline">
        <Mono>{caseLabel(c.caseCode, c.cycleNo)}</Mono>
      </Link>
    ) : (
      <Mono className="text-ink-3">{caseLabel(cr.caseCode, cr.cycleNo)}</Mono>
    );
  };
  return (
    <Page testId="wb-crs">
      <PageHeader
        title="Change requests"
        subtitle="Changes the supplier asks for after submitting answers. Triage decides; the departments assess."
        actions={
          caps.canInitiate(CR_FLOW) && (
            <Button icon={<FilePlus2 size={16} />} onClick={() => nav("/change-requests/new")} data-testid="wb-crs-new">
              Manual change request
            </Button>
          )
        }
      />
      <ErrorBanner error={list.error} onRetry={list.reload} />
      <ErrorBanner error={tasks.error} onRetry={tasks.reload} />
      <ReadQualityBanner quality={list.quality} what="Change requests" scope="change requests" warnings={list.warnings} />
      {triage.length > 0 && (
        <Card data-testid="wb-crs-triage">
          <CardHeader title={`Triage (${triage.length})`} subtitle="Change requests waiting for your triage." />
          <ul className="divide-y divide-line px-4 text-[13.5px]">
            {triage.map((t) => (
              <li key={t.key} className="flex flex-wrap items-center gap-3 py-2">
                <Mono>{t.title}</Mono>
                <span className="flex-1" />
                <Button size="sm" variant="primary" onClick={() => nav(`/change-requests/${t.instanceId}?task=${encodeURIComponent(t.activityInstanceId)}`)}>
                  Triage
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {list.loading && !list.data ? (
        <LoadingCard label="Loading change requests…" />
      ) : (
        <Card>{crs.length ? <CrRows crs={crs} onOpen={open} caseOf={caseCell} stepOfRow={(cr) => (tasks.data ?? []).find((t) => t.flow === CR_FLOW && t.instanceId === cr._id && t.step)?.step ?? null} /> : <EmptyState title={list.quality === "admin" ? "No change requests yet" : "No change requests you can read"} />}</Card>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------- detail + triage

export function CrDetail() {
  const { crId } = useParams();
  const [params] = useSearchParams();
  const tasks = useTasks();
  const held = tasks.heldTask(CR_FLOW, crId ?? "", "CHRQ_S1");
  const act = params.get("task") ?? held?.activityInstanceId ?? undefined;
  const q = useCr(crId, act);
  if (q.loading && !q.data)
    return (
      <Page testId="wb-cr">
        <LoadingCard label="Loading the change request…" />
      </Page>
    );
  if (!q.data)
    return (
      <Page testId="wb-cr">
        <Link to="/change-requests" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          <ArrowLeft size={14} /> Change requests
        </Link>
        <ErrorBanner error={q.error ?? "This change request could not be read with your access."} onRetry={q.reload} />
      </Page>
    );
  const cr = q.data;
  const task = held && (!params.get("task") || held.activityInstanceId === params.get("task")) ? held : null;
  return (
    <Page testId="wb-cr">
      <Link to="/change-requests" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> Change requests
      </Link>
      <PageHeader
        eyebrow="Change request"
        title={<Mono className="text-[20px]">{cr.crKey || cr._id}</Mono>}
        subtitle={`${caseLabel(cr.caseCode, cr.cycleNo)} · ${cr.changeKind || "kind not set"}`}
        actions={<StatusBadge status={cr.status} />}
      />
      <ErrorBanner error={q.error} onRetry={q.reload} />
      <WarningsList warnings={q.warnings} />
      {!cr.portalCrItemId && <ManualRecordNote>This change request has no portal item: it was recorded by hand in the Workbench, or the portal hand-off is not connected yet.</ManualRecordNote>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Requested change" />
          <div className="p-4">
            <KeyValue
              items={[
                { k: "Change kind", v: cr.changeKind || "—" },
                { k: "Section / field / row", v: [cr.sectionKey, cr.fieldKey, cr.rowId].filter(Boolean).join(" / ") || "—" },
                { k: "Current value", v: <span className="whitespace-pre-wrap">{cr.currentValueText || "—"}</span> },
                { k: "Proposed value", v: cr.proposedValueJson ? <pre className="overflow-x-auto font-mono text-[12px] whitespace-pre-wrap">{cr.proposedValueJson}</pre> : "—" },
                { k: "Reason", v: <span className="whitespace-pre-wrap">{cr.changeReason || "—"}</span> },
                { k: "Outcome", v: cr.outcome || "not triaged" },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Department impact" subtitle="Assessed by each department with impact Yes." />
          <ul className="divide-y divide-line px-4 text-[13px]">
            {CR_DEPTS.map((d) => (
              <li key={d} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-12 font-medium">{d}</span>
                <span>{cr.impacts[d].impact || "—"}</span>
                {cr.impacts[d].impact === "Yes" && <Badge tone={cr.impacts[d].assessment ? "ok" : "warn"}>{cr.impacts[d].assessment || "assessment pending"}</Badge>}
                {cr.impacts[d].note && <span className="text-ink-3">{cr.impacts[d].note}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {task ? (
        <TriagePanel task={task} cr={cr} onChanged={q.reload} />
      ) : (
        <Card data-testid="wb-cr-readonly">
          <CardHeader title={cr.step === "CHRQ_S1" || !cr.outcome ? "Triage" : "Triaged"} subtitle="You don't hold this task, so the change request is shown read-only." />
        </Card>
      )}
    </Page>
  );
}

/** Per session: Change attempt rows already written (one per CR). */
const attemptWritten = new Set<string>();

function TriagePanel({ task, cr, onChanged }: { task: TaskVM; cr: CrVM; onChanged(): void }) {
  const { flagsFor } = useWorkbench();
  const actions = useActions();
  const cases = useCaseList();
  const matched = useMemo(() => caseOfCr(cr, cases.data ?? []), [cr, cases.data]);
  const [caseId, setCaseId] = useState<string>(cr.caseItemId || "");
  useEffect(() => {
    if (!caseId && matched) setCaseId(matched._id);
  }, [matched, caseId]);
  const bundle = useCaseBundle(caseId || null);
  const kase: CaseVM | null = bundle.data?.case ?? (cases.data ?? []).find((c) => c._id === caseId) ?? null;
  const released = kase ? isReleased(kase) : false;
  const caseReadable = !!kase && kase.readQuality !== "index";
  const flags = kase ? flagsFor(kase) : flagsFor({ releaseItemId: "" } as CaseVM);
  const [input, setInput] = useState<TriageInput>(() => triageDefaults(cr, null));
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (kase && applied.current !== kase._id) {
      applied.current = kase._id;
      const rel = isReleased(kase);
      setInput((i) => {
        const base = i.caseItemId === kase._id ? i : { ...triageDefaults(cr, kase, { released: rel }), ...pickTyped(i) };
        return withCase(rel && !base.supplierOutcomeText ? { ...base, supplierOutcomeText: AFTER_RELEASE_TEXT } : base, kase);
      });
    }
  }, [kase, cr]);
  const shown = effectiveTriage(input, released);
  const refused = released || isRefusal(input.outcome);
  const options = triageOutcomeOptions(flags, released);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [result, setResult] = useState<PanelResult>(null);
  const [note, setNote] = useState<ActionResult | null>(null);
  /** The patch last saved (by the Workbench, or in the Kissflow form after a K-WB refusal): Submit does not resend it. */
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const caseLoading = (!!caseId && !bundle.data && bundle.loading) || (!kase && cases.loading);
  const set = <K extends keyof TriageInput>(k: K, v: TriageInput[K]) => setInput((i) => ({ ...i, [k]: v }));
  const check = () => {
    const ps = triageProblems(input, { released, caseReadable, flags });
    setProblems(ps);
    return ps.length === 0;
  };
  const save = () =>
    run(async () => {
      if (!check()) return;
      try {
        const patch = buildTriagePatch(cr, input, released);
        const r = await actions.saveAtStep(task, patch);
        setResult(r);
        if (r.ok) setSavedSig(JSON.stringify(patch));
      } catch (e) {
        setResult({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });
      }
    });
  const submit = () =>
    run(async () => {
      if (!check()) return;
      setNote(null);
      try {
        const patch = buildTriagePatch(cr, input, released);
        if (savedSig !== JSON.stringify(patch)) {
          const s = await actions.saveAtStep(task, patch);
          if (!s.ok) {
            setResult(s);
            return;
          }
          setSavedSig(JSON.stringify(patch));
        }
        if (released && kase && !attemptWritten.has(cr._id)) {
          try {
            await actions.writeAudit(changeAttemptEvent(cr, kase));
            attemptWritten.add(cr._id);
            setNote({ ok: true, message: "Change attempt recorded in the audit log (refused after final release)." });
          } catch (e) {
            setNote({ ok: false, message: `The change attempt could not be recorded, so the triage was not sent: ${e instanceof Error ? e.message : String(e)}` });
            return;
          }
        }
        setResult(await actions.submitStep(task));
      } catch (e) {
        setResult({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });
      }
    });
  return (
    <Card data-testid="wb-cr-triage">
      <CardHeader title="Triage" subtitle="Fills every input of the change notice. Nothing is sent to the supplier from here." />
      <div className="space-y-5 p-4">
        <section className="space-y-3 rounded-lg border border-line p-3.5" data-testid="wb-cr-triage-case">
          <h4 className="text-[13.5px] font-semibold text-ink">Case</h4>
          {cr.caseItemId ? (
            <p className="flex items-center gap-1.5 text-[13.5px]">
              <Lock size={13} className="text-ink-3" aria-hidden /> Linked to <Mono>{caseLabel(kase?.caseCode ?? cr.caseCode, kase?.cycleNo ?? cr.cycleNo)}</Mono>
            </p>
          ) : (
            <Field label="Link to a case" required hint={matched ? "Preselected by case code and cycle." : "Pick the case this change belongs to."}>
              <div data-testid="wb-cr-case-picker">
                <Select value={caseId} onChange={(e) => setCaseId(e.target.value)} aria-label="Case">
                  <option value="">Select a case…</option>
                  {(cases.data ?? [])
                    .filter((c) => c.readQuality !== "index" || c._id === caseId)
                    .map((c) => (
                      <option key={c._id} value={c._id}>
                        {caseLabel(c.caseCode, c.cycleNo)} · {c.tradeName || c.supplierLegalName}
                      </option>
                    ))}
                </Select>
              </div>
            </Field>
          )}
          {kase && (
            <p className="text-[13px] text-ink-2">
              {kase.supplierLegalName || kase.supplierCode} · {released ? <Badge tone="warn">released</Badge> : <Badge tone="info">not released</Badge>}
            </p>
          )}
          {bundle.loading && caseId && !bundle.data && <p className="text-[12.5px] text-ink-3">Reading the case…</p>}
        </section>
        {released && (
          <div role="status" data-testid="wb-cr-released" className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[13.5px] text-ink">
            This case is past its final release. The outcome is set to "Refused – after final release" and every impact to No; a change attempt is recorded in the audit log when you submit.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact verified" required error={problems.find((p) => p.field === "Contact_Verified")?.message}>
            <Segmented value={shown.contactVerified || undefined} onChange={(v) => set("contactVerified", v)} options={YN} />
          </Field>
          <Field label="Outcome" required error={problems.find((p) => p.field === "CR_Outcome")?.message}>
            <div data-testid="wb-field-CR_Outcome">
              <Select
                value={shown.outcome}
                onChange={(e) => {
                  const v = e.target.value;
                  // F1: a refused request impacts no department (every Impact_* = No)
                  setInput((i) => ({ ...i, outcome: v, impacts: isRefusal(v) ? (Object.fromEntries(CR_DEPTS.map((d) => [d, "No"])) as TriageInput["impacts"]) : i.impacts }));
                }}
                aria-label="Outcome"
              >
                <option value="">Select…</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Impact per department</p>
          {refused && !released && <p className="mb-2 text-[12.5px] text-ink-3" data-testid="wb-cr-refused-impacts">A refused change request impacts no department, so every impact is No.</p>}
          {/* tablet check: 3 per row below xl, so each Yes/No control keeps its two options side by side */}
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {CR_DEPTS.map((d) => (
              <div key={d} className="flex flex-col items-start gap-1" data-testid={`wb-cr-impact-${d}`}>
                <span className="text-[12.5px] font-medium text-ink-2">{DEPT_LABEL[d]}</span>
                <Segmented value={shown.impacts[d] || undefined} disabled={refused} onChange={(v) => setInput((i) => ({ ...i, impacts: { ...i.impacts, [d]: v } }))} options={YN} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Notice key">
            <TextInput value={noticeKey(cr.crKey)} readOnly disabled />
          </Field>
          <Field label="Notice kind" required>
            <TextInput value={input.noticeKind} onChange={(e) => set("noticeKind", e.target.value)} />
          </Field>
          <Field label="Notice title" required>
            <TextInput value={input.noticeTitle} onChange={(e) => set("noticeTitle", e.target.value)} />
          </Field>
          <Field label="Portal contact ids" required hint="From the case.">
            <TextInput value={input.portalContactIds} onChange={(e) => set("portalContactIds", e.target.value)} />
          </Field>
          <Field label="Supplier outcome text" required>
            <TextArea rows={2} value={input.supplierOutcomeText} onChange={(e) => set("supplierOutcomeText", e.target.value)} />
          </Field>
          <Field label="Triage note">
            <TextArea rows={2} value={input.triageNote} onChange={(e) => set("triageNote", e.target.value)} />
          </Field>
          <Field label="Scope run key" hint="Only when the change extends the scope (not available in this version).">
            <TextInput value={input.scopeRunKey} onChange={(e) => set("scopeRunKey", e.target.value)} />
          </Field>
        </div>
        <ActionBanner result={note} testId="wb-cr-attempt" />
        <PanelOutcome
          task={task}
          c={kase ?? ({ caseCode: cr.caseCode } as CaseVM)}
          problems={problems}
          result={result}
          onResolved={() => {
            // the triage values were saved in the Kissflow form
            setSavedSig(JSON.stringify(buildTriagePatch(cr, input, released)));
            onChanged();
          }}
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="flex-1" />
          {caseLoading && <span className="text-[12.5px] text-ink-3">Reading the case…</span>}
          <Button disabled={busy || caseLoading} onClick={save} data-testid="wb-step-save">
            Save
          </Button>
          <Button variant="primary" disabled={busy || caseLoading} onClick={submit} data-testid="wb-step-submit">
            {busy ? "Working…" : "Submit triage"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Keeps what the user typed when the case pick changes. */
function pickTyped(i: TriageInput): Partial<TriageInput> {
  const out: Partial<TriageInput> = {};
  for (const k of ["contactVerified", "outcome", "noticeKind", "noticeTitle", "supplierOutcomeText", "triageNote", "scopeRunKey"] as const) if (i[k]) (out as Record<string, unknown>)[k] = i[k];
  if (Object.values(i.impacts).some(Boolean)) out.impacts = i.impacts;
  return out;
}

// ---------------------------------------------------------------- manual CR (Y6 fallback)

export function NewCr() {
  const { caps } = useWorkbench();
  const actions = useActions();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const cases = useCaseList();
  const preset = params.get("case");
  const [caseId, setCaseId] = useState(preset ?? "");
  const kase = (cases.data ?? []).find((c) => c._id === caseId) ?? null;
  const [input, setInput] = useState<ManualCrInput>(emptyManualCr(null));
  const appliedCase = useRef<string | null>(null);
  useEffect(() => {
    if (kase && appliedCase.current !== kase._id) {
      appliedCase.current = kase._id;
      setInput((i) => ({ ...i, caseCode: kase.caseCode, cycleNo: kase.cycleNo, supplierCode: kase.supplierCode }));
    }
  }, [kase]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ManualCrInput>(k: K, v: ManualCrInput[K]) => setInput((i) => ({ ...i, [k]: v }));
  if (!caps.canInitiate(CR_FLOW))
    return (
      <Page testId="wb-cr-new">
        <Card>
          <EmptyState title="Not available for your role">Only the Raw Material Manager (RMM) records change requests by hand.</EmptyState>
        </Card>
      </Page>
    );
  const submit = async () => {
    setError(null);
    const ps = manualCrProblems(input);
    setProblems(ps);
    if (ps.length) return;
    setBusy(true);
    try {
      const r = await actions.createProcessItem(CR_FLOW, buildManualCr(input, new Date()));
      nav(`/change-requests/${r.instanceId}`);
    } catch (e) {
      if (e instanceof ActionError) {
        setProblems(e.problems);
        setError(e.message);
      } else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const err = (f: string) => problems.find((p) => p.field === f)?.message;
  return (
    <Page testId="wb-cr-new">
      <Link to="/change-requests" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> Change requests
      </Link>
      <PageHeader eyebrow="Manual record" title="New change request" subtitle="Record a change the supplier asked for outside the portal. It goes to Triage like any other." />
      <ManualRecordNote>This change request is recorded by hand. The portal item and the portal user who raised it stay blank.</ManualRecordNote>
      <ErrorBanner error={cases.error} onRetry={cases.reload} />
      <Card>
        <CardHeader title="Case" />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="Case" hint="Pick a readable case, or type the case code and cycle below.">
            <div data-testid="wb-cr-new-case">
              <Select value={caseId} onChange={(e) => setCaseId(e.target.value)} aria-label="Case">
                <option value="">Select a case…</option>
                {(cases.data ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {caseLabel(c.caseCode, c.cycleNo)} · {c.tradeName || c.supplierLegalName}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Case code" required error={err("Case_Code")}>
            <TextInput value={input.caseCode} onChange={(e) => set("caseCode", e.target.value)} invalid={!!err("Case_Code")} />
          </Field>
          <Field label="Cycle" required error={err("Cycle_No")}>
            <TextInput type="number" min={1} value={input.cycleNo ?? ""} onChange={(e) => set("cycleNo", e.target.value === "" ? null : Number(e.target.value))} invalid={!!err("Cycle_No")} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Requested change" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Change kind" required error={err("Change_Kind")} hint="e.g. Answer change, Document change, Contact change.">
            <TextInput value={input.changeKind} onChange={(e) => set("changeKind", e.target.value)} invalid={!!err("Change_Kind")} data-testid="wb-cr-new-kind" />
          </Field>
          <Field label="Supplier code">
            <TextInput value={input.supplierCode} onChange={(e) => set("supplierCode", e.target.value)} />
          </Field>
          <Field label="Section key">
            <TextInput value={input.sectionKey} onChange={(e) => set("sectionKey", e.target.value)} />
          </Field>
          <Field label="Field key">
            <TextInput value={input.fieldKey} onChange={(e) => set("fieldKey", e.target.value)} />
          </Field>
          <Field label="Row id">
            <TextInput value={input.rowId} onChange={(e) => set("rowId", e.target.value)} />
          </Field>
          <Field label="Current value">
            <TextArea rows={2} value={input.currentValueText} onChange={(e) => set("currentValueText", e.target.value)} />
          </Field>
          <Field label="Proposed value (JSON)" error={err("Proposed_Value_JSON")}>
            <TextArea rows={2} value={input.proposedValueJson} onChange={(e) => set("proposedValueJson", e.target.value)} invalid={!!err("Proposed_Value_JSON")} className="font-mono text-[13px]" />
          </Field>
          <Field label="Change reason" required error={err("Change_Reason")}>
            <TextArea rows={2} value={input.changeReason} onChange={(e) => set("changeReason", e.target.value)} invalid={!!err("Change_Reason")} data-testid="wb-cr-new-reason" />
          </Field>
        </div>
      </Card>
      <ProblemsBanner problems={problems} title="Nothing was created. Fix these first." />
      {error && <ActionBanner result={{ ok: false, message: error }} />}
      <div className="flex justify-end">
        <Button variant="primary" icon={<FilePlus2 size={16} />} disabled={busy} onClick={submit} data-testid="wb-cr-new-submit">
          {busy ? "Recording…" : "Record change request"}
        </Button>
      </div>
    </Page>
  );
}
