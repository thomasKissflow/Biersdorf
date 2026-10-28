// The step panel for MY task on this case (§8.4 Overview, §8.5). Actions need the held task (ground rule 13): this
// component is only rendered for a TaskVM from useTasks(). Lane steps go to T2's lane workspace (B_RMM included),
// S6 to T3's approval screen, and an unidentified step can only be opened in Kissflow.
import { ArrowRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardHeader } from "@/components/ui/primitives";
import { useWorkbench, type CaseBundle } from "../../../data/hooks";
import type { TaskVM } from "../../../data/viewModels";
import { DEPT_LABEL } from "../../../domain/labels";
import { deptOfLaneStep } from "../../../schema";
import { HoldPanel } from "./HoldPanel";
import { S1Panel, S3Panel, S7Panel } from "./ManualPanels";
import { ScopePanel } from "./ScopePanel";

/** Case steps whose panel lives on the case detail. */
export const CASE_PANEL_STEPS = ["CASE_S1", "CASE_S2", "CASE_S3", "CASE_S5", "CASE_S7", "CASE_S8"] as const;

export function StepPanel({ task, b, onChanged }: { task: TaskVM; b: CaseBundle; onChanged(): void }) {
  const c = b.case;
  switch (task.step) {
    case "CASE_S1":
      return <S1Panel task={task} c={c} onChanged={onChanged} />;
    case "CASE_S2":
      return <ScopePanel task={task} b={b} onChanged={onChanged} />;
    case "CASE_S3":
      return <S3Panel task={task} c={c} onChanged={onChanged} />;
    case "CASE_S5":
    case "CASE_S8":
      return <HoldPanel task={{ ...task, step: task.step }} b={b} onChanged={onChanged} />;
    case "CASE_S7":
      return <S7Panel task={task} c={c} onChanged={onChanged} />;
    case "CASE_S6":
      return (
        <LinkCard title="Overall approval" body="Your approval task for this case is on the approval screen." to={`/approvals/${c._id}/${encodeURIComponent(task.activityInstanceId)}`} label="Open the approval" />
      );
    default:
      break;
  }
  const d = task.step ? deptOfLaneStep(task.step) : null;
  if (d)
    return (
      <LinkCard
        title={`Department review – ${DEPT_LABEL[d]}`}
        body={d === "RMM" ? "Your RMM review of this case is done in the department review workspace." : "Your review of this case is done in the department review workspace."}
        to={`/review/lane/${c._id}/${encodeURIComponent(task.activityInstanceId)}`}
        label="Open the department review"
        testId={`wb-case-lane-task-${d}`}
      />
    );
  return <UnresolvedTask task={task} />;
}

function LinkCard({ title, body, to, label, testId }: { title: string; body: string; to: string; label: string; testId?: string }) {
  const nav = useNavigate();
  return (
    <Card data-testid={testId}>
      <CardHeader title={title} subtitle={body} />
      <div className="p-4">
        <Button variant="primary" iconRight={<ArrowRight size={15} />} onClick={() => nav(to)}>
          {label}
        </Button>
      </div>
    </Card>
  );
}

function UnresolvedTask({ task }: { task: TaskVM }) {
  const { actions } = useWorkbench();
  const [note, setNote] = useState<string | null>(null);
  return (
    <Card data-testid="wb-case-task-unresolved">
      <CardHeader title="Task at an unidentified step: open in Kissflow" subtitle="The Workbench could not tell which step this task is at, so it offers no action on it." />
      <div className="space-y-2 p-4">
        <Button
          icon={<ExternalLink size={15} />}
          data-testid="wb-kwb-openform"
          onClick={async () => {
            const r = await actions.openTaskForm(task);
            setNote(r === "opened" ? null : "Kissflow did not open the form; open this task from My Tasks.");
          }}
        >
          Open task form
        </Button>
        {note && (
          <p className="text-[13px] text-ink-2" data-testid="wb-kwb-openform-note">
            {note}
          </p>
        )}
      </div>
    </Card>
  );
}
