// The case page (/cases/:id): everything about a CIQ case. RMM acts here (open its review, cancel, reactivate, edit
// the case contacts); every other internal role reads, with a jump to its own review where it has one. Customs and
// Legal open it on their section (K7, K8). The final document tab appears once the case is completed.
// Phones (< 768 px, Thomas 30 Oct): the shell's header has the back arrow, so the "Cases" link goes; the header is
// compact (the title and its badges, two lines of facts: the material no. and the owner are in Overview; the stepper
// one line, its "since …" sentence at the top of Overview), so the tabs come early; they scroll sideways and stay
// stuck under the phone header; the main action (open my review, reactivate, and Download PDF on the final document)
// sits in a bar above the tab bar, while Cancel case and the read-only note stay under the case's facts.
import { ArrowLeft, ArrowUpRight, Ban, CircleCheck, ClipboardCheck, Eye, FileCheck2, FolderX, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Mono, StickyActionBar, Stepper, Tabs, cx } from "@/components/ui";
import { PhaseBadge, WaitingBadge } from "@/components/status";
import { DEPT_LABEL, DEPT_SHORT } from "@/domain/catalog";
import { can } from "@/domain/permissions";
import { PHASE_LABEL, PHASE_STEPS, canReactivate, fmtDate, fmtDateTime, isClosed, isOverdue, rejectionNeedsRmmChoice, relDays, supplierName, userName, waitingOn } from "@/domain/selectors";
import type { CiqCase, Persona, Phase } from "@/domain/types";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useCase, useStore } from "@/store/store";
import { CaseActionDialogs, phaseBeforeCancel, reactivationDeadline, type CaseAction } from "./CaseActions";
import { usePhoneTabs } from "./phone";
import { INFORMED_SECTION, OriginFlag, PHASE_SHORT, canManage, isReviewDept, phaseSince, unresolvedPoints } from "./shared";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { DownloadPdf, FinalDocumentTab } from "./tabs/FinalDocumentTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { NotesTab } from "./tabs/NotesTab";
import { OpenPointsTab } from "./tabs/OpenPointsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { QuestionnaireTab } from "./tabs/QuestionnaireTab";

export type CaseTab = "overview" | "questionnaire" | "points" | "documents" | "notes" | "history" | "final-document";
const TABS: CaseTab[] = ["overview", "questionnaire", "points", "documents", "notes", "history", "final-document"];
/** Old deep links: the Scope tab is part of the Questionnaire, the Audit trail tab is History. */
const LEGACY_TAB: Record<string, CaseTab> = { scope: "questionnaire", audit: "history", document: "final-document" };

export function CaseDetail() {
  const { id } = useParams();
  const c = useCase(id);
  if (!c) {
    return (
      <Card data-testid="case-not-found">
        <EmptyState
          icon={<FolderX size={28} />}
          title="Case not found"
          action={
            <Link to="/cases" className="text-[13px] font-medium text-brand hover:underline">
              Back to the cases
            </Link>
          }
        >
          {id ? `There is no case ${id}, or you have no access to it.` : "No case selected."}
        </EmptyState>
      </Card>
    );
  }
  return <CaseView key={c.id} c={c} />;
}

