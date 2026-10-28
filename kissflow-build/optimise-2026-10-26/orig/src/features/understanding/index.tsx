// "Our understanding": the page we open first on the client call to ask "is this how your process
// works?". Process map, assumptions, rule mapping, roles, MVP scope and open inputs; the client call
// view ends with the timeline instead of MVP scope and open inputs.

import { useCallback, useEffect, useState } from "react";
import { ASSUMPTIONS_LIST } from "@/domain/catalog";
import { Assumptions } from "./Assumptions";
import { STEP_ORDER } from "./content";
import { Intro, SectionNav } from "./Intro";
import { ProcessMap } from "./ProcessMap";
import { Roles } from "./Roles";
import { RuleMapping } from "./RuleMapping";
import { MvpScope, Needs } from "./Scope";
import { EMPTY_REVIEW, PageSection, reviewCounts, scrollToId, type AssumptionReview, type Reviews } from "./shared";
import { StepDrawer } from "./StepDrawer";
import { Timeline } from "./Timeline";
import { useCallMode } from "./callMode";

const REVIEWS_KEY = "ciq-understanding-reviews-v1";

function loadReviews(): Reviews {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Reviews) : {};
  } catch {
    return {};
  }
}

export function Understanding() {
  const [step, setStep] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Reviews>(loadReviews);

  // Kept in this browser only, so answers survive a reload (lost answers on 12 Oct).
  useEffect(() => {
    try {
      localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
    } catch {
      /* storage unavailable: answers stay in memory */
    }
  }, [reviews]);
  const [flash, setFlash] = useState<string | null>(null);

  const updateReview = useCallback((id: string, patch: Partial<AssumptionReview>) => {
    setReviews((r) => ({ ...r, [id]: { ...(r[id] ?? EMPTY_REVIEW), ...patch } }));
  }, []);

  const goToAssumption = useCallback((id: string) => {
    setStep(null);
    setFlash(id);
    requestAnimationFrame(() => scrollToId(`assumption-${id}`));
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const { correct } = reviewCounts(reviews, ASSUMPTIONS_LIST.length);
  const call = useCallMode();

  return (
    <div className="space-y-10 pb-10">
      <Intro reviews={reviews} onWalkthrough={() => setStep(STEP_ORDER[0])} />
      <SectionNav assumptionsLabel={`${correct}/${ASSUMPTIONS_LIST.length}`} />

      <PageSection
        id="process"
        title="Process map"
        hint={call ? "Four lanes, eight steps. Click any step to see who acts, the rules and your requirement IDs." : "Four lanes, eight steps. Click any step to see who acts, the rules, your requirement IDs and the assumption behind it."}
      >
        <ProcessMap selected={step} onOpen={setStep} />
      </PageSection>

      {!call && <Assumptions reviews={reviews} onChange={updateReview} onReset={() => setReviews({})} flash={flash} onOpenStep={setStep} />}
      <RuleMapping />
      <Roles />
      {call ? (
        <Timeline />
      ) : (
        <>
          <MvpScope />
          <Needs />
        </>
      )}

      <StepDrawer stepId={step} onClose={() => setStep(null)} onNavigate={setStep} reviews={reviews} onGoToAssumption={goToAssumption} />
    </div>
  );
}
