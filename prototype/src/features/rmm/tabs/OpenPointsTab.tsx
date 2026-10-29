// Open points tab of the case page: every query, document request and additional section (a legacy finding question
// shows as a query) with its full history. Only the person who raised a point can edit or close it (AS-08); every change reaches the supplier.
import { ArrowUpRight, MessagesSquare, Paperclip, Pencil, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Badge, Button, Card, Drawer, EmptyState, Field, KeyValue, Modal, Mono, Segmented, Select, Table, Td, TextArea, TextInput, TrafficLight, Tr, cx } from "@/components/ui";
import { DocName } from "@/components/DocName";
import { DeptBadge, kindLabel } from "@/components/status";
import { DEPT_LABEL } from "@/domain/catalog";
import { can, raiserOf } from "@/domain/permissions";
import { MESSAGE_ACTION_LABEL, closedByCancellation, fmtDate, fmtDateTime, isClosed, isOverdue, nowIso, relDays, userById, userName } from "@/domain/selectors";
import type { CiqCase, OpenPoint } from "@/domain/types";
import { useStore } from "@/store/store";
import { ResponsiveCardHeader } from "../shared";

type View = "unresolved" | "all" | "closed";

const OUTCOME: Record<NonNullable<OpenPoint["outcome"]>, string> = { accepted: "Accepted", "not-accepted": "Not accepted", withdrawn: "Closed, no answer needed" };
/** The closed point's result; a point withdrawn by the case cancellation says so. */
const outcomeOf = (p: OpenPoint) => (closedByCancellation(p) ? "Withdrawn with the case cancellation" : p.outcome ? OUTCOME[p.outcome] : "");

export function OpenPointsTab({ c }: { c: CiqCase }) {
  const { state } = useStore();
  const unresolved = c.openPoints.filter((p) => p.status !== "closed");
  const [view, setView] = useState<View>(unresolved.length ? "unresolved" : "all");
  const [sel, setSel] = useState<string | null>(null);
  const rows = c.openPoints.filter((p) => (view === "all" ? true : view === "closed" ? p.status === "closed" : p.status !== "closed")).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const selected = c.openPoints.find((p) => p.id === sel);

  if (!c.openPoints.length) {
    return (
      <Card data-testid="empty-open-points">
        <EmptyState icon={<MessagesSquare size={28} />} title="No open points">
          {c.reviews.length
            ? "RMM and the departments ask the supplier from their review: queries, document requests and additional sections. Each one appears here with its full history."
            : "Open points are raised during the review, which starts when the supplier confirms completeness."}
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <ResponsiveCardHeader
        title="Open points"
        subtitle={`${unresolved.length} unresolved of ${c.openPoints.length}. Every open point blocks the review that raised it. Only the person who raised it can edit or close it, and every change reaches the supplier.`}
        action={
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: "unresolved", label: `Unresolved · ${unresolved.length}` },
              { value: "all", label: "All" },
              { value: "closed", label: "Closed" },
            ]}
          />
        }
      />
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-ink-3">No open points in this view.</p>
      ) : (
        <Table head={["ID", "Raised by", "Type", "Reference", "Status", "Rounds", "Due", "Responsible"]}>
          {rows.map((p) => {
            const late = p.status === "open" && isOverdue(p.dueDate);
            return (
              <Tr key={p.id} onClick={() => setSel(p.id)} data-testid={`op-row-${p.id}`} data-status={p.status} data-outcome={p.outcome ?? ""}>
                <Td className="whitespace-nowrap">
                  <Mono>{p.id}</Mono>
                </Td>
                <Td>
                  <DeptBadge dept={p.dept} />
                  <span className="mt-0.5 block text-[11.5px] whitespace-nowrap text-ink-3">{userName(state, raiserOf(p))}</span>
                </Td>
                <Td className="whitespace-nowrap text-ink-2">{kindLabel(p.kind)}</Td>
                <Td className="max-w-[240px] min-w-[180px]">
                  <span title={p.ref.label} className="block truncate text-[13px] text-ink">
                    {p.ref.label}
                  </span>
                  <span title={p.question} className="block truncate text-[12px] text-ink-3">
                    {p.question}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">
                  <TrafficLight status={p.status} label={p.status === "closed" && p.outcome ? outcomeOf(p) : p.status === "open" ? "With supplier" : p.status === "in-progress" ? "Answered, to check" : undefined} />
                  {(p.edits?.length ?? 0) > 0 && <span className="mt-0.5 block pl-[42px] text-[11.5px] text-ink-3">Edited</span>}
                </Td>
                <Td className="text-center">{p.rounds}</Td>
                <Td className="whitespace-nowrap">
                  {p.status === "closed" ? (
                    <span className="text-xs text-ink-3">{fmtDate(p.dueDate)}</span>
                  ) : (
                    <>
                      <span className={cx("text-[13px]", late ? "font-medium text-bad" : "text-ink")}>{late ? `Overdue ${relDays(p.dueDate).replace(" ago", "")}` : relDays(p.dueDate)}</span>
                      <span className="block text-[11.5px] text-ink-3">{fmtDate(p.dueDate)}</span>
                    </>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-ink-2">{userName(state, p.responsibleId)}</Td>
              </Tr>
            );
          })}
        </Table>
      )}
      {selected && <ThreadDrawer c={c} p={selected} onClose={() => setSel(null)} />}
    </Card>
  );
}

