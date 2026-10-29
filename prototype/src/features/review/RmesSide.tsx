// The Safety / Regulatory decision, Approved or Rejected (REQ-RMES-013; stored on CIQ Review RMES_Decision, Mandatory
// at the step). Since BDF's RMES scope of 28 Oct it is the review's decision, OUTSIDE the RMES sheet: the card sits in
// the Questionnaire tab's right column (id "decision-card": the completion bar scrolls to it). It needs the case's
// RMES record (created with the review task; live, on the reviewer's next load). No criteria or findings any more.
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLiveFeatures } from "@/components/liveFeatures";
import { Button, Card, CardHeader, Field, Segmented, TextArea } from "@/components/ui";
import { DecisionBadge } from "@/components/status";
import { DEPT_LABEL, DEPT_SHORT } from "@/domain/catalog";
import { fmtDateTime, userName } from "@/domain/selectors";
import type { CiqCase, ReviewTrack } from "@/domain/types";
import { useStore } from "@/store/store";
import { Notice, decisionEvent, rmesRecordPending } from "./shared";

export function DecisionCard({ c, dept, track, canAct }: { c: CiqCase; dept: "SAF" | "REG"; track: ReviewTrack; canAct: boolean }) {
  const { state, rmesDecision } = useStore();
  const { instantRmes } = useLiveFeatures();
  const [editing, setEditing] = useState(false);
  const [dec, setDec] = useState<"approved" | "rejected">(track.decision ?? "approved");
  const [reason, setReason] = useState(track.decisionReason ?? "");
  const [tried, setTried] = useState(false);
  const ev = decisionEvent(c, dept);
  // the domain and the live app refuse the decision until the case's RMES record exists
  const noRecord = !c.rmes;
  const open = canAct && (!track.decision || editing);
  const reasonMissing = dec === "rejected" && !reason.trim();

  const record = () => {
    setTried(true);
    if (noRecord || reasonMissing) return;
    rmesDecision(c.id, dept, dec, reason.trim());
    setEditing(false);
    setTried(false);
  };

  return (
    <Card id="decision-card" tabIndex={-1} className="scroll-mt-4 outline-none" data-testid="decision-card">
      <CardHeader title={`${DEPT_SHORT[dept]} decision`} subtitle={`Internal. Only ${DEPT_LABEL[dept]} records it; nobody decides for another department. It is not part of the RMES.`} />
      <div className="px-4 py-3">
        {track.decision && !editing && (
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className={track.decision === "approved" ? "text-ok" : "text-bad"} />
              <DecisionBadge decision={track.decision} />
            </div>
            {track.decisionReason && <p className="mt-2 text-[13px] text-ink">{track.decisionReason}</p>}
            {ev && (
              <p className="mt-1 text-xs text-ink-3">
                {userName(state, ev.by)} · {fmtDateTime(ev.at)}
              </p>
            )}
            {canAct && (
              <Button size="sm" variant="ghost" className="mt-2 -ml-2" data-testid="decision-change" onClick={() => {
                  setEditing(true);
                  setDec(track.decision!);
                  setReason(track.decisionReason ?? "");
                }}>
                Change decision
              </Button>
            )}
          </div>
        )}
        {!track.decision && !canAct && <p className="text-[13px] text-ink-3">No decision recorded.</p>}
        {open && (
          <div className="space-y-3">
            <div data-testid="decision-choice">
            <Segmented
              value={dec}
              onChange={(v) => {
                setDec(v);
                setTried(false);
              }}
              options={[
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ]}
            />
            </div>
            <Field label={dec === "rejected" ? "Reason for rejection" : "Comment"} required={dec === "rejected"} error={tried && reasonMissing ? "A rejection needs a reason." : undefined}>
              <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={dec === "rejected" ? "Why the material cannot be accepted from the specialist view" : "Optional"} invalid={tried && reasonMissing} className="min-h-[64px]" data-testid="decision-reason" />
            </Field>
            {noRecord && (
              <Notice tone="neutral" title="Not possible yet" testId="decision-no-record">
                The decision is recorded once the case's RMES record exists. {rmesRecordPending(instantRmes)}
              </Notice>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant={dec === "rejected" ? "danger" : "primary"} onClick={record} disabled={noRecord} data-testid="decision-record">
                Record {dec === "approved" ? "approval" : "rejection"}
              </Button>
              {editing && (
                <Button size="sm" variant="ghost" onClick={() => {
                    setEditing(false);
                    setTried(false);
                  }}>
                  Cancel
                </Button>
              )}
            </div>
            <p className="text-xs text-ink-3">
              {dec === "rejected"
                ? "Rejected flags the case for RMM, who agrees with you whether to cancel the case or continue to the final release. The supplier never sees the decision."
                : "The supplier never sees the decision. Completing your review is a separate step and is not a raw-material approval."}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
