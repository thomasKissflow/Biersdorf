// What the screens may offer as working (FE-CLEANUP-APP-INVENTORY, 22 Oct). The prototype does everything it shows; the
// live app (src/app-live) does not yet do some of it, and ProductionContext can't tell the two apart (it is true in the
// live app and in the prototype with the demo notes off). The default is the prototype's behaviour, so the prototype and
// the portal render exactly as before; the live store provides LIVE_FEATURES.
// A screen keeps a feature this version lacks (Thomas's D2 decision): it only stops pretending it worked. The live
// store still refuses the action with "… is not available in this version yet".
import { createContext, useContext } from "react";

export interface LiveFeatures {
  /** A department adds a section to the scope (live: refused, so the window stays open and says so). */
  extendScope: boolean;
  /** "Run reminders now" (live: refused; no demo badge, no "Nothing due" status). */
  reminders: boolean;
  /** Configuration changes. Live since 26 Oct for the Business administrator (app-live write/config.ts persists every
   *  change as CIQ Config Version rows); every other role reads it (canChange also needs config.manage). */
  configEdit: boolean;
  /** A department reopens its own completed review (live: only RMM; the button shows the refusal at once). */
  deptReopen: boolean;
  /** A replacement contact takes over a deactivated contact's open cases (live: refused; the window says so). */
  replaceContact: boolean;
  /** The case's RMES record (header only since 28 Oct: the sheet itself is derived from the case, domain/rmesSheet.ts)
   *  is created the moment Safety or Regulatory gets a review task (prototype). Live, on that reviewer's own next load
   *  (app-live/load.ts runLoadEffects), so the waiting text (the RMES tab's record line and the decision card,
   *  features/review/shared.tsx rmesRecordPending) names that: the decision and the completion need the record.
   *  The reviews start at the supplier's completeness confirmation and the final-release request goes on the last
   *  completion in both (live: I-2 with E-A, E-B; 22 Oct). */
  instantRmes: boolean;
}

/** The prototype: everything works as shown. */
export const PROTOTYPE_FEATURES: LiveFeatures = { extendScope: true, reminders: true, configEdit: true, deptReopen: true, replaceContact: true, instantRmes: true };

/** The live app of this version (configEdit: live since 26 Oct). */
export const LIVE_FEATURES: LiveFeatures = { extendScope: false, reminders: false, configEdit: true, deptReopen: false, replaceContact: false, instantRmes: false };

export const LiveFeaturesContext = createContext<LiveFeatures>(PROTOTYPE_FEATURES);

export const useLiveFeatures = () => useContext(LiveFeaturesContext);
