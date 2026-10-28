// Lane recovery (§7.10, §8.5 S5): the Case Admin "Repair lane" dialog (UI over T0's allow-listed repairLane) and the
// input of "Raise department review for D" (T2's createPoint: a Department review point, internal; createPoint sets
// Responsible_User = me).
import { Wrench } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { Field, TextArea } from "@/components/ui/form";
import { fieldLabel, type Dept } from "../../../schema";
import { repairLane, repairValues } from "../../../data/adminRepair";
import { addDays, displayValue } from "../../../data/normalize";
import type { AuditVM, CaseVM, SaveResult } from "../../../data/viewModels";
import { DEPT_LABEL } from "../../../domain/labels";
import { Modal } from "../../../ui/overlay";
import { WriteOutcome } from "../../../ui/WriteOutcome";
import type { RaiseInput } from "../../points/createPoint";
import { ActionBanner, fmtDateTime } from "../shared";

export function LaneRepairDialog({ open, onClose, c, dept, snapshot }: { open: boolean; onClose(): void; c: CaseVM; dept: Dept; snapshot: AuditVM }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SaveResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const values = repairValues(dept, snapshot);
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Restore the ${DEPT_LABEL[dept]} sign-off`}
      subtitle={`From the completion recorded on ${fmtDateTime(snapshot.at)} (${snapshot.actorName || "unknown"}). Writes only the ${DEPT_LABEL[dept]} review values, as process admin.`}
      footer={
        <>
          <Button onClick={onClose}>{res?.ok ? "Close" : "Back"}</Button>
          {!res?.ok && (
            <Button
              variant="primary"
              icon={<Wrench size={14} />}
              disabled={busy || !reason.trim() || !Object.keys(values).length}
              data-testid="wb-confirm"
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  setRes(await repairLane(c, dept, snapshot, reason.trim()));
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Record and repair
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-[13.5px]">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th className="py-1.5 pr-3 font-medium">Field</th>
              <th className="py-1.5 pr-3 font-medium">Now</th>
              <th className="py-1.5 font-medium">Recorded (will be written)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(values).map(([k, v]) => (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3">{fieldLabel("CIQ_Case_A00", k)}</td>
                <td className="py-1.5 pr-3 text-ink-2">{displayValue(c.v[k]) || "empty"}</td>
                <td className="py-1.5 font-medium">{displayValue(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!Object.keys(values).length && <p className="text-bad">The recorded completion holds no value that can be restored.</p>}
        <Field label="Reason" required hint="Recorded in the audit log before anything is written.">
          <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} data-testid="wb-confirm-reason" />
        </Field>
        {err && <ActionBanner result={{ ok: false, message: err }} />}
        <WriteOutcome result={res} flow="CIQ_Case_A00" itemId={c._id} okMessage={`${DEPT_LABEL[dept]} sign-off restored and checked.`} />
        {res?.ok && <ActionBanner result={{ ok: true, message: `${DEPT_LABEL[dept]} sign-off restored from the recorded completion and read back.` }} />}
      </div>
    </Modal>
  );
}

export function deptReviewInput(c: CaseVM, d: Dept, me: { Name: string }, now: Date, question: string, dueDate: string): RaiseInput {
  return {
    opKind: "Department review",
    opDept: d,
    raisedByDept: "RMM",
    toSupplier: false,
    refKind: "Lane",
    refLabel: `${DEPT_LABEL[d]} review completion`,
    kindLabel: "Department review",
    questionText: question,
    internalJustification: `Recovery at the open-items check: the ${DEPT_LABEL[d]} review of ${c.caseCode} reads incomplete.`,
    internalDueDate: dueDate || addDays(now, 3),
    responsibleName: me.Name,
    responsibleDeptLabel: "RMM",
  };
}
