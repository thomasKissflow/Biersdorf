// One CIQ request as the supplier sees it: header, the 3-step stepper (Questionnaire · Beiersdorf review · Final
// release) and a body per phase (spec §4):
// - supplier-input: completeness bar and modal, the navigator with GEN and the metadata questions first, live sections;
// - review: banner, Questions for you, the questionnaire (still editable);
// - final-release: the release card (disabled with reasons while blocked), questions, and the questionnaire read-only:
//   it is locked while Beiersdorf waits for the final release (Thomas, 15 Oct; a reopened review unlocks it);
// - completed: release banner, the supplier's own confirmations, the question history, the frozen questionnaire and
//   "Report a change";
// - cancelled: a neutral banner and the questionnaire read-only.
// The live portal (old flow) adds the basic questions (phase metadata) and the wait for Beiersdorf's scope release
// (phase scope-check) before the questionnaire, and keeps its closed view.
// Phones (Thomas, 30 Oct): the header's back arrow replaces the "My requests" link; the questionnaire's section picker
// and the sticky completeness and release actions are the questionnaire's and ReleaseActions' (the page's last child).
import { ArrowLeft, Mail, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, Stepper, cx } from "@/components/ui";
import { RELEASE_LOCKED_TEXT } from "@/domain/permissions";
import { fmtDate, questionnaireLocked, userById } from "@/domain/selectors";
import type { CiqCase } from "@/domain/types";
import { useIsLivePortal } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { AnswerDrawer } from "./AnswerDrawer";
import { isClosed, isLiveScope, releasedAt, stepKey, submittedAt, supplierStatus, supplierSteps, useSupplierScope } from "./lib";
import { MetadataStep } from "./MetadataStep";
import { CaseRef, DueText, StatusPill } from "./parts";
import { ChangeReports, ClosedBanner, FinalDocumentCard, FinalReleaseView, QuestionsForYou, ReleaseActions, ReleaseRecord, ReportChangeModal, ReviewBanner, ScopeCheckView } from "./PhaseViews";
import { useIsPhone } from "./phone";
import { Questionnaire } from "./Questionnaire";

export function SupplierCase() {
  const { id } = useParams();
  const { cases } = useSupplierScope();
  const nav = useNavigate();
  const livePortal = useIsLivePortal();
  const c = cases.find((x) => x.id === id);
  if (!c)
    return (
      <Card data-testid="request-not-available">
        <EmptyState
          icon={<SearchX size={28} />}
          title="This request is not available"
          action={
            <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => nav("/portal")}>
              Back to my requests
            </Button>
          }
        >
          {livePortal ? "It does not exist or belongs to another company. You only see the requests Beiersdorf sent to your company." : "It does not exist, or you are not a named contact on it. You only see the requests Beiersdorf sent to you."}
        </EmptyState>
      </Card>
    );
  return <CaseView c={c} />;
}

