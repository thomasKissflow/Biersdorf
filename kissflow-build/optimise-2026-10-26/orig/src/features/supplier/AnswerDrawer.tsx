// Answer drawer for a Beiersdorf question / document request (REQ-PROC-029/-030/-034).
// Shows only what the supplier may see: the question, the object it refers to, the due date, the documents stored at
// that object and the visible conversation, including the raiser's changes (AS-08). Internal notes, findings and
// department outcomes never appear here. A document is stored in the questionnaire at the item the question refers
// to; the reply only references it.
import { ArrowUpRight, CheckCircle2, FileText, Info, MessageSquareText, Paperclip, Upload, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Button, Drawer, Field, FileDrop, ProgressBar, TextArea, cx } from "@/components/ui";
import { raiserOf } from "@/domain/permissions";
import { SUPPLIER_MESSAGE_TEXT, fmtDate, fmtDateTime, userById, userName } from "@/domain/selectors";
import type { CiqCase, Message, OpenPoint, OpenPointEdit } from "@/domain/types";
import { usePortalCaps } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { caseLink, documentsAt, editsOf, isLiveScope, isWithdrawn, navProgress, refLink, sectionCode, sectionTitle, supplierBlockers, supplierJustification, supplierKindLabel, supplierSections, visibleThread, wasReturned } from "./lib";
import { DocumentList, DueText, QuestionBadges, docRef } from "./parts";

type Mode = "answer" | "upload" | "cannot";

export function AnswerDrawer({ caseId, opId, onClose }: { caseId: string; opId: string | null; onClose: () => void }) {
  const { state } = useStore();
  const c = state.cases.find((x) => x.id === caseId);
  const op = c?.openPoints.find((p) => p.id === opId);
  return (
    <Drawer open={!!(c && op)} onClose={onClose} width={560} title={op ? supplierKindLabel(op.kind) : ""} subtitle={c ? `${c.materialName} · ${c.id}` : undefined}>
      {c && op && <DrawerBody key={op.id} c={c} op={op} onClose={onClose} />}
    </Drawer>
  );
}

/** One raiser change as the supplier reads it. A finding-based reason stays hidden (it names the internal finding). */
function editLine(e: OpenPointEdit, op: OpenPoint, name: (id: string) => string): string | null {
  switch (e.field) {
    case "question":
      return `Changed the question. Earlier wording: “${e.from}”`;
    case "justification":
      return supplierJustification(op) ? `Changed why Beiersdorf asks: “${e.to}”` : null;
    case "dueDate":
      return `Changed the due date from ${fmtDate(e.from)} to ${fmtDate(e.to)}.`;
    case "responsibleId":
      return `Handed the question to ${name(e.to)}.`;
  }
}

