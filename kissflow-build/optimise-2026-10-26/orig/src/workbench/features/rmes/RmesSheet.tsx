// RMES sheet `#/rmes` and `#/rmes/:caseId?dept=SAF|REG` (§8.11; ground rule 7). EDITOR ROLE ONLY: Safety → F5,
// Regulatory → F6. Any other role (or a department the user does not edit) gets "Not available for your role" and
// NO read is issued on this route: the guard renders before any data hook. The Overall Approver's read-only view is
// RmesSummary (a separate component on the approval screen).
import { ClipboardList, FilePlus2, Lock, MessageSquarePlus, Plus, RefreshCw, Save, Unlock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { EmptyState, Table, Td, Tr } from "@/components/ui/data";
import { Field, Segmented, TextArea, TextInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { listValues } from "../../schema";
import { loadPinnedConfig, parseRmesCriteria, type RmesCriteriaPayload } from "../../domain/config";
import { useActions, useCaseBundle, useCaseList, useFormRows, useTasks, useWorkbench, useWorkbenchContext } from "../../data/hooks";
import { displayValue } from "../../data/normalize";
import type { CaseVM, ConfigVM, CriterionVM, RmesVM, SaveResult, TaskVM } from "../../data/viewModels";
import { taskPath } from "../../pages/TaskRouter";
import { FieldInput } from "../../ui/FieldInput";
import { WriteOutcome } from "../../ui/WriteOutcome";
import { RaisePointDialog } from "../points/RaisePointDialog";
import type { RaiseInput } from "../points/model";
import { ErrorBanner, Facts, Note, NotFound, Page, Skeleton, Warnings } from "../review/kit";
import {
  buildRowsPatch,
  canEditUnder,
  createBlockers,
  CRITERIA_TABLE,
  CRITERION_AI,
  criterionOpenMirror,
  criterionProblems,
  criterionValues,
  findingProblems,
  findingRefKey,
  FINDING_STATES,
  findingValues,
  hasRowOps,
  isRmesDept,
  lockPatch,
  lockState,
  planDuplicates,
  RELEASE_PATCH,
  RMES_DEPT_LABEL,
  RMES_FLOW,
  RMES_PARTS,
  seedRmesData,
  VOID_PATCH,
  type FindingDraft,
  type RmesDept,
  type RowEdits,
} from "./model";
import { saveRmesTwoPhase, type RmesSaveOutcome } from "./save";
import { personLabel } from "../../domain/labels";
import { fmtDateTime } from "../audit/format";

function Denied() {
  return (
    <Page testId="wb-rmes-denied">
      <NotFound title="Not available for your role">The RMES sheet is edited only by the Safety and Regulatory reviewers of their own department.</NotFound>
    </Page>
  );
}

const editorDepts = (s: ReadonlySet<"SAF" | "REG">): RmesDept[] => (["SAF", "REG"] as const).filter((d) => s.has(d));

export function RmesIndex() {
  const { caps } = useWorkbench();
  if (!caps.rmesEditorOf.size) return <Denied />;
  return <RmesIndexInner depts={editorDepts(caps.rmesEditorOf)} />;
}

export function RmesSheet() {
  const { caps } = useWorkbench();
  const { caseId } = useParams();
  const [sp] = useSearchParams();
  const want = sp.get("dept");
  const mine = editorDepts(caps.rmesEditorOf);
  const d: RmesDept | null = want ? (isRmesDept(want) && caps.rmesEditorOf.has(want) ? want : null) : (mine[0] ?? null);
  if (!d || !caseId) return <Denied />;
  return <Sheet key={`${caseId}:${d}`} caseId={caseId} d={d} depts={mine} />;
}

// ---------------------------------------------------------------- index

function RmesIndexInner({ depts }: { depts: RmesDept[] }) {
  const tasks = useTasks();
  const cases = useCaseList();
  const rows = useMemo(() => {
    const out: { c: CaseVM; d: RmesDept; task: TaskVM | null }[] = [];
    for (const c of cases.data ?? [])
      for (const d of depts) {
        const task = (tasks.data ?? []).find((t) => t.flow === "CIQ_Case_A00" && t.instanceId === c._id && t.step === `CASE_B_${d}`) ?? null;
        if (task || (c.lanes[d].active && !c.cancelled && c.completeness.at)) out.push({ c, d, task });
      }
    return out.sort((a, b) => Number(!!b.task) - Number(!!a.task) || a.c.caseCode.localeCompare(b.c.caseCode));
  }, [cases.data, tasks.data, depts]);
  return (
    <Page testId="wb-rmes">
      <PageHeader eyebrow="Review" title="RMES sheets" subtitle={`Raw material evaluation sheets you edit: ${depts.map((d) => RMES_DEPT_LABEL[d]).join(" and ")}.`} />
      <ErrorBanner error={cases.error} onRetry={cases.reload} />
      <Warnings items={[...cases.warnings, cases.quality && cases.quality !== "admin" ? "Only the cases you hold a task on (or that are in the audit index) are listed with your access." : null]} />
      {cases.loading && !cases.data ? (
        <Skeleton rows={4} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardList size={22} />} title="No RMES sheets for you right now">A sheet appears when the supplier has confirmed completeness and your department's review is active.</EmptyState>
        </Card>
      ) : (
        <Card>
          <Table head={["Case", "Trade name", "Sheet", "Completeness confirmed", "Your lane task", ""]}>
            {rows.map(({ c, d, task }) => (
              <Tr key={`${c._id}:${d}`}>
                <Td className="font-mono text-[12.5px] whitespace-nowrap">
                  {c.caseCode || c._id}
                  {c.cycleNo ? ` · C${c.cycleNo}` : ""}
                </Td>
                <Td>{c.tradeName || "—"}</Td>
                <Td>
                  <Badge tone="brand">{RMES_DEPT_LABEL[d]}</Badge>
                </Td>
                <Td>{c.completeness.at ? c.completeness.at.slice(0, 10) : <span className="text-ink-3">not readable</span>}</Td>
                <Td>{task ? <Badge tone="info">open</Badge> : <span className="text-ink-3">—</span>}</Td>
                <Td>
                  <Link className="font-medium whitespace-nowrap text-brand hover:underline" to={`/rmes/${c._id}?dept=${d}`} data-testid={`wb-rmes-open-${c._id}-${d}`}>
                    Open sheet
                  </Link>
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------- soft lock

const pendingRelease = new Map<string, ReturnType<typeof setTimeout>>();

/** Writes the lock when the sheet opens for edit (free, or someone else's lock older than 30 min) and releases it
 *  on leave (best effort; delayed so a dev StrictMode remount cancels the release). Advisory only. */
function useSoftLock(d: RmesDept, row: RmesVM | null) {
  const actions = useActions();
  const { me } = useWorkbench();
  const flow = RMES_FLOW[d];
  const [result, setResult] = useState<SaveResult | null>(null);
  const acquired = useRef<string | null>(null);
  const latest = useRef<RmesVM | null>(row);
  latest.current = row;
  const id = row?._id ?? null;
  useEffect(() => {
    if (!id || !latest.current) return;
    const t = pendingRelease.get(id);
    if (t) {
      clearTimeout(t);
      pendingRelease.delete(id);
    }
    const st = lockState(latest.current, me, new Date());
    if (st.kind === "mine") acquired.current = id;
    else if (acquired.current !== id && (st.kind === "free" || st.kind === "stale")) {
      acquired.current = id;
      void actions
        .updateFormRow(flow, id, lockPatch(me, new Date()))
        .then(setResult)
        .catch((e) => setResult({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) }));
    }
    const release = () => {
      const r = latest.current;
      if (acquired.current !== id || !r || lockState(r, me, new Date()).kind !== "mine") return;
      acquired.current = null;
      void actions.updateFormRow(flow, id, RELEASE_PATCH).catch(() => undefined);
    };
    const onHide = () => release();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      pendingRelease.set(
        id,
        setTimeout(() => {
          pendingRelease.delete(id);
          release();
        }, 0),
      );
    };
    // run once per row id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const takeOver = async () => {
    if (!id) return;
    acquired.current = id;
    try {
      setResult(await actions.updateFormRow(flow, id, lockPatch(me, new Date())));
    } catch (e) {
      setResult({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });
    }
  };
  return { result, takeOver };
}

// ---------------------------------------------------------------- the sheet

function Sheet({ caseId, d, depts }: { caseId: string; d: RmesDept; depts: RmesDept[] }) {
  const { me } = useWorkbench();
  const tasks = useTasks();
  const bundle = useCaseBundle(caseId);
  const flow = RMES_FLOW[d];
  const rows = useFormRows<RmesVM>(flow, { Case_Item_Id: caseId });
  const plan = planDuplicates(rows.data ?? []);
  const row = plan.keep;
  const lock = useSoftLock(d, row);
  const c = bundle.data?.case ?? null;
  const laneTask = (tasks.data ?? []).find((t) => t.flow === "CIQ_Case_A00" && t.instanceId === caseId && t.step === `CASE_B_${d}`) ?? null;
  const laneLink = laneTask ? taskPath(laneTask) : `/cases/${caseId}`;
  const ls = row ? lockState(row, me, new Date()) : null;

  return (
    <Page testId="wb-rmes">
      <PageHeader
        eyebrow={`RMES · ${RMES_DEPT_LABEL[d]}`}
        title={
          <span>
            <span className="font-mono">{c?.caseCode || caseId}</span>
            {c?.cycleNo ? <span className="text-ink-3"> · C{c.cycleNo}</span> : null}
            {c?.tradeName ? <span className="font-normal"> · {c.tradeName}</span> : null}
          </span>
        }
        subtitle="Raw material evaluation. The decision itself is recorded on the case lane."
        actions={
          <>
            {depts.length > 1 && (
              <span className="inline-flex gap-1">
                {depts.map((x) => (
                  <Link key={x} to={`/rmes/${caseId}?dept=${x}`} className={x === d ? "rounded-md bg-brand-soft px-2 py-1 text-[13px] font-semibold text-brand" : "rounded-md px-2 py-1 text-[13px] text-ink-2 hover:bg-surface-2"}>
                    {RMES_DEPT_LABEL[x]}
                  </Link>
                ))}
              </span>
            )}
            {laneLink && (
              <Link to={laneLink} className="text-[13px] text-brand hover:underline" data-testid="wb-rmes-lane-link">
                {laneTask ? "Go to the lane decision" : "Open the case"}
              </Link>
            )}
          </>
        }
      />
      <ErrorBanner error={rows.error} onRetry={rows.reload} />
      <ErrorBanner error={bundle.error} onRetry={bundle.reload} />
      <Warnings items={[...rows.warnings, ...bundle.warnings]} />
      {rows.loading && !rows.data ? (
        <Skeleton rows={6} />
      ) : rows.quality === "failed" ? (
        <NotFound title="The RMES sheets could not be read">Try again in a moment.</NotFound>
      ) : !row ? (
        c ? (
          <CreatePanel c={c} d={d} onCreated={rows.reload} />
        ) : bundle.loading ? (
          <Skeleton rows={3} />
        ) : (
          <NotFound title="The case could not be read with your access" />
        )
      ) : (
        <>
          {plan.duplicates.length > 0 && <DuplicatesPanel d={d} keep={row} duplicates={plan.duplicates} onDone={rows.reload} />}
          <LockBar d={d} row={row} state={ls!} onTakeOver={lock.takeOver} result={lock.result} />
          <SheetEditor key={row._id} d={d} row={row} c={c} readOnly={!canEditUnder(ls!)} onSaved={rows.reload} />
        </>
      )}
    </Page>
  );
}

function LockBar({ d, row, state, onTakeOver, result }: { d: RmesDept; row: RmesVM; state: ReturnType<typeof lockState>; onTakeOver(): void; result: SaveResult | null }) {
  return (
    <div className="space-y-2" data-testid="wb-rmes-lock" data-lock={state.kind}>
      {state.kind === "held" ? (
        <Note tone="warn">
          <span className="inline-flex flex-wrap items-center gap-2">
            <Lock size={14} aria-hidden /> {state.by} is editing this sheet (since {Math.round(state.minutes)} min). It is open read-only.
            <Button size="sm" icon={<Unlock size={13} />} onClick={onTakeOver} data-testid="wb-rmes-takeover">
              Take over
            </Button>
          </span>
        </Note>
      ) : (
        <p className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Lock size={12} aria-hidden /> {state.kind === "mine" ? "You are editing this sheet. Others see it read-only for 30 minutes (advisory lock)." : state.kind === "stale" ? `An old lock by ${state.by} has expired; you are taking the sheet.` : "Opening the sheet for edit…"}
        </p>
      )}
      {result && !result.ok && <WriteOutcome result={result} flow={RMES_FLOW[d]} itemId={row._id} />}
    </div>
  );
}

function DuplicatesPanel({ d, keep, duplicates, onDone }: { d: RmesDept; keep: RmesVM; duplicates: RmesVM[]; onDone(): void }) {
  const actions = useActions();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SaveResult[]>([]);
  return (
    <Note tone="warn" testId="wb-rmes-duplicates">
      <p>
        {duplicates.length + 1} sheets exist for this case. The oldest ({keep.rmesKey || keep._id}) is kept; the newer {duplicates.length === 1 ? "one is" : "ones are"} marked voided (never deleted).
      </p>
      <Button
        size="sm"
        className="mt-2"
        disabled={busy}
        data-testid="wb-rmes-void-duplicates"
        onClick={async () => {
          setBusy(true);
          const out: SaveResult[] = [];
          for (const r of duplicates) out.push(await actions.updateFormRow(RMES_FLOW[d], r._id, VOID_PATCH));
          setResults(out);
          setBusy(false);
          onDone();
        }}
      >
        {busy ? "Voiding…" : "Void the newer sheets"}
      </Button>
      {results.map((r, i) => (!r.ok ? <WriteOutcome key={i} result={r} flow={RMES_FLOW[d]} itemId={duplicates[i]._id} /> : null))}
    </Note>
  );
}

// ---------------------------------------------------------------- create

function CreatePanel({ c, d, onCreated }: { c: CaseVM; d: RmesDept; onCreated(): void }) {
  const actions = useActions();
  const { notify } = useWorkbench();
  const cfg = useFormRows<ConfigVM>("CIQ_Config_Version_A00");
  const [criteria, setCriteria] = useState<RmesCriteriaPayload["criteria"] | null>(null);
  const [cfgProblem, setCfgProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!cfg.data) return;
    let alive = true;
    void loadPinnedConfig(cfg.data, c.releaseItemId || undefined).then((p) => {
      if (!alive) return;
      if (!p) {
        setCfgProblem("The pinned release of this case could not be read.");
        setCriteria(null);
        return;
      }
      const entry = p.manifest.find((e) => e.kind === "RMES criteria");
      const row = entry ? p.rows.get(entry.configKey) : undefined;
      if (!row) {
        setCfgProblem("The pinned release has no readable RMES criteria.");
        setCriteria(null);
        return;
      }
      const parsed = parseRmesCriteria(row.payloadJson);
      if (!parsed.ok) {
        setCfgProblem(`RMES criteria: ${parsed.error}`);
        setCriteria(null);
        return;
      }
      setCfgProblem(null);
      setCriteria(parsed.value.criteria.filter((x) => x.dept === d));
    });
    return () => {
      alive = false;
    };
  }, [cfg.data, c.releaseItemId, d]);
  const blockers = createBlockers(c, criteria);
  return (
    <Card data-testid="wb-rmes-empty">
      <EmptyState
        icon={<FilePlus2 size={22} />}
        title={`No ${RMES_DEPT_LABEL[d]} RMES sheet yet`}
        action={
          <Button
            variant="primary"
            icon={<FilePlus2 size={14} />}
            disabled={busy || !criteria || blockers.length > 0}
            data-testid="wb-rmes-create"
            onClick={async () => {
              if (!criteria) return;
              setBusy(true);
              setError(null);
              try {
                const r = await actions.createFormRow(RMES_FLOW[d], seedRmesData(c, d, criteria), "RMES_Key");
                if (r.missing?.length) setError(`The sheet was created, but Kissflow did not keep: ${r.missing.join(", ")}.`);
                else notify(`${RMES_DEPT_LABEL[d]} RMES sheet created with ${criteria.length} criteria.`, "success");
                onCreated();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Creating…" : "Create the RMES sheet"}
          </Button>
        }
      >
        The first editor after the supplier confirmed completeness creates the sheet; its criteria come from the case's pinned configuration.
      </EmptyState>
      <div className="space-y-2 px-4 pb-4">
        <ErrorBanner error={cfg.error} onRetry={cfg.reload} />
        {cfg.loading && !cfg.data && <p className="text-center text-[13px] text-ink-3">Reading the pinned configuration…</p>}
        {cfgProblem && <Note tone="bad">{cfgProblem}</Note>}
        {blockers.length > 0 && criteria && <Note tone="warn">{blockers.join(" ")}</Note>}
        {!criteria && !cfgProblem && blockers.length > 0 && cfg.data && <Note tone="warn">{blockers.join(" ")}</Note>}
        {error && <Note tone="bad">{error}</Note>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- editor

function openBadge(c: CriterionVM, mirror: { value: number } | null) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {c.openNum === null ? (
        c.applicable === "No" ? (
          <Badge>not applicable</Badge>
        ) : (
          <Badge tone="warn">server: blank (counted open)</Badge>
        )
      ) : c.openNum > 0 ? (
        <Badge tone="warn">open</Badge>
      ) : (
        <Badge tone="ok">done</Badge>
      )}
      {mirror && <Badge tone={mirror.value > 0 ? "neutral" : "info"}>after save: {mirror.value > 0 ? "open" : "done"}</Badge>}
    </span>
  );
}

function SheetEditor({ d, row, c, readOnly, onSaved }: { d: RmesDept; row: RmesVM; c: CaseVM | null; readOnly: boolean; onSaved(): void }) {
  const actions = useActions();
  const { me, notify, caps } = useWorkbench();
  const { client } = useWorkbenchContext();
  const flow = RMES_FLOW[d];
  const [critEdits, setCritEdits] = useState<RowEdits>({});
  const [findEdits, setFindEdits] = useState<RowEdits>({});
  const [adds, setAdds] = useState<Record<string, unknown>[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RmesSaveOutcome | null>(null);
  const [raise, setRaise] = useState<Partial<RaiseInput> | null>(null);
  const editCrit = (id: string, col: string, v: unknown) => setCritEdits((e) => ({ ...e, [id]: { ...(e[id] ?? {}), [col]: v } }));
  const editFind = (id: string, col: string, v: unknown) => setFindEdits((e) => ({ ...e, [id]: { ...(e[id] ?? {}), [col]: v } }));
  const drafts: FindingDraft[] = [
    ...row.findings.filter((f) => findEdits[f._id]).map((f) => ({ _id: f._id, key: { Findings_Criterion_Code: f.criterionCode, Findings_Text: f.text }, values: { ...findingValues(f), ...findEdits[f._id] } })),
    ...adds.map((values) => ({ values })),
  ];
  const patch = buildRowsPatch(d, row, critEdits, drafts, me, new Date());
  const dirty = hasRowOps(patch);
  const byPart = RMES_PARTS.map((p) => ({ part: p, rows: row.criteria.filter((x) => x.part === p) })).concat([{ part: "—" as never, rows: row.criteria.filter((x) => !(RMES_PARTS as readonly string[]).includes(x.part)) }]);

  const save = async () => {
    const probs = [
      ...row.criteria.filter((x) => critEdits[x._id]).flatMap((x) => criterionProblems(x.code || x._id, criterionValues(x, critEdits[x._id]))),
      ...drafts.flatMap((f) => findingProblems(f.values)),
    ];
    setProblems(probs);
    if (probs.length) return;
    setBusy(true);
    setOutcome(null);
    try {
      const out = await saveRmesTwoPhase(actions, d, row._id, patch, () => client.formGet(flow, row._id));
      setOutcome(out);
      if (out.phase1?.ok || !dirty) {
        setCritEdits({});
        setFindEdits({});
        setAdds([]);
      }
      if (out.ok) notify(out.message, "success");
      onSaved();
    } catch (e) {
      setOutcome({ ok: false, warnings: [], message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const codes = row.criteria.map((x) => x.code).filter(Boolean);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Sheet" subtitle={row.rmesKey} />
        <div className="px-4 py-3">
          <Facts
            items={[
              { k: "Open criteria (saved header count)", v: row.openCriteriaCount === null ? "not saved yet" : String(row.openCriteriaCount), testId: "wb-rmes-open-criteria" },
              { k: "Open blocking findings (saved header count)", v: row.openBlockingFindingsCount === null ? "not saved yet" : String(row.openBlockingFindingsCount), testId: "wb-rmes-open-findings" },
              { k: "Criteria", v: String(row.criteria.length) },
              { k: "Editing", v: row.editingBy ? `${row.editingBy}${row.editingSince ? ` since ${fmtDateTime(row.editingSince)}` : ""}` : "" },
            ]}
          />
        </div>
      </Card>
      {row.criteria.length === 0 && <Note tone="warn">This sheet has no criteria rows (or the list read does not carry them).</Note>}
      {byPart
        .filter((g) => g.rows.length)
        .map((g) => (
          <Card key={g.part}>
            <CardHeader title={g.part === ("—" as never) ? "Other criteria" : `Part ${g.part}`} />
            <div className="divide-y divide-line">
              {g.rows.map((x) => {
                const values = criterionValues(x, critEdits[x._id]);
                const edited = !!critEdits[x._id];
                const mirror = edited ? criterionOpenMirror(flow, d, values) : null;
                const notApplicable = values.Criteria_Applicable === "No";
                const resultNeedsComment = !notApplicable && !!values.Criteria_Result && !["Available", "Plausible", "Listed"].includes(String(values.Criteria_Result));
                const ai = CRITERION_AI.filter((k) => !!displayValue(x.v[k]));
                return (
                  <div key={x._id} className="space-y-3 px-4 py-3" data-testid={`wb-rmes-criterion-${x.code || x._id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12.5px] text-ink-2">{x.code}</span>
                      <span className="font-medium text-ink">{x.title}</span>
                      {openBadge(x, mirror)}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Applicable">
                        <FieldInput flow={flow} table={CRITERIA_TABLE[d]} field="Criteria_Applicable" value={values.Criteria_Applicable} onChange={(v) => editCrit(x._id, "Criteria_Applicable", v)} disabled={readOnly} />
                      </Field>
                      <Field label="Result">
                        <FieldInput flow={flow} table={CRITERIA_TABLE[d]} field="Criteria_Result" value={values.Criteria_Result} onChange={(v) => editCrit(x._id, "Criteria_Result", v)} disabled={readOnly || notApplicable} />
                      </Field>
                      <Field label="Impact resolution">
                        <FieldInput flow={flow} table={CRITERIA_TABLE[d]} field="Criteria_Impact_Resolution" value={values.Criteria_Impact_Resolution} onChange={(v) => editCrit(x._id, "Criteria_Impact_Resolution", v)} disabled={readOnly} />
                      </Field>
                      <div className="text-[12px] text-ink-3 sm:self-end">
                        {x.recordedAt ? `Recorded by ${personLabel(x.recordedBy)} on ${fmtDateTime(x.recordedAt)}` : "Not recorded yet"}
                      </div>
                    </div>
                    {notApplicable ? (
                      <Field label="Why not applicable" required>
                        <TextArea rows={2} value={String(values.Criteria_Override_Reason ?? "")} onChange={(e) => editCrit(x._id, "Criteria_Override_Reason", e.target.value)} disabled={readOnly} />
                      </Field>
                    ) : (
                      <Field label="Comment" required={resultNeedsComment} hint={resultNeedsComment ? "Required for this result." : undefined}>
                        <TextArea rows={2} value={String(values.Criteria_Comment ?? "")} onChange={(e) => editCrit(x._id, "Criteria_Comment", e.target.value)} disabled={readOnly} data-testid={`wb-rmes-comment-${x.code}`} />
                      </Field>
                    )}
                    <details className="rounded-lg border border-line px-3 py-2">
                      <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2">Limits</summary>
                      <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        {(["Criteria_Reported_Value", "Criteria_Reported_Unit", "Criteria_Limit_Value", "Criteria_Limit_Comparator", "Criteria_Limit_Set_Version", "Criteria_Limit_Pass"] as const).map((col) => (
                          <Field key={col} label={col.replace("Criteria_", "").replace(/_/g, " ")} hint={col === "Criteria_Limit_Comparator" ? "Free text." : undefined}>
                            <FieldInput flow={flow} table={CRITERIA_TABLE[d]} field={col} value={values[col]} onChange={(v) => editCrit(x._id, col, v)} disabled={readOnly} />
                          </Field>
                        ))}
                      </div>
                    </details>
                    {ai.length > 0 && (
                      <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                        <p className="font-medium text-ink">Suggestion (read-only)</p>
                        {ai.map((k) => (
                          <p key={k}>
                            {k.replace("Criteria_AI_", "").replace(/_/g, " ")}: {displayValue(x.v[k])}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

      <Card>
        <CardHeader
          title="Findings"
          subtitle="Blocking findings that are not Closed count as RMES gaps."
          action={
            !readOnly && (
              <Button size="sm" icon={<Plus size={13} />} data-testid="wb-rmes-finding-add" onClick={() => setAdds((a) => [...a, { Findings_Text: "", Findings_Criterion_Code: "", Findings_Blocking: "No", Findings_State: "Open", Findings_Linked_OP_Key: "" }])}>
                Add finding
              </Button>
            )
          }
        />
        <div className="divide-y divide-line">
          {row.findings.length === 0 && adds.length === 0 && <p className="px-4 py-3 text-[13px] text-ink-3">No findings.</p>}
          {row.findings.map((f) => (
            <FindingRow
              key={f._id}
              d={d}
              codes={codes}
              values={{ ...findingValues(f), ...(findEdits[f._id] ?? {}) }}
              onChange={(col, v) => editFind(f._id, col, v)}
              readOnly={readOnly}
              onRaise={
                c && caps.canInitiate("CIQ_Open_Point_A00")
                  ? () => setRaise({ refKind: "RMES finding", refInternalKey: findingRefKey(row.rmesKey, f._id), refLabel: `RMES ${RMES_DEPT_LABEL[d]}${f.criterionCode ? ` · ${f.criterionCode}` : ""}: ${f.text.slice(0, 60)}`, opDept: d, raisedByDept: d, questionText: f.text })
                  : undefined
              }
            />
          ))}
          {adds.map((values, i) => (
            <FindingRow key={`new-${i}`} d={d} codes={codes} values={values} isNew onChange={(col, v) => setAdds((a) => a.map((x, j) => (j === i ? { ...x, [col]: v } : x)))} onRemove={() => setAdds((a) => a.filter((_, j) => j !== i))} readOnly={readOnly} />
          ))}
        </div>
      </Card>

      <Card>
        <div className="space-y-3 px-4 py-3">
          {problems.length > 0 && (
            <Note tone="bad">
              <ul className="list-disc pl-5">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Note>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={dirty ? <Save size={14} /> : <RefreshCw size={14} />} disabled={readOnly || busy} onClick={() => void save()} data-testid="wb-rmes-save">
              {busy ? "Saving…" : dirty ? "Save" : "Recount header counts"}
            </Button>
            <span className="text-[12.5px] text-ink-3">{dirty ? "Saves the changed rows first, then the header counts from the read-back." : "No row changed: recounts the header from a fresh read."}</span>
          </div>
          {outcome && (
            <div className="space-y-2" data-testid="wb-rmes-save-result" data-ok={outcome.ok ? "true" : "false"}>
              <Note tone={outcome.ok ? "ok" : "bad"}>{outcome.message}</Note>
              {outcome.phase1 && !outcome.phase1.ok && <WriteOutcome result={outcome.phase1} flow={flow} itemId={row._id} />}
              {outcome.phase2 && !outcome.phase2.ok && <WriteOutcome result={outcome.phase2} flow={flow} itemId={row._id} />}
              <Warnings items={outcome.warnings} testId="wb-rmes-warnings" />
            </div>
          )}
          {readOnly && <p className="text-[12.5px] text-ink-3">Read-only while someone else holds the sheet.</p>}
        </div>
      </Card>
      {raise && c && <RaisePointDialog open onClose={() => setRaise(null)} c={c} preset={raise} onRaised={() => setRaise(null)} />}
    </div>
  );
}

function FindingRow({ codes, values, onChange, readOnly, isNew, onRemove, onRaise }: { d: RmesDept; codes: string[]; values: Record<string, unknown>; onChange(col: string, v: unknown): void; readOnly: boolean; isNew?: boolean; onRemove?(): void; onRaise?(): void }) {
  return (
    <div className="space-y-3 px-4 py-3" data-testid={isNew ? "wb-rmes-finding-new" : "wb-rmes-finding"}>
      <Field label="Finding" required>
        <TextArea rows={2} value={String(values.Findings_Text ?? "")} onChange={(e) => onChange("Findings_Text", e.target.value)} disabled={readOnly} data-testid="wb-rmes-finding-text" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Criterion">
          <Select value={String(values.Findings_Criterion_Code ?? "")} onChange={(e) => onChange("Findings_Criterion_Code", e.target.value)} disabled={readOnly} aria-label="Criterion">
            <option value="">None</option>
            {codes.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Blocking">
          <Segmented
            value={String(values.Findings_Blocking ?? "No")}
            onChange={(v) => onChange("Findings_Blocking", v)}
            disabled={readOnly}
            options={listValues("CIQ_Yes_No").map((v) => ({ value: v, label: v }))}
          />
        </Field>
        <Field label="State">
          <Select value={String(values.Findings_State ?? "Open")} onChange={(e) => onChange("Findings_State", e.target.value)} disabled={readOnly} aria-label="State">
            {FINDING_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Linked point key">
          <TextInput value={String(values.Findings_Linked_OP_Key ?? "")} onChange={(e) => onChange("Findings_Linked_OP_Key", e.target.value)} disabled={readOnly} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {onRaise && (
          <Button size="sm" icon={<MessageSquarePlus size={13} />} onClick={onRaise} data-testid="wb-rmes-finding-raise">
            Raise point from finding
          </Button>
        )}
        {isNew && onRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove this new finding
          </Button>
        )}
      </div>
    </div>
  );
}
