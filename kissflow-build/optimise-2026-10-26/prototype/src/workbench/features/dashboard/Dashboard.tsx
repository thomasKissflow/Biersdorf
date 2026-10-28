// The RMM dashboard (#/rmm), also the Business owner's read-only "Operations" page. Modelled on the prototype's
// src/features/rmm/Dashboard.tsx; every number is computed from live data (useOps) and nothing here writes.
import { FilePlus2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, PageHeader } from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/data";
import { useWorkbench } from "../../data/hooks";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { ErrorBanner, LoadingCard, Page, WarningsList } from "../case/shared";
import { BottleneckCard, DeptCard, NeedsAttention } from "./cards";
import { attentionItems, bottleneckByStep, byDepartment, isOpenCase, kpis, partialWhat } from "./metrics";
import { useOps, type Ops } from "./useOps";

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The banners every ops page shows: partial lists (cases, open points, change requests), errors and warnings. */
export function OpsBanners({ ops }: { ops: Ops }) {
  return (
    <>
      <ReadQualityBanner quality={ops.quality.cases} indexOnly={ops.indexOnly} what="Cases" scope="cases" counts />
      <ReadQualityBanner quality={ops.quality.points} what="Open points" scope="open points" counts />
      <ReadQualityBanner quality={ops.quality.crs} what="Change requests" scope="change requests" counts />
      <ErrorBanner error={ops.error} onRetry={ops.reload} />
      <WarningsList warnings={ops.warnings} />
    </>
  );
}

export function Dashboard() {
  const { me, caps } = useWorkbench();
  const nav = useNavigate();
  const ops = useOps();
  const rmm = caps.roles.has("ciq_rmm");
  const [scope, setScope] = useState<"mine" | "all">(rmm ? "mine" : "all");
  const now = useMemo(() => new Date(), [ops.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = ops.data;
  const cov = ops.coverage;
  const k = useMemo(() => (d ? kpis(d, now, cov) : null), [d, now, cov]);
  const mine = useMemo(() => (d ? d.cases.filter((c) => c.ownerRmm?._id === me._id) : []), [d, me._id]);
  const items = useMemo(() => (d ? attentionItems(d, scope === "mine" ? mine : d.cases, now, cov) : []), [d, mine, scope, now, cov]);
  const steps = useMemo(() => (d ? bottleneckByStep(d.cases, now) : null), [d, now]);
  const depts = useMemo(() => (d ? byDepartment(d, now) : []), [d, now]);
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const myOpen = mine.filter(isOpenCase).length;
  const pc = partialWhat(cov, ["cases"]);
  const pp = partialWhat(cov, ["points"]);
  const tag = (hint: string, partial?: string) => (partial ? `${hint} · partial` : hint);

  return (
    <Page testId="wb-dashboard">
      <PageHeader
        eyebrow={rmm ? "Raw Material Management" : "Operations"}
        title={rmm ? `${greeting(now)}, ${me.Name.split(" ")[0] || me.Name}` : "CIQ operations overview"}
        subtitle={rmm ? `${today} · You own ${myOpen} open case${myOpen === 1 ? "" : "s"}. Test cases are not counted.` : `${today} · All CIQ cases you can read, read-only. Test cases are not counted.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => nav("/cases")}>
              All cases
            </Button>
            {caps.canInitiate("CIQ_Case_A00") && (
              <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => nav("/cases/new")}>
                New case
              </Button>
            )}
          </>
        }
      />
      <OpsBanners ops={ops} />
      {!d || !k || !steps ? (
        ops.loading ? <LoadingCard label="Loading the dashboard…" rows={6} /> : null
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="wb-dash-kpis">
            <StatCard label="Open cases" value={k.open} hint={tag(`${k.pastDue} past supplier due date`, pc)} onClick={() => nav("/cases?status=in-progress")} />
            <StatCard label="With supplier" value={k.withSupplier} tone="violet" hint={tag("at a supplier step", pc)} />
            <StatCard label="With Beiersdorf" value={k.withBdf} tone="info" hint={tag(k.stepUnknown ? `${k.stepUnknown} at a step not readable` : "scope, review, approval or checks", pc)} />
            <StatCard label="Overdue open points" value={k.overduePointsAtSupplier} tone={k.overduePointsAtSupplier ? "bad" : "ok"} hint={tag("supplier past due date", pp)} />
            <StatCard label="Average lead time" value={k.avgLeadDays ?? "—"} unit={k.avgLeadDays === null ? undefined : "days"} hint={k.leadN ? tag(`creation to final release, ${k.leadN} case${k.leadN === 1 ? "" : "s"}`, pc) : "no case has reached final release yet"} />
            <StatCard label="First-time-right" value={k.firstTimeRight ?? "—"} unit={k.firstTimeRight === null ? undefined : "%"} hint={!cov.points ? "needs every open point: not available with your access" : k.ftrN ? tag(`${k.ftrN} at final release, no supplier open point`, pc) : "no case at final release yet"} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <NeedsAttention items={items} title={rmm ? "Needs your action" : "Needs attention"} scope={scope} setScope={rmm ? setScope : undefined} partial={partialWhat(cov, ["cases", "points"])} />
            </div>
            <div className="space-y-6 xl:col-span-2">
              <BottleneckCard v={steps} partial={pc} />
            </div>
          </div>
          <DeptCard rows={depts} partial={partialWhat(cov, ["cases", "points", "crs"])} />
        </>
      )}
    </Page>
  );
}
