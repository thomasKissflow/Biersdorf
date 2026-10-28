// CASE_S5 "Open items check – before release request" and CASE_S8 "… – before close" (§8.5). Same mechanics, each
// with its OWN field set (exactly editableAt(step)): Refresh counts (§7.9), the override (its F8 row is written first,
// then the reason with the other values), Hold_Note, and the server gate (Open_Items_Gate_Release / _Close). S5 adds
// the lane check with the Department-review alternative (brd L930); a Case Admin on rung 1 may Repair lane (§7.10).
import { CheckCircle2, ClipboardCheck, ExternalLink, FilePlus2, Wrench } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button } from "@/components/ui/primitives";
import { Field, TextArea } from "@/components/ui/form";
import { type Dept } from "../../../schema";
import { repairBlocker } from "../../../data/adminRepair";
import { useWorkbench, useWorkbenchContext, type CaseBundle } from "../../../data/hooks";
import type { ActionResult, TaskVM } from "../../../data/viewModels";
import { DEPT_LABEL } from "../../../domain/labels";
import { createPoint } from "../../points/createPoint";
import { ReadQualityBanner } from "../../../ui/ReadQualityBanner";
import { FieldRow } from "../../../ui/FieldInput";
import { StepForm, stepFormModel } from "../../../ui/StepForm";
import { ActionBanner } from "../shared";
import { HOLD, appendLateCompletion, laneCheck, laneCheckExtra, lateCompletionLine, newestLaneSnapshot, openDeptReviews, runHoldSave, type HoldStep, type OverrideRun } from "../stepLogic";
import { CountsBlock } from "./CountsBlock";
import { deptReviewInput, LaneRepairDialog } from "./LaneDialogs";
import { PanelButtons, PanelCard, PanelOutcome, SubBlock, useBusy, usePanelValues, type PanelResult } from "./PanelKit";

const errorResult = (e: unknown): PanelResult => ({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });

export function HoldPanel({ task, b, onChanged }: { task: TaskVM & { step: HoldStep }; b: CaseBundle; onChanged(): void }) {
  const c = b.case;
  const { actions, me, notify } = useWorkbench();
  const step = task.step;
  const h = HOLD[step];
  const pv = usePanelValues(c);
  const [result, setResult] = useState<PanelResult>(null);
  const [ov, setOv] = useState<OverrideRun | null>(null);
  /** The override text already recorded in F8 by this panel (a retried save does not record it again). */
  const recordedOverride = useRef<string | undefined>(undefined);
  const { busy, run } = useBusy();
  const own = ["Open_Items_Count", "Open_CR_Count", h.override];
  const extra = step === "CASE_S5" ? [laneCheckExtra(b.points, c._id)] : [];
  const overrideText = String(pv.values[h.override] ?? "");
  /** Writes the override (F8 first) and every other changed value. True when there is nothing left unsaved. */
  const saveAll = async (quietWhenNothing: boolean): Promise<boolean> => {
    if (!pv.dirty.length) {
      if (!quietWhenNothing) notify("Nothing changed since the last save.", "info");
      return true;
    }
    const r = await runHoldSave(actions, task, c, { override: pv.isDirty(h.override) ? overrideText : undefined, others: pv.changed(own), alreadyRecorded: recordedOverride.current });
    if (r.recorded) recordedOverride.current = r.recorded;
    setOv(r.stage === "problems" || (r.ok && !pv.isDirty(h.override)) ? null : r);
    if (r.save) setResult(r.save);
    if (r.ok) pv.clean();
    return r.ok || r.stage === "problems";
  };
  const save = () =>
    run(async () => {
      try {
        await saveAll(false);
      } catch (e) {
        setResult(errorResult(e));
      }
    });
  const submit = () =>
    run(async () => {
      try {
        if (!(await saveAll(true))) return;
        setResult(await actions.submitStep(task, { extraChecks: extra }));
      } catch (e) {
        setResult(errorResult(e));
      }
    });
  return (
    <PanelCard step={step} title={task.stepName ?? (step === "CASE_S5" ? "Open items check – before release request" : "Open items check – before close")} subtitle="Resolve the open points and change requests, or continue with a reason. Whether the case may go on is decided by Kissflow.">
      <CountsBlock task={task} c={c} onResult={setResult} />
      <SubBlock title="Continue with open items" hint="Lets the case go on with items still open. When you save, the reason is recorded in the audit log first." testId="wb-override">
        <Field label="Reason to continue with open items">
          <TextArea value={overrideText} onChange={(e) => pv.set(h.override, e.target.value)} rows={2} aria-label="Reason to continue with open items" />
        </Field>
        {ov && <ActionBanner result={{ ok: ov.ok, message: ov.message }} testId="wb-override-result" />}
      </SubBlock>
      {step === "CASE_S5" && <LaneCheckBlock task={task} b={b} onChanged={onChanged} onResult={setResult} />}
      {step === "CASE_S8" && <RepairOnlyBlock b={b} />}
      <SubBlock title="Hold note" hint="Required at this step.">
        <StepForm step={step} values={pv.values} onChange={pv.set} held only={[HOLD_NOTE]} me={me} />
        <OtherCaseDetails step={step} values={pv.values} onChange={pv.set} exclude={[...own, HOLD_NOTE]} />
      </SubBlock>
      <PanelOutcome
        task={task}
        c={c}
        result={result}
        onResolved={() => {
          pv.clean();
          onChanged();
        }}
      />
      <PanelButtons busy={busy} onSave={save} onSubmit={submit} />
    </PanelCard>
  );
}

