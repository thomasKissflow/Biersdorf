// Sticky completion bar: lists every blocker by name (REQ-PROC-036) and completes the review of RMM or a department
// (REQ-PROC-038), explicitly not a raw-material approval. Safety and Regulatory see their decision here; RMM, when a
// department recorded Rejected, chooses between "Continue to final release" (with a note) and "Cancel the case"
// (with a justification) before it can complete (AS-02). A completed review can be reopened, which withdraws a
// pending final-release request. The single final-release request waits for RMM and every activated department.
// On a phone (< 768 px) the bar is the page's sticky action bar above the tab bar (StickyActionBar): one row with the
// state and the button, whether something blocks or not; opened, the blockers (or, once ready, the decision and what
// completing means: not a raw-material approval, who else must complete) show above it; reopening and RMM's choice
// after a rejection open a full-height sheet (FormWindow) with its actions in the sheet's footer instead of growing the
// bar. A tablet held sideways (<= 560 px tall) gets the desktop bar at the end of the workspace, not sticky.
import { ChevronDown, ChevronUp, CircleCheck, ShieldAlert, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useLiveFeatures } from "@/components/liveFeatures";
import { Button, Field, Segmented, StickyActionBar, TextArea, cx } from "@/components/ui";
import { DEPT_LABEL, DEPT_SHORT } from "@/domain/catalog";
import { can } from "@/domain/permissions";
import { fmtDateTime, isClosed, rejectionNeedsRmmChoice, reviewBlockers } from "@/domain/selectors";
import type { CiqCase, ReviewDept, ReviewTrack } from "@/domain/types";
import { useLayoutMode } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";
import { type BlockerItem, blockerItems, joinNames } from "./lib";
import { FormWindow } from "./phone";
import { completionOf, isRmesDept } from "./shared";

const noteFor = (dept: ReviewDept) =>
  dept === "RMM"
    ? "Confirms RMM reviewed the whole CIQ and no RMM query is open. It is not a raw-material approval."
    : "Confirms your department reviewed everything assigned and no query is open. It is not a raw-material approval.";

/** Who else must complete before the supplier is asked for the final release. Live, the last completion sends it
 *  through E-B, an integration on the review's completion (22 Oct; before, RMM's next load did). */
function waitsForText(c: CiqCase, dept: ReviewDept) {
  const pending = c.reviews.filter((r) => r.dept !== dept && r.status !== "completed").map((r) => DEPT_SHORT[r.dept]);
  return pending.length
    ? `The final-release request goes to the supplier once ${joinNames(pending)} also ${pending.length === 1 ? "completes" : "complete"}.`
    : "You are the last open review: completing sends the final-release request to the supplier and locks its questionnaire.";
}
function WaitsFor({ c, dept }: { c: CiqCase; dept: ReviewDept }) {
  return <p className="text-xs text-ink-3">{waitsForText(c, dept)}</p>;
}

/** Publishes the bar's footprint (height + bottom offset + gap) as --complete-bar on the workspace,
 *  so the sticky section nav ends above it instead of running underneath (collapsed or expanded). */