function CaseView({ c }: { c: CiqCase }) {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const [reporting, setReporting] = useState(false);
  // the final-release declaration: the card opens it, and on a phone the sticky bar does
  const releasing = useState(false);
  // closed again when the request leaves the final release (a live reload, a reopened review), so it never opens by
  // itself when the request comes back to it
  const setReleasing = releasing[1];
  useEffect(() => {
    if (c.phase !== "final-release") setReleasing(false);
  }, [c.phase, setReleasing]);
  const phone = useIsPhone();
  const status = supplierStatus(c);
  const live = isLiveScope(c);
  // ?q= from the portal's own links, ?op= from the e-mail links (spec §2): both open the question.
  const q = params.get("q") ?? params.get("op");
  const openQ = (opId: string) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete("op");
      n.set("q", opId);
      return n;
    });
  const closeQ = () =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("q");
        n.delete("op");
        return n;
      },
      { replace: true },
    );

  const hasScope = c.scope.length > 0;
  const owner = userById(state, c.ownerId);

  return (
    <div className="space-y-6" data-testid="supplier-request" data-phase={c.phase}>
      <div>
        {/* phone: the header's back arrow */}
        {!phone && (
          <Link to="/portal" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
            <ArrowLeft size={14} /> My requests
          </Link>
        )}
        <div className={cx(!phone && "mt-2", "flex flex-wrap items-start justify-between gap-4")}>
          <div className="min-w-0">
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">{c.materialName}</h1>
            {c.inci && <p className="mt-0.5 text-[13.5px] text-ink-2">INCI: {c.inci}</p>}
            <CaseRef c={c} className="mt-1.5" />
            {owner && isLiveScope(c) && (
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-3">
                <Mail size={12} className="shrink-0" />
                <span>Your Beiersdorf contact:</span>
                <span className="font-medium text-ink-2">{owner.name}</span>
                {owner.email && (phone ? <span className="basis-full pl-[18px] select-all">{owner.email}</span> : <span className="select-all">· {owner.email}</span>)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <StatusPill status={status} />
            {status.due && !isClosed(c) && <DueText due={status.due} />}
          </div>
        </div>
      </div>

      <Card className="px-5 py-4">
        <Stepper steps={supplierSteps(c)} current={stepKey(c)} done={c.phase === "completed"} />
      </Card>

      {/* Live portal only (old flow): basic data still open. The prototype asks these questions inside the questionnaire. */}
      {c.phase === "metadata" && <MetadataStep c={c} />}
      {/* Live portal only (old flow): basic data sent, waiting for Beiersdorf's scope release. */}
      {c.phase === "scope-check" && <ScopeCheckView c={c} />}
      {c.phase === "supplier-input" && <Questionnaire c={c} locked={false} />}

      {c.phase === "review" && (
        <>
          <ReviewBanner c={c} />
          <QuestionsForYou c={c} onOpen={openQ} />
          {live && <QuestionnaireHeading c={c} />}
          <Questionnaire c={c} locked={false} confirmable={false} />
        </>
      )}

      {/* Locked while Beiersdorf waits for the final release (Thomas, 15 Oct): read-only, giving the release stays possible. */}
      {c.phase === "final-release" && (
        <>
          <FinalReleaseView c={c} onOpen={openQ} release={releasing} />
          <QuestionsForYou c={c} onOpen={openQ} />
          {live ? <QuestionnaireHeading c={c} /> : <LegacyHeading locked />}
          <Questionnaire c={c} locked confirmable={false} />
        </>
      )}

      {/* Live-scope requests: the release record, the question history, "Report a change" and the frozen questionnaire. */}
      {live && c.phase === "completed" && (
        <>
          <ClosedBanner c={c} onReportChange={() => setReporting(true)} />
          <FinalDocumentCard c={c} />
          <ReleaseRecord c={c} />
          <ChangeReports c={c} />
          <QuestionsForYou c={c} onOpen={openQ} readOnly />
          {hasScope && (
            <>
              <QuestionnaireHeading c={c} />
              <Questionnaire c={c} locked />
            </>
          )}
          <ReportChangeModal c={c} open={reporting} onClose={() => setReporting(false)} />
        </>
      )}

      {live && c.phase === "cancelled" && (
        <>
          <ClosedBanner c={c} />
          {hasScope && (
            <>
              <QuestionnaireHeading c={c} />
              <Questionnaire c={c} locked />
            </>
          )}
        </>
      )}

      {!live && isClosed(c) && (
        <>
          <ClosedBanner c={c} />
          {hasScope && (
            <>
              {/* The live portal cannot list every completeness confirmation, so it always shows the submitted wording. */}
              <LegacyHeading />
              <Questionnaire c={c} locked />
            </>
          )}
        </>
      )}

      <AnswerDrawer caseId={c.id} opId={q} onClose={closeQ} />
      {c.phase === "final-release" && <ReleaseActions c={c} onRelease={() => releasing[1](true)} />}
    </div>
  );
}

/** Live-scope requests: the questionnaire's heading says exactly whether it can still be changed. */
function QuestionnaireHeading({ c }: { c: CiqCase }) {
  const [title, text] =
    c.phase === "review"
      ? ["Your questionnaire", "You can still correct data and add documents until Beiersdorf requests your final release. Beiersdorf's reviewers are told about each change and look at it again. A changed metadata answer can only add sections now."]
      : c.phase === "final-release"
        ? ["Your questionnaire (locked)", RELEASE_LOCKED_TEXT]
        : c.phase === "completed"
          ? ["Your released questionnaire", `Frozen with your final release on ${fmtDate(releasedAt(c))}. Nothing can be changed any more; use “Report a change” if something has changed since.`]
          : ["Your questionnaire", submittedAt(c) ? "Read-only. This request was withdrawn by Beiersdorf after you confirmed completeness." : "Read-only. This request was withdrawn by Beiersdorf before completeness was confirmed."];
  return (
    <div className="pt-2" data-testid="questionnaire-heading" data-locked={questionnaireLocked(c) ? "true" : "false"}>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="text-[13px] text-ink-3">{text}</p>
    </div>
  );
}

/** Live portal (old flow): the earlier headings. "Read-only" only over a locked questionnaire. */
function LegacyHeading({ locked = false }: { locked?: boolean }) {
  return (
    <div className="pt-2">
      <h2 className="text-base font-semibold text-ink">Your submitted questionnaire</h2>
      <p className="text-[13px] text-ink-3">{locked ? RELEASE_LOCKED_TEXT : "Read-only. Shown as submitted to Beiersdorf."}</p>
    </div>
  );
}
