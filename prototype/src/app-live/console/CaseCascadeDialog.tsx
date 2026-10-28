// The delete of CIQ Cases with everything that belongs to them (27 Oct, Thomas: "say I delete a case in the admin, all
// associated to that also gets deleted, like how it was before"): the drawer's Delete of a case (one case, its code
// typed) and the bulk delete with cases selected (one case after the other, the number of cases typed). It first finds
// what belongs to each case from the session's cached lists (caseDelete.ts planCaseDeletes: a list not read yet is read
// once, the supplier portal searched for the case) and shows it per flow with counts and totals; then deletes one item
// at a time, about RUN_GAP_MS apart, children first and each case LAST, without read-backs (a "not found" answer counts
// as gone). A progress line, Kissflow's rate-limit wait, Stop; a stop, a failure or a lasting 429 says where it is and
// what remains, and "Run again" / "Continue" goes on with the rest (nothing is searched again). Each deleted item leaves
// the session's lists at once (the tables, the overview's counts); nothing is read afterwards. Portal items the app
// can't reach are listed with their ids, to delete in the supplier portal's admin console; the app's items are deleted.
import { AlertTriangle, CheckCircle2, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, Modal, Mono, TextInput } from "@/components/ui";
import { errorText } from "@/portal/kf/sdk";
import { FLOW_OF_PART, PART_LABEL, RUN_GAP_MS, type PlanItem } from "./cascade";
import { caseDeleteBlocked, planCaseDeletes, runCaseDeletes, type CaseDeletePlan, type CaseRunResult, type CaseToDelete } from "./caseDelete";
import { Counts } from "./CaseDeleteDialog";
import { useDataConsole } from "./ConsoleContext";
import { useRateWait } from "./rateSignal";
import { readAtText } from "./session";

type Phase = { at: "finding" } | { at: "error"; error: string } | { at: "plan"; plan: CaseDeletePlan } | { at: "running"; plan: CaseDeletePlan; current: PlanItem } | { at: "result"; plan: CaseDeletePlan; last: CaseRunResult };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const keyOf = (x: PlanItem) => `${x.part}|${x.id}`;

