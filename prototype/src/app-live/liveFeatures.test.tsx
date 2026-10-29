// FE-CLEANUP A14 (22 Oct): a screen the live app shares with the prototype names the live trigger under LIVE_FEATURES
// and keeps the prototype's text under the default. The other A14 texts are checked in the running app
// (scripts/harness-applive.mjs live-waiting-texts, last-review-release). Since 28 Oct the RMES tab always shows the
// sheet (derived from the case); a missing RMES record shows in its record line and on the decision card.
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LIVE_FEATURES, LiveFeaturesContext } from "@/components/liveFeatures";
import { Scenario } from "@/domain/testkit";
import { DecisionCard } from "@/features/review/RmesSide";
import { RmesTab } from "@/features/review/RmesTab";
import { StoreContext, type StoreApi } from "@/store/store";

const sc = new Scenario().toReview();
const noRecord = { ...sc.c, rmes: undefined };
const store = { state: sc.s, rmesDecision: () => {} } as unknown as StoreApi;
const html = (node: ReactNode, live: boolean) =>
  renderToString(<StoreContext.Provider value={store}>{live ? <LiveFeaturesContext.Provider value={LIVE_FEATURES}>{node}</LiveFeaturesContext.Provider> : node}</StoreContext.Provider>).replace(/<!-- -->/g, "");
const LIVE = "The internal RMES record is created the next time a Safety or Regulatory reviewer with a review task on the case opens CIQ Digital.";
const PROTOTYPE = "The internal RMES record is created when Safety or Regulatory gets a review task on the case.";

describe("RMES without an RMES record", () => {
  const tab = <RmesTab c={noRecord} state={sc.s} onJump={() => {}} />;
  const card = <DecisionCard c={noRecord} dept="SAF" track={sc.track("SAF")!} canAct />;

  it("live: the record is created on a Safety or Regulatory reviewer's next opening of CIQ Digital", () => {
    expect(html(tab, true)).toContain(LIVE);
    expect(html(card, true)).toContain(`The decision is recorded once the case&#x27;s RMES record exists. ${LIVE}`);
  });

  it("the prototype keeps its text", () => {
    expect(html(tab, false)).toContain(PROTOTYPE);
    expect(html(card, false)).toContain(PROTOTYPE);
  });

  it("the sheet shows all the same, and the decision can't be recorded yet", () => {
    expect(html(tab, true)).toContain('data-testid="rmes-header-material"');
    expect(html(card, true)).toMatch(/<button[^>]*disabled=""[^>]*data-testid="decision-record"/);
  });
});
