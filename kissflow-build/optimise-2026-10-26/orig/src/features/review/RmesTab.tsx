// RMES tab (Safety and Regulatory only): criteria grouped by Part A–D, the other RMES department
// read only (REQ-CFG-004), findings and the final department decision.
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { useState } from "react";
import { useLiveFeatures } from "@/components/liveFeatures";
import { Badge, Card, DemoNote, EmptyState, Mono, ProgressBar } from "@/components/ui";
import { DEPT_SHORT } from "@/domain/catalog";
import { fmtDate } from "@/domain/selectors";
import type { CiqCase, Finding, ReviewTrack, RmesCriterion } from "@/domain/types";
import { useStore } from "@/store/store";
import { CriterionRow, RecordedResult, SourceLink } from "./CriterionRow";
import { DecisionCard, FindingsCard } from "./RmesSide";
import { RESULT_LABEL, RESULT_TONE } from "./shared";

const PARTS: RmesCriterion["part"][] = ["A", "B", "C", "D"];

function OtherDept({ c, dept }: { c: CiqCase; dept: "SAF" | "REG" }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const list = c.rmes?.criteria.filter((x) => x.dept === dept) ?? [];
  const done = list.filter((x) => x.result).length;
  const track = c.reviews.find((r) => r.dept === dept);
  if (!list.length) return null;
  return (
    <Card>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span>
          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Lock size={13} className="text-ink-3" /> {DEPT_SHORT[dept]} criteria — read only
          </span>
          <span className="mt-0.5 block text-xs text-ink-3">
            {done} of {list.length} with a result{track?.decision ? ` · decision: ${track.decision === "approved" ? "Approved" : "Rejected"}` : ""} · visible to you, recorded only by {DEPT_SHORT[dept]}
          </span>
        </span>
        {open ? <ChevronDown size={16} className="text-ink-3" /> : <ChevronRight size={16} className="text-ink-3" />}
      </button>
      {open && (
        <div className="divide-y divide-line border-t border-line">
          {list.map((cr) => (
            <div key={cr.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[13.5px] text-ink">
                  <Mono className="mr-2 text-ink-3">{cr.id}</Mono>
                  {cr.title}
                </p>
                {cr.result ? (
                  <Badge tone={RESULT_TONE[cr.result]} dot>
                    {RESULT_LABEL[cr.result]}
                  </Badge>
                ) : (
                  <Badge tone="warn">No result</Badge>
                )}
              </div>
              <SourceLink c={c} cr={cr} />
              {cr.result && <RecordedResult state={state} cr={cr} />}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function RmesTab({ c, dept, track, canAct, onJump, onAddFinding, onAskFinding }: { c: CiqCase; dept: "SAF" | "REG"; track: ReviewTrack; canAct: boolean; onJump: (sectionId: string) => void; onAddFinding: (criterionId?: string) => void; onAskFinding: (f: Finding) => void }) {
  const { instantRmes } = useLiveFeatures();
  if (!c.rmes) {
    return (
      <Card>
        {/* live, the record is created on the department's own next load (FE-CLEANUP A14) */}
        <EmptyState title="No RMES record for this case">
          {instantRmes ? "The internal RMES record is created when Safety or Regulatory gets a review task on the case." : "The internal RMES record is created the next time a Safety or Regulatory reviewer with a review task on the case opens CIQ Digital."}
        </EmptyState>
      </Card>
    );
  }
  const mine = c.rmes.criteria.filter((x) => x.dept === dept);
  const done = mine.filter((x) => x.result).length;
  const other = dept === "SAF" ? "REG" : "SAF";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" data-testid="rmes-tab">
      <div className="min-w-0 space-y-5">
        <Card className="px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ink">RMES — {DEPT_SHORT[dept]} evaluation</p>
              <p className="mt-0.5 text-xs text-ink-3">
                Record created {fmtDate(c.rmes.createdAt)} for {c.id} · internal, never visible to the supplier
              </p>
            </div>
            <div className="w-full sm:w-56">
              <div className="mb-1 flex justify-between text-xs text-ink-2">
                <span>Criteria with a result</span>
                <span className="font-medium text-ink">
                  {done} of {mine.length}
                </span>
              </div>
              <ProgressBar value={done} max={mine.length} tone={done === mine.length ? "ok" : "brand"} />
            </div>
          </div>
          <div className="mt-2.5">
            <DemoNote>illustrative criteria until BDF shares its RMES template</DemoNote>
          </div>
        </Card>

        {PARTS.map((part) => {
          const list = mine.filter((x) => x.part === part);
          if (!list.length) return null;
          return (
            <section key={part}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Part {part}</h3>
                <span className="text-xs text-ink-3">
                  {list.filter((x) => x.result).length} of {list.length} recorded
                </span>
              </div>
              <Card className="divide-y divide-line">
                {list.map((cr) => (
                  <CriterionRow key={cr.id} c={c} cr={cr} canEdit={canAct} onJump={onJump} onAddFinding={onAddFinding} />
                ))}
              </Card>
            </section>
          );
        })}

        <OtherDept c={c} dept={other} />
      </div>

      <div className="space-y-5">
        <DecisionCard c={c} dept={dept} track={track} canAct={canAct} />
        <FindingsCard c={c} dept={dept} canAct={canAct} onAdd={() => onAddFinding()} onAsk={onAskFinding} />
      </div>
    </div>
  );
}