function DrawerBody({ c, op, onClose }: { c: CiqCase; op: OpenPoint; onClose: () => void }) {
  const { state, me, supplierRespond } = useStore();
  const nav = useNavigate();
  const live = isLiveScope(c);
  // A section Beiersdorf added (REQ-ADR-002): the supplier completes it, then reports "Section completed".
  const additional = live && op.kind === "additional-part";
  const [mode, setMode] = useState<Mode>(op.kind === "document-request" ? "upload" : "answer");
  const [text, setText] = useState(additional ? "Section completed." : "");
  const [file, setFile] = useState<{ name: string; sizeKb: number; file?: File } | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  // EC-OP-03: the wording the contact answers. When the raiser changes it meanwhile, the first Send only shows it.
  const [seenQuestion, setSeenQuestion] = useState(op.question);
  const [staleShown, setStaleShown] = useState(false);
  const canStore = usePortalCaps().canUpload(c.id, op.ref.sectionId);
  const thread = visibleThread(op);
  // "Asked by": the reviewer who raised it (the live portal's old flow keeps its responsible person).
  const responsible = userById(state, live ? raiserOf(op) : op.responsibleId);
  const why = supplierJustification(op);
  const returned = wasReturned(op);
  const lastReturn = returned ? thread.at(-1) : undefined;
  const questionChanged = live && op.question !== seenQuestion;
  // Documents at the question's item. A component row has no documents of its own, and the live portal's old flow
  // keeps its earlier drawer without this list.
  const stored = live && !op.ref.rowId ? documentsAt(c, op.ref.sectionId, op.ref.fieldId) : [];
  const sec = additional ? (supplierSections(c).find((s) => s.sectionId === op.ref.sectionId) ?? { sectionId: op.ref.sectionId, applicability: "mandatory" as const }) : undefined;
  const secProgress = sec ? navProgress(c, sec) : undefined;
  const secOpen = sec ? supplierBlockers(c).filter((b) => b.sectionId === sec.sectionId).length : 0;

  const switchMode = (m: Mode) => {
    setMode(m);
    setText(m === "answer" && additional ? "Section completed." : "");
    setFile(null);
  };

  const valid = mode === "answer" ? text.trim().length > 0 && (!additional || secOpen === 0) : mode === "upload" ? !!file && canStore : text.trim().length >= 10;

  const send = () => {
    if (!valid || sending) return;
    if (questionChanged) {
      // the contact first reads the new wording; the next Send goes through
      setSeenQuestion(op.question);
      setStaleShown(true);
      return;
    }
    const r =
      mode === "upload" && file
        ? supplierRespond(c.id, op.id, { text: text.trim() || `Document uploaded: ${file.name}`, documentName: file.name, sizeKb: file.sizeKb, file: file.file })
        : supplierRespond(c.id, op.id, { text: text.trim(), cannotProvide: mode === "cannot" });
    // The prototype answers at once; the live portal resolves false when the answer did not reach Beiersdorf, and the
    // typed text and file stay so the contact can try again.
    setSending(true);
    void Promise.resolve(r).then((ok) => {
      setSending(false);
      if (ok !== false) setSent(true);
    });
  };

  const goTo = (to: string) => {
    onClose();
    nav(to);
  };

  return (
    <div className="flex min-h-full flex-col gap-5" data-testid="answer-drawer" data-status={op.status}>
      {/* The question */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <QuestionBadges op={op} />
          <span className="font-mono text-[11.5px] text-ink-3">{op.id}</span>
        </div>
        <p className="text-[15px] leading-relaxed text-ink">{lastReturn ? lastReturn.text : op.question}</p>
        {lastReturn && <p className="text-[12.5px] text-ink-3">Original question: {op.question}</p>}
        {(questionChanged || staleShown) && op.status === "open" && !sent && (
          <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-ink" role="status" data-testid="answer-question-changed">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>Beiersdorf changed this question while you were writing. Please check your answer against the wording above, then send it again. Your text is kept.</span>
          </p>
        )}
        <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2.5 rounded-lg border border-line bg-surface-2 px-3.5 py-3 text-[13px] sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-x-4">
          <dt className="text-ink-3">Refers to</dt>
          <dd>
            <button onClick={() => goTo(refLink(op))} className="text-left font-medium text-brand hover:underline" data-testid="answer-go-to-ref">
              Go to {op.ref.label}
              <ArrowUpRight size={14} className="ml-0.5 inline align-[-2px]" />
            </button>
          </dd>
          <dt className="text-ink-3">Due</dt>
          <dd>{op.status === "open" ? <DueText due={op.dueDate} /> : <span className="text-ink-2">{fmtDate(op.dueDate)}</span>}</dd>
          {responsible && (
            <>
              <dt className="text-ink-3">Asked by</dt>
              <dd className="text-ink-2">{responsible.name}, Beiersdorf</dd>
            </>
          )}
          {why && (
            <>
              <dt className="text-ink-3">Why we ask</dt>
              <dd className="text-ink-2">{why}</dd>
            </>
          )}
        </dl>
      </section>

      {/* An added section: how far it is, and where to fill it in */}
      {sec && secProgress && (
        <section className="space-y-2 rounded-lg border border-line px-3.5 py-3" data-testid="answer-section-progress">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold text-ink">
              <span className="font-mono text-ink-3">{sectionCode(sec.sectionId, c.templateVersion)}</span> {sectionTitle(sec.sectionId, c.templateVersion)}
            </p>
            <span className={cx("text-[12.5px]", secOpen === 0 ? "font-medium text-ok" : "text-ink-2")}>{secProgress.total ? `${Math.min(secProgress.done, secProgress.total)} of ${secProgress.total} answered` : "Nothing required"}</span>
          </div>
          {secProgress.total > 0 && <ProgressBar value={secProgress.done} max={secProgress.total} tone={secOpen === 0 ? "ok" : "brand"} />}
          <p className="text-[12.5px] text-ink-3">
            {secOpen > 0
              ? `Complete the section first (${secOpen} item${secOpen === 1 ? "" : "s"} still open), or choose “We cannot provide this” and explain why.`
              : secProgress.total > 0
                ? "The section is complete. Tell Beiersdorf with “Section completed”."
                : "This section has no required questions in the portal yet. Add a supporting document there if you have one, then tell Beiersdorf with “Section completed”."}
          </p>
          <Button size="sm" variant="secondary" iconRight={<ArrowUpRight size={14} />} onClick={() => goTo(caseLink(c.id, { s: sec.sectionId }))}>
            Go to {sectionCode(sec.sectionId, c.templateVersion)}
          </Button>
        </section>
      )}

      {/* Conversation */}
      <section>
        <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <MessageSquareText size={15} className="text-ink-3" /> Conversation
        </h3>
        <ol className="space-y-3">
          {thread.map((m) => (
            <ThreadEntry key={m.id} c={c} op={op} m={m} meId={me.id} />
          ))}
        </ol>
      </section>

      {/* Documents already stored at the item (they belong to the questionnaire, not to the conversation) */}
      {stored.length > 0 && (
        <section data-testid="answer-stored-documents">
          <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Paperclip size={15} className="text-ink-3" /> Documents at {op.ref.label}
          </h3>
          <DocumentList docs={stored.slice(0, 3)} />
          {stored.length > 3 && <p className="mt-1.5 text-[12px] text-ink-3">and {stored.length - 3} earlier document{stored.length - 3 === 1 ? "" : "s"}, listed in the questionnaire</p>}
        </section>
      )}

      {/* Respond: sits at the bottom of the drawer like a composer. From sm up it stays pinned while a long
          conversation scrolls above it; on phones it flows after the conversation so the thread stays readable. */}
      {op.status === "open" && !sent && (
        <section className="-mx-5 mt-auto -mb-4 space-y-3 border-t border-line bg-surface px-5 pt-4 pb-4 sm:sticky sm:-bottom-4">
          <h3 className="text-[13px] font-semibold text-ink">Your response</h3>
          <ModePicker value={mode} onChange={switchMode} />
          {mode === "answer" && (
            <Field label="Answer" required hint={additional ? "Send this once the section is filled in. Beiersdorf then checks it." : "Beiersdorf sees your answer together with your name and the time."}>
              <TextArea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…" data-testid="answer-text" />
            </Field>
          )}
          {mode === "upload" && (
            <>
              <Field label="Document" required hint={`The file is stored in the questionnaire at ${op.ref.label}, next to any earlier documents, with today's date. Your reply refers to it.`}>
                <div data-testid="answer-file">
                  <FileDrop disabled={!canStore} onFile={(name, sizeKb, f) => setFile({ name, sizeKb, file: f })} />
                </div>
              </Field>
              {file && (
                <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-2">
                  <Paperclip size={13} className="text-ink-3" />
                  <span className="font-medium text-ink [overflow-wrap:anywhere]">{file.name}</span>
                  <span className="text-ink-3">{file.sizeKb} KB · not sent yet</span>
                  <button type="button" onClick={() => setFile(null)} className="text-[12px] text-ink-3 hover:text-ink">
                    Remove
                  </button>
                </p>
              )}
              {!canStore && <p className="text-[12.5px] text-ink-3">The item this question refers to is assigned to a colleague, so the document has to be uploaded by them. You can answer in text instead.</p>}
              <Field label="Comment" hint="Optional.">
                <TextArea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: updated analysis from batch 2609-021." data-testid="answer-comment" />
              </Field>
            </>
          )}
          {mode === "cannot" && (
            <Field label="Justification" required hint="Mandatory. Explain why the information or document cannot be provided (at least 10 characters). Beiersdorf decides whether this is acceptable.">
              <TextArea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: the study is owned by the registrant and is confidential." data-testid="answer-justification" />
            </Field>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!valid || sending} onClick={send} icon={mode === "upload" ? <Upload size={15} /> : mode === "cannot" ? <XCircle size={15} /> : <FileText size={15} />} data-testid="answer-send">
              {sending ? "Sending…" : "Send to Beiersdorf"}
            </Button>
          </div>
        </section>
      )}

      {(sent || op.status === "in-progress") && (
        <section className="mt-auto flex gap-3 rounded-lg bg-info-soft px-3.5 py-3" data-testid="answer-sent">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-info" />
          <div className="text-[13px]">
            <p className="font-semibold text-ink">With Beiersdorf</p>
            <p className="mt-0.5 text-ink-2">{sent ? "Your answer has been sent." : "An answer has been sent."} Beiersdorf reviews it; if anything else is needed you will get a new task and an e-mail.</p>
            <Button size="sm" variant="secondary" className="mt-2.5" onClick={onClose}>
              Close
            </Button>
          </div>
        </section>
      )}
      {op.status === "closed" && !sent && (
        <section className="mt-auto space-y-2 rounded-lg border border-line bg-surface-2 px-3.5 py-3 text-[13px] text-ink-2" data-testid="answer-closed">
          <p>{isWithdrawn(op) ? `Beiersdorf closed this question${op.closedAt ? ` on ${fmtDate(op.closedAt)}` : ""}. No answer is needed from you.` : "This item is closed. No further action is needed from you."}</p>
          {live && text.trim() && text.trim() !== "Section completed." && (
            <div>
              <p className="text-[12px] text-ink-3">Your unsent text, to copy if you need it:</p>
              <p className="mt-1 rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] whitespace-pre-line text-ink select-all">{text}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ThreadEntry({ c, op, m, meId }: { c: CiqCase; op: OpenPoint; m: Message; meId: string }) {
  const { state } = useStore();
  const u = userById(state, m.by);
  const doc = m.documentId ? c.documents.find((d) => d.id === m.documentId) : undefined;
  const supplierSide = m.side === "supplier";
  const edits = m.action === "edited" ? editsOf(op, m) : [];
  const lines = edits.map((e) => editLine(e, op, (id) => userName(state, id))).filter((x): x is string => !!x);
  // The supplier reads the raiser's changes from the recorded edits; without them (or when only a finding-based reason
  // changed) only that it changed, because the raw text may name the internal finding.
  const body = m.action !== "edited" ? m.text : lines.length ? lines.join("\n") : !edits.length && supplierJustification(op) ? m.text : "Beiersdorf updated this question.";
  const verb = m.action === "edited" && edits.length && !edits.some((e) => e.field === "question") ? "updated the question" : SUPPLIER_MESSAGE_TEXT[m.action];
  return (
    <li className="flex gap-2.5" data-testid={`thread-${m.id}`} data-action={m.action}>
      <Avatar initials={u?.initials ?? "BD"} side={m.side} size={26} />
      <div className={cx("min-w-0 flex-1 rounded-lg px-3 py-2", supplierSide ? "bg-violet-soft" : "border border-line bg-surface", (m.action === "edited" || m.action === "withdrawn") && "border-dashed")}>
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-[12.5px]">
          <span className="font-semibold text-ink">
            {supplierSide ? userName(state, m.by) : `${u?.name ?? "Beiersdorf"}`}
            {supplierSide && m.by === meId ? " (you)" : ""}
          </span>
          {!supplierSide && <span className="text-ink-3">Beiersdorf</span>}
          <span className="text-ink-3">{verb}</span>
          <span className="ml-auto text-[11.5px] text-ink-3">{fmtDateTime(m.at)}</span>
        </div>
        {body && (
          <p className={cx("mt-1 text-[13px] whitespace-pre-line", m.action === "cannot-provide" ? "text-ink" : "text-ink-2")}>
            {m.action === "cannot-provide" && <span className="mr-1 font-medium text-ink">Cannot provide:</span>}
            {body}
          </p>
        )}
        {doc && (
          <span className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[12px] text-ink-2">
            <Paperclip size={12} /> {docRef(doc)}
            <span className="text-ink-3">· stored at {op.ref.label}</span>
          </span>
        )}
      </div>
    </li>
  );
}

const MODES: { value: Mode; label: string }[] = [
  { value: "answer", label: "Write an answer" },
  { value: "upload", label: "Upload a document" },
  { value: "cannot", label: "We cannot provide this" },
];

/** Segmented control for the three response modes. Full width and allowed to wrap, so the labels never
 *  clip in a narrow drawer (the kit's Segmented has a fixed height). Same look as the kit control. */
function ModePicker({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div role="group" aria-label="Response type" className="grid w-full grid-cols-3 gap-0.5 rounded-lg border border-line-strong bg-surface-2 p-0.5 sm:inline-flex sm:w-auto">
      {MODES.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          data-testid={`answer-mode-${o.value}`}
          className={cx("min-h-8 rounded-md px-2.5 py-1 text-[13px] leading-tight font-medium transition-colors sm:px-3", value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