function CaseView({ c }: { c: CiqCase }) {
  const { state, me } = useStore();
  const [params, setParams] = useSearchParams();
  const [action, setAction] = useState<CaseAction | null>(null);
  const raw = params.get("tab");
  const asked: CaseTab | null = raw ? (LEGACY_TAB[raw] ?? (TABS.includes(raw as CaseTab) ? (raw as CaseTab) : null)) : null;
  const hasDocument = c.phase === "completed" && !!c.finalDocument;
  const tab: CaseTab = asked === "final-document" && !hasDocument ? "overview" : (asked ?? "overview");
  const setTab = (t: CaseTab) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });
  const phone = useIsPhone();
  const tabsUi = usePhoneTabs(phone, tab);

  const sup = state.suppliers.find((s) => s.id === c.supplierId);
  const late = !isClosed(c) && isOverdue(c.dueDate);
  // RMM and the administrator open the supplier's master page (read-only for RMM).
  const supplierLink = can(state, me.id, "supplier.view");

  const tabs: { value: CaseTab; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "questionnaire", label: "Questionnaire" },
    { value: "points", label: "Open points", count: unresolvedPoints(c).length || undefined },
    { value: "documents", label: "Documents", count: c.documents.length || undefined },
    { value: "notes", label: "Internal notes", count: c.internalNotes.length || undefined },
    { value: "history", label: "History" },
    ...(hasDocument ? [{ value: "final-document" as const, label: "Final document" }] : []),
  ];

  // the supplier and the due date, in the header's meta lines
  const supplierLine = (
    <span>
      {supplierLink && sup ? (
        <Link to={`/suppliers/${sup.id}`} className="hover:text-brand hover:underline" data-testid="case-supplier-link">
          {sup.name}
        </Link>
      ) : (
        supplierName(state, c.supplierId)
      )}
      {sup ? <span className="text-ink-3"> · DUNS {sup.duns}</span> : null}
    </span>
  );
  const dueLine = (
    <span>
      Due <span className={late ? "font-medium text-bad" : "text-ink-2"}>{fmtDate(c.dueDate)}</span>
      {!isClosed(c) && <span className={late ? "text-bad" : ""}> ({late ? `overdue, ${relDays(c.dueDate)}` : relDays(c.dueDate)})</span>}
    </span>
  );

  return (
    <div className={phone ? "space-y-3" : "space-y-5"}>
      <div>
        {!phone && (
          <Link to="/cases" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
            <ArrowLeft size={14} /> Cases
          </Link>
        )}
        <div className={cx(!phone && "mt-2", "flex flex-wrap items-start justify-between", phone ? "gap-x-4 gap-y-1" : "gap-4")} data-testid="case-header" data-phase={c.phase}>
          <div className="min-w-0">
            <div className={cx("flex flex-wrap items-center", phone ? "gap-x-2 gap-y-1" : "gap-2.5")}>
              <h1 className={cx(phone ? "text-[19px]" : "text-[22px]", "leading-tight font-semibold tracking-tight text-ink")}>{c.materialName}</h1>
              <PhaseBadge phase={c.phase} />
              <WaitingBadge on={waitingOn(c)} />
              <OriginFlag c={c} />
              {c.priority === "high" && <Badge tone="warn">High priority</Badge>}
            </div>
            {phone ? (
              // a phone: two lines, the case and its supplier, then the due date (the INCI, the DUNS, the material no.
              // and the owner are in Overview's case facts)
              <div className="mt-1 space-y-0.5 text-[13px] text-ink-2" data-testid="case-meta">
                <p className="truncate">
                  <Mono className="text-ink">{c.id}</Mono> ·{" "}
                  {supplierLink && sup ? (
                    <Link to={`/suppliers/${sup.id}`} className="hover:text-brand hover:underline" data-testid="case-supplier-link">
                      {sup.name}
                    </Link>
                  ) : (
                    supplierName(state, c.supplierId)
                  )}
                </p>
                <p>{dueLine}</p>
              </div>
            ) : (
              <>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                  <Mono className="text-ink">{c.id}</Mono>
                  <Sep />
                  <span>{c.inci}</span>
                  <Sep />
                  <span>
                    BDF material no. <Mono className="text-ink">{c.materialNo}</Mono>
                  </span>
                  <Sep />
                  {supplierLine}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                  <span>
                    Owner <span className="text-ink-2">{userName(state, c.ownerId)}</span>
                  </span>
                  <Sep />
                  {dueLine}
                </div>
              </>
            )}
          </div>
          <ActionBar c={c} onAction={setAction} part={phone ? "secondary" : "all"} />
        </div>
      </div>

      <StatusStrip c={c} onOpenDocument={() => setTab("final-document")} />
      <RejectionBanner c={c} onCancel={() => setAction("cancel")} />

      {phone ? (
        // stuck under the phone header, so the tabs stay at hand while a tab's content scrolls (not on a short screen, a
        // phone held sideways, as the action bar)
        <div ref={tabsUi.ref} data-testid="case-tabs" className="sticky top-[var(--app-header-h,0px)] z-20 -mx-4 bg-bg/95 px-4 backdrop-blur [@media(max-height:560px)]:static">
          <Tabs tabs={tabs.map((t) => ({ ...t, label: <span data-testid={`case-tab-${t.value}`}>{t.label}</span> }))} value={tab} onChange={setTab} className={tabsUi.className} />
        </div>
      ) : (
        <Tabs tabs={tabs.map((t) => ({ ...t, label: <span data-testid={`case-tab-${t.value}`}>{t.label}</span> }))} value={tab} onChange={setTab} />
      )}

      {phone && tab === "overview" && !isClosed(c) && <PhaseSince c={c} />}
      {tab === "overview" && <OverviewTab c={c} goTo={setTab} />}
      {tab === "questionnaire" && <QuestionnaireTab c={c} />}
      {tab === "points" && <OpenPointsTab c={c} />}
      {tab === "documents" && <DocumentsTab c={c} />}
      {tab === "notes" && <NotesTab c={c} />}
      {tab === "history" && <HistoryTab c={c} />}
      {tab === "final-document" && hasDocument && <FinalDocumentTab c={c} />}

      <CaseActionDialogs c={c} action={action} onClose={() => setAction(null)} />
      {phone && <PhoneActions c={c} onAction={setAction} document={tab === "final-document" && hasDocument} />}
    </div>
  );
}

