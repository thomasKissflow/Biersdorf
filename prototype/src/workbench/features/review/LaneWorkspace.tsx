// Lane workspace `#/review/lane/:caseId/:act` (§8.8; also CASE_B_RMM). Route component, no props (§12.2).
//   Left   · sections D leads / co-reviews / owns queries: definition fields, Components (K2.1), search keys;
//            "Raise open point" (prefilled reference) and "Mark reviewed" (an F8 Section review row).
//   Middle · blockers (brd L809-L817) and the gate: open points, pending CR assessments, RMES (SAF/REG), section
//            review marks (WB-D5); server values <D>_Open_Count / <D>_RMES_Gaps / <D>_Gate (read-only); "Refresh
//            counts" with the counts policy (fail-closed → nothing written, unread listed; attest → F8 first).
//   Right  · sign-off: <D>_Review_Confirm, On_Behalf_Of (+ F8 Delegation row), the SAF/REG RMES decision and reason,
//            Completed_By/_Email/_At = me, now on "Save sign-off"; "Complete review" = submitStep with the lane
//            fields (the F8 lane.completed snapshot is written by submitStep after the submit).
// Every action needs the held CASE_B_<D> task with this activity instance (ground rule 13).
import { CheckCircle2, ClipboardCheck, FileSpreadsheet, MessageSquarePlus, RefreshCw, ShieldCheck } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Checkbox, Field, Segmented, TextArea, TextInput } from "@/components/ui/form";
import { Table, Td, Tr } from "@/components/ui/data";
import { deptOfLaneStep, laneFields, stepDef, type Dept } from "../../schema";
import { parseSectionDefinition } from "../../domain/config";
import { DEPT_LABEL } from "../../domain/labels";
import type { RefreshResult } from "../../data/actions";
import { fieldLabel } from "../../schema";
import { COUNTS_BLOCKED_LANE } from "../../domain/labels";
import { useActions, useCaseBundle, useFormRows, useTasks, useWorkbench, useWorkbenchContext } from "../../data/hooks";
import { kfDateTime } from "../../data/normalize";
import { RUNG_LABEL } from "../case/panels/CountsBlock";
import { fmtDateTime } from "../audit/format";
import type { CaseVM, RmesVM, SaveResult, SectionVM, SubmitResult, TaskVM } from "../../data/viewModels";
import { KwbFallback } from "../../ui/KwbFallback";
import { WriteOutcome } from "../../ui/WriteOutcome";
import { NotesPanel } from "../notes";
import { RaisePointDialog } from "../points/RaisePointDialog";
import type { RaiseInput } from "../points/model";
import { ErrorBanner, Facts, Note, NotFound, Page, Skeleton, Warnings } from "./kit";
import { useKeptTask } from "./useKeptTask";
import { blockerProblems, buildSignOffPatch, completeChecklist, decisionReasonProblem, laneBlockers, laneReadiness, reviewMarksOf, sectionsForDept, signOffProblems, type Blocker, type SignOff } from "./model";

const RMES_FLOW = { SAF: "CIQ_RMES_Safety_A00", REG: "CIQ_RMES_Regulatory_A00" } as const;

export function LaneWorkspace() {
  const { caseId, act } = useParams();
  const tasks = useTasks();
  const found = (tasks.data ?? []).find((t) => t.flow === "CIQ_Case_A00" && t.instanceId === caseId && t.activityInstanceId === act) ?? null;
  const { task, held } = useKeptTask(found, `${caseId}|${act}`);
  const d = task?.step ? deptOfLaneStep(task.step) : null;
  if (tasks.loading && !tasks.data)
    return (
      <Page testId="wb-lane">
        <Skeleton rows={6} />
      </Page>
    );
  if (!task || !d)
    return (
      <Page testId="wb-lane">
        <ErrorBanner error={tasks.error} onRetry={tasks.reload} />
        <NotFound
          title={task && !task.step ? "Task at an unidentified step" : "This lane task is not in your queue"}
          testId="wb-lane-not-held"
          action={
            caseId ? (
              <Link className="text-brand hover:underline" to={`/cases/${caseId}`}>
                Open the case (read-only)
              </Link>
            ) : undefined
          }
        >
          {task && !task.step ? "The Workbench could not tell which lane this task belongs to. Open it in Kissflow." : "It may have been completed already, or another reviewer holds it. You don't hold this task."}
        </NotFound>
      </Page>
    );
  return <Lane task={task} d={d} held={held} />;
}

