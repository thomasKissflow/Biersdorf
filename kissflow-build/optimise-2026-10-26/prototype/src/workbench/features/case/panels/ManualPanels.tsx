// The manual supplier-step panels (§8.5; WB-10 "manual record"; Y1/Y4/Y5 fallbacks). RMM records by hand what the
// supplier did; nothing is sent to anyone and no hand-off is claimed. Supplier timestamps are TYPED ("Supplier
// confirmed at", "Supplier released at"), prefilled with now and editable (WB-D12), written without ms.
// Save writes only what changed; Submit saves what is still unsaved, then submits. After a K-WB fallback Re-read
// passes (the values were saved in the Kissflow form), nothing is written again.
import { useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { Checkbox, Field, TextArea, TextInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { useWorkbench } from "../../../data/hooks";
import { toLocalInput } from "../../../data/normalize";
import type { CaseVM, Check, Patch, Problem, TaskVM } from "../../../data/viewModels";
import { ManualRecordNote } from "../../../ui/ManualRecordNote";
import { StepForm } from "../../../ui/StepForm";
import { DEPTS, type Dept } from "../../../schema";
import { DEPT_LABEL } from "../../../domain/labels";
import { DEPT_FLAG_FIELDS, deptAddedEvent, runS7, s3AddableDepts, s3DeptAdditions, s3Patch, s7Patch, s7Problems } from "../stepLogic";
import { CountsBlock } from "./CountsBlock";
import { hasWrites, PanelButtons, PanelCard, PanelOutcome, saveThenSubmit, SubBlock, useBusy, usePanelValues, type PanelResult } from "./PanelKit";

const localOf = (v: unknown, fallback: Date) => {
  const d = typeof v === "string" && v ? new Date(v) : fallback;
  return toLocalInput(isNaN(d.getTime()) ? fallback : d);
};
const errorResult = (e: unknown): PanelResult => ({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });

/** Shared save/submit wiring of a panel whose patch comes from `build()` (null = client problems shown). `before` runs
 *  after build and before the save (e.g. an F8 row that must exist first); a message stops the save. */
function usePanelRun(task: TaskVM, build: () => Patch | null, clean: () => void, extraChecks: Check[] = [], before?: (p: Patch) => Promise<string | null>) {
  const { actions, notify } = useWorkbench();
  const [result, setResult] = useState<PanelResult>(null);
  const { busy, run } = useBusy();
  const save = () =>
    run(async () => {
      const p = build();
      if (!p) return;
      if (!hasWrites(p)) {
        notify("Nothing changed since the last save.", "info");
        return;
      }
      try {
        const stop = before ? await before(p) : null;
        if (stop) {
          setResult({ ok: false, kind: "refused", message: stop });
          return;
        }
        const r = await actions.saveAtStep(task, p);
        setResult(r);
        if (r.ok) clean();
      } catch (e) {
        setResult(errorResult(e));
      }
    });
  const submit = () =>
    run(async () => {
      const p = build();
      if (!p) return;
      try {
        const stop = before && hasWrites(p) ? await before(p) : null;
        if (stop) {
          setResult({ ok: false, kind: "refused", message: stop });
          return;
        }
        const r = await saveThenSubmit(actions, task, p, { extraChecks });
        if (r.save?.ok) clean();
        setResult(r.shown);
      } catch (e) {
        setResult(errorResult(e));
      }
    });
  return { result, setResult, busy, save, submit };
}

// ---------------------------------------------------------------- CASE_S1 (Y1 fallback)

export function S1Panel({ task, c, onChanged }: { task: TaskVM; c: CaseVM; onChanged(): void }) {
  const { me } = useWorkbench();
  const pv = usePanelValues(c);
  const own = ["Basic_Data_Received", "Portal_Request_Item_Id"];
  const build = (): Patch => ({ fields: { ...pv.changed(["Portal_Request_Item_Id"]) } });
  const r = usePanelRun(task, build, pv.clean);
  return (
    <PanelCard step="CASE_S1" title="Supplier sent the basic data (manual record)" subtitle={task.stepName ?? undefined}>
      <ManualRecordNote>Supplier hand-offs are not connected yet. Check the supplier's basic data in the portal (or as received by hand) and record it here. The portal request id stays blank.</ManualRecordNote>
      <Field label="Basic data received" required hint="Manual record: set Yes once the supplier's basic data is in.">
        <div data-testid="wb-field-Basic_Data_Received" className="max-w-xs">
          <Select value={String(pv.values.Basic_Data_Received ?? "")} onChange={(e) => pv.set("Basic_Data_Received", e.target.value)} aria-label="Basic data received">
            <option value="">Select…</option>
            <option value="Yes">Yes</option>
          </Select>
        </div>
      </Field>
      <SubBlock title="Supplier contacts (optional)" hint="Change these only if the supplier's contacts changed. Separate several ids with commas.">
        <details className="rounded-lg border border-line px-3 py-2" data-testid="wb-s1-contact-details">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-2">Edit the contact lists</summary>
          <div className="mt-3">
            <StepForm step="CASE_S1" values={pv.values} onChange={pv.set} held exclude={own} me={me} />
          </div>
        </details>
      </SubBlock>
      <PanelOutcome
        task={task}
        c={c}
        result={r.result}
        onResolved={() => {
          pv.clean();
          onChanged();
        }}
      />
      <PanelButtons busy={r.busy} onSave={r.save} onSubmit={r.submit} />
    </PanelCard>
  );
}

// ---------------------------------------------------------------- CASE_S3 (Y4 fallback)

export function S3Panel({ task, c, onChanged }: { task: TaskVM; c: CaseVM; onChanged(): void }) {
  const { me, actions } = useWorkbench();
  const pv = usePanelValues(c, { values: { __confirmedAt: localOf(c.v.Completeness_At, new Date()) }, dirty: c.v.Completeness_At ? [] : ["__confirmedAt"] });
  const [problems, setProblems] = useState<Problem[]>([]);
  const [addDepts, setAddDepts] = useState<Dept[]>([]);
  const [deptReason, setDeptReason] = useState("");
  /** The additions already recorded in the audit log (no second F8 row for the same set on Save → Submit). */
  const [recorded, setRecorded] = useState<string | null>(null);
  const own = ["Completeness_At", "RMES_Created_At", ...DEPT_FLAG_FIELDS];
  const addable = s3AddableDepts(c);
  const build = (): Patch | null => {
    setProblems([]);
    const add = s3DeptAdditions(c, addDepts, deptReason);
    if (add.problems.length) {
      setProblems(add.problems);
      return null;
    }
    const others = { ...pv.changed(own), ...add.fields };
    if (!pv.isDirty("__confirmedAt")) return { fields: others };
    try {
      return s3Patch(String(pv.values.__confirmedAt ?? ""), others);
    } catch (e) {
      setProblems([{ field: "Completeness_At", label: "Supplier confirmed at", message: e instanceof Error ? e.message : String(e) }]);
      return null;
    }
  };
  // F4: the reason for an added department is recorded in the audit log FIRST; without it no flag is written
  const before = async (): Promise<string | null> => {
    const add = s3DeptAdditions(c, addDepts, deptReason);
    const sig = `${add.added.join(",")}|${deptReason.trim()}`;
    if (!add.added.length || recorded === sig) return null;
    try {
      await actions.writeAudit(deptAddedEvent(c, add.added, deptReason));
      setRecorded(sig);
      return null;
    } catch (e) {
      return `The reason for the added departments could not be recorded, so nothing was saved (${e instanceof Error ? e.message : String(e)}).`;
    }
  };
  const r = usePanelRun(task, build, () => {
    pv.clean();
    setAddDepts([]);
    setDeptReason("");
  }, [], before);
  return (
    <PanelCard step="CASE_S3" title="Supplier confirmed completeness (manual record)" subtitle={task.stepName ?? undefined}>
      <ManualRecordNote>Supplier hand-offs are not connected yet. Record when the supplier confirmed completeness. The same time is used as the RMES start.</ManualRecordNote>
      <Field label="Supplier confirmed at" required hint="Manual record: when the supplier confirmed, not when you type it. Saved to Completeness at and RMES created at.">
        <div data-testid="wb-s3-confirmed-at" className="max-w-xs">
          <TextInput type="datetime-local" value={String(pv.values.__confirmedAt ?? "")} onChange={(e) => pv.set("__confirmedAt", e.target.value)} aria-label="Supplier confirmed at" />
        </div>
      </Field>
      <SubBlock title="Add a department to the review (optional)" hint="The review scope can still grow while the supplier completes the questionnaire. It is never reduced: a department already in review stays in." testId="wb-s3-depts">
        <div className="flex flex-wrap gap-2 text-[13px]">
          {DEPTS.filter((d) => !addable.includes(d)).map((d) => (
            <Badge key={d} tone="ok" dot>
              {DEPT_LABEL[d]}: in review
            </Badge>
          ))}
        </div>
        {addable.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {addable.map((d) => (
              <span key={d} data-testid={`wb-s3-add-${d}`}>
                <Checkbox checked={addDepts.includes(d)} onChange={(on) => setAddDepts((x) => (on ? [...x, d] : x.filter((y) => y !== d)))} label={`Add ${DEPT_LABEL[d]}`} />
              </span>
            ))}
          </div>
        )}
        {addDepts.length > 0 && (
          <Field label="Reason for the added departments" required hint="Recorded in the audit log before the departments are added.">
            <TextArea rows={2} value={deptReason} onChange={(e) => setDeptReason(e.target.value)} data-testid="wb-s3-dept-reason" />
          </Field>
        )}
      </SubBlock>
      <SubBlock title="As received from the supplier (optional)">
        <StepForm step="CASE_S3" values={pv.values} onChange={pv.set} held exclude={own} me={me} />
      </SubBlock>
      <PanelOutcome
        task={task}
        c={c}
        problems={problems}
        result={r.result}
        onResolved={() => {
          pv.clean();
          onChanged();
        }}
      />
      <PanelButtons busy={r.busy} onSave={r.save} onSubmit={r.submit} />
    </PanelCard>
  );
}

// ---------------------------------------------------------------- CASE_S7 (Y5 fallback)

const DEFAULT_REASON = "supplier release recorded by hand";

export function S7Panel({ task, c, onChanged }: { task: TaskVM; c: CaseVM; onChanged(): void }) {
  const { actions, me, notify } = useWorkbench();
  const trig = String(c.v.Completion_Trigger ?? "");
  const pv = usePanelValues(c, {
    values: { __releasedAt: localOf(c.v.Final_Release_At, new Date()), __reason: trig.startsWith("Manual by RMM: ") ? trig.slice("Manual by RMM: ".length) : DEFAULT_REASON },
    dirty: c.v.Final_Release_At && trig.startsWith("Manual by RMM: ") ? [] : ["__releasedAt", "__reason"],
  });
  const [refreshed, setRefreshed] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [result, setResult] = useState<PanelResult>(null);
  const { busy, run } = useBusy();
  const own = ["Final_Release_At", "Completion_Trigger", "Open_Items_Count", "Open_CR_Count"];
  const input = () => ({ releasedAt: String(pv.values.__releasedAt ?? ""), reason: String(pv.values.__reason ?? ""), others: pv.changed(own) });
  const unsaved = () => pv.dirty.length > 0;
  const save = () =>
    run(async () => {
      const ps = s7Problems(input());
      setProblems(ps);
      if (ps.length) return;
      if (!unsaved()) {
        notify("Nothing changed since the last save.", "info");
        return;
      }
      try {
        const r = await actions.saveAtStep(task, s7Patch(input()));
        setResult(r);
        if (r.ok) pv.clean();
      } catch (e) {
        setResult(errorResult(e));
      }
    });
  const submit = () =>
    run(async () => {
      try {
        const r = await runS7(actions, task, c, input(), { refreshed, saved: !unsaved() });
        setProblems(r.problems ?? []);
        if (r.refresh?.ok) {
          setRefreshed(true);
          setCleared(r.refresh.action === "cleared");
        }
        if (r.save?.ok) pv.clean();
        setResult(r.stage === "submit" ? (r.submit ?? null) : r.stage === "save" ? (r.save ?? null) : r.stage === "counts" ? (r.refresh ?? null) : null);
      } catch (e) {
        setResult(errorResult(e));
      }
    });
  return (
    <PanelCard step="CASE_S7" title="Supplier released (manual record)" subtitle={task.stepName ?? undefined}>
      <ManualRecordNote>Supplier hand-offs are not connected yet. Record when the supplier released the final answers (PS-11). Nothing is produced or sent from here.</ManualRecordNote>
      <CountsBlock
        task={task}
        c={c}
        onRefreshed={(r) => {
          setProblems([]);
          setRefreshed(true);
          setCleared(r.action === "cleared");
        }}
        onResult={(r) => {
          setProblems([]);
          setResult(r);
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier released at" required hint="Manual record: when the supplier released, not when you type it.">
          <div data-testid="wb-s7-released-at">
            <TextInput type="datetime-local" value={String(pv.values.__releasedAt ?? "")} onChange={(e) => pv.set("__releasedAt", e.target.value)} aria-label="Supplier released at" />
          </div>
        </Field>
        <Field label="Reason for the manual completion" required hint={'Saved as Completion trigger "Manual by RMM: <reason>".'}>
          <div data-testid="wb-s7-reason">
            <TextInput value={String(pv.values.__reason ?? "")} onChange={(e) => pv.set("__reason", e.target.value)} aria-label="Reason for the manual completion" />
          </div>
        </Field>
      </div>
      <SubBlock title="As received from the supplier (optional)">
        <StepForm step="CASE_S7" values={pv.values} onChange={pv.set} held exclude={own} me={me} />
      </SubBlock>
      {cleared && (
        <p role="status" className="rounded-lg border border-info/40 bg-info-soft px-4 py-2.5 text-[13px] text-ink" data-testid="wb-s7-cleared">
          Counts could not be confirmed with your access; they were cleared, so the close check will run.
        </p>
      )}
      <PanelOutcome
        task={task}
        c={c}
        problems={problems}
        result={result}
        onResolved={() => {
          // the pending values (counts or the manual record) were saved in the Kissflow form
          if (result && !result.ok && result.kind === "kwb-refused" && result.pending.fields && ("Open_Items_Count" in result.pending.fields || "Open_CR_Count" in result.pending.fields)) setRefreshed(true);
          else pv.clean();
          onChanged();
        }}
      />
      <PanelButtons busy={busy} onSave={save} onSubmit={submit} submitLabel={refreshed ? "Submit step" : "Refresh counts and submit"} />
    </PanelCard>
  );
}
