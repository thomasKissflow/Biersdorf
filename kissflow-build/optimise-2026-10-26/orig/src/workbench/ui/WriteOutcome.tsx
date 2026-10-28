// Renders the result of a save or submit in the fixed way of §7.2:
//   ok → a toast after the read-back (never before) · not-kept → red banner naming the fields · kwb-refused → the
//   KwbFallback panel · refused → red banner with Kissflow's message and the field labels · timeout → the uncertain
//   state with Re-read · problems → the list by field label (wb-step-problems).
import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { fieldLabel, type FlowId } from "../schema";
import { useWorkbenchContext } from "../data/hooks";
import type { SaveResult, SubmitResult, TaskRef } from "../data/viewModels";
import { KwbFallback } from "./KwbFallback";

function Banner({ tone, children, testId }: { tone: "bad" | "warn" | "info"; children: React.ReactNode; testId?: string }) {
  const cls = tone === "bad" ? "border-bad/40 bg-bad-soft" : tone === "warn" ? "border-warn/40 bg-warn-soft" : "border-info/40 bg-info-soft";
  return (
    <div role="alert" data-testid={testId} className={`rounded-lg border px-4 py-3 text-[13.5px] text-ink ${cls}`}>
      {children}
    </div>
  );
}

/**
 * Re-read for an item locked after a timeout (§7.1). The handler never leaves a rejection unhandled (WL-02): an error
 * is shown next to the button, and the mark stays so the user can press again.
 */
export function ReReadUncertain({ flow, itemId, act, testId = "wb-reread-uncertain" }: { flow?: FlowId; itemId?: string; act?: string; testId?: string }) {
  const { actions } = useWorkbenchContext();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (k: string) => (flow ? fieldLabel(flow, k) : k);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        icon={<RefreshCw size={13} />}
        data-testid={testId}
        disabled={busy || !flow || !itemId}
        onClick={async () => {
          if (!flow || !itemId) return;
          setBusy(true);
          try {
            const r = await actions.reReadUncertain(flow, itemId, act);
            const parts: string[] = [];
            if (r.checked && (r.landed.length || r.notLanded.length))
              parts.push(r.notLanded.length ? `Saved: ${r.landed.map(label).join(", ") || "nothing"}. Not saved: ${r.notLanded.map(label).join(", ")}.` : `Saved: ${r.landed.map(label).join(", ")}.`);
            if (r.note) parts.push(r.note);
            parts.push("You can save again.");
            setText(parts.join(" "));
          } catch (e) {
            setText(`Re-read did not work: ${e instanceof Error ? e.message : String(e)}. Try again in a moment.`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Reading…" : "Re-read"}
      </Button>
      {text && (
        <p role="status" data-testid={`${testId}-result`}>
          {text}
        </p>
      )}
    </div>
  );
}

export function WriteOutcome({
  result,
  task,
  flow,
  itemId,
  okMessage,
  caseCode,
  onResolved,
}: {
  result: SaveResult | SubmitResult | null | undefined;
  task?: TaskRef;
  flow?: FlowId;
  itemId?: string;
  okMessage?: string;
  caseCode?: string;
  /** Passed to the KwbFallback of a `kwb-refused` result (CR-T3-admin-3, T5). */
  onResolved?(r: { matches: boolean; submittedElsewhere: boolean }): void;
}) {
  const { notify } = useWorkbenchContext();
  const toasted = useRef<unknown>(null);
  useEffect(() => {
    if (!result || !result.ok || toasted.current === result) return;
    toasted.current = result;
    notify(okMessage ?? (result.kind === "submitted" ? "Sent." : "Saved and checked."), "success");
  }, [result, notify, okMessage]);
  if (!result) return null;
  const f = task?.flow ?? flow;
  const label = (k: string) => (f ? fieldLabel(f, k) : k);
  const reReadButton = <ReReadUncertain flow={f} itemId={task?.instanceId ?? itemId} act={task?.activityInstanceId} />;
  if (result.ok && result.kind === "submitted")
    return (
      <div className="space-y-2">
        {result.notes.map((n, i) => (
          <Banner key={i} tone="info" testId="wb-submit-note">
            {n}
          </Banner>
        ))}
        {result.auditWarning && <Banner tone="warn" testId="wb-submit-audit-warning">{result.auditWarning}</Banner>}
        {!!result.laneDiff?.length && (
          <Banner tone="bad" testId="wb-submit-lane-diff">
            Values of this department review changed after the submit: {result.laneDiff.map(label).join(", ")}. Open the case and check them.
          </Banner>
        )}
      </div>
    );
  if (result.ok) return null;
  switch (result.kind) {
    case "not-kept":
      return (
        <Banner tone="bad" testId="wb-write-notkept">
          Kissflow did not keep: {result.missing.map(label).join(", ")}. {result.message.includes("read") ? result.message : "Someone else may be saving this item. Reload and check."}
        </Banner>
      );
    case "kwb-refused":
      return task ? <KwbFallback task={task} caseCode={caseCode} onResolved={onResolved} /> : <Banner tone="bad">{result.message}</Banner>;
    case "timeout":
      return (
        <Banner tone="bad" testId="wb-write-timeout">
          <p>Kissflow did not answer within 30 s. This item is locked for saving until you press Re-read.</p>
          <div className="mt-2">{reReadButton}</div>
        </Banner>
      );
    case "problems":
      return (
        <Banner tone="bad" testId="wb-step-problems">
          <p className="font-medium">{result.message}</p>
          <ul className="mt-1 list-disc pl-5">
            {result.problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        </Banner>
      );
    case "refused":
      return (
        <Banner tone="bad" testId="wb-write-refused">
          <p>{result.message}</p>
          {"fields" in result && result.fields?.length ? <p className="mt-1">Fields: {result.fields.map(label).join(", ")}</p> : null}
          {"code" in result && result.code === "uncertain" && <div className="mt-2">{reReadButton}</div>}
        </Banner>
      );
    case "uncertain":
      return (
        <Banner tone="bad" testId="wb-write-refused">
          <p>{result.message}</p>
          <div className="mt-2">{reReadButton}</div>
        </Banner>
      );
    default:
      return (
        <Banner tone="bad" testId="wb-write-refused">
          {result.message}
        </Banner>
      );
  }
}
