// One RMES criterion: source traceability, limit check, AI suggestion (confirm or discard) and the
// result + comment (REQ-RMES-005…008, REQ-PROC-024).
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge, Button, DemoNote, Mono, Select, TextArea, useProduction } from "@/components/ui";
import { fmtDateTime, userName } from "@/domain/selectors";
import type { AppState, CiqCase, RmesCriterion, RmesResult } from "@/domain/types";
import { useStore } from "@/store/store";
import { RESULT_LABEL, RESULT_OPTIONS, RESULT_TONE, docLabel, needsComment, secCode } from "./shared";

export function SourceLink({ c, cr, onJump }: { c: CiqCase; cr: RmesCriterion; onJump?: (sectionId: string) => void }) {
  const code = secCode(cr.source.sectionId, c.templateVersion);
  const doc = cr.source.documentId ? c.documents.find((d) => d.id === cr.source.documentId) : undefined;
  const text = (
    <>
      Source: {cr.source.label.includes(code) ? cr.source.label : `${cr.source.label} (${code})`}
      {doc && <> · {docLabel(doc)}</>}
    </>
  );
  if (!onJump) return <span className="text-xs text-ink-3">{text}</span>;
  return (
    <button onClick={() => onJump(cr.source.sectionId)} className="inline-flex items-center gap-1 text-left text-xs text-ink-3 hover:text-brand" title="Open the source section">
      {text}
      <ArrowUpRight size={12} className="shrink-0" />
    </button>
  );
}

function LimitBox({ cr }: { cr: RmesCriterion }) {
  const l = cr.limit!;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
      <span className="text-ink-2">{l.substance}</span>
      <span className="font-semibold text-ink">
        {l.value} {l.unit}
      </span>
      <span className="text-ink-3">
        BDF limit ≤ {l.limit} {l.unit}
      </span>
      <Badge tone={l.pass ? "ok" : "bad"} dot>
        {l.pass ? "Within limit" : "Above limit"}
      </Badge>
      <span className="ml-auto text-xs text-ink-3">
        Limit set <Mono>{l.limitSetVersion}</Mono>
      </span>
    </div>
  );
}

export function RecordedResult({ state, cr }: { state: AppState; cr: RmesCriterion }) {
  if (!cr.result) return <p className="mt-2 text-[13px] text-ink-3">No result recorded yet.</p>;
  return (
    <div className="mt-2 text-[13px]">
      {cr.comment && <p className="whitespace-pre-line text-ink">{cr.comment}</p>}
      <p className="mt-0.5 text-xs text-ink-3">
        {cr.by ? `${userName(state, cr.by)} · ${fmtDateTime(cr.at)}` : "Recorded"}
      </p>
    </div>
  );
}

/** The seeded suggestion carries an "AI suggestion:" prefix; the box already says so. */
const aiText = (t: string) => {
  const x = t.replace(/^AI suggestion:\s*/i, "");
  return x.charAt(0).toUpperCase() + x.slice(1);
};

export function CriterionRow({ c, cr, canEdit, onJump, onAddFinding }: { c: CiqCase; cr: RmesCriterion; canEdit: boolean; onJump: (sectionId: string) => void; onAddFinding: (criterionId: string) => void }) {
  const { state, recordCriterion } = useStore();
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<RmesResult | "">(cr.result ?? "");
  const [comment, setComment] = useState(cr.comment ?? "");
  const [aiState, setAiState] = useState<"shown" | "used" | "discarded">("shown");
  const [err, setErr] = useState<string | null>(null);
  // The MVP has no AI document reading (integrations are manual): the pre-written suggestion shows only with the
  // prototype notes on, as an outlook.
  const production = useProduction();
  const open = canEdit && (!cr.result || editing);
  const findings = c.rmes?.findings.filter((f) => f.criterionId === cr.id) ?? [];

  const save = () => {
    if (!result) return setErr("Choose a result first.");
    if (needsComment(result) && !comment.trim()) return setErr("A comment is required for a negative, implausible or not-applicable result.");
    recordCriterion(c.id, cr.id, result, comment.trim());
    setErr(null);
    setEditing(false);
  };

  return (
    <div className="px-4 py-3.5" data-testid={`criterion-${cr.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">
            <Mono className="mr-2 text-ink-3">{cr.id}</Mono>
            {cr.title}
          </p>
          <div className="mt-0.5">
            <SourceLink c={c} cr={cr} onJump={onJump} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {findings.length > 0 && <Badge tone={findings.some((f) => f.status === "open") ? "bad" : "neutral"}>{findings.length} finding{findings.length === 1 ? "" : "s"}</Badge>}
          {cr.result ? (
            <Badge tone={RESULT_TONE[cr.result]} dot>
              {RESULT_LABEL[cr.result]}
            </Badge>
          ) : (
            <Badge tone="warn">No result</Badge>
          )}
        </div>
      </div>

      {cr.limit && <LimitBox cr={cr} />}

      {open && !production && cr.aiSuggestion && aiState === "shown" && (
        <div className="mt-2 rounded-lg border border-line bg-violet-soft px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet">
              <Sparkles size={13} /> AI suggestion — verify before use
            </span>
            <DemoNote>suggestion text is pre-written</DemoNote>
          </div>
          <p className="mt-1 text-[13px] text-ink">{aiText(cr.aiSuggestion)}</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const t = aiText(cr.aiSuggestion!);
                setComment((prev) => (prev.trim() ? `${prev.trim()}\n${t}` : t));
                setAiState("used");
              }}
            >
              Use in comment
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAiState("discarded")}>
              Discard
            </Button>
          </div>
        </div>
      )}

      {open ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="self-start" data-testid={`criterion-result-${cr.id}`}>
            <Select
              value={result}
              onChange={(e) => {
                setResult(e.target.value as RmesResult | "");
                setErr(null);
              }}
              aria-label={`Result for ${cr.id}`}
            >
              <option value="">Choose a result…</option>
              {RESULT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <TextArea
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setErr(null);
              }}
              placeholder={needsComment(result) ? "Comment (required for this result)" : "Comment (optional)"}
              invalid={!!err && needsComment(result)}
              className="min-h-[60px]"
              aria-label={`Comment for ${cr.id}`}
              data-testid={`criterion-comment-${cr.id}`}
            />
            {aiState === "used" && <p className="mt-1 text-xs text-violet">AI text copied into the comment — check it against the source before saving.</p>}
            {err && <p className="mt-1 text-xs font-medium text-bad">{err}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 sm:justify-end">
            <Button size="sm" variant="ghost" onClick={() => onAddFinding(cr.id)} data-testid={`criterion-finding-${cr.id}`}>
              Add finding
            </Button>
            {cr.result && (
              <Button size="sm" variant="ghost" onClick={() => {
                  setEditing(false);
                  setResult(cr.result ?? "");
                  setComment(cr.comment ?? "");
                  setErr(null);
                }}>
                Cancel
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={save} data-testid={`criterion-save-${cr.id}`}>
              Save result
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <RecordedResult state={state} cr={cr} />
          {canEdit && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => onAddFinding(cr.id)} data-testid={`criterion-finding-${cr.id}`}>
                Add finding
              </Button>
              <Button size="sm" variant="ghost" data-testid={`criterion-change-${cr.id}`} onClick={() => {
                  setEditing(true);
                  setResult(cr.result ?? "");
                  setComment(cr.comment ?? "");
                }}>
                Change result
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
