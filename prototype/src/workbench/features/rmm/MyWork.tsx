// §8.1 RMM: My work #/my-work. Every task the user HOLDS (possession, not role, decides; ground rule 13), grouped:
// "Record supplier steps (manual)" (S1, S3, S7, OPNT_S1), "Decide and check" (S2, S5, S8, B_RMM, OPNT_R_RMM,
// CHRQ_S1), and every other held task (so nothing held is lost: other roles' steps, unidentified steps). Case
// drafts (an interrupted create) can be continued or discarded. Rung-1 tiles: stray rejected points/CRs and cases
// ended without a cancellation event.
import { AlertTriangle, FilePlus2, Hand, ListChecks, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Mono, PageHeader } from "@/components/ui/primitives";
import { EmptyState, StatCard } from "@/components/ui/data";
import { errorText } from "../../kf/sdk";
import { useCaseList, useFormRows, useTasks, useWorkbench, useWorkbenchContext } from "../../data/hooks";
import { statusOf, toCrVM, toPointVM, str } from "../../data/map";
import type { ActionResult, AuditVM, RawItem, TaskVM } from "../../data/viewModels";
import { taskPath, taskRouterPath } from "../../pages/TaskRouter";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ActionBanner, ErrorBanner, LoadingCard, Page, WarningsList, caseLabel, fmtDate, fmtDateTime, isOverdue } from "../case/shared";
import { caseOfTask, endedWithoutCancellation, groupMyWork, strayRejected } from "./workGroups";

/** The user's own Case drafts (getMyItems status "draft"), re-read after every write. */
function useCaseDrafts() {
  const ctx = useWorkbenchContext();
  const [n, setN] = useState(0);
  const [s, setS] = useState<{ rows: RawItem[]; loading: boolean; error: string | null }>({ rows: [], loading: true, error: null });
  useEffect(() => {
    let alive = true;
    setS((p) => ({ ...p, loading: true }));
    ctx.client
      .listMine("CIQ_Case_A00", "draft")
      .then((rows) => alive && setS({ rows: rows.filter((r) => statusOf(r) === "draft"), loading: false, error: null }))
      .catch((e) => alive && setS((p) => ({ ...p, loading: false, error: errorText(e) })));
    return () => {
      alive = false;
    };
  }, [ctx.client, ctx.version, n]);
  return { ...s, reload: () => setN((x) => x + 1) };
}

export function MyWork() {
  const tasks = useTasks();
  const cases = useCaseList();
  const drafts = useCaseDrafts();
  const nav = useNavigate();
  const { caps } = useWorkbench();
  const g = useMemo(() => groupMyWork(tasks.data ?? []), [tasks.data]);
  const total = (tasks.data ?? []).length;
  return (
    <Page testId="wb-mywork">
      <PageHeader
        title="My work"
        subtitle="The CIQ tasks you hold in Kissflow. Supplier hand-offs are not connected yet: supplier steps are recorded by hand."
        actions={
          caps.canInitiate("CIQ_Case_A00") && (
            <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => nav("/cases/new")}>
              New case
            </Button>
          )
        }
      />
      <ErrorBanner error={tasks.error} onRetry={tasks.reload} />
      <WarningsList warnings={tasks.warnings} />
      {cases.quality === "admin" && <Tiles />}
      {tasks.loading && !tasks.data ? (
        <LoadingCard label="Loading your tasks…" rows={5} />
      ) : (
        <>
          {total === 0 && !drafts.rows.length && (
            <Card data-testid="wb-mywork-empty">
              <EmptyState icon={<ListChecks size={22} />} title="No CIQ tasks for you right now.">
                New tasks appear here when a case reaches a step you hold.
              </EmptyState>
            </Card>
          )}
          <TaskGroup title="Record supplier steps (manual)" hint="Manual records of what the supplier did. Nothing is sent to the supplier from here." icon={<Hand size={15} />} tasks={g.manual} cases={cases.data} testId="wb-mywork-manual" />
          <TaskGroup title="Decide and check" tasks={g.decide} cases={cases.data} testId="wb-mywork-decide" />
          <TaskGroup title="Other tasks you hold" hint="Tasks at other roles' steps, and tasks at a step the Workbench could not identify." tasks={g.other} cases={cases.data} testId="wb-mywork-other" />
          <Drafts d={drafts} />
        </>
      )}
    </Page>
  );
}

