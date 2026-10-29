// Modals that create supplier-facing open points: a query or document request on an exact object and an additional
// section (a department adds a section during the review).
import { Link2, Lock, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLiveFeatures } from "@/components/liveFeatures";
import { Button, Field, Modal, Segmented, Select, TextArea, TextInput } from "@/components/ui";
import { DEPT_SHORT, codeTitle, sectionOf } from "@/domain/catalog";
import { triggerText } from "@/domain/rules";
import { caseContactIds } from "@/domain/mail";
import { check } from "@/domain/permissions";
import { userName } from "@/domain/selectors";
import type { AppState, CiqCase, ReviewDept, SectionDef } from "@/domain/types";
import { useStore } from "@/store/store";
import { activeDeptUsers, joinNames } from "./lib";
import { type AskTarget, fromDateInput, Notice, plusDaysIso, toDateInput, todayInput } from "./shared";

function RefBox({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink">
      <Link2 size={14} className="shrink-0 text-ink-3" />
      <span className="min-w-0 truncate font-medium">{label}</span>
    </div>
  );
}

/** What the supplier sees, and who gets the e-mail (R-1: never internal content). */
function SupplierSees({ state, c }: { state: AppState; c: CiqCase }) {
  const to = caseContactIds(state, c).map((id) => userName(state, id));
  return (
    <div className="space-y-1.5 text-xs text-ink-3">
      <p className="flex items-start gap-1.5">
        <Lock size={12} className="mt-0.5 shrink-0" />
        The supplier sees the reference, the question, the justification and the due date. Internal notes, the RMES and the Safety and Regulatory decisions stay internal.
      </p>
      <p className="flex items-start gap-1.5" data-testid="ask-mail-to">
        <Mail size={12} className="mt-0.5 shrink-0" />
        {to.length ? `E-mail to ${joinNames(to)} (no internal content).` : "No active supplier contact on this case gets an e-mail."}
      </p>
    </div>
  );
}

/** False once the modal is closed: the late answer to a send made before must not close a modal opened since. */
function useOpen() {
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  return open;
}

function DueField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label="Due date" required hint="The supplier sees it on the task." error={error}>
      <TextInput type="date" value={value} min={todayInput()} onChange={(e) => onChange(e.target.value)} invalid={!!error} data-testid="ask-due" />
    </Field>
  );
}

/** Ask the supplier about one exact object: a field, a component row, a document or a whole section. */
export function RaiseQueryModal({ c, dept, target, onClose }: { c: CiqCase; dept: ReviewDept; target: AskTarget; onClose: () => void }) {
  const { state, me, raiseOpenPoint } = useStore();
  const [kind, setKind] = useState<"query" | "document-request">(target.defaultKind ?? "query");
  const [attr, setAttr] = useState("");
  const [question, setQuestion] = useState("");
  const [just, setJust] = useState("");
  const [due, setDue] = useState(toDateInput(plusDaysIso(14)));
  const team = activeDeptUsers(state, dept);
  const [resp, setResp] = useState(team.some((u) => u.id === me.id) ? me.id : (team[0]?.id ?? me.id));
  const [tried, setTried] = useState(false);
  const sent = useRef(false);
  const [sending, setSending] = useState(false);
  const open = useOpen();
  const label = attr ? `${target.ref.label} › ${attr}` : target.ref.label;
  const dueBad = !due || due < todayInput();
  const valid = !!question.trim() && !!just.trim() && !dueBad;
  const denied = c.phase !== "review" ? "Questions to the supplier are raised during the review." : check(state, me.id, "op.raise", c, { dept });

  const submit = () => {
    setTried(true);
    if (!valid || denied || sent.current) return;
    sent.current = true;
    const r = raiseOpenPoint(c.id, { dept, kind, ref: { ...target.ref, label }, question: question.trim(), justification: just.trim(), dueDate: fromDateInput(due), responsibleId: resp });
    // The prototype raises at once; the live app resolves false when the point did not reach Kissflow, and the modal
    // stays open with what was typed, to send again (APP-SAVING-GAPS gap 6).
    setSending(true);
    void Promise.resolve(r).then((ok) => {
      setSending(false);
      if (ok === false) sent.current = false;
      else if (open.current) onClose();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Ask the supplier"
      subtitle={`${c.id} · ${c.materialName} · creates one supplier task`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!!denied || (tried && !valid) || sending} data-testid="ask-send">
            {sending ? "Sending…" : "Send to supplier"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {denied && <Notice tone="warn">{denied}</Notice>}
        <Field label="Reference" hint="The question stays tied to this answer, row or document.">
          <RefBox label={label} />
        </Field>
        {target.attributes && (
          <Field label="About which value?">
            <div data-testid="ask-attribute">
              <Select value={attr} onChange={(e) => setAttr(e.target.value)}>
                <option value="">The whole row</option>
                {target.attributes.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        )}
        <Field label="Type">
          <div data-testid="ask-kind">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: "query", label: "Query" },
                { value: "document-request", label: "Document request" },
              ]}
            />
          </div>
        </Field>
        <Field label="Question to the supplier" required error={tried && !question.trim() ? "Write the question the supplier should answer." : undefined}>
          <TextArea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={kind === "document-request" ? "Which document do you need, and what must it show?" : "What exactly should the supplier confirm or correct?"}
            invalid={tried && !question.trim()}
            data-testid="ask-question"
          />
        </Field>
        <Field label="Business justification" required error={tried && !just.trim() ? "Say why Beiersdorf needs this." : undefined}>
          <TextArea value={just} onChange={(e) => setJust(e.target.value)} placeholder="Why this is needed for the assessment" className="min-h-[60px]" invalid={tried && !just.trim()} data-testid="ask-justification" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <DueField value={due} onChange={setDue} error={tried && dueBad ? "Pick today or a later date." : undefined} />
          <Field label="Responsible at Beiersdorf" required>
            <div data-testid="ask-responsible">
              <Select value={resp} onChange={(e) => setResp(e.target.value)}>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.id === me.id ? " (you)" : ""}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        </div>
        <SupplierSees state={state} c={c} />
      </div>
    </Modal>
  );
}

