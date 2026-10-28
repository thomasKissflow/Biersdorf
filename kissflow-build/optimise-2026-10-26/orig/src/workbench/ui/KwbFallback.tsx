// The K-WB fallback panel (WORKBENCH-DESIGN.md §7.4; D35 dec L484; WB-9). Always the same content, whatever openForm
// does: the values sheet (computed fields never), the My Tasks instruction, an "Open task form" button (never called
// automatically; bounded to 8 s), and Re-read (compare without writing). The sheet survives a reload (pendingSheet).
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { childTableDef, fieldLabel, fieldType, isChildTable, isComputed, type ChildTableId, type FieldType } from "../schema";
import { useWorkbenchContext } from "../data/hooks";
import { isClear, typedValue } from "../data/normalize";
import type { TaskRef } from "../data/viewModels";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A value as the user types it in the Kissflow form: DateTimes in local time without seconds (WL-09; the Re-read
 *  compares them at minute precision). */
const shown = (type: FieldType | undefined, v: unknown): string => (isClear(v) ? "(clear this field)" : typedValue(type, v) || "(blank)");

export function KwbFallback({ task, caseCode, onResolved }: { task: TaskRef; caseCode?: string; onResolved?(r: { matches: boolean; submittedElsewhere: boolean }): void }) {
  const { pending, actions, notify } = useWorkbenchContext();
  const sheet = pending.load(task.key);
  const [formNote, setFormNote] = useState<string | null>(null);
  const [reread, setReread] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const stepName = sheet?.stepName ?? task.stepName ?? "this step";
  const fields = Object.entries(sheet?.fields ?? {}).filter(([k]) => !isComputed(task.flow, k));
  const tables = Object.entries(sheet?.tables ?? {}).filter(([t, ops]) => isChildTable(task.flow, t) && ops?.length);

  return (
    <section data-testid="wb-kwb" className="space-y-3 rounded-xl border border-warn/50 bg-warn-soft p-4 text-[13.5px] text-ink">
      <p className="font-medium">
        {sheet?.note ?? (
          <>
            Kissflow did not let the Workbench save fields at <em>{stepName}</em>. Enter these values in the Kissflow task form, save there, then come back and press <strong>Re-read</strong>.
          </>
        )}
      </p>
      <div data-testid="wb-kwb-sheet" className="space-y-2 rounded-lg border border-line bg-surface p-3">
        {!fields.length && !tables.length && <p className="text-ink-2">No values to enter: only the step action is left.</p>}
        {fields.map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-center gap-2" data-testid={`wb-kwb-value-${k}`}>
            <span className="min-w-48 font-medium">{fieldLabel(task.flow, k)}</span>
            <span className="flex-1 font-mono text-[12.5px] whitespace-pre-wrap">{shown(fieldType(task.flow, k), v)}</span>
            {!isClear(v) && (
              <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={async () => notify((await copy(typedValue(fieldType(task.flow, k), v))) ? "Copied." : "Copy is blocked here: select the text instead.", "info")}>
                Copy
              </Button>
            )}
          </div>
        ))}
        {tables.map(([t, ops]) =>
          (ops ?? []).map((op, i) =>
            op.kind === "delete" ? null : (
              <div key={`${t}-${i}`} className="rounded-md border border-line p-2">
                <p className="mb-1 text-[12px] font-semibold text-ink-2">
                  {childTableDef(t as ChildTableId).name}: {op.kind === "add" ? "add a row" : "change a row"}
                </p>
                {Object.entries(op.row)
                  .filter(([c]) => !c.startsWith("_") && !isComputed(task.flow, c))
                  .map(([c, v]) => (
                    <div key={c} className="flex gap-2 text-[12.5px]">
                      <span className="min-w-44 text-ink-2">{childTableDef(t as ChildTableId).fields[c]?.name ?? c}</span>
                      <span className="font-mono">{shown(childTableDef(t as ChildTableId).fields[c]?.type, v)}</span>
                    </div>
                  ))}
              </div>
            ),
          ),
        )}
      </div>
      <p data-testid="wb-kwb-mytasks" className="text-ink-2">
        If the form does not open, open this task from Kissflow's <strong>My Tasks</strong>: {[caseCode ?? task.caseCode, stepName].filter(Boolean).join(" · ")}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="wb-kwb-openform"
          icon={<ExternalLink size={14} />}
          onClick={async () => {
            setFormNote(null);
            const r = await actions.openTaskForm(task);
            if (r !== "opened") setFormNote(r === "timeout" ? "Kissflow did not open the form within 8 s; use My Tasks." : "Kissflow did not open the form; use My Tasks.");
          }}
        >
          Open task form
        </Button>
        <Button
          data-testid="wb-kwb-reread"
          variant="primary"
          icon={<RefreshCw size={14} />}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await actions.reReadPending(task);
              if (r.submittedElsewhere) setReread({ ok: true, text: sheet?.mode === "values+sendback" ? "Sent back in Kissflow; the Workbench could not check the values with your access." : "Submitted in Kissflow; the Workbench could not check the values with your access." });
              else if (r.matches) setReread({ ok: true, text: "The values are saved. You can submit from here, or in the Kissflow form." });
              else setReread({ ok: false, text: `Not there yet: ${r.missing.map((m) => fieldLabel(task.flow, m)).join(", ")}.` });
              onResolved?.(r);
            } catch (e) {
              setReread({ ok: false, text: e instanceof Error ? e.message : String(e) });
            } finally {
              setBusy(false);
            }
          }}
        >
          Re-read
        </Button>
      </div>
      {formNote && (
        <p data-testid="wb-kwb-openform-note" className="text-ink-2">
          {formNote}
        </p>
      )}
      {reread && (
        <p role="status" data-testid="wb-kwb-reread-result" className={reread.ok ? "text-ok" : "text-bad"}>
          {reread.text}
        </p>
      )}
    </section>
  );
}

/** On load, a task with a stored sheet opens its fallback panel again (§7.4). Renders nothing without a sheet. */
export function StoredKwbFallback({ task, caseCode, onResolved }: { task: TaskRef; caseCode?: string; onResolved?(r: { matches: boolean; submittedElsewhere: boolean }): void }) {
  const { pending } = useWorkbenchContext();
  return pending.load(task.key) ? <KwbFallback task={task} caseCode={caseCode} onResolved={onResolved} /> : null;
}
