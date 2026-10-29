// One row per supplier task (REQ-PROC-030), shared by "My requests" and the live portal's Tasks tab: fill in the CIQ
// (with % done), each open question (answered in the drawer, in place) and the final release.
import { ClipboardList, FileQuestion, ListChecks, Stamp } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, cx } from "@/components/ui";
import { raiserOf } from "@/domain/permissions";
import { userById, type SupplierTask } from "@/domain/selectors";
import type { CiqCase } from "@/domain/types";
import { useStore } from "@/store/store";
import { caseLink, isLiveScope, metadataProgress, overallProgress, REQUIRED_CONFIG, supplierBlockers, supplierKindLabel, unansweredConfig, wasReturned } from "./lib";
import { DueText, QuestionBadges } from "./parts";
import { tap, useIsPhone } from "./phone";

const ICON: Record<SupplierTask["kind"], ReactNode> = {
  metadata: <ClipboardList size={16} />,
  questionnaire: <ListChecks size={16} />,
  query: <FileQuestion size={16} />,
  "final-release": <Stamp size={16} />,
};

const taskTestId = (t: SupplierTask) => (t.openPointId ? `task-${t.openPointId}` : `task-${t.kind}-${t.caseId}`);

export function TaskRow({ t, c, onAnswer }: { t: SupplierTask; c: CiqCase; onAnswer: () => void }) {
  const nav = useNavigate();
  const { state } = useStore();
  const phone = useIsPhone();
  const op = t.openPointId ? c.openPoints.find((p) => p.id === t.openPointId) : undefined;
  const live = isLiveScope(c);
  let where = "";
  let detail: string | undefined;
  let cta = "Open";
  let testId = `open-${t.kind}-${c.id}`;
  let go = () => nav(caseLink(c.id));
  if (t.kind === "metadata") {
    // live portal only (old flow): the basic questions are their own task
    const answered = REQUIRED_CONFIG.length - unansweredConfig(c).length;
    where = `Step 1 · basic data and configuration · ${answered} of ${REQUIRED_CONFIG.length} questions answered`;
    cta = answered ? "Continue" : "Start";
  } else if (t.kind === "questionnaire") {
    const p = overallProgress(c);
    const open = supplierBlockers(c).length;
    const meta = metadataProgress(c);
    const metaOpen = live && meta.done < meta.total;
    where =
      metaOpen && meta.done === 0
        ? `Questionnaire · start with the metadata questions (0 of ${meta.total} answered)`
        : `Questionnaire · ${p.pct} % ${live ? "done" : "complete"}${metaOpen ? ` · metadata questions: ${meta.done} of ${meta.total} answered` : open ? ` · ${open} item${open === 1 ? "" : "s"} still open` : " · ready to confirm"}`;
    cta = live && meta.done === 0 ? "Start" : "Continue";
    testId = `continue-${c.id}`;
  } else if (t.kind === "final-release") {
    // The live portal's old flow keeps its earlier wording.
    where = live ? "Beiersdorf has completed its review" : "All Beiersdorf reviews are complete";
    cta = live ? "Give the final release" : "Give final release";
    testId = `release-${c.id}`;
  } else if (op) {
    const asker = live ? userById(state, raiserOf(op)) : undefined;
    where = [op.ref.label, asker ? `Asked by ${asker.name}, Beiersdorf` : ""].filter(Boolean).join(" · ");
    detail = wasReturned(op) ? op.thread.filter((m) => m.action === "returned").at(-1)?.text : op.question;
    cta = "Answer";
    testId = `answer-${op.id}`;
    go = onAnswer;
  }
  return (
    <TaskListRow
      testId={taskTestId(t)}
      icon={ICON[t.kind]}
      title={op ? supplierKindLabel(op.kind) : t.title}
      c={c}
      where={where}
      detail={detail}
      right={
        <div className="flex flex-col items-start gap-1 lg:items-end">
          {op && (op.status !== "open" || wasReturned(op) || op.edits?.length) ? (
            <div className="flex flex-wrap gap-1.5 lg:justify-end">
              <QuestionBadges op={op} />
            </div>
          ) : null}
          <DueText due={t.due} />
        </div>
      }
      action={
        <Button size="sm" variant="primary" onClick={go} data-testid={testId} className={tap(phone, "min-w-24")}>
          {cta}
        </Button>
      }
    />
  );
}

export function TaskListRow({ icon, title, c, where, detail, right, action, testId }: { icon: ReactNode; title: string; c: CiqCase; where: string; detail?: string; right?: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <li data-testid={testId} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-x-5 md:px-5">
      <span className="flex h-8 w-8 items-center justify-center self-start rounded-full bg-brand-soft text-brand">{icon}</span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="text-[12.5px] text-ink-2">
          <Link to={caseLink(c.id)} className="font-medium hover:text-brand">
            {c.materialName}
          </Link>{" "}
          <span className="font-mono text-[11.5px] text-ink-3">{c.id}</span>
        </p>
        <p className="mt-0.5 text-[12.5px] text-ink-3">{where}</p>
        {detail && <p className={cx("mt-1 line-clamp-2 max-w-2xl text-[13px] text-ink-2")}>{detail}</p>}
      </div>
      {/* Status and action share one line on phones; from lg up they sit in fixed-width columns so the
          due dates, badges and buttons line up from row to row. */}
      <div className="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-2 md:col-start-auto md:flex-nowrap md:justify-end">
        <div className="lg:flex lg:w-[250px] lg:justify-end">{right}</div>
        {action && <div className="flex lg:w-[136px] lg:justify-end">{action}</div>}
      </div>
    </li>
  );
}