function ThreadDrawer({ c, p, onClose }: { c: CiqCase; p: OpenPoint; onClose: () => void }) {
  const { state, me } = useStore();
  const nav = useNavigate();
  const [dialog, setDialog] = useState<"edit" | "close" | null>(null);
  const late = p.status === "open" && isOverdue(p.dueDate);
  const raiser = raiserOf(p);
  const open = p.status !== "closed" && !isClosed(c);
  const mayEdit = open && can(state, me.id, "op.edit", c, { opId: p.id });
  const mayClose = open && can(state, me.id, "op.close", c, { opId: p.id });
  const hasTrack = c.reviews.some((r) => r.dept === p.dept) && me.dept === p.dept;
  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title={
        <span className="flex items-center gap-2">
          <Mono className="text-[14px]">{p.id}</Mono> {kindLabel(p.kind)}
        </span>
      }
      subtitle={p.ref.label}
      footer={
        mayEdit || mayClose ? (
          <>
            {mayClose && (
              <Button variant="ghost" icon={<XCircle size={15} />} onClick={() => setDialog("close")} data-testid={`op-withdraw-${p.id}`}>
                Close point
              </Button>
            )}
            {mayEdit && (
              <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => setDialog("edit")} data-testid={`op-edit-${p.id}`}>
                Edit
              </Button>
            )}
            {hasTrack && c.phase === "review" && (
              <Button variant="primary" iconRight={<ArrowUpRight size={15} />} onClick={() => nav(`/review/${c.id}?op=${p.id}`)}>
                Open in my review
              </Button>
            )}
          </>
        ) : (
          <span className="mr-auto text-[12.5px] text-ink-3">{p.status === "closed" ? "Closed. The history is kept." : `Read-only. Only ${userName(state, raiser)} (${DEPT_LABEL[p.dept]}) can accept, return, edit or close this point.`}</span>
        )
      }
    >
      <div className="space-y-5" data-testid={`op-thread-${p.id}`}>
        <div className="flex flex-wrap items-center gap-2">
          <TrafficLight status={p.status} />
          {p.outcome && <Badge tone={p.outcome === "accepted" ? "ok" : p.outcome === "withdrawn" ? "neutral" : "bad"}>{outcomeOf(p)}</Badge>}
          {late && <Badge tone="bad">Overdue</Badge>}
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-[11.5px] font-medium text-ink-3">Question to the supplier</p>
          <p className="mt-1 text-[13.5px] whitespace-pre-line text-ink">{p.question}</p>
        </div>
        <KeyValue
          items={[
            { k: "Raised by", v: `${userName(state, raiser)} · ${DEPT_LABEL[p.dept]}` },
            { k: "Responsible at Beiersdorf", v: userName(state, p.responsibleId) },
            { k: "Raised", v: fmtDateTime(p.createdAt) },
            { k: "Due", v: <span className={late ? "font-medium text-bad" : undefined}>{fmtDate(p.dueDate)}</span> },
            { k: "Rounds with the supplier", v: p.rounds },
            { k: "Justification", v: p.justification || "—" },
            ...(p.closeReason ? [{ k: "Internal reason for closing", v: p.closeReason }] : []),
          ]}
        />
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">History</p>
          <ol className="space-y-3">
            {p.thread.map((m) => {
              const u = userById(state, m.by);
              const doc = m.documentId ? c.documents.find((d) => d.id === m.documentId) : undefined;
              const sup = m.side === "supplier";
              return (
                <li key={m.id} className={cx("rounded-lg border p-3", sup ? "border-violet/30 bg-violet-soft/40" : "border-line bg-surface-2")}>
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    {u && <Avatar initials={u.initials} side={u.side} size={22} />}
                    <span className="font-medium text-ink">{u?.name ?? (m.by === "system" ? "System" : m.by)}</span>
                    <Badge tone={sup ? "violet" : "brand"}>{sup ? "Supplier" : "Beiersdorf"}</Badge>
                    <span className="text-ink-3">{MESSAGE_ACTION_LABEL[m.action]}</span>
                    {m.newRound && <Badge tone="info">New round</Badge>}
                    <span className="ml-auto text-ink-3">{fmtDateTime(m.at)}</span>
                  </div>
                  <p className="mt-1.5 text-[13.5px] whitespace-pre-line text-ink">{m.text}</p>
                  {doc && (
                    <p className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
                      <Paperclip size={13} aria-hidden /> <DocName id={doc.id} name={doc.name} className="[overflow-wrap:anywhere]" /> <span className="text-ink-3">· uploaded {fmtDate(doc.uploadedAt)} at the question</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {dialog === "edit" && <EditPointDialog c={c} p={p} onClose={() => setDialog(null)} />}
      {dialog === "close" && <ClosePointDialog c={c} p={p} onClose={() => setDialog(null)} />}
    </Drawer>
  );
}

/**
 * AS-08: the raiser changes the question, justification, due date or responsible person. Changing the question of an
 * answered point sends it to the supplier again as a new round; a new due date or justification does not.
 */
function EditPointDialog({ c, p, onClose }: { c: CiqCase; p: OpenPoint; onClose: () => void }) {
  const { state, editOpenPoint } = useStore();
  const [question, setQuestion] = useState(p.question);
  const [justification, setJustification] = useState(p.justification);
  const [due, setDue] = useState(p.dueDate.slice(0, 10));
  const [responsibleId, setResponsibleId] = useState(p.responsibleId);
  const [tried, setTried] = useState(false);
  const today = nowIso().slice(0, 10);
  const people = state.users.filter((u) => u.side === "internal" && u.active !== false && (u.dept === p.dept || u.id === p.responsibleId));
  const qChanged = question.trim() !== p.question;
  const dueChanged = due !== p.dueDate.slice(0, 10);
  // An unchanged due date may be in the past (an overdue point); a new one must be today or later.
  const dueError = !due ? "Set a due date." : dueChanged && due < today ? "The new due date must be today or later." : undefined;
  const errors = [!question.trim() && "The question cannot be empty.", dueError].filter(Boolean) as string[];
  const save = () => {
    setTried(true);
    if (errors.length) return;
    const patch = {
      ...(qChanged ? { question: question.trim() } : {}),
      ...(justification.trim() !== p.justification ? { justification: justification.trim() } : {}),
      ...(dueChanged ? { dueDate: new Date(`${due}T17:00:00.000Z`).toISOString() } : {}),
      ...(responsibleId !== p.responsibleId ? { responsibleId } : {}),
    };
    if (!Object.keys(patch).length) return onClose();
    if (editOpenPoint(c.id, p.id, patch)) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${p.id}`}
      subtitle={p.ref.label}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} data-testid="op-edit-save">
            Save and tell the supplier
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Question to the supplier" required error={tried && !question.trim() ? "The question cannot be empty." : undefined} hint={qChanged && p.status === "in-progress" ? "The supplier has answered: a changed question goes back to the supplier as a new round." : undefined}>
          <TextArea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} invalid={tried && !question.trim()} data-testid="op-edit-question" />
        </Field>
        <Field label="Justification">
          <TextArea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} data-testid="op-edit-justification" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" required error={tried ? dueError : undefined} hint={!dueChanged && p.dueDate.slice(0, 10) < today ? "Overdue: set a new due date if the supplier needs more time." : undefined}>
            <TextInput type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} invalid={tried && !!dueError} data-testid="op-edit-due" />
          </Field>
          <Field label="Responsible at Beiersdorf">
            <div data-testid="op-edit-responsible">
              <Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        </div>
        <p className="text-[12.5px] text-ink-3">The supplier sees the change in its request and gets an e-mail. The change is kept in the point's history.</p>
      </div>
    </Modal>
  );
}

/** AS-08: the raiser closes (withdraws) the point with an internal reason; the supplier is told no answer is needed. */
function ClosePointDialog({ c, p, onClose }: { c: CiqCase; p: OpenPoint; onClose: () => void }) {
  const { closeOpenPoint } = useStore();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const submit = () => {
    setTried(true);
    if (!reason.trim()) return;
    if (closeOpenPoint(c.id, p.id, reason.trim())) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Close ${p.id}?`}
      subtitle={p.ref.label}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep open
          </Button>
          <Button variant="danger" onClick={submit} data-testid="op-confirm">
            Close point
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13.5px] text-ink-2">
        <p>{p.status === "in-progress" ? "The supplier has already answered. " : ""}The point stops blocking the review. The supplier is told that no answer is needed; it does not see your reason.</p>
        <Field label="Internal reason" required error={tried && !reason.trim() ? "Give a short internal reason." : undefined}>
          <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Covered by the specification uploaded in K1." invalid={tried && !reason.trim()} data-testid="op-reason" />
        </Field>
      </div>
    </Modal>
  );
}