function Lane({ task, d, held }: { task: TaskVM; d: Dept; held: boolean }) {
  const { caps, flagsFor } = useWorkbench();
  const bundle = useCaseBundle(task.instanceId);
  const b = bundle.data;
  const c = b?.case;
  const rmesFlow = d === "SAF" || d === "REG" ? RMES_FLOW[d] : null;
  const rmes = useFormRows<RmesVM>(rmesFlow, { Case_Item_Id: task.instanceId });
  const [refresh, setRefresh] = useState<RefreshResult | null>(null);
  const [attested, setAttested] = useState(false);
  const [raise, setRaise] = useState<Partial<RaiseInput> | null>(null);
  const [signOff, setSignOff] = useState<SignOff | null>(null);
  const [done, setDone] = useState(false);

  if (bundle.loading && !b)
    return (
      <Page testId="wb-lane">
        <Skeleton rows={8} />
      </Page>
    );
  if (!b || !c)
    return (
      <Page testId="wb-lane">
        <ErrorBanner error={bundle.error ?? "The case could not be read."} onRetry={bundle.reload} />
      </Page>
    );
  const policy = flagsFor(c).countsPolicy;
  const lane = c.lanes[d];
  const decisionNow = signOff ? { decision: signOff.decision, reason: signOff.reason } : undefined;
  const blockers = laneBlockers({
    c,
    d,
    points: b.points,
    crs: b.crs,
    sections: b.sections,
    events: b.events,
    eventsQuality: b.quality.events,
    rmes: rmesFlow ? { rows: rmes.data ?? [], quality: rmes.quality ?? (rmes.error ? "failed" : "form") } : null,
    decision: decisionNow,
    policy,
    attested,
  });
  return (
    <Page testId="wb-lane">
      <PageHeader
        eyebrow={`Department review · ${DEPT_LABEL[d]}`}
        title={
          <span>
            <span className="font-mono">{c.caseCode || c._id}</span>
            {c.cycleNo ? <span className="text-ink-3"> · C{c.cycleNo}</span> : null}
            {c.tradeName ? <span className="font-normal"> · {c.tradeName}</span> : null}
          </span>
        }
        subtitle={[c.supplierLegalName, c.mainInci, c.bdfMaterialNo].filter(Boolean).join(" · ")}
        actions={
          <>
            {rmesFlow && caps.rmesEditorOf.has(d as "SAF" | "REG") && (
              <Link to={`/rmes/${c._id}?dept=${d}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13.5px] font-medium text-ink shadow-card hover:bg-surface-2" data-testid="wb-lane-rmes-link">
                <FileSpreadsheet size={15} aria-hidden /> RMES sheet
              </Link>
            )}
            <Link to={`/cases/${c._id}`} className="text-[13px] text-brand hover:underline">
              Open the case
            </Link>
          </>
        }
      />
      {done ? (
        bundle.error && <Note tone="neutral">After the submit the case is no longer readable with your access; the values below are the last ones read.</Note>
      ) : (
        <ErrorBanner error={bundle.error} onRetry={bundle.reload} />
      )}
      {!held && !done && (
        <Note tone="warn" testId="wb-lane-not-held-anymore">
          This task is no longer in your queue (completed, or taken by someone else). The lane is shown read-only.
        </Note>
      )}
      <Warnings items={[...bundle.warnings, ...(rmes.warnings ?? [])]} />
      {/* Below xl the sign-off column comes first, so "Complete review" and its checklist are never far below. */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="order-2 min-w-0 xl:order-1">
          <SectionsColumn c={c} d={d} sections={sectionsForDept(b.sections, d)} events={b.events} eventsReadable={b.quality.events === "form"} onRaise={(p) => setRaise(p)} onMarked={bundle.reload} canRaise={caps.canInitiate("CIQ_Open_Point_A00")} />
        </div>
        <div className="order-3 min-w-0 xl:order-2">
          <BlockersColumn task={task} c={c} d={d} blockers={blockers} policy={policy} refresh={refresh} setRefresh={setRefresh} onAttested={() => setAttested(true)} rmes={rmesFlow ? rmes.data ?? [] : null} />
        </div>
        <div className="order-1 min-w-0 lg:sticky lg:top-8 lg:self-start xl:order-3">
          <SignOffColumn task={task} c={c} d={d} blockers={blockers} refresh={refresh} policy={policy} onChange={setSignOff} gate={lane.gate} held={held} onDone={() => setDone(true)} />
        </div>
      </div>
      <NotesPanel c={c} />
      {raise && <RaisePointDialog open onClose={() => setRaise(null)} c={c} preset={raise} onRaised={() => bundle.reload()} />}
    </Page>
  );
}

/**
 * Tablet check: the checklist says where to act as a column of the 3-column xl layout (left/middle/right). Below xl
 * the columns stack or pair up (sign-off first), so there it names the panel instead; xl and up read as before.
 */
const PANEL_OF: Record<string, string> = { left: "Sections", middle: "Blockers and counts", right: "Sign-off" };
function WhereHint({ text }: { text: string }) {
  const parts = text.split(/\((left|middle|right)\)/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 0 ? (
          p
        ) : (
          <Fragment key={i}>
            <span className="hidden xl:inline">({p})</span>
            <span className="xl:hidden">({PANEL_OF[p]})</span>
          </Fragment>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------- left: sections

function sectionFields(s: SectionVM): string[] {
  const p = parseSectionDefinition(s.definitionJson);
  return p.ok ? p.value.fields.map((f) => `${f.label}${f.required ? " *" : ""}`) : [];
}

function SectionsColumn({ c, d, sections, events, eventsReadable, onRaise, onMarked, canRaise }: { c: CaseVM; d: Dept; sections: SectionVM[]; events: CaseBundleEvents; eventsReadable: boolean; onRaise(p: Partial<RaiseInput>): void; onMarked(): void; canRaise: boolean }) {
  const actions = useActions();
  const { notify } = useWorkbench();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mark = async (s: SectionVM) => {
    setBusy(s._id);
    setErrors((e) => ({ ...e, [s._id]: "" }));
    try {
      await actions.writeAudit({
        category: "Section review",
        actionCode: "section.reviewed",
        caseCode: c.caseCode,
        cycleNo: c.cycleNo,
        caseItemId: c._id,
        objectKind: "Section",
        objectKey: s.sectionItemKey,
        objectItemId: s._id,
        actorDept: d,
      });
      notify(`${s.sectionCode || s.sectionKey} marked reviewed (recorded in the audit log).`, "success");
      onMarked();
    } catch (e) {
      setErrors((x) => ({ ...x, [s._id]: `Not recorded: ${e instanceof Error ? e.message : String(e)}` }));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="min-w-0">
      <CardHeader title="Sections" subtitle={`Sections ${DEPT_LABEL[d]} leads, co-reviews or owns queries for.`} />
      <div className="space-y-3 px-4 py-3">
        <Note tone="neutral">The supplier's answers live in the portal and are not readable here yet. Review against the portal, then mark the section reviewed.</Note>
        {sections.length === 0 && <p className="text-[13px] text-ink-3">No sections for {DEPT_LABEL[d]} on this case.</p>}
        {sections.map((s) => {
          const marks = reviewMarksOf(events, c, s.sectionItemKey);
          const leads = s.leadDept === d;
          const fields = sectionFields(s);
          return (
            <div key={s._id} className="space-y-2 rounded-lg border border-line p-3" data-testid={`wb-section-${s.sectionKey}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12.5px] text-ink-2">{s.sectionCode || s.sectionKey}</span>
                <span className="font-medium text-ink">{s.sectionTitle}</span>
                <Badge tone={leads ? "brand" : "neutral"}>{leads ? "lead" : s.coReviewDepts.includes(d) ? "co-review" : "query owner"}</Badge>
                {s.applicabilityLabel && <Badge>{s.applicabilityLabel}</Badge>}
                {marks.length > 0 ? (
                  <Badge tone="ok" dot>
                    reviewed
                  </Badge>
                ) : leads ? (
                  <Badge tone="warn">not marked</Badge>
                ) : null}
              </div>
              {fields.length > 0 && <p className="text-[12.5px] text-ink-3">Fields: {fields.join(", ")}</p>}
              {(s.searchInci || s.searchCas) && (
                <p className="text-[12.5px] text-ink-3">
                  {s.searchInci && <>INCI: {s.searchInci} </>}
                  {s.searchCas && <>· CAS: {s.searchCas}</>}
                </p>
              )}
              {s.components.length > 0 && (
                <Table head={["INCI", "CAS", "Function", "Conc. %"]} dense>
                  {s.components.map((k) => (
                    <Tr key={k._id || k.rowId}>
                      <Td>{k.inci || "—"}</Td>
                      <Td className="font-mono text-[12px]">{k.casNo || "—"}</Td>
                      <Td>{k.fn || "—"}</Td>
                      <Td>{k.concMin !== null || k.concMax !== null ? `${k.concMin ?? "?"}–${k.concMax ?? "?"}` : "—"}</Td>
                    </Tr>
                  ))}
                </Table>
              )}
              {marks.length > 0 && <p className="text-[12px] text-ink-3">Marked by {marks.map((m) => `${m.actorName || "someone"} (${fmtDateTime(m.at)})`).join(", ")}.</p>}
              <div className="flex flex-wrap gap-2">
                {canRaise && (
                  <Button size="sm" icon={<MessageSquarePlus size={13} />} data-testid={`wb-section-${s.sectionKey}-raise`} onClick={() => onRaise({ refKind: "Section", refSectionKey: s.sectionKey, refLabel: `${s.sectionCode || s.sectionKey} · ${s.sectionTitle}`, opDept: d, raisedByDept: d })}>
                    Raise open point
                  </Button>
                )}
                <Button size="sm" icon={<ClipboardCheck size={13} />} disabled={busy === s._id} data-testid={`wb-section-${s.sectionKey}-reviewed`} onClick={() => void mark(s)}>
                  {busy === s._id ? "Recording…" : marks.length ? "Mark reviewed again" : "Mark reviewed"}
                </Button>
              </div>
              {errors[s._id] && <Note tone="bad">{errors[s._id]}</Note>}
            </div>
          );
        })}
        {!eventsReadable && <Note tone="warn">The audit events could not be read completely, so review marks may be missing here.</Note>}
      </div>
    </Card>
  );
}
type CaseBundleEvents = Parameters<typeof reviewMarksOf>[0];

