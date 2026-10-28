// RaisePointDialog (§8.9; BR-046). Final contract (§12.2):
//   RaisePointDialog({ open; onClose; c: CaseVM; preset?: Partial<RaiseInput>; onRaised(id) })
// Kinds from opKindOptions(roles, flags): "Additional part" never for reviewers, for RMM only behind the
// additionalPartRaise flag (off). Responsible_User = me (WB-D2): after K-FA the raiser holds "Waiting for supplier"
// and records the supplier's answer by hand. Start_Gate is computed: never an input; when the server gate is not OK
// after the create, the missing parts are listed and the draft is kept for a second try.
import { Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { Field, Segmented, TextArea, TextInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { listValues } from "../../schema";
import { opKindOptions } from "../../domain/flags";
import { opKey as newOpKey } from "../../domain/keys";
import { DEPT_LABEL } from "../../domain/labels";
import { ActionError } from "../../data/actions";
import { useActions, useWorkbench } from "../../data/hooks";
import { addDays } from "../../data/normalize";
import type { CaseVM, Problem } from "../../data/viewModels";
import { Modal } from "../../ui/overlay";
import { Note } from "../review/kit";
import { createPointWith } from "./createPoint";
import { buildRaiseData, defaultRaisedBy, defaultToSupplier, raiseProblems, REF_KINDS, startGatePreview, type RaiseInput } from "./model";

export interface RaisePointDialogProps {
  open: boolean;
  onClose(): void;
  c: CaseVM;
  preset?: Partial<RaiseInput>;
  onRaised(id: string): void;
}

type Form = Omit<RaiseInput, "toSupplier"> & { toSupplier: boolean | null };

function initialForm(c: CaseVM, myDepts: string[], kinds: string[], preset: Partial<RaiseInput> | undefined, now: Date): Form {
  const opKind = preset?.opKind && kinds.includes(preset.opKind) ? preset.opKind : (kinds[0] ?? "");
  const raisedBy = defaultRaisedBy(myDepts as never, preset);
  return {
    opKind,
    opDept: preset?.opDept ?? raisedBy,
    raisedByDept: raisedBy,
    toSupplier: typeof preset?.toSupplier === "boolean" ? preset.toSupplier : defaultToSupplier(opKind),
    refKind: preset?.refKind ?? (preset?.refSectionKey ? "Section" : "Case"),
    refSectionKey: preset?.refSectionKey ?? "",
    refFieldKey: preset?.refFieldKey ?? "",
    refRowId: preset?.refRowId ?? "",
    refDocFileName: preset?.refDocFileName ?? "",
    refLabel: preset?.refLabel ?? (preset?.refSectionKey ? preset.refSectionKey : c.caseCode),
    refInternalKey: preset?.refInternalKey ?? "",
    kindLabel: preset?.kindLabel ?? "",
    questionText: preset?.questionText ?? "",
    supplierJustification: preset?.supplierJustification ?? "",
    internalJustification: preset?.internalJustification ?? "",
    internalDueDate: preset?.internalDueDate ?? addDays(now, 7),
    supplierDueDate: preset?.supplierDueDate ?? "",
    portalContactIds: preset?.portalContactIds,
    responsibleName: preset?.responsibleName,
    responsibleDeptLabel: preset?.responsibleDeptLabel,
  };
}

export function RaisePointDialog({ open, onClose, c, preset, onRaised }: RaisePointDialogProps) {
  const { me, caps, flagsFor, notify } = useWorkbench();
  const actions = useActions();
  const kinds = useMemo(() => opKindOptions(caps.roles, flagsFor(c)), [caps, flagsFor, c]);
  const myDepts = caps.reviewerDepts;
  const [f, setF] = useState<Form>(() => initialForm(c, myDepts, kinds, preset, new Date()));
  const [touchedSupplier, setTouchedSupplier] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ instanceId: string; activityInstanceId: string } | null>(null);
  const [opKey, setOpKey] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Closing with an unsent draft at Start would lose track of it: ask first (discard, or keep editing).
  const requestClose = () => (draft ? setConfirmClose(true) : onClose());

  useEffect(() => {
    if (!open) return;
    setConfirmClose(false);
    setF(initialForm(c, myDepts, kinds, preset, new Date()));
    setTouchedSupplier(typeof preset?.toSupplier === "boolean");
    setProblems([]);
    setMessage(null);
    setDraft(null);
    setOpKey(undefined);
    // reset only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const onKind = (k: string) => {
    setF((x) => ({ ...x, opKind: k, toSupplier: touchedSupplier ? x.toSupplier : defaultToSupplier(k) }));
  };
  const input = (): RaiseInput => ({ ...f, toSupplier: f.toSupplier as boolean });
  const canRaise = caps.canInitiate("CIQ_Open_Point_A00") && myDepts.length > 0;
  const preview = useMemo(() => {
    if (f.toSupplier !== true) return [];
    try {
      return startGatePreview(buildRaiseData({ ...f, toSupplier: true }, c, me, new Date(), () => 0.5, { opKey: opKey ?? "preview" }));
    } catch {
      return [];
    }
  }, [f, c, me, opKey]);
  const fieldError = (k: string) => problems.find((p) => p.field === k)?.message;

  const raise = async () => {
    const client = raiseProblems({ ...f, toSupplier: f.toSupplier ?? undefined });
    setProblems(client);
    setMessage(null);
    if (client.length) return;
    setBusy(true);
    // one OP_Key per raise: a draft resumed after the Start gate keeps the key of the first attempt
    const key = opKey ?? newOpKey(c.caseCode, c.cycleNo ?? 1, new Date());
    setOpKey(key);
    try {
      const r = await createPointWith(actions, me, input(), c, { draft: draft ?? undefined, opKey: key });
      notify(
        f.toSupplier
          ? `Open point ${r.opKey} raised. It waits at "Waiting for supplier", where the responsible person records the supplier's answer by hand.`
          : `Open point ${r.opKey} raised for the ${DEPT_LABEL[f.opDept as keyof typeof DEPT_LABEL] ?? f.opDept} review.`,
        "success",
      );
      setDraft(null);
      onRaised(r.instanceId);
      onClose();
    } catch (e) {
      if (e instanceof ActionError) {
        setProblems(e.problems);
        setMessage(e.problems.length ? (e.draft ? "Not sent yet." : "Nothing was created.") : e.message);
        if (e.draft) setDraft(e.draft);
      } else setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const discardDraft = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await actions.discardDraft("CIQ_Open_Point_A00", draft.instanceId);
      setDraft(null);
      setProblems([]);
      setMessage("The unsent draft was discarded. Nothing was raised.");
      if (confirmClose) {
        setConfirmClose(false);
        onClose();
      }
    } catch (e) {
      setMessage(`The draft could not be discarded: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const deptOptions = listValues("CIQ_Review_Dept");
  return (
    <Modal
      open={open}
      onClose={requestClose}
      wide
      title="Raise open point"
      subtitle={`${c.caseCode}${c.cycleNo ? ` · cycle ${c.cycleNo}` : ""}${c.tradeName ? ` · ${c.tradeName}` : ""}`}
      footer={
        <>
          {draft && (
            <Button variant="ghost" icon={<Trash2 size={14} />} disabled={busy} onClick={discardDraft} data-testid="wb-point-discard-draft">
              Discard draft
            </Button>
          )}
          <Button onClick={requestClose}>Cancel</Button>
          <Button variant="primary" icon={<Send size={14} />} disabled={busy || !canRaise} onClick={raise} data-testid="wb-point-raise-submit">
            {busy ? "Raising…" : draft ? "Send again" : "Raise point"}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="wb-point-raise">
        {!canRaise && <Note tone="warn">Your roles cannot raise open points.</Note>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" required error={fieldError("OP_Kind")}>
            <div data-testid="wb-point-kind">
              <Select value={f.opKind} onChange={(e) => onKind(e.target.value)} aria-label="Kind">
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Goes to the supplier" required error={fieldError("OP_To_Supplier")} hint={f.opKind === "Contact update" ? "Choose for a contact update." : undefined}>
            <Segmented
              value={f.toSupplier === null ? undefined : f.toSupplier}
              onChange={(v) => {
                setTouchedSupplier(true);
                set("toSupplier", v);
              }}
              options={[
                { value: true, label: "Yes" },
                { value: false, label: "No" },
              ]}
            />
          </Field>
          <Field label="Department that reviews the answer" required error={fieldError("OP_Dept")}>
            <Select value={f.opDept} onChange={(e) => set("opDept", e.target.value)} aria-label="Department">
              {deptOptions.map((d) => (
                <option key={d} value={d}>
                  {DEPT_LABEL[d as keyof typeof DEPT_LABEL] ?? d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Raised by department" required error={fieldError("Raised_By_Dept")}>
            {myDepts.length > 1 ? (
              <Select value={f.raisedByDept} onChange={(e) => set("raisedByDept", e.target.value)} aria-label="Raised by department">
                {myDepts.map((d) => (
                  <option key={d} value={d}>
                    {DEPT_LABEL[d]}
                  </option>
                ))}
              </Select>
            ) : (
              <TextInput value={DEPT_LABEL[f.raisedByDept as keyof typeof DEPT_LABEL] ?? f.raisedByDept} readOnly disabled />
            )}
          </Field>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-line p-3">
          <legend className="px-1 text-[12.5px] font-semibold text-ink-2">Reference</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Reference kind" required error={fieldError("Ref_Kind")}>
              <Select value={f.refKind} onChange={(e) => set("refKind", e.target.value)} aria-label="Reference kind">
                {[...new Set([...REF_KINDS, f.refKind].filter(Boolean))].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Section key" hint={f.toSupplier ? "Needed before a supplier point can be sent." : undefined}>
              <TextInput value={f.refSectionKey ?? ""} onChange={(e) => set("refSectionKey", e.target.value)} data-testid="wb-point-ref-section" />
            </Field>
            <Field label="Field key">
              <TextInput value={f.refFieldKey ?? ""} onChange={(e) => set("refFieldKey", e.target.value)} />
            </Field>
            <Field label="Row id">
              <TextInput value={f.refRowId ?? ""} onChange={(e) => set("refRowId", e.target.value)} />
            </Field>
            <Field label="Document file name">
              <TextInput value={f.refDocFileName ?? ""} onChange={(e) => set("refDocFileName", e.target.value)} />
            </Field>
            <Field label="Label" required error={fieldError("Ref_Label")}>
              <TextInput value={f.refLabel} onChange={(e) => set("refLabel", e.target.value)} data-testid="wb-point-ref-label" />
            </Field>
          </div>
          {f.refInternalKey && <p className="text-[12.5px] text-ink-3">Internal reference: {f.refInternalKey}</p>}
        </fieldset>

        <Field label="Question" required error={fieldError("Question_Text")}>
          <TextArea rows={3} value={f.questionText} onChange={(e) => set("questionText", e.target.value)} data-testid="wb-point-question" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {f.toSupplier && (
            <Field label="Supplier justification" required error={fieldError("Supplier_Justification")} hint="Why the supplier is asked (shown to the supplier once the portal hand-off exists).">
              <TextArea rows={3} value={f.supplierJustification ?? ""} onChange={(e) => set("supplierJustification", e.target.value)} data-testid="wb-point-supplier-justification" />
            </Field>
          )}
          <Field label="Internal justification" required error={fieldError("Internal_Justification")}>
            <TextArea rows={3} value={f.internalJustification} onChange={(e) => set("internalJustification", e.target.value)} data-testid="wb-point-internal-justification" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Internal due date" required error={fieldError("Internal_Due_Date")}>
            <TextInput type="date" value={f.internalDueDate} onChange={(e) => set("internalDueDate", e.target.value)} data-testid="wb-point-internal-due" />
          </Field>
          {f.toSupplier && (
            <Field label="Supplier due date" hint="Needed before a supplier point can be sent.">
              <TextInput type="date" value={f.supplierDueDate ?? ""} onChange={(e) => set("supplierDueDate", e.target.value)} data-testid="wb-point-supplier-due" />
            </Field>
          )}
          <Field label="Kind label" hint="Defaults to the kind.">
            <TextInput value={f.kindLabel ?? ""} placeholder={f.opKind} onChange={(e) => set("kindLabel", e.target.value)} />
          </Field>
        </div>

        <div className="rounded-lg bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
          <p>
            <strong className="font-medium text-ink">Responsible:</strong> you ({me.Name}, {DEPT_LABEL[f.raisedByDept as keyof typeof DEPT_LABEL] ?? f.raisedByDept}).
          </p>
          {f.toSupplier && (
            <p className="mt-1" data-testid="wb-point-responsible-note">
              You will hold the "Waiting for supplier" task and record the supplier's answer by hand. Nothing is sent to the supplier automatically.
            </p>
          )}
          {f.toSupplier && <p className="mt-1">Portal contacts (from the case): {f.portalContactIds ?? c.portalContactIds ? <span className="font-mono text-[12.5px]">{f.portalContactIds ?? c.portalContactIds}</span> : <em>none on the case</em>}</p>}
        </div>

        {preview.length > 0 && !draft && (
          <Note tone="warn" testId="wb-point-startgate-preview">
            The point cannot be sent to the supplier yet: {preview.join("; ")}.
          </Note>
        )}
        {confirmClose && draft && (
          <div role="alert" className="space-y-2 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[13.5px] text-ink" data-testid="wb-point-close-draft">
            <p>This point is still your unsent draft. Discard it before closing, or keep editing.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="danger" disabled={busy} onClick={discardDraft}>
                Discard draft and close
              </Button>
              <Button size="sm" onClick={() => setConfirmClose(false)}>
                Keep editing
              </Button>
            </div>
          </div>
        )}
        {(message || problems.length > 0) && (
          <div role="alert" data-testid="wb-point-startgate" className="rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-[13.5px] text-ink">
            {message && <p className="font-medium">{message}</p>}
            {problems.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {problems.map((p, i) => (
                  <li key={i}>{p.message}</li>
                ))}
              </ul>
            )}
            {draft && <p className="mt-2 text-ink-2">The point is kept as your draft and was not sent. Fix the fields above and press Send again, or discard the draft.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
