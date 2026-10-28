/**
 * FlowTimeline · FlowBoard · Gate — the SDK-bound halves of Timeline and KanbanBoard.
 *
 * REDESIGNED 2026-08-13 from FlowViews.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — its own framing: "The data-bound halves of the
 * timeline and the board. They take a flow id rather than rows, which means they own four states
 * the presentational versions never see — and those four states are the whole design problem."
 * The page names NO new tokens ("no new tokens — it is all composition"): every state reuses an
 * existing component (Skeleton, NoAccess, Callout, EmptyState); this file's whole job is the
 * ORDER those states are checked in, and what the write path may do to the interface while it
 * waits. See Gate below for the order, and FlowBoard for the write path.
 *
 * WHY THESE ARE SEPARATE FILES from Feed.jsx and Board.jsx, rather than props on them: the
 * presentational versions take data and can be rendered in a catalog with fixtures; these fetch
 * and cannot. Folding a `flowId` prop into the presentational one would mean the catalog page
 * either calls the SDK or renders a permanently-loading component. So the split is
 *
 *     Feed.Timeline / Board.KanbanBoard      take data       — catalog-renderable
 *     FlowTimeline  / FlowBoard              take a flow id  — SDK-bound
 *
 * and the SDK-bound ones compose the presentational ones, never re-implementing their visuals.
 *
 * BOTH ARE FAITHFUL PORTS of legacy components that used the SDK and lost it in the first pass
 * of this rewrite — Timeline.jsx read a flow across Form/Process/Case, and KanbanBoard.jsx both
 * read a board AND called updateItem to move a card between columns. That write path is the one
 * piece of behaviour most at risk of being quietly dropped, so it is preserved here explicitly.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useKf } from "@kissflow/app-ui";
import { History, Kanban } from "lucide-react";

import { Timeline } from "./Feed.jsx";
import { KanbanBoard } from "./Board.jsx";
import { EmptyState, NoAccess, Skeleton } from "./Feedback.jsx";
import { Callout } from "./Callout.jsx";
import { Button, ButtonRow } from "./Buttons.jsx";
import { useFlow, flowHandle, cellText, pickKey } from "./useFlow.js";

// useFlow.js stringifies whatever it catches (`String(e?.message ?? e)` — useFlow.js:87), so no
// structured code survives the round trip: the offline mock throws bare JS errors ("...getItems
// is not a function", node_modules/@kissflow/app-ui/src/offline/mock-kf.ts) and the live SDK
// documents no error-code contract either. A fixed label beats fabricating a per-error one that
// would just be this same string dressed up. If useFlow ever preserves a real code, this is the
// one line to change.
const ERROR_CODE = "FLOW_LOAD_FAILED";

/**
 * A loading placeholder "shaped like what is coming" [SOURCE] — a row is a marker + two text
 * bars (title, then a longer body/meta line), not four equal-width bars: a block of same-length
 * bars reads as a table, and neither FlowTimeline's rows nor FlowBoard's cards are one. Composed
 * from Skeleton's own primitives (`circle`, two single-line calls at different widths) rather
 * than adding a "rows" mode to Skeleton.jsx itself — that primitive is generic and several other
 * pages read its plain shape; this list-row composition is specific to what this file renders.
 */
