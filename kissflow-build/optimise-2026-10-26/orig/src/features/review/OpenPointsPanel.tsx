// Right column: the open points this review raised, and the other reviews' points read only. Only the person who
// raised a point handles it (AS-08): accept, return or close as not accepted once the supplier answered, and edit or
// close it at any time before it is closed. Every change goes into the point's history and reaches the supplier.
import { ChevronDown, ChevronRight, FileText, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, Field, Modal, Mono, Select, TextArea, TextInput, TrafficLight, cx } from "@/components/ui";
import { DeptBadge, kindLabel } from "@/components/status";
import { DEPT_SHORT } from "@/domain/catalog";
import { raiserOf } from "@/domain/permissions";
import { MESSAGE_ACTION_LABEL, fmtDate, fmtDateTime, isOverdue, relDays, userName } from "@/domain/selectors";
import type { CiqCase, OpenPoint, ReviewDept } from "@/domain/types";
import { useStore } from "@/store/store";
import { activeDeptUsers, pointOutcome, pointPermissions } from "./lib";
import { docLabel, fromDateInput, toDateInput, todayInput } from "./shared";

/** The point's full history: every round, edit and closing, with who and when. */
function History({ c, p }: { c: CiqCase; p: OpenPoint }) {
  const { state } = useStore();
  return (
    <ol className="space-y-2.5" data-testid={`op-thread-${p.id}`}>
      {p.thread.map((m) => {
        const doc = m.documentId ? c.documents.find((d) => d.id === m.documentId) : undefined;
        return (
          <li key={m.id} className="text-[13px]">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3">
              <Badge tone={m.side === "supplier" ? "violet" : "brand"}>{m.side === "supplier" ? "Supplier" : "Beiersdorf"}</Badge>
              <span className="font-medium text-ink-2">{userName(state, m.by)}</span>
              <span>· {MESSAGE_ACTION_LABEL[m.action]}</span>
              {m.newRound && <span>· new round</span>}
              {m.action === "note" && <span>· internal</span>}
              <span className="whitespace-nowrap">· {fmtDateTime(m.at)}</span>
            </div>
            <p className="mt-1 whitespace-pre-line text-ink">{m.text}</p>
            {doc && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
                <FileText size={13} className="text-ink-3" /> {docLabel(doc)}
              </p>
            )}
          </li>
        );
      })}
      {p.closeReason && (
        <li className="rounded-md bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink-2">
          <span className="font-medium text-ink">Internal reason for closing:</span> {p.closeReason}
        </li>
      )}
    </ol>
  );
}

