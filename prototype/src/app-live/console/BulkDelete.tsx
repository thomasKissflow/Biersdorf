// "Delete selected (N)" on a flow's table (26 Oct, for clearing test data without hitting Kissflow's rate limit): the
// chosen items, deleted strictly one at a time, BULK_GAP_MS apart, each with ONE call (remove.ts runBulkDelete). A
// progress line and Stop while it runs; each deleted item leaves the table at once; a refusal is listed and the run goes
// on; a call still rate-limited after the console client's backoff pauses the run with the plain text, and Continue
// goes on from there. Process items: the number of items typed first.
// 27 Oct: with CIQ Cases selected, each case is deleted WITH everything that belongs to it, one case after the other,
// paced (CaseCascadeDialog, caseDelete.ts); the confirmation says so, with the totals. Other flows stay plain.
import { AlertTriangle, CheckCircle2, Square, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Field, Modal, Mono, TextInput } from "@/components/ui";
import { str } from "@/portal/data/raw";
import type { FlowKey } from "../types";
import { CaseCascadeDialog } from "./CaseCascadeDialog";
import { FLOW_LABEL, isProcess } from "./common";
import { useDataConsole } from "./ConsoleContext";
import { useRateWait } from "./rateSignal";
import { deleteProblem, runBulkDelete, type BulkItem, type BulkProgress, type BulkResult } from "./remove";

type Phase = { at: "confirm" } | { at: "running"; p: BulkProgress } | { at: "result"; r: BulkResult };

type BulkProps = { flow: FlowKey; items: BulkItem[]; onClose: (notDeleted: string[]) => void };

/** The bulk delete: CIQ Cases with what belongs to them, any other flow plain. */
export function BulkDeleteDialog(props: BulkProps) {
  return props.flow === "case" ? <CaseBulkDelete {...props} /> : <PlainBulkDelete {...props} />;
}

/** The chosen cases, each with everything that belongs to it (the rows as listed: their code, their portal link). */
function CaseBulkDelete({ items, onClose }: BulkProps) {
  const { session } = useDataConsole();
  const [cases] = useState(() => {
    const rows = new Map((session.list("case").rows ?? []).map((r) => [r._id, r]));
    return items.map((x) => {
      const row = rows.get(x.id);
      return { id: x.id, code: str(row, "Case_Code"), ...(row ? { item: row } : {}) };
    });
  });
  return <CaseCascadeDialog cases={cases} confirm="count" onClose={(deleted) => onClose(items.filter((x) => !deleted.includes(x.id)).map((x) => x.id))} />;
}

