// "Refresh counts" at S5, S7 and S8 (§7.9): counts are written only by this button. Complete → written; partial →
// the counts policy (fail-closed: nothing written and exactly what could not be read is listed; attest: an F8
// count.attested row first, then the visible counts); at S7 a partial refresh CLEARS both counts so S8 runs.
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { Field, TextArea } from "@/components/ui/form";
import { fieldLabel, flowName } from "../../../schema";
import { useWorkbench } from "../../../data/hooks";
import type { RefreshResult } from "../../../data/actions";
import type { CaseVM, TaskRef, Unread } from "../../../data/viewModels";
import { WriteOutcome } from "../../../ui/WriteOutcome";
import { COUNTS_CLEARED_NOTE } from "../stepLogic";
import { SubBlock } from "./PanelKit";

/** How a list was read, in plain words (never the read-rung code; F-08). */
export const RUNG_LABEL: Record<string, string> = { "mine+tasks": "only your items and tasks", viewer: "shared list", failed: "not readable", index: "known from the audit log only", item: "item not readable", admin: "complete list", form: "complete list" };
const RUNG = RUNG_LABEL;

export function UnreadList({ unread }: { unread: Unread[] }) {
  if (!unread.length) return null;
  return (
    <ul data-testid="wb-counts-unread" className="space-y-1 rounded-lg border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-ink">
      {unread.map((u, i) => (
        <li key={i}>
          <span className="font-medium">{flowName(u.flow)}</span> ({RUNG[u.rung] ?? u.rung}
          {u.visible !== undefined ? `, ${u.visible} visible` : ""}): {u.reason}
        </li>
      ))}
    </ul>
  );
}

/** `onResult` receives every failed refresh that is not a policy block (K-WB, not kept, timeout, refused), so the panel
 *  shows it in its ONE outcome area (one K-WB panel per page). */
export function CountsBlock({ task, c, onRefreshed, onResult }: { task: TaskRef; c: CaseVM; onRefreshed?(r: RefreshResult): void; onResult?(r: RefreshResult): void }) {
  const { actions, flagsFor } = useWorkbench();
  const policy = flagsFor(c).countsPolicy;
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attest, setAttest] = useState("");
  const run = async (attestation?: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await actions.refreshCaseCounts(task, c, "case", attestation ? { attestation } : undefined);
      setRes(r);
      if (r.ok) onRefreshed?.(r);
      else if (r.action !== "blocked") onResult?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const blocked = res && !res.ok && res.action === "blocked";
  return (
    <SubBlock
      title="Open points and change requests"
      hint={
        task.step === "CASE_S7"
          ? "Counts are refreshed before the submit. If they cannot be confirmed with your access they are cleared, so the close check runs."
          : policy === "attest"
            ? "Counts are written only by Refresh counts. If not every item can be checked with your access, you may confirm the visible counts with a written attestation."
            : "Counts are written only by Refresh counts, and only when every open point and change request of the case can be checked."
      }
      testId="wb-counts"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13.5px]">
        <span>
          Open points: <strong data-testid="wb-count-items">{c.openItemsCount ?? "not counted yet"}</strong>
        </span>
        <span>
          Open change requests: <strong data-testid="wb-count-crs">{c.openCrCount ?? "not counted yet"}</strong>
        </span>
        <span className="text-ink-3">Held for open items: {c.holdForOpenItems || "not decided yet"}</span>
        <span className="flex-1" />
        <Button size="sm" icon={<RefreshCw size={13} />} disabled={busy} onClick={() => run()} data-testid="wb-counts-refresh">
          {busy ? "Counting…" : "Refresh counts"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-bad">
          {error}
        </p>
      )}
      {res && (
        <div className="space-y-2 text-[13px]" data-testid="wb-counts-result" data-action={res.action} data-confidence={res.confidence}>
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={res.confidence === "complete" ? "ok" : "warn"}>{res.confidence === "complete" ? "complete count" : "partial count"}</Badge>
            {res.counts && (
              <span className="text-ink-2">
                Counted: {Object.entries(res.counts)
                  .map(([k, v]) => `${fieldLabel("CIQ_Case_A00", k)} ${v ?? "not counted"}`)
                  .join(" · ")}
              </span>
            )}
          </p>
          {res.ok && res.action === "written" && <p className="text-ok">Counts written and checked.{res.gate !== undefined ? ` Ready to continue: ${res.gate === "OK" ? "Yes" : "No"}.` : ""}</p>}
          {res.ok && res.action === "attested" && <p className="text-ok">Attestation recorded, then the visible counts were written.{res.gate !== undefined ? ` Ready to continue: ${res.gate === "OK" ? "Yes" : "No"}.` : ""}</p>}
          {res.ok && res.action === "cleared" && <p className="text-ink" data-testid="wb-counts-cleared">{COUNTS_CLEARED_NOTE}</p>}
          {blocked && <p className="text-bad">{res.message}</p>}
          <UnreadList unread={res.unread} />
          {res.warnings?.map((w, i) => (
            <p key={i} className="text-ink-3">
              {w}
            </p>
          ))}
          {!res.ok && !blocked && !onResult && <WriteOutcome result={res} task={task} caseCode={c.caseCode} />}
          {blocked && policy === "attest" && (
            <div className="space-y-2 rounded-lg border border-line p-3">
              <Field label="Attestation (at least 20 characters)" required hint="Recorded in the audit log before the visible counts are written.">
                <TextArea value={attest} onChange={(e) => setAttest(e.target.value)} rows={2} data-testid="wb-counts-attest-text" />
              </Field>
              <Button size="sm" variant="primary" icon={<ShieldCheck size={14} />} disabled={busy || attest.trim().length < 20} onClick={() => run(attest.trim())} data-testid="wb-counts-attest">
                Attest and write
              </Button>
            </div>
          )}
        </div>
      )}
    </SubBlock>
  );
}
