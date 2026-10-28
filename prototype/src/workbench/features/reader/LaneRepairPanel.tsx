// The allow-listed Case Admin "Repair lane" (§7.10, §8.15; WB-D4 [provisional]). Renders NOTHING for anyone who is
// not Case Admin (S39: an RMM sees no Repair button). For a Case Admin it lists the active lanes that read incomplete,
// the newest `lane.completed` snapshot next to the current values, and — only when every §7.10 condition holds — a
// reason box and the Repair button. The write is T0's repairLane (F8 `lane.repaired` first; allow-listed fields only).
// Offered for T1's case detail ("Departments & lanes" tab, S5/S8 panel): <LaneRepairPanel c={…} events={…} />.
import { Wrench } from "lucide-react";
import { useState } from "react";
import { Field, TextArea } from "@/components/ui/form";
import { Button, Card, CardHeader, Mono } from "@/components/ui/primitives";
import { fieldLabel, type Dept } from "../../schema";
import { repairBlocker, repairLane } from "../../data/adminRepair";
import { useWorkbenchContext } from "../../data/hooks";
import { displayValue } from "../../data/normalize";
import type { AuditVM, CaseVM, SaveResult } from "../../data/viewModels";
import { DEPT_LABEL } from "../../domain/labels";
import { WriteOutcome } from "../../ui/WriteOutcome";
import { fmtDateTime } from "../audit/format";
import { repairCandidates, type RepairCandidate } from "./laneRepair";

function LaneRepair({ c, cand, onDone }: { c: CaseVM; cand: RepairCandidate; onDone?: () => void }) {
  const { rt } = useWorkbenchContext();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const d: Dept = cand.dept;
  const blocker = repairBlocker(rt, c, d, cand.snapshot);
  return (
    <div className="space-y-3 border-t border-line px-4 py-3 first:border-t-0" data-testid={`wb-lane-repair-panel-${d}`}>
      <p className="text-[13.5px] font-medium text-ink">
        {DEPT_LABEL[d]} lane reads incomplete
        {cand.snapshot && <span className="font-normal text-ink-3"> · snapshot {fmtDateTime(cand.snapshot.at)} by {cand.snapshot.actorName || cand.snapshot.actorEmail || "unknown"}</span>}
      </p>
      {cand.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="text-ink-3">
                <th className="py-1 pr-3 font-medium">Field</th>
                <th className="py-1 pr-3 font-medium">Now on the case</th>
                <th className="py-1 font-medium">In the lane snapshot</th>
              </tr>
            </thead>
            <tbody>
              {cand.rows.map((r) => (
                <tr key={r.field} className="border-t border-line">
                  <td className="py-1 pr-3 text-ink">{fieldLabel("CIQ_Case_A00", r.field)}</td>
                  <td className="py-1 pr-3">
                    <Mono className="text-ink-2">{displayValue(r.current) || "(blank)"}</Mono>
                  </td>
                  <td className="py-1">
                    <Mono>{displayValue(r.snapshot)}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {blocker ? (
        <p className="text-[13px] text-ink-2" data-testid={`wb-lane-repair-blocked-${d}`}>
          Repair not available: {blocker}
        </p>
      ) : result?.ok ? null : (
        <>
          <Field label="Reason for the repair" required hint="Recorded in the audit log before anything is written. Only this lane's sign-off fields are restored; counts are never written here.">
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} data-testid={`wb-lane-repair-reason-${d}`} />
          </Field>
          <Button
            variant="primary"
            icon={<Wrench size={14} />}
            disabled={!reason.trim() || busy}
            data-testid={`wb-lane-repair-${d}`}
            onClick={async () => {
              if (!cand.snapshot) return;
              setBusy(true);
              try {
                const r = await repairLane(c, d, cand.snapshot, reason.trim());
                setResult(r);
                if (r.ok) onDone?.();
              } catch (e) {
                setResult({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Repairing…" : "Repair lane"}
          </Button>
        </>
      )}
      <WriteOutcome result={result} flow="CIQ_Case_A00" itemId={c._id} okMessage={`${DEPT_LABEL[d]} lane restored from the snapshot and checked.`} />
    </div>
  );
}

export function LaneRepairPanel({ c, events, onDone }: { c: CaseVM; events: AuditVM[]; onDone?: () => void }) {
  const { caps } = useWorkbenchContext();
  if (!caps.isCaseAdmin) return null;
  const cands = repairCandidates(c, events);
  if (!cands.length) return null;
  return (
    <Card data-testid="wb-lane-repair">
      <CardHeader title="Repair lane (Case Admin)" subtitle="Restores a lost lane sign-off from its audit snapshot. An exception for Case Admins only; it is recorded in the audit log." />
      {cands.map((cand) => (
        <LaneRepair key={cand.dept} c={c} cand={cand} onDone={onDone} />
      ))}
    </Card>
  );
}
