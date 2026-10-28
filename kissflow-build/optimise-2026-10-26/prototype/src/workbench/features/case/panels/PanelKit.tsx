// Building blocks of the case step panels (§8.5): the panel frame, local edit state, the outcome area (client
// problems, WriteOutcome, the K-WB fallback incl. a stored sheet after a reload) and the action buttons.
// Every panel renders exactly ONE StepForm, which carries the `wb-step-<IRSTEP>` test id.
import { Send, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Card, CardHeader } from "@/components/ui/primitives";
import { useWorkbenchContext } from "../../../data/hooks";
import type { Actions } from "../../../data/actions";
import type { CaseVM, Check, Patch, Problem, SaveResult, SubmitResult, TaskRef } from "../../../data/viewModels";
import { KwbFallback } from "../../../ui/KwbFallback";
import { WriteOutcome } from "../../../ui/WriteOutcome";
import type { StepIr } from "../../../schema";

export function PanelCard({ step, title, subtitle, children, action }: { step: StepIr; title: ReactNode; subtitle?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Card data-testid={`wb-panel-${step}`}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className="space-y-5 p-4">{children}</div>
    </Card>
  );
}

export function SubBlock({ title, hint, children, testId }: { title: ReactNode; hint?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-line p-3.5" data-testid={testId}>
      <div>
        <h4 className="text-[13.5px] font-semibold text-ink">{title}</h4>
        {hint && <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function ProblemsBanner({ problems, title = "Not sent: fix these first." }: { problems: Problem[]; title?: string }) {
  if (!problems.length) return null;
  return (
    <div role="alert" data-testid="wb-step-problems" className="rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-[13.5px] text-ink">
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {problems.map((p, i) => (
          <li key={i}>{p.message}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Local edit state over the case's read values. Only fields the user changed ("dirty") go into a patch. Keys that
 * start with "__" are panel-only inputs (e.g. a typed supplier time) that never come from the server read. After a
 * successful save, or after a K-WB fallback Re-read passes (the values were saved in the Kissflow form), the panel
 * calls clean(): a following Submit then sends no second write.
 */
export function usePanelValues(c: CaseVM, init: { values?: Record<string, unknown>; dirty?: string[] } = {}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...c.v, ...(init.values ?? {}) }));
  const [dirty, setDirty] = useState<string[]>(() => init.dirty ?? []);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    // a reload (after a save) brings server values; unsaved edits and panel-only inputs stay
    setValues((v) => {
      const next: Record<string, unknown> = { ...c.v };
      for (const [k, x] of Object.entries(v)) if (k.startsWith("__") || dirtyRef.current.includes(k)) next[k] = x;
      return next;
    });
  }, [c.v]);
  const set = useCallback((k: string, v: unknown) => {
    setValues((p) => ({ ...p, [k]: v }));
    setDirty((d) => (d.includes(k) ? d : [...d, k]));
  }, []);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  /** The changed SERVER fields (minus the panel's own and the "__" inputs), as a patch's fields. */
  const changed = useCallback(
    (exclude: string[] = []) =>
      Object.fromEntries(
        dirtyRef.current.filter((k) => !k.startsWith("__") && !exclude.includes(k)).map((k) => [k, valuesRef.current[k]]),
      ),
    [],
  );
  const isDirty = useCallback((k: string) => dirtyRef.current.includes(k), []);
  const clean = useCallback(() => setDirty([]), []);
  return { values, set, dirty, changed, isDirty, clean };
}

export const hasWrites = (p: Patch) => Object.keys(p.fields).length > 0 || Object.values(p.tables ?? {}).some((x) => x?.length);

export type PanelResult = SaveResult | SubmitResult | null;

/** Save (if there is anything to save) and then submit; stops at a failed save. */
export async function saveThenSubmit(actions: Pick<Actions, "saveAtStep" | "submitStep">, task: TaskRef, patch: Patch, o: { extraChecks?: Check[]; comment?: string } = {}): Promise<{ save?: SaveResult; submit?: SubmitResult; shown: PanelResult }> {
  let save: SaveResult | undefined;
  if (hasWrites(patch)) {
    save = await actions.saveAtStep(task, patch);
    if (!save.ok) return { save, shown: save };
  }
  const submit = await actions.submitStep(task, o);
  return { save, submit, shown: submit };
}

/**
 * The outcome area: client problems, or the last result (WriteOutcome), or the K-WB fallback. A sheet stored before a
 * reload reopens on its own (§7.4). `onResolved` runs after a passing Re-read; the fallback panel then STAYS (with its
 * Re-read answer) until the next action replaces the result.
 */
export function PanelOutcome({ task, c, problems, result, onResolved, okMessage, showStored = true }: { task: TaskRef; c: CaseVM; problems?: Problem[]; result: PanelResult; onResolved?(): void; okMessage?: string; showStored?: boolean }) {
  const { pending } = useWorkbenchContext();
  const [, force] = useState(0);
  const hasSheet = !!pending.load(task.key);
  const [sticky, setSticky] = useState(hasSheet);
  useEffect(() => {
    if (hasSheet) setSticky(true);
  }, [hasSheet]);
  useEffect(() => {
    if (result) setSticky(false);
  }, [result]);
  const resolved = (r: { matches: boolean; submittedElsewhere: boolean }) => {
    force((n) => n + 1);
    if (r.matches || r.submittedElsewhere) onResolved?.();
  };
  if (problems?.length) return <ProblemsBanner problems={problems} />;
  if (result && !result.ok && result.kind === "kwb-refused") return <KwbFallback task={task} caseCode={c.caseCode} onResolved={resolved} />;
  return (
    <div className="space-y-3">
      <WriteOutcome result={result} task={task} caseCode={c.caseCode} okMessage={okMessage} />
      {showStored && (hasSheet || sticky) && <KwbFallback task={task} caseCode={c.caseCode} onResolved={resolved} />}
    </div>
  );
}

export function PanelButtons({ busy, onSave, onSubmit, saveLabel = "Save", submitLabel = "Submit step", children, saveDisabled }: { busy: boolean; onSave?: () => void; onSubmit?: () => void; saveLabel?: string; submitLabel?: string; children?: ReactNode; saveDisabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
      {children}
      <span className="flex-1" />
      {onSave && (
        <Button icon={<Save size={15} />} disabled={busy || saveDisabled} onClick={onSave} data-testid="wb-step-save">
          {saveLabel}
        </Button>
      )}
      {onSubmit && (
        <Button variant="primary" icon={<Send size={15} />} disabled={busy} onClick={onSubmit} data-testid="wb-step-submit">
          {busy ? "Working…" : submitLabel}
        </Button>
      )}
    </div>
  );
}

/** Runs an async action with a busy flag (one at a time per panel). */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
