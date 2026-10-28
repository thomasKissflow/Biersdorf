// RMES side column: the department's final decision (REQ-RMES-003/-013) and findings
// (an open finding blocks approval and completion; query from finding, close; REQ-RMES-009/-010).
import { Plus, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, Field, Modal, Mono, Segmented, Select, TextArea, TrafficLight } from "@/components/ui";
import { DecisionBadge } from "@/components/status";
import { DEPT_LABEL, DEPT_SHORT } from "@/domain/catalog";
import { fmtDateTime, userName } from "@/domain/selectors";
import type { CiqCase, Finding, ReviewTrack } from "@/domain/types";
import { useStore } from "@/store/store";
import { Notice, decisionEvent } from "./shared";

export function DecisionCard({ c, dept, track, canAct }: { c: CiqCase; dept: "SAF" | "REG"; track: ReviewTrack; canAct: boolean }) {
  const { state, rmesDecision } = useStore();
  const [editing, setEditing] = useState(false);
  const [dec, setDec] = useState<"approved" | "rejected">(track.decision ?? "approved");
  const [reason, setReason] = useState(track.decisionReason ?? "");
  const [tried, setTried] = useState(false);
  const pending = c.rmes?.criteria.filter((x) => x.dept === dept && !x.result) ?? [];
  const blocking = c.rmes?.findings.filter((f) => f.dept === dept && f.status === "open") ?? [];
  const ev = decisionEvent(c, dept);
  const open = canAct && (!track.decision || editing);
  const why: string[] = [];
  if (pending.length) why.push(`${pending.length} criteri${pending.length === 1 ? "on has" : "a have"} no result yet.`);
  if (dec === "approved" && blocking.length) why.push(`${blocking.length} finding${blocking.length === 1 ? " is" : "s are"} open: close ${blocking.length === 1 ? "it" : "them"} or reject.`);
  const reasonMissing = dec === "rejected" && !reason.trim();

  const record = () => {
    setTried(true);
    if (why.length || reasonMissing) return;
    rmesDecision(c.id, dept, dec, reason.trim());
    setEditing(false);
    setTried(false);
  };

  return (
    <Card data-testid="decision-card">
      <CardHeader title={`${DEPT_SHORT[dept]} decision`} subtitle={`Internal. Only ${DEPT_LABEL[dept]} records it; nobody decides for another department.`} />
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
            {why.length > 0 && (
              <Notice tone="warn" title="Not possible yet">
                <ul className="list-disc space-y-0.5 pl-4">
                  {why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant={dec === "rejected" ? "danger" : "primary"} onClick={record} disabled={why.length > 0} data-testid="decision-record">
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

function FindingItem({ c, f, canAct, onAsk }: { c: CiqCase; f: Finding; canAct: boolean; onAsk: (f: Finding) => void }) {
  const { closeFinding } = useStore();
  const cr = c.rmes?.criteria.find((x) => x.id === f.criterionId);
  const linked = f.openPointId ? c.openPoints.find((p) => p.id === f.openPointId) : undefined;
  const related = !linked && cr ? c.openPoints.find((p) => p.dept === f.dept && p.status !== "closed" && p.ref.sectionId === cr.source.sectionId && (!cr.source.fieldId || p.ref.fieldId === cr.source.fieldId)) : undefined;
  const op = linked ?? related;
  return (
    <div className="px-4 py-3" data-testid={`finding-${f.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Mono className="text-ink-3">{f.id}</Mono>
        <Badge tone={f.status === "open" ? "warn" : "ok"} dot>
          {f.status === "open" ? "Open" : "Closed"}
        </Badge>
      </div>
      <p className="mt-1.5 text-[13px] text-ink">{f.text}</p>
      <p className="mt-0.5 text-xs text-ink-3">{cr ? `On ${cr.id} · ${cr.title}` : "Recorded when an answer was closed as not accepted"}</p>
      {op && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <TrafficLight status={op.status} label={`${op.id} ${linked ? "sent to the supplier" : "on the same source"}`} />
        </div>
      )}
      {canAct && f.status === "open" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {cr && !linked && (
            <Button size="sm" variant="secondary" onClick={() => onAsk(f)} data-testid={`finding-ask-${f.id}`}>
              Ask supplier
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => closeFinding(c.id, f.id)} data-testid={`finding-close-${f.id}`}>
            Close finding
          </Button>
        </div>
      )}
    </div>
  );
}

export function FindingsCard({ c, dept, canAct, onAdd, onAsk }: { c: CiqCase; dept: "SAF" | "REG"; canAct: boolean; onAdd: () => void; onAsk: (f: Finding) => void }) {
  const all = c.rmes?.findings ?? [];
  const mine = all.filter((f) => f.dept === dept);
  const others = all.filter((f) => f.dept !== dept);
  return (
    <Card>
      <CardHeader
        title={`Findings${mine.length ? ` (${mine.length})` : ""}`}
        subtitle="Internal. An open finding prevents your approval and your completion."
        action={
          canAct ? (
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={onAdd} data-testid="add-finding">
              Add finding
            </Button>
          ) : undefined
        }
      />
      {mine.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">No findings from {DEPT_SHORT[dept]}. Add one when a criterion shows an issue.</p>
      ) : (
        <div className="divide-y divide-line">
          {mine.map((f) => (
            <FindingItem key={f.id} c={c} f={f} canAct={canAct} onAsk={onAsk} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="border-t border-line">
          <p className="px-4 pt-3 text-xs font-medium text-ink-3">{DEPT_SHORT[others[0].dept]} findings — read only</p>
          <div className="divide-y divide-line">
            {others.map((f) => (
              <FindingItem key={f.id} c={c} f={f} canAct={false} onAsk={onAsk} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function AddFindingModal({ c, dept, initialCriterion, onClose }: { c: CiqCase; dept: "SAF" | "REG"; initialCriterion?: string; onClose: () => void }) {
  const { addFinding } = useStore();
  const criteria = c.rmes?.criteria.filter((x) => x.dept === dept) ?? [];
  const [crit, setCrit] = useState(initialCriterion ?? criteria[0]?.id ?? "");
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  // false once the modal is closed: the late answer to a send made before must not close a modal opened since
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  const submit = () => {
    setTried(true);
    if (!crit || !text.trim() || sending) return;
    const r = addFinding(c.id, crit, text.trim(), true);
    // The prototype adds it at once; the live app resolves false when the finding did not reach Kissflow, and the
    // modal stays open with its text, to send again (APP-SAVING-GAPS gap 6).
    setSending(true);
    void Promise.resolve(r).then((ok) => {
      setSending(false);
      if (ok !== false && open.current) onClose();
    });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Add a finding"
      subtitle={`${c.id} · internal to ${DEPT_LABEL[dept]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={(tried && !text.trim()) || sending} data-testid="finding-save">
            {sending ? "Sending…" : "Add finding"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Criterion" required>
          <Select value={crit} onChange={(e) => setCrit(e.target.value)}>
            {criteria.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id} · {x.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Finding" required error={tried && !text.trim() ? "Describe the finding." : undefined}>
          <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="What is wrong or missing, with the value or evidence it refers to" invalid={tried && !text.trim()} data-testid="finding-text" />
        </Field>
        <p className="text-xs text-ink-3">An open finding must be closed before {DEPT_SHORT[dept]} can approve or complete the review.</p>
        <p className="text-xs text-ink-3">Findings are never shown to the supplier. To involve the supplier, use “Ask supplier” on the finding afterwards.</p>
      </div>
    </Modal>
  );
}