function useBarFootprint(el: HTMLDivElement | null) {
  useEffect(() => {
    const host = el?.parentElement;
    if (!el || !host) return;
    const set = () => host.style.setProperty("--complete-bar", `${el.offsetHeight + 28}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.removeProperty("--complete-bar");
    };
  }, [el]);
}

/** Safety / Regulatory: the internal decision, recorded on the decision card of the Questionnaire tab (outside the
 *  RMES since 28 Oct); the link goes there and scrolls to it. */
function DecisionLine({ track, dept, canAct, onShowDecision }: { track: ReviewTrack; dept: "SAF" | "REG"; canAct: boolean; onShowDecision: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2 text-[12.5px]" data-testid="complete-decision">
      <span className="text-ink-3">{DEPT_SHORT[dept]} decision:</span>
      {track.decision ? (
        <span className={cx("font-medium", track.decision === "approved" ? "text-ok" : "text-bad")}>{track.decision === "approved" ? "Approved" : "Rejected"}</span>
      ) : (
        <span className="font-medium text-ink-2">not recorded yet</span>
      )}
      {track.decision === "rejected" && track.decisionReason && <span className="min-w-0 text-ink-2">· {track.decisionReason}</span>}
      {canAct && (
        <button type="button" onClick={onShowDecision} className="font-medium text-brand underline-offset-2 hover:underline" data-testid="decision-go">
          {track.decision ? "Change the decision" : "Record the decision"}
        </button>
      )}
      <span className="hidden text-[11.5px] text-ink-3 sm:inline">Internal: the supplier never sees it.</span>
    </div>
  );
}

/** RMM, when Safety or Regulatory recorded Rejected: continue to the final release with a note, or cancel the case.
 *  `inSheet`: a phone's full-height sheet holds it (FormWindow, open while it is shown), its action and Cancel in the
 *  sheet's footer, as every other phone sheet. */
function RejectionChoice({ c, depts, ready, onDone, inSheet }: { c: CiqCase; depts: ReviewDept[]; ready: boolean; onDone: () => void; inSheet?: boolean }) {
  const { state, me, completeReview, cancelCase } = useStore();
  const [choice, setChoice] = useState<"continue" | "cancel">("continue");
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const names = joinNames(depts.map((d) => DEPT_SHORT[d]));
  const mayCancel = can(state, me.id, "case.cancel", c);
  const go = () => {
    setTried(true);
    if (!text.trim()) return;
    if (choice === "continue") {
      if (!ready) return;
      completeReview(c.id, "RMM", { continueNote: text.trim() });
    } else cancelCase(c.id, text.trim());
    onDone();
  };
  const action = (
    <Button variant={choice === "cancel" ? "danger" : "primary"} disabled={choice === "continue" && !ready} onClick={go} data-testid={choice === "continue" ? "rejection-continue" : "rejection-cancel"}>
      {choice === "continue" ? "Continue and complete my review" : "Cancel the case"}
    </Button>
  );
  const body = (
    <div className={inSheet ? "space-y-3" : "max-h-[60vh] space-y-3 overflow-y-auto border-b border-line px-4 py-3 scrollbar-thin"} data-testid="rejection-choice">
      <div className="flex items-start gap-2.5">
        <ShieldAlert size={17} className="mt-0.5 shrink-0 text-bad" />
        <div className="min-w-0 text-[13px] text-ink-2">
          <p className="font-medium text-ink">
            {names} recorded Rejected. Agree with {names} how the case goes on.
          </p>
          <ul className="mt-1 space-y-0.5">
            {depts.map((d) => {
              const tr = c.reviews.find((r) => r.dept === d);
              return (
                <li key={d}>
                  {DEPT_LABEL[d]}: {tr?.decisionReason || "no reason given"}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-ink-3">The decision is internal; the supplier never sees it.</p>
        </div>
      </div>
      <div data-testid="rejection-options">
        <Segmented
          value={choice}
          onChange={(v) => {
            setChoice(v);
            setTried(false);
          }}
          options={[
            { value: "continue", label: "Continue to final release" },
            ...(mayCancel ? [{ value: "cancel" as const, label: "Cancel the case" }] : []),
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-ink" htmlFor="rejection-text">
          {choice === "continue" ? `Note: what you agreed with ${names}` : "Justification for cancelling"}
        </label>
        <TextArea
          id="rejection-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          invalid={tried && !text.trim()}
          className="min-h-[56px]"
          placeholder={choice === "continue" ? "e.g. agreed with Product Safety: restriction documented, release can follow" : "e.g. Product Safety rejected the material; no alternative grade"}
          data-testid="rejection-text"
        />
        {tried && !text.trim() && <p className="text-xs font-medium text-bad">{choice === "continue" ? "Write down what you agreed." : "A justification is required to cancel."}</p>}
        <p className="text-xs text-ink-3">
          {choice === "continue"
            ? ready
              ? "Completes your review with this note in the case history. The final document does not mention the decision."
              : "Resolve the items listed above first; then you can continue."
            : "Cancels the case in every review. The supplier contacts get a neutral e-mail; the case can be reactivated within 12 months."}
        </p>
      </div>
      {!inSheet && <div className="flex justify-end">{action}</div>}
    </div>
  );
  if (!inSheet) return body;
  return (
    <FormWindow
      open
      onClose={onDone}
      title="Choose how to go on"
      subtitle={`${c.id} · ${c.materialName}`}
      dismissible={false}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          {action}
        </>
      }
    >
      {body}
    </FormWindow>
  );
}

function BlockerList({ items, onPick }: { items: BlockerItem[]; onPick: (b: BlockerItem) => void }) {
  return (
    <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto border-b border-line px-4 py-3 text-[13px] scrollbar-thin" data-testid="blocker-list">
      {items.map((b) => (
        <li key={b.key} className="flex items-start gap-2 text-ink-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
          {b.target ? (
            <button type="button" onClick={() => onPick(b)} className="text-left underline-offset-2 hover:text-ink hover:underline">
              {b.text}
            </button>
          ) : (
            <span>{b.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CompletePanel({ c, dept, track, onShowPoint, onShowDecision }: { c: CiqCase; dept: ReviewDept; track: ReviewTrack; onShowPoint: (opId: string) => void; onShowDecision: () => void }) {
  const { state, me, completeReview, reopenReview } = useStore();
  const { deptReopen } = useLiveFeatures();
  const [expanded, setExpanded] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  useBarFootprint(bar);
  const mode = useLayoutMode();
  const phone = mode === "phone";
  // a tablet held sideways: the desktop bar ends the workspace instead of covering a third of the screen
  const short = mode === "tablet" ? "[@media(max-height:560px)]:static" : undefined;
  const closed = isClosed(c);

  if (track.status === "completed") {
    const conf = completionOf(c, dept);
    const cont = track.continueAfterRejection;
    const mayReopen = !closed && (c.phase === "review" || c.phase === "final-release") && can(state, me.id, "review.reopen", c, { dept });
    const pendingRelease = c.phase === "final-release";
    const reopen = () => {
      reopenReview(c.id, dept, reason.trim());
      setReopening(false);
      setReason("");
    };
    if (phone)
      return (
        <StickyActionBar data-testid="complete-bar">
          <div className="flex w-full items-center gap-3">
            <CircleCheck size={18} className="shrink-0 text-ok" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">{DEPT_SHORT[dept]} review completed</p>
              <p className="text-xs text-ink-3">
                {conf ? `${conf.name} · ${fmtDateTime(conf.at)}` : fmtDateTime(track.completedAt)} · not a raw-material approval
              </p>
              {cont && (
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">
                  Continued to the final release despite the Rejected decision of {joinNames(cont.depts.map((d) => DEPT_SHORT[d]))}: {cont.note}
                </p>
              )}
            </div>
            {mayReopen && (
              <Button size="sm" variant="secondary" onClick={() => (dept !== "RMM" && !deptReopen ? reopenReview(c.id, dept, "") : setReopening(true))} aria-label="Reopen my review" className="shrink-0" data-testid="reopen-review">
                Reopen
              </Button>
            )}
          </div>
          <FormWindow
            open={reopening}
            onClose={() => setReopening(false)}
            title="Reopen my review"
            subtitle={`${c.id} · ${c.materialName}`}
            dismissible={!reason.trim()}
            footer={
              <>
                <Button variant="ghost" onClick={() => setReopening(false)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={!reason.trim()} data-testid="reopen-confirm" onClick={reopen}>
                  {pendingRelease ? "Reopen and withdraw the release request" : "Reopen review"}
                </Button>
              </>
            }
          >
            <div className="space-y-3">
              <Field label="Why reopen?" required hint="Recorded in the case history.">
                <TextArea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[96px]" placeholder="e.g. the supplier changed data in my section after I completed" data-testid="reopen-reason" />
              </Field>
              <p className="text-[13px] text-ink-2">
                {pendingRelease
                  ? "The supplier's final-release request is withdrawn, its questionnaire unlocks, and the supplier contacts get an e-mail. The request goes out again once every review has completed."
                  : "The final-release request then waits for you again."}
              </p>
            </div>
          </FormWindow>
        </StickyActionBar>
      );
    return (
      <div ref={setBar} className={cx("sticky bottom-4 z-20 mt-6 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop", short)} data-testid="complete-bar">
        <div className="flex flex-wrap items-center gap-3">
          <CircleCheck size={18} className="shrink-0 text-ok" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">{DEPT_LABEL[dept]} review completed</p>
            <p className="text-xs text-ink-3">
              {conf ? `${conf.name} (${conf.email}) · ${fmtDateTime(conf.at)}` : fmtDateTime(track.completedAt)} · not a raw-material approval
            </p>
            {cont && (
              <p className="mt-0.5 text-xs text-ink-2">
                Continued to the final release despite the Rejected decision of {joinNames(cont.depts.map((d) => DEPT_SHORT[d]))}: {cont.note}
              </p>
            )}
          </div>
          {mayReopen && !reopening && (
            // where only RMM can restart a review (the live app, FE-CLEANUP A8), a department's click gets the refusal at
            // once, before a reason is typed for nothing
            <Button size="sm" variant="ghost" onClick={() => (dept !== "RMM" && !deptReopen ? reopenReview(c.id, dept, "") : setReopening(true))} data-testid="reopen-review">
              Reopen my review
            </Button>
          )}
        </div>
        {reopening && (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <label className="text-xs font-medium text-ink" htmlFor="reopen-reason">
              Why reopen? Recorded in the case history.
            </label>
            <TextArea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[56px]" placeholder="e.g. the supplier changed data in my section after I completed" data-testid="reopen-reason" />
            <p className="text-xs text-ink-3">
              {pendingRelease
                ? "The supplier's final-release request is withdrawn, its questionnaire unlocks, and the supplier contacts get an e-mail. The request goes out again once every review has completed."
                : "The final-release request then waits for you again."}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={!reason.trim()}
                data-testid="reopen-confirm"
                onClick={reopen}
              >
                {pendingRelease ? "Reopen and withdraw the release request" : "Reopen review"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReopening(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (closed) return null;
  const domain = reviewBlockers(c, dept);
  const items = blockerItems(state, c, dept);
  const inReview = c.phase === "review";
  const ready = domain.length === 0 && inReview;
  const rejected = dept === "RMM" ? rejectionNeedsRmmChoice(c) : [];
  const mayComplete = can(state, me.id, "review.complete", c, { dept });
  const pick = (b: BlockerItem) => {
    // a phone folds the list away again, so the point or the decision it shows is not under it
    if (phone) setExpanded(false);
    if (b.target?.kind === "point") onShowPoint(b.target.opId);
    else if (b.target?.kind === "decision") onShowDecision();
  };
  if (phone) {
    // one row, blocked or ready; opened, the blockers (and Safety's / Regulatory's decision line) above it, or once
    // ready the decision line and what completing means
    const above = expanded && !ready && (items.length > 0 || isRmesDept(dept));
    const readyAbove = expanded && ready && rejected.length === 0;
    // ready: "Approved" / "Rejected" where the department records a decision, else "Ready"
    const readyLabel = isRmesDept(dept) && track.decision ? (track.decision === "approved" ? "Approved" : "Rejected") : "Ready";
    return (
      <StickyActionBar data-testid="complete-bar">
        <div className="w-full">
          {above && (
            // edge to edge, as the bar: the blockers and the decision line, each with its border below
            <div className="-mx-4 -mt-2.5 mb-2">
              {items.length > 0 && <BlockerList items={items} onPick={pick} />}
              {isRmesDept(dept) && (
                <DecisionLine
                  track={track}
                  dept={dept}
                  canAct={inReview && mayComplete}
                  onShowDecision={() => {
                    setExpanded(false);
                    onShowDecision();
                  }}
                />
              )}
            </div>
          )}
          {readyAbove && (
            <div className="-mx-4 -mt-2.5 mb-2 border-b border-line" data-testid="complete-ready-details">
              {isRmesDept(dept) && (
                <DecisionLine
                  track={track}
                  dept={dept}
                  canAct={inReview && mayComplete}
                  onShowDecision={() => {
                    setExpanded(false);
                    onShowDecision();
                  }}
                />
              )}
              <div className="space-y-0.5 px-4 py-2.5 text-xs">
                <p className="font-medium text-ink">Nothing blocks your review.</p>
                <p className="text-ink-3">{noteFor(dept)}</p>
                <WaitsFor c={c} dept={dept} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {ready ? <CircleCheck size={18} className="shrink-0 text-ok" /> : <TriangleAlert size={18} className="shrink-0 text-warn" />}
            <div className="min-w-0 flex-1">
              {ready ? (
                <button onClick={() => setExpanded((v) => !v)} className={cx("inline-flex items-center gap-1 text-left text-[14px] font-semibold hover:text-brand", readyLabel === "Rejected" ? "text-bad" : readyLabel === "Approved" ? "text-ok" : "text-ink")} aria-expanded={expanded} data-testid="ready-toggle">
                  <span>
                    {readyLabel}
                    <span className="sr-only">: nothing blocks your review</span>
                  </span>
                  {expanded ? <ChevronDown size={15} className="shrink-0" /> : <ChevronUp size={15} className="shrink-0" />}
                </button>
              ) : (
                <button onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-1 text-left text-[14px] font-semibold text-ink hover:text-brand" aria-expanded={expanded} data-testid="blockers-toggle">
                  <span>
                    {domain.length} item{domain.length === 1 ? "" : "s"} block{domain.length === 1 ? "s" : ""}
                    <span className="sr-only"> your completion</span>
                  </span>
                  {expanded ? <ChevronDown size={15} className="shrink-0" /> : <ChevronUp size={15} className="shrink-0" />}
                </button>
              )}
            </div>
            {rejected.length > 0 ? (
              <Button variant="primary" onClick={() => setChoosing(true)} data-testid="rejection-choose" aria-expanded={choosing}>
                Choose how to go on
              </Button>
            ) : (
              <Button variant="primary" disabled={!ready || !mayComplete} onClick={() => completeReview(c.id, dept)} data-testid="complete-review">
                Complete my review
              </Button>
            )}
            {rejected.length > 0 && (
              <p className="basis-full text-xs font-medium text-bad" data-testid="rejection-flag">
                {joinNames(rejected.map((d) => DEPT_SHORT[d]))} recorded Rejected. Choose how the case goes on before you complete.
              </p>
            )}
          </div>
        </div>
        {rejected.length > 0 && choosing && <RejectionChoice c={c} depts={rejected} ready={ready} onDone={() => setChoosing(false)} inSheet />}
      </StickyActionBar>
    );
  }
  return (
    <div ref={setBar} className={cx("sticky bottom-4 z-20 mt-6 rounded-xl border border-line bg-surface shadow-pop", short)} data-testid="complete-bar">
      {expanded && !ready && items.length > 0 && <BlockerList items={items} onPick={pick} />}
      {isRmesDept(dept) && <DecisionLine track={track} dept={dept} canAct={inReview && mayComplete} onShowDecision={onShowDecision} />}
      {rejected.length > 0 && choosing && <RejectionChoice c={c} depts={rejected} ready={ready} onDone={() => setChoosing(false)} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        {ready ? <CircleCheck size={18} className="shrink-0 text-ok" /> : <TriangleAlert size={18} className="shrink-0 text-warn" />}
        <div className="min-w-0 flex-1">
          {ready ? (
            <p className="text-[14px] font-semibold text-ink">Nothing blocks your review</p>
          ) : (
            <button onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-1 text-left text-[14px] font-semibold text-ink hover:text-brand" aria-expanded={expanded} data-testid="blockers-toggle">
              <span>
                {domain.length} item{domain.length === 1 ? "" : "s"} block{domain.length === 1 ? "s" : ""}
                <span className="hidden sm:inline"> your completion</span>
              </span>
              {expanded ? <ChevronDown size={15} className="shrink-0" /> : <ChevronUp size={15} className="shrink-0" />}
            </button>
          )}
          {rejected.length > 0 && !choosing ? (
            <p className="text-xs font-medium text-bad" data-testid="rejection-flag">
              {joinNames(rejected.map((d) => DEPT_SHORT[d]))} recorded Rejected. Choose how the case goes on before you complete.
            </p>
          ) : (
            <p className={ready ? "text-xs text-ink-3" : "hidden text-xs text-ink-3 sm:block"}>{noteFor(dept)}</p>
          )}
          {ready && rejected.length === 0 && <WaitsFor c={c} dept={dept} />}
        </div>
        {rejected.length > 0 ? (
          <Button variant={choosing ? "ghost" : "primary"} onClick={() => setChoosing((v) => !v)} data-testid="rejection-choose" aria-expanded={choosing}>
            {choosing ? "Hide the choice" : "Choose how to go on"}
          </Button>
        ) : (
          <Button variant="primary" disabled={!ready || !mayComplete} onClick={() => completeReview(c.id, dept)} title={ready ? undefined : "Resolve the listed items first"} data-testid="complete-review">
            Complete my review
          </Button>
        )}
      </div>
    </div>
  );
}