/** A phone's bar above the tab bar: the case's main action, or on the final document's tab its Download PDF. Nothing
 *  when the viewer has neither. */
function PhoneActions({ c, onAction, document }: { c: CiqCase; onAction: (a: CaseAction) => void; document: boolean }) {
  const { persona } = useStore();
  const main = primaryActions(c, persona);
  if (document && c.finalDocument)
    return (
      <StickyActionBar>
        <DownloadPdf d={c.finalDocument} bar />
      </StickyActionBar>
    );
  if (!main.review && !main.reactivate) return null;
  return (
    <StickyActionBar>
      <ActionBar c={c} onAction={onAction} part="primary" />
    </StickyActionBar>
  );
}

const Sep = () => (
  <span aria-hidden className="text-line-strong">
    ·
  </span>
);

/** What the viewer can do on the case beside reading it: open its own review, reactivate a cancelled case (RMM). */
function primaryActions(c: CiqCase, persona: Persona) {
  // RMM's own review of the whole CIQ (created at the completeness confirmation, assigned to the case owner), or the
  // department's review track.
  const review = isReviewDept(persona.dept) ? c.reviews.find((r) => r.dept === persona.dept) : undefined;
  return { review, reactivate: canManage(persona) && canReactivate(c) };
}

/** The case's actions. `part` (phones): "secondary" is what stays in the header (Cancel case, the read-only note),
 *  "primary" what goes into the bar above the tab bar (the review, Reactivate); "all" (a big screen) both, as one row. */
function ActionBar({ c, onAction, part = "all" }: { c: CiqCase; onAction: (a: CaseAction) => void; part?: "all" | "primary" | "secondary" }) {
  const { persona } = useStore();
  const nav = useNavigate();
  const myDept = persona.dept;
  const myReview = primaryActions(c, persona).review;
  const primary = part !== "secondary";
  const secondary = part !== "primary";
  const reviewButton = primary && myReview && (
    <Button variant={myReview.status === "completed" || isClosed(c) ? "secondary" : "primary"} icon={<ClipboardCheck size={15} />} onClick={() => nav(`/review/${c.id}`)} data-testid="case-open-review">
      {myReview.status === "completed" ? "My review · completed" : isClosed(c) ? "My review" : "Open my review"}
    </Button>
  );
  if (canManage(persona)) {
    if (part === "secondary" && isClosed(c)) return null;
    if (part === "primary")
      return (
        <>
          {reviewButton}
          {canReactivate(c) && (
            <Button variant="primary" icon={<RotateCcw size={15} />} onClick={() => onAction("reactivate")} data-testid="case-reactivate">
              Reactivate
            </Button>
          )}
        </>
      );
    return (
      <div className={cx("flex flex-wrap items-center gap-2", part === "secondary" && "-ml-3.5")}>
        {!isClosed(c) && (
          <Button variant="ghost" icon={<Ban size={15} />} onClick={() => onAction("cancel")} data-testid="case-cancel" className={part === "secondary" ? "h-11" : undefined}>
            Cancel case
          </Button>
        )}
        {reviewButton}
        {primary && canReactivate(c) && (
          <Button variant="primary" icon={<RotateCcw size={15} />} onClick={() => onAction("reactivate")} data-testid="case-reactivate">
            Reactivate
          </Button>
        )}
      </div>
    );
  }
  const informed = myDept ? INFORMED_SECTION[myDept] : undefined;
  if (part === "primary") return <>{reviewButton}</>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {secondary && (
        <Badge tone="neutral">
          <Eye size={12} aria-hidden /> {informed ? `${DEPT_SHORT[myDept!]} · informed, read-only` : "Read-only"}
        </Badge>
      )}
      {reviewButton}
    </div>
  );
}