/** AS-08: the raiser changes the question, justification, due date or responsible person. */
function EditPointModal({ c, p, onClose }: { c: CiqCase; p: OpenPoint; onClose: () => void }) {
  const { state, editOpenPoint } = useStore();
  const [question, setQuestion] = useState(p.question);
  const [just, setJust] = useState(p.justification);
  const [due, setDue] = useState(toDateInput(p.dueDate));
  const [resp, setResp] = useState(p.responsibleId);
  const [tried, setTried] = useState(false);
  const team = activeDeptUsers(state, p.dept);
  const people = team.some((u) => u.id === p.responsibleId) ? team : [...team, ...state.users.filter((u) => u.id === p.responsibleId)];
  const questionChanged = question.trim() !== p.question;
  const dueChanged = due !== toDateInput(p.dueDate);
  const patch = {
    ...(questionChanged ? { question: question.trim() } : {}),
    ...(just.trim() !== p.justification ? { justification: just.trim() } : {}),
    ...(dueChanged ? { dueDate: fromDateInput(due) } : {}),
    ...(resp !== p.responsibleId ? { responsibleId: resp } : {}),
  };
  const changed = Object.keys(patch).length > 0;
  const dueBad = dueChanged && (!due || due < todayInput());
  const questionBad = !question.trim();
  const save = () => {
    setTried(true);
    if (!changed || dueBad || questionBad) return;
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
          <Button variant="primary" onClick={save} disabled={!changed || (tried && (dueBad || questionBad))} data-testid="op-edit-save">
            {questionChanged && p.status === "in-progress" ? "Save and send again" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Question to the supplier" required error={tried && questionBad ? "The question cannot be empty." : undefined}>
          <TextArea value={question} onChange={(e) => setQuestion(e.target.value)} invalid={tried && questionBad} data-testid="op-edit-question" />
        </Field>
        <Field label="Business justification" hint="The supplier sees it with the question.">
          <TextArea value={just} onChange={(e) => setJust(e.target.value)} className="min-h-[60px]" data-testid="op-edit-justification" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" required error={tried && dueBad ? "Pick today or a later date." : undefined}>
            <TextInput type="date" value={due} min={todayInput()} onChange={(e) => setDue(e.target.value)} invalid={tried && dueBad} data-testid="op-edit-due" />
          </Field>
          <Field label="Responsible at Beiersdorf" required>
            <div data-testid="op-edit-responsible">
              <Select value={resp} onChange={(e) => setResp(e.target.value)}>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        </div>
        <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
          {questionChanged && p.status === "in-progress"
            ? "The supplier has already answered. A changed question goes back to the supplier as a new round."
            : "Changing the due date, the justification or the responsible person does not start a new round."}{" "}
          The change is kept in the point's history, and the supplier contacts get an e-mail.
        </p>
      </div>
    </Modal>
  );
}

/** AS-08: the raiser closes (withdraws) the point; the reason stays internal. */
function ClosePointModal({ c, p, onClose }: { c: CiqCase; p: OpenPoint; onClose: () => void }) {
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
      title={`Close ${p.id}`}
      subtitle={p.ref.label}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={tried && !reason.trim()} data-testid="op-close-confirm">
            Close the point
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13.5px] text-ink">{p.question}</p>
        <Field label="Why is no answer needed any more?" required hint="Internal: recorded in the case history, never shown to the supplier." error={tried && !reason.trim() ? "A short internal reason is required." : undefined}>
          <TextArea value={reason} onChange={(e) => setReason(e.target.value)} invalid={tried && !reason.trim()} placeholder="e.g. covered by the safety data sheet uploaded in K4.1" data-testid="op-close-reason" />
        </Field>
        <p className="text-xs text-ink-3">The supplier sees the point as closed by Beiersdorf with no answer needed, and gets an e-mail. The point stops blocking your review.</p>
      </div>
    </Modal>
  );
}

/** A decision being written on a point: return or close as not accepted, and the reason typed. */
interface Decision {
  mode: null | "return" | "not-accepted";
  reason: string;
}
const NO_DECISION: Decision = { mode: null, reason: "" };
/** The panel keeps it, not Decide: the decision moves the point on screen at once (the live app shows it before
 *  Kissflow has it), so Decide unmounts; when it did not reach Kissflow the point comes back answered with it. */
type DecisionDraft = Decision & { set(patch: Partial<Decision>): void };

