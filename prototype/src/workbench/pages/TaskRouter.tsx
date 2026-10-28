// #/tasks/:flow/:instanceId/:act → the workspace for the task's RESOLVED step (§12.2 table). An unresolved task can
// only be opened in Kissflow (Open task form, bounded, button-only).
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Button, Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/data";
import { isFlowId, stepDef } from "../schema";
import { useActions, useTasks } from "../data/hooks";
import type { TaskVM } from "../data/viewModels";

/** The Workbench path for a held task, or null when its step is unidentified. */
export function taskPath(t: Pick<TaskVM, "flow" | "instanceId" | "activityInstanceId" | "step">): string | null {
  const s = t.step;
  if (!s) return null;
  const act = encodeURIComponent(t.activityInstanceId);
  if (t.flow === "CIQ_Case_A00") {
    if (s.startsWith("CASE_B_")) return `/review/lane/${t.instanceId}/${act}`;
    if (s === "CASE_S6") return `/approvals/${t.instanceId}/${act}`;
    return `/cases/${t.instanceId}?task=${act}`;
  }
  if (t.flow === "CIQ_Open_Point_A00") return `/points/${t.instanceId}?task=${act}`;
  if (t.flow === "CIQ_Change_Request_A00") return s === "CHRQ_S1" ? `/change-requests/${t.instanceId}?task=${act}` : `/assess/${t.instanceId}/${act}`;
  return null;
}
/** The router path for any task (resolved or not). */
export const taskRouterPath = (t: Pick<TaskVM, "flow" | "instanceId" | "activityInstanceId">): string => `/tasks/${t.flow}/${t.instanceId}/${encodeURIComponent(t.activityInstanceId)}`;

export function TaskRouter() {
  const { flow, instanceId, act } = useParams();
  const tasks = useTasks();
  const actions = useActions();
  const [note, setNote] = useState<string | null>(null);
  if (tasks.loading && !tasks.data) return <p className="p-6 text-ink-3">Loading your tasks…</p>;
  const t = isFlowId(flow) ? (tasks.data ?? []).find((x) => x.flow === flow && x.instanceId === instanceId && x.activityInstanceId === act) : undefined;
  if (!t)
    return (
      <div className="p-6" data-testid="wb-taskrouter-missing">
        <Card>
          <EmptyState title="This task is not in your queue">It may have been completed, or it belongs to someone else. Reload your tasks.</EmptyState>
        </Card>
      </div>
    );
  const to = taskPath(t);
  if (to) return <Navigate to={to} replace />;
  return (
    <div className="p-6" data-testid="wb-taskrouter-unresolved">
      <Card>
        <EmptyState
          title="Task at an unidentified step: open in Kissflow"
          action={
            <Button
              icon={<ExternalLink size={15} />}
              data-testid="wb-kwb-openform"
              onClick={async () => {
                const r = await actions.openTaskForm(t);
                setNote(r === "opened" ? null : "Kissflow did not open the form; open this task from My Tasks.");
              }}
            >
              Open task form
            </Button>
          }
        >
          The Workbench could not tell which step this task is at ({t.title}). {t.step ? stepDef(t.step).name : ""}
          {note && <span className="mt-2 block text-ink-2" data-testid="wb-kwb-openform-note">{note}</span>}
        </EmptyState>
      </Card>
    </div>
  );
}