function GateSkeleton({ rows = 3 }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton circle />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton width="42%" />
            <Skeleton width="85%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Gate — the shared four-state read every SDK-bound view in this file checks, IN THIS ORDER:
 *
 *   1. blocked   NoAccess, tone=neutral   — checked FIRST, before loading. [SOURCE] "A
 *                permission boundary is a fact about the viewer, rather than a wait — showing a
 *                skeleton first promises data that will never arrive."
 *   2. loading   GateSkeleton             — shaped like the row it stands in for, see above.
 *   3. error     a danger Callout with a mono `CODE · resource-id · elapsed-time` detail line and
 *                one Retry action, in an outline-in-currentColor button — Callout.jsx's own
 *                documented action-row convention (its file banner, "ACTIONS ARE NOT A PROP").
 *   4. empty     EmptyState, no tone, icon + title + helper copy.
 *   then Ready: render `children`, the real content.
 *
 * NEW export, per FlowViews.dc.html's own API table — this check used to live unexported and
 * private to this file. Pulling it out means any future data-bound view (ModelChart is this
 * file's own next candidate) reads the same four states in the same order, rather than
 * reimplementing the check with its own bugs.
 *
 * `empty` is `{ title, message, icon }`, not a bare string — EmptyState's own contract, and
 * FlowTimeline's and FlowBoard's copy genuinely differ, so Gate does not invent one default for
 * both callers. `resourceId` (the flow id) feeds the error line; the elapsed-time clock lives
 * here as a ref, reset whenever `state.loading` goes true, rather than in useFlow.js — Gate is
 * the only consumer of the hook that needs a duration, so timing it here leaves useFlow.js's
 * return shape untouched for its other callers (ModelChart, DataTable).
 */
export function Gate({ state, empty, resourceId, children }) {
  const startRef = useRef(null);
  const [elapsedMs, setElapsedMs] = useState(null);

  useEffect(() => {
    if (state.loading) {
      startRef.current = Date.now();
      setElapsedMs(null);
    } else if (state.error && startRef.current != null) {
      setElapsedMs(Date.now() - startRef.current);
    }
  }, [state.loading, state.error]);

  if (state.blocked) return <NoAccess what="this data" />;
  if (state.loading) return <GateSkeleton />;
  if (state.error) {
    return (
      <Callout tone="danger" title="Could not load">
        {state.error}
        <p className="m-0 mt-2 font-mono text-data tabular-nums opacity-75">
          {ERROR_CODE} · {resourceId ?? "—"} · {elapsedMs != null ? `${elapsedMs}ms` : "—"}
        </p>
        <ButtonRow className="mt-3">
          {/* Outline, overridden to currentColor so it stays inside the tinted surface's own
              contrast — Callout.jsx's own action-row example, verbatim (its file banner). */}
          <Button rank="outline" style={{ borderColor: "currentColor", color: "currentColor" }} onClick={state.reload}>
            Retry
          </Button>
        </ButtonRow>
      </Callout>
    );
  }
  if (!state.rows.length) return <EmptyState title={empty.title} message={empty.message} icon={empty.icon} />;
  return children;
}

/**
 * FlowTimeline — a flow's records as dated events.
 *
 * `dateField` and `titleField` are auto-detected when not given, the same way ModelChart picks
 * its group key: a declared column of the right type first, then a plausible row key. Sorted
 * newest first, because a timeline that reads oldest-first buries the thing you opened it for.
 */
export function FlowTimeline({ flowType = "Case", flowId, dateField, titleField, tone = "info", max = 12 }) {
  const state = useFlow(flowType, flowId);

  const items = useMemo(() => {
    const first = state.rows[0];
    const dKey = dateField ?? state.columns.find((c) => /date|created|modified/i.test(c.Type ?? c.Id ?? ""))?.Id
      ?? Object.keys(first ?? {}).find((k) => /date|created|_created_at/i.test(k));
    const tKey = pickKey(titleField, state.columns, first);
    return [...state.rows]
      .sort((a, b) => new Date(b?.[dKey] ?? 0) - new Date(a?.[dKey] ?? 0))
      .slice(0, max)
      .map((r, i) => ({
        key: r._id ?? r.Id ?? i,
        title: cellText(r[tKey]),
        meta: r[dKey] ? new Date(r[dKey]).toLocaleString() : undefined,
        tone,
      }));
  }, [state.rows, state.columns, dateField, titleField, tone, max]);

  return (
    <Gate
      state={state}
      resourceId={flowId}
      empty={{
        title: "No events yet",
        message: "Activity appears here as soon as the first record moves through this flow.",
        icon: <History />,
      }}
    >
      <Timeline items={items} />
    </Gate>
  );
}

/**
 * FlowBoard — a Case board's records, grouped into columns, with cards that can be moved.
 *
 * THE WRITE PATH. Moving a card calls `updateItem(id, { [groupField]: column })` and then
 * reloads, which is exactly what the legacy KanbanBoard did. It is optimistic in neither
 * direction: `columns` is derived only from `state.rows` (below), and `state.rows` does not
 * change until `state.reload()`'s fetch resolves — so a card stays in its ORIGINAL column for the
 * whole time a move is in flight, and only actually moves once the write confirms. [SOURCE] "a
 * board that shows a move which then failed is worse than one that takes a moment." A failed move
 * surfaces as a danger Callout above the board; the card is simply still where it was.
 *
 * SAVING INDICATOR lives on the move control's own row, not on the KanbanBoard tile itself:
 * Board.jsx's card shape (`{id, title, note, owner, priority, progress, files, comments}`) has no
 * pending flag, and this file composes Board.jsx rather than reaching into its private BoardCard
 * — the same kind of gap Board.jsx's own banner names for drag-and-drop ("marked here so the gap
 * stays visible rather than looking like an oversight"). So a card mid-move fades its OWN label
 * in the control row to opacity-50 and shows "saving…" there, which is the one place this file
 * owns a per-item DOM node.
 *
 * Movement is a SELECT rather than drag-and-drop. The legacy board dragged; kit/ has no DnD and
 * adding one is a dependency decision nobody has made. A select is honest, keyboard-accessible,
 * and does the same thing.
 */
export function FlowBoard({
  flowType = "Case",
  flowId,
  groupField = "Status",
  columns: columnNames,
  cardTitle,
  cardMeta,
  ownerField,
  toneOf,
}) {
  const kf = useKf();
  const state = useFlow(flowType, flowId);
  const [moving, setMoving] = useState(null);
  const [moveError, setMoveError] = useState(null);

  const move = async (item, to) => {
    const id = item.id;
    setMoving(id);
    setMoveError(null);
    try {
      await flowHandle(kf, flowType, flowId).updateItem(id, { [groupField]: to });
      state.reload();
    } catch (e) {
      setMoveError(String(e?.message ?? e));
    } finally {
      setMoving(null);
    }
  };

  const columns = useMemo(() => {
    const first = state.rows[0];
    const tKey = pickKey(cardTitle, state.columns, first);
    const names = columnNames ?? [...new Set(state.rows.map((r) => cellText(r[groupField])))].filter((n) => n !== "—");
    return names.map((name) => ({
      key: name,
      label: name,
      tone: toneOf?.(name),
      items: state.rows
        .filter((r) => cellText(r[groupField]) === name)
        .map((r) => ({
          id: r._id ?? r.Id ?? r.id,
          title: cellText(r[tKey]),
          meta: cardMeta ? cellText(r[cardMeta]) : undefined,
          owner: ownerField ? cellText(r[ownerField]) : undefined,
          status: name,
        })),
    }));
  }, [state.rows, state.columns, columnNames, groupField, cardTitle, cardMeta, ownerField, toneOf]);

  return (
    <Gate
      state={state}
      resourceId={flowId}
      empty={{
        title: "No records on this board",
        message: "Cards appear here as soon as records exist for this flow.",
        icon: <Kanban />,
      }}
    >
      <div className="flex flex-col gap-3">
        {moveError && <Callout tone="danger" title="Could not move the card">{moveError}. The card stays where it was until the write confirms.</Callout>}
        <KanbanBoard columns={columns} />
        {/* The move control. Deliberately below the board rather than inside each card: a select
            per card would put a form control inside every tile and change what a board looks
            like. This is the honest minimum until kit/ has a drag primitive. */}
        {columns.some((c) => c.items.length) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Move a card:</span>
            {columns.flatMap((c) => c.items).slice(0, 8).map((it) => {
              const saving = moving === it.id;
              return (
                <label key={it.id} className={"flex items-center gap-1.5" + (saving ? " opacity-50" : "")}>
                  <span className="font-mono text-data text-foreground">{it.title}</span>
                  {saving && <span>saving…</span>}
                  <select
                    className="field-shape bg-field border-field-edge text-foreground"
                    value={it.status}
                    disabled={saving}
                    onChange={(e) => move(it, e.target.value)}
                  >
                    {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </Gate>
  );
}