/** The supplier answered: the raiser accepts, returns it with a reason, or closes it as not accepted. */
function Decide({ c, p, draft, onEdit, onClose }: { c: CiqCase; p: OpenPoint; draft: DecisionDraft; onEdit: () => void; onClose: () => void }) {
  const { reviewResponse } = useStore();
  const { mode, reason } = draft;
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const last = [...p.thread].reverse().find((m) => m.side === "supplier");
  const lastDoc = last?.documentId ? c.documents.find((d) => d.id === last.documentId) : undefined;
  const confirm = () => {
    setTried(true);
    if (!mode || !reason.trim() || sending) return;
    const r = reviewResponse(c.id, p.id, mode, reason.trim());
    // The prototype decides at once; the live app resolves false when the decision did not reach Kissflow, and the
    // mode and reason stay for the point's next showing (APP-SAVING-GAPS gap 6).
    setSending(true);
    void Promise.resolve(r).then((ok) => {
      setSending(false);
      if (ok === false) return;
      draft.set(NO_DECISION);
      setTried(false);
    });
  };
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3" data-testid={`op-decide-${p.id}`}>
      <p className="text-xs font-semibold text-ink-2">{last?.action === "cannot-provide" ? "The supplier says this cannot be provided" : "The supplier answered: your decision"}</p>
      {last && <p className="mt-1 text-[13px] whitespace-pre-line text-ink">{last.text}</p>}
      {lastDoc && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
          <FileText size={13} className="text-ink-3" /> {docLabel(lastDoc)}
        </p>
      )}
      {mode === null ? (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => reviewResponse(c.id, p.id, "accept", "")} data-testid={`op-accept-${p.id}`}>
              Accept
            </Button>
            <Button size="sm" variant="secondary" onClick={() => draft.set({ mode: "return" })} data-testid={`op-return-${p.id}`}>
              Return to supplier
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] font-medium text-ink-2">
            <button type="button" onClick={() => draft.set({ mode: "not-accepted" })} className="underline-offset-2 hover:text-ink hover:underline" data-testid={`op-not-accepted-${p.id}`}>
              Close as not accepted
            </button>
            <button type="button" onClick={onEdit} className="underline-offset-2 hover:text-ink hover:underline" data-testid={`op-edit-${p.id}`}>
              Edit
            </button>
            <button type="button" onClick={onClose} className="underline-offset-2 hover:text-ink hover:underline" data-testid={`op-close-${p.id}`}>
              Close, no longer needed
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="text-xs font-medium text-ink">{mode === "return" ? "Why does the answer not suffice? The supplier sees this." : "Why do you close it without accepting? Internal record."}</label>
          <TextArea value={reason} onChange={(e) => draft.set({ reason: e.target.value })} invalid={tried && !reason.trim()} className="min-h-[64px] bg-surface" autoFocus data-testid="op-decide-reason" />
          {tried && !reason.trim() && <p className="text-xs font-medium text-bad">A short reason is required.</p>}
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "return" ? "primary" : "danger"} onClick={confirm} disabled={sending} data-testid="op-decide-confirm">
              {sending ? "Sending…" : mode === "return" ? "Return to supplier" : "Close as not accepted"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                draft.set({ mode: null });
                setTried(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PointCard({ c, p, trackOpen, highlighted, draft, onJump }: { c: CiqCase; p: OpenPoint; trackOpen: boolean; highlighted: boolean; draft: DecisionDraft; onJump: (sectionId: string) => void }) {
  const { state, me } = useStore();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<null | "edit" | "close">(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);
  const may = pointPermissions(state, me.id, c, p, trackOpen);
  const isRaiser = may.raiserId === me.id;
  const late = p.status === "open" && isOverdue(p.dueDate);
  const edited = (p.edits?.length ?? 0) > 0;
  return (
    <div ref={ref} data-testid={`op-card-${p.id}`} className={cx("px-4 py-3 transition-shadow", highlighted && "rounded-lg ring-2 ring-brand ring-inset")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TrafficLight status={p.status} />
        <Badge tone="neutral">{kindLabel(p.kind)}</Badge>
        {edited && <Badge tone="info">Changed by the raiser</Badge>}
      </div>
      <p className="mt-1.5 text-[12.5px]">
        <Mono className="mr-1.5 text-[11.5px] text-ink-3">{p.id}</Mono>
        <button onClick={() => onJump(p.ref.sectionId)} className="text-left font-medium text-brand hover:underline">
          {p.ref.label}
        </button>
      </p>
      <p className="mt-1 text-[13px] text-ink">{p.question}</p>
      <p className="mt-1 text-xs text-ink-3">
        {p.status !== "closed" ? <span className={late ? "font-medium text-bad" : "text-ink-2"}>{late ? `Overdue · ${relDays(p.dueDate)}` : `Due ${fmtDate(p.dueDate)}`}</span> : <span className="text-ink-2">{pointOutcome(state, p)}</span>}
        {" · "}Round {p.rounds} · Raised by {isRaiser ? "you" : may.raiserName} · Responsible {userName(state, p.responsibleId)}
        {p.justification && <> · Why: {p.justification}</>}
      </p>

      {may.decide && <Decide c={c} p={p} draft={draft} onEdit={() => setModal("edit")} onClose={() => setModal("close")} />}
      {p.status === "open" && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-ink-3">With the supplier, waiting for an answer.{!isRaiser && trackOpen ? ` Only ${may.raiserName} can change this point.` : ""}</span>
          {(may.edit || may.close) && (
            <span className="flex gap-1">
              {may.edit && (
                <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setModal("edit")} data-testid={`op-edit-${p.id}`}>
                  Edit
                </Button>
              )}
              {may.close && (
                <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setModal("close")} data-testid={`op-close-${p.id}`}>
                  Close
                </Button>
              )}
            </span>
          )}
        </div>
      )}
      {p.status === "in-progress" && !may.decide && <p className="mt-2 text-xs text-ink-3">The supplier answered.{isRaiser ? "" : ` Only ${may.raiserName} can decide on or change this point.`}</p>}

      <button onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink" aria-expanded={open} data-testid={`op-history-${p.id}`}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} History ({p.thread.length})
      </button>
      {open && (
        <div className="mt-2 border-t border-line pt-2.5">
          <History c={c} p={p} />
        </div>
      )}
      {modal === "edit" && <EditPointModal c={c} p={p} onClose={() => setModal(null)} />}
      {modal === "close" && <ClosePointModal c={c} p={p} onClose={() => setModal(null)} />}
    </div>
  );
}

