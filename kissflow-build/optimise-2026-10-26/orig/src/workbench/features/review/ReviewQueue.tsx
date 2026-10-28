// Reviewer queue `#/review` (§8.7). Held tasks only (ground rule 13): case lanes, open points and CR assessments of
// the user's departments, plus every held "Waiting for supplier" task (a supplier point the user raised; after K-FA
// it is assigned from Responsible_User). "Waiting on supplier" lists points of my departments that sit at OPNT_S1
// without me holding them; it needs every point's step, so it exists only on rung 1 (admin list).
import { ClipboardList, ExternalLink, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, cx, PageHeader } from "@/components/ui/primitives";
import { EmptyState, Table, Td, Tr } from "@/components/ui/data";
import { deptOfCrAssessStep, deptOfLaneStep, deptOfOpReviewStep, type Dept } from "../../schema";
import { DEPT_LABEL } from "../../domain/labels";
import { useTasks, useWorkbench, useWorkbenchContext } from "../../data/hooks";
import { isOpenStatus, statusOf, str, toPointVM } from "../../data/map";
import { isBlank } from "../../data/normalize";
import { adminRungAllowed, fillAdminRows, readList } from "../../data/runtime";
import type { ListQuality, PointVM, TaskVM } from "../../data/viewModels";
import { taskPath, taskRouterPath } from "../../pages/TaskRouter";
import { EvidenceBadge } from "../../ui/badges";
import { ErrorBanner, Note, Page, Skeleton, Warnings } from "./kit";
import { groupReviewTasks, waitingOnSupplier } from "./model";
import { fmtDate } from "../audit/format";

type TabId = "cases" | "points" | "supplier" | "crs" | "waiting";
const OP = "CIQ_Open_Point_A00" as const;

function useWaitingOnSupplier(enabled: boolean, myDepts: readonly Dept[], held: TaskVM[]) {
  const { rt, version } = useWorkbenchContext();
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: string | null; rows: PointVM[]; quality?: ListQuality; warnings: string[] }>({ loading: false, error: null, rows: [], warnings: [] });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    void (async () => {
      const l = await readList(rt, OP);
      if (l.quality !== "admin") return { quality: l.quality, rows: [] as PointVM[], warnings: l.warnings };
      const want = (r: Record<string, unknown>) => isOpenStatus(statusOf(r)) && str(r, "OP_To_Supplier") === "Yes" && isBlank(r.OP_Outcome) && (myDepts as readonly string[]).includes(str(r, "Raised_By_Dept"));
      const f = await fillAdminRows(rt, OP, l.rows, want);
      const rows = f.rows.filter((r) => f.full.has(r._id)).map((r) => toPointVM(r, "full"));
      return { quality: l.quality, rows, warnings: [...l.warnings, ...f.warnings.map((w) => `Point step not readable: ${w}`)] };
    })()
      .then((r) => alive && setState({ loading: false, error: null, rows: r.rows, quality: r.quality, warnings: r.warnings }))
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })));
    return () => {
      alive = false;
    };
    // myDepts is derived from caps; version reloads after writes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, version, nonce, rt]);
  const points = useMemo(() => waitingOnSupplier(state.rows, myDepts, held), [state.rows, myDepts, held]);
  return { ...state, points, reload: () => setNonce((n) => n + 1) };
}