/** A department adds a section that does not apply yet (REQ-ADR-002): it becomes mandatory and the supplier gets a task.
 *  Where this version can't (the live app refuses it, FE-CLEANUP A4), the window says so and stays open after the
 *  refused click instead of closing as if the section had been added. */
export function ActivateSectionModal({ c, dept, onClose, onDone }: { c: CiqCase; dept: ReviewDept; onClose: () => void; onDone: (sectionId: string) => void }) {
  const { state, extendScope } = useStore();
  const { extendScope: works } = useLiveFeatures();
  // The case's own questionnaire version and rule set (spec §8.1): its sections, and what normally switches them on.
  const options = c.scope
    .filter((s) => s.applicability === "na")
    .map((s) => sectionOf(s.sectionId, c.templateVersion))
    .filter((s): s is SectionDef => !!s && !s.retired);
  const [sectionId, setSectionId] = useState(options[0]?.id ?? "");
  const [just, setJust] = useState("");
  const [tried, setTried] = useState(false);
  const sent = useRef(false);
  const sec = options.find((s) => s.id === sectionId);

  const submit = () => {
    setTried(true);
    if (!sec || !just.trim() || sent.current) return;
    if (!works) return extendScope(c.id, sec.id, just.trim()); // refused with its reason; nothing to show as added
    sent.current = true;
    extendScope(c.id, sec.id, just.trim());
    onDone(sec.id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a section"
      subtitle="For a section that does not apply to this case yet"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {options.length > 0 && (
            <Button variant="primary" onClick={submit} disabled={!sec || (tried && !just.trim())} data-testid="add-section-confirm">
              Add and ask the supplier
            </Button>
          )}
        </>
      }
    >
      {options.length === 0 ? (
        <p className="text-[13px] text-ink-2">Every section of the questionnaire already applies to this case.</p>
      ) : (
        <div className="space-y-4">
          {!works && (
            <Notice tone="warn" testId="add-section-not-available">
              Adding a section to the scope is not available in this version yet.
            </Notice>
          )}
          <Field label="Section">
            <div data-testid="add-section-select">
              <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <optgroup label="Chapters">
                  {options
                    .filter((s) => s.kind !== "annex")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {codeTitle(s.code, s.title)}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Annexes">
                  {options
                    .filter((s) => s.kind === "annex")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {codeTitle(s.code, s.title)}
                      </option>
                    ))}
                </optgroup>
              </Select>
            </div>
          </Field>
          {sec && (
            <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13px]">
              <p className="text-ink">{sec.meaning}</p>
              <p className="mt-1 text-xs text-ink-3">
                Normally added when: {triggerText(sec.id, c.ruleSetVersion)} · Lead: {DEPT_SHORT[state.ownership[sec.id]?.lead ?? sec.lead]}
              </p>
            </div>
          )}
          <Field label="Justification" required hint="Recorded in the case history; the supplier sees it with the task." error={tried && !just.trim() ? "A justification is required to add a section." : undefined}>
            <TextArea value={just} onChange={(e) => setJust(e.target.value)} placeholder="Why this section is needed for this material" invalid={tried && !just.trim()} data-testid="add-section-justification" />
          </Field>
          <Notice tone="info" title="What happens next">
            The section becomes mandatory and is marked as added during the review. The supplier gets a task to complete it, and an open point for {DEPT_SHORT[dept]} blocks your completion until you accept the answer.
          </Notice>
          <SupplierSees state={state} c={c} />
        </div>
      )}
    </Modal>
  );
}