export function OpenPointsPanel({ c, dept, trackOpen, highlight, onJump }: { c: CiqCase; dept: ReviewDept; trackOpen: boolean; highlight: string | null; onJump: (sectionId: string) => void }) {
  const { state } = useStore();
  const [showClosed, setShowClosed] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const draftOf = (p: OpenPoint): DecisionDraft => {
    const key = `${c.id}/${p.id}`;
    return { ...(decisions[key] ?? NO_DECISION), set: (patch) => setDecisions((all) => ({ ...all, [key]: { ...(all[key] ?? NO_DECISION), ...patch } })) };
  };
  const mine = c.openPoints.filter((p) => p.dept === dept);
  const order = { "in-progress": 0, open: 1, closed: 2 } as const;
  const active = mine.filter((p) => p.status !== "closed").sort((a, b) => order[a.status] - order[b.status] || a.dueDate.localeCompare(b.dueDate));
  const closed = mine.filter((p) => p.status === "closed");
  const others = c.openPoints.filter((p) => p.dept !== dept);
  const othersOpen = others.filter((p) => p.status !== "closed").length;
  // A deep link (mail, blocker, field chip) to a closed point or another review's point opens that list.
  useEffect(() => {
    if (!highlight) return;
    if (closed.some((p) => p.id === highlight)) setShowClosed(true);
    if (others.some((p) => p.id === highlight)) setShowOthers(true);
  }, [highlight]); // only when the target changes, not on every list update

  return (
    <div className="space-y-4">
      <Card data-testid="my-open-points">
        <CardHeader title={`My open points${active.length ? ` (${active.length})` : ""}`} subtitle={`Raised by the ${DEPT_SHORT[dept]} review. Each one blocks your completion until it is closed.`} />
        {active.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-ink-3">{trackOpen ? "Nothing open. Use “Ask supplier” next to any answer, component row or document." : "No open point is waiting."}</p>
        ) : (
          <div className="divide-y divide-line">
            {active.map((p) => (
              <PointCard key={p.id} c={c} p={p} trackOpen={trackOpen} highlighted={highlight === p.id} draft={draftOf(p)} onJump={onJump} />
            ))}
          </div>
        )}
        {closed.length > 0 && (
          <div className="border-t border-line">
            <button onClick={() => setShowClosed((v) => !v)} className="flex w-full items-center gap-1 px-4 py-2.5 text-left text-xs font-medium text-ink-2 hover:text-ink" aria-expanded={showClosed} data-testid="my-closed-points">
              {showClosed ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Closed ({closed.length})
            </button>
            {showClosed && (
              <div className="divide-y divide-line border-t border-line">
                {closed.map((p) => (
                  <PointCard key={p.id} c={c} p={p} trackOpen={false} highlighted={highlight === p.id} draft={draftOf(p)} onJump={onJump} />
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <button onClick={() => setShowOthers((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" aria-expanded={showOthers} data-testid="other-open-points">
          <span>
            <span className="block text-[14px] font-semibold text-ink">Open points of other reviews</span>
            <span className="block text-xs text-ink-3">Read only · {others.length === 0 ? "none raised" : `${othersOpen} unresolved of ${others.length}`}</span>
          </span>
          {showOthers ? <ChevronDown size={16} className="text-ink-3" /> : <ChevronRight size={16} className="text-ink-3" />}
        </button>
        {showOthers &&
          (others.length === 0 ? (
            <p className="border-t border-line px-4 py-4 text-[13px] text-ink-3">No other review has raised a point on this case.</p>
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {others.map((p) => (
                <div key={p.id} data-testid={`op-other-${p.id}`} className={cx("px-4 py-2.5", highlight === p.id && "ring-2 ring-brand ring-inset")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <DeptBadge dept={p.dept} />
                    <TrafficLight status={p.status} />
                    <Mono className="ml-auto text-ink-3">{p.id}</Mono>
                  </div>
                  <button onClick={() => onJump(p.ref.sectionId)} className="mt-1 text-left text-[12.5px] font-medium text-brand hover:underline">
                    {p.ref.label}
                  </button>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">
                    {kindLabel(p.kind)}: {p.question}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">{p.status === "closed" ? pointOutcome(state, p) : `Raised by ${userName(state, raiserOf(p))} · due ${fmtDate(p.dueDate)}`}</p>
                </div>
              ))}
            </div>
          ))}
      </Card>
    </div>
  );
}
