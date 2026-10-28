// FE-CLEANUP A14 (22 Oct): a screen the live app shares with the prototype names the live trigger under LIVE_FEATURES
// and keeps the prototype's text under the default. The other A14 texts are checked in the running app
// (scripts/harness-applive.mjs live-waiting-texts, last-review-release).
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LIVE_FEATURES, LiveFeaturesContext } from "@/components/liveFeatures";
import type { CiqCase, ReviewTrack } from "@/domain/types";
import { RmesTab } from "@/features/review/RmesTab";

const html = (node: ReactNode, live: boolean) => renderToString(live ? <LiveFeaturesContext.Provider value={LIVE_FEATURES}>{node}</LiveFeaturesContext.Provider> : node).replace(/<!-- -->/g, "");

describe("RmesTab without an RMES record", () => {
  const tab = <RmesTab c={{ id: "ZZT-0003" } as CiqCase} dept="SAF" track={{ dept: "SAF", status: "in-review" } as ReviewTrack} canAct={false} onJump={() => {}} onAddFinding={() => {}} onAskFinding={() => {}} />;

  it("live: the record is created on a Safety or Regulatory reviewer's next opening of CIQ Digital", () => {
    expect(html(tab, true)).toContain("The internal RMES record is created the next time a Safety or Regulatory reviewer with a review task on the case opens CIQ Digital.");
  });

  it("the prototype keeps its text", () => {
    expect(html(tab, false)).toContain("The internal RMES record is created when Safety or Regulatory gets a review task on the case.");
  });
});
