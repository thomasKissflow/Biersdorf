// RMM Dashboard (/rmm), the case owner's landing page. With no case yet it is one start card; once cases run it shows
// the four operational tiles, what waits on RMM, its own cases, the review bottlenecks and the latest activity.
// Lead time and first-time-right live on Reports only.
// Phones (< 768 px, Thomas 30 Oct): the cards stack (as below 1280 px), "My cases" is one card per case (the row's test
// id), and the buttons and filter chips are 44 px targets.
import { ArrowRight, Building2, CircleCheck, FilePlus2, Send, TriangleAlert, UserRoundCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, BarsChart, Button, Card, CardHeader, CardList, CardListItem, EmptyState, Mono, PageHeader, Segmented, StatCard, Table, Td, Timeline, Tr, cx } from "@/components/ui";
import { TrackBadge } from "@/components/status";
import { DEPT_LABEL, DEPT_SHORT } from "@/domain/catalog";
import { deptWorkload } from "@/domain/metrics";
import { fmtDate, fmtDateTime, isClosed, isOverdue, nowIso, supplierName, userName, waitingOn } from "@/domain/selectors";
import { activeSuppliers } from "@/domain/suppliers";
import type { CiqCase } from "@/domain/types";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";
import { ATTENTION_LABEL, attentionItems, recentActivity, type AttentionKind } from "./attention";
import { PHONE_CHIP, PHONE_TAPS } from "./phone";
import { CaseCell, DueCell, NoAccess, OpenPointsCell, PHASE_SHORT, ResponsiveCardHeader, STARTS_AT_COMPLETENESS, auditTone, canManage, overduePoints } from "./shared";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function RmmDashboard() {
  const { state, me, persona } = useStore();
  const nav = useNavigate();
  const phone = useIsPhone();
  if (!canManage(persona)) return <NoAccess />;

  const today = `${new Date(nowIso()).toLocaleDateString("en-GB", { weekday: "long" })}, ${fmtDate(nowIso())}`;
  const mine = state.cases.filter((c) => c.ownerId === me.id);
  const myOpen = mine.filter((c) => !isClosed(c));
  const myAttention = attentionItems(mine).length;
  const suppliers = activeSuppliers(state).length;

  const header = (subtitle: string) => (
    <PageHeader
      eyebrow="Raw Material Management"
      title={`${greeting()}, ${me.name.split(" ")[0]}`}
      subtitle={`${today} · ${subtitle}`}
      actions={
        state.cases.length > 0 && (
          <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => nav("/cases/new")} data-testid="new-case" className={phone ? "h-11" : undefined}>
            New case
          </Button>
        )
      }
    />
  );

  if (!state.cases.length) {
    return (
      <div className="space-y-6">
        {header("No CIQ case yet.")}
        <StartCard suppliers={suppliers} />
      </div>
    );
  }

  const withSupplier = myOpen.filter((c) => waitingOn(c) === "supplier").length;
  const withBdf = myOpen.filter((c) => waitingOn(c) === "bdf").length;
  const overdueOps = myOpen.reduce((n, c) => n + overduePoints(c).length, 0);
  const pastDue = myOpen.filter((c) => isOverdue(c.dueDate)).length;
  const anyInReview = state.cases.some((c) => c.phase === "review");

  return (
    <div className="space-y-6">
      {header(myOpen.length ? `You own ${plural(myOpen.length, "open case")}; ${plural(myAttention, "item")} ${myAttention === 1 ? "needs" : "need"} your action.` : "You own no open case right now.")}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div data-testid="tile-my-open" data-count={myOpen.length}>
          <StatCard label="My open cases" value={myOpen.length} hint={pastDue ? `${pastDue} past the due date` : "none past the due date"} onClick={() => nav("/cases?owner=me")} />
        </div>
        <div data-testid="tile-with-supplier" data-count={withSupplier}>
          <StatCard label="With supplier" value={withSupplier} tone="violet" hint="filling in, answering or releasing" onClick={() => nav("/cases?owner=me&waiting=supplier")} />
        </div>
        <div data-testid="tile-with-bdf" data-count={withBdf}>
          <StatCard label="With Beiersdorf" value={withBdf} tone="info" hint="in review by RMM or a department" onClick={() => nav("/cases?owner=me&waiting=bdf")} />
        </div>
        <div data-testid="tile-overdue-points" data-count={overdueOps}>
          <StatCard label="Overdue open points" value={overdueOps} tone={overdueOps ? "bad" : "ok"} hint="supplier past the due date" onClick={() => nav("/cases?owner=me&overdue=1")} />
        </div>
      </div>

      {anyInReview ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <NeedsAction />
          </div>
          <div className="xl:col-span-2">
            <BottleneckCard />
          </div>
        </div>
      ) : (
        <NeedsAction />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <MyCases cases={mine} />
        </div>
        <div className="xl:col-span-2">
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------- zero cases

function StartCard({ suppliers }: { suppliers: number }) {
  const nav = useNavigate();
  const tap = useIsPhone() ? "h-11" : undefined;
  const steps: [ReactNode, string, string][] = [
    [<FilePlus2 key="i" size={16} />, "You start the case", "Trade name, main INCI, BDF material no., the supplier and its contacts, the target markets and the due date."],
    [<Send key="i" size={16} />, "The supplier fills in the CIQ", "The contacts get an e-mail. Their answers open the sections that apply, and they confirm completeness."],
    [<UserRoundCheck key="i" size={16} />, "You and the departments review", "Only the departments concerned get a task. When everyone has completed, the supplier gives the final release."],
  ];
  return (
    <Card data-testid="dashboard-start" className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="p-6 sm:p-8">
          <h2 className="text-[20px] font-semibold tracking-tight text-ink">Start your first CIQ case</h2>
          <p className="mt-2 max-w-prose text-[14px] text-ink-2">
            There is no case yet. Choose a supplier from the supplier master and the raw material, and the supplier contacts are invited to fill in the Cosmetic Ingredient Questionnaire.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => nav("/cases/new")} data-testid="new-case" className={tap}>
              New case
            </Button>
            <Button variant="secondary" icon={<Building2 size={16} />} onClick={() => nav("/suppliers")} data-testid="dashboard-suppliers" className={tap}>
              Suppliers ({suppliers})
            </Button>
          </div>
        </div>
        <ol className="space-y-4 border-t border-line bg-surface-2 p-6 sm:p-8 lg:border-t-0 lg:border-l">
          {steps.map(([icon, t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden>
                {icon}
              </span>
              <div>
                <p className="text-[13.5px] font-medium text-ink">
                  <span className="text-ink-3">{i + 1}.</span> {t}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------- needs action

type Scope = "mine" | "all";

function NeedsAction() {
  const { state, me } = useStore();
  const nav = useNavigate();
  const [scope, setScope] = useState<Scope>("mine");
  const [kind, setKind] = useState<AttentionKind | "all">("all");
  const [expanded, setExpanded] = useState(false);
  const cases = scope === "mine" ? state.cases.filter((c) => c.ownerId === me.id) : state.cases;
  const all = attentionItems(cases);
  const counts = all.reduce<Partial<Record<AttentionKind, number>>>((m, i) => ({ ...m, [i.kind]: (m[i.kind] ?? 0) + 1 }), {});
  const list = kind === "all" ? all : all.filter((i) => i.kind === kind);
  const shown = expanded ? list : list.slice(0, 6);
  const open = cases.filter((c) => !isClosed(c));
  const withSupplier = open.filter((c) => waitingOn(c) === "supplier").length;
  const others = state.cases.some((c) => c.ownerId !== me.id);
  const phone = useIsPhone();
  const scopeSwitch = (
    <Segmented<Scope>
      value={scope}
      onChange={(v) => {
        setScope(v);
        setKind("all");
      }}
      options={[
        { value: "mine", label: "My cases" },
        { value: "all", label: "All owners" },
      ]}
    />
  );

  return (
    <Card data-testid="needs-action" data-count={all.length}>
      <ResponsiveCardHeader
        title={
          <span className="inline-flex items-center gap-2">
            Needs your action
            <span className="rounded-full bg-surface-3 px-2 text-xs font-medium text-ink-2">{all.length}</span>
          </span>
        }
        subtitle="Most urgent first: rejections, overdue supplier answers, your reviews, release requests, idle cases."
        action={others ? phone ? <div className={PHONE_TAPS}>{scopeSwitch}</div> : scopeSwitch : undefined}
      />
      {all.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
          <FilterChip active={kind === "all"} onClick={() => setKind("all")} testId="attention-filter-all">
            All · {all.length}
          </FilterChip>
          {(Object.keys(ATTENTION_LABEL) as AttentionKind[])
            .filter((k) => counts[k])
            .map((k) => (
              <FilterChip key={k} active={kind === k} onClick={() => setKind(k)} testId={`attention-filter-${k}`}>
                {ATTENTION_LABEL[k]} · {counts[k]}
              </FilterChip>
            ))}
        </div>
      )}
      {list.length === 0 ? (
        <div data-testid="empty-needs-action">
          <EmptyState icon={<CircleCheck size={28} />} title="Nothing waits on you right now">
            {open.length ? `${plural(open.length, "open case")}${scope === "mine" ? " you own" : ""}: ${withSupplier ? `${withSupplier} with the supplier` : "none with the supplier"}${open.length - withSupplier ? `, ${open.length - withSupplier} with Beiersdorf` : ""}.` : "No open case at the moment."}
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((i) => (
            <li key={i.key} data-testid={`attention-item-${i.key}`} data-kind={i.kind} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={i.tone} dot>
                    {i.label}
                  </Badge>
                  <span className="text-[12.5px] text-ink-3">{i.when}</span>
                </div>
                <p className="mt-1.5 text-[13.5px] font-medium text-ink">{i.title}</p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  <Link to={`/cases/${i.c.id}`} className="font-medium text-ink hover:text-brand hover:underline">
                    {i.c.materialName}
                  </Link>{" "}
                  <Mono className="text-ink-3">{i.c.id}</Mono> · {supplierName(state, i.c.supplierId)}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">{i.detail}</p>
                {i.flag && (
                  <p className="mt-1.5 inline-flex items-start gap-1.5 text-[12.5px] text-ink-2">
                    <TriangleAlert size={14} className={cx("mt-px shrink-0", i.tone === "bad" ? "text-bad" : "text-warn")} aria-hidden />
                    {i.flag}
                  </p>
                )}
              </div>
              <Button size="sm" variant="secondary" iconRight={<ArrowRight size={14} />} onClick={() => nav(i.to)} className={cx("self-start", phone && "h-11")} data-testid={`attention-open-${i.key}`}>
                {i.cta}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 6 && (
        <div className="border-t border-line px-4 py-2.5">
          <button onClick={() => setExpanded((e) => !e)} className={cx("text-[13px] font-medium text-brand hover:underline", phone && "min-h-11")}>
            {expanded ? "Show fewer" : `Show all ${list.length}`}
          </button>
        </div>
      )}
    </Card>
  );
}

function FilterChip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} data-testid={testId} className={cx("rounded-full border px-2.5 py-0.5 text-[12.5px] transition-colors", useIsPhone() && PHONE_CHIP, active ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink")}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------------- bottlenecks

// Axis ticks only (tooltips keep the full name); same abbreviations as the review chips in Cases.
const TICK_SHORT: Record<string, string> = { Microbiology: "Micro", Sustainability: "Sust." };

/** Open review tracks per review (RMM included). Shown only while at least one case is in review. */
function BottleneckCard() {
  const { state } = useStore();
  const load = deptWorkload(state).filter((d) => d.active > 0 || d.overdue > 0);
  const data = load.map((d) => ({ dept: DEPT_SHORT[d.dept], inReview: Math.max(0, d.active - d.waitingSupplier), waiting: d.waitingSupplier, overdue: d.overdue }));
  const top = [...load].sort((a, b) => b.active - b.waitingSupplier - (a.active - a.waitingSupplier))[0];
  const topInternal = top ? top.active - top.waitingSupplier : 0;
  const topSupplier = [...load].sort((a, b) => b.waitingSupplier - a.waitingSupplier)[0];
  // A queue is "longest" only when it is strictly ahead of the others.
  const internalOf = (d: (typeof load)[number]) => d.active - d.waitingSupplier;
  const internalTies = load.filter((d) => internalOf(d) === topInternal).length;
  const withInternal = load.filter((d) => internalOf(d) > 0).length;
  const internalTotal = load.reduce((n, d) => n + internalOf(d), 0);
  const supplierTies = topSupplier ? load.filter((d) => d.waitingSupplier === topSupplier.waitingSupplier).length : 0;
  return (
    <Card data-testid="bottlenecks">
      <CardHeader title="Bottlenecks by review" subtitle="Open review tasks of RMM and the departments, and overdue open points" />
      <div className="px-2 pt-3">
        <BarsChart
          data={data}
          xKey="dept"
          stacked
          height={220}
          tickFormatter={(v) => TICK_SHORT[v] ?? v}
          series={[
            { key: "inReview", label: "In review at Beiersdorf", color: "var(--chart-1)" },
            { key: "waiting", label: "Waiting for the supplier", color: "var(--chart-4)" },
            { key: "overdue", label: "Overdue open points", color: "var(--chart-5)" },
          ]}
        />
      </div>
      {(topInternal > 0 || (topSupplier && topSupplier.waitingSupplier > 0)) && (
        <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-2" data-testid="bottlenecks-takeaway">
          {topInternal > 0 &&
            (internalTies > 1 ? (
              <>{internalTies === withInternal ? `${internalTotal} reviews in progress at Beiersdorf, evenly spread (${topInternal} each).` : `Longest internal queues: ${load.filter((d) => d.active - d.waitingSupplier === topInternal).map((d) => DEPT_SHORT[d.dept]).join(", ")} (${topInternal} in review each).`} </>
            ) : (
              <>
                Longest internal queue: <span className="font-medium text-ink">{DEPT_LABEL[top.dept]}</span> ({topInternal} in review).{" "}
              </>
            ))}
          {topSupplier &&
            topSupplier.waitingSupplier > 0 &&
            (supplierTies > 1 ? (
              <>Waiting on suppliers: {load.filter((d) => d.waitingSupplier === topSupplier.waitingSupplier).map((d) => DEPT_SHORT[d.dept]).join(", ")} ({topSupplier.waitingSupplier} each).</>
            ) : (
              <>
                Most waiting on suppliers: <span className="font-medium text-ink">{DEPT_LABEL[topSupplier.dept]}</span> ({topSupplier.waitingSupplier}).
              </>
            ))}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------- tables

function MyCases({ cases }: { cases: CiqCase[] }) {
  const nav = useNavigate();
  const phone = useIsPhone();
  const open = cases.filter((c) => !isClosed(c)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const shown = open.slice(0, 8);
  return (
    <Card data-testid="my-cases">
      <CardHeader
        title="My cases"
        subtitle="Open cases you own, nearest due date first"
        action={
          open.length > 0 && (
            <Link to="/cases?owner=me" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
              View all {open.length} <ArrowRight size={14} />
            </Link>
          )
        }
      />
      {shown.length === 0 ? (
        <div data-testid="empty-my-cases">
          <EmptyState title="You own no open case">
            Start a new case to invite a supplier.{" "}
            <Link to="/cases?tab=completed" className="font-medium text-brand hover:underline">
              Completed cases
            </Link>{" "}
            stay in Cases.
          </EmptyState>
        </div>
      ) : phone ? (
        <CardList label="My cases" className="p-3">
          {shown.map((c) => {
            const mine = c.reviews.find((r) => r.dept === "RMM");
            return (
              <CardListItem
                key={c.id}
                data-testid={`dashboard-case-${c.id}`}
                onClick={() => nav(`/cases/${c.id}`)}
                title={c.materialName}
                badge={c.priority === "high" ? <span className="rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-ink-2 uppercase">High</span> : undefined}
                meta={
                  <>
                    <Mono className="text-ink-2">{c.id}</Mono> · {PHASE_SHORT[c.phase]} · {waitingOn(c) === "supplier" ? "with supplier" : "with Beiersdorf"}
                  </>
                }
                fields={[
                  { label: "My review", value: mine ? <TrackBadge status={mine.status} /> : <span className="text-xs text-ink-3">{STARTS_AT_COMPLETENESS}</span> },
                  { label: "Open points", value: <OpenPointsCell c={c} /> },
                  { label: "Due", value: <DueCell c={c} /> },
                ]}
              />
            );
          })}
        </CardList>
      ) : (
        <Table head={["Case", "Phase", "My review", "Open points", "Due"]}>
          {shown.map((c) => {
            const mine = c.reviews.find((r) => r.dept === "RMM");
            return (
              <Tr key={c.id} onClick={() => nav(`/cases/${c.id}`)} data-testid={`dashboard-case-${c.id}`}>
                <Td className="max-w-[240px]">
                  <CaseCell c={c} compact />
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="text-[13px] text-ink">{PHASE_SHORT[c.phase]}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                    <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", waitingOn(c) === "supplier" ? "bg-violet" : "bg-info")} />
                    {waitingOn(c) === "supplier" ? "With supplier" : "With Beiersdorf"}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">{mine ? <TrackBadge status={mine.status} /> : <span className="text-xs text-ink-3">{STARTS_AT_COMPLETENESS}</span>}</Td>
                <Td>
                  <OpenPointsCell c={c} />
                </Td>
                <Td>
                  <DueCell c={c} />
                </Td>
              </Tr>
            );
          })}
        </Table>
      )}
    </Card>
  );
}

function RecentActivity() {
  const { state } = useStore();
  const events = recentActivity(state.cases, 10);
  return (
    <Card data-testid="recent-activity">
      <CardHeader title="Recent activity" subtitle="Latest entries across all cases" />
      <div className="px-4 py-4">
        {events.length === 0 ? (
          <div data-testid="empty-recent-activity">
            <EmptyState title="No activity yet" />
          </div>
        ) : (
          <Timeline
            items={events.map((e) => ({
              id: `${e.c.id}-${e.id}`,
              at: fmtDateTime(e.at),
              title: e.action,
              who: userName(state, e.by),
              tone: auditTone(e.action, e.by, e.detail),
              body: (
                <>
                  <Link to={`/cases/${e.c.id}?tab=history`} className="text-[12.5px] font-medium text-ink hover:text-brand hover:underline">
                    <Mono className="text-ink-2">{e.c.id}</Mono> · {e.c.materialName}
                  </Link>
                  <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-ink-3">{e.detail}</span>
                </>
              ),
            }))}
          />
        )}
      </div>
    </Card>
  );
}
