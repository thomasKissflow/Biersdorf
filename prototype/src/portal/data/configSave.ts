// A metadata answer in the live portal (28 Oct, matrix v0.6): what the supplier's screen saves with it, and the case it
// shows while the save is pending. The prototype's domain does the same in actions.saveConfig.
// - K12: today's questions only (CONFIG_BY_ID); a dropped one (SF-02, SF-08) from an older screen is never written.
//   SF-11 is Beiersdorf's (B-05).
// - M9: a section the answer opens pre-fills its empty questions (FLD-A2-101 with the main INCI). They go in the same
//   save, so they carry the saving contact's stamp; a value still waiting to be saved is never replaced.
import { CONFIG_BY_ID } from "@/domain/catalog";
import { prefillAnswers } from "@/domain/selectors";
import type { AnswerValue, CiqCase, ConfigAnswers, ConfigState } from "@/domain/types";
import type { AnswerPatch } from "./answers";
import { writableAnswer, type CaseExtra } from "./map";
import { liveScope, partOfPhase } from "./scope";

/** The case with (unsaved) metadata answers: the scope follows them at once (B-07); after completeness it only grows
 *  (B-28). */
export function caseWithConfig(c: CiqCase, x: Pick<CaseExtra, "stored" | "manual">, cfg: ConfigState, config: ConfigAnswers): CiqCase {
  const scope = liveScope({ config, ruleSetVersion: c.ruleSetVersion, templateVersion: c.templateVersion, cfg, part: partOfPhase(c.phase), stored: x.stored, manual: x.manual });
  return { ...c, config, scope };
}

/** The patch one metadata answer saves on the request. `c` is the case as shown (pending edits included), `pending`
 *  the answers still waiting to be saved. */
export function configPatch(c: CiqCase | undefined, x: Pick<CaseExtra, "stored" | "manual"> | undefined, cfg: ConfigState, patch: ConfigAnswers, pending: Record<string, AnswerValue> = {}): AnswerPatch {
  const own = Object.fromEntries(Object.entries(patch).filter(([k]) => k in CONFIG_BY_ID && k !== "SF11")) as ConfigAnswers;
  if (!c || !x || !Object.keys(own).length) return { config: own };
  const next = caseWithConfig(c, x, cfg, { ...c.config, ...own, SF11: c.config.SF11 });
  const set = Object.fromEntries(Object.entries(prefillAnswers(next, cfg)).filter(([f]) => !(f in pending) && writableAnswer(f, c.templateVersion, cfg)));
  return Object.keys(set).length ? { config: own, set } : { config: own };
}
