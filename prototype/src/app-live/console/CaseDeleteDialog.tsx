// The grouped delete of the Orphans page (26 Oct): "Delete these N items" of an orphan group (Orphans.tsx), for a case
// whose item was deleted alone (in the console between 26 and 27 Oct, or elsewhere). Since 27 Oct the drawer's and the
// bulk delete of a case take everything that belongs to it (CaseCascadeDialog.tsx, without read-backs); this dialog
// stays the Orphans page's. It first finds what still names the deleted case (cascade.ts findCaseItems: the console client's
// reads, 2 at a time) and shows it per flow, with what tied each item to the case; Delete waits for the case's code
// typed (its id when no code is known). The run deletes one item at a time, RUN_GAP_MS apart, children first, each read
// back, and shows its progress with Stop; a stop or a failure says where and why and what is still there, and "Run
// again" finds the rest and finishes it. Portal items the app can't reach are listed with their ids, to delete in the
// supplier portal's admin console. A group whose case item turns out to exist is not deleted here.
import { AlertTriangle, CheckCircle2, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Field, Modal, Mono, TextInput } from "@/components/ui";
import { errorText } from "@/portal/kf/sdk";
import { useDataConsole } from "./ConsoleContext";
import { PART_LABEL, confirmText, countsOf, findCaseItems, planBlocked, runDelete, type CasePlan, type CaseTarget, type PlanItem, type RunResult } from "./cascade";