function ItemList({ plan }: { plan: CaseDeletePlan }) {
  return (
    <details className="text-[12.5px]">
      <summary className="cursor-pointer text-ink-3">Every item, in the order it is deleted</summary>
      <ol className="mt-2 space-y-1">
        {plan.items.map((x) => (
          <li key={keyOf(x)} className="grid grid-cols-[150px_1fr] gap-2" data-testid={`case-delete-item-${x.id}`}>
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

/** The portal items the app could not delete from here, by id. */
function PortalLeft({ items, error, planned }: { items: PlanItem[]; error: string; planned: boolean }) {
  return (
    <div role="alert" className="space-y-1.5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-[12.5px] text-ink-2" data-testid="case-delete-portal-left" data-count={items.length}>
      <p>
        <span className="font-medium text-ink">{planned ? "The supplier portal could not be read from here" : "The supplier portal refused the delete"}</span> ({error}).{" "}
        {items.length
          ? `${items.length === 1 ? "This portal item stays" : "These portal items stay"}; delete ${items.length === 1 ? "it" : "them"} in the supplier portal's admin console (Requests, Queries). The app's items are deleted.`
          : "The app names no portal item of the case; check the supplier portal's admin console (Requests, Queries) for any left. The app's items are deleted."}
      </p>
      {items.length > 0 && (
        <ul className="space-y-0.5">
          {items.map((x) => (
            <li key={keyOf(x)} data-testid={`case-delete-portal-${x.id}`}>
              {PART_LABEL[x.part]} <Mono>{x.id}</Mono>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** `confirm`: "code" (one case: its code typed, its id when it has none) or "count" (several: their number typed).
 *  `onClose` gets the ids of the cases deleted. */
export function CaseCascadeDialog({ cases, confirm, onClose }: { cases: CaseToDelete[]; confirm: "code" | "count"; onClose: (deletedCases: string[]) => void }) {
  const { client, session, changed, rate } = useDataConsole();
  const waitSecs = useRateWait(rate);
  const [phase, setPhase] = useState<Phase>({ at: "finding" });
  const [typed, setTyped] = useState("");
  const [stopping, setStopping] = useState(false);
  const stop = useRef(false);
  const live = useRef(0);
  /** Everything deleted by this dialog's runs, in order. */
  const deleted = useRef<PlanItem[]>([]);
  const alreadyGone = useRef(0);
  /** The portal items left, and the portal's refusal. */
  const portalLeft = useRef<PlanItem[]>([]);
  const portalError = useRef<string | undefined>(undefined);
  /** What the next run deletes ("Run again", "Continue"). */
  const [todo, setTodo] = useState<PlanItem[]>([]);

  const find = () => {
    const mine = ++live.current;
    setPhase({ at: "finding" });
    planCaseDeletes(session, cases).then(
      (plan) => {
        if (mine !== live.current) return;
        portalLeft.current = plan.cases.flatMap((c) => c.portal?.remain ?? []);
        portalError.current = plan.portalError;
        setTodo(plan.items);
        setPhase({ at: "plan", plan });
      },
      (e) => mine === live.current && setPhase({ at: "error", error: errorText(e) }),
    );
  };
  useEffect(() => {
    find();
    return () => {
      live.current++;
    };
    // the cases are fixed for the dialog's life (the caller opens a new one for other cases)
  }, []);

  const run = async (plan: CaseDeletePlan, items: PlanItem[]) => {
    const mine = live.current;
    stop.current = false;
    setStopping(false);
    setPhase({ at: "running", plan, current: items[0]! });
    const r = await runCaseDeletes(client, items, {
      stop: () => stop.current,
      onStep: (p) => mine === live.current && setPhase({ at: "running", plan, current: p.current }),
      onDeleted: (x) => {
        deleted.current.push(x);
        const f = FLOW_OF_PART[x.part];
        if (f) session.removeRow(f, x.id); // the tables and the overview's counts, without a read
      },
    });
    if (r.done.length) changed();
    alreadyGone.current += r.gone.length;
    portalLeft.current.push(...r.portalLeft);
    portalError.current ??= r.portalError;
    if (mine !== live.current) return;
    setTodo(r.remaining);
    setPhase({ at: "result", plan, last: r });
  };

  const plan = phase.at === "plan" || phase.at === "running" || phase.at === "result" ? phase.plan : undefined;
  const one = cases.length === 1;
  const first = plan?.cases[0]?.target ?? { id: cases[0]?.id ?? "", code: cases[0]?.code ?? "" };
  const wanted = confirm === "code" ? first.code || first.id : String(cases.length);
  const blocked = plan ? caseDeleteBlocked(plan) : undefined;
  const running = phase.at === "running";
  const deletedCases = () => deleted.current.filter((x) => x.part === "case").map((x) => x.id);
  const close = () => !running && onClose(deletedCases());
  /** Which case an item belongs to (bulk progress). */
  const caseOf = useMemo(() => {
    const m = new Map<string, number>();
    plan?.cases.forEach((c, i) => c.items.forEach((x) => m.set(keyOf(x), i)));
    return m;
  }, [plan]);
  const total = plan?.items.length ?? 0;
  const related = plan ? plan.items.filter((x) => x.part !== "case").length : 0;
  const caseRead = readAtText(session.list("case"));
  const last = phase.at === "result" ? phase.last : undefined;
  const again = todo.length > 0 && last && (last.failed || last.stopped || last.paused);

  return (
    <Modal
      open
      onClose={close}
      dismissible={!running}
      wide
      title={one ? `Delete ${first.code || first.id} and everything that belongs to it` : `Delete ${cases.length} cases and everything that belongs to them`}
      subtitle={one ? <Mono>{first.id}</Mono> : "CIQ Case"}
      data-testid="case-delete-dialog"
      footer={
        phase.at === "plan" ? (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {blocked && plan?.unlisted.length ? (
              <Button variant="primary" onClick={find} data-testid="case-delete-find-again">
                Read the lists again
              </Button>
            ) : (
              <Button variant="danger" icon={<Trash2 size={15} />} disabled={!!blocked || typed.trim() !== wanted} onClick={() => void run(phase.plan, todo)} data-testid="case-delete-go">
                Delete {plural(total, "item")}
              </Button>
            )}
          </>
        ) : running ? (
          <Button variant="ghost" icon={<Square size={14} />} disabled={stopping} onClick={() => ((stop.current = true), setStopping(true))} data-testid="case-delete-stop">
            {stopping ? "Stopping after this one…" : "Stop"}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} data-testid="case-delete-close">
              Close
            </Button>
            {again && (
              <Button variant="primary" onClick={() => void run(plan!, todo)} data-testid="case-delete-again">
                {last?.paused ? `Continue (${todo.length})` : `Run again (${todo.length})`}
              </Button>
            )}
          </>
        )
      }
    >
      {phase.at === "finding" && (
        <p className="text-[13px] text-ink-3" data-testid="case-delete-finding">
          Finding what belongs to {one ? "the case" : "the cases"} in the lists this console read, and in the supplier portal…
        </p>
      )}
      {phase.at === "error" && (
        <p role="alert" className="text-[13px] text-bad" data-testid="case-delete-error">
          {phase.error}
        </p>
      )}
      {phase.at === "plan" && (
        <div className="space-y-4" data-testid="case-delete-plan" data-items={total} data-related={related} data-cases={phase.plan.cases.length}>
          {!blocked || !phase.plan.unlisted.length ? (
            <>
              <p className="text-[13.5px] text-ink-2" data-testid="case-delete-summary">
                {one
                  ? `The case and the ${plural(related, "item")} that belong to it are deleted: ${plural(total, "item")} in all.`
                  : `Each case is deleted with its related items, one case after the other: the ${cases.length} cases and their ${plural(related, "related item")}, ${plural(total, "item")} in all.`}{" "}
                One at a time, about {RUN_GAP_MS} ms apart, the supplier portal's items first and {one ? "the case" : "each case"} last. This cannot be undone here.
              </p>
              <Counts items={phase.plan.items} testId="case-delete-counts" />
              {!one && (
                <ul className="space-y-0.5 text-[12.5px] text-ink-2" data-testid="case-delete-per-case">
                  {phase.plan.cases.map((c) => (
                    <li key={c.target.id} data-testid={`case-delete-case-${c.target.id}`} data-count={c.items.length}>
                      <Mono>{c.target.code || c.target.id}</Mono>: {plural(c.items.length, "item")}
                    </li>
                  ))}
                </ul>
              )}
              <ItemList plan={phase.plan} />
              <p className="text-[12px] text-ink-3" data-testid="case-delete-source">
                Found in the lists this console read{caseRead ? ` (cases: ${caseRead.toLowerCase()})` : ""}{phase.plan.read.length ? `; ${plural(phase.plan.read.length, "list")} read now` : ""}. What the CIQ screens added since is not in them: Refresh the lists first if needed.
              </p>
              {phase.plan.cases.filter((c) => c.sharedCode.length).map((c) => (
                <p key={c.target.id} className="text-[12.5px] text-ink-2" data-testid="case-delete-shared-code">
                  Case item{c.sharedCode.length === 1 ? "" : "s"} {c.sharedCode.join(", ")} hold{c.sharedCode.length === 1 ? "s" : ""} the code {c.target.code} too, so rows that name only the code are left out.
                </p>
              ))}
              {phase.plan.portalError && <PortalLeft items={portalLeft.current} error={phase.plan.portalError} planned />}
            </>
          ) : null}
          {blocked ? (
            <p role="alert" className="flex items-start gap-2 text-[13px] text-bad" data-testid="case-delete-blocked">
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
            <Field label={confirm === "code" ? <>Type <Mono>{wanted}</Mono> to confirm</> : <>Type <Mono>{wanted}</Mono>, the number of cases, to confirm</>}>
              <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" inputMode={confirm === "count" ? "numeric" : undefined} data-testid="case-delete-typed" />
            </Field>
          )}
        </div>
      )}
      {phase.at === "running" && (
        <div className="space-y-2" data-testid="case-delete-progress" data-done={deleted.current.length}>
          {!one && (
            <p className="text-[12.5px] text-ink-3" data-testid="case-delete-progress-case">
              Case {(caseOf.get(keyOf(phase.current)) ?? 0) + 1} of {cases.length}: {phase.plan.cases[caseOf.get(keyOf(phase.current)) ?? 0]?.target.code}
            </p>
          )}
          <p className="text-[13.5px] text-ink" role="status">
            Deleting {Math.min(total, deleted.current.length + 1)} of {total}: {PART_LABEL[phase.current.part]} <Mono>{phase.current.key}</Mono>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-bad transition-[width]" style={{ width: `${Math.round((deleted.current.length / Math.max(1, total)) * 100)}%` }} />
          </div>
          {waitSecs > 0 && (
            <p className="text-[12.5px] text-ink-2" data-testid="case-delete-rate-wait">
              Kissflow is limiting requests: waiting {waitSecs} s, then trying again.
            </p>
          )}
        </div>
      )}
      {phase.at === "result" && last && (
        <div
          className="space-y-3"
          data-testid="case-delete-result"
          data-outcome={last.paused ? "paused" : last.failed ? "failed" : last.stopped ? "stopped" : "done"}
          data-done={deleted.current.length}
          data-gone={alreadyGone.current}
          data-remaining={todo.length}
          data-portal-left={portalLeft.current.length}
        >
          {last.paused ? (
            <p role="alert" className="flex items-start gap-2 text-[13px] text-bad" data-testid="case-delete-paused">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                {last.paused} {plural(todo.length, "item")} not deleted yet.
              </span>
            </p>
          ) : last.failed ? (
            <p role="alert" className="flex items-start gap-2 text-[13px] text-bad" data-testid="case-delete-failed">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                Stopped at {PART_LABEL[last.failed.item.part]} {last.failed.item.key} (<Mono>{last.failed.item.id}</Mono>): {last.failed.why}
              </span>
            </p>
          ) : last.stopped ? (
            <p role="status" className="text-[13px] text-ink-2">
              Stopped.
            </p>
          ) : (
            <p role="status" className="flex items-center gap-2 text-[13px] text-ok">
              <CheckCircle2 size={15} className="shrink-0" />
              {portalLeft.current.length
                ? one
                  ? "The case and its items in CIQ Digital are deleted; the supplier portal's are listed below."
                  : `The ${cases.length} cases and their items in CIQ Digital are deleted; the supplier portal's are listed below.`
                : one
                  ? "The case and everything that belongs to it are deleted."
                  : `The ${cases.length} cases and everything that belongs to them are deleted.`}
            </p>
          )}
          <p className="text-[13px] text-ink-2">
            {plural(deleted.current.length, "item")} deleted{alreadyGone.current ? ` (${alreadyGone.current} of them were gone already)` : ""}.
            {todo.length > 0 && <> {plural(todo.length, "item is", "items are")} still there{todo.some((x) => x.part === "case") ? ", the case item too, so the case stays findable" : ""}.</>}
          </p>
          {todo.length > 0 && <Counts items={todo} testId="case-delete-remaining" />}
          {portalError.current && (portalLeft.current.length > 0 || plan?.portalError) && <PortalLeft items={portalLeft.current} error={portalError.current} planned={!!plan?.portalError} />}
        </div>
      )}
    </Modal>
  );
}
