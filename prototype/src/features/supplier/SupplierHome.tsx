// "My requests": the supplier's landing page and its one work list (spec §4). The contact's open tasks come first
// (fill in the CIQ with % done, each question with the answer drawer, the final release), then one card per request,
// grouped: needs action · with Beiersdorf · closed. No department names, review statuses or decisions.
// The live portal (old flow) keeps its own Tasks tab, so its requests show the count tiles and the cards only.
import { ArrowRight, CheckCircle2, Inbox, LifeBuoy } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { fmtDate, isOverdue } from "@/domain/selectors";
import type { CiqCase } from "@/domain/types";
import { useIsLivePortal } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { AnswerDrawer } from "./AnswerDrawer";
import { firstName, isClosed, isLiveScope, releasedAt, closedAt, supplierStatus, useSupplierScope, useSupplierTasks } from "./lib";
import { CaseRef, CountTile, DueText, StatusPill } from "./parts";
import { TaskRow } from "./TaskList";

export function SupplierHome() {
  const { me } = useStore();
  const { supplier, cases } = useSupplierScope();
  const [drawer, setDrawer] = useState<{ caseId: string; opId: string } | null>(null);
  const byId = new Map(cases.map((c) => [c.id, c]));
  const tasks = useSupplierTasks().filter((t) => byId.has(t.caseId));
  const overdue = tasks.filter((t) => isOverdue(t.due)).length;
  // Requests of the live portal (old flow) keep the earlier layout: the portal lists the tasks in its own tab, and its
  // home always shows the three count tiles (also with no request yet).
  const livePortal = useIsLivePortal();
  const legacy = (cases.length > 0 && !cases.some(isLiveScope)) || (livePortal && cases.length === 0);
  const liveTasks = tasks.filter((t) => isLiveScope(byId.get(t.caseId)!));

  const withStatus = cases.map((c) => ({ c, s: supplierStatus(c) }));
  const action = withStatus.filter((x) => x.s.action).sort((a, b) => (a.s.due ?? "").localeCompare(b.s.due ?? ""));
  const waiting = withStatus.filter((x) => !x.s.action && !isClosed(x.c));
  const closed = withStatus.filter((x) => isClosed(x.c)).sort((a, b) => (closedAt(b.c) ?? "").localeCompare(closedAt(a.c) ?? ""));
  const openCount = cases.filter((c) => !isClosed(c)).length;
  // "Welcome back" only for a contact who has worked here before (an answer, an upload, a reply or a confirmation).
  const returning = legacy ? cases.length > 0 : cases.some((c) => Object.values(c.answeredBy).some((a) => a.by === me.id) || c.documents.some((d) => d.uploadedBy === me.id) || c.confirmations.some((x) => x.by === me.id) || c.openPoints.some((p) => p.thread.some((m) => m.by === me.id)));
  const inactive = me.side === "supplier" && me.active === false;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={supplier?.name}
        title={returning ? `Welcome back, ${firstName(me.name)}` : `Welcome, ${firstName(me.name)}`}
        subtitle={
          cases.length
            ? `Beiersdorf asks you for information about the raw materials you supply. Each request below is one Cosmetic Ingredient Questionnaire (CIQ). ${legacy ? "Start with the requests that need your action." : "Start with your tasks."}`
            : "Beiersdorf asks you here for information about the raw materials you supply, one Cosmetic Ingredient Questionnaire (CIQ) per material."
        }
        actions={
          <Link to="/portal/help" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline" data-testid="portal-help-link">
            <LifeBuoy size={15} /> How the portal works
          </Link>
        }
      />

      {inactive && (
        <Card data-testid="portal-inactive">
          <EmptyState icon={<Inbox size={28} />} title="Your access has ended">
            Your contact at {supplier?.name ?? "your company"} is no longer active for Beiersdorf's CIQ requests. A colleague now handles them. If this is a mistake, ask your Beiersdorf contact.
          </EmptyState>
        </Card>
      )}

      {cases.length === 0 && !inactive && (
        <Card data-testid="empty-portal">
          <EmptyState
            icon={<Inbox size={28} />}
            title="No requests yet"
            action={
              <Link to="/portal/help" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline">
                <LifeBuoy size={15} /> Read how it works
              </Link>
            }
          >
            When Beiersdorf sends you a CIQ request, you get an e-mail and it appears here.
          </EmptyState>
        </Card>
      )}

      {legacy && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CountTile label="requests in progress" value={openCount} hint={`${action.length} need your action`} />
          <CountTile label={tasks.length === 1 ? "task due" : "tasks due"} value={tasks.length} hint={overdue ? `${overdue} overdue` : "None overdue"} tone={overdue ? "bad" : "neutral"} />
          <CountTile label="completed" value={cases.filter((c) => c.phase === "completed").length} hint="Released and filed by Beiersdorf" />
        </div>
      )}

      {!legacy && cases.length > 0 && (
        <section data-testid="portal-tasks">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h2 className="text-base font-semibold text-ink">
                Your tasks{liveTasks.length > 0 && <span className="ml-1.5 font-normal text-ink-3">({liveTasks.length})</span>}
              </h2>
              <p className="text-[13px] text-ink-3">What Beiersdorf needs from you now, earliest due first. Questions are answered right here.</p>
            </div>
            {liveTasks.length > 0 && (
              <p className="text-[12.5px] text-ink-3">
                {openCount} request{openCount === 1 ? "" : "s"} in progress{overdue ? ` · ${overdue} overdue` : ""}
              </p>
            )}
          </div>
          <Card>
            {liveTasks.length === 0 ? (
              <div className="flex items-start gap-3 px-5 py-4" data-testid="empty-tasks">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" />
                <div className="text-[13px]">
                  <p className="font-semibold text-ink">Nothing to do right now</p>
                  <p className="text-ink-2">When Beiersdorf needs something from you, a task appears here and you get an e-mail.</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {liveTasks.map((t) => (
                  <TaskRow key={`${t.caseId}-${t.openPointId ?? t.kind}`} t={t} c={byId.get(t.caseId)!} onAnswer={() => t.openPointId && setDrawer({ caseId: t.caseId, opId: t.openPointId })} />
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {action.length > 0 && (
        <Group title="Needs your action" hint="Beiersdorf is waiting for you on these requests." testId="requests-action">
          {action.map(({ c }) => (
            <RequestCard key={c.id} c={c} />
          ))}
        </Group>
      )}
      {waiting.length > 0 && (
        <Group title="With Beiersdorf" hint="Nothing to do for now. You get a task and an e-mail if Beiersdorf needs anything." testId="requests-waiting">
          {waiting.map(({ c }) => (
            <RequestCard key={c.id} c={c} />
          ))}
        </Group>
      )}
      {closed.length > 0 && (
        <Group title="Closed" testId="requests-closed">
          {closed.map(({ c }) => (
            <RequestCard key={c.id} c={c} />
          ))}
        </Group>
      )}

      <AnswerDrawer caseId={drawer?.caseId ?? ""} opId={drawer?.opId ?? null} onClose={() => setDrawer(null)} />
    </div>
  );
}

function Group({ title, hint, children, testId }: { title: string; hint?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId}>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function RequestCard({ c }: { c: CiqCase }) {
  const nav = useNavigate();
  const s = supplierStatus(c);
  const closed = isClosed(c);
  return (
    <Card className="transition-shadow hover:shadow-pop" data-testid={`portal-request-${c.id}`} data-phase={c.phase}>
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)_220px] lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)_220px] md:items-center md:gap-6 md:px-5">
        <div className="min-w-0">
          <Link to={s.to} className="block w-fit max-w-full text-[15px] font-semibold text-ink hover:text-brand">
            {c.materialName}
          </Link>
          {c.inci && <p className="truncate text-[13px] text-ink-2" title={c.inci}>INCI: {c.inci}</p>}
          <CaseRef c={c} className="mt-1" />
        </div>
        <div className="min-w-0 space-y-2">
          <StatusPill status={s} />
          {!closed || c.phase === "completed" ? <ProgressBar value={s.progress} tone={c.phase === "completed" ? "ok" : s.action ? "brand" : "info"} /> : null}
          <p className="text-[12px] text-ink-3">{s.progressLabel}</p>
        </div>
        <div className="flex flex-row flex-wrap items-center justify-between gap-3 md:flex-col md:flex-nowrap md:items-end md:justify-center">
          {!closed ? (
            s.due ? <DueText due={s.due} compact /> : <span />
          ) : (
            <span className="text-[12.5px] text-ink-3">{c.phase === "completed" ? `Released ${fmtDate(releasedAt(c))}` : `Withdrawn ${fmtDate(closedAt(c))}`}</span>
          )}
          <Button variant={s.action ? "primary" : "secondary"} size="sm" iconRight={<ArrowRight size={14} />} onClick={() => nav(s.to)} data-testid={`open-request-${c.id}`}>
            {s.cta}
          </Button>
        </div>
      </div>
    </Card>
  );
}