type Phase = { at: "finding" } | { at: "plan"; plan: CasePlan } | { at: "error"; error: string } | { at: "running"; plan: CasePlan; done: number; current: PlanItem } | { at: "result"; plan: CasePlan; result: RunResult };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function Counts({ items, testId }: { items: PlanItem[]; testId: string }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line" data-testid={testId}>
      {countsOf(items).map(({ part, n }) => (
        <li key={part} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]" data-testid={`${testId}-${part}`} data-count={n}>
          <span className="text-ink">{PART_LABEL[part]}</span>
          <span className="font-medium text-ink tabular-nums">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function ItemList({ items }: { items: PlanItem[] }) {
  return (
    <details className="text-[12.5px]">
      <summary className="cursor-pointer text-ink-3">Every item, in the order it is deleted</summary>
      <ol className="mt-2 space-y-1">
        {items.map((x) => (
          <li key={`${x.part}|${x.id}`} className="grid grid-cols-[150px_1fr] gap-2" data-testid={`cascade-item-${x.id}`}>
            <span className="text-ink-3">{PART_LABEL[x.part]}</span>
            <span className="min-w-0 break-all text-ink-2">
              {x.key !== x.id && <span className="mr-1.5 text-ink">{x.key}</span>}
              <Mono>{x.id}</Mono> <span className="text-ink-3">· by {x.by}</span>
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function PortalRemain({ plan }: { plan: CasePlan }) {
  if (!plan.portal) return null;
  const { error, remain } = plan.portal;
  return (
    <div role="alert" className="space-y-1.5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-[12.5px] text-ink-2" data-testid="cascade-portal-remain" data-count={remain.length}>
      <p>
        <span className="font-medium text-ink">The supplier portal could not be read from here</span> ({error}).{" "}
        {remain.length
          ? "These portal items stay; delete them in the supplier portal's admin console (Requests, Queries):"
          : "The app names no portal item of this case; check the supplier portal's admin console (Requests, Queries) for any left."}
      </p>
      {remain.length > 0 && (
        <ul className="space-y-0.5">
          {remain.map((x) => (
            <li key={x.id}>
              {PART_LABEL[x.part]} <Mono>{x.id}</Mono>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CaseDeleteDialog({ open, target, onClose, onDone }: { open: boolean; target: CaseTarget; onClose: () => void; onDone: (result: RunResult) => void }) {
  const { client, changed } = useDataConsole();
  const [phase, setPhase] = useState<Phase>({ at: "finding" });
  const [typed, setTyped] = useState("");
  const [stopping, setStopping] = useState(false);
  const stop = useRef(false);
  const live = useRef(0);

  const find = () => {
    const mine = ++live.current;
    setPhase({ at: "finding" });
    findCaseItems(client, target).then(
      (plan) => mine === live.current && setPhase({ at: "plan", plan }),
      (e) => mine === live.current && setPhase({ at: "error", error: errorText(e) }),
    );
  };
  useEffect(() => {
    if (!open) return;
    setTyped("");
    find();
    return () => {
      live.current++;
    };
    // find reads the latest client and target; it runs again only when the dialog opens for another case
  }, [open, client, target.id, target.code]);

  const run = async (plan: CasePlan) => {
    const mine = live.current;
    stop.current = false;
    setStopping(false);
    setPhase({ at: "running", plan, done: 0, current: plan.items[0]! });
    let result: RunResult;
    try {
      result = await runDelete(client, plan, { onStep: (done, current) => mine === live.current && setPhase({ at: "running", plan, done, current }), stop: () => stop.current });
    } catch (e) {
      if (mine === live.current) setPhase({ at: "error", error: errorText(e) });
      return;
    }
    if (result.done.length) changed();
    onDone(result);
    if (mine === live.current) setPhase({ at: "result", plan, result });
  };

  const plan = phase.at === "plan" || phase.at === "running" || phase.at === "result" ? phase.plan : undefined;
  const shown = plan?.target ?? target;
  const wanted = confirmText(shown);
  const exists = plan?.caseState === "exists";
  const blocked = plan ? (exists ? "This case item exists, so its rows are no orphans. Delete the case from the Cases table." : planBlocked(plan)) : undefined;
  const running = phase.at === "running";

  return (
    <Modal
      open={open}
      onClose={() => !running && onClose()}
      dismissible={!running}
      wide
      title="Delete the orphans of a deleted case"
      subtitle={
        <>
          {shown.code || "No case code"} · <Mono>{shown.id || "no case item id"}</Mono>
        </>
      }
      data-testid="cascade-dialog"
      footer={
        phase.at === "plan" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 size={15} />} disabled={!!blocked || typed.trim() !== wanted} onClick={() => void run(phase.plan)} data-testid="cascade-go">
              Delete {plural(phase.plan.items.length, "item")}
            </Button>
          </>
        ) : phase.at === "result" && (phase.result.failed || phase.result.stopped) ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={find} data-testid="cascade-again">
              Run again
            </Button>
          </>
        ) : phase.at === "running" ? (
          <Button variant="ghost" icon={<Square size={14} />} disabled={stopping} onClick={() => ((stop.current = true), setStopping(true))} data-testid="cascade-stop">
            {stopping ? "Stopping after this one…" : "Stop"}
          </Button>
        ) : (
          <Button variant="ghost" onClick={onClose} data-testid="cascade-close">
            Close
          </Button>
        )
      }
    >
      {phase.at === "finding" && <p className="text-[13px] text-ink-3" data-testid="cascade-finding">Finding everything that belongs to this case: every process and form of CIQ Digital, and the supplier portal…</p>}
      {phase.at === "error" && (
        <p role="alert" className="text-[13px] text-bad" data-testid="cascade-error">
          {phase.error}
        </p>
      )}
      {phase.at === "plan" && (
        <div className="space-y-4" data-testid="cascade-plan" data-items={phase.plan.items.length} data-case={phase.plan.caseState}>
          <p className="text-[13.5px] text-ink-2">The case item is already deleted; these rows and items still name it, so the CIQ screens still find the case. They are deleted one at a time with a short pause between two, the supplier portal's items first, each read back. This cannot be undone here.</p>
          {phase.plan.items.length > 0 && <Counts items={phase.plan.items} testId="cascade-counts" />}
          {phase.plan.items.length > 0 && <ItemList items={phase.plan.items} />}
          {phase.plan.sharedCode.length > 0 && (
            <p className="text-[12.5px] text-ink-2" data-testid="cascade-shared-code">
              Case item{phase.plan.sharedCode.length === 1 ? "" : "s"} {phase.plan.sharedCode.join(", ")} hold{phase.plan.sharedCode.length === 1 ? "s" : ""} the same code, so rows that name only the code are left out.
            </p>
          )}
          <PortalRemain plan={phase.plan} />
          {blocked ? (
            <p role="alert" className="flex items-start gap-2 text-[13px] text-bad" data-testid="cascade-blocked">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                {blocked}
                {phase.plan.unlisted.map((u) => (
                  <span key={u.part} className="block text-[12.5px] text-ink-2">
                    {PART_LABEL[u.part]}: {u.error}
                  </span>
                ))}
              </span>
            </p>
          ) : (
            <Field label={<>Type <Mono>{wanted}</Mono> to confirm</>}>
              <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="cascade-typed" />
            </Field>
          )}
        </div>
      )}
      {phase.at === "running" && (
        <div className="space-y-2" data-testid="cascade-progress" data-done={phase.done}>
          <p className="text-[13.5px] text-ink">
            Deleting {phase.done + 1} of {phase.plan.items.length}: {PART_LABEL[phase.current.part]} {phase.current.key}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-bad transition-[width]" style={{ width: `${Math.round((phase.done / phase.plan.items.length) * 100)}%` }} />
          </div>
        </div>
      )}
      {phase.at === "result" && (
        <div className="space-y-3" data-testid="cascade-result" data-outcome={phase.result.failed ? "failed" : phase.result.stopped ? "stopped" : "done"} data-done={phase.result.done.length} data-remaining={phase.result.remaining.length}>
          {phase.result.stopped ? (
            <>
              <p role="status" className="text-[13px] text-ink-2">
                Stopped. {plural(phase.result.done.length, "item")} deleted and read back; {plural(phase.result.remaining.length, "item is", "items are")} still there. Run the delete again to finish it.
              </p>
              <Counts items={phase.result.remaining} testId="cascade-remaining" />
            </>
          ) : phase.result.failed ? (
            <>
              <p role="alert" className="flex items-start gap-2 text-[13px] text-bad">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  Stopped at {PART_LABEL[phase.result.failed.item.part]} {phase.result.failed.item.key} (<Mono>{phase.result.failed.item.id}</Mono>): {phase.result.failed.why}
                </span>
              </p>
              <p className="text-[13px] text-ink-2">
                {plural(phase.result.done.length, "item")} deleted and read back. {plural(phase.result.remaining.length, "item is", "items are")} still there
                {phase.result.remaining.some((x) => x.part === "case") ? ", the case item too, so the case stays findable" : ""}. Run the delete again to finish it.
              </p>
              <Counts items={phase.result.remaining} testId="cascade-remaining" />
            </>
          ) : (
            <p role="status" className="flex items-center gap-2 text-[13px] text-ok">
              <CheckCircle2 size={15} className="shrink-0" />
              All {plural(phase.result.done.length, "item")} deleted and read back: Kissflow no longer finds them.
            </p>
          )}
          <PortalRemain plan={phase.plan} />
          {!phase.result.failed && phase.plan.portal && <Badge tone="warn">The portal items above still need deleting in the supplier portal.</Badge>}
        </div>
      )}
    </Modal>
  );
}
