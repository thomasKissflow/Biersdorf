// NotesPanel (§8.16; final contract §12.2): NotesPanel({ c: CaseVM; linked?: { kind: string; key: string } }).
// Lists F7 rows of the case (by Case_Item_Id; with `linked`, the ones linked to that item first-class), adds a note
// (create → submit → verify in the create lane, after discarding the user's open F7 draft), and lets ONLY the author
// edit (BR-064). No delete anywhere. Beiersdorf-only: never shared with the supplier.
import { Lock, Pencil } from "lucide-react";
import { useState } from "react";
import { Segmented, TextArea } from "@/components/ui/form";
import { Avatar, Button, Card, CardHeader, Mono } from "@/components/ui/primitives";
import { useFormRows, useWorkbench } from "../../data/hooks";
import type { CaseVM, NoteVM, SaveResult } from "../../data/viewModels";
import { actorDeptOf } from "../../kf/app";
import { errorText } from "../../kf/sdk";
import { WriteOutcome } from "../../ui/WriteOutcome";
import { fmtDateTime } from "../audit/format";
import { ErrorBanner, Notice } from "../audit/kit";
import { buildNoteRow, canEditNote, noteEditPatch, notesFor, NOTE_FLOW } from "./notes";

export interface NotesPanelProps {
  c: CaseVM;
  linked?: { kind: string; key: string };
}

const initials = (s: string) =>
  s
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

function NoteItem({ n, mine, canWrite, onSaved }: { n: NoteVM; mine: boolean; canWrite: boolean; onSaved: () => void }) {
  const { actions, me } = useWorkbench();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.text);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const who = mine ? "You" : n.author?.name || "Unknown author";
  return (
    <li className="flex gap-2.5 px-4 py-3" data-testid={`wb-note-${n.noteKey || n._id}`}>
      <Avatar initials={initials(mine ? me.Name || "You" : n.author?.name || "?")} size={24} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-3">
          <span className="font-medium text-ink-2">{who}</span>
          {n.dept && <span>· {n.dept}</span>}
          <span className="whitespace-nowrap">· {fmtDateTime(n.at || n.createdAt)}</span>
          {n.linkedKey && (
            <span>
              · {n.linkedKind || "linked"} <Mono>{n.linkedKey}</Mono>
            </span>
          )}
          {mine && canWrite && !editing && (
            <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5" icon={<Pencil size={12} />} data-testid={`wb-note-edit-${n._id}`} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Edit note" data-testid={`wb-note-edit-text-${n._id}`} />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={!text.trim() || text.trim() === n.text.trim() || busy}
                data-testid={`wb-note-edit-save-${n._id}`}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await actions.updateFormRow(NOTE_FLOW, n._id, noteEditPatch(text));
                    setResult(r);
                    if (r.ok) {
                      setEditing(false);
                      onSaved();
                    }
                  } catch (e) {
                    setResult({ ok: false, kind: "refused", message: errorText(e) });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setText(n.text);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] whitespace-pre-line text-ink">{n.text}</p>
        )}
        <WriteOutcome result={result} flow={NOTE_FLOW} itemId={n._id} okMessage="Note updated and checked." />
      </div>
    </li>
  );
}

export function NotesPanel({ c, linked }: NotesPanelProps) {
  const { me, caps, actions, notify } = useWorkbench();
  const rows = useFormRows<NoteVM>(NOTE_FLOW, { Case_Item_Id: c._id });
  const canWrite = caps.canEditForm(NOTE_FLOW);
  const [scope, setScope] = useState<"linked" | "case">(linked ? "linked" : "case");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = notesFor(rows.data ?? [], scope === "linked" ? linked : undefined);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const row = buildNoteRow({ c, me, dept: actorDeptOf(caps.roles), text, linked, now: new Date() });
      const r = await actions.createFormRow(NOTE_FLOW, row, "Note_Key");
      if (r.missing?.length) setError(`The note was saved, but Kissflow did not keep: ${r.missing.join(", ")}.`);
      else notify("Note added and checked.", "success");
      setText("");
      rows.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="wb-notes">
      <CardHeader
        title="Internal notes"
        subtitle={
          <span className="inline-flex items-center gap-1">
            <Lock size={12} aria-hidden /> Beiersdorf only: never shared with the supplier
          </span>
        }
        action={
          linked ? (
            <Segmented<"linked" | "case">
              value={scope}
              onChange={setScope}
              options={[
                { value: "linked", label: "This item" },
                { value: "case", label: "Whole case" },
              ]}
            />
          ) : undefined
        }
      />
      {canWrite ? (
        <div className="space-y-2 px-4 py-3">
          <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Align with colleagues on this case" className="min-h-[64px]" aria-label="New internal note" data-testid="wb-note-text" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-3">{linked ? `Linked to ${linked.kind} ${linked.key}` : `Case ${c.caseCode || c._id}`}</span>
            <Button size="sm" variant="secondary" onClick={add} disabled={!text.trim() || busy} data-testid="wb-note-add">
              {busy ? "Adding…" : "Add note"}
            </Button>
          </div>
          {error && (
            <Notice tone="bad" testId="wb-note-error">
              {error}
            </Notice>
          )}
        </div>
      ) : (
        <p className="px-4 py-3 text-[13px] text-ink-3">Your roles can read notes but not add them.</p>
      )}
      <div className="px-4">
        <ErrorBanner error={rows.error} onRetry={rows.reload} testId="wb-notes-error" />
      </div>
      {rows.loading && !rows.data ? (
        <p className="border-t border-line px-4 py-4 text-[13px] text-ink-3" aria-busy="true">
          Loading notes…
        </p>
      ) : rows.quality === "failed" ? (
        <p className="border-t border-line px-4 py-4 text-[13px] text-bad">Notes could not be read.</p>
      ) : list.length === 0 ? (
        <p className="border-t border-line px-4 py-4 text-[13px] text-ink-3" data-testid="wb-notes-empty">
          {scope === "linked" ? "No notes on this item yet." : "No internal notes on this case yet."}
        </p>
      ) : (
        <ol className="divide-y divide-line border-t border-line">
          {list.map((n) => (
            <NoteItem key={n._id} n={n} mine={canEditNote(n, me)} canWrite={canWrite} onSaved={rows.reload} />
          ))}
        </ol>
      )}
    </Card>
  );
}