// ---------------------------------------------------------------- middle: blockers, gate, counts

function BlockersColumn({ task, c, d, blockers, policy, refresh, setRefresh, onAttested, rmes }: { task: TaskVM; c: CaseVM; d: Dept; blockers: Blocker[]; policy: "fail-closed" | "attest"; refresh: RefreshResult | null; setRefresh(r: RefreshResult | null): void; onAttested(): void; rmes: RmesVM[] | null }) {
  const actions = useActions();
  const [busy, setBusy] = useState(false);
  const [attestation, setAttestation] = useState("");
  const lane = c.lanes[d];
  const readiness = laneReadiness(lane);
  const run = async (attest?: string) => {
    setBusy(true);
    try {
      const r = await actions.refreshCaseCounts(task, c, { lane: d }, attest ? { attestation: attest } : undefined);
      setRefresh(r);
      // the ok toast comes from WriteOutcome, after the read-back
      if (r.action === "attested" && r.ok) onAttested();
    } catch (e) {
      setRefresh({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e), confidence: "partial", unread: [], action: "blocked" });
    } finally {
      setBusy(false);
    }
  };
  const blocked = refresh?.action === "blocked";
  return (
    <Card className="min-w-0">
      <CardHeader title="Blockers and counts" subtitle="Everything that must be clear before the review can be completed." />
      <div className="space-y-4 px-4 py-3">
        <ul className="space-y-3" data-testid="wb-lane-blockers">
          {blockers.map((bl) => (
            <li key={bl.kind} data-testid={`wb-lane-blocker-${bl.kind}`} data-blocking={bl.blocking ? "true" : "false"}>
              <div className="flex items-center gap-2">
                {bl.blocking ? <Badge tone="warn">{bl.items.length || 1}</Badge> : <Badge tone="ok">✓</Badge>}
                <span className="text-[13.5px] font-medium text-ink">{bl.label}</span>
              </div>
              {bl.items.length > 0 && (
                <ul className="mt-1 space-y-0.5 pl-8 text-[13px] text-ink-2">
                  {bl.items.map((it) => (
                    <li key={it.id}>
                      {it.href ? (
                        <Link className="text-brand hover:underline" to={it.href}>
                          {it.text}
                        </Link>
                      ) : (
                        it.text
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {bl.note && bl.kind === "section-marks" && <p className="mt-0.5 pl-8 text-[12px] text-ink-3">{bl.note}</p>}
            </li>
          ))}
        </ul>
        <div className="space-y-2 rounded-lg border border-line p-3" data-testid="wb-lane-gate">
          <p className="text-[12.5px] font-semibold text-ink-2">Ready to complete: {readiness.ready ? "Yes" : "No"} <span className="font-normal text-ink-3">(decided by Kissflow from the counts)</span></p>
          <Facts
            items={[
              { k: `${DEPT_LABEL[d]} open items`, v: lane.openCount === null ? "not counted yet" : String(lane.openCount), testId: "wb-lane-open-count" },
              ...(d === "SAF" || d === "REG" ? [{ k: "RMES gaps", v: lane.rmesGaps === null || lane.rmesGaps === undefined ? "not counted yet" : String(lane.rmesGaps), testId: "wb-lane-rmes-gaps" }] : []),
            ]}
          />
          {rmes && rmes.length > 0 && <p className="text-[12px] text-ink-3">RMES gaps come from the saved RMES header counts.</p>}
          <Button icon={<RefreshCw size={14} />} disabled={busy} data-testid="wb-counts-refresh" onClick={() => void run()}>
            {busy ? "Counting…" : "Refresh counts"}
          </Button>
          {refresh && !blocked && <WriteOutcome result={refresh} task={task} caseCode={c.caseCode} okMessage={refresh.action === "attested" ? "Counts written after the attestation." : "Counts written and checked."} />}
          {refresh && refresh.ok && (
            <p className="text-[12.5px] text-ink-2" data-testid="wb-counts-written">
              Written: {Object.entries(refresh.counts ?? {}).map(([k, v]) => `${fieldLabel("CIQ_Case_A00", k)} ${v ?? "not counted"}`).join(", ")}. Ready to complete: {refresh.gate === "OK" ? "Yes" : "No"}.
            </p>
          )}
          {refresh?.warnings && refresh.warnings.length > 0 && <Warnings items={refresh.warnings} />}
          {blocked && (
            <div className="space-y-2" data-testid="wb-counts-unread">
              <Note tone="warn">
                <p className="font-medium">{"message" in refresh! ? refresh!.message : "Counts could not be confirmed with your access."}</p>
                {refresh!.unread.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-[12.5px]">
                    {refresh!.unread.map((u, i) => (
                      <li key={i}>
                        {u.reason} <span className="text-ink-3">({RUNG_LABEL[u.rung] ?? "partly readable"}{u.visible !== undefined ? `, ${u.visible} visible` : ""})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {refresh!.counts && <p className="mt-1 text-[12.5px] text-ink-2">Visible counts: {Object.entries(refresh!.counts).map(([k, v]) => `${fieldLabel("CIQ_Case_A00", k)} ${v ?? "not counted"}`).join(", ")}.</p>}
              </Note>
              {policy === "attest" ? (
                <div className="space-y-2">
                  <Field label="Attestation" required hint="At least 20 characters. Recorded in the audit log first; only then are the visible counts written.">
                    <TextArea rows={2} value={attestation} onChange={(e) => setAttestation(e.target.value)} data-testid="wb-counts-attest-text" />
                  </Field>
                  <Button variant="primary" icon={<ShieldCheck size={14} />} disabled={busy || attestation.trim().length < 20} data-testid="wb-counts-attest" onClick={() => void run(attestation.trim())}>
                    Attest and write
                  </Button>
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-2" data-testid="wb-counts-blocked-next">{COUNTS_BLOCKED_LANE}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- right: sign-off and complete

function initialSignOff(c: CaseVM, d: Dept): SignOff {
  const l = c.lanes[d];
  return { confirmed: l.confirm === "Confirmed", onBehalfOf: l.onBehalfOf, decision: l.rmesDecision ?? "", reason: l.rmesDecisionReason ?? "" };
}

function SignOffColumn({ task, c, d, blockers, refresh, policy, onChange, gate, held, onDone }: { task: TaskVM; c: CaseVM; d: Dept; blockers: Blocker[]; refresh: RefreshResult | null; policy: "fail-closed" | "attest"; onChange(s: SignOff): void; gate: string; held: boolean; onDone(): void }) {
  const actions = useActions();
  const { me } = useWorkbench();
  const { pending } = useWorkbenchContext();
  const [s, setS] = useState<SignOff>(() => initialSignOff(c, d));
  const [busy, setBusy] = useState(false);
  const [save, setSave] = useState<SaveResult | null>(null);
  const [submit, setSubmit] = useState<SubmitResult | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [delegationNote, setDelegationNote] = useState<string | null>(null);
  const [kwbOpen, setKwbOpen] = useState(false);
  const [kwbReady, setKwbReady] = useState(false);
  const serverKey = `${c.lanes[d].confirm}|${c.lanes[d].onBehalfOf}|${c.lanes[d].rmesDecision}|${c.lanes[d].rmesDecisionReason}`;
  useEffect(() => setS(initialSignOff(c, d)), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onChange(s), [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const rmesDept = d === "SAF" || d === "REG";
  const lane = c.lanes[d];
  const stored = pending.load(task.key);
  // UX-05: an ordered list of what to do next, in plain words (no field ids, no read-rung names)
  const why = useMemo(
    () => completeChecklist({ d, blockers, lane: { ...lane, gate }, countsBlocked: refresh?.action === "blocked" && policy === "fail-closed", held }),
    [d, blockers, lane, gate, refresh, policy, held],
  );
  const set = <K extends keyof SignOff>(k: K, v: SignOff[K]) => setS((x) => ({ ...x, [k]: v }));

  const saveSignOff = async () => {
    const probs = signOffProblems(d, s);
    setProblems(probs.map((p) => p.message));
    if (probs.length) return;
    setBusy(true);
    setSave(null);
    setSubmit(null);
    setDelegationNote(null);
    try {
      const r = await actions.saveAtStep(task, buildSignOffPatch(d, s, me, kfDateTime(new Date()), { confirm: lane.confirm, onBehalfOf: lane.onBehalfOf, reason: lane.rmesDecisionReason ?? "" }));
      setSave(r);
      if (r.kind === "kwb-refused") setKwbOpen(true);
      if (r.ok && s.onBehalfOf.trim() && s.onBehalfOf.trim() !== lane.onBehalfOf.trim()) {
        try {
          await actions.writeAudit({ category: "Delegation", actionCode: "lane.on-behalf", caseCode: c.caseCode, cycleNo: c.cycleNo, caseItemId: c._id, objectKind: "Case", objectItemId: c._id, objectKey: `${c.caseCode}:lane:${d}`, onBehalfOf: s.onBehalfOf.trim(), actorDept: d });
          setDelegationNote(null);
        } catch (e) {
          setDelegationNote(`The sign-off is saved, but the delegation was not recorded in the audit log (${e instanceof Error ? e.message : String(e)}).`);
        }
      }
    } catch (e) {
      setSave({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    setBusy(true);
    setSubmit(null);
    try {
      const r = await actions.submitStep(task, { laneFields: laneFields(d), extraChecks: [() => blockerProblems(blockers), (fresh) => decisionReasonProblem(d, fresh)] });
      setSubmit(r);
      if (r.ok) {
        setKwbOpen(false);
        onDone();
      }
    } catch (e) {
      setSubmit({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  const done = submit?.ok === true;
  return (
    <div className="min-w-0 space-y-3">
      <Card data-testid="wb-lane-signoff">
        <CardHeader title="Sign-off" subtitle={`Your task: ${stepDef(task.step!).name}`} />
        <div className="space-y-3 px-4 py-3">
          <Checkbox checked={s.confirmed} onChange={(v) => set("confirmed", v)} label="Review confirmed" description={`I reviewed the ${DEPT_LABEL[d]} scope of this case.`} disabled={done} />
          <Field label="On behalf of" hint="Filled only when you sign for someone else (recorded as a delegation).">
            <TextInput value={s.onBehalfOf} onChange={(e) => set("onBehalfOf", e.target.value)} disabled={done} data-testid="wb-lane-on-behalf" />
          </Field>
          {rmesDept && (
            <>
              <Field label="RMES decision" required>
                <Segmented
                  value={s.decision || undefined}
                  onChange={(v) => set("decision", v)}
                  disabled={done}
                  options={[
                    { value: "Approved", label: "Approved" },
                    { value: "Rejected", label: "Rejected" },
                  ]}
                />
              </Field>
              <Field label="Decision reason" required={s.decision === "Rejected"}>
                <TextArea rows={2} value={s.reason} onChange={(e) => set("reason", e.target.value)} disabled={done} data-testid="wb-lane-decision-reason" />
              </Field>
            </>
          )}
          {lane.completedAt && (
            <p className="text-[12.5px] text-ink-3">
              Last saved by {lane.completedBy?.name || lane.completedByEmail || "—"} at {fmtDateTime(lane.completedAt)}.
            </p>
          )}
          <p className="text-[12.5px] text-ink-3">Saving records you as the reviewer (by, e-mail, now). "Complete review" checks every required value on the server.</p>
          {problems.length > 0 && <Note tone="bad">{problems.join(" ")}</Note>}
          <Button icon={<CheckCircle2 size={14} />} disabled={busy || done || !held} onClick={() => void saveSignOff()} data-testid="wb-lane-save">
            {busy ? "Saving…" : "Save sign-off"}
          </Button>
          {save && save.kind !== "kwb-refused" && <WriteOutcome result={save} task={task} caseCode={c.caseCode} okMessage="Sign-off saved and checked." />}
          {delegationNote && <Note tone="warn">{delegationNote}</Note>}
        </div>
      </Card>
      {(kwbOpen || stored) && !done && (
        <div className="space-y-2">
          <KwbFallback task={task} caseCode={c.caseCode} onResolved={(x) => setKwbReady(x.matches && !x.submittedElsewhere)} />
          {kwbReady && <p className="text-[12.5px] text-ink-2">The values are saved. Refresh counts if needed, then complete the review.</p>}
        </div>
      )}
      <Card>
        <div className="space-y-3 px-4 py-3">
          {done ? (
            <Note tone="ok" testId="wb-lane-done">
              The {DEPT_LABEL[d]} review is completed.{" "}
              <Link className="text-brand hover:underline" to="/review">
                Back to the review queue
              </Link>
            </Note>
          ) : (
            <>
              <Button variant="primary" icon={<CheckCircle2 size={15} />} disabled={busy || why.length > 0} onClick={() => void complete()} data-testid="wb-lane-complete" className="w-full">
                Complete review
              </Button>
              {why.length > 0 && (
                <ol className="list-decimal space-y-0.5 pl-5 text-[12.5px] text-ink-2" data-testid="wb-lane-complete-why">
                  {why.map((w, i) => (
                    <li key={i}>
                      <WhereHint text={w} />
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          {submit && <WriteOutcome result={submit} task={task} caseCode={c.caseCode} okMessage={`${DEPT_LABEL[d]} review completed.`} />}
        </div>
      </Card>
    </div>
  );
}
