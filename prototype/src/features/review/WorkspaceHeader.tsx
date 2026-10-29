// Case header of the review workspace: material, case, supplier, phase, the completeness confirmation, my review
// track (with "Reassign" to another member of the department) and every other review's track. On a phone the back
// link is the phone header's arrow, the other reviews are compact chips and the buttons are 44 px targets.
import { ArrowLeft, ExternalLink, UserRoundCog } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Field, Mono, Select, TextArea } from "@/components/ui";
import { DecisionBadge, PhaseBadge, TrackBadge } from "@/components/status";
import { DEPT_LABEL, DEPT_SHORT } from "@/domain/catalog";
import { can } from "@/domain/permissions";
import { fmtDate, isClosed, supplierName, trackView, userName } from "@/domain/selectors";
import type { AppState, CiqCase, ReviewDept, ReviewTrack } from "@/domain/types";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";
import { reassignCandidates } from "./lib";
import { FormWindow } from "./phone";
import { DeptTrackChip, DeptTrackText, OriginFlag, completenessOf, isRmesDept, isRmmLane } from "./shared";

function ReassignModal({ c, dept, track, onClose }: { c: CiqCase; dept: ReviewDept; track: ReviewTrack; onClose: () => void }) {
  const { state, reassignReview } = useStore();
  const people = reassignCandidates(state, c, dept);
  const [to, setTo] = useState(people[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const submit = () => {
    setTried(true);
    if (!to || !reason.trim()) return;
    if (reassignReview(c.id, dept, to, reason.trim())) onClose();
  };
  const lane = isRmmLane(dept) ? "the RMM review" : `the ${DEPT_SHORT[dept]} review`;
  return (
    <FormWindow
      open
      onClose={onClose}
      title="Reassign this review"
      subtitle={`${c.id} · ${c.materialName} · now with ${userName(state, track.assigneeId)}`}
      footer={
        people.length ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={tried && !reason.trim()} data-testid="reassign-confirm">
              Reassign
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {people.length === 0 ? (
        <p className="text-[13.5px] text-ink-2" data-testid="reassign-nobody">
          Nobody else in {DEPT_LABEL[dept]} can take over {lane}. A review is handed only to another member of the same department.
        </p>
      ) : (
        <div className="space-y-4">
          <Field label="Hand over to" required>
            <div data-testid="reassign-to">
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.title}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Reason" required hint="Recorded in the case history. The new reviewer gets an e-mail with it." error={tried && !reason.trim() ? "Say why the review changes hands." : undefined}>
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. absent until the end of the month" invalid={tried && !reason.trim()} data-testid="reassign-reason" />
          </Field>
          <p className="text-xs text-ink-3">Open points you raised stay with you. Points the system raised for this review move to the new reviewer.</p>
        </div>
      )}
    </FormWindow>
  );
}

const releasedAt = (c: CiqCase) => c.confirmations.find((x) => x.type === "final-release")?.at;

export function WorkspaceHeader({ c, state, dept, track }: { c: CiqCase; state: AppState; dept: ReviewDept; track: ReviewTrack }) {
  const nav = useNavigate();
  const { me } = useStore();
  const phone = useIsPhone();
  const [reassign, setReassign] = useState(false);
  const conf = completenessOf(c);
  const others = c.reviews.filter((r) => r.dept !== dept);
  const mayReassign = !isClosed(c) && track.status !== "completed" && can(state, me.id, "review.reassign", c, { dept });
  return (
    <div className="mb-5" data-testid="workspace-header">
      {!phone && (
        <Link to="/review" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          <ArrowLeft size={14} /> My reviews
        </Link>
      )}
      <div className={phone ? "flex flex-col gap-4" : "mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-x-6"}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
            <Mono className="text-ink-2">{c.id}</Mono>
            <span aria-hidden>·</span>
            <span>{c.inci}</span>
            <span aria-hidden>·</span>
            <span>{supplierName(state, c.supplierId)}</span>
            <span aria-hidden>·</span>
            <span>
              BDF material no. <Mono>{c.materialNo}</Mono>
            </span>
          </div>
          <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight text-ink">{c.materialName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PhaseBadge phase={c.phase} />
            {isRmmLane(dept) && <OriginFlag c={c} />}
            {c.priority === "high" && <Badge tone="warn">High priority</Badge>}
          </div>
          {conf && (
            <p className="mt-1.5 text-[12.5px] text-ink-2" data-testid="workspace-completeness">
              Completeness confirmed {fmtDate(conf.at)} by {conf.name}
              {c.phase === "completed" ? ` · frozen with the final release${releasedAt(c) ? ` on ${fmtDate(releasedAt(c))}` : ""}` : c.phase === "cancelled" ? " · the case is cancelled" : c.phase === "final-release" ? " · locked for the supplier while the final release is requested" : " · answers stay editable until the final release is requested"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-ink-3">{isRmmLane(dept) ? "My RMM review" : `My ${DEPT_SHORT[dept]} review`}</span>
            <TrackBadge status={trackView(c, track)} />
            {isRmesDept(dept) && <DecisionBadge decision={track.decision} />}
          </div>
          <span className="text-xs text-ink-3" data-testid="workspace-assignee">
            Assigned to {track.assigneeId === me.id ? "you" : userName(state, track.assigneeId)} · case due {fmtDate(c.dueDate)}
          </span>
          <div className="flex flex-wrap gap-2">
            {mayReassign && (
              <Button size="sm" variant="ghost" icon={<UserRoundCog size={14} />} onClick={() => setReassign(true)} className={phone ? "min-h-11" : undefined} data-testid="reassign-review">
                Reassign
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<ExternalLink size={14} />} onClick={() => nav(`/cases/${c.id}`)} className={phone ? "min-h-11" : undefined} data-testid="open-case-overview">
              Case overview
            </Button>
          </div>
        </div>
      </div>
      {others.length > 0 && phone && (
        // a short line of text each, where the chips would take a row each
        <div className="mt-4" data-testid="workspace-other-reviews">
          <p className="text-xs font-medium text-ink-3">Other reviews</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {others.map((r) => (
              <DeptTrackText key={r.dept} c={c} track={r} />
            ))}
          </p>
        </div>
      )}
      {others.length > 0 && !phone && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-ink-3">Other reviews</span>
          {others.map((r) => (
            <DeptTrackChip key={r.dept} c={c} track={r} />
          ))}
        </div>
      )}
      {reassign && <ReassignModal c={c} dept={dept} track={track} onClose={() => setReassign(false)} />}
    </div>
  );
}
