// /review — My reviews: one review track per case, for the departments and for RMM's review of the whole CIQ, which
// runs in parallel with theirs. Three tabs with counts and one inline alert when something waits on the reviewer.
// On a phone (< 768 px) the rows are stacked cards (each opens its review), the lane above the search instead of the
// page header (the phone header names the page), and the tabs fit the screen.
import { ChevronRight, ClipboardCheck, Search, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Card, CardList, CardListItem, EmptyState, Mono, PageHeader, Table, Tabs, Td, TextInput, Tr, cx } from "@/components/ui";
import { DecisionBadge, PhaseBadge, TrackBadge } from "@/components/status";
import { DEPT_LABEL, DEPT_SHORT } from "@/domain/catalog";
import { daysBetween, fmtDate, isClosed, isOverdue, nowIso, relDays, supplierName, userName } from "@/domain/selectors";
import { useIsPhone } from "@/shell/useLayoutMode";
import { type QueueTab, pointCounts, queueAlert, queueRows } from "./lib";
import { DeptProgress, NotReviewer, OriginFlag, isRmesDept, isRmmLane, useReviewer } from "./shared";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ReviewQueue() {
  const { state, me, dept } = useReviewer();
  const nav = useNavigate();
  const phone = useIsPhone();
  const [tab, setTab] = useState<QueueTab>("todo");
  const [q, setQ] = useState("");
  if (!dept) return <NotReviewer />;

  const lists = queueRows(state, dept);
  const alert = queueAlert(state, dept);
  const total = lists.todo.length + lists.waiting.length + lists.done.length;
  const rmm = isRmmLane(dept);
  const needle = q.trim().toLowerCase();
  const rows = lists[tab]
    .filter((r) => !needle || [r.c.id, r.c.materialName, r.c.inci, r.c.materialNo, supplierName(state, r.c.supplierId)].some((x) => x.toLowerCase().includes(needle)))
    .sort((a, b) => {
      if (tab === "done") return (b.t.completedAt ?? "").localeCompare(a.t.completedAt ?? "");
      const pa = pointCounts(a.c, dept).answered > 0 ? 0 : 1;
      const pb = pointCounts(b.c, dept).answered > 0 ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (a.c.priority !== b.c.priority) return a.c.priority === "high" ? -1 : 1;
      return a.c.dueDate.localeCompare(b.c.dueDate);
    });

  const empty: Record<QueueTab, { title: string; body: string }> = {
    todo: { title: "Nothing to review right now", body: "Cases with your review open appear here. When you ask the supplier something, the case moves to “Waiting for supplier” until it answers." },
    waiting: { title: "No case is waiting for the supplier", body: "When you send a query or a document request, the case moves here until the supplier answers." },
    done: { title: "No completed reviews yet", body: rmm ? "Cases appear here once you complete your review of the whole CIQ." : `Cases appear here once you complete the ${DEPT_SHORT[dept]} review.` },
  };

  // a phone: one full-width 44 px row per alert, each with a chevron (each switches the tab), no separator left dangling
  const alertBar =
    (alert.answered > 0 || alert.overdue > 0) &&
    (phone ? (
      <div data-testid="review-alert" className="mb-4 overflow-hidden rounded-lg bg-warn-soft text-[13px] text-ink">
        {alert.answered > 0 && (
          <button type="button" data-testid="review-alert-answers" onClick={() => setTab(alert.answeredTab)} className="flex min-h-11 w-full items-center gap-2 px-3.5 py-2 text-left font-medium hover:bg-warn/10">
            <TriangleAlert size={15} className="shrink-0 text-ink-2" aria-hidden />
            <span className="min-w-0 flex-1">{plural(alert.answered, "supplier answer")} to check</span>
            <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
          </button>
        )}
        {alert.overdue > 0 && (
          <button type="button" data-testid="review-alert-overdue" onClick={() => setTab(alert.overdueTab)} className={cx("flex min-h-11 w-full items-center gap-2 px-3.5 py-2 text-left font-medium hover:bg-warn/10", alert.answered > 0 && "border-t border-warn/25")}>
            <TriangleAlert size={15} className="shrink-0 text-ink-2" aria-hidden />
            <span className="min-w-0 flex-1">{alert.overdue === 1 ? "1 of your open points is" : `${alert.overdue} of your open points are`} overdue at the supplier</span>
            <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
          </button>
        )}
      </div>
    ) : (
      <div data-testid="review-alert" className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-warn-soft px-3.5 py-2.5 text-[13px] text-ink-2">
        <TriangleAlert size={15} className="shrink-0 text-ink-2" />
        {alert.answered > 0 && (
          <button type="button" data-testid="review-alert-answers" onClick={() => setTab(alert.answeredTab)} className="font-medium text-ink underline-offset-2 hover:underline">
            {plural(alert.answered, "supplier answer")} to check
          </button>
        )}
        {alert.answered > 0 && alert.overdue > 0 && <span aria-hidden>·</span>}
        {alert.overdue > 0 && (
          <button type="button" data-testid="review-alert-overdue" onClick={() => setTab(alert.overdueTab)} className="font-medium text-ink underline-offset-2 hover:underline">
            {alert.overdue === 1 ? "1 of your open points is" : `${alert.overdue} of your open points are`} overdue at the supplier
          </button>
        )}
      </div>
    ));
  const emptyState: ReactNode =
    total === 0 ? (
      <EmptyState icon={<ClipboardCheck size={28} strokeWidth={1.6} />} title="No review tasks yet">
        {/* live too: I-2 starts the reviews at the confirmation (E-A, 22 Oct) */}
        {rmm
          ? "Your review of the whole CIQ starts on every case as soon as the supplier confirms completeness. You also get an e-mail."
          : `A task appears when a supplier confirms completeness on a case with a ${DEPT_SHORT[dept]} section. You also get an e-mail.`}
      </EmptyState>
    ) : rows.length === 0 ? (
      <EmptyState icon={<ClipboardCheck size={28} strokeWidth={1.6} />} title={needle ? "No case matches your search" : empty[tab].title}>
        {needle ? "Try the material name, the case number, the BDF material no. or the supplier." : empty[tab].body}
      </EmptyState>
    ) : null;

  if (phone)
    // the phone header says "My reviews": the lane and the search come first, then the tabs and the cards
    return (
      <div data-testid="review-queue">
        <h1 className="sr-only">My reviews</h1>
        <p className="text-xs font-semibold tracking-wide text-brand uppercase">{rmm ? "RMM review" : DEPT_LABEL[dept]}</p>
        {total > 0 && (
          <div className="relative mt-2">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <TextInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search material, case, supplier" className="min-h-11 pl-9" aria-label="Search cases" data-testid="review-search" />
          </div>
        )}
        <div className="mt-4">{alertBar}</div>
        <Tabs
          className="mb-3 [&>button]:min-h-11"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "todo", label: <span data-testid="review-tab-todo">To review</span>, count: lists.todo.length },
            {
              value: "waiting",
              label: (
                <span data-testid="review-tab-waiting">
                  Waiting<span className="sr-only"> for supplier</span>
                </span>
              ),
              count: lists.waiting.length,
            },
            { value: "done", label: <span data-testid="review-tab-done">Completed</span>, count: lists.done.length },
          ]}
        />
        {emptyState ? (
          <Card>{emptyState}</Card>
        ) : (
          <CardList label={`My reviews: ${tab === "todo" ? "to review" : tab === "waiting" ? "waiting for supplier" : "completed"}`} data-testid="review-cards">
            {rows.map(({ c, t }) => {
              const p = pointCounts(c, dept);
              const late = !isClosed(c) && isOverdue(c.dueDate);
              const days = t.startedAt ? Math.round(daysBetween(t.startedAt, nowIso())) : undefined;
              return (
                <CardListItem
                  key={c.id}
                  data-testid={`review-row-${c.id}`}
                  onClick={() => nav(`/review/${c.id}`)}
                  title={c.materialName}
                  badge={c.priority === "high" ? <Badge tone="warn">High priority</Badge> : undefined}
                  meta={
                    <>
                      <span>
                        <Mono>{c.id}</Mono> · {c.inci}
                      </span>
                      <span className="block">{supplierName(state, c.supplierId)}</span>
                      {rmm && <OriginFlag c={c} compact />}
                    </>
                  }
                  fields={[
                    {
                      label: "My review",
                      value: (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <TrackBadge status={t.status} />
                          {isRmesDept(dept) && t.decision && <DecisionBadge decision={t.decision} />}
                          {t.assigneeId !== me.id && <span className="block w-full text-[11.5px] text-ink-3">Assigned to {userName(state, t.assigneeId)}</span>}
                          {tab === "done" && c.phase !== "review" && <PhaseBadge phase={c.phase} />}
                        </span>
                      ),
                    },
                    {
                      label: "My open points",
                      value:
                        p.open === 0 ? (
                          <span className="text-ink-3">None</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span>{p.open} open</span>
                            {p.answered > 0 && <Badge tone="warn">{p.answered} answered</Badge>}
                            {p.overdue > 0 && <Badge tone="bad">{p.overdue} overdue</Badge>}
                          </span>
                        ),
                    },
                    { label: tab === "done" ? "Completed" : "In review for", value: tab === "done" ? fmtDate(t.completedAt) : days === undefined ? "—" : days === 0 ? "Since today" : plural(days, "day") },
                    {
                      label: "Case due",
                      value: (
                        <>
                          {fmtDate(c.dueDate)}
                          {!isClosed(c) && <span className={late ? "block text-xs font-medium text-bad" : "block text-xs text-ink-3"}>{late ? `Overdue · ${relDays(c.dueDate)}` : relDays(c.dueDate)}</span>}
                        </>
                      ),
                    },
                  ]}
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[11.5px] text-ink-3">All reviews</span>
                    <DeptProgress c={c} />
                  </span>
                </CardListItem>
              );
            })}
          </CardList>
        )}
      </div>
    );

  return (
    <div data-testid="review-queue">
      <PageHeader
        eyebrow={rmm ? "RMM review" : DEPT_LABEL[dept]}
        title="My reviews"
        subtitle={
          rmm
            ? "Your review of the whole CIQ, in parallel with the departments. Ask the supplier on any section, align in internal notes and complete your review. The final-release request waits for you too."
            : `Cases with a ${DEPT_SHORT[dept]} review task. You read every section, ask the supplier directly${isRmesDept(dept) ? ", record your internal decision" : ""} and complete the ${DEPT_SHORT[dept]} review.${isRmesDept(dept) ? " The RMES tab shows the material's evaluation sheet, filled automatically from the CIQ." : ""}`
        }
        actions={
          total > 0 ? (
            <div className="relative w-[calc(100vw-2rem)] sm:w-64">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search material, case, supplier" className="pl-9" aria-label="Search cases" data-testid="review-search" />
            </div>
          ) : undefined
        }
      />

      {alertBar}

      <Card>
        <div className="px-4 pt-1">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "todo", label: <span data-testid="review-tab-todo">To review</span>, count: lists.todo.length },
              { value: "waiting", label: <span data-testid="review-tab-waiting">Waiting for supplier</span>, count: lists.waiting.length },
              { value: "done", label: <span data-testid="review-tab-done">Completed</span>, count: lists.done.length },
            ]}
          />
        </div>
        <div>
          {emptyState ?? (
            <Table head={["Case", "Supplier", "My review", "My open points", tab === "done" ? "Completed" : "In review for", "All reviews", "Case due"]}>
              {rows.map(({ c, t }) => {
                const p = pointCounts(c, dept);
                const late = !isClosed(c) && isOverdue(c.dueDate);
                const days = t.startedAt ? Math.round(daysBetween(t.startedAt, nowIso())) : undefined;
                return (
                  <Tr key={c.id} onClick={() => nav(`/review/${c.id}`)}>
                    <Td className="min-w-[220px]" data-testid={`review-row-${c.id}`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium text-ink">{c.materialName}</span>
                        {c.priority === "high" && <Badge tone="warn">High priority</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-3">
                        <Mono>{c.id}</Mono> · {c.inci}
                      </div>
                      {rmm && <OriginFlag c={c} compact />}
                    </Td>
                    <Td className="text-ink-2">{supplierName(state, c.supplierId)}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TrackBadge status={t.status} />
                        {isRmesDept(dept) && t.decision && <DecisionBadge decision={t.decision} />}
                      </div>
                      {t.assigneeId !== me.id && <div className="mt-1 text-[11.5px] whitespace-nowrap text-ink-3">Assigned to {userName(state, t.assigneeId)}</div>}
                      {tab === "done" && c.phase !== "review" && (
                        <div className="mt-1">
                          <PhaseBadge phase={c.phase} />
                        </div>
                      )}
                    </Td>
                    <Td>
                      {p.open === 0 ? (
                        <span className="text-ink-3">None</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-ink">{p.open} open</span>
                          {p.answered > 0 && <Badge tone="warn">{p.answered} answered</Badge>}
                          {p.overdue > 0 && <Badge tone="bad">{p.overdue} overdue</Badge>}
                        </div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{tab === "done" ? fmtDate(t.completedAt) : days === undefined ? "—" : days === 0 ? "Since today" : plural(days, "day")}</Td>
                    <Td>
                      <DeptProgress c={c} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="text-ink">{fmtDate(c.dueDate)}</div>
                      {!isClosed(c) && <div className={late ? "text-xs font-medium text-bad" : "text-xs text-ink-3"}>{late ? `Overdue · ${relDays(c.dueDate)}` : relDays(c.dueDate)}</div>}
                    </Td>
                  </Tr>
                );
              })}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