export function ReviewQueue() {
  const { caps } = useWorkbench();
  const { rt } = useWorkbenchContext();
  const tasks = useTasks();
  const all = tasks.data ?? [];
  const g = useMemo(() => groupReviewTasks(all, caps.reviewerDepts), [all, caps.reviewerDepts]);
  const [tab, setTab] = useState<TabId>("cases");
  const tabRef = tab;
  const waitingAllowed = adminRungAllowed(rt, OP) && caps.reviewerDepts.length > 0;
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "cases", label: "Case reviews", count: g.cases.length },
    { id: "points", label: "Open points", count: g.points.length },
    ...(g.supplier.length ? [{ id: "supplier" as const, label: "Record supplier response (manual)", count: g.supplier.length }] : []),
    { id: "crs", label: "Change requests", count: g.crs.length },
    // rung 1 only; once opened it stays, so a refused admin list explains itself instead of the tab vanishing
    ...(waitingAllowed || tabRef === "waiting" ? [{ id: "waiting" as const, label: "Waiting on supplier" }] : []),
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : "cases";
  const waiting = useWaitingOnSupplier(current === "waiting" && waitingAllowed, caps.reviewerDepts, all);

  return (
    <Page testId="wb-review">
      <PageHeader
        eyebrow="Review"
        title="Review queue"
        subtitle="The tasks you hold: department reviews of cases, open points and change requests."
        actions={
          caps.rmesEditorOf.size > 0 && (
            <Link to="/rmes" className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13.5px] font-medium text-ink shadow-card hover:bg-surface-2" data-testid="wb-review-rmes-link">
              <FileSpreadsheet size={15} aria-hidden /> RMES sheets
            </Link>
          )
        }
      />
      <ErrorBanner error={tasks.error} onRetry={tasks.reload} />
      <Warnings items={tasks.warnings} />
      <div role="tablist" className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] scrollbar-thin">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={current === t.id}
            data-testid={`wb-review-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cx("inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] whitespace-nowrap transition-colors", current === t.id ? "border-brand font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink")}
          >
            {t.label}
            {t.count !== undefined && <span className={cx("rounded-full px-1.5 text-[11px]", current === t.id ? "bg-brand-soft text-brand" : "bg-surface-3 text-ink-3")}>{t.count}</span>}
          </button>
        ))}
      </div>
      {tasks.loading && !tasks.data ? (
        <Skeleton rows={4} />
      ) : (
        <Card>
          {current === "cases" && <CaseRows tasks={g.cases} />}
          {current === "points" && <PointRows tasks={g.points} />}
          {current === "supplier" && <SupplierRows tasks={g.supplier} />}
          {current === "crs" && <CrRows tasks={g.crs} />}
          {current === "waiting" && <WaitingRows w={waiting} />}
        </Card>
      )}
      {g.unresolved.length > 0 && (
        <Card data-testid="wb-review-unresolved">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-[15px] font-semibold text-ink">Tasks at an unidentified step</h3>
            <p className="mt-0.5 text-[13px] text-ink-3">The Workbench could not tell which step these tasks are at. Open them in Kissflow.</p>
          </div>
          <Table head={["Task", "Evidence", ""]} dense>
            {g.unresolved.map((t) => (
              <Tr key={t.key}>
                <Td>{t.title}</Td>
                <Td>
                  <EvidenceBadge evidence={t.evidence} />
                </Td>
                <Td>
                  <Link className="inline-flex items-center gap-1 text-brand hover:underline" to={taskRouterPath(t)} data-testid={`wb-review-row-${t.instanceId}-${t.activityInstanceId}`}>
                    Open in Kissflow <ExternalLink size={13} aria-hidden />
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

const dl = (d: string | null | undefined) => (d ? (DEPT_LABEL[d as Dept] ?? d) : "—");
const raw = (t: TaskVM, k: string) => str(t.raw, k);

function RowLink({ t, children }: { t: TaskVM; children: ReactNode }) {
  const to = taskPath(t) ?? taskRouterPath(t);
  return (
    <Link to={to} className="font-medium text-brand hover:underline" data-testid={`wb-review-row-${t.instanceId}-${t.activityInstanceId}`}>
      {children}
    </Link>
  );
}

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <EmptyState icon={<ClipboardList size={22} />} title={title}>
      {children}
    </EmptyState>
  );
}

function CaseRows({ tasks }: { tasks: TaskVM[] }) {
  if (!tasks.length) return <Empty title="No case reviews for you right now.">A case appears here when its department review is open and you hold the task.</Empty>;
  return (
    <Table head={["Case", "Trade name", "Supplier", "Department", "Open items", "Ready to complete"]}>
      {tasks.map((t) => {
        const d = t.step ? deptOfLaneStep(t.step) : null;
        const count = d ? raw(t, `${d}_Open_Count`) : "";
        const gate = d ? raw(t, `${d}_Gate`) : "";
        return (
          <Tr key={t.key}>
            <Td className="whitespace-nowrap">
              <RowLink t={t}>
                <span className="font-mono text-[12.5px]">
                  {t.caseCode || raw(t, "Case_Code") || t.instanceId}
                  {t.cycleNo ? ` · C${t.cycleNo}` : ""}
                </span>
              </RowLink>
            </Td>
            <Td>{raw(t, "Trade_Name") || "—"}</Td>
            <Td>{raw(t, "Supplier_Legal_Name") || "—"}</Td>
            <Td>
              <Badge tone="brand">{dl(d)}</Badge>
            </Td>
            <Td>{count === "" ? <span className="text-ink-3">not counted yet</span> : count}</Td>
            <Td>{gate === "OK" ? <Badge tone="ok">Yes</Badge> : d && `${d}_Gate` in t.raw ? <span className="text-ink-2">Not yet</span> : <span className="text-ink-3">—</span>}</Td>
          </Tr>
        );
      })}
    </Table>
  );
}

function PointRows({ tasks }: { tasks: TaskVM[] }) {
  if (!tasks.length) return <Empty title="No open points to review.">Points reach you when the supplier answered, or when an internal point is raised for your department.</Empty>;
  return (
    <Table head={["Point", "Round", "Kind", "Reference", "Department", "Response", "Internal due"]}>
      {tasks.map((t) => {
        const d = t.step ? deptOfOpReviewStep(t.step) : null;
        const responded = !isBlank(t.raw.Response_Kind);
        return (
          <Tr key={t.key}>
            <Td className="whitespace-nowrap">
              <RowLink t={t}>
                <span className="font-mono text-[12.5px]">{raw(t, "OP_Key") || t.instanceId}</span>
              </RowLink>
            </Td>
            <Td>{raw(t, "Round_No") || "—"}</Td>
            <Td>{raw(t, "OP_Kind") || "—"}</Td>
            <Td className="max-w-[260px] truncate">{raw(t, "Ref_Label") || "—"}</Td>
            <Td>{dl(d)}</Td>
            <Td>{responded ? <Badge tone="info">yes</Badge> : <span className="text-ink-3">no</span>}</Td>
            <Td className="whitespace-nowrap">{fmtDate(t.due ?? raw(t, "Internal_Due_Date"))}</Td>
          </Tr>
        );
      })}
    </Table>
  );
}

function SupplierRows({ tasks }: { tasks: TaskVM[] }) {
  return (
    <div>
      <div className="border-b border-line px-4 py-3 text-[13px] text-ink-2">
        <strong className="font-medium text-ink">Manual record.</strong> Supplier hand-offs are not connected yet: you hold these "Waiting for supplier" tasks because you raised the points. Record the supplier's answer by hand.
      </div>
      <Table head={["Point", "Case", "Question", "Supplier due"]}>
        {tasks.map((t) => (
          <Tr key={t.key}>
            <Td className="whitespace-nowrap">
              <RowLink t={t}>
                <span className="font-mono text-[12.5px]">{raw(t, "OP_Key") || t.instanceId}</span>
              </RowLink>
            </Td>
            <Td className="font-mono text-[12.5px] whitespace-nowrap">{t.caseCode || raw(t, "Case_Code") || "—"}</Td>
            <Td className="max-w-[340px] truncate" title={raw(t, "Question_Text")}>
              {raw(t, "Question_Text") || "—"}
            </Td>
            <Td className="whitespace-nowrap">{fmtDate(t.due ?? raw(t, "Supplier_Due_Date"))}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  );
}

function CrRows({ tasks }: { tasks: TaskVM[] }) {
  if (!tasks.length) return <Empty title="No change requests to assess.">A change request reaches you when Triage marks an impact on your department.</Empty>;
  return (
    <Table head={["Change request", "Change kind", "Case", "Department"]}>
      {tasks.map((t) => (
        <Tr key={t.key}>
          <Td className="whitespace-nowrap">
            <RowLink t={t}>
              <span className="font-mono text-[12.5px]">{raw(t, "CR_Key") || t.instanceId}</span>
            </RowLink>
          </Td>
          <Td>{raw(t, "Change_Kind") || "—"}</Td>
          <Td className="font-mono text-[12.5px] whitespace-nowrap">{t.caseCode || raw(t, "Case_Code") || "—"}</Td>
          <Td>{dl(t.step ? deptOfCrAssessStep(t.step) : null)}</Td>
        </Tr>
      ))}
    </Table>
  );
}

function WaitingRows({ w }: { w: ReturnType<typeof useWaitingOnSupplier> }) {
  if (w.loading && !w.rows.length) return <Skeleton rows={3} />;
  return (
    <div className="space-y-3 p-3">
      <ErrorBanner error={w.error} onRetry={w.reload} />
      <Warnings items={w.warnings} />
      {w.quality && w.quality !== "admin" ? (
        <Note tone="warn">This list needs the complete list of open points, which is not readable with your access.</Note>
      ) : w.points.length === 0 ? (
        <Empty title="Nothing is waiting on the supplier.">Supplier points raised by your departments appear here while someone else records the answer.</Empty>
      ) : (
        <Table head={["Point", "Case", "Question", "Responsible", "Supplier due"]}>
          {w.points.map((p) => (
            <Tr key={p._id}>
              <Td>
                <Link to={`/points/${p._id}`} className="font-mono text-[12.5px] text-brand hover:underline">
                  {p.opKey || p._id}
                </Link>
              </Td>
              <Td className="font-mono text-[12.5px]">{p.caseCode || "—"}</Td>
              <Td className="max-w-[320px] truncate">{p.questionText || "—"}</Td>
              <Td>{p.responsibleName || "—"}</Td>
              <Td className="whitespace-nowrap">{fmtDate(p.supplierDueDate)}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