const HOLD_NOTE = "Hold_Note";
/** Fields the hold panels never offer as free inputs (UX-06): the raw contacts (shown read-only on the case's
 *  Overview), and Late completions (written only by "Record late completion"). */
export const HOLD_HIDDEN = ["Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Late_Completions_Text"];

/** The optional case values of the step, collapsed: most open-items checks need only the hold note. */
function OtherCaseDetails({ step, values, onChange, exclude }: { step: HoldStep; values: Record<string, unknown>; onChange(k: string, v: unknown): void; exclude: string[] }) {
  const { me } = useWorkbench();
  const inputs = stepFormModel(step, values, { exclude: [...exclude, ...HOLD_HIDDEN] }).inputs;
  if (!inputs.length) return null;
  return (
    <details className="rounded-lg border border-line px-3 py-2" data-testid="wb-hold-other-details">
      <summary className="cursor-pointer text-[13px] font-medium text-ink-2">Edit other case details (optional)</summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {inputs.map((i) => (
          <FieldRow key={i.field} flow="CIQ_Case_A00" field={i.field} value={values[i.field]} onChange={(v) => onChange(i.field, v)} required={i.required} me={me} />
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- S5 lane check + recovery

function LaneCheckBlock({ task, b, onChanged, onResult }: { task: TaskVM; b: CaseBundle; onChanged(): void; onResult(r: PanelResult): void }) {
  const c = b.case;
  const { actions, notify, me } = useWorkbench();
  const { rt } = useWorkbenchContext();
  const rows = laneCheck(c.v, b.points, c._id).filter((r) => r.active);
  const [repair, setRepair] = useState<Dept | null>(null);
  const [busyD, setBusyD] = useState<Dept | null>(null);
  const [raised, setRaised] = useState<Partial<Record<Dept, ActionResult>>>({});
  const recordLate = async (d: Dept) => {
    const r = rows.find((x) => x.dept === d);
    if (!r?.point) return;
    setBusyD(d);
    try {
      const text = appendLateCompletion(String(c.v.Late_Completions_Text ?? ""), lateCompletionLine(d, r.point), r.point.opKey);
      const s = await actions.saveAtStep(task, { fields: { Late_Completions_Text: text } });
      onResult(s);
      if (s.ok) notify(`Late completion for ${DEPT_LABEL[d]} recorded.`, "success");
    } catch (e) {
      onResult(errorResult(e));
    } finally {
      setBusyD(null);
    }
  };
  const raise = async (d: Dept) => {
    setBusyD(d);
    try {
      const question = `Please confirm the ${DEPT_LABEL[d]} review of ${c.caseCode} (${c.tradeName}). Its sign-off was not found after the department review; accepting this point records the review as completed late.`;
      await createPoint(deptReviewInput(c, d, me, new Date(), question, ""), c);
      setRaised((x) => ({ ...x, [d]: { ok: true, message: `Department review raised for ${DEPT_LABEL[d]}. Once it is accepted, record the late completion here.` } }));
      onChanged();
    } catch (e) {
      setRaised((x) => ({ ...x, [d]: { ok: false, message: `The department review was not raised: ${e instanceof Error ? e.message : String(e)}` } }));
    } finally {
      setBusyD(null);
    }
  };
  return (
    <SubBlock title="Department reviews" hint="Every active department review must be confirmed with a completion time, or completed late through an accepted Department review point recorded as a late completion." testId="wb-s5-lanes">
      <ReadQualityBanner quality={b.quality.points} what="Open points" scope="open points" counts />
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.map((r) => {
          const snap = newestLaneSnapshot(b.events, c, r.dept);
          const canRepair = !r.pass && !!snap && repairBlocker(rt, c, r.dept, snap) === null;
          const open = openDeptReviews(b.points, c._id, r.dept);
          return (
            <li key={r.dept} className="space-y-2 px-3 py-2.5 text-[13px]" data-testid={`wb-s5-lane-${r.dept}`} data-pass={r.pass ? "1" : "0"}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-28 font-medium text-ink">{DEPT_LABEL[r.dept]}</span>
                {r.pass ? (
                  <Badge tone="ok" dot>
                    {r.via === "late-completion" ? `late completion ${r.point?.opKey ?? ""}` : "confirmed"}
                  </Badge>
                ) : (
                  <Badge tone="warn" dot>
                    incomplete
                  </Badge>
                )}
                {!r.pass && <span className="min-w-0 flex-1 text-ink-2">{r.reason}</span>}
                {!r.pass && r.point && (
                  <Button size="sm" icon={<ClipboardCheck size={13} />} disabled={!!busyD} onClick={() => recordLate(r.dept)} data-testid={`wb-s5-late-completion-${r.dept}`}>
                    Record late completion
                  </Button>
                )}
                {!r.pass && !r.point && open.length > 0 && (
                  <Link to={`/points/${open[0]._id}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                    Department review {open[0].opKey || open[0]._id} is open <ExternalLink size={12} />
                  </Link>
                )}
                {!r.pass && !r.point && open.length === 0 && !raised[r.dept]?.ok && (
                  <Button size="sm" icon={<FilePlus2 size={13} />} disabled={!!busyD} onClick={() => raise(r.dept)} data-testid={`wb-s5-raise-deptreview-${r.dept}`}>
                    {busyD === r.dept ? "Raising…" : `Raise department review for ${DEPT_LABEL[r.dept]}`}
                  </Button>
                )}
                {canRepair && (
                  <Button size="sm" variant="subtle" icon={<Wrench size={13} />} onClick={() => setRepair(r.dept)} data-testid={`wb-lane-repair-${r.dept}`}>
                    Repair department review
                  </Button>
                )}
                {r.pass && <CheckCircle2 size={14} className="text-ok" aria-hidden />}
              </div>
              {raised[r.dept] && <ActionBanner result={raised[r.dept]} testId={`wb-s5-raise-result-${r.dept}`} />}
            </li>
          );
        })}
        {!rows.length && <li className="px-3 py-2.5 text-[13px] text-ink-3">No department review is active on this case.</li>}
      </ul>
      {repair && <LaneRepairDialog open onClose={() => setRepair(null)} c={c} dept={repair} snapshot={newestLaneSnapshot(b.events, c, repair)!} />}
    </SubBlock>
  );
}

/** S8: lanes are not checked here, but a Case Admin may still repair a lost lane value (§7.10 "on the S5/S8 panel"). */
function RepairOnlyBlock({ b }: { b: CaseBundle }) {
  const c = b.case;
  const { rt } = useWorkbenchContext();
  const [repair, setRepair] = useState<Dept | null>(null);
  const lanes = laneCheck(c.v, b.points, c._id).filter((r) => r.active && !r.pass);
  const offer = lanes.map((r) => ({ d: r.dept, snap: newestLaneSnapshot(b.events, c, r.dept) })).filter((x) => x.snap && repairBlocker(rt, c, x.d, x.snap) === null);
  if (!offer.length) return null;
  return (
    <SubBlock title="Repair a department review (Case Admin)" hint="These department reviews read incomplete although their completion was recorded.">
      <div className="flex flex-wrap gap-2">
        {offer.map((x) => (
          <Button key={x.d} size="sm" variant="subtle" icon={<Wrench size={13} />} onClick={() => setRepair(x.d)} data-testid={`wb-lane-repair-${x.d}`}>
            Repair {DEPT_LABEL[x.d]} review
          </Button>
        ))}
      </div>
      {repair && <LaneRepairDialog open onClose={() => setRepair(null)} c={c} dept={repair} snapshot={newestLaneSnapshot(b.events, c, repair)!} />}
    </SubBlock>
  );
}