function PlainBulkDelete({ flow, items: chosen, onClose }: BulkProps) {
  const { client, session, changed, rate } = useDataConsole();
  // the items as chosen when the dialog opened (the table's selection shrinks as they are deleted)
  const [items] = useState(chosen);
  const waitSecs = useRateWait(rate);
  const proc = isProcess(flow);
  const [phase, setPhase] = useState<Phase>({ at: "confirm" });
  const [typed, setTyped] = useState("");
  const [stopping, setStopping] = useState(false);
  const stop = useRef(false);
  /** Everything deleted by this dialog's runs; `left`: what the last run did not delete (refused, not tried). */
  const deleted = useRef<BulkItem[]>([]);
  const [left, setLeft] = useState<BulkItem[]>(items);
  const noun = proc ? "item" : "row";
  const n = (k: number, one = noun) => `${k} ${k === 1 ? one : `${one}s`}`;

  const run = async (todo: BulkItem[]) => {
    stop.current = false;
    setStopping(false);
    setPhase({ at: "running", p: { done: 0, total: todo.length, current: todo[0] } });
    const r = await runBulkDelete(client, flow, todo, {
      stop: () => stop.current,
      onProgress: (p) => setPhase({ at: "running", p }),
      onDeleted: (x) => {
        deleted.current.push(x);
        session.removeRow(flow, x.id);
      },
    });
    if (r.deleted.length) changed();
    const rest = [...r.failed, ...r.remaining];
    setLeft(rest);
    setPhase({ at: "result", r });
  };
  const close = () => onClose(left.filter((x) => !deleted.current.some((d) => d.id === x.id)).map((x) => x.id));
  const running = phase.at === "running";
  const result = phase.at === "result" ? phase.r : undefined;
  const again = result ? (result.paused ? result.remaining : [...result.failed, ...result.remaining]) : [];

  return (
    <Modal
      open
      onClose={() => !running && close()}
      dismissible={!running}
      wide
      title={`Delete ${n(items.length)}${phase.at === "confirm" ? "?" : ""}`}
      subtitle={FLOW_LABEL[flow]}
      data-testid="bulk-dialog"
      footer={
        phase.at === "confirm" ? (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 size={15} />} disabled={proc && typed.trim() !== String(items.length)} onClick={() => void run(items)} data-testid="bulk-go">
              Delete {n(items.length)}
            </Button>
          </>
        ) : running ? (
          <Button variant="ghost" icon={<Square size={14} />} disabled={stopping} onClick={() => ((stop.current = true), setStopping(true))} data-testid="bulk-stop">
            {stopping ? "Stopping after this one…" : "Stop"}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} data-testid="bulk-close">
              Close
            </Button>
            {again.length > 0 && (
              <Button variant="primary" onClick={() => void run(again)} data-testid="bulk-again">
                {result?.paused ? `Continue (${again.length})` : `Try the ${again.length} again`}
              </Button>
            )}
          </>
        )
      }
    >
      {phase.at === "confirm" && (
        <div className="space-y-3" data-testid="bulk-confirm">
          <p className="text-[13.5px] text-ink-2">
            Each {noun} is deleted on its own{proc ? ", through the admin route, at whatever step it is" : ""}: one at a time, a short pause between two, so Kissflow does not refuse them for too many requests. Nothing else is deleted. This cannot be undone here.
          </p>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-line px-3 py-2 text-[12.5px] text-ink-2" data-testid="bulk-list">
            {items.map((x) => (
              <li key={x.id}>
                <Mono>{x.key}</Mono>
                {x.key !== x.id && <span className="text-ink-3"> · {x.id}</span>}
              </li>
            ))}
          </ul>
          {proc && (
            <Field label={<>Type <Mono>{items.length}</Mono>, the number of items, to confirm</>}>
              <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" inputMode="numeric" data-testid="bulk-typed" />
            </Field>
          )}
        </div>
      )}
      {phase.at === "running" && (
        <div className="space-y-2" data-testid="bulk-progress" data-done={phase.p.done} data-total={phase.p.total}>
          <p className="text-[13.5px] text-ink" role="status">
            {phase.p.current ? (
              <>
                Deleting {phase.p.done + 1} of {phase.p.total}: <Mono>{phase.p.current.key}</Mono>
              </>
            ) : (
              `Deleted ${phase.p.done} of ${phase.p.total}`
            )}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-bad transition-[width]" style={{ width: `${Math.round((phase.p.done / Math.max(1, phase.p.total)) * 100)}%` }} />
          </div>
          {waitSecs > 0 && (
            <p className="text-[12.5px] text-ink-2" data-testid="bulk-rate-wait">
              Kissflow is limiting requests: waiting {waitSecs} s, then trying again.
            </p>
          )}
        </div>
      )}
      {result && (
        <div className="space-y-3" data-testid="bulk-result" data-deleted={deleted.current.length} data-failed={result.failed.length} data-remaining={result.remaining.length} data-outcome={result.paused ? "paused" : result.stopped ? "stopped" : result.failed.length ? "failed" : "done"}>
          {result.paused ? (
            <p role="alert" className="flex items-start gap-2 text-[13px] text-bad" data-testid="bulk-paused">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                {result.paused} {n(result.remaining.length)} not deleted yet.
              </span>
            </p>
          ) : result.stopped ? (
            <p role="status" className="text-[13px] text-ink-2">
              Stopped. {n(result.remaining.length)} not deleted.
            </p>
          ) : !result.failed.length ? (
            <p role="status" className="flex items-center gap-2 text-[13px] text-ok">
              <CheckCircle2 size={15} className="shrink-0" />
              Done.
            </p>
          ) : null}
          <p className="text-[13px] text-ink-2">{n(deleted.current.length)} deleted.</p>
          {result.failed.length > 0 && (
            <div role="alert" className="space-y-1 text-[12.5px]" data-testid="bulk-failed">
              <p className="font-medium text-bad">{n(result.failed.length)} refused:</p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto text-ink-2">
                {result.failed.map((x) => (
                  <li key={x.id}>
                    <Mono>{x.key}</Mono>: {deleteProblem(x.why)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