function TaskGroup({ title, hint, icon, tasks, cases, testId }: { title: string; hint?: string; icon?: React.ReactNode; tasks: TaskVM[]; cases: ReturnType<typeof useCaseList>["data"]; testId: string }) {
  const nav = useNavigate();
  if (!tasks.length) return null;
  return (
    <Card data-testid={testId}>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {icon}
            {title} <Badge>{tasks.length}</Badge>
          </span>
        }
        subtitle={hint}
      />
      <div className="relative overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-ink-3">
              {["Case", "Material", "Supplier", "Step", "Due"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const c = caseOfTask(t, cases);
              const code = t.caseCode || c?.caseCode || str(t.raw, "Case_Code");
              const cycle = t.cycleNo ?? c?.cycleNo ?? null;
              const material = c?.tradeName || str(t.raw, "Trade_Name") || (t.flow === "CIQ_Open_Point_A00" ? str(t.raw, "Question_Text").slice(0, 60) : t.flow === "CIQ_Change_Request_A00" ? str(t.raw, "Change_Kind") : "");
              const sub = t.flow === "CIQ_Open_Point_A00" ? str(t.raw, "OP_Key") : t.flow === "CIQ_Change_Request_A00" ? str(t.raw, "CR_Key") : "";
              const to = taskPath(t) ?? taskRouterPath(t);
              return (
                <tr key={t.key} onClick={() => nav(to)} className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2" data-testid={`wb-mywork-row-${t.instanceId}-${t.activityInstanceId}`}>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {/* UX-07: a real link (keyboard and screen readers); the row click stays a convenience */}
                    <Link to={to} onClick={(e) => e.stopPropagation()} className="font-medium text-brand hover:underline">
                      <Mono>{caseLabel(code, cycle)}</Mono>
                    </Link>
                    {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
                  </td>
                  <td className="px-4 py-2.5">{material || "—"}</td>
                  <td className="px-4 py-2.5">{c?.supplierLegalName || str(t.raw, "Supplier_Legal_Name") || str(t.raw, "Supplier_Code") || "—"}</td>
                  <td className="px-4 py-2.5">
                    {t.step ? (
                      <span>{t.stepName}</span>
                    ) : (
                      <Badge tone="warn" dot>
                        Task at an unidentified step: open in Kissflow
                      </Badge>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 whitespace-nowrap ${isOverdue(t.due) ? "font-medium text-bad" : ""}`}>
                    {fmtDate(t.due) || "—"}
                    {isOverdue(t.due) && <span className="ml-1 text-[11px]">overdue</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Drafts({ d }: { d: ReturnType<typeof useCaseDrafts> }) {
  const nav = useNavigate();
  const { actions } = useWorkbench();
  const [confirm, setConfirm] = useState<RawItem | null>(null);
  const [res, setRes] = useState<ActionResult | null>(null);
  if (d.error) return <ErrorBanner error={`Your case drafts could not be read: ${d.error}`} onRetry={d.reload} />;
  if (!d.rows.length && !res) return null;
  return (
    <Card data-testid="wb-mywork-drafts">
      <CardHeader title="Drafts" subtitle="Cases you started but did not create. Continue one, or discard it (only your own drafts)." />
      {d.rows.length > 0 && (
        <ul className="divide-y divide-line px-4 text-[13.5px]">
          {d.rows.map((r) => {
            const act = typeof r._activity_instance_id === "string" ? r._activity_instance_id : "";
            return (
              <li key={r._id} className="flex flex-wrap items-center gap-3 py-2.5" data-testid={`wb-mywork-draft-${r._id}`}>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{str(r, "Trade_Name") || "Untitled draft"}</span>
                  <span className="text-ink-3"> · {str(r, "Supplier_Legal_Name") || "no supplier"}</span>
                  {typeof r._created_at === "string" && <span className="text-ink-3"> · started {fmtDateTime(r._created_at)}</span>}
                </div>
                <Button size="sm" disabled={!act} title={act ? undefined : "This draft carries no Start task; open it in Kissflow."} onClick={() => nav(`/cases/new?draft=${encodeURIComponent(r._id)}&act=${encodeURIComponent(act)}`)} data-testid={`wb-mywork-draft-continue-${r._id}`}>
                  Continue
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setConfirm(r)} data-testid={`wb-mywork-draft-discard-${r._id}`}>
                  Discard
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="px-4 pb-3">
        <ActionBanner result={res} />
      </div>
      {confirm && (
        <ConfirmDialog
          open
          danger
          title="Discard this draft?"
          confirmLabel="Discard draft"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await actions.discardDraft("CIQ_Case_A00", confirm._id);
              setRes({ ok: true, message: "Draft discarded." });
            } catch (e) {
              setRes({ ok: false, message: `The draft was not discarded: ${errorText(e)}` });
            }
            setConfirm(null);
          }}
        >
          <p>Your unsent case draft "{str(confirm, "Trade_Name") || confirm._id}" is removed. Nothing else changes.</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}

/** Rung-1 tiles (they need every item's status): stray rejected points/CRs; ended without a cancellation event. */
function Tiles() {
  const nav = useNavigate();
  const cases = useCaseList();
  const points = useFormRows<RawItem>("CIQ_Open_Point_A00"); // a Process list through the ladder: raw rows
  const crs = useFormRows<RawItem>("CIQ_Change_Request_A00");
  const cancels = useFormRows<AuditVM>("CIQ_Audit_Event_A00", { Event_Category: "Cancellation" }); // Forms map to their VM
  const ready = points.quality === "admin" && crs.quality === "admin" && cancels.quality === "form" && cases.quality === "admin";
  const stray = useMemo(() => (ready ? strayRejected((points.data ?? []).map((r) => toPointVM(r)), (crs.data ?? []).map((r) => toCrVM(r))) : []), [ready, points.data, crs.data]);
  const ended = useMemo(() => (ready ? endedWithoutCancellation(cases.data ?? [], cancels.data ?? []) : []), [ready, cases.data, cancels.data]);
  if (!ready) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="wb-mywork-tiles">
      <div data-testid="wb-mywork-tile-stray">
        <StatCard
          label="Rejected points or change requests still open"
          value={stray.length}
          tone={stray.length ? "warn" : "neutral"}
          icon={<AlertTriangle size={15} />}
          hint={stray.length ? stray.slice(0, 3).map((x) => ("opKey" in x ? x.opKey : x.crKey) || x._id).join(", ") : "None: they are ignored by the counts."}
          onClick={stray.length ? () => nav("opKey" in stray[0] ? `/points/${stray[0]._id}` : `/change-requests/${stray[0]._id}`) : undefined}
        />
      </div>
      <div data-testid="wb-mywork-tile-ended">
        <StatCard
          label="Cases ended without a cancellation record"
          value={ended.length}
          tone={ended.length ? "bad" : "neutral"}
          hint={ended.length ? ended.slice(0, 3).map((c) => caseLabel(c.caseCode, c.cycleNo)).join(", ") : "None."}
          onClick={ended.length ? () => nav(`/cases/${ended[0]._id}`) : undefined}
        />
      </div>
    </div>
  );
}
