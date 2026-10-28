// RMM-only case actions: cancel and reactivate. Each opens a small dialog that states the
// consequence before anything changes. RMM neither checks nor releases the scope: the supplier's metadata answers open
// the sections live, and only a department adds a section in Part 2 (review workspace).
import { useState } from "react";
import { Button, Field, Modal, TextArea, TextInput } from "@/components/ui";
import { DAY, PHASE_LABEL, REACTIVATION_DAYS, fmtDate, isOverdue, nowIso } from "@/domain/selectors";
import type { CiqCase, Phase } from "@/domain/types";
import { useStore } from "@/store/store";

export type CaseAction = "cancel" | "reactivate";

/** The last day a cancelled case can be reactivated (12 months after the cancellation). */
export function reactivationDeadline(c: CiqCase): string | undefined {
  return c.cancelled ? new Date(Date.parse(c.cancelled.at) + REACTIVATION_DAYS * DAY).toISOString() : undefined;
}

/** The phase a reactivation returns to. */
export const phaseBeforeCancel = (c: CiqCase): Phase => c.cancelled?.fromPhase ?? [...c.phaseHistory].reverse().find((p) => p.phase !== "cancelled")?.phase ?? "supplier-input";

export function CaseActionDialogs({ c, action, onClose }: { c: CiqCase; action: CaseAction | null; onClose: () => void }) {
  return (
    <>
      {action === "cancel" && <CancelDialog c={c} onClose={onClose} />}
      {action === "reactivate" && <ReactivateDialog c={c} onClose={onClose} />}
    </>
  );
}

const CANCEL_REASONS = ["Raw material no longer relevant", "Supplier declined to provide the CIQ", "Duplicate case", "Rejected by Safety or Regulatory"];

function CancelDialog({ c, onClose }: { c: CiqCase; onClose: () => void }) {
  const { cancelCase } = useStore();
  const [why, setWhy] = useState("");
  const [tried, setTried] = useState(false);
  const open = c.openPoints.filter((p) => p.status !== "closed").length;
  const tracks = c.reviews.filter((r) => r.status !== "completed").length;
  const submit = () => {
    setTried(true);
    if (!why.trim()) return;
    cancelCase(c.id, why.trim());
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${c.id}?`}
      subtitle={c.materialName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep case
          </Button>
          <Button variant="danger" onClick={submit} data-testid="case-cancel-confirm">
            Cancel case
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13.5px] text-ink-2">
          Cancelling ends every open task: the supplier's{tracks ? `, ${tracks} open review task${tracks > 1 ? "s" : ""}` : ""}
          {open ? ` and ${open} open point${open > 1 ? "s" : ""} (withdrawn)` : ""}. The supplier contacts get a short notice without your reason. The data and history are kept, and the case stays identifiable as cancelled.
        </p>
        <Field label="Justification" required error={tried && !why.trim() ? "A justification is required to cancel the case." : undefined}>
          <TextArea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why is this case cancelled?" invalid={tried && !why.trim()} data-testid="case-cancel-reason" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {CANCEL_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setWhy(r)} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink">
              {r}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-3">RMM can reactivate the case within 12 months.</p>
      </div>
    </Modal>
  );
}

function ReactivateDialog({ c, onClose }: { c: CiqCase; onClose: () => void }) {
  const { reactivateCase } = useStore();
  const back = phaseBeforeCancel(c);
  const deadline = reactivationDeadline(c);
  const pastDue = isOverdue(c.dueDate);
  const today = nowIso().slice(0, 10);
  const [due, setDue] = useState(pastDue ? new Date(Date.parse(nowIso()) + 30 * DAY).toISOString().slice(0, 10) : "");
  const [why, setWhy] = useState("");
  const [tried, setTried] = useState(false);
  const dueError = pastDue && !due ? "The case due date has passed: set a new one." : due && due < today ? "The new due date must be today or later." : undefined;
  const whyError = !why.trim() ? "A justification is required to reactivate the case." : undefined;
  const submit = () => {
    setTried(true);
    if (dueError || whyError) return;
    if (reactivateCase(c.id, why.trim(), due ? new Date(`${due}T17:00:00.000Z`).toISOString() : undefined)) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reactivate ${c.id}?`}
      subtitle={c.materialName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} data-testid="case-reactivate-confirm">
            Reactivate case
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13.5px] text-ink-2">
        <p>
          The case returns to <span className="font-medium text-ink">{PHASE_LABEL[back]}</span>. Earlier answers and documents are kept. Open points closed at the cancellation stay closed; reviewers raise new ones if still needed. The supplier contacts and the reviewers with an open task get an e-mail.
        </p>
        <Field label="Justification" required error={tried ? whyError : undefined}>
          <TextArea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why is this case active again?" invalid={tried && !!whyError} data-testid="case-reactivate-reason" />
        </Field>
        <Field label="New due date" required={pastDue} error={tried ? dueError : undefined} hint={pastDue ? `The old due date was ${fmtDate(c.dueDate)}.` : `Leave empty to keep ${fmtDate(c.dueDate)}.`}>
          <TextInput type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} invalid={tried && !!dueError} data-testid="case-reactivate-due" />
        </Field>
        <p className="text-[12.5px] text-ink-3">Can be reactivated until {fmtDate(deadline)}.</p>
      </div>
    </Modal>
  );
}