/** The live portal's legacy Part 1 phases (basic data, scope check) show as the single supplier step. */
const stepOf = (p: Phase): Phase => (p === "metadata" || p === "scope-check" ? "supplier-input" : p);

/** Stepper for running cases; a clear banner for cancelled and completed ones. */
function StatusStrip({ c, onOpenDocument }: { c: CiqCase; onOpenDocument: () => void }) {
  const { state } = useStore();
  const phone = useIsPhone();
  const steps = PHASE_STEPS;
  const current: Phase = stepOf(c.phase === "cancelled" ? phaseBeforeCancel(c) : c.phase);
  const stepper = (
    <>
      <CompactSteps steps={steps} current={current} done={c.phase === "completed"} />
      <div className="hidden xl:block">
        <Stepper steps={steps.map((p) => ({ key: p, label: PHASE_SHORT[p] }))} current={current} done={c.phase === "completed"} />
      </div>
    </>
  );
  // a phone, a running case: one line and the bar, no card (the "since …" sentence opens Overview)
  if (phone && c.phase !== "cancelled" && c.phase !== "completed")
    return (
      <div data-testid="case-steps">
        <CompactSteps steps={steps} current={current} done={false} phone />
      </div>
    );

  if (c.phase === "cancelled" && c.cancelled) {
    const deadline = reactivationDeadline(c);
    return (
      <Card className="overflow-hidden" data-testid="case-cancelled-banner">
        <div className="flex flex-wrap items-start gap-3 border-b border-line bg-surface-2 px-4 py-3">
          <Ban size={18} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
          <div className="min-w-0 flex-1 text-[13.5px]">
            <p className="font-medium text-ink">
              Cancelled on {fmtDate(c.cancelled.at)} by {userName(state, c.cancelled.by)}
            </p>
            <p className="mt-0.5 text-ink-2">Justification: {c.cancelled.reason}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{canReactivate(c) ? `RMM can reactivate it until ${fmtDate(deadline)}. It stopped at: ${PHASE_LABEL[phaseBeforeCancel(c)]}.` : "The 12-month reactivation window has ended. Start a new case if the CIQ is needed again."}</p>
          </div>
        </div>
        {/* a phone: the banner says where it stopped */}
        {!phone && <div className="px-4 py-3 opacity-60">{stepper}</div>}
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      {/* a phone: the completed banner alone ("All steps done" says nothing more) */}
      {!(phone && c.phase === "completed") && <div className="px-4 py-3.5">{stepper}</div>}
      {c.phase === "completed" ? (
        <div className={cx("flex flex-wrap", phone ? "items-start" : "items-center", "gap-x-3 gap-y-2", !phone && "border-t border-line", "bg-ok-soft px-4 py-2.5 text-[13px] text-ink")} data-testid="case-completed-banner">
          <CircleCheck size={16} className={cx("shrink-0 text-ok", phone && "mt-0.5")} aria-hidden />
          <span className={cx("min-w-0 flex-1", phone && "basis-[calc(100%-28px)]")}>
            Completed {fmtDateTime(phaseSince(c))}. The final document was created automatically at the supplier's final release and sent to {userName(state, c.ownerId)}.
          </span>
          {c.finalDocument && (
            <Button size="sm" variant="secondary" icon={<FileCheck2 size={14} />} onClick={onOpenDocument} data-testid="final-document-open" className={phone ? "ml-7 h-11" : undefined}>
              Open final document
            </Button>
          )}
        </div>
      ) : (
        <div className="border-t border-line px-4 py-2 text-[12.5px] text-ink-3">
          In “{PHASE_LABEL[c.phase]}” since {fmtDateTime(phaseSince(c))} · {waitingOn(c) === "supplier" ? "the next step is with the supplier" : "the next step is with Beiersdorf"}
        </div>
      )}
    </Card>
  );
}

/**
 * A Rejected Safety / Regulatory decision RMM has not answered yet (AS-02): internal, never shown to the supplier. RMM chooses in its
 * review ("Continue to final release" with a note) or cancels the case here.
 */
function RejectionBanner({ c, onCancel }: { c: CiqCase; onCancel: () => void }) {
  const { persona } = useStore();
  const nav = useNavigate();
  const tap = useIsPhone() ? "h-11" : undefined;
  const pending = isClosed(c) ? [] : rejectionNeedsRmmChoice(c);
  if (!pending.length) return null;
  const rmm = canManage(persona);
  const names = pending.map((d) => DEPT_LABEL[d]).join(" and ");
  const inReview = c.phase === "review" && c.reviews.some((r) => r.dept === "RMM");
  return (
    <div role="alert" data-testid="rejection-banner" className="rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-[13px] text-ink">
      <div className="flex flex-wrap items-start gap-3">
        <TriangleAlert size={16} className="mt-px shrink-0 text-bad" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{names} recorded “Rejected”.</p>
          {pending.map((d) => {
            const r = c.reviews.find((x) => x.dept === d);
            return r?.decisionReason ? (
              <p key={d} className="mt-0.5 text-ink-2">
                {DEPT_SHORT[d]}: {r.decisionReason}
              </p>
            ) : null;
          })}
          <p className="mt-1 text-[12.5px] text-ink-2">
            {rmm
              ? "This is internal and never shown to the supplier. Agree with the department: cancel the case with a justification, or continue to the final release with a note when you complete your review."
              : "Internal decision, never shown to the supplier. RMM agrees with the department whether to cancel the case or to continue to the final release."}
          </p>
        </div>
        {rmm && (
          <div className="flex flex-wrap gap-2">
            {inReview && (
              <Button size="sm" variant="secondary" iconRight={<ArrowUpRight size={14} />} onClick={() => nav(`/review/${c.id}`)} data-testid="rejection-review" className={tap}>
                Decide in my review
              </Button>
            )}
            <Button size="sm" variant="danger" icon={<Ban size={14} />} onClick={onCancel} data-testid="rejection-cancel" className={tap}>
              Cancel the case
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A phone: where the case stands since when, and with whom (the stepper's sentence on a big screen), at the top of
 *  Overview. */
function PhaseSince({ c }: { c: CiqCase }) {
  return (
    <p className="text-[12.5px] text-ink-3" data-testid="case-phase-since">
      In “{PHASE_LABEL[c.phase]}” since {fmtDateTime(phaseSince(c))} · {waitingOn(c) === "supplier" ? "the next step is with the supplier" : "the next step is with Beiersdorf"}
    </p>
  );
}

/** Below 1280px the full stepper would truncate its labels, so show "Step n of m" and a segment bar; `phone`: the
 *  line alone (no "next: …"), at every width. */
function CompactSteps({ steps, current, done, phone }: { steps: Phase[]; current: Phase; done: boolean; phone?: boolean }) {
  const idx = Math.max(0, steps.indexOf(current));
  if (phone)
    return (
      <div>
        <p className="text-[13px] text-ink-2">
          <span className="font-semibold text-ink">{`Step ${idx + 1} of ${steps.length}`}</span> · {PHASE_SHORT[current]}
        </p>
        <div className="mt-1.5 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span key={s} className={cx("h-1.5 flex-1 rounded-full", i < idx ? "bg-ok" : i === idx ? "bg-brand" : "bg-surface-3")} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="xl:hidden">
      <p className="text-[13px] text-ink-2">
        <span className="font-semibold text-ink">{done ? `All ${steps.length} steps done` : `Step ${idx + 1} of ${steps.length}`}</span>
        {!done && <> · {PHASE_SHORT[current]}</>}
        {idx < steps.length - 1 && !done && <span className="text-ink-3"> · next: {PHASE_SHORT[steps[idx + 1]]}</span>}
      </p>
      <div className="mt-2 flex gap-1" aria-hidden>
        {steps.map((s, i) => (
          <span key={s} className={cx("h-1.5 flex-1 rounded-full", done || i < idx ? "bg-ok" : i === idx ? "bg-brand" : "bg-surface-3")} />
        ))}
      </div>
    </div>
  );
}
