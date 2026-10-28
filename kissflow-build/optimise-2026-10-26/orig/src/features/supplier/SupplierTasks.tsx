// Supplier task list (REQ-PROC-030: one task per request). To do / With Beiersdorf / Done.
// The live portal keeps it as its own Tasks tab; the prototype merges the tasks into My requests (spec §3).
import { CheckCircle2, ClipboardList, FileQuestion, Hourglass, ListChecks, Send, Stamp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { fmtDate } from "@/domain/selectors";
import type { OpenPointKind } from "@/domain/types";
import { AnswerDrawer } from "./AnswerDrawer";
import { caseLink, closedQuestions, answeredQuestions, isLiveScope, isWithdrawn, supplierKindLabel, useSupplierScope, useSupplierTasks } from "./lib";
import { TaskListRow as Row, TaskRow } from "./TaskList";

type TabKey = "todo" | "waiting" | "done";

export function SupplierTasks() {
  const { cases } = useSupplierScope();
  const [tab, setTab] = useState<TabKey>("todo");
  const [drawer, setDrawer] = useState<{ caseId: string; opId: string } | null>(null);
  const byId = new Map(cases.map((c) => [c.id, c]));
  const todo = useSupplierTasks().filter((t) => byId.has(t.caseId));

  // With Beiersdorf: answered questions awaiting review, and requests waiting on Beiersdorf.
  const waitingQs = cases.flatMap((c) => answeredQuestions(c).map((op) => ({ c, op })));
  // scope-check: live portal only (old flow)
  const waitingCases = cases.filter((c) => c.phase === "scope-check" || (c.phase === "review" && !c.openPoints.some((p) => p.status === "open")));
  // Live-scope requests keep a question the raiser closed (AS-08) as "Closed, no answer needed"; the old flow hides it.
  const doneQs = cases.flatMap((c) => closedQuestions(c).filter((p) => p.outcome !== "withdrawn" || (isLiveScope(c) && c.phase !== "cancelled")).map((op) => ({ c, op })));
  const doneConfs = cases.flatMap((c) => c.confirmations.filter((x) => x.type === "completeness" || x.type === "final-release").map((x) => ({ c, x })));
  const doneCount = doneQs.length + doneConfs.length;

  return (
    <div className="space-y-5">
      <PageHeader title="Tasks" subtitle="Everything Beiersdorf currently needs from you, across all your requests, sorted by due date. Questions are answered right here; questionnaire tasks open the request." />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "todo", label: "To do", count: todo.length },
          { value: "waiting", label: "With Beiersdorf", count: waitingQs.length + waitingCases.length },
          { value: "done", label: "Done", count: doneCount },
        ]}
      />

      {tab === "todo" && (
        <Card>
          {todo.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={28} />} title="You are all caught up">
              There is nothing to do right now. When Beiersdorf needs something, a task appears here and you receive an e-mail.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {todo.map((t) => (
                <TaskRow key={`${t.caseId}-${t.openPointId ?? t.kind}`} t={t} c={byId.get(t.caseId)!} onAnswer={() => t.openPointId && setDrawer({ caseId: t.caseId, opId: t.openPointId })} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "waiting" && (
        <Card>
          {waitingQs.length + waitingCases.length === 0 ? (
            <EmptyState icon={<Hourglass size={28} />} title="Nothing is waiting on Beiersdorf">
              Answers you send and questionnaires you submit show up here until Beiersdorf has looked at them.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {waitingQs.map(({ c, op }) => (
                <Row
                  key={op.id}
                  icon={<Send size={16} />}
                  title={ANSWERED[op.kind]}
                  c={c}
                  where={op.ref.label}
                  detail={op.question}
                  right={<Badge tone="info" dot>With Beiersdorf</Badge>}
                  action={
                    <Button size="sm" variant="secondary" onClick={() => setDrawer({ caseId: c.id, opId: op.id })}>
                      View conversation
                    </Button>
                  }
                />
              ))}
              {waitingCases.map((c) => (
                <Row
                  key={c.id}
                  icon={<Hourglass size={16} />}
                  title={c.phase === "scope-check" ? "Beiersdorf is checking the scope of your questionnaire" : "Beiersdorf is reviewing your submission"}
                  c={c}
                  where={c.phase === "scope-check" ? "Basic questions submitted" : "Completeness confirmed"}
                  right={<Badge tone="info" dot>With Beiersdorf</Badge>}
                  action={<LinkButton to={caseLink(c.id)}>View</LinkButton>}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "done" && (
        <Card>
          {doneCount === 0 ? (
            <EmptyState icon={<ListChecks size={28} />} title="No finished tasks yet" />
          ) : (
            <ul className="divide-y divide-line">
              {doneConfs
                .sort((a, b) => b.x.at.localeCompare(a.x.at))
                .map(({ c, x }) => (
                  <Row key={`${c.id}-${x.type}`} icon={x.type === "final-release" ? <Stamp size={16} /> : <ClipboardList size={16} />} title={x.type === "final-release" ? "Gave the final release" : "Confirmed completeness"} c={c} where={`By ${x.name} on ${fmtDate(x.at)}`} right={<Badge tone="ok" dot>Done</Badge>} action={<LinkButton to={caseLink(c.id)}>View</LinkButton>} />
                ))}
              {doneQs.map(({ c, op }) => (
                <Row
                  key={op.id}
                  icon={<FileQuestion size={16} />}
                  title={supplierKindLabel(op.kind)}
                  c={c}
                  where={op.ref.label}
                  detail={op.question}
                  right={isWithdrawn(op) ? <Badge tone="neutral" dot>Closed, no answer needed</Badge> : <Badge tone="ok" dot>Closed</Badge>}
                  action={
                    <Button size="sm" variant="secondary" onClick={() => setDrawer({ caseId: c.id, opId: op.id })}>
                      View
                    </Button>
                  }
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      <AnswerDrawer caseId={drawer?.caseId ?? ""} opId={drawer?.opId ?? null} onClose={() => setDrawer(null)} />
    </div>
  );
}

const ANSWERED: Record<OpenPointKind, string> = {
  query: "Question answered",
  finding: "Question answered",
  "document-request": "Requested document sent",
  "additional-part": "Additional section sent",
};

function LinkButton({ to, children }: { to: string; children: ReactNode }) {
  const nav = useNavigate();
  return (
    <Button size="sm" variant="secondary" onClick={() => nav(to)}>
      {children}
    </Button>
  );
}
